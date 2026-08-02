import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { parseCommand, parseCommandHead, segmentHasFlag, segmentHead, tokenize } from "../../browser/tools/terminalCommandParser.js";
suite("terminalCommandParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("tokenize", () => {
    test("splits on whitespace", () => {
      deepStrictEqual(tokenize("git diff HEAD~1 src/foo.ts"), ["git", "diff", "HEAD~1", "src/foo.ts"]);
    });
    test("respects single quotes", () => {
      deepStrictEqual(tokenize(`grep 'a b c' file`), ["grep", "a b c", "file"]);
    });
    test("respects double quotes with escapes", () => {
      deepStrictEqual(tokenize(`echo "a \\"b\\" c"`), ["echo", 'a "b" c']);
    });
    test("respects backslash escapes outside quotes", () => {
      deepStrictEqual(tokenize("cat foo\\ bar.txt"), ["cat", "foo bar.txt"]);
    });
    test("handles unterminated quotes gracefully", () => {
      deepStrictEqual(tokenize(`echo "unterminated`), ["echo", "unterminated"]);
    });
    test("preserves empty quoted strings", () => {
      deepStrictEqual(tokenize(`grep "" file`), ["grep", "", "file"]);
    });
  });
  suite("parseCommand composition", () => {
    test("returns undefined for empty input", () => {
      strictEqual(parseCommand(void 0), void 0);
      strictEqual(parseCommand(""), void 0);
      strictEqual(parseCommand("   "), void 0);
    });
    test("splits pipelines", () => {
      const parsed = parseCommand("git diff | cat");
      strictEqual(parsed?.segments.length, 2);
      strictEqual(parsed?.segments[0].trailingSeparator, "|");
      deepStrictEqual(parsed?.segments[0].tokens, ["git", "diff"]);
      deepStrictEqual(parsed?.segments[1].tokens, ["cat"]);
    });
    test("splits on && and ||", () => {
      const parsed = parseCommand("npm install && npm test || echo fail");
      strictEqual(parsed?.segments.length, 3);
      strictEqual(parsed?.segments[0].trailingSeparator, "&&");
      strictEqual(parsed?.segments[1].trailingSeparator, "||");
    });
    test("does not split on separators inside quotes", () => {
      const parsed = parseCommand(`echo "a;b" | wc -l`);
      strictEqual(parsed?.segments.length, 2);
      deepStrictEqual(parsed?.segments[0].tokens, ["echo", "a;b"]);
    });
    test("strips leading env assignments", () => {
      const parsed = parseCommand("CI=1 NODE_ENV=test npm install");
      strictEqual(parsed?.segments.length, 1);
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["CI=1", "NODE_ENV=test"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["npm", "install"]);
    });
    test("strips sudo wrapper", () => {
      const parsed = parseCommand("sudo apt-get install -y vim");
      deepStrictEqual(parsed?.segments[0].wrappers, ["sudo"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["apt-get", "install", "-y", "vim"]);
    });
    test("strips time wrapper", () => {
      const parsed = parseCommand("time cargo build");
      deepStrictEqual(parsed?.segments[0].wrappers, ["time"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["cargo", "build"]);
    });
    test("strips timeout wrapper with numeric arg", () => {
      const parsed = parseCommand("timeout 30 npm test");
      deepStrictEqual(parsed?.segments[0].wrappers, ["timeout"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["npm", "test"]);
    });
    test("strips env wrapper with inner env vars", () => {
      const parsed = parseCommand("env -i PATH=/usr/bin make all");
      deepStrictEqual(parsed?.segments[0].wrappers, ["env"]);
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["PATH=/usr/bin"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["make", "all"]);
    });
    test("strips combined env + wrapper", () => {
      const parsed = parseCommand("FOO=bar sudo time git diff");
      deepStrictEqual(parsed?.segments[0].envPrefixes, ["FOO=bar"]);
      deepStrictEqual(parsed?.segments[0].wrappers, ["sudo", "time"]);
      deepStrictEqual(parsed?.segments[0].tokens, ["git", "diff"]);
    });
  });
  suite("segmentHead", () => {
    test("handles plain command", () => {
      const seg = parseCommand("git diff HEAD~1").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "diff" });
    });
    test("skips long flags before subcommand", () => {
      const seg = parseCommand("git --no-pager diff src/foo.ts").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "diff" });
    });
    test("does not skip short flags", () => {
      const seg = parseCommand("git -C /tmp/repo diff").segments[0];
      deepStrictEqual(segmentHead(seg), { head: "git", sub: "-C" });
    });
  });
  suite("parseCommandHead", () => {
    test("returns undefined for empty input", () => {
      strictEqual(parseCommandHead(void 0), void 0);
      strictEqual(parseCommandHead(""), void 0);
    });
    test("parses simple commands", () => {
      deepStrictEqual(parseCommandHead("git diff HEAD~5"), { head: "git", sub: "diff" });
    });
    test("uses first segment of pipeline", () => {
      deepStrictEqual(parseCommandHead("git diff | cat"), { head: "git", sub: "diff" });
    });
    test("strips env / wrappers", () => {
      deepStrictEqual(parseCommandHead("CI=1 sudo time git status"), { head: "git", sub: "status" });
    });
  });
  suite("segmentHasFlag", () => {
    test("detects bundled short flags", () => {
      const seg = parseCommand("ls -la").segments[0];
      ok(segmentHasFlag(seg, ["l"]));
      ok(segmentHasFlag(seg, ["a"]));
      ok(!segmentHasFlag(seg, ["r"]));
    });
    test("detects long flags", () => {
      const seg = parseCommand("git --no-pager log").segments[0];
      ok(segmentHasFlag(seg, ["no-pager"]));
      ok(!segmentHasFlag(seg, ["pager"]));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvdGVybWluYWxDb21tYW5kUGFyc2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlQ29tbWFuZCwgcGFyc2VDb21tYW5kSGVhZCwgc2VnbWVudEhhc0ZsYWcsIHNlZ21lbnRIZWFkLCB0b2tlbml6ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvdGVybWluYWxDb21tYW5kUGFyc2VyLmpzJztcblxuc3VpdGUoJ3Rlcm1pbmFsQ29tbWFuZFBhcnNlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Rva2VuaXplJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NwbGl0cyBvbiB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKCdnaXQgZGlmZiBIRUFEfjEgc3JjL2Zvby50cycpLCBbJ2dpdCcsICdkaWZmJywgJ0hFQUR+MScsICdzcmMvZm9vLnRzJ10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Jlc3BlY3RzIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwodG9rZW5pemUoYGdyZXAgJ2EgYiBjJyBmaWxlYCksIFsnZ3JlcCcsICdhIGIgYycsICdmaWxlJ10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Jlc3BlY3RzIGRvdWJsZSBxdW90ZXMgd2l0aCBlc2NhcGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKGBlY2hvIFwiYSBcXFxcXCJiXFxcXFwiIGNcImApLCBbJ2VjaG8nLCAnYSBcImJcIiBjJ10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Jlc3BlY3RzIGJhY2tzbGFzaCBlc2NhcGVzIG91dHNpZGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKCdjYXQgZm9vXFxcXCBiYXIudHh0JyksIFsnY2F0JywgJ2ZvbyBiYXIudHh0J10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2hhbmRsZXMgdW50ZXJtaW5hdGVkIHF1b3RlcyBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKGBlY2hvIFwidW50ZXJtaW5hdGVkYCksIFsnZWNobycsICd1bnRlcm1pbmF0ZWQnXSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgncHJlc2VydmVzIGVtcHR5IHF1b3RlZCBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHRva2VuaXplKGBncmVwIFwiXCIgZmlsZWApLCBbJ2dyZXAnLCAnJywgJ2ZpbGUnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUNvbW1hbmQgY29tcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IGlucHV0JywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VDb21tYW5kKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmQoJycpLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VDb21tYW5kKCcgICAnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NwbGl0cyBwaXBlbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ2dpdCBkaWZmIHwgY2F0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzLmxlbmd0aCwgMik7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLnRyYWlsaW5nU2VwYXJhdG9yLCAnfCcpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMF0udG9rZW5zLCBbJ2dpdCcsICdkaWZmJ10pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHNbMV0udG9rZW5zLCBbJ2NhdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NwbGl0cyBvbiAmJiBhbmQgfHwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ25wbSBpbnN0YWxsICYmIG5wbSB0ZXN0IHx8IGVjaG8gZmFpbCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50cy5sZW5ndGgsIDMpO1xuXHRcdFx0c3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50cmFpbGluZ1NlcGFyYXRvciwgJyYmJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzFdLnRyYWlsaW5nU2VwYXJhdG9yLCAnfHwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNwbGl0IG9uIHNlcGFyYXRvcnMgaW5zaWRlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZChgZWNobyBcImE7YlwiIHwgd2MgLWxgKTtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlZD8uc2VnbWVudHMubGVuZ3RoLCAyKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLnRva2VucywgWydlY2hvJywgJ2E7YiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBsZWFkaW5nIGVudiBhc3NpZ25tZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZCgnQ0k9MSBOT0RFX0VOVj10ZXN0IG5wbSBpbnN0YWxsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS5lbnZQcmVmaXhlcywgWydDST0xJywgJ05PREVfRU5WPXRlc3QnXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnbnBtJywgJ2luc3RhbGwnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgc3VkbyB3cmFwcGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb21tYW5kKCdzdWRvIGFwdC1nZXQgaW5zdGFsbCAteSB2aW0nKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLndyYXBwZXJzLCBbJ3N1ZG8nXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnYXB0LWdldCcsICdpbnN0YWxsJywgJy15JywgJ3ZpbSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyB0aW1lIHdyYXBwZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ3RpbWUgY2FyZ28gYnVpbGQnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLndyYXBwZXJzLCBbJ3RpbWUnXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnY2FyZ28nLCAnYnVpbGQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgdGltZW91dCB3cmFwcGVyIHdpdGggbnVtZXJpYyBhcmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNvbW1hbmQoJ3RpbWVvdXQgMzAgbnBtIHRlc3QnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLndyYXBwZXJzLCBbJ3RpbWVvdXQnXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnbnBtJywgJ3Rlc3QnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgZW52IHdyYXBwZXIgd2l0aCBpbm5lciBlbnYgdmFycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZCgnZW52IC1pIFBBVEg9L3Vzci9iaW4gbWFrZSBhbGwnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLndyYXBwZXJzLCBbJ2VudiddKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLmVudlByZWZpeGVzLCBbJ1BBVEg9L3Vzci9iaW4nXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnbWFrZScsICdhbGwnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgY29tYmluZWQgZW52ICsgd3JhcHBlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ29tbWFuZCgnRk9PPWJhciBzdWRvIHRpbWUgZ2l0IGRpZmYnKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZWQ/LnNlZ21lbnRzWzBdLmVudlByZWZpeGVzLCBbJ0ZPTz1iYXInXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS53cmFwcGVycywgWydzdWRvJywgJ3RpbWUnXSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VkPy5zZWdtZW50c1swXS50b2tlbnMsIFsnZ2l0JywgJ2RpZmYnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZWdtZW50SGVhZCcsICgpID0+IHtcblx0XHR0ZXN0KCdoYW5kbGVzIHBsYWluIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWcgPSBwYXJzZUNvbW1hbmQoJ2dpdCBkaWZmIEhFQUR+MScpIS5zZWdtZW50c1swXTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzZWdtZW50SGVhZChzZWcpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIGxvbmcgZmxhZ3MgYmVmb3JlIHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWcgPSBwYXJzZUNvbW1hbmQoJ2dpdCAtLW5vLXBhZ2VyIGRpZmYgc3JjL2Zvby50cycpIS5zZWdtZW50c1swXTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzZWdtZW50SGVhZChzZWcpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHNraXAgc2hvcnQgZmxhZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWcgPSBwYXJzZUNvbW1hbmQoJ2dpdCAtQyAvdG1wL3JlcG8gZGlmZicpIS5zZWdtZW50c1swXTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzZWdtZW50SGVhZChzZWcpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICctQycgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUNvbW1hbmRIZWFkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3BhcnNlcyBzaW1wbGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IGRpZmYgSEVBRH41JyksIHsgaGVhZDogJ2dpdCcsIHN1YjogJ2RpZmYnIH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3VzZXMgZmlyc3Qgc2VnbWVudCBvZiBwaXBlbGluZScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKCdnaXQgZGlmZiB8IGNhdCcpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzdHJpcHMgZW52IC8gd3JhcHBlcnMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnQ0k9MSBzdWRvIHRpbWUgZ2l0IHN0YXR1cycpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdzdGF0dXMnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VnbWVudEhhc0ZsYWcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGV0ZWN0cyBidW5kbGVkIHNob3J0IGZsYWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VnID0gcGFyc2VDb21tYW5kKCdscyAtbGEnKSEuc2VnbWVudHNbMF07XG5cdFx0XHRvayhzZWdtZW50SGFzRmxhZyhzZWcsIFsnbCddKSk7XG5cdFx0XHRvayhzZWdtZW50SGFzRmxhZyhzZWcsIFsnYSddKSk7XG5cdFx0XHRvayghc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ3InXSkpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2RldGVjdHMgbG9uZyBmbGFncycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlZyA9IHBhcnNlQ29tbWFuZCgnZ2l0IC0tbm8tcGFnZXIgbG9nJykhLnNlZ21lbnRzWzBdO1xuXHRcdFx0b2soc2VnbWVudEhhc0ZsYWcoc2VnLCBbJ25vLXBhZ2VyJ10pKTtcblx0XHRcdG9rKCFzZWdtZW50SGFzRmxhZyhzZWcsIFsncGFnZXInXSkpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxjQUFjLGtCQUFrQixnQkFBZ0IsYUFBYSxnQkFBZ0I7QUFFdEYsTUFBTSx5QkFBeUIsTUFBTTtBQUNwQywwQ0FBd0M7QUFFeEMsUUFBTSxZQUFZLE1BQU07QUFDdkIsU0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxzQkFBZ0IsU0FBUyw0QkFBNEIsR0FBRyxDQUFDLE9BQU8sUUFBUSxVQUFVLFlBQVksQ0FBQztBQUFBLElBQ2hHLENBQUM7QUFDRCxTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLHNCQUFnQixTQUFTLG1CQUFtQixHQUFHLENBQUMsUUFBUSxTQUFTLE1BQU0sQ0FBQztBQUFBLElBQ3pFLENBQUM7QUFDRCxTQUFLLHVDQUF1QyxNQUFNO0FBQ2pELHNCQUFnQixTQUFTLG9CQUFvQixHQUFHLENBQUMsUUFBUSxTQUFTLENBQUM7QUFBQSxJQUNwRSxDQUFDO0FBQ0QsU0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxzQkFBZ0IsU0FBUyxtQkFBbUIsR0FBRyxD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
