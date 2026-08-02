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
import { disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { FuzzyScoreOptions } from "../../../../base/common/filters.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { getLeadingWhitespace, isHighSurrogate, isLowSurrogate } from "../../../../base/common/strings.js";
import { assertType } from "../../../../base/common/types.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Selection } from "../../../common/core/selection.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { CompletionItemKind, CompletionTriggerKind } from "../../../common/languages.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { getInlineCompletionsController } from "../../inlineCompletions/browser/controller/common.js";
import { InlineCompletionContextKeys } from "../../inlineCompletions/browser/controller/inlineCompletionContextKeys.js";
import { SnippetController2 } from "../../snippet/browser/snippetController2.js";
import { CompletionModel } from "./completionModel.js";
import { CompletionOptions, getSnippetSuggestSupport, provideSuggestionItems, QuickSuggestionsOptions, SnippetSortOrder } from "./suggest.js";
import { WordDistance } from "./wordDistance.js";
class LineContext {
  static shouldAutoTrigger(editor) {
    if (!editor.hasModel()) {
      return false;
    }
    const model = editor.getModel();
    const pos = editor.getPosition();
    model.tokenization.tokenizeIfCheap(pos.lineNumber);
    const word = model.getWordAtPosition(pos);
    if (!word) {
      return false;
    }
    if (word.endColumn !== pos.column && word.startColumn + 1 !== pos.column) {
      return false;
    }
    if (!isNaN(Number(word.word))) {
      return false;
    }
    return true;
  }
  constructor(model, position, triggerOptions) {
    this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
    this.leadingWord = model.getWordUntilPosition(position);
    this.lineNumber = position.lineNumber;
    this.column = position.column;
    this.triggerOptions = triggerOptions;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Idle"] = 0] = "Idle";
  State2[State2["Manual"] = 1] = "Manual";
  State2[State2["Auto"] = 2] = "Auto";
  return State2;
})(State || {});
function canShowQuickSuggest(editor, contextKeyService, configurationService) {
  if (!Boolean(contextKeyService.getContextKeyValue(InlineCompletionContextKeys.inlineSuggestionVisible.key))) {
    return true;
  }
  const suppressSuggestions = contextKeyService.getContextKeyValue(InlineCompletionContextKeys.suppressSuggestions.key);
  if (suppressSuggestions !== void 0) {
    return !suppressSuggestions;
  }
  return !editor.getOption(EditorOption.inlineSuggest).suppressSuggestions;
}
function canShowSuggestOnTriggerCharacters(editor, contextKeyService, configurationService) {
  if (!Boolean(contextKeyService.getContextKeyValue("inlineSuggestionVisible"))) {
    return true;
  }
  const suppressSuggestions = contextKeyService.getContextKeyValue(InlineCompletionContextKeys.suppressSuggestions.key);
  if (suppressSuggestions !== void 0) {
    return !suppressSuggestions;
  }
  return !editor.getOption(EditorOption.inlineSuggest).suppressSuggestions;
}
let SuggestModel = class {
  constructor(_editor, _editorWorkerService, _clipboardService, _telemetryService, _logService, _contextKeyService, _configurationService, _languageFeaturesService, _envService) {
    this._editor = _editor;
    this._editorWorkerService = _editorWorkerService;
    this._clipboardService = _clipboardService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._envService = _envService;
    this._toDispose = new DisposableStore();
    this._triggerCharacterListener = new DisposableStore();
    this._triggerQuickSuggest = new TimeoutTimer();
    this._triggerState = void 0;
    this._completionDisposables = new DisposableStore();
    this._onDidCancel = new Emitter();
    this._onDidTrigger = new Emitter();
    this._onDidSuggest = new Emitter();
    this.onDidCancel = this._onDidCancel.event;
    this.onDidTrigger = this._onDidTrigger.event;
    this.onDidSuggest = this._onDidSuggest.event;
    this._currentSelection = this._editor.getSelection() || new Selection(1, 1, 1, 1);
    this._toDispose.add(this._editor.onDidChangeModel(() => {
      this._updateTriggerCharacters();
      this.cancel();
    }));
    this._toDispose.add(this._editor.onDidChangeModelLanguage(() => {
      this._updateTriggerCharacters();
      this.cancel();
    }));
    this._toDispose.add(this._editor.onDidChangeConfiguration(() => {
      this._updateTriggerCharacters();
    }));
    this._toDispose.add(this._languageFeaturesService.completionProvider.onDidChange(() => {
      this._updateTriggerCharacters();
      this._updateActiveSuggestSession();
    }));
    let editorIsComposing = false;
    this._toDispose.add(this._editor.onDidCompositionStart(() => {
      editorIsComposing = true;
    }));
    this._toDispose.add(this._editor.onDidCompositionEnd(() => {
      editorIsComposing = false;
      this._onCompositionEnd();
    }));
    this._toDispose.add(this._editor.onDidChangeCursorSelection((e) => {
      if (!editorIsComposing) {
        this._onCursorChange(e);
      }
    }));
    this._toDispose.add(this._editor.onDidChangeModelContent(() => {
      if (!editorIsComposing && this._triggerState !== void 0) {
        this._refilterCompletionItems();
      }
    }));
    this._updateTriggerCharacters();
  }
  dispose() {
    dispose(this._triggerCharacterListener);
    dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this._triggerQuickSuggest]);
    this._waitForInlineCompletions?.dispose();
    this._toDispose.dispose();
    this._completionDisposables.dispose();
    this.cancel();
  }
  _updateTriggerCharacters() {
    this._triggerCharacterListener.clear();
    if (this._editor.getOption(EditorOption.readOnly) || !this._editor.hasModel() || !this._editor.getOption(EditorOption.suggestOnTriggerCharacters)) {
      return;
    }
    const supportsByTriggerCharacter = /* @__PURE__ */ new Map();
    for (const support of this._languageFeaturesService.completionProvider.all(this._editor.getModel())) {
      for (const ch of support.triggerCharacters || []) {
        let set = supportsByTriggerCharacter.get(ch);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          const suggestSupport = getSnippetSuggestSupport();
          if (suggestSupport) {
            set.add(suggestSupport);
          }
          supportsByTriggerCharacter.set(ch, set);
        }
        set.add(support);
      }
    }
    const checkTriggerCharacter = (text) => {
      if (!canShowSuggestOnTriggerCharacters(this._editor, this._contextKeyService, this._configurationService)) {
        return;
      }
      if (LineContext.shouldAutoTrigger(this._editor)) {
        return;
      }
      if (!text) {
        const position = this._editor.getPosition();
        const model = this._editor.getModel();
        text = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
      }
      let lastChar = "";
      if (isLowSurrogate(text.charCodeAt(text.length - 1))) {
        if (isHighSurrogate(text.charCodeAt(text.length - 2))) {
          lastChar = text.substr(text.length - 2);
        }
      } else {
        lastChar = text.charAt(text.length - 1);
      }
      const supports = supportsByTriggerCharacter.get(lastChar);
      if (supports) {
        const providerItemsToReuse = /* @__PURE__ */ new Map();
        if (this._completionModel) {
          for (const [provider, items] of this._completionModel.getItemsByProvider()) {
            if (!supports.has(provider)) {
              providerItemsToReuse.set(provider, items);
            }
          }
        }
        this.trigger({
          auto: true,
          triggerKind: CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: lastChar,
          retrigger: Boolean(this._completionModel),
          clipboardText: this._completionModel?.clipboardText,
          completionOptions: { providerFilter: supports, providerItemsToReuse }
        });
      }
    };
    this._triggerCharacterListener.add(this._editor.onDidType(checkTriggerCharacter));
    this._triggerCharacterListener.add(this._editor.onDidCompositionEnd(() => checkTriggerCharacter()));
  }
  // --- trigger/retrigger/cancel suggest
  get state() {
    if (!this._triggerState) {
      return 0 /* Idle */;
    } else if (!this._triggerState.auto) {
      return 1 /* Manual */;
    } else {
      return 2 /* Auto */;
    }
  }
  cancel(retrigger = false) {
    this._triggerQuickSuggest.cancel();
    this._waitForInlineCompletions?.dispose();
    this._waitForInlineCompletions = void 0;
    if (this._triggerState !== void 0) {
      this._requestToken?.cancel();
      this._requestToken = void 0;
      this._triggerState = void 0;
      this._completionModel = void 0;
      this._context = void 0;
      this._onDidCancel.fire({ retrigger });
    }
  }
  clear() {
    this._completionDisposables.clear();
  }
  _updateActiveSuggestSession() {
    if (this._triggerState !== void 0) {
      if (!this._editor.hasModel() || !this._languageFeaturesService.completionProvider.has(this._editor.getModel())) {
        this.cancel();
      } else {
        this.trigger({ auto: this._triggerState.auto, retrigger: true });
      }
    }
  }
  _onCursorChange(e) {
    if (!this._editor.hasModel()) {
      return;
    }
    const prevSelection = this._currentSelection;
    this._currentSelection = this._editor.getSelection();
    if (!e.selection.isEmpty() || e.reason !== CursorChangeReason.NotSet && e.reason !== CursorChangeReason.Explicit || e.source !== "keyboard" && e.source !== "deleteLeft") {
      this.cancel();
      return;
    }
    if (this._triggerState === void 0 && e.reason === CursorChangeReason.NotSet) {
      if (prevSelection.containsRange(this._currentSelection) || prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition())) {
        this._doTriggerQuickSuggest();
      }
    } else if (this._triggerState !== void 0 && e.reason === CursorChangeReason.Explicit) {
      this._refilterCompletionItems();
    }
  }
  _onCompositionEnd() {
    if (this._triggerState === void 0) {
      this._doTriggerQuickSuggest();
    } else {
      this._refilterCompletionItems();
    }
  }
  _doTriggerQuickSuggest() {
    if (QuickSuggestionsOptions.isAllOff(this._editor.getOption(EditorOption.quickSuggestions))) {
      return;
    }
    if (this._editor.getOption(EditorOption.suggest).snippetsPreventQuickSuggestions && SnippetController2.get(this._editor)?.isInSnippet()) {
      return;
    }
    this.cancel();
    this._waitForInlineCompletions?.dispose();
    this._waitForInlineCompletions = void 0;
    this._triggerQuickSuggest.cancelAndSet(() => {
      if (this._triggerState !== void 0) {
        return;
      }
      if (!LineContext.shouldAutoTrigger(this._editor)) {
        return;
      }
      if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
        return;
      }
      const model = this._editor.getModel();
      const pos = this._editor.getPosition();
      const config = this._editor.getOption(EditorOption.quickSuggestions);
      if (QuickSuggestionsOptions.isAllOff(config)) {
        return;
      }
      let waitForInlineCompletions = false;
      if (!QuickSuggestionsOptions.isAllOn(config)) {
        model.tokenization.tokenizeIfCheap(pos.lineNumber);
        const lineTokens = model.tokenization.getLineTokens(pos.lineNumber);
        const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(pos.column - 1 - 1, 0)));
        const value = QuickSuggestionsOptions.valueFor(config, tokenType);
        if (value === "off" || value === "inline") {
          return;
        }
        if (value === "offWhenInlineCompletions") {
          waitForInlineCompletions = this._languageFeaturesService.inlineCompletionsProvider.has(model) && this._editor.getOption(EditorOption.inlineSuggest).enabled;
        }
      }
      if (!canShowQuickSuggest(this._editor, this._contextKeyService, this._configurationService)) {
        return;
      }
      if (!this._languageFeaturesService.completionProvider.has(model)) {
        return;
      }
      if (waitForInlineCompletions) {
        this._waitForInlineCompletionsAndTrigger(model, pos);
      } else {
        this.trigger({ auto: true });
      }
    }, this._editor.getOption(EditorOption.quickSuggestionsDelay));
  }
  _waitForInlineCompletionsAndTrigger(initialModel, initialPosition) {
    const initialModelVersion = initialModel.getVersionId();
    const inlineController = getInlineCompletionsController(this._editor);
    const inlineModel = inlineController?.model.get();
    if (!inlineController || !inlineModel) {
      this.trigger({ auto: true });
      return;
    }
    const state = inlineModel.state.get();
    if (state?.inlineSuggestion) {
      return;
    }
    const store = new DisposableStore();
    this._waitForInlineCompletions = store;
    const triggerAndCleanUp = (doTrigger) => {
      store.dispose();
      if (this._waitForInlineCompletions === store) {
        this._waitForInlineCompletions = void 0;
      }
      if (this._triggerState !== void 0) {
        return;
      }
      if (!doTrigger) {
        return;
      }
      const currentModel = this._editor.getModel();
      const currentPosition = this._editor.getPosition();
      if (currentModel === initialModel && currentModel.getVersionId() === initialModelVersion && currentPosition?.equals(initialPosition) && this._editor.hasWidgetFocus()) {
        this.trigger({ auto: true });
      }
    };
    disposableTimeout(() => {
      triggerAndCleanUp(true);
      inlineModel.stop("automatic");
    }, 750, store);
    store.add(autorun((reader) => {
      const currentInlineModel = inlineController.model.read(reader);
      if (currentInlineModel !== inlineModel) {
        triggerAndCleanUp(false);
        return;
      }
      const status = inlineModel.status.read(reader);
      const currentState = inlineModel.state.read(reader);
      if (!currentState && status === "loading") {
        return;
      }
      triggerAndCleanUp(!currentState);
    }));
  }
  _refilterCompletionItems() {
    assertType(this._editor.hasModel());
    assertType(this._triggerState !== void 0);
    const model = this._editor.getModel();
    const position = this._editor.getPosition();
    const ctx = new LineContext(model, position, { ...this._triggerState, refilter: true });
    this._onNewContext(ctx);
  }
  trigger(options) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const ctx = new LineContext(model, this._editor.getPosition(), options);
    this.cancel(options.retrigger);
    this._triggerState = options;
    this._onDidTrigger.fire({ auto: options.auto, shy: options.shy ?? false, position: this._editor.getPosition() });
    this._context = ctx;
    let suggestCtx = { triggerKind: options.triggerKind ?? CompletionTriggerKind.Invoke };
    if (options.triggerCharacter) {
      suggestCtx = {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: options.triggerCharacter
      };
    }
    this._requestToken = new CancellationTokenSource();
    const snippetSuggestions = this._editor.getOption(EditorOption.snippetSuggestions);
    let snippetSortOrder = SnippetSortOrder.Inline;
    switch (snippetSuggestions) {
      case "top":
        snippetSortOrder = SnippetSortOrder.Top;
        break;
      // 	↓ that's the default anyways...
      // case 'inline':
      // 	snippetSortOrder = SnippetSortOrder.Inline;
      // 	break;
      case "bottom":
        snippetSortOrder = SnippetSortOrder.Bottom;
        break;
    }
    const { itemKind: itemKindFilter, showDeprecated } = SuggestModel.createSuggestFilter(this._editor);
    const completionOptions = new CompletionOptions(snippetSortOrder, options.completionOptions?.kindFilter ?? itemKindFilter, options.completionOptions?.providerFilter, options.completionOptions?.providerItemsToReuse, showDeprecated);
    const wordDistance = WordDistance.create(this._editorWorkerService, this._editor);
    const completions = provideSuggestionItems(
      this._languageFeaturesService.completionProvider,
      model,
      this._editor.getPosition(),
      completionOptions,
      suggestCtx,
      this._requestToken.token
    );
    Promise.all([completions, wordDistance]).then(async ([completions2, wordDistance2]) => {
      this._requestToken?.dispose();
      if (!this._editor.hasModel()) {
        completions2.disposable.dispose();
        return;
      }
      let clipboardText = options?.clipboardText;
      if (!clipboardText && completions2.needsClipboard) {
        clipboardText = await this._clipboardService.readText();
      }
      if (this._triggerState === void 0) {
        completions2.disposable.dispose();
        return;
      }
      const model2 = this._editor.getModel();
      const ctx2 = new LineContext(model2, this._editor.getPosition(), options);
      const fuzzySearchOptions = {
        ...FuzzyScoreOptions.default,
        firstMatchCanBeWeak: !this._editor.getOption(EditorOption.suggest).matchOnWordStartOnly
      };
      this._completionModel = new CompletionModel(
        completions2.items,
        this._context.column,
        {
          leadingLineContent: ctx2.leadingLineContent,
          characterCountDelta: ctx2.column - this._context.column
        },
        wordDistance2,
        this._editor.getOption(EditorOption.suggest),
        this._editor.getOption(EditorOption.snippetSuggestions),
        fuzzySearchOptions,
        clipboardText
      );
      this._completionDisposables.add(completions2.disposable);
      this._onNewContext(ctx2);
      this._reportDurationsTelemetry(completions2.durations);
      if (!this._envService.isBuilt || this._envService.isExtensionDevelopment) {
        for (const item of completions2.items) {
          if (item.isInvalid) {
            this._logService.warn(`[suggest] did IGNORE invalid completion item from ${item.provider._debugDisplayName}`, item.completion);
          }
        }
      }
    }).catch(onUnexpectedError);
  }
  /**
   * Report durations telemetry with a 1% sampling rate.
   * The telemetry is reported only if a random number between 0 and 100 is less than or equal to 1.
   */
  _reportDurationsTelemetry(durations) {
    if (Math.random() > 1e-4) {
      return;
    }
    setTimeout(() => {
      this._telemetryService.publicLog2("suggest.durations.json", { data: JSON.stringify(durations) });
      this._logService.debug("suggest.durations.json", durations);
    });
  }
  static createSuggestFilter(editor) {
    const result = /* @__PURE__ */ new Set();
    const snippetSuggestions = editor.getOption(EditorOption.snippetSuggestions);
    if (snippetSuggestions === "none") {
      result.add(CompletionItemKind.Snippet);
    }
    const suggestOptions = editor.getOption(EditorOption.suggest);
    if (!suggestOptions.showMethods) {
      result.add(CompletionItemKind.Method);
    }
    if (!suggestOptions.showFunctions) {
      result.add(CompletionItemKind.Function);
    }
    if (!suggestOptions.showConstructors) {
      result.add(CompletionItemKind.Constructor);
    }
    if (!suggestOptions.showFields) {
      result.add(CompletionItemKind.Field);
    }
    if (!suggestOptions.showVariables) {
      result.add(CompletionItemKind.Variable);
    }
    if (!suggestOptions.showClasses) {
      result.add(CompletionItemKind.Class);
    }
    if (!suggestOptions.showStructs) {
      result.add(CompletionItemKind.Struct);
    }
    if (!suggestOptions.showInterfaces) {
      result.add(CompletionItemKind.Interface);
    }
    if (!suggestOptions.showModules) {
      result.add(CompletionItemKind.Module);
    }
    if (!suggestOptions.showProperties) {
      result.add(CompletionItemKind.Property);
    }
    if (!suggestOptions.showEvents) {
      result.add(CompletionItemKind.Event);
    }
    if (!suggestOptions.showOperators) {
      result.add(CompletionItemKind.Operator);
    }
    if (!suggestOptions.showUnits) {
      result.add(CompletionItemKind.Unit);
    }
    if (!suggestOptions.showValues) {
      result.add(CompletionItemKind.Value);
    }
    if (!suggestOptions.showConstants) {
      result.add(CompletionItemKind.Constant);
    }
    if (!suggestOptions.showEnums) {
      result.add(CompletionItemKind.Enum);
    }
    if (!suggestOptions.showEnumMembers) {
      result.add(CompletionItemKind.EnumMember);
    }
    if (!suggestOptions.showKeywords) {
      result.add(CompletionItemKind.Keyword);
    }
    if (!suggestOptions.showWords) {
      result.add(CompletionItemKind.Text);
    }
    if (!suggestOptions.showColors) {
      result.add(CompletionItemKind.Color);
    }
    if (!suggestOptions.showFiles) {
      result.add(CompletionItemKind.File);
    }
    if (!suggestOptions.showReferences) {
      result.add(CompletionItemKind.Reference);
    }
    if (!suggestOptions.showColors) {
      result.add(CompletionItemKind.Customcolor);
    }
    if (!suggestOptions.showFolders) {
      result.add(CompletionItemKind.Folder);
    }
    if (!suggestOptions.showTypeParameters) {
      result.add(CompletionItemKind.TypeParameter);
    }
    if (!suggestOptions.showSnippets) {
      result.add(CompletionItemKind.Snippet);
    }
    if (!suggestOptions.showUsers) {
      result.add(CompletionItemKind.User);
    }
    if (!suggestOptions.showIssues) {
      result.add(CompletionItemKind.Issue);
    }
    return { itemKind: result, showDeprecated: suggestOptions.showDeprecated };
  }
  _onNewContext(ctx) {
    if (!this._context) {
      return;
    }
    if (ctx.lineNumber !== this._context.lineNumber) {
      this.cancel();
      return;
    }
    if (getLeadingWhitespace(ctx.leadingLineContent) !== getLeadingWhitespace(this._context.leadingLineContent)) {
      this.cancel();
      return;
    }
    if (ctx.column < this._context.column) {
      if (ctx.leadingWord.word) {
        this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true });
      } else {
        this.cancel();
      }
      return;
    }
    if (!this._completionModel) {
      return;
    }
    if (ctx.leadingWord.word.length !== 0 && ctx.leadingWord.startColumn > this._context.leadingWord.startColumn) {
      const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor);
      if (shouldAutoTrigger && this._context) {
        const map = this._completionModel.getItemsByProvider();
        this.trigger({
          auto: this._context.triggerOptions.auto,
          retrigger: true,
          clipboardText: this._completionModel.clipboardText,
          completionOptions: { providerItemsToReuse: map }
        });
      }
      return;
    }
    if (ctx.column > this._context.column && this._completionModel.getIncompleteProvider().size > 0 && ctx.leadingWord.word.length !== 0) {
      const providerItemsToReuse = /* @__PURE__ */ new Map();
      const providerFilter = /* @__PURE__ */ new Set();
      for (const [provider, items] of this._completionModel.getItemsByProvider()) {
        if (items.length > 0 && items[0].container.incomplete) {
          providerFilter.add(provider);
        } else {
          providerItemsToReuse.set(provider, items);
        }
      }
      this.trigger({
        auto: this._context.triggerOptions.auto,
        triggerKind: CompletionTriggerKind.TriggerForIncompleteCompletions,
        retrigger: true,
        clipboardText: this._completionModel.clipboardText,
        completionOptions: { providerFilter, providerItemsToReuse }
      });
    } else {
      const oldLineContext = this._completionModel.lineContext;
      let isFrozen = false;
      this._completionModel.lineContext = {
        leadingLineContent: ctx.leadingLineContent,
        characterCountDelta: ctx.column - this._context.column
      };
      if (this._completionModel.items.length === 0) {
        const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor);
        if (!this._context) {
          this.cancel();
          return;
        }
        if (shouldAutoTrigger && this._context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
          this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true });
          return;
        }
        if (!this._context.triggerOptions.auto) {
          this._completionModel.lineContext = oldLineContext;
          isFrozen = this._completionModel.items.length > 0;
          if (isFrozen && ctx.leadingWord.word.length === 0) {
            this.cancel();
            return;
          }
        } else {
          this.cancel();
          return;
        }
      }
      this._onDidSuggest.fire({
        completionModel: this._completionModel,
        triggerOptions: ctx.triggerOptions,
        isFrozen
      });
    }
  }
};
SuggestModel = __decorateClass([
  __decorateParam(1, IEditorWorkerService),
  __decorateParam(2, IClipboardService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IEnvironmentService)
], SuggestModel);
export {
  LineContext,
  State,
  SuggestModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBnZXRMZWFkaW5nV2hpdGVzcGFjZSwgaXNIaWdoU3Vycm9nYXRlLCBpc0xvd1N1cnJvZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiwgSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvblRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBnZXRJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvY29tbW9uLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uTW9kZWwgfSBmcm9tICcuL2NvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uRHVyYXRpb25zLCBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbk9wdGlvbnMsIGdldFNuaXBwZXRTdWdnZXN0U3VwcG9ydCwgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcywgUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMsIFNuaXBwZXRTb3J0T3JkZXIgfSBmcm9tICcuL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgV29yZERpc3RhbmNlIH0gZnJvbSAnLi93b3JkRGlzdGFuY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDYW5jZWxFdmVudCB7XG5cdHJlYWRvbmx5IHJldHJpZ2dlcjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHJpZ2dlckV2ZW50IHtcblx0cmVhZG9ubHkgYXV0bzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2h5OiBib29sZWFuO1xuXHRyZWFkb25seSBwb3NpdGlvbjogSVBvc2l0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdWdnZXN0RXZlbnQge1xuXHRyZWFkb25seSBjb21wbGV0aW9uTW9kZWw6IENvbXBsZXRpb25Nb2RlbDtcblx0cmVhZG9ubHkgaXNGcm96ZW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRyaWdnZXJPcHRpb25zOiBTdWdnZXN0VHJpZ2dlck9wdGlvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3VnZ2VzdFRyaWdnZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgYXV0bzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2h5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVmaWx0ZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSByZXRyaWdnZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSB0cmlnZ2VyS2luZD86IENvbXBsZXRpb25UcmlnZ2VyS2luZDtcblx0cmVhZG9ubHkgdHJpZ2dlckNoYXJhY3Rlcj86IHN0cmluZztcblx0cmVhZG9ubHkgY2xpcGJvYXJkVGV4dD86IHN0cmluZztcblx0Y29tcGxldGlvbk9wdGlvbnM/OiBQYXJ0aWFsPENvbXBsZXRpb25PcHRpb25zPjtcbn1cblxuZXhwb3J0IGNsYXNzIExpbmVDb250ZXh0IHtcblxuXHRzdGF0aWMgc2hvdWxkQXV0b1RyaWdnZXIoZWRpdG9yOiBJQ29kZUVkaXRvcik6IGJvb2xlYW4ge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBwb3MgPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVJZkNoZWFwKHBvcy5saW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihwb3MpO1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAod29yZC5lbmRDb2x1bW4gIT09IHBvcy5jb2x1bW4gJiZcblx0XHRcdHdvcmQuc3RhcnRDb2x1bW4gKyAxICE9PSBwb3MuY29sdW1uIC8qIGFmdGVyIHR5cGluZyBhIHNpbmdsZSBjaGFyYWN0ZXIgYmVmb3JlIGEgd29yZCAqLykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWlzTmFOKE51bWJlcih3b3JkLndvcmQpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgY29sdW1uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlYWRpbmdMaW5lQ29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBsZWFkaW5nV29yZDogSVdvcmRBdFBvc2l0aW9uO1xuXHRyZWFkb25seSB0cmlnZ2VyT3B0aW9uczogU3VnZ2VzdFRyaWdnZXJPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRyaWdnZXJPcHRpb25zOiBTdWdnZXN0VHJpZ2dlck9wdGlvbnMpIHtcblx0XHR0aGlzLmxlYWRpbmdMaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLnN1YnN0cigwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHR0aGlzLmxlYWRpbmdXb3JkID0gbW9kZWwuZ2V0V29yZFVudGlsUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdHRoaXMubGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0dGhpcy5jb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0dGhpcy50cmlnZ2VyT3B0aW9ucyA9IHRyaWdnZXJPcHRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN0YXRlIHtcblx0SWRsZSA9IDAsXG5cdE1hbnVhbCA9IDEsXG5cdEF1dG8gPSAyXG59XG5cbmZ1bmN0aW9uIGNhblNob3dRdWlja1N1Z2dlc3QoZWRpdG9yOiBJQ29kZUVkaXRvciwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IGJvb2xlYW4ge1xuXHRpZiAoIUJvb2xlYW4oY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbmxpbmVTdWdnZXN0aW9uVmlzaWJsZS5rZXkpKSkge1xuXHRcdC8vIEFsbG93IGlmIHRoZXJlIGlzIG5vIGlubGluZSBzdWdnZXN0aW9uLlxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IHN1cHByZXNzU3VnZ2VzdGlvbnMgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLnN1cHByZXNzU3VnZ2VzdGlvbnMua2V5KTtcblx0aWYgKHN1cHByZXNzU3VnZ2VzdGlvbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiAhc3VwcHJlc3NTdWdnZXN0aW9ucztcblx0fVxuXHRyZXR1cm4gIWVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLnN1cHByZXNzU3VnZ2VzdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGNhblNob3dTdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycyhlZGl0b3I6IElDb2RlRWRpdG9yLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGlmICghQm9vbGVhbihjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ2lubGluZVN1Z2dlc3Rpb25WaXNpYmxlJykpKSB7XG5cdFx0Ly8gQWxsb3cgaWYgdGhlcmUgaXMgbm8gaW5saW5lIHN1Z2dlc3Rpb24uXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3Qgc3VwcHJlc3NTdWdnZXN0aW9ucyA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuc3VwcHJlc3NTdWdnZXN0aW9ucy5rZXkpO1xuXHRpZiAoc3VwcHJlc3NTdWdnZXN0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICFzdXBwcmVzc1N1Z2dlc3Rpb25zO1xuXHR9XG5cdHJldHVybiAhZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkuc3VwcHJlc3NTdWdnZXN0aW9ucztcbn1cblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RNb2RlbCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyaWdnZXJDaGFyYWN0ZXJMaXN0ZW5lciA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlclF1aWNrU3VnZ2VzdCA9IG5ldyBUaW1lb3V0VGltZXIoKTtcblx0cHJpdmF0ZSBfd2FpdEZvcklubGluZUNvbXBsZXRpb25zOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfdHJpZ2dlclN0YXRlOiBTdWdnZXN0VHJpZ2dlck9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlcXVlc3RUb2tlbj86IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRwcml2YXRlIF9jb250ZXh0PzogTGluZUNvbnRleHQ7XG5cdHByaXZhdGUgX2N1cnJlbnRTZWxlY3Rpb246IFNlbGVjdGlvbjtcblxuXHRwcml2YXRlIF9jb21wbGV0aW9uTW9kZWw6IENvbXBsZXRpb25Nb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENhbmNlbCA9IG5ldyBFbWl0dGVyPElDYW5jZWxFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VyID0gbmV3IEVtaXR0ZXI8SVRyaWdnZXJFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdWdnZXN0ID0gbmV3IEVtaXR0ZXI8SVN1Z2dlc3RFdmVudD4oKTtcblxuXHRyZWFkb25seSBvbkRpZENhbmNlbDogRXZlbnQ8SUNhbmNlbEV2ZW50PiA9IHRoaXMuX29uRGlkQ2FuY2VsLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXI6IEV2ZW50PElUcmlnZ2VyRXZlbnQ+ID0gdGhpcy5fb25EaWRUcmlnZ2VyLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZFN1Z2dlc3Q6IEV2ZW50PElTdWdnZXN0RXZlbnQ+ID0gdGhpcy5fb25EaWRTdWdnZXN0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VudlNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCkgfHwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKTtcblxuXHRcdC8vIHdpcmUgdXAgdmFyaW91cyBsaXN0ZW5lcnNcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyQ2hhcmFjdGVycygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyQ2hhcmFjdGVycygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlU3VnZ2VzdFNlc3Npb24oKTtcblx0XHR9KSk7XG5cblx0XHRsZXQgZWRpdG9ySXNDb21wb3NpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENvbXBvc2l0aW9uU3RhcnQoKCkgPT4ge1xuXHRcdFx0ZWRpdG9ySXNDb21wb3NpbmcgPSB0cnVlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENvbXBvc2l0aW9uRW5kKCgpID0+IHtcblx0XHRcdGVkaXRvcklzQ29tcG9zaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uRW5kKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0Ly8gb25seSB0cmlnZ2VyIHN1Z2dlc3Qgd2hlbiB0aGUgZWRpdG9yIGlzbid0IGNvbXBvc2luZyBhIGNoYXJhY3RlclxuXHRcdFx0aWYgKCFlZGl0b3JJc0NvbXBvc2luZykge1xuXHRcdFx0XHR0aGlzLl9vbkN1cnNvckNoYW5nZShlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Ly8gb25seSBmaWx0ZXIgY29tcGxldGlvbnMgd2hlbiB0aGUgZWRpdG9yIGlzbid0IGNvbXBvc2luZyBhIGNoYXJhY3RlclxuXHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHQvLyBlLmcuIFx1MDBBOCArIHUgbWFrZXMgXHUwMEZDIGJ1dCBqdXN0IFx1MDBBOCBjYW5ub3QgYmUgdXNlZCBmb3IgZmlsdGVyaW5nXG5cdFx0XHRpZiAoIWVkaXRvcklzQ29tcG9zaW5nICYmIHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZmlsdGVyQ29tcGxldGlvbkl0ZW1zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl90cmlnZ2VyQ2hhcmFjdGVyTGlzdGVuZXIpO1xuXHRcdGRpc3Bvc2UoW3RoaXMuX29uRGlkQ2FuY2VsLCB0aGlzLl9vbkRpZFN1Z2dlc3QsIHRoaXMuX29uRGlkVHJpZ2dlciwgdGhpcy5fdHJpZ2dlclF1aWNrU3VnZ2VzdF0pO1xuXHRcdHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9ucz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY29tcGxldGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVHJpZ2dlckNoYXJhY3RlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJpZ2dlckNoYXJhY3Rlckxpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpXG5cdFx0XHR8fCAhdGhpcy5fZWRpdG9yLmhhc01vZGVsKClcblx0XHRcdHx8ICF0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVycykpIHtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cHBvcnRzQnlUcmlnZ2VyQ2hhcmFjdGVyID0gbmV3IE1hcDxzdHJpbmcsIFNldDxDb21wbGV0aW9uSXRlbVByb3ZpZGVyPj4oKTtcblx0XHRmb3IgKGNvbnN0IHN1cHBvcnQgb2YgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLmFsbCh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSkpIHtcblx0XHRcdGZvciAoY29uc3QgY2ggb2Ygc3VwcG9ydC50cmlnZ2VyQ2hhcmFjdGVycyB8fCBbXSkge1xuXHRcdFx0XHRsZXQgc2V0ID0gc3VwcG9ydHNCeVRyaWdnZXJDaGFyYWN0ZXIuZ2V0KGNoKTtcblx0XHRcdFx0aWYgKCFzZXQpIHtcblx0XHRcdFx0XHRzZXQgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdFx0Y29uc3Qgc3VnZ2VzdFN1cHBvcnQgPSBnZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQoKTtcblx0XHRcdFx0XHRpZiAoc3VnZ2VzdFN1cHBvcnQpIHtcblx0XHRcdFx0XHRcdHNldC5hZGQoc3VnZ2VzdFN1cHBvcnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdXBwb3J0c0J5VHJpZ2dlckNoYXJhY3Rlci5zZXQoY2gsIHNldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0LmFkZChzdXBwb3J0KTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGNvbnN0IGNoZWNrVHJpZ2dlckNoYXJhY3RlciA9ICh0ZXh0Pzogc3RyaW5nKSA9PiB7XG5cblx0XHRcdGlmICghY2FuU2hvd1N1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzKHRoaXMuX2VkaXRvciwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChMaW5lQ29udGV4dC5zaG91bGRBdXRvVHJpZ2dlcih0aGlzLl9lZGl0b3IpKSB7XG5cdFx0XHRcdC8vIGRvbid0IHRyaWdnZXIgYnkgdHJpZ2dlciBjaGFyYWN0ZXJzIHdoZW4gdGhpcyBpcyBhIGNhc2UgZm9yIHF1aWNrIHN1Z2dlc3Rcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRleHQpIHtcblx0XHRcdFx0Ly8gY2FtZSBoZXJlIGZyb20gdGhlIGNvbXBvc2l0aW9uRW5kLWV2ZW50XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkhO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0dGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLnN1YnN0cigwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGxhc3RDaGFyID0gJyc7XG5cdFx0XHRpZiAoaXNMb3dTdXJyb2dhdGUodGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMSkpKSB7XG5cdFx0XHRcdGlmIChpc0hpZ2hTdXJyb2dhdGUodGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMikpKSB7XG5cdFx0XHRcdFx0bGFzdENoYXIgPSB0ZXh0LnN1YnN0cih0ZXh0Lmxlbmd0aCAtIDIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYXN0Q2hhciA9IHRleHQuY2hhckF0KHRleHQubGVuZ3RoIC0gMSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN1cHBvcnRzID0gc3VwcG9ydHNCeVRyaWdnZXJDaGFyYWN0ZXIuZ2V0KGxhc3RDaGFyKTtcblx0XHRcdGlmIChzdXBwb3J0cykge1xuXG5cdFx0XHRcdC8vIGtlZXAgZXhpc3RpbmcgaXRlbXMgdGhhdCB3aGVyZSBub3QgY29tcHV0ZWQgYnkgdGhlXG5cdFx0XHRcdC8vIHN1cHBvcnRzL3Byb3ZpZGVycyB0aGF0IHdhbnQgdG8gdHJpZ2dlciBub3dcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJJdGVtc1RvUmV1c2UgPSBuZXcgTWFwPENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25JdGVtW10+KCk7XG5cdFx0XHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtwcm92aWRlciwgaXRlbXNdIG9mIHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5nZXRJdGVtc0J5UHJvdmlkZXIoKSkge1xuXHRcdFx0XHRcdFx0aWYgKCFzdXBwb3J0cy5oYXMocHJvdmlkZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVySXRlbXNUb1JldXNlLnNldChwcm92aWRlciwgaXRlbXMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudHJpZ2dlcih7XG5cdFx0XHRcdFx0YXV0bzogdHJ1ZSxcblx0XHRcdFx0XHR0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIsXG5cdFx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcjogbGFzdENoYXIsXG5cdFx0XHRcdFx0cmV0cmlnZ2VyOiBCb29sZWFuKHRoaXMuX2NvbXBsZXRpb25Nb2RlbCksXG5cdFx0XHRcdFx0Y2xpcGJvYXJkVGV4dDogdGhpcy5fY29tcGxldGlvbk1vZGVsPy5jbGlwYm9hcmRUZXh0LFxuXHRcdFx0XHRcdGNvbXBsZXRpb25PcHRpb25zOiB7IHByb3ZpZGVyRmlsdGVyOiBzdXBwb3J0cywgcHJvdmlkZXJJdGVtc1RvUmV1c2UgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fdHJpZ2dlckNoYXJhY3Rlckxpc3RlbmVyLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRUeXBlKGNoZWNrVHJpZ2dlckNoYXJhY3RlcikpO1xuXHRcdHRoaXMuX3RyaWdnZXJDaGFyYWN0ZXJMaXN0ZW5lci5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ29tcG9zaXRpb25FbmQoKCkgPT4gY2hlY2tUcmlnZ2VyQ2hhcmFjdGVyKCkpKTtcblx0fVxuXG5cdC8vIC0tLSB0cmlnZ2VyL3JldHJpZ2dlci9jYW5jZWwgc3VnZ2VzdFxuXG5cdGdldCBzdGF0ZSgpOiBTdGF0ZSB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyU3RhdGUpIHtcblx0XHRcdHJldHVybiBTdGF0ZS5JZGxlO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuX3RyaWdnZXJTdGF0ZS5hdXRvKSB7XG5cdFx0XHRyZXR1cm4gU3RhdGUuTWFudWFsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gU3RhdGUuQXV0bztcblx0XHR9XG5cdH1cblxuXHRjYW5jZWwocmV0cmlnZ2VyOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl90cmlnZ2VyUXVpY2tTdWdnZXN0LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9ucz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9ucyA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLl90cmlnZ2VyU3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVxdWVzdFRva2VuPy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3JlcXVlc3RUb2tlbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3RyaWdnZXJTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENhbmNlbC5maXJlKHsgcmV0cmlnZ2VyIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHRoaXMuX2NvbXBsZXRpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQWN0aXZlU3VnZ2VzdFNlc3Npb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8ICF0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIuaGFzKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpKSkge1xuXHRcdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyKHsgYXV0bzogdGhpcy5fdHJpZ2dlclN0YXRlLmF1dG8sIHJldHJpZ2dlcjogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkN1cnNvckNoYW5nZShlOiBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldlNlbGVjdGlvbiA9IHRoaXMuX2N1cnJlbnRTZWxlY3Rpb247XG5cdFx0dGhpcy5fY3VycmVudFNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdGlmICghZS5zZWxlY3Rpb24uaXNFbXB0eSgpXG5cdFx0XHR8fCAoZS5yZWFzb24gIT09IEN1cnNvckNoYW5nZVJlYXNvbi5Ob3RTZXQgJiYgZS5yZWFzb24gIT09IEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdClcblx0XHRcdHx8IChlLnNvdXJjZSAhPT0gJ2tleWJvYXJkJyAmJiBlLnNvdXJjZSAhPT0gJ2RlbGV0ZUxlZnQnKVxuXHRcdCkge1xuXHRcdFx0Ly8gRWFybHkgZXhpdCBpZiBub3RoaW5nIG5lZWRzIHRvIGJlIGRvbmUhXG5cdFx0XHQvLyBMZWF2ZSBzb21lIGZvcm0gb2YgZWFybHkgZXhpdCBjaGVjayBoZXJlIGlmIHlvdSB3aXNoIHRvIGNvbnRpbnVlIGJlaW5nIGEgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZSBsaXN0ZW5lciA7KVxuXHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGlmICh0aGlzLl90cmlnZ2VyU3RhdGUgPT09IHVuZGVmaW5lZCAmJiBlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCkge1xuXHRcdFx0aWYgKHByZXZTZWxlY3Rpb24uY29udGFpbnNSYW5nZSh0aGlzLl9jdXJyZW50U2VsZWN0aW9uKSB8fCBwcmV2U2VsZWN0aW9uLmdldEVuZFBvc2l0aW9uKCkuaXNCZWZvcmVPckVxdWFsKHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24uZ2V0UG9zaXRpb24oKSkpIHtcblx0XHRcdFx0Ly8gY3Vyc29yIGRpZCBtb3ZlIFJJR0hUIGR1ZSB0byB0eXBpbmcgLT4gdHJpZ2dlciBxdWljayBzdWdnZXN0XG5cdFx0XHRcdHRoaXMuX2RvVHJpZ2dlclF1aWNrU3VnZ2VzdCgpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmICh0aGlzLl90cmlnZ2VyU3RhdGUgIT09IHVuZGVmaW5lZCAmJiBlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KSB7XG5cdFx0XHQvLyBzdWdnZXN0IGlzIGFjdGl2ZSBhbmQgc29tZXRoaW5nIGxpa2UgY3Vyc29yIGtleXMgYXJlIHVzZWQgdG8gbW92ZVxuXHRcdFx0Ly8gdGhlIGN1cnNvci4gdGhpcyBtZWFucyB3ZSBjYW4gcmVmaWx0ZXIgYXQgdGhlIG5ldyBwb3NpdGlvblxuXHRcdFx0dGhpcy5fcmVmaWx0ZXJDb21wbGV0aW9uSXRlbXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbXBvc2l0aW9uRW5kKCk6IHZvaWQge1xuXHRcdC8vIHRyaWdnZXIgb3IgcmVmaWx0ZXIgd2hlbiBjb21wb3NpdGlvbiBlbmRzXG5cdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kb1RyaWdnZXJRdWlja1N1Z2dlc3QoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVmaWx0ZXJDb21wbGV0aW9uSXRlbXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb1RyaWdnZXJRdWlja1N1Z2dlc3QoKTogdm9pZCB7XG5cblx0XHRpZiAoUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMuaXNBbGxPZmYodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9ucykpKSB7XG5cdFx0XHQvLyBub3QgZW5hYmxlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5zbmlwcGV0c1ByZXZlbnRRdWlja1N1Z2dlc3Rpb25zICYmIFNuaXBwZXRDb250cm9sbGVyMi5nZXQodGhpcy5fZWRpdG9yKT8uaXNJblNuaXBwZXQoKSkge1xuXHRcdFx0Ly8gbm8gcXVpY2sgc3VnZ2VzdGlvbiB3aGVuIGluIHNuaXBwZXQgbW9kZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FuY2VsKCk7XG5cblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCB3YWl0IGZvciBpbmxpbmUgY29tcGxldGlvbnMgZnJvbSBhIHByZXZpb3VzIGN5Y2xlXG5cdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fdHJpZ2dlclF1aWNrU3VnZ2VzdC5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghTGluZUNvbnRleHQuc2hvdWxkQXV0b1RyaWdnZXIodGhpcy5fZWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8ICF0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgcG9zID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHQvLyB2YWxpZGF0ZSBlbmFibGVkIG5vd1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9ucyk7XG5cdFx0XHRpZiAoUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMuaXNBbGxPZmYoY29uZmlnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCB3YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMgPSBmYWxzZTtcblx0XHRcdGlmICghUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMuaXNBbGxPbihjb25maWcpKSB7XG5cdFx0XHRcdC8vIENoZWNrIHRoZSB0eXBlIG9mIHRoZSB0b2tlbiB0aGF0IHRyaWdnZXJlZCB0aGlzXG5cdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAocG9zLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMocG9zLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCB0b2tlblR5cGUgPSBsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKGxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChNYXRoLm1heChwb3MuY29sdW1uIC0gMSAtIDEsIDApKSk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMudmFsdWVGb3IoY29uZmlnLCB0b2tlblR5cGUpO1xuXHRcdFx0XHRpZiAodmFsdWUgPT09ICdvZmYnIHx8IHZhbHVlID09PSAnaW5saW5lJykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodmFsdWUgPT09ICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnKSB7XG5cdFx0XHRcdFx0d2FpdEZvcklubGluZUNvbXBsZXRpb25zID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5oYXMobW9kZWwpXG5cdFx0XHRcdFx0XHQmJiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5lbmFibGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY2FuU2hvd1F1aWNrU3VnZ2VzdCh0aGlzLl9lZGl0b3IsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0Ly8gZG8gbm90IHRyaWdnZXIgcXVpY2sgc3VnZ2VzdGlvbnMgaWYgaW5saW5lIHN1Z2dlc3Rpb25zIGFyZSBzaG93blxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAod2FpdEZvcklubGluZUNvbXBsZXRpb25zKSB7XG5cdFx0XHRcdC8vIFdhaXQgZm9yIGlubGluZSBjb21wbGV0aW9ucyB0byByZXNvbHZlIGJlZm9yZSBkZWNpZGluZ1xuXHRcdFx0XHR0aGlzLl93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnNBbmRUcmlnZ2VyKG1vZGVsLCBwb3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyKHsgYXV0bzogdHJ1ZSB9KTtcblx0XHRcdH1cblxuXHRcdH0sIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnF1aWNrU3VnZ2VzdGlvbnNEZWxheSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FpdEZvcklubGluZUNvbXBsZXRpb25zQW5kVHJpZ2dlcihpbml0aWFsTW9kZWw6IElUZXh0TW9kZWwsIGluaXRpYWxQb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpbml0aWFsTW9kZWxWZXJzaW9uID0gaW5pdGlhbE1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IGlubGluZUNvbnRyb2xsZXIgPSBnZXRJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIodGhpcy5fZWRpdG9yKTtcblx0XHRjb25zdCBpbmxpbmVNb2RlbCA9IGlubGluZUNvbnRyb2xsZXI/Lm1vZGVsLmdldCgpO1xuXHRcdGlmICghaW5saW5lQ29udHJvbGxlciB8fCAhaW5saW5lTW9kZWwpIHtcblx0XHRcdHRoaXMudHJpZ2dlcih7IGF1dG86IHRydWUgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSBpbmxpbmVNb2RlbC5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGU/LmlubGluZVN1Z2dlc3Rpb24pIHtcblx0XHRcdC8vIElubGluZSBjb21wbGV0aW9ucyBhcmUgYWxyZWFkeSBzaG93aW5nIC0gc3VwcHJlc3Ncblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMgPSBzdG9yZTtcblxuXHRcdGNvbnN0IHRyaWdnZXJBbmRDbGVhblVwID0gKGRvVHJpZ2dlcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9ucyA9PT0gc3RvcmUpIHtcblx0XHRcdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghZG9UcmlnZ2VyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0Y29uc3QgY3VycmVudFBvc2l0aW9uID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRpZiAoY3VycmVudE1vZGVsID09PSBpbml0aWFsTW9kZWxcblx0XHRcdFx0JiYgY3VycmVudE1vZGVsLmdldFZlcnNpb25JZCgpID09PSBpbml0aWFsTW9kZWxWZXJzaW9uXG5cdFx0XHRcdCYmIGN1cnJlbnRQb3NpdGlvbj8uZXF1YWxzKGluaXRpYWxQb3NpdGlvbilcblx0XHRcdFx0JiYgdGhpcy5fZWRpdG9yLmhhc1dpZGdldEZvY3VzKClcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoeyBhdXRvOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBSZWFkaW5nIGBpbmxpbmVDb250cm9sbGVyLm1vZGVsYCBmaXJzdCBpbiBhIHNpbmdsZSBhdXRvcnVuIGJpbmRzIHRoZVxuXHRcdC8vIHdhaXQgdG8gdGhlIG1vZGVsJ3MgbGlmZXRpbWU6IG5lc3RlZCBhdXRvcnVucyB3b3VsZCBoYXZlIG5vIGRlZmluZWRcblx0XHQvLyBydW4gb3JkZXIsIHNvIGFuIGlubmVyIHN0YXRlLXdhdGNoZXIgY291bGQgZmlyZSBvbiBhIGRpc3Bvc2VkIG1vZGVsXG5cdFx0Ly8gYmVmb3JlIHRoZSBvdXRlciBtb2RlbC13YXRjaGVyIGNsZWFuZWQgaXQgdXAuXG5cdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dHJpZ2dlckFuZENsZWFuVXAodHJ1ZSk7XG5cdFx0XHRpbmxpbmVNb2RlbC5zdG9wKCdhdXRvbWF0aWMnKTtcblx0XHR9LCA3NTAsIHN0b3JlKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50SW5saW5lTW9kZWwgPSBpbmxpbmVDb250cm9sbGVyLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjdXJyZW50SW5saW5lTW9kZWwgIT09IGlubGluZU1vZGVsKSB7XG5cdFx0XHRcdHRyaWdnZXJBbmRDbGVhblVwKGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gaW5saW5lTW9kZWwuc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IGlubGluZU1vZGVsLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY3VycmVudFN0YXRlICYmIHN0YXR1cyA9PT0gJ2xvYWRpbmcnKSB7XG5cdFx0XHRcdC8vIFN0aWxsIGxvYWRpbmdcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJpZ2dlckFuZENsZWFuVXAoIWN1cnJlbnRTdGF0ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmaWx0ZXJDb21wbGV0aW9uSXRlbXMoKTogdm9pZCB7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSk7XG5cdFx0YXNzZXJ0VHlwZSh0aGlzLl90cmlnZ2VyU3RhdGUgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgY3R4ID0gbmV3IExpbmVDb250ZXh0KG1vZGVsLCBwb3NpdGlvbiwgeyAuLi50aGlzLl90cmlnZ2VyU3RhdGUsIHJlZmlsdGVyOiB0cnVlIH0pO1xuXHRcdHRoaXMuX29uTmV3Q29udGV4dChjdHgpO1xuXHR9XG5cblx0dHJpZ2dlcihvcHRpb25zOiBTdWdnZXN0VHJpZ2dlck9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBjdHggPSBuZXcgTGluZUNvbnRleHQobW9kZWwsIHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLCBvcHRpb25zKTtcblxuXHRcdC8vIENhbmNlbCBwcmV2aW91cyByZXF1ZXN0cywgY2hhbmdlIHN0YXRlICYgdXBkYXRlIFVJXG5cdFx0dGhpcy5jYW5jZWwob3B0aW9ucy5yZXRyaWdnZXIpO1xuXHRcdHRoaXMuX3RyaWdnZXJTdGF0ZSA9IG9wdGlvbnM7XG5cdFx0dGhpcy5fb25EaWRUcmlnZ2VyLmZpcmUoeyBhdXRvOiBvcHRpb25zLmF1dG8sIHNoeTogb3B0aW9ucy5zaHkgPz8gZmFsc2UsIHBvc2l0aW9uOiB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSB9KTtcblxuXHRcdC8vIENhcHR1cmUgY29udGV4dCB3aGVuIHJlcXVlc3Qgd2FzIHNlbnRcblx0XHR0aGlzLl9jb250ZXh0ID0gY3R4O1xuXG5cdFx0Ly8gQnVpbGQgY29udGV4dCBmb3IgcmVxdWVzdFxuXHRcdGxldCBzdWdnZXN0Q3R4OiBDb21wbGV0aW9uQ29udGV4dCA9IHsgdHJpZ2dlcktpbmQ6IG9wdGlvbnMudHJpZ2dlcktpbmQgPz8gQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9O1xuXHRcdGlmIChvcHRpb25zLnRyaWdnZXJDaGFyYWN0ZXIpIHtcblx0XHRcdHN1Z2dlc3RDdHggPSB7XG5cdFx0XHRcdHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcixcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3Rlcjogb3B0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcXVlc3RUb2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8ga2luZCBmaWx0ZXIgYW5kIHNuaXBwZXQgc29ydCBydWxlc1xuXHRcdGNvbnN0IHNuaXBwZXRTdWdnZXN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNuaXBwZXRTdWdnZXN0aW9ucyk7XG5cdFx0bGV0IHNuaXBwZXRTb3J0T3JkZXIgPSBTbmlwcGV0U29ydE9yZGVyLklubGluZTtcblx0XHRzd2l0Y2ggKHNuaXBwZXRTdWdnZXN0aW9ucykge1xuXHRcdFx0Y2FzZSAndG9wJzpcblx0XHRcdFx0c25pcHBldFNvcnRPcmRlciA9IFNuaXBwZXRTb3J0T3JkZXIuVG9wO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdC8vIFx0XHUyMTkzIHRoYXQncyB0aGUgZGVmYXVsdCBhbnl3YXlzLi4uXG5cdFx0XHQvLyBjYXNlICdpbmxpbmUnOlxuXHRcdFx0Ly8gXHRzbmlwcGV0U29ydE9yZGVyID0gU25pcHBldFNvcnRPcmRlci5JbmxpbmU7XG5cdFx0XHQvLyBcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnYm90dG9tJzpcblx0XHRcdFx0c25pcHBldFNvcnRPcmRlciA9IFNuaXBwZXRTb3J0T3JkZXIuQm90dG9tO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCB7IGl0ZW1LaW5kOiBpdGVtS2luZEZpbHRlciwgc2hvd0RlcHJlY2F0ZWQgfSA9IFN1Z2dlc3RNb2RlbC5jcmVhdGVTdWdnZXN0RmlsdGVyKHRoaXMuX2VkaXRvcik7XG5cdFx0Y29uc3QgY29tcGxldGlvbk9wdGlvbnMgPSBuZXcgQ29tcGxldGlvbk9wdGlvbnMoc25pcHBldFNvcnRPcmRlciwgb3B0aW9ucy5jb21wbGV0aW9uT3B0aW9ucz8ua2luZEZpbHRlciA/PyBpdGVtS2luZEZpbHRlciwgb3B0aW9ucy5jb21wbGV0aW9uT3B0aW9ucz8ucHJvdmlkZXJGaWx0ZXIsIG9wdGlvbnMuY29tcGxldGlvbk9wdGlvbnM/LnByb3ZpZGVySXRlbXNUb1JldXNlLCBzaG93RGVwcmVjYXRlZCk7XG5cdFx0Y29uc3Qgd29yZERpc3RhbmNlID0gV29yZERpc3RhbmNlLmNyZWF0ZSh0aGlzLl9lZGl0b3JXb3JrZXJTZXJ2aWNlLCB0aGlzLl9lZGl0b3IpO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnMgPSBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKFxuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSxcblx0XHRcdGNvbXBsZXRpb25PcHRpb25zLFxuXHRcdFx0c3VnZ2VzdEN0eCxcblx0XHRcdHRoaXMuX3JlcXVlc3RUb2tlbi50b2tlblxuXHRcdCk7XG5cblx0XHRQcm9taXNlLmFsbChbY29tcGxldGlvbnMsIHdvcmREaXN0YW5jZV0pLnRoZW4oYXN5bmMgKFtjb21wbGV0aW9ucywgd29yZERpc3RhbmNlXSkgPT4ge1xuXG5cdFx0XHR0aGlzLl9yZXF1ZXN0VG9rZW4/LmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRjb21wbGV0aW9ucy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2xpcGJvYXJkVGV4dCA9IG9wdGlvbnM/LmNsaXBib2FyZFRleHQ7XG5cdFx0XHRpZiAoIWNsaXBib2FyZFRleHQgJiYgY29tcGxldGlvbnMubmVlZHNDbGlwYm9hcmQpIHtcblx0XHRcdFx0Y2xpcGJvYXJkVGV4dCA9IGF3YWl0IHRoaXMuX2NsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbXBsZXRpb25zLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHQvLyBjb25zdCBpdGVtcyA9IGNvbXBsZXRpb25zLml0ZW1zO1xuXG5cdFx0XHQvLyBpZiAoZXhpc3RpbmcpIHtcblx0XHRcdC8vIFx0Y29uc3QgY21wRm4gPSBnZXRTdWdnZXN0aW9uQ29tcGFyYXRvcihzbmlwcGV0U29ydE9yZGVyKTtcblx0XHRcdC8vIFx0aXRlbXMgPSBpdGVtcy5jb25jYXQoZXhpc3RpbmcuaXRlbXMpLnNvcnQoY21wRm4pO1xuXHRcdFx0Ly8gfVxuXG5cdFx0XHRjb25zdCBjdHggPSBuZXcgTGluZUNvbnRleHQobW9kZWwsIHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLCBvcHRpb25zKTtcblx0XHRcdGNvbnN0IGZ1enp5U2VhcmNoT3B0aW9ucyA9IHtcblx0XHRcdFx0Li4uRnV6enlTY29yZU9wdGlvbnMuZGVmYXVsdCxcblx0XHRcdFx0Zmlyc3RNYXRjaENhbkJlV2VhazogIXRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLm1hdGNoT25Xb3JkU3RhcnRPbmx5XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsID0gbmV3IENvbXBsZXRpb25Nb2RlbChjb21wbGV0aW9ucy5pdGVtcywgdGhpcy5fY29udGV4dCEuY29sdW1uLCB7XG5cdFx0XHRcdGxlYWRpbmdMaW5lQ29udGVudDogY3R4LmxlYWRpbmdMaW5lQ29udGVudCxcblx0XHRcdFx0Y2hhcmFjdGVyQ291bnREZWx0YTogY3R4LmNvbHVtbiAtIHRoaXMuX2NvbnRleHQhLmNvbHVtblxuXHRcdFx0fSxcblx0XHRcdFx0d29yZERpc3RhbmNlLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KSxcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc25pcHBldFN1Z2dlc3Rpb25zKSxcblx0XHRcdFx0ZnV6enlTZWFyY2hPcHRpb25zLFxuXHRcdFx0XHRjbGlwYm9hcmRUZXh0XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBzdG9yZSBjb250YWluZXJzIHNvIHRoYXQgdGhleSBjYW4gYmUgZGlzcG9zZWQgbGF0ZXJcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25EaXNwb3NhYmxlcy5hZGQoY29tcGxldGlvbnMuZGlzcG9zYWJsZSk7XG5cblx0XHRcdHRoaXMuX29uTmV3Q29udGV4dChjdHgpO1xuXG5cdFx0XHQvLyBmaW5hbGx5IHJlcG9ydCB0ZWxlbWV0cnkgYWJvdXQgZHVyYXRpb25zXG5cdFx0XHR0aGlzLl9yZXBvcnREdXJhdGlvbnNUZWxlbWV0cnkoY29tcGxldGlvbnMuZHVyYXRpb25zKTtcblxuXHRcdFx0Ly8gcmVwb3J0IGludmFsaWQgY29tcGxldGlvbnMgYnkgc291cmNlXG5cdFx0XHRpZiAoIXRoaXMuX2VudlNlcnZpY2UuaXNCdWlsdCB8fCB0aGlzLl9lbnZTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNvbXBsZXRpb25zLml0ZW1zKSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0uaXNJbnZhbGlkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtzdWdnZXN0XSBkaWQgSUdOT1JFIGludmFsaWQgY29tcGxldGlvbiBpdGVtIGZyb20gJHtpdGVtLnByb3ZpZGVyLl9kZWJ1Z0Rpc3BsYXlOYW1lfWAsIGl0ZW0uY29tcGxldGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHQvKipcblx0ICogUmVwb3J0IGR1cmF0aW9ucyB0ZWxlbWV0cnkgd2l0aCBhIDElIHNhbXBsaW5nIHJhdGUuXG5cdCAqIFRoZSB0ZWxlbWV0cnkgaXMgcmVwb3J0ZWQgb25seSBpZiBhIHJhbmRvbSBudW1iZXIgYmV0d2VlbiAwIGFuZCAxMDAgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIDEuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXBvcnREdXJhdGlvbnNUZWxlbWV0cnkoZHVyYXRpb25zOiBDb21wbGV0aW9uRHVyYXRpb25zKTogdm9pZCB7XG5cdFx0aWYgKE1hdGgucmFuZG9tKCkgPiAwLjAwMDEpIHsgLy8gMC4wMSVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHR5cGUgRHVyYXRpb25zID0geyBkYXRhOiBzdHJpbmcgfTtcblx0XHRcdHR5cGUgRHVyYXRpb25zQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnanJpZWtlbic7XG5cdFx0XHRcdGNvbW1lbnQ6ICdDb21wbGV0aW9ucyBwZXJmb3JtYW5jZSBudW1iZXJzJztcblx0XHRcdFx0ZGF0YTogeyBjb21tZW50OiAnRHVyYXRpb25zIHBlciBzb3VyY2UgYW5kIG92ZXJhbGwnOyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJyB9O1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxEdXJhdGlvbnMsIER1cmF0aW9uc0NsYXNzaWZpY2F0aW9uPignc3VnZ2VzdC5kdXJhdGlvbnMuanNvbicsIHsgZGF0YTogSlNPTi5zdHJpbmdpZnkoZHVyYXRpb25zKSB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ3N1Z2dlc3QuZHVyYXRpb25zLmpzb24nLCBkdXJhdGlvbnMpO1xuXHRcdH0pO1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZVN1Z2dlc3RGaWx0ZXIoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHsgaXRlbUtpbmQ6IFNldDxDb21wbGV0aW9uSXRlbUtpbmQ+OyBzaG93RGVwcmVjYXRlZDogYm9vbGVhbiB9IHtcblx0XHQvLyBraW5kIGZpbHRlciBhbmQgc25pcHBldCBzb3J0IHJ1bGVzXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFNldDxDb21wbGV0aW9uSXRlbUtpbmQ+KCk7XG5cblx0XHQvLyBzbmlwcGV0IHNldHRpbmdcblx0XHRjb25zdCBzbmlwcGV0U3VnZ2VzdGlvbnMgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zbmlwcGV0U3VnZ2VzdGlvbnMpO1xuXHRcdGlmIChzbmlwcGV0U3VnZ2VzdGlvbnMgPT09ICdub25lJykge1xuXHRcdFx0cmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCk7XG5cdFx0fVxuXG5cdFx0Ly8gdHlwZSBzZXR0aW5nXG5cdFx0Y29uc3Qgc3VnZ2VzdE9wdGlvbnMgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KTtcblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dNZXRob2RzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dGdW5jdGlvbnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb24pOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Q29uc3RydWN0b3JzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0cnVjdG9yKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0ZpZWxkcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5GaWVsZCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dWYXJpYWJsZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuVmFyaWFibGUpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Q2xhc3NlcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5DbGFzcyk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dTdHJ1Y3RzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlN0cnVjdCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dJbnRlcmZhY2VzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkludGVyZmFjZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dNb2R1bGVzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLk1vZHVsZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dQcm9wZXJ0aWVzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0V2ZW50cykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5FdmVudCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dPcGVyYXRvcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuT3BlcmF0b3IpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93VW5pdHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuVW5pdCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dWYWx1ZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuVmFsdWUpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Q29uc3RhbnRzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0VudW1zKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkVudW0pOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93RW51bU1lbWJlcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuRW51bU1lbWJlcik7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dLZXl3b3JkcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1dvcmRzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Q29sb3JzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0ZpbGVzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93UmVmZXJlbmNlcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2UpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Q29sb3JzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkN1c3RvbWNvbG9yKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0ZvbGRlcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1R5cGVQYXJhbWV0ZXJzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlR5cGVQYXJhbWV0ZXIpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93U25pcHBldHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dVc2VycykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5Vc2VyKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0lzc3VlcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5Jc3N1ZSk7IH1cblxuXHRcdHJldHVybiB7IGl0ZW1LaW5kOiByZXN1bHQsIHNob3dEZXByZWNhdGVkOiBzdWdnZXN0T3B0aW9ucy5zaG93RGVwcmVjYXRlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb25OZXdDb250ZXh0KGN0eDogTGluZUNvbnRleHQpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5fY29udGV4dCkge1xuXHRcdFx0Ly8gaGFwcGVucyB3aGVuIDI0eDcgSW50ZWxsaVNlbnNlIGlzIGVuYWJsZWQgYW5kIHN0aWxsIGluIGl0cyBkZWxheVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdHgubGluZU51bWJlciAhPT0gdGhpcy5fY29udGV4dC5saW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBlLmcuIGhhcHBlbnMgd2hlbiBwcmVzc2luZyBFbnRlciB3aGlsZSBJbnRlbGxpU2Vuc2UgaXMgY29tcHV0ZWRcblx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGdldExlYWRpbmdXaGl0ZXNwYWNlKGN0eC5sZWFkaW5nTGluZUNvbnRlbnQpICE9PSBnZXRMZWFkaW5nV2hpdGVzcGFjZSh0aGlzLl9jb250ZXh0LmxlYWRpbmdMaW5lQ29udGVudCkpIHtcblx0XHRcdC8vIGNhbmNlbCBJbnRlbGxpU2Vuc2Ugd2hlbiBsaW5lIHN0YXJ0IGNoYW5nZXNcblx0XHRcdC8vIGhhcHBlbnMgd2hlbiB0aGUgY3VycmVudCB3b3JkIGdldHMgb3V0ZGVudGVkXG5cdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdHguY29sdW1uIDwgdGhpcy5fY29udGV4dC5jb2x1bW4pIHtcblx0XHRcdC8vIHR5cGVkIC0+IG1vdmVkIGN1cnNvciBMRUZUIC0+IHJldHJpZ2dlciBpZiBzdGlsbCBvbiBhIHdvcmRcblx0XHRcdGlmIChjdHgubGVhZGluZ1dvcmQud29yZCkge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoeyBhdXRvOiB0aGlzLl9jb250ZXh0LnRyaWdnZXJPcHRpb25zLmF1dG8sIHJldHJpZ2dlcjogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdC8vIGhhcHBlbnMgd2hlbiBJbnRlbGxpU2Vuc2UgaXMgbm90IHlldCBjb21wdXRlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdHgubGVhZGluZ1dvcmQud29yZC5sZW5ndGggIT09IDAgJiYgY3R4LmxlYWRpbmdXb3JkLnN0YXJ0Q29sdW1uID4gdGhpcy5fY29udGV4dC5sZWFkaW5nV29yZC5zdGFydENvbHVtbikge1xuXHRcdFx0Ly8gc3RhcnRlZCBhIG5ldyB3b3JkIHdoaWxlIEludGVsbGlTZW5zZSBzaG93cyAtPiByZXRyaWdnZXIgYnV0IHJldXNlIGFsbCBpdGVtcyB0aGF0IHdlIGN1cnJlbnRseSBoYXZlXG5cdFx0XHRjb25zdCBzaG91bGRBdXRvVHJpZ2dlciA9IExpbmVDb250ZXh0LnNob3VsZEF1dG9UcmlnZ2VyKHRoaXMuX2VkaXRvcik7XG5cdFx0XHRpZiAoc2hvdWxkQXV0b1RyaWdnZXIgJiYgdGhpcy5fY29udGV4dCkge1xuXHRcdFx0XHQvLyBzaG91bGRBdXRvVHJpZ2dlciBmb3JjZXMgdG9rZW5pemF0aW9uLCB3aGljaCBjYW4gY2F1c2UgcGVuZGluZyBjdXJzb3IgY2hhbmdlIGV2ZW50cyB0byBiZSBlbWl0dGVkLCB3aGljaCBjYW4gY2F1c2Vcblx0XHRcdFx0Ly8gc3VnZ2VzdGlvbnMgdG8gYmUgY2FuY2VsbGVkLCB3aGljaCBjYXVzZXMgYHRoaXMuX2NvbnRleHRgIHRvIGJlIHVuZGVmaW5lZFxuXHRcdFx0XHRjb25zdCBtYXAgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWwuZ2V0SXRlbXNCeVByb3ZpZGVyKCk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcih7XG5cdFx0XHRcdFx0YXV0bzogdGhpcy5fY29udGV4dC50cmlnZ2VyT3B0aW9ucy5hdXRvLFxuXHRcdFx0XHRcdHJldHJpZ2dlcjogdHJ1ZSxcblx0XHRcdFx0XHRjbGlwYm9hcmRUZXh0OiB0aGlzLl9jb21wbGV0aW9uTW9kZWwuY2xpcGJvYXJkVGV4dCxcblx0XHRcdFx0XHRjb21wbGV0aW9uT3B0aW9uczogeyBwcm92aWRlckl0ZW1zVG9SZXVzZTogbWFwIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGN0eC5jb2x1bW4gPiB0aGlzLl9jb250ZXh0LmNvbHVtbiAmJiB0aGlzLl9jb21wbGV0aW9uTW9kZWwuZ2V0SW5jb21wbGV0ZVByb3ZpZGVyKCkuc2l6ZSA+IDAgJiYgY3R4LmxlYWRpbmdXb3JkLndvcmQubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHQvLyB0eXBlZCAtPiBtb3ZlZCBjdXJzb3IgUklHSFQgJiBpbmNvbXBsZSBtb2RlbCAmIHN0aWxsIG9uIGEgd29yZCAtPiByZXRyaWdnZXJcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXJJdGVtc1RvUmV1c2UgPSBuZXcgTWFwPENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25JdGVtW10+KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlckZpbHRlciA9IG5ldyBTZXQ8Q29tcGxldGlvbkl0ZW1Qcm92aWRlcj4oKTtcblx0XHRcdGZvciAoY29uc3QgW3Byb3ZpZGVyLCBpdGVtc10gb2YgdGhpcy5fY29tcGxldGlvbk1vZGVsLmdldEl0ZW1zQnlQcm92aWRlcigpKSB7XG5cdFx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwICYmIGl0ZW1zWzBdLmNvbnRhaW5lci5pbmNvbXBsZXRlKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJGaWx0ZXIuYWRkKHByb3ZpZGVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcm92aWRlckl0ZW1zVG9SZXVzZS5zZXQocHJvdmlkZXIsIGl0ZW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyaWdnZXIoe1xuXHRcdFx0XHRhdXRvOiB0aGlzLl9jb250ZXh0LnRyaWdnZXJPcHRpb25zLmF1dG8sXG5cdFx0XHRcdHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckZvckluY29tcGxldGVDb21wbGV0aW9ucyxcblx0XHRcdFx0cmV0cmlnZ2VyOiB0cnVlLFxuXHRcdFx0XHRjbGlwYm9hcmRUZXh0OiB0aGlzLl9jb21wbGV0aW9uTW9kZWwuY2xpcGJvYXJkVGV4dCxcblx0XHRcdFx0Y29tcGxldGlvbk9wdGlvbnM6IHsgcHJvdmlkZXJGaWx0ZXIsIHByb3ZpZGVySXRlbXNUb1JldXNlIH1cblx0XHRcdH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHR5cGVkIC0+IG1vdmVkIGN1cnNvciBSSUdIVCAtPiB1cGRhdGUgVUlcblx0XHRcdGNvbnN0IG9sZExpbmVDb250ZXh0ID0gdGhpcy5fY29tcGxldGlvbk1vZGVsLmxpbmVDb250ZXh0O1xuXHRcdFx0bGV0IGlzRnJvemVuID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5saW5lQ29udGV4dCA9IHtcblx0XHRcdFx0bGVhZGluZ0xpbmVDb250ZW50OiBjdHgubGVhZGluZ0xpbmVDb250ZW50LFxuXHRcdFx0XHRjaGFyYWN0ZXJDb3VudERlbHRhOiBjdHguY29sdW1uIC0gdGhpcy5fY29udGV4dC5jb2x1bW5cblx0XHRcdH07XG5cblx0XHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cblx0XHRcdFx0Y29uc3Qgc2hvdWxkQXV0b1RyaWdnZXIgPSBMaW5lQ29udGV4dC5zaG91bGRBdXRvVHJpZ2dlcih0aGlzLl9lZGl0b3IpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbnRleHQpIHtcblx0XHRcdFx0XHQvLyBzaG91bGRBdXRvVHJpZ2dlciBmb3JjZXMgdG9rZW5pemF0aW9uLCB3aGljaCBjYW4gY2F1c2UgcGVuZGluZyBjdXJzb3IgY2hhbmdlIGV2ZW50cyB0byBiZSBlbWl0dGVkLCB3aGljaCBjYW4gY2F1c2Vcblx0XHRcdFx0XHQvLyBzdWdnZXN0aW9ucyB0byBiZSBjYW5jZWxsZWQsIHdoaWNoIGNhdXNlcyBgdGhpcy5fY29udGV4dGAgdG8gYmUgdW5kZWZpbmVkXG5cdFx0XHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2hvdWxkQXV0b1RyaWdnZXIgJiYgdGhpcy5fY29udGV4dC5sZWFkaW5nV29yZC5lbmRDb2x1bW4gPCBjdHgubGVhZGluZ1dvcmQuc3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0XHQvLyByZXRyaWdnZXIgd2hlbiBoZWFkaW5nIGludG8gYSBuZXcgd29yZFxuXHRcdFx0XHRcdHRoaXMudHJpZ2dlcih7IGF1dG86IHRoaXMuX2NvbnRleHQudHJpZ2dlck9wdGlvbnMuYXV0bywgcmV0cmlnZ2VyOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdGhpcy5fY29udGV4dC50cmlnZ2VyT3B0aW9ucy5hdXRvKSB7XG5cdFx0XHRcdFx0Ly8gZnJlZXplIHdoZW4gSW50ZWxsaVNlbnNlIHdhcyBtYW51YWxseSByZXF1ZXN0ZWRcblx0XHRcdFx0XHR0aGlzLl9jb21wbGV0aW9uTW9kZWwubGluZUNvbnRleHQgPSBvbGRMaW5lQ29udGV4dDtcblx0XHRcdFx0XHRpc0Zyb3plbiA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGggPiAwO1xuXG5cdFx0XHRcdFx0aWYgKGlzRnJvemVuICYmIGN0eC5sZWFkaW5nV29yZC53b3JkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gdGhlcmUgd2VyZSByZXN1bHRzIGJlZm9yZSBidXQgbm93IHRoZXJlIGFyZW4ndFxuXHRcdFx0XHRcdFx0Ly8gYW5kIGFsc28gd2UgYXJlIG5vdCBvbiBhIHdvcmQgYW55bW9yZSAtPiBjYW5jZWxcblx0XHRcdFx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbm90aGluZyBsZWZ0XG5cdFx0XHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRTdWdnZXN0LmZpcmUoe1xuXHRcdFx0XHRjb21wbGV0aW9uTW9kZWw6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbCxcblx0XHRcdFx0dHJpZ2dlck9wdGlvbnM6IGN0eC50cmlnZ2VyT3B0aW9ucyxcblx0XHRcdFx0aXNGcm96ZW4sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIsb0JBQW9CO0FBQ2hELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsZUFBNEI7QUFDdEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCLGlCQUFpQixzQkFBc0I7QUFDdEUsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUywwQkFBd0Q7QUFDakUsU0FBNEIsb0JBQTRDLDZCQUE2QjtBQUVyRyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUE4QyxtQkFBbUIsMEJBQTBCLHdCQUF3Qix5QkFBeUIsd0JBQXdCO0FBQ3BLLFNBQVMsb0JBQW9CO0FBNkJ0QixNQUFNLFlBQVk7QUFBQSxFQUV4QixPQUFPLGtCQUFrQixRQUE4QjtBQUN0RCxRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLFVBQU0sTUFBTSxPQUFPLFlBQVk7QUFDL0IsVUFBTSxhQUFhLGdCQUFnQixJQUFJLFVBQVU7QUFFakQsVUFBTSxPQUFPLE1BQU0sa0JBQWtCLEdBQUc7QUFDeEMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxjQUFjLElBQUksVUFDMUIsS0FBSyxjQUFjLE1BQU0sSUFBSSxRQUE0RDtBQUN6RixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxNQUFNLE9BQU8sS0FBSyxJQUFJLENBQUMsR0FBRztBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFRQSxZQUFZLE9BQW1CLFVBQW9CLGdCQUF1QztBQUN6RixTQUFLLHFCQUFxQixNQUFNLGVBQWUsU0FBUyxVQUFVLEVBQUUsT0FBTyxHQUFHLFNBQVMsU0FBUyxDQUFDO0FBQ2pHLFNBQUssY0FBYyxNQUFNLHFCQUFxQixRQUFRO0FBQ3RELFNBQUssYUFBYSxTQUFTO0FBQzNCLFNBQUssU0FBUyxTQUFTO0FBQ3ZCLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFDRDtBQUVPLElBQVcsUUFBWCxrQkFBV0EsV0FBWDtBQUNOLEVBQUFBLGNBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsY0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSxjQUFBLFVBQU8sS0FBUDtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNbEIsU0FBUyxvQkFBb0IsUUFBcUIsbUJBQXVDLHNCQUFzRDtBQUM5SSxNQUFJLENBQUMsUUFBUSxrQkFBa0IsbUJBQW1CLDRCQUE0Qix3QkFBd0IsR0FBRyxDQUFDLEdBQUc7QUFFNUcsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLHNCQUFzQixrQkFBa0IsbUJBQXdDLDRCQUE0QixvQkFBb0IsR0FBRztBQUN6SSxNQUFJLHdCQUF3QixRQUFXO0FBQ3RDLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDQSxTQUFPLENBQUMsT0FBTyxVQUFVLGFBQWEsYUFBYSxFQUFFO0FBQ3REO0FBRUEsU0FBUyxrQ0FBa0MsUUFBcUIsbUJBQXVDLHNCQUFzRDtBQUM1SixNQUFJLENBQUMsUUFBUSxrQkFBa0IsbUJBQW1CLHlCQUF5QixDQUFDLEdBQUc7QUFFOUUsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLHNCQUFzQixrQkFBa0IsbUJBQXdDLDRCQUE0QixvQkFBb0IsR0FBRztBQUN6SSxNQUFJLHdCQUF3QixRQUFXO0FBQ3RDLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDQSxTQUFPLENBQUMsT0FBTyxVQUFVLGFBQWEsYUFBYSxFQUFFO0FBQ3REO0FBRU8sSUFBTSxlQUFOLE1BQTBDO0FBQUEsRUFzQmhELFlBQ2tCLFNBQ3NCLHNCQUNILG1CQUNBLG1CQUNOLGFBQ08sb0JBQ0csdUJBQ0csMEJBQ0wsYUFDckM7QUFUZ0I7QUFDc0I7QUFDSDtBQUNBO0FBQ047QUFDTztBQUNHO0FBQ0c7QUFDTDtBQTdCdkMsU0FBaUIsYUFBYSxJQUFJLGdCQUFnQjtBQUNsRCxTQUFpQiw0QkFBNEIsSUFBSSxnQkFBZ0I7QUFDakUsU0FBaUIsdUJBQXVCLElBQUksYUFBYTtBQUd6RCxTQUFRLGdCQUFtRDtBQU0zRCxTQUFpQix5QkFBeUIsSUFBSSxnQkFBZ0I7QUFDOUQsU0FBaUIsZUFBZSxJQUFJLFFBQXNCO0FBQzFELFNBQWlCLGdCQUFnQixJQUFJLFFBQXVCO0FBQzVELFNBQWlCLGdCQUFnQixJQUFJLFFBQXVCO0FBRTVELFNBQVMsY0FBbUMsS0FBSyxhQUFhO0FBQzlELFNBQVMsZUFBcUMsS0FBSyxjQUFjO0FBQ2pFLFNBQVMsZUFBcUMsS0FBSyxjQUFjO0FBYWhFLFNBQUssb0JBQW9CLEtBQUssUUFBUSxhQUFhLEtBQUssSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFHaEYsU0FBSyxXQUFXLElBQUksS0FBSyxRQUFRLGlCQUFpQixNQUFNO0FBQ3ZELFdBQUsseUJBQXlCO0FBQzlCLFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxXQUFXLElBQUksS0FBSyxRQUFRLHlCQUF5QixNQUFNO0FBQy9ELFdBQUsseUJBQXlCO0FBQzlCLFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxXQUFXLElBQUksS0FBSyxRQUFRLHlCQUF5QixNQUFNO0FBQy9ELFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxXQUFXLElBQUksS0FBSyx5QkFBeUIsbUJBQW1CLFlBQVksTUFBTTtBQUN0RixXQUFLLHlCQUF5QjtBQUM5QixXQUFLLDRCQUE0QjtBQUFBLElBQ2xDLENBQUMsQ0FBQztBQUVGLFFBQUksb0JBQW9CO0FBQ3hCLFNBQUssV0FBVyxJQUFJLEtBQUssUUFBUSxzQkFBc0IsTUFBTTtBQUM1RCwwQkFBb0I7QUFBQSxJQUNyQixDQUFDLENBQUM7QUFDRixTQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsb0JBQW9CLE1BQU07QUFDMUQsMEJBQW9CO0FBQ3BCLFdBQUssa0JBQWtCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxXQUFXLElBQUksS0FBSyxRQUFRLDJCQUEyQixPQUFLO0FBRWhFLFVBQUksQ0FBQyxtQkFBbUI7QUFDdkIsYUFBSyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3ZCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFdBQVcsSUFBSSxLQUFLLFFBQVEsd0JBQXdCLE1BQU07QUFJOUQsVUFBSSxDQUFDLHFCQUFxQixLQUFLLGtCQUFrQixRQUFXO0FBQzNELGFBQUsseUJBQXlCO0FBQUEsTUFDL0I7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsWUFBUSxLQUFLLHlCQUF5QjtBQUN0QyxZQUFRLENBQUMsS0FBSyxjQUFjLEtBQUssZUFBZSxLQUFLLGVBQWUsS0FBSyxvQkFBb0IsQ0FBQztBQUM5RixTQUFLLDJCQUEyQixRQUFRO0FBQ3hDLFNBQUssV0FBVyxRQUFRO0FBQ3hCLFNBQUssdUJBQXVCLFFBQVE7QUFDcEMsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFNBQUssMEJBQTBCLE1BQU07QUFFckMsUUFBSSxLQUFLLFFBQVEsVUFBVSxhQUFhLFFBQVEsS0FDNUMsQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUN2QixDQUFDLEtBQUssUUFBUSxVQUFVLGFBQWEsMEJBQTBCLEdBQUc7QUFFckU7QUFBQSxJQUNEO0FBRUEsVUFBTSw2QkFBNkIsb0JBQUksSUFBeUM7QUFDaEYsZUFBVyxXQUFXLEtBQUsseUJBQXlCLG1CQUFtQixJQUFJLEtBQUssUUFBUSxTQUFTLENBQUMsR0FBRztBQUNwRyxpQkFBVyxNQUFNLFFBQVEscUJBQXFCLENBQUMsR0FBRztBQUNqRCxZQUFJLE1BQU0sMkJBQTJCLElBQUksRUFBRTtBQUMzQyxZQUFJLENBQUMsS0FBSztBQUNULGdCQUFNLG9CQUFJLElBQUk7QUFDZCxnQkFBTSxpQkFBaUIseUJBQXlCO0FBQ2hELGNBQUksZ0JBQWdCO0FBQ25CLGdCQUFJLElBQUksY0FBYztBQUFBLFVBQ3ZCO0FBQ0EscUNBQTJCLElBQUksSUFBSSxHQUFHO0FBQUEsUUFDdkM7QUFDQSxZQUFJLElBQUksT0FBTztBQUFBLE1BQ2hCO0FBQUEsSUFDRDtBQUdBLFVBQU0sd0JBQXdCLENBQUMsU0FBa0I7QUFFaEQsVUFBSSxDQUFDLGtDQUFrQyxLQUFLLFNBQVMsS0FBSyxvQkFBb0IsS0FBSyxxQkFBcUIsR0FBRztBQUMxRztBQUFBLE1BQ0Q7QUFFQSxVQUFJLFlBQVksa0JBQWtCLEtBQUssT0FBTyxHQUFHO0FBRWhEO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxNQUFNO0FBRVYsY0FBTSxXQUFXLEtBQUssUUFBUSxZQUFZO0FBQzFDLGNBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxlQUFPLE1BQU0sZUFBZSxTQUFTLFVBQVUsRUFBRSxPQUFPLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFBQSxNQUMvRTtBQUVBLFVBQUksV0FBVztBQUNmLFVBQUksZUFBZSxLQUFLLFdBQVcsS0FBSyxTQUFTLENBQUMsQ0FBQyxHQUFHO0FBQ3JELFlBQUksZ0JBQWdCLEtBQUssV0FBVyxLQUFLLFNBQVMsQ0FBQyxDQUFDLEdBQUc7QUFDdEQscUJBQVcsS0FBSyxPQUFPLEtBQUssU0FBUyxDQUFDO0FBQUEsUUFDdkM7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVyxLQUFLLE9BQU8sS0FBSyxTQUFTLENBQUM7QUFBQSxNQUN2QztBQUVBLFlBQU0sV0FBVywyQkFBMkIsSUFBSSxRQUFRO0FBQ3hELFVBQUksVUFBVTtBQUliLGNBQU0sdUJBQXVCLG9CQUFJLElBQThDO0FBQy9FLFlBQUksS0FBSyxrQkFBa0I7QUFDMUIscUJBQVcsQ0FBQyxVQUFVLEtBQUssS0FBSyxLQUFLLGlCQUFpQixtQkFBbUIsR0FBRztBQUMzRSxnQkFBSSxDQUFDLFNBQVMsSUFBSSxRQUFRLEdBQUc7QUFDNUIsbUNBQXFCLElBQUksVUFBVSxLQUFLO0FBQUEsWUFDekM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUVBLGFBQUssUUFBUTtBQUFBLFVBQ1osTUFBTTtBQUFBLFVBQ04sYUFBYSxzQkFBc0I7QUFBQSxVQUNuQyxrQkFBa0I7QUFBQSxVQUNsQixXQUFXLFFBQVEsS0FBSyxnQkFBZ0I7QUFBQSxVQUN4QyxlQUFlLEtBQUssa0JBQWtCO0FBQUEsVUFDdEMsbUJBQW1CLEVBQUUsZ0JBQWdCLFVBQVUscUJBQXFCO0FBQUEsUUFDckUsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsU0FBSywwQkFBMEIsSUFBSSxLQUFLLFFBQVEsVUFBVSxxQkFBcUIsQ0FBQztBQUNoRixTQUFLLDBCQUEwQixJQUFJLEtBQUssUUFBUSxvQkFBb0IsTUFBTSxzQkFBc0IsQ0FBQyxDQUFDO0FBQUEsRUFDbkc7QUFBQTtBQUFBLEVBSUEsSUFBSSxRQUFlO0FBQ2xCLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsYUFBTztBQUFBLElBQ1IsV0FBVyxDQUFDLEtBQUssY0FBYyxNQUFNO0FBQ3BDLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sWUFBcUIsT0FBYTtBQUN4QyxTQUFLLHFCQUFxQixPQUFPO0FBQ2pDLFNBQUssMkJBQTJCLFFBQVE7QUFDeEMsU0FBSyw0QkFBNEI7QUFFakMsUUFBSSxLQUFLLGtCQUFrQixRQUFXO0FBQ3JDLFdBQUssZUFBZSxPQUFPO0FBQzNCLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssV0FBVztBQUNoQixXQUFLLGFBQWEsS0FBSyxFQUFFLFVBQVUsQ0FBQztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBUTtBQUNQLFNBQUssdUJBQXVCLE1BQU07QUFBQSxFQUNuQztBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFFBQUksS0FBSyxrQkFBa0IsUUFBVztBQUNyQyxVQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsS0FBSyxDQUFDLEtBQUsseUJBQXlCLG1CQUFtQixJQUFJLEtBQUssUUFBUSxTQUFTLENBQUMsR0FBRztBQUMvRyxhQUFLLE9BQU87QUFBQSxNQUNiLE9BQU87QUFDTixhQUFLLFFBQVEsRUFBRSxNQUFNLEtBQUssY0FBYyxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLEdBQXVDO0FBRTlELFFBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzdCO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsU0FBSyxvQkFBb0IsS0FBSyxRQUFRLGFBQWE7QUFFbkQsUUFBSSxDQUFDLEVBQUUsVUFBVSxRQUFRLEtBQ3BCLEVBQUUsV0FBVyxtQkFBbUIsVUFBVSxFQUFFLFdBQVcsbUJBQW1CLFlBQzFFLEVBQUUsV0FBVyxjQUFjLEVBQUUsV0FBVyxjQUMzQztBQUdELFdBQUssT0FBTztBQUNaO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxrQkFBa0IsVUFBYSxFQUFFLFdBQVcsbUJBQW1CLFFBQVE7QUFDL0UsVUFBSSxjQUFjLGNBQWMsS0FBSyxpQkFBaUIsS0FBSyxjQUFjLGVBQWUsRUFBRSxnQkFBZ0IsS0FBSyxrQkFBa0IsWUFBWSxDQUFDLEdBQUc7QUFFaEosYUFBSyx1QkFBdUI7QUFBQSxNQUM3QjtBQUFBLElBRUQsV0FBVyxLQUFLLGtCQUFrQixVQUFhLEVBQUUsV0FBVyxtQkFBbUIsVUFBVTtBQUd4RixXQUFLLHlCQUF5QjtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQTBCO0FBRWpDLFFBQUksS0FBSyxrQkFBa0IsUUFBVztBQUNyQyxXQUFLLHVCQUF1QjtBQUFBLElBQzdCLE9BQU87QUFDTixXQUFLLHlCQUF5QjtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQStCO0FBRXRDLFFBQUksd0JBQXdCLFNBQVMsS0FBSyxRQUFRLFVBQVUsYUFBYSxnQkFBZ0IsQ0FBQyxHQUFHO0FBRTVGO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxRQUFRLFVBQVUsYUFBYSxPQUFPLEVBQUUsbUNBQW1DLG1CQUFtQixJQUFJLEtBQUssT0FBTyxHQUFHLFlBQVksR0FBRztBQUV4STtBQUFBLElBQ0Q7QUFFQSxTQUFLLE9BQU87QUFHWixTQUFLLDJCQUEyQixRQUFRO0FBQ3hDLFNBQUssNEJBQTRCO0FBRWpDLFNBQUsscUJBQXFCLGFBQWEsTUFBTTtBQUM1QyxVQUFJLEtBQUssa0JBQWtCLFFBQVc7QUFDckM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLFlBQVksa0JBQWtCLEtBQUssT0FBTyxHQUFHO0FBQ2pEO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxLQUFLLFFBQVEsU0FBUyxLQUFLLENBQUMsS0FBSyxRQUFRLGVBQWUsR0FBRztBQUMvRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsWUFBTSxNQUFNLEtBQUssUUFBUSxZQUFZO0FBRXJDLFlBQU0sU0FBUyxLQUFLLFFBQVEsVUFBVSxhQUFhLGdCQUFnQjtBQUNuRSxVQUFJLHdCQUF3QixTQUFTLE1BQU0sR0FBRztBQUM3QztBQUFBLE1BQ0Q7QUFFQSxVQUFJLDJCQUEyQjtBQUMvQixVQUFJLENBQUMsd0JBQXdCLFFBQVEsTUFBTSxHQUFHO0FBRTdDLGNBQU0sYUFBYSxnQkFBZ0IsSUFBSSxVQUFVO0FBQ2pELGNBQU0sYUFBYSxNQUFNLGFBQWEsY0FBYyxJQUFJLFVBQVU7QUFDbEUsY0FBTSxZQUFZLFdBQVcscUJBQXFCLFdBQVcsdUJBQXVCLEtBQUssSUFBSSxJQUFJLFNBQVMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3BILGNBQU0sUUFBUSx3QkFBd0IsU0FBUyxRQUFRLFNBQVM7QUFDaEUsWUFBSSxVQUFVLFNBQVMsVUFBVSxVQUFVO0FBQzFDO0FBQUEsUUFDRDtBQUNBLFlBQUksVUFBVSw0QkFBNEI7QUFDekMscUNBQTJCLEtBQUsseUJBQXlCLDBCQUEwQixJQUFJLEtBQUssS0FDeEYsS0FBSyxRQUFRLFVBQVUsYUFBYSxhQUFhLEVBQUU7QUFBQSxRQUN4RDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLENBQUMsb0JBQW9CLEtBQUssU0FBUyxLQUFLLG9CQUFvQixLQUFLLHFCQUFxQixHQUFHO0FBRTVGO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLHlCQUF5QixtQkFBbUIsSUFBSSxLQUFLLEdBQUc7QUFDakU7QUFBQSxNQUNEO0FBRUEsVUFBSSwwQkFBMEI7QUFFN0IsYUFBSyxvQ0FBb0MsT0FBTyxHQUFHO0FBQUEsTUFDcEQsT0FBTztBQUNOLGFBQUssUUFBUSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDNUI7QUFBQSxJQUVELEdBQUcsS0FBSyxRQUFRLFVBQVUsYUFBYSxxQkFBcUIsQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFFUSxvQ0FBb0MsY0FBMEIsaUJBQWlDO0FBQ3RHLFVBQU0sc0JBQXNCLGFBQWEsYUFBYTtBQUN0RCxVQUFNLG1CQUFtQiwrQkFBK0IsS0FBSyxPQUFPO0FBQ3BFLFVBQU0sY0FBYyxrQkFBa0IsTUFBTSxJQUFJO0FBQ2hELFFBQUksQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhO0FBQ3RDLFdBQUssUUFBUSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQzNCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxZQUFZLE1BQU0sSUFBSTtBQUNwQyxRQUFJLE9BQU8sa0JBQWtCO0FBRTVCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxTQUFLLDRCQUE0QjtBQUVqQyxVQUFNLG9CQUFvQixDQUFDLGNBQXVCO0FBQ2pELFlBQU0sUUFBUTtBQUNkLFVBQUksS0FBSyw4QkFBOEIsT0FBTztBQUM3QyxhQUFLLDRCQUE0QjtBQUFBLE1BQ2xDO0FBQ0EsVUFBSSxLQUFLLGtCQUFrQixRQUFXO0FBQ3JDO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxNQUNEO0FBQ0EsWUFBTSxlQUFlLEtBQUssUUFBUSxTQUFTO0FBQzNDLFlBQU0sa0JBQWtCLEtBQUssUUFBUSxZQUFZO0FBQ2pELFVBQUksaUJBQWlCLGdCQUNqQixhQUFhLGFBQWEsTUFBTSx1QkFDaEMsaUJBQWlCLE9BQU8sZUFBZSxLQUN2QyxLQUFLLFFBQVEsZUFBZSxHQUM5QjtBQUNELGFBQUssUUFBUSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBTUEsc0JBQWtCLE1BQU07QUFDdkIsd0JBQWtCLElBQUk7QUFDdEIsa0JBQVksS0FBSyxXQUFXO0FBQUEsSUFDN0IsR0FBRyxLQUFLLEtBQUs7QUFFYixVQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFlBQU0scUJBQXFCLGlCQUFpQixNQUFNLEtBQUssTUFBTTtBQUM3RCxVQUFJLHVCQUF1QixhQUFhO0FBQ3ZDLDBCQUFrQixLQUFLO0FBQ3ZCO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxZQUFZLE9BQU8sS0FBSyxNQUFNO0FBQzdDLFlBQU0sZUFBZSxZQUFZLE1BQU0sS0FBSyxNQUFNO0FBQ2xELFVBQUksQ0FBQyxnQkFBZ0IsV0FBVyxXQUFXO0FBRTFDO0FBQUEsTUFDRDtBQUNBLHdCQUFrQixDQUFDLFlBQVk7QUFBQSxJQUNoQyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSwyQkFBaUM7QUFDeEMsZUFBVyxLQUFLLFFBQVEsU0FBUyxDQUFDO0FBQ2xDLGVBQVcsS0FBSyxrQkFBa0IsTUFBUztBQUUzQyxVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsVUFBTSxXQUFXLEtBQUssUUFBUSxZQUFZO0FBQzFDLFVBQU0sTUFBTSxJQUFJLFlBQVksT0FBTyxVQUFVLEVBQUUsR0FBRyxLQUFLLGVBQWUsVUFBVSxLQUFLLENBQUM7QUFDdEYsU0FBSyxjQUFjLEdBQUc7QUFBQSxFQUN2QjtBQUFBLEVBRUEsUUFBUSxTQUFzQztBQUM3QyxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsVUFBTSxNQUFNLElBQUksWUFBWSxPQUFPLEtBQUssUUFBUSxZQUFZLEdBQUcsT0FBTztBQUd0RSxTQUFLLE9BQU8sUUFBUSxTQUFTO0FBQzdCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssY0FBYyxLQUFLLEVBQUUsTUFBTSxRQUFRLE1BQU0sS0FBSyxRQUFRLE9BQU8sT0FBTyxVQUFVLEtBQUssUUFBUSxZQUFZLEVBQUUsQ0FBQztBQUcvRyxTQUFLLFdBQVc7QUFHaEIsUUFBSSxhQUFnQyxFQUFFLGFBQWEsUUFBUSxlQUFlLHNCQUFzQixPQUFPO0FBQ3ZHLFFBQUksUUFBUSxrQkFBa0I7QUFDN0IsbUJBQWE7QUFBQSxRQUNaLGFBQWEsc0JBQXNCO0FBQUEsUUFDbkMsa0JBQWtCLFFBQVE7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGdCQUFnQixJQUFJLHdCQUF3QjtBQUdqRCxVQUFNLHFCQUFxQixLQUFLLFFBQVEsVUFBVSxhQUFhLGtCQUFrQjtBQUNqRixRQUFJLG1CQUFtQixpQkFBaUI7QUFDeEMsWUFBUSxvQkFBb0I7QUFBQSxNQUMzQixLQUFLO0FBQ0osMkJBQW1CLGlCQUFpQjtBQUNwQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLRCxLQUFLO0FBQ0osMkJBQW1CLGlCQUFpQjtBQUNwQztBQUFBLElBQ0Y7QUFFQSxVQUFNLEVBQUUsVUFBVSxnQkFBZ0IsZUFBZSxJQUFJLGFBQWEsb0JBQW9CLEtBQUssT0FBTztBQUNsRyxVQUFNLG9CQUFvQixJQUFJLGtCQUFrQixrQkFBa0IsUUFBUSxtQkFBbUIsY0FBYyxnQkFBZ0IsUUFBUSxtQkFBbUIsZ0JBQWdCLFFBQVEsbUJBQW1CLHNCQUFzQixjQUFjO0FBQ3JPLFVBQU0sZUFBZSxhQUFhLE9BQU8sS0FBSyxzQkFBc0IsS0FBSyxPQUFPO0FBRWhGLFVBQU0sY0FBYztBQUFBLE1BQ25CLEtBQUsseUJBQXlCO0FBQUEsTUFDOUI7QUFBQSxNQUNBLEtBQUssUUFBUSxZQUFZO0FBQUEsTUFDekI7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLLGNBQWM7QUFBQSxJQUNwQjtBQUVBLFlBQVEsSUFBSSxDQUFDLGFBQWEsWUFBWSxDQUFDLEVBQUUsS0FBSyxPQUFPLENBQUNDLGNBQWFDLGFBQVksTUFBTTtBQUVwRixXQUFLLGVBQWUsUUFBUTtBQUU1QixVQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QixRQUFBRCxhQUFZLFdBQVcsUUFBUTtBQUMvQjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGdCQUFnQixTQUFTO0FBQzdCLFVBQUksQ0FBQyxpQkFBaUJBLGFBQVksZ0JBQWdCO0FBQ2pELHdCQUFnQixNQUFNLEtBQUssa0JBQWtCLFNBQVM7QUFBQSxNQUN2RDtBQUVBLFVBQUksS0FBSyxrQkFBa0IsUUFBVztBQUNyQyxRQUFBQSxhQUFZLFdBQVcsUUFBUTtBQUMvQjtBQUFBLE1BQ0Q7QUFFQSxZQUFNRSxTQUFRLEtBQUssUUFBUSxTQUFTO0FBUXBDLFlBQU1DLE9BQU0sSUFBSSxZQUFZRCxRQUFPLEtBQUssUUFBUSxZQUFZLEdBQUcsT0FBTztBQUN0RSxZQUFNLHFCQUFxQjtBQUFBLFFBQzFCLEdBQUcsa0JBQWtCO0FBQUEsUUFDckIscUJBQXFCLENBQUMsS0FBSyxRQUFRLFVBQVUsYUFBYSxPQUFPLEVBQUU7QUFBQSxNQUNwRTtBQUNBLFdBQUssbUJBQW1CLElBQUk7QUFBQSxRQUFnQkYsYUFBWTtBQUFBLFFBQU8sS0FBSyxTQUFVO0FBQUEsUUFBUTtBQUFBLFVBQ3JGLG9CQUFvQkcsS0FBSTtBQUFBLFVBQ3hCLHFCQUFxQkEsS0FBSSxTQUFTLEtBQUssU0FBVTtBQUFBLFFBQ2xEO0FBQUEsUUFDQ0Y7QUFBQSxRQUNBLEtBQUssUUFBUSxVQUFVLGFBQWEsT0FBTztBQUFBLFFBQzNDLEtBQUssUUFBUSxVQUFVLGFBQWEsa0JBQWtCO0FBQUEsUUFDdEQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLFdBQUssdUJBQXVCLElBQUlELGFBQVksVUFBVTtBQUV0RCxXQUFLLGNBQWNHLElBQUc7QUFHdEIsV0FBSywwQkFBMEJILGFBQVksU0FBUztBQUdwRCxVQUFJLENBQUMsS0FBSyxZQUFZLFdBQVcsS0FBSyxZQUFZLHdCQUF3QjtBQUN6RSxtQkFBVyxRQUFRQSxhQUFZLE9BQU87QUFDckMsY0FBSSxLQUFLLFdBQVc7QUFDbkIsaUJBQUssWUFBWSxLQUFLLHFEQUFxRCxLQUFLLFNBQVMsaUJBQWlCLElBQUksS0FBSyxVQUFVO0FBQUEsVUFDOUg7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBRUQsQ0FBQyxFQUFFLE1BQU0saUJBQWlCO0FBQUEsRUFDM0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsMEJBQTBCLFdBQXNDO0FBQ3ZFLFFBQUksS0FBSyxPQUFPLElBQUksTUFBUTtBQUMzQjtBQUFBLElBQ0Q7QUFFQSxlQUFXLE1BQU07QUFPaEIsV0FBSyxrQkFBa0IsV0FBK0MsMEJBQTBCLEVBQUUsTUFBTSxLQUFLLFVBQVUsU0FBUyxFQUFFLENBQUM7QUFDbkksV0FBSyxZQUFZLE1BQU0sMEJBQTBCLFNBQVM7QUFBQSxJQUMzRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBTyxvQkFBb0IsUUFBcUY7QUFFL0csVUFBTSxTQUFTLG9CQUFJLElBQXdCO0FBRzNDLFVBQU0scUJBQXFCLE9BQU8sVUFBVSxhQUFhLGtCQUFrQjtBQUMzRSxRQUFJLHVCQUF1QixRQUFRO0FBQ2xDLGFBQU8sSUFBSSxtQkFBbUIsT0FBTztBQUFBLElBQ3RDO0FBR0EsVUFBTSxpQkFBaUIsT0FBTyxVQUFVLGFBQWEsT0FBTztBQUM1RCxRQUFJLENBQUMsZUFBZSxhQUFhO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixNQUFNO0FBQUEsSUFBRztBQUMxRSxRQUFJLENBQUMsZUFBZSxlQUFlO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixRQUFRO0FBQUEsSUFBRztBQUM5RSxRQUFJLENBQUMsZUFBZSxrQkFBa0I7QUFBRSxhQUFPLElBQUksbUJBQW1CLFdBQVc7QUFBQSxJQUFHO0FBQ3BGLFFBQUksQ0FBQyxlQUFlLFlBQVk7QUFBRSxhQUFPLElBQUksbUJBQW1CLEtBQUs7QUFBQSxJQUFHO0FBQ3hFLFFBQUksQ0FBQyxlQUFlLGVBQWU7QUFBRSxhQUFPLElBQUksbUJBQW1CLFFBQVE7QUFBQSxJQUFHO0FBQzlFLFFBQUksQ0FBQyxlQUFlLGFBQWE7QUFBRSxhQUFPLElBQUksbUJBQW1CLEtBQUs7QUFBQSxJQUFHO0FBQ3pFLFFBQUksQ0FBQyxlQUFlLGFBQWE7QUFBRSxhQUFPLElBQUksbUJBQW1CLE1BQU07QUFBQSxJQUFHO0FBQzFFLFFBQUksQ0FBQyxlQUFlLGdCQUFnQjtBQUFFLGFBQU8sSUFBSSxtQkFBbUIsU0FBUztBQUFBLElBQUc7QUFDaEYsUUFBSSxDQUFDLGVBQWUsYUFBYTtBQUFFLGFBQU8sSUFBSSxtQkFBbUIsTUFBTTtBQUFBLElBQUc7QUFDMUUsUUFBSSxDQUFDLGVBQWUsZ0JBQWdCO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixRQUFRO0FBQUEsSUFBRztBQUMvRSxRQUFJLENBQUMsZUFBZSxZQUFZO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixLQUFLO0FBQUEsSUFBRztBQUN4RSxRQUFJLENBQUMsZUFBZSxlQUFlO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixRQUFRO0FBQUEsSUFBRztBQUM5RSxRQUFJLENBQUMsZUFBZSxXQUFXO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixJQUFJO0FBQUEsSUFBRztBQUN0RSxRQUFJLENBQUMsZUFBZSxZQUFZO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixLQUFLO0FBQUEsSUFBRztBQUN4RSxRQUFJLENBQUMsZUFBZSxlQUFlO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixRQUFRO0FBQUEsSUFBRztBQUM5RSxRQUFJLENBQUMsZUFBZSxXQUFXO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixJQUFJO0FBQUEsSUFBRztBQUN0RSxRQUFJLENBQUMsZUFBZSxpQkFBaUI7QUFBRSxhQUFPLElBQUksbUJBQW1CLFVBQVU7QUFBQSxJQUFHO0FBQ2xGLFFBQUksQ0FBQyxlQUFlLGNBQWM7QUFBRSxhQUFPLElBQUksbUJBQW1CLE9BQU87QUFBQSxJQUFHO0FBQzVFLFFBQUksQ0FBQyxlQUFlLFdBQVc7QUFBRSxhQUFPLElBQUksbUJBQW1CLElBQUk7QUFBQSxJQUFHO0FBQ3RFLFFBQUksQ0FBQyxlQUFlLFlBQVk7QUFBRSxhQUFPLElBQUksbUJBQW1CLEtBQUs7QUFBQSxJQUFHO0FBQ3hFLFFBQUksQ0FBQyxlQUFlLFdBQVc7QUFBRSxhQUFPLElBQUksbUJBQW1CLElBQUk7QUFBQSxJQUFHO0FBQ3RFLFFBQUksQ0FBQyxlQUFlLGdCQUFnQjtBQUFFLGFBQU8sSUFBSSxtQkFBbUIsU0FBUztBQUFBLElBQUc7QUFDaEYsUUFBSSxDQUFDLGVBQWUsWUFBWTtBQUFFLGFBQU8sSUFBSSxtQkFBbUIsV0FBVztBQUFBLElBQUc7QUFDOUUsUUFBSSxDQUFDLGVBQWUsYUFBYTtBQUFFLGFBQU8sSUFBSSxtQkFBbUIsTUFBTTtBQUFBLElBQUc7QUFDMUUsUUFBSSxDQUFDLGVBQWUsb0JBQW9CO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixhQUFhO0FBQUEsSUFBRztBQUN4RixRQUFJLENBQUMsZUFBZSxjQUFjO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixPQUFPO0FBQUEsSUFBRztBQUM1RSxRQUFJLENBQUMsZUFBZSxXQUFXO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixJQUFJO0FBQUEsSUFBRztBQUN0RSxRQUFJLENBQUMsZUFBZSxZQUFZO0FBQUUsYUFBTyxJQUFJLG1CQUFtQixLQUFLO0FBQUEsSUFBRztBQUV4RSxXQUFPLEVBQUUsVUFBVSxRQUFRLGdCQUFnQixlQUFlLGVBQWU7QUFBQSxFQUMxRTtBQUFBLEVBRVEsY0FBYyxLQUF3QjtBQUU3QyxRQUFJLENBQUMsS0FBSyxVQUFVO0FBRW5CO0FBQUEsSUFDRDtBQUVBLFFBQUksSUFBSSxlQUFlLEtBQUssU0FBUyxZQUFZO0FBRWhELFdBQUssT0FBTztBQUNaO0FBQUEsSUFDRDtBQUVBLFFBQUkscUJBQXFCLElBQUksa0JBQWtCLE1BQU0scUJBQXFCLEtBQUssU0FBUyxrQkFBa0IsR0FBRztBQUc1RyxXQUFLLE9BQU87QUFDWjtBQUFBLElBQ0Q7QUFFQSxRQUFJLElBQUksU0FBUyxLQUFLLFNBQVMsUUFBUTtBQUV0QyxVQUFJLElBQUksWUFBWSxNQUFNO0FBQ3pCLGFBQUssUUFBUSxFQUFFLE1BQU0sS0FBSyxTQUFTLGVBQWUsTUFBTSxXQUFXLEtBQUssQ0FBQztBQUFBLE1BQzFFLE9BQU87QUFDTixhQUFLLE9BQU87QUFBQSxNQUNiO0FBQ0E7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssa0JBQWtCO0FBRTNCO0FBQUEsSUFDRDtBQUVBLFFBQUksSUFBSSxZQUFZLEtBQUssV0FBVyxLQUFLLElBQUksWUFBWSxjQUFjLEtBQUssU0FBUyxZQUFZLGFBQWE7QUFFN0csWUFBTSxvQkFBb0IsWUFBWSxrQkFBa0IsS0FBSyxPQUFPO0FBQ3BFLFVBQUkscUJBQXFCLEtBQUssVUFBVTtBQUd2QyxjQUFNLE1BQU0sS0FBSyxpQkFBaUIsbUJBQW1CO0FBQ3JELGFBQUssUUFBUTtBQUFBLFVBQ1osTUFBTSxLQUFLLFNBQVMsZUFBZTtBQUFBLFVBQ25DLFdBQVc7QUFBQSxVQUNYLGVBQWUsS0FBSyxpQkFBaUI7QUFBQSxVQUNyQyxtQkFBbUIsRUFBRSxzQkFBc0IsSUFBSTtBQUFBLFFBQ2hELENBQUM7QUFBQSxNQUNGO0FBQ0E7QUFBQSxJQUNEO0FBRUEsUUFBSSxJQUFJLFNBQVMsS0FBSyxTQUFTLFVBQVUsS0FBSyxpQkFBaUIsc0JBQXNCLEVBQUUsT0FBTyxLQUFLLElBQUksWUFBWSxLQUFLLFdBQVcsR0FBRztBQUdySSxZQUFNLHVCQUF1QixvQkFBSSxJQUE4QztBQUMvRSxZQUFNLGlCQUFpQixvQkFBSSxJQUE0QjtBQUN2RCxpQkFBVyxDQUFDLFVBQVUsS0FBSyxLQUFLLEtBQUssaUJBQWlCLG1CQUFtQixHQUFHO0FBQzNFLFlBQUksTUFBTSxTQUFTLEtBQUssTUFBTSxDQUFDLEVBQUUsVUFBVSxZQUFZO0FBQ3RELHlCQUFlLElBQUksUUFBUTtBQUFBLFFBQzVCLE9BQU87QUFDTiwrQkFBcUIsSUFBSSxVQUFVLEtBQUs7QUFBQSxRQUN6QztBQUFBLE1BQ0Q7QUFFQSxXQUFLLFFBQVE7QUFBQSxRQUNaLE1BQU0sS0FBSyxTQUFTLGVBQWU7QUFBQSxRQUNuQyxhQUFhLHNCQUFzQjtBQUFBLFFBQ25DLFdBQVc7QUFBQSxRQUNYLGVBQWUsS0FBSyxpQkFBaUI7QUFBQSxRQUNyQyxtQkFBbUIsRUFBRSxnQkFBZ0IscUJBQXFCO0FBQUEsTUFDM0QsQ0FBQztBQUFBLElBRUYsT0FBTztBQUVOLFlBQU0saUJBQWlCLEtBQUssaUJBQWlCO0FBQzdDLFVBQUksV0FBVztBQUVmLFdBQUssaUJBQWlCLGNBQWM7QUFBQSxRQUNuQyxvQkFBb0IsSUFBSTtBQUFBLFFBQ3hCLHFCQUFxQixJQUFJLFNBQVMsS0FBSyxTQUFTO0FBQUEsTUFDakQ7QUFFQSxVQUFJLEtBQUssaUJBQWlCLE1BQU0sV0FBVyxHQUFHO0FBRTdDLGNBQU0sb0JBQW9CLFlBQVksa0JBQWtCLEtBQUssT0FBTztBQUNwRSxZQUFJLENBQUMsS0FBSyxVQUFVO0FBR25CLGVBQUssT0FBTztBQUNaO0FBQUEsUUFDRDtBQUVBLFlBQUkscUJBQXFCLEtBQUssU0FBUyxZQUFZLFlBQVksSUFBSSxZQUFZLGFBQWE7QUFFM0YsZUFBSyxRQUFRLEVBQUUsTUFBTSxLQUFLLFNBQVMsZUFBZSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQ3pFO0FBQUEsUUFDRDtBQUVBLFlBQUksQ0FBQyxLQUFLLFNBQVMsZUFBZSxNQUFNO0FBRXZDLGVBQUssaUJBQWlCLGNBQWM7QUFDcEMscUJBQVcsS0FBSyxpQkFBaUIsTUFBTSxTQUFTO0FBRWhELGNBQUksWUFBWSxJQUFJLFlBQVksS0FBSyxXQUFXLEdBQUc7QUFHbEQsaUJBQUssT0FBTztBQUNaO0FBQUEsVUFDRDtBQUFBLFFBRUQsT0FBTztBQUVOLGVBQUssT0FBTztBQUNaO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGNBQWMsS0FBSztBQUFBLFFBQ3ZCLGlCQUFpQixLQUFLO0FBQUEsUUFDdEIsZ0JBQWdCLElBQUk7QUFBQSxRQUNwQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFwc0JhLGVBQU47QUFBQSxFQXdCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQS9CVTsiLAogICJuYW1lcyI6IFsiU3RhdGUiLCAiY29tcGxldGlvbnMiLCAid29yZERpc3RhbmNlIiwgIm1vZGVsIiwgImN0eCJdCn0K
