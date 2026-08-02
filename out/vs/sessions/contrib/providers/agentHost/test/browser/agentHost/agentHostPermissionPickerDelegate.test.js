import assert from "assert";
import { Emitter } from "../../../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../../../base/common/observable.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../../../workbench/contrib/chat/common/constants.js";
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownModeSchema, isWellKnownModeValue } from "../../../browser/agentHostPermissionPickerDelegate.js";
import { getPermissionLevelMeta } from "../../../../copilotChatSessions/browser/permissionPicker.js";
import { ISessionsProvidersService } from "../../../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsService } from "../../../../../../services/sessions/browser/sessionsService.js";
const PROVIDER_ID = "local-agent-host";
const SESSION_ID = "local-agent-host:s1";
function makeWellKnownConfig(value, levels = ["default", "assisted", "autoApprove"]) {
  return {
    schema: {
      type: "object",
      properties: {
        autoApprove: {
          title: "Auto Approve",
          description: "",
          type: "string",
          enum: [...levels],
          sessionMutable: true
        }
      }
    },
    values: value === void 0 ? {} : { autoApprove: value }
  };
}
class FakeProvider {
  constructor() {
    this.id = PROVIDER_ID;
    this._onDidChange = new Emitter();
    this.onDidChangeSessionConfig = this._onDidChange.event;
    this.setCalls = [];
  }
  getSessionConfig(_sessionId) {
    return this.config;
  }
  isSessionConfigResolving(_sessionId) {
    return constObservable(false);
  }
  async setSessionConfigValue(sessionId, property, value) {
    this.setCalls.push([sessionId, property, value]);
  }
  fireChange(sessionId = SESSION_ID) {
    this._onDidChange.fire(sessionId);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
function setup(store, activeSession, configValue) {
  const provider = new FakeProvider();
  store.add({ dispose: () => provider.dispose() });
  if (configValue !== void 0) {
    provider.config = makeWellKnownConfig(configValue);
  }
  const onDidChangeProviders = store.add(new Emitter());
  const sessionsProvidersService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = onDidChangeProviders.event;
    }
    getProviders() {
      return [provider];
    }
    getProvider(id) {
      return id === provider.id ? provider : void 0;
    }
  }();
  const activeSessionObs = observableValue("activeSession", activeSession);
  let assistedPermissionsEnabled = true;
  const configurationService = new class extends mock() {
    getValue(section) {
      return section === ChatConfiguration.AssistedPermissionsEnabled ? assistedPermissionsEnabled : void 0;
    }
  }();
  const sessionsManagementService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = activeSessionObs;
    }
  }();
  const insta = store.add(new TestInstantiationService());
  insta.set(ISessionsService, sessionsManagementService);
  insta.set(ISessionsProvidersService, sessionsProvidersService);
  insta.set(IConfigurationService, configurationService);
  const delegate = store.add(insta.createInstance(AgentHostPermissionPickerDelegate, activeSessionObs));
  return { delegate, provider, activeSessionObs, setAssistedPermissionsEnabled: (enabled) => assistedPermissionsEnabled = enabled };
}
function makeActiveSession() {
  return { providerId: PROVIDER_ID, sessionId: SESSION_ID };
}
suite("AgentHostPermissionPickerDelegate", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("returns Default when there is no active session", () => {
    const { delegate } = setup(store, void 0);
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("returns Default when the active session has no config seeded yet", () => {
    const { delegate } = setup(store, makeActiveSession());
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("reflects the active session's autoApprove value and updates on provider change", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "autoApprove");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.AutoApprove);
    provider.config = makeWellKnownConfig("default");
    provider.fireChange();
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("maps a legacy autoApprove=autopilot value to Default (Autopilot moved onto the mode axis)", () => {
    const { delegate } = setup(store, makeActiveSession(), "autopilot");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("falls back to Default when the stored value is unrecognized", () => {
    const { delegate } = setup(store, makeActiveSession(), "something-else");
    assert.strictEqual(delegate.currentPermissionLevel.get(), ChatPermissionLevel.Default);
  });
  test("setPermissionLevel writes through to the active session's provider", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    delegate.setPermissionLevel(ChatPermissionLevel.Default);
    assert.deepStrictEqual(provider.setCalls, [
      [SESSION_ID, "autoApprove", "autoApprove"],
      [SESSION_ID, "autoApprove", "assisted"],
      [SESSION_ID, "autoApprove", "default"]
    ]);
  });
  test("offers Default approvals, Assisted permissions, and Allow all in order", () => {
    const { delegate } = setup(store, makeActiveSession(), "assisted");
    assert.deepStrictEqual({
      current: delegate.currentPermissionLevel.get(),
      metadata: delegate.availableLevels.map((level) => {
        const baseMeta = getPermissionLevelMeta(level);
        const { label, detail, hover } = delegate.getPermissionLevelMeta(level, baseMeta);
        return { label, detail, hover };
      }),
      available: delegate.availableLevels
    }, {
      current: ChatPermissionLevel.Assisted,
      metadata: [
        { label: "Default approvals", detail: "Asks when approval settings don't apply", hover: void 0 },
        { label: "Assisted permissions", detail: "Evaluates risk before running tools", hover: "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval." },
        { label: "Allow all", detail: "Runs tool calls without asking", hover: void 0 }
      ],
      available: [
        ChatPermissionLevel.Default,
        ChatPermissionLevel.Assisted,
        ChatPermissionLevel.AutoApprove
      ]
    });
  });
  test("offers only levels advertised by the active schema", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    provider.config = makeWellKnownConfig("default", ["default", "autoApprove"]);
    provider.fireChange();
    assert.deepStrictEqual(delegate.availableLevels, [
      ChatPermissionLevel.Default,
      ChatPermissionLevel.AutoApprove
    ]);
  });
  test("hides and rejects Assisted permissions when the setting is disabled", () => {
    const { delegate, provider, setAssistedPermissionsEnabled } = setup(store, makeActiveSession(), "default");
    setAssistedPermissionsEnabled(false);
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    assert.deepStrictEqual({
      available: delegate.availableLevels,
      setCalls: provider.setCalls
    }, {
      available: [
        ChatPermissionLevel.Default,
        ChatPermissionLevel.AutoApprove
      ],
      setCalls: []
    });
  });
  test("does not write a level omitted by the active schema", () => {
    const { delegate, provider } = setup(store, makeActiveSession(), "default");
    provider.config = makeWellKnownConfig("default", ["default", "autoApprove"]);
    provider.fireChange();
    delegate.setPermissionLevel(ChatPermissionLevel.Assisted);
    assert.deepStrictEqual(provider.setCalls, []);
  });
  test("setPermissionLevel is a no-op when there is no active session", () => {
    const { delegate, provider } = setup(store, void 0);
    delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
    assert.deepStrictEqual(provider.setCalls, []);
  });
  test("provides agent-host-specific hover copy for permission levels", () => {
    const { delegate } = setup(store, makeActiveSession(), "autoApprove");
    assert.strictEqual(
      delegate.getPermissionLevelHover(ChatPermissionLevel.AutoApprove, getPermissionLevelMeta(ChatPermissionLevel.AutoApprove)),
      "Copilot runs all tools without asking for approval."
    );
  });
  test("provides agent-host-specific hover copy for Approve When Safe", () => {
    const { delegate } = setup(store, makeActiveSession(), "assisted");
    assert.strictEqual(
      delegate.getPermissionLevelHover(ChatPermissionLevel.Assisted, getPermissionLevelMeta(ChatPermissionLevel.Assisted)),
      "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval."
    );
  });
  test("isApplicable reacts to active session and config changes", () => {
    const { delegate, provider, activeSessionObs } = setup(store, void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
    activeSessionObs.set(makeActiveSession(), void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
    provider.config = makeWellKnownConfig("default");
    provider.fireChange();
    assert.strictEqual(delegate.isApplicable.get(), true);
    activeSessionObs.set(void 0, void 0);
    assert.strictEqual(delegate.isApplicable.get(), false);
  });
});
suite("isWellKnownAutoApproveSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Auto Approve",
      description: "desc",
      type: "string",
      enum: ["default", "assisted", "autoApprove"],
      ...overrides
    };
  }
  test("matches the canonical three-value enum", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema()), true);
  });
  test('still accepts a legacy enum that contains "autopilot" for backward compatibility', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "autoApprove", "autopilot"] })), true);
  });
  test('matches a subset that still contains "default"', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "autoApprove"] })), true);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default"] })), true);
  });
  test('rejects schemas missing the required "default" value', () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["autoApprove", "autopilot"] })), false);
  });
  test("rejects schemas with unknown enum values", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: ["default", "custom"] })), false);
  });
  test("rejects non-string types and missing/empty enums", () => {
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: void 0 })), false);
    assert.strictEqual(isWellKnownAutoApproveSchema(schema({ enum: [] })), false);
  });
});
suite("isWellKnownModeSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Agent Mode",
      description: "desc",
      type: "string",
      enum: ["interactive", "plan"],
      ...overrides
    };
  }
  test("matches the canonical two-value enum", () => {
    assert.strictEqual(isWellKnownModeSchema(schema()), true);
  });
  test('matches a subset that still contains "interactive"', () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: ["interactive"] })), true);
  });
  test('rejects schemas missing the required "interactive" value', () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: ["plan"] })), false);
  });
  test("rejects non-string types and missing/empty enums", () => {
    assert.strictEqual(isWellKnownModeSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: void 0 })), false);
    assert.strictEqual(isWellKnownModeSchema(schema({ enum: [] })), false);
  });
  test("accepts only values still present in the current schema", () => {
    assert.deepStrictEqual({
      interactive: isWellKnownModeValue(schema(), "interactive"),
      plan: isWellKnownModeValue(schema(), "plan"),
      removed: isWellKnownModeValue(schema({ enum: ["interactive"] }), "plan"),
      unknownSchema: isWellKnownModeValue(schema({ enum: ["plan"] }), "plan")
    }, {
      interactive: true,
      plan: true,
      removed: false,
      unknownSchema: false
    });
  });
});
suite("isWellKnownClaudePermissionModeSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function schema(overrides = {}) {
    return {
      title: "Approvals",
      description: "desc",
      type: "string",
      enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
      ...overrides
    };
  }
  test("matches the canonical permission-mode enum", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema()), true);
  });
  test('matches a subset that still contains "default"', () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "acceptEdits"] })), true);
  });
  test("rejects schemas that include unsupported SDK-only values", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions", "dontAsk"] })), false);
  });
  test('rejects schemas missing "default" or containing custom values', () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["acceptEdits", "plan"] })), false);
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: ["default", "custom"] })), false);
  });
  test("rejects non-string types and missing enums", () => {
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ type: "number" })), false);
    assert.strictEqual(isWellKnownClaudePermissionModeSchema(schema({ enum: void 0 })), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0L2FnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB0eXBlIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSwgaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYSwgaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYSwgaXNXZWxsS25vd25Nb2RlU2NoZW1hLCBpc1dlbGxLbm93bk1vZGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IGdldFBlcm1pc3Npb25MZXZlbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb3BpbG90Q2hhdFNlc3Npb25zL2Jyb3dzZXIvcGVybWlzc2lvblBpY2tlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcblxuY29uc3QgUFJPVklERVJfSUQgPSAnbG9jYWwtYWdlbnQtaG9zdCc7XG5jb25zdCBTRVNTSU9OX0lEID0gJ2xvY2FsLWFnZW50LWhvc3Q6czEnO1xuXG5mdW5jdGlvbiBtYWtlV2VsbEtub3duQ29uZmlnKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxldmVsczogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ2RlZmF1bHQnLCAnYXNzaXN0ZWQnLCAnYXV0b0FwcHJvdmUnXSk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRhdXRvQXBwcm92ZToge1xuXHRcdFx0XHRcdHRpdGxlOiAnQXV0byBBcHByb3ZlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWy4uLmxldmVsc10sXG5cdFx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dmFsdWVzOiB2YWx1ZSA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGF1dG9BcHByb3ZlOiB2YWx1ZSB9LFxuXHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xufVxuXG5jbGFzcyBGYWtlUHJvdmlkZXIgaW1wbGVtZW50cyBQaWNrPElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCAnaWQnIHwgJ29uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZycgfCAnZ2V0U2Vzc2lvbkNvbmZpZycgfCAnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlJyB8ICdpc1Nlc3Npb25Db25maWdSZXNvbHZpbmcnPiB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmcgPSBQUk9WSURFUl9JRDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZzogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbmZpZzogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNldENhbGxzOiBBcnJheTxbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+ID0gW107XG5cblx0Z2V0U2Vzc2lvbkNvbmZpZyhfc2Vzc2lvbklkOiBzdHJpbmcpOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlnO1xuXHR9XG5cdGlzU2Vzc2lvbkNvbmZpZ1Jlc29sdmluZyhfc2Vzc2lvbklkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0fVxuXHRhc3luYyBzZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNldENhbGxzLnB1c2goW3Nlc3Npb25JZCwgcHJvcGVydHksIHZhbHVlXSk7XG5cdH1cblx0ZmlyZUNoYW5nZShzZXNzaW9uSWQ6IHN0cmluZyA9IFNFU1NJT05fSUQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHNlc3Npb25JZCk7XG5cdH1cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXN0UmlnIHtcblx0cmVhZG9ubHkgZGVsZWdhdGU6IEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZTtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IEZha2VQcm92aWRlcjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbk9iczogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IHNldEFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkOiAoZW5hYmxlZDogYm9vbGVhbikgPT4gdm9pZDtcbn1cblxuZnVuY3Rpb24gc2V0dXAoc3RvcmU6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGFjdGl2ZVNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkLCBjb25maWdWYWx1ZT86IHN0cmluZyk6IElUZXN0UmlnIHtcblx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgRmFrZVByb3ZpZGVyKCk7XG5cdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHByb3ZpZGVyLmRpc3Bvc2UoKSB9KTtcblx0aWYgKGNvbmZpZ1ZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRwcm92aWRlci5jb25maWcgPSBtYWtlV2VsbEtub3duQ29uZmlnKGNvbmZpZ1ZhbHVlKTtcblx0fVxuXHRjb25zdCBvbkRpZENoYW5nZVByb3ZpZGVycyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNQcm92aWRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdGNvbnN0IHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IG5ldyAoY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gb25EaWRDaGFuZ2VQcm92aWRlcnMuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCk6IElTZXNzaW9uc1Byb3ZpZGVyW10geyByZXR1cm4gW3Byb3ZpZGVyIGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJdOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXI8VCBleHRlbmRzIElTZXNzaW9uc1Byb3ZpZGVyPihpZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gaWQgPT09IHByb3ZpZGVyLmlkID8gKHByb3ZpZGVyIGFzIHVua25vd24gYXMgVCkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9KSgpO1xuXHRjb25zdCBhY3RpdmVTZXNzaW9uT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIGFjdGl2ZVNlc3Npb24pO1xuXHRsZXQgYXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQgPSB0cnVlO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRWYWx1ZTxUPigpOiBUO1xuXHRcdG92ZXJyaWRlIGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZyk6IFQ7XG5cdFx0b3ZlcnJpZGUgZ2V0VmFsdWU8VD4ob3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IFQ7XG5cdFx0b3ZlcnJpZGUgZ2V0VmFsdWU8VD4oc2VjdGlvbjogc3RyaW5nLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVDtcblx0XHRvdmVycmlkZSBnZXRWYWx1ZTxUPihzZWN0aW9uPzogc3RyaW5nIHwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUIHtcblx0XHRcdHJldHVybiAoc2VjdGlvbiA9PT0gQ2hhdENvbmZpZ3VyYXRpb24uQXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQgPyBhc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCA6IHVuZGVmaW5lZCkgYXMgVDtcblx0XHR9XG5cdH0oKTtcblx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyAoY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uT2JzO1xuXHR9KSgpO1xuXG5cdGNvbnN0IGluc3RhID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhLnNldChJU2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0aW5zdGEuc2V0KElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHNlc3Npb25zUHJvdmlkZXJzU2VydmljZSk7XG5cdGluc3RhLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBkZWxlZ2F0ZSA9IHN0b3JlLmFkZChpbnN0YS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIGFjdGl2ZVNlc3Npb25PYnMpKTtcblx0cmV0dXJuIHsgZGVsZWdhdGUsIHByb3ZpZGVyLCBhY3RpdmVTZXNzaW9uT2JzLCBzZXRBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZDogZW5hYmxlZCA9PiBhc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCA9IGVuYWJsZWQgfTtcbn1cblxuZnVuY3Rpb24gbWFrZUFjdGl2ZVNlc3Npb24oKTogSUFjdGl2ZVNlc3Npb24ge1xuXHRyZXR1cm4geyBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvbklkOiBTRVNTSU9OX0lEIH0gYXMgSUFjdGl2ZVNlc3Npb247XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBEZWZhdWx0IHdoZW4gdGhlcmUgaXMgbm8gYWN0aXZlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSB9ID0gc2V0dXAoc3RvcmUsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBEZWZhdWx0IHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGhhcyBubyBjb25maWcgc2VlZGVkIHlldCcsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVmbGVjdHMgdGhlIGFjdGl2ZSBzZXNzaW9uXFwncyBhdXRvQXBwcm92ZSB2YWx1ZSBhbmQgdXBkYXRlcyBvbiBwcm92aWRlciBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnYXV0b0FwcHJvdmUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpLCBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblxuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnKTtcblx0XHRwcm92aWRlci5maXJlQ2hhbmdlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgYSBsZWdhY3kgYXV0b0FwcHJvdmU9YXV0b3BpbG90IHZhbHVlIHRvIERlZmF1bHQgKEF1dG9waWxvdCBtb3ZlZCBvbnRvIHRoZSBtb2RlIGF4aXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnYXV0b3BpbG90Jyk7XG5cblx0XHQvLyBgYXV0b3BpbG90YCBpcyBubyBsb25nZXIgYSB2YWxpZCBhcHByb3ZhbCBsZXZlbCBcdTIwMTQgdGhlIHBpY2tlciBkb2VzIG5vdFxuXHRcdC8vIG9mZmVyIGl0LCBzbyB0aGUgY2hpcCBtdXN0IHN1cmZhY2UgRGVmYXVsdCByYXRoZXIgdGhhbiBhIGxldmVsIGl0XG5cdFx0Ly8gY2Fubm90IHJlbmRlci5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBEZWZhdWx0IHdoZW4gdGhlIHN0b3JlZCB2YWx1ZSBpcyB1bnJlY29nbml6ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSB9ID0gc2V0dXAoc3RvcmUsIG1ha2VBY3RpdmVTZXNzaW9uKCksICdzb21ldGhpbmctZWxzZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFBlcm1pc3Npb25MZXZlbCB3cml0ZXMgdGhyb3VnaCB0byB0aGUgYWN0aXZlIHNlc3Npb25cXCdzIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUsIHByb3ZpZGVyIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2RlZmF1bHQnKTtcblxuXHRcdGRlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblx0XHRkZWxlZ2F0ZS5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCk7XG5cdFx0ZGVsZWdhdGUuc2V0UGVybWlzc2lvbkxldmVsKENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNldENhbGxzLCBbXG5cdFx0XHRbU0VTU0lPTl9JRCwgJ2F1dG9BcHByb3ZlJywgJ2F1dG9BcHByb3ZlJ10sXG5cdFx0XHRbU0VTU0lPTl9JRCwgJ2F1dG9BcHByb3ZlJywgJ2Fzc2lzdGVkJ10sXG5cdFx0XHRbU0VTU0lPTl9JRCwgJ2F1dG9BcHByb3ZlJywgJ2RlZmF1bHQnXSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmZXJzIERlZmF1bHQgYXBwcm92YWxzLCBBc3Npc3RlZCBwZXJtaXNzaW9ucywgYW5kIEFsbG93IGFsbCBpbiBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2Fzc2lzdGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGN1cnJlbnQ6IGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksXG5cdFx0XHRtZXRhZGF0YTogZGVsZWdhdGUuYXZhaWxhYmxlTGV2ZWxzLm1hcChsZXZlbCA9PiB7XG5cdFx0XHRcdGNvbnN0IGJhc2VNZXRhID0gZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCk7XG5cdFx0XHRcdGNvbnN0IHsgbGFiZWwsIGRldGFpbCwgaG92ZXIgfSA9IGRlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbE1ldGEobGV2ZWwsIGJhc2VNZXRhKTtcblx0XHRcdFx0cmV0dXJuIHsgbGFiZWwsIGRldGFpbCwgaG92ZXIgfTtcblx0XHRcdH0pLFxuXHRcdFx0YXZhaWxhYmxlOiBkZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCxcblx0XHRcdG1ldGFkYXRhOiBbXG5cdFx0XHRcdHsgbGFiZWw6ICdEZWZhdWx0IGFwcHJvdmFscycsIGRldGFpbDogJ0Fza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb25cXCd0IGFwcGx5JywgaG92ZXI6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnQXNzaXN0ZWQgcGVybWlzc2lvbnMnLCBkZXRhaWw6ICdFdmFsdWF0ZXMgcmlzayBiZWZvcmUgcnVubmluZyB0b29scycsIGhvdmVyOiAnQW4gTExNIGp1ZGdlIGV2YWx1YXRlcyBlYWNoIHRvb2wgY2FsbC4gVG9vbHMgaXQgZG9lc25cXCd0IGFwcHJvdmUgcmVxdWlyZSB5b3VyIGFwcHJvdmFsLicgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0FsbG93IGFsbCcsIGRldGFpbDogJ1J1bnMgdG9vbCBjYWxscyB3aXRob3V0IGFza2luZycsIGhvdmVyOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0XHRhdmFpbGFibGU6IFtcblx0XHRcdFx0Q2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0LFxuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLFxuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2ZmZXJzIG9ubHkgbGV2ZWxzIGFkdmVydGlzZWQgYnkgdGhlIGFjdGl2ZSBzY2hlbWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnZGVmYXVsdCcpO1xuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnLCBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSk7XG5cdFx0cHJvdmlkZXIuZmlyZUNoYW5nZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMsIFtcblx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIGFuZCByZWplY3RzIEFzc2lzdGVkIHBlcm1pc3Npb25zIHdoZW4gdGhlIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIsIHNldEFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2RlZmF1bHQnKTtcblx0XHRzZXRBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZChmYWxzZSk7XG5cblx0XHRkZWxlZ2F0ZS5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF2YWlsYWJsZTogZGVsZWdhdGUuYXZhaWxhYmxlTGV2ZWxzLFxuXHRcdFx0c2V0Q2FsbHM6IHByb3ZpZGVyLnNldENhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGF2YWlsYWJsZTogW1xuXHRcdFx0XHRDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdFx0XHRcdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdFx0XHRdLFxuXHRcdFx0c2V0Q2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB3cml0ZSBhIGxldmVsIG9taXR0ZWQgYnkgdGhlIGFjdGl2ZSBzY2hlbWEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWxlZ2F0ZSwgcHJvdmlkZXIgfSA9IHNldHVwKHN0b3JlLCBtYWtlQWN0aXZlU2Vzc2lvbigpLCAnZGVmYXVsdCcpO1xuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnLCBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSk7XG5cdFx0cHJvdmlkZXIuZmlyZUNoYW5nZSgpO1xuXG5cdFx0ZGVsZWdhdGUuc2V0UGVybWlzc2lvbkxldmVsKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXRDYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRQZXJtaXNzaW9uTGV2ZWwgaXMgYSBuby1vcCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUsIHByb3ZpZGVyIH0gPSBzZXR1cChzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdGRlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2V0Q2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXMgYWdlbnQtaG9zdC1zcGVjaWZpYyBob3ZlciBjb3B5IGZvciBwZXJtaXNzaW9uIGxldmVscycsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2F1dG9BcHByb3ZlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRkZWxlZ2F0ZS5nZXRQZXJtaXNzaW9uTGV2ZWxIb3ZlcihDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLCBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpKSxcblx0XHRcdCdDb3BpbG90IHJ1bnMgYWxsIHRvb2xzIHdpdGhvdXQgYXNraW5nIGZvciBhcHByb3ZhbC4nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXMgYWdlbnQtaG9zdC1zcGVjaWZpYyBob3ZlciBjb3B5IGZvciBBcHByb3ZlIFdoZW4gU2FmZScsICgpID0+IHtcblx0XHRjb25zdCB7IGRlbGVnYXRlIH0gPSBzZXR1cChzdG9yZSwgbWFrZUFjdGl2ZVNlc3Npb24oKSwgJ2Fzc2lzdGVkJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRkZWxlZ2F0ZS5nZXRQZXJtaXNzaW9uTGV2ZWxIb3ZlcihDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLCBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQpKSxcblx0XHRcdCdBbiBMTE0ganVkZ2UgZXZhbHVhdGVzIGVhY2ggdG9vbCBjYWxsLiBUb29scyBpdCBkb2VzblxcJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQXBwbGljYWJsZSByZWFjdHMgdG8gYWN0aXZlIHNlc3Npb24gYW5kIGNvbmZpZyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGVsZWdhdGUsIHByb3ZpZGVyLCBhY3RpdmVTZXNzaW9uT2JzIH0gPSBzZXR1cChzdG9yZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vIGFjdGl2ZSBzZXNzaW9uIFx1MjE5MiBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxlZ2F0ZS5pc0FwcGxpY2FibGUuZ2V0KCksIGZhbHNlKTtcblxuXHRcdC8vIEFjdGl2ZSBzZXNzaW9uLCBubyBjb25maWcgc2VlZGVkIFx1MjE5MiBmYWxzZVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VBY3RpdmVTZXNzaW9uKCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmlzQXBwbGljYWJsZS5nZXQoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gQWN0aXZlIHNlc3Npb24gd2l0aCB3ZWxsLWtub3duIHNjaGVtYSBcdTIxOTIgdHJ1ZVxuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VXZWxsS25vd25Db25maWcoJ2RlZmF1bHQnKTtcblx0XHRwcm92aWRlci5maXJlQ2hhbmdlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGVnYXRlLmlzQXBwbGljYWJsZS5nZXQoKSwgdHJ1ZSk7XG5cblx0XHQvLyBBY3RpdmUgc2Vzc2lvbiBjbGVhcmVkIFx1MjE5MiBmYWxzZSAoY292ZXJzIHRoZSAnYmFjayB0byBuZXcgY2hhdCB2aWV3JyByZWdyZXNzaW9uKVxuXHRcdGFjdGl2ZVNlc3Npb25PYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsZWdhdGUuaXNBcHBsaWNhYmxlLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzY2hlbWEob3ZlcnJpZGVzOiBQYXJ0aWFsPFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7fSk6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpdGxlOiAnQXV0byBBcHByb3ZlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnZGVzYycsXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZGVmYXVsdCcsICdhc3Npc3RlZCcsICdhdXRvQXBwcm92ZSddLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hO1xuXHR9XG5cblx0dGVzdCgnbWF0Y2hlcyB0aGUgY2Fub25pY2FsIHRocmVlLXZhbHVlIGVudW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKCkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RpbGwgYWNjZXB0cyBhIGxlZ2FjeSBlbnVtIHRoYXQgY29udGFpbnMgXCJhdXRvcGlsb3RcIiBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBhIHN1YnNldCB0aGF0IHN0aWxsIGNvbnRhaW5zIFwiZGVmYXVsdFwiJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0pKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogWydkZWZhdWx0J10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwiZGVmYXVsdFwiIHZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10gfSkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgc2NoZW1hcyB3aXRoIHVua25vd24gZW51bSB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogWydkZWZhdWx0JywgJ2N1c3RvbSddIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1zdHJpbmcgdHlwZXMgYW5kIG1pc3NpbmcvZW1wdHkgZW51bXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgdHlwZTogJ251bWJlcicgYXMgJ3N0cmluZycgfSkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKHsgZW51bTogdW5kZWZpbmVkIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKHNjaGVtYSh7IGVudW06IFtdIH0pKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNXZWxsS25vd25Nb2RlU2NoZW1hJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzY2hlbWEob3ZlcnJpZGVzOiBQYXJ0aWFsPFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7fSk6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpdGxlOiAnQWdlbnQgTW9kZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ2Rlc2MnLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2ludGVyYWN0aXZlJywgJ3BsYW4nXSxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9IGFzIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYTtcblx0fVxuXG5cdHRlc3QoJ21hdGNoZXMgdGhlIGNhbm9uaWNhbCB0d28tdmFsdWUgZW51bScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSgpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBzdWJzZXQgdGhhdCBzdGlsbCBjb250YWlucyBcImludGVyYWN0aXZlXCInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2ludGVyYWN0aXZlJ10gfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFwiaW50ZXJhY3RpdmVcIiB2YWx1ZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsncGxhbiddIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1zdHJpbmcgdHlwZXMgYW5kIG1pc3NpbmcvZW1wdHkgZW51bXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzV2VsbEtub3duTW9kZVNjaGVtYShzY2hlbWEoeyB0eXBlOiAnbnVtYmVyJyBhcyAnc3RyaW5nJyB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IHVuZGVmaW5lZCB9KSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFtdIH0pKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRzIG9ubHkgdmFsdWVzIHN0aWxsIHByZXNlbnQgaW4gdGhlIGN1cnJlbnQgc2NoZW1hJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW50ZXJhY3RpdmU6IGlzV2VsbEtub3duTW9kZVZhbHVlKHNjaGVtYSgpLCAnaW50ZXJhY3RpdmUnKSxcblx0XHRcdHBsYW46IGlzV2VsbEtub3duTW9kZVZhbHVlKHNjaGVtYSgpLCAncGxhbicpLFxuXHRcdFx0cmVtb3ZlZDogaXNXZWxsS25vd25Nb2RlVmFsdWUoc2NoZW1hKHsgZW51bTogWydpbnRlcmFjdGl2ZSddIH0pLCAncGxhbicpLFxuXHRcdFx0dW5rbm93blNjaGVtYTogaXNXZWxsS25vd25Nb2RlVmFsdWUoc2NoZW1hKHsgZW51bTogWydwbGFuJ10gfSksICdwbGFuJyksXG5cdFx0fSwge1xuXHRcdFx0aW50ZXJhY3RpdmU6IHRydWUsXG5cdFx0XHRwbGFuOiB0cnVlLFxuXHRcdFx0cmVtb3ZlZDogZmFsc2UsXG5cdFx0XHR1bmtub3duU2NoZW1hOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzV2VsbEtub3duQ2xhdWRlUGVybWlzc2lvbk1vZGVTY2hlbWEnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNjaGVtYShvdmVycmlkZXM6IFBhcnRpYWw8U2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IHt9KTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGl0bGU6ICdBcHByb3ZhbHMnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdkZXNjJyxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2FjY2VwdEVkaXRzJywgJ3BsYW4nLCAnYXV0bycsICdieXBhc3NQZXJtaXNzaW9ucyddLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH0gYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hO1xuXHR9XG5cblx0dGVzdCgnbWF0Y2hlcyB0aGUgY2Fub25pY2FsIHBlcm1pc3Npb24tbW9kZSBlbnVtJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSgpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYSBzdWJzZXQgdGhhdCBzdGlsbCBjb250YWlucyBcImRlZmF1bHRcIicsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnXSB9KSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHNjaGVtYXMgdGhhdCBpbmNsdWRlIHVuc3VwcG9ydGVkIFNESy1vbmx5IHZhbHVlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYShzY2hlbWEoeyBlbnVtOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnLCAncGxhbicsICdhdXRvJywgJ2J5cGFzc1Blcm1pc3Npb25zJywgJ2RvbnRBc2snXSB9KSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBzY2hlbWFzIG1pc3NpbmcgXCJkZWZhdWx0XCIgb3IgY29udGFpbmluZyBjdXN0b20gdmFsdWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnYWNjZXB0RWRpdHMnLCAncGxhbiddIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IFsnZGVmYXVsdCcsICdjdXN0b20nXSB9KSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24tc3RyaW5nIHR5cGVzIGFuZCBtaXNzaW5nIGVudW1zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IHR5cGU6ICdudW1iZXInIGFzICdzdHJpbmcnIH0pKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSh7IGVudW06IHVuZGVmaW5lZCB9KSksIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBdUMsNkJBQTZCO0FBQ3BFLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2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
