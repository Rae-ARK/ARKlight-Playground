import { deepStrictEqual, notEqual, strictEqual, throws } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { DecorationAddon } from "../../../browser/xterm/decorationAddon.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("DecorationAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let decorationAddon;
  let xterm;
  let hoverDisposed;
  let removedEventListeners;
  setup(async () => {
    hoverDisposed = false;
    removedEventListeners = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    class TestTerminal extends TerminalCtor {
      registerDecoration(decorationOptions) {
        if (decorationOptions.marker.isDisposed) {
          return void 0;
        }
        const element = document.createElement("div");
        const removeEventListener = element.removeEventListener.bind(element);
        element.removeEventListener = ((...args) => {
          removedEventListeners.push(args[0]);
          removeEventListener(...args);
        });
        const disposeListeners = /* @__PURE__ */ new Set();
        let isDisposed = false;
        return {
          marker: decorationOptions.marker,
          element,
          onDispose: (listener) => {
            disposeListeners.add(listener);
            return { dispose: () => disposeListeners.delete(listener) };
          },
          get isDisposed() {
            return isDisposed;
          },
          dispose: () => {
            isDisposed = true;
            for (const listener of disposeListeners) {
              listener();
            }
            disposeListeners.clear();
          },
          onRender: (listener) => {
            listener(element);
            return { dispose: () => {
            } };
          }
        };
      }
    }
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        files: {},
        workbench: {
          hover: { delay: 5 }
        },
        terminal: {
          integrated: {
            shellIntegration: {
              decorationsEnabled: "both"
            }
          }
        }
      })
    }, store);
    instantiationService.stub(IHoverService, {
      setupDelayedHover: () => ({ dispose: () => hoverDisposed = true })
    });
    xterm = store.add(new TestTerminal({
      allowProposedApi: true,
      cols: 80,
      rows: 30,
      logger: TestXtermLogger
    }));
    const capabilities = store.add(new TerminalCapabilityStore());
    capabilities.add(TerminalCapability.CommandDetection, store.add(instantiationService.createInstance(CommandDetectionCapability, xterm)));
    decorationAddon = store.add(instantiationService.createInstance(DecorationAddon, void 0, capabilities));
    xterm.loadAddon(decorationAddon);
  });
  suite("registerDecoration", () => {
    test("should throw when command has no marker", async () => {
      throws(() => decorationAddon.registerCommandDecoration({ command: "cd src", timestamp: Date.now(), hasOutput: () => false }));
    });
    test("should return undefined when marker has been disposed of", async () => {
      const marker = xterm.registerMarker(1);
      marker?.dispose();
      strictEqual(decorationAddon.registerCommandDecoration({ command: "cd src", marker, timestamp: Date.now(), hasOutput: () => false }), void 0);
    });
    test("should return decoration when marker has not been disposed of", async () => {
      const marker = xterm.registerMarker(2);
      notEqual(decorationAddon.registerCommandDecoration({ command: "cd src", marker, timestamp: Date.now(), hasOutput: () => false }), void 0);
    });
    test("should return decoration with mark properties", async () => {
      const marker = xterm.registerMarker(2);
      notEqual(decorationAddon.registerCommandDecoration(void 0, void 0, { marker }), void 0);
    });
    test("should dispose decoration resources when the decoration is disposed", () => {
      const marker = xterm.registerMarker(2);
      const decoration = decorationAddon.registerCommandDecoration({ command: "cd src", marker, exitCode: 0, timestamp: Date.now(), hasOutput: () => false });
      const decorations = decorationAddon._decorations;
      decoration.dispose();
      strictEqual(hoverDisposed, true);
      deepStrictEqual(removedEventListeners.sort(), ["click", "contextmenu", "mousedown"]);
      strictEqual(decorations.has(marker.id), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS9kZWNvcmF0aW9uQWRkb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgSURlY29yYXRpb24sIElEZWNvcmF0aW9uT3B0aW9ucywgVGVybWluYWwgYXMgUmF3WHRlcm1UZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG5vdEVxdWFsLCBzdHJpY3RFcXVhbCwgdGhyb3dzIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uQWRkb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3h0ZXJtL2RlY29yYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5cbnN1aXRlKCdEZWNvcmF0aW9uQWRkb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGRlY29yYXRpb25BZGRvbjogRGVjb3JhdGlvbkFkZG9uO1xuXHRsZXQgeHRlcm06IFJhd1h0ZXJtVGVybWluYWw7XG5cdGxldCBob3ZlckRpc3Bvc2VkOiBib29sZWFuO1xuXHRsZXQgcmVtb3ZlZEV2ZW50TGlzdGVuZXJzOiBzdHJpbmdbXTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aG92ZXJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHJlbW92ZWRFdmVudExpc3RlbmVycyA9IFtdO1xuXHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHRjbGFzcyBUZXN0VGVybWluYWwgZXh0ZW5kcyBUZXJtaW5hbEN0b3Ige1xuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJEZWNvcmF0aW9uKGRlY29yYXRpb25PcHRpb25zOiBJRGVjb3JhdGlvbk9wdGlvbnMpOiBJRGVjb3JhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uT3B0aW9ucy5tYXJrZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCByZW1vdmVFdmVudExpc3RlbmVyID0gZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyLmJpbmQoZWxlbWVudCk7XG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lciA9ICgoLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2YgZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyPikgPT4ge1xuXHRcdFx0XHRcdHJlbW92ZWRFdmVudExpc3RlbmVycy5wdXNoKGFyZ3NbMF0pO1xuXHRcdFx0XHRcdHJlbW92ZUV2ZW50TGlzdGVuZXIoLi4uYXJncyk7XG5cdFx0XHRcdH0pIGFzIHR5cGVvZiBlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXI7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2VMaXN0ZW5lcnMgPSBuZXcgU2V0PCgpID0+IHZvaWQ+KCk7XG5cdFx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bWFya2VyOiBkZWNvcmF0aW9uT3B0aW9ucy5tYXJrZXIsXG5cdFx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0XHRvbkRpc3Bvc2U6IChsaXN0ZW5lcjogKCkgPT4gdm9pZCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGlzcG9zZUxpc3RlbmVycy5hZGQobGlzdGVuZXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4gZGlzcG9zZUxpc3RlbmVycy5kZWxldGUobGlzdGVuZXIpIH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXQgaXNEaXNwb3NlZCgpIHsgcmV0dXJuIGlzRGlzcG9zZWQ7IH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0aXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGxpc3RlbmVyIG9mIGRpc3Bvc2VMaXN0ZW5lcnMpIHtcblx0XHRcdFx0XHRcdFx0bGlzdGVuZXIoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGRpc3Bvc2VMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG9uUmVuZGVyOiAobGlzdGVuZXI6IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gdm9pZCkgPT4ge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIoZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBJRGVjb3JhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0ZmlsZXM6IHt9LFxuXHRcdFx0XHR3b3JrYmVuY2g6IHtcblx0XHRcdFx0XHRob3ZlcjogeyBkZWxheTogNSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdHNoZWxsSW50ZWdyYXRpb246IHtcblx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvbnNFbmFibGVkOiAnYm90aCdcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgc3RvcmUpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwge1xuXHRcdFx0c2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IGhvdmVyRGlzcG9zZWQgPSB0cnVlIH0pXG5cdFx0fSBhcyB1bmtub3duIGFzIElIb3ZlclNlcnZpY2UpO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXN0VGVybWluYWwoe1xuXHRcdFx0YWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMzAsXG5cdFx0XHRsb2dnZXI6IFRlc3RYdGVybUxvZ2dlclxuXHRcdH0pKTtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRcdGNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24sIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgeHRlcm0pKSk7XG5cdFx0ZGVjb3JhdGlvbkFkZG9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlY29yYXRpb25BZGRvbiwgdW5kZWZpbmVkLCBjYXBhYmlsaXRpZXMpKTtcblx0XHR4dGVybS5sb2FkQWRkb24oZGVjb3JhdGlvbkFkZG9uKTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZ2lzdGVyRGVjb3JhdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgd2hlbiBjb21tYW5kIGhhcyBubyBtYXJrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aHJvd3MoKCkgPT4gZGVjb3JhdGlvbkFkZG9uLnJlZ2lzdGVyQ29tbWFuZERlY29yYXRpb24oeyBjb21tYW5kOiAnY2Qgc3JjJywgdGltZXN0YW1wOiBEYXRlLm5vdygpLCBoYXNPdXRwdXQ6ICgpID0+IGZhbHNlIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCkpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gbWFya2VyIGhhcyBiZWVuIGRpc3Bvc2VkIG9mJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2VyID0geHRlcm0ucmVnaXN0ZXJNYXJrZXIoMSk7XG5cdFx0XHRtYXJrZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKGRlY29yYXRpb25BZGRvbi5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKHsgY29tbWFuZDogJ2NkIHNyYycsIG1hcmtlciwgdGltZXN0YW1wOiBEYXRlLm5vdygpLCBoYXNPdXRwdXQ6ICgpID0+IGZhbHNlIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBkZWNvcmF0aW9uIHdoZW4gbWFya2VyIGhhcyBub3QgYmVlbiBkaXNwb3NlZCBvZicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHh0ZXJtLnJlZ2lzdGVyTWFya2VyKDIpO1xuXHRcdFx0bm90RXF1YWwoZGVjb3JhdGlvbkFkZG9uLnJlZ2lzdGVyQ29tbWFuZERlY29yYXRpb24oeyBjb21tYW5kOiAnY2Qgc3JjJywgbWFya2VyLCB0aW1lc3RhbXA6IERhdGUubm93KCksIGhhc091dHB1dDogKCkgPT4gZmFsc2UgfSBhcyBJVGVybWluYWxDb21tYW5kKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGRlY29yYXRpb24gd2l0aCBtYXJrIHByb3BlcnRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB4dGVybS5yZWdpc3Rlck1hcmtlcigyKTtcblx0XHRcdG5vdEVxdWFsKGRlY29yYXRpb25BZGRvbi5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG1hcmtlciB9KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBkZWNvcmF0aW9uIHJlc291cmNlcyB3aGVuIHRoZSBkZWNvcmF0aW9uIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2VyID0geHRlcm0ucmVnaXN0ZXJNYXJrZXIoMikhO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbiA9IGRlY29yYXRpb25BZGRvbi5yZWdpc3RlckNvbW1hbmREZWNvcmF0aW9uKHsgY29tbWFuZDogJ2NkIHNyYycsIG1hcmtlciwgZXhpdENvZGU6IDAsIHRpbWVzdGFtcDogRGF0ZS5ub3coKSwgaGFzT3V0cHV0OiAoKSA9PiBmYWxzZSB9IGFzIElUZXJtaW5hbENvbW1hbmQpITtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gKGRlY29yYXRpb25BZGRvbiBhcyB1bmtub3duIGFzIHsgX2RlY29yYXRpb25zOiBNYXA8bnVtYmVyLCB1bmtub3duPiB9KS5fZGVjb3JhdGlvbnM7XG5cblx0XHRcdGRlY29yYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChob3ZlckRpc3Bvc2VkLCB0cnVlKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZW1vdmVkRXZlbnRMaXN0ZW5lcnMuc29ydCgpLCBbJ2NsaWNrJywgJ2NvbnRleHRtZW51JywgJ21vdXNlZG93biddKTtcblx0XHRcdHN0cmljdEVxdWFsKGRlY29yYXRpb25zLmhhcyhtYXJrZXIuaWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGlCQUFpQixVQUFVLGFBQWEsY0FBYztBQUMvRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUEyQiwwQkFBMEI7QUFDckQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFlBQVk7QUFDakIsb0JBQWdCO0FBQ2hCLDRCQUF3QixDQUFDO0FBQ3pCLFVBQU0sZ0JBQWdCLE1BQU0sb0JBQW1ELGdCQUFnQixjQUFjLEdBQUc7QUFBQSxJQUNoSCxNQUFNLHFCQUFxQixhQUFhO0FBQUEsTUFDOUIsbUJBQW1CLG1CQUFnRTtBQUMzRixZQUFJLGtCQUFrQixPQUFPLFlBQVk7QUFDeEMsaUJBQU87QUFBQSxRQUNSO0FBQ0EsY0FBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLGNBQU0sc0JBQXNCLFFBQVEsb0JBQW9C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
