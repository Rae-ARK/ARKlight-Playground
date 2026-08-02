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
import { booleanComparator, compareBy, compareUndefinedSmallest, numberComparator } from "../../../../../base/common/arrays.js";
import { findLastMax } from "../../../../../base/common/arraysFind.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { equalsIfDefined, thisEqualsC } from "../../../../../base/common/equals.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { cloneAndChange } from "../../../../../base/common/objects.js";
import { derived, observableValue, recordChangesLazy, runOnChange, transaction } from "../../../../../base/common/observable.js";
import { observableReducerSettable } from "../../../../../base/common/observableInternal/experimental/reducer.js";
import { isDefined, isObject } from "../../../../../base/common/types.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from "../../../../../platform/dataChannel/browser/forwardingTelemetryService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
import product from "../../../../../platform/product/common/product.js";
import { StringEdit } from "../../../../common/core/edits/stringEdit.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Command, InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from "../../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { offsetEditFromContentChanges } from "../../../../common/model/textModelStringEdit.js";
import { isCompletionsEnabledFromObject } from "../../../../common/services/completionsEnablement.js";
import { ITextModelService } from "../../../../common/services/resolverService.js";
import { formatRecordableLogEntry, StructuredLogger } from "../structuredLogger.js";
import { sendInlineCompletionsEndOfLifeTelemetry } from "../telemetry.js";
import { wait } from "../utils.js";
import { InlineSuggestionItem } from "./inlineSuggestionItem.js";
import { provideInlineCompletions, runWhenCancelled } from "./provideInlineCompletions.js";
import { RenameSymbolProcessor } from "./renameSymbolProcessor.js";
import { TextModelValueReference } from "./textModelValueReference.js";
let InlineCompletionsSource = class extends Disposable {
  constructor(_textModel, _versionId, _debounceValue, _cursorPosition, _languageConfigurationService, _logService, _configurationService, _instantiationService, _contextKeyService, _textModelService) {
    super();
    this._textModel = _textModel;
    this._versionId = _versionId;
    this._debounceValue = _debounceValue;
    this._cursorPosition = _cursorPosition;
    this._languageConfigurationService = _languageConfigurationService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._contextKeyService = _contextKeyService;
    this._textModelService = _textModelService;
    this._updateOperation = this._register(new MutableDisposable());
    this._state = observableReducerSettable(this, {
      initial: () => ({
        inlineCompletions: InlineCompletionsState.createEmpty(),
        suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
      }),
      disposeFinal: (values) => {
        values.inlineCompletions.dispose();
        values.suggestWidgetInlineCompletions.dispose();
      },
      changeTracker: recordChangesLazy(() => ({ versionId: this._versionId })),
      update: (reader, previousValue, changes) => {
        const edit = StringEdit.compose(changes.changes.map((c) => c.change ? offsetEditFromContentChanges(c.change.changes) : StringEdit.empty).filter(isDefined));
        if (edit.isEmpty()) {
          return previousValue;
        }
        try {
          return {
            inlineCompletions: previousValue.inlineCompletions.createStateWithAppliedEdit(edit, this._textModel),
            suggestWidgetInlineCompletions: previousValue.suggestWidgetInlineCompletions.createStateWithAppliedEdit(edit, this._textModel)
          };
        } finally {
          previousValue.inlineCompletions.dispose();
          previousValue.suggestWidgetInlineCompletions.dispose();
        }
      }
    });
    this.inlineCompletions = this._state.map(this, (v) => v.inlineCompletions);
    this.suggestWidgetInlineCompletions = this._state.map(this, (v) => v.suggestWidgetInlineCompletions);
    this._completionsEnabled = void 0;
    this.clearOperationOnTextModelChange = derived(this, (reader) => {
      this._versionId.read(reader);
      this._updateOperation.clear();
      return void 0;
    });
    this._loadingCount = observableValue(this, 0);
    this.loading = this._loadingCount.map(this, (v) => v > 0);
    this._loggingEnabled = observableConfigValue("editor.inlineSuggest.logFetch", false, this._configurationService).recomputeInitiallyAndOnChange(this._store);
    this._sendRequestData = observableConfigValue("editor.inlineSuggest.emptyResponseInformation", true, this._configurationService).recomputeInitiallyAndOnChange(this._store);
    this._structuredFetchLogger = this._register(this._instantiationService.createInstance(
      StructuredLogger.cast(),
      "editor.inlineSuggest.logFetch.commandId"
    ));
    this._renameProcessor = this._store.add(this._instantiationService.createInstance(RenameSymbolProcessor));
    this.clearOperationOnTextModelChange.recomputeInitiallyAndOnChange(this._store);
    const enablementSetting = product.defaultChatAgent?.completionsEnablementSetting ?? void 0;
    if (enablementSetting) {
      this._updateCompletionsEnablement(enablementSetting);
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(enablementSetting)) {
          this._updateCompletionsEnablement(enablementSetting);
        }
      }));
    }
    this._state.recomputeInitiallyAndOnChange(this._store);
  }
  _updateCompletionsEnablement(enalementSetting) {
    const result = this._configurationService.getValue(enalementSetting);
    if (!isObject(result)) {
      this._completionsEnabled = void 0;
    } else {
      this._completionsEnabled = result;
    }
  }
  _log(entry) {
    if (this._loggingEnabled.get()) {
      this._logService.info(formatRecordableLogEntry(entry));
    }
    this._structuredFetchLogger.log(entry);
  }
  fetch(providers, providersLabel, context, activeInlineCompletion, withDebounce, userJumpedToActiveCompletion, requestInfo) {
    const position = this._cursorPosition.get();
    const request = new UpdateRequest(position, context, this._textModel.getVersionId(), new Set(providers));
    const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions.get() : this.inlineCompletions.get();
    if (this._updateOperation.value?.request.satisfies(request)) {
      return this._updateOperation.value.promise;
    } else if (target?.request?.satisfies(request)) {
      return Promise.resolve(true);
    }
    const updateOngoing = !!this._updateOperation.value;
    this._updateOperation.clear();
    const source = new CancellationTokenSource();
    const promise = (async () => {
      const store = new DisposableStore();
      this._loadingCount.set(this._loadingCount.get() + 1, void 0);
      let didDecrease = false;
      const decreaseLoadingCount = () => {
        if (!didDecrease) {
          didDecrease = true;
          this._loadingCount.set(this._loadingCount.get() - 1, void 0);
        }
      };
      const loadingReset = store.add(new RunOnceScheduler(() => decreaseLoadingCount(), 10 * 1e3));
      loadingReset.schedule();
      const inlineSuggestionsProviders = providers.filter((p) => p.providerId);
      const requestResponseInfo = new RequestResponseData(context, requestInfo, inlineSuggestionsProviders);
      try {
        const recommendedDebounceValue = this._debounceValue.get(this._textModel);
        const debounceValue = findLastMax(
          providers.map((p) => p.debounceDelayMs),
          compareUndefinedSmallest(numberComparator)
        ) ?? recommendedDebounceValue;
        const shouldDebounce = updateOngoing || withDebounce && context.triggerKind === InlineCompletionTriggerKind.Automatic;
        if (shouldDebounce) {
          await wait(debounceValue, source.token);
        }
        if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
          requestResponseInfo.setNoSuggestionReasonIfNotSet("canceled:beforeFetch");
          return false;
        }
        const requestId = InlineCompletionsSource._requestId++;
        if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
          this._log({
            sourceId: "InlineCompletions.fetch",
            kind: "start",
            requestId,
            modelUri: this._textModel.uri,
            modelVersion: this._textModel.getVersionId(),
            context: { triggerKind: context.triggerKind, suggestInfo: context.selectedSuggestionInfo ? true : void 0 },
            time: Date.now(),
            provider: providersLabel
          });
        }
        const startTime = /* @__PURE__ */ new Date();
        const providerResult = provideInlineCompletions(providers, this._cursorPosition.get(), this._textModel, context, requestInfo, this._languageConfigurationService);
        runWhenCancelled(source.token, () => providerResult.cancelAndDispose({ kind: "tokenCancellation" }));
        let shouldStopEarly = false;
        let producedSuggestion = false;
        const providerSuggestions = [];
        for await (const list of providerResult.lists) {
          if (!list) {
            continue;
          }
          list.addRef();
          store.add(toDisposable(() => list.removeRef(list.inlineSuggestionsData.length === 0 ? { kind: "empty" } : { kind: "notTaken" })));
          for (const item of list.inlineSuggestionsData) {
            producedSuggestion = true;
            if (!context.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) {
              item.setNotShownReason("notInlineEditRequested");
              continue;
            }
            if (!context.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) {
              item.setNotShownReason("notInlineCompletionRequested");
              continue;
            }
            item.addPerformanceMarker("providerReturned");
            const targetUri = item.action?.uri;
            let targetModel;
            let disposable;
            if (targetUri && targetUri.toString() !== this._textModel.uri.toString()) {
              const modelRef = await this._textModelService.createModelReference(targetUri);
              targetModel = modelRef.object.textEditorModel;
              disposable = modelRef;
            } else {
              targetModel = this._textModel;
              disposable = void 0;
            }
            const ref = TextModelValueReference.snapshot(targetModel);
            const i = InlineSuggestionItem.create(item, ref);
            if (disposable) {
              const s = runOnChange(i.identity.onDispose, () => {
                disposable?.dispose();
                s.dispose();
              });
            }
            item.addPerformanceMarker("itemCreated");
            providerSuggestions.push(i);
            if (!i.isInlineEdit && !i.showInlineEditMenu && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
              if (i.isVisible(this._textModel, this._cursorPosition.get())) {
                shouldStopEarly = true;
              }
            }
          }
          if (shouldStopEarly) {
            break;
          }
        }
        providerSuggestions.forEach((s) => s.addPerformanceMarker("providersResolved"));
        const suggestions = await Promise.all(providerSuggestions.map(async (s) => {
          return this._renameProcessor.proposeRenameRefactoring(this._textModel, s, context);
        }));
        suggestions.forEach((s) => s.addPerformanceMarker("renameProcessed"));
        providerResult.cancelAndDispose({ kind: "lostRace" });
        if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
          const didAllProvidersReturn = providerResult.didAllProvidersReturn;
          let error = void 0;
          if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
            error = "canceled";
          }
          const result = suggestions.map((c) => {
            const comp = c.getSourceCompletion();
            if (comp.doNotLog) {
              return void 0;
            }
            const obj = {
              insertText: comp.insertText,
              range: comp.range,
              additionalTextEdits: comp.additionalTextEdits,
              uri: comp.uri,
              command: comp.command,
              gutterMenuLinkAction: comp.gutterMenuLinkAction,
              shownCommand: comp.shownCommand,
              completeBracketPairs: comp.completeBracketPairs,
              isInlineEdit: comp.isInlineEdit,
              showInlineEditMenu: comp.showInlineEditMenu,
              showRange: comp.showRange,
              warning: comp.warning,
              hint: comp.hint,
              supportsRename: comp.supportsRename,
              correlationId: comp.correlationId,
              jumpToPosition: comp.jumpToPosition
            };
            return {
              ...cloneAndChange(obj, (v) => {
                if (Range.isIRange(v)) {
                  return Range.lift(v).toString();
                }
                if (Position.isIPosition(v)) {
                  return Position.lift(v).toString();
                }
                if (Command.is(v)) {
                  return { $commandId: v.id };
                }
                return v;
              }),
              $providerId: c.source.provider.providerId?.toString()
            };
          }).filter((result2) => result2 !== void 0);
          this._log({ sourceId: "InlineCompletions.fetch", kind: "end", requestId, durationMs: Date.now() - startTime.getTime(), error, result, time: Date.now(), didAllProvidersReturn });
        }
        requestResponseInfo.setRequestUuid(providerResult.contextWithUuid.requestUuid);
        if (producedSuggestion) {
          requestResponseInfo.setHasProducedSuggestion();
          if (suggestions.length > 0 && source.token.isCancellationRequested) {
            suggestions.forEach((s) => s.setNotShownReasonIfNotSet("canceled:whileAwaitingOtherProviders"));
          }
        } else {
          if (source.token.isCancellationRequested) {
            requestResponseInfo.setNoSuggestionReasonIfNotSet("canceled:whileFetching");
          } else {
            const completionsQuotaExceeded = this._contextKeyService.getContextKeyValue("completionsQuotaExceeded");
            requestResponseInfo.setNoSuggestionReasonIfNotSet(completionsQuotaExceeded ? "completionsQuotaExceeded" : "noSuggestion");
          }
        }
        const remainingTimeToWait = context.earliestShownDateTime - Date.now();
        if (remainingTimeToWait > 0) {
          await wait(remainingTimeToWait, source.token);
        }
        suggestions.forEach((s) => s.addPerformanceMarker("minShowDelayPassed"));
        if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId || userJumpedToActiveCompletion.get()) {
          const notShownReason = source.token.isCancellationRequested ? "canceled:afterMinShowDelay" : this._store.isDisposed ? "canceled:disposed" : this._textModel.getVersionId() !== request.versionId ? "canceled:documentChanged" : userJumpedToActiveCompletion.get() ? "canceled:userJumped" : "unknown";
          suggestions.forEach((s) => s.setNotShownReasonIfNotSet(notShownReason));
          return false;
        }
        const endTime = /* @__PURE__ */ new Date();
        this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());
        const cursorPosition = this._cursorPosition.get();
        this._updateOperation.clear();
        transaction((tx) => {
          const v = this._state.get();
          if (context.selectedSuggestionInfo) {
            this._state.set({
              inlineCompletions: InlineCompletionsState.createEmpty(),
              suggestWidgetInlineCompletions: v.suggestWidgetInlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion)
            }, tx);
          } else {
            this._state.set({
              inlineCompletions: v.inlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion),
              suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
            }, tx);
          }
          v.inlineCompletions.dispose();
          v.suggestWidgetInlineCompletions.dispose();
        });
      } finally {
        store.dispose();
        decreaseLoadingCount();
        this._sendInlineCompletionsRequestTelemetry(requestResponseInfo);
      }
      return true;
    })();
    const updateOperation = new UpdateOperation(request, source, promise);
    this._updateOperation.value = updateOperation;
    return promise;
  }
  clear(tx) {
    if (this._store.isDisposed) {
      return;
    }
    this._updateOperation.clear();
    const v = this._state.get();
    this._state.set({
      inlineCompletions: InlineCompletionsState.createEmpty(),
      suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
    }, tx);
    v.inlineCompletions.dispose();
    v.suggestWidgetInlineCompletions.dispose();
  }
  seedInlineCompletionsWithSuggestWidget() {
    const inlineCompletions = this.inlineCompletions.get();
    const suggestWidgetInlineCompletions = this.suggestWidgetInlineCompletions.get();
    if (!suggestWidgetInlineCompletions) {
      return;
    }
    transaction((tx) => {
      if (!inlineCompletions || (suggestWidgetInlineCompletions.request?.versionId ?? -1) > (inlineCompletions.request?.versionId ?? -1)) {
        inlineCompletions?.dispose();
        const s = this._state.get();
        this._state.set({
          inlineCompletions: suggestWidgetInlineCompletions.clone(),
          suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
        }, tx);
        s.inlineCompletions.dispose();
        s.suggestWidgetInlineCompletions.dispose();
      }
      this.clearSuggestWidgetInlineCompletions(tx);
    });
  }
  /**
   * Seeds the inline completions with an external inline completion item.
   * Used when transplanting a completion from one model to another (cross-file edits).
   */
  seedWithCompletion(item, tx) {
    const s = this._state.get();
    this._state.set({
      inlineCompletions: new InlineCompletionsState([item], void 0),
      suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
    }, tx);
    s.inlineCompletions.dispose();
    s.suggestWidgetInlineCompletions.dispose();
  }
  _sendInlineCompletionsRequestTelemetry(requestResponseInfo) {
    if (!this._sendRequestData.get() && !this._contextKeyService.getContextKeyValue("isRunningUnificationExperiment")) {
      return;
    }
    if (requestResponseInfo.requestUuid === void 0 || requestResponseInfo.hasProducedSuggestion) {
      return;
    }
    if (!isCompletionsEnabledFromObject(this._completionsEnabled, this._textModel.getLanguageId())) {
      return;
    }
    if (!requestResponseInfo.providers.some((p) => isCopilotLikeExtension(p.providerId?.extensionId))) {
      return;
    }
    const emptyEndOfLifeEvent = {
      opportunityId: requestResponseInfo.requestUuid,
      noSuggestionReason: requestResponseInfo.noSuggestionReason ?? "unknown",
      extensionId: "vscode-core",
      extensionVersion: "0.0.0",
      groupId: "empty",
      shown: false,
      skuPlan: requestResponseInfo.requestInfo.sku?.plan,
      skuType: requestResponseInfo.requestInfo.sku?.type,
      editorType: requestResponseInfo.requestInfo.editorType,
      requestReason: requestResponseInfo.requestInfo.reason,
      typingInterval: requestResponseInfo.requestInfo.typingInterval,
      typingIntervalCharacterCount: requestResponseInfo.requestInfo.typingIntervalCharacterCount,
      languageId: requestResponseInfo.requestInfo.languageId,
      selectedSuggestionInfo: !!requestResponseInfo.context.selectedSuggestionInfo,
      availableProviders: requestResponseInfo.providers.map((p) => p.providerId?.toString()).filter(isDefined).join(","),
      ...forwardToChannelIf(requestResponseInfo.providers.some((p) => isCopilotLikeExtension(p.providerId?.extensionId))),
      timeUntilProviderRequest: void 0,
      timeUntilProviderResponse: void 0,
      viewKind: void 0,
      preceeded: void 0,
      superseded: void 0,
      reason: void 0,
      acceptedAlternativeAction: void 0,
      correlationId: void 0,
      shownDuration: void 0,
      shownDurationUncollapsed: void 0,
      timeUntilShown: void 0,
      partiallyAccepted: void 0,
      partiallyAcceptedCountSinceOriginal: void 0,
      partiallyAcceptedRatioSinceOriginal: void 0,
      partiallyAcceptedCharactersSinceOriginal: void 0,
      cursorColumnDistance: void 0,
      cursorLineDistance: void 0,
      lineCountOriginal: void 0,
      lineCountModified: void 0,
      characterCountOriginal: void 0,
      characterCountModified: void 0,
      disjointReplacements: void 0,
      sameShapeReplacements: void 0,
      longDistanceHintVisible: void 0,
      longDistanceHintDistance: void 0,
      isForAnotherDocument: void 0,
      notShownReason: void 0,
      renameCreated: false,
      renameDuration: void 0,
      renameTimedOut: false,
      renameDroppedOtherEdits: void 0,
      renameDroppedRenameEdits: void 0,
      performanceMarkers: void 0,
      editKind: void 0
    };
    const dataChannel = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
    sendInlineCompletionsEndOfLifeTelemetry(dataChannel, emptyEndOfLifeEvent);
  }
  clearSuggestWidgetInlineCompletions(tx) {
    if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
      this._updateOperation.clear();
    }
  }
  cancelUpdate() {
    this._updateOperation.clear();
  }
};
InlineCompletionsSource._requestId = 0;
InlineCompletionsSource = __decorateClass([
  __decorateParam(4, ILanguageConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, ITextModelService)
], InlineCompletionsSource);
class UpdateRequest {
  constructor(position, context, versionId, providers) {
    this.position = position;
    this.context = context;
    this.versionId = versionId;
    this.providers = providers;
  }
  satisfies(other) {
    return this.position.equals(other.position) && equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, thisEqualsC()) && (other.context.triggerKind === InlineCompletionTriggerKind.Automatic || this.context.triggerKind === InlineCompletionTriggerKind.Explicit) && this.versionId === other.versionId && isSubset(other.providers, this.providers);
  }
  get isExplicitRequest() {
    return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
  }
}
class RequestResponseData {
  constructor(context, requestInfo, providers) {
    this.context = context;
    this.requestInfo = requestInfo;
    this.providers = providers;
    this.hasProducedSuggestion = false;
  }
  setRequestUuid(uuid) {
    this.requestUuid = uuid;
  }
  setNoSuggestionReasonIfNotSet(type) {
    this.noSuggestionReason ??= type;
  }
  setHasProducedSuggestion() {
    this.hasProducedSuggestion = true;
  }
}
function isSubset(set1, set2) {
  return [...set1].every((item) => set2.has(item));
}
class UpdateOperation {
  constructor(request, cancellationTokenSource, promise) {
    this.request = request;
    this.cancellationTokenSource = cancellationTokenSource;
    this.promise = promise;
  }
  dispose() {
    this.cancellationTokenSource.cancel();
  }
}
class InlineCompletionsState extends Disposable {
  constructor(inlineCompletions, request) {
    super();
    this.inlineCompletions = inlineCompletions;
    this.request = request;
    for (const inlineCompletion of this.inlineCompletions) {
      inlineCompletion.addRef();
    }
    this._register({
      dispose: () => {
        for (const inlineCompletion of this.inlineCompletions) {
          inlineCompletion.removeRef();
        }
      }
    });
  }
  static createEmpty() {
    return new InlineCompletionsState([], void 0);
  }
  _findById(id) {
    return this.inlineCompletions.find((i) => i.identity === id);
  }
  _findByHash(hash) {
    return this.inlineCompletions.find((i) => i.hash === hash);
  }
  /**
   * Applies the edit on the state.
  */
  createStateWithAppliedEdit(edit, textModel) {
    const newInlineCompletions = this.inlineCompletions.map((i) => i.withEdit(edit, textModel)).filter(isDefined);
    return new InlineCompletionsState(newInlineCompletions, this.request);
  }
  createStateWithAppliedResults(updatedSuggestions, request, textModel, cursorPosition, itemIdToPreserveAtTop) {
    let itemToPreserve = void 0;
    if (itemIdToPreserveAtTop) {
      const itemToPreserveCandidate = this._findById(itemIdToPreserveAtTop);
      if (itemToPreserveCandidate && itemToPreserveCandidate.canBeReused(textModel, request.position)) {
        itemToPreserve = itemToPreserveCandidate;
        const updatedItemToPreserve = updatedSuggestions.find((i) => i.hash === itemToPreserveCandidate.hash);
        if (updatedItemToPreserve) {
          updatedSuggestions = moveToFront(updatedItemToPreserve, updatedSuggestions);
        } else {
          updatedSuggestions = [itemToPreserveCandidate, ...updatedSuggestions];
        }
      }
    }
    const preferInlineCompletions = itemToPreserve ? !itemToPreserve.isInlineEdit : updatedSuggestions.some((i) => !i.isInlineEdit && i.isVisible(textModel, cursorPosition));
    let updatedItems = [];
    for (const i of updatedSuggestions) {
      const oldItem = this._findByHash(i.hash);
      let item;
      if (oldItem && oldItem !== i) {
        item = i.withIdentity(oldItem.identity);
        i.setIsPreceeded(oldItem);
        oldItem.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() });
      } else {
        item = i;
      }
      if (preferInlineCompletions !== item.isInlineEdit) {
        updatedItems.push(item);
      }
    }
    updatedItems.sort(compareBy((i) => i.showInlineEditMenu, booleanComparator));
    updatedItems = distinctByKey(updatedItems, (i) => i.semanticId);
    return new InlineCompletionsState(updatedItems, request);
  }
  clone() {
    return new InlineCompletionsState(this.inlineCompletions, this.request);
  }
}
function distinctByKey(items, key) {
  const seen = /* @__PURE__ */ new Set();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}
