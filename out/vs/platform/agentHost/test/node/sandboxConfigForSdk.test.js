import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentHostSandboxKey } from "../../common/sandboxConfigSchema.js";
import { AgentSandboxEnabledValue } from "../../../sandbox/common/settings.js";
import { buildSandboxConfigForSdk } from "../../node/copilot/sandboxConfigForSdk.js";
function sandbox(platform, enabled, fs, hosts) {
  if (!enabled && !fs && !hosts) {
    return void 0;
  }
  const cfg = {};
  if (enabled !== void 0) {
    cfg[AgentHostSandboxKey.Enabled] = enabled;
  }
  if (fs) {
    const fsKey = platform === "win32" ? AgentHostSandboxKey.WindowsFileSystem : platform === "darwin" ? AgentHostSandboxKey.MacFileSystem : AgentHostSandboxKey.LinuxFileSystem;
    cfg[fsKey] = fs;
  }
  if (hosts?.allowedHosts?.length) {
    cfg[AgentHostSandboxKey.AllowedNetworkDomains] = [...hosts.allowedHosts];
  }
  if (hosts?.blockedHosts?.length) {
    cfg[AgentHostSandboxKey.DeniedNetworkDomains] = [...hosts.blockedHosts];
  }
  return cfg;
}
suite("buildSandboxConfigForSdk", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("enablement", () => {
    test("returns undefined when no setting is set", () => {
      assert.strictEqual(buildSandboxConfigForSdk("darwin", void 0), void 0);
      assert.strictEqual(buildSandboxConfigForSdk("win32", void 0), void 0);
    });
    test("returns undefined when the bag is empty", () => {
      assert.strictEqual(buildSandboxConfigForSdk("darwin", {}), void 0);
      assert.strictEqual(buildSandboxConfigForSdk("win32", {}), void 0);
    });
    test("returns undefined for `off`", () => {
      assert.strictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.Off)), void 0);
      assert.strictEqual(buildSandboxConfigForSdk("win32", sandbox("win32", AgentSandboxEnabledValue.Off)), void 0);
    });
    test("enables sandbox for `on` on non-Windows platforms", () => {
      for (const platform of ["darwin", "linux"]) {
        assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On)), {
          enabled: true,
          allowBypass: true,
          userPolicy: { filesystem: {}, network: { allowOutbound: false } }
        });
      }
    });
    test("enables sandbox and outbound network for `allowNetwork` on non-Windows platforms", () => {
      for (const platform of ["darwin", "linux"]) {
        assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.AllowNetwork)), {
          enabled: true,
          allowBypass: true,
          userPolicy: { filesystem: {}, network: { allowOutbound: true } }
        });
      }
    });
    test("ignores the enable settings on Windows", () => {
      assert.strictEqual(buildSandboxConfigForSdk("win32", sandbox("win32", AgentSandboxEnabledValue.On)), void 0);
      assert.strictEqual(buildSandboxConfigForSdk("win32", sandbox("win32", AgentSandboxEnabledValue.AllowNetwork)), void 0);
    });
  });
  suite("filesystem policy", () => {
    test("selects the OS-specific slice from the per-OS filesystem keys", () => {
      const cfg = {
        [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
        [AgentHostSandboxKey.LinuxFileSystem]: { allowWrite: ["/linux"] },
        [AgentHostSandboxKey.MacFileSystem]: { allowWrite: ["/mac"] }
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("linux", cfg)?.userPolicy.filesystem, { readwritePaths: ["/linux"] });
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", cfg)?.userPolicy.filesystem, { readwritePaths: ["/mac"] });
      assert.strictEqual(buildSandboxConfigForSdk("win32", cfg), void 0);
    });
    test("maps each setting to the corresponding SDK list", () => {
      const fs = {
        allowWrite: ["/work"],
        allowRead: ["/read"],
        denyWrite: ["/readonly"],
        denyRead: ["/secret"]
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, fs)), {
        enabled: true,
        allowBypass: true,
        userPolicy: {
          filesystem: {
            readwritePaths: ["/work"],
            readonlyPaths: ["/readonly", "/read"],
            deniedPaths: ["/secret"]
          },
          network: { allowOutbound: false }
        }
      });
    });
    test("omits filesystem lists that are empty", () => {
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, {})), {
        enabled: true,
        allowBypass: true,
        userPolicy: { filesystem: {}, network: { allowOutbound: false } }
      });
    });
    test("denyRead wins over every other setting for the same path", () => {
      const fs = {
        allowRead: ["/p"],
        allowWrite: ["/p"],
        denyWrite: ["/p"],
        denyRead: ["/p"]
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
        deniedPaths: ["/p"]
      });
    });
    test("denyWrite wins over allowWrite / allowRead for the same path", () => {
      const fs = {
        allowRead: ["/p"],
        allowWrite: ["/p"],
        denyWrite: ["/p"]
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
        readonlyPaths: ["/p"]
      });
    });
    test("allowWrite wins over allowRead for the same path", () => {
      const fs = {
        allowRead: ["/p"],
        allowWrite: ["/p"]
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
        readwritePaths: ["/p"]
      });
    });
    test("keeps distinct paths in their own lists when settings overlap on some paths", () => {
      const fs = {
        allowWrite: ["/work", "/shared"],
        denyWrite: ["/shared"]
      };
      assert.deepStrictEqual(buildSandboxConfigForSdk("darwin", sandbox("darwin", AgentSandboxEnabledValue.On, fs))?.userPolicy.filesystem, {
        readwritePaths: ["/work"],
        readonlyPaths: ["/shared"]
      });
    });
  });
  suite("network hosts", () => {
    test("drops host lists and keeps outbound closed when sandbox is `on` (host lists disabled on all platforms)", () => {
      for (const platform of ["darwin", "linux"]) {
        assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.On, void 0, { allowedHosts: ["github.com"], blockedHosts: ["evil.example"] }))?.userPolicy.network, {
          allowOutbound: false
        }, platform);
      }
    });
    test("ignores host lists when sandbox is `allowNetwork` (allow all)", () => {
      for (const platform of ["darwin", "linux"]) {
        assert.deepStrictEqual(buildSandboxConfigForSdk(platform, sandbox(platform, AgentSandboxEnabledValue.AllowNetwork, void 0, { allowedHosts: ["a.example"], blockedHosts: ["b.example"] }))?.userPolicy.network, {
          allowOutbound: true
        }, platform);
      }
    });
    test("ignores empty host lists", () => {
      assert.deepStrictEqual(buildSandboxConfigForSdk("linux", sandbox("linux", AgentSandboxEnabledValue.On, void 0, { allowedHosts: [], blockedHosts: [] }))?.userPolicy.network, {
        allowOutbound: false
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2FuZGJveENvbmZpZ0ZvclNkay50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94S2V5LCB0eXBlIElTYW5kYm94Q29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi9jb21tb24vc2FuZGJveENvbmZpZ1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBidWlsZFNhbmRib3hDb25maWdGb3JTZGssIHR5cGUgSUFnZW50U2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3NhbmRib3hDb25maWdGb3JTZGsuanMnO1xuXG4vKipcbiAqIEJ1aWxkIHRoZSBob3N0LXNpZGUgYHNhbmRib3hgIHJvb3QtY29uZmlnIGJhZyAodGhlIHNoYXBlIHRoZSB3b3JrYmVuY2hcbiAqIGZvcndhcmRlciBkaXNwYXRjaGVzIGluIGEgYFJvb3RDb25maWdDaGFuZ2VkYCBhY3Rpb24pIGZvciB0aGUgZ2l2ZW5cbiAqIGBlbmFibGVkYCBlbnVtICsgb3B0aW9uYWwgcGVyLU9TIGZpbGVzeXN0ZW0gcnVsZXMgYW5kIG5ldHdvcmsgaG9zdCBsaXN0cy5cbiAqXG4gKiBNaXJyb3JzIHRoZSBwZXItT1MgZGlzcGF0Y2ggaW4gdGhlIENvcGlsb3QgZXh0ZW5zaW9uJ3NcbiAqIGBidWlsZFNhbmRib3hDb25maWdGb3JDTElgIHRlc3RzIFx1MjAxNCB0aGUgU0RLIGhlbHBlciBjb25zdW1lcyB0aGUgc2FtZSBmaWVsZHNcbiAqIGJ1dCByZWNlaXZlcyB0aGVtIHZpYSB0aGUgaG9zdCByb290IGJhZyBpbnN0ZWFkIG9mIHRoZSBwZXItT1Mga2V5ZWRcbiAqIG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gc2FuZGJveChcblx0cGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybSxcblx0ZW5hYmxlZDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlIHwgdW5kZWZpbmVkLFxuXHRmcz86IElBZ2VudFNhbmRib3hGaWxlU3lzdGVtU2V0dGluZyxcblx0aG9zdHM/OiB7IGFsbG93ZWRIb3N0cz86IHJlYWRvbmx5IHN0cmluZ1tdOyBibG9ja2VkSG9zdHM/OiByZWFkb25seSBzdHJpbmdbXSB9LFxuKTogSVNhbmRib3hDb25maWdWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZW5hYmxlZCAmJiAhZnMgJiYgIWhvc3RzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjZmc6IElTYW5kYm94Q29uZmlnVmFsdWUgPSB7fTtcblx0aWYgKGVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNmZ1tBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdID0gZW5hYmxlZDtcblx0fVxuXHRpZiAoZnMpIHtcblx0XHRjb25zdCBmc0tleSA9IHBsYXRmb3JtID09PSAnd2luMzInXG5cdFx0XHQ/IEFnZW50SG9zdFNhbmRib3hLZXkuV2luZG93c0ZpbGVTeXN0ZW1cblx0XHRcdDogcGxhdGZvcm0gPT09ICdkYXJ3aW4nXG5cdFx0XHRcdD8gQWdlbnRIb3N0U2FuZGJveEtleS5NYWNGaWxlU3lzdGVtXG5cdFx0XHRcdDogQWdlbnRIb3N0U2FuZGJveEtleS5MaW51eEZpbGVTeXN0ZW07XG5cdFx0Y2ZnW2ZzS2V5XSA9IGZzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHR9XG5cdGlmIChob3N0cz8uYWxsb3dlZEhvc3RzPy5sZW5ndGgpIHtcblx0XHRjZmdbQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd2VkTmV0d29ya0RvbWFpbnNdID0gWy4uLmhvc3RzLmFsbG93ZWRIb3N0c107XG5cdH1cblx0aWYgKGhvc3RzPy5ibG9ja2VkSG9zdHM/Lmxlbmd0aCkge1xuXHRcdGNmZ1tBZ2VudEhvc3RTYW5kYm94S2V5LkRlbmllZE5ldHdvcmtEb21haW5zXSA9IFsuLi5ob3N0cy5ibG9ja2VkSG9zdHNdO1xuXHR9XG5cdHJldHVybiBjZmc7XG59XG5cbnN1aXRlKCdidWlsZFNhbmRib3hDb25maWdGb3JTZGsnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdlbmFibGVtZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gc2V0dGluZyBpcyBzZXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaygnd2luMzInLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiB0aGUgYmFnIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaygnZGFyd2luJywge30pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaygnd2luMzInLCB7fSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYG9mZmAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCBzYW5kYm94KCdkYXJ3aW4nLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCd3aW4zMicsIHNhbmRib3goJ3dpbjMyJywgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZikpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5hYmxlcyBzYW5kYm94IGZvciBgb25gIG9uIG5vbi1XaW5kb3dzIHBsYXRmb3JtcycsICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcGxhdGZvcm0gb2YgWydkYXJ3aW4nLCAnbGludXgnXSBhcyBjb25zdCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkayhwbGF0Zm9ybSwgc2FuZGJveChwbGF0Zm9ybSwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uKSksIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93QnlwYXNzOiB0cnVlLFxuXHRcdFx0XHRcdHVzZXJQb2xpY3k6IHsgZmlsZXN5c3RlbToge30sIG5ldHdvcms6IHsgYWxsb3dPdXRib3VuZDogZmFsc2UgfSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuYWJsZXMgc2FuZGJveCBhbmQgb3V0Ym91bmQgbmV0d29yayBmb3IgYGFsbG93TmV0d29ya2Agb24gbm9uLVdpbmRvd3MgcGxhdGZvcm1zJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwbGF0Zm9ybSBvZiBbJ2RhcndpbicsICdsaW51eCddIGFzIGNvbnN0KSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKHBsYXRmb3JtLCBzYW5kYm94KHBsYXRmb3JtLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrKSksIHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGFsbG93QnlwYXNzOiB0cnVlLFxuXHRcdFx0XHRcdHVzZXJQb2xpY3k6IHsgZmlsZXN5c3RlbToge30sIG5ldHdvcms6IHsgYWxsb3dPdXRib3VuZDogdHJ1ZSB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyB0aGUgZW5hYmxlIHNldHRpbmdzIG9uIFdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgc2FuZGJveCBpcyBub3Qgc3VwcG9ydGVkIG9uIFdpbmRvd3MsIHNvIHRoZSBlbmFibGUgc2V0dGluZ3MgYXJlIGlnbm9yZWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCd3aW4zMicsIHNhbmRib3goJ3dpbjMyJywgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCd3aW4zMicsIHNhbmRib3goJ3dpbjMyJywgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLkFsbG93TmV0d29yaykpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsZXN5c3RlbSBwb2xpY3knLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2VsZWN0cyB0aGUgT1Mtc3BlY2lmaWMgc2xpY2UgZnJvbSB0aGUgcGVyLU9TIGZpbGVzeXN0ZW0ga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNmZzogSVNhbmRib3hDb25maWdWYWx1ZSA9IHtcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuRW5hYmxlZF06IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbixcblx0XHRcdFx0W0FnZW50SG9zdFNhbmRib3hLZXkuTGludXhGaWxlU3lzdGVtXTogeyBhbGxvd1dyaXRlOiBbJy9saW51eCddIH0sXG5cdFx0XHRcdFtBZ2VudEhvc3RTYW5kYm94S2V5Lk1hY0ZpbGVTeXN0ZW1dOiB7IGFsbG93V3JpdGU6IFsnL21hYyddIH0sXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZFNhbmRib3hDb25maWdGb3JTZGsoJ2xpbnV4JywgY2ZnKT8udXNlclBvbGljeS5maWxlc3lzdGVtLCB7IHJlYWR3cml0ZVBhdGhzOiBbJy9saW51eCddIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZFNhbmRib3hDb25maWdGb3JTZGsoJ2RhcndpbicsIGNmZyk/LnVzZXJQb2xpY3kuZmlsZXN5c3RlbSwgeyByZWFkd3JpdGVQYXRoczogWycvbWFjJ10gfSk7XG5cdFx0XHQvLyBXaW5kb3dzIGlzIGlnbm9yZWQgZW50aXJlbHkuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCd3aW4zMicsIGNmZyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIGVhY2ggc2V0dGluZyB0byB0aGUgY29ycmVzcG9uZGluZyBTREsgbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZzOiBJQWdlbnRTYW5kYm94RmlsZVN5c3RlbVNldHRpbmcgPSB7XG5cdFx0XHRcdGFsbG93V3JpdGU6IFsnL3dvcmsnXSxcblx0XHRcdFx0YWxsb3dSZWFkOiBbJy9yZWFkJ10sXG5cdFx0XHRcdGRlbnlXcml0ZTogWycvcmVhZG9ubHknXSxcblx0XHRcdFx0ZGVueVJlYWQ6IFsnL3NlY3JldCddLFxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCBzYW5kYm94KCdkYXJ3aW4nLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIGZzKSksIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0YWxsb3dCeXBhc3M6IHRydWUsXG5cdFx0XHRcdHVzZXJQb2xpY3k6IHtcblx0XHRcdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdFx0XHRyZWFkd3JpdGVQYXRoczogWycvd29yayddLFxuXHRcdFx0XHRcdFx0cmVhZG9ubHlQYXRoczogWycvcmVhZG9ubHknLCAnL3JlYWQnXSxcblx0XHRcdFx0XHRcdGRlbmllZFBhdGhzOiBbJy9zZWNyZXQnXSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG5ldHdvcms6IHsgYWxsb3dPdXRib3VuZDogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgZmlsZXN5c3RlbSBsaXN0cyB0aGF0IGFyZSBlbXB0eScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCBzYW5kYm94KCdkYXJ3aW4nLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIHt9KSksIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0YWxsb3dCeXBhc3M6IHRydWUsXG5cdFx0XHRcdHVzZXJQb2xpY3k6IHsgZmlsZXN5c3RlbToge30sIG5ldHdvcms6IHsgYWxsb3dPdXRib3VuZDogZmFsc2UgfSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW55UmVhZCB3aW5zIG92ZXIgZXZlcnkgb3RoZXIgc2V0dGluZyBmb3IgdGhlIHNhbWUgcGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZzOiBJQWdlbnRTYW5kYm94RmlsZVN5c3RlbVNldHRpbmcgPSB7XG5cdFx0XHRcdGFsbG93UmVhZDogWycvcCddLFxuXHRcdFx0XHRhbGxvd1dyaXRlOiBbJy9wJ10sXG5cdFx0XHRcdGRlbnlXcml0ZTogWycvcCddLFxuXHRcdFx0XHRkZW55UmVhZDogWycvcCddLFxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCBzYW5kYm94KCdkYXJ3aW4nLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIGZzKSk/LnVzZXJQb2xpY3kuZmlsZXN5c3RlbSwge1xuXHRcdFx0XHRkZW5pZWRQYXRoczogWycvcCddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW55V3JpdGUgd2lucyBvdmVyIGFsbG93V3JpdGUgLyBhbGxvd1JlYWQgZm9yIHRoZSBzYW1lIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmczogSUFnZW50U2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nID0ge1xuXHRcdFx0XHRhbGxvd1JlYWQ6IFsnL3AnXSxcblx0XHRcdFx0YWxsb3dXcml0ZTogWycvcCddLFxuXHRcdFx0XHRkZW55V3JpdGU6IFsnL3AnXSxcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaygnZGFyd2luJywgc2FuZGJveCgnZGFyd2luJywgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLCBmcykpPy51c2VyUG9saWN5LmZpbGVzeXN0ZW0sIHtcblx0XHRcdFx0cmVhZG9ubHlQYXRoczogWycvcCddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd1dyaXRlIHdpbnMgb3ZlciBhbGxvd1JlYWQgZm9yIHRoZSBzYW1lIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmczogSUFnZW50U2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nID0ge1xuXHRcdFx0XHRhbGxvd1JlYWQ6IFsnL3AnXSxcblx0XHRcdFx0YWxsb3dXcml0ZTogWycvcCddLFxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKCdkYXJ3aW4nLCBzYW5kYm94KCdkYXJ3aW4nLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIGZzKSk/LnVzZXJQb2xpY3kuZmlsZXN5c3RlbSwge1xuXHRcdFx0XHRyZWFkd3JpdGVQYXRoczogWycvcCddLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBkaXN0aW5jdCBwYXRocyBpbiB0aGVpciBvd24gbGlzdHMgd2hlbiBzZXR0aW5ncyBvdmVybGFwIG9uIHNvbWUgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmczogSUFnZW50U2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nID0ge1xuXHRcdFx0XHRhbGxvd1dyaXRlOiBbJy93b3JrJywgJy9zaGFyZWQnXSxcblx0XHRcdFx0ZGVueVdyaXRlOiBbJy9zaGFyZWQnXSxcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaygnZGFyd2luJywgc2FuZGJveCgnZGFyd2luJywgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLCBmcykpPy51c2VyUG9saWN5LmZpbGVzeXN0ZW0sIHtcblx0XHRcdFx0cmVhZHdyaXRlUGF0aHM6IFsnL3dvcmsnXSxcblx0XHRcdFx0cmVhZG9ubHlQYXRoczogWycvc2hhcmVkJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ25ldHdvcmsgaG9zdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZHJvcHMgaG9zdCBsaXN0cyBhbmQga2VlcHMgb3V0Ym91bmQgY2xvc2VkIHdoZW4gc2FuZGJveCBpcyBgb25gIChob3N0IGxpc3RzIGRpc2FibGVkIG9uIGFsbCBwbGF0Zm9ybXMpJywgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwbGF0Zm9ybSBvZiBbJ2RhcndpbicsICdsaW51eCddIGFzIGNvbnN0KSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKHBsYXRmb3JtLCBzYW5kYm94KHBsYXRmb3JtLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIHVuZGVmaW5lZCwgeyBhbGxvd2VkSG9zdHM6IFsnZ2l0aHViLmNvbSddLCBibG9ja2VkSG9zdHM6IFsnZXZpbC5leGFtcGxlJ10gfSkpPy51c2VyUG9saWN5Lm5ldHdvcmssIHtcblx0XHRcdFx0XHRhbGxvd091dGJvdW5kOiBmYWxzZSxcblx0XHRcdFx0fSwgcGxhdGZvcm0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBob3N0IGxpc3RzIHdoZW4gc2FuZGJveCBpcyBgYWxsb3dOZXR3b3JrYCAoYWxsb3cgYWxsKScsICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcGxhdGZvcm0gb2YgWydkYXJ3aW4nLCAnbGludXgnXSBhcyBjb25zdCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkayhwbGF0Zm9ybSwgc2FuZGJveChwbGF0Zm9ybSwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLkFsbG93TmV0d29yaywgdW5kZWZpbmVkLCB7IGFsbG93ZWRIb3N0czogWydhLmV4YW1wbGUnXSwgYmxvY2tlZEhvc3RzOiBbJ2IuZXhhbXBsZSddIH0pKT8udXNlclBvbGljeS5uZXR3b3JrLCB7XG5cdFx0XHRcdFx0YWxsb3dPdXRib3VuZDogdHJ1ZSxcblx0XHRcdFx0fSwgcGxhdGZvcm0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBlbXB0eSBob3N0IGxpc3RzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZFNhbmRib3hDb25maWdGb3JTZGsoJ2xpbnV4Jywgc2FuZGJveCgnbGludXgnLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24sIHVuZGVmaW5lZCwgeyBhbGxvd2VkSG9zdHM6IFtdLCBibG9ja2VkSG9zdHM6IFtdIH0pKT8udXNlclBvbGljeS5uZXR3b3JrLCB7XG5cdFx0XHRcdGFsbG93T3V0Ym91bmQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBcUQ7QUFDOUQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBcUU7QUFZOUUsU0FBUyxRQUNSLFVBQ0EsU0FDQSxJQUNBLE9BQ2tDO0FBQ2xDLE1BQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU87QUFDOUIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLE1BQTJCLENBQUM7QUFDbEMsTUFBSSxZQUFZLFFBQVc7QUFDMUIsUUFBSSxvQkFBb0IsT0FBTyxJQUFJO0FBQUEsRUFDcEM7QUFDQSxNQUFJLElBQUk7QUFDUCxVQUFNLFFBQVEsYUFBYSxVQUN4QixvQkFBb0Isb0JBQ3BCLGFBQWEsV0FDWixvQkFBb0IsZ0JBQ3BCLG9CQUFvQjtBQUN4QixRQUFJLEtBQUssSUFBSTtBQUFBLEVBQ2Q7QUFDQSxNQUFJLE9BQU8sY0FBYyxRQUFRO0FBQ2hDLFFBQUksb0JBQW9CLHFCQUFxQixJQUFJLENBQUMsR0FB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
