import { Barrier, isThenable, RunOnceScheduler } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { assertNever } from "../../../../base/common/assert.js";
import { applyTestItemUpdate, namespaceTestTag, TestDiffOpType, TestItemExpandState } from "./testTypes.js";
import { TestId } from "./testId.js";
var TestItemEventOp = /* @__PURE__ */ ((TestItemEventOp2) => {
  TestItemEventOp2[TestItemEventOp2["Upsert"] = 0] = "Upsert";
  TestItemEventOp2[TestItemEventOp2["SetTags"] = 1] = "SetTags";
  TestItemEventOp2[TestItemEventOp2["UpdateCanResolveChildren"] = 2] = "UpdateCanResolveChildren";
  TestItemEventOp2[TestItemEventOp2["RemoveChild"] = 3] = "RemoveChild";
  TestItemEventOp2[TestItemEventOp2["SetProp"] = 4] = "SetProp";
  TestItemEventOp2[TestItemEventOp2["Bulk"] = 5] = "Bulk";
  TestItemEventOp2[TestItemEventOp2["DocumentSynced"] = 6] = "DocumentSynced";
  return TestItemEventOp2;
})(TestItemEventOp || {});
const strictEqualComparator = (a, b) => a === b;
const diffableProps = {
  range: (a, b) => {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.equalsRange(b);
  },
  busy: strictEqualComparator,
  label: strictEqualComparator,
  description: strictEqualComparator,
  error: strictEqualComparator,
  sortText: strictEqualComparator,
  tags: (a, b) => {
    if (a.length !== b.length) {
      return false;
    }
    if (a.some((t1) => !b.includes(t1))) {
      return false;
    }
    return true;
  }
};
const diffableEntries = Object.entries(diffableProps);
const diffTestItems = (a, b) => {
  let output;
  for (const [key, cmp] of diffableEntries) {
    if (!cmp(a[key], b[key])) {
      if (output) {
        output[key] = b[key];
      } else {
        output = { [key]: b[key] };
      }
    }
  }
  return output;
};
class TestItemCollection extends Disposable {
  constructor(options) {
    super();
    this.options = options;
    this.debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
    this.diffOpEmitter = this._register(new Emitter());
    this.tree = /* @__PURE__ */ new Map();
    this.tags = /* @__PURE__ */ new Map();
    this.diff = [];
    /**
     * Fires when an operation happens that should result in a diff.
     */
    this.onDidGenerateDiff = this.diffOpEmitter.event;
    this.root.canResolveChildren = true;
    this.upsertItem(this.root, void 0);
  }
  get root() {
    return this.options.root;
  }
  /**
   * Handler used for expanding test items.
   */
  set resolveHandler(handler) {
    this._resolveHandler = handler;
    for (const test of this.tree.values()) {
      this.updateExpandability(test);
    }
  }
  get resolveHandler() {
    return this._resolveHandler;
  }
  /**
   * Gets a diff of all changes that have been made, and clears the diff queue.
   */
  collectDiff() {
    const diff = this.diff;
    this.diff = [];
    return diff;
  }
  /**
   * Pushes a new diff entry onto the collected diff list.
   */
  pushDiff(diff) {
    switch (diff.op) {
      case TestDiffOpType.DocumentSynced: {
        for (const existing of this.diff) {
          if (existing.op === TestDiffOpType.DocumentSynced && existing.uri === diff.uri) {
            existing.docv = diff.docv;
            return;
          }
        }
        break;
      }
      case TestDiffOpType.Update: {
        const last = this.diff[this.diff.length - 1];
        if (last) {
          if (last.op === TestDiffOpType.Update && last.item.extId === diff.item.extId) {
            applyTestItemUpdate(last.item, diff.item);
            return;
          }
          if (last.op === TestDiffOpType.Add && last.item.item.extId === diff.item.extId) {
            applyTestItemUpdate(last.item, diff.item);
            return;
          }
        }
        break;
      }
    }
    this.diff.push(diff);
    if (!this.debounceSendDiff.isScheduled()) {
      this.debounceSendDiff.schedule();
    }
  }
  /**
   * Expands the test and the given number of `levels` of children. If levels
   * is < 0, then all children will be expanded. If it's 0, then only this
   * item will be expanded.
   */
  expand(testId, levels) {
    const internal = this.tree.get(testId);
    if (!internal) {
      return;
    }
    if (internal.expandLevels === void 0 || levels > internal.expandLevels) {
      internal.expandLevels = levels;
    }
    if (internal.expand === TestItemExpandState.Expandable) {
      const r = this.resolveChildren(internal);
      return !r.isOpen() ? r.wait().then(() => this.expandChildren(internal, levels - 1)) : this.expandChildren(internal, levels - 1);
    } else if (internal.expand === TestItemExpandState.Expanded) {
      return internal.resolveBarrier?.isOpen() === false ? internal.resolveBarrier.wait().then(() => this.expandChildren(internal, levels - 1)) : this.expandChildren(internal, levels - 1);
    }
  }
  dispose() {
    for (const item of this.tree.values()) {
      this.options.getApiFor(item.actual).listener = void 0;
    }
    this.tree.clear();
    this.diff = [];
    super.dispose();
  }
  onTestItemEvent(internal, evt) {
    switch (evt.op) {
      case 3 /* RemoveChild */:
        this.removeItem(TestId.joinToString(internal.fullId, evt.id));
        break;
      case 0 /* Upsert */:
        this.upsertItem(evt.item, internal);
        break;
      case 5 /* Bulk */:
        for (const op of evt.ops) {
          this.onTestItemEvent(internal, op);
        }
        break;
      case 1 /* SetTags */:
        this.diffTagRefs(evt.new, evt.old, internal.fullId.toString());
        break;
      case 2 /* UpdateCanResolveChildren */:
        this.updateExpandability(internal);
        break;
      case 4 /* SetProp */:
        this.pushDiff({
          op: TestDiffOpType.Update,
          item: {
            extId: internal.fullId.toString(),
            item: evt.update
          }
        });
        break;
      case 6 /* DocumentSynced */:
        this.documentSynced(internal.actual.uri);
        break;
      default:
        assertNever(evt);
    }
  }
  documentSynced(uri) {
    if (uri) {
      this.pushDiff({
        op: TestDiffOpType.DocumentSynced,
        uri,
        docv: this.options.getDocumentVersion(uri)
      });
    }
  }
  upsertItem(actual, parent) {
    const fullId = TestId.fromExtHostTestItem(actual, this.root.id, parent?.actual);
    const privateApi = this.options.getApiFor(actual);
    if (privateApi.parent && privateApi.parent !== parent?.actual) {
      this.options.getChildren(privateApi.parent).delete(actual.id);
    }
    let internal = this.tree.get(fullId.toString());
    if (!internal) {
      internal = {
        fullId,
        actual,
        expandLevels: parent?.expandLevels ? parent.expandLevels - 1 : void 0,
        expand: TestItemExpandState.NotExpandable
        // updated by `connectItemAndChildren`
      };
      actual.tags.forEach(this.incrementTagRefs, this);
      this.tree.set(internal.fullId.toString(), internal);
      this.setItemParent(actual, parent);
      this.pushDiff({
        op: TestDiffOpType.Add,
        item: {
          controllerId: this.options.controllerId,
          expand: internal.expand,
          item: this.options.toITestItem(actual)
        }
      });
      this.connectItemAndChildren(actual, internal, parent);
      return;
    }
    if (internal.actual === actual) {
      this.connectItem(actual, internal, parent);
      return;
    }
    if (internal.actual.uri?.toString() !== actual.uri?.toString()) {
      this.removeItem(fullId.toString());
      return this.upsertItem(actual, parent);
    }
    const oldChildren = this.options.getChildren(internal.actual);
    const oldActual = internal.actual;
    const update = diffTestItems(this.options.toITestItem(oldActual), this.options.toITestItem(actual));
    this.options.getApiFor(oldActual).listener = void 0;
    internal.actual = actual;
    internal.resolveBarrier = void 0;
    internal.expand = TestItemExpandState.NotExpandable;
    if (update) {
      if (update.hasOwnProperty("tags")) {
        this.diffTagRefs(actual.tags, oldActual.tags, fullId.toString());
        delete update.tags;
      }
      this.onTestItemEvent(internal, { op: 4 /* SetProp */, update });
    }
    this.connectItemAndChildren(actual, internal, parent);
    for (const [_, child] of oldChildren) {
      if (!this.options.getChildren(actual).get(child.id)) {
        this.removeItem(TestId.joinToString(fullId, child.id));
      }
    }
    const expandLevels = internal.expandLevels;
    if (expandLevels !== void 0) {
      queueMicrotask(() => {
        if (internal.expand === TestItemExpandState.Expandable) {
          internal.expandLevels = void 0;
          this.expand(fullId.toString(), expandLevels);
        }
      });
    }
    this.documentSynced(internal.actual.uri);
  }
  diffTagRefs(newTags, oldTags, extId) {
    const toDelete = new Set(oldTags.map((t) => t.id));
    for (const tag of newTags) {
      if (!toDelete.delete(tag.id)) {
        this.incrementTagRefs(tag);
      }
    }
    this.pushDiff({
      op: TestDiffOpType.Update,
      item: { extId, item: { tags: newTags.map((v) => namespaceTestTag(this.options.controllerId, v.id)) } }
    });
    toDelete.forEach(this.decrementTagRefs, this);
  }
  incrementTagRefs(tag) {
    const existing = this.tags.get(tag.id);
    if (existing) {
      existing.refCount++;
    } else {
      this.tags.set(tag.id, { refCount: 1 });
      this.pushDiff({
        op: TestDiffOpType.AddTag,
        tag: {
          id: namespaceTestTag(this.options.controllerId, tag.id)
        }
      });
    }
  }
  decrementTagRefs(tagId) {
    const existing = this.tags.get(tagId);
    if (existing && !--existing.refCount) {
      this.tags.delete(tagId);
      this.pushDiff({ op: TestDiffOpType.RemoveTag, id: namespaceTestTag(this.options.controllerId, tagId) });
    }
  }
  setItemParent(actual, parent) {
    this.options.getApiFor(actual).parent = parent && parent.actual !== this.root ? parent.actual : void 0;
  }
  connectItem(actual, internal, parent) {
    this.setItemParent(actual, parent);
    const api = this.options.getApiFor(actual);
    api.parent = parent?.actual;
    api.listener = (evt) => this.onTestItemEvent(internal, evt);
    this.updateExpandability(internal);
  }
  connectItemAndChildren(actual, internal, parent) {
    this.connectItem(actual, internal, parent);
    for (const [_, child] of this.options.getChildren(actual)) {
      this.upsertItem(child, internal);
    }
  }
  /**
   * Updates the `expand` state of the item. Should be called whenever the
   * resolved state of the item changes. Can automatically expand the item
   * if requested by a consumer.
   */
  updateExpandability(internal) {
    let newState;
    if (!this._resolveHandler) {
      newState = TestItemExpandState.NotExpandable;
    } else if (internal.resolveBarrier) {
      newState = internal.resolveBarrier.isOpen() ? TestItemExpandState.Expanded : TestItemExpandState.BusyExpanding;
    } else {
      newState = internal.actual.canResolveChildren ? TestItemExpandState.Expandable : TestItemExpandState.NotExpandable;
    }
    if (newState === internal.expand) {
      return;
    }
    internal.expand = newState;
    this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: newState } });
    if (newState === TestItemExpandState.Expandable && internal.expandLevels !== void 0) {
      this.resolveChildren(internal);
    }
  }
  /**
   * Expands all children of the item, "levels" deep. If levels is 0, only
   * the children will be expanded. If it's 1, the children and their children
   * will be expanded. If it's <0, it's a no-op.
   */
  expandChildren(internal, levels) {
    if (levels < 0) {
      return;
    }
    const expandRequests = [];
    for (const [_, child] of this.options.getChildren(internal.actual)) {
      const promise = this.expand(TestId.joinToString(internal.fullId, child.id), levels);
      if (isThenable(promise)) {
        expandRequests.push(promise);
      }
    }
    if (expandRequests.length) {
      return Promise.all(expandRequests).then(() => {
      });
    }
  }
  /**
   * Calls `discoverChildren` on the item, refreshing all its tests.
   */
  resolveChildren(internal) {
    if (internal.resolveBarrier) {
      return internal.resolveBarrier;
    }
    if (!this._resolveHandler) {
      const b = new Barrier();
      b.open();
      return b;
    }
    internal.expand = TestItemExpandState.BusyExpanding;
    this.pushExpandStateUpdate(internal);
    const barrier = internal.resolveBarrier = new Barrier();
    const applyError = (err) => {
      console.error(`Unhandled error in resolveHandler of test controller "${this.options.controllerId}"`, err);
    };
    let r;
    try {
      r = this._resolveHandler(internal.actual === this.root ? void 0 : internal.actual);
    } catch (err) {
      applyError(err);
    }
    if (isThenable(r)) {
      r.catch(applyError).then(() => {
        barrier.open();
        this.updateExpandability(internal);
      });
    } else {
      barrier.open();
      this.updateExpandability(internal);
    }
    return internal.resolveBarrier;
  }
  pushExpandStateUpdate(internal) {
    this.pushDiff({ op: TestDiffOpType.Update, item: { extId: internal.fullId.toString(), expand: internal.expand } });
  }
  removeItem(childId) {
    const childItem = this.tree.get(childId);
    if (!childItem) {
      throw new Error("attempting to remove non-existent child");
    }
    this.pushDiff({ op: TestDiffOpType.Remove, itemId: childId });
    const queue = [childItem];
    while (queue.length) {
      const item = queue.pop();
      if (!item) {
        continue;
      }
      this.options.getApiFor(item.actual).listener = void 0;
      for (const tag of item.actual.tags) {
        this.decrementTagRefs(tag.id);
      }
      this.tree.delete(item.fullId.toString());
      for (const [_, child] of this.options.getChildren(item.actual)) {
        queue.push(this.tree.get(TestId.joinToString(item.fullId, child.id)));
      }
    }
  }
  /**
   * Immediately emits any pending diffs on the collection.
   */
  flushDiff() {
    const diff = this.collectDiff();
    if (diff.length) {
      this.diffOpEmitter.fire(diff);
    }
  }
}
class DuplicateTestItemError extends Error {
  constructor(id) {
    super(`Attempted to insert a duplicate test item ID ${id}`);
  }
}
class InvalidTestItemError extends Error {
  constructor(id) {
    super(`TestItem with ID "${id}" is invalid. Make sure to create it from the createTestItem method.`);
  }
}
class MixedTestItemController extends Error {
  constructor(id, ctrlA, ctrlB) {
    super(`TestItem with ID "${id}" is from controller "${ctrlA}" and cannot be added as a child of an item from controller "${ctrlB}".`);
  }
}
const createTestItemChildren = (api, getApi, checkCtor) => {
  let mapped = /* @__PURE__ */ new Map();
  return {
    /** @inheritdoc */
    get size() {
      return mapped.size;
    },
    /** @inheritdoc */
    forEach(callback, thisArg) {
      for (const item of mapped.values()) {
        callback.call(thisArg, item, this);
      }
    },
    /** @inheritdoc */
    [Symbol.iterator]() {
      return mapped.entries();
    },
    /** @inheritdoc */
    replace(items) {
      const newMapped = /* @__PURE__ */ new Map();
      const toDelete = new Set(mapped.keys());
      const bulk = { op: 5 /* Bulk */, ops: [] };
      for (const item of items) {
        if (!(item instanceof checkCtor)) {
          throw new InvalidTestItemError(item.id);
        }
        const itemController = getApi(item).controllerId;
        if (itemController !== api.controllerId) {
          throw new MixedTestItemController(item.id, itemController, api.controllerId);
        }
        if (newMapped.has(item.id)) {
          throw new DuplicateTestItemError(item.id);
        }
        newMapped.set(item.id, item);
        toDelete.delete(item.id);
        bulk.ops.push({ op: 0 /* Upsert */, item });
      }
      for (const id of toDelete.keys()) {
        bulk.ops.push({ op: 3 /* RemoveChild */, id });
      }
      api.listener?.(bulk);
      mapped = newMapped;
    },
    /** @inheritdoc */
    add(item) {
      if (!(item instanceof checkCtor)) {
        throw new InvalidTestItemError(item.id);
      }
      mapped.set(item.id, item);
      api.listener?.({ op: 0 /* Upsert */, item });
    },
    /** @inheritdoc */
    delete(id) {
      if (mapped.delete(id)) {
        api.listener?.({ op: 3 /* RemoveChild */, id });
      }
    },
    /** @inheritdoc */
    get(itemId) {
      return mapped.get(itemId);
    },
    /** JSON serialization function. */
    toJSON() {
      return Array.from(mapped.values());
    }
  };
};
export {
  DuplicateTestItemError,
  InvalidTestItemError,
  MixedTestItemController,
  TestItemCollection,
  TestItemEventOp,
  createTestItemChildren
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJdGVtQ29sbGVjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJhcnJpZXIsIGlzVGhlbmFibGUsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBhcHBseVRlc3RJdGVtVXBkYXRlLCBJVGVzdEl0ZW0sIElUZXN0VGFnLCBuYW1lc3BhY2VUZXN0VGFnLCBUZXN0RGlmZk9wVHlwZSwgVGVzdEl0ZW1FeHBhbmRTdGF0ZSwgVGVzdHNEaWZmLCBUZXN0c0RpZmZPcCB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4vdGVzdElkLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuaW50ZXJmYWNlIENvbGxlY3Rpb25JdGVtPFQ+IHtcblx0cmVhZG9ubHkgZnVsbElkOiBUZXN0SWQ7XG5cdGFjdHVhbDogVDtcblx0ZXhwYW5kOiBUZXN0SXRlbUV4cGFuZFN0YXRlO1xuXHQvKipcblx0ICogTnVtYmVyIG9mIGxldmVscyBvZiBpdGVtcyBiZWxvdyB0aGlzIG9uZSB0aGF0IGFyZSBleHBhbmRlZC4gTWF5IGJlIGluZmluaXRlLlxuXHQgKi9cblx0ZXhwYW5kTGV2ZWxzPzogbnVtYmVyO1xuXHRyZXNvbHZlQmFycmllcj86IEJhcnJpZXI7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RJdGVtRXZlbnRPcCB7XG5cdFVwc2VydCxcblx0U2V0VGFncyxcblx0VXBkYXRlQ2FuUmVzb2x2ZUNoaWxkcmVuLFxuXHRSZW1vdmVDaGlsZCxcblx0U2V0UHJvcCxcblx0QnVsayxcblx0RG9jdW1lbnRTeW5jZWQsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtVXBzZXJ0Q2hpbGQge1xuXHRvcDogVGVzdEl0ZW1FdmVudE9wLlVwc2VydDtcblx0aXRlbTogSVRlc3RJdGVtTGlrZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1VcGRhdGVDYW5SZXNvbHZlQ2hpbGRyZW4ge1xuXHRvcDogVGVzdEl0ZW1FdmVudE9wLlVwZGF0ZUNhblJlc29sdmVDaGlsZHJlbjtcblx0c3RhdGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtU2V0VGFncyB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuU2V0VGFncztcblx0bmV3OiBJVGVzdFRhZ1tdO1xuXHRvbGQ6IElUZXN0VGFnW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RJdGVtUmVtb3ZlQ2hpbGQge1xuXHRvcDogVGVzdEl0ZW1FdmVudE9wLlJlbW92ZUNoaWxkO1xuXHRpZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbVNldFByb3Age1xuXHRvcDogVGVzdEl0ZW1FdmVudE9wLlNldFByb3A7XG5cdHVwZGF0ZTogUGFydGlhbDxJVGVzdEl0ZW0+O1xufVxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1CdWxrUmVwbGFjZSB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuQnVsaztcblx0b3BzOiAoSVRlc3RJdGVtVXBzZXJ0Q2hpbGQgfCBJVGVzdEl0ZW1SZW1vdmVDaGlsZClbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1Eb2N1bWVudFN5bmNlZCB7XG5cdG9wOiBUZXN0SXRlbUV2ZW50T3AuRG9jdW1lbnRTeW5jZWQ7XG59XG5cbmV4cG9ydCB0eXBlIEV4dEhvc3RUZXN0SXRlbUV2ZW50ID1cblx0fCBJVGVzdEl0ZW1TZXRUYWdzXG5cdHwgSVRlc3RJdGVtVXBzZXJ0Q2hpbGRcblx0fCBJVGVzdEl0ZW1SZW1vdmVDaGlsZFxuXHR8IElUZXN0SXRlbVVwZGF0ZUNhblJlc29sdmVDaGlsZHJlblxuXHR8IElUZXN0SXRlbVNldFByb3Bcblx0fCBJVGVzdEl0ZW1CdWxrUmVwbGFjZVxuXHR8IElUZXN0SXRlbURvY3VtZW50U3luY2VkO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUFwaTxUPiB7XG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHRwYXJlbnQ/OiBUO1xuXHRsaXN0ZW5lcj86IChldnQ6IEV4dEhvc3RUZXN0SXRlbUV2ZW50KSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUNvbGxlY3Rpb25PcHRpb25zPFQ+IHtcblx0LyoqIENvbnRyb2xsZXIgSUQgdG8gdXNlIHRvIHByZWZpeCB0aGVzZSB0ZXN0IGl0ZW1zLiAqL1xuXHRjb250cm9sbGVySWQ6IHN0cmluZztcblxuXHQvKiogR2V0cyB0aGUgZG9jdW1lbnQgdmVyc2lvbiBhdCB0aGUgZ2l2ZW4gVVJJLCBpZiBpdCdzIG9wZW4gKi9cblx0Z2V0RG9jdW1lbnRWZXJzaW9uKHVyaTogVVJJIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBHZXRzIEFQSSBmb3IgdGhlIGdpdmVuIHRlc3QgaXRlbSwgdXNlZCB0byBsaXN0ZW4gZm9yIGV2ZW50cyBhbmQgc2V0IHBhcmVudHMuICovXG5cdGdldEFwaUZvcihpdGVtOiBUKTogSVRlc3RJdGVtQXBpPFQ+O1xuXG5cdC8qKiBDb252ZXJ0cyB0aGUgZnVsbCB0ZXN0IGl0ZW0gdG8gdGhlIGNvbW1vbiBpbnRlcmZhY2UuICovXG5cdHRvSVRlc3RJdGVtKGl0ZW06IFQpOiBJVGVzdEl0ZW07XG5cblx0LyoqIEdldHMgY2hpbGRyZW4gZm9yIHRoZSBpdGVtLiAqL1xuXHRnZXRDaGlsZHJlbihpdGVtOiBUKTogSVRlc3RDaGlsZHJlbkxpa2U8VD47XG5cblx0LyoqIFJvb3QgdG8gdXNlIGZvciB0aGUgbmV3IHRlc3QgY29sbGVjdGlvbi4gKi9cblx0cm9vdDogVDtcbn1cblxuY29uc3Qgc3RyaWN0RXF1YWxDb21wYXJhdG9yID0gPFQ+KGE6IFQsIGI6IFQpID0+IGEgPT09IGI7XG5jb25zdCBkaWZmYWJsZVByb3BzOiB7IFtLIGluIGtleW9mIElUZXN0SXRlbV0/OiAoYTogSVRlc3RJdGVtW0tdLCBiOiBJVGVzdEl0ZW1bS10pID0+IGJvb2xlYW4gfSA9IHtcblx0cmFuZ2U6IChhLCBiKSA9PiB7XG5cdFx0aWYgKGEgPT09IGIpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRpZiAoIWEgfHwgIWIpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0cmV0dXJuIGEuZXF1YWxzUmFuZ2UoYik7XG5cdH0sXG5cdGJ1c3k6IHN0cmljdEVxdWFsQ29tcGFyYXRvcixcblx0bGFiZWw6IHN0cmljdEVxdWFsQ29tcGFyYXRvcixcblx0ZGVzY3JpcHRpb246IHN0cmljdEVxdWFsQ29tcGFyYXRvcixcblx0ZXJyb3I6IHN0cmljdEVxdWFsQ29tcGFyYXRvcixcblx0c29ydFRleHQ6IHN0cmljdEVxdWFsQ29tcGFyYXRvcixcblx0dGFnczogKGEsIGIpID0+IHtcblx0XHRpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGEuc29tZSh0MSA9PiAhYi5pbmNsdWRlcyh0MSkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH0sXG59O1xuXG5jb25zdCBkaWZmYWJsZUVudHJpZXMgPSBPYmplY3QuZW50cmllcyhkaWZmYWJsZVByb3BzKSBhcyByZWFkb25seSBba2V5b2YgSVRlc3RJdGVtLCAoYTogdW5rbm93biwgYjogdW5rbm93bikgPT4gYm9vbGVhbl1bXTtcblxuY29uc3QgZGlmZlRlc3RJdGVtcyA9IChhOiBJVGVzdEl0ZW0sIGI6IElUZXN0SXRlbSkgPT4ge1xuXHRsZXQgb3V0cHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBba2V5LCBjbXBdIG9mIGRpZmZhYmxlRW50cmllcykge1xuXHRcdGlmICghY21wKGFba2V5XSwgYltrZXldKSkge1xuXHRcdFx0aWYgKG91dHB1dCkge1xuXHRcdFx0XHRvdXRwdXRba2V5XSA9IGJba2V5XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dCA9IHsgW2tleV06IGJba2V5XSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBvdXRwdXQgYXMgUGFydGlhbDxJVGVzdEl0ZW0+IHwgdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdENoaWxkcmVuTGlrZTxUPiBleHRlbmRzIEl0ZXJhYmxlPFtzdHJpbmcsIFRdPiB7XG5cdGdldChpZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZDtcblx0ZGVsZXRlKGlkOiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0SXRlbUxpa2Uge1xuXHRpZDogc3RyaW5nO1xuXHR0YWdzOiByZWFkb25seSBJVGVzdFRhZ1tdO1xuXHR1cmk/OiBVUkk7XG5cdGNhblJlc29sdmVDaGlsZHJlbjogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNYWludGFpbnMgYSBjb2xsZWN0aW9uIG9mIHRlc3QgaXRlbXMgZm9yIGEgc2luZ2xlIGNvbnRyb2xsZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0SXRlbUNvbGxlY3Rpb248VCBleHRlbmRzIElUZXN0SXRlbUxpa2U+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVib3VuY2VTZW5kRGlmZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZmx1c2hEaWZmKCksIDIwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZPcEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXN0c0RpZmY+KCkpO1xuXHRwcml2YXRlIF9yZXNvbHZlSGFuZGxlcj86IChpdGVtOiBUIHwgdW5kZWZpbmVkKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZDtcblxuXHRwdWJsaWMgZ2V0IHJvb3QoKSB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5yb290O1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHRyZWUgPSBuZXcgTWFwPC8qIGZ1bGwgdGVzdCBpZCAqL3N0cmluZywgQ29sbGVjdGlvbkl0ZW08VD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGFncyA9IG5ldyBNYXA8c3RyaW5nLCB7IGxhYmVsPzogc3RyaW5nOyByZWZDb3VudDogbnVtYmVyIH0+KCk7XG5cblx0cHJvdGVjdGVkIGRpZmY6IFRlc3RzRGlmZiA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSVRlc3RJdGVtQ29sbGVjdGlvbk9wdGlvbnM8VD4pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucm9vdC5jYW5SZXNvbHZlQ2hpbGRyZW4gPSB0cnVlO1xuXHRcdHRoaXMudXBzZXJ0SXRlbSh0aGlzLnJvb3QsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlciB1c2VkIGZvciBleHBhbmRpbmcgdGVzdCBpdGVtcy5cblx0ICovXG5cdHB1YmxpYyBzZXQgcmVzb2x2ZUhhbmRsZXIoaGFuZGxlcjogdW5kZWZpbmVkIHwgKChpdGVtOiBUIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSkge1xuXHRcdHRoaXMuX3Jlc29sdmVIYW5kbGVyID0gaGFuZGxlcjtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGhpcy50cmVlLnZhbHVlcygpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUV4cGFuZGFiaWxpdHkodGVzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCByZXNvbHZlSGFuZGxlcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUhhbmRsZXI7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhbiBvcGVyYXRpb24gaGFwcGVucyB0aGF0IHNob3VsZCByZXN1bHQgaW4gYSBkaWZmLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkR2VuZXJhdGVEaWZmID0gdGhpcy5kaWZmT3BFbWl0dGVyLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBHZXRzIGEgZGlmZiBvZiBhbGwgY2hhbmdlcyB0aGF0IGhhdmUgYmVlbiBtYWRlLCBhbmQgY2xlYXJzIHRoZSBkaWZmIHF1ZXVlLlxuXHQgKi9cblx0cHVibGljIGNvbGxlY3REaWZmKCkge1xuXHRcdGNvbnN0IGRpZmYgPSB0aGlzLmRpZmY7XG5cdFx0dGhpcy5kaWZmID0gW107XG5cdFx0cmV0dXJuIGRpZmY7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaGVzIGEgbmV3IGRpZmYgZW50cnkgb250byB0aGUgY29sbGVjdGVkIGRpZmYgbGlzdC5cblx0ICovXG5cdHB1YmxpYyBwdXNoRGlmZihkaWZmOiBUZXN0c0RpZmZPcCkge1xuXHRcdHN3aXRjaCAoZGlmZi5vcCkge1xuXHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZDoge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4aXN0aW5nIG9mIHRoaXMuZGlmZikge1xuXHRcdFx0XHRcdGlmIChleGlzdGluZy5vcCA9PT0gVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQgJiYgZXhpc3RpbmcudXJpID09PSBkaWZmLnVyaSkge1xuXHRcdFx0XHRcdFx0ZXhpc3RpbmcuZG9jdiA9IGRpZmYuZG9jdjtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuVXBkYXRlOiB7XG5cdFx0XHRcdC8vIFRyeSB0byBtZXJnZSB1cGRhdGVzLCBzaW5jZSB0aGV5J3JlIGludm9rZWQgcGVyLXByb3BlcnR5XG5cdFx0XHRcdGNvbnN0IGxhc3QgPSB0aGlzLmRpZmZbdGhpcy5kaWZmLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRpZiAobGFzdCkge1xuXHRcdFx0XHRcdGlmIChsYXN0Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5VcGRhdGUgJiYgbGFzdC5pdGVtLmV4dElkID09PSBkaWZmLml0ZW0uZXh0SWQpIHtcblx0XHRcdFx0XHRcdGFwcGx5VGVzdEl0ZW1VcGRhdGUobGFzdC5pdGVtLCBkaWZmLml0ZW0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChsYXN0Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5BZGQgJiYgbGFzdC5pdGVtLml0ZW0uZXh0SWQgPT09IGRpZmYuaXRlbS5leHRJZCkge1xuXHRcdFx0XHRcdFx0YXBwbHlUZXN0SXRlbVVwZGF0ZShsYXN0Lml0ZW0sIGRpZmYuaXRlbSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZGlmZi5wdXNoKGRpZmYpO1xuXG5cdFx0aWYgKCF0aGlzLmRlYm91bmNlU2VuZERpZmYuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0dGhpcy5kZWJvdW5jZVNlbmREaWZmLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZHMgdGhlIHRlc3QgYW5kIHRoZSBnaXZlbiBudW1iZXIgb2YgYGxldmVsc2Agb2YgY2hpbGRyZW4uIElmIGxldmVsc1xuXHQgKiBpcyA8IDAsIHRoZW4gYWxsIGNoaWxkcmVuIHdpbGwgYmUgZXhwYW5kZWQuIElmIGl0J3MgMCwgdGhlbiBvbmx5IHRoaXNcblx0ICogaXRlbSB3aWxsIGJlIGV4cGFuZGVkLlxuXHQgKi9cblx0cHVibGljIGV4cGFuZCh0ZXN0SWQ6IHN0cmluZywgbGV2ZWxzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0Y29uc3QgaW50ZXJuYWwgPSB0aGlzLnRyZWUuZ2V0KHRlc3RJZCk7XG5cdFx0aWYgKCFpbnRlcm5hbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbnRlcm5hbC5leHBhbmRMZXZlbHMgPT09IHVuZGVmaW5lZCB8fCBsZXZlbHMgPiBpbnRlcm5hbC5leHBhbmRMZXZlbHMpIHtcblx0XHRcdGludGVybmFsLmV4cGFuZExldmVscyA9IGxldmVscztcblx0XHR9XG5cblx0XHQvLyB0cnkgdG8gYXZvaWQgYXdhaXRpbmcgdGhpbmdzIGlmIHRoZSBwcm92aWRlciByZXR1cm5zIHN5bmNocm9ub3VzbHkgaW5cblx0XHQvLyBvcmRlciB0byBrZWVwIGV2ZXJ5dGhpbmcgaW4gYSBzaW5nbGUgZGlmZiBhbmQgRE9NIHVwZGF0ZS5cblx0XHRpZiAoaW50ZXJuYWwuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUpIHtcblx0XHRcdGNvbnN0IHIgPSB0aGlzLnJlc29sdmVDaGlsZHJlbihpbnRlcm5hbCk7XG5cdFx0XHRyZXR1cm4gIXIuaXNPcGVuKClcblx0XHRcdFx0PyByLndhaXQoKS50aGVuKCgpID0+IHRoaXMuZXhwYW5kQ2hpbGRyZW4oaW50ZXJuYWwsIGxldmVscyAtIDEpKVxuXHRcdFx0XHQ6IHRoaXMuZXhwYW5kQ2hpbGRyZW4oaW50ZXJuYWwsIGxldmVscyAtIDEpO1xuXHRcdH0gZWxzZSBpZiAoaW50ZXJuYWwuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGVkKSB7XG5cdFx0XHRyZXR1cm4gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXI/LmlzT3BlbigpID09PSBmYWxzZVxuXHRcdFx0XHQ/IGludGVybmFsLnJlc29sdmVCYXJyaWVyLndhaXQoKS50aGVuKCgpID0+IHRoaXMuZXhwYW5kQ2hpbGRyZW4oaW50ZXJuYWwsIGxldmVscyAtIDEpKVxuXHRcdFx0XHQ6IHRoaXMuZXhwYW5kQ2hpbGRyZW4oaW50ZXJuYWwsIGxldmVscyAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnRyZWUudmFsdWVzKCkpIHtcblx0XHRcdHRoaXMub3B0aW9ucy5nZXRBcGlGb3IoaXRlbS5hY3R1YWwpLmxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMudHJlZS5jbGVhcigpO1xuXHRcdHRoaXMuZGlmZiA9IFtdO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgb25UZXN0SXRlbUV2ZW50KGludGVybmFsOiBDb2xsZWN0aW9uSXRlbTxUPiwgZXZ0OiBFeHRIb3N0VGVzdEl0ZW1FdmVudCkge1xuXHRcdHN3aXRjaCAoZXZ0Lm9wKSB7XG5cdFx0XHRjYXNlIFRlc3RJdGVtRXZlbnRPcC5SZW1vdmVDaGlsZDpcblx0XHRcdFx0dGhpcy5yZW1vdmVJdGVtKFRlc3RJZC5qb2luVG9TdHJpbmcoaW50ZXJuYWwuZnVsbElkLCBldnQuaWQpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgVGVzdEl0ZW1FdmVudE9wLlVwc2VydDpcblx0XHRcdFx0dGhpcy51cHNlcnRJdGVtKGV2dC5pdGVtIGFzIFQsIGludGVybmFsKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgVGVzdEl0ZW1FdmVudE9wLkJ1bGs6XG5cdFx0XHRcdGZvciAoY29uc3Qgb3Agb2YgZXZ0Lm9wcykge1xuXHRcdFx0XHRcdHRoaXMub25UZXN0SXRlbUV2ZW50KGludGVybmFsLCBvcCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgVGVzdEl0ZW1FdmVudE9wLlNldFRhZ3M6XG5cdFx0XHRcdHRoaXMuZGlmZlRhZ1JlZnMoZXZ0Lm5ldywgZXZ0Lm9sZCwgaW50ZXJuYWwuZnVsbElkLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBUZXN0SXRlbUV2ZW50T3AuVXBkYXRlQ2FuUmVzb2x2ZUNoaWxkcmVuOlxuXHRcdFx0XHR0aGlzLnVwZGF0ZUV4cGFuZGFiaWxpdHkoaW50ZXJuYWwpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBUZXN0SXRlbUV2ZW50T3AuU2V0UHJvcDpcblx0XHRcdFx0dGhpcy5wdXNoRGlmZih7XG5cdFx0XHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRleHRJZDogaW50ZXJuYWwuZnVsbElkLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRpdGVtOiBldnQudXBkYXRlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIFRlc3RJdGVtRXZlbnRPcC5Eb2N1bWVudFN5bmNlZDpcblx0XHRcdFx0dGhpcy5kb2N1bWVudFN5bmNlZChpbnRlcm5hbC5hY3R1YWwudXJpKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFzc2VydE5ldmVyKGV2dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb2N1bWVudFN5bmNlZCh1cmk6IFVSSSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh1cmkpIHtcblx0XHRcdHRoaXMucHVzaERpZmYoe1xuXHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0ZG9jdjogdGhpcy5vcHRpb25zLmdldERvY3VtZW50VmVyc2lvbih1cmkpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwc2VydEl0ZW0oYWN0dWFsOiBULCBwYXJlbnQ6IENvbGxlY3Rpb25JdGVtPFQ+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZnVsbElkID0gVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0oYWN0dWFsLCB0aGlzLnJvb3QuaWQsIHBhcmVudD8uYWN0dWFsKTtcblxuXHRcdC8vIElmIHRoaXMgdGVzdCBpdGVtIGV4aXN0cyBlbHNld2hlcmUgaW4gdGhlIHRyZWUgYWxyZWFkeSAoZXhpc3RzIGF0IGFuXG5cdFx0Ly8gb2xkIElEIHdpdGggYW4gZXhpc3RpbmcgcGFyZW50KSwgcmVtb3ZlIHRoYXQgb2xkIGl0ZW0uXG5cdFx0Y29uc3QgcHJpdmF0ZUFwaSA9IHRoaXMub3B0aW9ucy5nZXRBcGlGb3IoYWN0dWFsKTtcblx0XHRpZiAocHJpdmF0ZUFwaS5wYXJlbnQgJiYgcHJpdmF0ZUFwaS5wYXJlbnQgIT09IHBhcmVudD8uYWN0dWFsKSB7XG5cdFx0XHR0aGlzLm9wdGlvbnMuZ2V0Q2hpbGRyZW4ocHJpdmF0ZUFwaS5wYXJlbnQpLmRlbGV0ZShhY3R1YWwuaWQpO1xuXHRcdH1cblxuXHRcdGxldCBpbnRlcm5hbCA9IHRoaXMudHJlZS5nZXQoZnVsbElkLnRvU3RyaW5nKCkpO1xuXHRcdC8vIENhc2UgMTogYSBicmFuZCBuZXcgaXRlbVxuXHRcdGlmICghaW50ZXJuYWwpIHtcblx0XHRcdGludGVybmFsID0ge1xuXHRcdFx0XHRmdWxsSWQsXG5cdFx0XHRcdGFjdHVhbCxcblx0XHRcdFx0ZXhwYW5kTGV2ZWxzOiBwYXJlbnQ/LmV4cGFuZExldmVscyAvKiBpbnRlbnRpb25hbGx5IHVuZGVmaW5lZCBvciAwICovID8gcGFyZW50LmV4cGFuZExldmVscyAtIDEgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLCAvLyB1cGRhdGVkIGJ5IGBjb25uZWN0SXRlbUFuZENoaWxkcmVuYFxuXHRcdFx0fTtcblxuXHRcdFx0YWN0dWFsLnRhZ3MuZm9yRWFjaCh0aGlzLmluY3JlbWVudFRhZ1JlZnMsIHRoaXMpO1xuXHRcdFx0dGhpcy50cmVlLnNldChpbnRlcm5hbC5mdWxsSWQudG9TdHJpbmcoKSwgaW50ZXJuYWwpO1xuXHRcdFx0dGhpcy5zZXRJdGVtUGFyZW50KGFjdHVhbCwgcGFyZW50KTtcblx0XHRcdHRoaXMucHVzaERpZmYoe1xuXHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkLFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0Y29udHJvbGxlcklkOiB0aGlzLm9wdGlvbnMuY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdGV4cGFuZDogaW50ZXJuYWwuZXhwYW5kLFxuXHRcdFx0XHRcdGl0ZW06IHRoaXMub3B0aW9ucy50b0lUZXN0SXRlbShhY3R1YWwpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuY29ubmVjdEl0ZW1BbmRDaGlsZHJlbihhY3R1YWwsIGludGVybmFsLCBwYXJlbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhc2UgMjogcmUtaW5zZXJ0aW9uIG9mIGFuIGV4aXN0aW5nIGl0ZW0sIG5vLW9wXG5cdFx0aWYgKGludGVybmFsLmFjdHVhbCA9PT0gYWN0dWFsKSB7XG5cdFx0XHR0aGlzLmNvbm5lY3RJdGVtKGFjdHVhbCwgaW50ZXJuYWwsIHBhcmVudCk7IC8vIHJlLWNvbm5lY3QgaW4gY2FzZSB0aGUgcGFyZW50IGNoYW5nZWRcblx0XHRcdHJldHVybjsgLy8gbm8tb3Bcblx0XHR9XG5cblx0XHQvLyBDYXNlIDM6IHVwc2VydCBvZiBhbiBleGlzdGluZyBpdGVtIGJ5IElELCB3aXRoIGEgbmV3IGluc3RhbmNlXG5cdFx0aWYgKGludGVybmFsLmFjdHVhbC51cmk/LnRvU3RyaW5nKCkgIT09IGFjdHVhbC51cmk/LnRvU3RyaW5nKCkpIHtcblx0XHRcdC8vIElmIHRoZSBpdGVtIGhhcyBhIG5ldyBVUkksIHJlLWluc2VydCBpdDsgd2UgZG9uJ3Qgc3VwcG9ydCB1cGRhdGluZ1xuXHRcdFx0Ly8gVVJJcyBvbiBleGlzdGluZyB0ZXN0IGl0ZW1zLlxuXHRcdFx0dGhpcy5yZW1vdmVJdGVtKGZ1bGxJZC50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiB0aGlzLnVwc2VydEl0ZW0oYWN0dWFsLCBwYXJlbnQpO1xuXHRcdH1cblx0XHRjb25zdCBvbGRDaGlsZHJlbiA9IHRoaXMub3B0aW9ucy5nZXRDaGlsZHJlbihpbnRlcm5hbC5hY3R1YWwpO1xuXHRcdGNvbnN0IG9sZEFjdHVhbCA9IGludGVybmFsLmFjdHVhbDtcblx0XHRjb25zdCB1cGRhdGUgPSBkaWZmVGVzdEl0ZW1zKHRoaXMub3B0aW9ucy50b0lUZXN0SXRlbShvbGRBY3R1YWwpLCB0aGlzLm9wdGlvbnMudG9JVGVzdEl0ZW0oYWN0dWFsKSk7XG5cdFx0dGhpcy5vcHRpb25zLmdldEFwaUZvcihvbGRBY3R1YWwpLmxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXG5cdFx0aW50ZXJuYWwuYWN0dWFsID0gYWN0dWFsO1xuXHRcdGludGVybmFsLnJlc29sdmVCYXJyaWVyID0gdW5kZWZpbmVkO1xuXHRcdGludGVybmFsLmV4cGFuZCA9IFRlc3RJdGVtRXhwYW5kU3RhdGUuTm90RXhwYW5kYWJsZTsgLy8gdXBkYXRlZCBieSBgY29ubmVjdEl0ZW1BbmRDaGlsZHJlbmBcblxuXHRcdGlmICh1cGRhdGUpIHtcblx0XHRcdC8vIHRhZ3MgYXJlIGhhbmRsZWQgaW4gYSBzcGVjaWFsIHdheVxuXHRcdFx0aWYgKHVwZGF0ZS5oYXNPd25Qcm9wZXJ0eSgndGFncycpKSB7XG5cdFx0XHRcdHRoaXMuZGlmZlRhZ1JlZnMoYWN0dWFsLnRhZ3MsIG9sZEFjdHVhbC50YWdzLCBmdWxsSWQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGRlbGV0ZSB1cGRhdGUudGFncztcblx0XHRcdH1cblx0XHRcdHRoaXMub25UZXN0SXRlbUV2ZW50KGludGVybmFsLCB7IG9wOiBUZXN0SXRlbUV2ZW50T3AuU2V0UHJvcCwgdXBkYXRlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuY29ubmVjdEl0ZW1BbmRDaGlsZHJlbihhY3R1YWwsIGludGVybmFsLCBwYXJlbnQpO1xuXG5cdFx0Ly8gUmVtb3ZlIGFueSBvcnBoYW5lZCBjaGlsZHJlbi5cblx0XHRmb3IgKGNvbnN0IFtfLCBjaGlsZF0gb2Ygb2xkQ2hpbGRyZW4pIHtcblx0XHRcdGlmICghdGhpcy5vcHRpb25zLmdldENoaWxkcmVuKGFjdHVhbCkuZ2V0KGNoaWxkLmlkKSkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW0oVGVzdElkLmpvaW5Ub1N0cmluZyhmdWxsSWQsIGNoaWxkLmlkKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmUtZXhwYW5kIHRoZSBlbGVtZW50IGlmIGl0IHdhcyBwcmV2aW91cyBleHBhbmRlZCAoIzIwNzU3NClcblx0XHRjb25zdCBleHBhbmRMZXZlbHMgPSBpbnRlcm5hbC5leHBhbmRMZXZlbHM7XG5cdFx0aWYgKGV4cGFuZExldmVscyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBXYWl0IHVudGlsIGEgbWljcm90YXNrIHRvIGFsbG93IHRoZSBleHRlbnNpb24gdG8gZmluaXNoIHNldHRpbmcgdXBcblx0XHRcdC8vIHByb3BlcnRpZXMgb2YgdGhlIGVsZW1lbnQgYW5kIGNoaWxkcmVuIGJlZm9yZSB3ZSBhc2sgaXQgdG8gZXhwYW5kLlxuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRpZiAoaW50ZXJuYWwuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGUpIHtcblx0XHRcdFx0XHRpbnRlcm5hbC5leHBhbmRMZXZlbHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5leHBhbmQoZnVsbElkLnRvU3RyaW5nKCksIGV4cGFuZExldmVscyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgcmFuZ2VzIGluIHRoZSBkb2N1bWVudCBhcyBzeW5jZWQgKCMxNjEzMjApXG5cdFx0dGhpcy5kb2N1bWVudFN5bmNlZChpbnRlcm5hbC5hY3R1YWwudXJpKTtcblx0fVxuXG5cdHByaXZhdGUgZGlmZlRhZ1JlZnMobmV3VGFnczogcmVhZG9ubHkgSVRlc3RUYWdbXSwgb2xkVGFnczogcmVhZG9ubHkgSVRlc3RUYWdbXSwgZXh0SWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IHRvRGVsZXRlID0gbmV3IFNldChvbGRUYWdzLm1hcCh0ID0+IHQuaWQpKTtcblx0XHRmb3IgKGNvbnN0IHRhZyBvZiBuZXdUYWdzKSB7XG5cdFx0XHRpZiAoIXRvRGVsZXRlLmRlbGV0ZSh0YWcuaWQpKSB7XG5cdFx0XHRcdHRoaXMuaW5jcmVtZW50VGFnUmVmcyh0YWcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucHVzaERpZmYoe1xuXHRcdFx0b3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSxcblx0XHRcdGl0ZW06IHsgZXh0SWQsIGl0ZW06IHsgdGFnczogbmV3VGFncy5tYXAodiA9PiBuYW1lc3BhY2VUZXN0VGFnKHRoaXMub3B0aW9ucy5jb250cm9sbGVySWQsIHYuaWQpKSB9IH1cblx0XHR9KTtcblxuXHRcdHRvRGVsZXRlLmZvckVhY2godGhpcy5kZWNyZW1lbnRUYWdSZWZzLCB0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgaW5jcmVtZW50VGFnUmVmcyh0YWc6IElUZXN0VGFnKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnRhZ3MuZ2V0KHRhZy5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5yZWZDb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRhZ3Muc2V0KHRhZy5pZCwgeyByZWZDb3VudDogMSB9KTtcblx0XHRcdHRoaXMucHVzaERpZmYoe1xuXHRcdFx0XHRvcDogVGVzdERpZmZPcFR5cGUuQWRkVGFnLCB0YWc6IHtcblx0XHRcdFx0XHRpZDogbmFtZXNwYWNlVGVzdFRhZyh0aGlzLm9wdGlvbnMuY29udHJvbGxlcklkLCB0YWcuaWQpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlY3JlbWVudFRhZ1JlZnModGFnSWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy50YWdzLmdldCh0YWdJZCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICEtLWV4aXN0aW5nLnJlZkNvdW50KSB7XG5cdFx0XHR0aGlzLnRhZ3MuZGVsZXRlKHRhZ0lkKTtcblx0XHRcdHRoaXMucHVzaERpZmYoeyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlVGFnLCBpZDogbmFtZXNwYWNlVGVzdFRhZyh0aGlzLm9wdGlvbnMuY29udHJvbGxlcklkLCB0YWdJZCkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRJdGVtUGFyZW50KGFjdHVhbDogVCwgcGFyZW50OiBDb2xsZWN0aW9uSXRlbTxUPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMub3B0aW9ucy5nZXRBcGlGb3IoYWN0dWFsKS5wYXJlbnQgPSBwYXJlbnQgJiYgcGFyZW50LmFjdHVhbCAhPT0gdGhpcy5yb290ID8gcGFyZW50LmFjdHVhbCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgY29ubmVjdEl0ZW0oYWN0dWFsOiBULCBpbnRlcm5hbDogQ29sbGVjdGlvbkl0ZW08VD4sIHBhcmVudDogQ29sbGVjdGlvbkl0ZW08VD4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnNldEl0ZW1QYXJlbnQoYWN0dWFsLCBwYXJlbnQpO1xuXHRcdGNvbnN0IGFwaSA9IHRoaXMub3B0aW9ucy5nZXRBcGlGb3IoYWN0dWFsKTtcblx0XHRhcGkucGFyZW50ID0gcGFyZW50Py5hY3R1YWw7XG5cdFx0YXBpLmxpc3RlbmVyID0gZXZ0ID0+IHRoaXMub25UZXN0SXRlbUV2ZW50KGludGVybmFsLCBldnQpO1xuXHRcdHRoaXMudXBkYXRlRXhwYW5kYWJpbGl0eShpbnRlcm5hbCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbm5lY3RJdGVtQW5kQ2hpbGRyZW4oYWN0dWFsOiBULCBpbnRlcm5hbDogQ29sbGVjdGlvbkl0ZW08VD4sIHBhcmVudDogQ29sbGVjdGlvbkl0ZW08VD4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmNvbm5lY3RJdGVtKGFjdHVhbCwgaW50ZXJuYWwsIHBhcmVudCk7XG5cblx0XHQvLyBEaXNjb3ZlciBhbnkgZXhpc3RpbmcgY2hpbGRyZW4gdGhhdCBtaWdodCBoYXZlIGFscmVhZHkgYmVlbiBhZGRlZFxuXHRcdGZvciAoY29uc3QgW18sIGNoaWxkXSBvZiB0aGlzLm9wdGlvbnMuZ2V0Q2hpbGRyZW4oYWN0dWFsKSkge1xuXHRcdFx0dGhpcy51cHNlcnRJdGVtKGNoaWxkLCBpbnRlcm5hbCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGBleHBhbmRgIHN0YXRlIG9mIHRoZSBpdGVtLiBTaG91bGQgYmUgY2FsbGVkIHdoZW5ldmVyIHRoZVxuXHQgKiByZXNvbHZlZCBzdGF0ZSBvZiB0aGUgaXRlbSBjaGFuZ2VzLiBDYW4gYXV0b21hdGljYWxseSBleHBhbmQgdGhlIGl0ZW1cblx0ICogaWYgcmVxdWVzdGVkIGJ5IGEgY29uc3VtZXIuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUV4cGFuZGFiaWxpdHkoaW50ZXJuYWw6IENvbGxlY3Rpb25JdGVtPFQ+KSB7XG5cdFx0bGV0IG5ld1N0YXRlOiBUZXN0SXRlbUV4cGFuZFN0YXRlO1xuXHRcdGlmICghdGhpcy5fcmVzb2x2ZUhhbmRsZXIpIHtcblx0XHRcdG5ld1N0YXRlID0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlO1xuXHRcdH0gZWxzZSBpZiAoaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXIpIHtcblx0XHRcdG5ld1N0YXRlID0gaW50ZXJuYWwucmVzb2x2ZUJhcnJpZXIuaXNPcGVuKClcblx0XHRcdFx0PyBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGVkXG5cdFx0XHRcdDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5CdXN5RXhwYW5kaW5nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdTdGF0ZSA9IGludGVybmFsLmFjdHVhbC5jYW5SZXNvbHZlQ2hpbGRyZW5cblx0XHRcdFx0PyBUZXN0SXRlbUV4cGFuZFN0YXRlLkV4cGFuZGFibGVcblx0XHRcdFx0OiBUZXN0SXRlbUV4cGFuZFN0YXRlLk5vdEV4cGFuZGFibGU7XG5cdFx0fVxuXG5cdFx0aWYgKG5ld1N0YXRlID09PSBpbnRlcm5hbC5leHBhbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpbnRlcm5hbC5leHBhbmQgPSBuZXdTdGF0ZTtcblx0XHR0aGlzLnB1c2hEaWZmKHsgb3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZSwgaXRlbTogeyBleHRJZDogaW50ZXJuYWwuZnVsbElkLnRvU3RyaW5nKCksIGV4cGFuZDogbmV3U3RhdGUgfSB9KTtcblxuXHRcdGlmIChuZXdTdGF0ZSA9PT0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5FeHBhbmRhYmxlICYmIGludGVybmFsLmV4cGFuZExldmVscyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnJlc29sdmVDaGlsZHJlbihpbnRlcm5hbCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZHMgYWxsIGNoaWxkcmVuIG9mIHRoZSBpdGVtLCBcImxldmVsc1wiIGRlZXAuIElmIGxldmVscyBpcyAwLCBvbmx5XG5cdCAqIHRoZSBjaGlsZHJlbiB3aWxsIGJlIGV4cGFuZGVkLiBJZiBpdCdzIDEsIHRoZSBjaGlsZHJlbiBhbmQgdGhlaXIgY2hpbGRyZW5cblx0ICogd2lsbCBiZSBleHBhbmRlZC4gSWYgaXQncyA8MCwgaXQncyBhIG5vLW9wLlxuXHQgKi9cblx0cHJpdmF0ZSBleHBhbmRDaGlsZHJlbihpbnRlcm5hbDogQ29sbGVjdGlvbkl0ZW08VD4sIGxldmVsczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQge1xuXHRcdGlmIChsZXZlbHMgPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwYW5kUmVxdWVzdHM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW18sIGNoaWxkXSBvZiB0aGlzLm9wdGlvbnMuZ2V0Q2hpbGRyZW4oaW50ZXJuYWwuYWN0dWFsKSkge1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuZXhwYW5kKFRlc3RJZC5qb2luVG9TdHJpbmcoaW50ZXJuYWwuZnVsbElkLCBjaGlsZC5pZCksIGxldmVscyk7XG5cdFx0XHRpZiAoaXNUaGVuYWJsZShwcm9taXNlKSkge1xuXHRcdFx0XHRleHBhbmRSZXF1ZXN0cy5wdXNoKHByb21pc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHBhbmRSZXF1ZXN0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChleHBhbmRSZXF1ZXN0cykudGhlbigoKSA9PiB7IH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxscyBgZGlzY292ZXJDaGlsZHJlbmAgb24gdGhlIGl0ZW0sIHJlZnJlc2hpbmcgYWxsIGl0cyB0ZXN0cy5cblx0ICovXG5cdHByaXZhdGUgcmVzb2x2ZUNoaWxkcmVuKGludGVybmFsOiBDb2xsZWN0aW9uSXRlbTxUPikge1xuXHRcdGlmIChpbnRlcm5hbC5yZXNvbHZlQmFycmllcikge1xuXHRcdFx0cmV0dXJuIGludGVybmFsLnJlc29sdmVCYXJyaWVyO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fcmVzb2x2ZUhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IGIgPSBuZXcgQmFycmllcigpO1xuXHRcdFx0Yi5vcGVuKCk7XG5cdFx0XHRyZXR1cm4gYjtcblx0XHR9XG5cblx0XHRpbnRlcm5hbC5leHBhbmQgPSBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmc7XG5cdFx0dGhpcy5wdXNoRXhwYW5kU3RhdGVVcGRhdGUoaW50ZXJuYWwpO1xuXG5cdFx0Y29uc3QgYmFycmllciA9IGludGVybmFsLnJlc29sdmVCYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0XHRjb25zdCBhcHBseUVycm9yID0gKGVycjogRXJyb3IpID0+IHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFVuaGFuZGxlZCBlcnJvciBpbiByZXNvbHZlSGFuZGxlciBvZiB0ZXN0IGNvbnRyb2xsZXIgXCIke3RoaXMub3B0aW9ucy5jb250cm9sbGVySWR9XCJgLCBlcnIpO1xuXHRcdH07XG5cblx0XHRsZXQgcjogVGhlbmFibGU8dm9pZD4gfCB1bmRlZmluZWQgfCB2b2lkO1xuXHRcdHRyeSB7XG5cdFx0XHRyID0gdGhpcy5fcmVzb2x2ZUhhbmRsZXIoaW50ZXJuYWwuYWN0dWFsID09PSB0aGlzLnJvb3QgPyB1bmRlZmluZWQgOiBpbnRlcm5hbC5hY3R1YWwpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXBwbHlFcnJvcihlcnIpO1xuXHRcdH1cblxuXHRcdGlmIChpc1RoZW5hYmxlKHIpKSB7XG5cdFx0XHRyLmNhdGNoKGFwcGx5RXJyb3IpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRiYXJyaWVyLm9wZW4oKTtcblx0XHRcdFx0dGhpcy51cGRhdGVFeHBhbmRhYmlsaXR5KGludGVybmFsKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRiYXJyaWVyLm9wZW4oKTtcblx0XHRcdHRoaXMudXBkYXRlRXhwYW5kYWJpbGl0eShpbnRlcm5hbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGludGVybmFsLnJlc29sdmVCYXJyaWVyO1xuXHR9XG5cblx0cHJpdmF0ZSBwdXNoRXhwYW5kU3RhdGVVcGRhdGUoaW50ZXJuYWw6IENvbGxlY3Rpb25JdGVtPFQ+KSB7XG5cdFx0dGhpcy5wdXNoRGlmZih7IG9wOiBUZXN0RGlmZk9wVHlwZS5VcGRhdGUsIGl0ZW06IHsgZXh0SWQ6IGludGVybmFsLmZ1bGxJZC50b1N0cmluZygpLCBleHBhbmQ6IGludGVybmFsLmV4cGFuZCB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVJdGVtKGNoaWxkSWQ6IHN0cmluZykge1xuXHRcdGNvbnN0IGNoaWxkSXRlbSA9IHRoaXMudHJlZS5nZXQoY2hpbGRJZCk7XG5cdFx0aWYgKCFjaGlsZEl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYXR0ZW1wdGluZyB0byByZW1vdmUgbm9uLWV4aXN0ZW50IGNoaWxkJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wdXNoRGlmZih7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmUsIGl0ZW1JZDogY2hpbGRJZCB9KTtcblxuXHRcdGNvbnN0IHF1ZXVlOiAoQ29sbGVjdGlvbkl0ZW08VD4gfCB1bmRlZmluZWQpW10gPSBbY2hpbGRJdGVtXTtcblx0XHR3aGlsZSAocXVldWUubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gcXVldWUucG9wKCk7XG5cdFx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub3B0aW9ucy5nZXRBcGlGb3IoaXRlbS5hY3R1YWwpLmxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHRhZyBvZiBpdGVtLmFjdHVhbC50YWdzKSB7XG5cdFx0XHRcdHRoaXMuZGVjcmVtZW50VGFnUmVmcyh0YWcuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyZWUuZGVsZXRlKGl0ZW0uZnVsbElkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Zm9yIChjb25zdCBbXywgY2hpbGRdIG9mIHRoaXMub3B0aW9ucy5nZXRDaGlsZHJlbihpdGVtLmFjdHVhbCkpIHtcblx0XHRcdFx0cXVldWUucHVzaCh0aGlzLnRyZWUuZ2V0KFRlc3RJZC5qb2luVG9TdHJpbmcoaXRlbS5mdWxsSWQsIGNoaWxkLmlkKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbW1lZGlhdGVseSBlbWl0cyBhbnkgcGVuZGluZyBkaWZmcyBvbiB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBmbHVzaERpZmYoKSB7XG5cdFx0Y29uc3QgZGlmZiA9IHRoaXMuY29sbGVjdERpZmYoKTtcblx0XHRpZiAoZGlmZi5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZGlmZk9wRW1pdHRlci5maXJlKGRpZmYpO1xuXHRcdH1cblx0fVxufVxuXG4vKiogSW1wbGVtZW50YXRpb24gb2YgdnNjb2RlLlRlc3RJdGVtQ29sbGVjdGlvbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1DaGlsZHJlbjxUIGV4dGVuZHMgSVRlc3RJdGVtTGlrZT4gZXh0ZW5kcyBJdGVyYWJsZTxbc3RyaW5nLCBUXT4ge1xuXHRyZWFkb25seSBzaXplOiBudW1iZXI7XG5cdHJlcGxhY2UoaXRlbXM6IHJlYWRvbmx5IFRbXSk6IHZvaWQ7XG5cdGZvckVhY2goY2FsbGJhY2s6IChpdGVtOiBULCBjb2xsZWN0aW9uOiB0aGlzKSA9PiB1bmtub3duLCB0aGlzQXJnPzogdW5rbm93bik6IHZvaWQ7XG5cdGFkZChpdGVtOiBUKTogdm9pZDtcblx0ZGVsZXRlKGl0ZW1JZDogc3RyaW5nKTogdm9pZDtcblx0Z2V0KGl0ZW1JZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZDtcblxuXHR0b0pTT04oKTogcmVhZG9ubHkgVFtdO1xufVxuXG5leHBvcnQgY2xhc3MgRHVwbGljYXRlVGVzdEl0ZW1FcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZykge1xuXHRcdHN1cGVyKGBBdHRlbXB0ZWQgdG8gaW5zZXJ0IGEgZHVwbGljYXRlIHRlc3QgaXRlbSBJRCAke2lkfWApO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnZhbGlkVGVzdEl0ZW1FcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZykge1xuXHRcdHN1cGVyKGBUZXN0SXRlbSB3aXRoIElEIFwiJHtpZH1cIiBpcyBpbnZhbGlkLiBNYWtlIHN1cmUgdG8gY3JlYXRlIGl0IGZyb20gdGhlIGNyZWF0ZVRlc3RJdGVtIG1ldGhvZC5gKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWl4ZWRUZXN0SXRlbUNvbnRyb2xsZXIgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGN0cmxBOiBzdHJpbmcsIGN0cmxCOiBzdHJpbmcpIHtcblx0XHRzdXBlcihgVGVzdEl0ZW0gd2l0aCBJRCBcIiR7aWR9XCIgaXMgZnJvbSBjb250cm9sbGVyIFwiJHtjdHJsQX1cIiBhbmQgY2Fubm90IGJlIGFkZGVkIGFzIGEgY2hpbGQgb2YgYW4gaXRlbSBmcm9tIGNvbnRyb2xsZXIgXCIke2N0cmxCfVwiLmApO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBjcmVhdGVUZXN0SXRlbUNoaWxkcmVuID0gPFQgZXh0ZW5kcyBJVGVzdEl0ZW1MaWtlPihhcGk6IElUZXN0SXRlbUFwaTxUPiwgZ2V0QXBpOiAoaXRlbTogVCkgPT4gSVRlc3RJdGVtQXBpPFQ+LCBjaGVja0N0b3I6IEZ1bmN0aW9uKTogSVRlc3RJdGVtQ2hpbGRyZW48VD4gPT4ge1xuXHRsZXQgbWFwcGVkID0gbmV3IE1hcDxzdHJpbmcsIFQ+KCk7XG5cblx0cmV0dXJuIHtcblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRnZXQgc2l6ZSgpIHtcblx0XHRcdHJldHVybiBtYXBwZWQuc2l6ZTtcblx0XHR9LFxuXG5cdFx0LyoqIEBpbmhlcml0ZG9jICovXG5cdFx0Zm9yRWFjaChjYWxsYmFjazogKGl0ZW06IFQsIGNvbGxlY3Rpb246IElUZXN0SXRlbUNoaWxkcmVuPFQ+KSA9PiB1bmtub3duLCB0aGlzQXJnPzogdW5rbm93bikge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1hcHBlZC52YWx1ZXMoKSkge1xuXHRcdFx0XHRjYWxsYmFjay5jYWxsKHRoaXNBcmcsIGl0ZW0sIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFtzdHJpbmcsIFRdPiB7XG5cdFx0XHRyZXR1cm4gbWFwcGVkLmVudHJpZXMoKTtcblx0XHR9LFxuXG5cdFx0LyoqIEBpbmhlcml0ZG9jICovXG5cdFx0cmVwbGFjZShpdGVtczogSXRlcmFibGU8VD4pIHtcblx0XHRcdGNvbnN0IG5ld01hcHBlZCA9IG5ldyBNYXA8c3RyaW5nLCBUPigpO1xuXHRcdFx0Y29uc3QgdG9EZWxldGUgPSBuZXcgU2V0KG1hcHBlZC5rZXlzKCkpO1xuXHRcdFx0Y29uc3QgYnVsazogSVRlc3RJdGVtQnVsa1JlcGxhY2UgPSB7IG9wOiBUZXN0SXRlbUV2ZW50T3AuQnVsaywgb3BzOiBbXSB9O1xuXG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0aWYgKCEoaXRlbSBpbnN0YW5jZW9mIGNoZWNrQ3RvcikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgSW52YWxpZFRlc3RJdGVtRXJyb3IoKGl0ZW0gYXMgSVRlc3RJdGVtTGlrZSkuaWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXRlbUNvbnRyb2xsZXIgPSBnZXRBcGkoaXRlbSkuY29udHJvbGxlcklkO1xuXHRcdFx0XHRpZiAoaXRlbUNvbnRyb2xsZXIgIT09IGFwaS5jb250cm9sbGVySWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgTWl4ZWRUZXN0SXRlbUNvbnRyb2xsZXIoaXRlbS5pZCwgaXRlbUNvbnRyb2xsZXIsIGFwaS5jb250cm9sbGVySWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5ld01hcHBlZC5oYXMoaXRlbS5pZCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRHVwbGljYXRlVGVzdEl0ZW1FcnJvcihpdGVtLmlkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG5ld01hcHBlZC5zZXQoaXRlbS5pZCwgaXRlbSk7XG5cdFx0XHRcdHRvRGVsZXRlLmRlbGV0ZShpdGVtLmlkKTtcblx0XHRcdFx0YnVsay5vcHMucHVzaCh7IG9wOiBUZXN0SXRlbUV2ZW50T3AuVXBzZXJ0LCBpdGVtIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRvRGVsZXRlLmtleXMoKSkge1xuXHRcdFx0XHRidWxrLm9wcy5wdXNoKHsgb3A6IFRlc3RJdGVtRXZlbnRPcC5SZW1vdmVDaGlsZCwgaWQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGFwaS5saXN0ZW5lcj8uKGJ1bGspO1xuXG5cdFx0XHQvLyBpbXBvcnRhbnQgbXV0YXRpb25zIGNvbWUgYWZ0ZXIgZmlyaW5nLCBzbyBpZiBhbiBlcnJvciBoYXBwZW5zIG5vXG5cdFx0XHQvLyBjaGFuZ2VzIHdpbGwgYmUgXCJzYXZlZFwiOlxuXHRcdFx0bWFwcGVkID0gbmV3TWFwcGVkO1xuXHRcdH0sXG5cblxuXHRcdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRcdGFkZChpdGVtOiBUKSB7XG5cdFx0XHRpZiAoIShpdGVtIGluc3RhbmNlb2YgY2hlY2tDdG9yKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgSW52YWxpZFRlc3RJdGVtRXJyb3IoKGl0ZW0gYXMgSVRlc3RJdGVtTGlrZSkuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXBwZWQuc2V0KGl0ZW0uaWQsIGl0ZW0pO1xuXHRcdFx0YXBpLmxpc3RlbmVyPy4oeyBvcDogVGVzdEl0ZW1FdmVudE9wLlVwc2VydCwgaXRlbSB9KTtcblx0XHR9LFxuXG5cdFx0LyoqIEBpbmhlcml0ZG9jICovXG5cdFx0ZGVsZXRlKGlkOiBzdHJpbmcpIHtcblx0XHRcdGlmIChtYXBwZWQuZGVsZXRlKGlkKSkge1xuXHRcdFx0XHRhcGkubGlzdGVuZXI/Lih7IG9wOiBUZXN0SXRlbUV2ZW50T3AuUmVtb3ZlQ2hpbGQsIGlkIH0pO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKiogQGluaGVyaXRkb2MgKi9cblx0XHRnZXQoaXRlbUlkOiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiBtYXBwZWQuZ2V0KGl0ZW1JZCk7XG5cdFx0fSxcblxuXHRcdC8qKiBKU09OIHNlcmlhbGl6YXRpb24gZnVuY3Rpb24uICovXG5cdFx0dG9KU09OKCkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20obWFwcGVkLnZhbHVlcygpKTtcblx0XHR9LFxuXHR9O1xufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxZQUFZLHdCQUF3QjtBQUN0RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxxQkFBMEMsa0JBQWtCLGdCQUFnQiwyQkFBbUQ7QUFDeEksU0FBUyxjQUFjO0FBaUJoQixJQUFXLGtCQUFYLGtCQUFXQSxxQkFBWDtBQUNOLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBUGlCLFNBQUFBO0FBQUEsR0FBQTtBQStFbEIsTUFBTSx3QkFBd0IsQ0FBSSxHQUFNLE1BQVMsTUFBTTtBQUN2RCxNQUFNLGdCQUE0RjtBQUFBLEVBQ2pHLE9BQU8sQ0FBQyxHQUFHLE1BQU07QUFDaEIsUUFBSSxNQUFNLEdBQUc7QUFBRSxhQUFPO0FBQUEsSUFBTTtBQUM1QixRQUFJLENBQUMsS0FBSyxDQUFDLEdBQUc7QUFBRSxhQUFPO0FBQUEsSUFBTztBQUM5QixXQUFPLEVBQUUsWUFBWSxDQUFDO0FBQUEs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
