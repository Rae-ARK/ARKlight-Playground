import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { FuzzyScore } from "../../../../base/common/filters.js";
import { DisposableStore, isDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import * as languages from "../../../common/languages.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { SnippetParser } from "../../snippet/browser/snippetParser.js";
import { localize } from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { historyNavigationVisible } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { StandardTokenType } from "../../../common/encodedTokenAttributes.js";
const Context = {
  Visible: historyNavigationVisible,
  HasFocusedSuggestion: new RawContextKey("suggestWidgetHasFocusedSuggestion", false, localize("suggestWidgetHasSelection", "Whether any suggestion is focused")),
  DetailsVisible: new RawContextKey("suggestWidgetDetailsVisible", false, localize("suggestWidgetDetailsVisible", "Whether suggestion details are visible")),
  DetailsFocused: new RawContextKey("suggestWidgetDetailsFocused", false, localize("suggestWidgetDetailsFocused", "Whether the details pane of the suggest widget has focus")),
  MultipleSuggestions: new RawContextKey("suggestWidgetMultipleSuggestions", false, localize("suggestWidgetMultipleSuggestions", "Whether there are multiple suggestions to pick from")),
  MakesTextEdit: new RawContextKey("suggestionMakesTextEdit", true, localize("suggestionMakesTextEdit", "Whether inserting the current suggestion yields in a change or has everything already been typed")),
  AcceptSuggestionsOnEnter: new RawContextKey("acceptSuggestionOnEnter", true, localize("acceptSuggestionOnEnter", "Whether suggestions are inserted when pressing Enter")),
  HasInsertAndReplaceRange: new RawContextKey("suggestionHasInsertAndReplaceRange", false, localize("suggestionHasInsertAndReplaceRange", "Whether the current suggestion has insert and replace behaviour")),
  InsertMode: new RawContextKey("suggestionInsertMode", void 0, { type: "string", description: localize("suggestionInsertMode", "Whether the default behaviour is to insert or replace") }),
  CanResolve: new RawContextKey("suggestionCanResolve", false, localize("suggestionCanResolve", "Whether the current suggestion supports to resolve further details"))
};
const suggestWidgetStatusbarMenu = new MenuId("suggestWidgetStatusBar");
class CompletionItem {
  constructor(position, completion, container, provider) {
    this.position = position;
    this.completion = completion;
    this.container = container;
    this.provider = provider;
    // validation
    this.isInvalid = false;
    // sorting, filtering
    this.score = FuzzyScore.Default;
    this.distance = 0;
    this.textLabel = typeof completion.label === "string" ? completion.label : completion.label?.label;
    this.labelLow = this.textLabel.toLowerCase();
    this.isInvalid = !this.textLabel;
    this.sortTextLow = completion.sortText && completion.sortText.toLowerCase();
    this.filterTextLow = completion.filterText && completion.filterText.toLowerCase();
    this.extensionId = completion.extensionId;
    if (Range.isIRange(completion.range)) {
      this.editStart = new Position(completion.range.startLineNumber, completion.range.startColumn);
      this.editInsertEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
      this.editReplaceEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
      this.isInvalid = this.isInvalid || Range.spansMultipleLines(completion.range) || completion.range.startLineNumber !== position.lineNumber;
    } else {
      this.editStart = new Position(completion.range.insert.startLineNumber, completion.range.insert.startColumn);
      this.editInsertEnd = new Position(completion.range.insert.endLineNumber, completion.range.insert.endColumn);
      this.editReplaceEnd = new Position(completion.range.replace.endLineNumber, completion.range.replace.endColumn);
      this.isInvalid = this.isInvalid || Range.spansMultipleLines(completion.range.insert) || Range.spansMultipleLines(completion.range.replace) || completion.range.insert.startLineNumber !== position.lineNumber || completion.range.replace.startLineNumber !== position.lineNumber || completion.range.insert.startColumn !== completion.range.replace.startColumn;
    }
    if (typeof provider.resolveCompletionItem !== "function") {
      this._resolveCache = Promise.resolve();
      this._resolveDuration = 0;
    }
  }
  // ---- resolving
  get isResolved() {
    return this._resolveDuration !== void 0;
  }
  get resolveDuration() {
    return this._resolveDuration !== void 0 ? this._resolveDuration : -1;
  }
  async resolve(token) {
    if (!this._resolveCache) {
      const sub = token.onCancellationRequested(() => {
        this._resolveCache = void 0;
        this._resolveDuration = void 0;
      });
      const sw = new StopWatch(true);
      this._resolveCache = Promise.resolve(this.provider.resolveCompletionItem(this.completion, token)).then((value) => {
        Object.assign(this.completion, value);
        this._resolveDuration = sw.elapsed();
      }, (err) => {
        if (isCancellationError(err)) {
          this._resolveCache = void 0;
          this._resolveDuration = void 0;
        }
      }).finally(() => {
        sub.dispose();
      });
    }
    return this._resolveCache;
  }
}
var SnippetSortOrder = /* @__PURE__ */ ((SnippetSortOrder2) => {
  SnippetSortOrder2[SnippetSortOrder2["Top"] = 0] = "Top";
  SnippetSortOrder2[SnippetSortOrder2["Inline"] = 1] = "Inline";
  SnippetSortOrder2[SnippetSortOrder2["Bottom"] = 2] = "Bottom";
  return SnippetSortOrder2;
})(SnippetSortOrder || {});
const _CompletionOptions = class _CompletionOptions {
  constructor(snippetSortOrder = 2 /* Bottom */, kindFilter = /* @__PURE__ */ new Set(), providerFilter = /* @__PURE__ */ new Set(), providerItemsToReuse = /* @__PURE__ */ new Map(), showDeprecated = true) {
    this.snippetSortOrder = snippetSortOrder;
    this.kindFilter = kindFilter;
    this.providerFilter = providerFilter;
    this.providerItemsToReuse = providerItemsToReuse;
    this.showDeprecated = showDeprecated;
  }
};
_CompletionOptions.default = new _CompletionOptions();
let CompletionOptions = _CompletionOptions;
let _snippetSuggestSupport;
function getSnippetSuggestSupport() {
  return _snippetSuggestSupport;
}
function setSnippetSuggestSupport(support) {
  const old = _snippetSuggestSupport;
  _snippetSuggestSupport = support;
  return old;
}
class CompletionItemModel {
  constructor(items, needsClipboard, durations, disposable) {
    this.items = items;
    this.needsClipboard = needsClipboard;
    this.durations = durations;
    this.disposable = disposable;
  }
}
async function provideSuggestionItems(registry, model, position, options = CompletionOptions.default, context = { triggerKind: languages.CompletionTriggerKind.Invoke }, token = CancellationToken.None) {
  const sw = new StopWatch();
  position = position.clone();
  const word = model.getWordAtPosition(position);
  const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position);
  const defaultRange = { replace: defaultReplaceRange, insert: defaultReplaceRange.setEndPosition(position.lineNumber, position.column) };
  const result = [];
  const disposables = new DisposableStore();
  const durations = [];
  let needsClipboard = false;
  const onCompletionList = (provider, container, sw2) => {
    let didAddResult = false;
    if (!container) {
      return didAddResult;
    }
    for (const suggestion of container.suggestions) {
      if (!options.kindFilter.has(suggestion.kind)) {
        if (!options.showDeprecated && suggestion?.tags?.includes(languages.CompletionItemTag.Deprecated)) {
          continue;
        }
        if (!suggestion.range) {
          suggestion.range = defaultRange;
        }
        if (!suggestion.sortText) {
          suggestion.sortText = typeof suggestion.label === "string" ? suggestion.label : suggestion.label.label;
        }
        if (!needsClipboard && suggestion.insertTextRules && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
          needsClipboard = SnippetParser.guessNeedsClipboard(suggestion.insertText);
        }
        result.push(new CompletionItem(position, suggestion, container, provider));
        didAddResult = true;
      }
    }
    if (isDisposable(container)) {
      disposables.add(container);
    }
    durations.push({
      providerName: provider._debugDisplayName ?? "unknown_provider",
      elapsedProvider: container.duration ?? -1,
      elapsedOverall: sw2.elapsed()
    });
    return didAddResult;
  };
  const snippetCompletions = (async () => {
    if (!_snippetSuggestSupport || options.kindFilter.has(languages.CompletionItemKind.Snippet)) {
      return;
    }
    const reuseItems = options.providerItemsToReuse.get(_snippetSuggestSupport);
    if (reuseItems) {
      reuseItems.forEach((item) => result.push(item));
      return;
    }
    if (options.providerFilter.size > 0 && !options.providerFilter.has(_snippetSuggestSupport)) {
      return;
    }
    const sw2 = new StopWatch();
    const list = await _snippetSuggestSupport.provideCompletionItems(model, position, context, token);
    onCompletionList(_snippetSuggestSupport, list, sw2);
  })();
  for (const providerGroup of registry.orderedGroups(model)) {
    let didAddResult = false;
    await Promise.all(providerGroup.map(async (provider) => {
      if (options.providerItemsToReuse.has(provider)) {
        const items = options.providerItemsToReuse.get(provider);
        items.forEach((item) => result.push(item));
        didAddResult = didAddResult || items.length > 0;
        return;
      }
      if (options.providerFilter.size > 0 && !options.providerFilter.has(provider)) {
        return;
      }
      try {
        const sw2 = new StopWatch();
        const list = await provider.provideCompletionItems(model, position, context, token);
        didAddResult = onCompletionList(provider, list, sw2) || didAddResult;
      } catch (err) {
        onUnexpectedExternalError(err);
      }
    }));
    if (didAddResult || token.isCancellationRequested) {
      break;
    }
  }
  await snippetCompletions;
  if (token.isCancellationRequested) {
    disposables.dispose();
    return Promise.reject(new CancellationError());
  }
  return new CompletionItemModel(
    result.sort(getSuggestionComparator(options.snippetSortOrder)),
    needsClipboard,
    { entries: durations, elapsed: sw.elapsed() },
    disposables
  );
}
function defaultComparator(a, b) {
  if (a.sortTextLow && b.sortTextLow) {
    if (a.sortTextLow < b.sortTextLow) {
      return -1;
    } else if (a.sortTextLow > b.sortTextLow) {
      return 1;
    }
  }
  if (a.textLabel < b.textLabel) {
    return -1;
  } else if (a.textLabel > b.textLabel) {
    return 1;
  }
  return a.completion.kind - b.completion.kind;
}
function snippetUpComparator(a, b) {
  if (a.completion.kind !== b.completion.kind) {
    if (a.completion.kind === languages.CompletionItemKind.Snippet) {
      return -1;
    } else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
      return 1;
    }
  }
  return defaultComparator(a, b);
}
function snippetDownComparator(a, b) {
  if (a.completion.kind !== b.completion.kind) {
    if (a.completion.kind === languages.CompletionItemKind.Snippet) {
      return 1;
    } else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
      return -1;
    }
  }
  return defaultComparator(a, b);
}
const _snippetComparators = /* @__PURE__ */ new Map();
_snippetComparators.set(0 /* Top */, snippetUpComparator);
_snippetComparators.set(2 /* Bottom */, snippetDownComparator);
_snippetComparators.set(1 /* Inline */, defaultComparator);
function getSuggestionComparator(snippetConfig) {
  return _snippetComparators.get(snippetConfig);
}
CommandsRegistry.registerCommand("_executeCompletionItemProvider", async (accessor, ...args) => {
  const [uri, position, triggerCharacter, maxItemsToResolve] = args;
  assertType(URI.isUri(uri));
  assertType(Position.isIPosition(position));
  assertType(typeof triggerCharacter === "string" || !triggerCharacter);
  assertType(typeof maxItemsToResolve === "number" || !maxItemsToResolve);
  const { completionProvider } = accessor.get(ILanguageFeaturesService);
  const ref = await accessor.get(ITextModelService).createModelReference(uri);
  try {
    const result = {
      incomplete: false,
      suggestions: []
    };
    const resolving = [];
    const actualPosition = ref.object.textEditorModel.validatePosition(position);
    const completions = await provideSuggestionItems(completionProvider, ref.object.textEditorModel, actualPosition, void 0, { triggerCharacter: triggerCharacter ?? void 0, triggerKind: triggerCharacter ? languages.CompletionTriggerKind.TriggerCharacter : languages.CompletionTriggerKind.Invoke });
    for (const item of completions.items) {
      if (resolving.length < (maxItemsToResolve ?? 0)) {
        resolving.push(item.resolve(CancellationToken.None));
      }
      result.incomplete = result.incomplete || item.container.incomplete;
      result.suggestions.push(item.completion);
    }
    try {
      await Promise.all(resolving);
      return result;
    } finally {
      setTimeout(() => completions.disposable.dispose(), 100);
    }
  } finally {
    ref.dispose();
  }
});
function showSimpleSuggestions(editor, provider) {
  editor.getContribution("editor.contrib.suggestController")?.triggerSuggest(
    (/* @__PURE__ */ new Set()).add(provider),
    void 0,
    true
  );
}
class QuickSuggestionsOptions {
  static isAllOff(config) {
    return config.other === "off" && config.comments === "off" && config.strings === "off";
  }
  static isAllOn(config) {
    return config.other === "on" && config.comments === "on" && config.strings === "on";
  }
  static valueFor(config, tokenType) {
    switch (tokenType) {
      case StandardTokenType.Comment:
        return config.comments;
      case StandardTokenType.String:
        return config.strings;
      default:
        return config.other;
    }
  }
}
export {
  CompletionItem,
  CompletionItemModel,
  CompletionOptions,
  Context,
  QuickSuggestionsOptions,
  SnippetSortOrder,
  getSnippetSuggestSupport,
  getSuggestionComparator,
  provideSuggestionItems,
  setSnippetSuggestSupport,
  showSimpleSuggestions,
  suggestWidgetStatusbarMenu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgaXNEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIgfSBmcm9tICcuLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFBhcnNlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgaGlzdG9yeU5hdmlnYXRpb25WaXNpYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2NvbnRleHRTY29wZWRIaXN0b3J5V2lkZ2V0LmpzJztcbmltcG9ydCB7IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMsIFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IENvbnRleHQgPSB7XG5cdFZpc2libGU6IGhpc3RvcnlOYXZpZ2F0aW9uVmlzaWJsZSxcblx0SGFzRm9jdXNlZFN1Z2dlc3Rpb246IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb24nLCBmYWxzZSwgbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXRIYXNTZWxlY3Rpb24nLCBcIldoZXRoZXIgYW55IHN1Z2dlc3Rpb24gaXMgZm9jdXNlZFwiKSksXG5cdERldGFpbHNWaXNpYmxlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc3VnZ2VzdFdpZGdldERldGFpbHNWaXNpYmxlJywgZmFsc2UsIGxvY2FsaXplKCdzdWdnZXN0V2lkZ2V0RGV0YWlsc1Zpc2libGUnLCBcIldoZXRoZXIgc3VnZ2VzdGlvbiBkZXRhaWxzIGFyZSB2aXNpYmxlXCIpKSxcblx0RGV0YWlsc0ZvY3VzZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0V2lkZ2V0RGV0YWlsc0ZvY3VzZWQnLCBmYWxzZSwgbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXREZXRhaWxzRm9jdXNlZCcsIFwiV2hldGhlciB0aGUgZGV0YWlscyBwYW5lIG9mIHRoZSBzdWdnZXN0IHdpZGdldCBoYXMgZm9jdXNcIikpLFxuXHRNdWx0aXBsZVN1Z2dlc3Rpb25zOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMnLCBmYWxzZSwgbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXRNdWx0aXBsZVN1Z2dlc3Rpb25zJywgXCJXaGV0aGVyIHRoZXJlIGFyZSBtdWx0aXBsZSBzdWdnZXN0aW9ucyB0byBwaWNrIGZyb21cIikpLFxuXHRNYWtlc1RleHRFZGl0OiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc3VnZ2VzdGlvbk1ha2VzVGV4dEVkaXQnLCB0cnVlLCBsb2NhbGl6ZSgnc3VnZ2VzdGlvbk1ha2VzVGV4dEVkaXQnLCBcIldoZXRoZXIgaW5zZXJ0aW5nIHRoZSBjdXJyZW50IHN1Z2dlc3Rpb24geWllbGRzIGluIGEgY2hhbmdlIG9yIGhhcyBldmVyeXRoaW5nIGFscmVhZHkgYmVlbiB0eXBlZFwiKSksXG5cdEFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlcjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyJywgdHJ1ZSwgbG9jYWxpemUoJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyJywgXCJXaGV0aGVyIHN1Z2dlc3Rpb25zIGFyZSBpbnNlcnRlZCB3aGVuIHByZXNzaW5nIEVudGVyXCIpKSxcblx0SGFzSW5zZXJ0QW5kUmVwbGFjZVJhbmdlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc3VnZ2VzdGlvbkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZScsIGZhbHNlLCBsb2NhbGl6ZSgnc3VnZ2VzdGlvbkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZScsIFwiV2hldGhlciB0aGUgY3VycmVudCBzdWdnZXN0aW9uIGhhcyBpbnNlcnQgYW5kIHJlcGxhY2UgYmVoYXZpb3VyXCIpKSxcblx0SW5zZXJ0TW9kZTogbmV3IFJhd0NvbnRleHRLZXk8J2luc2VydCcgfCAncmVwbGFjZSc+KCdzdWdnZXN0aW9uSW5zZXJ0TW9kZScsIHVuZGVmaW5lZCwgeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdzdWdnZXN0aW9uSW5zZXJ0TW9kZScsIFwiV2hldGhlciB0aGUgZGVmYXVsdCBiZWhhdmlvdXIgaXMgdG8gaW5zZXJ0IG9yIHJlcGxhY2VcIikgfSksXG5cdENhblJlc29sdmU6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0aW9uQ2FuUmVzb2x2ZScsIGZhbHNlLCBsb2NhbGl6ZSgnc3VnZ2VzdGlvbkNhblJlc29sdmUnLCBcIldoZXRoZXIgdGhlIGN1cnJlbnQgc3VnZ2VzdGlvbiBzdXBwb3J0cyB0byByZXNvbHZlIGZ1cnRoZXIgZGV0YWlsc1wiKSksXG59O1xuXG5leHBvcnQgY29uc3Qgc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUgPSBuZXcgTWVudUlkKCdzdWdnZXN0V2lkZ2V0U3RhdHVzQmFyJyk7XG5cbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uSXRlbSB7XG5cblx0X2JyYW5kITogJ0lTdWdnZXN0aW9uSXRlbSc7XG5cblx0Ly9cblx0cmVhZG9ubHkgZWRpdFN0YXJ0OiBJUG9zaXRpb247XG5cdHJlYWRvbmx5IGVkaXRJbnNlcnRFbmQ6IElQb3NpdGlvbjtcblx0cmVhZG9ubHkgZWRpdFJlcGxhY2VFbmQ6IElQb3NpdGlvbjtcblxuXHQvL1xuXHRyZWFkb25seSB0ZXh0TGFiZWw6IHN0cmluZztcblxuXHQvLyBwZXJmXG5cdHJlYWRvbmx5IGxhYmVsTG93OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNvcnRUZXh0TG93Pzogc3RyaW5nO1xuXHRyZWFkb25seSBmaWx0ZXJUZXh0TG93Pzogc3RyaW5nO1xuXG5cdC8vIHZhbGlkYXRpb25cblx0cmVhZG9ubHkgaXNJbnZhbGlkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Ly8gc29ydGluZywgZmlsdGVyaW5nXG5cdHNjb3JlOiBGdXp6eVNjb3JlID0gRnV6enlTY29yZS5EZWZhdWx0O1xuXHRkaXN0YW5jZTogbnVtYmVyID0gMDtcblx0aWR4PzogbnVtYmVyO1xuXHR3b3JkPzogc3RyaW5nO1xuXG5cdC8vIGluc3RydW1lbnRhdGlvblxuXHRyZWFkb25seSBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cblx0Ly8gcmVzb2x2aW5nXG5cdHByaXZhdGUgX3Jlc29sdmVEdXJhdGlvbj86IG51bWJlcjtcblx0cHJpdmF0ZSBfcmVzb2x2ZUNhY2hlPzogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBwb3NpdGlvbjogSVBvc2l0aW9uLFxuXHRcdHJlYWRvbmx5IGNvbXBsZXRpb246IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbSxcblx0XHRyZWFkb25seSBjb250YWluZXI6IGxhbmd1YWdlcy5Db21wbGV0aW9uTGlzdCxcblx0XHRyZWFkb25seSBwcm92aWRlcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsXG5cdCkge1xuXHRcdHRoaXMudGV4dExhYmVsID0gdHlwZW9mIGNvbXBsZXRpb24ubGFiZWwgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IGNvbXBsZXRpb24ubGFiZWxcblx0XHRcdDogY29tcGxldGlvbi5sYWJlbD8ubGFiZWw7XG5cblx0XHQvLyBlbnN1cmUgbG93ZXItdmFyaWFudHMgKHBlcmYpXG5cdFx0dGhpcy5sYWJlbExvdyA9IHRoaXMudGV4dExhYmVsLnRvTG93ZXJDYXNlKCk7XG5cblx0XHQvLyB2YWxpZGF0ZSBsYWJlbFxuXHRcdHRoaXMuaXNJbnZhbGlkID0gIXRoaXMudGV4dExhYmVsO1xuXG5cdFx0dGhpcy5zb3J0VGV4dExvdyA9IGNvbXBsZXRpb24uc29ydFRleHQgJiYgY29tcGxldGlvbi5zb3J0VGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRcdHRoaXMuZmlsdGVyVGV4dExvdyA9IGNvbXBsZXRpb24uZmlsdGVyVGV4dCAmJiBjb21wbGV0aW9uLmZpbHRlclRleHQudG9Mb3dlckNhc2UoKTtcblxuXHRcdHRoaXMuZXh0ZW5zaW9uSWQgPSBjb21wbGV0aW9uLmV4dGVuc2lvbklkO1xuXG5cdFx0Ly8gbm9ybWFsaXplIHJhbmdlc1xuXHRcdGlmIChSYW5nZS5pc0lSYW5nZShjb21wbGV0aW9uLnJhbmdlKSkge1xuXHRcdFx0dGhpcy5lZGl0U3RhcnQgPSBuZXcgUG9zaXRpb24oY29tcGxldGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbXBsZXRpb24ucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0dGhpcy5lZGl0SW5zZXJ0RW5kID0gbmV3IFBvc2l0aW9uKGNvbXBsZXRpb24ucmFuZ2UuZW5kTGluZU51bWJlciwgY29tcGxldGlvbi5yYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0dGhpcy5lZGl0UmVwbGFjZUVuZCA9IG5ldyBQb3NpdGlvbihjb21wbGV0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIsIGNvbXBsZXRpb24ucmFuZ2UuZW5kQ29sdW1uKTtcblxuXHRcdFx0Ly8gdmFsaWRhdGUgcmFuZ2Vcblx0XHRcdHRoaXMuaXNJbnZhbGlkID0gdGhpcy5pc0ludmFsaWRcblx0XHRcdFx0fHwgUmFuZ2Uuc3BhbnNNdWx0aXBsZUxpbmVzKGNvbXBsZXRpb24ucmFuZ2UpIHx8IGNvbXBsZXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdFN0YXJ0ID0gbmV3IFBvc2l0aW9uKGNvbXBsZXRpb24ucmFuZ2UuaW5zZXJ0LnN0YXJ0TGluZU51bWJlciwgY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuc3RhcnRDb2x1bW4pO1xuXHRcdFx0dGhpcy5lZGl0SW5zZXJ0RW5kID0gbmV3IFBvc2l0aW9uKGNvbXBsZXRpb24ucmFuZ2UuaW5zZXJ0LmVuZExpbmVOdW1iZXIsIGNvbXBsZXRpb24ucmFuZ2UuaW5zZXJ0LmVuZENvbHVtbik7XG5cdFx0XHR0aGlzLmVkaXRSZXBsYWNlRW5kID0gbmV3IFBvc2l0aW9uKGNvbXBsZXRpb24ucmFuZ2UucmVwbGFjZS5lbmRMaW5lTnVtYmVyLCBjb21wbGV0aW9uLnJhbmdlLnJlcGxhY2UuZW5kQ29sdW1uKTtcblxuXHRcdFx0Ly8gdmFsaWRhdGUgcmFuZ2VzXG5cdFx0XHR0aGlzLmlzSW52YWxpZCA9IHRoaXMuaXNJbnZhbGlkXG5cdFx0XHRcdHx8IFJhbmdlLnNwYW5zTXVsdGlwbGVMaW5lcyhjb21wbGV0aW9uLnJhbmdlLmluc2VydCkgfHwgUmFuZ2Uuc3BhbnNNdWx0aXBsZUxpbmVzKGNvbXBsZXRpb24ucmFuZ2UucmVwbGFjZSlcblx0XHRcdFx0fHwgY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuc3RhcnRMaW5lTnVtYmVyICE9PSBwb3NpdGlvbi5saW5lTnVtYmVyIHx8IGNvbXBsZXRpb24ucmFuZ2UucmVwbGFjZS5zdGFydExpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXJcblx0XHRcdFx0fHwgY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuc3RhcnRDb2x1bW4gIT09IGNvbXBsZXRpb24ucmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbjtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgdGhlIHN1Z2dlc3Rpb24gcmVzb2x2ZXJcblx0XHRpZiAodHlwZW9mIHByb3ZpZGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNhY2hlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlRHVyYXRpb24gPSAwO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gcmVzb2x2aW5nXG5cblx0Z2V0IGlzUmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVEdXJhdGlvbiAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHJlc29sdmVEdXJhdGlvbigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlRHVyYXRpb24gIT09IHVuZGVmaW5lZCA/IHRoaXMuX3Jlc29sdmVEdXJhdGlvbiA6IC0xO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVDYWNoZSkge1xuXHRcdFx0Y29uc3Qgc3ViID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlQ2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVEdXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKHRydWUpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNhY2hlID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMucHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtISh0aGlzLmNvbXBsZXRpb24sIHRva2VuKSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24odGhpcy5jb21wbGV0aW9uLCB2YWx1ZSk7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVEdXJhdGlvbiA9IHN3LmVsYXBzZWQoKTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHQvLyB0aGUgSVBDIHF1ZXVlIHdpbGwgcmVqZWN0IHRoZSByZXF1ZXN0IHdpdGggdGhlXG5cdFx0XHRcdFx0Ly8gY2FuY2VsbGF0aW9uIGVycm9yIC0+IHJlc2V0IGNhY2hlZFxuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlRHVyYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQ2FjaGU7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU25pcHBldFNvcnRPcmRlciB7XG5cdFRvcCwgSW5saW5lLCBCb3R0b21cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25PcHRpb25zIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgZGVmYXVsdCA9IG5ldyBDb21wbGV0aW9uT3B0aW9ucygpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNuaXBwZXRTb3J0T3JkZXIgPSBTbmlwcGV0U29ydE9yZGVyLkJvdHRvbSxcblx0XHRyZWFkb25seSBraW5kRmlsdGVyID0gbmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kPigpLFxuXHRcdHJlYWRvbmx5IHByb3ZpZGVyRmlsdGVyID0gbmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj4oKSxcblx0XHRyZWFkb25seSBwcm92aWRlckl0ZW1zVG9SZXVzZTogUmVhZG9ubHlNYXA8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25JdGVtW10+ID0gbmV3IE1hcDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkl0ZW1bXT4oKSxcblx0XHRyZWFkb25seSBzaG93RGVwcmVjYXRlZCA9IHRydWVcblx0KSB7IH1cbn1cblxubGV0IF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U25pcHBldFN1Z2dlc3RTdXBwb3J0KCk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQoc3VwcG9ydDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQpOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG9sZCA9IF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQ7XG5cdF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQgPSBzdXBwb3J0O1xuXHRyZXR1cm4gb2xkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBsZXRpb25EdXJhdGlvbkVudHJ5IHtcblx0cmVhZG9ubHkgcHJvdmlkZXJOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVsYXBzZWRQcm92aWRlcjogbnVtYmVyO1xuXHRyZWFkb25seSBlbGFwc2VkT3ZlcmFsbDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBsZXRpb25EdXJhdGlvbnMge1xuXHRyZWFkb25seSBlbnRyaWVzOiByZWFkb25seSBDb21wbGV0aW9uRHVyYXRpb25FbnRyeVtdO1xuXHRyZWFkb25seSBlbGFwc2VkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uSXRlbU1vZGVsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaXRlbXM6IENvbXBsZXRpb25JdGVtW10sXG5cdFx0cmVhZG9ubHkgbmVlZHNDbGlwYm9hcmQ6IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgZHVyYXRpb25zOiBDb21wbGV0aW9uRHVyYXRpb25zLFxuXHRcdHJlYWRvbmx5IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhcblx0cmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPixcblx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdHBvc2l0aW9uOiBQb3NpdGlvbixcblx0b3B0aW9uczogQ29tcGxldGlvbk9wdGlvbnMgPSBDb21wbGV0aW9uT3B0aW9ucy5kZWZhdWx0LFxuXHRjb250ZXh0OiBsYW5ndWFnZXMuQ29tcGxldGlvbkNvbnRleHQgPSB7IHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9LFxuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG4pOiBQcm9taXNlPENvbXBsZXRpb25JdGVtTW9kZWw+IHtcblxuXHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0cG9zaXRpb24gPSBwb3NpdGlvbi5jbG9uZSgpO1xuXG5cdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdGNvbnN0IGRlZmF1bHRSZXBsYWNlUmFuZ2UgPSB3b3JkID8gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKSA6IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pO1xuXHRjb25zdCBkZWZhdWx0UmFuZ2UgPSB7IHJlcGxhY2U6IGRlZmF1bHRSZXBsYWNlUmFuZ2UsIGluc2VydDogZGVmYXVsdFJlcGxhY2VSYW5nZS5zZXRFbmRQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pIH07XG5cblx0Y29uc3QgcmVzdWx0OiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBkdXJhdGlvbnM6IENvbXBsZXRpb25EdXJhdGlvbkVudHJ5W10gPSBbXTtcblx0bGV0IG5lZWRzQ2xpcGJvYXJkID0gZmFsc2U7XG5cblx0Y29uc3Qgb25Db21wbGV0aW9uTGlzdCA9IChwcm92aWRlcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsIGNvbnRhaW5lcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25MaXN0IHwgbnVsbCB8IHVuZGVmaW5lZCwgc3c6IFN0b3BXYXRjaCk6IGJvb2xlYW4gPT4ge1xuXHRcdGxldCBkaWRBZGRSZXN1bHQgPSBmYWxzZTtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIGRpZEFkZFJlc3VsdDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzdWdnZXN0aW9uIG9mIGNvbnRhaW5lci5zdWdnZXN0aW9ucykge1xuXHRcdFx0aWYgKCFvcHRpb25zLmtpbmRGaWx0ZXIuaGFzKHN1Z2dlc3Rpb24ua2luZCkpIHtcblx0XHRcdFx0Ly8gc2tpcCBpZiBub3Qgc2hvd2luZyBkZXByZWNhdGVkIHN1Z2dlc3Rpb25zXG5cdFx0XHRcdGlmICghb3B0aW9ucy5zaG93RGVwcmVjYXRlZCAmJiBzdWdnZXN0aW9uPy50YWdzPy5pbmNsdWRlcyhsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1UYWcuRGVwcmVjYXRlZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBmaWxsIGluIGRlZmF1bHQgcmFuZ2Ugd2hlbiBtaXNzaW5nXG5cdFx0XHRcdGlmICghc3VnZ2VzdGlvbi5yYW5nZSkge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb24ucmFuZ2UgPSBkZWZhdWx0UmFuZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gZmlsbCBpbiBkZWZhdWx0IHNvcnRUZXh0IHdoZW4gbWlzc2luZ1xuXHRcdFx0XHRpZiAoIXN1Z2dlc3Rpb24uc29ydFRleHQpIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uLnNvcnRUZXh0ID0gdHlwZW9mIHN1Z2dlc3Rpb24ubGFiZWwgPT09ICdzdHJpbmcnID8gc3VnZ2VzdGlvbi5sYWJlbCA6IHN1Z2dlc3Rpb24ubGFiZWwubGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFuZWVkc0NsaXBib2FyZCAmJiBzdWdnZXN0aW9uLmluc2VydFRleHRSdWxlcyAmJiBzdWdnZXN0aW9uLmluc2VydFRleHRSdWxlcyAmIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCkge1xuXHRcdFx0XHRcdG5lZWRzQ2xpcGJvYXJkID0gU25pcHBldFBhcnNlci5ndWVzc05lZWRzQ2xpcGJvYXJkKHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IENvbXBsZXRpb25JdGVtKHBvc2l0aW9uLCBzdWdnZXN0aW9uLCBjb250YWluZXIsIHByb3ZpZGVyKSk7XG5cdFx0XHRcdGRpZEFkZFJlc3VsdCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpc0Rpc3Bvc2FibGUoY29udGFpbmVyKSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdGR1cmF0aW9ucy5wdXNoKHtcblx0XHRcdHByb3ZpZGVyTmFtZTogcHJvdmlkZXIuX2RlYnVnRGlzcGxheU5hbWUgPz8gJ3Vua25vd25fcHJvdmlkZXInLCBlbGFwc2VkUHJvdmlkZXI6IGNvbnRhaW5lci5kdXJhdGlvbiA/PyAtMSwgZWxhcHNlZE92ZXJhbGw6IHN3LmVsYXBzZWQoKVxuXHRcdH0pO1xuXHRcdHJldHVybiBkaWRBZGRSZXN1bHQ7XG5cdH07XG5cblx0Ly8gYXNrIGZvciBzbmlwcGV0cyBpbiBwYXJhbGxlbCB0byBhc2tpbmcgXCJyZWFsXCIgcHJvdmlkZXJzLiBPbmx5IGRvIHNvbWV0aGluZyBpZiBjb25maWd1cmVkIHRvXG5cdC8vIGRvIHNvIC0gbm8gc25pcHBldCBmaWx0ZXIsIG5vIHNwZWNpYWwtcHJvdmlkZXJzLW9ubHkgcmVxdWVzdFxuXHRjb25zdCBzbmlwcGV0Q29tcGxldGlvbnMgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdGlmICghX3NuaXBwZXRTdWdnZXN0U3VwcG9ydCB8fCBvcHRpb25zLmtpbmRGaWx0ZXIuaGFzKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gd2UgaGF2ZSBpdGVtcyBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbiB0aGF0IHdlIGNhbiByZXVzZVxuXHRcdGNvbnN0IHJldXNlSXRlbXMgPSBvcHRpb25zLnByb3ZpZGVySXRlbXNUb1JldXNlLmdldChfc25pcHBldFN1Z2dlc3RTdXBwb3J0KTtcblx0XHRpZiAocmV1c2VJdGVtcykge1xuXHRcdFx0cmV1c2VJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gcmVzdWx0LnB1c2goaXRlbSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5wcm92aWRlckZpbHRlci5zaXplID4gMCAmJiAhb3B0aW9ucy5wcm92aWRlckZpbHRlci5oYXMoX3NuaXBwZXRTdWdnZXN0U3VwcG9ydCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3QgbGlzdCA9IGF3YWl0IF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKTtcblx0XHRvbkNvbXBsZXRpb25MaXN0KF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQsIGxpc3QsIHN3KTtcblx0fSkoKTtcblxuXHQvLyBhZGQgc3VnZ2VzdGlvbnMgZnJvbSBjb250cmlidXRlZCBwcm92aWRlcnMgLSBwcm92aWRlcnMgYXJlIG9yZGVyZWQgaW4gZ3JvdXBzIG9mXG5cdC8vIGVxdWFsIHNjb3JlIGFuZCBvbmNlIGEgZ3JvdXAgcHJvZHVjZXMgYSByZXN1bHQgdGhlIHByb2Nlc3Mgc3RvcHNcblx0Ly8gZ2V0IHByb3ZpZGVyIGdyb3VwcywgYWx3YXlzIGFkZCBzbmlwcGV0IHN1Z2dlc3Rpb24gcHJvdmlkZXJcblx0Zm9yIChjb25zdCBwcm92aWRlckdyb3VwIG9mIHJlZ2lzdHJ5Lm9yZGVyZWRHcm91cHMobW9kZWwpKSB7XG5cblx0XHQvLyBmb3IgZWFjaCBzdXBwb3J0IGluIHRoZSBncm91cCBhc2sgZm9yIHN1Z2dlc3Rpb25zXG5cdFx0bGV0IGRpZEFkZFJlc3VsdCA9IGZhbHNlO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVyR3JvdXAubWFwKGFzeW5jIHByb3ZpZGVyID0+IHtcblx0XHRcdC8vIHdlIGhhdmUgaXRlbXMgZnJvbSBhIHByZXZpb3VzIHNlc3Npb24gdGhhdCB3ZSBjYW4gcmV1c2Vcblx0XHRcdGlmIChvcHRpb25zLnByb3ZpZGVySXRlbXNUb1JldXNlLmhhcyhwcm92aWRlcikpIHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBvcHRpb25zLnByb3ZpZGVySXRlbXNUb1JldXNlLmdldChwcm92aWRlcikhO1xuXHRcdFx0XHRpdGVtcy5mb3JFYWNoKGl0ZW0gPT4gcmVzdWx0LnB1c2goaXRlbSkpO1xuXHRcdFx0XHRkaWRBZGRSZXN1bHQgPSBkaWRBZGRSZXN1bHQgfHwgaXRlbXMubGVuZ3RoID4gMDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gY2hlY2sgaWYgdGhpcyBwcm92aWRlciBpcyBmaWx0ZXJlZCBvdXRcblx0XHRcdGlmIChvcHRpb25zLnByb3ZpZGVyRmlsdGVyLnNpemUgPiAwICYmICFvcHRpb25zLnByb3ZpZGVyRmlsdGVyLmhhcyhwcm92aWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0XHRkaWRBZGRSZXN1bHQgPSBvbkNvbXBsZXRpb25MaXN0KHByb3ZpZGVyLCBsaXN0LCBzdykgfHwgZGlkQWRkUmVzdWx0O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoZGlkQWRkUmVzdWx0IHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRhd2FpdCBzbmlwcGV0Q29tcGxldGlvbnM7XG5cblx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdH1cblxuXHRyZXR1cm4gbmV3IENvbXBsZXRpb25JdGVtTW9kZWwoXG5cdFx0cmVzdWx0LnNvcnQoZ2V0U3VnZ2VzdGlvbkNvbXBhcmF0b3Iob3B0aW9ucy5zbmlwcGV0U29ydE9yZGVyKSksXG5cdFx0bmVlZHNDbGlwYm9hcmQsXG5cdFx0eyBlbnRyaWVzOiBkdXJhdGlvbnMsIGVsYXBzZWQ6IHN3LmVsYXBzZWQoKSB9LFxuXHRcdGRpc3Bvc2FibGVzLFxuXHQpO1xufVxuXG5cbmZ1bmN0aW9uIGRlZmF1bHRDb21wYXJhdG9yKGE6IENvbXBsZXRpb25JdGVtLCBiOiBDb21wbGV0aW9uSXRlbSk6IG51bWJlciB7XG5cdC8vIGNoZWNrIHdpdGggJ3NvcnRUZXh0J1xuXHRpZiAoYS5zb3J0VGV4dExvdyAmJiBiLnNvcnRUZXh0TG93KSB7XG5cdFx0aWYgKGEuc29ydFRleHRMb3cgPCBiLnNvcnRUZXh0TG93KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhLnNvcnRUZXh0TG93ID4gYi5zb3J0VGV4dExvdykge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fVxuXHR9XG5cdC8vIGNoZWNrIHdpdGggJ2xhYmVsJ1xuXHRpZiAoYS50ZXh0TGFiZWwgPCBiLnRleHRMYWJlbCkge1xuXHRcdHJldHVybiAtMTtcblx0fSBlbHNlIGlmIChhLnRleHRMYWJlbCA+IGIudGV4dExhYmVsKSB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblx0Ly8gY2hlY2sgd2l0aCAndHlwZSdcblx0cmV0dXJuIGEuY29tcGxldGlvbi5raW5kIC0gYi5jb21wbGV0aW9uLmtpbmQ7XG59XG5cbmZ1bmN0aW9uIHNuaXBwZXRVcENvbXBhcmF0b3IoYTogQ29tcGxldGlvbkl0ZW0sIGI6IENvbXBsZXRpb25JdGVtKTogbnVtYmVyIHtcblx0aWYgKGEuY29tcGxldGlvbi5raW5kICE9PSBiLmNvbXBsZXRpb24ua2luZCkge1xuXHRcdGlmIChhLmNvbXBsZXRpb24ua2luZCA9PT0gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChiLmNvbXBsZXRpb24ua2luZCA9PT0gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRlZmF1bHRDb21wYXJhdG9yKGEsIGIpO1xufVxuXG5mdW5jdGlvbiBzbmlwcGV0RG93bkNvbXBhcmF0b3IoYTogQ29tcGxldGlvbkl0ZW0sIGI6IENvbXBsZXRpb25JdGVtKTogbnVtYmVyIHtcblx0aWYgKGEuY29tcGxldGlvbi5raW5kICE9PSBiLmNvbXBsZXRpb24ua2luZCkge1xuXHRcdGlmIChhLmNvbXBsZXRpb24ua2luZCA9PT0gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2UgaWYgKGIuY29tcGxldGlvbi5raW5kID09PSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRlZmF1bHRDb21wYXJhdG9yKGEsIGIpO1xufVxuXG5pbnRlcmZhY2UgQ29tcGFyYXRvcjxUPiB7IChhOiBULCBiOiBUKTogbnVtYmVyIH1cbmNvbnN0IF9zbmlwcGV0Q29tcGFyYXRvcnMgPSBuZXcgTWFwPFNuaXBwZXRTb3J0T3JkZXIsIENvbXBhcmF0b3I8Q29tcGxldGlvbkl0ZW0+PigpO1xuX3NuaXBwZXRDb21wYXJhdG9ycy5zZXQoU25pcHBldFNvcnRPcmRlci5Ub3AsIHNuaXBwZXRVcENvbXBhcmF0b3IpO1xuX3NuaXBwZXRDb21wYXJhdG9ycy5zZXQoU25pcHBldFNvcnRPcmRlci5Cb3R0b20sIHNuaXBwZXREb3duQ29tcGFyYXRvcik7XG5fc25pcHBldENvbXBhcmF0b3JzLnNldChTbmlwcGV0U29ydE9yZGVyLklubGluZSwgZGVmYXVsdENvbXBhcmF0b3IpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3VnZ2VzdGlvbkNvbXBhcmF0b3Ioc25pcHBldENvbmZpZzogU25pcHBldFNvcnRPcmRlcik6IChhOiBDb21wbGV0aW9uSXRlbSwgYjogQ29tcGxldGlvbkl0ZW0pID0+IG51bWJlciB7XG5cdHJldHVybiBfc25pcHBldENvbXBhcmF0b3JzLmdldChzbmlwcGV0Q29uZmlnKSE7XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLCBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3M6IFtVUkksIElQb3NpdGlvbiwgc3RyaW5nPywgbnVtYmVyP10pID0+IHtcblx0Y29uc3QgW3VyaSwgcG9zaXRpb24sIHRyaWdnZXJDaGFyYWN0ZXIsIG1heEl0ZW1zVG9SZXNvbHZlXSA9IGFyZ3M7XG5cdGFzc2VydFR5cGUoVVJJLmlzVXJpKHVyaSkpO1xuXHRhc3NlcnRUeXBlKFBvc2l0aW9uLmlzSVBvc2l0aW9uKHBvc2l0aW9uKSk7XG5cdGFzc2VydFR5cGUodHlwZW9mIHRyaWdnZXJDaGFyYWN0ZXIgPT09ICdzdHJpbmcnIHx8ICF0cmlnZ2VyQ2hhcmFjdGVyKTtcblx0YXNzZXJ0VHlwZSh0eXBlb2YgbWF4SXRlbXNUb1Jlc29sdmUgPT09ICdudW1iZXInIHx8ICFtYXhJdGVtc1RvUmVzb2x2ZSk7XG5cblx0Y29uc3QgeyBjb21wbGV0aW9uUHJvdmlkZXIgfSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCByZWYgPSBhd2FpdCBhY2Nlc3Nvci5nZXQoSVRleHRNb2RlbFNlcnZpY2UpLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdHRyeSB7XG5cblx0XHRjb25zdCByZXN1bHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uTGlzdCA9IHtcblx0XHRcdGluY29tcGxldGU6IGZhbHNlLFxuXHRcdFx0c3VnZ2VzdGlvbnM6IFtdXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc29sdmluZzogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0Y29uc3QgYWN0dWFsUG9zaXRpb24gPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC52YWxpZGF0ZVBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMoY29tcGxldGlvblByb3ZpZGVyLCByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgYWN0dWFsUG9zaXRpb24sIHVuZGVmaW5lZCwgeyB0cmlnZ2VyQ2hhcmFjdGVyOiB0cmlnZ2VyQ2hhcmFjdGVyID8/IHVuZGVmaW5lZCwgdHJpZ2dlcktpbmQ6IHRyaWdnZXJDaGFyYWN0ZXIgPyBsYW5ndWFnZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIgOiBsYW5ndWFnZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZSB9KTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY29tcGxldGlvbnMuaXRlbXMpIHtcblx0XHRcdGlmIChyZXNvbHZpbmcubGVuZ3RoIDwgKG1heEl0ZW1zVG9SZXNvbHZlID8/IDApKSB7XG5cdFx0XHRcdHJlc29sdmluZy5wdXNoKGl0ZW0ucmVzb2x2ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuaW5jb21wbGV0ZSA9IHJlc3VsdC5pbmNvbXBsZXRlIHx8IGl0ZW0uY29udGFpbmVyLmluY29tcGxldGU7XG5cdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaChpdGVtLmNvbXBsZXRpb24pO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChyZXNvbHZpbmcpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiBjb21wbGV0aW9ucy5kaXNwb3NhYmxlLmRpc3Bvc2UoKSwgMTAwKTtcblx0XHR9XG5cblx0fSBmaW5hbGx5IHtcblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9XG5cbn0pO1xuXG5pbnRlcmZhY2UgU3VnZ2VzdENvbnRyb2xsZXIgZXh0ZW5kcyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0dHJpZ2dlclN1Z2dlc3Qob25seUZyb20/OiBTZXQ8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+LCBhdXRvPzogYm9vbGVhbiwgbm9GaWx0ZXI/OiBib29sZWFuKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dTaW1wbGVTdWdnZXN0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIpIHtcblx0ZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxTdWdnZXN0Q29udHJvbGxlcj4oJ2VkaXRvci5jb250cmliLnN1Z2dlc3RDb250cm9sbGVyJyk/LnRyaWdnZXJTdWdnZXN0KFxuXHRcdG5ldyBTZXQ8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+KCkuYWRkKHByb3ZpZGVyKSwgdW5kZWZpbmVkLCB0cnVlXG5cdCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RJdGVtUHJlc2VsZWN0b3Ige1xuXHQvKipcblx0ICogVGhlIHByZXNlbGVjdG9yIHdpdGggaGlnaGVzdCBwcmlvcml0eSBpcyBhc2tlZCBmaXJzdC5cblx0Ki9cblx0cmVhZG9ubHkgcHJpb3JpdHk6IG51bWJlcjtcblxuXHQvKipcblx0ICogSXMgY2FsbGVkIHRvIHByZXNlbGVjdCBhIHN1Z2dlc3QgaXRlbS5cblx0ICogV2hlbiAtMSBpcyByZXR1cm5lZCwgaXRlbSBwcmVzZWxlY3RvcnMgd2l0aCBsb3dlciBwcmlvcml0eSBhcmUgYXNrZWQuXG5cdCovXG5cdHNlbGVjdChtb2RlbDogSVRleHRNb2RlbCwgcG9zOiBJUG9zaXRpb24sIGl0ZW1zOiBDb21wbGV0aW9uSXRlbVtdKTogbnVtYmVyIHwgLTE7XG59XG5cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zIHtcblxuXHRzdGF0aWMgaXNBbGxPZmYoY29uZmlnOiBJbnRlcm5hbFF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbmZpZy5vdGhlciA9PT0gJ29mZicgJiYgY29uZmlnLmNvbW1lbnRzID09PSAnb2ZmJyAmJiBjb25maWcuc3RyaW5ncyA9PT0gJ29mZic7XG5cdH1cblxuXHRzdGF0aWMgaXNBbGxPbihjb25maWc6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29uZmlnLm90aGVyID09PSAnb24nICYmIGNvbmZpZy5jb21tZW50cyA9PT0gJ29uJyAmJiBjb25maWcuc3RyaW5ncyA9PT0gJ29uJztcblx0fVxuXG5cdHN0YXRpYyB2YWx1ZUZvcihjb25maWc6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMsIHRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUpOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWUge1xuXHRcdHN3aXRjaCAodG9rZW5UeXBlKSB7XG5cdFx0XHRjYXNlIFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQ6IHJldHVybiBjb25maWcuY29tbWVudHM7XG5cdFx0XHRjYXNlIFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZzogcmV0dXJuIGNvbmZpZy5zdHJpbmdzO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIGNvbmZpZy5vdGhlcjtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLHFCQUFxQixpQ0FBaUM7QUFDbEYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUVwQixTQUFvQixnQkFBZ0I7QUFDcEMsU0FBUyxhQUFhO0FBR3RCLFlBQVksZUFBZTtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFHekMsU0FBUyx5QkFBeUI7QUFFM0IsTUFBTSxVQUFVO0FBQUEsRUFDdEIsU0FBUztBQUFBLEVBQ1Qsc0JBQXNCLElBQUksY0FBdUIscUNBQXFDLE9BQU8sU0FBUyw2QkFBNkIsbUNBQW1DLENBQUM7QUFBQSxFQUN2SyxnQkFBZ0IsSUFBSSxjQUF1QiwrQkFBK0IsT0FBTyxTQUFTLCtCQUErQix3Q0FBd0MsQ0FBQztBQUFBLEVB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
