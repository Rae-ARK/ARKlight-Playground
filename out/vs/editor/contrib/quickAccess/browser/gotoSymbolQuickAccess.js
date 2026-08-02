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
import { DeferredPromise } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { pieceToQuery, prepareQuery, scoreFuzzy2 } from "../../../../base/common/fuzzyScorer.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { format, trim } from "../../../../base/common/strings.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { SymbolKind, SymbolKinds, SymbolTag, getAriaLabelForSymbol } from "../../../common/languages.js";
import { IOutlineModelService } from "../../documentSymbols/browser/outlineModel.js";
import { AbstractEditorNavigationQuickAccessProvider } from "./editorNavigationQuickAccess.js";
import { localize } from "../../../../nls.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { findLast } from "../../../../base/common/arraysFind.js";
let AbstractGotoSymbolQuickAccessProvider = class extends AbstractEditorNavigationQuickAccessProvider {
  constructor(_languageFeaturesService, _outlineModelService, options = /* @__PURE__ */ Object.create(null)) {
    super(options);
    this._languageFeaturesService = _languageFeaturesService;
    this._outlineModelService = _outlineModelService;
    this.options = options;
    this.options.canAcceptInBackground = true;
  }
  provideWithoutTextEditor(picker) {
    this.provideLabelPick(picker, localize("cannotRunGotoSymbolWithoutEditor", "To go to a symbol, first open a text editor with symbol information."));
    return Disposable.None;
  }
  provideWithTextEditor(context, picker, token, runOptions) {
    const editor = context.editor;
    const model = this.getModel(editor);
    if (!model) {
      return Disposable.None;
    }
    if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
      return this.doProvideWithEditorSymbols(context, model, picker, token, runOptions);
    }
    return this.doProvideWithoutEditorSymbols(context, model, picker, token);
  }
  doProvideWithoutEditorSymbols(context, model, picker, token) {
    const disposables = new DisposableStore();
    this.provideLabelPick(picker, localize("cannotRunGotoSymbolWithoutSymbolProvider", "The active text editor does not provide symbol information."));
    (async () => {
      const result = await this.waitForLanguageSymbolRegistry(model, disposables);
      if (!result || token.isCancellationRequested) {
        return;
      }
      disposables.add(this.doProvideWithEditorSymbols(context, model, picker, token));
    })();
    return disposables;
  }
  provideLabelPick(picker, label) {
    picker.items = [{ label, index: 0, kind: SymbolKind.String }];
    picker.ariaLabel = label;
  }
  async waitForLanguageSymbolRegistry(model, disposables) {
    if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
      return true;
    }
    const symbolProviderRegistryPromise = new DeferredPromise();
    const symbolProviderListener = disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
      if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
        symbolProviderListener.dispose();
        symbolProviderRegistryPromise.complete(true);
      }
    }));
    disposables.add(toDisposable(() => symbolProviderRegistryPromise.complete(false)));
    return symbolProviderRegistryPromise.p;
  }
  doProvideWithEditorSymbols(context, model, picker, token, runOptions) {
    const editor = context.editor;
    const disposables = new DisposableStore();
    disposables.add(picker.onDidAccept((event) => {
      const [item] = picker.selectedItems;
      if (item && item.range) {
        if (picker.keyMods.shift && item.attach) {
          item.attach(picker.keyMods, event);
          return;
        }
        this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, preserveFocus: event.inBackground });
        runOptions?.handleAccept?.(item, event.inBackground);
        if (!event.inBackground) {
          picker.hide();
        }
      }
    }));
    disposables.add(picker.onDidTriggerItemButton(({ item }) => {
      if (item && item.range) {
        this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, forceSideBySide: true });
        picker.hide();
      }
    }));
    const symbolsPromise = this.getDocumentSymbols(model, token);
    const picksCts = disposables.add(new MutableDisposable());
    const updatePickerItems = async (positionToEnclose) => {
      picksCts?.value?.cancel();
      picker.busy = false;
      picksCts.value = new CancellationTokenSource();
      picker.busy = true;
      try {
        const query = prepareQuery(picker.value.substr(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim());
        const items = await this.doGetSymbolPicks(symbolsPromise, query, void 0, picksCts.value.token, model);
        if (token.isCancellationRequested) {
          return;
        }
        if (items.length > 0) {
          picker.items = items;
          if (positionToEnclose && query.original.length === 0) {
            const candidate = findLast(items, (item) => Boolean(item.type !== "separator" && item.range && Range.containsPosition(item.range.decoration, positionToEnclose)));
            if (candidate) {
              picker.activeItems = [candidate];
            }
          }
        } else {
          if (query.original.length > 0) {
            this.provideLabelPick(picker, localize("noMatchingSymbolResults", "No matching editor symbols"));
          } else {
            this.provideLabelPick(picker, localize("noSymbolResults", "No editor symbols"));
          }
        }
      } finally {
        if (!token.isCancellationRequested) {
          picker.busy = false;
        }
      }
    };
    disposables.add(picker.onDidChangeValue(() => updatePickerItems(void 0)));
    updatePickerItems(editor.getSelection()?.getPosition());
    disposables.add(picker.onDidChangeActive(() => {
      const [item] = picker.activeItems;
      if (item && item.range) {
        editor.revealRangeInCenter(item.range.selection, ScrollType.Smooth);
        this.addDecorations(editor, item.range.decoration);
      }
    }));
    return disposables;
  }
  async doGetSymbolPicks(symbolsPromise, query, options, token, model) {
    const symbols = await symbolsPromise;
    if (token.isCancellationRequested) {
      return [];
    }
    const filterBySymbolKind = query.original.indexOf(AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX) === 0;
    const filterPos = filterBySymbolKind ? 1 : 0;
    let symbolQuery;
    let containerQuery;
    if (query.values && query.values.length > 1) {
      symbolQuery = pieceToQuery(query.values[0]);
      containerQuery = pieceToQuery(query.values.slice(1));
    } else {
      symbolQuery = query;
    }
    let buttons;
    const openSideBySideDirection = this.options?.openSideBySideDirection?.();
    if (openSideBySideDirection) {
      buttons = [{
        iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
        tooltip: openSideBySideDirection === "right" ? localize("openToSide", "Open to the Side") : localize("openToBottom", "Open to the Bottom")
      }];
    }
    const filteredSymbolPicks = [];
    for (let index = 0; index < symbols.length; index++) {
      const symbol = symbols[index];
      const symbolLabel = trim(symbol.name);
      const symbolLabelWithIcon = `$(${SymbolKinds.toIcon(symbol.kind).id}) ${symbolLabel}`;
      const symbolLabelIconOffset = symbolLabelWithIcon.length - symbolLabel.length;
      let containerLabel = symbol.containerName;
      if (options?.extraContainerLabel) {
        if (containerLabel) {
          containerLabel = `${options.extraContainerLabel} \u2022 ${containerLabel}`;
        } else {
          containerLabel = options.extraContainerLabel;
        }
      }
      let symbolScore = void 0;
      let symbolMatches = void 0;
      let containerScore = void 0;
      let containerMatches = void 0;
      if (query.original.length > filterPos) {
        let skipContainerQuery = false;
        if (symbolQuery !== query) {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, {
            ...query,
            values: void 0
            /* disable multi-query support */
          }, filterPos, symbolLabelIconOffset);
          if (typeof symbolScore === "number") {
            skipContainerQuery = true;
          }
        }
        if (typeof symbolScore !== "number") {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, symbolQuery, filterPos, symbolLabelIconOffset);
          if (typeof symbolScore !== "number") {
            continue;
          }
        }
        if (!skipContainerQuery && containerQuery) {
          if (containerLabel && containerQuery.original.length > 0) {
            [containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
          }
          if (typeof containerScore !== "number") {
            continue;
          }
          if (typeof symbolScore === "number") {
            symbolScore += containerScore;
          }
        }
      }
      const deprecated = symbol.tags && symbol.tags.indexOf(SymbolTag.Deprecated) >= 0;
      filteredSymbolPicks.push({
        index,
        kind: symbol.kind,
        score: symbolScore,
        label: symbolLabelWithIcon,
        ariaLabel: getAriaLabelForSymbol(symbol.name, symbol.kind),
        description: containerLabel,
        highlights: deprecated ? void 0 : {
          label: symbolMatches,
          description: containerMatches
        },
        range: {
          selection: Range.collapseToStart(symbol.selectionRange),
          decoration: symbol.range
        },
        uri: model.uri,
        symbolName: symbolLabel,
        strikethrough: deprecated,
        buttons
      });
    }
    const sortedFilteredSymbolPicks = filteredSymbolPicks.sort(
      (symbolA, symbolB) => filterBySymbolKind ? this.compareByKindAndScore(symbolA, symbolB) : this.compareByScore(symbolA, symbolB)
    );
    let symbolPicks = [];
    if (filterBySymbolKind) {
      let updateLastSeparatorLabel2 = function() {
        if (lastSeparator && typeof lastSymbolKind === "number" && lastSymbolKindCounter > 0) {
          lastSeparator.label = format(NLS_SYMBOL_KIND_CACHE[lastSymbolKind] || FALLBACK_NLS_SYMBOL_KIND, lastSymbolKindCounter);
        }
      };
      var updateLastSeparatorLabel = updateLastSeparatorLabel2;
      let lastSymbolKind = void 0;
      let lastSeparator = void 0;
      let lastSymbolKindCounter = 0;
      for (const symbolPick of sortedFilteredSymbolPicks) {
        if (lastSymbolKind !== symbolPick.kind) {
          updateLastSeparatorLabel2();
          lastSymbolKind = symbolPick.kind;
          lastSymbolKindCounter = 1;
          lastSeparator = { type: "separator" };
          symbolPicks.push(lastSeparator);
        } else {
          lastSymbolKindCounter++;
        }
        symbolPicks.push(symbolPick);
      }
      updateLastSeparatorLabel2();
    } else if (sortedFilteredSymbolPicks.length > 0) {
      symbolPicks = [
        { label: localize("symbols", "symbols ({0})", filteredSymbolPicks.length), type: "separator" },
        ...sortedFilteredSymbolPicks
      ];
    }
    return symbolPicks;
  }
  compareByScore(symbolA, symbolB) {
    if (typeof symbolA.score !== "number" && typeof symbolB.score === "number") {
      return 1;
    } else if (typeof symbolA.score === "number" && typeof symbolB.score !== "number") {
      return -1;
    }
    if (typeof symbolA.score === "number" && typeof symbolB.score === "number") {
      if (symbolA.score > symbolB.score) {
        return -1;
      } else if (symbolA.score < symbolB.score) {
        return 1;
      }
    }
    if (symbolA.index < symbolB.index) {
      return -1;
    } else if (symbolA.index > symbolB.index) {
      return 1;
    }
    return 0;
  }
  compareByKindAndScore(symbolA, symbolB) {
    const kindA = NLS_SYMBOL_KIND_CACHE[symbolA.kind] || FALLBACK_NLS_SYMBOL_KIND;
    const kindB = NLS_SYMBOL_KIND_CACHE[symbolB.kind] || FALLBACK_NLS_SYMBOL_KIND;
    const result = kindA.localeCompare(kindB);
    if (result === 0) {
      return this.compareByScore(symbolA, symbolB);
    }
    return result;
  }
  async getDocumentSymbols(document, token) {
    const model = await this._outlineModelService.getOrCreate(document, token);
    return token.isCancellationRequested ? [] : model.asListOfDocumentSymbols();
  }
};
AbstractGotoSymbolQuickAccessProvider.PREFIX = "@";
AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX = ":";
AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY = `${AbstractGotoSymbolQuickAccessProvider.PREFIX}${AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX}`;
AbstractGotoSymbolQuickAccessProvider = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IOutlineModelService)
], AbstractGotoSymbolQuickAccessProvider);
const FALLBACK_NLS_SYMBOL_KIND = localize("property", "properties ({0})");
const NLS_SYMBOL_KIND_CACHE = {
  [SymbolKind.Method]: localize("method", "methods ({0})"),
  [SymbolKind.Function]: localize("function", "functions ({0})"),
  [SymbolKind.Constructor]: localize("_constructor", "constructors ({0})"),
  [SymbolKind.Variable]: localize("variable", "variables ({0})"),
  [SymbolKind.Class]: localize("class", "classes ({0})"),
  [SymbolKind.Struct]: localize("struct", "structs ({0})"),
  [SymbolKind.Event]: localize("event", "events ({0})"),
  [SymbolKind.Operator]: localize("operator", "operators ({0})"),
  [SymbolKind.Interface]: localize("interface", "interfaces ({0})"),
  [SymbolKind.Namespace]: localize("namespace", "namespaces ({0})"),
  [SymbolKind.Package]: localize("package", "packages ({0})"),
  [SymbolKind.TypeParameter]: localize("typeParameter", "type parameters ({0})"),
  [SymbolKind.Module]: localize("modules", "modules ({0})"),
  [SymbolKind.Property]: localize("property", "properties ({0})"),
  [SymbolKind.Enum]: localize("enum", "enumerations ({0})"),
  [SymbolKind.EnumMember]: localize("enumMember", "enumeration members ({0})"),
  [SymbolKind.String]: localize("string", "strings ({0})"),
  [SymbolKind.File]: localize("file", "files ({0})"),
  [SymbolKind.Array]: localize("array", "arrays ({0})"),
  [SymbolKind.Number]: localize("number", "numbers ({0})"),
  [SymbolKind.Boolean]: localize("boolean", "booleans ({0})"),
  [SymbolKind.Object]: localize("object", "objects ({0})"),
  [SymbolKind.Key]: localize("key", "keys ({0})"),
  [SymbolKind.Field]: localize("field", "fields ({0})"),
  [SymbolKind.Constant]: localize("constant", "constants ({0})")
};
export {
  AbstractGotoSymbolQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvZ290b1N5bWJvbFF1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJUHJlcGFyZWRRdWVyeSwgcGllY2VUb1F1ZXJ5LCBwcmVwYXJlUXVlcnksIHNjb3JlRnV6enkyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBmb3JtYXQsIHRyaW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IERvY3VtZW50U3ltYm9sLCBTeW1ib2xLaW5kLCBTeW1ib2xLaW5kcywgU3ltYm9sVGFnLCBnZXRBcmlhTGFiZWxGb3JTeW1ib2wgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElPdXRsaW5lTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RWRpdG9yTmF2aWdhdGlvblF1aWNrQWNjZXNzUHJvdmlkZXIsIElFZGl0b3JOYXZpZ2F0aW9uUXVpY2tBY2Nlc3NPcHRpb25zLCBJUXVpY2tBY2Nlc3NUZXh0RWRpdG9yQ29udGV4dCB9IGZyb20gJy4vZWRpdG9yTmF2aWdhdGlvblF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElLZXlNb2RzLCBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrUGljaywgSVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50LCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGtpbmQ6IFN5bWJvbEtpbmQ7XG5cdGluZGV4OiBudW1iZXI7XG5cdHNjb3JlPzogbnVtYmVyO1xuXHR1cmk/OiBVUkk7XG5cdHN5bWJvbE5hbWU/OiBzdHJpbmc7XG5cdHJhbmdlPzogeyBkZWNvcmF0aW9uOiBJUmFuZ2U7IHNlbGVjdGlvbjogSVJhbmdlIH07XG5cdGF0dGFjaD8oa2V5TW9kczogSUtleU1vZHMsIGV2ZW50OiBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlck9wdGlvbnMgZXh0ZW5kcyBJRWRpdG9yTmF2aWdhdGlvblF1aWNrQWNjZXNzT3B0aW9ucyB7XG5cdG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uPzogKCkgPT4gdW5kZWZpbmVkIHwgJ3JpZ2h0JyB8ICdkb3duJztcblx0LyoqXG5cdCAqIEEgaGFuZGxlciB0byBpbnZva2Ugd2hlbiBhbiBpdGVtIGlzIGFjY2VwdGVkIGZvclxuXHQgKiB0aGlzIHBhcnRpY3VsYXIgc2hvd2luZyBvZiB0aGUgcXVpY2sgYWNjZXNzLlxuXHQgKiBAcGFyYW0gaXRlbSBUaGUgaXRlbSB0aGF0IHdhcyBhY2NlcHRlZC5cblx0ICovXG5cdHJlYWRvbmx5IGhhbmRsZUFjY2VwdD86IChpdGVtOiBJUXVpY2tQaWNrSXRlbSkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0R290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBBYnN0cmFjdEVkaXRvck5hdmlnYXRpb25RdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblxuXHRzdGF0aWMgUFJFRklYID0gJ0AnO1xuXHRzdGF0aWMgU0NPUEVfUFJFRklYID0gJzonO1xuXHRzdGF0aWMgUFJFRklYX0JZX0NBVEVHT1JZID0gYCR7dGhpcy5QUkVGSVh9JHt0aGlzLlNDT1BFX1BSRUZJWH1gO1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBvcHRpb25zOiBJR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXJPcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASU91dGxpbmVNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3V0bGluZU1vZGVsU2VydmljZTogSU91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdFx0b3B0aW9uczogSUdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbClcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucyk7XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMub3B0aW9ucy5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHByb3ZpZGVXaXRob3V0VGV4dEVkaXRvcihwaWNrZXI6IElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5wcm92aWRlTGFiZWxQaWNrKHBpY2tlciwgbG9jYWxpemUoJ2Nhbm5vdFJ1bkdvdG9TeW1ib2xXaXRob3V0RWRpdG9yJywgXCJUbyBnbyB0byBhIHN5bWJvbCwgZmlyc3Qgb3BlbiBhIHRleHQgZWRpdG9yIHdpdGggc3ltYm9sIGluZm9ybWF0aW9uLlwiKSk7XG5cblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0cHJvdGVjdGVkIHByb3ZpZGVXaXRoVGV4dEVkaXRvcihjb250ZXh0OiBJUXVpY2tBY2Nlc3NUZXh0RWRpdG9yQ29udGV4dCwgcGlja2VyOiBJUXVpY2tQaWNrPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJ1bk9wdGlvbnM/OiBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5lZGl0b3I7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmdldE1vZGVsKGVkaXRvcik7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHQvLyBQcm92aWRlIHN5bWJvbHMgZnJvbSBtb2RlbCBpZiBhdmFpbGFibGUgaW4gcmVnaXN0cnlcblx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1Byb3ZpZGVXaXRoRWRpdG9yU3ltYm9scyhjb250ZXh0LCBtb2RlbCwgcGlja2VyLCB0b2tlbiwgcnVuT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHNob3cgYW4gZW50cnkgZm9yIGEgbW9kZWwgd2l0aG91dCByZWdpc3RyeVxuXHRcdC8vIEJ1dCBnaXZlIGEgY2hhbmNlIHRvIHJlc29sdmUgdGhlIHN5bWJvbHMgYXQgYSBsYXRlclxuXHRcdC8vIHBvaW50IGlmIHBvc3NpYmxlXG5cdFx0cmV0dXJuIHRoaXMuZG9Qcm92aWRlV2l0aG91dEVkaXRvclN5bWJvbHMoY29udGV4dCwgbW9kZWwsIHBpY2tlciwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Byb3ZpZGVXaXRob3V0RWRpdG9yU3ltYm9scyhjb250ZXh0OiBJUXVpY2tBY2Nlc3NUZXh0RWRpdG9yQ29udGV4dCwgbW9kZWw6IElUZXh0TW9kZWwsIHBpY2tlcjogSVF1aWNrUGljazxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gR2VuZXJpYyBwaWNrIGZvciBub3QgaGF2aW5nIGFueSBzeW1ib2wgaW5mb3JtYXRpb25cblx0XHR0aGlzLnByb3ZpZGVMYWJlbFBpY2socGlja2VyLCBsb2NhbGl6ZSgnY2Fubm90UnVuR290b1N5bWJvbFdpdGhvdXRTeW1ib2xQcm92aWRlcicsIFwiVGhlIGFjdGl2ZSB0ZXh0IGVkaXRvciBkb2VzIG5vdCBwcm92aWRlIHN5bWJvbCBpbmZvcm1hdGlvbi5cIikpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgY2hhbmdlcyB0byB0aGUgcmVnaXN0cnkgYW5kIHNlZSBpZiBldmVudHVhbGx5XG5cdFx0Ly8gd2UgZG8gZ2V0IHN5bWJvbHMuIFRoaXMgY2FuIGhhcHBlbiBpZiB0aGUgcGlja2VyIGlzIG9wZW5lZFxuXHRcdC8vIHZlcnkgZWFybHkgYWZ0ZXIgdGhlIG1vZGVsIGhhcyBsb2FkZWQgYnV0IGJlZm9yZSB0aGVcblx0XHQvLyBsYW5ndWFnZSByZWdpc3RyeSBpcyByZWFkeS5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNzA2MDdcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy53YWl0Rm9yTGFuZ3VhZ2VTeW1ib2xSZWdpc3RyeShtb2RlbCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0aWYgKCFyZXN1bHQgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5kb1Byb3ZpZGVXaXRoRWRpdG9yU3ltYm9scyhjb250ZXh0LCBtb2RlbCwgcGlja2VyLCB0b2tlbikpO1xuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIHByb3ZpZGVMYWJlbFBpY2socGlja2VyOiBJUXVpY2tQaWNrPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0cGlja2VyLml0ZW1zID0gW3sgbGFiZWwsIGluZGV4OiAwLCBraW5kOiBTeW1ib2xLaW5kLlN0cmluZyB9XTtcblx0XHRwaWNrZXIuYXJpYUxhYmVsID0gbGFiZWw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgd2FpdEZvckxhbmd1YWdlU3ltYm9sUmVnaXN0cnkobW9kZWw6IElUZXh0TW9kZWwsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzeW1ib2xQcm92aWRlclJlZ2lzdHJ5UHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8Ym9vbGVhbj4oKTtcblxuXHRcdC8vIFJlc29sdmUgcHJvbWlzZSB3aGVuIHJlZ2lzdHJ5IGtub3dzIG1vZGVsXG5cdFx0Y29uc3Qgc3ltYm9sUHJvdmlkZXJMaXN0ZW5lciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdFx0c3ltYm9sUHJvdmlkZXJMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdFx0c3ltYm9sUHJvdmlkZXJSZWdpc3RyeVByb21pc2UuY29tcGxldGUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzb2x2ZSBwcm9taXNlIHdoZW4gd2UgZ2V0IGRpc3Bvc2VkIHRvb1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc3ltYm9sUHJvdmlkZXJSZWdpc3RyeVByb21pc2UuY29tcGxldGUoZmFsc2UpKSk7XG5cblx0XHRyZXR1cm4gc3ltYm9sUHJvdmlkZXJSZWdpc3RyeVByb21pc2UucDtcblx0fVxuXG5cdHByaXZhdGUgZG9Qcm92aWRlV2l0aEVkaXRvclN5bWJvbHMoY29udGV4dDogSVF1aWNrQWNjZXNzVGV4dEVkaXRvckNvbnRleHQsIG1vZGVsOiBJVGV4dE1vZGVsLCBwaWNrZXI6IElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0LmVkaXRvcjtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdC8vIEdvdG8gc3ltYm9sIG9uY2UgcGlja2VkXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdChldmVudCA9PiB7XG5cdFx0XHRjb25zdCBbaXRlbV0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmIChpdGVtICYmIGl0ZW0ucmFuZ2UpIHtcblx0XHRcdFx0Ly8gV2hlbiBzaGlmdCBpcyBoZWxkIGFuZCBhdHRhY2ggaXMgYXZhaWxhYmxlLCBkZWxlZ2F0ZSB0byBhdHRhY2hcblx0XHRcdFx0Ly8gKGUuZy4gdG8gYWRkIHRvIGNoYXQgY29udGV4dCkgaW5zdGVhZCBvZiBuYXZpZ2F0aW5nXG5cdFx0XHRcdGlmIChwaWNrZXIua2V5TW9kcy5zaGlmdCAmJiBpdGVtLmF0dGFjaCkge1xuXHRcdFx0XHRcdGl0ZW0uYXR0YWNoKHBpY2tlci5rZXlNb2RzLCBldmVudCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5nb3RvTG9jYXRpb24oY29udGV4dCwgeyByYW5nZTogaXRlbS5yYW5nZS5zZWxlY3Rpb24sIGtleU1vZHM6IHBpY2tlci5rZXlNb2RzLCBwcmVzZXJ2ZUZvY3VzOiBldmVudC5pbkJhY2tncm91bmQgfSk7XG5cblx0XHRcdFx0cnVuT3B0aW9ucz8uaGFuZGxlQWNjZXB0Py4oaXRlbSwgZXZlbnQuaW5CYWNrZ3JvdW5kKTtcblxuXHRcdFx0XHRpZiAoIWV2ZW50LmluQmFja2dyb3VuZCkge1xuXHRcdFx0XHRcdHBpY2tlci5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBHb3RvIHN5bWJvbCBzaWRlIGJ5IHNpZGUgaWYgZW5hYmxlZFxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbigoeyBpdGVtIH0pID0+IHtcblx0XHRcdGlmIChpdGVtICYmIGl0ZW0ucmFuZ2UpIHtcblx0XHRcdFx0dGhpcy5nb3RvTG9jYXRpb24oY29udGV4dCwgeyByYW5nZTogaXRlbS5yYW5nZS5zZWxlY3Rpb24sIGtleU1vZHM6IHBpY2tlci5rZXlNb2RzLCBmb3JjZVNpZGVCeVNpZGU6IHRydWUgfSk7XG5cblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXNvbHZlIHN5bWJvbHMgZnJvbSBkb2N1bWVudCBvbmNlIGFuZCByZXVzZSB0aGlzXG5cdFx0Ly8gcmVxdWVzdCBmb3IgYWxsIGZpbHRlcmluZyBhbmQgdHlwaW5nIHRoZW4gb25cblx0XHRjb25zdCBzeW1ib2xzUHJvbWlzZSA9IHRoaXMuZ2V0RG9jdW1lbnRTeW1ib2xzKG1vZGVsLCB0b2tlbik7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBwaWNrcyBhbmQgdXBkYXRlIG9uIHR5cGVcblx0XHRjb25zdCBwaWNrc0N0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRcdGNvbnN0IHVwZGF0ZVBpY2tlckl0ZW1zID0gYXN5bmMgKHBvc2l0aW9uVG9FbmNsb3NlOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXG5cdFx0XHQvLyBDYW5jZWwgYW55IHByZXZpb3VzIGFzayBmb3IgcGlja3MgYW5kIGJ1c3lcblx0XHRcdHBpY2tzQ3RzPy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXG5cdFx0XHQvLyBDcmVhdGUgbmV3IGNhbmNlbGxhdGlvbiBzb3VyY2UgZm9yIHRoaXMgcnVuXG5cdFx0XHRwaWNrc0N0cy52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0XHQvLyBDb2xsZWN0IHN5bWJvbCBwaWNrc1xuXHRcdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcXVlcnkgPSBwcmVwYXJlUXVlcnkocGlja2VyLnZhbHVlLnN1YnN0cihBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWC5sZW5ndGgpLnRyaW0oKSk7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5kb0dldFN5bWJvbFBpY2tzKHN5bWJvbHNQcm9taXNlLCBxdWVyeSwgdW5kZWZpbmVkLCBwaWNrc0N0cy52YWx1ZS50b2tlbiwgbW9kZWwpO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHBpY2tlci5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0XHRcdGlmIChwb3NpdGlvblRvRW5jbG9zZSAmJiBxdWVyeS5vcmlnaW5hbC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IDxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0+ZmluZExhc3QoaXRlbXMsIGl0ZW0gPT4gQm9vbGVhbihpdGVtLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGl0ZW0ucmFuZ2UgJiYgUmFuZ2UuY29udGFpbnNQb3NpdGlvbihpdGVtLnJhbmdlLmRlY29yYXRpb24sIHBvc2l0aW9uVG9FbmNsb3NlKSkpO1xuXHRcdFx0XHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRcdFx0XHRwaWNrZXIuYWN0aXZlSXRlbXMgPSBbY2FuZGlkYXRlXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAocXVlcnkub3JpZ2luYWwubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm92aWRlTGFiZWxQaWNrKHBpY2tlciwgbG9jYWxpemUoJ25vTWF0Y2hpbmdTeW1ib2xSZXN1bHRzJywgXCJObyBtYXRjaGluZyBlZGl0b3Igc3ltYm9sc1wiKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMucHJvdmlkZUxhYmVsUGljayhwaWNrZXIsIGxvY2FsaXplKCdub1N5bWJvbFJlc3VsdHMnLCBcIk5vIGVkaXRvciBzeW1ib2xzXCIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlVmFsdWUoKCkgPT4gdXBkYXRlUGlja2VySXRlbXModW5kZWZpbmVkKSkpO1xuXHRcdHVwZGF0ZVBpY2tlckl0ZW1zKGVkaXRvci5nZXRTZWxlY3Rpb24oKT8uZ2V0UG9zaXRpb24oKSk7XG5cblxuXHRcdC8vIFJldmVhbCBhbmQgZGVjb3JhdGUgd2hlbiBhY3RpdmUgaXRlbSBjaGFuZ2VzXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZUFjdGl2ZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBbaXRlbV0gPSBwaWNrZXIuYWN0aXZlSXRlbXM7XG5cdFx0XHRpZiAoaXRlbSAmJiBpdGVtLnJhbmdlKSB7XG5cblx0XHRcdFx0Ly8gUmV2ZWFsXG5cdFx0XHRcdGVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKGl0ZW0ucmFuZ2Uuc2VsZWN0aW9uLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cblx0XHRcdFx0Ly8gRGVjb3JhdGVcblx0XHRcdFx0dGhpcy5hZGREZWNvcmF0aW9ucyhlZGl0b3IsIGl0ZW0ucmFuZ2UuZGVjb3JhdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGRvR2V0U3ltYm9sUGlja3Moc3ltYm9sc1Byb21pc2U6IFByb21pc2U8RG9jdW1lbnRTeW1ib2xbXT4sIHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgb3B0aW9uczogeyBleHRyYUNvbnRhaW5lckxhYmVsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgbW9kZWw6IElUZXh0TW9kZWwpOiBQcm9taXNlPEFycmF5PElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+PiB7XG5cdFx0Y29uc3Qgc3ltYm9scyA9IGF3YWl0IHN5bWJvbHNQcm9taXNlO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbHRlckJ5U3ltYm9sS2luZCA9IHF1ZXJ5Lm9yaWdpbmFsLmluZGV4T2YoQWJzdHJhY3RHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5TQ09QRV9QUkVGSVgpID09PSAwO1xuXHRcdGNvbnN0IGZpbHRlclBvcyA9IGZpbHRlckJ5U3ltYm9sS2luZCA/IDEgOiAwO1xuXG5cdFx0Ly8gU3BsaXQgYmV0d2VlbiBzeW1ib2wgYW5kIGNvbnRhaW5lciBxdWVyeVxuXHRcdGxldCBzeW1ib2xRdWVyeTogSVByZXBhcmVkUXVlcnk7XG5cdFx0bGV0IGNvbnRhaW5lclF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlcnkudmFsdWVzICYmIHF1ZXJ5LnZhbHVlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRzeW1ib2xRdWVyeSA9IHBpZWNlVG9RdWVyeShxdWVyeS52YWx1ZXNbMF0pOyBcdFx0ICAvLyBzeW1ib2w6IG9ubHkgbWF0Y2ggb24gZmlyc3QgcGFydFxuXHRcdFx0Y29udGFpbmVyUXVlcnkgPSBwaWVjZVRvUXVlcnkocXVlcnkudmFsdWVzLnNsaWNlKDEpKTsgLy8gY29udGFpbmVyOiBtYXRjaCBvbiBhbGwgYnV0IGZpcnN0IHBhcnRzXG5cdFx0fSBlbHNlIHtcblx0XHRcdHN5bWJvbFF1ZXJ5ID0gcXVlcnk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udmVydCB0byBzeW1ib2wgcGlja3MgYW5kIGFwcGx5IGZpbHRlcmluZ1xuXG5cdFx0bGV0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPSB0aGlzLm9wdGlvbnM/Lm9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uPy4oKTtcblx0XHRpZiAob3BlblNpZGVCeVNpZGVEaXJlY3Rpb24pIHtcblx0XHRcdGJ1dHRvbnMgPSBbe1xuXHRcdFx0XHRpY29uQ2xhc3M6IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRIb3Jpem9udGFsKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0VmVydGljYWwpLFxuXHRcdFx0XHR0b29sdGlwOiBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9PT0gJ3JpZ2h0JyA/IGxvY2FsaXplKCdvcGVuVG9TaWRlJywgXCJPcGVuIHRvIHRoZSBTaWRlXCIpIDogbG9jYWxpemUoJ29wZW5Ub0JvdHRvbScsIFwiT3BlbiB0byB0aGUgQm90dG9tXCIpXG5cdFx0XHR9XTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXJlZFN5bWJvbFBpY2tzOiBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBzeW1ib2xzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3Qgc3ltYm9sID0gc3ltYm9sc1tpbmRleF07XG5cblx0XHRcdGNvbnN0IHN5bWJvbExhYmVsID0gdHJpbShzeW1ib2wubmFtZSk7XG5cdFx0XHRjb25zdCBzeW1ib2xMYWJlbFdpdGhJY29uID0gYCQoJHtTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sLmtpbmQpLmlkfSkgJHtzeW1ib2xMYWJlbH1gO1xuXHRcdFx0Y29uc3Qgc3ltYm9sTGFiZWxJY29uT2Zmc2V0ID0gc3ltYm9sTGFiZWxXaXRoSWNvbi5sZW5ndGggLSBzeW1ib2xMYWJlbC5sZW5ndGg7XG5cblx0XHRcdGxldCBjb250YWluZXJMYWJlbCA9IHN5bWJvbC5jb250YWluZXJOYW1lO1xuXHRcdFx0aWYgKG9wdGlvbnM/LmV4dHJhQ29udGFpbmVyTGFiZWwpIHtcblx0XHRcdFx0aWYgKGNvbnRhaW5lckxhYmVsKSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyTGFiZWwgPSBgJHtvcHRpb25zLmV4dHJhQ29udGFpbmVyTGFiZWx9IFx1MjAyMiAke2NvbnRhaW5lckxhYmVsfWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyTGFiZWwgPSBvcHRpb25zLmV4dHJhQ29udGFpbmVyTGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHN5bWJvbFNjb3JlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc3ltYm9sTWF0Y2hlczogSU1hdGNoW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGxldCBjb250YWluZXJTY29yZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNvbnRhaW5lck1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAocXVlcnkub3JpZ2luYWwubGVuZ3RoID4gZmlsdGVyUG9zKSB7XG5cblx0XHRcdFx0Ly8gRmlyc3Q6IHRyeSB0byBzY29yZSBvbiB0aGUgZW50aXJlIHF1ZXJ5LCBpdCBpcyBwb3NzaWJsZSB0aGF0XG5cdFx0XHRcdC8vIHRoZSBzeW1ib2wgbWF0Y2hlcyBwZXJmZWN0bHkgKGUuZy4gc2VhcmNoaW5nIGZvciBcImNoYW5nZSBsb2dcIlxuXHRcdFx0XHQvLyBjYW4gYmUgYSBtYXRjaCBvbiBhIG1hcmtkb3duIHN5bWJvbCBcImNoYW5nZSBsb2dcIikuIEluIHRoYXRcblx0XHRcdFx0Ly8gY2FzZSB3ZSB3YW50IHRvIHNraXAgdGhlIGNvbnRhaW5lciBxdWVyeSBhbHRvZ2V0aGVyLlxuXHRcdFx0XHRsZXQgc2tpcENvbnRhaW5lclF1ZXJ5ID0gZmFsc2U7XG5cdFx0XHRcdGlmIChzeW1ib2xRdWVyeSAhPT0gcXVlcnkpIHtcblx0XHRcdFx0XHRbc3ltYm9sU2NvcmUsIHN5bWJvbE1hdGNoZXNdID0gc2NvcmVGdXp6eTIoc3ltYm9sTGFiZWxXaXRoSWNvbiwgeyAuLi5xdWVyeSwgdmFsdWVzOiB1bmRlZmluZWQgLyogZGlzYWJsZSBtdWx0aS1xdWVyeSBzdXBwb3J0ICovIH0sIGZpbHRlclBvcywgc3ltYm9sTGFiZWxJY29uT2Zmc2V0KTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0c2tpcENvbnRhaW5lclF1ZXJ5ID0gdHJ1ZTsgLy8gc2luY2Ugd2UgY29uc3VtZWQgdGhlIHF1ZXJ5LCBza2lwIGFueSBjb250YWluZXIgbWF0Y2hpbmdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2U6IHNjb3JlIG9uIHRoZSBzeW1ib2wgcXVlcnkgYW5kIG1hdGNoIG9uIHRoZSBjb250YWluZXIgbGF0ZXJcblx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRbc3ltYm9sU2NvcmUsIHN5bWJvbE1hdGNoZXNdID0gc2NvcmVGdXp6eTIoc3ltYm9sTGFiZWxXaXRoSWNvbiwgc3ltYm9sUXVlcnksIGZpbHRlclBvcywgc3ltYm9sTGFiZWxJY29uT2Zmc2V0KTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2NvcmUgYnkgY29udGFpbmVyIGlmIHNwZWNpZmllZFxuXHRcdFx0XHRpZiAoIXNraXBDb250YWluZXJRdWVyeSAmJiBjb250YWluZXJRdWVyeSkge1xuXHRcdFx0XHRcdGlmIChjb250YWluZXJMYWJlbCAmJiBjb250YWluZXJRdWVyeS5vcmlnaW5hbC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRbY29udGFpbmVyU2NvcmUsIGNvbnRhaW5lck1hdGNoZXNdID0gc2NvcmVGdXp6eTIoY29udGFpbmVyTGFiZWwsIGNvbnRhaW5lclF1ZXJ5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbnRhaW5lclNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdHN5bWJvbFNjb3JlICs9IGNvbnRhaW5lclNjb3JlOyAvLyBib29zdCBzeW1ib2xTY29yZSBieSBjb250YWluZXJTY29yZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZXByZWNhdGVkID0gc3ltYm9sLnRhZ3MgJiYgc3ltYm9sLnRhZ3MuaW5kZXhPZihTeW1ib2xUYWcuRGVwcmVjYXRlZCkgPj0gMDtcblxuXHRcdFx0ZmlsdGVyZWRTeW1ib2xQaWNrcy5wdXNoKHtcblx0XHRcdFx0aW5kZXgsXG5cdFx0XHRcdGtpbmQ6IHN5bWJvbC5raW5kLFxuXHRcdFx0XHRzY29yZTogc3ltYm9sU2NvcmUsXG5cdFx0XHRcdGxhYmVsOiBzeW1ib2xMYWJlbFdpdGhJY29uLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGdldEFyaWFMYWJlbEZvclN5bWJvbChzeW1ib2wubmFtZSwgc3ltYm9sLmtpbmQpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogY29udGFpbmVyTGFiZWwsXG5cdFx0XHRcdGhpZ2hsaWdodHM6IGRlcHJlY2F0ZWQgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0bGFiZWw6IHN5bWJvbE1hdGNoZXMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNvbnRhaW5lck1hdGNoZXNcblx0XHRcdFx0fSxcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IFJhbmdlLmNvbGxhcHNlVG9TdGFydChzeW1ib2wuc2VsZWN0aW9uUmFuZ2UpLFxuXHRcdFx0XHRcdGRlY29yYXRpb246IHN5bWJvbC5yYW5nZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cmk6IG1vZGVsLnVyaSxcblx0XHRcdFx0c3ltYm9sTmFtZTogc3ltYm9sTGFiZWwsXG5cdFx0XHRcdHN0cmlrZXRocm91Z2g6IGRlcHJlY2F0ZWQsXG5cdFx0XHRcdGJ1dHRvbnNcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgYnkgc2NvcmVcblx0XHRjb25zdCBzb3J0ZWRGaWx0ZXJlZFN5bWJvbFBpY2tzID0gZmlsdGVyZWRTeW1ib2xQaWNrcy5zb3J0KChzeW1ib2xBLCBzeW1ib2xCKSA9PiBmaWx0ZXJCeVN5bWJvbEtpbmQgP1xuXHRcdFx0dGhpcy5jb21wYXJlQnlLaW5kQW5kU2NvcmUoc3ltYm9sQSwgc3ltYm9sQikgOlxuXHRcdFx0dGhpcy5jb21wYXJlQnlTY29yZShzeW1ib2xBLCBzeW1ib2xCKVxuXHRcdCk7XG5cblx0XHQvLyBBZGQgc2VwYXJhdG9yIGZvciB0eXBlc1xuXHRcdC8vIC0gQCAgb25seSB0b3RhbCBudW1iZXIgb2Ygc3ltYm9sc1xuXHRcdC8vIC0gQDogZ3JvdXBlZCBieSBzeW1ib2wga2luZFxuXHRcdGxldCBzeW1ib2xQaWNrczogQXJyYXk8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblx0XHRpZiAoZmlsdGVyQnlTeW1ib2xLaW5kKSB7XG5cdFx0XHRsZXQgbGFzdFN5bWJvbEtpbmQ6IFN5bWJvbEtpbmQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbGFzdFNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsYXN0U3ltYm9sS2luZENvdW50ZXIgPSAwO1xuXG5cdFx0XHRmdW5jdGlvbiB1cGRhdGVMYXN0U2VwYXJhdG9yTGFiZWwoKTogdm9pZCB7XG5cdFx0XHRcdGlmIChsYXN0U2VwYXJhdG9yICYmIHR5cGVvZiBsYXN0U3ltYm9sS2luZCA9PT0gJ251bWJlcicgJiYgbGFzdFN5bWJvbEtpbmRDb3VudGVyID4gMCkge1xuXHRcdFx0XHRcdGxhc3RTZXBhcmF0b3IubGFiZWwgPSBmb3JtYXQoTkxTX1NZTUJPTF9LSU5EX0NBQ0hFW2xhc3RTeW1ib2xLaW5kXSB8fCBGQUxMQkFDS19OTFNfU1lNQk9MX0tJTkQsIGxhc3RTeW1ib2xLaW5kQ291bnRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBzeW1ib2xQaWNrIG9mIHNvcnRlZEZpbHRlcmVkU3ltYm9sUGlja3MpIHtcblxuXHRcdFx0XHQvLyBGb3VuZCBuZXcga2luZFxuXHRcdFx0XHRpZiAobGFzdFN5bWJvbEtpbmQgIT09IHN5bWJvbFBpY2sua2luZCkge1xuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGxhc3Qgc2VwYXJhdG9yIHdpdGggbnVtYmVyIG9mIHN5bWJvbHMgd2UgZm91bmQgZm9yIGtpbmRcblx0XHRcdFx0XHR1cGRhdGVMYXN0U2VwYXJhdG9yTGFiZWwoKTtcblxuXHRcdFx0XHRcdGxhc3RTeW1ib2xLaW5kID0gc3ltYm9sUGljay5raW5kO1xuXHRcdFx0XHRcdGxhc3RTeW1ib2xLaW5kQ291bnRlciA9IDE7XG5cblx0XHRcdFx0XHQvLyBBZGQgbmV3IHNlcGFyYXRvciBmb3IgbmV3IGtpbmRcblx0XHRcdFx0XHRsYXN0U2VwYXJhdG9yID0geyB0eXBlOiAnc2VwYXJhdG9yJyB9O1xuXHRcdFx0XHRcdHN5bWJvbFBpY2tzLnB1c2gobGFzdFNlcGFyYXRvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFeGlzdGluZyBraW5kLCBrZWVwIGNvdW50aW5nXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGxhc3RTeW1ib2xLaW5kQ291bnRlcisrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRkIHRvIGZpbmFsIHJlc3VsdFxuXHRcdFx0XHRzeW1ib2xQaWNrcy5wdXNoKHN5bWJvbFBpY2spO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgbGFzdCBzZXBhcmF0b3Igd2l0aCBudW1iZXIgb2Ygc3ltYm9scyB3ZSBmb3VuZCBmb3Iga2luZFxuXHRcdFx0dXBkYXRlTGFzdFNlcGFyYXRvckxhYmVsKCk7XG5cdFx0fSBlbHNlIGlmIChzb3J0ZWRGaWx0ZXJlZFN5bWJvbFBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdHN5bWJvbFBpY2tzID0gW1xuXHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnc3ltYm9scycsIFwic3ltYm9scyAoezB9KVwiLCBmaWx0ZXJlZFN5bWJvbFBpY2tzLmxlbmd0aCksIHR5cGU6ICdzZXBhcmF0b3InIH0sXG5cdFx0XHRcdC4uLnNvcnRlZEZpbHRlcmVkU3ltYm9sUGlja3Ncblx0XHRcdF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN5bWJvbFBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wYXJlQnlTY29yZShzeW1ib2xBOiBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0sIHN5bWJvbEI6IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSk6IG51bWJlciB7XG5cdFx0aWYgKHR5cGVvZiBzeW1ib2xBLnNjb3JlICE9PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3ltYm9sQi5zY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHN5bWJvbEEuc2NvcmUgPT09ICdudW1iZXInICYmIHR5cGVvZiBzeW1ib2xCLnNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygc3ltYm9sQS5zY29yZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHN5bWJvbEIuc2NvcmUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAoc3ltYm9sQS5zY29yZSA+IHN5bWJvbEIuc2NvcmUpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIGlmIChzeW1ib2xBLnNjb3JlIDwgc3ltYm9sQi5zY29yZSkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3ltYm9sQS5pbmRleCA8IHN5bWJvbEIuaW5kZXgpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKHN5bWJvbEEuaW5kZXggPiBzeW1ib2xCLmluZGV4KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgY29tcGFyZUJ5S2luZEFuZFNjb3JlKHN5bWJvbEE6IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgc3ltYm9sQjogSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKTogbnVtYmVyIHtcblx0XHRjb25zdCBraW5kQSA9IE5MU19TWU1CT0xfS0lORF9DQUNIRVtzeW1ib2xBLmtpbmRdIHx8IEZBTExCQUNLX05MU19TWU1CT0xfS0lORDtcblx0XHRjb25zdCBraW5kQiA9IE5MU19TWU1CT0xfS0lORF9DQUNIRVtzeW1ib2xCLmtpbmRdIHx8IEZBTExCQUNLX05MU19TWU1CT0xfS0lORDtcblxuXHRcdC8vIFNvcnQgYnkgdHlwZSBmaXJzdCBpZiBzY29wZWQgc2VhcmNoXG5cdFx0Y29uc3QgcmVzdWx0ID0ga2luZEEubG9jYWxlQ29tcGFyZShraW5kQik7XG5cdFx0aWYgKHJlc3VsdCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tcGFyZUJ5U2NvcmUoc3ltYm9sQSwgc3ltYm9sQik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXREb2N1bWVudFN5bWJvbHMoZG9jdW1lbnQ6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRTeW1ib2xbXT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fb3V0bGluZU1vZGVsU2VydmljZS5nZXRPckNyZWF0ZShkb2N1bWVudCwgdG9rZW4pO1xuXHRcdHJldHVybiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCA/IFtdIDogbW9kZWwuYXNMaXN0T2ZEb2N1bWVudFN5bWJvbHMoKTtcblx0fVxufVxuXG4vLyAjcmVnaW9uIE5MUyBIZWxwZXJzXG5cbmNvbnN0IEZBTExCQUNLX05MU19TWU1CT0xfS0lORCA9IGxvY2FsaXplKCdwcm9wZXJ0eScsIFwicHJvcGVydGllcyAoezB9KVwiKTtcbmNvbnN0IE5MU19TWU1CT0xfS0lORF9DQUNIRTogeyBbdHlwZTogbnVtYmVyXTogc3RyaW5nIH0gPSB7XG5cdFtTeW1ib2xLaW5kLk1ldGhvZF06IGxvY2FsaXplKCdtZXRob2QnLCBcIm1ldGhvZHMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLkZ1bmN0aW9uXTogbG9jYWxpemUoJ2Z1bmN0aW9uJywgXCJmdW5jdGlvbnMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLkNvbnN0cnVjdG9yXTogbG9jYWxpemUoJ19jb25zdHJ1Y3RvcicsIFwiY29uc3RydWN0b3JzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5WYXJpYWJsZV06IGxvY2FsaXplKCd2YXJpYWJsZScsIFwidmFyaWFibGVzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5DbGFzc106IGxvY2FsaXplKCdjbGFzcycsIFwiY2xhc3NlcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuU3RydWN0XTogbG9jYWxpemUoJ3N0cnVjdCcsIFwic3RydWN0cyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRXZlbnRdOiBsb2NhbGl6ZSgnZXZlbnQnLCBcImV2ZW50cyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuT3BlcmF0b3JdOiBsb2NhbGl6ZSgnb3BlcmF0b3InLCBcIm9wZXJhdG9ycyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuSW50ZXJmYWNlXTogbG9jYWxpemUoJ2ludGVyZmFjZScsIFwiaW50ZXJmYWNlcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuTmFtZXNwYWNlXTogbG9jYWxpemUoJ25hbWVzcGFjZScsIFwibmFtZXNwYWNlcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuUGFja2FnZV06IGxvY2FsaXplKCdwYWNrYWdlJywgXCJwYWNrYWdlcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuVHlwZVBhcmFtZXRlcl06IGxvY2FsaXplKCd0eXBlUGFyYW1ldGVyJywgXCJ0eXBlIHBhcmFtZXRlcnMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLk1vZHVsZV06IGxvY2FsaXplKCdtb2R1bGVzJywgXCJtb2R1bGVzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5Qcm9wZXJ0eV06IGxvY2FsaXplKCdwcm9wZXJ0eScsIFwicHJvcGVydGllcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRW51bV06IGxvY2FsaXplKCdlbnVtJywgXCJlbnVtZXJhdGlvbnMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLkVudW1NZW1iZXJdOiBsb2NhbGl6ZSgnZW51bU1lbWJlcicsIFwiZW51bWVyYXRpb24gbWVtYmVycyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuU3RyaW5nXTogbG9jYWxpemUoJ3N0cmluZycsIFwic3RyaW5ncyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRmlsZV06IGxvY2FsaXplKCdmaWxlJywgXCJmaWxlcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuQXJyYXldOiBsb2NhbGl6ZSgnYXJyYXknLCBcImFycmF5cyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuTnVtYmVyXTogbG9jYWxpemUoJ251bWJlcicsIFwibnVtYmVycyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuQm9vbGVhbl06IGxvY2FsaXplKCdib29sZWFuJywgXCJib29sZWFucyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuT2JqZWN0XTogbG9jYWxpemUoJ29iamVjdCcsIFwib2JqZWN0cyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuS2V5XTogbG9jYWxpemUoJ2tleScsIFwia2V5cyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRmllbGRdOiBsb2NhbGl6ZSgnZmllbGQnLCBcImZpZWxkcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuQ29uc3RhbnRdOiBsb2NhbGl6ZSgnY29uc3RhbnQnLCBcImNvbnN0YW50cyAoezB9KVwiKVxufTtcblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBeUIsY0FBYyxjQUFjLG1CQUFtQjtBQUN4RSxTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxRQUFRLFlBQVk7QUFDN0IsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGtCQUFrQjtBQUUzQixTQUF5QixZQUFZLGFBQWEsV0FBVyw2QkFBNkI7QUFDMUYsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtREFBdUg7QUFDaEksU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQkFBZ0I7QUF3QmxCLElBQWUsd0NBQWYsY0FBNkQsNENBQTRDO0FBQUEs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b0I7QUFBQSxFQUN2RSxDQUFDLFdBQVcsUUFBUSxHQUFHLFNBQVMsWUFBWSxpQkFBaUI7QUFBQSxFQUM3RCxDQUFDLFdBQVcsS0FBSyxHQUFHLFNBQVMsU0FBUyxlQUFlO0FBQUEsRUFDckQsQ0FBQyxXQUFXLE1BQU0sR0FBRyxTQUFTLFVBQVUsZUFBZTtBQUFBLEVBQ3ZELENBQUMsV0FBVyxLQUFLLEdBQUcsU0FBUyxTQUFTLGNBQWM7QUFBQSxFQUNwRCxDQUFDLFdBQVcsUUFBUSxHQUFHLFNBQVMsWUFBWSxpQkFBaUI7QUFBQSxFQUM3RCxDQUFDLFdBQVcsU0FBUyxHQUFHLFNBQVMsYUFBYSxrQkFBa0I7QUFBQSxFQUNoRSxDQUFDLFdBQVcsU0FBUyxHQUFHLFNBQVMsYUFBYSxrQkFBa0I7QUFBQSxFQUNoRSxDQUFDLFdBQVcsT0FBTyxHQUFHLFNBQVMsV0FBVyxnQkFBZ0I7QUFBQSxFQUMxRCxDQUFDLFdBQVcsYUFBYSxHQUFHLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUFBLEVBQzdFLENBQUMsV0FBVyxNQUFNLEdBQUcsU0FBUyxXQUFXLGVBQWU7QUFBQSxFQUN4RCxDQUFDLFdBQVcsUUFBUSxHQUFHLFNBQVMsWUFBWSxrQkFBa0I7QUFBQSxFQUM5RCxDQUFDLFdBQVcsSUFBSSxHQUFHLFNBQVMsUUFBUSxvQkFBb0I7QUFBQSxFQUN4RCxDQUFDLFdBQVcsVUFBVSxHQUFHLFNBQVMsY0FBYywyQkFBMkI7QUFBQSxFQUMzRSxDQUFDLFdBQVcsTUFBTSxHQUFHLFNBQVMsVUFBVSxlQUFlO0FBQUEsRUFDdkQsQ0FBQyxXQUFXLElBQUksR0FBRyxTQUFTLFFBQVEsYUFBYTtBQUFBLEVBQ2pELENBQUMsV0FBVyxLQUFLLEdBQUcsU0FBUyxTQUFTLGNBQWM7QUFBQSxFQUNwRCxDQUFDLFdBQVcsTUFBTSxHQUFHLFNBQVMsVUFBVSxlQUFlO0FBQUEsRUFDdkQsQ0FBQyxXQUFXLE9BQU8sR0FBRyxTQUFTLFdBQVcsZ0JBQWdCO0FBQUEsRUFDMUQsQ0FBQyxXQUFXLE1BQU0sR0FBRyxTQUFTLFVBQVUsZUFBZTtBQUFBLEVBQ3ZELENBQUMsV0FBVyxHQUFHLEdBQUcsU0FBUyxPQUFPLFlBQVk7QUFBQSxFQUM5QyxDQUFDLFdBQVcsS0FBSyxHQUFHLFNBQVMsU0FBUyxjQUFjO0FBQUEsRUFDcEQsQ0FBQyxXQUFXLFFBQVEsR0FBRyxTQUFTLFlBQVksaUJBQWlCO0FBQzlEOyIsCiAgIm5hbWVzIjogWyJ1cGRhdGVMYXN0U2VwYXJhdG9yTGFiZWwiXQp9Cg==
