import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangeType, FileSystemProviderErrorCode, FileType, toFileSystemProviderErrorCode } from "../../../files/common/files.js";
import { AgentHostFileSystemProvider, agentHostRemotePath, agentHostUri } from "../../common/agentHostFileSystemProvider.js";
import { remoteAgentHostSessionTypeId } from "../../common/agentHostSessionType.js";
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../../common/agentHostUri.js";
import { ContentEncoding, ResourceType } from "../../common/state/protocol/commands.js";
import { AhpErrorCodes } from "../../common/state/protocol/errors.js";
import { ProtocolError } from "../../common/state/sessionProtocol.js";
import { ROOT_STATE_URI } from "../../common/state/sessionState.js";
suite("AgentHostFileSystemProvider - URI helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agentHostUri builds correct URI", () => {
    const uri = agentHostUri("localhost", "/home/user/project");
    assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(uri.authority, "localhost");
    assert.ok(uri.path.includes("/home/user/project"));
  });
  test("agentHostRemotePath extracts the original path", () => {
    const uri = agentHostUri("host", "/some/path");
    assert.strictEqual(agentHostRemotePath(uri), "/some/path");
  });
  test("agentHostRemotePath round-trips with agentHostUri", () => {
    const original = "/home/user/project";
    const uri = agentHostUri("host", original);
    assert.strictEqual(agentHostRemotePath(uri), original);
  });
});
suite("AgentHostAuthority - encoding", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("purely alphanumeric address is returned as-is", () => {
    assert.strictEqual(agentHostAuthority("localhost"), "localhost");
  });
  test("normal host:port address uses human-readable encoding", () => {
    assert.strictEqual(agentHostAuthority("localhost:8081"), "localhost__8081");
    assert.strictEqual(agentHostAuthority("192.168.1.1:8080"), "192.168.1.1__8080");
    assert.strictEqual(agentHostAuthority("my-host:9090"), "my-host__9090");
    assert.strictEqual(agentHostAuthority("host.name:80"), "host.name__80");
  });
  test("address with underscore falls through to base64", () => {
    const authority = agentHostAuthority("host_name:8080");
    assert.ok(authority.startsWith("b64-"), `expected base64 for underscore address, got: ${authority}`);
  });
  test("address with exotic characters is base64-encoded", () => {
    assert.ok(agentHostAuthority("user@host:8080").startsWith("b64-"));
    assert.ok(agentHostAuthority("host with spaces").startsWith("b64-"));
    assert.ok(agentHostAuthority("http://myhost:3000").startsWith("b64-"));
  });
  test("ws:// prefix is normalized so authority matches bare address", () => {
    assert.strictEqual(agentHostAuthority("ws://127.0.0.1:8080"), agentHostAuthority("127.0.0.1:8080"));
    assert.strictEqual(agentHostAuthority("ws://localhost:9090"), agentHostAuthority("localhost:9090"));
  });
  test("remote local address does not collide with the ambient authority", () => {
    const authority = agentHostAuthority("local");
    const wrapped = toAgentHostUri(URI.file("/remote/file.txt"), authority);
    assert.deepStrictEqual({
      authority,
      normalizedAuthority: agentHostAuthority("ws://local"),
      similarAddressAuthority: agentHostAuthority("remote_local"),
      wrappedScheme: wrapped.scheme,
      wrappedAuthority: wrapped.authority
    }, {
      authority: "remote_local",
      normalizedAuthority: "remote_local",
      similarAddressAuthority: "b64-cmVtb3RlX2xvY2Fs",
      wrappedScheme: AGENT_HOST_SCHEME,
      wrappedAuthority: "remote_local"
    });
  });
  test("different addresses produce different authorities", () => {
    const cases = ["localhost:8080", "localhost:8081", "192.168.1.1:8080", "host-name:80", "host.name:80", "host_name:80", "user@host:8080"];
    const results = cases.map(agentHostAuthority);
    const unique = new Set(results);
    assert.strictEqual(unique.size, cases.length, "all authorities must be unique");
  });
  test("authority is valid in a URI authority position", () => {
    const addresses = ["localhost", "localhost:8081", "user@host:8080", "host with spaces", "192.168.1.1:9090"];
    for (const address of addresses) {
      const authority = agentHostAuthority(address);
      const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: "/test" });
      assert.strictEqual(uri.authority, authority, `authority for '${address}' must round-trip through URI`);
    }
  });
  test("authority is valid in a URI scheme position", () => {
    const addresses = ["localhost", "localhost:8081", "user@host:8080", "host with spaces"];
    for (const address of addresses) {
      const authority = agentHostAuthority(address);
      const scheme = remoteAgentHostSessionTypeId(authority, "copilot");
      const uri = URI.from({ scheme, path: "/test" });
      assert.strictEqual(uri.scheme, scheme, `scheme for '${address}' must round-trip through URI`);
    }
  });
});
suite("toAgentHostUri / fromAgentHostUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips a file URI", () => {
    const original = URI.file("/home/user/project/file.ts");
    const wrapped = toAgentHostUri(original, "my-server");
    assert.strictEqual(wrapped.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(wrapped.authority, "my-server");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.strictEqual(unwrapped.scheme, "file");
    assert.strictEqual(unwrapped.path, original.path);
  });
  test("round-trips a URI with authority", () => {
    const original = URI.from({ scheme: "agenthost-content", authority: "session1", path: "/snap/before" });
    const wrapped = toAgentHostUri(original, "remote-host");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.strictEqual(unwrapped.scheme, "agenthost-content");
    assert.strictEqual(unwrapped.authority, "session1");
    assert.strictEqual(unwrapped.path, "/snap/before");
  });
  test("round-trips query and fragment for synthetic content URIs", () => {
    const original = URI.from({
      scheme: "git-blob",
      path: "/src/app.ts",
      query: JSON.stringify({ sessionUri: "copilot:/abc", sha: "cafe1234" }),
      fragment: "L1"
    });
    const wrapped = toAgentHostUri(original, "remote-host");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.deepStrictEqual({
      wrappedPath: wrapped.path,
      wrappedFragment: wrapped.fragment,
      unwrapped: unwrapped.toString()
    }, {
      wrappedPath: original.path,
      wrappedFragment: original.fragment,
      unwrapped: original.toString()
    });
  });
  test("local authority returns original URI unchanged", () => {
    const original = URI.file("/workspace/test.ts");
    const result = toAgentHostUri(original, "local");
    assert.strictEqual(result.toString(), original.toString());
  });
  test("agentHostUri for root path produces valid encoded URI", () => {
    const authority = agentHostAuthority("localhost:8089");
    const uri = agentHostUri(authority, "/");
    assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(uri.authority, authority);
    assert.strictEqual(fromAgentHostUri(uri).path, "/");
  });
  test("fromAgentHostUri falls back to a file URI when metadata is missing", () => {
    const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: "host", path: "/file" });
    const result = fromAgentHostUri(uri);
    assert.strictEqual(result.scheme, "file");
    assert.strictEqual(result.path, "/file");
  });
});
suite("AGENT_HOST_LABEL_FORMATTER", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("label is the original path verbatim for file URIs", () => {
    const authority = agentHostAuthority("localhost:8089");
    const originalPath = "/Users/roblou/code/vscode";
    const encodedUri = agentHostUri(authority, originalPath);
    assert.strictEqual(AGENT_HOST_LABEL_FORMATTER.formatting.label, "${path}");
    assert.strictEqual(encodedUri.path, originalPath);
  });
  test("label is the original path verbatim for URIs with authority", () => {
    const originalUri = URI.from({ scheme: "agenthost-content", authority: "myhost", path: "/snap/before" });
    const encodedUri = toAgentHostUri(originalUri, "remote-host");
    assert.strictEqual(encodedUri.path, "/snap/before");
  });
  test("label is the original path verbatim for git-blob URIs", () => {
    const originalUri = URI.from({
      scheme: "git-blob",
      path: "/src/app.ts",
      query: JSON.stringify({ sessionUri: "copilot:/abc", sha: "cafe1234" })
    });
    const encodedUri = toAgentHostUri(originalUri, "remote-host");
    assert.strictEqual(encodedUri.path, "/src/app.ts");
  });
});
suite("AgentHostFileSystemProvider - authority registrations", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class NamedConnection {
    constructor(name) {
      this.name = name;
      this.listCalls = [];
    }
    async resourceList(uri) {
      this.listCalls.push(uri);
      return { entries: [{ name: `${this.name}.txt`, type: "file" }] };
    }
    async resourceRead() {
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceWrite() {
      return {};
    }
    async resourceCopy() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceResolve(params) {
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      return {};
    }
  }
  test("disposing a stale registration does not remove a newer registration for the same authority", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    const firstRegistration = disposables.add(provider.registerAuthority("client", first));
    disposables.add(provider.registerAuthority("client", second));
    firstRegistration.dispose();
    const entries = await provider.readdir(agentHostUri("client", "/workspace"));
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map((uri) => uri.toString()) }, {
      entries: [["second.txt", FileType.File]],
      firstCalls: [],
      secondCalls: [URI.file("/workspace").toString()]
    });
  });
  test("disposing the newest registration falls back to the previous one without entering grace", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    disposables.add(provider.registerAuthority("client", first));
    const secondRegistration = provider.registerAuthority("client", second);
    secondRegistration.dispose();
    const entries = await provider.readdir(agentHostUri("client", "/workspace"));
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls.map((uri) => uri.toString()), secondCalls: second.listCalls }, {
      entries: [["first.txt", FileType.File]],
      firstCalls: [URI.file("/workspace").toString()],
      secondCalls: []
    });
  });
  test("operation issued during reconnect window waits for the replacement registration", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(50));
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    const firstRegistration = provider.registerAuthority("client", first);
    firstRegistration.dispose();
    const pending = provider.readdir(agentHostUri("client", "/workspace"));
    disposables.add(provider.registerAuthority("client", second));
    const entries = await pending;
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map((uri) => uri.toString()) }, {
      entries: [["second.txt", FileType.File]],
      firstCalls: [],
      secondCalls: [URI.file("/workspace").toString()]
    });
  });
  test("operation issued in the grace window rejects with Unavailable when no reconnect arrives", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const first = new NamedConnection("first");
    const firstRegistration = provider.registerAuthority("client", first);
    firstRegistration.dispose();
    const pending = provider.readdir(agentHostUri("client", "/workspace"));
    let caught;
    try {
      await pending;
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "expected an error");
    assert.strictEqual(toFileSystemProviderErrorCode(caught), FileSystemProviderErrorCode.Unavailable);
  });
  test("operation rejects immediately when no authority was ever registered", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(50));
    let caught;
    try {
      await provider.readdir(agentHostUri("never", "/workspace"));
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "expected an error");
    assert.strictEqual(toFileSystemProviderErrorCode(caught), FileSystemProviderErrorCode.Unavailable);
  });
});
suite("AgentHostFileSystemProvider - synthetic content schemes", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class StubConnection {
    constructor() {
      this.readCalls = [];
      this.listCalls = [];
      this.resolveCalls = [];
      this.readResult = { data: "stub-content", encoding: ContentEncoding.Utf8, contentType: "text/plain" };
    }
    async resourceRead(uri) {
      this.readCalls.push(uri);
      return this.readResult;
    }
    async resourceList(uri) {
      this.listCalls.push(uri);
      return { entries: [] };
    }
    async resourceWrite() {
      return {};
    }
    async resourceCopy() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceResolve(params) {
      this.resolveCalls.push(params);
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      return {};
    }
  }
  function setup() {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new StubConnection();
    disposables.add(provider.registerAuthority("local", connection));
    return { provider, connection };
  }
  test("stat returns File for git-blob: URIs without listing the parent", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    assert.deepStrictEqual(connection.listCalls, [], "stat must not list a synthetic parent directory");
  });
  test("stat returns File for session-db: URIs (parity with git-blob)", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "session-db", authority: "sess1", path: "/snap/some-blob" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    assert.deepStrictEqual(connection.listCalls, []);
  });
  test("stat uses resourceResolve for ordinary file: URIs", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new StubConnection();
    disposables.add(provider.registerAuthority("remote", connection));
    const wrapped = agentHostUri("remote", "/some/file.ts");
    await provider.stat(wrapped);
    assert.strictEqual(connection.resolveCalls.length, 1);
    assert.strictEqual(connection.listCalls.length, 0);
  });
  test("readFile passes the decoded synthetic URI through to the connection", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const bytes = await provider.readFile(wrapped);
    assert.strictEqual(VSBuffer.wrap(bytes).toString(), "stub-content");
    assert.deepStrictEqual(connection.readCalls.map((u) => u.toString()), [inner.toString()]);
  });
  test("full stat-then-read round-trip mirrors the diff editor flow", async () => {
    const { provider } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    const bytes = await provider.readFile(wrapped);
    assert.strictEqual(VSBuffer.wrap(bytes).toString(), "stub-content");
  });
});
suite("AgentHostFileSystemProvider - permission errors and requestResourceAccess", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class ConfigurableConnection {
    constructor() {
      this.requestCalls = [];
      this.hasResourceRequest = true;
      // Defined as a property so we can `delete` it to simulate a connection
      // without resourceRequest support (e.g. older protocol clients).
      this.resourceRequest = async (params) => {
        this.requestCalls.push(params);
        if (this.requestError) {
          throw this.requestError;
        }
        return {};
      };
    }
    async resourceRead() {
      if (this.readError) {
        throw this.readError;
      }
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceList() {
      if (this.listError) {
        throw this.listError;
      }
      return { entries: [] };
    }
    async resourceWrite() {
      if (this.writeError) {
        throw this.writeError;
      }
      return {};
    }
    async resourceCopy() {
      if (this.copyError) {
        throw this.copyError;
      }
      return {};
    }
    async resourceDelete() {
      if (this.deleteError) {
        throw this.deleteError;
      }
      return {};
    }
    async resourceMove() {
      if (this.moveError) {
        throw this.moveError;
      }
      return {};
    }
    async resourceResolve(params) {
      if (this.resolveError) {
        throw this.resolveError;
      }
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      if (this.mkdirError) {
        throw this.mkdirError;
      }
      return {};
    }
  }
  function setup(opts = {}) {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new ConfigurableConnection();
    if (opts.withResourceRequest === false) {
      connection.hasResourceRequest = false;
      delete connection.resourceRequest;
    }
    disposables.add(provider.registerAuthority("remote", connection));
    return { provider, connection };
  }
  function permissionDenied(uri) {
    return new ProtocolError(AhpErrorCodes.PermissionDenied, "denied", { request: { uri, read: true } });
  }
  test("readFile maps PermissionDenied to NoPermissions (not FileNotFound)", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/secret");
    connection.readError = permissionDenied(wrapped.toString());
    try {
      await provider.readFile(wrapped);
      assert.fail("expected readFile to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.NoPermissions
      );
    }
  });
  test("readFile still maps generic errors to FileNotFound", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/missing");
    connection.readError = new Error("boom");
    try {
      await provider.readFile(wrapped);
      assert.fail("expected readFile to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.FileNotFound
      );
    }
  });
  test("writeFile / delete / rename / readdir all surface NoPermissions on PermissionDenied", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/no-write");
    const denied = permissionDenied(wrapped.toString());
    connection.writeError = denied;
    connection.deleteError = denied;
    connection.moveError = denied;
    connection.listError = denied;
    const codes = [];
    const collect = async (op) => {
      try {
        await op();
      } catch (err) {
        codes.push(toFileSystemProviderErrorCode(err instanceof Error ? err : void 0));
      }
    };
    await collect(() => provider.writeFile(wrapped, new Uint8Array(), { create: true, overwrite: true, unlock: false, atomic: false }));
    await collect(() => provider.delete(wrapped, { recursive: false, useTrash: false, atomic: false }));
    await collect(() => provider.rename(wrapped, agentHostUri("remote", "/dst"), { overwrite: true }));
    await collect(() => provider.readdir(wrapped));
    assert.deepStrictEqual(codes, [
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions
    ]);
  });
  test("requestResourceAccess forwards the decoded URI and access flags", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/etc/foo");
    await provider.requestResourceAccess(wrapped, { read: true, write: true });
    assert.deepStrictEqual(connection.requestCalls, [
      { channel: ROOT_STATE_URI, uri: URI.file("/etc/foo").toString(), read: true, write: true }
    ]);
  });
  test("requestResourceAccess throws Unavailable when the connection has no resourceRequest", async () => {
    const { provider } = setup({ withResourceRequest: false });
    const wrapped = agentHostUri("remote", "/etc/foo");
    try {
      await provider.requestResourceAccess(wrapped, { read: true });
      assert.fail("expected requestResourceAccess to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.Unavailable
      );
    }
  });
  test("requestResourceAccess maps PermissionDenied to NoPermissions", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/etc/foo");
    connection.requestError = permissionDenied(wrapped.toString());
    try {
      await provider.requestResourceAccess(wrapped, { read: true });
      assert.fail("expected requestResourceAccess to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.NoPermissions
      );
    }
  });
});
suite("AgentHostFileSystemProvider - resolve / mkdir / copy / watch", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class FullConnection {
    constructor() {
      this.resolveCalls = [];
      this.mkdirCalls = [];
      this.copyCalls = [];
      this.watchCalls = [];
      this.nextResolveResult = { uri: "", type: ResourceType.File, size: 42, mtime: "2026-01-15T12:34:56.789Z", etag: "etag-1" };
    }
    async resourceRead() {
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceList() {
      return { entries: [] };
    }
    async resourceWrite() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceCopy(params) {
      this.copyCalls.push(params);
      return {};
    }
    async resourceResolve(params) {
      this.resolveCalls.push(params);
      return { ...this.nextResolveResult, uri: typeof params.uri === "string" ? params.uri : URI.revive(params.uri).toString() };
    }
    async resourceMkdir(params) {
      this.mkdirCalls.push(params);
      return {};
    }
    async watchResource(params) {
      this.watchCalls.push(params);
      if (this.watchError) {
        throw this.watchError;
      }
      if (!this.nextWatchHandle) {
        throw new Error("test forgot to set nextWatchHandle");
      }
      return this.nextWatchHandle;
    }
  }
  function setup() {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new FullConnection();
    disposables.add(provider.registerAuthority("remote", connection));
    return { provider, connection };
  }
  test("stat uses resourceResolve when available and maps size/mtime/type", async () => {
    const { provider, connection } = setup();
    connection.nextResolveResult = { uri: "", type: ResourceType.Directory, size: 0, mtime: "2026-01-15T00:00:00.000Z" };
    const wrapped = agentHostUri("remote", "/some/dir");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.Directory);
    assert.strictEqual(stat.mtime, Date.parse("2026-01-15T00:00:00.000Z"));
    assert.strictEqual(connection.resolveCalls.length, 1, "resourceResolve was called");
  });
  test("stat does not mark resolved files readonly so they remain editable", async () => {
    const { provider, connection } = setup();
    connection.nextResolveResult = { uri: "", type: ResourceType.File, size: 10, mtime: "2026-01-15T00:00:00.000Z" };
    const wrapped = agentHostUri("remote", "/some/file.ts");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.permissions ?? 0, 0, "resolved files must not carry the Readonly permission");
  });
  test("realpath re-encodes the connection canonical URI back into provider space", async () => {
    const { provider, connection } = setup();
    connection.resourceResolve = async (params) => {
      connection.resolveCalls.push(params);
      return { uri: "file:///real/target.ts", type: ResourceType.File };
    };
    const wrapped = agentHostUri("remote", "/link/source.ts");
    const real = await provider.realpath(wrapped);
    assert.strictEqual(real, agentHostUri("remote", "/real/target.ts").path);
    assert.strictEqual(connection.resolveCalls.length, 1);
  });
  test("mkdir delegates to resourceMkdir", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/new/dir");
    await provider.mkdir(wrapped);
    assert.strictEqual(connection.mkdirCalls.length, 1);
    assert.strictEqual(connection.mkdirCalls[0].uri, fromAgentHostUri(wrapped).toString());
  });
  test("copy delegates to resourceCopy with overwrite mapped to !failIfExists", async () => {
    const { provider, connection } = setup();
    const from = agentHostUri("remote", "/a");
    const to = agentHostUri("remote", "/b");
    await provider.copy(from, to, { overwrite: false });
    assert.strictEqual(connection.copyCalls.length, 1);
    assert.strictEqual(connection.copyCalls[0].source, fromAgentHostUri(from).toString());
    assert.strictEqual(connection.copyCalls[0].destination, fromAgentHostUri(to).toString());
    assert.strictEqual(connection.copyCalls[0].failIfExists, true);
  });
  test("watch starts watchResource, forwards changes to onDidChangeFile, dispose tears down handle", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    let handleDisposed = false;
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => {
        handleDisposed = true;
        onDidChange.dispose();
      }
    };
    const wrapped = agentHostUri("remote", "/watched");
    const received = [];
    const sub = provider.onDidChangeFile((c) => received.push([...c]));
    const watchDisposable = provider.watch(wrapped, { recursive: true, excludes: ["**/node_modules/**"] });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.strictEqual(connection.watchCalls.length, 1);
    assert.strictEqual(connection.watchCalls[0].recursive, true);
    assert.deepStrictEqual(connection.watchCalls[0].excludes, { items: ["**/node_modules/**"] });
    const incomingChange = { resource: URI.parse("file:///watched/a.txt"), type: FileChangeType.UPDATED };
    const expectedChange = { resource: toAgentHostUri(URI.parse("file:///watched/a.txt"), "remote"), type: FileChangeType.UPDATED };
    onDidChange.fire([incomingChange]);
    assert.deepStrictEqual(received, [[expectedChange]]);
    watchDisposable.dispose();
    assert.strictEqual(handleDisposed, true, "underlying handle should be disposed when wrapper is disposed");
    sub.dispose();
  });
  test("watch forwards includes patterns to watchResource", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => onDidChange.dispose()
    };
    const wrapped = agentHostUri("remote", "/watched");
    const watchDisposable = provider.watch(wrapped, {
      recursive: false,
      excludes: [],
      includes: ["**/*.ts", { base: "/watched", pattern: "**/*.md" }]
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.deepStrictEqual(connection.watchCalls[0].includes, { items: ["**/*.ts", "**/*.md"] });
    watchDisposable.dispose();
  });
  test("watch setup failures are surfaced on onDidWatchError", async () => {
    const { provider, connection } = setup();
    connection.watchError = new Error("watch setup failed");
    const wrapped = agentHostUri("remote", "/watched");
    const errors = [];
    const sub = provider.onDidWatchError((message) => errors.push(message));
    const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
    await timeout(0);
    assert.deepStrictEqual(errors, ["watch setup failed"]);
    watchDisposable.dispose();
    sub.dispose();
  });
  test("watch disposed before async setup completes still tears down the handle", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    let handleDisposed = false;
    let handleCreated = false;
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => {
        handleDisposed = true;
        onDidChange.dispose();
      }
    };
    const originalWatchResource = connection.watchResource.bind(connection);
    connection.watchResource = async (params) => {
      handleCreated = true;
      await timeout(0);
      return originalWatchResource(params);
    };
    const wrapped = agentHostUri("remote", "/watched");
    const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
    await timeout(0);
    assert.strictEqual(handleCreated, true);
    watchDisposable.dispose();
    await timeout(0);
    await timeout(0);
    assert.strictEqual(handleDisposed, true);
  });
  test("watch reattaches to the next connection registered for the authority after disconnect", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const first = new FullConnection();
    const firstChanges = new Emitter();
    let firstHandleDisposed = false;
    first.nextWatchHandle = {
      onDidChange: firstChanges.event,
      dispose: () => {
        firstHandleDisposed = true;
        firstChanges.dispose();
      }
    };
    const firstReg = provider.registerAuthority("remote", first);
    const wrapped = agentHostUri("remote", "/watched");
    const received = [];
    disposables.add(provider.onDidChangeFile((c) => received.push([...c])));
    disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));
    await timeout(0);
    await timeout(0);
    firstChanges.fire([{ resource: URI.file("/watched/a.txt"), type: FileChangeType.UPDATED }]);
    firstReg.dispose();
    const second = new FullConnection();
    const secondChanges = new Emitter();
    let secondHandleDisposed = false;
    second.nextWatchHandle = {
      onDidChange: secondChanges.event,
      dispose: () => {
        secondHandleDisposed = true;
        secondChanges.dispose();
      }
    };
    disposables.add(provider.registerAuthority("remote", second));
    await timeout(0);
    await timeout(0);
    secondChanges.fire([{ resource: URI.file("/watched/b.txt"), type: FileChangeType.ADDED }]);
    assert.deepStrictEqual({
      firstWatchCalls: first.watchCalls.length,
      secondWatchCalls: second.watchCalls.length,
      firstHandleDisposed,
      secondHandleDisposed,
      received: received.map((batch) => batch.map((c) => [c.resource.toString(), c.type]))
    }, {
      firstWatchCalls: 1,
      secondWatchCalls: 1,
      firstHandleDisposed: true,
      secondHandleDisposed: false,
      received: [
        [[agentHostUri("remote", "/watched/a.txt").toString(), FileChangeType.UPDATED]],
        [[agentHostUri("remote", "/watched/b.txt").toString(), FileChangeType.ADDED]]
      ]
    });
  });
  test("watch attaches to a freshly-registered authority that did not exist when watch() was called", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const wrapped = agentHostUri("never-registered", "/path");
    const received = [];
    disposables.add(provider.onDidChangeFile((c) => received.push([...c])));
    disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));
    await new Promise((r) => setTimeout(r, 40));
    const connection = new FullConnection();
    const changes = new Emitter();
    connection.nextWatchHandle = {
      onDidChange: changes.event,
      dispose: () => changes.dispose()
    };
    disposables.add(provider.registerAuthority("never-registered", connection));
    await timeout(0);
    await timeout(0);
    changes.fire([{ resource: URI.file("/path/late.txt"), type: FileChangeType.ADDED }]);
    assert.strictEqual(connection.watchCalls.length, 1, "watch attached after late registration");
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0][0].resource.toString(), agentHostUri("never-registered", "/path/late.txt").toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VUeXBlLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUsIEZpbGVUeXBlLCBJRmlsZUNoYW5nZSwgdG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLCBhZ2VudEhvc3RSZW1vdGVQYXRoLCBhZ2VudEhvc3RVcmksIHR5cGUgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfTEFCRUxfRk9STUFUVEVSLCBBR0VOVF9IT1NUX1NDSEVNRSwgYWdlbnRIb3N0QXV0aG9yaXR5LCBmcm9tQWdlbnRIb3N0VXJpLCB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQ29udGVudEVuY29kaW5nLCBSZXNvdXJjZVR5cGUsIHR5cGUgQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcywgdHlwZSBSZXNvdXJjZUNvcHlQYXJhbXMsIHR5cGUgUmVzb3VyY2VMaXN0UmVzdWx0LCB0eXBlIFJlc291cmNlTWtkaXJQYXJhbXMsIHR5cGUgUmVzb3VyY2VSZWFkUmVzdWx0LCB0eXBlIFJlc291cmNlUmVxdWVzdFBhcmFtcywgdHlwZSBSZXNvdXJjZVJlcXVlc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZXNvbHZlUGFyYW1zLCB0eXBlIFJlc291cmNlUmVzb2x2ZVJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBaHBFcnJvckNvZGVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBST09UX1NUQVRFX1VSSSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIC0gVVJJIGhlbHBlcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWdlbnRIb3N0VXJpIGJ1aWxkcyBjb3JyZWN0IFVSSScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBhZ2VudEhvc3RVcmkoJ2xvY2FsaG9zdCcsICcvaG9tZS91c2VyL3Byb2plY3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgQUdFTlRfSE9TVF9TQ0hFTUUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuYXV0aG9yaXR5LCAnbG9jYWxob3N0Jyk7XG5cdFx0Ly8gcGF0aCBlbmNvZGVzIGZpbGUgc2NoZW1lOiAvZmlsZS8vaG9tZS91c2VyL3Byb2plY3Rcblx0XHRhc3NlcnQub2sodXJpLnBhdGguaW5jbHVkZXMoJy9ob21lL3VzZXIvcHJvamVjdCcpKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRIb3N0UmVtb3RlUGF0aCBleHRyYWN0cyB0aGUgb3JpZ2luYWwgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBhZ2VudEhvc3RVcmkoJ2hvc3QnLCAnL3NvbWUvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RSZW1vdGVQYXRoKHVyaSksICcvc29tZS9wYXRoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50SG9zdFJlbW90ZVBhdGggcm91bmQtdHJpcHMgd2l0aCBhZ2VudEhvc3RVcmknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSAnL2hvbWUvdXNlci9wcm9qZWN0Jztcblx0XHRjb25zdCB1cmkgPSBhZ2VudEhvc3RVcmkoJ2hvc3QnLCBvcmlnaW5hbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFJlbW90ZVBhdGgodXJpKSwgb3JpZ2luYWwpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0QXV0aG9yaXR5IC0gZW5jb2RpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncHVyZWx5IGFscGhhbnVtZXJpYyBhZGRyZXNzIGlzIHJldHVybmVkIGFzLWlzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdCcpLCAnbG9jYWxob3N0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbCBob3N0OnBvcnQgYWRkcmVzcyB1c2VzIGh1bWFuLXJlYWRhYmxlIGVuY29kaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdDo4MDgxJyksICdsb2NhbGhvc3RfXzgwODEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0QXV0aG9yaXR5KCcxOTIuMTY4LjEuMTo4MDgwJyksICcxOTIuMTY4LjEuMV9fODA4MCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJ215LWhvc3Q6OTA5MCcpLCAnbXktaG9zdF9fOTA5MCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJ2hvc3QubmFtZTo4MCcpLCAnaG9zdC5uYW1lX184MCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRyZXNzIHdpdGggdW5kZXJzY29yZSBmYWxscyB0aHJvdWdoIHRvIGJhc2U2NCcsICgpID0+IHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoJ2hvc3RfbmFtZTo4MDgwJyk7XG5cdFx0YXNzZXJ0Lm9rKGF1dGhvcml0eS5zdGFydHNXaXRoKCdiNjQtJyksIGBleHBlY3RlZCBiYXNlNjQgZm9yIHVuZGVyc2NvcmUgYWRkcmVzcywgZ290OiAke2F1dGhvcml0eX1gKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkcmVzcyB3aXRoIGV4b3RpYyBjaGFyYWN0ZXJzIGlzIGJhc2U2NC1lbmNvZGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhhZ2VudEhvc3RBdXRob3JpdHkoJ3VzZXJAaG9zdDo4MDgwJykuc3RhcnRzV2l0aCgnYjY0LScpKTtcblx0XHRhc3NlcnQub2soYWdlbnRIb3N0QXV0aG9yaXR5KCdob3N0IHdpdGggc3BhY2VzJykuc3RhcnRzV2l0aCgnYjY0LScpKTtcblx0XHRhc3NlcnQub2soYWdlbnRIb3N0QXV0aG9yaXR5KCdodHRwOi8vbXlob3N0OjMwMDAnKS5zdGFydHNXaXRoKCdiNjQtJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd3czovLyBwcmVmaXggaXMgbm9ybWFsaXplZCBzbyBhdXRob3JpdHkgbWF0Y2hlcyBiYXJlIGFkZHJlc3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnd3M6Ly8xMjcuMC4wLjE6ODA4MCcpLCBhZ2VudEhvc3RBdXRob3JpdHkoJzEyNy4wLjAuMTo4MDgwJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJ3dzOi8vbG9jYWxob3N0OjkwOTAnKSwgYWdlbnRIb3N0QXV0aG9yaXR5KCdsb2NhbGhvc3Q6OTA5MCcpKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3RlIGxvY2FsIGFkZHJlc3MgZG9lcyBub3QgY29sbGlkZSB3aXRoIHRoZSBhbWJpZW50IGF1dGhvcml0eScsICgpID0+IHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoJ2xvY2FsJyk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKFVSSS5maWxlKCcvcmVtb3RlL2ZpbGUudHh0JyksIGF1dGhvcml0eSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1dGhvcml0eSxcblx0XHRcdG5vcm1hbGl6ZWRBdXRob3JpdHk6IGFnZW50SG9zdEF1dGhvcml0eSgnd3M6Ly9sb2NhbCcpLFxuXHRcdFx0c2ltaWxhckFkZHJlc3NBdXRob3JpdHk6IGFnZW50SG9zdEF1dGhvcml0eSgncmVtb3RlX2xvY2FsJyksXG5cdFx0XHR3cmFwcGVkU2NoZW1lOiB3cmFwcGVkLnNjaGVtZSxcblx0XHRcdHdyYXBwZWRBdXRob3JpdHk6IHdyYXBwZWQuYXV0aG9yaXR5LFxuXHRcdH0sIHtcblx0XHRcdGF1dGhvcml0eTogJ3JlbW90ZV9sb2NhbCcsXG5cdFx0XHRub3JtYWxpemVkQXV0aG9yaXR5OiAncmVtb3RlX2xvY2FsJyxcblx0XHRcdHNpbWlsYXJBZGRyZXNzQXV0aG9yaXR5OiAnYjY0LWNtVnRiM1JsWDJ4dlkyRnMnLFxuXHRcdFx0d3JhcHBlZFNjaGVtZTogQUdFTlRfSE9TVF9TQ0hFTUUsXG5cdFx0XHR3cmFwcGVkQXV0aG9yaXR5OiAncmVtb3RlX2xvY2FsJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IGFkZHJlc3NlcyBwcm9kdWNlIGRpZmZlcmVudCBhdXRob3JpdGllcycsICgpID0+IHtcblx0XHRjb25zdCBjYXNlcyA9IFsnbG9jYWxob3N0OjgwODAnLCAnbG9jYWxob3N0OjgwODEnLCAnMTkyLjE2OC4xLjE6ODA4MCcsICdob3N0LW5hbWU6ODAnLCAnaG9zdC5uYW1lOjgwJywgJ2hvc3RfbmFtZTo4MCcsICd1c2VyQGhvc3Q6ODA4MCddO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBjYXNlcy5tYXAoYWdlbnRIb3N0QXV0aG9yaXR5KTtcblx0XHRjb25zdCB1bmlxdWUgPSBuZXcgU2V0KHJlc3VsdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmlxdWUuc2l6ZSwgY2FzZXMubGVuZ3RoLCAnYWxsIGF1dGhvcml0aWVzIG11c3QgYmUgdW5pcXVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dGhvcml0eSBpcyB2YWxpZCBpbiBhIFVSSSBhdXRob3JpdHkgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWRkcmVzc2VzID0gWydsb2NhbGhvc3QnLCAnbG9jYWxob3N0OjgwODEnLCAndXNlckBob3N0OjgwODAnLCAnaG9zdCB3aXRoIHNwYWNlcycsICcxOTIuMTY4LjEuMTo5MDkwJ107XG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIGFkZHJlc3Nlcykge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXR5ID0gYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IEFHRU5UX0hPU1RfU0NIRU1FLCBhdXRob3JpdHksIHBhdGg6ICcvdGVzdCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLmF1dGhvcml0eSwgYXV0aG9yaXR5LCBgYXV0aG9yaXR5IGZvciAnJHthZGRyZXNzfScgbXVzdCByb3VuZC10cmlwIHRocm91Z2ggVVJJYCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdhdXRob3JpdHkgaXMgdmFsaWQgaW4gYSBVUkkgc2NoZW1lIHBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFkZHJlc3NlcyA9IFsnbG9jYWxob3N0JywgJ2xvY2FsaG9zdDo4MDgxJywgJ3VzZXJAaG9zdDo4MDgwJywgJ2hvc3Qgd2l0aCBzcGFjZXMnXTtcblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgYWRkcmVzc2VzKSB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0XHRjb25zdCBzY2hlbWUgPSByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKGF1dGhvcml0eSwgJ2NvcGlsb3QnKTtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lLCBwYXRoOiAnL3Rlc3QnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5zY2hlbWUsIHNjaGVtZSwgYHNjaGVtZSBmb3IgJyR7YWRkcmVzc30nIG11c3Qgcm91bmQtdHJpcCB0aHJvdWdoIFVSSWApO1xuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ3RvQWdlbnRIb3N0VXJpIC8gZnJvbUFnZW50SG9zdFVyaScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhIGZpbGUgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9maWxlLnRzJyk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKG9yaWdpbmFsLCAnbXktc2VydmVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyYXBwZWQuc2NoZW1lLCBBR0VOVF9IT1NUX1NDSEVNRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdyYXBwZWQuYXV0aG9yaXR5LCAnbXktc2VydmVyJyk7XG5cblx0XHRjb25zdCB1bndyYXBwZWQgPSBmcm9tQWdlbnRIb3N0VXJpKHdyYXBwZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bndyYXBwZWQuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bndyYXBwZWQucGF0aCwgb3JpZ2luYWwucGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIGEgVVJJIHdpdGggYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudGhvc3QtY29udGVudCcsIGF1dGhvcml0eTogJ3Nlc3Npb24xJywgcGF0aDogJy9zbmFwL2JlZm9yZScgfSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKG9yaWdpbmFsLCAncmVtb3RlLWhvc3QnKTtcblx0XHRjb25zdCB1bndyYXBwZWQgPSBmcm9tQWdlbnRIb3N0VXJpKHdyYXBwZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bndyYXBwZWQuc2NoZW1lLCAnYWdlbnRob3N0LWNvbnRlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW53cmFwcGVkLmF1dGhvcml0eSwgJ3Nlc3Npb24xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVud3JhcHBlZC5wYXRoLCAnL3NuYXAvYmVmb3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHF1ZXJ5IGFuZCBmcmFnbWVudCBmb3Igc3ludGhldGljIGNvbnRlbnQgVVJJcycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogJ2dpdC1ibG9iJyxcblx0XHRcdHBhdGg6ICcvc3JjL2FwcC50cycsXG5cdFx0XHRxdWVyeTogSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uVXJpOiAnY29waWxvdDovYWJjJywgc2hhOiAnY2FmZTEyMzQnIH0pLFxuXHRcdFx0ZnJhZ21lbnQ6ICdMMScsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkob3JpZ2luYWwsICdyZW1vdGUtaG9zdCcpO1xuXHRcdGNvbnN0IHVud3JhcHBlZCA9IGZyb21BZ2VudEhvc3RVcmkod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdyYXBwZWRQYXRoOiB3cmFwcGVkLnBhdGgsXG5cdFx0XHR3cmFwcGVkRnJhZ21lbnQ6IHdyYXBwZWQuZnJhZ21lbnQsXG5cdFx0XHR1bndyYXBwZWQ6IHVud3JhcHBlZC50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdHdyYXBwZWRQYXRoOiBvcmlnaW5hbC5wYXRoLFxuXHRcdFx0d3JhcHBlZEZyYWdtZW50OiBvcmlnaW5hbC5mcmFnbWVudCxcblx0XHRcdHVud3JhcHBlZDogb3JpZ2luYWwudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9jYWwgYXV0aG9yaXR5IHJldHVybnMgb3JpZ2luYWwgVVJJIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QudHMnKTtcblx0XHRjb25zdCByZXN1bHQgPSB0b0FnZW50SG9zdFVyaShvcmlnaW5hbCwgJ2xvY2FsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50b1N0cmluZygpLCBvcmlnaW5hbC50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRIb3N0VXJpIGZvciByb290IHBhdGggcHJvZHVjZXMgdmFsaWQgZW5jb2RlZCBVUkknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gYWdlbnRIb3N0QXV0aG9yaXR5KCdsb2NhbGhvc3Q6ODA4OScpO1xuXHRcdGNvbnN0IHVyaSA9IGFnZW50SG9zdFVyaShhdXRob3JpdHksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5zY2hlbWUsIEFHRU5UX0hPU1RfU0NIRU1FKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLmF1dGhvcml0eSwgYXV0aG9yaXR5KTtcblx0XHQvLyBUaGUgZGVjb2RlZCBwYXRoIHNob3VsZCBiZSByb290XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZyb21BZ2VudEhvc3RVcmkodXJpKS5wYXRoLCAnLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmcm9tQWdlbnRIb3N0VXJpIGZhbGxzIGJhY2sgdG8gYSBmaWxlIFVSSSB3aGVuIG1ldGFkYXRhIGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IEFHRU5UX0hPU1RfU0NIRU1FLCBhdXRob3JpdHk6ICdob3N0JywgcGF0aDogJy9maWxlJyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBmcm9tQWdlbnRIb3N0VXJpKHVyaSk7XG5cdFx0Ly8gU2hvdWxkIG5vdCB0aHJvdyAtIGZhbGxzIGJhY2sgdG8gYSBmaWxlIFVSSSB1c2luZyB0aGUgcGF0aCB2ZXJiYXRpbVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucGF0aCwgJy9maWxlJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBR0VOVF9IT1NUX0xBQkVMX0ZPUk1BVFRFUicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdsYWJlbCBpcyB0aGUgb3JpZ2luYWwgcGF0aCB2ZXJiYXRpbSBmb3IgZmlsZSBVUklzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eSgnbG9jYWxob3N0OjgwODknKTtcblx0XHRjb25zdCBvcmlnaW5hbFBhdGggPSAnL1VzZXJzL3JvYmxvdS9jb2RlL3ZzY29kZSc7XG5cdFx0Y29uc3QgZW5jb2RlZFVyaSA9IGFnZW50SG9zdFVyaShhdXRob3JpdHksIG9yaWdpbmFsUGF0aCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQUdFTlRfSE9TVF9MQUJFTF9GT1JNQVRURVIuZm9ybWF0dGluZy5sYWJlbCwgJyR7cGF0aH0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jb2RlZFVyaS5wYXRoLCBvcmlnaW5hbFBhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYWJlbCBpcyB0aGUgb3JpZ2luYWwgcGF0aCB2ZXJiYXRpbSBmb3IgVVJJcyB3aXRoIGF1dGhvcml0eScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LWNvbnRlbnQnLCBhdXRob3JpdHk6ICdteWhvc3QnLCBwYXRoOiAnL3NuYXAvYmVmb3JlJyB9KTtcblx0XHRjb25zdCBlbmNvZGVkVXJpID0gdG9BZ2VudEhvc3RVcmkob3JpZ2luYWxVcmksICdyZW1vdGUtaG9zdCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuY29kZWRVcmkucGF0aCwgJy9zbmFwL2JlZm9yZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYWJlbCBpcyB0aGUgb3JpZ2luYWwgcGF0aCB2ZXJiYXRpbSBmb3IgZ2l0LWJsb2IgVVJJcycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogJ2dpdC1ibG9iJyxcblx0XHRcdHBhdGg6ICcvc3JjL2FwcC50cycsXG5cdFx0XHRxdWVyeTogSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uVXJpOiAnY29waWxvdDovYWJjJywgc2hhOiAnY2FmZTEyMzQnIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuY29kZWRVcmkgPSB0b0FnZW50SG9zdFVyaShvcmlnaW5hbFVyaSwgJ3JlbW90ZS1ob3N0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jb2RlZFVyaS5wYXRoLCAnL3NyYy9hcHAudHMnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciAtIGF1dGhvcml0eSByZWdpc3RyYXRpb25zJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgTmFtZWRDb25uZWN0aW9uIGltcGxlbWVudHMgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIHtcblx0XHRyZWFkb25seSBsaXN0Q2FsbHM6IFVSSVtdID0gW107XG5cblx0XHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG5hbWU6IHN0cmluZykgeyB9XG5cblx0XHRhc3luYyByZXNvdXJjZUxpc3QodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlTGlzdFJlc3VsdD4ge1xuXHRcdFx0dGhpcy5saXN0Q2FsbHMucHVzaCh1cmkpO1xuXHRcdFx0cmV0dXJuIHsgZW50cmllczogW3sgbmFtZTogYCR7dGhpcy5uYW1lfS50eHRgLCB0eXBlOiAnZmlsZScgfV0gfTtcblx0XHR9XG5cblx0XHRhc3luYyByZXNvdXJjZVJlYWQoKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+IHsgcmV0dXJuIHsgZGF0YTogJycsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCB9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VXcml0ZSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlQ29weSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlRGVsZXRlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VNb3ZlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRcdGNvbnN0IHVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSkhO1xuXHRcdFx0cmV0dXJuIHsgdXJpOiB1cmkudG9TdHJpbmcoKSwgdHlwZTogUmVzb3VyY2VUeXBlLkZpbGUgfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VNa2RpcigpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHR9XG5cblx0dGVzdCgnZGlzcG9zaW5nIGEgc3RhbGUgcmVnaXN0cmF0aW9uIGRvZXMgbm90IHJlbW92ZSBhIG5ld2VyIHJlZ2lzdHJhdGlvbiBmb3IgdGhlIHNhbWUgYXV0aG9yaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgTmFtZWRDb25uZWN0aW9uKCdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG5ldyBOYW1lZENvbm5lY3Rpb24oJ3NlY29uZCcpO1xuXHRcdGNvbnN0IGZpcnN0UmVnaXN0cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdjbGllbnQnLCBmaXJzdCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50Jywgc2Vjb25kKSk7XG5cblx0XHRmaXJzdFJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQnLCAnL3dvcmtzcGFjZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBlbnRyaWVzLCBmaXJzdENhbGxzOiBmaXJzdC5saXN0Q2FsbHMsIHNlY29uZENhbGxzOiBzZWNvbmQubGlzdENhbGxzLm1hcCh1cmkgPT4gdXJpLnRvU3RyaW5nKCkpIH0sIHtcblx0XHRcdGVudHJpZXM6IFtbJ3NlY29uZC50eHQnLCBGaWxlVHlwZS5GaWxlXV0sXG5cdFx0XHRmaXJzdENhbGxzOiBbXSxcblx0XHRcdHNlY29uZENhbGxzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zaW5nIHRoZSBuZXdlc3QgcmVnaXN0cmF0aW9uIGZhbGxzIGJhY2sgdG8gdGhlIHByZXZpb3VzIG9uZSB3aXRob3V0IGVudGVyaW5nIGdyYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgTmFtZWRDb25uZWN0aW9uKCdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG5ldyBOYW1lZENvbm5lY3Rpb24oJ3NlY29uZCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50JywgZmlyc3QpKTtcblx0XHRjb25zdCBzZWNvbmRSZWdpc3RyYXRpb24gPSBwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50Jywgc2Vjb25kKTtcblxuXHRcdHNlY29uZFJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQnLCAnL3dvcmtzcGFjZScpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBlbnRyaWVzLCBmaXJzdENhbGxzOiBmaXJzdC5saXN0Q2FsbHMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSksIHNlY29uZENhbGxzOiBzZWNvbmQubGlzdENhbGxzIH0sIHtcblx0XHRcdGVudHJpZXM6IFtbJ2ZpcnN0LnR4dCcsIEZpbGVUeXBlLkZpbGVdXSxcblx0XHRcdGZpcnN0Q2FsbHM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCldLFxuXHRcdFx0c2Vjb25kQ2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVyYXRpb24gaXNzdWVkIGR1cmluZyByZWNvbm5lY3Qgd2luZG93IHdhaXRzIGZvciB0aGUgcmVwbGFjZW1lbnQgcmVnaXN0cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoNTApKTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBOYW1lZENvbm5lY3Rpb24oJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbmV3IE5hbWVkQ29ubmVjdGlvbignc2Vjb25kJyk7XG5cblx0XHQvLyBSZWdpc3RlciwgdGhlbiBkaXNwb3NlIFx1MjAxNCB3ZSdyZSBub3cgaW5zaWRlIHRoZSBncmFjZSB3aW5kb3cuXG5cdFx0Y29uc3QgZmlyc3RSZWdpc3RyYXRpb24gPSBwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50JywgZmlyc3QpO1xuXHRcdGZpcnN0UmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdC8vIElzc3VlIGFuIG9wZXJhdGlvbiB3aGlsZSBubyBjb25uZWN0aW9uIGlzIGJvdW5kLiBJdCBzaG91bGRcblx0XHQvLyBxdWV1ZSwgd2FpdGluZyBmb3IgYSByZS1yZWdpc3RyYXRpb24uXG5cdFx0Y29uc3QgcGVuZGluZyA9IHByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCdjbGllbnQnLCAnL3dvcmtzcGFjZScpKTtcblxuXHRcdC8vIFJlY29ubmVjdCB3aXRoaW4gdGhlIGdyYWNlIHdpbmRvdy5cblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ2NsaWVudCcsIHNlY29uZCkpO1xuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHBlbmRpbmc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVudHJpZXMsIGZpcnN0Q2FsbHM6IGZpcnN0Lmxpc3RDYWxscywgc2Vjb25kQ2FsbHM6IHNlY29uZC5saXN0Q2FsbHMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSkgfSwge1xuXHRcdFx0ZW50cmllczogW1snc2Vjb25kLnR4dCcsIEZpbGVUeXBlLkZpbGVdXSxcblx0XHRcdGZpcnN0Q2FsbHM6IFtdLFxuXHRcdFx0c2Vjb25kQ2FsbHM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVyYXRpb24gaXNzdWVkIGluIHRoZSBncmFjZSB3aW5kb3cgcmVqZWN0cyB3aXRoIFVuYXZhaWxhYmxlIHdoZW4gbm8gcmVjb25uZWN0IGFycml2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigyMCkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gbmV3IE5hbWVkQ29ubmVjdGlvbignZmlyc3QnKTtcblxuXHRcdGNvbnN0IGZpcnN0UmVnaXN0cmF0aW9uID0gcHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ2NsaWVudCcsIGZpcnN0KTtcblx0XHRmaXJzdFJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gcHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudCcsICcvd29ya3NwYWNlJykpO1xuXG5cdFx0bGV0IGNhdWdodDogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcGVuZGluZztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNhdWdodCA9IGVycjtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGNhdWdodCBpbnN0YW5jZW9mIEVycm9yLCAnZXhwZWN0ZWQgYW4gZXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoY2F1Z2h0IGFzIEVycm9yKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlKTtcblx0fSk7XG5cblx0dGVzdCgnb3BlcmF0aW9uIHJlamVjdHMgaW1tZWRpYXRlbHkgd2hlbiBubyBhdXRob3JpdHkgd2FzIGV2ZXIgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKDUwKSk7XG5cblx0XHRsZXQgY2F1Z2h0OiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5yZWFkZGlyKGFnZW50SG9zdFVyaSgnbmV2ZXInLCAnL3dvcmtzcGFjZScpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNhdWdodCA9IGVycjtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGNhdWdodCBpbnN0YW5jZW9mIEVycm9yLCAnZXhwZWN0ZWQgYW4gZXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoY2F1Z2h0IGFzIEVycm9yKSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciAtIHN5bnRoZXRpYyBjb250ZW50IHNjaGVtZXMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogU3R1YiBjb25uZWN0aW9uIHRoYXQgcmVjb3JkcyB0aGUgVVJJcyBpdCdzIGFza2VkIGFib3V0IGFuZCByZXR1cm5zXG5cdCAqIGNhbm5lZCBkYXRhLCBzbyB3ZSBjYW4gYXNzZXJ0IG9uIHRoZSBVUklzIHRoZSBwcm92aWRlciBwYXNzZXMgdGhyb3VnaC5cblx0ICovXG5cdGNsYXNzIFN0dWJDb25uZWN0aW9uIGltcGxlbWVudHMgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIHtcblx0XHRyZWFkb25seSByZWFkQ2FsbHM6IFVSSVtdID0gW107XG5cdFx0cmVhZG9ubHkgbGlzdENhbGxzOiBVUklbXSA9IFtdO1xuXHRcdHJlYWRvbmx5IHJlc29sdmVDYWxsczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zW10gPSBbXTtcblx0XHRyZWFkUmVzdWx0OiBSZXNvdXJjZVJlYWRSZXN1bHQgPSB7IGRhdGE6ICdzdHViLWNvbnRlbnQnLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsIGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicgfTtcblxuXHRcdGFzeW5jIHJlc291cmNlUmVhZCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0XHR0aGlzLnJlYWRDYWxscy5wdXNoKHVyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZWFkUmVzdWx0O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZUxpc3QodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlTGlzdFJlc3VsdD4ge1xuXHRcdFx0dGhpcy5saXN0Q2FsbHMucHVzaCh1cmkpO1xuXHRcdFx0cmV0dXJuIHsgZW50cmllczogW10gfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VXcml0ZSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlQ29weSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlRGVsZXRlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VNb3ZlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRcdHRoaXMucmVzb2x2ZUNhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRcdGNvbnN0IHVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSkhO1xuXHRcdFx0cmV0dXJuIHsgdXJpOiB1cmkudG9TdHJpbmcoKSwgdHlwZTogUmVzb3VyY2VUeXBlLkZpbGUgfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VNa2RpcigpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFN0dWJDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdsb2NhbCcsIGNvbm5lY3Rpb24pKTtcblx0XHRyZXR1cm4geyBwcm92aWRlciwgY29ubmVjdGlvbiB9O1xuXHR9XG5cblx0Ly8gUmVncmVzc2lvbjogQUhQRmlsZVN5c3RlbVByb3ZpZGVyLnN0YXQoKSB1c2VkIHRvIGZhbGwgdGhyb3VnaCB0b1xuXHQvLyBfbGlzdERpcmVjdG9yeShwYXJlbnQpIGZvciBhbnkgVVJJIHdob3NlIGRlY29kZWQgc2NoZW1lIHdhc24ndFxuXHQvLyBzZXNzaW9uLWRiLCB3aGljaCBmYWlscyB3aXRoIFwiRGlyZWN0b3J5IG5vdCBmb3VuZFwiIGZvciBzeW50aGV0aWNcblx0Ly8gY29udGVudCBVUklzIHRoYXQgaGF2ZSBubyByZWFsIHBhcmVudCBkaXJlY3RvcnkuIFRoZSBkaWZmIGVkaXRvclxuXHQvLyBzdGF0cyBldmVyeSBVUkkgYmVmb3JlIHJlYWRpbmcgaXQsIHNvIHRoaXMgYnJva2UgXCJvcGVuIGRpZmYgb2YgYVxuXHQvLyBtb2RpZmllZCBmaWxlXCIgZW50aXJlbHkuIFRoZSBmaXggaXMgdGhlIHNjaGVtZSBhbGxvd2xpc3QgaW4gc3RhdCgpLlxuXG5cdHRlc3QoJ3N0YXQgcmV0dXJucyBGaWxlIGZvciBnaXQtYmxvYjogVVJJcyB3aXRob3V0IGxpc3RpbmcgdGhlIHBhcmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGlubmVyID0gVVJJLmZyb20oeyBzY2hlbWU6ICdnaXQtYmxvYicsIGF1dGhvcml0eTogJ3Nlc3MxJywgcGF0aDogJy9zaGEvZW5jb2RlZC9maWxlLnRzJyB9KTtcblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkoaW5uZXIsICdsb2NhbCcpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC50eXBlLCBGaWxlVHlwZS5GaWxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24ubGlzdENhbGxzLCBbXSwgJ3N0YXQgbXVzdCBub3QgbGlzdCBhIHN5bnRoZXRpYyBwYXJlbnQgZGlyZWN0b3J5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQgcmV0dXJucyBGaWxlIGZvciBzZXNzaW9uLWRiOiBVUklzIChwYXJpdHkgd2l0aCBnaXQtYmxvYiknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBpbm5lciA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnc2Vzc2lvbi1kYicsIGF1dGhvcml0eTogJ3Nlc3MxJywgcGF0aDogJy9zbmFwL3NvbWUtYmxvYicgfSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKGlubmVyLCAnbG9jYWwnKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXQudHlwZSwgRmlsZVR5cGUuRmlsZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmxpc3RDYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IHVzZXMgcmVzb3VyY2VSZXNvbHZlIGZvciBvcmRpbmFyeSBmaWxlOiBVUklzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFVzZSBhIG5vbi1sb2NhbCBhdXRob3JpdHkgc28gdGhlIFVSSSBhY3R1YWxseSBnb2VzIHRocm91Z2ggdGhlXG5cdFx0Ly8gYWdlbnQtaG9zdCB3cmFwcGluZyAodG9BZ2VudEhvc3RVcmkgc2hvcnQtY2lyY3VpdHMgJ2xvY2FsJ1xuXHRcdC8vICsgZmlsZTovLyB0byByZXR1cm4gdGhlIFVSSSB1bmNoYW5nZWQpLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBTdHViQ29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgncmVtb3RlJywgY29ubmVjdGlvbikpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvc29tZS9maWxlLnRzJyk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5zdGF0KHdyYXBwZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnJlc29sdmVDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmxpc3RDYWxscy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBwYXNzZXMgdGhlIGRlY29kZWQgc3ludGhldGljIFVSSSB0aHJvdWdoIHRvIHRoZSBjb25uZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaW5uZXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2dpdC1ibG9iJywgYXV0aG9yaXR5OiAnc2VzczEnLCBwYXRoOiAnL3NoYS9lbmNvZGVkL2ZpbGUudHMnIH0pO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSB0b0FnZW50SG9zdFVyaShpbm5lciwgJ2xvY2FsJyk7XG5cblx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHByb3ZpZGVyLnJlYWRGaWxlKHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAoYnl0ZXMpLnRvU3RyaW5nKCksICdzdHViLWNvbnRlbnQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24ucmVhZENhbGxzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksIFtpbm5lci50b1N0cmluZygpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgc3RhdC10aGVuLXJlYWQgcm91bmQtdHJpcCBtaXJyb3JzIHRoZSBkaWZmIGVkaXRvciBmbG93JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIGV4YWN0IHNlcXVlbmNlIHRoZSB3b3JrYmVuY2gncyBUZXh0RmlsZUVkaXRvck1vZGVsXG5cdFx0Ly8gZ29lcyB0aHJvdWdoIHdoZW4gRGlmZkVkaXRvcklucHV0LmNyZWF0ZU1vZGVsIHJlc29sdmVzOiBzdGF0XG5cdFx0Ly8gdGhlIFVSSSwgdGhlbiByZWFkIHRoZSBmaWxlLiBQcmUtZml4IHRoaXMgY29tYm8gZmFpbGVkIGF0IHRoZVxuXHRcdC8vIHN0YXQgc3RlcCBiZWZvcmUgcmVhZEZpbGUgd2FzIGV2ZW4gY2FsbGVkLlxuXHRcdGNvbnN0IHsgcHJvdmlkZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaW5uZXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2dpdC1ibG9iJywgYXV0aG9yaXR5OiAnc2VzczEnLCBwYXRoOiAnL3NoYS9lbmNvZGVkL2ZpbGUudHMnIH0pO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSB0b0FnZW50SG9zdFVyaShpbm5lciwgJ2xvY2FsJyk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdCh3cmFwcGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC50eXBlLCBGaWxlVHlwZS5GaWxlKTtcblx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHByb3ZpZGVyLnJlYWRGaWxlKHdyYXBwZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChWU0J1ZmZlci53cmFwKGJ5dGVzKS50b1N0cmluZygpLCAnc3R1Yi1jb250ZW50Jyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIgLSBwZXJtaXNzaW9uIGVycm9ycyBhbmQgcmVxdWVzdFJlc291cmNlQWNjZXNzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqXG5cdCAqIFN0dWIgY29ubmVjdGlvbiB3aG9zZSBpbmRpdmlkdWFsIG9wZXJhdGlvbnMgY2FuIGJlIGNvbmZpZ3VyZWQgdG8gdGhyb3cuXG5cdCAqIFJlY29yZHMgZXZlcnkgYHJlc291cmNlUmVxdWVzdGAgY2FsbCBzbyB0ZXN0cyBjYW4gYXNzZXJ0IFVSSSB0cmFuc2xhdGlvblxuXHQgKiBhbmQgdGhlIHJlYWQvd3JpdGUgZmxhZ3MgZm9yd2FyZGVkIHRvIHRoZSByZWNlaXZlci5cblx0ICovXG5cdGNsYXNzIENvbmZpZ3VyYWJsZUNvbm5lY3Rpb24gaW1wbGVtZW50cyBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24ge1xuXHRcdHJlYWRFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHR3cml0ZUVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdGxpc3RFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRkZWxldGVFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRtb3ZlRXJyb3I6IHVua25vd24gfCB1bmRlZmluZWQ7XG5cdFx0Y29weUVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdHJlc29sdmVFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRta2RpckVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdHJlcXVlc3RFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSByZXF1ZXN0Q2FsbHM6IFJlc291cmNlUmVxdWVzdFBhcmFtc1tdID0gW107XG5cdFx0aGFzUmVzb3VyY2VSZXF1ZXN0ID0gdHJ1ZTtcblxuXHRcdGFzeW5jIHJlc291cmNlUmVhZCgpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdFx0aWYgKHRoaXMucmVhZEVycm9yKSB7IHRocm93IHRoaXMucmVhZEVycm9yOyB9XG5cdFx0XHRyZXR1cm4geyBkYXRhOiAnJywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4IH07XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlTGlzdCgpOiBQcm9taXNlPFJlc291cmNlTGlzdFJlc3VsdD4ge1xuXHRcdFx0aWYgKHRoaXMubGlzdEVycm9yKSB7IHRocm93IHRoaXMubGlzdEVycm9yOyB9XG5cdFx0XHRyZXR1cm4geyBlbnRyaWVzOiBbXSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZVdyaXRlKCk6IFByb21pc2U8e30+IHtcblx0XHRcdGlmICh0aGlzLndyaXRlRXJyb3IpIHsgdGhyb3cgdGhpcy53cml0ZUVycm9yOyB9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlQ29weSgpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHRpZiAodGhpcy5jb3B5RXJyb3IpIHsgdGhyb3cgdGhpcy5jb3B5RXJyb3I7IH1cblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VEZWxldGUoKTogUHJvbWlzZTx7fT4ge1xuXHRcdFx0aWYgKHRoaXMuZGVsZXRlRXJyb3IpIHsgdGhyb3cgdGhpcy5kZWxldGVFcnJvcjsgfVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZU1vdmUoKTogUHJvbWlzZTx7fT4ge1xuXHRcdFx0aWYgKHRoaXMubW92ZUVycm9yKSB7IHRocm93IHRoaXMubW92ZUVycm9yOyB9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlUmVzb2x2ZShwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7XG5cdFx0XHRpZiAodGhpcy5yZXNvbHZlRXJyb3IpIHsgdGhyb3cgdGhpcy5yZXNvbHZlRXJyb3I7IH1cblx0XHRcdGNvbnN0IHVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSkhO1xuXHRcdFx0cmV0dXJuIHsgdXJpOiB1cmkudG9TdHJpbmcoKSwgdHlwZTogUmVzb3VyY2VUeXBlLkZpbGUgfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VNa2RpcigpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHRpZiAodGhpcy5ta2RpckVycm9yKSB7IHRocm93IHRoaXMubWtkaXJFcnJvcjsgfVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHQvLyBEZWZpbmVkIGFzIGEgcHJvcGVydHkgc28gd2UgY2FuIGBkZWxldGVgIGl0IHRvIHNpbXVsYXRlIGEgY29ubmVjdGlvblxuXHRcdC8vIHdpdGhvdXQgcmVzb3VyY2VSZXF1ZXN0IHN1cHBvcnQgKGUuZy4gb2xkZXIgcHJvdG9jb2wgY2xpZW50cykuXG5cdFx0cmVzb3VyY2VSZXF1ZXN0PyA9IGFzeW5jIChwYXJhbXM6IFJlc291cmNlUmVxdWVzdFBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXF1ZXN0UmVzdWx0PiA9PiB7XG5cdFx0XHR0aGlzLnJlcXVlc3RDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRpZiAodGhpcy5yZXF1ZXN0RXJyb3IpIHsgdGhyb3cgdGhpcy5yZXF1ZXN0RXJyb3I7IH1cblx0XHRcdHJldHVybiB7fTtcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAob3B0czogeyB3aXRoUmVzb3VyY2VSZXF1ZXN0PzogYm9vbGVhbiB9ID0ge30pIHtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgQ29uZmlndXJhYmxlQ29ubmVjdGlvbigpO1xuXHRcdGlmIChvcHRzLndpdGhSZXNvdXJjZVJlcXVlc3QgPT09IGZhbHNlKSB7XG5cdFx0XHRjb25uZWN0aW9uLmhhc1Jlc291cmNlUmVxdWVzdCA9IGZhbHNlO1xuXHRcdFx0ZGVsZXRlIGNvbm5lY3Rpb24ucmVzb3VyY2VSZXF1ZXN0O1xuXHRcdH1cblx0XHQvLyBVc2UgYSBub24tYGxvY2FsYCBhdXRob3JpdHkgc28gZmlsZSBVUklzIGFjdHVhbGx5IGdvIHRocm91Z2ggdGhlXG5cdFx0Ly8gQUhQIHdyYXBwaW5nOyB0b0FnZW50SG9zdFVyaSBzaG9ydC1jaXJjdWl0cyAnbG9jYWwnK2ZpbGU6Ly8gdG9cblx0XHQvLyByZXR1cm4gdGhlIFVSSSB1bmNoYW5nZWQsIHdoaWNoIHdvdWxkIGJ5cGFzcyB0aGUgcHJvdmlkZXIgZW50aXJlbHkuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdyZW1vdGUnLCBjb25uZWN0aW9uKSk7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHBlcm1pc3Npb25EZW5pZWQodXJpOiBzdHJpbmcpOiBQcm90b2NvbEVycm9yIHtcblx0XHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCAnZGVuaWVkJywgeyByZXF1ZXN0OiB7IHVyaSwgcmVhZDogdHJ1ZSB9IH0pO1xuXHR9XG5cblx0dGVzdCgncmVhZEZpbGUgbWFwcyBQZXJtaXNzaW9uRGVuaWVkIHRvIE5vUGVybWlzc2lvbnMgKG5vdCBGaWxlTm90Rm91bmQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9zZWNyZXQnKTtcblx0XHRjb25uZWN0aW9uLnJlYWRFcnJvciA9IHBlcm1pc3Npb25EZW5pZWQod3JhcHBlZC50b1N0cmluZygpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5yZWFkRmlsZSh3cmFwcGVkKTtcblx0XHRcdGFzc2VydC5mYWlsKCdleHBlY3RlZCByZWFkRmlsZSB0byByZWplY3QnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyxcblx0XHRcdCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWFkRmlsZSBzdGlsbCBtYXBzIGdlbmVyaWMgZXJyb3JzIHRvIEZpbGVOb3RGb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvbWlzc2luZycpO1xuXHRcdGNvbm5lY3Rpb24ucmVhZEVycm9yID0gbmV3IEVycm9yKCdib29tJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIucmVhZEZpbGUod3JhcHBlZCk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgcmVhZEZpbGUgdG8gcmVqZWN0Jyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RGb3VuZCxcblx0XHRcdCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZUZpbGUgLyBkZWxldGUgLyByZW5hbWUgLyByZWFkZGlyIGFsbCBzdXJmYWNlIE5vUGVybWlzc2lvbnMgb24gUGVybWlzc2lvbkRlbmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvbm8td3JpdGUnKTtcblx0XHRjb25zdCBkZW5pZWQgPSBwZXJtaXNzaW9uRGVuaWVkKHdyYXBwZWQudG9TdHJpbmcoKSk7XG5cdFx0Y29ubmVjdGlvbi53cml0ZUVycm9yID0gZGVuaWVkO1xuXHRcdGNvbm5lY3Rpb24uZGVsZXRlRXJyb3IgPSBkZW5pZWQ7XG5cdFx0Y29ubmVjdGlvbi5tb3ZlRXJyb3IgPSBkZW5pZWQ7XG5cdFx0Y29ubmVjdGlvbi5saXN0RXJyb3IgPSBkZW5pZWQ7XG5cblx0XHRjb25zdCBjb2RlczogKEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxlY3QgPSBhc3luYyAob3A6ICgpID0+IFByb21pc2U8dW5rbm93bj4pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IG9wKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29kZXMucHVzaCh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IHVuZGVmaW5lZCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0YXdhaXQgY29sbGVjdCgoKSA9PiBwcm92aWRlci53cml0ZUZpbGUod3JhcHBlZCwgbmV3IFVpbnQ4QXJyYXkoKSwgeyBjcmVhdGU6IHRydWUsIG92ZXJ3cml0ZTogdHJ1ZSwgdW5sb2NrOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KSk7XG5cdFx0YXdhaXQgY29sbGVjdCgoKSA9PiBwcm92aWRlci5kZWxldGUod3JhcHBlZCwgeyByZWN1cnNpdmU6IGZhbHNlLCB1c2VUcmFzaDogZmFsc2UsIGF0b21pYzogZmFsc2UgfSkpO1xuXHRcdGF3YWl0IGNvbGxlY3QoKCkgPT4gcHJvdmlkZXIucmVuYW1lKHdyYXBwZWQsIGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9kc3QnKSwgeyBvdmVyd3JpdGU6IHRydWUgfSkpO1xuXHRcdGF3YWl0IGNvbGxlY3QoKCkgPT4gcHJvdmlkZXIucmVhZGRpcih3cmFwcGVkKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvZGVzLCBbXG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zLFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMsXG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdFJlc291cmNlQWNjZXNzIGZvcndhcmRzIHRoZSBkZWNvZGVkIFVSSSBhbmQgYWNjZXNzIGZsYWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9ldGMvZm9vJyk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZXF1ZXN0UmVzb3VyY2VBY2Nlc3Mod3JhcHBlZCwgeyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5yZXF1ZXN0Q2FsbHMsIFtcblx0XHRcdHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJykudG9TdHJpbmcoKSwgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdFJlc291cmNlQWNjZXNzIHRocm93cyBVbmF2YWlsYWJsZSB3aGVuIHRoZSBjb25uZWN0aW9uIGhhcyBubyByZXNvdXJjZVJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gc2V0dXAoeyB3aXRoUmVzb3VyY2VSZXF1ZXN0OiBmYWxzZSB9KTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2V0Yy9mb28nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5yZXF1ZXN0UmVzb3VyY2VBY2Nlc3Mod3JhcHBlZCwgeyByZWFkOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlcXVlc3RSZXNvdXJjZUFjY2VzcyB0byByZWplY3QnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUsXG5cdFx0XHQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdFJlc291cmNlQWNjZXNzIG1hcHMgUGVybWlzc2lvbkRlbmllZCB0byBOb1Blcm1pc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9ldGMvZm9vJyk7XG5cdFx0Y29ubmVjdGlvbi5yZXF1ZXN0RXJyb3IgPSBwZXJtaXNzaW9uRGVuaWVkKHdyYXBwZWQudG9TdHJpbmcoKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIucmVxdWVzdFJlc291cmNlQWNjZXNzKHdyYXBwZWQsIHsgcmVhZDogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydC5mYWlsKCdleHBlY3RlZCByZXF1ZXN0UmVzb3VyY2VBY2Nlc3MgdG8gcmVqZWN0Jyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMsXG5cdFx0XHQpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciAtIHJlc29sdmUgLyBta2RpciAvIGNvcHkgLyB3YXRjaCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNsYXNzIEZ1bGxDb25uZWN0aW9uIGltcGxlbWVudHMgSVJlbW90ZUZpbGVzeXN0ZW1Db25uZWN0aW9uIHtcblx0XHRyZWFkb25seSByZXNvbHZlQ2FsbHM6IFJlc291cmNlUmVzb2x2ZVBhcmFtc1tdID0gW107XG5cdFx0cmVhZG9ubHkgbWtkaXJDYWxsczogUmVzb3VyY2VNa2RpclBhcmFtc1tdID0gW107XG5cdFx0cmVhZG9ubHkgY29weUNhbGxzOiBSZXNvdXJjZUNvcHlQYXJhbXNbXSA9IFtdO1xuXHRcdHJlYWRvbmx5IHdhdGNoQ2FsbHM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXNbXSA9IFtdO1xuXHRcdG5leHRXYXRjaEhhbmRsZTogeyBvbkRpZENoYW5nZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47IGRpc3Bvc2UoKTogdm9pZCB9IHwgdW5kZWZpbmVkO1xuXHRcdHdhdGNoRXJyb3I6IHVua25vd24gfCB1bmRlZmluZWQ7XG5cdFx0bmV4dFJlc29sdmVSZXN1bHQ6IFJlc291cmNlUmVzb2x2ZVJlc3VsdCA9IHsgdXJpOiAnJywgdHlwZTogUmVzb3VyY2VUeXBlLkZpbGUsIHNpemU6IDQyLCBtdGltZTogJzIwMjYtMDEtMTVUMTI6MzQ6NTYuNzg5WicsIGV0YWc6ICdldGFnLTEnIH07XG5cblx0XHRhc3luYyByZXNvdXJjZVJlYWQoKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+IHsgcmV0dXJuIHsgZGF0YTogJycsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCB9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VMaXN0KCk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7IHJldHVybiB7IGVudHJpZXM6IFtdIH07IH1cblx0XHRhc3luYyByZXNvdXJjZVdyaXRlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VEZWxldGUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZU1vdmUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZUNvcHkocGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHR0aGlzLmNvcHlDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlUmVzb2x2ZShwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7XG5cdFx0XHR0aGlzLnJlc29sdmVDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4geyAuLi50aGlzLm5leHRSZXNvbHZlUmVzdWx0LCB1cmk6IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IHBhcmFtcy51cmkgOiBVUkkucmV2aXZlKHBhcmFtcy51cmkpLnRvU3RyaW5nKCkgfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VNa2RpcihwYXJhbXM6IFJlc291cmNlTWtkaXJQYXJhbXMpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHR0aGlzLm1rZGlyQ2FsbHMucHVzaChwYXJhbXMpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRhc3luYyB3YXRjaFJlc291cmNlKHBhcmFtczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyk6IFByb21pc2U8eyBvbkRpZENoYW5nZTogRXZlbnQ8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT47IGRpc3Bvc2UoKTogdm9pZCB9PiB7XG5cdFx0XHR0aGlzLndhdGNoQ2FsbHMucHVzaChwYXJhbXMpO1xuXHRcdFx0aWYgKHRoaXMud2F0Y2hFcnJvcikge1xuXHRcdFx0XHR0aHJvdyB0aGlzLndhdGNoRXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMubmV4dFdhdGNoSGFuZGxlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigndGVzdCBmb3Jnb3QgdG8gc2V0IG5leHRXYXRjaEhhbmRsZScpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMubmV4dFdhdGNoSGFuZGxlO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwKCkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBGdWxsQ29ubmVjdGlvbigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgncmVtb3RlJywgY29ubmVjdGlvbikpO1xuXHRcdHJldHVybiB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH07XG5cdH1cblxuXHR0ZXN0KCdzdGF0IHVzZXMgcmVzb3VyY2VSZXNvbHZlIHdoZW4gYXZhaWxhYmxlIGFuZCBtYXBzIHNpemUvbXRpbWUvdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbm5lY3Rpb24ubmV4dFJlc29sdmVSZXN1bHQgPSB7IHVyaTogJycsIHR5cGU6IFJlc291cmNlVHlwZS5EaXJlY3RvcnksIHNpemU6IDAsIG10aW1lOiAnMjAyNi0wMS0xNVQwMDowMDowMC4wMDBaJyB9O1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvc29tZS9kaXInKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXQudHlwZSwgRmlsZVR5cGUuRGlyZWN0b3J5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC5tdGltZSwgRGF0ZS5wYXJzZSgnMjAyNi0wMS0xNVQwMDowMDowMC4wMDBaJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnJlc29sdmVDYWxscy5sZW5ndGgsIDEsICdyZXNvdXJjZVJlc29sdmUgd2FzIGNhbGxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF0IGRvZXMgbm90IG1hcmsgcmVzb2x2ZWQgZmlsZXMgcmVhZG9ubHkgc28gdGhleSByZW1haW4gZWRpdGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25uZWN0aW9uLm5leHRSZXNvbHZlUmVzdWx0ID0geyB1cmk6ICcnLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSwgc2l6ZTogMTAsIG10aW1lOiAnMjAyNi0wMS0xNVQwMDowMDowMC4wMDBaJyB9O1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvc29tZS9maWxlLnRzJyk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdCh3cmFwcGVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0LnBlcm1pc3Npb25zID8/IDAsIDAsICdyZXNvbHZlZCBmaWxlcyBtdXN0IG5vdCBjYXJyeSB0aGUgUmVhZG9ubHkgcGVybWlzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFscGF0aCByZS1lbmNvZGVzIHRoZSBjb25uZWN0aW9uIGNhbm9uaWNhbCBVUkkgYmFjayBpbnRvIHByb3ZpZGVyIHNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Ly8gU2ltdWxhdGUgYSBzeW1saW5rOiB0aGUgcmVzb2x2ZSByZXBvcnRzIGEgY2Fub25pY2FsIHRhcmdldCB0aGF0XG5cdFx0Ly8gZGlmZmVycyBmcm9tIHRoZSByZXF1ZXN0ZWQgcGF0aC5cblx0XHRjb25uZWN0aW9uLnJlc291cmNlUmVzb2x2ZSA9IGFzeW5jIChwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiA9PiB7XG5cdFx0XHRjb25uZWN0aW9uLnJlc29sdmVDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4geyB1cmk6ICdmaWxlOi8vL3JlYWwvdGFyZ2V0LnRzJywgdHlwZTogUmVzb3VyY2VUeXBlLkZpbGUgfTtcblx0XHR9O1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvbGluay9zb3VyY2UudHMnKTtcblxuXHRcdGNvbnN0IHJlYWwgPSBhd2FpdCBwcm92aWRlci5yZWFscGF0aCh3cmFwcGVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFsLCBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvcmVhbC90YXJnZXQudHMnKS5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5yZXNvbHZlQ2FsbHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbWtkaXIgZGVsZWdhdGVzIHRvIHJlc291cmNlTWtkaXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL25ldy9kaXInKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLm1rZGlyKHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ubWtkaXJDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLm1rZGlyQ2FsbHNbMF0udXJpLCBmcm9tQWdlbnRIb3N0VXJpKHdyYXBwZWQpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IGRlbGVnYXRlcyB0byByZXNvdXJjZUNvcHkgd2l0aCBvdmVyd3JpdGUgbWFwcGVkIHRvICFmYWlsSWZFeGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBmcm9tID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2EnKTtcblx0XHRjb25zdCB0byA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9iJyk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5jb3B5KGZyb20sIHRvLCB7IG92ZXJ3cml0ZTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5jb3B5Q2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5jb3B5Q2FsbHNbMF0uc291cmNlLCBmcm9tQWdlbnRIb3N0VXJpKGZyb20pLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmNvcHlDYWxsc1swXS5kZXN0aW5hdGlvbiwgZnJvbUFnZW50SG9zdFVyaSh0bykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uY29weUNhbGxzWzBdLmZhaWxJZkV4aXN0cywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIHN0YXJ0cyB3YXRjaFJlc291cmNlLCBmb3J3YXJkcyBjaGFuZ2VzIHRvIG9uRGlkQ2hhbmdlRmlsZSwgZGlzcG9zZSB0ZWFycyBkb3duIGhhbmRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4oKTtcblx0XHRsZXQgaGFuZGxlRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25uZWN0aW9uLm5leHRXYXRjaEhhbmRsZSA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgaGFuZGxlRGlzcG9zZWQgPSB0cnVlOyBvbkRpZENoYW5nZS5kaXNwb3NlKCk7IH0sXG5cdFx0fTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3dhdGNoZWQnKTtcblxuXHRcdGNvbnN0IHJlY2VpdmVkOiBJRmlsZUNoYW5nZVtdW10gPSBbXTtcblx0XHRjb25zdCBzdWIgPSBwcm92aWRlci5vbkRpZENoYW5nZUZpbGUoYyA9PiByZWNlaXZlZC5wdXNoKFsuLi5jXSkpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hEaXNwb3NhYmxlID0gcHJvdmlkZXIud2F0Y2god3JhcHBlZCwgeyByZWN1cnNpdmU6IHRydWUsIGV4Y2x1ZGVzOiBbJyoqL25vZGVfbW9kdWxlcy8qKiddIH0pO1xuXG5cdFx0Ly8gV2FpdCBvbmUgbWljcm90YXNrIHRpY2sgc28gdGhlIGFzeW5jIHdhdGNoUmVzb3VyY2UgcmVzb2x2ZXMuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBxdWV1ZU1pY3JvdGFzayhyZXNvbHZlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi53YXRjaENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ud2F0Y2hDYWxsc1swXS5yZWN1cnNpdmUsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi53YXRjaENhbGxzWzBdLmV4Y2x1ZGVzLCB7IGl0ZW1zOiBbJyoqL25vZGVfbW9kdWxlcy8qKiddIH0pO1xuXG5cdFx0Ly8gV2hlbiB3YXRjaFJlc291cmNlIHJlcG9ydHMgY2hhbmdlcyBmcm9tIHRoZSB1bmRlcmx5aW5nIGZpbGVzeXN0ZW0sXG5cdFx0Ly8gdGhleSBjb21lIGJhY2sgd2l0aCBmaWxlOi8vIFVSSXMuIFRoZSBwcm92aWRlciByZS1lbmNvZGVzIHRoZW0gd2l0aFxuXHRcdC8vIHRoZSBhZ2VudCBob3N0IGF1dGhvcml0eS5cblx0XHRjb25zdCBpbmNvbWluZ0NoYW5nZTogSUZpbGVDaGFuZ2UgPSB7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd2F0Y2hlZC9hLnR4dCcpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH07XG5cdFx0Y29uc3QgZXhwZWN0ZWRDaGFuZ2U6IElGaWxlQ2hhbmdlID0geyByZXNvdXJjZTogdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKCdmaWxlOi8vL3dhdGNoZWQvYS50eHQnKSwgJ3JlbW90ZScpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH07XG5cdFx0b25EaWRDaGFuZ2UuZmlyZShbaW5jb21pbmdDaGFuZ2VdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWQsIFtbZXhwZWN0ZWRDaGFuZ2VdXSk7XG5cblx0XHR3YXRjaERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVEaXNwb3NlZCwgdHJ1ZSwgJ3VuZGVybHlpbmcgaGFuZGxlIHNob3VsZCBiZSBkaXNwb3NlZCB3aGVuIHdyYXBwZXIgaXMgZGlzcG9zZWQnKTtcblx0XHRzdWIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCBmb3J3YXJkcyBpbmNsdWRlcyBwYXR0ZXJucyB0byB3YXRjaFJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGNvbm5lY3Rpb24ubmV4dFdhdGNoSGFuZGxlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gb25EaWRDaGFuZ2UuZGlzcG9zZSgpLFxuXHRcdH07XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy93YXRjaGVkJyk7XG5cblx0XHRjb25zdCB3YXRjaERpc3Bvc2FibGUgPSBwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7XG5cdFx0XHRyZWN1cnNpdmU6IGZhbHNlLFxuXHRcdFx0ZXhjbHVkZXM6IFtdLFxuXHRcdFx0aW5jbHVkZXM6IFsnKiovKi50cycsIHsgYmFzZTogJy93YXRjaGVkJywgcGF0dGVybjogJyoqLyoubWQnIH1dLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBxdWV1ZU1pY3JvdGFzayhyZXNvbHZlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLndhdGNoQ2FsbHNbMF0uaW5jbHVkZXMsIHsgaXRlbXM6IFsnKiovKi50cycsICcqKi8qLm1kJ10gfSk7XG5cblx0XHR3YXRjaERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCBzZXR1cCBmYWlsdXJlcyBhcmUgc3VyZmFjZWQgb24gb25EaWRXYXRjaEVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29ubmVjdGlvbi53YXRjaEVycm9yID0gbmV3IEVycm9yKCd3YXRjaCBzZXR1cCBmYWlsZWQnKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3dhdGNoZWQnKTtcblxuXHRcdGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzdWIgPSBwcm92aWRlci5vbkRpZFdhdGNoRXJyb3IobWVzc2FnZSA9PiBlcnJvcnMucHVzaChtZXNzYWdlKSk7XG5cblx0XHRjb25zdCB3YXRjaERpc3Bvc2FibGUgPSBwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHQvLyBZaWVsZCB1bnRpbCB0aGUgd2F0Y2gncyBhc3luYyBjaGFpbiAoYWNxdWlyZSBjb25uZWN0aW9uIFx1MjE5MlxuXHRcdC8vIHdhdGNoUmVzb3VyY2UgXHUyMTkyIGVycm9yIHByb3BhZ2F0aW9uKSBzZXR0bGVzLlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9ycywgWyd3YXRjaCBzZXR1cCBmYWlsZWQnXSk7XG5cblx0XHR3YXRjaERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIGRpc3Bvc2VkIGJlZm9yZSBhc3luYyBzZXR1cCBjb21wbGV0ZXMgc3RpbGwgdGVhcnMgZG93biB0aGUgaGFuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGxldCBoYW5kbGVEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGxldCBoYW5kbGVDcmVhdGVkID0gZmFsc2U7XG5cdFx0Y29ubmVjdGlvbi5uZXh0V2F0Y2hIYW5kbGUgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IGhhbmRsZURpc3Bvc2VkID0gdHJ1ZTsgb25EaWRDaGFuZ2UuZGlzcG9zZSgpOyB9LFxuXHRcdH07XG5cdFx0Ly8gRGVmZXIgdGhlIHdhdGNoUmVzb3VyY2UgcmVzb2x1dGlvbiBzbyB3ZSBjYW4gZGlzcG9zZSBiZXR3ZWVuXG5cdFx0Ly8gYHdhdGNoKClgIHJldHVybmluZyBhbmQgdGhlIGhhbmRsZSBiZWluZyBhc3NpZ25lZC5cblx0XHRjb25zdCBvcmlnaW5hbFdhdGNoUmVzb3VyY2UgPSBjb25uZWN0aW9uLndhdGNoUmVzb3VyY2UuYmluZChjb25uZWN0aW9uKTtcblx0XHRjb25uZWN0aW9uLndhdGNoUmVzb3VyY2UgPSBhc3luYyBwYXJhbXMgPT4ge1xuXHRcdFx0aGFuZGxlQ3JlYXRlZCA9IHRydWU7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsV2F0Y2hSZXNvdXJjZShwYXJhbXMpO1xuXHRcdH07XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy93YXRjaGVkJyk7XG5cblx0XHRjb25zdCB3YXRjaERpc3Bvc2FibGUgPSBwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KTtcblx0XHQvLyBZaWVsZCB1bnRpbCB3YXRjaFJlc291cmNlIGhhcyBiZWd1biAoc28gYSBoYW5kbGUgaXMgaW4gZmxpZ2h0KSxcblx0XHQvLyB0aGVuIGRpc3Bvc2UgYmVmb3JlIGl0IHJlc29sdmVzLlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZUNyZWF0ZWQsIHRydWUpO1xuXHRcdHdhdGNoRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZURpc3Bvc2VkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggcmVhdHRhY2hlcyB0byB0aGUgbmV4dCBjb25uZWN0aW9uIHJlZ2lzdGVyZWQgZm9yIHRoZSBhdXRob3JpdHkgYWZ0ZXIgZGlzY29ubmVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKDIwKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgRnVsbENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBmaXJzdENoYW5nZXMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGxldCBmaXJzdEhhbmRsZURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Zmlyc3QubmV4dFdhdGNoSGFuZGxlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IGZpcnN0Q2hhbmdlcy5ldmVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgZmlyc3RIYW5kbGVEaXNwb3NlZCA9IHRydWU7IGZpcnN0Q2hhbmdlcy5kaXNwb3NlKCk7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBmaXJzdFJlZyA9IHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdyZW1vdGUnLCBmaXJzdCk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3dhdGNoZWQnKTtcblx0XHRjb25zdCByZWNlaXZlZDogSUZpbGVDaGFuZ2VbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZShjID0+IHJlY2VpdmVkLnB1c2goWy4uLmNdKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Zmlyc3RDaGFuZ2VzLmZpcmUoW3sgcmVzb3VyY2U6IFVSSS5maWxlKCcvd2F0Y2hlZC9hLnR4dCcpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEIH1dKTtcblxuXHRcdC8vIERpc2Nvbm5lY3Q6IGEgcmUtcmVnaXN0cmF0aW9uIGFycml2ZXMgd2l0aGluIHRoZSBncmFjZSB3aW5kb3cuXG5cdFx0Ly8gVGhlIHdhdGNoZXIgbXVzdCBkaXNwb3NlIHRoZSBvbGQgaGFuZGxlIGFuZCBhdHRhY2ggdG8gdGhlIG5ld1xuXHRcdC8vIGNvbm5lY3Rpb24gd2l0aG91dCB0aGUgY2FsbGVyIGRvaW5nIGFueXRoaW5nLlxuXHRcdGZpcnN0UmVnLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBzZWNvbmQgPSBuZXcgRnVsbENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBzZWNvbmRDaGFuZ2VzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4oKTtcblx0XHRsZXQgc2Vjb25kSGFuZGxlRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRzZWNvbmQubmV4dFdhdGNoSGFuZGxlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IHNlY29uZENoYW5nZXMuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IHNlY29uZEhhbmRsZURpc3Bvc2VkID0gdHJ1ZTsgc2Vjb25kQ2hhbmdlcy5kaXNwb3NlKCk7IH0sXG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ3JlbW90ZScsIHNlY29uZCkpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHNlY29uZENoYW5nZXMuZmlyZShbeyByZXNvdXJjZTogVVJJLmZpbGUoJy93YXRjaGVkL2IudHh0JyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLkFEREVEIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zmlyc3RXYXRjaENhbGxzOiBmaXJzdC53YXRjaENhbGxzLmxlbmd0aCxcblx0XHRcdHNlY29uZFdhdGNoQ2FsbHM6IHNlY29uZC53YXRjaENhbGxzLmxlbmd0aCxcblx0XHRcdGZpcnN0SGFuZGxlRGlzcG9zZWQsXG5cdFx0XHRzZWNvbmRIYW5kbGVEaXNwb3NlZCxcblx0XHRcdHJlY2VpdmVkOiByZWNlaXZlZC5tYXAoYmF0Y2ggPT4gYmF0Y2gubWFwKGMgPT4gW2MucmVzb3VyY2UudG9TdHJpbmcoKSwgYy50eXBlXSkpLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0V2F0Y2hDYWxsczogMSxcblx0XHRcdHNlY29uZFdhdGNoQ2FsbHM6IDEsXG5cdFx0XHRmaXJzdEhhbmRsZURpc3Bvc2VkOiB0cnVlLFxuXHRcdFx0c2Vjb25kSGFuZGxlRGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0cmVjZWl2ZWQ6IFtcblx0XHRcdFx0W1thZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvd2F0Y2hlZC9hLnR4dCcpLnRvU3RyaW5nKCksIEZpbGVDaGFuZ2VUeXBlLlVQREFURURdXSxcblx0XHRcdFx0W1thZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvd2F0Y2hlZC9iLnR4dCcpLnRvU3RyaW5nKCksIEZpbGVDaGFuZ2VUeXBlLkFEREVEXV0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCBhdHRhY2hlcyB0byBhIGZyZXNobHktcmVnaXN0ZXJlZCBhdXRob3JpdHkgdGhhdCBkaWQgbm90IGV4aXN0IHdoZW4gd2F0Y2goKSB3YXMgY2FsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoMjApKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCduZXZlci1yZWdpc3RlcmVkJywgJy9wYXRoJyk7XG5cblx0XHRjb25zdCByZWNlaXZlZDogSUZpbGVDaGFuZ2VbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZShjID0+IHJlY2VpdmVkLnB1c2goWy4uLmNdKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIGV4Y2x1ZGVzOiBbXSB9KSk7XG5cblx0XHQvLyBObyBhdXRob3JpdHkgcmVnaXN0ZXJlZCB5ZXQgXHUyMDE0IG5vdGhpbmcgdG8gYXR0YWNoIHRvLiBXYWl0IGxvbmdcblx0XHQvLyBlbm91Z2ggdGhhdCB0aGUgZ3JhY2UgdGltZXIgKGlmIGFueSB3ZXJlIHJ1bm5pbmcpIHdvdWxkIGV4cGlyZS5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNDApKTtcblxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgRnVsbENvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBjaGFuZ2VzID0gbmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUZpbGVDaGFuZ2VbXT4oKTtcblx0XHRjb25uZWN0aW9uLm5leHRXYXRjaEhhbmRsZSA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBjaGFuZ2VzLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gY2hhbmdlcy5kaXNwb3NlKCksXG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ25ldmVyLXJlZ2lzdGVyZWQnLCBjb25uZWN0aW9uKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y2hhbmdlcy5maXJlKFt7IHJlc291cmNlOiBVUkkuZmlsZSgnL3BhdGgvbGF0ZS50eHQnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ud2F0Y2hDYWxscy5sZW5ndGgsIDEsICd3YXRjaCBhdHRhY2hlZCBhZnRlciBsYXRlIHJlZ2lzdHJhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZFswXVswXS5yZXNvdXJjZS50b1N0cmluZygpLCBhZ2VudEhvc3RVcmkoJ25ldmVyLXJlZ2lzdGVyZWQnLCAnL3BhdGgvbGF0ZS50eHQnKS50b1N0cmluZygpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0IsNkJBQTZCLFVBQXVCLHFDQUFxQztBQUNsSCxTQUFTLDZCQUE2QixxQkFBcUIsb0JBQXNEO0FBQ2pILFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsNEJBQTRCLG1CQUFtQixvQkFBb0Isa0JBQWtCLHNCQUFzQjtBQUNwSCxTQUFTLGlCQUFpQixvQkFBeVE7QUFDblMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSw2Q0FBNkMsTUFBTTtBQUV4RCwwQ0FBd0M7QUFFeEMsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxVQUFNLE1BQU0sYUFBYSxhQUFhLG9CQUFvQjtBQUMxRCxXQUFPLFlBQVksSUFBSSxRQUFRLGlCQUFpQjtBQUNoRCxXQUFPLFlBQVksSUFBSSxXQUFXLFdBQVc7QUFFN0MsV0FBTyxHQUFHLElBQUksS0FBSyxTQUFTLG9CQUFvQixDQUFDO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxNQUFNLGFBQWEsUUFBUSxZQUFZO0FBQzdDLFdBQU8sWUFBWSxvQkFBb0IsR0FBRyxHQUFH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
