import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { agentSessionSettingsUri, AgentSessionSettingsFileSystemProvider, AgentSessionSettingsSchemaRegistrar } from "../../browser/agentSessionSettingsFileSystemProvider.js";
const PROVIDER_ID = "local-agent-host";
const RESOURCE_SCHEME = "agent-host-copilot";
const RAW_ID = "abc-123";
suite("AgentSessionSettingsFileSystemProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createSession() {
    const resource = URI.from({ scheme: RESOURCE_SCHEME, path: `/${RAW_ID}` });
    return {
      sessionId: `${PROVIDER_ID}:${resource.toString()}`,
      resource,
      providerId: PROVIDER_ID
    };
  }
  function createHarness(initialConfig, registerProvider = true) {
    const session = createSession();
    const onDidChangeSessionConfigEmitter = store.add(new Emitter());
    const onDidChangeSessionsEmitter = store.add(new Emitter());
    const replaceCalls = [];
    const sessionProvider = {
      id: PROVIDER_ID,
      config: initialConfig,
      onDidChangeSessionConfigEmitter,
      onDidChangeSessionsEmitter,
      replaceCalls,
      onDidChangeSessionConfig: onDidChangeSessionConfigEmitter.event,
      onDidChangeSessions: onDidChangeSessionsEmitter.event,
      getSessions: () => [session],
      getSessionConfig: (_sessionId) => sessionProvider.config,
      replaceSessionConfig: async (sessionId, values) => {
        replaceCalls.push({ sessionId, values });
        if (sessionProvider.config) {
          sessionProvider.config = {
            ...sessionProvider.config,
            values: { ...values }
          };
        }
      },
      setSessionConfigValue: async () => {
      }
    };
    const onDidChangeProvidersEmitter = store.add(new Emitter());
    const providersService = {
      getProvider(providerId) {
        if (registerProvider && providerId === PROVIDER_ID) {
          return sessionProvider;
        }
        return void 0;
      },
      getProviders: () => registerProvider ? [sessionProvider] : [],
      onDidChangeProviders: onDidChangeProvidersEmitter.event
    };
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [ISessionsProvidersService, providersService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));
    return { fs, session, uri: agentSessionSettingsUri(session), sessionProvider };
  }
  test("readFile returns mutable, non-readOnly config values as JSON", async () => {
    const { fs, uri } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
          // non-mutable — omitted
          branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
          // readOnly — omitted
        }
      },
      values: { autoApprove: "default", isolation: "worktree", branch: "main" }
    });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const jsonStart = text.indexOf("{");
    const parsed = JSON.parse(text.substring(jsonStart));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("writeFile with unchanged content still forwards raw input (provider guards/short-circuits)", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
        }
      },
      values: { autoApprove: "default" }
    });
    const current = await fs.readFile(uri);
    await fs.writeFile(uri, current, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "default" }
    }]);
  });
  test("writeFile forwards the user's parsed JSON as the replace payload", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] },
          // non-mutable
          branch: { type: "string", title: "Branch", sessionMutable: true, readOnly: true, enum: ["main"] }
          // readOnly
        }
      },
      values: { autoApprove: "default", mode: "a", isolation: "worktree", branch: "main" }
    });
    const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "autoApprove", mode: "b" }
    }]);
  });
  test("writeFile forwards a partial edit set, supporting unset via omission", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] },
          isolation: { type: "string", title: "Isolation", enum: ["worktree"] }
        }
      },
      values: { autoApprove: "autoApprove", mode: "a", isolation: "worktree" }
    });
    const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(sessionProvider.replaceCalls, [{
      sessionId: session.sessionId,
      values: { autoApprove: "default" }
    }]);
  });
  test("onDidChangeFile fires when provider config changes", async () => {
    const { fs, uri, session, sessionProvider } = createHarness({
      schema: { type: "object", properties: {} },
      values: {}
    });
    const events = [];
    const listeners = new DisposableStore();
    store.add(listeners);
    listeners.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    const watch = fs.watch(uri, { recursive: false, excludes: [] });
    listeners.add(watch);
    sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].toString(), uri.toString());
  });
  test("readFile on unknown provider throws FileNotFound", async () => {
    const { fs, uri } = createHarness(
      void 0,
      /*registerProvider*/
      false
    );
    await assert.rejects(async () => {
      await fs.readFile(uri);
    });
  });
  suite("schema registration", () => {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    function expectedSchemaId(session) {
      return `vscode://schemas/agent-session-settings/${session.providerId}/${session.resource.scheme}/${session.resource.path}.jsonc`;
    }
    test("readFile lazily registers a schema + association for the session", async () => {
      const { fs, uri, session } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when onDidChangeSessionConfig fires with a new schema identity", async () => {
      const { fs, uri, session, sessionProvider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      sessionProvider.config = {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default", "autoApprove"] },
            mode: { type: "string", title: "Mode", sessionMutable: true, enum: ["a", "b"] }
          }
        },
        values: { autoApprove: "default", mode: "a" }
      };
      sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
    test("schema is disposed when the session is removed", async () => {
      const { fs, uri, session, sessionProvider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", sessionMutable: true, enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId(session);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      sessionProvider.onDidChangeSessionsEmitter.fire({ added: [], removed: [session], changed: [] });
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRTZXNzaW9uU2V0dGluZ3NVcmksIEFnZW50U2Vzc2lvblNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLCBBZ2VudFNlc3Npb25TZXR0aW5nc1NjaGVtYVJlZ2lzdHJhciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuXG5jb25zdCBQUk9WSURFUl9JRCA9ICdsb2NhbC1hZ2VudC1ob3N0JztcbmNvbnN0IFJFU09VUkNFX1NDSEVNRSA9ICdhZ2VudC1ob3N0LWNvcGlsb3QnO1xuY29uc3QgUkFXX0lEID0gJ2FiYy0xMjMnO1xuXG5zdWl0ZSgnQWdlbnRTZXNzaW9uU2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBSRVNPVVJDRV9TQ0hFTUUsIHBhdGg6IGAvJHtSQVdfSUR9YCB9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkOiBgJHtQUk9WSURFUl9JRH06JHtyZXNvdXJjZS50b1N0cmluZygpfWAsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHByb3ZpZGVySWQ6IFBST1ZJREVSX0lELFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbjtcblx0fVxuXG5cdGludGVyZmFjZSBJVGVzdEhhcm5lc3Mge1xuXHRcdHJlYWRvbmx5IGZzOiBBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0XHRyZWFkb25seSBzZXNzaW9uOiBJU2Vzc2lvbjtcblx0XHRyZWFkb25seSB1cmk6IFVSSTtcblx0XHRyZWFkb25seSBzZXNzaW9uUHJvdmlkZXI6IElNb2NrQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjtcblx0fVxuXG5cdGludGVyZmFjZSBJTW9ja0FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIgZXh0ZW5kcyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0Y29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25Db25maWdFbWl0dGVyOiBFbWl0dGVyPHN0cmluZz47XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXI6IEVtaXR0ZXI8eyBhZGRlZDogcmVhZG9ubHkgSVNlc3Npb25bXTsgcmVtb3ZlZDogcmVhZG9ubHkgSVNlc3Npb25bXTsgY2hhbmdlZDogcmVhZG9ubHkgSVNlc3Npb25bXSB9Pjtcblx0XHRyZWFkb25seSByZXBsYWNlQ2FsbHM6IEFycmF5PHsgc2Vzc2lvbklkOiBzdHJpbmc7IHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfT47XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVIYXJuZXNzKFxuXHRcdGluaXRpYWxDb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHwgdW5kZWZpbmVkLFxuXHRcdHJlZ2lzdGVyUHJvdmlkZXIgPSB0cnVlLFxuXHQpOiBJVGVzdEhhcm5lc3Mge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25Db25maWdFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBhZGRlZDogcmVhZG9ubHkgSVNlc3Npb25bXTsgcmVtb3ZlZDogcmVhZG9ubHkgSVNlc3Npb25bXTsgY2hhbmdlZDogcmVhZG9ubHkgSVNlc3Npb25bXSB9PigpKTtcblx0XHRjb25zdCByZXBsYWNlQ2FsbHM6IEFycmF5PHsgc2Vzc2lvbklkOiBzdHJpbmc7IHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfT4gPSBbXTtcblxuXHRcdGNvbnN0IHNlc3Npb25Qcm92aWRlcjogSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyID0ge1xuXHRcdFx0aWQ6IFBST1ZJREVSX0lELFxuXHRcdFx0Y29uZmlnOiBpbml0aWFsQ29uZmlnLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnRW1pdHRlcixcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnNFbWl0dGVyLFxuXHRcdFx0cmVwbGFjZUNhbGxzLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnOiBvbkRpZENoYW5nZVNlc3Npb25Db25maWdFbWl0dGVyLmV2ZW50LFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogb25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gW3Nlc3Npb25dLFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZzogKF9zZXNzaW9uSWQ6IHN0cmluZykgPT4gc2Vzc2lvblByb3ZpZGVyLmNvbmZpZyxcblx0XHRcdHJlcGxhY2VTZXNzaW9uQ29uZmlnOiBhc3luYyAoc2Vzc2lvbklkOiBzdHJpbmcsIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHtcblx0XHRcdFx0cmVwbGFjZUNhbGxzLnB1c2goeyBzZXNzaW9uSWQsIHZhbHVlcyB9KTtcblx0XHRcdFx0aWYgKHNlc3Npb25Qcm92aWRlci5jb25maWcpIHtcblx0XHRcdFx0XHRzZXNzaW9uUHJvdmlkZXIuY29uZmlnID0ge1xuXHRcdFx0XHRcdFx0Li4uc2Vzc2lvblByb3ZpZGVyLmNvbmZpZyxcblx0XHRcdFx0XHRcdHZhbHVlczogeyAuLi52YWx1ZXMgfSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlOiBhc3luYyAoKSA9PiB7IC8qIHVudXNlZCBieSB3cml0ZUZpbGUgKi8gfSxcblx0XHR9IGFzIHVua25vd24gYXMgSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VQcm92aWRlcnNFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IHJlYWRvbmx5IElTZXNzaW9uc1Byb3ZpZGVyW107IHJlbW92ZWQ6IHJlYWRvbmx5IElTZXNzaW9uc1Byb3ZpZGVyW10gfT4oKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSA9IHtcblx0XHRcdGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChyZWdpc3RlclByb3ZpZGVyICYmIHByb3ZpZGVySWQgPT09IFBST1ZJREVSX0lEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNlc3Npb25Qcm92aWRlciBhcyB1bmtub3duIGFzIFQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRQcm92aWRlcnM6ICgpID0+IHJlZ2lzdGVyUHJvdmlkZXIgPyBbc2Vzc2lvblByb3ZpZGVyIGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJdIDogW10sXG5cdFx0XHRvbkRpZENoYW5nZVByb3ZpZGVyczogb25EaWRDaGFuZ2VQcm92aWRlcnNFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHQpKSk7XG5cblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyYXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uU2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIpKTtcblx0XHRjb25zdCBmcyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNlc3Npb25TZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgc2NoZW1hUmVnaXN0cmFyKSk7XG5cblx0XHRyZXR1cm4geyBmcywgc2Vzc2lvbiwgdXJpOiBhZ2VudFNlc3Npb25TZXR0aW5nc1VyaShzZXNzaW9uKSwgc2Vzc2lvblByb3ZpZGVyIH07XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSByZXR1cm5zIG11dGFibGUsIG5vbi1yZWFkT25seSBjb25maWcgdmFsdWVzIGFzIEpTT04nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ3dvcmt0cmVlJ10gfSwgLy8gbm9uLW11dGFibGUgXHUyMDE0IG9taXR0ZWRcblx0XHRcdFx0XHRicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIHJlYWRPbmx5OiB0cnVlLCBlbnVtOiBbJ21haW4nXSB9LCAvLyByZWFkT25seSBcdTIwMTQgb21pdHRlZFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBidWYgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGJ1ZikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBqc29uU3RhcnQgPSB0ZXh0LmluZGV4T2YoJ3snKTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKGpzb25TdGFydCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIHVuY2hhbmdlZCBjb250ZW50IHN0aWxsIGZvcndhcmRzIHJhdyBpbnB1dCAocHJvdmlkZXIgZ3VhcmRzL3Nob3J0LWNpcmN1aXRzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIHNlc3Npb24sIHNlc3Npb25Qcm92aWRlciB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY3VycmVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgY3VycmVudCwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cdFx0Ly8gRlMgcHJvdmlkZXIgZm9yd2FyZHMgdGhlIHBhcnNlZCBKU09OIGFzLWlzOyB0aGUgZ3VhcmQvc2hvcnQtY2lyY3VpdFxuXHRcdC8vIGlzIHRoZSBwcm92aWRlcidzIHJlc3BvbnNpYmlsaXR5IChjb3ZlcmVkIGluIHRoZSBwcm92aWRlciB0ZXN0KS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25Qcm92aWRlci5yZXBsYWNlQ2FsbHMsIFt7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBmb3J3YXJkcyB0aGUgdXNlclxcJ3MgcGFyc2VkIEpTT04gYXMgdGhlIHJlcGxhY2UgcGF5bG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIHNlc3Npb24sIHNlc3Npb25Qcm92aWRlciB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHRtb2RlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ01vZGUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ3dvcmt0cmVlJ10gfSwgLy8gbm9uLW11dGFibGVcblx0XHRcdFx0XHRicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIHJlYWRPbmx5OiB0cnVlLCBlbnVtOiBbJ21haW4nXSB9LCAvLyByZWFkT25seVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSxcblx0XHR9KTtcblxuXHRcdC8vIFVzZXIgZWRpdHM6IG9ubHkgZWRpdGFibGUga2V5cyBhcmUgZXhwb3NlZCBhbmQgcm91bmQtdHJpcHBlZCB0aHJvdWdoXG5cdFx0Ly8gdGhlIEZTIHByb3ZpZGVyLiBOb24tZWRpdGFibGUgcHJlc2VydmF0aW9uIGlzIHRoZSBwcm92aWRlcidzIGpvYi5cblx0XHRjb25zdCBuZXdDb250ZW50ID0gVlNCdWZmZXIuZnJvbVN0cmluZygnLy8gdHJhaWxpbmcgY29tbWVudHMgb2tcXG57IFwiYXV0b0FwcHJvdmVcIjogXCJhdXRvQXBwcm92ZVwiLCBcIm1vZGVcIjogXCJiXCIsIH1cXG4nKS5idWZmZXI7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHVyaSwgbmV3Q29udGVudCwgeyBjcmVhdGU6IGZhbHNlLCBvdmVyd3JpdGU6IHRydWUsIHVubG9jazogZmFsc2UsIGF0b21pYzogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25Qcm92aWRlci5yZXBsYWNlQ2FsbHMsIFt7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBtb2RlOiAnYicgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBmb3J3YXJkcyBhIHBhcnRpYWwgZWRpdCBzZXQsIHN1cHBvcnRpbmcgdW5zZXQgdmlhIG9taXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgc2Vzc2lvbiwgc2Vzc2lvblByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0XHRcdFx0aXNvbGF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0lzb2xhdGlvbicsIGVudW06IFsnd29ya3RyZWUnXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgbW9kZTogJ2EnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7IFwiYXV0b0FwcHJvdmVcIjogXCJkZWZhdWx0XCIgfVxcbicpLmJ1ZmZlcjtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBuZXdDb250ZW50LCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvblByb3ZpZGVyLnJlcGxhY2VDYWxscywgW3tcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VGaWxlIGZpcmVzIHdoZW4gcHJvdmlkZXIgY29uZmlnIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uLCBzZXNzaW9uUHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGxpc3RlbmVycyk7XG5cdFx0bGlzdGVuZXJzLmFkZChmcy5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykge1xuXHRcdFx0XHRldmVudHMucHVzaChjLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBmcy53YXRjaCh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdGxpc3RlbmVycy5hZGQod2F0Y2gpO1xuXG5cdFx0c2Vzc2lvblByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ0VtaXR0ZXIuZmlyZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIG9uIHVua25vd24gcHJvdmlkZXIgdGhyb3dzIEZpbGVOb3RGb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3ModW5kZWZpbmVkLCAvKnJlZ2lzdGVyUHJvdmlkZXIqLyBmYWxzZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2NoZW1hIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuXG5cdFx0ZnVuY3Rpb24gZXhwZWN0ZWRTY2hlbWFJZChzZXNzaW9uOiBJU2Vzc2lvbik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gYHZzY29kZTovL3NjaGVtYXMvYWdlbnQtc2Vzc2lvbi1zZXR0aW5ncy8ke3Nlc3Npb24ucHJvdmlkZXJJZH0vJHtzZXNzaW9uLnJlc291cmNlLnNjaGVtZX0vJHtzZXNzaW9uLnJlc291cmNlLnBhdGh9Lmpzb25jYDtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWFkRmlsZSBsYXppbHkgcmVnaXN0ZXJzIGEgc2NoZW1hICsgYXNzb2NpYXRpb24gZm9yIHRoZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2NoZW1hSWQgPSBleHBlY3RlZFNjaGVtYUlkKHNlc3Npb24pO1xuXG5cdFx0XHQvLyBObyByZWdpc3RyYXRpb24gYmVmb3JlIHRoZSBmaWxlIGlzIHJlYWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFBc3NvY2lhdGlvbnMoKVtzY2hlbWFJZF0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5oYXNTY2hlbWFDb250ZW50KHNjaGVtYUlkKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUFzc29jaWF0aW9ucygpW3NjaGVtYUlkXSwgW3VyaS50b1N0cmluZygpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2hlbWEgaXMgcmVmcmVzaGVkIHdoZW4gb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnIGZpcmVzIHdpdGggYSBuZXcgc2NoZW1hIGlkZW50aXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uLCBzZXNzaW9uUHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0J10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzY2hlbWFJZCA9IGV4cGVjdGVkU2NoZW1hSWQoc2Vzc2lvbik7XG5cblx0XHRcdC8vIFRyaWdnZXIgaW5pdGlhbCByZWdpc3RyYXRpb24uXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsKTtcblxuXHRcdFx0Ly8gU3dhcCBpbiBhIG5ldyBzY2hlbWEgKGlkZW50aXR5IGNoYW5nZSkgYW5kIG5vdGlmeS5cblx0XHRcdHNlc3Npb25Qcm92aWRlci5jb25maWcgPSB7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIHNlc3Npb25NdXRhYmxlOiB0cnVlLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgc2Vzc2lvbk11dGFibGU6IHRydWUsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgbW9kZTogJ2EnIH0sXG5cdFx0XHR9O1xuXHRcdFx0c2Vzc2lvblByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ0VtaXR0ZXIuZmlyZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRcdGNvbnN0IHJlZnJlc2hlZCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChyZWZyZXNoZWQsIGluaXRpYWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZnJlc2hlZC5wcm9wZXJ0aWVzPy5bJ21vZGUnXSwgJ3JlZnJlc2hlZCBzY2hlbWEgc2hvdWxkIGluY2x1ZGUgdGhlIG5ld2x5IGFkZGVkIHByb3BlcnR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2hlbWEgaXMgZGlzcG9zZWQgd2hlbiB0aGUgc2Vzc2lvbiBpcyByZW1vdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpLCBzZXNzaW9uLCBzZXNzaW9uUHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSwgZW51bTogWydkZWZhdWx0J10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzY2hlbWFJZCA9IGV4cGVjdGVkU2NoZW1hSWQoc2Vzc2lvbik7XG5cblx0XHRcdGF3YWl0IGZzLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIHRydWUpO1xuXG5cdFx0XHRzZXNzaW9uUHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uc0VtaXR0ZXIuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxpQ0FBaUM7QUFHMUMsU0FBUyx5QkFBeUIsd0NBQXdDLDJDQUEyQztBQUVySCxNQUFNLGNBQWM7QUFDcEIsTUFBTSxrQkFBa0I7QUFDeEIsTUFBTSxTQUFTO0FBRWYsTUFBTSwwQ0FBMEMsTUFBTTtBQUVyRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMsZ0JBQTBCO0FBQ2xDLFVB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
