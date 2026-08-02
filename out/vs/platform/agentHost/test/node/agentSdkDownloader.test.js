import assert from "assert";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as os from "os";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { FileService } from "../../../files/common/fileService.js";
import { DiskFileSystemProvider } from "../../../files/node/diskFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { RequestService } from "../../../request/node/requestService.js";
import { AgentSdkDownloader, resolveSdkTarget } from "../../node/agentSdkDownloader.js";
import { ClaudeSdkPackage } from "../../node/claude/claudeAgentSdkService.js";
import { AgentHostClaudeSdkRootEnvVar } from "../../common/agentService.js";
async function buildFixtureTarball() {
  const tar = await import("tar");
  const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), "sdk-fixture-"));
  const innerRel = path.join("node_modules", "@anthropic-ai", "claude-agent-sdk", "sdk.mjs");
  const innerContents = "// fixture sdk.mjs\nexport default {};\n";
  await fsp.mkdir(path.dirname(path.join(stagingDir, innerRel)), { recursive: true });
  await fsp.writeFile(path.join(stagingDir, innerRel), innerContents);
  const tarballPath = path.join(stagingDir, "fixture.tgz");
  await tar.c({ file: tarballPath, cwd: stagingDir, gzip: true }, ["node_modules"]);
  return {
    tarballPath,
    innerFile: innerRel,
    innerContents,
    cleanup: async () => fsp.rm(stagingDir, { recursive: true, force: true })
  };
}
async function startServer(body) {
  const http = await import("http");
  return new Promise((resolve) => {
    const state = { count: 0, lastPath: void 0 };
    const server = http.createServer((req, res) => {
      state.count++;
      state.lastPath = req.url;
      res.statusCode = 200;
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader("content-length", String(body.length));
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        get port() {
          return port;
        },
        get requestCount() {
          return state.count;
        },
        get lastPath() {
          return state.lastPath;
        },
        close: () => new Promise((res) => server.close(() => res()))
      });
    });
  });
}
function makeEnvService(userDataPath) {
  return { userDataPath, args: { "force-disable-user-env": true } };
}
function makeProductService(config) {
  return {
    agentSdks: config ? { claude: config } : void 0
  };
}
function makeRequestService(disposables) {
  return disposables.add(new RequestService(
    "local",
    new TestConfigurationService(),
    makeEnvService("/unused-for-requestservice"),
    new NullLogService()
  ));
}
function makeFileService(disposables) {
  const log = new NullLogService();
  const svc = disposables.add(new FileService(log));
  disposables.add(svc.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(log))));
  return svc;
}
suite("resolveSdkTarget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function fakePkg(hasSeparateMuslLinuxPackage) {
    return { id: "test", displayName: "Test", devOverrideEnvVar: "X", hasSeparateMuslLinuxPackage };
  }
  test("returns <platform>-<arch> for supported (platform, arch)", () => {
    assert.deepStrictEqual({
      "darwin-x64": resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "x64", libc: void 0 }),
      "darwin-arm64": resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "arm64", libc: void 0 }),
      "linux-x64": resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "x64", libc: "glibc" }),
      "linux-arm64": resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "arm64", libc: "glibc" }),
      "win32-x64": resolveSdkTarget(fakePkg(false), { platform: "win32", arch: "x64", libc: void 0 }),
      "win32-arm64": resolveSdkTarget(fakePkg(false), { platform: "win32", arch: "arm64", libc: void 0 })
    }, {
      "darwin-x64": "darwin-x64",
      "darwin-arm64": "darwin-arm64",
      "linux-x64": "linux-x64",
      "linux-arm64": "linux-arm64",
      "win32-x64": "win32-x64",
      "win32-arm64": "win32-arm64"
    });
  });
  test("appends -musl on musl Linux iff the package has separate musl SKUs", () => {
    assert.strictEqual(
      resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "x64", libc: "musl" }),
      "linux-x64-musl",
      "claude-style: musl host \u2192 -musl suffix"
    );
    assert.strictEqual(
      resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "x64", libc: "musl" }),
      "linux-x64",
      "codex-style: musl host \u2192 no suffix (statically musl-linked, single SKU)"
    );
    assert.strictEqual(
      resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "x64", libc: "glibc" }),
      "linux-x64",
      "claude-style: glibc host \u2192 no suffix"
    );
  });
  test("returns undefined for unsupported (platform, arch)", () => {
    assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "armhf", libc: "glibc" }), void 0);
    assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: "freebsd", arch: "x64", libc: void 0 }), void 0);
    assert.strictEqual(resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "ia32", libc: void 0 }), void 0);
  });
});
suite("AgentSdkDownloader", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  let userDataPath;
  let fixture;
  let server;
  let originalEnvOverride;
  let hostSdkTarget;
  function newToken() {
    const src = disposables.add(new CancellationTokenSource());
    return src.token;
  }
  suiteSetup(function() {
    const target = resolveSdkTarget(ClaudeSdkPackage);
    if (!target) {
      this.skip();
    }
    hostSdkTarget = target;
  });
  setup(async () => {
    originalEnvOverride = process.env[AgentHostClaudeSdkRootEnvVar];
    delete process.env[AgentHostClaudeSdkRootEnvVar];
    userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "sdk-userdata-"));
    fixture = await buildFixtureTarball();
    server = await startServer(await fsp.readFile(fixture.tarballPath));
  });
  teardown(async () => {
    await server.close();
    await fixture.cleanup();
    await fsp.rm(userDataPath, { recursive: true, force: true });
    if (originalEnvOverride === void 0) {
      delete process.env[AgentHostClaudeSdkRootEnvVar];
    } else {
      process.env[AgentHostClaudeSdkRootEnvVar] = originalEnvOverride;
    }
  });
  function makeDownloader(productConfig) {
    const config = productConfig === null ? void 0 : {
      version: productConfig?.version ?? "1.0.0",
      urlTemplate: productConfig?.urlTemplate ?? `http://127.0.0.1:${server.port}/sdk-{sdkTarget}.tgz`
    };
    return disposables.add(new AgentSdkDownloader(
      makeEnvService(userDataPath),
      makeProductService(config),
      makeRequestService(disposables),
      makeFileService(disposables),
      new NullLogService()
    ));
  }
  test("isAvailable: false when no env override and no product config", () => {
    assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), false);
  });
  test("isAvailable: true when env override set", () => {
    process.env[AgentHostClaudeSdkRootEnvVar] = "/some/path";
    assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), true);
  });
  test("isAvailable: true when product config populated and host has a target", () => {
    assert.strictEqual(makeDownloader().isAvailable(ClaudeSdkPackage), true);
  });
  test("loadSdkRoot: dev override returns the path unchanged", async () => {
    process.env[AgentHostClaudeSdkRootEnvVar] = "/path/to/dev/sdk";
    const root = await makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(root, "/path/to/dev/sdk");
  });
  test("loadSdkRoot: substitutes {sdkTarget} into urlTemplate", async () => {
    await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.lastPath, `/sdk-${hostSdkTarget}.tgz`);
  });
  test("loadSdkRoot: cache miss \u2192 downloads, extracts, writes sentinel", async () => {
    const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1);
    const extracted = await fsp.readFile(path.join(root, fixture.innerFile), "utf8");
    assert.strictEqual(extracted, fixture.innerContents);
    assert.ok(fs.existsSync(path.join(root, ".complete")));
  });
  test("loadSdkRoot: reports monotonic download progress ending at totalBytes", async () => {
    const downloader = makeDownloader();
    const samples = [];
    disposables.add(downloader.onDidDownloadProgress((p) => samples.push(p)));
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    const tarballSize = (await fsp.stat(fixture.tarballPath)).size;
    assert.ok(samples.length >= 2, "expected at least a started and a completed frame");
    assert.strictEqual(samples[0].phase, "started");
    const completed = samples[samples.length - 1];
    assert.strictEqual(completed.phase, "completed");
    assert.ok(samples.every((s) => s.downloadId === samples[0].downloadId), "all frames share one downloadId");
    assert.ok(samples.every((s) => s.displayName === "Claude"), "all frames carry the brand display name");
    for (let i = 1; i < samples.length; i++) {
      assert.ok(samples[i].receivedBytes >= samples[i - 1].receivedBytes, "receivedBytes must be monotonic");
    }
    assert.strictEqual(completed.totalBytes, tarballSize);
    assert.strictEqual(completed.receivedBytes, tarballSize);
  });
  test("loadSdkRoot: cache hit returns immediately without re-downloading", async () => {
    const downloader = makeDownloader();
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1);
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1, "cache hit should not re-download");
  });
  test("loadSdkRoot: cache dir includes sdkTarget so Universal launches stay separate", async () => {
    const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    const expected = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0", hostSdkTarget);
    assert.strictEqual(root, expected);
  });
  test("loadSdkRoot: missing product config and no env override throws actionable error", async () => {
    await assert.rejects(
      () => makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken()),
      /no `product\.agentSdks\.claude` configured/
    );
  });
  test("loadSdkRoot: urlTemplate with unknown placeholder throws config error", async () => {
    const downloader = makeDownloader({
      urlTemplate: `http://127.0.0.1:${server.port}/sdk-{sdkTaret}.tgz`
    });
    await assert.rejects(
      () => downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      /unknown placeholder \{sdkTaret\}/
    );
    assert.strictEqual(server.requestCount, 0, "should fail before any HTTP call");
  });
  test("loadSdkRoot: cancel before download completes cleans up scratch dir", async function() {
    this.timeout(15e3);
    await server.close();
    const http = await import("http");
    const hangingServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-length": "999999" });
      res.write(Buffer.alloc(8));
    });
    await new Promise((r) => hangingServer.listen(0, "127.0.0.1", () => r()));
    const port = hangingServer.address().port;
    try {
      const downloader = makeDownloader({
        version: "1.0.0",
        urlTemplate: `http://127.0.0.1:${port}/sdk-{sdkTarget}.tgz`
      });
      const cts = disposables.add(new CancellationTokenSource());
      const promise = downloader.loadSdkRoot(ClaudeSdkPackage, cts.token);
      await new Promise((r) => setTimeout(r, 50));
      cts.cancel();
      await assert.rejects(() => promise, /Cancel|cancel|Failed to download/);
      const versionDir = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0");
      const leftover = fs.existsSync(versionDir) ? (await fsp.readdir(versionDir)).filter((f) => f.includes(".tmp.")) : [];
      assert.deepStrictEqual(leftover, []);
    } finally {
      hangingServer.closeAllConnections();
      await new Promise((r) => hangingServer.close(() => r()));
    }
  });
  test("loadSdkRoot: concurrent calls in same process share one download", async () => {
    const downloader = makeDownloader();
    const [a, b, c] = await Promise.all([
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken())
    ]);
    assert.strictEqual(a, b);
    assert.strictEqual(b, c);
    assert.strictEqual(server.requestCount, 1, "concurrent loaders must dedupe");
  });
  test("loadSdkRoot: rename-loser path returns existing cache when winner already published", async () => {
    const downloader = makeDownloader();
    const target = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0", hostSdkTarget);
    await fsp.mkdir(target, { recursive: true });
    await fsp.mkdir(path.dirname(path.join(target, fixture.innerFile)), { recursive: true });
    await fsp.writeFile(path.join(target, fixture.innerFile), fixture.innerContents);
    await fsp.writeFile(path.join(target, ".complete"), "");
    const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(root, target);
    assert.strictEqual(server.requestCount, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRTZGtEb3dubG9hZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBmc3AgZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwVHlwZSBmcm9tICdodHRwJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvbm9kZS9kaXNrRmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L25vZGUvcmVxdWVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZGtEb3dubG9hZGVyLCByZXNvbHZlU2RrVGFyZ2V0LCB0eXBlIElBZ2VudFNka1BhY2thZ2UsIHR5cGUgSUFnZW50U2RrRG93bmxvYWRQcm9ncmVzcyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRTZGtEb3dubG9hZGVyLmpzJztcbmltcG9ydCB7IENsYXVkZVNka1BhY2thZ2UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVBZ2VudFNka1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSVRlc3RTZGtEb3dubG9hZEZpeHR1cmUge1xuXHR0YXJiYWxsUGF0aDogc3RyaW5nO1xuXHRpbm5lckZpbGU6IHN0cmluZzsgLy8gcGF0aCB0aGF0IHNob3VsZCBleGlzdCBpbnNpZGUgdGhlIGV4dHJhY3RlZCByb290XG5cdGlubmVyQ29udGVudHM6IHN0cmluZztcblx0Y2xlYW51cDogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYnVpbGRGaXh0dXJlVGFyYmFsbCgpOiBQcm9taXNlPElUZXN0U2RrRG93bmxvYWRGaXh0dXJlPiB7XG5cdGNvbnN0IHRhciA9IGF3YWl0IGltcG9ydCgndGFyJyk7XG5cdGNvbnN0IHN0YWdpbmdEaXIgPSBhd2FpdCBmc3AubWtkdGVtcChwYXRoLmpvaW4ob3MudG1wZGlyKCksICdzZGstZml4dHVyZS0nKSk7XG5cdGNvbnN0IGlubmVyUmVsID0gcGF0aC5qb2luKCdub2RlX21vZHVsZXMnLCAnQGFudGhyb3BpYy1haScsICdjbGF1ZGUtYWdlbnQtc2RrJywgJ3Nkay5tanMnKTtcblx0Y29uc3QgaW5uZXJDb250ZW50cyA9ICcvLyBmaXh0dXJlIHNkay5tanNcXG5leHBvcnQgZGVmYXVsdCB7fTtcXG4nO1xuXHRhd2FpdCBmc3AubWtkaXIocGF0aC5kaXJuYW1lKHBhdGguam9pbihzdGFnaW5nRGlyLCBpbm5lclJlbCkpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0YXdhaXQgZnNwLndyaXRlRmlsZShwYXRoLmpvaW4oc3RhZ2luZ0RpciwgaW5uZXJSZWwpLCBpbm5lckNvbnRlbnRzKTtcblx0Y29uc3QgdGFyYmFsbFBhdGggPSBwYXRoLmpvaW4oc3RhZ2luZ0RpciwgJ2ZpeHR1cmUudGd6Jyk7XG5cdGF3YWl0IHRhci5jKHsgZmlsZTogdGFyYmFsbFBhdGgsIGN3ZDogc3RhZ2luZ0RpciwgZ3ppcDogdHJ1ZSB9LCBbJ25vZGVfbW9kdWxlcyddKTtcblx0cmV0dXJuIHtcblx0XHR0YXJiYWxsUGF0aCxcblx0XHRpbm5lckZpbGU6IGlubmVyUmVsLFxuXHRcdGlubmVyQ29udGVudHMsXG5cdFx0Y2xlYW51cDogYXN5bmMgKCkgPT4gZnNwLnJtKHN0YWdpbmdEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KSxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElUZXN0U2VydmVyIHtcblx0cG9ydDogbnVtYmVyO1xuXHRyZXF1ZXN0Q291bnQ6IG51bWJlcjtcblx0bGFzdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y2xvc2U6ICgpID0+IFByb21pc2U8dm9pZD47XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0U2VydmVyKGJvZHk6IEJ1ZmZlcik6IFByb21pc2U8SVRlc3RTZXJ2ZXI+IHtcblx0Y29uc3QgaHR0cDogdHlwZW9mIGh0dHBUeXBlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHsgY291bnQ6IDAsIGxhc3RQYXRoOiB1bmRlZmluZWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0Y29uc3Qgc2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRzdGF0ZS5jb3VudCsrO1xuXHRcdFx0c3RhdGUubGFzdFBhdGggPSByZXEudXJsO1xuXHRcdFx0cmVzLnN0YXR1c0NvZGUgPSAyMDA7XG5cdFx0XHRyZXMuc2V0SGVhZGVyKCdjb250ZW50LXR5cGUnLCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyk7XG5cdFx0XHRyZXMuc2V0SGVhZGVyKCdjb250ZW50LWxlbmd0aCcsIFN0cmluZyhib2R5Lmxlbmd0aCkpO1xuXHRcdFx0cmVzLmVuZChib2R5KTtcblx0XHR9KTtcblx0XHRzZXJ2ZXIubGlzdGVuKDAsICcxMjcuMC4wLjEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZGRyID0gc2VydmVyLmFkZHJlc3MoKTtcblx0XHRcdGNvbnN0IHBvcnQgPSB0eXBlb2YgYWRkciA9PT0gJ29iamVjdCcgJiYgYWRkciA/IGFkZHIucG9ydCA6IDA7XG5cdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0Z2V0IHBvcnQoKSB7IHJldHVybiBwb3J0OyB9LFxuXHRcdFx0XHRnZXQgcmVxdWVzdENvdW50KCkgeyByZXR1cm4gc3RhdGUuY291bnQ7IH0sXG5cdFx0XHRcdGdldCBsYXN0UGF0aCgpIHsgcmV0dXJuIHN0YXRlLmxhc3RQYXRoOyB9LFxuXHRcdFx0XHRjbG9zZTogKCkgPT4gbmV3IFByb21pc2UocmVzID0+IHNlcnZlci5jbG9zZSgoKSA9PiByZXMoKSkpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBtYWtlRW52U2VydmljZSh1c2VyRGF0YVBhdGg6IHN0cmluZyk6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Uge1xuXHQvLyBgUmVxdWVzdFNlcnZpY2UucmVxdWVzdGAgY2FsbHMgYGdldFJlc29sdmVkU2hlbGxFbnYoY29uZmlnU2VydmljZSwgbG9nU2VydmljZSwgYXJncywgcHJvY2Vzcy5lbnYpYC5cblx0Ly8gYGZvcmNlLWRpc2FibGUtdXNlci1lbnY6IHRydWVgIHNob3J0LWNpcmN1aXRzIGJlZm9yZSBzcGF3bmluZyBhIHNoZWxsIFx1MjAxNFxuXHQvLyB3aXRob3V0IGl0IGBzaGVsbEVudi50czoxNDBgIHJlZ2lzdGVycyBhIGNhbmNlbGxhdGlvbiBsaXN0ZW5lciB0aGF0XG5cdC8vIGxlYWtzIGFjcm9zcyB0ZXN0cyBhbmQgdHJpcHMgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlLlxuXHRyZXR1cm4geyB1c2VyRGF0YVBhdGgsIGFyZ3M6IHsgJ2ZvcmNlLWRpc2FibGUtdXNlci1lbnYnOiB0cnVlIH0gYXMgbmV2ZXIgfSBhcyB1bmtub3duIGFzIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9kdWN0U2VydmljZShjb25maWc6IHsgdmVyc2lvbjogc3RyaW5nOyB1cmxUZW1wbGF0ZTogc3RyaW5nIH0gfCB1bmRlZmluZWQpOiBJUHJvZHVjdFNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50U2RrczogY29uZmlnID8geyBjbGF1ZGU6IGNvbmZpZyB9IDogdW5kZWZpbmVkLFxuXHR9IGFzIHVua25vd24gYXMgSVByb2R1Y3RTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBtYWtlUmVxdWVzdFNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pOiBSZXF1ZXN0U2VydmljZSB7XG5cdC8vIEJhcmUgUmVxdWVzdFNlcnZpY2U6IG5vIGh0dHAucHJveHkgc2V0dGluZywgbm8gc3BlY2lhbCBjb25maWcuXG5cdC8vIFJlYWRzIHN5c3RlbSBwcm94eSBlbnYgdmFycyAoSFRUUF9QUk9YWSwgSFRUUFNfUFJPWFksIE5PX1BST1hZKSBcdTIwMTQgbm9uZSBzZXRcblx0Ly8gaW4gQ0kgc28gZGlyZWN0IGNvbm5lY3Rpb24gdG8gdGhlIHRlc3QgbG9vcGJhY2sgc2VydmVyIHdvcmtzLlxuXHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBSZXF1ZXN0U2VydmljZShcblx0XHQnbG9jYWwnLFxuXHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRtYWtlRW52U2VydmljZSgnL3VudXNlZC1mb3ItcmVxdWVzdHNlcnZpY2UnKSxcblx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0KSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VGaWxlU2VydmljZShkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IElGaWxlU2VydmljZSB7XG5cdC8vIFJlYWwgRmlsZVNlcnZpY2Ugd2l0aCBEaXNrRmlsZVN5c3RlbVByb3ZpZGVyIGZvciBgZmlsZTovL2AgXHUyMDE0IG1hdGNoZXNcblx0Ly8gdGhlIHdpcmluZyBpbiBgYWdlbnRIb3N0TWFpbi50c2AuIEVhY2ggdGVzdCBnZXRzIGl0cyBvd24gY2xlYW4gaW5zdGFuY2Vcblx0Ly8gc28gcHJvdmlkZXIgcmVnaXN0cmF0aW9ucyBkb24ndCBibGVlZCBhY3Jvc3MgdGVzdHMuXG5cdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZykpO1xuXHRkaXNwb3NhYmxlcy5hZGQoc3ZjLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIobG9nKSkpKTtcblx0cmV0dXJuIHN2Yztcbn1cblxuLyoqXG4gKiBVbml0IHRlc3RzIGZvciB0aGUgcGxhdGZvcm0vYXJjaC9saWJjIFx1MjE5MiBzZGtUYXJnZXQgbWFwcGluZy4gVGhlc2UgY292ZXJcbiAqIHRoZSBjcm9zcy1wcm9kdWN0IHRoZSBkb3dubG9hZGVyIGNhbid0IGVhc2lseSBleGVyY2lzZSAoVW5pdmVyc2FsIHg2NFxuICogbGF1bmNoZXMgZnJvbSBhcm02NCBob3N0cywgbXVzbCBMaW51eCBmcm9tIGEgbWFjT1MgQ0kgcnVubmVyLCBcdTIwMjYpIGJ5XG4gKiBwYXNzaW5nIGEgc3ludGhldGljIGhvc3QgZGlyZWN0bHkgdG8gdGhlIHB1cmUgZnVuY3Rpb24uXG4gKi9cbnN1aXRlKCdyZXNvbHZlU2RrVGFyZ2V0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGZha2VQa2coaGFzU2VwYXJhdGVNdXNsTGludXhQYWNrYWdlOiBib29sZWFuKTogSUFnZW50U2RrUGFja2FnZSB7XG5cdFx0cmV0dXJuIHsgaWQ6ICd0ZXN0JywgZGlzcGxheU5hbWU6ICdUZXN0JywgZGV2T3ZlcnJpZGVFbnZWYXI6ICdYJywgaGFzU2VwYXJhdGVNdXNsTGludXhQYWNrYWdlIH07XG5cdH1cblxuXHR0ZXN0KCdyZXR1cm5zIDxwbGF0Zm9ybT4tPGFyY2g+IGZvciBzdXBwb3J0ZWQgKHBsYXRmb3JtLCBhcmNoKScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdCdkYXJ3aW4teDY0JzogcmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ2RhcndpbicsIGFyY2g6ICd4NjQnLCBsaWJjOiB1bmRlZmluZWQgfSksXG5cdFx0XHQnZGFyd2luLWFybTY0JzogcmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ2RhcndpbicsIGFyY2g6ICdhcm02NCcsIGxpYmM6IHVuZGVmaW5lZCB9KSxcblx0XHRcdCdsaW51eC14NjQnOiByZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2coZmFsc2UpLCB7IHBsYXRmb3JtOiAnbGludXgnLCBhcmNoOiAneDY0JywgbGliYzogJ2dsaWJjJyB9KSxcblx0XHRcdCdsaW51eC1hcm02NCc6IHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyhmYWxzZSksIHsgcGxhdGZvcm06ICdsaW51eCcsIGFyY2g6ICdhcm02NCcsIGxpYmM6ICdnbGliYycgfSksXG5cdFx0XHQnd2luMzIteDY0JzogcmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ3dpbjMyJywgYXJjaDogJ3g2NCcsIGxpYmM6IHVuZGVmaW5lZCB9KSxcblx0XHRcdCd3aW4zMi1hcm02NCc6IHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyhmYWxzZSksIHsgcGxhdGZvcm06ICd3aW4zMicsIGFyY2g6ICdhcm02NCcsIGxpYmM6IHVuZGVmaW5lZCB9KSxcblx0XHR9LCB7XG5cdFx0XHQnZGFyd2luLXg2NCc6ICdkYXJ3aW4teDY0Jyxcblx0XHRcdCdkYXJ3aW4tYXJtNjQnOiAnZGFyd2luLWFybTY0Jyxcblx0XHRcdCdsaW51eC14NjQnOiAnbGludXgteDY0Jyxcblx0XHRcdCdsaW51eC1hcm02NCc6ICdsaW51eC1hcm02NCcsXG5cdFx0XHQnd2luMzIteDY0JzogJ3dpbjMyLXg2NCcsXG5cdFx0XHQnd2luMzItYXJtNjQnOiAnd2luMzItYXJtNjQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRzIC1tdXNsIG9uIG11c2wgTGludXggaWZmIHRoZSBwYWNrYWdlIGhhcyBzZXBhcmF0ZSBtdXNsIFNLVXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKHRydWUpLCB7IHBsYXRmb3JtOiAnbGludXgnLCBhcmNoOiAneDY0JywgbGliYzogJ211c2wnIH0pLFxuXHRcdFx0J2xpbnV4LXg2NC1tdXNsJyxcblx0XHRcdCdjbGF1ZGUtc3R5bGU6IG11c2wgaG9zdCBcdTIxOTIgLW11c2wgc3VmZml4Jyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyhmYWxzZSksIHsgcGxhdGZvcm06ICdsaW51eCcsIGFyY2g6ICd4NjQnLCBsaWJjOiAnbXVzbCcgfSksXG5cdFx0XHQnbGludXgteDY0Jyxcblx0XHRcdCdjb2RleC1zdHlsZTogbXVzbCBob3N0IFx1MjE5MiBubyBzdWZmaXggKHN0YXRpY2FsbHkgbXVzbC1saW5rZWQsIHNpbmdsZSBTS1UpJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyh0cnVlKSwgeyBwbGF0Zm9ybTogJ2xpbnV4JywgYXJjaDogJ3g2NCcsIGxpYmM6ICdnbGliYycgfSksXG5cdFx0XHQnbGludXgteDY0Jyxcblx0XHRcdCdjbGF1ZGUtc3R5bGU6IGdsaWJjIGhvc3QgXHUyMTkyIG5vIHN1ZmZpeCcsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVuc3VwcG9ydGVkIChwbGF0Zm9ybSwgYXJjaCknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyh0cnVlKSwgeyBwbGF0Zm9ybTogJ2xpbnV4JywgYXJjaDogJ2FybWhmJywgbGliYzogJ2dsaWJjJyB9KSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKHRydWUpLCB7IHBsYXRmb3JtOiAnZnJlZWJzZCcgYXMgTm9kZUpTLlBsYXRmb3JtLCBhcmNoOiAneDY0JywgbGliYzogdW5kZWZpbmVkIH0pLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2coZmFsc2UpLCB7IHBsYXRmb3JtOiAnZGFyd2luJywgYXJjaDogJ2lhMzInLCBsaWJjOiB1bmRlZmluZWQgfSksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbi8qKlxuICogSW50ZWdyYXRpb24gdGVzdHMgZm9yIHRoZSBkb3dubG9hZGVyJ3MgbmV0d29yayBcdTIxOTIgY2FjaGUgXHUyMTkyIGV4dHJhY3QgZmxvdy5cbiAqIFRoZXNlIHJ1biBhZ2FpbnN0IHdoYXRldmVyIGBwcm9jZXNzLnBsYXRmb3JtYCB0aGUgdGVzdCBob3N0IGlzIFx1MjAxNCB0aGVcbiAqIHB1cmUgYHJlc29sdmVTZGtUYXJnZXRgIHN1aXRlIGFib3ZlIGNvdmVycyB0aGUgY3Jvc3MtaG9zdCBtYXRyaXguXG4gKi9cbnN1aXRlKCdBZ2VudFNka0Rvd25sb2FkZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdXNlckRhdGFQYXRoOiBzdHJpbmc7XG5cdGxldCBmaXh0dXJlOiBJVGVzdFNka0Rvd25sb2FkRml4dHVyZTtcblx0bGV0IHNlcnZlcjogSVRlc3RTZXJ2ZXI7XG5cdGxldCBvcmlnaW5hbEVudk92ZXJyaWRlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGF0ZXZlciB0aGUgaG9zdCByZXNvbHZlcyB0byBcdTIwMTQgdXNlZCBmb3IgY2FjaGUtZGlyIHBhdGggYXNzZXJ0aW9ucy4gKi9cblx0bGV0IGhvc3RTZGtUYXJnZXQ6IHN0cmluZztcblxuXHQvKiogQSBjYW5jZWxsYXRpb24gdG9rZW4gd2hvc2Ugc291cmNlIGlzIGRpc3Bvc2VkIGluIHRlYXJkb3duLiAqL1xuXHRmdW5jdGlvbiBuZXdUb2tlbigpIHtcblx0XHRjb25zdCBzcmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdHJldHVybiBzcmMudG9rZW47XG5cdH1cblxuXHRzdWl0ZVNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHQvLyBTa2lwIHRoZSBpbnRlZ3JhdGlvbiBzdWl0ZSBvbiBob3N0cyB0aGUgZG93bmxvYWRlciBjYW4ndCByZXNvbHZlXG5cdFx0Ly8gYSB0YXJnZXQgZm9yIChlLmcuIGxpbnV4LWFybWhmKS4gYHJlc29sdmVTZGtUYXJnZXRgIGlzIGNvdmVyZWRcblx0XHQvLyBhYm92ZSBhbmQgZG9lc24ndCBuZWVkIGEgcmVhbCBob3N0LlxuXHRcdGNvbnN0IHRhcmdldCA9IHJlc29sdmVTZGtUYXJnZXQoQ2xhdWRlU2RrUGFja2FnZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRoaXMuc2tpcCgpO1xuXHRcdH1cblx0XHRob3N0U2RrVGFyZ2V0ID0gdGFyZ2V0O1xuXHR9KTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0b3JpZ2luYWxFbnZPdmVycmlkZSA9IHByb2Nlc3MuZW52W0FnZW50SG9zdENsYXVkZVNka1Jvb3RFbnZWYXJdO1xuXHRcdGRlbGV0ZSBwcm9jZXNzLmVudltBZ2VudEhvc3RDbGF1ZGVTZGtSb290RW52VmFyXTtcblx0XHR1c2VyRGF0YVBhdGggPSBhd2FpdCBmc3AubWtkdGVtcChwYXRoLmpvaW4ob3MudG1wZGlyKCksICdzZGstdXNlcmRhdGEtJykpO1xuXHRcdGZpeHR1cmUgPSBhd2FpdCBidWlsZEZpeHR1cmVUYXJiYWxsKCk7XG5cdFx0c2VydmVyID0gYXdhaXQgc3RhcnRTZXJ2ZXIoYXdhaXQgZnNwLnJlYWRGaWxlKGZpeHR1cmUudGFyYmFsbFBhdGgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlcnZlci5jbG9zZSgpO1xuXHRcdGF3YWl0IGZpeHR1cmUuY2xlYW51cCgpO1xuXHRcdGF3YWl0IGZzcC5ybSh1c2VyRGF0YVBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRpZiAob3JpZ2luYWxFbnZPdmVycmlkZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhcl07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb2Nlc3MuZW52W0FnZW50SG9zdENsYXVkZVNka1Jvb3RFbnZWYXJdID0gb3JpZ2luYWxFbnZPdmVycmlkZTtcblx0XHR9XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHVybFRlbXBsYXRlIHJlZmVyZW5jZXMgYHtzZGtUYXJnZXR9YCBzbyB3ZSBleGVyY2lzZSB0aGVcblx0ICogc3Vic3RpdHV0aW9uIHBhdGg7IHRlc3RzIHRoYXQgbmVlZCBhIGN1c3RvbSBVUkwgcGFzcyB1cmxUZW1wbGF0ZVxuXHQgKiBleHBsaWNpdGx5LiBQYXNzIGBwcm9kdWN0Q29uZmlnOiBudWxsYCB0byBvbWl0IHRoZSBhZ2VudFNka3MgYmxvY2tcblx0ICogZW50aXJlbHkgKHRoZSBcIm5vIHByb2R1Y3QgY29uZmlnXCIgY2FzZSkuXG5cdCAqL1xuXHRmdW5jdGlvbiBtYWtlRG93bmxvYWRlcihwcm9kdWN0Q29uZmlnPzogeyB2ZXJzaW9uPzogc3RyaW5nOyB1cmxUZW1wbGF0ZT86IHN0cmluZyB9IHwgbnVsbCkge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHByb2R1Y3RDb25maWcgPT09IG51bGwgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHR2ZXJzaW9uOiBwcm9kdWN0Q29uZmlnPy52ZXJzaW9uID8/ICcxLjAuMCcsXG5cdFx0XHR1cmxUZW1wbGF0ZTogcHJvZHVjdENvbmZpZz8udXJsVGVtcGxhdGUgPz8gYGh0dHA6Ly8xMjcuMC4wLjE6JHtzZXJ2ZXIucG9ydH0vc2RrLXtzZGtUYXJnZXR9LnRnemAsXG5cdFx0fTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNka0Rvd25sb2FkZXIoXG5cdFx0XHRtYWtlRW52U2VydmljZSh1c2VyRGF0YVBhdGgpLFxuXHRcdFx0bWFrZVByb2R1Y3RTZXJ2aWNlKGNvbmZpZyksXG5cdFx0XHRtYWtlUmVxdWVzdFNlcnZpY2UoZGlzcG9zYWJsZXMpLFxuXHRcdFx0bWFrZUZpbGVTZXJ2aWNlKGRpc3Bvc2FibGVzKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgnaXNBdmFpbGFibGU6IGZhbHNlIHdoZW4gbm8gZW52IG92ZXJyaWRlIGFuZCBubyBwcm9kdWN0IGNvbmZpZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFrZURvd25sb2FkZXIobnVsbCkuaXNBdmFpbGFibGUoQ2xhdWRlU2RrUGFja2FnZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBdmFpbGFibGU6IHRydWUgd2hlbiBlbnYgb3ZlcnJpZGUgc2V0JywgKCkgPT4ge1xuXHRcdHByb2Nlc3MuZW52W0FnZW50SG9zdENsYXVkZVNka1Jvb3RFbnZWYXJdID0gJy9zb21lL3BhdGgnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWtlRG93bmxvYWRlcihudWxsKS5pc0F2YWlsYWJsZShDbGF1ZGVTZGtQYWNrYWdlKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQXZhaWxhYmxlOiB0cnVlIHdoZW4gcHJvZHVjdCBjb25maWcgcG9wdWxhdGVkIGFuZCBob3N0IGhhcyBhIHRhcmdldCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFrZURvd25sb2FkZXIoKS5pc0F2YWlsYWJsZShDbGF1ZGVTZGtQYWNrYWdlKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiBkZXYgb3ZlcnJpZGUgcmV0dXJucyB0aGUgcGF0aCB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0cHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhcl0gPSAnL3BhdGgvdG8vZGV2L3Nkayc7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1ha2VEb3dubG9hZGVyKG51bGwpLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LCAnL3BhdGgvdG8vZGV2L3NkaycpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogc3Vic3RpdHV0ZXMge3Nka1RhcmdldH0gaW50byB1cmxUZW1wbGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBtYWtlRG93bmxvYWRlcigpLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIubGFzdFBhdGgsIGAvc2RrLSR7aG9zdFNka1RhcmdldH0udGd6YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiBjYWNoZSBtaXNzIFx1MjE5MiBkb3dubG9hZHMsIGV4dHJhY3RzLCB3cml0ZXMgc2VudGluZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1ha2VEb3dubG9hZGVyKCkubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0Q291bnQsIDEpO1xuXHRcdGNvbnN0IGV4dHJhY3RlZCA9IGF3YWl0IGZzcC5yZWFkRmlsZShwYXRoLmpvaW4ocm9vdCwgZml4dHVyZS5pbm5lckZpbGUpLCAndXRmOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0ZWQsIGZpeHR1cmUuaW5uZXJDb250ZW50cyk7XG5cdFx0YXNzZXJ0Lm9rKGZzLmV4aXN0c1N5bmMocGF0aC5qb2luKHJvb3QsICcuY29tcGxldGUnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogcmVwb3J0cyBtb25vdG9uaWMgZG93bmxvYWQgcHJvZ3Jlc3MgZW5kaW5nIGF0IHRvdGFsQnl0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZG93bmxvYWRlciA9IG1ha2VEb3dubG9hZGVyKCk7XG5cdFx0Y29uc3Qgc2FtcGxlczogSUFnZW50U2RrRG93bmxvYWRQcm9ncmVzc1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvd25sb2FkZXIub25EaWREb3dubG9hZFByb2dyZXNzKHAgPT4gc2FtcGxlcy5wdXNoKHApKSk7XG5cblx0XHRhd2FpdCBkb3dubG9hZGVyLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpO1xuXG5cdFx0Y29uc3QgdGFyYmFsbFNpemUgPSAoYXdhaXQgZnNwLnN0YXQoZml4dHVyZS50YXJiYWxsUGF0aCkpLnNpemU7XG5cdFx0Ly8gT25lIGBzdGFydGVkYCwgXHUyMjY1MSBgcHJvZ3Jlc3NgLCBvbmUgdGVybWluYWwgYGNvbXBsZXRlZGAsIGFsbCBzaGFyaW5nIGFcblx0XHQvLyBzaW5nbGUgZG93bmxvYWRJZCBhbmQgY2FycnlpbmcgdGhlIGJyYW5kIGRpc3BsYXkgbmFtZS5cblx0XHRhc3NlcnQub2soc2FtcGxlcy5sZW5ndGggPj0gMiwgJ2V4cGVjdGVkIGF0IGxlYXN0IGEgc3RhcnRlZCBhbmQgYSBjb21wbGV0ZWQgZnJhbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FtcGxlc1swXS5waGFzZSwgJ3N0YXJ0ZWQnKTtcblx0XHRjb25zdCBjb21wbGV0ZWQgPSBzYW1wbGVzW3NhbXBsZXMubGVuZ3RoIC0gMV07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlZC5waGFzZSwgJ2NvbXBsZXRlZCcpO1xuXHRcdGFzc2VydC5vayhzYW1wbGVzLmV2ZXJ5KHMgPT4gcy5kb3dubG9hZElkID09PSBzYW1wbGVzWzBdLmRvd25sb2FkSWQpLCAnYWxsIGZyYW1lcyBzaGFyZSBvbmUgZG93bmxvYWRJZCcpO1xuXHRcdGFzc2VydC5vayhzYW1wbGVzLmV2ZXJ5KHMgPT4gcy5kaXNwbGF5TmFtZSA9PT0gJ0NsYXVkZScpLCAnYWxsIGZyYW1lcyBjYXJyeSB0aGUgYnJhbmQgZGlzcGxheSBuYW1lJyk7XG5cblx0XHQvLyByZWNlaXZlZEJ5dGVzIGlzIG1vbm90b25pY2FsbHkgbm9uLWRlY3JlYXNpbmcgYW5kIHJlYWNoZXMgdGhlIHRvdGFsXG5cdFx0Ly8gcmVwb3J0ZWQgdmlhIENvbnRlbnQtTGVuZ3RoLlxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgc2FtcGxlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0Lm9rKHNhbXBsZXNbaV0ucmVjZWl2ZWRCeXRlcyA+PSBzYW1wbGVzW2kgLSAxXS5yZWNlaXZlZEJ5dGVzLCAncmVjZWl2ZWRCeXRlcyBtdXN0IGJlIG1vbm90b25pYycpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkLnRvdGFsQnl0ZXMsIHRhcmJhbGxTaXplKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkLnJlY2VpdmVkQnl0ZXMsIHRhcmJhbGxTaXplKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhY2hlIGhpdCByZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGhvdXQgcmUtZG93bmxvYWRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZG93bmxvYWRlciA9IG1ha2VEb3dubG9hZGVyKCk7XG5cdFx0YXdhaXQgZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RDb3VudCwgMSk7XG5cblx0XHQvLyBTZWNvbmQgY2FsbCBoaXRzIHRoZSBjYWNoZS5cblx0XHRhd2FpdCBkb3dubG9hZGVyLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAxLCAnY2FjaGUgaGl0IHNob3VsZCBub3QgcmUtZG93bmxvYWQnKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhY2hlIGRpciBpbmNsdWRlcyBzZGtUYXJnZXQgc28gVW5pdmVyc2FsIGxhdW5jaGVzIHN0YXkgc2VwYXJhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRGlyZWN0IHBhdGggY2hlY2sgdGhhdCB0aGUgY2FjaGUgZGlyIGxheW91dCBlbmNvZGVzIHNka1RhcmdldCBcdTIwMTRcblx0XHQvLyBwYWlycyB3aXRoIHRoZSByZXNvbHZlU2RrVGFyZ2V0IHVuaXQgdGVzdHMgYWJvdmUgdG8gY292ZXIgdGhlXG5cdFx0Ly8gbWFjT1MtVW5pdmVyc2FsIGNhc2UgKHdoaWNoIHdlIGNhbid0IHNpbXVsYXRlIGVuZC10by1lbmQgd2l0aG91dFxuXHRcdC8vIGluamVjdGluZyBhIGhvc3QgdGhlIHByb2R1Y3Rpb24gZG93bmxvYWRlciBkb2Vzbid0IGFjY2VwdCkuXG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1ha2VEb3dubG9hZGVyKCkubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBwYXRoLmpvaW4odXNlckRhdGFQYXRoLCAnYWdlbnQtaG9zdCcsICdzZGstY2FjaGUnLCAnY2xhdWRlJywgJzEuMC4wJywgaG9zdFNka1RhcmdldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IG1pc3NpbmcgcHJvZHVjdCBjb25maWcgYW5kIG5vIGVudiBvdmVycmlkZSB0aHJvd3MgYWN0aW9uYWJsZSBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IG1ha2VEb3dubG9hZGVyKG51bGwpLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpLFxuXHRcdFx0L25vIGBwcm9kdWN0XFwuYWdlbnRTZGtzXFwuY2xhdWRlYCBjb25maWd1cmVkLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogdXJsVGVtcGxhdGUgd2l0aCB1bmtub3duIHBsYWNlaG9sZGVyIHRocm93cyBjb25maWcgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gdnNjb2RlLWRpc3RybyB0eXBvIGd1YXJkOiBge3Nka1RhcmV0fWAgbGVmdCB1bnRvdWNoZWQgYnkgZm9ybWF0MlxuXHRcdC8vIHdvdWxkIG90aGVyd2lzZSB5aWVsZCBhIDQwNCBmcm9tIHRoZSBDRE4gd2l0aCBubyBoaW50IGF0IHRoZVxuXHRcdC8vIHJlYWwgY2F1c2UuXG5cdFx0Y29uc3QgZG93bmxvYWRlciA9IG1ha2VEb3dubG9hZGVyKHtcblx0XHRcdHVybFRlbXBsYXRlOiBgaHR0cDovLzEyNy4wLjAuMToke3NlcnZlci5wb3J0fS9zZGste3Nka1RhcmV0fS50Z3pgLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKSxcblx0XHRcdC91bmtub3duIHBsYWNlaG9sZGVyIFxce3Nka1RhcmV0XFx9Lyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAwLCAnc2hvdWxkIGZhaWwgYmVmb3JlIGFueSBIVFRQIGNhbGwnKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhbmNlbCBiZWZvcmUgZG93bmxvYWQgY29tcGxldGVzIGNsZWFucyB1cCBzY3JhdGNoIGRpcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTVfMDAwKTtcblx0XHQvLyBSZXBsYWNlIHNlcnZlciB3aXRoIG9uZSB0aGF0IGhhbmdzIGZvcmV2ZXIuXG5cdFx0YXdhaXQgc2VydmVyLmNsb3NlKCk7XG5cdFx0Y29uc3QgaHR0cDogdHlwZW9mIGh0dHBUeXBlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0Y29uc3QgaGFuZ2luZ1NlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKChfcmVxLCByZXMpID0+IHtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdjb250ZW50LWxlbmd0aCc6ICc5OTk5OTknIH0pO1xuXHRcdFx0cmVzLndyaXRlKEJ1ZmZlci5hbGxvYyg4KSk7XG5cdFx0XHQvLyBuZXZlciBlbmRcblx0XHR9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IGhhbmdpbmdTZXJ2ZXIubGlzdGVuKDAsICcxMjcuMC4wLjEnLCAoKSA9PiByKCkpKTtcblx0XHRjb25zdCBwb3J0ID0gKGhhbmdpbmdTZXJ2ZXIuYWRkcmVzcygpIGFzIHsgcG9ydDogbnVtYmVyIH0pLnBvcnQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcih7XG5cdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdHVybFRlbXBsYXRlOiBgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L3Nkay17c2RrVGFyZ2V0fS50Z3pgLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGRvd25sb2FkZXIubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgY3RzLnRva2VuKTtcblx0XHRcdC8vIEdpdmUgdGhlIHJlcXVlc3QgYSBtb21lbnQgdG8gc3RhcnQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb21pc2UsIC9DYW5jZWx8Y2FuY2VsfEZhaWxlZCB0byBkb3dubG9hZC8pO1xuXHRcdFx0Ly8gTm8gaGFsZi1leHRyYWN0ZWQgZGlyIGxlZnQgYXJvdW5kLiBUaGUgc2NyYXRjaCBkaXIgbGFuZHMgYXRcblx0XHRcdC8vIDx1c2VyRGF0YVBhdGg+L2FnZW50LWhvc3Qvc2RrLWNhY2hlL2NsYXVkZS8xLjAuMC88dGFyZ2V0Pi50bXAuPHBpZD5cblx0XHRcdC8vIFx1MjAxNCBhIHNpYmxpbmcgb2YgdGhlIHJlc29sdmVkIHRhcmdldCBkaXIgdW5kZXIgdGhlIHZlcnNpb24gZGlyLlxuXHRcdFx0Y29uc3QgdmVyc2lvbkRpciA9IHBhdGguam9pbih1c2VyRGF0YVBhdGgsICdhZ2VudC1ob3N0JywgJ3Nkay1jYWNoZScsICdjbGF1ZGUnLCAnMS4wLjAnKTtcblx0XHRcdGNvbnN0IGxlZnRvdmVyID0gZnMuZXhpc3RzU3luYyh2ZXJzaW9uRGlyKVxuXHRcdFx0XHQ/IChhd2FpdCBmc3AucmVhZGRpcih2ZXJzaW9uRGlyKSkuZmlsdGVyKGYgPT4gZi5pbmNsdWRlcygnLnRtcC4nKSlcblx0XHRcdFx0OiBbXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGVmdG92ZXIsIFtdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gRm9yY2UtY2xvc2UgYW55IHNvY2tldHMgdGhlIHRlc3QgbGVmdCBkYW5nbGluZyBcdTIwMTQgdGhlIGNhbmNlbCBwYXRoXG5cdFx0XHQvLyBvbmx5IHRlYXJzIGRvd24gT1VSIHN0cmVhbXMsIHRoZSB1bmRlcmx5aW5nIGh0dHAgY29ubmVjdGlvbiBvblxuXHRcdFx0Ly8gdGhlIHNlcnZlciBzaWRlIHN0YXlzIGFsaXZlIHVudGlsIHRoZSBPUyByZWFwcyBpdC4gV2l0aG91dCB0aGlzXG5cdFx0XHQvLyBgaGFuZ2luZ1NlcnZlci5jbG9zZSgpYCB3b3VsZCBoYW5nIHdhaXRpbmcgZm9yIHRoZSBzdGlsbC1vcGVuXG5cdFx0XHQvLyBjb25uZWN0aW9uLlxuXHRcdFx0aGFuZ2luZ1NlcnZlci5jbG9zZUFsbENvbm5lY3Rpb25zKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IGhhbmdpbmdTZXJ2ZXIuY2xvc2UoKCkgPT4gcigpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogY29uY3VycmVudCBjYWxscyBpbiBzYW1lIHByb2Nlc3Mgc2hhcmUgb25lIGRvd25sb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcigpO1xuXHRcdGNvbnN0IFthLCBiLCBjXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRvd25sb2FkZXIubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSksXG5cdFx0XHRkb3dubG9hZGVyLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpLFxuXHRcdFx0ZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYSwgYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIsIGMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAxLCAnY29uY3VycmVudCBsb2FkZXJzIG11c3QgZGVkdXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiByZW5hbWUtbG9zZXIgcGF0aCByZXR1cm5zIGV4aXN0aW5nIGNhY2hlIHdoZW4gd2lubmVyIGFscmVhZHkgcHVibGlzaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcigpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHBhdGguam9pbih1c2VyRGF0YVBhdGgsICdhZ2VudC1ob3N0JywgJ3Nkay1jYWNoZScsICdjbGF1ZGUnLCAnMS4wLjAnLCBob3N0U2RrVGFyZ2V0KTtcblxuXHRcdC8vIFByZS1wb3B1bGF0ZSB0aGUgY2FjaGUgYXMgaWYgYSBcIndpbm5lclwiIGFscmVhZHkgZXh0cmFjdGVkIGl0LlxuXHRcdGF3YWl0IGZzcC5ta2Rpcih0YXJnZXQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzcC5ta2RpcihwYXRoLmRpcm5hbWUocGF0aC5qb2luKHRhcmdldCwgZml4dHVyZS5pbm5lckZpbGUpKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnNwLndyaXRlRmlsZShwYXRoLmpvaW4odGFyZ2V0LCBmaXh0dXJlLmlubmVyRmlsZSksIGZpeHR1cmUuaW5uZXJDb250ZW50cyk7XG5cdFx0YXdhaXQgZnNwLndyaXRlRmlsZShwYXRoLmpvaW4odGFyZ2V0LCAnLmNvbXBsZXRlJyksICcnKTtcblxuXHRcdC8vIGxvYWRTZGtSb290IHNob3VsZCBoaXQgdGhlIGNhY2hlIGZpcnN0IGFuZCBuZXZlciBpbnZva2UgdGhlIHNlcnZlci5cblx0XHRjb25zdCByb290ID0gYXdhaXQgZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdCwgdGFyZ2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RDb3VudCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksU0FBUztBQUVyQixZQUFZLFFBQVE7QUFDcEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksVUFBVTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQix3QkFBK0U7QUFDNUcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFXN0MsZUFBZSxzQkFBd0Q7QUFDdEUsUUFBTSxNQUFNLE1BQU0sT0FBTyxLQUFLO0FBQzlCLFFBQU0sYUFBYSxNQUFNLElBQUksUUFBUSxLQUFLLEtBQUssR0FBRyxPQUFPLEdBQUcsY0FBYyxDQUFDO0FBQzNFLFFBQU0sV0FBVyxLQUFLLEtBQUssZ0JBQWdCLGlCQUFpQixvQkFBb0IsU0FBUztBQUN6RixRQUFNLGdCQUFnQjtBQUN0QixRQUFNLElBQUksTUFBTSxLQUFLLFFBQVEsS0FBSyxLQUFLLFlBQVksUUFBUSxDQUFDLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUNsRixRQUFNLElBQUksVUFBVSxLQUFLLEtBQUssWUFBWSxRQUFRLEdBQUcsYUFBYTtBQUNsRSxRQUFNLGNBQWMsS0FBSyxLQUFLLFlBQVksYUFBYTtBQUN2RCxRQUFNLElBQUksRUFBRSxFQUFFLE1BQU0sYUFBYSxLQUFLLFlBQVksTUFBTSxLQUFLLEdBQUcsQ0FBQyxjQUFjLENBQUM7QUFDaEYsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFdBQVc7QUFB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
