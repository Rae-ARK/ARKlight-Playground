import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { createSandboxLines, createSandboxProperties } from "../../browser/tools/runInTerminalTool.js";
suite("createSandboxLines", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  async function assertLines(options) {
    const properties = JSON.stringify(createSandboxProperties(options), void 0, 2);
    const snapshot = `${JSON.stringify(options, void 0, 2)}
----
${properties}
----
${createSandboxLines(options).join("\n")}`;
    await assertSnapshot(snapshot);
  }
  suite("available", () => {
    test("disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-available",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-available",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
  });
  suite("restricted", () => {
    test("no retry, disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("no retry, allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: false,
        networkDomains: void 0
      });
    });
    test("retry, disallowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: true,
        networkDomains: void 0
      });
    });
    test("retry, allowed", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: void 0
      });
    });
    test("empty domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: [], deniedDomains: [] }
      });
    });
    test("allowed domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "registry.npmjs.org"], deniedDomains: [] }
      });
    });
    test("denied domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: [], deniedDomains: ["evil.example.com"] }
      });
    });
    test("allowed and denied domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "registry.npmjs.org"], deniedDomains: ["evil.example.com"] }
      });
    });
    test("overlapping domains", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: true,
        retryWithAllowNetworkRequests: true,
        networkDomains: { allowedDomains: ["github.com", "evil.example.com"], deniedDomains: ["evil.example.com"] }
      });
    });
    test("domains, retry disabled", async () => {
      await assertLines({
        sandboxMode: "on-network-restricted",
        allowToRunUnsandboxedCommands: false,
        retryWithAllowNetworkRequests: false,
        networkDomains: { allowedDomains: ["github.com"], deniedDomains: ["evil.example.com"] }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvY3JlYXRlU2FuZGJveExpbmVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFzc2VydFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTYW5kYm94TGluZXMsIGNyZWF0ZVNhbmRib3hQcm9wZXJ0aWVzLCB0eXBlIElTYW5kYm94aW5nT25PcHRpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9ydW5JblRlcm1pbmFsVG9vbC5qcyc7XG5cbnN1aXRlKCdjcmVhdGVTYW5kYm94TGluZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydExpbmVzKG9wdGlvbnM6IElTYW5kYm94aW5nT25PcHRpb25zKSB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IEpTT04uc3RyaW5naWZ5KGNyZWF0ZVNhbmRib3hQcm9wZXJ0aWVzKG9wdGlvbnMpLCB1bmRlZmluZWQsIDIpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gYCR7SlNPTi5zdHJpbmdpZnkob3B0aW9ucywgdW5kZWZpbmVkLCAyKX1cXG4tLS0tXFxuJHtwcm9wZXJ0aWVzfVxcbi0tLS1cXG4ke2NyZWF0ZVNhbmRib3hMaW5lcyhvcHRpb25zKS5qb2luKCdcXG4nKX1gO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHNuYXBzaG90KTtcblx0fVxuXG5cdHN1aXRlKCdhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGlzYWxsb3dlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLWF2YWlsYWJsZScsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiBmYWxzZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGZhbHNlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstYXZhaWxhYmxlJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzdHJpY3RlZCcsICgpID0+IHtcblx0XHR0ZXN0KCdubyByZXRyeSwgZGlzYWxsb3dlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogZmFsc2UsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gcmV0cnksIGFsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0cnksIGRpc2FsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IGZhbHNlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0cnksIGFsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBkb21haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd2VkIGRvbWFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogeyBhbGxvd2VkRG9tYWluczogWydnaXRodWIuY29tJywgJ3JlZ2lzdHJ5Lm5wbWpzLm9yZyddLCBkZW5pZWREb21haW5zOiBbXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW5pZWQgZG9tYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydExpbmVzKHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogdHJ1ZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRcdG5ldHdvcmtEb21haW5zOiB7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogWydldmlsLmV4YW1wbGUuY29tJ10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dlZCBhbmQgZGVuaWVkIGRvbWFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5lcyh7XG5cdFx0XHRcdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1yZXN0cmljdGVkJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHM6IHRydWUsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiB0cnVlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogeyBhbGxvd2VkRG9tYWluczogWydnaXRodWIuY29tJywgJ3JlZ2lzdHJ5Lm5wbWpzLm9yZyddLCBkZW5pZWREb21haW5zOiBbJ2V2aWwuZXhhbXBsZS5jb20nXSB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvdmVybGFwcGluZyBkb21haW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiB0cnVlLFxuXHRcdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogdHJ1ZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHsgYWxsb3dlZERvbWFpbnM6IFsnZ2l0aHViLmNvbScsICdldmlsLmV4YW1wbGUuY29tJ10sIGRlbmllZERvbWFpbnM6IFsnZXZpbC5leGFtcGxlLmNvbSddIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvbWFpbnMsIHJldHJ5IGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGluZXMoe1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstcmVzdHJpY3RlZCcsXG5cdFx0XHRcdGFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzOiBmYWxzZSxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGZhbHNlLFxuXHRcdFx0XHRuZXR3b3JrRG9tYWluczogeyBhbGxvd2VkRG9tYWluczogWydnaXRodWIuY29tJ10sIGRlbmllZERvbWFpbnM6IFsnZXZpbC5leGFtcGxlLmNvbSddIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CLCtCQUEwRDtBQUV2RixNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLDBDQUF3QztBQUV4QyxpQkFBZSxZQUFZLFNBQStCO0FBQ3pELFVBQU0sYUFBYSxLQUFLLFVBQVUsd0JBQXdCLE9BQU8sR0FBRyxRQUFXLENBQUM7QUFDaEYsVUFBTSxXQUFXLEdBQUcsS0FBSyxVQUFVLFNBQVMsUUFBVyxDQUFDLENBQUM7QUFBQTtBQUFBLEVBQVcsVUFBVTtBQUFBO0FBQUEsRUFBVyxtQkFBbUIsT0FBTyxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQy9ILFVBQU0sZUFBZSxRQUFRO0FBQUEsRUFDOUI7QUFFQSxRQUFNLGFBQWEsTUFBTTtBQUN4QixTQUFLLGNBQWMsWUFBWTtBQUM5QixZQUFNLFlBQVk7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYiwrQkFBK0I7QUFBQSxRQUMvQiwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxXQUFXLFlBQVk7QUFDM0IsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sY0FBYyxNQUFNO0FBQ3pCLFNBQUssd0JBQXdCLFlBQVk7QUFDeEMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsscUJBQXFCLFlBQVk7QUFDckMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsscUJBQXFCLFlBQVk7QUFDckMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssa0JBQWtCLFlBQVk7QUFDbEMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssaUJBQWlCLFlBQVk7QUFDakMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxlQUFlLENBQUMsRUFBRTtBQUFBLE1BQ3pELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG1CQUFtQixZQUFZO0FBQ25DLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLGNBQWMsb0JBQW9CLEdBQUcsZUFBZSxDQUFDLEVBQUU7QUFBQSxNQUMzRixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxrQkFBa0IsWUFBWTtBQUNsQyxZQUFNLFlBQVk7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYiwrQkFBK0I7QUFBQSxRQUMvQiwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxrQkFBa0IsRUFBRTtBQUFBLE1BQzNFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDhCQUE4QixZQUFZO0FBQzlDLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLGFBQWE7QUFBQSxRQUNiLCtCQUErQjtBQUFBLFFBQy9CLCtCQUErQjtBQUFBLFFBQy9CLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLGNBQWMsb0JBQW9CLEdBQUcsZUFBZSxDQUFDLGtCQUFrQixFQUFFO0FBQUEsTUFDN0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssdUJBQXVCLFlBQVk7QUFDdkMsWUFBTSxZQUFZO0FBQUEsUUFDakIsYUFBYTtBQUFBLFFBQ2IsK0JBQStCO0FBQUEsUUFDL0IsK0JBQStCO0FBQUEsUUFDL0IsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsY0FBYyxrQkFBa0IsR0FBRyxlQUFlLENBQUMsa0JBQWtCLEVBQUU7QUFBQSxNQUMzRyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywyQkFBMkIsWUFBWTtBQUMzQyxZQUFNLFlBQVk7QUFBQSxRQUNqQixhQUFhO0FBQUEsUUFDYiwrQkFBK0I7QUFBQSxRQUMvQiwrQkFBK0I7QUFBQSxRQUMvQixnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxZQUFZLEdBQUcsZUFBZSxDQUFDLGtCQUFrQixFQUFFO0FBQUEsTUFDdkYsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
