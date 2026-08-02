import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { format } from "../../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { TerminalLocalLinkDetector } from "../../browser/terminalLocalLinkDetector.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { assertLinkHelper } from "./linkTestUtils.js";
import { timeout } from "../../../../../../base/common/async.js";
import { strictEqual } from "assert";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { URI } from "../../../../../../base/common/uri.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { isString } from "../../../../../../base/common/types.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
const unixLinks = [
  // Absolute
  "/foo",
  "/foo/bar",
  "/foo/[bar]",
  "/foo/[bar].baz",
  "/foo/[bar]/baz",
  "/foo/bar+more",
  // URI file://
  { link: "file:///foo", resource: URI.file("/foo") },
  { link: "file:///foo/bar", resource: URI.file("/foo/bar") },
  { link: "file:///foo/bar%20baz", resource: URI.file("/foo/bar baz") },
  // User home
  { link: "~/foo", resource: URI.file("/home/foo") },
  // Relative
  { link: "./foo", resource: URI.file("/parent/cwd/foo") },
  { link: "./$foo", resource: URI.file("/parent/cwd/$foo") },
  { link: "../foo", resource: URI.file("/parent/foo") },
  { link: "foo/bar", resource: URI.file("/parent/cwd/foo/bar") },
  { link: "foo/bar+more", resource: URI.file("/parent/cwd/foo/bar+more") }
];
const unixLinksWithIso = [
  // ISO 8601 timestamps - tested separately to avoid line/column suffix conflicts
  { link: "./test-2025-04-28T11:03:09+02:00.log", resource: URI.file("/parent/cwd/test-2025-04-28T11:03:09+02:00.log") }
];
const windowsLinks = [
  // Absolute
  "c:\\foo",
  { link: "\\\\?\\C:\\foo", resource: URI.file("C:\\foo") },
  "c:/foo",
  "c:/foo/bar",
  "c:\\foo\\bar",
  "c:\\foo\\bar+more",
  "c:\\foo/bar\\baz",
  // URI file://
  { link: "file:///c:/foo", resource: URI.file("c:\\foo") },
  { link: "file:///c:/foo/bar", resource: URI.file("c:\\foo\\bar") },
  { link: "file:///c:/foo/bar%20baz", resource: URI.file("c:\\foo\\bar baz") },
  // User home
  { link: "~\\foo", resource: URI.file("C:\\Home\\foo") },
  { link: "~/foo", resource: URI.file("C:\\Home\\foo") },
  // Relative
  { link: ".\\foo", resource: URI.file("C:\\Parent\\Cwd\\foo") },
  { link: "./foo", resource: URI.file("C:\\Parent\\Cwd\\foo") },
  { link: "./$foo", resource: URI.file("C:\\Parent\\Cwd\\$foo") },
  { link: "..\\foo", resource: URI.file("C:\\Parent\\foo") },
  { link: "foo/bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo/bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo/[bar]", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]") },
  { link: "foo/[bar].baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar].baz") },
  { link: "foo/[bar]/baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]/baz") },
  { link: "foo\\bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo\\[bar].baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar].baz") },
  { link: "foo\\[bar]\\baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]\\baz") },
  { link: "foo\\bar+more", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar+more") }
];
const windowsLinksWithIso = [
  // ISO 8601 timestamps - tested separately to avoid line/column suffix conflicts
  { link: ".\\test-2025-04-28T11:03:09+02:00.log", resource: URI.file("C:\\Parent\\Cwd\\test-2025-04-28T11:03:09+02:00.log") }
];
const supportedLinkFormats = [
  { urlFormat: "{0}" },
  { urlFormat: '{0}" on line {1}', line: "5" },
  { urlFormat: '{0}" on line {1}, column {2}', line: "5", column: "3" },
  { urlFormat: '{0}":line {1}', line: "5" },
  { urlFormat: '{0}":line {1}, column {2}', line: "5", column: "3" },
  { urlFormat: '{0}": line {1}', line: "5" },
  { urlFormat: '{0}": line {1}, col {2}', line: "5", column: "3" },
  { urlFormat: "{0}({1})", line: "5" },
  { urlFormat: "{0} ({1})", line: "5" },
  { urlFormat: "{0}, {1}", line: "5" },
  { urlFormat: "{0}({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0}: ({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0}({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0}: ({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0}({1}:{2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1}:{2})", line: "5", column: "3" },
  { urlFormat: "{0}:{1}", line: "5" },
  { urlFormat: "{0}:{1}:{2}", line: "5", column: "3" },
  { urlFormat: "{0} {1}:{2}", line: "5", column: "3" },
  { urlFormat: "{0}[{1}]", line: "5" },
  { urlFormat: "{0} [{1}]", line: "5" },
  { urlFormat: "{0}[{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0}: [{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0}[{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0}: [{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0}[{1}:{2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1}:{2}]", line: "5", column: "3" },
  { urlFormat: '{0}",{1}', line: "5" },
  { urlFormat: "{0}',{1}", line: "5" },
  { urlFormat: "{0}#{1}", line: "5" },
  { urlFormat: "{0}#{1}:{2}", line: "5", column: "5" }
];
const windowsFallbackLinks = [
  "C:\\foo bar",
  "C:\\foo bar\\baz",
  "C:\\foo\\bar baz",
  "C:\\foo/bar baz"
];
const supportedFallbackLinkFormats = [
  // Python style error: File "<path>", line <line>
  { urlFormat: 'File "{0}"', linkCellStartOffset: 5 },
  { urlFormat: 'File "{0}", line {1}', line: "5", linkCellStartOffset: 5 },
  // Unknown tool #200166: FILE  <path>:<line>:<col>
  { urlFormat: " FILE  {0}", linkCellStartOffset: 7 },
  { urlFormat: " FILE  {0}:{1}", line: "5", linkCellStartOffset: 7 },
  { urlFormat: " FILE  {0}:{1}:{2}", line: "5", column: "3", linkCellStartOffset: 7 },
  // Some C++ compile error formats
  { urlFormat: "{0}({1}) :", line: "5", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1},{2}) :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1}, {2}) :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1}):", line: "5", linkCellEndOffset: -1 },
  { urlFormat: "{0}({1},{2}):", line: "5", column: "3", linkCellEndOffset: -1 },
  { urlFormat: "{0}({1}, {2}):", line: "5", column: "3", linkCellEndOffset: -1 },
  { urlFormat: "{0}:{1} :", line: "5", linkCellEndOffset: -2 },
  { urlFormat: "{0}:{1}:{2} :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}:{1}:", line: "5", linkCellEndOffset: -1 },
  { urlFormat: "{0}:{1}:{2}:", line: "5", column: "3", linkCellEndOffset: -1 },
  // PowerShell prompt
  { urlFormat: "PS {0}>", linkCellStartOffset: 3, linkCellEndOffset: -1 },
  // Cmd prompt
  { urlFormat: "{0}>", linkCellEndOffset: -1 },
  // The whole line is the path
  { urlFormat: "{0}" }
];
class TestFileService extends FileService {
  constructor() {
    super(...arguments);
    this._files = "*";
  }
  async stat(resource) {
    if (this._files === "*" || this._files.some((e) => e.toString() === resource.toString())) {
      return { isFile: true, isDirectory: false, isSymbolicLink: false };
    }
    throw new Error("ENOENT");
  }
  setFiles(files) {
    this._files = files;
  }
}
suite("Workbench - TerminalLocalLinkDetector", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let fileService;
  let detector;
  let resolver;
  let xterm;
  let validResources;
  async function assertLinks(type, text, expected) {
    let to;
    const race = await Promise.race([
      assertLinkHelper(text, expected, detector, type).then(() => "success"),
      (to = timeout(2)).then(() => "timeout")
    ]);
    strictEqual(race, "success", `Awaiting link assertion for "${text}" timed out`);
    to.cancel();
  }
  async function assertLinksWithWrapped(link, resource) {
    const uri = resource ?? URI.file(link);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, link, [{ uri, range: [[1, 1], [link.length, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, ` ${link} `, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, `(${link})`, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, `[${link}]`, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
  }
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    fileService = store.add(new TestFileService(new NullLogService()));
    instantiationService.stub(IConfigurationService, configurationService);
    fileService.setFiles(validResources);
    instantiationService.set(IFileService, fileService);
    instantiationService.set(IWorkspaceContextService, new TestContextService());
    instantiationService.set(IUriIdentityService, store.add(new UriIdentityService(fileService)));
    instantiationService.stub(ITerminalLogService, new NullLogService());
    resolver = instantiationService.createInstance(TerminalLinkResolver);
    validResources = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
  });
  suite("platform independent", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
        initialCwd: "/parent/cwd",
        os: OperatingSystem.Linux,
        remoteAuthority: void 0,
        userHome: "/home",
        backend: void 0
      }, resolver);
    });
    test("should support multiple link results", async () => {
      validResources = [
        URI.file("/parent/cwd/foo"),
        URI.file("/parent/cwd/bar")
      ];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, "./foo ./bar", [
        { range: [[1, 1], [5, 1]], uri: URI.file("/parent/cwd/foo") },
        { range: [[7, 1], [11, 1]], uri: URI.file("/parent/cwd/bar") }
      ]);
    });
    test("should support trimming extra quotes", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, '"foo"" on line 5', [
        { range: [[1, 1], [16, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
    test("should support trimming extra square brackets", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, '"foo]" on line 5', [
        { range: [[1, 1], [16, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
    test("should support finding links after brackets", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, "bar[foo:5", [
        { range: [[5, 1], [9, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
  });
  suite("macOS/Linux", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
        initialCwd: "/parent/cwd",
        os: OperatingSystem.Linux,
        remoteAuthority: void 0,
        userHome: "/home",
        backend: void 0
      }, resolver);
    });
    for (const l of unixLinks) {
      const baseLink = isString(l) ? l : l.link;
      const resource = isString(l) ? URI.file(l) : l.resource;
      suite(`Link: ${baseLink}`, () => {
        for (let i = 0; i < supportedLinkFormats.length; i++) {
          const linkFormat = supportedLinkFormats[i];
          const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
          test(`should detect in "${formattedLink}"`, async () => {
            validResources = [resource];
            fileService.setFiles(validResources);
            await assertLinksWithWrapped(formattedLink, resource);
          });
        }
      });
    }
    test("Git diff links", async () => {
      validResources = [URI.file("/parent/cwd/foo/bar")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
        { uri: validResources[0], range: [[14, 1], [20, 1]] },
        { uri: validResources[0], range: [[24, 1], [30, 1]] }
      ]);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ uri: validResources[0], range: [[7, 1], [13, 1]] }]);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ uri: validResources[0], range: [[7, 1], [13, 1]] }]);
    });
    for (const l of unixLinksWithIso) {
      const baseLink = typeof l === "string" ? l : l.link;
      const resource = typeof l === "string" ? URI.file(l) : l.resource;
      test(`should detect ISO 8601 link: ${baseLink}`, async () => {
        validResources = [resource];
        fileService.setFiles(validResources);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, baseLink, [{ uri: resource, range: [[1, 1], [baseLink.length, 1]] }]);
      });
    }
  });
  if (isWindows) {
    suite("Windows", () => {
      const wslUnixToWindowsPathMap = /* @__PURE__ */ new Map();
      setup(() => {
        detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
          initialCwd: "C:\\Parent\\Cwd",
          os: OperatingSystem.Windows,
          remoteAuthority: void 0,
          userHome: "C:\\Home",
          backend: {
            async getWslPath(original, direction) {
              if (direction === "unix-to-win") {
                return wslUnixToWindowsPathMap.get(original) ?? original;
              }
              return original;
            }
          }
        }, resolver);
        wslUnixToWindowsPathMap.clear();
      });
      for (const l of windowsLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Link "${baseLink}"`, () => {
          for (let i = 0; i < supportedLinkFormats.length; i++) {
            const linkFormat = supportedLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            test(`should detect in "${formattedLink}"`, async () => {
              validResources = [resource];
              fileService.setFiles(validResources);
              await assertLinksWithWrapped(formattedLink, resource);
            });
          }
        });
      }
      for (const l of windowsFallbackLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Fallback link "${baseLink}"`, () => {
          for (let i = 0; i < supportedFallbackLinkFormats.length; i++) {
            const linkFormat = supportedFallbackLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            const linkCellStartOffset = linkFormat.linkCellStartOffset ?? 0;
            const linkCellEndOffset = linkFormat.linkCellEndOffset ?? 0;
            test(`should detect in "${formattedLink}"`, async () => {
              validResources = [resource];
              fileService.setFiles(validResources);
              await assertLinks(TerminalBuiltinLinkType.LocalFile, formattedLink, [{ uri: resource, range: [[1 + linkCellStartOffset, 1], [formattedLink.length + linkCellEndOffset, 1]] }]);
            });
          }
        });
      }
      test("Git diff links", async () => {
        const resource = URI.file("C:\\Parent\\Cwd\\foo\\bar");
        validResources = [resource];
        fileService.setFiles(validResources);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
          { uri: resource, range: [[14, 1], [20, 1]] },
          { uri: resource, range: [[24, 1], [30, 1]] }
        ]);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ uri: resource, range: [[7, 1], [13, 1]] }]);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ uri: resource, range: [[7, 1], [13, 1]] }]);
      });
      for (const l of windowsLinksWithIso) {
        const baseLink = typeof l === "string" ? l : l.link;
        const resource = typeof l === "string" ? URI.file(l) : l.resource;
        test(`should detect ISO 8601 link: ${baseLink}`, async () => {
          validResources = [resource];
          fileService.setFiles(validResources);
          await assertLinks(TerminalBuiltinLinkType.LocalFile, baseLink, [{ uri: resource, range: [[1, 1], [baseLink.length, 1]] }]);
        });
      }
      suite("WSL", () => {
        test("Unix -> Windows /mnt/ style links", async () => {
          wslUnixToWindowsPathMap.set("/mnt/c/foo/bar", "C:\\foo\\bar");
          validResources = [URI.file("C:\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("/mnt/c/foo/bar", validResources[0]);
        });
        test("Windows -> Unix \\\\wsl$\\ style links", async () => {
          validResources = [URI.file("\\\\wsl$\\Debian\\home\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("\\\\wsl$\\Debian\\home\\foo\\bar");
        });
        test("Windows -> Unix \\\\wsl.localhost\\ style links", async () => {
          validResources = [URI.file("\\\\wsl.localhost\\Debian\\home\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("\\\\wsl.localhost\\Debian\\home\\foo\\bar");
        });
      });
    });
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxMb2NhbExpbmtEZXRlY3Rvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVybWluYWxCdWlsdGluTGlua1R5cGUgfSBmcm9tICcuLi8uLi9icm93c2VyL2xpbmtzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IGFzc2VydExpbmtIZWxwZXIgfSBmcm9tICcuL2xpbmtUZXN0VXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVGVybWluYWxMaW5rUmVzb2x2ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsTGlua1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5jb25zdCB1bml4TGlua3M6IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQvLyBBYnNvbHV0ZVxuXHQnL2ZvbycsXG5cdCcvZm9vL2JhcicsXG5cdCcvZm9vL1tiYXJdJyxcblx0Jy9mb28vW2Jhcl0uYmF6Jyxcblx0Jy9mb28vW2Jhcl0vYmF6Jyxcblx0Jy9mb28vYmFyK21vcmUnLFxuXHQvLyBVUkkgZmlsZTovL1xuXHR7IGxpbms6ICdmaWxlOi8vL2ZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnL2ZvbycpIH0sXG5cdHsgbGluazogJ2ZpbGU6Ly8vZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnL2Zvby9iYXInKSB9LFxuXHR7IGxpbms6ICdmaWxlOi8vL2Zvby9iYXIlMjBiYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJy9mb28vYmFyIGJheicpIH0sXG5cdC8vIFVzZXIgaG9tZVxuXHR7IGxpbms6ICd+L2ZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnL2hvbWUvZm9vJykgfSxcblx0Ly8gUmVsYXRpdmVcblx0eyBsaW5rOiAnLi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpIH0sXG5cdHsgbGluazogJy4vJGZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvJGZvbycpIH0sXG5cdHsgbGluazogJy4uL2ZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9mb28nKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28vYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vL2Jhcittb3JlJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28vYmFyK21vcmUnKSB9LFxuXTtcblxuY29uc3QgdW5peExpbmtzV2l0aElzbzogKHN0cmluZyB8IHsgbGluazogc3RyaW5nOyByZXNvdXJjZTogVVJJIH0pW10gPSBbXG5cdC8vIElTTyA4NjAxIHRpbWVzdGFtcHMgLSB0ZXN0ZWQgc2VwYXJhdGVseSB0byBhdm9pZCBsaW5lL2NvbHVtbiBzdWZmaXggY29uZmxpY3RzXG5cdHsgbGluazogJy4vdGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvdGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycpIH0sXG5dO1xuXG5jb25zdCB3aW5kb3dzTGlua3M6IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQvLyBBYnNvbHV0ZVxuXHQnYzpcXFxcZm9vJyxcblx0eyBsaW5rOiAnXFxcXFxcXFw/XFxcXEM6XFxcXGZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcZm9vJykgfSxcblx0J2M6L2ZvbycsXG5cdCdjOi9mb28vYmFyJyxcblx0J2M6XFxcXGZvb1xcXFxiYXInLFxuXHQnYzpcXFxcZm9vXFxcXGJhcittb3JlJyxcblx0J2M6XFxcXGZvby9iYXJcXFxcYmF6Jyxcblx0Ly8gVVJJIGZpbGU6Ly9cblx0eyBsaW5rOiAnZmlsZTovLy9jOi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ2M6XFxcXGZvbycpIH0sXG5cdHsgbGluazogJ2ZpbGU6Ly8vYzovZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnYzpcXFxcZm9vXFxcXGJhcicpIH0sXG5cdHsgbGluazogJ2ZpbGU6Ly8vYzovZm9vL2JhciUyMGJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnYzpcXFxcZm9vXFxcXGJhciBiYXonKSB9LFxuXHQvLyBVc2VyIGhvbWVcblx0eyBsaW5rOiAnflxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXEhvbWVcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnfi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXEhvbWVcXFxcZm9vJykgfSxcblx0Ly8gUmVsYXRpdmVcblx0eyBsaW5rOiAnLlxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnLi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnLi8kZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXCRmb28nKSB9LFxuXHR7IGxpbms6ICcuLlxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxmb28nKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXInKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXInKSB9LFxuXHR7IGxpbms6ICdmb28vW2Jhcl0nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdJykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdLmJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0uYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdL2JheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0vYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXGJhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXFtiYXJdLmJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0uYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXFtiYXJdXFxcXGJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl1cXFxcYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXGJhcittb3JlJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXIrbW9yZScpIH0sXG5dO1xuXG5jb25zdCB3aW5kb3dzTGlua3NXaXRoSXNvOiAoc3RyaW5nIHwgeyBsaW5rOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtcblx0Ly8gSVNPIDg2MDEgdGltZXN0YW1wcyAtIHRlc3RlZCBzZXBhcmF0ZWx5IHRvIGF2b2lkIGxpbmUvY29sdW1uIHN1ZmZpeCBjb25mbGljdHNcblx0eyBsaW5rOiAnLlxcXFx0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXHRlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnKSB9LFxuXTtcblxuaW50ZXJmYWNlIExpbmtGb3JtYXRJbmZvIHtcblx0dXJsRm9ybWF0OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2Zmc2V0IHRvIHRoZSBidWZmZXIgcmFuZ2UgdGhhdCBpcyBub3QgaW4gdGhlIGFjdHVhbCBsaW5rIChidXQgaXMgaW4gdGhlIG1hdGNoZWRcblx0ICogYXJlYS5cblx0ICovXG5cdGxpbmtDZWxsU3RhcnRPZmZzZXQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgZW5kIG9mZnNldCB0byB0aGUgYnVmZmVyIHJhbmdlIHRoYXQgaXMgbm90IGluIHRoZSBhY3R1YWwgbGluayAoYnV0IGlzIGluIHRoZSBtYXRjaGVkXG5cdCAqIGFyZWEuXG5cdCAqL1xuXHRsaW5rQ2VsbEVuZE9mZnNldD86IG51bWJlcjtcblx0bGluZT86IHN0cmluZztcblx0Y29sdW1uPzogc3RyaW5nO1xufVxuXG5jb25zdCBzdXBwb3J0ZWRMaW5rRm9ybWF0czogTGlua0Zvcm1hdEluZm9bXSA9IFtcblx0eyB1cmxGb3JtYXQ6ICd7MH0nIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XCIgb24gbGluZSB7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cIiBvbiBsaW5lIHsxfSwgY29sdW1uIHsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cIjpsaW5lIHsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVwiOmxpbmUgezF9LCBjb2x1bW4gezJ9JywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVwiOiBsaW5lIHsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVwiOiBsaW5lIHsxfSwgY29sIHsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0oezF9KScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSAoezF9KScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSwgezF9JywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSx7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSAoezF9LHsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OiAoezF9LHsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSwgezJ9KScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gKHsxfSwgezJ9KScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06ICh7MX0sIHsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfTp7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSAoezF9OnsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OnsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTp7MX06ezJ9JywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSB7MX06ezJ9JywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVt7MX1dJywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9IFt7MX1dJywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9W3sxfSx7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSBbezF9LHsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OiBbezF9LHsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9W3sxfSwgezJ9XScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gW3sxfSwgezJ9XScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06IFt7MX0sIHsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9W3sxfTp7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSBbezF9OnsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XCIsezF9JywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XFwnLHsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSN7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0jezF9OnsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnNScgfVxuXTtcblxuY29uc3Qgd2luZG93c0ZhbGxiYWNrTGlua3M6IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQnQzpcXFxcZm9vIGJhcicsXG5cdCdDOlxcXFxmb28gYmFyXFxcXGJheicsXG5cdCdDOlxcXFxmb29cXFxcYmFyIGJheicsXG5cdCdDOlxcXFxmb28vYmFyIGJheidcbl07XG5cbmNvbnN0IHN1cHBvcnRlZEZhbGxiYWNrTGlua0Zvcm1hdHM6IExpbmtGb3JtYXRJbmZvW10gPSBbXG5cdC8vIFB5dGhvbiBzdHlsZSBlcnJvcjogRmlsZSBcIjxwYXRoPlwiLCBsaW5lIDxsaW5lPlxuXHR7IHVybEZvcm1hdDogJ0ZpbGUgXCJ7MH1cIicsIGxpbmtDZWxsU3RhcnRPZmZzZXQ6IDUgfSxcblx0eyB1cmxGb3JtYXQ6ICdGaWxlIFwiezB9XCIsIGxpbmUgezF9JywgbGluZTogJzUnLCBsaW5rQ2VsbFN0YXJ0T2Zmc2V0OiA1IH0sXG5cdC8vIFVua25vd24gdG9vbCAjMjAwMTY2OiBGSUxFICA8cGF0aD46PGxpbmU+Ojxjb2w+XG5cdHsgdXJsRm9ybWF0OiAnIEZJTEUgIHswfScsIGxpbmtDZWxsU3RhcnRPZmZzZXQ6IDcgfSxcblx0eyB1cmxGb3JtYXQ6ICcgRklMRSAgezB9OnsxfScsIGxpbmU6ICc1JywgbGlua0NlbGxTdGFydE9mZnNldDogNyB9LFxuXHR7IHVybEZvcm1hdDogJyBGSUxFICB7MH06ezF9OnsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycsIGxpbmtDZWxsU3RhcnRPZmZzZXQ6IDcgfSxcblx0Ly8gU29tZSBDKysgY29tcGlsZSBlcnJvciBmb3JtYXRzXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSkgOicsIGxpbmU6ICc1JywgbGlua0NlbGxFbmRPZmZzZXQ6IC0yIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSx7Mn0pIDonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTIgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0oezF9LCB7Mn0pIDonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTIgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0oezF9KTonLCBsaW5lOiAnNScsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMSB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSh7MX0sezJ9KTonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTEgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0oezF9LCB7Mn0pOicsIGxpbmU6ICc1JywgY29sdW1uOiAnMycsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMSB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTp7MX0gOicsIGxpbmU6ICc1JywgbGlua0NlbGxFbmRPZmZzZXQ6IC0yIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OnsxfTp7Mn0gOicsIGxpbmU6ICc1JywgY29sdW1uOiAnMycsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMiB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTp7MX06JywgbGluZTogJzUnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTEgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06ezF9OnsyfTonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTEgfSxcblx0Ly8gUG93ZXJTaGVsbCBwcm9tcHRcblx0eyB1cmxGb3JtYXQ6ICdQUyB7MH0+JywgbGlua0NlbGxTdGFydE9mZnNldDogMywgbGlua0NlbGxFbmRPZmZzZXQ6IC0xIH0sXG5cdC8vIENtZCBwcm9tcHRcblx0eyB1cmxGb3JtYXQ6ICd7MH0+JywgbGlua0NlbGxFbmRPZmZzZXQ6IC0xIH0sXG5cdC8vIFRoZSB3aG9sZSBsaW5lIGlzIHRoZSBwYXRoXG5cdHsgdXJsRm9ybWF0OiAnezB9JyB9LFxuXTtcblxuY2xhc3MgVGVzdEZpbGVTZXJ2aWNlIGV4dGVuZHMgRmlsZVNlcnZpY2Uge1xuXHRwcml2YXRlIF9maWxlczogVVJJW10gfCAnKicgPSAnKic7XG5cdG92ZXJyaWRlIGFzeW5jIHN0YXQocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YT4ge1xuXHRcdGlmICh0aGlzLl9maWxlcyA9PT0gJyonIHx8IHRoaXMuX2ZpbGVzLnNvbWUoZSA9PiBlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm4geyBpc0ZpbGU6IHRydWUsIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNTeW1ib2xpY0xpbms6IGZhbHNlIH0gYXMgSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdFTk9FTlQnKTtcblx0fVxuXHRzZXRGaWxlcyhmaWxlczogVVJJW10gfCAnKicpOiB2b2lkIHtcblx0XHR0aGlzLl9maWxlcyA9IGZpbGVzO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXJtaW5hbExvY2FsTGlua0RldGVjdG9yJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBUZXN0RmlsZVNlcnZpY2U7XG5cdGxldCBkZXRlY3RvcjogVGVybWluYWxMb2NhbExpbmtEZXRlY3Rvcjtcblx0bGV0IHJlc29sdmVyOiBUZXJtaW5hbExpbmtSZXNvbHZlcjtcblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblx0bGV0IHZhbGlkUmVzb3VyY2VzOiBVUklbXTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRMaW5rcyhcblx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSxcblx0XHR0ZXh0OiBzdHJpbmcsXG5cdFx0ZXhwZWN0ZWQ6ICh7IHVyaTogVVJJOyByYW5nZTogW251bWJlciwgbnVtYmVyXVtdIH0pW11cblx0KSB7XG5cdFx0bGV0IHRvO1xuXHRcdGNvbnN0IHJhY2UgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0YXNzZXJ0TGlua0hlbHBlcih0ZXh0LCBleHBlY3RlZCwgZGV0ZWN0b3IsIHR5cGUpLnRoZW4oKCkgPT4gJ3N1Y2Nlc3MnKSxcblx0XHRcdCh0byA9IHRpbWVvdXQoMikpLnRoZW4oKCkgPT4gJ3RpbWVvdXQnKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJhY2UsICdzdWNjZXNzJywgYEF3YWl0aW5nIGxpbmsgYXNzZXJ0aW9uIGZvciBcIiR7dGV4dH1cIiB0aW1lZCBvdXRgKTtcblx0XHR0by5jYW5jZWwoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydExpbmtzV2l0aFdyYXBwZWQobGluazogc3RyaW5nLCByZXNvdXJjZT86IFVSSSkge1xuXHRcdGNvbnN0IHVyaSA9IHJlc291cmNlID8/IFVSSS5maWxlKGxpbmspO1xuXHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgbGluaywgW3sgdXJpLCByYW5nZTogW1sxLCAxXSwgW2xpbmsubGVuZ3RoLCAxXV0gfV0pO1xuXHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYCAke2xpbmt9IGAsIFt7IHVyaSwgcmFuZ2U6IFtbMiwgMV0sIFtsaW5rLmxlbmd0aCArIDEsIDFdXSB9XSk7XG5cdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBgKCR7bGlua30pYCwgW3sgdXJpLCByYW5nZTogW1syLCAxXSwgW2xpbmsubGVuZ3RoICsgMSwgMV1dIH1dKTtcblx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGBbJHtsaW5rfV1gLCBbeyB1cmksIHJhbmdlOiBbWzIsIDFdLCBbbGluay5sZW5ndGggKyAxLCAxXV0gfV0pO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Ly8gT3ZlcnJpZGUgdGhlIHNldEZpbGVzIG1ldGhvZCB0byB3b3JrIHdpdGggdmFsaWRSZXNvdXJjZXMgZm9yIHRlc3Rpbmdcblx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElVcmlJZGVudGl0eVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHJlc29sdmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMaW5rUmVzb2x2ZXIpO1xuXHRcdHZhbGlkUmVzb3VyY2VzID0gW107XG5cblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0eHRlcm0gPSBuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgY29sczogODAsIHJvd3M6IDMwLCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BsYXRmb3JtIGluZGVwZW5kZW50JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRldGVjdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbExpbmtEZXRlY3RvciwgeHRlcm0sIHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSksIHtcblx0XHRcdFx0aW5pdGlhbEN3ZDogJy9wYXJlbnQvY3dkJyxcblx0XHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJIb21lOiAnL2hvbWUnLFxuXHRcdFx0XHRiYWNrZW5kOiB1bmRlZmluZWRcblx0XHRcdH0sIHJlc29sdmVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IG11bHRpcGxlIGxpbmsgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vJyksXG5cdFx0XHRcdFVSSS5maWxlKCcvcGFyZW50L2N3ZC9iYXInKVxuXHRcdFx0XTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgJy4vZm9vIC4vYmFyJywgW1xuXHRcdFx0XHR7IHJhbmdlOiBbWzEsIDFdLCBbNSwgMV1dLCB1cmk6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9LFxuXHRcdFx0XHR7IHJhbmdlOiBbWzcsIDFdLCBbMTEsIDFdXSwgdXJpOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvYmFyJykgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VwcG9ydCB0cmltbWluZyBleHRyYSBxdW90ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vJyldO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCAnXCJmb29cIlwiIG9uIGxpbmUgNScsIFtcblx0XHRcdFx0eyByYW5nZTogW1sxLCAxXSwgWzE2LCAxXV0sIHVyaTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgdHJpbW1pbmcgZXh0cmEgc3F1YXJlIGJyYWNrZXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpXTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgJ1wiZm9vXVwiIG9uIGxpbmUgNScsIFtcblx0XHRcdFx0eyByYW5nZTogW1sxLCAxXSwgWzE2LCAxXV0sIHVyaTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgZmluZGluZyBsaW5rcyBhZnRlciBicmFja2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKV07XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsICdiYXJbZm9vOjUnLCBbXG5cdFx0XHRcdHsgcmFuZ2U6IFtbNSwgMV0sIFs5LCAxXV0sIHVyaTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWFjT1MvTGludXgnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGV0ZWN0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsTGlua0RldGVjdG9yLCB4dGVybSwgc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKSwge1xuXHRcdFx0XHRpbml0aWFsQ3dkOiAnL3BhcmVudC9jd2QnLFxuXHRcdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4LFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckhvbWU6ICcvaG9tZScsXG5cdFx0XHRcdGJhY2tlbmQ6IHVuZGVmaW5lZFxuXHRcdFx0fSwgcmVzb2x2ZXIpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBsIG9mIHVuaXhMaW5rcykge1xuXHRcdFx0Y29uc3QgYmFzZUxpbmsgPSBpc1N0cmluZyhsKSA/IGwgOiBsLmxpbms7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzU3RyaW5nKGwpID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0c3VpdGUoYExpbms6ICR7YmFzZUxpbmt9YCwgKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN1cHBvcnRlZExpbmtGb3JtYXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlua0Zvcm1hdCA9IHN1cHBvcnRlZExpbmtGb3JtYXRzW2ldO1xuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdHRlZExpbmsgPSBmb3JtYXQobGlua0Zvcm1hdC51cmxGb3JtYXQsIGJhc2VMaW5rLCBsaW5rRm9ybWF0LmxpbmUsIGxpbmtGb3JtYXQuY29sdW1uKTtcblx0XHRcdFx0XHR0ZXN0KGBzaG91bGQgZGV0ZWN0IGluIFwiJHtmb3JtYXR0ZWRMaW5rfVwiYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3NXaXRoV3JhcHBlZChmb3JtYXR0ZWRMaW5rLCByZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0dpdCBkaWZmIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2Zvby9iYXInKV07XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGBkaWZmIC0tZ2l0IGEvZm9vL2JhciBiL2Zvby9iYXJgLCBbXG5cdFx0XHRcdHsgdXJpOiB2YWxpZFJlc291cmNlc1swXSwgcmFuZ2U6IFtbMTQsIDFdLCBbMjAsIDFdXSB9LFxuXHRcdFx0XHR7IHVyaTogdmFsaWRSZXNvdXJjZXNbMF0sIHJhbmdlOiBbWzI0LCAxXSwgWzMwLCAxXV0gfVxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGAtLS0gYS9mb28vYmFyYCwgW3sgdXJpOiB2YWxpZFJlc291cmNlc1swXSwgcmFuZ2U6IFtbNywgMV0sIFsxMywgMV1dIH1dKTtcblx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYCsrKyBiL2Zvby9iYXJgLCBbeyB1cmk6IHZhbGlkUmVzb3VyY2VzWzBdLCByYW5nZTogW1s3LCAxXSwgWzEzLCAxXV0gfV0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGVzdCBJU08gODYwMSBsaW5rcyBzZXBhcmF0ZWx5IHdpdGggb25seSBiYXNlIGZvcm1hdCB0byBhdm9pZCBzdWZmaXggY29uZmxpY3RzXG5cdFx0Ly8gTm90ZTogT25seSB0ZXN0IHBsYWluIGZvcm1hdCBhcyBjb2xvbnMgYXJlIGV4Y2x1ZGVkIHBhdGggY2hhcmFjdGVycyBpbiB0aGUgcmVnZXgsXG5cdFx0Ly8gc28gd3JhcHBlZCBjb250ZXh0cyAoc3BhY2VzLCBwYXJlbnRoZXNlcywgYnJhY2tldHMpIHdvbid0IHdvcmtcblx0XHRmb3IgKGNvbnN0IGwgb2YgdW5peExpbmtzV2l0aElzbykge1xuXHRcdFx0Y29uc3QgYmFzZUxpbmsgPSB0eXBlb2YgbCA9PT0gJ3N0cmluZycgPyBsIDogbC5saW5rO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0eXBlb2YgbCA9PT0gJ3N0cmluZycgPyBVUkkuZmlsZShsKSA6IGwucmVzb3VyY2U7XG5cdFx0XHR0ZXN0KGBzaG91bGQgZGV0ZWN0IElTTyA4NjAxIGxpbms6ICR7YmFzZUxpbmt9YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtyZXNvdXJjZV07XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBiYXNlTGluaywgW3sgdXJpOiByZXNvdXJjZSwgcmFuZ2U6IFtbMSwgMV0sIFtiYXNlTGluay5sZW5ndGgsIDFdXSB9XSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIE9ubHkgdGVzdCB0aGVzZSB3aGVuIG9uIFdpbmRvd3MgYmVjYXVzZSB0aGVyZSBpcyBzcGVjaWFsIGJlaGF2aW9yIGFyb3VuZCByZXBsYWNpbmcgc2VwYXJhdG9yc1xuXHQvLyBpbiBVUkkgdGhhdCBjYW5ub3QgYmUgY2hhbmdlZFxuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0c3VpdGUoJ1dpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3c2xVbml4VG9XaW5kb3dzUGF0aE1hcDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcblxuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRkZXRlY3RvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IsIHh0ZXJtLCBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpLCB7XG5cdFx0XHRcdFx0aW5pdGlhbEN3ZDogJ0M6XFxcXFBhcmVudFxcXFxDd2QnLFxuXHRcdFx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1c2VySG9tZTogJ0M6XFxcXEhvbWUnLFxuXHRcdFx0XHRcdGJhY2tlbmQ6IHtcblx0XHRcdFx0XHRcdGFzeW5jIGdldFdzbFBhdGgob3JpZ2luYWw6IHN0cmluZywgZGlyZWN0aW9uOiAndW5peC10by13aW4nIHwgJ3dpbi10by11bml4Jykge1xuXHRcdFx0XHRcdFx0XHRpZiAoZGlyZWN0aW9uID09PSAndW5peC10by13aW4nKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHdzbFVuaXhUb1dpbmRvd3NQYXRoTWFwLmdldChvcmlnaW5hbCkgPz8gb3JpZ2luYWw7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHJlc29sdmVyKTtcblx0XHRcdFx0d3NsVW5peFRvV2luZG93c1BhdGhNYXAuY2xlYXIoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGwgb2Ygd2luZG93c0xpbmtzKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2VMaW5rID0gaXNTdHJpbmcobCkgPyBsIDogbC5saW5rO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzU3RyaW5nKGwpID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0XHRzdWl0ZShgTGluayBcIiR7YmFzZUxpbmt9XCJgLCAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdXBwb3J0ZWRMaW5rRm9ybWF0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlua0Zvcm1hdCA9IHN1cHBvcnRlZExpbmtGb3JtYXRzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9ybWF0dGVkTGluayA9IGZvcm1hdChsaW5rRm9ybWF0LnVybEZvcm1hdCwgYmFzZUxpbmssIGxpbmtGb3JtYXQubGluZSwgbGlua0Zvcm1hdC5jb2x1bW4pO1xuXHRcdFx0XHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBpbiBcIiR7Zm9ybWF0dGVkTGlua31cImAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzV2l0aFdyYXBwZWQoZm9ybWF0dGVkTGluaywgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBsIG9mIHdpbmRvd3NGYWxsYmFja0xpbmtzKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2VMaW5rID0gaXNTdHJpbmcobCkgPyBsIDogbC5saW5rO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzU3RyaW5nKGwpID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0XHRzdWl0ZShgRmFsbGJhY2sgbGluayBcIiR7YmFzZUxpbmt9XCJgLCAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdXBwb3J0ZWRGYWxsYmFja0xpbmtGb3JtYXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rRm9ybWF0ID0gc3VwcG9ydGVkRmFsbGJhY2tMaW5rRm9ybWF0c1tpXTtcblx0XHRcdFx0XHRcdGNvbnN0IGZvcm1hdHRlZExpbmsgPSBmb3JtYXQobGlua0Zvcm1hdC51cmxGb3JtYXQsIGJhc2VMaW5rLCBsaW5rRm9ybWF0LmxpbmUsIGxpbmtGb3JtYXQuY29sdW1uKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmtDZWxsU3RhcnRPZmZzZXQgPSBsaW5rRm9ybWF0LmxpbmtDZWxsU3RhcnRPZmZzZXQgPz8gMDtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmtDZWxsRW5kT2Zmc2V0ID0gbGlua0Zvcm1hdC5saW5rQ2VsbEVuZE9mZnNldCA/PyAwO1xuXHRcdFx0XHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBpbiBcIiR7Zm9ybWF0dGVkTGlua31cImAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgZm9ybWF0dGVkTGluaywgW3sgdXJpOiByZXNvdXJjZSwgcmFuZ2U6IFtbMSArIGxpbmtDZWxsU3RhcnRPZmZzZXQsIDFdLCBbZm9ybWF0dGVkTGluay5sZW5ndGggKyBsaW5rQ2VsbEVuZE9mZnNldCwgMV1dIH1dKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRlc3QoJ0dpdCBkaWZmIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXInKTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYGRpZmYgLS1naXQgYS9mb28vYmFyIGIvZm9vL2JhcmAsIFtcblx0XHRcdFx0XHR7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzE0LCAxXSwgWzIwLCAxXV0gfSxcblx0XHRcdFx0XHR7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzI0LCAxXSwgWzMwLCAxXV0gfVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBgLS0tIGEvZm9vL2JhcmAsIFt7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzcsIDFdLCBbMTMsIDFdXSB9XSk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYCsrKyBiL2Zvby9iYXJgLCBbeyB1cmk6IHJlc291cmNlLCByYW5nZTogW1s3LCAxXSwgWzEzLCAxXV0gfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRlc3QgSVNPIDg2MDEgbGlua3Mgc2VwYXJhdGVseSB3aXRoIG9ubHkgYmFzZSBmb3JtYXQgdG8gYXZvaWQgc3VmZml4IGNvbmZsaWN0c1xuXHRcdFx0Ly8gTm90ZTogT25seSB0ZXN0IHBsYWluIGZvcm1hdCBhcyBjb2xvbnMgYXJlIGV4Y2x1ZGVkIHBhdGggY2hhcmFjdGVycyBpbiB0aGUgcmVnZXgsXG5cdFx0XHQvLyBzbyB3cmFwcGVkIGNvbnRleHRzIChzcGFjZXMsIHBhcmVudGhlc2VzLCBicmFja2V0cykgd29uJ3Qgd29ya1xuXHRcdFx0Zm9yIChjb25zdCBsIG9mIHdpbmRvd3NMaW5rc1dpdGhJc28pIHtcblx0XHRcdFx0Y29uc3QgYmFzZUxpbmsgPSB0eXBlb2YgbCA9PT0gJ3N0cmluZycgPyBsIDogbC5saW5rO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHR5cGVvZiBsID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKGwpIDogbC5yZXNvdXJjZTtcblx0XHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBJU08gODYwMSBsaW5rOiAke2Jhc2VMaW5rfWAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtyZXNvdXJjZV07XG5cdFx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYmFzZUxpbmssIFt7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzEsIDFdLCBbYmFzZUxpbmsubGVuZ3RoLCAxXV0gfV0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0c3VpdGUoJ1dTTCcsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnVW5peCAtPiBXaW5kb3dzIC9tbnQvIHN0eWxlIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHdzbFVuaXhUb1dpbmRvd3NQYXRoTWFwLnNldCgnL21udC9jL2Zvby9iYXInLCAnQzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5maWxlKCdDOlxcXFxmb29cXFxcYmFyJyldO1xuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rc1dpdGhXcmFwcGVkKCcvbW50L2MvZm9vL2JhcicsIHZhbGlkUmVzb3VyY2VzWzBdKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnV2luZG93cyAtPiBVbml4IFxcXFxcXFxcd3NsJFxcXFwgc3R5bGUgbGlua3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLmZpbGUoJ1xcXFxcXFxcd3NsJFxcXFxEZWJpYW5cXFxcaG9tZVxcXFxmb29cXFxcYmFyJyldO1xuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rc1dpdGhXcmFwcGVkKCdcXFxcXFxcXHdzbCRcXFxcRGViaWFuXFxcXGhvbWVcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdXaW5kb3dzIC0+IFVuaXggXFxcXFxcXFx3c2wubG9jYWxob3N0XFxcXCBzdHlsZSBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkuZmlsZSgnXFxcXFxcXFx3c2wubG9jYWxob3N0XFxcXERlYmlhblxcXFxob21lXFxcXGZvb1xcXFxiYXInKV07XG5cdFx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzV2l0aFdyYXBwZWQoJ1xcXFxcXFxcd3NsLmxvY2FsaG9zdFxcXFxEZWJpYW5cXFxcaG9tZVxcXFxmb29cXFxcYmFyJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLHVCQUF1QjtBQUMzQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQWtEO0FBQzNELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLFlBQTBEO0FBQUE7QUFBQSxFQUUvRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUVBLEVBQUUsTUFBTSxlQUFlLFVBQVUsSUFBSSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQ2xELEVBQUUsTUFBTSxtQkFBbUIsVUFBVSxJ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
