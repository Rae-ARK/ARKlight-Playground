import assert from "assert";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IModelService } from "../../../common/services/model.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { TextResourceConfigurationService } from "../../../common/services/textResourceConfigurationService.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("TextResourceConfigurationService - Update", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationValue = {};
  let updateArgs;
  const configurationService = new class extends TestConfigurationService {
    inspect() {
      return configurationValue;
    }
    updateValue() {
      updateArgs = [...arguments];
      return Promise.resolve();
    }
  }();
  let language = null;
  let testObject;
  setup(() => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IModelService, { getModel() {
      return null;
    } });
    instantiationService.stub(ILanguageService, { guessLanguageIdByFilepathOrFirstLine() {
      return language;
    } });
    instantiationService.stub(IConfigurationService, configurationService);
    testObject = disposables.add(instantiationService.createInstance(TextResourceConfigurationService));
  });
  test("updateValue writes without target and overrides when no language is defined", async () => {
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes with target and without overrides when no language is defined", async () => {
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.USER_LOCAL);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into given memory target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "1" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.MEMORY);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.MEMORY]);
  });
  test("updateValue writes into given workspace target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.WORKSPACE);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into given user target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.USER);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER]);
  });
  test("updateValue writes into given workspace folder target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2", override: "1" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b", ConfigurationTarget.WORKSPACE_FOLDER);
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace folder target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspaceFolder: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace folder target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "1" },
      workspaceFolder: { value: "2", override: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE_FOLDER]);
  });
  test("updateValue writes into derived workspace target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived workspace target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived workspace target with overrides and value defined in folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2" },
      workspace: { value: "2", override: "2" },
      workspaceFolder: { value: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.WORKSPACE]);
  });
  test("updateValue writes into derived user remote target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2", override: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides and value defined in workspace", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" },
      userRemote: { value: "2", override: "3" },
      workspace: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user remote target with overrides and value defined in workspace folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "1" },
      userRemote: { value: "2", override: "3" },
      workspace: { value: "3" },
      workspaceFolder: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_REMOTE]);
  });
  test("updateValue writes into derived user target without overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in remote", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      userRemote: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in workspace", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" },
      userLocal: { value: "2", override: "3" },
      workspaceValue: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target with overrides and value is defined in workspace folder", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2", override: "3" },
      userRemote: { value: "3" },
      workspaceFolderValue: { value: "3" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue writes into derived user target when overridden in default and not in user", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1", override: "3" },
      userLocal: { value: "2" },
      overrideIdentifiers: [language]
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "2");
    assert.deepStrictEqual(updateArgs, ["a", "2", { resource, overrideIdentifier: language }, ConfigurationTarget.USER_LOCAL]);
  });
  test("updateValue when not changed", async () => {
    language = "a";
    configurationValue = {
      default: { value: "1" }
    };
    const resource = URI.file("someFile");
    await testObject.updateValue(resource, "a", "b");
    assert.deepStrictEqual(updateArgs, ["a", "b", { resource, overrideIdentifier: void 0 }, ConfigurationTarget.USER_LOCAL]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblZhbHVlLCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuXG5zdWl0ZSgnVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgLSBVcGRhdGUnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25WYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxhbnk+ID0ge307XG5cdGxldCB1cGRhdGVBcmdzOiBhbnlbXTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdG92ZXJyaWRlIGluc3BlY3QoKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblZhbHVlO1xuXHRcdH1cblx0XHRvdmVycmlkZSB1cGRhdGVWYWx1ZSgpIHtcblx0XHRcdHVwZGF0ZUFyZ3MgPSBbLi4uYXJndW1lbnRzXTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdH0oKTtcblx0bGV0IGxhbmd1YWdlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0bGV0IHRlc3RPYmplY3Q6IFRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgeyBnZXRNb2RlbCgpIHsgcmV0dXJuIG51bGw7IH0gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VTZXJ2aWNlLCB7IGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSgpIHsgcmV0dXJuIGxhbmd1YWdlOyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGVzdE9iamVjdCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgd2l0aG91dCB0YXJnZXQgYW5kIG92ZXJyaWRlcyB3aGVuIG5vIGxhbmd1YWdlIGlzIGRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgd2l0aCB0YXJnZXQgYW5kIHdpdGhvdXQgb3ZlcnJpZGVzIHdoZW4gbm8gbGFuZ3VhZ2UgaXMgZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZ2l2ZW4gbWVtb3J5IHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InLCBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuTUVNT1JZXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGdpdmVuIHdvcmtzcGFjZSB0YXJnZXQgd2l0aG91dCBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiB7IHZhbHVlOiAnMicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBnaXZlbiB1c2VyIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZ2l2ZW4gd29ya3NwYWNlIGZvbGRlciB0YXJnZXQgd2l0aCBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMScgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVJdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB3b3Jrc3BhY2UgZm9sZGVyIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiB1bmRlZmluZWQgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgd29ya3NwYWNlIGZvbGRlciB0YXJnZXQgd2l0aCBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMScgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzInIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHdvcmtzcGFjZSB0YXJnZXQgd2l0aG91dCBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB7IHZhbHVlOiAnMicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgd29ya3NwYWNlIHRhcmdldCB3aXRoIG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2U6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICcyJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHdvcmtzcGFjZSB0YXJnZXQgd2l0aCBvdmVycmlkZXMgYW5kIHZhbHVlIGRlZmluZWQgaW4gZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHdvcmtzcGFjZTogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzInIH0sXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyczogW2xhbmd1YWdlXVxuXHRcdH07XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnc29tZUZpbGUnKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3QudXBkYXRlVmFsdWUocmVzb3VyY2UsICdhJywgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZUFyZ3MsIFsnYScsICdiJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgcmVtb3RlIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0XHR1c2VyUmVtb3RlOiB7IHZhbHVlOiAnMicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogdW5kZWZpbmVkIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHJlbW90ZSB0YXJnZXQgd2l0aCBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0XHR1c2VyTG9jYWw6IHsgdmFsdWU6ICcyJyB9LFxuXHRcdFx0dXNlclJlbW90ZTogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHJlbW90ZSB0YXJnZXQgd2l0aCBvdmVycmlkZXMgYW5kIHZhbHVlIGRlZmluZWQgaW4gd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdHVzZXJSZW1vdGU6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICdiJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnYicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgcmVtb3RlIHRhcmdldCB3aXRoIG92ZXJyaWRlcyBhbmQgdmFsdWUgZGVmaW5lZCBpbiB3b3Jrc3BhY2UgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMScgfSxcblx0XHRcdHVzZXJSZW1vdGU6IHsgdmFsdWU6ICcyJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogeyB2YWx1ZTogJzMnIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHRhcmdldCB3aXRob3V0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlVmFsdWUgd3JpdGVzIGludG8gZGVyaXZlZCB1c2VyIHRhcmdldCB3aXRoIG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXJzOiBbbGFuZ3VhZ2VdXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJzInLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVWYWx1ZSB3cml0ZXMgaW50byBkZXJpdmVkIHVzZXIgdGFyZ2V0IHdpdGggb3ZlcnJpZGVzIGFuZCB2YWx1ZSBpcyBkZWZpbmVkIGluIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR1c2VyUmVtb3RlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICcyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnMicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciB0YXJnZXQgd2l0aCBvdmVycmlkZXMgYW5kIHZhbHVlIGlzIGRlZmluZWQgaW4gd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdHdvcmtzcGFjZVZhbHVlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICcyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnMicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciB0YXJnZXQgd2l0aCBvdmVycmlkZXMgYW5kIHZhbHVlIGlzIGRlZmluZWQgaW4gd29ya3NwYWNlIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRsYW5ndWFnZSA9ICdhJztcblx0XHRjb25maWd1cmF0aW9uVmFsdWUgPSB7XG5cdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiAnMScsIG92ZXJyaWRlOiAnMycgfSxcblx0XHRcdHVzZXJMb2NhbDogeyB2YWx1ZTogJzInLCBvdmVycmlkZTogJzMnIH0sXG5cdFx0XHR1c2VyUmVtb3RlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlclZhbHVlOiB7IHZhbHVlOiAnMycgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICcyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnMicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdyaXRlcyBpbnRvIGRlcml2ZWQgdXNlciB0YXJnZXQgd2hlbiBvdmVycmlkZGVuIGluIGRlZmF1bHQgYW5kIG5vdCBpbiB1c2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxhbmd1YWdlID0gJ2EnO1xuXHRcdGNvbmZpZ3VyYXRpb25WYWx1ZSA9IHtcblx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6ICcxJywgb3ZlcnJpZGU6ICczJyB9LFxuXHRcdFx0dXNlckxvY2FsOiB7IHZhbHVlOiAnMicgfSxcblx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcnM6IFtsYW5ndWFnZV1cblx0XHR9O1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3NvbWVGaWxlJyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnVwZGF0ZVZhbHVlKHJlc291cmNlLCAnYScsICcyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVBcmdzLCBbJ2EnLCAnMicsIHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZVZhbHVlIHdoZW4gbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGFuZ3VhZ2UgPSAnYSc7XG5cdFx0Y29uZmlndXJhdGlvblZhbHVlID0ge1xuXHRcdFx0ZGVmYXVsdDogeyB2YWx1ZTogJzEnIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdzb21lRmlsZScpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC51cGRhdGVWYWx1ZShyZXNvdXJjZSwgJ2EnLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlQXJncywgWydhJywgJ2InLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IHVuZGVmaW5lZCB9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxdKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQThCLHVCQUF1QiwyQkFBMkI7QUFDaEYsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBR3hELE1BQU0sNkNBQTZDLE1BQU07QUFFeEQsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSSxxQkFBK0MsQ0FBQztBQUNwRCxNQUFJO0FBQ0osUUFBTSx1QkFBdUIsSUFBSSxjQUFjLHlCQUF5QjtBQUFBLElBQzlELFVBQVU7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
