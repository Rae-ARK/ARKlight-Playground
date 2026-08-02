import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Event } from "../../../../../base/common/event.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../../../../platform/configuration/common/configurations.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { FilePolicyService } from "../../../../../platform/policy/common/filePolicyService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { DefaultAccountService } from "../../../accounts/browser/defaultAccount.js";
import { AccountPolicyService } from "../../common/accountPolicyService.js";
import { MultiplexPolicyService } from "../../../../../platform/policy/common/multiplexPolicyService.js";
const BASE_DEFAULT_ACCOUNT = {
  authenticationProvider: {
    id: "github",
    name: "GitHub",
    enterprise: false
  },
  accountName: "testuser",
  enterprise: false,
  sessionId: "abc123"
};
class DefaultAccountProvider {
  constructor(defaultAccount, policyData = {}) {
    this.defaultAccount = defaultAccount;
    this.policyData = policyData;
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
  }
  getDefaultAccountAuthenticationProvider() {
    return this.defaultAccount.authenticationProvider;
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  async refresh() {
    return this.defaultAccount;
  }
  async signIn() {
    return null;
  }
  async signOut() {
  }
}
suite("MultiplexPolicyService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let policyService;
  let fileService;
  let defaultAccountService;
  let policyConfiguration;
  const logService = new NullLogService();
  const policyFile = URI.file("policyFile").with({ scheme: "vscode-tests" });
  const policyConfigurationNode = {
    "id": "policyConfiguration",
    "order": 1,
    "title": "a",
    "type": "object",
    "properties": {
      "setting.A": {
        "type": "string",
        "default": "defaultValueA",
        policy: {
          name: "PolicySettingA",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } }
        }
      },
      "setting.B": {
        "type": "string",
        "default": "defaultValueB",
        policy: {
          name: "PolicySettingB",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? "policyValueB" : void 0
        }
      },
      "setting.C": {
        "type": "array",
        "default": ["defaultValueC1", "defaultValueC2"],
        policy: {
          name: "PolicySettingC",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify(["policyValueC1", "policyValueC2"]) : void 0
        }
      },
      "setting.D": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingD",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0
        }
      },
      "setting.E": {
        "type": "boolean",
        "default": true
      },
      "setting.F": {
        "type": "boolean",
        "default": true,
        policy: {
          name: "PolicySettingF",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.cloud_session_storage_enabled === false ? false : void 0
        }
      },
      "setting.G": {
        "type": ["array", "null"],
        "default": null,
        policy: {
          name: "PolicySettingG",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify(["policyValueG1", "policyValueG2"]) : void 0
        }
      },
      "setting.H": {
        "type": ["array", "null"],
        "default": null,
        policy: {
          name: "PolicySettingH",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.chat_preview_features_enabled === false ? JSON.stringify([]) : void 0
        }
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
    defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
    policyService = disposables.add(new MultiplexPolicyService([
      disposables.add(new FilePolicyService(policyFile, fileService, new NullLogService())),
      disposables.add(new AccountPolicyService(logService, defaultAccountService))
    ], logService));
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  async function clear() {
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({})
      )
    );
  }
  test("no policy", async () => {
    await clear();
    await policyConfiguration.initialize();
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, void 0);
      assert.strictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
    {
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      const E = policyConfiguration.configurationModel.getValue("setting.E");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
      assert.strictEqual(E, void 0);
    }
  });
  test("policy from file only", async () => {
    await clear();
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({ "PolicySettingA": "policyValueA" })
      )
    );
    await policyConfiguration.initialize();
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, void 0);
      assert.strictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
    {
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      const E = policyConfiguration.configurationModel.getValue("setting.E");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
      assert.strictEqual(E, void 0);
    }
  });
  test("policy from default account only", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({})
      )
    );
    await policyConfiguration.initialize();
    const actualConfigurationModel = policyConfiguration.configurationModel;
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, "policyValueB");
      assert.strictEqual(C, JSON.stringify(["policyValueC1", "policyValueC2"]));
      assert.strictEqual(D, false);
    }
    {
      const A = policyConfiguration.configurationModel.getValue("setting.A");
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(A, void 0);
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("policy from file and default account", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await fileService.writeFile(
      policyFile,
      VSBuffer.fromString(
        JSON.stringify({ "PolicySettingA": "policyValueA" })
      )
    );
    await policyConfiguration.initialize();
    const actualConfigurationModel = policyConfiguration.configurationModel;
    {
      const A = policyService.getPolicyValue("PolicySettingA");
      const B = policyService.getPolicyValue("PolicySettingB");
      const C = policyService.getPolicyValue("PolicySettingC");
      const D = policyService.getPolicyValue("PolicySettingD");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, "policyValueB");
      assert.strictEqual(C, JSON.stringify(["policyValueC1", "policyValueC2"]));
      assert.strictEqual(D, false);
    }
    {
      const A = actualConfigurationModel.getValue("setting.A");
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(A, "policyValueA");
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("cloud_session_storage_enabled policy disabled overrides setting", async () => {
    await clear();
    const policyData = { cloud_session_storage_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), false);
  });
  test("cloud_session_storage_enabled policy enabled does not override setting", async () => {
    await clear();
    const policyData = { cloud_session_storage_enabled: true };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), void 0);
  });
  test("cloud_session_storage_enabled policy unset does not override setting", async () => {
    await clear();
    const policyData = {};
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.F"), void 0);
  });
  test("union-typed (array | null) policy registers and parses JSON string value", async () => {
    await clear();
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingG"), JSON.stringify(["policyValueG1", "policyValueG2"]));
    assert.deepStrictEqual(policyConfiguration.configurationModel.getValue("setting.G"), ["policyValueG1", "policyValueG2"]);
  });
  test("union-typed (array | null) policy preserves an empty array (lockdown) distinct from unset", async () => {
    await clear();
    const setPolicyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, setPolicyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingH"), JSON.stringify([]));
    assert.deepStrictEqual(policyConfiguration.configurationModel.getValue("setting.H"), []);
  });
  test("union-typed (array | null) policy unset leaves the setting at its default (distinct from empty array)", async () => {
    await clear();
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingH"), void 0);
    assert.strictEqual(policyConfiguration.configurationModel.getValue("setting.H"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wb2xpY2llcy90ZXN0L2Jyb3dzZXIvbXVsdGlwbGV4UG9saWN5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERlZmF1bHRDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2ZpbGVQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRlc3RQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hY2NvdW50cy9icm93c2VyL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IEFjY291bnRQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjY291bnRQb2xpY3lTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE11bHRpcGxleFBvbGljeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL211bHRpcGxleFBvbGljeVNlcnZpY2UuanMnO1xuXG5jb25zdCBCQVNFX0RFRkFVTFRfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRhdXRoZW50aWNhdGlvblByb3ZpZGVyOiB7XG5cdFx0aWQ6ICdnaXRodWInLFxuXHRcdG5hbWU6ICdHaXRIdWInLFxuXHRcdGVudGVycHJpc2U6IGZhbHNlLFxuXHR9LFxuXHRhY2NvdW50TmFtZTogJ3Rlc3R1c2VyJyxcblx0ZW50ZXJwcmlzZTogZmFsc2UsXG5cdHNlc3Npb25JZDogJ2FiYzEyMycsXG59O1xuXG5jbGFzcyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyIGltcGxlbWVudHMgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBvbGljeURhdGEgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBjb3BpbG90VG9rZW5JbmZvID0gbnVsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzRmV0Y2hTdGF0dXM6IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NGZXRjaGVkQXQ6IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTogdW5rbm93biA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudCxcblx0XHRyZWFkb25seSBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHt9LFxuXHQpIHsgfVxuXG5cdGdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudC5hdXRoZW50aWNhdGlvblByb3ZpZGVyO1xuXHR9XG5cblx0cmVzb2x2ZUdpdEh1YlVybChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgaHR0cHM6Ly9naXRodWIuY29tLyR7cGF0aH1gO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0QWNjb3VudDtcblx0fVxuXG5cdGFzeW5jIHNpZ25JbigpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIHNpZ25PdXQoKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuc3VpdGUoJ011bHRpcGxleFBvbGljeVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcG9saWN5U2VydmljZTogTXVsdGlwbGV4UG9saWN5U2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGxldCBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2U7XG5cdGxldCBwb2xpY3lDb25maWd1cmF0aW9uOiBQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0Y29uc3QgcG9saWN5RmlsZSA9IFVSSS5maWxlKCdwb2xpY3lGaWxlJykud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS10ZXN0cycgfSk7XG5cdGNvbnN0IHBvbGljeUNvbmZpZ3VyYXRpb25Ob2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0J2lkJzogJ3BvbGljeUNvbmZpZ3VyYXRpb24nLFxuXHRcdCdvcmRlcic6IDEsXG5cdFx0J3RpdGxlJzogJ2EnLFxuXHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHQnc2V0dGluZy5BJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVmYXVsdCc6ICdkZWZhdWx0VmFsdWVBJyxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdBJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuQic6IHtcblx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0J2RlZmF1bHQnOiAnZGVmYXVsdFZhbHVlQicsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nQicsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyAncG9saWN5VmFsdWVCJyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkMnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0J2RlZmF1bHQnOiBbJ2RlZmF1bHRWYWx1ZUMxJywgJ2RlZmF1bHRWYWx1ZUMyJ10sXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nQycsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBKU09OLnN0cmluZ2lmeShbJ3BvbGljeVZhbHVlQzEnLCAncG9saWN5VmFsdWVDMiddKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkQnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nRCcsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdzZXR0aW5nLkUnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRic6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdGJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNsb3VkX3Nlc3Npb25fc3RvcmFnZV9lbmFibGVkID09PSBmYWxzZSA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRyc6IHtcblx0XHRcdFx0J3R5cGUnOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdFx0J2RlZmF1bHQnOiBudWxsLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0cnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUcxJywgJ3BvbGljeVZhbHVlRzInXSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5IJzoge1xuXHRcdFx0XHQndHlwZSc6IFsnYXJyYXknLCAnbnVsbCddLFxuXHRcdFx0XHQnZGVmYXVsdCc6IG51bGwsXG5cdFx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRcdG5hbWU6ICdQb2xpY3lTZXR0aW5nSCcsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uOiB7IGRlc2NyaXB0aW9uOiB7IGtleTogJycsIHZhbHVlOiAnJyB9IH0sXG5cdFx0XHRcdFx0dmFsdWU6IHBvbGljeURhdGEgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBKU09OLnN0cmluZ2lmeShbXSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fVxuXHR9O1xuXG5cblx0c3VpdGVTZXR1cCgoKSA9PiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uTm9kZSkpO1xuXHRzdWl0ZVRlYXJkb3duKCgpID0+IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtwb2xpY3lDb25maWd1cmF0aW9uTm9kZV0pKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGlza0ZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocG9saWN5RmlsZS5zY2hlbWUsIGRpc2tGaWxlU3lzdGVtUHJvdmlkZXIpKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpcGxleFBvbGljeVNlcnZpY2UoW1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlUG9saWN5U2VydmljZShwb2xpY3lGaWxlLCBmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlKSksXG5cdFx0XSwgbG9nU2VydmljZSkpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGNsZWFyKCkge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZyhcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoe30pXG5cdFx0XHQpXG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ25vIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0Ly8gTm8gcG9saWN5IGlzIHNldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQiwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQSA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkEnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQycpO1xuXHRcdFx0Y29uc3QgRCA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkQnKTtcblx0XHRcdGNvbnN0IEUgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5FJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChBLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChFLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncG9saWN5IGZyb20gZmlsZSBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocG9saWN5RmlsZSxcblx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHsgJ1BvbGljeVNldHRpbmdBJzogJ3BvbGljeVZhbHVlQScgfSlcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkInKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5DJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXHRcdFx0Y29uc3QgRSA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkUnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsICdwb2xpY3lWYWx1ZUEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGljeSBmcm9tIGRlZmF1bHQgYWNjb3VudCBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBvbGljeUZpbGUsXG5cdFx0XHRWU0J1ZmZlci5mcm9tU3RyaW5nKFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeSh7fSlcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWw7XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0EnKTtcblx0XHRcdGNvbnN0IEIgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdDJyk7XG5cdFx0XHRjb25zdCBEID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEEsIHVuZGVmaW5lZCk7IC8vIE5vdCB0YWdnZWQgd2l0aCBwcmV2aWV3IHRhZ3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQywgSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBBID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEMsIFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGljeSBmcm9tIGZpbGUgYW5kIGRlZmF1bHQgYWNjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShwb2xpY3lGaWxlLFxuXHRcdFx0VlNCdWZmZXIuZnJvbVN0cmluZyhcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoeyAnUG9saWN5U2V0dGluZ0EnOiAncG9saWN5VmFsdWVBJyB9KVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQScpO1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdCJyk7XG5cdFx0XHRjb25zdCBDID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0MnKTtcblx0XHRcdGNvbnN0IEQgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgJ3BvbGljeVZhbHVlQScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEIsICdwb2xpY3lWYWx1ZUInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDLCBKU09OLnN0cmluZ2lmeShbJ3BvbGljeVZhbHVlQzEnLCAncG9saWN5VmFsdWVDMiddKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQScpO1xuXHRcdFx0Y29uc3QgQiA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5CJyk7XG5cdFx0XHRjb25zdCBDID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgJ3BvbGljeVZhbHVlQScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEIsICdwb2xpY3lWYWx1ZUInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQywgWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgZmFsc2UpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgcG9saWN5IGRpc2FibGVkIG92ZXJyaWRlcyBzZXR0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgcG9saWN5IGVuYWJsZWQgZG9lcyBub3Qgb3ZlcnJpZGUgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNsb3VkX3Nlc3Npb25fc3RvcmFnZV9lbmFibGVkOiB0cnVlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRicpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG91ZF9zZXNzaW9uX3N0b3JhZ2VfZW5hYmxlZCBwb2xpY3kgdW5zZXQgZG9lcyBub3Qgb3ZlcnJpZGUgc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7fTtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgcG9saWN5RGF0YSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaW9uLXR5cGVkIChhcnJheSB8IG51bGwpIHBvbGljeSByZWdpc3RlcnMgYW5kIHBhcnNlcyBKU09OIHN0cmluZyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBjbGVhcigpO1xuXG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdHJyksIEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVHMScsICdwb2xpY3lWYWx1ZUcyJ10pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkcnKSwgWydwb2xpY3lWYWx1ZUcxJywgJ3BvbGljeVZhbHVlRzInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaW9uLXR5cGVkIChhcnJheSB8IG51bGwpIHBvbGljeSBwcmVzZXJ2ZXMgYW4gZW1wdHkgYXJyYXkgKGxvY2tkb3duKSBkaXN0aW5jdCBmcm9tIHVuc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNsZWFyKCk7XG5cblx0XHQvLyBQb2xpY3kgc2V0IHRvIGFuIGVtcHR5IGFycmF5IChlLmcuIGEgbG9ja2Rvd24gYWxsb3dsaXN0KTogbXVzdCByb3VuZC10cmlwIHRvIGBbXWAsIG5vdCBgdW5kZWZpbmVkYC5cblx0XHRjb25zdCBzZXRQb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHNldFBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdIJyksIEpTT04uc3RyaW5naWZ5KFtdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5IJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndW5pb24tdHlwZWQgKGFycmF5IHwgbnVsbCkgcG9saWN5IHVuc2V0IGxlYXZlcyB0aGUgc2V0dGluZyBhdCBpdHMgZGVmYXVsdCAoZGlzdGluY3QgZnJvbSBlbXB0eSBhcnJheSknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgY2xlYXIoKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0gnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuSCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBOEQ7QUFDdkUsU0FBUyxzQkFBc0IsMkJBQTJCO0FBRzFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sdUJBQXdDO0FBQUEsRUFDN0Msd0JBQXdCO0FBQUEsSUFDdkIsSUFBSTtBQUFBLElBQ0osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLEVBQ2I7QUFBQSxFQUNBLGFBQWE7QUFBQSxFQUNiLFlBQVk7QUFBQSxFQUNaLFdBQVc7QUFDWjtBQUVBLE1BQU0sdUJBQTBEO0FBQUEsRUFVL0QsWUFDVSxnQkFDQSxhQUEwQixDQUFDLEdBQ25DO0FBRlE7QUFDQTtBQVZWLFNBQVMsNEJBQTRCLE1BQU07QUFDM0MsU0FBUyx3QkFBd0IsTUFBTTtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDhCQUE4QixNQUFNO0FBQzdDLFNBQVMsNkJBQW1DO0FBQzVDLFNBQVMsMkJBQWlDO0FBQzFDLFNBQVMsNkJBQXNDO0FBQUEsRUFLM0M7QUFBQSxFQUVKLDBDQUFpRjtBQUNoRixXQUFPLEtBQUssZUFBZTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxpQkFBaUIsTUFBc0I7QUFDdEMsV0FBTyxzQkFBc0IsSUFBSTtBQUFBLEVBQ2xDO0FB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
