import { URI } from "../../../../base/common/uri.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize } from "../../../../nls.js";
import { TestId } from "./testId.js";
var TestResultState = /* @__PURE__ */ ((TestResultState2) => {
  TestResultState2[TestResultState2["Unset"] = 0] = "Unset";
  TestResultState2[TestResultState2["Queued"] = 1] = "Queued";
  TestResultState2[TestResultState2["Running"] = 2] = "Running";
  TestResultState2[TestResultState2["Passed"] = 3] = "Passed";
  TestResultState2[TestResultState2["Failed"] = 4] = "Failed";
  TestResultState2[TestResultState2["Skipped"] = 5] = "Skipped";
  TestResultState2[TestResultState2["Errored"] = 6] = "Errored";
  return TestResultState2;
})(TestResultState || {});
const testResultStateToContextValues = {
  [0 /* Unset */]: "unset",
  [1 /* Queued */]: "queued",
  [2 /* Running */]: "running",
  [3 /* Passed */]: "passed",
  [4 /* Failed */]: "failed",
  [5 /* Skipped */]: "skipped",
  [6 /* Errored */]: "errored"
};
var ExtTestRunProfileKind = /* @__PURE__ */ ((ExtTestRunProfileKind2) => {
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Run"] = 1] = "Run";
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Debug"] = 2] = "Debug";
  ExtTestRunProfileKind2[ExtTestRunProfileKind2["Coverage"] = 3] = "Coverage";
  return ExtTestRunProfileKind2;
})(ExtTestRunProfileKind || {});
var TestControllerCapability = /* @__PURE__ */ ((TestControllerCapability2) => {
  TestControllerCapability2[TestControllerCapability2["Refresh"] = 2] = "Refresh";
  TestControllerCapability2[TestControllerCapability2["CodeRelatedToTest"] = 4] = "CodeRelatedToTest";
  TestControllerCapability2[TestControllerCapability2["TestRelatedToCode"] = 8] = "TestRelatedToCode";
  return TestControllerCapability2;
})(TestControllerCapability || {});
var TestRunProfileBitset = /* @__PURE__ */ ((TestRunProfileBitset2) => {
  TestRunProfileBitset2[TestRunProfileBitset2["Run"] = 2] = "Run";
  TestRunProfileBitset2[TestRunProfileBitset2["Debug"] = 4] = "Debug";
  TestRunProfileBitset2[TestRunProfileBitset2["Coverage"] = 8] = "Coverage";
  TestRunProfileBitset2[TestRunProfileBitset2["HasNonDefaultProfile"] = 16] = "HasNonDefaultProfile";
  TestRunProfileBitset2[TestRunProfileBitset2["HasConfigurable"] = 32] = "HasConfigurable";
  TestRunProfileBitset2[TestRunProfileBitset2["SupportsContinuousRun"] = 64] = "SupportsContinuousRun";
  return TestRunProfileBitset2;
})(TestRunProfileBitset || {});
const testProfileBitset = {
  [2 /* Run */]: localize("testing.runProfileBitset.run", "Run"),
  [4 /* Debug */]: localize("testing.runProfileBitset.debug", "Debug"),
  [8 /* Coverage */]: localize("testing.runProfileBitset.coverage", "Coverage")
};
const testRunProfileBitsetList = [
  2 /* Run */,
  4 /* Debug */,
  8 /* Coverage */,
  16 /* HasNonDefaultProfile */,
  32 /* HasConfigurable */,
  64 /* SupportsContinuousRun */
];
const isStartControllerTests = (t) => "runId" in t;
var IRichLocation;
((IRichLocation2) => {
  IRichLocation2.serialize = (location) => ({
    range: location.range.toJSON(),
    uri: location.uri.toJSON()
  });
  IRichLocation2.deserialize = (uriIdentity, location) => ({
    range: Range.lift(location.range),
    uri: uriIdentity.asCanonicalUri(URI.revive(location.uri))
  });
})(IRichLocation || (IRichLocation = {}));
var TestMessageType = /* @__PURE__ */ ((TestMessageType2) => {
  TestMessageType2[TestMessageType2["Error"] = 0] = "Error";
  TestMessageType2[TestMessageType2["Output"] = 1] = "Output";
  return TestMessageType2;
})(TestMessageType || {});
var ITestMessageStackFrame;
((ITestMessageStackFrame2) => {
  ITestMessageStackFrame2.serialize = (stack) => ({
    label: stack.label,
    uri: stack.uri?.toJSON(),
    position: stack.position?.toJSON()
  });
  ITestMessageStackFrame2.deserialize = (uriIdentity, stack) => ({
    label: stack.label,
    uri: stack.uri ? uriIdentity.asCanonicalUri(URI.revive(stack.uri)) : void 0,
    position: stack.position ? Position.lift(stack.position) : void 0
  });
})(ITestMessageStackFrame || (ITestMessageStackFrame = {}));
var ITestErrorMessage;
((ITestErrorMessage2) => {
  ITestErrorMessage2.serialize = (message) => ({
    message: message.message,
    type: 0 /* Error */,
    expected: message.expected,
    actual: message.actual,
    contextValue: message.contextValue,
    location: message.location && IRichLocation.serialize(message.location),
    stackTrace: message.stackTrace?.map(ITestMessageStackFrame.serialize)
  });
  ITestErrorMessage2.deserialize = (uriIdentity, message) => ({
    message: message.message,
    type: 0 /* Error */,
    expected: message.expected,
    actual: message.actual,
    contextValue: message.contextValue,
    location: message.location && IRichLocation.deserialize(uriIdentity, message.location),
    stackTrace: message.stackTrace && message.stackTrace.map((s) => ITestMessageStackFrame.deserialize(uriIdentity, s))
  });
})(ITestErrorMessage || (ITestErrorMessage = {}));
const getMarkId = (marker, start) => `${start ? "s" : "e"}${marker}`;
var ITestOutputMessage;
((ITestOutputMessage2) => {
  ITestOutputMessage2.serialize = (message) => ({
    message: message.message,
    type: 1 /* Output */,
    offset: message.offset,
    length: message.length,
    location: message.location && IRichLocation.serialize(message.location)
  });
  ITestOutputMessage2.deserialize = (uriIdentity, message) => ({
    message: message.message,
    type: 1 /* Output */,
    offset: message.offset,
    length: message.length,
    location: message.location && IRichLocation.deserialize(uriIdentity, message.location)
  });
})(ITestOutputMessage || (ITestOutputMessage = {}));
var ITestMessage;
((ITestMessage2) => {
  ITestMessage2.serialize = (message) => message.type === 0 /* Error */ ? ITestErrorMessage.serialize(message) : ITestOutputMessage.serialize(message);
  ITestMessage2.deserialize = (uriIdentity, message) => message.type === 0 /* Error */ ? ITestErrorMessage.deserialize(uriIdentity, message) : ITestOutputMessage.deserialize(uriIdentity, message);
  ITestMessage2.isDiffable = (message) => message.type === 0 /* Error */ && message.actual !== void 0 && message.expected !== void 0;
})(ITestMessage || (ITestMessage = {}));
var ITestTaskState;
((ITestTaskState2) => {
  ITestTaskState2.serializeWithoutMessages = (state) => ({
    state: state.state,
    duration: state.duration,
    messages: []
  });
  ITestTaskState2.serialize = (state) => ({
    state: state.state,
    duration: state.duration,
    messages: state.messages.map(ITestMessage.serialize)
  });
  ITestTaskState2.deserialize = (uriIdentity, state) => ({
    state: state.state,
    duration: state.duration,
    messages: state.messages.map((m) => ITestMessage.deserialize(uriIdentity, m))
  });
})(ITestTaskState || (ITestTaskState = {}));
const testTagDelimiter = "\0";
const namespaceTestTag = (ctrlId, tagId) => ctrlId + testTagDelimiter + tagId;
const denamespaceTestTag = (namespaced) => {
  const index = namespaced.indexOf(testTagDelimiter);
  return { ctrlId: namespaced.slice(0, index), tagId: namespaced.slice(index + 1) };
};
var ITestItem;
((ITestItem2) => {
  ITestItem2.serialize = (item) => ({
    extId: item.extId,
    label: item.label,
    tags: item.tags,
    busy: item.busy,
    children: void 0,
    uri: item.uri?.toJSON(),
    range: item.range?.toJSON() || null,
    description: item.description,
    error: item.error,
    sortText: item.sortText
  });
  ITestItem2.deserialize = (uriIdentity, serialized) => ({
    extId: serialized.extId,
    label: serialized.label,
    tags: serialized.tags,
    busy: serialized.busy,
    children: void 0,
    uri: serialized.uri ? uriIdentity.asCanonicalUri(URI.revive(serialized.uri)) : void 0,
    range: serialized.range ? Range.lift(serialized.range) : null,
    description: serialized.description,
    error: serialized.error,
    sortText: serialized.sortText
  });
})(ITestItem || (ITestItem = {}));
var TestItemExpandState = /* @__PURE__ */ ((TestItemExpandState2) => {
  TestItemExpandState2[TestItemExpandState2["NotExpandable"] = 0] = "NotExpandable";
  TestItemExpandState2[TestItemExpandState2["Expandable"] = 1] = "Expandable";
  TestItemExpandState2[TestItemExpandState2["BusyExpanding"] = 2] = "BusyExpanding";
  TestItemExpandState2[TestItemExpandState2["Expanded"] = 3] = "Expanded";
  return TestItemExpandState2;
})(TestItemExpandState || {});
var InternalTestItem;
((InternalTestItem2) => {
  InternalTestItem2.serialize = (item) => ({
    expand: item.expand,
    item: ITestItem.serialize(item.item)
  });
  InternalTestItem2.deserialize = (uriIdentity, serialized) => ({
    // the `controllerId` is derived from the test.item.extId. It's redundant
    // in the non-serialized InternalTestItem too, but there just because it's
    // checked against in many hot paths.
    controllerId: TestId.root(serialized.item.extId),
    expand: serialized.expand,
    item: ITestItem.deserialize(uriIdentity, serialized.item)
  });
})(InternalTestItem || (InternalTestItem = {}));
var ITestItemUpdate;
((ITestItemUpdate2) => {
  ITestItemUpdate2.serialize = (u) => {
    let item;
    if (u.item) {
      item = {};
      if (u.item.label !== void 0) {
        item.label = u.item.label;
      }
      if (u.item.tags !== void 0) {
        item.tags = u.item.tags;
      }
      if (u.item.busy !== void 0) {
        item.busy = u.item.busy;
      }
      if (u.item.uri !== void 0) {
        item.uri = u.item.uri?.toJSON();
      }
      if (u.item.range !== void 0) {
        item.range = u.item.range?.toJSON();
      }
      if (u.item.description !== void 0) {
        item.description = u.item.description;
      }
      if (u.item.error !== void 0) {
        item.error = u.item.error;
      }
      if (u.item.sortText !== void 0) {
        item.sortText = u.item.sortText;
      }
    }
    return { extId: u.extId, expand: u.expand, item };
  };
  ITestItemUpdate2.deserialize = (u) => {
    let item;
    if (u.item) {
      item = {};
      if (u.item.label !== void 0) {
        item.label = u.item.label;
      }
      if (u.item.tags !== void 0) {
        item.tags = u.item.tags;
      }
      if (u.item.busy !== void 0) {
        item.busy = u.item.busy;
      }
      if (u.item.range !== void 0) {
        item.range = u.item.range ? Range.lift(u.item.range) : null;
      }
      if (u.item.description !== void 0) {
        item.description = u.item.description;
      }
      if (u.item.error !== void 0) {
        item.error = u.item.error;
      }
      if (u.item.sortText !== void 0) {
        item.sortText = u.item.sortText;
      }
    }
    return { extId: u.extId, expand: u.expand, item };
  };
})(ITestItemUpdate || (ITestItemUpdate = {}));
const applyTestItemUpdate = (internal, patch) => {
  if (patch.expand !== void 0) {
    internal.expand = patch.expand;
  }
  if (patch.item !== void 0) {
    internal.item = internal.item ? Object.assign(internal.item, patch.item) : patch.item;
  }
};
var TestResultItem;
((TestResultItem2) => {
  TestResultItem2.serializeWithoutMessages = (original) => ({
    ...InternalTestItem.serialize(original),
    ownComputedState: original.ownComputedState,
    computedState: original.computedState,
    tasks: original.tasks.map(ITestTaskState.serializeWithoutMessages)
  });
  TestResultItem2.serialize = (original) => ({
    ...InternalTestItem.serialize(original),
    ownComputedState: original.ownComputedState,
    computedState: original.computedState,
    tasks: original.tasks.map(ITestTaskState.serialize)
  });
  TestResultItem2.deserialize = (uriIdentity, serialized) => ({
    ...InternalTestItem.deserialize(uriIdentity, serialized),
    ownComputedState: serialized.ownComputedState,
    computedState: serialized.computedState,
    tasks: serialized.tasks.map((m) => ITestTaskState.deserialize(uriIdentity, m)),
    retired: true
  });
})(TestResultItem || (TestResultItem = {}));
var ICoverageCount;
((ICoverageCount2) => {
  ICoverageCount2.empty = () => ({ covered: 0, total: 0 });
  ICoverageCount2.sum = (target, src) => {
    target.covered += src.covered;
    target.total += src.total;
  };
})(ICoverageCount || (ICoverageCount = {}));
var IFileCoverage;
((IFileCoverage2) => {
  IFileCoverage2.serialize = (original) => ({
    id: original.id,
    statement: original.statement,
    branch: original.branch,
    declaration: original.declaration,
    testIds: original.testIds,
    uri: original.uri.toJSON()
  });
  IFileCoverage2.deserialize = (uriIdentity, serialized) => ({
    id: serialized.id,
    statement: serialized.statement,
    branch: serialized.branch,
    declaration: serialized.declaration,
    testIds: serialized.testIds,
    uri: uriIdentity.asCanonicalUri(URI.revive(serialized.uri))
  });
  IFileCoverage2.empty = (id, uri) => ({
    id,
    uri,
    statement: ICoverageCount.empty()
  });
})(IFileCoverage || (IFileCoverage = {}));
function serializeThingWithLocation(serialized) {
  return {
    ...serialized,
    location: serialized.location?.toJSON()
  };
}
function deserializeThingWithLocation(serialized) {
  serialized.location = serialized.location ? Position.isIPosition(serialized.location) ? Position.lift(serialized.location) : Range.lift(serialized.location) : void 0;
  return serialized;
}
const KEEP_N_LAST_COVERAGE_REPORTS = 3;
var DetailType = /* @__PURE__ */ ((DetailType2) => {
  DetailType2[DetailType2["Declaration"] = 0] = "Declaration";
  DetailType2[DetailType2["Statement"] = 1] = "Statement";
  DetailType2[DetailType2["Branch"] = 2] = "Branch";
  return DetailType2;
})(DetailType || {});
var CoverageDetails;
((CoverageDetails2) => {
  CoverageDetails2.serialize = (original) => original.type === 0 /* Declaration */ ? IDeclarationCoverage.serialize(original) : IStatementCoverage.serialize(original);
  CoverageDetails2.deserialize = (serialized) => serialized.type === 0 /* Declaration */ ? IDeclarationCoverage.deserialize(serialized) : IStatementCoverage.deserialize(serialized);
})(CoverageDetails || (CoverageDetails = {}));
var IBranchCoverage;
((IBranchCoverage2) => {
  IBranchCoverage2.serialize = serializeThingWithLocation;
  IBranchCoverage2.deserialize = deserializeThingWithLocation;
})(IBranchCoverage || (IBranchCoverage = {}));
var IDeclarationCoverage;
((IDeclarationCoverage2) => {
  IDeclarationCoverage2.serialize = serializeThingWithLocation;
  IDeclarationCoverage2.deserialize = deserializeThingWithLocation;
})(IDeclarationCoverage || (IDeclarationCoverage = {}));
var IStatementCoverage;
((IStatementCoverage2) => {
  IStatementCoverage2.serialize = (original) => ({
    ...serializeThingWithLocation(original),
    branches: original.branches?.map(IBranchCoverage.serialize)
  });
  IStatementCoverage2.deserialize = (serialized) => ({
    ...deserializeThingWithLocation(serialized),
    branches: serialized.branches?.map(IBranchCoverage.deserialize)
  });
})(IStatementCoverage || (IStatementCoverage = {}));
var TestDiffOpType = /* @__PURE__ */ ((TestDiffOpType2) => {
  TestDiffOpType2[TestDiffOpType2["Add"] = 0] = "Add";
  TestDiffOpType2[TestDiffOpType2["Update"] = 1] = "Update";
  TestDiffOpType2[TestDiffOpType2["DocumentSynced"] = 2] = "DocumentSynced";
  TestDiffOpType2[TestDiffOpType2["Remove"] = 3] = "Remove";
  TestDiffOpType2[TestDiffOpType2["IncrementPendingExtHosts"] = 4] = "IncrementPendingExtHosts";
  TestDiffOpType2[TestDiffOpType2["Retire"] = 5] = "Retire";
  TestDiffOpType2[TestDiffOpType2["AddTag"] = 6] = "AddTag";
  TestDiffOpType2[TestDiffOpType2["RemoveTag"] = 7] = "RemoveTag";
  return TestDiffOpType2;
})(TestDiffOpType || {});
var TestsDiffOp;
((TestsDiffOp2) => {
  TestsDiffOp2.deserialize = (uriIdentity, u) => {
    if (u.op === 0 /* Add */) {
      return { op: u.op, item: InternalTestItem.deserialize(uriIdentity, u.item) };
    } else if (u.op === 1 /* Update */) {
      return { op: u.op, item: ITestItemUpdate.deserialize(u.item) };
    } else if (u.op === 2 /* DocumentSynced */) {
      return { op: u.op, uri: uriIdentity.asCanonicalUri(URI.revive(u.uri)), docv: u.docv };
    } else {
      return u;
    }
  };
  TestsDiffOp2.serialize = (u) => {
    if (u.op === 0 /* Add */) {
      return { op: u.op, item: InternalTestItem.serialize(u.item) };
    } else if (u.op === 1 /* Update */) {
      return { op: u.op, item: ITestItemUpdate.serialize(u.item) };
    } else {
      return u;
    }
  };
})(TestsDiffOp || (TestsDiffOp = {}));
class AbstractIncrementalTestCollection {
  constructor(uriIdentity) {
    this.uriIdentity = uriIdentity;
    this._tags = /* @__PURE__ */ new Map();
    /**
     * Map of item IDs to test item objects.
     */
    this.items = /* @__PURE__ */ new Map();
    /**
     * ID of test root items.
     */
    this.roots = /* @__PURE__ */ new Set();
    /**
     * Number of 'busy' controllers.
     */
    this.busyControllerCount = 0;
    /**
     * Number of pending roots.
     */
    this.pendingRootCount = 0;
    /**
     * Known test tags.
     */
    this.tags = this._tags;
  }
  /**
   * Applies the diff to the collection.
   */
  apply(diff) {
    const changes = this.createChangeCollector();
    for (const op of diff) {
      switch (op.op) {
        case 0 /* Add */:
          this.add(InternalTestItem.deserialize(this.uriIdentity, op.item), changes);
          break;
        case 1 /* Update */:
          this.update(ITestItemUpdate.deserialize(op.item), changes);
          break;
        case 3 /* Remove */:
          this.remove(op.itemId, changes);
          break;
        case 5 /* Retire */:
          this.retireTest(op.itemId);
          break;
        case 4 /* IncrementPendingExtHosts */:
          this.updatePendingRoots(op.amount);
          break;
        case 6 /* AddTag */:
          this._tags.set(op.tag.id, op.tag);
          break;
        case 7 /* RemoveTag */:
          this._tags.delete(op.id);
          break;
      }
    }
    changes.complete?.();
  }
  add(item, changes) {
    const parentId = TestId.parentId(item.item.extId)?.toString();
    let created;
    if (!parentId) {
      created = this.createItem(item);
      this.roots.add(created);
      this.items.set(item.item.extId, created);
    } else if (this.items.has(parentId)) {
      const parent = this.items.get(parentId);
      parent.children.add(item.item.extId);
      created = this.createItem(item, parent);
      this.items.set(item.item.extId, created);
    } else {
      console.error(`Test with unknown parent ID: ${JSON.stringify(item)}`);
      return;
    }
    changes.add?.(created);
    if (item.expand === 2 /* BusyExpanding */) {
      this.busyControllerCount++;
    }
    return created;
  }
  update(patch, changes) {
    const existing = this.items.get(patch.extId);
    if (!existing) {
      return;
    }
    if (patch.expand !== void 0) {
      if (existing.expand === 2 /* BusyExpanding */) {
        this.busyControllerCount--;
      }
      if (patch.expand === 2 /* BusyExpanding */) {
        this.busyControllerCount++;
      }
    }
    applyTestItemUpdate(existing, patch);
    changes.update?.(existing);
    return existing;
  }
  remove(itemId, changes) {
    const toRemove = this.items.get(itemId);
    if (!toRemove) {
      return;
    }
    const parentId = TestId.parentId(toRemove.item.extId)?.toString();
    if (parentId) {
      const parent = this.items.get(parentId);
      parent.children.delete(toRemove.item.extId);
    } else {
      this.roots.delete(toRemove);
    }
    const queue = [[itemId]];
    while (queue.length) {
      for (const itemId2 of queue.pop()) {
        const existing = this.items.get(itemId2);
        if (existing) {
          queue.push(existing.children);
          this.items.delete(itemId2);
          changes.remove?.(existing, existing !== toRemove);
          if (existing.expand === 2 /* BusyExpanding */) {
            this.busyControllerCount--;
          }
        }
      }
    }
  }
  /**
   * Called when the extension signals a test result should be retired.
   */
  retireTest(testId) {
  }
  /**
   * Updates the number of test root sources who are yet to report. When
   * the total pending test roots reaches 0, the roots for all controllers
   * will exist in the collection.
   */
  updatePendingRoots(delta) {
    this.pendingRootCount += delta;
  }
  /**
   * Called before a diff is applied to create a new change collector.
   */
  createChangeCollector() {
    return {};
  }
}
export {
  AbstractIncrementalTestCollection,
  CoverageDetails,
  DetailType,
  ExtTestRunProfileKind,
  IBranchCoverage,
  ICoverageCount,
  IDeclarationCoverage,
  IFileCoverage,
  IRichLocation,
  IStatementCoverage,
  ITestErrorMessage,
  ITestItem,
  ITestItemUpdate,
  ITestMessage,
  ITestMessageStackFrame,
  ITestOutputMessage,
  ITestTaskState,
  InternalTestItem,
  KEEP_N_LAST_COVERAGE_REPORTS,
  TestControllerCapability,
  TestDiffOpType,
  TestItemExpandState,
  TestMessageType,
  TestResultItem,
  TestResultState,
  TestRunProfileBitset,
  TestsDiffOp,
  applyTestItemUpdate,
  denamespaceTestTag,
  getMarkId,
  isStartControllerTests,
  namespaceTestTag,
  testProfileBitset,
  testResultStateToContextValues,
  testRunProfileBitsetList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RUeXBlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0UmVzdWx0U3RhdGUge1xuXHRVbnNldCA9IDAsXG5cdFF1ZXVlZCA9IDEsXG5cdFJ1bm5pbmcgPSAyLFxuXHRQYXNzZWQgPSAzLFxuXHRGYWlsZWQgPSA0LFxuXHRTa2lwcGVkID0gNSxcblx0RXJyb3JlZCA9IDZcbn1cblxuZXhwb3J0IGNvbnN0IHRlc3RSZXN1bHRTdGF0ZVRvQ29udGV4dFZhbHVlczogeyBbSyBpbiBUZXN0UmVzdWx0U3RhdGVdOiBzdHJpbmcgfSA9IHtcblx0W1Rlc3RSZXN1bHRTdGF0ZS5VbnNldF06ICd1bnNldCcsXG5cdFtUZXN0UmVzdWx0U3RhdGUuUXVldWVkXTogJ3F1ZXVlZCcsXG5cdFtUZXN0UmVzdWx0U3RhdGUuUnVubmluZ106ICdydW5uaW5nJyxcblx0W1Rlc3RSZXN1bHRTdGF0ZS5QYXNzZWRdOiAncGFzc2VkJyxcblx0W1Rlc3RSZXN1bHRTdGF0ZS5GYWlsZWRdOiAnZmFpbGVkJyxcblx0W1Rlc3RSZXN1bHRTdGF0ZS5Ta2lwcGVkXTogJ3NraXBwZWQnLFxuXHRbVGVzdFJlc3VsdFN0YXRlLkVycm9yZWRdOiAnZXJyb3JlZCcsXG59O1xuXG4vKiogbm90ZToga2VlcCBpbiBzeW5jIHdpdGggVGVzdFJ1blByb2ZpbGVLaW5kIGluIHZzY29kZS5kLnRzICovXG5leHBvcnQgY29uc3QgZW51bSBFeHRUZXN0UnVuUHJvZmlsZUtpbmQge1xuXHRSdW4gPSAxLFxuXHREZWJ1ZyA9IDIsXG5cdENvdmVyYWdlID0gMyxcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5IHtcblx0UmVmcmVzaCA9IDEgPDwgMSxcblx0Q29kZVJlbGF0ZWRUb1Rlc3QgPSAxIDw8IDIsXG5cdFRlc3RSZWxhdGVkVG9Db2RlID0gMSA8PCAzLFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0UnVuUHJvZmlsZUJpdHNldCB7XG5cdFJ1biA9IDEgPDwgMSxcblx0RGVidWcgPSAxIDw8IDIsXG5cdENvdmVyYWdlID0gMSA8PCAzLFxuXHRIYXNOb25EZWZhdWx0UHJvZmlsZSA9IDEgPDwgNCxcblx0SGFzQ29uZmlndXJhYmxlID0gMSA8PCA1LFxuXHRTdXBwb3J0c0NvbnRpbnVvdXNSdW4gPSAxIDw8IDYsXG59XG5cbmV4cG9ydCBjb25zdCB0ZXN0UHJvZmlsZUJpdHNldCA9IHtcblx0W1Rlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bl06IGxvY2FsaXplKCd0ZXN0aW5nLnJ1blByb2ZpbGVCaXRzZXQucnVuJywgJ1J1bicpLFxuXHRbVGVzdFJ1blByb2ZpbGVCaXRzZXQuRGVidWddOiBsb2NhbGl6ZSgndGVzdGluZy5ydW5Qcm9maWxlQml0c2V0LmRlYnVnJywgJ0RlYnVnJyksXG5cdFtUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZV06IGxvY2FsaXplKCd0ZXN0aW5nLnJ1blByb2ZpbGVCaXRzZXQuY292ZXJhZ2UnLCAnQ292ZXJhZ2UnKSxcbn07XG5cbi8qKlxuICogTGlzdCBvZiBhbGwgdGVzdCBydW4gcHJvZmlsZSBiaXRzZXQgdmFsdWVzLlxuICovXG5leHBvcnQgY29uc3QgdGVzdFJ1blByb2ZpbGVCaXRzZXRMaXN0ID0gW1xuXHRUZXN0UnVuUHJvZmlsZUJpdHNldC5SdW4sXG5cdFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLFxuXHRUZXN0UnVuUHJvZmlsZUJpdHNldC5Db3ZlcmFnZSxcblx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuSGFzTm9uRGVmYXVsdFByb2ZpbGUsXG5cdFRlc3RSdW5Qcm9maWxlQml0c2V0Lkhhc0NvbmZpZ3VyYWJsZSxcblx0VGVzdFJ1blByb2ZpbGVCaXRzZXQuU3VwcG9ydHNDb250aW51b3VzUnVuLFxuXTtcblxuLyoqXG4gKiBEVE8gZm9yIGEgY29udHJvbGxlcidzIHJ1biBwcm9maWxlcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJ1blByb2ZpbGUge1xuXHRjb250cm9sbGVySWQ6IHN0cmluZztcblx0cHJvZmlsZUlkOiBudW1iZXI7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUJpdHNldDtcblx0aXNEZWZhdWx0OiBib29sZWFuO1xuXHR0YWc6IHN0cmluZyB8IG51bGw7XG5cdGhhc0NvbmZpZ3VyYXRpb25IYW5kbGVyOiBib29sZWFuO1xuXHRzdXBwb3J0c0NvbnRpbnVvdXNSdW46IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RSdW5Qcm9maWxlUmVmZXJlbmNlIHtcblx0Y29udHJvbGxlcklkOiBzdHJpbmc7XG5cdHByb2ZpbGVJZDogbnVtYmVyO1xuXHRncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQ7XG59XG5cbi8qKlxuICogQSBmdWxseS1yZXNvbHZlZCByZXF1ZXN0IHRvIHJ1biB0ZXN0cywgcGFzc3NlZCBiZXR3ZWVuIHRoZSBtYWluIHRocmVhZFxuICogYW5kIGV4dGVuc2lvbiBob3N0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFJlc29sdmVkVGVzdFJ1blJlcXVlc3Qge1xuXHRncm91cDogVGVzdFJ1blByb2ZpbGVCaXRzZXQ7XG5cdHRhcmdldHM6IHtcblx0XHR0ZXN0SWRzOiBzdHJpbmdbXTtcblx0XHRjb250cm9sbGVySWQ6IHN0cmluZztcblx0XHRwcm9maWxlSWQ6IG51bWJlcjtcblx0fVtdO1xuXHRleGNsdWRlPzogc3RyaW5nW107XG5cdC8qKiBXaGV0aGVyIHRoaXMgaXMgYSBjb250aW51b3VzIHRlc3QgcnVuICovXG5cdGNvbnRpbnVvdXM/OiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGlzIHdhcyB0cmlnZ2VkIGJ5IGEgdXNlciBhY3Rpb24gaW4gVUkuIERlZmF1bHQ9dHJ1ZSAqL1xuXHRwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXF1ZXN0IHRvIHRoZSBtYWluIHRocmVhZCB0byBydW4gYSBzZXQgb2YgdGVzdHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRXh0ZW5zaW9uUnVuVGVzdHNSZXF1ZXN0IHtcblx0aWQ6IHN0cmluZztcblx0aW5jbHVkZTogc3RyaW5nW107XG5cdGV4Y2x1ZGU6IHN0cmluZ1tdO1xuXHRjb250cm9sbGVySWQ6IHN0cmluZztcblx0cHJvZmlsZT86IHsgZ3JvdXA6IFRlc3RSdW5Qcm9maWxlQml0c2V0OyBpZDogbnVtYmVyIH07XG5cdHBlcnNpc3Q6IGJvb2xlYW47XG5cdHByZXNlcnZlRm9jdXM6IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoaXMgaXMgYSByZXN1bHQgb2YgYSBjb250aW51b3VzIHRlc3QgcnVuIHJlcXVlc3QgKi9cblx0Y29udGludW91czogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXF1ZXN0IHBhcmFtZXRlcnMgYSBjb250cm9sbGVyIHJ1biBoYW5kbGVyLiBUaGlzIGlzIGRpZmZlcmVudCB0aGFuXG4gKiB7QGxpbmsgSVN0YXJ0Q29udHJvbGxlclRlc3RzfS4gVGhlIGxhdHRlciBpcyB1c2VkIHRvIGFzayBmb3Igb25lIG9yIG1vcmUgdGVzdFxuICogcnVucyB0cmFja2VkIGRpcmVjdGx5IGJ5IHRoZSByZW5kZXJlci5cbiAqXG4gKiBUaGlzIGFsb25lIGNhbiBiZSB1c2VkIHRvIHN0YXJ0IGFuIGF1dG9ydW4sIHdpdGhvdXQgYSBzcGVjaWZpYyBhc3NvY2lhdGVkIHJ1bklkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDYWxsUHJvZmlsZVJ1bkhhbmRsZXIge1xuXHRjb250cm9sbGVySWQ6IHN0cmluZztcblx0cHJvZmlsZUlkOiBudW1iZXI7XG5cdGV4Y2x1ZGVFeHRJZHM6IHN0cmluZ1tdO1xuXHR0ZXN0SWRzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IGlzU3RhcnRDb250cm9sbGVyVGVzdHMgPSAodDogSUNhbGxQcm9maWxlUnVuSGFuZGxlciB8IElTdGFydENvbnRyb2xsZXJUZXN0cyk6IHQgaXMgSVN0YXJ0Q29udHJvbGxlclRlc3RzID0+ICgncnVuSWQnIGFzIGtleW9mIElTdGFydENvbnRyb2xsZXJUZXN0cykgaW4gdDtcblxuLyoqXG4gKiBSZXF1ZXN0IGZyb20gdGhlIG1haW4gdGhyZWFkIHRvIHJ1biB0ZXN0cyBmb3IgYSBzaW5nbGUgY29udHJvbGxlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU3RhcnRDb250cm9sbGVyVGVzdHMgZXh0ZW5kcyBJQ2FsbFByb2ZpbGVSdW5IYW5kbGVyIHtcblx0cnVuSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RhcnRDb250cm9sbGVyVGVzdHNSZXN1bHQge1xuXHRlcnJvcj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBMb2NhdGlvbiB3aXRoIGEgZnVsbHktaW5zdGFudGlhdGVkIFJhbmdlIGFuZCBVUkkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJpY2hMb2NhdGlvbiB7XG5cdHJhbmdlOiBSYW5nZTtcblx0dXJpOiBVUkk7XG59XG5cbi8qKiBTdWJzZXQgb2YgdGhlIElVcmlJZGVudGl0eVNlcnZpY2UgKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RVcmlDYW5vbmljYWxpemVyIHtcblx0LyoqIEBsaW5rIGltcG9ydCgndnMvcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5JykuSVVyaUlkZW50aXR5U2VydmljZSAqL1xuXHRhc0Nhbm9uaWNhbFVyaSh1cmk6IFVSSSk6IFVSSTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJUmljaExvY2F0aW9uIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemUge1xuXHRcdHJhbmdlOiBJUmFuZ2U7XG5cdFx0dXJpOiBVcmlDb21wb25lbnRzO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChsb2NhdGlvbjogUmVhZG9ubHk8SVJpY2hMb2NhdGlvbj4pOiBTZXJpYWxpemUgPT4gKHtcblx0XHRyYW5nZTogbG9jYXRpb24ucmFuZ2UudG9KU09OKCksXG5cdFx0dXJpOiBsb2NhdGlvbi51cmkudG9KU09OKCksXG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBkZXNlcmlhbGl6ZSA9ICh1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCBsb2NhdGlvbjogU2VyaWFsaXplKTogSVJpY2hMb2NhdGlvbiA9PiAoe1xuXHRcdHJhbmdlOiBSYW5nZS5saWZ0KGxvY2F0aW9uLnJhbmdlKSxcblx0XHR1cmk6IHVyaUlkZW50aXR5LmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUobG9jYXRpb24udXJpKSksXG5cdH0pO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0TWVzc2FnZVR5cGUge1xuXHRFcnJvcixcblx0T3V0cHV0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RNZXNzYWdlU3RhY2tGcmFtZSB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwb3NpdGlvbjogUG9zaXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RNZXNzYWdlU3RhY2tGcmFtZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHR1cmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ7XG5cdFx0cG9zaXRpb246IElQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAoc3RhY2s6IFJlYWRvbmx5PElUZXN0TWVzc2FnZVN0YWNrRnJhbWU+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdGxhYmVsOiBzdGFjay5sYWJlbCxcblx0XHR1cmk6IHN0YWNrLnVyaT8udG9KU09OKCksXG5cdFx0cG9zaXRpb246IHN0YWNrLnBvc2l0aW9uPy50b0pTT04oKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHN0YWNrOiBTZXJpYWxpemVkKTogSVRlc3RNZXNzYWdlU3RhY2tGcmFtZSA9PiAoe1xuXHRcdGxhYmVsOiBzdGFjay5sYWJlbCxcblx0XHR1cmk6IHN0YWNrLnVyaSA/IHVyaUlkZW50aXR5LmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUoc3RhY2sudXJpKSkgOiB1bmRlZmluZWQsXG5cdFx0cG9zaXRpb246IHN0YWNrLnBvc2l0aW9uID8gUG9zaXRpb24ubGlmdChzdGFjay5wb3NpdGlvbikgOiB1bmRlZmluZWQsXG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0RXJyb3JNZXNzYWdlIHtcblx0bWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3I7XG5cdGV4cGVjdGVkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGFjdHVhbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb250ZXh0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bG9jYXRpb246IElSaWNoTG9jYXRpb24gfCB1bmRlZmluZWQ7XG5cdHN0YWNrVHJhY2U6IHVuZGVmaW5lZCB8IElUZXN0TWVzc2FnZVN0YWNrRnJhbWVbXTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJVGVzdEVycm9yTWVzc2FnZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0bWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5FcnJvcjtcblx0XHRleHBlY3RlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGFjdHVhbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxvY2F0aW9uOiBJUmljaExvY2F0aW9uLlNlcmlhbGl6ZSB8IHVuZGVmaW5lZDtcblx0XHRzdGFja1RyYWNlOiB1bmRlZmluZWQgfCBJVGVzdE1lc3NhZ2VTdGFja0ZyYW1lLlNlcmlhbGl6ZWRbXTtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAobWVzc2FnZTogUmVhZG9ubHk8SVRlc3RFcnJvck1lc3NhZ2U+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdG1lc3NhZ2U6IG1lc3NhZ2UubWVzc2FnZSxcblx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsXG5cdFx0ZXhwZWN0ZWQ6IG1lc3NhZ2UuZXhwZWN0ZWQsXG5cdFx0YWN0dWFsOiBtZXNzYWdlLmFjdHVhbCxcblx0XHRjb250ZXh0VmFsdWU6IG1lc3NhZ2UuY29udGV4dFZhbHVlLFxuXHRcdGxvY2F0aW9uOiBtZXNzYWdlLmxvY2F0aW9uICYmIElSaWNoTG9jYXRpb24uc2VyaWFsaXplKG1lc3NhZ2UubG9jYXRpb24pLFxuXHRcdHN0YWNrVHJhY2U6IG1lc3NhZ2Uuc3RhY2tUcmFjZT8ubWFwKElUZXN0TWVzc2FnZVN0YWNrRnJhbWUuc2VyaWFsaXplKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIG1lc3NhZ2U6IFNlcmlhbGl6ZWQpOiBJVGVzdEVycm9yTWVzc2FnZSA9PiAoe1xuXHRcdG1lc3NhZ2U6IG1lc3NhZ2UubWVzc2FnZSxcblx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuRXJyb3IsXG5cdFx0ZXhwZWN0ZWQ6IG1lc3NhZ2UuZXhwZWN0ZWQsXG5cdFx0YWN0dWFsOiBtZXNzYWdlLmFjdHVhbCxcblx0XHRjb250ZXh0VmFsdWU6IG1lc3NhZ2UuY29udGV4dFZhbHVlLFxuXHRcdGxvY2F0aW9uOiBtZXNzYWdlLmxvY2F0aW9uICYmIElSaWNoTG9jYXRpb24uZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIG1lc3NhZ2UubG9jYXRpb24pLFxuXHRcdHN0YWNrVHJhY2U6IG1lc3NhZ2Uuc3RhY2tUcmFjZSAmJiBtZXNzYWdlLnN0YWNrVHJhY2UubWFwKHMgPT4gSVRlc3RNZXNzYWdlU3RhY2tGcmFtZS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgcykpLFxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdE91dHB1dE1lc3NhZ2Uge1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQ7XG5cdG9mZnNldDogbnVtYmVyO1xuXHRsZW5ndGg6IG51bWJlcjtcblx0bWFya2VyPzogbnVtYmVyO1xuXHRsb2NhdGlvbjogSVJpY2hMb2NhdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBUVFkgbWFya2VyIElEIGZvciBlaXRoZXIgc3RhcnRpbmcgb3IgZW5kaW5nXG4gKiBhbiBJVGVzdE91dHB1dE1lc3NhZ2UubWFya2VyIG9mIHRoZSBnaXZlbiBJRC5cbiAqL1xuZXhwb3J0IGNvbnN0IGdldE1hcmtJZCA9IChtYXJrZXI6IG51bWJlciwgc3RhcnQ6IGJvb2xlYW4pID0+IGAke3N0YXJ0ID8gJ3MnIDogJ2UnfSR7bWFya2VyfWA7XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RPdXRwdXRNZXNzYWdlIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHRtZXNzYWdlOiBzdHJpbmc7XG5cdFx0b2Zmc2V0OiBudW1iZXI7XG5cdFx0bGVuZ3RoOiBudW1iZXI7XG5cdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLk91dHB1dDtcblx0XHRsb2NhdGlvbjogSVJpY2hMb2NhdGlvbi5TZXJpYWxpemUgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKG1lc3NhZ2U6IFJlYWRvbmx5PElUZXN0T3V0cHV0TWVzc2FnZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0bWVzc2FnZTogbWVzc2FnZS5tZXNzYWdlLFxuXHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQsXG5cdFx0b2Zmc2V0OiBtZXNzYWdlLm9mZnNldCxcblx0XHRsZW5ndGg6IG1lc3NhZ2UubGVuZ3RoLFxuXHRcdGxvY2F0aW9uOiBtZXNzYWdlLmxvY2F0aW9uICYmIElSaWNoTG9jYXRpb24uc2VyaWFsaXplKG1lc3NhZ2UubG9jYXRpb24pLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgbWVzc2FnZTogU2VyaWFsaXplZCk6IElUZXN0T3V0cHV0TWVzc2FnZSA9PiAoe1xuXHRcdG1lc3NhZ2U6IG1lc3NhZ2UubWVzc2FnZSxcblx0XHR0eXBlOiBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0LFxuXHRcdG9mZnNldDogbWVzc2FnZS5vZmZzZXQsXG5cdFx0bGVuZ3RoOiBtZXNzYWdlLmxlbmd0aCxcblx0XHRsb2NhdGlvbjogbWVzc2FnZS5sb2NhdGlvbiAmJiBJUmljaExvY2F0aW9uLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCBtZXNzYWdlLmxvY2F0aW9uKSxcblx0fSk7XG59XG5cbmV4cG9ydCB0eXBlIElUZXN0TWVzc2FnZSA9IElUZXN0RXJyb3JNZXNzYWdlIHwgSVRlc3RPdXRwdXRNZXNzYWdlO1xuXG5leHBvcnQgbmFtZXNwYWNlIElUZXN0TWVzc2FnZSB7XG5cdGV4cG9ydCB0eXBlIFNlcmlhbGl6ZWQgPSBJVGVzdEVycm9yTWVzc2FnZS5TZXJpYWxpemVkIHwgSVRlc3RPdXRwdXRNZXNzYWdlLlNlcmlhbGl6ZWQ7XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZSA9IChtZXNzYWdlOiBSZWFkb25seTxJVGVzdE1lc3NhZ2U+KTogU2VyaWFsaXplZCA9PlxuXHRcdG1lc3NhZ2UudHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yID8gSVRlc3RFcnJvck1lc3NhZ2Uuc2VyaWFsaXplKG1lc3NhZ2UpIDogSVRlc3RPdXRwdXRNZXNzYWdlLnNlcmlhbGl6ZShtZXNzYWdlKTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgbWVzc2FnZTogU2VyaWFsaXplZCk6IElUZXN0TWVzc2FnZSA9PlxuXHRcdG1lc3NhZ2UudHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yID8gSVRlc3RFcnJvck1lc3NhZ2UuZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIG1lc3NhZ2UpIDogSVRlc3RPdXRwdXRNZXNzYWdlLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCBtZXNzYWdlKTtcblxuXHRleHBvcnQgY29uc3QgaXNEaWZmYWJsZSA9IChtZXNzYWdlOiBJVGVzdE1lc3NhZ2UpOiBtZXNzYWdlIGlzIElUZXN0RXJyb3JNZXNzYWdlICYgeyBhY3R1YWw6IHN0cmluZzsgZXhwZWN0ZWQ6IHN0cmluZyB9ID0+XG5cdFx0bWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IgJiYgbWVzc2FnZS5hY3R1YWwgIT09IHVuZGVmaW5lZCAmJiBtZXNzYWdlLmV4cGVjdGVkICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RUYXNrU3RhdGUge1xuXHRzdGF0ZTogVGVzdFJlc3VsdFN0YXRlO1xuXHRkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRtZXNzYWdlczogSVRlc3RNZXNzYWdlW107XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RUYXNrU3RhdGUge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdHN0YXRlOiBUZXN0UmVzdWx0U3RhdGU7XG5cdFx0ZHVyYXRpb246IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRtZXNzYWdlczogSVRlc3RNZXNzYWdlLlNlcmlhbGl6ZWRbXTtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemVXaXRob3V0TWVzc2FnZXMgPSAoc3RhdGU6IElUZXN0VGFza1N0YXRlKTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdHN0YXRlOiBzdGF0ZS5zdGF0ZSxcblx0XHRkdXJhdGlvbjogc3RhdGUuZHVyYXRpb24sXG5cdFx0bWVzc2FnZXM6IFtdLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKHN0YXRlOiBSZWFkb25seTxJVGVzdFRhc2tTdGF0ZT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0c3RhdGU6IHN0YXRlLnN0YXRlLFxuXHRcdGR1cmF0aW9uOiBzdGF0ZS5kdXJhdGlvbixcblx0XHRtZXNzYWdlczogc3RhdGUubWVzc2FnZXMubWFwKElUZXN0TWVzc2FnZS5zZXJpYWxpemUpLFxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgZGVzZXJpYWxpemUgPSAodXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplciwgc3RhdGU6IFNlcmlhbGl6ZWQpOiBJVGVzdFRhc2tTdGF0ZSA9PiAoe1xuXHRcdHN0YXRlOiBzdGF0ZS5zdGF0ZSxcblx0XHRkdXJhdGlvbjogc3RhdGUuZHVyYXRpb24sXG5cdFx0bWVzc2FnZXM6IHN0YXRlLm1lc3NhZ2VzLm1hcChtID0+IElUZXN0TWVzc2FnZS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgbSkpLFxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJ1blRhc2sge1xuXHRpZDogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdHJ1bm5pbmc6IGJvb2xlYW47XG5cdGN0cmxJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0VGFnIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcbn1cblxuY29uc3QgdGVzdFRhZ0RlbGltaXRlciA9ICdcXDAnO1xuXG5leHBvcnQgY29uc3QgbmFtZXNwYWNlVGVzdFRhZyA9XG5cdChjdHJsSWQ6IHN0cmluZywgdGFnSWQ6IHN0cmluZykgPT4gY3RybElkICsgdGVzdFRhZ0RlbGltaXRlciArIHRhZ0lkO1xuXG5leHBvcnQgY29uc3QgZGVuYW1lc3BhY2VUZXN0VGFnID0gKG5hbWVzcGFjZWQ6IHN0cmluZykgPT4ge1xuXHRjb25zdCBpbmRleCA9IG5hbWVzcGFjZWQuaW5kZXhPZih0ZXN0VGFnRGVsaW1pdGVyKTtcblx0cmV0dXJuIHsgY3RybElkOiBuYW1lc3BhY2VkLnNsaWNlKDAsIGluZGV4KSwgdGFnSWQ6IG5hbWVzcGFjZWQuc2xpY2UoaW5kZXggKyAxKSB9O1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFRhZ0Rpc3BsYXlJbmZvIHtcblx0aWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGUgVGVzdEl0ZW0gZnJvbSAuZC50cywgYXMgYSBwbGFpbiBvYmplY3Qgd2l0aG91dCBjaGlsZHJlbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW0ge1xuXHQvKiogSUQgb2YgdGhlIHRlc3QgZ2l2ZW4gYnkgdGhlIHRlc3QgY29udHJvbGxlciAqL1xuXHRleHRJZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHR0YWdzOiBzdHJpbmdbXTtcblx0YnVzeTogYm9vbGVhbjtcblx0Y2hpbGRyZW4/OiBuZXZlcjtcblx0dXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJhbmdlOiBSYW5nZSB8IG51bGw7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmcgfCBudWxsO1xuXHRlcnJvcjogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgbnVsbDtcblx0c29ydFRleHQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRlc3RJdGVtIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTZXJpYWxpemVkIHtcblx0XHRleHRJZDogc3RyaW5nO1xuXHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0dGFnczogc3RyaW5nW107XG5cdFx0YnVzeTogYm9vbGVhbjtcblx0XHRjaGlsZHJlbj86IG5ldmVyO1xuXHRcdHVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZDtcblx0XHRyYW5nZTogSVJhbmdlIHwgbnVsbDtcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nIHwgbnVsbDtcblx0XHRlcnJvcjogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgbnVsbDtcblx0XHRzb3J0VGV4dDogc3RyaW5nIHwgbnVsbDtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAoaXRlbTogUmVhZG9ubHk8SVRlc3RJdGVtPik6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHRleHRJZDogaXRlbS5leHRJZCxcblx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHR0YWdzOiBpdGVtLnRhZ3MsXG5cdFx0YnVzeTogaXRlbS5idXN5LFxuXHRcdGNoaWxkcmVuOiB1bmRlZmluZWQsXG5cdFx0dXJpOiBpdGVtLnVyaT8udG9KU09OKCksXG5cdFx0cmFuZ2U6IGl0ZW0ucmFuZ2U/LnRvSlNPTigpIHx8IG51bGwsXG5cdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0ZXJyb3I6IGl0ZW0uZXJyb3IsXG5cdFx0c29ydFRleHQ6IGl0ZW0uc29ydFRleHRcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBJVGVzdEl0ZW0gPT4gKHtcblx0XHRleHRJZDogc2VyaWFsaXplZC5leHRJZCxcblx0XHRsYWJlbDogc2VyaWFsaXplZC5sYWJlbCxcblx0XHR0YWdzOiBzZXJpYWxpemVkLnRhZ3MsXG5cdFx0YnVzeTogc2VyaWFsaXplZC5idXN5LFxuXHRcdGNoaWxkcmVuOiB1bmRlZmluZWQsXG5cdFx0dXJpOiBzZXJpYWxpemVkLnVyaSA/IHVyaUlkZW50aXR5LmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUoc2VyaWFsaXplZC51cmkpKSA6IHVuZGVmaW5lZCxcblx0XHRyYW5nZTogc2VyaWFsaXplZC5yYW5nZSA/IFJhbmdlLmxpZnQoc2VyaWFsaXplZC5yYW5nZSkgOiBudWxsLFxuXHRcdGRlc2NyaXB0aW9uOiBzZXJpYWxpemVkLmRlc2NyaXB0aW9uLFxuXHRcdGVycm9yOiBzZXJpYWxpemVkLmVycm9yLFxuXHRcdHNvcnRUZXh0OiBzZXJpYWxpemVkLnNvcnRUZXh0XG5cdH0pO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUZXN0SXRlbUV4cGFuZFN0YXRlIHtcblx0Tm90RXhwYW5kYWJsZSxcblx0RXhwYW5kYWJsZSxcblx0QnVzeUV4cGFuZGluZyxcblx0RXhwYW5kZWQsXG59XG5cbi8qKlxuICogVGVzdEl0ZW0tbGlrZSBzaGFwZSwgYnV0IHdpdGggYW4gSUQgYW5kIGNoaWxkcmVuIGFzIHN0cmluZ3MuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZXJuYWxUZXN0SXRlbSB7XG5cdC8qKiBDb250cm9sbGVyIElEIGZyb20gd2hlbmNlIHRoaXMgdGVzdCBjYW1lICovXG5cdGNvbnRyb2xsZXJJZDogc3RyaW5nO1xuXHQvKiogRXhwYW5kYWJpbGl0eSBzdGF0ZSAqL1xuXHRleHBhbmQ6IFRlc3RJdGVtRXhwYW5kU3RhdGU7XG5cdC8qKiBSYXcgdGVzdCBpdGVtIHByb3BlcnRpZXMgKi9cblx0aXRlbTogSVRlc3RJdGVtO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIEludGVybmFsVGVzdEl0ZW0ge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZTtcblx0XHRpdGVtOiBJVGVzdEl0ZW0uU2VyaWFsaXplZDtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAoaXRlbTogUmVhZG9ubHk8SW50ZXJuYWxUZXN0SXRlbT4pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0ZXhwYW5kOiBpdGVtLmV4cGFuZCxcblx0XHRpdGVtOiBJVGVzdEl0ZW0uc2VyaWFsaXplKGl0ZW0uaXRlbSlcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBJbnRlcm5hbFRlc3RJdGVtID0+ICh7XG5cdFx0Ly8gdGhlIGBjb250cm9sbGVySWRgIGlzIGRlcml2ZWQgZnJvbSB0aGUgdGVzdC5pdGVtLmV4dElkLiBJdCdzIHJlZHVuZGFudFxuXHRcdC8vIGluIHRoZSBub24tc2VyaWFsaXplZCBJbnRlcm5hbFRlc3RJdGVtIHRvbywgYnV0IHRoZXJlIGp1c3QgYmVjYXVzZSBpdCdzXG5cdFx0Ly8gY2hlY2tlZCBhZ2FpbnN0IGluIG1hbnkgaG90IHBhdGhzLlxuXHRcdGNvbnRyb2xsZXJJZDogVGVzdElkLnJvb3Qoc2VyaWFsaXplZC5pdGVtLmV4dElkKSxcblx0XHRleHBhbmQ6IHNlcmlhbGl6ZWQuZXhwYW5kLFxuXHRcdGl0ZW06IElUZXN0SXRlbS5kZXNlcmlhbGl6ZSh1cmlJZGVudGl0eSwgc2VyaWFsaXplZC5pdGVtKVxuXHR9KTtcbn1cblxuLyoqXG4gKiBBIHBhcnRpYWwgdXBkYXRlIG1hZGUgdG8gYW4gZXhpc3RpbmcgSW50ZXJuYWxUZXN0SXRlbS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1VcGRhdGUge1xuXHRleHRJZDogc3RyaW5nO1xuXHRleHBhbmQ/OiBUZXN0SXRlbUV4cGFuZFN0YXRlO1xuXHRpdGVtPzogUGFydGlhbDxJVGVzdEl0ZW0+O1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElUZXN0SXRlbVVwZGF0ZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0ZXh0SWQ6IHN0cmluZztcblx0XHRleHBhbmQ/OiBUZXN0SXRlbUV4cGFuZFN0YXRlO1xuXHRcdGl0ZW0/OiBQYXJ0aWFsPElUZXN0SXRlbS5TZXJpYWxpemVkPjtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAodTogUmVhZG9ubHk8SVRlc3RJdGVtVXBkYXRlPik6IFNlcmlhbGl6ZWQgPT4ge1xuXHRcdGxldCBpdGVtOiBQYXJ0aWFsPElUZXN0SXRlbS5TZXJpYWxpemVkPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodS5pdGVtKSB7XG5cdFx0XHRpdGVtID0ge307XG5cdFx0XHRpZiAodS5pdGVtLmxhYmVsICE9PSB1bmRlZmluZWQpIHsgaXRlbS5sYWJlbCA9IHUuaXRlbS5sYWJlbDsgfVxuXHRcdFx0aWYgKHUuaXRlbS50YWdzICE9PSB1bmRlZmluZWQpIHsgaXRlbS50YWdzID0gdS5pdGVtLnRhZ3M7IH1cblx0XHRcdGlmICh1Lml0ZW0uYnVzeSAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uYnVzeSA9IHUuaXRlbS5idXN5OyB9XG5cdFx0XHRpZiAodS5pdGVtLnVyaSAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0udXJpID0gdS5pdGVtLnVyaT8udG9KU09OKCk7IH1cblx0XHRcdGlmICh1Lml0ZW0ucmFuZ2UgIT09IHVuZGVmaW5lZCkgeyBpdGVtLnJhbmdlID0gdS5pdGVtLnJhbmdlPy50b0pTT04oKTsgfVxuXHRcdFx0aWYgKHUuaXRlbS5kZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uZGVzY3JpcHRpb24gPSB1Lml0ZW0uZGVzY3JpcHRpb247IH1cblx0XHRcdGlmICh1Lml0ZW0uZXJyb3IgIT09IHVuZGVmaW5lZCkgeyBpdGVtLmVycm9yID0gdS5pdGVtLmVycm9yOyB9XG5cdFx0XHRpZiAodS5pdGVtLnNvcnRUZXh0ICE9PSB1bmRlZmluZWQpIHsgaXRlbS5zb3J0VGV4dCA9IHUuaXRlbS5zb3J0VGV4dDsgfVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4dElkOiB1LmV4dElkLCBleHBhbmQ6IHUuZXhwYW5kLCBpdGVtIH07XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHU6IFNlcmlhbGl6ZWQpOiBJVGVzdEl0ZW1VcGRhdGUgPT4ge1xuXHRcdGxldCBpdGVtOiBQYXJ0aWFsPElUZXN0SXRlbT4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHUuaXRlbSkge1xuXHRcdFx0aXRlbSA9IHt9O1xuXHRcdFx0aWYgKHUuaXRlbS5sYWJlbCAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0ubGFiZWwgPSB1Lml0ZW0ubGFiZWw7IH1cblx0XHRcdGlmICh1Lml0ZW0udGFncyAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0udGFncyA9IHUuaXRlbS50YWdzOyB9XG5cdFx0XHRpZiAodS5pdGVtLmJ1c3kgIT09IHVuZGVmaW5lZCkgeyBpdGVtLmJ1c3kgPSB1Lml0ZW0uYnVzeTsgfVxuXHRcdFx0aWYgKHUuaXRlbS5yYW5nZSAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0ucmFuZ2UgPSB1Lml0ZW0ucmFuZ2UgPyBSYW5nZS5saWZ0KHUuaXRlbS5yYW5nZSkgOiBudWxsOyB9XG5cdFx0XHRpZiAodS5pdGVtLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQpIHsgaXRlbS5kZXNjcmlwdGlvbiA9IHUuaXRlbS5kZXNjcmlwdGlvbjsgfVxuXHRcdFx0aWYgKHUuaXRlbS5lcnJvciAhPT0gdW5kZWZpbmVkKSB7IGl0ZW0uZXJyb3IgPSB1Lml0ZW0uZXJyb3I7IH1cblx0XHRcdGlmICh1Lml0ZW0uc29ydFRleHQgIT09IHVuZGVmaW5lZCkgeyBpdGVtLnNvcnRUZXh0ID0gdS5pdGVtLnNvcnRUZXh0OyB9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZXh0SWQ6IHUuZXh0SWQsIGV4cGFuZDogdS5leHBhbmQsIGl0ZW0gfTtcblx0fTtcblxufVxuXG5leHBvcnQgY29uc3QgYXBwbHlUZXN0SXRlbVVwZGF0ZSA9IChpbnRlcm5hbDogSW50ZXJuYWxUZXN0SXRlbSB8IElUZXN0SXRlbVVwZGF0ZSwgcGF0Y2g6IElUZXN0SXRlbVVwZGF0ZSkgPT4ge1xuXHRpZiAocGF0Y2guZXhwYW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRpbnRlcm5hbC5leHBhbmQgPSBwYXRjaC5leHBhbmQ7XG5cdH1cblx0aWYgKHBhdGNoLml0ZW0gIT09IHVuZGVmaW5lZCkge1xuXHRcdGludGVybmFsLml0ZW0gPSBpbnRlcm5hbC5pdGVtID8gT2JqZWN0LmFzc2lnbihpbnRlcm5hbC5pdGVtLCBwYXRjaC5pdGVtKSA6IHBhdGNoLml0ZW07XG5cdH1cbn07XG5cbi8qKiBSZXF1ZXN0IHRvIGFuIGV4dCBob3N0IHRvIGdldCBmb2xsb3d1cCBtZXNzYWdlcyBmb3IgYSB0ZXN0IGZhaWx1cmUuICovXG5leHBvcnQgaW50ZXJmYWNlIFRlc3RNZXNzYWdlRm9sbG93dXBSZXF1ZXN0IHtcblx0cmVzdWx0SWQ6IHN0cmluZztcblx0ZXh0SWQ6IHN0cmluZztcblx0dGFza0luZGV4OiBudW1iZXI7XG5cdG1lc3NhZ2VJbmRleDogbnVtYmVyO1xufVxuXG4vKiogUmVxdWVzdCB0byBhbiBleHQgaG9zdCB0byBnZXQgZm9sbG93dXAgbWVzc2FnZXMgZm9yIGEgdGVzdCBmYWlsdXJlLiAqL1xuZXhwb3J0IGludGVyZmFjZSBUZXN0TWVzc2FnZUZvbGxvd3VwUmVzcG9uc2Uge1xuXHRpZDogbnVtYmVyO1xuXHR0aXRsZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRlc3QgcmVzdWx0IGl0ZW0gdXNlZCBpbiB0aGUgbWFpbiB0aHJlYWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVGVzdFJlc3VsdEl0ZW0gZXh0ZW5kcyBJbnRlcm5hbFRlc3RJdGVtIHtcblx0LyoqIFN0YXRlIG9mIHRoaXMgdGVzdCBpbiB2YXJpb3VzIHRhc2tzICovXG5cdHRhc2tzOiBJVGVzdFRhc2tTdGF0ZVtdO1xuXHQvKiogU3RhdGUgb2YgdGhpcyB0ZXN0IGFzIGEgY29tcHV0YXRpb24gb2YgaXRzIHRhc2tzICovXG5cdG93bkNvbXB1dGVkU3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTtcblx0LyoqIENvbXB1dGVkIHN0YXRlIGJhc2VkIG9uIGNoaWxkcmVuICovXG5cdGNvbXB1dGVkU3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTtcblx0LyoqIE1heCBkdXJhdGlvbiBvZiB0aGUgaXRlbSdzIHRhc2tzIChpZiBydW4gZGlyZWN0bHkpICovXG5cdG93bkR1cmF0aW9uPzogbnVtYmVyO1xuXHQvKiogV2hldGhlciB0aGlzIHRlc3QgaXRlbSBpcyBvdXRkYXRlZCAqL1xuXHRyZXRpcmVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0UmVzdWx0SXRlbSB7XG5cdC8qKlxuXHQgKiBTZXJpYWxpemVkIHZlcnNpb24gb2YgdGhlIFRlc3RSZXN1bHRJdGVtLiBOb3RlIHRoYXQgJ3JldGlyZWQnIGlzIG5vdFxuXHQgKiBpbmNsdWRlZCBzaW5jZSBhbGwgaHlkcmF0ZWQgaXRlbXMgYXJlIGF1dG9tYXRpY2FsbHkgcmV0aXJlZC5cblx0ICovXG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCBleHRlbmRzIEludGVybmFsVGVzdEl0ZW0uU2VyaWFsaXplZCB7XG5cdFx0dGFza3M6IElUZXN0VGFza1N0YXRlLlNlcmlhbGl6ZWRbXTtcblx0XHRvd25Db21wdXRlZFN0YXRlOiBUZXN0UmVzdWx0U3RhdGU7XG5cdFx0Y29tcHV0ZWRTdGF0ZTogVGVzdFJlc3VsdFN0YXRlO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZVdpdGhvdXRNZXNzYWdlcyA9IChvcmlnaW5hbDogVGVzdFJlc3VsdEl0ZW0pOiBTZXJpYWxpemVkID0+ICh7XG5cdFx0Li4uSW50ZXJuYWxUZXN0SXRlbS5zZXJpYWxpemUob3JpZ2luYWwpLFxuXHRcdG93bkNvbXB1dGVkU3RhdGU6IG9yaWdpbmFsLm93bkNvbXB1dGVkU3RhdGUsXG5cdFx0Y29tcHV0ZWRTdGF0ZTogb3JpZ2luYWwuY29tcHV0ZWRTdGF0ZSxcblx0XHR0YXNrczogb3JpZ2luYWwudGFza3MubWFwKElUZXN0VGFza1N0YXRlLnNlcmlhbGl6ZVdpdGhvdXRNZXNzYWdlcyksXG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAob3JpZ2luYWw6IFJlYWRvbmx5PFRlc3RSZXN1bHRJdGVtPik6IFNlcmlhbGl6ZWQgPT4gKHtcblx0XHQuLi5JbnRlcm5hbFRlc3RJdGVtLnNlcmlhbGl6ZShvcmlnaW5hbCksXG5cdFx0b3duQ29tcHV0ZWRTdGF0ZTogb3JpZ2luYWwub3duQ29tcHV0ZWRTdGF0ZSxcblx0XHRjb21wdXRlZFN0YXRlOiBvcmlnaW5hbC5jb21wdXRlZFN0YXRlLFxuXHRcdHRhc2tzOiBvcmlnaW5hbC50YXNrcy5tYXAoSVRlc3RUYXNrU3RhdGUuc2VyaWFsaXplKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBUZXN0UmVzdWx0SXRlbSA9PiAoe1xuXHRcdC4uLkludGVybmFsVGVzdEl0ZW0uZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIHNlcmlhbGl6ZWQpLFxuXHRcdG93bkNvbXB1dGVkU3RhdGU6IHNlcmlhbGl6ZWQub3duQ29tcHV0ZWRTdGF0ZSxcblx0XHRjb21wdXRlZFN0YXRlOiBzZXJpYWxpemVkLmNvbXB1dGVkU3RhdGUsXG5cdFx0dGFza3M6IHNlcmlhbGl6ZWQudGFza3MubWFwKG0gPT4gSVRlc3RUYXNrU3RhdGUuZGVzZXJpYWxpemUodXJpSWRlbnRpdHksIG0pKSxcblx0XHRyZXRpcmVkOiB0cnVlLFxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHtcblx0LyoqIElEIG9mIHRoZXNlIHRlc3QgcmVzdWx0cyAqL1xuXHRpZDogc3RyaW5nO1xuXHQvKiogVGltZSB0aGUgcmVzdWx0cyB3ZXJlIGNvbXBlbHRlZCAqL1xuXHRjb21wbGV0ZWRBdDogbnVtYmVyO1xuXHQvKiogU3Vic2V0IG9mIHRlc3QgcmVzdWx0IGl0ZW1zICovXG5cdGl0ZW1zOiBUZXN0UmVzdWx0SXRlbS5TZXJpYWxpemVkW107XG5cdC8qKiBUYXNrcyBpbnZvbHZlZCBpbiB0aGUgcnVuLiAqL1xuXHR0YXNrczogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGN0cmxJZDogc3RyaW5nOyBoYXNDb3ZlcmFnZTogYm9vbGVhbiB9W107XG5cdC8qKiBIdW1hbi1yZWFkYWJsZSBuYW1lIG9mIHRoZSB0ZXN0IHJ1bi4gKi9cblx0bmFtZTogc3RyaW5nO1xuXHQvKiogVGVzdCB0cmlnZ2VyIGluZm9ybWF0b24gKi9cblx0cmVxdWVzdDogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdENvdmVyYWdlIHtcblx0ZmlsZXM6IElGaWxlQ292ZXJhZ2VbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ292ZXJhZ2VDb3VudCB7XG5cdGNvdmVyZWQ6IG51bWJlcjtcblx0dG90YWw6IG51bWJlcjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJQ292ZXJhZ2VDb3VudCB7XG5cdGV4cG9ydCBjb25zdCBlbXB0eSA9ICgpOiBJQ292ZXJhZ2VDb3VudCA9PiAoeyBjb3ZlcmVkOiAwLCB0b3RhbDogMCB9KTtcblx0ZXhwb3J0IGNvbnN0IHN1bSA9ICh0YXJnZXQ6IElDb3ZlcmFnZUNvdW50LCBzcmM6IFJlYWRvbmx5PElDb3ZlcmFnZUNvdW50PikgPT4ge1xuXHRcdHRhcmdldC5jb3ZlcmVkICs9IHNyYy5jb3ZlcmVkO1xuXHRcdHRhcmdldC50b3RhbCArPSBzcmMudG90YWw7XG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVDb3ZlcmFnZSB7XG5cdGlkOiBzdHJpbmc7XG5cdHVyaTogVVJJO1xuXHR0ZXN0SWRzPzogc3RyaW5nW107XG5cdHN0YXRlbWVudDogSUNvdmVyYWdlQ291bnQ7XG5cdGJyYW5jaD86IElDb3ZlcmFnZUNvdW50O1xuXHRkZWNsYXJhdGlvbj86IElDb3ZlcmFnZUNvdW50O1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElGaWxlQ292ZXJhZ2Uge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0dXJpOiBVcmlDb21wb25lbnRzO1xuXHRcdHRlc3RJZHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdHN0YXRlbWVudDogSUNvdmVyYWdlQ291bnQ7XG5cdFx0YnJhbmNoPzogSUNvdmVyYWdlQ291bnQ7XG5cdFx0ZGVjbGFyYXRpb24/OiBJQ292ZXJhZ2VDb3VudDtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemUgPSAob3JpZ2luYWw6IFJlYWRvbmx5PElGaWxlQ292ZXJhZ2U+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdGlkOiBvcmlnaW5hbC5pZCxcblx0XHRzdGF0ZW1lbnQ6IG9yaWdpbmFsLnN0YXRlbWVudCxcblx0XHRicmFuY2g6IG9yaWdpbmFsLmJyYW5jaCxcblx0XHRkZWNsYXJhdGlvbjogb3JpZ2luYWwuZGVjbGFyYXRpb24sXG5cdFx0dGVzdElkczogb3JpZ2luYWwudGVzdElkcyxcblx0XHR1cmk6IG9yaWdpbmFsLnVyaS50b0pTT04oKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHVyaUlkZW50aXR5OiBJVGVzdFVyaUNhbm9uaWNhbGl6ZXIsIHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBJRmlsZUNvdmVyYWdlID0+ICh7XG5cdFx0aWQ6IHNlcmlhbGl6ZWQuaWQsXG5cdFx0c3RhdGVtZW50OiBzZXJpYWxpemVkLnN0YXRlbWVudCxcblx0XHRicmFuY2g6IHNlcmlhbGl6ZWQuYnJhbmNoLFxuXHRcdGRlY2xhcmF0aW9uOiBzZXJpYWxpemVkLmRlY2xhcmF0aW9uLFxuXHRcdHRlc3RJZHM6IHNlcmlhbGl6ZWQudGVzdElkcyxcblx0XHR1cmk6IHVyaUlkZW50aXR5LmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUoc2VyaWFsaXplZC51cmkpKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGVtcHR5ID0gKGlkOiBzdHJpbmcsIHVyaTogVVJJKTogSUZpbGVDb3ZlcmFnZSA9PiAoe1xuXHRcdGlkLFxuXHRcdHVyaSxcblx0XHRzdGF0ZW1lbnQ6IElDb3ZlcmFnZUNvdW50LmVtcHR5KCksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVUaGluZ1dpdGhMb2NhdGlvbjxUIGV4dGVuZHMgeyBsb2NhdGlvbj86IFJhbmdlIHwgUG9zaXRpb24gfT4oc2VyaWFsaXplZDogVCk6IFQgJiB7IGxvY2F0aW9uPzogSVJhbmdlIHwgSVBvc2l0aW9uIH0ge1xuXHRyZXR1cm4ge1xuXHRcdC4uLnNlcmlhbGl6ZWQsXG5cdFx0bG9jYXRpb246IHNlcmlhbGl6ZWQubG9jYXRpb24/LnRvSlNPTigpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uPFQgZXh0ZW5kcyB7IGxvY2F0aW9uPzogSVJhbmdlIHwgSVBvc2l0aW9uIH0+KHNlcmlhbGl6ZWQ6IFQpOiBUICYgeyBsb2NhdGlvbj86IFJhbmdlIHwgUG9zaXRpb24gfSB7XG5cdHNlcmlhbGl6ZWQubG9jYXRpb24gPSBzZXJpYWxpemVkLmxvY2F0aW9uID8gKFBvc2l0aW9uLmlzSVBvc2l0aW9uKHNlcmlhbGl6ZWQubG9jYXRpb24pID8gUG9zaXRpb24ubGlmdChzZXJpYWxpemVkLmxvY2F0aW9uKSA6IFJhbmdlLmxpZnQoc2VyaWFsaXplZC5sb2NhdGlvbikpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4gc2VyaWFsaXplZCBhcyBUICYgeyBsb2NhdGlvbj86IFJhbmdlIHwgUG9zaXRpb24gfTtcbn1cblxuLyoqIE51bWJlciBvZiByZWNlbnQgcnVucyBpbiB3aGljaCBjb3ZlcmFnZSByZXBvcnRzIHNob3VsZCBiZSByZXRhaW5lZC4gKi9cbmV4cG9ydCBjb25zdCBLRUVQX05fTEFTVF9DT1ZFUkFHRV9SRVBPUlRTID0gMztcblxuZXhwb3J0IGNvbnN0IGVudW0gRGV0YWlsVHlwZSB7XG5cdERlY2xhcmF0aW9uLFxuXHRTdGF0ZW1lbnQsXG5cdEJyYW5jaCxcbn1cblxuZXhwb3J0IHR5cGUgQ292ZXJhZ2VEZXRhaWxzID0gSURlY2xhcmF0aW9uQ292ZXJhZ2UgfCBJU3RhdGVtZW50Q292ZXJhZ2U7XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ292ZXJhZ2VEZXRhaWxzIHtcblx0ZXhwb3J0IHR5cGUgU2VyaWFsaXplZCA9IElEZWNsYXJhdGlvbkNvdmVyYWdlLlNlcmlhbGl6ZWQgfCBJU3RhdGVtZW50Q292ZXJhZ2UuU2VyaWFsaXplZDtcblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKG9yaWdpbmFsOiBSZWFkb25seTxDb3ZlcmFnZURldGFpbHM+KTogU2VyaWFsaXplZCA9PlxuXHRcdG9yaWdpbmFsLnR5cGUgPT09IERldGFpbFR5cGUuRGVjbGFyYXRpb24gPyBJRGVjbGFyYXRpb25Db3ZlcmFnZS5zZXJpYWxpemUob3JpZ2luYWwpIDogSVN0YXRlbWVudENvdmVyYWdlLnNlcmlhbGl6ZShvcmlnaW5hbCk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBDb3ZlcmFnZURldGFpbHMgPT5cblx0XHRzZXJpYWxpemVkLnR5cGUgPT09IERldGFpbFR5cGUuRGVjbGFyYXRpb24gPyBJRGVjbGFyYXRpb25Db3ZlcmFnZS5kZXNlcmlhbGl6ZShzZXJpYWxpemVkKSA6IElTdGF0ZW1lbnRDb3ZlcmFnZS5kZXNlcmlhbGl6ZShzZXJpYWxpemVkKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJhbmNoQ292ZXJhZ2Uge1xuXHRjb3VudDogbnVtYmVyIHwgYm9vbGVhbjtcblx0bGFiZWw/OiBzdHJpbmc7XG5cdGxvY2F0aW9uPzogUmFuZ2UgfCBQb3NpdGlvbjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJQnJhbmNoQ292ZXJhZ2Uge1xuXHRleHBvcnQgaW50ZXJmYWNlIFNlcmlhbGl6ZWQge1xuXHRcdGNvdW50OiBudW1iZXIgfCBib29sZWFuO1xuXHRcdGxhYmVsPzogc3RyaW5nO1xuXHRcdGxvY2F0aW9uPzogSVJhbmdlIHwgSVBvc2l0aW9uO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNlcmlhbGl6ZTogKG9yaWdpbmFsOiBJQnJhbmNoQ292ZXJhZ2UpID0+IFNlcmlhbGl6ZWQgPSBzZXJpYWxpemVUaGluZ1dpdGhMb2NhdGlvbjtcblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplOiAob3JpZ2luYWw6IFNlcmlhbGl6ZWQpID0+IElCcmFuY2hDb3ZlcmFnZSA9IGRlc2VyaWFsaXplVGhpbmdXaXRoTG9jYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlY2xhcmF0aW9uQ292ZXJhZ2Uge1xuXHR0eXBlOiBEZXRhaWxUeXBlLkRlY2xhcmF0aW9uO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXIgfCBib29sZWFuO1xuXHRsb2NhdGlvbjogUmFuZ2UgfCBQb3NpdGlvbjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJRGVjbGFyYXRpb25Db3ZlcmFnZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0dHlwZTogRGV0YWlsVHlwZS5EZWNsYXJhdGlvbjtcblx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0Y291bnQ6IG51bWJlciB8IGJvb2xlYW47XG5cdFx0bG9jYXRpb246IElSYW5nZSB8IElQb3NpdGlvbjtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBzZXJpYWxpemU6IChvcmlnaW5hbDogSURlY2xhcmF0aW9uQ292ZXJhZ2UpID0+IFNlcmlhbGl6ZWQgPSBzZXJpYWxpemVUaGluZ1dpdGhMb2NhdGlvbjtcblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplOiAob3JpZ2luYWw6IFNlcmlhbGl6ZWQpID0+IElEZWNsYXJhdGlvbkNvdmVyYWdlID0gZGVzZXJpYWxpemVUaGluZ1dpdGhMb2NhdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RhdGVtZW50Q292ZXJhZ2Uge1xuXHR0eXBlOiBEZXRhaWxUeXBlLlN0YXRlbWVudDtcblx0Y291bnQ6IG51bWJlciB8IGJvb2xlYW47XG5cdGxvY2F0aW9uOiBSYW5nZSB8IFBvc2l0aW9uO1xuXHRicmFuY2hlcz86IElCcmFuY2hDb3ZlcmFnZVtdO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElTdGF0ZW1lbnRDb3ZlcmFnZSB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU2VyaWFsaXplZCB7XG5cdFx0dHlwZTogRGV0YWlsVHlwZS5TdGF0ZW1lbnQ7XG5cdFx0Y291bnQ6IG51bWJlciB8IGJvb2xlYW47XG5cdFx0bG9jYXRpb246IElSYW5nZSB8IElQb3NpdGlvbjtcblx0XHRicmFuY2hlcz86IElCcmFuY2hDb3ZlcmFnZS5TZXJpYWxpemVkW107XG5cdH1cblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKG9yaWdpbmFsOiBSZWFkb25seTxJU3RhdGVtZW50Q292ZXJhZ2U+KTogU2VyaWFsaXplZCA9PiAoe1xuXHRcdC4uLnNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uKG9yaWdpbmFsKSxcblx0XHRicmFuY2hlczogb3JpZ2luYWwuYnJhbmNoZXM/Lm1hcChJQnJhbmNoQ292ZXJhZ2Uuc2VyaWFsaXplKSxcblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IGRlc2VyaWFsaXplID0gKHNlcmlhbGl6ZWQ6IFNlcmlhbGl6ZWQpOiBJU3RhdGVtZW50Q292ZXJhZ2UgPT4gKHtcblx0XHQuLi5kZXNlcmlhbGl6ZVRoaW5nV2l0aExvY2F0aW9uKHNlcmlhbGl6ZWQpLFxuXHRcdGJyYW5jaGVzOiBzZXJpYWxpemVkLmJyYW5jaGVzPy5tYXAoSUJyYW5jaENvdmVyYWdlLmRlc2VyaWFsaXplKSxcblx0fSk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3REaWZmT3BUeXBlIHtcblx0LyoqIEFkZHMgYSBuZXcgdGVzdCAod2l0aCBjaGlsZHJlbikgKi9cblx0QWRkLFxuXHQvKiogU2hhbGxvdy11cGRhdGVzIGFuIGV4aXN0aW5nIHRlc3QgKi9cblx0VXBkYXRlLFxuXHQvKiogUmFuZ2VzIG9mIHNvbWUgdGVzdHMgaW4gYSBkb2N1bWVudCB3ZXJlIHN5bmNlZCwgc28gaXQgc2hvdWxkIGJlIGNvbnNpZGVyZWQgdXAtdG8tZGF0ZSAqL1xuXHREb2N1bWVudFN5bmNlZCxcblx0LyoqIFJlbW92ZXMgYSB0ZXN0IChhbmQgYWxsIGl0cyBjaGlsZHJlbikgKi9cblx0UmVtb3ZlLFxuXHQvKiogQ2hhbmdlcyB0aGUgbnVtYmVyIG9mIGNvbnRyb2xsZXJzIHdobyBhcmUgeWV0IHRvIHB1Ymxpc2ggdGhlaXIgY29sbGVjdGlvbiByb290cy4gKi9cblx0SW5jcmVtZW50UGVuZGluZ0V4dEhvc3RzLFxuXHQvKiogUmV0aXJlcyBhIHRlc3QvcmVzdWx0ICovXG5cdFJldGlyZSxcblx0LyoqIEFkZCBhIG5ldyB0ZXN0IHRhZyAqL1xuXHRBZGRUYWcsXG5cdC8qKiBSZW1vdmUgYSB0ZXN0IHRhZyAqL1xuXHRSZW1vdmVUYWcsXG59XG5cbmV4cG9ydCB0eXBlIFRlc3RzRGlmZk9wID1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5BZGQ7IGl0ZW06IEludGVybmFsVGVzdEl0ZW0gfVxuXHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlVwZGF0ZTsgaXRlbTogSVRlc3RJdGVtVXBkYXRlIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmU7IGl0ZW1JZDogc3RyaW5nIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZXRpcmU7IGl0ZW1JZDogc3RyaW5nIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5JbmNyZW1lbnRQZW5kaW5nRXh0SG9zdHM7IGFtb3VudDogbnVtYmVyIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5BZGRUYWc7IHRhZzogSVRlc3RUYWdEaXNwbGF5SW5mbyB9XG5cdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuUmVtb3ZlVGFnOyBpZDogc3RyaW5nIH1cblx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5Eb2N1bWVudFN5bmNlZDsgdXJpOiBVUkk7IGRvY3Y/OiBudW1iZXIgfTtcblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0c0RpZmZPcCB7XG5cdGV4cG9ydCB0eXBlIFNlcmlhbGl6ZWQgPVxuXHRcdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuQWRkOyBpdGVtOiBJbnRlcm5hbFRlc3RJdGVtLlNlcmlhbGl6ZWQgfVxuXHRcdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuVXBkYXRlOyBpdGVtOiBJVGVzdEl0ZW1VcGRhdGUuU2VyaWFsaXplZCB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmU7IGl0ZW1JZDogc3RyaW5nIH1cblx0XHR8IHsgb3A6IFRlc3REaWZmT3BUeXBlLlJldGlyZTsgaXRlbUlkOiBzdHJpbmcgfVxuXHRcdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuSW5jcmVtZW50UGVuZGluZ0V4dEhvc3RzOyBhbW91bnQ6IG51bWJlciB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5BZGRUYWc7IHRhZzogSVRlc3RUYWdEaXNwbGF5SW5mbyB9XG5cdFx0fCB7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmVUYWc7IGlkOiBzdHJpbmcgfVxuXHRcdHwgeyBvcDogVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQ7IHVyaTogVXJpQ29tcG9uZW50czsgZG9jdj86IG51bWJlciB9O1xuXG5cdGV4cG9ydCBjb25zdCBkZXNlcmlhbGl6ZSA9ICh1cmlJZGVudGl0eTogSVRlc3RVcmlDYW5vbmljYWxpemVyLCB1OiBTZXJpYWxpemVkKTogVGVzdHNEaWZmT3AgPT4ge1xuXHRcdGlmICh1Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5BZGQpIHtcblx0XHRcdHJldHVybiB7IG9wOiB1Lm9wLCBpdGVtOiBJbnRlcm5hbFRlc3RJdGVtLmRlc2VyaWFsaXplKHVyaUlkZW50aXR5LCB1Lml0ZW0pIH07XG5cdFx0fSBlbHNlIGlmICh1Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5VcGRhdGUpIHtcblx0XHRcdHJldHVybiB7IG9wOiB1Lm9wLCBpdGVtOiBJVGVzdEl0ZW1VcGRhdGUuZGVzZXJpYWxpemUodS5pdGVtKSB9O1xuXHRcdH0gZWxzZSBpZiAodS5vcCA9PT0gVGVzdERpZmZPcFR5cGUuRG9jdW1lbnRTeW5jZWQpIHtcblx0XHRcdHJldHVybiB7IG9wOiB1Lm9wLCB1cmk6IHVyaUlkZW50aXR5LmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUodS51cmkpKSwgZG9jdjogdS5kb2N2IH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1O1xuXHRcdH1cblx0fTtcblxuXHRleHBvcnQgY29uc3Qgc2VyaWFsaXplID0gKHU6IFJlYWRvbmx5PFRlc3RzRGlmZk9wPik6IFNlcmlhbGl6ZWQgPT4ge1xuXHRcdGlmICh1Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5BZGQpIHtcblx0XHRcdHJldHVybiB7IG9wOiB1Lm9wLCBpdGVtOiBJbnRlcm5hbFRlc3RJdGVtLnNlcmlhbGl6ZSh1Lml0ZW0pIH07XG5cdFx0fSBlbHNlIGlmICh1Lm9wID09PSBUZXN0RGlmZk9wVHlwZS5VcGRhdGUpIHtcblx0XHRcdHJldHVybiB7IG9wOiB1Lm9wLCBpdGVtOiBJVGVzdEl0ZW1VcGRhdGUuc2VyaWFsaXplKHUuaXRlbSkgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHU7XG5cdFx0fVxuXHR9O1xufVxuXG4vKipcbiAqIENvbnRleHQgZm9yIGFjdGlvbnMgdGFrZW4gaW4gdGhlIHRlc3QgZXhwbG9yZXIgdmlldy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVzdEl0ZW1Db250ZXh0IHtcblx0LyoqIE1hcnNoYWxsaW5nIG1hcmtlciAqL1xuXHQkbWlkOiBNYXJzaGFsbGVkSWQuVGVzdEl0ZW1Db250ZXh0O1xuXHQvKiogVGVzdHMgYW5kIHBhcmVudHMgZnJvbSB0aGUgcm9vdCB0byB0aGUgY3VycmVudCBpdGVtcyAqL1xuXHR0ZXN0czogSW50ZXJuYWxUZXN0SXRlbS5TZXJpYWxpemVkW107XG59XG5cbi8qKlxuICogQ29udGV4dCBmb3IgYWN0aW9ucyB0YWtlbiBpbiB0aGUgdGVzdCBleHBsb3JlciB2aWV3LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXN0TWVzc2FnZU1lbnVBcmdzIHtcblx0LyoqIE1hcnNoYWxsaW5nIG1hcmtlciAqL1xuXHQkbWlkOiBNYXJzaGFsbGVkSWQuVGVzdE1lc3NhZ2VNZW51QXJncztcblx0LyoqIFRlc3RzIGV4dCBJRCAqL1xuXHR0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtLlNlcmlhbGl6ZWQ7XG5cdC8qKiBTZXJpYWxpemVkIHRlc3QgbWVzc2FnZSAqL1xuXHRtZXNzYWdlOiBJVGVzdE1lc3NhZ2UuU2VyaWFsaXplZDtcbn1cblxuLyoqXG4gKiBSZXF1ZXN0IGZyb20gdGhlIGV4dCBob3N0IG9yIG1haW4gdGhyZWFkIHRvIGluZGljYXRlIHRoYXQgdGVzdHMgaGF2ZVxuICogY2hhbmdlZC4gSXQncyBhc3N1bWVkIHRoYXQgYW55IGl0ZW0gdXBzZXJ0ZWQgKm11c3QqIGhhdmUgaXRzIGNoaWxkcmVuXG4gKiBwcmV2aW91c2x5IGFsc28gdXBzZXJ0ZWQsIG9yIHVwc2VydGVkIGFzIHBhcnQgb2YgdGhlIHNhbWUgb3BlcmF0aW9uLlxuICogQ2hpbGRyZW4gdGhhdCBubyBsb25nZXIgZXhpc3QgaW4gYW4gdXBzZXJ0ZWQgaXRlbSB3aWxsIGJlIHJlbW92ZWQuXG4gKi9cbmV4cG9ydCB0eXBlIFRlc3RzRGlmZiA9IFRlc3RzRGlmZk9wW107XG5cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSBleHRlbmRzIEludGVybmFsVGVzdEl0ZW0ge1xuXHRjaGlsZHJlbjogU2V0PHN0cmluZz47XG59XG5cbi8qKlxuICogVGhlIEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yIGlzIHVzZWQgaW4gdGhlIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25cbiAqIGFuZCBjYWxsZWQgd2l0aCBkaWZmIGNoYW5nZXMgYXMgdGhleSdyZSBhcHBsaWVkLiBUaGlzIGlzIHVzZWQgaW4gdGhlXG4gKiBleHQgaG9zdCB0byBjcmVhdGUgYSBjb2hlc2l2ZSBjaGFuZ2UgZXZlbnQgZnJvbSBhIGRpZmYuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3I8VD4ge1xuXHQvKipcblx0ICogQSBub2RlIHdhcyBhZGRlZC5cblx0ICovXG5cdGFkZD8obm9kZTogVCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEEgbm9kZSBpbiB0aGUgY29sbGVjdGlvbiB3YXMgdXBkYXRlZC5cblx0ICovXG5cdHVwZGF0ZT8obm9kZTogVCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEEgbm9kZSB3YXMgcmVtb3ZlZC5cblx0ICovXG5cdHJlbW92ZT8obm9kZTogVCwgaXNOZXN0ZWRPcGVyYXRpb246IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgZGlmZiBoYXMgYmVlbiBhcHBsaWVkLlxuXHQgKi9cblx0Y29tcGxldGU/KCk6IHZvaWQ7XG59XG5cbi8qKlxuICogTWFpbnRhaW5zIHRlc3RzIGluIHRoaXMgZXh0ZW5zaW9uIGhvc3Qgc2VudCBmcm9tIHRoZSBtYWluIHRocmVhZC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbjxUIGV4dGVuZHMgSW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbkl0ZW0+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFncyA9IG5ldyBNYXA8c3RyaW5nLCBJVGVzdFRhZ0Rpc3BsYXlJbmZvPigpO1xuXG5cdC8qKlxuXHQgKiBNYXAgb2YgaXRlbSBJRHMgdG8gdGVzdCBpdGVtIG9iamVjdHMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgaXRlbXMgPSBuZXcgTWFwPHN0cmluZywgVD4oKTtcblxuXHQvKipcblx0ICogSUQgb2YgdGVzdCByb290IGl0ZW1zLlxuXHQgKi9cblx0cHJvdGVjdGVkIHJlYWRvbmx5IHJvb3RzID0gbmV3IFNldDxUPigpO1xuXG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgJ2J1c3knIGNvbnRyb2xsZXJzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGJ1c3lDb250cm9sbGVyQ291bnQgPSAwO1xuXG5cdC8qKlxuXHQgKiBOdW1iZXIgb2YgcGVuZGluZyByb290cy5cblx0ICovXG5cdHByb3RlY3RlZCBwZW5kaW5nUm9vdENvdW50ID0gMDtcblxuXHQvKipcblx0ICogS25vd24gdGVzdCB0YWdzLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHRhZ3M6IFJlYWRvbmx5TWFwPHN0cmluZywgSVRlc3RUYWdEaXNwbGF5SW5mbz4gPSB0aGlzLl90YWdzO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHk6IElUZXN0VXJpQ2Fub25pY2FsaXplcikgeyB9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIGRpZmYgdG8gdGhlIGNvbGxlY3Rpb24uXG5cdCAqL1xuXHRwdWJsaWMgYXBwbHkoZGlmZjogVGVzdHNEaWZmKSB7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuY3JlYXRlQ2hhbmdlQ29sbGVjdG9yKCk7XG5cblx0XHRmb3IgKGNvbnN0IG9wIG9mIGRpZmYpIHtcblx0XHRcdHN3aXRjaCAob3Aub3ApIHtcblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5BZGQ6XG5cdFx0XHRcdFx0dGhpcy5hZGQoSW50ZXJuYWxUZXN0SXRlbS5kZXNlcmlhbGl6ZSh0aGlzLnVyaUlkZW50aXR5LCBvcC5pdGVtKSwgY2hhbmdlcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5VcGRhdGU6XG5cdFx0XHRcdFx0dGhpcy51cGRhdGUoSVRlc3RJdGVtVXBkYXRlLmRlc2VyaWFsaXplKG9wLml0ZW0pLCBjaGFuZ2VzKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFRlc3REaWZmT3BUeXBlLlJlbW92ZTpcblx0XHRcdFx0XHR0aGlzLnJlbW92ZShvcC5pdGVtSWQsIGNoYW5nZXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuUmV0aXJlOlxuXHRcdFx0XHRcdHRoaXMucmV0aXJlVGVzdChvcC5pdGVtSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuSW5jcmVtZW50UGVuZGluZ0V4dEhvc3RzOlxuXHRcdFx0XHRcdHRoaXMudXBkYXRlUGVuZGluZ1Jvb3RzKG9wLmFtb3VudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBUZXN0RGlmZk9wVHlwZS5BZGRUYWc6XG5cdFx0XHRcdFx0dGhpcy5fdGFncy5zZXQob3AudGFnLmlkLCBvcC50YWcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgVGVzdERpZmZPcFR5cGUuUmVtb3ZlVGFnOlxuXHRcdFx0XHRcdHRoaXMuX3RhZ3MuZGVsZXRlKG9wLmlkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjaGFuZ2VzLmNvbXBsZXRlPy4oKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGQoaXRlbTogSW50ZXJuYWxUZXN0SXRlbSwgY2hhbmdlczogSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3I8VD5cblx0KSB7XG5cdFx0Y29uc3QgcGFyZW50SWQgPSBUZXN0SWQucGFyZW50SWQoaXRlbS5pdGVtLmV4dElkKT8udG9TdHJpbmcoKTtcblx0XHRsZXQgY3JlYXRlZDogVDtcblx0XHRpZiAoIXBhcmVudElkKSB7XG5cdFx0XHRjcmVhdGVkID0gdGhpcy5jcmVhdGVJdGVtKGl0ZW0pO1xuXHRcdFx0dGhpcy5yb290cy5hZGQoY3JlYXRlZCk7XG5cdFx0XHR0aGlzLml0ZW1zLnNldChpdGVtLml0ZW0uZXh0SWQsIGNyZWF0ZWQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pdGVtcy5oYXMocGFyZW50SWQpKSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLml0ZW1zLmdldChwYXJlbnRJZCkhO1xuXHRcdFx0cGFyZW50LmNoaWxkcmVuLmFkZChpdGVtLml0ZW0uZXh0SWQpO1xuXHRcdFx0Y3JlYXRlZCA9IHRoaXMuY3JlYXRlSXRlbShpdGVtLCBwYXJlbnQpO1xuXHRcdFx0dGhpcy5pdGVtcy5zZXQoaXRlbS5pdGVtLmV4dElkLCBjcmVhdGVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVGVzdCB3aXRoIHVua25vd24gcGFyZW50IElEOiAke0pTT04uc3RyaW5naWZ5KGl0ZW0pfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNoYW5nZXMuYWRkPy4oY3JlYXRlZCk7XG5cdFx0aWYgKGl0ZW0uZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcpIHtcblx0XHRcdHRoaXMuYnVzeUNvbnRyb2xsZXJDb3VudCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBjcmVhdGVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZShwYXRjaDogSVRlc3RJdGVtVXBkYXRlLCBjaGFuZ2VzOiBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxUPlxuXHQpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuaXRlbXMuZ2V0KHBhdGNoLmV4dElkKTtcblx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBhdGNoLmV4cGFuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoZXhpc3RpbmcuZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcpIHtcblx0XHRcdFx0dGhpcy5idXN5Q29udHJvbGxlckNvdW50LS07XG5cdFx0XHR9XG5cdFx0XHRpZiAocGF0Y2guZXhwYW5kID09PSBUZXN0SXRlbUV4cGFuZFN0YXRlLkJ1c3lFeHBhbmRpbmcpIHtcblx0XHRcdFx0dGhpcy5idXN5Q29udHJvbGxlckNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXBwbHlUZXN0SXRlbVVwZGF0ZShleGlzdGluZywgcGF0Y2gpO1xuXHRcdGNoYW5nZXMudXBkYXRlPy4oZXhpc3RpbmcpO1xuXHRcdHJldHVybiBleGlzdGluZztcblx0fVxuXG5cdHByb3RlY3RlZCByZW1vdmUoaXRlbUlkOiBzdHJpbmcsIGNoYW5nZXM6IEluY3JlbWVudGFsQ2hhbmdlQ29sbGVjdG9yPFQ+KSB7XG5cdFx0Y29uc3QgdG9SZW1vdmUgPSB0aGlzLml0ZW1zLmdldChpdGVtSWQpO1xuXHRcdGlmICghdG9SZW1vdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnRJZCA9IFRlc3RJZC5wYXJlbnRJZCh0b1JlbW92ZS5pdGVtLmV4dElkKT8udG9TdHJpbmcoKTtcblx0XHRpZiAocGFyZW50SWQpIHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuaXRlbXMuZ2V0KHBhcmVudElkKSE7XG5cdFx0XHRwYXJlbnQuY2hpbGRyZW4uZGVsZXRlKHRvUmVtb3ZlLml0ZW0uZXh0SWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJvb3RzLmRlbGV0ZSh0b1JlbW92ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVldWU6IEl0ZXJhYmxlPHN0cmluZz5bXSA9IFtbaXRlbUlkXV07XG5cdFx0d2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtSWQgb2YgcXVldWUucG9wKCkhKSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5pdGVtcy5nZXQoaXRlbUlkKTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0cXVldWUucHVzaChleGlzdGluZy5jaGlsZHJlbik7XG5cdFx0XHRcdFx0dGhpcy5pdGVtcy5kZWxldGUoaXRlbUlkKTtcblx0XHRcdFx0XHRjaGFuZ2VzLnJlbW92ZT8uKGV4aXN0aW5nLCBleGlzdGluZyAhPT0gdG9SZW1vdmUpO1xuXG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nLmV4cGFuZCA9PT0gVGVzdEl0ZW1FeHBhbmRTdGF0ZS5CdXN5RXhwYW5kaW5nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmJ1c3lDb250cm9sbGVyQ291bnQtLTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlIGV4dGVuc2lvbiBzaWduYWxzIGEgdGVzdCByZXN1bHQgc2hvdWxkIGJlIHJldGlyZWQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmV0aXJlVGVzdCh0ZXN0SWQ6IHN0cmluZykge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgbnVtYmVyIG9mIHRlc3Qgcm9vdCBzb3VyY2VzIHdobyBhcmUgeWV0IHRvIHJlcG9ydC4gV2hlblxuXHQgKiB0aGUgdG90YWwgcGVuZGluZyB0ZXN0IHJvb3RzIHJlYWNoZXMgMCwgdGhlIHJvb3RzIGZvciBhbGwgY29udHJvbGxlcnNcblx0ICogd2lsbCBleGlzdCBpbiB0aGUgY29sbGVjdGlvbi5cblx0ICovXG5cdHB1YmxpYyB1cGRhdGVQZW5kaW5nUm9vdHMoZGVsdGE6IG51bWJlcikge1xuXHRcdHRoaXMucGVuZGluZ1Jvb3RDb3VudCArPSBkZWx0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgYmVmb3JlIGEgZGlmZiBpcyBhcHBsaWVkIHRvIGNyZWF0ZSBhIG5ldyBjaGFuZ2UgY29sbGVjdG9yLlxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUNoYW5nZUNvbGxlY3RvcigpOiBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxUPiB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgaXRlbSBmb3IgdGhlIGNvbGxlY3Rpb24gZnJvbSB0aGUgaW50ZXJuYWwgdGVzdCBpdGVtLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IGNyZWF0ZUl0ZW0oaW50ZXJuYWw6IEludGVybmFsVGVzdEl0ZW0sIHBhcmVudD86IFQpOiBUO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyxXQUEwQjtBQUNuQyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFFaEIsSUFBVyxrQkFBWCxrQkFBV0EscUJBQVg7QUFDTixFQUFBQSxrQ0FBQSxXQUFRLEtBQVI7QUFDQSxFQUFBQSxrQ0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSxrQ0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSxrQ0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSxrQ0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSxrQ0FBQSxh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QVcsS0FBSyxNQUFNLElBQUlBLE9BQU07QUFDdEMsWUFBSSxVQUFVO0FBQ2IsZ0JBQU0sS0FBSyxTQUFTLFFBQVE7QUFDNUIsZUFBSyxNQUFNLE9BQU9BLE9BQU07QUFDeEIsa0JBQVEsU0FBUyxVQUFVLGFBQWEsUUFBUTtBQUVoRCxjQUFJLFNBQVMsV0FBVyx1QkFBbUM7QUFDMUQsaUJBQUs7QUFBQSxVQUNOO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1UsV0FBVyxRQUFnQjtBQUFBLEVBRXJDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT08sbUJBQW1CLE9BQWU7QUFDeEMsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1Usd0JBQXVEO0FBQ2hFLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFNRDsiLAogICJuYW1lcyI6IFsiVGVzdFJlc3VsdFN0YXRlIiwgIkV4dFRlc3RSdW5Qcm9maWxlS2luZCIsICJUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkiLCAiVGVzdFJ1blByb2ZpbGVCaXRzZXQiLCAiSVJpY2hMb2NhdGlvbiIsICJUZXN0TWVzc2FnZVR5cGUiLCAiSVRlc3RNZXNzYWdlU3RhY2tGcmFtZSIsICJJVGVzdEVycm9yTWVzc2FnZSIsICJJVGVzdE91dHB1dE1lc3NhZ2UiLCAiSVRlc3RNZXNzYWdlIiwgIklUZXN0VGFza1N0YXRlIiwgIklUZXN0SXRlbSIsICJUZXN0SXRlbUV4cGFuZFN0YXRlIiwgIkludGVybmFsVGVzdEl0ZW0iLCAiSVRlc3RJdGVtVXBkYXRlIiwgIlRlc3RSZXN1bHRJdGVtIiwgIklDb3ZlcmFnZUNvdW50IiwgIklGaWxlQ292ZXJhZ2UiLCAiRGV0YWlsVHlwZSIsICJDb3ZlcmFnZURldGFpbHMiLCAiSUJyYW5jaENvdmVyYWdlIiwgIklEZWNsYXJhdGlvbkNvdmVyYWdlIiwgIklTdGF0ZW1lbnRDb3ZlcmFnZSIsICJUZXN0RGlmZk9wVHlwZSIsICJUZXN0c0RpZmZPcCIsICJpdGVtSWQiXQp9Cg==
