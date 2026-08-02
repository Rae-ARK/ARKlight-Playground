import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY, COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_MODEL_KEY, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY, managedModelValue, normalizeManagedSettings } from "../../common/copilotManagedSettings.js";
import { FileManagedSettingsService } from "../../common/fileManagedSettingsService.js";
import { FileManagedSettingsChannelClient } from "../../common/fileManagedSettingsIpc.js";
suite("normalizeManagedSettings", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flattens scalar leaves to dot-paths", () => {
    const result = normalizeManagedSettings({
      permissions: {
        disableBypassPermissionsMode: "disable"
      }
    });
    assert.deepStrictEqual(result, {
      "permissions.disableBypassPermissionsMode": "disable"
    });
  });
  test("JSON-stringifies structured keys (enabledPlugins)", () => {
    const plugins = { "plugin@marketplace": false };
    const result = normalizeManagedSettings({
      [COPILOT_ENABLED_PLUGINS_KEY]: plugins
    });
    assert.deepStrictEqual(result, {
      [COPILOT_ENABLED_PLUGINS_KEY]: JSON.stringify(plugins)
    });
  });
  test("normalizes customization lockdown controls", () => {
    assert.deepStrictEqual(normalizeManagedSettings({
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: true,
      [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: true,
      [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: false
    }), {
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: true,
      [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: true,
      [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: false
    });
  });
  test("drops a non-boolean strictPluginOnlyCustomization value", () => {
    assert.deepStrictEqual(normalizeManagedSettings({
      [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: ["skills", "unknown"]
    }), {});
  });
  test("normalizes extraKnownMarketplaces from schema format to config dict", () => {
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "a": { source: { source: "github", repo: "github/agent-skills" }, autoUpdate: true },
        "b": { source: { source: "git", url: "https://example.com/repo.git", ref: "v1" }, autoUpdate: false },
        "c": { source: { source: "github", repo: "github/copilot-plugins" } }
      }
    });
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"a":"{\\"source\\":\\"github/agent-skills\\",\\"autoUpdate\\":true}","b":"{\\"source\\":\\"https://example.com/repo.git#v1\\",\\"autoUpdate\\":false}","c":"github/copilot-plugins"}'
    });
  });
  test("ignores non-boolean marketplace autoUpdate with warning", () => {
    const warnings = [];
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "a": { source: { source: "github", repo: "github/agent-skills" }, autoUpdate: "yes" }
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"a":"github/agent-skills"}'
    });
    assert.deepStrictEqual(warnings, ['Ignoring invalid autoUpdate for extraKnownMarketplaces entry "a": expected boolean']);
  });
  test("drops malformed marketplace entries with warning", () => {
    const warnings = [];
    const result = normalizeManagedSettings({
      [COPILOT_EXTRA_MARKETPLACES_KEY]: {
        "good": { source: { source: "github", repo: "a/b" } },
        "bad": {}
      }
    }, (msg) => warnings.push(msg));
    assert.deepStrictEqual(result, {
      [COPILOT_EXTRA_MARKETPLACES_KEY]: '{"good":"a/b"}'
    });
    assert.strictEqual(warnings.length, 1);
  });
  test("handles mixed scalar and structured keys", () => {
    const result = normalizeManagedSettings({
      permissions: { disableBypassPermissionsMode: "disable" },
      strictKnownMarketplaces: ["github/foo"],
      [COPILOT_ENABLED_PLUGINS_KEY]: { "plugin": true }
    });
    assert.deepStrictEqual(result, {
      "permissions.disableBypassPermissionsMode": "disable",
      "strictKnownMarketplaces": '["github/foo"]',
      [COPILOT_ENABLED_PLUGINS_KEY]: '{"plugin":true}'
    });
  });
  test("flattens the model setting nested under permissions", () => {
    const result = normalizeManagedSettings({
      permissions: { model: "auto" }
    });
    assert.deepStrictEqual(result, {
      "permissions.model": "auto"
    });
    assert.strictEqual(COPILOT_MODEL_KEY, "permissions.model");
    assert.strictEqual(managedModelValue()({ managedSettings: result }), "auto");
  });
  test("handles empty object", () => {
    assert.deepStrictEqual(normalizeManagedSettings({}), {});
  });
  test("drops a structured key whose value is not an object", () => {
    const result = normalizeManagedSettings({
      [COPILOT_ENABLED_PLUGINS_KEY]: "already-a-string"
    });
    assert.deepStrictEqual(result, {});
  });
});
suite("FileManagedSettingsService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const managedSettingsFile = URI.file("managed-settings.json").with({ scheme: "vscode-tests" });
  test("reads managed-settings.json on startup", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" },
      strictKnownMarketplaces: ["github/foo"]
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    assert.deepStrictEqual(service.managedSettings, {
      "permissions.disableBypassPermissionsMode": "disable",
      "strictKnownMarketplaces": '["github/foo"]'
    });
  }));
  test("retains raw settings that are absent from the normalized bag", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    const raw = {
      permissions: {
        deny: ["Shell(echo denied *)"],
        ask: ["Shell(echo ask *)"],
        allow: ["Shell(echo *)"]
      }
    };
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify(raw)));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await Event.toPromise(service.onDidChangeRawManagedSettings);
    assert.deepStrictEqual({ raw: service.rawManagedSettings, normalized: service.managedSettings }, {
      raw,
      normalized: {}
    });
  }));
  test("returns empty object when file does not exist", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("fires event when file changes", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" }
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    const changePromise = new Promise((resolve) => {
      const listener = disposables.add(service.onDidChangeManagedSettings(() => {
        listener.dispose();
        resolve();
      }));
    });
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      strictKnownMarketplaces: ["github/foo"]
    })));
    await changePromise;
    assert.deepStrictEqual(service.managedSettings, {
      "strictKnownMarketplaces": '["github/foo"]'
    });
  }));
  test("returns empty object when the file is malformed JSON", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString("{ not: valid json"));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("returns empty object when the file is not a JSON object", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify(["not", "an", "object"])));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(service.managedSettings, {});
  }));
  test("clears managed settings and fires when the file is deleted", () => runWithFakedTimers({}, async () => {
    const logService = new NullLogService();
    const fileService = disposables.add(new FileService(logService));
    const inMemoryProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("vscode-tests", inMemoryProvider));
    await fileService.writeFile(managedSettingsFile, VSBuffer.fromString(JSON.stringify({
      permissions: { disableBypassPermissionsMode: "disable" }
    })));
    const service = disposables.add(new FileManagedSettingsService(managedSettingsFile, fileService, logService));
    await new Promise((resolve) => {
      if (Object.keys(service.managedSettings).length > 0) {
        resolve();
      } else {
        const listener = disposables.add(service.onDidChangeManagedSettings(() => {
          listener.dispose();
          resolve();
        }));
      }
    });
    const changePromise = new Promise((resolve) => {
      const listener = disposables.add(service.onDidChangeManagedSettings(() => {
        listener.dispose();
        resolve();
      }));
    });
    await fileService.del(managedSettingsFile);
    await changePromise;
    assert.deepStrictEqual(service.managedSettings, {});
  }));
});
suite("FileManagedSettingsChannelClient", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps newer event state when the initial snapshot resolves later", async () => {
    const channel = disposables.add(new DeferredManagedSettingsChannel());
    const client = disposables.add(new FileManagedSettingsChannelClient(channel));
    channel.fireRaw({ permissions: { allow: ["Shell(echo *)"] } });
    channel.fire({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" });
    channel.resolveInitialRawSnapshot({ permissions: { deny: ["Shell(echo *)"] } });
    channel.resolveInitialSnapshot({ [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "enable" });
    await Promise.all([channel.initialRawSnapshot, channel.initialSnapshot]);
    assert.deepStrictEqual({ raw: client.rawManagedSettings, normalized: client.managedSettings }, {
      raw: { permissions: { allow: ["Shell(echo *)"] } },
      normalized: { [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: "disable" }
    });
  });
});
class DeferredManagedSettingsChannel extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeRawManagedSettings = this._register(new Emitter());
    this._onDidChangeManagedSettings = this._register(new Emitter());
    this.initialRawSnapshot = new Promise((resolve) => this.resolveInitialRawSnapshotPromise = resolve);
    this.initialSnapshot = new Promise((resolve) => this.resolveInitialSnapshotPromise = resolve);
  }
  call(command) {
    switch (command) {
      case "getRawManagedSettings":
        return this.initialRawSnapshot;
      case "getManagedSettings":
        return this.initialSnapshot;
    }
    throw new Error(`Call not found: ${command}`);
  }
  listen(event) {
    switch (event) {
      case "onDidChangeRawManagedSettings":
        return this._onDidChangeRawManagedSettings.event;
      case "onDidChangeManagedSettings":
        return this._onDidChangeManagedSettings.event;
    }
    throw new Error(`Event not found: ${event}`);
  }
  fireRaw(managedSettings) {
    this._onDidChangeRawManagedSettings.fire(managedSettings);
  }
  fire(managedSettings) {
    this._onDidChangeManagedSettings.fire(managedSettings);
  }
  resolveInitialSnapshot(managedSettings) {
    this.resolveInitialSnapshotPromise(managedSettings);
  }
  resolveInitialRawSnapshot(managedSettings) {
    this.resolveInitialRawSnapshotPromise(managedSettings);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3BvbGljeS90ZXN0L2NvbW1vbi9maWxlTWFuYWdlZFNldHRpbmdzU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VkU2V0dGluZ3NEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0tFWSwgQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZLCBDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZLCBDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVksIENPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWSwgQ09QSUxPVF9NT0RFTF9LRVksIENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fS0VZLCBtYW5hZ2VkTW9kZWxWYWx1ZSwgbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzLCBSYXdNYW5hZ2VkU2V0dGluZ3NEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWxDbGllbnQgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZU1hbmFnZWRTZXR0aW5nc0lwYy5qcyc7XG5cbnN1aXRlKCdub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3MnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmxhdHRlbnMgc2NhbGFyIGxlYXZlcyB0byBkb3QtcGF0aHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdHBlcm1pc3Npb25zOiB7XG5cdFx0XHRcdGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6ICdkaXNhYmxlJ1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdKU09OLXN0cmluZ2lmaWVzIHN0cnVjdHVyZWQga2V5cyAoZW5hYmxlZFBsdWdpbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSB7ICdwbHVnaW5AbWFya2V0cGxhY2UnOiBmYWxzZSB9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRbQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXTogcGx1Z2luc1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRbQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZXTogSlNPTi5zdHJpbmdpZnkocGx1Z2lucylcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBjdXN0b21pemF0aW9uIGxvY2tkb3duIGNvbnRyb2xzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdFtDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0tFWV06IHRydWUsXG5cdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZXTogdHJ1ZSxcblx0XHRcdFtDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9LRVldOiBmYWxzZSxcblx0XHR9KSwge1xuXHRcdFx0W0NPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fS0VZXTogdHJ1ZSxcblx0XHRcdFtDT1BJTE9UX0FMTE9XX01BTkFHRURfTUNQX1NFUlZFUlNfT05MWV9LRVldOiB0cnVlLFxuXHRcdFx0W0NPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0tFWV06IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBhIG5vbi1ib29sZWFuIHN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uIHZhbHVlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdFtDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0tFWV06IFsnc2tpbGxzJywgJ3Vua25vd24nXSxcblx0XHR9KSwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemVzIGV4dHJhS25vd25NYXJrZXRwbGFjZXMgZnJvbSBzY2hlbWEgZm9ybWF0IHRvIGNvbmZpZyBkaWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRbQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZXToge1xuXHRcdFx0XHQnYSc6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdnaXRodWIvYWdlbnQtc2tpbGxzJyB9LCBhdXRvVXBkYXRlOiB0cnVlIH0sXG5cdFx0XHRcdCdiJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0JywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCcsIHJlZjogJ3YxJyB9LCBhdXRvVXBkYXRlOiBmYWxzZSB9LFxuXHRcdFx0XHQnYyc6IHsgc291cmNlOiB7IHNvdXJjZTogJ2dpdGh1YicsIHJlcG86ICdnaXRodWIvY29waWxvdC1wbHVnaW5zJyB9IH0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFtDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldOiAne1wiYVwiOlwie1xcXFxcInNvdXJjZVxcXFxcIjpcXFxcXCJnaXRodWIvYWdlbnQtc2tpbGxzXFxcXFwiLFxcXFxcImF1dG9VcGRhdGVcXFxcXCI6dHJ1ZX1cIixcImJcIjpcIntcXFxcXCJzb3VyY2VcXFxcXCI6XFxcXFwiaHR0cHM6Ly9leGFtcGxlLmNvbS9yZXBvLmdpdCN2MVxcXFxcIixcXFxcXCJhdXRvVXBkYXRlXFxcXFwiOmZhbHNlfVwiLFwiY1wiOlwiZ2l0aHViL2NvcGlsb3QtcGx1Z2luc1wifScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uLWJvb2xlYW4gbWFya2V0cGxhY2UgYXV0b1VwZGF0ZSB3aXRoIHdhcm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdFtDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldOiB7XG5cdFx0XHRcdCdhJzogeyBzb3VyY2U6IHsgc291cmNlOiAnZ2l0aHViJywgcmVwbzogJ2dpdGh1Yi9hZ2VudC1za2lsbHMnIH0sIGF1dG9VcGRhdGU6ICd5ZXMnIH0sXG5cdFx0XHR9XG5cdFx0fSwgbXNnID0+IHdhcm5pbmdzLnB1c2gobXNnKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFtDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVldOiAne1wiYVwiOlwiZ2l0aHViL2FnZW50LXNraWxsc1wifScsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJuaW5ncywgWydJZ25vcmluZyBpbnZhbGlkIGF1dG9VcGRhdGUgZm9yIGV4dHJhS25vd25NYXJrZXRwbGFjZXMgZW50cnkgXCJhXCI6IGV4cGVjdGVkIGJvb2xlYW4nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIG1hbGZvcm1lZCBtYXJrZXRwbGFjZSBlbnRyaWVzIHdpdGggd2FybmluZycsICgpID0+IHtcblx0XHRjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0W0NPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWV06IHtcblx0XHRcdFx0J2dvb2QnOiB7IHNvdXJjZTogeyBzb3VyY2U6ICdnaXRodWInLCByZXBvOiAnYS9iJyB9IH0sXG5cdFx0XHRcdCdiYWQnOiB7fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0XHRcdH1cblx0XHR9LCBtc2cgPT4gd2FybmluZ3MucHVzaChtc2cpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0W0NPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWV06ICd7XCJnb29kXCI6XCJhL2JcIn0nLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXJuaW5ncy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG1peGVkIHNjYWxhciBhbmQgc3RydWN0dXJlZCBrZXlzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1hbmFnZWRTZXR0aW5ncyh7XG5cdFx0XHRwZXJtaXNzaW9uczogeyBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScgfSxcblx0XHRcdHN0cmljdEtub3duTWFya2V0cGxhY2VzOiBbJ2dpdGh1Yi9mb28nXSxcblx0XHRcdFtDT1BJTE9UX0VOQUJMRURfUExVR0lOU19LRVldOiB7ICdwbHVnaW4nOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2Rpc2FibGUnLFxuXHRcdFx0J3N0cmljdEtub3duTWFya2V0cGxhY2VzJzogJ1tcImdpdGh1Yi9mb29cIl0nLFxuXHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06ICd7XCJwbHVnaW5cIjp0cnVlfScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsYXR0ZW5zIHRoZSBtb2RlbCBzZXR0aW5nIG5lc3RlZCB1bmRlciBwZXJtaXNzaW9ucycsICgpID0+IHtcblx0XHQvLyBUaGUgc2VydmVyL2ZpbGUgbWFuYWdlZC1zZXR0aW5ncyBzY2hlbWEgY2FycmllcyBgbW9kZWxgIHVuZGVyIGBwZXJtaXNzaW9uc2Bcblx0XHQvLyAoYWxvbmdzaWRlIGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUpOyBpdCBtdXN0IGZsYXR0ZW4gdG8gYHBlcm1pc3Npb25zLm1vZGVsYCxcblx0XHQvLyB3aGljaCBpcyB0aGUga2V5IHRoZSBDaGF0RGVmYXVsdE1vZGVsIHBvbGljeSB2YWx1ZSBjYWxsYmFjayByZWFkcy5cblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0cGVybWlzc2lvbnM6IHsgbW9kZWw6ICdhdXRvJyB9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdwZXJtaXNzaW9ucy5tb2RlbCc6ICdhdXRvJ1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDT1BJTE9UX01PREVMX0tFWSwgJ3Blcm1pc3Npb25zLm1vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZWRNb2RlbFZhbHVlKCkoeyBtYW5hZ2VkU2V0dGluZ3M6IHJlc3VsdCB9KSwgJ2F1dG8nKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBlbXB0eSBvYmplY3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe30pLCB7fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGEgc3RydWN0dXJlZCBrZXkgd2hvc2UgdmFsdWUgaXMgbm90IGFuIG9iamVjdCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNYW5hZ2VkU2V0dGluZ3Moe1xuXHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06ICdhbHJlYWR5LWEtc3RyaW5nJ1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBtYW5hZ2VkU2V0dGluZ3NGaWxlID0gVVJJLmZpbGUoJ21hbmFnZWQtc2V0dGluZ3MuanNvbicpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtdGVzdHMnIH0pO1xuXG5cdHRlc3QoJ3JlYWRzIG1hbmFnZWQtc2V0dGluZ3MuanNvbiBvbiBzdGFydHVwJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5NZW1vcnlQcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzY29kZS10ZXN0cycsIGluTWVtb3J5UHJvdmlkZXIpKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHBlcm1pc3Npb25zOiB7IGRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGU6ICdkaXNhYmxlJyB9LFxuXHRcdFx0c3RyaWN0S25vd25NYXJrZXRwbGFjZXM6IFsnZ2l0aHViL2ZvbyddXG5cdFx0fSkpKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYXN5bmMgcmVmcmVzaCB0byBjb21wbGV0ZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MoKCkgPT4ge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MsIHtcblx0XHRcdCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2Rpc2FibGUnLFxuXHRcdFx0J3N0cmljdEtub3duTWFya2V0cGxhY2VzJzogJ1tcImdpdGh1Yi9mb29cIl0nXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXRhaW5zIHJhdyBzZXR0aW5ncyB0aGF0IGFyZSBhYnNlbnQgZnJvbSB0aGUgbm9ybWFsaXplZCBiYWcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0Y29uc3QgcmF3ID0ge1xuXHRcdFx0cGVybWlzc2lvbnM6IHtcblx0XHRcdFx0ZGVueTogWydTaGVsbChlY2hvIGRlbmllZCAqKSddLFxuXHRcdFx0XHRhc2s6IFsnU2hlbGwoZWNobyBhc2sgKiknXSxcblx0XHRcdFx0YWxsb3c6IFsnU2hlbGwoZWNobyAqKSddLFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkocmF3KSkpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vbkRpZENoYW5nZVJhd01hbmFnZWRTZXR0aW5ncyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmF3OiBzZXJ2aWNlLnJhd01hbmFnZWRTZXR0aW5ncywgbm9ybWFsaXplZDogc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MgfSwge1xuXHRcdFx0cmF3LFxuXHRcdFx0bm9ybWFsaXplZDoge30sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG9iamVjdCB3aGVuIGZpbGUgZG9lcyBub3QgZXhpc3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdC8vIEdpdmUgdGhlIGFzeW5jIHJlZnJlc2ggYSBjaGFuY2UgdG8gcnVuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzLCB7fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdmaXJlcyBldmVudCB3aGVuIGZpbGUgY2hhbmdlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGluTWVtb3J5UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd2c2NvZGUtdGVzdHMnLCBpbk1lbW9yeVByb3ZpZGVyKSk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUobWFuYWdlZFNldHRpbmdzRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRwZXJtaXNzaW9uczogeyBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScgfVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgaW5pdGlhbCByZWFkXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncygoKSA9PiB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBmaWxlXG5cdFx0Y29uc3QgY2hhbmdlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncygoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c3RyaWN0S25vd25NYXJrZXRwbGFjZXM6IFsnZ2l0aHViL2ZvbyddXG5cdFx0fSkpKTtcblxuXHRcdGF3YWl0IGNoYW5nZVByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UubWFuYWdlZFNldHRpbmdzLCB7XG5cdFx0XHQnc3RyaWN0S25vd25NYXJrZXRwbGFjZXMnOiAnW1wiZ2l0aHViL2Zvb1wiXSdcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgb2JqZWN0IHdoZW4gdGhlIGZpbGUgaXMgbWFsZm9ybWVkIEpTT04nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3sgbm90OiB2YWxpZCBqc29uJykpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc1NlcnZpY2UobWFuYWdlZFNldHRpbmdzRmlsZSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MsIHt9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgb2JqZWN0IHdoZW4gdGhlIGZpbGUgaXMgbm90IGEgSlNPTiBvYmplY3QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBpbk1lbW9yeVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndnNjb2RlLXRlc3RzJywgaW5NZW1vcnlQcm92aWRlcikpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmFnZWRTZXR0aW5nc0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoWydub3QnLCAnYW4nLCAnb2JqZWN0J10pKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLm1hbmFnZWRTZXR0aW5ncywge30pO1xuXHR9KSk7XG5cblx0dGVzdCgnY2xlYXJzIG1hbmFnZWQgc2V0dGluZ3MgYW5kIGZpcmVzIHdoZW4gdGhlIGZpbGUgaXMgZGVsZXRlZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGluTWVtb3J5UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCd2c2NvZGUtdGVzdHMnLCBpbk1lbW9yeVByb3ZpZGVyKSk7XG5cblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUobWFuYWdlZFNldHRpbmdzRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRwZXJtaXNzaW9uczogeyBkaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlOiAnZGlzYWJsZScgfVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlTWFuYWdlZFNldHRpbmdzU2VydmljZShtYW5hZ2VkU2V0dGluZ3NGaWxlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgaW5pdGlhbCByZWFkXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncygoKSA9PiB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhbmdlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1hbmFnZWRTZXR0aW5ncygoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKG1hbmFnZWRTZXR0aW5nc0ZpbGUpO1xuXG5cdFx0YXdhaXQgY2hhbmdlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5tYW5hZ2VkU2V0dGluZ3MsIHt9KTtcblx0fSkpO1xufSk7XG5cbnN1aXRlKCdGaWxlTWFuYWdlZFNldHRpbmdzQ2hhbm5lbENsaWVudCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2tlZXBzIG5ld2VyIGV2ZW50IHN0YXRlIHdoZW4gdGhlIGluaXRpYWwgc25hcHNob3QgcmVzb2x2ZXMgbGF0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGVmZXJyZWRNYW5hZ2VkU2V0dGluZ3NDaGFubmVsKCkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZU1hbmFnZWRTZXR0aW5nc0NoYW5uZWxDbGllbnQoY2hhbm5lbCkpO1xuXG5cdFx0Ly8gQSBjaGFuZ2UgZXZlbnQgYXJyaXZlcyBiZWZvcmUgdGhlIGluaXRpYWwgZ2V0TWFuYWdlZFNldHRpbmdzIGNhbGwgcmVzb2x2ZXM7IHRoZSBsYXRlcixcblx0XHQvLyBzdGFsZSBzbmFwc2hvdCBtdXN0IG5vdCBjbG9iYmVyIHRoZSBuZXdlciBldmVudC1kZWxpdmVyZWQgc3RhdGUuXG5cdFx0Y2hhbm5lbC5maXJlUmF3KHsgcGVybWlzc2lvbnM6IHsgYWxsb3c6IFsnU2hlbGwoZWNobyAqKSddIH0gfSk7XG5cdFx0Y2hhbm5lbC5maXJlKHsgW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiAnZGlzYWJsZScgfSk7XG5cdFx0Y2hhbm5lbC5yZXNvbHZlSW5pdGlhbFJhd1NuYXBzaG90KHsgcGVybWlzc2lvbnM6IHsgZGVueTogWydTaGVsbChlY2hvICopJ10gfSB9KTtcblx0XHRjaGFubmVsLnJlc29sdmVJbml0aWFsU25hcHNob3QoeyBbQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWV06ICdlbmFibGUnIH0pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtjaGFubmVsLmluaXRpYWxSYXdTbmFwc2hvdCwgY2hhbm5lbC5pbml0aWFsU25hcHNob3RdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByYXc6IGNsaWVudC5yYXdNYW5hZ2VkU2V0dGluZ3MsIG5vcm1hbGl6ZWQ6IGNsaWVudC5tYW5hZ2VkU2V0dGluZ3MgfSwge1xuXHRcdFx0cmF3OiB7IHBlcm1pc3Npb25zOiB7IGFsbG93OiBbJ1NoZWxsKGVjaG8gKiknXSB9IH0sXG5cdFx0XHRub3JtYWxpemVkOiB7IFtDT1BJTE9UX0RJU0FCTEVfQllQQVNTX1BFUk1JU1NJT05TX01PREVfS0VZXTogJ2Rpc2FibGUnIH0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIERlZmVycmVkTWFuYWdlZFNldHRpbmdzQ2hhbm5lbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhbm5lbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmF3TWFuYWdlZFNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmF3TWFuYWdlZFNldHRpbmdzRGF0YT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWFuYWdlZFNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TWFuYWdlZFNldHRpbmdzRGF0YT4oKSk7XG5cdHByaXZhdGUgcmVzb2x2ZUluaXRpYWxSYXdTbmFwc2hvdFByb21pc2UhOiAobWFuYWdlZFNldHRpbmdzOiBSYXdNYW5hZ2VkU2V0dGluZ3NEYXRhKSA9PiB2b2lkO1xuXHRyZWFkb25seSBpbml0aWFsUmF3U25hcHNob3QgPSBuZXcgUHJvbWlzZTxSYXdNYW5hZ2VkU2V0dGluZ3NEYXRhPihyZXNvbHZlID0+IHRoaXMucmVzb2x2ZUluaXRpYWxSYXdTbmFwc2hvdFByb21pc2UgPSByZXNvbHZlKTtcblx0cHJpdmF0ZSByZXNvbHZlSW5pdGlhbFNuYXBzaG90UHJvbWlzZSE6IChtYW5hZ2VkU2V0dGluZ3M6IE1hbmFnZWRTZXR0aW5nc0RhdGEpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IGluaXRpYWxTbmFwc2hvdCA9IG5ldyBQcm9taXNlPE1hbmFnZWRTZXR0aW5nc0RhdGE+KHJlc29sdmUgPT4gdGhpcy5yZXNvbHZlSW5pdGlhbFNuYXBzaG90UHJvbWlzZSA9IHJlc29sdmUpO1xuXG5cdGNhbGw8VD4oY29tbWFuZDogc3RyaW5nKTogUHJvbWlzZTxUPiB7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICdnZXRSYXdNYW5hZ2VkU2V0dGluZ3MnOiByZXR1cm4gdGhpcy5pbml0aWFsUmF3U25hcHNob3QgYXMgUHJvbWlzZTxUPjtcblx0XHRcdGNhc2UgJ2dldE1hbmFnZWRTZXR0aW5ncyc6IHJldHVybiB0aGlzLmluaXRpYWxTbmFwc2hvdCBhcyBQcm9taXNlPFQ+O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgQ2FsbCBub3QgZm91bmQ6ICR7Y29tbWFuZH1gKTtcblx0fVxuXG5cdGxpc3RlbjxUPihldmVudDogc3RyaW5nKTogRXZlbnQ8VD4ge1xuXHRcdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRcdGNhc2UgJ29uRGlkQ2hhbmdlUmF3TWFuYWdlZFNldHRpbmdzJzogcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlUmF3TWFuYWdlZFNldHRpbmdzLmV2ZW50IGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSAnb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MnOiByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MuZXZlbnQgYXMgRXZlbnQ8VD47XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBFdmVudCBub3QgZm91bmQ6ICR7ZXZlbnR9YCk7XG5cdH1cblxuXHRmaXJlUmF3KG1hbmFnZWRTZXR0aW5nczogUmF3TWFuYWdlZFNldHRpbmdzRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmF3TWFuYWdlZFNldHRpbmdzLmZpcmUobWFuYWdlZFNldHRpbmdzKTtcblx0fVxuXG5cdGZpcmUobWFuYWdlZFNldHRpbmdzOiBNYW5hZ2VkU2V0dGluZ3NEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNYW5hZ2VkU2V0dGluZ3MuZmlyZShtYW5hZ2VkU2V0dGluZ3MpO1xuXHR9XG5cblx0cmVzb2x2ZUluaXRpYWxTbmFwc2hvdChtYW5hZ2VkU2V0dGluZ3M6IE1hbmFnZWRTZXR0aW5nc0RhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlc29sdmVJbml0aWFsU25hcHNob3RQcm9taXNlKG1hbmFnZWRTZXR0aW5ncyk7XG5cdH1cblxuXHRyZXNvbHZlSW5pdGlhbFJhd1NuYXBzaG90KG1hbmFnZWRTZXR0aW5nczogUmF3TWFuYWdlZFNldHRpbmdzRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVzb2x2ZUluaXRpYWxSYXdTbmFwc2hvdFByb21pc2UobWFuYWdlZFNldHRpbmdzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUczQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNDQUFzQyw0Q0FBNEMsNkNBQTZDLDZCQUE2QixnQ0FBZ0MsbUJBQW1CLDhDQUE4QyxtQkFBbUIsZ0NBQXdEO0FBQ2pWLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0NBQXdDO0FBRWpELE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsMENBQXdDO0FBRXhDLE9BQUssdUNBQXVDLE1BQU07QUFDakQsVUFBTSxT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
