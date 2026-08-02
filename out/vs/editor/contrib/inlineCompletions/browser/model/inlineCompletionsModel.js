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
import { mapFindFirst } from "../../../../../base/common/arraysFind.js";
import { arrayEqualsC } from "../../../../../base/common/equals.js";
import { BugIndicatingError, onUnexpectedExternalError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, derivedHandleChanges, derivedOpts, mapObservableArrayCached, observableFromEvent, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from "../../../../../base/common/observable.js";
import { firstNonWhitespaceIndex } from "../../../../../base/common/strings.js";
import { isDefined } from "../../../../../base/common/types.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../browser/observableCodeEditor.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { CursorColumns } from "../../../../common/core/cursorColumns.js";
import { LineRange } from "../../../../common/core/ranges/lineRange.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { TextReplacement, TextEdit } from "../../../../common/core/edits/textEdit.js";
import { TextLength } from "../../../../common/core/text/textLength.js";
import { ScrollType } from "../../../../common/editorCommon.js";
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind, PartialAcceptTriggerKind } from "../../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { EndOfLinePreference } from "../../../../common/model.js";
import { TextModelText } from "../../../../common/model/textModelText.js";
import { ILanguageFeaturesService } from "../../../../common/services/languageFeatures.js";
import { SnippetController2 } from "../../../snippet/browser/snippetController2.js";
import { getEndPositionsAfterApplying, removeTextReplacementCommonSuffixPrefix } from "../utils.js";
import { AnimatedValue, easeOutCubic, ObservableAnimatedValue } from "../../../../../base/browser/animatedValue.js";
import { computeGhostText } from "./computeGhostText.js";
import { GhostText, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual } from "./ghostText.js";
import { InlineCompletionsSource } from "./inlineCompletionsSource.js";
import { InlineCompletionEditorType } from "./provideInlineCompletions.js";
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from "./singleTextEditHelpers.js";
import { EditSources } from "../../../../common/textModelEditSource.js";
import { ICodeEditorService } from "../../../../browser/services/codeEditorService.js";
import { IInlineCompletionsService } from "../../../../browser/services/inlineCompletionsService.js";
import { TypingInterval } from "./typingSpeed.js";
import { StringReplacement } from "../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { URI } from "../../../../../base/common/uri.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { Schemas } from "../../../../../base/common/network.js";
import { getInlineCompletionsController } from "../controller/common.js";
let InlineCompletionsModel = class extends Disposable {
  constructor(textModel, _selectedSuggestItem, _textModelVersionId, _positions, _debounceValue, _enabled, _isSuppressed, _editor, _instantiationService, _commandService, _languageConfigurationService, _accessibilityService, _languageFeaturesService, _codeEditorService, _inlineCompletionsService, defaultAccountService) {
    super();
    this.textModel = textModel;
    this._selectedSuggestItem = _selectedSuggestItem;
    this._textModelVersionId = _textModelVersionId;
    this._positions = _positions;
    this._debounceValue = _debounceValue;
    this._enabled = _enabled;
    this._isSuppressed = _isSuppressed;
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._languageConfigurationService = _languageConfigurationService;
    this._accessibilityService = _accessibilityService;
    this._languageFeaturesService = _languageFeaturesService;
    this._codeEditorService = _codeEditorService;
    this._inlineCompletionsService = _inlineCompletionsService;
    this._isActive = observableValue(this, false);
    this._onlyRequestInlineEditsSignal = observableSignal(this);
    this._forceUpdateExplicitlySignal = observableSignal(this);
    this._noDelaySignal = observableSignal(this);
    this._fetchSpecificProviderSignal = observableSignal(this);
    // We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
    this._selectedInlineCompletionId = observableValue(this, void 0);
    this.primaryPosition = derived(this, (reader) => this._positions.read(reader)[0] ?? new Position(1, 1));
    this.allPositions = derived(this, (reader) => this._positions.read(reader));
    this.sku = observableValue(this, void 0);
    this._isAcceptingPartially = false;
    this._appearedInsideViewport = derived(this, (reader) => {
      const state = this.state.read(reader);
      if (!state || !state.inlineSuggestion) {
        return false;
      }
      return isSuggestionInViewport(this._editor, state.inlineSuggestion, reader);
    });
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._lastShownInlineCompletionInfo = void 0;
    this._lastAcceptedInlineCompletionInfo = void 0;
    this._didUndoInlineEdits = derivedHandleChanges({
      owner: this,
      changeTracker: {
        createChangeSummary: () => ({ didUndo: false }),
        handleChange: (ctx, changeSummary) => {
          changeSummary.didUndo = ctx.didChange(this._textModelVersionId) && !!ctx.change?.isUndoing;
          return true;
        }
      }
    }, (reader, changeSummary) => {
      const versionId = this._textModelVersionId.read(reader);
      if (versionId !== null && this._lastAcceptedInlineCompletionInfo && this._lastAcceptedInlineCompletionInfo.textModelVersionIdAfter === versionId - 1 && this._lastAcceptedInlineCompletionInfo.inlineCompletion.isInlineEdit && changeSummary.didUndo) {
        this._lastAcceptedInlineCompletionInfo = void 0;
        return true;
      }
      return false;
    });
    this._preserveCurrentCompletionReasons = /* @__PURE__ */ new Set([
      1 /* Redo */,
      0 /* Undo */,
      2 /* AcceptWord */
    ]);
    this.dontRefetchSignal = observableSignal(this);
    this._fetchInlineCompletionsPromise = derivedHandleChanges({
      owner: this,
      changeTracker: {
        createChangeSummary: () => ({
          dontRefetch: false,
          preserveCurrentCompletion: false,
          inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
          onlyRequestInlineEdits: false,
          shouldDebounce: true,
          provider: void 0,
          changeHint: void 0,
          textChange: false,
          changeReason: ""
        }),
        handleChange: (ctx, changeSummary) => {
          if (ctx.didChange(this._textModelVersionId)) {
            if (this._preserveCurrentCompletionReasons.has(this._getReason(ctx.change))) {
              changeSummary.preserveCurrentCompletion = true;
            }
            const detailedReasons = ctx.change?.detailedReasons ?? [];
            changeSummary.changeReason = detailedReasons.length > 0 ? detailedReasons[0].getType() : "";
            changeSummary.textChange = true;
          } else if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
            changeSummary.preserveCurrentCompletion = true;
            changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
          } else if (ctx.didChange(this.dontRefetchSignal)) {
            changeSummary.dontRefetch = true;
          } else if (ctx.didChange(this._onlyRequestInlineEditsSignal)) {
            changeSummary.onlyRequestInlineEdits = true;
          } else if (ctx.didChange(this._fetchSpecificProviderSignal)) {
            changeSummary.provider = ctx.change?.provider;
            changeSummary.changeHint = ctx.change?.changeHint;
          }
          return true;
        }
      }
    }, (reader, changeSummary) => {
      this._source.clearOperationOnTextModelChange.read(reader);
      this._noDelaySignal.read(reader);
      this.dontRefetchSignal.read(reader);
      this._onlyRequestInlineEditsSignal.read(reader);
      this._forceUpdateExplicitlySignal.read(reader);
      this._fetchSpecificProviderSignal.read(reader);
      const shouldUpdate = !this._isSuppressed() && (this._enabled.read(reader) && this._selectedSuggestItem.read(reader) || this._isActive.read(reader)) && (!this._inlineCompletionsService.isSnoozing() || changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit);
      if (!shouldUpdate) {
        this._source.cancelUpdate();
        return void 0;
      }
      this._textModelVersionId.read(reader);
      const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(void 0);
      let suggestItem = this._selectedSuggestItem.read(reader);
      if (this._shouldShowOnSuggestConflict.read(void 0)) {
        suggestItem = void 0;
      }
      if (suggestWidgetInlineCompletions && !suggestItem) {
        this._source.seedInlineCompletionsWithSuggestWidget();
      }
      if (changeSummary.dontRefetch) {
        return Promise.resolve(true);
      }
      if (this._didUndoInlineEdits.read(reader) && changeSummary.inlineCompletionTriggerKind !== InlineCompletionTriggerKind.Explicit) {
        transaction((tx) => {
          this._source.clear(tx);
        });
        return void 0;
      }
      let reason = "";
      if (changeSummary.provider) {
        reason += "providerOnDidChange";
      } else if (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit) {
        reason += "explicit";
      }
      if (changeSummary.changeReason) {
        reason += reason.length > 0 ? `:${changeSummary.changeReason}` : changeSummary.changeReason;
      }
      const typingInterval = this._typing.getTypingInterval();
      const requestInfo = {
        editorType: this.editorType,
        startTime: Date.now(),
        languageId: this.textModel.getLanguageId(),
        reason,
        typingInterval: typingInterval.averageInterval,
        typingIntervalCharacterCount: typingInterval.characterCount,
        availableProviders: [],
        sku: this.sku.read(void 0)
      };
      let context = {
        triggerKind: changeSummary.inlineCompletionTriggerKind,
        selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
        includeInlineCompletions: !changeSummary.onlyRequestInlineEdits,
        includeInlineEdits: this._inlineEditsEnabled.read(reader),
        requestIssuedDateTime: requestInfo.startTime,
        earliestShownDateTime: requestInfo.startTime + (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit || this.inAcceptFlow.read(void 0) ? 0 : this._minShowDelay.read(void 0)),
        changeHint: changeSummary.changeHint
      };
      if (context.triggerKind === InlineCompletionTriggerKind.Automatic && changeSummary.textChange) {
        if (this.textModel.getAlternativeVersionId() === this._lastShownInlineCompletionInfo?.alternateTextModelVersionId) {
          context = {
            ...context,
            includeInlineCompletions: !this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
            includeInlineEdits: this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit
          };
        }
      }
      const itemToPreserveCandidate = this.selectedInlineCompletion.read(void 0) ?? this._inlineSuggestionItems.read(void 0)?.inlineEdit;
      const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable ? itemToPreserveCandidate : void 0;
      const userJumpedToActiveCompletion = this._jumpedToId.map((jumpedTo) => !!jumpedTo && jumpedTo === this._inlineSuggestionItems.read(void 0)?.inlineEdit?.semanticId);
      const providers = changeSummary.provider ? { providers: [changeSummary.provider], label: "single:" + changeSummary.provider.providerId?.toString() } : { providers: this._languageFeaturesService.inlineCompletionsProvider.all(this.textModel), label: void 0 };
      const availableProviders = this.getAvailableProviders(providers.providers);
      requestInfo.availableProviders = availableProviders.map((p) => p.providerId).filter(isDefined);
      return this._source.fetch(availableProviders, providers.label, context, itemToPreserve?.identity, changeSummary.shouldDebounce, userJumpedToActiveCompletion, requestInfo);
    });
    this._inlineSuggestionItems = derivedOpts({ owner: this }, (reader) => {
      const c = this._source.inlineCompletions.read(reader);
      if (!c) {
        return void 0;
      }
      const cursorPosition = this.primaryPosition.read(reader);
      let inlineEdit = void 0;
      const visibleCompletions = [];
      for (const completion of c.inlineCompletions) {
        if (!completion.isInlineEdit) {
          if (completion.isVisible(this.textModel, cursorPosition)) {
            visibleCompletions.push(completion);
          }
        } else {
          inlineEdit = completion;
        }
      }
      if (visibleCompletions.length !== 0) {
        inlineEdit = void 0;
      }
      return {
        inlineCompletions: visibleCompletions,
        inlineEdit
      };
    });
    this._inlineCompletionItems = derivedOpts({ owner: this, equalsFn: arrayEqualsC() }, (reader) => {
      const c = this._inlineSuggestionItems.read(reader);
      return c?.inlineCompletions ?? [];
    });
    this.selectedInlineCompletionIndex = derived(this, (reader) => {
      const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
      const filteredCompletions = this._inlineCompletionItems.read(reader);
      const idx = this._selectedInlineCompletionId === void 0 ? -1 : filteredCompletions.findIndex((v) => v.semanticId === selectedInlineCompletionId);
      if (idx === -1) {
        this._selectedInlineCompletionId.set(void 0, void 0);
        return 0;
      }
      return idx;
    });
    this.selectedInlineCompletion = derived(this, (reader) => {
      const filteredCompletions = this._inlineCompletionItems.read(reader);
      const idx = this.selectedInlineCompletionIndex.read(reader);
      return filteredCompletions[idx];
    });
    this.activeCommands = derivedOpts(
      { owner: this, equalsFn: arrayEqualsC() },
      (r) => this.selectedInlineCompletion.read(r)?.source.inlineSuggestions.commands ?? []
    );
    this.inlineCompletionsCount = derived(this, (reader) => {
      if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
        return this._inlineCompletionItems.read(reader).length;
      } else {
        return void 0;
      }
    });
    this._hasVisiblePeekWidgets = derived(this, (reader) => this._editorObs.openedPeekWidgets.read(reader) > 0);
    this._shouldShowOnSuggestConflict = derived(this, (reader) => {
      const showOnSuggestConflict = this._showOnSuggestConflict.read(reader);
      if (showOnSuggestConflict !== "never") {
        const hasInlineCompletion = !!this.selectedInlineCompletion.read(reader);
        if (hasInlineCompletion) {
          const item = this._selectedSuggestItem.read(reader);
          if (!item) {
            return false;
          }
          if (showOnSuggestConflict === "whenSuggestListIsIncomplete") {
            return item.listIncomplete;
          }
          return true;
        }
      }
      return false;
    });
    this.state = derivedOpts({
      owner: this,
      equalsFn: (a, b) => {
        if (!a || !b) {
          return a === b;
        }
        if (a.kind === "ghostText" && b.kind === "ghostText") {
          return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts) && a.inlineSuggestion === b.inlineSuggestion && a.suggestItem === b.suggestItem;
        } else if (a.kind === "inlineEdit" && b.kind === "inlineEdit") {
          return a.inlineSuggestion === b.inlineSuggestion;
        }
        return false;
      }
    }, (reader) => {
      const model = this.textModel;
      if (this._suppressInSnippetMode.read(reader) && this._isInSnippetMode.read(reader)) {
        return void 0;
      }
      const item = this._inlineSuggestionItems.read(reader);
      const inlineEditResult = item?.inlineEdit;
      if (inlineEditResult) {
        if (this._hasVisiblePeekWidgets.read(reader)) {
          return void 0;
        }
        const cursorAtInlineEdit = this.primaryPosition.map((cursorPos) => LineRange.fromRangeInclusive(inlineEditResult.targetRange).addMargin(1, 1).contains(cursorPos.lineNumber));
        const stringEdit = inlineEditResult.action?.kind === "edit" ? inlineEditResult.action.stringEdit : void 0;
        const replacements = stringEdit ? TextEdit.fromStringEdit(stringEdit, new TextModelText(this.textModel)).replacements : [];
        let nextEditUri = (item.inlineEdit?.command?.id === "vscode.open" || item.inlineEdit?.command?.id === "_workbench.open") && // eslint-disable-next-line local/code-no-any-casts
        item.inlineEdit?.command.arguments?.length ? URI.from(item.inlineEdit?.command.arguments[0]) : void 0;
        if (!inlineEditResult.originalTextRef.targets(this.textModel)) {
          nextEditUri = inlineEditResult.originalTextRef.uri;
        }
        return { kind: "inlineEdit", inlineSuggestion: inlineEditResult, edits: replacements, cursorAtInlineEdit, nextEditUri };
      }
      const suggestItem = this._selectedSuggestItem.read(reader);
      if (!this._shouldShowOnSuggestConflict.read(reader) && suggestItem) {
        const suggestCompletionEdit = singleTextRemoveCommonPrefix(suggestItem.getSingleTextEdit(), model);
        const augmentation = this._computeAugmentation(suggestCompletionEdit, reader);
        const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
        if (!isSuggestionPreviewEnabled && !augmentation) {
          return void 0;
        }
        const fullEdit = augmentation?.edit ?? suggestCompletionEdit;
        const fullEditPreviewLength = augmentation ? augmentation.edit.text.length - suggestCompletionEdit.text.length : 0;
        const mode = this._suggestPreviewMode.read(reader);
        const positions = this._positions.read(reader);
        const allPotentialEdits = [fullEdit, ...getSecondaryEdits(this.textModel, positions, fullEdit)];
        const validEditsAndGhostTexts = allPotentialEdits.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], fullEditPreviewLength) : void 0 })).filter(({ edit, ghostText }) => edit !== void 0 && ghostText !== void 0);
        const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
        const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
        const primaryGhostText = ghostTexts[0] ?? new GhostText(fullEdit.range.endLineNumber, []);
        return { kind: "ghostText", edits, primaryGhostText, ghostTexts, inlineSuggestion: augmentation?.completion, suggestItem };
      } else {
        if (!this._isActive.read(reader)) {
          return void 0;
        }
        const inlineSuggestion = this.selectedInlineCompletion.read(reader);
        if (!inlineSuggestion) {
          return void 0;
        }
        const replacement = inlineSuggestion.getSingleTextEdit();
        const mode = this._inlineSuggestMode.read(reader);
        const positions = this._positions.read(reader);
        const allPotentialEdits = [replacement, ...getSecondaryEdits(this.textModel, positions, replacement)];
        const validEditsAndGhostTexts = allPotentialEdits.map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], 0) : void 0 })).filter(({ edit, ghostText }) => edit !== void 0 && ghostText !== void 0);
        const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
        const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
        if (!ghostTexts[0]) {
          return void 0;
        }
        return { kind: "ghostText", edits, primaryGhostText: ghostTexts[0], ghostTexts, inlineSuggestion, suggestItem: void 0 };
      }
    });
    this.status = derived(this, (reader) => {
      if (this._source.loading.read(reader)) {
        return "loading";
      }
      const s = this.state.read(reader);
      if (s?.kind === "ghostText") {
        return "ghostText";
      }
      if (s?.kind === "inlineEdit") {
        return "inlineEdit";
      }
      return "noSuggestion";
    });
    this.inlineCompletionState = derived(this, (reader) => {
      const s = this.state.read(reader);
      if (!s || s.kind !== "ghostText") {
        return void 0;
      }
      if (this._editorObs.inComposition.read(reader)) {
        return void 0;
      }
      return s;
    });
    this.inlineEditState = derived(this, (reader) => {
      const s = this.state.read(reader);
      if (!s || s.kind !== "inlineEdit") {
        return void 0;
      }
      return s;
    });
    this.inlineEditAvailable = derived(this, (reader) => {
      const s = this.inlineEditState.read(reader);
      return !!s;
    });
    this.warning = derived(this, (reader) => {
      return this.inlineCompletionState.read(reader)?.inlineSuggestion?.warning;
    });
    this.ghostTexts = derivedOpts({ owner: this, equalsFn: ghostTextsOrReplacementsEqual }, (reader) => {
      const v = this.inlineCompletionState.read(reader);
      if (!v) {
        return void 0;
      }
      return v.ghostTexts;
    });
    this.primaryGhostText = derivedOpts({ owner: this, equalsFn: ghostTextOrReplacementEquals }, (reader) => {
      const v = this.inlineCompletionState.read(reader);
      if (!v) {
        return void 0;
      }
      return v?.primaryGhostText;
    });
    this.showCollapsed = derived(this, (reader) => {
      const state = this.state.read(reader);
      if (!state || state.kind !== "inlineEdit") {
        return false;
      }
      if (state.inlineSuggestion.hint || state.inlineSuggestion.action?.kind === "jumpTo") {
        return false;
      }
      const isCurrentModelVersion = state.inlineSuggestion.updatedEditModelVersion === this._textModelVersionId.read(reader);
      return (this._inlineEditsShowCollapsedEnabled.read(reader) || !isCurrentModelVersion) && this._jumpedToId.read(reader) !== state.inlineSuggestion.semanticId && !this._inAcceptFlow.read(reader);
    });
    this._tabShouldIndent = derived(this, (reader) => {
      if (this._inAcceptFlow.read(reader)) {
        return false;
      }
      function isMultiLine(range) {
        return range.startLineNumber !== range.endLineNumber;
      }
      function getNonIndentationRange(model, lineNumber) {
        const columnStart = model.getLineIndentColumn(lineNumber);
        const lastNonWsColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
        const columnEnd = Math.max(lastNonWsColumn, columnStart);
        return new Range(lineNumber, columnStart, lineNumber, columnEnd);
      }
      const selections = this._editorObs.selections.read(reader);
      return selections?.some((s) => {
        if (s.isEmpty()) {
          return this.textModel.getLineLength(s.startLineNumber) === 0;
        } else {
          return isMultiLine(s) || s.containsRange(getNonIndentationRange(this.textModel, s.startLineNumber));
        }
      });
    });
    this.tabShouldJumpToInlineEdit = derived(this, (reader) => {
      if (this._tabShouldIndent.read(reader)) {
        return false;
      }
      const s = this.inlineEditState.read(reader);
      if (!s) {
        return false;
      }
      if (s.inlineSuggestion.action?.kind === "jumpTo") {
        return true;
      }
      if (this.showCollapsed.read(reader)) {
        return true;
      }
      if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
        return false;
      }
      return !s.cursorAtInlineEdit.read(reader);
    });
    this.tabShouldAcceptInlineEdit = derived(this, (reader) => {
      const s = this.inlineEditState.read(reader);
      if (!s) {
        return false;
      }
      if (s.inlineSuggestion.action?.kind === "jumpTo") {
        return false;
      }
      if (this.showCollapsed.read(reader)) {
        return false;
      }
      if (this._tabShouldIndent.read(reader)) {
        return false;
      }
      if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
        return true;
      }
      if (s.inlineSuggestion.targetRange.startLineNumber === this._editorObs.cursorLineNumber.read(reader)) {
        return true;
      }
      if (this._jumpedToId.read(reader) === s.inlineSuggestion.semanticId) {
        return true;
      }
      return s.cursorAtInlineEdit.read(reader);
    });
    this._jumpedToId = observableValue(this, void 0);
    this._inAcceptFlow = observableValue(this, false);
    this.inAcceptFlow = this._inAcceptFlow;
    this._source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._textModelVersionId, this._debounceValue, this.primaryPosition));
    this.lastTriggerKind = this._source.inlineCompletions.map(this, (v) => v?.request?.context.triggerKind);
    this._editorObs = observableCodeEditor(this._editor);
    const suggest = this._editorObs.getOption(EditorOption.suggest);
    this._suggestPreviewEnabled = suggest.map((v) => v.preview);
    this._suggestPreviewMode = suggest.map((v) => v.previewMode);
    const inlineSuggest = this._editorObs.getOption(EditorOption.inlineSuggest);
    this._inlineSuggestMode = inlineSuggest.map((v) => v.mode);
    this._suppressedInlineCompletionGroupIds = inlineSuggest.map((v) => new Set(v.experimental.suppressInlineSuggestions.split(",")));
    this._inlineEditsEnabled = inlineSuggest.map((v) => !!v.edits.enabled);
    this._inlineEditsShowCollapsedEnabled = inlineSuggest.map((s) => s.edits.showCollapsed);
    this._triggerCommandOnProviderChange = inlineSuggest.map((s) => s.triggerCommandOnProviderChange);
    this._minShowDelay = inlineSuggest.map((s) => s.minShowDelay);
    this._showOnSuggestConflict = inlineSuggest.map((s) => s.experimental.showOnSuggestConflict);
    this._suppressInSnippetMode = inlineSuggest.map((s) => s.suppressInSnippetMode);
    const snippetController = SnippetController2.get(this._editor);
    this._isInSnippetMode = snippetController?.isInSnippetObservable ?? constObservable(false);
    defaultAccountService.getDefaultAccount().then(createDisposableCb((account) => this.sku.set(skuFromAccount(account), void 0), this._store));
    this._register(defaultAccountService.onDidChangeDefaultAccount((account) => this.sku.set(skuFromAccount(account), void 0)));
    this._typing = this._register(new TypingInterval(this.textModel));
    this._register(this._inlineCompletionsService.onDidChangeIsSnoozing((isSnoozing) => {
      if (isSnoozing) {
        this.stop();
      }
    }));
    {
      const isNotebook = this.textModel.uri.scheme === Schemas.vscodeNotebookCell;
      const [diffEditor] = this._codeEditorService.listDiffEditors().filter((d) => d.getOriginalEditor().getId() === this._editor.getId() || d.getModifiedEditor().getId() === this._editor.getId());
      this.isInDiffEditor = !!diffEditor;
      this.editorType = isNotebook ? InlineCompletionEditorType.Notebook : this.isInDiffEditor ? InlineCompletionEditorType.DiffEditor : InlineCompletionEditorType.TextEditor;
    }
    this._register(recomputeInitiallyAndOnChange(this.state, (s) => {
      if (s && s.inlineSuggestion) {
        this._inlineCompletionsService.reportNewCompletion(s.inlineSuggestion.requestUuid);
      }
    }));
    this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletionsPromise));
    this._register(autorun((reader) => {
      this._editorObs.versionId.read(reader);
      this._inAcceptFlow.set(false, void 0);
    }));
    this._register(autorun((reader) => {
      const jumpToReset = this.state.map((s, reader2) => !s || s.kind === "inlineEdit" && !s.cursorAtInlineEdit.read(reader2)).read(reader);
      if (jumpToReset) {
        this._jumpedToId.set(void 0, void 0);
      }
    }));
    this._register(autorun((reader) => {
      const inlineSuggestion = this.state.map((s) => s?.inlineSuggestion).read(reader);
      if (inlineSuggestion) {
        inlineSuggestion.addPerformanceMarker("activeSuggestion");
      }
    }));
    const inlineEditSemanticId = this.inlineEditState.map((s) => s?.inlineSuggestion.semanticId);
    this._register(autorun((reader) => {
      const id = inlineEditSemanticId.read(reader);
      if (id) {
        this._editor.pushUndoStop();
        this._lastShownInlineCompletionInfo = {
          alternateTextModelVersionId: this.textModel.getAlternativeVersionId(),
          inlineCompletion: this.state.get().inlineSuggestion
        };
      }
    }));
    const inlineCompletionProviders = observableFromEvent(this._languageFeaturesService.inlineCompletionsProvider.onDidChange, () => this._languageFeaturesService.inlineCompletionsProvider.all(textModel));
    mapObservableArrayCached(this, inlineCompletionProviders, (provider, store) => {
      if (!provider.onDidChangeInlineCompletions) {
        return;
      }
      store.add(provider.onDidChangeInlineCompletions((changeHint) => {
        if (!this._enabled.get()) {
          return;
        }
        const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
        if (activeEditor !== this._editor) {
          return;
        }
        if (this._triggerCommandOnProviderChange.get()) {
          this.trigger(void 0, { onlyFetchInlineEdits: true });
          return;
        }
        const activeState = this.state.get();
        if (activeState && (activeState.inlineSuggestion || activeState.edits) && activeState.inlineSuggestion?.source.provider !== provider) {
          return;
        }
        transaction((tx) => {
          this._fetchSpecificProviderSignal.trigger(tx, { provider, changeHint: changeHint ?? void 0 });
          this.trigger(tx);
        });
      }));
    }).recomputeInitiallyAndOnChange(this._store);
    this._didUndoInlineEdits.recomputeInitiallyAndOnChange(this._store);
  }
  get isAcceptingPartially() {
    return this._isAcceptingPartially;
  }
  get editor() {
    return this._editor;
  }
  debugGetSelectedSuggestItem() {
    return this._selectedSuggestItem;
  }
  getIndentationInfo(reader) {
    let startsWithIndentation = false;
    let startsWithIndentationLessThanTabSize = true;
    const ghostText = this?.primaryGhostText.read(reader);
    if (!!this?._selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
      const { column, lines } = ghostText.parts[0];
      const firstLine = lines[0].line;
      const indentationEndColumn = this.textModel.getLineIndentColumn(ghostText.lineNumber);
      const inIndentation = column <= indentationEndColumn;
      if (inIndentation) {
        let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
        if (firstNonWsIdx === -1) {
          firstNonWsIdx = firstLine.length - 1;
        }
        startsWithIndentation = firstNonWsIdx > 0;
        const tabSize = this.textModel.getOptions().tabSize;
        const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
        startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
      }
    }
    return {
      startsWithIndentation,
      startsWithIndentationLessThanTabSize
    };
  }
  _getReason(e) {
    if (e?.isUndoing) {
      return 0 /* Undo */;
    }
    if (e?.isRedoing) {
      return 1 /* Redo */;
    }
    if (this.isAcceptingPartially) {
      return 2 /* AcceptWord */;
    }
    return 3 /* Other */;
  }
  // TODO: This is not an ideal implementation of excludesGroupIds, however as this is currently still behind proposed API
  // and due to the time constraints, we are using a simplified approach
  getAvailableProviders(providers) {
    const suppressedProviderGroupIds = this._suppressedInlineCompletionGroupIds.get();
    const unsuppressedProviders = providers.filter((provider) => !(provider.groupId && suppressedProviderGroupIds.has(provider.groupId)));
    const excludedGroupIds = /* @__PURE__ */ new Set();
    for (const provider of unsuppressedProviders) {
      provider.excludesGroupIds?.forEach((p) => excludedGroupIds.add(p));
    }
    const availableProviders = [];
    for (const provider of unsuppressedProviders) {
      if (provider.groupId && excludedGroupIds.has(provider.groupId)) {
        continue;
      }
      availableProviders.push(provider);
    }
    return availableProviders;
  }
  async trigger(tx, options = {}) {
    subtransaction(tx, (tx2) => {
      if (options.onlyFetchInlineEdits) {
        this._onlyRequestInlineEditsSignal.trigger(tx2);
      }
      if (options.noDelay) {
        this._noDelaySignal.trigger(tx2);
      }
      this._isActive.set(true, tx2);
      if (options.explicit) {
        this._inAcceptFlow.set(true, tx2);
        this._forceUpdateExplicitlySignal.trigger(tx2);
      }
      if (options.provider) {
        this._fetchSpecificProviderSignal.trigger(tx2, { provider: options.provider, changeHint: options.changeHint });
      }
    });
    await this._fetchInlineCompletionsPromise.get();
  }
  async triggerExplicitly(tx, onlyFetchInlineEdits = false) {
    return this.trigger(tx, { onlyFetchInlineEdits, explicit: true });
  }
  stop(stopReason = "automatic", tx) {
    subtransaction(tx, (tx2) => {
      if (stopReason === "explicitCancel") {
        const inlineCompletion = this.state.get()?.inlineSuggestion;
        if (inlineCompletion) {
          inlineCompletion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Rejected });
        }
      }
      this._isActive.set(false, tx2);
      this._source.clear(tx2);
    });
  }
  _computeAugmentation(suggestCompletion, reader) {
    const model = this.textModel;
    const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
    const candidateInlineCompletions = suggestWidgetInlineCompletions ? suggestWidgetInlineCompletions.inlineCompletions.filter((c) => !c.isInlineEdit) : [this.selectedInlineCompletion.read(reader)].filter(isDefined);
    const augmentedCompletion = mapFindFirst(candidateInlineCompletions, (completion) => {
      let r = completion.getSingleTextEdit();
      r = singleTextRemoveCommonPrefix(
        r,
        model,
        Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition())
      );
      return singleTextEditAugments(r, suggestCompletion) ? { completion, edit: r } : void 0;
    });
    return augmentedCompletion;
  }
  async _deltaSelectedInlineCompletionIndex(delta) {
    await this.triggerExplicitly();
    const completions = this._inlineCompletionItems.get() || [];
    if (completions.length > 0) {
      const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
      this._selectedInlineCompletionId.set(completions[newIdx].semanticId, void 0);
    } else {
      this._selectedInlineCompletionId.set(void 0, void 0);
    }
  }
  async next() {
    await this._deltaSelectedInlineCompletionIndex(1);
  }
  async previous() {
    await this._deltaSelectedInlineCompletionIndex(-1);
  }
  _getMetadata(completion, languageId, type = void 0) {
    if (type) {
      return EditSources.inlineCompletionPartialAccept({
        nes: completion.isInlineEdit,
        requestUuid: completion.requestUuid,
        providerId: completion.source.provider.providerId,
        languageId,
        type,
        correlationId: completion.getSourceCompletion().correlationId
      });
    } else {
      return EditSources.inlineCompletionAccept({
        nes: completion.isInlineEdit,
        requestUuid: completion.requestUuid,
        correlationId: completion.getSourceCompletion().correlationId,
        providerId: completion.source.provider.providerId,
        languageId
      });
    }
  }
  async accept(editor = this._editor, alternativeAction = false) {
    if (editor.getModel() !== this.textModel) {
      throw new BugIndicatingError();
    }
    let completion;
    let isNextEditUri = false;
    const state = this.state.get();
    if (state?.kind === "ghostText") {
      if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
        return;
      }
      completion = state.inlineSuggestion;
    } else if (state?.kind === "inlineEdit") {
      completion = state.inlineSuggestion;
      isNextEditUri = !!state.nextEditUri;
    } else {
      return;
    }
    completion.addRef();
    try {
      let followUpTrigger = false;
      editor.pushUndoStop();
      if (!completion.originalTextRef.targets(this.textModel)) {
        const targetEditor = await this._codeEditorService.openCodeEditor({ resource: completion.originalTextRef.uri }, this._editor);
        if (targetEditor) {
          const controller = getInlineCompletionsController(targetEditor);
          const m = controller?.model.get();
          targetEditor.focus();
          m?.transplantCompletion(completion);
          targetEditor.revealLineInCenter(completion.targetRange.startLineNumber);
        }
      } else if (isNextEditUri) {
      } else if (completion.action?.kind === "edit") {
        const action = completion.action;
        if (alternativeAction && action.alternativeAction) {
          followUpTrigger = true;
          const altCommand = action.alternativeAction.command;
          await this._commandService.executeCommand(altCommand.id, ...altCommand.arguments || []).then(void 0, onUnexpectedExternalError);
        } else if (action.snippetInfo) {
          const mainEdit = TextReplacement.delete(action.textReplacement.range);
          const additionalEdits = completion.additionalTextEdits.map((e) => new TextReplacement(Range.lift(e.range), e.text ?? ""));
          const edit = TextEdit.fromParallelReplacementsUnsorted([mainEdit, ...additionalEdits]);
          editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
          editor.setPosition(action.snippetInfo.range.getStartPosition(), "inlineCompletionAccept");
          SnippetController2.get(editor)?.insert(action.snippetInfo.snippet, { undoStopBefore: false });
        } else {
          const edits = state.edits;
          let minimalEdits = edits;
          if (state.kind === "ghostText") {
            minimalEdits = removeTextReplacementCommonSuffixPrefix(edits, this.textModel);
          }
          const selections = getEndPositionsAfterApplying(minimalEdits).map((p) => Selection.fromPositions(p));
          const additionalEdits = completion.additionalTextEdits.map((e) => new TextReplacement(Range.lift(e.range), e.text ?? ""));
          const edit = TextEdit.fromParallelReplacementsUnsorted([...edits, ...additionalEdits]);
          editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
          if (completion.hint === void 0) {
            editor.setSelections(state.kind === "inlineEdit" ? selections.slice(-1) : selections, "inlineCompletionAccept");
          }
          if (state.kind === "inlineEdit" && !this._accessibilityService.isMotionReduced()) {
            const editRanges = edit.getNewRanges();
            const dec = this._store.add(new FadeoutDecoration(editor, editRanges, () => {
              this._store.delete(dec);
            }));
          }
        }
      }
      this._onDidAccept.fire();
      this.stop();
      if (completion.command) {
        await this._commandService.executeCommand(completion.command.id, ...completion.command.arguments || []).then(void 0, onUnexpectedExternalError);
      }
      if (followUpTrigger) {
        this.trigger(void 0);
      }
      completion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction });
    } finally {
      completion.removeRef();
      this._inAcceptFlow.set(true, void 0);
      this._lastAcceptedInlineCompletionInfo = { textModelVersionIdAfter: this.textModel.getVersionId(), inlineCompletion: completion };
    }
  }
  async acceptNextWord() {
    await this._acceptNext(this._editor, "word", (pos, text) => {
      const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
      const config = this._languageConfigurationService.getLanguageConfiguration(langId);
      const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace("g", ""));
      const m1 = text.match(wordRegExp);
      let acceptUntilIndexExclusive = 0;
      if (m1 && m1.index !== void 0) {
        if (m1.index === 0) {
          acceptUntilIndexExclusive = m1[0].length;
        } else {
          acceptUntilIndexExclusive = m1.index;
        }
      } else {
        acceptUntilIndexExclusive = text.length;
      }
      const wsRegExp = /\s+/g;
      const m2 = wsRegExp.exec(text);
      if (m2 && m2.index !== void 0) {
        if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
          acceptUntilIndexExclusive = m2.index + m2[0].length;
        }
      }
      return acceptUntilIndexExclusive;
    }, PartialAcceptTriggerKind.Word);
  }
  async acceptNextLine() {
    await this._acceptNext(this._editor, "line", (pos, text) => {
      const m = text.match(/\n/);
      if (m && m.index !== void 0) {
        return m.index + 1;
      }
      return text.length;
    }, PartialAcceptTriggerKind.Line);
  }
  async _acceptNext(editor, type, getAcceptUntilIndex, kind) {
    if (editor.getModel() !== this.textModel) {
      throw new BugIndicatingError();
    }
    const state = this.inlineCompletionState.get();
    if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
      return;
    }
    const ghostText = state.primaryGhostText;
    const completion = state.inlineSuggestion;
    if (completion.snippetInfo) {
      await this.accept(editor);
      return;
    }
    const firstPart = ghostText.parts[0];
    const ghostTextPos = new Position(ghostText.lineNumber, firstPart.column);
    const ghostTextVal = firstPart.text;
    const acceptUntilIndexExclusive = getAcceptUntilIndex(ghostTextPos, ghostTextVal);
    if (acceptUntilIndexExclusive === ghostTextVal.length && ghostText.parts.length === 1) {
      this.accept(editor);
      return;
    }
    const partialGhostTextVal = ghostTextVal.substring(0, acceptUntilIndexExclusive);
    const positions = this._positions.get();
    const cursorPosition = positions[0];
    completion.addRef();
    try {
      this._isAcceptingPartially = true;
      try {
        editor.pushUndoStop();
        const replaceRange = Range.fromPositions(cursorPosition, ghostTextPos);
        const newText = editor.getModel().getValueInRange(replaceRange) + partialGhostTextVal;
        const primaryEdit = new TextReplacement(replaceRange, newText);
        const edits = [primaryEdit, ...getSecondaryEdits(this.textModel, positions, primaryEdit)].filter(isDefined);
        const selections = getEndPositionsAfterApplying(edits).map((p) => Selection.fromPositions(p));
        editor.edit(TextEdit.fromParallelReplacementsUnsorted(edits), this._getMetadata(completion, this.textModel.getLanguageId(), type));
        editor.setSelections(selections, "inlineCompletionPartialAccept");
        editor.revealPositionInCenterIfOutsideViewport(editor.getPosition(), ScrollType.Smooth);
      } finally {
        this._isAcceptingPartially = false;
      }
      const acceptedRange = Range.fromPositions(completion.editRange.getStartPosition(), TextLength.ofText(partialGhostTextVal).addToPosition(ghostTextPos));
      const text = editor.getModel().getValueInRange(acceptedRange, EndOfLinePreference.LF);
      const acceptedLength = text.length;
      completion.reportPartialAccept(
        acceptedLength,
        { kind, acceptedLength },
        { characters: acceptUntilIndexExclusive, ratio: acceptUntilIndexExclusive / ghostTextVal.length, count: 1 }
      );
    } finally {
      completion.removeRef();
    }
  }
  handleSuggestAccepted(item) {
    const itemEdit = singleTextRemoveCommonPrefix(item.getSingleTextEdit(), this.textModel);
    const augmentedCompletion = this._computeAugmentation(itemEdit, void 0);
    if (!augmentedCompletion) {
      return;
    }
    const alreadyAcceptedLength = this.textModel.getValueInRange(augmentedCompletion.completion.editRange, EndOfLinePreference.LF).length;
    const acceptedLength = alreadyAcceptedLength + itemEdit.text.length;
    augmentedCompletion.completion.reportPartialAccept(itemEdit.text.length, {
      kind: PartialAcceptTriggerKind.Suggest,
      acceptedLength
    }, {
      characters: itemEdit.text.length,
      count: 1,
      ratio: 1
    });
  }
  extractReproSample() {
    const value = this.textModel.getValue();
    const item = this.state.get()?.inlineSuggestion;
    return {
      documentValue: value,
      inlineCompletion: item?.getSourceCompletion()
    };
  }
  jump() {
    const s = this.inlineEditState.get();
    if (!s) {
      return;
    }
    const suggestion = s.inlineSuggestion;
    if (!suggestion.originalTextRef.targets(this.textModel)) {
      this.accept(this._editor);
      return;
    }
    suggestion.addRef();
    try {
      transaction((tx) => {
        if (suggestion.action?.kind === "jumpTo") {
          this.stop(void 0, tx);
          suggestion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false });
        }
        this._jumpedToId.set(s.inlineSuggestion.semanticId, tx);
        this.dontRefetchSignal.trigger(tx);
        const targetRange = s.inlineSuggestion.targetRange;
        const targetPosition = targetRange.getStartPosition();
        this._editor.setPosition(targetPosition, "inlineCompletions.jump");
        const isSingleLineChange = targetRange.isSingleLine() && (s.inlineSuggestion.hint || s.inlineSuggestion.action?.kind === "edit" && !s.inlineSuggestion.action.textReplacement.text.includes("\n"));
        if (isSingleLineChange || s.inlineSuggestion.action?.kind === "jumpTo") {
          this._editor.revealPosition(targetPosition, ScrollType.Smooth);
        } else {
          const revealRange = new Range(targetRange.startLineNumber - 1, 1, targetRange.endLineNumber + 1, 1);
          this._editor.revealRange(revealRange, ScrollType.Smooth);
        }
        s.inlineSuggestion.identity.setJumpTo(tx);
        this._editor.focus();
      });
    } finally {
      suggestion.removeRef();
    }
  }
  async handleInlineSuggestionShown(inlineCompletion, viewKind, viewData, timeWhenShown) {
    await inlineCompletion.reportInlineEditShown(this._commandService, viewKind, viewData, this.textModel, timeWhenShown);
  }
  /**
   * Transplants an inline completion from another model to this one.
   * Used for cross-file inline edits.
   */
  transplantCompletion(item) {
    transaction((tx) => {
      this._source.seedWithCompletion(item, tx);
      this._isActive.set(true, tx);
      this._inAcceptFlow.set(true, tx);
      this.dontRefetchSignal.trigger(tx);
    });
  }
};
InlineCompletionsModel = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ILanguageConfigurationService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, ILanguageFeaturesService),
  __decorateParam(13, ICodeEditorService),
  __decorateParam(14, IInlineCompletionsService),
  __decorateParam(15, IDefaultAccountService)
], InlineCompletionsModel);
var VersionIdChangeReason = /* @__PURE__ */ ((VersionIdChangeReason2) => {
  VersionIdChangeReason2[VersionIdChangeReason2["Undo"] = 0] = "Undo";
  VersionIdChangeReason2[VersionIdChangeReason2["Redo"] = 1] = "Redo";
  VersionIdChangeReason2[VersionIdChangeReason2["AcceptWord"] = 2] = "AcceptWord";
  VersionIdChangeReason2[VersionIdChangeReason2["Other"] = 3] = "Other";
  return VersionIdChangeReason2;
})(VersionIdChangeReason || {});
function getSecondaryEdits(textModel, positions, primaryTextRepl) {
  if (positions.length === 1) {
    return [];
  }
  const text = new TextModelText(textModel);
  const textTransformer = text.getTransformer();
  const primaryOffset = textTransformer.getOffset(positions[0]);
  const secondaryOffsets = positions.slice(1).map((pos) => textTransformer.getOffset(pos));
  primaryTextRepl = primaryTextRepl.removeCommonPrefixAndSuffix(text);
  const primaryStringRepl = textTransformer.getStringReplacement(primaryTextRepl);
  const deltaFromOffsetToRangeStart = primaryStringRepl.replaceRange.start - primaryOffset;
  const primaryContextRange = primaryStringRepl.replaceRange.join(OffsetRange.emptyAt(primaryOffset));
  const primaryContextValue = text.getValueOfOffsetRange(primaryContextRange);
  const replacements = secondaryOffsets.map((secondaryOffset) => {
    const newRangeStart = secondaryOffset + deltaFromOffsetToRangeStart;
    const newRangeEnd = newRangeStart + primaryStringRepl.replaceRange.length;
    const range = new OffsetRange(newRangeStart, newRangeEnd);
    const contextRange = range.join(OffsetRange.emptyAt(secondaryOffset));
    const contextValue = text.getValueOfOffsetRange(contextRange);
    if (contextValue !== primaryContextValue) {
      return void 0;
    }
    const stringRepl = new StringReplacement(range, primaryStringRepl.newText);
    const repl = textTransformer.getTextReplacement(stringRepl);
    return repl;
  }).filter(isDefined);
  return replacements;
}
class FadeoutDecoration extends Disposable {
  constructor(editor, ranges, onDispose) {
    super();
    if (onDispose) {
      this._register({ dispose: () => onDispose() });
    }
    this._register(observableCodeEditor(editor).setDecorations(constObservable(ranges.map((range) => ({
      range,
      options: {
        description: "animation",
        className: "edits-fadeout-decoration",
        zIndex: 1
      }
    })))));
    const val = new ObservableAnimatedValue(AnimatedValue.startNow(1, 0, 1e3, easeOutCubic));
    this._register(autorun((reader) => {
      const opacity = val.getValue(reader);
      editor.getContainerDomNode().style.setProperty("--animation-opacity", opacity.toString());
      if (val.isFinished(reader)) {
        this.dispose();
      }
    }));
  }
}
function isSuggestionInViewport(editor, suggestion, reader = void 0) {
  const targetRange = suggestion.targetRange;
  observableCodeEditor(editor).scrollTop.read(reader);
  const visibleRanges = editor.getVisibleRanges();
  if (visibleRanges.length < 1) {
    return false;
  }
  const viewportRange = new Range(
    visibleRanges[0].startLineNumber,
    visibleRanges[0].startColumn,
    visibleRanges[visibleRanges.length - 1].endLineNumber,
    visibleRanges[visibleRanges.length - 1].endColumn
  );
  return viewportRange.containsRange(targetRange);
}
function skuFromAccount(account) {
  if (account?.entitlementsData?.access_type_sku && account?.entitlementsData?.copilot_plan) {
    return { type: account.entitlementsData.access_type_sku, plan: account.entitlementsData.copilot_plan };
  }
  return void 0;
}
class DisposableCallback {
  constructor(cb) {
    this.handler = (val) => {
      return this._cb?.(val);
    };
    this._cb = cb;
  }
  dispose() {
    this._cb = void 0;
  }
}
function createDisposableCb(cb, store) {
  const dcb = new DisposableCallback(cb);
  store.add(dcb);
  return dcb.handler;
}
export {
  InlineCompletionsModel,
  VersionIdChangeReason,
  getSecondaryEdits,
  isSuggestionInViewport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgYXJyYXlFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElSZWFkZXIsIElUcmFuc2FjdGlvbiwgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkSGFuZGxlQ2hhbmdlcywgZGVyaXZlZE9wdHMsIG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVZhbHVlLCByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSwgc3VidHJhbnNhY3Rpb24sIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbHVtbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9jdXJzb3JDb2x1bW5zLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQsIFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgVGV4dExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvdGV4dExlbmd0aC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnQsIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLCBJbmxpbmVDb21wbGV0aW9uLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCwgSW5saW5lQ29tcGxldGlvbnNQcm92aWRlciwgSW5saW5lQ29tcGxldGlvbkNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWxUZXh0LmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IGdldEVuZFBvc2l0aW9uc0FmdGVyQXBwbHlpbmcsIHJlbW92ZVRleHRSZXBsYWNlbWVudENvbW1vblN1ZmZpeFByZWZpeCB9IGZyb20gJy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFuaW1hdGVkVmFsdWUsIGVhc2VPdXRDdWJpYywgT2JzZXJ2YWJsZUFuaW1hdGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYW5pbWF0ZWRWYWx1ZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlR2hvc3RUZXh0IH0gZnJvbSAnLi9jb21wdXRlR2hvc3RUZXh0LmpzJztcbmltcG9ydCB7IEdob3N0VGV4dCwgR2hvc3RUZXh0T3JSZXBsYWNlbWVudCwgZ2hvc3RUZXh0T3JSZXBsYWNlbWVudEVxdWFscywgZ2hvc3RUZXh0c09yUmVwbGFjZW1lbnRzRXF1YWwgfSBmcm9tICcuL2dob3N0VGV4dC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSB9IGZyb20gJy4vaW5saW5lQ29tcGxldGlvbnNTb3VyY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkl0ZW0sIElubGluZUVkaXRJdGVtLCBJbmxpbmVTdWdnZXN0aW9uSXRlbSB9IGZyb20gJy4vaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRXaXRob3V0VXVpZCwgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUsIElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mbywgSW5saW5lU3VnZ2VzdFNrdSB9IGZyb20gJy4vcHJvdmlkZUlubGluZUNvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IHNpbmdsZVRleHRFZGl0QXVnbWVudHMsIHNpbmdsZVRleHRSZW1vdmVDb21tb25QcmVmaXggfSBmcm9tICcuL3NpbmdsZVRleHRFZGl0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0SXRlbUluZm8gfSBmcm9tICcuL3N1Z2dlc3RXaWRnZXRBZGFwdGVyLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UsIEVkaXRTb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEsIElubGluZUNvbXBsZXRpb25WaWV3S2luZCB9IGZyb20gJy4uL3ZpZXcvaW5saW5lRWRpdHMvaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUeXBpbmdJbnRlcnZhbCB9IGZyb20gJy4vdHlwaW5nU3BlZWQuanMnO1xuaW1wb3J0IHsgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGdldElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uL2NvbnRyb2xsZXIvY29tbW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUNvbXBsZXRpb25zTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc291cmNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0FjdGl2ZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29ubHlSZXF1ZXN0SW5saW5lRWRpdHNTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb3JjZVVwZGF0ZUV4cGxpY2l0bHlTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub0RlbGF5U2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbCh0aGlzKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaFNwZWNpZmljUHJvdmlkZXJTaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsPHsgcHJvdmlkZXI6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXI7IGNoYW5nZUhpbnQ/OiBJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnQgfSB8IHVuZGVmaW5lZD4odGhpcyk7XG5cblx0Ly8gV2UgdXNlIGEgc2VtYW50aWMgaWQgdG8ga2VlcCB0aGUgc2FtZSBpbmxpbmUgY29tcGxldGlvbiBzZWxlY3RlZCBldmVuIGlmIHRoZSBwcm92aWRlciByZW9yZGVycyB0aGUgY29tcGxldGlvbnMuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHVibGljIHJlYWRvbmx5IHByaW1hcnlQb3NpdGlvbiA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX3Bvc2l0aW9ucy5yZWFkKHJlYWRlcilbMF0gPz8gbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0cHVibGljIHJlYWRvbmx5IGFsbFBvc2l0aW9ucyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX3Bvc2l0aW9ucy5yZWFkKHJlYWRlcikpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2t1ID0gb2JzZXJ2YWJsZVZhbHVlPElubGluZVN1Z2dlc3RTa3UgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBfaXNBY2NlcHRpbmdQYXJ0aWFsbHkgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXBwZWFyZWRJbnNpZGVWaWV3cG9ydCA9IGRlcml2ZWQ8Ym9vbGVhbj4odGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUgfHwgIXN0YXRlLmlubGluZVN1Z2dlc3Rpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNTdWdnZXN0aW9uSW5WaWV3cG9ydCh0aGlzLl9lZGl0b3IsIHN0YXRlLmlubGluZVN1Z2dlc3Rpb24sIHJlYWRlcik7XG5cdH0pO1xuXHRwdWJsaWMgZ2V0IGlzQWNjZXB0aW5nUGFydGlhbGx5KCkgeyByZXR1cm4gdGhpcy5faXNBY2NlcHRpbmdQYXJ0aWFsbHk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFjY2VwdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRBY2NlcHQgPSB0aGlzLl9vbkRpZEFjY2VwdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHlwaW5nOiBUeXBpbmdJbnRlcnZhbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWdnZXN0UHJldmlld0VuYWJsZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Z2dlc3RQcmV2aWV3TW9kZTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lU3VnZ2VzdE1vZGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1cHByZXNzZWRJbmxpbmVDb21wbGV0aW9uR3JvdXBJZHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubGluZUVkaXRzRW5hYmxlZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5saW5lRWRpdHNTaG93Q29sbGFwc2VkRW5hYmxlZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9taW5TaG93RGVsYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dPblN1Z2dlc3RDb25mbGljdDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VwcHJlc3NJblNuaXBwZXRNb2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0luU25pcHBldE1vZGU7XG5cblx0Z2V0IGVkaXRvcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3RlZFN1Z2dlc3RJdGVtOiBJT2JzZXJ2YWJsZTxTdWdnZXN0SXRlbUluZm8gfCB1bmRlZmluZWQ+LFxuXHRcdHB1YmxpYyByZWFkb25seSBfdGV4dE1vZGVsVmVyc2lvbklkOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8bnVtYmVyIHwgbnVsbCwgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcG9zaXRpb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBQb3NpdGlvbltdPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWJvdW5jZVZhbHVlOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW5hYmxlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNTdXBwcmVzc2VkOiAoKSA9PiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlOiBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zb3VyY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSwgdGhpcy50ZXh0TW9kZWwsIHRoaXMuX3RleHRNb2RlbFZlcnNpb25JZCwgdGhpcy5fZGVib3VuY2VWYWx1ZSwgdGhpcy5wcmltYXJ5UG9zaXRpb24pKTtcblx0XHR0aGlzLmxhc3RUcmlnZ2VyS2luZCA9IHRoaXMuX3NvdXJjZS5pbmxpbmVDb21wbGV0aW9ucy5tYXAodGhpcywgdiA9PiB2Py5yZXF1ZXN0Py5jb250ZXh0LnRyaWdnZXJLaW5kKTtcblxuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cblx0XHRjb25zdCBzdWdnZXN0ID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCk7XG5cdFx0dGhpcy5fc3VnZ2VzdFByZXZpZXdFbmFibGVkID0gc3VnZ2VzdC5tYXAodiA9PiB2LnByZXZpZXcpO1xuXHRcdHRoaXMuX3N1Z2dlc3RQcmV2aWV3TW9kZSA9IHN1Z2dlc3QubWFwKHYgPT4gdi5wcmV2aWV3TW9kZSk7XG5cblx0XHRjb25zdCBpbmxpbmVTdWdnZXN0ID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCk7XG5cdFx0dGhpcy5faW5saW5lU3VnZ2VzdE1vZGUgPSBpbmxpbmVTdWdnZXN0Lm1hcCh2ID0+IHYubW9kZSk7XG5cdFx0dGhpcy5fc3VwcHJlc3NlZElubGluZUNvbXBsZXRpb25Hcm91cElkcyA9IGlubGluZVN1Z2dlc3QubWFwKHYgPT4gbmV3IFNldCh2LmV4cGVyaW1lbnRhbC5zdXBwcmVzc0lubGluZVN1Z2dlc3Rpb25zLnNwbGl0KCcsJykpKTtcblx0XHR0aGlzLl9pbmxpbmVFZGl0c0VuYWJsZWQgPSBpbmxpbmVTdWdnZXN0Lm1hcCh2ID0+ICEhdi5lZGl0cy5lbmFibGVkKTtcblx0XHR0aGlzLl9pbmxpbmVFZGl0c1Nob3dDb2xsYXBzZWRFbmFibGVkID0gaW5saW5lU3VnZ2VzdC5tYXAocyA9PiBzLmVkaXRzLnNob3dDb2xsYXBzZWQpO1xuXHRcdHRoaXMuX3RyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZSA9IGlubGluZVN1Z2dlc3QubWFwKHMgPT4gcy50cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UpO1xuXHRcdHRoaXMuX21pblNob3dEZWxheSA9IGlubGluZVN1Z2dlc3QubWFwKHMgPT4gcy5taW5TaG93RGVsYXkpO1xuXHRcdHRoaXMuX3Nob3dPblN1Z2dlc3RDb25mbGljdCA9IGlubGluZVN1Z2dlc3QubWFwKHMgPT4gcy5leHBlcmltZW50YWwuc2hvd09uU3VnZ2VzdENvbmZsaWN0KTtcblx0XHR0aGlzLl9zdXBwcmVzc0luU25pcHBldE1vZGUgPSBpbmxpbmVTdWdnZXN0Lm1hcChzID0+IHMuc3VwcHJlc3NJblNuaXBwZXRNb2RlKTtcblxuXHRcdGNvbnN0IHNuaXBwZXRDb250cm9sbGVyID0gU25pcHBldENvbnRyb2xsZXIyLmdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdHRoaXMuX2lzSW5TbmlwcGV0TW9kZSA9IHNuaXBwZXRDb250cm9sbGVyPy5pc0luU25pcHBldE9ic2VydmFibGUgPz8gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblxuXHRcdGRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpLnRoZW4oY3JlYXRlRGlzcG9zYWJsZUNiKGFjY291bnQgPT4gdGhpcy5za3Uuc2V0KHNrdUZyb21BY2NvdW50KGFjY291bnQpLCB1bmRlZmluZWQpLCB0aGlzLl9zdG9yZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KGFjY291bnQgPT4gdGhpcy5za3Uuc2V0KHNrdUZyb21BY2NvdW50KGFjY291bnQpLCB1bmRlZmluZWQpKSk7XG5cblx0XHR0aGlzLl90eXBpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgVHlwaW5nSW50ZXJ2YWwodGhpcy50ZXh0TW9kZWwpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lubGluZUNvbXBsZXRpb25zU2VydmljZS5vbkRpZENoYW5nZUlzU25vb3ppbmcoKGlzU25vb3ppbmcpID0+IHtcblx0XHRcdGlmIChpc1Nub296aW5nKSB7XG5cdFx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHsgLy8gRGV0ZXJtaW5lIGVkaXRvciB0eXBlXG5cdFx0XHRjb25zdCBpc05vdGVib29rID0gdGhpcy50ZXh0TW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGw7XG5cdFx0XHRjb25zdCBbZGlmZkVkaXRvcl0gPSB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5saXN0RGlmZkVkaXRvcnMoKVxuXHRcdFx0XHQuZmlsdGVyKGQgPT5cblx0XHRcdFx0XHRkLmdldE9yaWdpbmFsRWRpdG9yKCkuZ2V0SWQoKSA9PT0gdGhpcy5fZWRpdG9yLmdldElkKCkgfHxcblx0XHRcdFx0XHRkLmdldE1vZGlmaWVkRWRpdG9yKCkuZ2V0SWQoKSA9PT0gdGhpcy5fZWRpdG9yLmdldElkKCkpO1xuXG5cdFx0XHR0aGlzLmlzSW5EaWZmRWRpdG9yID0gISFkaWZmRWRpdG9yO1xuXHRcdFx0dGhpcy5lZGl0b3JUeXBlID0gaXNOb3RlYm9vayA/IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLk5vdGVib29rXG5cdFx0XHRcdDogdGhpcy5pc0luRGlmZkVkaXRvciA/IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLkRpZmZFZGl0b3Jcblx0XHRcdFx0XHQ6IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLlRleHRFZGl0b3I7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5zdGF0ZSwgKHMpID0+IHtcblx0XHRcdGlmIChzICYmIHMuaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UucmVwb3J0TmV3Q29tcGxldGlvbihzLmlubGluZVN1Z2dlc3Rpb24ucmVxdWVzdFV1aWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX2ZldGNoSW5saW5lQ29tcGxldGlvbnNQcm9taXNlKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMudmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2luQWNjZXB0Rmxvdy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QganVtcFRvUmVzZXQgPSB0aGlzLnN0YXRlLm1hcCgocywgcmVhZGVyKSA9PiAhcyB8fCBzLmtpbmQgPT09ICdpbmxpbmVFZGl0JyAmJiAhcy5jdXJzb3JBdElubGluZUVkaXQucmVhZChyZWFkZXIpKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoanVtcFRvUmVzZXQpIHtcblx0XHRcdFx0dGhpcy5fanVtcGVkVG9JZC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlubGluZVN1Z2dlc3Rpb24gPSB0aGlzLnN0YXRlLm1hcChzID0+IHM/LmlubGluZVN1Z2dlc3Rpb24pLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpbmxpbmVTdWdnZXN0aW9uKSB7XG5cdFx0XHRcdGlubGluZVN1Z2dlc3Rpb24uYWRkUGVyZm9ybWFuY2VNYXJrZXIoJ2FjdGl2ZVN1Z2dlc3Rpb24nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmxpbmVFZGl0U2VtYW50aWNJZCA9IHRoaXMuaW5saW5lRWRpdFN0YXRlLm1hcChzID0+IHM/LmlubGluZVN1Z2dlc3Rpb24uc2VtYW50aWNJZCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IGlubGluZUVkaXRTZW1hbnRpY0lkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpZCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRcdHRoaXMuX2xhc3RTaG93bklubGluZUNvbXBsZXRpb25JbmZvID0ge1xuXHRcdFx0XHRcdGFsdGVybmF0ZVRleHRNb2RlbFZlcnNpb25JZDogdGhpcy50ZXh0TW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSxcblx0XHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uOiB0aGlzLnN0YXRlLmdldCgpIS5pbmxpbmVTdWdnZXN0aW9uISxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUT0RPOiBzaG91bGQgdXNlIGdldEF2YWlsYWJsZVByb3ZpZGVycyBhbmQgdXBkYXRlIG9uIF9zdXBwcmVzc2VkSW5saW5lQ29tcGxldGlvbkdyb3VwSWRzIGNoYW5nZVxuXHRcdGNvbnN0IGlubGluZUNvbXBsZXRpb25Qcm92aWRlcnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIub25EaWRDaGFuZ2UsICgpID0+IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIuYWxsKHRleHRNb2RlbCkpO1xuXHRcdG1hcE9ic2VydmFibGVBcnJheUNhY2hlZCh0aGlzLCBpbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJzLCAocHJvdmlkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHRpZiAoIXByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9ucyhjaGFuZ2VIaW50ID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT25seSB1cGRhdGUgdGhlIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSB8fCB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRcdGlmIChhY3RpdmVFZGl0b3IgIT09IHRoaXMuX2VkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl90cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UuZ2V0KCkpIHtcblx0XHRcdFx0XHQvLyBUT0RPQGhlZGlldCByZW1vdmUgdGhpcyBhbmQgYWx3YXlzIGRvIHRoZSBlbHNlIGJyYW5jaC5cblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIodW5kZWZpbmVkLCB7IG9ubHlGZXRjaElubGluZUVkaXRzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgYW4gYWN0aXZlIHN1Z2dlc3Rpb24gZnJvbSBhIGRpZmZlcmVudCBwcm92aWRlciwgd2UgaWdub3JlIHRoZSB1cGRhdGVcblx0XHRcdFx0Y29uc3QgYWN0aXZlU3RhdGUgPSB0aGlzLnN0YXRlLmdldCgpO1xuXHRcdFx0XHRpZiAoYWN0aXZlU3RhdGUgJiYgKGFjdGl2ZVN0YXRlLmlubGluZVN1Z2dlc3Rpb24gfHwgYWN0aXZlU3RhdGUuZWRpdHMpICYmIGFjdGl2ZVN0YXRlLmlubGluZVN1Z2dlc3Rpb24/LnNvdXJjZS5wcm92aWRlciAhPT0gcHJvdmlkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZmV0Y2hTcGVjaWZpY1Byb3ZpZGVyU2lnbmFsLnRyaWdnZXIodHgsIHsgcHJvdmlkZXIsIGNoYW5nZUhpbnQ6IGNoYW5nZUhpbnQgPz8gdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdHRoaXMudHJpZ2dlcih0eCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9KSk7XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fZGlkVW5kb0lubGluZUVkaXRzLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2xhc3RTaG93bklubGluZUNvbXBsZXRpb25JbmZvOiB7IGFsdGVybmF0ZVRleHRNb2RlbFZlcnNpb25JZDogbnVtYmVyOyAvKiBhbHJlYWR5IGZyZWVkISAqLyBpbmxpbmVDb21wbGV0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0QWNjZXB0ZWRJbmxpbmVDb21wbGV0aW9uSW5mbzogeyB0ZXh0TW9kZWxWZXJzaW9uSWRBZnRlcjogbnVtYmVyOyAvKiBhbHJlYWR5IGZyZWVkISAqLyBpbmxpbmVDb21wbGV0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWRVbmRvSW5saW5lRWRpdHMgPSBkZXJpdmVkSGFuZGxlQ2hhbmdlcyh7XG5cdFx0b3duZXI6IHRoaXMsXG5cdFx0Y2hhbmdlVHJhY2tlcjoge1xuXHRcdFx0Y3JlYXRlQ2hhbmdlU3VtbWFyeTogKCkgPT4gKHsgZGlkVW5kbzogZmFsc2UgfSksXG5cdFx0XHRoYW5kbGVDaGFuZ2U6IChjdHgsIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5kaWRVbmRvID0gY3R4LmRpZENoYW5nZSh0aGlzLl90ZXh0TW9kZWxWZXJzaW9uSWQpICYmICEhY3R4LmNoYW5nZT8uaXNVbmRvaW5nO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH0sIChyZWFkZXIsIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSB0aGlzLl90ZXh0TW9kZWxWZXJzaW9uSWQucmVhZChyZWFkZXIpO1xuXHRcdGlmICh2ZXJzaW9uSWQgIT09IG51bGxcblx0XHRcdCYmIHRoaXMuX2xhc3RBY2NlcHRlZElubGluZUNvbXBsZXRpb25JbmZvXG5cdFx0XHQmJiB0aGlzLl9sYXN0QWNjZXB0ZWRJbmxpbmVDb21wbGV0aW9uSW5mby50ZXh0TW9kZWxWZXJzaW9uSWRBZnRlciA9PT0gdmVyc2lvbklkIC0gMVxuXHRcdFx0JiYgdGhpcy5fbGFzdEFjY2VwdGVkSW5saW5lQ29tcGxldGlvbkluZm8uaW5saW5lQ29tcGxldGlvbi5pc0lubGluZUVkaXRcblx0XHRcdCYmIGNoYW5nZVN1bW1hcnkuZGlkVW5kb1xuXHRcdCkge1xuXHRcdFx0dGhpcy5fbGFzdEFjY2VwdGVkSW5saW5lQ29tcGxldGlvbkluZm8gPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblxuXHRwdWJsaWMgZGVidWdHZXRTZWxlY3RlZFN1Z2dlc3RJdGVtKCk6IElPYnNlcnZhYmxlPFN1Z2dlc3RJdGVtSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RlZFN1Z2dlc3RJdGVtO1xuXHR9XG5cblx0cHVibGljIGdldEluZGVudGF0aW9uSW5mbyhyZWFkZXI6IElSZWFkZXIpIHtcblx0XHRsZXQgc3RhcnRzV2l0aEluZGVudGF0aW9uID0gZmFsc2U7XG5cdFx0bGV0IHN0YXJ0c1dpdGhJbmRlbnRhdGlvbkxlc3NUaGFuVGFiU2l6ZSA9IHRydWU7XG5cdFx0Y29uc3QgZ2hvc3RUZXh0ID0gdGhpcz8ucHJpbWFyeUdob3N0VGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCEhdGhpcz8uX3NlbGVjdGVkU3VnZ2VzdEl0ZW0gJiYgZ2hvc3RUZXh0ICYmIGdob3N0VGV4dC5wYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB7IGNvbHVtbiwgbGluZXMgfSA9IGdob3N0VGV4dC5wYXJ0c1swXTtcblxuXHRcdFx0Y29uc3QgZmlyc3RMaW5lID0gbGluZXNbMF0ubGluZTtcblxuXHRcdFx0Y29uc3QgaW5kZW50YXRpb25FbmRDb2x1bW4gPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lSW5kZW50Q29sdW1uKGdob3N0VGV4dC5saW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGluSW5kZW50YXRpb24gPSBjb2x1bW4gPD0gaW5kZW50YXRpb25FbmRDb2x1bW47XG5cblx0XHRcdGlmIChpbkluZGVudGF0aW9uKSB7XG5cdFx0XHRcdGxldCBmaXJzdE5vbldzSWR4ID0gZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgoZmlyc3RMaW5lKTtcblx0XHRcdFx0aWYgKGZpcnN0Tm9uV3NJZHggPT09IC0xKSB7XG5cdFx0XHRcdFx0Zmlyc3ROb25Xc0lkeCA9IGZpcnN0TGluZS5sZW5ndGggLSAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0YXJ0c1dpdGhJbmRlbnRhdGlvbiA9IGZpcnN0Tm9uV3NJZHggPiAwO1xuXG5cdFx0XHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUNvbHVtbkluZGVudGF0aW9uID0gQ3Vyc29yQ29sdW1ucy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbihmaXJzdExpbmUsIGZpcnN0Tm9uV3NJZHggKyAxLCB0YWJTaXplKTtcblx0XHRcdFx0c3RhcnRzV2l0aEluZGVudGF0aW9uTGVzc1RoYW5UYWJTaXplID0gdmlzaWJsZUNvbHVtbkluZGVudGF0aW9uIDwgdGFiU2l6ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0c1dpdGhJbmRlbnRhdGlvbixcblx0XHRcdHN0YXJ0c1dpdGhJbmRlbnRhdGlvbkxlc3NUaGFuVGFiU2l6ZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJlc2VydmVDdXJyZW50Q29tcGxldGlvblJlYXNvbnMgPSBuZXcgU2V0KFtcblx0XHRWZXJzaW9uSWRDaGFuZ2VSZWFzb24uUmVkbyxcblx0XHRWZXJzaW9uSWRDaGFuZ2VSZWFzb24uVW5kbyxcblx0XHRWZXJzaW9uSWRDaGFuZ2VSZWFzb24uQWNjZXB0V29yZCxcblx0XSk7XG5cblx0cHJpdmF0ZSBfZ2V0UmVhc29uKGU6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQpOiBWZXJzaW9uSWRDaGFuZ2VSZWFzb24ge1xuXHRcdGlmIChlPy5pc1VuZG9pbmcpIHsgcmV0dXJuIFZlcnNpb25JZENoYW5nZVJlYXNvbi5VbmRvOyB9XG5cdFx0aWYgKGU/LmlzUmVkb2luZykgeyByZXR1cm4gVmVyc2lvbklkQ2hhbmdlUmVhc29uLlJlZG87IH1cblx0XHRpZiAodGhpcy5pc0FjY2VwdGluZ1BhcnRpYWxseSkgeyByZXR1cm4gVmVyc2lvbklkQ2hhbmdlUmVhc29uLkFjY2VwdFdvcmQ7IH1cblx0XHRyZXR1cm4gVmVyc2lvbklkQ2hhbmdlUmVhc29uLk90aGVyO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbnRSZWZldGNoU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbCh0aGlzKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaElubGluZUNvbXBsZXRpb25zUHJvbWlzZSA9IGRlcml2ZWRIYW5kbGVDaGFuZ2VzKHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRjcmVhdGVDaGFuZ2VTdW1tYXJ5OiAoKSA9PiAoe1xuXHRcdFx0XHRkb250UmVmZXRjaDogZmFsc2UsXG5cdFx0XHRcdHByZXNlcnZlQ3VycmVudENvbXBsZXRpb246IGZhbHNlLFxuXHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQ6IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWMsXG5cdFx0XHRcdG9ubHlSZXF1ZXN0SW5saW5lRWRpdHM6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGREZWJvdW5jZTogdHJ1ZSxcblx0XHRcdFx0cHJvdmlkZXI6IHVuZGVmaW5lZCBhcyBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGFuZ2VIaW50OiB1bmRlZmluZWQgYXMgSUlubGluZUNvbXBsZXRpb25DaGFuZ2VIaW50IHwgdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZXh0Q2hhbmdlOiBmYWxzZSxcblx0XHRcdFx0Y2hhbmdlUmVhc29uOiAnJyxcblx0XHRcdH0pLFxuXHRcdFx0aGFuZGxlQ2hhbmdlOiAoY3R4LCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gZmV0Y2ggaW5saW5lIGNvbXBsZXRpb25zICovXG5cdFx0XHRcdGlmIChjdHguZGlkQ2hhbmdlKHRoaXMuX3RleHRNb2RlbFZlcnNpb25JZCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fcHJlc2VydmVDdXJyZW50Q29tcGxldGlvblJlYXNvbnMuaGFzKHRoaXMuX2dldFJlYXNvbihjdHguY2hhbmdlKSkpIHtcblx0XHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkucHJlc2VydmVDdXJyZW50Q29tcGxldGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRldGFpbGVkUmVhc29ucyA9IGN0eC5jaGFuZ2U/LmRldGFpbGVkUmVhc29ucyA/PyBbXTtcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LmNoYW5nZVJlYXNvbiA9IGRldGFpbGVkUmVhc29ucy5sZW5ndGggPiAwID8gZGV0YWlsZWRSZWFzb25zWzBdLmdldFR5cGUoKSA6ICcnO1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkudGV4dENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3R4LmRpZENoYW5nZSh0aGlzLl9mb3JjZVVwZGF0ZUV4cGxpY2l0bHlTaWduYWwpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5wcmVzZXJ2ZUN1cnJlbnRDb21wbGV0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LmlubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCA9IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdDtcblx0XHRcdFx0fSBlbHNlIGlmIChjdHguZGlkQ2hhbmdlKHRoaXMuZG9udFJlZmV0Y2hTaWduYWwpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5kb250UmVmZXRjaCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3R4LmRpZENoYW5nZSh0aGlzLl9vbmx5UmVxdWVzdElubGluZUVkaXRzU2lnbmFsKSkge1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkub25seVJlcXVlc3RJbmxpbmVFZGl0cyA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3R4LmRpZENoYW5nZSh0aGlzLl9mZXRjaFNwZWNpZmljUHJvdmlkZXJTaWduYWwpKSB7XG5cdFx0XHRcdFx0Y2hhbmdlU3VtbWFyeS5wcm92aWRlciA9IGN0eC5jaGFuZ2U/LnByb3ZpZGVyO1xuXHRcdFx0XHRcdGNoYW5nZVN1bW1hcnkuY2hhbmdlSGludCA9IGN0eC5jaGFuZ2U/LmNoYW5nZUhpbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdH0sXG5cblx0fSwgKHJlYWRlciwgY2hhbmdlU3VtbWFyeSkgPT4ge1xuXHRcdHRoaXMuX3NvdXJjZS5jbGVhck9wZXJhdGlvbk9uVGV4dE1vZGVsQ2hhbmdlLnJlYWQocmVhZGVyKTsgLy8gTWFrZSBzdXJlIHRoZSBjbGVhciBvcGVyYXRpb24gcnVucyBiZWZvcmUgdGhlIGZldGNoIG9wZXJhdGlvblxuXHRcdHRoaXMuX25vRGVsYXlTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuZG9udFJlZmV0Y2hTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX29ubHlSZXF1ZXN0SW5saW5lRWRpdHNTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdHRoaXMuX2ZvcmNlVXBkYXRlRXhwbGljaXRseVNpZ25hbC5yZWFkKHJlYWRlcik7XG5cdFx0dGhpcy5fZmV0Y2hTcGVjaWZpY1Byb3ZpZGVyU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBzaG91bGRVcGRhdGUgPSAhdGhpcy5faXNTdXBwcmVzc2VkKClcblx0XHRcdCYmICgodGhpcy5fZW5hYmxlZC5yZWFkKHJlYWRlcikgJiYgdGhpcy5fc2VsZWN0ZWRTdWdnZXN0SXRlbS5yZWFkKHJlYWRlcikpIHx8IHRoaXMuX2lzQWN0aXZlLnJlYWQocmVhZGVyKSlcblx0XHRcdCYmICghdGhpcy5faW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLmlzU25vb3ppbmcoKSB8fCBjaGFuZ2VTdW1tYXJ5LmlubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0KTtcblx0XHRpZiAoIXNob3VsZFVwZGF0ZSkge1xuXHRcdFx0dGhpcy5fc291cmNlLmNhbmNlbFVwZGF0ZSgpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl90ZXh0TW9kZWxWZXJzaW9uSWQucmVhZChyZWFkZXIpOyAvLyBSZWZldGNoIG9uIHRleHQgY2hhbmdlXG5cblx0XHRjb25zdCBzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLl9zb3VyY2Uuc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zLnJlYWQodW5kZWZpbmVkKTtcblx0XHRsZXQgc3VnZ2VzdEl0ZW0gPSB0aGlzLl9zZWxlY3RlZFN1Z2dlc3RJdGVtLnJlYWQocmVhZGVyKTtcblx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd09uU3VnZ2VzdENvbmZsaWN0LnJlYWQodW5kZWZpbmVkKSkge1xuXHRcdFx0c3VnZ2VzdEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMgJiYgIXN1Z2dlc3RJdGVtKSB7XG5cdFx0XHR0aGlzLl9zb3VyY2Uuc2VlZElubGluZUNvbXBsZXRpb25zV2l0aFN1Z2dlc3RXaWRnZXQoKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlU3VtbWFyeS5kb250UmVmZXRjaCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZGlkVW5kb0lubGluZUVkaXRzLnJlYWQocmVhZGVyKSAmJiBjaGFuZ2VTdW1tYXJ5LmlubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCAhPT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0KSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMuX3NvdXJjZS5jbGVhcih0eCk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlYXNvbjogc3RyaW5nID0gJyc7XG5cdFx0aWYgKGNoYW5nZVN1bW1hcnkucHJvdmlkZXIpIHtcblx0XHRcdHJlYXNvbiArPSAncHJvdmlkZXJPbkRpZENoYW5nZSc7XG5cdFx0fSBlbHNlIGlmIChjaGFuZ2VTdW1tYXJ5LmlubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkV4cGxpY2l0KSB7XG5cdFx0XHRyZWFzb24gKz0gJ2V4cGxpY2l0Jztcblx0XHR9XG5cdFx0aWYgKGNoYW5nZVN1bW1hcnkuY2hhbmdlUmVhc29uKSB7XG5cdFx0XHRyZWFzb24gKz0gcmVhc29uLmxlbmd0aCA+IDAgPyBgOiR7Y2hhbmdlU3VtbWFyeS5jaGFuZ2VSZWFzb259YCA6IGNoYW5nZVN1bW1hcnkuY2hhbmdlUmVhc29uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR5cGluZ0ludGVydmFsID0gdGhpcy5fdHlwaW5nLmdldFR5cGluZ0ludGVydmFsKCk7XG5cdFx0Y29uc3QgcmVxdWVzdEluZm86IElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mbyA9IHtcblx0XHRcdGVkaXRvclR5cGU6IHRoaXMuZWRpdG9yVHlwZSxcblx0XHRcdHN0YXJ0VGltZTogRGF0ZS5ub3coKSxcblx0XHRcdGxhbmd1YWdlSWQ6IHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdHJlYXNvbixcblx0XHRcdHR5cGluZ0ludGVydmFsOiB0eXBpbmdJbnRlcnZhbC5hdmVyYWdlSW50ZXJ2YWwsXG5cdFx0XHR0eXBpbmdJbnRlcnZhbENoYXJhY3RlckNvdW50OiB0eXBpbmdJbnRlcnZhbC5jaGFyYWN0ZXJDb3VudCxcblx0XHRcdGF2YWlsYWJsZVByb3ZpZGVyczogW10sXG5cdFx0XHRza3U6IHRoaXMuc2t1LnJlYWQodW5kZWZpbmVkKSxcblx0XHR9O1xuXG5cdFx0bGV0IGNvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0V2l0aG91dFV1aWQgPSB7XG5cdFx0XHR0cmlnZ2VyS2luZDogY2hhbmdlU3VtbWFyeS5pbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsXG5cdFx0XHRzZWxlY3RlZFN1Z2dlc3Rpb25JbmZvOiBzdWdnZXN0SXRlbT8udG9TZWxlY3RlZFN1Z2dlc3Rpb25JbmZvKCksXG5cdFx0XHRpbmNsdWRlSW5saW5lQ29tcGxldGlvbnM6ICFjaGFuZ2VTdW1tYXJ5Lm9ubHlSZXF1ZXN0SW5saW5lRWRpdHMsXG5cdFx0XHRpbmNsdWRlSW5saW5lRWRpdHM6IHRoaXMuX2lubGluZUVkaXRzRW5hYmxlZC5yZWFkKHJlYWRlciksXG5cdFx0XHRyZXF1ZXN0SXNzdWVkRGF0ZVRpbWU6IHJlcXVlc3RJbmZvLnN0YXJ0VGltZSxcblx0XHRcdGVhcmxpZXN0U2hvd25EYXRlVGltZTogcmVxdWVzdEluZm8uc3RhcnRUaW1lICsgKGNoYW5nZVN1bW1hcnkuaW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXQgfHwgdGhpcy5pbkFjY2VwdEZsb3cucmVhZCh1bmRlZmluZWQpID8gMCA6IHRoaXMuX21pblNob3dEZWxheS5yZWFkKHVuZGVmaW5lZCkpLFxuXHRcdFx0Y2hhbmdlSGludDogY2hhbmdlU3VtbWFyeS5jaGFuZ2VIaW50LFxuXHRcdH07XG5cblx0XHRpZiAoY29udGV4dC50cmlnZ2VyS2luZCA9PT0gSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkF1dG9tYXRpYyAmJiBjaGFuZ2VTdW1tYXJ5LnRleHRDaGFuZ2UpIHtcblx0XHRcdGlmICh0aGlzLnRleHRNb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpID09PSB0aGlzLl9sYXN0U2hvd25JbmxpbmVDb21wbGV0aW9uSW5mbz8uYWx0ZXJuYXRlVGV4dE1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHRcdC8vIFdoZW4gdW5kb2luZyBiYWNrIHRvIGEgdmVyc2lvbiB3aGVyZSBhbiBpbmxpbmUgZWRpdC9jb21wbGV0aW9uIHdhcyBzaG93bixcblx0XHRcdFx0Ly8gd2Ugd2FudCB0byBzaG93IGFuIGlubGluZSBlZGl0IChvciBjb21wbGV0aW9uKSBhZ2FpbiBpZiBpdCB3YXMgb3JpZ2luYWxseSBhbiBpbmxpbmUgZWRpdCAob3IgY29tcGxldGlvbikuXG5cdFx0XHRcdGNvbnRleHQgPSB7XG5cdFx0XHRcdFx0Li4uY29udGV4dCxcblx0XHRcdFx0XHRpbmNsdWRlSW5saW5lQ29tcGxldGlvbnM6ICF0aGlzLl9sYXN0U2hvd25JbmxpbmVDb21wbGV0aW9uSW5mby5pbmxpbmVDb21wbGV0aW9uLmlzSW5saW5lRWRpdCxcblx0XHRcdFx0XHRpbmNsdWRlSW5saW5lRWRpdHM6IHRoaXMuX2xhc3RTaG93bklubGluZUNvbXBsZXRpb25JbmZvLmlubGluZUNvbXBsZXRpb24uaXNJbmxpbmVFZGl0LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1Ub1ByZXNlcnZlQ2FuZGlkYXRlID0gdGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb24ucmVhZCh1bmRlZmluZWQpID8/IHRoaXMuX2lubGluZVN1Z2dlc3Rpb25JdGVtcy5yZWFkKHVuZGVmaW5lZCk/LmlubGluZUVkaXQ7XG5cdFx0Y29uc3QgaXRlbVRvUHJlc2VydmUgPSBjaGFuZ2VTdW1tYXJ5LnByZXNlcnZlQ3VycmVudENvbXBsZXRpb24gfHwgaXRlbVRvUHJlc2VydmVDYW5kaWRhdGU/LmZvcndhcmRTdGFibGVcblx0XHRcdD8gaXRlbVRvUHJlc2VydmVDYW5kaWRhdGUgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdXNlckp1bXBlZFRvQWN0aXZlQ29tcGxldGlvbiA9IHRoaXMuX2p1bXBlZFRvSWQubWFwKGp1bXBlZFRvID0+ICEhanVtcGVkVG8gJiYganVtcGVkVG8gPT09IHRoaXMuX2lubGluZVN1Z2dlc3Rpb25JdGVtcy5yZWFkKHVuZGVmaW5lZCk/LmlubGluZUVkaXQ/LnNlbWFudGljSWQpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gY2hhbmdlU3VtbWFyeS5wcm92aWRlclxuXHRcdFx0PyB7IHByb3ZpZGVyczogW2NoYW5nZVN1bW1hcnkucHJvdmlkZXJdLCBsYWJlbDogJ3NpbmdsZTonICsgY2hhbmdlU3VtbWFyeS5wcm92aWRlci5wcm92aWRlcklkPy50b1N0cmluZygpIH1cblx0XHRcdDogeyBwcm92aWRlcnM6IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIuYWxsKHRoaXMudGV4dE1vZGVsKSwgbGFiZWw6IHVuZGVmaW5lZCB9OyAvLyBUT0RPOiBzaG91bGQgdXNlIGlubGluZUNvbXBsZXRpb25Qcm92aWRlcnNcblx0XHRjb25zdCBhdmFpbGFibGVQcm92aWRlcnMgPSB0aGlzLmdldEF2YWlsYWJsZVByb3ZpZGVycyhwcm92aWRlcnMucHJvdmlkZXJzKTtcblx0XHRyZXF1ZXN0SW5mby5hdmFpbGFibGVQcm92aWRlcnMgPSBhdmFpbGFibGVQcm92aWRlcnMubWFwKHAgPT4gcC5wcm92aWRlcklkKS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuZmV0Y2goYXZhaWxhYmxlUHJvdmlkZXJzLCBwcm92aWRlcnMubGFiZWwsIGNvbnRleHQsIGl0ZW1Ub1ByZXNlcnZlPy5pZGVudGl0eSwgY2hhbmdlU3VtbWFyeS5zaG91bGREZWJvdW5jZSwgdXNlckp1bXBlZFRvQWN0aXZlQ29tcGxldGlvbiwgcmVxdWVzdEluZm8pO1xuXHR9KTtcblxuXHQvLyBUT0RPOiBUaGlzIGlzIG5vdCBhbiBpZGVhbCBpbXBsZW1lbnRhdGlvbiBvZiBleGNsdWRlc0dyb3VwSWRzLCBob3dldmVyIGFzIHRoaXMgaXMgY3VycmVudGx5IHN0aWxsIGJlaGluZCBwcm9wb3NlZCBBUElcblx0Ly8gYW5kIGR1ZSB0byB0aGUgdGltZSBjb25zdHJhaW50cywgd2UgYXJlIHVzaW5nIGEgc2ltcGxpZmllZCBhcHByb2FjaFxuXHRwcml2YXRlIGdldEF2YWlsYWJsZVByb3ZpZGVycyhwcm92aWRlcnM6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJbXSk6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJbXSB7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZFByb3ZpZGVyR3JvdXBJZHMgPSB0aGlzLl9zdXBwcmVzc2VkSW5saW5lQ29tcGxldGlvbkdyb3VwSWRzLmdldCgpO1xuXHRcdGNvbnN0IHVuc3VwcHJlc3NlZFByb3ZpZGVycyA9IHByb3ZpZGVycy5maWx0ZXIocHJvdmlkZXIgPT4gIShwcm92aWRlci5ncm91cElkICYmIHN1cHByZXNzZWRQcm92aWRlckdyb3VwSWRzLmhhcyhwcm92aWRlci5ncm91cElkKSkpO1xuXG5cdFx0Y29uc3QgZXhjbHVkZWRHcm91cElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdW5zdXBwcmVzc2VkUHJvdmlkZXJzKSB7XG5cdFx0XHRwcm92aWRlci5leGNsdWRlc0dyb3VwSWRzPy5mb3JFYWNoKHAgPT4gZXhjbHVkZWRHcm91cElkcy5hZGQocCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF2YWlsYWJsZVByb3ZpZGVyczogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB1bnN1cHByZXNzZWRQcm92aWRlcnMpIHtcblx0XHRcdGlmIChwcm92aWRlci5ncm91cElkICYmIGV4Y2x1ZGVkR3JvdXBJZHMuaGFzKHByb3ZpZGVyLmdyb3VwSWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YXZhaWxhYmxlUHJvdmlkZXJzLnB1c2gocHJvdmlkZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhdmFpbGFibGVQcm92aWRlcnM7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdHJpZ2dlcih0eD86IElUcmFuc2FjdGlvbiwgb3B0aW9uczogeyBvbmx5RmV0Y2hJbmxpbmVFZGl0cz86IGJvb2xlYW47IG5vRGVsYXk/OiBib29sZWFuOyBwcm92aWRlcj86IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXI7IGV4cGxpY2l0PzogYm9vbGVhbjsgY2hhbmdlSGludD86IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCB9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzdWJ0cmFuc2FjdGlvbih0eCwgdHggPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnMub25seUZldGNoSW5saW5lRWRpdHMpIHtcblx0XHRcdFx0dGhpcy5fb25seVJlcXVlc3RJbmxpbmVFZGl0c1NpZ25hbC50cmlnZ2VyKHR4KTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zLm5vRGVsYXkpIHtcblx0XHRcdFx0dGhpcy5fbm9EZWxheVNpZ25hbC50cmlnZ2VyKHR4KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzQWN0aXZlLnNldCh0cnVlLCB0eCk7XG5cblx0XHRcdGlmIChvcHRpb25zLmV4cGxpY2l0KSB7XG5cdFx0XHRcdHRoaXMuX2luQWNjZXB0Rmxvdy5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0XHR0aGlzLl9mb3JjZVVwZGF0ZUV4cGxpY2l0bHlTaWduYWwudHJpZ2dlcih0eCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucy5wcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLl9mZXRjaFNwZWNpZmljUHJvdmlkZXJTaWduYWwudHJpZ2dlcih0eCwgeyBwcm92aWRlcjogb3B0aW9ucy5wcm92aWRlciwgY2hhbmdlSGludDogb3B0aW9ucy5jaGFuZ2VIaW50IH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGF3YWl0IHRoaXMuX2ZldGNoSW5saW5lQ29tcGxldGlvbnNQcm9taXNlLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHRyaWdnZXJFeHBsaWNpdGx5KHR4PzogSVRyYW5zYWN0aW9uLCBvbmx5RmV0Y2hJbmxpbmVFZGl0czogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudHJpZ2dlcih0eCwgeyBvbmx5RmV0Y2hJbmxpbmVFZGl0cywgZXhwbGljaXQ6IHRydWUgfSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcChzdG9wUmVhc29uOiAnZXhwbGljaXRDYW5jZWwnIHwgJ2F1dG9tYXRpYycgPSAnYXV0b21hdGljJywgdHg/OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRzdWJ0cmFuc2FjdGlvbih0eCwgdHggPT4ge1xuXHRcdFx0aWYgKHN0b3BSZWFzb24gPT09ICdleHBsaWNpdENhbmNlbCcpIHtcblx0XHRcdFx0Y29uc3QgaW5saW5lQ29tcGxldGlvbiA9IHRoaXMuc3RhdGUuZ2V0KCk/LmlubGluZVN1Z2dlc3Rpb247XG5cdFx0XHRcdGlmIChpbmxpbmVDb21wbGV0aW9uKSB7XG5cdFx0XHRcdFx0aW5saW5lQ29tcGxldGlvbi5yZXBvcnRFbmRPZkxpZmUoeyBraW5kOiBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5SZWplY3RlZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9pc0FjdGl2ZS5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdHRoaXMuX3NvdXJjZS5jbGVhcih0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVTdWdnZXN0aW9uSXRlbXMgPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzIH0sIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgYyA9IHRoaXMuX3NvdXJjZS5pbmxpbmVDb21wbGV0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFjKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHRoaXMucHJpbWFyeVBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRsZXQgaW5saW5lRWRpdDogSW5saW5lRWRpdEl0ZW0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdmlzaWJsZUNvbXBsZXRpb25zOiBJbmxpbmVDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb21wbGV0aW9uIG9mIGMuaW5saW5lQ29tcGxldGlvbnMpIHtcblx0XHRcdGlmICghY29tcGxldGlvbi5pc0lubGluZUVkaXQpIHtcblx0XHRcdFx0aWYgKGNvbXBsZXRpb24uaXNWaXNpYmxlKHRoaXMudGV4dE1vZGVsLCBjdXJzb3JQb3NpdGlvbikpIHtcblx0XHRcdFx0XHR2aXNpYmxlQ29tcGxldGlvbnMucHVzaChjb21wbGV0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5saW5lRWRpdCA9IGNvbXBsZXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHZpc2libGVDb21wbGV0aW9ucy5sZW5ndGggIT09IDApIHtcblx0XHRcdC8vIERvbid0IHNob3cgdGhlIGlubGluZSBlZGl0IGlmIHRoZXJlIGlzIGEgdmlzaWJsZSBjb21wbGV0aW9uXG5cdFx0XHRpbmxpbmVFZGl0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbmxpbmVDb21wbGV0aW9uczogdmlzaWJsZUNvbXBsZXRpb25zLFxuXHRcdFx0aW5saW5lRWRpdCxcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVDb21wbGV0aW9uSXRlbXMgPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKCkgfSwgcmVhZGVyID0+IHtcblx0XHRjb25zdCBjID0gdGhpcy5faW5saW5lU3VnZ2VzdGlvbkl0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gYz8uaW5saW5lQ29tcGxldGlvbnMgPz8gW107XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleCA9IGRlcml2ZWQ8bnVtYmVyPih0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQgPSB0aGlzLl9zZWxlY3RlZElubGluZUNvbXBsZXRpb25JZC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZmlsdGVyZWRDb21wbGV0aW9ucyA9IHRoaXMuX2lubGluZUNvbXBsZXRpb25JdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQgPT09IHVuZGVmaW5lZCA/IC0xXG5cdFx0XHQ6IGZpbHRlcmVkQ29tcGxldGlvbnMuZmluZEluZGV4KHYgPT4gdi5zZW1hbnRpY0lkID09PSBzZWxlY3RlZElubGluZUNvbXBsZXRpb25JZCk7XG5cdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdC8vIFJlc2V0IHRoZSBzZWxlY3Rpb24gc28gdGhhdCB0aGUgc2VsZWN0aW9uIGRvZXMgbm90IGp1bXAgYmFjayB3aGVuIGl0IGFwcGVhcnMgYWdhaW5cblx0XHRcdHRoaXMuX3NlbGVjdGVkSW5saW5lQ29tcGxldGlvbklkLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIGlkeDtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGVkSW5saW5lQ29tcGxldGlvbiA9IGRlcml2ZWQ8SW5saW5lQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCBmaWx0ZXJlZENvbXBsZXRpb25zID0gdGhpcy5faW5saW5lQ29tcGxldGlvbkl0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpZHggPSB0aGlzLnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbkluZGV4LnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gZmlsdGVyZWRDb21wbGV0aW9uc1tpZHhdO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgYWN0aXZlQ29tbWFuZHMgPSBkZXJpdmVkT3B0czxJbmxpbmVDb21wbGV0aW9uQ29tbWFuZFtdPih7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogYXJyYXlFcXVhbHNDKCkgfSxcblx0XHRyID0+IHRoaXMuc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uLnJlYWQocik/LnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucy5jb21tYW5kcyA/PyBbXVxuXHQpO1xuXG5cdHB1YmxpYyByZWFkb25seSBsYXN0VHJpZ2dlcktpbmQ6IElPYnNlcnZhYmxlPElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCB8IHVuZGVmaW5lZD47XG5cblx0cHVibGljIHJlYWRvbmx5IGlubGluZUNvbXBsZXRpb25zQ291bnQgPSBkZXJpdmVkPG51bWJlciB8IHVuZGVmaW5lZD4odGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5sYXN0VHJpZ2dlcktpbmQucmVhZChyZWFkZXIpID09PSBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbXMucmVhZChyZWFkZXIpLmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1Zpc2libGVQZWVrV2lkZ2V0cyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX2VkaXRvck9icy5vcGVuZWRQZWVrV2lkZ2V0cy5yZWFkKHJlYWRlcikgPiAwKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRTaG93T25TdWdnZXN0Q29uZmxpY3QgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc2hvd09uU3VnZ2VzdENvbmZsaWN0ID0gdGhpcy5fc2hvd09uU3VnZ2VzdENvbmZsaWN0LnJlYWQocmVhZGVyKTtcblx0XHRpZiAoc2hvd09uU3VnZ2VzdENvbmZsaWN0ICE9PSAnbmV2ZXInKSB7XG5cdFx0XHRjb25zdCBoYXNJbmxpbmVDb21wbGV0aW9uID0gISF0aGlzLnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaGFzSW5saW5lQ29tcGxldGlvbikge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fc2VsZWN0ZWRTdWdnZXN0SXRlbS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2hvd09uU3VnZ2VzdENvbmZsaWN0ID09PSAnd2hlblN1Z2dlc3RMaXN0SXNJbmNvbXBsZXRlJykge1xuXHRcdFx0XHRcdHJldHVybiBpdGVtLmxpc3RJbmNvbXBsZXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZSA9IGRlcml2ZWRPcHRzPHtcblx0XHRraW5kOiAnZ2hvc3RUZXh0Jztcblx0XHRlZGl0czogcmVhZG9ubHkgVGV4dFJlcGxhY2VtZW50W107XG5cdFx0cHJpbWFyeUdob3N0VGV4dDogR2hvc3RUZXh0T3JSZXBsYWNlbWVudDtcblx0XHRnaG9zdFRleHRzOiByZWFkb25seSBHaG9zdFRleHRPclJlcGxhY2VtZW50W107XG5cdFx0c3VnZ2VzdEl0ZW06IFN1Z2dlc3RJdGVtSW5mbyB8IHVuZGVmaW5lZDtcblx0XHRpbmxpbmVTdWdnZXN0aW9uOiBJbmxpbmVDb21wbGV0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0fSB8IHtcblx0XHRraW5kOiAnaW5saW5lRWRpdCc7XG5cdFx0ZWRpdHM6IHJlYWRvbmx5IFRleHRSZXBsYWNlbWVudFtdO1xuXHRcdGlubGluZVN1Z2dlc3Rpb246IElubGluZUVkaXRJdGVtO1xuXHRcdGN1cnNvckF0SW5saW5lRWRpdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdFx0bmV4dEVkaXRVcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0fSB8IHVuZGVmaW5lZD4oe1xuXHRcdG93bmVyOiB0aGlzLFxuXHRcdGVxdWFsc0ZuOiAoYSwgYikgPT4ge1xuXHRcdFx0aWYgKCFhIHx8ICFiKSB7IHJldHVybiBhID09PSBiOyB9XG5cblx0XHRcdGlmIChhLmtpbmQgPT09ICdnaG9zdFRleHQnICYmIGIua2luZCA9PT0gJ2dob3N0VGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIGdob3N0VGV4dHNPclJlcGxhY2VtZW50c0VxdWFsKGEuZ2hvc3RUZXh0cywgYi5naG9zdFRleHRzKVxuXHRcdFx0XHRcdCYmIGEuaW5saW5lU3VnZ2VzdGlvbiA9PT0gYi5pbmxpbmVTdWdnZXN0aW9uXG5cdFx0XHRcdFx0JiYgYS5zdWdnZXN0SXRlbSA9PT0gYi5zdWdnZXN0SXRlbTtcblx0XHRcdH0gZWxzZSBpZiAoYS5raW5kID09PSAnaW5saW5lRWRpdCcgJiYgYi5raW5kID09PSAnaW5saW5lRWRpdCcpIHtcblx0XHRcdFx0cmV0dXJuIGEuaW5saW5lU3VnZ2VzdGlvbiA9PT0gYi5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fSwgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy50ZXh0TW9kZWw7XG5cblx0XHRpZiAodGhpcy5fc3VwcHJlc3NJblNuaXBwZXRNb2RlLnJlYWQocmVhZGVyKSAmJiB0aGlzLl9pc0luU25pcHBldE1vZGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pbmxpbmVTdWdnZXN0aW9uSXRlbXMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlubGluZUVkaXRSZXN1bHQgPSBpdGVtPy5pbmxpbmVFZGl0O1xuXHRcdGlmIChpbmxpbmVFZGl0UmVzdWx0KSB7XG5cdFx0XHRpZiAodGhpcy5faGFzVmlzaWJsZVBlZWtXaWRnZXRzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3Vyc29yQXRJbmxpbmVFZGl0ID0gdGhpcy5wcmltYXJ5UG9zaXRpb24ubWFwKGN1cnNvclBvcyA9PiBMaW5lUmFuZ2UuZnJvbVJhbmdlSW5jbHVzaXZlKGlubGluZUVkaXRSZXN1bHQudGFyZ2V0UmFuZ2UpLmFkZE1hcmdpbigxLCAxKS5jb250YWlucyhjdXJzb3JQb3MubGluZU51bWJlcikpO1xuXHRcdFx0Y29uc3Qgc3RyaW5nRWRpdCA9IGlubGluZUVkaXRSZXN1bHQuYWN0aW9uPy5raW5kID09PSAnZWRpdCcgPyBpbmxpbmVFZGl0UmVzdWx0LmFjdGlvbi5zdHJpbmdFZGl0IDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRzID0gc3RyaW5nRWRpdCA/IFRleHRFZGl0LmZyb21TdHJpbmdFZGl0KHN0cmluZ0VkaXQsIG5ldyBUZXh0TW9kZWxUZXh0KHRoaXMudGV4dE1vZGVsKSkucmVwbGFjZW1lbnRzIDogW107XG5cblx0XHRcdGxldCBuZXh0RWRpdFVyaSA9IChpdGVtLmlubGluZUVkaXQ/LmNvbW1hbmQ/LmlkID09PSAndnNjb2RlLm9wZW4nIHx8IGl0ZW0uaW5saW5lRWRpdD8uY29tbWFuZD8uaWQgPT09ICdfd29ya2JlbmNoLm9wZW4nKSAmJlxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0aXRlbS5pbmxpbmVFZGl0Py5jb21tYW5kLmFyZ3VtZW50cz8ubGVuZ3RoID8gVVJJLmZyb20oPGFueT5pdGVtLmlubGluZUVkaXQ/LmNvbW1hbmQuYXJndW1lbnRzWzBdKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghaW5saW5lRWRpdFJlc3VsdC5vcmlnaW5hbFRleHRSZWYudGFyZ2V0cyh0aGlzLnRleHRNb2RlbCkpIHtcblx0XHRcdFx0bmV4dEVkaXRVcmkgPSBpbmxpbmVFZGl0UmVzdWx0Lm9yaWdpbmFsVGV4dFJlZi51cmk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnaW5saW5lRWRpdCcsIGlubGluZVN1Z2dlc3Rpb246IGlubGluZUVkaXRSZXN1bHQsIGVkaXRzOiByZXBsYWNlbWVudHMsIGN1cnNvckF0SW5saW5lRWRpdCwgbmV4dEVkaXRVcmkgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWdnZXN0SXRlbSA9IHRoaXMuX3NlbGVjdGVkU3VnZ2VzdEl0ZW0ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghdGhpcy5fc2hvdWxkU2hvd09uU3VnZ2VzdENvbmZsaWN0LnJlYWQocmVhZGVyKSAmJiBzdWdnZXN0SXRlbSkge1xuXHRcdFx0Y29uc3Qgc3VnZ2VzdENvbXBsZXRpb25FZGl0ID0gc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeChzdWdnZXN0SXRlbS5nZXRTaW5nbGVUZXh0RWRpdCgpLCBtb2RlbCk7XG5cdFx0XHRjb25zdCBhdWdtZW50YXRpb24gPSB0aGlzLl9jb21wdXRlQXVnbWVudGF0aW9uKHN1Z2dlc3RDb21wbGV0aW9uRWRpdCwgcmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgaXNTdWdnZXN0aW9uUHJldmlld0VuYWJsZWQgPSB0aGlzLl9zdWdnZXN0UHJldmlld0VuYWJsZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFpc1N1Z2dlc3Rpb25QcmV2aWV3RW5hYmxlZCAmJiAhYXVnbWVudGF0aW9uKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgZnVsbEVkaXQgPSBhdWdtZW50YXRpb24/LmVkaXQgPz8gc3VnZ2VzdENvbXBsZXRpb25FZGl0O1xuXHRcdFx0Y29uc3QgZnVsbEVkaXRQcmV2aWV3TGVuZ3RoID0gYXVnbWVudGF0aW9uID8gYXVnbWVudGF0aW9uLmVkaXQudGV4dC5sZW5ndGggLSBzdWdnZXN0Q29tcGxldGlvbkVkaXQudGV4dC5sZW5ndGggOiAwO1xuXG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5fc3VnZ2VzdFByZXZpZXdNb2RlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHBvc2l0aW9ucyA9IHRoaXMuX3Bvc2l0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhbGxQb3RlbnRpYWxFZGl0cyA9IFtmdWxsRWRpdCwgLi4uZ2V0U2Vjb25kYXJ5RWRpdHModGhpcy50ZXh0TW9kZWwsIHBvc2l0aW9ucywgZnVsbEVkaXQpXTtcblx0XHRcdGNvbnN0IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzID0gYWxsUG90ZW50aWFsRWRpdHNcblx0XHRcdFx0Lm1hcCgoZWRpdCwgaWR4KSA9PiAoeyBlZGl0LCBnaG9zdFRleHQ6IGVkaXQgPyBjb21wdXRlR2hvc3RUZXh0KGVkaXQsIG1vZGVsLCBtb2RlLCBwb3NpdGlvbnNbaWR4XSwgZnVsbEVkaXRQcmV2aWV3TGVuZ3RoKSA6IHVuZGVmaW5lZCB9KSlcblx0XHRcdFx0LmZpbHRlcigoeyBlZGl0LCBnaG9zdFRleHQgfSkgPT4gZWRpdCAhPT0gdW5kZWZpbmVkICYmIGdob3N0VGV4dCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gdmFsaWRFZGl0c0FuZEdob3N0VGV4dHMubWFwKCh7IGVkaXQgfSkgPT4gZWRpdCEpO1xuXHRcdFx0Y29uc3QgZ2hvc3RUZXh0cyA9IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzLm1hcCgoeyBnaG9zdFRleHQgfSkgPT4gZ2hvc3RUZXh0ISk7XG5cdFx0XHRjb25zdCBwcmltYXJ5R2hvc3RUZXh0ID0gZ2hvc3RUZXh0c1swXSA/PyBuZXcgR2hvc3RUZXh0KGZ1bGxFZGl0LnJhbmdlLmVuZExpbmVOdW1iZXIsIFtdKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdnaG9zdFRleHQnLCBlZGl0cywgcHJpbWFyeUdob3N0VGV4dCwgZ2hvc3RUZXh0cywgaW5saW5lU3VnZ2VzdGlvbjogYXVnbWVudGF0aW9uPy5jb21wbGV0aW9uLCBzdWdnZXN0SXRlbSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRjb25zdCBpbmxpbmVTdWdnZXN0aW9uID0gdGhpcy5zZWxlY3RlZElubGluZUNvbXBsZXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFpbmxpbmVTdWdnZXN0aW9uKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBpbmxpbmVTdWdnZXN0aW9uLmdldFNpbmdsZVRleHRFZGl0KCk7XG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5faW5saW5lU3VnZ2VzdE1vZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcG9zaXRpb25zID0gdGhpcy5fcG9zaXRpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFsbFBvdGVudGlhbEVkaXRzID0gW3JlcGxhY2VtZW50LCAuLi5nZXRTZWNvbmRhcnlFZGl0cyh0aGlzLnRleHRNb2RlbCwgcG9zaXRpb25zLCByZXBsYWNlbWVudCldO1xuXHRcdFx0Y29uc3QgdmFsaWRFZGl0c0FuZEdob3N0VGV4dHMgPSBhbGxQb3RlbnRpYWxFZGl0c1xuXHRcdFx0XHQubWFwKChlZGl0LCBpZHgpID0+ICh7IGVkaXQsIGdob3N0VGV4dDogZWRpdCA/IGNvbXB1dGVHaG9zdFRleHQoZWRpdCwgbW9kZWwsIG1vZGUsIHBvc2l0aW9uc1tpZHhdLCAwKSA6IHVuZGVmaW5lZCB9KSlcblx0XHRcdFx0LmZpbHRlcigoeyBlZGl0LCBnaG9zdFRleHQgfSkgPT4gZWRpdCAhPT0gdW5kZWZpbmVkICYmIGdob3N0VGV4dCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gdmFsaWRFZGl0c0FuZEdob3N0VGV4dHMubWFwKCh7IGVkaXQgfSkgPT4gZWRpdCEpO1xuXHRcdFx0Y29uc3QgZ2hvc3RUZXh0cyA9IHZhbGlkRWRpdHNBbmRHaG9zdFRleHRzLm1hcCgoeyBnaG9zdFRleHQgfSkgPT4gZ2hvc3RUZXh0ISk7XG5cdFx0XHRpZiAoIWdob3N0VGV4dHNbMF0pIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0cmV0dXJuIHsga2luZDogJ2dob3N0VGV4dCcsIGVkaXRzLCBwcmltYXJ5R2hvc3RUZXh0OiBnaG9zdFRleHRzWzBdLCBnaG9zdFRleHRzLCBpbmxpbmVTdWdnZXN0aW9uLCBzdWdnZXN0SXRlbTogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhdHVzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl9zb3VyY2UubG9hZGluZy5yZWFkKHJlYWRlcikpIHsgcmV0dXJuICdsb2FkaW5nJzsgfVxuXHRcdGNvbnN0IHMgPSB0aGlzLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAocz8ua2luZCA9PT0gJ2dob3N0VGV4dCcpIHsgcmV0dXJuICdnaG9zdFRleHQnOyB9XG5cdFx0aWYgKHM/LmtpbmQgPT09ICdpbmxpbmVFZGl0JykgeyByZXR1cm4gJ2lubGluZUVkaXQnOyB9XG5cdFx0cmV0dXJuICdub1N1Z2dlc3Rpb24nO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lQ29tcGxldGlvblN0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHMgPSB0aGlzLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXMgfHwgcy5raW5kICE9PSAnZ2hvc3RUZXh0Jykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2VkaXRvck9icy5pbkNvbXBvc2l0aW9uLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBpbmxpbmVFZGl0U3RhdGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcyA9IHRoaXMuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghcyB8fCBzLmtpbmQgIT09ICdpbmxpbmVFZGl0Jykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBpbmxpbmVFZGl0QXZhaWxhYmxlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHMgPSB0aGlzLmlubGluZUVkaXRTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuICEhcztcblx0fSk7XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUF1Z21lbnRhdGlvbihzdWdnZXN0Q29tcGxldGlvbjogVGV4dFJlcGxhY2VtZW50LCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMudGV4dE1vZGVsO1xuXHRcdGNvbnN0IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucyA9IHRoaXMuX3NvdXJjZS5zdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUlubGluZUNvbXBsZXRpb25zID0gc3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zXG5cdFx0XHQ/IHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9ucy5pbmxpbmVDb21wbGV0aW9ucy5maWx0ZXIoYyA9PiAhYy5pc0lubGluZUVkaXQpXG5cdFx0XHQ6IFt0aGlzLnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbi5yZWFkKHJlYWRlcildLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0Y29uc3QgYXVnbWVudGVkQ29tcGxldGlvbiA9IG1hcEZpbmRGaXJzdChjYW5kaWRhdGVJbmxpbmVDb21wbGV0aW9ucywgY29tcGxldGlvbiA9PiB7XG5cdFx0XHRsZXQgciA9IGNvbXBsZXRpb24uZ2V0U2luZ2xlVGV4dEVkaXQoKTtcblx0XHRcdHIgPSBzaW5nbGVUZXh0UmVtb3ZlQ29tbW9uUHJlZml4KFxuXHRcdFx0XHRyLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhyLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgc3VnZ2VzdENvbXBsZXRpb24ucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSlcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gc2luZ2xlVGV4dEVkaXRBdWdtZW50cyhyLCBzdWdnZXN0Q29tcGxldGlvbikgPyB7IGNvbXBsZXRpb24sIGVkaXQ6IHIgfSA6IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdHJldHVybiBhdWdtZW50ZWRDb21wbGV0aW9uO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHdhcm5pbmcgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lQ29tcGxldGlvblN0YXRlLnJlYWQocmVhZGVyKT8uaW5saW5lU3VnZ2VzdGlvbj8ud2FybmluZztcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGdob3N0VGV4dHMgPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogZ2hvc3RUZXh0c09yUmVwbGFjZW1lbnRzRXF1YWwgfSwgcmVhZGVyID0+IHtcblx0XHRjb25zdCB2ID0gdGhpcy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghdikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHYuZ2hvc3RUZXh0cztcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHByaW1hcnlHaG9zdFRleHQgPSBkZXJpdmVkT3B0cyh7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogZ2hvc3RUZXh0T3JSZXBsYWNlbWVudEVxdWFscyB9LCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHYgPSB0aGlzLmlubGluZUNvbXBsZXRpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF2KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdj8ucHJpbWFyeUdob3N0VGV4dDtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHNob3dDb2xsYXBzZWQgPSBkZXJpdmVkPGJvb2xlYW4+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLmtpbmQgIT09ICdpbmxpbmVFZGl0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uLmhpbnQgfHwgc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDdXJyZW50TW9kZWxWZXJzaW9uID0gc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi51cGRhdGVkRWRpdE1vZGVsVmVyc2lvbiA9PT0gdGhpcy5fdGV4dE1vZGVsVmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gKHRoaXMuX2lubGluZUVkaXRzU2hvd0NvbGxhcHNlZEVuYWJsZWQucmVhZChyZWFkZXIpIHx8ICFpc0N1cnJlbnRNb2RlbFZlcnNpb24pXG5cdFx0XHQmJiB0aGlzLl9qdW1wZWRUb0lkLnJlYWQocmVhZGVyKSAhPT0gc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi5zZW1hbnRpY0lkXG5cdFx0XHQmJiAhdGhpcy5faW5BY2NlcHRGbG93LnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGFiU2hvdWxkSW5kZW50ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl9pbkFjY2VwdEZsb3cucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gaXNNdWx0aUxpbmUocmFuZ2U6IFJhbmdlKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSByYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldE5vbkluZGVudGF0aW9uUmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlcik6IFJhbmdlIHtcblx0XHRcdGNvbnN0IGNvbHVtblN0YXJ0ID0gbW9kZWwuZ2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxhc3ROb25Xc0NvbHVtbiA9IG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGNvbHVtbkVuZCA9IE1hdGgubWF4KGxhc3ROb25Xc0NvbHVtbiwgY29sdW1uU3RhcnQpO1xuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShsaW5lTnVtYmVyLCBjb2x1bW5TdGFydCwgbGluZU51bWJlciwgY29sdW1uRW5kKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yT2JzLnNlbGVjdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBzZWxlY3Rpb25zPy5zb21lKHMgPT4ge1xuXHRcdFx0aWYgKHMuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnRleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKHMuc3RhcnRMaW5lTnVtYmVyKSA9PT0gMDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBpc011bHRpTGluZShzKSB8fCBzLmNvbnRhaW5zUmFuZ2UoZ2V0Tm9uSW5kZW50YXRpb25SYW5nZSh0aGlzLnRleHRNb2RlbCwgcy5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHRhYlNob3VsZEp1bXBUb0lubGluZUVkaXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0aWYgKHRoaXMuX3RhYlNob3VsZEluZGVudC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzID0gdGhpcy5pbmxpbmVFZGl0U3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghcykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXG5cdFx0aWYgKHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaG93Q29sbGFwc2VkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2luQWNjZXB0Rmxvdy5yZWFkKHJlYWRlcikgJiYgdGhpcy5fYXBwZWFyZWRJbnNpZGVWaWV3cG9ydC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXMuY3Vyc29yQXRJbmxpbmVFZGl0LnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHRhYlNob3VsZEFjY2VwdElubGluZUVkaXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcyA9IHRoaXMuaW5saW5lRWRpdFN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNob3dDb2xsYXBzZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90YWJTaG91bGRJbmRlbnQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pbkFjY2VwdEZsb3cucmVhZChyZWFkZXIpICYmIHRoaXMuX2FwcGVhcmVkSW5zaWRlVmlld3BvcnQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHMuaW5saW5lU3VnZ2VzdGlvbi50YXJnZXRSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHRoaXMuX2VkaXRvck9icy5jdXJzb3JMaW5lTnVtYmVyLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9qdW1wZWRUb0lkLnJlYWQocmVhZGVyKSA9PT0gcy5pbmxpbmVTdWdnZXN0aW9uLnNlbWFudGljSWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBzLmN1cnNvckF0SW5saW5lRWRpdC5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBpc0luRGlmZkVkaXRvcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGU7XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVsdGFTZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleChkZWx0YTogMSB8IC0xKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy50cmlnZ2VyRXhwbGljaXRseSgpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSB0aGlzLl9pbmxpbmVDb21wbGV0aW9uSXRlbXMuZ2V0KCkgfHwgW107XG5cdFx0aWYgKGNvbXBsZXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5ld0lkeCA9ICh0aGlzLnNlbGVjdGVkSW5saW5lQ29tcGxldGlvbkluZGV4LmdldCgpICsgZGVsdGEgKyBjb21wbGV0aW9ucy5sZW5ndGgpICUgY29tcGxldGlvbnMubGVuZ3RoO1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQuc2V0KGNvbXBsZXRpb25zW25ld0lkeF0uc2VtYW50aWNJZCwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJbmxpbmVDb21wbGV0aW9uSWQuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbmV4dCgpOiBQcm9taXNlPHZvaWQ+IHsgYXdhaXQgdGhpcy5fZGVsdGFTZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleCgxKTsgfVxuXG5cdHB1YmxpYyBhc3luYyBwcmV2aW91cygpOiBQcm9taXNlPHZvaWQ+IHsgYXdhaXQgdGhpcy5fZGVsdGFTZWxlY3RlZElubGluZUNvbXBsZXRpb25JbmRleCgtMSk7IH1cblxuXHRwcml2YXRlIF9nZXRNZXRhZGF0YShjb21wbGV0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSwgbGFuZ3VhZ2VJZDogc3RyaW5nLCB0eXBlOiAnd29yZCcgfCAnbGluZScgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBUZXh0TW9kZWxFZGl0U291cmNlIHtcblx0XHRpZiAodHlwZSkge1xuXHRcdFx0cmV0dXJuIEVkaXRTb3VyY2VzLmlubGluZUNvbXBsZXRpb25QYXJ0aWFsQWNjZXB0KHtcblx0XHRcdFx0bmVzOiBjb21wbGV0aW9uLmlzSW5saW5lRWRpdCxcblx0XHRcdFx0cmVxdWVzdFV1aWQ6IGNvbXBsZXRpb24ucmVxdWVzdFV1aWQsXG5cdFx0XHRcdHByb3ZpZGVySWQ6IGNvbXBsZXRpb24uc291cmNlLnByb3ZpZGVyLnByb3ZpZGVySWQsXG5cdFx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGNvcnJlbGF0aW9uSWQ6IGNvbXBsZXRpb24uZ2V0U291cmNlQ29tcGxldGlvbigpLmNvcnJlbGF0aW9uSWQsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIEVkaXRTb3VyY2VzLmlubGluZUNvbXBsZXRpb25BY2NlcHQoe1xuXHRcdFx0XHRuZXM6IGNvbXBsZXRpb24uaXNJbmxpbmVFZGl0LFxuXHRcdFx0XHRyZXF1ZXN0VXVpZDogY29tcGxldGlvbi5yZXF1ZXN0VXVpZCxcblx0XHRcdFx0Y29ycmVsYXRpb25JZDogY29tcGxldGlvbi5nZXRTb3VyY2VDb21wbGV0aW9uKCkuY29ycmVsYXRpb25JZCxcblx0XHRcdFx0cHJvdmlkZXJJZDogY29tcGxldGlvbi5zb3VyY2UucHJvdmlkZXIucHJvdmlkZXJJZCxcblx0XHRcdFx0bGFuZ3VhZ2VJZFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGFjY2VwdChlZGl0b3I6IElDb2RlRWRpdG9yID0gdGhpcy5fZWRpdG9yLCBhbHRlcm5hdGl2ZUFjdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGVkaXRvci5nZXRNb2RlbCgpICE9PSB0aGlzLnRleHRNb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblxuXHRcdGxldCBjb21wbGV0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbTtcblx0XHRsZXQgaXNOZXh0RWRpdFVyaSA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGU/LmtpbmQgPT09ICdnaG9zdFRleHQnKSB7XG5cdFx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLnByaW1hcnlHaG9zdFRleHQuaXNFbXB0eSgpIHx8ICFzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbXBsZXRpb24gPSBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGU/LmtpbmQgPT09ICdpbmxpbmVFZGl0Jykge1xuXHRcdFx0Y29tcGxldGlvbiA9IHN0YXRlLmlubGluZVN1Z2dlc3Rpb247XG5cdFx0XHRpc05leHRFZGl0VXJpID0gISFzdGF0ZS5uZXh0RWRpdFVyaTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0aGUgY29tcGxldGlvbiBsaXN0IHdpbGwgbm90IGJlIGRpc3Bvc2VkIGJlZm9yZSB0aGUgdGV4dCBjaGFuZ2UgaXMgc2VudC5cblx0XHRjb21wbGV0aW9uLmFkZFJlZigpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBmb2xsb3dVcFRyaWdnZXIgPSBmYWxzZTtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblxuXHRcdFx0aWYgKCFjb21wbGV0aW9uLm9yaWdpbmFsVGV4dFJlZi50YXJnZXRzKHRoaXMudGV4dE1vZGVsKSkge1xuXHRcdFx0XHQvLyBUaGUgZWRpdCB0YXJnZXRzIGEgZGlmZmVyZW50IGRvY3VtZW50LCBvcGVuIGl0IGFuZCB0cmFuc3BsYW50IHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdGNvbnN0IHRhcmdldEVkaXRvciA9IGF3YWl0IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLm9wZW5Db2RlRWRpdG9yKHsgcmVzb3VyY2U6IGNvbXBsZXRpb24ub3JpZ2luYWxUZXh0UmVmLnVyaSB9LCB0aGlzLl9lZGl0b3IpO1xuXHRcdFx0XHRpZiAodGFyZ2V0RWRpdG9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGdldElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlcih0YXJnZXRFZGl0b3IpO1xuXHRcdFx0XHRcdGNvbnN0IG0gPSBjb250cm9sbGVyPy5tb2RlbC5nZXQoKTtcblx0XHRcdFx0XHR0YXJnZXRFZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0XHRtPy50cmFuc3BsYW50Q29tcGxldGlvbihjb21wbGV0aW9uKTtcblx0XHRcdFx0XHR0YXJnZXRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVyKGNvbXBsZXRpb24udGFyZ2V0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc05leHRFZGl0VXJpKSB7XG5cdFx0XHRcdC8vIERvIG5vdGhpbmdcblx0XHRcdH0gZWxzZSBpZiAoY29tcGxldGlvbi5hY3Rpb24/LmtpbmQgPT09ICdlZGl0Jykge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBjb21wbGV0aW9uLmFjdGlvbjtcblx0XHRcdFx0aWYgKGFsdGVybmF0aXZlQWN0aW9uICYmIGFjdGlvbi5hbHRlcm5hdGl2ZUFjdGlvbikge1xuXHRcdFx0XHRcdGZvbGxvd1VwVHJpZ2dlciA9IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgYWx0Q29tbWFuZCA9IGFjdGlvbi5hbHRlcm5hdGl2ZUFjdGlvbi5jb21tYW5kO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlXG5cdFx0XHRcdFx0XHQuZXhlY3V0ZUNvbW1hbmQoYWx0Q29tbWFuZC5pZCwgLi4uKGFsdENvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSlcblx0XHRcdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLnNuaXBwZXRJbmZvKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWFpbkVkaXQgPSBUZXh0UmVwbGFjZW1lbnQuZGVsZXRlKGFjdGlvbi50ZXh0UmVwbGFjZW1lbnQucmFuZ2UpO1xuXHRcdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxFZGl0cyA9IGNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAoZSA9PiBuZXcgVGV4dFJlcGxhY2VtZW50KFJhbmdlLmxpZnQoZS5yYW5nZSksIGUudGV4dCA/PyAnJykpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXQgPSBUZXh0RWRpdC5mcm9tUGFyYWxsZWxSZXBsYWNlbWVudHNVbnNvcnRlZChbbWFpbkVkaXQsIC4uLmFkZGl0aW9uYWxFZGl0c10pO1xuXHRcdFx0XHRcdGVkaXRvci5lZGl0KGVkaXQsIHRoaXMuX2dldE1ldGFkYXRhKGNvbXBsZXRpb24sIHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSkpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKGFjdGlvbi5zbmlwcGV0SW5mby5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksICdpbmxpbmVDb21wbGV0aW9uQWNjZXB0Jyk7XG5cdFx0XHRcdFx0U25pcHBldENvbnRyb2xsZXIyLmdldChlZGl0b3IpPy5pbnNlcnQoYWN0aW9uLnNuaXBwZXRJbmZvLnNuaXBwZXQsIHsgdW5kb1N0b3BCZWZvcmU6IGZhbHNlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRzID0gc3RhdGUuZWRpdHM7XG5cblx0XHRcdFx0XHQvLyBUaGUgY3Vyc29yIHNob3VsZCBtb3ZlIHRvIHRoZSBlbmQgb2YgdGhlIGVkaXQsIG5vdCB0aGUgZW5kIG9mIHRoZSByYW5nZSBwcm92aWRlZCBieSB0aGUgZXh0ZW5zaW9uXG5cdFx0XHRcdFx0Ly8gSW5saW5lIEVkaXQgZGlmZnMgKGh1bWFuIHJlYWRhYmxlKSB0aGUgc3VnZ2VzdGlvbiBmcm9tIHRoZSBleHRlbnNpb24gc28gaXQgYWxyZWFkeSByZW1vdmVzIGNvbW1vbiBzdWZmaXgvcHJlZml4XG5cdFx0XHRcdFx0Ly8gSW5saW5lIENvbXBsZXRpb25zIGRvZXMgZGlmZiB0aGUgc3VnZ2VzdGlvbiBzbyBpdCBtYXkgY29udGFpbiBjb21tb24gc3VmZml4XG5cdFx0XHRcdFx0bGV0IG1pbmltYWxFZGl0cyA9IGVkaXRzO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5raW5kID09PSAnZ2hvc3RUZXh0Jykge1xuXHRcdFx0XHRcdFx0bWluaW1hbEVkaXRzID0gcmVtb3ZlVGV4dFJlcGxhY2VtZW50Q29tbW9uU3VmZml4UHJlZml4KGVkaXRzLCB0aGlzLnRleHRNb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBnZXRFbmRQb3NpdGlvbnNBZnRlckFwcGx5aW5nKG1pbmltYWxFZGl0cykubWFwKHAgPT4gU2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMocCkpO1xuXG5cdFx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEVkaXRzID0gY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcChlID0+IG5ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UubGlmdChlLnJhbmdlKSwgZS50ZXh0ID8/ICcnKSk7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdCA9IFRleHRFZGl0LmZyb21QYXJhbGxlbFJlcGxhY2VtZW50c1Vuc29ydGVkKFsuLi5lZGl0cywgLi4uYWRkaXRpb25hbEVkaXRzXSk7XG5cblx0XHRcdFx0XHRlZGl0b3IuZWRpdChlZGl0LCB0aGlzLl9nZXRNZXRhZGF0YShjb21wbGV0aW9uLCB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCkpKTtcblxuXHRcdFx0XHRcdGlmIChjb21wbGV0aW9uLmhpbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Ly8gZG8gbm90IG1vdmUgdGhlIGN1cnNvciB3aGVuIHRoZSBjb21wbGV0aW9uIGlzIGRpc3BsYXllZCBpbiBhIGRpZmZlcmVudCBsb2NhdGlvblxuXHRcdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoc3RhdGUua2luZCA9PT0gJ2lubGluZUVkaXQnID8gc2VsZWN0aW9ucy5zbGljZSgtMSkgOiBzZWxlY3Rpb25zLCAnaW5saW5lQ29tcGxldGlvbkFjY2VwdCcpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChzdGF0ZS5raW5kID09PSAnaW5saW5lRWRpdCcgJiYgIXRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0UmFuZ2VzID0gZWRpdC5nZXROZXdSYW5nZXMoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlYyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRmFkZW91dERlY29yYXRpb24oZWRpdG9yLCBlZGl0UmFuZ2VzLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShkZWMpO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZEFjY2VwdC5maXJlKCk7XG5cblx0XHRcdC8vIFJlc2V0IGJlZm9yZSBpbnZva2luZyB0aGUgY29tbWFuZCwgYXMgdGhlIGNvbW1hbmQgbWlnaHQgY2F1c2UgYSBmb2xsb3cgdXAgdHJpZ2dlciAod2hpY2ggd2UgZG9uJ3Qgd2FudCB0byByZXNldCkuXG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0aWYgKGNvbXBsZXRpb24uY29tbWFuZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZVxuXHRcdFx0XHRcdC5leGVjdXRlQ29tbWFuZChjb21wbGV0aW9uLmNvbW1hbmQuaWQsIC4uLihjb21wbGV0aW9uLmNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSlcblx0XHRcdFx0XHQudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPOiBob3cgY2FuIHdlIG1ha2UgYWx0ZXJuYXRpdmUgYWN0aW9ucyB0byByZXRyaWdnZXI/XG5cdFx0XHRpZiAoZm9sbG93VXBUcmlnZ2VyKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcih1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb21wbGV0aW9uLnJlcG9ydEVuZE9mTGlmZSh7IGtpbmQ6IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLkFjY2VwdGVkLCBhbHRlcm5hdGl2ZUFjdGlvbiB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29tcGxldGlvbi5yZW1vdmVSZWYoKTtcblx0XHRcdHRoaXMuX2luQWNjZXB0Rmxvdy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2xhc3RBY2NlcHRlZElubGluZUNvbXBsZXRpb25JbmZvID0geyB0ZXh0TW9kZWxWZXJzaW9uSWRBZnRlcjogdGhpcy50ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIGlubGluZUNvbXBsZXRpb246IGNvbXBsZXRpb24gfTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYWNjZXB0TmV4dFdvcmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fYWNjZXB0TmV4dCh0aGlzLl9lZGl0b3IsICd3b3JkJywgKHBvcywgdGV4dCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ0lkID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ0lkKTtcblx0XHRcdGNvbnN0IHdvcmRSZWdFeHAgPSBuZXcgUmVnRXhwKGNvbmZpZy53b3JkRGVmaW5pdGlvbi5zb3VyY2UsIGNvbmZpZy53b3JkRGVmaW5pdGlvbi5mbGFncy5yZXBsYWNlKCdnJywgJycpKTtcblxuXHRcdFx0Y29uc3QgbTEgPSB0ZXh0Lm1hdGNoKHdvcmRSZWdFeHApO1xuXHRcdFx0bGV0IGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUgPSAwO1xuXHRcdFx0aWYgKG0xICYmIG0xLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKG0xLmluZGV4ID09PSAwKSB7XG5cdFx0XHRcdFx0YWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSA9IG0xWzBdLmxlbmd0aDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID0gbTEuaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUgPSB0ZXh0Lmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd3NSZWdFeHAgPSAvXFxzKy9nO1xuXHRcdFx0Y29uc3QgbTIgPSB3c1JlZ0V4cC5leGVjKHRleHQpO1xuXHRcdFx0aWYgKG0yICYmIG0yLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKG0yLmluZGV4ICsgbTJbMF0ubGVuZ3RoIDwgYWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSkge1xuXHRcdFx0XHRcdGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUgPSBtMi5pbmRleCArIG0yWzBdLmxlbmd0aDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmU7XG5cdFx0fSwgUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLldvcmQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGFjY2VwdE5leHRMaW5lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2FjY2VwdE5leHQodGhpcy5fZWRpdG9yLCAnbGluZScsIChwb3MsIHRleHQpID0+IHtcblx0XHRcdGNvbnN0IG0gPSB0ZXh0Lm1hdGNoKC9cXG4vKTtcblx0XHRcdGlmIChtICYmIG0uaW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gbS5pbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGV4dC5sZW5ndGg7XG5cdFx0fSwgUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLkxpbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNjZXB0TmV4dChlZGl0b3I6IElDb2RlRWRpdG9yLCB0eXBlOiAnd29yZCcgfCAnbGluZScsIGdldEFjY2VwdFVudGlsSW5kZXg6IChwb3NpdGlvbjogUG9zaXRpb24sIHRleHQ6IHN0cmluZykgPT4gbnVtYmVyLCBraW5kOiBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZWRpdG9yLmdldE1vZGVsKCkgIT09IHRoaXMudGV4dE1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmlubGluZUNvbXBsZXRpb25TdGF0ZS5nZXQoKTtcblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLnByaW1hcnlHaG9zdFRleHQuaXNFbXB0eSgpIHx8ICFzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGdob3N0VGV4dCA9IHN0YXRlLnByaW1hcnlHaG9zdFRleHQ7XG5cdFx0Y29uc3QgY29tcGxldGlvbiA9IHN0YXRlLmlubGluZVN1Z2dlc3Rpb247XG5cblx0XHRpZiAoY29tcGxldGlvbi5zbmlwcGV0SW5mbykge1xuXHRcdFx0Ly8gbm90IGluIFdZU0lXWUcgbW9kZSwgcGFydGlhbCBjb21taXQgbWlnaHQgY2hhbmdlIGNvbXBsZXRpb24sIHRodXMgaXQgaXMgbm90IHN1cHBvcnRlZFxuXHRcdFx0YXdhaXQgdGhpcy5hY2NlcHQoZWRpdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdFBhcnQgPSBnaG9zdFRleHQucGFydHNbMF07XG5cdFx0Y29uc3QgZ2hvc3RUZXh0UG9zID0gbmV3IFBvc2l0aW9uKGdob3N0VGV4dC5saW5lTnVtYmVyLCBmaXJzdFBhcnQuY29sdW1uKTtcblx0XHRjb25zdCBnaG9zdFRleHRWYWwgPSBmaXJzdFBhcnQudGV4dDtcblx0XHRjb25zdCBhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlID0gZ2V0QWNjZXB0VW50aWxJbmRleChnaG9zdFRleHRQb3MsIGdob3N0VGV4dFZhbCk7XG5cdFx0aWYgKGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUgPT09IGdob3N0VGV4dFZhbC5sZW5ndGggJiYgZ2hvc3RUZXh0LnBhcnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5hY2NlcHQoZWRpdG9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFydGlhbEdob3N0VGV4dFZhbCA9IGdob3N0VGV4dFZhbC5zdWJzdHJpbmcoMCwgYWNjZXB0VW50aWxJbmRleEV4Y2x1c2l2ZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbnMgPSB0aGlzLl9wb3NpdGlvbnMuZ2V0KCk7XG5cdFx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSBwb3NpdGlvbnNbMF07XG5cblx0XHQvLyBFeGVjdXRpbmcgdGhlIGVkaXQgbWlnaHQgZnJlZSB0aGUgY29tcGxldGlvbiwgc28gd2UgaGF2ZSB0byBob2xkIGEgcmVmZXJlbmNlIG9uIGl0LlxuXHRcdGNvbXBsZXRpb24uYWRkUmVmKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzQWNjZXB0aW5nUGFydGlhbGx5ID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdFx0Y29uc3QgcmVwbGFjZVJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhjdXJzb3JQb3NpdGlvbiwgZ2hvc3RUZXh0UG9zKTtcblx0XHRcdFx0Y29uc3QgbmV3VGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZUluUmFuZ2UocmVwbGFjZVJhbmdlKSArIHBhcnRpYWxHaG9zdFRleHRWYWw7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlFZGl0ID0gbmV3IFRleHRSZXBsYWNlbWVudChyZXBsYWNlUmFuZ2UsIG5ld1RleHQpO1xuXHRcdFx0XHRjb25zdCBlZGl0cyA9IFtwcmltYXJ5RWRpdCwgLi4uZ2V0U2Vjb25kYXJ5RWRpdHModGhpcy50ZXh0TW9kZWwsIHBvc2l0aW9ucywgcHJpbWFyeUVkaXQpXS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGdldEVuZFBvc2l0aW9uc0FmdGVyQXBwbHlpbmcoZWRpdHMpLm1hcChwID0+IFNlbGVjdGlvbi5mcm9tUG9zaXRpb25zKHApKTtcblxuXHRcdFx0XHRlZGl0b3IuZWRpdChUZXh0RWRpdC5mcm9tUGFyYWxsZWxSZXBsYWNlbWVudHNVbnNvcnRlZChlZGl0cyksIHRoaXMuX2dldE1ldGFkYXRhKGNvbXBsZXRpb24sIHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSwgdHlwZSkpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zLCAnaW5saW5lQ29tcGxldGlvblBhcnRpYWxBY2NlcHQnKTtcblx0XHRcdFx0ZWRpdG9yLnJldmVhbFBvc2l0aW9uSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChlZGl0b3IuZ2V0UG9zaXRpb24oKSEsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2lzQWNjZXB0aW5nUGFydGlhbGx5ID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjY2VwdGVkUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGNvbXBsZXRpb24uZWRpdFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgVGV4dExlbmd0aC5vZlRleHQocGFydGlhbEdob3N0VGV4dFZhbCkuYWRkVG9Qb3NpdGlvbihnaG9zdFRleHRQb3MpKTtcblx0XHRcdC8vIFRoaXMgYXNzdW1lcyB0aGF0IHRoZSBpbmxpbmUgY29tcGxldGlvbiBhbmQgdGhlIG1vZGVsIHVzZSB0aGUgc2FtZSBFT0wgc3R5bGUuXG5cdFx0XHRjb25zdCB0ZXh0ID0gZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlSW5SYW5nZShhY2NlcHRlZFJhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKTtcblx0XHRcdGNvbnN0IGFjY2VwdGVkTGVuZ3RoID0gdGV4dC5sZW5ndGg7XG5cdFx0XHRjb21wbGV0aW9uLnJlcG9ydFBhcnRpYWxBY2NlcHQoXG5cdFx0XHRcdGFjY2VwdGVkTGVuZ3RoLFxuXHRcdFx0XHR7IGtpbmQsIGFjY2VwdGVkTGVuZ3RoOiBhY2NlcHRlZExlbmd0aCB9LFxuXHRcdFx0XHR7IGNoYXJhY3RlcnM6IGFjY2VwdFVudGlsSW5kZXhFeGNsdXNpdmUsIHJhdGlvOiBhY2NlcHRVbnRpbEluZGV4RXhjbHVzaXZlIC8gZ2hvc3RUZXh0VmFsLmxlbmd0aCwgY291bnQ6IDEgfVxuXHRcdFx0KTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb21wbGV0aW9uLnJlbW92ZVJlZigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVTdWdnZXN0QWNjZXB0ZWQoaXRlbTogU3VnZ2VzdEl0ZW1JbmZvKSB7XG5cdFx0Y29uc3QgaXRlbUVkaXQgPSBzaW5nbGVUZXh0UmVtb3ZlQ29tbW9uUHJlZml4KGl0ZW0uZ2V0U2luZ2xlVGV4dEVkaXQoKSwgdGhpcy50ZXh0TW9kZWwpO1xuXHRcdGNvbnN0IGF1Z21lbnRlZENvbXBsZXRpb24gPSB0aGlzLl9jb21wdXRlQXVnbWVudGF0aW9uKGl0ZW1FZGl0LCB1bmRlZmluZWQpO1xuXHRcdGlmICghYXVnbWVudGVkQ29tcGxldGlvbikgeyByZXR1cm47IH1cblxuXHRcdC8vIFRoaXMgYXNzdW1lcyB0aGF0IHRoZSBpbmxpbmUgY29tcGxldGlvbiBhbmQgdGhlIG1vZGVsIHVzZSB0aGUgc2FtZSBFT0wgc3R5bGUuXG5cdFx0Y29uc3QgYWxyZWFkeUFjY2VwdGVkTGVuZ3RoID0gdGhpcy50ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKGF1Z21lbnRlZENvbXBsZXRpb24uY29tcGxldGlvbi5lZGl0UmFuZ2UsIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLmxlbmd0aDtcblx0XHRjb25zdCBhY2NlcHRlZExlbmd0aCA9IGFscmVhZHlBY2NlcHRlZExlbmd0aCArIGl0ZW1FZGl0LnRleHQubGVuZ3RoO1xuXG5cdFx0YXVnbWVudGVkQ29tcGxldGlvbi5jb21wbGV0aW9uLnJlcG9ydFBhcnRpYWxBY2NlcHQoaXRlbUVkaXQudGV4dC5sZW5ndGgsIHtcblx0XHRcdGtpbmQ6IFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5TdWdnZXN0LFxuXHRcdFx0YWNjZXB0ZWRMZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0Y2hhcmFjdGVyczogaXRlbUVkaXQudGV4dC5sZW5ndGgsXG5cdFx0XHRjb3VudDogMSxcblx0XHRcdHJhdGlvOiAxXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZXh0cmFjdFJlcHJvU2FtcGxlKCk6IFJlcHJvIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMudGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuc3RhdGUuZ2V0KCk/LmlubGluZVN1Z2dlc3Rpb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRvY3VtZW50VmFsdWU6IHZhbHVlLFxuXHRcdFx0aW5saW5lQ29tcGxldGlvbjogaXRlbT8uZ2V0U291cmNlQ29tcGxldGlvbigpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9qdW1wZWRUb0lkID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZCB8IHN0cmluZz4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5BY2NlcHRGbG93ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHVibGljIHJlYWRvbmx5IGluQWNjZXB0RmxvdzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9pbkFjY2VwdEZsb3c7XG5cblx0cHVibGljIGp1bXAoKTogdm9pZCB7XG5cdFx0Y29uc3QgcyA9IHRoaXMuaW5saW5lRWRpdFN0YXRlLmdldCgpO1xuXHRcdGlmICghcykgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IHN1Z2dlc3Rpb24gPSBzLmlubGluZVN1Z2dlc3Rpb247XG5cblx0XHRpZiAoIXN1Z2dlc3Rpb24ub3JpZ2luYWxUZXh0UmVmLnRhcmdldHModGhpcy50ZXh0TW9kZWwpKSB7XG5cdFx0XHR0aGlzLmFjY2VwdCh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0c3VnZ2VzdGlvbi5hZGRSZWYoKTtcblx0XHR0cnkge1xuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRpZiAoc3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9wKHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb24ucmVwb3J0RW5kT2ZMaWZlKHsga2luZDogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuQWNjZXB0ZWQsIGFsdGVybmF0aXZlQWN0aW9uOiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2p1bXBlZFRvSWQuc2V0KHMuaW5saW5lU3VnZ2VzdGlvbi5zZW1hbnRpY0lkLCB0eCk7XG5cdFx0XHRcdHRoaXMuZG9udFJlZmV0Y2hTaWduYWwudHJpZ2dlcih0eCk7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFJhbmdlID0gcy5pbmxpbmVTdWdnZXN0aW9uLnRhcmdldFJhbmdlO1xuXHRcdFx0XHRjb25zdCB0YXJnZXRQb3NpdGlvbiA9IHRhcmdldFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHRhcmdldFBvc2l0aW9uLCAnaW5saW5lQ29tcGxldGlvbnMuanVtcCcpO1xuXG5cdFx0XHRcdC8vIFRPRE86IGNvbnNpZGVyIHVzaW5nIHZpZXcgaW5mb3JtYXRpb24gdG8gcmV2ZWFsIGl0XG5cdFx0XHRcdGNvbnN0IGlzU2luZ2xlTGluZUNoYW5nZSA9IHRhcmdldFJhbmdlLmlzU2luZ2xlTGluZSgpICYmIChzLmlubGluZVN1Z2dlc3Rpb24uaGludCB8fCAocy5pbmxpbmVTdWdnZXN0aW9uLmFjdGlvbj8ua2luZCA9PT0gJ2VkaXQnICYmICFzLmlubGluZVN1Z2dlc3Rpb24uYWN0aW9uLnRleHRSZXBsYWNlbWVudC50ZXh0LmluY2x1ZGVzKCdcXG4nKSkpO1xuXHRcdFx0XHRpZiAoaXNTaW5nbGVMaW5lQ2hhbmdlIHx8IHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFBvc2l0aW9uKHRhcmdldFBvc2l0aW9uLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZWFsUmFuZ2UgPSBuZXcgUmFuZ2UodGFyZ2V0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgMSwgdGFyZ2V0UmFuZ2UuZW5kTGluZU51bWJlciArIDEsIDEpO1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZShyZXZlYWxSYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cy5pbmxpbmVTdWdnZXN0aW9uLmlkZW50aXR5LnNldEp1bXBUbyh0eCk7XG5cblx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3VnZ2VzdGlvbi5yZW1vdmVSZWYoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaGFuZGxlSW5saW5lU3VnZ2VzdGlvblNob3duKGlubGluZUNvbXBsZXRpb246IElubGluZVN1Z2dlc3Rpb25JdGVtLCB2aWV3S2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLCB2aWV3RGF0YTogSW5saW5lQ29tcGxldGlvblZpZXdEYXRhLCB0aW1lV2hlblNob3duOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBpbmxpbmVDb21wbGV0aW9uLnJlcG9ydElubGluZUVkaXRTaG93bih0aGlzLl9jb21tYW5kU2VydmljZSwgdmlld0tpbmQsIHZpZXdEYXRhLCB0aGlzLnRleHRNb2RlbCwgdGltZVdoZW5TaG93bik7XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNwbGFudHMgYW4gaW5saW5lIGNvbXBsZXRpb24gZnJvbSBhbm90aGVyIG1vZGVsIHRvIHRoaXMgb25lLlxuXHQgKiBVc2VkIGZvciBjcm9zcy1maWxlIGlubGluZSBlZGl0cy5cblx0ICovXG5cdHB1YmxpYyB0cmFuc3BsYW50Q29tcGxldGlvbihpdGVtOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSk6IHZvaWQge1xuXHRcdC8vIE5vIGV4cGxpY2l0IGFkZFJlZiBuZWVkZWQ6IGBzZWVkV2l0aENvbXBsZXRpb25gIGNyZWF0ZXMgYSBuZXcgYElubGluZUNvbXBsZXRpb25zU3RhdGVgXG5cdFx0Ly8gd2hpY2ggY2FsbHMgYGFkZFJlZmAgb24gZXZlcnkgaXRlbSBpdCBob2xkcyBhbmQgcGFpcnMgaXQgd2l0aCBgcmVtb3ZlUmVmYCBpbiBkaXNwb3NlLlxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3NvdXJjZS5zZWVkV2l0aENvbXBsZXRpb24oaXRlbSwgdHgpO1xuXHRcdFx0dGhpcy5faXNBY3RpdmUuc2V0KHRydWUsIHR4KTtcblx0XHRcdHRoaXMuX2luQWNjZXB0Rmxvdy5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0dGhpcy5kb250UmVmZXRjaFNpZ25hbC50cmlnZ2VyKHR4KTtcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUmVwcm8ge1xuXHRkb2N1bWVudFZhbHVlOiBzdHJpbmc7XG5cdGlubGluZUNvbXBsZXRpb246IElubGluZUNvbXBsZXRpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBlbnVtIFZlcnNpb25JZENoYW5nZVJlYXNvbiB7XG5cdFVuZG8sXG5cdFJlZG8sXG5cdEFjY2VwdFdvcmQsXG5cdE90aGVyLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2Vjb25kYXJ5RWRpdHModGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbnM6IHJlYWRvbmx5IFBvc2l0aW9uW10sIHByaW1hcnlUZXh0UmVwbDogVGV4dFJlcGxhY2VtZW50KTogKFRleHRSZXBsYWNlbWVudCB8IHVuZGVmaW5lZClbXSB7XG5cdGlmIChwb3NpdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0Ly8gTm8gc2Vjb25kYXJ5IGN1cnNvciBwb3NpdGlvbnNcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgdGV4dCA9IG5ldyBUZXh0TW9kZWxUZXh0KHRleHRNb2RlbCk7XG5cdGNvbnN0IHRleHRUcmFuc2Zvcm1lciA9IHRleHQuZ2V0VHJhbnNmb3JtZXIoKTtcblx0Y29uc3QgcHJpbWFyeU9mZnNldCA9IHRleHRUcmFuc2Zvcm1lci5nZXRPZmZzZXQocG9zaXRpb25zWzBdKTtcblx0Y29uc3Qgc2Vjb25kYXJ5T2Zmc2V0cyA9IHBvc2l0aW9ucy5zbGljZSgxKS5tYXAocG9zID0+IHRleHRUcmFuc2Zvcm1lci5nZXRPZmZzZXQocG9zKSk7XG5cblx0cHJpbWFyeVRleHRSZXBsID0gcHJpbWFyeVRleHRSZXBsLnJlbW92ZUNvbW1vblByZWZpeEFuZFN1ZmZpeCh0ZXh0KTtcblx0Y29uc3QgcHJpbWFyeVN0cmluZ1JlcGwgPSB0ZXh0VHJhbnNmb3JtZXIuZ2V0U3RyaW5nUmVwbGFjZW1lbnQocHJpbWFyeVRleHRSZXBsKTtcblxuXHRjb25zdCBkZWx0YUZyb21PZmZzZXRUb1JhbmdlU3RhcnQgPSBwcmltYXJ5U3RyaW5nUmVwbC5yZXBsYWNlUmFuZ2Uuc3RhcnQgLSBwcmltYXJ5T2Zmc2V0O1xuXHRjb25zdCBwcmltYXJ5Q29udGV4dFJhbmdlID0gcHJpbWFyeVN0cmluZ1JlcGwucmVwbGFjZVJhbmdlLmpvaW4oT2Zmc2V0UmFuZ2UuZW1wdHlBdChwcmltYXJ5T2Zmc2V0KSk7XG5cdGNvbnN0IHByaW1hcnlDb250ZXh0VmFsdWUgPSB0ZXh0LmdldFZhbHVlT2ZPZmZzZXRSYW5nZShwcmltYXJ5Q29udGV4dFJhbmdlKTtcblxuXHRjb25zdCByZXBsYWNlbWVudHMgPSBzZWNvbmRhcnlPZmZzZXRzLm1hcChzZWNvbmRhcnlPZmZzZXQgPT4ge1xuXHRcdGNvbnN0IG5ld1JhbmdlU3RhcnQgPSBzZWNvbmRhcnlPZmZzZXQgKyBkZWx0YUZyb21PZmZzZXRUb1JhbmdlU3RhcnQ7XG5cdFx0Y29uc3QgbmV3UmFuZ2VFbmQgPSBuZXdSYW5nZVN0YXJ0ICsgcHJpbWFyeVN0cmluZ1JlcGwucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShuZXdSYW5nZVN0YXJ0LCBuZXdSYW5nZUVuZCk7XG5cblx0XHRjb25zdCBjb250ZXh0UmFuZ2UgPSByYW5nZS5qb2luKE9mZnNldFJhbmdlLmVtcHR5QXQoc2Vjb25kYXJ5T2Zmc2V0KSk7XG5cdFx0Y29uc3QgY29udGV4dFZhbHVlID0gdGV4dC5nZXRWYWx1ZU9mT2Zmc2V0UmFuZ2UoY29udGV4dFJhbmdlKTtcblx0XHRpZiAoY29udGV4dFZhbHVlICE9PSBwcmltYXJ5Q29udGV4dFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0cmluZ1JlcGwgPSBuZXcgU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsIHByaW1hcnlTdHJpbmdSZXBsLm5ld1RleHQpO1xuXHRcdGNvbnN0IHJlcGwgPSB0ZXh0VHJhbnNmb3JtZXIuZ2V0VGV4dFJlcGxhY2VtZW50KHN0cmluZ1JlcGwpO1xuXHRcdHJldHVybiByZXBsO1xuXHR9KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRyZXR1cm4gcmVwbGFjZW1lbnRzO1xufVxuXG5jbGFzcyBGYWRlb3V0RGVjb3JhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHJhbmdlczogUmFuZ2VbXSxcblx0XHRvbkRpc3Bvc2U/OiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKG9uRGlzcG9zZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBvbkRpc3Bvc2UoKSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpLnNldERlY29yYXRpb25zKGNvbnN0T2JzZXJ2YWJsZShyYW5nZXMubWFwPElNb2RlbERlbHRhRGVjb3JhdGlvbj4ocmFuZ2UgPT4gKHtcblx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdhbmltYXRpb24nLFxuXHRcdFx0XHRjbGFzc05hbWU6ICdlZGl0cy1mYWRlb3V0LWRlY29yYXRpb24nLFxuXHRcdFx0XHR6SW5kZXg6IDEsXG5cdFx0XHR9XG5cdFx0fSkpKSkpO1xuXG5cdFx0Y29uc3QgdmFsID0gbmV3IE9ic2VydmFibGVBbmltYXRlZFZhbHVlKEFuaW1hdGVkVmFsdWUuc3RhcnROb3coMSwgMCwgMTAwMCwgZWFzZU91dEN1YmljKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvcGFjaXR5ID0gdmFsLmdldFZhbHVlKHJlYWRlcik7XG5cdFx0XHRlZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlLnNldFByb3BlcnR5KCctLWFuaW1hdGlvbi1vcGFjaXR5Jywgb3BhY2l0eS50b1N0cmluZygpKTtcblx0XHRcdGlmICh2YWwuaXNGaW5pc2hlZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdWdnZXN0aW9uSW5WaWV3cG9ydChlZGl0b3I6IElDb2RlRWRpdG9yLCBzdWdnZXN0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGNvbnN0IHRhcmdldFJhbmdlID0gc3VnZ2VzdGlvbi50YXJnZXRSYW5nZTtcblxuXHQvLyBUT0RPIG1ha2UgZ2V0VmlzaWJsZVJhbmdlcyByZWFjdGl2ZSFcblx0b2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKS5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblxuXHRpZiAodmlzaWJsZVJhbmdlcy5sZW5ndGggPCAxKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3Qgdmlld3BvcnRSYW5nZSA9IG5ldyBSYW5nZShcblx0XHR2aXNpYmxlUmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlcixcblx0XHR2aXNpYmxlUmFuZ2VzWzBdLnN0YXJ0Q29sdW1uLFxuXHRcdHZpc2libGVSYW5nZXNbdmlzaWJsZVJhbmdlcy5sZW5ndGggLSAxXS5lbmRMaW5lTnVtYmVyLFxuXHRcdHZpc2libGVSYW5nZXNbdmlzaWJsZVJhbmdlcy5sZW5ndGggLSAxXS5lbmRDb2x1bW5cblx0KTtcblx0cmV0dXJuIHZpZXdwb3J0UmFuZ2UuY29udGFpbnNSYW5nZSh0YXJnZXRSYW5nZSk7XG59XG5cbmZ1bmN0aW9uIHNrdUZyb21BY2NvdW50KGFjY291bnQ6IElEZWZhdWx0QWNjb3VudCB8IG51bGwpOiBJbmxpbmVTdWdnZXN0U2t1IHwgdW5kZWZpbmVkIHtcblx0aWYgKGFjY291bnQ/LmVudGl0bGVtZW50c0RhdGE/LmFjY2Vzc190eXBlX3NrdSAmJiBhY2NvdW50Py5lbnRpdGxlbWVudHNEYXRhPy5jb3BpbG90X3BsYW4pIHtcblx0XHRyZXR1cm4geyB0eXBlOiBhY2NvdW50LmVudGl0bGVtZW50c0RhdGEuYWNjZXNzX3R5cGVfc2t1LCBwbGFuOiBhY2NvdW50LmVudGl0bGVtZW50c0RhdGEuY29waWxvdF9wbGFuIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgRGlzcG9zYWJsZUNhbGxiYWNrPFQ+IHtcblx0cHJpdmF0ZSBfY2I6ICgoZTogVCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoY2I6IChlOiBUKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5fY2IgPSBjYjtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2IgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWFkb25seSBoYW5kbGVyID0gKHZhbDogVCkgPT4ge1xuXHRcdHJldHVybiB0aGlzLl9jYj8uKHZhbCk7XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURpc3Bvc2FibGVDYjxUPihjYjogKGU6IFQpID0+IHZvaWQsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiAoZTogVCkgPT4gdm9pZCB7XG5cdGNvbnN0IGRjYiA9IG5ldyBEaXNwb3NhYmxlQ2FsbGJhY2soY2IpO1xuXHRzdG9yZS5hZGQoZGNiKTtcblx0cmV0dXJuIGRjYi5oYW5kbGVyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQixpQ0FBaUM7QUFDOUQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQW1DO0FBQzVDLFNBQW9FLFNBQVMsaUJBQWlCLFNBQVMsc0JBQXNCLGFBQWEsMEJBQTBCLHFCQUFxQixrQkFBa0IsaUJBQWlCLCtCQUErQixnQkFBZ0IsbUJBQW1CO0FBQzlSLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMs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QyxFQUFFO0FBQUEsRUFDekM7QUFDQSxTQUFPLGNBQWMsY0FBYyxXQUFXO0FBQy9DO0FBRUEsU0FBUyxlQUFlLFNBQStEO0FBQ3RGLE1BQUksU0FBUyxrQkFBa0IsbUJBQW1CLFNBQVMsa0JBQWtCLGNBQWM7QUFDMUYsV0FBTyxFQUFFLE1BQU0sUUFBUSxpQkFBaUIsaUJBQWlCLE1BQU0sUUFBUSxpQkFBaUIsYUFBYTtBQUFBLEVBQ3RHO0FBQ0EsU0FBTztBQUNSO0FBRUEsTUFBTSxtQkFBc0I7QUFBQSxFQUczQixZQUFZLElBQW9CO0FBUWhDLFNBQVMsVUFBVSxDQUFDLFFBQVc7QUFDOUIsYUFBTyxLQUFLLE1BQU0sR0FBRztBQUFBLElBQ3RCO0FBVEMsU0FBSyxNQUFNO0FBQUEsRUFDWjtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLE1BQU07QUFBQSxFQUNaO0FBS0Q7QUFFQSxTQUFTLG1CQUFzQixJQUFvQixPQUF3QztBQUMxRixRQUFNLE1BQU0sSUFBSSxtQkFBbUIsRUFBRTtBQUNyQyxRQUFNLElBQUksR0FBRztBQUNiLFNBQU8sSUFBSTtBQUNaOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiLCAidHgiLCAiVmVyc2lvbklkQ2hhbmdlUmVhc29uIl0KfQo=
