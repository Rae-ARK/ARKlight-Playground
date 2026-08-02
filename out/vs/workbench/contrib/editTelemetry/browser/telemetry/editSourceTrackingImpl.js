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
import { reverseOrder, compareBy, numberComparator, sumBy } from "../../../../../base/common/arrays.js";
import { IntervalTimer } from "../../../../../base/common/async.js";
import { toDisposable, Disposable } from "../../../../../base/common/lifecycle.js";
import { mapObservableArrayCached, derived, observableSignal, runOnChange, autorun } from "../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { sendEditSourcesDetailsTelemetry } from "../../../../../platform/telemetry/common/editTelemetry.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { CreateSuggestionIdForChatOrInlineChatCaller, EditTelemetryReportEditArcForChatOrInlineChatSender, EditTelemetryReportInlineEditArcSender } from "./arcTelemetrySender.js";
import { createDocWithJustReason } from "../helpers/documentWithAnnotatedEdits.js";
import { DocumentEditSourceTracker } from "./editTracker.js";
import { sumByCategory } from "../helpers/utils.js";
import { ScmAdapter } from "./scmAdapter.js";
import { IRandomService } from "../randomService.js";
import { AgentHostEditAttributionDeferredError, AgentHostEditAttributionUnknownOutcomeError } from "./agentHostEditMarkerService.js";
function getEditTelemetryCategory(source) {
  if (source.category === "ai" && source.kind === "nes") {
    return "nes";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot") {
    return "inlineCompletionsCopilot";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot-chat" && source.providerId === "nes") {
    return "inlineCompletionsNES";
  }
  if (source.category === "ai" && source.kind === "completion" && source.extensionId === "github.copilot-chat" && source.providerId === "completions") {
    return "inlineCompletionsCopilot";
  }
  if (source.category === "ai" && source.kind === "completion") {
    return "inlineCompletionsOther";
  }
  if (source.category === "ai") {
    return "otherAI";
  }
  if (source.category === "user") {
    return "user";
  }
  if (source.category === "ide") {
    return "ide";
  }
  if (source.category === "external") {
    return "external";
  }
  return "unknown";
}
let EditSourceTrackingImpl = class extends Disposable {
  constructor(_statsEnabled, _annotatedDocuments, _agentHostEditMarkerService, _instantiationService) {
    super();
    this._statsEnabled = _statsEnabled;
    this._annotatedDocuments = _annotatedDocuments;
    this._agentHostEditMarkerService = _agentHostEditMarkerService;
    this._instantiationService = _instantiationService;
    const scmBridge = this._instantiationService.createInstance(ScmAdapter);
    this._states = mapObservableArrayCached(this, this._annotatedDocuments.documents, (doc, store) => {
      return [doc.document, store.add(this._instantiationService.createInstance(TrackedDocumentInfo, doc, scmBridge, this._statsEnabled, this._agentHostEditMarkerService))];
    });
    this.docsState = this._states.map((entries) => new Map(entries));
    this.docsState.recomputeInitiallyAndOnChange(this._store);
  }
};
EditSourceTrackingImpl = __decorateClass([
  __decorateParam(3, IInstantiationService)
], EditSourceTrackingImpl);
let TrackedDocumentInfo = class extends Disposable {
  constructor(_doc, _scm, _statsEnabled, _agentHostEditMarkerService, _instantiationService, _telemetryService, _randomService, _userAttentionService, _textFileService, _logService) {
    super();
    this._doc = _doc;
    this._scm = _scm;
    this._statsEnabled = _statsEnabled;
    this._agentHostEditMarkerService = _agentHostEditMarkerService;
    this._instantiationService = _instantiationService;
    this._telemetryService = _telemetryService;
    this._randomService = _randomService;
    this._userAttentionService = _userAttentionService;
    this._textFileService = _textFileService;
    this._logService = _logService;
    this._repo = derived(this, (reader) => this._scm.getRepo(_doc.document.uri, reader));
    const docWithJustReason = createDocWithJustReason(_doc.documentWithAnnotations, this._store);
    const externalEditCorrelation = this._agentHostEditMarkerService?.createCorrelation(_doc.document.uri);
    const longtermResetSignal = observableSignal("resetSignal");
    let longtermReason = "closed";
    this.longtermTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      longtermResetSignal.read(reader);
      const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, void 0, externalEditCorrelation));
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(() => {
        this._sendTelemetryAndLog("longterm", longtermReason, t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
        t.dispose();
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
    this._store.add(new IntervalTimer()).cancelAndSet(() => {
      longtermReason = "10hours";
      longtermResetSignal.trigger(void 0);
      longtermReason = "closed";
    }, 10 * 60 * 60 * 1e3);
    this._store.add(autorun((reader) => {
      const repo = this._repo.read(reader);
      if (repo) {
        reader.store.add(runOnChange(repo.headCommitHashObs, () => {
          longtermReason = "hashChange";
          longtermResetSignal.trigger(void 0);
          longtermReason = "closed";
        }));
        reader.store.add(runOnChange(repo.headBranchNameObs, () => {
          longtermReason = "branchChange";
          longtermResetSignal.trigger(void 0);
          longtermReason = "closed";
        }));
      }
    }));
    this._store.add(this._instantiationService.createInstance(EditTelemetryReportInlineEditArcSender, _doc.documentWithAnnotations, this._repo));
    this._store.add(this._instantiationService.createInstance(EditTelemetryReportEditArcForChatOrInlineChatSender, _doc.documentWithAnnotations, this._repo));
    this._store.add(this._instantiationService.createInstance(CreateSuggestionIdForChatOrInlineChatCaller, _doc.documentWithAnnotations));
    const resetSignal = observableSignal("resetSignal");
    this.windowedTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      if (!this._doc.isVisible.read(reader)) {
        return void 0;
      }
      resetSignal.read(reader);
      reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(10 * 60 * 1e3, () => {
        resetSignal.trigger(void 0);
      }));
      const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, void 0));
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(async () => {
        this._sendTelemetryAndLog("10minFocusWindow", "time", t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
        t.dispose();
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
    const focusResetSignal = observableSignal("focusResetSignal");
    this.windowedFocusTracker = derived((reader) => {
      if (!this._statsEnabled.read(reader)) {
        return void 0;
      }
      if (!this._doc.isVisible.read(reader)) {
        return void 0;
      }
      focusResetSignal.read(reader);
      reader.store.add(this._userAttentionService.fireAfterGivenFocusTimePassed(20 * 60 * 1e3, () => {
        focusResetSignal.trigger(void 0);
      }));
      const t = reader.store.add(new DocumentEditSourceTracker(docWithJustReason, void 0));
      const startFocusTime = this._userAttentionService.totalFocusTimeMs;
      const startTime = Date.now();
      reader.store.add(toDisposable(async () => {
        this._sendTelemetryAndLog("20minFocusWindow", "time", t, this._userAttentionService.totalFocusTimeMs - startFocusTime, Date.now() - startTime);
        t.dispose();
      }));
      return t;
    }).recomputeInitiallyAndOnChange(this._store);
  }
  _sendTelemetryAndLog(mode, trigger, tracker, focusTime, actualTime) {
    void this.sendTelemetry(mode, trigger, tracker, focusTime, actualTime).catch((error) => {
      this._logService.error(`[EditSourceTrackingImpl] Failed to send ${mode} edit telemetry: ${error}`);
    }).finally(() => {
      tracker.releaseExternalEditCorrelations();
    });
  }
  async sendTelemetry(mode, trigger, t, focusTime, actualTime) {
    const coverageGap = mode === "longterm" ? this._agentHostEditMarkerService?.takeCoverageGap?.(this._doc.document.uri) : void 0;
    t.applyPendingExternalEdits();
    let ranges = t.getTrackedRanges();
    let internalKeys = t.getAllKeys();
    let data = this.getTelemetryData(ranges);
    const statsUuid = this._randomService.generateUuid();
    let preparedAgentFlush;
    let deferSuppressedExternal = false;
    const isDirty = this._textFileService.isDirty(this._doc.document.uri);
    if (mode === "longterm" && this._agentHostEditMarkerService) {
      try {
        preparedAgentFlush = await this._agentHostEditMarkerService.prepareFlush(
          this._doc.document.uri,
          trigger,
          statsUuid,
          isDirty,
          this._doc.document.languageId.get()
        );
      } catch (error) {
        this._logService.error(`[EditSourceTrackingImpl] Failed to prepare Agent Host edit attribution: ${error}`);
        deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
      }
    }
    if (preparedAgentFlush) {
      t.applyPendingExternalEdits();
      ranges = t.getTrackedRanges();
      internalKeys = t.getAllKeys();
      data = this.getTelemetryData(ranges);
      try {
        await preparedAgentFlush.commit(data.totalModifiedCharactersInFinalState + preparedAgentFlush.agentModifiedCount);
      } catch (error) {
        this._logService.error(`[EditSourceTrackingImpl] Failed to commit Agent Host edit attribution: ${error}`);
        if (!(error instanceof AgentHostEditAttributionUnknownOutcomeError)) {
          preparedAgentFlush = void 0;
        }
        deferSuppressedExternal = error instanceof AgentHostEditAttributionDeferredError || error instanceof AgentHostEditAttributionUnknownOutcomeError;
      }
    }
    const includeSuppressedExternal = !preparedAgentFlush && !deferSuppressedExternal && !isDirty && mode === "longterm" && !!this._agentHostEditMarkerService;
    if (includeSuppressedExternal) {
      ranges = t.getTrackedRanges(void 0, true);
      internalKeys = t.getAllKeys(true);
      data = this.getTelemetryData(ranges);
    }
    const agentModifiedCount = preparedAgentFlush?.agentModifiedCount ?? 0;
    if (internalKeys.length === 0 && agentModifiedCount === 0 && !coverageGap) {
      return;
    }
    const totalModifiedCount = data.totalModifiedCharactersInFinalState + agentModifiedCount;
    const telemetryKeys = /* @__PURE__ */ new Map();
    for (const internalKey of internalKeys) {
      const representative = t.getRepresentative(internalKey);
      const telemetryKey = representative.toKey(1);
      const entry = telemetryKeys.get(telemetryKey) ?? {
        representative,
        modifiedCount: 0,
        deltaModifiedCount: 0
      };
      entry.deltaModifiedCount += t.getTotalInsertedCharactersCount(internalKey, includeSuppressedExternal);
      telemetryKeys.set(telemetryKey, entry);
    }
    for (const range of ranges) {
      const representative = t.getRepresentative(range.sourceKey);
      const entry = telemetryKeys.get(representative.toKey(1));
      if (entry) {
        entry.modifiedCount += range.range.length;
      }
    }
    const sums = Object.fromEntries(Array.from(telemetryKeys, ([key, value]) => [key, value.modifiedCount]));
    const entries = Object.entries(sums).filter((entry) => entry[1] !== void 0).sort(reverseOrder(compareBy(([, value]) => value, numberComparator))).slice(0, mode === "longterm" ? 30 : 10);
    for (const [key, value] of entries) {
      const telemetryEntry = telemetryKeys.get(key);
      const repr = telemetryEntry.representative;
      const deltaModifiedCount = telemetryEntry.deltaModifiedCount;
      sendEditSourcesDetailsTelemetry(this._telemetryService, {
        mode,
        sourceKey: key,
        sourceKeyCleaned: repr.toKey(1, { $extensionId: false, $extensionVersion: false, $modelId: false }),
        extensionId: repr.props.$extensionId,
        extensionVersion: repr.props.$extensionVersion,
        modelId: repr.props.$modelId,
        trigger,
        languageId: this._doc.document.languageId.get(),
        statsUuid,
        conversationId: repr.props.$$sessionId,
        requestId: repr.props.$$requestId,
        origin: void 0,
        harness: void 0,
        modifiedCount: value,
        deltaModifiedCount,
        totalModifiedCount
      });
    }
    const isTrackedByGit = await data.isTrackedByGit;
    this._telemetryService.publicLog2("editTelemetry.editSources.stats", {
      mode,
      languageId: this._doc.document.languageId.get(),
      statsUuid,
      nesModifiedCount: data.nesModifiedCount,
      inlineCompletionsCopilotModifiedCount: data.inlineCompletionsCopilotModifiedCount,
      inlineCompletionsNESModifiedCount: data.inlineCompletionsNESModifiedCount,
      otherAIModifiedCount: data.otherAIModifiedCount + agentModifiedCount,
      unknownModifiedCount: data.unknownModifiedCount,
      userModifiedCount: data.userModifiedCount,
      ideModifiedCount: data.ideModifiedCount,
      totalModifiedCharacters: totalModifiedCount,
      externalModifiedCount: data.externalModifiedCount,
      isTrackedByGit: isTrackedByGit ? 1 : 0,
      focusTime,
      actualTime,
      trigger,
      ...mode === "longterm" ? {
        agentHostAttributionCoverage: coverageGap ? "partial" : "complete",
        agentHostUntrackedEditCount: coverageGap?.editCount ?? 0,
        agentHostUntrackedInsertedCount: coverageGap?.insertedCount ?? 0
      } : {}
    });
  }
  getTelemetryData(ranges) {
    const sums = sumByCategory(ranges, (r) => r.range.length, (r) => getEditTelemetryCategory(r.source));
    const totalModifiedCharactersInFinalState = sumBy(ranges, (r) => r.range.length);
    return {
      nesModifiedCount: sums.nes ?? 0,
      inlineCompletionsCopilotModifiedCount: sums.inlineCompletionsCopilot ?? 0,
      inlineCompletionsNESModifiedCount: sums.inlineCompletionsNES ?? 0,
      otherAIModifiedCount: sums.otherAI ?? 0,
      userModifiedCount: sums.user ?? 0,
      ideModifiedCount: sums.ide ?? 0,
      unknownModifiedCount: sums.unknown ?? 0,
      externalModifiedCount: sums.external ?? 0,
      totalModifiedCharactersInFinalState,
      languageId: this._doc.document.languageId.get(),
      isTrackedByGit: this._repo.get()?.isIgnored(this._doc.document.uri)
    };
  }
};
TrackedDocumentInfo = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IRandomService),
  __decorateParam(7, IUserAttentionService),
  __decorateParam(8, ITextFileService),
  __decorateParam(9, ILogService)
], TrackedDocumentInfo);
export {
  EditSourceTrackingImpl,
  getEditTelemetryCategory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvZWRpdFNvdXJjZVRyYWNraW5nSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJldmVyc2VPcmRlciwgY29tcGFyZUJ5LCBudW1iZXJDb21wYXJhdG9yLCBzdW1CeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVTaWduYWwsIHJ1bk9uQ2hhbmdlLCBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRUZWxlbWV0cnlNb2RlLCBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc2VuZEVkaXRTb3VyY2VzRGV0YWlsc1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vZWRpdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJBdHRlbnRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckF0dGVudGlvbi9jb21tb24vdXNlckF0dGVudGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBbm5vdGF0ZWREb2N1bWVudCwgSUFubm90YXRlZERvY3VtZW50cyB9IGZyb20gJy4uL2hlbHBlcnMvYW5ub3RhdGVkRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IENyZWF0ZVN1Z2dlc3Rpb25JZEZvckNoYXRPcklubGluZUNoYXRDYWxsZXIsIEVkaXRUZWxlbWV0cnlSZXBvcnRFZGl0QXJjRm9yQ2hhdE9ySW5saW5lQ2hhdFNlbmRlciwgRWRpdFRlbGVtZXRyeVJlcG9ydElubGluZUVkaXRBcmNTZW5kZXIgfSBmcm9tICcuL2FyY1RlbGVtZXRyeVNlbmRlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEb2NXaXRoSnVzdFJlYXNvbiwgRWRpdFNvdXJjZSB9IGZyb20gJy4uL2hlbHBlcnMvZG9jdW1lbnRXaXRoQW5ub3RhdGVkRWRpdHMuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRFZGl0U291cmNlVHJhY2tlciwgVHJhY2tlZEVkaXQgfSBmcm9tICcuL2VkaXRUcmFja2VyLmpzJztcbmltcG9ydCB7IHN1bUJ5Q2F0ZWdvcnkgfSBmcm9tICcuLi9oZWxwZXJzL3V0aWxzLmpzJztcbmltcG9ydCB7IElTY21SZXBvQWRhcHRlciwgU2NtQWRhcHRlciB9IGZyb20gJy4vc2NtQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBJUmFuZG9tU2VydmljZSB9IGZyb20gJy4uL3JhbmRvbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciwgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uVW5rbm93bk91dGNvbWVFcnJvciwgSUFnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlLCBJUHJlcGFyZWRBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25GbHVzaCB9IGZyb20gJy4vYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UuanMnO1xuXG5leHBvcnQgdHlwZSBFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkgPSAnbmVzJyB8ICdpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3QnIHwgJ2lubGluZUNvbXBsZXRpb25zTkVTJyB8ICdpbmxpbmVDb21wbGV0aW9uc090aGVyJyB8ICdvdGhlckFJJyB8ICd1c2VyJyB8ICdpZGUnIHwgJ2V4dGVybmFsJyB8ICd1bmtub3duJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVkaXRUZWxlbWV0cnlDYXRlZ29yeShzb3VyY2U6IEVkaXRTb3VyY2UpOiBFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkge1xuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWknICYmIHNvdXJjZS5raW5kID09PSAnbmVzJykgeyByZXR1cm4gJ25lcyc7IH1cblxuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWknICYmIHNvdXJjZS5raW5kID09PSAnY29tcGxldGlvbicgJiYgc291cmNlLmV4dGVuc2lvbklkID09PSAnZ2l0aHViLmNvcGlsb3QnKSB7IHJldHVybiAnaW5saW5lQ29tcGxldGlvbnNDb3BpbG90JzsgfVxuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWknICYmIHNvdXJjZS5raW5kID09PSAnY29tcGxldGlvbicgJiYgc291cmNlLmV4dGVuc2lvbklkID09PSAnZ2l0aHViLmNvcGlsb3QtY2hhdCcgJiYgc291cmNlLnByb3ZpZGVySWQgPT09ICduZXMnKSB7IHJldHVybiAnaW5saW5lQ29tcGxldGlvbnNORVMnOyB9XG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdhaScgJiYgc291cmNlLmtpbmQgPT09ICdjb21wbGV0aW9uJyAmJiBzb3VyY2UuZXh0ZW5zaW9uSWQgPT09ICdnaXRodWIuY29waWxvdC1jaGF0JyAmJiBzb3VyY2UucHJvdmlkZXJJZCA9PT0gJ2NvbXBsZXRpb25zJykgeyByZXR1cm4gJ2lubGluZUNvbXBsZXRpb25zQ29waWxvdCc7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ2FpJyAmJiBzb3VyY2Uua2luZCA9PT0gJ2NvbXBsZXRpb24nKSB7IHJldHVybiAnaW5saW5lQ29tcGxldGlvbnNPdGhlcic7IH1cblxuXHRpZiAoc291cmNlLmNhdGVnb3J5ID09PSAnYWknKSB7IHJldHVybiAnb3RoZXJBSSc7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ3VzZXInKSB7IHJldHVybiAndXNlcic7IH1cblx0aWYgKHNvdXJjZS5jYXRlZ29yeSA9PT0gJ2lkZScpIHsgcmV0dXJuICdpZGUnOyB9XG5cdGlmIChzb3VyY2UuY2F0ZWdvcnkgPT09ICdleHRlcm5hbCcpIHsgcmV0dXJuICdleHRlcm5hbCc7IH1cblx0cmV0dXJuICd1bmtub3duJztcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRTb3VyY2VUcmFja2luZ0ltcGwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvY3NTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGVzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRzRW5hYmxlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYW5ub3RhdGVkRG9jdW1lbnRzOiBJQW5ub3RhdGVkRG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc2NtQnJpZGdlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2NtQWRhcHRlcik7XG5cdFx0dGhpcy5fc3RhdGVzID0gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkKHRoaXMsIHRoaXMuX2Fubm90YXRlZERvY3VtZW50cy5kb2N1bWVudHMsIChkb2MsIHN0b3JlKSA9PiB7XG5cdFx0XHRyZXR1cm4gW2RvYy5kb2N1bWVudCwgc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyYWNrZWREb2N1bWVudEluZm8sIGRvYywgc2NtQnJpZGdlLCB0aGlzLl9zdGF0c0VuYWJsZWQsIHRoaXMuX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlKSldIGFzIGNvbnN0O1xuXHRcdH0pO1xuXHRcdHRoaXMuZG9jc1N0YXRlID0gdGhpcy5fc3RhdGVzLm1hcCgoZW50cmllcykgPT4gbmV3IE1hcChlbnRyaWVzKSk7XG5cblx0XHR0aGlzLmRvY3NTdGF0ZS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cbn1cblxuY2xhc3MgVHJhY2tlZERvY3VtZW50SW5mbyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgbG9uZ3Rlcm1UcmFja2VyOiBJT2JzZXJ2YWJsZTxEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgd2luZG93ZWRUcmFja2VyOiBJT2JzZXJ2YWJsZTxEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyPHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgd2luZG93ZWRGb2N1c1RyYWNrZXI6IElPYnNlcnZhYmxlPERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXI8dW5kZWZpbmVkPiB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbzogSU9ic2VydmFibGU8SVNjbVJlcG9BZGFwdGVyIHwgdW5kZWZpbmVkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2M6IEFubm90YXRlZERvY3VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NjbTogU2NtQWRhcHRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0c0VuYWJsZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVJhbmRvbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmFuZG9tU2VydmljZTogSVJhbmRvbVNlcnZpY2UsXG5cdFx0QElVc2VyQXR0ZW50aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyQXR0ZW50aW9uU2VydmljZTogSVVzZXJBdHRlbnRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZXBvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fc2NtLmdldFJlcG8oX2RvYy5kb2N1bWVudC51cmksIHJlYWRlcikpO1xuXG5cdFx0Y29uc3QgZG9jV2l0aEp1c3RSZWFzb24gPSBjcmVhdGVEb2NXaXRoSnVzdFJlYXNvbihfZG9jLmRvY3VtZW50V2l0aEFubm90YXRpb25zLCB0aGlzLl9zdG9yZSk7XG5cdFx0Y29uc3QgZXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24gPSB0aGlzLl9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZT8uY3JlYXRlQ29ycmVsYXRpb24oX2RvYy5kb2N1bWVudC51cmkpO1xuXG5cdFx0Y29uc3QgbG9uZ3Rlcm1SZXNldFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwoJ3Jlc2V0U2lnbmFsJyk7XG5cblx0XHRsZXQgbG9uZ3Rlcm1SZWFzb246IEVkaXRUZWxlbWV0cnlUcmlnZ2VyID0gJ2Nsb3NlZCc7XG5cdFx0dGhpcy5sb25ndGVybVRyYWNrZXIgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3RhdHNFbmFibGVkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRsb25ndGVybVJlc2V0U2lnbmFsLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgdCA9IHJlYWRlci5zdG9yZS5hZGQobmV3IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIoZG9jV2l0aEp1c3RSZWFzb24sIHVuZGVmaW5lZCwgZXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24pKTtcblx0XHRcdGNvbnN0IHN0YXJ0Rm9jdXNUaW1lID0gdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcztcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdC8vIHNlbmQgbG9uZyB0ZXJtIGRvY3VtZW50IHRlbGVtZXRyeVxuXHRcdFx0XHR0aGlzLl9zZW5kVGVsZW1ldHJ5QW5kTG9nKCdsb25ndGVybScsIGxvbmd0ZXJtUmVhc29uLCB0LCB0aGlzLl91c2VyQXR0ZW50aW9uU2VydmljZS50b3RhbEZvY3VzVGltZU1zIC0gc3RhcnRGb2N1c1RpbWUsIERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0XHR0LmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybiB0O1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChuZXcgSW50ZXJ2YWxUaW1lcigpKS5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0Ly8gUmVzZXQgYWZ0ZXIgMTAgaG91cnNcblx0XHRcdGxvbmd0ZXJtUmVhc29uID0gJzEwaG91cnMnO1xuXHRcdFx0bG9uZ3Rlcm1SZXNldFNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHRsb25ndGVybVJlYXNvbiA9ICdjbG9zZWQnO1xuXHRcdH0sIDEwICogNjAgKiA2MCAqIDEwMDApO1xuXG5cdFx0Ly8gUmVzZXQgb24gYnJhbmNoIGNoYW5nZSBvciBjb21taXRcblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVwbyA9IHRoaXMuX3JlcG8ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHJlcG8pIHtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChydW5PbkNoYW5nZShyZXBvLmhlYWRDb21taXRIYXNoT2JzLCAoKSA9PiB7XG5cdFx0XHRcdFx0bG9uZ3Rlcm1SZWFzb24gPSAnaGFzaENoYW5nZSc7XG5cdFx0XHRcdFx0bG9uZ3Rlcm1SZXNldFNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0bG9uZ3Rlcm1SZWFzb24gPSAnY2xvc2VkJztcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKHJlcG8uaGVhZEJyYW5jaE5hbWVPYnMsICgpID0+IHtcblx0XHRcdFx0XHRsb25ndGVybVJlYXNvbiA9ICdicmFuY2hDaGFuZ2UnO1xuXHRcdFx0XHRcdGxvbmd0ZXJtUmVzZXRTaWduYWwudHJpZ2dlcih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGxvbmd0ZXJtUmVhc29uID0gJ2Nsb3NlZCc7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFRlbGVtZXRyeVJlcG9ydElubGluZUVkaXRBcmNTZW5kZXIsIF9kb2MuZG9jdW1lbnRXaXRoQW5ub3RhdGlvbnMsIHRoaXMuX3JlcG8pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFRlbGVtZXRyeVJlcG9ydEVkaXRBcmNGb3JDaGF0T3JJbmxpbmVDaGF0U2VuZGVyLCBfZG9jLmRvY3VtZW50V2l0aEFubm90YXRpb25zLCB0aGlzLl9yZXBvKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENyZWF0ZVN1Z2dlc3Rpb25JZEZvckNoYXRPcklubGluZUNoYXRDYWxsZXIsIF9kb2MuZG9jdW1lbnRXaXRoQW5ub3RhdGlvbnMpKTtcblxuXHRcdC8vIEZvY3VzIHRpbWUgYmFzZWQgMTAtbWludXRlIHdpbmRvdyB0cmFja2VyXG5cdFx0Y29uc3QgcmVzZXRTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKCdyZXNldFNpZ25hbCcpO1xuXG5cdFx0dGhpcy53aW5kb3dlZFRyYWNrZXIgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3RhdHNFbmFibGVkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGlmICghdGhpcy5fZG9jLmlzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJlc2V0U2lnbmFsLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gUmVzZXQgYWZ0ZXIgMTAgbWludXRlcyBvZiBhY2N1bXVsYXRlZCBmb2N1cyB0aW1lXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRoaXMuX3VzZXJBdHRlbnRpb25TZXJ2aWNlLmZpcmVBZnRlckdpdmVuRm9jdXNUaW1lUGFzc2VkKDEwICogNjAgKiAxMDAwLCAoKSA9PiB7XG5cdFx0XHRcdHJlc2V0U2lnbmFsLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgdCA9IHJlYWRlci5zdG9yZS5hZGQobmV3IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIoZG9jV2l0aEp1c3RSZWFzb24sIHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3Qgc3RhcnRGb2N1c1RpbWUgPSB0aGlzLl91c2VyQXR0ZW50aW9uU2VydmljZS50b3RhbEZvY3VzVGltZU1zO1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gc2VuZCB3aW5kb3dlZCBkb2N1bWVudCB0ZWxlbWV0cnlcblx0XHRcdFx0dGhpcy5fc2VuZFRlbGVtZXRyeUFuZExvZygnMTBtaW5Gb2N1c1dpbmRvdycsICd0aW1lJywgdCwgdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcyAtIHN0YXJ0Rm9jdXNUaW1lLCBEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcblx0XHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB0O1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdC8vIEZvY3VzIHRpbWUgYmFzZWQgMjAtbWludXRlIHdpbmRvdyB0cmFja2VyXG5cdFx0Y29uc3QgZm9jdXNSZXNldFNpZ25hbCA9IG9ic2VydmFibGVTaWduYWwoJ2ZvY3VzUmVzZXRTaWduYWwnKTtcblxuXHRcdHRoaXMud2luZG93ZWRGb2N1c1RyYWNrZXIgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3RhdHNFbmFibGVkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGlmICghdGhpcy5fZG9jLmlzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGZvY3VzUmVzZXRTaWduYWwucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBSZXNldCBhZnRlciAyMCBtaW51dGVzIG9mIGFjY3VtdWxhdGVkIGZvY3VzIHRpbWVcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UuZmlyZUFmdGVyR2l2ZW5Gb2N1c1RpbWVQYXNzZWQoMjAgKiA2MCAqIDEwMDAsICgpID0+IHtcblx0XHRcdFx0Zm9jdXNSZXNldFNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHQgPSByZWFkZXIuc3RvcmUuYWRkKG5ldyBEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyKGRvY1dpdGhKdXN0UmVhc29uLCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHN0YXJ0Rm9jdXNUaW1lID0gdGhpcy5fdXNlckF0dGVudGlvblNlcnZpY2UudG90YWxGb2N1c1RpbWVNcztcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIHNlbmQgZm9jdXMtd2luZG93ZWQgZG9jdW1lbnQgdGVsZW1ldHJ5XG5cdFx0XHRcdHRoaXMuX3NlbmRUZWxlbWV0cnlBbmRMb2coJzIwbWluRm9jdXNXaW5kb3cnLCAndGltZScsIHQsIHRoaXMuX3VzZXJBdHRlbnRpb25TZXJ2aWNlLnRvdGFsRm9jdXNUaW1lTXMgLSBzdGFydEZvY3VzVGltZSwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG5cdFx0XHRcdHQuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4gdDtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0fVxuXG5cdHByaXZhdGUgX3NlbmRUZWxlbWV0cnlBbmRMb2cobW9kZTogRWRpdFRlbGVtZXRyeU1vZGUsIHRyaWdnZXI6IEVkaXRUZWxlbWV0cnlUcmlnZ2VyLCB0cmFja2VyOiBEb2N1bWVudEVkaXRTb3VyY2VUcmFja2VyLCBmb2N1c1RpbWU6IG51bWJlciwgYWN0dWFsVGltZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dm9pZCB0aGlzLnNlbmRUZWxlbWV0cnkobW9kZSwgdHJpZ2dlciwgdHJhY2tlciwgZm9jdXNUaW1lLCBhY3R1YWxUaW1lKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbRWRpdFNvdXJjZVRyYWNraW5nSW1wbF0gRmFpbGVkIHRvIHNlbmQgJHttb2RlfSBlZGl0IHRlbGVtZXRyeTogJHtlcnJvcn1gKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRyYWNrZXIucmVsZWFzZUV4dGVybmFsRWRpdENvcnJlbGF0aW9ucygpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc2VuZFRlbGVtZXRyeShtb2RlOiBFZGl0VGVsZW1ldHJ5TW9kZSwgdHJpZ2dlcjogRWRpdFRlbGVtZXRyeVRyaWdnZXIsIHQ6IERvY3VtZW50RWRpdFNvdXJjZVRyYWNrZXIsIGZvY3VzVGltZTogbnVtYmVyLCBhY3R1YWxUaW1lOiBudW1iZXIpIHtcblx0XHRjb25zdCBjb3ZlcmFnZUdhcCA9IG1vZGUgPT09ICdsb25ndGVybScgPyB0aGlzLl9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZT8udGFrZUNvdmVyYWdlR2FwPy4odGhpcy5fZG9jLmRvY3VtZW50LnVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0dC5hcHBseVBlbmRpbmdFeHRlcm5hbEVkaXRzKCk7XG5cdFx0bGV0IHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcygpO1xuXHRcdGxldCBpbnRlcm5hbEtleXMgPSB0LmdldEFsbEtleXMoKTtcblx0XHRsZXQgZGF0YSA9IHRoaXMuZ2V0VGVsZW1ldHJ5RGF0YShyYW5nZXMpO1xuXHRcdGNvbnN0IHN0YXRzVXVpZCA9IHRoaXMuX3JhbmRvbVNlcnZpY2UuZ2VuZXJhdGVVdWlkKCk7XG5cdFx0bGV0IHByZXBhcmVkQWdlbnRGbHVzaDogSVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlZmVyU3VwcHJlc3NlZEV4dGVybmFsID0gZmFsc2U7XG5cdFx0Y29uc3QgaXNEaXJ0eSA9IHRoaXMuX3RleHRGaWxlU2VydmljZS5pc0RpcnR5KHRoaXMuX2RvYy5kb2N1bWVudC51cmkpO1xuXHRcdGlmIChtb2RlID09PSAnbG9uZ3Rlcm0nICYmIHRoaXMuX2FnZW50SG9zdEVkaXRNYXJrZXJTZXJ2aWNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcmVwYXJlZEFnZW50Rmx1c2ggPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZS5wcmVwYXJlRmx1c2goXG5cdFx0XHRcdFx0dGhpcy5fZG9jLmRvY3VtZW50LnVyaSxcblx0XHRcdFx0XHR0cmlnZ2VyLFxuXHRcdFx0XHRcdHN0YXRzVXVpZCxcblx0XHRcdFx0XHRpc0RpcnR5LFxuXHRcdFx0XHRcdHRoaXMuX2RvYy5kb2N1bWVudC5sYW5ndWFnZUlkLmdldCgpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0VkaXRTb3VyY2VUcmFja2luZ0ltcGxdIEZhaWxlZCB0byBwcmVwYXJlIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHRcdFx0ZGVmZXJTdXBwcmVzc2VkRXh0ZXJuYWwgPSBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IgfHwgZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHJlcGFyZWRBZ2VudEZsdXNoKSB7XG5cdFx0XHR0LmFwcGx5UGVuZGluZ0V4dGVybmFsRWRpdHMoKTtcblx0XHRcdHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcygpO1xuXHRcdFx0aW50ZXJuYWxLZXlzID0gdC5nZXRBbGxLZXlzKCk7XG5cdFx0XHRkYXRhID0gdGhpcy5nZXRUZWxlbWV0cnlEYXRhKHJhbmdlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcmVwYXJlZEFnZW50Rmx1c2guY29tbWl0KGRhdGEudG90YWxNb2RpZmllZENoYXJhY3RlcnNJbkZpbmFsU3RhdGUgKyBwcmVwYXJlZEFnZW50Rmx1c2guYWdlbnRNb2RpZmllZENvdW50KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtFZGl0U291cmNlVHJhY2tpbmdJbXBsXSBGYWlsZWQgdG8gY29tbWl0IEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbjogJHtlcnJvcn1gKTtcblx0XHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKSkge1xuXHRcdFx0XHRcdHByZXBhcmVkQWdlbnRGbHVzaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZlclN1cHByZXNzZWRFeHRlcm5hbCA9IGVycm9yIGluc3RhbmNlb2YgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvciB8fCBlcnJvciBpbnN0YW5jZW9mIEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvblVua25vd25PdXRjb21lRXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGluY2x1ZGVTdXBwcmVzc2VkRXh0ZXJuYWwgPSAhcHJlcGFyZWRBZ2VudEZsdXNoICYmICFkZWZlclN1cHByZXNzZWRFeHRlcm5hbCAmJiAhaXNEaXJ0eSAmJiBtb2RlID09PSAnbG9uZ3Rlcm0nICYmICEhdGhpcy5fYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2U7XG5cdFx0aWYgKGluY2x1ZGVTdXBwcmVzc2VkRXh0ZXJuYWwpIHtcblx0XHRcdHJhbmdlcyA9IHQuZ2V0VHJhY2tlZFJhbmdlcyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0aW50ZXJuYWxLZXlzID0gdC5nZXRBbGxLZXlzKHRydWUpO1xuXHRcdFx0ZGF0YSA9IHRoaXMuZ2V0VGVsZW1ldHJ5RGF0YShyYW5nZXMpO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudE1vZGlmaWVkQ291bnQgPSBwcmVwYXJlZEFnZW50Rmx1c2g/LmFnZW50TW9kaWZpZWRDb3VudCA/PyAwO1xuXHRcdGlmIChpbnRlcm5hbEtleXMubGVuZ3RoID09PSAwICYmIGFnZW50TW9kaWZpZWRDb3VudCA9PT0gMCAmJiAhY292ZXJhZ2VHYXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdG90YWxNb2RpZmllZENvdW50ID0gZGF0YS50b3RhbE1vZGlmaWVkQ2hhcmFjdGVyc0luRmluYWxTdGF0ZSArIGFnZW50TW9kaWZpZWRDb3VudDtcblxuXHRcdGNvbnN0IHRlbGVtZXRyeUtleXMgPSBuZXcgTWFwPHN0cmluZywge1xuXHRcdFx0cmVhZG9ubHkgcmVwcmVzZW50YXRpdmU6IFRleHRNb2RlbEVkaXRTb3VyY2U7XG5cdFx0XHRtb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IG51bWJlcjtcblx0XHR9PigpO1xuXHRcdGZvciAoY29uc3QgaW50ZXJuYWxLZXkgb2YgaW50ZXJuYWxLZXlzKSB7XG5cdFx0XHRjb25zdCByZXByZXNlbnRhdGl2ZSA9IHQuZ2V0UmVwcmVzZW50YXRpdmUoaW50ZXJuYWxLZXkpITtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeUtleSA9IHJlcHJlc2VudGF0aXZlLnRvS2V5KDEpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0ZWxlbWV0cnlLZXlzLmdldCh0ZWxlbWV0cnlLZXkpID8/IHtcblx0XHRcdFx0cmVwcmVzZW50YXRpdmUsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogMCxcblx0XHRcdH07XG5cdFx0XHRlbnRyeS5kZWx0YU1vZGlmaWVkQ291bnQgKz0gdC5nZXRUb3RhbEluc2VydGVkQ2hhcmFjdGVyc0NvdW50KGludGVybmFsS2V5LCBpbmNsdWRlU3VwcHJlc3NlZEV4dGVybmFsKTtcblx0XHRcdHRlbGVtZXRyeUtleXMuc2V0KHRlbGVtZXRyeUtleSwgZW50cnkpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlcykge1xuXHRcdFx0Y29uc3QgcmVwcmVzZW50YXRpdmUgPSB0LmdldFJlcHJlc2VudGF0aXZlKHJhbmdlLnNvdXJjZUtleSkhO1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0ZWxlbWV0cnlLZXlzLmdldChyZXByZXNlbnRhdGl2ZS50b0tleSgxKSk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0ZW50cnkubW9kaWZpZWRDb3VudCArPSByYW5nZS5yYW5nZS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHN1bXMgPSBPYmplY3QuZnJvbUVudHJpZXMoQXJyYXkuZnJvbSh0ZWxlbWV0cnlLZXlzLCAoW2tleSwgdmFsdWVdKSA9PiBba2V5LCB2YWx1ZS5tb2RpZmllZENvdW50XSkpO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhzdW1zKVxuXHRcdFx0LmZpbHRlcigoZW50cnkpOiBlbnRyeSBpcyBbc3RyaW5nLCBudW1iZXJdID0+IGVudHJ5WzFdICE9PSB1bmRlZmluZWQpXG5cdFx0XHQuc29ydChyZXZlcnNlT3JkZXIoY29tcGFyZUJ5KChbLCB2YWx1ZV0pID0+IHZhbHVlLCBudW1iZXJDb21wYXJhdG9yKSkpXG5cdFx0XHQuc2xpY2UoMCwgbW9kZSA9PT0gJ2xvbmd0ZXJtJyA/IDMwIDogMTApO1xuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZW50cmllcykge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5RW50cnkgPSB0ZWxlbWV0cnlLZXlzLmdldChrZXkpITtcblx0XHRcdGNvbnN0IHJlcHIgPSB0ZWxlbWV0cnlFbnRyeS5yZXByZXNlbnRhdGl2ZTtcblx0XHRcdGNvbnN0IGRlbHRhTW9kaWZpZWRDb3VudCA9IHRlbGVtZXRyeUVudHJ5LmRlbHRhTW9kaWZpZWRDb3VudDtcblxuXHRcdFx0c2VuZEVkaXRTb3VyY2VzRGV0YWlsc1RlbGVtZXRyeSh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdG1vZGUsXG5cdFx0XHRcdHNvdXJjZUtleToga2V5LFxuXHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiByZXByLnRvS2V5KDEsIHsgJGV4dGVuc2lvbklkOiBmYWxzZSwgJGV4dGVuc2lvblZlcnNpb246IGZhbHNlLCAkbW9kZWxJZDogZmFsc2UgfSksXG5cdFx0XHRcdGV4dGVuc2lvbklkOiByZXByLnByb3BzLiRleHRlbnNpb25JZCxcblx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogcmVwci5wcm9wcy4kZXh0ZW5zaW9uVmVyc2lvbixcblx0XHRcdFx0bW9kZWxJZDogcmVwci5wcm9wcy4kbW9kZWxJZCxcblx0XHRcdFx0dHJpZ2dlcixcblx0XHRcdFx0bGFuZ3VhZ2VJZDogdGhpcy5fZG9jLmRvY3VtZW50Lmxhbmd1YWdlSWQuZ2V0KCksXG5cdFx0XHRcdHN0YXRzVXVpZDogc3RhdHNVdWlkLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogcmVwci5wcm9wcy4kJHNlc3Npb25JZCxcblx0XHRcdFx0cmVxdWVzdElkOiByZXByLnByb3BzLiQkcmVxdWVzdElkLFxuXHRcdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHRcdFx0aGFybmVzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiB2YWx1ZSxcblx0XHRcdFx0ZGVsdGFNb2RpZmllZENvdW50OiBkZWx0YU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgaXNUcmFja2VkQnlHaXQgPSBhd2FpdCBkYXRhLmlzVHJhY2tlZEJ5R2l0O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHRtb2RlOiBFZGl0VGVsZW1ldHJ5TW9kZTtcblx0XHRcdGxhbmd1YWdlSWQ6IHN0cmluZztcblx0XHRcdHN0YXRzVXVpZDogc3RyaW5nO1xuXHRcdFx0bmVzTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRcdFx0dW5rbm93bk1vZGlmaWVkQ291bnQ6IG51bWJlcjtcblx0XHRcdHVzZXJNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0XHRpZGVNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogbnVtYmVyO1xuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBudW1iZXI7XG5cdFx0XHRpc1RyYWNrZWRCeUdpdDogbnVtYmVyO1xuXHRcdFx0Zm9jdXNUaW1lOiBudW1iZXI7XG5cdFx0XHRhY3R1YWxUaW1lOiBudW1iZXI7XG5cdFx0XHR0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlcjtcblx0XHRcdGFnZW50SG9zdEF0dHJpYnV0aW9uQ292ZXJhZ2U/OiAnY29tcGxldGUnIHwgJ3BhcnRpYWwnO1xuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkRWRpdENvdW50PzogbnVtYmVyO1xuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudD86IG51bWJlcjtcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ2hlZGlldCc7XG5cdFx0XHRjb21tZW50OiAnQWdncmVnYXRlcyBjaGFyYWN0ZXIgY291bnRzIGJ5IGVkaXQgc291cmNlIGNhdGVnb3J5ICh1c2VyIHR5cGluZywgQUkgY29tcGxldGlvbnMsIE5FUywgSURFIGFjdGlvbnMsIGV4dGVybmFsIGNoYW5nZXMpIGZvciBlYWNoIGVkaXRpbmcgc2Vzc2lvbi4gU2Vzc2lvbnMgcmVwcmVzZW50IHVuaXRzIG9mIHdvcmsgYW5kIGVuZCB3aGVuIGRvY3VtZW50cyBjbG9zZSwgYnJhbmNoZXMgY2hhbmdlLCBjb21taXRzIG9jY3VyLCBvciB0aW1lIGxpbWl0cyBhcmUgcmVhY2hlZCAoMTAgb3IgMjAgbWludXRlcyBvZiBmb2N1cyB0aW1lIGZvciB2aXNpYmxlIGRvY3VtZW50cywgb3IgMTAgaG91cnMgb3RoZXJ3aXNlKS4gRm9jdXMgdGltZSBpcyBjb21wdXRlZCBhcyBhY2N1bXVsYXRlZCAxLW1pbnV0ZSBibG9ja3Mgd2hlcmUgVlMgQ29kZSBoYXMgZm9jdXMgYW5kIHRoZXJlIHdhcyByZWNlbnQgdXNlciBhY3Rpdml0eS4gVHJhY2tzIGJvdGggdG90YWwgY2hhcmFjdGVycyBpbnNlcnRlZCBhbmQgY2hhcmFjdGVycyByZW1haW5pbmcgYXQgc2Vzc2lvbiBlbmQgdG8gbWVhc3VyZSByZXRlbnRpb24uIFRoaXMgaGlnaC1sZXZlbCBzdW1tYXJ5IGNvbXBsZW1lbnRzIGVkaXRTb3VyY2VzLmRldGFpbHMgd2hpY2ggcHJvdmlkZXMgZ3JhbnVsYXIgcGVyLXNvdXJjZSBicmVha2Rvd25zLiBAc2VudFRvR2l0SHViJztcblxuXHRcdFx0bW9kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ2xvbmd0ZXJtLCAxMG1pbkZvY3VzV2luZG93LCBvciAyMG1pbkZvY3VzV2luZG93JyB9O1xuXHRcdFx0bGFuZ3VhZ2VJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBsYW5ndWFnZSBpZCBvZiB0aGUgZG9jdW1lbnQuJyB9O1xuXHRcdFx0c3RhdHNVdWlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgdGVsZW1ldHJ5IGV2ZW50LicgfTtcblxuXHRcdFx0bmVzTW9kaWZpZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0ZyYWN0aW9uIG9mIG5lcyBtb2RpZmllZCBjaGFyYWN0ZXJzJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0ZyYWN0aW9uIG9mIGlubGluZSBjb21wbGV0aW9ucyBjb3BpbG90IG1vZGlmaWVkIGNoYXJhY3RlcnMnOyBpc01lYXN1cmVtZW50OiB0cnVlIH07XG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdGcmFjdGlvbiBvZiBpbmxpbmUgY29tcGxldGlvbnMgbmVzIG1vZGlmaWVkIGNoYXJhY3RlcnMnOyBpc01lYXN1cmVtZW50OiB0cnVlIH07XG5cdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0ZyYWN0aW9uIG9mIG90aGVyIEFJIG1vZGlmaWVkIGNoYXJhY3RlcnMnOyBpc01lYXN1cmVtZW50OiB0cnVlIH07XG5cdFx0XHR1bmtub3duTW9kaWZpZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0ZyYWN0aW9uIG9mIHVua25vd24gbW9kaWZpZWQgY2hhcmFjdGVycyc7IGlzTWVhc3VyZW1lbnQ6IHRydWUgfTtcblx0XHRcdHVzZXJNb2RpZmllZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnRnJhY3Rpb24gb2YgdXNlciBtb2RpZmllZCBjaGFyYWN0ZXJzJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0aWRlTW9kaWZpZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0ZyYWN0aW9uIG9mIElERSBtb2RpZmllZCBjaGFyYWN0ZXJzJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0dG90YWxNb2RpZmllZENoYXJhY3RlcnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUb3RhbCBtb2RpZmllZCBjaGFyYWN0ZXJzJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnRnJhY3Rpb24gb2YgZXh0ZXJuYWwgbW9kaWZpZWQgY2hhcmFjdGVycyc7IGlzTWVhc3VyZW1lbnQ6IHRydWUgfTtcblx0XHRcdGlzVHJhY2tlZEJ5R2l0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5kaWNhdGVzIGlmIHRoZSBkb2N1bWVudCBpcyB0cmFja2VkIGJ5IGdpdC4nIH07XG5cdFx0XHRmb2N1c1RpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZm9jdXMgdGltZSBpbiBtcyBkdXJpbmcgdGhlIHNlc3Npb24uJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0YWN0dWFsVGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3R1YWwgdGltZSBpbiBtcyBkdXJpbmcgdGhlIHNlc3Npb24uJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0dHJpZ2dlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0luZGljYXRlcyB3aHkgdGhlIHNlc3Npb24gZW5kZWQuJyB9O1xuXHRcdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGxvbmctdGVybSBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gd2FzIGNvbXBsZXRlIG9yIHNraXBwZWQgYXQgbGVhc3Qgb25lIG92ZXJzaXplZCBlZGl0LicgfTtcblx0XHRcdGFnZW50SG9zdFVudHJhY2tlZEVkaXRDb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygb3ZlcnNpemVkIEFnZW50IEhvc3QgZWRpdHMgZXhjbHVkZWQgZnJvbSBkZXRhaWxlZCBhdHRyaWJ1dGlvbiBpbiB0aGlzIGxvbmctdGVybSB3aW5kb3cuJzsgaXNNZWFzdXJlbWVudDogdHJ1ZSB9O1xuXHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdDaGFyYWN0ZXJzIGluc2VydGVkIGJ5IG92ZXJzaXplZCBBZ2VudCBIb3N0IGVkaXRzIGV4Y2x1ZGVkIGZyb20gcmV0YWluZWQtY2hhcmFjdGVyIGF0dHJpYnV0aW9uIGluIHRoaXMgbG9uZy10ZXJtIHdpbmRvdy4nOyBpc01lYXN1cmVtZW50OiB0cnVlIH07XG5cdFx0fT4oJ2VkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHMnLCB7XG5cdFx0XHRtb2RlLFxuXHRcdFx0bGFuZ3VhZ2VJZDogdGhpcy5fZG9jLmRvY3VtZW50Lmxhbmd1YWdlSWQuZ2V0KCksXG5cdFx0XHRzdGF0c1V1aWQ6IHN0YXRzVXVpZCxcblx0XHRcdG5lc01vZGlmaWVkQ291bnQ6IGRhdGEubmVzTW9kaWZpZWRDb3VudCxcblx0XHRcdGlubGluZUNvbXBsZXRpb25zQ29waWxvdE1vZGlmaWVkQ291bnQ6IGRhdGEuaW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudCxcblx0XHRcdGlubGluZUNvbXBsZXRpb25zTkVTTW9kaWZpZWRDb3VudDogZGF0YS5pbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnQsXG5cdFx0XHRvdGhlckFJTW9kaWZpZWRDb3VudDogZGF0YS5vdGhlckFJTW9kaWZpZWRDb3VudCArIGFnZW50TW9kaWZpZWRDb3VudCxcblx0XHRcdHVua25vd25Nb2RpZmllZENvdW50OiBkYXRhLnVua25vd25Nb2RpZmllZENvdW50LFxuXHRcdFx0dXNlck1vZGlmaWVkQ291bnQ6IGRhdGEudXNlck1vZGlmaWVkQ291bnQsXG5cdFx0XHRpZGVNb2RpZmllZENvdW50OiBkYXRhLmlkZU1vZGlmaWVkQ291bnQsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyczogdG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0ZXh0ZXJuYWxNb2RpZmllZENvdW50OiBkYXRhLmV4dGVybmFsTW9kaWZpZWRDb3VudCxcblx0XHRcdGlzVHJhY2tlZEJ5R2l0OiBpc1RyYWNrZWRCeUdpdCA/IDEgOiAwLFxuXHRcdFx0Zm9jdXNUaW1lLFxuXHRcdFx0YWN0dWFsVGltZSxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHQuLi4obW9kZSA9PT0gJ2xvbmd0ZXJtJyA/IHtcblx0XHRcdFx0YWdlbnRIb3N0QXR0cmlidXRpb25Db3ZlcmFnZTogY292ZXJhZ2VHYXAgPyAncGFydGlhbCcgYXMgY29uc3QgOiAnY29tcGxldGUnIGFzIGNvbnN0LFxuXHRcdFx0XHRhZ2VudEhvc3RVbnRyYWNrZWRFZGl0Q291bnQ6IGNvdmVyYWdlR2FwPy5lZGl0Q291bnQgPz8gMCxcblx0XHRcdFx0YWdlbnRIb3N0VW50cmFja2VkSW5zZXJ0ZWRDb3VudDogY292ZXJhZ2VHYXA/Lmluc2VydGVkQ291bnQgPz8gMCxcblx0XHRcdH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRUZWxlbWV0cnlEYXRhKHJhbmdlczogcmVhZG9ubHkgVHJhY2tlZEVkaXRbXSkge1xuXHRcdGNvbnN0IHN1bXMgPSBzdW1CeUNhdGVnb3J5KHJhbmdlcywgciA9PiByLnJhbmdlLmxlbmd0aCwgciA9PiBnZXRFZGl0VGVsZW1ldHJ5Q2F0ZWdvcnkoci5zb3VyY2UpKTtcblx0XHRjb25zdCB0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyc0luRmluYWxTdGF0ZSA9IHN1bUJ5KHJhbmdlcywgciA9PiByLnJhbmdlLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmVzTW9kaWZpZWRDb3VudDogc3Vtcy5uZXMgPz8gMCxcblx0XHRcdGlubGluZUNvbXBsZXRpb25zQ29waWxvdE1vZGlmaWVkQ291bnQ6IHN1bXMuaW5saW5lQ29tcGxldGlvbnNDb3BpbG90ID8/IDAsXG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnQ6IHN1bXMuaW5saW5lQ29tcGxldGlvbnNORVMgPz8gMCxcblx0XHRcdG90aGVyQUlNb2RpZmllZENvdW50OiBzdW1zLm90aGVyQUkgPz8gMCxcblx0XHRcdHVzZXJNb2RpZmllZENvdW50OiBzdW1zLnVzZXIgPz8gMCxcblx0XHRcdGlkZU1vZGlmaWVkQ291bnQ6IHN1bXMuaWRlID8/IDAsXG5cdFx0XHR1bmtub3duTW9kaWZpZWRDb3VudDogc3Vtcy51bmtub3duID8/IDAsXG5cdFx0XHRleHRlcm5hbE1vZGlmaWVkQ291bnQ6IHN1bXMuZXh0ZXJuYWwgPz8gMCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDaGFyYWN0ZXJzSW5GaW5hbFN0YXRlLFxuXHRcdFx0bGFuZ3VhZ2VJZDogdGhpcy5fZG9jLmRvY3VtZW50Lmxhbmd1YWdlSWQuZ2V0KCksXG5cdFx0XHRpc1RyYWNrZWRCeUdpdDogdGhpcy5fcmVwby5nZXQoKT8uaXNJZ25vcmVkKHRoaXMuX2RvYy5kb2N1bWVudC51cmkpLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjLFdBQVcsa0JBQWtCLGFBQWE7QUFDakUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjLGtCQUFrQjtBQUN6QyxTQUFTLDBCQUEwQixTQUFzQixrQkFBa0IsYUFBYSxlQUFlO0FBQ3ZHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQWtELHVDQUF1QztBQUN6RixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDZDQUE2QyxxREFBcUQsOENBQThDO0FBQ3pKLFNBQVMsK0JBQTJDO0FBQ3BELFNBQVMsaUNBQThDO0FBQ3ZELFNBQVMscUJBQXFCO0FBQzlCLFNBQTBCLGtCQUFrQjtBQUM1QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVDQUF1QyxtREFBd0g7QUFJakssU0FBUyx5QkFBeUIsUUFBMkM7QUFDbkYsTUFBSSxPQUFPLGFBQWEsUUFBUSxPQUFPLFNBQVMsT0FBTztBQUFFLFdBQU87QUFBQSxFQUFPO0FBRXZFLE1BQUksT0FBTyxhQUFhLFFBQVEsT0FBTyxTQUFTLGdCQUFnQixPQUFPLGdCQUFnQixrQkFBa0I7QUFBRSxXQUFPO0FBQUEsRUFBNEI7QUFDOUksTUFBSSxPQUFPLGFBQWEsUUFBUSxPQUFPLFNBQVMsZ0JBQWdCLE9BQU8sZ0JBQWdCLHlCQUF5QixPQUFPLGVBQWUsT0FBTztBQUFFLFdBQU87QUFBQSxFQUF3QjtBQUM5SyxNQUFJLE9BQU8sYUFBYSxRQUFRLE9BQU8sU0FBUyxnQkFBZ0IsT0FBTyxnQkFBZ0IseUJBQXlCLE9BQU8sZUFBZSxlQUFlO0FBQUUsV0FBTztBQUFBLEVBQTRCO0FBQzFMLE1BQUksT0FBTyxhQUFhLFFBQVEsT0FBTyxTQUFTLGNBQWM7QUFBRSxXQUFPO0FBQUEsRUFBMEI7QUFFakcsTUFBSSxPQUFPLGFBQWEsTUFBTTtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQ2xELE1BQUksT0FBTyxhQUFhLFFBQVE7QUFBRSxXQUFPO0FBQUEsRUFBUTtBQUNqRCxNQUFJLE9BQU8sYUFBYSxPQUFPO0FBQUUsV0FBTztBQUFBLEVBQU87QUFDL0MsTUFBSSxPQUFPLGFBQWEsWUFBWTtBQUFFLFdBQU87QUFBQSxFQUFZO0FBQ3pELFNBQU87QUFDUjtBQUVPLElBQU0seUJBQU4sY0FBcUMsV0FBVztBQUFBLEVBSXRELFlBQ2tCLGVBQ0EscUJBQ0EsNkJBQ3VCLHVCQUN2QztBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUFDdUI7QUFJeEMsVUFBTSxZQUFZLEtBQUssc0JBQXNCLGVBQWUsVUFBVTtBQUN0RSxTQUFLLFVBQVUseUJBQXlCLE1BQU0sS0FBSyxvQkFBb0IsV0FBVyxDQUFDLEtBQUssVUFBVTtBQUNqRyxhQUFPLENBQUMsSUFBSSxVQUFVLE1BQU0sSUFBSSxLQUFLLHNCQUFzQixlQUFlLHFCQUFxQixLQUFLLFdBQVcsS0FBSyxlQUFlLEtBQUssMkJBQTJCLENBQUMsQ0FBQztBQUFBLElBQ3RLLENBQUM7QUFDRCxTQUFLLFlBQVksS0FBSyxRQUFRLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxPQUFPLENBQUM7QUFFL0QsU0FBSyxVQUFVLDhCQUE4QixLQUFLLE1BQU07QUFBQSxFQUN6RDtBQUNEO0FBcEJhLHlCQUFOO0FBQUEsRUFRSjtBQUFBLEdBUlU7QUFzQmIsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFPNUMsWUFDa0IsTUFDQSxNQUNBLGVBQ0EsNkJBQ3VCLHVCQUNKLG1CQUNILGdCQUNPLHVCQUNMLGtCQUNMLGFBQzdCO0FBQ0QsVUFBTTtBQVhXO0FBQ0E7QUFDQTtBQUNBO0FBQ3VCO0FBQ0o7QUFDSDtBQUNPO0FBQ0w7QUFDTDtBQUk5QixTQUFLLFFBQVEsUUFBUSxNQUFNLFlBQVUsS0FBSyxLQUFLLFFBQVEsS0FBSyxTQUFTLEtBQUssTUFBTSxDQUFDO0FBRWpGLFVBQU0sb0JBQW9CLHdCQUF3QixLQUFLLHlCQUF5QixLQUFLLE1BQU07QUFDM0YsVUFBTSwwQkFBMEIsS0FBSyw2QkFBNkIsa0JBQWtCLEtBQUssU0FBUyxHQUFHO0FBRXJHLFVBQU0sc0JBQXNCLGlCQUFpQixhQUFhO0FBRTFELFFBQUksaUJBQXVDO0FBQzNDLFNBQUssa0JBQWtCLFFBQVEsQ0FBQyxXQUFXO0FBQzFDLFVBQUksQ0FBQyxLQUFLLGNBQWMsS0FBSyxNQUFNLEdBQUc7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUMxRCwwQkFBb0IsS0FBSyxNQUFNO0FBRS9CLFlBQU0sSUFBSSxPQUFPLE1BQU0sSUFBSSxJQUFJLDBCQUEwQixtQkFBbUIsUUFBVyx1QkFBdUIsQ0FBQztBQUMvRyxZQUFNLGlCQUFpQixLQUFLLHNCQUFzQjtBQUNsRCxZQUFNLFlBQVksS0FBSyxJQUFJO0FBQzNCLGFBQU8sTUFBTSxJQUFJLGFBQWEsTUFBTTtBQUVuQyxhQUFLLHFCQUFxQixZQUFZLGdCQUFnQixHQUFHLEtBQUssc0JBQXNCLG1CQUFtQixnQkFBZ0IsS0FBSyxJQUFJLElBQUksU0FBUztBQUM3SSxVQUFFLFFBQVE7QUFBQSxNQUNYLENBQUMsQ0FBQztBQUNGLGFBQU87QUFBQSxJQUNSLENBQUMsRUFBRSw4QkFBOEIsS0FBSyxNQUFNO0FBRTVDLFNBQUssT0FBTyxJQUFJLElBQUksY0FBYyxDQUFDLEVBQUUsYUFBYSxNQUFNO0FBRXZELHVCQUFpQjtBQUNqQiwwQkFBb0IsUUFBUSxNQUFTO0FBQ3JDLHVCQUFpQjtBQUFBLElBQ2xCLEdBQUcsS0FBSyxLQUFLLEtBQUssR0FBSTtBQUd0QixTQUFLLE9BQU8sSUFBSSxRQUFRLFlBQVU7QUFDakMsWUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbkMsVUFBSSxNQUFNO0FBQ1QsZUFBTyxNQUFNLElBQUksWUFBWSxLQUFLLG1CQUFtQixNQUFNO0FBQzFELDJCQUFpQjtBQUNqQiw4QkFBb0IsUUFBUSxNQUFTO0FBQ3JDLDJCQUFpQjtBQUFBLFFBQ2xCLENBQUMsQ0FBQztBQUNGLGVBQU8sTUFBTSxJQUFJLFlBQVksS0FBSyxtQkFBbUIsTUFBTTtBQUMxRCwyQkFBaUI7QUFDakIsOEJBQW9CLFFBQVEsTUFBUztBQUNyQywyQkFBaUI7QUFBQSxRQUNsQixDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLE9BQU8sSUFBSSxLQUFLLHNCQUFzQixlQUFlLHdDQUF3QyxLQUFLLHlCQUF5QixLQUFLLEtBQUssQ0FBQztBQUMzSSxTQUFLLE9BQU8sSUFBSSxLQUFLLHNCQUFzQixlQUFlLHFEQUFxRCxLQUFLLHlCQUF5QixLQUFLLEtBQUssQ0FBQztBQUN4SixTQUFLLE9BQU8sSUFBSSxLQUFLLHNCQUFzQixlQUFlLDZDQUE2QyxLQUFLLHVCQUF1QixDQUFDO0FBR3BJLFVBQU0sY0FBYyxpQkFBaUIsYUFBYTtBQUVsRCxTQUFLLGtCQUFrQixRQUFRLENBQUMsV0FBVztBQUMxQyxVQUFJLENBQUMsS0FBSyxjQUFjLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFMUQsVUFBSSxDQUFDLEtBQUssS0FBSyxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQ3RDLGVBQU87QUFBQSxNQUNSO0FBQ0Esa0JBQVksS0FBSyxNQUFNO0FBR3ZCLGFBQU8sTUFBTSxJQUFJLEtBQUssc0JBQXNCLDhCQUE4QixLQUFLLEtBQUssS0FBTSxNQUFNO0FBQy9GLG9CQUFZLFFBQVEsTUFBUztBQUFBLE1BQzlCLENBQUMsQ0FBQztBQUVGLFlBQU0sSUFBSSxPQUFPLE1BQU0sSUFBSSxJQUFJLDBCQUEwQixtQkFBbUIsTUFBUyxDQUFDO0FBQ3RGLFlBQU0saUJBQWlCLEtBQUssc0JBQXNCO0FBQ2xELFlBQU0sWUFBWSxLQUFLLElBQUk7QUFDM0IsYUFBTyxNQUFNLElBQUksYUFBYSxZQUFZO0FBRXpDLGFBQUsscUJBQXFCLG9CQUFvQixRQUFRLEdBQUcsS0FBSyxzQkFBc0IsbUJBQW1CLGdCQUFnQixLQUFLLElBQUksSUFBSSxTQUFTO0FBQzdJLFVBQUUsUUFBUTtBQUFBLE1BQ1gsQ0FBQyxDQUFDO0FBRUYsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLDhCQUE4QixLQUFLLE1BQU07QUFHNUMsVUFBTSxtQkFBbUIsaUJBQWlCLGtCQUFrQjtBQUU1RCxTQUFLLHVCQUF1QixRQUFRLENBQUMsV0FBVztBQUMvQyxVQUFJLENBQUMsS0FBSyxjQUFjLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFMUQsVUFBSSxDQUFDLEtBQUssS0FBSyxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQ3RDLGVBQU87QUFBQSxNQUNSO0FBQ0EsdUJBQWlCLEtBQUssTUFBTTtBQUc1QixhQUFPLE1BQU0sSUFBSSxLQUFLLHNCQUFzQiw4QkFBOEIsS0FBSyxLQUFLLEtBQU0sTUFBTTtBQUMvRix5QkFBaUIsUUFBUSxNQUFTO0FBQUEsTUFDbkMsQ0FBQyxDQUFDO0FBRUYsWUFBTSxJQUFJLE9BQU8sTUFBTSxJQUFJLElBQUksMEJBQTBCLG1CQUFtQixNQUFTLENBQUM7QUFDdEYsWUFBTSxpQkFBaUIsS0FBSyxzQkFBc0I7QUFDbEQsWUFBTSxZQUFZLEtBQUssSUFBSTtBQUMzQixhQUFPLE1BQU0sSUFBSSxhQUFhLFlBQVk7QUFFekMsYUFBSyxxQkFBcUIsb0JBQW9CLFFBQVEsR0FBRyxLQUFLLHNCQUFzQixtQkFBbUIsZ0JBQWdCLEtBQUssSUFBSSxJQUFJLFNBQVM7QUFDN0ksVUFBRSxRQUFRO0FBQUEsTUFDWCxDQUFDLENBQUM7QUFFRixhQUFPO0FBQUEsSUFDUixDQUFDLEVBQUUsOEJBQThCLEtBQUssTUFBTTtBQUFBLEVBRTdDO0FBQUEsRUFFUSxxQkFBcUIsTUFBeUIsU0FBK0IsU0FBb0MsV0FBbUIsWUFBMEI7QUFDckssU0FBSyxLQUFLLGNBQWMsTUFBTSxTQUFTLFNBQVMsV0FBVyxVQUFVLEVBQUUsTUFBTSxXQUFTO0FBQ3JGLFdBQUssWUFBWSxNQUFNLDJDQUEyQyxJQUFJLG9CQUFvQixLQUFLLEVBQUU7QUFBQSxJQUNsRyxDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hCLGNBQVEsZ0NBQWdDO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sY0FBYyxNQUF5QixTQUErQixHQUE4QixXQUFtQixZQUFvQjtBQUNoSixVQUFNLGNBQWMsU0FBUyxhQUFhLEtBQUssNkJBQTZCLGtCQUFrQixLQUFLLEtBQUssU0FBUyxHQUFHLElBQUk7QUFDeEgsTUFBRSwwQkFBMEI7QUFDNUIsUUFBSSxTQUFTLEVBQUUsaUJBQWlCO0FBQ2hDLFFBQUksZUFBZSxFQUFFLFdBQVc7QUFDaEMsUUFBSSxPQUFPLEtBQUssaUJBQWlCLE1BQU07QUFDdkMsVUFBTSxZQUFZLEtBQUssZUFBZSxhQUFhO0FBQ25ELFFBQUk7QUFDSixRQUFJLDBCQUEwQjtBQUM5QixVQUFNLFVBQVUsS0FBSyxpQkFBaUIsUUFBUSxLQUFLLEtBQUssU0FBUyxHQUFHO0FBQ3BFLFFBQUksU0FBUyxjQUFjLEtBQUssNkJBQTZCO0FBQzVELFVBQUk7QUFDSCw2QkFBcUIsTUFBTSxLQUFLLDRCQUE0QjtBQUFBLFVBQzNELEtBQUssS0FBSyxTQUFTO0FBQUEsVUFDbkI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0EsS0FBSyxLQUFLLFNBQVMsV0FBVyxJQUFJO0FBQUEsUUFDbkM7QUFBQSxNQUNELFNBQVMsT0FBTztBQUNmLGFBQUssWUFBWSxNQUFNLDJFQUEyRSxLQUFLLEVBQUU7QUFDekcsa0NBQTBCLGlCQUFpQix5Q0FBeUMsaUJBQWlCO0FBQUEsTUFDdEc7QUFBQSxJQUNEO0FBQ0EsUUFBSSxvQkFBb0I7QUFDdkIsUUFBRSwwQkFBMEI7QUFDNUIsZUFBUyxFQUFFLGlCQUFpQjtBQUM1QixxQkFBZSxFQUFFLFdBQVc7QUFDNUIsYUFBTyxLQUFLLGlCQUFpQixNQUFNO0FBQ25DLFVBQUk7QUFDSCxjQUFNLG1CQUFtQixPQUFPLEtBQUssc0NBQXNDLG1CQUFtQixrQkFBa0I7QUFBQSxNQUNqSCxTQUFTLE9BQU87QUFDZixhQUFLLFlBQVksTUFBTSwwRUFBMEUsS0FBSyxFQUFFO0FBQ3hHLFlBQUksRUFBRSxpQkFBaUIsOENBQThDO0FBQ3BFLCtCQUFxQjtBQUFBLFFBQ3RCO0FBQ0Esa0NBQTBCLGlCQUFpQix5Q0FBeUMsaUJBQWlCO0FBQUEsTUFDdEc7QUFBQSxJQUNEO0FBQ0EsVUFBTSw0QkFBNEIsQ0FBQyxzQkFBc0IsQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLFNBQVMsY0FBYyxDQUFDLENBQUMsS0FBSztBQUMvSCxRQUFJLDJCQUEyQjtBQUM5QixlQUFTLEVBQUUsaUJBQWlCLFFBQVcsSUFBSTtBQUMzQyxxQkFBZSxFQUFFLFdBQVcsSUFBSTtBQUNoQyxhQUFPLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUNwQztBQUNBLFVBQU0scUJBQXFCLG9CQUFvQixzQkFBc0I7QUFDckUsUUFBSSxhQUFhLFdBQVcsS0FBSyx1QkFBdUIsS0FBSyxDQUFDLGFBQWE7QUFDMUU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxxQkFBcUIsS0FBSyxzQ0FBc0M7QUFFdEUsVUFBTSxnQkFBZ0Isb0JBQUksSUFJdkI7QUFDSCxlQUFXLGVBQWUsY0FBYztBQUN2QyxZQUFNLGlCQUFpQixFQUFFLGtCQUFrQixXQUFXO0FBQ3RELFlBQU0sZUFBZSxlQUFlLE1BQU0sQ0FBQztBQUMzQyxZQUFNLFFBQVEsY0FBYyxJQUFJLFlBQVksS0FBSztBQUFBLFFBQ2hEO0FBQUEsUUFDQSxlQUFlO0FBQUEsUUFDZixvQkFBb0I7QUFBQSxNQUNyQjtBQUNBLFlBQU0sc0JBQXNCLEVBQUUsZ0NBQWdDLGFBQWEseUJBQXlCO0FBQ3BHLG9CQUFjLElBQUksY0FBYyxLQUFLO0FBQUEsSUFDdEM7QUFDQSxlQUFXLFNBQVMsUUFBUTtBQUMzQixZQUFNLGlCQUFpQixFQUFFLGtCQUFrQixNQUFNLFNBQVM7QUFDMUQsWUFBTSxRQUFRLGNBQWMsSUFBSSxlQUFlLE1BQU0sQ0FBQyxDQUFDO0FBQ3ZELFVBQUksT0FBTztBQUNWLGNBQU0saUJBQWlCLE1BQU0sTUFBTTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUNBLFVBQU0sT0FBTyxPQUFPLFlBQVksTUFBTSxLQUFLLGVBQWUsQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUMsS0FBSyxNQUFNLGFBQWEsQ0FBQyxDQUFDO0FBQ3ZHLFVBQU0sVUFBVSxPQUFPLFFBQVEsSUFBSSxFQUNqQyxPQUFPLENBQUMsVUFBcUMsTUFBTSxDQUFDLE1BQU0sTUFBUyxFQUNuRSxLQUFLLGFBQWEsVUFBVSxDQUFDLENBQUMsRUFBRSxLQUFLLE1BQU0sT0FBTyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQ3BFLE1BQU0sR0FBRyxTQUFTLGFBQWEsS0FBSyxFQUFFO0FBRXhDLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxTQUFTO0FBQ25DLFlBQU0saUJBQWlCLGNBQWMsSUFBSSxHQUFHO0FBQzVDLFlBQU0sT0FBTyxlQUFlO0FBQzVCLFlBQU0scUJBQXFCLGVBQWU7QUFFMUMsc0NBQWdDLEtBQUssbUJBQW1CO0FBQUEsUUFDdkQ7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLGtCQUFrQixLQUFLLE1BQU0sR0FBRyxFQUFFLGNBQWMsT0FBTyxtQkFBbUIsT0FBTyxVQUFVLE1BQU0sQ0FBQztBQUFBLFFBQ2xHLGFBQWEsS0FBSyxNQUFNO0FBQUEsUUFDeEIsa0JBQWtCLEtBQUssTUFBTTtBQUFBLFFBQzdCLFNBQVMsS0FBSyxNQUFNO0FBQUEsUUFDcEI7QUFBQSxRQUNBLFlBQVksS0FBSyxLQUFLLFNBQVMsV0FBVyxJQUFJO0FBQUEsUUFDOUM7QUFBQSxRQUNBLGdCQUFnQixLQUFLLE1BQU07QUFBQSxRQUMzQixXQUFXLEtBQUssTUFBTTtBQUFBLFFBQ3RCLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxRQUNULGVBQWU7QUFBQSxRQUNmO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFHQSxVQUFNLGlCQUFpQixNQUFNLEtBQUs7QUFDbEMsU0FBSyxrQkFBa0IsV0E0Q3BCLG1DQUFtQztBQUFBLE1BQ3JDO0FBQUEsTUFDQSxZQUFZLEtBQUssS0FBSyxTQUFTLFdBQVcsSUFBSTtBQUFBLE1BQzlDO0FBQUEsTUFDQSxrQkFBa0IsS0FBSztBQUFBLE1BQ3ZCLHVDQUF1QyxLQUFLO0FBQUEsTUFDNUMsbUNBQW1DLEtBQUs7QUFBQSxNQUN4QyxzQkFBc0IsS0FBSyx1QkFBdUI7QUFBQSxNQUNsRCxzQkFBc0IsS0FBSztBQUFBLE1BQzNCLG1CQUFtQixLQUFLO0FBQUEsTUFDeEIsa0JBQWtCLEtBQUs7QUFBQSxNQUN2Qix5QkFBeUI7QUFBQSxNQUN6Qix1QkFBdUIsS0FBSztBQUFBLE1BQzVCLGdCQUFnQixpQkFBaUIsSUFBSTtBQUFBLE1BQ3JDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEdBQUksU0FBUyxhQUFhO0FBQUEsUUFDekIsOEJBQThCLGNBQWMsWUFBcUI7QUFBQSxRQUNqRSw2QkFBNkIsYUFBYSxhQUFhO0FBQUEsUUFDdkQsaUNBQWlDLGFBQWEsaUJBQWlCO0FBQUEsTUFDaEUsSUFBSSxDQUFDO0FBQUEsSUFDTixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsaUJBQWlCLFFBQWdDO0FBQ2hELFVBQU0sT0FBTyxjQUFjLFFBQVEsT0FBSyxFQUFFLE1BQU0sUUFBUSxPQUFLLHlCQUF5QixFQUFFLE1BQU0sQ0FBQztBQUMvRixVQUFNLHNDQUFzQyxNQUFNLFFBQVEsT0FBSyxFQUFFLE1BQU0sTUFBTTtBQUU3RSxXQUFPO0FBQUEsTUFDTixrQkFBa0IsS0FBSyxPQUFPO0FBQUEsTUFDOUIsdUNBQXVDLEtBQUssNEJBQTRCO0FBQUEsTUFDeEUsbUNBQW1DLEtBQUssd0JBQXdCO0FBQUEsTUFDaEUsc0JBQXNCLEtBQUssV0FBVztBQUFBLE1BQ3RDLG1CQUFtQixLQUFLLFFBQVE7QUFBQSxNQUNoQyxrQkFBa0IsS0FBSyxPQUFPO0FBQUEsTUFDOUIsc0JBQXNCLEtBQUssV0FBVztBQUFBLE1BQ3RDLHVCQUF1QixLQUFLLFlBQVk7QUFBQSxNQUN4QztBQUFBLE1BQ0EsWUFBWSxLQUFLLEtBQUssU0FBUyxXQUFXLElBQUk7QUFBQSxNQUM5QyxnQkFBZ0IsS0FBSyxNQUFNLElBQUksR0FBRyxVQUFVLEtBQUssS0FBSyxTQUFTLEdBQUc7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUFDRDtBQTVVTSxzQkFBTjtBQUFBLEVBWUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBakJHOyIsCiAgIm5hbWVzIjogW10KfQo=
