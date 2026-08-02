import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Event } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConfigurationTarget, isConfigured } from "../../common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../common/configurationRegistry.js";
import { ConfigurationService } from "../../common/configurationService.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { FilePolicyService } from "../../../policy/common/filePolicyService.js";
import { NullPolicyService } from "../../../policy/common/policy.js";
import { Registry } from "../../../registry/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("ConfigurationService.test.ts", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileService;
  let settingsResource;
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));
    settingsResource = URI.file("settings.json");
  });
  test("simple", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "bar");
  }));
  test("config gets flattened", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
    assert.ok(config.testworkbench);
    assert.ok(config.testworkbench.editor);
    assert.strictEqual(config.testworkbench.editor.tabs, true);
  }));
  test("error case does not explode", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString(",,,,"));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
  }));
  test("missing file does not explode", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(URI.file("__testFile"), fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    const config = testObject.getValue();
    assert.ok(config);
  }));
  test("trigger configuration change event when file does not exist", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    return new Promise((c, e) => {
      disposables.add(Event.filter(testObject.onDidChangeConfiguration, (e2) => e2.source === ConfigurationTarget.USER)(() => {
        assert.strictEqual(testObject.getValue("foo"), "bar");
        c();
      }));
      fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }')).catch(e);
    });
  }));
  test("trigger configuration change event when file exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    await testObject.initialize();
    return new Promise((c) => {
      disposables.add(Event.filter(testObject.onDidChangeConfiguration, (e) => e.source === ConfigurationTarget.USER)(async (e) => {
        assert.strictEqual(testObject.getValue("foo"), "barz");
        c();
      }));
      fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "barz" }'));
    });
  }));
  test("reloadConfiguration", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "bar" }'));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "bar");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "foo": "changed" }'));
    await testObject.reloadConfiguration();
    config = testObject.getValue();
    assert.ok(config);
    assert.strictEqual(config.foo, "changed");
  }));
  test("model defaults", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configuration.service.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    let testObject = disposables.add(new ConfigurationService(URI.file("__testFile"), fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isSet");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "testworkbench.editor.tabs": true }'));
    testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isSet");
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "configuration.service.testSetting": "isChanged" }'));
    await testObject.reloadConfiguration();
    setting = testObject.getValue();
    assert.ok(setting);
    assert.strictEqual(setting.configuration.service.testSetting, "isChanged");
  }));
  test("lookup", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "lookup.service.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let res = testObject.inspect("something.missing");
    assert.strictEqual(res.value, void 0);
    assert.strictEqual(res.defaultValue, void 0);
    assert.strictEqual(res.userValue, void 0);
    assert.strictEqual(isConfigured(res), false);
    res = testObject.inspect("lookup.service.testSetting");
    assert.strictEqual(res.defaultValue, "isSet");
    assert.strictEqual(res.value, "isSet");
    assert.strictEqual(res.userValue, void 0);
    assert.strictEqual(isConfigured(res), false);
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testSetting": "bar" }'));
    await testObject.reloadConfiguration();
    res = testObject.inspect("lookup.service.testSetting");
    assert.strictEqual(res.defaultValue, "isSet");
    assert.strictEqual(res.userValue, "bar");
    assert.strictEqual(res.value, "bar");
    assert.strictEqual(isConfigured(res), true);
  }));
  test("lookup with null", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_testNull",
      "type": "object",
      "properties": {
        "lookup.service.testNullSetting": {
          "type": "null"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    let res = testObject.inspect("lookup.service.testNullSetting");
    assert.strictEqual(res.defaultValue, null);
    assert.strictEqual(res.value, null);
    assert.strictEqual(res.userValue, void 0);
    await fileService.writeFile(settingsResource, VSBuffer.fromString('{ "lookup.service.testNullSetting": null }'));
    await testObject.reloadConfiguration();
    res = testObject.inspect("lookup.service.testNullSetting");
    assert.strictEqual(res.defaultValue, null);
    assert.strictEqual(res.value, null);
    assert.strictEqual(res.userValue, null);
  }));
  test("update configuration", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    assert.strictEqual(testObject.getValue("configurationService.testSetting"), "value");
  });
  test("update configuration when exist", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", "updatedValue");
    assert.strictEqual(testObject.getValue("configurationService.testSetting"), "updatedValue");
  });
  test("update configuration to default value should remove", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", "isSet");
    const inspect = testObject.inspect("configurationService.testSetting");
    assert.strictEqual(inspect.userValue, void 0);
  });
  test("update configuration should remove when undefined is passed", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.testSetting", "value");
    await testObject.updateValue("configurationService.testSetting", void 0);
    const inspect = testObject.inspect("configurationService.testSetting");
    assert.strictEqual(inspect.userValue, void 0);
  });
  test("update unknown configuration", async () => {
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    await testObject.updateValue("configurationService.unknownSetting", "value");
    assert.strictEqual(testObject.getValue("configurationService.unknownSetting"), "value");
  });
  test("update configuration in non user target throws error", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.testSetting": {
          "type": "string",
          "default": "isSet"
        }
      }
    });
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, new NullPolicyService(), new NullLogService()));
    await testObject.initialize();
    try {
      await testObject.updateValue("configurationService.testSetting", "value", ConfigurationTarget.WORKSPACE);
      assert.fail("Should fail with error");
    } catch (e) {
    }
  });
  test("update configuration throws error for policy setting", async () => {
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    configurationRegistry.registerConfiguration({
      "id": "_test",
      "type": "object",
      "properties": {
        "configurationService.policySetting": {
          "type": "string",
          "default": "isSet",
          policy: {
            name: "configurationService.policySetting",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        }
      }
    });
    const logService = new NullLogService();
    const policyFile = URI.file("policies.json");
    await fileService.writeFile(policyFile, VSBuffer.fromString('{ "configurationService.policySetting": "policyValue" }'));
    const policyService = disposables.add(new FilePolicyService(policyFile, fileService, logService));
    const testObject = disposables.add(new ConfigurationService(settingsResource, fileService, policyService, logService));
    await testObject.initialize();
    try {
      await testObject.updateValue("configurationService.policySetting", "value");
      assert.fail("Should throw error");
    } catch (error) {
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIGlzQ29uZmlndXJlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEZpbGVQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcG9saWN5L2NvbW1vbi9maWxlUG9saWN5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcblxuc3VpdGUoJ0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3QudHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0bGV0IHNldHRpbmdzUmVzb3VyY2U6IFVSSTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNrRmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0c2V0dGluZ3NSZXNvdXJjZSA9IFVSSS5maWxlKCdzZXR0aW5ncy5qc29uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiZm9vXCI6IFwiYmFyXCIgfScpKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGVzdE9iamVjdC5nZXRWYWx1ZTx7XG5cdFx0XHRmb286IHN0cmluZztcblx0XHR9PigpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5mb28sICdiYXInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2NvbmZpZyBnZXRzIGZsYXR0ZW5lZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwidGVzdHdvcmtiZW5jaC5lZGl0b3IudGFic1wiOiB0cnVlIH0nKSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGVzdE9iamVjdC5nZXRWYWx1ZTx7XG5cdFx0XHR0ZXN0d29ya2JlbmNoOiB7XG5cdFx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRcdHRhYnM6IGJvb2xlYW47XG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdH0+KCk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRhc3NlcnQub2soY29uZmlnLnRlc3R3b3JrYmVuY2gpO1xuXHRcdGFzc2VydC5vayhjb25maWcudGVzdHdvcmtiZW5jaC5lZGl0b3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcudGVzdHdvcmtiZW5jaC5lZGl0b3IudGFicywgdHJ1ZSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdlcnJvciBjYXNlIGRvZXMgbm90IGV4cGxvZGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLCwsLCcpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHtcblx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdH0+KCk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ21pc3NpbmcgZmlsZSBkb2VzIG5vdCBleHBsb2RlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2UoVVJJLmZpbGUoJ19fdGVzdEZpbGUnKSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gdGVzdE9iamVjdC5nZXRWYWx1ZTx7IGZvbzogc3RyaW5nIH0+KCk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3RyaWdnZXIgY29uZmlndXJhdGlvbiBjaGFuZ2UgZXZlbnQgd2hlbiBmaWxlIGRvZXMgbm90IGV4aXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZpbHRlcih0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLnNvdXJjZSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKSgoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZhbHVlKCdmb28nKSwgJ2JhcicpO1xuXHRcdFx0XHRjKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImZvb1wiOiBcImJhclwiIH0nKSkuY2F0Y2goZSk7XG5cdFx0fSk7XG5cblx0fSkpO1xuXG5cdHRlc3QoJ3RyaWdnZXIgY29uZmlndXJhdGlvbiBjaGFuZ2UgZXZlbnQgd2hlbiBmaWxlIGV4aXN0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImZvb1wiOiBcImJhclwiIH0nKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKGMpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5maWx0ZXIodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5zb3VyY2UgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUikoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0VmFsdWUoJ2ZvbycpLCAnYmFyeicpO1xuXHRcdFx0XHRjKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImZvb1wiOiBcImJhcnpcIiB9JykpO1xuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVsb2FkQ29uZmlndXJhdGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiZm9vXCI6IFwiYmFyXCIgfScpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRsZXQgY29uZmlnID0gdGVzdE9iamVjdC5nZXRWYWx1ZTx7XG5cdFx0XHRmb286IHN0cmluZztcblx0XHR9PigpO1xuXHRcdGFzc2VydC5vayhjb25maWcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZm9vLCAnYmFyJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJmb29cIjogXCJjaGFuZ2VkXCIgfScpKTtcblxuXHRcdC8vIGZvcmNlIGEgcmVsb2FkIHRvIGdldCBsYXRlc3Rcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25maWcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPHtcblx0XHRcdGZvbzogc3RyaW5nO1xuXHRcdH0+KCk7XG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5mb28sICdjaGFuZ2VkJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdtb2RlbCBkZWZhdWx0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGludGVyZmFjZSBJVGVzdFNldHRpbmcge1xuXHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRzZXJ2aWNlOiB7XG5cdFx0XHRcdFx0dGVzdFNldHRpbmc6IHN0cmluZztcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3QnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlndXJhdGlvbi5zZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShVUkkuZmlsZSgnX190ZXN0RmlsZScpLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0bGV0IHNldHRpbmcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPElUZXN0U2V0dGluZz4oKTtcblxuXHRcdGFzc2VydC5vayhzZXR0aW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dGluZy5jb25maWd1cmF0aW9uLnNlcnZpY2UudGVzdFNldHRpbmcsICdpc1NldCcpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJ0ZXN0d29ya2JlbmNoLmVkaXRvci50YWJzXCI6IHRydWUgfScpKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRzZXR0aW5nID0gdGVzdE9iamVjdC5nZXRWYWx1ZTxJVGVzdFNldHRpbmc+KCk7XG5cblx0XHRhc3NlcnQub2soc2V0dGluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHRpbmcuY29uZmlndXJhdGlvbi5zZXJ2aWNlLnRlc3RTZXR0aW5nLCAnaXNTZXQnKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShzZXR0aW5nc1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiY29uZmlndXJhdGlvbi5zZXJ2aWNlLnRlc3RTZXR0aW5nXCI6IFwiaXNDaGFuZ2VkXCIgfScpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QucmVsb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdHNldHRpbmcgPSB0ZXN0T2JqZWN0LmdldFZhbHVlPElUZXN0U2V0dGluZz4oKTtcblx0XHRhc3NlcnQub2soc2V0dGluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHRpbmcuY29uZmlndXJhdGlvbi5zZXJ2aWNlLnRlc3RTZXR0aW5nLCAnaXNDaGFuZ2VkJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdsb29rdXAnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdsb29rdXAuc2VydmljZS50ZXN0U2V0dGluZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ2lzU2V0J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRsZXQgcmVzID0gdGVzdE9iamVjdC5pbnNwZWN0KCdzb21ldGhpbmcubWlzc2luZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZWZhdWx0VmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy51c2VyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJlZChyZXMpLCBmYWxzZSk7XG5cblx0XHRyZXMgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ2xvb2t1cC5zZXJ2aWNlLnRlc3RTZXR0aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZWZhdWx0VmFsdWUsICdpc1NldCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudmFsdWUsICdpc1NldCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudXNlclZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyZWQocmVzKSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJsb29rdXAuc2VydmljZS50ZXN0U2V0dGluZ1wiOiBcImJhclwiIH0nKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHRyZXMgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ2xvb2t1cC5zZXJ2aWNlLnRlc3RTZXR0aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZWZhdWx0VmFsdWUsICdpc1NldCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudXNlclZhbHVlLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyZWQocmVzKSwgdHJ1ZSk7XG5cblx0fSkpO1xuXG5cdHRlc3QoJ2xvb2t1cCB3aXRoIG51bGwnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdE51bGwnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnbG9va3VwLnNlcnZpY2UudGVzdE51bGxTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ251bGwnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRsZXQgcmVzID0gdGVzdE9iamVjdC5pbnNwZWN0KCdsb29rdXAuc2VydmljZS50ZXN0TnVsbFNldHRpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmRlZmF1bHRWYWx1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy52YWx1ZSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy51c2VyVmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc2V0dGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygneyBcImxvb2t1cC5zZXJ2aWNlLnRlc3ROdWxsU2V0dGluZ1wiOiBudWxsIH0nKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdHJlcyA9IHRlc3RPYmplY3QuaW5zcGVjdCgnbG9va3VwLnNlcnZpY2UudGVzdE51bGxTZXR0aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5kZWZhdWx0VmFsdWUsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudmFsdWUsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMudXNlclZhbHVlLCBudWxsKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3VwZGF0ZSBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsICd2YWx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycpLCAndmFsdWUnKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGNvbmZpZ3VyYXRpb24gd2hlbiBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ2lzU2V0J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnLCAndmFsdWUnKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsICd1cGRhdGVkVmFsdWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnKSwgJ3VwZGF0ZWRWYWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgY29uZmlndXJhdGlvbiB0byBkZWZhdWx0IHZhbHVlIHNob3VsZCByZW1vdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3QnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICdpc1NldCdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBuZXcgTnVsbFBvbGljeVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJywgJ3ZhbHVlJyk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnLCAnaXNTZXQnKTtcblx0XHRjb25zdCBpbnNwZWN0ID0gdGVzdE9iamVjdC5pbnNwZWN0KCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3BlY3QudXNlclZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgY29uZmlndXJhdGlvbiBzaG91bGQgcmVtb3ZlIHdoZW4gdW5kZWZpbmVkIGlzIHBhc3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ2lzU2V0J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnLCAndmFsdWUnKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZycsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRlc3RPYmplY3QuaW5zcGVjdCgnY29uZmlndXJhdGlvblNlcnZpY2UudGVzdFNldHRpbmcnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnNwZWN0LnVzZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIHVua25vd24gY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb25maWd1cmF0aW9uU2VydmljZShzZXR0aW5nc1Jlc291cmNlLCBmaWxlU2VydmljZSwgbmV3IE51bGxQb2xpY3lTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS51bmtub3duU2V0dGluZycsICd2YWx1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZhbHVlKCdjb25maWd1cmF0aW9uU2VydmljZS51bmtub3duU2V0dGluZycpLCAndmFsdWUnKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGNvbmZpZ3VyYXRpb24gaW4gbm9uIHVzZXIgdGFyZ2V0IHRocm93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU2VydmljZS50ZXN0U2V0dGluZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ2lzU2V0J1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29uZmlndXJhdGlvblNlcnZpY2Uoc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUoJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRlc3RTZXR0aW5nJywgJ3ZhbHVlJywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBmYWlsIHdpdGggZXJyb3InKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBzdWNjZWVzc1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGNvbmZpZ3VyYXRpb24gdGhyb3dzIGVycm9yIGZvciBwb2xpY3kgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU2VydmljZS5wb2xpY3lTZXR0aW5nJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnaXNTZXQnLFxuXHRcdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnBvbGljeVNldHRpbmcnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHBvbGljeUZpbGUgPSBVUkkuZmlsZSgncG9saWNpZXMuanNvbicpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiY29uZmlndXJhdGlvblNlcnZpY2UucG9saWN5U2V0dGluZ1wiOiBcInBvbGljeVZhbHVlXCIgfScpKTtcblx0XHRjb25zdCBwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlUG9saWN5U2VydmljZShwb2xpY3lGaWxlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbmZpZ3VyYXRpb25TZXJ2aWNlKHNldHRpbmdzUmVzb3VyY2UsIGZpbGVTZXJ2aWNlLCBwb2xpY3lTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZSgnY29uZmlndXJhdGlvblNlcnZpY2UucG9saWN5U2V0dGluZycsICd2YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCB0aHJvdyBlcnJvcicpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBzdWNjZWVzc1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQixvQkFBb0I7QUFDbEQsU0FBUyxjQUFjLCtCQUF1RDtBQUM5RSxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixNQUFNLGdDQUFnQyxNQUFNO0FBRTNDLFFBQU0sY0FBYyx3Q0FB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
