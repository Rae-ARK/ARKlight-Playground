import { deepStrictEqual, strictEqual } from "assert";
import { equals } from "../../../../../../base/common/arrays.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextMenuService } from "../../../../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { IViewDescriptorService } from "../../../../../common/views.js";
import { TerminalLinkManager } from "../../browser/terminalLinkManager.js";
import { TestViewDescriptorService } from "../../../../terminal/test/browser/xterm/xtermTerminal.test.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../base/common/async.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
const defaultTerminalConfig = {
  fontFamily: "monospace",
  fontWeight: "normal",
  fontWeightBold: "normal",
  gpuAcceleration: "off",
  scrollback: 1e3,
  fastScrollSensitivity: 2,
  mouseWheelScrollSensitivity: 1,
  unicodeVersion: "11",
  wordSeparators: " ()[]{}',\"`\u2500\u2018\u2019\u201C\u201D"
};
class TestLinkManager extends TerminalLinkManager {
  async _getLinksForType(y, type) {
    switch (type) {
      case "word":
        return this._links?.wordLinks?.[y] ? [this._links?.wordLinks?.[y]] : void 0;
      case "url":
        return this._links?.webLinks?.[y] ? [this._links?.webLinks?.[y]] : void 0;
      case "localFile":
        return this._links?.fileLinks?.[y] ? [this._links?.fileLinks?.[y]] : void 0;
    }
  }
  setLinks(links) {
    this._links = links;
  }
}
suite("TerminalLinkManager", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let themeService;
  let viewDescriptorService;
  let xterm;
  let linkManager;
  setup(async () => {
    configurationService = new TestConfigurationService({
      editor: {
        fastScrollSensitivity: 2,
        mouseWheelScrollSensitivity: 1
      },
      terminal: {
        integrated: defaultTerminalConfig
      }
    });
    themeService = new TestThemeService();
    viewDescriptorService = new TestViewDescriptorService();
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IStorageService, store.add(new TestStorageService()));
    instantiationService.stub(IThemeService, themeService);
    instantiationService.stub(IViewDescriptorService, viewDescriptorService);
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
    linkManager = store.add(instantiationService.createInstance(TestLinkManager, xterm, upcastPartial({
      get initialCwd() {
        return "";
      }
      // eslint-disable-next-line local/code-no-any-casts
    }), {
      get(capability) {
        return void 0;
      }
    }, instantiationService.createInstance(TerminalLinkResolver)));
  });
  suite("registerExternalLinkProvider", () => {
    test("should not leak disposables if the link manager is already disposed", () => {
      linkManager.externalProvideLinksCb = async () => void 0;
      linkManager.dispose();
      linkManager.externalProvideLinksCb = async () => void 0;
    });
  });
  function overrideXtermEvent(terminal, eventName, handler) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(terminal), eventName);
    Object.defineProperty(terminal, eventName, { value: handler, configurable: true });
    return {
      dispose: () => {
        if (originalDescriptor) {
          Object.defineProperty(terminal, eventName, originalDescriptor);
        } else {
          delete terminal[eventName];
        }
      }
    };
  }
  function mockXtermCoreRenderService() {
    const xtermWithCore = xterm;
    const origRenderService = xtermWithCore._core?._renderService;
    if (!xtermWithCore._core) {
      xtermWithCore._core = {};
    }
    xtermWithCore._core._renderService = { dimensions: { css: { cell: { width: 8, height: 16 } } }, _renderer: {} };
    return {
      dispose: () => {
        xtermWithCore._core._renderService = origRenderService;
      }
    };
  }
  suite("OSC 8 hover", () => {
    test("should cancel delayed tooltip when leave happens before hover delay", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await configurationService.setUserConfiguration("workbench.hover.delay", 10);
      const linkHandler = xterm.options.linkHandler;
      if (!linkHandler?.hover || !linkHandler.leave) {
        throw new Error("Expected linkHandler with hover/leave callbacks");
      }
      let hoverShownCount = 0;
      const testableLinkManager = linkManager;
      const originalShowHover = testableLinkManager._showHover;
      testableLinkManager._showHover = () => {
        hoverShownCount++;
        return void 0;
      };
      const range = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
      const event = new MouseEvent("mousemove");
      try {
        linkHandler.hover(event, "http://example.com", range);
        linkHandler.leave(event, "http://example.com", range);
        await timeout(0);
        strictEqual(hoverShownCount, 0);
      } finally {
        testableLinkManager._showHover = originalShowHover;
      }
    }));
    async function assertHoverDismissedOnEvent(overrideEvent) {
      await configurationService.setUserConfiguration("workbench.hover.delay", 0);
      const linkHandler = xterm.options.linkHandler;
      if (!linkHandler?.hover) {
        throw new Error("Expected linkHandler with hover callback");
      }
      let hoverDisposed = false;
      const testableLinkManager = linkManager;
      const originalShowHover = testableLinkManager._showHover;
      testableLinkManager._showHover = () => ({
        dispose: () => {
          hoverDisposed = true;
        }
      });
      const renderServiceRestore = mockXtermCoreRenderService();
      const range = { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } };
      let fireEvent;
      const eventRestore = overrideEvent((fn) => {
        fireEvent = fn;
      });
      try {
        linkHandler.hover(new MouseEvent("mousemove"), "http://example.com", range);
        await timeout(0);
        strictEqual(hoverDisposed, false);
        fireEvent?.();
        strictEqual(hoverDisposed, true);
      } finally {
        eventRestore.dispose();
        renderServiceRestore.dispose();
        testableLinkManager._showHover = originalShowHover;
      }
    }
    test("should dismiss shown tooltip on scroll", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await assertHoverDismissedOnEvent((setFire) => {
        return overrideXtermEvent(xterm, "onScroll", (listener) => {
          setFire(() => listener(1));
          return { dispose: () => {
          } };
        });
      });
    }));
    test("should dismiss shown tooltip on render", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      await assertHoverDismissedOnEvent((setFire) => {
        return overrideXtermEvent(xterm, "onRender", (listener) => {
          setFire(() => listener({ start: 0, end: 5 }));
          return { dispose: () => {
          } };
        });
      });
    }));
  });
  suite("link hover invalidation", () => {
    test("replacing or invalidating a link hover disposes the previous hover and its invalidation listener", () => {
      instantiationService.stub(IHoverService, upcastPartial({}));
      const disposedAttached = [];
      linkManager.setWidgetManager(upcastPartial({
        attachWidget: (widget) => {
          const index = disposedAttached.push(false) - 1;
          return { dispose: () => {
            disposedAttached[index] = true;
            widget.dispose();
          } };
        }
      }));
      const showHover = linkManager._showHover.bind(linkManager);
      const onInvalidated1 = store.add(new Emitter());
      const onInvalidated2 = store.add(new Emitter());
      const link1 = upcastPartial({ onInvalidated: onInvalidated1.event });
      const link2 = upcastPartial({ onInvalidated: onInvalidated2.event });
      const targetOptions = upcastPartial({});
      showHover(targetOptions, new MarkdownString("hover"), void 0, () => {
      }, link1);
      showHover(targetOptions, new MarkdownString("hover"), void 0, () => {
      }, link2);
      onInvalidated2.fire();
      deepStrictEqual(disposedAttached, [true, true]);
    });
  });
  suite("getLinks and open recent link", () => {
    test("should return no links", async () => {
      const links = await linkManager.getLinks();
      equals(links.viewport.webLinks, []);
      equals(links.viewport.wordLinks, []);
      equals(links.viewport.fileLinks, []);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return word links in order", async () => {
      const link1 = {
        range: {
          start: { x: 1, y: 1 },
          end: { x: 14, y: 1 }
        },
        text: "1_\u6211\u662F\u5B66\u751F.txt",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: {
          start: { x: 1, y: 1 },
          end: { x: 14, y: 1 }
        },
        text: "2_\u6211\u662F\u5B66\u751F.txt",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ wordLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.wordLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.wordLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return web links in order", async () => {
      const link1 = {
        range: { start: { x: 5, y: 1 }, end: { x: 40, y: 1 } },
        text: "https://foo.bar/[this is foo site 1]",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: { start: { x: 5, y: 2 }, end: { x: 40, y: 2 } },
        text: "https://foo.bar/[this is foo site 2]",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ webLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.webLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.webLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, link2);
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, void 0);
    });
    test("should return file links in order", async () => {
      const link1 = {
        range: { start: { x: 1, y: 1 }, end: { x: 32, y: 1 } },
        text: "file:///C:/users/test/file_1.txt",
        activate: () => Promise.resolve("")
      };
      const link2 = {
        range: { start: { x: 1, y: 2 }, end: { x: 32, y: 2 } },
        text: "file:///C:/users/test/file_2.txt",
        activate: () => Promise.resolve("")
      };
      linkManager.setLinks({ fileLinks: [link1, link2] });
      const links = await linkManager.getLinks();
      deepStrictEqual(links.viewport.fileLinks?.[0].text, link2.text);
      deepStrictEqual(links.viewport.fileLinks?.[1].text, link1.text);
      const webLink = await linkManager.openRecentLink("url");
      strictEqual(webLink, void 0);
      linkManager.setLinks({ fileLinks: [link2] });
      const fileLink = await linkManager.openRecentLink("localFile");
      strictEqual(fileLink, link2);
    });
  });
});
function upcastPartial(v) {
  return v;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxMaW5rTWFuYWdlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0TWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElEZXRlY3RlZExpbmtzLCBUZXJtaW5hbExpbmtNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExpbmtNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENhcGFiaWxpdHlJbXBsTWFwLCBJVGVybWluYWxDYXBhYmlsaXR5U3RvcmUsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb24sIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIveHRlcm0veHRlcm1UZXJtaW5hbC50ZXN0LmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElMaW5rLCBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBJWHRlcm1Db3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci94dGVybS1wcml2YXRlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTGlua1Jlc29sdmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExpbmtSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTGlua0hvdmVyVGFyZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvd2lkZ2V0cy90ZXJtaW5hbEhvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsV2lkZ2V0TWFuYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvd2lkZ2V0cy93aWRnZXRNYW5hZ2VyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTGluayB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rLmpzJztcblxuY29uc3QgZGVmYXVsdFRlcm1pbmFsQ29uZmlnOiBQYXJ0aWFsPElUZXJtaW5hbENvbmZpZ3VyYXRpb24+ID0ge1xuXHRmb250RmFtaWx5OiAnbW9ub3NwYWNlJyxcblx0Zm9udFdlaWdodDogJ25vcm1hbCcsXG5cdGZvbnRXZWlnaHRCb2xkOiAnbm9ybWFsJyxcblx0Z3B1QWNjZWxlcmF0aW9uOiAnb2ZmJyxcblx0c2Nyb2xsYmFjazogMTAwMCxcblx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiAyLFxuXHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IDEsXG5cdHVuaWNvZGVWZXJzaW9uOiAnMTEnLFxuXHR3b3JkU2VwYXJhdG9yczogJyAoKVtde31cXCcsXCJgXHUyNTAwXHUyMDE4XHUyMDE5XHUyMDFDXHUyMDFEJ1xufTtcblxuY2xhc3MgVGVzdExpbmtNYW5hZ2VyIGV4dGVuZHMgVGVybWluYWxMaW5rTWFuYWdlciB7XG5cdHByaXZhdGUgX2xpbmtzOiBJRGV0ZWN0ZWRMaW5rcyB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9nZXRMaW5rc0ZvclR5cGUoeTogbnVtYmVyLCB0eXBlOiAnd29yZCcgfCAndXJsJyB8ICdsb2NhbEZpbGUnKTogUHJvbWlzZTxJTGlua1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlICd3b3JkJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2xpbmtzPy53b3JkTGlua3M/Llt5XSA/IFt0aGlzLl9saW5rcz8ud29yZExpbmtzPy5beV1dIDogdW5kZWZpbmVkO1xuXHRcdFx0Y2FzZSAndXJsJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2xpbmtzPy53ZWJMaW5rcz8uW3ldID8gW3RoaXMuX2xpbmtzPy53ZWJMaW5rcz8uW3ldXSA6IHVuZGVmaW5lZDtcblx0XHRcdGNhc2UgJ2xvY2FsRmlsZSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9saW5rcz8uZmlsZUxpbmtzPy5beV0gPyBbdGhpcy5fbGlua3M/LmZpbGVMaW5rcz8uW3ldXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0c2V0TGlua3MobGlua3M6IElEZXRlY3RlZExpbmtzKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlua3MgPSBsaW5rcztcblx0fVxufVxuXG5zdWl0ZSgnVGVybWluYWxMaW5rTWFuYWdlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0aGVtZVNlcnZpY2U6IFRlc3RUaGVtZVNlcnZpY2U7XG5cdGxldCB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2U7XG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCBsaW5rTWFuYWdlcjogVGVzdExpbmtNYW5hZ2VyO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0XHRcdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxXG5cdFx0XHR9IGFzIFBhcnRpYWw8SUVkaXRvck9wdGlvbnM+LFxuXHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0aW50ZWdyYXRlZDogZGVmYXVsdFRlcm1pbmFsQ29uZmlnXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhlbWVTZXJ2aWNlID0gbmV3IFRlc3RUaGVtZVNlcnZpY2UoKTtcblx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBuZXcgVGVzdFZpZXdEZXNjcmlwdG9yU2VydmljZSgpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0TWVudVNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0TWVudVNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUaGVtZVNlcnZpY2UsIHRoZW1lU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3IoeyBhbGxvd1Byb3Bvc2VkQXBpOiB0cnVlLCBjb2xzOiA4MCwgcm93czogMzAsIGxvZ2dlcjogVGVzdFh0ZXJtTG9nZ2VyIH0pKTtcblx0XHRsaW5rTWFuYWdlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0TGlua01hbmFnZXIsIHh0ZXJtLCB1cGNhc3RQYXJ0aWFsPElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyPih7XG5cdFx0XHRnZXQgaW5pdGlhbEN3ZCgpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0fSksIHtcblx0XHRcdGdldDxUIGV4dGVuZHMgVGVybWluYWxDYXBhYmlsaXR5PihjYXBhYmlsaXR5OiBUKTogSVRlcm1pbmFsQ2FwYWJpbGl0eUltcGxNYXBbVF0gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gYXMgUGFydGlhbDxJVGVybWluYWxDYXBhYmlsaXR5U3RvcmU+IGFzIGFueSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMaW5rUmVzb2x2ZXIpKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWdpc3RlckV4dGVybmFsTGlua1Byb3ZpZGVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbGVhayBkaXNwb3NhYmxlcyBpZiB0aGUgbGluayBtYW5hZ2VyIGlzIGFscmVhZHkgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRsaW5rTWFuYWdlci5leHRlcm5hbFByb3ZpZGVMaW5rc0NiID0gYXN5bmMgKCkgPT4gdW5kZWZpbmVkO1xuXHRcdFx0bGlua01hbmFnZXIuZGlzcG9zZSgpO1xuXHRcdFx0bGlua01hbmFnZXIuZXh0ZXJuYWxQcm92aWRlTGlua3NDYiA9IGFzeW5jICgpID0+IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHR0eXBlIFRlc3RhYmxlTGlua01hbmFnZXIgPSB7IF9zaG93SG92ZXI6ICguLi5hcmdzOiB1bmtub3duW10pID0+IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkIH07XG5cblx0ZnVuY3Rpb24gb3ZlcnJpZGVYdGVybUV2ZW50PFQ+KHRlcm1pbmFsOiBUZXJtaW5hbCwgZXZlbnROYW1lOiBzdHJpbmcsIGhhbmRsZXI6IChsaXN0ZW5lcjogKGU6IFQpID0+IHZvaWQpID0+IElEaXNwb3NhYmxlKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IG9yaWdpbmFsRGVzY3JpcHRvciA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoT2JqZWN0LmdldFByb3RvdHlwZU9mKHRlcm1pbmFsKSwgZXZlbnROYW1lKTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodGVybWluYWwsIGV2ZW50TmFtZSwgeyB2YWx1ZTogaGFuZGxlciwgY29uZmlndXJhYmxlOiB0cnVlIH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChvcmlnaW5hbERlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodGVybWluYWwsIGV2ZW50TmFtZSwgb3JpZ2luYWxEZXNjcmlwdG9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGUgKHRlcm1pbmFsIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2V2ZW50TmFtZV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbW9ja1h0ZXJtQ29yZVJlbmRlclNlcnZpY2UoKTogSURpc3Bvc2FibGUge1xuXHRcdGludGVyZmFjZSBYdGVybVdpdGhDb3JlIGV4dGVuZHMgVGVybWluYWwgeyBfY29yZTogSVh0ZXJtQ29yZSB9XG5cdFx0Y29uc3QgeHRlcm1XaXRoQ29yZSA9IHh0ZXJtIGFzIHVua25vd24gYXMgWHRlcm1XaXRoQ29yZTtcblx0XHRjb25zdCBvcmlnUmVuZGVyU2VydmljZSA9IHh0ZXJtV2l0aENvcmUuX2NvcmU/Ll9yZW5kZXJTZXJ2aWNlO1xuXHRcdGlmICgheHRlcm1XaXRoQ29yZS5fY29yZSkgeyAoeHRlcm1XaXRoQ29yZSBhcyBYdGVybVdpdGhDb3JlKS5fY29yZSA9IHt9IGFzIElYdGVybUNvcmU7IH1cblx0XHR4dGVybVdpdGhDb3JlLl9jb3JlLl9yZW5kZXJTZXJ2aWNlID0geyBkaW1lbnNpb25zOiB7IGNzczogeyBjZWxsOiB7IHdpZHRoOiA4LCBoZWlnaHQ6IDE2IH0gfSB9LCBfcmVuZGVyZXI6IHt9IH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgeHRlcm1XaXRoQ29yZS5fY29yZS5fcmVuZGVyU2VydmljZSA9IG9yaWdSZW5kZXJTZXJ2aWNlITsgfVxuXHRcdH07XG5cdH1cblxuXHRzdWl0ZSgnT1NDIDggaG92ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGNhbmNlbCBkZWxheWVkIHRvb2x0aXAgd2hlbiBsZWF2ZSBoYXBwZW5zIGJlZm9yZSBob3ZlciBkZWxheScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScsIDEwKTtcblx0XHRcdGNvbnN0IGxpbmtIYW5kbGVyID0geHRlcm0ub3B0aW9ucy5saW5rSGFuZGxlcjtcblx0XHRcdGlmICghbGlua0hhbmRsZXI/LmhvdmVyIHx8ICFsaW5rSGFuZGxlci5sZWF2ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGxpbmtIYW5kbGVyIHdpdGggaG92ZXIvbGVhdmUgY2FsbGJhY2tzJyk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaG92ZXJTaG93bkNvdW50ID0gMDtcblx0XHRcdGNvbnN0IHRlc3RhYmxlTGlua01hbmFnZXIgPSBsaW5rTWFuYWdlciBhcyB1bmtub3duIGFzIFRlc3RhYmxlTGlua01hbmFnZXI7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNob3dIb3ZlciA9IHRlc3RhYmxlTGlua01hbmFnZXIuX3Nob3dIb3Zlcjtcblx0XHRcdHRlc3RhYmxlTGlua01hbmFnZXIuX3Nob3dIb3ZlciA9ICgpID0+IHtcblx0XHRcdFx0aG92ZXJTaG93bkNvdW50Kys7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmFuZ2U6IFBhcmFtZXRlcnM8dHlwZW9mIGxpbmtIYW5kbGVyLmhvdmVyPlsyXSA9IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMTAsIHk6IDEgfSB9O1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgTW91c2VFdmVudCgnbW91c2Vtb3ZlJyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsaW5rSGFuZGxlci5ob3ZlcihldmVudCwgJ2h0dHA6Ly9leGFtcGxlLmNvbScsIHJhbmdlKTtcblx0XHRcdFx0bGlua0hhbmRsZXIubGVhdmUoZXZlbnQsICdodHRwOi8vZXhhbXBsZS5jb20nLCByYW5nZSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGhvdmVyU2hvd25Db3VudCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0ZXN0YWJsZUxpbmtNYW5hZ2VyLl9zaG93SG92ZXIgPSBvcmlnaW5hbFNob3dIb3Zlcjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvKipcblx0XHQgKiBUcmlnZ2VycyB0aGUgaG92ZXIgY2FsbGJhY2ssIGZsdXNoZXMgdGhlIDBtcyBzY2hlZHVsZXIsIHRoZW5cblx0XHQgKiBmaXJlcyB0aGUgZ2l2ZW4geHRlcm0gZXZlbnQgYW5kIGFzc2VydHMgdGhlIGhvdmVyIHdhcyBkaXNwb3NlZC5cblx0XHQgKi9cblx0XHRhc3luYyBmdW5jdGlvbiBhc3NlcnRIb3ZlckRpc21pc3NlZE9uRXZlbnQoXG5cdFx0XHRvdmVycmlkZUV2ZW50OiAoc2V0RmlyZUV2ZW50OiAoZm46ICgpID0+IHZvaWQpID0+IHZvaWQpID0+IElEaXNwb3NhYmxlLFxuXHRcdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScsIDApO1xuXHRcdFx0Y29uc3QgbGlua0hhbmRsZXIgPSB4dGVybS5vcHRpb25zLmxpbmtIYW5kbGVyO1xuXHRcdFx0aWYgKCFsaW5rSGFuZGxlcj8uaG92ZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBlY3RlZCBsaW5rSGFuZGxlciB3aXRoIGhvdmVyIGNhbGxiYWNrJyk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaG92ZXJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdGVzdGFibGVMaW5rTWFuYWdlciA9IGxpbmtNYW5hZ2VyIGFzIHVua25vd24gYXMgVGVzdGFibGVMaW5rTWFuYWdlcjtcblx0XHRcdGNvbnN0IG9yaWdpbmFsU2hvd0hvdmVyID0gdGVzdGFibGVMaW5rTWFuYWdlci5fc2hvd0hvdmVyO1xuXHRcdFx0dGVzdGFibGVMaW5rTWFuYWdlci5fc2hvd0hvdmVyID0gKCkgPT4gKHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyBob3ZlckRpc3Bvc2VkID0gdHJ1ZTsgfVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZW5kZXJTZXJ2aWNlUmVzdG9yZSA9IG1vY2tYdGVybUNvcmVSZW5kZXJTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByYW5nZTogUGFyYW1ldGVyczx0eXBlb2YgbGlua0hhbmRsZXIuaG92ZXI+WzJdID0geyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAxMCwgeTogMSB9IH07XG5cdFx0XHRsZXQgZmlyZUV2ZW50OiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBldmVudFJlc3RvcmUgPSBvdmVycmlkZUV2ZW50KGZuID0+IHsgZmlyZUV2ZW50ID0gZm47IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGlua0hhbmRsZXIuaG92ZXIobmV3IE1vdXNlRXZlbnQoJ21vdXNlbW92ZScpLCAnaHR0cDovL2V4YW1wbGUuY29tJywgcmFuZ2UpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChob3ZlckRpc3Bvc2VkLCBmYWxzZSk7XG5cdFx0XHRcdGZpcmVFdmVudD8uKCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGhvdmVyRGlzcG9zZWQsIHRydWUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZXZlbnRSZXN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVuZGVyU2VydmljZVJlc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0ZXN0YWJsZUxpbmtNYW5hZ2VyLl9zaG93SG92ZXIgPSBvcmlnaW5hbFNob3dIb3Zlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzbWlzcyBzaG93biB0b29sdGlwIG9uIHNjcm9sbCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0SG92ZXJEaXNtaXNzZWRPbkV2ZW50KHNldEZpcmUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGVYdGVybUV2ZW50PG51bWJlcj4oeHRlcm0sICdvblNjcm9sbCcsIGxpc3RlbmVyID0+IHtcblx0XHRcdFx0XHRzZXRGaXJlKCgpID0+IGxpc3RlbmVyKDEpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzbWlzcyBzaG93biB0b29sdGlwIG9uIHJlbmRlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0SG92ZXJEaXNtaXNzZWRPbkV2ZW50KHNldEZpcmUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGVYdGVybUV2ZW50PHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfT4oeHRlcm0sICdvblJlbmRlcicsIGxpc3RlbmVyID0+IHtcblx0XHRcdFx0XHRzZXRGaXJlKCgpID0+IGxpc3RlbmVyKHsgc3RhcnQ6IDAsIGVuZDogNSB9KSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnbGluayBob3ZlciBpbnZhbGlkYXRpb24nLCAoKSA9PiB7XG5cdFx0dHlwZSBTaG93SG92ZXIgPSAoXG5cdFx0XHR0YXJnZXRPcHRpb25zOiBJTGlua0hvdmVyVGFyZ2V0T3B0aW9ucyxcblx0XHRcdHRleHQ6IE1hcmtkb3duU3RyaW5nLFxuXHRcdFx0YWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0bGlua0hhbmRsZXI6ICh1cmw6IHN0cmluZykgPT4gdm9pZCxcblx0XHRcdGxpbms/OiBUZXJtaW5hbExpbmtcblx0XHQpID0+IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0dGVzdCgncmVwbGFjaW5nIG9yIGludmFsaWRhdGluZyBhIGxpbmsgaG92ZXIgZGlzcG9zZXMgdGhlIHByZXZpb3VzIGhvdmVyIGFuZCBpdHMgaW52YWxpZGF0aW9uIGxpc3RlbmVyJywgKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElIb3ZlclNlcnZpY2U+KHt9KSk7XG5cblx0XHRcdC8vIEZha2Ugd2lkZ2V0IG1hbmFnZXIgdGhhdCByZWNvcmRzIGRpc3Bvc2FsIG9mIGVhY2ggYXR0YWNoZWQgaG92ZXIgYW5kIGRpc3Bvc2VzIHRoZSB3aWRnZXRcblx0XHRcdGNvbnN0IGRpc3Bvc2VkQXR0YWNoZWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0bGlua01hbmFnZXIuc2V0V2lkZ2V0TWFuYWdlcih1cGNhc3RQYXJ0aWFsPFRlcm1pbmFsV2lkZ2V0TWFuYWdlcj4oe1xuXHRcdFx0XHRhdHRhY2hXaWRnZXQ6IHdpZGdldCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBkaXNwb3NlZEF0dGFjaGVkLnB1c2goZmFsc2UpIC0gMTtcblx0XHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VkQXR0YWNoZWRbaW5kZXhdID0gdHJ1ZTsgd2lkZ2V0LmRpc3Bvc2UoKTsgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHNob3dIb3ZlciA9IChsaW5rTWFuYWdlciBhcyB1bmtub3duIGFzIHsgX3Nob3dIb3ZlcjogU2hvd0hvdmVyIH0pLl9zaG93SG92ZXIuYmluZChsaW5rTWFuYWdlcik7XG5cdFx0XHRjb25zdCBvbkludmFsaWRhdGVkMSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IG9uSW52YWxpZGF0ZWQyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3QgbGluazEgPSB1cGNhc3RQYXJ0aWFsPFRlcm1pbmFsTGluaz4oeyBvbkludmFsaWRhdGVkOiBvbkludmFsaWRhdGVkMS5ldmVudCB9KTtcblx0XHRcdGNvbnN0IGxpbmsyID0gdXBjYXN0UGFydGlhbDxUZXJtaW5hbExpbms+KHsgb25JbnZhbGlkYXRlZDogb25JbnZhbGlkYXRlZDIuZXZlbnQgfSk7XG5cdFx0XHRjb25zdCB0YXJnZXRPcHRpb25zID0gdXBjYXN0UGFydGlhbDxJTGlua0hvdmVyVGFyZ2V0T3B0aW9ucz4oe30pO1xuXG5cdFx0XHQvLyBTaG93aW5nIGEgc2Vjb25kIGxpbmsgaG92ZXIgc2hvdWxkIGRpc3Bvc2UgdGhlIGZpcnN0LCB0aGVuIGludmFsaWRhdGluZyB0aGUgc2Vjb25kIGRpc3Bvc2VzIGl0XG5cdFx0XHRzaG93SG92ZXIodGFyZ2V0T3B0aW9ucywgbmV3IE1hcmtkb3duU3RyaW5nKCdob3ZlcicpLCB1bmRlZmluZWQsICgpID0+IHsgfSwgbGluazEpO1xuXHRcdFx0c2hvd0hvdmVyKHRhcmdldE9wdGlvbnMsIG5ldyBNYXJrZG93blN0cmluZygnaG92ZXInKSwgdW5kZWZpbmVkLCAoKSA9PiB7IH0sIGxpbmsyKTtcblx0XHRcdG9uSW52YWxpZGF0ZWQyLmZpcmUoKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGRpc3Bvc2VkQXR0YWNoZWQsIFt0cnVlLCB0cnVlXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRMaW5rcyBhbmQgb3BlbiByZWNlbnQgbGluaycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIG5vIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGlua3MgPSBhd2FpdCBsaW5rTWFuYWdlci5nZXRMaW5rcygpO1xuXHRcdFx0ZXF1YWxzKGxpbmtzLnZpZXdwb3J0LndlYkxpbmtzLCBbXSk7XG5cdFx0XHRlcXVhbHMobGlua3Mudmlld3BvcnQud29yZExpbmtzLCBbXSk7XG5cdFx0XHRlcXVhbHMobGlua3Mudmlld3BvcnQuZmlsZUxpbmtzLCBbXSk7XG5cdFx0XHRjb25zdCB3ZWJMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ3VybCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwod2ViTGluaywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGZpbGVMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ2xvY2FsRmlsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZmlsZUxpbmssIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB3b3JkIGxpbmtzIGluIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGluazEgPSB7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMTQsIHk6IDEgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXh0OiAnMV9cdTYyMTFcdTY2MkZcdTVCNjZcdTc1MUYudHh0Jyxcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IFByb21pc2UucmVzb2x2ZSgnJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCBsaW5rMiA9IHtcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAxNCwgeTogMSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRleHQ6ICcyX1x1NjIxMVx1NjYyRlx1NUI2Nlx1NzUxRi50eHQnLFxuXHRcdFx0XHRhY3RpdmF0ZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCcnKVxuXHRcdFx0fTtcblx0XHRcdGxpbmtNYW5hZ2VyLnNldExpbmtzKHsgd29yZExpbmtzOiBbbGluazEsIGxpbmsyXSB9KTtcblx0XHRcdGNvbnN0IGxpbmtzID0gYXdhaXQgbGlua01hbmFnZXIuZ2V0TGlua3MoKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChsaW5rcy52aWV3cG9ydC53b3JkTGlua3M/LlswXS50ZXh0LCBsaW5rMi50ZXh0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChsaW5rcy52aWV3cG9ydC53b3JkTGlua3M/LlsxXS50ZXh0LCBsaW5rMS50ZXh0KTtcblx0XHRcdGNvbnN0IHdlYkxpbmsgPSBhd2FpdCBsaW5rTWFuYWdlci5vcGVuUmVjZW50TGluaygndXJsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh3ZWJMaW5rLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZmlsZUxpbmsgPSBhd2FpdCBsaW5rTWFuYWdlci5vcGVuUmVjZW50TGluaygnbG9jYWxGaWxlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChmaWxlTGluaywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHdlYiBsaW5rcyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmsxID0ge1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogeyB4OiA1LCB5OiAxIH0sIGVuZDogeyB4OiA0MCwgeTogMSB9IH0sXG5cdFx0XHRcdHRleHQ6ICdodHRwczovL2Zvby5iYXIvW3RoaXMgaXMgZm9vIHNpdGUgMV0nLFxuXHRcdFx0XHRhY3RpdmF0ZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCcnKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxpbmsyID0ge1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogeyB4OiA1LCB5OiAyIH0sIGVuZDogeyB4OiA0MCwgeTogMiB9IH0sXG5cdFx0XHRcdHRleHQ6ICdodHRwczovL2Zvby5iYXIvW3RoaXMgaXMgZm9vIHNpdGUgMl0nLFxuXHRcdFx0XHRhY3RpdmF0ZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCcnKVxuXHRcdFx0fTtcblx0XHRcdGxpbmtNYW5hZ2VyLnNldExpbmtzKHsgd2ViTGlua3M6IFtsaW5rMSwgbGluazJdIH0pO1xuXHRcdFx0Y29uc3QgbGlua3MgPSBhd2FpdCBsaW5rTWFuYWdlci5nZXRMaW5rcygpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGxpbmtzLnZpZXdwb3J0LndlYkxpbmtzPy5bMF0udGV4dCwgbGluazIudGV4dCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobGlua3Mudmlld3BvcnQud2ViTGlua3M/LlsxXS50ZXh0LCBsaW5rMS50ZXh0KTtcblx0XHRcdGNvbnN0IHdlYkxpbmsgPSBhd2FpdCBsaW5rTWFuYWdlci5vcGVuUmVjZW50TGluaygndXJsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh3ZWJMaW5rLCBsaW5rMik7XG5cdFx0XHRjb25zdCBmaWxlTGluayA9IGF3YWl0IGxpbmtNYW5hZ2VyLm9wZW5SZWNlbnRMaW5rKCdsb2NhbEZpbGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKGZpbGVMaW5rLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmlsZSBsaW5rcyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbmsxID0ge1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAzMiwgeTogMSB9IH0sXG5cdFx0XHRcdHRleHQ6ICdmaWxlOi8vL0M6L3VzZXJzL3Rlc3QvZmlsZV8xLnR4dCcsXG5cdFx0XHRcdGFjdGl2YXRlOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJycpXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbGluazIgPSB7XG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDIgfSwgZW5kOiB7IHg6IDMyLCB5OiAyIH0gfSxcblx0XHRcdFx0dGV4dDogJ2ZpbGU6Ly8vQzovdXNlcnMvdGVzdC9maWxlXzIudHh0Jyxcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IFByb21pc2UucmVzb2x2ZSgnJylcblx0XHRcdH07XG5cdFx0XHRsaW5rTWFuYWdlci5zZXRMaW5rcyh7IGZpbGVMaW5rczogW2xpbmsxLCBsaW5rMl0gfSk7XG5cdFx0XHRjb25zdCBsaW5rcyA9IGF3YWl0IGxpbmtNYW5hZ2VyLmdldExpbmtzKCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobGlua3Mudmlld3BvcnQuZmlsZUxpbmtzPy5bMF0udGV4dCwgbGluazIudGV4dCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobGlua3Mudmlld3BvcnQuZmlsZUxpbmtzPy5bMV0udGV4dCwgbGluazEudGV4dCk7XG5cdFx0XHRjb25zdCB3ZWJMaW5rID0gYXdhaXQgbGlua01hbmFnZXIub3BlblJlY2VudExpbmsoJ3VybCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwod2ViTGluaywgdW5kZWZpbmVkKTtcblx0XHRcdGxpbmtNYW5hZ2VyLnNldExpbmtzKHsgZmlsZUxpbmtzOiBbbGluazJdIH0pO1xuXHRcdFx0Y29uc3QgZmlsZUxpbmsgPSBhd2FpdCBsaW5rTWFuYWdlci5vcGVuUmVjZW50TGluaygnbG9jYWxGaWxlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChmaWxlTGluaywgbGluazIpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuZnVuY3Rpb24gdXBjYXN0UGFydGlhbDxUPih2OiBQYXJ0aWFsPFQ+KTogVCB7XG5cdHJldHVybiB2IGFzIFQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixtQkFBbUI7QUFDN0MsU0FBUyxjQUFjO0FBRXZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBeUIsMkJBQTJCO0FBR3BELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMEJBQTBCO0FBR25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFLOUIsTUFBTSx3QkFBeUQ7QUFBQSxFQUM5RCxZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixnQkFBZ0I7QUFBQSxFQUNoQixpQkFBaUI7QUFBQSxFQUNqQixZQUFZO0FBQUEsRUFDWix1QkFBdUI7QUFBQSxFQUN2Qiw2QkFBNkI7QUFBQSxFQUM3QixnQkFBZ0I7QUFBQSxFQUNoQixnQkFBZ0I7QUFDakI7QUFFQSxNQUFNLHdCQUF3QixvQkFBb0I7QUFBQSxFQUVqRCxNQUF5QixpQkFBaUIsR0FBVyxNQUFrRTtBQUN0SCxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUs7QUFDSixlQUFPLEtBQUssUUFBUSxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssUUFBUSxZQUFZLENBQUMsQ0FBQyxJ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
