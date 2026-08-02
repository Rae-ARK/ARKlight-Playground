import assert from "assert";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService, ILoggerService, NullLoggerService } from "../../../../../../platform/log/common/log.js";
import { InMemoryStorageService } from "../../../../../../platform/storage/common/storage.js";
import { CustomizationType, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { AbstractAgentHostCustomizationService } from "../../../browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IOutputService } from "../../../../../services/output/common/output.js";
class FakeTarget {
  constructor(customizations, workingDirectory, workingDirectories) {
    this.customizations = customizations;
    this.workingDirectory = workingDirectory;
    this.dispatched = [];
    this.workingDirectories = workingDirectories ?? (workingDirectory !== void 0 ? [workingDirectory] : void 0);
  }
  authenticate() {
    return Promise.resolve(void 0);
  }
  setCustomizationEnabled(rawId, enabled) {
    this.dispatched.push({ rawId, enabled });
    const server = this.customizations.find((c) => c.id === rawId);
    if (server) {
      server.enabled = enabled;
    }
  }
  startMcpServer() {
    return Promise.resolve();
  }
  stopMcpServer() {
    return Promise.resolve();
  }
  setRootConfigValue() {
  }
}
function mcpServer(id, name, enabled) {
  return {
    type: CustomizationType.McpServer,
    id,
    uri: `file:///${id}`,
    name,
    enabled,
    state: { kind: McpServerStatus.Stopped }
  };
}
class TestAgentHostCustomizationService extends AbstractAgentHostCustomizationService {
  constructor(instantiationService, logService, storageService) {
    super(instantiationService, logService, storageService);
    this._targets = new ResourceMap();
  }
  setTarget(sessionResource, target) {
    this._targets.set(sessionResource, target);
  }
  /** Exposes the protected cleanup hook so tests can simulate a session going away. */
  forgetSession(sessionResource) {
    this._targets.delete(sessionResource);
    this._clearMcpServerTracking(sessionResource);
  }
  _resolveTarget(sessionResource) {
    return this._targets.get(sessionResource);
  }
}
suite("AbstractAgentHostCustomizationService - MCP server enablement", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createSut() {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ILoggerService, store.add(new NullLoggerService()));
    instantiationService.stub(IOutputService, {
      getChannel: () => void 0,
      getChannelDescriptor: () => void 0,
      showChannel: async () => {
      }
    });
    const sut = store.add(new TestAgentHostCustomizationService(instantiationService, new NullLogService(), store.add(new InMemoryStorageService())));
    return sut;
  }
  const sessionA1 = URI.from({ scheme: "agent-host-copilotcli", authority: "session-a1", path: "/" });
  const sessionA2 = URI.from({ scheme: "agent-host-copilotcli", authority: "session-a2", path: "/" });
  const sessionB = URI.from({ scheme: "remote-hostB-copilotcli", authority: "session-b", path: "/" });
  test("scopes durable enablement by host scheme + server name, never by session id", () => {
    const sut = createSut();
    assert.strictEqual(sut.getMcpServerEnablement(sessionA1, "GitHub"), ContributionEnablementState.EnabledProfile);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.EnabledProfile);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledProfile);
    assert.strictEqual(sut.getMcpServerEnablement(sessionB, "GitHub"), ContributionEnablementState.EnabledProfile);
  });
  test("scopes workspace enablement by working directory without scoping profile enablement", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "file:///repo-a"));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "file:///repo-b"));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.deepStrictEqual({
      repoA: sut.getMcpServerEnablement(sessionA1, "GitHub"),
      repoB: sut.getMcpServerEnablement(sessionA2, "GitHub")
    }, {
      repoA: ContributionEnablementState.DisabledWorkspace,
      repoB: ContributionEnablementState.EnabledProfile
    });
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    assert.deepStrictEqual({
      repoA: sut.getMcpServerEnablement(sessionA1, "GitHub"),
      repoB: sut.getMcpServerEnablement(sessionA2, "GitHub")
    }, {
      repoA: ContributionEnablementState.DisabledProfile,
      repoB: ContributionEnablementState.DisabledProfile
    });
  });
  test("multi-root workspace enablement is keyed by the whole root set, order-independent", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "file:///repo-a", ["file:///repo-a", "file:///repo-b"]));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "file:///repo-b", ["file:///repo-b", "file:///repo-a"]));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledWorkspace);
  });
  test("a superset of roots has an independent workspace preference from a single root", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "file:///repo-a", ["file:///repo-a"]));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "file:///repo-a", ["file:///repo-a", "file:///repo-b"]));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.deepStrictEqual({
      singleRoot: sut.getMcpServerEnablement(sessionA1, "GitHub"),
      superset: sut.getMcpServerEnablement(sessionA2, "GitHub")
    }, {
      singleRoot: ContributionEnablementState.DisabledWorkspace,
      superset: ContributionEnablementState.EnabledProfile
    });
  });
  test("collapses duplicate roots to a single-root workspace key", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "file:///repo-a", ["file:///repo-a"]));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "file:///repo-a", ["file:///repo-a", "file:///repo-a"]));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledWorkspace);
  });
  test("canonicalizes case-variant entries within a set order-independently (case-insensitive scheme)", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "vscode-remote://host/repo-a", ["vscode-remote://host/Repo-A", "vscode-remote://host/repo-a", "vscode-remote://host/repo-b"]));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "vscode-remote://host/repo-b", ["vscode-remote://host/repo-b", "vscode-remote://host/repo-a", "vscode-remote://host/Repo-A"]));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledWorkspace);
  });
  test("a trailing-separator-only variant of a single root shares the single-root key", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)], "file:///repo-a", ["file:///repo-a"]));
    sut.setTarget(sessionA2, new FakeTarget([mcpServer("gh-2", "GitHub", true)], "file:///repo-a", ["file:///repo-a", "file:///repo-a/"]));
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledWorkspace);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledWorkspace);
  });
  test("getMcpServers is pure and prepare applies an explicit durable policy", () => {
    const sut = createSut();
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    const [server] = sut.getMcpServers(sessionA1);
    assert.strictEqual(server.enabled, true);
    assert.deepStrictEqual(target.dispatched, []);
    sut.prepareMcpServersForTurn(sessionA1);
    assert.deepStrictEqual(target.dispatched, [{ rawId: "gh-1", enabled: false }]);
    const otherTarget = new FakeTarget([mcpServer("other-1", "Other", true)]);
    sut.setTarget(sessionA2, otherTarget);
    sut.prepareMcpServersForTurn(sessionA2);
    assert.deepStrictEqual(otherTarget.dispatched, []);
  });
  test("getMcpServers provides a stable diagnostics output channel id without creating a logger", () => {
    const sut = createSut();
    sut.setTarget(sessionA1, new FakeTarget([mcpServer("gh-1", "GitHub", true)]));
    const [first] = sut.getMcpServers(sessionA1);
    const [second] = sut.getMcpServers(sessionA1);
    assert.ok(first.logOutputChannelId);
    assert.strictEqual(second.logOutputChannelId, first.logOutputChannelId);
  });
  test("does not reapply unchanged durable policy, preserving a later session-level toggle", () => {
    const sut = createSut();
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    sut.prepareMcpServersForTurn(sessionA1);
    const [server] = sut.getMcpServers(sessionA1);
    assert.strictEqual(server.enabled, false);
    server.setEnabled(true);
    assert.strictEqual(target.dispatched.length, 2);
    assert.deepStrictEqual(target.dispatched[1], { rawId: "gh-1", enabled: true });
    sut.prepareMcpServersForTurn(sessionA1);
    assert.strictEqual(target.customizations[0].enabled, true);
    assert.strictEqual(target.dispatched.length, 2);
  });
  test("shares prepare state across chats in the same backend session", () => {
    const sut = createSut();
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    sut.prepareMcpServersForTurn(sessionA1);
    const [server] = sut.getMcpServers(sessionA1);
    server.setEnabled(true);
    sut.prepareMcpServersForTurn(sessionA1.with({ fragment: "peer-chat" }));
    assert.deepStrictEqual(target.dispatched, [
      { rawId: "gh-1", enabled: false },
      { rawId: "gh-1", enabled: true }
    ]);
  });
  test("applies changed durable policy independently before each session turn", () => {
    const sut = createSut();
    const targetA1 = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    const targetA2 = new FakeTarget([mcpServer("gh-2", "GitHub", true)]);
    const targetB = new FakeTarget([mcpServer("gh-3", "GitHub", true)]);
    sut.setTarget(sessionA1, targetA1);
    sut.setTarget(sessionA2, targetA2);
    sut.setTarget(sessionB, targetB);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    assert.deepStrictEqual([targetA1.dispatched, targetA2.dispatched, targetB.dispatched], [[], [], []]);
    sut.prepareMcpServersForTurn(sessionA1);
    assert.deepStrictEqual(targetA1.dispatched, [{ rawId: "gh-1", enabled: false }]);
    assert.deepStrictEqual(targetA2.dispatched, []);
    sut.prepareMcpServersForTurn(sessionA2);
    assert.deepStrictEqual(targetA2.dispatched, [{ rawId: "gh-2", enabled: false }]);
    sut.prepareMcpServersForTurn(sessionB);
    assert.deepStrictEqual(targetB.dispatched, []);
    assert.strictEqual(sut.getMcpServerEnablement(sessionA2, "GitHub"), ContributionEnablementState.DisabledProfile);
  });
  test("applies a durable reset to EnabledProfile on the next turn", () => {
    const sut = createSut();
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    sut.prepareMcpServersForTurn(sessionA1);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.EnabledProfile);
    assert.deepStrictEqual(target.dispatched, [{ rawId: "gh-1", enabled: false }]);
    sut.prepareMcpServersForTurn(sessionA1);
    assert.deepStrictEqual(target.dispatched, [
      { rawId: "gh-1", enabled: false },
      { rawId: "gh-1", enabled: true }
    ]);
  });
  test("prunes servers that disappear and reapplies policy if they return", () => {
    const sut = createSut();
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    sut.prepareMcpServersForTurn(sessionA1);
    target.customizations.splice(0);
    sut.prepareMcpServersForTurn(sessionA1);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    assert.deepStrictEqual(target.dispatched, []);
    target.customizations.push(mcpServer("gh-1", "GitHub", true));
    sut.prepareMcpServersForTurn(sessionA1);
    assert.deepStrictEqual(target.dispatched, [{ rawId: "gh-1", enabled: false }]);
  });
  test("forgetting a session resets its prepare state without clearing durable policy", () => {
    const sut = createSut();
    const target = new FakeTarget([mcpServer("gh-1", "GitHub", true)]);
    sut.setTarget(sessionA1, target);
    sut.setMcpServerEnablement(sessionA1, "GitHub", ContributionEnablementState.DisabledProfile);
    sut.prepareMcpServersForTurn(sessionA1);
    sut.forgetSession(sessionA1);
    sut.setTarget(sessionA1, target);
    target.customizations[0].enabled = true;
    sut.prepareMcpServersForTurn(sessionA1);
    assert.deepStrictEqual(target.dispatched, [
      { rawId: "gh-1", enabled: false },
      { rawId: "gh-1", enabled: false }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UsIE51bGxMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyQ3VzdG9taXphdGlvbiwgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5cbi8qKiBBIGRpc3BhdGNoZWQgYHNldEN1c3RvbWl6YXRpb25FbmFibGVkKHJhd0lkLCBlbmFibGVkKWAgY2FsbCByZWNvcmRlZCBieSBhIHtAbGluayBGYWtlVGFyZ2V0fS4gKi9cbmludGVyZmFjZSBJRGlzcGF0Y2hlZFRvZ2dsZSB7XG5cdHJlYWRvbmx5IHJhd0lkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogQSBtaW5pbWFsLCBtdXRhYmxlIHN0YW5kLWluIGZvciB7QGxpbmsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25UYXJnZXR9LiBNaXJyb3JzIGhvdyB0aGUgcmVhbFxuICogYWdlbnQtaG9zdCB0YXJnZXRzIGJlaGF2ZTogYHNldEN1c3RvbWl6YXRpb25FbmFibGVkYCBib3RoIHJlY29yZHMgdGhlIGNhbGwgKHNvIHRlc3RzIGNhbiBhc3NlcnRcbiAqIG9uIGl0KSBhbmQgbXV0YXRlcyB0aGUgYmFja2luZyBjdXN0b21pemF0aW9uJ3MgYGVuYWJsZWRgIGZsYWcgKHNvIGEgc3Vic2VxdWVudCBgZ2V0TWNwU2VydmVyc2BcbiAqIHJlZmxlY3RzIHRoZSBuZXcgbGl2ZSBzdGF0ZSksIGp1c3QgbGlrZSBkaXNwYXRjaGluZyB0aGUgcHJvdG9jb2wgYWN0aW9uIGRvZXMgZm9yIHRoZSByZWFsXG4gKiBzZXNzaW9uIHN0YXRlIHN1YnNjcmlwdGlvbi5cbiAqL1xuY2xhc3MgRmFrZVRhcmdldCBpbXBsZW1lbnRzIElBZ2VudEhvc3RDdXN0b21pemF0aW9uVGFyZ2V0IHtcblx0cmVhZG9ubHkgZGlzcGF0Y2hlZDogSURpc3BhdGNoZWRUb2dnbGVbXSA9IFtdO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjdXN0b21pemF0aW9uczogTWNwU2VydmVyQ3VzdG9taXphdGlvbltdLFxuXHRcdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgc3RyaW5nW10sXG5cdCkge1xuXHRcdC8vIE1pcnJvciB0aGUgcmVhbCB0YXJnZXRzLCB3aGljaCBwb3B1bGF0ZSBib3RoIHRoZSBzaW5ndWxhciBwcmltYXJ5IGFuZCB0aGVcblx0XHQvLyBmdWxsIG9yZGVyZWQgc2V0IGZyb20gdGhlIHNhbWUgc2Vzc2lvbiBzdGF0ZS5cblx0XHR0aGlzLndvcmtpbmdEaXJlY3RvcmllcyA9IHdvcmtpbmdEaXJlY3RvcmllcyA/PyAod29ya2luZ0RpcmVjdG9yeSAhPT0gdW5kZWZpbmVkID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdGF1dGhlbnRpY2F0ZSgpOiBQcm9taXNlPHVua25vd24+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG5cdHNldEN1c3RvbWl6YXRpb25FbmFibGVkKHJhd0lkOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoZWQucHVzaCh7IHJhd0lkLCBlbmFibGVkIH0pO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuY3VzdG9taXphdGlvbnMuZmluZChjID0+IGMuaWQgPT09IHJhd0lkKTtcblx0XHRpZiAoc2VydmVyKSB7XG5cdFx0XHRzZXJ2ZXIuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0fVxuXHR9XG5cdHN0YXJ0TWNwU2VydmVyKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7IH1cblx0c3RvcE1jcFNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdHNldFJvb3RDb25maWdWYWx1ZSgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxufVxuXG5mdW5jdGlvbiBtY3BTZXJ2ZXIoaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKTogTWNwU2VydmVyQ3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdGlkLFxuXHRcdHVyaTogYGZpbGU6Ly8vJHtpZH1gLFxuXHRcdG5hbWUsXG5cdFx0ZW5hYmxlZCxcblx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHR9O1xufVxuXG5jbGFzcyBUZXN0QWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0cyA9IG5ldyBSZXNvdXJjZU1hcDxGYWtlVGFyZ2V0PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0c3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHNldFRhcmdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBGYWtlVGFyZ2V0KTogdm9pZCB7XG5cdFx0dGhpcy5fdGFyZ2V0cy5zZXQoc2Vzc2lvblJlc291cmNlLCB0YXJnZXQpO1xuXHR9XG5cblx0LyoqIEV4cG9zZXMgdGhlIHByb3RlY3RlZCBjbGVhbnVwIGhvb2sgc28gdGVzdHMgY2FuIHNpbXVsYXRlIGEgc2Vzc2lvbiBnb2luZyBhd2F5LiAqL1xuXHRmb3JnZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fdGFyZ2V0cy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jbGVhck1jcFNlcnZlclRyYWNraW5nKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblRhcmdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxufVxuXG5zdWl0ZSgnQWJzdHJhY3RBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSAtIE1DUCBzZXJ2ZXIgZW5hYmxlbWVudCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN1dCgpIHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ2dlclNlcnZpY2UsIHN0b3JlLmFkZChuZXcgTnVsbExvZ2dlclNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dHB1dFNlcnZpY2UsIHtcblx0XHRcdGdldENoYW5uZWw6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldENoYW5uZWxEZXNjcmlwdG9yOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzaG93Q2hhbm5lbDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN1dCA9IHN0b3JlLmFkZChuZXcgVGVzdEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKSk7XG5cdFx0cmV0dXJuIHN1dDtcblx0fVxuXG5cdC8vIFR3byBzZXNzaW9ucyBvZiB0aGUgKnNhbWUqIGhvc3QvcHJvdmlkZXIgKGlkZW50aWNhbCBzY2hlbWUsIGRpZmZlcmVudCBhdXRob3JpdHkgLS0gaS5lLlxuXHQvLyBkaWZmZXJlbnQgc2Vzc2lvbiBpZHMpLiBEdXJhYmxlIHBvbGljeSBtdXN0IGJlIHNoYXJlZCBhY3Jvc3MgdGhlbS5cblx0Y29uc3Qgc2Vzc2lvbkExID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBhdXRob3JpdHk6ICdzZXNzaW9uLWExJywgcGF0aDogJy8nIH0pO1xuXHRjb25zdCBzZXNzaW9uQTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIGF1dGhvcml0eTogJ3Nlc3Npb24tYTInLCBwYXRoOiAnLycgfSk7XG5cdC8vIEEgc2Vzc2lvbiBvbiBhICpkaWZmZXJlbnQqIGhvc3QvcHJvdmlkZXIgKGRpZmZlcmVudCBzY2hlbWUpIHRoYXQgaGFwcGVucyB0byBleHBvc2UgYVxuXHQvLyBzYW1lLW5hbWVkIHNlcnZlci4gSXRzIGR1cmFibGUgcG9saWN5IG11c3QgYmUgaW5kZXBlbmRlbnQuXG5cdGNvbnN0IHNlc3Npb25CID0gVVJJLmZyb20oeyBzY2hlbWU6ICdyZW1vdGUtaG9zdEItY29waWxvdGNsaScsIGF1dGhvcml0eTogJ3Nlc3Npb24tYicsIHBhdGg6ICcvJyB9KTtcblxuXHR0ZXN0KCdzY29wZXMgZHVyYWJsZSBlbmFibGVtZW50IGJ5IGhvc3Qgc2NoZW1lICsgc2VydmVyIG5hbWUsIG5ldmVyIGJ5IHNlc3Npb24gaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3V0ID0gY3JlYXRlU3V0KCk7XG5cblx0XHQvLyBObyBwb2xpY3kgcmVjb3JkZWQgeWV0OiBib3RoIHNlc3Npb25zIHJlYWQgdGhlIGRlZmF1bHQsIGV2ZW4gdGhvdWdoIHRoZXkncmUgZGlmZmVyZW50XG5cdFx0Ly8gc2Vzc2lvbnMgb2YgdGhlIHNhbWUgaG9zdC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3V0LmdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMiwgJ0dpdEh1YicpLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpO1xuXG5cdFx0c3V0LnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cblx0XHQvLyBTYW1lIGhvc3QgKHNjaGVtZSksIGRpZmZlcmVudCBzZXNzaW9uIGlkOiB0aGUgcG9saWN5IGNhcnJpZXMgb3ZlciBiZWNhdXNlIHRoZSBrZXkgbmV2ZXJcblx0XHQvLyBpbmNsdWRlcyBhIHBlci1zZXNzaW9uIGlkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXQuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTIsICdHaXRIdWInKSwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cblx0XHQvLyBEaWZmZXJlbnQgaG9zdCAoc2NoZW1lKSB3aXRoIGEgc2VydmVyIG9mIHRoZSBzYW1lIG5hbWU6IHVuYWZmZWN0ZWQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25CLCAnR2l0SHViJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3BlcyB3b3Jrc3BhY2UgZW5hYmxlbWVudCBieSB3b3JraW5nIGRpcmVjdG9yeSB3aXRob3V0IHNjb3BpbmcgcHJvZmlsZSBlbmFibGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1dCA9IGNyZWF0ZVN1dCgpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkExLCBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0xJywgJ0dpdEh1YicsIHRydWUpXSwgJ2ZpbGU6Ly8vcmVwby1hJykpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkEyLCBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0yJywgJ0dpdEh1YicsIHRydWUpXSwgJ2ZpbGU6Ly8vcmVwby1iJykpO1xuXG5cdFx0c3V0LnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcG9BOiBzdXQuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInKSxcblx0XHRcdHJlcG9COiBzdXQuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTIsICdHaXRIdWInKSxcblx0XHR9LCB7XG5cdFx0XHRyZXBvQTogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlLFxuXHRcdFx0cmVwb0I6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSxcblx0XHR9KTtcblxuXHRcdHN1dC5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMSwgJ0dpdEh1YicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwb0E6IHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMSwgJ0dpdEh1YicpLFxuXHRcdFx0cmVwb0I6IHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMiwgJ0dpdEh1YicpLFxuXHRcdH0sIHtcblx0XHRcdHJlcG9BOiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlLFxuXHRcdFx0cmVwb0I6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXJvb3Qgd29ya3NwYWNlIGVuYWJsZW1lbnQgaXMga2V5ZWQgYnkgdGhlIHdob2xlIHJvb3Qgc2V0LCBvcmRlci1pbmRlcGVuZGVudCcsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHQvLyBTYW1lIHR3byByb290cywgZGlmZmVyZW50IHByaW1hcnkgb3JkZXIgXHUyMDE0IG11c3Qgc2hhcmUgdGhlIHdvcmtzcGFjZSBwcmVmZXJlbmNlLlxuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkExLCBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0xJywgJ0dpdEh1YicsIHRydWUpXSwgJ2ZpbGU6Ly8vcmVwby1hJywgWydmaWxlOi8vL3JlcG8tYScsICdmaWxlOi8vL3JlcG8tYiddKSk7XG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTIsIG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTInLCAnR2l0SHViJywgdHJ1ZSldLCAnZmlsZTovLy9yZXBvLWInLCBbJ2ZpbGU6Ly8vcmVwby1iJywgJ2ZpbGU6Ly8vcmVwby1hJ10pKTtcblxuXHRcdHN1dC5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMSwgJ0dpdEh1YicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3V0LmdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkEyLCAnR2l0SHViJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3VwZXJzZXQgb2Ygcm9vdHMgaGFzIGFuIGluZGVwZW5kZW50IHdvcmtzcGFjZSBwcmVmZXJlbmNlIGZyb20gYSBzaW5nbGUgcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMScsICdHaXRIdWInLCB0cnVlKV0sICdmaWxlOi8vL3JlcG8tYScsIFsnZmlsZTovLy9yZXBvLWEnXSkpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkEyLCBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0yJywgJ0dpdEh1YicsIHRydWUpXSwgJ2ZpbGU6Ly8vcmVwby1hJywgWydmaWxlOi8vL3JlcG8tYScsICdmaWxlOi8vL3JlcG8tYiddKSk7XG5cblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaW5nbGVSb290OiBzdXQuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInKSxcblx0XHRcdHN1cGVyc2V0OiBzdXQuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTIsICdHaXRIdWInKSxcblx0XHR9LCB7XG5cdFx0XHRzaW5nbGVSb290OiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UsXG5cdFx0XHRzdXBlcnNldDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYXBzZXMgZHVwbGljYXRlIHJvb3RzIHRvIGEgc2luZ2xlLXJvb3Qgd29ya3NwYWNlIGtleScsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMScsICdHaXRIdWInLCB0cnVlKV0sICdmaWxlOi8vL3JlcG8tYScsIFsnZmlsZTovLy9yZXBvLWEnXSkpO1xuXHRcdC8vIEEgZHVwbGljYXRlZCByb290IGNhbm9uaWNhbGl6ZXMgdG8gb25lLCBzbyBpdCBtdXN0IHNoYXJlIHRoZSBzaW5nbGUtcm9vdCBrZXkuXG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTIsIG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTInLCAnR2l0SHViJywgdHJ1ZSldLCAnZmlsZTovLy9yZXBvLWEnLCBbJ2ZpbGU6Ly8vcmVwby1hJywgJ2ZpbGU6Ly8vcmVwby1hJ10pKTtcblxuXHRcdHN1dC5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMSwgJ0dpdEh1YicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3V0LmdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkEyLCAnR2l0SHViJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nhbm9uaWNhbGl6ZXMgY2FzZS12YXJpYW50IGVudHJpZXMgd2l0aGluIGEgc2V0IG9yZGVyLWluZGVwZW5kZW50bHkgKGNhc2UtaW5zZW5zaXRpdmUgc2NoZW1lKScsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHQvLyBBIHNldCB0aGF0IGxpc3RzIHRoZSBzYW1lIHJvb3QgdW5kZXIgdHdvIGNhc2Ugc3BlbGxpbmdzIChgUmVwby1BYC9gcmVwby1hYCkgcGx1cyBhXG5cdFx0Ly8gZGlzdGluY3Qgc2Vjb25kIHJvb3QuIFJldmVyc2luZyB0aGUgZW50cmllcyBtdXN0IG5vdCBjaGFuZ2UgdGhlIGR1cmFibGUga2V5OiBhbW9uZ1xuXHRcdC8vIHNwZWxsaW5ncyB0aGF0IHNoYXJlIGEgY29tcGFyaXNvbiBrZXksIHRoZSByZXByZXNlbnRhdGl2ZSBpcyBjaG9zZW4gZGV0ZXJtaW5pc3RpY2FsbHlcblx0XHQvLyAobGV4aWNvZ3JhcGhpY2FsbHkgc21hbGxlc3QpIHJhdGhlciB0aGFuIGJ5IGZpcnN0LXNlZW4gb3JkZXIuIE5vbi1gZmlsZWAgc2NoZW1lcyBhcmVcblx0XHQvLyBjYXNlLWluc2Vuc2l0aXZlIG9uIGV2ZXJ5IHBsYXRmb3JtLCBzbyB0aGlzIGlzIHN0YWJsZSBhY3Jvc3MgT1Nlcy5cblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMScsICdHaXRIdWInLCB0cnVlKV0sICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9yZXBvLWEnLCBbJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L1JlcG8tQScsICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9yZXBvLWEnLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvcmVwby1iJ10pKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMiwgbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMicsICdHaXRIdWInLCB0cnVlKV0sICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9yZXBvLWInLCBbJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L3JlcG8tYicsICd2c2NvZGUtcmVtb3RlOi8vaG9zdC9yZXBvLWEnLCAndnNjb2RlLXJlbW90ZTovL2hvc3QvUmVwby1BJ10pKTtcblxuXHRcdHN1dC5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMSwgJ0dpdEh1YicsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3V0LmdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkEyLCAnR2l0SHViJyksIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgdHJhaWxpbmctc2VwYXJhdG9yLW9ubHkgdmFyaWFudCBvZiBhIHNpbmdsZSByb290IHNoYXJlcyB0aGUgc2luZ2xlLXJvb3Qga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1dCA9IGNyZWF0ZVN1dCgpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkExLCBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0xJywgJ0dpdEh1YicsIHRydWUpXSwgJ2ZpbGU6Ly8vcmVwby1hJywgWydmaWxlOi8vL3JlcG8tYSddKSk7XG5cdFx0Ly8gYC9yZXBvLWEvYCBjb2xsYXBzZXMgdG8gYC9yZXBvLWFgLCBzbyB0aGUgdHdvLWVudHJ5IHNldCBpcyByZWFsbHkgb25lIHJvb3QuXG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTIsIG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTInLCAnR2l0SHViJywgdHJ1ZSldLCAnZmlsZTovLy9yZXBvLWEnLCBbJ2ZpbGU6Ly8vcmVwby1hJywgJ2ZpbGU6Ly8vcmVwby1hLyddKSk7XG5cblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMiwgJ0dpdEh1YicpLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNY3BTZXJ2ZXJzIGlzIHB1cmUgYW5kIHByZXBhcmUgYXBwbGllcyBhbiBleHBsaWNpdCBkdXJhYmxlIHBvbGljeScsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSldKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgdGFyZ2V0KTtcblxuXHRcdGNvbnN0IFtzZXJ2ZXJdID0gc3V0LmdldE1jcFNlcnZlcnMoc2Vzc2lvbkExKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLmVuYWJsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkLCBbeyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cblx0XHRjb25zdCBvdGhlclRhcmdldCA9IG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ290aGVyLTEnLCAnT3RoZXInLCB0cnVlKV0pO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkEyLCBvdGhlclRhcmdldCk7XG5cdFx0c3V0LnByZXBhcmVNY3BTZXJ2ZXJzRm9yVHVybihzZXNzaW9uQTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3RoZXJUYXJnZXQuZGlzcGF0Y2hlZCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNY3BTZXJ2ZXJzIHByb3ZpZGVzIGEgc3RhYmxlIGRpYWdub3N0aWNzIG91dHB1dCBjaGFubmVsIGlkIHdpdGhvdXQgY3JlYXRpbmcgYSBsb2dnZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3V0ID0gY3JlYXRlU3V0KCk7XG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTEsIG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSldKSk7XG5cblx0XHRjb25zdCBbZmlyc3RdID0gc3V0LmdldE1jcFNlcnZlcnMoc2Vzc2lvbkExKTtcblx0XHRjb25zdCBbc2Vjb25kXSA9IHN1dC5nZXRNY3BTZXJ2ZXJzKHNlc3Npb25BMSk7XG5cblx0XHRhc3NlcnQub2soZmlyc3QubG9nT3V0cHV0Q2hhbm5lbElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmxvZ091dHB1dENoYW5uZWxJZCwgZmlyc3QubG9nT3V0cHV0Q2hhbm5lbElkKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVhcHBseSB1bmNoYW5nZWQgZHVyYWJsZSBwb2xpY3ksIHByZXNlcnZpbmcgYSBsYXRlciBzZXNzaW9uLWxldmVsIHRvZ2dsZScsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSldKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgdGFyZ2V0KTtcblxuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExKTtcblx0XHRjb25zdCBbc2VydmVyXSA9IHN1dC5nZXRNY3BTZXJ2ZXJzKHNlc3Npb25BMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5lbmFibGVkLCBmYWxzZSk7XG5cblx0XHRzZXJ2ZXIuc2V0RW5hYmxlZCh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmRpc3BhdGNoZWQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkWzFdLCB7IHJhd0lkOiAnZ2gtMScsIGVuYWJsZWQ6IHRydWUgfSk7XG5cblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5jdXN0b21pemF0aW9uc1swXS5lbmFibGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmRpc3BhdGNoZWQubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnc2hhcmVzIHByZXBhcmUgc3RhdGUgYWNyb3NzIGNoYXRzIGluIHRoZSBzYW1lIGJhY2tlbmQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0xJywgJ0dpdEh1YicsIHRydWUpXSk7XG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTEsIHRhcmdldCk7XG5cdFx0c3V0LnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cdFx0Y29uc3QgW3NlcnZlcl0gPSBzdXQuZ2V0TWNwU2VydmVycyhzZXNzaW9uQTEpO1xuXHRcdHNlcnZlci5zZXRFbmFibGVkKHRydWUpO1xuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExLndpdGgoeyBmcmFnbWVudDogJ3BlZXItY2hhdCcgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0eyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgY2hhbmdlZCBkdXJhYmxlIHBvbGljeSBpbmRlcGVuZGVudGx5IGJlZm9yZSBlYWNoIHNlc3Npb24gdHVybicsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblxuXHRcdGNvbnN0IHRhcmdldEExID0gbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMScsICdHaXRIdWInLCB0cnVlKV0pO1xuXHRcdGNvbnN0IHRhcmdldEEyID0gbmV3IEZha2VUYXJnZXQoW21jcFNlcnZlcignZ2gtMicsICdHaXRIdWInLCB0cnVlKV0pO1xuXHRcdGNvbnN0IHRhcmdldEIgPSBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0zJywgJ0dpdEh1YicsIHRydWUpXSk7XG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTEsIHRhcmdldEExKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMiwgdGFyZ2V0QTIpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkIsIHRhcmdldEIpO1xuXG5cdFx0c3V0LnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbdGFyZ2V0QTEuZGlzcGF0Y2hlZCwgdGFyZ2V0QTIuZGlzcGF0Y2hlZCwgdGFyZ2V0Qi5kaXNwYXRjaGVkXSwgW1tdLCBbXSwgW11dKTtcblxuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldEExLmRpc3BhdGNoZWQsIFt7IHJhd0lkOiAnZ2gtMScsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldEEyLmRpc3BhdGNoZWQsIFtdKTtcblxuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkEyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldEEyLmRpc3BhdGNoZWQsIFt7IHJhd0lkOiAnZ2gtMicsIGVuYWJsZWQ6IGZhbHNlIH1dKTtcblxuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0Qi5kaXNwYXRjaGVkLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1dC5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25BMiwgJ0dpdEh1YicpLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBhIGR1cmFibGUgcmVzZXQgdG8gRW5hYmxlZFByb2ZpbGUgb24gdGhlIG5leHQgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBzdXQgPSBjcmVhdGVTdXQoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBuZXcgRmFrZVRhcmdldChbbWNwU2VydmVyKCdnaC0xJywgJ0dpdEh1YicsIHRydWUpXSk7XG5cdFx0c3V0LnNldFRhcmdldChzZXNzaW9uQTEsIHRhcmdldCk7XG5cblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cdFx0c3V0LnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvbkExLCAnR2l0SHViJywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkLCBbeyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0eyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BydW5lcyBzZXJ2ZXJzIHRoYXQgZGlzYXBwZWFyIGFuZCByZWFwcGxpZXMgcG9saWN5IGlmIHRoZXkgcmV0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1dCA9IGNyZWF0ZVN1dCgpO1xuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSldKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgdGFyZ2V0KTtcblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cblx0XHR0YXJnZXQuY3VzdG9taXphdGlvbnMuc3BsaWNlKDApO1xuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExKTtcblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkLCBbXSk7XG5cblx0XHR0YXJnZXQuY3VzdG9taXphdGlvbnMucHVzaChtY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSkpO1xuXHRcdHN1dC5wcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvbkExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkLCBbeyByYXdJZDogJ2doLTEnLCBlbmFibGVkOiBmYWxzZSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmdldHRpbmcgYSBzZXNzaW9uIHJlc2V0cyBpdHMgcHJlcGFyZSBzdGF0ZSB3aXRob3V0IGNsZWFyaW5nIGR1cmFibGUgcG9saWN5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1dCA9IGNyZWF0ZVN1dCgpO1xuXHRcdGNvbnN0IHRhcmdldCA9IG5ldyBGYWtlVGFyZ2V0KFttY3BTZXJ2ZXIoJ2doLTEnLCAnR2l0SHViJywgdHJ1ZSldKTtcblx0XHRzdXQuc2V0VGFyZ2V0KHNlc3Npb25BMSwgdGFyZ2V0KTtcblx0XHRzdXQuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uQTEsICdHaXRIdWInLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cblx0XHRzdXQuZm9yZ2V0U2Vzc2lvbihzZXNzaW9uQTEpO1xuXHRcdHN1dC5zZXRUYXJnZXQoc2Vzc2lvbkExLCB0YXJnZXQpO1xuXHRcdHRhcmdldC5jdXN0b21pemF0aW9uc1swXS5lbmFibGVkID0gdHJ1ZTtcblx0XHRzdXQucHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKHNlc3Npb25BMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5kaXNwYXRjaGVkLCBbXG5cdFx0XHR7IHJhd0lkOiAnZ2gtMScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IHJhd0lkOiAnZ2gtMScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQXNCLGdCQUFnQixnQkFBZ0IseUJBQXlCO0FBQy9FLFNBQVMsOEJBQStDO0FBQ3hELFNBQVMsbUJBQTJDLHVCQUF1QjtBQUMzRSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZDQUE0RTtBQUNyRixTQUFTLHNCQUFzQjtBQWUvQixNQUFNLFdBQW9EO0FBQUEsRUFJekQsWUFDVSxnQkFDQSxrQkFDVCxvQkFDQztBQUhRO0FBQ0E7QUFMVixTQUFTLGFBQWtDLENBQUM7QUFVM0MsU0FBSyxxQkFBcUIsdUJBQXVCLHFCQUFxQixTQUFZLENBQUMsZ0JBQWdCLElBQUk7QUFBQSxFQUN4RztBQUFBLEVBRUEsZUFBaUM7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
