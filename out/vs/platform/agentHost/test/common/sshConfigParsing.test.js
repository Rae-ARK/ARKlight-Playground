import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseSSHConfigHostEntries, parseSSHGOutput } from "../../common/sshConfigParsing.js";
suite("SSH Config Parsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseSSHConfigHostEntries", () => {
    test("extracts simple host entries", () => {
      const config = [
        "Host myserver",
        "	HostName 10.0.0.1",
        "	User admin"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("extracts multiple hosts from a single Host line", () => {
      const config = "Host server1 server2 server3";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["server1", "server2", "server3"]);
    });
    test("extracts hosts from multiple Host directives", () => {
      const config = [
        "Host work",
        "	HostName work.example.com",
        "",
        "Host personal",
        "	HostName home.example.com"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["work", "personal"]);
    });
    test("skips wildcard hosts", () => {
      const config = [
        "Host *",
        "	ForwardAgent yes",
        "",
        "Host myserver",
        "	HostName 10.0.0.1",
        "",
        "Host *.example.com",
        "	User admin"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips negation patterns", () => {
      const config = "Host !internal myserver";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips question mark wildcards", () => {
      const config = "Host server? myserver";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("skips comment lines", () => {
      const config = [
        "# This is a comment",
        "Host myserver",
        "	# Another comment",
        "	HostName 10.0.0.1"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("strips inline comments from Host values", () => {
      const config = "Host myserver # my favorite server";
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
    test("handles empty content", () => {
      assert.deepStrictEqual(parseSSHConfigHostEntries(""), []);
    });
    test("handles content with only comments and blanks", () => {
      const config = [
        "# comment",
        "",
        "  # indented comment",
        ""
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), []);
    });
    test("is case-insensitive for Host keyword", () => {
      const config = [
        "host lower",
        "HOST upper",
        "Host mixed"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["lower", "upper", "mixed"]);
    });
    test("ignores non-Host directives", () => {
      const config = [
        "Host myserver",
        "	HostName 10.0.0.1",
        "	User admin",
        "	Port 2222",
        "	IdentityFile ~/.ssh/mykey",
        "	ForwardAgent yes"
      ].join("\n");
      assert.deepStrictEqual(parseSSHConfigHostEntries(config), ["myserver"]);
    });
  });
  suite("parseSSHGOutput", () => {
    test("parses standard ssh -G output", () => {
      const output = [
        "hostname 10.0.0.1",
        "user admin",
        "port 22",
        "identityfile ~/.ssh/id_rsa",
        "identityfile ~/.ssh/id_ed25519",
        "forwardagent no"
      ].join("\n");
      assert.deepStrictEqual(parseSSHGOutput(output), {
        hostname: "10.0.0.1",
        user: "admin",
        port: 22,
        identityFile: ["~/.ssh/id_rsa", "~/.ssh/id_ed25519"],
        identityAgent: void 0,
        forwardAgent: false
      });
    });
    test("parses forwardagent yes", () => {
      const output = [
        "hostname example.com",
        "user root",
        "port 22",
        "forwardagent yes"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.forwardAgent, true);
    });
    test("parses identityagent", () => {
      const output = [
        "hostname example.com",
        "user admin",
        "identityagent //./pipe/pageant.user.1234"
      ].join("\n");
      assert.strictEqual(parseSSHGOutput(output).identityAgent, "//./pipe/pageant.user.1234");
    });
    test("parses non-standard port", () => {
      const output = [
        "hostname example.com",
        "user deploy",
        "port 2222"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.port, 2222);
    });
    test("handles missing user", () => {
      const output = [
        "hostname example.com",
        "port 22"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.user, void 0);
    });
    test("handles empty user", () => {
      const output = [
        "hostname example.com",
        "user ",
        "port 22"
      ].join("\n");
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.user, void 0);
    });
    test("defaults port to 22 when missing", () => {
      const output = "hostname example.com\nuser root";
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.port, 22);
    });
    test("collects multiple identity files", () => {
      const output = [
        "hostname example.com",
        "port 22",
        "identityfile ~/.ssh/id_rsa",
        "identityfile ~/.ssh/work_key",
        "identityfile ~/.ssh/id_ed25519"
      ].join("\n");
      assert.deepStrictEqual(parseSSHGOutput(output).identityFile, [
        "~/.ssh/id_rsa",
        "~/.ssh/work_key",
        "~/.ssh/id_ed25519"
      ]);
    });
    test("handles empty output", () => {
      assert.deepStrictEqual(parseSSHGOutput(""), {
        hostname: "",
        user: void 0,
        port: 22,
        identityFile: [],
        identityAgent: void 0,
        forwardAgent: false
      });
    });
    test("handles values with spaces", () => {
      const output = "hostname my host with spaces\nport 22";
      const result = parseSSHGOutput(output);
      assert.strictEqual(result.hostname, "my host with spaces");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9zc2hDb25maWdQYXJzaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMsIHBhcnNlU1NIR091dHB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zc2hDb25maWdQYXJzaW5nLmpzJztcblxuc3VpdGUoJ1NTSCBDb25maWcgUGFyc2luZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2VTU0hDb25maWdIb3N0RW50cmllcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIHNpbXBsZSBob3N0IGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBbXG5cdFx0XHRcdCdIb3N0IG15c2VydmVyJyxcblx0XHRcdFx0J1x0SG9zdE5hbWUgMTAuMC4wLjEnLFxuXHRcdFx0XHQnXHRVc2VyIGFkbWluJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ215c2VydmVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgbXVsdGlwbGUgaG9zdHMgZnJvbSBhIHNpbmdsZSBIb3N0IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSAnSG9zdCBzZXJ2ZXIxIHNlcnZlcjIgc2VydmVyMyc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgWydzZXJ2ZXIxJywgJ3NlcnZlcjInLCAnc2VydmVyMyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGhvc3RzIGZyb20gbXVsdGlwbGUgSG9zdCBkaXJlY3RpdmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnSG9zdCB3b3JrJyxcblx0XHRcdFx0J1x0SG9zdE5hbWUgd29yay5leGFtcGxlLmNvbScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnSG9zdCBwZXJzb25hbCcsXG5cdFx0XHRcdCdcdEhvc3ROYW1lIGhvbWUuZXhhbXBsZS5jb20nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnd29yaycsICdwZXJzb25hbCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIHdpbGRjYXJkIGhvc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnSG9zdCAqJyxcblx0XHRcdFx0J1x0Rm9yd2FyZEFnZW50IHllcycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnSG9zdCBteXNlcnZlcicsXG5cdFx0XHRcdCdcdEhvc3ROYW1lIDEwLjAuMC4xJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdIb3N0ICouZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnXHRVc2VyIGFkbWluJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ215c2VydmVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgbmVnYXRpb24gcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSAnSG9zdCAhaW50ZXJuYWwgbXlzZXJ2ZXInO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBxdWVzdGlvbiBtYXJrIHdpbGRjYXJkcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9ICdIb3N0IHNlcnZlcj8gbXlzZXJ2ZXInO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFsnbXlzZXJ2ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBjb21tZW50IGxpbmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnIyBUaGlzIGlzIGEgY29tbWVudCcsXG5cdFx0XHRcdCdIb3N0IG15c2VydmVyJyxcblx0XHRcdFx0J1x0IyBBbm90aGVyIGNvbW1lbnQnLFxuXHRcdFx0XHQnXHRIb3N0TmFtZSAxMC4wLjAuMScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIQ29uZmlnSG9zdEVudHJpZXMoY29uZmlnKSwgWydteXNlcnZlciddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBpbmxpbmUgY29tbWVudHMgZnJvbSBIb3N0IHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9ICdIb3N0IG15c2VydmVyICMgbXkgZmF2b3JpdGUgc2VydmVyJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ215c2VydmVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKCcnKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb250ZW50IHdpdGggb25seSBjb21tZW50cyBhbmQgYmxhbmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnIyBjb21tZW50Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICMgaW5kZW50ZWQgY29tbWVudCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSENvbmZpZ0hvc3RFbnRyaWVzKGNvbmZpZyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIGNhc2UtaW5zZW5zaXRpdmUgZm9yIEhvc3Qga2V5d29yZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IFtcblx0XHRcdFx0J2hvc3QgbG93ZXInLFxuXHRcdFx0XHQnSE9TVCB1cHBlcicsXG5cdFx0XHRcdCdIb3N0IG1peGVkJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ2xvd2VyJywgJ3VwcGVyJywgJ21peGVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBub24tSG9zdCBkaXJlY3RpdmVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gW1xuXHRcdFx0XHQnSG9zdCBteXNlcnZlcicsXG5cdFx0XHRcdCdcdEhvc3ROYW1lIDEwLjAuMC4xJyxcblx0XHRcdFx0J1x0VXNlciBhZG1pbicsXG5cdFx0XHRcdCdcdFBvcnQgMjIyMicsXG5cdFx0XHRcdCdcdElkZW50aXR5RmlsZSB+Ly5zc2gvbXlrZXknLFxuXHRcdFx0XHQnXHRGb3J3YXJkQWdlbnQgeWVzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VTU0hDb25maWdIb3N0RW50cmllcyhjb25maWcpLCBbJ215c2VydmVyJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VTU0hHT3V0cHV0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncGFyc2VzIHN0YW5kYXJkIHNzaCAtRyBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSAxMC4wLjAuMScsXG5cdFx0XHRcdCd1c2VyIGFkbWluJyxcblx0XHRcdFx0J3BvcnQgMjInLFxuXHRcdFx0XHQnaWRlbnRpdHlmaWxlIH4vLnNzaC9pZF9yc2EnLFxuXHRcdFx0XHQnaWRlbnRpdHlmaWxlIH4vLnNzaC9pZF9lZDI1NTE5Jyxcblx0XHRcdFx0J2ZvcndhcmRhZ2VudCBubycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIR091dHB1dChvdXRwdXQpLCB7XG5cdFx0XHRcdGhvc3RuYW1lOiAnMTAuMC4wLjEnLFxuXHRcdFx0XHR1c2VyOiAnYWRtaW4nLFxuXHRcdFx0XHRwb3J0OiAyMixcblx0XHRcdFx0aWRlbnRpdHlGaWxlOiBbJ34vLnNzaC9pZF9yc2EnLCAnfi8uc3NoL2lkX2VkMjU1MTknXSxcblx0XHRcdFx0aWRlbnRpdHlBZ2VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmb3J3YXJkQWdlbnQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgZm9yd2FyZGFnZW50IHllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J2hvc3RuYW1lIGV4YW1wbGUuY29tJyxcblx0XHRcdFx0J3VzZXIgcm9vdCcsXG5cdFx0XHRcdCdwb3J0IDIyJyxcblx0XHRcdFx0J2ZvcndhcmRhZ2VudCB5ZXMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTU0hHT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmZvcndhcmRBZ2VudCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgaWRlbnRpdHlhZ2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J2hvc3RuYW1lIGV4YW1wbGUuY29tJyxcblx0XHRcdFx0J3VzZXIgYWRtaW4nLFxuXHRcdFx0XHQnaWRlbnRpdHlhZ2VudCAvLy4vcGlwZS9wYWdlYW50LnVzZXIuMTIzNCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTU0hHT3V0cHV0KG91dHB1dCkuaWRlbnRpdHlBZ2VudCwgJy8vLi9waXBlL3BhZ2VhbnQudXNlci4xMjM0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgbm9uLXN0YW5kYXJkIHBvcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSBleGFtcGxlLmNvbScsXG5cdFx0XHRcdCd1c2VyIGRlcGxveScsXG5cdFx0XHRcdCdwb3J0IDIyMjInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTU0hHT3V0cHV0KG91dHB1dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnBvcnQsIDIyMjIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtaXNzaW5nIHVzZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCdob3N0bmFtZSBleGFtcGxlLmNvbScsXG5cdFx0XHRcdCdwb3J0IDIyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU1NIR091dHB1dChvdXRwdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51c2VyLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSB1c2VyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQnaG9zdG5hbWUgZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQndXNlciAnLFxuXHRcdFx0XHQncG9ydCAyMicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVNTSEdPdXRwdXQob3V0cHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXNlciwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIHBvcnQgdG8gMjIgd2hlbiBtaXNzaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gJ2hvc3RuYW1lIGV4YW1wbGUuY29tXFxudXNlciByb290Jztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU1NIR091dHB1dChvdXRwdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wb3J0LCAyMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2xsZWN0cyBtdWx0aXBsZSBpZGVudGl0eSBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J2hvc3RuYW1lIGV4YW1wbGUuY29tJyxcblx0XHRcdFx0J3BvcnQgMjInLFxuXHRcdFx0XHQnaWRlbnRpdHlmaWxlIH4vLnNzaC9pZF9yc2EnLFxuXHRcdFx0XHQnaWRlbnRpdHlmaWxlIH4vLnNzaC93b3JrX2tleScsXG5cdFx0XHRcdCdpZGVudGl0eWZpbGUgfi8uc3NoL2lkX2VkMjU1MTknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNTSEdPdXRwdXQob3V0cHV0KS5pZGVudGl0eUZpbGUsIFtcblx0XHRcdFx0J34vLnNzaC9pZF9yc2EnLFxuXHRcdFx0XHQnfi8uc3NoL3dvcmtfa2V5Jyxcblx0XHRcdFx0J34vLnNzaC9pZF9lZDI1NTE5Jyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU1NIR091dHB1dCgnJyksIHtcblx0XHRcdFx0aG9zdG5hbWU6ICcnLFxuXHRcdFx0XHR1c2VyOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBvcnQ6IDIyLFxuXHRcdFx0XHRpZGVudGl0eUZpbGU6IFtdLFxuXHRcdFx0XHRpZGVudGl0eUFnZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdGZvcndhcmRBZ2VudDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgdmFsdWVzIHdpdGggc3BhY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gJ2hvc3RuYW1lIG15IGhvc3Qgd2l0aCBzcGFjZXNcXG5wb3J0IDIyJztcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlU1NIR091dHB1dChvdXRwdXQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob3N0bmFtZSwgJ215IGhvc3Qgd2l0aCBzcGFjZXMnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQix1QkFBdUI7QUFFM0QsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsUUFBTSw2QkFBNkIsTUFBTTtBQUV4QyxTQUFLLGdDQUFnQyxNQUFNO0FBQzFDLFlBQU0sU0FBUztBQUFBLFFBQ2Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxhQUFPLGdCQUFnQiwwQkFBMEIsTUFBTSxHQUFHLENBQUMsVUFBVSxDQUFDO0FBQUEsSUFDdkUsQ0FBQztBQUVELFNBQUssbURBQW1ELE1BQU07QUFDN0QsWUFBTSxTQUFTO0FBQ2YsYUFBTyxnQkFBZ0IsMEJBQTBCLE1BQU0sR0FBRyxDQUFDLFdBQVcsV0FBVyxTQUFTLENBQUM7QUFBQSxJQUM1RixDQUFDO0FBRUQsU0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxZQUFNLFNBQVM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxhQUFPLGdCQUFnQiwwQkFBMEIsTUFBTSxHQUFHLENBQUMsUUFBUSxVQUFVLENBQUM7QUFBQSxJQUMvRSxDQUFDO0FBRUQsU0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxZQUFNLFNBQVM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxhQUFPLGdCQUFnQiwwQkFBMEIsTUFBTSxHQUFHLENBQUMsVUFBVSxDQUFDO0FBQUEsSUFDdkUsQ0FBQztB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QTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsWUFBTSxTQUFTLGdCQUFnQixNQUFNO0FBQ3JDLGFBQU8sWUFBWSxPQUFPLE1BQU0sSUFBSTtBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHdCQUF3QixNQUFNO0FBQ2xDLFlBQU0sU0FBUztBQUFBLFFBQ2Q7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFlBQU0sU0FBUyxnQkFBZ0IsTUFBTTtBQUNyQyxhQUFPLFlBQVksT0FBTyxNQUFNLE1BQVM7QUFBQSxJQUMxQyxDQUFDO0FBRUQsU0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxZQUFNLFNBQVM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsWUFBTSxTQUFTLGdCQUFnQixNQUFNO0FBQ3JDLGFBQU8sWUFBWSxPQUFPLE1BQU0sTUFBUztBQUFBLElBQzFDLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxNQUFNO0FBQzlDLFlBQU0sU0FBUztBQUNmLFlBQU0sU0FBUyxnQkFBZ0IsTUFBTTtBQUNyQyxhQUFPLFlBQVksT0FBTyxNQUFNLEVBQUU7QUFBQSxJQUNuQyxDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxZQUFNLFNBQVM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxhQUFPLGdCQUFnQixnQkFBZ0IsTUFBTSxFQUFFLGNBQWM7QUFBQSxRQUM1RDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxhQUFPLGdCQUFnQixnQkFBZ0IsRUFBRSxHQUFHO0FBQUEsUUFDM0MsVUFBVTtBQUFBLFFBQ1YsTUFBTTtBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sY0FBYyxDQUFDO0FBQUEsUUFDZixlQUFlO0FBQUEsUUFDZixjQUFjO0FBQUEsTUFDZixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxZQUFNLFNBQVM7QUFDZixZQUFNLFNBQVMsZ0JBQWdCLE1BQU07QUFDckMsYUFBTyxZQUFZLE9BQU8sVUFBVSxxQkFBcUI7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
