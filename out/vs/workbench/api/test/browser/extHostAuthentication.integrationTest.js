import assert from "assert";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { IQuickInputService, QuickInputHideReason } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { MainThreadAuthentication } from "../../browser/mainThreadAuthentication.js";
import { ExtHostContext, MainContext } from "../../common/extHost.protocol.js";
import { ExtHostAuthentication } from "../../common/extHostAuthentication.js";
import { IActivityService } from "../../../services/activity/common/activity.js";
import { AuthenticationService } from "../../../services/authentication/browser/authenticationService.js";
import { IAuthenticationExtensionsService, IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IExtensionService, nullExtensionDescription as extensionDescription } from "../../../services/extensions/common/extensions.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { TestEnvironmentService, TestHostService, TestQuickInputService, TestRemoteAgentService } from "../../../test/browser/workbenchTestServices.js";
import { TestActivityService, TestExtensionService, TestLoggerService, TestProductService, TestStorageService } from "../../../test/common/workbenchTestServices.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { AuthenticationAccessService, IAuthenticationAccessService } from "../../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationUsageService } from "../../../services/authentication/browser/authenticationUsageService.js";
import { AuthenticationExtensionsService } from "../../../services/authentication/browser/authenticationExtensionsService.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostWindow } from "../../common/extHostWindow.js";
import { MainThreadWindow } from "../../browser/mainThreadWindow.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUserActivityService, UserActivityService } from "../../../services/userActivity/common/userActivityService.js";
import { ExtHostUrls } from "../../common/extHostUrls.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { TestSecretStorageService } from "../../../../platform/secrets/test/common/testSecretStorageService.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { DynamicAuthenticationProviderStorageService } from "../../../services/authentication/browser/dynamicAuthenticationProviderStorageService.js";
import { ExtHostProgress } from "../../common/extHostProgress.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
class AuthQuickPick {
  constructor() {
    this.items = [];
  }
  get selectedItems() {
    return this.items;
  }
  onDidAccept(listener) {
    this.accept = listener;
  }
  onDidHide(listener) {
    this.hide = listener;
  }
  dispose() {
  }
  show() {
    this.accept?.({ inBackground: false });
    this.hide?.({ reason: QuickInputHideReason.Other });
  }
}
class AuthTestQuickInputService extends TestQuickInputService {
  createQuickPick() {
    return new AuthQuickPick();
  }
}
class TestAuthUsageService {
  initializeExtensionUsageCache() {
    return Promise.resolve();
  }
  extensionUsesAuth(extensionId) {
    return Promise.resolve(false);
  }
  readAccountUsages(providerId, accountName) {
    return [];
  }
  removeAccountUsage(providerId, accountName) {
  }
  addAccountUsage(providerId, accountName, scopes, extensionId, extensionName) {
  }
}
class TestAuthProvider {
  constructor(authProviderName) {
    this.authProviderName = authProviderName;
    this.id = 1;
    this.sessions = /* @__PURE__ */ new Map();
    this.onDidChangeSessions = () => {
      return { dispose() {
      } };
    };
  }
  async getSessions(scopes) {
    if (!scopes) {
      return [...this.sessions.values()];
    }
    if (scopes[0] === "return multiple") {
      return [...this.sessions.values()];
    }
    const sessions = this.sessions.get(scopes.join(" "));
    return sessions ? [sessions] : [];
  }
  async createSession(scopes) {
    const scopesStr = scopes.join(" ");
    const session = {
      scopes,
      id: `${this.id}`,
      account: {
        label: this.authProviderName,
        id: `${this.id}`
      },
      accessToken: Math.random() + ""
    };
    this.sessions.set(scopesStr, session);
    this.id++;
    return session;
  }
  async removeSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}
