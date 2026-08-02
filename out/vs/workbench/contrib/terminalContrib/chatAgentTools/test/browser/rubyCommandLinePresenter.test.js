import { ok, strictEqual } from "assert";
import { extractRubyCommand, RubyCommandLinePresenter } from "../../browser/tools/commandLinePresenter/rubyCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractRubyCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple ruby -e command with double quotes", () => {
      const result = extractRubyCommand(`ruby -e "puts 'hello'"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `puts 'hello'`);
    });
    test("should return undefined for non-ruby commands", () => {
      const result = extractRubyCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for ruby without -e flag", () => {
      const result = extractRubyCommand("ruby script.rb", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract ruby -e with single quotes", () => {
      const result = extractRubyCommand(`ruby -e 'puts "hello"'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts "hello"');
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractRubyCommand('ruby -e "puts \\"hello\\""', "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts "hello"');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractRubyCommand('ruby -e "x = \\"hello\\"; puts x"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'x = "hello"; puts x');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractRubyCommand(`ruby -e 'puts \\"hello\\"'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts \\"hello\\"');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractRubyCommand(`ruby -e 'puts "hello"'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts "hello"');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `ruby -e '3.times do |i|
  puts i
end'`;
      const result = extractRubyCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `3.times do |i|
  puts i
end`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractRubyCommand('ruby -e "puts `"hello`""', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts "hello"');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractRubyCommand('ruby -e "x = `"hello`"; puts x"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'x = "hello"; puts x');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractRubyCommand('ruby -e "puts \\"hello\\""', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts \\"hello\\"');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline Ruby code", () => {
      const code = `ruby -e "3.times do |i|
  puts i
end"`;
      const result = extractRubyCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `3.times do |i|
  puts i
end`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractRubyCommand('ruby -e "  puts 1  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "puts 1");
    });
    test("should return undefined for empty code", () => {
      const result = extractRubyCommand('ruby -e ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractRubyCommand('ruby -e "puts 1', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("RubyCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new RubyCommandLinePresenter();
  test("should return Ruby presentation for ruby -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `ruby -e "puts 'hello'"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `puts 'hello'`);
    strictEqual(result.language, "ruby");
    strictEqual(result.languageDisplayName, "Ruby");
  });
  test("should return undefined for non-ruby commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular ruby script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "ruby script.rb" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'ruby -e "puts `"hello`""' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'puts "hello"');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcnVieUNvbW1hbmRMaW5lUHJlc2VudGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXh0cmFjdFJ1YnlDb21tYW5kLCBSdWJ5Q29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lUHJlc2VudGVyL3J1YnlDb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2V4dHJhY3RSdWJ5Q29tbWFuZCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2Jhc2ljIGV4dHJhY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3Qgc2ltcGxlIHJ1YnkgLWUgY29tbWFuZCB3aXRoIGRvdWJsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoYHJ1YnkgLWUgXCJwdXRzICdoZWxsbydcImAsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYHB1dHMgJ2hlbGxvJ2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG5vbi1ydWJ5IGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdlY2hvIGhlbGxvJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHJ1Ynkgd2l0aG91dCAtZSBmbGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IHNjcmlwdC5yYicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHJ1YnkgLWUgd2l0aCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKGBydWJ5IC1lICdwdXRzIFwiaGVsbG9cIidgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwdXRzIFwiaGVsbG9cIicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncXVvdGUgdW5lc2NhcGluZyAtIEJhc2gnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHVuZXNjYXBlIGJhY2tzbGFzaC1lc2NhcGVkIHF1b3RlcyBpbiBiYXNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IC1lIFwicHV0cyBcXFxcXCJoZWxsb1xcXFxcIlwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyBcImhlbGxvXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgZXNjYXBlZCBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoJ3J1YnkgLWUgXCJ4ID0gXFxcXFwiaGVsbG9cXFxcXCI7IHB1dHMgeFwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAneCA9IFwiaGVsbG9cIjsgcHV0cyB4Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaW5nbGUgcXVvdGVzIC0gbGl0ZXJhbCBjb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb250ZW50IGxpdGVyYWxseSBpbiBzaW5nbGUgcXVvdGVzIChubyB1bmVzY2FwaW5nKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZChgcnVieSAtZSAncHV0cyBcXFxcXCJoZWxsb1xcXFxcIidgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwdXRzIFxcXFxcImhlbGxvXFxcXFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNpbmdsZSBxdW90ZXMgaW4gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZChgcnVieSAtZSAncHV0cyBcImhlbGxvXCInYCwgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwdXRzIFwiaGVsbG9cIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgbXVsdGlsaW5lIGNvZGUgaW4gc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvZGUgPSBgcnVieSAtZSAnMy50aW1lcyBkbyB8aXxcXG4gIHB1dHMgaVxcbmVuZCdgO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKGNvZGUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYDMudGltZXMgZG8gfGl8XFxuICBwdXRzIGlcXG5lbmRgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrdGljay1lc2NhcGVkIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IC1lIFwicHV0cyBgXCJoZWxsb2BcIlwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwdXRzIFwiaGVsbG9cIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSBiYWNrdGljay1lc2NhcGVkIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcInggPSBgXCJoZWxsb2BcIjsgcHV0cyB4XCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ggPSBcImhlbGxvXCI7IHB1dHMgeCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB1bmVzY2FwZSBiYWNrc2xhc2ggcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoJ3J1YnkgLWUgXCJwdXRzIFxcXFxcImhlbGxvXFxcXFwiXCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3B1dHMgXFxcXFwiaGVsbG9cXFxcXCInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ211bHRpbGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBSdWJ5IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlID0gYHJ1YnkgLWUgXCIzLnRpbWVzIGRvIHxpfFxcbiAgcHV0cyBpXFxuZW5kXCJgO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKGNvZGUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYDMudGltZXMgZG8gfGl8XFxuICBwdXRzIGlcXG5lbmRgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb2RlIHdpdGggdHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IC1lIFwiICBwdXRzIDEgIFwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyAxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgZW1wdHkgY29kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcIlwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBxdW90ZXMgYXJlIHVubWF0Y2hlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcInB1dHMgMScsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1J1YnlDb21tYW5kTGluZVByZXNlbnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcHJlc2VudGVyID0gbmV3IFJ1YnlDb21tYW5kTGluZVByZXNlbnRlcigpO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gUnVieSBwcmVzZW50YXRpb24gZm9yIHJ1YnkgLWUgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiBgcnVieSAtZSBcInB1dHMgJ2hlbGxvJ1wiYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgYHB1dHMgJ2hlbGxvJ2ApO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZSwgJ3J1YnknKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGFuZ3VhZ2VEaXNwbGF5TmFtZSwgJ1J1YnknKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG5vbi1ydWJ5IGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdlY2hvIGhlbGxvJyB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciByZWd1bGFyIHJ1Ynkgc2NyaXB0IGV4ZWN1dGlvbicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAncnVieSBzY3JpcHQucmInIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBQb3dlclNoZWxsIGJhY2t0aWNrIGVzY2FwaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdydWJ5IC1lIFwicHV0cyBgXCJoZWxsb2BcIlwiJyB9LFxuXHRcdFx0c2hlbGw6ICdwd3NoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93c1xuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCAncHV0cyBcImhlbGxvXCInKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsSUFBSSxtQkFBbUI7QUFDaEMsU0FBUyxvQkFBb0IsZ0NBQWdDO0FBQzdELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sc0JBQXNCLE1BQU07QUFDakMsMENBQXdDO0FBRXhDLFFBQU0sb0JBQW9CLE1BQU07QUFDL0IsU0FBSyw0REFBNEQsTUFBTTtBQUN0RSxZQUFNLFNBQVMsbUJBQW1CLDBCQUEwQixRQUFRLGdCQUFnQixLQUFLO0FBQ3pGLGtCQUFZLFFBQVEsY0FBYztBQUFBLElBQ25DLENBQUM7QUFFRCxTQUFLLGlEQUFpRCxNQUFNO0FBQzNELFlBQU0sU0FBUyxtQkFBbUIsY0FBYyxRQUFRLGdCQUFnQixLQUFLO0FBQzdFLGtCQUFZLFFBQVEsTUFBUztBQUFBLElBQzlCLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxNQUFNO0FBQzlELFlBQU0sU0FBUyxtQkFBbUIsa0JBQWtCLFFBQVEsZ0JBQWdCLEtBQUs7QUFDakYsa0JBQVksUUFBUSxNQUFTO0FBQUEsSUFDOUIsQ0FBQztBQUVELFNBQUssNkNBQTZDLE1BQU07QUFDdkQsWUFBTSxTQUFTLG1CQUFtQiwwQkFBMEIsUUFBUSxnQkFBZ0IsS0FBSztBQUN6RixrQkFBWSxRQUFRLGNBQWM7QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxTQUFLLG9EQUFvRCxNQUFNO0FBQzlELFlBQU0sU0FB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
