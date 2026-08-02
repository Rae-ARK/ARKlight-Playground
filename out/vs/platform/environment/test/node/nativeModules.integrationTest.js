import assert from "assert";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { flakySuite } from "../../../../base/test/common/testUtils.js";
function testErrorMessage(module) {
  return `Unable to load "${module}" dependency. It was probably not compiled for the right operating system architecture or had missing build tools.`;
}
flakySuite("Native Modules (all platforms)", () => {
  (isMacintosh ? test.skip : test)("kerberos", async () => {
    const { default: kerberos } = await import("kerberos");
    assert.ok(typeof kerberos.initializeClient === "function", testErrorMessage("kerberos"));
  });
  test("yauzl", async () => {
    const { default: yauzl } = await import("yauzl");
    assert.ok(typeof yauzl.ZipFile === "function", testErrorMessage("yauzl"));
  });
  test("yazl", async () => {
    const { default: yazl } = await import("yazl");
    assert.ok(typeof yazl.ZipFile === "function", testErrorMessage("yazl"));
  });
  test("chrome-remote-interface", async () => {
    const { default: cdp } = await import("chrome-remote-interface");
    assert.ok(typeof cdp === "function", testErrorMessage("chrome-remote-interface"));
  });
  test("native-is-elevated", async () => {
    const { default: isElevated } = await import("native-is-elevated");
    assert.ok(typeof isElevated === "function", testErrorMessage("native-is-elevated "));
    const result = isElevated();
    assert.ok(typeof result === "boolean", testErrorMessage("native-is-elevated"));
  });
  test("native-keymap", async () => {
    const keyMap = await import("native-keymap");
    assert.ok(typeof keyMap.onDidChangeKeyboardLayout === "function", testErrorMessage("native-keymap"));
    assert.ok(typeof keyMap.getCurrentKeyboardLayout === "function", testErrorMessage("native-keymap"));
    const result = keyMap.getCurrentKeyboardLayout();
    assert.ok(result, testErrorMessage("native-keymap"));
  });
  test("@vscode/native-watchdog", async () => {
    const watchDog = await import("@vscode/native-watchdog");
    assert.ok(typeof watchDog.start === "function", testErrorMessage("@vscode/native-watchdog"));
  });
  test("@vscode/sudo-prompt", async () => {
    const prompt = await import("@vscode/sudo-prompt");
    assert.ok(typeof prompt.exec === "function", testErrorMessage("@vscode/sudo-prompt"));
  });
  test("@vscode/policy-watcher", async () => {
    const watcher = await import("@vscode/policy-watcher");
    assert.ok(typeof watcher.createWatcher === "function", testErrorMessage("@vscode/policy-watcher"));
  });
  test("node-pty", async () => {
    const nodePty = await import("node-pty");
    assert.ok(typeof nodePty.spawn === "function", testErrorMessage("node-pty"));
  });
  test("@vscode/spdlog", async () => {
    const spdlog = await import("@vscode/spdlog");
    assert.ok(typeof spdlog.createRotatingLogger === "function", testErrorMessage("@vscode/spdlog"));
    assert.ok(typeof spdlog.version === "number", testErrorMessage("@vscode/spdlog"));
  });
  test("@parcel/watcher", async () => {
    const parcelWatcher = await import("@parcel/watcher");
    assert.ok(typeof parcelWatcher.subscribe === "function", testErrorMessage("@parcel/watcher"));
  });
  test("@vscode/deviceid", async () => {
    const deviceIdPackage = await import("@vscode/deviceid");
    assert.ok(typeof deviceIdPackage.getDeviceId === "function", testErrorMessage("@vscode/deviceid"));
  });
  test("@vscode/ripgrep-universal", async () => {
    const ripgrep = await import("@vscode/ripgrep-universal");
    assert.ok(typeof ripgrep.rgPath === "string", testErrorMessage("@vscode/ripgrep-universal"));
  });
  test("vscode-regexpp", async () => {
    const regexpp = await import("vscode-regexpp");
    assert.ok(typeof regexpp.RegExpParser === "function", testErrorMessage("vscode-regexpp"));
  });
  test("@vscode/sqlite3", async () => {
    const { default: sqlite3 } = await import("@vscode/sqlite3");
    assert.ok(typeof sqlite3.Database === "function", testErrorMessage("@vscode/sqlite3"));
  });
  test("http-proxy-agent", async () => {
    const { default: mod } = await import("http-proxy-agent");
    assert.ok(typeof mod.HttpProxyAgent === "function", testErrorMessage("http-proxy-agent"));
  });
  test("https-proxy-agent", async () => {
    const { default: mod } = await import("https-proxy-agent");
    assert.ok(typeof mod.HttpsProxyAgent === "function", testErrorMessage("https-proxy-agent"));
  });
  test("@vscode/proxy-agent", async () => {
    const proxyAgent = await import("@vscode/proxy-agent");
    const windowsCerts = await proxyAgent.loadSystemCertificates({
      loadSystemCertificatesFromNode: () => void 0,
      log: {
        trace: () => {
        },
        debug: () => {
        },
        info: () => {
        },
        warn: () => {
        },
        error: () => {
        }
      }
    });
    assert.ok(windowsCerts.length > 0, testErrorMessage("@vscode/proxy-agent"));
  });
  test("@vscode/os-proxy-resolver", async () => {
    const proxyResolver = await import("@vscode/os-proxy-resolver");
    const proxies = await proxyResolver.resolveProxy("https://example.com/");
    const config = await proxyResolver.readProxyConfig();
    assert.deepStrictEqual({
      resolveProxy: proxies.length > 0,
      readProxyConfig: typeof config.autoDetect === "boolean"
    }, {
      resolveProxy: true,
      readProxyConfig: true
    }, testErrorMessage("@vscode/os-proxy-resolver"));
  });
});
(!isWindows ? suite.skip : suite)("Native Modules (Windows)", () => {
  test("@vscode/windows-mutex", async () => {
    const mutex = await import("@vscode/windows-mutex");
    assert.ok(mutex && typeof mutex.isActive === "function", testErrorMessage("@vscode/windows-mutex"));
    assert.ok(typeof mutex.isActive === "function", testErrorMessage("@vscode/windows-mutex"));
    assert.ok(typeof mutex.Mutex === "function", testErrorMessage("@vscode/windows-mutex"));
  });
  test("windows-foreground-love", async () => {
    const foregroundLove = await import("windows-foreground-love");
    assert.ok(typeof foregroundLove.allowSetForegroundWindow === "function", testErrorMessage("windows-foreground-love"));
    const result = foregroundLove.allowSetForegroundWindow(process.pid);
    assert.ok(typeof result === "boolean", testErrorMessage("windows-foreground-love"));
  });
  test("@vscode/windows-process-tree", async () => {
    const processTree = await import("@vscode/windows-process-tree");
    assert.ok(typeof processTree.getProcessTree === "function", testErrorMessage("@vscode/windows-process-tree"));
    return new Promise((resolve, reject) => {
      processTree.getProcessTree(process.pid, (tree) => {
        if (tree) {
          resolve();
        } else {
          reject(new Error(testErrorMessage("@vscode/windows-process-tree")));
        }
      });
    });
  });
  test("@vscode/windows-registry", async () => {
    const windowsRegistry = await import("@vscode/windows-registry");
    assert.ok(typeof windowsRegistry.GetStringRegKey === "function", testErrorMessage("@vscode/windows-registry"));
    const result = windowsRegistry.GetStringRegKey("HKEY_LOCAL_MACHINE", "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "EditionID");
    assert.ok(typeof result === "string" || typeof result === "undefined", testErrorMessage("@vscode/windows-registry"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Vudmlyb25tZW50L3Rlc3Qvbm9kZS9uYXRpdmVNb2R1bGVzLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBmbGFreVN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90ZXN0VXRpbHMuanMnO1xuXG5mdW5jdGlvbiB0ZXN0RXJyb3JNZXNzYWdlKG1vZHVsZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBVbmFibGUgdG8gbG9hZCBcIiR7bW9kdWxlfVwiIGRlcGVuZGVuY3kuIEl0IHdhcyBwcm9iYWJseSBub3QgY29tcGlsZWQgZm9yIHRoZSByaWdodCBvcGVyYXRpbmcgc3lzdGVtIGFyY2hpdGVjdHVyZSBvciBoYWQgbWlzc2luZyBidWlsZCB0b29scy5gO1xufVxuXG5mbGFreVN1aXRlKCdOYXRpdmUgTW9kdWxlcyAoYWxsIHBsYXRmb3JtcyknLCAoKSA9PiB7XG5cblx0KGlzTWFjaW50b3NoID8gdGVzdC5za2lwIDogdGVzdCkoJ2tlcmJlcm9zJywgYXN5bmMgKCkgPT4geyAvLyBTb21laG93IGZhaWxzIG9uIG1hY09TIEFSTT9cblx0XHRjb25zdCB7IGRlZmF1bHQ6IGtlcmJlcm9zIH0gPSBhd2FpdCBpbXBvcnQoJ2tlcmJlcm9zJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBrZXJiZXJvcy5pbml0aWFsaXplQ2xpZW50ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdrZXJiZXJvcycpKTtcblx0fSk7XG5cblx0dGVzdCgneWF1emwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWZhdWx0OiB5YXV6bCB9ID0gYXdhaXQgaW1wb3J0KCd5YXV6bCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgeWF1emwuWmlwRmlsZSA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgneWF1emwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3lhemwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWZhdWx0OiB5YXpsIH0gPSBhd2FpdCBpbXBvcnQoJ3lhemwnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHlhemwuWmlwRmlsZSA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgneWF6bCcpKTtcblx0fSk7XG5cblx0dGVzdCgnY2hyb21lLXJlbW90ZS1pbnRlcmZhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWZhdWx0OiBjZHAgfSA9IGF3YWl0IGltcG9ydCgnY2hyb21lLXJlbW90ZS1pbnRlcmZhY2UnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGNkcCA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnY2hyb21lLXJlbW90ZS1pbnRlcmZhY2UnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdGl2ZS1pcy1lbGV2YXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IGlzRWxldmF0ZWQgfSA9IGF3YWl0IGltcG9ydCgnbmF0aXZlLWlzLWVsZXZhdGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBpc0VsZXZhdGVkID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCduYXRpdmUtaXMtZWxldmF0ZWQgJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gaXNFbGV2YXRlZCgpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicsIHRlc3RFcnJvck1lc3NhZ2UoJ25hdGl2ZS1pcy1lbGV2YXRlZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnbmF0aXZlLWtleW1hcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBrZXlNYXAgPSBhd2FpdCBpbXBvcnQoJ25hdGl2ZS1rZXltYXAnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGtleU1hcC5vbkRpZENoYW5nZUtleWJvYXJkTGF5b3V0ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCduYXRpdmUta2V5bWFwJykpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Yga2V5TWFwLmdldEN1cnJlbnRLZXlib2FyZExheW91dCA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnbmF0aXZlLWtleW1hcCcpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGtleU1hcC5nZXRDdXJyZW50S2V5Ym9hcmRMYXlvdXQoKTtcblx0XHRhc3NlcnQub2socmVzdWx0LCB0ZXN0RXJyb3JNZXNzYWdlKCduYXRpdmUta2V5bWFwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL25hdGl2ZS13YXRjaGRvZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3YXRjaERvZyA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9uYXRpdmUtd2F0Y2hkb2cnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHdhdGNoRG9nLnN0YXJ0ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL25hdGl2ZS13YXRjaGRvZycpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS9zdWRvLXByb21wdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9tcHQgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvc3Vkby1wcm9tcHQnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHByb21wdC5leGVjID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3N1ZG8tcHJvbXB0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3BvbGljeS13YXRjaGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdhdGNoZXIgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvcG9saWN5LXdhdGNoZXInKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHdhdGNoZXIuY3JlYXRlV2F0Y2hlciA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS9wb2xpY3ktd2F0Y2hlcicpKTtcblx0fSk7XG5cblx0dGVzdCgnbm9kZS1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZVB0eSA9IGF3YWl0IGltcG9ydCgnbm9kZS1wdHknKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIG5vZGVQdHkuc3Bhd24gPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ25vZGUtcHR5JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL3NwZGxvZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzcGRsb2cgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvc3BkbG9nJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzcGRsb2cuY3JlYXRlUm90YXRpbmdMb2dnZXIgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvc3BkbG9nJykpO1xuXHRcdGFzc2VydC5vayh0eXBlb2Ygc3BkbG9nLnZlcnNpb24gPT09ICdudW1iZXInLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3NwZGxvZycpKTtcblx0fSk7XG5cblx0dGVzdCgnQHBhcmNlbC93YXRjaGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmNlbFdhdGNoZXIgPSBhd2FpdCBpbXBvcnQoJ0BwYXJjZWwvd2F0Y2hlcicpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgcGFyY2VsV2F0Y2hlci5zdWJzY3JpYmUgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0BwYXJjZWwvd2F0Y2hlcicpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS9kZXZpY2VpZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkZXZpY2VJZFBhY2thZ2UgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvZGV2aWNlaWQnKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIGRldmljZUlkUGFja2FnZS5nZXREZXZpY2VJZCA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS9kZXZpY2VpZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS9yaXBncmVwLXVuaXZlcnNhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByaXBncmVwID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3JpcGdyZXAtdW5pdmVyc2FsJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiByaXBncmVwLnJnUGF0aCA9PT0gJ3N0cmluZycsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvcmlwZ3JlcC11bml2ZXJzYWwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZzY29kZS1yZWdleHBwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2V4cHAgPSBhd2FpdCBpbXBvcnQoJ3ZzY29kZS1yZWdleHBwJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiByZWdleHBwLlJlZ0V4cFBhcnNlciA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgndnNjb2RlLXJlZ2V4cHAnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvc3FsaXRlMycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IHNxbGl0ZTMgfSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9zcWxpdGUzJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBzcWxpdGUzLkRhdGFiYXNlID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3NxbGl0ZTMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2h0dHAtcHJveHktYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBkZWZhdWx0OiBtb2QgfSA9IGF3YWl0IGltcG9ydCgnaHR0cC1wcm94eS1hZ2VudCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbW9kLkh0dHBQcm94eUFnZW50ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdodHRwLXByb3h5LWFnZW50JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdodHRwcy1wcm94eS1hZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGRlZmF1bHQ6IG1vZCB9ID0gYXdhaXQgaW1wb3J0KCdodHRwcy1wcm94eS1hZ2VudCcpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbW9kLkh0dHBzUHJveHlBZ2VudCA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnaHR0cHMtcHJveHktYWdlbnQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0B2c2NvZGUvcHJveHktYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlBZ2VudCA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9wcm94eS1hZ2VudCcpO1xuXHRcdC8vIFRoaXMgY2FsbCB3aWxsIGxvYWQgYEB2c2NvZGUvcHJveHktYWdlbnRgIHdoaWNoIGlzIGEgbmF0aXZlIG1vZHVsZSB0aGF0IHdlIHdhbnQgdG8gdGVzdCBvbiBXaW5kb3dzXG5cdFx0Y29uc3Qgd2luZG93c0NlcnRzID0gYXdhaXQgcHJveHlBZ2VudC5sb2FkU3lzdGVtQ2VydGlmaWNhdGVzKHtcblx0XHRcdGxvYWRTeXN0ZW1DZXJ0aWZpY2F0ZXNGcm9tTm9kZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0bG9nOiB7XG5cdFx0XHRcdHRyYWNlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlYnVnOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGluZm86ICgpID0+IHsgfSxcblx0XHRcdFx0d2FybjogKCkgPT4geyB9LFxuXHRcdFx0XHRlcnJvcjogKCkgPT4geyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKHdpbmRvd3NDZXJ0cy5sZW5ndGggPiAwLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3Byb3h5LWFnZW50JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdAdnNjb2RlL29zLXByb3h5LXJlc29sdmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3h5UmVzb2x2ZXIgPSBhd2FpdCBpbXBvcnQoJ0B2c2NvZGUvb3MtcHJveHktcmVzb2x2ZXInKTtcblx0XHRjb25zdCBwcm94aWVzID0gYXdhaXQgcHJveHlSZXNvbHZlci5yZXNvbHZlUHJveHkoJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgcHJveHlSZXNvbHZlci5yZWFkUHJveHlDb25maWcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc29sdmVQcm94eTogcHJveGllcy5sZW5ndGggPiAwLFxuXHRcdFx0cmVhZFByb3h5Q29uZmlnOiB0eXBlb2YgY29uZmlnLmF1dG9EZXRlY3QgPT09ICdib29sZWFuJyxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlUHJveHk6IHRydWUsXG5cdFx0XHRyZWFkUHJveHlDb25maWc6IHRydWUsXG5cdFx0fSwgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS9vcy1wcm94eS1yZXNvbHZlcicpKTtcblx0fSk7XG59KTtcblxuKCFpc1dpbmRvd3MgPyBzdWl0ZS5za2lwIDogc3VpdGUpKCdOYXRpdmUgTW9kdWxlcyAoV2luZG93cyknLCAoKSA9PiB7XG5cblx0dGVzdCgnQHZzY29kZS93aW5kb3dzLW11dGV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG11dGV4ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKTtcblx0XHRhc3NlcnQub2sobXV0ZXggJiYgdHlwZW9mIG11dGV4LmlzQWN0aXZlID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3dpbmRvd3MtbXV0ZXgnKSk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBtdXRleC5pc0FjdGl2ZSA9PT0gJ2Z1bmN0aW9uJywgdGVzdEVycm9yTWVzc2FnZSgnQHZzY29kZS93aW5kb3dzLW11dGV4JykpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgbXV0ZXguTXV0ZXggPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1tdXRleCcpKTtcblx0fSk7XG5cblx0dGVzdCgnd2luZG93cy1mb3JlZ3JvdW5kLWxvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZExvdmUgPSBhd2FpdCBpbXBvcnQoJ3dpbmRvd3MtZm9yZWdyb3VuZC1sb3ZlJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiBmb3JlZ3JvdW5kTG92ZS5hbGxvd1NldEZvcmVncm91bmRXaW5kb3cgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ3dpbmRvd3MtZm9yZWdyb3VuZC1sb3ZlJykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gZm9yZWdyb3VuZExvdmUuYWxsb3dTZXRGb3JlZ3JvdW5kV2luZG93KHByb2Nlc3MucGlkKTtcblx0XHRhc3NlcnQub2sodHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nLCB0ZXN0RXJyb3JNZXNzYWdlKCd3aW5kb3dzLWZvcmVncm91bmQtbG92ZScpKTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9jZXNzVHJlZSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZScpO1xuXHRcdGFzc2VydC5vayh0eXBlb2YgcHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc1RyZWUgPT09ICdmdW5jdGlvbicsIHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1wcm9jZXNzLXRyZWUnKSk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0cHJvY2Vzc1RyZWUuZ2V0UHJvY2Vzc1RyZWUocHJvY2Vzcy5waWQsIHRyZWUgPT4ge1xuXHRcdFx0XHRpZiAodHJlZSkge1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKHRlc3RFcnJvck1lc3NhZ2UoJ0B2c2NvZGUvd2luZG93cy1wcm9jZXNzLXRyZWUnKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQHZzY29kZS93aW5kb3dzLXJlZ2lzdHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdpbmRvd3NSZWdpc3RyeSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS93aW5kb3dzLXJlZ2lzdHJ5Jyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiB3aW5kb3dzUmVnaXN0cnkuR2V0U3RyaW5nUmVnS2V5ID09PSAnZnVuY3Rpb24nLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3dpbmRvd3MtcmVnaXN0cnknKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB3aW5kb3dzUmVnaXN0cnkuR2V0U3RyaW5nUmVnS2V5KCdIS0VZX0xPQ0FMX01BQ0hJTkUnLCAnU09GVFdBUkVcXFxcTWljcm9zb2Z0XFxcXFdpbmRvd3MgTlRcXFxcQ3VycmVudFZlcnNpb24nLCAnRWRpdGlvbklEJyk7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiByZXN1bHQgPT09ICd1bmRlZmluZWQnLCB0ZXN0RXJyb3JNZXNzYWdlKCdAdnNjb2RlL3dpbmRvd3MtcmVnaXN0cnknKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhLGlCQUFpQjtBQUN2QyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGlCQUFpQixRQUF3QjtBQUNqRCxTQUFPLG1CQUFtQixNQUFNO0FBQ2pDO0FBRUEsV0FBVyxrQ0FBa0MsTUFBTTtBQUVsRCxHQUFDLGNBQWMsS0FBSyxPQUFPLE1BQU0sWUFBWSxZQUFZO0FBQ3hELFVBQU0sRUFBRSxTQUFTLFNBQVMsSUFBSSxNQUFNLE9BQU8sVUFBVTtBQUNyRCxXQUFPLEdBQUcsT0FBTyxTQUFTLHFCQUFxQixZQUFZLGlCQUFpQixVQUFVLENBQUM7QUFBQSxFQUN4RixDQUFDO0FBRUQsT0FBSyxTQUFTLFlBQVk7QUFDekIsVUFBTSxFQUFFLFNBQVMsTUFBTSxJQUFJLE1BQU0sT0FBTyxPQUFPO0FBQy9DLFdBQU8sR0FBRyxPQUFPLE1BQU0sWUFBWSxZQUFZLGlCQUFpQixPQUFPLENBQUM7QUFBQSxFQUN6RSxDQUFDO0FBRUQsT0FBSyxRQUFRLFlBQVk7QUFDeEIsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLE1BQU0sT0FBTyxNQUFNO0FBQzdDLFdBQU8sR0FBRyxPQUFPLEtBQUssWUFBWSxZQUFZLGlCQUFpQixNQUFNLENBQUM7QUFBQSxFQUN2RSxDQUFDO0FBRUQsT0FBSywyQkFBMkIsWUFBWTtBQUMzQyxVQUFNLEVBQUUsU0FBUyxJQUFJLElBQUksTUFBTSxPQUFPLHlCQUF5QjtBQUMvRCxXQUFPLEdBQUcsT0FBTyxRQUFRLFlBQVksaUJBQWlCLHlCQUF5QixDQUFDO0FBQUEsRUFDakYsQ0FBQztBQUVELE9B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
