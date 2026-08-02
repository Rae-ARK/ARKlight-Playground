import assert from "assert";
import * as sinon from "sinon";
import { Emitter } from "../../../../base/common/event.js";
import { ExtHostTreeViews } from "../../common/extHostTreeViews.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TreeItemCollapsibleState } from "../../../common/views.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription as extensionsDescription } from "../../../services/extensions/common/extensions.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function unBatchChildren(result) {
  if (!result || result.length === 0) {
    return void 0;
  }
  if (result.length > 1) {
    throw new Error("Unexpected result length, all tests are unbatched.");
  }
  return result[0].slice(1);
}
suite("ExtHostTreeView", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class RecordingShape extends mock() {
    constructor() {
      super(...arguments);
      this.onRefresh = new Emitter();
    }
    async $registerTreeViewDataProvider(treeViewId) {
    }
    $refresh(viewId, itemsToRefresh) {
      return Promise.resolve(null).then(() => {
        this.onRefresh.fire(itemsToRefresh);
      });
    }
    $reveal(treeViewId, itemInfo, options) {
      return Promise.resolve();
    }
    $disposeTree(treeViewId) {
      return Promise.resolve();
    }
  }
  let testObject;
  let target;
  let onDidChangeTreeNode;
  let onDidChangeTreeNodeWithId;
  let tree;
  let labels;
  let nodes;
  setup(() => {
    tree = {
      "a": {
        "aa": {},
        "ab": {}
      },
      "b": {
        "ba": {},
        "bb": {}
      }
    };
    labels = {};
    nodes = {};
    const rpcProtocol = new TestRPCProtocol();
    rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
      $registerCommand() {
      }
    }());
    target = new RecordingShape();
    testObject = store.add(new ExtHostTreeViews(target, new ExtHostCommands(
      rpcProtocol,
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    ), new NullLogService()));
    onDidChangeTreeNode = new Emitter();
    onDidChangeTreeNodeWithId = new Emitter();
    testObject.createTreeView("testNodeTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    testObject.createTreeView("testNodeWithIdTreeProvider", { treeDataProvider: aNodeWithIdTreeDataProvider() }, extensionsDescription);
    testObject.createTreeView("testNodeWithHighlightsTreeProvider", { treeDataProvider: aNodeWithHighlightedLabelTreeDataProvider() }, extensionsDescription);
    return loadCompleteTree("testNodeTreeProvider");
  });
  test("construct node tree", () => {
    return testObject.$getChildren("testNodeTreeProvider").then((elements) => {
      const actuals = unBatchChildren(elements)?.map((e) => e.handle);
      assert.deepStrictEqual(actuals, ["0/0:a", "0/0:b"]);
      return Promise.all([
        testObject.$getChildren("testNodeTreeProvider", ["0/0:a"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/0:a/0:aa", "0/0:a/0:ab"]);
          return Promise.all([
            testObject.$getChildren("testNodeTreeProvider", ["0/0:a/0:aa"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeTreeProvider", ["0/0:a/0:ab"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        }),
        testObject.$getChildren("testNodeTreeProvider", ["0/0:b"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/0:b/0:ba", "0/0:b/0:bb"]);
          return Promise.all([
            testObject.$getChildren("testNodeTreeProvider", ["0/0:b/0:ba"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeTreeProvider", ["0/0:b/0:bb"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        })
      ]);
    });
  });
  test("construct id tree", () => {
    return testObject.$getChildren("testNodeWithIdTreeProvider").then((elements) => {
      const actuals = unBatchChildren(elements)?.map((e) => e.handle);
      assert.deepStrictEqual(actuals, ["1/a", "1/b"]);
      return Promise.all([
        testObject.$getChildren("testNodeWithIdTreeProvider", ["1/a"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["1/aa", "1/ab"]);
          return Promise.all([
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/aa"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/ab"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        }),
        testObject.$getChildren("testNodeWithIdTreeProvider", ["1/b"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["1/ba", "1/bb"]);
          return Promise.all([
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/ba"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/bb"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        })
      ]);
    });
  });
  test("construct highlights tree", () => {
    return testObject.$getChildren("testNodeWithHighlightsTreeProvider").then((elements) => {
      assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(elements)), [{
        handle: "1/a",
        label: { label: "a", highlights: [[0, 2], [3, 5]] },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      }, {
        handle: "1/b",
        label: { label: "b", highlights: [[0, 2], [3, 5]] },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      }]);
      return Promise.all([
        testObject.$getChildren("testNodeWithHighlightsTreeProvider", ["1/a"]).then((children) => {
          assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
            handle: "1/aa",
            parentHandle: "1/a",
            label: { label: "aa", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }, {
            handle: "1/ab",
            parentHandle: "1/a",
            label: { label: "ab", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }]);
        }),
        testObject.$getChildren("testNodeWithHighlightsTreeProvider", ["1/b"]).then((children) => {
          assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
            handle: "1/ba",
            parentHandle: "1/b",
            label: { label: "ba", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }, {
            handle: "1/bb",
            parentHandle: "1/b",
            label: { label: "bb", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }]);
        })
      ]);
    });
  });
  test("duplicate id across siblings is handled gracefully", (done) => {
    tree["a"] = {
      "aa": {}
    };
    tree["b"] = {
      "aa": {},
      "ba": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeWithIdTreeProvider").then((elements) => {
        const actuals = unBatchChildren(elements)?.map((e) => e.handle);
        assert.deepStrictEqual(actuals, ["1/a", "1/b"]);
        return testObject.$getChildren("testNodeWithIdTreeProvider", ["1/a"]).then(() => testObject.$getChildren("testNodeWithIdTreeProvider", ["1/b"])).then((elements2) => {
          const children = unBatchChildren(elements2)?.map((e) => e.handle);
          assert.deepStrictEqual(children, ["1/aa", "1/ba"]);
          done();
        });
      }).catch(done);
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("different element instances with same id are replaced gracefully", async () => {
    let callCount = 0;
    const element1 = { key: "x" };
    const element2 = { key: "x" };
    const treeView = testObject.createTreeView("testRaceProvider", {
      treeDataProvider: {
        getChildren: () => {
          callCount++;
          return callCount === 1 ? [element1] : [element2];
        },
        getTreeItem: (element) => {
          return { label: { label: element.key }, id: "same-id", collapsibleState: TreeItemCollapsibleState.None };
        },
        onDidChangeTreeData: onDidChangeTreeNode.event
      }
    }, extensionsDescription);
    store.add(treeView);
    const first = await testObject.$getChildren("testRaceProvider");
    const firstChildren = unBatchChildren(first);
    assert.strictEqual(firstChildren?.length, 1);
    assert.strictEqual(firstChildren[0].handle, "1/same-id");
    const second = await testObject.$getChildren("testRaceProvider");
    const secondChildren = unBatchChildren(second);
    assert.strictEqual(secondChildren?.length, 1);
    assert.strictEqual(secondChildren[0].handle, "1/same-id");
  });
  test("refresh root", function(done) {
    store.add(target.onRefresh.event((actuals) => {
      assert.strictEqual(void 0, actuals);
      done();
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("refresh a parent node", () => {
    return new Promise((c, e) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:b"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        c(void 0);
      }));
      onDidChangeTreeNode.fire(getNode("b"));
    });
  });
  test("refresh a leaf node", function(done) {
    store.add(target.onRefresh.event((actuals) => {
      assert.deepStrictEqual(["0/0:b/0:bb"], Object.keys(actuals));
      assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b/0:bb"]), {
        handle: "0/0:b/0:bb",
        parentHandle: "0/0:b",
        label: { label: "bb" },
        collapsibleState: TreeItemCollapsibleState.None
      });
      done();
    }));
    onDidChangeTreeNode.fire(getNode("bb"));
  });
  async function runWithEventMerging(action) {
    await runWithFakedTimers({}, async () => {
      await new Promise((resolve) => {
        let subscription = void 0;
        subscription = target.onRefresh.event(() => {
          subscription.dispose();
          resolve();
        });
        onDidChangeTreeNode.fire(getNode("b"));
      });
      await new Promise(action);
    });
  }
  test("refresh parent and child node trigger refresh only on parent - scenario 1", async () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:b", "0/0:a/0:aa"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a/0:aa"]), {
          handle: "0/0:a/0:aa",
          parentHandle: "0/0:a",
          label: { label: "aa" },
          collapsibleState: TreeItemCollapsibleState.None
        });
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("aa"));
      onDidChangeTreeNode.fire(getNode("bb"));
    });
  });
  test("refresh parent and child node trigger refresh only on parent - scenario 2", async () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a/0:aa", "0/0:b"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a/0:aa"]), {
          handle: "0/0:a/0:aa",
          parentHandle: "0/0:a",
          label: { label: "aa" },
          collapsibleState: TreeItemCollapsibleState.None
        });
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("bb"));
      onDidChangeTreeNode.fire(getNode("aa"));
      onDidChangeTreeNode.fire(getNode("b"));
    });
  });
  test("refresh an element for label change", function(done) {
    labels["a"] = "aa";
    store.add(target.onRefresh.event((actuals) => {
      assert.deepStrictEqual(["0/0:a"], Object.keys(actuals));
      assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a"]), {
        handle: "0/0:aa",
        label: { label: "aa" },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      });
      done();
    }));
    onDidChangeTreeNode.fire(getNode("a"));
  });
  test("refresh calls are throttled on roots", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
    });
  });
  test("refresh calls are throttled on elements", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a", "0/0:b"], Object.keys(actuals));
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("refresh calls are throttled on unknown elements", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a", "0/0:b"], Object.keys(actuals));
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("g"));
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("refresh calls are throttled on unknown elements and root", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("g"));
      onDidChangeTreeNode.fire(void 0);
    });
  });
  test("refresh calls are throttled on elements and root", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("generate unique handles from labels by escaping them", (done) => {
    tree = {
      "a/0:b": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a//0:b"]);
        done();
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("tree with duplicate labels", (done) => {
    const dupItems = {
      "adup1": "c",
      "adup2": "g",
      "bdup1": "e",
      "hdup1": "i",
      "hdup2": "l",
      "jdup1": "k"
    };
    labels["c"] = "a";
    labels["e"] = "b";
    labels["g"] = "a";
    labels["i"] = "h";
    labels["l"] = "h";
    labels["k"] = "j";
    tree[dupItems["adup1"]] = {};
    tree["d"] = {};
    const bdup1Tree = {};
    bdup1Tree["h"] = {};
    bdup1Tree[dupItems["hdup1"]] = {};
    bdup1Tree["j"] = {};
    bdup1Tree[dupItems["jdup1"]] = {};
    bdup1Tree[dupItems["hdup2"]] = {};
    tree[dupItems["bdup1"]] = bdup1Tree;
    tree["f"] = {};
    tree[dupItems["adup2"]] = {};
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        const actuals = unBatchChildren(elements)?.map((e) => e.handle);
        assert.deepStrictEqual(actuals, ["0/0:a", "0/0:b", "0/1:a", "0/0:d", "0/1:b", "0/0:f", "0/2:a"]);
        return testObject.$getChildren("testNodeTreeProvider", ["0/1:b"]).then((elements2) => {
          const actuals2 = unBatchChildren(elements2)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/1:b/0:h", "0/1:b/1:h", "0/1:b/0:j", "0/1:b/1:j", "0/1:b/2:h"]);
          done();
        });
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("getChildren is not returned from cache if refreshed", (done) => {
    tree = {
      "c": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:c"]);
        done();
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("getChildren is returned from cache if not refreshed", () => {
    tree = {
      "c": {}
    };
    return testObject.$getChildren("testNodeTreeProvider").then((elements) => {
      assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a", "0/0:b"]);
    });
  });
  test("dispose and re-register tree view", async () => {
    const disposeTreeSpy = sinon.spy(target, "$disposeTree");
    const registerSpy = sinon.spy(target, "$registerTreeViewDataProvider");
    const treeView1 = testObject.createTreeView("reRegisterTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    treeView1.dispose();
    const treeView2 = testObject.createTreeView("reRegisterTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    await new Promise((r) => setTimeout(r, 0));
    const elements = await testObject.$getChildren("reRegisterTreeProvider");
    assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a", "0/0:b"]);
    assert.strictEqual(registerSpy.callCount, 2);
    assert.strictEqual(disposeTreeSpy.callCount, 0);
    treeView2.dispose();
  });
  test("reveal will throw an error if getParent is not implemented", () => {
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    return treeView.reveal({ key: "a" }).then(() => assert.fail("Reveal should throw an error as getParent is not implemented"), () => null);
  });
  test("reveal will return empty array for root element", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed },
      parentChain: []
    };
    return treeView.reveal({ key: "a" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected, removeUnsetKeys(revealTarget.args[0][1]));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal will return parents array for an element when hierarchy is not loaded", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:aa", label: { label: "aa" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return treeView.reveal({ key: "aa" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal will return parents array for an element when hierarchy is loaded", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:aa", label: { label: "aa" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return testObject.$getChildren("treeDataProvider").then(() => testObject.$getChildren("treeDataProvider", ["0/0:a"])).then(() => treeView.reveal({ key: "aa" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    }));
  });
  test("reveal will return parents array for deeper element with no selection", () => {
    tree = {
      "b": {
        "ba": {
          "bac": {}
        }
      }
    };
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:b/0:ba/0:bac", label: { label: "bac" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:b/0:ba" },
      parentChain: [
        { handle: "0/0:b", label: { label: "b" }, collapsibleState: TreeItemCollapsibleState.Collapsed },
        { handle: "0/0:b/0:ba", label: { label: "ba" }, collapsibleState: TreeItemCollapsibleState.Collapsed, parentHandle: "0/0:b" }
      ]
    };
    return treeView.reveal({ key: "bac" }, { select: false, focus: false, expand: false }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: false, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal after first udpate", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:ac", label: { label: "ac" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return loadCompleteTree("treeDataProvider").then(() => {
      tree = {
        "a": {
          "aa": {},
          "ac": {}
        },
        "b": {
          "ba": {},
          "bb": {}
        }
      };
      onDidChangeTreeNode.fire(getNode("a"));
      return treeView.reveal({ key: "ac" }).then(() => {
        assert.ok(revealTarget.calledOnce);
        assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
        assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
        assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
        assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
      });
    });
  });
  test("reveal after second udpate", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    return loadCompleteTree("treeDataProvider").then(() => {
      return runWithEventMerging((resolve) => {
        tree = {
          "a": {
            "aa": {},
            "ac": {}
          },
          "b": {
            "ba": {},
            "bb": {}
          }
        };
        onDidChangeTreeNode.fire(getNode("a"));
        tree = {
          "a": {
            "aa": {},
            "ac": {}
          },
          "b": {
            "ba": {},
            "bc": {}
          }
        };
        onDidChangeTreeNode.fire(getNode("b"));
        resolve();
      }).then(() => {
        return treeView.reveal({ key: "bc" }).then(() => {
          assert.ok(revealTarget.calledOnce);
          assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
          assert.deepStrictEqual({ handle: "0/0:b/0:bc", label: { label: "bc" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:b" }, removeUnsetKeys(revealTarget.args[0][1].item));
          assert.deepStrictEqual([{ handle: "0/0:b", label: { label: "b" }, collapsibleState: TreeItemCollapsibleState.Collapsed }], revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
          assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
        });
      });
    });
  });
  function loadCompleteTree(treeId, element) {
    return testObject.$getChildren(treeId, element ? [element] : void 0).then((elements) => {
      if (!elements || elements?.length === 0) {
        return null;
      }
      return elements[0].slice(1).map((e) => loadCompleteTree(treeId, e.handle));
    }).then(() => null);
  }
  function removeUnsetKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map((o) => removeUnsetKeys(o));
    }
    if (typeof obj === "object") {
      const result = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== void 0) {
          result[key] = removeUnsetKeys(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }
  function aNodeTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        return getTreeItem(element.key);
      },
      onDidChangeTreeData: onDidChangeTreeNode.event
    };
  }
  function aCompleteNodeTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        return getTreeItem(element.key);
      },
      getParent: ({ key }) => {
        const parentKey = key.substring(0, key.length - 1);
        return parentKey ? new Key(parentKey) : void 0;
      },
      onDidChangeTreeData: onDidChangeTreeNode.event
    };
  }
  function aNodeWithIdTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        const treeItem = getTreeItem(element.key);
        treeItem.id = element.key;
        return treeItem;
      },
      onDidChangeTreeData: onDidChangeTreeNodeWithId.event
    };
  }
  function aNodeWithHighlightedLabelTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        const treeItem = getTreeItem(element.key, [[0, 2], [3, 5]]);
        treeItem.id = element.key;
        return treeItem;
      },
      onDidChangeTreeData: onDidChangeTreeNodeWithId.event
    };
  }
  function getTreeElement(element) {
    let parent = tree;
    for (let i = 0; i < element.length; i++) {
      parent = parent[element.substring(0, i + 1)];
      if (!parent) {
        return null;
      }
    }
    return parent;
  }
  function getChildren(key) {
    if (!key) {
      return Object.keys(tree);
    }
    const treeElement = getTreeElement(key);
    if (treeElement) {
      return Object.keys(treeElement);
    }
    return [];
  }
  function getTreeItem(key, highlights) {
    const treeElement = getTreeElement(key);
    return {
      label: { label: labels[key] || key, highlights },
      collapsibleState: treeElement && Object.keys(treeElement).length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
    };
  }
  function getNode(key) {
    if (!nodes[key]) {
      nodes[key] = new Key(key);
    }
    return nodes[key];
  }
  class Key {
    constructor(key) {
      this.key = key;
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUcmVlVmlld3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VHJlZVZpZXdzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUcmVlVmlld3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkVHJlZVZpZXdzU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkQ29tbWFuZHNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFRyZWVEYXRhUHJvdmlkZXIsIFRyZWVJdGVtIH0gZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsIElUcmVlSXRlbSwgSVJldmVhbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiBhcyBleHRlbnNpb25zRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5mdW5jdGlvbiB1bkJhdGNoQ2hpbGRyZW4ocmVzdWx0OiAocmVhZG9ubHkgKG51bWJlciB8IElUcmVlSXRlbSlbXSlbXSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHJlc3VsdC5sZW5ndGggPiAxKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHJlc3VsdCBsZW5ndGgsIGFsbCB0ZXN0cyBhcmUgdW5iYXRjaGVkLicpO1xuXHR9XG5cdHJldHVybiByZXN1bHRbMF0uc2xpY2UoMSkgYXMgcmVhZG9ubHkgSVRyZWVJdGVtW107XG59XG5cbnN1aXRlKCdFeHRIb3N0VHJlZVZpZXcnLCBmdW5jdGlvbiAoKSB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgUmVjb3JkaW5nU2hhcGUgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZT4oKSB7XG5cblx0XHRvblJlZnJlc2ggPSBuZXcgRW1pdHRlcjx7IFt0cmVlSXRlbUhhbmRsZTogc3RyaW5nXTogSVRyZWVJdGVtIH0+KCk7XG5cblx0XHRvdmVycmlkZSBhc3luYyAkcmVnaXN0ZXJUcmVlVmlld0RhdGFQcm92aWRlcih0cmVlVmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR9XG5cblx0XHRvdmVycmlkZSAkcmVmcmVzaCh2aWV3SWQ6IHN0cmluZywgaXRlbXNUb1JlZnJlc2g6IHsgW3RyZWVJdGVtSGFuZGxlOiBzdHJpbmddOiBJVHJlZUl0ZW0gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vblJlZnJlc2guZmlyZShpdGVtc1RvUmVmcmVzaCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSAkcmV2ZWFsKHRyZWVWaWV3SWQ6IHN0cmluZywgaXRlbUluZm86IHsgaXRlbTogSVRyZWVJdGVtOyBwYXJlbnRDaGFpbjogSVRyZWVJdGVtW10gfSB8IHVuZGVmaW5lZCwgb3B0aW9uczogSVJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSAkZGlzcG9zZVRyZWUodHJlZVZpZXdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdH1cblxuXHRsZXQgdGVzdE9iamVjdDogRXh0SG9zdFRyZWVWaWV3cztcblx0bGV0IHRhcmdldDogUmVjb3JkaW5nU2hhcGU7XG5cdGxldCBvbkRpZENoYW5nZVRyZWVOb2RlOiBFbWl0dGVyPHsga2V5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdGxldCBvbkRpZENoYW5nZVRyZWVOb2RlV2l0aElkOiBFbWl0dGVyPHsga2V5OiBzdHJpbmcgfT47XG5cdGxldCB0cmVlOiB7IFtrZXk6IHN0cmluZ106IGFueSB9O1xuXHRsZXQgbGFiZWxzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuXHRsZXQgbm9kZXM6IHsgW2tleTogc3RyaW5nXTogeyBrZXk6IHN0cmluZyB9IH07XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRyZWUgPSB7XG5cdFx0XHQnYSc6IHtcblx0XHRcdFx0J2FhJzoge30sXG5cdFx0XHRcdCdhYic6IHt9XG5cdFx0XHR9LFxuXHRcdFx0J2InOiB7XG5cdFx0XHRcdCdiYSc6IHt9LFxuXHRcdFx0XHQnYmInOiB7fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsYWJlbHMgPSB7fTtcblx0XHRub2RlcyA9IHt9O1xuXG5cdFx0Y29uc3QgcnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1hbmRzLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb21tYW5kc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRyZWdpc3RlckNvbW1hbmQoKSB7IH1cblx0XHR9KTtcblx0XHR0YXJnZXQgPSBuZXcgUmVjb3JkaW5nU2hhcGUoKTtcblx0XHR0ZXN0T2JqZWN0ID0gc3RvcmUuYWRkKG5ldyBFeHRIb3N0VHJlZVZpZXdzKHRhcmdldCwgbmV3IEV4dEhvc3RDb21tYW5kcyhcblx0XHRcdHJwY1Byb3RvY29sLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZSA9IG5ldyBFbWl0dGVyPHsga2V5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4oKTtcblx0XHRvbkRpZENoYW5nZVRyZWVOb2RlV2l0aElkID0gbmV3IEVtaXR0ZXI8eyBrZXk6IHN0cmluZyB9PigpO1xuXHRcdHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3Rlc3ROb2RlV2l0aElkVHJlZVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhTm9kZVdpdGhJZFRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3Rlc3ROb2RlV2l0aEhpZ2hsaWdodHNUcmVlUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlV2l0aEhpZ2hsaWdodGVkTGFiZWxUcmVlRGF0YVByb3ZpZGVyKCkgfSwgZXh0ZW5zaW9uc0Rlc2NyaXB0aW9uKTtcblxuXHRcdHJldHVybiBsb2FkQ29tcGxldGVUcmVlKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3Qgbm9kZSB0cmVlJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInKVxuXHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMC8wOmEnLCAnMC8wOmInXSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgWycwLzA6YSddKVxuXHRcdFx0XHRcdFx0LnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMC8wOmEvMDphYScsICcwLzA6YS8wOmFiJ10pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicsIFsnMC8wOmEvMDphYSddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKSxcblx0XHRcdFx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInLCBbJzAvMDphLzA6YWInXSkudGhlbihjaGlsZHJlbiA9PiBhc3NlcnQuc3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubGVuZ3RoLCAwKSlcblx0XHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInLCBbJzAvMDpiJ10pXG5cdFx0XHRcdFx0XHQudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycwLzA6Yi8wOmJhJywgJzAvMDpiLzA6YmInXSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgWycwLzA6Yi8wOmJhJ10pLnRoZW4oY2hpbGRyZW4gPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lmxlbmd0aCwgMCkpLFxuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicsIFsnMC8wOmIvMDpiYiddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKVxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdCBpZCB0cmVlJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInKVxuXHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMS9hJywgJzEvYiddKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCBbJzEvYSddKVxuXHRcdFx0XHRcdFx0LnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMS9hYScsICcxL2FiJ10pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9hYSddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKSxcblx0XHRcdFx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCBbJzEvYWInXSkudGhlbihjaGlsZHJlbiA9PiBhc3NlcnQuc3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubGVuZ3RoLCAwKSlcblx0XHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCBbJzEvYiddKVxuXHRcdFx0XHRcdFx0LnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMS9iYScsICcxL2JiJ10pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9iYSddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKSxcblx0XHRcdFx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCBbJzEvYmInXSkudGhlbihjaGlsZHJlbiA9PiBhc3NlcnQuc3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubGVuZ3RoLCAwKSlcblx0XHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3QgaGlnaGxpZ2h0cyB0cmVlJywgKCkgPT4ge1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSGlnaGxpZ2h0c1RyZWVQcm92aWRlcicpXG5cdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlVW5zZXRLZXlzKHVuQmF0Y2hDaGlsZHJlbihlbGVtZW50cykpLCBbe1xuXHRcdFx0XHRcdGhhbmRsZTogJzEvYScsXG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdhJywgaGlnaGxpZ2h0czogW1swLCAyXSwgWzMsIDVdXSB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWRcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzEvYicsXG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdiJywgaGlnaGxpZ2h0czogW1swLCAyXSwgWzMsIDVdXSB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWRcblx0XHRcdFx0fV0pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhIaWdobGlnaHRzVHJlZVByb3ZpZGVyJywgWycxL2EnXSlcblx0XHRcdFx0XHRcdC50aGVuKGNoaWxkcmVuID0+IHtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXModW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKSksIFt7XG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlOiAnMS9hYScsXG5cdFx0XHRcdFx0XHRcdFx0cGFyZW50SGFuZGxlOiAnMS9hJyxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2FhJywgaGlnaGxpZ2h0czogW1swLCAyXSwgWzMsIDVdXSB9LFxuXHRcdFx0XHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0XHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGU6ICcxL2FiJyxcblx0XHRcdFx0XHRcdFx0XHRwYXJlbnRIYW5kbGU6ICcxL2EnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYWInLCBoaWdobGlnaHRzOiBbWzAsIDJdLCBbMywgNV1dIH0sXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmVcblx0XHRcdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aEhpZ2hsaWdodHNUcmVlUHJvdmlkZXInLCBbJzEvYiddKVxuXHRcdFx0XHRcdFx0LnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pKSwgW3tcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGU6ICcxL2JhJyxcblx0XHRcdFx0XHRcdFx0XHRwYXJlbnRIYW5kbGU6ICcxL2InLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYmEnLCBoaWdobGlnaHRzOiBbWzAsIDJdLCBbMywgNV1dIH0sXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmVcblx0XHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRcdGhhbmRsZTogJzEvYmInLFxuXHRcdFx0XHRcdFx0XHRcdHBhcmVudEhhbmRsZTogJzEvYicsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdiYicsIGhpZ2hsaWdodHM6IFtbMCwgMl0sIFszLCA1XV0gfSxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZVxuXHRcdFx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkdXBsaWNhdGUgaWQgYWNyb3NzIHNpYmxpbmdzIGlzIGhhbmRsZWQgZ3JhY2VmdWxseScsIChkb25lKSA9PiB7XG5cdFx0dHJlZVsnYSddID0ge1xuXHRcdFx0J2FhJzoge30sXG5cdFx0fTtcblx0XHR0cmVlWydiJ10gPSB7XG5cdFx0XHQnYWEnOiB7fSxcblx0XHRcdCdiYSc6IHt9XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudCgoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInKVxuXHRcdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0dWFscyA9IHVuQmF0Y2hDaGlsZHJlbihlbGVtZW50cyk/Lm1hcChlID0+IGUuaGFuZGxlKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMS9hJywgJzEvYiddKTtcblx0XHRcdFx0XHRyZXR1cm4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aElkVHJlZVByb3ZpZGVyJywgWycxL2EnXSlcblx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9iJ10pKVxuXHRcdFx0XHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBDaGlsZHJlbiBvZiAnYicgc2hvdWxkIGluY2x1ZGUgYm90aCAnYWEnIGFuZCAnYmEnXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoaWxkcmVuLCBbJzEvYWEnLCAnMS9iYSddKTtcblx0XHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pLmNhdGNoKGRvbmUpO1xuXHRcdH0pKTtcblx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IGVsZW1lbnQgaW5zdGFuY2VzIHdpdGggc2FtZSBpZCBhcmUgcmVwbGFjZWQgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgdGhlIHJhY2UgY29uZGl0aW9uOiB0d28gY29uY3VycmVudCBnZXRDaGlsZHJlbiBjYWxscyByZXR1cm5cblx0XHQvLyBkaWZmZXJlbnQgZWxlbWVudCBvYmplY3RzIHRoYXQgbWFwIHRvIHRoZSBzYW1lIHRyZWUgaXRlbSBJRC4gVGhlIHNlY29uZFxuXHRcdC8vIGNhbGwgc2hvdWxkIHJlcGxhY2UgdGhlIGZpcnN0J3MgcmVnaXN0cmF0aW9uIHdpdGhvdXQgZXJyb3IuXG5cdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3QgZWxlbWVudDEgPSB7IGtleTogJ3gnIH07XG5cdFx0Y29uc3QgZWxlbWVudDIgPSB7IGtleTogJ3gnIH07XG5cblx0XHRjb25zdCB0cmVlVmlldyA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3Rlc3RSYWNlUHJvdmlkZXInLCB7XG5cdFx0XHR0cmVlRGF0YVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldENoaWxkcmVuOiAoKTogeyBrZXk6IHN0cmluZyB9W10gPT4ge1xuXHRcdFx0XHRcdGNhbGxDb3VudCsrO1xuXHRcdFx0XHRcdC8vIFJldHVybiBhIGRpZmZlcmVudCBvYmplY3QgaW5zdGFuY2UgZWFjaCB0aW1lXG5cdFx0XHRcdFx0cmV0dXJuIGNhbGxDb3VudCA9PT0gMSA/IFtlbGVtZW50MV0gOiBbZWxlbWVudDJdO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRUcmVlSXRlbTogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IFRyZWVJdGVtID0+IHtcblx0XHRcdFx0XHRyZXR1cm4geyBsYWJlbDogeyBsYWJlbDogZWxlbWVudC5rZXkgfSwgaWQ6ICdzYW1lLWlkJywgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUgfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25EaWRDaGFuZ2VUcmVlRGF0YTogb25EaWRDaGFuZ2VUcmVlTm9kZS5ldmVudCxcblx0XHRcdH1cblx0XHR9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXG5cdFx0c3RvcmUuYWRkKHRyZWVWaWV3KTtcblxuXHRcdC8vIEZpcnN0IGZldGNoIFx1MjAxNCByZWdpc3RlcnMgZWxlbWVudDEgd2l0aCBpZCAnc2FtZS1pZCdcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0UmFjZVByb3ZpZGVyJyk7XG5cdFx0Y29uc3QgZmlyc3RDaGlsZHJlbiA9IHVuQmF0Y2hDaGlsZHJlbihmaXJzdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Q2hpbGRyZW4hWzBdLmhhbmRsZSwgJzEvc2FtZS1pZCcpO1xuXG5cdFx0Ly8gU2Vjb25kIGZldGNoIFx1MjAxNCBkaWZmZXJlbnQgZWxlbWVudCBpbnN0YW5jZSwgc2FtZSBpZC4gU2hvdWxkIG5vdCB0aHJvdy5cblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdFJhY2VQcm92aWRlcicpO1xuXHRcdGNvbnN0IHNlY29uZENoaWxkcmVuID0gdW5CYXRjaENoaWxkcmVuKHNlY29uZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZENoaWxkcmVuPy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRDaGlsZHJlbiFbMF0uaGFuZGxlLCAnMS9zYW1lLWlkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggcm9vdCcsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kZWZpbmVkLCBhY3R1YWxzKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggYSBwYXJlbnQgbm9kZScsICgpID0+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKGMsIGUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMC8wOmInXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6YiddKSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzAvMDpiJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2InIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Yyh1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggYSBsZWFmIG5vZGUnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbJzAvMDpiLzA6YmInXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXMoYWN0dWFsc1snMC8wOmIvMDpiYiddKSwge1xuXHRcdFx0XHRoYW5kbGU6ICcwLzA6Yi8wOmJiJyxcblx0XHRcdFx0cGFyZW50SGFuZGxlOiAnMC8wOmInLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2JiJyB9LFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZVxuXHRcdFx0fSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSkpO1xuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiYicpKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gcnVuV2l0aEV2ZW50TWVyZ2luZyhhY3Rpb246IChyZXNvbHZlOiAoKSA9PiB2b2lkKSA9PiB2b2lkKSB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRsZXQgc3Vic2NyaXB0aW9uOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3Vic2NyaXB0aW9uID0gdGFyZ2V0Lm9uUmVmcmVzaC5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdFx0c3Vic2NyaXB0aW9uIS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KGFjdGlvbik7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdyZWZyZXNoIHBhcmVudCBhbmQgY2hpbGQgbm9kZSB0cmlnZ2VyIHJlZnJlc2ggb25seSBvbiBwYXJlbnQgLSBzY2VuYXJpbyAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRXZlbnRNZXJnaW5nKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbJzAvMDpiJywgJzAvMDphLzA6YWEnXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6YiddKSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzAvMDpiJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2InIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXMoYWN0dWFsc1snMC8wOmEvMDphYSddKSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzAvMDphLzA6YWEnLFxuXHRcdFx0XHRcdHBhcmVudEhhbmRsZTogJzAvMDphJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2FhJyB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhYScpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiYicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBwYXJlbnQgYW5kIGNoaWxkIG5vZGUgdHJpZ2dlciByZWZyZXNoIG9ubHkgb24gcGFyZW50IC0gc2NlbmFyaW8gMicsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEV2ZW50TWVyZ2luZygocmVzb2x2ZSkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWycwLzA6YS8wOmFhJywgJzAvMDpiJ10sIE9iamVjdC5rZXlzKGFjdHVhbHMpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXMoYWN0dWFsc1snMC8wOmInXSksIHtcblx0XHRcdFx0XHRoYW5kbGU6ICcwLzA6YicsXG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdiJyB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlVW5zZXRLZXlzKGFjdHVhbHNbJzAvMDphLzA6YWEnXSksIHtcblx0XHRcdFx0XHRoYW5kbGU6ICcwLzA6YS8wOmFhJyxcblx0XHRcdFx0XHRwYXJlbnRIYW5kbGU6ICcwLzA6YScsXG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdhYScgfSxcblx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2JiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2FhJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggYW4gZWxlbWVudCBmb3IgbGFiZWwgY2hhbmdlJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRsYWJlbHNbJ2EnXSA9ICdhYSc7XG5cdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMC8wOmEnXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXMoYWN0dWFsc1snMC8wOmEnXSksIHtcblx0XHRcdFx0aGFuZGxlOiAnMC8wOmFhJyxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdhYScgfSxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0fSk7XG5cdFx0XHRkb25lKCk7XG5cdFx0fSkpO1xuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoIGNhbGxzIGFyZSB0aHJvdHRsZWQgb24gcm9vdHMnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kZWZpbmVkLCBhY3R1YWxzKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggY2FsbHMgYXJlIHRocm90dGxlZCBvbiBlbGVtZW50cycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEV2ZW50TWVyZ2luZygocmVzb2x2ZSkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWycwLzA6YScsICcwLzA6YiddLCBPYmplY3Qua2V5cyhhY3R1YWxzKSk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggY2FsbHMgYXJlIHRocm90dGxlZCBvbiB1bmtub3duIGVsZW1lbnRzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRXZlbnRNZXJnaW5nKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbJzAvMDphJywgJzAvMDpiJ10sIE9iamVjdC5rZXlzKGFjdHVhbHMpKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2cnKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBjYWxscyBhcmUgdGhyb3R0bGVkIG9uIHVua25vd24gZWxlbWVudHMgYW5kIHJvb3QnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kZWZpbmVkLCBhY3R1YWxzKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2cnKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBjYWxscyBhcmUgdGhyb3R0bGVkIG9uIGVsZW1lbnRzIGFuZCByb290JywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRXZlbnRNZXJnaW5nKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZGVmaW5lZCwgYWN0dWFscyk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dlbmVyYXRlIHVuaXF1ZSBoYW5kbGVzIGZyb20gbGFiZWxzIGJ5IGVzY2FwaW5nIHRoZW0nLCAoZG9uZSkgPT4ge1xuXHRcdHRyZWUgPSB7XG5cdFx0XHQnYS8wOmInOiB7fVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudCgoKSA9PiB7XG5cdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInKVxuXHRcdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSksIFsnMC8wOmEvLzA6YiddKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndHJlZSB3aXRoIGR1cGxpY2F0ZSBsYWJlbHMnLCAoZG9uZSkgPT4ge1xuXG5cdFx0Y29uc3QgZHVwSXRlbXMgPSB7XG5cdFx0XHQnYWR1cDEnOiAnYycsXG5cdFx0XHQnYWR1cDInOiAnZycsXG5cdFx0XHQnYmR1cDEnOiAnZScsXG5cdFx0XHQnaGR1cDEnOiAnaScsXG5cdFx0XHQnaGR1cDInOiAnbCcsXG5cdFx0XHQnamR1cDEnOiAnaydcblx0XHR9O1xuXG5cdFx0bGFiZWxzWydjJ10gPSAnYSc7XG5cdFx0bGFiZWxzWydlJ10gPSAnYic7XG5cdFx0bGFiZWxzWydnJ10gPSAnYSc7XG5cdFx0bGFiZWxzWydpJ10gPSAnaCc7XG5cdFx0bGFiZWxzWydsJ10gPSAnaCc7XG5cdFx0bGFiZWxzWydrJ10gPSAnaic7XG5cblx0XHR0cmVlW2R1cEl0ZW1zWydhZHVwMSddXSA9IHt9O1xuXHRcdHRyZWVbJ2QnXSA9IHt9O1xuXG5cdFx0Y29uc3QgYmR1cDFUcmVlOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG5cdFx0YmR1cDFUcmVlWydoJ10gPSB7fTtcblx0XHRiZHVwMVRyZWVbZHVwSXRlbXNbJ2hkdXAxJ11dID0ge307XG5cdFx0YmR1cDFUcmVlWydqJ10gPSB7fTtcblx0XHRiZHVwMVRyZWVbZHVwSXRlbXNbJ2pkdXAxJ11dID0ge307XG5cdFx0YmR1cDFUcmVlW2R1cEl0ZW1zWydoZHVwMiddXSA9IHt9O1xuXG5cdFx0dHJlZVtkdXBJdGVtc1snYmR1cDEnXV0gPSBiZHVwMVRyZWU7XG5cdFx0dHJlZVsnZiddID0ge307XG5cdFx0dHJlZVtkdXBJdGVtc1snYWR1cDInXV0gPSB7fTtcblxuXHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KCgpID0+IHtcblx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpXG5cdFx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycwLzA6YScsICcwLzA6YicsICcwLzE6YScsICcwLzA6ZCcsICcwLzE6YicsICcwLzA6ZicsICcwLzI6YSddKTtcblx0XHRcdFx0XHRyZXR1cm4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgWycwLzE6YiddKVxuXHRcdFx0XHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbHMsIFsnMC8xOmIvMDpoJywgJzAvMTpiLzE6aCcsICcwLzE6Yi8wOmonLCAnMC8xOmIvMTpqJywgJzAvMTpiLzI6aCddKTtcblx0XHRcdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDaGlsZHJlbiBpcyBub3QgcmV0dXJuZWQgZnJvbSBjYWNoZSBpZiByZWZyZXNoZWQnLCAoZG9uZSkgPT4ge1xuXHRcdHRyZWUgPSB7XG5cdFx0XHQnYyc6IHt9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KCgpID0+IHtcblx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpXG5cdFx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihlbGVtZW50cyk/Lm1hcChlID0+IGUuaGFuZGxlKSwgWycwLzA6YyddKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDaGlsZHJlbiBpcyByZXR1cm5lZCBmcm9tIGNhY2hlIGlmIG5vdCByZWZyZXNoZWQnLCAoKSA9PiB7XG5cdFx0dHJlZSA9IHtcblx0XHRcdCdjJzoge31cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpXG5cdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpLCBbJzAvMDphJywgJzAvMDpiJ10pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgYW5kIHJlLXJlZ2lzdGVyIHRyZWUgdmlldycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlVHJlZVNweSA9IHNpbm9uLnNweSh0YXJnZXQsICckZGlzcG9zZVRyZWUnKTtcblx0XHRjb25zdCByZWdpc3RlclNweSA9IHNpbm9uLnNweSh0YXJnZXQsICckcmVnaXN0ZXJUcmVlVmlld0RhdGFQcm92aWRlcicpO1xuXG5cdFx0Ly8gQ3JlYXRlLCBkaXNwb3NlLCBhbmQgcmUtcmVnaXN0ZXIgYSB0cmVlIHZpZXcgd2l0aCB0aGUgc2FtZSBpZFxuXHRcdGNvbnN0IHRyZWVWaWV3MSA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3JlUmVnaXN0ZXJUcmVlUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0dHJlZVZpZXcxLmRpc3Bvc2UoKTtcblx0XHRjb25zdCB0cmVlVmlldzIgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCdyZVJlZ2lzdGVyVHJlZVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXG5cdFx0Ly8gTGV0IGFsbCBwZW5kaW5nIG1pY3JvdGFza3MgKHRoZSBhc3luYyBkaXNwb3NlKSBzZXR0bGVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0Ly8gVGhlIG5ldyB2aWV3IHNob3VsZCB3b3JrIFx1MjAxNCAkZ2V0Q2hpbGRyZW4gc2hvdWxkIHJldHVybiByZXN1bHRzLCBub3QgcmVqZWN0XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBhd2FpdCB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigncmVSZWdpc3RlclRyZWVQcm92aWRlcicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpLCBbJzAvMDphJywgJzAvMDpiJ10pO1xuXG5cdFx0Ly8gJHJlZ2lzdGVyVHJlZVZpZXdEYXRhUHJvdmlkZXIgc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQgdHdpY2UgKG9uY2UgcGVyIGNyZWF0ZVRyZWVWaWV3KVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RlclNweS5jYWxsQ291bnQsIDIpO1xuXHRcdC8vICRkaXNwb3NlVHJlZSBzaG91bGQgTk9UIGhhdmUgYmVlbiBjYWxsZWQgXHUyMDE0IHRoZSBvbGQgYXN5bmMgZGlzcG9zZSBzaG91bGQgZGV0ZWN0IGl0IHdhcyByZXBsYWNlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlVHJlZVNweS5jYWxsQ291bnQsIDApO1xuXG5cdFx0dHJlZVZpZXcyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFsIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgZ2V0UGFyZW50IGlzIG5vdCBpbXBsZW1lbnRlZCcsICgpID0+IHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3RyZWVEYXRhUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0cmV0dXJuIHRyZWVWaWV3LnJldmVhbCh7IGtleTogJ2EnIH0pXG5cdFx0XHQudGhlbigoKSA9PiBhc3NlcnQuZmFpbCgnUmV2ZWFsIHNob3VsZCB0aHJvdyBhbiBlcnJvciBhcyBnZXRQYXJlbnQgaXMgbm90IGltcGxlbWVudGVkJyksICgpID0+IG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWwgd2lsbCByZXR1cm4gZW1wdHkgYXJyYXkgZm9yIHJvb3QgZWxlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCByZXZlYWxUYXJnZXQgPSBzaW5vbi5zcHkodGFyZ2V0LCAnJHJldmVhbCcpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0ge1xuXHRcdFx0aXRlbTpcblx0XHRcdFx0eyBoYW5kbGU6ICcwLzA6YScsIGxhYmVsOiB7IGxhYmVsOiAnYScgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCB9LFxuXHRcdFx0cGFyZW50Q2hhaW46IFtdXG5cdFx0fTtcblx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYScgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJldmVhbFRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgndHJlZURhdGFQcm92aWRlcicsIHJldmVhbFRhcmdldC5hcmdzWzBdWzBdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZCwgcmVtb3ZlVW5zZXRLZXlzKHJldmVhbFRhcmdldC5hcmdzWzBdWzFdKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWxlY3Q6IHRydWUsIGZvY3VzOiBmYWxzZSwgZXhwYW5kOiBmYWxzZSB9LCByZXZlYWxUYXJnZXQuYXJnc1swXVsyXSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFsIHdpbGwgcmV0dXJuIHBhcmVudHMgYXJyYXkgZm9yIGFuIGVsZW1lbnQgd2hlbiBoaWVyYXJjaHkgaXMgbm90IGxvYWRlZCcsICgpID0+IHtcblx0XHRjb25zdCByZXZlYWxUYXJnZXQgPSBzaW5vbi5zcHkodGFyZ2V0LCAnJHJldmVhbCcpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0ge1xuXHRcdFx0aXRlbTogeyBoYW5kbGU6ICcwLzA6YS8wOmFhJywgbGFiZWw6IHsgbGFiZWw6ICdhYScgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUsIHBhcmVudEhhbmRsZTogJzAvMDphJyB9LFxuXHRcdFx0cGFyZW50Q2hhaW46IFt7IGhhbmRsZTogJzAvMDphJywgbGFiZWw6IHsgbGFiZWw6ICdhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIH1dXG5cdFx0fTtcblx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYWEnIH0pXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5vayhyZXZlYWxUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoJ3RyZWVEYXRhUHJvdmlkZXInLCByZXZlYWxUYXJnZXQuYXJnc1swXVswXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQuaXRlbSwgcmVtb3ZlVW5zZXRLZXlzKHJldmVhbFRhcmdldC5hcmdzWzBdWzFdIS5pdGVtKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQucGFyZW50Q2hhaW4sICg8QXJyYXk8YW55Pj4ocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLnBhcmVudENoYWluKSkubWFwKGFyZyA9PiByZW1vdmVVbnNldEtleXMoYXJnKSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0OiB0cnVlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSwgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMl0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbCB3aWxsIHJldHVybiBwYXJlbnRzIGFycmF5IGZvciBhbiBlbGVtZW50IHdoZW4gaGllcmFyY2h5IGlzIGxvYWRlZCcsICgpID0+IHtcblx0XHRjb25zdCByZXZlYWxUYXJnZXQgPSBzaW5vbi5zcHkodGFyZ2V0LCAnJHJldmVhbCcpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0ge1xuXHRcdFx0aXRlbTogeyBoYW5kbGU6ICcwLzA6YS8wOmFhJywgbGFiZWw6IHsgbGFiZWw6ICdhYScgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUsIHBhcmVudEhhbmRsZTogJzAvMDphJyB9LFxuXHRcdFx0cGFyZW50Q2hhaW46IFt7IGhhbmRsZTogJzAvMDphJywgbGFiZWw6IHsgbGFiZWw6ICdhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIH1dXG5cdFx0fTtcblx0XHRyZXR1cm4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3RyZWVEYXRhUHJvdmlkZXInKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3RyZWVEYXRhUHJvdmlkZXInLCBbJzAvMDphJ10pKVxuXHRcdFx0LnRoZW4oKCkgPT4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYWEnIH0pXG5cdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2socmV2ZWFsVGFyZ2V0LmNhbGxlZE9uY2UpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoJ3RyZWVEYXRhUHJvdmlkZXInLCByZXZlYWxUYXJnZXQuYXJnc1swXVswXSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5pdGVtLCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLml0ZW0pKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cGVjdGVkLnBhcmVudENoYWluLCAoPEFycmF5PGFueT4+KHJldmVhbFRhcmdldC5hcmdzWzBdWzFdIS5wYXJlbnRDaGFpbikpLm1hcChhcmcgPT4gcmVtb3ZlVW5zZXRLZXlzKGFyZykpKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0OiB0cnVlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSwgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMl0pO1xuXHRcdFx0XHR9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbCB3aWxsIHJldHVybiBwYXJlbnRzIGFycmF5IGZvciBkZWVwZXIgZWxlbWVudCB3aXRoIG5vIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0cmVlID0ge1xuXHRcdFx0J2InOiB7XG5cdFx0XHRcdCdiYSc6IHtcblx0XHRcdFx0XHQnYmFjJzoge31cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsVGFyZ2V0ID0gc2lub24uc3B5KHRhcmdldCwgJyRyZXZlYWwnKTtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3RyZWVEYXRhUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFDb21wbGV0ZU5vZGVUcmVlRGF0YVByb3ZpZGVyKCkgfSwgZXh0ZW5zaW9uc0Rlc2NyaXB0aW9uKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdGl0ZW06IHsgaGFuZGxlOiAnMC8wOmIvMDpiYS8wOmJhYycsIGxhYmVsOiB7IGxhYmVsOiAnYmFjJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSwgcGFyZW50SGFuZGxlOiAnMC8wOmIvMDpiYScgfSxcblx0XHRcdHBhcmVudENoYWluOiBbXG5cdFx0XHRcdHsgaGFuZGxlOiAnMC8wOmInLCBsYWJlbDogeyBsYWJlbDogJ2InIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgfSxcblx0XHRcdFx0eyBoYW5kbGU6ICcwLzA6Yi8wOmJhJywgbGFiZWw6IHsgbGFiZWw6ICdiYScgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCwgcGFyZW50SGFuZGxlOiAnMC8wOmInIH1cblx0XHRcdF1cblx0XHR9O1xuXHRcdHJldHVybiB0cmVlVmlldy5yZXZlYWwoeyBrZXk6ICdiYWMnIH0sIHsgc2VsZWN0OiBmYWxzZSwgZm9jdXM6IGZhbHNlLCBleHBhbmQ6IGZhbHNlIH0pXG5cdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5vayhyZXZlYWxUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoJ3RyZWVEYXRhUHJvdmlkZXInLCByZXZlYWxUYXJnZXQuYXJnc1swXVswXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQuaXRlbSwgcmVtb3ZlVW5zZXRLZXlzKHJldmVhbFRhcmdldC5hcmdzWzBdWzFdIS5pdGVtKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQucGFyZW50Q2hhaW4sICg8QXJyYXk8YW55Pj4ocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLnBhcmVudENoYWluKSkubWFwKGFyZyA9PiByZW1vdmVVbnNldEtleXMoYXJnKSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0OiBmYWxzZSwgZm9jdXM6IGZhbHNlLCBleHBhbmQ6IGZhbHNlIH0sIHJldmVhbFRhcmdldC5hcmdzWzBdWzJdKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWwgYWZ0ZXIgZmlyc3QgdWRwYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbFRhcmdldCA9IHNpbm9uLnNweSh0YXJnZXQsICckcmV2ZWFsJyk7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCd0cmVlRGF0YVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7XG5cdFx0XHRpdGVtOiB7IGhhbmRsZTogJzAvMDphLzA6YWMnLCBsYWJlbDogeyBsYWJlbDogJ2FjJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSwgcGFyZW50SGFuZGxlOiAnMC8wOmEnIH0sXG5cdFx0XHRwYXJlbnRDaGFpbjogW3sgaGFuZGxlOiAnMC8wOmEnLCBsYWJlbDogeyBsYWJlbDogJ2EnIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgfV1cblx0XHR9O1xuXHRcdHJldHVybiBsb2FkQ29tcGxldGVUcmVlKCd0cmVlRGF0YVByb3ZpZGVyJylcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0dHJlZSA9IHtcblx0XHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHRcdCdhYSc6IHt9LFxuXHRcdFx0XHRcdFx0J2FjJzoge31cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdFx0J2JhJzoge30sXG5cdFx0XHRcdFx0XHQnYmInOiB7fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cblx0XHRcdFx0cmV0dXJuIHRyZWVWaWV3LnJldmVhbCh7IGtleTogJ2FjJyB9KVxuXHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayhyZXZlYWxUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCd0cmVlRGF0YVByb3ZpZGVyJywgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMF0pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5pdGVtLCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLml0ZW0pKTtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQucGFyZW50Q2hhaW4sICg8QXJyYXk8YW55Pj4ocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLnBhcmVudENoYWluKSkubWFwKGFyZyA9PiByZW1vdmVVbnNldEtleXMoYXJnKSkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNlbGVjdDogdHJ1ZSwgZm9jdXM6IGZhbHNlLCBleHBhbmQ6IGZhbHNlIH0sIHJldmVhbFRhcmdldC5hcmdzWzBdWzJdKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWwgYWZ0ZXIgc2Vjb25kIHVkcGF0ZScsICgpID0+IHtcblx0XHRjb25zdCByZXZlYWxUYXJnZXQgPSBzaW5vbi5zcHkodGFyZ2V0LCAnJHJldmVhbCcpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdHJldHVybiBsb2FkQ29tcGxldGVUcmVlKCd0cmVlRGF0YVByb3ZpZGVyJylcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHR0cmVlID0ge1xuXHRcdFx0XHRcdFx0J2EnOiB7XG5cdFx0XHRcdFx0XHRcdCdhYSc6IHt9LFxuXHRcdFx0XHRcdFx0XHQnYWMnOiB7fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdiJzoge1xuXHRcdFx0XHRcdFx0XHQnYmEnOiB7fSxcblx0XHRcdFx0XHRcdFx0J2JiJzoge31cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhJykpO1xuXHRcdFx0XHRcdHRyZWUgPSB7XG5cdFx0XHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHRcdFx0J2FhJzoge30sXG5cdFx0XHRcdFx0XHRcdCdhYyc6IHt9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0XHRcdCdiYSc6IHt9LFxuXHRcdFx0XHRcdFx0XHQnYmMnOiB7fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYmMnIH0pXG5cdFx0XHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5vayhyZXZlYWxUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoJ3RyZWVEYXRhUHJvdmlkZXInLCByZXZlYWxUYXJnZXQuYXJnc1swXVswXSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYW5kbGU6ICcwLzA6Yi8wOmJjJywgbGFiZWw6IHsgbGFiZWw6ICdiYycgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUsIHBhcmVudEhhbmRsZTogJzAvMDpiJyB9LCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLml0ZW0pKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbeyBoYW5kbGU6ICcwLzA6YicsIGxhYmVsOiB7IGxhYmVsOiAnYicgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCB9XSwgKDxBcnJheTxhbnk+PnJldmVhbFRhcmdldC5hcmdzWzBdWzFdIS5wYXJlbnRDaGFpbikubWFwKGFyZyA9PiByZW1vdmVVbnNldEtleXMoYXJnKSkpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0OiB0cnVlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSwgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMl0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGxvYWRDb21wbGV0ZVRyZWUodHJlZUlkOiBzdHJpbmcsIGVsZW1lbnQ/OiBzdHJpbmcpOiBQcm9taXNlPG51bGw+IHtcblx0XHRyZXR1cm4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4odHJlZUlkLCBlbGVtZW50ID8gW2VsZW1lbnRdIDogdW5kZWZpbmVkKVxuXHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnRzIHx8IGVsZW1lbnRzPy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZWxlbWVudHNbMF0uc2xpY2UoMSkubWFwKGUgPT4gbG9hZENvbXBsZXRlVHJlZSh0cmVlSWQsIChlIGFzIElUcmVlSXRlbSkuaGFuZGxlKSk7XG5cdFx0XHR9KVxuXHRcdFx0LnRoZW4oKCkgPT4gbnVsbCk7XG5cdH1cblxuXHRmdW5jdGlvbiByZW1vdmVVbnNldEtleXMob2JqOiBhbnkpOiBhbnkge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KG9iaikpIHtcblx0XHRcdHJldHVybiBvYmoubWFwKG8gPT4gcmVtb3ZlVW5zZXRLZXlzKG8pKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogeyBba2V5OiBzdHJpbmddOiBhbnkgfSA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMob2JqKSkge1xuXHRcdFx0XHRpZiAob2JqW2tleV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJlc3VsdFtrZXldID0gcmVtb3ZlVW5zZXRLZXlzKG9ialtrZXldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIG9iajtcblx0fVxuXG5cdGZ1bmN0aW9uIGFOb2RlVHJlZURhdGFQcm92aWRlcigpOiBUcmVlRGF0YVByb3ZpZGVyPHsga2V5OiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRDaGlsZHJlbjogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IHsga2V5OiBzdHJpbmcgfVtdID0+IHtcblx0XHRcdFx0cmV0dXJuIGdldENoaWxkcmVuKGVsZW1lbnQgPyBlbGVtZW50LmtleSA6IHVuZGVmaW5lZCkubWFwKGtleSA9PiBnZXROb2RlKGtleSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldFRyZWVJdGVtOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogVHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRyZXR1cm4gZ2V0VHJlZUl0ZW0oZWxlbWVudC5rZXkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZURhdGE6IG9uRGlkQ2hhbmdlVHJlZU5vZGUuZXZlbnRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKTogVHJlZURhdGFQcm92aWRlcjx7IGtleTogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0Q2hpbGRyZW46IChlbGVtZW50OiB7IGtleTogc3RyaW5nIH0pOiB7IGtleTogc3RyaW5nIH1bXSA9PiB7XG5cdFx0XHRcdHJldHVybiBnZXRDaGlsZHJlbihlbGVtZW50ID8gZWxlbWVudC5rZXkgOiB1bmRlZmluZWQpLm1hcChrZXkgPT4gZ2V0Tm9kZShrZXkpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRUcmVlSXRlbTogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IFRyZWVJdGVtID0+IHtcblx0XHRcdFx0cmV0dXJuIGdldFRyZWVJdGVtKGVsZW1lbnQua2V5KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRQYXJlbnQ6ICh7IGtleSB9OiB7IGtleTogc3RyaW5nIH0pOiB7IGtleTogc3RyaW5nIH0gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRLZXkgPSBrZXkuc3Vic3RyaW5nKDAsIGtleS5sZW5ndGggLSAxKTtcblx0XHRcdFx0cmV0dXJuIHBhcmVudEtleSA/IG5ldyBLZXkocGFyZW50S2V5KSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVEYXRhOiBvbkRpZENoYW5nZVRyZWVOb2RlLmV2ZW50XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFOb2RlV2l0aElkVHJlZURhdGFQcm92aWRlcigpOiBUcmVlRGF0YVByb3ZpZGVyPHsga2V5OiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRDaGlsZHJlbjogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IHsga2V5OiBzdHJpbmcgfVtdID0+IHtcblx0XHRcdFx0cmV0dXJuIGdldENoaWxkcmVuKGVsZW1lbnQgPyBlbGVtZW50LmtleSA6IHVuZGVmaW5lZCkubWFwKGtleSA9PiBnZXROb2RlKGtleSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldFRyZWVJdGVtOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogVHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRjb25zdCB0cmVlSXRlbSA9IGdldFRyZWVJdGVtKGVsZW1lbnQua2V5KTtcblx0XHRcdFx0dHJlZUl0ZW0uaWQgPSBlbGVtZW50LmtleTtcblx0XHRcdFx0cmV0dXJuIHRyZWVJdGVtO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZURhdGE6IG9uRGlkQ2hhbmdlVHJlZU5vZGVXaXRoSWQuZXZlbnRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYU5vZGVXaXRoSGlnaGxpZ2h0ZWRMYWJlbFRyZWVEYXRhUHJvdmlkZXIoKTogVHJlZURhdGFQcm92aWRlcjx7IGtleTogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0Q2hpbGRyZW46IChlbGVtZW50OiB7IGtleTogc3RyaW5nIH0pOiB7IGtleTogc3RyaW5nIH1bXSA9PiB7XG5cdFx0XHRcdHJldHVybiBnZXRDaGlsZHJlbihlbGVtZW50ID8gZWxlbWVudC5rZXkgOiB1bmRlZmluZWQpLm1hcChrZXkgPT4gZ2V0Tm9kZShrZXkpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRUcmVlSXRlbTogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IFRyZWVJdGVtID0+IHtcblx0XHRcdFx0Y29uc3QgdHJlZUl0ZW0gPSBnZXRUcmVlSXRlbShlbGVtZW50LmtleSwgW1swLCAyXSwgWzMsIDVdXSk7XG5cdFx0XHRcdHRyZWVJdGVtLmlkID0gZWxlbWVudC5rZXk7XG5cdFx0XHRcdHJldHVybiB0cmVlSXRlbTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVEYXRhOiBvbkRpZENoYW5nZVRyZWVOb2RlV2l0aElkLmV2ZW50XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFRyZWVFbGVtZW50KGVsZW1lbnQ6IHN0cmluZyk6IGFueSB7XG5cdFx0bGV0IHBhcmVudCA9IHRyZWU7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRwYXJlbnQgPSBwYXJlbnRbZWxlbWVudC5zdWJzdHJpbmcoMCwgaSArIDEpXTtcblx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGFyZW50O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0Q2hpbGRyZW4oa2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHJldHVybiBPYmplY3Qua2V5cyh0cmVlKTtcblx0XHR9XG5cdFx0Y29uc3QgdHJlZUVsZW1lbnQgPSBnZXRUcmVlRWxlbWVudChrZXkpO1xuXHRcdGlmICh0cmVlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRyZWVFbGVtZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0VHJlZUl0ZW0oa2V5OiBzdHJpbmcsIGhpZ2hsaWdodHM/OiBbbnVtYmVyLCBudW1iZXJdW10pOiBUcmVlSXRlbSB7XG5cdFx0Y29uc3QgdHJlZUVsZW1lbnQgPSBnZXRUcmVlRWxlbWVudChrZXkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogeyBsYWJlbDogbGFiZWxzW2tleV0gfHwga2V5LCBoaWdobGlnaHRzIH0sXG5cdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiB0cmVlRWxlbWVudCAmJiBPYmplY3Qua2V5cyh0cmVlRWxlbWVudCkubGVuZ3RoID8gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCA6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldE5vZGUoa2V5OiBzdHJpbmcpOiB7IGtleTogc3RyaW5nIH0ge1xuXHRcdGlmICghbm9kZXNba2V5XSkge1xuXHRcdFx0bm9kZXNba2V5XSA9IG5ldyBLZXkoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5vZGVzW2tleV07XG5cdH1cblxuXHRjbGFzcyBLZXkge1xuXHRcdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGtleTogc3RyaW5nKSB7IH1cblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW1DLG1CQUE0QztBQUUvRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQ0FBMkQ7QUFDcEUsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyw0QkFBNEIsNkJBQTZCO0FBQ2xFLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0JBQWdCLFFBQTJGO0FBQ25ILE1BQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxHQUFHO0FBQ25DLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixVQUFNLElBQUksTUFBTSxvREFBb0Q7QUFBQSxFQUNyRTtBQUNBLFNBQU8sT0FBTyxDQUFDLEVBQUUsTUFBTSxDQUFDO0FBQ3pCO0FBRUEsTUFBTSxtQkFBbUIsV0FBWTtBQUNwQyxRQUFNLFFBQVEsd0NBQXdDO0FBQUEsRUFFdEQsTUFBTSx1QkFBdUIsS0FBK0IsRUFBRTtBQUFBLElBQTlEO0FBQUE7QUFFQyx1QkFBWSxJQUFJLFFBQWlEO0FBQUE7QUFBQSxJQUVqRSxNQUFlLDhCQUE4QixZQUFtQztBQUFBLElBQ2hGO0FBQUEsSUFFUyxTQUFTLFFBQWdCLGdCQUF3RTtBQUN6RyxhQUFPLFFBQVEsUUFBUSxJQUFJLEVBQUUsS0FBSyxNQUFNO0FBQ3ZDLGFBQUssVUFBVSxLQUFLLGNBQWM7QUFBQSxNQUNuQyxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRVMsUUFBUSxZQUFvQixVQUFxRSxTQUF3QztBQUNqSixhQUFPLFFBQVEsUUFBUTtBQUFBLElBQ3hCO0FBQUEsSUFFUyxhQUFhLFlBQW1DO0FBQ3hELGFBQU8sUUFBUSxRQUFRO0FBQUEsSUFDeEI7QUFBQSxF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
