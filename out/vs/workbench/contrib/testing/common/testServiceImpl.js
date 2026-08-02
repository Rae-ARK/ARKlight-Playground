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
import { groupBy } from "../../../../base/common/arrays.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { getTestingConfiguration, TestingConfigKeys } from "./configuration.js";
import { MainThreadTestCollection } from "./mainThreadTestCollection.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
import { TestExclusions } from "./testExclusions.js";
import { TestId } from "./testId.js";
import { TestingContextKeys } from "./testingContextKeys.js";
import { canUseProfileWithTest, ITestProfileService } from "./testProfileService.js";
import { ITestResultService } from "./testResultService.js";
import { TestControllerCapability, TestDiffOpType } from "./testTypes.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
let TestService = class extends Disposable {
  constructor(contextKeyService, instantiationService, uriIdentityService, storage, editorService, testProfiles, notificationService, configurationService, testResults, workspaceTrustRequestService) {
    super();
    this.editorService = editorService;
    this.testProfiles = testProfiles;
    this.notificationService = notificationService;
    this.configurationService = configurationService;
    this.testResults = testResults;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.testControllers = observableValue("testControllers", /* @__PURE__ */ new Map());
    this.testExtHosts = /* @__PURE__ */ new Set();
    this.cancelExtensionTestRunEmitter = this._register(new Emitter());
    this.willProcessDiffEmitter = this._register(new Emitter());
    this.didProcessDiffEmitter = this._register(new Emitter());
    this.testRefreshCancellations = /* @__PURE__ */ new Set();
    /**
     * Cancellation for runs requested by the user being managed by the UI.
     * Test runs initiated by extensions are not included here.
     */
    this.uiRunningTests = /* @__PURE__ */ new Map();
    /**
     * @inheritdoc
     */
    this.onWillProcessDiff = this.willProcessDiffEmitter.event;
    /**
     * @inheritdoc
     */
    this.onDidProcessDiff = this.didProcessDiffEmitter.event;
    /**
     * @inheritdoc
     */
    this.onDidCancelTestRun = this.cancelExtensionTestRunEmitter.event;
    this.collection = new MainThreadTestCollection(uriIdentityService, this.expandTest.bind(this));
    this.showInlineOutput = this._register(MutableObservableValue.stored(new StoredValue({
      key: "inlineTestOutputVisible",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.USER
    }, storage), true));
    this.excluded = instantiationService.createInstance(TestExclusions);
    this.isRefreshingTests = TestingContextKeys.isRefreshingTests.bindTo(contextKeyService);
    this.activeEditorHasTests = TestingContextKeys.activeEditorHasTests.bindTo(contextKeyService);
    this._register(bindContextKey(
      TestingContextKeys.providerCount,
      contextKeyService,
      (reader) => this.testControllers.read(reader).size
    ));
    const bindCapability = (key, capability) => this._register(bindContextKey(
      key,
      contextKeyService,
      (reader) => Iterable.some(
        this.testControllers.read(reader).values(),
        (ctrl) => !!(ctrl.capabilities.read(reader) & capability)
      )
    ));
    bindCapability(TestingContextKeys.canRefreshTests, TestControllerCapability.Refresh);
    bindCapability(TestingContextKeys.canGoToRelatedCode, TestControllerCapability.CodeRelatedToTest);
    bindCapability(TestingContextKeys.canGoToRelatedTest, TestControllerCapability.TestRelatedToCode);
    this._register(editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
  }
  /**
   * @inheritdoc
   */
  async expandTest(id, levels) {
    await this.testControllers.get().get(TestId.fromString(id).controllerId)?.expandTest(id, levels);
  }
  /**
   * @inheritdoc
   */
  cancelTestRun(runId, taskId) {
    this.cancelExtensionTestRunEmitter.fire({ runId, taskId });
    if (runId === void 0) {
      for (const runCts of this.uiRunningTests.values()) {
        runCts.cancel();
      }
    } else if (!taskId) {
      this.uiRunningTests.get(runId)?.cancel();
    }
  }
  /**
   * @inheritdoc
   */
  async runTests(req, token = CancellationToken.None) {
    const byProfile = [];
    for (const test of req.tests) {
      const existing = byProfile.find((p) => canUseProfileWithTest(p.profile, test));
      if (existing) {
        existing.tests.push(test);
        continue;
      }
      const bestProfile = this.testProfiles.getDefaultProfileForTest(req.group, test);
      if (!bestProfile) {
        continue;
      }
      byProfile.push({ profile: bestProfile, tests: [test] });
    }
    const resolved = {
      targets: byProfile.map(({ profile, tests }) => ({
        profileId: profile.profileId,
        controllerId: tests[0].controllerId,
        testIds: tests.map((t) => t.item.extId)
      })),
      group: req.group,
      exclude: req.exclude?.map((t) => t.item.extId),
      continuous: req.continuous,
      preserveFocus: req.preserveFocus
    };
    if (resolved.targets.length === 0) {
      for (const byController of groupBy(req.tests, (a, b) => a.controllerId === b.controllerId ? 0 : 1)) {
        const profiles = this.testProfiles.getControllerProfiles(byController[0].controllerId);
        const withControllers = byController.map((test) => ({
          profile: profiles.find((p) => p.group === req.group && canUseProfileWithTest(p, test)),
          test
        }));
        for (const byProfile2 of groupBy(withControllers, (a, b) => a.profile === b.profile ? 0 : 1)) {
          const profile = byProfile2[0].profile;
          if (profile) {
            resolved.targets.push({
              testIds: byProfile2.map((t) => t.test.item.extId),
              profileId: profile.profileId,
              controllerId: profile.controllerId
            });
          }
        }
      }
    }
    return this.runResolvedTests(resolved, token);
  }
  /** @inheritdoc */
  async startContinuousRun(req, token) {
    if (!req.exclude) {
      req.exclude = [...this.excluded.all];
    }
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("testTrust", "Running tests may execute code in your workspace.")
    });
    if (!trust) {
      return;
    }
    const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
    const requests = byController.map(
      (group) => this.getTestController(group[0].controllerId)?.startContinuousRun(
        group.map((controlReq) => ({
          excludeExtIds: req.exclude.filter((t) => !controlReq.testIds.includes(t)),
          profileId: controlReq.profileId,
          controllerId: controlReq.controllerId,
          testIds: controlReq.testIds
        })),
        token
      ).then((result) => {
        const errs = result.map((r) => r.error).filter(isDefined);
        if (errs.length) {
          this.notificationService.error(localize("testError", "An error occurred attempting to run tests: {0}", errs.join(" ")));
        }
      })
    );
    await Promise.all(requests);
  }
  /**
   * @inheritdoc
   */
  async runResolvedTests(req, token = CancellationToken.None) {
    if (!req.exclude) {
      req.exclude = [...this.excluded.all];
    }
    const result = this.testResults.createLiveResult(req);
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("testTrust", "Running tests may execute code in your workspace.")
    });
    if (!trust) {
      result.markComplete();
      return result;
    }
    try {
      const cancelSource = new CancellationTokenSource(token);
      this.uiRunningTests.set(result.id, cancelSource);
      const byController = groupBy(req.targets, (a, b) => a.controllerId.localeCompare(b.controllerId));
      const requests = byController.map(
        (group) => this.getTestController(group[0].controllerId)?.runTests(
          group.map((controlReq) => ({
            runId: result.id,
            excludeExtIds: req.exclude.filter((t) => !controlReq.testIds.includes(t)),
            profileId: controlReq.profileId,
            controllerId: controlReq.controllerId,
            testIds: controlReq.testIds
          })),
          cancelSource.token
        ).then((result2) => {
          const errs = result2.map((r) => r.error).filter(isDefined);
          if (errs.length) {
            this.notificationService.error(localize("testError", "An error occurred attempting to run tests: {0}", errs.join(" ")));
          }
        })
      );
      await this.saveAllBeforeTest(req);
      await Promise.all(requests);
      return result;
    } finally {
      this.uiRunningTests.delete(result.id);
      result.markComplete();
    }
  }
  /**
   * @inheritdoc
   */
  async provideTestFollowups(req, token) {
    const reqs = await Promise.all([...this.testExtHosts].map(async (ctrl) => ({ ctrl, followups: await ctrl.provideTestFollowups(req, token) })));
    const followups = {
      followups: reqs.flatMap(({ ctrl, followups: followups2 }) => followups2.map((f) => ({
        message: f.title,
        execute: () => ctrl.executeTestFollowup(f.id)
      }))),
      dispose: () => {
        for (const { ctrl, followups: followups2 } of reqs) {
          ctrl.disposeTestFollowups(followups2.map((f) => f.id));
        }
      }
    };
    if (token.isCancellationRequested) {
      followups.dispose();
    }
    return followups;
  }
  /**
   * @inheritdoc
   */
  publishDiff(_controllerId, diff) {
    this.willProcessDiffEmitter.fire(diff);
    this.collection.apply(diff);
    this.updateEditorContextKeys();
    this.didProcessDiffEmitter.fire(diff);
  }
  /**
   * @inheritdoc
   */
  getTestController(id) {
    return this.testControllers.get().get(id);
  }
  /**
   * @inheritdoc
   */
  async syncTests() {
    const cts = new CancellationTokenSource();
    try {
      await Promise.all([...this.testControllers.get().values()].map((c) => c.syncTests(cts.token)));
    } finally {
      cts.dispose(true);
    }
  }
  /**
   * @inheritdoc
   */
  async refreshTests(controllerId) {
    const cts = new CancellationTokenSource();
    this.testRefreshCancellations.add(cts);
    this.isRefreshingTests.set(true);
    try {
      if (controllerId) {
        await this.getTestController(controllerId)?.refreshTests(cts.token);
      } else {
        await Promise.all([...this.testControllers.get().values()].map((c) => c.refreshTests(cts.token)));
      }
    } finally {
      this.testRefreshCancellations.delete(cts);
      this.isRefreshingTests.set(this.testRefreshCancellations.size > 0);
      cts.dispose(true);
    }
  }
  /**
   * @inheritdoc
   */
  cancelRefreshTests() {
    for (const cts of this.testRefreshCancellations) {
      cts.cancel();
    }
    this.testRefreshCancellations.clear();
    this.isRefreshingTests.set(false);
  }
  /**
   * @inheritdoc
   */
  registerExtHost(controller) {
    this.testExtHosts.add(controller);
    return toDisposable(() => this.testExtHosts.delete(controller));
  }
  /**
   * @inheritdoc
   */
  async getTestsRelatedToCode(uri, position, token = CancellationToken.None) {
    const testIds = await Promise.all([...this.testExtHosts.values()].map((v) => v.getTestsRelatedToCode(uri, position, token)));
    return testIds.flatMap((ids) => ids.map((id) => this.collection.getNodeById(id))).filter(isDefined);
  }
  /**
   * @inheritdoc
   */
  registerTestController(id, controller) {
    this.testControllers.set(new Map(this.testControllers.get()).set(id, controller), void 0);
    return toDisposable(() => {
      const diff = [];
      for (const root of this.collection.rootItems) {
        if (root.controllerId === id) {
          diff.push({ op: TestDiffOpType.Remove, itemId: root.item.extId });
        }
      }
      this.publishDiff(id, diff);
      const next = new Map(this.testControllers.get());
      next.delete(id);
      this.testControllers.set(next, void 0);
    });
  }
  /**
   * @inheritdoc
   */
  async getCodeRelatedToTest(test, token = CancellationToken.None) {
    return await this.testControllers.get().get(test.controllerId)?.getRelatedCode(test.item.extId, token) || [];
  }
  updateEditorContextKeys() {
    const uri = this.editorService.activeEditor?.resource;
    if (uri) {
      this.activeEditorHasTests.set(!Iterable.isEmpty(this.collection.getNodeByUrl(uri)));
    } else {
      this.activeEditorHasTests.set(false);
    }
  }
  async saveAllBeforeTest(req, configurationService = this.configurationService, editorService = this.editorService) {
    if (req.preserveFocus === true) {
      return;
    }
    const saveBeforeTest = getTestingConfiguration(this.configurationService, TestingConfigKeys.SaveBeforeTest);
    if (saveBeforeTest) {
      await editorService.saveAll();
    }
    return;
  }
};
TestService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ITestProfileService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITestResultService),
  __decorateParam(9, IWorkspaceTrustRequestService)
], TestService);
export {
  TestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBiaW5kQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbiwgVGVzdGluZ0NvbmZpZ0tleXMgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFRlc3RDb2xsZWN0aW9uIH0gZnJvbSAnLi9tYWluVGhyZWFkVGVzdENvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgTXV0YWJsZU9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4vb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IFN0b3JlZFZhbHVlIH0gZnJvbSAnLi9zdG9yZWRWYWx1ZS5qcyc7XG5pbXBvcnQgeyBUZXN0RXhjbHVzaW9ucyB9IGZyb20gJy4vdGVzdEV4Y2x1c2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0NvbnRleHRLZXlzIH0gZnJvbSAnLi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY2FuVXNlUHJvZmlsZVdpdGhUZXN0LCBJVGVzdFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0UHJvZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHQgfSBmcm9tICcuL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBbWJpZ3VvdXNSdW5UZXN0c1JlcXVlc3QsIElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXIsIElNYWluVGhyZWFkVGVzdEhvc3RQcm94eSwgSVRlc3RGb2xsb3d1cHMsIElUZXN0U2VydmljZSB9IGZyb20gJy4vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxUZXN0SXRlbSwgSVRlc3RSdW5Qcm9maWxlLCBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LCBUZXN0Q29udHJvbGxlckNhcGFiaWxpdHksIFRlc3REaWZmT3BUeXBlLCBUZXN0TWVzc2FnZUZvbGxvd3VwUmVxdWVzdCwgVGVzdHNEaWZmIH0gZnJvbSAnLi90ZXN0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVzdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlc3RTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGVzdENvbnRyb2xsZXJzID0gb2JzZXJ2YWJsZVZhbHVlPFJlYWRvbmx5TWFwPHN0cmluZywgSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlcj4+KCd0ZXN0Q29udHJvbGxlcnMnLCBuZXcgTWFwPHN0cmluZywgSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlcj4oKSk7XG5cdHByaXZhdGUgdGVzdEV4dEhvc3RzID0gbmV3IFNldDxJTWFpblRocmVhZFRlc3RIb3N0UHJveHk+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW5jZWxFeHRlbnNpb25UZXN0UnVuRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcnVuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgdGFza0lkOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2lsbFByb2Nlc3NEaWZmRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRlc3RzRGlmZj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlkUHJvY2Vzc0RpZmZFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVzdHNEaWZmPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXN0UmVmcmVzaENhbmNlbGxhdGlvbnMgPSBuZXcgU2V0PENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzUmVmcmVzaGluZ1Rlc3RzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVFZGl0b3JIYXNUZXN0czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIENhbmNlbGxhdGlvbiBmb3IgcnVucyByZXF1ZXN0ZWQgYnkgdGhlIHVzZXIgYmVpbmcgbWFuYWdlZCBieSB0aGUgVUkuXG5cdCAqIFRlc3QgcnVucyBpbml0aWF0ZWQgYnkgZXh0ZW5zaW9ucyBhcmUgbm90IGluY2x1ZGVkIGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHVpUnVubmluZ1Rlc3RzID0gbmV3IE1hcDxzdHJpbmcgLyogcnVuIElEICovLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKTtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxQcm9jZXNzRGlmZiA9IHRoaXMud2lsbFByb2Nlc3NEaWZmRW1pdHRlci5ldmVudDtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFByb2Nlc3NEaWZmID0gdGhpcy5kaWRQcm9jZXNzRGlmZkVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDYW5jZWxUZXN0UnVuID0gdGhpcy5jYW5jZWxFeHRlbnNpb25UZXN0UnVuRW1pdHRlci5ldmVudDtcblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBjb2xsZWN0aW9uOiBNYWluVGhyZWFkVGVzdENvbGxlY3Rpb247XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZXhjbHVkZWQ6IFRlc3RFeGNsdXNpb25zO1xuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IHNob3dJbmxpbmVPdXRwdXQ6IE11dGFibGVPYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UHJvZmlsZXM6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RSZXN1bHRzOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5jb2xsZWN0aW9uID0gbmV3IE1haW5UaHJlYWRUZXN0Q29sbGVjdGlvbih1cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMuZXhwYW5kVGVzdC5iaW5kKHRoaXMpKTtcblx0XHR0aGlzLnNob3dJbmxpbmVPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlLnN0b3JlZChuZXcgU3RvcmVkVmFsdWU8Ym9vbGVhbj4oe1xuXHRcdFx0a2V5OiAnaW5saW5lVGVzdE91dHB1dFZpc2libGUnLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUlxuXHRcdH0sIHN0b3JhZ2UpLCB0cnVlKSk7XG5cblx0XHR0aGlzLmV4Y2x1ZGVkID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEV4Y2x1c2lvbnMpO1xuXHRcdHRoaXMuaXNSZWZyZXNoaW5nVGVzdHMgPSBUZXN0aW5nQ29udGV4dEtleXMuaXNSZWZyZXNoaW5nVGVzdHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzID0gVGVzdGluZ0NvbnRleHRLZXlzLmFjdGl2ZUVkaXRvckhhc1Rlc3RzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShUZXN0aW5nQ29udGV4dEtleXMucHJvdmlkZXJDb3VudCwgY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy50ZXN0Q29udHJvbGxlcnMucmVhZChyZWFkZXIpLnNpemUpKTtcblxuXHRcdGNvbnN0IGJpbmRDYXBhYmlsaXR5ID0gKGtleTogUmF3Q29udGV4dEtleTxib29sZWFuPiwgY2FwYWJpbGl0eTogVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5KSA9PlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoa2V5LCBjb250ZXh0S2V5U2VydmljZSwgcmVhZGVyID0+XG5cdFx0XHRcdEl0ZXJhYmxlLnNvbWUoXG5cdFx0XHRcdFx0dGhpcy50ZXN0Q29udHJvbGxlcnMucmVhZChyZWFkZXIpLnZhbHVlcygpLFxuXHRcdFx0XHRcdGN0cmwgPT4gISEoY3RybC5jYXBhYmlsaXRpZXMucmVhZChyZWFkZXIpICYgY2FwYWJpbGl0eSlcblx0XHRcdFx0KSxcblx0XHRcdCkpO1xuXG5cdFx0YmluZENhcGFiaWxpdHkoVGVzdGluZ0NvbnRleHRLZXlzLmNhblJlZnJlc2hUZXN0cywgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LlJlZnJlc2gpO1xuXHRcdGJpbmRDYXBhYmlsaXR5KFRlc3RpbmdDb250ZXh0S2V5cy5jYW5Hb1RvUmVsYXRlZENvZGUsIFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eS5Db2RlUmVsYXRlZFRvVGVzdCk7XG5cdFx0YmluZENhcGFiaWxpdHkoVGVzdGluZ0NvbnRleHRLZXlzLmNhbkdvVG9SZWxhdGVkVGVzdCwgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LlRlc3RSZWxhdGVkVG9Db2RlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVFZGl0b3JDb250ZXh0S2V5cygpKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyBleHBhbmRUZXN0KGlkOiBzdHJpbmcsIGxldmVsczogbnVtYmVyKSB7XG5cdFx0YXdhaXQgdGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkuZ2V0KFRlc3RJZC5mcm9tU3RyaW5nKGlkKS5jb250cm9sbGVySWQpPy5leHBhbmRUZXN0KGlkLCBsZXZlbHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsVGVzdFJ1bihydW5JZD86IHN0cmluZywgdGFza0lkPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5jYW5jZWxFeHRlbnNpb25UZXN0UnVuRW1pdHRlci5maXJlKHsgcnVuSWQsIHRhc2tJZCB9KTtcblxuXHRcdGlmIChydW5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1bkN0cyBvZiB0aGlzLnVpUnVubmluZ1Rlc3RzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHJ1bkN0cy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0YXNrSWQpIHtcblx0XHRcdHRoaXMudWlSdW5uaW5nVGVzdHMuZ2V0KHJ1bklkKT8uY2FuY2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcnVuVGVzdHMocmVxOiBBbWJpZ3VvdXNSdW5UZXN0c1JlcXVlc3QsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVRlc3RSZXN1bHQ+IHtcblx0XHQvLyBXZSB0cnkgdG8gZW5zdXJlIHRoYXQgYWxsIHRlc3RzIGluIHRoZSByZXF1ZXN0IHdpbGwgYmUgcnVuLCBwcmVmZXJyaW5nXG5cdFx0Ly8gdG8gdXNlIGRlZmF1bHQgcHJvZmlsZXMgZm9yIGVhY2ggY29udHJvbGxlciB3aGVuIHBvc3NpYmxlLlxuXHRcdGNvbnN0IGJ5UHJvZmlsZTogeyBwcm9maWxlOiBJVGVzdFJ1blByb2ZpbGU7IHRlc3RzOiBJbnRlcm5hbFRlc3RJdGVtW10gfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB0ZXN0IG9mIHJlcS50ZXN0cykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBieVByb2ZpbGUuZmluZChwID0+IGNhblVzZVByb2ZpbGVXaXRoVGVzdChwLnByb2ZpbGUsIHRlc3QpKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRleGlzdGluZy50ZXN0cy5wdXNoKHRlc3QpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYmVzdFByb2ZpbGUgPSB0aGlzLnRlc3RQcm9maWxlcy5nZXREZWZhdWx0UHJvZmlsZUZvclRlc3QocmVxLmdyb3VwLCB0ZXN0KTtcblx0XHRcdGlmICghYmVzdFByb2ZpbGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGJ5UHJvZmlsZS5wdXNoKHsgcHJvZmlsZTogYmVzdFByb2ZpbGUsIHRlc3RzOiBbdGVzdF0gfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWQ6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QgPSB7XG5cdFx0XHR0YXJnZXRzOiBieVByb2ZpbGUubWFwKCh7IHByb2ZpbGUsIHRlc3RzIH0pID0+ICh7XG5cdFx0XHRcdHByb2ZpbGVJZDogcHJvZmlsZS5wcm9maWxlSWQsXG5cdFx0XHRcdGNvbnRyb2xsZXJJZDogdGVzdHNbMF0uY29udHJvbGxlcklkLFxuXHRcdFx0XHR0ZXN0SWRzOiB0ZXN0cy5tYXAodCA9PiB0Lml0ZW0uZXh0SWQpLFxuXHRcdFx0fSkpLFxuXHRcdFx0Z3JvdXA6IHJlcS5ncm91cCxcblx0XHRcdGV4Y2x1ZGU6IHJlcS5leGNsdWRlPy5tYXAodCA9PiB0Lml0ZW0uZXh0SWQpLFxuXHRcdFx0Y29udGludW91czogcmVxLmNvbnRpbnVvdXMsXG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiByZXEucHJlc2VydmVGb2N1cyxcblx0XHR9O1xuXG5cdFx0Ly8gSWYgbm8gdGVzdHMgYXJlIGNvdmVyZWQgYnkgdGhlIGRlZmF1bHRzLCBqdXN0IHVzZSB3aGF0ZXZlciB0aGUgZGVmYXVsdHNcblx0XHQvLyBmb3IgdGhlaXIgY29udHJvbGxlciBhcmUuIFRoaXMgY2FuIGhhcHBlbiBpZiB0aGUgdXNlciBjaG9zZSBzcGVjaWZpY1xuXHRcdC8vIHByb2ZpbGVzIGZvciB0aGUgcnVuIGJ1dHRvbiwgYnV0IHRoZW4gYXNrZWQgdG8gcnVuIGEgc2luZ2xlIHRlc3QgZnJvbSB0aGVcblx0XHQvLyBleHBsb3JlciBvciBkZWNvcmF0aW9uLiBXZSBzaG91bGRuJ3Qgbm8tb3AuXG5cdFx0aWYgKHJlc29sdmVkLnRhcmdldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGJ5Q29udHJvbGxlciBvZiBncm91cEJ5KHJlcS50ZXN0cywgKGEsIGIpID0+IGEuY29udHJvbGxlcklkID09PSBiLmNvbnRyb2xsZXJJZCA/IDAgOiAxKSkge1xuXHRcdFx0XHRjb25zdCBwcm9maWxlcyA9IHRoaXMudGVzdFByb2ZpbGVzLmdldENvbnRyb2xsZXJQcm9maWxlcyhieUNvbnRyb2xsZXJbMF0uY29udHJvbGxlcklkKTtcblx0XHRcdFx0Y29uc3Qgd2l0aENvbnRyb2xsZXJzID0gYnlDb250cm9sbGVyLm1hcCh0ZXN0ID0+ICh7XG5cdFx0XHRcdFx0cHJvZmlsZTogcHJvZmlsZXMuZmluZChwID0+IHAuZ3JvdXAgPT09IHJlcS5ncm91cCAmJiBjYW5Vc2VQcm9maWxlV2l0aFRlc3QocCwgdGVzdCkpLFxuXHRcdFx0XHRcdHRlc3QsXG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGJ5UHJvZmlsZSBvZiBncm91cEJ5KHdpdGhDb250cm9sbGVycywgKGEsIGIpID0+IGEucHJvZmlsZSA9PT0gYi5wcm9maWxlID8gMCA6IDEpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvZmlsZSA9IGJ5UHJvZmlsZVswXS5wcm9maWxlO1xuXHRcdFx0XHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZC50YXJnZXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0ZXN0SWRzOiBieVByb2ZpbGUubWFwKHQgPT4gdC50ZXN0Lml0ZW0uZXh0SWQpLFxuXHRcdFx0XHRcdFx0XHRwcm9maWxlSWQ6IHByb2ZpbGUucHJvZmlsZUlkLFxuXHRcdFx0XHRcdFx0XHRjb250cm9sbGVySWQ6IHByb2ZpbGUuY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucnVuUmVzb2x2ZWRUZXN0cyhyZXNvbHZlZCwgdG9rZW4pO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBhc3luYyBzdGFydENvbnRpbnVvdXNSdW4ocmVxOiBSZXNvbHZlZFRlc3RSdW5SZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRpZiAoIXJlcS5leGNsdWRlKSB7XG5cdFx0XHRyZXEuZXhjbHVkZSA9IFsuLi50aGlzLmV4Y2x1ZGVkLmFsbF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJ1c3QgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0ZXN0VHJ1c3QnLCBcIlJ1bm5pbmcgdGVzdHMgbWF5IGV4ZWN1dGUgY29kZSBpbiB5b3VyIHdvcmtzcGFjZS5cIiksXG5cdFx0fSk7XG5cblx0XHRpZiAoIXRydXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnlDb250cm9sbGVyID0gZ3JvdXBCeShyZXEudGFyZ2V0cywgKGEsIGIpID0+IGEuY29udHJvbGxlcklkLmxvY2FsZUNvbXBhcmUoYi5jb250cm9sbGVySWQpKTtcblx0XHRjb25zdCByZXF1ZXN0cyA9IGJ5Q29udHJvbGxlci5tYXAoXG5cdFx0XHRncm91cCA9PiB0aGlzLmdldFRlc3RDb250cm9sbGVyKGdyb3VwWzBdLmNvbnRyb2xsZXJJZCk/LnN0YXJ0Q29udGludW91c1J1bihcblx0XHRcdFx0Z3JvdXAubWFwKGNvbnRyb2xSZXEgPT4gKHtcblx0XHRcdFx0XHRleGNsdWRlRXh0SWRzOiByZXEuZXhjbHVkZSEuZmlsdGVyKHQgPT4gIWNvbnRyb2xSZXEudGVzdElkcy5pbmNsdWRlcyh0KSksXG5cdFx0XHRcdFx0cHJvZmlsZUlkOiBjb250cm9sUmVxLnByb2ZpbGVJZCxcblx0XHRcdFx0XHRjb250cm9sbGVySWQ6IGNvbnRyb2xSZXEuY29udHJvbGxlcklkLFxuXHRcdFx0XHRcdHRlc3RJZHM6IGNvbnRyb2xSZXEudGVzdElkcyxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHR0b2tlbixcblx0XHRcdCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRjb25zdCBlcnJzID0gcmVzdWx0Lm1hcChyID0+IHIuZXJyb3IpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdFx0XHRpZiAoZXJycy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Rlc3RFcnJvcicsICdBbiBlcnJvciBvY2N1cnJlZCBhdHRlbXB0aW5nIHRvIHJ1biB0ZXN0czogezB9JywgZXJycy5qb2luKCcgJykpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVxdWVzdHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcnVuUmVzb2x2ZWRUZXN0cyhyZXE6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkge1xuXHRcdGlmICghcmVxLmV4Y2x1ZGUpIHtcblx0XHRcdHJlcS5leGNsdWRlID0gWy4uLnRoaXMuZXhjbHVkZWQuYWxsXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnRlc3RSZXN1bHRzLmNyZWF0ZUxpdmVSZXN1bHQocmVxKTtcblx0XHRjb25zdCB0cnVzdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Rlc3RUcnVzdCcsIFwiUnVubmluZyB0ZXN0cyBtYXkgZXhlY3V0ZSBjb2RlIGluIHlvdXIgd29ya3NwYWNlLlwiKSxcblx0XHR9KTtcblxuXHRcdGlmICghdHJ1c3QpIHtcblx0XHRcdHJlc3VsdC5tYXJrQ29tcGxldGUoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhbmNlbFNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0XHR0aGlzLnVpUnVubmluZ1Rlc3RzLnNldChyZXN1bHQuaWQsIGNhbmNlbFNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IGJ5Q29udHJvbGxlciA9IGdyb3VwQnkocmVxLnRhcmdldHMsIChhLCBiKSA9PiBhLmNvbnRyb2xsZXJJZC5sb2NhbGVDb21wYXJlKGIuY29udHJvbGxlcklkKSk7XG5cdFx0XHRjb25zdCByZXF1ZXN0cyA9IGJ5Q29udHJvbGxlci5tYXAoXG5cdFx0XHRcdGdyb3VwID0+IHRoaXMuZ2V0VGVzdENvbnRyb2xsZXIoZ3JvdXBbMF0uY29udHJvbGxlcklkKT8ucnVuVGVzdHMoXG5cdFx0XHRcdFx0Z3JvdXAubWFwKGNvbnRyb2xSZXEgPT4gKHtcblx0XHRcdFx0XHRcdHJ1bklkOiByZXN1bHQuaWQsXG5cdFx0XHRcdFx0XHRleGNsdWRlRXh0SWRzOiByZXEuZXhjbHVkZSEuZmlsdGVyKHQgPT4gIWNvbnRyb2xSZXEudGVzdElkcy5pbmNsdWRlcyh0KSksXG5cdFx0XHRcdFx0XHRwcm9maWxlSWQ6IGNvbnRyb2xSZXEucHJvZmlsZUlkLFxuXHRcdFx0XHRcdFx0Y29udHJvbGxlcklkOiBjb250cm9sUmVxLmNvbnRyb2xsZXJJZCxcblx0XHRcdFx0XHRcdHRlc3RJZHM6IGNvbnRyb2xSZXEudGVzdElkcyxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0Y2FuY2VsU291cmNlLnRva2VuLFxuXHRcdFx0XHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRjb25zdCBlcnJzID0gcmVzdWx0Lm1hcChyID0+IHIuZXJyb3IpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChlcnJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd0ZXN0RXJyb3InLCAnQW4gZXJyb3Igb2NjdXJyZWQgYXR0ZW1wdGluZyB0byBydW4gdGVzdHM6IHswfScsIGVycnMuam9pbignICcpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHRcdGF3YWl0IHRoaXMuc2F2ZUFsbEJlZm9yZVRlc3QocmVxKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHJlcXVlc3RzKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMudWlSdW5uaW5nVGVzdHMuZGVsZXRlKHJlc3VsdC5pZCk7XG5cdFx0XHRyZXN1bHQubWFya0NvbXBsZXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZVRlc3RGb2xsb3d1cHMocmVxOiBUZXN0TWVzc2FnZUZvbGxvd3VwUmVxdWVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVGVzdEZvbGxvd3Vwcz4ge1xuXHRcdGNvbnN0IHJlcXMgPSBhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy50ZXN0RXh0SG9zdHNdLm1hcChhc3luYyBjdHJsID0+XG5cdFx0XHQoeyBjdHJsLCBmb2xsb3d1cHM6IGF3YWl0IGN0cmwucHJvdmlkZVRlc3RGb2xsb3d1cHMocmVxLCB0b2tlbikgfSkpKTtcblxuXHRcdGNvbnN0IGZvbGxvd3VwczogSVRlc3RGb2xsb3d1cHMgPSB7XG5cdFx0XHRmb2xsb3d1cHM6IHJlcXMuZmxhdE1hcCgoeyBjdHJsLCBmb2xsb3d1cHMgfSkgPT4gZm9sbG93dXBzLm1hcChmID0+ICh7XG5cdFx0XHRcdG1lc3NhZ2U6IGYudGl0bGUsXG5cdFx0XHRcdGV4ZWN1dGU6ICgpID0+IGN0cmwuZXhlY3V0ZVRlc3RGb2xsb3d1cChmLmlkKVxuXHRcdFx0fSkpKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGN0cmwsIGZvbGxvd3VwcyB9IG9mIHJlcXMpIHtcblx0XHRcdFx0XHRjdHJsLmRpc3Bvc2VUZXN0Rm9sbG93dXBzKGZvbGxvd3Vwcy5tYXAoZiA9PiBmLmlkKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRmb2xsb3d1cHMuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmb2xsb3d1cHM7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBwdWJsaXNoRGlmZihfY29udHJvbGxlcklkOiBzdHJpbmcsIGRpZmY6IFRlc3RzRGlmZikge1xuXHRcdHRoaXMud2lsbFByb2Nlc3NEaWZmRW1pdHRlci5maXJlKGRpZmYpO1xuXHRcdHRoaXMuY29sbGVjdGlvbi5hcHBseShkaWZmKTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckNvbnRleHRLZXlzKCk7XG5cdFx0dGhpcy5kaWRQcm9jZXNzRGlmZkVtaXR0ZXIuZmlyZShkaWZmKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGdldFRlc3RDb250cm9sbGVyKGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkuZ2V0KGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIHN5bmNUZXN0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRoaXMudGVzdENvbnRyb2xsZXJzLmdldCgpLnZhbHVlcygpXS5tYXAoYyA9PiBjLnN5bmNUZXN0cyhjdHMudG9rZW4pKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIHJlZnJlc2hUZXN0cyhjb250cm9sbGVySWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucy5hZGQoY3RzKTtcblx0XHR0aGlzLmlzUmVmcmVzaGluZ1Rlc3RzLnNldCh0cnVlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoY29udHJvbGxlcklkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZ2V0VGVzdENvbnRyb2xsZXIoY29udHJvbGxlcklkKT8ucmVmcmVzaFRlc3RzKGN0cy50b2tlbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkudmFsdWVzKCldLm1hcChjID0+IGMucmVmcmVzaFRlc3RzKGN0cy50b2tlbikpKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy50ZXN0UmVmcmVzaENhbmNlbGxhdGlvbnMuZGVsZXRlKGN0cyk7XG5cdFx0XHR0aGlzLmlzUmVmcmVzaGluZ1Rlc3RzLnNldCh0aGlzLnRlc3RSZWZyZXNoQ2FuY2VsbGF0aW9ucy5zaXplID4gMCk7XG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBjYW5jZWxSZWZyZXNoVGVzdHMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjdHMgb2YgdGhpcy50ZXN0UmVmcmVzaENhbmNlbGxhdGlvbnMpIHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHR9XG5cdFx0dGhpcy50ZXN0UmVmcmVzaENhbmNlbGxhdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLmlzUmVmcmVzaGluZ1Rlc3RzLnNldChmYWxzZSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWdpc3RlckV4dEhvc3QoY29udHJvbGxlcjogSU1haW5UaHJlYWRUZXN0SG9zdFByb3h5KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMudGVzdEV4dEhvc3RzLmFkZChjb250cm9sbGVyKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudGVzdEV4dEhvc3RzLmRlbGV0ZShjb250cm9sbGVyKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRUZXN0c1JlbGF0ZWRUb0NvZGUodXJpOiBVUkksIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SW50ZXJuYWxUZXN0SXRlbVtdPiB7XG5cdFx0Y29uc3QgdGVzdElkcyA9IGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLnRlc3RFeHRIb3N0cy52YWx1ZXMoKV0ubWFwKHYgPT4gdi5nZXRUZXN0c1JlbGF0ZWRUb0NvZGUodXJpLCBwb3NpdGlvbiwgdG9rZW4pKSk7XG5cdFx0Ly8gZXh0IGhvc3Qgd2lsbCBmbHVzaCBkaWZmcyBiZWZvcmUgcmV0dXJuaW5nLCBzbyB3ZSBzaG91bGQgaGF2ZSBldmVyeXRoaW5nIGhlcmU6XG5cdFx0cmV0dXJuIHRlc3RJZHMuZmxhdE1hcChpZHMgPT4gaWRzLm1hcChpZCA9PiB0aGlzLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQoaWQpKSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyByZWdpc3RlclRlc3RDb250cm9sbGVyKGlkOiBzdHJpbmcsIGNvbnRyb2xsZXI6IElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy50ZXN0Q29udHJvbGxlcnMuc2V0KG5ldyBNYXAodGhpcy50ZXN0Q29udHJvbGxlcnMuZ2V0KCkpLnNldChpZCwgY29udHJvbGxlciksIHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IGRpZmY6IFRlc3RzRGlmZiA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByb290IG9mIHRoaXMuY29sbGVjdGlvbi5yb290SXRlbXMpIHtcblx0XHRcdFx0aWYgKHJvb3QuY29udHJvbGxlcklkID09PSBpZCkge1xuXHRcdFx0XHRcdGRpZmYucHVzaCh7IG9wOiBUZXN0RGlmZk9wVHlwZS5SZW1vdmUsIGl0ZW1JZDogcm9vdC5pdGVtLmV4dElkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucHVibGlzaERpZmYoaWQsIGRpZmYpO1xuXG5cdFx0XHRjb25zdCBuZXh0ID0gbmV3IE1hcCh0aGlzLnRlc3RDb250cm9sbGVycy5nZXQoKSk7XG5cdFx0XHRuZXh0LmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLnRlc3RDb250cm9sbGVycy5zZXQobmV4dCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIGdldENvZGVSZWxhdGVkVG9UZXN0KHRlc3Q6IEludGVybmFsVGVzdEl0ZW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPExvY2F0aW9uW10+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMudGVzdENvbnRyb2xsZXJzLmdldCgpLmdldCh0ZXN0LmNvbnRyb2xsZXJJZCk/LmdldFJlbGF0ZWRDb2RlKHRlc3QuaXRlbS5leHRJZCwgdG9rZW4pKSB8fCBbXTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRWRpdG9yQ29udGV4dEtleXMoKSB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2U7XG5cdFx0aWYgKHVyaSkge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JIYXNUZXN0cy5zZXQoIUl0ZXJhYmxlLmlzRW1wdHkodGhpcy5jb2xsZWN0aW9uLmdldE5vZGVCeVVybCh1cmkpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9ySGFzVGVzdHMuc2V0KGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVBbGxCZWZvcmVUZXN0KHJlcTogUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlID0gdGhpcy5lZGl0b3JTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHJlcS5wcmVzZXJ2ZUZvY3VzID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNhdmVCZWZvcmVUZXN0ID0gZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24odGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgVGVzdGluZ0NvbmZpZ0tleXMuU2F2ZUJlZm9yZVRlc3QpO1xuXHRcdGlmIChzYXZlQmVmb3JlVGVzdCkge1xuXHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlQWxsKCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxufVxuXG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFJMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQXlDO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMseUJBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUIsMkJBQTJCO0FBRTNELFNBQVMsMEJBQTBCO0FBRW5DLFNBQW9FLDBCQUEwQixzQkFBNkQ7QUFDM0osU0FBUyxzQkFBc0I7QUFFeEIsSUFBTSxjQUFOLGNBQTBCLFdBQW1DO0FBQUEsRUFnRG5FLFlBQ3FCLG1CQUNHLHNCQUNGLG9CQUNKLFNBQ2dCLGVBQ0ssY0FDQyxxQkFDQyxzQkFDSCxhQUNXLDhCQUMvQztBQUNELFVBQU07QUFQMkI7QUFDSztBQUNDO0FBQ0M7QUFDSDtBQUNXO0FBeERqRCxTQUFRLGtCQUFrQixnQkFBZ0UsbUJBQW1CLG9CQUFJLElBQXVDLENBQUM7QUFDekosU0FBUSxlQUFlLG9CQUFJLElBQThCO0FBRXpELFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUs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
