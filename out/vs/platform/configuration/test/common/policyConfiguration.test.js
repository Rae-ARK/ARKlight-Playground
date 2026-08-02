import assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../common/configurations.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { Extensions } from "../../common/configurationRegistry.js";
import { Registry } from "../../../registry/common/platform.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { deepClone } from "../../../../base/common/objects.js";
import { FilePolicyService } from "../../../policy/common/filePolicyService.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("PolicyConfiguration", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let testObject;
  let fileService;
  let policyService;
  const policyFile = URI.file("policyFile").with({ scheme: "vscode-tests" });
  const policyConfigurationNode = {
    "id": "policyConfiguration",
    "order": 1,
    "title": "a",
    "type": "object",
    "properties": {
      "policy.settingA": {
        "type": "string",
        "default": "defaultValueA",
        policy: {
          name: "PolicySettingA",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.settingB": {
        "type": "string",
        "default": "defaultValueB",
        policy: {
          name: "PolicySettingB",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.objectSetting": {
        "type": "object",
        "default": {},
        policy: {
          name: "PolicyObjectSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.arraySetting": {
        "type": "object",
        "default": [],
        policy: {
          name: "PolicyArraySetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.booleanSetting": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicyBooleanSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.internalSetting": {
        "type": "string",
        "default": "defaultInternalValue",
        included: false,
        policy: {
          name: "PolicyInternalSetting",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "policy.ownerSetting": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicyShared",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          restrictedValue: true,
          localization: { description: { key: "shared.owner", value: "" } }
        }
      },
      "policy.referenceSetting": {
        "type": "boolean",
        "default": true,
        policyReference: {
          name: "PolicyShared"
        }
      },
      "policy.orphanReferenceSetting": {
        "type": "boolean",
        "default": true,
        policyReference: {
          name: "PolicyOrphanReference"
        }
      },
      "nonPolicy.setting": {
        "type": "boolean",
        "default": true
      }
    }
  };
  suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
  suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
  setup(async () => {
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    fileService = disposables.add(new FileService(new NullLogService()));
    const diskFileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(policyFile.scheme, diskFileSystemProvider));
    policyService = disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService()));
    testObject = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  test("initialize: with policies", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: no policies", async () => {
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
  });
  test("initialize: with policies but not registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA", "PolicySettingB": "policyValueB", "PolicySettingC": "policyValueC" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), "policyValueB");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA", "policy.settingB"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: with object type policy", async () => {
    const expected = {
      "microsoft": true,
      "github": "stable",
      "other": 1,
      "complex": {
        "key": "value"
      },
      "array": [1, 2, 3]
    };
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": JSON.stringify(expected) })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), expected);
  });
  test("initialize: with array type policy", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyArraySetting": JSON.stringify([1]) })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.arraySetting"), [1]);
  });
  test("initialize: with boolean type policy as false", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyBooleanSetting": false })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.booleanSetting"), false);
  });
  test("initialize: with boolean type policy as true", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyBooleanSetting": true })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.booleanSetting"), true);
  });
  test("initialize: with object type policy ignores policy if value is not valid", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": '{"a": "b", "hello": }' })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), void 0);
  });
  test("initialize: with object type policy ignores policy if there are duplicate keys", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyObjectSetting": '{"microsoft": true, "microsoft": false }' })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.deepStrictEqual(acutal.getValue("policy.objectSetting"), void 0);
  });
  test("change: when policy is added", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA", "PolicySettingB": "policyValueB", "PolicySettingC": "policyValueC" })));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueA");
    assert.strictEqual(acutal.getValue("policy.settingB"), "policyValueB");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA", "policy.settingB"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy is updated", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueAChanged" })));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), "policyValueAChanged");
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingA"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy is removed", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: an owning policy applies to both the owner and its references", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    const actual = testObject.configurationModel;
    assert.strictEqual(actual.getValue("policy.ownerSetting"), false);
    assert.strictEqual(actual.getValue("policy.referenceSetting"), false);
    assert.deepStrictEqual([...actual.keys].sort(), ["policy.ownerSetting", "policy.referenceSetting"]);
  });
  test("initialize: a reference resolves even when its owner is not registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    const actual = testObject.configurationModel;
    assert.strictEqual(actual.getValue("policy.orphanReferenceSetting"), false);
    assert.deepStrictEqual(actual.keys, ["policy.orphanReferenceSetting"]);
  });
  test("initialize: the owner definition is authoritative; a reference only contributes the policy name", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    const definition = policyService.policyDefinitions["PolicyShared"];
    assert.strictEqual(definition?.type, "boolean");
    assert.strictEqual(definition?.restrictedValue, true);
  });
  test("change: a late-registering owner supersedes an earlier reference definition", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, void 0);
    const ownerNode = {
      "id": "_test_late_owner",
      "type": "object",
      "properties": {
        "policy.lateOwner": {
          "type": "boolean",
          "default": true,
          policy: {
            name: "PolicyOrphanReference",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            restrictedValue: true,
            localization: { description: { key: "late.owner", value: "" } }
          }
        }
      }
    };
    try {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      Registry.as(Extensions.Configuration).registerConfiguration(ownerNode);
      await promise;
      assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, true);
      assert.strictEqual(testObject.configurationModel.getValue("policy.lateOwner"), false);
      assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
    } finally {
      Registry.as(Extensions.Configuration).deregisterConfigurations([ownerNode]);
    }
  });
  test("change: deregistering the owner falls back to a surviving reference definition", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyOrphanReference": false })));
    await testObject.initialize();
    const ownerNode = {
      "id": "_test_owner_removal",
      "type": "object",
      "properties": {
        "policy.removableOwner": {
          "type": "boolean",
          "default": true,
          policy: {
            name: "PolicyOrphanReference",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            restrictedValue: true,
            localization: { description: { key: "removable.owner", value: "" } }
          }
        }
      }
    };
    const registry = Registry.as(Extensions.Configuration);
    let promise = Event.toPromise(testObject.onDidChangeConfiguration);
    registry.registerConfiguration(ownerNode);
    await promise;
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, true);
    promise = Event.toPromise(testObject.onDidChangeConfiguration);
    registry.deregisterConfigurations([ownerNode]);
    await promise;
    assert.strictEqual(policyService.policyDefinitions["PolicyOrphanReference"]?.restrictedValue, void 0);
    assert.strictEqual(testObject.configurationModel.getValue("policy.orphanReferenceSetting"), false);
  });
  test("change: an owning policy update propagates to both the owner and its references", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyShared": false })));
    await testObject.initialize();
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const promise = Event.toPromise(testObject.onDidChangeConfiguration);
      await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({})));
      await promise;
    });
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.ownerSetting"), void 0);
    assert.strictEqual(acutal.getValue("policy.referenceSetting"), void 0);
  });
  test("change: when policy setting is registered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingC": "policyValueC" })));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    policyConfigurationNode.properties["policy.settingC"] = {
      "type": "string",
      "default": "defaultValueC",
      policy: {
        name: "PolicySettingC",
        category: PolicyCategory.Extensions,
        minimumVersion: "1.0.0",
        localization: { description: { key: "", value: "" } }
      }
    };
    Registry.as(Extensions.Configuration).registerConfiguration(deepClone(policyConfigurationNode));
    await promise;
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingC"), "policyValueC");
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.settingC"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("change: when policy setting is deregistered", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicySettingA": "policyValueA" })));
    await testObject.initialize();
    const promise = Event.toPromise(testObject.onDidChangeConfiguration);
    Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]);
    await promise;
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, []);
    assert.deepStrictEqual(acutal.overrides, []);
  });
  test("initialize: with internal policies", async () => {
    await fileService.writeFile(policyFile, VSBuffer.fromString(JSON.stringify({ "PolicyInternalSetting": "internalValue" })));
    await testObject.initialize();
    const acutal = testObject.configurationModel;
    assert.strictEqual(acutal.getValue("policy.settingA"), void 0);
    assert.strictEqual(acutal.getValue("policy.settingB"), void 0);
    assert.strictEqual(acutal.getValue("policy.internalSetting"), "internalValue");
    assert.strictEqual(acutal.getValue("nonPolicy.setting"), void 0);
    assert.deepStrictEqual(acutal.keys, ["policy.internalSetting"]);
    assert.deepStrictEqual(acutal.overrides, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vcG9saWN5Q29uZmlndXJhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdENvbmZpZ3VyYXRpb24sIFBvbGljeUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgRmlsZVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wb2xpY3kvY29tbW9uL2ZpbGVQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcblxuc3VpdGUoJ1BvbGljeUNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdGVzdE9iamVjdDogUG9saWN5Q29uZmlndXJhdGlvbjtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGxldCBwb2xpY3lTZXJ2aWNlOiBJUG9saWN5U2VydmljZTtcblx0Y29uc3QgcG9saWN5RmlsZSA9IFVSSS5maWxlKCdwb2xpY3lGaWxlJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSk7XG5cdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb25Ob2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0J2lkJzogJ3BvbGljeUNvbmZpZ3VyYXRpb24nLFxuXHRcdCdvcmRlcic6IDEsXG5cdFx0J3RpdGxlJzogJ2EnLFxuXHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHQncG9saWN5LnNldHRpbmdBJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVmYXVsdCc6ICdkZWZhdWx0VmFsdWVBJyxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdBJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdwb2xpY3kuc2V0dGluZ0InOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUInLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0InLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3BvbGljeS5vYmplY3RTZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHt9LFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5T2JqZWN0U2V0dGluZycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5LmFycmF5U2V0dGluZyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0J2RlZmF1bHQnOiBbXSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeUFycmF5U2V0dGluZycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5LmJvb2xlYW5TZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5Qm9vbGVhblNldHRpbmcnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSwgfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3BvbGljeS5pbnRlcm5hbFNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRJbnRlcm5hbFZhbHVlJyxcblx0XHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5SW50ZXJuYWxTZXR0aW5nJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdwb2xpY3kub3duZXJTZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2hhcmVkJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRyZXN0cmljdGVkVmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJ3NoYXJlZC5vd25lcicsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncG9saWN5LnJlZmVyZW5jZVNldHRpbmcnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTaGFyZWQnLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3BvbGljeS5vcnBoYW5SZWZlcmVuY2VTZXR0aW5nJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3lSZWZlcmVuY2U6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5T3JwaGFuUmVmZXJlbmNlJyxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdub25Qb2xpY3kuc2V0dGluZyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRzdWl0ZVNldHVwKCgpID0+IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHBvbGljeUNvbmZpZ3VyYXRpb25Ob2RlKSk7XG5cdHN1aXRlVGVhcmRvd24oKCkgPT4gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW3BvbGljeUNvbmZpZ3VyYXRpb25Ob2RlXSkpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocG9saWN5RmlsZS5zY2hlbWUsIGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlUG9saWN5U2VydmljZShwb2xpY3lGaWxlLCBmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHR0ZXN0T2JqZWN0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBwb2xpY3lTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIHBvbGljaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFsncG9saWN5LnNldHRpbmdBJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiBubyBwb2xpY2llcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0EnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIHBvbGljaWVzIGJ1dCBub3QgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUEnLCAnUG9saWN5U2V0dGluZ0InOiAncG9saWN5VmFsdWVCJywgJ1BvbGljeVNldHRpbmdDJzogJ3BvbGljeVZhbHVlQycgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kuc2V0dGluZ0InKSwgJ3BvbGljeVZhbHVlQicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgWydwb2xpY3kuc2V0dGluZ0EnLCAncG9saWN5LnNldHRpbmdCJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLm92ZXJyaWRlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIG9iamVjdCB0eXBlIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdCdtaWNyb3NvZnQnOiB0cnVlLFxuXHRcdFx0J2dpdGh1Yic6ICdzdGFibGUnLFxuXHRcdFx0J290aGVyJzogMSxcblx0XHRcdCdjb21wbGV4Jzoge1xuXHRcdFx0XHQna2V5JzogJ3ZhbHVlJ1xuXHRcdFx0fSxcblx0XHRcdCdhcnJheSc6IFsxLCAyLCAzXVxuXHRcdH07XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5T2JqZWN0U2V0dGluZyc6IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkKSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5Lm9iamVjdFNldHRpbmcnKSwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIGFycmF5IHR5cGUgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeUFycmF5U2V0dGluZyc6IEpTT04uc3RyaW5naWZ5KFsxXSkgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5hcnJheVNldHRpbmcnKSwgWzFdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogd2l0aCBib29sZWFuIHR5cGUgcG9saWN5IGFzIGZhbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeUJvb2xlYW5TZXR0aW5nJzogZmFsc2UgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5ib29sZWFuU2V0dGluZycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggYm9vbGVhbiB0eXBlIHBvbGljeSBhcyB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeUJvb2xlYW5TZXR0aW5nJzogdHJ1ZSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LmJvb2xlYW5TZXR0aW5nJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIG9iamVjdCB0eXBlIHBvbGljeSBpZ25vcmVzIHBvbGljeSBpZiB2YWx1ZSBpcyBub3QgdmFsaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5T2JqZWN0U2V0dGluZyc6ICd7XCJhXCI6IFwiYlwiLCBcImhlbGxvXCI6IH0nIH0pKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kub2JqZWN0U2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplOiB3aXRoIG9iamVjdCB0eXBlIHBvbGljeSBpZ25vcmVzIHBvbGljeSBpZiB0aGVyZSBhcmUgZHVwbGljYXRlIGtleXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5T2JqZWN0U2V0dGluZyc6ICd7XCJtaWNyb3NvZnRcIjogdHJ1ZSwgXCJtaWNyb3NvZnRcIjogZmFsc2UgfScgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5vYmplY3RTZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZTogd2hlbiBwb2xpY3kgaXMgYWRkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJyB9KSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScsICdQb2xpY3lTZXR0aW5nQic6ICdwb2xpY3lWYWx1ZUInLCAnUG9saWN5U2V0dGluZ0MnOiAncG9saWN5VmFsdWVDJyB9KSkpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQScpLCAncG9saWN5VmFsdWVBJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksICdwb2xpY3lWYWx1ZUInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFsncG9saWN5LnNldHRpbmdBJywgJ3BvbGljeS5zZXR0aW5nQiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiB3aGVuIHBvbGljeSBpcyB1cGRhdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScgfSkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUFDaGFuZ2VkJyB9KSkpO1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQScpLCAncG9saWN5VmFsdWVBQ2hhbmdlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ25vblBvbGljeS5zZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwua2V5cywgWydwb2xpY3kuc2V0dGluZ0EnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwub3ZlcnJpZGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZTogd2hlbiBwb2xpY3kgaXMgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUEnIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe30pKSk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgnbm9uUG9saWN5LnNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5rZXlzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwub3ZlcnJpZGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IGFuIG93bmluZyBwb2xpY3kgYXBwbGllcyB0byBib3RoIHRoZSBvd25lciBhbmQgaXRzIHJlZmVyZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2hhcmVkJzogZmFsc2UgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgncG9saWN5Lm93bmVyU2V0dGluZycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nZXRWYWx1ZSgncG9saWN5LnJlZmVyZW5jZVNldHRpbmcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmFjdHVhbC5rZXlzXS5zb3J0KCksIFsncG9saWN5Lm93bmVyU2V0dGluZycsICdwb2xpY3kucmVmZXJlbmNlU2V0dGluZyddKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogYSByZWZlcmVuY2UgcmVzb2x2ZXMgZXZlbiB3aGVuIGl0cyBvd25lciBpcyBub3QgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lPcnBoYW5SZWZlcmVuY2UnOiBmYWxzZSB9KSkpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdldFZhbHVlKCdwb2xpY3kub3JwaGFuUmVmZXJlbmNlU2V0dGluZycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwua2V5cywgWydwb2xpY3kub3JwaGFuUmVmZXJlbmNlU2V0dGluZyddKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZTogdGhlIG93bmVyIGRlZmluaXRpb24gaXMgYXV0aG9yaXRhdGl2ZTsgYSByZWZlcmVuY2Ugb25seSBjb250cmlidXRlcyB0aGUgcG9saWN5IG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2hhcmVkJzogZmFsc2UgfSkpKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Ly8gVGhlIG93bmVyIGRlY2xhcmVzIHJlc3RyaWN0ZWRWYWx1ZTsgdGhlIHJlZmVyZW5jZSBpcyBhIHB1cmUgcG9pbnRlci4gVGhlIHJlZ2lzdGVyZWRcblx0XHQvLyBkZWZpbml0aW9uIG11c3QgYmUgdGhlIG93bmVyJ3MuXG5cdFx0Y29uc3QgZGVmaW5pdGlvbiA9IHBvbGljeVNlcnZpY2UucG9saWN5RGVmaW5pdGlvbnNbJ1BvbGljeVNoYXJlZCddO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZpbml0aW9uPy50eXBlLCAnYm9vbGVhbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZpbml0aW9uPy5yZXN0cmljdGVkVmFsdWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2U6IGEgbGF0ZS1yZWdpc3RlcmluZyBvd25lciBzdXBlcnNlZGVzIGFuIGVhcmxpZXIgcmVmZXJlbmNlIGRlZmluaXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gT25seSB0aGUgcmVmZXJlbmNlIGZvciBgUG9saWN5T3JwaGFuUmVmZXJlbmNlYCBpcyByZWdpc3RlcmVkIGluaXRpYWxseSAobW9kZWxzIHRoZSBlZGl0b3Jcblx0XHQvLyB3aW5kb3c6IHRoZSBhZ2VudC1ob3N0IHJlZmVyZW5jZSBsb2FkcyBlYWdlcmx5IHdoaWxlIHRoZSBleHRlbnNpb24gcG9saWN5IG93bmVyIGxvYWRzIGxhdGVyKS5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lPcnBoYW5SZWZlcmVuY2UnOiBmYWxzZSB9KSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Ly8gVGhlIHN5bnRoZXNpemVkIHJlZmVyZW5jZSBkZWZpbml0aW9uIGNhcnJpZXMgbm8gcmVzdHJpY3RlZFZhbHVlLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgncG9saWN5Lm9ycGhhblJlZmVyZW5jZVNldHRpbmcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLnBvbGljeURlZmluaXRpb25zWydQb2xpY3lPcnBoYW5SZWZlcmVuY2UnXT8ucmVzdHJpY3RlZFZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgb3duZXJOb2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfbGF0ZV9vd25lcicsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdwb2xpY3kubGF0ZU93bmVyJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lPcnBoYW5SZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdHJlc3RyaWN0ZWRWYWx1ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICdsYXRlLm93bmVyJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb21pc2UgPSBFdmVudC50b1Byb21pc2UodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24ob3duZXJOb2RlKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRcdC8vIFRoZSBvd25lcidzIGRlZmluaXRpb24gKHdpdGggcmVzdHJpY3RlZFZhbHVlKSBtdXN0IG5vdyBzdXBlcnNlZGUgdGhlIHJlZmVyZW5jZSdzLCBhbmRcblx0XHRcdC8vIGJvdGggc2V0dGluZ3MgcmVtYWluIGdhdGVkIGJ5IHRoZSBzYW1lIHBvbGljeSB2YWx1ZS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLnBvbGljeURlZmluaXRpb25zWydQb2xpY3lPcnBoYW5SZWZlcmVuY2UnXT8ucmVzdHJpY3RlZFZhbHVlLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgncG9saWN5LmxhdGVPd25lcicpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3BvbGljeS5vcnBoYW5SZWZlcmVuY2VTZXR0aW5nJyksIGZhbHNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW293bmVyTm9kZV0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiBkZXJlZ2lzdGVyaW5nIHRoZSBvd25lciBmYWxscyBiYWNrIHRvIGEgc3Vydml2aW5nIHJlZmVyZW5jZSBkZWZpbml0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeU9ycGhhblJlZmVyZW5jZSc6IGZhbHNlIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25zdCBvd25lck5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdCdpZCc6ICdfdGVzdF9vd25lcl9yZW1vdmFsJyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeS5yZW1vdmFibGVPd25lcic6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnUG9saWN5T3JwaGFuUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0XHRyZXN0cmljdGVkVmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAncmVtb3ZhYmxlLm93bmVyJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuXHRcdGxldCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24ob3duZXJOb2RlKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLnBvbGljeURlZmluaXRpb25zWydQb2xpY3lPcnBoYW5SZWZlcmVuY2UnXT8ucmVzdHJpY3RlZFZhbHVlLCB0cnVlKTtcblxuXHRcdC8vIFJlbW92aW5nIHRoZSBvd25lciBtdXN0IHJlLXJlc29sdmUgdGhlIHBvbGljeSBhbmQgZmFsbCBiYWNrIHRvIHRoZSBzdXJ2aXZpbmcgcmVmZXJlbmNlLFxuXHRcdC8vIHNvIHRoZSBvd25lci1vbmx5IHJlc3RyaWN0ZWRWYWx1ZSBubyBsb25nZXIgYXBwbGllcy5cblx0XHRwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRyZWdpc3RyeS5kZXJlZ2lzdGVyQ29uZmlndXJhdGlvbnMoW293bmVyTm9kZV0pO1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UucG9saWN5RGVmaW5pdGlvbnNbJ1BvbGljeU9ycGhhblJlZmVyZW5jZSddPy5yZXN0cmljdGVkVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdwb2xpY3kub3JwaGFuUmVmZXJlbmNlU2V0dGluZycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZTogYW4gb3duaW5nIHBvbGljeSB1cGRhdGUgcHJvcGFnYXRlcyB0byBib3RoIHRoZSBvd25lciBhbmQgaXRzIHJlZmVyZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2hhcmVkJzogZmFsc2UgfSkpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblxuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7fSkpKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdwb2xpY3kub3duZXJTZXR0aW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnJlZmVyZW5jZVNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiB3aGVuIHBvbGljeSBzZXR0aW5nIGlzIHJlZ2lzdGVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0MnOiAncG9saWN5VmFsdWVDJyB9KSkpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbik7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbk5vZGUucHJvcGVydGllcyFbJ3BvbGljeS5zZXR0aW5nQyddID0ge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUMnLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nQycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9LCB9LFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oZGVlcENsb25lKHBvbGljeUNvbmZpZ3VyYXRpb25Ob2RlKSk7XG5cdFx0YXdhaXQgcHJvbWlzZTtcblxuXHRcdGNvbnN0IGFjdXRhbCA9IHRlc3RPYmplY3QuY29uZmlndXJhdGlvbk1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQycpLCAncG9saWN5VmFsdWVDJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgnbm9uUG9saWN5LnNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5rZXlzLCBbJ3BvbGljeS5zZXR0aW5nQyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlOiB3aGVuIHBvbGljeSBzZXR0aW5nIGlzIGRlcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7ICdQb2xpY3lTZXR0aW5nQSc6ICdwb2xpY3lWYWx1ZUEnIH0pKSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5pbml0aWFsaXplKCk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKHRlc3RPYmplY3Qub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKTtcblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhbcG9saWN5Q29uZmlndXJhdGlvbk5vZGVdKTtcblx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0Y29uc3QgYWN1dGFsID0gdGVzdE9iamVjdC5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdBJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgncG9saWN5LnNldHRpbmdCJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdXRhbC5nZXRWYWx1ZSgnbm9uUG9saWN5LnNldHRpbmcnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5rZXlzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3V0YWwub3ZlcnJpZGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemU6IHdpdGggaW50ZXJuYWwgcG9saWNpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5SW50ZXJuYWxTZXR0aW5nJzogJ2ludGVybmFsVmFsdWUnIH0pKSk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3V0YWwgPSB0ZXN0T2JqZWN0LmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5zZXR0aW5nQicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3V0YWwuZ2V0VmFsdWUoJ3BvbGljeS5pbnRlcm5hbFNldHRpbmcnKSwgJ2ludGVybmFsVmFsdWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN1dGFsLmdldFZhbHVlKCdub25Qb2xpY3kuc2V0dGluZycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN1dGFsLmtleXMsIFsncG9saWN5LmludGVybmFsU2V0dGluZyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdXRhbC5vdmVycmlkZXMsIFtdKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0IsMkJBQTJCO0FBRTFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQThEO0FBQ3ZFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLGFBQWEsSUFBSSxLQUFLLFlBQVksRUFBRSxLQUFLLEVBQUUsUUFBUSxlQUFlLENBQUM7QUFDekUsUUFBTSwwQkFBOEM7QUFBQSxJQUNuRCxNQUFNO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxTQUFTO0FBQUEs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
