import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { equals } from "../../../../base/common/objects.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Extensions } from "../../common/configurationRegistry.js";
import { DefaultConfiguration } from "../../common/configurations.js";
import { NullLogService } from "../../../log/common/log.js";
import { Registry } from "../../../registry/common/platform.js";
suite("DefaultConfiguration", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationRegistry = Registry.as(Extensions.Configuration);
  setup(() => reset());
  teardown(() => reset());
  function reset() {
    configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
    configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
  }
  test("Test registering a property before initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const actual = await testObject.initialize();
    assert.strictEqual(actual.getValue("a"), false);
  });
  test("Test registering a property and do not initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    assert.strictEqual(testObject.configurationModel.getValue("a"), void 0);
  });
  test("Test registering a property after initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "defaultConfiguration.testSetting1": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const { defaults: actual, properties } = await promise;
    assert.strictEqual(actual.getValue("defaultConfiguration.testSetting1"), false);
    assert.deepStrictEqual(properties, ["defaultConfiguration.testSetting1"]);
  });
  test("Test registering nested properties", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a.b": {
          "description": "1",
          "type": "object",
          "default": {}
        },
        "a.b.c": {
          "description": "2",
          "type": "object",
          "default": "2"
        }
      }
    });
    const actual = await testObject.initialize();
    assert.ok(equals(actual.getValue("a"), { b: { c: "2" } }));
    assert.ok(equals(actual.contents, { "a": { b: { c: "2" } } }));
    assert.deepStrictEqual(actual.keys.sort(), ["a.b", "a.b.c"]);
  });
  test("Test registering the same property again", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": true
        }
      }
    });
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    });
    const actual = await testObject.initialize();
    assert.strictEqual(true, actual.getValue("a"));
  });
  test("Test registering an override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = await testObject.initialize();
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test registering a normal property and override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = await testObject.initialize();
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test normal property is registered after override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    await testObject.initialize();
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    const { defaults: actual, properties } = await promise;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
    assert.deepStrictEqual(properties, ["b"]);
  });
  test("Test override identifier is registered after property", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    await testObject.initialize();
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const { defaults: actual, properties } = await promise;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
    assert.deepStrictEqual(properties, ["[a]"]);
  });
  test("Test register override identifier and property after initialize", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    await testObject.initialize();
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{
      overrides: {
        "[a]": {
          "b": true
        }
      }
    }]);
    const actual = testObject.configurationModel;
    assert.deepStrictEqual(actual.getValue("b"), false);
    assert.ok(equals(actual.getValue("[a]"), { "b": true }));
    assert.ok(equals(actual.contents, { "b": false, "[a]": { "b": true } }));
    assert.ok(equals(actual.overrides, [{ contents: { "b": true }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(actual.keys.sort(), ["[a]", "b"]);
    assert.strictEqual(actual.getOverrideValue("b", "a"), true);
  });
  test("Test deregistering a property", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    const node = {
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "a": {
          "description": "a",
          "type": "boolean",
          "default": false
        }
      }
    };
    configurationRegistry.registerConfiguration(node);
    await testObject.initialize();
    configurationRegistry.deregisterConfigurations([node]);
    const { defaults: actual, properties } = await promise;
    assert.strictEqual(actual.getValue("a"), void 0);
    assert.ok(equals(actual.contents, {}));
    assert.deepStrictEqual(actual.keys, []);
    assert.deepStrictEqual(properties, ["a"]);
  });
  test("Test deregistering an override identifier", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "a",
      "order": 1,
      "title": "a",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "boolean",
          "default": false
        }
      }
    });
    const node = {
      overrides: {
        "[a]": {
          "b": true
        }
      }
    };
    configurationRegistry.registerDefaultConfigurations([node]);
    await testObject.initialize();
    configurationRegistry.deregisterDefaultConfigurations([node]);
    assert.deepStrictEqual(testObject.configurationModel.getValue("[a]"), void 0);
    assert.ok(equals(testObject.configurationModel.contents, { "b": false }));
    assert.ok(equals(testObject.configurationModel.overrides, []));
    assert.deepStrictEqual(testObject.configurationModel.keys, ["b"]);
    assert.strictEqual(testObject.configurationModel.getOverrideValue("b", "a"), void 0);
  });
  test("Test deregistering a merged language object setting", async () => {
    const testObject = disposables.add(new DefaultConfiguration(new NullLogService()));
    configurationRegistry.registerConfiguration({
      "id": "b",
      "order": 1,
      "title": "b",
      "type": "object",
      "properties": {
        "b": {
          "description": "b",
          "type": "object",
          "default": {}
        }
      }
    });
    const node1 = {
      overrides: {
        "[a]": {
          "b": {
            "aa": "1",
            "bb": "2"
          }
        }
      },
      source: { id: "source1", displayName: "source1" }
    };
    const node2 = {
      overrides: {
        "[a]": {
          "b": {
            "bb": "20",
            "cc": "30"
          }
        }
      },
      source: { id: "source2", displayName: "source2" }
    };
    configurationRegistry.registerDefaultConfigurations([node1]);
    configurationRegistry.registerDefaultConfigurations([node2]);
    await testObject.initialize();
    configurationRegistry.deregisterDefaultConfigurations([node1]);
    assert.ok(equals(testObject.configurationModel.getValue("[a]"), { "b": { "bb": "20", "cc": "30" } }));
    assert.ok(equals(testObject.configurationModel.contents, { "[a]": { "b": { "bb": "20", "cc": "30" } }, "b": {} }));
    assert.ok(equals(testObject.configurationModel.overrides, [{ contents: { "b": { "bb": "20", "cc": "30" } }, identifiers: ["a"], keys: ["b"] }]));
    assert.deepStrictEqual(testObject.configurationModel.keys.sort(), ["[a]", "b"]);
    assert.ok(equals(testObject.configurationModel.getOverrideValue("b", "a"), { "bb": "20", "cc": "30" }));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbnN1aXRlKCdEZWZhdWx0Q29uZmlndXJhdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5cdHNldHVwKCgpID0+IHJlc2V0KCkpO1xuXHR0ZWFyZG93bigoKSA9PiByZXNldCgpKTtcblxuXHRmdW5jdGlvbiByZXNldCgpIHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9ucygpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UmVnaXN0ZXJlZERlZmF1bHRDb25maWd1cmF0aW9ucygpKTtcblx0fVxuXG5cdHRlc3QoJ1Rlc3QgcmVnaXN0ZXJpbmcgYSBwcm9wZXJ0eSBiZWZvcmUgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2EnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdhJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCByZWdpc3RlcmluZyBhIHByb3BlcnR5IGFuZCBkbyBub3QgaW5pdGlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2EnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ2EnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCByZWdpc3RlcmluZyBhIHByb3BlcnR5IGFmdGVyIGluaXRpYWxpemUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdkZWZhdWx0Q29uZmlndXJhdGlvbi50ZXN0U2V0dGluZzEnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2EnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB7IGRlZmF1bHRzOiBhY3R1YWwsIHByb3BlcnRpZXMgfSA9IGF3YWl0IHByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgnZGVmYXVsdENvbmZpZ3VyYXRpb24udGVzdFNldHRpbmcxJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3BlcnRpZXMsIFsnZGVmYXVsdENvbmZpZ3VyYXRpb24udGVzdFNldHRpbmcxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIG5lc3RlZCBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYS5iJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICcxJyxcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdkZWZhdWx0Jzoge30sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhLmIuYyc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnMicsXG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICcyJyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5nZXRWYWx1ZSgnYScpLCB7IGI6IHsgYzogJzInIH0gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmNvbnRlbnRzLCB7ICdhJzogeyBiOiB7IGM6ICcyJyB9IH0gfSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmtleXMuc29ydCgpLCBbJ2EuYicsICdhLmIuYyddKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCByZWdpc3RlcmluZyB0aGUgc2FtZSBwcm9wZXJ0eSBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2EnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2EnLFxuXHRcdFx0J29yZGVyJzogMSxcblx0XHRcdCd0aXRsZSc6ICdhJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ2EnLFxuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgYWN0dWFsLmdldFZhbHVlKCdhJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIGFuIG92ZXJyaWRlIGlkZW50aWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3tcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmdldFZhbHVlKCdbYV0nKSwgeyAnYic6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmNvbnRlbnRzLCB7ICdbYV0nOiB7ICdiJzogdHJ1ZSB9IH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5vdmVycmlkZXMsIFt7IGNvbnRlbnRzOiB7ICdiJzogdHJ1ZSB9LCBpZGVudGlmaWVyczogWydhJ10sIGtleXM6IFsnYiddIH1dKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cy5zb3J0KCksIFsnW2FdJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyaW5nIGEgbm9ybWFsIHByb3BlcnR5IGFuZCBvdmVycmlkZSBpZGVudGlmaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYic6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYicsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7XG5cdFx0XHRvdmVycmlkZXM6IHtcblx0XHRcdFx0J1thXSc6IHtcblx0XHRcdFx0XHQnYic6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdiJyksIGZhbHNlKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5nZXRWYWx1ZSgnW2FdJyksIHsgJ2InOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5jb250ZW50cywgeyAnYic6IGZhbHNlLCAnW2FdJzogeyAnYic6IHRydWUgfSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwub3ZlcnJpZGVzLCBbeyBjb250ZW50czogeyAnYic6IHRydWUgfSwgaWRlbnRpZmllcnM6IFsnYSddLCBrZXlzOiBbJ2InXSB9XSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmtleXMuc29ydCgpLCBbJ1thXScsICdiJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IG5vcm1hbCBwcm9wZXJ0eSBpcyByZWdpc3RlcmVkIGFmdGVyIG92ZXJyaWRlIGlkZW50aWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3tcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fV0pO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB7IGRlZmF1bHRzOiBhY3R1YWwsIHByb3BlcnRpZXMgfSA9IGF3YWl0IHByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0VmFsdWUoJ2InKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmdldFZhbHVlKCdbYV0nKSwgeyAnYic6IHRydWUgfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmNvbnRlbnRzLCB7ICdiJzogZmFsc2UsICdbYV0nOiB7ICdiJzogdHJ1ZSB9IH0pKTtcblx0XHRhc3NlcnQub2soZXF1YWxzKGFjdHVhbC5vdmVycmlkZXMsIFt7IGNvbnRlbnRzOiB7ICdiJzogdHJ1ZSB9LCBpZGVudGlmaWVyczogWydhJ10sIGtleXM6IFsnYiddIH1dKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cy5zb3J0KCksIFsnW2FdJywgJ2InXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRPdmVycmlkZVZhbHVlKCdiJywgJ2EnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9wZXJ0aWVzLCBbJ2InXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3Qgb3ZlcnJpZGUgaWRlbnRpZmllciBpcyByZWdpc3RlcmVkIGFmdGVyIHByb3BlcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYic6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYicsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7XG5cdFx0XHRvdmVycmlkZXM6IHtcblx0XHRcdFx0J1thXSc6IHtcblx0XHRcdFx0XHQnYic6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IHsgZGVmYXVsdHM6IGFjdHVhbCwgcHJvcGVydGllcyB9ID0gYXdhaXQgcHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgnYicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuZ2V0VmFsdWUoJ1thXScpLCB7ICdiJzogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHsgJ2InOiBmYWxzZSwgJ1thXSc6IHsgJ2InOiB0cnVlIH0gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLm92ZXJyaWRlcywgW3sgY29udGVudHM6IHsgJ2InOiB0cnVlIH0sIGlkZW50aWZpZXJzOiBbJ2EnXSwga2V5czogWydiJ10gfV0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5rZXlzLnNvcnQoKSwgWydbYV0nLCAnYiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldE92ZXJyaWRlVmFsdWUoJ2InLCAnYScpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3BlcnRpZXMsIFsnW2FdJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHJlZ2lzdGVyIG92ZXJyaWRlIGlkZW50aWZpZXIgYW5kIHByb3BlcnR5IGFmdGVyIGluaXRpYWxpemUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYic6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYicsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbe1xuXHRcdFx0b3ZlcnJpZGVzOiB7XG5cdFx0XHRcdCdbYV0nOiB7XG5cdFx0XHRcdFx0J2InOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XSk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgnYicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuZ2V0VmFsdWUoJ1thXScpLCB7ICdiJzogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyhhY3R1YWwuY29udGVudHMsIHsgJ2InOiBmYWxzZSwgJ1thXSc6IHsgJ2InOiB0cnVlIH0gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLm92ZXJyaWRlcywgW3sgY29udGVudHM6IHsgJ2InOiB0cnVlIH0sIGlkZW50aWZpZXJzOiBbJ2EnXSwga2V5czogWydiJ10gfV0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5rZXlzLnNvcnQoKSwgWydbYV0nLCAnYiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldE92ZXJyaWRlVmFsdWUoJ2InLCAnYScpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBkZXJlZ2lzdGVyaW5nIGEgcHJvcGVydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBub2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHQnaWQnOiAnYScsXG5cdFx0XHQnb3JkZXInOiAxLFxuXHRcdFx0J3RpdGxlJzogJ2EnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiAnYScsXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbihub2RlKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtub2RlXSk7XG5cblx0XHRjb25zdCB7IGRlZmF1bHRzOiBhY3R1YWwsIHByb3BlcnRpZXMgfSA9IGF3YWl0IHByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgnYScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhlcXVhbHMoYWN0dWFsLmNvbnRlbnRzLCB7fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmtleXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3BlcnRpZXMsIFsnYSddKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCBkZXJlZ2lzdGVyaW5nIGFuIG92ZXJyaWRlIGlkZW50aWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdhJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYScsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3Qgbm9kZSA9IHtcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW25vZGVdKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbbm9kZV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ1thXScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhlcXVhbHModGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuY29udGVudHMsIHsgJ2InOiBmYWxzZSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5vdmVycmlkZXMsIFtdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5rZXlzLCBbJ2InXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmdldE92ZXJyaWRlVmFsdWUoJ2InLCAnYScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IGRlcmVnaXN0ZXJpbmcgYSBtZXJnZWQgbGFuZ3VhZ2Ugb2JqZWN0IHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdiJyxcblx0XHRcdCdvcmRlcic6IDEsXG5cdFx0XHQndGl0bGUnOiAnYicsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdiJyxcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdkZWZhdWx0Jzoge30sXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBub2RlMSA9IHtcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdFx0J2FhJzogJzEnLFxuXHRcdFx0XHRcdFx0J2JiJzogJzInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c291cmNlOiB7IGlkOiAnc291cmNlMScsIGRpc3BsYXlOYW1lOiAnc291cmNlMScgfVxuXHRcdH07XG5cblx0XHRjb25zdCBub2RlMiA9IHtcblx0XHRcdG92ZXJyaWRlczoge1xuXHRcdFx0XHQnW2FdJzoge1xuXHRcdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdFx0J2JiJzogJzIwJyxcblx0XHRcdFx0XHRcdCdjYyc6ICczMCdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRzb3VyY2U6IHsgaWQ6ICdzb3VyY2UyJywgZGlzcGxheU5hbWU6ICdzb3VyY2UyJyB9XG5cdFx0fTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW25vZGUxXSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFtub2RlMl0pO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW25vZGUxXSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnW2FdJyksIHsgJ2InOiB7ICdiYic6ICcyMCcsICdjYyc6ICczMCcgfSB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGVxdWFscyh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5jb250ZW50cywgeyAnW2FdJzogeyAnYic6IHsgJ2JiJzogJzIwJywgJ2NjJzogJzMwJyB9IH0sICdiJzoge30gfSkpO1xuXHRcdGFzc2VydC5vayhlcXVhbHModGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwub3ZlcnJpZGVzLCBbeyBjb250ZW50czogeyAnYic6IHsgJ2JiJzogJzIwJywgJ2NjJzogJzMwJyB9IH0sIGlkZW50aWZpZXJzOiBbJ2EnXSwga2V5czogWydiJ10gfV0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmtleXMuc29ydCgpLCBbJ1thXScsICdiJ10pO1xuXHRcdGFzc2VydC5vayhlcXVhbHModGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0T3ZlcnJpZGVWYWx1ZSgnYicsICdhJyksIHsgJ2JiJzogJzIwJywgJ2NjJzogJzMwJyB9KSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsY0FBYztBQUN2QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUE4RDtBQUN2RSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUV6QixNQUFNLHdCQUF3QixNQUFNO0FBRW5DLFFBQU0sY0FBYyx3Q0FBd0M7QUFDNUQsUUFBTSx3QkFBd0IsU0FBUyxHQUEyQixXQUFXLGFBQWE7QUFFMUYsUUFBTSxNQUFNLE1BQU0sQ0FBQztBQUNuQixXQUFTLE1BQU0sTUFBTSxDQUFDO0FBRXRCLFdBQVMsUUFBUTtBQUNoQiwwQkFBc0IseUJBQXlCLHNCQUFzQixrQkFBa0IsQ0FBQztBQUN4RiwwQkFBc0IsZ0NBQWdDLHNCQUFzQixtQ0FBbUMsQ0FBQztBQUFBLEVBQ2pIO0FBRUEsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxVQUFNLGFBQWEsWUFBWSxJQUFJLElBQUkscUJBQXFCLElBQUksZUFBZSxDQUFDLENBQUM7QUFDakYsMEJBQXNCLHNCQUFzQjtBQUFBLE1BQzNDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLGNBQWM7QUFBQSxRQUNiLEtBQUs7QUFBQSxVQUNKLGVBQWU7QUFBQSxVQUNmLFFBQVE7QUFBQSxVQUNSLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLFdBQVcsV0FBVztBQUMz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
