import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { NullLogService, ILogService } from "../../../../../../platform/log/common/log.js";
import { Extensions as JSONExtensions } from "../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { agentHostSettingsUri, AgentHostSettingsFileSystemProvider, AgentHostSettingsSchemaRegistrar } from "../../browser/agentHostSettingsFileSystemProvider.js";
const PROVIDER_ID = "local-agent-host";
suite("AgentHostSettingsFileSystemProvider", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHarness(initialConfig, registerProvider = true) {
    const onDidChangeRootConfigEmitter = store.add(new Emitter());
    const replaceCalls = [];
    const provider = {
      id: PROVIDER_ID,
      config: initialConfig,
      onDidChangeRootConfigEmitter,
      replaceCalls,
      onDidChangeRootConfig: onDidChangeRootConfigEmitter.event,
      getRootConfig: () => provider.config,
      replaceRootConfig: async (values) => {
        replaceCalls.push({ values });
        if (provider.config) {
          provider.config = {
            ...provider.config,
            values: { ...values }
          };
        }
      }
    };
    const onDidChangeProvidersEmitter = store.add(new Emitter());
    const providersService = {
      getProvider(providerId) {
        if (registerProvider && providerId === PROVIDER_ID) {
          return provider;
        }
        return void 0;
      },
      getProviders: () => registerProvider ? [provider] : [],
      onDidChangeProviders: onDidChangeProvidersEmitter.event
    };
    const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
      [ISessionsProvidersService, providersService],
      [ILogService, new NullLogService()]
    )));
    const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
    const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));
    return { fs, uri: agentHostSettingsUri(PROVIDER_ID), provider };
  }
  test("readFile returns root config values as JSON", async () => {
    const { fs, uri } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
        }
      },
      values: { autoApprove: "default" }
    });
    const buf = await fs.readFile(uri);
    const text = VSBuffer.wrap(buf).toString();
    const jsonStart = text.indexOf("{");
    const parsed = JSON.parse(text.substring(jsonStart));
    assert.deepStrictEqual(parsed, { autoApprove: "default" });
  });
  test("writeFile forwards the user's parsed JSON as the replace payload", async () => {
    const { fs, uri, provider } = createHarness({
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
          mode: { type: "string", title: "Mode", enum: ["a", "b"] }
        }
      },
      values: { autoApprove: "default", mode: "a" }
    });
    const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.deepStrictEqual(provider.replaceCalls, [{
      values: { autoApprove: "autoApprove", mode: "b" }
    }]);
  });
  test("writeFile with unknown provider is a no-op (write ignored, change event still fires)", async () => {
    const { fs, uri } = createHarness(
      void 0,
      /*registerProvider*/
      true
    );
    const events = [];
    store.add(fs.onDidChangeFile((changes) => {
      for (const c of changes) {
        events.push(c.resource);
      }
    }));
    const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
    await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });
    assert.strictEqual(events.length, 1);
  });
  test("onDidChangeFile fires when provider root config changes", async () => {
    const { fs, uri, provider } = createHarness({
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
    provider.onDidChangeRootConfigEmitter.fire();
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
    function expectedSchemaId() {
      return `vscode://schemas/agent-host-settings/${PROVIDER_ID}.jsonc`;
    }
    test("readFile lazily registers a schema + association for the provider", async () => {
      const { fs, uri } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId();
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
      assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], void 0);
      await fs.readFile(uri);
      assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
      assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
    });
    test("schema is refreshed when onDidChangeRootConfig fires with a new schema identity", async () => {
      const { fs, uri, provider } = createHarness({
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default"] }
          }
        },
        values: { autoApprove: "default" }
      });
      const schemaId = expectedSchemaId();
      await fs.readFile(uri);
      const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.ok(initial);
      provider.config = {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"] },
            mode: { type: "string", title: "Mode", enum: ["a", "b"] }
          }
        },
        values: { autoApprove: "default", mode: "a" }
      };
      provider.onDidChangeRootConfigEmitter.fire();
      const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
      assert.notStrictEqual(refreshed, initial);
      assert.ok(refreshed.properties?.["mode"], "refreshed schema should include the newly added property");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290Q29uZmlnU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UsIElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0U2V0dGluZ3NVcmksIEFnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyLCBBZ2VudEhvc3RTZXR0aW5nc1NjaGVtYVJlZ2lzdHJhciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0U2V0dGluZ3NGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuXG5jb25zdCBQUk9WSURFUl9JRCA9ICdsb2NhbC1hZ2VudC1ob3N0Jztcblxuc3VpdGUoJ0FnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElUZXN0SGFybmVzcyB7XG5cdFx0cmVhZG9ubHkgZnM6IEFnZW50SG9zdFNldHRpbmdzRmlsZVN5c3RlbVByb3ZpZGVyO1xuXHRcdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRcdHJlYWRvbmx5IHByb3ZpZGVyOiBJTW9ja0FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG5cdH1cblxuXHRpbnRlcmZhY2UgSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIGV4dGVuZHMgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdGNvbmZpZzogUm9vdENvbmZpZ1N0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUm9vdENvbmZpZ0VtaXR0ZXI6IEVtaXR0ZXI8dm9pZD47XG5cdFx0cmVhZG9ubHkgcmVwbGFjZUNhbGxzOiBBcnJheTx7IHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfT47XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVIYXJuZXNzKFxuXHRcdGluaXRpYWxDb25maWc6IFJvb3RDb25maWdTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRyZWdpc3RlclByb3ZpZGVyID0gdHJ1ZSxcblx0KTogSVRlc3RIYXJuZXNzIHtcblx0XHRjb25zdCBvbkRpZENoYW5nZVJvb3RDb25maWdFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IHJlcGxhY2VDYWxsczogQXJyYXk8eyB2YWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+ID0gW107XG5cblx0XHRjb25zdCBwcm92aWRlcjogSU1vY2tBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyID0ge1xuXHRcdFx0aWQ6IFBST1ZJREVSX0lELFxuXHRcdFx0Y29uZmlnOiBpbml0aWFsQ29uZmlnLFxuXHRcdFx0b25EaWRDaGFuZ2VSb290Q29uZmlnRW1pdHRlcixcblx0XHRcdHJlcGxhY2VDYWxscyxcblx0XHRcdG9uRGlkQ2hhbmdlUm9vdENvbmZpZzogb25EaWRDaGFuZ2VSb290Q29uZmlnRW1pdHRlci5ldmVudCxcblx0XHRcdGdldFJvb3RDb25maWc6ICgpID0+IHByb3ZpZGVyLmNvbmZpZyxcblx0XHRcdHJlcGxhY2VSb290Q29uZmlnOiBhc3luYyAodmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuXHRcdFx0XHRyZXBsYWNlQ2FsbHMucHVzaCh7IHZhbHVlcyB9KTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLmNvbmZpZykge1xuXHRcdFx0XHRcdHByb3ZpZGVyLmNvbmZpZyA9IHtcblx0XHRcdFx0XHRcdC4uLnByb3ZpZGVyLmNvbmZpZyxcblx0XHRcdFx0XHRcdHZhbHVlczogeyAuLi52YWx1ZXMgfSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJTW9ja0FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVByb3ZpZGVyc0VtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBhZGRlZDogcmVhZG9ubHkgSVNlc3Npb25zUHJvdmlkZXJbXTsgcmVtb3ZlZDogcmVhZG9ubHkgSVNlc3Npb25zUHJvdmlkZXJbXSB9PigpKTtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlID0ge1xuXHRcdFx0Z2V0UHJvdmlkZXI8VCBleHRlbmRzIElTZXNzaW9uc1Byb3ZpZGVyPihwcm92aWRlcklkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKHJlZ2lzdGVyUHJvdmlkZXIgJiYgcHJvdmlkZXJJZCA9PT0gUFJPVklERVJfSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcHJvdmlkZXIgYXMgdW5rbm93biBhcyBUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0UHJvdmlkZXJzOiAoKSA9PiByZWdpc3RlclByb3ZpZGVyID8gW3Byb3ZpZGVyIGFzIHVua25vd24gYXMgSVNlc3Npb25zUHJvdmlkZXJdIDogW10sXG5cdFx0XHRvbkRpZENoYW5nZVByb3ZpZGVyczogb25EaWRDaGFuZ2VQcm92aWRlcnNFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZV0sXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHQpKSk7XG5cblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyYXIgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0U2V0dGluZ3NTY2hlbWFSZWdpc3RyYXIpKTtcblx0XHRjb25zdCBmcyA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXR0aW5nc0ZpbGVTeXN0ZW1Qcm92aWRlciwgc2NoZW1hUmVnaXN0cmFyKSk7XG5cblx0XHRyZXR1cm4geyBmcywgdXJpOiBhZ2VudEhvc3RTZXR0aW5nc1VyaShQUk9WSURFUl9JRCksIHByb3ZpZGVyIH07XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSByZXR1cm5zIHJvb3QgY29uZmlnIHZhbHVlcyBhcyBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSB9ID0gY3JlYXRlSGFybmVzcyh7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBidWYgPSBhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdGNvbnN0IHRleHQgPSBWU0J1ZmZlci53cmFwKGJ1ZikudG9TdHJpbmcoKTtcblx0XHRjb25zdCBqc29uU3RhcnQgPSB0ZXh0LmluZGV4T2YoJ3snKTtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQuc3Vic3RyaW5nKGpzb25TdGFydCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSBmb3J3YXJkcyB0aGUgdXNlclxcJ3MgcGFyc2VkIEpTT04gYXMgdGhlIHJlcGxhY2UgcGF5bG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmksIHByb3ZpZGVyIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddIH0sXG5cdFx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCcvLyB0cmFpbGluZyBjb21tZW50cyBva1xcbnsgXCJhdXRvQXBwcm92ZVwiOiBcImF1dG9BcHByb3ZlXCIsIFwibW9kZVwiOiBcImJcIiwgfVxcbicpLmJ1ZmZlcjtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUodXJpLCBuZXdDb250ZW50LCB7IGNyZWF0ZTogZmFsc2UsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIucmVwbGFjZUNhbGxzLCBbe1xuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBtb2RlOiAnYicgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSB3aXRoIHVua25vd24gcHJvdmlkZXIgaXMgYSBuby1vcCAod3JpdGUgaWdub3JlZCwgY2hhbmdlIGV2ZW50IHN0aWxsIGZpcmVzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3ModW5kZWZpbmVkLCAvKnJlZ2lzdGVyUHJvdmlkZXIqLyB0cnVlKTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZnMub25EaWRDaGFuZ2VGaWxlKGNoYW5nZXMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goYy5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbmV3Q29udGVudCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgXCJhdXRvQXBwcm92ZVwiOiBcImRlZmF1bHRcIiB9XFxuJykuYnVmZmVyO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh1cmksIG5ld0NvbnRlbnQsIHsgY3JlYXRlOiBmYWxzZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZUZpbGUgZmlyZXMgd2hlbiBwcm92aWRlciByb290IGNvbmZpZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZnMsIHVyaSwgcHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV2ZW50czogVVJJW10gPSBbXTtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGxpc3RlbmVycyk7XG5cdFx0bGlzdGVuZXJzLmFkZChmcy5vbkRpZENoYW5nZUZpbGUoY2hhbmdlcyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykge1xuXHRcdFx0XHRldmVudHMucHVzaChjLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBmcy53YXRjaCh1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdGxpc3RlbmVycy5hZGQod2F0Y2gpO1xuXG5cdFx0cHJvdmlkZXIub25EaWRDaGFuZ2VSb290Q29uZmlnRW1pdHRlci5maXJlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIG9uIHVua25vd24gcHJvdmlkZXIgdGhyb3dzIEZpbGVOb3RGb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZzLCB1cmkgfSA9IGNyZWF0ZUhhcm5lc3ModW5kZWZpbmVkLCAvKnJlZ2lzdGVyUHJvdmlkZXIqLyBmYWxzZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2NoZW1hIHJlZ2lzdHJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuXG5cdFx0ZnVuY3Rpb24gZXhwZWN0ZWRTY2hlbWFJZCgpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIGB2c2NvZGU6Ly9zY2hlbWFzL2FnZW50LWhvc3Qtc2V0dGluZ3MvJHtQUk9WSURFUl9JRH0uanNvbmNgO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlYWRGaWxlIGxhemlseSByZWdpc3RlcnMgYSBzY2hlbWEgKyBhc3NvY2lhdGlvbiBmb3IgdGhlIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmcywgdXJpIH0gPSBjcmVhdGVIYXJuZXNzKHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10gfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzY2hlbWFJZCA9IGV4cGVjdGVkU2NoZW1hSWQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYVJlZ2lzdHJ5Lmhhc1NjaGVtYUNvbnRlbnQoc2NoZW1hSWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQXNzb2NpYXRpb25zKClbc2NoZW1hSWRdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hUmVnaXN0cnkuaGFzU2NoZW1hQ29udGVudChzY2hlbWFJZCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzY2hlbWFSZWdpc3RyeS5nZXRTY2hlbWFBc3NvY2lhdGlvbnMoKVtzY2hlbWFJZF0sIFt1cmkudG9TdHJpbmcoKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NoZW1hIGlzIHJlZnJlc2hlZCB3aGVuIG9uRGlkQ2hhbmdlUm9vdENvbmZpZyBmaXJlcyB3aXRoIGEgbmV3IHNjaGVtYSBpZGVudGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZnMsIHVyaSwgcHJvdmlkZXIgfSA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnXSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNjaGVtYUlkID0gZXhwZWN0ZWRTY2hlbWFJZCgpO1xuXG5cdFx0XHRhd2FpdCBmcy5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IHNjaGVtYVJlZ2lzdHJ5LmdldFNjaGVtYUNvbnRyaWJ1dGlvbnMoKS5zY2hlbWFzW3NjaGVtYUlkXTtcblx0XHRcdGFzc2VydC5vayhpbml0aWFsKTtcblxuXHRcdFx0cHJvdmlkZXIuY29uZmlnID0ge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSB9LFxuXHRcdFx0XHRcdFx0bW9kZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdNb2RlJywgZW51bTogWydhJywgJ2InXSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScgfSxcblx0XHRcdH07XG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZVJvb3RDb25maWdFbWl0dGVyLmZpcmUoKTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaGVkID0gc2NoZW1hUmVnaXN0cnkuZ2V0U2NoZW1hQ29udHJpYnV0aW9ucygpLnNjaGVtYXNbc2NoZW1hSWRdO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlZnJlc2hlZCwgaW5pdGlhbCk7XG5cdFx0XHRhc3NlcnQub2socmVmcmVzaGVkLnByb3BlcnRpZXM/LlsnbW9kZSddLCAncmVmcmVzaGVkIHNjaGVtYSBzaG91bGQgaW5jbHVkZSB0aGUgbmV3bHkgYWRkZWQgcHJvcGVydHknKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxzQkFBc0IscUNBQXFDLHdDQUF3QztBQUU1RyxNQUFNLGNBQWM7QUFFcEIsTUFBTSx1Q0FBdUMsTUFBTTtBQUVsRCxRQUFNLFFBQVEsd0NBQXdDO0FBY3RELFdBQVMsY0FDUixlQUNBLG1CQUFtQixNQUNKO0FBQ2YsVUFBTSwrQkFBK0IsTUFBTSxJQUFJLElBQUksUUFBYyxDQUFDO0FBQ2xFLFVBQU0sZUFBMkQsQ0FBQztBQUVsRSxVQUFNLFdBQTJDO0FBQUEsTUFDaEQsSUFBSTtBQUFBLE1BQ0osUUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQSx1QkFBdUIsNkJBQTZCO0FBQUEsTUFDcEQsZUFBZSxNQUFNLFNBQVM7QUFBQSxNQUM5QixtQkFBbUIsT0FBTyxXQUFvQztBQUM3RCxxQkFBYSxL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
