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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { TestCommandId } from "../../contrib/testing/common/constants.js";
import { TestId, TestPosition } from "../../contrib/testing/common/testId.js";
import { InvalidTestItemError } from "../../contrib/testing/common/testItemCollection.js";
import { AbstractIncrementalTestCollection, TestControllerCapability, TestResultState, TestsDiffOp, isStartControllerTests } from "../../contrib/testing/common/testTypes.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ExtHostTestItemCollection, TestItemImpl, TestItemRootImpl, toItemFromContext } from "./extHostTestItem.js";
import * as Convert from "./extHostTypeConverters.js";
import { FileCoverage, TestRunProfileBase, TestRunRequest } from "./extHostTypes.js";
let followupCounter = 0;
const testResultInternalIDs = /* @__PURE__ */ new WeakMap();
const IExtHostTesting = createDecorator("IExtHostTesting");
let ExtHostTesting = class extends Disposable {
  constructor(rpc, logService, commands, editors) {
    super();
    this.logService = logService;
    this.commands = commands;
    this.editors = editors;
    this.resultsChangedEmitter = this._register(new Emitter());
    this.controllers = /* @__PURE__ */ new Map();
    this.defaultProfilesChangedEmitter = this._register(new Emitter());
    this.followupProviders = /* @__PURE__ */ new Set();
    this.testFollowups = /* @__PURE__ */ new Map();
    this.onResultsChanged = this.resultsChangedEmitter.event;
    this.results = [];
    this.proxy = rpc.getProxy(MainContext.MainThreadTesting);
    this.observer = new TestObservers(this.proxy);
    this.runTracker = new TestRunCoordinator(this.proxy, logService);
    commands.registerArgumentProcessor({
      processArgument: (arg) => {
        switch (arg?.$mid) {
          case MarshalledId.TestItemContext: {
            const cast = arg;
            const targetTest = cast.tests[cast.tests.length - 1].item.extId;
            const controller = this.controllers.get(TestId.root(targetTest));
            return controller?.collection.tree.get(targetTest)?.actual ?? toItemFromContext(arg);
          }
          case MarshalledId.TestMessageMenuArgs: {
            const { test, message } = arg;
            const extId = test.item.extId;
            return {
              test: this.controllers.get(TestId.root(extId))?.collection.tree.get(extId)?.actual ?? toItemFromContext({ $mid: MarshalledId.TestItemContext, tests: [test] }),
              message: Convert.TestMessage.to(message)
            };
          }
          default:
            return arg;
        }
      }
    });
    commands.registerCommand(false, "testing.getExplorerSelection", async () => {
      const inner = await commands.executeCommand(TestCommandId.GetExplorerSelection);
      const lookup = (i) => {
        const controller = this.controllers.get(TestId.root(i));
        if (!controller) {
          return void 0;
        }
        return TestId.isRoot(i) ? controller.controller : controller.collection.tree.get(i)?.actual;
      };
      return {
        include: inner?.include.map(lookup).filter(isDefined) || [],
        exclude: inner?.exclude.map(lookup).filter(isDefined) || []
      };
    });
  }
  //#region public API
  /**
   * Implements vscode.test.registerTestProvider
   */
  createTestController(extension, controllerId, label, refreshHandler) {
    if (this.controllers.has(controllerId)) {
      throw new Error(`Attempt to insert a duplicate controller with ID "${controllerId}"`);
    }
    const disposable = new DisposableStore();
    const collection = disposable.add(new ExtHostTestItemCollection(controllerId, label, this.editors));
    collection.root.label = label;
    const profiles = /* @__PURE__ */ new Map();
    const activeProfiles = /* @__PURE__ */ new Set();
    const proxy = this.proxy;
    const getCapability = () => {
      let cap = 0;
      if (refreshHandler) {
        cap |= TestControllerCapability.Refresh;
      }
      const rcp = info.relatedCodeProvider;
      if (rcp) {
        if (rcp?.provideRelatedTests) {
          cap |= TestControllerCapability.TestRelatedToCode;
        }
        if (rcp?.provideRelatedCode) {
          cap |= TestControllerCapability.CodeRelatedToTest;
        }
      }
      return cap;
    };
    const controller = {
      items: collection.root.children,
      get label() {
        return label;
      },
      set label(value) {
        label = value;
        collection.root.label = value;
        proxy.$updateController(controllerId, { label });
      },
      get refreshHandler() {
        return refreshHandler;
      },
      set refreshHandler(value) {
        refreshHandler = value;
        proxy.$updateController(controllerId, { capabilities: getCapability() });
      },
      get id() {
        return controllerId;
      },
      get relatedCodeProvider() {
        return info.relatedCodeProvider;
      },
      set relatedCodeProvider(value) {
        checkProposedApiEnabled(extension, "testRelatedCode");
        info.relatedCodeProvider = value;
        proxy.$updateController(controllerId, { capabilities: getCapability() });
      },
      createRunProfile: (label2, group, runHandler, isDefault, tag, supportsContinuousRun) => {
        let profileId = hash(label2);
        while (profiles.has(profileId)) {
          profileId++;
        }
        return new TestRunProfileImpl(this.proxy, profiles, activeProfiles, this.defaultProfilesChangedEmitter.event, controllerId, profileId, label2, group, runHandler, isDefault, tag, supportsContinuousRun);
      },
      createTestItem(id, label2, uri) {
        return new TestItemImpl(controllerId, id, label2, uri);
      },
      createTestRun: (request, name, persist = true) => {
        return this.runTracker.createTestRun(extension, controllerId, collection, request, name, persist);
      },
      invalidateTestResults: (items) => {
        if (items === void 0) {
          this.proxy.$markTestRetired(void 0);
        } else {
          const itemsArr = items instanceof Array ? items : [items];
          this.proxy.$markTestRetired(itemsArr.map((i) => TestId.fromExtHostTestItem(i, controllerId).toString()));
        }
      },
      set resolveHandler(fn) {
        collection.resolveHandler = fn;
      },
      get resolveHandler() {
        return collection.resolveHandler;
      },
      dispose: () => {
        disposable.dispose();
      }
    };
    const info = { controller, collection, profiles, extension, activeProfiles };
    proxy.$registerTestController(controllerId, label, getCapability());
    disposable.add(toDisposable(() => proxy.$unregisterTestController(controllerId)));
    this.controllers.set(controllerId, info);
    disposable.add(toDisposable(() => this.controllers.delete(controllerId)));
    disposable.add(collection.onDidGenerateDiff((diff) => proxy.$publishDiff(controllerId, diff.map(TestsDiffOp.serialize))));
    return controller;
  }
  /**
   * Implements vscode.test.createTestObserver
   */
  createTestObserver() {
    return this.observer.checkout();
  }
  /**
   * Implements vscode.test.runTests
   */
  async runTests(req, token = CancellationToken.None) {
    const profile = tryGetProfileFromTestRunReq(req);
    if (!profile) {
      throw new Error("The request passed to `vscode.test.runTests` must include a profile");
    }
    const controller = this.controllers.get(profile.controllerId);
    if (!controller) {
      throw new Error("Controller not found");
    }
    await this.proxy.$runTests({
      preserveFocus: req.preserveFocus ?? true,
      group: Convert.TestRunProfileKind.from(profile.kind),
      targets: [{
        testIds: req.include?.map((t) => TestId.fromExtHostTestItem(t, controller.collection.root.id).toString()) ?? [controller.collection.root.id],
        profileId: profile.profileId,
        controllerId: profile.controllerId
      }],
      exclude: req.exclude?.map((t) => t.id)
    }, token);
  }
  /**
   * Implements vscode.test.registerTestFollowupProvider
   */
  registerTestFollowupProvider(provider) {
    this.followupProviders.add(provider);
    return { dispose: () => {
      this.followupProviders.delete(provider);
    } };
  }
  //#endregion
  //#region RPC methods
  /**
   * @inheritdoc
   */
  async $getTestsRelatedToCode(uri, _position, token) {
    const doc = this.editors.getDocument(URI.revive(uri));
    if (!doc) {
      return [];
    }
    const position = Convert.Position.to(_position);
    const related = [];
    await Promise.all([...this.controllers.values()].map(async (c) => {
      let tests;
      try {
        tests = await c.relatedCodeProvider?.provideRelatedTests?.(doc.document, position, token);
      } catch (e) {
        if (!token.isCancellationRequested) {
          this.logService.warn(`Error thrown while providing related tests for ${c.controller.label}`, e);
        }
      }
      if (tests) {
        for (const test of tests) {
          related.push(TestId.fromExtHostTestItem(test, c.controller.id).toString());
        }
        c.collection.flushDiff();
      }
    }));
    return related;
  }
  /**
   * @inheritdoc
   */
  async $getCodeRelatedToTest(testId, token) {
    const controller = this.controllers.get(TestId.root(testId));
    if (!controller) {
      return [];
    }
    const test = controller.collection.tree.get(testId);
    if (!test) {
      return [];
    }
    const locations = await controller.relatedCodeProvider?.provideRelatedCode?.(test.actual, token);
    return locations?.map(Convert.location.from) ?? [];
  }
  /**
   * @inheritdoc
   */
  $syncTests() {
    for (const { collection } of this.controllers.values()) {
      collection.flushDiff();
    }
    return Promise.resolve();
  }
  /**
   * @inheritdoc
   */
  async $getCoverageDetails(coverageId, testId, token) {
    const details = await this.runTracker.getCoverageDetails(coverageId, testId, token);
    return details?.map(Convert.TestCoverage.fromDetails);
  }
  /**
   * @inheritdoc
   */
  async $disposeRun(runId) {
    this.runTracker.disposeTestRun(runId);
  }
  /** @inheritdoc */
  $configureRunProfile(controllerId, profileId) {
    this.controllers.get(controllerId)?.profiles.get(profileId)?.configureHandler?.();
  }
  /** @inheritdoc */
  $setDefaultRunProfiles(profiles) {
    const evt = /* @__PURE__ */ new Map();
    for (const [controllerId, profileIds] of Object.entries(profiles)) {
      const ctrl = this.controllers.get(controllerId);
      if (!ctrl) {
        continue;
      }
      const changes = /* @__PURE__ */ new Map();
      const added = profileIds.filter((id) => !ctrl.activeProfiles.has(id));
      const removed = [...ctrl.activeProfiles].filter((id) => !profileIds.includes(id));
      for (const id of added) {
        changes.set(id, true);
        ctrl.activeProfiles.add(id);
      }
      for (const id of removed) {
        changes.set(id, false);
        ctrl.activeProfiles.delete(id);
      }
      if (changes.size) {
        evt.set(controllerId, changes);
      }
    }
    this.defaultProfilesChangedEmitter.fire(evt);
  }
  /** @inheritdoc */
  async $refreshTests(controllerId, token) {
    await this.controllers.get(controllerId)?.controller.refreshHandler?.(token);
  }
  /**
   * Updates test results shown to extensions.
   * @override
   */
  $publishTestResults(results) {
    this.results = Object.freeze(
      results.map((r) => {
        const o = Convert.TestResults.to(r);
        const taskWithCoverage = r.tasks.findIndex((t) => t.hasCoverage);
        if (taskWithCoverage !== -1) {
          o.getDetailedCoverage = (uri, token = CancellationToken.None) => this.proxy.$getCoverageDetails(r.id, taskWithCoverage, uri, token).then((r2) => r2.map(Convert.TestCoverage.to));
        }
        testResultInternalIDs.set(o, r.id);
        return o;
      }).concat(this.results).sort((a, b) => b.completedAt - a.completedAt).slice(0, 32)
    );
    this.resultsChangedEmitter.fire();
  }
  /**
   * Expands the nodes in the test tree. If levels is less than zero, it will
   * be treated as infinite.
   */
  async $expandTest(testId, levels) {
    const collection = this.controllers.get(TestId.fromString(testId).controllerId)?.collection;
    if (collection) {
      await collection.expand(testId, levels < 0 ? Infinity : levels);
      collection.flushDiff();
    }
  }
  /**
   * Receives a test update from the main thread. Called (eventually) whenever
   * tests change.
   */
  $acceptDiff(diff) {
    this.observer.applyDiff(diff.map((d) => TestsDiffOp.deserialize({ asCanonicalUri: (u) => u }, d)));
  }
  /**
   * Runs tests with the given set of IDs. Allows for test from multiple
   * providers to be run.
   * @inheritdoc
   */
  async $runControllerTests(reqs, token) {
    return Promise.all(reqs.map((req) => this.runControllerTestRequest(req, false, token)));
  }
  /**
   * Starts continuous test runs with the given set of IDs. Allows for test from
   * multiple providers to be run.
   * @inheritdoc
   */
  async $startContinuousRun(reqs, token) {
    const cts = new CancellationTokenSource(token);
    const res = await Promise.all(reqs.map((req) => this.runControllerTestRequest(req, true, cts.token)));
    if (!token.isCancellationRequested && !res.some((r) => r.error)) {
      await new Promise((r) => token.onCancellationRequested(r));
    }
    cts.dispose(true);
    return res;
  }
  /** @inheritdoc */
  async $provideTestFollowups(req, token) {
    const results = this.results.find((r) => testResultInternalIDs.get(r) === req.resultId);
    const test = results && findTestInResultSnapshot(TestId.fromString(req.extId), results?.results);
    if (!test) {
      return [];
    }
    let followups = [];
    await Promise.all([...this.followupProviders].map(async (provider) => {
      try {
        const r = await provider.provideFollowup(results, test, req.taskIndex, req.messageIndex, token);
        if (r) {
          followups = followups.concat(r);
        }
      } catch (e) {
        this.logService.error(`Error thrown while providing followup for test message`, e);
      }
    }));
    if (token.isCancellationRequested) {
      return [];
    }
    return followups.map((command) => {
      const id = followupCounter++;
      this.testFollowups.set(id, command);
      return { title: command.title, id };
    });
  }
  $disposeTestFollowups(id) {
    for (const i of id) {
      this.testFollowups.delete(i);
    }
  }
  $executeTestFollowup(id) {
    const command = this.testFollowups.get(id);
    if (!command) {
      return Promise.resolve();
    }
    return this.commands.executeCommand(command.command, ...command.arguments || []);
  }
  /**
   * Cancels an ongoing test run.
   */
  $cancelExtensionTestRun(runId, taskId) {
    if (runId === void 0) {
      this.runTracker.cancelAllRuns();
    } else {
      this.runTracker.cancelRunById(runId, taskId);
    }
  }
  //#endregion
  getMetadataForRun(run) {
    for (const tracker of this.runTracker.trackers) {
      const taskId = tracker.getTaskIdForRun(run);
      if (taskId) {
        return { taskId, runId: tracker.id };
      }
    }
    return void 0;
  }
  async runControllerTestRequest(req, isContinuous, token) {
    const lookup = this.controllers.get(req.controllerId);
    if (!lookup) {
      return {};
    }
    const { collection, profiles, extension } = lookup;
    const profile = profiles.get(req.profileId);
    if (!profile) {
      return {};
    }
    const includeTests = req.testIds.map((testId) => collection.tree.get(testId)).filter(isDefined);
    const excludeTests = req.excludeExtIds.map((id) => lookup.collection.tree.get(id)).filter(isDefined).filter((exclude) => includeTests.some(
      (include) => include.fullId.compare(exclude.fullId) === TestPosition.IsChild
    ));
    if (!includeTests.length) {
      return {};
    }
    const publicReq = new TestRunRequest(
      includeTests.some((i) => i.actual instanceof TestItemRootImpl) ? void 0 : includeTests.map((t) => t.actual),
      excludeTests.map((t) => t.actual),
      profile,
      isContinuous
    );
    const tracker = isStartControllerTests(req) && this.runTracker.prepareForMainThreadTestRun(
      extension,
      publicReq,
      TestRunDto.fromInternal(req, lookup.collection),
      profile,
      token
    );
    try {
      await profile.runHandler(publicReq, token);
      return {};
    } catch (e) {
      return { error: String(e) };
    } finally {
      if (tracker) {
        if (tracker.hasRunningTasks && !token.isCancellationRequested) {
          await Event.toPromise(tracker.onEnd);
        }
      }
    }
  }
};
ExtHostTesting = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostCommands),
  __decorateParam(3, IExtHostDocumentsAndEditors)
], ExtHostTesting);
const RUN_CANCEL_DEADLINE = 1e4;
var TestRunTrackerState = /* @__PURE__ */ ((TestRunTrackerState2) => {
  TestRunTrackerState2[TestRunTrackerState2["Running"] = 0] = "Running";
  TestRunTrackerState2[TestRunTrackerState2["Cancelling"] = 1] = "Cancelling";
  TestRunTrackerState2[TestRunTrackerState2["Ended"] = 2] = "Ended";
  return TestRunTrackerState2;
})(TestRunTrackerState || {});
class TestRunTracker extends Disposable {
  constructor(dto, proxy, logService, profile, extension, parentToken) {
    super();
    this.dto = dto;
    this.proxy = proxy;
    this.logService = logService;
    this.profile = profile;
    this.extension = extension;
    this.state = 0 /* Running */;
    this.running = 0;
    this.tasks = /* @__PURE__ */ new Map();
    this.sharedTestIds = /* @__PURE__ */ new Set();
    this.endEmitter = this._register(new Emitter());
    this.publishedCoverage = /* @__PURE__ */ new Map();
    /**
     * Fires when a test ends, and no more tests are left running.
     */
    this.onEnd = this.endEmitter.event;
    this.cts = this._register(new CancellationTokenSource(parentToken));
    const forciblyEnd = this._register(new RunOnceScheduler(() => this.forciblyEndTasks(), RUN_CANCEL_DEADLINE));
    this._register(this.cts.token.onCancellationRequested(() => forciblyEnd.schedule()));
    const didDisposeEmitter = new Emitter();
    this.onDidDispose = didDisposeEmitter.event;
    this._register(toDisposable(() => {
      didDisposeEmitter.fire();
      didDisposeEmitter.dispose();
    }));
  }
  /**
   * Gets whether there are any tests running.
   */
  get hasRunningTasks() {
    return this.running > 0;
  }
  /**
   * Gets the run ID.
   */
  get id() {
    return this.dto.id;
  }
  /** Gets the task ID from a test run object. */
  getTaskIdForRun(run) {
    for (const [taskId, { run: r }] of this.tasks) {
      if (r === run) {
        return taskId;
      }
    }
    return void 0;
  }
  /** Requests cancellation of the run. On the second call, forces cancellation. */
  cancel(taskId) {
    if (taskId) {
      this.tasks.get(taskId)?.cts.cancel();
    } else if (this.state === 0 /* Running */) {
      this.cts.cancel();
      this.state = 1 /* Cancelling */;
    } else if (this.state === 1 /* Cancelling */) {
      this.forciblyEndTasks();
    }
  }
  /** Gets details for a previously-emitted coverage object. */
  async getCoverageDetails(id, testId, token) {
    const [, taskId] = TestId.fromString(id).path;
    const coverage = this.publishedCoverage.get(id);
    if (!coverage) {
      return [];
    }
    const { report, extIds } = coverage;
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error("unreachable: run task was not found");
    }
    let testItem;
    if (testId && report instanceof FileCoverage) {
      const index = extIds.indexOf(testId);
      if (index === -1) {
        return [];
      }
      testItem = report.includesTests[index];
    }
    const details = testItem ? this.profile?.loadDetailedCoverageForTest?.(task.run, report, testItem, token) : this.profile?.loadDetailedCoverage?.(task.run, report, token);
    return await details ?? [];
  }
  /** Creates the public test run interface to give to extensions. */
  createRun(name) {
    const runId = this.dto.id;
    const ctrlId = this.dto.controllerId;
    const taskId = generateUuid();
    const guardTestMutation = (fn) => (test, ...args) => {
      if (ended) {
        this.logService.warn(`Setting the state of test "${test.id}" is a no-op after the run ends.`);
        return;
      }
      this.ensureTestIsKnown(test);
      fn(test, ...args);
    };
    const appendMessages = (test, messages) => {
      const converted = messages instanceof Array ? messages.map(Convert.TestMessage.from) : [Convert.TestMessage.from(messages)];
      if (test.uri && test.range) {
        const defaultLocation = { range: Convert.Range.from(test.range), uri: test.uri };
        for (const message of converted) {
          message.location = message.location || defaultLocation;
        }
      }
      this.proxy.$appendTestMessagesInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), converted);
    };
    let ended = false;
    const cts = this._register(new CancellationTokenSource(this.cts.token));
    const run = {
      isPersisted: this.dto.isPersisted,
      token: cts.token,
      name,
      onDidDispose: this.onDidDispose,
      addCoverage: (coverage) => {
        if (ended) {
          return;
        }
        const includesTests = coverage instanceof FileCoverage ? coverage.includesTests : [];
        if (includesTests.length) {
          for (const test of includesTests) {
            this.ensureTestIsKnown(test);
          }
        }
        const uriStr = coverage.uri.toString();
        const id = new TestId([runId, taskId, uriStr]).toString();
        this.publishedCoverage.set(id, { report: coverage, extIds: includesTests.map((t) => TestId.fromExtHostTestItem(t, ctrlId).toString()) });
        this.proxy.$appendCoverage(runId, taskId, Convert.TestCoverage.fromFile(ctrlId, id, coverage));
      },
      //#region state mutation
      enqueued: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Queued);
      }),
      skipped: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Skipped);
      }),
      started: guardTestMutation((test) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Running);
      }),
      errored: guardTestMutation((test, messages, duration) => {
        appendMessages(test, messages);
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Errored, duration);
      }),
      failed: guardTestMutation((test, messages, duration) => {
        appendMessages(test, messages);
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, ctrlId).toString(), TestResultState.Failed, duration);
      }),
      passed: guardTestMutation((test, duration) => {
        this.proxy.$updateTestStateInRun(runId, taskId, TestId.fromExtHostTestItem(test, this.dto.controllerId).toString(), TestResultState.Passed, duration);
      }),
      //#endregion
      appendOutput: (output, location, test) => {
        if (ended) {
          return;
        }
        if (test) {
          this.ensureTestIsKnown(test);
        }
        this.proxy.$appendOutputToRun(
          runId,
          taskId,
          VSBuffer.fromString(output),
          location && Convert.location.from(location),
          test && TestId.fromExtHostTestItem(test, ctrlId).toString()
        );
      },
      end: () => {
        if (ended) {
          return;
        }
        ended = true;
        this.proxy.$finishedTestRunTask(runId, taskId);
        if (!--this.running) {
          this.markEnded();
        }
      }
    };
    this.running++;
    this.tasks.set(taskId, { run, cts });
    this.proxy.$startedTestRunTask(runId, {
      id: taskId,
      ctrlId: this.dto.controllerId,
      name: name || this.extension.displayName || this.extension.identifier.value,
      running: true
    });
    return run;
  }
  forciblyEndTasks() {
    for (const { run } of this.tasks.values()) {
      run.end();
    }
  }
  markEnded() {
    if (this.state !== 2 /* Ended */) {
      this.state = 2 /* Ended */;
      this.endEmitter.fire();
    }
  }
  ensureTestIsKnown(test) {
    if (!(test instanceof TestItemImpl)) {
      throw new InvalidTestItemError(test.id);
    }
    if (this.sharedTestIds.has(TestId.fromExtHostTestItem(test, this.dto.controllerId).toString())) {
      return;
    }
    const chain = [];
    const root = this.dto.colllection.root;
    while (true) {
      const converted = Convert.TestItem.from(test);
      chain.unshift(converted);
      if (this.sharedTestIds.has(converted.extId)) {
        break;
      }
      this.sharedTestIds.add(converted.extId);
      if (test === root) {
        break;
      }
      test = test.parent || root;
    }
    this.proxy.$addTestsToRun(this.dto.controllerId, this.dto.id, chain);
  }
  dispose() {
    this.markEnded();
    super.dispose();
  }
}
class TestRunCoordinator {
  constructor(proxy, logService) {
    this.proxy = proxy;
    this.logService = logService;
    this.tracked = /* @__PURE__ */ new Map();
    this.trackedById = /* @__PURE__ */ new Map();
  }
  get trackers() {
    return this.tracked.values();
  }
  /**
   * Gets a coverage report for a given run and task ID.
   */
  getCoverageDetails(id, testId, token) {
    const runId = TestId.root(id);
    return this.trackedById.get(runId)?.getCoverageDetails(id, testId, token) || [];
  }
  /**
   * Disposes the test run, called when the main thread is no longer interested
   * in associated data.
   */
  disposeTestRun(runId) {
    this.trackedById.get(runId)?.dispose();
    this.trackedById.delete(runId);
    for (const [req, { id }] of this.tracked) {
      if (id === runId) {
        this.tracked.delete(req);
      }
    }
  }
  /**
   * Registers a request as being invoked by the main thread, so
   * `$startedExtensionTestRun` is not invoked. The run must eventually
   * be cancelled manually.
   */
  prepareForMainThreadTestRun(extension, req, dto, profile, token) {
    return this.getTracker(req, dto, profile, extension, token);
  }
  /**
   * Cancels an existing test run via its cancellation token.
   */
  cancelRunById(runId, taskId) {
    this.trackedById.get(runId)?.cancel(taskId);
  }
  /**
   * Cancels an existing test run via its cancellation token.
   */
  cancelAllRuns() {
    for (const tracker of this.tracked.values()) {
      tracker.cancel();
    }
  }
  /**
   * Implements the public `createTestRun` API.
   */
  createTestRun(extension, controllerId, collection, request, name, persist) {
    const existing = this.tracked.get(request);
    if (existing) {
      return existing.createRun(name);
    }
    const dto = TestRunDto.fromPublic(controllerId, collection, request, persist);
    const profile = tryGetProfileFromTestRunReq(request);
    this.proxy.$startedExtensionTestRun({
      controllerId,
      continuous: !!request.continuous,
      profile: profile && { group: Convert.TestRunProfileKind.from(profile.kind), id: profile.profileId },
      exclude: request.exclude?.map((t) => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [],
      id: dto.id,
      include: request.include?.map((t) => TestId.fromExtHostTestItem(t, collection.root.id).toString()) ?? [collection.root.id],
      preserveFocus: request.preserveFocus ?? true,
      persist
    });
    const tracker = this.getTracker(request, dto, request.profile, extension);
    Event.once(tracker.onEnd)(() => {
      this.proxy.$finishedExtensionTestRun(dto.id);
    });
    return tracker.createRun(name);
  }
  getTracker(req, dto, profile, extension, token) {
    const tracker = new TestRunTracker(dto, this.proxy, this.logService, profile, extension, token);
    this.tracked.set(req, tracker);
    this.trackedById.set(tracker.id, tracker);
    return tracker;
  }
}
const tryGetProfileFromTestRunReq = (request) => {
  if (!request.profile) {
    return void 0;
  }
  if (!(request.profile instanceof TestRunProfileImpl)) {
    throw new Error(`TestRunRequest.profile is not an instance created from TestController.createRunProfile`);
  }
  return request.profile;
};
class TestRunDto {
  constructor(controllerId, id, isPersisted, colllection) {
    this.controllerId = controllerId;
    this.id = id;
    this.isPersisted = isPersisted;
    this.colllection = colllection;
  }
  static fromPublic(controllerId, collection, request, persist) {
    return new TestRunDto(
      controllerId,
      generateUuid(),
      persist,
      collection
    );
  }
  static fromInternal(request, collection) {
    return new TestRunDto(
      request.controllerId,
      request.runId,
      true,
      collection
    );
  }
}
class MirroredChangeCollector {
  constructor(emitter) {
    this.emitter = emitter;
    this.added = /* @__PURE__ */ new Set();
    this.updated = /* @__PURE__ */ new Set();
    this.removed = /* @__PURE__ */ new Set();
    this.alreadyRemoved = /* @__PURE__ */ new Set();
  }
  get isEmpty() {
    return this.added.size === 0 && this.removed.size === 0 && this.updated.size === 0;
  }
  /**
   * @inheritdoc
   */
  add(node) {
    this.added.add(node);
  }
  /**
   * @inheritdoc
   */
  update(node) {
    Object.assign(node.revived, Convert.TestItem.toPlain(node.item));
    if (!this.added.has(node)) {
      this.updated.add(node);
    }
  }
  /**
   * @inheritdoc
   */
  remove(node) {
    if (this.added.delete(node)) {
      return;
    }
    this.updated.delete(node);
    const parentId = TestId.parentId(node.item.extId);
    if (parentId && this.alreadyRemoved.has(parentId.toString())) {
      this.alreadyRemoved.add(node.item.extId);
      return;
    }
    this.removed.add(node);
  }
  /**
   * @inheritdoc
   */
  getChangeEvent() {
    const { added, updated, removed } = this;
    return {
      get added() {
        return [...added].map((n) => n.revived);
      },
      get updated() {
        return [...updated].map((n) => n.revived);
      },
      get removed() {
        return [...removed].map((n) => n.revived);
      }
    };
  }
  complete() {
    if (!this.isEmpty) {
      this.emitter.fire(this.getChangeEvent());
    }
  }
}
class MirroredTestCollection extends AbstractIncrementalTestCollection {
  constructor() {
    super(...arguments);
    this.changeEmitter = new Emitter();
    /**
     * Change emitter that fires with the same semantics as `TestObserver.onDidChangeTests`.
     */
    this.onDidChangeTests = this.changeEmitter.event;
  }
  /**
   * Gets a list of root test items.
   */
  get rootTests() {
    return this.roots;
  }
  /**
   *
   * If the test ID exists, returns its underlying ID.
   */
  getMirroredTestDataById(itemId) {
    return this.items.get(itemId);
  }
  /**
   * If the test item is a mirrored test item, returns its underlying ID.
   */
  getMirroredTestDataByReference(item) {
    return this.items.get(item.id);
  }
  /**
   * @override
   */
  createItem(item, parent) {
    return {
      ...item,
      // todo@connor4312: make this work well again with children
      revived: Convert.TestItem.toPlain(item.item),
      depth: parent ? parent.depth + 1 : 0,
      children: /* @__PURE__ */ new Set()
    };
  }
  /**
   * @override
   */
  createChangeCollector() {
    return new MirroredChangeCollector(this.changeEmitter);
  }
}
class TestObservers {
  constructor(proxy) {
    this.proxy = proxy;
  }
  checkout() {
    if (!this.current) {
      this.current = this.createObserverData();
    }
    const current = this.current;
    current.observers++;
    return {
      onDidChangeTest: current.tests.onDidChangeTests,
      get tests() {
        return [...current.tests.rootTests].map((t) => t.revived);
      },
      dispose: createSingleCallFunction(() => {
        if (--current.observers === 0) {
          this.proxy.$unsubscribeFromDiffs();
          this.current = void 0;
        }
      })
    };
  }
  /**
   * Gets the internal test data by its reference.
   */
  getMirroredTestDataByReference(ref) {
    return this.current?.tests.getMirroredTestDataByReference(ref);
  }
  /**
   * Applies test diffs to the current set of observed tests.
   */
  applyDiff(diff) {
    this.current?.tests.apply(diff);
  }
  createObserverData() {
    const tests = new MirroredTestCollection({ asCanonicalUri: (u) => u });
    this.proxy.$subscribeToDiffs();
    return { observers: 0, tests };
  }
}
const updateProfile = (impl, proxy, initial, update) => {
  if (initial) {
    Object.assign(initial, update);
  } else {
    proxy.$updateTestRunConfig(impl.controllerId, impl.profileId, update);
  }
};
class TestRunProfileImpl extends TestRunProfileBase {
  constructor(proxy, profiles, activeProfiles, onDidChangeActiveProfiles, controllerId, profileId, _label, kind, runHandler, _isDefault = false, _tag = void 0, _supportsContinuousRun = false) {
    super(controllerId, profileId, kind);
    this._label = _label;
    this.runHandler = runHandler;
    this._tag = _tag;
    this._supportsContinuousRun = _supportsContinuousRun;
    this.#proxy = proxy;
    this.#profiles = profiles;
    this.#activeProfiles = activeProfiles;
    this.#onDidChangeDefaultProfiles = onDidChangeActiveProfiles;
    profiles.set(profileId, this);
    const groupBitset = Convert.TestRunProfileKind.from(kind);
    if (_isDefault) {
      activeProfiles.add(profileId);
    }
    this.#initialPublish = {
      profileId,
      controllerId,
      tag: _tag ? Convert.TestTag.namespace(this.controllerId, _tag.id) : null,
      label: _label,
      group: groupBitset,
      isDefault: _isDefault,
      hasConfigurationHandler: false,
      supportsContinuousRun: _supportsContinuousRun
    };
    queueMicrotask(() => {
      if (this.#initialPublish) {
        this.#proxy.$publishTestRunProfile(this.#initialPublish);
        this.#initialPublish = void 0;
      }
    });
  }
  #proxy;
  #activeProfiles;
  #onDidChangeDefaultProfiles;
  #initialPublish;
  #profiles;
  get label() {
    return this._label;
  }
  set label(label) {
    if (label !== this._label) {
      this._label = label;
      updateProfile(this, this.#proxy, this.#initialPublish, { label });
    }
  }
  get supportsContinuousRun() {
    return this._supportsContinuousRun;
  }
  set supportsContinuousRun(supports) {
    if (supports !== this._supportsContinuousRun) {
      this._supportsContinuousRun = supports;
      updateProfile(this, this.#proxy, this.#initialPublish, { supportsContinuousRun: supports });
    }
  }
  get isDefault() {
    return this.#activeProfiles.has(this.profileId);
  }
  set isDefault(isDefault) {
    if (isDefault !== this.isDefault) {
      if (isDefault) {
        this.#activeProfiles.add(this.profileId);
      } else {
        this.#activeProfiles.delete(this.profileId);
      }
      updateProfile(this, this.#proxy, this.#initialPublish, { isDefault });
    }
  }
  get tag() {
    return this._tag;
  }
  set tag(tag) {
    if (tag?.id !== this._tag?.id) {
      this._tag = tag;
      updateProfile(this, this.#proxy, this.#initialPublish, {
        tag: tag ? Convert.TestTag.namespace(this.controllerId, tag.id) : null
      });
    }
  }
  get configureHandler() {
    return this._configureHandler;
  }
  set configureHandler(handler) {
    if (handler !== this._configureHandler) {
      this._configureHandler = handler;
      updateProfile(this, this.#proxy, this.#initialPublish, { hasConfigurationHandler: !!handler });
    }
  }
  get onDidChangeDefault() {
    return Event.chain(
      this.#onDidChangeDefaultProfiles,
      ($) => $.map((ev) => ev.get(this.controllerId)?.get(this.profileId)).filter(isDefined)
    );
  }
  dispose() {
    if (this.#profiles?.delete(this.profileId)) {
      this.#profiles = void 0;
      this.#proxy.$removeTestProfile(this.controllerId, this.profileId);
    }
    this.#initialPublish = void 0;
  }
}
function findTestInResultSnapshot(extId, snapshot) {
  for (let i = 0; i < extId.path.length; i++) {
    const item = snapshot.find((s) => s.id === extId.path[i]);
    if (!item) {
      return void 0;
    }
    if (i === extId.path.length - 1) {
      return item;
    }
    snapshot = item.children;
  }
  return void 0;
}
export {
  ExtHostTesting,
  IExtHostTesting,
  TestRunCoordinator,
  TestRunDto,
  TestRunProfileImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXN0aW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVGVzdElkLCBUZXN0UG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJZC5qcyc7XG5pbXBvcnQgeyBJbnZhbGlkVGVzdEl0ZW1FcnJvciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdEl0ZW1Db2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEFic3RyYWN0SW5jcmVtZW50YWxUZXN0Q29sbGVjdGlvbiwgQ292ZXJhZ2VEZXRhaWxzLCBJQ2FsbFByb2ZpbGVSdW5IYW5kbGVyLCBJU2VyaWFsaXplZFRlc3RSZXN1bHRzLCBJU3RhcnRDb250cm9sbGVyVGVzdHMsIElTdGFydENvbnRyb2xsZXJUZXN0c1Jlc3VsdCwgSVRlc3RFcnJvck1lc3NhZ2UsIElUZXN0SXRlbSwgSVRlc3RJdGVtQ29udGV4dCwgSVRlc3RNZXNzYWdlTWVudUFyZ3MsIElUZXN0UnVuUHJvZmlsZSwgSW5jcmVtZW50YWxDaGFuZ2VDb2xsZWN0b3IsIEluY3JlbWVudGFsVGVzdENvbGxlY3Rpb25JdGVtLCBJbnRlcm5hbFRlc3RJdGVtLCBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHksIFRlc3RNZXNzYWdlRm9sbG93dXBSZXF1ZXN0LCBUZXN0TWVzc2FnZUZvbGxvd3VwUmVzcG9uc2UsIFRlc3RSZXN1bHRTdGF0ZSwgVGVzdHNEaWZmLCBUZXN0c0RpZmZPcCwgaXNTdGFydENvbnRyb2xsZXJUZXN0cyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGVzdGluZ1NoYXBlLCBJTG9jYXRpb25EdG8sIE1haW5Db250ZXh0LCBNYWluVGhyZWFkVGVzdGluZ1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbiwgVGVzdEl0ZW1JbXBsLCBUZXN0SXRlbVJvb3RJbXBsLCB0b0l0ZW1Gcm9tQ29udGV4dCB9IGZyb20gJy4vZXh0SG9zdFRlc3RJdGVtLmpzJztcbmltcG9ydCAqIGFzIENvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgRmlsZUNvdmVyYWdlLCBUZXN0UnVuUHJvZmlsZUJhc2UsIFRlc3RSdW5SZXF1ZXN0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuXG5pbnRlcmZhY2UgQ29udHJvbGxlckluZm8ge1xuXHRjb250cm9sbGVyOiB2c2NvZGUuVGVzdENvbnRyb2xsZXI7XG5cdHByb2ZpbGVzOiBNYXA8bnVtYmVyLCB2c2NvZGUuVGVzdFJ1blByb2ZpbGU+O1xuXHRjb2xsZWN0aW9uOiBFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uO1xuXHRleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0cmVsYXRlZENvZGVQcm92aWRlcj86IHZzY29kZS5UZXN0UmVsYXRlZENvZGVQcm92aWRlcjtcblx0YWN0aXZlUHJvZmlsZXM6IFNldDxudW1iZXI+O1xufVxuXG50eXBlIERlZmF1bHRQcm9maWxlQ2hhbmdlRXZlbnQgPSBNYXA8LyogY29udHJvbGxlcklkICovIHN0cmluZywgTWFwPCAvKiBwcm9maWxlSWQgKi9udW1iZXIsIGJvb2xlYW4+PjtcblxubGV0IGZvbGxvd3VwQ291bnRlciA9IDA7XG5cbmNvbnN0IHRlc3RSZXN1bHRJbnRlcm5hbElEcyA9IG5ldyBXZWFrTWFwPHZzY29kZS5UZXN0UnVuUmVzdWx0LCBzdHJpbmc+KCk7XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdFRlc3RpbmcgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RUZXN0aW5nPignSUV4dEhvc3RUZXN0aW5nJyk7XG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0VGVzdGluZyBleHRlbmRzIEV4dEhvc3RUZXN0aW5nIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFRlc3RpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRXh0SG9zdFRlc3RpbmdTaGFwZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzdWx0c0NoYW5nZWRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBjb250cm9sbGVycyA9IG5ldyBNYXA8LyogY29udHJvbGxlciBJRCAqLyBzdHJpbmcsIENvbnRyb2xsZXJJbmZvPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJ1blRyYWNrZXI6IFRlc3RSdW5Db29yZGluYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBvYnNlcnZlcjogVGVzdE9ic2VydmVycztcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0UHJvZmlsZXNDaGFuZ2VkRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERlZmF1bHRQcm9maWxlQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZvbGxvd3VwUHJvdmlkZXJzID0gbmV3IFNldDx2c2NvZGUuVGVzdEZvbGxvd3VwUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGVzdEZvbGxvd3VwcyA9IG5ldyBNYXA8bnVtYmVyLCB2c2NvZGUuQ29tbWFuZD4oKTtcblxuXHRwdWJsaWMgb25SZXN1bHRzQ2hhbmdlZCA9IHRoaXMucmVzdWx0c0NoYW5nZWRFbWl0dGVyLmV2ZW50O1xuXHRwdWJsaWMgcmVzdWx0czogUmVhZG9ubHlBcnJheTx2c2NvZGUuVGVzdFJ1blJlc3VsdD4gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIHJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdENvbW1hbmRzIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHMsXG5cdFx0QElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyBwcml2YXRlIHJlYWRvbmx5IGVkaXRvcnM6IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnByb3h5ID0gcnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZXN0aW5nKTtcblx0XHR0aGlzLm9ic2VydmVyID0gbmV3IFRlc3RPYnNlcnZlcnModGhpcy5wcm94eSk7XG5cdFx0dGhpcy5ydW5UcmFja2VyID0gbmV3IFRlc3RSdW5Db29yZGluYXRvcih0aGlzLnByb3h5LCBsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiBhcmcgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGFyZz8uJG1pZCkge1xuXHRcdFx0XHRcdGNhc2UgTWFyc2hhbGxlZElkLlRlc3RJdGVtQ29udGV4dDoge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2FzdCA9IGFyZyBhcyBJVGVzdEl0ZW1Db250ZXh0O1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0VGVzdCA9IGNhc3QudGVzdHNbY2FzdC50ZXN0cy5sZW5ndGggLSAxXS5pdGVtLmV4dElkO1xuXHRcdFx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY29udHJvbGxlcnMuZ2V0KFRlc3RJZC5yb290KHRhcmdldFRlc3QpKTtcblx0XHRcdFx0XHRcdHJldHVybiBjb250cm9sbGVyPy5jb2xsZWN0aW9uLnRyZWUuZ2V0KHRhcmdldFRlc3QpPy5hY3R1YWwgPz8gdG9JdGVtRnJvbUNvbnRleHQoYXJnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBNYXJzaGFsbGVkSWQuVGVzdE1lc3NhZ2VNZW51QXJnczoge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyB0ZXN0LCBtZXNzYWdlIH0gPSBhcmcgYXMgSVRlc3RNZXNzYWdlTWVudUFyZ3M7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRJZCA9IHRlc3QuaXRlbS5leHRJZDtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHRlc3Q6IHRoaXMuY29udHJvbGxlcnMuZ2V0KFRlc3RJZC5yb290KGV4dElkKSk/LmNvbGxlY3Rpb24udHJlZS5nZXQoZXh0SWQpPy5hY3R1YWxcblx0XHRcdFx0XHRcdFx0XHQ/PyB0b0l0ZW1Gcm9tQ29udGV4dCh7ICRtaWQ6IE1hcnNoYWxsZWRJZC5UZXN0SXRlbUNvbnRleHQsIHRlc3RzOiBbdGVzdF0gfSksXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IENvbnZlcnQuVGVzdE1lc3NhZ2UudG8obWVzc2FnZSBhcyBJVGVzdEVycm9yTWVzc2FnZS5TZXJpYWxpemVkKSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6IHJldHVybiBhcmc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZChmYWxzZSwgJ3Rlc3RpbmcuZ2V0RXhwbG9yZXJTZWxlY3Rpb24nLCBhc3luYyAoKTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdGNvbnN0IGlubmVyID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8e1xuXHRcdFx0XHRpbmNsdWRlOiBzdHJpbmdbXTtcblx0XHRcdFx0ZXhjbHVkZTogc3RyaW5nW107XG5cdFx0XHR9PihUZXN0Q29tbWFuZElkLkdldEV4cGxvcmVyU2VsZWN0aW9uKTtcblxuXHRcdFx0Y29uc3QgbG9va3VwID0gKGk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jb250cm9sbGVycy5nZXQoVGVzdElkLnJvb3QoaSkpO1xuXHRcdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRyZXR1cm4gVGVzdElkLmlzUm9vdChpKSA/IGNvbnRyb2xsZXIuY29udHJvbGxlciA6IGNvbnRyb2xsZXIuY29sbGVjdGlvbi50cmVlLmdldChpKT8uYWN0dWFsO1xuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5jbHVkZTogaW5uZXI/LmluY2x1ZGUubWFwKGxvb2t1cCkuZmlsdGVyKGlzRGVmaW5lZCkgfHwgW10sXG5cdFx0XHRcdGV4Y2x1ZGU6IGlubmVyPy5leGNsdWRlLm1hcChsb29rdXApLmZpbHRlcihpc0RlZmluZWQpIHx8IFtdLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBwdWJsaWMgQVBJXG5cblx0LyoqXG5cdCAqIEltcGxlbWVudHMgdnNjb2RlLnRlc3QucmVnaXN0ZXJUZXN0UHJvdmlkZXJcblx0ICovXG5cdHB1YmxpYyBjcmVhdGVUZXN0Q29udHJvbGxlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgY29udHJvbGxlcklkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHJlZnJlc2hIYW5kbGVyPzogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gVGhlbmFibGU8dm9pZD4gfCB2b2lkKTogdnNjb2RlLlRlc3RDb250cm9sbGVyIHtcblx0XHRpZiAodGhpcy5jb250cm9sbGVycy5oYXMoY29udHJvbGxlcklkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdHRlbXB0IHRvIGluc2VydCBhIGR1cGxpY2F0ZSBjb250cm9sbGVyIHdpdGggSUQgXCIke2NvbnRyb2xsZXJJZH1cImApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IGRpc3Bvc2FibGUuYWRkKG5ldyBFeHRIb3N0VGVzdEl0ZW1Db2xsZWN0aW9uKGNvbnRyb2xsZXJJZCwgbGFiZWwsIHRoaXMuZWRpdG9ycykpO1xuXHRcdGNvbGxlY3Rpb24ucm9vdC5sYWJlbCA9IGxhYmVsO1xuXG5cdFx0Y29uc3QgcHJvZmlsZXMgPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLlRlc3RSdW5Qcm9maWxlPigpO1xuXHRcdGNvbnN0IGFjdGl2ZVByb2ZpbGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLnByb3h5O1xuXG5cdFx0Y29uc3QgZ2V0Q2FwYWJpbGl0eSA9ICgpID0+IHtcblx0XHRcdGxldCBjYXAgPSAwO1xuXHRcdFx0aWYgKHJlZnJlc2hIYW5kbGVyKSB7XG5cdFx0XHRcdGNhcCB8PSBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuUmVmcmVzaDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJjcCA9IGluZm8ucmVsYXRlZENvZGVQcm92aWRlcjtcblx0XHRcdGlmIChyY3ApIHtcblx0XHRcdFx0aWYgKHJjcD8ucHJvdmlkZVJlbGF0ZWRUZXN0cykge1xuXHRcdFx0XHRcdGNhcCB8PSBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHkuVGVzdFJlbGF0ZWRUb0NvZGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJjcD8ucHJvdmlkZVJlbGF0ZWRDb2RlKSB7XG5cdFx0XHRcdFx0Y2FwIHw9IFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eS5Db2RlUmVsYXRlZFRvVGVzdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNhcCBhcyBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXI6IHZzY29kZS5UZXN0Q29udHJvbGxlciA9IHtcblx0XHRcdGl0ZW1zOiBjb2xsZWN0aW9uLnJvb3QuY2hpbGRyZW4sXG5cdFx0XHRnZXQgbGFiZWwoKSB7XG5cdFx0XHRcdHJldHVybiBsYWJlbDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdFx0XHRsYWJlbCA9IHZhbHVlO1xuXHRcdFx0XHRjb2xsZWN0aW9uLnJvb3QubGFiZWwgPSB2YWx1ZTtcblx0XHRcdFx0cHJveHkuJHVwZGF0ZUNvbnRyb2xsZXIoY29udHJvbGxlcklkLCB7IGxhYmVsIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldCByZWZyZXNoSGFuZGxlcigpIHtcblx0XHRcdFx0cmV0dXJuIHJlZnJlc2hIYW5kbGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCByZWZyZXNoSGFuZGxlcih2YWx1ZTogKCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPHZvaWQ+IHwgdm9pZCkgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVmcmVzaEhhbmRsZXIgPSB2YWx1ZTtcblx0XHRcdFx0cHJveHkuJHVwZGF0ZUNvbnRyb2xsZXIoY29udHJvbGxlcklkLCB7IGNhcGFiaWxpdGllczogZ2V0Q2FwYWJpbGl0eSgpIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpZCgpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRyb2xsZXJJZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgcmVsYXRlZENvZGVQcm92aWRlcigpIHtcblx0XHRcdFx0cmV0dXJuIGluZm8ucmVsYXRlZENvZGVQcm92aWRlcjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgcmVsYXRlZENvZGVQcm92aWRlcih2YWx1ZTogdnNjb2RlLlRlc3RSZWxhdGVkQ29kZVByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3Rlc3RSZWxhdGVkQ29kZScpO1xuXHRcdFx0XHRpbmZvLnJlbGF0ZWRDb2RlUHJvdmlkZXIgPSB2YWx1ZTtcblx0XHRcdFx0cHJveHkuJHVwZGF0ZUNvbnRyb2xsZXIoY29udHJvbGxlcklkLCB7IGNhcGFiaWxpdGllczogZ2V0Q2FwYWJpbGl0eSgpIH0pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVJ1blByb2ZpbGU6IChsYWJlbCwgZ3JvdXAsIHJ1bkhhbmRsZXIsIGlzRGVmYXVsdCwgdGFnPzogdnNjb2RlLlRlc3RUYWcgfCB1bmRlZmluZWQsIHN1cHBvcnRzQ29udGludW91c1J1bj86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0Ly8gRGVyaXZlIHRoZSBwcm9maWxlIElEIGZyb20gYSBoYXNoIHNvIHRoYXQgdGhlIHNhbWUgcHJvZmlsZSB3aWxsIHRlbmRcblx0XHRcdFx0Ly8gdG8gaGF2ZSB0aGUgc2FtZSBoYXNoZXMsIGFsbG93aW5nIHJlLXJ1biByZXF1ZXN0cyB0byB3b3JrIGFjcm9zcyByZWxvYWRzLlxuXHRcdFx0XHRsZXQgcHJvZmlsZUlkID0gaGFzaChsYWJlbCk7XG5cdFx0XHRcdHdoaWxlIChwcm9maWxlcy5oYXMocHJvZmlsZUlkKSkge1xuXHRcdFx0XHRcdHByb2ZpbGVJZCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBUZXN0UnVuUHJvZmlsZUltcGwodGhpcy5wcm94eSwgcHJvZmlsZXMsIGFjdGl2ZVByb2ZpbGVzLCB0aGlzLmRlZmF1bHRQcm9maWxlc0NoYW5nZWRFbWl0dGVyLmV2ZW50LCBjb250cm9sbGVySWQsIHByb2ZpbGVJZCwgbGFiZWwsIGdyb3VwLCBydW5IYW5kbGVyLCBpc0RlZmF1bHQsIHRhZywgc3VwcG9ydHNDb250aW51b3VzUnVuKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVUZXN0SXRlbShpZCwgbGFiZWwsIHVyaSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFRlc3RJdGVtSW1wbChjb250cm9sbGVySWQsIGlkLCBsYWJlbCwgdXJpKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVUZXN0UnVuOiAocmVxdWVzdCwgbmFtZSwgcGVyc2lzdCA9IHRydWUpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucnVuVHJhY2tlci5jcmVhdGVUZXN0UnVuKGV4dGVuc2lvbiwgY29udHJvbGxlcklkLCBjb2xsZWN0aW9uLCByZXF1ZXN0LCBuYW1lLCBwZXJzaXN0KTtcblx0XHRcdH0sXG5cdFx0XHRpbnZhbGlkYXRlVGVzdFJlc3VsdHM6IGl0ZW1zID0+IHtcblx0XHRcdFx0aWYgKGl0ZW1zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLnByb3h5LiRtYXJrVGVzdFJldGlyZWQodW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtc0FyciA9IGl0ZW1zIGluc3RhbmNlb2YgQXJyYXkgPyBpdGVtcyA6IFtpdGVtc107XG5cdFx0XHRcdFx0dGhpcy5wcm94eS4kbWFya1Rlc3RSZXRpcmVkKGl0ZW1zQXJyLm1hcChpID0+IFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKGkhLCBjb250cm9sbGVySWQpLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNldCByZXNvbHZlSGFuZGxlcihmbikge1xuXHRcdFx0XHRjb2xsZWN0aW9uLnJlc29sdmVIYW5kbGVyID0gZm47XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHJlc29sdmVIYW5kbGVyKCkge1xuXHRcdFx0XHRyZXR1cm4gY29sbGVjdGlvbi5yZXNvbHZlSGFuZGxlciBhcyB1bmRlZmluZWQgfCAoKGl0ZW0/OiB2c2NvZGUuVGVzdEl0ZW0pID0+IHZvaWQpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBpbmZvOiBDb250cm9sbGVySW5mbyA9IHsgY29udHJvbGxlciwgY29sbGVjdGlvbiwgcHJvZmlsZXMsIGV4dGVuc2lvbiwgYWN0aXZlUHJvZmlsZXMgfTtcblx0XHRwcm94eS4kcmVnaXN0ZXJUZXN0Q29udHJvbGxlcihjb250cm9sbGVySWQsIGxhYmVsLCBnZXRDYXBhYmlsaXR5KCkpO1xuXHRcdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm94eS4kdW5yZWdpc3RlclRlc3RDb250cm9sbGVyKGNvbnRyb2xsZXJJZCkpKTtcblxuXHRcdHRoaXMuY29udHJvbGxlcnMuc2V0KGNvbnRyb2xsZXJJZCwgaW5mbyk7XG5cdFx0ZGlzcG9zYWJsZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY29udHJvbGxlcnMuZGVsZXRlKGNvbnRyb2xsZXJJZCkpKTtcblxuXHRcdGRpc3Bvc2FibGUuYWRkKGNvbGxlY3Rpb24ub25EaWRHZW5lcmF0ZURpZmYoZGlmZiA9PiBwcm94eS4kcHVibGlzaERpZmYoY29udHJvbGxlcklkLCBkaWZmLm1hcChUZXN0c0RpZmZPcC5zZXJpYWxpemUpKSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRyb2xsZXI7XG5cdH1cblxuXHQvKipcblx0ICogSW1wbGVtZW50cyB2c2NvZGUudGVzdC5jcmVhdGVUZXN0T2JzZXJ2ZXJcblx0ICovXG5cdHB1YmxpYyBjcmVhdGVUZXN0T2JzZXJ2ZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMub2JzZXJ2ZXIuY2hlY2tvdXQoKTtcblx0fVxuXG5cblx0LyoqXG5cdCAqIEltcGxlbWVudHMgdnNjb2RlLnRlc3QucnVuVGVzdHNcblx0ICovXG5cdHB1YmxpYyBhc3luYyBydW5UZXN0cyhyZXE6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRyeUdldFByb2ZpbGVGcm9tVGVzdFJ1blJlcShyZXEpO1xuXHRcdGlmICghcHJvZmlsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgcmVxdWVzdCBwYXNzZWQgdG8gYHZzY29kZS50ZXN0LnJ1blRlc3RzYCBtdXN0IGluY2x1ZGUgYSBwcm9maWxlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY29udHJvbGxlcnMuZ2V0KHByb2ZpbGUuY29udHJvbGxlcklkKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29udHJvbGxlciBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnByb3h5LiRydW5UZXN0cyh7XG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiByZXEucHJlc2VydmVGb2N1cyA/PyB0cnVlLFxuXHRcdFx0Z3JvdXA6IENvbnZlcnQuVGVzdFJ1blByb2ZpbGVLaW5kLmZyb20ocHJvZmlsZS5raW5kKSxcblx0XHRcdHRhcmdldHM6IFt7XG5cdFx0XHRcdHRlc3RJZHM6IHJlcS5pbmNsdWRlPy5tYXAodCA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0LCBjb250cm9sbGVyLmNvbGxlY3Rpb24ucm9vdC5pZCkudG9TdHJpbmcoKSkgPz8gW2NvbnRyb2xsZXIuY29sbGVjdGlvbi5yb290LmlkXSxcblx0XHRcdFx0cHJvZmlsZUlkOiBwcm9maWxlLnByb2ZpbGVJZCxcblx0XHRcdFx0Y29udHJvbGxlcklkOiBwcm9maWxlLmNvbnRyb2xsZXJJZCxcblx0XHRcdH1dLFxuXHRcdFx0ZXhjbHVkZTogcmVxLmV4Y2x1ZGU/Lm1hcCh0ID0+IHQuaWQpLFxuXHRcdH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbXBsZW1lbnRzIHZzY29kZS50ZXN0LnJlZ2lzdGVyVGVzdEZvbGxvd3VwUHJvdmlkZXJcblx0ICovXG5cdHB1YmxpYyByZWdpc3RlclRlc3RGb2xsb3d1cFByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuVGVzdEZvbGxvd3VwUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5mb2xsb3d1cFByb3ZpZGVycy5hZGQocHJvdmlkZXIpO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgdGhpcy5mb2xsb3d1cFByb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpOyB9IH07XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUlBDIG1ldGhvZHNcblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRhc3luYyAkZ2V0VGVzdHNSZWxhdGVkVG9Db2RlKHVyaTogVXJpQ29tcG9uZW50cywgX3Bvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLmVkaXRvcnMuZ2V0RG9jdW1lbnQoVVJJLnJldml2ZSh1cmkpKTtcblx0XHRpZiAoIWRvYykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gQ29udmVydC5Qb3NpdGlvbi50byhfcG9zaXRpb24pO1xuXHRcdGNvbnN0IHJlbGF0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRoaXMuY29udHJvbGxlcnMudmFsdWVzKCldLm1hcChhc3luYyAoYykgPT4ge1xuXHRcdFx0bGV0IHRlc3RzOiB2c2NvZGUuVGVzdEl0ZW1bXSB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0ZXN0cyA9IGF3YWl0IGMucmVsYXRlZENvZGVQcm92aWRlcj8ucHJvdmlkZVJlbGF0ZWRUZXN0cz8uKGRvYy5kb2N1bWVudCwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBFcnJvciB0aHJvd24gd2hpbGUgcHJvdmlkaW5nIHJlbGF0ZWQgdGVzdHMgZm9yICR7Yy5jb250cm9sbGVyLmxhYmVsfWAsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0ZXN0cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgdGVzdHMpIHtcblx0XHRcdFx0XHRyZWxhdGVkLnB1c2goVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgYy5jb250cm9sbGVyLmlkKS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjLmNvbGxlY3Rpb24uZmx1c2hEaWZmKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJlbGF0ZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdGFzeW5jICRnZXRDb2RlUmVsYXRlZFRvVGVzdCh0ZXN0SWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTG9jYXRpb25EdG9bXT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbnRyb2xsZXJzLmdldChUZXN0SWQucm9vdCh0ZXN0SWQpKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0ID0gY29udHJvbGxlci5jb2xsZWN0aW9uLnRyZWUuZ2V0KHRlc3RJZCk7XG5cdFx0aWYgKCF0ZXN0KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb25zID0gYXdhaXQgY29udHJvbGxlci5yZWxhdGVkQ29kZVByb3ZpZGVyPy5wcm92aWRlUmVsYXRlZENvZGU/Lih0ZXN0LmFjdHVhbCwgdG9rZW4pO1xuXHRcdHJldHVybiBsb2NhdGlvbnM/Lm1hcChDb252ZXJ0LmxvY2F0aW9uLmZyb20pID8/IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkc3luY1Rlc3RzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvciAoY29uc3QgeyBjb2xsZWN0aW9uIH0gb2YgdGhpcy5jb250cm9sbGVycy52YWx1ZXMoKSkge1xuXHRcdFx0Y29sbGVjdGlvbi5mbHVzaERpZmYoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdGFzeW5jICRnZXRDb3ZlcmFnZURldGFpbHMoY292ZXJhZ2VJZDogc3RyaW5nLCB0ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDb3ZlcmFnZURldGFpbHMuU2VyaWFsaXplZFtdPiB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IGF3YWl0IHRoaXMucnVuVHJhY2tlci5nZXRDb3ZlcmFnZURldGFpbHMoY292ZXJhZ2VJZCwgdGVzdElkLCB0b2tlbik7XG5cdFx0cmV0dXJuIGRldGFpbHM/Lm1hcChDb252ZXJ0LlRlc3RDb3ZlcmFnZS5mcm9tRGV0YWlscyk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdGFzeW5jICRkaXNwb3NlUnVuKHJ1bklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLnJ1blRyYWNrZXIuZGlzcG9zZVRlc3RSdW4ocnVuSWQpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdCRjb25maWd1cmVSdW5Qcm9maWxlKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBwcm9maWxlSWQ6IG51bWJlcikge1xuXHRcdHRoaXMuY29udHJvbGxlcnMuZ2V0KGNvbnRyb2xsZXJJZCk/LnByb2ZpbGVzLmdldChwcm9maWxlSWQpPy5jb25maWd1cmVIYW5kbGVyPy4oKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHQkc2V0RGVmYXVsdFJ1blByb2ZpbGVzKHByb2ZpbGVzOiBSZWNvcmQ8LyogY29udHJvbGxlciBpZCAqL3N0cmluZywgLyogcHJvZmlsZSBpZCAqLyBudW1iZXJbXT4pOiB2b2lkIHtcblx0XHRjb25zdCBldnQ6IERlZmF1bHRQcm9maWxlQ2hhbmdlRXZlbnQgPSBuZXcgTWFwKCk7XG5cdFx0Zm9yIChjb25zdCBbY29udHJvbGxlcklkLCBwcm9maWxlSWRzXSBvZiBPYmplY3QuZW50cmllcyhwcm9maWxlcykpIHtcblx0XHRcdGNvbnN0IGN0cmwgPSB0aGlzLmNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySWQpO1xuXHRcdFx0aWYgKCFjdHJsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IG5ldyBNYXA8bnVtYmVyLCBib29sZWFuPigpO1xuXHRcdFx0Y29uc3QgYWRkZWQgPSBwcm9maWxlSWRzLmZpbHRlcihpZCA9PiAhY3RybC5hY3RpdmVQcm9maWxlcy5oYXMoaWQpKTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBbLi4uY3RybC5hY3RpdmVQcm9maWxlc10uZmlsdGVyKGlkID0+ICFwcm9maWxlSWRzLmluY2x1ZGVzKGlkKSk7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGFkZGVkKSB7XG5cdFx0XHRcdGNoYW5nZXMuc2V0KGlkLCB0cnVlKTtcblx0XHRcdFx0Y3RybC5hY3RpdmVQcm9maWxlcy5hZGQoaWQpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiByZW1vdmVkKSB7XG5cdFx0XHRcdGNoYW5nZXMuc2V0KGlkLCBmYWxzZSk7XG5cdFx0XHRcdGN0cmwuYWN0aXZlUHJvZmlsZXMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGFuZ2VzLnNpemUpIHtcblx0XHRcdFx0ZXZ0LnNldChjb250cm9sbGVySWQsIGNoYW5nZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZGVmYXVsdFByb2ZpbGVzQ2hhbmdlZEVtaXR0ZXIuZmlyZShldnQpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdGFzeW5jICRyZWZyZXNoVGVzdHMoY29udHJvbGxlcklkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGF3YWl0IHRoaXMuY29udHJvbGxlcnMuZ2V0KGNvbnRyb2xsZXJJZCk/LmNvbnRyb2xsZXIucmVmcmVzaEhhbmRsZXI/Lih0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0ZXN0IHJlc3VsdHMgc2hvd24gdG8gZXh0ZW5zaW9ucy5cblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgJHB1Ymxpc2hUZXN0UmVzdWx0cyhyZXN1bHRzOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzW10pOiB2b2lkIHtcblx0XHR0aGlzLnJlc3VsdHMgPSBPYmplY3QuZnJlZXplKFxuXHRcdFx0cmVzdWx0c1xuXHRcdFx0XHQubWFwKHIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG8gPSBDb252ZXJ0LlRlc3RSZXN1bHRzLnRvKHIpO1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tXaXRoQ292ZXJhZ2UgPSByLnRhc2tzLmZpbmRJbmRleCh0ID0+IHQuaGFzQ292ZXJhZ2UpO1xuXHRcdFx0XHRcdGlmICh0YXNrV2l0aENvdmVyYWdlICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0by5nZXREZXRhaWxlZENvdmVyYWdlID0gKHVyaSwgdG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA9PlxuXHRcdFx0XHRcdFx0XHR0aGlzLnByb3h5LiRnZXRDb3ZlcmFnZURldGFpbHMoci5pZCwgdGFza1dpdGhDb3ZlcmFnZSwgdXJpLCB0b2tlbikudGhlbihyID0+IHIubWFwKENvbnZlcnQuVGVzdENvdmVyYWdlLnRvKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGVzdFJlc3VsdEludGVybmFsSURzLnNldChvLCByLmlkKTtcblx0XHRcdFx0XHRyZXR1cm4gbztcblx0XHRcdFx0fSlcblx0XHRcdFx0LmNvbmNhdCh0aGlzLnJlc3VsdHMpXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLmNvbXBsZXRlZEF0IC0gYS5jb21wbGV0ZWRBdClcblx0XHRcdFx0LnNsaWNlKDAsIDMyKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5yZXN1bHRzQ2hhbmdlZEVtaXR0ZXIuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZHMgdGhlIG5vZGVzIGluIHRoZSB0ZXN0IHRyZWUuIElmIGxldmVscyBpcyBsZXNzIHRoYW4gemVybywgaXQgd2lsbFxuXHQgKiBiZSB0cmVhdGVkIGFzIGluZmluaXRlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jICRleHBhbmRUZXN0KHRlc3RJZDogc3RyaW5nLCBsZXZlbHM6IG51bWJlcikge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSB0aGlzLmNvbnRyb2xsZXJzLmdldChUZXN0SWQuZnJvbVN0cmluZyh0ZXN0SWQpLmNvbnRyb2xsZXJJZCk/LmNvbGxlY3Rpb247XG5cdFx0aWYgKGNvbGxlY3Rpb24pIHtcblx0XHRcdGF3YWl0IGNvbGxlY3Rpb24uZXhwYW5kKHRlc3RJZCwgbGV2ZWxzIDwgMCA/IEluZmluaXR5IDogbGV2ZWxzKTtcblx0XHRcdGNvbGxlY3Rpb24uZmx1c2hEaWZmKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY2VpdmVzIGEgdGVzdCB1cGRhdGUgZnJvbSB0aGUgbWFpbiB0aHJlYWQuIENhbGxlZCAoZXZlbnR1YWxseSkgd2hlbmV2ZXJcblx0ICogdGVzdHMgY2hhbmdlLlxuXHQgKi9cblx0cHVibGljICRhY2NlcHREaWZmKGRpZmY6IFRlc3RzRGlmZk9wLlNlcmlhbGl6ZWRbXSk6IHZvaWQge1xuXHRcdHRoaXMub2JzZXJ2ZXIuYXBwbHlEaWZmKGRpZmYubWFwKGQgPT4gVGVzdHNEaWZmT3AuZGVzZXJpYWxpemUoeyBhc0Nhbm9uaWNhbFVyaTogdSA9PiB1IH0sIGQpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUnVucyB0ZXN0cyB3aXRoIHRoZSBnaXZlbiBzZXQgb2YgSURzLiBBbGxvd3MgZm9yIHRlc3QgZnJvbSBtdWx0aXBsZVxuXHQgKiBwcm92aWRlcnMgdG8gYmUgcnVuLlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jICRydW5Db250cm9sbGVyVGVzdHMocmVxczogSVN0YXJ0Q29udHJvbGxlclRlc3RzW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVN0YXJ0Q29udHJvbGxlclRlc3RzUmVzdWx0W10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocmVxcy5tYXAocmVxID0+IHRoaXMucnVuQ29udHJvbGxlclRlc3RSZXF1ZXN0KHJlcSwgZmFsc2UsIHRva2VuKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyBjb250aW51b3VzIHRlc3QgcnVucyB3aXRoIHRoZSBnaXZlbiBzZXQgb2YgSURzLiBBbGxvd3MgZm9yIHRlc3QgZnJvbVxuXHQgKiBtdWx0aXBsZSBwcm92aWRlcnMgdG8gYmUgcnVuLlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jICRzdGFydENvbnRpbnVvdXNSdW4ocmVxczogSVN0YXJ0Q29udHJvbGxlclRlc3RzW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVN0YXJ0Q29udHJvbGxlclRlc3RzUmVzdWx0W10+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IFByb21pc2UuYWxsKHJlcXMubWFwKHJlcSA9PiB0aGlzLnJ1bkNvbnRyb2xsZXJUZXN0UmVxdWVzdChyZXEsIHRydWUsIGN0cy50b2tlbikpKTtcblxuXHRcdC8vIGF2b2lkIHJldHVybmluZyB1bnRpbCBjYW5jZWxsYXRpb24gaXMgcmVxdWVzdGVkLCBvdGhlcndpc2UgaXBjIGRpc3Bvc2VzIG9mIHRoZSB0b2tlblxuXHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgIXJlcy5zb21lKHIgPT4gci5lcnJvcikpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQocikpO1xuXHRcdH1cblxuXHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGFzeW5jICRwcm92aWRlVGVzdEZvbGxvd3VwcyhyZXE6IFRlc3RNZXNzYWdlRm9sbG93dXBSZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFRlc3RNZXNzYWdlRm9sbG93dXBSZXNwb25zZVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHRoaXMucmVzdWx0cy5maW5kKHIgPT4gdGVzdFJlc3VsdEludGVybmFsSURzLmdldChyKSA9PT0gcmVxLnJlc3VsdElkKTtcblx0XHRjb25zdCB0ZXN0ID0gcmVzdWx0cyAmJiBmaW5kVGVzdEluUmVzdWx0U25hcHNob3QoVGVzdElkLmZyb21TdHJpbmcocmVxLmV4dElkKSwgcmVzdWx0cz8ucmVzdWx0cyk7XG5cdFx0aWYgKCF0ZXN0KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0bGV0IGZvbGxvd3VwczogdnNjb2RlLkNvbW1hbmRbXSA9IFtdO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLmZvbGxvd3VwUHJvdmlkZXJzXS5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgciA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVGb2xsb3d1cChyZXN1bHRzLCB0ZXN0LCByZXEudGFza0luZGV4LCByZXEubWVzc2FnZUluZGV4LCB0b2tlbik7XG5cdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0Zm9sbG93dXBzID0gZm9sbG93dXBzLmNvbmNhdChyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHRocm93biB3aGlsZSBwcm92aWRpbmcgZm9sbG93dXAgZm9yIHRlc3QgbWVzc2FnZWAsIGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBmb2xsb3d1cHMubWFwKGNvbW1hbmQgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBmb2xsb3d1cENvdW50ZXIrKztcblx0XHRcdHRoaXMudGVzdEZvbGxvd3Vwcy5zZXQoaWQsIGNvbW1hbmQpO1xuXHRcdFx0cmV0dXJuIHsgdGl0bGU6IGNvbW1hbmQudGl0bGUsIGlkIH07XG5cdFx0fSk7XG5cdH1cblxuXHQkZGlzcG9zZVRlc3RGb2xsb3d1cHMoaWQ6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpIG9mIGlkKSB7XG5cdFx0XHR0aGlzLnRlc3RGb2xsb3d1cHMuZGVsZXRlKGkpO1xuXHRcdH1cblx0fVxuXG5cdCRleGVjdXRlVGVzdEZvbGxvd3VwKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy50ZXN0Rm9sbG93dXBzLmdldChpZCk7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5jb21tYW5kLCAuLi4oY29tbWFuZC5hcmd1bWVudHMgfHwgW10pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFuIG9uZ29pbmcgdGVzdCBydW4uXG5cdCAqL1xuXHRwdWJsaWMgJGNhbmNlbEV4dGVuc2lvblRlc3RSdW4ocnVuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdGFza0lkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAocnVuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5ydW5UcmFja2VyLmNhbmNlbEFsbFJ1bnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ydW5UcmFja2VyLmNhbmNlbFJ1bkJ5SWQocnVuSWQsIHRhc2tJZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHVibGljIGdldE1ldGFkYXRhRm9yUnVuKHJ1bjogdnNjb2RlLlRlc3RSdW4pIHtcblx0XHRmb3IgKGNvbnN0IHRyYWNrZXIgb2YgdGhpcy5ydW5UcmFja2VyLnRyYWNrZXJzKSB7XG5cdFx0XHRjb25zdCB0YXNrSWQgPSB0cmFja2VyLmdldFRhc2tJZEZvclJ1bihydW4pO1xuXHRcdFx0aWYgKHRhc2tJZCkge1xuXHRcdFx0XHRyZXR1cm4geyB0YXNrSWQsIHJ1bklkOiB0cmFja2VyLmlkIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuQ29udHJvbGxlclRlc3RSZXF1ZXN0KHJlcTogSUNhbGxQcm9maWxlUnVuSGFuZGxlciB8IElDYWxsUHJvZmlsZVJ1bkhhbmRsZXIsIGlzQ29udGludW91czogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU3RhcnRDb250cm9sbGVyVGVzdHNSZXN1bHQ+IHtcblx0XHRjb25zdCBsb29rdXAgPSB0aGlzLmNvbnRyb2xsZXJzLmdldChyZXEuY29udHJvbGxlcklkKTtcblx0XHRpZiAoIWxvb2t1cCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29sbGVjdGlvbiwgcHJvZmlsZXMsIGV4dGVuc2lvbiB9ID0gbG9va3VwO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBwcm9maWxlcy5nZXQocmVxLnByb2ZpbGVJZCk7XG5cdFx0aWYgKCFwcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5jbHVkZVRlc3RzID0gcmVxLnRlc3RJZHNcblx0XHRcdC5tYXAoKHRlc3RJZCkgPT4gY29sbGVjdGlvbi50cmVlLmdldCh0ZXN0SWQpKVxuXHRcdFx0LmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0Y29uc3QgZXhjbHVkZVRlc3RzID0gcmVxLmV4Y2x1ZGVFeHRJZHNcblx0XHRcdC5tYXAoaWQgPT4gbG9va3VwLmNvbGxlY3Rpb24udHJlZS5nZXQoaWQpKVxuXHRcdFx0LmZpbHRlcihpc0RlZmluZWQpXG5cdFx0XHQuZmlsdGVyKGV4Y2x1ZGUgPT4gaW5jbHVkZVRlc3RzLnNvbWUoXG5cdFx0XHRcdGluY2x1ZGUgPT4gaW5jbHVkZS5mdWxsSWQuY29tcGFyZShleGNsdWRlLmZ1bGxJZCkgPT09IFRlc3RQb3NpdGlvbi5Jc0NoaWxkLFxuXHRcdFx0KSk7XG5cblx0XHRpZiAoIWluY2x1ZGVUZXN0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjb25zdCBwdWJsaWNSZXEgPSBuZXcgVGVzdFJ1blJlcXVlc3QoXG5cdFx0XHRpbmNsdWRlVGVzdHMuc29tZShpID0+IGkuYWN0dWFsIGluc3RhbmNlb2YgVGVzdEl0ZW1Sb290SW1wbCkgPyB1bmRlZmluZWQgOiBpbmNsdWRlVGVzdHMubWFwKHQgPT4gdC5hY3R1YWwpLFxuXHRcdFx0ZXhjbHVkZVRlc3RzLm1hcCh0ID0+IHQuYWN0dWFsKSxcblx0XHRcdHByb2ZpbGUsXG5cdFx0XHRpc0NvbnRpbnVvdXMsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHRyYWNrZXIgPSBpc1N0YXJ0Q29udHJvbGxlclRlc3RzKHJlcSkgJiYgdGhpcy5ydW5UcmFja2VyLnByZXBhcmVGb3JNYWluVGhyZWFkVGVzdFJ1bihcblx0XHRcdGV4dGVuc2lvbixcblx0XHRcdHB1YmxpY1JlcSxcblx0XHRcdFRlc3RSdW5EdG8uZnJvbUludGVybmFsKHJlcSwgbG9va3VwLmNvbGxlY3Rpb24pLFxuXHRcdFx0cHJvZmlsZSxcblx0XHRcdHRva2VuLFxuXHRcdCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvZmlsZS5ydW5IYW5kbGVyKHB1YmxpY1JlcSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiB7IGVycm9yOiBTdHJpbmcoZSkgfTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRyYWNrZXIpIHtcblx0XHRcdFx0aWYgKHRyYWNrZXIuaGFzUnVubmluZ1Rhc2tzICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0cmFja2VyLm9uRW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vLyBEZWFkbGluZSBhZnRlciBiZWluZyByZXF1ZXN0ZWQgYnkgYSB1c2VyIHRoYXQgYSB0ZXN0IHJ1biBpcyBmb3JjaWJseSBjYW5jZWxsZWQuXG5jb25zdCBSVU5fQ0FOQ0VMX0RFQURMSU5FID0gMTBfMDAwO1xuXG5jb25zdCBlbnVtIFRlc3RSdW5UcmFja2VyU3RhdGUge1xuXHQvLyBEZWZhdWx0IHN0YXRlXG5cdFJ1bm5pbmcsXG5cdC8vIENhbmNlbGxhdGlvbiBpcyByZXF1ZXN0ZWQsIGJ1dCB0aGUgcnVuIGlzIHN0aWxsIGdvaW5nLlxuXHRDYW5jZWxsaW5nLFxuXHQvLyBBbGwgdGFza3MgaGF2ZSBlbmRlZFxuXHRFbmRlZCxcbn1cblxuY2xhc3MgVGVzdFJ1blRyYWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0ZSA9IFRlc3RSdW5UcmFja2VyU3RhdGUuUnVubmluZztcblx0cHJpdmF0ZSBydW5uaW5nID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSB0YXNrcyA9IG5ldyBNYXA8LyogdGFzayBJRCAqL3N0cmluZywgeyBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlOyBydW46IHZzY29kZS5UZXN0UnVuIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2hhcmVkVGVzdElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW5kRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgcHVibGlzaGVkQ292ZXJhZ2UgPSBuZXcgTWFwPHN0cmluZywgeyByZXBvcnQ6IHZzY29kZS5GaWxlQ292ZXJhZ2U7IGV4dElkczogc3RyaW5nW10gfT4oKTtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbiBhIHRlc3QgZW5kcywgYW5kIG5vIG1vcmUgdGVzdHMgYXJlIGxlZnQgcnVubmluZy5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvbkVuZCA9IHRoaXMuZW5kRW1pdHRlci5ldmVudDtcblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIHRoZXJlIGFyZSBhbnkgdGVzdHMgcnVubmluZy5cblx0ICovXG5cdHB1YmxpYyBnZXQgaGFzUnVubmluZ1Rhc2tzKCkge1xuXHRcdHJldHVybiB0aGlzLnJ1bm5pbmcgPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHJ1biBJRC5cblx0ICovXG5cdHB1YmxpYyBnZXQgaWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZHRvLmlkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkdG86IFRlc3RSdW5EdG8sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogTWFpblRocmVhZFRlc3RpbmdTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZTogdnNjb2RlLlRlc3RSdW5Qcm9maWxlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cGFyZW50VG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShwYXJlbnRUb2tlbikpO1xuXG5cdFx0Y29uc3QgZm9yY2libHlFbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLmZvcmNpYmx5RW5kVGFza3MoKSwgUlVOX0NBTkNFTF9ERUFETElORSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGZvcmNpYmx5RW5kLnNjaGVkdWxlKCkpKTtcblxuXHRcdGNvbnN0IGRpZERpc3Bvc2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHR0aGlzLm9uRGlkRGlzcG9zZSA9IGRpZERpc3Bvc2VFbWl0dGVyLmV2ZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkaWREaXNwb3NlRW1pdHRlci5maXJlKCk7XG5cdFx0XHRkaWREaXNwb3NlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIEdldHMgdGhlIHRhc2sgSUQgZnJvbSBhIHRlc3QgcnVuIG9iamVjdC4gKi9cblx0cHVibGljIGdldFRhc2tJZEZvclJ1bihydW46IHZzY29kZS5UZXN0UnVuKSB7XG5cdFx0Zm9yIChjb25zdCBbdGFza0lkLCB7IHJ1bjogciB9XSBvZiB0aGlzLnRhc2tzKSB7XG5cdFx0XHRpZiAociA9PT0gcnVuKSB7XG5cdFx0XHRcdHJldHVybiB0YXNrSWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBSZXF1ZXN0cyBjYW5jZWxsYXRpb24gb2YgdGhlIHJ1bi4gT24gdGhlIHNlY29uZCBjYWxsLCBmb3JjZXMgY2FuY2VsbGF0aW9uLiAqL1xuXHRwdWJsaWMgY2FuY2VsKHRhc2tJZD86IHN0cmluZykge1xuXHRcdGlmICh0YXNrSWQpIHtcblx0XHRcdHRoaXMudGFza3MuZ2V0KHRhc2tJZCk/LmN0cy5jYW5jZWwoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFRlc3RSdW5UcmFja2VyU3RhdGUuUnVubmluZykge1xuXHRcdFx0dGhpcy5jdHMuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLnN0YXRlID0gVGVzdFJ1blRyYWNrZXJTdGF0ZS5DYW5jZWxsaW5nO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gVGVzdFJ1blRyYWNrZXJTdGF0ZS5DYW5jZWxsaW5nKSB7XG5cdFx0XHR0aGlzLmZvcmNpYmx5RW5kVGFza3MoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogR2V0cyBkZXRhaWxzIGZvciBhIHByZXZpb3VzbHktZW1pdHRlZCBjb3ZlcmFnZSBvYmplY3QuICovXG5cdHB1YmxpYyBhc3luYyBnZXRDb3ZlcmFnZURldGFpbHMoaWQ6IHN0cmluZywgdGVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLkZpbGVDb3ZlcmFnZURldGFpbFtdPiB7XG5cdFx0Y29uc3QgWywgdGFza0lkXSA9IFRlc3RJZC5mcm9tU3RyaW5nKGlkKS5wYXRoOyAvKiogcnVuSWQsIHRhc2tJZCwgVVJJICovXG5cdFx0Y29uc3QgY292ZXJhZ2UgPSB0aGlzLnB1Ymxpc2hlZENvdmVyYWdlLmdldChpZCk7XG5cdFx0aWYgKCFjb3ZlcmFnZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVwb3J0LCBleHRJZHMgfSA9IGNvdmVyYWdlO1xuXHRcdGNvbnN0IHRhc2sgPSB0aGlzLnRhc2tzLmdldCh0YXNrSWQpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bnJlYWNoYWJsZTogcnVuIHRhc2sgd2FzIG5vdCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdGxldCB0ZXN0SXRlbTogdnNjb2RlLlRlc3RJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0ZXN0SWQgJiYgcmVwb3J0IGluc3RhbmNlb2YgRmlsZUNvdmVyYWdlKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IGV4dElkcy5pbmRleE9mKHRlc3RJZCk7XG5cdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiBbXTsgLy8gPz9cblx0XHRcdH1cblx0XHRcdHRlc3RJdGVtID0gcmVwb3J0LmluY2x1ZGVzVGVzdHNbaW5kZXhdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbHMgPSB0ZXN0SXRlbVxuXHRcdFx0PyB0aGlzLnByb2ZpbGU/LmxvYWREZXRhaWxlZENvdmVyYWdlRm9yVGVzdD8uKHRhc2sucnVuLCByZXBvcnQsIHRlc3RJdGVtLCB0b2tlbilcblx0XHRcdDogdGhpcy5wcm9maWxlPy5sb2FkRGV0YWlsZWRDb3ZlcmFnZT8uKHRhc2sucnVuLCByZXBvcnQsIHRva2VuKTtcblxuXHRcdHJldHVybiAoYXdhaXQgZGV0YWlscykgPz8gW107XG5cdH1cblxuXHQvKiogQ3JlYXRlcyB0aGUgcHVibGljIHRlc3QgcnVuIGludGVyZmFjZSB0byBnaXZlIHRvIGV4dGVuc2lvbnMuICovXG5cdHB1YmxpYyBjcmVhdGVSdW4obmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdnNjb2RlLlRlc3RSdW4ge1xuXHRcdGNvbnN0IHJ1bklkID0gdGhpcy5kdG8uaWQ7XG5cdFx0Y29uc3QgY3RybElkID0gdGhpcy5kdG8uY29udHJvbGxlcklkO1xuXHRcdGNvbnN0IHRhc2tJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0Y29uc3QgZ3VhcmRUZXN0TXV0YXRpb24gPSA8QXJncyBleHRlbmRzIHVua25vd25bXT4oZm46ICh0ZXN0OiB2c2NvZGUuVGVzdEl0ZW0sIC4uLmFyZ3M6IEFyZ3MpID0+IHZvaWQpID0+XG5cdFx0XHQodGVzdDogdnNjb2RlLlRlc3RJdGVtLCAuLi5hcmdzOiBBcmdzKSA9PiB7XG5cdFx0XHRcdGlmIChlbmRlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBTZXR0aW5nIHRoZSBzdGF0ZSBvZiB0ZXN0IFwiJHt0ZXN0LmlkfVwiIGlzIGEgbm8tb3AgYWZ0ZXIgdGhlIHJ1biBlbmRzLmApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZW5zdXJlVGVzdElzS25vd24odGVzdCk7XG5cdFx0XHRcdGZuKHRlc3QsIC4uLmFyZ3MpO1xuXHRcdFx0fTtcblxuXHRcdGNvbnN0IGFwcGVuZE1lc3NhZ2VzID0gKHRlc3Q6IHZzY29kZS5UZXN0SXRlbSwgbWVzc2FnZXM6IHZzY29kZS5UZXN0TWVzc2FnZSB8IHJlYWRvbmx5IHZzY29kZS5UZXN0TWVzc2FnZVtdKSA9PiB7XG5cdFx0XHRjb25zdCBjb252ZXJ0ZWQgPSBtZXNzYWdlcyBpbnN0YW5jZW9mIEFycmF5XG5cdFx0XHRcdD8gbWVzc2FnZXMubWFwKENvbnZlcnQuVGVzdE1lc3NhZ2UuZnJvbSlcblx0XHRcdFx0OiBbQ29udmVydC5UZXN0TWVzc2FnZS5mcm9tKG1lc3NhZ2VzKV07XG5cblx0XHRcdGlmICh0ZXN0LnVyaSAmJiB0ZXN0LnJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbjogSUxvY2F0aW9uRHRvID0geyByYW5nZTogQ29udmVydC5SYW5nZS5mcm9tKHRlc3QucmFuZ2UpLCB1cmk6IHRlc3QudXJpIH07XG5cdFx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBjb252ZXJ0ZWQpIHtcblx0XHRcdFx0XHRtZXNzYWdlLmxvY2F0aW9uID0gbWVzc2FnZS5sb2NhdGlvbiB8fCBkZWZhdWx0TG9jYXRpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wcm94eS4kYXBwZW5kVGVzdE1lc3NhZ2VzSW5SdW4ocnVuSWQsIHRhc2tJZCwgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLCBjb252ZXJ0ZWQpO1xuXHRcdH07XG5cblx0XHRsZXQgZW5kZWQgPSBmYWxzZTtcblx0XHQvLyB0YXNrcyBhcmUgYWxpdmUgZm9yIGFzIGxvbmcgYXMgdGhlIHRyYWNrZXIgaXMgYWxpdmUsIHNvIHNpbXBsZSB0aGlzLl9yZWdpc3RlciBpcyBmaW5lOlxuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0aGlzLmN0cy50b2tlbikpO1xuXG5cdFx0Ly8gb25lLW9mZiBtYXAgdXNlZCB0byBhc3NvY2lhdGUgdGVzdCBpdGVtcyB3aXRoIGluY3JlbWVudGluZyBJRHMgaW4gYGFkZENvdmVyYWdlYC5cblx0XHQvLyBUaGVyZSdzIG5vIG5lZWQgdG8gaW5jbHVkZSB0aGVpciBlbnRpcmUgSUQsIHdlIGp1c3Qgd2FudCB0byBtYWtlIHN1cmUgdGhleSdyZVxuXHRcdC8vIHN0YWJsZSBhbmQgdW5pcXVlLiBOb3JtYWwgbWFwIGlzIG9rYXkgc2luY2UgVGVzdFJ1biBsaWZldGltZXMgYXJlIGxpbWl0ZWQuXG5cdFx0Y29uc3QgcnVuOiB2c2NvZGUuVGVzdFJ1biA9IHtcblx0XHRcdGlzUGVyc2lzdGVkOiB0aGlzLmR0by5pc1BlcnNpc3RlZCxcblx0XHRcdHRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHRuYW1lLFxuXHRcdFx0b25EaWREaXNwb3NlOiB0aGlzLm9uRGlkRGlzcG9zZSxcblx0XHRcdGFkZENvdmVyYWdlOiAoY292ZXJhZ2UpID0+IHtcblx0XHRcdFx0aWYgKGVuZGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaW5jbHVkZXNUZXN0cyA9IGNvdmVyYWdlIGluc3RhbmNlb2YgRmlsZUNvdmVyYWdlID8gY292ZXJhZ2UuaW5jbHVkZXNUZXN0cyA6IFtdO1xuXHRcdFx0XHRpZiAoaW5jbHVkZXNUZXN0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRlc3Qgb2YgaW5jbHVkZXNUZXN0cykge1xuXHRcdFx0XHRcdFx0dGhpcy5lbnN1cmVUZXN0SXNLbm93bih0ZXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1cmlTdHIgPSBjb3ZlcmFnZS51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0Y29uc3QgaWQgPSBuZXcgVGVzdElkKFtydW5JZCwgdGFza0lkLCB1cmlTdHJdKS50b1N0cmluZygpO1xuXHRcdFx0XHQvLyBpdCdzIGEgbGlsIGZ1bmt5LCBidXQgaXQncyBwb3NzaWJsZSBmb3IgYSB0ZXN0IGl0ZW0ncyBJRCB0byBjaGFuZ2UgYWZ0ZXJcblx0XHRcdFx0Ly8gaXQncyBiZWVuIHJlcG9ydGVkIGlmIGl0J3MgcmVob21lZCB1bmRlciBhIGRpZmZlcmVudCBwYXJlbnQuIFJlY29yZCBpdHNcblx0XHRcdFx0Ly8gSUQgYXQgdGhlIHRpbWUgd2hlbiB0aGUgY292ZXJhZ2UgcmVwb3J0IGlzIGdlbmVyYXRlZCBzbyB3ZSBjYW4gcmVmZXJlbmNlXG5cdFx0XHRcdC8vIGl0IGxhdGVyIGlmIG5lZWRlZWQuXG5cdFx0XHRcdHRoaXMucHVibGlzaGVkQ292ZXJhZ2Uuc2V0KGlkLCB7IHJlcG9ydDogY292ZXJhZ2UsIGV4dElkczogaW5jbHVkZXNUZXN0cy5tYXAodCA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0LCBjdHJsSWQpLnRvU3RyaW5nKCkpIH0pO1xuXHRcdFx0XHR0aGlzLnByb3h5LiRhcHBlbmRDb3ZlcmFnZShydW5JZCwgdGFza0lkLCBDb252ZXJ0LlRlc3RDb3ZlcmFnZS5mcm9tRmlsZShjdHJsSWQsIGlkLCBjb3ZlcmFnZSkpO1xuXHRcdFx0fSxcblx0XHRcdC8vI3JlZ2lvbiBzdGF0ZSBtdXRhdGlvblxuXHRcdFx0ZW5xdWV1ZWQ6IGd1YXJkVGVzdE11dGF0aW9uKHRlc3QgPT4ge1xuXHRcdFx0XHR0aGlzLnByb3h5LiR1cGRhdGVUZXN0U3RhdGVJblJ1bihydW5JZCwgdGFza0lkLCBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0ZXN0LCBjdHJsSWQpLnRvU3RyaW5nKCksIFRlc3RSZXN1bHRTdGF0ZS5RdWV1ZWQpO1xuXHRcdFx0fSksXG5cdFx0XHRza2lwcGVkOiBndWFyZFRlc3RNdXRhdGlvbih0ZXN0ID0+IHtcblx0XHRcdFx0dGhpcy5wcm94eS4kdXBkYXRlVGVzdFN0YXRlSW5SdW4ocnVuSWQsIHRhc2tJZCwgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLCBUZXN0UmVzdWx0U3RhdGUuU2tpcHBlZCk7XG5cdFx0XHR9KSxcblx0XHRcdHN0YXJ0ZWQ6IGd1YXJkVGVzdE11dGF0aW9uKHRlc3QgPT4ge1xuXHRcdFx0XHR0aGlzLnByb3h5LiR1cGRhdGVUZXN0U3RhdGVJblJ1bihydW5JZCwgdGFza0lkLCBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0ZXN0LCBjdHJsSWQpLnRvU3RyaW5nKCksIFRlc3RSZXN1bHRTdGF0ZS5SdW5uaW5nKTtcblx0XHRcdH0pLFxuXHRcdFx0ZXJyb3JlZDogZ3VhcmRUZXN0TXV0YXRpb24oKHRlc3QsIG1lc3NhZ2VzLCBkdXJhdGlvbikgPT4ge1xuXHRcdFx0XHRhcHBlbmRNZXNzYWdlcyh0ZXN0LCBtZXNzYWdlcyk7XG5cdFx0XHRcdHRoaXMucHJveHkuJHVwZGF0ZVRlc3RTdGF0ZUluUnVuKHJ1bklkLCB0YXNrSWQsIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIGN0cmxJZCkudG9TdHJpbmcoKSwgVGVzdFJlc3VsdFN0YXRlLkVycm9yZWQsIGR1cmF0aW9uKTtcblx0XHRcdH0pLFxuXHRcdFx0ZmFpbGVkOiBndWFyZFRlc3RNdXRhdGlvbigodGVzdCwgbWVzc2FnZXMsIGR1cmF0aW9uKSA9PiB7XG5cdFx0XHRcdGFwcGVuZE1lc3NhZ2VzKHRlc3QsIG1lc3NhZ2VzKTtcblx0XHRcdFx0dGhpcy5wcm94eS4kdXBkYXRlVGVzdFN0YXRlSW5SdW4ocnVuSWQsIHRhc2tJZCwgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLCBUZXN0UmVzdWx0U3RhdGUuRmFpbGVkLCBkdXJhdGlvbik7XG5cdFx0XHR9KSxcblx0XHRcdHBhc3NlZDogZ3VhcmRUZXN0TXV0YXRpb24oKHRlc3QsIGR1cmF0aW9uKSA9PiB7XG5cdFx0XHRcdHRoaXMucHJveHkuJHVwZGF0ZVRlc3RTdGF0ZUluUnVuKHJ1bklkLCB0YXNrSWQsIFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHRlc3QsIHRoaXMuZHRvLmNvbnRyb2xsZXJJZCkudG9TdHJpbmcoKSwgVGVzdFJlc3VsdFN0YXRlLlBhc3NlZCwgZHVyYXRpb24pO1xuXHRcdFx0fSksXG5cdFx0XHQvLyNlbmRyZWdpb25cblx0XHRcdGFwcGVuZE91dHB1dDogKG91dHB1dCwgbG9jYXRpb24/OiB2c2NvZGUuTG9jYXRpb24sIHRlc3Q/OiB2c2NvZGUuVGVzdEl0ZW0pID0+IHtcblx0XHRcdFx0aWYgKGVuZGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRlc3QpIHtcblx0XHRcdFx0XHR0aGlzLmVuc3VyZVRlc3RJc0tub3duKHRlc3QpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5wcm94eS4kYXBwZW5kT3V0cHV0VG9SdW4oXG5cdFx0XHRcdFx0cnVuSWQsXG5cdFx0XHRcdFx0dGFza0lkLFxuXHRcdFx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcob3V0cHV0KSxcblx0XHRcdFx0XHRsb2NhdGlvbiAmJiBDb252ZXJ0LmxvY2F0aW9uLmZyb20obG9jYXRpb24pLFxuXHRcdFx0XHRcdHRlc3QgJiYgVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgY3RybElkKS50b1N0cmluZygpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdGVuZDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoZW5kZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbmRlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMucHJveHkuJGZpbmlzaGVkVGVzdFJ1blRhc2socnVuSWQsIHRhc2tJZCk7XG5cdFx0XHRcdGlmICghLS10aGlzLnJ1bm5pbmcpIHtcblx0XHRcdFx0XHR0aGlzLm1hcmtFbmRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMucnVubmluZysrO1xuXHRcdHRoaXMudGFza3Muc2V0KHRhc2tJZCwgeyBydW4sIGN0cyB9KTtcblx0XHR0aGlzLnByb3h5LiRzdGFydGVkVGVzdFJ1blRhc2socnVuSWQsIHtcblx0XHRcdGlkOiB0YXNrSWQsXG5cdFx0XHRjdHJsSWQ6IHRoaXMuZHRvLmNvbnRyb2xsZXJJZCxcblx0XHRcdG5hbWU6IG5hbWUgfHwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUgfHwgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdHJ1bm5pbmc6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcnVuO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JjaWJseUVuZFRhc2tzKCkge1xuXHRcdGZvciAoY29uc3QgeyBydW4gfSBvZiB0aGlzLnRhc2tzLnZhbHVlcygpKSB7XG5cdFx0XHRydW4uZW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtYXJrRW5kZWQoKSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFRlc3RSdW5UcmFja2VyU3RhdGUuRW5kZWQpIHtcblx0XHRcdHRoaXMuc3RhdGUgPSBUZXN0UnVuVHJhY2tlclN0YXRlLkVuZGVkO1xuXHRcdFx0dGhpcy5lbmRFbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZVRlc3RJc0tub3duKHRlc3Q6IHZzY29kZS5UZXN0SXRlbSkge1xuXHRcdGlmICghKHRlc3QgaW5zdGFuY2VvZiBUZXN0SXRlbUltcGwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgSW52YWxpZFRlc3RJdGVtRXJyb3IodGVzdC5pZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hhcmVkVGVzdElkcy5oYXMoVGVzdElkLmZyb21FeHRIb3N0VGVzdEl0ZW0odGVzdCwgdGhpcy5kdG8uY29udHJvbGxlcklkKS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYWluOiBJVGVzdEl0ZW0uU2VyaWFsaXplZFtdID0gW107XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZHRvLmNvbGxsZWN0aW9uLnJvb3Q7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGNvbnZlcnRlZCA9IENvbnZlcnQuVGVzdEl0ZW0uZnJvbSh0ZXN0IGFzIFRlc3RJdGVtSW1wbCk7XG5cdFx0XHRjaGFpbi51bnNoaWZ0KGNvbnZlcnRlZCk7XG5cblx0XHRcdGlmICh0aGlzLnNoYXJlZFRlc3RJZHMuaGFzKGNvbnZlcnRlZC5leHRJZCkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2hhcmVkVGVzdElkcy5hZGQoY29udmVydGVkLmV4dElkKTtcblx0XHRcdGlmICh0ZXN0ID09PSByb290KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0ID0gdGVzdC5wYXJlbnQgfHwgcm9vdDtcblx0XHR9XG5cblx0XHR0aGlzLnByb3h5LiRhZGRUZXN0c1RvUnVuKHRoaXMuZHRvLmNvbnRyb2xsZXJJZCwgdGhpcy5kdG8uaWQsIGNoYWluKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya0VuZGVkKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogUXVldWVzIHJ1bnMgZm9yIGEgc2luZ2xlIGV4dGVuc2lvbiBhbmQgcHJvdmlkZXMgdGhlIGN1cnJlbnRseS1leGVjdXRpbmdcbiAqIHJ1biBzbyB0aGF0IGBjcmVhdGVUZXN0UnVuYCBjYW4gYmUgcHJvcGVybHkgY29ycmVsYXRlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlc3RSdW5Db29yZGluYXRvciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhY2tlZCA9IG5ldyBNYXA8dnNjb2RlLlRlc3RSdW5SZXF1ZXN0LCBUZXN0UnVuVHJhY2tlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmFja2VkQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0UnVuVHJhY2tlcj4oKTtcblxuXHRwdWJsaWMgZ2V0IHRyYWNrZXJzKCkge1xuXHRcdHJldHVybiB0aGlzLnRyYWNrZWQudmFsdWVzKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIEdldHMgYSBjb3ZlcmFnZSByZXBvcnQgZm9yIGEgZ2l2ZW4gcnVuIGFuZCB0YXNrIElELlxuXHQgKi9cblx0cHVibGljIGdldENvdmVyYWdlRGV0YWlscyhpZDogc3RyaW5nLCB0ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGNvbnN0IHJ1bklkID0gVGVzdElkLnJvb3QoaWQpO1xuXHRcdHJldHVybiB0aGlzLnRyYWNrZWRCeUlkLmdldChydW5JZCk/LmdldENvdmVyYWdlRGV0YWlscyhpZCwgdGVzdElkLCB0b2tlbikgfHwgW107XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgdGhlIHRlc3QgcnVuLCBjYWxsZWQgd2hlbiB0aGUgbWFpbiB0aHJlYWQgaXMgbm8gbG9uZ2VyIGludGVyZXN0ZWRcblx0ICogaW4gYXNzb2NpYXRlZCBkYXRhLlxuXHQgKi9cblx0cHVibGljIGRpc3Bvc2VUZXN0UnVuKHJ1bklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLnRyYWNrZWRCeUlkLmdldChydW5JZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnRyYWNrZWRCeUlkLmRlbGV0ZShydW5JZCk7XG5cdFx0Zm9yIChjb25zdCBbcmVxLCB7IGlkIH1dIG9mIHRoaXMudHJhY2tlZCkge1xuXHRcdFx0aWYgKGlkID09PSBydW5JZCkge1xuXHRcdFx0XHR0aGlzLnRyYWNrZWQuZGVsZXRlKHJlcSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHJlcXVlc3QgYXMgYmVpbmcgaW52b2tlZCBieSB0aGUgbWFpbiB0aHJlYWQsIHNvXG5cdCAqIGAkc3RhcnRlZEV4dGVuc2lvblRlc3RSdW5gIGlzIG5vdCBpbnZva2VkLiBUaGUgcnVuIG11c3QgZXZlbnR1YWxseVxuXHQgKiBiZSBjYW5jZWxsZWQgbWFudWFsbHkuXG5cdCAqL1xuXHRwdWJsaWMgcHJlcGFyZUZvck1haW5UaHJlYWRUZXN0UnVuKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZXE6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgZHRvOiBUZXN0UnVuRHRvLCBwcm9maWxlOiB2c2NvZGUuVGVzdFJ1blByb2ZpbGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHJldHVybiB0aGlzLmdldFRyYWNrZXIocmVxLCBkdG8sIHByb2ZpbGUsIGV4dGVuc2lvbiwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbHMgYW4gZXhpc3RpbmcgdGVzdCBydW4gdmlhIGl0cyBjYW5jZWxsYXRpb24gdG9rZW4uXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsUnVuQnlJZChydW5JZDogc3RyaW5nLCB0YXNrSWQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnRyYWNrZWRCeUlkLmdldChydW5JZCk/LmNhbmNlbCh0YXNrSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbHMgYW4gZXhpc3RpbmcgdGVzdCBydW4gdmlhIGl0cyBjYW5jZWxsYXRpb24gdG9rZW4uXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsQWxsUnVucygpIHtcblx0XHRmb3IgKGNvbnN0IHRyYWNrZXIgb2YgdGhpcy50cmFja2VkLnZhbHVlcygpKSB7XG5cdFx0XHR0cmFja2VyLmNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbXBsZW1lbnRzIHRoZSBwdWJsaWMgYGNyZWF0ZVRlc3RSdW5gIEFQSS5cblx0ICovXG5cdHB1YmxpYyBjcmVhdGVUZXN0UnVuKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBjb250cm9sbGVySWQ6IHN0cmluZywgY29sbGVjdGlvbjogRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbiwgcmVxdWVzdDogdnNjb2RlLlRlc3RSdW5SZXF1ZXN0LCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBlcnNpc3Q6IGJvb2xlYW4pOiB2c2NvZGUuVGVzdFJ1biB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLnRyYWNrZWQuZ2V0KHJlcXVlc3QpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLmNyZWF0ZVJ1bihuYW1lKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBub3QgYW4gZXhpc3RpbmcgdHJhY2tlZCBleHRlbnNpb24gZm9yIHRoZSByZXF1ZXN0LCBzdGFydFxuXHRcdC8vIGEgbmV3LCBkZXRhY2hlZCBzZXNzaW9uLlxuXHRcdGNvbnN0IGR0byA9IFRlc3RSdW5EdG8uZnJvbVB1YmxpYyhjb250cm9sbGVySWQsIGNvbGxlY3Rpb24sIHJlcXVlc3QsIHBlcnNpc3QpO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSB0cnlHZXRQcm9maWxlRnJvbVRlc3RSdW5SZXEocmVxdWVzdCk7XG5cdFx0dGhpcy5wcm94eS4kc3RhcnRlZEV4dGVuc2lvblRlc3RSdW4oe1xuXHRcdFx0Y29udHJvbGxlcklkLFxuXHRcdFx0Y29udGludW91czogISFyZXF1ZXN0LmNvbnRpbnVvdXMsXG5cdFx0XHRwcm9maWxlOiBwcm9maWxlICYmIHsgZ3JvdXA6IENvbnZlcnQuVGVzdFJ1blByb2ZpbGVLaW5kLmZyb20ocHJvZmlsZS5raW5kKSwgaWQ6IHByb2ZpbGUucHJvZmlsZUlkIH0sXG5cdFx0XHRleGNsdWRlOiByZXF1ZXN0LmV4Y2x1ZGU/Lm1hcCh0ID0+IFRlc3RJZC5mcm9tRXh0SG9zdFRlc3RJdGVtKHQsIGNvbGxlY3Rpb24ucm9vdC5pZCkudG9TdHJpbmcoKSkgPz8gW10sXG5cdFx0XHRpZDogZHRvLmlkLFxuXHRcdFx0aW5jbHVkZTogcmVxdWVzdC5pbmNsdWRlPy5tYXAodCA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0LCBjb2xsZWN0aW9uLnJvb3QuaWQpLnRvU3RyaW5nKCkpID8/IFtjb2xsZWN0aW9uLnJvb3QuaWRdLFxuXHRcdFx0cHJlc2VydmVGb2N1czogcmVxdWVzdC5wcmVzZXJ2ZUZvY3VzID8/IHRydWUsXG5cdFx0XHRwZXJzaXN0XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGhpcy5nZXRUcmFja2VyKHJlcXVlc3QsIGR0bywgcmVxdWVzdC5wcm9maWxlLCBleHRlbnNpb24pO1xuXHRcdEV2ZW50Lm9uY2UodHJhY2tlci5vbkVuZCkoKCkgPT4ge1xuXHRcdFx0dGhpcy5wcm94eS4kZmluaXNoZWRFeHRlbnNpb25UZXN0UnVuKGR0by5pZCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdHJhY2tlci5jcmVhdGVSdW4obmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRyYWNrZXIocmVxOiB2c2NvZGUuVGVzdFJ1blJlcXVlc3QsIGR0bzogVGVzdFJ1bkR0bywgcHJvZmlsZTogdnNjb2RlLlRlc3RSdW5Qcm9maWxlIHwgdW5kZWZpbmVkLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGNvbnN0IHRyYWNrZXIgPSBuZXcgVGVzdFJ1blRyYWNrZXIoZHRvLCB0aGlzLnByb3h5LCB0aGlzLmxvZ1NlcnZpY2UsIHByb2ZpbGUsIGV4dGVuc2lvbiwgdG9rZW4pO1xuXHRcdHRoaXMudHJhY2tlZC5zZXQocmVxLCB0cmFja2VyKTtcblx0XHR0aGlzLnRyYWNrZWRCeUlkLnNldCh0cmFja2VyLmlkLCB0cmFja2VyKTtcblx0XHRyZXR1cm4gdHJhY2tlcjtcblx0fVxufVxuXG5jb25zdCB0cnlHZXRQcm9maWxlRnJvbVRlc3RSdW5SZXEgPSAocmVxdWVzdDogdnNjb2RlLlRlc3RSdW5SZXF1ZXN0KSA9PiB7XG5cdGlmICghcmVxdWVzdC5wcm9maWxlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmICghKHJlcXVlc3QucHJvZmlsZSBpbnN0YW5jZW9mIFRlc3RSdW5Qcm9maWxlSW1wbCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlc3RSdW5SZXF1ZXN0LnByb2ZpbGUgaXMgbm90IGFuIGluc3RhbmNlIGNyZWF0ZWQgZnJvbSBUZXN0Q29udHJvbGxlci5jcmVhdGVSdW5Qcm9maWxlYCk7XG5cdH1cblxuXHRyZXR1cm4gcmVxdWVzdC5wcm9maWxlO1xufTtcblxuZXhwb3J0IGNsYXNzIFRlc3RSdW5EdG8ge1xuXHRwdWJsaWMgc3RhdGljIGZyb21QdWJsaWMoY29udHJvbGxlcklkOiBzdHJpbmcsIGNvbGxlY3Rpb246IEV4dEhvc3RUZXN0SXRlbUNvbGxlY3Rpb24sIHJlcXVlc3Q6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgcGVyc2lzdDogYm9vbGVhbikge1xuXHRcdHJldHVybiBuZXcgVGVzdFJ1bkR0byhcblx0XHRcdGNvbnRyb2xsZXJJZCxcblx0XHRcdGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0cGVyc2lzdCxcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZnJvbUludGVybmFsKHJlcXVlc3Q6IElTdGFydENvbnRyb2xsZXJUZXN0cywgY29sbGVjdGlvbjogRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbikge1xuXHRcdHJldHVybiBuZXcgVGVzdFJ1bkR0byhcblx0XHRcdHJlcXVlc3QuY29udHJvbGxlcklkLFxuXHRcdFx0cmVxdWVzdC5ydW5JZCxcblx0XHRcdHRydWUsXG5cdFx0XHRjb2xsZWN0aW9uLFxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udHJvbGxlcklkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlzUGVyc2lzdGVkOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb2xsbGVjdGlvbjogRXh0SG9zdFRlc3RJdGVtQ29sbGVjdGlvbixcblx0KSB7XG5cdH1cbn1cblxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5pbnRlcmZhY2UgTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0gZXh0ZW5kcyBJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uSXRlbSB7XG5cdHJldml2ZWQ6IHZzY29kZS5UZXN0SXRlbTtcblx0ZGVwdGg6IG51bWJlcjtcbn1cblxuY2xhc3MgTWlycm9yZWRDaGFuZ2VDb2xsZWN0b3IgaW1wbGVtZW50cyBJbmNyZW1lbnRhbENoYW5nZUNvbGxlY3RvcjxNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGFkZGVkID0gbmV3IFNldDxNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVkID0gbmV3IFNldDxNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZW1vdmVkID0gbmV3IFNldDxNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFscmVhZHlSZW1vdmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHVibGljIGdldCBpc0VtcHR5KCkge1xuXHRcdHJldHVybiB0aGlzLmFkZGVkLnNpemUgPT09IDAgJiYgdGhpcy5yZW1vdmVkLnNpemUgPT09IDAgJiYgdGhpcy51cGRhdGVkLnNpemUgPT09IDA7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGVtaXR0ZXI6IEVtaXR0ZXI8dnNjb2RlLlRlc3RzQ2hhbmdlRXZlbnQ+KSB7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhZGQobm9kZTogTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLmFkZGVkLmFkZChub2RlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHVwZGF0ZShub2RlOiBNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbSk6IHZvaWQge1xuXHRcdE9iamVjdC5hc3NpZ24obm9kZS5yZXZpdmVkLCBDb252ZXJ0LlRlc3RJdGVtLnRvUGxhaW4obm9kZS5pdGVtKSk7XG5cdFx0aWYgKCF0aGlzLmFkZGVkLmhhcyhub2RlKSkge1xuXHRcdFx0dGhpcy51cGRhdGVkLmFkZChub2RlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZW1vdmUobm9kZTogTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hZGRlZC5kZWxldGUobm9kZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZWQuZGVsZXRlKG5vZGUpO1xuXG5cdFx0Y29uc3QgcGFyZW50SWQgPSBUZXN0SWQucGFyZW50SWQobm9kZS5pdGVtLmV4dElkKTtcblx0XHRpZiAocGFyZW50SWQgJiYgdGhpcy5hbHJlYWR5UmVtb3ZlZC5oYXMocGFyZW50SWQudG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMuYWxyZWFkeVJlbW92ZWQuYWRkKG5vZGUuaXRlbS5leHRJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVkLmFkZChub2RlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldENoYW5nZUV2ZW50KCk6IHZzY29kZS5UZXN0c0NoYW5nZUV2ZW50IHtcblx0XHRjb25zdCB7IGFkZGVkLCB1cGRhdGVkLCByZW1vdmVkIH0gPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgYWRkZWQoKSB7IHJldHVybiBbLi4uYWRkZWRdLm1hcChuID0+IG4ucmV2aXZlZCk7IH0sXG5cdFx0XHRnZXQgdXBkYXRlZCgpIHsgcmV0dXJuIFsuLi51cGRhdGVkXS5tYXAobiA9PiBuLnJldml2ZWQpOyB9LFxuXHRcdFx0Z2V0IHJlbW92ZWQoKSB7IHJldHVybiBbLi4ucmVtb3ZlZF0ubWFwKG4gPT4gbi5yZXZpdmVkKTsgfSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGNvbXBsZXRlKCkge1xuXHRcdGlmICghdGhpcy5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmVtaXR0ZXIuZmlyZSh0aGlzLmdldENoYW5nZUV2ZW50KCkpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIE1haW50YWlucyB0ZXN0cyBpbiB0aGlzIGV4dGVuc2lvbiBob3N0IHNlbnQgZnJvbSB0aGUgbWFpbiB0aHJlYWQuXG4gKiBAcHJpdmF0ZVxuICovXG5jbGFzcyBNaXJyb3JlZFRlc3RDb2xsZWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbmNyZW1lbnRhbFRlc3RDb2xsZWN0aW9uPE1pcnJvcmVkQ29sbGVjdGlvblRlc3RJdGVtPiB7XG5cdHByaXZhdGUgY2hhbmdlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXN0c0NoYW5nZUV2ZW50PigpO1xuXG5cdC8qKlxuXHQgKiBDaGFuZ2UgZW1pdHRlciB0aGF0IGZpcmVzIHdpdGggdGhlIHNhbWUgc2VtYW50aWNzIGFzIGBUZXN0T2JzZXJ2ZXIub25EaWRDaGFuZ2VUZXN0c2AuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VUZXN0cyA9IHRoaXMuY2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHQvKipcblx0ICogR2V0cyBhIGxpc3Qgb2Ygcm9vdCB0ZXN0IGl0ZW1zLlxuXHQgKi9cblx0cHVibGljIGdldCByb290VGVzdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMucm9vdHM7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogSWYgdGhlIHRlc3QgSUQgZXhpc3RzLCByZXR1cm5zIGl0cyB1bmRlcmx5aW5nIElELlxuXHQgKi9cblx0cHVibGljIGdldE1pcnJvcmVkVGVzdERhdGFCeUlkKGl0ZW1JZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZ2V0KGl0ZW1JZCk7XG5cdH1cblxuXHQvKipcblx0ICogSWYgdGhlIHRlc3QgaXRlbSBpcyBhIG1pcnJvcmVkIHRlc3QgaXRlbSwgcmV0dXJucyBpdHMgdW5kZXJseWluZyBJRC5cblx0ICovXG5cdHB1YmxpYyBnZXRNaXJyb3JlZFRlc3REYXRhQnlSZWZlcmVuY2UoaXRlbTogdnNjb2RlLlRlc3RJdGVtKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZ2V0KGl0ZW0uaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHJvdGVjdGVkIGNyZWF0ZUl0ZW0oaXRlbTogSW50ZXJuYWxUZXN0SXRlbSwgcGFyZW50PzogTWlycm9yZWRDb2xsZWN0aW9uVGVzdEl0ZW0pOiBNaXJyb3JlZENvbGxlY3Rpb25UZXN0SXRlbSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLml0ZW0sXG5cdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IG1ha2UgdGhpcyB3b3JrIHdlbGwgYWdhaW4gd2l0aCBjaGlsZHJlblxuXHRcdFx0cmV2aXZlZDogQ29udmVydC5UZXN0SXRlbS50b1BsYWluKGl0ZW0uaXRlbSkgYXMgdnNjb2RlLlRlc3RJdGVtLFxuXHRcdFx0ZGVwdGg6IHBhcmVudCA/IHBhcmVudC5kZXB0aCArIDEgOiAwLFxuXHRcdFx0Y2hpbGRyZW46IG5ldyBTZXQoKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBvdmVycmlkZVxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNoYW5nZUNvbGxlY3RvcigpIHtcblx0XHRyZXR1cm4gbmV3IE1pcnJvcmVkQ2hhbmdlQ29sbGVjdG9yKHRoaXMuY2hhbmdlRW1pdHRlcik7XG5cdH1cbn1cblxuY2xhc3MgVGVzdE9ic2VydmVycyB7XG5cdHByaXZhdGUgY3VycmVudD86IHtcblx0XHRvYnNlcnZlcnM6IG51bWJlcjtcblx0XHR0ZXN0czogTWlycm9yZWRUZXN0Q29sbGVjdGlvbjtcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBjaGVja291dCgpOiB2c2NvZGUuVGVzdE9ic2VydmVyIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudCkge1xuXHRcdFx0dGhpcy5jdXJyZW50ID0gdGhpcy5jcmVhdGVPYnNlcnZlckRhdGEoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5jdXJyZW50O1xuXHRcdGN1cnJlbnQub2JzZXJ2ZXJzKys7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2VUZXN0OiBjdXJyZW50LnRlc3RzLm9uRGlkQ2hhbmdlVGVzdHMsXG5cdFx0XHRnZXQgdGVzdHMoKSB7IHJldHVybiBbLi4uY3VycmVudC50ZXN0cy5yb290VGVzdHNdLm1hcCh0ID0+IHQucmV2aXZlZCk7IH0sXG5cdFx0XHRkaXNwb3NlOiBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4ge1xuXHRcdFx0XHRpZiAoLS1jdXJyZW50Lm9ic2VydmVycyA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMucHJveHkuJHVuc3Vic2NyaWJlRnJvbURpZmZzKCk7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGludGVybmFsIHRlc3QgZGF0YSBieSBpdHMgcmVmZXJlbmNlLlxuXHQgKi9cblx0cHVibGljIGdldE1pcnJvcmVkVGVzdERhdGFCeVJlZmVyZW5jZShyZWY6IHZzY29kZS5UZXN0SXRlbSkge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQ/LnRlc3RzLmdldE1pcnJvcmVkVGVzdERhdGFCeVJlZmVyZW5jZShyZWYpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGVzdCBkaWZmcyB0byB0aGUgY3VycmVudCBzZXQgb2Ygb2JzZXJ2ZWQgdGVzdHMuXG5cdCAqL1xuXHRwdWJsaWMgYXBwbHlEaWZmKGRpZmY6IFRlc3RzRGlmZikge1xuXHRcdHRoaXMuY3VycmVudD8udGVzdHMuYXBwbHkoZGlmZik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9ic2VydmVyRGF0YSgpIHtcblx0XHRjb25zdCB0ZXN0cyA9IG5ldyBNaXJyb3JlZFRlc3RDb2xsZWN0aW9uKHsgYXNDYW5vbmljYWxVcmk6IHUgPT4gdSB9KTtcblx0XHR0aGlzLnByb3h5LiRzdWJzY3JpYmVUb0RpZmZzKCk7XG5cdFx0cmV0dXJuIHsgb2JzZXJ2ZXJzOiAwLCB0ZXN0cywgfTtcblx0fVxufVxuXG5jb25zdCB1cGRhdGVQcm9maWxlID0gKGltcGw6IFRlc3RSdW5Qcm9maWxlSW1wbCwgcHJveHk6IE1haW5UaHJlYWRUZXN0aW5nU2hhcGUsIGluaXRpYWw6IElUZXN0UnVuUHJvZmlsZSB8IHVuZGVmaW5lZCwgdXBkYXRlOiBQYXJ0aWFsPElUZXN0UnVuUHJvZmlsZT4pID0+IHtcblx0aWYgKGluaXRpYWwpIHtcblx0XHRPYmplY3QuYXNzaWduKGluaXRpYWwsIHVwZGF0ZSk7XG5cdH0gZWxzZSB7XG5cdFx0cHJveHkuJHVwZGF0ZVRlc3RSdW5Db25maWcoaW1wbC5jb250cm9sbGVySWQsIGltcGwucHJvZmlsZUlkLCB1cGRhdGUpO1xuXHR9XG59O1xuXG5leHBvcnQgY2xhc3MgVGVzdFJ1blByb2ZpbGVJbXBsIGV4dGVuZHMgVGVzdFJ1blByb2ZpbGVCYXNlIGltcGxlbWVudHMgdnNjb2RlLlRlc3RSdW5Qcm9maWxlIHtcblx0cmVhZG9ubHkgI3Byb3h5OiBNYWluVGhyZWFkVGVzdGluZ1NoYXBlO1xuXHRyZWFkb25seSAjYWN0aXZlUHJvZmlsZXM6IFNldDxudW1iZXI+O1xuXHRyZWFkb25seSAjb25EaWRDaGFuZ2VEZWZhdWx0UHJvZmlsZXM6IEV2ZW50PERlZmF1bHRQcm9maWxlQ2hhbmdlRXZlbnQ+O1xuXHQjaW5pdGlhbFB1Ymxpc2g/OiBJVGVzdFJ1blByb2ZpbGU7XG5cdCNwcm9maWxlcz86IE1hcDxudW1iZXIsIHZzY29kZS5UZXN0UnVuUHJvZmlsZT47XG5cdHByaXZhdGUgX2NvbmZpZ3VyZUhhbmRsZXI/OiAoKCkgPT4gdm9pZCk7XG5cblx0cHVibGljIGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdH1cblxuXHRwdWJsaWMgc2V0IGxhYmVsKGxhYmVsOiBzdHJpbmcpIHtcblx0XHRpZiAobGFiZWwgIT09IHRoaXMuX2xhYmVsKSB7XG5cdFx0XHR0aGlzLl9sYWJlbCA9IGxhYmVsO1xuXHRcdFx0dXBkYXRlUHJvZmlsZSh0aGlzLCB0aGlzLiNwcm94eSwgdGhpcy4jaW5pdGlhbFB1Ymxpc2gsIHsgbGFiZWwgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBzdXBwb3J0c0NvbnRpbnVvdXNSdW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1cHBvcnRzQ29udGludW91c1J1bjtcblx0fVxuXG5cdHB1YmxpYyBzZXQgc3VwcG9ydHNDb250aW51b3VzUnVuKHN1cHBvcnRzOiBib29sZWFuKSB7XG5cdFx0aWYgKHN1cHBvcnRzICE9PSB0aGlzLl9zdXBwb3J0c0NvbnRpbnVvdXNSdW4pIHtcblx0XHRcdHRoaXMuX3N1cHBvcnRzQ29udGludW91c1J1biA9IHN1cHBvcnRzO1xuXHRcdFx0dXBkYXRlUHJvZmlsZSh0aGlzLCB0aGlzLiNwcm94eSwgdGhpcy4jaW5pdGlhbFB1Ymxpc2gsIHsgc3VwcG9ydHNDb250aW51b3VzUnVuOiBzdXBwb3J0cyB9KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzRGVmYXVsdCgpIHtcblx0XHRyZXR1cm4gdGhpcy4jYWN0aXZlUHJvZmlsZXMuaGFzKHRoaXMucHJvZmlsZUlkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgaXNEZWZhdWx0KGlzRGVmYXVsdDogYm9vbGVhbikge1xuXHRcdGlmIChpc0RlZmF1bHQgIT09IHRoaXMuaXNEZWZhdWx0KSB7XG5cdFx0XHQvLyAjYWN0aXZlUHJvZmlsZXMgaXMgc3luY2VkIGZyb20gdGhlIG1haW4gdGhyZWFkLCBzbyB3ZSBjYW4gbWFrZVxuXHRcdFx0Ly8gcHJvdmlzaW9uYWwgY2hhbmdlcyBoZXJlIHRoYXQgd2lsbCBnZXQgY29uZmlybWVkIG1vbWVudGFyaWx5XG5cdFx0XHRpZiAoaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHRoaXMuI2FjdGl2ZVByb2ZpbGVzLmFkZCh0aGlzLnByb2ZpbGVJZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiNhY3RpdmVQcm9maWxlcy5kZWxldGUodGhpcy5wcm9maWxlSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR1cGRhdGVQcm9maWxlKHRoaXMsIHRoaXMuI3Byb3h5LCB0aGlzLiNpbml0aWFsUHVibGlzaCwgeyBpc0RlZmF1bHQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCB0YWcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RhZztcblx0fVxuXG5cdHB1YmxpYyBzZXQgdGFnKHRhZzogdnNjb2RlLlRlc3RUYWcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGFnPy5pZCAhPT0gdGhpcy5fdGFnPy5pZCkge1xuXHRcdFx0dGhpcy5fdGFnID0gdGFnO1xuXHRcdFx0dXBkYXRlUHJvZmlsZSh0aGlzLCB0aGlzLiNwcm94eSwgdGhpcy4jaW5pdGlhbFB1Ymxpc2gsIHtcblx0XHRcdFx0dGFnOiB0YWcgPyBDb252ZXJ0LlRlc3RUYWcubmFtZXNwYWNlKHRoaXMuY29udHJvbGxlcklkLCB0YWcuaWQpIDogbnVsbCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgY29uZmlndXJlSGFuZGxlcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJlSGFuZGxlcjtcblx0fVxuXG5cdHB1YmxpYyBzZXQgY29uZmlndXJlSGFuZGxlcihoYW5kbGVyOiB1bmRlZmluZWQgfCAoKCkgPT4gdm9pZCkpIHtcblx0XHRpZiAoaGFuZGxlciAhPT0gdGhpcy5fY29uZmlndXJlSGFuZGxlcikge1xuXHRcdFx0dGhpcy5fY29uZmlndXJlSGFuZGxlciA9IGhhbmRsZXI7XG5cdFx0XHR1cGRhdGVQcm9maWxlKHRoaXMsIHRoaXMuI3Byb3h5LCB0aGlzLiNpbml0aWFsUHVibGlzaCwgeyBoYXNDb25maWd1cmF0aW9uSGFuZGxlcjogISFoYW5kbGVyIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VEZWZhdWx0KCkge1xuXHRcdHJldHVybiBFdmVudC5jaGFpbih0aGlzLiNvbkRpZENoYW5nZURlZmF1bHRQcm9maWxlcywgJCA9PiAkXG5cdFx0XHQubWFwKGV2ID0+IGV2LmdldCh0aGlzLmNvbnRyb2xsZXJJZCk/LmdldCh0aGlzLnByb2ZpbGVJZCkpXG5cdFx0XHQuZmlsdGVyKGlzRGVmaW5lZClcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJveHk6IE1haW5UaHJlYWRUZXN0aW5nU2hhcGUsXG5cdFx0cHJvZmlsZXM6IE1hcDxudW1iZXIsIHZzY29kZS5UZXN0UnVuUHJvZmlsZT4sXG5cdFx0YWN0aXZlUHJvZmlsZXM6IFNldDxudW1iZXI+LFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlUHJvZmlsZXM6IEV2ZW50PERlZmF1bHRQcm9maWxlQ2hhbmdlRXZlbnQ+LFxuXHRcdGNvbnRyb2xsZXJJZDogc3RyaW5nLFxuXHRcdHByb2ZpbGVJZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgX2xhYmVsOiBzdHJpbmcsXG5cdFx0a2luZDogdnNjb2RlLlRlc3RSdW5Qcm9maWxlS2luZCxcblx0XHRwdWJsaWMgcnVuSGFuZGxlcjogKHJlcXVlc3Q6IHZzY29kZS5UZXN0UnVuUmVxdWVzdCwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4gVGhlbmFibGU8dm9pZD4gfCB2b2lkLFxuXHRcdF9pc0RlZmF1bHQgPSBmYWxzZSxcblx0XHRwdWJsaWMgX3RhZzogdnNjb2RlLlRlc3RUYWcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfc3VwcG9ydHNDb250aW51b3VzUnVuID0gZmFsc2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRyb2xsZXJJZCwgcHJvZmlsZUlkLCBraW5kKTtcblxuXHRcdHRoaXMuI3Byb3h5ID0gcHJveHk7XG5cdFx0dGhpcy4jcHJvZmlsZXMgPSBwcm9maWxlcztcblx0XHR0aGlzLiNhY3RpdmVQcm9maWxlcyA9IGFjdGl2ZVByb2ZpbGVzO1xuXHRcdHRoaXMuI29uRGlkQ2hhbmdlRGVmYXVsdFByb2ZpbGVzID0gb25EaWRDaGFuZ2VBY3RpdmVQcm9maWxlcztcblx0XHRwcm9maWxlcy5zZXQocHJvZmlsZUlkLCB0aGlzKTtcblxuXHRcdGNvbnN0IGdyb3VwQml0c2V0ID0gQ29udmVydC5UZXN0UnVuUHJvZmlsZUtpbmQuZnJvbShraW5kKTtcblx0XHRpZiAoX2lzRGVmYXVsdCkge1xuXHRcdFx0YWN0aXZlUHJvZmlsZXMuYWRkKHByb2ZpbGVJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy4jaW5pdGlhbFB1Ymxpc2ggPSB7XG5cdFx0XHRwcm9maWxlSWQ6IHByb2ZpbGVJZCxcblx0XHRcdGNvbnRyb2xsZXJJZCxcblx0XHRcdHRhZzogX3RhZyA/IENvbnZlcnQuVGVzdFRhZy5uYW1lc3BhY2UodGhpcy5jb250cm9sbGVySWQsIF90YWcuaWQpIDogbnVsbCxcblx0XHRcdGxhYmVsOiBfbGFiZWwsXG5cdFx0XHRncm91cDogZ3JvdXBCaXRzZXQsXG5cdFx0XHRpc0RlZmF1bHQ6IF9pc0RlZmF1bHQsXG5cdFx0XHRoYXNDb25maWd1cmF0aW9uSGFuZGxlcjogZmFsc2UsXG5cdFx0XHRzdXBwb3J0c0NvbnRpbnVvdXNSdW46IF9zdXBwb3J0c0NvbnRpbnVvdXNSdW4sXG5cdFx0fTtcblxuXHRcdC8vIHdlIHNlbmQgdGhlIGluaXRpYWwgcHJvZmlsZSBwdWJsaXNoIG91dCBvbiB0aGUgbmV4dCBtaWNyb3Rhc2sgc28gdGhhdFxuXHRcdC8vIGluaXRpYWxseSBzZXR0aW5nIHRoZSBpc0RlZmF1bHQgdmFsdWUgZG9lc24ndCBvdmVyd3JpdGUgYSB1c2VyLWNvbmZpZ3VyZWQgdmFsdWVcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy4jaW5pdGlhbFB1Ymxpc2gpIHtcblx0XHRcdFx0dGhpcy4jcHJveHkuJHB1Ymxpc2hUZXN0UnVuUHJvZmlsZSh0aGlzLiNpbml0aWFsUHVibGlzaCk7XG5cdFx0XHRcdHRoaXMuI2luaXRpYWxQdWJsaXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy4jcHJvZmlsZXM/LmRlbGV0ZSh0aGlzLnByb2ZpbGVJZCkpIHtcblx0XHRcdHRoaXMuI3Byb2ZpbGVzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy4jcHJveHkuJHJlbW92ZVRlc3RQcm9maWxlKHRoaXMuY29udHJvbGxlcklkLCB0aGlzLnByb2ZpbGVJZCk7XG5cdFx0fVxuXHRcdHRoaXMuI2luaXRpYWxQdWJsaXNoID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbmRUZXN0SW5SZXN1bHRTbmFwc2hvdChleHRJZDogVGVzdElkLCBzbmFwc2hvdDogcmVhZG9ubHkgUmVhZG9ubHk8dnNjb2RlLlRlc3RSZXN1bHRTbmFwc2hvdD5bXSkge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGV4dElkLnBhdGgubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBpdGVtID0gc25hcHNob3QuZmluZChzID0+IHMuaWQgPT09IGV4dElkLnBhdGhbaV0pO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaSA9PT0gZXh0SWQucGF0aC5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm4gaXRlbTtcblx0XHR9XG5cblx0XHRzbmFwc2hvdCA9IGl0ZW0uY2hpbGRyZW47XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFHN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxRQUFRLG9CQUFvQjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1DQUE0VCwwQkFBbUYsaUJBQTRCLGFBQWEsOEJBQThCO0FBQy9kLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTRDLG1CQUEyQztBQUN2RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQixjQUFjLGtCQUFrQix5QkFBeUI7QUFDN0YsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsY0FBYyxvQkFBb0Isc0JBQXNCO0FBYWpFLElBQUksa0JBQWtCO0FBRXRCLE1BQU0sd0JBQXdCLG9CQUFJLFFBQXNDO0FBRWpFLE1BQU0sa0JBQWtCLGdCQUFpQyxpQkFBaUI7QUFLMUUsSUFBTSxpQkFBTixjQUE2QixXQUEwQztBQUFBLEVBZTdFLFlBQ3FCLEtBQ1UsWUFDSyxVQUNXLFNBQzdDO0FBQ0QsVUFBTTtBQUp3QjtBQUNLO0FBQ1c7QUFoQi9DLFNBQWlCLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDM0Us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UUFBSSxjQUFjLEtBQUssV0FBVztBQUdqQyxVQUFJLFdBQVc7QUFDZCxhQUFLLGdCQUFnQixJQUFJLEtBQUssU0FBUztBQUFBLE1BQ3hDLE9BQU87QUFDTixhQUFLLGdCQUFnQixPQUFPLEtBQUssU0FBUztBQUFBLE1BQzNDO0FBRUEsb0JBQWMsTUFBTSxLQUFLLFFBQVEsS0FBSyxpQkFBaUIsRUFBRSxVQUFVLENBQUM7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQVcsTUFBTTtBQUNoQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFXLElBQUksS0FBaUM7QUFDL0MsUUFBSSxLQUFLLE9BQU8sS0FBSyxNQUFNLElBQUk7QUFDOUIsV0FBSyxPQUFPO0FBQ1osb0JBQWMsTUFBTSxLQUFLLFFBQVEsS0FBSyxpQkFBaUI7QUFBQSxRQUN0RCxLQUFLLE1BQU0sUUFBUSxRQUFRLFVBQVUsS0FBSyxjQUFjLElBQUksRUFBRSxJQUFJO0FBQUEsTUFDbkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFXLG1CQUFtQjtBQUM3QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFXLGlCQUFpQixTQUFtQztBQUM5RCxRQUFJLFlBQVksS0FBSyxtQkFBbUI7QUFDdkMsV0FBSyxvQkFBb0I7QUFDekIsb0JBQWMsTUFBTSxLQUFLLFFBQVEsS0FBSyxpQkFBaUIsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQztBQUFBLElBQzlGO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBVyxxQkFBcUI7QUFDL0IsV0FBTyxNQUFNO0FBQUEsTUFBTSxLQUFLO0FBQUEsTUFBNkIsT0FBSyxFQUN4RCxJQUFJLFFBQU0sR0FBRyxJQUFJLEtBQUssWUFBWSxHQUFHLElBQUksS0FBSyxTQUFTLENBQUMsRUFDeEQsT0FBTyxTQUFTO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFrREEsVUFBZ0I7QUFDZixRQUFJLEtBQUssV0FBVyxPQUFPLEtBQUssU0FBUyxHQUFHO0FBQzNDLFdBQUssWUFBWTtBQUNqQixXQUFLLE9BQU8sbUJBQW1CLEtBQUssY0FBYyxLQUFLLFNBQVM7QUFBQSxJQUNqRTtBQUNBLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFDRDtBQUVBLFNBQVMseUJBQXlCLE9BQWUsVUFBMEQ7QUFDMUcsV0FBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUssUUFBUSxLQUFLO0FBQzNDLFVBQU0sT0FBTyxTQUFTLEtBQUssT0FBSyxFQUFFLE9BQU8sTUFBTSxLQUFLLENBQUMsQ0FBQztBQUN0RCxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxNQUFNLE1BQU0sS0FBSyxTQUFTLEdBQUc7QUFDaEMsYUFBTztBQUFBLElBQ1I7QUFFQSxlQUFXLEtBQUs7QUFBQSxFQUNqQjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsibGFiZWwiLCAiciIsICJUZXN0UnVuVHJhY2tlclN0YXRlIl0KfQo=
