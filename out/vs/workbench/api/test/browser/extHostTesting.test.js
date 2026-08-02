import assert from "assert";
import * as sinon from "sinon";
import { timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { URI } from "../../../../base/common/uri.js";
import { mock, mockObject } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import * as editorRange from "../../../../editor/common/core/range.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { ExtHostTesting, TestRunCoordinator, TestRunDto, TestRunProfileImpl } from "../../common/extHostTesting.js";
import { ExtHostTestItemCollection, TestItemImpl } from "../../common/extHostTestItem.js";
import * as convert from "../../common/extHostTypeConverters.js";
import { Location, Position, Range, TestMessage, TestRunProfileKind, TestRunRequest as TestRunRequestImpl, TestTag } from "../../common/extHostTypes.js";
import { AnyCallRPCProtocol } from "../common/testRPCProtocol.js";
import { TestId } from "../../../contrib/testing/common/testId.js";
import { TestDiffOpType, TestItemExpandState, TestMessageType } from "../../../contrib/testing/common/testTypes.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
const simplify = (item) => ({
  id: item.id,
  label: item.label,
  uri: item.uri,
  range: item.range
});
const assertTreesEqual = (a, b) => {
  if (!a) {
    throw new assert.AssertionError({ message: "Expected a to be defined", actual: a });
  }
  if (!b) {
    throw new assert.AssertionError({ message: "Expected b to be defined", actual: b });
  }
  assert.deepStrictEqual(simplify(a), simplify(b));
  const aChildren = [...a.children].map(([_, c]) => c.id).sort();
  const bChildren = [...b.children].map(([_, c]) => c.id).sort();
  assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
  aChildren.forEach((key) => assertTreesEqual(a.children.get(key), b.children.get(key)));
};
suite("ExtHost Testing", () => {
  class TestExtHostTestItemCollection extends ExtHostTestItemCollection {
    setDiff(diff) {
      this.diff = diff;
    }
  }
  teardown(() => {
    sinon.restore();
  });
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let single;
  let resolveCalls = [];
  setup(() => {
    resolveCalls = [];
    single = ds.add(new TestExtHostTestItemCollection("ctrlId", "root", {
      getDocument: () => void 0
    }));
    single.resolveHandler = (item) => {
      resolveCalls.push(item?.id);
      if (item === void 0) {
        const a = new TestItemImpl("ctrlId", "id-a", "a", URI.file("/"));
        a.canResolveChildren = true;
        const b = new TestItemImpl("ctrlId", "id-b", "b", URI.file("/"));
        single.root.children.add(a);
        single.root.children.add(b);
      } else if (item.id === "id-a") {
        item.children.add(new TestItemImpl("ctrlId", "id-aa", "aa", URI.file("/")));
        item.children.add(new TestItemImpl("ctrlId", "id-ab", "ab", URI.file("/")));
      }
    };
    ds.add(single.onDidGenerateDiff((d) => single.setDiff(
      d
      /* don't clear during testing */
    )));
  });
  suite("OwnedTestCollection", () => {
    test("adds a root recursively", async () => {
      await single.expand(single.root.id, Infinity);
      const a = single.root.children.get("id-a");
      const b = single.root.children.get("id-b");
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(single.root) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(a) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get("id-aa")) }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get("id-ab")) }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), expand: TestItemExpandState.Expanded }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: single.root.id, expand: TestItemExpandState.Expanded }
        }
      ]);
    });
    test("parents are set correctly", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const a = single.root.children.get("id-a");
      const ab = a.children.get("id-ab");
      assert.strictEqual(a.parent, void 0);
      assert.strictEqual(ab.parent, a);
    });
    test("can add an item with same ID as root", () => {
      single.collectDiff();
      const child = new TestItemImpl("ctrlId", "ctrlId", "c", void 0);
      single.root.children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(child) }
        }
      ]);
    });
    test("no-ops if items not changed", () => {
      single.collectDiff();
      assert.deepStrictEqual(single.collectDiff(), []);
    });
    test("watches property mutations", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      single.root.children.get("id-a").description = "Hello world";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { description: "Hello world" } }
        }
      ]);
    });
    test("removes children", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      single.root.children.delete("id-a");
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.Remove, itemId: new TestId(["ctrlId", "id-a"]).toString() }
      ]);
      assert.deepStrictEqual(
        [...single.tree.keys()].sort(),
        [single.root.id, new TestId(["ctrlId", "id-b"]).toString()]
      );
      assert.strictEqual(single.tree.size, 2);
    });
    test("adds new children", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const child = new TestItemImpl("ctrlId", "id-ac", "c", void 0);
      single.root.children.get("id-a").children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Add,
          item: {
            controllerId: "ctrlId",
            expand: TestItemExpandState.NotExpandable,
            item: convert.TestItem.from(child)
          }
        }
      ]);
      assert.deepStrictEqual(
        [...single.tree.values()].map((n) => n.actual.id).sort(),
        [single.root.id, "id-a", "id-aa", "id-ab", "id-ac", "id-b"]
      );
      assert.strictEqual(single.tree.size, 6);
    });
    test("manages tags correctly", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const tag1 = new TestTag("tag1");
      const tag2 = new TestTag("tag2");
      const tag3 = new TestTag("tag3");
      const child = new TestItemImpl("ctrlId", "id-ac", "c", void 0);
      child.tags = [tag1, tag2];
      single.root.children.get("id-a").children.add(child);
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag1" } },
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag2" } },
        {
          op: TestDiffOpType.Add,
          item: {
            controllerId: "ctrlId",
            expand: TestItemExpandState.NotExpandable,
            item: convert.TestItem.from(child)
          }
        }
      ]);
      child.tags = [tag2, tag3];
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.AddTag, tag: { id: "ctrlId\0tag3" } },
        {
          op: TestDiffOpType.Update,
          item: {
            extId: new TestId(["ctrlId", "id-a", "id-ac"]).toString(),
            item: { tags: ["ctrlId\0tag2", "ctrlId\0tag3"] }
          }
        },
        { op: TestDiffOpType.RemoveTag, id: "ctrlId\0tag1" }
      ]);
      const a = single.root.children.get("id-a");
      a.tags = [tag2];
      a.children.replace([]);
      assert.deepStrictEqual(single.collectDiff().filter((t) => t.op === TestDiffOpType.RemoveTag), [
        { op: TestDiffOpType.RemoveTag, id: "ctrlId\0tag3" }
      ]);
    });
    test("replaces on uri change", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = single.root.children.get("id-a").uri?.with({ path: "/different" });
      const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
      newA.children.replace([...oldA.children].map(([_, item]) => item));
      single.root.children.replace([...single.root.children].map(([id, i]) => id === "id-a" ? newA : i));
      assert.deepStrictEqual(single.collectDiff(), [
        { op: TestDiffOpType.Remove, itemId: new TestId(["ctrlId", "id-a"]).toString() },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: { ...convert.TestItem.from(newA) } }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get("id-aa")) }
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get("id-ab")) }
        }
      ]);
    });
    test("treats in-place replacement as mutation", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = single.root.children.get("id-a").uri;
      const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
      newA.children.replace([...oldA.children].map(([_, item]) => item));
      single.root.children.replace([
        newA,
        new TestItemImpl("ctrlId", "id-b", single.root.children.get("id-b").label, uri)
      ]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { label: "Hello world" } }
        },
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
      newA.label = "still connected";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a"]).toString(), item: { label: "still connected" } }
        }
      ]);
      oldA.label = "no longer connected";
      assert.deepStrictEqual(single.collectDiff(), []);
    });
    suite("expandibility restoration", () => {
      const doReplace = async (canResolveChildren = true) => {
        const uri = single.root.children.get("id-a").uri;
        const newA = new TestItemImpl("ctrlId", "id-a", "Hello world", uri);
        newA.canResolveChildren = canResolveChildren;
        single.root.children.replace([
          newA,
          new TestItemImpl("ctrlId", "id-b", single.root.children.get("id-b").label, uri)
        ]);
        await timeout(0);
      };
      test("does not restore an unexpanded state", async () => {
        await single.expand(single.root.id, 0);
        assert.deepStrictEqual(resolveCalls, [void 0]);
        await doReplace();
        assert.deepStrictEqual(resolveCalls, [void 0]);
      });
      test("restores resolve state on replacement", async () => {
        await single.expand(single.root.id, Infinity);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
        await doReplace();
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a", "id-a"]);
      });
      test("does not expand if new child is not expandable", async () => {
        await single.expand(single.root.id, Infinity);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
        await doReplace(false);
        assert.deepStrictEqual(resolveCalls, [void 0, "id-a"]);
      });
    });
    test("treats in-place replacement as mutation deeply", () => {
      single.expand(single.root.id, Infinity);
      single.collectDiff();
      const oldA = single.root.children.get("id-a");
      const uri = oldA.uri;
      const newA = new TestItemImpl("ctrlId", "id-a", single.root.children.get("id-a").label, uri);
      const oldAA = oldA.children.get("id-aa");
      const oldAB = oldA.children.get("id-ab");
      const newAB = new TestItemImpl("ctrlId", "id-ab", "Hello world", uri);
      newA.children.replace([oldAA, newAB]);
      single.root.children.replace([newA, single.root.children.get("id-b")]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: TestId.fromExtHostTestItem(oldAB, "ctrlId").toString(), item: { label: "Hello world" } }
        },
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
      oldAA.label = "still connected1";
      newAB.label = "still connected2";
      oldAB.label = "not connected3";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-aa"]).toString(), item: { label: "still connected1" } }
        },
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-ab"]).toString(), item: { label: "still connected2" } }
        }
      ]);
      assert.strictEqual(newAB.parent, newA);
      assert.strictEqual(oldAA.parent, newA);
      assert.deepStrictEqual(newA.parent, void 0);
    });
    test("moves an item to be a new child", async () => {
      await single.expand(single.root.id, 0);
      single.collectDiff();
      const b = single.root.children.get("id-b");
      const a = single.root.children.get("id-a");
      a.children.add(b);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Remove,
          itemId: new TestId(["ctrlId", "id-b"]).toString()
        },
        {
          op: TestDiffOpType.Add,
          item: { controllerId: "ctrlId", expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
        }
      ]);
      b.label = "still connected";
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.Update,
          item: { extId: new TestId(["ctrlId", "id-a", "id-b"]).toString(), item: { label: "still connected" } }
        }
      ]);
      assert.deepStrictEqual([...single.root.children].map(([_, item]) => item), [single.root.children.get("id-a")]);
      assert.deepStrictEqual(b.parent, a);
    });
    test("sends document sync events", async () => {
      await single.expand(single.root.id, 0);
      single.collectDiff();
      const a = single.root.children.get("id-a");
      a.range = new Range(new Position(0, 0), new Position(1, 0));
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri: URI.file("/")
        },
        {
          op: TestDiffOpType.Update,
          item: {
            extId: new TestId(["ctrlId", "id-a"]).toString(),
            item: {
              range: editorRange.Range.lift({
                endColumn: 1,
                endLineNumber: 2,
                startColumn: 1,
                startLineNumber: 1
              })
            }
          }
        }
      ]);
      a.range = a.range;
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri: URI.file("/")
        }
      ]);
      const uri = URI.file("/");
      const a2 = new TestItemImpl("ctrlId", "id-a", "a", uri);
      a2.range = a.range;
      single.root.children.replace([a2, single.root.children.get("id-b")]);
      assert.deepStrictEqual(single.collectDiff(), [
        {
          op: TestDiffOpType.DocumentSynced,
          docv: void 0,
          uri
        }
      ]);
    });
  });
  suite("MirroredTestCollection", () => {
  });
  suite("TestRunTracker", () => {
    let proxy;
    let c;
    let cts;
    let configuration;
    let req;
    let dto;
    const ext = {};
    teardown(() => {
      for (const { id } of c.trackers) {
        c.disposeTestRun(id);
      }
    });
    setup(async () => {
      proxy = mockObject()();
      cts = new CancellationTokenSource();
      c = new TestRunCoordinator(proxy, new NullLogService());
      configuration = new TestRunProfileImpl(mockObject()(), /* @__PURE__ */ new Map(), /* @__PURE__ */ new Set(), Event.None, "ctrlId", 42, "Do Run", TestRunProfileKind.Run, () => {
      }, false);
      await single.expand(single.root.id, Infinity);
      single.collectDiff();
      req = {
        include: void 0,
        exclude: [single.root.children.get("id-b")],
        profile: configuration,
        preserveFocus: false
      };
      dto = TestRunDto.fromInternal({
        controllerId: "ctrl",
        profileId: configuration.profileId,
        excludeExtIds: ["id-b"],
        runId: "run-id",
        testIds: [single.root.id]
      }, single);
    });
    test("tracks a run started from a main thread request", () => {
      const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
      assert.strictEqual(tracker.hasRunningTasks, false);
      const task1 = c.createTestRun(ext, "ctrl", single, req, "run1", true);
      const task2 = c.createTestRun(ext, "ctrl", single, req, "run2", true);
      assert.strictEqual(proxy.$startedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task1.appendOutput("hello");
      const taskId = proxy.$appendOutputToRun.args[0]?.[1];
      assert.deepStrictEqual([["run-id", taskId, VSBuffer.fromString("hello"), void 0, void 0]], proxy.$appendOutputToRun.args);
      task1.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task2.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, false);
    });
    test("run cancel force ends after a timeout", () => {
      const clock = sinon.useFakeTimers();
      try {
        const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
        const task = c.createTestRun(ext, "ctrl", single, req, "run1", true);
        const onEnded = sinon.stub();
        ds.add(tracker.onEnd(onEnded));
        assert.strictEqual(task.token.isCancellationRequested, false);
        assert.strictEqual(tracker.hasRunningTasks, true);
        tracker.cancel();
        assert.strictEqual(task.token.isCancellationRequested, true);
        assert.strictEqual(tracker.hasRunningTasks, true);
        clock.tick(9999);
        assert.strictEqual(tracker.hasRunningTasks, true);
        assert.strictEqual(onEnded.called, false);
        clock.tick(1);
        assert.strictEqual(onEnded.called, true);
        assert.strictEqual(tracker.hasRunningTasks, false);
      } finally {
        clock.restore();
      }
    });
    test("run cancel force ends on second cancellation request", () => {
      const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
      const task = c.createTestRun(ext, "ctrl", single, req, "run1", true);
      const onEnded = sinon.stub();
      ds.add(tracker.onEnd(onEnded));
      assert.strictEqual(task.token.isCancellationRequested, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      tracker.cancel();
      assert.strictEqual(task.token.isCancellationRequested, true);
      assert.strictEqual(tracker.hasRunningTasks, true);
      assert.strictEqual(onEnded.called, false);
      tracker.cancel();
      assert.strictEqual(tracker.hasRunningTasks, false);
      assert.strictEqual(onEnded.called, true);
    });
    test("tracks a run started from an extension request", () => {
      const task1 = c.createTestRun(ext, "ctrl", single, req, "hello world", false);
      const tracker = Iterable.first(c.trackers);
      assert.strictEqual(tracker.hasRunningTasks, true);
      assert.deepStrictEqual(proxy.$startedExtensionTestRun.args, [
        [{
          profile: { group: 2, id: 42 },
          controllerId: "ctrl",
          id: tracker.id,
          include: [single.root.id],
          exclude: [new TestId(["ctrlId", "id-b"]).toString()],
          persist: false,
          continuous: false,
          preserveFocus: false
        }]
      ]);
      const task2 = c.createTestRun(ext, "ctrl", single, req, "run2", true);
      const task3Detached = c.createTestRun(ext, "ctrl", single, { ...req }, "task3Detached", true);
      task1.end();
      assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
      assert.strictEqual(tracker.hasRunningTasks, true);
      task2.end();
      assert.deepStrictEqual(proxy.$finishedExtensionTestRun.args, [[tracker.id]]);
      assert.strictEqual(tracker.hasRunningTasks, false);
      task3Detached.end();
    });
    test("adds tests to run smartly", () => {
      const task1 = c.createTestRun(ext, "ctrlId", single, req, "hello world", false);
      const tracker = Iterable.first(c.trackers);
      const expectedArgs = [];
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.passed(single.root.children.get("id-a").children.get("id-aa"));
      expectedArgs.push([
        "ctrlId",
        tracker.id,
        [
          convert.TestItem.from(single.root),
          convert.TestItem.from(single.root.children.get("id-a")),
          convert.TestItem.from(single.root.children.get("id-a").children.get("id-aa"))
        ]
      ]);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.enqueued(single.root.children.get("id-a").children.get("id-ab"));
      expectedArgs.push([
        "ctrlId",
        tracker.id,
        [
          convert.TestItem.from(single.root.children.get("id-a")),
          convert.TestItem.from(single.root.children.get("id-a").children.get("id-ab"))
        ]
      ]);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.passed(single.root.children.get("id-a").children.get("id-ab"));
      assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
      task1.end();
    });
    test("adds test messages to run", () => {
      const test1 = new TestItemImpl("ctrlId", "id-c", "test c", URI.file("/testc.txt"));
      const test2 = new TestItemImpl("ctrlId", "id-d", "test d", URI.file("/testd.txt"));
      test1.range = test2.range = new Range(new Position(0, 0), new Position(1, 0));
      single.root.children.replace([test1, test2]);
      const task = c.createTestRun(ext, "ctrlId", single, req, "hello world", false);
      const message1 = new TestMessage("some message");
      message1.location = new Location(URI.file("/a.txt"), new Position(0, 0));
      task.failed(test1, message1);
      const args = proxy.$appendTestMessagesInRun.args[0];
      assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[0], [
        args[0],
        args[1],
        new TestId(["ctrlId", "id-c"]).toString(),
        [{
          message: "some message",
          type: TestMessageType.Error,
          expected: void 0,
          contextValue: void 0,
          actual: void 0,
          location: convert.location.from(message1.location),
          stackTrace: void 0
        }]
      ]);
      task.failed(test2, new TestMessage("some message"));
      assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[1], [
        args[0],
        args[1],
        new TestId(["ctrlId", "id-d"]).toString(),
        [{
          message: "some message",
          type: TestMessageType.Error,
          contextValue: void 0,
          expected: void 0,
          actual: void 0,
          location: convert.location.from({ uri: test2.uri, range: test2.range }),
          stackTrace: void 0
        }]
      ]);
      task.end();
    });
    test("guards calls after runs are ended", () => {
      const task = c.createTestRun(ext, "ctrl", single, req, "hello world", false);
      task.end();
      task.failed(single.root, new TestMessage("some message"));
      task.appendOutput("output");
      assert.strictEqual(proxy.$addTestsToRun.called, false);
      assert.strictEqual(proxy.$appendOutputToRun.called, false);
      assert.strictEqual(proxy.$appendTestMessagesInRun.called, false);
    });
    test("sets state of test with identical local IDs (#131827)", () => {
      const testA = single.root.children.get("id-a");
      const testB = single.root.children.get("id-b");
      const childA = new TestItemImpl("ctrlId", "id-child", "child", void 0);
      testA.children.replace([childA]);
      const childB = new TestItemImpl("ctrlId", "id-child", "child", void 0);
      testB.children.replace([childB]);
      const task1 = c.createTestRun(ext, "ctrl", single, new TestRunRequestImpl(), "hello world", false);
      const tracker = Iterable.first(c.trackers);
      task1.passed(childA);
      task1.passed(childB);
      assert.deepStrictEqual(proxy.$addTestsToRun.args, [
        [
          "ctrl",
          tracker.id,
          [single.root, testA, childA].map((t) => convert.TestItem.from(t))
        ],
        [
          "ctrl",
          tracker.id,
          [single.root, testB, childB].map((t) => convert.TestItem.from(t))
        ]
      ]);
      task1.end();
    });
  });
  suite("service", () => {
    let ctrl;
    class TestExtHostTesting extends ExtHostTesting {
      getProfileInternalId(ctrl2, profile) {
        for (const [id, p] of this.controllers.get(ctrl2.id).profiles) {
          if (profile === p) {
            return id;
          }
        }
        throw new Error("profile not found");
      }
    }
    setup(() => {
      const rpcProtocol = AnyCallRPCProtocol();
      ctrl = ds.add(new TestExtHostTesting(
        rpcProtocol,
        new NullLogService(),
        new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
          onExtensionError() {
            return true;
          }
        }()),
        new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService())
      ));
    });
    test("exposes active profiles correctly", async () => {
      const extA = { ...nullExtensionDescription, identifier: new ExtensionIdentifier("ext.a"), enabledApiProposals: ["testingActiveProfile"] };
      const extB = { ...nullExtensionDescription, identifier: new ExtensionIdentifier("ext.b"), enabledApiProposals: ["testingActiveProfile"] };
      const ctrlA = ds.add(ctrl.createTestController(extA, "a", "ctrla"));
      const profAA = ds.add(ctrlA.createRunProfile("aa", TestRunProfileKind.Run, () => {
      }));
      const profAB = ds.add(ctrlA.createRunProfile("ab", TestRunProfileKind.Run, () => {
      }));
      const ctrlB = ds.add(ctrl.createTestController(extB, "b", "ctrlb"));
      const profBA = ds.add(ctrlB.createRunProfile("ba", TestRunProfileKind.Run, () => {
      }));
      const profBB = ds.add(ctrlB.createRunProfile("bb", TestRunProfileKind.Run, () => {
      }));
      const neverCalled = sinon.stub();
      assert.deepStrictEqual(profAA.isDefault, false);
      assert.deepStrictEqual(profBA.isDefault, false);
      assert.deepStrictEqual(profBB.isDefault, false);
      const changeA = Event.toPromise(profAA.onDidChangeDefault);
      const changeBA = Event.toPromise(profBA.onDidChangeDefault);
      const changeBB = Event.toPromise(profBB.onDidChangeDefault);
      ds.add(profAB.onDidChangeDefault(neverCalled));
      assert.strictEqual(neverCalled.called, false);
      ctrl.$setDefaultRunProfiles({
        a: [ctrl.getProfileInternalId(ctrlA, profAA)],
        b: [ctrl.getProfileInternalId(ctrlB, profBA), ctrl.getProfileInternalId(ctrlB, profBB)]
      });
      assert.deepStrictEqual(await changeA, true);
      assert.deepStrictEqual(await changeBA, true);
      assert.deepStrictEqual(await changeBB, true);
      assert.deepStrictEqual(profAA.isDefault, true);
      assert.deepStrictEqual(profBA.isDefault, true);
      assert.deepStrictEqual(profBB.isDefault, true);
      assert.deepStrictEqual(profAB.isDefault, false);
      ds.add(profAA.onDidChangeDefault(neverCalled));
      ctrl.$setDefaultRunProfiles({
        a: [ctrl.getProfileInternalId(ctrlA, profAA)]
      });
      assert.strictEqual(neverCalled.called, false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUZXN0aW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrLCBtb2NrT2JqZWN0LCBNb2NrT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0ICogYXMgZWRpdG9yUmFuZ2UgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVGVzdGluZ1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEV4dEhvc3RUZXN0aW5nLCBUZXN0UnVuQ29vcmRpbmF0b3IsIFRlc3RSdW5EdG8sIFRlc3RSdW5Qcm9maWxlSW1wbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVzdGluZy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uLCBUZXN0SXRlbUltcGwgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlc3RJdGVtLmpzJztcbmltcG9ydCAqIGFzIGNvbnZlcnQgZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiwgUG9zaXRpb24sIFJhbmdlLCBUZXN0TWVzc2FnZSwgVGVzdFJ1blByb2ZpbGVLaW5kLCBUZXN0UnVuUmVxdWVzdCBhcyBUZXN0UnVuUmVxdWVzdEltcGwsIFRlc3RUYWcgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IEFueUNhbGxSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVGVzdERpZmZPcFR5cGUsIFRlc3RJdGVtRXhwYW5kU3RhdGUsIFRlc3RNZXNzYWdlVHlwZSwgVGVzdHNEaWZmIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlc3RDb250cm9sbGVyLCBUZXN0SXRlbSwgVGVzdFJ1blByb2ZpbGUsIFRlc3RSdW5SZXF1ZXN0IH0gZnJvbSAndnNjb2RlJztcblxuY29uc3Qgc2ltcGxpZnkgPSAoaXRlbTogVGVzdEl0ZW0pID0+ICh7XG5cdGlkOiBpdGVtLmlkLFxuXHRsYWJlbDogaXRlbS5sYWJlbCxcblx0dXJpOiBpdGVtLnVyaSxcblx0cmFuZ2U6IGl0ZW0ucmFuZ2UsXG59KTtcblxuY29uc3QgYXNzZXJ0VHJlZXNFcXVhbCA9IChhOiBUZXN0SXRlbUltcGwgfCB1bmRlZmluZWQsIGI6IFRlc3RJdGVtSW1wbCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRpZiAoIWEpIHtcblx0XHR0aHJvdyBuZXcgYXNzZXJ0LkFzc2VydGlvbkVycm9yKHsgbWVzc2FnZTogJ0V4cGVjdGVkIGEgdG8gYmUgZGVmaW5lZCcsIGFjdHVhbDogYSB9KTtcblx0fVxuXG5cdGlmICghYikge1xuXHRcdHRocm93IG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiAnRXhwZWN0ZWQgYiB0byBiZSBkZWZpbmVkJywgYWN0dWFsOiBiIH0pO1xuXHR9XG5cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW1wbGlmeShhKSwgc2ltcGxpZnkoYikpO1xuXG5cdGNvbnN0IGFDaGlsZHJlbiA9IFsuLi5hLmNoaWxkcmVuXS5tYXAoKFtfLCBjXSkgPT4gYy5pZCkuc29ydCgpO1xuXHRjb25zdCBiQ2hpbGRyZW4gPSBbLi4uYi5jaGlsZHJlbl0ubWFwKChbXywgY10pID0+IGMuaWQpLnNvcnQoKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGFDaGlsZHJlbi5sZW5ndGgsIGJDaGlsZHJlbi5sZW5ndGgsIGBleHBlY3RlZCAke2EubGFiZWx9LmNoaWxkcmVuLmxlbmd0aCA9PSAke2IubGFiZWx9LmNoaWxkcmVuLmxlbmd0aGApO1xuXHRhQ2hpbGRyZW4uZm9yRWFjaChrZXkgPT4gYXNzZXJ0VHJlZXNFcXVhbChhLmNoaWxkcmVuLmdldChrZXkpIGFzIFRlc3RJdGVtSW1wbCwgYi5jaGlsZHJlbi5nZXQoa2V5KSBhcyBUZXN0SXRlbUltcGwpKTtcbn07XG5cbi8vIGNvbnN0IGFzc2VydFRyZWVMaXN0RXF1YWwgPSAoYTogUmVhZG9ubHlBcnJheTxUZXN0SXRlbT4sIGI6IFJlYWRvbmx5QXJyYXk8VGVzdEl0ZW0+KSA9PiB7XG4vLyBcdGFzc2VydC5zdHJpY3RFcXVhbChhLmxlbmd0aCwgYi5sZW5ndGgsIGBleHBlY3RlZCBhLmxlbmd0aCA9PSBuLmxlbmd0aGApO1xuLy8gXHRhLmZvckVhY2goKF8sIGkpID0+IGFzc2VydFRyZWVzRXF1YWwoYVtpXSwgYltpXSkpO1xuLy8gfTtcblxuLy8gY2xhc3MgVGVzdE1pcnJvcmVkQ29sbGVjdGlvbiBleHRlbmRzIE1pcnJvcmVkVGVzdENvbGxlY3Rpb24ge1xuLy8gXHRwdWJsaWMgY2hhbmdlRXZlbnQhOiBUZXN0Q2hhbmdlRXZlbnQ7XG5cbi8vIFx0Y29uc3RydWN0b3IoKSB7XG4vLyBcdFx0c3VwZXIoKTtcbi8vIFx0XHR0aGlzLm9uRGlkQ2hhbmdlVGVzdHMoZXZ0ID0+IHRoaXMuY2hhbmdlRXZlbnQgPSBldnQpO1xuLy8gXHR9XG5cbi8vIFx0cHVibGljIGdldCBsZW5ndGgoKSB7XG4vLyBcdFx0cmV0dXJuIHRoaXMuaXRlbXMuc2l6ZTtcbi8vIFx0fVxuLy8gfVxuXG5zdWl0ZSgnRXh0SG9zdCBUZXN0aW5nJywgKCkgPT4ge1xuXHRjbGFzcyBUZXN0RXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbiBleHRlbmRzIEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24ge1xuXHRcdHB1YmxpYyBzZXREaWZmKGRpZmY6IFRlc3RzRGlmZikge1xuXHRcdFx0dGhpcy5kaWZmID0gZGlmZjtcblx0XHR9XG5cdH1cblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KTtcblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzaW5nbGU6IFRlc3RFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uO1xuXHRsZXQgcmVzb2x2ZUNhbGxzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdHNldHVwKCgpID0+IHtcblx0XHRyZXNvbHZlQ2FsbHMgPSBbXTtcblx0XHRzaW5nbGUgPSBkcy5hZGQobmV3IFRlc3RFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uKCdjdHJsSWQnLCAncm9vdCcsIHtcblx0XHRcdGdldERvY3VtZW50OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzPiBhcyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycykpO1xuXHRcdHNpbmdsZS5yZXNvbHZlSGFuZGxlciA9IGl0ZW0gPT4ge1xuXHRcdFx0cmVzb2x2ZUNhbGxzLnB1c2goaXRlbT8uaWQpO1xuXHRcdFx0aWYgKGl0ZW0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWEnLCAnYScsIFVSSS5maWxlKCcvJykpO1xuXHRcdFx0XHRhLmNhblJlc29sdmVDaGlsZHJlbiA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGIgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYicsICdiJywgVVJJLmZpbGUoJy8nKSk7XG5cdFx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLmFkZChhKTtcblx0XHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uYWRkKGIpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLmlkID09PSAnaWQtYScpIHtcblx0XHRcdFx0aXRlbS5jaGlsZHJlbi5hZGQobmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWFhJywgJ2FhJywgVVJJLmZpbGUoJy8nKSkpO1xuXHRcdFx0XHRpdGVtLmNoaWxkcmVuLmFkZChuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYWInLCAnYWInLCBVUkkuZmlsZSgnLycpKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRzLmFkZChzaW5nbGUub25EaWRHZW5lcmF0ZURpZmYoZCA9PiBzaW5nbGUuc2V0RGlmZihkIC8qIGRvbid0IGNsZWFyIGR1cmluZyB0ZXN0aW5nICovKSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnT3duZWRUZXN0Q29sbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdhZGRzIGEgcm9vdCByZWN1cnNpdmVseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdGNvbnN0IGEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSBhcyBUZXN0SXRlbUltcGw7XG5cdFx0XHRjb25zdCBiID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykgYXMgVGVzdEl0ZW1JbXBsO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5CdXN5RXhwYW5kaW5nLCBpdGVtOiB7IC4uLmNvbnZlcnQuVGVzdEl0ZW0uZnJvbShzaW5nbGUucm9vdCkgfSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcsIGl0ZW06IHsgLi4uY29udmVydC5UZXN0SXRlbS5mcm9tKGEpIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiBjb252ZXJ0LlRlc3RJdGVtLmZyb20oYS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykgYXMgVGVzdEl0ZW1JbXBsKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShhLmNoaWxkcmVuLmdldCgnaWQtYWInKSBhcyBUZXN0SXRlbUltcGwpIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsXG5cdFx0XHRcdFx0aXRlbTogeyBleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJ10pLnRvU3RyaW5nKCksIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5FeHBhbmRlZCB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShiKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IHNpbmdsZS5yb290LmlkLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuRXhwYW5kZWQgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJlbnRzIGFyZSBzZXQgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdGNvbnN0IGEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSE7XG5cdFx0XHRjb25zdCBhYiA9IGEuY2hpbGRyZW4uZ2V0KCdpZC1hYicpITtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnBhcmVudCwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhYi5wYXJlbnQsIGEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuIGFkZCBhbiBpdGVtIHdpdGggc2FtZSBJRCBhcyByb290JywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdGNvbnN0IGNoaWxkID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2N0cmxJZCcsICdjJywgdW5kZWZpbmVkKTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLmFkZChjaGlsZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRcdGl0ZW06IHsgY29udHJvbGxlcklkOiAnY3RybElkJywgZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGUsIGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShjaGlsZCkgfSxcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduby1vcHMgaWYgaXRlbXMgbm90IGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhdGNoZXMgcHJvcGVydHkgbXV0YXRpb25zJywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuZGVzY3JpcHRpb24gPSAnSGVsbG8gd29ybGQnOyAvKiBpdGVtIGEgKi9cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSwgaXRlbTogeyBkZXNjcmlwdGlvbjogJ0hlbGxvIHdvcmxkJyB9IH0sXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBjaGlsZHJlbicsICgpID0+IHtcblx0XHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uZGVsZXRlKCdpZC1hJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0eyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlLCBpdGVtSWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFsuLi5zaW5nbGUudHJlZS5rZXlzKCldLnNvcnQoKSxcblx0XHRcdFx0W3NpbmdsZS5yb290LmlkLCBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWInXSkudG9TdHJpbmcoKV0sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbmdsZS50cmVlLnNpemUsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyBuZXcgY2hpbGRyZW4nLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblx0XHRcdGNvbnN0IGNoaWxkID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWFjJywgJ2MnLCB1bmRlZmluZWQpO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmFkZChjaGlsZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsIGl0ZW06IHtcblx0XHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsXG5cdFx0XHRcdFx0XHRleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSxcblx0XHRcdFx0XHRcdGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShjaGlsZCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbLi4uc2luZ2xlLnRyZWUudmFsdWVzKCldLm1hcChuID0+IG4uYWN0dWFsLmlkKS5zb3J0KCksXG5cdFx0XHRcdFtzaW5nbGUucm9vdC5pZCwgJ2lkLWEnLCAnaWQtYWEnLCAnaWQtYWInLCAnaWQtYWMnLCAnaWQtYiddLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaW5nbGUudHJlZS5zaXplLCA2KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hbmFnZXMgdGFncyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblx0XHRcdGNvbnN0IHRhZzEgPSBuZXcgVGVzdFRhZygndGFnMScpO1xuXHRcdFx0Y29uc3QgdGFnMiA9IG5ldyBUZXN0VGFnKCd0YWcyJyk7XG5cdFx0XHRjb25zdCB0YWczID0gbmV3IFRlc3RUYWcoJ3RhZzMnKTtcblx0XHRcdGNvbnN0IGNoaWxkID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWFjJywgJ2MnLCB1bmRlZmluZWQpO1xuXHRcdFx0Y2hpbGQudGFncyA9IFt0YWcxLCB0YWcyXTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5hZGQoY2hpbGQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZFRhZywgdGFnOiB7IGlkOiAnY3RybElkXFwwdGFnMScgfSB9LFxuXHRcdFx0XHR7IG9wOiBUZXN0RGlmZk9wVHlwZS5BZGRUYWcsIHRhZzogeyBpZDogJ2N0cmxJZFxcMHRhZzInIH0gfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsIGl0ZW06IHtcblx0XHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsXG5cdFx0XHRcdFx0XHRleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSxcblx0XHRcdFx0XHRcdGl0ZW06IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShjaGlsZCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNoaWxkLnRhZ3MgPSBbdGFnMiwgdGFnM107XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLkFkZFRhZywgdGFnOiB7IGlkOiAnY3RybElkXFwwdGFnMycgfSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSwgaXRlbToge1xuXHRcdFx0XHRcdFx0ZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYScsICdpZC1hYyddKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0aXRlbTogeyB0YWdzOiBbJ2N0cmxJZFxcMHRhZzInLCAnY3RybElkXFwwdGFnMyddIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZVRhZywgaWQ6ICdjdHJsSWRcXDB0YWcxJyB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSE7XG5cdFx0XHRhLnRhZ3MgPSBbdGFnMl07XG5cdFx0XHRhLmNoaWxkcmVuLnJlcGxhY2UoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKS5maWx0ZXIodCA9PiB0Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5SZW1vdmVUYWcpLCBbXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZVRhZywgaWQ6ICdjdHJsSWRcXDB0YWczJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBsYWNlcyBvbiB1cmkgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdGNvbnN0IG9sZEEgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSBhcyBUZXN0SXRlbUltcGw7XG5cdFx0XHRjb25zdCB1cmkgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEudXJpPy53aXRoKHsgcGF0aDogJy9kaWZmZXJlbnQnIH0pO1xuXHRcdFx0Y29uc3QgbmV3QSA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1hJywgJ0hlbGxvIHdvcmxkJywgdXJpKTtcblx0XHRcdG5ld0EuY2hpbGRyZW4ucmVwbGFjZShbLi4ub2xkQS5jaGlsZHJlbl0ubWFwKChbXywgaXRlbV0pID0+IGl0ZW0pKTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLnJlcGxhY2UoWy4uLnNpbmdsZS5yb290LmNoaWxkcmVuXS5tYXAoKFtpZCwgaV0pID0+IGlkID09PSAnaWQtYScgPyBuZXdBIDogaSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHsgb3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZSwgaXRlbUlkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiB7IC4uLmNvbnZlcnQuVGVzdEl0ZW0uZnJvbShuZXdBKSB9IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQsXG5cdFx0XHRcdFx0aXRlbTogeyBjb250cm9sbGVySWQ6ICdjdHJsSWQnLCBleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZSwgaXRlbTogY29udmVydC5UZXN0SXRlbS5mcm9tKG5ld0EuY2hpbGRyZW4uZ2V0KCdpZC1hYScpIGFzIFRlc3RJdGVtSW1wbCkgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiBjb252ZXJ0LlRlc3RJdGVtLmZyb20obmV3QS5jaGlsZHJlbi5nZXQoJ2lkLWFiJykgYXMgVGVzdEl0ZW1JbXBsKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyBpbi1wbGFjZSByZXBsYWNlbWVudCBhcyBtdXRhdGlvbicsICgpID0+IHtcblx0XHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXG5cdFx0XHRjb25zdCBvbGRBID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykgYXMgVGVzdEl0ZW1JbXBsO1xuXHRcdFx0Y29uc3QgdXJpID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLnVyaTtcblx0XHRcdGNvbnN0IG5ld0EgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYScsICdIZWxsbyB3b3JsZCcsIHVyaSk7XG5cdFx0XHRuZXdBLmNoaWxkcmVuLnJlcGxhY2UoWy4uLm9sZEEuY2hpbGRyZW5dLm1hcCgoW18sIGl0ZW1dKSA9PiBpdGVtKSk7XG5cdFx0XHRzaW5nbGUucm9vdC5jaGlsZHJlbi5yZXBsYWNlKFtcblx0XHRcdFx0bmV3QSxcblx0XHRcdFx0bmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWInLCBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSEubGFiZWwsIHVyaSksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnXSkudG9TdHJpbmcoKSwgaXRlbTogeyBsYWJlbDogJ0hlbGxvIHdvcmxkJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQsXG5cdFx0XHRcdFx0ZG9jdjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogdXJpXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRuZXdBLmxhYmVsID0gJ3N0aWxsIGNvbm5lY3RlZCc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYSddKS50b1N0cmluZygpLCBpdGVtOiB7IGxhYmVsOiAnc3RpbGwgY29ubmVjdGVkJyB9IH1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRvbGRBLmxhYmVsID0gJ25vIGxvbmdlciBjb25uZWN0ZWQnO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2V4cGFuZGliaWxpdHkgcmVzdG9yYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkb1JlcGxhY2UgPSBhc3luYyAoY2FuUmVzb2x2ZUNoaWxkcmVuID0gdHJ1ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEudXJpO1xuXHRcdFx0XHRjb25zdCBuZXdBID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWEnLCAnSGVsbG8gd29ybGQnLCB1cmkpO1xuXHRcdFx0XHRuZXdBLmNhblJlc29sdmVDaGlsZHJlbiA9IGNhblJlc29sdmVDaGlsZHJlbjtcblx0XHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4ucmVwbGFjZShbXG5cdFx0XHRcdFx0bmV3QSxcblx0XHRcdFx0XHRuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYicsIHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYicpIS5sYWJlbCwgdXJpKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGRyYWluIG1pY3JvdGFza3Ncblx0XHRcdH07XG5cblx0XHRcdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgYW4gdW5leHBhbmRlZCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxzLCBbdW5kZWZpbmVkXSk7XG5cdFx0XHRcdGF3YWl0IGRvUmVwbGFjZSgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVDYWxscywgW3VuZGVmaW5lZF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Jlc3RvcmVzIHJlc29sdmUgc3RhdGUgb24gcmVwbGFjZW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlQ2FsbHMsIFt1bmRlZmluZWQsICdpZC1hJ10pO1xuXHRcdFx0XHRhd2FpdCBkb1JlcGxhY2UoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlQ2FsbHMsIFt1bmRlZmluZWQsICdpZC1hJywgJ2lkLWEnXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZG9lcyBub3QgZXhwYW5kIGlmIG5ldyBjaGlsZCBpcyBub3QgZXhwYW5kYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVDYWxscywgW3VuZGVmaW5lZCwgJ2lkLWEnXSk7XG5cdFx0XHRcdGF3YWl0IGRvUmVwbGFjZShmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZUNhbGxzLCBbdW5kZWZpbmVkLCAnaWQtYSddKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJlYXRzIGluLXBsYWNlIHJlcGxhY2VtZW50IGFzIG11dGF0aW9uIGRlZXBseScsICgpID0+IHtcblx0XHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHRcdHNpbmdsZS5jb2xsZWN0RGlmZigpO1xuXG5cdFx0XHRjb25zdCBvbGRBID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhO1xuXHRcdFx0Y29uc3QgdXJpID0gb2xkQS51cmk7XG5cdFx0XHRjb25zdCBuZXdBID0gbmV3IFRlc3RJdGVtSW1wbCgnY3RybElkJywgJ2lkLWEnLCBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEubGFiZWwsIHVyaSk7XG5cdFx0XHRjb25zdCBvbGRBQSA9IG9sZEEuY2hpbGRyZW4uZ2V0KCdpZC1hYScpITtcblx0XHRcdGNvbnN0IG9sZEFCID0gb2xkQS5jaGlsZHJlbi5nZXQoJ2lkLWFiJykhO1xuXHRcdFx0Y29uc3QgbmV3QUIgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYWInLCAnSGVsbG8gd29ybGQnLCB1cmkpO1xuXHRcdFx0bmV3QS5jaGlsZHJlbi5yZXBsYWNlKFtvbGRBQSwgbmV3QUJdKTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLnJlcGxhY2UoW25ld0EsIHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYicpIV0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlLFxuXHRcdFx0XHRcdGl0ZW06IHsgZXh0SWQ6IFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKG9sZEFCLCAnY3RybElkJykudG9TdHJpbmcoKSwgaXRlbTogeyBsYWJlbDogJ0hlbGxvIHdvcmxkJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQsXG5cdFx0XHRcdFx0ZG9jdjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogdXJpXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRvbGRBQS5sYWJlbCA9ICdzdGlsbCBjb25uZWN0ZWQxJztcblx0XHRcdG5ld0FCLmxhYmVsID0gJ3N0aWxsIGNvbm5lY3RlZDInO1xuXHRcdFx0b2xkQUIubGFiZWwgPSAnbm90IGNvbm5lY3RlZDMnO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnLCAnaWQtYWEnXSkudG9TdHJpbmcoKSwgaXRlbTogeyBsYWJlbDogJ3N0aWxsIGNvbm5lY3RlZDEnIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7IGV4dElkOiBuZXcgVGVzdElkKFsnY3RybElkJywgJ2lkLWEnLCAnaWQtYWInXSkudG9TdHJpbmcoKSwgaXRlbTogeyBsYWJlbDogJ3N0aWxsIGNvbm5lY3RlZDInIH0gfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdBQi5wYXJlbnQsIG5ld0EpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9sZEFBLnBhcmVudCwgbmV3QSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld0EucGFyZW50LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW92ZXMgYW4gaXRlbSB0byBiZSBhIG5ldyBjaGlsZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIDApO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cdFx0XHRjb25zdCBiID0gc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykgYXMgVGVzdEl0ZW1JbXBsO1xuXHRcdFx0Y29uc3QgYSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbDtcblx0XHRcdGEuY2hpbGRyZW4uYWRkKGIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlJlbW92ZSxcblx0XHRcdFx0XHRpdGVtSWQ6IG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYiddKS50b1N0cmluZygpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkFkZCxcblx0XHRcdFx0XHRpdGVtOiB7IGNvbnRyb2xsZXJJZDogJ2N0cmxJZCcsIGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCBpdGVtOiBjb252ZXJ0LlRlc3RJdGVtLmZyb20oYikgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGIubGFiZWwgPSAnc3RpbGwgY29ubmVjdGVkJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsXG5cdFx0XHRcdFx0aXRlbTogeyBleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJywgJ2lkLWInXSkudG9TdHJpbmcoKSwgaXRlbTogeyBsYWJlbDogJ3N0aWxsIGNvbm5lY3RlZCcgfSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2luZ2xlLnJvb3QuY2hpbGRyZW5dLm1hcCgoW18sIGl0ZW1dKSA9PiBpdGVtKSwgW3NpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGIucGFyZW50LCBhKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRzIGRvY3VtZW50IHN5bmMgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgMCk7XG5cdFx0XHRzaW5nbGUuY29sbGVjdERpZmYoKTtcblxuXHRcdFx0Y29uc3QgYSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbDtcblx0XHRcdGEucmFuZ2UgPSBuZXcgUmFuZ2UobmV3IFBvc2l0aW9uKDAsIDApLCBuZXcgUG9zaXRpb24oMSwgMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpbmdsZS5jb2xsZWN0RGlmZigpLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQsXG5cdFx0XHRcdFx0ZG9jdjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy8nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRleHRJZDogbmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1hJ10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBlZGl0b3JSYW5nZS5SYW5nZS5saWZ0KHtcblx0XHRcdFx0XHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMixcblx0XHRcdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDFcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHNlbmRzIG9uIHJlcGxhY2UgZXZlbiBpZiBpdCdzIGEgbm8tb3Bcblx0XHRcdGEucmFuZ2UgPSBhLnJhbmdlO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaW5nbGUuY29sbGVjdERpZmYoKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLkRvY3VtZW50U3luY2VkLFxuXHRcdFx0XHRcdGRvY3Y6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvJylcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBzZW5kcyBvbiBhIGNoaWxkIHJlcGxhY2VtZW50XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnLycpO1xuXHRcdFx0Y29uc3QgYTIgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtYScsICdhJywgdXJpKTtcblx0XHRcdGEyLnJhbmdlID0gYS5yYW5nZTtcblx0XHRcdHNpbmdsZS5yb290LmNoaWxkcmVuLnJlcGxhY2UoW2EyLCBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKSFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2luZ2xlLmNvbGxlY3REaWZmKCksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZCxcblx0XHRcdFx0XHRkb2N2OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnTWlycm9yZWRUZXN0Q29sbGVjdGlvbicsICgpID0+IHtcblx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHJlLXJlbmFibGUgd2hlbiB3ZSBmaWd1cmUgb3V0IHdoYXQgb2JzZXJ2aW5nIGxvb2tzIGxpa2Ugd2UgYXN5bmMgY2hpbGRyZW5cblx0XHQvLyBcdGxldCBtOiBUZXN0TWlycm9yZWRDb2xsZWN0aW9uO1xuXHRcdC8vIFx0c2V0dXAoKCkgPT4gbSA9IG5ldyBUZXN0TWlycm9yZWRDb2xsZWN0aW9uKCkpO1xuXG5cdFx0Ly8gXHR0ZXN0KCdtaXJyb3JzIGNyZWF0aW9uIG9mIHRoZSByb290JywgKCkgPT4ge1xuXHRcdC8vIFx0XHRjb25zdCB0ZXN0cyA9IHRlc3RTdHVicy5uZXN0ZWQoKTtcblx0XHQvLyBcdFx0c2luZ2xlLmFkZFJvb3QodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0c2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdC8vIFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0YXNzZXJ0VHJlZXNFcXVhbChtLnJvb3RUZXN0SXRlbXNbMF0sIG93bmVkLmdldFRlc3RCeUlkKHNpbmdsZS5yb290LmlkKSFbMV0uYWN0dWFsKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0ubGVuZ3RoLCBzaW5nbGUuaXRlbVRvSW50ZXJuYWwuc2l6ZSk7XG5cdFx0Ly8gXHR9KTtcblxuXHRcdC8vIFx0dGVzdCgnbWlycm9ycyBub2RlIGRlbGV0aW9uJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRjb25zdCB0ZXN0cyA9IHRlc3RTdHVicy5uZXN0ZWQoKTtcblx0XHQvLyBcdFx0c2luZ2xlLmFkZFJvb3QodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cdFx0Ly8gXHRcdHNpbmdsZS5leHBhbmQoc2luZ2xlLnJvb3QuaWQsIEluZmluaXR5KTtcblx0XHQvLyBcdFx0dGVzdHMuY2hpbGRyZW4hLnNwbGljZSgwLCAxKTtcblx0XHQvLyBcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRzaW5nbGUuZXhwYW5kKHNpbmdsZS5yb290LmlkLCBJbmZpbml0eSk7XG5cdFx0Ly8gXHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXG5cdFx0Ly8gXHRcdGFzc2VydFRyZWVzRXF1YWwobS5yb290VGVzdEl0ZW1zWzBdLCBvd25lZC5nZXRUZXN0QnlJZChzaW5nbGUucm9vdC5pZCkhWzFdLmFjdHVhbCk7XG5cdFx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmxlbmd0aCwgc2luZ2xlLml0ZW1Ub0ludGVybmFsLnNpemUpO1xuXHRcdC8vIFx0fSk7XG5cblx0XHQvLyBcdHRlc3QoJ21pcnJvcnMgbm9kZSBhZGRpdGlvbicsICgpID0+IHtcblx0XHQvLyBcdFx0Y29uc3QgdGVzdHMgPSB0ZXN0U3R1YnMubmVzdGVkKCk7XG5cdFx0Ly8gXHRcdHNpbmdsZS5hZGRSb290KHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXHRcdC8vIFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uY2hpbGRyZW4hLnB1c2goc3R1YlRlc3QoJ2FjJykpO1xuXHRcdC8vIFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXG5cdFx0Ly8gXHRcdGFzc2VydFRyZWVzRXF1YWwobS5yb290VGVzdEl0ZW1zWzBdLCBvd25lZC5nZXRUZXN0QnlJZChzaW5nbGUucm9vdC5pZCkhWzFdLmFjdHVhbCk7XG5cdFx0Ly8gXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmxlbmd0aCwgc2luZ2xlLml0ZW1Ub0ludGVybmFsLnNpemUpO1xuXHRcdC8vIFx0fSk7XG5cblx0XHQvLyBcdHRlc3QoJ21pcnJvcnMgbm9kZSB1cGRhdGUnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdGNvbnN0IHRlc3RzID0gdGVzdFN0dWJzLm5lc3RlZCgpO1xuXHRcdC8vIFx0XHRzaW5nbGUuYWRkUm9vdCh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0dGVzdHMuY2hpbGRyZW4hWzBdLmRlc2NyaXB0aW9uID0gJ0hlbGxvIHdvcmxkJzsgLyogaXRlbSBhICovXG5cdFx0Ly8gXHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0YXNzZXJ0VHJlZXNFcXVhbChtLnJvb3RUZXN0SXRlbXNbMF0sIG93bmVkLmdldFRlc3RCeUlkKHNpbmdsZS5yb290LmlkKSFbMV0uYWN0dWFsKTtcblx0XHQvLyBcdH0pO1xuXG5cdFx0Ly8gXHRzdWl0ZSgnTWlycm9yZWRDaGFuZ2VDb2xsZWN0b3InLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdGxldCB0ZXN0cyA9IHRlc3RTdHVicy5uZXN0ZWQoKTtcblx0XHQvLyBcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdC8vIFx0XHRcdHRlc3RzID0gdGVzdFN0dWJzLm5lc3RlZCgpO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5hZGRSb290KHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cdFx0Ly8gXHRcdH0pO1xuXG5cdFx0Ly8gXHRcdHRlc3QoJ2NyZWF0ZXMgY2hhbmdlIGZvciByb290JywgKCkgPT4ge1xuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC5hZGRlZCwgW1xuXHRcdC8vIFx0XHRcdFx0dGVzdHMsXG5cdFx0Ly8gXHRcdFx0XHR0ZXN0cy5jaGlsZHJlblswXSxcblx0XHQvLyBcdFx0XHRcdHRlc3RzLmNoaWxkcmVuIVswXS5jaGlsZHJlbiFbMF0sXG5cdFx0Ly8gXHRcdFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uY2hpbGRyZW4hWzFdLFxuXHRcdC8vIFx0XHRcdFx0dGVzdHMuY2hpbGRyZW5bMV0sXG5cdFx0Ly8gXHRcdFx0XSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnJlbW92ZWQsIFtdKTtcblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQudXBkYXRlZCwgW10pO1xuXHRcdC8vIFx0XHR9KTtcblxuXHRcdC8vIFx0XHR0ZXN0KCdjcmVhdGVzIGNoYW5nZSBmb3IgZGVsZXRlJywgKCkgPT4ge1xuXHRcdC8vIFx0XHRcdGNvbnN0IHJtID0gdGVzdHMuY2hpbGRyZW4uc2hpZnQoKSE7XG5cdFx0Ly8gXHRcdFx0c2luZ2xlLm9uSXRlbUNoYW5nZSh0ZXN0cywgJ3BpZCcpO1xuXHRcdC8vIFx0XHRcdG0uYXBwbHkoc2luZ2xlLmNvbGxlY3REaWZmKCkpO1xuXG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LmFkZGVkLCBbXSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnJlbW92ZWQsIFtcblx0XHQvLyBcdFx0XHRcdHsgLi4ucm0gfSxcblx0XHQvLyBcdFx0XHRcdHsgLi4ucm0uY2hpbGRyZW4hWzBdIH0sXG5cdFx0Ly8gXHRcdFx0XHR7IC4uLnJtLmNoaWxkcmVuIVsxXSB9LFxuXHRcdC8vIFx0XHRcdF0pO1xuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC51cGRhdGVkLCBbXSk7XG5cdFx0Ly8gXHRcdH0pO1xuXG5cdFx0Ly8gXHRcdHRlc3QoJ2NyZWF0ZXMgY2hhbmdlIGZvciB1cGRhdGUnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdFx0dGVzdHMuY2hpbGRyZW5bMF0ubGFiZWwgPSAndXBkYXRlZCEnO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblxuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC5hZGRlZCwgW10pO1xuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC5yZW1vdmVkLCBbXSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnVwZGF0ZWQsIFt0ZXN0cy5jaGlsZHJlblswXV0pO1xuXHRcdC8vIFx0XHR9KTtcblxuXHRcdC8vIFx0XHR0ZXN0KCdpcyBhIG5vLW9wIGlmIGEgbm9kZSBpcyBhZGRlZCBhbmQgcmVtb3ZlZCcsICgpID0+IHtcblx0XHQvLyBcdFx0XHRjb25zdCBuZXN0ZWQgPSB0ZXN0U3R1YnMubmVzdGVkKCdpZDItJyk7XG5cdFx0Ly8gXHRcdFx0dGVzdHMuY2hpbGRyZW4ucHVzaChuZXN0ZWQpO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbi5wb3AoKTtcblx0XHQvLyBcdFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdFx0Y29uc3QgcHJldmlvdXNFdmVudCA9IG0uY2hhbmdlRXZlbnQ7XG5cdFx0Ly8gXHRcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uY2hhbmdlRXZlbnQsIHByZXZpb3VzRXZlbnQpO1xuXHRcdC8vIFx0XHR9KTtcblxuXHRcdC8vIFx0XHR0ZXN0KCdpcyBhIHNpbmdsZS1vcCBpZiBhIG5vZGUgaXMgYWRkZWQgYW5kIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Ly8gXHRcdFx0Y29uc3QgY2hpbGQgPSBzdHViVGVzdCgnYycpO1xuXHRcdC8vIFx0XHRcdHRlc3RzLmNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRjaGlsZC5sYWJlbCA9ICdkJztcblx0XHQvLyBcdFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0XHRhc3NlcnRUcmVlTGlzdEVxdWFsKG0uY2hhbmdlRXZlbnQuYWRkZWQsIFtjaGlsZF0pO1xuXHRcdC8vIFx0XHRcdGFzc2VydFRyZWVMaXN0RXF1YWwobS5jaGFuZ2VFdmVudC5yZW1vdmVkLCBbXSk7XG5cdFx0Ly8gXHRcdFx0YXNzZXJ0VHJlZUxpc3RFcXVhbChtLmNoYW5nZUV2ZW50LnVwZGF0ZWQsIFtdKTtcblx0XHQvLyBcdFx0fSk7XG5cblx0XHQvLyBcdFx0dGVzdCgnZ2V0cyB0aGUgY29tbW9uIGFuY2VzdG9yICgxKScsICgpID0+IHtcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uY2hpbGRyZW4hWzBdLmxhYmVsID0gJ3phJztcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uY2hpbGRyZW4hWzFdLmxhYmVsID0gJ3piJztcblx0XHQvLyBcdFx0XHRzaW5nbGUub25JdGVtQ2hhbmdlKHRlc3RzLCAncGlkJyk7XG5cdFx0Ly8gXHRcdFx0bS5hcHBseShzaW5nbGUuY29sbGVjdERpZmYoKSk7XG5cblx0XHQvLyBcdFx0fSk7XG5cblx0XHQvLyBcdFx0dGVzdCgnZ2V0cyB0aGUgY29tbW9uIGFuY2VzdG9yICgyKScsICgpID0+IHtcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbiFbMF0uY2hpbGRyZW4hWzBdLmxhYmVsID0gJ3phJztcblx0XHQvLyBcdFx0XHR0ZXN0cy5jaGlsZHJlbiFbMV0ubGFiZWwgPSAnYWInO1xuXHRcdC8vIFx0XHRcdHNpbmdsZS5vbkl0ZW1DaGFuZ2UodGVzdHMsICdwaWQnKTtcblx0XHQvLyBcdFx0XHRtLmFwcGx5KHNpbmdsZS5jb2xsZWN0RGlmZigpKTtcblx0XHQvLyBcdFx0fSk7XG5cdFx0Ly8gXHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rlc3RSdW5UcmFja2VyJywgKCkgPT4ge1xuXHRcdGxldCBwcm94eTogTW9ja09iamVjdDxNYWluVGhyZWFkVGVzdGluZ1NoYXBlPjtcblx0XHRsZXQgYzogVGVzdFJ1bkNvb3JkaW5hdG9yO1xuXHRcdGxldCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRcdGxldCBjb25maWd1cmF0aW9uOiBUZXN0UnVuUHJvZmlsZUltcGw7XG5cblx0XHRsZXQgcmVxOiBUZXN0UnVuUmVxdWVzdDtcblxuXHRcdGxldCBkdG86IFRlc3RSdW5EdG87XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgZXh0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gPSB7fSBhcyBhbnk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiBjLnRyYWNrZXJzKSB7XG5cdFx0XHRcdGMuZGlzcG9zZVRlc3RSdW4oaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJveHkgPSBtb2NrT2JqZWN0PE1haW5UaHJlYWRUZXN0aW5nU2hhcGU+KCkoKTtcblx0XHRcdGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0YyA9IG5ldyBUZXN0UnVuQ29vcmRpbmF0b3IocHJveHksIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdFx0Y29uZmlndXJhdGlvbiA9IG5ldyBUZXN0UnVuUHJvZmlsZUltcGwobW9ja09iamVjdDxNYWluVGhyZWFkVGVzdGluZ1NoYXBlPigpKCksIG5ldyBNYXAoKSwgbmV3IFNldCgpLCBFdmVudC5Ob25lLCAnY3RybElkJywgNDIsICdEbyBSdW4nLCBUZXN0UnVuUHJvZmlsZUtpbmQuUnVuLCAoKSA9PiB7IH0sIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgc2luZ2xlLmV4cGFuZChzaW5nbGUucm9vdC5pZCwgSW5maW5pdHkpO1xuXHRcdFx0c2luZ2xlLmNvbGxlY3REaWZmKCk7XG5cblx0XHRcdHJlcSA9IHtcblx0XHRcdFx0aW5jbHVkZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRleGNsdWRlOiBbc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1iJykhXSxcblx0XHRcdFx0cHJvZmlsZTogY29uZmlndXJhdGlvbixcblx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHR9O1xuXG5cdFx0XHRkdG8gPSBUZXN0UnVuRHRvLmZyb21JbnRlcm5hbCh7XG5cdFx0XHRcdGNvbnRyb2xsZXJJZDogJ2N0cmwnLFxuXHRcdFx0XHRwcm9maWxlSWQ6IGNvbmZpZ3VyYXRpb24ucHJvZmlsZUlkLFxuXHRcdFx0XHRleGNsdWRlRXh0SWRzOiBbJ2lkLWInXSxcblx0XHRcdFx0cnVuSWQ6ICdydW4taWQnLFxuXHRcdFx0XHR0ZXN0SWRzOiBbc2luZ2xlLnJvb3QuaWRdLFxuXHRcdFx0fSwgc2luZ2xlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYWNrcyBhIHJ1biBzdGFydGVkIGZyb20gYSBtYWluIHRocmVhZCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IGRzLmFkZChjLnByZXBhcmVGb3JNYWluVGhyZWFkVGVzdFJ1bihleHQsIHJlcSwgZHRvLCBjb25maWd1cmF0aW9uLCBjdHMudG9rZW4pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgZmFsc2UpO1xuXG5cdFx0XHRjb25zdCB0YXNrMSA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdydW4xJywgdHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrMiA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdydW4yJywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuJHN0YXJ0ZWRFeHRlbnNpb25UZXN0UnVuLmNhbGxlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCB0cnVlKTtcblxuXHRcdFx0dGFzazEuYXBwZW5kT3V0cHV0KCdoZWxsbycpO1xuXHRcdFx0Y29uc3QgdGFza0lkID0gcHJveHkuJGFwcGVuZE91dHB1dFRvUnVuLmFyZ3NbMF0/LlsxXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1sncnVuLWlkJywgdGFza0lkLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbycpLCB1bmRlZmluZWQsIHVuZGVmaW5lZF1dLCBwcm94eS4kYXBwZW5kT3V0cHV0VG9SdW4uYXJncyk7XG5cdFx0XHR0YXNrMS5lbmQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LiRmaW5pc2hlZEV4dGVuc2lvblRlc3RSdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXG5cdFx0XHR0YXNrMi5lbmQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LiRmaW5pc2hlZEV4dGVuc2lvblRlc3RSdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3J1biBjYW5jZWwgZm9yY2UgZW5kcyBhZnRlciBhIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHRyYWNrZXIgPSBkcy5hZGQoYy5wcmVwYXJlRm9yTWFpblRocmVhZFRlc3RSdW4oZXh0LCByZXEsIGR0bywgY29uZmlndXJhdGlvbiwgY3RzLnRva2VuKSk7XG5cdFx0XHRcdGNvbnN0IHRhc2sgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybCcsIHNpbmdsZSwgcmVxLCAncnVuMScsIHRydWUpO1xuXHRcdFx0XHRjb25zdCBvbkVuZGVkID0gc2lub24uc3R1YigpO1xuXHRcdFx0XHRkcy5hZGQodHJhY2tlci5vbkVuZChvbkVuZGVkKSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2sudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCB0cnVlKTtcblx0XHRcdFx0dHJhY2tlci5jYW5jZWwoKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFzay50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cblx0XHRcdFx0Y2xvY2sudGljayg5OTk5KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRW5kZWQuY2FsbGVkLCBmYWxzZSk7XG5cblx0XHRcdFx0Y2xvY2sudGljaygxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRW5kZWQuY2FsbGVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzLCBmYWxzZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdydW4gY2FuY2VsIGZvcmNlIGVuZHMgb24gc2Vjb25kIGNhbmNlbGxhdGlvbiByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IGRzLmFkZChjLnByZXBhcmVGb3JNYWluVGhyZWFkVGVzdFJ1bihleHQsIHJlcSwgZHRvLCBjb25maWd1cmF0aW9uLCBjdHMudG9rZW4pKTtcblx0XHRcdGNvbnN0IHRhc2sgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybCcsIHNpbmdsZSwgcmVxLCAncnVuMScsIHRydWUpO1xuXHRcdFx0Y29uc3Qgb25FbmRlZCA9IHNpbm9uLnN0dWIoKTtcblx0XHRcdGRzLmFkZCh0cmFja2VyLm9uRW5kKG9uRW5kZWQpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2sudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmhhc1J1bm5pbmdUYXNrcywgdHJ1ZSk7XG5cdFx0XHR0cmFja2VyLmNhbmNlbCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFzay50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uRW5kZWQuY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHR0cmFja2VyLmNhbmNlbCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkVuZGVkLmNhbGxlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFja3MgYSBydW4gc3RhcnRlZCBmcm9tIGFuIGV4dGVuc2lvbiByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFzazEgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybCcsIHNpbmdsZSwgcmVxLCAnaGVsbG8gd29ybGQnLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IHRyYWNrZXIgPSBJdGVyYWJsZS5maXJzdChjLnRyYWNrZXJzKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kc3RhcnRlZEV4dGVuc2lvblRlc3RSdW4uYXJncywgW1xuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdHByb2ZpbGU6IHsgZ3JvdXA6IDIsIGlkOiA0MiB9LFxuXHRcdFx0XHRcdGNvbnRyb2xsZXJJZDogJ2N0cmwnLFxuXHRcdFx0XHRcdGlkOiB0cmFja2VyLmlkLFxuXHRcdFx0XHRcdGluY2x1ZGU6IFtzaW5nbGUucm9vdC5pZF0sXG5cdFx0XHRcdFx0ZXhjbHVkZTogW25ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtYiddKS50b1N0cmluZygpXSxcblx0XHRcdFx0XHRwZXJzaXN0OiBmYWxzZSxcblx0XHRcdFx0XHRjb250aW51b3VzOiBmYWxzZSxcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZSxcblx0XHRcdFx0fV1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0YXNrMiA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCByZXEsICdydW4yJywgdHJ1ZSk7XG5cdFx0XHRjb25zdCB0YXNrM0RldGFjaGVkID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmwnLCBzaW5nbGUsIHsgLi4ucmVxIH0sICd0YXNrM0RldGFjaGVkJywgdHJ1ZSk7XG5cblx0XHRcdHRhc2sxLmVuZCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5LiRmaW5pc2hlZEV4dGVuc2lvblRlc3RSdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIHRydWUpO1xuXG5cdFx0XHR0YXNrMi5lbmQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJveHkuJGZpbmlzaGVkRXh0ZW5zaW9uVGVzdFJ1bi5hcmdzLCBbW3RyYWNrZXIuaWRdXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5oYXNSdW5uaW5nVGFza3MsIGZhbHNlKTtcblxuXHRcdFx0dGFzazNEZXRhY2hlZC5lbmQoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgdGVzdHMgdG8gcnVuIHNtYXJ0bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrMSA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsSWQnLCBzaW5nbGUsIHJlcSwgJ2hlbGxvIHdvcmxkJywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IEl0ZXJhYmxlLmZpcnN0KGMudHJhY2tlcnMpITtcblx0XHRcdGNvbnN0IGV4cGVjdGVkQXJnczogdW5rbm93bltdW10gPSBbXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJveHkuJGFkZFRlc3RzVG9SdW4uYXJncywgZXhwZWN0ZWRBcmdzKTtcblxuXHRcdFx0dGFzazEucGFzc2VkKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5nZXQoJ2lkLWFhJykhKTtcblx0XHRcdGV4cGVjdGVkQXJncy5wdXNoKFtcblx0XHRcdFx0J2N0cmxJZCcsXG5cdFx0XHRcdHRyYWNrZXIuaWQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjb252ZXJ0LlRlc3RJdGVtLmZyb20oc2luZ2xlLnJvb3QpLFxuXHRcdFx0XHRcdGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSBhcyBUZXN0SXRlbUltcGwpLFxuXHRcdFx0XHRcdGNvbnZlcnQuVGVzdEl0ZW0uZnJvbShzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuY2hpbGRyZW4uZ2V0KCdpZC1hYScpIGFzIFRlc3RJdGVtSW1wbCksXG5cdFx0XHRcdF1cblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kYWRkVGVzdHNUb1J1bi5hcmdzLCBleHBlY3RlZEFyZ3MpO1xuXG5cdFx0XHR0YXNrMS5lbnF1ZXVlZChzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWEnKSEuY2hpbGRyZW4uZ2V0KCdpZC1hYicpISk7XG5cdFx0XHRleHBlY3RlZEFyZ3MucHVzaChbXG5cdFx0XHRcdCdjdHJsSWQnLFxuXHRcdFx0XHR0cmFja2VyLmlkLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Y29udmVydC5UZXN0SXRlbS5mcm9tKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIGFzIFRlc3RJdGVtSW1wbCksXG5cdFx0XHRcdFx0Y29udmVydC5UZXN0SXRlbS5mcm9tKHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpIS5jaGlsZHJlbi5nZXQoJ2lkLWFiJykgYXMgVGVzdEl0ZW1JbXBsKSxcblx0XHRcdFx0XSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kYWRkVGVzdHNUb1J1bi5hcmdzLCBleHBlY3RlZEFyZ3MpO1xuXG5cdFx0XHR0YXNrMS5wYXNzZWQoc2luZ2xlLnJvb3QuY2hpbGRyZW4uZ2V0KCdpZC1hJykhLmNoaWxkcmVuLmdldCgnaWQtYWInKSEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm94eS4kYWRkVGVzdHNUb1J1bi5hcmdzLCBleHBlY3RlZEFyZ3MpO1xuXG5cdFx0XHR0YXNrMS5lbmQoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgdGVzdCBtZXNzYWdlcyB0byBydW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0MSA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1jJywgJ3Rlc3QgYycsIFVSSS5maWxlKCcvdGVzdGMudHh0JykpO1xuXHRcdFx0Y29uc3QgdGVzdDIgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtZCcsICd0ZXN0IGQnLCBVUkkuZmlsZSgnL3Rlc3RkLnR4dCcpKTtcblx0XHRcdHRlc3QxLnJhbmdlID0gdGVzdDIucmFuZ2UgPSBuZXcgUmFuZ2UobmV3IFBvc2l0aW9uKDAsIDApLCBuZXcgUG9zaXRpb24oMSwgMCkpO1xuXHRcdFx0c2luZ2xlLnJvb3QuY2hpbGRyZW4ucmVwbGFjZShbdGVzdDEsIHRlc3QyXSk7XG5cdFx0XHRjb25zdCB0YXNrID0gYy5jcmVhdGVUZXN0UnVuKGV4dCwgJ2N0cmxJZCcsIHNpbmdsZSwgcmVxLCAnaGVsbG8gd29ybGQnLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2UxID0gbmV3IFRlc3RNZXNzYWdlKCdzb21lIG1lc3NhZ2UnKTtcblx0XHRcdG1lc3NhZ2UxLmxvY2F0aW9uID0gbmV3IExvY2F0aW9uKFVSSS5maWxlKCcvYS50eHQnKSwgbmV3IFBvc2l0aW9uKDAsIDApKTtcblx0XHRcdHRhc2suZmFpbGVkKHRlc3QxLCBtZXNzYWdlMSk7XG5cblx0XHRcdGNvbnN0IGFyZ3MgPSBwcm94eS4kYXBwZW5kVGVzdE1lc3NhZ2VzSW5SdW4uYXJnc1swXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJveHkuJGFwcGVuZFRlc3RNZXNzYWdlc0luUnVuLmFyZ3NbMF0sIFtcblx0XHRcdFx0YXJnc1swXSxcblx0XHRcdFx0YXJnc1sxXSxcblx0XHRcdFx0bmV3IFRlc3RJZChbJ2N0cmxJZCcsICdpZC1jJ10pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bWVzc2FnZTogJ3NvbWUgbWVzc2FnZScsXG5cdFx0XHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yLFxuXHRcdFx0XHRcdGV4cGVjdGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29udGV4dFZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YWN0dWFsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bG9jYXRpb246IGNvbnZlcnQubG9jYXRpb24uZnJvbShtZXNzYWdlMS5sb2NhdGlvbiksXG5cdFx0XHRcdFx0c3RhY2tUcmFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHNob3VsZCB1c2UgdGVzdCBsb2NhdGlvbiBhcyBkZWZhdWx0XG5cdFx0XHR0YXNrLmZhaWxlZCh0ZXN0MiwgbmV3IFRlc3RNZXNzYWdlKCdzb21lIG1lc3NhZ2UnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRhcHBlbmRUZXN0TWVzc2FnZXNJblJ1bi5hcmdzWzFdLCBbXG5cdFx0XHRcdGFyZ3NbMF0sXG5cdFx0XHRcdGFyZ3NbMV0sXG5cdFx0XHRcdG5ldyBUZXN0SWQoWydjdHJsSWQnLCAnaWQtZCddKS50b1N0cmluZygpLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdG1lc3NhZ2U6ICdzb21lIG1lc3NhZ2UnLFxuXHRcdFx0XHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcixcblx0XHRcdFx0XHRjb250ZXh0VmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRleHBlY3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFjdHVhbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiBjb252ZXJ0LmxvY2F0aW9uLmZyb20oeyB1cmk6IHRlc3QyLnVyaSEsIHJhbmdlOiB0ZXN0Mi5yYW5nZSB9KSxcblx0XHRcdFx0XHRzdGFja1RyYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH1dXG5cdFx0XHRdKTtcblxuXHRcdFx0dGFzay5lbmQoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2d1YXJkcyBjYWxscyBhZnRlciBydW5zIGFyZSBlbmRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhc2sgPSBjLmNyZWF0ZVRlc3RSdW4oZXh0LCAnY3RybCcsIHNpbmdsZSwgcmVxLCAnaGVsbG8gd29ybGQnLCBmYWxzZSk7XG5cdFx0XHR0YXNrLmVuZCgpO1xuXG5cdFx0XHR0YXNrLmZhaWxlZChzaW5nbGUucm9vdCwgbmV3IFRlc3RNZXNzYWdlKCdzb21lIG1lc3NhZ2UnKSk7XG5cdFx0XHR0YXNrLmFwcGVuZE91dHB1dCgnb3V0cHV0Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS4kYWRkVGVzdHNUb1J1bi5jYWxsZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm94eS4kYXBwZW5kT3V0cHV0VG9SdW4uY2FsbGVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJveHkuJGFwcGVuZFRlc3RNZXNzYWdlc0luUnVuLmNhbGxlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0cyBzdGF0ZSBvZiB0ZXN0IHdpdGggaWRlbnRpY2FsIGxvY2FsIElEcyAoIzEzMTgyNyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0QSA9IHNpbmdsZS5yb290LmNoaWxkcmVuLmdldCgnaWQtYScpO1xuXHRcdFx0Y29uc3QgdGVzdEIgPSBzaW5nbGUucm9vdC5jaGlsZHJlbi5nZXQoJ2lkLWInKTtcblx0XHRcdGNvbnN0IGNoaWxkQSA9IG5ldyBUZXN0SXRlbUltcGwoJ2N0cmxJZCcsICdpZC1jaGlsZCcsICdjaGlsZCcsIHVuZGVmaW5lZCk7XG5cdFx0XHR0ZXN0QSEuY2hpbGRyZW4ucmVwbGFjZShbY2hpbGRBXSk7XG5cdFx0XHRjb25zdCBjaGlsZEIgPSBuZXcgVGVzdEl0ZW1JbXBsKCdjdHJsSWQnLCAnaWQtY2hpbGQnLCAnY2hpbGQnLCB1bmRlZmluZWQpO1xuXHRcdFx0dGVzdEIhLmNoaWxkcmVuLnJlcGxhY2UoW2NoaWxkQl0pO1xuXG5cdFx0XHRjb25zdCB0YXNrMSA9IGMuY3JlYXRlVGVzdFJ1bihleHQsICdjdHJsJywgc2luZ2xlLCBuZXcgVGVzdFJ1blJlcXVlc3RJbXBsKCksICdoZWxsbyB3b3JsZCcsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHRyYWNrZXIgPSBJdGVyYWJsZS5maXJzdChjLnRyYWNrZXJzKSE7XG5cblx0XHRcdHRhc2sxLnBhc3NlZChjaGlsZEEpO1xuXHRcdFx0dGFzazEucGFzc2VkKGNoaWxkQik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3h5LiRhZGRUZXN0c1RvUnVuLmFyZ3MsIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdjdHJsJyxcblx0XHRcdFx0XHR0cmFja2VyLmlkLFxuXHRcdFx0XHRcdFtzaW5nbGUucm9vdCwgdGVzdEEsIGNoaWxkQV0ubWFwKHQgPT4gY29udmVydC5UZXN0SXRlbS5mcm9tKHQgYXMgVGVzdEl0ZW1JbXBsKSksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnY3RybCcsXG5cdFx0XHRcdFx0dHJhY2tlci5pZCxcblx0XHRcdFx0XHRbc2luZ2xlLnJvb3QsIHRlc3RCLCBjaGlsZEJdLm1hcCh0ID0+IGNvbnZlcnQuVGVzdEl0ZW0uZnJvbSh0IGFzIFRlc3RJdGVtSW1wbCkpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XSk7XG5cblx0XHRcdHRhc2sxLmVuZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VydmljZScsICgpID0+IHtcblx0XHRsZXQgY3RybDogVGVzdEV4dEhvc3RUZXN0aW5nO1xuXG5cdFx0Y2xhc3MgVGVzdEV4dEhvc3RUZXN0aW5nIGV4dGVuZHMgRXh0SG9zdFRlc3Rpbmcge1xuXHRcdFx0cHVibGljIGdldFByb2ZpbGVJbnRlcm5hbElkKGN0cmw6IFRlc3RDb250cm9sbGVyLCBwcm9maWxlOiBUZXN0UnVuUHJvZmlsZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtpZCwgcF0gb2YgdGhpcy5jb250cm9sbGVycy5nZXQoY3RybC5pZCkhLnByb2ZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKHByb2ZpbGUgPT09IHApIHtcblx0XHRcdFx0XHRcdHJldHVybiBpZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Byb2ZpbGUgbm90IGZvdW5kJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBBbnlDYWxsUlBDUHJvdG9jb2woKTtcblx0XHRcdGN0cmwgPSBkcy5hZGQobmV3IFRlc3RFeHRIb3N0VGVzdGluZyhcblx0XHRcdFx0cnBjUHJvdG9jb2wsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgRXh0SG9zdENvbW1hbmRzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHRcdG5ldyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBvc2VzIGFjdGl2ZSBwcm9maWxlcyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRBID0geyAuLi5udWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkZW50aWZpZXI6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdleHQuYScpLCBlbmFibGVkQXBpUHJvcG9zYWxzOiBbJ3Rlc3RpbmdBY3RpdmVQcm9maWxlJ10gfTtcblx0XHRcdGNvbnN0IGV4dEIgPSB7IC4uLm51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWRlbnRpZmllcjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2V4dC5iJyksIGVuYWJsZWRBcGlQcm9wb3NhbHM6IFsndGVzdGluZ0FjdGl2ZVByb2ZpbGUnXSB9O1xuXG5cdFx0XHRjb25zdCBjdHJsQSA9IGRzLmFkZChjdHJsLmNyZWF0ZVRlc3RDb250cm9sbGVyKGV4dEEsICdhJywgJ2N0cmxhJykpO1xuXHRcdFx0Y29uc3QgcHJvZkFBID0gZHMuYWRkKGN0cmxBLmNyZWF0ZVJ1blByb2ZpbGUoJ2FhJywgVGVzdFJ1blByb2ZpbGVLaW5kLlJ1biwgKCkgPT4geyB9KSk7XG5cdFx0XHRjb25zdCBwcm9mQUIgPSBkcy5hZGQoY3RybEEuY3JlYXRlUnVuUHJvZmlsZSgnYWInLCBUZXN0UnVuUHJvZmlsZUtpbmQuUnVuLCAoKSA9PiB7IH0pKTtcblxuXHRcdFx0Y29uc3QgY3RybEIgPSBkcy5hZGQoY3RybC5jcmVhdGVUZXN0Q29udHJvbGxlcihleHRCLCAnYicsICdjdHJsYicpKTtcblx0XHRcdGNvbnN0IHByb2ZCQSA9IGRzLmFkZChjdHJsQi5jcmVhdGVSdW5Qcm9maWxlKCdiYScsIFRlc3RSdW5Qcm9maWxlS2luZC5SdW4sICgpID0+IHsgfSkpO1xuXHRcdFx0Y29uc3QgcHJvZkJCID0gZHMuYWRkKGN0cmxCLmNyZWF0ZVJ1blByb2ZpbGUoJ2JiJywgVGVzdFJ1blByb2ZpbGVLaW5kLlJ1biwgKCkgPT4geyB9KSk7XG5cdFx0XHRjb25zdCBuZXZlckNhbGxlZCA9IHNpbm9uLnN0dWIoKTtcblxuXHRcdFx0Ly8gZW1wdHkgZGVmYXVsdCBzdGF0ZTpcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZkFBLmlzRGVmYXVsdCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9mQkEuaXNEZWZhdWx0LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2ZCQi5pc0RlZmF1bHQsIGZhbHNlKTtcblxuXHRcdFx0Ly8gZmlyZXMgYSBjaGFuZ2UgZXZlbnQ6XG5cdFx0XHRjb25zdCBjaGFuZ2VBID0gRXZlbnQudG9Qcm9taXNlKHByb2ZBQS5vbkRpZENoYW5nZURlZmF1bHQgYXMgRXZlbnQ8Ym9vbGVhbj4pO1xuXHRcdFx0Y29uc3QgY2hhbmdlQkEgPSBFdmVudC50b1Byb21pc2UocHJvZkJBLm9uRGlkQ2hhbmdlRGVmYXVsdCBhcyBFdmVudDxib29sZWFuPik7XG5cdFx0XHRjb25zdCBjaGFuZ2VCQiA9IEV2ZW50LnRvUHJvbWlzZShwcm9mQkIub25EaWRDaGFuZ2VEZWZhdWx0IGFzIEV2ZW50PGJvb2xlYW4+KTtcblxuXHRcdFx0ZHMuYWRkKHByb2ZBQi5vbkRpZENoYW5nZURlZmF1bHQobmV2ZXJDYWxsZWQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXZlckNhbGxlZC5jYWxsZWQsIGZhbHNlKTtcblxuXHRcdFx0Y3RybC4kc2V0RGVmYXVsdFJ1blByb2ZpbGVzKHtcblx0XHRcdFx0YTogW2N0cmwuZ2V0UHJvZmlsZUludGVybmFsSWQoY3RybEEsIHByb2ZBQSldLFxuXHRcdFx0XHRiOiBbY3RybC5nZXRQcm9maWxlSW50ZXJuYWxJZChjdHJsQiwgcHJvZkJBKSwgY3RybC5nZXRQcm9maWxlSW50ZXJuYWxJZChjdHJsQiwgcHJvZkJCKV1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGNoYW5nZUEsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBjaGFuZ2VCQSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGNoYW5nZUJCLCB0cnVlKTtcblxuXHRcdFx0Ly8gdXBkYXRlcyBpbnRlcm5hbCBzdGF0ZTpcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZkFBLmlzRGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2ZCQS5pc0RlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9mQkIuaXNEZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvZkFCLmlzRGVmYXVsdCwgZmFsc2UpO1xuXG5cdFx0XHQvLyBuby1vcHMgaWYgZXF1YWxcblx0XHRcdGRzLmFkZChwcm9mQUEub25EaWRDaGFuZ2VEZWZhdWx0KG5ldmVyQ2FsbGVkKSk7XG5cdFx0XHRjdHJsLiRzZXREZWZhdWx0UnVuUHJvZmlsZXMoe1xuXHRcdFx0XHRhOiBbY3RybC5nZXRQcm9maWxlSW50ZXJuYWxJZChjdHJsQSwgcHJvZkFBKV0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXZlckNhbGxlZC5jYWxsZWQsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLGtCQUE4QjtBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLDJCQUFrRDtBQUMzRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLGdCQUFnQixvQkFBb0IsWUFBWSwwQkFBMEI7QUFDbkYsU0FBUywyQkFBMkIsb0JBQW9CO0FBQ3hELFlBQVksYUFBYTtBQUN6QixTQUFTLFVBQVUsVUFBVSxPQUFPLGFBQWEsb0JBQW9CLGtCQUFrQixvQkFBb0IsZUFBZTtBQUMxSCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0IscUJBQXFCLHVCQUFrQztBQUNoRixTQUFTLGdDQUFnQztBQUd6QyxNQUFNLFdBQVcsQ0FBQyxVQUFvQjtBQUFBLEVBQ3JDLElBQUksS0FBSztBQUFBLEVBQ1QsT0FBTyxLQUFLO0FBQUEsRUFDWixLQUFLLEtBQUs7QUFBQSxFQUNWLE9BQU8sS0FBSztBQUNiO0FBRUEsTUFBTSxtQkFBbUIsQ0FBQyxHQUE2QixNQUFnQztBQUN0RixNQUFJLENBQUMsR0FBRztBQUNQLFVBQU0sSUFBSSxPQUFPLGVBQWUsRUFBRSxTQUFTLDRCQUE0QixRQUFRLEVBQUUsQ0FBQztBQUFBLEVBQ25G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
