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
import { Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { observableValue, transaction } from "../../../base/common/observable.js";
import { WellDefinedPrefixTree } from "../../../base/common/prefixTree.js";
import { URI } from "../../../base/common/uri.js";
import { Range } from "../../../editor/common/core/range.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { TestCoverage } from "../../contrib/testing/common/testCoverage.js";
import { TestId } from "../../contrib/testing/common/testId.js";
import { ITestProfileService } from "../../contrib/testing/common/testProfileService.js";
import { LiveTestResult } from "../../contrib/testing/common/testResult.js";
import { ITestResultService } from "../../contrib/testing/common/testResultService.js";
import { ITestService } from "../../contrib/testing/common/testService.js";
import { CoverageDetails, IFileCoverage, ITestItem, ITestMessage, TestRunProfileBitset, TestsDiffOp } from "../../contrib/testing/common/testTypes.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadTesting = class extends Disposable {
  constructor(extHostContext, uriIdentityService, testService, testProfiles, resultService) {
    super();
    this.uriIdentityService = uriIdentityService;
    this.testService = testService;
    this.testProfiles = testProfiles;
    this.resultService = resultService;
    this.diffListener = this._register(new MutableDisposable());
    this.testProviderRegistrations = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostTesting);
    this._register(this.testService.registerExtHost({
      provideTestFollowups: (req, token) => this.proxy.$provideTestFollowups(req, token),
      executeTestFollowup: (id) => this.proxy.$executeTestFollowup(id),
      disposeTestFollowups: (ids) => this.proxy.$disposeTestFollowups(ids),
      getTestsRelatedToCode: (uri, position, token) => this.proxy.$getTestsRelatedToCode(uri, position, token)
    }));
    this._register(this.testService.onDidCancelTestRun(({ runId, taskId }) => {
      this.proxy.$cancelExtensionTestRun(runId, taskId);
    }));
    this._register(Event.debounce(testProfiles.onDidChange, (_last, e) => e)(() => {
      const obj = {};
      for (const group of [TestRunProfileBitset.Run, TestRunProfileBitset.Debug, TestRunProfileBitset.Coverage]) {
        for (const profile of this.testProfiles.getGroupDefaultProfiles(group)) {
          obj[profile.controllerId] ??= [];
          obj[profile.controllerId].push(profile.profileId);
        }
      }
      this.proxy.$setDefaultRunProfiles(obj);
    }));
    this._register(resultService.onResultsChanged((evt) => {
      if ("completed" in evt) {
        const serialized = evt.completed.toJSONWithMessages();
        if (serialized) {
          this.proxy.$publishTestResults([serialized]);
        }
      } else if ("removed" in evt) {
        evt.removed.forEach((r) => {
          if (r instanceof LiveTestResult) {
            this.proxy.$disposeRun(r.id);
          }
        });
      }
    }));
  }
  /**
   * @inheritdoc
   */
  $markTestRetired(testIds) {
    let tree;
    if (testIds) {
      tree = new WellDefinedPrefixTree();
      for (const id of testIds) {
        tree.insert(TestId.fromString(id).path, void 0);
      }
    }
    for (const result of this.resultService.results) {
      if (result instanceof LiveTestResult) {
        result.markRetired(tree);
      }
    }
  }
  /**
   * @inheritdoc
   */
  $publishTestRunProfile(profile) {
    const controller = this.testProviderRegistrations.get(profile.controllerId);
    if (controller) {
      this.testProfiles.addProfile(controller.instance, profile);
    }
  }
  /**
   * @inheritdoc
   */
  $updateTestRunConfig(controllerId, profileId, update) {
    this.testProfiles.updateProfile(controllerId, profileId, update);
  }
  /**
   * @inheritdoc
   */
  $removeTestProfile(controllerId, profileId) {
    this.testProfiles.removeProfile(controllerId, profileId);
  }
  /**
   * @inheritdoc
   */
  $addTestsToRun(controllerId, runId, tests) {
    this.withLiveRun(runId, (r) => r.addTestChainToRun(
      controllerId,
      tests.map((t) => ITestItem.deserialize(this.uriIdentityService, t))
    ));
  }
  /**
   * @inheritdoc
   */
  $appendCoverage(runId, taskId, coverage) {
    this.withLiveRun(runId, (run) => {
      const task = run.tasks.find((t) => t.id === taskId);
      if (!task) {
        return;
      }
      const deserialized = IFileCoverage.deserialize(this.uriIdentityService, coverage);
      transaction((tx) => {
        let value = task.coverage.read(void 0);
        if (!value) {
          value = new TestCoverage(run, taskId, this.uriIdentityService, {
            getCoverageDetails: (id, testId, token) => this.proxy.$getCoverageDetails(id, testId, token).then((r) => r.map(CoverageDetails.deserialize))
          });
          value.append(deserialized, tx);
          task.coverage.set(value, tx);
        } else {
          value.append(deserialized, tx);
        }
      });
    });
  }
  /**
   * @inheritdoc
   */
  $startedExtensionTestRun(req) {
    this.resultService.createLiveResult(req);
  }
  /**
   * @inheritdoc
   */
  $startedTestRunTask(runId, task) {
    this.withLiveRun(runId, (r) => r.addTask(task));
  }
  /**
   * @inheritdoc
   */
  $finishedTestRunTask(runId, taskId) {
    this.withLiveRun(runId, (r) => r.markTaskComplete(taskId));
  }
  /**
   * @inheritdoc
   */
  $finishedExtensionTestRun(runId) {
    this.withLiveRun(runId, (r) => r.markComplete());
  }
  /**
   * @inheritdoc
   */
  $updateTestStateInRun(runId, taskId, testId, state, duration) {
    this.withLiveRun(runId, (r) => r.updateState(testId, taskId, state, duration));
  }
  /**
   * @inheritdoc
   */
  $appendOutputToRun(runId, taskId, output, locationDto, testId) {
    const location = locationDto && {
      uri: URI.revive(locationDto.uri),
      range: Range.lift(locationDto.range)
    };
    this.withLiveRun(runId, (r) => r.appendOutput(output, taskId, location, testId));
  }
  /**
   * @inheritdoc
   */
  $appendTestMessagesInRun(runId, taskId, testId, messages) {
    const r = this.resultService.getResult(runId);
    if (r && r instanceof LiveTestResult) {
      for (const message of messages) {
        r.appendMessage(testId, taskId, ITestMessage.deserialize(this.uriIdentityService, message));
      }
    }
  }
  /**
   * @inheritdoc
   */
  $registerTestController(controllerId, _label, _capabilities) {
    const disposable = new DisposableStore();
    const label = observableValue(`${controllerId}.label`, _label);
    const capabilities = observableValue(`${controllerId}.cap`, _capabilities);
    const controller = {
      id: controllerId,
      label,
      capabilities,
      syncTests: () => this.proxy.$syncTests(),
      refreshTests: (token) => this.proxy.$refreshTests(controllerId, token),
      configureRunProfile: (id) => this.proxy.$configureRunProfile(controllerId, id),
      runTests: (reqs, token) => this.proxy.$runControllerTests(reqs, token),
      startContinuousRun: (reqs, token) => this.proxy.$startContinuousRun(reqs, token),
      expandTest: (testId, levels) => this.proxy.$expandTest(testId, isFinite(levels) ? levels : -1),
      getRelatedCode: (testId, token) => this.proxy.$getCodeRelatedToTest(testId, token).then(
        (locations) => locations.map((l) => ({
          uri: URI.revive(l.uri),
          range: Range.lift(l.range)
        }))
      )
    };
    disposable.add(toDisposable(() => this.testProfiles.removeProfile(controllerId)));
    disposable.add(this.testService.registerTestController(controllerId, controller));
    this.testProviderRegistrations.set(controllerId, {
      instance: controller,
      label,
      capabilities,
      disposable
    });
  }
  /**
   * @inheritdoc
   */
  $updateController(controllerId, patch) {
    const controller = this.testProviderRegistrations.get(controllerId);
    if (!controller) {
      return;
    }
    transaction((tx) => {
      if (patch.label !== void 0) {
        controller.label.set(patch.label, tx);
      }
      if (patch.capabilities !== void 0) {
        controller.capabilities.set(patch.capabilities, tx);
      }
    });
  }
  /**
   * @inheritdoc
   */
  $unregisterTestController(controllerId) {
    this.testProviderRegistrations.get(controllerId)?.disposable.dispose();
    this.testProviderRegistrations.delete(controllerId);
  }
  /**
   * @inheritdoc
   */
  $subscribeToDiffs() {
    this.proxy.$acceptDiff(this.testService.collection.getReviverDiff().map(TestsDiffOp.serialize));
    this.diffListener.value = this.testService.onDidProcessDiff(this.proxy.$acceptDiff, this.proxy);
  }
  /**
   * @inheritdoc
   */
  $unsubscribeFromDiffs() {
    this.diffListener.clear();
  }
  /**
   * @inheritdoc
   */
  $publishDiff(controllerId, diff) {
    this.testService.publishDiff(
      controllerId,
      diff.map((d) => TestsDiffOp.deserialize(this.uriIdentityService, d))
    );
  }
  /**
   * @inheritdoc
   */
  async $runTests(req, token) {
    const result = await this.testService.runResolvedTests(req, token);
    return result.id;
  }
  /**
   * @inheritdoc
   */
  async $getCoverageDetails(resultId, taskIndex, uri, token) {
    const details = await this.resultService.getResult(resultId)?.tasks[taskIndex]?.coverage.get()?.getUri(URI.from(uri))?.details(token);
    return details || [];
  }
  dispose() {
    super.dispose();
    for (const subscription of this.testProviderRegistrations.values()) {
      subscription.disposable.dispose();
    }
    this.testProviderRegistrations.clear();
  }
  withLiveRun(runId, fn) {
    const r = this.resultService.getResult(runId);
    return r && r instanceof LiveTestResult ? fn(r) : void 0;
  }
};
MainThreadTesting = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTesting),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, ITestService),
  __decorateParam(3, ITestProfileService),
  __decorateParam(4, ITestResultService)
], MainThreadTesting);
export {
  MainThreadTesting
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVGVzdGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBXZWxsRGVmaW5lZFByZWZpeFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcmVmaXhUcmVlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFRlc3RDb3ZlcmFnZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdENvdmVyYWdlLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IElUZXN0UHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RQcm9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMaXZlVGVzdFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFJlc3VsdC5qcyc7XG5pbXBvcnQgeyBJVGVzdFJlc3VsdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYWluVGhyZWFkVGVzdENvbnRyb2xsZXIsIElUZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBFeHRlbnNpb25SdW5UZXN0c1JlcXVlc3QsIElGaWxlQ292ZXJhZ2UsIElUZXN0SXRlbSwgSVRlc3RNZXNzYWdlLCBJVGVzdFJ1blByb2ZpbGUsIElUZXN0UnVuVGFzaywgUmVzb2x2ZWRUZXN0UnVuUmVxdWVzdCwgVGVzdENvbnRyb2xsZXJDYXBhYmlsaXR5LCBUZXN0UmVzdWx0U3RhdGUsIFRlc3RSdW5Qcm9maWxlQml0c2V0LCBUZXN0c0RpZmZPcCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0VGVzdGluZ1NoYXBlLCBJTG9jYXRpb25EdG8sIElUZXN0Q29udHJvbGxlclBhdGNoLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFRlc3RpbmdTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZXN0aW5nKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRUZXN0aW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRUZXN0aW5nU2hhcGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBFeHRIb3N0VGVzdGluZ1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHtcblx0XHRpbnN0YW5jZTogSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlcjtcblx0XHRsYWJlbDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRcdGNhcGFiaWxpdGllczogSVNldHRhYmxlT2JzZXJ2YWJsZTxUZXN0Q29udHJvbGxlckNhcGFiaWxpdHk+O1xuXHRcdGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHR9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdFx0QElUZXN0UHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0UHJvZmlsZXM6IElUZXN0UHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFNlcnZpY2U6IElUZXN0UmVzdWx0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnByb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdFRlc3RpbmcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXN0U2VydmljZS5yZWdpc3RlckV4dEhvc3Qoe1xuXHRcdFx0cHJvdmlkZVRlc3RGb2xsb3d1cHM6IChyZXEsIHRva2VuKSA9PiB0aGlzLnByb3h5LiRwcm92aWRlVGVzdEZvbGxvd3VwcyhyZXEsIHRva2VuKSxcblx0XHRcdGV4ZWN1dGVUZXN0Rm9sbG93dXA6IGlkID0+IHRoaXMucHJveHkuJGV4ZWN1dGVUZXN0Rm9sbG93dXAoaWQpLFxuXHRcdFx0ZGlzcG9zZVRlc3RGb2xsb3d1cHM6IGlkcyA9PiB0aGlzLnByb3h5LiRkaXNwb3NlVGVzdEZvbGxvd3VwcyhpZHMpLFxuXHRcdFx0Z2V0VGVzdHNSZWxhdGVkVG9Db2RlOiAodXJpLCBwb3NpdGlvbiwgdG9rZW4pID0+IHRoaXMucHJveHkuJGdldFRlc3RzUmVsYXRlZFRvQ29kZSh1cmksIHBvc2l0aW9uLCB0b2tlbiksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXN0U2VydmljZS5vbkRpZENhbmNlbFRlc3RSdW4oKHsgcnVuSWQsIHRhc2tJZCB9KSA9PiB7XG5cdFx0XHR0aGlzLnByb3h5LiRjYW5jZWxFeHRlbnNpb25UZXN0UnVuKHJ1bklkLCB0YXNrSWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRlc3RQcm9maWxlcy5vbkRpZENoYW5nZSwgKF9sYXN0LCBlKSA9PiBlKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBvYmo6IFJlY29yZDwvKiBjb250cm9sbGVyIGlkICovc3RyaW5nLCAvKiBwcm9maWxlIGlkICovIG51bWJlcltdPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBbVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLCBUZXN0UnVuUHJvZmlsZUJpdHNldC5EZWJ1ZywgVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2VdKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnRlc3RQcm9maWxlcy5nZXRHcm91cERlZmF1bHRQcm9maWxlcyhncm91cCkpIHtcblx0XHRcdFx0XHRvYmpbcHJvZmlsZS5jb250cm9sbGVySWRdID8/PSBbXTtcblx0XHRcdFx0XHRvYmpbcHJvZmlsZS5jb250cm9sbGVySWRdLnB1c2gocHJvZmlsZS5wcm9maWxlSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucHJveHkuJHNldERlZmF1bHRSdW5Qcm9maWxlcyhvYmopO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdFNlcnZpY2Uub25SZXN1bHRzQ2hhbmdlZChldnQgPT4ge1xuXHRcdFx0aWYgKCdjb21wbGV0ZWQnIGluIGV2dCkge1xuXHRcdFx0XHRjb25zdCBzZXJpYWxpemVkID0gZXZ0LmNvbXBsZXRlZC50b0pTT05XaXRoTWVzc2FnZXMoKTtcblx0XHRcdFx0aWYgKHNlcmlhbGl6ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnByb3h5LiRwdWJsaXNoVGVzdFJlc3VsdHMoW3NlcmlhbGl6ZWRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICgncmVtb3ZlZCcgaW4gZXZ0KSB7XG5cdFx0XHRcdGV2dC5yZW1vdmVkLmZvckVhY2gociA9PiB7XG5cdFx0XHRcdFx0aWYgKHIgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm94eS4kZGlzcG9zZVJ1bihyLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JG1hcmtUZXN0UmV0aXJlZCh0ZXN0SWRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCB0cmVlOiBXZWxsRGVmaW5lZFByZWZpeFRyZWU8dW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGVzdElkcykge1xuXHRcdFx0dHJlZSA9IG5ldyBXZWxsRGVmaW5lZFByZWZpeFRyZWUoKTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgdGVzdElkcykge1xuXHRcdFx0XHR0cmVlLmluc2VydChUZXN0SWQuZnJvbVN0cmluZyhpZCkucGF0aCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiB0aGlzLnJlc3VsdFNlcnZpY2UucmVzdWx0cykge1xuXHRcdFx0Ly8gYWxsIG5vbi1saXZlIHJlc3VsdHMgYXJlIGFscmVhZHkgZW50aXJlbHkgb3V0ZGF0ZWRcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBMaXZlVGVzdFJlc3VsdCkge1xuXHRcdFx0XHRyZXN1bHQubWFya1JldGlyZWQodHJlZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkcHVibGlzaFRlc3RSdW5Qcm9maWxlKHByb2ZpbGU6IElUZXN0UnVuUHJvZmlsZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLnRlc3RQcm92aWRlclJlZ2lzdHJhdGlvbnMuZ2V0KHByb2ZpbGUuY29udHJvbGxlcklkKTtcblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0dGhpcy50ZXN0UHJvZmlsZXMuYWRkUHJvZmlsZShjb250cm9sbGVyLmluc3RhbmNlLCBwcm9maWxlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCR1cGRhdGVUZXN0UnVuQ29uZmlnKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBwcm9maWxlSWQ6IG51bWJlciwgdXBkYXRlOiBQYXJ0aWFsPElUZXN0UnVuUHJvZmlsZT4pOiB2b2lkIHtcblx0XHR0aGlzLnRlc3RQcm9maWxlcy51cGRhdGVQcm9maWxlKGNvbnRyb2xsZXJJZCwgcHJvZmlsZUlkLCB1cGRhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkcmVtb3ZlVGVzdFByb2ZpbGUoY29udHJvbGxlcklkOiBzdHJpbmcsIHByb2ZpbGVJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50ZXN0UHJvZmlsZXMucmVtb3ZlUHJvZmlsZShjb250cm9sbGVySWQsIHByb2ZpbGVJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRhZGRUZXN0c1RvUnVuKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBydW5JZDogc3RyaW5nLCB0ZXN0czogSVRlc3RJdGVtLlNlcmlhbGl6ZWRbXSk6IHZvaWQge1xuXHRcdHRoaXMud2l0aExpdmVSdW4ocnVuSWQsIHIgPT4gci5hZGRUZXN0Q2hhaW5Ub1J1bihjb250cm9sbGVySWQsXG5cdFx0XHR0ZXN0cy5tYXAodCA9PiBJVGVzdEl0ZW0uZGVzZXJpYWxpemUodGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHQpKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHQkYXBwZW5kQ292ZXJhZ2UocnVuSWQ6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIGNvdmVyYWdlOiBJRmlsZUNvdmVyYWdlLlNlcmlhbGl6ZWQpOiB2b2lkIHtcblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCBydW4gPT4ge1xuXHRcdFx0Y29uc3QgdGFzayA9IHJ1bi50YXNrcy5maW5kKHQgPT4gdC5pZCA9PT0gdGFza0lkKTtcblx0XHRcdGlmICghdGFzaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlc2VyaWFsaXplZCA9IElGaWxlQ292ZXJhZ2UuZGVzZXJpYWxpemUodGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIGNvdmVyYWdlKTtcblxuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSB0YXNrLmNvdmVyYWdlLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRcdHZhbHVlID0gbmV3IFRlc3RDb3ZlcmFnZShydW4sIHRhc2tJZCwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGdldENvdmVyYWdlRGV0YWlsczogKGlkLCB0ZXN0SWQsIHRva2VuKSA9PiB0aGlzLnByb3h5LiRnZXRDb3ZlcmFnZURldGFpbHMoaWQsIHRlc3RJZCwgdG9rZW4pXG5cdFx0XHRcdFx0XHRcdC50aGVuKHIgPT4gci5tYXAoQ292ZXJhZ2VEZXRhaWxzLmRlc2VyaWFsaXplKSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dmFsdWUuYXBwZW5kKGRlc2VyaWFsaXplZCwgdHgpO1xuXHRcdFx0XHRcdCh0YXNrLmNvdmVyYWdlIGFzIElTZXR0YWJsZU9ic2VydmFibGU8VGVzdENvdmVyYWdlPikuc2V0KHZhbHVlLCB0eCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWUuYXBwZW5kKGRlc2VyaWFsaXplZCwgdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JHN0YXJ0ZWRFeHRlbnNpb25UZXN0UnVuKHJlcTogRXh0ZW5zaW9uUnVuVGVzdHNSZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHRTZXJ2aWNlLmNyZWF0ZUxpdmVSZXN1bHQocmVxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0JHN0YXJ0ZWRUZXN0UnVuVGFzayhydW5JZDogc3RyaW5nLCB0YXNrOiBJVGVzdFJ1blRhc2spOiB2b2lkIHtcblx0XHR0aGlzLndpdGhMaXZlUnVuKHJ1bklkLCByID0+IHIuYWRkVGFzayh0YXNrKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRmaW5pc2hlZFRlc3RSdW5UYXNrKHJ1bklkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy53aXRoTGl2ZVJ1bihydW5JZCwgciA9PiByLm1hcmtUYXNrQ29tcGxldGUodGFza0lkKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdCRmaW5pc2hlZEV4dGVuc2lvblRlc3RSdW4ocnVuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMud2l0aExpdmVSdW4ocnVuSWQsIHIgPT4gci5tYXJrQ29tcGxldGUoKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkdXBkYXRlVGVzdFN0YXRlSW5SdW4ocnVuSWQ6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIHRlc3RJZDogc3RyaW5nLCBzdGF0ZTogVGVzdFJlc3VsdFN0YXRlLCBkdXJhdGlvbj86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMud2l0aExpdmVSdW4ocnVuSWQsIHIgPT4gci51cGRhdGVTdGF0ZSh0ZXN0SWQsIHRhc2tJZCwgc3RhdGUsIGR1cmF0aW9uKSk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkYXBwZW5kT3V0cHV0VG9SdW4ocnVuSWQ6IHN0cmluZywgdGFza0lkOiBzdHJpbmcsIG91dHB1dDogVlNCdWZmZXIsIGxvY2F0aW9uRHRvPzogSUxvY2F0aW9uRHRvLCB0ZXN0SWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGxvY2F0aW9uRHRvICYmIHtcblx0XHRcdHVyaTogVVJJLnJldml2ZShsb2NhdGlvbkR0by51cmkpLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmxpZnQobG9jYXRpb25EdG8ucmFuZ2UpXG5cdFx0fTtcblxuXHRcdHRoaXMud2l0aExpdmVSdW4ocnVuSWQsIHIgPT4gci5hcHBlbmRPdXRwdXQob3V0cHV0LCB0YXNrSWQsIGxvY2F0aW9uLCB0ZXN0SWQpKTtcblx0fVxuXG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJGFwcGVuZFRlc3RNZXNzYWdlc0luUnVuKHJ1bklkOiBzdHJpbmcsIHRhc2tJZDogc3RyaW5nLCB0ZXN0SWQ6IHN0cmluZywgbWVzc2FnZXM6IElUZXN0TWVzc2FnZS5TZXJpYWxpemVkW10pOiB2b2lkIHtcblx0XHRjb25zdCByID0gdGhpcy5yZXN1bHRTZXJ2aWNlLmdldFJlc3VsdChydW5JZCk7XG5cdFx0aWYgKHIgJiYgciBpbnN0YW5jZW9mIExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbWVzc2FnZXMpIHtcblx0XHRcdFx0ci5hcHBlbmRNZXNzYWdlKHRlc3RJZCwgdGFza0lkLCBJVGVzdE1lc3NhZ2UuZGVzZXJpYWxpemUodGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIG1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkcmVnaXN0ZXJUZXN0Q29udHJvbGxlcihjb250cm9sbGVySWQ6IHN0cmluZywgX2xhYmVsOiBzdHJpbmcsIF9jYXBhYmlsaXRpZXM6IFRlc3RDb250cm9sbGVyQ2FwYWJpbGl0eSkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFiZWwgPSBvYnNlcnZhYmxlVmFsdWUoYCR7Y29udHJvbGxlcklkfS5sYWJlbGAsIF9sYWJlbCk7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gb2JzZXJ2YWJsZVZhbHVlKGAke2NvbnRyb2xsZXJJZH0uY2FwYCwgX2NhcGFiaWxpdGllcyk7XG5cdFx0Y29uc3QgY29udHJvbGxlcjogSU1haW5UaHJlYWRUZXN0Q29udHJvbGxlciA9IHtcblx0XHRcdGlkOiBjb250cm9sbGVySWQsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdHN5bmNUZXN0czogKCkgPT4gdGhpcy5wcm94eS4kc3luY1Rlc3RzKCksXG5cdFx0XHRyZWZyZXNoVGVzdHM6IHRva2VuID0+IHRoaXMucHJveHkuJHJlZnJlc2hUZXN0cyhjb250cm9sbGVySWQsIHRva2VuKSxcblx0XHRcdGNvbmZpZ3VyZVJ1blByb2ZpbGU6IGlkID0+IHRoaXMucHJveHkuJGNvbmZpZ3VyZVJ1blByb2ZpbGUoY29udHJvbGxlcklkLCBpZCksXG5cdFx0XHRydW5UZXN0czogKHJlcXMsIHRva2VuKSA9PiB0aGlzLnByb3h5LiRydW5Db250cm9sbGVyVGVzdHMocmVxcywgdG9rZW4pLFxuXHRcdFx0c3RhcnRDb250aW51b3VzUnVuOiAocmVxcywgdG9rZW4pID0+IHRoaXMucHJveHkuJHN0YXJ0Q29udGludW91c1J1bihyZXFzLCB0b2tlbiksXG5cdFx0XHRleHBhbmRUZXN0OiAodGVzdElkLCBsZXZlbHMpID0+IHRoaXMucHJveHkuJGV4cGFuZFRlc3QodGVzdElkLCBpc0Zpbml0ZShsZXZlbHMpID8gbGV2ZWxzIDogLTEpLFxuXHRcdFx0Z2V0UmVsYXRlZENvZGU6ICh0ZXN0SWQsIHRva2VuKSA9PiB0aGlzLnByb3h5LiRnZXRDb2RlUmVsYXRlZFRvVGVzdCh0ZXN0SWQsIHRva2VuKS50aGVuKGxvY2F0aW9ucyA9PlxuXHRcdFx0XHRsb2NhdGlvbnMubWFwKGwgPT4gKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUobC51cmkpLFxuXHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGwucmFuZ2UpXG5cdFx0XHRcdH0pKSxcblx0XHRcdCksXG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnRlc3RQcm9maWxlcy5yZW1vdmVQcm9maWxlKGNvbnRyb2xsZXJJZCkpKTtcblx0XHRkaXNwb3NhYmxlLmFkZCh0aGlzLnRlc3RTZXJ2aWNlLnJlZ2lzdGVyVGVzdENvbnRyb2xsZXIoY29udHJvbGxlcklkLCBjb250cm9sbGVyKSk7XG5cblx0XHR0aGlzLnRlc3RQcm92aWRlclJlZ2lzdHJhdGlvbnMuc2V0KGNvbnRyb2xsZXJJZCwge1xuXHRcdFx0aW5zdGFuY2U6IGNvbnRyb2xsZXIsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdGRpc3Bvc2FibGVcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljICR1cGRhdGVDb250cm9sbGVyKGNvbnRyb2xsZXJJZDogc3RyaW5nLCBwYXRjaDogSVRlc3RDb250cm9sbGVyUGF0Y2gpIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy50ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zLmdldChjb250cm9sbGVySWQpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGlmIChwYXRjaC5sYWJlbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIubGFiZWwuc2V0KHBhdGNoLmxhYmVsLCB0eCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYXRjaC5jYXBhYmlsaXRpZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250cm9sbGVyLmNhcGFiaWxpdGllcy5zZXQocGF0Y2guY2FwYWJpbGl0aWVzLCB0eCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljICR1bnJlZ2lzdGVyVGVzdENvbnRyb2xsZXIoY29udHJvbGxlcklkOiBzdHJpbmcpIHtcblx0XHR0aGlzLnRlc3RQcm92aWRlclJlZ2lzdHJhdGlvbnMuZ2V0KGNvbnRyb2xsZXJJZCk/LmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMudGVzdFByb3ZpZGVyUmVnaXN0cmF0aW9ucy5kZWxldGUoY29udHJvbGxlcklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljICRzdWJzY3JpYmVUb0RpZmZzKCk6IHZvaWQge1xuXHRcdHRoaXMucHJveHkuJGFjY2VwdERpZmYodGhpcy50ZXN0U2VydmljZS5jb2xsZWN0aW9uLmdldFJldml2ZXJEaWZmKCkubWFwKFRlc3RzRGlmZk9wLnNlcmlhbGl6ZSkpO1xuXHRcdHRoaXMuZGlmZkxpc3RlbmVyLnZhbHVlID0gdGhpcy50ZXN0U2VydmljZS5vbkRpZFByb2Nlc3NEaWZmKHRoaXMucHJveHkuJGFjY2VwdERpZmYsIHRoaXMucHJveHkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRwdWJsaWMgJHVuc3Vic2NyaWJlRnJvbURpZmZzKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlmZkxpc3RlbmVyLmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyAkcHVibGlzaERpZmYoY29udHJvbGxlcklkOiBzdHJpbmcsIGRpZmY6IFRlc3RzRGlmZk9wLlNlcmlhbGl6ZWRbXSk6IHZvaWQge1xuXHRcdHRoaXMudGVzdFNlcnZpY2UucHVibGlzaERpZmYoY29udHJvbGxlcklkLFxuXHRcdFx0ZGlmZi5tYXAoZCA9PiBUZXN0c0RpZmZPcC5kZXNlcmlhbGl6ZSh0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jICRydW5UZXN0cyhyZXE6IFJlc29sdmVkVGVzdFJ1blJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy50ZXN0U2VydmljZS5ydW5SZXNvbHZlZFRlc3RzKHJlcSwgdG9rZW4pO1xuXHRcdHJldHVybiByZXN1bHQuaWQ7XG5cdH1cblxuXHQvKipcblx0ICogQGluaGVyaXRkb2Ncblx0ICovXG5cdHB1YmxpYyBhc3luYyAkZ2V0Q292ZXJhZ2VEZXRhaWxzKHJlc3VsdElkOiBzdHJpbmcsIHRhc2tJbmRleDogbnVtYmVyLCB1cmk6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q292ZXJhZ2VEZXRhaWxzLlNlcmlhbGl6ZWRbXT4ge1xuXHRcdGNvbnN0IGRldGFpbHMgPSBhd2FpdCB0aGlzLnJlc3VsdFNlcnZpY2UuZ2V0UmVzdWx0KHJlc3VsdElkKVxuXHRcdFx0Py50YXNrc1t0YXNrSW5kZXhdXG5cdFx0XHQ/LmNvdmVyYWdlLmdldCgpXG5cdFx0XHQ/LmdldFVyaShVUkkuZnJvbSh1cmkpKVxuXHRcdFx0Py5kZXRhaWxzKHRva2VuKTtcblxuXHRcdC8vIFJldHVybiBlbXB0eSBpZiBub3RoaW5nLiBTb21lIGZhaWx1cmUgaXMgYWx3YXlzIHBvc3NpYmxlIGhlcmUgYmVjYXVzZVxuXHRcdC8vIHJlc3VsdHMgbWlnaHQgYmUgY2xlYXJlZCBpbiB0aGUgbWVhbnRpbWUuXG5cdFx0cmV0dXJuIGRldGFpbHMgfHwgW107XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgdGhpcy50ZXN0UHJvdmlkZXJSZWdpc3RyYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMudGVzdFByb3ZpZGVyUmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoTGl2ZVJ1bjxUPihydW5JZDogc3RyaW5nLCBmbjogKHJ1bjogTGl2ZVRlc3RSZXN1bHQpID0+IFQpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByID0gdGhpcy5yZXN1bHRTZXJ2aWNlLmdldFJlc3VsdChydW5JZCk7XG5cdFx0cmV0dXJuIHIgJiYgciBpbnN0YW5jZW9mIExpdmVUZXN0UmVzdWx0ID8gZm4ocikgOiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUE4QixpQkFBaUIsbUJBQW1CO0FBQ2xFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYztBQUN2QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFvQyxvQkFBb0I7QUFDeEQsU0FBUyxpQkFBMkMsZUFBZSxXQUFXLGNBQWdILHNCQUFzQixtQkFBbUI7QUFDdk8sU0FBMEIsNEJBQTRCO0FBQ3RELFNBQVMsZ0JBQXlFLG1CQUEyQztBQUd0SCxJQUFNLG9CQUFOLGNBQWdDLFdBQTZDO0FBQUEsRUFVbkYsWUFDQyxnQkFDc0Msb0JBQ1AsYUFDTyxjQUNELGVBQ3BDO0FBQ0QsVUFBTTtBQUxnQztBQUNQO0FBQ087QUFDRDtBQWJ0QyxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBQ3RFLFNBQWlCLDRCQUE0QixvQkFBSSxJQUs5QztBQVVGLFNBQUssUUFBUSxlQUFlLFNBQVMsZUFBZSxjQUFjO0FBRWxFLFNBQUssVUFBVSxLQUFLLFlBQVksZ0JBQWdCO0FBQUEsTUFDL0Msc0JBQXNCLENBQUMsS0FBSyxVQUFVLEtBQUssTUFBTSxzQkFBc0IsS0FBSyxLQUFLO0FBQUEsTUFDakYscUJBQXFCLFFBQU0sS0FBSyxNQUFNLHFCQUFxQixFQUFFO0FBQUEsTUFDN0Qsc0JBQXNCLFNBQU8sS0FBSyxNQUFNLHNCQUFzQixHQUFHO0FBQUEsTUFDakUsdUJBQXVCLENBQUMsS0FBSyxVQUFVLFVBQVUsS0FBSyxNQUFNLHVCQUF1QixLQUFLLFVBQVUsS0FBSztBQUFBLElBQ3hHLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFlBQVksbUJBQW1CLENBQUMsRUFBRSxPQUFPLE9BQU8sTUFBTTtBQUN6RSxXQUFLLE1BQU0sd0JBQXdCLE9BQU8sTUFBTTtBQUFBLElBQ2pELENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxNQUFNLFNBQVMsYUFBYSxhQUFhLENBQUMsT0FBTyxNQUFNLENBQUMsRUFBRSxNQUFNO0FBQzlFLFlBQU0sTUFBb0UsQ0FBQztBQUMzRSxpQkFBVyxTQUFTLENBQUMscUJBQXFCLEtBQUsscUJBQXFCLE9BQU8scUJBQXFCLFFBQVEsR0FBRztBQUMxRyxtQkFBVyxXQUFXLEtBQUssYUFBYSx3QkFBd0IsS0FBSyxHQUFHO0FBQ3ZFLGNBQUksUUFBUSxZQUFZLE1BQU0sQ0FBQztBQUMvQixjQUFJLFFBQVEsWUFBWSxFQUFFLEtBQUssUUFBUSxTQUFTO0FBQUEsUUFDakQ7QUFBQSxNQUNEO0FBRUEsV0FBSyxNQUFNLHVCQUF1QixHQUFHO0FBQUEsSUFDdEMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLGNBQWMsaUJBQWlCLFNBQU87QUFDcEQsVUFBSSxlQUFlLEtBQUs7QUFDdkIsY0FBTSxhQUFhLElBQUksVUFBVSxtQkFBbUI7QUFDcEQsWUFBSSxZQUFZO0FBQ2YsZUFBSyxNQUFNLG9CQUFvQixDQUFDLFVBQVUsQ0FBQztBQUFBLFFBQzVDO0FBQUEsTUFDRCxXQUFXLGFBQWEsS0FBSztBQUM1QixZQUFJLFFBQVEsUUFBUSxPQUFLO0FBQ3hCLGNBQUksYUFBYSxnQkFBZ0I7QUFDaEMsaUJBQUssTUFBTSxZQUFZLEVBQUUsRUFBRTtBQUFBLFVBQzVCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsaUJBQWlCLFNBQXFDO0FBQ3JELFFBQUk7QUFDSixRQUFJLFNBQVM7QUFDWixhQUFPLElBQUksc0JBQXNCO0FBQ2pDLGlCQUFXLE1BQU0sU0FBUztBQUN6QixhQUFLLE9BQU8sT0FBTyxXQUFXLEVBQUUsRUFBRSxNQUFNLE1BQVM7QUFBQSxNQUNsRDtBQUFBLElBQ0Q7QUFFQSxlQUFXLFVBQVUsS0FBSyxjQUFjLFNBQVM7QUFFaEQsVUFBSSxrQkFBa0IsZ0JBQWdCO0FBQ3JDLGVBQU8sWUFBWSxJQUFJO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsdUJBQXVCLFNBQWdDO0FBQ3RELFVBQU0sYUFBYSxLQUFLLDBCQUEwQixJQUFJLFFBQVEsWUFBWTtBQUMxRSxRQUFJLFlBQVk7QUFDZixXQUFLLGFBQWEsV0FBVyxXQUFXLFVBQVUsT0FBTztBQUFBLElBQzFEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EscUJBQXFCLGNBQXNCLFdBQW1CLFFBQXdDO0FBQ3JHLFNBQUssYUFBYSxjQUFjLGNBQWMsV0FBVyxNQUFNO0FBQUEsRUFDaEU7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG1CQUFtQixjQUFzQixXQUF5QjtBQUNqRSxTQUFLLGFBQWEsY0FBYyxjQUFjLFNBQVM7QUFBQSxFQUN4RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsZUFBZSxjQUFzQixPQUFlLE9BQXFDO0FBQ3hGLFNBQUssWUFBWSxPQUFPLE9BQUssRUFBRTtBQUFBLE1BQWtCO0FBQUEsTUFDaEQsTUFBTSxJQUFJLE9BQUssVUFBVSxZQUFZLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUFBLElBQUMsQ0FBQztBQUFBLEVBQ3BFO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxnQkFBZ0IsT0FBZSxRQUFnQixVQUEwQztBQUN4RixTQUFLLFlBQVksT0FBTyxTQUFPO0FBQzlCLFlBQU0sT0FBTyxJQUFJLE1BQU0sS0FBSyxPQUFLLEVBQUUsT0FBTyxNQUFNO0FBQ2hELFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlLGNBQWMsWUFBWSxLQUFLLG9CQUFvQixRQUFRO0FBRWhGLGtCQUFZLFFBQU07QUFDakIsWUFBSSxRQUFRLEtBQUssU0FBUyxLQUFLLE1BQVM7QUFDeEMsWUFBSSxDQUFDLE9BQU87QUFDWCxrQkFBUSxJQUFJLGFBQWEsS0FBSyxRQUFRLEtBQUssb0JBQW9CO0FBQUEsWUFDOUQsb0JBQW9CLENBQUMsSUFBSSxRQUFRLFVBQVUsS0FBSyxNQUFNLG9CQUFvQixJQUFJLFFBQVEsS0FBSyxFQUN6RixLQUFLLE9BQUssRUFBRSxJQUFJLGdCQUFnQixXQUFXLENBQUM7QUFBQSxVQUMvQyxDQUFDO0FBQ0QsZ0JBQU0sT0FBTyxjQUFjLEVBQUU7QUFDN0IsVUFBQyxLQUFLLFNBQStDLElBQUksT0FBTyxFQUFFO0FBQUEsUUFDbkUsT0FBTztBQUNOLGdCQUFNLE9BQU8sY0FBYyxFQUFFO0FBQUEsUUFDOUI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSx5QkFBeUIsS0FBcUM7QUFDN0QsU0FBSyxjQUFjLGlCQUFpQixHQUFHO0FBQUEsRUFDeEM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG9CQUFvQixPQUFlLE1BQTBCO0FBQzVELFNBQUssWUFBWSxPQUFPLE9BQUssRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLEVBQzdDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxxQkFBcUIsT0FBZSxRQUFzQjtBQUN6RCxTQUFLLFlBQVksT0FBTyxPQUFLLEVBQUUsaUJBQWlCLE1BQU0sQ0FBQztBQUFBLEVBQ3hEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSwwQkFBMEIsT0FBcUI7QUFDOUMsU0FBSyxZQUFZLE9BQU8sT0FBSyxFQUFFLGFBQWEsQ0FBQztBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxzQkFBc0IsT0FBZSxRQUFnQixRQUFnQixPQUF3QixVQUF5QjtBQUM1SCxTQUFLLFlBQVksT0FBTyxPQUFLLEVBQUUsWUFBWSxRQUFRLFFBQVEsT0FBTyxRQUFRLENBQUM7QUFBQSxFQUM1RTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sbUJBQW1CLE9BQWUsUUFBZ0IsUUFBa0IsYUFBNEIsUUFBdUI7QUFDN0gsVUFBTSxXQUFXLGVBQWU7QUFBQSxNQUMvQixLQUFLLElBQUksT0FBTyxZQUFZLEdBQUc7QUFBQSxNQUMvQixPQUFPLE1BQU0sS0FBSyxZQUFZLEtBQUs7QUFBQSxJQUNwQztBQUVBLFNBQUssWUFBWSxPQUFPLE9BQUssRUFBRSxhQUFhLFFBQVEsUUFBUSxVQUFVLE1BQU0sQ0FBQztBQUFBLEVBQzlFO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNTyx5QkFBeUIsT0FBZSxRQUFnQixRQUFnQixVQUEyQztBQUN6SCxVQUFNLElBQUksS0FBSyxjQUFjLFVBQVUsS0FBSztBQUM1QyxRQUFJLEtBQUssYUFBYSxnQkFBZ0I7QUFDckMsaUJBQVcsV0FBVyxVQUFVO0FBQy9CLFVBQUUsY0FBYyxRQUFRLFFBQVEsYUFBYSxZQUFZLEtBQUssb0JBQW9CLE9BQU8sQ0FBQztBQUFBLE1BQzNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHdCQUF3QixjQUFzQixRQUFnQixlQUF5QztBQUM3RyxVQUFNLGFBQWEsSUFBSSxnQkFBZ0I7QUFDdkMsVUFBTSxRQUFRLGdCQUFnQixHQUFHLFlBQVksVUFBVSxNQUFNO0FBQzdELFVBQU0sZUFBZSxnQkFBZ0IsR0FBRyxZQUFZLFFBQVEsYUFBYTtBQUN6RSxVQUFNLGFBQXdDO0FBQUEsTUFDN0MsSUFBSTtBQUFBLE1BQ0o7QUFBQSxNQUNBO0FBQUEsTUFDQSxXQUFXLE1BQU0sS0FBSyxNQUFNLFdBQVc7QUFBQSxNQUN2QyxjQUFjLFdBQVMsS0FBSyxNQUFNLGNBQWMsY0FBYyxLQUFLO0FBQUEsTUFDbkUscUJBQXFCLFFBQU0sS0FBSyxNQUFNLHFCQUFxQixjQUFjLEVBQUU7QUFBQSxNQUMzRSxVQUFVLENBQUMsTUFBTSxVQUFVLEtBQUssTUFBTSxvQkFBb0IsTUFBTSxLQUFLO0FBQUEsTUFDckUsb0JBQW9CLENBQUMsTUFBTSxVQUFVLEtBQUssTUFBTSxvQkFBb0IsTUFBTSxLQUFLO0FBQUEsTUFDL0UsWUFBWSxDQUFDLFFBQVEsV0FBVyxLQUFLLE1BQU0sWUFBWSxRQUFRLFNBQVMsTUFBTSxJQUFJLFNBQVMsRUFBRTtBQUFBLE1BQzdGLGdCQUFnQixDQUFDLFFBQVEsVUFBVSxLQUFLLE1BQU0sc0JBQXNCLFFBQVEsS0FBSyxFQUFFO0FBQUEsUUFBSyxlQUN2RixVQUFVLElBQUksUUFBTTtBQUFBLFVBQ25CLEtBQUssSUFBSSxPQUFPLEVBQUUsR0FBRztBQUFBLFVBQ3JCLE9BQU8sTUFBTSxLQUFLLEVBQUUsS0FBSztBQUFBLFFBQzFCLEVBQUU7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUVBLGVBQVcsSUFBSSxhQUFhLE1BQU0sS0FBSyxhQUFhLGNBQWMsWUFBWSxDQUFDLENBQUM7QUFDaEYsZUFBVyxJQUFJLEtBQUssWUFBWSx1QkFBdUIsY0FBYyxVQUFVLENBQUM7QUFFaEYsU0FBSywwQkFBMEIsSUFBSSxjQUFjO0FBQUEsTUFDaEQsVUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLGtCQUFrQixjQUFzQixPQUE2QjtBQUMzRSxVQUFNLGFBQWEsS0FBSywwQkFBMEIsSUFBSSxZQUFZO0FBQ2xFLFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLGdCQUFZLFFBQU07QUFDakIsVUFBSSxNQUFNLFVBQVUsUUFBVztBQUM5QixtQkFBVyxNQUFNLElBQUksTUFBTSxPQUFPLEVBQUU7QUFBQSxNQUNyQztBQUVBLFVBQUksTUFBTSxpQkFBaUIsUUFBVztBQUNyQyxtQkFBVyxhQUFhLElBQUksTUFBTSxjQUFjLEVBQUU7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBRUY7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLDBCQUEwQixjQUFzQjtBQUN0RCxTQUFLLDBCQUEwQixJQUFJLFlBQVksR0FBRyxXQUFXLFFBQVE7QUFDckUsU0FBSywwQkFBMEIsT0FBTyxZQUFZO0FBQUEsRUFDbkQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLG9CQUEwQjtBQUNoQyxTQUFLLE1BQU0sWUFBWSxLQUFLLFlBQVksV0FBVyxlQUFlLEVBQUUsSUFBSSxZQUFZLFNBQVMsQ0FBQztBQUM5RixTQUFLLGFBQWEsUUFBUSxLQUFLLFlBQVksaUJBQWlCLEtBQUssTUFBTSxhQUFhLEtBQUssS0FBSztBQUFBLEVBQy9GO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyx3QkFBOEI7QUFDcEMsU0FBSyxhQUFhLE1BQU07QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sYUFBYSxjQUFzQixNQUFzQztBQUMvRSxTQUFLLFlBQVk7QUFBQSxNQUFZO0FBQUEsTUFDNUIsS0FBSyxJQUFJLE9BQUssWUFBWSxZQUFZLEtBQUssb0JBQW9CLENBQUMsQ0FBQztBQUFBLElBQUM7QUFBQSxFQUNwRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxVQUFVLEtBQTZCLE9BQTJDO0FBQzlGLFVBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxpQkFBaUIsS0FBSyxLQUFLO0FBQ2pFLFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWEsb0JBQW9CLFVBQWtCLFdBQW1CLEtBQW9CLE9BQWlFO0FBQzFKLFVBQU0sVUFBVSxNQUFNLEtBQUssY0FBYyxVQUFVLFFBQVEsR0FDeEQsTUFBTSxTQUFTLEdBQ2YsU0FBUyxJQUFJLEdBQ2IsT0FBTyxJQUFJLEtBQUssR0FBRyxDQUFDLEdBQ3BCLFFBQVEsS0FBSztBQUloQixXQUFPLFdBQVcsQ0FBQztBQUFBLEVBQ3BCO0FBQUEsRUFFZ0IsVUFBVTtBQUN6QixVQUFNLFFBQVE7QUFDZCxlQUFXLGdCQUFnQixLQUFLLDBCQUEwQixPQUFPLEdBQUc7QUFDbkUsbUJBQWEsV0FBVyxRQUFRO0FBQUEsSUFDakM7QUFDQSxTQUFLLDBCQUEwQixNQUFNO0FBQUEsRUFDdEM7QUFBQSxFQUVRLFlBQWUsT0FBZSxJQUErQztBQUNwRixVQUFNLElBQUksS0FBSyxjQUFjLFVBQVUsS0FBSztBQUM1QyxXQUFPLEtBQUssYUFBYSxpQkFBaUIsR0FBRyxDQUFDLElBQUk7QUFBQSxFQUNuRDtBQUNEO0FBbFVhLG9CQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxpQkFBaUI7QUFBQSxFQWFoRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
