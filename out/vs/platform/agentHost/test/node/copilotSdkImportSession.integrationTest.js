import assert from "assert";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { CopilotClient, RuntimeConnection, approveAll } from "@github/copilot-sdk";
import { FileAccess } from "../../../../base/common/network.js";
import { delimiter, dirname, join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { rgDiskPath } from "../../../../base/node/ripgrep.js";
import { MessageKind, ResponsePartKind, TurnState } from "../../common/state/sessionState.js";
import { buildSessionEventLogFromTurns } from "../../node/copilot/buildSessionEvents.js";
import { DiskSessionFsProvider } from "../../node/copilot/diskSessionFsProvider.js";
import { resolveGitHubToken } from "./e2e/harness/agentHostE2ETestHarness.js";
const REAL_SDK_ENABLED = process.env["AGENT_HOST_REAL_SDK"] === "1";
const SESSION_STATE_PATH = "session-state";
function nodeModulesUri() {
  return URI.joinPath(FileAccess.asFileUri(""), "..", "node_modules");
}
async function resolveCopilotCliPath() {
  const nodeModules = URI.joinPath(nodeModulesUri(), "@github").fsPath;
  const entries = await fs.readdir(nodeModules).catch(() => []);
  const candidates = entries.filter((name) => name === "copilot" || name.startsWith("copilot-")).filter((name) => name !== "copilot-sdk").map((name) => join(nodeModules, name, "index.js"));
  for (const candidate of candidates) {
    if (await fs.stat(candidate).then(() => true, () => false)) {
      return candidate;
    }
  }
  throw new Error(`No Copilot CLI found under ${nodeModules} (looked for copilot*/index.js). Install a @github/copilot-<platform> package.`);
}
async function buildCliEnv() {
  const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" });
  delete env["NODE_OPTIONS"];
  delete env["VSCODE_INSPECTOR_OPTIONS"];
  delete env["VSCODE_ESM_ENTRYPOINT"];
  delete env["VSCODE_HANDLES_UNCAUGHT_ERRORS"];
  for (const key of Object.keys(env)) {
    if (key === "ELECTRON_RUN_AS_NODE") {
      continue;
    }
    if (key.startsWith("VSCODE_") || key.startsWith("ELECTRON_")) {
      delete env[key];
    }
  }
  env["COPILOT_CLI_RUN_AS_NODE"] = "1";
  env["USE_BUILTIN_RIPGREP"] = "false";
  env["COPILOT_MCP_APPS"] = "true";
  env["MXC_BIN_DIR"] = URI.joinPath(nodeModulesUri(), "@microsoft", "mxc-sdk", "bin").fsPath;
  const rgDir = dirname(await rgDiskPath());
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const currentPath = env[pathKey];
  env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
  return env;
}
async function walkFiles(root) {
  const out = [];
  const rec = async (dir, rel) => {
    let names;
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const childRel = rel ? join(rel, name) : name;
      const stat = await fs.stat(join(dir, name)).catch(() => void 0);
      if (stat?.isDirectory()) {
        await rec(join(dir, name), childRel);
      } else if (stat) {
        out.push(childRel);
      }
    }
  };
  await rec(root, "");
  return out;
}
class RecordingSessionFsProvider {
  constructor(_inner) {
    this._inner = _inner;
    this.reads = [];
  }
  readFile(path) {
    this.reads.push(`readFile ${path}`);
    return this._inner.readFile(path);
  }
  writeFile(path, content, mode) {
    return this._inner.writeFile(path, content, mode);
  }
  appendFile(path, content, mode) {
    return this._inner.appendFile(path, content, mode);
  }
  exists(path) {
    this.reads.push(`exists ${path}`);
    return this._inner.exists(path);
  }
  stat(path) {
    this.reads.push(`stat ${path}`);
    return this._inner.stat(path);
  }
  mkdir(path, recursive, mode) {
    return this._inner.mkdir(path, recursive, mode);
  }
  readdir(path) {
    this.reads.push(`readdir ${path}`);
    return this._inner.readdir(path);
  }
  readdirWithTypes(path) {
    this.reads.push(`readdirWithTypes ${path}`);
    return this._inner.readdirWithTypes(path);
  }
  rm(path, recursive, force) {
    return this._inner.rm(path, recursive, force);
  }
  rename(src, dest) {
    return this._inner.rename(src, dest);
  }
}
function markdown(content) {
  return { kind: ResponsePartKind.Markdown, id: generateUuid(), content };
}
function userTurn(id, text, response) {
  return {
    id,
    message: { text, origin: { kind: MessageKind.User } },
    responseParts: response ? [markdown(response)] : [],
    usage: void 0,
    state: TurnState.Complete
  };
}
(REAL_SDK_ENABLED ? suite : suite.skip)("Copilot SDK \u2014 import via seeded events.jsonl", function() {
  this.timeout(12e4);
  let client;
  let baseDir;
  suiteSetup(async function() {
    baseDir = await fs.mkdtemp(join(tmpdir(), "ahp-import-"));
    const cliPath = await resolveCopilotCliPath();
    client = new CopilotClient({
      useLoggedInUser: false,
      gitHubToken: resolveGitHubToken(),
      connection: RuntimeConnection.forStdio({ path: cliPath }),
      env: await buildCliEnv(),
      logLevel: "error",
      sessionFs: {
        initialCwd: baseDir,
        sessionStatePath: SESSION_STATE_PATH,
        conventions: process.platform === "win32" ? "windows" : "posix"
      }
    });
    await client.start();
  });
  suiteTeardown(async function() {
    await client?.stop().catch(() => {
    });
    if (baseDir) {
      await fs.rm(baseDir, { recursive: true, force: true }).catch(() => {
      });
    }
  });
  test("seeded conversation resumes as real, editable turns", async function() {
    const sessionId = generateUuid();
    const turns = [
      userTurn("turn-a", "What is 2+2? Reply with just the number.", "It is 4."),
      userTurn("turn-b", "And 3+3? Reply with just the number.", "It is 6.")
    ];
    const sessionDir = join(baseDir, SESSION_STATE_PATH);
    await fs.mkdir(sessionDir, { recursive: true });
    const jsonl = buildSessionEventLogFromTurns(turns, { sessionId, workingDirectory: baseDir });
    await fs.writeFile(join(sessionDir, "events.jsonl"), jsonl, "utf8");
    const provider = new RecordingSessionFsProvider(new DiskSessionFsProvider(baseDir));
    let session;
    try {
      session = await client.resumeSession(sessionId, {
        onPermissionRequest: approveAll,
        createSessionFsProvider: () => provider,
        workingDirectory: baseDir
      });
    } catch (err) {
      assert.fail(`resumeSession failed. SessionFs accesses:
  ${provider.reads.join("\n  ")}
Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const events = await session.getEvents();
      const userMessages = events.filter((e) => e.type === "user.message").map((e) => e.data.content);
      assert.ok(
        userMessages.some((c) => c.includes("What is 2+2?")) && userMessages.some((c) => c.includes("And 3+3?")),
        `expected both imported prompts in reconstructed history, got: ${JSON.stringify(userMessages)}
SessionFs accesses:
  ${provider.reads.join("\n  ")}`
      );
      const firstUser = events.find((e) => e.type === "user.message");
      assert.ok(firstUser, "expected a reconstructed user.message event");
      const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });
      assert.ok(truncate.eventsRemoved >= 1, `expected truncate to remove events, removed ${truncate.eventsRemoved}`);
    } finally {
      await session.disconnect().catch(() => {
      });
    }
  });
});
(REAL_SDK_ENABLED ? suite : suite.skip)("Copilot SDK \u2014 import via configDirectory (native storage)", function() {
  this.timeout(12e4);
  let client;
  let root;
  let configDir;
  let workDir;
  suiteSetup(async function() {
    root = await fs.mkdtemp(join(tmpdir(), "ahp-import-cfg-"));
    configDir = join(root, "config");
    workDir = join(root, "work");
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(workDir, { recursive: true });
    const cliPath = await resolveCopilotCliPath();
    client = new CopilotClient({
      // Deliberately NO `sessionFs`: native on-disk storage, redirected
      // per session via `configDirectory` — the low-risk production seam.
      useLoggedInUser: false,
      gitHubToken: resolveGitHubToken(),
      connection: RuntimeConnection.forStdio({ path: cliPath }),
      env: await buildCliEnv(),
      logLevel: "error"
    });
    await client.start();
  });
  suiteTeardown(async function() {
    await client?.stop().catch(() => {
    });
    if (root) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => {
      });
    }
  });
  test("seeding events.jsonl under configDirectory resumes as real, editable turns", async function() {
    const discoverId = generateUuid();
    try {
      const throwaway = await client.createSession({
        sessionId: discoverId,
        configDirectory: configDir,
        workingDirectory: workDir,
        onPermissionRequest: approveAll
      });
      await throwaway.disconnect().catch(() => {
      });
    } catch {
    }
    const discoveredRel = (await walkFiles(configDir)).find((f) => f.endsWith("events.jsonl") && f.includes(discoverId));
    const importId = generateUuid();
    const turns = [
      userTurn("turn-a", "What is 2+2? Reply with just the number.", "It is 4."),
      userTurn("turn-b", "And 3+3? Reply with just the number.", "It is 6.")
    ];
    const jsonl = buildSessionEventLogFromTurns(turns, { sessionId: importId, workingDirectory: workDir });
    const seedRel = discoveredRel ? discoveredRel.replace(discoverId, importId) : join("session-state", importId, "events.jsonl");
    const seedPath = join(configDir, seedRel);
    await fs.mkdir(dirname(seedPath), { recursive: true });
    await fs.writeFile(seedPath, jsonl, "utf8");
    let session;
    try {
      session = await client.resumeSession(importId, {
        configDirectory: configDir,
        workingDirectory: workDir,
        onPermissionRequest: approveAll
      });
    } catch (err) {
      const tree = (await walkFiles(configDir)).join("\n  ");
      assert.fail(`resumeSession(configDirectory) failed.
Discovered layout: ${discoveredRel ?? "(none \u2014 used assumed layout)"}
Seeded at: ${seedRel}
configDir tree:
  ${tree}
Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const events = await session.getEvents();
      const userMessages = events.filter((e) => e.type === "user.message").map((e) => e.data.content);
      assert.ok(
        userMessages.some((c) => c.includes("What is 2+2?")) && userMessages.some((c) => c.includes("And 3+3?")),
        `expected both imported prompts in reconstructed history, got: ${JSON.stringify(userMessages)}
Seeded at: ${seedRel}`
      );
      const firstUser = events.find((e) => e.type === "user.message");
      assert.ok(firstUser, "expected a reconstructed user.message event");
      const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });
      assert.ok(truncate.eventsRemoved >= 1, `expected truncate to remove events, removed ${truncate.eventsRemoved}`);
    } finally {
      await session.disconnect().catch(() => {
      });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFNka0ltcG9ydFNlc3Npb24uaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBDb3BpbG90IFNESyBpbnRlZ3JhdGlvbiB0ZXN0IGZvciBpbXBvcnRpbmcgYSB0cmFuc2xhdGVkIGNvbnZlcnNhdGlvbi5cbiAqXG4gKiBWYWxpZGF0ZXMgdGhlIGNvcmUgcHJlbWlzZSBvZiBsb2NhbFx1MjE5MkNvcGlsb3QtQ0xJIG1pZ3JhdGlvbjogYSBzeW50aGVzaXplZFxuICogYGV2ZW50cy5qc29ubGAgKGJ1aWx0IGJ5IHtAbGluayBidWlsZFNlc3Npb25FdmVudExvZ0Zyb21UdXJuc30pIHNlZWRlZCB0aHJvdWdoXG4gKiBhIHtAbGluayBEaXNrU2Vzc2lvbkZzUHJvdmlkZXJ9LCB0aGVuIGByZXN1bWVTZXNzaW9uYGQsIHJlY29uc3RpdHV0ZXMgYXMgcmVhbFxuICogU0RLIHR1cm5zIFx1MjAxNCBhbmQgaXMgdGhlcmVmb3JlIGVkaXRhYmxlIChwcm92ZW4gYnkgYGhpc3RvcnkudHJ1bmNhdGVgKS5cbiAqXG4gKiBEaXNhYmxlZCBieSBkZWZhdWx0LiBUbyBydW4gaXQsIHNldCBgQUdFTlRfSE9TVF9SRUFMX1NESz0xYCAoYSBDb3BpbG90IENMSVxuICogcGFja2FnZSBtdXN0IGJlIGluc3RhbGxlZCB1bmRlciBgbm9kZV9tb2R1bGVzL0BnaXRodWIvY29waWxvdCpgKTpcbiAqXG4gKiAgIEFHRU5UX0hPU1RfUkVBTF9TREs9MSAuL3NjcmlwdHMvdGVzdC1pbnRlZ3JhdGlvbi5zaCAtLXJ1biBzcmMvdnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9jb3BpbG90U2RrSW1wb3J0U2Vzc2lvbi5pbnRlZ3JhdGlvblRlc3QudHNcbiAqXG4gKiBBdXRoZW50aWNhdGlvbjogdG9rZW4gZnJvbSBgZ2ggYXV0aCB0b2tlbmAsIG92ZXJyaWRhYmxlIHZpYSBgR0lUSFVCX1RPS0VOYC5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBwcm9taXNlcyBhcyBmcyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IENvcGlsb3RDbGllbnQsIFJ1bnRpbWVDb25uZWN0aW9uLCBhcHByb3ZlQWxsLCB0eXBlIENvcGlsb3RTZXNzaW9uLCB0eXBlIFNlc3Npb25FdmVudCwgdHlwZSBTZXNzaW9uRnNGaWxlSW5mbywgdHlwZSBTZXNzaW9uRnNQcm92aWRlciB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBkaXJuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyByZ0Rpc2tQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3JpcGdyZXAuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFR1cm5TdGF0ZSwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnMgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvYnVpbGRTZXNzaW9uRXZlbnRzLmpzJztcbmltcG9ydCB7IERpc2tTZXNzaW9uRnNQcm92aWRlciB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9kaXNrU2Vzc2lvbkZzUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUdpdEh1YlRva2VuIH0gZnJvbSAnLi9lMmUvaGFybmVzcy9hZ2VudEhvc3RFMkVUZXN0SGFybmVzcy5qcyc7XG5cbi8qKlxuICogRGlyZWN0b3J5IGVudHJ5IHNoYXBlIHJldHVybmVkIGJ5IHtAbGluayBTZXNzaW9uRnNQcm92aWRlci5yZWFkZGlyV2l0aFR5cGVzfS5cbiAqIE1pcnJvcnMgdGhlIFNESydzIGBTZXNzaW9uRnNSZWFkZGlyV2l0aFR5cGVzRW50cnlgLCB3aGljaCBpcyBub3QgcmUtZXhwb3J0ZWRcbiAqIGZyb20gdGhlIHBhY2thZ2Ugcm9vdC5cbiAqL1xudHlwZSBTZXNzaW9uRnNSZWFkZGlyV2l0aFR5cGVzRW50cnkgPSB7IG5hbWU6IHN0cmluZzsgdHlwZTogJ2ZpbGUnIHwgJ2RpcmVjdG9yeScgfTtcblxuY29uc3QgUkVBTF9TREtfRU5BQkxFRCA9IHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX1JFQUxfU0RLJ10gPT09ICcxJztcblxuLyoqIFNlc3Npb24tc3RhdGUgZGlyZWN0b3J5IHRoZSBjbGllbnQgYWR2ZXJ0aXNlcyB0byB0aGUgcnVudGltZSBmb3Igc2Vzc2lvbi1zY29wZWQgZmlsZXMuICovXG5jb25zdCBTRVNTSU9OX1NUQVRFX1BBVEggPSAnc2Vzc2lvbi1zdGF0ZSc7XG5cbi8qKiBgbm9kZV9tb2R1bGVzYCBkaXJlY3RvcnkgdGhhdCBzaGlwcyBhbG9uZ3NpZGUgdGhlIGNvbXBpbGVkIGBvdXQvYC4gKi9cbmZ1bmN0aW9uIG5vZGVNb2R1bGVzVXJpKCk6IFVSSSB7XG5cdHJldHVybiBVUkkuam9pblBhdGgoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLCAnLi4nLCAnbm9kZV9tb2R1bGVzJyk7XG59XG5cbi8qKiBSZXNvbHZlIGEgQ29waWxvdCBDTEkgZW50cnkgcG9pbnQgZnJvbSBgbm9kZV9tb2R1bGVzL0BnaXRodWIvY29waWxvdCpgLiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUNvcGlsb3RDbGlQYXRoKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IG5vZGVNb2R1bGVzID0gVVJJLmpvaW5QYXRoKG5vZGVNb2R1bGVzVXJpKCksICdAZ2l0aHViJykuZnNQYXRoO1xuXHRjb25zdCBlbnRyaWVzID0gYXdhaXQgZnMucmVhZGRpcihub2RlTW9kdWxlcykuY2F0Y2goKCkgPT4gW10gYXMgc3RyaW5nW10pO1xuXHRjb25zdCBjYW5kaWRhdGVzID0gZW50cmllc1xuXHRcdC5maWx0ZXIobmFtZSA9PiBuYW1lID09PSAnY29waWxvdCcgfHwgbmFtZS5zdGFydHNXaXRoKCdjb3BpbG90LScpKVxuXHRcdC5maWx0ZXIobmFtZSA9PiBuYW1lICE9PSAnY29waWxvdC1zZGsnKVxuXHRcdC5tYXAobmFtZSA9PiBqb2luKG5vZGVNb2R1bGVzLCBuYW1lLCAnaW5kZXguanMnKSk7XG5cdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRpZiAoYXdhaXQgZnMuc3RhdChjYW5kaWRhdGUpLnRoZW4oKCkgPT4gdHJ1ZSwgKCkgPT4gZmFsc2UpKSB7XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdH1cblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoYE5vIENvcGlsb3QgQ0xJIGZvdW5kIHVuZGVyICR7bm9kZU1vZHVsZXN9IChsb29rZWQgZm9yIGNvcGlsb3QqL2luZGV4LmpzKS4gSW5zdGFsbCBhIEBnaXRodWIvY29waWxvdC08cGxhdGZvcm0+IHBhY2thZ2UuYCk7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIHN1YnByb2Nlc3MgZW52aXJvbm1lbnQgdGhlIENvcGlsb3QgQ0xJIG5lZWRzIHRvIHN0YXJ0IGluXG4gKiBzdGRpby1zZXJ2ZXIgbW9kZS4gTWlycm9ycyB0aGUgcHJvZHVjdGlvbiB3aXJpbmcgaW4gYGNvcGlsb3RBZ2VudC50c2A6XG4gKiB3aXRob3V0IGBDT1BJTE9UX0NMSV9SVU5fQVNfTk9ERT0xYCB0aGUgQ0xJIGVudHJ5IHBvaW50IHJ1bnMgaW50ZXJhY3RpdmVseVxuICogYW5kIGV4aXRzIChcIkNMSSBzZXJ2ZXIgZXhpdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgMFwiKSwgYW5kIHdpdGhvdXRcbiAqIGBNWENfQklOX0RJUmAgdGhlIHNhbmRib3ggYXV0by1kZXRlY3Rpb24gY2Fubm90IGxvY2F0ZSBpdHMgYmluYXJpZXMuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGJ1aWxkQ2xpRW52KCk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPj4ge1xuXHRjb25zdCBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gPSBPYmplY3QuYXNzaWduKHt9LCBwcm9jZXNzLmVudiwgeyBFTEVDVFJPTl9SVU5fQVNfTk9ERTogJzEnIH0pO1xuXHRkZWxldGUgZW52WydOT0RFX09QVElPTlMnXTtcblx0ZGVsZXRlIGVudlsnVlNDT0RFX0lOU1BFQ1RPUl9PUFRJT05TJ107XG5cdGRlbGV0ZSBlbnZbJ1ZTQ09ERV9FU01fRU5UUllQT0lOVCddO1xuXHRkZWxldGUgZW52WydWU0NPREVfSEFORExFU19VTkNBVUdIVF9FUlJPUlMnXTtcblx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZW52KSkge1xuXHRcdGlmIChrZXkgPT09ICdFTEVDVFJPTl9SVU5fQVNfTk9ERScpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgoJ1ZTQ09ERV8nKSB8fCBrZXkuc3RhcnRzV2l0aCgnRUxFQ1RST05fJykpIHtcblx0XHRcdGRlbGV0ZSBlbnZba2V5XTtcblx0XHR9XG5cdH1cblx0ZW52WydDT1BJTE9UX0NMSV9SVU5fQVNfTk9ERSddID0gJzEnO1xuXHRlbnZbJ1VTRV9CVUlMVElOX1JJUEdSRVAnXSA9ICdmYWxzZSc7XG5cdGVudlsnQ09QSUxPVF9NQ1BfQVBQUyddID0gJ3RydWUnO1xuXG5cdC8vIFBvaW50IHRoZSBNWEMgc2FuZGJveCBhdXRvLWRldGVjdGlvbiBhdCBWUyBDb2RlJ3MgYnVuZGxlZCBiaW5hcmllcy5cblx0ZW52WydNWENfQklOX0RJUiddID0gVVJJLmpvaW5QYXRoKG5vZGVNb2R1bGVzVXJpKCksICdAbWljcm9zb2Z0JywgJ214Yy1zZGsnLCAnYmluJykuZnNQYXRoO1xuXG5cdC8vIE1ha2UgVlMgQ29kZSdzIGJ1aWx0LWluIHJpcGdyZXAgZGlzY292ZXJhYmxlIHRvIHRoZSBDTEkgc3VicHJvY2Vzcy5cblx0Y29uc3QgcmdEaXIgPSBkaXJuYW1lKGF3YWl0IHJnRGlza1BhdGgoKSk7XG5cdGNvbnN0IHBhdGhLZXkgPSBPYmplY3Qua2V5cyhlbnYpLmZpbmQoayA9PiBrLnRvVXBwZXJDYXNlKCkgPT09ICdQQVRIJykgPz8gJ1BBVEgnO1xuXHRjb25zdCBjdXJyZW50UGF0aCA9IGVudltwYXRoS2V5XTtcblx0ZW52W3BhdGhLZXldID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0ke2RlbGltaXRlcn0ke3JnRGlyfWAgOiByZ0RpcjtcblxuXHRyZXR1cm4gZW52O1xufVxuXG4vKiogUmVjdXJzaXZlbHkgbGlzdCBldmVyeSBmaWxlIHVuZGVyIGByb290YCwgcmV0dXJuZWQgYXMgcGF0aHMgcmVsYXRpdmUgdG8gYHJvb3RgLiAqL1xuYXN5bmMgZnVuY3Rpb24gd2Fsa0ZpbGVzKHJvb3Q6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCByZWMgPSBhc3luYyAoZGlyOiBzdHJpbmcsIHJlbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0bGV0IG5hbWVzOiBzdHJpbmdbXTtcblx0XHR0cnkge1xuXHRcdFx0bmFtZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGRpcik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbmFtZSBvZiBuYW1lcykge1xuXHRcdFx0Y29uc3QgY2hpbGRSZWwgPSByZWwgPyBqb2luKHJlbCwgbmFtZSkgOiBuYW1lO1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQoam9pbihkaXIsIG5hbWUpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHN0YXQ/LmlzRGlyZWN0b3J5KCkpIHtcblx0XHRcdFx0YXdhaXQgcmVjKGpvaW4oZGlyLCBuYW1lKSwgY2hpbGRSZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0KSB7XG5cdFx0XHRcdG91dC5wdXNoKGNoaWxkUmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cdGF3YWl0IHJlYyhyb290LCAnJyk7XG5cdHJldHVybiBvdXQ7XG59XG5cbi8qKiBXcmFwcyBhIHByb3ZpZGVyIHRvIHJlY29yZCB0aGUgU2Vzc2lvbkZzIHBhdGhzIHRoZSBydW50aW1lIHRvdWNoZXMgKGRpYWdub3N0aWNzIG9uIGZhaWx1cmUpLiAqL1xuY2xhc3MgUmVjb3JkaW5nU2Vzc2lvbkZzUHJvdmlkZXIgaW1wbGVtZW50cyBTZXNzaW9uRnNQcm92aWRlciB7XG5cdHJlYWRvbmx5IHJlYWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9pbm5lcjogU2Vzc2lvbkZzUHJvdmlkZXIpIHsgfVxuXHRyZWFkRmlsZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyB0aGlzLnJlYWRzLnB1c2goYHJlYWRGaWxlICR7cGF0aH1gKTsgcmV0dXJuIHRoaXMuX2lubmVyLnJlYWRGaWxlKHBhdGgpOyB9XG5cdHdyaXRlRmlsZShwYXRoOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZywgbW9kZT86IG51bWJlcik6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5faW5uZXIud3JpdGVGaWxlKHBhdGgsIGNvbnRlbnQsIG1vZGUpOyB9XG5cdGFwcGVuZEZpbGUocGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcsIG1vZGU/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX2lubmVyLmFwcGVuZEZpbGUocGF0aCwgY29udGVudCwgbW9kZSk7IH1cblx0ZXhpc3RzKHBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4geyB0aGlzLnJlYWRzLnB1c2goYGV4aXN0cyAke3BhdGh9YCk7IHJldHVybiB0aGlzLl9pbm5lci5leGlzdHMocGF0aCk7IH1cblx0c3RhdChwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFNlc3Npb25Gc0ZpbGVJbmZvPiB7IHRoaXMucmVhZHMucHVzaChgc3RhdCAke3BhdGh9YCk7IHJldHVybiB0aGlzLl9pbm5lci5zdGF0KHBhdGgpOyB9XG5cdG1rZGlyKHBhdGg6IHN0cmluZywgcmVjdXJzaXZlOiBib29sZWFuLCBtb2RlPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLl9pbm5lci5ta2RpcihwYXRoLCByZWN1cnNpdmUsIG1vZGUpOyB9XG5cdHJlYWRkaXIocGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4geyB0aGlzLnJlYWRzLnB1c2goYHJlYWRkaXIgJHtwYXRofWApOyByZXR1cm4gdGhpcy5faW5uZXIucmVhZGRpcihwYXRoKTsgfVxuXHRyZWFkZGlyV2l0aFR5cGVzKHBhdGg6IHN0cmluZyk6IFByb21pc2U8U2Vzc2lvbkZzUmVhZGRpcldpdGhUeXBlc0VudHJ5W10+IHsgdGhpcy5yZWFkcy5wdXNoKGByZWFkZGlyV2l0aFR5cGVzICR7cGF0aH1gKTsgcmV0dXJuIHRoaXMuX2lubmVyLnJlYWRkaXJXaXRoVHlwZXMocGF0aCk7IH1cblx0cm0ocGF0aDogc3RyaW5nLCByZWN1cnNpdmU6IGJvb2xlYW4sIGZvcmNlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLl9pbm5lci5ybShwYXRoLCByZWN1cnNpdmUsIGZvcmNlKTsgfVxuXHRyZW5hbWUoc3JjOiBzdHJpbmcsIGRlc3Q6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5faW5uZXIucmVuYW1lKHNyYywgZGVzdCk7IH1cbn1cblxuZnVuY3Rpb24gbWFya2Rvd24oY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0IHtcblx0cmV0dXJuIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50IH07XG59XG5cbmZ1bmN0aW9uIHVzZXJUdXJuKGlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgcmVzcG9uc2U6IHN0cmluZyk6IFR1cm4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHM6IHJlc3BvbnNlID8gW21hcmtkb3duKHJlc3BvbnNlKV0gOiBbXSxcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdH07XG59XG5cbihSRUFMX1NES19FTkFCTEVEID8gc3VpdGUgOiBzdWl0ZS5za2lwKSgnQ29waWxvdCBTREsgXHUyMDE0IGltcG9ydCB2aWEgc2VlZGVkIGV2ZW50cy5qc29ubCcsIGZ1bmN0aW9uICgpIHtcblxuXHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0bGV0IGNsaWVudDogQ29waWxvdENsaWVudDtcblx0bGV0IGJhc2VEaXI6IHN0cmluZztcblxuXHRzdWl0ZVNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRiYXNlRGlyID0gYXdhaXQgZnMubWtkdGVtcChqb2luKHRtcGRpcigpLCAnYWhwLWltcG9ydC0nKSk7XG5cdFx0Y29uc3QgY2xpUGF0aCA9IGF3YWl0IHJlc29sdmVDb3BpbG90Q2xpUGF0aCgpO1xuXHRcdGNsaWVudCA9IG5ldyBDb3BpbG90Q2xpZW50KHtcblx0XHRcdHVzZUxvZ2dlZEluVXNlcjogZmFsc2UsXG5cdFx0XHRnaXRIdWJUb2tlbjogcmVzb2x2ZUdpdEh1YlRva2VuKCksXG5cdFx0XHRjb25uZWN0aW9uOiBSdW50aW1lQ29ubmVjdGlvbi5mb3JTdGRpbyh7IHBhdGg6IGNsaVBhdGggfSksXG5cdFx0XHRlbnY6IGF3YWl0IGJ1aWxkQ2xpRW52KCksXG5cdFx0XHRsb2dMZXZlbDogJ2Vycm9yJyxcblx0XHRcdHNlc3Npb25Gczoge1xuXHRcdFx0XHRpbml0aWFsQ3dkOiBiYXNlRGlyLFxuXHRcdFx0XHRzZXNzaW9uU3RhdGVQYXRoOiBTRVNTSU9OX1NUQVRFX1BBVEgsXG5cdFx0XHRcdGNvbnZlbnRpb25zOiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ3dpbmRvd3MnIDogJ3Bvc2l4Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LnN0YXJ0KCk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGNsaWVudD8uc3RvcCgpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0aWYgKGJhc2VEaXIpIHtcblx0XHRcdGF3YWl0IGZzLnJtKGJhc2VEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2VlZGVkIGNvbnZlcnNhdGlvbiByZXN1bWVzIGFzIHJlYWwsIGVkaXRhYmxlIHR1cm5zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybigndHVybi1hJywgJ1doYXQgaXMgMisyPyBSZXBseSB3aXRoIGp1c3QgdGhlIG51bWJlci4nLCAnSXQgaXMgNC4nKSxcblx0XHRcdHVzZXJUdXJuKCd0dXJuLWInLCAnQW5kIDMrMz8gUmVwbHkgd2l0aCBqdXN0IHRoZSBudW1iZXIuJywgJ0l0IGlzIDYuJyksXG5cdFx0XTtcblxuXHRcdC8vIFNlZWQgdGhlIHN5bnRoZXNpemVkIGV2ZW50IGxvZyBhdCB0aGUgcnVudGltZSdzIHNlc3Npb24tc3RhdGUgcGF0aC5cblx0XHRjb25zdCBzZXNzaW9uRGlyID0gam9pbihiYXNlRGlyLCBTRVNTSU9OX1NUQVRFX1BBVEgpO1xuXHRcdGF3YWl0IGZzLm1rZGlyKHNlc3Npb25EaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGpzb25sID0gYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5OiBiYXNlRGlyIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKHNlc3Npb25EaXIsICdldmVudHMuanNvbmwnKSwganNvbmwsICd1dGY4Jyk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBSZWNvcmRpbmdTZXNzaW9uRnNQcm92aWRlcihuZXcgRGlza1Nlc3Npb25Gc1Byb3ZpZGVyKGJhc2VEaXIpKTtcblxuXHRcdGxldCBzZXNzaW9uOiBDb3BpbG90U2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbiA9IGF3YWl0IGNsaWVudC5yZXN1bWVTZXNzaW9uKHNlc3Npb25JZCwge1xuXHRcdFx0XHRvblBlcm1pc3Npb25SZXF1ZXN0OiBhcHByb3ZlQWxsLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uRnNQcm92aWRlcjogKCkgPT4gcHJvdmlkZXIsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IGJhc2VEaXIsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5mYWlsKGByZXN1bWVTZXNzaW9uIGZhaWxlZC4gU2Vzc2lvbkZzIGFjY2Vzc2VzOlxcbiAgJHtwcm92aWRlci5yZWFkcy5qb2luKCdcXG4gICcpfVxcbkVycm9yOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBTZXNzaW9uRXZlbnRbXSA9IGF3YWl0IHNlc3Npb24uZ2V0RXZlbnRzKCk7XG5cdFx0XHRjb25zdCB1c2VyTWVzc2FnZXMgPSBldmVudHMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAndXNlci5tZXNzYWdlJykubWFwKGUgPT4gZS5kYXRhLmNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHR1c2VyTWVzc2FnZXMuc29tZShjID0+IGMuaW5jbHVkZXMoJ1doYXQgaXMgMisyPycpKSAmJiB1c2VyTWVzc2FnZXMuc29tZShjID0+IGMuaW5jbHVkZXMoJ0FuZCAzKzM/JykpLFxuXHRcdFx0XHRgZXhwZWN0ZWQgYm90aCBpbXBvcnRlZCBwcm9tcHRzIGluIHJlY29uc3RydWN0ZWQgaGlzdG9yeSwgZ290OiAke0pTT04uc3RyaW5naWZ5KHVzZXJNZXNzYWdlcyl9XFxuU2Vzc2lvbkZzIGFjY2Vzc2VzOlxcbiAgJHtwcm92aWRlci5yZWFkcy5qb2luKCdcXG4gICcpfWAsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBFZGl0YWJpbGl0eTogdHJ1bmNhdGluZyBhdCB0aGUgZmlyc3QgaW1wb3J0ZWQgdXNlciB0dXJuIHJlbW92ZXMgaXRcblx0XHRcdC8vIGFuZCBldmVyeXRoaW5nIGFmdGVyIFx1MjAxNCBvbmx5IHBvc3NpYmxlIGJlY2F1c2UgdGhlc2UgYXJlIHJlYWwgZXZlbnRzLlxuXHRcdFx0Y29uc3QgZmlyc3RVc2VyID0gZXZlbnRzLmZpbmQoZSA9PiBlLnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKTtcblx0XHRcdGFzc2VydC5vayhmaXJzdFVzZXIsICdleHBlY3RlZCBhIHJlY29uc3RydWN0ZWQgdXNlci5tZXNzYWdlIGV2ZW50Jyk7XG5cdFx0XHRjb25zdCB0cnVuY2F0ZSA9IGF3YWl0IHNlc3Npb24ucnBjLmhpc3RvcnkudHJ1bmNhdGUoeyBldmVudElkOiBmaXJzdFVzZXIuaWQgfSk7XG5cdFx0XHRhc3NlcnQub2sodHJ1bmNhdGUuZXZlbnRzUmVtb3ZlZCA+PSAxLCBgZXhwZWN0ZWQgdHJ1bmNhdGUgdG8gcmVtb3ZlIGV2ZW50cywgcmVtb3ZlZCAke3RydW5jYXRlLmV2ZW50c1JlbW92ZWR9YCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24uZGlzY29ubmVjdCgpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgUFJPRFVDVElPTiBpbXBvcnQgc2VhbTogYFNlc3Npb25Db25maWdCYXNlLmNvbmZpZ0RpcmVjdG9yeWAuXG4gKlxuICogVW5saWtlIHRoZSBgU2Vzc2lvbkZzUHJvdmlkZXJgIHJvdXRlIGFib3ZlICh3aGljaCByZXF1aXJlcyBmbGlwcGluZyB0aGVcbiAqIGNsaWVudC1sZXZlbCBgc2Vzc2lvbkZzYCBtYXN0ZXIgc3dpdGNoIFx1MjAxNCByb3V0aW5nICphbGwqIHNlc3Npb25zIHRocm91Z2ggYVxuICogcHJvdmlkZXIgYW5kIGRyb3BwaW5nIG5hdGl2ZSBTUUxpdGUvdG9kbyBzdXBwb3J0KSwgYGNvbmZpZ0RpcmVjdG9yeWAgaXMgYVxuICogcGVyLXNlc3Npb24gb3ZlcnJpZGUuIFdlIHNlZWQgYSBzeW50aGVzaXplZCBgZXZlbnRzLmpzb25sYCBhdCB0aGUgQ0xJJ3NcbiAqIG5hdGl2ZSBvbi1kaXNrIGxheW91dCB1bmRlciBhIHBlci1zZXNzaW9uIGBjb25maWdEaXJlY3RvcnlgLCB0aGVuIHJlc3VtZVxuICogd2l0aCBhbiBvcmRpbmFyeSBjbGllbnQgKG5vIGBzZXNzaW9uRnNgKSwgbGVhdmluZyBldmVyeSBvdGhlciBzZXNzaW9uJ3NcbiAqIHN0b3JhZ2UgdW50b3VjaGVkLiBUaGUgdGVzdCBmaXJzdCBjcmVhdGVzIGEgdGhyb3dhd2F5IHNlc3Npb24gdG8gKmRpc2NvdmVyKlxuICogdGhlIGV4YWN0IG5hdGl2ZSBsYXlvdXQsIHRoZW4gc2VlZHMgYSBmcmVzaCBzZXNzaW9uIGF0IHRoYXQgbGF5b3V0LlxuICovXG4oUkVBTF9TREtfRU5BQkxFRCA/IHN1aXRlIDogc3VpdGUuc2tpcCkoJ0NvcGlsb3QgU0RLIFx1MjAxNCBpbXBvcnQgdmlhIGNvbmZpZ0RpcmVjdG9yeSAobmF0aXZlIHN0b3JhZ2UpJywgZnVuY3Rpb24gKCkge1xuXG5cdHRoaXMudGltZW91dCgxMjBfMDAwKTtcblxuXHRsZXQgY2xpZW50OiBDb3BpbG90Q2xpZW50O1xuXHRsZXQgcm9vdDogc3RyaW5nO1xuXHRsZXQgY29uZmlnRGlyOiBzdHJpbmc7XG5cdGxldCB3b3JrRGlyOiBzdHJpbmc7XG5cblx0c3VpdGVTZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cm9vdCA9IGF3YWl0IGZzLm1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2FocC1pbXBvcnQtY2ZnLScpKTtcblx0XHRjb25maWdEaXIgPSBqb2luKHJvb3QsICdjb25maWcnKTtcblx0XHR3b3JrRGlyID0gam9pbihyb290LCAnd29yaycpO1xuXHRcdGF3YWl0IGZzLm1rZGlyKGNvbmZpZ0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnMubWtkaXIod29ya0RpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0Y29uc3QgY2xpUGF0aCA9IGF3YWl0IHJlc29sdmVDb3BpbG90Q2xpUGF0aCgpO1xuXHRcdGNsaWVudCA9IG5ldyBDb3BpbG90Q2xpZW50KHtcblx0XHRcdC8vIERlbGliZXJhdGVseSBOTyBgc2Vzc2lvbkZzYDogbmF0aXZlIG9uLWRpc2sgc3RvcmFnZSwgcmVkaXJlY3RlZFxuXHRcdFx0Ly8gcGVyIHNlc3Npb24gdmlhIGBjb25maWdEaXJlY3RvcnlgIFx1MjAxNCB0aGUgbG93LXJpc2sgcHJvZHVjdGlvbiBzZWFtLlxuXHRcdFx0dXNlTG9nZ2VkSW5Vc2VyOiBmYWxzZSxcblx0XHRcdGdpdEh1YlRva2VuOiByZXNvbHZlR2l0SHViVG9rZW4oKSxcblx0XHRcdGNvbm5lY3Rpb246IFJ1bnRpbWVDb25uZWN0aW9uLmZvclN0ZGlvKHsgcGF0aDogY2xpUGF0aCB9KSxcblx0XHRcdGVudjogYXdhaXQgYnVpbGRDbGlFbnYoKSxcblx0XHRcdGxvZ0xldmVsOiAnZXJyb3InLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC5zdGFydCgpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBjbGllbnQ/LnN0b3AoKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdGlmIChyb290KSB7XG5cdFx0XHRhd2FpdCBmcy5ybShyb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRpbmcgZXZlbnRzLmpzb25sIHVuZGVyIGNvbmZpZ0RpcmVjdG9yeSByZXN1bWVzIGFzIHJlYWwsIGVkaXRhYmxlIHR1cm5zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFBoYXNlIDEgXHUyMDE0IGRpc2NvdmVyIHRoZSBuYXRpdmUgZXZlbnRzLmpzb25sIGxheW91dCBieSBjcmVhdGluZyBhXG5cdFx0Ly8gdGhyb3dhd2F5IHNlc3Npb24gYW5kIGluc3BlY3Rpbmcgd2hhdCB0aGUgQ0xJIHdyaXRlcyBvbiBkaXNrLlxuXHRcdGNvbnN0IGRpc2NvdmVySWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGhyb3dhd2F5ID0gYXdhaXQgY2xpZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRzZXNzaW9uSWQ6IGRpc2NvdmVySWQsXG5cdFx0XHRcdGNvbmZpZ0RpcmVjdG9yeTogY29uZmlnRGlyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrRGlyLFxuXHRcdFx0XHRvblBlcm1pc3Npb25SZXF1ZXN0OiBhcHByb3ZlQWxsLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aHJvd2F3YXkuZGlzY29ubmVjdCgpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBCZXN0LWVmZm9ydCBkaXNjb3Zlcnk7IGZhbGwgYmFjayB0byB0aGUgYXNzdW1lZCBsYXlvdXQgYmVsb3cuXG5cdFx0fVxuXHRcdGNvbnN0IGRpc2NvdmVyZWRSZWwgPSAoYXdhaXQgd2Fsa0ZpbGVzKGNvbmZpZ0RpcikpLmZpbmQoZiA9PiBmLmVuZHNXaXRoKCdldmVudHMuanNvbmwnKSAmJiBmLmluY2x1ZGVzKGRpc2NvdmVySWQpKTtcblxuXHRcdC8vIFBoYXNlIDIgXHUyMDE0IHNlZWQgYSBmcmVzaCBzZXNzaW9uJ3MgZXZlbnRzLmpzb25sIGF0IHRoZSBkaXNjb3ZlcmVkXG5cdFx0Ly8gbGF5b3V0IChvciB0aGUgYXNzdW1lZCBvbmUpIGFuZCByZXN1bWUgaXQgd2l0aCB0aGUgbm9ybWFsIGNsaWVudC5cblx0XHRjb25zdCBpbXBvcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybigndHVybi1hJywgJ1doYXQgaXMgMisyPyBSZXBseSB3aXRoIGp1c3QgdGhlIG51bWJlci4nLCAnSXQgaXMgNC4nKSxcblx0XHRcdHVzZXJUdXJuKCd0dXJuLWInLCAnQW5kIDMrMz8gUmVwbHkgd2l0aCBqdXN0IHRoZSBudW1iZXIuJywgJ0l0IGlzIDYuJyksXG5cdFx0XTtcblx0XHRjb25zdCBqc29ubCA9IGJ1aWxkU2Vzc2lvbkV2ZW50TG9nRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZDogaW1wb3J0SWQsIHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtEaXIgfSk7XG5cdFx0Y29uc3Qgc2VlZFJlbCA9IGRpc2NvdmVyZWRSZWxcblx0XHRcdD8gZGlzY292ZXJlZFJlbC5yZXBsYWNlKGRpc2NvdmVySWQsIGltcG9ydElkKVxuXHRcdFx0OiBqb2luKCdzZXNzaW9uLXN0YXRlJywgaW1wb3J0SWQsICdldmVudHMuanNvbmwnKTtcblx0XHRjb25zdCBzZWVkUGF0aCA9IGpvaW4oY29uZmlnRGlyLCBzZWVkUmVsKTtcblx0XHRhd2FpdCBmcy5ta2RpcihkaXJuYW1lKHNlZWRQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKHNlZWRQYXRoLCBqc29ubCwgJ3V0ZjgnKTtcblxuXHRcdGxldCBzZXNzaW9uOiBDb3BpbG90U2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvbiA9IGF3YWl0IGNsaWVudC5yZXN1bWVTZXNzaW9uKGltcG9ydElkLCB7XG5cdFx0XHRcdGNvbmZpZ0RpcmVjdG9yeTogY29uZmlnRGlyLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrRGlyLFxuXHRcdFx0XHRvblBlcm1pc3Npb25SZXF1ZXN0OiBhcHByb3ZlQWxsLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCB0cmVlID0gKGF3YWl0IHdhbGtGaWxlcyhjb25maWdEaXIpKS5qb2luKCdcXG4gICcpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoYHJlc3VtZVNlc3Npb24oY29uZmlnRGlyZWN0b3J5KSBmYWlsZWQuXFxuRGlzY292ZXJlZCBsYXlvdXQ6ICR7ZGlzY292ZXJlZFJlbCA/PyAnKG5vbmUgXHUyMDE0IHVzZWQgYXNzdW1lZCBsYXlvdXQpJ31cXG5TZWVkZWQgYXQ6ICR7c2VlZFJlbH1cXG5jb25maWdEaXIgdHJlZTpcXG4gICR7dHJlZX1cXG5FcnJvcjogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV2ZW50czogU2Vzc2lvbkV2ZW50W10gPSBhd2FpdCBzZXNzaW9uLmdldEV2ZW50cygpO1xuXHRcdFx0Y29uc3QgdXNlck1lc3NhZ2VzID0gZXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ3VzZXIubWVzc2FnZScpLm1hcChlID0+IGUuZGF0YS5jb250ZW50KTtcblx0XHRcdGFzc2VydC5vayhcblx0XHRcdFx0dXNlck1lc3NhZ2VzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdXaGF0IGlzIDIrMj8nKSkgJiYgdXNlck1lc3NhZ2VzLnNvbWUoYyA9PiBjLmluY2x1ZGVzKCdBbmQgMyszPycpKSxcblx0XHRcdFx0YGV4cGVjdGVkIGJvdGggaW1wb3J0ZWQgcHJvbXB0cyBpbiByZWNvbnN0cnVjdGVkIGhpc3RvcnksIGdvdDogJHtKU09OLnN0cmluZ2lmeSh1c2VyTWVzc2FnZXMpfVxcblNlZWRlZCBhdDogJHtzZWVkUmVsfWAsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaXJzdFVzZXIgPSBldmVudHMuZmluZChlID0+IGUudHlwZSA9PT0gJ3VzZXIubWVzc2FnZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0VXNlciwgJ2V4cGVjdGVkIGEgcmVjb25zdHJ1Y3RlZCB1c2VyLm1lc3NhZ2UgZXZlbnQnKTtcblx0XHRcdGNvbnN0IHRydW5jYXRlID0gYXdhaXQgc2Vzc2lvbi5ycGMuaGlzdG9yeS50cnVuY2F0ZSh7IGV2ZW50SWQ6IGZpcnN0VXNlci5pZCB9KTtcblx0XHRcdGFzc2VydC5vayh0cnVuY2F0ZS5ldmVudHNSZW1vdmVkID49IDEsIGBleHBlY3RlZCB0cnVuY2F0ZSB0byByZW1vdmUgZXZlbnRzLCByZW1vdmVkICR7dHJ1bmNhdGUuZXZlbnRzUmVtb3ZlZH1gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5kaXNjb25uZWN0KCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFxQkEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSxVQUFVO0FBQy9CLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWUsbUJBQW1CLGtCQUEwRztBQUNySixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVcsU0FBUyxZQUFZO0FBQ3pDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWEsa0JBQWtCLGlCQUErQztBQUN2RixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQVNuQyxNQUFNLG1CQUFtQixRQUFRLElBQUkscUJBQXFCLE1BQU07QUFHaEUsTUFBTSxxQkFBcUI7QUFHM0IsU0FBUyxpQkFBc0I7QUFDOUIsU0FBTyxJQUFJLFNBQVMsV0FBVyxVQUFVLEVBQUUsR0FBRyxNQUFNLGNBQWM7QUFDbkU7QUFHQSxlQUFlLHdCQUF5QztBQUN2RCxRQUFNLGNBQWMsSUFBSSxTQUFTLGVBQWUsR0FBRyxTQUFTLEVBQUU7QUFDOUQsUUFBTSxVQUFVLE1BQU0sR0FBRyxRQUFRLFdBQVcsRUFBRSxNQUFNLE1BQU0sQ0FBQyxDQUFhO0FBQ3hFLFFBQU0sYUFBYSxRQUNqQixPQUFPLFVBQVEsU0FBUyxhQUFhLEtBQUssV0FBVyxVQUFVLENBQUMsRUFDaEUsT0FBTyxVQUFRLFNBQVMsYUFBYSxFQUNyQyxJQUFJLFVBQVEsS0FBSyxhQUFhLE1BQU0sVUFBVSxDQUFDO0FBQ2pELGFBQVcsYUFBYSxZQUFZO0FBQ25DLFFBQUksTUFBTSxHQUFHLEtBQUssU0FBUyxFQUFFLEtBQUssTUFBTSxNQUFNLE1BQU0sS0FBSyxHQUFHO0FBQzNELGFBQU87QUFBQSxJQUNS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
