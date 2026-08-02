import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { PolicyCategory } from "../../../../../base/common/policy.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Extensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { DefaultConfiguration, PolicyConfiguration } from "../../../../../platform/configuration/common/configurations.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY } from "../../../../../platform/policy/common/copilotManagedSettings.js";
import { AbstractPolicyService } from "../../../../../platform/policy/common/policy.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { DefaultAccountService } from "../../../accounts/browser/defaultAccount.js";
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, AccountPolicyService, APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME } from "../../common/accountPolicyService.js";
const BASE_DEFAULT_ACCOUNT = {
  authenticationProvider: {
    id: "github",
    name: "GitHub",
    enterprise: false
  },
  accountName: "testuser",
  sessionId: "abc123",
  enterprise: false
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
suite("AccountPolicyService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let policyService;
  let defaultAccountService;
  let policyConfiguration;
  const logService = new NullLogService();
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
          value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" ? false : void 0,
          managedSettings: {
            [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" }
          }
        }
      },
      "setting.G": {
        "type": "object",
        "additionalProperties": { "type": "boolean" },
        "default": {},
        policy: {
          name: "PolicySettingG",
          category: PolicyCategory.Extensions,
          minimumVersion: "1.0.0",
          localization: { description: { key: "", value: "" } },
          value: (policyData) => policyData.managedSettings?.[COPILOT_ENABLED_PLUGINS_KEY],
          managedSettings: {
            [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
          }
        }
      }
    }
  };
  suiteSetup(() => Registry.as(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
  suiteTeardown(() => Registry.as(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));
  setup(async () => {
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
  });
  async function assertDefaultBehavior(policyData) {
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
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
      const B = policyConfiguration.configurationModel.getValue("setting.B");
      const C = policyConfiguration.configurationModel.getValue("setting.C");
      const D = policyConfiguration.configurationModel.getValue("setting.D");
      assert.strictEqual(B, void 0);
      assert.deepStrictEqual(C, void 0);
      assert.strictEqual(D, void 0);
    }
  }
  test("should initialize with default account", async () => {
    await assertDefaultBehavior(void 0);
  });
  test("should initialize with default account and preview features enabled", async () => {
    await assertDefaultBehavior({ chat_preview_features_enabled: true });
  });
  test("should initialize with default account and preview features disabled", async () => {
    const policyData = { chat_preview_features_enabled: false };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
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
      const B = actualConfigurationModel.getValue("setting.B");
      const C = actualConfigurationModel.getValue("setting.C");
      const D = actualConfigurationModel.getValue("setting.D");
      assert.strictEqual(B, "policyValueB");
      assert.deepStrictEqual(C, ["policyValueC1", "policyValueC2"]);
      assert.strictEqual(D, false);
    }
  });
  test("should apply managed-settings policy data from default account", async () => {
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      policy: policyService.getPolicyValue("PolicySettingF"),
      configuration: policyConfiguration.configurationModel.getValue("setting.F")
    }, {
      policy: false,
      configuration: false
    });
  });
  test("should apply managed-settings policy data from native managed-settings service", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      policy: policyService.getPolicyValue("PolicySettingF"),
      configuration: policyConfiguration.configurationModel.getValue("setting.F"),
      registeredManagedSettings: nativeManagedSettingsService.registeredManagedSettings
    }, {
      policy: false,
      configuration: false,
      registeredManagedSettings: {
        [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" },
        [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
      }
    });
  });
  test("managed settings: native MDM value wins over server for the same declared key", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
  });
  test("managed settings: native MDM applies when the server provides no managed settings", async () => {
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
  });
  test("managed settings: three-channel precedence native MDM > Server > File", async () => {
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "file-value" });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    const policyData = { managedSettings: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" } };
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
  });
  test("managed settings: file-based settings apply when server and MDM are empty", async () => {
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({}));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.strictEqual(policyService.getPolicyValue("PolicySettingF"), false);
  });
  test("managed settings: per-key precedence merges across channels \u2014 different keys win from different channels", async () => {
    const enabledPluginsJson = '{"assign-issue@skills":true}';
    const fileManagedSettingsService = new FakeFileManagedSettingsService({ [COPILOT_ENABLED_PLUGINS_KEY]: enabledPluginsJson });
    const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }));
    policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService, void 0, nativeManagedSettingsService, fileManagedSettingsService));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));
    defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, {}));
    await defaultAccountService.refresh();
    await policyConfiguration.initialize();
    assert.deepStrictEqual({
      settingF: policyConfiguration.configurationModel.getValue("setting.F"),
      settingG: policyConfiguration.configurationModel.getValue("setting.G")
    }, {
      settingF: false,
      settingG: { "assign-issue@skills": true }
    });
  });
  test("managed settings: an object-typed setting resolves identically from server and native MDM JSON strings", async () => {
    const json = '{"assign-issue@skills":true,"other@acme":false}';
    const expected = { "assign-issue@skills": true, "other@acme": false };
    const resolveEnabledPlugins = async (source) => {
      const accountService = disposables.add(new DefaultAccountService(TestProductService));
      const nativeManagedSettingsService = disposables.add(new FakeNativeManagedSettingsService(
        source.mdm !== void 0 ? { [COPILOT_ENABLED_PLUGINS_KEY]: source.mdm } : {}
      ));
      const svc = disposables.add(new AccountPolicyService(logService, accountService, void 0, nativeManagedSettingsService));
      const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
      await defaultConfiguration.initialize();
      const config = disposables.add(new PolicyConfiguration(defaultConfiguration, svc, new NullLogService()));
      const policyData = source.server !== void 0 ? { managedSettings: { [COPILOT_ENABLED_PLUGINS_KEY]: source.server } } : {};
      accountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
      await accountService.refresh();
      await config.initialize();
      return config.configurationModel.getValue("setting.G");
    };
    const serverConfig = await resolveEnabledPlugins({ server: json });
    const mdmConfig = await resolveEnabledPlugins({ mdm: json });
    assert.deepStrictEqual({ serverConfig, mdmConfig }, { serverConfig: expected, mdmConfig: expected });
  });
  const APPROVED_ORG_ACCOUNT = {
    ...BASE_DEFAULT_ACCOUNT,
    entitlementsData: {
      access_type_sku: "sku",
      chat_enabled: true,
      assigned_date: "",
      can_signup_for_limited: false,
      copilot_plan: "pro",
      organization_login_list: ["ApprovedOrg"],
      analytics_tracking_id: ""
    }
  };
  const UNAPPROVED_ORG_ACCOUNT = {
    ...BASE_DEFAULT_ACCOUNT,
    entitlementsData: {
      access_type_sku: "sku",
      chat_enabled: true,
      assigned_date: "",
      can_signup_for_limited: false,
      copilot_plan: "pro",
      organization_login_list: ["SomeOtherOrg"],
      analytics_tracking_id: ""
    }
  };
  class FakeManagedPolicyService extends AbstractPolicyService {
    constructor() {
      super(...arguments);
      this.fakePolicies = /* @__PURE__ */ new Map();
    }
    setPolicy(name, value) {
      if (value === void 0) {
        if (this.fakePolicies.delete(name)) {
          this._onDidChange.fire([name]);
        }
      } else {
        this.fakePolicies.set(name, value);
        this._onDidChange.fire([name]);
      }
    }
    getPolicyValue(name) {
      return this.fakePolicies.get(name);
    }
    async _updatePolicyDefinitions() {
    }
  }
  class FakeNativeManagedSettingsService {
    constructor(managedSettings = {}) {
      this.managedSettings = managedSettings;
      this._onDidChangeManagedSettings = new Emitter();
      this.onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;
      this.registeredManagedSettings = {};
    }
    async updatePolicyDefinitions(policyDefinitions) {
      this.registeredManagedSettings = {};
      for (const policyName in policyDefinitions) {
        const managedSettings = policyDefinitions[policyName].managedSettings;
        if (managedSettings) {
          for (const key in managedSettings) {
            this.registeredManagedSettings[key] = managedSettings[key];
          }
        }
      }
      return this.managedSettings;
    }
    setManagedSettings(managedSettings) {
      this.managedSettings = managedSettings;
      this._onDidChangeManagedSettings.fire(this.managedSettings);
    }
    dispose() {
      this._onDidChangeManagedSettings.dispose();
    }
  }
  class FakeFileManagedSettingsService {
    constructor(managedSettings = {}) {
      this.managedSettings = managedSettings;
      this.rawManagedSettings = {};
      this.onDidChangeRawManagedSettings = Event.None;
      this._onDidChangeManagedSettings = new Emitter();
      this.onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;
    }
  }
  async function setupGate(opts) {
    const managed = disposables.add(new FakeManagedPolicyService());
    if (opts.approvedOrgs !== void 0) {
      const value = typeof opts.approvedOrgs === "string" ? opts.approvedOrgs : JSON.stringify(opts.approvedOrgs);
      managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, value);
    }
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    if (opts.account !== null && opts.account !== void 0) {
      const policyData = opts.policyData === void 0 ? {} : opts.policyData;
      accountService.setDefaultAccountProvider(new DefaultAccountProvider(opts.account, policyData));
      await accountService.refresh();
    }
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    return { policyService: service, managed };
  }
  test("gate inactive (no approved orgs set): behaves identically to today", async () => {
    const { policyService: policyService2 } = await setupGate({ account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
  });
  test("gate active, no account signed in: restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: null });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.NoAccount);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingA"), void 0);
  });
  test("gate active, signed in but org not approved: restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
  });
  test("gate active, account in approved org but policyData null (pre-resolution): restricted", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["approvedorg"], account: APPROVED_ORG_ACCOUNT, policyData: null });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(policyService2.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.PolicyNotResolved);
  });
  test("gate active, satisfied (case-insensitive org match): account policy values flow normally", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: [" approvedorg ", " Other "], account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingD"), false);
    assert.strictEqual(policyService2.getPolicyValue("PolicySettingA"), void 0);
  });
  test('gate active, wildcard "*" satisfies any signed-in account', async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["*"], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
  });
  test("approved org list empty: gate inactive", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: [], account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
  });
  test("approved orgs raw non-array string from policy service: gate inactive (fail-safe)", async () => {
    const { policyService: policyService2 } = await setupGate({ approvedOrgs: "github", account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Inactive);
  });
  test("gate active, signed in with non-GitHub provider: WrongProvider reason", async () => {
    class MismatchedProvider extends DefaultAccountProvider {
      getDefaultAccountAuthenticationProvider() {
        return { id: "github", name: "GitHub", enterprise: false };
      }
    }
    const NON_GITHUB_ACCOUNT = {
      ...APPROVED_ORG_ACCOUNT,
      authenticationProvider: { id: "microsoft", name: "Microsoft", enterprise: false }
    };
    const managed = disposables.add(new FakeManagedPolicyService());
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["ApprovedOrg"]));
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    accountService.setDefaultAccountProvider(new MismatchedProvider(NON_GITHUB_ACCOUNT, {}));
    await accountService.refresh();
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.WrongProvider);
  });
  test("explicit `restrictedValue` is honored when gate is restricted", async () => {
    const node = {
      id: "restrictedValueConfig",
      order: 2,
      title: "r",
      type: "object",
      properties: {
        "setting.RV": {
          type: "string",
          default: "open",
          policy: {
            name: "PolicySettingRV",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } },
            restrictedValue: "locked"
          }
        }
      }
    };
    Registry.as(Extensions.Configuration).registerConfiguration(node);
    try {
      const { policyService: policyService2 } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: null });
      assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
      assert.strictEqual(policyService2.getPolicyValue("PolicySettingRV"), "locked");
    } finally {
      Registry.as(Extensions.Configuration).deregisterConfigurations([node]);
    }
  });
  test("onDidChangeGateInfo fires on state/reason transitions", async () => {
    const { policyService: policyService2, managed } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    const events = [];
    disposables.add(policyService2.onDidChangeGateInfo((info) => events.push(info)));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["OnlyOtherOrg"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify([]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(
      events.map((e) => ({ state: e.state, reason: e.reason })),
      [
        { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved },
        { state: AccountPolicyGateState.Inactive, reason: void 0 }
      ]
    );
  });
  test("boot race: gate is fail-closed until async managed policy service resolves", async () => {
    class AsyncManagedPolicyService extends FakeManagedPolicyService {
      constructor(seedValue) {
        super();
        this._seeded = false;
        this._seedValue = seedValue;
      }
      getPolicyValue(name) {
        if (!this._seeded) {
          return void 0;
        }
        return super.getPolicyValue(name);
      }
      async seed() {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this._seeded = true;
        this.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, this._seedValue);
      }
    }
    const managed = disposables.add(new AsyncManagedPolicyService(JSON.stringify(["OnlyOtherOrg"])));
    const accountService = disposables.add(new DefaultAccountService(TestProductService));
    accountService.setDefaultAccountProvider(new DefaultAccountProvider(APPROVED_ORG_ACCOUNT, {}));
    await accountService.refresh();
    const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
    const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
    await defaultConfiguration.initialize();
    const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
    await config.initialize();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Inactive);
    await managed.seed();
    assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
  });
  test("managed policy change re-evaluates the gate and fires onDidChange", async () => {
    const { policyService: policyService2, managed } = await setupGate({ approvedOrgs: ["ApprovedOrg"], account: APPROVED_ORG_ACCOUNT, policyData: {} });
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Satisfied);
    const changes = [];
    disposables.add(policyService2.onDidChange((names) => changes.push(...names)));
    managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(["OnlyOtherOrg"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(policyService2.gateInfo.state, AccountPolicyGateState.Restricted);
    assert.ok(changes.length > 0, "expected onDidChange to fire when gate flips");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wb2xpY2llcy90ZXN0L2Jyb3dzZXIvYWNjb3VudFBvbGljeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudCwgSURlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlciwgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hbmFnZWRTZXR0aW5nc0RhdGEsIFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IERlZmF1bHRDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50UHJvdmlkZXIsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZLCBDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVksIElOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlLCBJUG9saWN5U2VydmljZSwgUG9saWN5RGVmaW5pdGlvbiwgUG9saWN5VmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUZXN0UHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWNjb3VudHMvYnJvd3Nlci9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLCBBY2NvdW50UG9saWN5U2VydmljZSwgQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FLCBJQWNjb3VudFBvbGljeUdhdGVJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjY291bnRQb2xpY3lTZXJ2aWNlLmpzJztcblxuY29uc3QgQkFTRV9ERUZBVUxUX0FDQ09VTlQ6IElEZWZhdWx0QWNjb3VudCA9IHtcblx0YXV0aGVudGljYXRpb25Qcm92aWRlcjoge1xuXHRcdGlkOiAnZ2l0aHViJyxcblx0XHRuYW1lOiAnR2l0SHViJyxcblx0XHRlbnRlcnByaXNlOiBmYWxzZSxcblx0fSxcblx0YWNjb3VudE5hbWU6ICd0ZXN0dXNlcicsXG5cdHNlc3Npb25JZDogJ2FiYzEyMycsXG5cdGVudGVycHJpc2U6IGZhbHNlLFxufTtcblxuY2xhc3MgRGVmYXVsdEFjY291bnRQcm92aWRlciBpbXBsZW1lbnRzIElEZWZhdWx0QWNjb3VudFByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURlZmF1bHRBY2NvdW50ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQb2xpY3lEYXRhID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgY29waWxvdFRva2VuSW5mbyA9IG51bGw7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29waWxvdFRva2VuSW5mbyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOiBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0OiBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U6IHVua25vd24gPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50OiBJRGVmYXVsdEFjY291bnQsXG5cdFx0cmVhZG9ubHkgcG9saWN5RGF0YTogSVBvbGljeURhdGEgfCBudWxsID0ge30sXG5cdCkgeyB9XG5cblx0Z2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXI7XG5cdH1cblxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRBY2NvdW50O1xuXHR9XG5cblx0YXN5bmMgc2lnbkluKCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0YXN5bmMgc2lnbk91dCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5zdWl0ZSgnQWNjb3VudFBvbGljeVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcG9saWN5U2VydmljZTogQWNjb3VudFBvbGljeVNlcnZpY2U7XG5cdGxldCBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2U7XG5cdGxldCBwb2xpY3lDb25maWd1cmF0aW9uOiBQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0Y29uc3QgcG9saWN5Q29uZmlndXJhdGlvbk5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHQnaWQnOiAncG9saWN5Q29uZmlndXJhdGlvbicsXG5cdFx0J29yZGVyJzogMSxcblx0XHQndGl0bGUnOiAnYScsXG5cdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdCdzZXR0aW5nLkEnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdkZWZhdWx0JzogJ2RlZmF1bHRWYWx1ZUEnLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0EnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5CJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZGVmYXVsdCc6ICdkZWZhdWx0VmFsdWVCJyxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdCJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/ICdwb2xpY3lWYWx1ZUInIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuQyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0XHQnZGVmYXVsdCc6IFsnZGVmYXVsdFZhbHVlQzEnLCAnZGVmYXVsdFZhbHVlQzInXSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdDJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/IEpTT04uc3RyaW5naWZ5KFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRCc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0bmFtZTogJ1BvbGljeVNldHRpbmdEJyxcblx0XHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuRXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHR2YWx1ZTogcG9saWN5RGF0YSA9PiBwb2xpY3lEYXRhLmNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkID09PSBmYWxzZSA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRSc6IHtcblx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHQnc2V0dGluZy5GJzoge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0YnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV0gPT09ICdkaXNhYmxlJyA/IGZhbHNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J3NldHRpbmcuRyc6IHtcblx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0J2FkZGl0aW9uYWxQcm9wZXJ0aWVzJzogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHQnZGVmYXVsdCc6IHt9LFxuXHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ0cnLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICcnLCB2YWx1ZTogJycgfSB9LFxuXHRcdFx0XHRcdHZhbHVlOiBwb2xpY3lEYXRhID0+IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXSxcblx0XHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cblx0c3VpdGVTZXR1cCgoKSA9PiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uTm9kZSkpO1xuXHRzdWl0ZVRlYXJkb3duKCgpID0+IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtwb2xpY3lDb25maWd1cmF0aW9uTm9kZV0pKTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0QWNjb3VudFNlcnZpY2UoVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlKSk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnREZWZhdWx0QmVoYXZpb3IocG9saWN5RGF0YTogSVBvbGljeURhdGEgfCB1bmRlZmluZWQpIHtcblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwgcG9saWN5RGF0YSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdHtcblx0XHRcdGNvbnN0IEEgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQScpO1xuXHRcdFx0Y29uc3QgQiA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdCJyk7XG5cdFx0XHRjb25zdCBDID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0MnKTtcblx0XHRcdGNvbnN0IEQgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRCcpO1xuXG5cdFx0XHQvLyBObyBwb2xpY3kgaXMgc2V0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoRCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBCID0gcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQicpO1xuXHRcdFx0Y29uc3QgQyA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkMnKTtcblx0XHRcdGNvbnN0IEQgPSBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5EJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblxuXHR0ZXN0KCdzaG91bGQgaW5pdGlhbGl6ZSB3aXRoIGRlZmF1bHQgYWNjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnREZWZhdWx0QmVoYXZpb3IodW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGluaXRpYWxpemUgd2l0aCBkZWZhdWx0IGFjY291bnQgYW5kIHByZXZpZXcgZmVhdHVyZXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnREZWZhdWx0QmVoYXZpb3IoeyBjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGluaXRpYWxpemUgd2l0aCBkZWZhdWx0IGFjY291bnQgYW5kIHByZXZpZXcgZmVhdHVyZXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcG9saWN5RGF0YTogSVBvbGljeURhdGEgPSB7IGNoYXRfcHJldmlld19mZWF0dXJlc19lbmFibGVkOiBmYWxzZSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbCA9IHBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgQSA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdBJyk7XG5cdFx0XHRjb25zdCBCID0gcG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0InKTtcblx0XHRcdGNvbnN0IEMgPSBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQycpO1xuXHRcdFx0Y29uc3QgRCA9IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChBLCB1bmRlZmluZWQpOyAvLyBOb3QgdGFnZ2VkIHdpdGggY2hhdCBwcmV2aWV3IHRhZ3Ncblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQywgSlNPTi5zdHJpbmdpZnkoWydwb2xpY3lWYWx1ZUMxJywgJ3BvbGljeVZhbHVlQzInXSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHR7XG5cdFx0XHRjb25zdCBCID0gYWN0dWFsQ29uZmlndXJhdGlvbk1vZGVsLmdldFZhbHVlKCdzZXR0aW5nLkInKTtcblx0XHRcdGNvbnN0IEMgPSBhY3R1YWxDb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuQycpO1xuXHRcdFx0Y29uc3QgRCA9IGFjdHVhbENvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5EJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChCLCAncG9saWN5VmFsdWVCJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEMsIFsncG9saWN5VmFsdWVDMScsICdwb2xpY3lWYWx1ZUMyJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEQsIGZhbHNlKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhcHBseSBtYW5hZ2VkLXNldHRpbmdzIHBvbGljeSBkYXRhIGZyb20gZGVmYXVsdCBhY2NvdW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0geyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZGlzYWJsZScgfSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwb2xpY3k6IHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdGJyksXG5cdFx0XHRjb25maWd1cmF0aW9uOiBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksXG5cdFx0fSwge1xuXHRcdFx0cG9saWN5OiBmYWxzZSxcblx0XHRcdGNvbmZpZ3VyYXRpb246IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYXBwbHkgbWFuYWdlZC1zZXR0aW5ncyBwb2xpY3kgZGF0YSBmcm9tIG5hdGl2ZSBtYW5hZ2VkLXNldHRpbmdzIHNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cG9saWN5OiBwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nRicpLFxuXHRcdFx0Y29uZmlndXJhdGlvbjogcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRicpLFxuXHRcdFx0cmVnaXN0ZXJlZE1hbmFnZWRTZXR0aW5nczogbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZS5yZWdpc3RlcmVkTWFuYWdlZFNldHRpbmdzLFxuXHRcdH0sIHtcblx0XHRcdHBvbGljeTogZmFsc2UsXG5cdFx0XHRjb25maWd1cmF0aW9uOiBmYWxzZSxcblx0XHRcdHJlZ2lzdGVyZWRNYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiBuYXRpdmUgTURNIHZhbHVlIHdpbnMgb3ZlciBzZXJ2ZXIgZm9yIHRoZSBzYW1lIGRlY2xhcmVkIGtleScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZXJ2ZXIgc2F5cyAnZW5hYmxlJywgbmF0aXZlIE1ETSBzYXlzICdkaXNhYmxlJy4gTmF0aXZlIE1ETSBpcyB0aGUgYXV0aG9yaXRhdGl2ZVxuXHRcdC8vIHNvdXJjZSB3aGVuIHByZXNlbnQsIHNvIHRoZSBzZXJ2ZXIgdmFsdWUgaXMgaWdub3JlZCBlbnRpcmVseSBhbmQgdGhlIGdhdGVkIHBvbGljeSBJU1xuXHRcdC8vIGZvcmNlZCB0byBgZmFsc2VgLlxuXHRcdGNvbnN0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZGlzYWJsZScgfSkpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSwgdW5kZWZpbmVkLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSA9IHsgbWFuYWdlZFNldHRpbmdzOiB7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2VuYWJsZScgfSB9O1xuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0YXdhaXQgZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblxuXHRcdGF3YWl0IHBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdGJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZCBzZXR0aW5nczogbmF0aXZlIE1ETSBhcHBsaWVzIHdoZW4gdGhlIHNlcnZlciBwcm92aWRlcyBubyBtYW5hZ2VkIHNldHRpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE5vIHNlcnZlciBtYW5hZ2VkIHNldHRpbmdzIFx1MjAxNCBuYXRpdmUgTURNIGlzIHRoZSBhdXRob3JpdGF0aXZlIHNvdXJjZSBhbmQgZm9yY2VzIHRoZVxuXHRcdC8vIGdhdGVkIHBvbGljeSB0byBgZmFsc2VgLlxuXHRcdGNvbnN0IG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VOYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZGlzYWJsZScgfSkpO1xuXHRcdHBvbGljeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSwgdW5kZWZpbmVkLCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiB0aHJlZS1jaGFubmVsIHByZWNlZGVuY2UgbmF0aXZlIE1ETSA+IFNlcnZlciA+IEZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQWxsIHRocmVlIGNoYW5uZWxzIHByb3ZpZGUgdGhlIHNhbWUga2V5IHdpdGggZGlmZmVyZW50IHZhbHVlcy5cblx0XHQvLyBTZXJ2ZXIgc2F5cyAnZW5hYmxlJywgTURNIHNheXMgJ2Rpc2FibGUnLCBGaWxlIHNheXMgJ2ZpbGUtdmFsdWUnLlxuXHRcdC8vIE5hdGl2ZSBNRE0gc2hvdWxkIHdpbi5cblx0XHRjb25zdCBmaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IG5ldyBGYWtlRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdmaWxlLXZhbHVlJyB9KTtcblx0XHRjb25zdCBuYXRpdmVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0pKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UsIHVuZGVmaW5lZCwgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0geyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZW5hYmxlJyB9IH07XG5cdFx0ZGVmYXVsdEFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IERlZmF1bHRBY2NvdW50UHJvdmlkZXIoQkFTRV9ERUZBVUxUX0FDQ09VTlQsIHBvbGljeURhdGEpKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHQvLyBOYXRpdmUgTURNIHZhbHVlICdkaXNhYmxlJyB3aW5zIFx1MjAxNCBwb2xpY3kgaXMgZm9yY2VkIHRvIGZhbHNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdGJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZCBzZXR0aW5nczogZmlsZS1iYXNlZCBzZXR0aW5ncyBhcHBseSB3aGVuIHNlcnZlciBhbmQgTURNIGFyZSBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBPbmx5IHRoZSBmaWxlIGNoYW5uZWwgcHJvdmlkZXMgYSB2YWx1ZSBcdTIwMTQgaXQgc2hvdWxkIGJlIHVzZWQuXG5cdFx0Y29uc3QgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSBuZXcgRmFrZUZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZGlzYWJsZScgfSk7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2Uoe30pKTtcblx0XHRwb2xpY3lTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UsIHVuZGVmaW5lZCwgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSwgZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBkZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cdFx0cG9saWN5Q29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgcG9saWN5U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCB7fSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRhd2FpdCBwb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblxuXHRcdC8vIEZpbGUgdmFsdWUgJ2Rpc2FibGUnIGFwcGxpZXMgXHUyMDE0IHBvbGljeSBpcyBmb3JjZWQgdG8gZmFsc2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0YnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiBwZXIta2V5IHByZWNlZGVuY2UgbWVyZ2VzIGFjcm9zcyBjaGFubmVscyBcdTIwMTQgZGlmZmVyZW50IGtleXMgd2luIGZyb20gZGlmZmVyZW50IGNoYW5uZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE5hdGl2ZSBNRE0gc3VwcGxpZXMgb25seSB0aGUgZGlzYWJsZUJ5cGFzcyBrZXk7IHRoZSBmaWxlIHN1cHBsaWVzIG9ubHkgdGhlIGVuYWJsZWRQbHVnaW5zXG5cdFx0Ly8ga2V5LiBOZWl0aGVyIG92ZXJyaWRlcyB0aGUgb3RoZXIsIHNvIEJPVEggcmVhY2ggcG9saWN5IGV2YWx1YXRpb246IHNldHRpbmcgRiByZXNvbHZlcyBmcm9tXG5cdFx0Ly8gbmF0aXZlIE1ETSBhbmQgc2V0dGluZyBHIHJlc29sdmVzIGZyb20gdGhlIGZpbGUuIFRoaXMgaXMgdGhlIHBlci1rZXkgZmlsbC1kb3duIGJlaGF2aW9yLlxuXHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zSnNvbiA9ICd7XCJhc3NpZ24taXNzdWVAc2tpbGxzXCI6dHJ1ZX0nO1xuXHRcdGNvbnN0IGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlID0gbmV3IEZha2VGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZSh7IFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiBlbmFibGVkUGx1Z2luc0pzb24gfSk7XG5cdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdkaXNhYmxlJyB9KSk7XG5cdFx0cG9saWN5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWNjb3VudFBvbGljeVNlcnZpY2UobG9nU2VydmljZSwgZGVmYXVsdEFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsIGZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdHBvbGljeUNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHBvbGljeVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRkZWZhdWx0QWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihCQVNFX0RFRkFVTFRfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXG5cdFx0YXdhaXQgcG9saWN5Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNldHRpbmdGOiBwb2xpY3lDb25maWd1cmF0aW9uLmNvbmZpZ3VyYXRpb25Nb2RlbC5nZXRWYWx1ZSgnc2V0dGluZy5GJyksXG5cdFx0XHRzZXR0aW5nRzogcG9saWN5Q29uZmlndXJhdGlvbi5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRycpLFxuXHRcdH0sIHtcblx0XHRcdHNldHRpbmdGOiBmYWxzZSxcblx0XHRcdHNldHRpbmdHOiB7ICdhc3NpZ24taXNzdWVAc2tpbGxzJzogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkIHNldHRpbmdzOiBhbiBvYmplY3QtdHlwZWQgc2V0dGluZyByZXNvbHZlcyBpZGVudGljYWxseSBmcm9tIHNlcnZlciBhbmQgbmF0aXZlIE1ETSBKU09OIHN0cmluZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU3RydWN0dXJlZC1zZXR0aW5nIGludmFyaWFudDogd2hldGhlciB0aGUgY2Fub25pY2FsIEpTT04gc3RyaW5nIGFycml2ZXMgdmlhIHRoZSBzZXJ2ZXJcblx0XHQvLyBhY2NvdW50IHBvbGljeSBiYWcgb3IgdmlhIG5hdGl2ZSBNRE0sIFBvbGljeUNvbmZpZ3VyYXRpb24gbXVzdCBwYXJzZSBpdCBiYWNrIGludG8gdGhlXG5cdFx0Ly8gU0FNRSB0eXBlZCBvYmplY3QgZm9yIGFuIGBvYmplY3RgLXR5cGVkIHNldHRpbmcuIFRoZSBvbmx5IGRpZmZlcmVuY2UgaXMgdGhlIHNvdXJjZS5cblx0XHRjb25zdCBqc29uID0gJ3tcImFzc2lnbi1pc3N1ZUBza2lsbHNcIjp0cnVlLFwib3RoZXJAYWNtZVwiOmZhbHNlfSc7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7ICdhc3NpZ24taXNzdWVAc2tpbGxzJzogdHJ1ZSwgJ290aGVyQGFjbWUnOiBmYWxzZSB9O1xuXG5cdFx0Y29uc3QgcmVzb2x2ZUVuYWJsZWRQbHVnaW5zID0gYXN5bmMgKHNvdXJjZTogeyBzZXJ2ZXI/OiBzdHJpbmc7IG1kbT86IHN0cmluZyB9KTogUHJvbWlzZTx1bmtub3duPiA9PiB7XG5cdFx0XHRjb25zdCBhY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgbmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UoXG5cdFx0XHRcdHNvdXJjZS5tZG0gIT09IHVuZGVmaW5lZCA/IHsgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHNvdXJjZS5tZG0gfSA6IHt9LFxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGFjY291bnRTZXJ2aWNlLCB1bmRlZmluZWQsIG5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQb2xpY3lDb25maWd1cmF0aW9uKGRlZmF1bHRDb25maWd1cmF0aW9uLCBzdmMsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRcdGNvbnN0IHBvbGljeURhdGE6IElQb2xpY3lEYXRhID0gc291cmNlLnNlcnZlciAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdD8geyBtYW5hZ2VkU2V0dGluZ3M6IHsgW0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHNvdXJjZS5zZXJ2ZXIgfSB9XG5cdFx0XHRcdDoge307XG5cdFx0XHRhY2NvdW50U2VydmljZS5zZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyKG5ldyBEZWZhdWx0QWNjb3VudFByb3ZpZGVyKEJBU0VfREVGQVVMVF9BQ0NPVU5ULCBwb2xpY3lEYXRhKSk7XG5cdFx0XHRhd2FpdCBhY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cdFx0XHRhd2FpdCBjb25maWcuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5jb25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoJ3NldHRpbmcuRycpO1xuXHRcdH07XG5cblx0XHRjb25zdCBzZXJ2ZXJDb25maWcgPSBhd2FpdCByZXNvbHZlRW5hYmxlZFBsdWdpbnMoeyBzZXJ2ZXI6IGpzb24gfSk7XG5cdFx0Y29uc3QgbWRtQ29uZmlnID0gYXdhaXQgcmVzb2x2ZUVuYWJsZWRQbHVnaW5zKHsgbWRtOiBqc29uIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNlcnZlckNvbmZpZywgbWRtQ29uZmlnIH0sIHsgc2VydmVyQ29uZmlnOiBleHBlY3RlZCwgbWRtQ29uZmlnOiBleHBlY3RlZCB9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIFwiUmVxdWlyZSBBcHByb3ZlZCBBY2NvdW50XCIgZ2F0ZVxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRjb25zdCBBUFBST1ZFRF9PUkdfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRcdC4uLkJBU0VfREVGQVVMVF9BQ0NPVU5ULFxuXHRcdGVudGl0bGVtZW50c0RhdGE6IHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ3NrdScsXG5cdFx0XHRjaGF0X2VuYWJsZWQ6IHRydWUsXG5cdFx0XHRhc3NpZ25lZF9kYXRlOiAnJyxcblx0XHRcdGNhbl9zaWdudXBfZm9yX2xpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAncHJvJyxcblx0XHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbJ0FwcHJvdmVkT3JnJ10sXG5cdFx0XHRhbmFseXRpY3NfdHJhY2tpbmdfaWQ6ICcnLFxuXHRcdH0sXG5cdH07XG5cblx0Y29uc3QgVU5BUFBST1ZFRF9PUkdfQUNDT1VOVDogSURlZmF1bHRBY2NvdW50ID0ge1xuXHRcdC4uLkJBU0VfREVGQVVMVF9BQ0NPVU5ULFxuXHRcdGVudGl0bGVtZW50c0RhdGE6IHtcblx0XHRcdGFjY2Vzc190eXBlX3NrdTogJ3NrdScsXG5cdFx0XHRjaGF0X2VuYWJsZWQ6IHRydWUsXG5cdFx0XHRhc3NpZ25lZF9kYXRlOiAnJyxcblx0XHRcdGNhbl9zaWdudXBfZm9yX2xpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0Y29waWxvdF9wbGFuOiAncHJvJyxcblx0XHRcdG9yZ2FuaXphdGlvbl9sb2dpbl9saXN0OiBbJ1NvbWVPdGhlck9yZyddLFxuXHRcdFx0YW5hbHl0aWNzX3RyYWNraW5nX2lkOiAnJyxcblx0XHR9LFxuXHR9O1xuXG5cdGNsYXNzIEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSBleHRlbmRzIEFic3RyYWN0UG9saWN5U2VydmljZSBpbXBsZW1lbnRzIElQb2xpY3lTZXJ2aWNlIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZha2VQb2xpY2llcyA9IG5ldyBNYXA8c3RyaW5nLCBQb2xpY3lWYWx1ZT4oKTtcblxuXHRcdHNldFBvbGljeShuYW1lOiBzdHJpbmcsIHZhbHVlOiBQb2xpY3lWYWx1ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuZmFrZVBvbGljaWVzLmRlbGV0ZShuYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW25hbWVdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5mYWtlUG9saWNpZXMuc2V0KG5hbWUsIHZhbHVlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbbmFtZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldFBvbGljeVZhbHVlKG5hbWU6IHN0cmluZyk6IFBvbGljeVZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLmZha2VQb2xpY2llcy5nZXQobmFtZSk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVQb2xpY3lEZWZpbml0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm8tb3AgKi8gfVxuXHR9XG5cblx0Y2xhc3MgRmFrZU5hdGl2ZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBJTmF0aXZlTWFuYWdlZFNldHRpbmdzU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzID0gbmV3IEVtaXR0ZXI8TWFuYWdlZFNldHRpbmdzRGF0YT4oKTtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncyA9IHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzLmV2ZW50O1xuXHRcdHJlZ2lzdGVyZWRNYW5hZ2VkU2V0dGluZ3M6IFJlY29yZDxzdHJpbmcsIHsgdHlwZTogJ3N0cmluZycgfCAnbnVtYmVyJyB8ICdib29sZWFuJyB9PiA9IHt9O1xuXG5cdFx0Y29uc3RydWN0b3IocHVibGljIG1hbmFnZWRTZXR0aW5nczogTWFuYWdlZFNldHRpbmdzRGF0YSA9IHt9KSB7IH1cblxuXHRcdGFzeW5jIHVwZGF0ZVBvbGljeURlZmluaXRpb25zKHBvbGljeURlZmluaXRpb25zOiBSZWNvcmQ8c3RyaW5nLCBQb2xpY3lEZWZpbml0aW9uPik6IFByb21pc2U8TWFuYWdlZFNldHRpbmdzRGF0YT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlcmVkTWFuYWdlZFNldHRpbmdzID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IHBvbGljeU5hbWUgaW4gcG9saWN5RGVmaW5pdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgbWFuYWdlZFNldHRpbmdzID0gcG9saWN5RGVmaW5pdGlvbnNbcG9saWN5TmFtZV0ubWFuYWdlZFNldHRpbmdzO1xuXHRcdFx0XHRpZiAobWFuYWdlZFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gbWFuYWdlZFNldHRpbmdzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyZWRNYW5hZ2VkU2V0dGluZ3Nba2V5XSA9IG1hbmFnZWRTZXR0aW5nc1trZXldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMubWFuYWdlZFNldHRpbmdzO1xuXHRcdH1cblxuXHRcdHNldE1hbmFnZWRTZXR0aW5ncyhtYW5hZ2VkU2V0dGluZ3M6IE1hbmFnZWRTZXR0aW5nc0RhdGEpOiB2b2lkIHtcblx0XHRcdHRoaXMubWFuYWdlZFNldHRpbmdzID0gbWFuYWdlZFNldHRpbmdzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MuZmlyZSh0aGlzLm1hbmFnZWRTZXR0aW5ncyk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBGYWtlRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgaW1wbGVtZW50cyBJRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2Uge1xuXHRcdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSByYXdNYW5hZ2VkU2V0dGluZ3MgPSB7fTtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncyA9IEV2ZW50Lk5vbmU7XG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MgPSBuZXcgRW1pdHRlcjxNYW5hZ2VkU2V0dGluZ3NEYXRhPigpO1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzID0gdGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MuZXZlbnQ7XG5cblx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgbWFuYWdlZFNldHRpbmdzOiBNYW5hZ2VkU2V0dGluZ3NEYXRhID0ge30pIHsgfVxuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gc2V0dXBHYXRlKG9wdHM6IHtcblx0XHRhcHByb3ZlZE9yZ3M/OiBzdHJpbmdbXSB8IHN0cmluZztcblx0XHRhY2NvdW50PzogSURlZmF1bHRBY2NvdW50IHwgbnVsbDtcblx0XHRwb2xpY3lEYXRhPzogSVBvbGljeURhdGEgfCBudWxsO1xuXHR9KTogUHJvbWlzZTx7IHBvbGljeVNlcnZpY2U6IEFjY291bnRQb2xpY3lTZXJ2aWNlOyBtYW5hZ2VkOiBGYWtlTWFuYWdlZFBvbGljeVNlcnZpY2UgfT4ge1xuXHRcdGNvbnN0IG1hbmFnZWQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZha2VNYW5hZ2VkUG9saWN5U2VydmljZSgpKTtcblx0XHRpZiAob3B0cy5hcHByb3ZlZE9yZ3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gTWlycm9yIGhvdyB0aGUgcGxhdGZvcm0gZGVsaXZlcnMgYXJyYXktdHlwZWQgcG9saWN5IHZhbHVlcyB0byBBYnN0cmFjdFBvbGljeVNlcnZpY2U6XG5cdFx0XHQvLyBhcyBhIEpTT04tc3RyaW5naWZpZWQgYXJyYXkuIFRlc3RzIGNhbiBwYXNzIGEgcmF3IHN0cmluZyB0byBleGVyY2lzZSBlZGdlIGNhc2VzLlxuXHRcdFx0Y29uc3QgdmFsdWUgPSB0eXBlb2Ygb3B0cy5hcHByb3ZlZE9yZ3MgPT09ICdzdHJpbmcnID8gb3B0cy5hcHByb3ZlZE9yZ3MgOiBKU09OLnN0cmluZ2lmeShvcHRzLmFwcHJvdmVkT3Jncyk7XG5cdFx0XHRtYW5hZ2VkLnNldFBvbGljeShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUsIHZhbHVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdGlmIChvcHRzLmFjY291bnQgIT09IG51bGwgJiYgb3B0cy5hY2NvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHBvbGljeURhdGEgPSBvcHRzLnBvbGljeURhdGEgPT09IHVuZGVmaW5lZCA/IHt9IDogb3B0cy5wb2xpY3lEYXRhO1xuXHRcdFx0YWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihvcHRzLmFjY291bnQsIHBvbGljeURhdGEpKTtcblx0XHRcdGF3YWl0IGFjY291bnRTZXJ2aWNlLnJlZnJlc2goKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBhY2NvdW50U2VydmljZSwgbWFuYWdlZCkpO1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBjb25maWcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgY29uZmlnLmluaXRpYWxpemUoKTtcblx0XHRyZXR1cm4geyBwb2xpY3lTZXJ2aWNlOiBzZXJ2aWNlLCBtYW5hZ2VkIH07XG5cdH1cblxuXHR0ZXN0KCdnYXRlIGluYWN0aXZlIChubyBhcHByb3ZlZCBvcmdzIHNldCk6IGJlaGF2ZXMgaWRlbnRpY2FsbHkgdG8gdG9kYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhY2NvdW50OiBBUFBST1ZFRF9PUkdfQUNDT1VOVCwgcG9saWN5RGF0YTogeyBjaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZDogZmFsc2UgfSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5JbmFjdGl2ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyksIGZhbHNlKTsgLy8gYWNjb3VudCBwb2xpY3kgc3RpbGwgZmxvd3Ncblx0fSk7XG5cblx0dGVzdCgnZ2F0ZSBhY3RpdmUsIG5vIGFjY291bnQgc2lnbmVkIGluOiByZXN0cmljdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbJ0FwcHJvdmVkT3JnJ10sIGFjY291bnQ6IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8ucmVhc29uLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLk5vQWNjb3VudCk7XG5cdFx0Ly8gUmVzdHJpY3RlZCB2YWx1ZXMgYXBwbGllZCB0byBwb2xpY2llcyB0aGF0IG9wdCBpbnRvIHRoZSBnYXRlLlxuXHRcdC8vIFBvbGljeVNldHRpbmdEIGhhcyBhIGB2YWx1ZWAgY2FsbGJhY2sgXHUyMTkyIGZhbGxzIGJhY2sgdG8gdHlwZS1kZWZhdWx0IGBmYWxzZWAuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdEJyksIGZhbHNlKTtcblx0XHQvLyBQb2xpY3lTZXR0aW5nQSBkb2VzIE5PVCBvcHQgaW4gKG5vIGB2YWx1ZWAsIG5vIGByZXN0cmljdGVkVmFsdWVgKSBcdTIxOTIgdW5jaGFuZ2VkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdldFBvbGljeVZhbHVlKCdQb2xpY3lTZXR0aW5nQScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnYXRlIGFjdGl2ZSwgc2lnbmVkIGluIGJ1dCBvcmcgbm90IGFwcHJvdmVkOiByZXN0cmljdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbJ0FwcHJvdmVkT3JnJ10sIGFjY291bnQ6IFVOQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHt9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlJlc3RyaWN0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnJlYXNvbiwgQWNjb3VudFBvbGljeUdhdGVVbnNhdGlzZmllZFJlYXNvbi5PcmdOb3RBcHByb3ZlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGUgYWN0aXZlLCBhY2NvdW50IGluIGFwcHJvdmVkIG9yZyBidXQgcG9saWN5RGF0YSBudWxsIChwcmUtcmVzb2x1dGlvbik6IHJlc3RyaWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnYXBwcm92ZWRvcmcnXSwgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8ucmVhc29uLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLlBvbGljeU5vdFJlc29sdmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZSBhY3RpdmUsIHNhdGlzZmllZCAoY2FzZS1pbnNlbnNpdGl2ZSBvcmcgbWF0Y2gpOiBhY2NvdW50IHBvbGljeSB2YWx1ZXMgZmxvdyBub3JtYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogWycgYXBwcm92ZWRvcmcgJywgJyBPdGhlciAnXSwgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHsgY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQ6IGZhbHNlIH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuU2F0aXNmaWVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nZXRQb2xpY3lWYWx1ZSgnUG9saWN5U2V0dGluZ0QnKSwgZmFsc2UpOyAvLyBmcm9tIGFjY291bnQgcG9saWN5IGRhdGEsIG5vdCByZXN0cmljdGVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdBJyksIHVuZGVmaW5lZCk7IC8vIG5vdCBkcml2ZW4gYnkgYWNjb3VudFxuXHR9KTtcblxuXHR0ZXN0KCdnYXRlIGFjdGl2ZSwgd2lsZGNhcmQgXCIqXCIgc2F0aXNmaWVzIGFueSBzaWduZWQtaW4gYWNjb3VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogWycqJ10sIGFjY291bnQ6IFVOQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHt9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlNhdGlzZmllZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcHJvdmVkIG9yZyBsaXN0IGVtcHR5OiBnYXRlIGluYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcG9saWN5U2VydmljZSB9ID0gYXdhaXQgc2V0dXBHYXRlKHsgYXBwcm92ZWRPcmdzOiBbXSwgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHt9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLkluYWN0aXZlKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwcm92ZWQgb3JncyByYXcgbm9uLWFycmF5IHN0cmluZyBmcm9tIHBvbGljeSBzZXJ2aWNlOiBnYXRlIGluYWN0aXZlIChmYWlsLXNhZmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIERlZmVuc2l2ZTogaWYgc29tZSBwbGF0Zm9ybSBkZWxpdmVycyB0aGUgcG9saWN5IGFzIGEgbm9uLUpTT04gc3RyaW5nLCB0cmVhdCBpdCBhcyBuby1vcmdzXG5cdFx0Ly8gcmF0aGVyIHRoYW4gaGFsZi1wYXJzaW5nIENTVi4gVGhlIHBsYXRmb3JtJ3MgYXJyYXktdHlwZWQgcG9saWN5IGNvbnRyYWN0IG1ha2VzIHRoaXMgcmFyZS5cblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogJ2dpdGh1YicsIGFjY291bnQ6IEFQUFJPVkVEX09SR19BQ0NPVU5ULCBwb2xpY3lEYXRhOiB7fSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5JbmFjdGl2ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGUgYWN0aXZlLCBzaWduZWQgaW4gd2l0aCBub24tR2l0SHViIHByb3ZpZGVyOiBXcm9uZ1Byb3ZpZGVyIHJlYXNvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDdXN0b20gcHJvdmlkZXIgd2hvc2UgY29uZmlndXJlZCBHaXRIdWIgcHJvdmlkZXIgZGlmZmVycyBmcm9tIHRoZSBhY2NvdW50J3MgYWN0dWFsIHByb3ZpZGVyLlxuXHRcdGNsYXNzIE1pc21hdGNoZWRQcm92aWRlciBleHRlbmRzIERlZmF1bHRBY2NvdW50UHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk6IElEZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRcdFx0XHRyZXR1cm4geyBpZDogJ2dpdGh1YicsIG5hbWU6ICdHaXRIdWInLCBlbnRlcnByaXNlOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBOT05fR0lUSFVCX0FDQ09VTlQ6IElEZWZhdWx0QWNjb3VudCA9IHtcblx0XHRcdC4uLkFQUFJPVkVEX09SR19BQ0NPVU5ULFxuXHRcdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcjogeyBpZDogJ21pY3Jvc29mdCcsIG5hbWU6ICdNaWNyb3NvZnQnLCBlbnRlcnByaXNlOiBmYWxzZSB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBtYW5hZ2VkID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlTWFuYWdlZFBvbGljeVNlcnZpY2UoKSk7XG5cdFx0bWFuYWdlZC5zZXRQb2xpY3koQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FLCBKU09OLnN0cmluZ2lmeShbJ0FwcHJvdmVkT3JnJ10pKTtcblx0XHRjb25zdCBhY2NvdW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmYXVsdEFjY291bnRTZXJ2aWNlKFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdGFjY291bnRTZXJ2aWNlLnNldERlZmF1bHRBY2NvdW50UHJvdmlkZXIobmV3IE1pc21hdGNoZWRQcm92aWRlcihOT05fR0lUSFVCX0FDQ09VTlQsIHt9KSk7XG5cdFx0YXdhaXQgYWNjb3VudFNlcnZpY2UucmVmcmVzaCgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjY291bnRQb2xpY3lTZXJ2aWNlKGxvZ1NlcnZpY2UsIGFjY291bnRTZXJ2aWNlLCBtYW5hZ2VkKSk7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUG9saWN5Q29uZmlndXJhdGlvbihkZWZhdWx0Q29uZmlndXJhdGlvbiwgc2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRhd2FpdCBjb25maWcuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2F0ZUluZm8ucmVhc29uLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLldyb25nUHJvdmlkZXIpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBgcmVzdHJpY3RlZFZhbHVlYCBpcyBob25vcmVkIHdoZW4gZ2F0ZSBpcyByZXN0cmljdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdGlkOiAncmVzdHJpY3RlZFZhbHVlQ29uZmlnJyxcblx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0dGl0bGU6ICdyJyxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHQnc2V0dGluZy5SVic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb3BlbicsXG5cdFx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnUG9saWN5U2V0dGluZ1JWJyxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0gfSxcblx0XHRcdFx0XHRcdHJlc3RyaWN0ZWRWYWx1ZTogJ2xvY2tlZCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbihub2RlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnQXBwcm92ZWRPcmcnXSwgYWNjb3VudDogbnVsbCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlJlc3RyaWN0ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2V0UG9saWN5VmFsdWUoJ1BvbGljeVNldHRpbmdSVicpLCAnbG9ja2VkJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZGVyZWdpc3RlckNvbmZpZ3VyYXRpb25zKFtub2RlXSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZUdhdGVJbmZvIGZpcmVzIG9uIHN0YXRlL3JlYXNvbiB0cmFuc2l0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHBvbGljeVNlcnZpY2UsIG1hbmFnZWQgfSA9IGF3YWl0IHNldHVwR2F0ZSh7IGFwcHJvdmVkT3JnczogWydBcHByb3ZlZE9yZyddLCBhY2NvdW50OiBBUFBST1ZFRF9PUkdfQUNDT1VOVCwgcG9saWN5RGF0YToge30gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBvbGljeVNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuU2F0aXNmaWVkKTtcblxuXHRcdGNvbnN0IGV2ZW50czogSUFjY291bnRQb2xpY3lHYXRlSW5mb1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBvbGljeVNlcnZpY2Uub25EaWRDaGFuZ2VHYXRlSW5mbyhpbmZvID0+IGV2ZW50cy5wdXNoKGluZm8pKSk7XG5cblx0XHQvLyBTYXRpc2ZpZWQgXHUyMTkyIFJlc3RyaWN0ZWQgKG9yZyBubyBsb25nZXIgYXBwcm92ZWQpXG5cdFx0bWFuYWdlZC5zZXRQb2xpY3koQVBQUk9WRURfQUNDT1VOVF9PUkdBTklaQVRJT05TX1BPTElDWV9OQU1FLCBKU09OLnN0cmluZ2lmeShbJ09ubHlPdGhlck9yZyddKSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHQvLyBSZXN0cmljdGVkIFx1MjE5MiBJbmFjdGl2ZSAoZ2F0ZSBkaXNhYmxlZClcblx0XHRtYW5hZ2VkLnNldFBvbGljeShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUsIEpTT04uc3RyaW5naWZ5KFtdKSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRldmVudHMubWFwKGUgPT4gKHsgc3RhdGU6IGUuc3RhdGUsIHJlYXNvbjogZS5yZWFzb24gfSkpLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHN0YXRlOiBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlJlc3RyaWN0ZWQsIHJlYXNvbjogQWNjb3VudFBvbGljeUdhdGVVbnNhdGlzZmllZFJlYXNvbi5PcmdOb3RBcHByb3ZlZCB9LFxuXHRcdFx0XHR7IHN0YXRlOiBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLkluYWN0aXZlLCByZWFzb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jvb3QgcmFjZTogZ2F0ZSBpcyBmYWlsLWNsb3NlZCB1bnRpbCBhc3luYyBtYW5hZ2VkIHBvbGljeSBzZXJ2aWNlIHJlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlIHRoZSBJUEMgYm91bmRhcnk6IG1hbmFnZWQgc2VydmljZSBvbmx5IGtub3dzIGFib3V0IGl0cyBwb2xpY2llcyBBRlRFUlxuXHRcdC8vIGB1cGRhdGVQb2xpY3lEZWZpbml0aW9uc2AgaGFzIGJlZW4gY2FsbGVkIGJ5IHRoZSBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlLlxuXHRcdC8vIEJlZm9yZSB0aGF0LCBgZ2V0UG9saWN5VmFsdWVgIHJldHVybnMgdW5kZWZpbmVkLlxuXHRcdGNsYXNzIEFzeW5jTWFuYWdlZFBvbGljeVNlcnZpY2UgZXh0ZW5kcyBGYWtlTWFuYWdlZFBvbGljeVNlcnZpY2Uge1xuXHRcdFx0cHJpdmF0ZSBfc2VlZGVkID0gZmFsc2U7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWVkVmFsdWU6IHN0cmluZztcblx0XHRcdGNvbnN0cnVjdG9yKHNlZWRWYWx1ZTogc3RyaW5nKSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cdFx0XHRcdHRoaXMuX3NlZWRWYWx1ZSA9IHNlZWRWYWx1ZTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldFBvbGljeVZhbHVlKG5hbWU6IHN0cmluZyk6IFBvbGljeVZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9zZWVkZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdXBlci5nZXRQb2xpY3lWYWx1ZShuYW1lKTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHNlZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdC8vIFNpbXVsYXRlIHRoZSBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlIGNhbGxpbmcgdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMsXG5cdFx0XHRcdC8vIHdoaWNoIGluIHByb2R1Y3Rpb24gdHJpZ2dlcnMgdGhlIElQQyByb3VuZC10cmlwIGFuZCB0aGVuIGZpcmVzIG9uRGlkQ2hhbmdlLlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0XHR0aGlzLl9zZWVkZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNldFBvbGljeShBUFBST1ZFRF9BQ0NPVU5UX09SR0FOSVpBVElPTlNfUE9MSUNZX05BTUUsIHRoaXMuX3NlZWRWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFuYWdlZCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQXN5bmNNYW5hZ2VkUG9saWN5U2VydmljZShKU09OLnN0cmluZ2lmeShbJ09ubHlPdGhlck9yZyddKSkpO1xuXHRcdGNvbnN0IGFjY291bnRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0QWNjb3VudFNlcnZpY2UoVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0YWNjb3VudFNlcnZpY2Uuc2V0RGVmYXVsdEFjY291bnRQcm92aWRlcihuZXcgRGVmYXVsdEFjY291bnRQcm92aWRlcihBUFBST1ZFRF9PUkdfQUNDT1VOVCwge30pKTtcblx0XHRhd2FpdCBhY2NvdW50U2VydmljZS5yZWZyZXNoKCk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBY2NvdW50UG9saWN5U2VydmljZShsb2dTZXJ2aWNlLCBhY2NvdW50U2VydmljZSwgbWFuYWdlZCkpO1xuXHRcdGNvbnN0IGRlZmF1bHRDb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWZhdWx0Q29uZmlndXJhdGlvbihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGF3YWl0IGRlZmF1bHRDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBjb25maWcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFBvbGljeUNvbmZpZ3VyYXRpb24oZGVmYXVsdENvbmZpZ3VyYXRpb24sIHNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgY29uZmlnLmluaXRpYWxpemUoKTtcblxuXHRcdC8vIEJlZm9yZSBtYW5hZ2VkIHNlcnZpY2UgcmVzb2x2ZXMsIHRoZSBnYXRlIHNlZXMgbm8gYXBwcm92ZWQtb3JnIHBvbGljeSBcdTIxOTIgSW5hY3RpdmUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuSW5hY3RpdmUpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIG11bHRpcGxleCBzZWVkaW5nIHRoZSBtYW5hZ2VkIHNlcnZpY2UgKElQQyBjb21wbGV0ZXMpLlxuXHRcdC8vIFRoaXMgZmlyZXMgb25EaWRDaGFuZ2Ugb24gdGhlIG1hbmFnZWQgc2VydmljZSwgd2hpY2ggQWNjb3VudFBvbGljeVNlcnZpY2Vcblx0XHQvLyBsaXN0ZW5zIHRvIGFuZCByZS1ldmFsdWF0ZXMgdGhlIGdhdGUuXG5cdFx0YXdhaXQgbWFuYWdlZC5zZWVkKCk7XG5cblx0XHQvLyBHYXRlIG11c3Qgbm93IHJlZmxlY3QgdGhlIGFkbWluIHBvbGljeTsgYWNjb3VudCBpcyBOT1QgaW4gJ09ubHlPdGhlck9yZycuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2F0ZUluZm8uc3RhdGUsIEFjY291bnRQb2xpY3lHYXRlU3RhdGUuUmVzdHJpY3RlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2F0ZUluZm8ucmVhc29uLCBBY2NvdW50UG9saWN5R2F0ZVVuc2F0aXNmaWVkUmVhc29uLk9yZ05vdEFwcHJvdmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZCBwb2xpY3kgY2hhbmdlIHJlLWV2YWx1YXRlcyB0aGUgZ2F0ZSBhbmQgZmlyZXMgb25EaWRDaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwb2xpY3lTZXJ2aWNlLCBtYW5hZ2VkIH0gPSBhd2FpdCBzZXR1cEdhdGUoeyBhcHByb3ZlZE9yZ3M6IFsnQXBwcm92ZWRPcmcnXSwgYWNjb3VudDogQVBQUk9WRURfT1JHX0FDQ09VTlQsIHBvbGljeURhdGE6IHt9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb2xpY3lTZXJ2aWNlLmdhdGVJbmZvLnN0YXRlLCBBY2NvdW50UG9saWN5R2F0ZVN0YXRlLlNhdGlzZmllZCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwb2xpY3lTZXJ2aWNlLm9uRGlkQ2hhbmdlKG5hbWVzID0+IGNoYW5nZXMucHVzaCguLi5uYW1lcykpKTtcblxuXHRcdC8vIENoYW5nZSB0aGUgYXBwcm92ZWQtb3JnIGxpc3QgdG8gb25lIHRoZSBhY2NvdW50IGlzIE5PVCBpbiBcdTIxOTIgZmxpcCBTYXRpc2ZpZWQgXHUyMTkyIFJlc3RyaWN0ZWQsXG5cdFx0Ly8gd2hpY2ggZm9yY2VzIHJlc3RyaWN0ZWQgdmFsdWVzIG9udG8gb3B0ZWQtaW4gcG9saWNpZXMgYW5kIGVtaXRzIG9uRGlkQ2hhbmdlLlxuXHRcdG1hbmFnZWQuc2V0UG9saWN5KEFQUFJPVkVEX0FDQ09VTlRfT1JHQU5JWkFUSU9OU19QT0xJQ1lfTkFNRSwgSlNPTi5zdHJpbmdpZnkoWydPbmx5T3RoZXJPcmcnXSkpO1xuXHRcdC8vIGBfdXBkYXRlUG9saWN5RGVmaW5pdGlvbnNgIGlzIGFzeW5jIFx1MjAxNCB3YWl0IG9uZSB0dXJuIGZvciBpdCB0byByZXNvbHZlLlxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9saWN5U2VydmljZS5nYXRlSW5mby5zdGF0ZSwgQWNjb3VudFBvbGljeUdhdGVTdGF0ZS5SZXN0cmljdGVkKTtcblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIGdhdGUgZmxpcHMnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUE4QixzQkFBc0I7QUFDcEQsU0FBUywrQ0FBK0M7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
