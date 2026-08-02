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
import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../../amdX.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { equals as equalArray } from "../../../../base/common/arrays.js";
import { Color } from "../../../../base/common/color.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from "../../../../base/common/network.js";
import { observableFromEvent } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import * as types from "../../../../base/common/types.js";
import { StandardTokenType } from "../../../../editor/common/encodedTokenAttributes.js";
import { LazyTokenizationSupport, TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap, generateTokensCSSForFontMap } from "../../../../editor/common/languages/supports/tokenization.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { TextMateTokenizationSupport } from "./tokenizationSupport/textMateTokenizationSupport.js";
import { TokenizationSupportWithLineLimit } from "./tokenizationSupport/tokenizationSupportWithLineLimit.js";
import { ThreadedBackgroundTokenizerFactory } from "./backgroundTokenization/threadedBackgroundTokenizerFactory.js";
import { TMGrammarFactory, missingTMGrammarErrorMessage } from "../common/TMGrammarFactory.js";
import { grammarsExtPoint } from "../common/TMGrammars.js";
import { IWorkbenchThemeService } from "../../themes/common/workbenchThemeService.js";
let TextMateTokenizationFeature = class extends Disposable {
  constructor(_languageService, _themeService, _extensionResourceLoaderService, _notificationService, _logService, _configurationService, _progressService, _environmentService, _instantiationService, _telemetryService) {
    super();
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._progressService = _progressService;
    this._environmentService = _environmentService;
    this._instantiationService = _instantiationService;
    this._telemetryService = _telemetryService;
    this._createdModes = [];
    this._encounteredLanguages = [];
    this._debugMode = false;
    this._debugModePrintFunc = () => {
    };
    this._grammarDefinitions = null;
    this._grammarFactory = null;
    this._tokenizersRegistrations = this._register(new DisposableStore());
    this._currentTheme = null;
    this._currentTokenColorMap = null;
    this._currentTokenFontMap = null;
    this._threadedBackgroundTokenizerFactory = this._instantiationService.createInstance(
      ThreadedBackgroundTokenizerFactory,
      (timeMs, languageId, sourceExtensionId, lineLength, isRandomSample) => this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, true, isRandomSample),
      () => this.getAsyncTokenizationEnabled()
    );
    this._vscodeOniguruma = null;
    this._styleElement = domStylesheets.createStyleSheet();
    this._styleElement.className = "vscode-tokens-styles";
    grammarsExtPoint.setHandler((extensions) => this._handleGrammarsExtPoint(extensions));
    this._updateTheme(this._themeService.getColorTheme(), true);
    this._register(this._themeService.onDidColorThemeChange(() => {
      this._updateTheme(this._themeService.getColorTheme(), false);
    }));
    this._register(this._languageService.onDidRequestRichLanguageFeatures((languageId) => {
      this._createdModes.push(languageId);
    }));
  }
  getAsyncTokenizationEnabled() {
    return !!this._configurationService.getValue("editor.experimental.asyncTokenization");
  }
  getAsyncTokenizationVerification() {
    return !!this._configurationService.getValue("editor.experimental.asyncTokenizationVerification");
  }
  _handleGrammarsExtPoint(extensions) {
    this._grammarDefinitions = null;
    if (this._grammarFactory) {
      this._grammarFactory.dispose();
      this._grammarFactory = null;
    }
    this._tokenizersRegistrations.clear();
    this._grammarDefinitions = [];
    for (const extension of extensions) {
      const grammars = extension.value;
      for (const grammar of grammars) {
        const validatedGrammar = this._validateGrammarDefinition(extension, grammar);
        if (validatedGrammar) {
          this._grammarDefinitions.push(validatedGrammar);
          if (validatedGrammar.language) {
            const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(validatedGrammar.language));
            this._tokenizersRegistrations.add(lazyTokenizationSupport);
            this._tokenizersRegistrations.add(TokenizationRegistry.registerFactory(validatedGrammar.language, lazyTokenizationSupport));
          }
        }
      }
    }
    this._threadedBackgroundTokenizerFactory.setGrammarDefinitions(this._grammarDefinitions);
    for (const createdMode of this._createdModes) {
      TokenizationRegistry.getOrCreate(createdMode);
    }
  }
  _validateGrammarDefinition(extension, grammar) {
    if (!validateGrammarExtensionPoint(extension.description.extensionLocation, grammar, extension.collector, this._languageService)) {
      return null;
    }
    const grammarLocation = resources.joinPath(extension.description.extensionLocation, grammar.path);
    const embeddedLanguages = /* @__PURE__ */ Object.create(null);
    if (grammar.embeddedLanguages) {
      const scopes = Object.keys(grammar.embeddedLanguages);
      for (let i = 0, len = scopes.length; i < len; i++) {
        const scope = scopes[i];
        const language = grammar.embeddedLanguages[scope];
        if (typeof language !== "string") {
          continue;
        }
        if (this._languageService.isRegisteredLanguageId(language)) {
          embeddedLanguages[scope] = this._languageService.languageIdCodec.encodeLanguageId(language);
        }
      }
    }
    const tokenTypes = /* @__PURE__ */ Object.create(null);
    if (grammar.tokenTypes) {
      const scopes = Object.keys(grammar.tokenTypes);
      for (const scope of scopes) {
        const tokenType = grammar.tokenTypes[scope];
        switch (tokenType) {
          case "string":
            tokenTypes[scope] = StandardTokenType.String;
            break;
          case "other":
            tokenTypes[scope] = StandardTokenType.Other;
            break;
          case "comment":
            tokenTypes[scope] = StandardTokenType.Comment;
            break;
          case "regex":
            tokenTypes[scope] = StandardTokenType.RegEx;
            break;
        }
      }
    }
    const validLanguageId = grammar.language && this._languageService.isRegisteredLanguageId(grammar.language) ? grammar.language : void 0;
    function asStringArray(array, defaultValue) {
      if (!Array.isArray(array)) {
        return defaultValue;
      }
      if (!array.every((e) => typeof e === "string")) {
        return defaultValue;
      }
      return array;
    }
    return {
      location: grammarLocation,
      language: validLanguageId,
      scopeName: grammar.scopeName,
      embeddedLanguages,
      tokenTypes,
      injectTo: grammar.injectTo,
      balancedBracketSelectors: asStringArray(grammar.balancedBracketScopes, ["*"]),
      unbalancedBracketSelectors: asStringArray(grammar.unbalancedBracketScopes, []),
      sourceExtensionId: extension.description.id
    };
  }
  startDebugMode(printFn, onStop) {
    if (this._debugMode) {
      this._notificationService.error(nls.localize("alreadyDebugging", "Already Logging."));
      return;
    }
    this._debugModePrintFunc = printFn;
    this._debugMode = true;
    if (this._debugMode) {
      this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          buttons: [nls.localize("stop", "Stop")]
        },
        (progress) => {
          progress.report({
            message: nls.localize("progress1", "Preparing to log TM Grammar parsing. Press Stop when finished.")
          });
          return this._getVSCodeOniguruma().then((vscodeOniguruma) => {
            vscodeOniguruma.setDefaultDebugCall(true);
            progress.report({
              message: nls.localize("progress2", "Now logging TM Grammar parsing. Press Stop when finished.")
            });
            return new Promise((resolve, reject) => {
            });
          });
        },
        (choice) => {
          this._getVSCodeOniguruma().then((vscodeOniguruma) => {
            this._debugModePrintFunc = () => {
            };
            this._debugMode = false;
            vscodeOniguruma.setDefaultDebugCall(false);
            onStop();
          });
        }
      );
    }
  }
  _canCreateGrammarFactory() {
    return !!this._grammarDefinitions;
  }
  async _getOrCreateGrammarFactory() {
    if (this._grammarFactory) {
      return this._grammarFactory;
    }
    const [vscodeTextmate, vscodeOniguruma] = await Promise.all([importAMDNodeModule("vscode-textmate", "release/main.js"), this._getVSCodeOniguruma()]);
    const onigLib = Promise.resolve({
      createOnigScanner: (sources) => vscodeOniguruma.createOnigScanner(sources),
      createOnigString: (str) => vscodeOniguruma.createOnigString(str)
    });
    if (this._grammarFactory) {
      return this._grammarFactory;
    }
    this._grammarFactory = new TMGrammarFactory({
      logTrace: (msg) => this._logService.trace(msg),
      logError: (msg, err) => this._logService.error(msg, err),
      readFile: (resource) => this._extensionResourceLoaderService.readExtensionResource(resource)
    }, this._grammarDefinitions || [], vscodeTextmate, onigLib);
    this._updateTheme(this._themeService.getColorTheme(), true);
    return this._grammarFactory;
  }
  async _createTokenizationSupport(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return null;
    }
    if (!this._canCreateGrammarFactory()) {
      return null;
    }
    try {
      const grammarFactory = await this._getOrCreateGrammarFactory();
      if (!grammarFactory.has(languageId)) {
        return null;
      }
      const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
      const r = await grammarFactory.createGrammar(languageId, encodedLanguageId);
      if (!r.grammar) {
        return null;
      }
      const maxTokenizationLineLength = observableConfigValue(
        "editor.maxTokenizationLineLength",
        languageId,
        -1,
        this._configurationService
      );
      const store = new DisposableStore();
      const tokenization = store.add(new TextMateTokenizationSupport(
        r.grammar,
        r.initialState,
        r.containsEmbeddedLanguages,
        (textModel, tokenStore) => this._threadedBackgroundTokenizerFactory.createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength),
        () => this.getAsyncTokenizationVerification(),
        (timeMs, lineLength, isRandomSample) => {
          this._reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, false, isRandomSample);
        },
        true
      ));
      store.add(tokenization.onDidEncounterLanguage((encodedLanguageId2) => {
        if (!this._encounteredLanguages[encodedLanguageId2]) {
          const languageId2 = this._languageService.languageIdCodec.decodeLanguageId(encodedLanguageId2);
          this._encounteredLanguages[encodedLanguageId2] = true;
          this._languageService.requestBasicLanguageFeatures(languageId2);
        }
      }));
      return new TokenizationSupportWithLineLimit(encodedLanguageId, tokenization, store, maxTokenizationLineLength);
    } catch (err) {
      if (err.message && err.message === missingTMGrammarErrorMessage) {
        return null;
      }
      onUnexpectedError(err);
      return null;
    }
  }
  _updateTheme(colorTheme, forceUpdate) {
    if (!forceUpdate && this._currentTheme && this._currentTokenColorMap && equalsTokenRules(this._currentTheme.settings, colorTheme.tokenColors) && equalArray(this._currentTokenColorMap, colorTheme.tokenColorMap) && this._currentTokenFontMap && equalArray(this._currentTokenFontMap, colorTheme.tokenFontMap)) {
      return;
    }
    this._currentTheme = { name: colorTheme.label, settings: colorTheme.tokenColors };
    this._currentTokenColorMap = colorTheme.tokenColorMap;
    this._currentTokenFontMap = colorTheme.tokenFontMap;
    this._grammarFactory?.setTheme(this._currentTheme, this._currentTokenColorMap);
    const colorMap = toColorMap(this._currentTokenColorMap);
    const colorCssRules = generateTokensCSSForColorMap(colorMap);
    const fontCssRules = generateTokensCSSForFontMap(this._currentTokenFontMap);
    this._styleElement.textContent = colorCssRules + fontCssRules;
    TokenizationRegistry.setColorMap(colorMap);
    if (this._currentTheme && this._currentTokenColorMap) {
      this._threadedBackgroundTokenizerFactory.acceptTheme(this._currentTheme, this._currentTokenColorMap);
    }
  }
  async createTokenizer(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return null;
    }
    const grammarFactory = await this._getOrCreateGrammarFactory();
    if (!grammarFactory.has(languageId)) {
      return null;
    }
    const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
    const { grammar } = await grammarFactory.createGrammar(languageId, encodedLanguageId);
    return grammar;
  }
  _getVSCodeOniguruma() {
    if (!this._vscodeOniguruma) {
      this._vscodeOniguruma = (async () => {
        const [vscodeOniguruma, wasm] = await Promise.all([importAMDNodeModule("vscode-oniguruma", "release/main.js"), this._loadVSCodeOnigurumaWASM()]);
        await vscodeOniguruma.loadWASM({
          data: wasm,
          print: (str) => {
            this._debugModePrintFunc(str);
          }
        });
        return vscodeOniguruma;
      })();
    }
    return this._vscodeOniguruma;
  }
  async _loadVSCodeOnigurumaWASM() {
    if (isWeb) {
      const response = await fetch(resolveAmdNodeModulePath("vscode-oniguruma", "release/onig.wasm"));
      return await response.arrayBuffer();
    } else {
      const response = await fetch(this._environmentService.isBuilt ? FileAccess.asBrowserUri(`${nodeModulesAsarUnpackedPath}/vscode-oniguruma/release/onig.wasm`).toString(true) : FileAccess.asBrowserUri(`${nodeModulesPath}/vscode-oniguruma/release/onig.wasm`).toString(true));
      return response;
    }
  }
  _reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, fromWorker, isRandomSample) {
    const key = fromWorker ? "async" : "sync";
    if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] > 50) {
      return;
    }
    if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] === 0) {
      setTimeout(() => {
        TextMateTokenizationFeature.reportTokenizationTimeCounter[key] = 0;
      }, 1e3 * 60 * 60);
    }
    TextMateTokenizationFeature.reportTokenizationTimeCounter[key]++;
    this._telemetryService.publicLog2("editor.tokenizedLine", {
      timeMs,
      languageId,
      lineLength,
      fromWorker,
      sourceExtensionId,
      isRandomSample,
      tokenizationSetting: this.getAsyncTokenizationEnabled() ? this.getAsyncTokenizationVerification() ? 2 : 1 : 0
    });
  }
};
TextMateTokenizationFeature.reportTokenizationTimeCounter = { sync: 0, async: 0 };
TextMateTokenizationFeature = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IExtensionResourceLoaderService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ITelemetryService)
], TextMateTokenizationFeature);
function toColorMap(colorMap) {
  const result = [null];
  for (let i = 1, len = colorMap.length; i < len; i++) {
    result[i] = Color.fromHex(colorMap[i]);
  }
  return result;
}
function equalsTokenRules(a, b) {
  if (!b || !a || b.length !== a.length) {
    return false;
  }
  for (let i = b.length - 1; i >= 0; i--) {
    const r1 = b[i];
    const r2 = a[i];
    if (r1.scope !== r2.scope) {
      return false;
    }
    const s1 = r1.settings;
    const s2 = r2.settings;
    if (s1 && s2) {
      if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background || s1.lineHeight !== s2.lineHeight || s1.fontSize !== s2.fontSize || s1.fontFamily !== s2.fontFamily) {
        return false;
      }
    } else if (!s1 || !s2) {
      return false;
    }
  }
  return true;
}
function validateGrammarExtensionPoint(extensionLocation, syntax, collector, _languageService) {
  if (syntax.language && (typeof syntax.language !== "string" || !_languageService.isRegisteredLanguageId(syntax.language))) {
    collector.error(nls.localize("invalid.language", "Unknown language in `contributes.{0}.language`. Provided value: {1}", grammarsExtPoint.name, String(syntax.language)));
    return false;
  }
  if (!syntax.scopeName || typeof syntax.scopeName !== "string") {
    collector.error(nls.localize("invalid.scopeName", "Expected string in `contributes.{0}.scopeName`. Provided value: {1}", grammarsExtPoint.name, String(syntax.scopeName)));
    return false;
  }
  if (!syntax.path || typeof syntax.path !== "string") {
    collector.error(nls.localize("invalid.path.0", "Expected string in `contributes.{0}.path`. Provided value: {1}", grammarsExtPoint.name, String(syntax.path)));
    return false;
  }
  if (syntax.injectTo && (!Array.isArray(syntax.injectTo) || syntax.injectTo.some((scope) => typeof scope !== "string"))) {
    collector.error(nls.localize("invalid.injectTo", "Invalid value in `contributes.{0}.injectTo`. Must be an array of language scope names. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.injectTo)));
    return false;
  }
  if (syntax.embeddedLanguages && !types.isObject(syntax.embeddedLanguages)) {
    collector.error(nls.localize("invalid.embeddedLanguages", "Invalid value in `contributes.{0}.embeddedLanguages`. Must be an object map from scope name to language. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.embeddedLanguages)));
    return false;
  }
  if (syntax.tokenTypes && !types.isObject(syntax.tokenTypes)) {
    collector.error(nls.localize("invalid.tokenTypes", "Invalid value in `contributes.{0}.tokenTypes`. Must be an object map from scope name to token type. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.tokenTypes)));
    return false;
  }
  const grammarLocation = resources.joinPath(extensionLocation, syntax.path);
  if (!resources.isEqualOrParent(grammarLocation, extensionLocation)) {
    collector.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, grammarLocation.path, extensionLocation.path));
  }
  return true;
}
function observableConfigValue(key, languageId, defaultValue, configurationService) {
  return observableFromEvent(
    (handleChange) => configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(key, { overrideIdentifier: languageId })) {
        handleChange(e);
      }
    }),
    () => configurationService.getValue(key, { overrideIdentifier: languageId }) ?? defaultValue
  );
}
export {
  TextMateTokenizationFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL3RleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlLCByZXNvbHZlQW1kTm9kZU1vZHVsZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgZXF1YWxBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2Vzcywgbm9kZU1vZHVsZXNBc2FyVW5wYWNrZWRQYXRoLCBub2RlTW9kdWxlc1BhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElUb2tlbml6YXRpb25TdXBwb3J0LCBMYXp5VG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcCwgZ2VuZXJhdGVUb2tlbnNDU1NGb3JGb250TWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBJRXh0ZW5zaW9uUG9pbnRVc2VyIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UgfSBmcm9tICcuL3RleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBUZXh0TWF0ZVRva2VuaXphdGlvblN1cHBvcnQgfSBmcm9tICcuL3Rva2VuaXphdGlvblN1cHBvcnQvdGV4dE1hdGVUb2tlbml6YXRpb25TdXBwb3J0LmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblN1cHBvcnRXaXRoTGluZUxpbWl0IH0gZnJvbSAnLi90b2tlbml6YXRpb25TdXBwb3J0L3Rva2VuaXphdGlvblN1cHBvcnRXaXRoTGluZUxpbWl0LmpzJztcbmltcG9ydCB7IFRocmVhZGVkQmFja2dyb3VuZFRva2VuaXplckZhY3RvcnkgfSBmcm9tICcuL2JhY2tncm91bmRUb2tlbml6YXRpb24vdGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBUTUdyYW1tYXJGYWN0b3J5LCBtaXNzaW5nVE1HcmFtbWFyRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vY29tbW9uL1RNR3JhbW1hckZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVRNU3ludGF4RXh0ZW5zaW9uUG9pbnQsIGdyYW1tYXJzRXh0UG9pbnQgfSBmcm9tICcuLi9jb21tb24vVE1HcmFtbWFycy5qcyc7XG5pbXBvcnQgeyBJVmFsaWRFbWJlZGRlZExhbmd1YWdlc01hcCwgSVZhbGlkR3JhbW1hckRlZmluaXRpb24sIElWYWxpZFRva2VuVHlwZU1hcCB9IGZyb20gJy4uL2NvbW1vbi9UTVNjb3BlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNYXRlVGhlbWluZ1J1bGUsIElXb3JrYmVuY2hDb2xvclRoZW1lLCBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJR3JhbW1hciwgSU9uaWdMaWIsIElSYXdUaGVtZSB9IGZyb20gJ3ZzY29kZS10ZXh0bWF0ZSc7XG5pbXBvcnQgeyBJRm9udFRva2VuT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2Uge1xuXHRwcml2YXRlIHN0YXRpYyByZXBvcnRUb2tlbml6YXRpb25UaW1lQ291bnRlciA9IHsgc3luYzogMCwgYXN5bmM6IDAgfTtcblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NyZWF0ZWRNb2Rlczogc3RyaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuY291bnRlcmVkTGFuZ3VhZ2VzOiBib29sZWFuW107XG5cblx0cHJpdmF0ZSBfZGVidWdNb2RlOiBib29sZWFuO1xuXHRwcml2YXRlIF9kZWJ1Z01vZGVQcmludEZ1bmM6IChzdHI6IHN0cmluZykgPT4gdm9pZDtcblxuXHRwcml2YXRlIF9ncmFtbWFyRGVmaW5pdGlvbnM6IElWYWxpZEdyYW1tYXJEZWZpbml0aW9uW10gfCBudWxsO1xuXHRwcml2YXRlIF9ncmFtbWFyRmFjdG9yeTogVE1HcmFtbWFyRmFjdG9yeSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXplcnNSZWdpc3RyYXRpb25zO1xuXHRwcml2YXRlIF9jdXJyZW50VGhlbWU6IElSYXdUaGVtZSB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRUb2tlbkNvbG9yTWFwOiBzdHJpbmdbXSB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRUb2tlbkZvbnRNYXA6IElGb250VG9rZW5PcHRpb25zW10gfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaFRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jcmVhdGVkTW9kZXMgPSBbXTtcblx0XHR0aGlzLl9lbmNvdW50ZXJlZExhbmd1YWdlcyA9IFtdO1xuXHRcdHRoaXMuX2RlYnVnTW9kZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2RlYnVnTW9kZVByaW50RnVuYyA9ICgpID0+IHsgfTtcblx0XHR0aGlzLl9ncmFtbWFyRGVmaW5pdGlvbnMgPSBudWxsO1xuXHRcdHRoaXMuX2dyYW1tYXJGYWN0b3J5ID0gbnVsbDtcblx0XHR0aGlzLl90b2tlbml6ZXJzUmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fY3VycmVudFRoZW1lID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50VG9rZW5Db2xvck1hcCA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFRva2VuRm9udE1hcCA9IG51bGw7XG5cdFx0dGhpcy5fdGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeSxcblx0XHRcdCh0aW1lTXMsIGxhbmd1YWdlSWQsIHNvdXJjZUV4dGVuc2lvbklkLCBsaW5lTGVuZ3RoLCBpc1JhbmRvbVNhbXBsZSkgPT4gdGhpcy5fcmVwb3J0VG9rZW5pemF0aW9uVGltZSh0aW1lTXMsIGxhbmd1YWdlSWQsIHNvdXJjZUV4dGVuc2lvbklkLCBsaW5lTGVuZ3RoLCB0cnVlLCBpc1JhbmRvbVNhbXBsZSksXG5cdFx0XHQoKSA9PiB0aGlzLmdldEFzeW5jVG9rZW5pemF0aW9uRW5hYmxlZCgpLFxuXHRcdCk7XG5cdFx0dGhpcy5fdnNjb2RlT25pZ3VydW1hID0gbnVsbDtcblxuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQoKTtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQuY2xhc3NOYW1lID0gJ3ZzY29kZS10b2tlbnMtc3R5bGVzJztcblxuXHRcdGdyYW1tYXJzRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucykgPT4gdGhpcy5faGFuZGxlR3JhbW1hcnNFeHRQb2ludChleHRlbnNpb25zKSk7XG5cblx0XHR0aGlzLl91cGRhdGVUaGVtZSh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLCB0cnVlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRoZW1lKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCksIGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZVNlcnZpY2Uub25EaWRSZXF1ZXN0UmljaExhbmd1YWdlRmVhdHVyZXMoKGxhbmd1YWdlSWQpID0+IHtcblx0XHRcdHRoaXMuX2NyZWF0ZWRNb2Rlcy5wdXNoKGxhbmd1YWdlSWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXN5bmNUb2tlbml6YXRpb25FbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdlZGl0b3IuZXhwZXJpbWVudGFsLmFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uJyk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVHcmFtbWFyc0V4dFBvaW50KGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8SVRNU3ludGF4RXh0ZW5zaW9uUG9pbnRbXT5bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2dyYW1tYXJEZWZpbml0aW9ucyA9IG51bGw7XG5cdFx0aWYgKHRoaXMuX2dyYW1tYXJGYWN0b3J5KSB7XG5cdFx0XHR0aGlzLl9ncmFtbWFyRmFjdG9yeS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9ncmFtbWFyRmFjdG9yeSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX3Rva2VuaXplcnNSZWdpc3RyYXRpb25zLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9ncmFtbWFyRGVmaW5pdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBncmFtbWFycyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdGZvciAoY29uc3QgZ3JhbW1hciBvZiBncmFtbWFycykge1xuXHRcdFx0XHRjb25zdCB2YWxpZGF0ZWRHcmFtbWFyID0gdGhpcy5fdmFsaWRhdGVHcmFtbWFyRGVmaW5pdGlvbihleHRlbnNpb24sIGdyYW1tYXIpO1xuXHRcdFx0XHRpZiAodmFsaWRhdGVkR3JhbW1hcikge1xuXHRcdFx0XHRcdHRoaXMuX2dyYW1tYXJEZWZpbml0aW9ucy5wdXNoKHZhbGlkYXRlZEdyYW1tYXIpO1xuXHRcdFx0XHRcdGlmICh2YWxpZGF0ZWRHcmFtbWFyLmxhbmd1YWdlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXp5VG9rZW5pemF0aW9uU3VwcG9ydCA9IG5ldyBMYXp5VG9rZW5pemF0aW9uU3VwcG9ydCgoKSA9PiB0aGlzLl9jcmVhdGVUb2tlbml6YXRpb25TdXBwb3J0KHZhbGlkYXRlZEdyYW1tYXIubGFuZ3VhZ2UhKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl90b2tlbml6ZXJzUmVnaXN0cmF0aW9ucy5hZGQobGF6eVRva2VuaXphdGlvblN1cHBvcnQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdG9rZW5pemVyc1JlZ2lzdHJhdGlvbnMuYWRkKFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRmFjdG9yeSh2YWxpZGF0ZWRHcmFtbWFyLmxhbmd1YWdlLCBsYXp5VG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3RocmVhZGVkQmFja2dyb3VuZFRva2VuaXplckZhY3Rvcnkuc2V0R3JhbW1hckRlZmluaXRpb25zKHRoaXMuX2dyYW1tYXJEZWZpbml0aW9ucyk7XG5cblx0XHRmb3IgKGNvbnN0IGNyZWF0ZWRNb2RlIG9mIHRoaXMuX2NyZWF0ZWRNb2Rlcykge1xuXHRcdFx0VG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGUoY3JlYXRlZE1vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlR3JhbW1hckRlZmluaXRpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPElUTVN5bnRheEV4dGVuc2lvblBvaW50W10+LCBncmFtbWFyOiBJVE1TeW50YXhFeHRlbnNpb25Qb2ludCk6IElWYWxpZEdyYW1tYXJEZWZpbml0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF2YWxpZGF0ZUdyYW1tYXJFeHRlbnNpb25Qb2ludChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGdyYW1tYXIsIGV4dGVuc2lvbi5jb2xsZWN0b3IsIHRoaXMuX2xhbmd1YWdlU2VydmljZSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyYW1tYXJMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGdyYW1tYXIucGF0aCk7XG5cblx0XHRjb25zdCBlbWJlZGRlZExhbmd1YWdlczogSVZhbGlkRW1iZWRkZWRMYW5ndWFnZXNNYXAgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGlmIChncmFtbWFyLmVtYmVkZGVkTGFuZ3VhZ2VzKSB7XG5cdFx0XHRjb25zdCBzY29wZXMgPSBPYmplY3Qua2V5cyhncmFtbWFyLmVtYmVkZGVkTGFuZ3VhZ2VzKTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzY29wZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGUgPSBzY29wZXNbaV07XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlID0gZ3JhbW1hci5lbWJlZGRlZExhbmd1YWdlc1tzY29wZV07XG5cdFx0XHRcdGlmICh0eXBlb2YgbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Ly8gbmV2ZXIgaHVydHMgdG8gYmUgdG9vIGNhcmVmdWxcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2UpKSB7XG5cdFx0XHRcdFx0ZW1iZWRkZWRMYW5ndWFnZXNbc2NvcGVdID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuVHlwZXM6IElWYWxpZFRva2VuVHlwZU1hcCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0aWYgKGdyYW1tYXIudG9rZW5UeXBlcykge1xuXHRcdFx0Y29uc3Qgc2NvcGVzID0gT2JqZWN0LmtleXMoZ3JhbW1hci50b2tlblR5cGVzKTtcblx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IGdyYW1tYXIudG9rZW5UeXBlc1tzY29wZV07XG5cdFx0XHRcdHN3aXRjaCAodG9rZW5UeXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdFx0XHRcdHRva2VuVHlwZXNbc2NvcGVdID0gU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnb3RoZXInOlxuXHRcdFx0XHRcdFx0dG9rZW5UeXBlc1tzY29wZV0gPSBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2NvbW1lbnQnOlxuXHRcdFx0XHRcdFx0dG9rZW5UeXBlc1tzY29wZV0gPSBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncmVnZXgnOlxuXHRcdFx0XHRcdFx0dG9rZW5UeXBlc1tzY29wZV0gPSBTdGFuZGFyZFRva2VuVHlwZS5SZWdFeDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsaWRMYW5ndWFnZUlkID0gZ3JhbW1hci5sYW5ndWFnZSAmJiB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChncmFtbWFyLmxhbmd1YWdlKSA/IGdyYW1tYXIubGFuZ3VhZ2UgOiB1bmRlZmluZWQ7XG5cblx0XHRmdW5jdGlvbiBhc1N0cmluZ0FycmF5KGFycmF5OiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGFycmF5KSkge1xuXHRcdFx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhcnJheS5ldmVyeShlID0+IHR5cGVvZiBlID09PSAnc3RyaW5nJykpIHtcblx0XHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhcnJheTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bG9jYXRpb246IGdyYW1tYXJMb2NhdGlvbixcblx0XHRcdGxhbmd1YWdlOiB2YWxpZExhbmd1YWdlSWQsXG5cdFx0XHRzY29wZU5hbWU6IGdyYW1tYXIuc2NvcGVOYW1lLFxuXHRcdFx0ZW1iZWRkZWRMYW5ndWFnZXM6IGVtYmVkZGVkTGFuZ3VhZ2VzLFxuXHRcdFx0dG9rZW5UeXBlczogdG9rZW5UeXBlcyxcblx0XHRcdGluamVjdFRvOiBncmFtbWFyLmluamVjdFRvLFxuXHRcdFx0YmFsYW5jZWRCcmFja2V0U2VsZWN0b3JzOiBhc1N0cmluZ0FycmF5KGdyYW1tYXIuYmFsYW5jZWRCcmFja2V0U2NvcGVzLCBbJyonXSksXG5cdFx0XHR1bmJhbGFuY2VkQnJhY2tldFNlbGVjdG9yczogYXNTdHJpbmdBcnJheShncmFtbWFyLnVuYmFsYW5jZWRCcmFja2V0U2NvcGVzLCBbXSksXG5cdFx0XHRzb3VyY2VFeHRlbnNpb25JZDogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhcnREZWJ1Z01vZGUocHJpbnRGbjogKHN0cjogc3RyaW5nKSA9PiB2b2lkLCBvblN0b3A6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVidWdNb2RlKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnYWxyZWFkeURlYnVnZ2luZycsIFwiQWxyZWFkeSBMb2dnaW5nLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVidWdNb2RlUHJpbnRGdW5jID0gcHJpbnRGbjtcblx0XHR0aGlzLl9kZWJ1Z01vZGUgPSB0cnVlO1xuXG5cdFx0aWYgKHRoaXMuX2RlYnVnTW9kZSkge1xuXHRcdFx0dGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRidXR0b25zOiBbbmxzLmxvY2FsaXplKCdzdG9wJywgXCJTdG9wXCIpXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQocHJvZ3Jlc3MpID0+IHtcblx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdwcm9ncmVzczEnLCBcIlByZXBhcmluZyB0byBsb2cgVE0gR3JhbW1hciBwYXJzaW5nLiBQcmVzcyBTdG9wIHdoZW4gZmluaXNoZWQuXCIpXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0VlNDb2RlT25pZ3VydW1hKCkudGhlbigodnNjb2RlT25pZ3VydW1hKSA9PiB7XG5cdFx0XHRcdFx0XHR2c2NvZGVPbmlndXJ1bWEuc2V0RGVmYXVsdERlYnVnQ2FsbCh0cnVlKTtcblx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgncHJvZ3Jlc3MyJywgXCJOb3cgbG9nZ2luZyBUTSBHcmFtbWFyIHBhcnNpbmcuIFByZXNzIFN0b3Agd2hlbiBmaW5pc2hlZC5cIilcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHsgfSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdChjaG9pY2UpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9nZXRWU0NvZGVPbmlndXJ1bWEoKS50aGVuKCh2c2NvZGVPbmlndXJ1bWEpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnTW9kZVByaW50RnVuYyA9ICgpID0+IHsgfTtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnTW9kZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dnNjb2RlT25pZ3VydW1hLnNldERlZmF1bHREZWJ1Z0NhbGwoZmFsc2UpO1xuXHRcdFx0XHRcdFx0b25TdG9wKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuQ3JlYXRlR3JhbW1hckZhY3RvcnkoKTogYm9vbGVhbiB7XG5cdFx0Ly8gQ2hlY2sgaWYgZXh0ZW5zaW9uIHBvaW50IGlzIHJlYWR5XG5cdFx0cmV0dXJuICEhdGhpcy5fZ3JhbW1hckRlZmluaXRpb25zO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgX2dldE9yQ3JlYXRlR3JhbW1hckZhY3RvcnkoKTogUHJvbWlzZTxUTUdyYW1tYXJGYWN0b3J5PiB7XG5cdFx0aWYgKHRoaXMuX2dyYW1tYXJGYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ3JhbW1hckZhY3Rvcnk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3ZzY29kZVRleHRtYXRlLCB2c2NvZGVPbmlndXJ1bWFdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2ltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgndnNjb2RlLXRleHRtYXRlJyk+KCd2c2NvZGUtdGV4dG1hdGUnLCAncmVsZWFzZS9tYWluLmpzJyksIHRoaXMuX2dldFZTQ29kZU9uaWd1cnVtYSgpXSk7XG5cdFx0Y29uc3Qgb25pZ0xpYjogUHJvbWlzZTxJT25pZ0xpYj4gPSBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0Y3JlYXRlT25pZ1NjYW5uZXI6IChzb3VyY2VzOiBzdHJpbmdbXSkgPT4gdnNjb2RlT25pZ3VydW1hLmNyZWF0ZU9uaWdTY2FubmVyKHNvdXJjZXMpLFxuXHRcdFx0Y3JlYXRlT25pZ1N0cmluZzogKHN0cjogc3RyaW5nKSA9PiB2c2NvZGVPbmlndXJ1bWEuY3JlYXRlT25pZ1N0cmluZyhzdHIpXG5cdFx0fSk7XG5cblx0XHQvLyBBdm9pZCBkdXBsaWNhdGUgaW5zdGFudGlhdGlvbnNcblx0XHRpZiAodGhpcy5fZ3JhbW1hckZhY3RvcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ncmFtbWFyRmFjdG9yeTtcblx0XHR9XG5cblx0XHR0aGlzLl9ncmFtbWFyRmFjdG9yeSA9IG5ldyBUTUdyYW1tYXJGYWN0b3J5KHtcblx0XHRcdGxvZ1RyYWNlOiAobXNnOiBzdHJpbmcpID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UobXNnKSxcblx0XHRcdGxvZ0Vycm9yOiAobXNnOiBzdHJpbmcsIGVycjogdW5rbm93bikgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihtc2csIGVyciksXG5cdFx0XHRyZWFkRmlsZTogKHJlc291cmNlOiBVUkkpID0+IHRoaXMuX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UocmVzb3VyY2UpXG5cdFx0fSwgdGhpcy5fZ3JhbW1hckRlZmluaXRpb25zIHx8IFtdLCB2c2NvZGVUZXh0bWF0ZSwgb25pZ0xpYik7XG5cblx0XHR0aGlzLl91cGRhdGVUaGVtZSh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLCB0cnVlKTtcblxuXHRcdHJldHVybiB0aGlzLl9ncmFtbWFyRmFjdG9yeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVRva2VuaXphdGlvblN1cHBvcnQobGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxJVG9rZW5pemF0aW9uU3VwcG9ydCAmIElEaXNwb3NhYmxlIHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2NhbkNyZWF0ZUdyYW1tYXJGYWN0b3J5KCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBncmFtbWFyRmFjdG9yeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlR3JhbW1hckZhY3RvcnkoKTtcblx0XHRcdGlmICghZ3JhbW1hckZhY3RvcnkuaGFzKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRjb25zdCByID0gYXdhaXQgZ3JhbW1hckZhY3RvcnkuY3JlYXRlR3JhbW1hcihsYW5ndWFnZUlkLCBlbmNvZGVkTGFuZ3VhZ2VJZCk7XG5cdFx0XHRpZiAoIXIuZ3JhbW1hcikge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGggPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8bnVtYmVyPihcblx0XHRcdFx0J2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJyxcblx0XHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdFx0LTEsXG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCB0b2tlbml6YXRpb24gPSBzdG9yZS5hZGQobmV3IFRleHRNYXRlVG9rZW5pemF0aW9uU3VwcG9ydChcblx0XHRcdFx0ci5ncmFtbWFyLFxuXHRcdFx0XHRyLmluaXRpYWxTdGF0ZSxcblx0XHRcdFx0ci5jb250YWluc0VtYmVkZGVkTGFuZ3VhZ2VzLFxuXHRcdFx0XHQodGV4dE1vZGVsLCB0b2tlblN0b3JlKSA9PiB0aGlzLl90aHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5LmNyZWF0ZUJhY2tncm91bmRUb2tlbml6ZXIodGV4dE1vZGVsLCB0b2tlblN0b3JlLCBtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5nZXRBc3luY1Rva2VuaXphdGlvblZlcmlmaWNhdGlvbigpLFxuXHRcdFx0XHQodGltZU1zLCBsaW5lTGVuZ3RoLCBpc1JhbmRvbVNhbXBsZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3JlcG9ydFRva2VuaXphdGlvblRpbWUodGltZU1zLCBsYW5ndWFnZUlkLCByLnNvdXJjZUV4dGVuc2lvbklkLCBsaW5lTGVuZ3RoLCBmYWxzZSwgaXNSYW5kb21TYW1wbGUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW5pemF0aW9uLm9uRGlkRW5jb3VudGVyTGFuZ3VhZ2UoKGVuY29kZWRMYW5ndWFnZUlkKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fZW5jb3VudGVyZWRMYW5ndWFnZXNbZW5jb2RlZExhbmd1YWdlSWRdKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZGVjb2RlTGFuZ3VhZ2VJZChlbmNvZGVkTGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0dGhpcy5fZW5jb3VudGVyZWRMYW5ndWFnZXNbZW5jb2RlZExhbmd1YWdlSWRdID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UucmVxdWVzdEJhc2ljTGFuZ3VhZ2VGZWF0dXJlcyhsYW5ndWFnZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFRva2VuaXphdGlvblN1cHBvcnRXaXRoTGluZUxpbWl0KGVuY29kZWRMYW5ndWFnZUlkLCB0b2tlbml6YXRpb24sIHN0b3JlLCBtYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIubWVzc2FnZSAmJiBlcnIubWVzc2FnZSA9PT0gbWlzc2luZ1RNR3JhbW1hckVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHQvLyBEb24ndCBsb2cgdGhpcyBlcnJvciBtZXNzYWdlXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRoZW1lKGNvbG9yVGhlbWU6IElXb3JrYmVuY2hDb2xvclRoZW1lLCBmb3JjZVVwZGF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghZm9yY2VVcGRhdGUgJiYgdGhpcy5fY3VycmVudFRoZW1lICYmIHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwICYmIGVxdWFsc1Rva2VuUnVsZXModGhpcy5fY3VycmVudFRoZW1lLnNldHRpbmdzLCBjb2xvclRoZW1lLnRva2VuQ29sb3JzKVxuXHRcdFx0JiYgZXF1YWxBcnJheSh0aGlzLl9jdXJyZW50VG9rZW5Db2xvck1hcCwgY29sb3JUaGVtZS50b2tlbkNvbG9yTWFwKSAmJiB0aGlzLl9jdXJyZW50VG9rZW5Gb250TWFwICYmIGVxdWFsQXJyYXkodGhpcy5fY3VycmVudFRva2VuRm9udE1hcCwgY29sb3JUaGVtZS50b2tlbkZvbnRNYXApKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRUaGVtZSA9IHsgbmFtZTogY29sb3JUaGVtZS5sYWJlbCwgc2V0dGluZ3M6IGNvbG9yVGhlbWUudG9rZW5Db2xvcnMgfTtcblx0XHR0aGlzLl9jdXJyZW50VG9rZW5Db2xvck1hcCA9IGNvbG9yVGhlbWUudG9rZW5Db2xvck1hcDtcblx0XHR0aGlzLl9jdXJyZW50VG9rZW5Gb250TWFwID0gY29sb3JUaGVtZS50b2tlbkZvbnRNYXA7XG5cblx0XHR0aGlzLl9ncmFtbWFyRmFjdG9yeT8uc2V0VGhlbWUodGhpcy5fY3VycmVudFRoZW1lLCB0aGlzLl9jdXJyZW50VG9rZW5Db2xvck1hcCk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSB0b0NvbG9yTWFwKHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwKTtcblx0XHRjb25zdCBjb2xvckNzc1J1bGVzID0gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCk7XG5cdFx0Y29uc3QgZm9udENzc1J1bGVzID0gZ2VuZXJhdGVUb2tlbnNDU1NGb3JGb250TWFwKHRoaXMuX2N1cnJlbnRUb2tlbkZvbnRNYXApO1xuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gY29sb3JDc3NSdWxlcyArIGZvbnRDc3NSdWxlcztcblx0XHRUb2tlbml6YXRpb25SZWdpc3RyeS5zZXRDb2xvck1hcChjb2xvck1hcCk7XG5cblx0XHRpZiAodGhpcy5fY3VycmVudFRoZW1lICYmIHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwKSB7XG5cdFx0XHR0aGlzLl90aHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5LmFjY2VwdFRoZW1lKHRoaXMuX2N1cnJlbnRUaGVtZSwgdGhpcy5fY3VycmVudFRva2VuQ29sb3JNYXApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjcmVhdGVUb2tlbml6ZXIobGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxJR3JhbW1hciB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMuX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZ3JhbW1hckZhY3RvcnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZUdyYW1tYXJGYWN0b3J5KCk7XG5cdFx0aWYgKCFncmFtbWFyRmFjdG9yeS5oYXMobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0XHRjb25zdCB7IGdyYW1tYXIgfSA9IGF3YWl0IGdyYW1tYXJGYWN0b3J5LmNyZWF0ZUdyYW1tYXIobGFuZ3VhZ2VJZCwgZW5jb2RlZExhbmd1YWdlSWQpO1xuXHRcdHJldHVybiBncmFtbWFyO1xuXHR9XG5cblx0cHJpdmF0ZSBfdnNjb2RlT25pZ3VydW1hOiBQcm9taXNlPHR5cGVvZiBpbXBvcnQoJ3ZzY29kZS1vbmlndXJ1bWEnKT4gfCBudWxsO1xuXHRwcml2YXRlIF9nZXRWU0NvZGVPbmlndXJ1bWEoKTogUHJvbWlzZTx0eXBlb2YgaW1wb3J0KCd2c2NvZGUtb25pZ3VydW1hJyk+IHtcblx0XHRpZiAoIXRoaXMuX3ZzY29kZU9uaWd1cnVtYSkge1xuXHRcdFx0dGhpcy5fdnNjb2RlT25pZ3VydW1hID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgW3ZzY29kZU9uaWd1cnVtYSwgd2FzbV0gPSBhd2FpdCBQcm9taXNlLmFsbChbaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCd2c2NvZGUtb25pZ3VydW1hJyk+KCd2c2NvZGUtb25pZ3VydW1hJywgJ3JlbGVhc2UvbWFpbi5qcycpLCB0aGlzLl9sb2FkVlNDb2RlT25pZ3VydW1hV0FTTSgpXSk7XG5cdFx0XHRcdGF3YWl0IHZzY29kZU9uaWd1cnVtYS5sb2FkV0FTTSh7XG5cdFx0XHRcdFx0ZGF0YTogd2FzbSxcblx0XHRcdFx0XHRwcmludDogKHN0cjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWJ1Z01vZGVQcmludEZ1bmMoc3RyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gdnNjb2RlT25pZ3VydW1hO1xuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ZzY29kZU9uaWd1cnVtYTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xvYWRWU0NvZGVPbmlndXJ1bWFXQVNNKCk6IFByb21pc2U8UmVzcG9uc2UgfCBBcnJheUJ1ZmZlcj4ge1xuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNvbHZlQW1kTm9kZU1vZHVsZVBhdGgoJ3ZzY29kZS1vbmlndXJ1bWEnLCAncmVsZWFzZS9vbmlnLndhc20nKSk7XG5cdFx0XHQvLyBVc2luZyB0aGUgcmVzcG9uc2UgZGlyZWN0bHkgb25seSB3b3JrcyBpZiB0aGUgc2VydmVyIHNldHMgdGhlIE1JTUUgdHlwZSAnYXBwbGljYXRpb24vd2FzbScuXG5cdFx0XHQvLyBPdGhlcndpc2UsIGEgVHlwZUVycm9yIGlzIHRocm93biB3aGVuIHVzaW5nIHRoZSBzdHJlYW1pbmcgY29tcGlsZXIuXG5cdFx0XHQvLyBXZSB0aGVyZWZvcmUgdXNlIHRoZSBub24tc3RyZWFtaW5nIGNvbXBpbGVyIDooLlxuXHRcdFx0cmV0dXJuIGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHRcblx0XHRcdFx0PyBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgJHtub2RlTW9kdWxlc0FzYXJVbnBhY2tlZFBhdGh9L3ZzY29kZS1vbmlndXJ1bWEvcmVsZWFzZS9vbmlnLndhc21gKS50b1N0cmluZyh0cnVlKVxuXHRcdFx0XHQ6IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke25vZGVNb2R1bGVzUGF0aH0vdnNjb2RlLW9uaWd1cnVtYS9yZWxlYXNlL29uaWcud2FzbWApLnRvU3RyaW5nKHRydWUpKTtcblx0XHRcdHJldHVybiByZXNwb25zZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRUb2tlbml6YXRpb25UaW1lKHRpbWVNczogbnVtYmVyLCBsYW5ndWFnZUlkOiBzdHJpbmcsIHNvdXJjZUV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGxpbmVMZW5ndGg6IG51bWJlciwgZnJvbVdvcmtlcjogYm9vbGVhbiwgaXNSYW5kb21TYW1wbGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBmcm9tV29ya2VyID8gJ2FzeW5jJyA6ICdzeW5jJztcblxuXHRcdC8vIDUwIGV2ZW50cyBwZXIgaG91ciAob25lIGV2ZW50IGhhcyBhIGxvdyBwcm9iYWJpbGl0eSlcblx0XHRpZiAoVGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlLnJlcG9ydFRva2VuaXphdGlvblRpbWVDb3VudGVyW2tleV0gPiA1MCkge1xuXHRcdFx0Ly8gRG9uJ3QgZmxvb2QgdGVsZW1ldHJ5IHdpdGggdG9vIG1hbnkgZXZlbnRzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChUZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUucmVwb3J0VG9rZW5pemF0aW9uVGltZUNvdW50ZXJba2V5XSA9PT0gMCkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFRleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZS5yZXBvcnRUb2tlbml6YXRpb25UaW1lQ291bnRlcltrZXldID0gMDtcblx0XHRcdH0sIDEwMDAgKiA2MCAqIDYwKTtcblx0XHR9XG5cdFx0VGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlLnJlcG9ydFRva2VuaXphdGlvblRpbWVDb3VudGVyW2tleV0rKztcblxuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHR0aW1lTXM6IG51bWJlcjtcblx0XHRcdGxhbmd1YWdlSWQ6IHN0cmluZztcblx0XHRcdGxpbmVMZW5ndGg6IG51bWJlcjtcblx0XHRcdGZyb21Xb3JrZXI6IGJvb2xlYW47XG5cdFx0XHRzb3VyY2VFeHRlbnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aXNSYW5kb21TYW1wbGU6IGJvb2xlYW47XG5cdFx0XHR0b2tlbml6YXRpb25TZXR0aW5nOiBudW1iZXI7XG5cdFx0fSwge1xuXHRcdFx0b3duZXI6ICdoZWRpZXQnO1xuXG5cdFx0XHR0aW1lTXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUbyB1bmRlcnN0YW5kIGhvdyBsb25nIGl0IHRvb2sgdG8gdG9rZW5pemUgYSByYW5kb20gbGluZScgfTtcblx0XHRcdGxhbmd1YWdlSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUbyByZWxhdGUgdGhlIHBlcmZvcm1hbmNlIHRvIHRoZSBsYW5ndWFnZScgfTtcblx0XHRcdGxpbmVMZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUbyByZWxhdGUgdGhlIHBlcmZvcm1hbmNlIHRvIHRoZSBsaW5lIGxlbmd0aCcgfTtcblx0XHRcdGZyb21Xb3JrZXI6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUbyBmaWd1cmUgb3V0IGlmIHRoaXMgbGluZSB3YXMgdG9rZW5pemVkIHN5bmMgb3IgYXN5bmMnIH07XG5cdFx0XHRzb3VyY2VFeHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIGZpZ3VyZSBvdXQgd2hpY2ggZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHRoZSBncmFtbWFyJyB9O1xuXHRcdFx0aXNSYW5kb21TYW1wbGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUbyBmaWd1cmUgb3V0IGlmIHRoaXMgaXMgYSByYW5kb20gc2FtcGxlIG9yIG1lYXN1cmVkIGJlY2F1c2Ugb2Ygc29tZSBvdGhlciBjb25kaXRpb24uJyB9O1xuXHRcdFx0dG9rZW5pemF0aW9uU2V0dGluZzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIHVuZGVyc3RhbmQgaWYgdGhlIHVzZXIgaGFzIGFzeW5jIHRva2VuaXphdGlvbiBlbmFibGVkLiAwPXN5bmMsIDE9YXN5bmMsIDI9dmVyaWZpY2F0aW9uJyB9O1xuXG5cdFx0XHRjb21tZW50OiAnVGhpcyBldmVudCBnaXZlcyBpbnNpZ2h0IGFib3V0IHRoZSBwZXJmb3JtYW5jZSBjZXJ0YWluIGdyYW1tYXJzLic7XG5cdFx0fT4oJ2VkaXRvci50b2tlbml6ZWRMaW5lJywge1xuXHRcdFx0dGltZU1zLFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdGxpbmVMZW5ndGgsXG5cdFx0XHRmcm9tV29ya2VyLFxuXHRcdFx0c291cmNlRXh0ZW5zaW9uSWQsXG5cdFx0XHRpc1JhbmRvbVNhbXBsZSxcblx0XHRcdHRva2VuaXphdGlvblNldHRpbmc6IHRoaXMuZ2V0QXN5bmNUb2tlbml6YXRpb25FbmFibGVkKCkgPyAodGhpcy5nZXRBc3luY1Rva2VuaXphdGlvblZlcmlmaWNhdGlvbigpID8gMiA6IDEpIDogMCxcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b0NvbG9yTWFwKGNvbG9yTWFwOiBzdHJpbmdbXSk6IENvbG9yW10ge1xuXHRjb25zdCByZXN1bHQ6IENvbG9yW10gPSBbbnVsbCFdO1xuXHRmb3IgKGxldCBpID0gMSwgbGVuID0gY29sb3JNYXAubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRyZXN1bHRbaV0gPSBDb2xvci5mcm9tSGV4KGNvbG9yTWFwW2ldKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBlcXVhbHNUb2tlblJ1bGVzKGE6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gfCBudWxsLCBiOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRpZiAoIWIgfHwgIWEgfHwgYi5sZW5ndGggIT09IGEubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGZvciAobGV0IGkgPSBiLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgcjEgPSBiW2ldO1xuXHRcdGNvbnN0IHIyID0gYVtpXTtcblx0XHRpZiAocjEuc2NvcGUgIT09IHIyLnNjb3BlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHMxID0gcjEuc2V0dGluZ3M7XG5cdFx0Y29uc3QgczIgPSByMi5zZXR0aW5ncztcblx0XHRpZiAoczEgJiYgczIpIHtcblx0XHRcdGlmIChzMS5mb250U3R5bGUgIT09IHMyLmZvbnRTdHlsZSB8fCBzMS5mb3JlZ3JvdW5kICE9PSBzMi5mb3JlZ3JvdW5kIHx8IHMxLmJhY2tncm91bmQgIT09IHMyLmJhY2tncm91bmQgfHwgczEubGluZUhlaWdodCAhPT0gczIubGluZUhlaWdodCB8fCBzMS5mb250U2l6ZSAhPT0gczIuZm9udFNpemUgfHwgczEuZm9udEZhbWlseSAhPT0gczIuZm9udEZhbWlseSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghczEgfHwgIXMyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUdyYW1tYXJFeHRlbnNpb25Qb2ludChleHRlbnNpb25Mb2NhdGlvbjogVVJJLCBzeW50YXg6IElUTVN5bnRheEV4dGVuc2lvblBvaW50LCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UpOiBib29sZWFuIHtcblx0aWYgKHN5bnRheC5sYW5ndWFnZSAmJiAoKHR5cGVvZiBzeW50YXgubGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB8fCAhX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKHN5bnRheC5sYW5ndWFnZSkpKSB7XG5cdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5sYW5ndWFnZScsIFwiVW5rbm93biBsYW5ndWFnZSBpbiBgY29udHJpYnV0ZXMuezB9Lmxhbmd1YWdlYC4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLCBncmFtbWFyc0V4dFBvaW50Lm5hbWUsIFN0cmluZyhzeW50YXgubGFuZ3VhZ2UpKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghc3ludGF4LnNjb3BlTmFtZSB8fCAodHlwZW9mIHN5bnRheC5zY29wZU5hbWUgIT09ICdzdHJpbmcnKSkge1xuXHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuc2NvcGVOYW1lJywgXCJFeHBlY3RlZCBzdHJpbmcgaW4gYGNvbnRyaWJ1dGVzLnswfS5zY29wZU5hbWVgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsIGdyYW1tYXJzRXh0UG9pbnQubmFtZSwgU3RyaW5nKHN5bnRheC5zY29wZU5hbWUpKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghc3ludGF4LnBhdGggfHwgKHR5cGVvZiBzeW50YXgucGF0aCAhPT0gJ3N0cmluZycpKSB7XG5cdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wYXRoLjAnLCBcIkV4cGVjdGVkIHN0cmluZyBpbiBgY29udHJpYnV0ZXMuezB9LnBhdGhgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsIGdyYW1tYXJzRXh0UG9pbnQubmFtZSwgU3RyaW5nKHN5bnRheC5wYXRoKSkpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoc3ludGF4LmluamVjdFRvICYmICghQXJyYXkuaXNBcnJheShzeW50YXguaW5qZWN0VG8pIHx8IHN5bnRheC5pbmplY3RUby5zb21lKHNjb3BlID0+IHR5cGVvZiBzY29wZSAhPT0gJ3N0cmluZycpKSkge1xuXHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaW5qZWN0VG8nLCBcIkludmFsaWQgdmFsdWUgaW4gYGNvbnRyaWJ1dGVzLnswfS5pbmplY3RUb2AuIE11c3QgYmUgYW4gYXJyYXkgb2YgbGFuZ3VhZ2Ugc2NvcGUgbmFtZXMuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIiwgZ3JhbW1hcnNFeHRQb2ludC5uYW1lLCBKU09OLnN0cmluZ2lmeShzeW50YXguaW5qZWN0VG8pKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChzeW50YXguZW1iZWRkZWRMYW5ndWFnZXMgJiYgIXR5cGVzLmlzT2JqZWN0KHN5bnRheC5lbWJlZGRlZExhbmd1YWdlcykpIHtcblx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmVtYmVkZGVkTGFuZ3VhZ2VzJywgXCJJbnZhbGlkIHZhbHVlIGluIGBjb250cmlidXRlcy57MH0uZW1iZWRkZWRMYW5ndWFnZXNgLiBNdXN0IGJlIGFuIG9iamVjdCBtYXAgZnJvbSBzY29wZSBuYW1lIHRvIGxhbmd1YWdlLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsIGdyYW1tYXJzRXh0UG9pbnQubmFtZSwgSlNPTi5zdHJpbmdpZnkoc3ludGF4LmVtYmVkZGVkTGFuZ3VhZ2VzKSkpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChzeW50YXgudG9rZW5UeXBlcyAmJiAhdHlwZXMuaXNPYmplY3Qoc3ludGF4LnRva2VuVHlwZXMpKSB7XG5cdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC50b2tlblR5cGVzJywgXCJJbnZhbGlkIHZhbHVlIGluIGBjb250cmlidXRlcy57MH0udG9rZW5UeXBlc2AuIE11c3QgYmUgYW4gb2JqZWN0IG1hcCBmcm9tIHNjb3BlIG5hbWUgdG8gdG9rZW4gdHlwZS4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLCBncmFtbWFyc0V4dFBvaW50Lm5hbWUsIEpTT04uc3RyaW5naWZ5KHN5bnRheC50b2tlblR5cGVzKSkpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IGdyYW1tYXJMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgc3ludGF4LnBhdGgpO1xuXHRpZiAoIXJlc291cmNlcy5pc0VxdWFsT3JQYXJlbnQoZ3JhbW1hckxvY2F0aW9uLCBleHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRjb2xsZWN0b3Iud2FybihubHMubG9jYWxpemUoJ2ludmFsaWQucGF0aC4xJywgXCJFeHBlY3RlZCBgY29udHJpYnV0ZXMuezB9LnBhdGhgICh7MX0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHsyfSkuIFRoaXMgbWlnaHQgbWFrZSB0aGUgZXh0ZW5zaW9uIG5vbi1wb3J0YWJsZS5cIiwgZ3JhbW1hcnNFeHRQb2ludC5uYW1lLCBncmFtbWFyTG9jYXRpb24ucGF0aCwgZXh0ZW5zaW9uTG9jYXRpb24ucGF0aCkpO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8VD4oa2V5OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBULCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogSU9ic2VydmFibGU8VD4ge1xuXHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHQoaGFuZGxlQ2hhbmdlKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihrZXksIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZUlkIH0pKSB7XG5cdFx0XHRcdGhhbmRsZUNoYW5nZShlKTtcblx0XHRcdH1cblx0XHR9KSxcblx0XHQoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxUPihrZXksIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZUlkIH0pID8/IGRlZmF1bHRWYWx1ZSxcblx0KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUIsZ0NBQWdDO0FBQzlELFlBQVksb0JBQW9CO0FBQ2hDLFNBQVMsVUFBVSxrQkFBa0I7QUFDckMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxZQUFZLDZCQUE2Qix1QkFBdUI7QUFDekUsU0FBc0IsMkJBQTJCO0FBQ2pELFNBQVMsYUFBYTtBQUN0QixZQUFZLGVBQWU7QUFDM0IsWUFBWSxXQUFXO0FBRXZCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQStCLHlCQUF5Qiw0QkFBNEI7QUFDcEYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4QkFBOEIsbUNBQW1DO0FBQzFFLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0M7QUFHN0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxrQkFBa0Isb0NBQW9DO0FBQy9ELFNBQWtDLHdCQUF3QjtBQUUxRCxTQUFxRCw4QkFBOEI7QUFJNUUsSUFBTSw4QkFBTixjQUEwQyxXQUFtRDtBQUFBLEVBbUJuRyxZQUNvQyxrQkFDTSxlQUNTLGlDQUNYLHNCQUNULGFBQ1UsdUJBQ0wsa0JBQ1kscUJBQ1AsdUJBQ0osbUJBQ25DO0FBQ0QsVUFBTTtBQVg2QjtBQUNNO0FBQ1M7QUFDWDtBQUNUO0FBQ1U7QUFDTDtBQUNZO0FBQ1A7QUFDSjtBQUdwQyxTQUFLLGdCQUFnQixDQUFDO0FBQ3RCLFNBQUssd0JBQXdCLENB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
