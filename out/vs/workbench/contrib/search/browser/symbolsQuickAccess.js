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
import { localize } from "../../../../nls.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { getWorkspaceSymbols } from "../common/search.js";
import { SymbolKinds, SymbolTag, SymbolKind } from "../../../../editor/common/languages.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { Range } from "../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { getSelectionSearchString } from "../../../../editor/contrib/find/browser/findController.js";
import { prepareQuery, scoreFuzzy2, pieceToQuery } from "../../../../base/common/fuzzyScorer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
let SymbolsQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(labelService, openerService, editorService, configurationService, codeEditorService, chatWidgetService) {
    super(SymbolsQuickAccessProvider.PREFIX, {
      canAcceptInBackground: true,
      noResultsPick: {
        label: localize("noSymbolResults", "No matching workspace symbols")
      }
    });
    this.labelService = labelService;
    this.openerService = openerService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.chatWidgetService = chatWidgetService;
    this.delayer = this._register(new ThrottledDelayer(SymbolsQuickAccessProvider.TYPING_SEARCH_DELAY));
  }
  get defaultFilterValue() {
    const editor = this.codeEditorService.getFocusedCodeEditor();
    if (editor) {
      return getSelectionSearchString(editor) ?? void 0;
    }
    return void 0;
  }
  get configuration() {
    const editorConfig = this.configurationService.getValue().workbench?.editor;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      openSideBySideDirection: editorConfig?.openSideBySideDirection
    };
  }
  _getPicks(filter, disposables, token) {
    return this.getSymbolPicks(filter, void 0, token);
  }
  async getSymbolPicks(filter, options, token) {
    return this.delayer.trigger(async () => {
      if (token.isCancellationRequested) {
        return [];
      }
      return this.doGetSymbolPicks(prepareQuery(filter), options, token);
    }, options?.delay);
  }
  async doGetSymbolPicks(query, options, token) {
    let symbolQuery;
    let containerQuery;
    if (query.values && query.values.length > 1) {
      symbolQuery = pieceToQuery(query.values[0]);
      containerQuery = pieceToQuery(query.values.slice(1));
    } else {
      symbolQuery = query;
    }
    const workspaceSymbols = await getWorkspaceSymbols(symbolQuery.original, token);
    if (token.isCancellationRequested) {
      return [];
    }
    const symbolPicks = [];
    const openSideBySideDirection = this.configuration.openSideBySideDirection;
    for (const { symbol, provider } of workspaceSymbols) {
      if (options?.skipLocal && !SymbolsQuickAccessProvider.TREAT_AS_GLOBAL_SYMBOL_TYPES.has(symbol.kind) && !!symbol.containerName) {
        continue;
      }
      const symbolLabel = symbol.name;
      let symbolScore = void 0;
      let symbolMatches = void 0;
      let skipContainerQuery = false;
      if (symbolQuery.original.length > 0) {
        if (symbolQuery !== query) {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, {
            ...query,
            values: void 0
            /* disable multi-query support */
          }, 0, 0);
          if (typeof symbolScore === "number") {
            skipContainerQuery = true;
          }
        }
        if (typeof symbolScore !== "number") {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, symbolQuery, 0, 0);
          if (typeof symbolScore !== "number") {
            continue;
          }
        }
      }
      const symbolUri = symbol.location.uri;
      let containerLabel = void 0;
      if (symbolUri) {
        const containerPath = this.labelService.getUriLabel(symbolUri, { relative: true });
        if (symbol.containerName) {
          containerLabel = `${symbol.containerName} \u2022 ${containerPath}`;
        } else {
          containerLabel = containerPath;
        }
      }
      let containerScore = void 0;
      let containerMatches = void 0;
      if (!skipContainerQuery && containerQuery && containerQuery.original.length > 0) {
        if (containerLabel) {
          [containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
        }
        if (typeof containerScore !== "number") {
          continue;
        }
        if (typeof symbolScore === "number") {
          symbolScore += containerScore;
        }
      }
      const deprecated = symbol.tags ? symbol.tags.indexOf(SymbolTag.Deprecated) >= 0 : false;
      symbolPicks.push({
        symbol,
        resource: symbolUri,
        score: symbolScore,
        iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(symbol.kind)),
        label: symbolLabel,
        ariaLabel: symbolLabel,
        highlights: deprecated ? void 0 : {
          label: symbolMatches,
          description: containerMatches
        },
        description: containerLabel,
        strikethrough: deprecated,
        buttons: [
          {
            iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
            tooltip: openSideBySideDirection === "right" ? localize("openToSide", "Open to the Side") : localize("openToBottom", "Open to the Bottom")
          }
        ],
        trigger: (buttonIndex, keyMods) => {
          this.openSymbol(provider, symbol, token, { keyMods, forceOpenSideBySide: true });
          return TriggerAction.CLOSE_PICKER;
        },
        accept: async (keyMods, event) => this.openSymbol(provider, symbol, token, { keyMods, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
        attach: (keyMods, event) => {
          if (keyMods.shift) {
            const widget = this.chatWidgetService.lastFocusedWidget;
            if (widget) {
              const entry = {
                kind: "symbol",
                id: JSON.stringify({ uri: symbolUri.toString(), range: symbol.location.range }),
                name: symbol.name,
                value: symbol.location,
                symbolKind: symbol.kind
              };
              widget.attachmentModel.addContext(entry);
            }
            return;
          }
          this.openSymbol(provider, symbol, token, { keyMods, preserveFocus: event.inBackground, forcePinned: event.inBackground });
        }
      });
    }
    if (!options?.skipSorting) {
      symbolPicks.sort((symbolA, symbolB) => this.compareSymbols(symbolA, symbolB));
    }
    return symbolPicks;
  }
  async openSymbol(provider, symbol, token, options) {
    let symbolToOpen = symbol;
    if (typeof provider.resolveWorkspaceSymbol === "function") {
      symbolToOpen = await provider.resolveWorkspaceSymbol(symbol, token) || symbol;
      if (token.isCancellationRequested) {
        return;
      }
    }
    if (symbolToOpen.location.uri.scheme === Schemas.http || symbolToOpen.location.uri.scheme === Schemas.https) {
      await this.openerService.open(symbolToOpen.location.uri, { fromUserGesture: true, allowContributedOpeners: true });
    } else {
      await this.editorService.openEditor({
        resource: symbolToOpen.location.uri,
        options: {
          preserveFocus: options?.preserveFocus,
          pinned: options.keyMods.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
          selection: symbolToOpen.location.range ? Range.collapseToStart(symbolToOpen.location.range) : void 0
        }
      }, options.keyMods.alt || this.configuration.openEditorPinned && options.keyMods.ctrlCmd || options?.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }
  }
  compareSymbols(symbolA, symbolB) {
    if (typeof symbolA.score === "number" && typeof symbolB.score === "number") {
      if (symbolA.score > symbolB.score) {
        return -1;
      }
      if (symbolA.score < symbolB.score) {
        return 1;
      }
    }
    if (symbolA.symbol && symbolB.symbol) {
      const symbolAName = symbolA.symbol.name.toLowerCase();
      const symbolBName = symbolB.symbol.name.toLowerCase();
      const res = symbolAName.localeCompare(symbolBName);
      if (res !== 0) {
        return res;
      }
    }
    if (symbolA.symbol && symbolB.symbol) {
      const symbolAKind = SymbolKinds.toIcon(symbolA.symbol.kind).id;
      const symbolBKind = SymbolKinds.toIcon(symbolB.symbol.kind).id;
      return symbolAKind.localeCompare(symbolBKind);
    }
    return 0;
  }
};
SymbolsQuickAccessProvider.PREFIX = "#";
SymbolsQuickAccessProvider.TYPING_SEARCH_DELAY = 200;
// this delay accommodates for the user typing a word and then stops typing to start searching
SymbolsQuickAccessProvider.TREAT_AS_GLOBAL_SYMBOL_TYPES = /* @__PURE__ */ new Set([
  SymbolKind.Class,
  SymbolKind.Enum,
  SymbolKind.File,
  SymbolKind.Interface,
  SymbolKind.Namespace,
  SymbolKind.Package,
  SymbolKind.Module
]);
SymbolsQuickAccessProvider = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IChatWidgetService)
], SymbolsQuickAccessProvider);
export {
  SymbolsQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3N5bWJvbHNRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIFRyaWdnZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2VTeW1ib2xzLCBJV29ya3NwYWNlU3ltYm9sLCBJV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFN5bWJvbEtpbmRzLCBTeW1ib2xUYWcsIFN5bWJvbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAsIEFDVElWRV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcywgSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlUXVlcnksIElQcmVwYXJlZFF1ZXJ5LCBzY29yZUZ1enp5MiwgcGllY2VUb1F1ZXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgSU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElTeW1ib2xWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN5bWJvbFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtLCBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSB7XG5cdHNjb3JlPzogbnVtYmVyO1xuXHRzeW1ib2w/OiBJV29ya3NwYWNlU3ltYm9sO1xufVxuXG5leHBvcnQgY2xhc3MgU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElTeW1ib2xRdWlja1BpY2tJdGVtPiB7XG5cblx0c3RhdGljIFBSRUZJWCA9ICcjJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUWVBJTkdfU0VBUkNIX0RFTEFZID0gMjAwOyAvLyB0aGlzIGRlbGF5IGFjY29tbW9kYXRlcyBmb3IgdGhlIHVzZXIgdHlwaW5nIGEgd29yZCBhbmQgdGhlbiBzdG9wcyB0eXBpbmcgdG8gc3RhcnQgc2VhcmNoaW5nXG5cblx0cHJpdmF0ZSBzdGF0aWMgVFJFQVRfQVNfR0xPQkFMX1NZTUJPTF9UWVBFUyA9IG5ldyBTZXQ8U3ltYm9sS2luZD4oW1xuXHRcdFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0U3ltYm9sS2luZC5FbnVtLFxuXHRcdFN5bWJvbEtpbmQuRmlsZSxcblx0XHRTeW1ib2xLaW5kLkludGVyZmFjZSxcblx0XHRTeW1ib2xLaW5kLk5hbWVzcGFjZSxcblx0XHRTeW1ib2xLaW5kLlBhY2thZ2UsXG5cdFx0U3ltYm9sS2luZC5Nb2R1bGVcblx0XSk7XG5cblx0cHJpdmF0ZSBkZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8SVN5bWJvbFF1aWNrUGlja0l0ZW1bXT4oU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIuVFlQSU5HX1NFQVJDSF9ERUxBWSkpO1xuXG5cdGdldCBkZWZhdWx0RmlsdGVyVmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIFByZWZlciB0aGUgd29yZCB1bmRlciB0aGUgY3Vyc29yIGluIHRoZSBhY3RpdmUgZWRpdG9yIGFzIGRlZmF1bHQgZmlsdGVyXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHJldHVybiBnZXRTZWxlY3Rpb25TZWFyY2hTdHJpbmcoZWRpdG9yKSA/PyB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCwge1xuXHRcdFx0Y2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiB0cnVlLFxuXHRcdFx0bm9SZXN1bHRzUGljazoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vU3ltYm9sUmVzdWx0cycsIFwiTm8gbWF0Y2hpbmcgd29ya3NwYWNlIHN5bWJvbHNcIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGNvbmZpZ3VyYXRpb24oKSB7XG5cdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoRWRpdG9yQ29uZmlndXJhdGlvbj4oKS53b3JrYmVuY2g/LmVkaXRvcjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvcGVuRWRpdG9yUGlubmVkOiAhZWRpdG9yQ29uZmlnPy5lbmFibGVQcmV2aWV3RnJvbVF1aWNrT3BlbiB8fCAhZWRpdG9yQ29uZmlnPy5lbmFibGVQcmV2aWV3LFxuXHRcdFx0b3BlblNpZGVCeVNpZGVEaXJlY3Rpb246IGVkaXRvckNvbmZpZz8ub3BlblNpZGVCeVNpZGVEaXJlY3Rpb25cblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJU3ltYm9sUXVpY2tQaWNrSXRlbT4+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTeW1ib2xQaWNrcyhmaWx0ZXIsIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgZ2V0U3ltYm9sUGlja3MoZmlsdGVyOiBzdHJpbmcsIG9wdGlvbnM6IHsgc2tpcExvY2FsPzogYm9vbGVhbjsgc2tpcFNvcnRpbmc/OiBib29sZWFuOyBkZWxheT86IG51bWJlciB9IHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElTeW1ib2xRdWlja1BpY2tJdGVtPj4ge1xuXHRcdHJldHVybiB0aGlzLmRlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldFN5bWJvbFBpY2tzKHByZXBhcmVRdWVyeShmaWx0ZXIpLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0fSwgb3B0aW9ucz8uZGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dldFN5bWJvbFBpY2tzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgb3B0aW9uczogeyBza2lwTG9jYWw/OiBib29sZWFuOyBza2lwU29ydGluZz86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJU3ltYm9sUXVpY2tQaWNrSXRlbT4+IHtcblxuXHRcdC8vIFNwbGl0IGJldHdlZW4gc3ltYm9sIGFuZCBjb250YWluZXIgcXVlcnlcblx0XHRsZXQgc3ltYm9sUXVlcnk6IElQcmVwYXJlZFF1ZXJ5O1xuXHRcdGxldCBjb250YWluZXJRdWVyeTogSVByZXBhcmVkUXVlcnkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHF1ZXJ5LnZhbHVlcyAmJiBxdWVyeS52YWx1ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0c3ltYm9sUXVlcnkgPSBwaWVjZVRvUXVlcnkocXVlcnkudmFsdWVzWzBdKTsgXHRcdCAgLy8gc3ltYm9sOiBvbmx5IG1hdGNoIG9uIGZpcnN0IHBhcnRcblx0XHRcdGNvbnRhaW5lclF1ZXJ5ID0gcGllY2VUb1F1ZXJ5KHF1ZXJ5LnZhbHVlcy5zbGljZSgxKSk7IC8vIGNvbnRhaW5lcjogbWF0Y2ggb24gYWxsIGJ1dCBmaXJzdCBwYXJ0c1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzeW1ib2xRdWVyeSA9IHF1ZXJ5O1xuXHRcdH1cblxuXHRcdC8vIFJ1biB0aGUgd29ya3NwYWNlIHN5bWJvbCBxdWVyeVxuXHRcdGNvbnN0IHdvcmtzcGFjZVN5bWJvbHMgPSBhd2FpdCBnZXRXb3Jrc3BhY2VTeW1ib2xzKHN5bWJvbFF1ZXJ5Lm9yaWdpbmFsLCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ltYm9sUGlja3M6IEFycmF5PElTeW1ib2xRdWlja1BpY2tJdGVtPiA9IFtdO1xuXG5cdFx0Ly8gQ29udmVydCB0byBzeW1ib2wgcGlja3MgYW5kIGFwcGx5IGZpbHRlcmluZ1xuXHRcdGNvbnN0IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uLm9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uO1xuXHRcdGZvciAoY29uc3QgeyBzeW1ib2wsIHByb3ZpZGVyIH0gb2Ygd29ya3NwYWNlU3ltYm9scykge1xuXG5cdFx0XHQvLyBEZXBlbmRpbmcgb24gdGhlIHdvcmtzcGFjZSBzeW1ib2xzIGZpbHRlciBzZXR0aW5nLCBza2lwIG92ZXIgc3ltYm9scyB0aGF0OlxuXHRcdFx0Ly8gLSBkbyBub3QgaGF2ZSBhIGNvbnRhaW5lclxuXHRcdFx0Ly8gLSBhbmQgYXJlIG5vdCB0cmVhdGVkIGV4cGxpY2l0bHkgYXMgZ2xvYmFsIHN5bWJvbHMgKGUuZy4gY2xhc3Nlcylcblx0XHRcdGlmIChvcHRpb25zPy5za2lwTG9jYWwgJiYgIVN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyLlRSRUFUX0FTX0dMT0JBTF9TWU1CT0xfVFlQRVMuaGFzKHN5bWJvbC5raW5kKSAmJiAhIXN5bWJvbC5jb250YWluZXJOYW1lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzeW1ib2xMYWJlbCA9IHN5bWJvbC5uYW1lO1xuXG5cdFx0XHQvLyBTY29yZSBieSBzeW1ib2wgbGFiZWwgaWYgc2VhcmNoaW5nXG5cdFx0XHRsZXQgc3ltYm9sU2NvcmU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzeW1ib2xNYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBza2lwQ29udGFpbmVyUXVlcnkgPSBmYWxzZTtcblx0XHRcdGlmIChzeW1ib2xRdWVyeS5vcmlnaW5hbC5sZW5ndGggPiAwKSB7XG5cblx0XHRcdFx0Ly8gRmlyc3Q6IHRyeSB0byBzY29yZSBvbiB0aGUgZW50aXJlIHF1ZXJ5LCBpdCBpcyBwb3NzaWJsZSB0aGF0XG5cdFx0XHRcdC8vIHRoZSBzeW1ib2wgbWF0Y2hlcyBwZXJmZWN0bHkgKGUuZy4gc2VhcmNoaW5nIGZvciBcImNoYW5nZSBsb2dcIlxuXHRcdFx0XHQvLyBjYW4gYmUgYSBtYXRjaCBvbiBhIG1hcmtkb3duIHN5bWJvbCBcImNoYW5nZSBsb2dcIikuIEluIHRoYXRcblx0XHRcdFx0Ly8gY2FzZSB3ZSB3YW50IHRvIHNraXAgdGhlIGNvbnRhaW5lciBxdWVyeSBhbHRvZ2V0aGVyLlxuXHRcdFx0XHRpZiAoc3ltYm9sUXVlcnkgIT09IHF1ZXJ5KSB7XG5cdFx0XHRcdFx0W3N5bWJvbFNjb3JlLCBzeW1ib2xNYXRjaGVzXSA9IHNjb3JlRnV6enkyKHN5bWJvbExhYmVsLCB7IC4uLnF1ZXJ5LCB2YWx1ZXM6IHVuZGVmaW5lZCAvKiBkaXNhYmxlIG11bHRpLXF1ZXJ5IHN1cHBvcnQgKi8gfSwgMCwgMCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdHNraXBDb250YWluZXJRdWVyeSA9IHRydWU7IC8vIHNpbmNlIHdlIGNvbnN1bWVkIHRoZSBxdWVyeSwgc2tpcCBhbnkgY29udGFpbmVyIG1hdGNoaW5nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3RoZXJ3aXNlOiBzY29yZSBvbiB0aGUgc3ltYm9sIHF1ZXJ5IGFuZCBtYXRjaCBvbiB0aGUgY29udGFpbmVyIGxhdGVyXG5cdFx0XHRcdGlmICh0eXBlb2Ygc3ltYm9sU2NvcmUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0W3N5bWJvbFNjb3JlLCBzeW1ib2xNYXRjaGVzXSA9IHNjb3JlRnV6enkyKHN5bWJvbExhYmVsLCBzeW1ib2xRdWVyeSwgMCwgMCk7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzeW1ib2xVcmkgPSBzeW1ib2wubG9jYXRpb24udXJpO1xuXHRcdFx0bGV0IGNvbnRhaW5lckxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3ltYm9sVXJpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lclBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChzeW1ib2xVcmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdGlmIChzeW1ib2wuY29udGFpbmVyTmFtZSkge1xuXHRcdFx0XHRcdGNvbnRhaW5lckxhYmVsID0gYCR7c3ltYm9sLmNvbnRhaW5lck5hbWV9IFx1MjAyMiAke2NvbnRhaW5lclBhdGh9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250YWluZXJMYWJlbCA9IGNvbnRhaW5lclBhdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gU2NvcmUgYnkgY29udGFpbmVyIGlmIHNwZWNpZmllZCBhbmQgc2VhcmNoaW5nXG5cdFx0XHRsZXQgY29udGFpbmVyU2NvcmU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjb250YWluZXJNYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICghc2tpcENvbnRhaW5lclF1ZXJ5ICYmIGNvbnRhaW5lclF1ZXJ5ICYmIGNvbnRhaW5lclF1ZXJ5Lm9yaWdpbmFsLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aWYgKGNvbnRhaW5lckxhYmVsKSB7XG5cdFx0XHRcdFx0W2NvbnRhaW5lclNjb3JlLCBjb250YWluZXJNYXRjaGVzXSA9IHNjb3JlRnV6enkyKGNvbnRhaW5lckxhYmVsLCBjb250YWluZXJRdWVyeSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIGNvbnRhaW5lclNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRzeW1ib2xTY29yZSArPSBjb250YWluZXJTY29yZTsgLy8gYm9vc3Qgc3ltYm9sU2NvcmUgYnkgY29udGFpbmVyU2NvcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZXByZWNhdGVkID0gc3ltYm9sLnRhZ3MgPyBzeW1ib2wudGFncy5pbmRleE9mKFN5bWJvbFRhZy5EZXByZWNhdGVkKSA+PSAwIDogZmFsc2U7XG5cblx0XHRcdHN5bWJvbFBpY2tzLnB1c2goe1xuXHRcdFx0XHRzeW1ib2wsXG5cdFx0XHRcdHJlc291cmNlOiBzeW1ib2xVcmksXG5cdFx0XHRcdHNjb3JlOiBzeW1ib2xTY29yZSxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoU3ltYm9sS2luZHMudG9JY29uKHN5bWJvbC5raW5kKSksXG5cdFx0XHRcdGxhYmVsOiBzeW1ib2xMYWJlbCxcblx0XHRcdFx0YXJpYUxhYmVsOiBzeW1ib2xMYWJlbCxcblx0XHRcdFx0aGlnaGxpZ2h0czogZGVwcmVjYXRlZCA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRsYWJlbDogc3ltYm9sTWF0Y2hlcyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29udGFpbmVyTWF0Y2hlc1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogY29udGFpbmVyTGFiZWwsXG5cdFx0XHRcdHN0cmlrZXRocm91Z2g6IGRlcHJlY2F0ZWQsXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRIb3Jpem9udGFsKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0VmVydGljYWwpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBsb2NhbGl6ZSgnb3BlblRvU2lkZScsIFwiT3BlbiB0byB0aGUgU2lkZVwiKSA6IGxvY2FsaXplKCdvcGVuVG9Cb3R0b20nLCBcIk9wZW4gdG8gdGhlIEJvdHRvbVwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0dHJpZ2dlcjogKGJ1dHRvbkluZGV4LCBrZXlNb2RzKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuU3ltYm9sKHByb3ZpZGVyLCBzeW1ib2wsIHRva2VuLCB7IGtleU1vZHMsIGZvcmNlT3BlblNpZGVCeVNpZGU6IHRydWUgfSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5DTE9TRV9QSUNLRVI7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2VwdDogYXN5bmMgKGtleU1vZHMsIGV2ZW50KSA9PiB0aGlzLm9wZW5TeW1ib2wocHJvdmlkZXIsIHN5bWJvbCwgdG9rZW4sIHsga2V5TW9kcywgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLCBmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kIH0pLFxuXHRcdFx0XHRhdHRhY2g6IChrZXlNb2RzLCBldmVudCkgPT4ge1xuXHRcdFx0XHRcdC8vIE9ubHkgc3VwcG9ydCBhZGRpbmcgY29udGV4dCB0byBjaGF0IHdoZW4gc2hpZnQgaXMgcHJlc3NlZFxuXHRcdFx0XHRcdGlmIChrZXlNb2RzLnNoaWZ0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0XHRcdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbnRyeTogSVN5bWJvbFZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRcdFx0XHRcdFx0a2luZDogJ3N5bWJvbCcsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IEpTT04uc3RyaW5naWZ5KHsgdXJpOiBzeW1ib2xVcmkudG9TdHJpbmcoKSwgcmFuZ2U6IHN5bWJvbC5sb2NhdGlvbi5yYW5nZSB9KSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiBzeW1ib2wubmFtZSxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogc3ltYm9sLmxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdHN5bWJvbEtpbmQ6IHN5bWJvbC5raW5kLFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoZW50cnkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZhbGxiYWNrIHRvIGFjY2VwdCBiZWhhdmlvci5cblx0XHRcdFx0XHR0aGlzLm9wZW5TeW1ib2wocHJvdmlkZXIsIHN5bWJvbCwgdG9rZW4sIHsga2V5TW9kcywgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLCBmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHR9XG5cblx0XHQvLyBTb3J0IHBpY2tzICh1bmxlc3MgZGlzYWJsZWQpXG5cdFx0aWYgKCFvcHRpb25zPy5za2lwU29ydGluZykge1xuXHRcdFx0c3ltYm9sUGlja3Muc29ydCgoc3ltYm9sQSwgc3ltYm9sQikgPT4gdGhpcy5jb21wYXJlU3ltYm9scyhzeW1ib2xBLCBzeW1ib2xCKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN5bWJvbFBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuU3ltYm9sKHByb3ZpZGVyOiBJV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIsIHN5bWJvbDogSVdvcmtzcGFjZVN5bWJvbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zOiB7IGtleU1vZHM6IElLZXlNb2RzOyBmb3JjZU9wZW5TaWRlQnlTaWRlPzogYm9vbGVhbjsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IGZvcmNlUGlubmVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZXNvbHZlIGFjdHVhbCBzeW1ib2wgdG8gb3BlbiBmb3IgcHJvdmlkZXJzIHRoYXQgY2FuIHJlc29sdmVcblx0XHRsZXQgc3ltYm9sVG9PcGVuID0gc3ltYm9sO1xuXHRcdGlmICh0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZVN5bWJvbCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0c3ltYm9sVG9PcGVuID0gYXdhaXQgcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZVN5bWJvbChzeW1ib2wsIHRva2VuKSB8fCBzeW1ib2w7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBIVFRQKHMpIGxpbmtzIHdpdGggb3BlbmVyIHNlcnZpY2Vcblx0XHRpZiAoc3ltYm9sVG9PcGVuLmxvY2F0aW9uLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMuaHR0cCB8fCBzeW1ib2xUb09wZW4ubG9jYXRpb24udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oc3ltYm9sVG9PcGVuLmxvY2F0aW9uLnVyaSwgeyBmcm9tVXNlckdlc3R1cmU6IHRydWUsIGFsbG93Q29udHJpYnV0ZWRPcGVuZXJzOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBvcGVuIGFzIGVkaXRvclxuXHRcdGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogc3ltYm9sVG9PcGVuLmxvY2F0aW9uLnVyaSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IG9wdGlvbnM/LnByZXNlcnZlRm9jdXMsXG5cdFx0XHRcdFx0cGlubmVkOiBvcHRpb25zLmtleU1vZHMuY3RybENtZCB8fCBvcHRpb25zLmZvcmNlUGlubmVkIHx8IHRoaXMuY29uZmlndXJhdGlvbi5vcGVuRWRpdG9yUGlubmVkLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjogc3ltYm9sVG9PcGVuLmxvY2F0aW9uLnJhbmdlID8gUmFuZ2UuY29sbGFwc2VUb1N0YXJ0KHN5bWJvbFRvT3Blbi5sb2NhdGlvbi5yYW5nZSkgOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fSwgb3B0aW9ucy5rZXlNb2RzLmFsdCB8fCAodGhpcy5jb25maWd1cmF0aW9uLm9wZW5FZGl0b3JQaW5uZWQgJiYgb3B0aW9ucy5rZXlNb2RzLmN0cmxDbWQpIHx8IG9wdGlvbnM/LmZvcmNlT3BlblNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVTeW1ib2xzKHN5bWJvbEE6IElTeW1ib2xRdWlja1BpY2tJdGVtLCBzeW1ib2xCOiBJU3ltYm9sUXVpY2tQaWNrSXRlbSk6IG51bWJlciB7XG5cblx0XHQvLyBCeSBzY29yZVxuXHRcdGlmICh0eXBlb2Ygc3ltYm9sQS5zY29yZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHN5bWJvbEIuc2NvcmUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpZiAoc3ltYm9sQS5zY29yZSA+IHN5bWJvbEIuc2NvcmUpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3ltYm9sQS5zY29yZSA8IHN5bWJvbEIuc2NvcmUpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnkgbmFtZVxuXHRcdGlmIChzeW1ib2xBLnN5bWJvbCAmJiBzeW1ib2xCLnN5bWJvbCkge1xuXHRcdFx0Y29uc3Qgc3ltYm9sQU5hbWUgPSBzeW1ib2xBLnN5bWJvbC5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBzeW1ib2xCTmFtZSA9IHN5bWJvbEIuc3ltYm9sLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IHJlcyA9IHN5bWJvbEFOYW1lLmxvY2FsZUNvbXBhcmUoc3ltYm9sQk5hbWUpO1xuXHRcdFx0aWYgKHJlcyAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJ5IGtpbmRcblx0XHRpZiAoc3ltYm9sQS5zeW1ib2wgJiYgc3ltYm9sQi5zeW1ib2wpIHtcblx0XHRcdGNvbnN0IHN5bWJvbEFLaW5kID0gU3ltYm9sS2luZHMudG9JY29uKHN5bWJvbEEuc3ltYm9sLmtpbmQpLmlkO1xuXHRcdFx0Y29uc3Qgc3ltYm9sQktpbmQgPSBTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sQi5zeW1ib2wua2luZCkuaWQ7XG5cdFx0XHRyZXR1cm4gc3ltYm9sQUtpbmQubG9jYWxlQ29tcGFyZShzeW1ib2xCS2luZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIDA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsMkJBQTJCLHFCQUFxQjtBQUdqRixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUF1RTtBQUNoRixTQUFTLGFBQWEsV0FBVyxrQkFBa0I7QUFDbkQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCLFlBQVksb0JBQW9CO0FBQ3pELFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGNBQThCLGFBQWEsb0JBQW9CO0FBRXhFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUEwQjtBQVE1QixJQUFNLDZCQUFOLGNBQXlDLDBCQUFnRDtBQUFBLEVBNkIvRixZQUNpQyxjQUNDLGVBQ0EsZUFDTyxzQkFDSCxtQkFDQSxtQkFDcEM7QUFDRCxVQUFNLDJCQUEyQixRQUFRO0FBQUEsTUFDeEMsdUJBQXVCO0FBQUEsTUFDdkIsZUFBZTtBQUFBLFFBQ2Qs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