function moveToFront(item, items) {
  const index = items.indexOf(item);
  if (index > -1) {
    return [item, ...items.slice(0, index), ...items.slice(index + 1)];
  }
  return items;
}
export {
  InlineCompletionsSource,
  InlineCompletionsState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lQ29tcGxldGlvbnNTb3VyY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBib29sZWFuQ29tcGFyYXRvciwgY29tcGFyZUJ5LCBjb21wYXJlVW5kZWZpbmVkU21hbGxlc3QsIG51bWJlckNvbXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZmluZExhc3RNYXggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZkRlZmluZWQsIHRoaXNFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVZhbHVlLCByZWNvcmRDaGFuZ2VzTGF6eSwgcnVuT25DaGFuZ2UsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kZWVwLWltcG9ydC1vZi1pbnRlcm5hbFxuaW1wb3J0IHsgb2JzZXJ2YWJsZVJlZHVjZXJTZXR0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9leHBlcmltZW50YWwvcmVkdWNlci5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UsIGZvcndhcmRUb0NoYW5uZWxJZiwgaXNDb3BpbG90TGlrZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2Jyb3dzZXIvZm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbW1hbmQsIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IG9mZnNldEVkaXRGcm9tQ29udGVudENoYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsU3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBpc0NvbXBsZXRpb25zRW5hYmxlZEZyb21PYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvY29tcGxldGlvbnNFbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgZm9ybWF0UmVjb3JkYWJsZUxvZ0VudHJ5LCBJUmVjb3JkYWJsZUVkaXRvckxvZ0VudHJ5LCBJUmVjb3JkYWJsZUxvZ0VudHJ5LCBTdHJ1Y3R1cmVkTG9nZ2VyIH0gZnJvbSAnLi4vc3RydWN0dXJlZExvZ2dlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlRXZlbnQsIHNlbmRJbmxpbmVDb21wbGV0aW9uc0VuZE9mTGlmZVRlbGVtZXRyeSB9IGZyb20gJy4uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyB3YWl0IH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5LCBJbmxpbmVTdWdnZXN0aW9uSXRlbSB9IGZyb20gJy4vaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRXaXRob3V0VXVpZCwgSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvLCBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMsIHJ1bldoZW5DYW5jZWxsZWQgfSBmcm9tICcuL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZW5hbWVTeW1ib2xQcm9jZXNzb3IgfSBmcm9tICcuL3JlbmFtZVN5bWJvbFByb2Nlc3Nvci5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSB9IGZyb20gJy4vdGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ29tcGxldGlvbnNTb3VyY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgX3JlcXVlc3RJZCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlT3BlcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFVwZGF0ZU9wZXJhdGlvbj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2luZ0VuYWJsZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbmRSZXF1ZXN0RGF0YTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJ1Y3R1cmVkRmV0Y2hMb2dnZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSBvYnNlcnZhYmxlUmVkdWNlclNldHRhYmxlKHRoaXMsIHtcblx0XHRpbml0aWFsOiAoKSA9PiAoe1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpLFxuXHRcdH0pLFxuXHRcdGRpc3Bvc2VGaW5hbDogKHZhbHVlcykgPT4ge1xuXHRcdFx0dmFsdWVzLmlubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHRcdHZhbHVlcy5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlc0xhenkoKCkgPT4gKHsgdmVyc2lvbklkOiB0aGlzLl92ZXJzaW9uSWQgfSkpLFxuXHRcdHVwZGF0ZTogKHJlYWRlciwgcHJldmlvdXNWYWx1ZSwgY2hhbmdlcykgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ0VkaXQuY29tcG9zZShjaGFuZ2VzLmNoYW5nZXMubWFwKGMgPT4gYy5jaGFuZ2UgPyBvZmZzZXRFZGl0RnJvbUNvbnRlbnRDaGFuZ2VzKGMuY2hhbmdlLmNoYW5nZXMpIDogU3RyaW5nRWRpdC5lbXB0eSkuZmlsdGVyKGlzRGVmaW5lZCkpO1xuXG5cdFx0XHRpZiAoZWRpdC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0cmV0dXJuIHByZXZpb3VzVmFsdWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlubGluZUNvbXBsZXRpb25zOiBwcmV2aW91c1ZhbHVlLmlubGluZUNvbXBsZXRpb25zLmNyZWF0ZVN0YXRlV2l0aEFwcGxpZWRFZGl0KGVkaXQsIHRoaXMuX3RleHRNb2RlbCksXG5cdFx0XHRcdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiBwcmV2aW91c1ZhbHVlLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5jcmVhdGVTdGF0ZVdpdGhBcHBsaWVkRWRpdChlZGl0LCB0aGlzLl90ZXh0TW9kZWwpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cHJldmlvdXNWYWx1ZS5pbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdHByZXZpb3VzVmFsdWUuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBpbmxpbmVDb21wbGV0aW9ucyA9IHRoaXMuX3N0YXRlLm1hcCh0aGlzLCB2ID0+IHYuaW5saW5lQ29tcGxldGlvbnMpO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zID0gdGhpcy5fc3RhdGUubWFwKHRoaXMsIHYgPT4gdi5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmFtZVByb2Nlc3NvcjogUmVuYW1lU3ltYm9sUHJvY2Vzc29yO1xuXG5cdHByaXZhdGUgX2NvbXBsZXRpb25zRW5hYmxlZDogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnNpb25JZDogSU9ic2VydmFibGVXaXRoQ2hhbmdlPG51bWJlciB8IG51bGwsIElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlVmFsdWU6IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jdXJzb3JQb3NpdGlvbjogSU9ic2VydmFibGU8UG9zaXRpb24+LFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ2dpbmdFbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5sb2dGZXRjaCcsIGZhbHNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX3NlbmRSZXF1ZXN0RGF0YSA9IG9ic2VydmFibGVDb25maWdWYWx1ZSgnZWRpdG9yLmlubGluZVN1Z2dlc3QuZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uJywgdHJ1ZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9zdHJ1Y3R1cmVkRmV0Y2hMb2dnZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdHJ1Y3R1cmVkTG9nZ2VyLmNhc3Q8XG5cdFx0XHR7IGtpbmQ6ICdzdGFydCc7IHJlcXVlc3RJZDogbnVtYmVyOyBjb250ZXh0OiB1bmtub3duIH0gJiBJUmVjb3JkYWJsZUVkaXRvckxvZ0VudHJ5XG5cdFx0XHR8IHsga2luZDogJ2VuZCc7IGVycm9yOiB1bmtub3duOyBkdXJhdGlvbk1zOiBudW1iZXI7IHJlc3VsdDogdW5rbm93bjsgcmVxdWVzdElkOiBudW1iZXIgfSAmIElSZWNvcmRhYmxlTG9nRW50cnlcblx0XHQ+KCksXG5cdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QubG9nRmV0Y2guY29tbWFuZElkJ1xuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVuYW1lUHJvY2Vzc29yID0gdGhpcy5fc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbmFtZVN5bWJvbFByb2Nlc3NvcikpO1xuXG5cdFx0dGhpcy5jbGVhck9wZXJhdGlvbk9uVGV4dE1vZGVsQ2hhbmdlLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IGVuYWJsZW1lbnRTZXR0aW5nID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jb21wbGV0aW9uc0VuYWJsZW1lbnRTZXR0aW5nID8/IHVuZGVmaW5lZDtcblx0XHRpZiAoZW5hYmxlbWVudFNldHRpbmcpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbXBsZXRpb25zRW5hYmxlbWVudChlbmFibGVtZW50U2V0dGluZyk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGVuYWJsZW1lbnRTZXR0aW5nKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbXBsZXRpb25zRW5hYmxlbWVudChlbmFibGVtZW50U2V0dGluZyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb21wbGV0aW9uc0VuYWJsZW1lbnQoZW5hbGVtZW50U2V0dGluZzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UmVjb3JkPHN0cmluZywgYm9vbGVhbj4+KGVuYWxlbWVudFNldHRpbmcpO1xuXHRcdGlmICghaXNPYmplY3QocmVzdWx0KSkge1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbnNFbmFibGVkID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uc0VuYWJsZWQgPSByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGNsZWFyT3BlcmF0aW9uT25UZXh0TW9kZWxDaGFuZ2UgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0dGhpcy5fdmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBhbHdheXMgY29uc3RhbnRcblx0fSk7XG5cblx0cHJpdmF0ZSBfbG9nKGVudHJ5OlxuXHRcdHsgc291cmNlSWQ6IHN0cmluZzsga2luZDogJ3N0YXJ0JzsgcmVxdWVzdElkOiBudW1iZXI7IGNvbnRleHQ6IHVua25vd247IHByb3ZpZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQgfSAmIElSZWNvcmRhYmxlRWRpdG9yTG9nRW50cnlcblx0XHR8IHsgc291cmNlSWQ6IHN0cmluZzsga2luZDogJ2VuZCc7IGVycm9yOiB1bmtub3duOyBkdXJhdGlvbk1zOiBudW1iZXI7IHJlc3VsdDogdW5rbm93bjsgcmVxdWVzdElkOiBudW1iZXI7IGRpZEFsbFByb3ZpZGVyc1JldHVybjogYm9vbGVhbiB9ICYgSVJlY29yZGFibGVMb2dFbnRyeVxuXHQpIHtcblx0XHRpZiAodGhpcy5fbG9nZ2luZ0VuYWJsZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhmb3JtYXRSZWNvcmRhYmxlTG9nRW50cnkoZW50cnkpKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RydWN0dXJlZEZldGNoTG9nZ2VyLmxvZyhlbnRyeSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkaW5nQ291bnQgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdHB1YmxpYyByZWFkb25seSBsb2FkaW5nID0gdGhpcy5fbG9hZGluZ0NvdW50Lm1hcCh0aGlzLCB2ID0+IHYgPiAwKTtcblxuXHRwdWJsaWMgZmV0Y2goXG5cdFx0cHJvdmlkZXJzOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyW10sXG5cdFx0cHJvdmlkZXJzTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkLFxuXHRcdGFjdGl2ZUlubGluZUNvbXBsZXRpb246IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSB8IHVuZGVmaW5lZCxcblx0XHR3aXRoRGVib3VuY2U6IGJvb2xlYW4sXG5cdFx0dXNlckp1bXBlZFRvQWN0aXZlQ29tcGxldGlvbjogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cmVxdWVzdEluZm86IElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mb1xuXHQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2N1cnNvclBvc2l0aW9uLmdldCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgVXBkYXRlUmVxdWVzdChwb3NpdGlvbiwgY29udGV4dCwgdGhpcy5fdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLCBuZXcgU2V0KHByb3ZpZGVycykpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvID8gdGhpcy5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZ2V0KCkgOiB0aGlzLmlubGluZUNvbXBsZXRpb25zLmdldCgpO1xuXG5cdFx0aWYgKHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi52YWx1ZT8ucmVxdWVzdC5zYXRpc2ZpZXMocmVxdWVzdCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl91cGRhdGVPcGVyYXRpb24udmFsdWUucHJvbWlzZTtcblx0XHR9IGVsc2UgaWYgKHRhcmdldD8ucmVxdWVzdD8uc2F0aXNmaWVzKHJlcXVlc3QpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZU9uZ29pbmcgPSAhIXRoaXMuX3VwZGF0ZU9wZXJhdGlvbi52YWx1ZTtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblxuXHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0dGhpcy5fbG9hZGluZ0NvdW50LnNldCh0aGlzLl9sb2FkaW5nQ291bnQuZ2V0KCkgKyAxLCB1bmRlZmluZWQpO1xuXHRcdFx0bGV0IGRpZERlY3JlYXNlID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkZWNyZWFzZUxvYWRpbmdDb3VudCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCFkaWREZWNyZWFzZSkge1xuXHRcdFx0XHRcdGRpZERlY3JlYXNlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9sb2FkaW5nQ291bnQuc2V0KHRoaXMuX2xvYWRpbmdDb3VudC5nZXQoKSAtIDEsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBsb2FkaW5nUmVzZXQgPSBzdG9yZS5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gZGVjcmVhc2VMb2FkaW5nQ291bnQoKSwgMTAgKiAxMDAwKSk7XG5cdFx0XHRsb2FkaW5nUmVzZXQuc2NoZWR1bGUoKTtcblxuXHRcdFx0Y29uc3QgaW5saW5lU3VnZ2VzdGlvbnNQcm92aWRlcnMgPSBwcm92aWRlcnMuZmlsdGVyKHAgPT4gcC5wcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RSZXNwb25zZUluZm8gPSBuZXcgUmVxdWVzdFJlc3BvbnNlRGF0YShjb250ZXh0LCByZXF1ZXN0SW5mbywgaW5saW5lU3VnZ2VzdGlvbnNQcm92aWRlcnMpO1xuXG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlY29tbWVuZGVkRGVib3VuY2VWYWx1ZSA9IHRoaXMuX2RlYm91bmNlVmFsdWUuZ2V0KHRoaXMuX3RleHRNb2RlbCk7XG5cdFx0XHRcdGNvbnN0IGRlYm91bmNlVmFsdWUgPSBmaW5kTGFzdE1heChcblx0XHRcdFx0XHRwcm92aWRlcnMubWFwKHAgPT4gcC5kZWJvdW5jZURlbGF5TXMpLFxuXHRcdFx0XHRcdGNvbXBhcmVVbmRlZmluZWRTbWFsbGVzdChudW1iZXJDb21wYXJhdG9yKVxuXHRcdFx0XHQpID8/IHJlY29tbWVuZGVkRGVib3VuY2VWYWx1ZTtcblxuXHRcdFx0XHQvLyBEZWJvdW5jZSBpbiBhbnkgY2FzZSBpZiB1cGRhdGUgaXMgb25nb2luZ1xuXHRcdFx0XHRjb25zdCBzaG91bGREZWJvdW5jZSA9IHVwZGF0ZU9uZ29pbmcgfHwgKHdpdGhEZWJvdW5jZSAmJiBjb250ZXh0LnRyaWdnZXJLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljKTtcblx0XHRcdFx0aWYgKHNob3VsZERlYm91bmNlKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBkZWJvdW5jZXMgdGhlIG9wZXJhdGlvblxuXHRcdFx0XHRcdGF3YWl0IHdhaXQoZGVib3VuY2VWYWx1ZSwgc291cmNlLnRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IHJlcXVlc3QudmVyc2lvbklkKSB7XG5cdFx0XHRcdFx0cmVxdWVzdFJlc3BvbnNlSW5mby5zZXROb1N1Z2dlc3Rpb25SZWFzb25JZk5vdFNldCgnY2FuY2VsZWQ6YmVmb3JlRmV0Y2gnKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBJbmxpbmVDb21wbGV0aW9uc1NvdXJjZS5fcmVxdWVzdElkKys7XG5cdFx0XHRcdGlmICh0aGlzLl9sb2dnaW5nRW5hYmxlZC5nZXQoKSB8fCB0aGlzLl9zdHJ1Y3R1cmVkRmV0Y2hMb2dnZXIuaXNFbmFibGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKHtcblx0XHRcdFx0XHRcdHNvdXJjZUlkOiAnSW5saW5lQ29tcGxldGlvbnMuZmV0Y2gnLFxuXHRcdFx0XHRcdFx0a2luZDogJ3N0YXJ0Jyxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdFx0XHRcdG1vZGVsVXJpOiB0aGlzLl90ZXh0TW9kZWwudXJpLFxuXHRcdFx0XHRcdFx0bW9kZWxWZXJzaW9uOiB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdFx0XHRjb250ZXh0OiB7IHRyaWdnZXJLaW5kOiBjb250ZXh0LnRyaWdnZXJLaW5kLCBzdWdnZXN0SW5mbzogY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvID8gdHJ1ZSA6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0dGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRcdHByb3ZpZGVyOiBwcm92aWRlcnNMYWJlbCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IG5ldyBEYXRlKCk7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyUmVzdWx0ID0gcHJvdmlkZUlubGluZUNvbXBsZXRpb25zKHByb3ZpZGVycywgdGhpcy5fY3Vyc29yUG9zaXRpb24uZ2V0KCksIHRoaXMuX3RleHRNb2RlbCwgY29udGV4dCwgcmVxdWVzdEluZm8sIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdHJ1bldoZW5DYW5jZWxsZWQoc291cmNlLnRva2VuLCAoKSA9PiBwcm92aWRlclJlc3VsdC5jYW5jZWxBbmREaXNwb3NlKHsga2luZDogJ3Rva2VuQ2FuY2VsbGF0aW9uJyB9KSk7XG5cblx0XHRcdFx0bGV0IHNob3VsZFN0b3BFYXJseSA9IGZhbHNlO1xuXHRcdFx0XHRsZXQgcHJvZHVjZWRTdWdnZXN0aW9uID0gZmFsc2U7XG5cblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWdnZXN0aW9uczogSW5saW5lU3VnZ2VzdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGxpc3Qgb2YgcHJvdmlkZXJSZXN1bHQubGlzdHMpIHtcblx0XHRcdFx0XHRpZiAoIWxpc3QpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsaXN0LmFkZFJlZigpO1xuXHRcdFx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbGlzdC5yZW1vdmVSZWYobGlzdC5pbmxpbmVTdWdnZXN0aW9uc0RhdGEubGVuZ3RoID09PSAwID8geyBraW5kOiAnZW1wdHknIH0gOiB7IGtpbmQ6ICdub3RUYWtlbicgfSkpKTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBsaXN0LmlubGluZVN1Z2dlc3Rpb25zRGF0YSkge1xuXHRcdFx0XHRcdFx0cHJvZHVjZWRTdWdnZXN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGlmICghY29udGV4dC5pbmNsdWRlSW5saW5lRWRpdHMgJiYgKGl0ZW0uaXNJbmxpbmVFZGl0IHx8IGl0ZW0uc2hvd0lubGluZUVkaXRNZW51KSkge1xuXHRcdFx0XHRcdFx0XHRpdGVtLnNldE5vdFNob3duUmVhc29uKCdub3RJbmxpbmVFZGl0UmVxdWVzdGVkJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFjb250ZXh0LmluY2x1ZGVJbmxpbmVDb21wbGV0aW9ucyAmJiAhKGl0ZW0uaXNJbmxpbmVFZGl0IHx8IGl0ZW0uc2hvd0lubGluZUVkaXRNZW51KSkge1xuXHRcdFx0XHRcdFx0XHRpdGVtLnNldE5vdFNob3duUmVhc29uKCdub3RJbmxpbmVDb21wbGV0aW9uUmVxdWVzdGVkJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpdGVtLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdwcm92aWRlclJldHVybmVkJyk7XG5cblx0XHRcdFx0XHRcdGNvbnN0IHRhcmdldFVyaSA9IGl0ZW0uYWN0aW9uPy51cmk7XG5cdFx0XHRcdFx0XHRsZXQgdGFyZ2V0TW9kZWw6IElUZXh0TW9kZWw7XG5cdFx0XHRcdFx0XHRsZXQgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdGlmICh0YXJnZXRVcmkgJiYgdGFyZ2V0VXJpLnRvU3RyaW5nKCkgIT09IHRoaXMuX3RleHRNb2RlbC51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodGFyZ2V0VXJpKTtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0TW9kZWwgPSBtb2RlbFJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlID0gbW9kZWxSZWY7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXRNb2RlbCA9IHRoaXMuX3RleHRNb2RlbDtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVmID0gVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2Uuc25hcHNob3QodGFyZ2V0TW9kZWwpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBpID0gSW5saW5lU3VnZ2VzdGlvbkl0ZW0uY3JlYXRlKGl0ZW0sIHJlZik7XG5cdFx0XHRcdFx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzID0gcnVuT25DaGFuZ2UoaS5pZGVudGl0eS5vbkRpc3Bvc2UsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0cy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpdGVtLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdpdGVtQ3JlYXRlZCcpO1xuXHRcdFx0XHRcdFx0cHJvdmlkZXJTdWdnZXN0aW9ucy5wdXNoKGkpO1xuXHRcdFx0XHRcdFx0Ly8gU3RvcCBhZnRlciBmaXJzdCB2aXNpYmxlIGlubGluZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0XHRpZiAoIWkuaXNJbmxpbmVFZGl0ICYmICFpLnNob3dJbmxpbmVFZGl0TWVudSAmJiBjb250ZXh0LnRyaWdnZXJLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuQXV0b21hdGljKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpLmlzVmlzaWJsZSh0aGlzLl90ZXh0TW9kZWwsIHRoaXMuX2N1cnNvclBvc2l0aW9uLmdldCgpKSkge1xuXHRcdFx0XHRcdFx0XHRcdHNob3VsZFN0b3BFYXJseSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc2hvdWxkU3RvcEVhcmx5KSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm92aWRlclN1Z2dlc3Rpb25zLmZvckVhY2gocyA9PiBzLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdwcm92aWRlcnNSZXNvbHZlZCcpKTtcblxuXHRcdFx0XHRjb25zdCBzdWdnZXN0aW9uczogSW5saW5lU3VnZ2VzdGlvbkl0ZW1bXSA9IGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVyU3VnZ2VzdGlvbnMubWFwKGFzeW5jIHMgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZW5hbWVQcm9jZXNzb3IucHJvcG9zZVJlbmFtZVJlZmFjdG9yaW5nKHRoaXMuX3RleHRNb2RlbCwgcywgY29udGV4dCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRzdWdnZXN0aW9ucy5mb3JFYWNoKHMgPT4gcy5hZGRQZXJmb3JtYW5jZU1hcmtlcigncmVuYW1lUHJvY2Vzc2VkJykpO1xuXG5cdFx0XHRcdHByb3ZpZGVyUmVzdWx0LmNhbmNlbEFuZERpc3Bvc2UoeyBraW5kOiAnbG9zdFJhY2UnIH0pO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9sb2dnaW5nRW5hYmxlZC5nZXQoKSB8fCB0aGlzLl9zdHJ1Y3R1cmVkRmV0Y2hMb2dnZXIuaXNFbmFibGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlkQWxsUHJvdmlkZXJzUmV0dXJuID0gcHJvdmlkZXJSZXN1bHQuZGlkQWxsUHJvdmlkZXJzUmV0dXJuO1xuXHRcdFx0XHRcdGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChzb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IHJlcXVlc3QudmVyc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRlcnJvciA9ICdjYW5jZWxlZCc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHN1Z2dlc3Rpb25zLm1hcChjID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbXAgPSBjLmdldFNvdXJjZUNvbXBsZXRpb24oKTtcblx0XHRcdFx0XHRcdGlmIChjb21wLmRvTm90TG9nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBvYmogPSB7XG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGNvbXAuaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IGNvbXAucmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxUZXh0RWRpdHM6IGNvbXAuYWRkaXRpb25hbFRleHRFZGl0cyxcblx0XHRcdFx0XHRcdFx0dXJpOiBjb21wLnVyaSxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogY29tcC5jb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRndXR0ZXJNZW51TGlua0FjdGlvbjogY29tcC5ndXR0ZXJNZW51TGlua0FjdGlvbixcblx0XHRcdFx0XHRcdFx0c2hvd25Db21tYW5kOiBjb21wLnNob3duQ29tbWFuZCxcblx0XHRcdFx0XHRcdFx0Y29tcGxldGVCcmFja2V0UGFpcnM6IGNvbXAuY29tcGxldGVCcmFja2V0UGFpcnMsXG5cdFx0XHRcdFx0XHRcdGlzSW5saW5lRWRpdDogY29tcC5pc0lubGluZUVkaXQsXG5cdFx0XHRcdFx0XHRcdHNob3dJbmxpbmVFZGl0TWVudTogY29tcC5zaG93SW5saW5lRWRpdE1lbnUsXG5cdFx0XHRcdFx0XHRcdHNob3dSYW5nZTogY29tcC5zaG93UmFuZ2UsXG5cdFx0XHRcdFx0XHRcdHdhcm5pbmc6IGNvbXAud2FybmluZyxcblx0XHRcdFx0XHRcdFx0aGludDogY29tcC5oaW50LFxuXHRcdFx0XHRcdFx0XHRzdXBwb3J0c1JlbmFtZTogY29tcC5zdXBwb3J0c1JlbmFtZSxcblx0XHRcdFx0XHRcdFx0Y29ycmVsYXRpb25JZDogY29tcC5jb3JyZWxhdGlvbklkLFxuXHRcdFx0XHRcdFx0XHRqdW1wVG9Qb3NpdGlvbjogY29tcC5qdW1wVG9Qb3NpdGlvbixcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHQuLi4oY2xvbmVBbmRDaGFuZ2Uob2JqLCB2ID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoUmFuZ2UuaXNJUmFuZ2UodikpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBSYW5nZS5saWZ0KHYpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChQb3NpdGlvbi5pc0lQb3NpdGlvbih2KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIFBvc2l0aW9uLmxpZnQodikudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKENvbW1hbmQuaXModikpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7ICRjb21tYW5kSWQ6IHYuaWQgfTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHRcdFx0XHRcdH0pIGFzIG9iamVjdCksXG5cdFx0XHRcdFx0XHRcdCRwcm92aWRlcklkOiBjLnNvdXJjZS5wcm92aWRlci5wcm92aWRlcklkPy50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KS5maWx0ZXIocmVzdWx0ID0+IHJlc3VsdCAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRcdHRoaXMuX2xvZyh7IHNvdXJjZUlkOiAnSW5saW5lQ29tcGxldGlvbnMuZmV0Y2gnLCBraW5kOiAnZW5kJywgcmVxdWVzdElkLCBkdXJhdGlvbk1zOiAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZS5nZXRUaW1lKCkpLCBlcnJvciwgcmVzdWx0LCB0aW1lOiBEYXRlLm5vdygpLCBkaWRBbGxQcm92aWRlcnNSZXR1cm4gfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvLnNldFJlcXVlc3RVdWlkKHByb3ZpZGVyUmVzdWx0LmNvbnRleHRXaXRoVXVpZC5yZXF1ZXN0VXVpZCk7XG5cdFx0XHRcdGlmIChwcm9kdWNlZFN1Z2dlc3Rpb24pIHtcblx0XHRcdFx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvLnNldEhhc1Byb2R1Y2VkU3VnZ2VzdGlvbigpO1xuXHRcdFx0XHRcdGlmIChzdWdnZXN0aW9ucy5sZW5ndGggPiAwICYmIHNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0c3VnZ2VzdGlvbnMuZm9yRWFjaChzID0+IHMuc2V0Tm90U2hvd25SZWFzb25JZk5vdFNldCgnY2FuY2VsZWQ6d2hpbGVBd2FpdGluZ090aGVyUHJvdmlkZXJzJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoc291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvLnNldE5vU3VnZ2VzdGlvblJlYXNvbklmTm90U2V0KCdjYW5jZWxlZDp3aGlsZUZldGNoaW5nJyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPignY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkJyk7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvLnNldE5vU3VnZ2VzdGlvblJlYXNvbklmTm90U2V0KGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCA/ICdjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQnIDogJ25vU3VnZ2VzdGlvbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZ1RpbWVUb1dhaXQgPSBjb250ZXh0LmVhcmxpZXN0U2hvd25EYXRlVGltZSAtIERhdGUubm93KCk7XG5cdFx0XHRcdGlmIChyZW1haW5pbmdUaW1lVG9XYWl0ID4gMCkge1xuXHRcdFx0XHRcdGF3YWl0IHdhaXQocmVtYWluaW5nVGltZVRvV2FpdCwgc291cmNlLnRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN1Z2dlc3Rpb25zLmZvckVhY2gocyA9PiBzLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdtaW5TaG93RGVsYXlQYXNzZWQnKSk7XG5cblx0XHRcdFx0aWYgKHNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkIHx8IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gcmVxdWVzdC52ZXJzaW9uSWRcblx0XHRcdFx0XHR8fCB1c2VySnVtcGVkVG9BY3RpdmVDb21wbGV0aW9uLmdldCgpICAvKiBJbiB0aGUgbWVhbnRpbWUgdGhlIHVzZXIgc2hvd2VkIGludGVyZXN0IGZvciB0aGUgYWN0aXZlIGNvbXBsZXRpb24gc28gZG9udCBoaWRlIGl0ICovKSB7XG5cdFx0XHRcdFx0Y29uc3Qgbm90U2hvd25SZWFzb24gPVxuXHRcdFx0XHRcdFx0c291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID8gJ2NhbmNlbGVkOmFmdGVyTWluU2hvd0RlbGF5JyA6XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgPyAnY2FuY2VsZWQ6ZGlzcG9zZWQnIDpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkgIT09IHJlcXVlc3QudmVyc2lvbklkID8gJ2NhbmNlbGVkOmRvY3VtZW50Q2hhbmdlZCcgOlxuXHRcdFx0XHRcdFx0XHRcdFx0dXNlckp1bXBlZFRvQWN0aXZlQ29tcGxldGlvbi5nZXQoKSA/ICdjYW5jZWxlZDp1c2VySnVtcGVkJyA6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd1bmtub3duJztcblx0XHRcdFx0XHRzdWdnZXN0aW9ucy5mb3JFYWNoKHMgPT4gcy5zZXROb3RTaG93blJlYXNvbklmTm90U2V0KG5vdFNob3duUmVhc29uKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZW5kVGltZSA9IG5ldyBEYXRlKCk7XG5cdFx0XHRcdHRoaXMuX2RlYm91bmNlVmFsdWUudXBkYXRlKHRoaXMuX3RleHRNb2RlbCwgZW5kVGltZS5nZXRUaW1lKCkgLSBzdGFydFRpbWUuZ2V0VGltZSgpKTtcblxuXHRcdFx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHRoaXMuX2N1cnNvclBvc2l0aW9uLmdldCgpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gVXBkYXRlIGNvbXBsZXRpb25zIHdpdGggcHJvdmlkZXIgcmVzdWx0ICovXG5cdFx0XHRcdFx0Y29uc3QgdiA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXG5cdFx0XHRcdFx0aWYgKGNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbykge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHRcdFx0XHRcdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiB2LnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5jcmVhdGVTdGF0ZVdpdGhBcHBsaWVkUmVzdWx0cyhzdWdnZXN0aW9ucywgcmVxdWVzdCwgdGhpcy5fdGV4dE1vZGVsLCBjdXJzb3JQb3NpdGlvbiwgYWN0aXZlSW5saW5lQ29tcGxldGlvbiksXG5cdFx0XHRcdFx0XHR9LCB0eCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdFx0XHRcdGlubGluZUNvbXBsZXRpb25zOiB2LmlubGluZUNvbXBsZXRpb25zLmNyZWF0ZVN0YXRlV2l0aEFwcGxpZWRSZXN1bHRzKHN1Z2dlc3Rpb25zLCByZXF1ZXN0LCB0aGlzLl90ZXh0TW9kZWwsIGN1cnNvclBvc2l0aW9uLCBhY3RpdmVJbmxpbmVDb21wbGV0aW9uKSxcblx0XHRcdFx0XHRcdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KCksXG5cdFx0XHRcdFx0XHR9LCB0eCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0di5pbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0di5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGVjcmVhc2VMb2FkaW5nQ291bnQoKTtcblx0XHRcdFx0dGhpcy5fc2VuZElubGluZUNvbXBsZXRpb25zUmVxdWVzdFRlbGVtZXRyeShyZXF1ZXN0UmVzcG9uc2VJbmZvKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSkoKTtcblxuXHRcdGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiA9IG5ldyBVcGRhdGVPcGVyYXRpb24ocmVxdWVzdCwgc291cmNlLCBwcm9taXNlKTtcblx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24udmFsdWUgPSB1cGRhdGVPcGVyYXRpb247XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhcih0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlT3BlcmF0aW9uLmNsZWFyKCk7XG5cdFx0Y29uc3QgdiA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uczogSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpLFxuXHRcdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KClcblx0XHR9LCB0eCk7XG5cdFx0di5pbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0di5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIHNlZWRJbmxpbmVDb21wbGV0aW9uc1dpdGhTdWdnZXN0V2lkZ2V0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGlubGluZUNvbXBsZXRpb25zID0gdGhpcy5pbmxpbmVDb21wbGV0aW9ucy5nZXQoKTtcblx0XHRjb25zdCBzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLnN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5nZXQoKTtcblx0XHRpZiAoIXN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFNlZWQgaW5saW5lIGNvbXBsZXRpb25zIHdpdGggKG5ld2VyKSBzdWdnZXN0IHdpZGdldCBpbmxpbmUgY29tcGxldGlvbnMgKi9cblx0XHRcdGlmICghaW5saW5lQ29tcGxldGlvbnMgfHwgKHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5yZXF1ZXN0Py52ZXJzaW9uSWQgPz8gLTEpID4gKGlubGluZUNvbXBsZXRpb25zLnJlcXVlc3Q/LnZlcnNpb25JZCA/PyAtMSkpIHtcblx0XHRcdFx0aW5saW5lQ29tcGxldGlvbnM/LmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgcyA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHRcdGlubGluZUNvbXBsZXRpb25zOiBzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuY2xvbmUoKSxcblx0XHRcdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHRcdFx0fSwgdHgpO1xuXHRcdFx0XHRzLmlubGluZUNvbXBsZXRpb25zLmRpc3Bvc2UoKTtcblx0XHRcdFx0cy5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jbGVhclN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucyh0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2VlZHMgdGhlIGlubGluZSBjb21wbGV0aW9ucyB3aXRoIGFuIGV4dGVybmFsIGlubGluZSBjb21wbGV0aW9uIGl0ZW0uXG5cdCAqIFVzZWQgd2hlbiB0cmFuc3BsYW50aW5nIGEgY29tcGxldGlvbiBmcm9tIG9uZSBtb2RlbCB0byBhbm90aGVyIChjcm9zcy1maWxlIGVkaXRzKS5cblx0ICovXG5cdHB1YmxpYyBzZWVkV2l0aENvbXBsZXRpb24oaXRlbTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0sIHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdGlubGluZUNvbXBsZXRpb25zOiBuZXcgSW5saW5lQ29tcGxldGlvbnNTdGF0ZShbaXRlbV0sIHVuZGVmaW5lZCksXG5cdFx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSxcblx0XHR9LCB0eCk7XG5cdFx0cy5pbmxpbmVDb21wbGV0aW9ucy5kaXNwb3NlKCk7XG5cdFx0cy5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZElubGluZUNvbXBsZXRpb25zUmVxdWVzdFRlbGVtZXRyeShcblx0XHRyZXF1ZXN0UmVzcG9uc2VJbmZvOiBSZXF1ZXN0UmVzcG9uc2VEYXRhXG5cdCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2VuZFJlcXVlc3REYXRhLmdldCgpICYmICF0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ2lzUnVubmluZ1VuaWZpY2F0aW9uRXhwZXJpbWVudCcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlcXVlc3RSZXNwb25zZUluZm8ucmVxdWVzdFV1aWQgPT09IHVuZGVmaW5lZCB8fCByZXF1ZXN0UmVzcG9uc2VJbmZvLmhhc1Byb2R1Y2VkU3VnZ2VzdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0aWYgKCFpc0NvbXBsZXRpb25zRW5hYmxlZEZyb21PYmplY3QodGhpcy5fY29tcGxldGlvbnNFbmFibGVkLCB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghcmVxdWVzdFJlc3BvbnNlSW5mby5wcm92aWRlcnMuc29tZShwID0+IGlzQ29waWxvdExpa2VFeHRlbnNpb24ocC5wcm92aWRlcklkPy5leHRlbnNpb25JZCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1wdHlFbmRPZkxpZmVFdmVudDogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZUV2ZW50ID0ge1xuXHRcdFx0b3Bwb3J0dW5pdHlJZDogcmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0VXVpZCxcblx0XHRcdG5vU3VnZ2VzdGlvblJlYXNvbjogcmVxdWVzdFJlc3BvbnNlSW5mby5ub1N1Z2dlc3Rpb25SZWFzb24gPz8gJ3Vua25vd24nLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6ICd2c2NvZGUtY29yZScsXG5cdFx0XHRleHRlbnNpb25WZXJzaW9uOiAnMC4wLjAnLFxuXHRcdFx0Z3JvdXBJZDogJ2VtcHR5Jyxcblx0XHRcdHNob3duOiBmYWxzZSxcblx0XHRcdHNrdVBsYW46IHJlcXVlc3RSZXNwb25zZUluZm8ucmVxdWVzdEluZm8uc2t1Py5wbGFuLFxuXHRcdFx0c2t1VHlwZTogcmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0SW5mby5za3U/LnR5cGUsXG5cdFx0XHRlZGl0b3JUeXBlOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLmVkaXRvclR5cGUsXG5cdFx0XHRyZXF1ZXN0UmVhc29uOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLnJlYXNvbixcblx0XHRcdHR5cGluZ0ludGVydmFsOiByZXF1ZXN0UmVzcG9uc2VJbmZvLnJlcXVlc3RJbmZvLnR5cGluZ0ludGVydmFsLFxuXHRcdFx0dHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudDogcmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0SW5mby50eXBpbmdJbnRlcnZhbENoYXJhY3RlckNvdW50LFxuXHRcdFx0bGFuZ3VhZ2VJZDogcmVxdWVzdFJlc3BvbnNlSW5mby5yZXF1ZXN0SW5mby5sYW5ndWFnZUlkLFxuXHRcdFx0c2VsZWN0ZWRTdWdnZXN0aW9uSW5mbzogISFyZXF1ZXN0UmVzcG9uc2VJbmZvLmNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbyxcblx0XHRcdGF2YWlsYWJsZVByb3ZpZGVyczogcmVxdWVzdFJlc3BvbnNlSW5mby5wcm92aWRlcnMubWFwKHAgPT4gcC5wcm92aWRlcklkPy50b1N0cmluZygpKS5maWx0ZXIoaXNEZWZpbmVkKS5qb2luKCcsJyksXG5cdFx0XHQuLi5mb3J3YXJkVG9DaGFubmVsSWYocmVxdWVzdFJlc3BvbnNlSW5mby5wcm92aWRlcnMuc29tZShwID0+IGlzQ29waWxvdExpa2VFeHRlbnNpb24ocC5wcm92aWRlcklkPy5leHRlbnNpb25JZCkpKSxcblx0XHRcdHRpbWVVbnRpbFByb3ZpZGVyUmVxdWVzdDogdW5kZWZpbmVkLFxuXHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXNwb25zZTogdW5kZWZpbmVkLFxuXHRcdFx0dmlld0tpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHByZWNlZWRlZDogdW5kZWZpbmVkLFxuXHRcdFx0c3VwZXJzZWRlZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRhY2NlcHRlZEFsdGVybmF0aXZlQWN0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRjb3JyZWxhdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRzaG93bkR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzaG93bkR1cmF0aW9uVW5jb2xsYXBzZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHRpbWVVbnRpbFNob3duOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZDogdW5kZWZpbmVkLFxuXHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRDb3VudFNpbmNlT3JpZ2luYWw6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkUmF0aW9TaW5jZU9yaWdpbmFsOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZENoYXJhY3RlcnNTaW5jZU9yaWdpbmFsOiB1bmRlZmluZWQsXG5cdFx0XHRjdXJzb3JDb2x1bW5EaXN0YW5jZTogdW5kZWZpbmVkLFxuXHRcdFx0Y3Vyc29yTGluZURpc3RhbmNlOiB1bmRlZmluZWQsXG5cdFx0XHRsaW5lQ291bnRPcmlnaW5hbDogdW5kZWZpbmVkLFxuXHRcdFx0bGluZUNvdW50TW9kaWZpZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGNoYXJhY3RlckNvdW50T3JpZ2luYWw6IHVuZGVmaW5lZCxcblx0XHRcdGNoYXJhY3RlckNvdW50TW9kaWZpZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGRpc2pvaW50UmVwbGFjZW1lbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRzYW1lU2hhcGVSZXBsYWNlbWVudHM6IHVuZGVmaW5lZCxcblx0XHRcdGxvbmdEaXN0YW5jZUhpbnRWaXNpYmxlOiB1bmRlZmluZWQsXG5cdFx0XHRsb25nRGlzdGFuY2VIaW50RGlzdGFuY2U6IHVuZGVmaW5lZCxcblx0XHRcdGlzRm9yQW5vdGhlckRvY3VtZW50OiB1bmRlZmluZWQsXG5cdFx0XHRub3RTaG93blJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVuYW1lQ3JlYXRlZDogZmFsc2UsXG5cdFx0XHRyZW5hbWVEdXJhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0cmVuYW1lVGltZWRPdXQ6IGZhbHNlLFxuXHRcdFx0cmVuYW1lRHJvcHBlZE90aGVyRWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdHJlbmFtZURyb3BwZWRSZW5hbWVFZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0cGVyZm9ybWFuY2VNYXJrZXJzOiB1bmRlZmluZWQsXG5cdFx0XHRlZGl0S2luZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHRjb25zdCBkYXRhQ2hhbm5lbCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHNlbmRJbmxpbmVDb21wbGV0aW9uc0VuZE9mTGlmZVRlbGVtZXRyeShkYXRhQ2hhbm5lbCwgZW1wdHlFbmRPZkxpZmVFdmVudCk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJTdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnModHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl91cGRhdGVPcGVyYXRpb24udmFsdWU/LnJlcXVlc3QuY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVPcGVyYXRpb24uY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2FuY2VsVXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZU9wZXJhdGlvbi5jbGVhcigpO1xuXHR9XG59XG5cbmNsYXNzIFVwZGF0ZVJlcXVlc3Qge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkLFxuXHRcdHB1YmxpYyByZWFkb25seSB2ZXJzaW9uSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZXJzOiBTZXQ8SW5saW5lQ29tcGxldGlvbnNQcm92aWRlcj4sXG5cdCkge1xuXHR9XG5cblx0cHVibGljIHNhdGlzZmllcyhvdGhlcjogVXBkYXRlUmVxdWVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnBvc2l0aW9uLmVxdWFscyhvdGhlci5wb3NpdGlvbilcblx0XHRcdCYmIGVxdWFsc0lmRGVmaW5lZCh0aGlzLmNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mbywgb3RoZXIuY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvLCB0aGlzRXF1YWxzQygpKVxuXHRcdFx0JiYgKG90aGVyLmNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWNcblx0XHRcdFx0fHwgdGhpcy5jb250ZXh0LnRyaWdnZXJLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXQpXG5cdFx0XHQmJiB0aGlzLnZlcnNpb25JZCA9PT0gb3RoZXIudmVyc2lvbklkXG5cdFx0XHQmJiBpc1N1YnNldChvdGhlci5wcm92aWRlcnMsIHRoaXMucHJvdmlkZXJzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNFeHBsaWNpdFJlcXVlc3QoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dC50cmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0O1xuXHR9XG59XG5cbmNsYXNzIFJlcXVlc3RSZXNwb25zZURhdGEge1xuXHRwdWJsaWMgcmVxdWVzdFV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIG5vU3VnZ2VzdGlvblJlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgaGFzUHJvZHVjZWRTdWdnZXN0aW9uID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3RJbmZvOiBJbmxpbmVTdWdnZXN0UmVxdWVzdEluZm8sXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVyczogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcltdLFxuXHQpIHsgfVxuXG5cdHNldFJlcXVlc3RVdWlkKHV1aWQ6IHN0cmluZykge1xuXHRcdHRoaXMucmVxdWVzdFV1aWQgPSB1dWlkO1xuXHR9XG5cblx0c2V0Tm9TdWdnZXN0aW9uUmVhc29uSWZOb3RTZXQodHlwZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5ub1N1Z2dlc3Rpb25SZWFzb24gPz89IHR5cGU7XG5cdH1cblxuXHRzZXRIYXNQcm9kdWNlZFN1Z2dlc3Rpb24oKSB7XG5cdFx0dGhpcy5oYXNQcm9kdWNlZFN1Z2dlc3Rpb24gPSB0cnVlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU3Vic2V0PFQ+KHNldDE6IFNldDxUPiwgc2V0MjogU2V0PFQ+KTogYm9vbGVhbiB7XG5cdHJldHVybiBbLi4uc2V0MV0uZXZlcnkoaXRlbSA9PiBzZXQyLmhhcyhpdGVtKSk7XG59XG5cbmNsYXNzIFVwZGF0ZU9wZXJhdGlvbiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3Q6IFVwZGF0ZVJlcXVlc3QsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxib29sZWFuPixcblx0KSB7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUNvbXBsZXRpb25zU3RhdGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHN0YXRpYyBjcmVhdGVFbXB0eSgpOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIHtcblx0XHRyZXR1cm4gbmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUoW10sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lQ29tcGxldGlvbnM6IHJlYWRvbmx5IElubGluZVN1Z2dlc3Rpb25JdGVtW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3Q6IFVwZGF0ZVJlcXVlc3QgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRmb3IgKGNvbnN0IGlubGluZUNvbXBsZXRpb24gb2YgdGhpcy5pbmxpbmVDb21wbGV0aW9ucykge1xuXHRcdFx0aW5saW5lQ29tcGxldGlvbi5hZGRSZWYoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgaW5saW5lQ29tcGxldGlvbiBvZiB0aGlzLmlubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbi5yZW1vdmVSZWYoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEJ5SWQoaWQ6IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSk6IElubGluZVN1Z2dlc3Rpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVDb21wbGV0aW9ucy5maW5kKGkgPT4gaS5pZGVudGl0eSA9PT0gaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEJ5SGFzaChoYXNoOiBzdHJpbmcpOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lQ29tcGxldGlvbnMuZmluZChpID0+IGkuaGFzaCA9PT0gaGFzaCk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyB0aGUgZWRpdCBvbiB0aGUgc3RhdGUuXG5cdCovXG5cdHB1YmxpYyBjcmVhdGVTdGF0ZVdpdGhBcHBsaWVkRWRpdChlZGl0OiBTdHJpbmdFZGl0LCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIHtcblx0XHRjb25zdCBuZXdJbmxpbmVDb21wbGV0aW9ucyA9IHRoaXMuaW5saW5lQ29tcGxldGlvbnMubWFwKGkgPT4gaS53aXRoRWRpdChlZGl0LCB0ZXh0TW9kZWwpKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHRyZXR1cm4gbmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUobmV3SW5saW5lQ29tcGxldGlvbnMsIHRoaXMucmVxdWVzdCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU3RhdGVXaXRoQXBwbGllZFJlc3VsdHModXBkYXRlZFN1Z2dlc3Rpb25zOiBJbmxpbmVTdWdnZXN0aW9uSXRlbVtdLCByZXF1ZXN0OiBVcGRhdGVSZXF1ZXN0LCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGN1cnNvclBvc2l0aW9uOiBQb3NpdGlvbiwgaXRlbUlkVG9QcmVzZXJ2ZUF0VG9wOiBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkgfCB1bmRlZmluZWQpOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIHtcblx0XHRsZXQgaXRlbVRvUHJlc2VydmU6IElubGluZVN1Z2dlc3Rpb25JdGVtIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpdGVtSWRUb1ByZXNlcnZlQXRUb3ApIHtcblx0XHRcdGNvbnN0IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlID0gdGhpcy5fZmluZEJ5SWQoaXRlbUlkVG9QcmVzZXJ2ZUF0VG9wKTtcblx0XHRcdGlmIChpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZSAmJiBpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZS5jYW5CZVJldXNlZCh0ZXh0TW9kZWwsIHJlcXVlc3QucG9zaXRpb24pKSB7XG5cdFx0XHRcdGl0ZW1Ub1ByZXNlcnZlID0gaXRlbVRvUHJlc2VydmVDYW5kaWRhdGU7XG5cblx0XHRcdFx0Y29uc3QgdXBkYXRlZEl0ZW1Ub1ByZXNlcnZlID0gdXBkYXRlZFN1Z2dlc3Rpb25zLmZpbmQoaSA9PiBpLmhhc2ggPT09IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlLmhhc2gpO1xuXHRcdFx0XHRpZiAodXBkYXRlZEl0ZW1Ub1ByZXNlcnZlKSB7XG5cdFx0XHRcdFx0dXBkYXRlZFN1Z2dlc3Rpb25zID0gbW92ZVRvRnJvbnQodXBkYXRlZEl0ZW1Ub1ByZXNlcnZlLCB1cGRhdGVkU3VnZ2VzdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHVwZGF0ZWRTdWdnZXN0aW9ucyA9IFtpdGVtVG9QcmVzZXJ2ZUNhbmRpZGF0ZSwgLi4udXBkYXRlZFN1Z2dlc3Rpb25zXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByZWZlcklubGluZUNvbXBsZXRpb25zID0gaXRlbVRvUHJlc2VydmVcblx0XHRcdC8vIGl0ZW1Ub1ByZXNlcnZlIGhhcyBwcmVjZWRlbmNlXG5cdFx0XHQ/ICFpdGVtVG9QcmVzZXJ2ZS5pc0lubGluZUVkaXRcblx0XHRcdC8vIE90aGVyd2lzZTogcHJlZmVyIGlubGluZSBjb21wbGV0aW9uIGlmIHRoZXJlIGlzIGEgdmlzaWJsZSBvbmVcblx0XHRcdDogdXBkYXRlZFN1Z2dlc3Rpb25zLnNvbWUoaSA9PiAhaS5pc0lubGluZUVkaXQgJiYgaS5pc1Zpc2libGUodGV4dE1vZGVsLCBjdXJzb3JQb3NpdGlvbikpO1xuXG5cdFx0bGV0IHVwZGF0ZWRJdGVtczogSW5saW5lU3VnZ2VzdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaSBvZiB1cGRhdGVkU3VnZ2VzdGlvbnMpIHtcblx0XHRcdGNvbnN0IG9sZEl0ZW0gPSB0aGlzLl9maW5kQnlIYXNoKGkuaGFzaCk7XG5cdFx0XHRsZXQgaXRlbTtcblx0XHRcdGlmIChvbGRJdGVtICYmIG9sZEl0ZW0gIT09IGkpIHtcblx0XHRcdFx0aXRlbSA9IGkud2l0aElkZW50aXR5KG9sZEl0ZW0uaWRlbnRpdHkpO1xuXHRcdFx0XHRpLnNldElzUHJlY2VlZGVkKG9sZEl0ZW0pO1xuXHRcdFx0XHRvbGRJdGVtLnNldEVuZE9mTGlmZVJlYXNvbih7IGtpbmQ6IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQsIHVzZXJUeXBpbmdEaXNhZ3JlZWQ6IGZhbHNlLCBzdXBlcnNlZGVkQnk6IGkuZ2V0U291cmNlQ29tcGxldGlvbigpIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbSA9IGk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJlZmVySW5saW5lQ29tcGxldGlvbnMgIT09IGl0ZW0uaXNJbmxpbmVFZGl0KSB7XG5cdFx0XHRcdHVwZGF0ZWRJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHVwZGF0ZWRJdGVtcy5zb3J0KGNvbXBhcmVCeShpID0+IGkuc2hvd0lubGluZUVkaXRNZW51LCBib29sZWFuQ29tcGFyYXRvcikpO1xuXHRcdHVwZGF0ZWRJdGVtcyA9IGRpc3RpbmN0QnlLZXkodXBkYXRlZEl0ZW1zLCBpID0+IGkuc2VtYW50aWNJZCk7XG5cblx0XHRyZXR1cm4gbmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUodXBkYXRlZEl0ZW1zLCByZXF1ZXN0KTtcblx0fVxuXG5cdHB1YmxpYyBjbG9uZSgpOiBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIHtcblx0XHRyZXR1cm4gbmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUodGhpcy5pbmxpbmVDb21wbGV0aW9ucywgdGhpcy5yZXF1ZXN0KTtcblx0fVxufVxuXG4vKiogS2VlcHMgdGhlIGZpcnN0IGl0ZW0gaW4gY2FzZSBvZiBkdXBsaWNhdGVzLiAqL1xuZnVuY3Rpb24gZGlzdGluY3RCeUtleTxUPihpdGVtczogVFtdLCBrZXk6IChpdGVtOiBUKSA9PiB1bmtub3duKTogVFtdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcblx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpdGVtID0+IHtcblx0XHRjb25zdCBrID0ga2V5KGl0ZW0pO1xuXHRcdGlmIChzZWVuLmhhcyhrKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzZWVuLmFkZChrKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0Zyb250PFQ+KGl0ZW06IFQsIGl0ZW1zOiBUW10pOiBUW10ge1xuXHRjb25zdCBpbmRleCA9IGl0ZW1zLmluZGV4T2YoaXRlbSk7XG5cdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0cmV0dXJuIFtpdGVtLCAuLi5pdGVtcy5zbGljZSgwLCBpbmRleCksIC4uLml0ZW1zLnNsaWNlKGluZGV4ICsgMSldO1xuXHR9XG5cdHJldHVybiBpdGVtcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIsV0FBVywwQkFBMEIsd0JBQXdCO0FBQ3pGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUEyRCxpQkFBaUIsbUJBQW1CLGFBQWEsbUJBQW1CO0FBRXhJLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsV0FBVyxnQkFBZ0I7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1Q0FBdUMsb0JBQW9CLDhCQUE4QjtBQUNsRyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxPQUFPLGFBQWE7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxxQ0FBcUMsbUNBQThEO0FBQ3JILFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMEJBQTBFLHdCQUF3QjtBQUMzRyxTQUF5QywrQ0FBK0M7QUFDeEYsU0FBUyxZQUFZO0FBQ3JCLFNBQW1DLDRCQUE0QjtBQUMvRCxTQUF1RSwwQkFBMEIsd0JBQXdCO0FBQ3pILFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBRWpDLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBNkN2RCxZQUNrQixZQUNBLFlBQ0EsZ0JBQ0EsaUJBQytCLCtCQUNsQixhQUNVLHVCQUNBLHVCQUNILG9CQUNELG1CQUNuQztBQUNELFVBQU07QUFYVztBQUNBO0FBQ0E7QUFDQTtBQUMrQjtBQUNsQjtBQUNVO0FBQ0E7QUFDSDtBQUNEO0FBcERyQyxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksa0JBQW1DLENBQUM7QUFPM0YsU0FBaUIsU0FBUywwQkFBMEIsTUFBTTtBQUFBLE1BQ3pELFNBQVMsT0FBTztBQUFBLFFBQ2YsbUJBQW1CLHVCQUF1QixZQUFZO0FBQUEsUUFDdEQsZ0NBQWdDLHVCQUF1QixZQUFZO0FBQUEsTUFDcEU7QUFBQSxNQUNBLGNBQWMsQ0FBQyxXQUFXO0FBQ3pCLGVBQU8sa0JBQWtCLFFBQVE7QUFDakMsZUFBTywrQkFBK0IsUUFBUTtBQUFBLE1BQy9DO0FBQUEsTUFDQSxlQUFlLGtCQUFrQixPQUFPLEVBQUUsV0FBVyxLQUFLLFdBQVcsRUFBRTtBQUFBLE1BQ3ZFLFFBQVEsQ0FBQyxRQUFRLGVBQWUsWUFBWTtBQUMzQyxjQUFNLE9BQU8sV0FBVyxRQUFRLFFBQVEsUUFBUSxJQUFJLE9BQUssRUFBRSxTQUFTLDZCQUE2QixFQUFFLE9BQU8sT0FBTyxJQUFJLFdBQVcsS0FBSyxFQUFFLE9BQU8sU0FBUyxDQUFDO0FBRXhKLFlBQUksS0FBSyxRQUFRLEdBQUc7QUFDbkIsaUJBQU87QUFBQSxRQUNSO0FBQ0EsWUFBSTtBQUNILGlCQUFPO0FBQUEsWUFDTixtQkFBbUIsY0FBYyxrQkFBa0IsMkJBQTJCLE1BQU0sS0FBSyxVQUFVO0FBQUEsWUFDbkcsZ0NBQWdDLGNBQWMsK0JBQStCLDJCQUEyQixNQUFNLEtBQUssVUFBVTtBQUFBLFVBQzlIO0FBQUEsUUFDRCxVQUFFO0FBQ0Qsd0JBQWMsa0JBQWtCLFFBQVE7QUFDeEMsd0JBQWMsK0JBQStCLFFBQVE7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFnQixvQkFBb0IsS0FBSyxPQUFPLElBQUksTUFBTSxPQUFLLEVBQUUsaUJBQWlCO0FBQ2xGLFNBQWdCLGlDQUFpQyxLQUFLLE9BQU8sSUFBSSxNQUFNLE9BQUssRUFBRSw4QkFBOEI7QUFJNUcsU0FBUSxzQkFBMkQ7QUFrRG5FLFNBQWdCLGtDQUFrQyxRQUFRLE1BQU0sWUFBVTtBQUN6RSxXQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzNCLFdBQUssaUJBQWlCLE1BQU07QUFDNUIsYUFBTztBQUFBLElBQ1IsQ0FBQztBQVlELFNBQWlCLGdCQUFnQixnQkFBZ0IsTUFBTSxDQUFDO0FBQ3hELFNBQWdCLFVBQVUsS0FBSyxjQUFjLElBQUksTUFBTSxPQUFLLElBQUksQ0FBQztBQXBEaEUsU0FBSyxrQkFBa0Isc0JBQXNCLGlDQUFpQyxPQUFPLEtBQUsscUJBQXFCLEVBQUUsOEJBQThCLEtBQUssTUFBTTtBQUMxSixTQUFLLG1CQUFtQixzQkFBc0IsaURBQWlELE1BQU0sS0FBSyxxQkFBcUIsRUFBRSw4QkFBOEIsS0FBSyxNQUFNO0FBQzFLLFNBQUsseUJBQXlCLEtBQUssVUFBVSxLQUFLLHNCQUFzQjtBQUFBLE1BQWUsaUJBQWlCLEtBR3RHO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssbUJBQW1CLEtBQUssT0FBTyxJQUFJLEtBQUssc0JBQXNCLGVBQWUscUJBQXFCLENBQUM7QUFFeEcsU0FBSyxnQ0FBZ0MsOEJBQThCLEtBQUssTUFBTTtBQUU5RSxVQUFNLG9CQUFvQixRQUFRLGtCQUFrQixnQ0FBZ0M7QUFDcEYsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyw2QkFBNkIsaUJBQWlCO0FBQ25ELFdBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxZQUFJLEVBQUUscUJBQXFCLGlCQUFpQixHQUFHO0FBQzlDLGVBQUssNkJBQTZCLGlCQUFpQjtBQUFBLFFBQ3BEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSyxPQUFPLDhCQUE4QixLQUFLLE1BQU07QUFBQSxFQUN0RDtBQUFBLEVBRVEsNkJBQTZCLGtCQUEwQjtBQUM5RCxVQUFNLFNBQVMsS0FBSyxzQkFBc0IsU0FBa0MsZ0JBQWdCO0FBQzVGLFFBQUksQ0FBQyxTQUFTLE1BQU0sR0FBRztBQUN0QixXQUFLLHNCQUFzQjtBQUFBLElBQzVCLE9BQU87QUFDTixXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUFBLEVBUVEsS0FBSyxPQUdYO0FBQ0QsUUFBSSxLQUFLLGdCQUFnQixJQUFJLEdBQUc7QUFDL0IsV0FBSyxZQUFZLEtBQUsseUJBQXlCLEtBQUssQ0FBQztBQUFBLElBQ3REO0FBQ0EsU0FBSyx1QkFBdUIsSUFBSSxLQUFLO0FBQUEsRUFDdEM7QUFBQSxFQUtPLE1BQ04sV0FDQSxnQkFDQSxTQUNBLHdCQUNBLGNBQ0EsOEJBQ0EsYUFDbUI7QUFDbkIsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLElBQUk7QUFDMUMsVUFBTSxVQUFVLElBQUksY0FBYyxVQUFVLFNBQVMsS0FBSyxXQUFXLGFBQWEsR0FBRyxJQUFJLElBQUksU0FBUyxDQUFDO0FBRXZHLFVBQU0sU0FBUyxRQUFRLHlCQUF5QixLQUFLLCtCQUErQixJQUFJLElBQUksS0FBSyxrQkFBa0IsSUFBSTtBQUV2SCxRQUFJLEtBQUssaUJBQWlCLE9BQU8sUUFBUSxVQUFVLE9BQU8sR0FBRztBQUM1RCxhQUFPLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUNwQyxXQUFXLFFBQVEsU0FBUyxVQUFVLE9BQU8sR0FBRztBQUMvQyxhQUFPLFFBQVEsUUFBUSxJQUFJO0FBQUEsSUFDNUI7QUFFQSxVQUFNLGdCQUFnQixDQUFDLENBQUMsS0FBSyxpQkFBaUI7QUFDOUMsU0FBSyxpQkFBaUIsTUFBTTtBQUU1QixVQUFNLFNBQVMsSUFBSSx3QkFBd0I7QUFFM0MsVUFBTSxXQUFXLFlBQVk7QUFDNUIsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBRWxDLFdBQUssY0FBYyxJQUFJLEtBQUssY0FBYyxJQUFJLElBQUksR0FBRyxNQUFTO0FBQzlELFVBQUksY0FBYztBQUNsQixZQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFlBQUksQ0FBQyxhQUFhO0FBQ2pCLHdCQUFjO0FBQ2QsZUFBSyxjQUFjLElBQUksS0FBSyxjQUFjLElBQUksSUFBSSxHQUFHLE1BQVM7QUFBQSxRQUMvRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGVBQWUsTUFBTSxJQUFJLElBQUksaUJBQWlCLE1BQU0scUJBQXFCLEdBQUcsS0FBSyxHQUFJLENBQUM7QUFDNUYsbUJBQWEsU0FBUztBQUV0QixZQUFNLDZCQUE2QixVQUFVLE9BQU8sT0FBSyxFQUFFLFVBQVU7QUFDckUsWUFBTSxzQkFBc0IsSUFBSSxvQkFBb0IsU0FBUyxhQUFhLDBCQUEwQjtBQUdwRyxVQUFJO0FBQ0gsY0FBTSwyQkFBMkIsS0FBSyxlQUFlLElBQUksS0FBSyxVQUFVO0FBQ3hFLGNBQU0sZ0JBQWdCO0FBQUEsVUFDckIsVUFBVSxJQUFJLE9BQUssRUFBRSxlQUFlO0FBQUEsVUFDcEMseUJBQXlCLGdCQUFnQjtBQUFBLFFBQzFDLEtBQUs7QUFHTCxjQUFNLGlCQUFpQixpQkFBa0IsZ0JBQWdCLFFBQVEsZ0JBQWdCLDRCQUE0QjtBQUM3RyxZQUFJLGdCQUFnQjtBQUVuQixnQkFBTSxLQUFLLGVBQWUsT0FBTyxLQUFLO0FBQUEsUUFDdkM7QUFFQSxZQUFJLE9BQU8sTUFBTSwyQkFBMkIsS0FBSyxPQUFPLGNBQWMsS0FBSyxXQUFXLGFBQWEsTUFBTSxRQUFRLFdBQVc7QUFDM0gsOEJBQW9CLDhCQUE4QixzQkFBc0I7QUFDeEUsaUJBQU87QUFBQSxRQUNSO0FBRUEsY0FBTSxZQUFZLHdCQUF3QjtBQUMxQyxZQUFJLEtBQUssZ0JBQWdCLElBQUksS0FBSyxLQUFLLHVCQUF1QixVQUFVLElBQUksR0FBRztBQUM5RSxlQUFLLEtBQUs7QUFBQSxZQUNULFVBQVU7QUFBQSxZQUNWLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQSxVQUFVLEtBQUssV0FBVztBQUFBLFlBQzFCLGNBQWMsS0FBSyxXQUFXLGFBQWE7QUFBQSxZQUMzQyxTQUFTLEVBQUUsYUFBYSxRQUFRLGFBQWEsYUFBYSxRQUFRLHlCQUF5QixPQUFPLE9BQVU7QUFBQSxZQUM1RyxNQUFNLEtBQUssSUFBSTtBQUFBLFlBQ2YsVUFBVTtBQUFBLFVBQ1gsQ0FBQztBQUFBLFFBQ0Y7QUFFQSxjQUFNLFlBQVksb0JBQUksS0FBSztBQUMzQixjQUFNLGlCQUFpQix5QkFBeUIsV0FBVyxLQUFLLGdCQUFnQixJQUFJLEdBQUcsS0FBSyxZQUFZLFNBQVMsYUFBYSxLQUFLLDZCQUE2QjtBQUVoSyx5QkFBaUIsT0FBTyxPQUFPLE1BQU0sZUFBZSxpQkFBaUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDLENBQUM7QUFFbkcsWUFBSSxrQkFBa0I7QUFDdEIsWUFBSSxxQkFBcUI7QUFFekIsY0FBTSxzQkFBOEMsQ0FBQztBQUNyRCx5QkFBaUIsUUFBUSxlQUFlLE9BQU87QUFDOUMsY0FBSSxDQUFDLE1BQU07QUFDVjtBQUFBLFVBQ0Q7QUFDQSxlQUFLLE9BQU87QUFDWixnQkFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLFVBQVUsS0FBSyxzQkFBc0IsV0FBVyxJQUFJLEVBQUUsTUFBTSxRQUFRLElBQUksRUFBRSxNQUFNLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFFaEkscUJBQVcsUUFBUSxLQUFLLHVCQUF1QjtBQUM5QyxpQ0FBcUI7QUFDckIsZ0JBQUksQ0FBQyxRQUFRLHVCQUF1QixLQUFLLGdCQUFnQixLQUFLLHFCQUFxQjtBQUNsRixtQkFBSyxrQkFBa0Isd0JBQXdCO0FBQy9DO0FBQUEsWUFDRDtBQUNBLGdCQUFJLENBQUMsUUFBUSw0QkFBNEIsRUFBRSxLQUFLLGdCQUFnQixLQUFLLHFCQUFxQjtBQUN6RixtQkFBSyxrQkFBa0IsOEJBQThCO0FBQ3JEO0FBQUEsWUFDRDtBQUVBLGlCQUFLLHFCQUFxQixrQkFBa0I7QUFFNUMsa0JBQU0sWUFBWSxLQUFLLFFBQVE7QUFDL0IsZ0JBQUk7QUFDSixnQkFBSTtBQUVKLGdCQUFJLGFBQWEsVUFBVSxTQUFTLE1BQU0sS0FBSyxXQUFXLElBQUksU0FBUyxHQUFHO0FBQ3pFLG9CQUFNLFdBQVcsTUFBTSxLQUFLLGtCQUFrQixxQkFBcUIsU0FBUztBQUM1RSw0QkFBYyxTQUFTLE9BQU87QUFDOUIsMkJBQWE7QUFBQSxZQUNkLE9BQU87QUFDTiw0QkFBYyxLQUFLO0FBQ25CLDJCQUFhO0FBQUEsWUFDZDtBQUVBLGtCQUFNLE1BQU0sd0JBQXdCLFNBQVMsV0FBVztBQUV4RCxrQkFBTSxJQUFJLHFCQUFxQixPQUFPLE1BQU0sR0FBRztBQUMvQyxnQkFBSSxZQUFZO0FBQ2Ysb0JBQU0sSUFBSSxZQUFZLEVBQUUsU0FBUyxXQUFXLE1BQU07QUFDakQsNEJBQVksUUFBUTtBQUNwQixrQkFBRSxRQUFRO0FBQUEsY0FDWCxDQUFDO0FBQUEsWUFDRjtBQUVBLGlCQUFLLHFCQUFxQixhQUFhO0FBQ3ZDLGdDQUFvQixLQUFLLENBQUM7QUFFMUIsZ0JBQUksQ0FBQyxFQUFFLGdCQUFnQixDQUFDLEVBQUUsc0JBQXNCLFFBQVEsZ0JBQWdCLDRCQUE0QixXQUFXO0FBQzlHLGtCQUFJLEVBQUUsVUFBVSxLQUFLLFlBQVksS0FBSyxnQkFBZ0IsSUFBSSxDQUFDLEdBQUc7QUFDN0Qsa0NBQWtCO0FBQUEsY0FDbkI7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUVBLGNBQUksaUJBQWlCO0FBQ3BCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSw0QkFBb0IsUUFBUSxPQUFLLEVBQUUscUJBQXFCLG1CQUFtQixDQUFDO0FBRTVFLGNBQU0sY0FBc0MsTUFBTSxRQUFRLElBQUksb0JBQW9CLElBQUksT0FBTSxNQUFLO0FBQ2hHLGlCQUFPLEtBQUssaUJBQWlCLHlCQUF5QixLQUFLLFlBQVksR0FBRyxPQUFPO0FBQUEsUUFDbEYsQ0FBQyxDQUFDO0FBRUYsb0JBQVksUUFBUSxPQUFLLEVBQUUscUJBQXFCLGlCQUFpQixDQUFDO0FBRWxFLHVCQUFlLGlCQUFpQixFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRXBELFlBQUksS0FBSyxnQkFBZ0IsSUFBSSxLQUFLLEtBQUssdUJBQXVCLFVBQVUsSUFBSSxHQUFHO0FBQzlFLGdCQUFNLHdCQUF3QixlQUFlO0FBQzdDLGNBQUksUUFBNEI7QUFDaEMsY0FBSSxPQUFPLE1BQU0sMkJBQTJCLEtBQUssT0FBTyxjQUFjLEtBQUssV0FBVyxhQUFhLE1BQU0sUUFBUSxXQUFXO0FBQzNILG9CQUFRO0FBQUEsVUFDVDtBQUNBLGdCQUFNLFNBQVMsWUFBWSxJQUFJLE9BQUs7QUFDbkMsa0JBQU0sT0FBTyxFQUFFLG9CQUFvQjtBQUNuQyxnQkFBSSxLQUFLLFVBQVU7QUFDbEIscUJBQU87QUFBQSxZQUNSO0FBQ0Esa0JBQU0sTUFBTTtBQUFBLGNBQ1gsWUFBWSxLQUFLO0FBQUEsY0FDakIsT0FBTyxLQUFLO0FBQUEsY0FDWixxQkFBcUIsS0FBSztBQUFBLGNBQzFCLEtBQUssS0FBSztBQUFBLGNBQ1YsU0FBUyxLQUFLO0FBQUEsY0FDZCxzQkFBc0IsS0FBSztBQUFBLGNBQzNCLGNBQWMsS0FBSztBQUFBLGNBQ25CLHNCQUFzQixLQUFLO0FBQUEsY0FDM0IsY0FBYyxLQUFLO0FBQUEsY0FDbkIsb0JBQW9CLEtBQUs7QUFBQSxjQUN6QixXQUFXLEtBQUs7QUFBQSxjQUNoQixTQUFTLEtBQUs7QUFBQSxjQUNkLE1BQU0sS0FBSztBQUFBLGNBQ1gsZ0JBQWdCLEtBQUs7QUFBQSxjQUNyQixlQUFlLEtBQUs7QUFBQSxjQUNwQixnQkFBZ0IsS0FBSztBQUFBLFlBQ3RCO0FBQ0EsbUJBQU87QUFBQSxjQUNOLEdBQUksZUFBZSxLQUFLLE9BQUs7QUFDNUIsb0JBQUksTUFBTSxTQUFTLENBQUMsR0FBRztBQUN0Qix5QkFBTyxNQUFNLEtBQUssQ0FBQyxFQUFFLFNBQVM7QUFBQSxnQkFDL0I7QUFDQSxvQkFBSSxTQUFTLFlBQVksQ0FBQyxHQUFHO0FBQzVCLHlCQUFPLFNBQVMsS0FBSyxDQUFDLEVBQUUsU0FBUztBQUFBLGdCQUNsQztBQUNBLG9CQUFJLFFBQVEsR0FBRyxDQUFDLEdBQUc7QUFDbEIseUJBQU8sRUFBRSxZQUFZLEVBQUUsR0FBRztBQUFBLGdCQUMzQjtBQUNBLHVCQUFPO0FBQUEsY0FDUixDQUFDO0FBQUEsY0FDRCxhQUFhLEVBQUUsT0FBTyxTQUFTLFlBQVksU0FBUztBQUFBLFlBQ3JEO0FBQUEsVUFDRCxDQUFDLEVBQUUsT0FBTyxDQUFBQSxZQUFVQSxZQUFXLE1BQVM7QUFFeEMsZUFBSyxLQUFLLEVBQUUsVUFBVSwyQkFBMkIsTUFBTSxPQUFPLFdBQVcsWUFBYSxLQUFLLElBQUksSUFBSSxVQUFVLFFBQVEsR0FBSSxPQUFPLFFBQVEsTUFBTSxLQUFLLElBQUksR0FBRyxzQkFBc0IsQ0FBQztBQUFBLFFBQ2xMO0FBRUEsNEJBQW9CLGVBQWUsZUFBZSxnQkFBZ0IsV0FBVztBQUM3RSxZQUFJLG9CQUFvQjtBQUN2Qiw4QkFBb0IseUJBQXlCO0FBQzdDLGNBQUksWUFBWSxTQUFTLEtBQUssT0FBTyxNQUFNLHlCQUF5QjtBQUNuRSx3QkFBWSxRQUFRLE9BQUssRUFBRSwwQkFBMEIsc0NBQXNDLENBQUM7QUFBQSxVQUM3RjtBQUFBLFFBQ0QsT0FBTztBQUNOLGNBQUksT0FBTyxNQUFNLHlCQUF5QjtBQUN6QyxnQ0FBb0IsOEJBQThCLHdCQUF3QjtBQUFBLFVBQzNFLE9BQU87QUFDTixrQkFBTSwyQkFBMkIsS0FBSyxtQkFBbUIsbUJBQTRCLDBCQUEwQjtBQUMvRyxnQ0FBb0IsOEJBQThCLDJCQUEyQiw2QkFBNkIsY0FBYztBQUFBLFVBQ3pIO0FBQUEsUUFDRDtBQUVBLGNBQU0sc0JBQXNCLFFBQVEsd0JBQXdCLEtBQUssSUFBSTtBQUNyRSxZQUFJLHNCQUFzQixHQUFHO0FBQzVCLGdCQUFNLEtBQUsscUJBQXFCLE9BQU8sS0FBSztBQUFBLFFBQzdDO0FBRUEsb0JBQVksUUFBUSxPQUFLLEVBQUUscUJBQXFCLG9CQUFvQixDQUFDO0FBRXJFLFlBQUksT0FBTyxNQUFNLDJCQUEyQixLQUFLLE9BQU8sY0FBYyxLQUFLLFdBQVcsYUFBYSxNQUFNLFFBQVEsYUFDN0csNkJBQTZCLElBQUksR0FBNkY7QUFDakksZ0JBQU0saUJBQ0wsT0FBTyxNQUFNLDBCQUEwQiwrQkFDdEMsS0FBSyxPQUFPLGFBQWEsc0JBQ3hCLEtBQUssV0FBVyxhQUFhLE1BQU0sUUFBUSxZQUFZLDZCQUN0RCw2QkFBNkIsSUFBSSxJQUFJLHdCQUNwQztBQUNMLHNCQUFZLFFBQVEsT0FBSyxFQUFFLDBCQUEwQixjQUFjLENBQUM7QUFDcEUsaUJBQU87QUFBQSxRQUNSO0FBRUEsY0FBTSxVQUFVLG9CQUFJLEtBQUs7QUFDekIsYUFBSyxlQUFlLE9BQU8sS0FBSyxZQUFZLFFBQVEsUUFBUSxJQUFJLFVBQVUsUUFBUSxDQUFDO0FBRW5GLGNBQU0saUJBQWlCLEtBQUssZ0JBQWdCLElBQUk7QUFDaEQsYUFBSyxpQkFBaUIsTUFBTTtBQUM1QixvQkFBWSxRQUFNO0FBRWpCLGdCQUFNLElBQUksS0FBSyxPQUFPLElBQUk7QUFFMUIsY0FBSSxRQUFRLHdCQUF3QjtBQUNuQyxpQkFBSyxPQUFPLElBQUk7QUFBQSxjQUNmLG1CQUFtQix1QkFBdUIsWUFBWTtBQUFBLGNBQ3RELGdDQUFnQyxFQUFFLCtCQUErQiw4QkFBOEIsYUFBYSxTQUFTLEtBQUssWUFBWSxnQkFBZ0Isc0JBQXNCO0FBQUEsWUFDN0ssR0FBRyxFQUFFO0FBQUEsVUFDTixPQUFPO0FBQ04saUJBQUssT0FBTyxJQUFJO0FBQUEsY0FDZixtQkFBbUIsRUFBRSxrQkFBa0IsOEJBQThCLGFBQWEsU0FBUyxLQUFLLFlBQVksZ0JBQWdCLHNCQUFzQjtBQUFBLGNBQ2xKLGdDQUFnQyx1QkFBdUIsWUFBWTtBQUFBLFlBQ3BFLEdBQUcsRUFBRTtBQUFBLFVBQ047QUFFQSxZQUFFLGtCQUFrQixRQUFRO0FBQzVCLFlBQUUsK0JBQStCLFFBQVE7QUFBQSxRQUMxQyxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxRQUFRO0FBQ2QsNkJBQXFCO0FBQ3JCLGFBQUssdUNBQXVDLG1CQUFtQjtBQUFBLE1BQ2hFO0FBRUEsYUFBTztBQUFBLElBQ1IsR0FBRztBQUVILFVBQU0sa0JBQWtCLElBQUksZ0JBQWdCLFNBQVMsUUFBUSxPQUFPO0FBQ3BFLFNBQUssaUJBQWlCLFFBQVE7QUFFOUIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLE1BQU0sSUFBd0I7QUFDcEMsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFVBQU0sSUFBSSxLQUFLLE9BQU8sSUFBSTtBQUMxQixTQUFLLE9BQU8sSUFBSTtBQUFBLE1BQ2YsbUJBQW1CLHVCQUF1QixZQUFZO0FBQUEsTUFDdEQsZ0NBQWdDLHVCQUF1QixZQUFZO0FBQUEsSUFDcEUsR0FBRyxFQUFFO0FBQ0wsTUFBRSxrQkFBa0IsUUFBUTtBQUM1QixNQUFFLCtCQUErQixRQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUVPLHlDQUErQztBQUNyRCxVQUFNLG9CQUFvQixLQUFLLGtCQUFrQixJQUFJO0FBQ3JELFVBQU0saUNBQWlDLEtBQUssK0JBQStCLElBQUk7QUFDL0UsUUFBSSxDQUFDLGdDQUFnQztBQUNwQztBQUFBLElBQ0Q7QUFDQSxnQkFBWSxRQUFNO0FBRWpCLFVBQUksQ0FBQyxzQkFBc0IsK0JBQStCLFNBQVMsYUFBYSxPQUFPLGtCQUFrQixTQUFTLGFBQWEsS0FBSztBQUNuSSwyQkFBbUIsUUFBUTtBQUMzQixjQUFNLElBQUksS0FBSyxPQUFPLElBQUk7QUFDMUIsYUFBSyxPQUFPLElBQUk7QUFBQSxVQUNmLG1CQUFtQiwrQkFBK0IsTUFBTTtBQUFBLFVBQ3hELGdDQUFnQyx1QkFBdUIsWUFBWTtBQUFBLFFBQ3BFLEdBQUcsRUFBRTtBQUNMLFVBQUUsa0JBQWtCLFFBQVE7QUFDNUIsVUFBRSwrQkFBK0IsUUFBUTtBQUFBLE1BQzFDO0FBQ0EsV0FBSyxvQ0FBb0MsRUFBRTtBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLG1CQUFtQixNQUE0QixJQUF3QjtBQUM3RSxVQUFNLElBQUksS0FBSyxPQUFPLElBQUk7QUFDMUIsU0FBSyxPQUFPLElBQUk7QUFBQSxNQUNmLG1CQUFtQixJQUFJLHVCQUF1QixDQUFDLElBQUksR0FBRyxNQUFTO0FBQUEsTUFDL0QsZ0NBQWdDLHVCQUF1QixZQUFZO0FBQUEsSUFDcEUsR0FBRyxFQUFFO0FBQ0wsTUFBRSxrQkFBa0IsUUFBUTtBQUM1QixNQUFFLCtCQUErQixRQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUVRLHVDQUNQLHFCQUNPO0FBQ1AsUUFBSSxDQUFDLEtBQUssaUJBQWlCLElBQUksS0FBSyxDQUFDLEtBQUssbUJBQW1CLG1CQUE0QixnQ0FBZ0MsR0FBRztBQUMzSDtBQUFBLElBQ0Q7QUFFQSxRQUFJLG9CQUFvQixnQkFBZ0IsVUFBYSxvQkFBb0IsdUJBQXVCO0FBQy9GO0FBQUEsSUFDRDtBQUdBLFFBQUksQ0FBQywrQkFBK0IsS0FBSyxxQkFBcUIsS0FBSyxXQUFXLGNBQWMsQ0FBQyxHQUFHO0FBQy9GO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxvQkFBb0IsVUFBVSxLQUFLLE9BQUssdUJBQXVCLEVBQUUsWUFBWSxXQUFXLENBQUMsR0FBRztBQUNoRztBQUFBLElBQ0Q7QUFFQSxVQUFNLHNCQUFzRDtBQUFBLE1BQzNELGVBQWUsb0JBQW9CO0FBQUEsTUFDbkMsb0JBQW9CLG9CQUFvQixzQkFBc0I7QUFBQSxNQUM5RCxhQUFhO0FBQUEsTUFDYixrQkFBa0I7QUFBQSxNQUNsQixTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsTUFDUCxTQUFTLG9CQUFvQixZQUFZLEtBQUs7QUFBQSxNQUM5QyxTQUFTLG9CQUFvQixZQUFZLEtBQUs7QUFBQSxNQUM5QyxZQUFZLG9CQUFvQixZQUFZO0FBQUEsTUFDNUMsZUFBZSxvQkFBb0IsWUFBWTtBQUFBLE1BQy9DLGdCQUFnQixvQkFBb0IsWUFBWTtBQUFBLE1BQ2hELDhCQUE4QixvQkFBb0IsWUFBWTtBQUFBLE1BQzlELFlBQVksb0JBQW9CLFlBQVk7QUFBQSxNQUM1Qyx3QkFBd0IsQ0FBQyxDQUFDLG9CQUFvQixRQUFRO0FBQUEsTUFDdEQsb0JBQW9CLG9CQUFvQixVQUFVLElBQUksT0FBSyxFQUFFLFlBQVksU0FBUyxDQUFDLEVBQUUsT0FBTyxTQUFTLEVBQUUsS0FBSyxHQUFHO0FBQUEsTUFDL0csR0FBRyxtQkFBbUIsb0JBQW9CLFVBQVUsS0FBSyxPQUFLLHVCQUF1QixFQUFFLFlBQVksV0FBVyxDQUFDLENBQUM7QUFBQSxNQUNoSCwwQkFBMEI7QUFBQSxNQUMxQiwyQkFBMkI7QUFBQSxNQUMzQixVQUFVO0FBQUEsTUFDVixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsTUFDUiwyQkFBMkI7QUFBQSxNQUMzQixlQUFlO0FBQUEsTUFDZixlQUFlO0FBQUEsTUFDZiwwQkFBMEI7QUFBQSxNQUMxQixnQkFBZ0I7QUFBQSxNQUNoQixtQkFBbUI7QUFBQSxNQUNuQixxQ0FBcUM7QUFBQSxNQUNyQyxxQ0FBcUM7QUFBQSxNQUNyQywwQ0FBMEM7QUFBQSxNQUMxQyxzQkFBc0I7QUFBQSxNQUN0QixvQkFBb0I7QUFBQSxNQUNwQixtQkFBbUI7QUFBQSxNQUNuQixtQkFBbUI7QUFBQSxNQUNuQix3QkFBd0I7QUFBQSxNQUN4Qix3QkFBd0I7QUFBQSxNQUN4QixzQkFBc0I7QUFBQSxNQUN0Qix1QkFBdUI7QUFBQSxNQUN2Qix5QkFBeUI7QUFBQSxNQUN6QiwwQkFBMEI7QUFBQSxNQUMxQixzQkFBc0I7QUFBQSxNQUN0QixnQkFBZ0I7QUFBQSxNQUNoQixlQUFlO0FBQUEsTUFDZixnQkFBZ0I7QUFBQSxNQUNoQixnQkFBZ0I7QUFBQSxNQUNoQix5QkFBeUI7QUFBQSxNQUN6QiwwQkFBMEI7QUFBQSxNQUMxQixvQkFBb0I7QUFBQSxNQUNwQixVQUFVO0FBQUEsSUFDWDtBQUVBLFVBQU0sY0FBYyxLQUFLLHNCQUFzQixlQUFlLHFDQUFxQztBQUNuRyw0Q0FBd0MsYUFBYSxtQkFBbUI7QUFBQSxFQUN6RTtBQUFBLEVBRU8sb0NBQW9DLElBQXdCO0FBQ2xFLFFBQUksS0FBSyxpQkFBaUIsT0FBTyxRQUFRLFFBQVEsd0JBQXdCO0FBQ3hFLFdBQUssaUJBQWlCLE1BQU07QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGVBQXFCO0FBQzNCLFNBQUssaUJBQWlCLE1BQU07QUFBQSxFQUM3QjtBQUNEO0FBM2dCYSx3QkFDRyxhQUFhO0FBRGhCLDBCQUFOO0FBQUEsRUFrREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdkRVO0FBNmdCYixNQUFNLGNBQWM7QUFBQSxFQUNuQixZQUNpQixVQUNBLFNBQ0EsV0FDQSxXQUNmO0FBSmU7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUVqQjtBQUFBLEVBRU8sVUFBVSxPQUErQjtBQUMvQyxXQUFPLEtBQUssU0FBUyxPQUFPLE1BQU0sUUFBUSxLQUN0QyxnQkFBZ0IsS0FBSyxRQUFRLHdCQUF3QixNQUFNLFFBQVEsd0JBQXdCLFlBQVksQ0FBQyxNQUN2RyxNQUFNLFFBQVEsZ0JBQWdCLDRCQUE0QixhQUMxRCxLQUFLLFFBQVEsZ0JBQWdCLDRCQUE0QixhQUMxRCxLQUFLLGNBQWMsTUFBTSxhQUN6QixTQUFTLE1BQU0sV0FBVyxLQUFLLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRUEsSUFBVyxvQkFBb0I7QUFDOUIsV0FBTyxLQUFLLFFBQVEsZ0JBQWdCLDRCQUE0QjtBQUFBLEVBQ2pFO0FBQ0Q7QUFFQSxNQUFNLG9CQUFvQjtBQUFBLEVBS3pCLFlBQ2lCLFNBQ0EsYUFDQSxXQUNmO0FBSGU7QUFDQTtBQUNBO0FBTGpCLFNBQU8sd0JBQXdCO0FBQUEsRUFNM0I7QUFBQSxFQUVKLGVBQWUsTUFBYztBQUM1QixTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBLEVBRUEsOEJBQThCLE1BQWM7QUFDM0MsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRUEsMkJBQTJCO0FBQzFCLFNBQUssd0JBQXdCO0FBQUEsRUFDOUI7QUFDRDtBQUVBLFNBQVMsU0FBWSxNQUFjLE1BQXVCO0FBQ3pELFNBQU8sQ0FBQyxHQUFHLElBQUksRUFBRSxNQUFNLFVBQVEsS0FBSyxJQUFJLElBQUksQ0FBQztBQUM5QztBQUVBLE1BQU0sZ0JBQXVDO0FBQUEsRUFDNUMsWUFDaUIsU0FDQSx5QkFDQSxTQUNmO0FBSGU7QUFDQTtBQUNBO0FBQUEsRUFFakI7QUFBQSxFQUVBLFVBQVU7QUFDVCxTQUFLLHdCQUF3QixPQUFPO0FBQUEsRUFDckM7QUFDRDtBQUVPLE1BQU0sK0JBQStCLFdBQVc7QUFBQSxFQUt0RCxZQUNpQixtQkFDQSxTQUNmO0FBQ0QsVUFBTTtBQUhVO0FBQ0E7QUFJaEIsZUFBVyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFDdEQsdUJBQWlCLE9BQU87QUFBQSxJQUN6QjtBQUVBLFNBQUssVUFBVTtBQUFBLE1BQ2QsU0FBUyxNQUFNO0FBQ2QsbUJBQVcsb0JBQW9CLEtBQUssbUJBQW1CO0FBQ3RELDJCQUFpQixVQUFVO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBckJBLE9BQWMsY0FBc0M7QUFDbkQsV0FBTyxJQUFJLHVCQUF1QixDQUFDLEdBQUcsTUFBUztBQUFBLEVBQ2hEO0FBQUEsRUFxQlEsVUFBVSxJQUFnRTtBQUNqRixXQUFPLEtBQUssa0JBQWtCLEtBQUssT0FBSyxFQUFFLGFBQWEsRUFBRTtBQUFBLEVBQzFEO0FBQUEsRUFFUSxZQUFZLE1BQWdEO0FBQ25FLFdBQU8sS0FBSyxrQkFBa0IsS0FBSyxPQUFLLEVBQUUsU0FBUyxJQUFJO0FBQUEsRUFDeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLDJCQUEyQixNQUFrQixXQUErQztBQUNsRyxVQUFNLHVCQUF1QixLQUFLLGtCQUFrQixJQUFJLE9BQUssRUFBRSxTQUFTLE1BQU0sU0FBUyxDQUFDLEVBQUUsT0FBTyxTQUFTO0FBQzFHLFdBQU8sSUFBSSx1QkFBdUIsc0JBQXNCLEtBQUssT0FBTztBQUFBLEVBQ3JFO0FBQUEsRUFFTyw4QkFBOEIsb0JBQTRDLFNBQXdCLFdBQXVCLGdCQUEwQix1QkFBcUY7QUFDOU8sUUFBSSxpQkFBbUQ7QUFDdkQsUUFBSSx1QkFBdUI7QUFDMUIsWUFBTSwwQkFBMEIsS0FBSyxVQUFVLHFCQUFxQjtBQUNwRSxVQUFJLDJCQUEyQix3QkFBd0IsWUFBWSxXQUFXLFFBQVEsUUFBUSxHQUFHO0FBQ2hHLHlCQUFpQjtBQUVqQixjQUFNLHdCQUF3QixtQkFBbUIsS0FBSyxPQUFLLEVBQUUsU0FBUyx3QkFBd0IsSUFBSTtBQUNsRyxZQUFJLHVCQUF1QjtBQUMxQiwrQkFBcUIsWUFBWSx1QkFBdUIsa0JBQWtCO0FBQUEsUUFDM0UsT0FBTztBQUNOLCtCQUFxQixDQUFDLHlCQUF5QixHQUFHLGtCQUFrQjtBQUFBLFFBQ3JFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLDBCQUEwQixpQkFFN0IsQ0FBQyxlQUFlLGVBRWhCLG1CQUFtQixLQUFLLE9BQUssQ0FBQyxFQUFFLGdCQUFnQixFQUFFLFVBQVUsV0FBVyxjQUFjLENBQUM7QUFFekYsUUFBSSxlQUF1QyxDQUFDO0FBQzVDLGVBQVcsS0FBSyxvQkFBb0I7QUFDbkMsWUFBTSxVQUFVLEtBQUssWUFBWSxFQUFFLElBQUk7QUFDdkMsVUFBSTtBQUNKLFVBQUksV0FBVyxZQUFZLEdBQUc7QUFDN0IsZUFBTyxFQUFFLGFBQWEsUUFBUSxRQUFRO0FBQ3RDLFVBQUUsZUFBZSxPQUFPO0FBQ3hCLGdCQUFRLG1CQUFtQixFQUFFLE1BQU0sb0NBQW9DLFNBQVMscUJBQXFCLE9BQU8sY0FBYyxFQUFFLG9CQUFvQixFQUFFLENBQUM7QUFBQSxNQUNwSixPQUFPO0FBQ04sZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLDRCQUE0QixLQUFLLGNBQWM7QUFDbEQscUJBQWEsS0FBSyxJQUFJO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEsaUJBQWEsS0FBSyxVQUFVLE9BQUssRUFBRSxvQkFBb0IsaUJBQWlCLENBQUM7QUFDekUsbUJBQWUsY0FBYyxjQUFjLE9BQUssRUFBRSxVQUFVO0FBRTVELFdBQU8sSUFBSSx1QkFBdUIsY0FBYyxPQUFPO0FBQUEsRUFDeEQ7QUFBQSxFQUVPLFFBQWdDO0FBQ3RDLFdBQU8sSUFBSSx1QkFBdUIsS0FBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsRUFDdkU7QUFDRDtBQUdBLFNBQVMsY0FBaUIsT0FBWSxLQUFnQztBQUNyRSxRQUFNLE9BQU8sb0JBQUksSUFBSTtBQUNyQixTQUFPLE1BQU0sT0FBTyxVQUFRO0FBQzNCLFVBQU0sSUFBSSxJQUFJLElBQUk7QUFDbEIsUUFBSSxLQUFLLElBQUksQ0FBQyxHQUFHO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsU0FBSyxJQUFJLENBQUM7QUFDVixXQUFPO0FBQUEsRUFDUixDQUFDO0FBQ0Y7QUFFQSxTQUFTLFlBQWUsTUFBUyxPQUFpQjtBQUNqRCxRQUFNLFFBQVEsTUFBTSxRQUFRLElBQUk7QUFDaEMsTUFBSSxRQUFRLElBQUk7QUFDZixXQUFPLENBQUMsTUFBTSxHQUFHLE1BQU0sTUFBTSxHQUFHLEtBQUssR0FBRyxHQUFHLE1BQU0sTUFBTSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xFO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJyZXN1bHQiXQp9Cg==
