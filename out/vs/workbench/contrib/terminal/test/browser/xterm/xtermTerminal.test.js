import { deepStrictEqual, ok, strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { Color, RGBA } from "../../../../../../base/common/color.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { TestColorTheme } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../../../common/theme.js";
import { ViewContainerLocation } from "../../../../../common/views.js";
import { XtermTerminal } from "../../../browser/xterm/xtermTerminal.js";
import { TERMINAL_VIEW_ID } from "../../../common/terminal.js";
import { registerColors, TERMINAL_BACKGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR, TERMINAL_SELECTION_FOREGROUND_COLOR } from "../../../common/terminalColorRegistry.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { TestWebglAddon, TestXtermAddonImporter } from "./xtermTestUtils.js";
registerColors();
class TestViewDescriptorService {
  constructor() {
    this._location = ViewContainerLocation.Panel;
    this._onDidChangeLocation = new Emitter();
    this.onDidChangeLocation = this._onDidChangeLocation.event;
  }
  getViewLocationById(id) {
    return this._location;
  }
  moveTerminalToLocation(to) {
    const oldLocation = this._location;
    this._location = to;
    this._onDidChangeLocation.fire({
      views: [
        { id: TERMINAL_VIEW_ID }
      ],
      from: oldLocation,
      to
    });
  }
}
const defaultTerminalConfig = {
  fontFamily: "monospace",
  fontWeight: "normal",
  fontWeightBold: "normal",
  gpuAcceleration: "off",
  scrollback: 10,
  fastScrollSensitivity: 2,
  mouseWheelScrollSensitivity: 1,
  unicodeVersion: "6"
};
suite("XtermTerminal", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let themeService;
  let xterm;
  let XTermBaseCtor;
  function write(data) {
    return new Promise((resolve) => {
      xterm.write(data, resolve);
    });
  }
  setup(async () => {
    configurationService = new TestConfigurationService({
      editor: {
        fastScrollSensitivity: 2,
        mouseWheelScrollSensitivity: 1
      },
      files: {},
      terminal: {
        integrated: defaultTerminalConfig
      }
    });
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    themeService = instantiationService.get(IThemeService);
    XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    const capabilityStore = store.add(new TerminalCapabilityStore());
    xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
      cols: 80,
      rows: 30,
      xtermColorProvider: { getBackgroundColor: () => void 0 },
      capabilities: capabilityStore,
      disableShellIntegrationReporting: true,
      xtermAddonImporter: new TestXtermAddonImporter()
    }, void 0));
    TestWebglAddon.shouldThrow = false;
    TestWebglAddon.isEnabled = false;
  });
  test("should use fallback dimensions of 80x30", () => {
    strictEqual(xterm.raw.cols, 80);
    strictEqual(xterm.raw.rows, 30);
  });
  suite("getContentsAsText", () => {
    test("should return all buffer contents when no markers provided", async () => {
      await write("line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("line 1\nline 2\nline 3\nline 4\nline 5"), true, "Should include the content plus empty lines up to buffer length");
      const lines = result.split("\n");
      strictEqual(lines.length, xterm.raw.buffer.active.length, "Should end with empty lines (total buffer size is 30 rows)");
    });
    test("should return contents from start marker to end", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker);
      strictEqual(result.startsWith("line 2\nline 3\nline 4\nline 5"), true, "Should start with line 2 and include empty lines");
    });
    test("should return contents from start to end marker", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "line 2\nline 3\nline 4");
    });
    test("should return single line when start and end markers are the same", async () => {
      await write("line 1\r\nline 2\r\n");
      const marker = xterm.raw.registerMarker(0);
      await write("line 3\r\nline 4\r\nline 5");
      const result = xterm.getContentsAsText(marker, marker);
      strictEqual(result, "line 3");
    });
    test("should return empty string when start marker is beyond end marker", async () => {
      await write("line 1\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 4\r\nline 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "");
    });
    test("should handle empty buffer", async () => {
      const result = xterm.getContentsAsText();
      const lines = result.split("\n");
      strictEqual(lines.length, xterm.raw.buffer.active.length, "Empty terminal should have empty lines equal to buffer length");
      strictEqual(lines.every((line) => line === ""), true, "All lines should be empty");
    });
    test("should handle mixed content with spaces and special characters", async () => {
      await write("hello world\r\n  indented line\r\nline with $pecial chars!@#\r\n\r\nempty line above");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("hello world\n  indented line\nline with $pecial chars!@#\n\nempty line above"), true, "Should handle spaces and special characters correctly");
    });
    test("should fall back to line 0 when startMarker is disposed (line === -1)", async () => {
      await write("line 1\r\n");
      const disposedMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\nline 3\r\nline 4\r\nline 5");
      disposedMarker.dispose();
      const result = xterm.getContentsAsText(disposedMarker);
      ok(result.startsWith("line 1\nline 2\nline 3\nline 4\nline 5"), `Unexpected result: ${result}`);
    });
    test("should throw error when endMarker is disposed (line === -1)", async () => {
      await write("line 1\r\n");
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 2\r\n");
      const disposedEndMarker = xterm.raw.registerMarker(0);
      await write("line 3\r\nline 4\r\nline 5");
      disposedEndMarker.dispose();
      try {
        xterm.getContentsAsText(startMarker, disposedEndMarker);
        throw new Error("Expected error was not thrown");
      } catch (error) {
        strictEqual(error.message, "Cannot get contents of a disposed endMarker");
      }
    });
    test("should handle markers at buffer boundaries", async () => {
      const startMarker = xterm.raw.registerMarker(0);
      await write("line 1\r\nline 2\r\nline 3\r\nline 4\r\n");
      const endMarker = xterm.raw.registerMarker(0);
      await write("line 5");
      const result = xterm.getContentsAsText(startMarker, endMarker);
      strictEqual(result, "line 1\nline 2\nline 3\nline 4\nline 5", "Should handle markers at buffer boundaries correctly");
    });
    test("should handle terminal escape sequences properly", async () => {
      await write("\x1B[31mred text\x1B[0m\r\n\x1B[32mgreen text\x1B[0m");
      const result = xterm.getContentsAsText();
      strictEqual(result.startsWith("red text\ngreen text"), true, "ANSI escape sequences should be filtered out, but there will be trailing empty lines");
    });
  });
  suite("getBufferReverseIterator", () => {
    test("should get text properly within scrollback limit", async () => {
      const text = "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5";
      await write(text);
      const result = [...xterm.getBufferReverseIterator()].reverse().join("\r\n");
      strictEqual(text, result, "Should equal original text");
    });
    test("should get text properly when exceed scrollback limit", async () => {
      const text = "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n".repeat(8).trim();
      await write(text);
      await write("\r\nline more");
      const result = [...xterm.getBufferReverseIterator()].reverse().join("\r\n");
      const expect = text.slice(8) + "\r\nline more";
      strictEqual(expect, result, "Should equal original text without line 1");
    });
  });
  suite("theme", () => {
    test("should apply correct background color based on getBackgroundColor", () => {
      themeService.setTheme(new TestColorTheme({
        [PANEL_BACKGROUND]: "#ff0000",
        [SIDE_BAR_BACKGROUND]: "#00ff00"
      }));
      xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols: 80,
        rows: 30,
        xtermAddonImporter: new TestXtermAddonImporter(),
        xtermColorProvider: { getBackgroundColor: () => new Color(new RGBA(255, 0, 0)) },
        capabilities: store.add(new TerminalCapabilityStore()),
        disableShellIntegrationReporting: true
      }, void 0));
      strictEqual(xterm.raw.options.theme?.background, "#ff0000");
    });
    test("should react to and apply theme changes", () => {
      themeService.setTheme(new TestColorTheme({
        [TERMINAL_BACKGROUND_COLOR]: "#000100",
        [TERMINAL_FOREGROUND_COLOR]: "#000200",
        [TERMINAL_CURSOR_FOREGROUND_COLOR]: "#000300",
        [TERMINAL_CURSOR_BACKGROUND_COLOR]: "#000400",
        [TERMINAL_SELECTION_BACKGROUND_COLOR]: "#000500",
        [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: "#000600",
        [TERMINAL_SELECTION_FOREGROUND_COLOR]: void 0,
        "terminal.ansiBlack": "#010000",
        "terminal.ansiRed": "#020000",
        "terminal.ansiGreen": "#030000",
        "terminal.ansiYellow": "#040000",
        "terminal.ansiBlue": "#050000",
        "terminal.ansiMagenta": "#060000",
        "terminal.ansiCyan": "#070000",
        "terminal.ansiWhite": "#080000",
        "terminal.ansiBrightBlack": "#090000",
        "terminal.ansiBrightRed": "#100000",
        "terminal.ansiBrightGreen": "#110000",
        "terminal.ansiBrightYellow": "#120000",
        "terminal.ansiBrightBlue": "#130000",
        "terminal.ansiBrightMagenta": "#140000",
        "terminal.ansiBrightCyan": "#150000",
        "terminal.ansiBrightWhite": "#160000"
      }));
      xterm = store.add(instantiationService.createInstance(XtermTerminal, void 0, XTermBaseCtor, {
        cols: 80,
        rows: 30,
        xtermAddonImporter: new TestXtermAddonImporter(),
        xtermColorProvider: { getBackgroundColor: () => void 0 },
        capabilities: store.add(new TerminalCapabilityStore()),
        disableShellIntegrationReporting: true
      }, void 0));
      deepStrictEqual(xterm.raw.options.theme, {
        background: void 0,
        foreground: "#000200",
        cursor: "#000300",
        cursorAccent: "#000400",
        selectionBackground: "#000500",
        selectionInactiveBackground: "#000600",
        selectionForeground: void 0,
        overviewRulerBorder: void 0,
        scrollbarSliderActiveBackground: void 0,
        scrollbarSliderBackground: void 0,
        scrollbarSliderHoverBackground: void 0,
        black: "#010000",
        green: "#030000",
        red: "#020000",
        yellow: "#040000",
        blue: "#050000",
        magenta: "#060000",
        cyan: "#070000",
        white: "#080000",
        brightBlack: "#090000",
        brightRed: "#100000",
        brightGreen: "#110000",
        brightYellow: "#120000",
        brightBlue: "#130000",
        brightMagenta: "#140000",
        brightCyan: "#150000",
        brightWhite: "#160000"
      });
      themeService.setTheme(new TestColorTheme({
        [TERMINAL_BACKGROUND_COLOR]: "#00010f",
        [TERMINAL_FOREGROUND_COLOR]: "#00020f",
        [TERMINAL_CURSOR_FOREGROUND_COLOR]: "#00030f",
        [TERMINAL_CURSOR_BACKGROUND_COLOR]: "#00040f",
        [TERMINAL_SELECTION_BACKGROUND_COLOR]: "#00050f",
        [TERMINAL_INACTIVE_SELECTION_BACKGROUND_COLOR]: "#00060f",
        [TERMINAL_SELECTION_FOREGROUND_COLOR]: "#00070f",
        "terminal.ansiBlack": "#01000f",
        "terminal.ansiRed": "#02000f",
        "terminal.ansiGreen": "#03000f",
        "terminal.ansiYellow": "#04000f",
        "terminal.ansiBlue": "#05000f",
        "terminal.ansiMagenta": "#06000f",
        "terminal.ansiCyan": "#07000f",
        "terminal.ansiWhite": "#08000f",
        "terminal.ansiBrightBlack": "#09000f",
        "terminal.ansiBrightRed": "#10000f",
        "terminal.ansiBrightGreen": "#11000f",
        "terminal.ansiBrightYellow": "#12000f",
        "terminal.ansiBrightBlue": "#13000f",
        "terminal.ansiBrightMagenta": "#14000f",
        "terminal.ansiBrightCyan": "#15000f",
        "terminal.ansiBrightWhite": "#16000f"
      }));
      deepStrictEqual(xterm.raw.options.theme, {
        background: void 0,
        foreground: "#00020f",
        cursor: "#00030f",
        cursorAccent: "#00040f",
        selectionBackground: "#00050f",
        selectionInactiveBackground: "#00060f",
        selectionForeground: "#00070f",
        overviewRulerBorder: void 0,
        scrollbarSliderActiveBackground: void 0,
        scrollbarSliderBackground: void 0,
        scrollbarSliderHoverBackground: void 0,
        black: "#01000f",
        green: "#03000f",
        red: "#02000f",
        yellow: "#04000f",
        blue: "#05000f",
        magenta: "#06000f",
        cyan: "#07000f",
        white: "#08000f",
        brightBlack: "#09000f",
        brightRed: "#10000f",
        brightGreen: "#11000f",
        brightYellow: "#12000f",
        brightBlue: "#13000f",
        brightMagenta: "#14000f",
        brightCyan: "#15000f",
        brightWhite: "#16000f"
      });
    });
  });
});
export {
  TestViewDescriptorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci94dGVybS94dGVybVRlcm1pbmFsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IENvbG9yLCBSR0JBIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29sb3JUaGVtZSwgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCwgU0lERV9CQVJfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3IsIElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBYdGVybVRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci94dGVybS94dGVybVRlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb24sIFRFUk1JTkFMX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvcnMsIFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX0NVUlNPUl9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9DVVJTT1JfRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfRk9SRUdST1VORF9DT0xPUiwgVEVSTUlOQUxfSU5BQ1RJVkVfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1IsIFRFUk1JTkFMX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SLCBURVJNSU5BTF9TRUxFQ1RJT05fRk9SRUdST1VORF9DT0xPUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXJtaW5hbENvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RXZWJnbEFkZG9uLCBUZXN0WHRlcm1BZGRvbkltcG9ydGVyIH0gZnJvbSAnLi94dGVybVRlc3RVdGlscy5qcyc7XG5cbnJlZ2lzdGVyQ29sb3JzKCk7XG5cbmV4cG9ydCBjbGFzcyBUZXN0Vmlld0Rlc2NyaXB0b3JTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlPiB7XG5cdHByaXZhdGUgX2xvY2F0aW9uID0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxvY2F0aW9uID0gbmV3IEVtaXR0ZXI8eyB2aWV3czogSVZpZXdEZXNjcmlwdG9yW107IGZyb206IFZpZXdDb250YWluZXJMb2NhdGlvbjsgdG86IFZpZXdDb250YWluZXJMb2NhdGlvbiB9PigpO1xuXHRvbkRpZENoYW5nZUxvY2F0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VMb2NhdGlvbi5ldmVudDtcblx0Z2V0Vmlld0xvY2F0aW9uQnlJZChpZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xvY2F0aW9uO1xuXHR9XG5cdG1vdmVUZXJtaW5hbFRvTG9jYXRpb24odG86IFZpZXdDb250YWluZXJMb2NhdGlvbikge1xuXHRcdGNvbnN0IG9sZExvY2F0aW9uID0gdGhpcy5fbG9jYXRpb247XG5cdFx0dGhpcy5fbG9jYXRpb24gPSB0bztcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxvY2F0aW9uLmZpcmUoe1xuXHRcdFx0dmlld3M6IFtcblx0XHRcdFx0eyBpZDogVEVSTUlOQUxfVklFV19JRCB9IGFzIHVua25vd24gYXMgSVZpZXdEZXNjcmlwdG9yXG5cdFx0XHRdLFxuXHRcdFx0ZnJvbTogb2xkTG9jYXRpb24sXG5cdFx0XHR0b1xuXHRcdH0pO1xuXHR9XG59XG5cbmNvbnN0IGRlZmF1bHRUZXJtaW5hbENvbmZpZzogUGFydGlhbDxJVGVybWluYWxDb25maWd1cmF0aW9uPiA9IHtcblx0Zm9udEZhbWlseTogJ21vbm9zcGFjZScsXG5cdGZvbnRXZWlnaHQ6ICdub3JtYWwnLFxuXHRmb250V2VpZ2h0Qm9sZDogJ25vcm1hbCcsXG5cdGdwdUFjY2VsZXJhdGlvbjogJ29mZicsXG5cdHNjcm9sbGJhY2s6IDEwLFxuXHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IDIsXG5cdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogMSxcblx0dW5pY29kZVZlcnNpb246ICc2J1xufTtcblxuc3VpdGUoJ1h0ZXJtVGVybWluYWwnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgdGhlbWVTZXJ2aWNlOiBUZXN0VGhlbWVTZXJ2aWNlO1xuXHRsZXQgeHRlcm06IFh0ZXJtVGVybWluYWw7XG5cdGxldCBYVGVybUJhc2VDdG9yOiB0eXBlb2YgVGVybWluYWw7XG5cblx0ZnVuY3Rpb24gd3JpdGUoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHR4dGVybS53cml0ZShkYXRhLCByZXNvbHZlKTtcblx0XHR9KTtcblx0fVxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0XHRcdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUVkaXRvck9wdGlvbnM+LFxuXHRcdFx0ZmlsZXM6IHt9LFxuXHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0aW50ZWdyYXRlZDogZGVmYXVsdFRlcm1pbmFsQ29uZmlnXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZVxuXHRcdH0sIHN0b3JlKTtcblx0XHR0aGVtZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVRoZW1lU2VydmljZSkgYXMgVGVzdFRoZW1lU2VydmljZTtcblxuXHRcdFhUZXJtQmFzZUN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cblx0XHRjb25zdCBjYXBhYmlsaXR5U3RvcmUgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFh0ZXJtVGVybWluYWwsIHVuZGVmaW5lZCwgWFRlcm1CYXNlQ3Rvciwge1xuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiAzMCxcblx0XHRcdHh0ZXJtQ29sb3JQcm92aWRlcjogeyBnZXRCYWNrZ3JvdW5kQ29sb3I6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBjYXBhYmlsaXR5U3RvcmUsXG5cdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZzogdHJ1ZSxcblx0XHRcdHh0ZXJtQWRkb25JbXBvcnRlcjogbmV3IFRlc3RYdGVybUFkZG9uSW1wb3J0ZXIoKSxcblx0XHR9LCB1bmRlZmluZWQpKTtcblxuXHRcdFRlc3RXZWJnbEFkZG9uLnNob3VsZFRocm93ID0gZmFsc2U7XG5cdFx0VGVzdFdlYmdsQWRkb24uaXNFbmFibGVkID0gZmFsc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB1c2UgZmFsbGJhY2sgZGltZW5zaW9ucyBvZiA4MHgzMCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbCh4dGVybS5yYXcuY29scywgODApO1xuXHRcdHN0cmljdEVxdWFsKHh0ZXJtLnJhdy5yb3dzLCAzMCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRDb250ZW50c0FzVGV4dCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGFsbCBidWZmZXIgY29udGVudHMgd2hlbiBubyBtYXJrZXJzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dCgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0c1dpdGgoJ2xpbmUgMVxcbmxpbmUgMlxcbmxpbmUgM1xcbmxpbmUgNFxcbmxpbmUgNScpLCB0cnVlLCAnU2hvdWxkIGluY2x1ZGUgdGhlIGNvbnRlbnQgcGx1cyBlbXB0eSBsaW5lcyB1cCB0byBidWZmZXIgbGVuZ3RoJyk7XG5cdFx0XHRjb25zdCBsaW5lcyA9IHJlc3VsdC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChsaW5lcy5sZW5ndGgsIHh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCwgJ1Nob3VsZCBlbmQgd2l0aCBlbXB0eSBsaW5lcyAodG90YWwgYnVmZmVyIHNpemUgaXMgMzAgcm93cyknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29udGVudHMgZnJvbSBzdGFydCBtYXJrZXIgdG8gZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbicpO1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dChzdGFydE1hcmtlcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRzV2l0aCgnbGluZSAyXFxubGluZSAzXFxubGluZSA0XFxubGluZSA1JyksIHRydWUsICdTaG91bGQgc3RhcnQgd2l0aCBsaW5lIDIgYW5kIGluY2x1ZGUgZW1wdHkgbGluZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gY29udGVudHMgZnJvbSBzdGFydCB0byBlbmQgbWFya2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbicpO1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMlxcclxcbmxpbmUgM1xcclxcbicpO1xuXHRcdFx0Y29uc3QgZW5kTWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDRcXHJcXG5saW5lIDUnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoc3RhcnRNYXJrZXIsIGVuZE1hcmtlcik7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdsaW5lIDJcXG5saW5lIDNcXG5saW5lIDQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gc2luZ2xlIGxpbmUgd2hlbiBzdGFydCBhbmQgZW5kIG1hcmtlcnMgYXJlIHRoZSBzYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDNcXHJcXG5saW5lIDRcXHJcXG5saW5lIDUnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQobWFya2VyLCBtYXJrZXIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnbGluZSAzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IHN0cmluZyB3aGVuIHN0YXJ0IG1hcmtlciBpcyBiZXlvbmQgZW5kIG1hcmtlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDFcXHJcXG4nKTtcblx0XHRcdGNvbnN0IGVuZE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSAyXFxyXFxubGluZSAzXFxyXFxuJyk7XG5cdFx0XHRjb25zdCBzdGFydE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSA0XFxyXFxubGluZSA1Jyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KHN0YXJ0TWFya2VyLCBlbmRNYXJrZXIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGJ1ZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KCk7XG5cdFx0XHRjb25zdCBsaW5lcyA9IHJlc3VsdC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChsaW5lcy5sZW5ndGgsIHh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlLmxlbmd0aCwgJ0VtcHR5IHRlcm1pbmFsIHNob3VsZCBoYXZlIGVtcHR5IGxpbmVzIGVxdWFsIHRvIGJ1ZmZlciBsZW5ndGgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGxpbmVzLmV2ZXJ5KGxpbmUgPT4gbGluZSA9PT0gJycpLCB0cnVlLCAnQWxsIGxpbmVzIHNob3VsZCBiZSBlbXB0eScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCBjb250ZW50IHdpdGggc3BhY2VzIGFuZCBzcGVjaWFsIGNoYXJhY3RlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3cml0ZSgnaGVsbG8gd29ybGRcXHJcXG4gIGluZGVudGVkIGxpbmVcXHJcXG5saW5lIHdpdGggJHBlY2lhbCBjaGFycyFAI1xcclxcblxcclxcbmVtcHR5IGxpbmUgYWJvdmUnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0geHRlcm0uZ2V0Q29udGVudHNBc1RleHQoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5zdGFydHNXaXRoKCdoZWxsbyB3b3JsZFxcbiAgaW5kZW50ZWQgbGluZVxcbmxpbmUgd2l0aCAkcGVjaWFsIGNoYXJzIUAjXFxuXFxuZW1wdHkgbGluZSBhYm92ZScpLCB0cnVlLCAnU2hvdWxkIGhhbmRsZSBzcGFjZXMgYW5kIHNwZWNpYWwgY2hhcmFjdGVycyBjb3JyZWN0bHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gbGluZSAwIHdoZW4gc3RhcnRNYXJrZXIgaXMgZGlzcG9zZWQgKGxpbmUgPT09IC0xKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDFcXHJcXG4nKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2VkTWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDJcXHJcXG5saW5lIDNcXHJcXG5saW5lIDRcXHJcXG5saW5lIDUnKTtcblxuXHRcdFx0ZGlzcG9zZWRNYXJrZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB4dGVybS5nZXRDb250ZW50c0FzVGV4dChkaXNwb3NlZE1hcmtlcik7XG5cdFx0XHQvLyBTaG91bGQgcmV0dXJuIGNvbnRlbnQgZnJvbSBsaW5lIDAgKGluY2x1ZGluZyBsaW5lIDEpIGluc3RlYWQgb2YgdGhyb3dpbmdcblx0XHRcdG9rKHJlc3VsdC5zdGFydHNXaXRoKCdsaW5lIDFcXG5saW5lIDJcXG5saW5lIDNcXG5saW5lIDRcXG5saW5lIDUnKSwgYFVuZXhwZWN0ZWQgcmVzdWx0OiAke3Jlc3VsdH1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIGVuZE1hcmtlciBpcyBkaXNwb3NlZCAobGluZSA9PT0gLTEpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMVxcclxcbicpO1xuXHRcdFx0Y29uc3Qgc3RhcnRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgMlxcclxcbicpO1xuXHRcdFx0Y29uc3QgZGlzcG9zZWRFbmRNYXJrZXIgPSB4dGVybS5yYXcucmVnaXN0ZXJNYXJrZXIoMCkhO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ2xpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNScpO1xuXG5cdFx0XHRkaXNwb3NlZEVuZE1hcmtlci5kaXNwb3NlKCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KHN0YXJ0TWFya2VyLCBkaXNwb3NlZEVuZE1hcmtlcik7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgZXJyb3Igd2FzIG5vdCB0aHJvd24nKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoZXJyb3IubWVzc2FnZSwgJ0Nhbm5vdCBnZXQgY29udGVudHMgb2YgYSBkaXNwb3NlZCBlbmRNYXJrZXInKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWFya2VycyBhdCBidWZmZXIgYm91bmRhcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyID0geHRlcm0ucmF3LnJlZ2lzdGVyTWFya2VyKDApITtcblx0XHRcdGF3YWl0IHdyaXRlKCdsaW5lIDFcXHJcXG5saW5lIDJcXHJcXG5saW5lIDNcXHJcXG5saW5lIDRcXHJcXG4nKTtcblx0XHRcdGNvbnN0IGVuZE1hcmtlciA9IHh0ZXJtLnJhdy5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRhd2FpdCB3cml0ZSgnbGluZSA1Jyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KHN0YXJ0TWFya2VyLCBlbmRNYXJrZXIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnbGluZSAxXFxubGluZSAyXFxubGluZSAzXFxubGluZSA0XFxubGluZSA1JywgJ1Nob3VsZCBoYW5kbGUgbWFya2VycyBhdCBidWZmZXIgYm91bmRhcmllcyBjb3JyZWN0bHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgdGVybWluYWwgZXNjYXBlIHNlcXVlbmNlcyBwcm9wZXJseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdyaXRlKCdcXHgxYlszMW1yZWQgdGV4dFxceDFiWzBtXFxyXFxuXFx4MWJbMzJtZ3JlZW4gdGV4dFxceDFiWzBtJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHh0ZXJtLmdldENvbnRlbnRzQXNUZXh0KCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRzV2l0aCgncmVkIHRleHRcXG5ncmVlbiB0ZXh0JyksIHRydWUsICdBTlNJIGVzY2FwZSBzZXF1ZW5jZXMgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCwgYnV0IHRoZXJlIHdpbGwgYmUgdHJhaWxpbmcgZW1wdHkgbGluZXMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEJ1ZmZlclJldmVyc2VJdGVyYXRvcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZ2V0IHRleHQgcHJvcGVybHkgd2l0aGluIHNjcm9sbGJhY2sgbGltaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNSc7XG5cdFx0XHRhd2FpdCB3cml0ZSh0ZXh0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gWy4uLnh0ZXJtLmdldEJ1ZmZlclJldmVyc2VJdGVyYXRvcigpXS5yZXZlcnNlKCkuam9pbignXFxyXFxuJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXh0LCByZXN1bHQsICdTaG91bGQgZXF1YWwgb3JpZ2luYWwgdGV4dCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBnZXQgdGV4dCBwcm9wZXJseSB3aGVuIGV4Y2VlZCBzY3JvbGxiYWNrIGxpbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gbWF4IGJ1ZmZlciBsaW5lcyg0MCkgPSByb3dzKDMwKSArIHNjcm9sbGJhY2soMTApXG5cdFx0XHRjb25zdCB0ZXh0ID0gJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNVxcclxcbicucmVwZWF0KDgpLnRyaW0oKTtcblx0XHRcdGF3YWl0IHdyaXRlKHRleHQpO1xuXHRcdFx0YXdhaXQgd3JpdGUoJ1xcclxcbmxpbmUgbW9yZScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBbLi4ueHRlcm0uZ2V0QnVmZmVyUmV2ZXJzZUl0ZXJhdG9yKCldLnJldmVyc2UoKS5qb2luKCdcXHJcXG4nKTtcblx0XHRcdGNvbnN0IGV4cGVjdCA9IHRleHQuc2xpY2UoOCkgKyAnXFxyXFxubGluZSBtb3JlJztcblx0XHRcdHN0cmljdEVxdWFsKGV4cGVjdCwgcmVzdWx0LCAnU2hvdWxkIGVxdWFsIG9yaWdpbmFsIHRleHQgd2l0aG91dCBsaW5lIDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RoZW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhcHBseSBjb3JyZWN0IGJhY2tncm91bmQgY29sb3IgYmFzZWQgb24gZ2V0QmFja2dyb3VuZENvbG9yJywgKCkgPT4ge1xuXHRcdFx0dGhlbWVTZXJ2aWNlLnNldFRoZW1lKG5ldyBUZXN0Q29sb3JUaGVtZSh7XG5cdFx0XHRcdFtQQU5FTF9CQUNLR1JPVU5EXTogJyNmZjAwMDAnLFxuXHRcdFx0XHRbU0lERV9CQVJfQkFDS0dST1VORF06ICcjMDBmZjAwJ1xuXHRcdFx0fSkpO1xuXHRcdFx0eHRlcm0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdW5kZWZpbmVkLCBYVGVybUJhc2VDdG9yLCB7XG5cdFx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0XHRyb3dzOiAzMCxcblx0XHRcdFx0eHRlcm1BZGRvbkltcG9ydGVyOiBuZXcgVGVzdFh0ZXJtQWRkb25JbXBvcnRlcigpLFxuXHRcdFx0XHR4dGVybUNvbG9yUHJvdmlkZXI6IHsgZ2V0QmFja2dyb3VuZENvbG9yOiAoKSA9PiBuZXcgQ29sb3IobmV3IFJHQkEoMjU1LCAwLCAwKSkgfSxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpLFxuXHRcdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZzogdHJ1ZSxcblx0XHRcdH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0c3RyaWN0RXF1YWwoeHRlcm0ucmF3Lm9wdGlvbnMudGhlbWU/LmJhY2tncm91bmQsICcjZmYwMDAwJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlYWN0IHRvIGFuZCBhcHBseSB0aGVtZSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0dGhlbWVTZXJ2aWNlLnNldFRoZW1lKG5ldyBUZXN0Q29sb3JUaGVtZSh7XG5cdFx0XHRcdFtURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDAxMDAnLFxuXHRcdFx0XHRbVEVSTUlOQUxfRk9SRUdST1VORF9DT0xPUl06ICcjMDAwMjAwJyxcblx0XHRcdFx0W1RFUk1JTkFMX0NVUlNPUl9GT1JFR1JPVU5EX0NPTE9SXTogJyMwMDAzMDAnLFxuXHRcdFx0XHRbVEVSTUlOQUxfQ1VSU09SX0JBQ0tHUk9VTkRfQ09MT1JdOiAnIzAwMDQwMCcsXG5cdFx0XHRcdFtURVJNSU5BTF9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUl06ICcjMDAwNTAwJyxcblx0XHRcdFx0W1RFUk1JTkFMX0lOQUNUSVZFX1NFTEVDVElPTl9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDA2MDAnLFxuXHRcdFx0XHRbVEVSTUlOQUxfU0VMRUNUSU9OX0ZPUkVHUk9VTkRfQ09MT1JdOiB1bmRlZmluZWQsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQmxhY2snOiAnIzAxMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpUmVkJzogJyMwMjAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUdyZWVuJzogJyMwMzAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVllbGxvdyc6ICcjMDQwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCbHVlJzogJyMwNTAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaU1hZ2VudGEnOiAnIzA2MDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQ3lhbic6ICcjMDcwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lXaGl0ZSc6ICcjMDgwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRCbGFjayc6ICcjMDkwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRSZWQnOiAnIzEwMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0R3JlZW4nOiAnIzExMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0WWVsbG93JzogJyMxMjAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodEJsdWUnOiAnIzEzMDAwMCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0TWFnZW50YSc6ICcjMTQwMDAwJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRDeWFuJzogJyMxNTAwMDAnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodFdoaXRlJzogJyMxNjAwMDAnLFxuXHRcdFx0fSkpO1xuXHRcdFx0eHRlcm0gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdW5kZWZpbmVkLCBYVGVybUJhc2VDdG9yLCB7XG5cdFx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0XHRyb3dzOiAzMCxcblx0XHRcdFx0eHRlcm1BZGRvbkltcG9ydGVyOiBuZXcgVGVzdFh0ZXJtQWRkb25JbXBvcnRlcigpLFxuXHRcdFx0XHR4dGVybUNvbG9yUHJvdmlkZXI6IHsgZ2V0QmFja2dyb3VuZENvbG9yOiAoKSA9PiB1bmRlZmluZWQgfSxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpLFxuXHRcdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZzogdHJ1ZVxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoeHRlcm0ucmF3Lm9wdGlvbnMudGhlbWUsIHtcblx0XHRcdFx0YmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmb3JlZ3JvdW5kOiAnIzAwMDIwMCcsXG5cdFx0XHRcdGN1cnNvcjogJyMwMDAzMDAnLFxuXHRcdFx0XHRjdXJzb3JBY2NlbnQ6ICcjMDAwNDAwJyxcblx0XHRcdFx0c2VsZWN0aW9uQmFja2dyb3VuZDogJyMwMDA1MDAnLFxuXHRcdFx0XHRzZWxlY3Rpb25JbmFjdGl2ZUJhY2tncm91bmQ6ICcjMDAwNjAwJyxcblx0XHRcdFx0c2VsZWN0aW9uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNjcm9sbGJhclNsaWRlckFjdGl2ZUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Nyb2xsYmFyU2xpZGVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzY3JvbGxiYXJTbGlkZXJIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0YmxhY2s6ICcjMDEwMDAwJyxcblx0XHRcdFx0Z3JlZW46ICcjMDMwMDAwJyxcblx0XHRcdFx0cmVkOiAnIzAyMDAwMCcsXG5cdFx0XHRcdHllbGxvdzogJyMwNDAwMDAnLFxuXHRcdFx0XHRibHVlOiAnIzA1MDAwMCcsXG5cdFx0XHRcdG1hZ2VudGE6ICcjMDYwMDAwJyxcblx0XHRcdFx0Y3lhbjogJyMwNzAwMDAnLFxuXHRcdFx0XHR3aGl0ZTogJyMwODAwMDAnLFxuXHRcdFx0XHRicmlnaHRCbGFjazogJyMwOTAwMDAnLFxuXHRcdFx0XHRicmlnaHRSZWQ6ICcjMTAwMDAwJyxcblx0XHRcdFx0YnJpZ2h0R3JlZW46ICcjMTEwMDAwJyxcblx0XHRcdFx0YnJpZ2h0WWVsbG93OiAnIzEyMDAwMCcsXG5cdFx0XHRcdGJyaWdodEJsdWU6ICcjMTMwMDAwJyxcblx0XHRcdFx0YnJpZ2h0TWFnZW50YTogJyMxNDAwMDAnLFxuXHRcdFx0XHRicmlnaHRDeWFuOiAnIzE1MDAwMCcsXG5cdFx0XHRcdGJyaWdodFdoaXRlOiAnIzE2MDAwMCcsXG5cdFx0XHR9KTtcblx0XHRcdHRoZW1lU2VydmljZS5zZXRUaGVtZShuZXcgVGVzdENvbG9yVGhlbWUoe1xuXHRcdFx0XHRbVEVSTUlOQUxfQkFDS0dST1VORF9DT0xPUl06ICcjMDAwMTBmJyxcblx0XHRcdFx0W1RFUk1JTkFMX0ZPUkVHUk9VTkRfQ09MT1JdOiAnIzAwMDIwZicsXG5cdFx0XHRcdFtURVJNSU5BTF9DVVJTT1JfRk9SRUdST1VORF9DT0xPUl06ICcjMDAwMzBmJyxcblx0XHRcdFx0W1RFUk1JTkFMX0NVUlNPUl9CQUNLR1JPVU5EX0NPTE9SXTogJyMwMDA0MGYnLFxuXHRcdFx0XHRbVEVSTUlOQUxfU0VMRUNUSU9OX0JBQ0tHUk9VTkRfQ09MT1JdOiAnIzAwMDUwZicsXG5cdFx0XHRcdFtURVJNSU5BTF9JTkFDVElWRV9TRUxFQ1RJT05fQkFDS0dST1VORF9DT0xPUl06ICcjMDAwNjBmJyxcblx0XHRcdFx0W1RFUk1JTkFMX1NFTEVDVElPTl9GT1JFR1JPVU5EX0NPTE9SXTogJyMwMDA3MGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJsYWNrJzogJyMwMTAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVJlZCc6ICcjMDIwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lHcmVlbic6ICcjMDMwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lZZWxsb3cnOiAnIzA0MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQmx1ZSc6ICcjMDUwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lNYWdlbnRhJzogJyMwNjAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUN5YW4nOiAnIzA3MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpV2hpdGUnOiAnIzA4MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0QmxhY2snOiAnIzA5MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0UmVkJzogJyMxMDAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodEdyZWVuJzogJyMxMTAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodFllbGxvdyc6ICcjMTIwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRCbHVlJzogJyMxMzAwMGYnLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaUJyaWdodE1hZ2VudGEnOiAnIzE0MDAwZicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQnJpZ2h0Q3lhbic6ICcjMTUwMDBmJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCcmlnaHRXaGl0ZSc6ICcjMTYwMDBmJyxcblx0XHRcdH0pKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh4dGVybS5yYXcub3B0aW9ucy50aGVtZSwge1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZvcmVncm91bmQ6ICcjMDAwMjBmJyxcblx0XHRcdFx0Y3Vyc29yOiAnIzAwMDMwZicsXG5cdFx0XHRcdGN1cnNvckFjY2VudDogJyMwMDA0MGYnLFxuXHRcdFx0XHRzZWxlY3Rpb25CYWNrZ3JvdW5kOiAnIzAwMDUwZicsXG5cdFx0XHRcdHNlbGVjdGlvbkluYWN0aXZlQmFja2dyb3VuZDogJyMwMDA2MGYnLFxuXHRcdFx0XHRzZWxlY3Rpb25Gb3JlZ3JvdW5kOiAnIzAwMDcwZicsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Nyb2xsYmFyU2xpZGVyQWN0aXZlQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzY3JvbGxiYXJTbGlkZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNjcm9sbGJhclNsaWRlckhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRibGFjazogJyMwMTAwMGYnLFxuXHRcdFx0XHRncmVlbjogJyMwMzAwMGYnLFxuXHRcdFx0XHRyZWQ6ICcjMDIwMDBmJyxcblx0XHRcdFx0eWVsbG93OiAnIzA0MDAwZicsXG5cdFx0XHRcdGJsdWU6ICcjMDUwMDBmJyxcblx0XHRcdFx0bWFnZW50YTogJyMwNjAwMGYnLFxuXHRcdFx0XHRjeWFuOiAnIzA3MDAwZicsXG5cdFx0XHRcdHdoaXRlOiAnIzA4MDAwZicsXG5cdFx0XHRcdGJyaWdodEJsYWNrOiAnIzA5MDAwZicsXG5cdFx0XHRcdGJyaWdodFJlZDogJyMxMDAwMGYnLFxuXHRcdFx0XHRicmlnaHRHcmVlbjogJyMxMTAwMGYnLFxuXHRcdFx0XHRicmlnaHRZZWxsb3c6ICcjMTIwMDBmJyxcblx0XHRcdFx0YnJpZ2h0Qmx1ZTogJyMxMzAwMGYnLFxuXHRcdFx0XHRicmlnaHRNYWdlbnRhOiAnIzE0MDAwZicsXG5cdFx0XHRcdGJyaWdodEN5YW46ICcjMTUwMDBmJyxcblx0XHRcdFx0YnJpZ2h0V2hpdGU6ICcjMTYwMDBmJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxpQkFBaUIsSUFB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QUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsTUFDZCxDQUFDO0FBQ0QsbUJBQWEsU0FBUyxJQUFJLGVBQWU7QUFBQSxRQUN4QyxDQUFDLHlCQUF5QixHQUFHO0FBQUEsUUFDN0IsQ0FBQyx5QkFBeUIsR0FBRztBQUFBLFFBQzdCLENBQUMsZ0NBQWdDLEdBQUc7QUFBQSxRQUNwQyxDQUFDLGdDQUFnQyxHQUFHO0FBQUEsUUFDcEMsQ0FBQyxtQ0FBbUMsR0FBRztBQUFBLFFBQ3ZDLENBQUMsNENBQTRDLEdBQUc7QUFBQSxRQUNoRCxDQUFDLG1DQUFtQyxHQUFHO0FBQUEsUUFDdkMsc0JBQXNCO0FBQUEsUUFDdEIsb0JBQW9CO0FBQUEsUUFDcEIsc0JBQXNCO0FBQUEsUUFDdEIsdUJBQXVCO0FBQUEsUUFDdkIscUJBQXFCO0FBQUEsUUFDckIsd0JBQXdCO0FBQUEsUUFDeEIscUJBQXFCO0FBQUEsUUFDckIsc0JBQXNCO0FBQUEsUUFDdEIsNEJBQTRCO0FBQUEsUUFDNUIsMEJBQTBCO0FBQUEsUUFDMUIsNEJBQTRCO0FBQUEsUUFDNUIsNkJBQTZCO0FBQUEsUUFDN0IsMkJBQTJCO0FBQUEsUUFDM0IsOEJBQThCO0FBQUEsUUFDOUIsMkJBQTJCO0FBQUEsUUFDM0IsNEJBQTRCO0FBQUEsTUFDN0IsQ0FBQyxDQUFDO0FBQ0Ysc0JBQWdCLE1BQU0sSUFBSSxRQUFRLE9BQU87QUFBQSxRQUN4QyxZQUFZO0FBQUEsUUFDWixZQUFZO0FBQUEsUUFDWixRQUFRO0FBQUEsUUFDUixjQUFjO0FBQUEsUUFDZCxxQkFBcUI7QUFBQSxRQUNyQiw2QkFBNkI7QUFBQSxRQUM3QixxQkFBcUI7QUFBQSxRQUNyQixxQkFBcUI7QUFBQSxRQUNyQixpQ0FBaUM7QUFBQSxRQUNqQywyQkFBMkI7QUFBQSxRQUMzQixnQ0FBZ0M7QUFBQSxRQUNoQyxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsUUFDYixjQUFjO0FBQUEsUUFDZCxZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsTUFDZCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
