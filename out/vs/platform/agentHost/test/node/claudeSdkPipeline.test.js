import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { buildDefaultChatUri } from "../../common/state/sessionState.js";
import { ClaudeSdkPipeline } from "../../node/claude/claudeSdkPipeline.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import { createZeroDiffComputeService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
class FakeWarmQuery {
  constructor() {
    this.asyncDisposeCount = 0;
    this.closeCount = 0;
    this.queryCallCount = 0;
  }
  query(_prompt) {
    this.queryCallCount++;
    return new ImmediatelyDoneQuery();
  }
  close() {
    this.closeCount++;
  }
  async [Symbol.asyncDispose]() {
    this.asyncDisposeCount++;
  }
}
class ImmediatelyDoneQuery {
  [Symbol.asyncIterator]() {
    return this;
  }
  async next() {
    return { done: true, value: void 0 };
  }
  async return() {
    return { done: true, value: void 0 };
  }
  async throw(err) {
    throw err;
  }
  async setModel() {
  }
  async applyFlagSettings(_settings) {
  }
  async setPermissionMode() {
  }
  async setMcpPermissionModeOverride() {
    return {};
  }
  async interrupt() {
    return void 0;
  }
  streamInput() {
    throw new Error("not modeled");
  }
  stopTask() {
    throw new Error("not modeled");
  }
  reloadSkills() {
    throw new Error("not modeled");
  }
  backgroundTasks() {
    throw new Error("not modeled");
  }
  async close() {
  }
  async [Symbol.asyncDispose]() {
  }
  setMaxThinkingTokens() {
    throw new Error("not modeled");
  }
  initializationResult() {
    throw new Error("not modeled");
  }
  reinitialize() {
    throw new Error("not modeled");
  }
  supportedCommands() {
    throw new Error("not modeled");
  }
  supportedModels() {
    throw new Error("not modeled");
  }
  supportedAgents() {
    throw new Error("not modeled");
  }
  mcpServerStatus() {
    throw new Error("not modeled");
  }
  getContextUsage() {
    throw new Error("not modeled");
  }
  usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET() {
    throw new Error("not modeled");
  }
  reloadPlugins() {
    throw new Error("not modeled");
  }
  accountInfo() {
    throw new Error("not modeled");
  }
  rewindFiles() {
    throw new Error("not modeled");
  }
  readFile() {
    throw new Error("not modeled");
  }
  seedReadState() {
    throw new Error("not modeled");
  }
  reconnectMcpServer() {
    throw new Error("not modeled");
  }
  toggleMcpServer() {
    throw new Error("not modeled");
  }
  setMcpServers() {
    throw new Error("not modeled");
  }
  setSlashCommandHooks() {
    throw new Error("not modeled");
  }
  getServerInfo() {
    throw new Error("not modeled");
  }
  getMcpResources() {
    throw new Error("not modeled");
  }
  readMcpResource() {
    throw new Error("not modeled");
  }
}
class RecordingQuery extends ImmediatelyDoneQuery {
  constructor(_flagSettings, _signal) {
    super();
    this._flagSettings = _flagSettings;
    this._signal = _signal;
  }
  next() {
    if (this._signal.aborted) {
      return Promise.resolve({ done: true, value: void 0 });
    }
    return new Promise((resolve) => {
      this._signal.addEventListener("abort", () => resolve({ done: true, value: void 0 }), { once: true });
    });
  }
  async applyFlagSettings(settings) {
    this._flagSettings.push(settings);
  }
}
class RecordingWarmQuery extends FakeWarmQuery {
  constructor(_signal) {
    super();
    this._signal = _signal;
    this.flagSettings = [];
  }
  query(_prompt) {
    this.queryCallCount++;
    return new RecordingQuery(this.flagSettings, this._signal);
  }
}
function makeControllableQuery() {
  let ended = false;
  let wake;
  const q = Object.assign(new ImmediatelyDoneQuery(), {
    nextCallCount: 0,
    end() {
      ended = true;
      wake?.();
      wake = void 0;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      this.nextCallCount++;
      while (!ended) {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }
      return { done: true, value: void 0 };
    },
    async return() {
      return { done: true, value: void 0 };
    },
    async throw(err) {
      throw err;
    }
  });
  return q;
}
class ControllableWarmQuery extends FakeWarmQuery {
  constructor() {
    super(...arguments);
    this.queries = [];
  }
  query(_prompt) {
    this.queryCallCount++;
    const q = makeControllableQuery();
    this.queries.push(q);
    return q;
  }
}
function createPipeline(disposables, warmOrFactory = new FakeWarmQuery()) {
  const controller = new AbortController();
  const warm = typeof warmOrFactory === "function" ? warmOrFactory(controller.signal) : warmOrFactory;
  const fileService = disposables.add(new FileService(new NullLogService()));
  const fs = disposables.add(new InMemoryFileSystemProvider());
  disposables.add(fileService.registerProvider("file", fs));
  const db = new TestSessionDatabase();
  const dbRef = { object: db, dispose: () => {
  } };
  const services = new ServiceCollection(
    [ILogService, new NullLogService()],
    [IFileService, fileService],
    [IDiffComputeService, createZeroDiffComputeService()]
  );
  const inst = disposables.add(new InstantiationService(services));
  const subagents = disposables.add(new SubagentRegistry());
  const pipeline = disposables.add(inst.createInstance(
    ClaudeSdkPipeline,
    "sess-1",
    URI.parse("claude:/sess-1"),
    URI.parse(buildDefaultChatUri("claude:/sess-1")),
    warm,
    controller,
    dbRef,
    subagents,
    void 0
  ));
  return { pipeline, warm, controller };
}
function makePrompt(uuid, text = uuid) {
  return {
    type: "user",
    uuid: makeUuid(uuid),
    parent_tool_use_id: null,
    message: { role: "user", content: text }
  };
}
function makeUuid(label) {
  const pad = (s, n) => s.padEnd(n, "0").slice(0, n);
  return `${pad(label, 8)}-0000-0000-0000-000000000000`;
}
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}
suite("ClaudeSdkPipeline", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("reloadPlugins", () => {
    test("forwards to the SDK Query", async () => {
      let reloadCallCount = 0;
      class WarmWithReload extends FakeWarmQuery {
        query(_prompt) {
          this.queryCallCount++;
          const q = new ImmediatelyDoneQuery();
          q.reloadPlugins = async () => {
            reloadCallCount++;
            return { commands: [] };
          };
          return q;
        }
      }
      const controller = new AbortController();
      const warm = new WarmWithReload();
      const fileService = disposables.add(new FileService(new NullLogService()));
      const fs = disposables.add(new InMemoryFileSystemProvider());
      disposables.add(fileService.registerProvider("file", fs));
      const db = new TestSessionDatabase();
      const dbRef = { object: db, dispose: () => {
      } };
      const services = new ServiceCollection(
        [ILogService, new NullLogService()],
        [IFileService, fileService],
        [IDiffComputeService, createZeroDiffComputeService()]
      );
      const inst = disposables.add(new InstantiationService(services));
      const subagents = disposables.add(new SubagentRegistry());
      const pipeline = disposables.add(inst.createInstance(
        ClaudeSdkPipeline,
        "sess-2",
        URI.parse("claude:/sess-2"),
        URI.parse(buildDefaultChatUri("claude:/sess-2")),
        warm,
        controller,
        dbRef,
        subagents,
        void 0
      ));
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      await pipeline.reloadPlugins();
      assert.strictEqual(reloadCallCount, 1);
    });
  });
  suite("initial state", () => {
    test("isResumed starts false and isAborted starts false", () => {
      const { pipeline } = createPipeline(disposables);
      assert.strictEqual(pipeline.isResumed, false);
      assert.strictEqual(pipeline.isAborted, false);
    });
  });
  suite("abort", () => {
    test("flips the controller signal and isAborted", () => {
      const { pipeline, controller } = createPipeline(disposables);
      pipeline.abort();
      assert.strictEqual(controller.signal.aborted, true);
      assert.strictEqual(pipeline.isAborted, true);
    });
    test("is idempotent", () => {
      const { pipeline, controller } = createPipeline(disposables);
      pipeline.abort();
      pipeline.abort();
      assert.strictEqual(controller.signal.aborted, true);
    });
    test("send after abort with no rematerializer attached throws a clear error (not a silent hang)", async () => {
      const { pipeline } = createPipeline(disposables);
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => {
          assert.match(String(err), /no rematerializer attached/);
        }
      );
    });
  });
  suite("rematerializer wiring", () => {
    test('after abort, send invokes the attached rematerializer in "recover" mode and clears the rebind flag', async () => {
      const { pipeline } = createPipeline(disposables);
      const reasons = [];
      const built = [];
      const rematerializer = async (reason) => {
        reasons.push(reason);
        const ctl = new AbortController();
        const warm = new FakeWarmQuery();
        built.push({ warm, controller: ctl });
        return { warm, abortController: ctl };
      };
      pipeline.attachRematerializer(rematerializer);
      pipeline.abort();
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      await Promise.resolve();
      assert.deepStrictEqual(reasons, ["recover"]);
      assert.strictEqual(built.length, 1);
      assert.strictEqual(pipeline.isAborted, false, "rebind installed a fresh, non-aborted controller");
    });
    test("rematerializer rejection propagates from send", async () => {
      const { pipeline } = createPipeline(disposables);
      const rebuildErr = new Error("rematerialize failed");
      let calls = 0;
      pipeline.attachRematerializer(async () => {
        calls++;
        throw rebuildErr;
      });
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => assert.strictEqual(err, rebuildErr)
      );
      assert.strictEqual(calls, 1);
    });
    test("abort issued while the rematerializer is still resolving cancels the freshly-built controller (rebind-window race)", async () => {
      const { pipeline } = createPipeline(disposables);
      const releaseRebuild = new DeferredPromise();
      const built = [];
      pipeline.attachRematerializer(async () => {
        const pair = await releaseRebuild.p;
        built.push(pair);
        return { warm: pair.warm, abortController: pair.controller };
      });
      pipeline.abort();
      const sendPromise = pipeline.send(makePrompt("p1"), "turn-A");
      await Promise.resolve();
      pipeline.abort();
      const freshController = new AbortController();
      releaseRebuild.complete({ warm: new FakeWarmQuery(), controller: freshController });
      await sendPromise.then(
        () => assert.fail("expected cancellation after rebind-window abort"),
        (err) => assert.ok(isCancellationError(err), `expected CancellationError, got ${err}`)
      );
      assert.strictEqual(built.length, 1);
      assert.strictEqual(built[0].controller.signal.aborted, true, "fresh controller cancelled before being installed");
      assert.strictEqual(pipeline.isAborted, true);
    });
    test("a rebind hands the consumer loop off to the new query so the post-rebind turn is not lost", async () => {
      const warm1 = new ControllableWarmQuery();
      const { pipeline } = createPipeline(disposables, warm1);
      pipeline.send(makePrompt("p1"), "turn-1").catch(() => {
      });
      await flushMicrotasks();
      const q1 = warm1.queries[0];
      assert.ok(q1.nextCallCount > 0, "consumer loop drains Q1");
      const warm2 = new ControllableWarmQuery();
      pipeline.attachRematerializer(async () => ({ warm: warm2, abortController: new AbortController() }));
      await pipeline.rebindForRestart();
      const q2 = warm2.queries[0];
      assert.strictEqual(q2.nextCallCount, 0, "new query not drained yet \u2014 the old loop is still running");
      q1.end();
      await flushMicrotasks();
      assert.ok(q2.nextCallCount > 0, "consumer loop handed off to the new query after the old one ended");
      q2.end();
      await flushMicrotasks();
    });
  });
  suite("seedCurrentConfig", () => {
    test("seeded values match the post-materialize SDK state, so first send does NOT push a redundant setModel/applyFlagSettings/setPermissionMode", async () => {
      const { pipeline, warm } = createPipeline(disposables);
      pipeline.seedCurrentConfig("claude-sonnet-4-5", "high", "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await Promise.resolve();
      assert.strictEqual(warm.queryCallCount, 1);
    });
  });
  suite("setEffort", () => {
    async function seededHighThenBind(disposables2) {
      let warm;
      const { pipeline } = createPipeline(disposables2, (signal) => warm = new RecordingWarmQuery(signal));
      pipeline.seedCurrentConfig("claude-opus-4-7", "high", "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await flushMicrotasks();
      assert.strictEqual(warm.queryCallCount, 1, "query should be bound after send");
      warm.flagSettings.length = 0;
      return { pipeline, warm };
    }
    test("switching to a model with no effort clears the stale effort via applyFlagSettings({ effortLevel: null })", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort(void 0);
      assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: null }]);
    });
    test("switching between two effort-capable levels pushes the new value", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort("low");
      assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: "low" }]);
    });
    test("re-applying the already-applied effort is a no-op (no redundant SDK call)", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      await pipeline.setEffort("high");
      assert.deepStrictEqual(warm.flagSettings, []);
    });
    test("clearing an already-clear effort is a no-op", async () => {
      let warm;
      const { pipeline } = createPipeline(disposables, (signal) => warm = new RecordingWarmQuery(signal));
      pipeline.seedCurrentConfig("claude-haiku-4-5", void 0, "default");
      pipeline.send(makePrompt("p1"), "turn-A").catch(() => {
      });
      await flushMicrotasks();
      warm.flagSettings.length = 0;
      await pipeline.setEffort(void 0);
      assert.deepStrictEqual(warm.flagSettings, []);
    });
    test("setEffort while awaiting rebind (post-abort) is buffered, not pushed to the dead query, then replayed on rebind", async () => {
      const { pipeline, warm } = await seededHighThenBind(disposables);
      pipeline.abort();
      warm.flagSettings.length = 0;
      await pipeline.setEffort("low");
      assert.deepStrictEqual(warm.flagSettings, [], "effort must not be pushed while needsRebind");
      let warm2;
      pipeline.attachRematerializer(async () => {
        const ctl = new AbortController();
        warm2 = new RecordingWarmQuery(ctl.signal);
        return { warm: warm2, abortController: ctl };
      });
      pipeline.send(makePrompt("p2"), "turn-B").catch(() => {
      });
      await flushMicrotasks();
      assert.deepStrictEqual(warm2.flagSettings, [{ effortLevel: "low" }], "buffered effort replayed on the rebound query");
    });
  });
  suite("dispose", () => {
    test("disposing the pipeline aborts the controller and async-disposes the WarmQuery", async () => {
      const store = new DisposableStore();
      const { pipeline, warm, controller } = createPipeline(store);
      assert.strictEqual(controller.signal.aborted, false);
      assert.strictEqual(warm.asyncDisposeCount, 0);
      pipeline.dispose();
      await Promise.resolve();
      assert.strictEqual(controller.signal.aborted, true);
      assert.strictEqual(warm.asyncDisposeCount, 1);
      store.dispose();
    });
  });
  suite("CancellationError plumbing", () => {
    test("abort + send rejects with a CancellationError-shaped error after the rematerializer runs (when rematerializer rejects with one)", async () => {
      const { pipeline } = createPipeline(disposables);
      pipeline.attachRematerializer(async () => {
        const err = new Error("Canceled");
        err.name = "Canceled";
        throw err;
      });
      pipeline.abort();
      await pipeline.send(makePrompt("p1"), "turn-A").then(
        () => assert.fail("expected rejection"),
        (err) => assert.ok(isCancellationError(err), `expected cancellation, got ${err}`)
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlU2RrUGlwZWxpbmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgUXVlcnksIFNES0NvbnRyb2xJbnRlcnJ1cHRSZXNwb25zZSwgU0RLTWVzc2FnZSwgU0RLVXNlck1lc3NhZ2UsIFdhcm1RdWVyeSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVTZGtQaXBlbGluZSwgSVJlbWF0ZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU2RrUGlwZWxpbmUuanMnO1xuaW1wb3J0IHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVN1YmFnZW50UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlWmVyb0RpZmZDb21wdXRlU2VydmljZSwgVGVzdFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuXG4vLyA9PT09PSBUZXN0IGRvdWJsZXMgPT09PT1cblxuLyoqXG4gKiBgV2FybVF1ZXJ5YCBzdHViIHRoYXQgcmVjb3JkcyBgcXVlcnkoKWAgY2FsbHMgYW5kIGFzeW5jLWRpc3Bvc2UgY291bnQuXG4gKiBUZXN0cyBpbiB0aGlzIGZpbGUgZGVsaWJlcmF0ZWx5IGRvIE5PVCBkcml2ZSB0aGUgY29uc3VtZXIgbG9vcCBcdTIwMTQgdGhleVxuICogZXhlcmNpc2UgdGhlIHN5bmNocm9ub3VzIGxpZmVjeWNsZSBzdXJmYWNlIChhYm9ydCwgZGlzcG9zZSwgcmViaW5kXG4gKiBnYXRpbmcpLiBEcml2aW5nIHRoZSBTREsgbWVzc2FnZSBzdHJlYW0gZW5kLXRvLWVuZCBpcyBjb3ZlcmVkIGJ5XG4gKiBgY2xhdWRlQWdlbnQudGVzdC50c2AuXG4gKlxuICogYHF1ZXJ5KClgIHJldHVybnMgYSBzdHViIGBRdWVyeWAgd2hvc2UgYXN5bmMgaXRlcmF0b3IgaW1tZWRpYXRlbHlcbiAqIHJlc29sdmVzIGRvbmUuIFRoYXQga2VlcHMgdGhlIHBpcGVsaW5lJ3MgY29uc3VtZXIgbG9vcCBmcm9tIGhhbmdpbmdcbiAqIGV2ZW4gd2hlbiBhIHRlc3QgaGFwcGVucyB0byBjYWxsIGBzZW5kKClgLlxuICovXG5jbGFzcyBGYWtlV2FybVF1ZXJ5IGltcGxlbWVudHMgV2FybVF1ZXJ5IHtcblx0YXN5bmNEaXNwb3NlQ291bnQgPSAwO1xuXHRjbG9zZUNvdW50ID0gMDtcblx0cXVlcnlDYWxsQ291bnQgPSAwO1xuXG5cdHF1ZXJ5KF9wcm9tcHQ6IHN0cmluZyB8IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+KTogUXVlcnkge1xuXHRcdHRoaXMucXVlcnlDYWxsQ291bnQrKztcblx0XHRyZXR1cm4gbmV3IEltbWVkaWF0ZWx5RG9uZVF1ZXJ5KCk7XG5cdH1cblx0Y2xvc2UoKTogdm9pZCB7IHRoaXMuY2xvc2VDb3VudCsrOyB9XG5cdGFzeW5jIFtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5hc3luY0Rpc3Bvc2VDb3VudCsrOyB9XG59XG5cbmNsYXNzIEltbWVkaWF0ZWx5RG9uZVF1ZXJ5IGltcGxlbWVudHMgUXVlcnkge1xuXHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXHRhc3luYyBuZXh0KCk6IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8bmV2ZXIsIHZvaWQ+PiB7IHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXR1cm4oKTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxuZXZlciwgdm9pZD4+IHsgcmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9OyB9XG5cdGFzeW5jIHRocm93KGVycjogdW5rbm93bik6IFByb21pc2U8SXRlcmF0b3JSZXN1bHQ8bmV2ZXIsIHZvaWQ+PiB7IHRocm93IGVycjsgfVxuXHRhc3luYyBzZXRNb2RlbCgpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm90IGV4ZXJjaXNlZCBoZXJlICovIH1cblx0YXN5bmMgYXBwbHlGbGFnU2V0dGluZ3MoX3NldHRpbmdzOiBQYXJhbWV0ZXJzPFF1ZXJ5WydhcHBseUZsYWdTZXR0aW5ncyddPlswXSk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGhlcmUgKi8gfVxuXHRhc3luYyBzZXRQZXJtaXNzaW9uTW9kZSgpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm90IGV4ZXJjaXNlZCBoZXJlICovIH1cblx0YXN5bmMgc2V0TWNwUGVybWlzc2lvbk1vZGVPdmVycmlkZSgpOiBQcm9taXNlPHsgd2FybmluZz86IHN0cmluZyB9PiB7IHJldHVybiB7fTsgfVxuXHRhc3luYyBpbnRlcnJ1cHQoKTogUHJvbWlzZTxTREtDb250cm9sSW50ZXJydXB0UmVzcG9uc2UgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzdHJlYW1JbnB1dCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdG9wVGFzaygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWxvYWRTa2lsbHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YmFja2dyb3VuZFRhc2tzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4geyAvKiBub3QgZXhlcmNpc2VkIGhlcmUgKi8gfVxuXHRhc3luYyBbU3ltYm9sLmFzeW5jRGlzcG9zZV0oKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vdCBleGVyY2lzZWQgaGVyZSAqLyB9XG5cdHNldE1heFRoaW5raW5nVG9rZW5zKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdGluaXRpYWxpemF0aW9uUmVzdWx0KCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlaW5pdGlhbGl6ZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdXBwb3J0ZWRDb21tYW5kcygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRzdXBwb3J0ZWRNb2RlbHMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c3VwcG9ydGVkQWdlbnRzKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdG1jcFNlcnZlclN0YXR1cygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRnZXRDb250ZXh0VXNhZ2UoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0dXNhZ2VfRVhQRVJJTUVOVEFMX01BWV9DSEFOR0VfRE9fTk9UX1JFTFlfT05fVEhJU19BUElfWUVUKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHJlbG9hZFBsdWdpbnMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0YWNjb3VudEluZm8oKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmV3aW5kRmlsZXMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVhZEZpbGUoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2VlZFJlYWRTdGF0ZSgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRyZWNvbm5lY3RNY3BTZXJ2ZXIoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0dG9nZ2xlTWNwU2VydmVyKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG5cdHNldE1jcFNlcnZlcnMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0c2V0U2xhc2hDb21tYW5kSG9va3MoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0Z2V0U2VydmVySW5mbygpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignbm90IG1vZGVsZWQnKTsgfVxuXHRnZXRNY3BSZXNvdXJjZXMoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBtb2RlbGVkJyk7IH1cblx0cmVhZE1jcFJlc291cmNlKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdub3QgbW9kZWxlZCcpOyB9XG59XG5cbi8qKlxuICogYFdhcm1RdWVyeWAgd2hvc2UgYm91bmQgYFF1ZXJ5YCByZWNvcmRzIGV2ZXJ5IGBhcHBseUZsYWdTZXR0aW5nc2AgY2FsbCBzb1xuICogdGVzdHMgY2FuIGFzc2VydCB0aGUgZXhhY3QgZWZmb3J0IHBheWxvYWQgcHVzaGVkIHRvIHRoZSBTREsgKGluY2x1ZGluZyB0aGVcbiAqIGB7IGVmZm9ydExldmVsOiBudWxsIH1gIGNsZWFyIGVtaXR0ZWQgd2hlbiBzd2l0Y2hpbmcgdG8gYSBtb2RlbCB0aGF0IGRvZXNcbiAqIG5vdCBzdXBwb3J0IHJlYXNvbmluZyBlZmZvcnQpLlxuICpcbiAqIFVubGlrZSB7QGxpbmsgSW1tZWRpYXRlbHlEb25lUXVlcnl9LCBpdHMgYXN5bmMgaXRlcmF0b3IgQkxPQ0tTIHJhdGhlciB0aGFuXG4gKiBlbmRpbmcgaW1tZWRpYXRlbHkgXHUyMDE0IG90aGVyd2lzZSB0aGUgY29uc3VtZXIgbG9vcCB3b3VsZCBoaXQgXCJzdHJlYW0gZW5kZWRcbiAqIHdpdGhvdXQgYSByZXN1bHRcIiwgbnVsbCBvdXQgYF9xdWVyeWAsIGFuZCB0aGUgcnVudGltZSBzZXR0ZXJzIHdvdWxkIG5vLW9wXG4gKiBiZWZvcmUgdGhlIHRlc3QgY2FuIG9ic2VydmUgdGhlbS4gQSBibG9ja2luZyBpdGVyYXRvciBtb2RlbHMgYSBsaXZlIHR1cm4uXG4gKlxuICogVGhlIGJsb2NrIGlzIGFib3J0LWF3YXJlOiBgbmV4dCgpYCByZXNvbHZlcyBgeyBkb25lOiB0cnVlIH1gIG9uY2UgdGhlXG4gKiBwaXBlbGluZSdzIHtAbGluayBBYm9ydENvbnRyb2xsZXJ9IGZpcmVzIChvbiBkaXNwb3NlL3RlYXJkb3duKSwgc28gdGhlXG4gKiBjb25zdW1lciBsb29wIGFuZCB0aGUgZmlyZS1hbmQtZm9yZ2V0IGBzZW5kKClgIHByb21pc2UgdW53aW5kIGluc3RlYWQgb2ZcbiAqIHBpbm5pbmcgdGhlIHBpcGVsaW5lL3F1ZXJ5IGdyYXBoIGZvciB0aGUgcmVzdCBvZiB0aGUgcnVuLlxuICovXG5jbGFzcyBSZWNvcmRpbmdRdWVyeSBleHRlbmRzIEltbWVkaWF0ZWx5RG9uZVF1ZXJ5IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZmxhZ1NldHRpbmdzOiBBcnJheTxQYXJhbWV0ZXJzPFF1ZXJ5WydhcHBseUZsYWdTZXR0aW5ncyddPlswXT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KSB7IHN1cGVyKCk7IH1cblx0b3ZlcnJpZGUgbmV4dCgpOiBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PG5ldmVyLCB2b2lkPj4ge1xuXHRcdGlmICh0aGlzLl9zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxuZXZlciwgdm9pZD4+KHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5fc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4gcmVzb2x2ZSh7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfSksIHsgb25jZTogdHJ1ZSB9KTtcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBhcHBseUZsYWdTZXR0aW5ncyhzZXR0aW5nczogUGFyYW1ldGVyczxRdWVyeVsnYXBwbHlGbGFnU2V0dGluZ3MnXT5bMF0pOiBQcm9taXNlPHZvaWQ+IHsgdGhpcy5fZmxhZ1NldHRpbmdzLnB1c2goc2V0dGluZ3MpOyB9XG59XG5cbmNsYXNzIFJlY29yZGluZ1dhcm1RdWVyeSBleHRlbmRzIEZha2VXYXJtUXVlcnkge1xuXHRyZWFkb25seSBmbGFnU2V0dGluZ3M6IEFycmF5PFBhcmFtZXRlcnM8UXVlcnlbJ2FwcGx5RmxhZ1NldHRpbmdzJ10+WzBdPiA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3NpZ25hbDogQWJvcnRTaWduYWwpIHsgc3VwZXIoKTsgfVxuXG5cdG92ZXJyaWRlIHF1ZXJ5KF9wcm9tcHQ6IHN0cmluZyB8IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+KTogUXVlcnkge1xuXHRcdHRoaXMucXVlcnlDYWxsQ291bnQrKztcblx0XHRyZXR1cm4gbmV3IFJlY29yZGluZ1F1ZXJ5KHRoaXMuZmxhZ1NldHRpbmdzLCB0aGlzLl9zaWduYWwpO1xuXHR9XG59XG5cbi8qKiBBIHtAbGluayBRdWVyeX0tc2hhcGVkIHN0dWIgd2hvc2UgYXN5bmMgc3RyZWFtIHRoZSB0ZXN0IGVuZHMgb24gZGVtYW5kLiAqL1xudHlwZSBJQ29udHJvbGxhYmxlUXVlcnkgPSBRdWVyeSAmIHtcblx0LyoqIEVuZHMgdGhlIHN0cmVhbSAobW9kZWxzIGEgZGlzcG9zZS1kcml2ZW4gY2xvc2Ugb2YgdGhlIHVuZGVybHlpbmcgcXVlcnkpLiAqL1xuXHRlbmQoKTogdm9pZDtcblx0LyoqIEhvdyBtYW55IHRpbWVzIHRoZSBjb25zdW1lciBsb29wIGhhcyBwdWxsZWQgZnJvbSB0aGlzIHF1ZXJ5J3MgaXRlcmF0b3IuICovXG5cdHJlYWRvbmx5IG5leHRDYWxsQ291bnQ6IG51bWJlcjtcbn07XG5cbi8qKlxuICogQnVpbGRzIGEge0BsaW5rIFF1ZXJ5fSB3aG9zZSBhc3luYyBpdGVyYXRvciBibG9ja3MgKG1vZGVsbGluZyBhIGxpdmUgdHVybilcbiAqIHVudGlsIHtAbGluayBJQ29udHJvbGxhYmxlUXVlcnkuZW5kfSwgYW5kIHJlY29yZHMgaG93IG1hbnkgdGltZXMgdGhlIGNvbnN1bWVyXG4gKiBsb29wIHB1bGxlZCBmcm9tIGl0LiBMZXRzIGEgdGVzdCBob2xkIHRoZSBjb25zdW1lciBsb29wIG9uIG9uZSBxdWVyeSB3aGlsZSBhXG4gKiByZWJpbmQgc3dhcHMgaW4gdGhlIG5leHQsIHRoZW4gb2JzZXJ2ZSB3aGV0aGVyIHRoZSBuZXcgcXVlcnkgZ2V0cyBkcmFpbmVkLlxuICovXG5mdW5jdGlvbiBtYWtlQ29udHJvbGxhYmxlUXVlcnkoKTogSUNvbnRyb2xsYWJsZVF1ZXJ5IHtcblx0bGV0IGVuZGVkID0gZmFsc2U7XG5cdGxldCB3YWtlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IHEgPSBPYmplY3QuYXNzaWduKG5ldyBJbW1lZGlhdGVseURvbmVRdWVyeSgpLCB7XG5cdFx0bmV4dENhbGxDb3VudDogMCxcblx0XHRlbmQoKTogdm9pZCB7IGVuZGVkID0gdHJ1ZTsgd2FrZT8uKCk7IHdha2UgPSB1bmRlZmluZWQ7IH0sXG5cdFx0W1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHsgcmV0dXJuIHRoaXM7IH0sXG5cdFx0YXN5bmMgbmV4dCh0aGlzOiB7IG5leHRDYWxsQ291bnQ6IG51bWJlciB9KTogUHJvbWlzZTxJdGVyYXRvclJlc3VsdDxTREtNZXNzYWdlLCB2b2lkPj4ge1xuXHRcdFx0dGhpcy5uZXh0Q2FsbENvdW50Kys7XG5cdFx0XHR3aGlsZSAoIWVuZGVkKSB7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyB3YWtlID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBkb25lOiB0cnVlLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0fSxcblx0XHRhc3luYyByZXR1cm4oKSB7IHJldHVybiB7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfTsgfSxcblx0XHRhc3luYyB0aHJvdyhlcnI6IHVua25vd24pIHsgdGhyb3cgZXJyOyB9LFxuXHR9KTtcblx0cmV0dXJuIHEgYXMgdW5rbm93biBhcyBJQ29udHJvbGxhYmxlUXVlcnk7XG59XG5cbi8qKiB7QGxpbmsgV2FybVF1ZXJ5fSB0aGF0IGhhbmRzIG91dCB7QGxpbmsgbWFrZUNvbnRyb2xsYWJsZVF1ZXJ5fSBpbnN0YW5jZXMgYW5kIHJlY29yZHMgdGhlbS4gKi9cbmNsYXNzIENvbnRyb2xsYWJsZVdhcm1RdWVyeSBleHRlbmRzIEZha2VXYXJtUXVlcnkge1xuXHRyZWFkb25seSBxdWVyaWVzOiBJQ29udHJvbGxhYmxlUXVlcnlbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHF1ZXJ5KF9wcm9tcHQ6IHN0cmluZyB8IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+KTogUXVlcnkge1xuXHRcdHRoaXMucXVlcnlDYWxsQ291bnQrKztcblx0XHRjb25zdCBxID0gbWFrZUNvbnRyb2xsYWJsZVF1ZXJ5KCk7XG5cdFx0dGhpcy5xdWVyaWVzLnB1c2gocSk7XG5cdFx0cmV0dXJuIHE7XG5cdH1cbn1cblxuLy8gPT09PT0gSGFybmVzcyA9PT09PVxuXG5pbnRlcmZhY2UgSVBpcGVsaW5lSGFybmVzcyB7XG5cdHJlYWRvbmx5IHBpcGVsaW5lOiBDbGF1ZGVTZGtQaXBlbGluZTtcblx0cmVhZG9ubHkgd2FybTogRmFrZVdhcm1RdWVyeTtcblx0cmVhZG9ubHkgY29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQaXBlbGluZShcblx0ZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sXG5cdHdhcm1PckZhY3Rvcnk6IEZha2VXYXJtUXVlcnkgfCAoKHNpZ25hbDogQWJvcnRTaWduYWwpID0+IEZha2VXYXJtUXVlcnkpID0gbmV3IEZha2VXYXJtUXVlcnkoKSxcbik6IElQaXBlbGluZUhhcm5lc3Mge1xuXHRjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRjb25zdCB3YXJtID0gdHlwZW9mIHdhcm1PckZhY3RvcnkgPT09ICdmdW5jdGlvbicgPyB3YXJtT3JGYWN0b3J5KGNvbnRyb2xsZXIuc2lnbmFsKSA6IHdhcm1PckZhY3Rvcnk7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRjb25zdCBmcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZnMpKTtcblxuXHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdGNvbnN0IGRiUmVmOiBJUmVmZXJlbmNlPElTZXNzaW9uRGF0YWJhc2U+ID0geyBvYmplY3Q6IGRiLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblxuXHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRbSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpXSxcblx0XHRbSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZV0sXG5cdFx0W0lEaWZmQ29tcHV0ZVNlcnZpY2UsIGNyZWF0ZVplcm9EaWZmQ29tcHV0ZVNlcnZpY2UoKV0sXG5cdCk7XG5cdGNvbnN0IGluc3Q6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0Y29uc3Qgc3ViYWdlbnRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXHRjb25zdCBwaXBlbGluZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0LmNyZWF0ZUluc3RhbmNlKFxuXHRcdENsYXVkZVNka1BpcGVsaW5lLFxuXHRcdCdzZXNzLTEnLFxuXHRcdFVSSS5wYXJzZSgnY2xhdWRlOi9zZXNzLTEnKSxcblx0XHRVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaSgnY2xhdWRlOi9zZXNzLTEnKSksXG5cdFx0d2FybSxcblx0XHRjb250cm9sbGVyLFxuXHRcdGRiUmVmLFxuXHRcdHN1YmFnZW50cyxcblx0XHR1bmRlZmluZWQsXG5cdCkpO1xuXHRyZXR1cm4geyBwaXBlbGluZSwgd2FybSwgY29udHJvbGxlciB9O1xufVxuXG5mdW5jdGlvbiBtYWtlUHJvbXB0KHV1aWQ6IHN0cmluZywgdGV4dDogc3RyaW5nID0gdXVpZCk6IFNES1VzZXJNZXNzYWdlIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiAndXNlcicsXG5cdFx0dXVpZDogbWFrZVV1aWQodXVpZCksXG5cdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdG1lc3NhZ2U6IHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiB0ZXh0IH0sXG5cdH07XG59XG5cbi8qKiBCdWlsZCBhIFNESy1zaGFwZWQgVVVJRCBmcm9tIGEgc2hvcnQgbGFiZWwgc28gdGVzdCBpZHMgc3RheSByZWFkYWJsZS4gKi9cbmZ1bmN0aW9uIG1ha2VVdWlkKGxhYmVsOiBzdHJpbmcpOiBgJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfWAge1xuXHRjb25zdCBwYWQgPSAoczogc3RyaW5nLCBuOiBudW1iZXIpID0+IHMucGFkRW5kKG4sICcwJykuc2xpY2UoMCwgbik7XG5cdHJldHVybiBgJHtwYWQobGFiZWwsIDgpfS0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDBgO1xufVxuXG4vKipcbiAqIExldCB0aGUgcGlwZWxpbmUncyBmaXJlLWFuZC1mb3JnZXQgYHNlbmQoKWAgcnVuIGZhciBlbm91Z2ggdG8gYmluZCB0aGVcbiAqIFF1ZXJ5IGFuZCBmaW5pc2ggaXRzIHN5bmNocm9ub3VzIGBfcmVwbGF5Q3VycmVudENvbmZpZ2AgKGEgbm8tb3Agd2hlbiB0aGVcbiAqIHNlZWRlZCBjb25maWcgYWxyZWFkeSBtYXRjaGVzKS4gQSBmZXcgbWljcm90YXNrIHR1cm5zIGlzIGVub3VnaDsgdGhlIHN0dWJcbiAqIFF1ZXJ5IG5ldmVyIGF3YWl0cyByZWFsIEkvTy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZmx1c2hNaWNyb3Rhc2tzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbnN1aXRlKCdDbGF1ZGVTZGtQaXBlbGluZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdyZWxvYWRQbHVnaW5zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgdG8gdGhlIFNESyBRdWVyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCByZWxvYWRDYWxsQ291bnQgPSAwO1xuXHRcdFx0Y2xhc3MgV2FybVdpdGhSZWxvYWQgZXh0ZW5kcyBGYWtlV2FybVF1ZXJ5IHtcblx0XHRcdFx0b3ZlcnJpZGUgcXVlcnkoX3Byb21wdDogc3RyaW5nIHwgQXN5bmNJdGVyYWJsZTxTREtVc2VyTWVzc2FnZT4pOiBRdWVyeSB7XG5cdFx0XHRcdFx0dGhpcy5xdWVyeUNhbGxDb3VudCsrO1xuXHRcdFx0XHRcdGNvbnN0IHEgPSBuZXcgSW1tZWRpYXRlbHlEb25lUXVlcnkoKTtcblx0XHRcdFx0XHQocSBhcyB1bmtub3duIGFzIHsgcmVsb2FkUGx1Z2luczogKCkgPT4gUHJvbWlzZTx7IGNvbW1hbmRzOiB7IG5hbWU6IHN0cmluZyB9W10gfT4gfSkucmVsb2FkUGx1Z2lucyA9XG5cdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7IHJlbG9hZENhbGxDb3VudCsrOyByZXR1cm4geyBjb21tYW5kczogW10gfTsgfTtcblx0XHRcdFx0XHRyZXR1cm4gcTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IHdhcm0gPSBuZXcgV2FybVdpdGhSZWxvYWQoKTtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgZnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBmcykpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgZGJSZWY6IElSZWZlcmVuY2U8SVNlc3Npb25EYXRhYmFzZT4gPSB7IG9iamVjdDogZGIsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCldLFxuXHRcdFx0XHRbSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZV0sXG5cdFx0XHRcdFtJRGlmZkNvbXB1dGVTZXJ2aWNlLCBjcmVhdGVaZXJvRGlmZkNvbXB1dGVTZXJ2aWNlKCldLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGluc3Q6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU3ViYWdlbnRSZWdpc3RyeSgpKTtcblx0XHRcdGNvbnN0IHBpcGVsaW5lID0gZGlzcG9zYWJsZXMuYWRkKGluc3QuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENsYXVkZVNka1BpcGVsaW5lLFxuXHRcdFx0XHQnc2Vzcy0yJyxcblx0XHRcdFx0VVJJLnBhcnNlKCdjbGF1ZGU6L3Nlc3MtMicpLFxuXHRcdFx0XHRVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaSgnY2xhdWRlOi9zZXNzLTInKSksXG5cdFx0XHRcdHdhcm0sXG5cdFx0XHRcdGNvbnRyb2xsZXIsXG5cdFx0XHRcdGRiUmVmLFxuXHRcdFx0XHRzdWJhZ2VudHMsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCkpO1xuXHRcdFx0Ly8gQmluZCB0aGUgcXVlcnkgYnkgaXNzdWluZyBhIHNlbmQgKGl0ZXJhdG9yIGNsb3NlcyBpbW1lZGlhdGVseSkuXG5cdFx0XHRwaXBlbGluZS5zZW5kKG1ha2VQcm9tcHQoJ3AxJyksICd0dXJuLUEnKS5jYXRjaCgoKSA9PiB7IC8qIGV4cGVjdGVkICovIH0pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdGF3YWl0IHBpcGVsaW5lLnJlbG9hZFBsdWdpbnMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWxvYWRDYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5pdGlhbCBzdGF0ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2lzUmVzdW1lZCBzdGFydHMgZmFsc2UgYW5kIGlzQWJvcnRlZCBzdGFydHMgZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlwZWxpbmUuaXNSZXN1bWVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlwZWxpbmUuaXNBYm9ydGVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhYm9ydCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZsaXBzIHRoZSBjb250cm9sbGVyIHNpZ25hbCBhbmQgaXNBYm9ydGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgY29udHJvbGxlciB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0cGlwZWxpbmUuYWJvcnQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLnNpZ25hbC5hYm9ydGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaXBlbGluZS5pc0Fib3J0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgaWRlbXBvdGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUsIGNvbnRyb2xsZXIgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZCBhZnRlciBhYm9ydCB3aXRoIG5vIHJlbWF0ZXJpYWxpemVyIGF0dGFjaGVkIHRocm93cyBhIGNsZWFyIGVycm9yIChub3QgYSBzaWxlbnQgaGFuZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykudGhlbihcblx0XHRcdFx0KCkgPT4gYXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlamVjdGlvbicpLFxuXHRcdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRcdC8vIF9yZWJpbmRRdWVyeSB0aHJvd3Mgc3luY2hyb25vdXNseSB3aGVuIG5vIHJlbWF0ZXJpYWxpemVyIGlzIGF0dGFjaGVkXG5cdFx0XHRcdFx0YXNzZXJ0Lm1hdGNoKFN0cmluZyhlcnIpLCAvbm8gcmVtYXRlcmlhbGl6ZXIgYXR0YWNoZWQvKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW1hdGVyaWFsaXplciB3aXJpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhZnRlciBhYm9ydCwgc2VuZCBpbnZva2VzIHRoZSBhdHRhY2hlZCByZW1hdGVyaWFsaXplciBpbiBcInJlY292ZXJcIiBtb2RlIGFuZCBjbGVhcnMgdGhlIHJlYmluZCBmbGFnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgcmVhc29uczogQXJyYXk8J3Jlc3RhcnQnIHwgJ3JlY292ZXInPiA9IFtdO1xuXHRcdFx0Y29uc3QgYnVpbHQ6IHsgd2FybTogRmFrZVdhcm1RdWVyeTsgY29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVtYXRlcmlhbGl6ZXI6IElSZW1hdGVyaWFsaXplciA9IGFzeW5jIChyZWFzb24pID0+IHtcblx0XHRcdFx0cmVhc29ucy5wdXNoKHJlYXNvbik7XG5cdFx0XHRcdGNvbnN0IGN0bCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdFx0Y29uc3Qgd2FybSA9IG5ldyBGYWtlV2FybVF1ZXJ5KCk7XG5cdFx0XHRcdGJ1aWx0LnB1c2goeyB3YXJtLCBjb250cm9sbGVyOiBjdGwgfSk7XG5cdFx0XHRcdHJldHVybiB7IHdhcm0sIGFib3J0Q29udHJvbGxlcjogY3RsIH07XG5cdFx0XHR9O1xuXHRcdFx0cGlwZWxpbmUuYXR0YWNoUmVtYXRlcmlhbGl6ZXIocmVtYXRlcmlhbGl6ZXIpO1xuXG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0Ly8gRG9uJ3QgYXdhaXQgXHUyMDE0IHRoZSBjb25zdW1lciBsb29wIG9uIHRoZSByZWJvdW5kIHF1ZXJ5IHdpbGwgZW5kXG5cdFx0XHQvLyBhbG1vc3QgaW1tZWRpYXRlbHksIGJ1dCB0aGUgbWF0Y2hpbmcgU0RLIGByZXN1bHRgIG5ldmVyXG5cdFx0XHQvLyBhcnJpdmVzIChGYWtlV2FybVF1ZXJ5J3MgaXRlcmF0b3IganVzdCBjbG9zZXMpLCBzbyB0aGVcblx0XHRcdC8vIGRlZmVycmVkIGVuZHMgdXAgZmFpbGVkIHdpdGggdGhlIFwic3RyZWFtIGVuZGVkIHdpdGhvdXRcblx0XHRcdC8vIHJlc3VsdFwiIGd1YXJkLiBXZSBvbmx5IGNhcmUgdGhhdCB0aGUgcmVtYXRlcmlhbGl6ZXIgcmFuLlxuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykuY2F0Y2goKCkgPT4geyAvKiBleHBlY3RlZCAqLyB9KTtcblx0XHRcdC8vIFlpZWxkIGEgbWljcm90YXNrIGZvciB0aGUgYXN5bmMgcmViaW5kIHRvIGNhbGwgdGhlIGNhbGxiYWNrLlxuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFzb25zLCBbJ3JlY292ZXInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaXBlbGluZS5pc0Fib3J0ZWQsIGZhbHNlLCAncmViaW5kIGluc3RhbGxlZCBhIGZyZXNoLCBub24tYWJvcnRlZCBjb250cm9sbGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1hdGVyaWFsaXplciByZWplY3Rpb24gcHJvcGFnYXRlcyBmcm9tIHNlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCByZWJ1aWxkRXJyID0gbmV3IEVycm9yKCdyZW1hdGVyaWFsaXplIGZhaWxlZCcpO1xuXHRcdFx0bGV0IGNhbGxzID0gMDtcblx0XHRcdHBpcGVsaW5lLmF0dGFjaFJlbWF0ZXJpYWxpemVyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdFx0dGhyb3cgcmVidWlsZEVycjtcblx0XHRcdH0pO1xuXG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykudGhlbihcblx0XHRcdFx0KCkgPT4gYXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlamVjdGlvbicpLFxuXHRcdFx0XHRlcnIgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKGVyciwgcmVidWlsZEVyciksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fib3J0IGlzc3VlZCB3aGlsZSB0aGUgcmVtYXRlcmlhbGl6ZXIgaXMgc3RpbGwgcmVzb2x2aW5nIGNhbmNlbHMgdGhlIGZyZXNobHktYnVpbHQgY29udHJvbGxlciAocmViaW5kLXdpbmRvdyByYWNlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IHJlbGVhc2VSZWJ1aWxkID0gbmV3IERlZmVycmVkUHJvbWlzZTx7IHdhcm06IEZha2VXYXJtUXVlcnk7IGNvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlciB9PigpO1xuXHRcdFx0Y29uc3QgYnVpbHQ6IHsgd2FybTogRmFrZVdhcm1RdWVyeTsgY29udHJvbGxlcjogQWJvcnRDb250cm9sbGVyIH1bXSA9IFtdO1xuXHRcdFx0cGlwZWxpbmUuYXR0YWNoUmVtYXRlcmlhbGl6ZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYWlyID0gYXdhaXQgcmVsZWFzZVJlYnVpbGQucDtcblx0XHRcdFx0YnVpbHQucHVzaChwYWlyKTtcblx0XHRcdFx0cmV0dXJuIHsgd2FybTogcGFpci53YXJtLCBhYm9ydENvbnRyb2xsZXI6IHBhaXIuY29udHJvbGxlciB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgcmViaW5kIGJ5IGFib3J0aW5nIHRoZSBzZWVkIGNvbnRyb2xsZXIgYW5kIHN0YXJ0aW5nIGEgc2VuZC5cblx0XHRcdC8vIFRoZSBzZW5kIGF3YWl0cyBfcmViaW5kUXVlcnksIHdoaWNoIGF3YWl0cyByZWxlYXNlUmVidWlsZC5cblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHRjb25zdCBzZW5kUHJvbWlzZSA9IHBpcGVsaW5lLnNlbmQobWFrZVByb21wdCgncDEnKSwgJ3R1cm4tQScpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7IC8vIGxldCBfcmViaW5kUXVlcnkgc3RhcnQgaXRzIGF3YWl0XG5cblx0XHRcdC8vIElzc3VlIGEgU0VDT05EIGFib3J0IHdoaWxlIHJlYmluZCBpcyBpbi1mbGlnaHQuIFRoaXMgbXVzdFxuXHRcdFx0Ly8gbGFuZCBvbiB0aGUgbm90LXlldC1pbnN0YWxsZWQgY29udHJvbGxlciBcdTIwMTQgYWJvcnQgcmV0dXJuaW5nXG5cdFx0XHQvLyBlYXJseSBhcyBpZGVtcG90ZW50IGhlcmUgd291bGQgc2lsZW50bHkgZHJvcCB0aGUgdXNlcidzXG5cdFx0XHQvLyBjYW5jZWwuXG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXG5cdFx0XHQvLyBOb3cgcmVsZWFzZSB0aGUgcmVtYXRlcmlhbGl6ZXIgd2l0aCBhIGZyZXNoLCBub24tYWJvcnRlZCBjb250cm9sbGVyLlxuXHRcdFx0Y29uc3QgZnJlc2hDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0cmVsZWFzZVJlYnVpbGQuY29tcGxldGUoeyB3YXJtOiBuZXcgRmFrZVdhcm1RdWVyeSgpLCBjb250cm9sbGVyOiBmcmVzaENvbnRyb2xsZXIgfSk7XG5cblx0XHRcdGF3YWl0IHNlbmRQcm9taXNlLnRoZW4oXG5cdFx0XHRcdCgpID0+IGFzc2VydC5mYWlsKCdleHBlY3RlZCBjYW5jZWxsYXRpb24gYWZ0ZXIgcmViaW5kLXdpbmRvdyBhYm9ydCcpLFxuXHRcdFx0XHRlcnIgPT4gYXNzZXJ0Lm9rKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSwgYGV4cGVjdGVkIENhbmNlbGxhdGlvbkVycm9yLCBnb3QgJHtlcnJ9YCksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1aWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVpbHRbMF0uY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCwgdHJ1ZSwgJ2ZyZXNoIGNvbnRyb2xsZXIgY2FuY2VsbGVkIGJlZm9yZSBiZWluZyBpbnN0YWxsZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaXBlbGluZS5pc0Fib3J0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSByZWJpbmQgaGFuZHMgdGhlIGNvbnN1bWVyIGxvb3Agb2ZmIHRvIHRoZSBuZXcgcXVlcnkgc28gdGhlIHBvc3QtcmViaW5kIHR1cm4gaXMgbm90IGxvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiBhIHJlYmluZCBzd2FwcyBpbiBhIGZyZXNoIGBfcXVlcnlgIHdoaWxlIHRoZSBjb25zdW1lclxuXHRcdFx0Ly8gbG9vcCBpcyBzdGlsbCBkcmFpbmluZyB0aGUgT0xEIG9uZS4gVGhlIHBvc3QtcmViaW5kIGBzZW5kYCBxdWV1ZXNcblx0XHRcdC8vIGl0cyBwcm9tcHQgd2hpbGUgdGhlIG9sZCBsb29wIGlzIHN0aWxsIG1hcmtlZCBydW5uaW5nLCBzb1xuXHRcdFx0Ly8gYF9lbnN1cmVDb25zdW1lckxvb3BgIG5vLW9wcy4gSWYgdGhlIG9sZCBsb29wIHRoZW4ganVzdCBzdG9wcGVkLFxuXHRcdFx0Ly8gbm90aGluZyB3b3VsZCBldmVyIHJlYWQgdGhlIG5ldyBxdWVyeSBhbmQgYHNlbmRgIHdvdWxkIGhhbmdcblx0XHRcdC8vIChcIlJlc3RvcmUgQ2hlY2twb2ludCB0aGVuIHNlbmRcIiBuZXZlciByZXNwb25kcykuXG5cdFx0XHRjb25zdCB3YXJtMSA9IG5ldyBDb250cm9sbGFibGVXYXJtUXVlcnkoKTtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUgfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzLCB3YXJtMSk7XG5cblx0XHRcdC8vIEJpbmQgUTEgYW5kIHN0YXJ0IHRoZSBjb25zdW1lciBsb29wIGRyYWluaW5nIGl0LiBObyByZXN1bHQgaXNcblx0XHRcdC8vIHB1c2hlZCwgc28gdGhpcyBzZW5kIG5ldmVyIHJlc29sdmVzIFx1MjAxNCB3ZSBvbmx5IG5lZWQgdGhlIGxpdmUgbG9vcC5cblx0XHRcdHBpcGVsaW5lLnNlbmQobWFrZVByb21wdCgncDEnKSwgJ3R1cm4tMScpLmNhdGNoKCgpID0+IHsgLyogdW53b3VuZCBvbiB0ZWFyZG93biAqLyB9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdFx0Y29uc3QgcTEgPSB3YXJtMS5xdWVyaWVzWzBdO1xuXHRcdFx0YXNzZXJ0Lm9rKHExLm5leHRDYWxsQ291bnQgPiAwLCAnY29uc3VtZXIgbG9vcCBkcmFpbnMgUTEnKTtcblxuXHRcdFx0Ly8gUmViaW5kIHRvIGEgZnJlc2ggd2FybS9RMiB3aGlsZSBRMSdzIGxvb3AgaXMgc3RpbGwgcGFya2VkLlxuXHRcdFx0Y29uc3Qgd2FybTIgPSBuZXcgQ29udHJvbGxhYmxlV2FybVF1ZXJ5KCk7XG5cdFx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihhc3luYyAoKSA9PiAoeyB3YXJtOiB3YXJtMiwgYWJvcnRDb250cm9sbGVyOiBuZXcgQWJvcnRDb250cm9sbGVyKCkgfSkpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUucmViaW5kRm9yUmVzdGFydCgpO1xuXHRcdFx0Y29uc3QgcTIgPSB3YXJtMi5xdWVyaWVzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHEyLm5leHRDYWxsQ291bnQsIDAsICduZXcgcXVlcnkgbm90IGRyYWluZWQgeWV0IFx1MjAxNCB0aGUgb2xkIGxvb3AgaXMgc3RpbGwgcnVubmluZycpO1xuXG5cdFx0XHQvLyBUaGUgb2xkIHF1ZXJ5J3Mgc3RyZWFtIG5vdyBlbmRzIChhcyBhIHJlYWwgZGlzcG9zZSB3b3VsZCkuIFRoZVxuXHRcdFx0Ly8gbG9vcCBtdXN0IGhhbmQgb2ZmIHRvIFEyIHJhdGhlciB0aGFuIHN0b3BwaW5nLlxuXHRcdFx0cTEuZW5kKCk7XG5cdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHEyLm5leHRDYWxsQ291bnQgPiAwLCAnY29uc3VtZXIgbG9vcCBoYW5kZWQgb2ZmIHRvIHRoZSBuZXcgcXVlcnkgYWZ0ZXIgdGhlIG9sZCBvbmUgZW5kZWQnKTtcblxuXHRcdFx0Ly8gQ2xlYW4gdGVhcmRvd246IGxldCB0aGUgcmUtYXJtZWQgbG9vcCB1bndpbmQgYmVmb3JlIGRpc3Bvc2UuXG5cdFx0XHRxMi5lbmQoKTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VlZEN1cnJlbnRDb25maWcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZWVkZWQgdmFsdWVzIG1hdGNoIHRoZSBwb3N0LW1hdGVyaWFsaXplIFNESyBzdGF0ZSwgc28gZmlyc3Qgc2VuZCBkb2VzIE5PVCBwdXNoIGEgcmVkdW5kYW50IHNldE1vZGVsL2FwcGx5RmxhZ1NldHRpbmdzL3NldFBlcm1pc3Npb25Nb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gV2UgY2FuJ3Qgb2JzZXJ2ZSB0aGUgU0RLIGNhbGxzIHdpdGhvdXQgZHJpdmluZyB0aGUgY29uc3VtZXJcblx0XHRcdC8vIGxvb3AsIGJ1dCB3ZSBDQU4gb2JzZXJ2ZSB0aGF0IHNlbmQgZG9lcyBub3QgdGhyb3cgYW5kIHRoYXRcblx0XHRcdC8vIHRoZSB3YXJtIHF1ZXJ5IGlzIGJvdW5kIGV4YWN0bHkgb25jZS5cblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUsIHdhcm0gfSA9IGNyZWF0ZVBpcGVsaW5lKGRpc3Bvc2FibGVzKTtcblx0XHRcdHBpcGVsaW5lLnNlZWRDdXJyZW50Q29uZmlnKCdjbGF1ZGUtc29ubmV0LTQtNScsICdoaWdoJywgJ2RlZmF1bHQnKTtcblx0XHRcdHBpcGVsaW5lLnNlbmQobWFrZVByb21wdCgncDEnKSwgJ3R1cm4tQScpLmNhdGNoKCgpID0+IHsgLyogZXhwZWN0ZWQ6IHN0cmVhbSBlbmRzIHdpdGhvdXQgcmVzdWx0ICovIH0pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FybS5xdWVyeUNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXRFZmZvcnQnLCAoKSA9PiB7XG5cblx0XHQvLyBCaW5kIGEgbGl2ZSBRdWVyeSAoc2VuZCgpIGxhemlseSBiaW5kcyBpdCkgc2VlZGVkIGFzIGlmIHRoZSBzZXNzaW9uXG5cdFx0Ly8gbWF0ZXJpYWxpemVkIG9uIGFuIGVmZm9ydC1jYXBhYmxlIG1vZGVsLiBSZXR1cm5zIHRoZSByZWNvcmRlciBzbyBlYWNoXG5cdFx0Ly8gdGVzdCBhc3NlcnRzIHRoZSBleGFjdCBhcHBseUZsYWdTZXR0aW5ncyBwYXlsb2FkcyBwdXNoZWQgYWZ0ZXJ3YXJkcy5cblx0XHRhc3luYyBmdW5jdGlvbiBzZWVkZWRIaWdoVGhlbkJpbmQoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pOiBQcm9taXNlPHsgcGlwZWxpbmU6IENsYXVkZVNka1BpcGVsaW5lOyB3YXJtOiBSZWNvcmRpbmdXYXJtUXVlcnkgfT4ge1xuXHRcdFx0bGV0IHdhcm0hOiBSZWNvcmRpbmdXYXJtUXVlcnk7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcywgc2lnbmFsID0+ICh3YXJtID0gbmV3IFJlY29yZGluZ1dhcm1RdWVyeShzaWduYWwpKSk7XG5cdFx0XHRwaXBlbGluZS5zZWVkQ3VycmVudENvbmZpZygnY2xhdWRlLW9wdXMtNC03JywgJ2hpZ2gnLCAnZGVmYXVsdCcpO1xuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykuY2F0Y2goKCkgPT4geyAvKiBzdHJlYW0gZW5kcyB3aXRob3V0IHJlc3VsdCAqLyB9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhcm0ucXVlcnlDYWxsQ291bnQsIDEsICdxdWVyeSBzaG91bGQgYmUgYm91bmQgYWZ0ZXIgc2VuZCcpO1xuXHRcdFx0d2FybS5mbGFnU2V0dGluZ3MubGVuZ3RoID0gMDsgLy8gZHJvcCBhbnkgcmVwbGF5IGZyb20gYmluZDsgaXNvbGF0ZSB0aGUgc3dpdGNoXG5cdFx0XHRyZXR1cm4geyBwaXBlbGluZSwgd2FybSB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3N3aXRjaGluZyB0byBhIG1vZGVsIHdpdGggbm8gZWZmb3J0IGNsZWFycyB0aGUgc3RhbGUgZWZmb3J0IHZpYSBhcHBseUZsYWdTZXR0aW5ncyh7IGVmZm9ydExldmVsOiBudWxsIH0pJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVwcm8gb2YgdGhlIEhhaWt1IDQwMDogYSBzZXNzaW9uIG1hdGVyaWFsaXplZCBvbiBPcHVzIGFwcGxpZXNcblx0XHRcdC8vIGVmZm9ydCAnaGlnaCcgYXQgU0RLIHN0YXJ0dXA7IHN3aXRjaGluZyB0byBIYWlrdSBtdXN0IENMRUFSIGl0LCBub3Rcblx0XHRcdC8vIGxlYXZlICdoaWdoJyB0byBiZSByZXBsYXllZCBvbnRvIGEgbW9kZWwgdGhlIEFQSSA0MDBzIG9uLlxuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgd2FybSB9ID0gYXdhaXQgc2VlZGVkSGlnaFRoZW5CaW5kKGRpc3Bvc2FibGVzKTtcblx0XHRcdGF3YWl0IHBpcGVsaW5lLnNldEVmZm9ydCh1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtLmZsYWdTZXR0aW5ncywgW3sgZWZmb3J0TGV2ZWw6IG51bGwgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3dpdGNoaW5nIGJldHdlZW4gdHdvIGVmZm9ydC1jYXBhYmxlIGxldmVscyBwdXNoZXMgdGhlIG5ldyB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcGlwZWxpbmUsIHdhcm0gfSA9IGF3YWl0IHNlZWRlZEhpZ2hUaGVuQmluZChkaXNwb3NhYmxlcyk7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZXRFZmZvcnQoJ2xvdycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtLmZsYWdTZXR0aW5ncywgW3sgZWZmb3J0TGV2ZWw6ICdsb3cnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLWFwcGx5aW5nIHRoZSBhbHJlYWR5LWFwcGxpZWQgZWZmb3J0IGlzIGEgbm8tb3AgKG5vIHJlZHVuZGFudCBTREsgY2FsbCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lLCB3YXJtIH0gPSBhd2FpdCBzZWVkZWRIaWdoVGhlbkJpbmQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2V0RWZmb3J0KCdoaWdoJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdhcm0uZmxhZ1NldHRpbmdzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhcmluZyBhbiBhbHJlYWR5LWNsZWFyIGVmZm9ydCBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHdhcm0hOiBSZWNvcmRpbmdXYXJtUXVlcnk7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lIH0gPSBjcmVhdGVQaXBlbGluZShkaXNwb3NhYmxlcywgc2lnbmFsID0+ICh3YXJtID0gbmV3IFJlY29yZGluZ1dhcm1RdWVyeShzaWduYWwpKSk7XG5cdFx0XHRwaXBlbGluZS5zZWVkQ3VycmVudENvbmZpZygnY2xhdWRlLWhhaWt1LTQtNScsIHVuZGVmaW5lZCwgJ2RlZmF1bHQnKTtcblx0XHRcdHBpcGVsaW5lLnNlbmQobWFrZVByb21wdCgncDEnKSwgJ3R1cm4tQScpLmNhdGNoKCgpID0+IHsgLyogc3RyZWFtIGVuZHMgd2l0aG91dCByZXN1bHQgKi8gfSk7XG5cdFx0XHRhd2FpdCBmbHVzaE1pY3JvdGFza3MoKTtcblx0XHRcdHdhcm0uZmxhZ1NldHRpbmdzLmxlbmd0aCA9IDA7XG5cdFx0XHRhd2FpdCBwaXBlbGluZS5zZXRFZmZvcnQodW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2FybS5mbGFnU2V0dGluZ3MsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldEVmZm9ydCB3aGlsZSBhd2FpdGluZyByZWJpbmQgKHBvc3QtYWJvcnQpIGlzIGJ1ZmZlcmVkLCBub3QgcHVzaGVkIHRvIHRoZSBkZWFkIHF1ZXJ5LCB0aGVuIHJlcGxheWVkIG9uIHJlYmluZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEFmdGVyIGFuIGFib3J0IHRoZSBgX3F1ZXJ5YCBoYW5kbGUgaXMgaW50ZW50aW9uYWxseSByZXRhaW5lZCAoaXQgaXNcblx0XHRcdC8vIHdoYXQgdGVhcmRvd24gYXdhaXRzKSBidXQgdGhlIHN0cmVhbSBpcyBkZWFkOyBgX25lZWRzUmViaW5kYCBpcyB0aGVcblx0XHRcdC8vIGhlYWx0aCBzaWduYWwuIHNldEVmZm9ydCBtdXN0IE5PVCBzdGVlciB0aGF0IGRlYWQgcXVlcnkgXHUyMDE0IGl0IHNob3VsZFxuXHRcdFx0Ly8gYnVmZmVyIHRoZSB2YWx1ZSBhbmQgbGV0IGBfcmVwbGF5Q3VycmVudENvbmZpZ2AgcHVzaCBpdCBvbnRvIHRoZVxuXHRcdFx0Ly8gZnJlc2hseS1ib3VuZCBxdWVyeSBhZnRlciB0aGUgcmViaW5kLlxuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSwgd2FybSB9ID0gYXdhaXQgc2VlZGVkSGlnaFRoZW5CaW5kKGRpc3Bvc2FibGVzKTtcblx0XHRcdHBpcGVsaW5lLmFib3J0KCk7XG5cdFx0XHR3YXJtLmZsYWdTZXR0aW5ncy5sZW5ndGggPSAwOyAvLyBpc29sYXRlOiBpZ25vcmUgYW55dGhpbmcgZnJvbSB0aGUgZGVhZCBxdWVyeVxuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2V0RWZmb3J0KCdsb3cnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2FybS5mbGFnU2V0dGluZ3MsIFtdLCAnZWZmb3J0IG11c3Qgbm90IGJlIHB1c2hlZCB3aGlsZSBuZWVkc1JlYmluZCcpO1xuXG5cdFx0XHRsZXQgd2FybTIhOiBSZWNvcmRpbmdXYXJtUXVlcnk7XG5cdFx0XHRwaXBlbGluZS5hdHRhY2hSZW1hdGVyaWFsaXplcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN0bCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdFx0d2FybTIgPSBuZXcgUmVjb3JkaW5nV2FybVF1ZXJ5KGN0bC5zaWduYWwpO1xuXHRcdFx0XHRyZXR1cm4geyB3YXJtOiB3YXJtMiwgYWJvcnRDb250cm9sbGVyOiBjdGwgfTtcblx0XHRcdH0pO1xuXHRcdFx0cGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMicpLCAndHVybi1CJykuY2F0Y2goKCkgPT4geyAvKiBzdHJlYW0gZW5kcyB3aXRob3V0IHJlc3VsdCAqLyB9KTtcblx0XHRcdGF3YWl0IGZsdXNoTWljcm90YXNrcygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtMi5mbGFnU2V0dGluZ3MsIFt7IGVmZm9ydExldmVsOiAnbG93JyB9XSwgJ2J1ZmZlcmVkIGVmZm9ydCByZXBsYXllZCBvbiB0aGUgcmVib3VuZCBxdWVyeScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlzcG9zZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2luZyB0aGUgcGlwZWxpbmUgYWJvcnRzIHRoZSBjb250cm9sbGVyIGFuZCBhc3luYy1kaXNwb3NlcyB0aGUgV2FybVF1ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCB7IHBpcGVsaW5lLCB3YXJtLCBjb250cm9sbGVyIH0gPSBjcmVhdGVQaXBlbGluZShzdG9yZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5zaWduYWwuYWJvcnRlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhcm0uYXN5bmNEaXNwb3NlQ291bnQsIDApO1xuXG5cdFx0XHRwaXBlbGluZS5kaXNwb3NlKCk7XG5cdFx0XHQvLyBhc3luY0Rpc3Bvc2UgaXMgZmlyZS1hbmQtZm9yZ2V0OyBsZXQgdGhlIG1pY3JvdGFzayBydW4uXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhcm0uYXN5bmNEaXNwb3NlQ291bnQsIDEpO1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2FuY2VsbGF0aW9uRXJyb3IgcGx1bWJpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhYm9ydCArIHNlbmQgcmVqZWN0cyB3aXRoIGEgQ2FuY2VsbGF0aW9uRXJyb3Itc2hhcGVkIGVycm9yIGFmdGVyIHRoZSByZW1hdGVyaWFsaXplciBydW5zICh3aGVuIHJlbWF0ZXJpYWxpemVyIHJlamVjdHMgd2l0aCBvbmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwaXBlbGluZSB9ID0gY3JlYXRlUGlwZWxpbmUoZGlzcG9zYWJsZXMpO1xuXHRcdFx0cGlwZWxpbmUuYXR0YWNoUmVtYXRlcmlhbGl6ZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ0NhbmNlbGVkJyk7XG5cdFx0XHRcdGVyci5uYW1lID0gJ0NhbmNlbGVkJztcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0XHRwaXBlbGluZS5hYm9ydCgpO1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2VuZChtYWtlUHJvbXB0KCdwMScpLCAndHVybi1BJykudGhlbihcblx0XHRcdFx0KCkgPT4gYXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlamVjdGlvbicpLFxuXHRcdFx0XHRlcnIgPT4gYXNzZXJ0Lm9rKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSwgYGV4cGVjdGVkIGNhbmNlbGxhdGlvbiwgZ290ICR7ZXJyfWApLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUFtQztBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUEwQztBQUNuRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDhCQUE4QiwyQkFBMkI7QUFlbEUsTUFBTSxjQUFtQztBQUFBLEVBQXpDO0FBQ0MsNkJBQW9CO0FBQ3BCLHNCQUFhO0FBQ2IsMEJBQWlCO0FBQUE7QUFBQSxFQUVqQixNQUFNLFNBQXdEO0FBQzdELFNBQUs7QUFDTCxXQUFPLElBQUkscUJBQXFCO0FBQUEsRUFDakM7QUFBQSxFQUNBLFFBQWM7QUFBRSxTQUFLO0FBQUEsRUFBYztBQUFBLEVBQ25DLE9BQU8sT0FBTyxZQUFZLElBQW1CO0FBQUUsU0FBSztBQUFBLEVBQXFCO0FBQzFFO0FBRUEsTUFBTSxxQkFBc0M7QUFBQSxFQUMzQyxDQUFDLE9BQU8sYUFBYSxJQUFVO0FBQUUsV0FB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S0FBSyxjQUFjLENBQUMsR0FBRyw2Q0FBNkM7QUFFM0YsVUFBSTtBQUNKLGVBQVMscUJBQXFCLFlBQVk7QUFDekMsY0FBTSxNQUFNLElBQUksZ0JBQWdCO0FBQ2hDLGdCQUFRLElBQUksbUJBQW1CLElBQUksTUFBTTtBQUN6QyxlQUFPLEVBQUUsTUFBTSxPQUFPLGlCQUFpQixJQUFJO0FBQUEsTUFDNUMsQ0FBQztBQUNELGVBQVMsS0FBSyxXQUFXLElBQUksR0FBRyxRQUFRLEVBQUUsTUFBTSxNQUFNO0FBQUEsTUFBbUMsQ0FBQztBQUMxRixZQUFNLGdCQUFnQjtBQUN0QixhQUFPLGdCQUFnQixNQUFNLGNBQWMsQ0FBQyxFQUFFLGFBQWEsTUFBTSxDQUFDLEdBQUcsK0NBQStDO0FBQUEsSUFDckgsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sV0FBVyxNQUFNO0FBRXRCLFNBQUssaUZBQWlGLFlBQVk7QUFDakcsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFlBQU0sRUFBRSxVQUFVLE1BQU0sV0FBVyxJQUFJLGVBQWUsS0FBSztBQUMzRCxhQUFPLFlBQVksV0FBVyxPQUFPLFNBQVMsS0FBSztBQUNuRCxhQUFPLFlBQVksS0FBSyxtQkFBbUIsQ0FBQztBQUU1QyxlQUFTLFFBQVE7QUFFakIsWUFBTSxRQUFRLFFBQVE7QUFFdEIsYUFBTyxZQUFZLFdBQVcsT0FBTyxTQUFTLElBQUk7QUFDbEQsYUFBTyxZQUFZLEtBQUssbUJBQW1CLENBQUM7QUFDNUMsWUFBTSxRQUFRO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSw4QkFBOEIsTUFBTTtBQUV6QyxTQUFLLG1JQUFtSSxZQUFZO0FBQ25KLFlBQU0sRUFBRSxTQUFTLElBQUksZUFBZSxXQUFXO0FBQy9DLGVBQVMscUJBQXFCLFlBQVk7QUFDekMsY0FBTSxNQUFNLElBQUksTUFBTSxVQUFVO0FBQ2hDLFlBQUksT0FBTztBQUNYLGNBQU07QUFBQSxNQUNQLENBQUM7QUFDRCxlQUFTLE1BQU07QUFDZixZQUFNLFNBQVMsS0FBSyxXQUFXLElBQUksR0FBRyxRQUFRLEVBQUU7QUFBQSxRQUMvQyxNQUFNLE9BQU8sS0FBSyxvQkFBb0I7QUFBQSxRQUN0QyxTQUFPLE9BQU8sR0FBRyxvQkFBb0IsR0FBRyxHQUFHLDhCQUE4QixHQUFHLEVBQUU7QUFBQSxNQUMvRTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImRpc3Bvc2FibGVzIl0KfQo=
