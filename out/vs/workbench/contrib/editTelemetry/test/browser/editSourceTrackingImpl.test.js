import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { computeStringDiff } from "../../../../../editor/common/services/editorWebWorker.js";
import { EditSources, EditSuggestionId } from "../../../../../editor/common/textModelEditSource.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { AnnotatedDocuments, UriVisibilityProvider } from "../../browser/helpers/annotatedDocuments.js";
import { DiffService } from "../../browser/helpers/documentWithAnnotatedEdits.js";
import { StringEditWithReason } from "../../browser/helpers/observableWorkspace.js";
import { IAiEditTelemetryService } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditSourceTrackingImpl } from "../../browser/telemetry/editSourceTrackingImpl.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError } from "../../browser/telemetry/agentHostEditMarkerService.js";
import { ScmAdapter } from "../../browser/telemetry/scmAdapter.js";
import { IRandomService } from "../../browser/randomService.js";
import { MutableObservableWorkspace } from "./editTelemetry.test.js";
suite("Edit Source Tracking Windows", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flushes and recreates the long-term tracker on hash and branch changes", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "beta", chatEdit("request-2")));
    await timeout(1500);
    context.branch.set("feature", void 0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId,
      modifiedCount: event.modifiedCount,
      deltaModifiedCount: event.deltaModifiedCount
    })), [
      { trigger: "hashChange", requestId: "request-1", modifiedCount: 5, deltaModifiedCount: 5 },
      { trigger: "branchChange", requestId: "request-2", modifiedCount: 3, deltaModifiedCount: 3 }
    ]);
    context.disposables.dispose();
  }));
  test("flushes the long-term tracker when the document closes", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.document.dispose();
    await timeout(0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId
    })), [{ trigger: "closed", requestId: "request-1" }]);
    context.disposables.dispose();
  }));
  test("flushes and recreates the long-term tracker after ten hours", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    await timeout(10 * 60 * 60 * 1e3);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "beta", chatEdit("request-2")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    assert.deepStrictEqual(context.details.map((event) => ({
      trigger: event.trigger,
      requestId: event.requestId
    })), [
      { trigger: "10hours", requestId: "request-1" },
      { trigger: "hashChange", requestId: "request-2" }
    ]);
    context.disposables.dispose();
  }));
  test("emits only the top thirty long-term sources by retained count", () => runWithFakedTimers({}, async () => {
    const context = setup();
    await timeout(10);
    for (let i = 1; i <= 31; i++) {
      context.document.applyEdit(StringEditWithReason.replace(
        OffsetRange.emptyAt(context.document.value.get().value.length),
        "x".repeat(i),
        EditSources.unknown({ name: `source-${i}` })
      ));
    }
    await timeout(10);
    context.headHash.set("hash-2", void 0);
    assert.deepStrictEqual({
      count: context.details.length,
      first: context.details[0].sourceKey,
      last: context.details.at(-1)?.sourceKey,
      containsSmallest: context.details.some((event) => event.sourceKey === "source:unknown-name:source-1")
    }, {
      count: 30,
      first: "source:unknown-name:source-31",
      last: "source:unknown-name:source-2",
      containsSmallest: false
    });
    context.disposables.dispose();
  }));
  test("starts after first visibility and keeps only the long-term tracker while hidden", () => runWithFakedTimers({}, async () => {
    const visible = observableValue("visible", false);
    const context = setup(visible);
    await timeout(10);
    assert.strictEqual(context.impl.docsState.get().size, 0);
    visible.set(true, void 0);
    const visibleState = context.impl.docsState.get().get(context.document);
    if (!visibleState) {
      throw new Error("Expected visible document state");
    }
    assert.ok(visibleState.longtermTracker.get());
    const firstWindowedTracker = visibleState.windowedTracker.get();
    assert.ok(firstWindowedTracker);
    assert.ok(visibleState.windowedFocusTracker.get());
    visible.set(false, void 0);
    const hiddenState = context.impl.docsState.get().get(context.document);
    if (!hiddenState) {
      throw new Error("Expected hidden document state");
    }
    assert.ok(hiddenState.longtermTracker.get());
    assert.strictEqual(hiddenState.windowedTracker.get(), void 0);
    assert.strictEqual(hiddenState.windowedFocusTracker.get(), void 0);
    visible.set(true, void 0);
    const visibleAgainState = context.impl.docsState.get().get(context.document);
    if (!visibleAgainState) {
      throw new Error("Expected visible document state after reopening");
    }
    assert.ok(visibleAgainState.windowedTracker.get());
    assert.notStrictEqual(visibleAgainState.windowedTracker.get(), firstWindowedTracker);
    context.disposables.dispose();
  }));
  test("coordinates long-term totals with Agent Host attribution", () => runWithFakedTimers({}, async () => {
    const commits = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger, statsUuid, isDirty) => isDirty || trigger !== "hashChange" ? void 0 : {
        flushToken: "flush-1",
        agentModifiedCount: 3,
        commit: async (totalModifiedCount) => {
          assert.strictEqual(statsUuid, "stats-2");
          commits.push(totalModifiedCount);
        }
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      details: context.details.map((event) => ({
        statsUuid: event.statsUuid,
        modifiedCount: event.modifiedCount,
        totalModifiedCount: event.totalModifiedCount
      })),
      stats: context.stats.map((event) => ({
        statsUuid: event.statsUuid,
        otherAIModifiedCount: event.otherAIModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      })),
      commits
    }, {
      details: [{
        statsUuid: "stats-2",
        modifiedCount: 5,
        totalModifiedCount: 8
      }],
      stats: [{
        statsUuid: "stats-2",
        otherAIModifiedCount: 8,
        totalModifiedCharacters: 8
      }],
      commits: [8]
    });
    context.disposables.dispose();
  }));
  test("recomputes workbench totals after a late Agent marker", () => runWithFakedTimers({}, async () => {
    const onDidSuppress = new Emitter();
    const prepareStarted = new DeferredPromise();
    const continuePrepare = new DeferredPromise();
    let suppressed = false;
    const committedTotals = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: onDidSuppress.event,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => suppressed,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger) => {
        if (trigger !== "hashChange") {
          return void 0;
        }
        prepareStarted.complete();
        await continuePrepare.p;
        return {
          flushToken: "flush-1",
          agentModifiedCount: 3,
          commit: async (totalModifiedCount) => {
            committedTotals.push(totalModifiedCount);
          }
        };
      }
    };
    const context = setup(void 0, markerService);
    context.disposables.add(onDidSuppress);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await prepareStarted.p;
    suppressed = true;
    onDidSuppress.fire("observation");
    continuePrepare.complete();
    await timeout(10);
    assert.deepStrictEqual({
      committedTotals,
      stats: context.stats.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      }))
    }, {
      committedTotals: [3],
      stats: [{
        otherAIModifiedCount: 3,
        externalModifiedCount: 0,
        totalModifiedCharacters: 3
      }]
    });
    context.disposables.dispose();
  }));
  test("defers Agent Host attribution while the model is dirty", () => runWithFakedTimers({}, async () => {
    const dirtyStates = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger, _statsUuid, isDirty) => {
        if (trigger === "hashChange") {
          dirtyStates.push(isDirty);
        }
        return void 0;
      }
    };
    const context = setup(void 0, markerService, true);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      dirtyStates,
      details: context.details.map((event) => ({
        modifiedCount: event.modifiedCount,
        totalModifiedCount: event.totalModifiedCount
      }))
    }, {
      dirtyStates: [true],
      details: [{
        modifiedCount: 5,
        totalModifiedCount: 5
      }]
    });
    context.disposables.dispose();
  }));
  test("does not fall back matched Agent edits while the model is dirty", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService, true);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      statsCount: context.stats.length
    }, {
      detailCount: 0,
      statsCount: 0
    });
    context.disposables.dispose();
  }));
  test("keeps unmatched reloads as standard external telemetry", () => runWithFakedTimers({}, async () => {
    let observation = 0;
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => `observation-${++observation}`,
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      sourceKeys: context.details.map((event) => event.sourceKey).sort(),
      hasInternalObservationKey: context.details.some((event) => event.sourceKey.startsWith("external-observation:"))
    }, {
      sourceKeys: ["source:Chat.applyEdits", "source:reloadFromDisk"],
      hasInternalObservationKey: false
    });
    context.disposables.dispose();
  }));
  test("reports partial Agent Host coverage without dropping workbench attribution", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      takeCoverageGap: () => ({
        editCount: 1,
        insertedCount: 42
      }),
      prepareFlush: async () => void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.stats.map((event) => ({
      externalModifiedCount: event.externalModifiedCount,
      totalModifiedCharacters: event.totalModifiedCharacters,
      agentHostAttributionCoverage: event.agentHostAttributionCoverage,
      agentHostUntrackedEditCount: event.agentHostUntrackedEditCount,
      agentHostUntrackedInsertedCount: event.agentHostUntrackedInsertedCount
    })), [{
      externalModifiedCount: 8,
      totalModifiedCharacters: 8,
      agentHostAttributionCoverage: "partial",
      agentHostUntrackedEditCount: 1,
      agentHostUntrackedInsertedCount: 42
    }]);
    context.disposables.dispose();
  }));
  test("emits workbench telemetry when Agent Host coordination fails", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => ({
      modifiedCount: event.modifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      modifiedCount: 5,
      totalModifiedCount: 5
    }]);
    context.disposables.dispose();
  }));
  test("falls back to external telemetry when a matched Agent flush cannot prepare", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "alpha", chatEdit("request-1")));
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("alpha"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => event.sourceKey).sort(), [
      "source:Chat.applyEdits",
      "source:reloadFromDisk"
    ]);
    context.disposables.dispose();
  }));
  test("falls back to a matched initial external edit when Agent Host is unavailable", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new Error("Agent Host unavailable");
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual(context.details.map((event) => ({
      sourceKey: event.sourceKey,
      modifiedCount: event.modifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      sourceKey: "source:reloadFromDisk",
      modifiedCount: 8,
      totalModifiedCount: 8
    }]);
    context.disposables.dispose();
  }));
  test("does not fall back when Agent Host attribution is deferred", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => {
        throw new AgentHostEditAttributionDeferredError(new Error("Prepare cancelled"));
      }
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      statsCount: context.stats.length
    }, {
      detailCount: 0,
      statsCount: 0
    });
    context.disposables.dispose();
  }));
  test("does not emit external fallback when the Agent Host commit outcome is unknown", () => runWithFakedTimers({}, async () => {
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => true,
        release: () => {
        }
      }),
      prepareFlush: async () => ({
        flushToken: "flush-1",
        agentModifiedCount: 3,
        commit: async () => {
          throw new AgentHostEditAttributionUnknownOutcomeError(new Error("Transport unavailable"));
        }
      })
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.document.applyEdit(StringEditWithReason.replace(context.document.findRange("hello"), "external", EditSources.reloadFromDisk()));
    await timeout(1500);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      detailCount: context.details.length,
      stats: context.stats.map((event) => ({
        otherAIModifiedCount: event.otherAIModifiedCount,
        externalModifiedCount: event.externalModifiedCount,
        totalModifiedCharacters: event.totalModifiedCharacters
      }))
    }, {
      detailCount: 0,
      stats: [{
        otherAIModifiedCount: 3,
        externalModifiedCount: 0,
        totalModifiedCharacters: 3
      }]
    });
    context.disposables.dispose();
  }));
  test("commits zero-retention Agent Host windows", () => runWithFakedTimers({}, async () => {
    const commits = [];
    const markerService = {
      createCorrelation: () => ({
        onDidSuppress: Event.None,
        onDidInvalidate: Event.None,
        register: () => "observation",
        isSuppressed: () => false,
        release: () => {
        }
      }),
      prepareFlush: async (_resource, trigger) => trigger === "hashChange" ? {
        flushToken: "flush-1",
        agentModifiedCount: 0,
        commit: async (totalModifiedCount) => {
          commits.push(totalModifiedCount);
        }
      } : void 0
    };
    const context = setup(void 0, markerService);
    await timeout(10);
    context.headHash.set("hash-2", void 0);
    await timeout(10);
    assert.deepStrictEqual({
      commits,
      detailCount: context.details.length,
      statsCount: context.stats.length
    }, {
      commits: [0],
      detailCount: 0,
      statsCount: 0
    });
    context.disposables.dispose();
  }));
});
function setup(visible = observableValue("visible", true), markerService, dirty = false) {
  const disposables = new DisposableStore();
  const headHash = observableValue("headHash", "hash-1");
  const branch = observableValue("branch", "main");
  const repo = {
    headCommitHashObs: headHash,
    headBranchNameObs: branch,
    isIgnored: async () => false
  };
  const details = [];
  const stats = [];
  let uuid = 0;
  const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, void 0, true));
  instantiationService.stub(ITelemetryService, {
    publicLog2(eventName, data) {
      const eventData = data;
      if (eventName === "editTelemetry.editSources.details" && eventData?.mode === "longterm") {
        details.push(data);
      } else if (eventName === "editTelemetry.editSources.stats" && eventData?.mode === "longterm") {
        stats.push(data);
      }
    }
  });
  instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, "advanced") });
  instantiationService.stubInstance(ScmAdapter, { getRepo: () => repo });
  instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (_uri, reader) => visible.read(reader) });
  instantiationService.stub(IRandomService, {
    _serviceBrand: void 0,
    generateUuid: () => `stats-${++uuid}`,
    generatePrefixedUuid: (namespace) => `${namespace}-${++uuid}`
  });
  instantiationService.stub(IUserAttentionService, {
    _serviceBrand: void 0,
    isVsCodeFocused: constObservable(true),
    isUserActive: constObservable(true),
    hasUserAttention: constObservable(true),
    totalFocusTimeMs: 0,
    fireAfterGivenFocusTimePassed: () => Disposable.None
  });
  instantiationService.stub(ITextFileService, { isDirty: () => dirty });
  instantiationService.stub(IAiEditTelemetryService, {
    _serviceBrand: void 0,
    createSuggestionId: () => EditSuggestionId.newId(() => "sgt-test"),
    handleCodeAccepted: () => {
    },
    handleCodeRejected: () => {
    }
  });
  instantiationService.stub(ILogService, new NullLogService());
  const workspace = new MutableObservableWorkspace();
  const annotatedDocuments = disposables.add(new AnnotatedDocuments(workspace, instantiationService));
  const impl = disposables.add(new EditSourceTrackingImpl(constObservable(true), annotatedDocuments, markerService, instantiationService));
  const document = disposables.add(workspace.createDocument({
    uri: URI.file("C:\\repo\\file.ts"),
    initialValue: "hello",
    languageId: "typescript"
  }));
  return { disposables, document, details, stats, headHash, branch, impl };
}
function chatEdit(requestId) {
  return EditSources.chatApplyEdits({
    modelId: void 0,
    sessionId: "session-1",
    requestId,
    languageId: "typescript",
    mode: "agent",
    extensionId: void 0,
    codeBlockSuggestionId: void 0
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvdGVzdC9icm93c2VyL2VkaXRTb3VyY2VUcmFja2luZ0ltcGwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVTdHJpbmdEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMsIEVkaXRTdWdnZXN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyQXR0ZW50aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBdHRlbnRpb24vY29tbW9uL3VzZXJBdHRlbnRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IEFubm90YXRlZERvY3VtZW50cywgVXJpVmlzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9oZWxwZXJzL2Fubm90YXRlZERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBEaWZmU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBTdHJpbmdFZGl0V2l0aFJlYXNvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9vYnNlcnZhYmxlV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvYWlFZGl0VGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZVRyYWNraW5nSW1wbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2VkaXRTb3VyY2VUcmFja2luZ0ltcGwuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciwgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uVW5rbm93bk91dGNvbWVFcnJvciwgSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNjbVJlcG9BZGFwdGVyLCBTY21BZGFwdGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvc2NtQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBJUmFuZG9tU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmFuZG9tU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlT2JzZXJ2YWJsZVdvcmtzcGFjZSB9IGZyb20gJy4vZWRpdFRlbGVtZXRyeS50ZXN0LmpzJztcblxuc3VpdGUoJ0VkaXQgU291cmNlIFRyYWNraW5nIFdpbmRvd3MnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZsdXNoZXMgYW5kIHJlY3JlYXRlcyB0aGUgbG9uZy10ZXJtIHRyYWNrZXIgb24gaGFzaCBhbmQgYnJhbmNoIGNoYW5nZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdhbHBoYScsIGNoYXRFZGl0KCdyZXF1ZXN0LTEnKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdhbHBoYScpLCAnYmV0YScsIGNoYXRFZGl0KCdyZXF1ZXN0LTInKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5icmFuY2guc2V0KCdmZWF0dXJlJywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5kZXRhaWxzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0dHJpZ2dlcjogZXZlbnQudHJpZ2dlcixcblx0XHRcdHJlcXVlc3RJZDogZXZlbnQucmVxdWVzdElkLFxuXHRcdFx0bW9kaWZpZWRDb3VudDogZXZlbnQubW9kaWZpZWRDb3VudCxcblx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGVsdGFNb2RpZmllZENvdW50LFxuXHRcdH0pKSwgW1xuXHRcdFx0eyB0cmlnZ2VyOiAnaGFzaENoYW5nZScsIHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsIG1vZGlmaWVkQ291bnQ6IDUsIGRlbHRhTW9kaWZpZWRDb3VudDogNSB9LFxuXHRcdFx0eyB0cmlnZ2VyOiAnYnJhbmNoQ2hhbmdlJywgcmVxdWVzdElkOiAncmVxdWVzdC0yJywgbW9kaWZpZWRDb3VudDogMywgZGVsdGFNb2RpZmllZENvdW50OiAzIH0sXG5cdFx0XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZsdXNoZXMgdGhlIGxvbmctdGVybSB0cmFja2VyIHdoZW4gdGhlIGRvY3VtZW50IGNsb3NlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2FscGhhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMScpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmRvY3VtZW50LmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHR0cmlnZ2VyOiBldmVudC50cmlnZ2VyLFxuXHRcdFx0cmVxdWVzdElkOiBldmVudC5yZXF1ZXN0SWQsXG5cdFx0fSkpLCBbeyB0cmlnZ2VyOiAnY2xvc2VkJywgcmVxdWVzdElkOiAncmVxdWVzdC0xJyB9XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZsdXNoZXMgYW5kIHJlY3JlYXRlcyB0aGUgbG9uZy10ZXJtIHRyYWNrZXIgYWZ0ZXIgdGVuIGhvdXJzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTAgKiA2MCAqIDYwICogMTAwMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdhbHBoYScpLCAnYmV0YScsIGNoYXRFZGl0KCdyZXF1ZXN0LTInKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHQuZGV0YWlscy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdHRyaWdnZXI6IGV2ZW50LnRyaWdnZXIsXG5cdFx0XHRyZXF1ZXN0SWQ6IGV2ZW50LnJlcXVlc3RJZCxcblx0XHR9KSksIFtcblx0XHRcdHsgdHJpZ2dlcjogJzEwaG91cnMnLCByZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnIH0sXG5cdFx0XHR7IHRyaWdnZXI6ICdoYXNoQ2hhbmdlJywgcmVxdWVzdElkOiAncmVxdWVzdC0yJyB9LFxuXHRcdF0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdlbWl0cyBvbmx5IHRoZSB0b3AgdGhpcnR5IGxvbmctdGVybSBzb3VyY2VzIGJ5IHJldGFpbmVkIGNvdW50JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSAzMTsgaSsrKSB7XG5cdFx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKFxuXHRcdFx0XHRPZmZzZXRSYW5nZS5lbXB0eUF0KGNvbnRleHQuZG9jdW1lbnQudmFsdWUuZ2V0KCkudmFsdWUubGVuZ3RoKSxcblx0XHRcdFx0J3gnLnJlcGVhdChpKSxcblx0XHRcdFx0RWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6IGBzb3VyY2UtJHtpfWAgfSksXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvdW50OiBjb250ZXh0LmRldGFpbHMubGVuZ3RoLFxuXHRcdFx0Zmlyc3Q6IGNvbnRleHQuZGV0YWlsc1swXS5zb3VyY2VLZXksXG5cdFx0XHRsYXN0OiBjb250ZXh0LmRldGFpbHMuYXQoLTEpPy5zb3VyY2VLZXksXG5cdFx0XHRjb250YWluc1NtYWxsZXN0OiBjb250ZXh0LmRldGFpbHMuc29tZShldmVudCA9PiBldmVudC5zb3VyY2VLZXkgPT09ICdzb3VyY2U6dW5rbm93bi1uYW1lOnNvdXJjZS0xJyksXG5cdFx0fSwge1xuXHRcdFx0Y291bnQ6IDMwLFxuXHRcdFx0Zmlyc3Q6ICdzb3VyY2U6dW5rbm93bi1uYW1lOnNvdXJjZS0zMScsXG5cdFx0XHRsYXN0OiAnc291cmNlOnVua25vd24tbmFtZTpzb3VyY2UtMicsXG5cdFx0XHRjb250YWluc1NtYWxsZXN0OiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnc3RhcnRzIGFmdGVyIGZpcnN0IHZpc2liaWxpdHkgYW5kIGtlZXBzIG9ubHkgdGhlIGxvbmctdGVybSB0cmFja2VyIHdoaWxlIGhpZGRlbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHZpc2libGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3Zpc2libGUnLCBmYWxzZSk7XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHZpc2libGUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHQuaW1wbC5kb2NzU3RhdGUuZ2V0KCkuc2l6ZSwgMCk7XG5cblx0XHR2aXNpYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHZpc2libGVTdGF0ZSA9IGNvbnRleHQuaW1wbC5kb2NzU3RhdGUuZ2V0KCkuZ2V0KGNvbnRleHQuZG9jdW1lbnQpO1xuXHRcdGlmICghdmlzaWJsZVN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHZpc2libGUgZG9jdW1lbnQgc3RhdGUnKTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHZpc2libGVTdGF0ZS5sb25ndGVybVRyYWNrZXIuZ2V0KCkpO1xuXHRcdGNvbnN0IGZpcnN0V2luZG93ZWRUcmFja2VyID0gdmlzaWJsZVN0YXRlLndpbmRvd2VkVHJhY2tlci5nZXQoKTtcblx0XHRhc3NlcnQub2soZmlyc3RXaW5kb3dlZFRyYWNrZXIpO1xuXHRcdGFzc2VydC5vayh2aXNpYmxlU3RhdGUud2luZG93ZWRGb2N1c1RyYWNrZXIuZ2V0KCkpO1xuXG5cdFx0dmlzaWJsZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgaGlkZGVuU3RhdGUgPSBjb250ZXh0LmltcGwuZG9jc1N0YXRlLmdldCgpLmdldChjb250ZXh0LmRvY3VtZW50KTtcblx0XHRpZiAoIWhpZGRlblN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGhpZGRlbiBkb2N1bWVudCBzdGF0ZScpO1xuXHRcdH1cblx0XHRhc3NlcnQub2soaGlkZGVuU3RhdGUubG9uZ3Rlcm1UcmFja2VyLmdldCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlkZGVuU3RhdGUud2luZG93ZWRUcmFja2VyLmdldCgpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaWRkZW5TdGF0ZS53aW5kb3dlZEZvY3VzVHJhY2tlci5nZXQoKSwgdW5kZWZpbmVkKTtcblxuXHRcdHZpc2libGUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdmlzaWJsZUFnYWluU3RhdGUgPSBjb250ZXh0LmltcGwuZG9jc1N0YXRlLmdldCgpLmdldChjb250ZXh0LmRvY3VtZW50KTtcblx0XHRpZiAoIXZpc2libGVBZ2FpblN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIHZpc2libGUgZG9jdW1lbnQgc3RhdGUgYWZ0ZXIgcmVvcGVuaW5nJyk7XG5cdFx0fVxuXHRcdGFzc2VydC5vayh2aXNpYmxlQWdhaW5TdGF0ZS53aW5kb3dlZFRyYWNrZXIuZ2V0KCkpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh2aXNpYmxlQWdhaW5TdGF0ZS53aW5kb3dlZFRyYWNrZXIuZ2V0KCksIGZpcnN0V2luZG93ZWRUcmFja2VyKTtcblxuXHRcdGNvbnRleHQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnY29vcmRpbmF0ZXMgbG9uZy10ZXJtIHRvdGFscyB3aXRoIEFnZW50IEhvc3QgYXR0cmlidXRpb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21taXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKF9yZXNvdXJjZSwgdHJpZ2dlciwgc3RhdHNVdWlkLCBpc0RpcnR5KSA9PiBpc0RpcnR5IHx8IHRyaWdnZXIgIT09ICdoYXNoQ2hhbmdlJyA/IHVuZGVmaW5lZCA6ICh7XG5cdFx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAzLFxuXHRcdFx0XHRjb21taXQ6IGFzeW5jIHRvdGFsTW9kaWZpZWRDb3VudCA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRzVXVpZCwgJ3N0YXRzLTInKTtcblx0XHRcdFx0XHRjb21taXRzLnB1c2godG90YWxNb2RpZmllZENvdW50KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZXRhaWxzOiBjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdHN0YXRzVXVpZDogZXZlbnQuc3RhdHNVdWlkLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdH0pKSxcblx0XHRcdHN0YXRzOiBjb250ZXh0LnN0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRzdGF0c1V1aWQ6IGV2ZW50LnN0YXRzVXVpZCxcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IGV2ZW50Lm90aGVyQUlNb2RpZmllZENvdW50LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHR9KSksXG5cdFx0XHRjb21taXRzLFxuXHRcdH0sIHtcblx0XHRcdGRldGFpbHM6IFt7XG5cdFx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTInLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiA1LFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IDgsXG5cdFx0XHR9XSxcblx0XHRcdHN0YXRzOiBbe1xuXHRcdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0yJyxcblx0XHRcdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IDgsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiA4LFxuXHRcdFx0fV0sXG5cdFx0XHRjb21taXRzOiBbOF0sXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlY29tcHV0ZXMgd29ya2JlbmNoIHRvdGFscyBhZnRlciBhIGxhdGUgQWdlbnQgbWFya2VyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25EaWRTdXBwcmVzcyA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0XHRjb25zdCBwcmVwYXJlU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjb250aW51ZVByZXBhcmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IHN1cHByZXNzZWQgPSBmYWxzZTtcblx0XHRjb25zdCBjb21taXR0ZWRUb3RhbHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IG9uRGlkU3VwcHJlc3MuZXZlbnQsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gc3VwcHJlc3NlZCxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jIChfcmVzb3VyY2UsIHRyaWdnZXIpID0+IHtcblx0XHRcdFx0aWYgKHRyaWdnZXIgIT09ICdoYXNoQ2hhbmdlJykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJlcGFyZVN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgY29udGludWVQcmVwYXJlLnA7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMyxcblx0XHRcdFx0XHRjb21taXQ6IGFzeW5jIHRvdGFsTW9kaWZpZWRDb3VudCA9PiB7XG5cdFx0XHRcdFx0XHRjb21taXR0ZWRUb3RhbHMucHVzaCh0b3RhbE1vZGlmaWVkQ291bnQpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5hZGQob25EaWRTdXBwcmVzcyk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnZXh0ZXJuYWwnLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBwcmVwYXJlU3RhcnRlZC5wO1xuXHRcdHN1cHByZXNzZWQgPSB0cnVlO1xuXHRcdG9uRGlkU3VwcHJlc3MuZmlyZSgnb2JzZXJ2YXRpb24nKTtcblx0XHRjb250aW51ZVByZXBhcmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWl0dGVkVG90YWxzLFxuXHRcdFx0c3RhdHM6IGNvbnRleHQuc3RhdHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBldmVudC5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBldmVudC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBldmVudC50b3RhbE1vZGlmaWVkQ2hhcmFjdGVycyxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRjb21taXR0ZWRUb3RhbHM6IFszXSxcblx0XHRcdHN0YXRzOiBbe1xuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogMyxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiAwLFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogMyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkZWZlcnMgQWdlbnQgSG9zdCBhdHRyaWJ1dGlvbiB3aGlsZSB0aGUgbW9kZWwgaXMgZGlydHknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXJ0eVN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoX3Jlc291cmNlLCB0cmlnZ2VyLCBfc3RhdHNVdWlkLCBpc0RpcnR5KSA9PiB7XG5cdFx0XHRcdGlmICh0cmlnZ2VyID09PSAnaGFzaENoYW5nZScpIHtcblx0XHRcdFx0XHRkaXJ0eVN0YXRlcy5wdXNoKGlzRGlydHkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSwgdHJ1ZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXJ0eVN0YXRlcyxcblx0XHRcdGRldGFpbHM6IGNvbnRleHQuZGV0YWlscy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdFx0bW9kaWZpZWRDb3VudDogZXZlbnQubW9kaWZpZWRDb3VudCxcblx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBldmVudC50b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0ZGlydHlTdGF0ZXM6IFt0cnVlXSxcblx0XHRcdGRldGFpbHM6IFt7XG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IDUsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogNSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmYWxsIGJhY2sgbWF0Y2hlZCBBZ2VudCBlZGl0cyB3aGlsZSB0aGUgbW9kZWwgaXMgZGlydHknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSwgdHJ1ZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnZXh0ZXJuYWwnLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsQ291bnQ6IGNvbnRleHQuZGV0YWlscy5sZW5ndGgsXG5cdFx0XHRzdGF0c0NvdW50OiBjb250ZXh0LnN0YXRzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRkZXRhaWxDb3VudDogMCxcblx0XHRcdHN0YXRzQ291bnQ6IDAsXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2tlZXBzIHVubWF0Y2hlZCByZWxvYWRzIGFzIHN0YW5kYXJkIGV4dGVybmFsIHRlbGVtZXRyeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBvYnNlcnZhdGlvbiA9IDA7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+IGBvYnNlcnZhdGlvbi0keysrb2JzZXJ2YXRpb259YCxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2FscGhhJywgY2hhdEVkaXQoJ3JlcXVlc3QtMScpKSk7XG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnYWxwaGEnKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZUtleXM6IGNvbnRleHQuZGV0YWlscy5tYXAoZXZlbnQgPT4gZXZlbnQuc291cmNlS2V5KS5zb3J0KCksXG5cdFx0XHRoYXNJbnRlcm5hbE9ic2VydmF0aW9uS2V5OiBjb250ZXh0LmRldGFpbHMuc29tZShldmVudCA9PiBldmVudC5zb3VyY2VLZXkuc3RhcnRzV2l0aCgnZXh0ZXJuYWwtb2JzZXJ2YXRpb246JykpLFxuXHRcdH0sIHtcblx0XHRcdHNvdXJjZUtleXM6IFsnc291cmNlOkNoYXQuYXBwbHlFZGl0cycsICdzb3VyY2U6cmVsb2FkRnJvbURpc2snXSxcblx0XHRcdGhhc0ludGVybmFsT2JzZXJ2YXRpb25LZXk6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXBvcnRzIHBhcnRpYWwgQWdlbnQgSG9zdCBjb3ZlcmFnZSB3aXRob3V0IGRyb3BwaW5nIHdvcmtiZW5jaCBhdHRyaWJ1dGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHRha2VDb3ZlcmFnZUdhcDogKCkgPT4gKHtcblx0XHRcdFx0ZWRpdENvdW50OiAxLFxuXHRcdFx0XHRpbnNlcnRlZENvdW50OiA0Mixcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdhbHBoYScsIGNoYXRFZGl0KCdyZXF1ZXN0LTEnKSkpO1xuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2FscGhhJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LnN0YXRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBldmVudC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogZXZlbnQudG90YWxNb2RpZmllZENoYXJhY3RlcnMsXG5cdFx0XHRhZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlOiBldmVudC5hZ2VudEhvc3RBdHRyaWJ1dGlvbkNvdmVyYWdlLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiBldmVudC5hZ2VudEhvc3RVbnRyYWNrZWRFZGl0Q291bnQsXG5cdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50OiBldmVudC5hZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdGV4dGVybmFsTW9kaWZpZWRDb3VudDogOCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiA4LFxuXHRcdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZTogJ3BhcnRpYWwnLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50OiAxLFxuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudDogNDIsXG5cdFx0fV0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdlbWl0cyB3b3JrYmVuY2ggdGVsZW1ldHJ5IHdoZW4gQWdlbnQgSG9zdCBjb29yZGluYXRpb24gZmFpbHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5tb2RpZmllZENvdW50LFxuXHRcdFx0dG90YWxNb2RpZmllZENvdW50OiBldmVudC50b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0bW9kaWZpZWRDb3VudDogNSxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogNSxcblx0XHR9XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZXh0ZXJuYWwgdGVsZW1ldHJ5IHdoZW4gYSBtYXRjaGVkIEFnZW50IGZsdXNoIGNhbm5vdCBwcmVwYXJlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0cmVsZWFzZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0XHRwcmVwYXJlRmx1c2g6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udGV4dCA9IHNldHVwKHVuZGVmaW5lZCwgbWFya2VyU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdoZWxsbycpLCAnYWxwaGEnLCBjaGF0RWRpdCgncmVxdWVzdC0xJykpKTtcblx0XHRjb250ZXh0LmRvY3VtZW50LmFwcGx5RWRpdChTdHJpbmdFZGl0V2l0aFJlYXNvbi5yZXBsYWNlKGNvbnRleHQuZG9jdW1lbnQuZmluZFJhbmdlKCdhbHBoYScpLCAnZXh0ZXJuYWwnLCBFZGl0U291cmNlcy5yZWxvYWRGcm9tRGlzaygpKSk7XG5cdFx0YXdhaXQgdGltZW91dCgxNTAwKTtcblx0XHRjb250ZXh0LmhlYWRIYXNoLnNldCgnaGFzaC0yJywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dC5kZXRhaWxzLm1hcChldmVudCA9PiBldmVudC5zb3VyY2VLZXkpLnNvcnQoKSwgW1xuXHRcdFx0J3NvdXJjZTpDaGF0LmFwcGx5RWRpdHMnLFxuXHRcdFx0J3NvdXJjZTpyZWxvYWRGcm9tRGlzaycsXG5cdFx0XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYSBtYXRjaGVkIGluaXRpYWwgZXh0ZXJuYWwgZWRpdCB3aGVuIEFnZW50IEhvc3QgaXMgdW5hdmFpbGFibGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgdW5hdmFpbGFibGUnKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuZG9jdW1lbnQuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoY29udGV4dC5kb2N1bWVudC5maW5kUmFuZ2UoJ2hlbGxvJyksICdleHRlcm5hbCcsIEVkaXRTb3VyY2VzLnJlbG9hZEZyb21EaXNrKCkpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDE1MDApO1xuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0LmRldGFpbHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRzb3VyY2VLZXk6IGV2ZW50LnNvdXJjZUtleSxcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IGV2ZW50LnRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHR9KSksIFt7XG5cdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6cmVsb2FkRnJvbURpc2snLFxuXHRcdFx0bW9kaWZpZWRDb3VudDogOCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogOCxcblx0XHR9XSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB3aGVuIEFnZW50IEhvc3QgYXR0cmlidXRpb24gaXMgZGVmZXJyZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVDb3JyZWxhdGlvbjogKCkgPT4gKHtcblx0XHRcdFx0b25EaWRTdXBwcmVzczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRJbnZhbGlkYXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZWdpc3RlcjogKCkgPT4gJ29ic2VydmF0aW9uJyxcblx0XHRcdFx0aXNTdXBwcmVzc2VkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZWxlYXNlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHByZXBhcmVGbHVzaDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvcihuZXcgRXJyb3IoJ1ByZXBhcmUgY2FuY2VsbGVkJykpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRldGFpbENvdW50OiBjb250ZXh0LmRldGFpbHMubGVuZ3RoLFxuXHRcdFx0c3RhdHNDb3VudDogY29udGV4dC5zdGF0cy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsQ291bnQ6IDAsXG5cdFx0XHRzdGF0c0NvdW50OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IGV4dGVybmFsIGZhbGxiYWNrIHdoZW4gdGhlIEFnZW50IEhvc3QgY29tbWl0IG91dGNvbWUgaXMgdW5rbm93bicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtlclNlcnZpY2U6IElBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUNvcnJlbGF0aW9uOiAoKSA9PiAoe1xuXHRcdFx0XHRvbkRpZFN1cHByZXNzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEludmFsaWRhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJlZ2lzdGVyOiAoKSA9PiAnb2JzZXJ2YXRpb24nLFxuXHRcdFx0XHRpc1N1cHByZXNzZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMyxcblx0XHRcdFx0Y29tbWl0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3IobmV3IEVycm9yKCdUcmFuc3BvcnQgdW5hdmFpbGFibGUnKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRleHQgPSBzZXR1cCh1bmRlZmluZWQsIG1hcmtlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0Y29udGV4dC5kb2N1bWVudC5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShjb250ZXh0LmRvY3VtZW50LmZpbmRSYW5nZSgnaGVsbG8nKSwgJ2V4dGVybmFsJywgRWRpdFNvdXJjZXMucmVsb2FkRnJvbURpc2soKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTUwMCk7XG5cdFx0Y29udGV4dC5oZWFkSGFzaC5zZXQoJ2hhc2gtMicsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRldGFpbENvdW50OiBjb250ZXh0LmRldGFpbHMubGVuZ3RoLFxuXHRcdFx0c3RhdHM6IGNvbnRleHQuc3RhdHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBldmVudC5vdGhlckFJTW9kaWZpZWRDb3VudCxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBldmVudC5leHRlcm5hbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzOiBldmVudC50b3RhbE1vZGlmaWVkQ2hhcmFjdGVycyxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRkZXRhaWxDb3VudDogMCxcblx0XHRcdHN0YXRzOiBbe1xuXHRcdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogMyxcblx0XHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiAwLFxuXHRcdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogMyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29udGV4dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjb21taXRzIHplcm8tcmV0ZW50aW9uIEFnZW50IEhvc3Qgd2luZG93cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1pdHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgbWFya2VyU2VydmljZTogSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlQ29ycmVsYXRpb246ICgpID0+ICh7XG5cdFx0XHRcdG9uRGlkU3VwcHJlc3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkSW52YWxpZGF0ZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmVnaXN0ZXI6ICgpID0+ICdvYnNlcnZhdGlvbicsXG5cdFx0XHRcdGlzU3VwcHJlc3NlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdHJlbGVhc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoX3Jlc291cmNlLCB0cmlnZ2VyKSA9PiB0cmlnZ2VyID09PSAnaGFzaENoYW5nZScgPyAoe1xuXHRcdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMCxcblx0XHRcdFx0Y29tbWl0OiBhc3luYyB0b3RhbE1vZGlmaWVkQ291bnQgPT4ge1xuXHRcdFx0XHRcdGNvbW1pdHMucHVzaCh0b3RhbE1vZGlmaWVkQ291bnQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gc2V0dXAodW5kZWZpbmVkLCBtYXJrZXJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnRleHQuaGVhZEhhc2guc2V0KCdoYXNoLTInLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21taXRzLFxuXHRcdFx0ZGV0YWlsQ291bnQ6IGNvbnRleHQuZGV0YWlscy5sZW5ndGgsXG5cdFx0XHRzdGF0c0NvdW50OiBjb250ZXh0LnN0YXRzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRjb21taXRzOiBbMF0sXG5cdFx0XHRkZXRhaWxDb3VudDogMCxcblx0XHRcdHN0YXRzQ291bnQ6IDAsXG5cdFx0fSk7XG5cblx0XHRjb250ZXh0LmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSkpO1xufSk7XG5cbmZ1bmN0aW9uIHNldHVwKFxuXHR2aXNpYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKCd2aXNpYmxlJywgdHJ1ZSksXG5cdG1hcmtlclNlcnZpY2U/OiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UsXG5cdGRpcnR5ID0gZmFsc2UsXG4pIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGhlYWRIYXNoID0gb2JzZXJ2YWJsZVZhbHVlKCdoZWFkSGFzaCcsICdoYXNoLTEnKTtcblx0Y29uc3QgYnJhbmNoID0gb2JzZXJ2YWJsZVZhbHVlKCdicmFuY2gnLCAnbWFpbicpO1xuXHRjb25zdCByZXBvID0ge1xuXHRcdGhlYWRDb21taXRIYXNoT2JzOiBoZWFkSGFzaCxcblx0XHRoZWFkQnJhbmNoTmFtZU9iczogYnJhbmNoLFxuXHRcdGlzSWdub3JlZDogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdH0gc2F0aXNmaWVzIElTY21SZXBvQWRhcHRlcjtcblx0Y29uc3QgZGV0YWlsczogQXJyYXk8eyBzb3VyY2VLZXk6IHN0cmluZzsgdHJpZ2dlcjogc3RyaW5nOyByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgc3RhdHNVdWlkOiBzdHJpbmc7IG1vZGlmaWVkQ291bnQ6IG51bWJlcjsgZGVsdGFNb2RpZmllZENvdW50OiBudW1iZXI7IHRvdGFsTW9kaWZpZWRDb3VudDogbnVtYmVyIH0+ID0gW107XG5cdGNvbnN0IHN0YXRzOiBBcnJheTx7XG5cdFx0c3RhdHNVdWlkOiBzdHJpbmc7XG5cdFx0b3RoZXJBSU1vZGlmaWVkQ291bnQ6IG51bWJlcjtcblx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IG51bWJlcjtcblx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogbnVtYmVyO1xuXHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U/OiAnY29tcGxldGUnIHwgJ3BhcnRpYWwnO1xuXHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudD86IG51bWJlcjtcblx0XHRhZ2VudEhvc3RVbnRyYWNrZWRJbnNlcnRlZENvdW50PzogbnVtYmVyO1xuXHR9PiA9IFtdO1xuXHRsZXQgdXVpZCA9IDA7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UobmV3IFNlcnZpY2VDb2xsZWN0aW9uKCksIGZhbHNlLCB1bmRlZmluZWQsIHRydWUpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRjb25zdCBldmVudERhdGEgPSBkYXRhIGFzIHsgbW9kZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGV2ZW50TmFtZSA9PT0gJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlscycgJiYgZXZlbnREYXRhPy5tb2RlID09PSAnbG9uZ3Rlcm0nKSB7XG5cdFx0XHRcdGRldGFpbHMucHVzaChkYXRhIGFzIHR5cGVvZiBkZXRhaWxzW251bWJlcl0pO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudE5hbWUgPT09ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLnN0YXRzJyAmJiBldmVudERhdGE/Lm1vZGUgPT09ICdsb25ndGVybScpIHtcblx0XHRcdFx0c3RhdHMucHVzaChkYXRhIGFzIHR5cGVvZiBzdGF0c1tudW1iZXJdKTtcblx0XHRcdH1cblx0XHR9LFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKERpZmZTZXJ2aWNlLCB7IGNvbXB1dGVEaWZmOiBhc3luYyAob3JpZ2luYWwsIG1vZGlmaWVkKSA9PiBjb21wdXRlU3RyaW5nRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIHsgbWF4Q29tcHV0YXRpb25UaW1lTXM6IDUwMCB9LCAnYWR2YW5jZWQnKSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFNjbUFkYXB0ZXIsIHsgZ2V0UmVwbzogKCkgPT4gcmVwbyB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFVyaVZpc2liaWxpdHlQcm92aWRlciwgeyBpc1Zpc2libGU6IChfdXJpLCByZWFkZXIpID0+IHZpc2libGUucmVhZChyZWFkZXIpIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSYW5kb21TZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGdlbmVyYXRlVXVpZDogKCkgPT4gYHN0YXRzLSR7Kyt1dWlkfWAsXG5cdFx0Z2VuZXJhdGVQcmVmaXhlZFV1aWQ6IG5hbWVzcGFjZSA9PiBgJHtuYW1lc3BhY2V9LSR7Kyt1dWlkfWAsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyQXR0ZW50aW9uU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRpc1ZzQ29kZUZvY3VzZWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRpc1VzZXJBY3RpdmU6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRoYXNVc2VyQXR0ZW50aW9uOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0dG90YWxGb2N1c1RpbWVNczogMCxcblx0XHRmaXJlQWZ0ZXJHaXZlbkZvY3VzVGltZVBhc3NlZDogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dEZpbGVTZXJ2aWNlLCB7IGlzRGlydHk6ICgpID0+IGRpcnR5IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGNyZWF0ZVN1Z2dlc3Rpb25JZDogKCkgPT4gRWRpdFN1Z2dlc3Rpb25JZC5uZXdJZCgoKSA9PiAnc2d0LXRlc3QnKSxcblx0XHRoYW5kbGVDb2RlQWNjZXB0ZWQ6ICgpID0+IHsgfSxcblx0XHRoYW5kbGVDb2RlUmVqZWN0ZWQ6ICgpID0+IHsgfSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRjb25zdCB3b3Jrc3BhY2UgPSBuZXcgTXV0YWJsZU9ic2VydmFibGVXb3Jrc3BhY2UoKTtcblx0Y29uc3QgYW5ub3RhdGVkRG9jdW1lbnRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBbm5vdGF0ZWREb2N1bWVudHMod29ya3NwYWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRjb25zdCBpbXBsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0U291cmNlVHJhY2tpbmdJbXBsKGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSwgYW5ub3RhdGVkRG9jdW1lbnRzLCBtYXJrZXJTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRjb25zdCBkb2N1bWVudCA9IGRpc3Bvc2FibGVzLmFkZCh3b3Jrc3BhY2UuY3JlYXRlRG9jdW1lbnQoe1xuXHRcdHVyaTogVVJJLmZpbGUoJ0M6XFxcXHJlcG9cXFxcZmlsZS50cycpLFxuXHRcdGluaXRpYWxWYWx1ZTogJ2hlbGxvJyxcblx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdH0pKTtcblxuXHRyZXR1cm4geyBkaXNwb3NhYmxlcywgZG9jdW1lbnQsIGRldGFpbHMsIHN0YXRzLCBoZWFkSGFzaCwgYnJhbmNoLCBpbXBsIH07XG59XG5cbmZ1bmN0aW9uIGNoYXRFZGl0KHJlcXVlc3RJZDogc3RyaW5nKSB7XG5cdHJldHVybiBFZGl0U291cmNlcy5jaGF0QXBwbHlFZGl0cyh7XG5cdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0cmVxdWVzdElkLFxuXHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHRtb2RlOiAnYWdlbnQnLFxuXHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0Y29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFzQyx1QkFBdUI7QUFDdEUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYSx3QkFBd0I7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
