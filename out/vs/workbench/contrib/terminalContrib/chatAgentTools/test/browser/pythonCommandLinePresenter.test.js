import { ok, strictEqual } from "assert";
import { extractPythonCommand, PythonCommandLinePresenter } from "../../browser/tools/commandLinePresenter/pythonCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractPythonCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple python -c command with double quotes", () => {
      const result = extractPythonCommand(`python -c "print('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `print('hello')`);
    });
    test("should extract python3 -c command", () => {
      const result = extractPythonCommand(`python3 -c "print('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `print('hello')`);
    });
    test("should return undefined for non-python commands", () => {
      const result = extractPythonCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for python without -c flag", () => {
      const result = extractPythonCommand("python script.py", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract python -c with single quotes", () => {
      const result = extractPythonCommand(`python -c 'print("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'print("hello")');
    });
    test("should extract python3 -c with single quotes", () => {
      const result = extractPythonCommand(`python3 -c 'x = 1; print(x)'`, "bash", OperatingSystem.Linux);
      strictEqual(result, "x = 1; print(x)");
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractPythonCommand('python -c "print(\\"hello\\")"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'print("hello")');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractPythonCommand('python -c "x = \\"hello\\"; print(x)"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'x = "hello"; print(x)');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractPythonCommand(`python -c 'print(\\"hello\\")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'print(\\"hello\\")');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractPythonCommand(`python -c 'print("hello")'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print("hello")');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `python -c 'for i in range(3):
    print(i)'`;
      const result = extractPythonCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for i in range(3):
    print(i)`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractPythonCommand('python -c "print(`"hello`")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print("hello")');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractPythonCommand('python -c "x = `"hello`"; print(x)"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'x = "hello"; print(x)');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractPythonCommand('python -c "print(\\"hello\\")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print(\\"hello\\")');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline python code", () => {
      const code = `python -c "for i in range(3):
    print(i)"`;
      const result = extractPythonCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for i in range(3):
    print(i)`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractPythonCommand('python -c "  print(1)  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "print(1)");
    });
    test("should return undefined for empty code", () => {
      const result = extractPythonCommand('python -c ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractPythonCommand('python -c "print(1)', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("PythonCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new PythonCommandLinePresenter();
  test("should return Python presentation for python -c command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `python -c "print('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `print('hello')`);
    strictEqual(result.language, "python");
    strictEqual(result.languageDisplayName, "Python");
  });
  test("should return Python presentation for python3 -c command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `python3 -c 'x = 1; print(x)'` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, "x = 1; print(x)");
    strictEqual(result.language, "python");
    strictEqual(result.languageDisplayName, "Python");
  });
  test("should return undefined for non-python commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular python script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "python script.py" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'python -c "print(`"hello`")"' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'print("hello")');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleHRyYWN0UHl0aG9uQ29tbWFuZCwgUHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lUHJlc2VudGVyL3B5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnZXh0cmFjdFB5dGhvbkNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdiYXNpYyBleHRyYWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHNpbXBsZSBweXRob24gLWMgY29tbWFuZCB3aXRoIGRvdWJsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwicHJpbnQoXFwnaGVsbG9cXCcpXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBwcmludCgnaGVsbG8nKWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgcHl0aG9uMyAtYyBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbjMgLWMgXCJwcmludChcXCdoZWxsb1xcJylcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYHByaW50KCdoZWxsbycpYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igbm9uLXB5dGhvbiBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdlY2hvIGhlbGxvJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHB5dGhvbiB3aXRob3V0IC1jIGZsYWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIHNjcmlwdC5weScsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHB5dGhvbiAtYyB3aXRoIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZChgcHl0aG9uIC1jICdwcmludChcImhlbGxvXCIpJ2AsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHB5dGhvbjMgLWMgd2l0aCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoYHB5dGhvbjMgLWMgJ3ggPSAxOyBwcmludCh4KSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICd4ID0gMTsgcHJpbnQoeCknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBCYXNoJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrc2xhc2gtZXNjYXBlZCBxdW90ZXMgaW4gYmFzaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdweXRob24gLWMgXCJwcmludChcXFxcXCJoZWxsb1xcXFxcIilcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgZXNjYXBlZCBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwieCA9IFxcXFxcXFwiaGVsbG9cXFxcXFxcIjsgcHJpbnQoeClcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ggPSBcImhlbGxvXCI7IHByaW50KHgpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaW5nbGUgcXVvdGVzIC0gbGl0ZXJhbCBjb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb250ZW50IGxpdGVyYWxseSBpbiBzaW5nbGUgcXVvdGVzIChubyB1bmVzY2FwaW5nKScsICgpID0+IHtcblx0XHRcdC8vIFNpbmdsZSBxdW90ZXMgaW4gYmFzaCBhcmUgbGl0ZXJhbCAtIGJhY2tzbGFzaGVzIGFyZSBub3QgZXNjYXBlIHNlcXVlbmNlc1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoYHB5dGhvbiAtYyAncHJpbnQoXFxcXFwiaGVsbG9cXFxcXCIpJ2AsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFxcXFxcImhlbGxvXFxcXFwiKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzaW5nbGUgcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZChgcHl0aG9uIC1jICdwcmludChcImhlbGxvXCIpJ2AsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHJpbnQoXCJoZWxsb1wiKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgbXVsdGlsaW5lIGNvZGUgaW4gc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvZGUgPSBgcHl0aG9uIC1jICdmb3IgaSBpbiByYW5nZSgzKTpcXG4gICAgcHJpbnQoaSknYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKGNvZGUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGZvciBpIGluIHJhbmdlKDMpOlxcbiAgICBwcmludChpKWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncXVvdGUgdW5lc2NhcGluZyAtIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHVuZXNjYXBlIGJhY2t0aWNrLWVzY2FwZWQgcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwicHJpbnQoYFwiaGVsbG9gXCIpXCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgYmFja3RpY2stZXNjYXBlZCBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwieCA9IGBcImhlbGxvYFwiOyBwcmludCh4KVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICd4ID0gXCJoZWxsb1wiOyBwcmludCh4KScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB1bmVzY2FwZSBiYWNrc2xhc2ggcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwicHJpbnQoXFxcXFwiaGVsbG9cXFxcXCIpXCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFxcXFxcImhlbGxvXFxcXFwiKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbXVsdGlsaW5lIGNvZGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgbXVsdGlsaW5lIHB5dGhvbiBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29kZSA9IGBweXRob24gLWMgXCJmb3IgaSBpbiByYW5nZSgzKTpcXG4gICAgcHJpbnQoaSlcImA7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBmb3IgaSBpbiByYW5nZSgzKTpcXG4gICAgcHJpbnQoaSlgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb2RlIHdpdGggdHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcIiAgcHJpbnQoMSkgIFwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHJpbnQoMSknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBlbXB0eSBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcIlwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBxdW90ZXMgYXJlIHVubWF0Y2hlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdweXRob24gLWMgXCJwcmludCgxKScsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1B5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBwcmVzZW50ZXIgPSBuZXcgUHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIoKTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIFB5dGhvbiBwcmVzZW50YXRpb24gZm9yIHB5dGhvbiAtYyBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6IGBweXRob24gLWMgXCJwcmludCgnaGVsbG8nKVwiYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgYHByaW50KCdoZWxsbycpYCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlLCAncHl0aG9uJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsICdQeXRob24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBQeXRob24gcHJlc2VudGF0aW9uIGZvciBweXRob24zIC1jIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogYHB5dGhvbjMgLWMgJ3ggPSAxOyBwcmludCh4KSdgIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCAneCA9IDE7IHByaW50KHgpJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlLCAncHl0aG9uJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsICdQeXRob24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG5vbi1weXRob24gY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ2VjaG8gaGVsbG8nIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHJlZ3VsYXIgcHl0aG9uIHNjcmlwdCBleGVjdXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ3B5dGhvbiBzY3JpcHQucHknIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBQb3dlclNoZWxsIGJhY2t0aWNrIGVzY2FwaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdweXRob24gLWMgXCJwcmludChgXCJoZWxsb2BcIilcIicgfSxcblx0XHRcdHNoZWxsOiAncHdzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgJ3ByaW50KFwiaGVsbG9cIiknKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsSUFBSSxtQkFBbUI7QUFDaEMsU0FBUyxzQkFBc0Isa0NBQWtDO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBRXhDLFFBQU0sb0JBQW9CLE1BQU07QUFDL0IsU0FBSyw4REFBOEQsTUFBTTtBQUN4RSxZQUFNLFNBQVMscUJBQXFCLDhCQUFnQyxRQUFRLGdCQUFnQixLQUFLO0FBQ2pHLGtCQUFZLFFBQVEsZ0JBQWdCO0FBQUEsSUFDckMsQ0FBQztBQUVELFNBQUsscUNBQXFDLE1BQU07QUFDL0MsWUFBTSxTQUFTLHFCQUFxQiwrQkFBaUMsUUFBUSxnQkFBZ0IsS0FBSztBQUNsRyxrQkFBWSxRQUFRLGdCQUFnQjtBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLG1EQUFtRCxNQUFNO0FBQzdELFlBQU0sU0FBUyxxQkFB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
