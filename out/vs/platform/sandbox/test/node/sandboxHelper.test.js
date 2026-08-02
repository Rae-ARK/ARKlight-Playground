import { deepStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { SandboxHelperService } from "../../node/sandboxHelper.js";
suite("SandboxHelperService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not inspect sandbox dependencies on non-Linux platforms", async () => {
    let findCalled = false;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(async () => {
      findCalled = true;
      return void 0;
    }, false);
    strictEqual(result, void 0);
    strictEqual(findCalled, false);
  });
  test("reports missing bubblewrap without running its capability probe", async () => {
    let probeCalled = false;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => command === "socat" ? "/usr/bin/socat" : void 0,
      true,
      async () => {
        probeCalled = true;
        return { usable: true };
      }
    );
    strictEqual(probeCalled, false);
    strictEqual(result?.bubblewrapInstalled, false);
    strictEqual(result?.bubblewrapUsable, false);
    strictEqual(result?.socatInstalled, true);
  });
  test("reports bubblewrap usable when its capability probe succeeds", async () => {
    let probedCommand;
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => `/usr/bin/${command}`,
      true,
      async (command) => {
        probedCommand = command;
        return { usable: true };
      }
    );
    strictEqual(probedCommand, "/usr/bin/bwrap");
    deepStrictEqual(result, {
      bubblewrapInstalled: true,
      bubblewrapUsable: true,
      bubblewrapError: void 0,
      socatInstalled: true,
      dependencyInstallCommand: void 0
    });
  });
  test("reports the probe error when bubblewrap is unusable", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => `/usr/bin/${command}`,
      true,
      async () => ({ usable: false, error: "No permissions to create namespace" }),
      void 0,
      async () => true
    );
    deepStrictEqual(result, {
      bubblewrapInstalled: true,
      bubblewrapUsable: false,
      bubblewrapError: "No permissions to create namespace",
      socatInstalled: true,
      dependencyInstallCommand: void 0,
      apparmorRestrictsUnprivilegedUserNamespaces: true
    });
  });
  for (const [distributionId, packageManager, expectedCommand] of [
    ["debian", "apt-get", "sudo apt-get update && sudo apt-get install -y"],
    ["ubuntu", "apt", "sudo apt update && sudo apt install -y"],
    ["fedora", "dnf", "sudo dnf install -y"],
    ["centos", "yum", "sudo yum install -y"],
    ["arch", "pacman", "sudo pacman -S --needed --noconfirm"],
    ["opensuse", "zypper", "sudo zypper --non-interactive install"],
    ["alpine", "apk", "sudo apk add"]
  ]) {
    test(`detects ${packageManager} for dependency installation`, async () => {
      const result = await SandboxHelperService.checkSandboxDependenciesWith(
        async (command) => command === "socat" || command === "sudo" || command === packageManager ? `/usr/bin/${command}` : void 0,
        true,
        void 0,
        async () => ({ distributionIds: [distributionId], isRoot: false })
      );
      strictEqual(result?.dependencyInstallCommand, expectedCommand);
    });
  }
  test("uses ID_LIKE to detect a derivative distribution", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "sudo", "dnf"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["custom-linux", "fedora"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, "sudo dnf install -y");
  });
  test("uses the native package manager when multiple managers are available", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "sudo", "apt-get", "pacman"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["arch"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, "sudo pacman -S --needed --noconfirm");
  });
  test("does not use sudo when running as root", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "apk"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["alpine"], isRoot: true })
    );
    strictEqual(result?.dependencyInstallCommand, "apk add");
  });
  test("does not use sudo for chained apt-get commands when running as root", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "apt-get"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["debian"], isRoot: true })
    );
    strictEqual(result?.dependencyInstallCommand, "apt-get update && apt-get install -y");
  });
  test("does not offer dependency installation to a non-root user without sudo", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => ["socat", "pacman"].includes(command) ? `/usr/bin/${command}` : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["arch"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, void 0);
  });
  test("does not offer dependency installation without a supported package manager", async () => {
    const result = await SandboxHelperService.checkSandboxDependenciesWith(
      async (command) => command === "socat" ? "/usr/bin/socat" : void 0,
      true,
      void 0,
      async () => ({ distributionIds: ["unknown"], isRoot: false })
    );
    strictEqual(result?.dependencyInstallCommand, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NhbmRib3gvdGVzdC9ub2RlL3NhbmRib3hIZWxwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTYW5kYm94SGVscGVyU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvc2FuZGJveEhlbHBlci5qcyc7XG5cbnN1aXRlKCdTYW5kYm94SGVscGVyU2VydmljZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW5zcGVjdCBzYW5kYm94IGRlcGVuZGVuY2llcyBvbiBub24tTGludXggcGxhdGZvcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBmaW5kQ2FsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgU2FuZGJveEhlbHBlclNlcnZpY2UuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzV2l0aChhc3luYyAoKSA9PiB7XG5cdFx0XHRmaW5kQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSwgZmFsc2UpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGZpbmRDYWxsZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBtaXNzaW5nIGJ1YmJsZXdyYXAgd2l0aG91dCBydW5uaW5nIGl0cyBjYXBhYmlsaXR5IHByb2JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBwcm9iZUNhbGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IGNvbW1hbmQgPT09ICdzb2NhdCcgPyAnL3Vzci9iaW4vc29jYXQnIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0cHJvYmVDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4geyB1c2FibGU6IHRydWUgfTtcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHN0cmljdEVxdWFsKHByb2JlQ2FsbGVkLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5idWJibGV3cmFwSW5zdGFsbGVkLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5idWJibGV3cmFwVXNhYmxlLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5zb2NhdEluc3RhbGxlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYnViYmxld3JhcCB1c2FibGUgd2hlbiBpdHMgY2FwYWJpbGl0eSBwcm9iZSBzdWNjZWVkcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcHJvYmVkQ29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IGAvdXNyL2Jpbi8ke2NvbW1hbmR9YCxcblx0XHRcdHRydWUsXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IHtcblx0XHRcdFx0cHJvYmVkQ29tbWFuZCA9IGNvbW1hbmQ7XG5cdFx0XHRcdHJldHVybiB7IHVzYWJsZTogdHJ1ZSB9O1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0c3RyaWN0RXF1YWwocHJvYmVkQ29tbWFuZCwgJy91c3IvYmluL2J3cmFwJyk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0YnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdGJ1YmJsZXdyYXBVc2FibGU6IHRydWUsXG5cdFx0XHRidWJibGV3cmFwRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHNvY2F0SW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0ZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgdGhlIHByb2JlIGVycm9yIHdoZW4gYnViYmxld3JhcCBpcyB1bnVzYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBgL3Vzci9iaW4vJHtjb21tYW5kfWAsXG5cdFx0XHR0cnVlLFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgdXNhYmxlOiBmYWxzZSwgZXJyb3I6ICdObyBwZXJtaXNzaW9ucyB0byBjcmVhdGUgbmFtZXNwYWNlJyB9KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+IHRydWUsXG5cdFx0KTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdGJ1YmJsZXdyYXBJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRidWJibGV3cmFwVXNhYmxlOiBmYWxzZSxcblx0XHRcdGJ1YmJsZXdyYXBFcnJvcjogJ05vIHBlcm1pc3Npb25zIHRvIGNyZWF0ZSBuYW1lc3BhY2UnLFxuXHRcdFx0c29jYXRJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRkZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGFwcGFybW9yUmVzdHJpY3RzVW5wcml2aWxlZ2VkVXNlck5hbWVzcGFjZXM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZvciAoY29uc3QgW2Rpc3RyaWJ1dGlvbklkLCBwYWNrYWdlTWFuYWdlciwgZXhwZWN0ZWRDb21tYW5kXSBvZiBbXG5cdFx0WydkZWJpYW4nLCAnYXB0LWdldCcsICdzdWRvIGFwdC1nZXQgdXBkYXRlICYmIHN1ZG8gYXB0LWdldCBpbnN0YWxsIC15J10sXG5cdFx0Wyd1YnVudHUnLCAnYXB0JywgJ3N1ZG8gYXB0IHVwZGF0ZSAmJiBzdWRvIGFwdCBpbnN0YWxsIC15J10sXG5cdFx0WydmZWRvcmEnLCAnZG5mJywgJ3N1ZG8gZG5mIGluc3RhbGwgLXknXSxcblx0XHRbJ2NlbnRvcycsICd5dW0nLCAnc3VkbyB5dW0gaW5zdGFsbCAteSddLFxuXHRcdFsnYXJjaCcsICdwYWNtYW4nLCAnc3VkbyBwYWNtYW4gLVMgLS1uZWVkZWQgLS1ub2NvbmZpcm0nXSxcblx0XHRbJ29wZW5zdXNlJywgJ3p5cHBlcicsICdzdWRvIHp5cHBlciAtLW5vbi1pbnRlcmFjdGl2ZSBpbnN0YWxsJ10sXG5cdFx0WydhbHBpbmUnLCAnYXBrJywgJ3N1ZG8gYXBrIGFkZCddLFxuXHRdIGFzIGNvbnN0KSB7XG5cdFx0dGVzdChgZGV0ZWN0cyAke3BhY2thZ2VNYW5hZ2VyfSBmb3IgZGVwZW5kZW5jeSBpbnN0YWxsYXRpb25gLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0XHRhc3luYyBjb21tYW5kID0+IGNvbW1hbmQgPT09ICdzb2NhdCcgfHwgY29tbWFuZCA9PT0gJ3N1ZG8nIHx8IGNvbW1hbmQgPT09IHBhY2thZ2VNYW5hZ2VyID8gYC91c3IvYmluLyR7Y29tbWFuZH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogW2Rpc3RyaWJ1dGlvbklkXSwgaXNSb290OiBmYWxzZSB9KSxcblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLCBleHBlY3RlZENvbW1hbmQpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgndXNlcyBJRF9MSUtFIHRvIGRldGVjdCBhIGRlcml2YXRpdmUgZGlzdHJpYnV0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFNhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llc1dpdGgoXG5cdFx0XHRhc3luYyBjb21tYW5kID0+IFsnc29jYXQnLCAnc3VkbycsICdkbmYnXS5pbmNsdWRlcyhjb21tYW5kKSA/IGAvdXNyL2Jpbi8ke2NvbW1hbmR9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBkaXN0cmlidXRpb25JZHM6IFsnY3VzdG9tLWxpbnV4JywgJ2ZlZG9yYSddLCBpc1Jvb3Q6IGZhbHNlIH0pLFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCwgJ3N1ZG8gZG5mIGluc3RhbGwgLXknKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgbmF0aXZlIHBhY2thZ2UgbWFuYWdlciB3aGVuIG11bHRpcGxlIG1hbmFnZXJzIGFyZSBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgU2FuZGJveEhlbHBlclNlcnZpY2UuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzV2l0aChcblx0XHRcdGFzeW5jIGNvbW1hbmQgPT4gWydzb2NhdCcsICdzdWRvJywgJ2FwdC1nZXQnLCAncGFjbWFuJ10uaW5jbHVkZXMoY29tbWFuZCkgPyBgL3Vzci9iaW4vJHtjb21tYW5kfWAgOiB1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgZGlzdHJpYnV0aW9uSWRzOiBbJ2FyY2gnXSwgaXNSb290OiBmYWxzZSB9KSxcblx0XHQpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQsICdzdWRvIHBhY21hbiAtUyAtLW5lZWRlZCAtLW5vY29uZmlybScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB1c2Ugc3VkbyB3aGVuIHJ1bm5pbmcgYXMgcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBbJ3NvY2F0JywgJ2FwayddLmluY2x1ZGVzKGNvbW1hbmQpID8gYC91c3IvYmluLyR7Y29tbWFuZH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogWydhbHBpbmUnXSwgaXNSb290OiB0cnVlIH0pLFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCwgJ2FwayBhZGQnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdXNlIHN1ZG8gZm9yIGNoYWluZWQgYXB0LWdldCBjb21tYW5kcyB3aGVuIHJ1bm5pbmcgYXMgcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBbJ3NvY2F0JywgJ2FwdC1nZXQnXS5pbmNsdWRlcyhjb21tYW5kKSA/IGAvdXNyL2Jpbi8ke2NvbW1hbmR9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBkaXN0cmlidXRpb25JZHM6IFsnZGViaWFuJ10sIGlzUm9vdDogdHJ1ZSB9KSxcblx0XHQpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQsICdhcHQtZ2V0IHVwZGF0ZSAmJiBhcHQtZ2V0IGluc3RhbGwgLXknKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb2ZmZXIgZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24gdG8gYSBub24tcm9vdCB1c2VyIHdpdGhvdXQgc3VkbycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBbJ3NvY2F0JywgJ3BhY21hbiddLmluY2x1ZGVzKGNvbW1hbmQpID8gYC91c3IvYmluLyR7Y29tbWFuZH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGFzeW5jICgpID0+ICh7IGRpc3RyaWJ1dGlvbklkczogWydhcmNoJ10sIGlzUm9vdDogZmFsc2UgfSksXG5cdFx0KTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvZmZlciBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiB3aXRob3V0IGEgc3VwcG9ydGVkIHBhY2thZ2UgbWFuYWdlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBTYW5kYm94SGVscGVyU2VydmljZS5jaGVja1NhbmRib3hEZXBlbmRlbmNpZXNXaXRoKFxuXHRcdFx0YXN5bmMgY29tbWFuZCA9PiBjb21tYW5kID09PSAnc29jYXQnID8gJy91c3IvYmluL3NvY2F0JyA6IHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBkaXN0cmlidXRpb25JZHM6IFsndW5rbm93biddLCBpc1Jvb3Q6IGZhbHNlIH0pLFxuXHRcdCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLDBDQUF3QztBQUV4QyxPQUFLLGdFQUFnRSxZQUFZO0FBQ2hGLFFBQUksYUFBYTtBQUNqQixVQUFNLFNBQVMsTUFBTSxxQkFBcUIsNkJBQTZCLFlBQVk7QUFDbEYsbUJBQWE7QUFDYixhQUFPO0FBQUEsSUFDUixHQUFHLEtBQUs7QUFFUixnQkFBWSxRQUFRLE1BQVM7QUFDN0IsZ0JBQVksWUFBWSxLQUFLO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7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
