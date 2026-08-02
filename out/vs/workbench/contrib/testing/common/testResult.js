var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { language } from "../../../../base/common/platform.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { localize } from "../../../../nls.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { refreshComputedState } from "./getComputedState.js";
import { TestId } from "./testId.js";
import { makeEmptyCounts, maxPriority, statesInOrder, terminalStatePriorities } from "./testingStates.js";
import { getMarkId, TestItemExpandState, TestMessageType, TestResultItem, TestResultState } from "./testTypes.js";
const emptyRawOutput = {
  buffers: [],
  length: 0,
  onDidWriteData: Event.None,
  endPromise: Promise.resolve(),
  getRange: () => VSBuffer.alloc(0),
  getRangeIter: () => []
};
class TaskRawOutput {
  constructor() {
    this.writeDataEmitter = new Emitter();
    this.endDeferred = new DeferredPromise();
    this.offset = 0;
    /** @inheritdoc */
    this.onDidWriteData = this.writeDataEmitter.event;
    /** @inheritdoc */
    this.endPromise = this.endDeferred.p;
    /** @inheritdoc */
    this.buffers = [];
  }
  /** @inheritdoc */
  get length() {
    return this.offset;
  }
  /** @inheritdoc */
  getRange(start, length) {
    const buf = VSBuffer.alloc(length);
    let bufLastWrite = 0;
    for (const chunk of this.getRangeIter(start, length)) {
      buf.buffer.set(chunk.buffer, bufLastWrite);
      bufLastWrite += chunk.byteLength;
    }
    return bufLastWrite < length ? buf.slice(0, bufLastWrite) : buf;
  }
  /** @inheritdoc */
  *getRangeIter(start, length) {
    let soFar = 0;
    let internalLastRead = 0;
    for (const b of this.buffers) {
      if (internalLastRead + b.byteLength <= start) {
        internalLastRead += b.byteLength;
        continue;
      }
      const bstart = Math.max(0, start - internalLastRead);
      const bend = Math.min(b.byteLength, bstart + length - soFar);
      yield b.slice(bstart, bend);
      soFar += bend - bstart;
      internalLastRead += b.byteLength;
      if (soFar === length) {
        break;
      }
    }
  }
  /**
   * Appends data to the output, returning the byte range where the data can be found.
   */
  append(data, marker) {
    const offset = this.offset;
    let length = data.byteLength;
    if (marker === void 0) {
      this.push(data);
      return { offset, length };
    }
    let TrimBytes;
    ((TrimBytes2) => {
      TrimBytes2[TrimBytes2["CR"] = 13] = "CR";
      TrimBytes2[TrimBytes2["LF"] = 10] = "LF";
    })(TrimBytes || (TrimBytes = {}));
    const start = VSBuffer.fromString(getMarkCode(marker, true));
    const end = VSBuffer.fromString(getMarkCode(marker, false));
    length += start.byteLength + end.byteLength;
    this.push(start);
    let trimLen = data.byteLength;
    for (; trimLen > 0; trimLen--) {
      const last = data.buffer[trimLen - 1];
      if (last !== 13 /* CR */ && last !== 10 /* LF */) {
        break;
      }
    }
    this.push(data.slice(0, trimLen));
    this.push(end);
    this.push(data.slice(trimLen));
    return { offset, length };
  }
  push(data) {
    if (data.byteLength === 0) {
      return;
    }
    this.buffers.push(data);
    this.writeDataEmitter.fire(data);
    this.offset += data.byteLength;
  }
  /** Signals the output has ended. */
  end() {
    this.endDeferred.complete();
  }
}
const resultItemParents = function* (results, item) {
  for (const id of TestId.fromString(item.item.extId).idsToRoot()) {
    yield results.getStateById(id.toString());
  }
};
const maxCountPriority = (counts) => {
  for (const state of statesInOrder) {
    if (counts[state] > 0) {
      return state;
    }
  }
  return TestResultState.Unset;
};
const getMarkCode = (marker, start) => `\x1B]633;SetMark;Id=${getMarkId(marker, start)};Hidden\x07`;
const itemToNode = (controllerId, item, parent) => ({
  controllerId,
  expand: TestItemExpandState.NotExpandable,
  item: { ...item },
  children: [],
  tasks: [],
  ownComputedState: TestResultState.Unset,
  computedState: TestResultState.Unset
});
var TestResultItemChangeReason = /* @__PURE__ */ ((TestResultItemChangeReason2) => {
  TestResultItemChangeReason2[TestResultItemChangeReason2["ComputedStateChange"] = 0] = "ComputedStateChange";
  TestResultItemChangeReason2[TestResultItemChangeReason2["OwnStateChange"] = 1] = "OwnStateChange";
  TestResultItemChangeReason2[TestResultItemChangeReason2["NewMessage"] = 2] = "NewMessage";
  return TestResultItemChangeReason2;
})(TestResultItemChangeReason || {});
let LiveTestResult = class extends Disposable {
  constructor(id, persist, request, insertOrder, telemetry) {
    super();
    this.id = id;
    this.persist = persist;
    this.request = request;
    this.insertOrder = insertOrder;
    this.telemetry = telemetry;
    this.completeEmitter = this._register(new Emitter());
    this.newTaskEmitter = this._register(new Emitter());
    this.endTaskEmitter = this._register(new Emitter());
    this.changeEmitter = this._register(new Emitter());
    /** todo@connor4312: convert to a WellDefinedPrefixTree */
    this.testById = /* @__PURE__ */ new Map();
    this.testMarkerCounter = 0;
    this.startedAt = Date.now();
    this.onChange = this.changeEmitter.event;
    this.onComplete = this.completeEmitter.event;
    this.onNewTask = this.newTaskEmitter.event;
    this.onEndTask = this.endTaskEmitter.event;
    this.tasks = [];
    this.name = localize("runFinished", "Test run at {0}", (/* @__PURE__ */ new Date()).toLocaleString(language));
    /**
     * @inheritdoc
     */
    this.counts = makeEmptyCounts();
    this.computedStateAccessor = {
      getOwnState: (i) => i.ownComputedState,
      getCurrentComputedState: (i) => i.computedState,
      setComputedState: (i, s) => i.computedState = s,
      getChildren: (i) => i.children,
      getParents: (i) => {
        const { testById: testByExtId } = this;
        return (function* () {
          const parentId = TestId.fromString(i.item.extId).parentId;
          if (parentId) {
            for (const id of parentId.idsToRoot()) {
              yield testByExtId.get(id.toString());
            }
          }
        })();
      }
    };
    this.doSerialize = new Lazy(() => ({
      id: this.id,
      completedAt: this.completedAt,
      tasks: this.tasks.map((t) => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
      name: this.name,
      request: this.request,
      items: [...this.testById.values()].map(TestResultItem.serializeWithoutMessages)
    }));
    this.doSerializeWithMessages = new Lazy(() => ({
      id: this.id,
      completedAt: this.completedAt,
      tasks: this.tasks.map((t) => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
      name: this.name,
      request: this.request,
      items: [...this.testById.values()].map(TestResultItem.serialize)
    }));
  }
  /**
   * @inheritdoc
   */
  get completedAt() {
    return this._completedAt;
  }
  /**
   * @inheritdoc
   */
  get tests() {
    return this.testById.values();
  }
  /** Gets an included test item by ID. */
  getTestById(id) {
    return this.testById.get(id)?.item;
  }
  /**
   * @inheritdoc
   */
  getStateById(extTestId) {
    return this.testById.get(extTestId);
  }
  /**
   * Appends output that occurred during the test run.
   */
  appendOutput(output, taskId, location, testId) {
    const rawPreview = output.byteLength > 100 ? output.slice(0, 100).toString() + "\u2026" : output.toString();
    const preview = removeAnsiEscapeCodes(rawPreview);
    let marker;
    if (testId || location) {
      marker = this.testMarkerCounter++;
    }
    const index = this.mustGetTaskIndex(taskId);
    const task = this.tasks[index];
    const { offset, length } = task.output.append(output, marker);
    const message = {
      location,
      message: preview,
      offset,
      length,
      marker,
      type: TestMessageType.Output
    };
    const test = testId && this.testById.get(testId);
    if (test) {
      test.tasks[index].messages.push(message);
      this.changeEmitter.fire({ item: test, result: this, reason: 2 /* NewMessage */, message });
    } else {
      task.otherMessages.push(message);
    }
  }
  /**
   * Adds a new run task to the results.
   */
  addTask(task) {
    this.tasks.push({ ...task, coverage: observableValue(this, void 0), otherMessages: [], output: new TaskRawOutput() });
    for (const test of this.tests) {
      test.tasks.push({ duration: void 0, messages: [], state: TestResultState.Unset });
    }
    this.newTaskEmitter.fire(this.tasks.length - 1);
  }
  /**
   * Add the chain of tests to the run. The first test in the chain should
   * be either a test root, or a previously-known test.
   */
  addTestChainToRun(controllerId, chain) {
    let parent = this.testById.get(chain[0].extId);
    if (!parent) {
      parent = this.addTestToRun(controllerId, chain[0], null);
    }
    for (let i = 1; i < chain.length; i++) {
      parent = this.addTestToRun(controllerId, chain[i], parent.item.extId);
    }
    return void 0;
  }
  /**
   * Updates the state of the test by its internal ID.
   */
  updateState(testId, taskId, state, duration) {
    const entry = this.testById.get(testId);
    if (!entry) {
      return;
    }
    const index = this.mustGetTaskIndex(taskId);
    const oldTerminalStatePrio = terminalStatePriorities[entry.tasks[index].state];
    const newTerminalStatePrio = terminalStatePriorities[state];
    if (oldTerminalStatePrio !== void 0 && (newTerminalStatePrio === void 0 || newTerminalStatePrio < oldTerminalStatePrio)) {
      return;
    }
    this.fireUpdateAndRefresh(entry, index, state, duration);
  }
  /**
   * Appends a message for the test in the run.
   */
  appendMessage(testId, taskId, message) {
    const entry = this.testById.get(testId);
    if (!entry) {
      return;
    }
    entry.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
    this.changeEmitter.fire({ item: entry, result: this, reason: 2 /* NewMessage */, message });
  }
  /**
   * Marks the task in the test run complete.
   */
  markTaskComplete(taskId) {
    const index = this.mustGetTaskIndex(taskId);
    const task = this.tasks[index];
    task.running = false;
    task.output.end();
    this.setAllToState(
      TestResultState.Skipped,
      taskId,
      (t) => t.state === TestResultState.Queued || t.state === TestResultState.Running
    );
    this.endTaskEmitter.fire(index);
  }
  /**
   * Notifies the service that all tests are complete.
   */
  markComplete() {
    if (this._completedAt !== void 0) {
      throw new Error("cannot complete a test result multiple times");
    }
    for (const task of this.tasks) {
      if (task.running) {
        this.markTaskComplete(task.id);
      }
    }
    this._completedAt = Date.now();
    this.completeEmitter.fire();
    this.telemetry.publicLog2("test.outcomes", {
      failures: this.counts[TestResultState.Errored] + this.counts[TestResultState.Failed],
      passes: this.counts[TestResultState.Passed],
      controller: this.request.targets.map((t) => t.controllerId).join(",")
    });
  }
  /**
   * Marks the test and all of its children in the run as retired.
   */
  markRetired(testIds) {
    for (const [id, test] of this.testById) {
      if (!test.retired && (!testIds || testIds.hasKeyOrParent(TestId.fromString(id).path))) {
        test.retired = true;
        this.changeEmitter.fire({ reason: 0 /* ComputedStateChange */, item: test, result: this });
      }
    }
  }
  /**
   * @inheritdoc
   */
  toJSON() {
    return this.completedAt && this.persist ? this.doSerialize.value : void 0;
  }
  toJSONWithMessages() {
    return this.completedAt && this.persist ? this.doSerializeWithMessages.value : void 0;
  }
  /**
   * Updates all tests in the collection to the given state.
   */
  setAllToState(state, taskId, when) {
    const index = this.mustGetTaskIndex(taskId);
    for (const test of this.testById.values()) {
      if (when(test.tasks[index], test)) {
        this.fireUpdateAndRefresh(test, index, state);
      }
    }
  }
  fireUpdateAndRefresh(entry, taskIndex, newState, newOwnDuration) {
    const previousOwnComputed = entry.ownComputedState;
    const previousOwnDuration = entry.ownDuration;
    const changeEvent = {
      item: entry,
      result: this,
      reason: 1 /* OwnStateChange */,
      previousState: previousOwnComputed,
      previousOwnDuration
    };
    entry.tasks[taskIndex].state = newState;
    if (newOwnDuration !== void 0) {
      entry.tasks[taskIndex].duration = newOwnDuration;
      entry.ownDuration = Math.max(entry.ownDuration || 0, newOwnDuration);
    }
    const newOwnComputed = maxPriority(...entry.tasks.map((t) => t.state));
    if (newOwnComputed === previousOwnComputed) {
      if (newOwnDuration !== previousOwnDuration) {
        this.changeEmitter.fire(changeEvent);
      }
      return;
    }
    entry.ownComputedState = newOwnComputed;
    this.counts[previousOwnComputed]--;
    this.counts[newOwnComputed]++;
    refreshComputedState(this.computedStateAccessor, entry).forEach(
      (t) => this.changeEmitter.fire(t === entry ? changeEvent : {
        item: t,
        result: this,
        reason: 0 /* ComputedStateChange */
      })
    );
  }
  addTestToRun(controllerId, item, parent) {
    const node = itemToNode(controllerId, item, parent);
    this.testById.set(item.extId, node);
    this.counts[TestResultState.Unset]++;
    if (parent) {
      this.testById.get(parent)?.children.push(node);
    }
    if (this.tasks.length) {
      for (let i = 0; i < this.tasks.length; i++) {
        node.tasks.push({ duration: void 0, messages: [], state: TestResultState.Unset });
      }
    }
    return node;
  }
  mustGetTaskIndex(taskId) {
    const index = this.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`Unknown task ${taskId} in updateState`);
    }
    return index;
  }
};
LiveTestResult = __decorateClass([
  __decorateParam(4, ITelemetryService)
], LiveTestResult);
class HydratedTestResult {
  constructor(identity, serialized, persist = true) {
    this.serialized = serialized;
    this.persist = persist;
    /**
     * @inheritdoc
     */
    this.counts = makeEmptyCounts();
    this.testById = /* @__PURE__ */ new Map();
    this.id = serialized.id;
    this.completedAt = serialized.completedAt;
    this.tasks = serialized.tasks.map((task, i) => ({
      id: task.id,
      name: task.name || localize("testUnnamedTask", "Unnamed Task"),
      ctrlId: task.ctrlId,
      running: false,
      coverage: observableValue(this, void 0),
      output: emptyRawOutput,
      otherMessages: []
    }));
    this.name = serialized.name;
    this.request = serialized.request;
    for (const item of serialized.items) {
      const de = TestResultItem.deserialize(identity, item);
      this.counts[de.ownComputedState]++;
      this.testById.set(item.item.extId, de);
    }
  }
  /**
   * @inheritdoc
   */
  get tests() {
    return this.testById.values();
  }
  /**
   * @inheritdoc
   */
  getStateById(extTestId) {
    return this.testById.get(extTestId);
  }
  /**
   * @inheritdoc
   */
  toJSON() {
    return this.persist ? this.serialized : void 0;
  }
  /**
   * @inheritdoc
   */
  toJSONWithMessages() {
    return this.toJSON();
  }
}
export {
  HydratedTestResult,
  LiveTestResult,
  TaskRawOutput,
  TestResultItemChangeReason,
  maxCountPriority,
  resultItemParents
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RSZXN1bHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBXZWxsRGVmaW5lZFByZWZpeFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcmVmaXhUcmVlLmpzJztcbmltcG9ydCB7IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElDb21wdXRlZFN0YXRlQWNjZXNzb3IsIHJlZnJlc2hDb21wdXRlZFN0YXRlIH0gZnJvbSAnLi9nZXRDb21wdXRlZFN0YXRlLmpzJztcbmltcG9ydCB7IFRlc3RDb3ZlcmFnZSB9IGZyb20gJy4vdGVzdENvdmVyYWdlLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4vdGVzdElkLmpzJztcbmltcG9ydCB7IG1ha2VFbXB0eUNvdW50cywgbWF4UHJpb3JpdHksIHN0YXRlc0luT3JkZXIsIHRlcm1pbmFsU3RhdGVQcmlvcml0aWVzLCBUZXN0U3RhdGVDb3VudCB9IGZyb20gJy4vdGVzdGluZ1N0YXRlcy5qcyc7XG5pbXBvcnQgeyBnZXRNYXJrSWQsIElSaWNoTG9jYXRpb24sIElTZXJpYWxpemVkVGVzdFJlc3VsdHMsIElUZXN0SXRlbSwgSVRlc3RNZXNzYWdlLCBJVGVzdE91dHB1dE1lc3NhZ2UsIElUZXN0UnVuVGFzaywgSVRlc3RUYXNrU3RhdGUsIFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIFRlc3RJdGVtRXhwYW5kU3RhdGUsIFRlc3RNZXNzYWdlVHlwZSwgVGVzdFJlc3VsdEl0ZW0sIFRlc3RSZXN1bHRTdGF0ZSB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFJ1blRhc2tSZXN1bHRzIGV4dGVuZHMgSVRlc3RSdW5UYXNrIHtcblx0LyoqXG5cdCAqIENvbnRhaW5zIHRlc3QgY292ZXJhZ2UgZm9yIHRoZSByZXN1bHQsIGlmIGl0J3MgYXZhaWxhYmxlLlxuXHQgKi9cblx0cmVhZG9ubHkgY292ZXJhZ2U6IElPYnNlcnZhYmxlPFRlc3RDb3ZlcmFnZSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIE1lc3NhZ2VzIGZyb20gdGhlIHRhc2sgbm90IGFzc29jaWF0ZWQgd2l0aCBhbnkgc3BlY2lmaWMgdGVzdC5cblx0ICovXG5cdHJlYWRvbmx5IG90aGVyTWVzc2FnZXM6IElUZXN0T3V0cHV0TWVzc2FnZVtdO1xuXG5cdC8qKlxuXHQgKiBUZXN0IHJlc3VsdHMgb3V0cHV0IGZvciB0aGUgdGFzay5cblx0ICovXG5cdHJlYWRvbmx5IG91dHB1dDogSVRhc2tSYXdPdXRwdXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RSZXN1bHQge1xuXHQvKipcblx0ICogQ291bnQgb2YgdGhlIG51bWJlciBvZiB0ZXN0cyBpbiBlYWNoIHJ1biBzdGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IGNvdW50czogUmVhZG9ubHk8VGVzdFN0YXRlQ291bnQ+O1xuXG5cdC8qKlxuXHQgKiBVbmlxdWUgSUQgb2YgdGhpcyBzZXQgb2YgdGVzdCByZXN1bHRzLlxuXHQgKi9cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogSWYgdGhlIHRlc3QgaXMgY29tcGxldGVkLCB0aGUgdW5peCBtaWxsaXNlY29uZHMgdGltZSBhdCB3aGljaCBpdCB3YXNcblx0ICogY29tcGxldGVkLiBJZiB1bmRlZmluZWQsIHRoZSB0ZXN0IGlzIHN0aWxsIHJ1bm5pbmcuXG5cdCAqL1xuXHRyZWFkb25seSBjb21wbGV0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgdGVzdCByZXN1bHQgaXMgdHJpZ2dlcmVkIGZyb20gYW4gYXV0byBydW4uXG5cdCAqL1xuXHRyZWFkb25seSByZXF1ZXN0OiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0O1xuXG5cdC8qKlxuXHQgKiBIdW1hbi1yZWFkYWJsZSBuYW1lIG9mIHRoZSB0ZXN0IHJlc3VsdC5cblx0ICovXG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblxuXHQvKipcblx0ICogR2V0cyBhbGwgdGVzdHMgaW52b2x2ZWQgaW4gdGhlIHJ1bi5cblx0ICovXG5cdHRlc3RzOiBJdGVyYWJsZUl0ZXJhdG9yPFRlc3RSZXN1bHRJdGVtPjtcblxuXHQvKipcblx0ICogTGlzdCBvZiB0aGlzIHJlc3VsdCdzIHN1YnRhc2tzLlxuXHQgKi9cblx0dGFza3M6IFJlYWRvbmx5QXJyYXk8SVRlc3RSdW5UYXNrUmVzdWx0cz47XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHN0YXRlIG9mIHRoZSB0ZXN0IGJ5IGl0cyBleHRlbnNpb24tYXNzaWduZWQgSUQuXG5cdCAqL1xuXHRnZXRTdGF0ZUJ5SWQodGVzdEV4dElkOiBzdHJpbmcpOiBUZXN0UmVzdWx0SXRlbSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2VyaWFsaXplcyB0aGUgdGVzdCByZXN1bHQuIFVzZWQgdG8gc2F2ZSBhbmQgcmVzdG9yZSByZXN1bHRzXG5cdCAqIGluIHRoZSB3b3Jrc3BhY2UuXG5cdCAqL1xuXHR0b0pTT04oKTogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2VyaWFsaXplcyB0aGUgdGVzdCByZXN1bHQsIGluY2x1ZGVzIG1lc3NhZ2VzLiBVc2VkIHRvIHNlbmQgdGhlIHRlc3Qgc3RhdGVzIHRvIHRoZSBleHRlbnNpb24gaG9zdC5cblx0ICovXG5cdHRvSlNPTldpdGhNZXNzYWdlcygpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIE91dHB1dCB0eXBlIGV4cG9zZWQgZnJvbSBsaXZlIHRlc3QgcmVzdWx0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFza1Jhd091dHB1dCB7XG5cdHJlYWRvbmx5IG9uRGlkV3JpdGVEYXRhOiBFdmVudDxWU0J1ZmZlcj47XG5cdHJlYWRvbmx5IGVuZFByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHJlYWRvbmx5IGJ1ZmZlcnM6IFZTQnVmZmVyW107XG5cdHJlYWRvbmx5IGxlbmd0aDogbnVtYmVyO1xuXG5cdC8qKiBHZXRzIGEgY29udGludW91cyBidWZmZXIgZm9yIHRoZSBkZXNpcmVkIHJhbmdlICovXG5cdGdldFJhbmdlKHN0YXJ0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogVlNCdWZmZXI7XG5cdC8qKiBHZXRzIGFuIGl0ZXJhdG9yIG9mIGJ1ZmZlcnMgZm9yIHRoZSByYW5nZTsgbWF5IGF2b2lkIGFsbG9jYXRpb24gb2YgZ2V0UmFuZ2UoKSAqL1xuXHRnZXRSYW5nZUl0ZXIoc3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpOiBJdGVyYWJsZTxWU0J1ZmZlcj47XG59XG5cbmNvbnN0IGVtcHR5UmF3T3V0cHV0OiBJVGFza1Jhd091dHB1dCA9IHtcblx0YnVmZmVyczogW10sXG5cdGxlbmd0aDogMCxcblx0b25EaWRXcml0ZURhdGE6IEV2ZW50Lk5vbmUsXG5cdGVuZFByb21pc2U6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRnZXRSYW5nZTogKCkgPT4gVlNCdWZmZXIuYWxsb2MoMCksXG5cdGdldFJhbmdlSXRlcjogKCkgPT4gW10sXG59O1xuXG5leHBvcnQgY2xhc3MgVGFza1Jhd091dHB1dCBpbXBsZW1lbnRzIElUYXNrUmF3T3V0cHV0IHtcblx0cHJpdmF0ZSByZWFkb25seSB3cml0ZURhdGFFbWl0dGVyID0gbmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW5kRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdHByaXZhdGUgb2Zmc2V0ID0gMDtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uRGlkV3JpdGVEYXRhID0gdGhpcy53cml0ZURhdGFFbWl0dGVyLmV2ZW50O1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZW5kUHJvbWlzZSA9IHRoaXMuZW5kRGVmZXJyZWQucDtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IGJ1ZmZlcnM6IFZTQnVmZmVyW10gPSBbXTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGdldCBsZW5ndGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMub2Zmc2V0O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdGdldFJhbmdlKHN0YXJ0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IGJ1ZiA9IFZTQnVmZmVyLmFsbG9jKGxlbmd0aCk7XG5cdFx0bGV0IGJ1Zkxhc3RXcml0ZSA9IDA7XG5cdFx0Zm9yIChjb25zdCBjaHVuayBvZiB0aGlzLmdldFJhbmdlSXRlcihzdGFydCwgbGVuZ3RoKSkge1xuXHRcdFx0YnVmLmJ1ZmZlci5zZXQoY2h1bmsuYnVmZmVyLCBidWZMYXN0V3JpdGUpO1xuXHRcdFx0YnVmTGFzdFdyaXRlICs9IGNodW5rLmJ5dGVMZW5ndGg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJ1Zkxhc3RXcml0ZSA8IGxlbmd0aCA/IGJ1Zi5zbGljZSgwLCBidWZMYXN0V3JpdGUpIDogYnVmO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdCpnZXRSYW5nZUl0ZXIoc3RhcnQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpIHtcblx0XHRsZXQgc29GYXIgPSAwO1xuXHRcdGxldCBpbnRlcm5hbExhc3RSZWFkID0gMDtcblx0XHRmb3IgKGNvbnN0IGIgb2YgdGhpcy5idWZmZXJzKSB7XG5cdFx0XHRpZiAoaW50ZXJuYWxMYXN0UmVhZCArIGIuYnl0ZUxlbmd0aCA8PSBzdGFydCkge1xuXHRcdFx0XHRpbnRlcm5hbExhc3RSZWFkICs9IGIuYnl0ZUxlbmd0aDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJzdGFydCA9IE1hdGgubWF4KDAsIHN0YXJ0IC0gaW50ZXJuYWxMYXN0UmVhZCk7XG5cdFx0XHRjb25zdCBiZW5kID0gTWF0aC5taW4oYi5ieXRlTGVuZ3RoLCBic3RhcnQgKyBsZW5ndGggLSBzb0Zhcik7XG5cblx0XHRcdHlpZWxkIGIuc2xpY2UoYnN0YXJ0LCBiZW5kKTtcblx0XHRcdHNvRmFyICs9IGJlbmQgLSBic3RhcnQ7XG5cdFx0XHRpbnRlcm5hbExhc3RSZWFkICs9IGIuYnl0ZUxlbmd0aDtcblxuXHRcdFx0aWYgKHNvRmFyID09PSBsZW5ndGgpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgZGF0YSB0byB0aGUgb3V0cHV0LCByZXR1cm5pbmcgdGhlIGJ5dGUgcmFuZ2Ugd2hlcmUgdGhlIGRhdGEgY2FuIGJlIGZvdW5kLlxuXHQgKi9cblx0cHVibGljIGFwcGVuZChkYXRhOiBWU0J1ZmZlciwgbWFya2VyPzogbnVtYmVyKSB7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gdGhpcy5vZmZzZXQ7XG5cdFx0bGV0IGxlbmd0aCA9IGRhdGEuYnl0ZUxlbmd0aDtcblx0XHRpZiAobWFya2VyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucHVzaChkYXRhKTtcblx0XHRcdHJldHVybiB7IG9mZnNldCwgbGVuZ3RoIH07XG5cdFx0fVxuXG5cdFx0Ly8gQnl0ZXMgdGhhdCBzaG91bGQgYmUgJ3RyaW1tZWQnIG9mZiB0aGUgZW5kIG9mIGRhdGEuIFRoaXMgaXMgZG9uZSBiZWNhdXNlXG5cdFx0Ly8gc2VsZWN0aW9ucyBpbiB0aGUgdGVybWluYWwgYXJlIGJhc2VkIG9uIHRoZSBlbnRpcmUgbGluZSwgYW5kIGNvbW1vbmx5XG5cdFx0Ly8gdGhlIGludGVyZXN0aW5nIG1hcmtlZCByYW5nZSBoYXMgYSB0cmFpbGluZyBuZXcgbGluZS4gV2UgZG9uJ3Qgd2FudCB0b1xuXHRcdC8vIHNlbGVjdCB0aGUgdHJhaWxpbmcgbGluZSAod2hpY2ggbWlnaHQgaGF2ZSBvdGhlciBkYXRhKVxuXHRcdC8vIHNvIHdlIHBsYWNlIHRoZSBtYXJrZXIgYmVmb3JlIGFsbCB0cmFpbGluZyB0cmltYnl0ZXMuXG5cdFx0Y29uc3QgZW51bSBUcmltQnl0ZXMge1xuXHRcdFx0Q1IgPSAxMyxcblx0XHRcdExGID0gMTAsXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGdldE1hcmtDb2RlKG1hcmtlciwgdHJ1ZSkpO1xuXHRcdGNvbnN0IGVuZCA9IFZTQnVmZmVyLmZyb21TdHJpbmcoZ2V0TWFya0NvZGUobWFya2VyLCBmYWxzZSkpO1xuXHRcdGxlbmd0aCArPSBzdGFydC5ieXRlTGVuZ3RoICsgZW5kLmJ5dGVMZW5ndGg7XG5cblx0XHR0aGlzLnB1c2goc3RhcnQpO1xuXHRcdGxldCB0cmltTGVuID0gZGF0YS5ieXRlTGVuZ3RoO1xuXHRcdGZvciAoOyB0cmltTGVuID4gMDsgdHJpbUxlbi0tKSB7XG5cdFx0XHRjb25zdCBsYXN0ID0gZGF0YS5idWZmZXJbdHJpbUxlbiAtIDFdO1xuXHRcdFx0aWYgKGxhc3QgIT09IFRyaW1CeXRlcy5DUiAmJiBsYXN0ICE9PSBUcmltQnl0ZXMuTEYpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5wdXNoKGRhdGEuc2xpY2UoMCwgdHJpbUxlbikpO1xuXHRcdHRoaXMucHVzaChlbmQpO1xuXHRcdHRoaXMucHVzaChkYXRhLnNsaWNlKHRyaW1MZW4pKTtcblxuXG5cdFx0cmV0dXJuIHsgb2Zmc2V0LCBsZW5ndGggfTtcblx0fVxuXG5cdHByaXZhdGUgcHVzaChkYXRhOiBWU0J1ZmZlcikge1xuXHRcdGlmIChkYXRhLmJ5dGVMZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmJ1ZmZlcnMucHVzaChkYXRhKTtcblx0XHR0aGlzLndyaXRlRGF0YUVtaXR0ZXIuZmlyZShkYXRhKTtcblx0XHR0aGlzLm9mZnNldCArPSBkYXRhLmJ5dGVMZW5ndGg7XG5cdH1cblxuXHQvKiogU2lnbmFscyB0aGUgb3V0cHV0IGhhcyBlbmRlZC4gKi9cblx0cHVibGljIGVuZCgpIHtcblx0XHR0aGlzLmVuZERlZmVycmVkLmNvbXBsZXRlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IHJlc3VsdEl0ZW1QYXJlbnRzID0gZnVuY3Rpb24qIChyZXN1bHRzOiBJVGVzdFJlc3VsdCwgaXRlbTogVGVzdFJlc3VsdEl0ZW0pIHtcblx0Zm9yIChjb25zdCBpZCBvZiBUZXN0SWQuZnJvbVN0cmluZyhpdGVtLml0ZW0uZXh0SWQpLmlkc1RvUm9vdCgpKSB7XG5cdFx0eWllbGQgcmVzdWx0cy5nZXRTdGF0ZUJ5SWQoaWQudG9TdHJpbmcoKSkhO1xuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgbWF4Q291bnRQcmlvcml0eSA9IChjb3VudHM6IFJlYWRvbmx5PFRlc3RTdGF0ZUNvdW50PikgPT4ge1xuXHRmb3IgKGNvbnN0IHN0YXRlIG9mIHN0YXRlc0luT3JkZXIpIHtcblx0XHRpZiAoY291bnRzW3N0YXRlXSA+IDApIHtcblx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gVGVzdFJlc3VsdFN0YXRlLlVuc2V0O1xufTtcblxuY29uc3QgZ2V0TWFya0NvZGUgPSAobWFya2VyOiBudW1iZXIsIHN0YXJ0OiBib29sZWFuKSA9PiBgXFx4MWJdNjMzO1NldE1hcms7SWQ9JHtnZXRNYXJrSWQobWFya2VyLCBzdGFydCl9O0hpZGRlblxceDA3YDtcblxuaW50ZXJmYWNlIFRlc3RSZXN1bHRJdGVtV2l0aENoaWxkcmVuIGV4dGVuZHMgVGVzdFJlc3VsdEl0ZW0ge1xuXHQvKiogQ2hpbGRyZW4gaW4gdGhlIHJ1biAqL1xuXHRjaGlsZHJlbjogVGVzdFJlc3VsdEl0ZW1XaXRoQ2hpbGRyZW5bXTtcbn1cblxuY29uc3QgaXRlbVRvTm9kZSA9IChjb250cm9sbGVySWQ6IHN0cmluZywgaXRlbTogSVRlc3RJdGVtLCBwYXJlbnQ6IHN0cmluZyB8IG51bGwpOiBUZXN0UmVzdWx0SXRlbVdpdGhDaGlsZHJlbiA9PiAoe1xuXHRjb250cm9sbGVySWQsXG5cdGV4cGFuZDogVGVzdEl0ZW1FeHBhbmRTdGF0ZS5Ob3RFeHBhbmRhYmxlLFxuXHRpdGVtOiB7IC4uLml0ZW0gfSxcblx0Y2hpbGRyZW46IFtdLFxuXHR0YXNrczogW10sXG5cdG93bkNvbXB1dGVkU3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCxcblx0Y29tcHV0ZWRTdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlVuc2V0LFxufSk7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uIHtcblx0Q29tcHV0ZWRTdGF0ZUNoYW5nZSxcblx0T3duU3RhdGVDaGFuZ2UsXG5cdE5ld01lc3NhZ2UsXG59XG5cbmV4cG9ydCB0eXBlIFRlc3RSZXN1bHRJdGVtQ2hhbmdlID0geyBpdGVtOiBUZXN0UmVzdWx0SXRlbTsgcmVzdWx0OiBJVGVzdFJlc3VsdCB9ICYgKFxuXHR8IHsgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Db21wdXRlZFN0YXRlQ2hhbmdlIH1cblx0fCB7IHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2U7IHByZXZpb3VzU3RhdGU6IFRlc3RSZXN1bHRTdGF0ZTsgcHJldmlvdXNPd25EdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIH1cblx0fCB7IHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uTmV3TWVzc2FnZTsgbWVzc2FnZTogSVRlc3RNZXNzYWdlIH1cbik7XG5cbi8qKlxuICogUmVzdWx0cyBvZiBhIHRlc3QuIFRoZXNlIGFyZSBjcmVhdGVkIHdoZW4gdGhlIHRlc3QgaW5pdGlhbGx5IHN0YXJ0ZWQgcnVubmluZ1xuICogYW5kIG1hcmtlZCBhcyBcImNvbXBsZXRlXCIgd2hlbiB0aGUgcnVuIGZpbmlzaGVzLlxuICovXG5leHBvcnQgY2xhc3MgTGl2ZVRlc3RSZXN1bHQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlc3RSZXN1bHQge1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBsZXRlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG5ld1Rhc2tFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlbmRUYXNrRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRlc3RSZXN1bHRJdGVtQ2hhbmdlPigpKTtcblx0LyoqIHRvZG9AY29ubm9yNDMxMjogY29udmVydCB0byBhIFdlbGxEZWZpbmVkUHJlZml4VHJlZSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHRlc3RCeUlkID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RSZXN1bHRJdGVtV2l0aENoaWxkcmVuPigpO1xuXHRwcml2YXRlIHRlc3RNYXJrZXJDb3VudGVyID0gMDtcblx0cHJpdmF0ZSBfY29tcGxldGVkQXQ/OiBudW1iZXI7XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkNoYW5nZSA9IHRoaXMuY2hhbmdlRW1pdHRlci5ldmVudDtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29tcGxldGUgPSB0aGlzLmNvbXBsZXRlRW1pdHRlci5ldmVudDtcblx0cHVibGljIHJlYWRvbmx5IG9uTmV3VGFzayA9IHRoaXMubmV3VGFza0VtaXR0ZXIuZXZlbnQ7XG5cdHB1YmxpYyByZWFkb25seSBvbkVuZFRhc2sgPSB0aGlzLmVuZFRhc2tFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgdGFza3M6IChJVGVzdFJ1blRhc2tSZXN1bHRzICYgeyBvdXRwdXQ6IFRhc2tSYXdPdXRwdXQgfSlbXSA9IFtdO1xuXHRwdWJsaWMgcmVhZG9ubHkgbmFtZSA9IGxvY2FsaXplKCdydW5GaW5pc2hlZCcsICdUZXN0IHJ1biBhdCB7MH0nLCBuZXcgRGF0ZSgpLnRvTG9jYWxlU3RyaW5nKGxhbmd1YWdlKSk7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGNvbXBsZXRlZEF0KCkge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0ZWRBdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNvdW50cyA9IG1ha2VFbXB0eUNvdW50cygpO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldCB0ZXN0cygpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0QnlJZC52YWx1ZXMoKTtcblx0fVxuXG5cdC8qKiBHZXRzIGFuIGluY2x1ZGVkIHRlc3QgaXRlbSBieSBJRC4gKi9cblx0cHVibGljIGdldFRlc3RCeUlkKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0QnlJZC5nZXQoaWQpPy5pdGVtO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21wdXRlZFN0YXRlQWNjZXNzb3I6IElDb21wdXRlZFN0YXRlQWNjZXNzb3I8VGVzdFJlc3VsdEl0ZW1XaXRoQ2hpbGRyZW4+ID0ge1xuXHRcdGdldE93blN0YXRlOiBpID0+IGkub3duQ29tcHV0ZWRTdGF0ZSxcblx0XHRnZXRDdXJyZW50Q29tcHV0ZWRTdGF0ZTogaSA9PiBpLmNvbXB1dGVkU3RhdGUsXG5cdFx0c2V0Q29tcHV0ZWRTdGF0ZTogKGksIHMpID0+IGkuY29tcHV0ZWRTdGF0ZSA9IHMsXG5cdFx0Z2V0Q2hpbGRyZW46IGkgPT4gaS5jaGlsZHJlbixcblx0XHRnZXRQYXJlbnRzOiBpID0+IHtcblx0XHRcdGNvbnN0IHsgdGVzdEJ5SWQ6IHRlc3RCeUV4dElkIH0gPSB0aGlzO1xuXHRcdFx0cmV0dXJuIChmdW5jdGlvbiogKCkge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRJZCA9IFRlc3RJZC5mcm9tU3RyaW5nKGkuaXRlbS5leHRJZCkucGFyZW50SWQ7XG5cdFx0XHRcdGlmIChwYXJlbnRJZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgcGFyZW50SWQuaWRzVG9Sb290KCkpIHtcblx0XHRcdFx0XHRcdHlpZWxkIHRlc3RCeUV4dElkLmdldChpZC50b1N0cmluZygpKSE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH0sXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHBlcnNpc3Q6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3Q6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsXG5cdFx0cHVibGljIHJlYWRvbmx5IGluc2VydE9yZGVyOiBudW1iZXIsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5OiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldFN0YXRlQnlJZChleHRUZXN0SWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLnRlc3RCeUlkLmdldChleHRUZXN0SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgb3V0cHV0IHRoYXQgb2NjdXJyZWQgZHVyaW5nIHRoZSB0ZXN0IHJ1bi5cblx0ICovXG5cdHB1YmxpYyBhcHBlbmRPdXRwdXQob3V0cHV0OiBWU0J1ZmZlciwgdGFza0lkOiBzdHJpbmcsIGxvY2F0aW9uPzogSVJpY2hMb2NhdGlvbiwgdGVzdElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3UHJldmlldyA9IG91dHB1dC5ieXRlTGVuZ3RoID4gMTAwID8gb3V0cHV0LnNsaWNlKDAsIDEwMCkudG9TdHJpbmcoKSArICdcdTIwMjYnIDogb3V0cHV0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJldmlldyA9IHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhyYXdQcmV2aWV3KTtcblx0XHRsZXQgbWFya2VyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBjdXJyZW50bHksIHRoZSBVSSBvbmx5IGV4cG9zZXMganVtcC10by1tZXNzYWdlIGZyb20gdGVzdHMgb3IgbG9jYXRpb25zLFxuXHRcdC8vIHNvIG5vIG5lZWQgdG8gbWFyayBvdXRwdXRzIHRoYXQgZG9uJ3QgY29tZSBmcm9tIGVpdGhlciBvZiB0aG9zZS5cblx0XHRpZiAodGVzdElkIHx8IGxvY2F0aW9uKSB7XG5cdFx0XHRtYXJrZXIgPSB0aGlzLnRlc3RNYXJrZXJDb3VudGVyKys7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm11c3RHZXRUYXNrSW5kZXgodGFza0lkKTtcblx0XHRjb25zdCB0YXNrID0gdGhpcy50YXNrc1tpbmRleF07XG5cblx0XHRjb25zdCB7IG9mZnNldCwgbGVuZ3RoIH0gPSB0YXNrLm91dHB1dC5hcHBlbmQob3V0cHV0LCBtYXJrZXIpO1xuXHRcdGNvbnN0IG1lc3NhZ2U6IElUZXN0T3V0cHV0TWVzc2FnZSA9IHtcblx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0bWVzc2FnZTogcHJldmlldyxcblx0XHRcdG9mZnNldCxcblx0XHRcdGxlbmd0aCxcblx0XHRcdG1hcmtlcixcblx0XHRcdHR5cGU6IFRlc3RNZXNzYWdlVHlwZS5PdXRwdXQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3QgPSB0ZXN0SWQgJiYgdGhpcy50ZXN0QnlJZC5nZXQodGVzdElkKTtcblx0XHRpZiAodGVzdCkge1xuXHRcdFx0dGVzdC50YXNrc1tpbmRleF0ubWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKHsgaXRlbTogdGVzdCwgcmVzdWx0OiB0aGlzLCByZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk5ld01lc3NhZ2UsIG1lc3NhZ2UgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhc2sub3RoZXJNZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGEgbmV3IHJ1biB0YXNrIHRvIHRoZSByZXN1bHRzLlxuXHQgKi9cblx0cHVibGljIGFkZFRhc2sodGFzazogSVRlc3RSdW5UYXNrKSB7XG5cdFx0dGhpcy50YXNrcy5wdXNoKHsgLi4udGFzaywgY292ZXJhZ2U6IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpLCBvdGhlck1lc3NhZ2VzOiBbXSwgb3V0cHV0OiBuZXcgVGFza1Jhd091dHB1dCgpIH0pO1xuXG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHRoaXMudGVzdHMpIHtcblx0XHRcdHRlc3QudGFza3MucHVzaCh7IGR1cmF0aW9uOiB1bmRlZmluZWQsIG1lc3NhZ2VzOiBbXSwgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZS5VbnNldCB9KTtcblx0XHR9XG5cblx0XHR0aGlzLm5ld1Rhc2tFbWl0dGVyLmZpcmUodGhpcy50YXNrcy5sZW5ndGggLSAxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGQgdGhlIGNoYWluIG9mIHRlc3RzIHRvIHRoZSBydW4uIFRoZSBmaXJzdCB0ZXN0IGluIHRoZSBjaGFpbiBzaG91bGRcblx0ICogYmUgZWl0aGVyIGEgdGVzdCByb290LCBvciBhIHByZXZpb3VzbHkta25vd24gdGVzdC5cblx0ICovXG5cdHB1YmxpYyBhZGRUZXN0Q2hhaW5Ub1J1bihjb250cm9sbGVySWQ6IHN0cmluZywgY2hhaW46IFJlYWRvbmx5QXJyYXk8SVRlc3RJdGVtPikge1xuXHRcdGxldCBwYXJlbnQgPSB0aGlzLnRlc3RCeUlkLmdldChjaGFpblswXS5leHRJZCk7XG5cdFx0aWYgKCFwYXJlbnQpIHsgLy8gbXVzdCBiZSBhIHRlc3Qgcm9vdFxuXHRcdFx0cGFyZW50ID0gdGhpcy5hZGRUZXN0VG9SdW4oY29udHJvbGxlcklkLCBjaGFpblswXSwgbnVsbCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBjaGFpbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0cGFyZW50ID0gdGhpcy5hZGRUZXN0VG9SdW4oY29udHJvbGxlcklkLCBjaGFpbltpXSwgcGFyZW50Lml0ZW0uZXh0SWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgc3RhdGUgb2YgdGhlIHRlc3QgYnkgaXRzIGludGVybmFsIElELlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZVN0YXRlKHRlc3RJZDogc3RyaW5nLCB0YXNrSWQ6IHN0cmluZywgc3RhdGU6IFRlc3RSZXN1bHRTdGF0ZSwgZHVyYXRpb24/OiBudW1iZXIpIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMudGVzdEJ5SWQuZ2V0KHRlc3RJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tdXN0R2V0VGFza0luZGV4KHRhc2tJZCk7XG5cblx0XHRjb25zdCBvbGRUZXJtaW5hbFN0YXRlUHJpbyA9IHRlcm1pbmFsU3RhdGVQcmlvcml0aWVzW2VudHJ5LnRhc2tzW2luZGV4XS5zdGF0ZV07XG5cdFx0Y29uc3QgbmV3VGVybWluYWxTdGF0ZVByaW8gPSB0ZXJtaW5hbFN0YXRlUHJpb3JpdGllc1tzdGF0ZV07XG5cblx0XHQvLyBJZ25vcmUgcmVxdWVzdHMgdG8gc2V0IHRoZSBzdGF0ZSBmcm9tIG9uZSB0ZXJtaW5hbCBzdGF0ZSBiYWNrIHRvIGFcblx0XHQvLyBcImxvd2VyXCIgb25lLCBlLmcuIGZyb20gZmFpbGVkIGJhY2sgdG8gcGFzc2VkOlxuXHRcdGlmIChvbGRUZXJtaW5hbFN0YXRlUHJpbyAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHQobmV3VGVybWluYWxTdGF0ZVByaW8gPT09IHVuZGVmaW5lZCB8fCBuZXdUZXJtaW5hbFN0YXRlUHJpbyA8IG9sZFRlcm1pbmFsU3RhdGVQcmlvKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZmlyZVVwZGF0ZUFuZFJlZnJlc2goZW50cnksIGluZGV4LCBzdGF0ZSwgZHVyYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSBtZXNzYWdlIGZvciB0aGUgdGVzdCBpbiB0aGUgcnVuLlxuXHQgKi9cblx0cHVibGljIGFwcGVuZE1lc3NhZ2UodGVzdElkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCBtZXNzYWdlOiBJVGVzdE1lc3NhZ2UpIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMudGVzdEJ5SWQuZ2V0KHRlc3RJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVudHJ5LnRhc2tzW3RoaXMubXVzdEdldFRhc2tJbmRleCh0YXNrSWQpXS5tZXNzYWdlcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKHsgaXRlbTogZW50cnksIHJlc3VsdDogdGhpcywgcmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5OZXdNZXNzYWdlLCBtZXNzYWdlIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmtzIHRoZSB0YXNrIGluIHRoZSB0ZXN0IHJ1biBjb21wbGV0ZS5cblx0ICovXG5cdHB1YmxpYyBtYXJrVGFza0NvbXBsZXRlKHRhc2tJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm11c3RHZXRUYXNrSW5kZXgodGFza0lkKTtcblx0XHRjb25zdCB0YXNrID0gdGhpcy50YXNrc1tpbmRleF07XG5cdFx0dGFzay5ydW5uaW5nID0gZmFsc2U7XG5cdFx0dGFzay5vdXRwdXQuZW5kKCk7XG5cblx0XHR0aGlzLnNldEFsbFRvU3RhdGUoXG5cdFx0XHRUZXN0UmVzdWx0U3RhdGUuU2tpcHBlZCxcblx0XHRcdHRhc2tJZCxcblx0XHRcdHQgPT4gdC5zdGF0ZSA9PT0gVGVzdFJlc3VsdFN0YXRlLlF1ZXVlZCB8fCB0LnN0YXRlID09PSBUZXN0UmVzdWx0U3RhdGUuUnVubmluZyxcblx0XHQpO1xuXG5cdFx0dGhpcy5lbmRUYXNrRW1pdHRlci5maXJlKGluZGV4KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZmllcyB0aGUgc2VydmljZSB0aGF0IGFsbCB0ZXN0cyBhcmUgY29tcGxldGUuXG5cdCAqL1xuXHRwdWJsaWMgbWFya0NvbXBsZXRlKCkge1xuXHRcdGlmICh0aGlzLl9jb21wbGV0ZWRBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBjb21wbGV0ZSBhIHRlc3QgcmVzdWx0IG11bHRpcGxlIHRpbWVzJyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRoaXMudGFza3MpIHtcblx0XHRcdGlmICh0YXNrLnJ1bm5pbmcpIHtcblx0XHRcdFx0dGhpcy5tYXJrVGFza0NvbXBsZXRlKHRhc2suaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbXBsZXRlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLmNvbXBsZXRlRW1pdHRlci5maXJlKCk7XG5cblx0XHR0aGlzLnRlbGVtZXRyeS5wdWJsaWNMb2cyPFxuXHRcdFx0eyBmYWlsdXJlczogbnVtYmVyOyBwYXNzZXM6IG51bWJlcjsgY29udHJvbGxlcjogc3RyaW5nIH0sXG5cdFx0XHR7XG5cdFx0XHRcdG93bmVyOiAnY29ubm9yNDMxMic7XG5cdFx0XHRcdGNvbW1lbnQ6ICdUZXN0IG91dGNvbWUgbWV0cmljcy4gVGhpcyBoZWxwcyB1cyB1bmRlcnN0YW5kIG1hZ25pdHVkZSBvZiBmZWF0dXJlIHVzZSBhbmQgaG93IHRvIGJ1aWxkIGZpeCBzdWdnZXN0aW9ucy4nO1xuXHRcdFx0XHRmYWlsdXJlczogeyBjb21tZW50OiAnTnVtYmVyIG9mIHRlc3QgZmFpbHVyZXMnOyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JyB9O1xuXHRcdFx0XHRwYXNzZXM6IHsgY29tbWVudDogJ051bWJlciBvZiB0ZXN0IGZhaWx1cmVzJzsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCcgfTtcblx0XHRcdFx0Y29udHJvbGxlcjogeyBjb21tZW50OiAnVGhlIHRlc3QgY29udHJvbGxlciBiZWluZyB1c2VkJzsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCcgfTtcblx0XHRcdH1cblx0XHQ+KCd0ZXN0Lm91dGNvbWVzJywge1xuXHRcdFx0ZmFpbHVyZXM6IHRoaXMuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5FcnJvcmVkXSArIHRoaXMuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5GYWlsZWRdLFxuXHRcdFx0cGFzc2VzOiB0aGlzLmNvdW50c1tUZXN0UmVzdWx0U3RhdGUuUGFzc2VkXSxcblx0XHRcdGNvbnRyb2xsZXI6IHRoaXMucmVxdWVzdC50YXJnZXRzLm1hcCh0ID0+IHQuY29udHJvbGxlcklkKS5qb2luKCcsJylcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrcyB0aGUgdGVzdCBhbmQgYWxsIG9mIGl0cyBjaGlsZHJlbiBpbiB0aGUgcnVuIGFzIHJldGlyZWQuXG5cdCAqL1xuXHRwdWJsaWMgbWFya1JldGlyZWQodGVzdElkczogV2VsbERlZmluZWRQcmVmaXhUcmVlPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQpIHtcblx0XHRmb3IgKGNvbnN0IFtpZCwgdGVzdF0gb2YgdGhpcy50ZXN0QnlJZCkge1xuXHRcdFx0aWYgKCF0ZXN0LnJldGlyZWQgJiYgKCF0ZXN0SWRzIHx8IHRlc3RJZHMuaGFzS2V5T3JQYXJlbnQoVGVzdElkLmZyb21TdHJpbmcoaWQpLnBhdGgpKSkge1xuXHRcdFx0XHR0ZXN0LnJldGlyZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLmNoYW5nZUVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uQ29tcHV0ZWRTdGF0ZUNoYW5nZSwgaXRlbTogdGVzdCwgcmVzdWx0OiB0aGlzIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHRvSlNPTigpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wbGV0ZWRBdCAmJiB0aGlzLnBlcnNpc3QgPyB0aGlzLmRvU2VyaWFsaXplLnZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHRvSlNPTldpdGhNZXNzYWdlcygpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wbGV0ZWRBdCAmJiB0aGlzLnBlcnNpc3QgPyB0aGlzLmRvU2VyaWFsaXplV2l0aE1lc3NhZ2VzLnZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgYWxsIHRlc3RzIGluIHRoZSBjb2xsZWN0aW9uIHRvIHRoZSBnaXZlbiBzdGF0ZS5cblx0ICovXG5cdHByb3RlY3RlZCBzZXRBbGxUb1N0YXRlKHN0YXRlOiBUZXN0UmVzdWx0U3RhdGUsIHRhc2tJZDogc3RyaW5nLCB3aGVuOiAodGFzazogSVRlc3RUYXNrU3RhdGUsIGl0ZW06IFRlc3RSZXN1bHRJdGVtKSA9PiBib29sZWFuKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm11c3RHZXRUYXNrSW5kZXgodGFza0lkKTtcblx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGhpcy50ZXN0QnlJZC52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHdoZW4odGVzdC50YXNrc1tpbmRleF0sIHRlc3QpKSB7XG5cdFx0XHRcdHRoaXMuZmlyZVVwZGF0ZUFuZFJlZnJlc2godGVzdCwgaW5kZXgsIHN0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpcmVVcGRhdGVBbmRSZWZyZXNoKGVudHJ5OiBUZXN0UmVzdWx0SXRlbSwgdGFza0luZGV4OiBudW1iZXIsIG5ld1N0YXRlOiBUZXN0UmVzdWx0U3RhdGUsIG5ld093bkR1cmF0aW9uPzogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcHJldmlvdXNPd25Db21wdXRlZCA9IGVudHJ5Lm93bkNvbXB1dGVkU3RhdGU7XG5cdFx0Y29uc3QgcHJldmlvdXNPd25EdXJhdGlvbiA9IGVudHJ5Lm93bkR1cmF0aW9uO1xuXHRcdGNvbnN0IGNoYW5nZUV2ZW50OiBUZXN0UmVzdWx0SXRlbUNoYW5nZSA9IHtcblx0XHRcdGl0ZW06IGVudHJ5LFxuXHRcdFx0cmVzdWx0OiB0aGlzLFxuXHRcdFx0cmVhc29uOiBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbi5Pd25TdGF0ZUNoYW5nZSxcblx0XHRcdHByZXZpb3VzU3RhdGU6IHByZXZpb3VzT3duQ29tcHV0ZWQsXG5cdFx0XHRwcmV2aW91c093bkR1cmF0aW9uOiBwcmV2aW91c093bkR1cmF0aW9uLFxuXHRcdH07XG5cblx0XHRlbnRyeS50YXNrc1t0YXNrSW5kZXhdLnN0YXRlID0gbmV3U3RhdGU7XG5cdFx0aWYgKG5ld093bkR1cmF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJ5LnRhc2tzW3Rhc2tJbmRleF0uZHVyYXRpb24gPSBuZXdPd25EdXJhdGlvbjtcblx0XHRcdGVudHJ5Lm93bkR1cmF0aW9uID0gTWF0aC5tYXgoZW50cnkub3duRHVyYXRpb24gfHwgMCwgbmV3T3duRHVyYXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld093bkNvbXB1dGVkID0gbWF4UHJpb3JpdHkoLi4uZW50cnkudGFza3MubWFwKHQgPT4gdC5zdGF0ZSkpO1xuXHRcdGlmIChuZXdPd25Db21wdXRlZCA9PT0gcHJldmlvdXNPd25Db21wdXRlZCkge1xuXHRcdFx0aWYgKG5ld093bkR1cmF0aW9uICE9PSBwcmV2aW91c093bkR1cmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuY2hhbmdlRW1pdHRlci5maXJlKGNoYW5nZUV2ZW50KTsgLy8gZmlyZSBtYW51YWxseSBzaW5jZSBzdGF0ZSBjaGFuZ2Ugd29uJ3QgZG8gaXRcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlbnRyeS5vd25Db21wdXRlZFN0YXRlID0gbmV3T3duQ29tcHV0ZWQ7XG5cdFx0dGhpcy5jb3VudHNbcHJldmlvdXNPd25Db21wdXRlZF0tLTtcblx0XHR0aGlzLmNvdW50c1tuZXdPd25Db21wdXRlZF0rKztcblx0XHRyZWZyZXNoQ29tcHV0ZWRTdGF0ZSh0aGlzLmNvbXB1dGVkU3RhdGVBY2Nlc3NvciwgZW50cnkpLmZvckVhY2godCA9PlxuXHRcdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUodCA9PT0gZW50cnkgPyBjaGFuZ2VFdmVudCA6IHtcblx0XHRcdFx0aXRlbTogdCxcblx0XHRcdFx0cmVzdWx0OiB0aGlzLFxuXHRcdFx0XHRyZWFzb246IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLkNvbXB1dGVkU3RhdGVDaGFuZ2UsXG5cdFx0XHR9KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRUZXN0VG9SdW4oY29udHJvbGxlcklkOiBzdHJpbmcsIGl0ZW06IElUZXN0SXRlbSwgcGFyZW50OiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0Y29uc3Qgbm9kZSA9IGl0ZW1Ub05vZGUoY29udHJvbGxlcklkLCBpdGVtLCBwYXJlbnQpO1xuXHRcdHRoaXMudGVzdEJ5SWQuc2V0KGl0ZW0uZXh0SWQsIG5vZGUpO1xuXHRcdHRoaXMuY291bnRzW1Rlc3RSZXN1bHRTdGF0ZS5VbnNldF0rKztcblxuXHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdHRoaXMudGVzdEJ5SWQuZ2V0KHBhcmVudCk/LmNoaWxkcmVuLnB1c2gobm9kZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudGFza3MubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudGFza3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bm9kZS50YXNrcy5wdXNoKHsgZHVyYXRpb246IHVuZGVmaW5lZCwgbWVzc2FnZXM6IFtdLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLlVuc2V0IH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBtdXN0R2V0VGFza0luZGV4KHRhc2tJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnRhc2tzLmZpbmRJbmRleCh0ID0+IHQuaWQgPT09IHRhc2tJZCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRhc2sgJHt0YXNrSWR9IGluIHVwZGF0ZVN0YXRlYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBkb1NlcmlhbGl6ZSA9IG5ldyBMYXp5KCgpOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzID0+ICh7XG5cdFx0aWQ6IHRoaXMuaWQsXG5cdFx0Y29tcGxldGVkQXQ6IHRoaXMuY29tcGxldGVkQXQhLFxuXHRcdHRhc2tzOiB0aGlzLnRhc2tzLm1hcCh0ID0+ICh7IGlkOiB0LmlkLCBuYW1lOiB0Lm5hbWUsIGN0cmxJZDogdC5jdHJsSWQsIGhhc0NvdmVyYWdlOiAhIXQuY292ZXJhZ2UuZ2V0KCkgfSkpLFxuXHRcdG5hbWU6IHRoaXMubmFtZSxcblx0XHRyZXF1ZXN0OiB0aGlzLnJlcXVlc3QsXG5cdFx0aXRlbXM6IFsuLi50aGlzLnRlc3RCeUlkLnZhbHVlcygpXS5tYXAoVGVzdFJlc3VsdEl0ZW0uc2VyaWFsaXplV2l0aG91dE1lc3NhZ2VzKSxcblx0fSkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZG9TZXJpYWxpemVXaXRoTWVzc2FnZXMgPSBuZXcgTGF6eSgoKTogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cyA9PiAoe1xuXHRcdGlkOiB0aGlzLmlkLFxuXHRcdGNvbXBsZXRlZEF0OiB0aGlzLmNvbXBsZXRlZEF0ISxcblx0XHR0YXNrczogdGhpcy50YXNrcy5tYXAodCA9PiAoeyBpZDogdC5pZCwgbmFtZTogdC5uYW1lLCBjdHJsSWQ6IHQuY3RybElkLCBoYXNDb3ZlcmFnZTogISF0LmNvdmVyYWdlLmdldCgpIH0pKSxcblx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0cmVxdWVzdDogdGhpcy5yZXF1ZXN0LFxuXHRcdGl0ZW1zOiBbLi4udGhpcy50ZXN0QnlJZC52YWx1ZXMoKV0ubWFwKFRlc3RSZXN1bHRJdGVtLnNlcmlhbGl6ZSksXG5cdH0pKTtcbn1cblxuLyoqXG4gKiBUZXN0IHJlc3VsdHMgaHlkcmF0ZWQgZnJvbSBhIHByZXZpb3VzbHktc2VyaWFsaXplZCB0ZXN0IHJ1bi5cbiAqL1xuZXhwb3J0IGNsYXNzIEh5ZHJhdGVkVGVzdFJlc3VsdCBpbXBsZW1lbnRzIElUZXN0UmVzdWx0IHtcblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgY291bnRzID0gbWFrZUVtcHR5Q291bnRzKCk7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjb21wbGV0ZWRBdDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHRhc2tzOiBJVGVzdFJ1blRhc2tSZXN1bHRzW107XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHRlc3RzKCkge1xuXHRcdHJldHVybiB0aGlzLnRlc3RCeUlkLnZhbHVlcygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3Q6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0ZXN0QnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0UmVzdWx0SXRlbT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZGVudGl0eTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwZXJzaXN0ID0gdHJ1ZSxcblx0KSB7XG5cdFx0dGhpcy5pZCA9IHNlcmlhbGl6ZWQuaWQ7XG5cdFx0dGhpcy5jb21wbGV0ZWRBdCA9IHNlcmlhbGl6ZWQuY29tcGxldGVkQXQ7XG5cdFx0dGhpcy50YXNrcyA9IHNlcmlhbGl6ZWQudGFza3MubWFwKCh0YXNrLCBpKSA9PiAoe1xuXHRcdFx0aWQ6IHRhc2suaWQsXG5cdFx0XHRuYW1lOiB0YXNrLm5hbWUgfHwgbG9jYWxpemUoJ3Rlc3RVbm5hbWVkVGFzaycsICdVbm5hbWVkIFRhc2snKSxcblx0XHRcdGN0cmxJZDogdGFzay5jdHJsSWQsXG5cdFx0XHRydW5uaW5nOiBmYWxzZSxcblx0XHRcdGNvdmVyYWdlOiBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKSxcblx0XHRcdG91dHB1dDogZW1wdHlSYXdPdXRwdXQsXG5cdFx0XHRvdGhlck1lc3NhZ2VzOiBbXVxuXHRcdH0pKTtcblx0XHR0aGlzLm5hbWUgPSBzZXJpYWxpemVkLm5hbWU7XG5cdFx0dGhpcy5yZXF1ZXN0ID0gc2VyaWFsaXplZC5yZXF1ZXN0O1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlcmlhbGl6ZWQuaXRlbXMpIHtcblx0XHRcdGNvbnN0IGRlID0gVGVzdFJlc3VsdEl0ZW0uZGVzZXJpYWxpemUoaWRlbnRpdHksIGl0ZW0pO1xuXHRcdFx0dGhpcy5jb3VudHNbZGUub3duQ29tcHV0ZWRTdGF0ZV0rKztcblx0XHRcdHRoaXMudGVzdEJ5SWQuc2V0KGl0ZW0uaXRlbS5leHRJZCwgZGUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldFN0YXRlQnlJZChleHRUZXN0SWQ6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLnRlc3RCeUlkLmdldChleHRUZXN0SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgdG9KU09OKCk6IElTZXJpYWxpemVkVGVzdFJlc3VsdHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnBlcnNpc3QgPyB0aGlzLnNlcmlhbGl6ZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyB0b0pTT05XaXRoTWVzc2FnZXMoKTogSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudG9KU09OKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUVsQyxTQUFpQyw0QkFBNEI7QUFFN0QsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsaUJBQWlCLGFBQWEsZUFBZSwrQkFBK0M7QUFDckcsU0FBUyxXQUFxSixxQkFBcUIsaUJBQWlCLGdCQUFnQix1QkFBdUI7QUF3RjNPLE1BQU0saUJBQWlDO0FBQUEsRUFDdEMsU0FBUyxDQUFDO0FBQUEsRUFDVixRQUFRO0FBQUEsRUFDUixnQkFBZ0IsTUFBTTtBQUFBLEVBQ3RCLFlBQVksUUFBUSxRQUFRO0FBQUEsRUFDNUIsVUFBVSxNQUFNLFNBQVMsTUFBTSxDQUFDO0FBQUEsRUFDaEMsY0FBYyxNQUFNLENBQUM7QUFDdEI7QUFFTyxNQUFNLGNBQXdDO0FBQUEsRUFBOUM7QUFDTixTQUFpQixtQkFBbUIsSUFBSSxRQUFrQjtBQUMxRCxTQUFpQixjQUFjLElBQUksZ0JBQXNCO0FBQ3pELFNBQVEsU0FBUztBQUdqQjtBQUFBLFNBQWdCLGlCQUFpQixLQUFLLGlCQUFpQjtBQUd2RDtBQUFBLFNBQWdCLGFBQWEsS0FBSyxZQUFZO0FBRzlDO0FBQUEsU0FBZ0IsVUFBc0IsQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUd2QyxJQUFXLFNBQVM7QUFDbkIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUEsRUFHQSxTQUFTLE9BQWUsUUFBMEI7QUFDakQsVUFBTSxNQUFNLFNBQVMsTUFBTSxNQUFNO0FBQ2pDLFFBQUksZUFBZTtBQUNuQixlQUFXLFNBQVMsS0FBSyxhQUFhLE9BQU8sTUFBTSxHQUFHO0FBQ3JELFVBQUksT0FBTyxJQUFJLE1BQU0sUUFBUSxZQUFZO0FBQ3pDLHNCQUFnQixNQUFNO0FBQUEsSUFDdkI7QUFFQSxXQUFPLGVBQWUsU0FBUyxJQUFJLE1BQU0sR0FBRyxZQUFZLElBQUk7QUFBQSxFQUM3RDtBQUFBO0FBQUEsRUFHQSxDQUFDLGFBQWEsT0FBZSxRQUFnQjtBQUM1QyxRQUFJLFFBQVE7QUFDWixRQUFJLG1CQUFtQjtBQUN2QixlQUFXLEtBQUssS0FBSyxTQUFTO0FBQzdCLFVBQUksbUJBQW1CLEVBQUUsY0FBYyxPQUFPO0FBQzdDLDRCQUFvQixFQUFFO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxLQUFLLElBQUksR0FBRyxRQUFRLGdCQUFnQjtBQUNuRCxZQUFNLE9BQU8sS0FBSyxJQUFJLEVBQUUsWUFBWSxTQUFTLFNBQVMsS0FBSztBQUUzRCxZQUFNLEVBQUUsTUFBTSxRQUFRLElBQUk7QUFDMUIsZUFBUyxPQUFPO0FBQ2hCLDBCQUFvQixFQUFFO0FBRXRCLFVBQUksVUFBVSxRQUFRO0FBQ3JCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxPQUFPLE1BQWdCLFFBQWlCO0FBQzlDLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFFBQUksU0FBUyxLQUFLO0FBQ2xCLFFBQUksV0FBVyxRQUFXO0FBQ3pCLFdBQUssS0FBSyxJQUFJO0FBQ2QsYUFBTyxFQUFFLFFBQVEsT0FBTztBQUFBLElBQ3pCO0FBT0EsUUFBVztBQUFYLE1BQVdBLGVBQVg7QUFDQyxNQUFBQSxzQkFBQSxRQUFLLE1BQUw7QUFDQSxNQUFBQSxzQkFBQSxRQUFLLE1BQUw7QUFBQSxPQUZVO0FBS1gsVUFBTSxRQUFRLFNBQVMsV0FBVyxZQUFZLFFBQVEsSUFBSSxDQUFDO0FBQzNELFVBQU0sTUFBTSxTQUFTLFdBQVcsWUFBWSxRQUFRLEtBQUssQ0FBQztBQUMxRCxjQUFVLE1BQU0sYUFBYSxJQUFJO0FBRWpDLFNBQUssS0FBSyxLQUFLO0FBQ2YsUUFBSSxVQUFVLEtBQUs7QUFDbkIsV0FBTyxVQUFVLEdBQUcsV0FBVztBQUM5QixZQUFNLE9BQU8sS0FBSyxPQUFPLFVBQVUsQ0FBQztBQUNwQyxVQUFJLFNBQVMsZUFBZ0IsU0FBUyxhQUFjO0FBQ25EO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLEtBQUssS0FBSyxNQUFNLEdBQUcsT0FBTyxDQUFDO0FBQ2hDLFNBQUssS0FBSyxHQUFHO0FBQ2IsU0FBSyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFHN0IsV0FBTyxFQUFFLFFBQVEsT0FBTztBQUFBLEVBQ3pCO0FBQUEsRUFFUSxLQUFLLE1BQWdCO0FBQzVCLFFBQUksS0FBSyxlQUFlLEdBQUc7QUFDMUI7QUFBQSxJQUNEO0FBRUEsU0FBSyxRQUFRLEtBQUssSUFBSTtBQUN0QixTQUFLLGlCQUFpQixLQUFLLElBQUk7QUFDL0IsU0FBSyxVQUFVLEtBQUs7QUFBQSxFQUNyQjtBQUFBO0FBQUEsRUFHTyxNQUFNO0FBQ1osU0FBSyxZQUFZLFNBQVM7QUFBQSxFQUMzQjtBQUNEO0FBRU8sTUFBTSxvQkFBb0IsV0FBVyxTQUFzQixNQUFzQjtBQUN2RixhQUFXLE1BQU0sT0FBTyxXQUFXLEtBQUssS0FBSyxLQUFLLEVBQUUsVUFBVSxHQUFHO0FBQ2hFLFVBQU0sUUFBUSxhQUFhLEdBQUcsU0FBUyxDQUFDO0FBQUEsRUFDekM7QUFDRDtBQUVPLE1BQU0sbUJBQW1CLENBQUMsV0FBcUM7QUFDckUsYUFBVyxTQUFTLGVBQWU7QUFDbEMsUUFBSSxPQUFPLEtBQUssSUFBSSxHQUFHO0FBQ3RCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLFNBQU8sZ0JBQWdCO0FBQ3hCO0FBRUEsTUFBTSxjQUFjLENBQUMsUUFBZ0IsVUFBbUIsdUJBQXVCLFVBQVUsUUFBUSxLQUFLLENBQUM7QUFPdkcsTUFBTSxhQUFhLENBQUMsY0FBc0IsTUFBaUIsWUFBdUQ7QUFBQSxFQUNqSDtBQUFBLEVBQ0EsUUFBUSxvQkFBb0I7QUFBQSxFQUM1QixNQUFNLEVBQUUsR0FBRyxLQUFLO0FBQUEsRUFDaEIsVUFBVSxDQUFDO0FBQUEsRUFDWCxPQUFPLENBQUM7QUFBQSxFQUNSLGtCQUFrQixnQkFBZ0I7QUFBQSxFQUNsQyxlQUFlLGdCQUFnQjtBQUNoQztBQUVPLElBQVcsNkJBQVgsa0JBQVdDLGdDQUFYO0FBQ04sRUFBQUEsd0RBQUE7QUFDQSxFQUFBQSx3REFBQTtBQUNBLEVBQUFBLHdEQUFBO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQWdCWCxJQUFNLGlCQUFOLGNBQTZCLFdBQWtDO0FBQUEsRUE0RHJFLFlBQ2lCLElBQ0EsU0FDQSxTQUNBLGFBQ29CLFdBQ25DO0FBQ0QsVUFBTTtBQU5VO0FBQ0E7QUFDQTtBQUNBO0FBQ29CO0FBaEVyQyxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3JFLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3RFLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3RFLFNBQWlCLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxRQUE4QixDQUFDO0FBRW5GO0FBQUEsU0FBaUIsV0FBVyxvQkFBSSxJQUF3QztBQUN4RSxTQUFRLG9CQUFvQjtBQUc1QixTQUFnQixZQUFZLEtBQUssSUFBSTtBQUNyQyxTQUFnQixXQUFXLEtBQUssY0FBYztBQUM5QyxTQUFnQixhQUFhLEtBQUssZ0JBQWdCO0FBQ2xELFNBQWdCLFlBQVksS0FBSyxlQUFlO0FBQ2hELFNBQWdCLFlBQVksS0FBSyxlQUFlO0FBQ2hELFNBQWdCLFFBQTZELENBQUM7QUFDOUUsU0FBZ0IsT0FBTyxTQUFTLGVBQWUsb0JBQW1CLG9CQUFJLEtBQUssR0FBRSxlQUFlLFFBQVEsQ0FBQztBQVlyRztBQUFBO0FBQUE7QUFBQSxTQUFnQixTQUFTLGdCQUFnQjtBQWN6QyxTQUFpQix3QkFBNEU7QUFBQSxNQUM1RixhQUFhLE9BQUssRUFBRTtBQUFBLE1BQ3BCLHlCQUF5QixPQUFLLEVBQUU7QUFBQSxNQUNoQyxrQkFBa0IsQ0FBQyxHQUFHLE1BQU0sRUFBRSxnQkFBZ0I7QUFBQSxNQUM5QyxhQUFhLE9BQUssRUFBRTtBQUFBLE1BQ3BCLFlBQVksT0FBSztBQUNoQixjQUFNLEVBQUUsVUFBVSxZQUFZLElBQUk7QUFDbEMsZ0JBQVEsYUFBYTtBQUNwQixnQkFBTSxXQUFXLE9BQU8sV0FBVyxFQUFFLEtBQUssS0FBSyxFQUFFO0FBQ2pELGNBQUksVUFBVTtBQUNiLHVCQUFXLE1BQU0sU0FBUyxVQUFVLEdBQUc7QUFDdEMsb0JBQU0sWUFBWSxJQUFJLEdBQUcsU0FBUyxDQUFDO0FBQUEsWUFDcEM7QUFBQSxVQUNEO0FBQUEsUUFDRCxHQUFHO0FBQUEsTUFDSjtBQUFBLElBQ0Q7QUFnUkEsU0FBaUIsY0FBYyxJQUFJLEtBQUssT0FBK0I7QUFBQSxNQUN0RSxJQUFJLEtBQUs7QUFBQSxNQUNULGFBQWEsS0FBSztBQUFBLE1BQ2xCLE9BQU8sS0FBSyxNQUFNLElBQUksUUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLE1BQU0sRUFBRSxNQUFNLFFBQVEsRUFBRSxRQUFRLGFBQWEsQ0FBQyxDQUFDLEVBQUUsU0FBUyxJQUFJLEVBQUUsRUFBRTtBQUFBLE1BQzFHLE1BQU0sS0FBSztBQUFBLE1BQ1gsU0FBUyxLQUFLO0FBQUEsTUFDZCxPQUFPLENBQUMsR0FBRyxLQUFLLFNBQVMsT0FBTyxDQUFDLEVBQUUsSUFBSSxlQUFlLHdCQUF3QjtBQUFBLElBQy9FLEVBQUU7QUFFRixTQUFpQiwwQkFBMEIsSUFBSSxLQUFLLE9BQStCO0FBQUEsTUFDbEYsSUFBSSxLQUFLO0FBQUEsTUFDVCxhQUFhLEtBQUs7QUFBQSxNQUNsQixPQUFPLEtBQUssTUFBTSxJQUFJLFFBQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxNQUFNLEVBQUUsTUFBTSxRQUFRLEVBQUUsUUFBUSxhQUFhLENBQUMsQ0FBQyxFQUFFLFNBQVMsSUFBSSxFQUFFLEVBQUU7QUFBQSxNQUMxRyxNQUFNLEtBQUs7QUFBQSxNQUNYLFNBQVMsS0FBSztBQUFBLE1BQ2QsT0FBTyxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUFFLElBQUksZUFBZSxTQUFTO0FBQUEsSUFDaEUsRUFBRTtBQUFBLEVBdFJGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEvQ0EsSUFBVyxjQUFjO0FBQ3hCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLElBQVcsUUFBUTtBQUNsQixXQUFPLEtBQUssU0FBUyxPQUFPO0FBQUEsRUFDN0I7QUFBQTtBQUFBLEVBR08sWUFBWSxJQUFZO0FBQzlCLFdBQU8sS0FBSyxTQUFTLElBQUksRUFBRSxHQUFHO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWlDTyxhQUFhLFdBQW1CO0FBQ3RDLFdBQU8sS0FBSyxTQUFTLElBQUksU0FBUztBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxhQUFhLFFBQWtCLFFBQWdCLFVBQTBCLFFBQXVCO0FBQ3RHLFVBQU0sYUFBYSxPQUFPLGFBQWEsTUFBTSxPQUFPLE1BQU0sR0FBRyxHQUFHLEVBQUUsU0FBUyxJQUFJLFdBQU0sT0FBTyxTQUFTO0FBQ3JHLFVBQU0sVUFBVSxzQkFBc0IsVUFBVTtBQUNoRCxRQUFJO0FBSUosUUFBSSxVQUFVLFVBQVU7QUFDdkIsZUFBUyxLQUFLO0FBQUEsSUFDZjtBQUVBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixNQUFNO0FBQzFDLFVBQU0sT0FBTyxLQUFLLE1BQU0sS0FBSztBQUU3QixVQUFNLEVBQUUsUUFBUSxPQUFPLElBQUksS0FBSyxPQUFPLE9BQU8sUUFBUSxNQUFNO0FBQzVELFVBQU0sVUFBOEI7QUFBQSxNQUNuQztBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTSxnQkFBZ0I7QUFBQSxJQUN2QjtBQUVBLFVBQU0sT0FBTyxVQUFVLEtBQUssU0FBUyxJQUFJLE1BQU07QUFDL0MsUUFBSSxNQUFNO0FBQ1QsV0FBSyxNQUFNLEtBQUssRUFBRSxTQUFTLEtBQUssT0FBTztBQUN2QyxXQUFLLGNBQWMsS0FBSyxFQUFFLE1BQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxvQkFBdUMsUUFBUSxDQUFDO0FBQUEsSUFDN0csT0FBTztBQUNOLFdBQUssY0FBYyxLQUFLLE9BQU87QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFFBQVEsTUFBb0I7QUFDbEMsU0FBSyxNQUFNLEtBQUssRUFBRSxHQUFHLE1BQU0sVUFBVSxnQkFBZ0IsTUFBTSxNQUFTLEdBQUcsZUFBZSxDQUFDLEdBQUcsUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO0FBRXZILGVBQVcsUUFBUSxLQUFLLE9BQU87QUFDOUIsV0FBSyxNQUFNLEtBQUssRUFBRSxVQUFVLFFBQVcsVUFBVSxDQUFDLEdBQUcsT0FBTyxnQkFBZ0IsTUFBTSxDQUFDO0FBQUEsSUFDcEY7QUFFQSxTQUFLLGVBQWUsS0FBSyxLQUFLLE1BQU0sU0FBUyxDQUFDO0FBQUEsRUFDL0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTU8sa0JBQWtCLGNBQXNCLE9BQWlDO0FBQy9FLFFBQUksU0FBUyxLQUFLLFNBQVMsSUFBSSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBQzdDLFFBQUksQ0FBQyxRQUFRO0FBQ1osZUFBUyxLQUFLLGFBQWEsY0FBYyxNQUFNLENBQUMsR0FBRyxJQUFJO0FBQUEsSUFDeEQ7QUFFQSxhQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQ3RDLGVBQVMsS0FBSyxhQUFhLGNBQWMsTUFBTSxDQUFDLEdBQUcsT0FBTyxLQUFLLEtBQUs7QUFBQSxJQUNyRTtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxZQUFZLFFBQWdCLFFBQWdCLE9BQXdCLFVBQW1CO0FBQzdGLFVBQU0sUUFBUSxLQUFLLFNBQVMsSUFBSSxNQUFNO0FBQ3RDLFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssaUJBQWlCLE1BQU07QUFFMUMsVUFBTSx1QkFBdUIsd0JBQXdCLE1BQU0sTUFBTSxLQUFLLEVBQUUsS0FBSztBQUM3RSxVQUFNLHVCQUF1Qix3QkFBd0IsS0FBSztBQUkxRCxRQUFJLHlCQUF5QixXQUMzQix5QkFBeUIsVUFBYSx1QkFBdUIsdUJBQXVCO0FBQ3JGO0FBQUEsSUFDRDtBQUVBLFNBQUsscUJBQXFCLE9BQU8sT0FBTyxPQUFPLFFBQVE7QUFBQSxFQUN4RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sY0FBYyxRQUFnQixRQUFnQixTQUF1QjtBQUMzRSxVQUFNLFFBQVEsS0FBSyxTQUFTLElBQUksTUFBTTtBQUN0QyxRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSxLQUFLLGlCQUFpQixNQUFNLENBQUMsRUFBRSxTQUFTLEtBQUssT0FBTztBQUNoRSxTQUFLLGNBQWMsS0FBSyxFQUFFLE1BQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxvQkFBdUMsUUFBUSxDQUFDO0FBQUEsRUFDOUc7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLGlCQUFpQixRQUFnQjtBQUN2QyxVQUFNLFFBQVEsS0FBSyxpQkFBaUIsTUFBTTtBQUMxQyxVQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUs7QUFDN0IsU0FBSyxVQUFVO0FBQ2YsU0FBSyxPQUFPLElBQUk7QUFFaEIsU0FBSztBQUFBLE1BQ0osZ0JBQWdCO0FBQUEsTUFDaEI7QUFBQSxNQUNBLE9BQUssRUFBRSxVQUFVLGdCQUFnQixVQUFVLEVBQUUsVUFBVSxnQkFBZ0I7QUFBQSxJQUN4RTtBQUVBLFNBQUssZUFBZSxLQUFLLEtBQUs7QUFBQSxFQUMvQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sZUFBZTtBQUNyQixRQUFJLEtBQUssaUJBQWlCLFFBQVc7QUFDcEMsWUFBTSxJQUFJLE1BQU0sOENBQThDO0FBQUEsSUFDL0Q7QUFFQSxlQUFXLFFBQVEsS0FBSyxPQUFPO0FBQzlCLFVBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQUssaUJBQWlCLEtBQUssRUFBRTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZSxLQUFLLElBQUk7QUFDN0IsU0FBSyxnQkFBZ0IsS0FBSztBQUUxQixTQUFLLFVBQVUsV0FTYixpQkFBaUI7QUFBQSxNQUNsQixVQUFVLEtBQUssT0FBTyxnQkFBZ0IsT0FBTyxJQUFJLEtBQUssT0FBTyxnQkFBZ0IsTUFBTTtBQUFBLE1BQ25GLFFBQVEsS0FBSyxPQUFPLGdCQUFnQixNQUFNO0FBQUEsTUFDMUMsWUFBWSxLQUFLLFFBQVEsUUFBUSxJQUFJLE9BQUssRUFBRSxZQUFZLEVBQUUsS0FBSyxHQUFHO0FBQUEsSUFDbkUsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFlBQVksU0FBdUQ7QUFDekUsZUFBVyxDQUFDLElBQUksSUFBSSxLQUFLLEtBQUssVUFBVTtBQUN2QyxVQUFJLENBQUMsS0FBSyxZQUFZLENBQUMsV0FBVyxRQUFRLGVBQWUsT0FBTyxXQUFXLEVBQUUsRUFBRSxJQUFJLElBQUk7QUFDdEYsYUFBSyxVQUFVO0FBQ2YsYUFBSyxjQUFjLEtBQUssRUFBRSxRQUFRLDZCQUFnRCxNQUFNLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFBQSxNQUM3RztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxTQUE2QztBQUNuRCxXQUFPLEtBQUssZUFBZSxLQUFLLFVBQVUsS0FBSyxZQUFZLFFBQVE7QUFBQSxFQUNwRTtBQUFBLEVBRU8scUJBQXlEO0FBQy9ELFdBQU8sS0FBSyxlQUFlLEtBQUssVUFBVSxLQUFLLHdCQUF3QixRQUFRO0FBQUEsRUFDaEY7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtVLGNBQWMsT0FBd0IsUUFBZ0IsTUFBK0Q7QUFDOUgsVUFBTSxRQUFRLEtBQUssaUJBQWlCLE1BQU07QUFDMUMsZUFBVyxRQUFRLEtBQUssU0FBUyxPQUFPLEdBQUc7QUFDMUMsVUFBSSxLQUFLLEtBQUssTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHO0FBQ2xDLGFBQUsscUJBQXFCLE1BQU0sT0FBTyxLQUFLO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE9BQXVCLFdBQW1CLFVBQTJCLGdCQUF5QjtBQUMxSCxVQUFNLHNCQUFzQixNQUFNO0FBQ2xDLFVBQU0sc0JBQXNCLE1BQU07QUFDbEMsVUFBTSxjQUFvQztBQUFBLE1BQ3pDLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUNSLGVBQWU7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSxTQUFTLEVBQUUsUUFBUTtBQUMvQixRQUFJLG1CQUFtQixRQUFXO0FBQ2pDLFlBQU0sTUFBTSxTQUFTLEVBQUUsV0FBVztBQUNsQyxZQUFNLGNBQWMsS0FBSyxJQUFJLE1BQU0sZUFBZSxHQUFHLGNBQWM7QUFBQSxJQUNwRTtBQUVBLFVBQU0saUJBQWlCLFlBQVksR0FBRyxNQUFNLE1BQU0sSUFBSSxPQUFLLEVBQUUsS0FBSyxDQUFDO0FBQ25FLFFBQUksbUJBQW1CLHFCQUFxQjtBQUMzQyxVQUFJLG1CQUFtQixxQkFBcUI7QUFDM0MsYUFBSyxjQUFjLEtBQUssV0FBVztBQUFBLE1BQ3BDO0FBQ0E7QUFBQSxJQUNEO0FBRUEsVUFBTSxtQkFBbUI7QUFDekIsU0FBSyxPQUFPLG1CQUFtQjtBQUMvQixTQUFLLE9BQU8sY0FBYztBQUMxQix5QkFBcUIsS0FBSyx1QkFBdUIsS0FBSyxFQUFFO0FBQUEsTUFBUSxPQUMvRCxLQUFLLGNBQWMsS0FBSyxNQUFNLFFBQVEsY0FBYztBQUFBLFFBQ25ELE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFFBQVE7QUFBQSxNQUNULENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxjQUFzQixNQUFpQixRQUF1QjtBQUNsRixVQUFNLE9BQU8sV0FBVyxjQUFjLE1BQU0sTUFBTTtBQUNsRCxTQUFLLFNBQVMsSUFBSSxLQUFLLE9BQU8sSUFBSTtBQUNsQyxTQUFLLE9BQU8sZ0JBQWdCLEtBQUs7QUFFakMsUUFBSSxRQUFRO0FBQ1gsV0FBSyxTQUFTLElBQUksTUFBTSxHQUFHLFNBQVMsS0FBSyxJQUFJO0FBQUEsSUFDOUM7QUFFQSxRQUFJLEtBQUssTUFBTSxRQUFRO0FBQ3RCLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxNQUFNLFFBQVEsS0FBSztBQUMzQyxhQUFLLE1BQU0sS0FBSyxFQUFFLFVBQVUsUUFBVyxVQUFVLENBQUMsR0FBRyxPQUFPLGdCQUFnQixNQUFNLENBQUM7QUFBQSxNQUNwRjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUJBQWlCLFFBQWdCO0FBQ3hDLFVBQU0sUUFBUSxLQUFLLE1BQU0sVUFBVSxPQUFLLEVBQUUsT0FBTyxNQUFNO0FBQ3ZELFFBQUksVUFBVSxJQUFJO0FBQ2pCLFlBQU0sSUFBSSxNQUFNLGdCQUFnQixNQUFNLGlCQUFpQjtBQUFBLElBQ3hEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFtQkQ7QUEzVmEsaUJBQU47QUFBQSxFQWlFSjtBQUFBLEdBakVVO0FBZ1dOLE1BQU0sbUJBQTBDO0FBQUEsRUF3Q3RELFlBQ0MsVUFDaUIsWUFDQSxVQUFVLE1BQzFCO0FBRmdCO0FBQ0E7QUF2Q2xCO0FBQUE7QUFBQTtBQUFBLFNBQWdCLFNBQVMsZ0JBQWdCO0FBa0N6QyxTQUFpQixXQUFXLG9CQUFJLElBQTRCO0FBTzNELFNBQUssS0FBSyxXQUFXO0FBQ3JCLFNBQUssY0FBYyxXQUFXO0FBQzlCLFNBQUssUUFBUSxXQUFXLE1BQU0sSUFBSSxDQUFDLE1BQU0sT0FBTztBQUFBLE1BQy9DLElBQUksS0FBSztBQUFBLE1BQ1QsTUFBTSxLQUFLLFFBQVEsU0FBUyxtQkFBbUIsY0FBYztBQUFBLE1BQzdELFFBQVEsS0FBSztBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsVUFBVSxnQkFBZ0IsTUFBTSxNQUFTO0FBQUEsTUFDekMsUUFBUTtBQUFBLE1BQ1IsZUFBZSxDQUFDO0FBQUEsSUFDakIsRUFBRTtBQUNGLFNBQUssT0FBTyxXQUFXO0FBQ3ZCLFNBQUssVUFBVSxXQUFXO0FBRTFCLGVBQVcsUUFBUSxXQUFXLE9BQU87QUFDcEMsWUFBTSxLQUFLLGVBQWUsWUFBWSxVQUFVLElBQUk7QUFDcEQsV0FBSyxPQUFPLEdBQUcsZ0JBQWdCO0FBQy9CLFdBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxPQUFPLEVBQUU7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXhDQSxJQUFXLFFBQVE7QUFDbEIsV0FBTyxLQUFLLFNBQVMsT0FBTztBQUFBLEVBQzdCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEyQ08sYUFBYSxXQUFtQjtBQUN0QyxXQUFPLEtBQUssU0FBUyxJQUFJLFNBQVM7QUFBQSxFQUNuQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sU0FBNkM7QUFDbkQsV0FBTyxLQUFLLFVBQVUsS0FBSyxhQUFhO0FBQUEsRUFDekM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHFCQUF5RDtBQUMvRCxXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlRyaW1CeXRlcyIsICJUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbiJdCn0K
