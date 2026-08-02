import { Color } from "../../../base/common/color.js";
import { Range } from "../../common/core/range.js";
import { MetadataConsts } from "../../common/encodedTokenAttributes.js";
import * as languages from "../../common/languages.js";
import { ILanguageService } from "../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { ModesRegistry } from "../../common/languages/modesRegistry.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import * as standaloneEnums from "../../common/standalone/standaloneEnums.js";
import { StandaloneServices } from "./standaloneServices.js";
import { compile } from "../common/monarch/monarchCompile.js";
import { MonarchTokenizer } from "../common/monarch/monarchLexer.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { EditDeltaInfo } from "../../common/textModelEditSource.js";
function register(language) {
  ModesRegistry.registerLanguage(language);
}
function getLanguages() {
  let result = [];
  result = result.concat(ModesRegistry.getLanguages());
  return result;
}
function getEncodedLanguageId(languageId) {
  const languageService = StandaloneServices.get(ILanguageService);
  return languageService.languageIdCodec.encodeLanguageId(languageId);
}
function onLanguage(languageId, callback) {
  return StandaloneServices.withServices(() => {
    const languageService = StandaloneServices.get(ILanguageService);
    const disposable = languageService.onDidRequestRichLanguageFeatures((encounteredLanguageId) => {
      if (encounteredLanguageId === languageId) {
        disposable.dispose();
        callback();
      }
    });
    return disposable;
  });
}
function onLanguageEncountered(languageId, callback) {
  return StandaloneServices.withServices(() => {
    const languageService = StandaloneServices.get(ILanguageService);
    const disposable = languageService.onDidRequestBasicLanguageFeatures((encounteredLanguageId) => {
      if (encounteredLanguageId === languageId) {
        disposable.dispose();
        callback();
      }
    });
    return disposable;
  });
}
function setLanguageConfiguration(languageId, configuration) {
  const languageService = StandaloneServices.get(ILanguageService);
  if (!languageService.isRegisteredLanguageId(languageId)) {
    throw new Error(`Cannot set configuration for unknown language ${languageId}`);
  }
  const languageConfigurationService = StandaloneServices.get(ILanguageConfigurationService);
  return languageConfigurationService.register(languageId, configuration, 100);
}
class EncodedTokenizationSupportAdapter {
  constructor(languageId, actual) {
    this._languageId = languageId;
    this._actual = actual;
  }
  dispose() {
  }
  getInitialState() {
    return this._actual.getInitialState();
  }
  tokenize(line, hasEOL, state) {
    if (typeof this._actual.tokenize === "function") {
      return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state);
    }
    throw new Error("Not supported!");
  }
  tokenizeEncoded(line, hasEOL, state) {
    const result = this._actual.tokenizeEncoded(line, state);
    return new languages.EncodedTokenizationResult(result.tokens, [], result.endState);
  }
}
class TokenizationSupportAdapter {
  constructor(_languageId, _actual, _languageService, _standaloneThemeService) {
    this._languageId = _languageId;
    this._actual = _actual;
    this._languageService = _languageService;
    this._standaloneThemeService = _standaloneThemeService;
  }
  dispose() {
  }
  getInitialState() {
    return this._actual.getInitialState();
  }
  static _toClassicTokens(tokens, language) {
    const result = [];
    let previousStartIndex = 0;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const t = tokens[i];
      let startIndex = t.startIndex;
      if (i === 0) {
        startIndex = 0;
      } else if (startIndex < previousStartIndex) {
        startIndex = previousStartIndex;
      }
      result[i] = new languages.Token(startIndex, t.scopes, language);
      previousStartIndex = startIndex;
    }
    return result;
  }
  static adaptTokenize(language, actual, line, state) {
    const actualResult = actual.tokenize(line, state);
    const tokens = TokenizationSupportAdapter._toClassicTokens(actualResult.tokens, language);
    let endState;
    if (actualResult.endState.equals(state)) {
      endState = state;
    } else {
      endState = actualResult.endState;
    }
    return new languages.TokenizationResult(tokens, endState);
  }
  tokenize(line, hasEOL, state) {
    return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state);
  }
  _toBinaryTokens(languageIdCodec, tokens) {
    const languageId = languageIdCodec.encodeLanguageId(this._languageId);
    const tokenTheme = this._standaloneThemeService.getColorTheme().tokenTheme;
    const result = [];
    let resultLen = 0;
    let previousStartIndex = 0;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const t = tokens[i];
      const metadata = tokenTheme.match(languageId, t.scopes) | MetadataConsts.BALANCED_BRACKETS_MASK;
      if (resultLen > 0 && result[resultLen - 1] === metadata) {
        continue;
      }
      let startIndex = t.startIndex;
      if (i === 0) {
        startIndex = 0;
      } else if (startIndex < previousStartIndex) {
        startIndex = previousStartIndex;
      }
      result[resultLen++] = startIndex;
      result[resultLen++] = metadata;
      previousStartIndex = startIndex;
    }
    const actualResult = new Uint32Array(resultLen);
    for (let i = 0; i < resultLen; i++) {
      actualResult[i] = result[i];
    }
    return actualResult;
  }
  tokenizeEncoded(line, hasEOL, state) {
    const actualResult = this._actual.tokenize(line, state);
    const tokens = this._toBinaryTokens(this._languageService.languageIdCodec, actualResult.tokens);
    let endState;
    if (actualResult.endState.equals(state)) {
      endState = state;
    } else {
      endState = actualResult.endState;
    }
    return new languages.EncodedTokenizationResult(tokens, [], endState);
  }
}
function isATokensProvider(provider) {
  return typeof provider.getInitialState === "function";
}
function isEncodedTokensProvider(provider) {
  return "tokenizeEncoded" in provider;
}
function isThenable(obj) {
  return obj && typeof obj.then === "function";
}
function setColorMap(colorMap) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  if (colorMap) {
    const result = [null];
    for (let i = 1, len = colorMap.length; i < len; i++) {
      result[i] = Color.fromHex(colorMap[i]);
    }
    standaloneThemeService.setColorMapOverride(result);
  } else {
    standaloneThemeService.setColorMapOverride(null);
  }
}
function createTokenizationSupportAdapter(languageId, provider) {
  if (isEncodedTokensProvider(provider)) {
    return new EncodedTokenizationSupportAdapter(languageId, provider);
  } else {
    return new TokenizationSupportAdapter(
      languageId,
      provider,
      StandaloneServices.get(ILanguageService),
      StandaloneServices.get(IStandaloneThemeService)
    );
  }
}
function registerTokensProviderFactory(languageId, factory) {
  const adaptedFactory = new languages.LazyTokenizationSupport(async () => {
    const result = await Promise.resolve(factory.create());
    if (!result) {
      return null;
    }
    if (isATokensProvider(result)) {
      return createTokenizationSupportAdapter(languageId, result);
    }
    return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, result), StandaloneServices.get(IConfigurationService));
  });
  return languages.TokenizationRegistry.registerFactory(languageId, adaptedFactory);
}
function setTokensProvider(languageId, provider) {
  const languageService = StandaloneServices.get(ILanguageService);
  if (!languageService.isRegisteredLanguageId(languageId)) {
    throw new Error(`Cannot set tokens provider for unknown language ${languageId}`);
  }
  if (isThenable(provider)) {
    return registerTokensProviderFactory(languageId, { create: () => provider });
  }
  return languages.TokenizationRegistry.register(languageId, createTokenizationSupportAdapter(languageId, provider));
}
function setMonarchTokensProvider(languageId, languageDef) {
  const create = (languageDef2) => {
    return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, languageDef2), StandaloneServices.get(IConfigurationService));
  };
  if (isThenable(languageDef)) {
    return registerTokensProviderFactory(languageId, { create: () => languageDef });
  }
  return languages.TokenizationRegistry.register(languageId, create(languageDef));
}
function registerReferenceProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.referenceProvider.register(languageSelector, provider);
}
function registerRenameProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.renameProvider.register(languageSelector, provider);
}
function registerNewSymbolNameProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.newSymbolNamesProvider.register(languageSelector, provider);
}
function registerSignatureHelpProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.signatureHelpProvider.register(languageSelector, provider);
}
function registerHoverProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.hoverProvider.register(languageSelector, {
    provideHover: async (model2, position, token, context) => {
      const word = model2.getWordAtPosition(position);
      return Promise.resolve(provider.provideHover(model2, position, token, context)).then((value) => {
        if (!value) {
          return void 0;
        }
        if (!value.range && word) {
          value.range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        }
        if (!value.range) {
          value.range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
        }
        return value;
      });
    }
  });
}
function registerDocumentSymbolProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentSymbolProvider.register(languageSelector, provider);
}
function registerDocumentHighlightProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentHighlightProvider.register(languageSelector, provider);
}
function registerLinkedEditingRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.linkedEditingRangeProvider.register(languageSelector, provider);
}
function registerDefinitionProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.definitionProvider.register(languageSelector, provider);
}
function registerImplementationProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.implementationProvider.register(languageSelector, provider);
}
function registerTypeDefinitionProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.typeDefinitionProvider.register(languageSelector, provider);
}
function registerCodeLensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.codeLensProvider.register(languageSelector, provider);
}
function registerCodeActionProvider(languageSelector, provider, metadata) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.codeActionProvider.register(languageSelector, {
    providedCodeActionKinds: metadata?.providedCodeActionKinds,
    documentation: metadata?.documentation,
    provideCodeActions: (model2, range, context, token) => {
      const markerService = StandaloneServices.get(IMarkerService);
      const markers = markerService.read({ resource: model2.uri }).filter((m) => {
        return Range.areIntersectingOrTouching(m, range);
      });
      return provider.provideCodeActions(model2, range, { markers, only: context.only, trigger: context.trigger }, token);
    },
    resolveCodeAction: provider.resolveCodeAction
  });
}
function registerDocumentFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentFormattingEditProvider.register(languageSelector, provider);
}
function registerDocumentRangeFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentRangeFormattingEditProvider.register(languageSelector, provider);
}
function registerOnTypeFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.onTypeFormattingEditProvider.register(languageSelector, provider);
}
function registerLinkProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.linkProvider.register(languageSelector, provider);
}
function registerCompletionItemProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.completionProvider.register(languageSelector, provider);
}
function registerColorProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.colorProvider.register(languageSelector, provider);
}
function registerFoldingRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.foldingRangeProvider.register(languageSelector, provider);
}
function registerDeclarationProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.declarationProvider.register(languageSelector, provider);
}
function registerSelectionRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.selectionRangeProvider.register(languageSelector, provider);
}
function registerDocumentSemanticTokensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentSemanticTokensProvider.register(languageSelector, provider);
}
function registerDocumentRangeSemanticTokensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentRangeSemanticTokensProvider.register(languageSelector, provider);
}
function registerInlineCompletionsProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.inlineCompletionsProvider.register(languageSelector, provider);
}
function registerInlayHintsProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.inlayHintsProvider.register(languageSelector, provider);
}
function createMonacoLanguagesAPI() {
  return {
    // eslint-disable-next-line local/code-no-any-casts
    register,
    // eslint-disable-next-line local/code-no-any-casts
    getLanguages,
    // eslint-disable-next-line local/code-no-any-casts
    onLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    onLanguageEncountered,
    // eslint-disable-next-line local/code-no-any-casts
    getEncodedLanguageId,
    // provider methods
    // eslint-disable-next-line local/code-no-any-casts
    setLanguageConfiguration,
    setColorMap,
    // eslint-disable-next-line local/code-no-any-casts
    registerTokensProviderFactory,
    // eslint-disable-next-line local/code-no-any-casts
    setTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    setMonarchTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerReferenceProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerRenameProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerNewSymbolNameProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCompletionItemProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerSignatureHelpProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerHoverProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentSymbolProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentHighlightProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerLinkedEditingRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDefinitionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerImplementationProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerTypeDefinitionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCodeLensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCodeActionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentRangeFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerOnTypeFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerLinkProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerColorProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerFoldingRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDeclarationProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerSelectionRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentSemanticTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentRangeSemanticTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerInlineCompletionsProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerInlayHintsProvider,
    // enums
    DocumentHighlightKind: standaloneEnums.DocumentHighlightKind,
    CompletionItemKind: standaloneEnums.CompletionItemKind,
    CompletionItemTag: standaloneEnums.CompletionItemTag,
    CompletionItemInsertTextRule: standaloneEnums.CompletionItemInsertTextRule,
    SymbolKind: standaloneEnums.SymbolKind,
    SymbolTag: standaloneEnums.SymbolTag,
    IndentAction: standaloneEnums.IndentAction,
    CompletionTriggerKind: standaloneEnums.CompletionTriggerKind,
    SignatureHelpTriggerKind: standaloneEnums.SignatureHelpTriggerKind,
    InlayHintKind: standaloneEnums.InlayHintKind,
    InlineCompletionTriggerKind: standaloneEnums.InlineCompletionTriggerKind,
    CodeActionTriggerType: standaloneEnums.CodeActionTriggerType,
    NewSymbolNameTag: standaloneEnums.NewSymbolNameTag,
    NewSymbolNameTriggerKind: standaloneEnums.NewSymbolNameTriggerKind,
    PartialAcceptTriggerKind: standaloneEnums.PartialAcceptTriggerKind,
    HoverVerbosityAction: standaloneEnums.HoverVerbosityAction,
    InlineCompletionEndOfLifeReasonKind: standaloneEnums.InlineCompletionEndOfLifeReasonKind,
    InlineCompletionHintStyle: standaloneEnums.InlineCompletionHintStyle,
    // classes
    FoldingRangeKind: languages.FoldingRangeKind,
    // eslint-disable-next-line local/code-no-any-casts
    SelectedSuggestionInfo: languages.SelectedSuggestionInfo,
    // eslint-disable-next-line local/code-no-any-casts
    EditDeltaInfo
  };
}
export {
  EncodedTokenizationSupportAdapter,
  TokenizationSupportAdapter,
  createMonacoLanguagesAPI,
  getEncodedLanguageId,
  getLanguages,
  onLanguage,
  onLanguageEncountered,
  register,
  registerCodeActionProvider,
  registerCodeLensProvider,
  registerColorProvider,
  registerCompletionItemProvider,
  registerDeclarationProvider,
  registerDefinitionProvider,
  registerDocumentFormattingEditProvider,
  registerDocumentHighlightProvider,
  registerDocumentRangeFormattingEditProvider,
  registerDocumentRangeSemanticTokensProvider,
  registerDocumentSemanticTokensProvider,
  registerDocumentSymbolProvider,
  registerFoldingRangeProvider,
  registerHoverProvider,
  registerImplementationProvider,
  registerInlayHintsProvider,
  registerInlineCompletionsProvider,
  registerLinkProvider,
  registerLinkedEditingRangeProvider,
  registerNewSymbolNameProvider,
  registerOnTypeFormattingEditProvider,
  registerReferenceProvider,
  registerRenameProvider,
  registerSelectionRangeProvider,
  registerSignatureHelpProvider,
  registerTokensProviderFactory,
  registerTypeDefinitionProvider,
  setColorMap,
  setLanguageConfiguration,
  setMonarchTokensProvider,
  setTokensProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZUxhbmd1YWdlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRXh0ZW5zaW9uUG9pbnQsIElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBNb2Rlc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VsZWN0b3IgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VTZWxlY3Rvci5qcyc7XG5pbXBvcnQgKiBhcyBtb2RlbCBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0ICogYXMgc3RhbmRhbG9uZUVudW1zIGZyb20gJy4uLy4uL2NvbW1vbi9zdGFuZGFsb25lL3N0YW5kYWxvbmVFbnVtcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lU2VydmljZXMgfSBmcm9tICcuL3N0YW5kYWxvbmVTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBjb21waWxlIH0gZnJvbSAnLi4vY29tbW9uL21vbmFyY2gvbW9uYXJjaENvbXBpbGUuanMnO1xuaW1wb3J0IHsgTW9uYXJjaFRva2VuaXplciB9IGZyb20gJy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hMZXhlci5qcyc7XG5pbXBvcnQgeyBJTW9uYXJjaExhbmd1YWdlIH0gZnJvbSAnLi4vY29tbW9uL21vbmFyY2gvbW9uYXJjaFR5cGVzLmpzJztcbmltcG9ydCB7IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3N0YW5kYWxvbmVUaGVtZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgRWRpdERlbHRhSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcblxuLyoqXG4gKiBSZWdpc3RlciBpbmZvcm1hdGlvbiBhYm91dCBhIG5ldyBsYW5ndWFnZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyKGxhbmd1YWdlOiBJTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludCk6IHZvaWQge1xuXHQvLyBJbnRlbnRpb25hbGx5IHVzaW5nIHRoZSBgTW9kZXNSZWdpc3RyeWAgaGVyZSB0byBhdm9pZFxuXHQvLyBpbnN0YW50aWF0aW5nIHNlcnZpY2VzIHRvbyBxdWlja2x5IGluIHRoZSBzdGFuZGFsb25lIGVkaXRvci5cblx0TW9kZXNSZWdpc3RyeS5yZWdpc3Rlckxhbmd1YWdlKGxhbmd1YWdlKTtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGluZm9ybWF0aW9uIG9mIGFsbCB0aGUgcmVnaXN0ZXJlZCBsYW5ndWFnZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYW5ndWFnZXMoKTogSUxhbmd1YWdlRXh0ZW5zaW9uUG9pbnRbXSB7XG5cdGxldCByZXN1bHQ6IElMYW5ndWFnZUV4dGVuc2lvblBvaW50W10gPSBbXTtcblx0cmVzdWx0ID0gcmVzdWx0LmNvbmNhdChNb2Rlc1JlZ2lzdHJ5LmdldExhbmd1YWdlcygpKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVuY29kZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG59XG5cbi8qKlxuICogQW4gZXZlbnQgZW1pdHRlZCB3aGVuIGEgbGFuZ3VhZ2UgaXMgYXNzb2NpYXRlZCBmb3IgdGhlIGZpcnN0IHRpbWUgd2l0aCBhIHRleHQgbW9kZWwuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIFN0YW5kYWxvbmVTZXJ2aWNlcy53aXRoU2VydmljZXMoKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGxhbmd1YWdlU2VydmljZS5vbkRpZFJlcXVlc3RSaWNoTGFuZ3VhZ2VGZWF0dXJlcygoZW5jb3VudGVyZWRMYW5ndWFnZUlkKSA9PiB7XG5cdFx0XHRpZiAoZW5jb3VudGVyZWRMYW5ndWFnZUlkID09PSBsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdC8vIHN0b3AgbGlzdGVuaW5nXG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHQvLyBpbnZva2UgYWN0dWFsIGxpc3RlbmVyXG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdH0pO1xufVxuXG4vKipcbiAqIEFuIGV2ZW50IGVtaXR0ZWQgd2hlbiBhIGxhbmd1YWdlIGlzIGFzc29jaWF0ZWQgZm9yIHRoZSBmaXJzdCB0aW1lIHdpdGggYSB0ZXh0IG1vZGVsIG9yXG4gKiB3aGVuIGEgbGFuZ3VhZ2UgaXMgZW5jb3VudGVyZWQgZHVyaW5nIHRoZSB0b2tlbml6YXRpb24gb2YgYW5vdGhlciBsYW5ndWFnZS5cbiAqIEBldmVudFxuICovXG5leHBvcnQgZnVuY3Rpb24gb25MYW5ndWFnZUVuY291bnRlcmVkKGxhbmd1YWdlSWQ6IHN0cmluZywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiBTdGFuZGFsb25lU2VydmljZXMud2l0aFNlcnZpY2VzKCgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBsYW5ndWFnZVNlcnZpY2Uub25EaWRSZXF1ZXN0QmFzaWNMYW5ndWFnZUZlYXR1cmVzKChlbmNvdW50ZXJlZExhbmd1YWdlSWQpID0+IHtcblx0XHRcdGlmIChlbmNvdW50ZXJlZExhbmd1YWdlSWQgPT09IGxhbmd1YWdlSWQpIHtcblx0XHRcdFx0Ly8gc3RvcCBsaXN0ZW5pbmdcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdC8vIGludm9rZSBhY3R1YWwgbGlzdGVuZXJcblx0XHRcdFx0Y2FsbGJhY2soKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZTtcblx0fSk7XG59XG5cbi8qKlxuICogU2V0IHRoZSBlZGl0aW5nIGNvbmZpZ3VyYXRpb24gZm9yIGEgbGFuZ3VhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGlmICghbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzZXQgY29uZmlndXJhdGlvbiBmb3IgdW5rbm93biBsYW5ndWFnZSAke2xhbmd1YWdlSWR9YCk7XG5cdH1cblx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uLCAxMDApO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgRW5jb2RlZFRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyIGltcGxlbWVudHMgbGFuZ3VhZ2VzLklUb2tlbml6YXRpb25TdXBwb3J0LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWw6IEVuY29kZWRUb2tlbnNQcm92aWRlcjtcblxuXHRjb25zdHJ1Y3RvcihsYW5ndWFnZUlkOiBzdHJpbmcsIGFjdHVhbDogRW5jb2RlZFRva2Vuc1Byb3ZpZGVyKSB7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWQ7XG5cdFx0dGhpcy5fYWN0dWFsID0gYWN0dWFsO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBOT09QXG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5pdGlhbFN0YXRlKCk6IGxhbmd1YWdlcy5JU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemUobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9hY3R1YWwudG9rZW5pemUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlci5hZGFwdFRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWQsIDx7IHRva2VuaXplKGxpbmU6IHN0cmluZywgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBJTGluZVRva2VucyB9PnRoaXMuX2FjdHVhbCwgbGluZSwgc3RhdGUpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQhJyk7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemVFbmNvZGVkKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5FbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9hY3R1YWwudG9rZW5pemVFbmNvZGVkKGxpbmUsIHN0YXRlKTtcblx0XHRyZXR1cm4gbmV3IGxhbmd1YWdlcy5FbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHJlc3VsdC50b2tlbnMsIFtdLCByZXN1bHQuZW5kU3RhdGUpO1xuXHR9XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBjbGFzcyBUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlciBpbXBsZW1lbnRzIGxhbmd1YWdlcy5JVG9rZW5pemF0aW9uU3VwcG9ydCwgSURpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWw6IFRva2Vuc1Byb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlOiBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIE5PT1Bcblx0fVxuXG5cdHB1YmxpYyBnZXRJbml0aWFsU3RhdGUoKTogbGFuZ3VhZ2VzLklTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5nZXRJbml0aWFsU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF90b0NsYXNzaWNUb2tlbnModG9rZW5zOiBJVG9rZW5bXSwgbGFuZ3VhZ2U6IHN0cmluZyk6IGxhbmd1YWdlcy5Ub2tlbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IGxhbmd1YWdlcy5Ub2tlbltdID0gW107XG5cdFx0bGV0IHByZXZpb3VzU3RhcnRJbmRleDogbnVtYmVyID0gMDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdG9rZW5zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0ID0gdG9rZW5zW2ldO1xuXHRcdFx0bGV0IHN0YXJ0SW5kZXggPSB0LnN0YXJ0SW5kZXg7XG5cblx0XHRcdC8vIFByZXZlbnQgaXNzdWVzIHN0ZW1taW5nIGZyb20gYSBidWdneSBleHRlcm5hbCB0b2tlbml6ZXIuXG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHQvLyBGb3JjZSBmaXJzdCB0b2tlbiB0byBzdGFydCBhdCBmaXJzdCBpbmRleCFcblx0XHRcdFx0c3RhcnRJbmRleCA9IDA7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXJ0SW5kZXggPCBwcmV2aW91c1N0YXJ0SW5kZXgpIHtcblx0XHRcdFx0Ly8gRm9yY2UgdG9rZW5zIHRvIGJlIGFmdGVyIG9uZSBhbm90aGVyIVxuXHRcdFx0XHRzdGFydEluZGV4ID0gcHJldmlvdXNTdGFydEluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbaV0gPSBuZXcgbGFuZ3VhZ2VzLlRva2VuKHN0YXJ0SW5kZXgsIHQuc2NvcGVzLCBsYW5ndWFnZSk7XG5cblx0XHRcdHByZXZpb3VzU3RhcnRJbmRleCA9IHN0YXJ0SW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGFkYXB0VG9rZW5pemUobGFuZ3VhZ2U6IHN0cmluZywgYWN0dWFsOiB7IHRva2VuaXplKGxpbmU6IHN0cmluZywgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBJTGluZVRva2VucyB9LCBsaW5lOiBzdHJpbmcsIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgYWN0dWFsUmVzdWx0ID0gYWN0dWFsLnRva2VuaXplKGxpbmUsIHN0YXRlKTtcblx0XHRjb25zdCB0b2tlbnMgPSBUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlci5fdG9DbGFzc2ljVG9rZW5zKGFjdHVhbFJlc3VsdC50b2tlbnMsIGxhbmd1YWdlKTtcblxuXHRcdGxldCBlbmRTdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZTtcblx0XHQvLyB0cnkgdG8gc2F2ZSBhbiBvYmplY3QgaWYgcG9zc2libGVcblx0XHRpZiAoYWN0dWFsUmVzdWx0LmVuZFN0YXRlLmVxdWFscyhzdGF0ZSkpIHtcblx0XHRcdGVuZFN0YXRlID0gc3RhdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVuZFN0YXRlID0gYWN0dWFsUmVzdWx0LmVuZFN0YXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIGVuZFN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyB0b2tlbml6ZShsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRyZXR1cm4gVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIuYWRhcHRUb2tlbml6ZSh0aGlzLl9sYW5ndWFnZUlkLCB0aGlzLl9hY3R1YWwsIGxpbmUsIHN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQmluYXJ5VG9rZW5zKGxhbmd1YWdlSWRDb2RlYzogbGFuZ3VhZ2VzLklMYW5ndWFnZUlkQ29kZWMsIHRva2VuczogSVRva2VuW10pOiBVaW50MzJBcnJheSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKHRoaXMuX2xhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IHRva2VuVGhlbWUgPSB0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50b2tlblRoZW1lO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGxldCBwcmV2aW91c1N0YXJ0SW5kZXg6IG51bWJlciA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRva2Vucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdCA9IHRva2Vuc1tpXTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdG9rZW5UaGVtZS5tYXRjaChsYW5ndWFnZUlkLCB0LnNjb3BlcykgfCBNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLO1xuXHRcdFx0aWYgKHJlc3VsdExlbiA+IDAgJiYgcmVzdWx0W3Jlc3VsdExlbiAtIDFdID09PSBtZXRhZGF0YSkge1xuXHRcdFx0XHQvLyBzYW1lIG1ldGFkYXRhXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc3RhcnRJbmRleCA9IHQuc3RhcnRJbmRleDtcblxuXHRcdFx0Ly8gUHJldmVudCBpc3N1ZXMgc3RlbW1pbmcgZnJvbSBhIGJ1Z2d5IGV4dGVybmFsIHRva2VuaXplci5cblx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdC8vIEZvcmNlIGZpcnN0IHRva2VuIHRvIHN0YXJ0IGF0IGZpcnN0IGluZGV4IVxuXHRcdFx0XHRzdGFydEluZGV4ID0gMDtcblx0XHRcdH0gZWxzZSBpZiAoc3RhcnRJbmRleCA8IHByZXZpb3VzU3RhcnRJbmRleCkge1xuXHRcdFx0XHQvLyBGb3JjZSB0b2tlbnMgdG8gYmUgYWZ0ZXIgb25lIGFub3RoZXIhXG5cdFx0XHRcdHN0YXJ0SW5kZXggPSBwcmV2aW91c1N0YXJ0SW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBzdGFydEluZGV4O1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG1ldGFkYXRhO1xuXG5cdFx0XHRwcmV2aW91c1N0YXJ0SW5kZXggPSBzdGFydEluZGV4O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdHVhbFJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShyZXN1bHRMZW4pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0TGVuOyBpKyspIHtcblx0XHRcdGFjdHVhbFJlc3VsdFtpXSA9IHJlc3VsdFtpXTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdHVhbFJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyB0b2tlbml6ZUVuY29kZWQobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogbGFuZ3VhZ2VzLkVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGFjdHVhbFJlc3VsdCA9IHRoaXMuX2FjdHVhbC50b2tlbml6ZShsaW5lLCBzdGF0ZSk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9CaW5hcnlUb2tlbnModGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYywgYWN0dWFsUmVzdWx0LnRva2Vucyk7XG5cblx0XHRsZXQgZW5kU3RhdGU6IGxhbmd1YWdlcy5JU3RhdGU7XG5cdFx0Ly8gdHJ5IHRvIHNhdmUgYW4gb2JqZWN0IGlmIHBvc3NpYmxlXG5cdFx0aWYgKGFjdHVhbFJlc3VsdC5lbmRTdGF0ZS5lcXVhbHMoc3RhdGUpKSB7XG5cdFx0XHRlbmRTdGF0ZSA9IHN0YXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbmRTdGF0ZSA9IGFjdHVhbFJlc3VsdC5lbmRTdGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGxhbmd1YWdlcy5FbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIGVuZFN0YXRlKTtcblx0fVxufVxuXG4vKipcbiAqIEEgdG9rZW4uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRva2VuIHtcblx0c3RhcnRJbmRleDogbnVtYmVyO1xuXHRzY29wZXM6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGUgcmVzdWx0IG9mIGEgbGluZSB0b2tlbml6YXRpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmVUb2tlbnMge1xuXHQvKipcblx0ICogVGhlIGxpc3Qgb2YgdG9rZW5zIG9uIHRoZSBsaW5lLlxuXHQgKi9cblx0dG9rZW5zOiBJVG9rZW5bXTtcblx0LyoqXG5cdCAqIFRoZSB0b2tlbml6YXRpb24gZW5kIHN0YXRlLlxuXHQgKiBBIHBvaW50ZXIgd2lsbCBiZSBoZWxkIHRvIHRoaXMgYW5kIHRoZSBvYmplY3Qgc2hvdWxkIG5vdCBiZSBtb2RpZmllZCBieSB0aGUgdG9rZW5pemVyIGFmdGVyIHRoZSBwb2ludGVyIGlzIHJldHVybmVkLlxuXHQgKi9cblx0ZW5kU3RhdGU6IGxhbmd1YWdlcy5JU3RhdGU7XG59XG5cbi8qKlxuICogVGhlIHJlc3VsdCBvZiBhIGxpbmUgdG9rZW5pemF0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFbmNvZGVkTGluZVRva2VucyB7XG5cdC8qKlxuXHQgKiBUaGUgdG9rZW5zIG9uIHRoZSBsaW5lIGluIGEgYmluYXJ5LCBlbmNvZGVkIGZvcm1hdC4gRWFjaCB0b2tlbiBvY2N1cGllcyB0d28gYXJyYXkgaW5kaWNlcy4gRm9yIHRva2VuIGk6XG5cdCAqICAtIGF0IG9mZnNldCAyKmkgPT4gc3RhcnRJbmRleFxuXHQgKiAgLSBhdCBvZmZzZXQgMippICsgMSA9PiBtZXRhZGF0YVxuXHQgKiBNZXRhIGRhdGEgaXMgaW4gYmluYXJ5IGZvcm1hdDpcblx0ICogLSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdCAqICAgICAzMzIyIDIyMjIgMjIyMiAxMTExIDExMTEgMTEwMCAwMDAwIDAwMDBcblx0ICogICAgIDEwOTggNzY1NCAzMjEwIDk4NzYgNTQzMiAxMDk4IDc2NTQgMzIxMFxuXHQgKiAtIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0ICogICAgIGJiYmIgYmJiYiBiZmZmIGZmZmYgZmZGRiBGRlRUIExMTEwgTExMTFxuXHQgKiAtIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0ICogIC0gTCA9IEVuY29kZWRMYW5ndWFnZUlkICg4IGJpdHMpOiBVc2UgYGdldEVuY29kZWRMYW5ndWFnZUlkYCB0byBnZXQgdGhlIGVuY29kZWQgSUQgb2YgYSBsYW5ndWFnZS5cblx0ICogIC0gVCA9IFN0YW5kYXJkVG9rZW5UeXBlICgyIGJpdHMpOiBPdGhlciA9IDAsIENvbW1lbnQgPSAxLCBTdHJpbmcgPSAyLCBSZWdFeCA9IDMuXG5cdCAqICAtIEYgPSBGb250U3R5bGUgKDQgYml0cyk6IE5vbmUgPSAwLCBJdGFsaWMgPSAxLCBCb2xkID0gMiwgVW5kZXJsaW5lID0gNCwgU3RyaWtldGhyb3VnaCA9IDguXG5cdCAqICAtIGYgPSBmb3JlZ3JvdW5kIENvbG9ySWQgKDkgYml0cylcblx0ICogIC0gYiA9IGJhY2tncm91bmQgQ29sb3JJZCAoOSBiaXRzKVxuXHQgKiAgLSBUaGUgY29sb3IgdmFsdWUgZm9yIGVhY2ggY29sb3JJZCBpcyBkZWZpbmVkIGluIElTdGFuZGFsb25lVGhlbWVEYXRhLmN1c3RvbVRva2VuQ29sb3JzOlxuXHQgKiBlLmcuIGNvbG9ySWQgPSAxIGlzIHN0b3JlZCBpbiBJU3RhbmRhbG9uZVRoZW1lRGF0YS5jdXN0b21Ub2tlbkNvbG9yc1sxXS4gQ29sb3IgaWQgPSAwIG1lYW5zIG5vIGNvbG9yLFxuXHQgKiBpZCA9IDEgaXMgZm9yIHRoZSBkZWZhdWx0IGZvcmVncm91bmQgY29sb3IsIGlkID0gMiBmb3IgdGhlIGRlZmF1bHQgYmFja2dyb3VuZC5cblx0ICovXG5cdHRva2VuczogVWludDMyQXJyYXk7XG5cdC8qKlxuXHQgKiBUaGUgdG9rZW5pemF0aW9uIGVuZCBzdGF0ZS5cblx0ICogQSBwb2ludGVyIHdpbGwgYmUgaGVsZCB0byB0aGlzIGFuZCB0aGUgb2JqZWN0IHNob3VsZCBub3QgYmUgbW9kaWZpZWQgYnkgdGhlIHRva2VuaXplciBhZnRlciB0aGUgcG9pbnRlciBpcyByZXR1cm5lZC5cblx0ICovXG5cdGVuZFN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlO1xufVxuXG4vKipcbiAqIEEgZmFjdG9yeSBmb3IgdG9rZW4gcHJvdmlkZXJzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRva2Vuc1Byb3ZpZGVyRmFjdG9yeSB7XG5cdGNyZWF0ZSgpOiBsYW5ndWFnZXMuUHJvdmlkZXJSZXN1bHQ8VG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIgfCBJTW9uYXJjaExhbmd1YWdlPjtcbn1cblxuLyoqXG4gKiBBIFwibWFudWFsXCIgcHJvdmlkZXIgb2YgdG9rZW5zLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRva2Vuc1Byb3ZpZGVyIHtcblx0LyoqXG5cdCAqIFRoZSBpbml0aWFsIHN0YXRlIG9mIGEgbGFuZ3VhZ2UuIFdpbGwgYmUgdGhlIHN0YXRlIHBhc3NlZCBpbiB0byB0b2tlbml6ZSB0aGUgZmlyc3QgbGluZS5cblx0ICovXG5cdGdldEluaXRpYWxTdGF0ZSgpOiBsYW5ndWFnZXMuSVN0YXRlO1xuXHQvKipcblx0ICogVG9rZW5pemUgYSBsaW5lIGdpdmVuIHRoZSBzdGF0ZSBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaW5lLlxuXHQgKi9cblx0dG9rZW5pemUobGluZTogc3RyaW5nLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IElMaW5lVG9rZW5zO1xufVxuXG4vKipcbiAqIEEgXCJtYW51YWxcIiBwcm92aWRlciBvZiB0b2tlbnMsIHJldHVybmluZyB0b2tlbnMgaW4gYSBiaW5hcnkgZm9ybS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFbmNvZGVkVG9rZW5zUHJvdmlkZXIge1xuXHQvKipcblx0ICogVGhlIGluaXRpYWwgc3RhdGUgb2YgYSBsYW5ndWFnZS4gV2lsbCBiZSB0aGUgc3RhdGUgcGFzc2VkIGluIHRvIHRva2VuaXplIHRoZSBmaXJzdCBsaW5lLlxuXHQgKi9cblx0Z2V0SW5pdGlhbFN0YXRlKCk6IGxhbmd1YWdlcy5JU3RhdGU7XG5cdC8qKlxuXHQgKiBUb2tlbml6ZSBhIGxpbmUgZ2l2ZW4gdGhlIHN0YXRlIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmUuXG5cdCAqL1xuXHR0b2tlbml6ZUVuY29kZWQobGluZTogc3RyaW5nLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IElFbmNvZGVkTGluZVRva2Vucztcblx0LyoqXG5cdCAqIFRva2VuaXplIGEgbGluZSBnaXZlbiB0aGUgc3RhdGUgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbGluZS5cblx0ICovXG5cdHRva2VuaXplPyhsaW5lOiBzdHJpbmcsIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogSUxpbmVUb2tlbnM7XG59XG5cbmZ1bmN0aW9uIGlzQVRva2Vuc1Byb3ZpZGVyKHByb3ZpZGVyOiBUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlciB8IElNb25hcmNoTGFuZ3VhZ2UpOiBwcm92aWRlciBpcyBUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlciB7XG5cdHJldHVybiAodHlwZW9mIHByb3ZpZGVyLmdldEluaXRpYWxTdGF0ZSA9PT0gJ2Z1bmN0aW9uJyk7XG59XG5cbmZ1bmN0aW9uIGlzRW5jb2RlZFRva2Vuc1Byb3ZpZGVyKHByb3ZpZGVyOiBUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlcik6IHByb3ZpZGVyIGlzIEVuY29kZWRUb2tlbnNQcm92aWRlciB7XG5cdHJldHVybiAndG9rZW5pemVFbmNvZGVkJyBpbiBwcm92aWRlcjtcbn1cblxuZnVuY3Rpb24gaXNUaGVuYWJsZTxUPihvYmo6IGFueSk6IG9iaiBpcyBUaGVuYWJsZTxUPiB7XG5cdHJldHVybiBvYmogJiYgdHlwZW9mIG9iai50aGVuID09PSAnZnVuY3Rpb24nO1xufVxuXG4vKipcbiAqIENoYW5nZSB0aGUgY29sb3IgbWFwIHRoYXQgaXMgdXNlZCBmb3IgdG9rZW4gY29sb3JzLlxuICogU3VwcG9ydGVkIGZvcm1hdHMgKGhleCk6ICNSUkdHQkIsICRSUkdHQkJBQSwgI1JHQiwgI1JHQkFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldENvbG9yTWFwKGNvbG9yTWFwOiBzdHJpbmdbXSB8IG51bGwpOiB2b2lkIHtcblx0Y29uc3Qgc3RhbmRhbG9uZVRoZW1lU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpO1xuXHRpZiAoY29sb3JNYXApIHtcblx0XHRjb25zdCByZXN1bHQ6IENvbG9yW10gPSBbbnVsbCFdO1xuXHRcdGZvciAobGV0IGkgPSAxLCBsZW4gPSBjb2xvck1hcC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmVzdWx0W2ldID0gQ29sb3IuZnJvbUhleChjb2xvck1hcFtpXSk7XG5cdFx0fVxuXHRcdHN0YW5kYWxvbmVUaGVtZVNlcnZpY2Uuc2V0Q29sb3JNYXBPdmVycmlkZShyZXN1bHQpO1xuXHR9IGVsc2Uge1xuXHRcdHN0YW5kYWxvbmVUaGVtZVNlcnZpY2Uuc2V0Q29sb3JNYXBPdmVycmlkZShudWxsKTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5mdW5jdGlvbiBjcmVhdGVUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlcihsYW5ndWFnZUlkOiBzdHJpbmcsIHByb3ZpZGVyOiBUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlcikge1xuXHRpZiAoaXNFbmNvZGVkVG9rZW5zUHJvdmlkZXIocHJvdmlkZXIpKSB7XG5cdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIobGFuZ3VhZ2VJZCwgcHJvdmlkZXIpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXcgVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIoXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpLFxuXHRcdFx0U3RhbmRhbG9uZVNlcnZpY2VzLmdldChJU3RhbmRhbG9uZVRoZW1lU2VydmljZSksXG5cdFx0KTtcblx0fVxufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdG9rZW5zIHByb3ZpZGVyIGZhY3RvcnkgZm9yIGEgbGFuZ3VhZ2UuIFRoaXMgdG9rZW5pemVyIHdpbGwgYmUgZXhjbHVzaXZlIHdpdGggYSB0b2tlbml6ZXJcbiAqIHNldCB1c2luZyBgc2V0VG9rZW5zUHJvdmlkZXJgIG9yIG9uZSBjcmVhdGVkIHVzaW5nIGBzZXRNb25hcmNoVG9rZW5zUHJvdmlkZXJgLCBidXQgd2lsbCB3b3JrIHRvZ2V0aGVyXG4gKiB3aXRoIGEgdG9rZW5zIHByb3ZpZGVyIHNldCB1c2luZyBgcmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXJgIG9yIGByZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVG9rZW5zUHJvdmlkZXJGYWN0b3J5KGxhbmd1YWdlSWQ6IHN0cmluZywgZmFjdG9yeTogVG9rZW5zUHJvdmlkZXJGYWN0b3J5KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBhZGFwdGVkRmFjdG9yeSA9IG5ldyBsYW5ndWFnZXMuTGF6eVRva2VuaXphdGlvblN1cHBvcnQoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShmYWN0b3J5LmNyZWF0ZSgpKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChpc0FUb2tlbnNQcm92aWRlcihyZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIobGFuZ3VhZ2VJZCwgcmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBNb25hcmNoVG9rZW5pemVyKFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSksIFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpLCBsYW5ndWFnZUlkLCBjb21waWxlKGxhbmd1YWdlSWQsIHJlc3VsdCksIFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdH0pO1xuXHRyZXR1cm4gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRmFjdG9yeShsYW5ndWFnZUlkLCBhZGFwdGVkRmFjdG9yeSk7XG59XG5cbi8qKlxuICogU2V0IHRoZSB0b2tlbnMgcHJvdmlkZXIgZm9yIGEgbGFuZ3VhZ2UgKG1hbnVhbCBpbXBsZW1lbnRhdGlvbikuIFRoaXMgdG9rZW5pemVyIHdpbGwgYmUgZXhjbHVzaXZlXG4gKiB3aXRoIGEgdG9rZW5pemVyIGNyZWF0ZWQgdXNpbmcgYHNldE1vbmFyY2hUb2tlbnNQcm92aWRlcmAsIG9yIHdpdGggYHJlZ2lzdGVyVG9rZW5zUHJvdmlkZXJGYWN0b3J5YCxcbiAqIGJ1dCB3aWxsIHdvcmsgdG9nZXRoZXIgd2l0aCBhIHRva2VucyBwcm92aWRlciBzZXQgdXNpbmcgYHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyYFxuICogb3IgYHJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXJgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0VG9rZW5zUHJvdmlkZXIobGFuZ3VhZ2VJZDogc3RyaW5nLCBwcm92aWRlcjogVG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIgfCBUaGVuYWJsZTxUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlcj4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGlmICghbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzZXQgdG9rZW5zIHByb3ZpZGVyIGZvciB1bmtub3duIGxhbmd1YWdlICR7bGFuZ3VhZ2VJZH1gKTtcblx0fVxuXHRpZiAoaXNUaGVuYWJsZTxUb2tlbnNQcm92aWRlciB8IEVuY29kZWRUb2tlbnNQcm92aWRlcj4ocHJvdmlkZXIpKSB7XG5cdFx0cmV0dXJuIHJlZ2lzdGVyVG9rZW5zUHJvdmlkZXJGYWN0b3J5KGxhbmd1YWdlSWQsIHsgY3JlYXRlOiAoKSA9PiBwcm92aWRlciB9KTtcblx0fVxuXHRyZXR1cm4gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKGxhbmd1YWdlSWQsIGNyZWF0ZVRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyKGxhbmd1YWdlSWQsIHByb3ZpZGVyKSk7XG59XG5cbi8qKlxuICogU2V0IHRoZSB0b2tlbnMgcHJvdmlkZXIgZm9yIGEgbGFuZ3VhZ2UgKG1vbmFyY2ggaW1wbGVtZW50YXRpb24pLiBUaGlzIHRva2VuaXplciB3aWxsIGJlIGV4Y2x1c2l2ZVxuICogd2l0aCBhIHRva2VuaXplciBzZXQgdXNpbmcgYHNldFRva2Vuc1Byb3ZpZGVyYCwgb3Igd2l0aCBgcmVnaXN0ZXJUb2tlbnNQcm92aWRlckZhY3RvcnlgLCBidXQgd2lsbFxuICogd29yayB0b2dldGhlciB3aXRoIGEgdG9rZW5zIHByb3ZpZGVyIHNldCB1c2luZyBgcmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXJgIG9yXG4gKiBgcmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRNb25hcmNoVG9rZW5zUHJvdmlkZXIobGFuZ3VhZ2VJZDogc3RyaW5nLCBsYW5ndWFnZURlZjogSU1vbmFyY2hMYW5ndWFnZSB8IFRoZW5hYmxlPElNb25hcmNoTGFuZ3VhZ2U+KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBjcmVhdGUgPSAobGFuZ3VhZ2VEZWY6IElNb25hcmNoTGFuZ3VhZ2UpID0+IHtcblx0XHRyZXR1cm4gbmV3IE1vbmFyY2hUb2tlbml6ZXIoU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKSwgU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJU3RhbmRhbG9uZVRoZW1lU2VydmljZSksIGxhbmd1YWdlSWQsIGNvbXBpbGUobGFuZ3VhZ2VJZCwgbGFuZ3VhZ2VEZWYpLCBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHR9O1xuXHRpZiAoaXNUaGVuYWJsZTxJTW9uYXJjaExhbmd1YWdlPihsYW5ndWFnZURlZikpIHtcblx0XHRyZXR1cm4gcmVnaXN0ZXJUb2tlbnNQcm92aWRlckZhY3RvcnkobGFuZ3VhZ2VJZCwgeyBjcmVhdGU6ICgpID0+IGxhbmd1YWdlRGVmIH0pO1xuXHR9XG5cdHJldHVybiBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgY3JlYXRlKGxhbmd1YWdlRGVmKSk7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSByZWZlcmVuY2UgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiByZWZlcmVuY2Ugc2VhcmNoKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5SZWZlcmVuY2VQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSByZW5hbWUgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiByZW5hbWUgc3ltYm9sKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5SZW5hbWVQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBuZXcgc3ltYm9sLW5hbWUgcHJvdmlkZXIgKGUuZy4sIHdoZW4gYSBzeW1ib2wgaXMgYmVpbmcgcmVuYW1lZCwgc2hvdyBuZXcgcG9zc2libGUgc3ltYm9sLW5hbWVzKVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJOZXdTeW1ib2xOYW1lUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm5ld1N5bWJvbE5hbWVzUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgc2lnbmF0dXJlIGhlbHAgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiBwYXJhbWV0ZXIgaGludHMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2lnbmF0dXJlSGVscFByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGhvdmVyIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gZWRpdG9yIGhvdmVyKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVySG92ZXJQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkhvdmVyUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCB7XG5cdFx0cHJvdmlkZUhvdmVyOiBhc3luYyAobW9kZWw6IG1vZGVsLklUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjb250ZXh0PzogbGFuZ3VhZ2VzLkhvdmVyQ29udGV4dDxsYW5ndWFnZXMuSG92ZXI+KTogUHJvbWlzZTxsYW5ndWFnZXMuSG92ZXIgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbik7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8bGFuZ3VhZ2VzLkhvdmVyIHwgbnVsbCB8IHVuZGVmaW5lZD4ocHJvdmlkZXIucHJvdmlkZUhvdmVyKG1vZGVsLCBwb3NpdGlvbiwgdG9rZW4sIGNvbnRleHQpKS50aGVuKCh2YWx1ZSk6IGxhbmd1YWdlcy5Ib3ZlciB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdmFsdWUucmFuZ2UgJiYgd29yZCkge1xuXHRcdFx0XHRcdHZhbHVlLnJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXZhbHVlLnJhbmdlKSB7XG5cdFx0XHRcdFx0dmFsdWUucmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkb2N1bWVudCBzeW1ib2wgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiBvdXRsaW5lKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkb2N1bWVudCBoaWdobGlnaHQgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiBoaWdobGlnaHQgb2NjdXJyZW5jZXMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhbiBsaW5rZWQgZWRpdGluZyByYW5nZSBwcm92aWRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5MaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkZWZpbml0aW9uIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gZ28gdG8gZGVmaW5pdGlvbikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRlZmluaXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgaW1wbGVtZW50YXRpb24gcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiBnbyB0byBpbXBsZW1lbnRhdGlvbikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5JbXBsZW1lbnRhdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmltcGxlbWVudGF0aW9uUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgdHlwZSBkZWZpbml0aW9uIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gZ28gdG8gdHlwZSBkZWZpbml0aW9uKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLlR5cGVEZWZpbml0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UudHlwZURlZmluaXRpb25Qcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBjb2RlIGxlbnMgcHJvdmlkZXIgKHVzZWQgYnkgZS5nLiBpbmxpbmUgY29kZSBsZW5zZXMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29kZUxlbnNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGNvZGUgYWN0aW9uIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gcXVpY2sgZml4KS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBDb2RlQWN0aW9uUHJvdmlkZXIsIG1ldGFkYXRhPzogQ29kZUFjdGlvblByb3ZpZGVyTWV0YWRhdGEpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHtcblx0XHRwcm92aWRlZENvZGVBY3Rpb25LaW5kczogbWV0YWRhdGE/LnByb3ZpZGVkQ29kZUFjdGlvbktpbmRzLFxuXHRcdGRvY3VtZW50YXRpb246IG1ldGFkYXRhPy5kb2N1bWVudGF0aW9uLFxuXHRcdHByb3ZpZGVDb2RlQWN0aW9uczogKG1vZGVsOiBtb2RlbC5JVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIGNvbnRleHQ6IGxhbmd1YWdlcy5Db2RlQWN0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogbGFuZ3VhZ2VzLlByb3ZpZGVyUmVzdWx0PGxhbmd1YWdlcy5Db2RlQWN0aW9uTGlzdD4gPT4ge1xuXHRcdFx0Y29uc3QgbWFya2VyU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSU1hcmtlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IG1hcmtlclNlcnZpY2UucmVhZCh7IHJlc291cmNlOiBtb2RlbC51cmkgfSkuZmlsdGVyKG0gPT4ge1xuXHRcdFx0XHRyZXR1cm4gUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhtLCByYW5nZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ29kZUFjdGlvbnMobW9kZWwsIHJhbmdlLCB7IG1hcmtlcnMsIG9ubHk6IGNvbnRleHQub25seSwgdHJpZ2dlcjogY29udGV4dC50cmlnZ2VyIH0sIHRva2VuKTtcblx0XHR9LFxuXHRcdHJlc29sdmVDb2RlQWN0aW9uOiBwcm92aWRlci5yZXNvbHZlQ29kZUFjdGlvblxuXHR9KTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGZvcm1hdHRlciB0aGF0IGNhbiBoYW5kbGUgb25seSBlbnRpcmUgbW9kZWxzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGZvcm1hdHRlciB0aGF0IGNhbiBoYW5kbGUgYSByYW5nZSBpbnNpZGUgYSBtb2RlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBmb3JtYXR0ZXIgdGhhbiBjYW4gZG8gZm9ybWF0dGluZyBhcyB0aGUgdXNlciB0eXBlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLk9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uub25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBsaW5rIHByb3ZpZGVyIHRoYXQgY2FuIGZpbmQgbGlua3MgaW4gdGV4dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTGlua1Byb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuTGlua1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBjb21wbGV0aW9uIGl0ZW0gcHJvdmlkZXIgKHVzZSBieSBlLmcuIHN1Z2dlc3Rpb25zKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGRvY3VtZW50IGNvbG9yIHByb3ZpZGVyICh1c2VkIGJ5IENvbG9yIFBpY2tlciwgQ29sb3IgRGVjb3JhdG9yKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29sb3JQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRvY3VtZW50Q29sb3JQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2xvclByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGZvbGRpbmcgcmFuZ2UgcHJvdmlkZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5mb2xkaW5nUmFuZ2VQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkZWNsYXJhdGlvbiBwcm92aWRlclxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRGVjbGFyYXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWNsYXJhdGlvblByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIHNlbGVjdGlvbiByYW5nZSBwcm92aWRlclxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5zZWxlY3Rpb25SYW5nZVByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGRvY3VtZW50IHNlbWFudGljIHRva2VucyBwcm92aWRlci4gQSBzZW1hbnRpYyB0b2tlbnMgcHJvdmlkZXIgd2lsbCBjb21wbGVtZW50IGFuZCBlbmhhbmNlIGFcbiAqIHNpbXBsZSB0b3AtZG93biB0b2tlbml6ZXIuIFNpbXBsZSB0b3AtZG93biB0b2tlbml6ZXJzIGNhbiBiZSBzZXQgZWl0aGVyIHZpYSBgc2V0TW9uYXJjaFRva2Vuc1Byb3ZpZGVyYFxuICogb3IgYHNldFRva2Vuc1Byb3ZpZGVyYC5cbiAqXG4gKiBGb3IgdGhlIGJlc3QgdXNlciBleHBlcmllbmNlLCByZWdpc3RlciBib3RoIGEgc2VtYW50aWMgdG9rZW5zIHByb3ZpZGVyIGFuZCBhIHRvcC1kb3duIHRva2VuaXplci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkb2N1bWVudCByYW5nZSBzZW1hbnRpYyB0b2tlbnMgcHJvdmlkZXIuIEEgc2VtYW50aWMgdG9rZW5zIHByb3ZpZGVyIHdpbGwgY29tcGxlbWVudCBhbmQgZW5oYW5jZSBhXG4gKiBzaW1wbGUgdG9wLWRvd24gdG9rZW5pemVyLiBTaW1wbGUgdG9wLWRvd24gdG9rZW5pemVycyBjYW4gYmUgc2V0IGVpdGhlciB2aWEgYHNldE1vbmFyY2hUb2tlbnNQcm92aWRlcmBcbiAqIG9yIGBzZXRUb2tlbnNQcm92aWRlcmAuXG4gKlxuICogRm9yIHRoZSBiZXN0IHVzZXIgZXhwZXJpZW5jZSwgcmVnaXN0ZXIgYm90aCBhIHNlbWFudGljIHRva2VucyBwcm92aWRlciBhbmQgYSB0b3AtZG93biB0b2tlbml6ZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGFuIGlubGluZSBjb21wbGV0aW9ucyBwcm92aWRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVySW5saW5lQ29tcGxldGlvbnNQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYW4gaW5sYXkgaGludHMgcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlcklubGF5SGludHNQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLklubGF5SGludHNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxheUhpbnRzUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIENvbnRhaW5zIGFkZGl0aW9uYWwgZGlhZ25vc3RpYyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY29udGV4dCBpbiB3aGljaFxuICogYSBbY29kZSBhY3Rpb25dKCNDb2RlQWN0aW9uUHJvdmlkZXIucHJvdmlkZUNvZGVBY3Rpb25zKSBpcyBydW4uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29kZUFjdGlvbkNvbnRleHQge1xuXG5cdC8qKlxuXHQgKiBBbiBhcnJheSBvZiBkaWFnbm9zdGljcy5cblx0ICovXG5cdHJlYWRvbmx5IG1hcmtlcnM6IElNYXJrZXJEYXRhW107XG5cblx0LyoqXG5cdCAqIFJlcXVlc3RlZCBraW5kIG9mIGFjdGlvbnMgdG8gcmV0dXJuLlxuXHQgKi9cblx0cmVhZG9ubHkgb25seT86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIHJlYXNvbiB3aHkgY29kZSBhY3Rpb25zIHdlcmUgcmVxdWVzdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgdHJpZ2dlcjogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZTtcbn1cblxuLyoqXG4gKiBUaGUgY29kZSBhY3Rpb24gaW50ZXJmYWNlIGRlZmluZXMgdGhlIGNvbnRyYWN0IGJldHdlZW4gZXh0ZW5zaW9ucyBhbmRcbiAqIHRoZSBbbGlnaHQgYnVsYl0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvZWRpdGluZ2V2b2x2ZWQjX2NvZGUtYWN0aW9uKSBmZWF0dXJlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENvZGVBY3Rpb25Qcm92aWRlciB7XG5cdC8qKlxuXHQgKiBQcm92aWRlIGNvbW1hbmRzIGZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgYW5kIHJhbmdlLlxuXHQgKi9cblx0cHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsOiBtb2RlbC5JVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIGNvbnRleHQ6IENvZGVBY3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBsYW5ndWFnZXMuUHJvdmlkZXJSZXN1bHQ8bGFuZ3VhZ2VzLkNvZGVBY3Rpb25MaXN0PjtcblxuXHQvKipcblx0ICogR2l2ZW4gYSBjb2RlIGFjdGlvbiBmaWxsIGluIHRoZSBlZGl0LiBXaWxsIG9ubHkgaW52b2tlZCB3aGVuIG1pc3NpbmcuXG5cdCAqL1xuXHRyZXNvbHZlQ29kZUFjdGlvbj8oY29kZUFjdGlvbjogbGFuZ3VhZ2VzLkNvZGVBY3Rpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IGxhbmd1YWdlcy5Qcm92aWRlclJlc3VsdDxsYW5ndWFnZXMuQ29kZUFjdGlvbj47XG59XG5cblxuXG4vKipcbiAqIE1ldGFkYXRhIGFib3V0IHRoZSB0eXBlIG9mIGNvZGUgYWN0aW9ucyB0aGF0IGEge0BsaW5rIENvZGVBY3Rpb25Qcm92aWRlcn0gcHJvdmlkZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29kZUFjdGlvblByb3ZpZGVyTWV0YWRhdGEge1xuXHQvKipcblx0ICogTGlzdCBvZiBjb2RlIGFjdGlvbiBraW5kcyB0aGF0IGEge0BsaW5rIENvZGVBY3Rpb25Qcm92aWRlcn0gbWF5IHJldHVybi5cblx0ICpcblx0ICogVGhpcyBsaXN0IGlzIHVzZWQgdG8gZGV0ZXJtaW5lIGlmIGEgZ2l2ZW4gYENvZGVBY3Rpb25Qcm92aWRlcmAgc2hvdWxkIGJlIGludm9rZWQgb3Igbm90LlxuXHQgKiBUbyBhdm9pZCB1bm5lY2Vzc2FyeSBjb21wdXRhdGlvbiwgZXZlcnkgYENvZGVBY3Rpb25Qcm92aWRlcmAgc2hvdWxkIGxpc3QgdXNlIGBwcm92aWRlZENvZGVBY3Rpb25LaW5kc2AuIFRoZVxuXHQgKiBsaXN0IG9mIGtpbmRzIG1heSBlaXRoZXIgYmUgZ2VuZXJpYywgc3VjaCBhcyBgW1wicXVpY2tmaXhcIiwgXCJyZWZhY3RvclwiLCBcInNvdXJjZVwiXWAsIG9yIGxpc3Qgb3V0IGV2ZXJ5IGtpbmQgcHJvdmlkZWQsXG5cdCAqIHN1Y2ggYXMgYFtcInF1aWNrZml4LnJlbW92ZUxpbmVcIiwgXCJzb3VyY2UuZml4QWxsXCIgLi4uXWAuXG5cdCAqL1xuXHRyZWFkb25seSBwcm92aWRlZENvZGVBY3Rpb25LaW5kcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXG5cdHJlYWRvbmx5IGRvY3VtZW50YXRpb24/OiBSZWFkb25seUFycmF5PHsgcmVhZG9ubHkga2luZDogc3RyaW5nOyByZWFkb25seSBjb21tYW5kOiBsYW5ndWFnZXMuQ29tbWFuZCB9Pjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1vbmFjb0xhbmd1YWdlc0FQSSgpOiB0eXBlb2YgbW9uYWNvLmxhbmd1YWdlcyB7XG5cdHJldHVybiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXI6IDxhbnk+cmVnaXN0ZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0TGFuZ3VhZ2VzOiA8YW55PmdldExhbmd1YWdlcyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRvbkxhbmd1YWdlOiA8YW55Pm9uTGFuZ3VhZ2UsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25MYW5ndWFnZUVuY291bnRlcmVkOiA8YW55Pm9uTGFuZ3VhZ2VFbmNvdW50ZXJlZCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRnZXRFbmNvZGVkTGFuZ3VhZ2VJZDogPGFueT5nZXRFbmNvZGVkTGFuZ3VhZ2VJZCxcblxuXHRcdC8vIHByb3ZpZGVyIG1ldGhvZHNcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRzZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb246IDxhbnk+c2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uLFxuXHRcdHNldENvbG9yTWFwOiBzZXRDb2xvck1hcCxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclRva2Vuc1Byb3ZpZGVyRmFjdG9yeTogPGFueT5yZWdpc3RlclRva2Vuc1Byb3ZpZGVyRmFjdG9yeSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRzZXRUb2tlbnNQcm92aWRlcjogPGFueT5zZXRUb2tlbnNQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRzZXRNb25hcmNoVG9rZW5zUHJvdmlkZXI6IDxhbnk+c2V0TW9uYXJjaFRva2Vuc1Byb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclJlbmFtZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJOZXdTeW1ib2xOYW1lUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJOZXdTeW1ib2xOYW1lUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcjogPGFueT5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckhvdmVyUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJIb3ZlclByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcjogPGFueT5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyOiA8YW55PnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcjogPGFueT5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcjogPGFueT5yZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcjogPGFueT5yZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJMaW5rUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJMaW5rUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJDb2xvclByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyQ29sb3JQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlcklubGluZUNvbXBsZXRpb25zUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyOiA8YW55PnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyLFxuXG5cdFx0Ly8gZW51bXNcblx0XHREb2N1bWVudEhpZ2hsaWdodEtpbmQ6IHN0YW5kYWxvbmVFbnVtcy5Eb2N1bWVudEhpZ2hsaWdodEtpbmQsXG5cdFx0Q29tcGxldGlvbkl0ZW1LaW5kOiBzdGFuZGFsb25lRW51bXMuQ29tcGxldGlvbkl0ZW1LaW5kLFxuXHRcdENvbXBsZXRpb25JdGVtVGFnOiBzdGFuZGFsb25lRW51bXMuQ29tcGxldGlvbkl0ZW1UYWcsXG5cdFx0Q29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZTogc3RhbmRhbG9uZUVudW1zLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUsXG5cdFx0U3ltYm9sS2luZDogc3RhbmRhbG9uZUVudW1zLlN5bWJvbEtpbmQsXG5cdFx0U3ltYm9sVGFnOiBzdGFuZGFsb25lRW51bXMuU3ltYm9sVGFnLFxuXHRcdEluZGVudEFjdGlvbjogc3RhbmRhbG9uZUVudW1zLkluZGVudEFjdGlvbixcblx0XHRDb21wbGV0aW9uVHJpZ2dlcktpbmQ6IHN0YW5kYWxvbmVFbnVtcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQsXG5cdFx0U2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kOiBzdGFuZGFsb25lRW51bXMuU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kLFxuXHRcdElubGF5SGludEtpbmQ6IHN0YW5kYWxvbmVFbnVtcy5JbmxheUhpbnRLaW5kLFxuXHRcdElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZDogc3RhbmRhbG9uZUVudW1zLklubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCxcblx0XHRDb2RlQWN0aW9uVHJpZ2dlclR5cGU6IHN0YW5kYWxvbmVFbnVtcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUsXG5cdFx0TmV3U3ltYm9sTmFtZVRhZzogc3RhbmRhbG9uZUVudW1zLk5ld1N5bWJvbE5hbWVUYWcsXG5cdFx0TmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kOiBzdGFuZGFsb25lRW51bXMuTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLFxuXHRcdFBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZDogc3RhbmRhbG9uZUVudW1zLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZCxcblx0XHRIb3ZlclZlcmJvc2l0eUFjdGlvbjogc3RhbmRhbG9uZUVudW1zLkhvdmVyVmVyYm9zaXR5QWN0aW9uLFxuXHRcdElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kOiBzdGFuZGFsb25lRW51bXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQsXG5cdFx0SW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZTogc3RhbmRhbG9uZUVudW1zLklubGluZUNvbXBsZXRpb25IaW50U3R5bGUsXG5cblx0XHQvLyBjbGFzc2VzXG5cdFx0Rm9sZGluZ1JhbmdlS2luZDogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0U2VsZWN0ZWRTdWdnZXN0aW9uSW5mbzogPGFueT5sYW5ndWFnZXMuU2VsZWN0ZWRTdWdnZXN0aW9uSW5mbyxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRFZGl0RGVsdGFJbmZvOiA8YW55PkVkaXREZWx0YUluZm8sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGFBQWE7QUFHdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFlBQVksZUFBZTtBQUMzQixTQUFrQyx3QkFBd0I7QUFFMUQsU0FBUyxxQ0FBcUM7QUFD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QkFBb0Q7QUFDbkUsU0FBTztBQUFBO0FBQUEsSUFFTjtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUE7QUFBQSxJQUlBO0FBQUEsSUFDQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFFQTtBQUFBO0FBQUEsSUFHQSx1QkFBdUIsZ0JBQWdCO0FBQUEsSUFDdkMsb0JBQW9CLGdCQUFnQjtBQUFBLElBQ3BDLG1CQUFtQixnQkFBZ0I7QUFBQSxJQUNuQyw4QkFBOEIsZ0JBQWdCO0FBQUEsSUFDOUMsWUFBWSxnQkFBZ0I7QUFBQSxJQUM1QixXQUFXLGdCQUFnQjtBQUFBLElBQzNCLGNBQWMsZ0JBQWdCO0FBQUEsSUFDOUIsdUJBQXVCLGdCQUFnQjtBQUFBLElBQ3ZDLDBCQUEwQixnQkFBZ0I7QUFBQSxJQUMxQyxlQUFlLGdCQUFnQjtBQUFBLElBQy9CLDZCQUE2QixnQkFBZ0I7QUFBQSxJQUM3Qyx1QkFBdUIsZ0JBQWdCO0FBQUEsSUFDdkMsa0JBQWtCLGdCQUFnQjtBQUFBLElBQ2xDLDBCQUEwQixnQkFBZ0I7QUFBQSxJQUMxQywwQkFBMEIsZ0JBQWdCO0FBQUEsSUFDMUMsc0JBQXNCLGdCQUFnQjtBQUFBLElBQ3RDLHFDQUFxQyxnQkFBZ0I7QUFBQSxJQUNyRCwyQkFBMkIsZ0JBQWdCO0FBQUE7QUFBQSxJQUczQyxrQkFBa0IsVUFBVTtBQUFBO0FBQUEsSUFFNUIsd0JBQTZCLFVBQVU7QUFBQTtBQUFBLElBRXZDO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJsYW5ndWFnZURlZiIsICJtb2RlbCJdCn0K
