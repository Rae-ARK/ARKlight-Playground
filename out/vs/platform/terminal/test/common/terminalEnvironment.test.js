import { strictEqual } from "assert";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collapseTildePath, sanitizeCwd, escapeNonWindowsPath } from "../../common/terminalEnvironment.js";
import { PosixShellType, WindowsShellType, GeneralShellType } from "../../common/terminal.js";
suite("terminalEnvironment", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("collapseTildePath", () => {
    test("should return empty string for a falsy path", () => {
      strictEqual(collapseTildePath("", "/foo", "/"), "");
      strictEqual(collapseTildePath(void 0, "/foo", "/"), "");
    });
    test("should return path for a falsy user home", () => {
      strictEqual(collapseTildePath("/foo", "", "/"), "/foo");
      strictEqual(collapseTildePath("/foo", void 0, "/"), "/foo");
    });
    test("should not collapse when user home isn't present", () => {
      strictEqual(collapseTildePath("/foo", "/bar", "/"), "/foo");
      strictEqual(collapseTildePath("C:\\foo", "C:\\bar", "\\"), "C:\\foo");
    });
    test("should collapse with Windows separators", () => {
      strictEqual(collapseTildePath("C:\\foo\\bar", "C:\\foo", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar", "C:\\foo\\", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "C:\\foo\\", "\\"), "~\\bar\\baz");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "C:\\foo", "\\"), "~\\bar\\baz");
    });
    test("should collapse mixed case with Windows separators", () => {
      strictEqual(collapseTildePath("c:\\foo\\bar", "C:\\foo", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "c:\\foo", "\\"), "~\\bar\\baz");
    });
    test("should collapse with Posix separators", () => {
      strictEqual(collapseTildePath("/foo/bar", "/foo", "/"), "~/bar");
      strictEqual(collapseTildePath("/foo/bar", "/foo/", "/"), "~/bar");
      strictEqual(collapseTildePath("/foo/bar/baz", "/foo", "/"), "~/bar/baz");
      strictEqual(collapseTildePath("/foo/bar/baz", "/foo/", "/"), "~/bar/baz");
    });
  });
  suite("sanitizeCwd", () => {
    if (OS === OperatingSystem.Windows) {
      test("should make the Windows drive letter uppercase", () => {
        strictEqual(sanitizeCwd("c:\\foo\\bar"), "C:\\foo\\bar");
      });
    }
    test("should remove any wrapping quotes", () => {
      strictEqual(sanitizeCwd("'/foo/bar'"), "/foo/bar");
      strictEqual(sanitizeCwd('"/foo/bar"'), "/foo/bar");
    });
  });
  suite("escapeNonWindowsPath", () => {
    test("should escape for bash/sh/zsh shells", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Bash), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Bash), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Bash), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, PosixShellType.Bash), `$'/foo/bar\\'baz"qux'`);
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Sh), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Sh), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Zsh), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Zsh), "'/foo/bar\\'baz'");
    });
    test("should escape for git bash", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", WindowsShellType.GitBash), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", WindowsShellType.GitBash), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', WindowsShellType.GitBash), `'/foo/bar"baz'`);
    });
    test("should escape for fish shell", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Fish), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Fish), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Fish), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, PosixShellType.Fish), `"/foo/bar'baz\\"qux"`);
    });
    test("should escape for PowerShell", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", GeneralShellType.PowerShell), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", GeneralShellType.PowerShell), "'/foo/bar''baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', GeneralShellType.PowerShell), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, GeneralShellType.PowerShell), '"/foo/bar\'baz`"qux"');
    });
    test("should default to POSIX escaping for unknown shells", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar"), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz"), "'/foo/bar\\'baz'");
    });
    test("should remove dangerous characters", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar$(echo evil)", PosixShellType.Bash), "'/foo/bar(echo evil)'");
      strictEqual(escapeNonWindowsPath("/foo/bar`whoami`", PosixShellType.Bash), "'/foo/barwhoami'");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNvbGxhcHNlVGlsZGVQYXRoLCBzYW5pdGl6ZUN3ZCwgZXNjYXBlTm9uV2luZG93c1BhdGggfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBQb3NpeFNoZWxsVHlwZSwgV2luZG93c1NoZWxsVHlwZSwgR2VuZXJhbFNoZWxsVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbnN1aXRlKCd0ZXJtaW5hbEVudmlyb25tZW50JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnY29sbGFwc2VUaWxkZVBhdGgnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBlbXB0eSBzdHJpbmcgZm9yIGEgZmFsc3kgcGF0aCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcnLCAnL2ZvbycsICcvJyksICcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKHVuZGVmaW5lZCwgJy9mb28nLCAnLycpLCAnJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBwYXRoIGZvciBhIGZhbHN5IHVzZXIgaG9tZScsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vJywgJycsICcvJyksICcvZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnL2ZvbycsIHVuZGVmaW5lZCwgJy8nKSwgJy9mb28nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgbm90IGNvbGxhcHNlIHdoZW4gdXNlciBob21lIGlzblxcJ3QgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vJywgJy9iYXInLCAnLycpLCAnL2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJ0M6XFxcXGZvbycsICdDOlxcXFxiYXInLCAnXFxcXCcpLCAnQzpcXFxcZm9vJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIHdpdGggV2luZG93cyBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJ0M6XFxcXGZvb1xcXFxiYXInLCAnQzpcXFxcZm9vJywgJ1xcXFwnKSwgJ35cXFxcYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnQzpcXFxcZm9vXFxcXGJhcicsICdDOlxcXFxmb29cXFxcJywgJ1xcXFwnKSwgJ35cXFxcYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnQzpcXFxcZm9vXFxcXGJhclxcXFxiYXonLCAnQzpcXFxcZm9vXFxcXCcsICdcXFxcJyksICd+XFxcXGJhclxcXFxiYXonKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCdDOlxcXFxmb29cXFxcYmFyXFxcXGJheicsICdDOlxcXFxmb28nLCAnXFxcXCcpLCAnflxcXFxiYXJcXFxcYmF6Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIG1peGVkIGNhc2Ugd2l0aCBXaW5kb3dzIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnYzpcXFxcZm9vXFxcXGJhcicsICdDOlxcXFxmb28nLCAnXFxcXCcpLCAnflxcXFxiYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCdDOlxcXFxmb29cXFxcYmFyXFxcXGJheicsICdjOlxcXFxmb28nLCAnXFxcXCcpLCAnflxcXFxiYXJcXFxcYmF6Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIHdpdGggUG9zaXggc2VwYXJhdG9ycycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vL2JhcicsICcvZm9vJywgJy8nKSwgJ34vYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnL2Zvby9iYXInLCAnL2Zvby8nLCAnLycpLCAnfi9iYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vL2Jhci9iYXonLCAnL2ZvbycsICcvJyksICd+L2Jhci9iYXonKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vL2Jhci9iYXonLCAnL2Zvby8nLCAnLycpLCAnfi9iYXIvYmF6Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnc2FuaXRpemVDd2QnLCAoKSA9PiB7XG5cdFx0aWYgKE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0dGVzdCgnc2hvdWxkIG1ha2UgdGhlIFdpbmRvd3MgZHJpdmUgbGV0dGVyIHVwcGVyY2FzZScsICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoc2FuaXRpemVDd2QoJ2M6XFxcXGZvb1xcXFxiYXInKSwgJ0M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR0ZXN0KCdzaG91bGQgcmVtb3ZlIGFueSB3cmFwcGluZyBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzYW5pdGl6ZUN3ZCgnXFwnL2Zvby9iYXJcXCcnKSwgJy9mb28vYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChzYW5pdGl6ZUN3ZCgnXCIvZm9vL2JhclwiJyksICcvZm9vL2JhcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXNjYXBlTm9uV2luZG93c1BhdGgnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGVzY2FwZSBmb3IgYmFzaC9zaC96c2ggc2hlbGxzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyJywgUG9zaXhTaGVsbFR5cGUuQmFzaCksICdcXCcvZm9vL2JhclxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6JywgUG9zaXhTaGVsbFR5cGUuQmFzaCksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclwiYmF6JywgUG9zaXhTaGVsbFR5cGUuQmFzaCksICdcXCcvZm9vL2JhclwiYmF6XFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXpcInF1eCcsIFBvc2l4U2hlbGxUeXBlLkJhc2gpLCAnJFxcJy9mb28vYmFyXFxcXFxcJ2JhelwicXV4XFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBQb3NpeFNoZWxsVHlwZS5TaCksICdcXCcvZm9vL2JhclxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6JywgUG9zaXhTaGVsbFR5cGUuU2gpLCAnXFwnL2Zvby9iYXJcXFxcXFwnYmF6XFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBQb3NpeFNoZWxsVHlwZS5ac2gpLCAnXFwnL2Zvby9iYXJcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JheicsIFBvc2l4U2hlbGxUeXBlLlpzaCksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlc2NhcGUgZm9yIGdpdCBiYXNoJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyJywgV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpLCAnXFwnL2Zvby9iYXJcXFxcXFwnYmF6XFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcImJheicsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCksICdcXCcvZm9vL2JhclwiYmF6XFwnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXNjYXBlIGZvciBmaXNoIHNoZWxsJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyJywgUG9zaXhTaGVsbFR5cGUuRmlzaCksICdcXCcvZm9vL2JhclxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6JywgUG9zaXhTaGVsbFR5cGUuRmlzaCksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclwiYmF6JywgUG9zaXhTaGVsbFR5cGUuRmlzaCksICdcXCcvZm9vL2JhclwiYmF6XFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXpcInF1eCcsIFBvc2l4U2hlbGxUeXBlLkZpc2gpLCAnXCIvZm9vL2JhclxcJ2JhelxcXFxcInF1eFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXNjYXBlIGZvciBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyJywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpLCAnXFwnL2Zvby9iYXJcXCdcXCdiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclwiYmF6JywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsKSwgJ1xcJy9mb28vYmFyXCJiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JhelwicXV4JywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsKSwgJ1wiL2Zvby9iYXJcXCdiYXpgXCJxdXhcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlZmF1bHQgdG8gUE9TSVggZXNjYXBpbmcgZm9yIHVua25vd24gc2hlbGxzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyJyksICdcXCcvZm9vL2JhclxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6JyksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZW1vdmUgZGFuZ2Vyb3VzIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXIkKGVjaG8gZXZpbCknLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSwgJ1xcJy9mb28vYmFyKGVjaG8gZXZpbClcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhcmB3aG9hbWlgJywgUG9zaXhTaGVsbFR5cGUuQmFzaCksICdcXCcvZm9vL2Jhcndob2FtaVxcJycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsVUFBVTtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQixhQUFhLDRCQUE0QjtBQUNyRSxTQUFTLGdCQUFnQixr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
