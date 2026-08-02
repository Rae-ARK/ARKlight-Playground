import { ok, strictEqual } from "assert";
import { extractNodeCommand, NodeCommandLinePresenter } from "../../browser/tools/commandLinePresenter/nodeCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractNodeCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple node -e command with double quotes", () => {
      const result = extractNodeCommand(`node -e "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract nodejs -e command", () => {
      const result = extractNodeCommand(`nodejs -e "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract node --eval command", () => {
      const result = extractNodeCommand(`node --eval "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract nodejs --eval command", () => {
      const result = extractNodeCommand(`nodejs --eval "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should return undefined for non-node commands", () => {
      const result = extractNodeCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for node without -e flag", () => {
      const result = extractNodeCommand("node script.js", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract node -e with single quotes", () => {
      const result = extractNodeCommand(`node -e 'console.log("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
    test("should extract nodejs -e with single quotes", () => {
      const result = extractNodeCommand(`nodejs -e 'const x = 1; console.log(x)'`, "bash", OperatingSystem.Linux);
      strictEqual(result, "const x = 1; console.log(x)");
    });
    test("should extract node --eval with single quotes", () => {
      const result = extractNodeCommand(`node --eval 'console.log("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractNodeCommand('node -e "const x = \\"hello\\"; console.log(x)"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'const x = "hello"; console.log(x)');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractNodeCommand(`node -e 'console.log(\\"hello\\")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log(\\"hello\\")');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractNodeCommand(`node -e 'console.log("hello")'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log("hello")');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `node -e 'for (let i = 0; i < 3; i++) {
    console.log(i);
}'`;
      const result = extractNodeCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for (let i = 0; i < 3; i++) {
    console.log(i);
}`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractNodeCommand('node -e "console.log(`"hello`")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log("hello")');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractNodeCommand('node -e "const x = `"hello`"; console.log(x)"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'const x = "hello"; console.log(x)');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log(\\"hello\\")');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline JavaScript code", () => {
      const code = `node -e "for (let i = 0; i < 3; i++) {
    console.log(i);
}"`;
      const result = extractNodeCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for (let i = 0; i < 3; i++) {
    console.log(i);
}`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractNodeCommand('node -e "  console.log(1)  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "console.log(1)");
    });
    test("should return undefined for empty code", () => {
      const result = extractNodeCommand('node -e ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractNodeCommand('node -e "console.log(1)', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("NodeCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new NodeCommandLinePresenter();
  test("should return JavaScript presentation for node -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `node -e "console.log('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `console.log('hello')`);
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return JavaScript presentation for nodejs -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `nodejs -e 'const x = 1; console.log(x)'` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, "const x = 1; console.log(x)");
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return JavaScript presentation for node --eval command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `node --eval "console.log('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `console.log('hello')`);
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return undefined for non-node commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular node script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "node script.js" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'node -e "console.log(`"hello`")"' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'console.log("hello")');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvbm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXh0cmFjdE5vZGVDb21tYW5kLCBOb2RlQ29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lUHJlc2VudGVyL25vZGVDb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2V4dHJhY3ROb2RlQ29tbWFuZCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2Jhc2ljIGV4dHJhY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3Qgc2ltcGxlIG5vZGUgLWUgY29tbWFuZCB3aXRoIGRvdWJsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGUgLWUgXCJjb25zb2xlLmxvZygnaGVsbG8nKVwiYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBgY29uc29sZS5sb2coJ2hlbGxvJylgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG5vZGVqcyAtZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlanMgLWUgXCJjb25zb2xlLmxvZygnaGVsbG8nKVwiYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBgY29uc29sZS5sb2coJ2hlbGxvJylgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG5vZGUgLS1ldmFsIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGUgLS1ldmFsIFwiY29uc29sZS5sb2coJ2hlbGxvJylcImAsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlanMgLS1ldmFsIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGVqcyAtLWV2YWwgXCJjb25zb2xlLmxvZygnaGVsbG8nKVwiYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBgY29uc29sZS5sb2coJ2hlbGxvJylgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tbm9kZSBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnZWNobyBoZWxsbycsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub2RlIHdpdGhvdXQgLWUgZmxhZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSBzY3JpcHQuanMnLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlIC1lIHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChgbm9kZSAtZSAnY29uc29sZS5sb2coXCJoZWxsb1wiKSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlanMgLWUgd2l0aCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlanMgLWUgJ2NvbnN0IHggPSAxOyBjb25zb2xlLmxvZyh4KSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zdCB4ID0gMTsgY29uc29sZS5sb2coeCknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG5vZGUgLS1ldmFsIHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChgbm9kZSAtLWV2YWwgJ2NvbnNvbGUubG9nKFwiaGVsbG9cIiknYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncXVvdGUgdW5lc2NhcGluZyAtIEJhc2gnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHVuZXNjYXBlIGJhY2tzbGFzaC1lc2NhcGVkIHF1b3RlcyBpbiBiYXNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiY29uc29sZS5sb2coXFxcXFwiaGVsbG9cXFxcXCIpXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGVzY2FwZWQgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiY29uc3QgeCA9IFxcXFxcImhlbGxvXFxcXFwiOyBjb25zb2xlLmxvZyh4KVwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc3QgeCA9IFwiaGVsbG9cIjsgY29uc29sZS5sb2coeCknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NpbmdsZSBxdW90ZXMgLSBsaXRlcmFsIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGNvbnRlbnQgbGl0ZXJhbGx5IGluIHNpbmdsZSBxdW90ZXMgKG5vIHVuZXNjYXBpbmcpJywgKCkgPT4ge1xuXHRcdFx0Ly8gU2luZ2xlIHF1b3RlcyBpbiBiYXNoIGFyZSBsaXRlcmFsIC0gYmFja3NsYXNoZXMgYXJlIG5vdCBlc2NhcGUgc2VxdWVuY2VzXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGUgLWUgJ2NvbnNvbGUubG9nKFxcXFxcImhlbGxvXFxcXFwiKSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZyhcXFxcXCJoZWxsb1xcXFxcIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2luZ2xlIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlIC1lICdjb25zb2xlLmxvZyhcImhlbGxvXCIpJ2AsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgbXVsdGlsaW5lIGNvZGUgaW4gc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvZGUgPSBgbm9kZSAtZSAnZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcXG4gICAgY29uc29sZS5sb2coaSk7XFxufSdgO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGNvZGUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XFxuICAgIGNvbnNvbGUubG9nKGkpO1xcbn1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrdGljay1lc2NhcGVkIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiY29uc29sZS5sb2coYFwiaGVsbG9gXCIpXCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvbnNvbGUubG9nKFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgYmFja3RpY2stZXNjYXBlZCBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ25vZGUgLWUgXCJjb25zdCB4ID0gYFwiaGVsbG9gXCI7IGNvbnNvbGUubG9nKHgpXCInLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvbnN0IHggPSBcImhlbGxvXCI7IGNvbnNvbGUubG9nKHgpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHVuZXNjYXBlIGJhY2tzbGFzaCBxdW90ZXMgaW4gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSAtZSBcImNvbnNvbGUubG9nKFxcXFxcImhlbGxvXFxcXFwiKVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZyhcXFxcXCJoZWxsb1xcXFxcIiknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ211bHRpbGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBKYXZhU2NyaXB0IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlID0gYG5vZGUgLWUgXCJmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xcbiAgICBjb25zb2xlLmxvZyhpKTtcXG59XCJgO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGNvZGUsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XFxuICAgIGNvbnNvbGUubG9nKGkpO1xcbn1gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb2RlIHdpdGggdHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiICBjb25zb2xlLmxvZygxKSAgXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZygxKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIGVtcHR5IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ25vZGUgLWUgXCJcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gcXVvdGVzIGFyZSB1bm1hdGNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ25vZGUgLWUgXCJjb25zb2xlLmxvZygxKScsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ05vZGVDb21tYW5kTGluZVByZXNlbnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcHJlc2VudGVyID0gbmV3IE5vZGVDb21tYW5kTGluZVByZXNlbnRlcigpO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gSmF2YVNjcmlwdCBwcmVzZW50YXRpb24gZm9yIG5vZGUgLWUgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiBgbm9kZSAtZSBcImNvbnNvbGUubG9nKCdoZWxsbycpXCJgIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCBgY29uc29sZS5sb2coJ2hlbGxvJylgKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGFuZ3VhZ2UsICdqYXZhc2NyaXB0Jyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsICdOb2RlLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gSmF2YVNjcmlwdCBwcmVzZW50YXRpb24gZm9yIG5vZGVqcyAtZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6IGBub2RlanMgLWUgJ2NvbnN0IHggPSAxOyBjb25zb2xlLmxvZyh4KSdgIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCAnY29uc3QgeCA9IDE7IGNvbnNvbGUubG9nKHgpJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlLCAnamF2YXNjcmlwdCcpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lLCAnTm9kZS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIEphdmFTY3JpcHQgcHJlc2VudGF0aW9uIGZvciBub2RlIC0tZXZhbCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6IGBub2RlIC0tZXZhbCBcImNvbnNvbGUubG9nKCdoZWxsbycpXCJgIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCBgY29uc29sZS5sb2coJ2hlbGxvJylgKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGFuZ3VhZ2UsICdqYXZhc2NyaXB0Jyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsICdOb2RlLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tbm9kZSBjb21tYW5kcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAnZWNobyBoZWxsbycgfSxcblx0XHRcdHNoZWxsOiAnYmFzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0fSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgcmVndWxhciBub2RlIHNjcmlwdCBleGVjdXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ25vZGUgc2NyaXB0LmpzJyB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgUG93ZXJTaGVsbCBiYWNrdGljayBlc2NhcGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAnbm9kZSAtZSBcImNvbnNvbGUubG9nKGBcImhlbGxvYFwiKVwiJyB9LFxuXHRcdFx0c2hlbGw6ICdwd3NoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93c1xuXHRcdH0pO1xuXHRcdG9rKHJlc3VsdCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRMaW5lLCAnY29uc29sZS5sb2coXCJoZWxsb1wiKScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxJQUFJLG1CQUFtQjtBQUNoQyxTQUFTLG9CQUFvQixnQ0FBZ0M7QUFDN0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxzQkFBc0IsTUFBTTtBQUNqQywwQ0FBd0M7QUFFeEMsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFlBQU0sU0FBUyxtQkFBbUIsa0NBQWtDLFFBQVEsZ0JBQWdCLEtBQUs7QUFDakcsa0JBQVksUUFBUSxzQkFBc0I7QUFBQSxJQUMzQyxDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxZQUFNLFNBQVMsbUJBQW1CLG9DQUFvQyxRQUFRLGdCQUFnQixLQUFLO0FBQ25HLGtCQUFZLFFBQVEsc0JBQXNCO0FBQUEsSUFDM0MsQ0FBQztBQUVELFNBQUssc0NBQXNDLE1BQU07QUFDaEQsWUFBTSxTQUFTLG1CQUFtQixzQ0FBc0MsUUFBUSxnQkFBZ0IsS0FBSztBQUNyRyxrQkFBWSxRQUFRLHNCQUFzQjtBQUFBLElBQzNDLENBQUM7QUFFRCxTQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFlBQU0sU0FBUyxtQkFBbUIsd0NBQXdDLFFBQVEsZ0JBQWdCLEtBQUs7QUFDdkcsa0JBQVksUUFBUSxzQkFBc0I7QUFBQSxJQUMzQyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLFNBQVMsbUJBQW1CLGNBQWMsUUFBUSxnQkFBZ0IsS0FBSztBQUM3RSxrQkFBWSxRQUFRLE1BQVM7QUFBQSxJQUM5QixDQUFDO0FBRUQsU0FBSyxvREFBb0QsTUFBTTtBQUM5RCxZQUFNLFNBQVMsbUJBQW1CLGtCQUFrQixRQUFRLGdCQUFnQixLQUFLO0FBQ2pGLGtCQUFZLFFBQVEsTUFBUztBQUFBLElBQzlCLENBQUM7QUFFRCxTQUFLLDZDQUE2QyxN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
