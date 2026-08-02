import assert from "assert";
import { mock } from "../../../../base/test/common/mock.js";
import { ExtHostBrowsers } from "../../common/extHostBrowsers.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostBrowsers", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const defaultDto = {
    id: "browser-1",
    url: "https://example.com",
    title: "Example",
    favicon: void 0
  };
  function createDto(overrides) {
    return { ...defaultDto, ...overrides };
  }
  function createExtHostBrowsers(overrides) {
    const proxy = new class extends mock() {
      $openBrowserTab() {
        return Promise.resolve(createDto());
      }
      $startCDPSession() {
        return Promise.resolve();
      }
      $closeCDPSession() {
        return Promise.resolve();
      }
      $sendCDPMessage() {
        return Promise.resolve();
      }
      $closeBrowserTab() {
        return Promise.resolve();
      }
    }();
    if (overrides) {
      Object.assign(proxy, overrides);
    }
    return store.add(new ExtHostBrowsers(SingleProxyRPCProtocol(proxy)));
  }
  test("browserTabs populates from $onDidOpenBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://one.com", title: "One" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2", url: "https://two.com", title: "Two" }));
    const tabs = extHost.browserTabs;
    assert.strictEqual(tabs.length, 2);
    assert.strictEqual(tabs[0].url, "https://one.com");
    assert.strictEqual(tabs[1].url, "https://two.com");
  });
  test("browserTabs returns a snapshot, not a live array", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const snapshot1 = extHost.browserTabs;
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2" }));
    const snapshot2 = extHost.browserTabs;
    assert.notStrictEqual(snapshot1, snapshot2);
    assert.strictEqual(snapshot1.length, 1);
    assert.strictEqual(snapshot2.length, 2);
  });
  test("activeBrowserTab updates via $onDidChangeActiveBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1", url: "https://active.com" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.strictEqual(extHost.activeBrowserTab?.url, "https://active.com");
  });
  test("activeBrowserTab becomes undefined when cleared", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.ok(extHost.activeBrowserTab);
    extHost.$onDidChangeActiveBrowserTab(void 0);
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
  test("$onDidChangeActiveBrowserTab with unknown tab returns undefined", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidChangeActiveBrowserTab("non-existent");
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
  test("openBrowserTab returns a BrowserTab with correct properties", async () => {
    const dto = createDto({ id: "opened", url: "https://opened.com", title: "Opened" });
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(dto)
    });
    const tab = await extHost.openBrowserTab("https://opened.com");
    assert.strictEqual(tab.url, "https://opened.com");
    assert.strictEqual(tab.title, "Opened");
  });
  test("openBrowserTab fires onDidOpenBrowserTab for new tabs", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "new-tab" }))
    });
    const opened = [];
    store.add(extHost.onDidOpenBrowserTab((tab) => opened.push(tab)));
    await extHost.openBrowserTab("https://example.com");
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].url, "https://example.com");
  });
  test("openBrowserTab reuses existing tab when IDs match", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "same", url: "https://updated.com" }))
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "same", url: "https://original.com" }));
    const tab = await extHost.openBrowserTab("https://updated.com");
    assert.strictEqual(extHost.browserTabs.length, 1);
    assert.strictEqual(tab.url, "https://updated.com");
  });
  test("openBrowserTab forwards options to proxy", async () => {
    let capturedViewColumn;
    let capturedOptions;
    const extHost = createExtHostBrowsers({
      $openBrowserTab: (_url, viewColumn, options) => {
        capturedViewColumn = viewColumn;
        capturedOptions = options;
        return Promise.resolve(createDto({ id: "opts" }));
      }
    });
    await extHost.openBrowserTab("https://example.com", { viewColumn: 2, preserveFocus: true, background: true });
    assert.strictEqual(capturedViewColumn, 1);
    assert.strictEqual(capturedOptions?.preserveFocus, true);
    assert.strictEqual(capturedOptions?.inactive, true);
  });
  test("$onDidOpenBrowserTab fires event", () => {
    const extHost = createExtHostBrowsers();
    const opened = [];
    store.add(extHost.onDidOpenBrowserTab((tab) => opened.push(tab)));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://opened.com" }));
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].url, "https://opened.com");
  });
  test("$onDidCloseBrowserTab removes tab and fires event", () => {
    const extHost = createExtHostBrowsers();
    const changes = [];
    store.add(extHost.onDidChangeBrowserTabState((tab) => changes.push(tab)));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://old.com" }));
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://new.com" }));
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].url, "https://new.com");
  });
  test("$onDidChangeBrowserTabState does not fire when data is unchanged", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://example.com", title: "Old Title" }));
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://example.com", title: "New Title" }));
    assert.strictEqual(extHost.browserTabs[0].url, "https://example.com");
    assert.strictEqual(extHost.browserTabs[0].title, "New Title");
  });
  test("$onDidChangeActiveBrowserTab fires event", () => {
    const extHost = createExtHostBrowsers();
    const activeChanges = [];
    store.add(extHost.onDidChangeActiveBrowserTab((tab) => activeChanges.push(tab?.url)));
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    extHost.$onDidChangeActiveBrowserTab(void 0);
    assert.deepStrictEqual(activeChanges, ["https://example.com", void 0]);
  });
  test("icon is globe ThemeIcon when no favicon", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
  });
  test("icon is URI when favicon is provided", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: "https://example.com/favicon.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/favicon.ico");
  });
  test("icon updates when favicon changes", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", favicon: "https://example.com/new.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/new.ico");
  });
  test("icon reverts to globe when favicon is cleared", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", favicon: "https://example.com/icon.ico" }));
    assert.strictEqual(String(extHost.browserTabs[0].icon), "https://example.com/icon.ico");
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", favicon: void 0 }));
    assert.strictEqual(extHost.browserTabs[0].icon.id, "globe");
  });
  test("tab properties are not directly writable", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://example.com", title: "Title" }));
    const tab = extHost.browserTabs[0];
    assert.throws(() => {
      tab.url = "https://hacked.com";
    });
    assert.throws(() => {
      tab.title = "Hacked";
    });
    assert.strictEqual(tab.url, "https://example.com");
    assert.strictEqual(tab.title, "Title");
  });
  test("startCDPSession calls $startCDPSession on proxy", async () => {
    let capturedBrowserId;
    const extHost = createExtHostBrowsers({
      $startCDPSession: (_sessionId, browserId) => {
        capturedBrowserId = browserId;
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    assert.ok(session);
    assert.strictEqual(capturedBrowserId, "b1");
  });
  test("sendMessage validates message structure", async () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.sendMessage({ id: 1, method: "Page.enable" });
    await assert.rejects(Promise.resolve().then(() => session.sendMessage(null)), /must be an object/);
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ method: "Foo" })), /numeric id/);
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1 })), /method string/);
  });
  test("sendMessage forwards valid message to proxy", async () => {
    const sentMessages = [];
    const extHost = createExtHostBrowsers({
      $sendCDPMessage: (_sid, message) => {
        sentMessages.push(message);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.sendMessage({ id: 1, method: "Page.enable", params: {} });
    assert.strictEqual(sentMessages.length, 1);
    assert.deepStrictEqual(sentMessages[0], { id: 1, method: "Page.enable", params: {}, sessionId: void 0 });
  });
  test("sendMessage rejects after session is closed", async () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    await session.close();
    await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1, method: "Foo" })), /closed/);
  });
  test("$onCDPSessionMessage delivers to correct session", async () => {
    const capturedIds = [];
    const extHost = createExtHostBrowsers({
      $startCDPSession: (sessionId) => {
        capturedIds.push(sessionId);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session1 = await extHost.browserTabs[0].startCDPSession();
    const session2 = await extHost.browserTabs[0].startCDPSession();
    const received1 = [];
    const received2 = [];
    store.add(session1.onDidReceiveMessage((m) => received1.push(m)));
    store.add(session2.onDidReceiveMessage((m) => received2.push(m)));
    extHost.$onCDPSessionMessage(capturedIds[1], { id: 1, result: { data: "hello" } });
    assert.deepStrictEqual(received1, []);
    assert.deepStrictEqual(received2, [{ id: 1, result: { data: "hello" } }]);
  });
  test("$onCDPSessionClosed fires onDidClose", async () => {
    const capturedIds = [];
    const extHost = createExtHostBrowsers({
      $startCDPSession: (sessionId) => {
        capturedIds.push(sessionId);
        return Promise.resolve();
      }
    });
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1" }));
    const session = await extHost.browserTabs[0].startCDPSession();
    let closeFired = false;
    store.add(session.onDidClose(() => {
      closeFired = true;
    }));
    extHost.$onCDPSessionClosed(capturedIds[0]);
    assert.ok(closeFired);
  });
  test("tab object reference is stable across updates", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://old.com", title: "Old" }));
    const tabBefore = extHost.browserTabs[0];
    extHost.$onDidChangeBrowserTabState(createDto({ id: "b1", url: "https://new.com", title: "New" }));
    const tabAfter = extHost.browserTabs[0];
    assert.strictEqual(tabBefore, tabAfter);
    assert.strictEqual(tabAfter.url, "https://new.com");
  });
  test("openBrowserTab returns same reference as browserTabs entry", async () => {
    const extHost = createExtHostBrowsers({
      $openBrowserTab: () => Promise.resolve(createDto({ id: "ref-test" }))
    });
    const returned = await extHost.openBrowserTab("https://example.com");
    const fromArray = extHost.browserTabs[0];
    assert.strictEqual(returned, fromArray);
  });
  test("closing one tab does not affect others", () => {
    const extHost = createExtHostBrowsers();
    extHost.$onDidOpenBrowserTab(createDto({ id: "b1", url: "https://one.com" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b2", url: "https://two.com" }));
    extHost.$onDidOpenBrowserTab(createDto({ id: "b3", url: "https://three.com" }));
    extHost.$onDidCloseBrowserTab("b2");
    assert.strictEqual(extHost.browserTabs.length, 2);
    assert.deepStrictEqual(extHost.browserTabs.map((t) => t.url), ["https://one.com", "https://three.com"]);
  });
  test("closing active tab clears activeBrowserTab", () => {
    const extHost = createExtHostBrowsers();
    const dto = createDto({ id: "b1" });
    extHost.$onDidOpenBrowserTab(dto);
    extHost.$onDidChangeActiveBrowserTab("b1");
    assert.ok(extHost.activeBrowserTab);
    extHost.$onDidCloseBrowserTab("b1");
    assert.strictEqual(extHost.activeBrowserTab, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RCcm93c2Vycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQnJvd3NlclRhYkR0bywgTWFpblRocmVhZEJyb3dzZXJzU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0QnJvd3NlcnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEJyb3dzZXJzLmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnRXh0SG9zdEJyb3dzZXJzJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZGVmYXVsdER0bzogQnJvd3NlclRhYkR0byA9IHtcblx0XHRpZDogJ2Jyb3dzZXItMScsXG5cdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0dGl0bGU6ICdFeGFtcGxlJyxcblx0XHRmYXZpY29uOiB1bmRlZmluZWQsXG5cdH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlRHRvKG92ZXJyaWRlcz86IFBhcnRpYWw8QnJvd3NlclRhYkR0bz4pOiBCcm93c2VyVGFiRHRvIHtcblx0XHRyZXR1cm4geyAuLi5kZWZhdWx0RHRvLCAuLi5vdmVycmlkZXMgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUV4dEhvc3RCcm93c2VycyhvdmVycmlkZXM/OiBQYXJ0aWFsPE1haW5UaHJlYWRCcm93c2Vyc1NoYXBlPik6IEV4dEhvc3RCcm93c2VycyB7XG5cdFx0Y29uc3QgcHJveHkgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRCcm93c2Vyc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRvcGVuQnJvd3NlclRhYigpOiBQcm9taXNlPEJyb3dzZXJUYWJEdG8+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjcmVhdGVEdG8oKSk7IH1cblx0XHRcdG92ZXJyaWRlICRzdGFydENEUFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRcdFx0b3ZlcnJpZGUgJGNsb3NlQ0RQU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdFx0XHRvdmVycmlkZSAkc2VuZENEUE1lc3NhZ2UoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRcdFx0b3ZlcnJpZGUgJGNsb3NlQnJvd3NlclRhYigpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdFx0fTtcblx0XHRpZiAob3ZlcnJpZGVzKSB7XG5cdFx0XHRPYmplY3QuYXNzaWduKHByb3h5LCBvdmVycmlkZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBFeHRIb3N0QnJvd3NlcnMoU2luZ2xlUHJveHlSUENQcm90b2NvbChwcm94eSkpKTtcblx0fVxuXG5cdC8vICNyZWdpb24gYnJvd3NlclRhYnNcblxuXHR0ZXN0KCdicm93c2VyVGFicyBwb3B1bGF0ZXMgZnJvbSAkb25EaWRPcGVuQnJvd3NlclRhYicsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9vbmUuY29tJywgdGl0bGU6ICdPbmUnIH0pKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjInLCB1cmw6ICdodHRwczovL3R3by5jb20nLCB0aXRsZTogJ1R3bycgfSkpO1xuXG5cdFx0Y29uc3QgdGFicyA9IGV4dEhvc3QuYnJvd3NlclRhYnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFic1swXS51cmwsICdodHRwczovL29uZS5jb20nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFic1sxXS51cmwsICdodHRwczovL3R3by5jb20nKTtcblx0fSk7XG5cblx0dGVzdCgnYnJvd3NlclRhYnMgcmV0dXJucyBhIHNuYXBzaG90LCBub3QgYSBsaXZlIGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzbmFwc2hvdDEgPSBleHRIb3N0LmJyb3dzZXJUYWJzO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IyJyB9KSk7XG5cdFx0Y29uc3Qgc25hcHNob3QyID0gZXh0SG9zdC5icm93c2VyVGFicztcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzbmFwc2hvdDEsIHNuYXBzaG90Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90MS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdDIubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gYWN0aXZlQnJvd3NlclRhYlxuXG5cdHRlc3QoJ2FjdGl2ZUJyb3dzZXJUYWIgdXBkYXRlcyB2aWEgJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYicsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3QgZHRvID0gY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vYWN0aXZlLmNvbScgfSk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihkdG8pO1xuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYignYjEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0LmFjdGl2ZUJyb3dzZXJUYWI/LnVybCwgJ2h0dHBzOi8vYWN0aXZlLmNvbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmVCcm93c2VyVGFiIGJlY29tZXMgdW5kZWZpbmVkIHdoZW4gY2xlYXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3QgZHRvID0gY3JlYXRlRHRvKHsgaWQ6ICdiMScgfSk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihkdG8pO1xuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYignYjEnKTtcblx0XHRhc3NlcnQub2soZXh0SG9zdC5hY3RpdmVCcm93c2VyVGFiKTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYih1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0LmFjdGl2ZUJyb3dzZXJUYWIsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJyRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIgd2l0aCB1bmtub3duIHRhYiByZXR1cm5zIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIoJ25vbi1leGlzdGVudCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3QuYWN0aXZlQnJvd3NlclRhYiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gb3BlbkJyb3dzZXJUYWJcblxuXHR0ZXN0KCdvcGVuQnJvd3NlclRhYiByZXR1cm5zIGEgQnJvd3NlclRhYiB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkdG8gPSBjcmVhdGVEdG8oeyBpZDogJ29wZW5lZCcsIHVybDogJ2h0dHBzOi8vb3BlbmVkLmNvbScsIHRpdGxlOiAnT3BlbmVkJyB9KTtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRvcGVuQnJvd3NlclRhYjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGR0byksXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0YWIgPSBhd2FpdCBleHRIb3N0Lm9wZW5Ccm93c2VyVGFiKCdodHRwczovL29wZW5lZC5jb20nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFiLnVybCwgJ2h0dHBzOi8vb3BlbmVkLmNvbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWIudGl0bGUsICdPcGVuZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkJyb3dzZXJUYWIgZmlyZXMgb25EaWRPcGVuQnJvd3NlclRhYiBmb3IgbmV3IHRhYnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkb3BlbkJyb3dzZXJUYWI6ICgpID0+IFByb21pc2UucmVzb2x2ZShjcmVhdGVEdG8oeyBpZDogJ25ldy10YWInIH0pKSxcblx0XHR9KTtcblx0XHRjb25zdCBvcGVuZWQ6IHZzY29kZS5Ccm93c2VyVGFiW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdC5vbkRpZE9wZW5Ccm93c2VyVGFiKHRhYiA9PiBvcGVuZWQucHVzaCh0YWIpKSk7XG5cblx0XHRhd2FpdCBleHRIb3N0Lm9wZW5Ccm93c2VyVGFiKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZFswXS51cmwsICdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5Ccm93c2VyVGFiIHJldXNlcyBleGlzdGluZyB0YWIgd2hlbiBJRHMgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkb3BlbkJyb3dzZXJUYWI6ICgpID0+IFByb21pc2UucmVzb2x2ZShjcmVhdGVEdG8oeyBpZDogJ3NhbWUnLCB1cmw6ICdodHRwczovL3VwZGF0ZWQuY29tJyB9KSksXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnc2FtZScsIHVybDogJ2h0dHBzOi8vb3JpZ2luYWwuY29tJyB9KSk7XG5cdFx0Y29uc3QgdGFiID0gYXdhaXQgZXh0SG9zdC5vcGVuQnJvd3NlclRhYignaHR0cHM6Ly91cGRhdGVkLmNvbScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3QuYnJvd3NlclRhYnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFiLnVybCwgJ2h0dHBzOi8vdXBkYXRlZC5jb20nKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlbkJyb3dzZXJUYWIgZm9yd2FyZHMgb3B0aW9ucyB0byBwcm94eScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FwdHVyZWRWaWV3Q29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhcHR1cmVkT3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgaW5hY3RpdmU/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkb3BlbkJyb3dzZXJUYWI6IChfdXJsOiBzdHJpbmcsIHZpZXdDb2x1bW4/OiBudW1iZXIsIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuOyBpbmFjdGl2ZT86IGJvb2xlYW4gfSkgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZFZpZXdDb2x1bW4gPSB2aWV3Q29sdW1uO1xuXHRcdFx0XHRjYXB0dXJlZE9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNyZWF0ZUR0byh7IGlkOiAnb3B0cycgfSkpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGV4dEhvc3Qub3BlbkJyb3dzZXJUYWIoJ2h0dHBzOi8vZXhhbXBsZS5jb20nLCB7IHZpZXdDb2x1bW46IDIsIHByZXNlcnZlRm9jdXM6IHRydWUsIGJhY2tncm91bmQ6IHRydWUgfSk7XG5cblx0XHQvLyBWaWV3Q29sdW1uLmZyb20gY29udmVydHMgQVBJIHZpZXdDb2x1bW4gKDEtYmFzZWQpIHRvIEVkaXRvckdyb3VwQ29sdW1uICgwLWJhc2VkKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFZpZXdDb2x1bW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZE9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZE9wdGlvbnM/LmluYWN0aXZlLCB0cnVlKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gJG9uRGlkT3BlbkJyb3dzZXJUYWJcblxuXHR0ZXN0KCckb25EaWRPcGVuQnJvd3NlclRhYiBmaXJlcyBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3Qgb3BlbmVkOiB2c2NvZGUuQnJvd3NlclRhYltdID0gW107XG5cdFx0c3RvcmUuYWRkKGV4dEhvc3Qub25EaWRPcGVuQnJvd3NlclRhYih0YWIgPT4gb3BlbmVkLnB1c2godGFiKSkpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9vcGVuZWQuY29tJyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZW5lZFswXS51cmwsICdodHRwczovL29wZW5lZC5jb20nKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gJG9uRGlkQ2xvc2VCcm93c2VyVGFiXG5cblx0dGVzdCgnJG9uRGlkQ2xvc2VCcm93c2VyVGFiIHJlbW92ZXMgdGFiIGFuZCBmaXJlcyBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0Y29uc3QgY2hhbmdlczogdnNjb2RlLkJyb3dzZXJUYWJbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChleHRIb3N0Lm9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKHRhYiA9PiBjaGFuZ2VzLnB1c2godGFiKSkpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9vbGQuY29tJyB9KSk7XG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vbmV3LmNvbScgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS51cmwsICdodHRwczovL25ldy5jb20nKTtcblx0fSk7XG5cblx0dGVzdCgnJG9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlIGRvZXMgbm90IGZpcmUgd2hlbiBkYXRhIGlzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHRpdGxlOiAnT2xkIFRpdGxlJyB9KSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUJyb3dzZXJUYWJTdGF0ZShjcmVhdGVEdG8oeyBpZDogJ2IxJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHRpdGxlOiAnTmV3IFRpdGxlJyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5icm93c2VyVGFic1swXS51cmwsICdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3QuYnJvd3NlclRhYnNbMF0udGl0bGUsICdOZXcgVGl0bGUnKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gJG9uRGlkQ2hhbmdlQWN0aXZlQnJvd3NlclRhYiBldmVudFxuXG5cdHRlc3QoJyRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIgZmlyZXMgZXZlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZXM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZXh0SG9zdC5vbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIodGFiID0+IGFjdGl2ZUNoYW5nZXMucHVzaCh0YWI/LnVybCkpKTtcblxuXHRcdGNvbnN0IGR0byA9IGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoZHRvKTtcblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIoJ2IxJyk7XG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VBY3RpdmVCcm93c2VyVGFiKHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGl2ZUNoYW5nZXMsIFsnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHVuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBCcm93c2VyVGFiIGljb25cblxuXHR0ZXN0KCdpY29uIGlzIGdsb2JlIFRoZW1lSWNvbiB3aGVuIG5vIGZhdmljb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIGZhdmljb246IHVuZGVmaW5lZCB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uaWNvbiBhcyB7IGlkOiBzdHJpbmcgfSkuaWQsICdnbG9iZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpY29uIGlzIFVSSSB3aGVuIGZhdmljb24gaXMgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIGZhdmljb246ICdodHRwczovL2V4YW1wbGUuY29tL2Zhdmljb24uaWNvJyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoU3RyaW5nKGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uaWNvbiksICdodHRwczovL2V4YW1wbGUuY29tL2Zhdmljb24uaWNvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ljb24gdXBkYXRlcyB3aGVuIGZhdmljb24gY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJywgZmF2aWNvbjogdW5kZWZpbmVkIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uaWNvbiBhcyB7IGlkOiBzdHJpbmcgfSkuaWQsICdnbG9iZScpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRDaGFuZ2VCcm93c2VyVGFiU3RhdGUoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIGZhdmljb246ICdodHRwczovL2V4YW1wbGUuY29tL25ldy5pY28nIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoU3RyaW5nKGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uaWNvbiksICdodHRwczovL2V4YW1wbGUuY29tL25ldy5pY28nKTtcblx0fSk7XG5cblx0dGVzdCgnaWNvbiByZXZlcnRzIHRvIGdsb2JlIHdoZW4gZmF2aWNvbiBpcyBjbGVhcmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCBmYXZpY29uOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9pY29uLmljbycgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChTdHJpbmcoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uKSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vaWNvbi5pY28nKTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCBmYXZpY29uOiB1bmRlZmluZWQgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXh0SG9zdC5icm93c2VyVGFic1swXS5pY29uIGFzIHsgaWQ6IHN0cmluZyB9KS5pZCwgJ2dsb2JlJyk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIEJyb3dzZXJUYWIgcmVhZG9ubHkgcHJvcGVydGllc1xuXG5cdHRlc3QoJ3RhYiBwcm9wZXJ0aWVzIGFyZSBub3QgZGlyZWN0bHkgd3JpdGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLCB0aXRsZTogJ1RpdGxlJyB9KSk7XG5cdFx0Y29uc3QgdGFiID0gZXh0SG9zdC5icm93c2VyVGFic1swXTtcblxuXHRcdC8vIEF0dGVtcHRpbmcgdG8gYXNzaWduIHRvIGdldHRlci1vbmx5IHByb3BlcnRpZXMgc2hvdWxkIGVpdGhlciB0aHJvdyBvciBiZSBzaWxlbnRseSBpZ25vcmVkXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7ICh0YWIgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikudXJsID0gJ2h0dHBzOi8vaGFja2VkLmNvbSc7IH0pO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4geyAodGFiIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnRpdGxlID0gJ0hhY2tlZCc7IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWIudXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWIudGl0bGUsICdUaXRsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydENEUFNlc3Npb24gY2FsbHMgJHN0YXJ0Q0RQU2Vzc2lvbiBvbiBwcm94eScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FwdHVyZWRCcm93c2VySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRzdGFydENEUFNlc3Npb246IChfc2Vzc2lvbklkOiBzdHJpbmcsIGJyb3dzZXJJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkQnJvd3NlcklkID0gYnJvd3NlcklkO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJyB9KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uc3RhcnRDRFBTZXNzaW9uKCk7XG5cblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkQnJvd3NlcklkLCAnYjEnKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZE1lc3NhZ2UgdmFsaWRhdGVzIG1lc3NhZ2Ugc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblxuXHRcdC8vIFZhbGlkIG1lc3NhZ2Ugc3VjY2VlZHNcblx0XHRhd2FpdCBzZXNzaW9uLnNlbmRNZXNzYWdlKHsgaWQ6IDEsIG1ldGhvZDogJ1BhZ2UuZW5hYmxlJyB9KTtcblxuXHRcdC8vIEludmFsaWQgbWVzc2FnZXMgYXJlIHJlamVjdGVkXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBzZXNzaW9uLnNlbmRNZXNzYWdlKG51bGwgYXMgbmV2ZXIpKSwgL211c3QgYmUgYW4gb2JqZWN0Lyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBzZXNzaW9uLnNlbmRNZXNzYWdlKHsgbWV0aG9kOiAnRm9vJyB9IGFzIG5ldmVyKSksIC9udW1lcmljIGlkLyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBzZXNzaW9uLnNlbmRNZXNzYWdlKHsgaWQ6IDEgfSBhcyBuZXZlcikpLCAvbWV0aG9kIHN0cmluZy8pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTWVzc2FnZSBmb3J3YXJkcyB2YWxpZCBtZXNzYWdlIHRvIHByb3h5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlbnRNZXNzYWdlczogdW5rbm93bltdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkc2VuZENEUE1lc3NhZ2U6IChfc2lkOiBzdHJpbmcsIG1lc3NhZ2U6IHVua25vd24pID0+IHtcblx0XHRcdFx0c2VudE1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgZXh0SG9zdC5icm93c2VyVGFic1swXS5zdGFydENEUFNlc3Npb24oKTtcblx0XHRhd2FpdCBzZXNzaW9uLnNlbmRNZXNzYWdlKHsgaWQ6IDEsIG1ldGhvZDogJ1BhZ2UuZW5hYmxlJywgcGFyYW1zOiB7fSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW50TWVzc2FnZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRNZXNzYWdlc1swXSwgeyBpZDogMSwgbWV0aG9kOiAnUGFnZS5lbmFibGUnLCBwYXJhbXM6IHt9LCBzZXNzaW9uSWQ6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZE1lc3NhZ2UgcmVqZWN0cyBhZnRlciBzZXNzaW9uIGlzIGNsb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKCk7XG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJyB9KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uc3RhcnRDRFBTZXNzaW9uKCk7XG5cblx0XHRhd2FpdCBzZXNzaW9uLmNsb3NlKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiBzZXNzaW9uLnNlbmRNZXNzYWdlKHsgaWQ6IDEsIG1ldGhvZDogJ0ZvbycgfSkpLCAvY2xvc2VkLyk7XG5cdH0pO1xuXG5cdHRlc3QoJyRvbkNEUFNlc3Npb25NZXNzYWdlIGRlbGl2ZXJzIHRvIGNvcnJlY3Qgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYXB0dXJlZElkczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBleHRIb3N0ID0gY3JlYXRlRXh0SG9zdEJyb3dzZXJzKHtcblx0XHRcdCRzdGFydENEUFNlc3Npb246IChzZXNzaW9uSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZElkcy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IGF3YWl0IGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uc3RhcnRDRFBTZXNzaW9uKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBhd2FpdCBleHRIb3N0LmJyb3dzZXJUYWJzWzBdLnN0YXJ0Q0RQU2Vzc2lvbigpO1xuXG5cdFx0Y29uc3QgcmVjZWl2ZWQxOiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCByZWNlaXZlZDI6IHVua25vd25bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXNzaW9uMS5vbkRpZFJlY2VpdmVNZXNzYWdlKG0gPT4gcmVjZWl2ZWQxLnB1c2gobSkpKTtcblx0XHRzdG9yZS5hZGQoc2Vzc2lvbjIub25EaWRSZWNlaXZlTWVzc2FnZShtID0+IHJlY2VpdmVkMi5wdXNoKG0pKSk7XG5cblx0XHRleHRIb3N0LiRvbkNEUFNlc3Npb25NZXNzYWdlKGNhcHR1cmVkSWRzWzFdLCB7IGlkOiAxLCByZXN1bHQ6IHsgZGF0YTogJ2hlbGxvJyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZDEsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkMiwgW3sgaWQ6IDEsIHJlc3VsdDogeyBkYXRhOiAnaGVsbG8nIH0gfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCckb25DRFBTZXNzaW9uQ2xvc2VkIGZpcmVzIG9uRGlkQ2xvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FwdHVyZWRJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkc3RhcnRDRFBTZXNzaW9uOiAoc2Vzc2lvbklkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWRJZHMucHVzaChzZXNzaW9uSWQpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRPcGVuQnJvd3NlclRhYihjcmVhdGVEdG8oeyBpZDogJ2IxJyB9KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGV4dEhvc3QuYnJvd3NlclRhYnNbMF0uc3RhcnRDRFBTZXNzaW9uKCk7XG5cblx0XHRsZXQgY2xvc2VGaXJlZCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChzZXNzaW9uLm9uRGlkQ2xvc2UoKCkgPT4geyBjbG9zZUZpcmVkID0gdHJ1ZTsgfSkpO1xuXG5cdFx0ZXh0SG9zdC4kb25DRFBTZXNzaW9uQ2xvc2VkKGNhcHR1cmVkSWRzWzBdKTtcblx0XHRhc3NlcnQub2soY2xvc2VGaXJlZCk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFJlZmVyZW5jZSBzdGFiaWxpdHlcblxuXHR0ZXN0KCd0YWIgb2JqZWN0IHJlZmVyZW5jZSBpcyBzdGFibGUgYWNyb3NzIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoY3JlYXRlRHRvKHsgaWQ6ICdiMScsIHVybDogJ2h0dHBzOi8vb2xkLmNvbScsIHRpdGxlOiAnT2xkJyB9KSk7XG5cdFx0Y29uc3QgdGFiQmVmb3JlID0gZXh0SG9zdC5icm93c2VyVGFic1swXTtcblxuXHRcdGV4dEhvc3QuJG9uRGlkQ2hhbmdlQnJvd3NlclRhYlN0YXRlKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL25ldy5jb20nLCB0aXRsZTogJ05ldycgfSkpO1xuXHRcdGNvbnN0IHRhYkFmdGVyID0gZXh0SG9zdC5icm93c2VyVGFic1swXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YWJCZWZvcmUsIHRhYkFmdGVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFiQWZ0ZXIudXJsLCAnaHR0cHM6Ly9uZXcuY29tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5Ccm93c2VyVGFiIHJldHVybnMgc2FtZSByZWZlcmVuY2UgYXMgYnJvd3NlclRhYnMgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2Vycyh7XG5cdFx0XHQkb3BlbkJyb3dzZXJUYWI6ICgpID0+IFByb21pc2UucmVzb2x2ZShjcmVhdGVEdG8oeyBpZDogJ3JlZi10ZXN0JyB9KSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXR1cm5lZCA9IGF3YWl0IGV4dEhvc3Qub3BlbkJyb3dzZXJUYWIoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRjb25zdCBmcm9tQXJyYXkgPSBleHRIb3N0LmJyb3dzZXJUYWJzWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldHVybmVkLCBmcm9tQXJyYXkpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBNdWx0aXBsZSB0YWJzIHRyYWNrZWQgaW5kZXBlbmRlbnRseVxuXG5cdHRlc3QoJ2Nsb3Npbmcgb25lIHRhYiBkb2VzIG5vdCBhZmZlY3Qgb3RoZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBjcmVhdGVFeHRIb3N0QnJvd3NlcnMoKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjEnLCB1cmw6ICdodHRwczovL29uZS5jb20nIH0pKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjInLCB1cmw6ICdodHRwczovL3R3by5jb20nIH0pKTtcblx0XHRleHRIb3N0LiRvbkRpZE9wZW5Ccm93c2VyVGFiKGNyZWF0ZUR0byh7IGlkOiAnYjMnLCB1cmw6ICdodHRwczovL3RocmVlLmNvbScgfSkpO1xuXG5cdFx0ZXh0SG9zdC4kb25EaWRDbG9zZUJyb3dzZXJUYWIoJ2IyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5icm93c2VyVGFicy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0SG9zdC5icm93c2VyVGFicy5tYXAodCA9PiB0LnVybCksIFsnaHR0cHM6Ly9vbmUuY29tJywgJ2h0dHBzOi8vdGhyZWUuY29tJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zaW5nIGFjdGl2ZSB0YWIgY2xlYXJzIGFjdGl2ZUJyb3dzZXJUYWInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXh0SG9zdCA9IGNyZWF0ZUV4dEhvc3RCcm93c2VycygpO1xuXHRcdGNvbnN0IGR0byA9IGNyZWF0ZUR0byh7IGlkOiAnYjEnIH0pO1xuXHRcdGV4dEhvc3QuJG9uRGlkT3BlbkJyb3dzZXJUYWIoZHRvKTtcblx0XHRleHRIb3N0LiRvbkRpZENoYW5nZUFjdGl2ZUJyb3dzZXJUYWIoJ2IxJyk7XG5cdFx0YXNzZXJ0Lm9rKGV4dEhvc3QuYWN0aXZlQnJvd3NlclRhYik7XG5cblx0XHRleHRIb3N0LiRvbkRpZENsb3NlQnJvd3NlclRhYignYjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdC5hY3RpdmVCcm93c2VyVGFiLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFFckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0sYUFBNEI7QUFBQSxJQUNqQyxJQUFJO0FBQUEsSUFDSixLQUFLO0FBQUEsSUFDTCxPQUFPO0FBQUEsSUFDUCxTQUFTO0FBQUEsRUFDVjtBQUVBLFdBQVMsVUFBVSxXQUFtRDtBQUNyRSxXQUFPLEVBQUUsR0FBRyxZQUFZLEdBQUcsVUFBVTtBQUFBLEVBQ3RDO0FBRUEsV0FBUyxzQkFBc0IsV0FBK0Q7QUFDN0YsVUFBTSxRQUFRLElBQUksY0FBYyxLQUE4QixFQUFFO0FBQUEsTUFDdEQsa0JBQTBDO0FBQUUsZUFBTyxRQUFRLFFBQVEsVUFBVSxDQUFDO0FBQUEsTUFBRztBQUFBLE1BQ2pGLG1CQUFrQztBQUFFLGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQzlELG1CQUFrQztBQUFFLGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQzlELGtCQUFpQztBQUFFLGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQzdELG1CQUFrQztBQUFFLGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFBRztBQUFBLElBQ3hFO0FBQ0EsUUFBSSxXQUFXO0FBQ2QsYUFBTyxPQUFPLE9BQU8sU0FBUztBQUFBLElBQy9CO0FBQ0EsV0FBTyxNQUFNLElBQUksSUFBSSxnQkFBZ0IsdUJBQXVCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFJQSxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELFVBQU0sVUFBVSxzQkFBc0I7QUFDdEMsWUFBUSxxQkFBcUIsVUFBVSxFQUFFLElB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
