import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { format } from "../../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { assertLinkHelper } from "./linkTestUtils.js";
import { timeout } from "../../../../../../base/common/async.js";
import { strictEqual } from "assert";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { createFileStat } from "../../../../../test/common/workbenchTestServices.js";
import { URI } from "../../../../../../base/common/uri.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { TerminalMultiLineLinkDetector } from "../../browser/terminalMultiLineLinkDetector.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
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
  // User home
  { link: "~/foo", resource: URI.file("/home/foo") },
  // Relative
  { link: "./foo", resource: URI.file("/parent/cwd/foo") },
  { link: "./$foo", resource: URI.file("/parent/cwd/$foo") },
  { link: "../foo", resource: URI.file("/parent/foo") },
  { link: "foo/bar", resource: URI.file("/parent/cwd/foo/bar") },
  { link: "foo/bar+more", resource: URI.file("/parent/cwd/foo/bar+more") }
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
const supportedLinkFormats = [
  // 5: file content...                         [#181837]
  //   5:3  error                               [#181837]
  { urlFormat: "{0}\r\n{1}:foo", line: "5" },
  { urlFormat: "{0}\r\n{1}: foo", line: "5" },
  { urlFormat: "{0}\r\n5:another link\r\n{1}:{2} foo", line: "5", column: "3" },
  { urlFormat: "{0}\r\n  {1}:{2} foo", line: "5", column: "3" },
  { urlFormat: "{0}\r\n  5:6  error  another one\r\n  {1}:{2}  error", line: "5", column: "3" },
  { urlFormat: `{0}\r
  5:6  error  ${"a".repeat(80)}\r
  {1}:{2}  error`, line: "5", column: "3" },
  // @@ ... <to-file-range> @@ content...       [#182878]   (tests check the entire line, so they don't include the line content at the end of the last @@)
  { urlFormat: "+++ b/{0}\r\n@@ -7,6 +{1},7 @@", line: "5" },
  { urlFormat: "+++ b/{0}\r\n@@ -1,1 +1,1 @@\r\nfoo\r\nbar\r\n@@ -7,6 +{1},7 @@", line: "5" }
];
suite("Workbench - TerminalMultiLineLinkDetector", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
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
  async function assertLinksMain(link, resource) {
    const uri = resource ?? URI.file(link);
    const lines = link.split("\r\n");
    const lastLine = lines.at(-1);
    let lineCount = 0;
    for (const line of lines) {
      lineCount += Math.max(Math.ceil(line.length / 80), 1);
    }
    await assertLinks(TerminalBuiltinLinkType.LocalFile, link, [{ uri, range: [[1, lineCount], [lastLine.length, lineCount]] }]);
  }
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IFileService, {
      async stat(resource) {
        if (!validResources.map((e) => e.path).includes(resource.path)) {
          throw new Error("Doesn't exist");
        }
        return createFileStat(resource);
      }
    });
    instantiationService.stub(ITerminalLogService, new NullLogService());
    resolver = instantiationService.createInstance(TerminalLinkResolver);
    validResources = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
  });
  suite("macOS/Linux", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
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
          test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
            validResources = [resource];
            await assertLinksMain(formattedLink, resource);
          });
        }
      });
    }
  });
  if (isWindows) {
    suite("Windows", () => {
      setup(() => {
        detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
          initialCwd: "C:\\Parent\\Cwd",
          os: OperatingSystem.Windows,
          remoteAuthority: void 0,
          userHome: "C:\\Home"
        }, resolver);
      });
      for (const l of windowsLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Link "${baseLink}"`, () => {
          for (let i = 0; i < supportedLinkFormats.length; i++) {
            const linkFormat = supportedLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
              validResources = [resource];
              await assertLinksMain(formattedLink, resource);
            });
          }
        });
      }
    });
  }
});
function escapeMultilineTestName(text) {
  return text.replaceAll("\r\n", "\\r\\n");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9saW5rcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRMaW5rSGVscGVyIH0gZnJvbSAnLi9saW5rVGVzdFV0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFRlcm1pbmFsTGlua1Jlc29sdmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExpbmtSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5jb25zdCB1bml4TGlua3M6IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQvLyBBYnNvbHV0ZVxuXHQnL2ZvbycsXG5cdCcvZm9vL2JhcicsXG5cdCcvZm9vL1tiYXJdJyxcblx0Jy9mb28vW2Jhcl0uYmF6Jyxcblx0Jy9mb28vW2Jhcl0vYmF6Jyxcblx0Jy9mb28vYmFyK21vcmUnLFxuXHQvLyBVc2VyIGhvbWVcblx0eyBsaW5rOiAnfi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9ob21lL2ZvbycpIH0sXG5cdC8vIFJlbGF0aXZlXG5cdHsgbGluazogJy4vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9LFxuXHR7IGxpbms6ICcuLyRmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkLyRmb28nKSB9LFxuXHR7IGxpbms6ICcuLi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvZm9vJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vL2JhcicpIH0sXG5cdHsgbGluazogJ2Zvby9iYXIrbW9yZScsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vL2Jhcittb3JlJykgfSxcbl07XG5cbmNvbnN0IHdpbmRvd3NMaW5rczogKHN0cmluZyB8IHsgbGluazogc3RyaW5nOyByZXNvdXJjZTogVVJJIH0pW10gPSBbXG5cdC8vIEFic29sdXRlXG5cdCdjOlxcXFxmb28nLFxuXHR7IGxpbms6ICdcXFxcXFxcXD9cXFxcQzpcXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxmb28nKSB9LFxuXHQnYzovZm9vJyxcblx0J2M6L2Zvby9iYXInLFxuXHQnYzpcXFxcZm9vXFxcXGJhcicsXG5cdCdjOlxcXFxmb29cXFxcYmFyK21vcmUnLFxuXHQnYzpcXFxcZm9vL2JhclxcXFxiYXonLFxuXHQvLyBVc2VyIGhvbWVcblx0eyBsaW5rOiAnflxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXEhvbWVcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnfi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXEhvbWVcXFxcZm9vJykgfSxcblx0Ly8gUmVsYXRpdmVcblx0eyBsaW5rOiAnLlxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnLi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnLi8kZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXCRmb28nKSB9LFxuXHR7IGxpbms6ICcuLlxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxmb28nKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXInKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXInKSB9LFxuXHR7IGxpbms6ICdmb28vW2Jhcl0nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdJykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdLmJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0uYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdL2JheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0vYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXGJhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXFtiYXJdLmJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl0uYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXFtiYXJdXFxcXGJheicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcW2Jhcl1cXFxcYmF6JykgfSxcblx0eyBsaW5rOiAnZm9vXFxcXGJhcittb3JlJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxiYXIrbW9yZScpIH0sXG5dO1xuXG5pbnRlcmZhY2UgTGlua0Zvcm1hdEluZm8ge1xuXHR1cmxGb3JtYXQ6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZmZzZXQgdG8gdGhlIGJ1ZmZlciByYW5nZSB0aGF0IGlzIG5vdCBpbiB0aGUgYWN0dWFsIGxpbmsgKGJ1dCBpcyBpbiB0aGUgbWF0Y2hlZFxuXHQgKiBhcmVhLlxuXHQgKi9cblx0bGlua0NlbGxTdGFydE9mZnNldD86IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBlbmQgb2Zmc2V0IHRvIHRoZSBidWZmZXIgcmFuZ2UgdGhhdCBpcyBub3QgaW4gdGhlIGFjdHVhbCBsaW5rIChidXQgaXMgaW4gdGhlIG1hdGNoZWRcblx0ICogYXJlYS5cblx0ICovXG5cdGxpbmtDZWxsRW5kT2Zmc2V0PzogbnVtYmVyO1xuXHRsaW5lPzogc3RyaW5nO1xuXHRjb2x1bW4/OiBzdHJpbmc7XG59XG5cbmNvbnN0IHN1cHBvcnRlZExpbmtGb3JtYXRzOiBMaW5rRm9ybWF0SW5mb1tdID0gW1xuXHQvLyA1OiBmaWxlIGNvbnRlbnQuLi4gICAgICAgICAgICAgICAgICAgICAgICAgWyMxODE4MzddXG5cdC8vICAgNTozICBlcnJvciAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbIzE4MTgzN11cblx0eyB1cmxGb3JtYXQ6ICd7MH1cXHJcXG57MX06Zm9vJywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XFxyXFxuezF9OiBmb28nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cXHJcXG41OmFub3RoZXIgbGlua1xcclxcbnsxfTp7Mn0gZm9vJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVxcclxcbiAgezF9OnsyfSBmb28nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XFxyXFxuICA1OjYgIGVycm9yICBhbm90aGVyIG9uZVxcclxcbiAgezF9OnsyfSAgZXJyb3InLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiBgezB9XFxyXFxuICA1OjYgIGVycm9yICAkeydhJy5yZXBlYXQoODApfVxcclxcbiAgezF9OnsyfSAgZXJyb3JgLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cblx0Ly8gQEAgLi4uIDx0by1maWxlLXJhbmdlPiBAQCBjb250ZW50Li4uICAgICAgIFsjMTgyODc4XSAgICh0ZXN0cyBjaGVjayB0aGUgZW50aXJlIGxpbmUsIHNvIHRoZXkgZG9uJ3QgaW5jbHVkZSB0aGUgbGluZSBjb250ZW50IGF0IHRoZSBlbmQgb2YgdGhlIGxhc3QgQEApXG5cdHsgdXJsRm9ybWF0OiAnKysrIGIvezB9XFxyXFxuQEAgLTcsNiArezF9LDcgQEAnLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICcrKysgYi97MH1cXHJcXG5AQCAtMSwxICsxLDEgQEBcXHJcXG5mb29cXHJcXG5iYXJcXHJcXG5AQCAtNyw2ICt7MX0sNyBAQCcsIGxpbmU6ICc1JyB9LFxuXTtcblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGRldGVjdG9yOiBUZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3Rvcjtcblx0bGV0IHJlc29sdmVyOiBUZXJtaW5hbExpbmtSZXNvbHZlcjtcblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblx0bGV0IHZhbGlkUmVzb3VyY2VzOiBVUklbXTtcblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRMaW5rcyhcblx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSxcblx0XHR0ZXh0OiBzdHJpbmcsXG5cdFx0ZXhwZWN0ZWQ6ICh7IHVyaTogVVJJOyByYW5nZTogW251bWJlciwgbnVtYmVyXVtdIH0pW11cblx0KSB7XG5cdFx0bGV0IHRvO1xuXHRcdGNvbnN0IHJhY2UgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0YXNzZXJ0TGlua0hlbHBlcih0ZXh0LCBleHBlY3RlZCwgZGV0ZWN0b3IsIHR5cGUpLnRoZW4oKCkgPT4gJ3N1Y2Nlc3MnKSxcblx0XHRcdCh0byA9IHRpbWVvdXQoMikpLnRoZW4oKCkgPT4gJ3RpbWVvdXQnKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJhY2UsICdzdWNjZXNzJywgYEF3YWl0aW5nIGxpbmsgYXNzZXJ0aW9uIGZvciBcIiR7dGV4dH1cIiB0aW1lZCBvdXRgKTtcblx0XHR0by5jYW5jZWwoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGFzc2VydExpbmtzTWFpbihsaW5rOiBzdHJpbmcsIHJlc291cmNlPzogVVJJKSB7XG5cdFx0Y29uc3QgdXJpID0gcmVzb3VyY2UgPz8gVVJJLmZpbGUobGluayk7XG5cdFx0Y29uc3QgbGluZXMgPSBsaW5rLnNwbGl0KCdcXHJcXG4nKTtcblx0XHRjb25zdCBsYXN0TGluZSA9IGxpbmVzLmF0KC0xKSE7XG5cdFx0Ly8gQ291bnQgbGluZXMsIGFjY291bnRpbmcgZm9yIHdyYXBwaW5nXG5cdFx0bGV0IGxpbmVDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRsaW5lQ291bnQgKz0gTWF0aC5tYXgoTWF0aC5jZWlsKGxpbmUubGVuZ3RoIC8gODApLCAxKTtcblx0XHR9XG5cdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBsaW5rLCBbeyB1cmksIHJhbmdlOiBbWzEsIGxpbmVDb3VudF0sIFtsYXN0TGluZS5sZW5ndGgsIGxpbmVDb3VudF1dIH1dKTtcblx0fVxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdGFzeW5jIHN0YXQocmVzb3VyY2UpIHtcblx0XHRcdFx0aWYgKCF2YWxpZFJlc291cmNlcy5tYXAoZSA9PiBlLnBhdGgpLmluY2x1ZGVzKHJlc291cmNlLnBhdGgpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEb2VzblxcJ3QgZXhpc3QnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlRmlsZVN0YXQocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHJlc29sdmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMaW5rUmVzb2x2ZXIpO1xuXHRcdHZhbGlkUmVzb3VyY2VzID0gW107XG5cblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0eHRlcm0gPSBuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgY29sczogODAsIHJvd3M6IDMwLCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21hY09TL0xpbnV4JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRldGVjdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IsIHh0ZXJtLCB7XG5cdFx0XHRcdGluaXRpYWxDd2Q6ICcvcGFyZW50L2N3ZCcsXG5cdFx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXgsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySG9tZTogJy9ob21lJyxcblx0XHRcdFx0YmFja2VuZDogdW5kZWZpbmVkXG5cdFx0XHR9LCByZXNvbHZlcik7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IGwgb2YgdW5peExpbmtzKSB7XG5cdFx0XHRjb25zdCBiYXNlTGluayA9IGlzU3RyaW5nKGwpID8gbCA6IGwubGluaztcblx0XHRcdGNvbnN0IHJlc291cmNlID0gaXNTdHJpbmcobCkgPyBVUkkuZmlsZShsKSA6IGwucmVzb3VyY2U7XG5cdFx0XHRzdWl0ZShgTGluazogJHtiYXNlTGlua31gLCAoKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3VwcG9ydGVkTGlua0Zvcm1hdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBsaW5rRm9ybWF0ID0gc3VwcG9ydGVkTGlua0Zvcm1hdHNbaV07XG5cdFx0XHRcdFx0Y29uc3QgZm9ybWF0dGVkTGluayA9IGZvcm1hdChsaW5rRm9ybWF0LnVybEZvcm1hdCwgYmFzZUxpbmssIGxpbmtGb3JtYXQubGluZSwgbGlua0Zvcm1hdC5jb2x1bW4pO1xuXHRcdFx0XHRcdHRlc3QoYHNob3VsZCBkZXRlY3QgaW4gXCIke2VzY2FwZU11bHRpbGluZVRlc3ROYW1lKGZvcm1hdHRlZExpbmspfVwiYCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3NNYWluKGZvcm1hdHRlZExpbmssIHJlc291cmNlKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBPbmx5IHRlc3QgdGhlc2Ugd2hlbiBvbiBXaW5kb3dzIGJlY2F1c2UgdGhlcmUgaXMgc3BlY2lhbCBiZWhhdmlvciBhcm91bmQgcmVwbGFjaW5nIHNlcGFyYXRvcnNcblx0Ly8gaW4gVVJJIHRoYXQgY2Fubm90IGJlIGNoYW5nZWRcblx0aWYgKGlzV2luZG93cykge1xuXHRcdHN1aXRlKCdXaW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRkZXRlY3RvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yLCB4dGVybSwge1xuXHRcdFx0XHRcdGluaXRpYWxDd2Q6ICdDOlxcXFxQYXJlbnRcXFxcQ3dkJyxcblx0XHRcdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckhvbWU6ICdDOlxcXFxIb21lJyxcblx0XHRcdFx0fSwgcmVzb2x2ZXIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3QgbCBvZiB3aW5kb3dzTGlua3MpIHtcblx0XHRcdFx0Y29uc3QgYmFzZUxpbmsgPSBpc1N0cmluZyhsKSA/IGwgOiBsLmxpbms7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gaXNTdHJpbmcobCkgPyBVUkkuZmlsZShsKSA6IGwucmVzb3VyY2U7XG5cdFx0XHRcdHN1aXRlKGBMaW5rIFwiJHtiYXNlTGlua31cImAsICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN1cHBvcnRlZExpbmtGb3JtYXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rRm9ybWF0ID0gc3VwcG9ydGVkTGlua0Zvcm1hdHNbaV07XG5cdFx0XHRcdFx0XHRjb25zdCBmb3JtYXR0ZWRMaW5rID0gZm9ybWF0KGxpbmtGb3JtYXQudXJsRm9ybWF0LCBiYXNlTGluaywgbGlua0Zvcm1hdC5saW5lLCBsaW5rRm9ybWF0LmNvbHVtbik7XG5cdFx0XHRcdFx0XHR0ZXN0KGBzaG91bGQgZGV0ZWN0IGluIFwiJHtlc2NhcGVNdWx0aWxpbmVUZXN0TmFtZShmb3JtYXR0ZWRMaW5rKX1cImAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rc01haW4oZm9ybWF0dGVkTGluaywgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIGVzY2FwZU11bHRpbGluZVRlc3ROYW1lKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0ZXh0LnJlcGxhY2VBbGwoJ1xcclxcbicsICdcXFxcclxcXFxuJyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sWUFBMEQ7QUFBQTtBQUFBLEVBRS9EO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBRUEsRUFBRSxNQUFNLFNBQVMsVUFBVSxJQUFJLEtBQUssV0FBVyxFQUFFO0FBQUE7QUFBQSxFQUVqRCxFQUFFLE1BQU0sU0FBUyxVQUFVLElBQUksS0FBSyxpQkFBaUIsRUFBRTtBQUFBLEVBQ3ZELEVBQUUsTUFBTSxVQUFVLFVBQVUsSUFBSSxLQUFLLGtCQUFrQixFQUFFO0FBQUEsRUFDekQsRUFBRSxNQUFNLFVBQVUsVUFBVSxJQUFJLEtBQUssYUFBYSxFQUFFO0FBQUEsRUFDcEQsRUFBRSxNQUFNLFdBQVcsVUFBVSxJQUFJLEtBQUsscUJBQXFCLEVBQUU7QUFBQSxFQUM3RCxFQUFFLE1BQU0sZ0JBQWdCLFVBQVUsSUFBSSxLQUFLLDBCQUEwQixFQUFFO0FBQ3hFO0FBRUEsTUFBTSxlQUE2RDtBQUFBO0FBQUEsRUFFbEU7QUFBQSxFQUNBLEVBQUUsTUFBTSxrQkFBa0IsVUFBVSxJQUFJLEtBQUssU0FBUyxFQUFFO0FBQUEsRUFDeEQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUVBLEVBQUUsTUFBTSxVQUFVLFVBQVUsSUFBSSxLQUFLLGVBQWUsRUFBRTtBQUFBLEVBQ3RELEVBQUUsTUFBTSxTQUFTLFVBQVUsSUFBSSxLQUFLLGVBQWUsRUFBRTtBQUFBO0FBQUEsRUFFckQsRUFBRSxNQUFNLFVBQVUsVUFBVSxJQUFJLEtBQUssc0JBQXNCLEVBQUU7QUFBQSxFQUM3RCxFQUFFLE1BQU0sU0FBUyxVQUFVLElBQUksS0FBSyxzQkFBc0IsRUFBRTtBQUFBLEVBQzVELEVBQUUsTUFBTSxVQUFVLFVBQVUsSUFBSSxLQUFLLHVCQUF1QixFQUFFO0FBQUEsRUFDOUQsRUFBRSxNQUFNLFdBQVcsVUFBVSxJQUFJLEtBQUssaUJBQWlCLEVBQUU7QUFBQSxFQUN6RCxFQUFFLE1BQU0sV0FBVyxVQUFVLElBQUksS0FBSywyQkFBMkIsRUFBRTtBQUFBLEVBQ25FLEVBQUUsTUFBTSxXQUFXLFVBQVUsSUFBSSxLQUFLLDJCQUEyQixFQUFFO0FBQUEsRUFDbkUsRUFBRSxNQUFNLGFBQWEsVUFBVSxJQUFJLEtBQUssNkJBQTZCLEVBQUU7QUFBQSxFQUN2RSxFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxLQUFLLGlDQUFpQyxFQUFFO0FBQUEsRUFDL0UsRUFBRSxNQUFNLGlCQUFpQixVQUFVLElBQUksS0FBSyxpQ0FBaUMsRUFBRTtBQUFBLEVBQy9FLEVBQUUsTUFBTSxZQUFZLFVBQVUsSUFBSSxLQUFLLDJCQUEyQixFQUFFO0FBQUEsRUFDcEUsRUFBRSxNQUFNLGtCQUFrQixVQUFVLElBQUksS0FBSyxpQ0FBaUMsRUFBRTtBQUFBLEVBQ2hGLEVBQUUsTUFBTSxtQkFBbUIsVUFBVSxJQUFJLEtBQUssa0NBQWtDLEVBQUU7QUFBQSxFQUNsRixFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxLQUFLLGdDQUFnQyxFQUFFO0FBQy9FO0FBa0JBLE1BQU0sdUJBQXlDO0FBQUE7QUFBQTtBQUFBLEVBRzlDLEVBQUUsV0FBVyxrQkFBa0IsTUFBTSxJQUFJO0FBQUEsRUFDekMsRUFBRSxXQUFXLG1CQUFtQixNQUFNLElBQUk7QUFBQSxFQUMxQyxFQUFFLFdBQVcsd0NBQXdDLE1BQU0sS0FBSyxRQUFRLElBQUk7QUFBQSxFQUM1RSxFQUFFLFdBQVcsd0JBQXdCLE1BQU0sS0FBSyxRQUFRLElBQUk7QUFBQSxFQUM1RCxFQUFFLFdBQVcsd0RBQXdELE1BQU0sS0FBSyxRQUFRLElBQUk7QUFBQSxFQUM1RixFQUFFLFdBQVc7QUFBQSxnQkFBd0IsSUFBSSxPQUFPLEVBQUUsQ0FBQztBQUFBLG1CQUF3QixNQUFNLEtBQUssUUFBUSxJQUFJO0FBQUE7QUFBQSxFQUdsRyxFQUFFLFdBQVcsa0NBQWtDLE1BQU0sSUFBSTtBQUFBLEVBQ3pELEVBQUUsV0FBVyxtRUFBbUUsTUFBTSxJQUFJO0FBQzNGO0FBRUEsTUFBTSw2Q0FBNkMsTUFBTTtBQUN4RCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLGlCQUFlLFlBQ2QsTUFDQSxNQUNBLFVBQ0M7QUFDRCxRQUFJO0FBQ0osVUFBTSxPQUFPLE1BQU0sUUFBUSxLQUFLO0FBQUEsTUFDL0IsaUJBQWlCLE1BQU0sVUFBVSxVQUFVLElBQUksRUFBRSxLQUFLLE1BQU0sU0FBUztBQUFBLE9BQ3BFLEtBQUssUUFBUSxDQUFDLEdBQUcsS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUN2QyxDQUFDO0FBQ0QsZ0JBQVksTUFBTSxXQUFXLGdDQUFnQyxJQUFJLGFBQWE7QUFDOUUsT0FBRyxPQUFPO0FBQUEsRUFDWDtBQUVBLGlCQUFlLGdCQUFnQixNQUFjLFVBQWdCO0FBQzVELFVBQU0sTUFBTSxZQUFZLElBQUksS0FBSyxJQUFJO0FBQ3JDLFVBQU0sUUFBUSxLQUFLLE1BQU0sTUFBTTtBQUMvQixVQUFNLFdBQVcsTUFBTSxHQUFHLEVBQUU7QUFFNUIsUUFBSSxZQUFZO0FBQ2hCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLG1CQUFhLEtBQUssSUFBSSxLQUFLLEtBQUssS0FBSyxTQUFTLEVBQUUsR0FBRyxDQUFDO0FBQUEsSUFDckQ7QUFDQSxVQUFNLFlBQVksd0JBQXdCLFdBQVcsTUFBTSxDQUFDLEVBQUUsS0FBSyxPQUFPLENBQUMsQ0FBQyxHQUFHLFNBQVMsR0FBRyxDQUFDLFNBQVMsUUFBUSxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFBQSxFQUM1SDtBQUVBLFFBQU0sWUFBWTtBQUNqQiwyQkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDL0QsMkJBQXVCLElBQUkseUJBQXlCO0FBQ3BELHlCQUFxQixLQUFLLHVCQUF1QixvQkFBb0I7QUFDckUseUJBQXFCLEtBQUssY0FBYztBQUFBLE1BQ3ZDLE1BQU0sS0FBSyxVQUFVO0FBQ3BCLFlBQUksQ0FBQyxlQUFlLElBQUksT0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLFNBQVMsSUFBSSxHQUFHO0FBQzdELGdCQUFNLElBQUksTUFBTSxlQUFnQjtBQUFBLFFBQ2pDO0FBQ0EsZUFBTyxlQUFlLFFBQVE7QUFBQSxNQUMvQjtBQUFBLElBQ0QsQ0FBQztBQUNELHlCQUFxQixLQUFLLHFCQUFxQixJQUFJLGVBQWUsQ0FBQztBQUNuRSxlQUFXLHFCQUFxQixlQUFlLG9CQUFvQjtBQUNuRSxxQkFBaUIsQ0FBQztBQUVsQixVQUFNLGdCQUFnQixNQUFNLG9CQUFtRCxnQkFBZ0IsY0FBYyxHQUFHO0FBQ2hILFlBQVEsSUFBSSxhQUFhLEVBQUUsa0JBQWtCLE1BQU0sTUFBTSxJQUFJLE1BQU0sSUFBSSxRQUFRLGdCQUFnQixDQUFDO0FBQUEsRUFDakcsQ0FBQztBQUVELFFBQU0sZUFBZSxNQUFNO0FBQzFCLFVBQU0sTUFBTTtBQUNYLGlCQUFXLHFCQUFxQixlQUFlLCtCQUErQixPQUFPO0FBQUEsUUFDcEYsWUFBWTtBQUFBLFFBQ1osSUFBSSxnQkFBZ0I7QUFBQSxRQUNwQixpQkFBaUI7QUFBQSxRQUNqQixVQUFVO0FBQUEsUUFDVixTQUFTO0FBQUEsTUFDVixHQUFHLFFBQVE7QUFBQSxJQUNaLENBQUM7QUFFRCxlQUFXLEtBQUssV0FBVztBQUMxQixZQUFNLFdBQVcsU0FBUyxDQUFDLElBQUksSUFBSSxFQUFFO0FBQ3JDLFlBQU0sV0FBVyxTQUFTLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUU7QUFDL0MsWUFBTSxTQUFTLFFBQVEsSUFBSSxNQUFNO0FBQ2hDLGlCQUFTLElBQUksR0FBRyxJQUFJLHFCQUFxQixRQUFRLEtBQUs7QUFDckQsZ0JBQU0sYUFBYSxxQkFBcUIsQ0FBQztBQUN6QyxnQkFBTSxnQkFBZ0IsT0FBTyxXQUFXLFdBQVcsVUFBVSxXQUFXLE1BQU0sV0FBVyxNQUFNO0FBQy9GLGVBQUsscUJBQXFCLHdCQUF3QixhQUFhLENBQUMsS0FBSyxZQUFZO0FBQ2hGLDZCQUFpQixDQUFDLFFBQVE7QUFDMUIsa0JBQU0sZ0JBQWdCLGVBQWUsUUFBUTtBQUFBLFVBQzlDLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUlELE1BQUksV0FBVztBQUNkLFVBQU0sV0FBVyxNQUFNO0FBQ3RCLFlBQU0sTUFBTTtBQUNYLG1CQUFXLHFCQUFxQixlQUFlLCtCQUErQixPQUFPO0FBQUEsVUFDcEYsWUFBWTtBQUFBLFVBQ1osSUFBSSxnQkFBZ0I7QUFBQSxVQUNwQixpQkFBaUI7QUFBQSxVQUNqQixVQUFVO0FBQUEsUUFDWCxHQUFHLFFBQVE7QUFBQSxNQUNaLENBQUM7QUFFRCxpQkFBVyxLQUFLLGNBQWM7QUFDN0IsY0FBTSxXQUFXLFNBQVMsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUNyQyxjQUFNLFdBQVcsU0FBUyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFO0FBQy9DLGNBQU0sU0FBUyxRQUFRLEtBQUssTUFBTTtBQUNqQyxtQkFBUyxJQUFJLEdBQUcsSUFBSSxxQkFBcUIsUUFBUSxLQUFLO0FBQ3JELGtCQUFNLGFBQWEscUJBQXFCLENBQUM7QUFDekMsa0JBQU0sZ0JBQWdCLE9BQU8sV0FBVyxXQUFXLFVBQVUsV0FBVyxNQUFNLFdBQVcsTUFBTTtBQUMvRixpQkFBSyxxQkFBcUIsd0JBQXdCLGFBQWEsQ0FBQyxLQUFLLFlBQVk7QUFDaEYsK0JBQWlCLENBQUMsUUFBUTtBQUMxQixvQkFBTSxnQkFBZ0IsZUFBZSxRQUFRO0FBQUEsWUFDOUMsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7QUFFRCxTQUFTLHdCQUF3QixNQUFzQjtBQUN0RCxTQUFPLEtBQUssV0FBVyxRQUFRLFFBQVE7QUFDeEM7IiwKICAibmFtZXMiOiBbXQp9Cg==
