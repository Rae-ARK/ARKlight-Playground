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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType, isObject } from "../../../../base/common/types.js";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { CompletionItemInsertTextRule, CompletionTriggerKind, ProviderId } from "../../../common/languages.js";
import { SnippetController2 } from "../../snippet/browser/snippetController2.js";
import { SnippetParser } from "../../snippet/browser/snippetParser.js";
import { ISuggestMemoryService } from "./suggestMemory.js";
import { WordContextKey } from "./wordContextKey.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Context as SuggestContext, suggestWidgetStatusbarMenu } from "./suggest.js";
import { SuggestAlternatives } from "./suggestAlternatives.js";
import { CommitCharacterController } from "./suggestCommitCharacters.js";
import { State, SuggestModel } from "./suggestModel.js";
import { OvertypingCapturer } from "./suggestOvertypingCapturer.js";
import { SuggestWidget } from "./suggestWidget.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { basename, extname } from "../../../../base/common/resources.js";
import { hash } from "../../../../base/common/hash.js";
import { WindowIdleValue, getWindow } from "../../../../base/browser/dom.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { EditSources } from "../../../common/textModelEditSource.js";
const _sticky = false;
class LineSuffix {
  constructor(_model, _position) {
    this._model = _model;
    this._position = _position;
    this._decorationOptions = ModelDecorationOptions.register({
      description: "suggest-line-suffix",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const maxColumn = _model.getLineMaxColumn(_position.lineNumber);
    if (maxColumn !== _position.column) {
      const offset = _model.getOffsetAt(_position);
      const end = _model.getPositionAt(offset + 1);
      _model.changeDecorations((accessor) => {
        if (this._marker) {
          accessor.removeDecoration(this._marker);
        }
        this._marker = accessor.addDecoration(Range.fromPositions(_position, end), this._decorationOptions);
      });
    }
  }
  dispose() {
    if (this._marker && !this._model.isDisposed()) {
      this._model.changeDecorations((accessor) => {
        accessor.removeDecoration(this._marker);
        this._marker = void 0;
      });
    }
  }
  delta(position) {
    if (this._model.isDisposed() || this._position.lineNumber !== position.lineNumber) {
      return 0;
    }
    if (this._marker) {
      const range = this._model.getDecorationRange(this._marker);
      const end = this._model.getOffsetAt(range.getStartPosition());
      return end - this._model.getOffsetAt(position);
    } else {
      return this._model.getLineMaxColumn(position.lineNumber) - position.column;
    }
  }
}
var InsertFlags = /* @__PURE__ */ ((InsertFlags2) => {
  InsertFlags2[InsertFlags2["None"] = 0] = "None";
  InsertFlags2[InsertFlags2["NoBeforeUndoStop"] = 1] = "NoBeforeUndoStop";
  InsertFlags2[InsertFlags2["NoAfterUndoStop"] = 2] = "NoAfterUndoStop";
  InsertFlags2[InsertFlags2["KeepAlternativeSuggestions"] = 4] = "KeepAlternativeSuggestions";
  InsertFlags2[InsertFlags2["AlternativeOverwriteConfig"] = 8] = "AlternativeOverwriteConfig";
  return InsertFlags2;
})(InsertFlags || {});
let SuggestController = class {
  constructor(editor, _memoryService, _commandService, _contextKeyService, _instantiationService, _logService, _telemetryService) {
    this._memoryService = _memoryService;
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._telemetryService = _telemetryService;
    this._lineSuffix = new MutableDisposable();
    this._toDispose = new DisposableStore();
    this._selectors = new PriorityRegistry((s) => s.priority);
    this._onWillInsertSuggestItem = new Emitter();
    this._wantsForceRenderingAbove = false;
    this.editor = editor;
    this.model = _instantiationService.createInstance(SuggestModel, this.editor);
    this._selectors.register({
      priority: 0,
      select: (model, pos, items) => this._memoryService.select(model, pos, items)
    });
    const ctxInsertMode = SuggestContext.InsertMode.bindTo(_contextKeyService);
    ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode);
    this._toDispose.add(this.model.onDidTrigger(() => ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode)));
    this.widget = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      const widget = this._instantiationService.createInstance(SuggestWidget, this.editor);
      this._toDispose.add(widget);
      this._toDispose.add(widget.onDidSelect((item) => this._insertSuggestion(item, 0 /* None */), this));
      const commitCharacterController = new CommitCharacterController(this.editor, widget, this.model, (item) => this._insertSuggestion(item, 2 /* NoAfterUndoStop */));
      this._toDispose.add(commitCharacterController);
      const ctxMakesTextEdit = SuggestContext.MakesTextEdit.bindTo(this._contextKeyService);
      const ctxHasInsertAndReplace = SuggestContext.HasInsertAndReplaceRange.bindTo(this._contextKeyService);
      const ctxCanResolve = SuggestContext.CanResolve.bindTo(this._contextKeyService);
      this._toDispose.add(toDisposable(() => {
        ctxMakesTextEdit.reset();
        ctxHasInsertAndReplace.reset();
        ctxCanResolve.reset();
      }));
      this._toDispose.add(widget.onDidFocus(({ item }) => {
        const position = this.editor.getPosition();
        const startColumn = item.editStart.column;
        const endColumn = position.column;
        let value = true;
        if (this.editor.getOption(EditorOption.acceptSuggestionOnEnter) === "smart" && this.model.state === State.Auto && !item.completion.additionalTextEdits && !(item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet) && endColumn - startColumn === item.completion.insertText.length) {
          const oldText = this.editor.getModel().getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn,
            endLineNumber: position.lineNumber,
            endColumn
          });
          value = oldText !== item.completion.insertText;
        }
        ctxMakesTextEdit.set(value);
        ctxHasInsertAndReplace.set(!Position.equals(item.editInsertEnd, item.editReplaceEnd));
        ctxCanResolve.set(Boolean(item.provider.resolveCompletionItem) || Boolean(item.completion.documentation) || item.completion.detail !== item.completion.label);
      }));
      if (this._wantsForceRenderingAbove) {
        widget.forceRenderingAbove();
      }
      return widget;
    }));
    this._overtypingCapturer = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      return this._toDispose.add(new OvertypingCapturer(this.editor, this.model));
    }));
    this._alternatives = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      return this._toDispose.add(new SuggestAlternatives(this.editor, this._contextKeyService));
    }));
    this._toDispose.add(_instantiationService.createInstance(WordContextKey, editor));
    this._toDispose.add(this.model.onDidTrigger((e) => {
      this.widget.value.showTriggered(e.auto, e.shy ? 250 : 50);
      this._lineSuffix.value = new LineSuffix(this.editor.getModel(), e.position);
    }));
    this._toDispose.add(this.model.onDidSuggest((e) => {
      if (e.triggerOptions.shy) {
        return;
      }
      let index = -1;
      for (const selector of this._selectors.itemsOrderedByPriorityDesc) {
        index = selector.select(this.editor.getModel(), this.editor.getPosition(), e.completionModel.items);
        if (index !== -1) {
          break;
        }
      }
      if (index === -1) {
        index = 0;
      }
      if (this.model.state === State.Idle) {
        return;
      }
      let noFocus = false;
      if (e.triggerOptions.auto) {
        const options = this.editor.getOption(EditorOption.suggest);
        if (options.selectionMode === "never" || options.selectionMode === "always") {
          noFocus = options.selectionMode === "never";
        } else if (options.selectionMode === "whenTriggerCharacter") {
          noFocus = e.triggerOptions.triggerKind !== CompletionTriggerKind.TriggerCharacter;
        } else if (options.selectionMode === "whenQuickSuggestion") {
          noFocus = e.triggerOptions.triggerKind === CompletionTriggerKind.TriggerCharacter && !e.triggerOptions.refilter;
        }
      }
      this.widget.value.showSuggestions(e.completionModel, index, e.isFrozen, e.triggerOptions.auto, noFocus);
    }));
    this._toDispose.add(this.model.onDidCancel((e) => {
      if (!e.retrigger) {
        this.widget.value.hideWidget();
      }
    }));
    this._toDispose.add(this.editor.onDidBlurEditorWidget(() => {
      if (!_sticky) {
        this.model.cancel();
        this.model.clear();
      }
    }));
    const acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(_contextKeyService);
    const updateFromConfig = () => {
      const acceptSuggestionOnEnter = this.editor.getOption(EditorOption.acceptSuggestionOnEnter);
      acceptSuggestionsOnEnter.set(acceptSuggestionOnEnter === "on" || acceptSuggestionOnEnter === "smart");
    };
    this._toDispose.add(this.editor.onDidChangeConfiguration(() => updateFromConfig()));
    updateFromConfig();
  }
  static get(editor) {
    return editor.getContribution(SuggestController.ID);
  }
  get onWillInsertSuggestItem() {
    return this._onWillInsertSuggestItem.event;
  }
  dispose() {
    this._alternatives.dispose();
    this._toDispose.dispose();
    this.widget.dispose();
    this.model.dispose();
    this._lineSuffix.dispose();
    this._onWillInsertSuggestItem.dispose();
  }
  _insertSuggestion(event, flags) {
    if (!event || !event.item) {
      this._alternatives.value.reset();
      this.model.cancel();
      this.model.clear();
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    const snippetController = SnippetController2.get(this.editor);
    if (!snippetController) {
      return;
    }
    this._onWillInsertSuggestItem.fire({ item: event.item });
    const model = this.editor.getModel();
    const modelVersionNow = model.getAlternativeVersionId();
    const { item } = event;
    const tasks = [];
    const cts = new CancellationTokenSource();
    if (!(flags & 1 /* NoBeforeUndoStop */)) {
      this.editor.pushUndoStop();
    }
    const info = this.getOverwriteInfo(item, Boolean(flags & 8 /* AlternativeOverwriteConfig */));
    this._memoryService.memorize(model, this.editor.getPosition(), item);
    const isResolved = item.isResolved;
    let _commandExectionDuration = -1;
    let _additionalEditsAppliedAsync = -1;
    if (Array.isArray(item.completion.additionalTextEdits)) {
      this.model.cancel();
      const scrollState = StableEditorScrollState.capture(this.editor);
      this.editor.executeEdits(
        "suggestController.additionalTextEdits.sync",
        item.completion.additionalTextEdits.map((edit) => {
          let range = Range.lift(edit.range);
          if (range.startLineNumber === item.position.lineNumber && range.startColumn > item.position.column) {
            const columnDelta = this.editor.getPosition().column - item.position.column;
            const startColumnDelta = columnDelta;
            const endColumnDelta = Range.spansMultipleLines(range) ? 0 : columnDelta;
            range = new Range(range.startLineNumber, range.startColumn + startColumnDelta, range.endLineNumber, range.endColumn + endColumnDelta);
          }
          return EditOperation.replaceMove(range, edit.text);
        })
      );
      scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);
    } else if (!isResolved) {
      const sw = new StopWatch();
      let position;
      const docListener = model.onDidChangeContent((e) => {
        if (e.isFlush) {
          cts.cancel();
          docListener.dispose();
          return;
        }
        for (const change of e.changes) {
          const thisPosition = Range.getEndPosition(change.range);
          if (!position || Position.isBefore(thisPosition, position)) {
            position = thisPosition;
          }
        }
      });
      const oldFlags = flags;
      flags |= 2 /* NoAfterUndoStop */;
      let didType = false;
      const typeListener = this.editor.onWillType(() => {
        typeListener.dispose();
        didType = true;
        if (!(oldFlags & 2 /* NoAfterUndoStop */)) {
          this.editor.pushUndoStop();
        }
      });
      tasks.push(item.resolve(cts.token).then(() => {
        if (!item.completion.additionalTextEdits || cts.token.isCancellationRequested) {
          return void 0;
        }
        if (position && item.completion.additionalTextEdits.some((edit) => Position.isBefore(position, Range.getStartPosition(edit.range)))) {
          return false;
        }
        if (didType) {
          this.editor.pushUndoStop();
        }
        const scrollState = StableEditorScrollState.capture(this.editor);
        this.editor.executeEdits(
          "suggestController.additionalTextEdits.async",
          item.completion.additionalTextEdits.map((edit) => EditOperation.replaceMove(Range.lift(edit.range), edit.text))
        );
        scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);
        if (didType || !(oldFlags & 2 /* NoAfterUndoStop */)) {
          this.editor.pushUndoStop();
        }
        return true;
      }).then((applied) => {
        this._logService.trace("[suggest] async resolving of edits DONE (ms, applied?)", sw.elapsed(), applied);
        _additionalEditsAppliedAsync = applied === true ? 1 : applied === false ? 0 : -2;
      }).finally(() => {
        docListener.dispose();
        typeListener.dispose();
      }));
    }
    let { insertText } = item.completion;
    if (!(item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)) {
      insertText = SnippetParser.escape(insertText);
    }
    this.model.cancel();
    snippetController.insert(insertText, {
      overwriteBefore: info.overwriteBefore,
      overwriteAfter: info.overwriteAfter,
      undoStopBefore: false,
      undoStopAfter: false,
      adjustWhitespace: !(item.completion.insertTextRules & CompletionItemInsertTextRule.KeepWhitespace),
      clipboardText: event.model.clipboardText,
      overtypingCapturer: this._overtypingCapturer.value,
      reason: EditSources.suggest({ providerId: ProviderId.fromExtensionId(item.extensionId?.value) })
    });
    if (!(flags & 2 /* NoAfterUndoStop */)) {
      this.editor.pushUndoStop();
    }
    if (item.completion.command) {
      if (item.completion.command.id === TriggerSuggestAction.id) {
        this.model.trigger({ auto: true, retrigger: true });
      } else {
        const sw = new StopWatch();
        tasks.push(this._commandService.executeCommand(item.completion.command.id, ...item.completion.command.arguments ? [...item.completion.command.arguments] : []).catch((e) => {
          if (item.completion.extensionId) {
            onUnexpectedExternalError(e);
          } else {
            onUnexpectedError(e);
          }
        }).finally(() => {
          _commandExectionDuration = sw.elapsed();
        }));
      }
    }
    if (flags & 4 /* KeepAlternativeSuggestions */) {
      this._alternatives.value.set(event, (next) => {
        cts.cancel();
        while (model.canUndo()) {
          if (modelVersionNow !== model.getAlternativeVersionId()) {
            model.undo();
          }
          this._insertSuggestion(
            next,
            1 /* NoBeforeUndoStop */ | 2 /* NoAfterUndoStop */ | (flags & 8 /* AlternativeOverwriteConfig */ ? 8 /* AlternativeOverwriteConfig */ : 0)
          );
          break;
        }
      });
    }
    this._alertCompletionItem(item);
    Promise.all(tasks).finally(() => {
      this._reportSuggestionAcceptedTelemetry(item, model, isResolved, _commandExectionDuration, _additionalEditsAppliedAsync, event.index, event.model.items);
      this.model.clear();
      cts.dispose();
    });
  }
  _reportSuggestionAcceptedTelemetry(item, model, itemResolved, commandExectionDuration, additionalEditsAppliedAsync, index, completionItems) {
    if (Math.random() > 1e-4) {
      return;
    }
    const labelMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < Math.min(30, completionItems.length); i++) {
      const label = completionItems[i].textLabel;
      if (labelMap.has(label)) {
        labelMap.get(label).push(i);
      } else {
        labelMap.set(label, [i]);
      }
    }
    const firstIndexArray = labelMap.get(item.textLabel);
    const hasDuplicates = firstIndexArray && firstIndexArray.length > 1;
    const firstIndex = hasDuplicates ? firstIndexArray[0] : -1;
    this._telemetryService.publicLog2("suggest.acceptedSuggestion", {
      extensionId: item.extensionId?.value ?? "unknown",
      providerId: item.provider._debugDisplayName ?? "unknown",
      kind: item.completion.kind,
      basenameHash: hash(basename(model.uri)).toString(16),
      languageId: model.getLanguageId(),
      fileExtension: extname(model.uri),
      resolveInfo: !item.provider.resolveCompletionItem ? -1 : itemResolved ? 1 : 0,
      resolveDuration: item.resolveDuration,
      commandDuration: commandExectionDuration,
      additionalEditsAsync: additionalEditsAppliedAsync,
      index,
      firstIndex
    });
  }
  getOverwriteInfo(item, toggleMode) {
    assertType(this.editor.hasModel());
    let replace = this.editor.getOption(EditorOption.suggest).insertMode === "replace";
    if (toggleMode) {
      replace = !replace;
    }
    const overwriteBefore = item.position.column - item.editStart.column;
    const overwriteAfter = (replace ? item.editReplaceEnd.column : item.editInsertEnd.column) - item.position.column;
    const columnDelta = this.editor.getPosition().column - item.position.column;
    const suffixDelta = this._lineSuffix.value ? this._lineSuffix.value.delta(this.editor.getPosition()) : 0;
    return {
      overwriteBefore: overwriteBefore + columnDelta,
      overwriteAfter: overwriteAfter + suffixDelta
    };
  }
  _alertCompletionItem(item) {
    if (isNonEmptyArray(item.completion.additionalTextEdits)) {
      const msg = nls.localize("aria.alert.snippet", "Accepting '{0}' made {1} additional edits", item.textLabel, item.completion.additionalTextEdits.length);
      alert(msg);
    }
  }
  triggerSuggest(onlyFrom, auto, noFilter) {
    if (this.editor.hasModel()) {
      this.model.trigger({
        auto: auto ?? false,
        completionOptions: { providerFilter: onlyFrom, kindFilter: noFilter ? /* @__PURE__ */ new Set() : void 0 }
      });
      this.editor.revealPosition(this.editor.getPosition(), ScrollType.Smooth);
      this.editor.focus();
    }
  }
  triggerSuggestAndAcceptBest(arg) {
    if (!this.editor.hasModel()) {
      return;
    }
    const positionNow = this.editor.getPosition();
    const fallback = () => {
      if (positionNow.equals(this.editor.getPosition())) {
        this._commandService.executeCommand(arg.fallback);
      }
    };
    const makesTextEdit = (item) => {
      if (item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet || item.completion.additionalTextEdits) {
        return true;
      }
      const position = this.editor.getPosition();
      const startColumn = item.editStart.column;
      const endColumn = position.column;
      if (endColumn - startColumn !== item.completion.insertText.length) {
        return true;
      }
      const textNow = this.editor.getModel().getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn,
        endLineNumber: position.lineNumber,
        endColumn
      });
      return textNow !== item.completion.insertText;
    };
    Event.once(this.model.onDidTrigger)((_) => {
      const listener = [];
      Event.any(this.model.onDidTrigger, this.model.onDidCancel)(() => {
        dispose(listener);
        fallback();
      }, void 0, listener);
      this.model.onDidSuggest(({ completionModel }) => {
        dispose(listener);
        if (completionModel.items.length === 0) {
          fallback();
          return;
        }
        const index = this._memoryService.select(this.editor.getModel(), this.editor.getPosition(), completionModel.items);
        const item = completionModel.items[index];
        if (!makesTextEdit(item)) {
          fallback();
          return;
        }
        this.editor.pushUndoStop();
        this._insertSuggestion({ index, item, model: completionModel }, 4 /* KeepAlternativeSuggestions */ | 1 /* NoBeforeUndoStop */ | 2 /* NoAfterUndoStop */);
      }, void 0, listener);
    });
    this.model.trigger({ auto: false, shy: true });
    this.editor.revealPosition(positionNow, ScrollType.Smooth);
    this.editor.focus();
  }
  acceptSelectedSuggestion(keepAlternativeSuggestions, alternativeOverwriteConfig) {
    const item = this.widget.value.getFocusedItem();
    let flags = 0;
    if (keepAlternativeSuggestions) {
      flags |= 4 /* KeepAlternativeSuggestions */;
    }
    if (alternativeOverwriteConfig) {
      flags |= 8 /* AlternativeOverwriteConfig */;
    }
    this._insertSuggestion(item, flags);
  }
  acceptNextSuggestion() {
    this._alternatives.value.next();
  }
  acceptPrevSuggestion() {
    this._alternatives.value.prev();
  }
  cancelSuggestWidget() {
    this.model.cancel();
    this.model.clear();
    this.widget.value.hideWidget();
  }
  focusSuggestion() {
    this.widget.value.focusSelected();
  }
  selectNextSuggestion() {
    this.widget.value.selectNext();
  }
  selectNextPageSuggestion() {
    this.widget.value.selectNextPage();
  }
  selectLastSuggestion() {
    this.widget.value.selectLast();
  }
  selectPrevSuggestion() {
    this.widget.value.selectPrevious();
  }
  selectPrevPageSuggestion() {
    this.widget.value.selectPreviousPage();
  }
  selectFirstSuggestion() {
    this.widget.value.selectFirst();
  }
  toggleSuggestionDetails() {
    this.widget.value.toggleDetails();
  }
  toggleExplainMode() {
    this.widget.value.toggleExplainMode();
  }
  toggleSuggestionFocus() {
    this.widget.value.toggleDetailsFocus();
  }
  resetWidgetSize() {
    this.widget.value.resetPersistedSize();
  }
  forceRenderingAbove() {
    if (this.widget.isInitialized) {
      this.widget.value.forceRenderingAbove();
    } else {
      this._wantsForceRenderingAbove = true;
    }
  }
  stopForceRenderingAbove() {
    if (this.widget.isInitialized) {
      this.widget.value.stopForceRenderingAbove();
    } else {
      this._wantsForceRenderingAbove = false;
    }
  }
  registerSelector(selector) {
    return this._selectors.register(selector);
  }
};
SuggestController.ID = "editor.contrib.suggestController";
SuggestController = __decorateClass([
  __decorateParam(1, ISuggestMemoryService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService)
], SuggestController);
class PriorityRegistry {
  constructor(prioritySelector) {
    this.prioritySelector = prioritySelector;
    this._items = new Array();
  }
  register(value) {
    if (this._items.indexOf(value) !== -1) {
      throw new Error("Value is already registered");
    }
    this._items.push(value);
    this._items.sort((s1, s2) => this.prioritySelector(s2) - this.prioritySelector(s1));
    return {
      dispose: () => {
        const idx = this._items.indexOf(value);
        if (idx >= 0) {
          this._items.splice(idx, 1);
        }
      }
    };
  }
  get itemsOrderedByPriorityDesc() {
    return this._items;
  }
}
const _TriggerSuggestAction = class _TriggerSuggestAction extends EditorAction {
  constructor() {
    super({
      id: _TriggerSuggestAction.id,
      label: nls.localize2("suggest.trigger.label", "Trigger Suggest"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCompletionItemProvider, SuggestContext.Visible.toNegated()),
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Space,
        secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
        mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.Alt | KeyCode.Escape, KeyMod.CtrlCmd | KeyCode.KeyI] },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(_accessor, editor, args) {
    const controller = SuggestController.get(editor);
    if (!controller) {
      return;
    }
    let auto;
    if (args && typeof args === "object") {
      if (args.auto === true) {
        auto = true;
      }
    }
    controller.triggerSuggest(void 0, auto, void 0);
  }
};
_TriggerSuggestAction.id = "editor.action.triggerSuggest";
let TriggerSuggestAction = _TriggerSuggestAction;
registerEditorContribution(SuggestController.ID, SuggestController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(TriggerSuggestAction);
const weight = KeybindingWeight.EditorContrib + 90;
const SuggestCommand = EditorCommand.bindToContribution(SuggestController.get);
registerEditorCommand(new SuggestCommand({
  id: "acceptSelectedSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
  handler(x) {
    x.acceptSelectedSuggestion(true, false);
  },
  kbOpts: [{
    // normal tab
    primary: KeyCode.Tab,
    kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus),
    weight
  }, {
    // accept on enter has special rules
    primary: KeyCode.Enter,
    kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.AcceptSuggestionsOnEnter, SuggestContext.MakesTextEdit),
    weight
  }],
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.insert", "Insert"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange.toNegated())
  }, {
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.insert", "Insert"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("insert"))
  }, {
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.replace", "Replace"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("replace"))
  }]
}));
registerEditorCommand(new SuggestCommand({
  id: "acceptAlternativeSelectedSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.HasFocusedSuggestion),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.Shift | KeyCode.Enter,
    secondary: [KeyMod.Shift | KeyCode.Tab]
  },
  handler(x) {
    x.acceptSelectedSuggestion(false, true);
  },
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 2,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("insert")),
    title: nls.localize("accept.replace", "Replace")
  }, {
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 2,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("replace")),
    title: nls.localize("accept.insert", "Insert")
  }]
}));
CommandsRegistry.registerCommandAlias("acceptSelectedSuggestionOnEnter", "acceptSelectedSuggestion");
registerEditorCommand(new SuggestCommand({
  id: "hideSuggestWidget",
  precondition: SuggestContext.Visible,
  handler: (x) => x.cancelSuggestWidget(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectNextSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectNextSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.DownArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
    mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
  },
  menuOpts: {
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 0,
    when: SuggestContext.HasFocusedSuggestion.toNegated(),
    title: nls.localize("focus.suggestion", "Select")
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectNextPageSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectNextPageSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.PageDown,
    secondary: [KeyMod.CtrlCmd | KeyCode.PageDown]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectLastSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectLastSuggestion()
}));
registerEditorCommand(new SuggestCommand({
  id: "selectPrevSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectPrevSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.UpArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
    mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectPrevPageSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectPrevPageSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.PageUp,
    secondary: [KeyMod.CtrlCmd | KeyCode.PageUp]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectFirstSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectFirstSuggestion()
}));
registerEditorCommand(new SuggestCommand({
  id: "focusSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
  handler: (x) => x.focusSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "focusAndAcceptSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
  handler: (c) => {
    c.focusSuggestion();
    c.acceptSelectedSuggestion(true, false);
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleSuggestionDetails",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
  handler: (x) => x.toggleSuggestionDetails(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
  },
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.DetailsVisible, SuggestContext.CanResolve),
    title: nls.localize("detail.more", "Show Less")
  }, {
    menuId: suggestWidgetStatusbarMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.DetailsVisible.toNegated(), SuggestContext.CanResolve),
    title: nls.localize("detail.less", "Show More")
  }]
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleExplainMode",
  precondition: SuggestContext.Visible,
  handler: (x) => x.toggleExplainMode(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib,
    primary: KeyMod.CtrlCmd | KeyCode.Slash
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleSuggestionFocus",
  precondition: SuggestContext.Visible,
  handler: (x) => x.toggleSuggestionFocus(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
    mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertBestCompletion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    WordContextKey.AtEnd,
    SuggestContext.Visible.toNegated(),
    SuggestAlternatives.OtherSuggestions.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x, arg) => {
    x.triggerSuggestAndAcceptBest(isObject(arg) ? { fallback: "tab", ...arg } : { fallback: "tab" });
  },
  kbOpts: {
    weight,
    primary: KeyCode.Tab
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertNextSuggestion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    SuggestAlternatives.OtherSuggestions,
    SuggestContext.Visible.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x) => x.acceptNextSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.Tab
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertPrevSuggestion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    SuggestAlternatives.OtherSuggestions,
    SuggestContext.Visible.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x) => x.acceptPrevSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.Shift | KeyCode.Tab
  }
}));
registerEditorCommand(new class extends EditorCommand {
  constructor() {
    super({
      id: "suggestWidgetCopy",
      precondition: SuggestContext.DetailsFocused,
      kbOpts: {
        weight: weight + 10,
        kbExpr: SuggestContext.DetailsFocused,
        primary: KeyMod.CtrlCmd | KeyCode.KeyC,
        win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    getWindow(editor.getDomNode()).document.execCommand("copy");
  }
}());
registerEditorAction(class extends EditorAction {
  constructor() {
    super({
      id: "editor.action.resetSuggestSize",
      label: nls.localize2("suggest.reset.label", "Reset Suggest Widget Size"),
      precondition: void 0
    });
  }
  run(_accessor, editor) {
    SuggestController.get(editor)?.resetWidgetSize();
  }
});
export {
  SuggestController,
  TriggerSuggestAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlLCBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9zdGFibGVFZGl0b3JTY3JvbGwuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb21tYW5kLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb21tYW5kLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLCBDb21wbGV0aW9uSXRlbVByb3ZpZGVyLCBDb21wbGV0aW9uVHJpZ2dlcktpbmQsIFByb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciB9IGZyb20gJy4uLy4uL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IElTdWdnZXN0TWVtb3J5U2VydmljZSB9IGZyb20gJy4vc3VnZ2VzdE1lbW9yeS5qcyc7XG5pbXBvcnQgeyBXb3JkQ29udGV4dEtleSB9IGZyb20gJy4vd29yZENvbnRleHRLZXkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtLCBDb250ZXh0IGFzIFN1Z2dlc3RDb250ZXh0LCBJU3VnZ2VzdEl0ZW1QcmVzZWxlY3Rvciwgc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUgfSBmcm9tICcuL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEFsdGVybmF0aXZlcyB9IGZyb20gJy4vc3VnZ2VzdEFsdGVybmF0aXZlcy5qcyc7XG5pbXBvcnQgeyBDb21taXRDaGFyYWN0ZXJDb250cm9sbGVyIH0gZnJvbSAnLi9zdWdnZXN0Q29tbWl0Q2hhcmFjdGVycy5qcyc7XG5pbXBvcnQgeyBTdGF0ZSwgU3VnZ2VzdE1vZGVsIH0gZnJvbSAnLi9zdWdnZXN0TW9kZWwuanMnO1xuaW1wb3J0IHsgT3ZlcnR5cGluZ0NhcHR1cmVyIH0gZnJvbSAnLi9zdWdnZXN0T3ZlcnR5cGluZ0NhcHR1cmVyLmpzJztcbmltcG9ydCB7IElTZWxlY3RlZFN1Z2dlc3Rpb24sIFN1Z2dlc3RXaWRnZXQgfSBmcm9tICcuL3N1Z2dlc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZXh0bmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBXaW5kb3dJZGxlVmFsdWUsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5cbi8vIHN0aWNreSBzdWdnZXN0IHdpZGdldCB3aGljaCBkb2Vzbid0IGRpc2FwcGVhciBvbiBmb2N1cyBvdXQgYW5kIHN1Y2hcbmNvbnN0IF9zdGlja3kgPSBmYWxzZVxuXHQvLyB8fCBCb29sZWFuKFwidHJ1ZVwiKSAvLyBkb25lIFwid2VpcmRseVwiIHNvIHRoYXQgYSBsaW50IHdhcm5pbmcgcHJldmVudHMgeW91IGZyb20gcHVzaGluZyB0aGlzXG5cdDtcblxuY2xhc3MgTGluZVN1ZmZpeCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbk9wdGlvbnMgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ3N1Z2dlc3QtbGluZS1zdWZmaXgnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG5cdH0pO1xuXG5cdHByaXZhdGUgX21hcmtlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsLCBwcml2YXRlIHJlYWRvbmx5IF9wb3NpdGlvbjogSVBvc2l0aW9uKSB7XG5cdFx0Ly8gc3B5IG9uIHdoYXQncyBoYXBwZW5pbmcgcmlnaHQgb2YgdGhlIGN1cnNvci4gdHdvIGNhc2VzOlxuXHRcdC8vIDEuIGVuZCBvZiBsaW5lIC0+IGNoZWNrIHRoYXQgaXQncyBzdGlsbCBlbmQgb2YgbGluZVxuXHRcdC8vIDIuIG1pZCBvZiBsaW5lIC0+IGFkZCBhIG1hcmtlciBhbmQgY29tcHV0ZSB0aGUgZGVsdGFcblx0XHRjb25zdCBtYXhDb2x1bW4gPSBfbW9kZWwuZ2V0TGluZU1heENvbHVtbihfcG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0aWYgKG1heENvbHVtbiAhPT0gX3Bvc2l0aW9uLmNvbHVtbikge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gX21vZGVsLmdldE9mZnNldEF0KF9wb3NpdGlvbik7XG5cdFx0XHRjb25zdCBlbmQgPSBfbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyAxKTtcblx0XHRcdF9tb2RlbC5jaGFuZ2VEZWNvcmF0aW9ucyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9tYXJrZXIpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKHRoaXMuX21hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbWFya2VyID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKF9wb3NpdGlvbiwgZW5kKSwgdGhpcy5fZGVjb3JhdGlvbk9wdGlvbnMpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbWFya2VyICYmICF0aGlzLl9tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMuX21vZGVsLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbih0aGlzLl9tYXJrZXIhKTtcblx0XHRcdFx0dGhpcy5fbWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVsdGEocG9zaXRpb246IElQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSB8fCB0aGlzLl9wb3NpdGlvbi5saW5lTnVtYmVyICE9PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBiYWlsIG91dCBlYXJseSBpZiB0aGluZ3Mgc2VlbXMgZmlzaHlcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHQvLyByZWFkIHRoZSBtYXJrZXIgKGluIGNhc2Ugc3VnZ2VzdCB3YXMgdHJpZ2dlcmVkIGF0IGxpbmUgZW5kKSBvciBjb21wYXJlXG5cdFx0Ly8gdGhlIGN1cnNvciB0byB0aGUgbGluZSBlbmQuXG5cdFx0aWYgKHRoaXMuX21hcmtlcikge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9tb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5fbWFya2VyKTtcblx0XHRcdGNvbnN0IGVuZCA9IHRoaXMuX21vZGVsLmdldE9mZnNldEF0KHJhbmdlIS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0cmV0dXJuIGVuZCAtIHRoaXMuX21vZGVsLmdldE9mZnNldEF0KHBvc2l0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikgLSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGVudW0gSW5zZXJ0RmxhZ3Mge1xuXHROb25lID0gMCxcblx0Tm9CZWZvcmVVbmRvU3RvcCA9IDEsXG5cdE5vQWZ0ZXJVbmRvU3RvcCA9IDIsXG5cdEtlZXBBbHRlcm5hdGl2ZVN1Z2dlc3Rpb25zID0gNCxcblx0QWx0ZXJuYXRpdmVPdmVyd3JpdGVDb25maWcgPSA4XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0Q29udHJvbGxlciBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICdlZGl0b3IuY29udHJpYi5zdWdnZXN0Q29udHJvbGxlcic7XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IFN1Z2dlc3RDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248U3VnZ2VzdENvbnRyb2xsZXI+KFN1Z2dlc3RDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHJlYWRvbmx5IG1vZGVsOiBTdWdnZXN0TW9kZWw7XG5cdHJlYWRvbmx5IHdpZGdldDogV2luZG93SWRsZVZhbHVlPFN1Z2dlc3RXaWRnZXQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsdGVybmF0aXZlczogV2luZG93SWRsZVZhbHVlPFN1Z2dlc3RBbHRlcm5hdGl2ZXM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lU3VmZml4ID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPExpbmVTdWZmaXg+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcnR5cGluZ0NhcHR1cmVyOiBXaW5kb3dJZGxlVmFsdWU8T3ZlcnR5cGluZ0NhcHR1cmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0b3JzID0gbmV3IFByaW9yaXR5UmVnaXN0cnk8SVN1Z2dlc3RJdGVtUHJlc2VsZWN0b3I+KHMgPT4gcy5wcmlvcml0eSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsSW5zZXJ0U3VnZ2VzdEl0ZW0gPSBuZXcgRW1pdHRlcjx7IGl0ZW06IENvbXBsZXRpb25JdGVtIH0+KCk7XG5cdGdldCBvbldpbGxJbnNlcnRTdWdnZXN0SXRlbSgpIHsgcmV0dXJuIHRoaXMuX29uV2lsbEluc2VydFN1Z2dlc3RJdGVtLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfd2FudHNGb3JjZVJlbmRlcmluZ0Fib3ZlID0gZmFsc2U7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJU3VnZ2VzdE1lbW9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVtb3J5U2VydmljZTogSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMubW9kZWwgPSBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdE1vZGVsLCB0aGlzLmVkaXRvciwpO1xuXG5cdFx0Ly8gZGVmYXVsdCBzZWxlY3RvclxuXHRcdHRoaXMuX3NlbGVjdG9ycy5yZWdpc3Rlcih7XG5cdFx0XHRwcmlvcml0eTogMCxcblx0XHRcdHNlbGVjdDogKG1vZGVsLCBwb3MsIGl0ZW1zKSA9PiB0aGlzLl9tZW1vcnlTZXJ2aWNlLnNlbGVjdChtb2RlbCwgcG9zLCBpdGVtcylcblx0XHR9KTtcblxuXHRcdC8vIGNvbnRleHQga2V5OiB1cGRhdGUgaW5zZXJ0L3JlcGxhY2UgbW9kZVxuXHRcdGNvbnN0IGN0eEluc2VydE1vZGUgPSBTdWdnZXN0Q29udGV4dC5JbnNlcnRNb2RlLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGN0eEluc2VydE1vZGUuc2V0KGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLmluc2VydE1vZGUpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5tb2RlbC5vbkRpZFRyaWdnZXIoKCkgPT4gY3R4SW5zZXJ0TW9kZS5zZXQoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuaW5zZXJ0TW9kZSkpKTtcblxuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgV2luZG93SWRsZVZhbHVlKGdldFdpbmRvdyhlZGl0b3IuZ2V0RG9tTm9kZSgpKSwgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0V2lkZ2V0LCB0aGlzLmVkaXRvcik7XG5cblx0XHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQod2lkZ2V0KTtcblx0XHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQod2lkZ2V0Lm9uRGlkU2VsZWN0KGl0ZW0gPT4gdGhpcy5faW5zZXJ0U3VnZ2VzdGlvbihpdGVtLCBJbnNlcnRGbGFncy5Ob25lKSwgdGhpcykpO1xuXG5cdFx0XHQvLyBXaXJlIHVwIGxvZ2ljIHRvIGFjY2VwdCBhIHN1Z2dlc3Rpb24gb24gY2VydGFpbiBjaGFyYWN0ZXJzXG5cdFx0XHRjb25zdCBjb21taXRDaGFyYWN0ZXJDb250cm9sbGVyID0gbmV3IENvbW1pdENoYXJhY3RlckNvbnRyb2xsZXIodGhpcy5lZGl0b3IsIHdpZGdldCwgdGhpcy5tb2RlbCwgaXRlbSA9PiB0aGlzLl9pbnNlcnRTdWdnZXN0aW9uKGl0ZW0sIEluc2VydEZsYWdzLk5vQWZ0ZXJVbmRvU3RvcCkpO1xuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChjb21taXRDaGFyYWN0ZXJDb250cm9sbGVyKTtcblxuXG5cdFx0XHQvLyBXaXJlIHVwIG1ha2VzIHRleHQgZWRpdCBjb250ZXh0IGtleVxuXHRcdFx0Y29uc3QgY3R4TWFrZXNUZXh0RWRpdCA9IFN1Z2dlc3RDb250ZXh0Lk1ha2VzVGV4dEVkaXQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGN0eEhhc0luc2VydEFuZFJlcGxhY2UgPSBTdWdnZXN0Q29udGV4dC5IYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGN0eENhblJlc29sdmUgPSBTdWdnZXN0Q29udGV4dC5DYW5SZXNvbHZlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Y3R4TWFrZXNUZXh0RWRpdC5yZXNldCgpO1xuXHRcdFx0XHRjdHhIYXNJbnNlcnRBbmRSZXBsYWNlLnJlc2V0KCk7XG5cdFx0XHRcdGN0eENhblJlc29sdmUucmVzZXQoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh3aWRnZXQub25EaWRGb2N1cygoeyBpdGVtIH0pID0+IHtcblxuXHRcdFx0XHQvLyAoY3R4OiBtYWtlc1RleHRFZGl0KVxuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhO1xuXHRcdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IGl0ZW0uZWRpdFN0YXJ0LmNvbHVtbjtcblx0XHRcdFx0Y29uc3QgZW5kQ29sdW1uID0gcG9zaXRpb24uY29sdW1uO1xuXHRcdFx0XHRsZXQgdmFsdWUgPSB0cnVlO1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hY2NlcHRTdWdnZXN0aW9uT25FbnRlcikgPT09ICdzbWFydCdcblx0XHRcdFx0XHQmJiB0aGlzLm1vZGVsLnN0YXRlID09PSBTdGF0ZS5BdXRvXG5cdFx0XHRcdFx0JiYgIWl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzXG5cdFx0XHRcdFx0JiYgIShpdGVtLmNvbXBsZXRpb24uaW5zZXJ0VGV4dFJ1bGVzISAmIENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0KVxuXHRcdFx0XHRcdCYmIGVuZENvbHVtbiAtIHN0YXJ0Q29sdW1uID09PSBpdGVtLmNvbXBsZXRpb24uaW5zZXJ0VGV4dC5sZW5ndGhcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkVGV4dCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlSW5SYW5nZSh7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR2YWx1ZSA9IG9sZFRleHQgIT09IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN0eE1ha2VzVGV4dEVkaXQuc2V0KHZhbHVlKTtcblxuXHRcdFx0XHQvLyAoY3R4OiBoYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UpXG5cdFx0XHRcdGN0eEhhc0luc2VydEFuZFJlcGxhY2Uuc2V0KCFQb3NpdGlvbi5lcXVhbHMoaXRlbS5lZGl0SW5zZXJ0RW5kLCBpdGVtLmVkaXRSZXBsYWNlRW5kKSk7XG5cblx0XHRcdFx0Ly8gKGN0eDogY2FuUmVzb2x2ZSlcblx0XHRcdFx0Y3R4Q2FuUmVzb2x2ZS5zZXQoQm9vbGVhbihpdGVtLnByb3ZpZGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbSkgfHwgQm9vbGVhbihpdGVtLmNvbXBsZXRpb24uZG9jdW1lbnRhdGlvbikgfHwgaXRlbS5jb21wbGV0aW9uLmRldGFpbCAhPT0gaXRlbS5jb21wbGV0aW9uLmxhYmVsKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHRoaXMuX3dhbnRzRm9yY2VSZW5kZXJpbmdBYm92ZSkge1xuXHRcdFx0XHR3aWRnZXQuZm9yY2VSZW5kZXJpbmdBYm92ZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gd2lkZ2V0O1xuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgdXAgdGV4dCBvdmVydHlwaW5nIGNhcHR1cmVcblx0XHR0aGlzLl9vdmVydHlwaW5nQ2FwdHVyZXIgPSB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBXaW5kb3dJZGxlVmFsdWUoZ2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgT3ZlcnR5cGluZ0NhcHR1cmVyKHRoaXMuZWRpdG9yLCB0aGlzLm1vZGVsKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVzID0gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgV2luZG93SWRsZVZhbHVlKGdldFdpbmRvdyhlZGl0b3IuZ2V0RG9tTm9kZSgpKSwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvRGlzcG9zZS5hZGQobmV3IFN1Z2dlc3RBbHRlcm5hdGl2ZXModGhpcy5lZGl0b3IsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29yZENvbnRleHRLZXksIGVkaXRvcikpO1xuXG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLm1vZGVsLm9uRGlkVHJpZ2dlcihlID0+IHtcblx0XHRcdHRoaXMud2lkZ2V0LnZhbHVlLnNob3dUcmlnZ2VyZWQoZS5hdXRvLCBlLnNoeSA/IDI1MCA6IDUwKTtcblx0XHRcdHRoaXMuX2xpbmVTdWZmaXgudmFsdWUgPSBuZXcgTGluZVN1ZmZpeCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpISwgZS5wb3NpdGlvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5tb2RlbC5vbkRpZFN1Z2dlc3QoZSA9PiB7XG5cdFx0XHRpZiAoZS50cmlnZ2VyT3B0aW9ucy5zaHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGluZGV4ID0gLTE7XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIHRoaXMuX3NlbGVjdG9ycy5pdGVtc09yZGVyZWRCeVByaW9yaXR5RGVzYykge1xuXHRcdFx0XHRpbmRleCA9IHNlbGVjdG9yLnNlbGVjdCh0aGlzLmVkaXRvci5nZXRNb2RlbCgpISwgdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSEsIGUuY29tcGxldGlvbk1vZGVsLml0ZW1zKTtcblx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdGluZGV4ID0gMDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm1vZGVsLnN0YXRlID09PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHRcdC8vIHNlbGVjdGluZyBhbiBpdGVtIGNhbiBcInB1bXBcIiBvdXQgc2VsZWN0aW9uL2N1cnNvciBjaGFuZ2UgZXZlbnRzXG5cdFx0XHRcdC8vIHdoaWNoIGNhbiBjYW5jZWwgc3VnZ2VzdCBoYWxmd2F5IHRocm91Z2ggdGhpcyBmdW5jdGlvbi4gdGhlcmVmb3JlXG5cdFx0XHRcdC8vIHdlIG5lZWQgdG8gY2hlY2sgYWdhaW4gYW5kIGJhaWwgaWYgdGhlIHNlc3Npb24gaGFzIGJlZW4gY2FuY2VsZWRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IG5vRm9jdXMgPSBmYWxzZTtcblx0XHRcdGlmIChlLnRyaWdnZXJPcHRpb25zLmF1dG8pIHtcblx0XHRcdFx0Ly8gZG9uJ3QgXCJmb2N1c1wiIGl0ZW0gd2hlbiBjb25maWd1cmVkIHRvIGRvXG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5zZWxlY3Rpb25Nb2RlID09PSAnbmV2ZXInIHx8IG9wdGlvbnMuc2VsZWN0aW9uTW9kZSA9PT0gJ2Fsd2F5cycpIHtcblx0XHRcdFx0XHQvLyBzaW1wbGU6IGFsd2F5cyBvciBuZXZlclxuXHRcdFx0XHRcdG5vRm9jdXMgPSBvcHRpb25zLnNlbGVjdGlvbk1vZGUgPT09ICduZXZlcic7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25zLnNlbGVjdGlvbk1vZGUgPT09ICd3aGVuVHJpZ2dlckNoYXJhY3RlcicpIHtcblx0XHRcdFx0XHQvLyBvbiB3aXRoIHRyaWdnZXIgY2hhcmFjdGVyXG5cdFx0XHRcdFx0bm9Gb2N1cyA9IGUudHJpZ2dlck9wdGlvbnMudHJpZ2dlcktpbmQgIT09IENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAob3B0aW9ucy5zZWxlY3Rpb25Nb2RlID09PSAnd2hlblF1aWNrU3VnZ2VzdGlvbicpIHtcblx0XHRcdFx0XHQvLyB3aXRob3V0IHRyaWdnZXIgY2hhcmFjdGVyIG9yIHdoZW4gcmVmaWx0ZXJpbmdcblx0XHRcdFx0XHRub0ZvY3VzID0gZS50cmlnZ2VyT3B0aW9ucy50cmlnZ2VyS2luZCA9PT0gQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIgJiYgIWUudHJpZ2dlck9wdGlvbnMucmVmaWx0ZXI7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdFx0dGhpcy53aWRnZXQudmFsdWUuc2hvd1N1Z2dlc3Rpb25zKGUuY29tcGxldGlvbk1vZGVsLCBpbmRleCwgZS5pc0Zyb3plbiwgZS50cmlnZ2VyT3B0aW9ucy5hdXRvLCBub0ZvY3VzKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLm1vZGVsLm9uRGlkQ2FuY2VsKGUgPT4ge1xuXHRcdFx0aWYgKCFlLnJldHJpZ2dlcikge1xuXHRcdFx0XHR0aGlzLndpZGdldC52YWx1ZS5oaWRlV2lkZ2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdGlmICghX3N0aWNreSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLm1vZGVsLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWFuYWdlIHRoZSBhY2NlcHRTdWdnZXN0aW9uc09uRW50ZXIgY29udGV4dCBrZXlcblx0XHRjb25zdCBhY2NlcHRTdWdnZXN0aW9uc09uRW50ZXIgPSBTdWdnZXN0Q29udGV4dC5BY2NlcHRTdWdnZXN0aW9uc09uRW50ZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdXBkYXRlRnJvbUNvbmZpZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hY2NlcHRTdWdnZXN0aW9uT25FbnRlcik7XG5cdFx0XHRhY2NlcHRTdWdnZXN0aW9uc09uRW50ZXIuc2V0KGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID09PSAnb24nIHx8IGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyID09PSAnc21hcnQnKTtcblx0XHR9O1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHVwZGF0ZUZyb21Db25maWcoKSkpO1xuXHRcdHVwZGF0ZUZyb21Db25maWcoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMud2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9saW5lU3VmZml4LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbldpbGxJbnNlcnRTdWdnZXN0SXRlbS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2luc2VydFN1Z2dlc3Rpb24oXG5cdFx0ZXZlbnQ6IElTZWxlY3RlZFN1Z2dlc3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0ZmxhZ3M6IEluc2VydEZsYWdzXG5cdCk6IHZvaWQge1xuXHRcdGlmICghZXZlbnQgfHwgIWV2ZW50Lml0ZW0pIHtcblx0XHRcdHRoaXMuX2FsdGVybmF0aXZlcy52YWx1ZS5yZXNldCgpO1xuXHRcdFx0dGhpcy5tb2RlbC5jYW5jZWwoKTtcblx0XHRcdHRoaXMubW9kZWwuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNuaXBwZXRDb250cm9sbGVyID0gU25pcHBldENvbnRyb2xsZXIyLmdldCh0aGlzLmVkaXRvcik7XG5cdFx0aWYgKCFzbmlwcGV0Q29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uV2lsbEluc2VydFN1Z2dlc3RJdGVtLmZpcmUoeyBpdGVtOiBldmVudC5pdGVtIH0pO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsVmVyc2lvbk5vdyA9IG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgeyBpdGVtIH0gPSBldmVudDtcblxuXHRcdC8vXG5cdFx0Y29uc3QgdGFza3M6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8gcHVzaGluZyB1bmRvIHN0b3BzICpiZWZvcmUqIGFkZGl0aW9uYWwgdGV4dCBlZGl0cyBhbmRcblx0XHQvLyAqYWZ0ZXIqIHRoZSBtYWluIGVkaXRcblx0XHRpZiAoIShmbGFncyAmIEluc2VydEZsYWdzLk5vQmVmb3JlVW5kb1N0b3ApKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cblx0XHQvLyBjb21wdXRlIG92ZXJ3cml0ZVtCZWZvcmV8QWZ0ZXJdIGRlbHRhcyBCRUZPUkUgYXBwbHlpbmcgZXh0cmEgZWRpdHNcblx0XHRjb25zdCBpbmZvID0gdGhpcy5nZXRPdmVyd3JpdGVJbmZvKGl0ZW0sIEJvb2xlYW4oZmxhZ3MgJiBJbnNlcnRGbGFncy5BbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZykpO1xuXG5cdFx0Ly8ga2VlcCBpdGVtIGluIG1lbW9yeVxuXHRcdHRoaXMuX21lbW9yeVNlcnZpY2UubWVtb3JpemUobW9kZWwsIHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCksIGl0ZW0pO1xuXG5cdFx0Y29uc3QgaXNSZXNvbHZlZCA9IGl0ZW0uaXNSZXNvbHZlZDtcblxuXHRcdC8vIHRlbGVtZXRyeSBkYXRhIHBvaW50czogZHVyYXRpb24gb2YgY29tbWFuZCBleGVjdXRpb24sIGluZm8gYWJvdXQgYXN5bmMgYWRkaXRpb25hbCBlZGl0cyAoLTE9bi9hLCAtMj1ub25lLCAxPXN1Y2Nlc3MsIDA9ZmFpbGVkKVxuXHRcdGxldCBfY29tbWFuZEV4ZWN0aW9uRHVyYXRpb24gPSAtMTtcblx0XHRsZXQgX2FkZGl0aW9uYWxFZGl0c0FwcGxpZWRBc3luYyA9IC0xO1xuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMpKSB7XG5cblx0XHRcdC8vIGNhbmNlbCAtPiBzdG9wcyBhbGwgbGlzdGVuaW5nIGFuZCBjbG9zZXMgd2lkZ2V0XG5cdFx0XHR0aGlzLm1vZGVsLmNhbmNlbCgpO1xuXG5cdFx0XHQvLyBzeW5jIGFkZGl0aW9uYWwgZWRpdHNcblx0XHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLmVkaXRvcik7XG5cdFx0XHR0aGlzLmVkaXRvci5leGVjdXRlRWRpdHMoXG5cdFx0XHRcdCdzdWdnZXN0Q29udHJvbGxlci5hZGRpdGlvbmFsVGV4dEVkaXRzLnN5bmMnLFxuXHRcdFx0XHRpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAoZWRpdCA9PiB7XG5cdFx0XHRcdFx0bGV0IHJhbmdlID0gUmFuZ2UubGlmdChlZGl0LnJhbmdlKTtcblx0XHRcdFx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBpdGVtLnBvc2l0aW9uLmxpbmVOdW1iZXIgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPiBpdGVtLnBvc2l0aW9uLmNvbHVtbikge1xuXHRcdFx0XHRcdFx0Ly8gc2hpZnQgYWRkaXRpb25hbCBlZGl0IHdoZW4gaXQgaXMgXCJhZnRlclwiIHRoZSBjb21wbGV0aW9uIGluc2VydGlvbiBwb3NpdGlvblxuXHRcdFx0XHRcdFx0Y29uc3QgY29sdW1uRGVsdGEgPSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpIS5jb2x1bW4gLSBpdGVtLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uRGVsdGEgPSBjb2x1bW5EZWx0YTtcblx0XHRcdFx0XHRcdGNvbnN0IGVuZENvbHVtbkRlbHRhID0gUmFuZ2Uuc3BhbnNNdWx0aXBsZUxpbmVzKHJhbmdlKSA/IDAgOiBjb2x1bW5EZWx0YTtcblx0XHRcdFx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4gKyBzdGFydENvbHVtbkRlbHRhLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4gKyBlbmRDb2x1bW5EZWx0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBFZGl0T3BlcmF0aW9uLnJlcGxhY2VNb3ZlKHJhbmdlLCBlZGl0LnRleHQpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHRcdHNjcm9sbFN0YXRlLnJlc3RvcmVSZWxhdGl2ZVZlcnRpY2FsUG9zaXRpb25PZkN1cnNvcih0aGlzLmVkaXRvcik7XG5cblx0XHR9IGVsc2UgaWYgKCFpc1Jlc29sdmVkKSB7XG5cdFx0XHQvLyBhc3luYyBhZGRpdGlvbmFsIGVkaXRzXG5cdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdGxldCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBkb2NMaXN0ZW5lciA9IG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudChlID0+IHtcblx0XHRcdFx0aWYgKGUuaXNGbHVzaCkge1xuXHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHRkb2NMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGUuY2hhbmdlcykge1xuXHRcdFx0XHRcdGNvbnN0IHRoaXNQb3NpdGlvbiA9IFJhbmdlLmdldEVuZFBvc2l0aW9uKGNoYW5nZS5yYW5nZSk7XG5cdFx0XHRcdFx0aWYgKCFwb3NpdGlvbiB8fCBQb3NpdGlvbi5pc0JlZm9yZSh0aGlzUG9zaXRpb24sIHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdFx0cG9zaXRpb24gPSB0aGlzUG9zaXRpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgb2xkRmxhZ3MgPSBmbGFncztcblx0XHRcdGZsYWdzIHw9IEluc2VydEZsYWdzLk5vQWZ0ZXJVbmRvU3RvcDtcblx0XHRcdGxldCBkaWRUeXBlID0gZmFsc2U7XG5cdFx0XHRjb25zdCB0eXBlTGlzdGVuZXIgPSB0aGlzLmVkaXRvci5vbldpbGxUeXBlKCgpID0+IHtcblx0XHRcdFx0dHlwZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlkVHlwZSA9IHRydWU7XG5cdFx0XHRcdGlmICghKG9sZEZsYWdzICYgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wKSkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGFza3MucHVzaChpdGVtLnJlc29sdmUoY3RzLnRva2VuKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKCFpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cyB8fCBjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwb3NpdGlvbiAmJiBpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5zb21lKGVkaXQgPT4gUG9zaXRpb24uaXNCZWZvcmUocG9zaXRpb24hLCBSYW5nZS5nZXRTdGFydFBvc2l0aW9uKGVkaXQucmFuZ2UpKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRpZFR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzY3JvbGxTdGF0ZSA9IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlLmNhcHR1cmUodGhpcy5lZGl0b3IpO1xuXHRcdFx0XHR0aGlzLmVkaXRvci5leGVjdXRlRWRpdHMoXG5cdFx0XHRcdFx0J3N1Z2dlc3RDb250cm9sbGVyLmFkZGl0aW9uYWxUZXh0RWRpdHMuYXN5bmMnLFxuXHRcdFx0XHRcdGl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcChlZGl0ID0+IEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUoUmFuZ2UubGlmdChlZGl0LnJhbmdlKSwgZWRpdC50ZXh0KSlcblx0XHRcdFx0KTtcblx0XHRcdFx0c2Nyb2xsU3RhdGUucmVzdG9yZVJlbGF0aXZlVmVydGljYWxQb3NpdGlvbk9mQ3Vyc29yKHRoaXMuZWRpdG9yKTtcblx0XHRcdFx0aWYgKGRpZFR5cGUgfHwgIShvbGRGbGFncyAmIEluc2VydEZsYWdzLk5vQWZ0ZXJVbmRvU3RvcCkpIHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pLnRoZW4oYXBwbGllZCA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tzdWdnZXN0XSBhc3luYyByZXNvbHZpbmcgb2YgZWRpdHMgRE9ORSAobXMsIGFwcGxpZWQ/KScsIHN3LmVsYXBzZWQoKSwgYXBwbGllZCk7XG5cdFx0XHRcdF9hZGRpdGlvbmFsRWRpdHNBcHBsaWVkQXN5bmMgPSBhcHBsaWVkID09PSB0cnVlID8gMSA6IGFwcGxpZWQgPT09IGZhbHNlID8gMCA6IC0yO1xuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGRvY0xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dHlwZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgeyBpbnNlcnRUZXh0IH0gPSBpdGVtLmNvbXBsZXRpb247XG5cdFx0aWYgKCEoaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHRSdWxlcyEgJiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCkpIHtcblx0XHRcdGluc2VydFRleHQgPSBTbmlwcGV0UGFyc2VyLmVzY2FwZShpbnNlcnRUZXh0KTtcblx0XHR9XG5cblx0XHQvLyBjYW5jZWwgLT4gc3RvcHMgYWxsIGxpc3RlbmluZyBhbmQgY2xvc2VzIHdpZGdldFxuXHRcdHRoaXMubW9kZWwuY2FuY2VsKCk7XG5cblx0XHRzbmlwcGV0Q29udHJvbGxlci5pbnNlcnQoaW5zZXJ0VGV4dCwge1xuXHRcdFx0b3ZlcndyaXRlQmVmb3JlOiBpbmZvLm92ZXJ3cml0ZUJlZm9yZSxcblx0XHRcdG92ZXJ3cml0ZUFmdGVyOiBpbmZvLm92ZXJ3cml0ZUFmdGVyLFxuXHRcdFx0dW5kb1N0b3BCZWZvcmU6IGZhbHNlLFxuXHRcdFx0dW5kb1N0b3BBZnRlcjogZmFsc2UsXG5cdFx0XHRhZGp1c3RXaGl0ZXNwYWNlOiAhKGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0UnVsZXMhICYgQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5LZWVwV2hpdGVzcGFjZSksXG5cdFx0XHRjbGlwYm9hcmRUZXh0OiBldmVudC5tb2RlbC5jbGlwYm9hcmRUZXh0LFxuXHRcdFx0b3ZlcnR5cGluZ0NhcHR1cmVyOiB0aGlzLl9vdmVydHlwaW5nQ2FwdHVyZXIudmFsdWUsXG5cdFx0XHRyZWFzb246IEVkaXRTb3VyY2VzLnN1Z2dlc3QoeyBwcm92aWRlcklkOiBQcm92aWRlcklkLmZyb21FeHRlbnNpb25JZChpdGVtLmV4dGVuc2lvbklkPy52YWx1ZSkgfSksXG5cdFx0fSk7XG5cblx0XHRpZiAoIShmbGFncyAmIEluc2VydEZsYWdzLk5vQWZ0ZXJVbmRvU3RvcCkpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLmNvbXBsZXRpb24uY29tbWFuZCkge1xuXHRcdFx0aWYgKGl0ZW0uY29tcGxldGlvbi5jb21tYW5kLmlkID09PSBUcmlnZ2VyU3VnZ2VzdEFjdGlvbi5pZCkge1xuXHRcdFx0XHQvLyByZXRpZ2dlclxuXHRcdFx0XHR0aGlzLm1vZGVsLnRyaWdnZXIoeyBhdXRvOiB0cnVlLCByZXRyaWdnZXI6IHRydWUgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBleGVjIGNvbW1hbmQsIGRvbmVcblx0XHRcdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0XHRcdHRhc2tzLnB1c2godGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoaXRlbS5jb21wbGV0aW9uLmNvbW1hbmQuaWQsIC4uLihpdGVtLmNvbXBsZXRpb24uY29tbWFuZC5hcmd1bWVudHMgPyBbLi4uaXRlbS5jb21wbGV0aW9uLmNvbW1hbmQuYXJndW1lbnRzXSA6IFtdKSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0uY29tcGxldGlvbi5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRfY29tbWFuZEV4ZWN0aW9uRHVyYXRpb24gPSBzdy5lbGFwc2VkKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZmxhZ3MgJiBJbnNlcnRGbGFncy5LZWVwQWx0ZXJuYXRpdmVTdWdnZXN0aW9ucykge1xuXHRcdFx0dGhpcy5fYWx0ZXJuYXRpdmVzLnZhbHVlLnNldChldmVudCwgbmV4dCA9PiB7XG5cblx0XHRcdFx0Ly8gY2FuY2VsIHJlc29sdmluZyBvZiBhZGRpdGlvbmFsIGVkaXRzXG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdFx0XHQvLyB0aGlzIGlzIG5vdCBzbyBwcmV0dHkuIHdoZW4gaW5zZXJ0aW5nIHRoZSAnbmV4dCdcblx0XHRcdFx0Ly8gc3VnZ2VzdGlvbiB3ZSB1bmRvIHVudGlsIHdlIGFyZSBhdCB0aGUgc3RhdGUgYXRcblx0XHRcdFx0Ly8gd2hpY2ggd2Ugd2VyZSBiZWZvcmUgaW5zZXJ0aW5nIHRoZSBwcmV2aW91cyBzdWdnZXN0aW9uLi4uXG5cdFx0XHRcdHdoaWxlIChtb2RlbC5jYW5VbmRvKCkpIHtcblx0XHRcdFx0XHRpZiAobW9kZWxWZXJzaW9uTm93ICE9PSBtb2RlbC5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpKSB7XG5cdFx0XHRcdFx0XHRtb2RlbC51bmRvKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2luc2VydFN1Z2dlc3Rpb24oXG5cdFx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdFx0SW5zZXJ0RmxhZ3MuTm9CZWZvcmVVbmRvU3RvcCB8IEluc2VydEZsYWdzLk5vQWZ0ZXJVbmRvU3RvcCB8IChmbGFncyAmIEluc2VydEZsYWdzLkFsdGVybmF0aXZlT3ZlcndyaXRlQ29uZmlnID8gSW5zZXJ0RmxhZ3MuQWx0ZXJuYXRpdmVPdmVyd3JpdGVDb25maWcgOiAwKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FsZXJ0Q29tcGxldGlvbkl0ZW0oaXRlbSk7XG5cblx0XHQvLyBjbGVhciBvbmx5IG5vdyAtIGFmdGVyIGFsbCB0YXNrcyBhcmUgZG9uZVxuXHRcdFByb21pc2UuYWxsKHRhc2tzKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcG9ydFN1Z2dlc3Rpb25BY2NlcHRlZFRlbGVtZXRyeShpdGVtLCBtb2RlbCwgaXNSZXNvbHZlZCwgX2NvbW1hbmRFeGVjdGlvbkR1cmF0aW9uLCBfYWRkaXRpb25hbEVkaXRzQXBwbGllZEFzeW5jLCBldmVudC5pbmRleCwgZXZlbnQubW9kZWwuaXRlbXMpO1xuXG5cdFx0XHR0aGlzLm1vZGVsLmNsZWFyKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0U3VnZ2VzdGlvbkFjY2VwdGVkVGVsZW1ldHJ5KGl0ZW06IENvbXBsZXRpb25JdGVtLCBtb2RlbDogSVRleHRNb2RlbCwgaXRlbVJlc29sdmVkOiBib29sZWFuLCBjb21tYW5kRXhlY3Rpb25EdXJhdGlvbjogbnVtYmVyLCBhZGRpdGlvbmFsRWRpdHNBcHBsaWVkQXN5bmM6IG51bWJlciwgaW5kZXg6IG51bWJlciwgY29tcGxldGlvbkl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogdm9pZCB7XG5cdFx0aWYgKE1hdGgucmFuZG9tKCkgPiAwLjAwMDEpIHsgLy8gMC4wMSVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oMzAsIGNvbXBsZXRpb25JdGVtcy5sZW5ndGgpOyBpKyspIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gY29tcGxldGlvbkl0ZW1zW2ldLnRleHRMYWJlbDtcblxuXHRcdFx0aWYgKGxhYmVsTWFwLmhhcyhsYWJlbCkpIHtcblx0XHRcdFx0bGFiZWxNYXAuZ2V0KGxhYmVsKSEucHVzaChpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsTWFwLnNldChsYWJlbCwgW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdEluZGV4QXJyYXkgPSBsYWJlbE1hcC5nZXQoaXRlbS50ZXh0TGFiZWwpO1xuXHRcdGNvbnN0IGhhc0R1cGxpY2F0ZXMgPSBmaXJzdEluZGV4QXJyYXkgJiYgZmlyc3RJbmRleEFycmF5Lmxlbmd0aCA+IDE7XG5cdFx0Y29uc3QgZmlyc3RJbmRleCA9IGhhc0R1cGxpY2F0ZXMgPyBmaXJzdEluZGV4QXJyYXlbMF0gOiAtMTtcblxuXHRcdHR5cGUgQWNjZXB0ZWRTdWdnZXN0aW9uID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZzsgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRcdFx0ZmlsZUV4dGVuc2lvbjogc3RyaW5nOyBsYW5ndWFnZUlkOiBzdHJpbmc7IGJhc2VuYW1lSGFzaDogc3RyaW5nOyBraW5kOiBudW1iZXI7XG5cdFx0XHRyZXNvbHZlSW5mbzogbnVtYmVyOyByZXNvbHZlRHVyYXRpb246IG51bWJlcjtcblx0XHRcdGNvbW1hbmREdXJhdGlvbjogbnVtYmVyO1xuXHRcdFx0YWRkaXRpb25hbEVkaXRzQXN5bmM6IG51bWJlcjtcblx0XHRcdGluZGV4OiBudW1iZXI7IGZpcnN0SW5kZXg6IG51bWJlcjtcblx0XHR9O1xuXHRcdHR5cGUgQWNjZXB0ZWRTdWdnZXN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2pyaWVrZW4nO1xuXHRcdFx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFjY2VwdGluZyBjb21wbGV0aW9uIGl0ZW1zJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0V4dGVuc2lvbiBjb250cmlidXRpbmcgdGhlIGNvbXBsZXRpb25zIGl0ZW0nIH07XG5cdFx0XHRwcm92aWRlcklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1Byb3ZpZGVyIG9mIHRoZSBjb21wbGV0aW9ucyBpdGVtJyB9O1xuXHRcdFx0YmFzZW5hbWVIYXNoOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hhc2ggb2YgdGhlIGJhc2VuYW1lIG9mIHRoZSBmaWxlIGludG8gd2hpY2ggdGhlIGNvbXBsZXRpb24gd2FzIGluc2VydGVkJyB9O1xuXHRcdFx0ZmlsZUV4dGVuc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0ZpbGUgZXh0ZW5zaW9uIG9mIHRoZSBmaWxlIGludG8gd2hpY2ggdGhlIGNvbXBsZXRpb24gd2FzIGluc2VydGVkJyB9O1xuXHRcdFx0bGFuZ3VhZ2VJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0xhbmd1YWdlIHR5cGUgb2YgdGhlIGZpbGUgaW50byB3aGljaCB0aGUgY29tcGxldGlvbiB3YXMgaW5zZXJ0ZWQnIH07XG5cdFx0XHRraW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbXBsZXRpb24gaXRlbSBraW5kJyB9O1xuXHRcdFx0cmVzb2x2ZUluZm86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJZiB0aGUgaXRlbSB3YXMgaW5zZXJ0ZWQgYmVmb3JlIHJlc29sdmluZyB3YXMgZG9uZScgfTtcblx0XHRcdHJlc29sdmVEdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyBsb25nIHJlc29sdmluZyB0b29rIHRvIGZpbmlzaCcgfTtcblx0XHRcdGNvbW1hbmREdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyBsb25nIGEgY29tcGxldGlvbiBpdGVtIGNvbW1hbmQgdG9vaycgfTtcblx0XHRcdGFkZGl0aW9uYWxFZGl0c0FzeW5jOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5mbyBhYm91dCBhc3luY2hyb25vdXNseSBhcHBseWluZyBhZGRpdGlvbmFsIGVkaXRzJyB9O1xuXHRcdFx0aW5kZXg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaW5kZXggb2YgdGhlIGNvbXBsZXRpb24gaXRlbSBpbiB0aGUgc29ydGVkIGxpc3QuJyB9O1xuXHRcdFx0Zmlyc3RJbmRleDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZW4gdGhlcmUgYXJlIG11bHRpcGxlIGNvbXBsZXRpb25zLCB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IGluc3RhbmNlLicgfTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFjY2VwdGVkU3VnZ2VzdGlvbiwgQWNjZXB0ZWRTdWdnZXN0aW9uQ2xhc3NpZmljYXRpb24+KCdzdWdnZXN0LmFjY2VwdGVkU3VnZ2VzdGlvbicsIHtcblx0XHRcdGV4dGVuc2lvbklkOiBpdGVtLmV4dGVuc2lvbklkPy52YWx1ZSA/PyAndW5rbm93bicsXG5cdFx0XHRwcm92aWRlcklkOiBpdGVtLnByb3ZpZGVyLl9kZWJ1Z0Rpc3BsYXlOYW1lID8/ICd1bmtub3duJyxcblx0XHRcdGtpbmQ6IGl0ZW0uY29tcGxldGlvbi5raW5kLFxuXHRcdFx0YmFzZW5hbWVIYXNoOiBoYXNoKGJhc2VuYW1lKG1vZGVsLnVyaSkpLnRvU3RyaW5nKDE2KSxcblx0XHRcdGxhbmd1YWdlSWQ6IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdGZpbGVFeHRlbnNpb246IGV4dG5hbWUobW9kZWwudXJpKSxcblx0XHRcdHJlc29sdmVJbmZvOiAhaXRlbS5wcm92aWRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0gPyAtMSA6IGl0ZW1SZXNvbHZlZCA/IDEgOiAwLFxuXHRcdFx0cmVzb2x2ZUR1cmF0aW9uOiBpdGVtLnJlc29sdmVEdXJhdGlvbixcblx0XHRcdGNvbW1hbmREdXJhdGlvbjogY29tbWFuZEV4ZWN0aW9uRHVyYXRpb24sXG5cdFx0XHRhZGRpdGlvbmFsRWRpdHNBc3luYzogYWRkaXRpb25hbEVkaXRzQXBwbGllZEFzeW5jLFxuXHRcdFx0aW5kZXgsXG5cdFx0XHRmaXJzdEluZGV4LFxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0T3ZlcndyaXRlSW5mbyhpdGVtOiBDb21wbGV0aW9uSXRlbSwgdG9nZ2xlTW9kZTogYm9vbGVhbik6IHsgb3ZlcndyaXRlQmVmb3JlOiBudW1iZXI7IG92ZXJ3cml0ZUFmdGVyOiBudW1iZXIgfSB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLmVkaXRvci5oYXNNb2RlbCgpKTtcblxuXHRcdGxldCByZXBsYWNlID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5pbnNlcnRNb2RlID09PSAncmVwbGFjZSc7XG5cdFx0aWYgKHRvZ2dsZU1vZGUpIHtcblx0XHRcdHJlcGxhY2UgPSAhcmVwbGFjZTtcblx0XHR9XG5cdFx0Y29uc3Qgb3ZlcndyaXRlQmVmb3JlID0gaXRlbS5wb3NpdGlvbi5jb2x1bW4gLSBpdGVtLmVkaXRTdGFydC5jb2x1bW47XG5cdFx0Y29uc3Qgb3ZlcndyaXRlQWZ0ZXIgPSAocmVwbGFjZSA/IGl0ZW0uZWRpdFJlcGxhY2VFbmQuY29sdW1uIDogaXRlbS5lZGl0SW5zZXJ0RW5kLmNvbHVtbikgLSBpdGVtLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRjb25zdCBjb2x1bW5EZWx0YSA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkuY29sdW1uIC0gaXRlbS5wb3NpdGlvbi5jb2x1bW47XG5cdFx0Y29uc3Qgc3VmZml4RGVsdGEgPSB0aGlzLl9saW5lU3VmZml4LnZhbHVlID8gdGhpcy5fbGluZVN1ZmZpeC52YWx1ZS5kZWx0YSh0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpKSA6IDA7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3ZlcndyaXRlQmVmb3JlOiBvdmVyd3JpdGVCZWZvcmUgKyBjb2x1bW5EZWx0YSxcblx0XHRcdG92ZXJ3cml0ZUFmdGVyOiBvdmVyd3JpdGVBZnRlciArIHN1ZmZpeERlbHRhXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2FsZXJ0Q29tcGxldGlvbkl0ZW0oaXRlbTogQ29tcGxldGlvbkl0ZW0pOiB2b2lkIHtcblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzKSkge1xuXHRcdFx0Y29uc3QgbXNnID0gbmxzLmxvY2FsaXplKCdhcmlhLmFsZXJ0LnNuaXBwZXQnLCBcIkFjY2VwdGluZyAnezB9JyBtYWRlIHsxfSBhZGRpdGlvbmFsIGVkaXRzXCIsIGl0ZW0udGV4dExhYmVsLCBpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5sZW5ndGgpO1xuXHRcdFx0YWxlcnQobXNnKTtcblx0XHR9XG5cdH1cblxuXHR0cmlnZ2VyU3VnZ2VzdChvbmx5RnJvbT86IFNldDxDb21wbGV0aW9uSXRlbVByb3ZpZGVyPiwgYXV0bz86IGJvb2xlYW4sIG5vRmlsdGVyPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLm1vZGVsLnRyaWdnZXIoe1xuXHRcdFx0XHRhdXRvOiBhdXRvID8/IGZhbHNlLFxuXHRcdFx0XHRjb21wbGV0aW9uT3B0aW9uczogeyBwcm92aWRlckZpbHRlcjogb25seUZyb20sIGtpbmRGaWx0ZXI6IG5vRmlsdGVyID8gbmV3IFNldCgpIDogdW5kZWZpbmVkIH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHR0cmlnZ2VyU3VnZ2VzdEFuZEFjY2VwdEJlc3QoYXJnOiB7IGZhbGxiYWNrOiBzdHJpbmcgfSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uTm93ID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblxuXHRcdGNvbnN0IGZhbGxiYWNrID0gKCkgPT4ge1xuXHRcdFx0aWYgKHBvc2l0aW9uTm93LmVxdWFscyh0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpISkpIHtcblx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYXJnLmZhbGxiYWNrKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFrZXNUZXh0RWRpdCA9IChpdGVtOiBDb21wbGV0aW9uSXRlbSk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0aWYgKGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0UnVsZXMhICYgQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQgfHwgaXRlbS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMpIHtcblx0XHRcdFx0Ly8gc25pcHBldCwgb3RoZXIgZWRpdG9yIC0+IG1ha2VzIGVkaXRcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhO1xuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBpdGVtLmVkaXRTdGFydC5jb2x1bW47XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHRpZiAoZW5kQ29sdW1uIC0gc3RhcnRDb2x1bW4gIT09IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0Lmxlbmd0aCkge1xuXHRcdFx0XHQvLyB1bmVxdWFsIGxlbmd0aHMgLT4gbWFrZXMgZWRpdFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHROb3cgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpIS5nZXRWYWx1ZUluUmFuZ2Uoe1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW5cblx0XHRcdH0pO1xuXHRcdFx0Ly8gdW5lcXVhbCB0ZXh0IC0+IG1ha2VzIGVkaXRcblx0XHRcdHJldHVybiB0ZXh0Tm93ICE9PSBpdGVtLmNvbXBsZXRpb24uaW5zZXJ0VGV4dDtcblx0XHR9O1xuXG5cdFx0RXZlbnQub25jZSh0aGlzLm1vZGVsLm9uRGlkVHJpZ2dlcikoXyA9PiB7XG5cdFx0XHQvLyB3YWl0IGZvciB0cmlnZ2VyIGJlY2F1c2Ugb25seSB0aGVuIHRoZSBjYW5jZWwtZXZlbnQgaXMgdHJ1c3R3b3J0aHlcblx0XHRcdGNvbnN0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0XHRcdEV2ZW50LmFueTx1bmtub3duPih0aGlzLm1vZGVsLm9uRGlkVHJpZ2dlciwgdGhpcy5tb2RlbC5vbkRpZENhbmNlbCkoKCkgPT4ge1xuXHRcdFx0XHQvLyByZXRyaWdnZXIgb3IgY2FuY2VsIC0+IHRyeSB0byB0eXBlIGRlZmF1bHQgdGV4dFxuXHRcdFx0XHRkaXNwb3NlKGxpc3RlbmVyKTtcblx0XHRcdFx0ZmFsbGJhY2soKTtcblx0XHRcdH0sIHVuZGVmaW5lZCwgbGlzdGVuZXIpO1xuXG5cdFx0XHR0aGlzLm1vZGVsLm9uRGlkU3VnZ2VzdCgoeyBjb21wbGV0aW9uTW9kZWwgfSkgPT4ge1xuXHRcdFx0XHRkaXNwb3NlKGxpc3RlbmVyKTtcblx0XHRcdFx0aWYgKGNvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRmYWxsYmFjaygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX21lbW9yeVNlcnZpY2Uuc2VsZWN0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLCB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpISwgY29tcGxldGlvbk1vZGVsLml0ZW1zKTtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IGNvbXBsZXRpb25Nb2RlbC5pdGVtc1tpbmRleF07XG5cdFx0XHRcdGlmICghbWFrZXNUZXh0RWRpdChpdGVtKSkge1xuXHRcdFx0XHRcdGZhbGxiYWNrKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR0aGlzLl9pbnNlcnRTdWdnZXN0aW9uKHsgaW5kZXgsIGl0ZW0sIG1vZGVsOiBjb21wbGV0aW9uTW9kZWwgfSwgSW5zZXJ0RmxhZ3MuS2VlcEFsdGVybmF0aXZlU3VnZ2VzdGlvbnMgfCBJbnNlcnRGbGFncy5Ob0JlZm9yZVVuZG9TdG9wIHwgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wKTtcblxuXHRcdFx0fSwgdW5kZWZpbmVkLCBsaXN0ZW5lcik7XG5cdFx0fSk7XG5cblx0XHR0aGlzLm1vZGVsLnRyaWdnZXIoeyBhdXRvOiBmYWxzZSwgc2h5OiB0cnVlIH0pO1xuXHRcdHRoaXMuZWRpdG9yLnJldmVhbFBvc2l0aW9uKHBvc2l0aW9uTm93LCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdGFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihrZWVwQWx0ZXJuYXRpdmVTdWdnZXN0aW9uczogYm9vbGVhbiwgYWx0ZXJuYXRpdmVPdmVyd3JpdGVDb25maWc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy53aWRnZXQudmFsdWUuZ2V0Rm9jdXNlZEl0ZW0oKTtcblx0XHRsZXQgZmxhZ3MgPSAwO1xuXHRcdGlmIChrZWVwQWx0ZXJuYXRpdmVTdWdnZXN0aW9ucykge1xuXHRcdFx0ZmxhZ3MgfD0gSW5zZXJ0RmxhZ3MuS2VlcEFsdGVybmF0aXZlU3VnZ2VzdGlvbnM7XG5cdFx0fVxuXHRcdGlmIChhbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZykge1xuXHRcdFx0ZmxhZ3MgfD0gSW5zZXJ0RmxhZ3MuQWx0ZXJuYXRpdmVPdmVyd3JpdGVDb25maWc7XG5cdFx0fVxuXHRcdHRoaXMuX2luc2VydFN1Z2dlc3Rpb24oaXRlbSwgZmxhZ3MpO1xuXHR9XG5cblx0YWNjZXB0TmV4dFN1Z2dlc3Rpb24oKSB7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVzLnZhbHVlLm5leHQoKTtcblx0fVxuXG5cdGFjY2VwdFByZXZTdWdnZXN0aW9uKCkge1xuXHRcdHRoaXMuX2FsdGVybmF0aXZlcy52YWx1ZS5wcmV2KCk7XG5cdH1cblxuXHRjYW5jZWxTdWdnZXN0V2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuY2FuY2VsKCk7XG5cdFx0dGhpcy5tb2RlbC5jbGVhcigpO1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLmhpZGVXaWRnZXQoKTtcblx0fVxuXG5cdGZvY3VzU3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5mb2N1c1NlbGVjdGVkKCk7XG5cdH1cblxuXHRzZWxlY3ROZXh0U3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5zZWxlY3ROZXh0KCk7XG5cdH1cblxuXHRzZWxlY3ROZXh0UGFnZVN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2VsZWN0TmV4dFBhZ2UoKTtcblx0fVxuXG5cdHNlbGVjdExhc3RTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnNlbGVjdExhc3QoKTtcblx0fVxuXG5cdHNlbGVjdFByZXZTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnNlbGVjdFByZXZpb3VzKCk7XG5cdH1cblxuXHRzZWxlY3RQcmV2UGFnZVN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2VsZWN0UHJldmlvdXNQYWdlKCk7XG5cdH1cblxuXHRzZWxlY3RGaXJzdFN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2VsZWN0Rmlyc3QoKTtcblx0fVxuXG5cdHRvZ2dsZVN1Z2dlc3Rpb25EZXRhaWxzKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnRvZ2dsZURldGFpbHMoKTtcblx0fVxuXG5cdHRvZ2dsZUV4cGxhaW5Nb2RlKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnRvZ2dsZUV4cGxhaW5Nb2RlKCk7XG5cdH1cblxuXHR0b2dnbGVTdWdnZXN0aW9uRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUudG9nZ2xlRGV0YWlsc0ZvY3VzKCk7XG5cdH1cblxuXHRyZXNldFdpZGdldFNpemUoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUucmVzZXRQZXJzaXN0ZWRTaXplKCk7XG5cdH1cblxuXHRmb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdGlmICh0aGlzLndpZGdldC5pc0luaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLndpZGdldC52YWx1ZS5mb3JjZVJlbmRlcmluZ0Fib3ZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIERlZmVyIHRoaXMgdW50aWwgdGhlIHdpZGdldCBpcyBjcmVhdGVkXG5cdFx0XHR0aGlzLl93YW50c0ZvcmNlUmVuZGVyaW5nQWJvdmUgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BGb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdGlmICh0aGlzLndpZGdldC5pc0luaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLndpZGdldC52YWx1ZS5zdG9wRm9yY2VSZW5kZXJpbmdBYm92ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93YW50c0ZvcmNlUmVuZGVyaW5nQWJvdmUgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclNlbGVjdG9yKHNlbGVjdG9yOiBJU3VnZ2VzdEl0ZW1QcmVzZWxlY3Rvcik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0b3JzLnJlZ2lzdGVyKHNlbGVjdG9yKTtcblx0fVxufVxuXG5jbGFzcyBQcmlvcml0eVJlZ2lzdHJ5PFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbXMgPSBuZXcgQXJyYXk8VD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHByaW9yaXR5U2VsZWN0b3I6IChpdGVtOiBUKSA9PiBudW1iZXIpIHsgfVxuXG5cdHJlZ2lzdGVyKHZhbHVlOiBUKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9pdGVtcy5pbmRleE9mKHZhbHVlKSAhPT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVmFsdWUgaXMgYWxyZWFkeSByZWdpc3RlcmVkJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2l0ZW1zLnB1c2godmFsdWUpO1xuXHRcdHRoaXMuX2l0ZW1zLnNvcnQoKHMxLCBzMikgPT4gdGhpcy5wcmlvcml0eVNlbGVjdG9yKHMyKSAtIHRoaXMucHJpb3JpdHlTZWxlY3RvcihzMSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5faXRlbXMuaW5kZXhPZih2YWx1ZSk7XG5cdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2l0ZW1zLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGdldCBpdGVtc09yZGVyZWRCeVByaW9yaXR5RGVzYygpOiByZWFkb25seSBUW10ge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtcztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHJpZ2dlclN1Z2dlc3RBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdlZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVHJpZ2dlclN1Z2dlc3RBY3Rpb24uaWQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc3VnZ2VzdC50cmlnZ2VyLmxhYmVsJywgXCJUcmlnZ2VyIFN1Z2dlc3RcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSwgRWRpdG9yQ29udGV4dEtleXMuaGFzQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgU3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSksXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SV0sXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuU3BhY2UsIHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkVzY2FwZSwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUldIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFN1Z2dlc3RDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHlwZSBUcmlnZ2VyQXJncyA9IHsgYXV0bzogYm9vbGVhbiB9O1xuXHRcdGxldCBhdXRvOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhcmdzICYmIHR5cGVvZiBhcmdzID09PSAnb2JqZWN0Jykge1xuXHRcdFx0aWYgKCg8VHJpZ2dlckFyZ3M+YXJncykuYXV0byA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRhdXRvID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb250cm9sbGVyLnRyaWdnZXJTdWdnZXN0KHVuZGVmaW5lZCwgYXV0bywgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihTdWdnZXN0Q29udHJvbGxlci5JRCwgU3VnZ2VzdENvbnRyb2xsZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQmVmb3JlRmlyc3RJbnRlcmFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUcmlnZ2VyU3VnZ2VzdEFjdGlvbik7XG5cbmNvbnN0IHdlaWdodCA9IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDkwO1xuXG5jb25zdCBTdWdnZXN0Q29tbWFuZCA9IEVkaXRvckNvbW1hbmQuYmluZFRvQ29udHJpYnV0aW9uPFN1Z2dlc3RDb250cm9sbGVyPihTdWdnZXN0Q29udHJvbGxlci5nZXQpO1xuXG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2FjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uKSxcblx0aGFuZGxlcih4KSB7XG5cdFx0eC5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24odHJ1ZSwgZmFsc2UpO1xuXHR9LFxuXHRrYk9wdHM6IFt7XG5cdFx0Ly8gbm9ybWFsIHRhYlxuXHRcdHByaW1hcnk6IEtleUNvZGUuVGFiLFxuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzKSxcblx0XHR3ZWlnaHQsXG5cdH0sIHtcblx0XHQvLyBhY2NlcHQgb24gZW50ZXIgaGFzIHNwZWNpYWwgcnVsZXNcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBTdWdnZXN0Q29udGV4dC5BY2NlcHRTdWdnZXN0aW9uc09uRW50ZXIsIFN1Z2dlc3RDb250ZXh0Lk1ha2VzVGV4dEVkaXQpLFxuXHRcdHdlaWdodCxcblx0fV0sXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0Lmluc2VydCcsIFwiSW5zZXJ0XCIpLFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLCBTdWdnZXN0Q29udGV4dC5IYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UudG9OZWdhdGVkKCkpXG5cdH0sIHtcblx0XHRtZW51SWQ6IHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjY2VwdC5pbnNlcnQnLCBcIkluc2VydFwiKSxcblx0XHRncm91cDogJ2xlZnQnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbiwgU3VnZ2VzdENvbnRleHQuSGFzSW5zZXJ0QW5kUmVwbGFjZVJhbmdlLCBTdWdnZXN0Q29udGV4dC5JbnNlcnRNb2RlLmlzRXF1YWxUbygnaW5zZXJ0JykpXG5cdH0sIHtcblx0XHRtZW51SWQ6IHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2FjY2VwdC5yZXBsYWNlJywgXCJSZXBsYWNlXCIpLFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLCBTdWdnZXN0Q29udGV4dC5IYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UsIFN1Z2dlc3RDb250ZXh0Lkluc2VydE1vZGUuaXNFcXVhbFRvKCdyZXBsYWNlJykpXG5cdH1dXG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2FjY2VwdEFsdGVybmF0aXZlU2VsZWN0ZWRTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXSxcblx0fSxcblx0aGFuZGxlcih4KSB7XG5cdFx0eC5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24oZmFsc2UsIHRydWUpO1xuXHR9LFxuXHRtZW51T3B0czogW3tcblx0XHRtZW51SWQ6IHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDIsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLCBTdWdnZXN0Q29udGV4dC5IYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UsIFN1Z2dlc3RDb250ZXh0Lkluc2VydE1vZGUuaXNFcXVhbFRvKCdpbnNlcnQnKSksXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0LnJlcGxhY2UnLCBcIlJlcGxhY2VcIilcblx0fSwge1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0Z3JvdXA6ICdsZWZ0Jyxcblx0XHRvcmRlcjogMixcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24sIFN1Z2dlc3RDb250ZXh0Lkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZSwgU3VnZ2VzdENvbnRleHQuSW5zZXJ0TW9kZS5pc0VxdWFsVG8oJ3JlcGxhY2UnKSksXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0Lmluc2VydCcsIFwiSW5zZXJ0XCIpXG5cdH1dXG59KSk7XG5cblxuLy8gY29udGludWUgdG8gc3VwcG9ydCB0aGUgb2xkIGNvbW1hbmRcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQWxpYXMoJ2FjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbk9uRW50ZXInLCAnYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uJyk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2hpZGVTdWdnZXN0V2lkZ2V0Jyxcblx0cHJlY29uZGl0aW9uOiBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLFxuXHRoYW5kbGVyOiB4ID0+IHguY2FuY2VsU3VnZ2VzdFdpZGdldCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ3NlbGVjdE5leHRTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgQ29udGV4dEtleUV4cHIub3IoU3VnZ2VzdENvbnRleHQuTXVsdGlwbGVTdWdnZXN0aW9ucywgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpKSxcblx0aGFuZGxlcjogYyA9PiBjLnNlbGVjdE5leHRTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5Tl0gfVxuXHR9LFxuXHRtZW51T3B0czoge1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0Z3JvdXA6ICdsZWZ0Jyxcblx0XHRvcmRlcjogMCxcblx0XHR3aGVuOiBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi50b05lZ2F0ZWQoKSxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdmb2N1cy5zdWdnZXN0aW9uJywgXCJTZWxlY3RcIilcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdzZWxlY3ROZXh0UGFnZVN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBDb250ZXh0S2V5RXhwci5vcihTdWdnZXN0Q29udGV4dC5NdWx0aXBsZVN1Z2dlc3Rpb25zLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSkpLFxuXHRoYW5kbGVyOiBjID0+IGMuc2VsZWN0TmV4dFBhZ2VTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlRG93bixcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd25dXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnc2VsZWN0TGFzdFN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBDb250ZXh0S2V5RXhwci5vcihTdWdnZXN0Q29udGV4dC5NdWx0aXBsZVN1Z2dlc3Rpb25zLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSkpLFxuXHRoYW5kbGVyOiBjID0+IGMuc2VsZWN0TGFzdFN1Z2dlc3Rpb24oKVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdzZWxlY3RQcmV2U3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIENvbnRleHRLZXlFeHByLm9yKFN1Z2dlc3RDb250ZXh0Lk11bHRpcGxlU3VnZ2VzdGlvbnMsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLm5lZ2F0ZSgpKSksXG5cdGhhbmRsZXI6IGMgPT4gYy5zZWxlY3RQcmV2U3VnZ2VzdGlvbigpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvd10sXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdywgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csIEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlQXSB9XG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnc2VsZWN0UHJldlBhZ2VTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgQ29udGV4dEtleUV4cHIub3IoU3VnZ2VzdENvbnRleHQuTXVsdGlwbGVTdWdnZXN0aW9ucywgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpKSxcblx0aGFuZGxlcjogYyA9PiBjLnNlbGVjdFByZXZQYWdlU3VnZ2VzdGlvbigpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXBdXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnc2VsZWN0Rmlyc3RTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgQ29udGV4dEtleUV4cHIub3IoU3VnZ2VzdENvbnRleHQuTXVsdGlwbGVTdWdnZXN0aW9ucywgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpKSxcblx0aGFuZGxlcjogYyA9PiBjLnNlbGVjdEZpcnN0U3VnZ2VzdGlvbigpXG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2ZvY3VzU3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLm5lZ2F0ZSgpKSxcblx0aGFuZGxlcjogeCA9PiB4LmZvY3VzU3VnZ2VzdGlvbigpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TcGFjZSxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SV0sXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5TcGFjZSwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUldIH1cblx0fSxcbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnZm9jdXNBbmRBY2NlcHRTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpLFxuXHRoYW5kbGVyOiBjID0+IHtcblx0XHRjLmZvY3VzU3VnZ2VzdGlvbigpO1xuXHRcdGMuYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKHRydWUsIGZhbHNlKTtcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICd0b2dnbGVTdWdnZXN0aW9uRGV0YWlscycsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uKSxcblx0aGFuZGxlcjogeCA9PiB4LnRvZ2dsZVN1Z2dlc3Rpb25EZXRhaWxzKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlNwYWNlLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SV0gfVxuXHR9LFxuXHRtZW51T3B0czogW3tcblx0XHRtZW51SWQ6IHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LFxuXHRcdGdyb3VwOiAncmlnaHQnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5EZXRhaWxzVmlzaWJsZSwgU3VnZ2VzdENvbnRleHQuQ2FuUmVzb2x2ZSksXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZGV0YWlsLm1vcmUnLCBcIlNob3cgTGVzc1wiKVxuXHR9LCB7XG5cdFx0bWVudUlkOiBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSxcblx0XHRncm91cDogJ3JpZ2h0Jyxcblx0XHRvcmRlcjogMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuRGV0YWlsc1Zpc2libGUudG9OZWdhdGVkKCksIFN1Z2dlc3RDb250ZXh0LkNhblJlc29sdmUpLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2RldGFpbC5sZXNzJywgXCJTaG93IE1vcmVcIilcblx0fV1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAndG9nZ2xlRXhwbGFpbk1vZGUnLFxuXHRwcmVjb25kaXRpb246IFN1Z2dlc3RDb250ZXh0LlZpc2libGUsXG5cdGhhbmRsZXI6IHggPT4geC50b2dnbGVFeHBsYWluTW9kZSgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gsXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAndG9nZ2xlU3VnZ2VzdGlvbkZvY3VzJyxcblx0cHJlY29uZGl0aW9uOiBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlU3VnZ2VzdGlvbkZvY3VzKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5TcGFjZSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5TcGFjZSB9XG5cdH1cbn0pKTtcblxuLy8jcmVnaW9uIHRhYiBjb21wbGV0aW9uc1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdpbnNlcnRCZXN0Q29tcGxldGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmVkaXRvci50YWJDb21wbGV0aW9uJywgJ29uJyksXG5cdFx0V29yZENvbnRleHRLZXkuQXRFbmQsXG5cdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSxcblx0XHRTdWdnZXN0QWx0ZXJuYXRpdmVzLk90aGVyU3VnZ2VzdGlvbnMudG9OZWdhdGVkKCksXG5cdFx0U25pcHBldENvbnRyb2xsZXIyLkluU25pcHBldE1vZGUudG9OZWdhdGVkKClcblx0KSxcblx0aGFuZGxlcjogKHgsIGFyZykgPT4ge1xuXG5cdFx0eC50cmlnZ2VyU3VnZ2VzdEFuZEFjY2VwdEJlc3QoaXNPYmplY3QoYXJnKSA/IHsgZmFsbGJhY2s6ICd0YWInLCAuLi5hcmcgfSA6IHsgZmFsbGJhY2s6ICd0YWInIH0pO1xuXHR9LFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5UYWJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdpbnNlcnROZXh0U3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmVkaXRvci50YWJDb21wbGV0aW9uJywgJ29uJyksXG5cdFx0U3VnZ2VzdEFsdGVybmF0aXZlcy5PdGhlclN1Z2dlc3Rpb25zLFxuXHRcdFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0U25pcHBldENvbnRyb2xsZXIyLkluU25pcHBldE1vZGUudG9OZWdhdGVkKClcblx0KSxcblx0aGFuZGxlcjogeCA9PiB4LmFjY2VwdE5leHRTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5UYWJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdpbnNlcnRQcmV2U3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmVkaXRvci50YWJDb21wbGV0aW9uJywgJ29uJyksXG5cdFx0U3VnZ2VzdEFsdGVybmF0aXZlcy5PdGhlclN1Z2dlc3Rpb25zLFxuXHRcdFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0U25pcHBldENvbnRyb2xsZXIyLkluU25pcHBldE1vZGUudG9OZWdhdGVkKClcblx0KSxcblx0aGFuZGxlcjogeCA9PiB4LmFjY2VwdFByZXZTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWJcblx0fVxufSkpO1xuXG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzdWdnZXN0V2lkZ2V0Q29weScsXG5cdFx0XHRwcmVjb25kaXRpb246IFN1Z2dlc3RDb250ZXh0LkRldGFpbHNGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdHdlaWdodDogd2VpZ2h0ICsgMTAsXG5cdFx0XHRcdGtiRXhwcjogU3VnZ2VzdENvbnRleHQuRGV0YWlsc0ZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5JbnNlcnRdIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW5FZGl0b3JDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGdldFdpbmRvdyhlZGl0b3IuZ2V0RG9tTm9kZSgpKS5kb2N1bWVudC5leGVjQ29tbWFuZCgnY29weScpO1xuXHR9XG59KCkpO1xuXG5yZWdpc3RlckVkaXRvckFjdGlvbihjbGFzcyBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnJlc2V0U3VnZ2VzdFNpemUnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3N1Z2dlc3QucmVzZXQubGFiZWwnLCBcIlJlc2V0IFN1Z2dlc3QgV2lkZ2V0IFNpemVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdFN1Z2dlc3RDb250cm9sbGVyLmdldChlZGl0b3IpPy5yZXNldFdpZGdldFNpemUoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQixpQ0FB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