suite("ExtHostAuthentication", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let extHostAuthentication;
  let mainInstantiationService;
  setup(async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new SyncDescriptor(NullLogService));
    services.set(IDialogService, new SyncDescriptor(TestDialogService, [{ confirmed: true }]));
    services.set(IStorageService, new SyncDescriptor(TestStorageService));
    services.set(ISecretStorageService, new SyncDescriptor(TestSecretStorageService));
    services.set(IDynamicAuthenticationProviderStorageService, new SyncDescriptor(DynamicAuthenticationProviderStorageService));
    services.set(IQuickInputService, new SyncDescriptor(AuthTestQuickInputService));
    services.set(IExtensionService, new SyncDescriptor(TestExtensionService));
    services.set(IActivityService, new SyncDescriptor(TestActivityService));
    services.set(IRemoteAgentService, new SyncDescriptor(TestRemoteAgentService));
    services.set(INotificationService, new SyncDescriptor(TestNotificationService));
    services.set(IHostService, new SyncDescriptor(TestHostService));
    services.set(IUserActivityService, new SyncDescriptor(UserActivityService));
    services.set(IAuthenticationAccessService, new SyncDescriptor(AuthenticationAccessService));
    services.set(IAuthenticationService, new SyncDescriptor(AuthenticationService));
    services.set(IAuthenticationUsageService, new SyncDescriptor(TestAuthUsageService));
    services.set(IAuthenticationExtensionsService, new SyncDescriptor(AuthenticationExtensionsService));
    mainInstantiationService = disposables.add(new TestInstantiationService(services, void 0, void 0, true));
    mainInstantiationService.stub(IOpenerService, {});
    mainInstantiationService.stub(ITelemetryService, NullTelemetryService);
    mainInstantiationService.stub(IBrowserWorkbenchEnvironmentService, TestEnvironmentService);
    mainInstantiationService.stub(IProductService, TestProductService);
    const rpcProtocol = disposables.add(new TestRPCProtocol());
    rpcProtocol.set(MainContext.MainThreadAuthentication, disposables.add(mainInstantiationService.createInstance(MainThreadAuthentication, rpcProtocol)));
    rpcProtocol.set(MainContext.MainThreadWindow, disposables.add(mainInstantiationService.createInstance(MainThreadWindow, rpcProtocol)));
    const initData = {
      environment: {
        appUriScheme: "test",
        appName: "Test"
      }
    };
    extHostAuthentication = new ExtHostAuthentication(
      rpcProtocol,
      // eslint-disable-next-line local/code-no-any-casts
      {
        environment: {
          appUriScheme: "test",
          appName: "Test"
        }
      },
      new ExtHostWindow(initData, rpcProtocol),
      new ExtHostUrls(rpcProtocol),
      new ExtHostProgress(rpcProtocol),
      disposables.add(new TestLoggerService()),
      new NullLogService()
    );
    rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
    disposables.add(extHostAuthentication.registerAuthenticationProvider("test", "test provider", new TestAuthProvider("test")));
    disposables.add(extHostAuthentication.registerAuthenticationProvider(
      "test-multiple",
      "test multiple provider",
      new TestAuthProvider("test-multiple"),
      { supportsMultipleAccounts: true }
    ));
  });
  test("createIfNone - true", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("createIfNone - false", async () => {
    const scopes = ["foo"];
    const nosession = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {}
    );
    assert.strictEqual(nosession, void 0);
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {}
    );
    assert.strictEqual(session2?.id, session.id);
    assert.strictEqual(session2?.scopes[0], session.scopes[0]);
    assert.strictEqual(session2?.accessToken, session.accessToken);
  });
  test("silent - true", async () => {
    const scopes = ["foo"];
    const nosession = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        silent: true
      }
    );
    assert.strictEqual(nosession, void 0);
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        silent: true
      }
    );
    assert.strictEqual(session.id, session2?.id);
    assert.strictEqual(session.scopes[0], session2?.scopes[0]);
  });
  test("forceNewSession - true - existing session", async () => {
    const scopes = ["foo"];
    const session1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.notStrictEqual(session1.accessToken, session2?.accessToken);
  });
  test("forceNewSession - true - no existing session", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("forceNewSession - detail", async () => {
    const scopes = ["foo"];
    const session1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        createIfNone: true
      }
    );
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      scopes,
      {
        forceNewSession: { detail: "bar" }
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.notStrictEqual(session1.accessToken, session2?.accessToken);
  });
  test("clearSessionPreference - true", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], scopes[0]);
    const scopes2 = ["bar"];
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], scopes2[0]);
    const session3 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["return multiple"],
      {
        clearSessionPreference: true,
        createIfNone: true
      }
    );
    assert.strictEqual(session3?.id, session.id);
    assert.strictEqual(session3?.scopes[0], session.scopes[0]);
    assert.strictEqual(session3?.accessToken, session.accessToken);
  });
  test("silently getting session should return a session (if any) regardless of preference - fixes #137819", async () => {
    const scopes = ["foo"];
    const session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], scopes[0]);
    const scopes2 = ["bar"];
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session2?.id, "2");
    assert.strictEqual(session2?.scopes[0], scopes2[0]);
    const shouldBeSession1 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes,
      {}
    );
    assert.strictEqual(shouldBeSession1?.id, session.id);
    assert.strictEqual(shouldBeSession1?.scopes[0], session.scopes[0]);
    assert.strictEqual(shouldBeSession1?.accessToken, session.accessToken);
    const shouldBeSession2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      scopes2,
      {}
    );
    assert.strictEqual(shouldBeSession2?.id, session2.id);
    assert.strictEqual(shouldBeSession2?.scopes[0], session2.scopes[0]);
    assert.strictEqual(shouldBeSession2?.accessToken, session2.accessToken);
  });
  test("createIfNone and forceNewSession", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          createIfNone: true,
          forceNewSession: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("forceNewSession and silent", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          forceNewSession: true,
          silent: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("createIfNone and silent", async () => {
    try {
      await extHostAuthentication.getSession(
        extensionDescription,
        "test",
        ["foo"],
        {
          createIfNone: true,
          silent: true
        }
      );
      assert.fail("should have thrown an Error.");
    } catch (e) {
      assert.ok(e);
    }
  });
  test("Can get multiple sessions (with different scopes) in one extension", async () => {
    let session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["bar"],
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "2");
    assert.strictEqual(session?.scopes[0], "bar");
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: false
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
  });
  test("Can get multiple sessions (from different providers) in one extension", async () => {
    let session = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    session = await extHostAuthentication.getSession(
      extensionDescription,
      "test",
      ["foo"],
      {
        createIfNone: true
      }
    );
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    assert.strictEqual(session?.account.label, "test");
    const session2 = await extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: false
      }
    );
    assert.strictEqual(session2?.id, "1");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.strictEqual(session2?.account.label, "test-multiple");
  });
  test("Can get multiple sessions (from different providers) in one extension at the same time", async () => {
    const sessionP = extHostAuthentication.getSession(
      extensionDescription,
      "test",
      ["foo"],
      {
        createIfNone: true
      }
    );
    const session2P = extHostAuthentication.getSession(
      extensionDescription,
      "test-multiple",
      ["foo"],
      {
        createIfNone: true
      }
    );
    const session = await sessionP;
    assert.strictEqual(session?.id, "1");
    assert.strictEqual(session?.scopes[0], "foo");
    assert.strictEqual(session?.account.label, "test");
    const session2 = await session2P;
    assert.strictEqual(session2?.id, "1");
    assert.strictEqual(session2?.scopes[0], "foo");
    assert.strictEqual(session2?.account.label, "test-multiple");
  });
  test("concurrent operations on same provider are serialized", async () => {
    const provider = new TestAuthProvider("concurrent-test");
    const operationOrder = [];
    const originalCreateSession = provider.createSession.bind(provider);
    const originalGetSessions = provider.getSessions.bind(provider);
    provider.createSession = async (scopes) => {
      operationOrder.push(`create-start-${scopes[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await originalCreateSession(scopes);
      operationOrder.push(`create-end-${scopes[0]}`);
      return result;
    };
    provider.getSessions = async (scopes) => {
      const scopeKey = scopes ? scopes[0] : "all";
      operationOrder.push(`get-start-${scopeKey}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await originalGetSessions(scopes);
      operationOrder.push(`get-end-${scopeKey}`);
      return result;
    };
    const disposable = extHostAuthentication.registerAuthenticationProvider("concurrent-test", "Concurrent Test", provider);
    disposables.add(disposable);
    const promises = [
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope1"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope2"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-test", ["scope1"], {})
      // This should get the existing session
    ];
    await Promise.all(promises);
    const operationPairs = [];
    for (let i = 0; i < operationOrder.length; i++) {
      const current = operationOrder[i];
      if (current.includes("-start-")) {
        const scope = current.split("-start-")[1];
        const operationType = current.split("-start-")[0];
        const endOperation = `${operationType}-end-${scope}`;
        const endIndex = operationOrder.indexOf(endOperation, i + 1);
        if (endIndex !== -1) {
          operationPairs.push({
            start: i,
            end: endIndex,
            operation: `${operationType}-${scope}`
          });
        }
      }
    }
    for (let i = 0; i < operationPairs.length; i++) {
      for (let j = i + 1; j < operationPairs.length; j++) {
        const op1 = operationPairs[i];
        const op2 = operationPairs[j];
        const op1EndsBeforeOp2Starts = op1.end < op2.start;
        const op2EndsBeforeOp1Starts = op2.end < op1.start;
        assert.ok(
          op1EndsBeforeOp2Starts || op2EndsBeforeOp1Starts,
          `Operations ${op1.operation} and ${op2.operation} should not overlap. Op1: ${op1.start}-${op1.end}, Op2: ${op2.start}-${op2.end}. Order: [${operationOrder.join(", ")}]`
        );
      }
    }
    assert.ok(operationOrder.includes("create-start-scope1"), "Should have created session for scope1");
    assert.ok(operationOrder.includes("create-end-scope1"), "Should have completed creating session for scope1");
    assert.ok(operationOrder.includes("create-start-scope2"), "Should have created session for scope2");
    assert.ok(operationOrder.includes("create-end-scope2"), "Should have completed creating session for scope2");
    assert.ok(operationOrder.includes("get-start-scope1"), "Should have called getSessions for existing scope1 session");
    assert.ok(operationOrder.includes("get-end-scope1"), "Should have completed getSessions for existing scope1 session");
  });
  test("provider registration and immediate disposal race condition", async () => {
    const provider = new TestAuthProvider("race-test");
    const disposable = extHostAuthentication.registerAuthenticationProvider("race-test", "Race Test", provider);
    disposable.dispose();
    try {
      await extHostAuthentication.getSession(extensionDescription, "race-test", ["scope"], { createIfNone: true });
      assert.fail("Should have thrown an error for non-existent provider");
    } catch (error) {
      assert.ok(error);
    }
  });
  test("provider re-registration after proper disposal", async () => {
    const provider1 = new TestAuthProvider("reregister-test-1");
    const provider2 = new TestAuthProvider("reregister-test-2");
    const disposable1 = extHostAuthentication.registerAuthenticationProvider("reregister-test", "Provider 1", provider1);
    const session1 = await extHostAuthentication.getSession(extensionDescription, "reregister-test", ["scope"], { createIfNone: true });
    assert.strictEqual(session1?.account.label, "reregister-test-1");
    disposable1.dispose();
    const disposable2 = extHostAuthentication.registerAuthenticationProvider("reregister-test", "Provider 2", provider2);
    disposables.add(disposable2);
    const session2 = await extHostAuthentication.getSession(extensionDescription, "reregister-test", ["scope"], { createIfNone: true });
    assert.strictEqual(session2?.account.label, "reregister-test-2");
    assert.notStrictEqual(session1?.accessToken, session2?.accessToken);
  });
  test("operations on different providers run concurrently", async () => {
    const provider1 = new TestAuthProvider("concurrent-1");
    const provider2 = new TestAuthProvider("concurrent-2");
    let provider1Started = false;
    let provider2Started = false;
    let provider1Finished = false;
    let provider2Finished = false;
    let concurrencyVerified = false;
    const originalCreate1 = provider1.createSession.bind(provider1);
    const originalCreate2 = provider2.createSession.bind(provider2);
    provider1.createSession = async (scopes) => {
      provider1Started = true;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await originalCreate1(scopes);
      provider1Finished = true;
      return result;
    };
    provider2.createSession = async (scopes) => {
      provider2Started = true;
      if (provider1Started && !provider1Finished) {
        concurrencyVerified = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await originalCreate2(scopes);
      provider2Finished = true;
      return result;
    };
    const disposable1 = extHostAuthentication.registerAuthenticationProvider("concurrent-1", "Concurrent 1", provider1);
    const disposable2 = extHostAuthentication.registerAuthenticationProvider("concurrent-2", "Concurrent 2", provider2);
    disposables.add(disposable1);
    disposables.add(disposable2);
    const [session1, session2] = await Promise.all([
      extHostAuthentication.getSession(extensionDescription, "concurrent-1", ["scope"], { createIfNone: true }),
      extHostAuthentication.getSession(extensionDescription, "concurrent-2", ["scope"], { createIfNone: true })
    ]);
    assert.ok(session1);
    assert.ok(session2);
    assert.ok(provider1Started, "Provider 1 should have started");
    assert.ok(provider2Started, "Provider 2 should have started");
    assert.ok(provider1Finished, "Provider 1 should have finished");
    assert.ok(provider2Finished, "Provider 2 should have finished");
    assert.strictEqual(session1.account.label, "concurrent-1");
    assert.strictEqual(session2.account.label, "concurrent-2");
    assert.ok(concurrencyVerified, "Operations should have run concurrently - provider 2 should start while provider 1 is still running");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRIaWRlRXZlbnQsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50LCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tJbnB1dEhpZGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZEF1dGhlbnRpY2F0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkQXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIE1haW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEF1dGhlbnRpY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlLCBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gYXMgZXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IFRlc3RFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RIb3N0U2VydmljZSwgVGVzdFF1aWNrSW5wdXRTZXJ2aWNlLCBUZXN0UmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0QWN0aXZpdHlTZXJ2aWNlLCBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdExvZ2dlclNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSwgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB0eXBlIHsgQXV0aGVudGljYXRpb25Qcm92aWRlciwgQXV0aGVudGljYXRpb25TZXNzaW9uIH0gZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLCBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY291bnRVc2FnZSwgSUF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvblVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdpbmRvdyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0V2luZG93LmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRXaW5kb3cgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRXaW5kb3cuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVXNlckFjdGl2aXR5U2VydmljZSwgVXNlckFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBY3Rpdml0eS9jb21tb24vdXNlckFjdGl2aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VXJscyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJscy5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IFRlc3RTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvdGVzdC9jb21tb24vdGVzdFNlY3JldFN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RQcm9ncmVzcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0UHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuXG5jbGFzcyBBdXRoUXVpY2tQaWNrIHtcblx0cHJpdmF0ZSBhY2NlcHQ6ICgoZTogSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50KSA9PiBhbnkpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhpZGU6ICgoZTogSVF1aWNrSW5wdXRIaWRlRXZlbnQpID0+IGFueSkgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBpdGVtcyA9IFtdO1xuXHRwdWJsaWMgZ2V0IHNlbGVjdGVkSXRlbXMoKTogSVF1aWNrUGlja0l0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXM7XG5cdH1cblxuXHRvbkRpZEFjY2VwdChsaXN0ZW5lcjogKGU6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCkgPT4gYW55KSB7XG5cdFx0dGhpcy5hY2NlcHQgPSBsaXN0ZW5lcjtcblx0fVxuXHRvbkRpZEhpZGUobGlzdGVuZXI6IChlOiBJUXVpY2tJbnB1dEhpZGVFdmVudCkgPT4gYW55KSB7XG5cdFx0dGhpcy5oaWRlID0gbGlzdGVuZXI7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXG5cdH1cblx0c2hvdygpIHtcblx0XHR0aGlzLmFjY2VwdD8uKHsgaW5CYWNrZ3JvdW5kOiBmYWxzZSB9KTtcblx0XHR0aGlzLmhpZGU/Lih7IHJlYXNvbjogUXVpY2tJbnB1dEhpZGVSZWFzb24uT3RoZXIgfSk7XG5cdH1cbn1cbmNsYXNzIEF1dGhUZXN0UXVpY2tJbnB1dFNlcnZpY2UgZXh0ZW5kcyBUZXN0UXVpY2tJbnB1dFNlcnZpY2Uge1xuXHRvdmVycmlkZSBjcmVhdGVRdWlja1BpY2soKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmV0dXJuIDxhbnk+bmV3IEF1dGhRdWlja1BpY2soKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0QXV0aFVzYWdlU2VydmljZSBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0aW5pdGlhbGl6ZUV4dGVuc2lvblVzYWdlQ2FjaGUoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRleHRlbnNpb25Vc2VzQXV0aChleHRlbnNpb25JZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpOyB9XG5cdHJlYWRBY2NvdW50VXNhZ2VzKHByb3ZpZGVySWQ6IHN0cmluZywgYWNjb3VudE5hbWU6IHN0cmluZyk6IElBY2NvdW50VXNhZ2VbXSB7IHJldHVybiBbXTsgfVxuXHRyZW1vdmVBY2NvdW50VXNhZ2UocHJvdmlkZXJJZDogc3RyaW5nLCBhY2NvdW50TmFtZTogc3RyaW5nKTogdm9pZCB7IH1cblx0YWRkQWNjb3VudFVzYWdlKHByb3ZpZGVySWQ6IHN0cmluZywgYWNjb3VudE5hbWU6IHN0cmluZywgc2NvcGVzOiBSZWFkb25seUFycmF5PHN0cmluZz4sIGV4dGVuc2lvbklkOiBzdHJpbmcsIGV4dGVuc2lvbk5hbWU6IHN0cmluZyk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIFRlc3RBdXRoUHJvdmlkZXIgaW1wbGVtZW50cyBBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0cHJpdmF0ZSBpZCA9IDE7XG5cdHByaXZhdGUgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgQXV0aGVudGljYXRpb25TZXNzaW9uPigpO1xuXHRvbkRpZENoYW5nZVNlc3Npb25zID0gKCkgPT4geyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH07XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgYXV0aFByb3ZpZGVyTmFtZTogc3RyaW5nKSB7IH1cblx0YXN5bmMgZ2V0U2Vzc2lvbnMoc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdPiB7XG5cdFx0aWYgKCFzY29wZXMpIHtcblx0XHRcdHJldHVybiBbLi4udGhpcy5zZXNzaW9ucy52YWx1ZXMoKV07XG5cdFx0fVxuXG5cdFx0aWYgKHNjb3Blc1swXSA9PT0gJ3JldHVybiBtdWx0aXBsZScpIHtcblx0XHRcdHJldHVybiBbLi4udGhpcy5zZXNzaW9ucy52YWx1ZXMoKV07XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5zZXNzaW9ucy5nZXQoc2NvcGVzLmpvaW4oJyAnKSk7XG5cdFx0cmV0dXJuIHNlc3Npb25zID8gW3Nlc3Npb25zXSA6IFtdO1xuXHR9XG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0Y29uc3Qgc2NvcGVzU3RyID0gc2NvcGVzLmpvaW4oJyAnKTtcblx0XHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdFx0c2NvcGVzLFxuXHRcdFx0aWQ6IGAke3RoaXMuaWR9YCxcblx0XHRcdGFjY291bnQ6IHtcblx0XHRcdFx0bGFiZWw6IHRoaXMuYXV0aFByb3ZpZGVyTmFtZSxcblx0XHRcdFx0aWQ6IGAke3RoaXMuaWR9YCxcblx0XHRcdH0sXG5cdFx0XHRhY2Nlc3NUb2tlbjogTWF0aC5yYW5kb20oKSArICcnLFxuXHRcdH07XG5cdFx0dGhpcy5zZXNzaW9ucy5zZXQoc2NvcGVzU3RyLCBzZXNzaW9uKTtcblx0XHR0aGlzLmlkKys7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblx0YXN5bmMgcmVtb3ZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxufVxuXG5zdWl0ZSgnRXh0SG9zdEF1dGhlbnRpY2F0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBleHRIb3N0QXV0aGVudGljYXRpb246IEV4dEhvc3RBdXRoZW50aWNhdGlvbjtcblx0bGV0IG1haW5JbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHQvLyBzZXJ2aWNlc1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoTnVsbExvZ1NlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpYWxvZ1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0RGlhbG9nU2VydmljZSwgW3sgY29uZmlybWVkOiB0cnVlIH1dKSk7XG5cdFx0c2VydmljZXMuc2V0KElTdG9yYWdlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RTdG9yYWdlU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJU2VjcmV0U3RvcmFnZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0U2VjcmV0U3RvcmFnZVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElRdWlja0lucHV0U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEF1dGhUZXN0UXVpY2tJbnB1dFNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0RXh0ZW5zaW9uU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWN0aXZpdHlTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdEFjdGl2aXR5U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJUmVtb3RlQWdlbnRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdFJlbW90ZUFnZW50U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJTm90aWZpY2F0aW9uU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElIb3N0U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RIb3N0U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJVXNlckFjdGl2aXR5U2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFVzZXJBY3Rpdml0eVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKEF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQXV0aGVudGljYXRpb25TZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFRlc3RBdXRoVXNhZ2VTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBdXRoZW50aWNhdGlvbkV4dGVuc2lvbnNTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQXV0aGVudGljYXRpb25FeHRlbnNpb25zU2VydmljZSkpO1xuXHRcdG1haW5JbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXG5cdFx0Ly8gc3R1YnNcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0bWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU9wZW5lclNlcnZpY2UsIHt9IGFzIFBhcnRpYWw8SU9wZW5lclNlcnZpY2U+KTtcblx0XHRtYWluSW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdG1haW5JbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLCBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRtYWluSW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZHVjdFNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRjb25zdCBycGNQcm90b2NvbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFJQQ1Byb3RvY29sKCkpO1xuXG5cdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRBdXRoZW50aWNhdGlvbiwgZGlzcG9zYWJsZXMuYWRkKG1haW5JbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkQXV0aGVudGljYXRpb24sIHJwY1Byb3RvY29sKSkpO1xuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkV2luZG93LCBkaXNwb3NhYmxlcy5hZGQobWFpbkluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRXaW5kb3csIHJwY1Byb3RvY29sKSkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSA9IHtcblx0XHRcdGVudmlyb25tZW50OiB7XG5cdFx0XHRcdGFwcFVyaVNjaGVtZTogJ3Rlc3QnLFxuXHRcdFx0XHRhcHBOYW1lOiAnVGVzdCdcblx0XHRcdH1cblx0XHR9IGFzIGFueTtcblx0XHRleHRIb3N0QXV0aGVudGljYXRpb24gPSBuZXcgRXh0SG9zdEF1dGhlbnRpY2F0aW9uKFxuXHRcdFx0cnBjUHJvdG9jb2wsXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHtcblx0XHRcdFx0ZW52aXJvbm1lbnQ6IHtcblx0XHRcdFx0XHRhcHBVcmlTY2hlbWU6ICd0ZXN0Jyxcblx0XHRcdFx0XHRhcHBOYW1lOiAnVGVzdCdcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyBhbnksXG5cdFx0XHRuZXcgRXh0SG9zdFdpbmRvdyhpbml0RGF0YSwgcnBjUHJvdG9jb2wpLFxuXHRcdFx0bmV3IEV4dEhvc3RVcmxzKHJwY1Byb3RvY29sKSxcblx0XHRcdG5ldyBFeHRIb3N0UHJvZ3Jlc3MocnBjUHJvdG9jb2wpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nZ2VyU2VydmljZSgpKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpXG5cdFx0KTtcblx0XHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdEF1dGhlbnRpY2F0aW9uLCBleHRIb3N0QXV0aGVudGljYXRpb24pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCd0ZXN0JywgJ3Rlc3QgcHJvdmlkZXInLCBuZXcgVGVzdEF1dGhQcm92aWRlcigndGVzdCcpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHQndGVzdCBtdWx0aXBsZSBwcm92aWRlcicsXG5cdFx0XHRuZXcgVGVzdEF1dGhQcm92aWRlcigndGVzdC1tdWx0aXBsZScpLFxuXHRcdFx0eyBzdXBwb3J0c011bHRpcGxlQWNjb3VudHM6IHRydWUgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVJZk5vbmUgLSB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IFsnZm9vJ107XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlSWZOb25lIC0gZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWydmb28nXTtcblx0XHRjb25zdCBub3Nlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3Nlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBOb3cgY3JlYXRlIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e30pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgc2Vzc2lvbi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5zY29wZXNbMF0sIHNlc3Npb24uc2NvcGVzWzBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmFjY2Vzc1Rva2VuLCBzZXNzaW9uLmFjY2Vzc1Rva2VuKTtcblx0fSk7XG5cblx0Ly8gc2hvdWxkIGJlaGF2ZSB0aGUgc2FtZSBhcyBjcmVhdGVJZk5vbmU6IGZhbHNlXG5cdHRlc3QoJ3NpbGVudCAtIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWydmb28nXTtcblx0XHRjb25zdCBub3Nlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRzaWxlbnQ6IHRydWVcblx0XHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3Nlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBOb3cgY3JlYXRlIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRzaWxlbnQ6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaWQsIHNlc3Npb24yPy5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uc2NvcGVzWzBdLCBzZXNzaW9uMj8uc2NvcGVzWzBdKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2VOZXdTZXNzaW9uIC0gdHJ1ZSAtIGV4aXN0aW5nIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWydmb28nXTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHQvLyBOb3cgY3JlYXRlIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRmb3JjZU5ld1Nlc3Npb246IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZXNzaW9uMS5hY2Nlc3NUb2tlbiwgc2Vzc2lvbjI/LmFjY2Vzc1Rva2VuKTtcblx0fSk7XG5cblx0Ly8gU2hvdWxkIGJlaGF2ZSBsaWtlIGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHR0ZXN0KCdmb3JjZU5ld1Nlc3Npb24gLSB0cnVlIC0gbm8gZXhpc3Rpbmcgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e1xuXHRcdFx0XHRmb3JjZU5ld1Nlc3Npb246IHRydWVcblx0XHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCAnZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmNlTmV3U2Vzc2lvbiAtIGRldGFpbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uMiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdCcsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGZvcmNlTmV3U2Vzc2lvbjogeyBkZXRhaWw6ICdiYXInIH1cblx0XHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzZXNzaW9uMS5hY2Nlc3NUb2tlbiwgc2Vzc2lvbjI/LmFjY2Vzc1Rva2VuKTtcblx0fSk7XG5cblx0Ly8jcmVnaW9uIE11bHRpLUFjY291bnQgQXV0aFByb3ZpZGVyXG5cblx0dGVzdCgnY2xlYXJTZXNzaW9uUHJlZmVyZW5jZSAtIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2NvcGVzID0gWydmb28nXTtcblx0XHQvLyBOb3cgY3JlYXRlIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRzY29wZXMsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgc2NvcGVzWzBdKTtcblxuXHRcdGNvbnN0IHNjb3BlczIgPSBbJ2JhciddO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdHNjb3BlczIsXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgc2NvcGVzMlswXSk7XG5cblx0XHRjb25zdCBzZXNzaW9uMyA9IGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRbJ3JldHVybiBtdWx0aXBsZSddLFxuXHRcdFx0e1xuXHRcdFx0XHRjbGVhclNlc3Npb25QcmVmZXJlbmNlOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0Ly8gY2xlYXJpbmcgc2Vzc2lvbiBwcmVmZXJlbmNlIGNhdXNlcyB1cyB0byBnZXQgdGhlIGZpcnN0IHNlc3Npb25cblx0XHQvLyBiZWNhdXNlIGl0IHdvdWxkIG5vcm1hbGx5IHNob3cgYSBxdWljayBwaWNrIGZvciB0aGUgdXNlciB0byBjaG9vc2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjM/LmlkLCBzZXNzaW9uLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjM/LnNjb3Blc1swXSwgc2Vzc2lvbi5zY29wZXNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMz8uYWNjZXNzVG9rZW4sIHNlc3Npb24uYWNjZXNzVG9rZW4pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaWxlbnRseSBnZXR0aW5nIHNlc3Npb24gc2hvdWxkIHJldHVybiBhIHNlc3Npb24gKGlmIGFueSkgcmVnYXJkbGVzcyBvZiBwcmVmZXJlbmNlIC0gZml4ZXMgIzEzNzgxOScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzY29wZXMgPSBbJ2ZvbyddO1xuXHRcdC8vIE5vdyBjcmVhdGUgdGhlIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdHNjb3Blcyxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uc2NvcGVzWzBdLCBzY29wZXNbMF0pO1xuXG5cdFx0Y29uc3Qgc2NvcGVzMiA9IFsnYmFyJ107XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0c2NvcGVzMixcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmlkLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uc2NvcGVzWzBdLCBzY29wZXMyWzBdKTtcblxuXHRcdGNvbnN0IHNob3VsZEJlU2Vzc2lvbjEgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0e30pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRCZVNlc3Npb24xPy5pZCwgc2Vzc2lvbi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZEJlU2Vzc2lvbjE/LnNjb3Blc1swXSwgc2Vzc2lvbi5zY29wZXNbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRCZVNlc3Npb24xPy5hY2Nlc3NUb2tlbiwgc2Vzc2lvbi5hY2Nlc3NUb2tlbik7XG5cblx0XHRjb25zdCBzaG91bGRCZVNlc3Npb24yID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdHNjb3BlczIsXG5cdFx0XHR7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZEJlU2Vzc2lvbjI/LmlkLCBzZXNzaW9uMi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZEJlU2Vzc2lvbjI/LnNjb3Blc1swXSwgc2Vzc2lvbjIuc2NvcGVzWzBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkQmVTZXNzaW9uMj8uYWNjZXNzVG9rZW4sIHNlc3Npb24yLmFjY2Vzc1Rva2VuKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGVycm9yIGNhc2VzXG5cblx0dGVzdCgnY3JlYXRlSWZOb25lIGFuZCBmb3JjZU5ld1Nlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHRbJ2ZvbyddLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlLFxuXHRcdFx0XHRcdGZvcmNlTmV3U2Vzc2lvbjogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgaGF2ZSB0aHJvd24gYW4gRXJyb3IuJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZm9yY2VOZXdTZXNzaW9uIGFuZCBzaWxlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHRbJ2ZvbyddLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Zm9yY2VOZXdTZXNzaW9uOiB0cnVlLFxuXHRcdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgaGF2ZSB0aHJvd24gYW4gRXJyb3IuJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlSWZOb25lIGFuZCBzaWxlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHRbJ2ZvbyddLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlLFxuXHRcdFx0XHRcdHNpbGVudDogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgaGF2ZSB0aHJvd24gYW4gRXJyb3IuJyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnQ2FuIGdldCBtdWx0aXBsZSBzZXNzaW9ucyAod2l0aCBkaWZmZXJlbnQgc2NvcGVzKSBpbiBvbmUgZXh0ZW5zaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdFsnYmFyJ10sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sICdiYXInKTtcblxuXHRcdHNlc3Npb24gPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FuIGdldCBtdWx0aXBsZSBzZXNzaW9ucyAoZnJvbSBkaWZmZXJlbnQgcHJvdmlkZXJzKSBpbiBvbmUgZXh0ZW5zaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QtbXVsdGlwbGUnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRzZXNzaW9uID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0Jyxcblx0XHRcdFsnZm9vJ10sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LmlkLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5zY29wZXNbMF0sICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uYWNjb3VudC5sYWJlbCwgJ3Rlc3QnKTtcblxuXHRcdGNvbnN0IHNlc3Npb24yID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oXG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCd0ZXN0LW11bHRpcGxlJyxcblx0XHRcdFsnZm9vJ10sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUlmTm9uZTogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5zY29wZXNbMF0sICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LmFjY291bnQubGFiZWwsICd0ZXN0LW11bHRpcGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NhbiBnZXQgbXVsdGlwbGUgc2Vzc2lvbnMgKGZyb20gZGlmZmVyZW50IHByb3ZpZGVycykgaW4gb25lIGV4dGVuc2lvbiBhdCB0aGUgc2FtZSB0aW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25QOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZD4gPSBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0J3Rlc3QnLFxuXHRcdFx0Wydmb28nXSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlSWZOb25lOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uMlA6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkPiA9IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKFxuXHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0XHQndGVzdC1tdWx0aXBsZScsXG5cdFx0XHRbJ2ZvbyddLFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVJZk5vbmU6IHRydWVcblx0XHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBzZXNzaW9uUDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbj8uaWQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5hY2NvdW50LmxhYmVsLCAndGVzdCcpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBzZXNzaW9uMlA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24yPy5pZCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjI/LnNjb3Blc1swXSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uYWNjb3VudC5sYWJlbCwgJ3Rlc3QtbXVsdGlwbGUnKTtcblx0fSk7XG5cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmFjZSBDb25kaXRpb24gYW5kIFNlcXVlbmNpbmcgVGVzdHNcblxuXHR0ZXN0KCdjb25jdXJyZW50IG9wZXJhdGlvbnMgb24gc2FtZSBwcm92aWRlciBhcmUgc2VyaWFsaXplZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0QXV0aFByb3ZpZGVyKCdjb25jdXJyZW50LXRlc3QnKTtcblx0XHRjb25zdCBvcGVyYXRpb25PcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdC8vIE1vY2sgdGhlIHByb3ZpZGVyIG1ldGhvZHMgdG8gdHJhY2sgb3BlcmF0aW9uIG9yZGVyXG5cdFx0Y29uc3Qgb3JpZ2luYWxDcmVhdGVTZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlU2Vzc2lvbi5iaW5kKHByb3ZpZGVyKTtcblx0XHRjb25zdCBvcmlnaW5hbEdldFNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMuYmluZChwcm92aWRlcik7XG5cblx0XHRwcm92aWRlci5jcmVhdGVTZXNzaW9uID0gYXN5bmMgKHNjb3BlcykgPT4ge1xuXHRcdFx0b3BlcmF0aW9uT3JkZXIucHVzaChgY3JlYXRlLXN0YXJ0LSR7c2NvcGVzWzBdfWApO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwKSk7IC8vIFNpbXVsYXRlIGFzeW5jIHdvcmtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9yaWdpbmFsQ3JlYXRlU2Vzc2lvbihzY29wZXMpO1xuXHRcdFx0b3BlcmF0aW9uT3JkZXIucHVzaChgY3JlYXRlLWVuZC0ke3Njb3Blc1swXX1gKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zID0gYXN5bmMgKHNjb3BlcykgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVLZXkgPSBzY29wZXMgPyBzY29wZXNbMF0gOiAnYWxsJztcblx0XHRcdG9wZXJhdGlvbk9yZGVyLnB1c2goYGdldC1zdGFydC0ke3Njb3BlS2V5fWApO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7IC8vIFNpbXVsYXRlIGFzeW5jIHdvcmtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9yaWdpbmFsR2V0U2Vzc2lvbnMoc2NvcGVzKTtcblx0XHRcdG9wZXJhdGlvbk9yZGVyLnB1c2goYGdldC1lbmQtJHtzY29wZUtleX1gKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdjb25jdXJyZW50LXRlc3QnLCAnQ29uY3VycmVudCBUZXN0JywgcHJvdmlkZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblxuXHRcdC8vIFN0YXJ0IG11bHRpcGxlIG9wZXJhdGlvbnMgc2ltdWx0YW5lb3VzbHkgb24gdGhlIHNhbWUgcHJvdmlkZXJcblx0XHRjb25zdCBwcm9taXNlcyA9IFtcblx0XHRcdGV4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCAnY29uY3VycmVudC10ZXN0JywgWydzY29wZTEnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSksXG5cdFx0XHRleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2NvbmN1cnJlbnQtdGVzdCcsIFsnc2NvcGUyJ10sIHsgY3JlYXRlSWZOb25lOiB0cnVlIH0pLFxuXHRcdFx0ZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdjb25jdXJyZW50LXRlc3QnLCBbJ3Njb3BlMSddLCB7fSkgLy8gVGhpcyBzaG91bGQgZ2V0IHRoZSBleGlzdGluZyBzZXNzaW9uXG5cdFx0XTtcblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdC8vIFZlcmlmeSB0aGF0IG9wZXJhdGlvbnMgd2VyZSBzZXJpYWxpemVkIC0gbm8gb3ZlcmxhcHBpbmcgb3BlcmF0aW9uc1xuXHRcdC8vIEJ1aWxkIGEgbWFwIG9mIG9wZXJhdGlvbiBzdGFydHMgdG8gdGhlaXIgY29ycmVzcG9uZGluZyBlbmRzXG5cdFx0Y29uc3Qgb3BlcmF0aW9uUGFpcnM6IEFycmF5PHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXI7IG9wZXJhdGlvbjogc3RyaW5nIH0+ID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9wZXJhdGlvbk9yZGVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gb3BlcmF0aW9uT3JkZXJbaV07XG5cdFx0XHRpZiAoY3VycmVudC5pbmNsdWRlcygnLXN0YXJ0LScpKSB7XG5cdFx0XHRcdGNvbnN0IHNjb3BlID0gY3VycmVudC5zcGxpdCgnLXN0YXJ0LScpWzFdO1xuXHRcdFx0XHRjb25zdCBvcGVyYXRpb25UeXBlID0gY3VycmVudC5zcGxpdCgnLXN0YXJ0LScpWzBdO1xuXHRcdFx0XHRjb25zdCBlbmRPcGVyYXRpb24gPSBgJHtvcGVyYXRpb25UeXBlfS1lbmQtJHtzY29wZX1gO1xuXHRcdFx0XHRjb25zdCBlbmRJbmRleCA9IG9wZXJhdGlvbk9yZGVyLmluZGV4T2YoZW5kT3BlcmF0aW9uLCBpICsgMSk7XG5cblx0XHRcdFx0aWYgKGVuZEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdG9wZXJhdGlvblBhaXJzLnB1c2goe1xuXHRcdFx0XHRcdFx0c3RhcnQ6IGksXG5cdFx0XHRcdFx0XHRlbmQ6IGVuZEluZGV4LFxuXHRcdFx0XHRcdFx0b3BlcmF0aW9uOiBgJHtvcGVyYXRpb25UeXBlfS0ke3Njb3BlfWBcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZlcmlmeSBubyBvcGVyYXRpb25zIG92ZXJsYXAgKHNlcmlhbGl6YXRpb24pXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvcGVyYXRpb25QYWlycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Zm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgb3BlcmF0aW9uUGFpcnMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0Y29uc3Qgb3AxID0gb3BlcmF0aW9uUGFpcnNbaV07XG5cdFx0XHRcdGNvbnN0IG9wMiA9IG9wZXJhdGlvblBhaXJzW2pdO1xuXG5cdFx0XHRcdC8vIE9wZXJhdGlvbnMgc2hvdWxkIG5vdCBvdmVybGFwIC0gb25lIHNob3VsZCBjb21wbGV0ZWx5IGZpbmlzaCBiZWZvcmUgdGhlIG90aGVyIHN0YXJ0c1xuXHRcdFx0XHRjb25zdCBvcDFFbmRzQmVmb3JlT3AyU3RhcnRzID0gb3AxLmVuZCA8IG9wMi5zdGFydDtcblx0XHRcdFx0Y29uc3Qgb3AyRW5kc0JlZm9yZU9wMVN0YXJ0cyA9IG9wMi5lbmQgPCBvcDEuc3RhcnQ7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKG9wMUVuZHNCZWZvcmVPcDJTdGFydHMgfHwgb3AyRW5kc0JlZm9yZU9wMVN0YXJ0cyxcblx0XHRcdFx0XHRgT3BlcmF0aW9ucyAke29wMS5vcGVyYXRpb259IGFuZCAke29wMi5vcGVyYXRpb259IHNob3VsZCBub3Qgb3ZlcmxhcC4gYCArXG5cdFx0XHRcdFx0YE9wMTogJHtvcDEuc3RhcnR9LSR7b3AxLmVuZH0sIE9wMjogJHtvcDIuc3RhcnR9LSR7b3AyLmVuZH0uIGAgK1xuXHRcdFx0XHRcdGBPcmRlcjogWyR7b3BlcmF0aW9uT3JkZXIuam9pbignLCAnKX1dYCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmVyaWZ5IHdlIGhhdmUgdGhlIGV4cGVjdGVkIG9wZXJhdGlvbnNcblx0XHRhc3NlcnQub2sob3BlcmF0aW9uT3JkZXIuaW5jbHVkZXMoJ2NyZWF0ZS1zdGFydC1zY29wZTEnKSwgJ1Nob3VsZCBoYXZlIGNyZWF0ZWQgc2Vzc2lvbiBmb3Igc2NvcGUxJyk7XG5cdFx0YXNzZXJ0Lm9rKG9wZXJhdGlvbk9yZGVyLmluY2x1ZGVzKCdjcmVhdGUtZW5kLXNjb3BlMScpLCAnU2hvdWxkIGhhdmUgY29tcGxldGVkIGNyZWF0aW5nIHNlc3Npb24gZm9yIHNjb3BlMScpO1xuXHRcdGFzc2VydC5vayhvcGVyYXRpb25PcmRlci5pbmNsdWRlcygnY3JlYXRlLXN0YXJ0LXNjb3BlMicpLCAnU2hvdWxkIGhhdmUgY3JlYXRlZCBzZXNzaW9uIGZvciBzY29wZTInKTtcblx0XHRhc3NlcnQub2sob3BlcmF0aW9uT3JkZXIuaW5jbHVkZXMoJ2NyZWF0ZS1lbmQtc2NvcGUyJyksICdTaG91bGQgaGF2ZSBjb21wbGV0ZWQgY3JlYXRpbmcgc2Vzc2lvbiBmb3Igc2NvcGUyJyk7XG5cblx0XHQvLyBUaGUgdGhpcmQgY2FsbCBzaG91bGQgdXNlIGdldFNlc3Npb25zIHRvIGZpbmQgdGhlIGV4aXN0aW5nIHNjb3BlMSBzZXNzaW9uXG5cdFx0YXNzZXJ0Lm9rKG9wZXJhdGlvbk9yZGVyLmluY2x1ZGVzKCdnZXQtc3RhcnQtc2NvcGUxJyksICdTaG91bGQgaGF2ZSBjYWxsZWQgZ2V0U2Vzc2lvbnMgZm9yIGV4aXN0aW5nIHNjb3BlMSBzZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKG9wZXJhdGlvbk9yZGVyLmluY2x1ZGVzKCdnZXQtZW5kLXNjb3BlMScpLCAnU2hvdWxkIGhhdmUgY29tcGxldGVkIGdldFNlc3Npb25zIGZvciBleGlzdGluZyBzY29wZTEgc2Vzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciByZWdpc3RyYXRpb24gYW5kIGltbWVkaWF0ZSBkaXNwb3NhbCByYWNlIGNvbmRpdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0QXV0aFByb3ZpZGVyKCdyYWNlLXRlc3QnKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFuZCBpbW1lZGlhdGVseSBkaXNwb3NlXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV4dEhvc3RBdXRoZW50aWNhdGlvbi5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ3JhY2UtdGVzdCcsICdSYWNlIFRlc3QnLCBwcm92aWRlcik7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHQvLyBUcnkgdG8gdXNlIHRoZSBwcm92aWRlciBhZnRlciBkaXNwb3NhbCAtIHNob3VsZCBmYWlsIGdyYWNlZnVsbHlcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdyYWNlLXRlc3QnLCBbJ3Njb3BlJ10sIHsgY3JlYXRlSWZOb25lOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ1Nob3VsZCBoYXZlIHRocm93biBhbiBlcnJvciBmb3Igbm9uLWV4aXN0ZW50IHByb3ZpZGVyJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIEV4cGVjdGVkIC0gcHJvdmlkZXIgc2hvdWxkIGJlIHVuYXZhaWxhYmxlXG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJvdmlkZXIgcmUtcmVnaXN0cmF0aW9uIGFmdGVyIHByb3BlciBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcjEgPSBuZXcgVGVzdEF1dGhQcm92aWRlcigncmVyZWdpc3Rlci10ZXN0LTEnKTtcblx0XHRjb25zdCBwcm92aWRlcjIgPSBuZXcgVGVzdEF1dGhQcm92aWRlcigncmVyZWdpc3Rlci10ZXN0LTInKTtcblxuXHRcdC8vIEZpcnN0IHJlZ2lzdHJhdGlvblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcigncmVyZWdpc3Rlci10ZXN0JywgJ1Byb3ZpZGVyIDEnLCBwcm92aWRlcjEpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2Vzc2lvbiB3aXRoIGZpcnN0IHByb3ZpZGVyXG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBhd2FpdCBleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ3JlcmVnaXN0ZXItdGVzdCcsIFsnc2NvcGUnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24xPy5hY2NvdW50LmxhYmVsLCAncmVyZWdpc3Rlci10ZXN0LTEnKTtcblxuXHRcdC8vIERpc3Bvc2UgZmlyc3QgcHJvdmlkZXJcblx0XHRkaXNwb3NhYmxlMS5kaXNwb3NlKCk7XG5cblx0XHQvLyBSZS1yZWdpc3RlciB3aXRoIGRpZmZlcmVudCBwcm92aWRlclxuXHRcdGNvbnN0IGRpc3Bvc2FibGUyID0gZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcigncmVyZWdpc3Rlci10ZXN0JywgJ1Byb3ZpZGVyIDInLCBwcm92aWRlcjIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlMik7XG5cblx0XHQvLyBDcmVhdGUgc2Vzc2lvbiB3aXRoIHNlY29uZCBwcm92aWRlclxuXHRcdGNvbnN0IHNlc3Npb24yID0gYXdhaXQgZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdyZXJlZ2lzdGVyLXRlc3QnLCBbJ3Njb3BlJ10sIHsgY3JlYXRlSWZOb25lOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMj8uYWNjb3VudC5sYWJlbCwgJ3JlcmVnaXN0ZXItdGVzdC0yJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlc3Npb24xPy5hY2Nlc3NUb2tlbiwgc2Vzc2lvbjI/LmFjY2Vzc1Rva2VuKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlcmF0aW9ucyBvbiBkaWZmZXJlbnQgcHJvdmlkZXJzIHJ1biBjb25jdXJyZW50bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIxID0gbmV3IFRlc3RBdXRoUHJvdmlkZXIoJ2NvbmN1cnJlbnQtMScpO1xuXHRcdGNvbnN0IHByb3ZpZGVyMiA9IG5ldyBUZXN0QXV0aFByb3ZpZGVyKCdjb25jdXJyZW50LTInKTtcblxuXHRcdGxldCBwcm92aWRlcjFTdGFydGVkID0gZmFsc2U7XG5cdFx0bGV0IHByb3ZpZGVyMlN0YXJ0ZWQgPSBmYWxzZTtcblx0XHRsZXQgcHJvdmlkZXIxRmluaXNoZWQgPSBmYWxzZTtcblx0XHRsZXQgcHJvdmlkZXIyRmluaXNoZWQgPSBmYWxzZTtcblx0XHRsZXQgY29uY3VycmVuY3lWZXJpZmllZCA9IGZhbHNlO1xuXG5cdFx0Ly8gT3ZlcnJpZGUgY3JlYXRlU2Vzc2lvbiB0byB0cmFjayB0aW1pbmdcblx0XHRjb25zdCBvcmlnaW5hbENyZWF0ZTEgPSBwcm92aWRlcjEuY3JlYXRlU2Vzc2lvbi5iaW5kKHByb3ZpZGVyMSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxDcmVhdGUyID0gcHJvdmlkZXIyLmNyZWF0ZVNlc3Npb24uYmluZChwcm92aWRlcjIpO1xuXG5cdFx0cHJvdmlkZXIxLmNyZWF0ZVNlc3Npb24gPSBhc3luYyAoc2NvcGVzKSA9PiB7XG5cdFx0XHRwcm92aWRlcjFTdGFydGVkID0gdHJ1ZTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAyMCkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgb3JpZ2luYWxDcmVhdGUxKHNjb3Blcyk7XG5cdFx0XHRwcm92aWRlcjFGaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRwcm92aWRlcjIuY3JlYXRlU2Vzc2lvbiA9IGFzeW5jIChzY29wZXMpID0+IHtcblx0XHRcdHByb3ZpZGVyMlN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0Ly8gUHJvdmlkZXIgMiBzaG91bGQgc3RhcnQgYmVmb3JlIHByb3ZpZGVyIDEgZmluaXNoZXMgKGNvbmN1cnJlbnQgZXhlY3V0aW9uKVxuXHRcdFx0aWYgKHByb3ZpZGVyMVN0YXJ0ZWQgJiYgIXByb3ZpZGVyMUZpbmlzaGVkKSB7XG5cdFx0XHRcdGNvbmN1cnJlbmN5VmVyaWZpZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBvcmlnaW5hbENyZWF0ZTIoc2NvcGVzKTtcblx0XHRcdHByb3ZpZGVyMkZpbmlzaGVkID0gdHJ1ZTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gZXh0SG9zdEF1dGhlbnRpY2F0aW9uLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcignY29uY3VycmVudC0xJywgJ0NvbmN1cnJlbnQgMScsIHByb3ZpZGVyMSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBleHRIb3N0QXV0aGVudGljYXRpb24ucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdjb25jdXJyZW50LTInLCAnQ29uY3VycmVudCAyJywgcHJvdmlkZXIyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZTEpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlMik7XG5cblx0XHQvLyBTdGFydCBvcGVyYXRpb25zIG9uIGJvdGggcHJvdmlkZXJzIHNpbXVsdGFuZW91c2x5XG5cdFx0Y29uc3QgW3Nlc3Npb24xLCBzZXNzaW9uMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2NvbmN1cnJlbnQtMScsIFsnc2NvcGUnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSksXG5cdFx0XHRleHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2NvbmN1cnJlbnQtMicsIFsnc2NvcGUnXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSlcblx0XHRdKTtcblxuXHRcdC8vIFZlcmlmeSBib3RoIG9wZXJhdGlvbnMgY29tcGxldGVkIHN1Y2Nlc3NmdWxseVxuXHRcdGFzc2VydC5vayhzZXNzaW9uMSk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24yKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIxU3RhcnRlZCwgJ1Byb3ZpZGVyIDEgc2hvdWxkIGhhdmUgc3RhcnRlZCcpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcjJTdGFydGVkLCAnUHJvdmlkZXIgMiBzaG91bGQgaGF2ZSBzdGFydGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyMUZpbmlzaGVkLCAnUHJvdmlkZXIgMSBzaG91bGQgaGF2ZSBmaW5pc2hlZCcpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcjJGaW5pc2hlZCwgJ1Byb3ZpZGVyIDIgc2hvdWxkIGhhdmUgZmluaXNoZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbjEuYWNjb3VudC5sYWJlbCwgJ2NvbmN1cnJlbnQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uMi5hY2NvdW50LmxhYmVsLCAnY29uY3VycmVudC0yJyk7XG5cblx0XHQvLyBWZXJpZnkgdGhhdCBvcGVyYXRpb25zIHJhbiBjb25jdXJyZW50bHkgKHByb3ZpZGVyIDIgc3RhcnRlZCB3aGlsZSBwcm92aWRlciAxIHdhcyBzdGlsbCBydW5uaW5nKVxuXHRcdGFzc2VydC5vayhjb25jdXJyZW5jeVZlcmlmaWVkLCAnT3BlcmF0aW9ucyBzaG91bGQgaGF2ZSBydW4gY29uY3VycmVudGx5IC0gcHJvdmlkZXIgMiBzaG91bGQgc3RhcnQgd2hpbGUgcHJvdmlkZXIgMSBpcyBzdGlsbCBydW5uaW5nJyk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFDeEMsU0FBK0Isb0JBQThELDRCQUE0QjtBQUN6SCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQixtQkFBbUI7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0MsOEJBQThCO0FBQ3pFLFNBQVMsbUJBQW1CLDRCQUE0Qiw0QkFBNEI7QUFDcEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0IsaUJBQWlCLHVCQUF1Qiw4QkFBOEI7QUFDdkcsU0FBUyxxQkFBcUIsc0JBQXNCLG1CQUFtQixvQkFBb0IsMEJBQTBCO0FBRXJILFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCLG9DQUFvQztBQUMxRSxTQUF3QixtQ0FBbUM7QUFDM0QsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxhQUFhLHNCQUFzQjtBQUU1QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQiwy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
