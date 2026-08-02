import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { NativeWindow } from "../../electron-browser/window.js";
import { ITunnelService } from "../../../platform/tunnel/common/tunnel.js";
import { URI } from "../../../base/common/uri.js";
import { workbenchInstantiationService } from "./workbenchTestServices.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
class TunnelMock {
  constructor() {
    this.assignedPorts = {};
    this.expectedDispose = false;
  }
  reset(ports) {
    this.assignedPorts = ports;
  }
  expectDispose() {
    this.expectedDispose = true;
  }
  getExistingTunnel() {
    return Promise.resolve(void 0);
  }
  openTunnel(_addressProvider, _host, port) {
    if (!this.assignedPorts[port]) {
      return Promise.reject(new Error("Unexpected tunnel request"));
    }
    const res = {
      localAddress: `localhost:${this.assignedPorts[port]}`,
      tunnelRemoteHost: "4.3.2.1",
      tunnelRemotePort: this.assignedPorts[port],
      privacy: "",
      dispose: () => {
        assert(this.expectedDispose, "Unexpected dispose");
        this.expectedDispose = false;
        return Promise.resolve();
      }
    };
    delete this.assignedPorts[port];
    return Promise.resolve(res);
  }
  validate() {
    try {
      assert(Object.keys(this.assignedPorts).length === 0, "Expected tunnel to be used");
      assert(!this.expectedDispose, "Expected dispose to be called");
    } finally {
      this.expectedDispose = false;
    }
  }
}
class TestNativeWindow extends NativeWindow {
  create() {
  }
  registerListeners() {
  }
  enableMultiWindowAwareTimeout() {
  }
}
suite.skip("NativeWindow:resolveExternal", () => {
  const disposables = new DisposableStore();
  const tunnelMock = new TunnelMock();
  let window;
  setup(() => {
    const instantiationService = workbenchInstantiationService(void 0, disposables);
    instantiationService.stub(ITunnelService, tunnelMock);
    window = disposables.add(instantiationService.createInstance(TestNativeWindow));
  });
  teardown(() => {
    disposables.clear();
  });
  async function doTest(uri, ports = {}, expectedUri) {
    tunnelMock.reset(ports);
    const res = await window.resolveExternalUri(URI.parse(uri), {
      allowTunneling: true,
      openExternal: true
    });
    assert.strictEqual(!expectedUri, !res, `Expected URI ${expectedUri} but got ${res}`);
    if (expectedUri && res) {
      assert.strictEqual(res.resolved.toString(), URI.parse(expectedUri).toString());
    }
    tunnelMock.validate();
  }
  test("invalid", async () => {
    await doTest("file:///foo.bar/baz");
    await doTest("http://foo.bar/path");
  });
  test("simple", async () => {
    await doTest("http://localhost:1234/path", { 1234: 1234 }, "http://localhost:1234/path");
  });
  test("all interfaces", async () => {
    await doTest("http://0.0.0.0:1234/path", { 1234: 1234 }, "http://localhost:1234/path");
  });
  test("changed port", async () => {
    await doTest("http://localhost:1234/path", { 1234: 1235 }, "http://localhost:1235/path");
  });
  test("query", async () => {
    await doTest("http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455", { 4455: 4455 }, "http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455");
  });
  test("query with different port", async () => {
    tunnelMock.expectDispose();
    await doTest("http://foo.bar/path?a=b&c=http%3a%2f%2flocalhost%3a4455", { 4455: 4567 });
  });
  test("both url and query", async () => {
    await doTest(
      "http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455",
      { 1234: 4321, 4455: 4455 },
      "http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455"
    );
  });
  test("both url and query, query rejected", async () => {
    tunnelMock.expectDispose();
    await doTest(
      "http://localhost:1234/path?a=b&c=http%3a%2f%2flocalhost%3a4455",
      { 1234: 4321, 4455: 5544 },
      "http://localhost:4321/path?a=b&c=http%3a%2f%2flocalhost%3a4455"
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvcmVzb2x2ZUV4dGVybmFsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi9lbGVjdHJvbi1icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJVHVubmVsU2VydmljZSwgUmVtb3RlVHVubmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElBZGRyZXNzUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbnR5cGUgUG9ydE1hcCA9IFJlY29yZDxudW1iZXIsIG51bWJlcj47XG5cbmNsYXNzIFR1bm5lbE1vY2sgaW1wbGVtZW50cyBQYXJ0aWFsPElUdW5uZWxTZXJ2aWNlPiB7XG5cdHByaXZhdGUgYXNzaWduZWRQb3J0czogUG9ydE1hcCA9IHt9O1xuXHRwcml2YXRlIGV4cGVjdGVkRGlzcG9zZSA9IGZhbHNlO1xuXG5cdHJlc2V0KHBvcnRzOiBQb3J0TWFwKSB7XG5cdFx0dGhpcy5hc3NpZ25lZFBvcnRzID0gcG9ydHM7XG5cdH1cblxuXHRleHBlY3REaXNwb3NlKCkge1xuXHRcdHRoaXMuZXhwZWN0ZWREaXNwb3NlID0gdHJ1ZTtcblx0fVxuXG5cdGdldEV4aXN0aW5nVHVubmVsKCk6IFByb21pc2U8c3RyaW5nIHwgUmVtb3RlVHVubmVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0b3BlblR1bm5lbChfYWRkcmVzc1Byb3ZpZGVyOiBJQWRkcmVzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkLCBfaG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwb3J0OiBudW1iZXIpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5hc3NpZ25lZFBvcnRzW3BvcnRdKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdVbmV4cGVjdGVkIHR1bm5lbCByZXF1ZXN0JykpO1xuXHRcdH1cblx0XHRjb25zdCByZXM6IFJlbW90ZVR1bm5lbCA9IHtcblx0XHRcdGxvY2FsQWRkcmVzczogYGxvY2FsaG9zdDoke3RoaXMuYXNzaWduZWRQb3J0c1twb3J0XX1gLFxuXHRcdFx0dHVubmVsUmVtb3RlSG9zdDogJzQuMy4yLjEnLFxuXHRcdFx0dHVubmVsUmVtb3RlUG9ydDogdGhpcy5hc3NpZ25lZFBvcnRzW3BvcnRdLFxuXHRcdFx0cHJpdmFjeTogJycsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCh0aGlzLmV4cGVjdGVkRGlzcG9zZSwgJ1VuZXhwZWN0ZWQgZGlzcG9zZScpO1xuXHRcdFx0XHR0aGlzLmV4cGVjdGVkRGlzcG9zZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkZWxldGUgdGhpcy5hc3NpZ25lZFBvcnRzW3BvcnRdO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzKTtcblx0fVxuXG5cdHZhbGlkYXRlKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQoT2JqZWN0LmtleXModGhpcy5hc3NpZ25lZFBvcnRzKS5sZW5ndGggPT09IDAsICdFeHBlY3RlZCB0dW5uZWwgdG8gYmUgdXNlZCcpO1xuXHRcdFx0YXNzZXJ0KCF0aGlzLmV4cGVjdGVkRGlzcG9zZSwgJ0V4cGVjdGVkIGRpc3Bvc2UgdG8gYmUgY2FsbGVkJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuZXhwZWN0ZWREaXNwb3NlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3ROYXRpdmVXaW5kb3cgZXh0ZW5kcyBOYXRpdmVXaW5kb3cge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlKCk6IHZvaWQgeyB9XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHsgfVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZW5hYmxlTXVsdGlXaW5kb3dBd2FyZVRpbWVvdXQoKTogdm9pZCB7IH1cbn1cblxuc3VpdGUuc2tpcCgnTmF0aXZlV2luZG93OnJlc29sdmVFeHRlcm5hbCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHR1bm5lbE1vY2sgPSBuZXcgVHVubmVsTW9jaygpO1xuXHRsZXQgd2luZG93OiBUZXN0TmF0aXZlV2luZG93O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlID0gPFRlc3RJbnN0YW50aWF0aW9uU2VydmljZT53b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUdW5uZWxTZXJ2aWNlLCB0dW5uZWxNb2NrKTtcblx0XHR3aW5kb3cgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdE5hdGl2ZVdpbmRvdykpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gZG9UZXN0KHVyaTogc3RyaW5nLCBwb3J0czogUG9ydE1hcCA9IHt9LCBleHBlY3RlZFVyaT86IHN0cmluZykge1xuXHRcdHR1bm5lbE1vY2sucmVzZXQocG9ydHMpO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHdpbmRvdy5yZXNvbHZlRXh0ZXJuYWxVcmkoVVJJLnBhcnNlKHVyaSksIHtcblx0XHRcdGFsbG93VHVubmVsaW5nOiB0cnVlLFxuXHRcdFx0b3BlbkV4dGVybmFsOiB0cnVlXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCFleHBlY3RlZFVyaSwgIXJlcywgYEV4cGVjdGVkIFVSSSAke2V4cGVjdGVkVXJpfSBidXQgZ290ICR7cmVzfWApO1xuXHRcdGlmIChleHBlY3RlZFVyaSAmJiByZXMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucmVzb2x2ZWQudG9TdHJpbmcoKSwgVVJJLnBhcnNlKGV4cGVjdGVkVXJpKS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0dHVubmVsTW9jay52YWxpZGF0ZSgpO1xuXHR9XG5cblx0dGVzdCgnaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBkb1Rlc3QoJ2ZpbGU6Ly8vZm9vLmJhci9iYXonKTtcblx0XHRhd2FpdCBkb1Rlc3QoJ2h0dHA6Ly9mb28uYmFyL3BhdGgnKTtcblx0fSk7XG5cdHRlc3QoJ3NpbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBkb1Rlc3QoJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9wYXRoJywgeyAxMjM0OiAxMjM0IH0sICdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aCcpO1xuXHR9KTtcblx0dGVzdCgnYWxsIGludGVyZmFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vMC4wLjAuMDoxMjM0L3BhdGgnLCB7IDEyMzQ6IDEyMzQgfSwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9wYXRoJyk7XG5cdH0pO1xuXHR0ZXN0KCdjaGFuZ2VkIHBvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aCcsIHsgMTIzNDogMTIzNSB9LCAnaHR0cDovL2xvY2FsaG9zdDoxMjM1L3BhdGgnKTtcblx0fSk7XG5cdHRlc3QoJ3F1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGRvVGVzdCgnaHR0cDovL2Zvby5iYXIvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScsIHsgNDQ1NTogNDQ1NSB9LCAnaHR0cDovL2Zvby5iYXIvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScpO1xuXHR9KTtcblx0dGVzdCgncXVlcnkgd2l0aCBkaWZmZXJlbnQgcG9ydCcsIGFzeW5jICgpID0+IHtcblx0XHR0dW5uZWxNb2NrLmV4cGVjdERpc3Bvc2UoKTtcblx0XHRhd2FpdCBkb1Rlc3QoJ2h0dHA6Ly9mb28uYmFyL3BhdGg/YT1iJmM9aHR0cCUzYSUyZiUyZmxvY2FsaG9zdCUzYTQ0NTUnLCB7IDQ0NTU6IDQ1NjcgfSk7XG5cdH0pO1xuXHR0ZXN0KCdib3RoIHVybCBhbmQgcXVlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZG9UZXN0KCdodHRwOi8vbG9jYWxob3N0OjEyMzQvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScsXG5cdFx0XHR7IDEyMzQ6IDQzMjEsIDQ0NTU6IDQ0NTUgfSxcblx0XHRcdCdodHRwOi8vbG9jYWxob3N0OjQzMjEvcGF0aD9hPWImYz1odHRwJTNhJTJmJTJmbG9jYWxob3N0JTNhNDQ1NScpO1xuXHR9KTtcblx0dGVzdCgnYm90aCB1cmwgYW5kIHF1ZXJ5LCBxdWVyeSByZWplY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHR0dW5uZWxNb2NrLmV4cGVjdERpc3Bvc2UoKTtcblx0XHRhd2FpdCBkb1Rlc3QoJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9wYXRoP2E9YiZjPWh0dHAlM2ElMmYlMmZsb2NhbGhvc3QlM2E0NDU1Jyxcblx0XHRcdHsgMTIzNDogNDMyMSwgNDQ1NTogNTU0NCB9LFxuXHRcdFx0J2h0dHA6Ly9sb2NhbGhvc3Q6NDMyMS9wYXRoP2E9YiZjPWh0dHAlM2ElMmYlMmZsb2NhbGhvc3QlM2E0NDU1Jyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRl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
