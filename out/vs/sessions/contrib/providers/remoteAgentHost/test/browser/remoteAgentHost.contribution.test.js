import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { RemoteAgentHostEntryType } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { disconnectSSHEntry, shouldPauseSSHReconnectAfterFailure, sshConnectionKey, SSHReconnectState } from "../../browser/remoteAgentHost.contribution.js";
suite("SSHReconnectState", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("scheduleRetry fires the handler after the requested delay", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      assert.strictEqual(state.hasPendingTimer, true);
      await timeout(500);
      assert.strictEqual(fired, 0);
      await timeout(600);
      assert.strictEqual(fired, 1);
    });
  });
  test("hasPendingTimer becomes false once the handler has run", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      state.scheduleRetry(1e3, () => {
      });
      await timeout(1100);
      assert.strictEqual(state.hasPendingTimer, false, "timer should be cleared after firing");
    });
  });
  test("cancelTimer prevents the handler from firing", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      state.cancelTimer();
      assert.strictEqual(state.hasPendingTimer, false);
      await timeout(2e3);
      assert.strictEqual(fired, 0);
    });
  });
  test("scheduling a second retry replaces the first", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let firstFired = 0;
      let secondFired = 0;
      state.scheduleRetry(5e3, () => firstFired++);
      state.scheduleRetry(1e3, () => secondFired++);
      await timeout(6e3);
      assert.strictEqual(firstFired, 0, "replaced timer must not fire");
      assert.strictEqual(secondFired, 1);
    });
  });
  test("disposing the state cancels a pending retry timer", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = new SSHReconnectState();
      let fired = 0;
      state.scheduleRetry(1e3, () => fired++);
      state.dispose();
      await timeout(2e3);
      assert.strictEqual(fired, 0);
    });
  });
  test("resetForResume clears the timer and zeros attempts/paused state", async () => {
    return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const state = store.add(new SSHReconnectState());
      let fired = 0;
      state.attempts = 7;
      state.paused = true;
      state.scheduleRetry(1e3, () => fired++);
      state.resetForResume();
      assert.strictEqual(state.attempts, 0);
      assert.strictEqual(state.paused, false);
      assert.strictEqual(state.hasPendingTimer, false);
      await timeout(2e3);
      assert.strictEqual(fired, 0, "pending retry must be cancelled by resetForResume");
    });
  });
});
suite("shouldPauseSSHReconnectAfterFailure", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("pauses reconnect after cancellation but not after regular failures", () => {
    assert.deepStrictEqual({
      cancellation: shouldPauseSSHReconnectAfterFailure(new CancellationError()),
      regularError: shouldPauseSSHReconnectAfterFailure(new Error("boom"))
    }, {
      cancellation: true,
      regularError: false
    });
  });
});
suite("disconnectSSHEntry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeSSHConfigConnection(overrides = {}) {
    return {
      type: RemoteAgentHostEntryType.SSH,
      address: "localhost:4321",
      sshConfigHost: "myserver",
      hostName: "myserver.example.com",
      ...overrides
    };
  }
  test("removes the entry from configured storage BEFORE tearing down the SSH tunnel", async () => {
    const calls = [];
    const connection = makeSSHConfigConnection();
    const removed = new DeferredPromise();
    const remoteAgentHostService = {
      removeRemoteAgentHost: async (address) => {
        calls.push(`remove:${address}`);
        await removed.p;
      }
    };
    const sshService = {
      disconnect: async (key) => {
        calls.push(`ssh:${key}`);
      }
    };
    const pending = disconnectSSHEntry(connection, remoteAgentHostService, sshService);
    await timeout(0);
    assert.deepStrictEqual(calls, ["remove:localhost:4321"]);
    removed.complete();
    await pending;
    assert.deepStrictEqual(calls, ["remove:localhost:4321", "ssh:ssh:myserver"]);
  });
  test("uses sshConfigHost-based key when sshConfigHost is set", async () => {
    const calls = [];
    await disconnectSSHEntry(
      makeSSHConfigConnection({ sshConfigHost: "myserver" }),
      { removeRemoteAgentHost: async () => {
      } },
      { disconnect: async (key) => {
        calls.push(key);
      } }
    );
    assert.deepStrictEqual(calls, ["ssh:myserver"]);
  });
  test("uses user@host:port key when sshConfigHost is not set", async () => {
    const calls = [];
    await disconnectSSHEntry(
      {
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com",
        user: "me",
        port: 2222
      },
      { removeRemoteAgentHost: async () => {
      } },
      { disconnect: async (key) => {
        calls.push(key);
      } }
    );
    assert.deepStrictEqual(calls, ["me@myserver.example.com:2222"]);
  });
});
suite("sshConnectionKey", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches the keys the SSH service stores connections under", () => {
    assert.deepStrictEqual({
      configHost: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        sshConfigHost: "myserver",
        hostName: "ignored"
      }),
      userHostPort: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com",
        user: "me",
        port: 2222
      }),
      hostOnly: sshConnectionKey({
        type: RemoteAgentHostEntryType.SSH,
        address: "localhost:4321",
        hostName: "myserver.example.com"
      })
    }, {
      configHost: "ssh:myserver",
      userHostPort: "me@myserver.example.com:2222",
      hostOnly: "myserver.example.com@myserver.example.com:22"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC90ZXN0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0LmNvbnRyaWJ1dGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNTSENvbm5lY3Rpb24sIFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaXNjb25uZWN0U1NIRW50cnksIHNob3VsZFBhdXNlU1NIUmVjb25uZWN0QWZ0ZXJGYWlsdXJlLCBzc2hDb25uZWN0aW9uS2V5LCBTU0hSZWNvbm5lY3RTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0LmNvbnRyaWJ1dGlvbi5qcyc7XG5cbnN1aXRlKCdTU0hSZWNvbm5lY3RTdGF0ZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzY2hlZHVsZVJldHJ5IGZpcmVzIHRoZSBoYW5kbGVyIGFmdGVyIHRoZSByZXF1ZXN0ZWQgZGVsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RvcmUuYWRkKG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpKTtcblx0XHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0XHRzdGF0ZS5zY2hlZHVsZVJldHJ5KDEwMDAsICgpID0+IGZpcmVkKyspO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaGFzUGVuZGluZ1RpbWVyLCB0cnVlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZCwgMCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDYwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNQZW5kaW5nVGltZXIgYmVjb21lcyBmYWxzZSBvbmNlIHRoZSBoYW5kbGVyIGhhcyBydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBndWFyZCBmb3IgdGhlIFBSLWZlZWRiYWNrIGZpeDogdGhlIHRpbWVyIGRpc3Bvc2FibGUgbXVzdFxuXHRcdC8vIGJlIGNsZWFyZWQgaW5zaWRlIHNjaGVkdWxlUmV0cnkncyB0aWNrIHNvIHRoYXQgb2JzZXJ2ZXJzIHRoYXQgY2hlY2tcblx0XHQvLyBoYXNQZW5kaW5nVGltZXIgYWZ0ZXIgdGhlIGhhbmRsZXIgcnVucyBzZWUgdGhlIHJpZ2h0IHZhbHVlLlxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0b3JlLmFkZChuZXcgU1NIUmVjb25uZWN0U3RhdGUoKSk7XG5cdFx0XHRzdGF0ZS5zY2hlZHVsZVJldHJ5KDEwMDAsICgpID0+IHsgLyogbm8gZm9sbG93LXVwICovIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5oYXNQZW5kaW5nVGltZXIsIGZhbHNlLCAndGltZXIgc2hvdWxkIGJlIGNsZWFyZWQgYWZ0ZXIgZmlyaW5nJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbFRpbWVyIHByZXZlbnRzIHRoZSBoYW5kbGVyIGZyb20gZmlyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0b3JlLmFkZChuZXcgU1NIUmVjb25uZWN0U3RhdGUoKSk7XG5cdFx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdFx0c3RhdGUuc2NoZWR1bGVSZXRyeSgxMDAwLCAoKSA9PiBmaXJlZCsrKTtcblx0XHRcdHN0YXRlLmNhbmNlbFRpbWVyKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaGFzUGVuZGluZ1RpbWVyLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDIwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2NoZWR1bGluZyBhIHNlY29uZCByZXRyeSByZXBsYWNlcyB0aGUgZmlyc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTXV0YWJsZURpc3Bvc2FibGUgY29udHJhY3Q6IGFzc2lnbmluZyBhIG5ldyB2YWx1ZSBkaXNwb3NlcyB0aGUgb2xkLlxuXHRcdC8vIElmIHR3byByZXRyaWVzIHdlcmUgc2NoZWR1bGVkIHNpbXVsdGFuZW91c2x5IHRoZSBjb250cmlidXRpb24gd291bGRcblx0XHQvLyBkb3VibGUtZmlyZSByZWNvbm5lY3QgYXR0ZW1wdHMgYW5kIGluZmxhdGUgdGhlIGF0dGVtcHQgY291bnRlci5cblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxMF8wMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdG9yZS5hZGQobmV3IFNTSFJlY29ubmVjdFN0YXRlKCkpO1xuXHRcdFx0bGV0IGZpcnN0RmlyZWQgPSAwO1xuXHRcdFx0bGV0IHNlY29uZEZpcmVkID0gMDtcblx0XHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoNTAwMCwgKCkgPT4gZmlyc3RGaXJlZCsrKTtcblx0XHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoMTAwMCwgKCkgPT4gc2Vjb25kRmlyZWQrKyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDYwMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0RmlyZWQsIDAsICdyZXBsYWNlZCB0aW1lciBtdXN0IG5vdCBmaXJlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kRmlyZWQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgdGhlIHN0YXRlIGNhbmNlbHMgYSBwZW5kaW5nIHJldHJ5IHRpbWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIHNhZmV0eSBuZXQgZm9yIHRoZSBEaXNwb3NhYmxlTWFwIHRoYXQgb3ducyB0aGVzZSBzdGF0ZXM6XG5cdFx0Ly8gd2hlbiB0aGUgY29udHJpYnV0aW9uIGlzIGRpc3Bvc2VkIChvciBhIGhvc3QgaXMgcmVtb3ZlZCkgdGhlIGVudHJ5J3Ncblx0XHQvLyBwZW5kaW5nIHRpbWVyIG11c3QgYmUgY2FuY2VsbGVkIHNvIHdlIGRvbid0IGZpcmUgcmVjb25uZWN0IGF0dGVtcHRzXG5cdFx0Ly8gYWdhaW5zdCB0b3JuLWRvd24gc2VydmljZXMuXG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbmV3IFNTSFJlY29ubmVjdFN0YXRlKCk7XG5cdFx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdFx0c3RhdGUuc2NoZWR1bGVSZXRyeSgxMDAwLCAoKSA9PiBmaXJlZCsrKTtcblx0XHRcdHN0YXRlLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldEZvclJlc3VtZSBjbGVhcnMgdGhlIHRpbWVyIGFuZCB6ZXJvcyBhdHRlbXB0cy9wYXVzZWQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIG1heFRhc2tDb3VudDogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RvcmUuYWRkKG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpKTtcblx0XHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0XHRzdGF0ZS5hdHRlbXB0cyA9IDc7XG5cdFx0XHRzdGF0ZS5wYXVzZWQgPSB0cnVlO1xuXHRcdFx0c3RhdGUuc2NoZWR1bGVSZXRyeSgxMDAwLCAoKSA9PiBmaXJlZCsrKTtcblxuXHRcdFx0c3RhdGUucmVzZXRGb3JSZXN1bWUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5hdHRlbXB0cywgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUucGF1c2VkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaGFzUGVuZGluZ1RpbWVyLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMjAwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIDAsICdwZW5kaW5nIHJldHJ5IG11c3QgYmUgY2FuY2VsbGVkIGJ5IHJlc2V0Rm9yUmVzdW1lJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdzaG91bGRQYXVzZVNTSFJlY29ubmVjdEFmdGVyRmFpbHVyZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGF1c2VzIHJlY29ubmVjdCBhZnRlciBjYW5jZWxsYXRpb24gYnV0IG5vdCBhZnRlciByZWd1bGFyIGZhaWx1cmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuY2VsbGF0aW9uOiBzaG91bGRQYXVzZVNTSFJlY29ubmVjdEFmdGVyRmFpbHVyZShuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSksXG5cdFx0XHRyZWd1bGFyRXJyb3I6IHNob3VsZFBhdXNlU1NIUmVjb25uZWN0QWZ0ZXJGYWlsdXJlKG5ldyBFcnJvcignYm9vbScpKSxcblx0XHR9LCB7XG5cdFx0XHRjYW5jZWxsYXRpb246IHRydWUsXG5cdFx0XHRyZWd1bGFyRXJyb3I6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZGlzY29ubmVjdFNTSEVudHJ5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlU1NIQ29uZmlnQ29ubmVjdGlvbihvdmVycmlkZXM6IFBhcnRpYWw8SVJlbW90ZUFnZW50SG9zdFNTSENvbm5lY3Rpb24+ID0ge30pOiBJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0c3NoQ29uZmlnSG9zdDogJ215c2VydmVyJyxcblx0XHRcdGhvc3ROYW1lOiAnbXlzZXJ2ZXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZW1vdmVzIHRoZSBlbnRyeSBmcm9tIGNvbmZpZ3VyZWQgc3RvcmFnZSBCRUZPUkUgdGVhcmluZyBkb3duIHRoZSBTU0ggdHVubmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZ3VhcmQgZm9yIHRoZSBYLWJ1dHRvbiBwaWNrZXIgZml4LiBgX3NzaFNlcnZpY2UuZGlzY29ubmVjdGBcblx0XHQvLyBmaXJlcyBgb25EaWRDaGFuZ2VDb25uZWN0aW9uc2Agc3luY2hyb25vdXNseSwgd2hpY2ggdGhlIGNvbnRyaWJ1dGlvblxuXHRcdC8vIHRyYW5zbGF0ZXMgaW50byBgX3JlY29uY2lsZWAgXHUyMTkyIGBfcmVjb25uZWN0U1NIRW50cmllc2AuIElmIHRoZSBlbnRyeVxuXHRcdC8vIGlzIHN0aWxsIGluIGNvbmZpZ3VyZWQgc3RvcmFnZSBhdCB0aGF0IHBvaW50LCB0aGUgYXV0by1yZWNvbm5lY3Rcblx0XHQvLyBwYXRoIGltbWVkaWF0ZWx5IHJlY29ubmVjdHMgdGhlIGhvc3Qgd2UganVzdCB0b2xkIGl0IHRvIGRpc2Nvbm5lY3Rcblx0XHQvLyAoYW5kIG9uIHRoZSBuZXh0IHdpbmRvdyByZWxvYWQsIHRoZSBwZXJzaXN0ZWQgZW50cnkgcmVjb25uZWN0cyB0b28pLlxuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBtYWtlU1NIQ29uZmlnQ29ubmVjdGlvbigpO1xuXG5cdFx0Ly8gQmxvY2sgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0IHNvIHdlIGNhbiBwcm92ZSBkaXNjb25uZWN0IHdhaXRzIGZvciBpdC5cblx0XHRjb25zdCByZW1vdmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgcmVtb3RlQWdlbnRIb3N0U2VydmljZSA9IHtcblx0XHRcdHJlbW92ZVJlbW90ZUFnZW50SG9zdDogYXN5bmMgKGFkZHJlc3M6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGByZW1vdmU6JHthZGRyZXNzfWApO1xuXHRcdFx0XHRhd2FpdCByZW1vdmVkLnA7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3NoU2VydmljZSA9IHtcblx0XHRcdGRpc2Nvbm5lY3Q6IGFzeW5jIChrZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKGBzc2g6JHtrZXl9YCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBwZW5kaW5nID0gZGlzY29ubmVjdFNTSEVudHJ5KGNvbm5lY3Rpb24sIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHNzaFNlcnZpY2UpO1xuXG5cdFx0Ly8gR2l2ZSBtaWNyb3Rhc2tzIGEgY2hhbmNlIHRvIGRyYWluLiBzc2ggZGlzY29ubmVjdCBtdXN0IE5PVCBoYXZlIHJ1biB5ZXRcblx0XHQvLyBiZWNhdXNlIHJlbW92ZVJlbW90ZUFnZW50SG9zdCBpcyBzdGlsbCBwZW5kaW5nLlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydyZW1vdmU6bG9jYWxob3N0OjQzMjEnXSk7XG5cblx0XHRyZW1vdmVkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgcGVuZGluZztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsncmVtb3ZlOmxvY2FsaG9zdDo0MzIxJywgJ3NzaDpzc2g6bXlzZXJ2ZXInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgc3NoQ29uZmlnSG9zdC1iYXNlZCBrZXkgd2hlbiBzc2hDb25maWdIb3N0IGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBkaXNjb25uZWN0U1NIRW50cnkoXG5cdFx0XHRtYWtlU1NIQ29uZmlnQ29ubmVjdGlvbih7IHNzaENvbmZpZ0hvc3Q6ICdteXNlcnZlcicgfSksXG5cdFx0XHR7IHJlbW92ZVJlbW90ZUFnZW50SG9zdDogYXN5bmMgKCkgPT4geyAvKiBub29wICovIH0gfSxcblx0XHRcdHsgZGlzY29ubmVjdDogYXN5bmMgKGtleTogc3RyaW5nKSA9PiB7IGNhbGxzLnB1c2goa2V5KTsgfSB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWydzc2g6bXlzZXJ2ZXInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdXNlckBob3N0OnBvcnQga2V5IHdoZW4gc3NoQ29uZmlnSG9zdCBpcyBub3Qgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGF3YWl0IGRpc2Nvbm5lY3RTU0hFbnRyeShcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCxcblx0XHRcdFx0YWRkcmVzczogJ2xvY2FsaG9zdDo0MzIxJyxcblx0XHRcdFx0aG9zdE5hbWU6ICdteXNlcnZlci5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHVzZXI6ICdtZScsXG5cdFx0XHRcdHBvcnQ6IDIyMjIsXG5cdFx0XHR9LFxuXHRcdFx0eyByZW1vdmVSZW1vdGVBZ2VudEhvc3Q6IGFzeW5jICgpID0+IHsgLyogbm9vcCAqLyB9IH0sXG5cdFx0XHR7IGRpc2Nvbm5lY3Q6IGFzeW5jIChrZXk6IHN0cmluZykgPT4geyBjYWxscy5wdXNoKGtleSk7IH0gfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnbWVAbXlzZXJ2ZXIuZXhhbXBsZS5jb206MjIyMiddKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3NzaENvbm5lY3Rpb25LZXknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgdGhlIGtleXMgdGhlIFNTSCBzZXJ2aWNlIHN0b3JlcyBjb25uZWN0aW9ucyB1bmRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbmZpZ0hvc3Q6IHNzaENvbm5lY3Rpb25LZXkoe1xuXHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRzc2hDb25maWdIb3N0OiAnbXlzZXJ2ZXInLFxuXHRcdFx0XHRob3N0TmFtZTogJ2lnbm9yZWQnLFxuXHRcdFx0fSksXG5cdFx0XHR1c2VySG9zdFBvcnQ6IHNzaENvbm5lY3Rpb25LZXkoe1xuXHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRob3N0TmFtZTogJ215c2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0dXNlcjogJ21lJyxcblx0XHRcdFx0cG9ydDogMjIyMixcblx0XHRcdH0pLFxuXHRcdFx0aG9zdE9ubHk6IHNzaENvbm5lY3Rpb25LZXkoe1xuXHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NILFxuXHRcdFx0XHRhZGRyZXNzOiAnbG9jYWxob3N0OjQzMjEnLFxuXHRcdFx0XHRob3N0TmFtZTogJ215c2VydmVyLmV4YW1wbGUuY29tJyxcblx0XHRcdH0pLFxuXHRcdH0sIHtcblx0XHRcdGNvbmZpZ0hvc3Q6ICdzc2g6bXlzZXJ2ZXInLFxuXHRcdFx0dXNlckhvc3RQb3J0OiAnbWVAbXlzZXJ2ZXIuZXhhbXBsZS5jb206MjIyMicsXG5cdFx0XHRob3N0T25seTogJ215c2VydmVyLmV4YW1wbGUuY29tQG15c2VydmVyLmV4YW1wbGUuY29tOjIyJyxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQXdDLGdDQUFnQztBQUN4RSxTQUFTLG9CQUFvQixxQ0FBcUMsa0JBQWtCLHlCQUF5QjtBQUU3RyxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxXQUFPLG1CQUFtQixFQUFFLGVBQWUsTUFBTSxjQUFjLElBQU8sR0FBRyxZQUFZO0FBQ3BGLFlBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxrQkFBa0IsQ0FBQztBQUMvQyxVQUFJLFFBQVE7QUFDWixZQUFNLGNBQWMsS0FBTSxNQUFNLE9BQU87QUFFdkMsYUFBTyxZQUFZLE1BQU0saUJBQWlCLElBQUk7QUFDOUMsWUFBTSxRQUFR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
