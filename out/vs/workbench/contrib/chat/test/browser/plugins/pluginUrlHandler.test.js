import assert from "assert";
import { encodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IURLService } from "../../../../../../platform/url/common/url.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../../services/host/browser/host.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { PluginUrlHandler } from "../../../browser/pluginUrlHandler.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { IPluginInstallService } from "../../../common/plugins/pluginInstallService.js";
import { MarketplaceReferenceKind, MarketplaceType, PluginSourceKind } from "../../../common/plugins/pluginMarketplaceService.js";
function toBase64(value) {
  return encodeBase64(VSBuffer.fromString(value));
}
suite("PluginUrlHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHandler(stateOverrides) {
    const state = {
      dialogConfirmResult: true,
      installedSources: [],
      configUpdates: [],
      openedEditorInputs: [],
      openSearchQueries: [],
      installFromSourceResult: { success: true },
      notifications: [],
      ...stateOverrides
    };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IURLService, {
      registerHandler: () => ({ dispose() {
      } })
    });
    instantiationService.stub(IPluginInstallService, {
      installPluginFromSource: async (source, _options) => {
        state.installedSources.push(source);
        return state.installFromSourceResult;
      }
    });
    instantiationService.stub(IDialogService, {
      confirm: async () => ({ confirmed: state.dialogConfirmResult })
    });
    const configService = new TestConfigurationService({
      [ChatConfiguration.PluginMarketplaces]: ["existing/marketplace"]
    });
    const origUpdate = configService.updateValue.bind(configService);
    configService.updateValue = async (key, value, target) => {
      state.configUpdates.push({ key, value, target: target ?? ConfigurationTarget.USER });
      return origUpdate(key, value);
    };
    instantiationService.stub(IConfigurationService, configService);
    instantiationService.stub(IHostService, {
      focus: async () => {
      }
    });
    instantiationService.stub(IExtensionsWorkbenchService, {
      openSearch: (query) => {
        state.openSearchQueries.push(query);
      }
    });
    instantiationService.stub(IEditorService, {
      openEditor: async (input) => {
        state.openedEditorInputs.push(input);
        store.add(input);
        return void 0;
      }
    });
    instantiationService.stub(IInstantiationService, instantiationService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(INotificationService, {
      notify: (notification) => {
        state.notifications.push({ severity: notification.severity, message: notification.message });
        return void 0;
      }
    });
    const handler = store.add(instantiationService.createInstance(PluginUrlHandler));
    return { handler, state };
  }
  function uri(path, query) {
    return URI.from({ scheme: "vscode", authority: "chat-plugin", path, query });
  }
  test("ignores unrelated authority", async () => {
    const { handler } = createHandler();
    assert.strictEqual(await handler.handleURL(URI.parse("vscode://other/install?source=foo/bar")), false);
  });
  test("ignores unknown path", async () => {
    const { handler } = createHandler();
    assert.strictEqual(await handler.handleURL(uri("/unknown", "source=foo/bar")), false);
  });
  test("install with plain-text owner/repo source", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", "source=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["anthropics/claude-code"]);
  });
  test("install with base64-encoded source", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("anthropics/claude-code");
    const result = await handler.handleURL(uri("/install", `source=${encoded}`));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["anthropics/claude-code"]);
  });
  test("install does nothing when dialog is declined", async () => {
    const { handler, state } = createHandler({ dialogConfirmResult: false });
    const result = await handler.handleURL(uri("/install", "source=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install handles missing source param", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", ""));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install handles invalid source", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/install", "source=not-a-valid-ref"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("install rejects local file URI sources", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("file:///home/user/my-plugin");
    const result = await handler.handleURL(uri("/install", `source=${encodeURIComponent(encoded)}`));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
  });
  test("add-marketplace with plain-text ref", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 1);
    assert.deepStrictEqual(state.configUpdates[0].value, ["existing/marketplace", "anthropics/claude-code"]);
  });
  test("add-marketplace with base64-encoded ref", async () => {
    const { handler, state } = createHandler();
    const encoded = toBase64("anthropics/claude-code");
    const result = await handler.handleURL(uri("/add-marketplace", `ref=${encoded}`));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 1);
    assert.deepStrictEqual(state.configUpdates[0].value, ["existing/marketplace", "anthropics/claude-code"]);
  });
  test("add-marketplace does not duplicate existing entry", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=existing/marketplace"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace deduplicates by canonical ID", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=existing%2Fmarketplace"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace does nothing when dialog is declined", async () => {
    const { handler, state } = createHandler({ dialogConfirmResult: false });
    const result = await handler.handleURL(uri("/add-marketplace", "ref=anthropics/claude-code"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace handles missing ref param", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", ""));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  test("add-marketplace handles invalid ref", async () => {
    const { handler, state } = createHandler();
    const result = await handler.handleURL(uri("/add-marketplace", "ref=not-valid"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.configUpdates.length, 0);
  });
  function makeMarketplacePlugin(name, marketplace) {
    const [owner, repo] = marketplace.split("/");
    const ref = {
      kind: MarketplaceReferenceKind.GitHubShorthand,
      rawValue: marketplace,
      displayLabel: marketplace,
      canonicalId: `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
      cloneUrl: `https://github.com/${marketplace}.git`,
      githubRepo: marketplace,
      cacheSegments: ["github.com", owner, repo]
    };
    return {
      name,
      description: `${name} description`,
      version: "1.0.0",
      source: name,
      sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: name },
      marketplace,
      marketplaceReference: ref,
      marketplaceType: MarketplaceType.OpenPlugin
    };
  }
  test("install with plugin param targets the plugin and opens editor", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, ["acme/plugins"]);
    assert.strictEqual(state.openedEditorInputs.length, 1);
    assert.strictEqual(state.openedEditorInputs[0].item.name, "my-plugin");
  });
  test("install with plugin param does nothing when dialog is declined", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      dialogConfirmResult: false,
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.deepStrictEqual(state.installedSources, []);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 0);
  });
  test("install with base64-encoded plugin param opens editor", async () => {
    const plugin = makeMarketplacePlugin("my-plugin", "acme/plugins");
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true, matchedPlugin: plugin }
    });
    const encodedPlugin = toBase64("my-plugin");
    const result = await handler.handleURL(uri("/install", `source=acme/plugins&plugin=${encodedPlugin}`));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 1);
    assert.strictEqual(state.openedEditorInputs[0].item.name, "my-plugin");
  });
  test("install with plugin param falls back to search on failure", async () => {
    const { handler, state } = createHandler({
      installFromSourceResult: { success: false, message: "Plugin not found" }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=nonexistent"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 1);
    assert.ok(state.openSearchQueries[0].includes("acme/plugins"));
  });
  test("install with plugin param falls back to search when no matchedPlugin", async () => {
    const { handler, state } = createHandler({
      installFromSourceResult: { success: true }
    });
    const result = await handler.handleURL(uri("/install", "source=acme/plugins&plugin=my-plugin"));
    assert.strictEqual(result, true);
    assert.strictEqual(state.openedEditorInputs.length, 0);
    assert.strictEqual(state.openSearchQueries.length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3BsdWdpbnMvcGx1Z2luVXJsSGFuZGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50UGx1Z2luRWRpdG9yL2FnZW50UGx1Z2luRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgUGx1Z2luVXJsSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGx1Z2luVXJsSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlT3B0aW9ucywgSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0LCBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZCwgTWFya2V0cGxhY2VUeXBlLCBQbHVnaW5Tb3VyY2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gdG9CYXNlNjQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSkpO1xufVxuXG5zdWl0ZSgnUGx1Z2luVXJsSGFuZGxlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRpbnRlcmZhY2UgTW9ja1N0YXRlIHtcblx0XHRkaWFsb2dDb25maXJtUmVzdWx0OiBib29sZWFuO1xuXHRcdGluc3RhbGxlZFNvdXJjZXM6IHN0cmluZ1tdO1xuXHRcdGNvbmZpZ1VwZGF0ZXM6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiB1bmtub3duOyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQgfVtdO1xuXHRcdG9wZW5lZEVkaXRvcklucHV0czogQWdlbnRQbHVnaW5FZGl0b3JJbnB1dFtdO1xuXHRcdG9wZW5TZWFyY2hRdWVyaWVzOiBzdHJpbmdbXTtcblx0XHRpbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDogSUluc3RhbGxQbHVnaW5Gcm9tU291cmNlUmVzdWx0O1xuXHRcdG5vdGlmaWNhdGlvbnM6IHsgc2V2ZXJpdHk6IG51bWJlcjsgbWVzc2FnZTogc3RyaW5nIH1bXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhbmRsZXIoc3RhdGVPdmVycmlkZXM/OiBQYXJ0aWFsPE1vY2tTdGF0ZT4pOiB7IGhhbmRsZXI6IFBsdWdpblVybEhhbmRsZXI7IHN0YXRlOiBNb2NrU3RhdGUgfSB7XG5cdFx0Y29uc3Qgc3RhdGU6IE1vY2tTdGF0ZSA9IHtcblx0XHRcdGRpYWxvZ0NvbmZpcm1SZXN1bHQ6IHRydWUsXG5cdFx0XHRpbnN0YWxsZWRTb3VyY2VzOiBbXSxcblx0XHRcdGNvbmZpZ1VwZGF0ZXM6IFtdLFxuXHRcdFx0b3BlbmVkRWRpdG9ySW5wdXRzOiBbXSxcblx0XHRcdG9wZW5TZWFyY2hRdWVyaWVzOiBbXSxcblx0XHRcdGluc3RhbGxGcm9tU291cmNlUmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUgfSxcblx0XHRcdG5vdGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0Li4uc3RhdGVPdmVycmlkZXMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVUkxTZXJ2aWNlLCB7XG5cdFx0XHRyZWdpc3RlckhhbmRsZXI6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElVUkxTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCB7XG5cdFx0XHRpbnN0YWxsUGx1Z2luRnJvbVNvdXJjZTogYXN5bmMgKHNvdXJjZTogc3RyaW5nLCBfb3B0aW9ucz86IElJbnN0YWxsUGx1Z2luRnJvbVNvdXJjZU9wdGlvbnMpID0+IHtcblx0XHRcdFx0c3RhdGUuaW5zdGFsbGVkU291cmNlcy5wdXNoKHNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5pbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElQbHVnaW5JbnN0YWxsU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7XG5cdFx0XHRjb25maXJtOiBhc3luYyAoKSA9PiAoeyBjb25maXJtZWQ6IHN0YXRlLmRpYWxvZ0NvbmZpcm1SZXN1bHQgfSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElEaWFsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5NYXJrZXRwbGFjZXNdOiBbJ2V4aXN0aW5nL21hcmtldHBsYWNlJ10sXG5cdFx0fSk7XG5cdFx0Ly8gVHJhY2sgdXBkYXRlVmFsdWUgY2FsbHNcblx0XHRjb25zdCBvcmlnVXBkYXRlID0gY29uZmlnU2VydmljZS51cGRhdGVWYWx1ZS5iaW5kKGNvbmZpZ1NlcnZpY2UpO1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUgPSBhc3luYyAoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KSA9PiB7XG5cdFx0XHRzdGF0ZS5jb25maWdVcGRhdGVzLnB1c2goeyBrZXksIHZhbHVlLCB0YXJnZXQ6IHRhcmdldCA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgfSk7XG5cdFx0XHRyZXR1cm4gb3JpZ1VwZGF0ZShrZXksIHZhbHVlKTtcblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvc3RTZXJ2aWNlLCB7XG5cdFx0XHRmb2N1czogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJSG9zdFNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHtcblx0XHRcdG9wZW5TZWFyY2g6IChxdWVyeTogc3RyaW5nKSA9PiB7IHN0YXRlLm9wZW5TZWFyY2hRdWVyaWVzLnB1c2gocXVlcnkpOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwge1xuXHRcdFx0b3BlbkVkaXRvcjogYXN5bmMgKGlucHV0OiBBZ2VudFBsdWdpbkVkaXRvcklucHV0KSA9PiB7XG5cdFx0XHRcdHN0YXRlLm9wZW5lZEVkaXRvcklucHV0cy5wdXNoKGlucHV0KTtcblx0XHRcdFx0c3RvcmUuYWRkKGlucHV0KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdC8vIElJbnN0YW50aWF0aW9uU2VydmljZTogZGVsZWdhdGUgY3JlYXRlSW5zdGFuY2UgdG8gdGhlIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSBpdHNlbGZcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0bm90aWZ5OiAobm90aWZpY2F0aW9uOiB7IHNldmVyaXR5OiBudW1iZXI7IG1lc3NhZ2U6IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdHN0YXRlLm5vdGlmaWNhdGlvbnMucHVzaCh7IHNldmVyaXR5OiBub3RpZmljYXRpb24uc2V2ZXJpdHksIG1lc3NhZ2U6IG5vdGlmaWNhdGlvbi5tZXNzYWdlIH0pO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5VcmxIYW5kbGVyKSk7XG5cdFx0cmV0dXJuIHsgaGFuZGxlciwgc3RhdGUgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHVyaShwYXRoOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZScsIGF1dGhvcml0eTogJ2NoYXQtcGx1Z2luJywgcGF0aCwgcXVlcnkgfSk7XG5cdH1cblxuXHQvLyAtLS0gcm91dGluZyAtLS1cblxuXHR0ZXN0KCdpZ25vcmVzIHVucmVsYXRlZCBhdXRob3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKFVSSS5wYXJzZSgndnNjb2RlOi8vb3RoZXIvaW5zdGFsbD9zb3VyY2U9Zm9vL2JhcicpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHVua25vd24gcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvdW5rbm93bicsICdzb3VyY2U9Zm9vL2JhcicpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLS0gaW5zdGFsbDogcGxhaW4gdGV4dCAtLS1cblxuXHR0ZXN0KCdpbnN0YWxsIHdpdGggcGxhaW4tdGV4dCBvd25lci9yZXBvIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsICdzb3VyY2U9YW50aHJvcGljcy9jbGF1ZGUtY29kZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFsnYW50aHJvcGljcy9jbGF1ZGUtY29kZSddKTtcblx0fSk7XG5cblx0Ly8gLS0tIGluc3RhbGw6IGJhc2U2NCAtLS1cblxuXHR0ZXN0KCdpbnN0YWxsIHdpdGggYmFzZTY0LWVuY29kZWQgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCBlbmNvZGVkID0gdG9CYXNlNjQoJ2FudGhyb3BpY3MvY2xhdWRlLWNvZGUnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgYHNvdXJjZT0ke2VuY29kZWR9YCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgWydhbnRocm9waWNzL2NsYXVkZS1jb2RlJ10pO1xuXHR9KTtcblxuXHQvLyAtLS0gaW5zdGFsbDogZGlhbG9nIGRlY2xpbmVkIC0tLVxuXG5cdHRlc3QoJ2luc3RhbGwgZG9lcyBub3RoaW5nIHdoZW4gZGlhbG9nIGlzIGRlY2xpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoeyBkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJ3NvdXJjZT1hbnRocm9waWNzL2NsYXVkZS1jb2RlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgW10pO1xuXHR9KTtcblxuXHQvLyAtLS0gaW5zdGFsbDogbWlzc2luZy9pbnZhbGlkIHNvdXJjZSAtLS1cblxuXHR0ZXN0KCdpbnN0YWxsIGhhbmRsZXMgbWlzc2luZyBzb3VyY2UgcGFyYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnN0YWxsIGhhbmRsZXMgaW52YWxpZCBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnc291cmNlPW5vdC1hLXZhbGlkLXJlZicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmluc3RhbGxlZFNvdXJjZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCByZWplY3RzIGxvY2FsIGZpbGUgVVJJIHNvdXJjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IGVuY29kZWQgPSB0b0Jhc2U2NCgnZmlsZTovLy9ob21lL3VzZXIvbXktcGx1Z2luJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsIGBzb3VyY2U9JHtlbmNvZGVVUklDb21wb25lbnQoZW5jb2RlZCl9YCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgW10pO1xuXHR9KTtcblxuXHQvLyAtLS0gYWRkLW1hcmtldHBsYWNlOiBwbGFpbiB0ZXh0IC0tLVxuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSB3aXRoIHBsYWluLXRleHQgcmVmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9hZGQtbWFya2V0cGxhY2UnLCAncmVmPWFudGhyb3BpY3MvY2xhdWRlLWNvZGUnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNvbmZpZ1VwZGF0ZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmNvbmZpZ1VwZGF0ZXNbMF0udmFsdWUsIFsnZXhpc3RpbmcvbWFya2V0cGxhY2UnLCAnYW50aHJvcGljcy9jbGF1ZGUtY29kZSddKTtcblx0fSk7XG5cblx0Ly8gLS0tIGFkZC1tYXJrZXRwbGFjZTogYmFzZTY0IC0tLVxuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSB3aXRoIGJhc2U2NC1lbmNvZGVkIHJlZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKCk7XG5cdFx0Y29uc3QgZW5jb2RlZCA9IHRvQmFzZTY0KCdhbnRocm9waWNzL2NsYXVkZS1jb2RlJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvYWRkLW1hcmtldHBsYWNlJywgYHJlZj0ke2VuY29kZWR9YCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzWzBdLnZhbHVlLCBbJ2V4aXN0aW5nL21hcmtldHBsYWNlJywgJ2FudGhyb3BpY3MvY2xhdWRlLWNvZGUnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBhZGQtbWFya2V0cGxhY2U6IGRlZHVwIC0tLVxuXG5cdHRlc3QoJ2FkZC1tYXJrZXRwbGFjZSBkb2VzIG5vdCBkdXBsaWNhdGUgZXhpc3RpbmcgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsICdyZWY9ZXhpc3RpbmcvbWFya2V0cGxhY2UnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNvbmZpZ1VwZGF0ZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkLW1hcmtldHBsYWNlIGRlZHVwbGljYXRlcyBieSBjYW5vbmljYWwgSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdC8vIFRoZSBVUkwgZm9ybSBvZiB0aGUgc2FtZSBHaXRIdWIgc2hvcnRoYW5kIHNob3VsZCBtYXRjaCBjYW5vbmljYWxseVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsICdyZWY9ZXhpc3RpbmclMkZtYXJrZXRwbGFjZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY29uZmlnVXBkYXRlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0gYWRkLW1hcmtldHBsYWNlOiBkaWFsb2cgZGVjbGluZWQgLS0tXG5cblx0dGVzdCgnYWRkLW1hcmtldHBsYWNlIGRvZXMgbm90aGluZyB3aGVuIGRpYWxvZyBpcyBkZWNsaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKHsgZGlhbG9nQ29uZmlybVJlc3VsdDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvYWRkLW1hcmtldHBsYWNlJywgJ3JlZj1hbnRocm9waWNzL2NsYXVkZS1jb2RlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBhZGQtbWFya2V0cGxhY2U6IG1pc3NpbmcvaW52YWxpZCByZWYgLS0tXG5cblx0dGVzdCgnYWRkLW1hcmtldHBsYWNlIGhhbmRsZXMgbWlzc2luZyByZWYgcGFyYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsICcnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNvbmZpZ1VwZGF0ZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkLW1hcmtldHBsYWNlIGhhbmRsZXMgaW52YWxpZCByZWYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2FkZC1tYXJrZXRwbGFjZScsICdyZWY9bm90LXZhbGlkJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jb25maWdVcGRhdGVzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbnN0YWxsIHdpdGggcGx1Z2luIHRhcmdldGluZyAtLS1cblxuXHRmdW5jdGlvbiBtYWtlTWFya2V0cGxhY2VQbHVnaW4obmFtZTogc3RyaW5nLCBtYXJrZXRwbGFjZTogc3RyaW5nKTogSU1hcmtldHBsYWNlUGx1Z2luIHtcblx0XHRjb25zdCBbb3duZXIsIHJlcG9dID0gbWFya2V0cGxhY2Uuc3BsaXQoJy8nKTtcblx0XHRjb25zdCByZWYgPSB7XG5cdFx0XHRraW5kOiBNYXJrZXRwbGFjZVJlZmVyZW5jZUtpbmQuR2l0SHViU2hvcnRoYW5kIGFzIGNvbnN0LFxuXHRcdFx0cmF3VmFsdWU6IG1hcmtldHBsYWNlLFxuXHRcdFx0ZGlzcGxheUxhYmVsOiBtYXJrZXRwbGFjZSxcblx0XHRcdGNhbm9uaWNhbElkOiBgZ2l0aHViOiR7b3duZXIudG9Mb3dlckNhc2UoKX0vJHtyZXBvLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdGNsb25lVXJsOiBgaHR0cHM6Ly9naXRodWIuY29tLyR7bWFya2V0cGxhY2V9LmdpdGAsXG5cdFx0XHRnaXRodWJSZXBvOiBtYXJrZXRwbGFjZSxcblx0XHRcdGNhY2hlU2VnbWVudHM6IFsnZ2l0aHViLmNvbScsIG93bmVyLCByZXBvXSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGAke25hbWV9IGRlc2NyaXB0aW9uYCxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRzb3VyY2U6IG5hbWUsXG5cdFx0XHRzb3VyY2VEZXNjcmlwdG9yOiB7IGtpbmQ6IFBsdWdpblNvdXJjZUtpbmQuUmVsYXRpdmVQYXRoLCBwYXRoOiBuYW1lIH0sXG5cdFx0XHRtYXJrZXRwbGFjZSxcblx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiByZWYsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5PcGVuUGx1Z2luLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdpbnN0YWxsIHdpdGggcGx1Z2luIHBhcmFtIHRhcmdldHMgdGhlIHBsdWdpbiBhbmQgb3BlbnMgZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbiA9IG1ha2VNYXJrZXRwbGFjZVBsdWdpbignbXktcGx1Z2luJywgJ2FjbWUvcGx1Z2lucycpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoe1xuXHRcdFx0aW5zdGFsbEZyb21Tb3VyY2VSZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgbWF0Y2hlZFBsdWdpbjogcGx1Z2luIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5oYW5kbGVVUkwodXJpKCcvaW5zdGFsbCcsICdzb3VyY2U9YWNtZS9wbHVnaW5zJnBsdWdpbj1teS1wbHVnaW4nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS5pbnN0YWxsZWRTb3VyY2VzLCBbJ2FjbWUvcGx1Z2lucyddKTtcblx0XHQvLyBQbHVnaW4gZWRpdG9yIHdhcyBvcGVuZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlbmVkRWRpdG9ySW5wdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0c1swXS5pdGVtLm5hbWUsICdteS1wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIHBsdWdpbiBwYXJhbSBkb2VzIG5vdGhpbmcgd2hlbiBkaWFsb2cgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZU1hcmtldHBsYWNlUGx1Z2luKCdteS1wbHVnaW4nLCAnYWNtZS9wbHVnaW5zJyk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcih7XG5cdFx0XHRkaWFsb2dDb25maXJtUmVzdWx0OiBmYWxzZSxcblx0XHRcdGluc3RhbGxGcm9tU291cmNlUmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIG1hdGNoZWRQbHVnaW46IHBsdWdpbiB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnc291cmNlPWFjbWUvcGx1Z2lucyZwbHVnaW49bXktcGx1Z2luJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuaW5zdGFsbGVkU291cmNlcywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuZWRFZGl0b3JJbnB1dHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlblNlYXJjaFF1ZXJpZXMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIGJhc2U2NC1lbmNvZGVkIHBsdWdpbiBwYXJhbSBvcGVucyBlZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGx1Z2luID0gbWFrZU1hcmtldHBsYWNlUGx1Z2luKCdteS1wbHVnaW4nLCAnYWNtZS9wbHVnaW5zJyk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzdGF0ZSB9ID0gY3JlYXRlSGFuZGxlcih7XG5cdFx0XHRpbnN0YWxsRnJvbVNvdXJjZVJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBtYXRjaGVkUGx1Z2luOiBwbHVnaW4gfSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmNvZGVkUGx1Z2luID0gdG9CYXNlNjQoJ215LXBsdWdpbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCBgc291cmNlPWFjbWUvcGx1Z2lucyZwbHVnaW49JHtlbmNvZGVkUGx1Z2lufWApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlbmVkRWRpdG9ySW5wdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0c1swXS5pdGVtLm5hbWUsICdteS1wbHVnaW4nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbCB3aXRoIHBsdWdpbiBwYXJhbSBmYWxscyBiYWNrIHRvIHNlYXJjaCBvbiBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc3RhdGUgfSA9IGNyZWF0ZUhhbmRsZXIoe1xuXHRcdFx0aW5zdGFsbEZyb21Tb3VyY2VSZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UsIG1lc3NhZ2U6ICdQbHVnaW4gbm90IGZvdW5kJyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlVVJMKHVyaSgnL2luc3RhbGwnLCAnc291cmNlPWFjbWUvcGx1Z2lucyZwbHVnaW49bm9uZXhpc3RlbnQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5lZEVkaXRvcklucHV0cy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVuU2VhcmNoUXVlcmllcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhzdGF0ZS5vcGVuU2VhcmNoUXVlcmllc1swXS5pbmNsdWRlcygnYWNtZS9wbHVnaW5zJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnN0YWxsIHdpdGggcGx1Z2luIHBhcmFtIGZhbGxzIGJhY2sgdG8gc2VhcmNoIHdoZW4gbm8gbWF0Y2hlZFBsdWdpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHN0YXRlIH0gPSBjcmVhdGVIYW5kbGVyKHtcblx0XHRcdGluc3RhbGxGcm9tU291cmNlUmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUgfSxcblx0XHR9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmkoJy9pbnN0YWxsJywgJ3NvdXJjZT1hY21lL3BsdWdpbnMmcGx1Z2luPW15LXBsdWdpbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlbmVkRWRpdG9ySW5wdXRzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZW5TZWFyY2hRdWVyaWVzLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBMEUsNkJBQTZCO0FBQ3ZHLFNBQTZCLDBCQUEwQixpQkFBaUIsd0JBQXdCO0FBRWhHLFNBQVMsU0FBUyxPQUF1QjtBQUN4QyxTQUFPLGFBQWEsU0FBUyxXQUFXLEtBQUssQ0FBQztBQUMvQztBQUVBLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsUUFBTSxRQUFRLHdDQUF3QztBQVl0RCxXQUFTLGNBQWMsZ0JBQXNGO0FBQzVHLFVBQU0sUUFBbUI7QUFBQSxNQUN4QixxQkFBcUI7QUFBQSxNQUNyQixrQkFBa0IsQ0FBQztBQUFBLE1BQ25CLGVBQWUsQ0FBQztBQUFBLE1BQ2hCLG9CQUFvQixDQUFDO0FBQUEsTUFDckIsbUJBQW1CLENBQUM7QUFBQSxNQUNwQix5QkFBeUIsRUFBRSxTQUFTLEtBQUs7QUFBQSxNQUN6QyxlQUFlLENBQUM7QUFBQSxNQUNoQixHQUFHO0FBQUEsSUFDSjtBQUVBLFVBQU0sdUJBQXVCLE1BQU0sSUFB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
