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
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as languages from "../../../common/languages.js";
import { NullState, nullTokenizeEncoded, nullTokenize } from "../../../common/languages/nullTokenize.js";
import * as monarchCommon from "./monarchCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LanguageId, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
const CACHE_STACK_DEPTH = 5;
const _MonarchStackElementFactory = class _MonarchStackElementFactory {
  static create(parent, state) {
    return this._INSTANCE.create(parent, state);
  }
  constructor(maxCacheDepth) {
    this._maxCacheDepth = maxCacheDepth;
    this._entries = /* @__PURE__ */ Object.create(null);
  }
  create(parent, state) {
    if (parent !== null && parent.depth >= this._maxCacheDepth) {
      return new MonarchStackElement(parent, state);
    }
    let stackElementId = MonarchStackElement.getStackElementId(parent);
    if (stackElementId.length > 0) {
      stackElementId += "|";
    }
    stackElementId += state;
    let result = this._entries[stackElementId];
    if (result) {
      return result;
    }
    result = new MonarchStackElement(parent, state);
    this._entries[stackElementId] = result;
    return result;
  }
};
_MonarchStackElementFactory._INSTANCE = new _MonarchStackElementFactory(CACHE_STACK_DEPTH);
let MonarchStackElementFactory = _MonarchStackElementFactory;
class MonarchStackElement {
  constructor(parent, state) {
    this.parent = parent;
    this.state = state;
    this.depth = (this.parent ? this.parent.depth : 0) + 1;
  }
  static getStackElementId(element) {
    let result = "";
    while (element !== null) {
      if (result.length > 0) {
        result += "|";
      }
      result += element.state;
      element = element.parent;
    }
    return result;
  }
  static _equals(a, b) {
    while (a !== null && b !== null) {
      if (a === b) {
        return true;
      }
      if (a.state !== b.state) {
        return false;
      }
      a = a.parent;
      b = b.parent;
    }
    if (a === null && b === null) {
      return true;
    }
    return false;
  }
  equals(other) {
    return MonarchStackElement._equals(this, other);
  }
  push(state) {
    return MonarchStackElementFactory.create(this, state);
  }
  pop() {
    return this.parent;
  }
  popall() {
    let result = this;
    while (result.parent) {
      result = result.parent;
    }
    return result;
  }
  switchTo(state) {
    return MonarchStackElementFactory.create(this.parent, state);
  }
}
class EmbeddedLanguageData {
  constructor(languageId, state) {
    this.languageId = languageId;
    this.state = state;
  }
  equals(other) {
    return this.languageId === other.languageId && this.state.equals(other.state);
  }
  clone() {
    const stateClone = this.state.clone();
    if (stateClone === this.state) {
      return this;
    }
    return new EmbeddedLanguageData(this.languageId, this.state);
  }
}
const _MonarchLineStateFactory = class _MonarchLineStateFactory {
  static create(stack, embeddedLanguageData) {
    return this._INSTANCE.create(stack, embeddedLanguageData);
  }
  constructor(maxCacheDepth) {
    this._maxCacheDepth = maxCacheDepth;
    this._entries = /* @__PURE__ */ Object.create(null);
  }
  create(stack, embeddedLanguageData) {
    if (embeddedLanguageData !== null) {
      return new MonarchLineState(stack, embeddedLanguageData);
    }
    if (stack !== null && stack.depth >= this._maxCacheDepth) {
      return new MonarchLineState(stack, embeddedLanguageData);
    }
    const stackElementId = MonarchStackElement.getStackElementId(stack);
    let result = this._entries[stackElementId];
    if (result) {
      return result;
    }
    result = new MonarchLineState(stack, null);
    this._entries[stackElementId] = result;
    return result;
  }
};
_MonarchLineStateFactory._INSTANCE = new _MonarchLineStateFactory(CACHE_STACK_DEPTH);
let MonarchLineStateFactory = _MonarchLineStateFactory;
class MonarchLineState {
  constructor(stack, embeddedLanguageData) {
    this.stack = stack;
    this.embeddedLanguageData = embeddedLanguageData;
  }
  clone() {
    const embeddedlanguageDataClone = this.embeddedLanguageData ? this.embeddedLanguageData.clone() : null;
    if (embeddedlanguageDataClone === this.embeddedLanguageData) {
      return this;
    }
    return MonarchLineStateFactory.create(this.stack, this.embeddedLanguageData);
  }
  equals(other) {
    if (!(other instanceof MonarchLineState)) {
      return false;
    }
    if (!this.stack.equals(other.stack)) {
      return false;
    }
    if (this.embeddedLanguageData === null && other.embeddedLanguageData === null) {
      return true;
    }
    if (this.embeddedLanguageData === null || other.embeddedLanguageData === null) {
      return false;
    }
    return this.embeddedLanguageData.equals(other.embeddedLanguageData);
  }
}
class MonarchClassicTokensCollector {
  constructor() {
    this._tokens = [];
    this._languageId = null;
    this._lastTokenType = null;
    this._lastTokenLanguage = null;
  }
  enterLanguage(languageId) {
    this._languageId = languageId;
  }
  emit(startOffset, type) {
    if (this._lastTokenType === type && this._lastTokenLanguage === this._languageId) {
      return;
    }
    this._lastTokenType = type;
    this._lastTokenLanguage = this._languageId;
    this._tokens.push(new languages.Token(startOffset, type, this._languageId));
  }
  nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
    const nestedLanguageId = embeddedLanguageData.languageId;
    const embeddedModeState = embeddedLanguageData.state;
    const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
    if (!nestedLanguageTokenizationSupport) {
      this.enterLanguage(nestedLanguageId);
      this.emit(offsetDelta, "");
      return embeddedModeState;
    }
    const nestedResult = nestedLanguageTokenizationSupport.tokenize(embeddedLanguageLine, hasEOL, embeddedModeState);
    if (offsetDelta !== 0) {
      for (const token of nestedResult.tokens) {
        this._tokens.push(new languages.Token(token.offset + offsetDelta, token.type, token.language));
      }
    } else {
      this._tokens = this._tokens.concat(nestedResult.tokens);
    }
    this._lastTokenType = null;
    this._lastTokenLanguage = null;
    this._languageId = null;
    return nestedResult.endState;
  }
  finalize(endState) {
    return new languages.TokenizationResult(this._tokens, endState);
  }
}
class MonarchModernTokensCollector {
  constructor(languageService, theme) {
    this._languageService = languageService;
    this._theme = theme;
    this._prependTokens = null;
    this._tokens = [];
    this._currentLanguageId = LanguageId.Null;
    this._lastTokenMetadata = 0;
  }
  enterLanguage(languageId) {
    this._currentLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
  }
  emit(startOffset, type) {
    const metadata = this._theme.match(this._currentLanguageId, type) | MetadataConsts.BALANCED_BRACKETS_MASK;
    if (this._lastTokenMetadata === metadata) {
      return;
    }
    this._lastTokenMetadata = metadata;
    this._tokens.push(startOffset);
    this._tokens.push(metadata);
  }
  static _merge(a, b, c) {
    const aLen = a !== null ? a.length : 0;
    const bLen = b.length;
    const cLen = c !== null ? c.length : 0;
    if (aLen === 0 && bLen === 0 && cLen === 0) {
      return new Uint32Array(0);
    }
    if (aLen === 0 && bLen === 0) {
      return c;
    }
    if (bLen === 0 && cLen === 0) {
      return a;
    }
    const result = new Uint32Array(aLen + bLen + cLen);
    if (a !== null) {
      result.set(a);
    }
    for (let i = 0; i < bLen; i++) {
      result[aLen + i] = b[i];
    }
    if (c !== null) {
      result.set(c, aLen + bLen);
    }
    return result;
  }
  nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
    const nestedLanguageId = embeddedLanguageData.languageId;
    const embeddedModeState = embeddedLanguageData.state;
    const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
    if (!nestedLanguageTokenizationSupport) {
      this.enterLanguage(nestedLanguageId);
      this.emit(offsetDelta, "");
      return embeddedModeState;
    }
    const nestedResult = nestedLanguageTokenizationSupport.tokenizeEncoded(embeddedLanguageLine, hasEOL, embeddedModeState);
    if (offsetDelta !== 0) {
      for (let i = 0, len = nestedResult.tokens.length; i < len; i += 2) {
        nestedResult.tokens[i] += offsetDelta;
      }
    }
    this._prependTokens = MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, nestedResult.tokens);
    this._tokens = [];
    this._currentLanguageId = 0;
    this._lastTokenMetadata = 0;
    return nestedResult.endState;
  }
  finalize(endState) {
    return new languages.EncodedTokenizationResult(
      MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, null),
      [],
      endState
    );
  }
}
let MonarchTokenizer = class extends Disposable {
  constructor(languageService, standaloneThemeService, languageId, lexer, _configurationService) {
    super();
    this._configurationService = _configurationService;
    this._languageService = languageService;
    this._standaloneThemeService = standaloneThemeService;
    this._languageId = languageId;
    this._lexer = lexer;
    this._embeddedLanguages = /* @__PURE__ */ Object.create(null);
    this.embeddedLoaded = Promise.resolve(void 0);
    let emitting = false;
    this._register(languages.TokenizationRegistry.onDidChange((e) => {
      if (emitting) {
        return;
      }
      let isOneOfMyEmbeddedModes = false;
      for (let i = 0, len = e.changedLanguages.length; i < len; i++) {
        const language = e.changedLanguages[i];
        if (this._embeddedLanguages[language]) {
          isOneOfMyEmbeddedModes = true;
          break;
        }
      }
      if (isOneOfMyEmbeddedModes) {
        emitting = true;
        languages.TokenizationRegistry.handleChange([this._languageId]);
        emitting = false;
      }
    }));
    this._maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
      overrideIdentifier: this._languageId
    });
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.maxTokenizationLineLength")) {
        this._maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
          overrideIdentifier: this._languageId
        });
      }
    }));
  }
  getLoadStatus() {
    const promises = [];
    for (const nestedLanguageId in this._embeddedLanguages) {
      const tokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
      if (tokenizationSupport) {
        if (tokenizationSupport instanceof MonarchTokenizer) {
          const nestedModeStatus = tokenizationSupport.getLoadStatus();
          if (nestedModeStatus.loaded === false) {
            promises.push(nestedModeStatus.promise);
          }
        }
        continue;
      }
      if (!languages.TokenizationRegistry.isResolved(nestedLanguageId)) {
        promises.push(languages.TokenizationRegistry.getOrCreate(nestedLanguageId));
      }
    }
    if (promises.length === 0) {
      return {
        loaded: true
      };
    }
    return {
      loaded: false,
      promise: Promise.all(promises).then((_) => void 0)
    };
  }
  getInitialState() {
    const rootState = MonarchStackElementFactory.create(null, this._lexer.start);
    return MonarchLineStateFactory.create(rootState, null);
  }
  tokenize(line, hasEOL, lineState) {
    if (line.length >= this._maxTokenizationLineLength) {
      return nullTokenize(this._languageId, lineState);
    }
    const tokensCollector = new MonarchClassicTokensCollector();
    const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
    return tokensCollector.finalize(endLineState);
  }
  tokenizeEncoded(line, hasEOL, lineState) {
    if (line.length >= this._maxTokenizationLineLength) {
      return nullTokenizeEncoded(this._languageService.languageIdCodec.encodeLanguageId(this._languageId), lineState);
    }
    const tokensCollector = new MonarchModernTokensCollector(this._languageService, this._standaloneThemeService.getColorTheme().tokenTheme);
    const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
    return tokensCollector.finalize(endLineState);
  }
  _tokenize(line, hasEOL, lineState, collector) {
    if (lineState.embeddedLanguageData) {
      return this._nestedTokenize(line, hasEOL, lineState, 0, collector);
    } else {
      return this._myTokenize(line, hasEOL, lineState, 0, collector);
    }
  }
  _findLeavingNestedLanguageOffset(line, state) {
    let rules = this._lexer.tokenizer[state.stack.state];
    if (!rules) {
      rules = monarchCommon.findRules(this._lexer, state.stack.state);
      if (!rules) {
        throw monarchCommon.createError(this._lexer, "tokenizer state is not defined: " + state.stack.state);
      }
    }
    let popOffset = -1;
    let hasEmbeddedPopRule = false;
    for (const rule of rules) {
      if (!monarchCommon.isIAction(rule.action) || !(rule.action.nextEmbedded === "@pop" || rule.action.hasEmbeddedEndInCases)) {
        continue;
      }
      hasEmbeddedPopRule = true;
      let regex = rule.resolveRegex(state.stack.state);
      const regexSource = regex.source;
      if (regexSource.substr(0, 4) === "^(?:" && regexSource.substr(regexSource.length - 1, 1) === ")") {
        const flags = (regex.ignoreCase ? "i" : "") + (regex.unicode ? "u" : "");
        regex = new RegExp(regexSource.substr(4, regexSource.length - 5), flags);
      }
      const result = line.search(regex);
      if (result === -1 || result !== 0 && rule.matchOnlyAtLineStart) {
        continue;
      }
      if (popOffset === -1 || result < popOffset) {
        popOffset = result;
      }
    }
    if (!hasEmbeddedPopRule) {
      throw monarchCommon.createError(this._lexer, 'no rule containing nextEmbedded: "@pop" in tokenizer embedded state: ' + state.stack.state);
    }
    return popOffset;
  }
  _nestedTokenize(line, hasEOL, lineState, offsetDelta, tokensCollector) {
    const popOffset = this._findLeavingNestedLanguageOffset(line, lineState);
    if (popOffset === -1) {
      const nestedEndState = tokensCollector.nestedLanguageTokenize(line, hasEOL, lineState.embeddedLanguageData, offsetDelta);
      return MonarchLineStateFactory.create(lineState.stack, new EmbeddedLanguageData(lineState.embeddedLanguageData.languageId, nestedEndState));
    }
    const nestedLanguageLine = line.substring(0, popOffset);
    if (nestedLanguageLine.length > 0) {
      tokensCollector.nestedLanguageTokenize(nestedLanguageLine, false, lineState.embeddedLanguageData, offsetDelta);
    }
    const restOfTheLine = line.substring(popOffset);
    return this._myTokenize(restOfTheLine, hasEOL, lineState, offsetDelta + popOffset, tokensCollector);
  }
  _safeRuleName(rule) {
    if (rule) {
      return rule.name;
    }
    return "(unknown)";
  }
  _myTokenize(lineWithoutLF, hasEOL, lineState, offsetDelta, tokensCollector) {
    tokensCollector.enterLanguage(this._languageId);
    const lineWithoutLFLength = lineWithoutLF.length;
    const line = hasEOL && this._lexer.includeLF ? lineWithoutLF + "\n" : lineWithoutLF;
    const lineLength = line.length;
    let embeddedLanguageData = lineState.embeddedLanguageData;
    let stack = lineState.stack;
    let pos = 0;
    let groupMatching = null;
    let forceEvaluation = true;
    while (forceEvaluation || pos < lineLength) {
      const pos0 = pos;
      const stackLen0 = stack.depth;
      const groupLen0 = groupMatching ? groupMatching.groups.length : 0;
      const state = stack.state;
      let matches = null;
      let matched = null;
      let action = null;
      let rule = null;
      let enteringEmbeddedLanguage = null;
      if (groupMatching) {
        matches = groupMatching.matches;
        const groupEntry = groupMatching.groups.shift();
        matched = groupEntry.matched;
        action = groupEntry.action;
        rule = groupMatching.rule;
        if (groupMatching.groups.length === 0) {
          groupMatching = null;
        }
      } else {
        if (!forceEvaluation && pos >= lineLength) {
          break;
        }
        forceEvaluation = false;
        let rules = this._lexer.tokenizer[state];
        if (!rules) {
          rules = monarchCommon.findRules(this._lexer, state);
          if (!rules) {
            throw monarchCommon.createError(this._lexer, "tokenizer state is not defined: " + state);
          }
        }
        const restOfLine = line.substr(pos);
        for (const rule2 of rules) {
          if (pos === 0 || !rule2.matchOnlyAtLineStart) {
            matches = restOfLine.match(rule2.resolveRegex(state));
            if (matches) {
              matched = matches[0];
              action = rule2.action;
              break;
            }
          }
        }
      }
      if (!matches) {
        matches = [""];
        matched = "";
      }
      if (!action) {
        if (pos < lineLength) {
          matches = [line.charAt(pos)];
          matched = matches[0];
        }
        action = this._lexer.defaultToken;
      }
      if (matched === null) {
        break;
      }
      pos += matched.length;
      while (monarchCommon.isFuzzyAction(action) && monarchCommon.isIAction(action) && action.test) {
        action = action.test(matched, matches, state, pos === lineLength);
      }
      let result = null;
      if (typeof action === "string" || Array.isArray(action)) {
        result = action;
      } else if (action.group) {
        result = action.group;
      } else if (action.token !== null && action.token !== void 0) {
        if (action.tokenSubst) {
          result = monarchCommon.substituteMatches(this._lexer, action.token, matched, matches, state);
        } else {
          result = action.token;
        }
        if (action.nextEmbedded) {
          if (action.nextEmbedded === "@pop") {
            if (!embeddedLanguageData) {
              throw monarchCommon.createError(this._lexer, "cannot pop embedded language if not inside one");
            }
            embeddedLanguageData = null;
          } else if (embeddedLanguageData) {
            throw monarchCommon.createError(this._lexer, "cannot enter embedded language from within an embedded language");
          } else {
            enteringEmbeddedLanguage = monarchCommon.substituteMatches(this._lexer, action.nextEmbedded, matched, matches, state);
          }
        }
        if (action.goBack) {
          pos = Math.max(0, pos - action.goBack);
        }
        if (action.switchTo && typeof action.switchTo === "string") {
          let nextState = monarchCommon.substituteMatches(this._lexer, action.switchTo, matched, matches, state);
          if (nextState[0] === "@") {
            nextState = nextState.substr(1);
          }
          if (!monarchCommon.findRules(this._lexer, nextState)) {
            throw monarchCommon.createError(this._lexer, "trying to switch to a state '" + nextState + "' that is undefined in rule: " + this._safeRuleName(rule));
          } else {
            stack = stack.switchTo(nextState);
          }
        } else if (action.transform && typeof action.transform === "function") {
          throw monarchCommon.createError(this._lexer, "action.transform not supported");
        } else if (action.next) {
          if (action.next === "@push") {
            if (stack.depth >= this._lexer.maxStack) {
              throw monarchCommon.createError(this._lexer, "maximum tokenizer stack size reached: [" + stack.state + "," + stack.parent.state + ",...]");
            } else {
              stack = stack.push(state);
            }
          } else if (action.next === "@pop") {
            if (stack.depth <= 1) {
              throw monarchCommon.createError(this._lexer, "trying to pop an empty stack in rule: " + this._safeRuleName(rule));
            } else {
              stack = stack.pop();
            }
          } else if (action.next === "@popall") {
            stack = stack.popall();
          } else {
            let nextState = monarchCommon.substituteMatches(this._lexer, action.next, matched, matches, state);
            if (nextState[0] === "@") {
              nextState = nextState.substr(1);
            }
            if (!monarchCommon.findRules(this._lexer, nextState)) {
              throw monarchCommon.createError(this._lexer, "trying to set a next state '" + nextState + "' that is undefined in rule: " + this._safeRuleName(rule));
            } else {
              stack = stack.push(nextState);
            }
          }
        }
        if (action.log && typeof action.log === "string") {
          monarchCommon.log(this._lexer, this._lexer.languageId + ": " + monarchCommon.substituteMatches(this._lexer, action.log, matched, matches, state));
        }
      }
      if (result === null) {
        throw monarchCommon.createError(this._lexer, "lexer rule has no well-defined action in rule: " + this._safeRuleName(rule));
      }
      const computeNewStateForEmbeddedLanguage = (enteringEmbeddedLanguage2) => {
        const languageId = this._languageService.getLanguageIdByLanguageName(enteringEmbeddedLanguage2) || this._languageService.getLanguageIdByMimeType(enteringEmbeddedLanguage2) || enteringEmbeddedLanguage2;
        const embeddedLanguageData2 = this._getNestedEmbeddedLanguageData(languageId);
        if (pos < lineLength) {
          const restOfLine = lineWithoutLF.substr(pos);
          return this._nestedTokenize(restOfLine, hasEOL, MonarchLineStateFactory.create(stack, embeddedLanguageData2), offsetDelta + pos, tokensCollector);
        } else {
          return MonarchLineStateFactory.create(stack, embeddedLanguageData2);
        }
      };
      if (Array.isArray(result)) {
        if (groupMatching && groupMatching.groups.length > 0) {
          throw monarchCommon.createError(this._lexer, "groups cannot be nested: " + this._safeRuleName(rule));
        }
        if (matches.length !== result.length + 1) {
          throw monarchCommon.createError(this._lexer, "matched number of groups does not match the number of actions in rule: " + this._safeRuleName(rule));
        }
        let totalLen = 0;
        for (let i = 1; i < matches.length; i++) {
          totalLen += matches[i].length;
        }
        if (totalLen !== matched.length) {
          throw monarchCommon.createError(this._lexer, "with groups, all characters should be matched in consecutive groups in rule: " + this._safeRuleName(rule));
        }
        groupMatching = {
          rule,
          matches,
          groups: []
        };
        for (let i = 0; i < result.length; i++) {
          groupMatching.groups[i] = {
            action: result[i],
            matched: matches[i + 1]
          };
        }
        pos -= matched.length;
        continue;
      } else {
        if (result === "@rematch") {
          pos -= matched.length;
          matched = "";
          matches = null;
          result = "";
          if (enteringEmbeddedLanguage !== null) {
            return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
          }
        }
        if (matched.length === 0) {
          if (lineLength === 0 || stackLen0 !== stack.depth || state !== stack.state || (!groupMatching ? 0 : groupMatching.groups.length) !== groupLen0) {
            continue;
          } else {
            throw monarchCommon.createError(this._lexer, "no progress in tokenizer in rule: " + this._safeRuleName(rule));
          }
        }
        let tokenType = null;
        if (monarchCommon.isString(result) && result.indexOf("@brackets") === 0) {
          const rest = result.substr("@brackets".length);
          const bracket = findBracket(this._lexer, matched);
          if (!bracket) {
            throw monarchCommon.createError(this._lexer, "@brackets token returned but no bracket defined as: " + matched);
          }
          tokenType = monarchCommon.sanitize(bracket.token + rest);
        } else {
          const token = result === "" ? "" : result + this._lexer.tokenPostfix;
          tokenType = monarchCommon.sanitize(token);
        }
        if (pos0 < lineWithoutLFLength) {
          tokensCollector.emit(pos0 + offsetDelta, tokenType);
        }
      }
      if (enteringEmbeddedLanguage !== null) {
        return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
      }
    }
    return MonarchLineStateFactory.create(stack, embeddedLanguageData);
  }
  _getNestedEmbeddedLanguageData(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return new EmbeddedLanguageData(languageId, NullState);
    }
    if (languageId !== this._languageId) {
      this._languageService.requestBasicLanguageFeatures(languageId);
      languages.TokenizationRegistry.getOrCreate(languageId);
      this._embeddedLanguages[languageId] = true;
    }
    const tokenizationSupport = languages.TokenizationRegistry.get(languageId);
    if (tokenizationSupport) {
      return new EmbeddedLanguageData(languageId, tokenizationSupport.getInitialState());
    }
    return new EmbeddedLanguageData(languageId, NullState);
  }
};
MonarchTokenizer = __decorateClass([
  __decorateParam(4, IConfigurationService)
], MonarchTokenizer);
function findBracket(lexer, matched) {
  if (!matched) {
    return null;
  }
  matched = monarchCommon.fixCase(lexer, matched);
  const brackets = lexer.brackets;
  for (const bracket of brackets) {
    if (bracket.open === matched) {
      return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Open };
    } else if (bracket.close === matched) {
      return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Close };
    }
  }
  return null;
}
export {
  MonarchTokenizer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2NvbW1vbi9tb25hcmNoL21vbmFyY2hMZXhlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogQ3JlYXRlIGEgc3ludGF4IGhpZ2hpZ2h0ZXIgd2l0aCBhIGZ1bGx5IGRlY2xhcmF0aXZlIEpTT04gc3R5bGUgbGV4ZXIgZGVzY3JpcHRpb25cbiAqIHVzaW5nIHJlZ3VsYXIgZXhwcmVzc2lvbnMuXG4gKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlLCBudWxsVG9rZW5pemVFbmNvZGVkLCBudWxsVG9rZW5pemUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBUb2tlblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0ICogYXMgbW9uYXJjaENvbW1vbiBmcm9tICcuL21vbmFyY2hDb21tb24uanMnO1xuaW1wb3J0IHsgSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUlkLCBNZXRhZGF0YUNvbnN0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcblxuY29uc3QgQ0FDSEVfU1RBQ0tfREVQVEggPSA1O1xuXG4vKipcbiAqIFJldXNlIHRoZSBzYW1lIHN0YWNrIGVsZW1lbnRzIHVwIHRvIGEgY2VydGFpbiBkZXB0aC5cbiAqL1xuY2xhc3MgTW9uYXJjaFN0YWNrRWxlbWVudEZhY3Rvcnkge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9JTlNUQU5DRSA9IG5ldyBNb25hcmNoU3RhY2tFbGVtZW50RmFjdG9yeShDQUNIRV9TVEFDS19ERVBUSCk7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKHBhcmVudDogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwsIHN0YXRlOiBzdHJpbmcpOiBNb25hcmNoU3RhY2tFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fSU5TVEFOQ0UuY3JlYXRlKHBhcmVudCwgc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWF4Q2FjaGVEZXB0aDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzOiB7IFtzdGFja0VsZW1lbnRJZDogc3RyaW5nXTogTW9uYXJjaFN0YWNrRWxlbWVudCB9O1xuXG5cdGNvbnN0cnVjdG9yKG1heENhY2hlRGVwdGg6IG51bWJlcikge1xuXHRcdHRoaXMuX21heENhY2hlRGVwdGggPSBtYXhDYWNoZURlcHRoO1xuXHRcdHRoaXMuX2VudHJpZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZShwYXJlbnQ6IE1vbmFyY2hTdGFja0VsZW1lbnQgfCBudWxsLCBzdGF0ZTogc3RyaW5nKTogTW9uYXJjaFN0YWNrRWxlbWVudCB7XG5cdFx0aWYgKHBhcmVudCAhPT0gbnVsbCAmJiBwYXJlbnQuZGVwdGggPj0gdGhpcy5fbWF4Q2FjaGVEZXB0aCkge1xuXHRcdFx0Ly8gbm8gY2FjaGluZyBhYm92ZSBhIGNlcnRhaW4gZGVwdGhcblx0XHRcdHJldHVybiBuZXcgTW9uYXJjaFN0YWNrRWxlbWVudChwYXJlbnQsIHN0YXRlKTtcblx0XHR9XG5cdFx0bGV0IHN0YWNrRWxlbWVudElkID0gTW9uYXJjaFN0YWNrRWxlbWVudC5nZXRTdGFja0VsZW1lbnRJZChwYXJlbnQpO1xuXHRcdGlmIChzdGFja0VsZW1lbnRJZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRzdGFja0VsZW1lbnRJZCArPSAnfCc7XG5cdFx0fVxuXHRcdHN0YWNrRWxlbWVudElkICs9IHN0YXRlO1xuXG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2VudHJpZXNbc3RhY2tFbGVtZW50SWRdO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJlc3VsdCA9IG5ldyBNb25hcmNoU3RhY2tFbGVtZW50KHBhcmVudCwgc3RhdGUpO1xuXHRcdHRoaXMuX2VudHJpZXNbc3RhY2tFbGVtZW50SWRdID0gcmVzdWx0O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgTW9uYXJjaFN0YWNrRWxlbWVudCB7XG5cblx0cHVibGljIHJlYWRvbmx5IHBhcmVudDogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZTogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGVwdGg6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihwYXJlbnQ6IE1vbmFyY2hTdGFja0VsZW1lbnQgfCBudWxsLCBzdGF0ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5zdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuZGVwdGggPSAodGhpcy5wYXJlbnQgPyB0aGlzLnBhcmVudC5kZXB0aCA6IDApICsgMTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0U3RhY2tFbGVtZW50SWQoZWxlbWVudDogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSAnJztcblx0XHR3aGlsZSAoZWxlbWVudCAhPT0gbnVsbCkge1xuXHRcdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdCArPSAnfCc7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgKz0gZWxlbWVudC5zdGF0ZTtcblx0XHRcdGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9lcXVhbHMoYTogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwsIGI6IE1vbmFyY2hTdGFja0VsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0d2hpbGUgKGEgIT09IG51bGwgJiYgYiAhPT0gbnVsbCkge1xuXHRcdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYS5zdGF0ZSAhPT0gYi5zdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRhID0gYS5wYXJlbnQ7XG5cdFx0XHRiID0gYi5wYXJlbnQ7XG5cdFx0fVxuXHRcdGlmIChhID09PSBudWxsICYmIGIgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBNb25hcmNoU3RhY2tFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIE1vbmFyY2hTdGFja0VsZW1lbnQuX2VxdWFscyh0aGlzLCBvdGhlcik7XG5cdH1cblxuXHRwdWJsaWMgcHVzaChzdGF0ZTogc3RyaW5nKTogTW9uYXJjaFN0YWNrRWxlbWVudCB7XG5cdFx0cmV0dXJuIE1vbmFyY2hTdGFja0VsZW1lbnRGYWN0b3J5LmNyZWF0ZSh0aGlzLCBzdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgcG9wKCk6IE1vbmFyY2hTdGFja0VsZW1lbnQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQ7XG5cdH1cblxuXHRwdWJsaWMgcG9wYWxsKCk6IE1vbmFyY2hTdGFja0VsZW1lbnQge1xuXHRcdGxldCByZXN1bHQ6IE1vbmFyY2hTdGFja0VsZW1lbnQgPSB0aGlzO1xuXHRcdHdoaWxlIChyZXN1bHQucGFyZW50KSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN3aXRjaFRvKHN0YXRlOiBzdHJpbmcpOiBNb25hcmNoU3RhY2tFbGVtZW50IHtcblx0XHRyZXR1cm4gTW9uYXJjaFN0YWNrRWxlbWVudEZhY3RvcnkuY3JlYXRlKHRoaXMucGFyZW50LCBzdGF0ZSk7XG5cdH1cbn1cblxuY2xhc3MgRW1iZWRkZWRMYW5ndWFnZURhdGEge1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGU7XG5cblx0Y29uc3RydWN0b3IobGFuZ3VhZ2VJZDogc3RyaW5nLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSkge1xuXHRcdHRoaXMubGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWQ7XG5cdFx0dGhpcy5zdGF0ZSA9IHN0YXRlO1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogRW1iZWRkZWRMYW5ndWFnZURhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy5sYW5ndWFnZUlkID09PSBvdGhlci5sYW5ndWFnZUlkXG5cdFx0XHQmJiB0aGlzLnN0YXRlLmVxdWFscyhvdGhlci5zdGF0ZSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGNsb25lKCk6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhIHtcblx0XHRjb25zdCBzdGF0ZUNsb25lID0gdGhpcy5zdGF0ZS5jbG9uZSgpO1xuXHRcdC8vIHNhdmUgYW4gb2JqZWN0XG5cdFx0aWYgKHN0YXRlQ2xvbmUgPT09IHRoaXMuc3RhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKHRoaXMubGFuZ3VhZ2VJZCwgdGhpcy5zdGF0ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXVzZSB0aGUgc2FtZSBsaW5lIHN0YXRlcyB1cCB0byBhIGNlcnRhaW4gZGVwdGguXG4gKi9cbmNsYXNzIE1vbmFyY2hMaW5lU3RhdGVGYWN0b3J5IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSU5TVEFOQ0UgPSBuZXcgTW9uYXJjaExpbmVTdGF0ZUZhY3RvcnkoQ0FDSEVfU1RBQ0tfREVQVEgpO1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShzdGFjazogTW9uYXJjaFN0YWNrRWxlbWVudCwgZW1iZWRkZWRMYW5ndWFnZURhdGE6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhIHwgbnVsbCk6IE1vbmFyY2hMaW5lU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9JTlNUQU5DRS5jcmVhdGUoc3RhY2ssIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21heENhY2hlRGVwdGg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllczogeyBbc3RhY2tFbGVtZW50SWQ6IHN0cmluZ106IE1vbmFyY2hMaW5lU3RhdGUgfTtcblxuXHRjb25zdHJ1Y3RvcihtYXhDYWNoZURlcHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLl9tYXhDYWNoZURlcHRoID0gbWF4Q2FjaGVEZXB0aDtcblx0XHR0aGlzLl9lbnRyaWVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGUoc3RhY2s6IE1vbmFyY2hTdGFja0VsZW1lbnQsIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSB8IG51bGwpOiBNb25hcmNoTGluZVN0YXRlIHtcblx0XHRpZiAoZW1iZWRkZWRMYW5ndWFnZURhdGEgIT09IG51bGwpIHtcblx0XHRcdC8vIG5vIGNhY2hpbmcgd2hlbiBlbWJlZGRpbmdcblx0XHRcdHJldHVybiBuZXcgTW9uYXJjaExpbmVTdGF0ZShzdGFjaywgZW1iZWRkZWRMYW5ndWFnZURhdGEpO1xuXHRcdH1cblx0XHRpZiAoc3RhY2sgIT09IG51bGwgJiYgc3RhY2suZGVwdGggPj0gdGhpcy5fbWF4Q2FjaGVEZXB0aCkge1xuXHRcdFx0Ly8gbm8gY2FjaGluZyBhYm92ZSBhIGNlcnRhaW4gZGVwdGhcblx0XHRcdHJldHVybiBuZXcgTW9uYXJjaExpbmVTdGF0ZShzdGFjaywgZW1iZWRkZWRMYW5ndWFnZURhdGEpO1xuXHRcdH1cblx0XHRjb25zdCBzdGFja0VsZW1lbnRJZCA9IE1vbmFyY2hTdGFja0VsZW1lbnQuZ2V0U3RhY2tFbGVtZW50SWQoc3RhY2spO1xuXG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2VudHJpZXNbc3RhY2tFbGVtZW50SWRdO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJlc3VsdCA9IG5ldyBNb25hcmNoTGluZVN0YXRlKHN0YWNrLCBudWxsKTtcblx0XHR0aGlzLl9lbnRyaWVzW3N0YWNrRWxlbWVudElkXSA9IHJlc3VsdDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIE1vbmFyY2hMaW5lU3RhdGUgaW1wbGVtZW50cyBsYW5ndWFnZXMuSVN0YXRlIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhY2s6IE1vbmFyY2hTdGFja0VsZW1lbnQ7XG5cdHB1YmxpYyByZWFkb25seSBlbWJlZGRlZExhbmd1YWdlRGF0YTogRW1iZWRkZWRMYW5ndWFnZURhdGEgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN0YWNrOiBNb25hcmNoU3RhY2tFbGVtZW50LFxuXHRcdGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSB8IG51bGxcblx0KSB7XG5cdFx0dGhpcy5zdGFjayA9IHN0YWNrO1xuXHRcdHRoaXMuZW1iZWRkZWRMYW5ndWFnZURhdGEgPSBlbWJlZGRlZExhbmd1YWdlRGF0YTtcblx0fVxuXG5cdHB1YmxpYyBjbG9uZSgpOiBsYW5ndWFnZXMuSVN0YXRlIHtcblx0XHRjb25zdCBlbWJlZGRlZGxhbmd1YWdlRGF0YUNsb25lID0gdGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YSA/IHRoaXMuZW1iZWRkZWRMYW5ndWFnZURhdGEuY2xvbmUoKSA6IG51bGw7XG5cdFx0Ly8gc2F2ZSBhbiBvYmplY3Rcblx0XHRpZiAoZW1iZWRkZWRsYW5ndWFnZURhdGFDbG9uZSA9PT0gdGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBNb25hcmNoTGluZVN0YXRlRmFjdG9yeS5jcmVhdGUodGhpcy5zdGFjaywgdGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBsYW5ndWFnZXMuSVN0YXRlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBNb25hcmNoTGluZVN0YXRlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuc3RhY2suZXF1YWxzKG90aGVyLnN0YWNrKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YSA9PT0gbnVsbCAmJiBvdGhlci5lbWJlZGRlZExhbmd1YWdlRGF0YSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhID09PSBudWxsIHx8IG90aGVyLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhLmVxdWFscyhvdGhlci5lbWJlZGRlZExhbmd1YWdlRGF0YSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNb25hcmNoVG9rZW5zQ29sbGVjdG9yIHtcblx0ZW50ZXJMYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkO1xuXHRlbWl0KHN0YXJ0T2Zmc2V0OiBudW1iZXIsIHR5cGU6IHN0cmluZyk6IHZvaWQ7XG5cdG5lc3RlZExhbmd1YWdlVG9rZW5pemUoZW1iZWRkZWRMYW5ndWFnZUxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBlbWJlZGRlZExhbmd1YWdlRGF0YTogRW1iZWRkZWRMYW5ndWFnZURhdGEsIG9mZnNldERlbHRhOiBudW1iZXIpOiBsYW5ndWFnZXMuSVN0YXRlO1xufVxuXG5jbGFzcyBNb25hcmNoQ2xhc3NpY1Rva2Vuc0NvbGxlY3RvciBpbXBsZW1lbnRzIElNb25hcmNoVG9rZW5zQ29sbGVjdG9yIHtcblxuXHRwcml2YXRlIF90b2tlbnM6IGxhbmd1YWdlcy5Ub2tlbltdO1xuXHRwcml2YXRlIF9sYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9sYXN0VG9rZW5UeXBlOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9sYXN0VG9rZW5MYW5ndWFnZTogc3RyaW5nIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl90b2tlbnMgPSBbXTtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0VG9rZW5UeXBlID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0VG9rZW5MYW5ndWFnZSA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZW50ZXJMYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0fVxuXG5cdHB1YmxpYyBlbWl0KHN0YXJ0T2Zmc2V0OiBudW1iZXIsIHR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sYXN0VG9rZW5UeXBlID09PSB0eXBlICYmIHRoaXMuX2xhc3RUb2tlbkxhbmd1YWdlID09PSB0aGlzLl9sYW5ndWFnZUlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RUb2tlblR5cGUgPSB0eXBlO1xuXHRcdHRoaXMuX2xhc3RUb2tlbkxhbmd1YWdlID0gdGhpcy5fbGFuZ3VhZ2VJZDtcblx0XHR0aGlzLl90b2tlbnMucHVzaChuZXcgbGFuZ3VhZ2VzLlRva2VuKHN0YXJ0T2Zmc2V0LCB0eXBlLCB0aGlzLl9sYW5ndWFnZUlkISkpO1xuXHR9XG5cblx0cHVibGljIG5lc3RlZExhbmd1YWdlVG9rZW5pemUoZW1iZWRkZWRMYW5ndWFnZUxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBlbWJlZGRlZExhbmd1YWdlRGF0YTogRW1iZWRkZWRMYW5ndWFnZURhdGEsIG9mZnNldERlbHRhOiBudW1iZXIpOiBsYW5ndWFnZXMuSVN0YXRlIHtcblx0XHRjb25zdCBuZXN0ZWRMYW5ndWFnZUlkID0gZW1iZWRkZWRMYW5ndWFnZURhdGEubGFuZ3VhZ2VJZDtcblx0XHRjb25zdCBlbWJlZGRlZE1vZGVTdGF0ZSA9IGVtYmVkZGVkTGFuZ3VhZ2VEYXRhLnN0YXRlO1xuXG5cdFx0Y29uc3QgbmVzdGVkTGFuZ3VhZ2VUb2tlbml6YXRpb25TdXBwb3J0ID0gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmdldChuZXN0ZWRMYW5ndWFnZUlkKTtcblx0XHRpZiAoIW5lc3RlZExhbmd1YWdlVG9rZW5pemF0aW9uU3VwcG9ydCkge1xuXHRcdFx0dGhpcy5lbnRlckxhbmd1YWdlKG5lc3RlZExhbmd1YWdlSWQpO1xuXHRcdFx0dGhpcy5lbWl0KG9mZnNldERlbHRhLCAnJyk7XG5cdFx0XHRyZXR1cm4gZW1iZWRkZWRNb2RlU3RhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmVzdGVkUmVzdWx0ID0gbmVzdGVkTGFuZ3VhZ2VUb2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplKGVtYmVkZGVkTGFuZ3VhZ2VMaW5lLCBoYXNFT0wsIGVtYmVkZGVkTW9kZVN0YXRlKTtcblx0XHRpZiAob2Zmc2V0RGVsdGEgIT09IDApIHtcblx0XHRcdGZvciAoY29uc3QgdG9rZW4gb2YgbmVzdGVkUmVzdWx0LnRva2Vucykge1xuXHRcdFx0XHR0aGlzLl90b2tlbnMucHVzaChuZXcgbGFuZ3VhZ2VzLlRva2VuKHRva2VuLm9mZnNldCArIG9mZnNldERlbHRhLCB0b2tlbi50eXBlLCB0b2tlbi5sYW5ndWFnZSkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b2tlbnMgPSB0aGlzLl90b2tlbnMuY29uY2F0KG5lc3RlZFJlc3VsdC50b2tlbnMpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0VG9rZW5UeXBlID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0VG9rZW5MYW5ndWFnZSA9IG51bGw7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZCA9IG51bGw7XG5cdFx0cmV0dXJuIG5lc3RlZFJlc3VsdC5lbmRTdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBmaW5hbGl6ZShlbmRTdGF0ZTogTW9uYXJjaExpbmVTdGF0ZSk6IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZXN1bHQge1xuXHRcdHJldHVybiBuZXcgbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCh0aGlzLl90b2tlbnMsIGVuZFN0YXRlKTtcblx0fVxufVxuXG5jbGFzcyBNb25hcmNoTW9kZXJuVG9rZW5zQ29sbGVjdG9yIGltcGxlbWVudHMgSU1vbmFyY2hUb2tlbnNDb2xsZWN0b3Ige1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGhlbWU6IFRva2VuVGhlbWU7XG5cdHByaXZhdGUgX3ByZXBlbmRUb2tlbnM6IFVpbnQzMkFycmF5IHwgbnVsbDtcblx0cHJpdmF0ZSBfdG9rZW5zOiBudW1iZXJbXTtcblx0cHJpdmF0ZSBfY3VycmVudExhbmd1YWdlSWQ6IExhbmd1YWdlSWQ7XG5cdHByaXZhdGUgX2xhc3RUb2tlbk1ldGFkYXRhOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IobGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCB0aGVtZTogVG9rZW5UaGVtZSkge1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSA9IGxhbmd1YWdlU2VydmljZTtcblx0XHR0aGlzLl90aGVtZSA9IHRoZW1lO1xuXHRcdHRoaXMuX3ByZXBlbmRUb2tlbnMgPSBudWxsO1xuXHRcdHRoaXMuX3Rva2VucyA9IFtdO1xuXHRcdHRoaXMuX2N1cnJlbnRMYW5ndWFnZUlkID0gTGFuZ3VhZ2VJZC5OdWxsO1xuXHRcdHRoaXMuX2xhc3RUb2tlbk1ldGFkYXRhID0gMDtcblx0fVxuXG5cdHB1YmxpYyBlbnRlckxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRMYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHR9XG5cblx0cHVibGljIGVtaXQoc3RhcnRPZmZzZXQ6IG51bWJlciwgdHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl90aGVtZS5tYXRjaCh0aGlzLl9jdXJyZW50TGFuZ3VhZ2VJZCwgdHlwZSkgfCBNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLO1xuXHRcdGlmICh0aGlzLl9sYXN0VG9rZW5NZXRhZGF0YSA9PT0gbWV0YWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFRva2VuTWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0XHR0aGlzLl90b2tlbnMucHVzaChzdGFydE9mZnNldCk7XG5cdFx0dGhpcy5fdG9rZW5zLnB1c2gobWV0YWRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21lcmdlKGE6IFVpbnQzMkFycmF5IHwgbnVsbCwgYjogbnVtYmVyW10sIGM6IFVpbnQzMkFycmF5IHwgbnVsbCk6IFVpbnQzMkFycmF5IHtcblx0XHRjb25zdCBhTGVuID0gKGEgIT09IG51bGwgPyBhLmxlbmd0aCA6IDApO1xuXHRcdGNvbnN0IGJMZW4gPSBiLmxlbmd0aDtcblx0XHRjb25zdCBjTGVuID0gKGMgIT09IG51bGwgPyBjLmxlbmd0aCA6IDApO1xuXG5cdFx0aWYgKGFMZW4gPT09IDAgJiYgYkxlbiA9PT0gMCAmJiBjTGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFVpbnQzMkFycmF5KDApO1xuXHRcdH1cblx0XHRpZiAoYUxlbiA9PT0gMCAmJiBiTGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gYyE7XG5cdFx0fVxuXHRcdGlmIChiTGVuID09PSAwICYmIGNMZW4gPT09IDApIHtcblx0XHRcdHJldHVybiBhITtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoYUxlbiArIGJMZW4gKyBjTGVuKTtcblx0XHRpZiAoYSAhPT0gbnVsbCkge1xuXHRcdFx0cmVzdWx0LnNldChhKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBiTGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdFthTGVuICsgaV0gPSBiW2ldO1xuXHRcdH1cblx0XHRpZiAoYyAhPT0gbnVsbCkge1xuXHRcdFx0cmVzdWx0LnNldChjLCBhTGVuICsgYkxlbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgbmVzdGVkTGFuZ3VhZ2VUb2tlbml6ZShlbWJlZGRlZExhbmd1YWdlTGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSwgb2Zmc2V0RGVsdGE6IG51bWJlcik6IGxhbmd1YWdlcy5JU3RhdGUge1xuXHRcdGNvbnN0IG5lc3RlZExhbmd1YWdlSWQgPSBlbWJlZGRlZExhbmd1YWdlRGF0YS5sYW5ndWFnZUlkO1xuXHRcdGNvbnN0IGVtYmVkZGVkTW9kZVN0YXRlID0gZW1iZWRkZWRMYW5ndWFnZURhdGEuc3RhdGU7XG5cblx0XHRjb25zdCBuZXN0ZWRMYW5ndWFnZVRva2VuaXphdGlvblN1cHBvcnQgPSBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KG5lc3RlZExhbmd1YWdlSWQpO1xuXHRcdGlmICghbmVzdGVkTGFuZ3VhZ2VUb2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0XHR0aGlzLmVudGVyTGFuZ3VhZ2UobmVzdGVkTGFuZ3VhZ2VJZCk7XG5cdFx0XHR0aGlzLmVtaXQob2Zmc2V0RGVsdGEsICcnKTtcblx0XHRcdHJldHVybiBlbWJlZGRlZE1vZGVTdGF0ZTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXN0ZWRSZXN1bHQgPSBuZXN0ZWRMYW5ndWFnZVRva2VuaXphdGlvblN1cHBvcnQudG9rZW5pemVFbmNvZGVkKGVtYmVkZGVkTGFuZ3VhZ2VMaW5lLCBoYXNFT0wsIGVtYmVkZGVkTW9kZVN0YXRlKTtcblx0XHRpZiAob2Zmc2V0RGVsdGEgIT09IDApIHtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBuZXN0ZWRSZXN1bHQudG9rZW5zLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAyKSB7XG5cdFx0XHRcdG5lc3RlZFJlc3VsdC50b2tlbnNbaV0gKz0gb2Zmc2V0RGVsdGE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJlcGVuZFRva2VucyA9IE1vbmFyY2hNb2Rlcm5Ub2tlbnNDb2xsZWN0b3IuX21lcmdlKHRoaXMuX3ByZXBlbmRUb2tlbnMsIHRoaXMuX3Rva2VucywgbmVzdGVkUmVzdWx0LnRva2Vucyk7XG5cdFx0dGhpcy5fdG9rZW5zID0gW107XG5cdFx0dGhpcy5fY3VycmVudExhbmd1YWdlSWQgPSAwO1xuXHRcdHRoaXMuX2xhc3RUb2tlbk1ldGFkYXRhID0gMDtcblx0XHRyZXR1cm4gbmVzdGVkUmVzdWx0LmVuZFN0YXRlO1xuXHR9XG5cblx0cHVibGljIGZpbmFsaXplKGVuZFN0YXRlOiBNb25hcmNoTGluZVN0YXRlKTogbGFuZ3VhZ2VzLkVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQge1xuXHRcdHJldHVybiBuZXcgbGFuZ3VhZ2VzLkVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQoXG5cdFx0XHRNb25hcmNoTW9kZXJuVG9rZW5zQ29sbGVjdG9yLl9tZXJnZSh0aGlzLl9wcmVwZW5kVG9rZW5zLCB0aGlzLl90b2tlbnMsIG51bGwpLFxuXHRcdFx0W10sXG5cdFx0XHRlbmRTdGF0ZVxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgSUxvYWRTdGF0dXMgPSB7IGxvYWRlZDogdHJ1ZSB9IHwgeyBsb2FkZWQ6IGZhbHNlOyBwcm9taXNlOiBQcm9taXNlPHZvaWQ+IH07XG5cbmV4cG9ydCBjbGFzcyBNb25hcmNoVG9rZW5pemVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGxhbmd1YWdlcy5JVG9rZW5pemF0aW9uU3VwcG9ydCwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhbmRhbG9uZVRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfbGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbWJlZGRlZExhbmd1YWdlczogeyBbbGFuZ3VhZ2VJZDogc3RyaW5nXTogYm9vbGVhbiB9O1xuXHRwdWJsaWMgZW1iZWRkZWRMb2FkZWQ6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX21heFRva2VuaXphdGlvbkxpbmVMZW5ndGg6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIHN0YW5kYWxvbmVUaGVtZVNlcnZpY2U6IElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlLCBsYW5ndWFnZUlkOiBzdHJpbmcsIGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlciwgQElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UgPSBsYW5ndWFnZVNlcnZpY2U7XG5cdFx0dGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZSA9IHN0YW5kYWxvbmVUaGVtZVNlcnZpY2U7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWQ7XG5cdFx0dGhpcy5fbGV4ZXIgPSBsZXhlcjtcblx0XHR0aGlzLl9lbWJlZGRlZExhbmd1YWdlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5lbWJlZGRlZExvYWRlZCA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gU2V0IHVwIGxpc3RlbmluZyBmb3IgZW1iZWRkZWQgbW9kZXNcblx0XHRsZXQgZW1pdHRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlbWl0dGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgaXNPbmVPZk15RW1iZWRkZWRNb2RlcyA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGUuY2hhbmdlZExhbmd1YWdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZSA9IGUuY2hhbmdlZExhbmd1YWdlc1tpXTtcblx0XHRcdFx0aWYgKHRoaXMuX2VtYmVkZGVkTGFuZ3VhZ2VzW2xhbmd1YWdlXSkge1xuXHRcdFx0XHRcdGlzT25lT2ZNeUVtYmVkZGVkTW9kZXMgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNPbmVPZk15RW1iZWRkZWRNb2Rlcykge1xuXHRcdFx0XHRlbWl0dGluZyA9IHRydWU7XG5cdFx0XHRcdGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5oYW5kbGVDaGFuZ2UoW3RoaXMuX2xhbmd1YWdlSWRdKTtcblx0XHRcdFx0ZW1pdHRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJywge1xuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiB0aGlzLl9sYW5ndWFnZUlkXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJykpIHtcblx0XHRcdFx0dGhpcy5fbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoJywge1xuXHRcdFx0XHRcdG92ZXJyaWRlSWRlbnRpZmllcjogdGhpcy5fbGFuZ3VhZ2VJZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TG9hZFN0YXR1cygpOiBJTG9hZFN0YXR1cyB7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFRoZW5hYmxlPGFueT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbmVzdGVkTGFuZ3VhZ2VJZCBpbiB0aGlzLl9lbWJlZGRlZExhbmd1YWdlcykge1xuXHRcdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydCA9IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5nZXQobmVzdGVkTGFuZ3VhZ2VJZCk7XG5cdFx0XHRpZiAodG9rZW5pemF0aW9uU3VwcG9ydCkge1xuXHRcdFx0XHQvLyBUaGUgbmVzdGVkIGxhbmd1YWdlIGlzIGFscmVhZHkgbG9hZGVkXG5cdFx0XHRcdGlmICh0b2tlbml6YXRpb25TdXBwb3J0IGluc3RhbmNlb2YgTW9uYXJjaFRva2VuaXplcikge1xuXHRcdFx0XHRcdGNvbnN0IG5lc3RlZE1vZGVTdGF0dXMgPSB0b2tlbml6YXRpb25TdXBwb3J0LmdldExvYWRTdGF0dXMoKTtcblx0XHRcdFx0XHRpZiAobmVzdGVkTW9kZVN0YXR1cy5sb2FkZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKG5lc3RlZE1vZGVTdGF0dXMucHJvbWlzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5pc1Jlc29sdmVkKG5lc3RlZExhbmd1YWdlSWQpKSB7XG5cdFx0XHRcdC8vIFRoZSBuZXN0ZWQgbGFuZ3VhZ2UgaXMgaW4gdGhlIHByb2Nlc3Mgb2YgYmVpbmcgbG9hZGVkXG5cdFx0XHRcdHByb21pc2VzLnB1c2gobGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmdldE9yQ3JlYXRlKG5lc3RlZExhbmd1YWdlSWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocHJvbWlzZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsb2FkZWQ6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRsb2FkZWQ6IGZhbHNlLFxuXHRcdFx0cHJvbWlzZTogUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oXyA9PiB1bmRlZmluZWQpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbml0aWFsU3RhdGUoKTogbGFuZ3VhZ2VzLklTdGF0ZSB7XG5cdFx0Y29uc3Qgcm9vdFN0YXRlID0gTW9uYXJjaFN0YWNrRWxlbWVudEZhY3RvcnkuY3JlYXRlKG51bGwsIHRoaXMuX2xleGVyLnN0YXJ0ISk7XG5cdFx0cmV0dXJuIE1vbmFyY2hMaW5lU3RhdGVGYWN0b3J5LmNyZWF0ZShyb290U3RhdGUsIG51bGwpO1xuXHR9XG5cblx0cHVibGljIHRva2VuaXplKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBsaW5lU3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRpZiAobGluZS5sZW5ndGggPj0gdGhpcy5fbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGxUb2tlbml6ZSh0aGlzLl9sYW5ndWFnZUlkLCBsaW5lU3RhdGUpO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbnNDb2xsZWN0b3IgPSBuZXcgTW9uYXJjaENsYXNzaWNUb2tlbnNDb2xsZWN0b3IoKTtcblx0XHRjb25zdCBlbmRMaW5lU3RhdGUgPSB0aGlzLl90b2tlbml6ZShsaW5lLCBoYXNFT0wsIDxNb25hcmNoTGluZVN0YXRlPmxpbmVTdGF0ZSwgdG9rZW5zQ29sbGVjdG9yKTtcblx0XHRyZXR1cm4gdG9rZW5zQ29sbGVjdG9yLmZpbmFsaXplKGVuZExpbmVTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemVFbmNvZGVkKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBsaW5lU3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0aWYgKGxpbmUubGVuZ3RoID49IHRoaXMuX21heFRva2VuaXphdGlvbkxpbmVMZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsVG9rZW5pemVFbmNvZGVkKHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZCh0aGlzLl9sYW5ndWFnZUlkKSwgbGluZVN0YXRlKTtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5zQ29sbGVjdG9yID0gbmV3IE1vbmFyY2hNb2Rlcm5Ub2tlbnNDb2xsZWN0b3IodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50b2tlblRoZW1lKTtcblx0XHRjb25zdCBlbmRMaW5lU3RhdGUgPSB0aGlzLl90b2tlbml6ZShsaW5lLCBoYXNFT0wsIDxNb25hcmNoTGluZVN0YXRlPmxpbmVTdGF0ZSwgdG9rZW5zQ29sbGVjdG9yKTtcblx0XHRyZXR1cm4gdG9rZW5zQ29sbGVjdG9yLmZpbmFsaXplKGVuZExpbmVTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF90b2tlbml6ZShsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgbGluZVN0YXRlOiBNb25hcmNoTGluZVN0YXRlLCBjb2xsZWN0b3I6IElNb25hcmNoVG9rZW5zQ29sbGVjdG9yKTogTW9uYXJjaExpbmVTdGF0ZSB7XG5cdFx0aWYgKGxpbmVTdGF0ZS5lbWJlZGRlZExhbmd1YWdlRGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX25lc3RlZFRva2VuaXplKGxpbmUsIGhhc0VPTCwgbGluZVN0YXRlLCAwLCBjb2xsZWN0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbXlUb2tlbml6ZShsaW5lLCBoYXNFT0wsIGxpbmVTdGF0ZSwgMCwgY29sbGVjdG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTGVhdmluZ05lc3RlZExhbmd1YWdlT2Zmc2V0KGxpbmU6IHN0cmluZywgc3RhdGU6IE1vbmFyY2hMaW5lU3RhdGUpOiBudW1iZXIge1xuXHRcdGxldCBydWxlczogbW9uYXJjaENvbW1vbi5JUnVsZVtdIHwgbnVsbCA9IHRoaXMuX2xleGVyLnRva2VuaXplcltzdGF0ZS5zdGFjay5zdGF0ZV07XG5cdFx0aWYgKCFydWxlcykge1xuXHRcdFx0cnVsZXMgPSBtb25hcmNoQ29tbW9uLmZpbmRSdWxlcyh0aGlzLl9sZXhlciwgc3RhdGUuc3RhY2suc3RhdGUpOyAvLyBkbyBwYXJlbnQgbWF0Y2hpbmdcblx0XHRcdGlmICghcnVsZXMpIHtcblx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ3Rva2VuaXplciBzdGF0ZSBpcyBub3QgZGVmaW5lZDogJyArIHN0YXRlLnN0YWNrLnN0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcG9wT2Zmc2V0ID0gLTE7XG5cdFx0bGV0IGhhc0VtYmVkZGVkUG9wUnVsZSA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHJ1bGVzKSB7XG5cdFx0XHRpZiAoIW1vbmFyY2hDb21tb24uaXNJQWN0aW9uKHJ1bGUuYWN0aW9uKSB8fCAhKHJ1bGUuYWN0aW9uLm5leHRFbWJlZGRlZCA9PT0gJ0Bwb3AnIHx8IHJ1bGUuYWN0aW9uLmhhc0VtYmVkZGVkRW5kSW5DYXNlcykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRoYXNFbWJlZGRlZFBvcFJ1bGUgPSB0cnVlO1xuXG5cdFx0XHRsZXQgcmVnZXggPSBydWxlLnJlc29sdmVSZWdleChzdGF0ZS5zdGFjay5zdGF0ZSk7XG5cdFx0XHRjb25zdCByZWdleFNvdXJjZSA9IHJlZ2V4LnNvdXJjZTtcblx0XHRcdGlmIChyZWdleFNvdXJjZS5zdWJzdHIoMCwgNCkgPT09ICdeKD86JyAmJiByZWdleFNvdXJjZS5zdWJzdHIocmVnZXhTb3VyY2UubGVuZ3RoIC0gMSwgMSkgPT09ICcpJykge1xuXHRcdFx0XHRjb25zdCBmbGFncyA9IChyZWdleC5pZ25vcmVDYXNlID8gJ2knIDogJycpICsgKHJlZ2V4LnVuaWNvZGUgPyAndScgOiAnJyk7XG5cdFx0XHRcdHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFNvdXJjZS5zdWJzdHIoNCwgcmVnZXhTb3VyY2UubGVuZ3RoIC0gNSksIGZsYWdzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbGluZS5zZWFyY2gocmVnZXgpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gLTEgfHwgKHJlc3VsdCAhPT0gMCAmJiBydWxlLm1hdGNoT25seUF0TGluZVN0YXJ0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBvcE9mZnNldCA9PT0gLTEgfHwgcmVzdWx0IDwgcG9wT2Zmc2V0KSB7XG5cdFx0XHRcdHBvcE9mZnNldCA9IHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc0VtYmVkZGVkUG9wUnVsZSkge1xuXHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ25vIHJ1bGUgY29udGFpbmluZyBuZXh0RW1iZWRkZWQ6IFwiQHBvcFwiIGluIHRva2VuaXplciBlbWJlZGRlZCBzdGF0ZTogJyArIHN0YXRlLnN0YWNrLnN0YXRlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcG9wT2Zmc2V0O1xuXHR9XG5cblx0cHJpdmF0ZSBfbmVzdGVkVG9rZW5pemUobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGxpbmVTdGF0ZTogTW9uYXJjaExpbmVTdGF0ZSwgb2Zmc2V0RGVsdGE6IG51bWJlciwgdG9rZW5zQ29sbGVjdG9yOiBJTW9uYXJjaFRva2Vuc0NvbGxlY3Rvcik6IE1vbmFyY2hMaW5lU3RhdGUge1xuXG5cdFx0Y29uc3QgcG9wT2Zmc2V0ID0gdGhpcy5fZmluZExlYXZpbmdOZXN0ZWRMYW5ndWFnZU9mZnNldChsaW5lLCBsaW5lU3RhdGUpO1xuXG5cdFx0aWYgKHBvcE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdC8vIHRva2VuaXphdGlvbiB3aWxsIG5vdCBsZWF2ZSBuZXN0ZWQgbGFuZ3VhZ2Vcblx0XHRcdGNvbnN0IG5lc3RlZEVuZFN0YXRlID0gdG9rZW5zQ29sbGVjdG9yLm5lc3RlZExhbmd1YWdlVG9rZW5pemUobGluZSwgaGFzRU9MLCBsaW5lU3RhdGUuZW1iZWRkZWRMYW5ndWFnZURhdGEhLCBvZmZzZXREZWx0YSk7XG5cdFx0XHRyZXR1cm4gTW9uYXJjaExpbmVTdGF0ZUZhY3RvcnkuY3JlYXRlKGxpbmVTdGF0ZS5zdGFjaywgbmV3IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKGxpbmVTdGF0ZS5lbWJlZGRlZExhbmd1YWdlRGF0YSEubGFuZ3VhZ2VJZCwgbmVzdGVkRW5kU3RhdGUpKTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXN0ZWRMYW5ndWFnZUxpbmUgPSBsaW5lLnN1YnN0cmluZygwLCBwb3BPZmZzZXQpO1xuXHRcdGlmIChuZXN0ZWRMYW5ndWFnZUxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gdG9rZW5pemUgd2l0aCB0aGUgbmVzdGVkIGxhbmd1YWdlXG5cdFx0XHR0b2tlbnNDb2xsZWN0b3IubmVzdGVkTGFuZ3VhZ2VUb2tlbml6ZShuZXN0ZWRMYW5ndWFnZUxpbmUsIGZhbHNlLCBsaW5lU3RhdGUuZW1iZWRkZWRMYW5ndWFnZURhdGEhLCBvZmZzZXREZWx0YSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdE9mVGhlTGluZSA9IGxpbmUuc3Vic3RyaW5nKHBvcE9mZnNldCk7XG5cdFx0cmV0dXJuIHRoaXMuX215VG9rZW5pemUocmVzdE9mVGhlTGluZSwgaGFzRU9MLCBsaW5lU3RhdGUsIG9mZnNldERlbHRhICsgcG9wT2Zmc2V0LCB0b2tlbnNDb2xsZWN0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2FmZVJ1bGVOYW1lKHJ1bGU6IG1vbmFyY2hDb21tb24uSVJ1bGUgfCBudWxsKTogc3RyaW5nIHtcblx0XHRpZiAocnVsZSkge1xuXHRcdFx0cmV0dXJuIHJ1bGUubmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuICcodW5rbm93biknO1xuXHR9XG5cblx0cHJpdmF0ZSBfbXlUb2tlbml6ZShsaW5lV2l0aG91dExGOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgbGluZVN0YXRlOiBNb25hcmNoTGluZVN0YXRlLCBvZmZzZXREZWx0YTogbnVtYmVyLCB0b2tlbnNDb2xsZWN0b3I6IElNb25hcmNoVG9rZW5zQ29sbGVjdG9yKTogTW9uYXJjaExpbmVTdGF0ZSB7XG5cdFx0dG9rZW5zQ29sbGVjdG9yLmVudGVyTGFuZ3VhZ2UodGhpcy5fbGFuZ3VhZ2VJZCk7XG5cblx0XHRjb25zdCBsaW5lV2l0aG91dExGTGVuZ3RoID0gbGluZVdpdGhvdXRMRi5sZW5ndGg7XG5cdFx0Y29uc3QgbGluZSA9IChoYXNFT0wgJiYgdGhpcy5fbGV4ZXIuaW5jbHVkZUxGID8gbGluZVdpdGhvdXRMRiArICdcXG4nIDogbGluZVdpdGhvdXRMRik7XG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IGxpbmUubGVuZ3RoO1xuXG5cdFx0bGV0IGVtYmVkZGVkTGFuZ3VhZ2VEYXRhID0gbGluZVN0YXRlLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhO1xuXHRcdGxldCBzdGFjayA9IGxpbmVTdGF0ZS5zdGFjaztcblx0XHRsZXQgcG9zID0gMDtcblxuXHRcdC8vIHJlZ3VsYXIgZXhwcmVzc2lvbiBncm91cCBtYXRjaGluZ1xuXHRcdC8vIHRoZXNlIG5ldmVyIG5lZWQgY2xvbmluZyBvciBlcXVhbGl0eSBzaW5jZSB0aGV5IGFyZSBvbmx5IHVzZWQgd2l0aGluIGEgbGluZSBtYXRjaFxuXHRcdGludGVyZmFjZSBHcm91cE1hdGNoaW5nIHtcblx0XHRcdG1hdGNoZXM6IHN0cmluZ1tdO1xuXHRcdFx0cnVsZTogbW9uYXJjaENvbW1vbi5JUnVsZSB8IG51bGw7XG5cdFx0XHRncm91cHM6IHsgYWN0aW9uOiBtb25hcmNoQ29tbW9uLkZ1enp5QWN0aW9uOyBtYXRjaGVkOiBzdHJpbmcgfVtdO1xuXHRcdH1cblx0XHRsZXQgZ3JvdXBNYXRjaGluZzogR3JvdXBNYXRjaGluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbW9uYWNvLWVkaXRvci9pc3N1ZXMvMTIzNVxuXHRcdC8vIEV2YWx1YXRlIHJ1bGVzIGF0IGxlYXN0IG9uY2UgZm9yIGFuIGVtcHR5IGxpbmVcblx0XHRsZXQgZm9yY2VFdmFsdWF0aW9uID0gdHJ1ZTtcblxuXHRcdHdoaWxlIChmb3JjZUV2YWx1YXRpb24gfHwgcG9zIDwgbGluZUxlbmd0aCkge1xuXG5cdFx0XHRjb25zdCBwb3MwID0gcG9zO1xuXHRcdFx0Y29uc3Qgc3RhY2tMZW4wID0gc3RhY2suZGVwdGg7XG5cdFx0XHRjb25zdCBncm91cExlbjAgPSBncm91cE1hdGNoaW5nID8gZ3JvdXBNYXRjaGluZy5ncm91cHMubGVuZ3RoIDogMDtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhY2suc3RhdGU7XG5cblx0XHRcdGxldCBtYXRjaGVzOiBzdHJpbmdbXSB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IG1hdGNoZWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IGFjdGlvbjogbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbiB8IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb25bXSB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IHJ1bGU6IG1vbmFyY2hDb21tb24uSVJ1bGUgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0bGV0IGVudGVyaW5nRW1iZWRkZWRMYW5ndWFnZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdC8vIGNoZWNrIGlmIHdlIG5lZWQgdG8gcHJvY2VzcyBncm91cCBtYXRjaGVzIGZpcnN0XG5cdFx0XHRpZiAoZ3JvdXBNYXRjaGluZykge1xuXHRcdFx0XHRtYXRjaGVzID0gZ3JvdXBNYXRjaGluZy5tYXRjaGVzO1xuXHRcdFx0XHRjb25zdCBncm91cEVudHJ5ID0gZ3JvdXBNYXRjaGluZy5ncm91cHMuc2hpZnQoKSE7XG5cdFx0XHRcdG1hdGNoZWQgPSBncm91cEVudHJ5Lm1hdGNoZWQ7XG5cdFx0XHRcdGFjdGlvbiA9IGdyb3VwRW50cnkuYWN0aW9uO1xuXHRcdFx0XHRydWxlID0gZ3JvdXBNYXRjaGluZy5ydWxlO1xuXG5cdFx0XHRcdC8vIGNsZWFudXAgaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdGlmIChncm91cE1hdGNoaW5nLmdyb3Vwcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRncm91cE1hdGNoaW5nID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gb3RoZXJ3aXNlIHdlIG1hdGNoIG9uIHRoZSB0b2tlbiBzdHJlYW1cblxuXHRcdFx0XHRpZiAoIWZvcmNlRXZhbHVhdGlvbiAmJiBwb3MgPj0gbGluZUxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvcmNlRXZhbHVhdGlvbiA9IGZhbHNlO1xuXG5cdFx0XHRcdC8vIGdldCB0aGUgcnVsZXMgZm9yIHRoaXMgc3RhdGVcblx0XHRcdFx0bGV0IHJ1bGVzOiBtb25hcmNoQ29tbW9uLklSdWxlW10gfCBudWxsID0gdGhpcy5fbGV4ZXIudG9rZW5pemVyW3N0YXRlXTtcblx0XHRcdFx0aWYgKCFydWxlcykge1xuXHRcdFx0XHRcdHJ1bGVzID0gbW9uYXJjaENvbW1vbi5maW5kUnVsZXModGhpcy5fbGV4ZXIsIHN0YXRlKTsgLy8gZG8gcGFyZW50IG1hdGNoaW5nXG5cdFx0XHRcdFx0aWYgKCFydWxlcykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ3Rva2VuaXplciBzdGF0ZSBpcyBub3QgZGVmaW5lZDogJyArIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB0cnkgZWFjaCBydWxlIHVudGlsIHdlIG1hdGNoXG5cdFx0XHRcdGNvbnN0IHJlc3RPZkxpbmUgPSBsaW5lLnN1YnN0cihwb3MpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblx0XHRcdFx0XHRpZiAocG9zID09PSAwIHx8ICFydWxlLm1hdGNoT25seUF0TGluZVN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVzID0gcmVzdE9mTGluZS5tYXRjaChydWxlLnJlc29sdmVSZWdleChzdGF0ZSkpO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0XHRcdFx0bWF0Y2hlZCA9IG1hdGNoZXNbMF07XG5cdFx0XHRcdFx0XHRcdGFjdGlvbiA9IHJ1bGUuYWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgbWF0Y2hlZCAncnVsZScgd2l0aCAnbWF0Y2hlcycgYW5kICdhY3Rpb24nXG5cdFx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdFx0bWF0Y2hlcyA9IFsnJ107XG5cdFx0XHRcdG1hdGNoZWQgPSAnJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdFx0Ly8gYmFkOiB3ZSBkaWRuJ3QgbWF0Y2ggYW55dGhpbmcsIGFuZCB0aGVyZSBpcyBubyBhY3Rpb24gdG8gdGFrZVxuXHRcdFx0XHQvLyB3ZSBuZWVkIHRvIGFkdmFuY2UgdGhlIHN0cmVhbSBvciB3ZSBnZXQgcHJvZ3Jlc3MgdHJvdWJsZVxuXHRcdFx0XHRpZiAocG9zIDwgbGluZUxlbmd0aCkge1xuXHRcdFx0XHRcdG1hdGNoZXMgPSBbbGluZS5jaGFyQXQocG9zKV07XG5cdFx0XHRcdFx0bWF0Y2hlZCA9IG1hdGNoZXNbMF07XG5cdFx0XHRcdH1cblx0XHRcdFx0YWN0aW9uID0gdGhpcy5fbGV4ZXIuZGVmYXVsdFRva2VuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobWF0Y2hlZCA9PT0gbnVsbCkge1xuXHRcdFx0XHQvLyBzaG91bGQgbmV2ZXIgaGFwcGVuLCBuZWVkZWQgZm9yIHN0cmljdCBudWxsIGNoZWNraW5nXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhZHZhbmNlIHN0cmVhbVxuXHRcdFx0cG9zICs9IG1hdGNoZWQubGVuZ3RoO1xuXG5cdFx0XHQvLyBtYXliZSBjYWxsIGFjdGlvbiBmdW5jdGlvbiAodXNlZCBmb3IgJ2Nhc2VzJylcblx0XHRcdHdoaWxlIChtb25hcmNoQ29tbW9uLmlzRnV6enlBY3Rpb24oYWN0aW9uKSAmJiBtb25hcmNoQ29tbW9uLmlzSUFjdGlvbihhY3Rpb24pICYmIGFjdGlvbi50ZXN0KSB7XG5cdFx0XHRcdGFjdGlvbiA9IGFjdGlvbi50ZXN0KG1hdGNoZWQsIG1hdGNoZXMsIHN0YXRlLCBwb3MgPT09IGxpbmVMZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVzdWx0OiBtb25hcmNoQ29tbW9uLkZ1enp5QWN0aW9uIHwgbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbltdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHQvLyBzZXQgdGhlIHJlc3VsdDogZWl0aGVyIGEgc3RyaW5nIG9yIGFuIGFycmF5IG9mIGFjdGlvbnNcblx0XHRcdGlmICh0eXBlb2YgYWN0aW9uID09PSAnc3RyaW5nJyB8fCBBcnJheS5pc0FycmF5KGFjdGlvbikpIHtcblx0XHRcdFx0cmVzdWx0ID0gYWN0aW9uO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uZ3JvdXApIHtcblx0XHRcdFx0cmVzdWx0ID0gYWN0aW9uLmdyb3VwO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24udG9rZW4gIT09IG51bGwgJiYgYWN0aW9uLnRva2VuICE9PSB1bmRlZmluZWQpIHtcblxuXHRcdFx0XHQvLyBkbyAkbiByZXBsYWNlbWVudHM/XG5cdFx0XHRcdGlmIChhY3Rpb24udG9rZW5TdWJzdCkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IG1vbmFyY2hDb21tb24uc3Vic3RpdHV0ZU1hdGNoZXModGhpcy5fbGV4ZXIsIGFjdGlvbi50b2tlbiwgbWF0Y2hlZCwgbWF0Y2hlcywgc3RhdGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGFjdGlvbi50b2tlbjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGVudGVyIGVtYmVkZGVkIGxhbmd1YWdlP1xuXHRcdFx0XHRpZiAoYWN0aW9uLm5leHRFbWJlZGRlZCkge1xuXHRcdFx0XHRcdGlmIChhY3Rpb24ubmV4dEVtYmVkZGVkID09PSAnQHBvcCcpIHtcblx0XHRcdFx0XHRcdGlmICghZW1iZWRkZWRMYW5ndWFnZURhdGEpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ2Nhbm5vdCBwb3AgZW1iZWRkZWQgbGFuZ3VhZ2UgaWYgbm90IGluc2lkZSBvbmUnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVtYmVkZGVkTGFuZ3VhZ2VEYXRhID0gbnVsbDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGVtYmVkZGVkTGFuZ3VhZ2VEYXRhKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnY2Fubm90IGVudGVyIGVtYmVkZGVkIGxhbmd1YWdlIGZyb20gd2l0aGluIGFuIGVtYmVkZGVkIGxhbmd1YWdlJyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVudGVyaW5nRW1iZWRkZWRMYW5ndWFnZSA9IG1vbmFyY2hDb21tb24uc3Vic3RpdHV0ZU1hdGNoZXModGhpcy5fbGV4ZXIsIGFjdGlvbi5uZXh0RW1iZWRkZWQsIG1hdGNoZWQsIG1hdGNoZXMsIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBzdGF0ZSB0cmFuc2Zvcm1hdGlvbnNcblx0XHRcdFx0aWYgKGFjdGlvbi5nb0JhY2spIHsgLy8gYmFjayB1cCB0aGUgc3RyZWFtLi5cblx0XHRcdFx0XHRwb3MgPSBNYXRoLm1heCgwLCBwb3MgLSBhY3Rpb24uZ29CYWNrKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24uc3dpdGNoVG8gJiYgdHlwZW9mIGFjdGlvbi5zd2l0Y2hUbyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRsZXQgbmV4dFN0YXRlID0gbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyh0aGlzLl9sZXhlciwgYWN0aW9uLnN3aXRjaFRvLCBtYXRjaGVkLCBtYXRjaGVzLCBzdGF0ZSk7ICAvLyBzd2l0Y2ggc3RhdGUgd2l0aG91dCBhIHB1c2guLi5cblx0XHRcdFx0XHRpZiAobmV4dFN0YXRlWzBdID09PSAnQCcpIHtcblx0XHRcdFx0XHRcdG5leHRTdGF0ZSA9IG5leHRTdGF0ZS5zdWJzdHIoMSk7IC8vIHBlZWwgb2ZmIHN0YXJ0aW5nICdAJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIW1vbmFyY2hDb21tb24uZmluZFJ1bGVzKHRoaXMuX2xleGVyLCBuZXh0U3RhdGUpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAndHJ5aW5nIHRvIHN3aXRjaCB0byBhIHN0YXRlIFxcJycgKyBuZXh0U3RhdGUgKyAnXFwnIHRoYXQgaXMgdW5kZWZpbmVkIGluIHJ1bGU6ICcgKyB0aGlzLl9zYWZlUnVsZU5hbWUocnVsZSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGFjayA9IHN0YWNrLnN3aXRjaFRvKG5leHRTdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi50cmFuc2Zvcm0gJiYgdHlwZW9mIGFjdGlvbi50cmFuc2Zvcm0gPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnYWN0aW9uLnRyYW5zZm9ybSBub3Qgc3VwcG9ydGVkJyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLm5leHQpIHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uLm5leHQgPT09ICdAcHVzaCcpIHtcblx0XHRcdFx0XHRcdGlmIChzdGFjay5kZXB0aCA+PSB0aGlzLl9sZXhlci5tYXhTdGFjaykge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnbWF4aW11bSB0b2tlbml6ZXIgc3RhY2sgc2l6ZSByZWFjaGVkOiBbJyArXG5cdFx0XHRcdFx0XHRcdFx0c3RhY2suc3RhdGUgKyAnLCcgKyBzdGFjay5wYXJlbnQhLnN0YXRlICsgJywuLi5dJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGFjayA9IHN0YWNrLnB1c2goc3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLm5leHQgPT09ICdAcG9wJykge1xuXHRcdFx0XHRcdFx0aWYgKHN0YWNrLmRlcHRoIDw9IDEpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ3RyeWluZyB0byBwb3AgYW4gZW1wdHkgc3RhY2sgaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGFjayA9IHN0YWNrLnBvcCgpITtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5uZXh0ID09PSAnQHBvcGFsbCcpIHtcblx0XHRcdFx0XHRcdHN0YWNrID0gc3RhY2sucG9wYWxsKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxldCBuZXh0U3RhdGUgPSBtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzKHRoaXMuX2xleGVyLCBhY3Rpb24ubmV4dCwgbWF0Y2hlZCwgbWF0Y2hlcywgc3RhdGUpO1xuXHRcdFx0XHRcdFx0aWYgKG5leHRTdGF0ZVswXSA9PT0gJ0AnKSB7XG5cdFx0XHRcdFx0XHRcdG5leHRTdGF0ZSA9IG5leHRTdGF0ZS5zdWJzdHIoMSk7IC8vIHBlZWwgb2ZmIHN0YXJ0aW5nICdAJ1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoIW1vbmFyY2hDb21tb24uZmluZFJ1bGVzKHRoaXMuX2xleGVyLCBuZXh0U3RhdGUpKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICd0cnlpbmcgdG8gc2V0IGEgbmV4dCBzdGF0ZSBcXCcnICsgbmV4dFN0YXRlICsgJ1xcJyB0aGF0IGlzIHVuZGVmaW5lZCBpbiBydWxlOiAnICsgdGhpcy5fc2FmZVJ1bGVOYW1lKHJ1bGUpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0YWNrID0gc3RhY2sucHVzaChuZXh0U3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24ubG9nICYmIHR5cGVvZiAoYWN0aW9uLmxvZykgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0bW9uYXJjaENvbW1vbi5sb2codGhpcy5fbGV4ZXIsIHRoaXMuX2xleGVyLmxhbmd1YWdlSWQgKyAnOiAnICsgbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyh0aGlzLl9sZXhlciwgYWN0aW9uLmxvZywgbWF0Y2hlZCwgbWF0Y2hlcywgc3RhdGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBjaGVjayByZXN1bHRcblx0XHRcdGlmIChyZXN1bHQgPT09IG51bGwpIHtcblx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ2xleGVyIHJ1bGUgaGFzIG5vIHdlbGwtZGVmaW5lZCBhY3Rpb24gaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbXB1dGVOZXdTdGF0ZUZvckVtYmVkZGVkTGFuZ3VhZ2UgPSAoZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Ly8gc3VwcG9ydCBsYW5ndWFnZSBuYW1lcywgbWltZSB0eXBlcywgYW5kIGxhbmd1YWdlIGlkc1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gKFxuXHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUoZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlKVxuXHRcdFx0XHRcdHx8IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlNaW1lVHlwZShlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UpXG5cdFx0XHRcdFx0fHwgZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Y29uc3QgZW1iZWRkZWRMYW5ndWFnZURhdGEgPSB0aGlzLl9nZXROZXN0ZWRFbWJlZGRlZExhbmd1YWdlRGF0YShsYW5ndWFnZUlkKTtcblxuXHRcdFx0XHRpZiAocG9zIDwgbGluZUxlbmd0aCkge1xuXHRcdFx0XHRcdC8vIHRoZXJlIGlzIGNvbnRlbnQgZnJvbSB0aGUgZW1iZWRkZWQgbGFuZ3VhZ2Ugb24gdGhpcyBsaW5lXG5cdFx0XHRcdFx0Y29uc3QgcmVzdE9mTGluZSA9IGxpbmVXaXRob3V0TEYuc3Vic3RyKHBvcyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX25lc3RlZFRva2VuaXplKHJlc3RPZkxpbmUsIGhhc0VPTCwgTW9uYXJjaExpbmVTdGF0ZUZhY3RvcnkuY3JlYXRlKHN0YWNrLCBlbWJlZGRlZExhbmd1YWdlRGF0YSksIG9mZnNldERlbHRhICsgcG9zLCB0b2tlbnNDb2xsZWN0b3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBNb25hcmNoTGluZVN0YXRlRmFjdG9yeS5jcmVhdGUoc3RhY2ssIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gaXMgdGhlIHJlc3VsdCBhIGdyb3VwIG1hdGNoP1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuXHRcdFx0XHRpZiAoZ3JvdXBNYXRjaGluZyAmJiBncm91cE1hdGNoaW5nLmdyb3Vwcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ2dyb3VwcyBjYW5ub3QgYmUgbmVzdGVkOiAnICsgdGhpcy5fc2FmZVJ1bGVOYW1lKHJ1bGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWF0Y2hlcy5sZW5ndGggIT09IHJlc3VsdC5sZW5ndGggKyAxKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ21hdGNoZWQgbnVtYmVyIG9mIGdyb3VwcyBkb2VzIG5vdCBtYXRjaCB0aGUgbnVtYmVyIG9mIGFjdGlvbnMgaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IHRvdGFsTGVuID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dG90YWxMZW4gKz0gbWF0Y2hlc1tpXS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRvdGFsTGVuICE9PSBtYXRjaGVkLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICd3aXRoIGdyb3VwcywgYWxsIGNoYXJhY3RlcnMgc2hvdWxkIGJlIG1hdGNoZWQgaW4gY29uc2VjdXRpdmUgZ3JvdXBzIGluIHJ1bGU6ICcgKyB0aGlzLl9zYWZlUnVsZU5hbWUocnVsZSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Z3JvdXBNYXRjaGluZyA9IHtcblx0XHRcdFx0XHRydWxlOiBydWxlLFxuXHRcdFx0XHRcdG1hdGNoZXM6IG1hdGNoZXMsXG5cdFx0XHRcdFx0Z3JvdXBzOiBbXVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGdyb3VwTWF0Y2hpbmcuZ3JvdXBzW2ldID0ge1xuXHRcdFx0XHRcdFx0YWN0aW9uOiByZXN1bHRbaV0sXG5cdFx0XHRcdFx0XHRtYXRjaGVkOiBtYXRjaGVzW2kgKyAxXVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwb3MgLT0gbWF0Y2hlZC5sZW5ndGg7XG5cdFx0XHRcdC8vIGNhbGwgcmVjdXJzaXZlbHkgdG8gaW5pdGlhdGUgZmlyc3QgcmVzdWx0IG1hdGNoXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcmVndWxhciByZXN1bHRcblxuXHRcdFx0XHQvLyBjaGVjayBmb3IgJ0ByZW1hdGNoJ1xuXHRcdFx0XHRpZiAocmVzdWx0ID09PSAnQHJlbWF0Y2gnKSB7XG5cdFx0XHRcdFx0cG9zIC09IG1hdGNoZWQubGVuZ3RoO1xuXHRcdFx0XHRcdG1hdGNoZWQgPSAnJzsgIC8vIGJldHRlciBzZXQgdGhlIG5leHQgc3RhdGUgdG9vLi5cblx0XHRcdFx0XHRtYXRjaGVzID0gbnVsbDtcblx0XHRcdFx0XHRyZXN1bHQgPSAnJztcblxuXHRcdFx0XHRcdC8vIEV2ZW4gdGhvdWdoIGBAcmVtYXRjaGAgd2FzIHNwZWNpZmllZCwgaWYgYG5leHRFbWJlZGRlZGAgYWxzbyBzcGVjaWZpZWQsXG5cdFx0XHRcdFx0Ly8gYSBzdGF0ZSB0cmFuc2l0aW9uIHNob3VsZCBvY2N1ci5cblx0XHRcdFx0XHRpZiAoZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tcHV0ZU5ld1N0YXRlRm9yRW1iZWRkZWRMYW5ndWFnZShlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNoZWNrIHByb2dyZXNzXG5cdFx0XHRcdGlmIChtYXRjaGVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGlmIChsaW5lTGVuZ3RoID09PSAwIHx8IHN0YWNrTGVuMCAhPT0gc3RhY2suZGVwdGggfHwgc3RhdGUgIT09IHN0YWNrLnN0YXRlIHx8ICghZ3JvdXBNYXRjaGluZyA/IDAgOiBncm91cE1hdGNoaW5nLmdyb3Vwcy5sZW5ndGgpICE9PSBncm91cExlbjApIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnbm8gcHJvZ3Jlc3MgaW4gdG9rZW5pemVyIGluIHJ1bGU6ICcgKyB0aGlzLl9zYWZlUnVsZU5hbWUocnVsZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJldHVybiB0aGUgcmVzdWx0IChhbmQgY2hlY2sgZm9yIGJyYWNlIG1hdGNoaW5nKVxuXHRcdFx0XHQvLyB0b2RvOiBmb3IgZWZmaWNpZW5jeSB3ZSBjb3VsZCBwcmUtc2FuaXRpemUgdG9rZW5Qb3N0Zml4IGFuZCBzdWJzdGl0dXRpb25zXG5cdFx0XHRcdGxldCB0b2tlblR5cGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRpZiAobW9uYXJjaENvbW1vbi5pc1N0cmluZyhyZXN1bHQpICYmIHJlc3VsdC5pbmRleE9mKCdAYnJhY2tldHMnKSA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3QgPSByZXN1bHQuc3Vic3RyKCdAYnJhY2tldHMnLmxlbmd0aCk7XG5cdFx0XHRcdFx0Y29uc3QgYnJhY2tldCA9IGZpbmRCcmFja2V0KHRoaXMuX2xleGVyLCBtYXRjaGVkKTtcblx0XHRcdFx0XHRpZiAoIWJyYWNrZXQpIHtcblx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICdAYnJhY2tldHMgdG9rZW4gcmV0dXJuZWQgYnV0IG5vIGJyYWNrZXQgZGVmaW5lZCBhczogJyArIG1hdGNoZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b2tlblR5cGUgPSBtb25hcmNoQ29tbW9uLnNhbml0aXplKGJyYWNrZXQudG9rZW4gKyByZXN0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IChyZXN1bHQgPT09ICcnID8gJycgOiByZXN1bHQgKyB0aGlzLl9sZXhlci50b2tlblBvc3RmaXgpO1xuXHRcdFx0XHRcdHRva2VuVHlwZSA9IG1vbmFyY2hDb21tb24uc2FuaXRpemUodG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHBvczAgPCBsaW5lV2l0aG91dExGTGVuZ3RoKSB7XG5cdFx0XHRcdFx0dG9rZW5zQ29sbGVjdG9yLmVtaXQocG9zMCArIG9mZnNldERlbHRhLCB0b2tlblR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UgIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXB1dGVOZXdTdGF0ZUZvckVtYmVkZGVkTGFuZ3VhZ2UoZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gTW9uYXJjaExpbmVTdGF0ZUZhY3RvcnkuY3JlYXRlKHN0YWNrLCBlbWJlZGRlZExhbmd1YWdlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXROZXN0ZWRFbWJlZGRlZExhbmd1YWdlRGF0YShsYW5ndWFnZUlkOiBzdHJpbmcpOiBFbWJlZGRlZExhbmd1YWdlRGF0YSB7XG5cdFx0aWYgKCF0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBFbWJlZGRlZExhbmd1YWdlRGF0YShsYW5ndWFnZUlkLCBOdWxsU3RhdGUpO1xuXHRcdH1cblxuXHRcdGlmIChsYW5ndWFnZUlkICE9PSB0aGlzLl9sYW5ndWFnZUlkKSB7XG5cdFx0XHQvLyBGaXJlIGxhbmd1YWdlIGxvYWRpbmcgZXZlbnRcblx0XHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZS5yZXF1ZXN0QmFzaWNMYW5ndWFnZUZlYXR1cmVzKGxhbmd1YWdlSWQpO1xuXHRcdFx0bGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmdldE9yQ3JlYXRlKGxhbmd1YWdlSWQpO1xuXHRcdFx0dGhpcy5fZW1iZWRkZWRMYW5ndWFnZXNbbGFuZ3VhZ2VJZF0gPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQgPSBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KGxhbmd1YWdlSWQpO1xuXHRcdGlmICh0b2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKGxhbmd1YWdlSWQsIHRva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgRW1iZWRkZWRMYW5ndWFnZURhdGEobGFuZ3VhZ2VJZCwgTnVsbFN0YXRlKTtcblx0fVxufVxuXG4vKipcbiAqIFNlYXJjaGVzIGZvciBhIGJyYWNrZXQgaW4gdGhlICdicmFja2V0cycgYXR0cmlidXRlIHRoYXQgbWF0Y2hlcyB0aGUgaW5wdXQuXG4gKi9cbmZ1bmN0aW9uIGZpbmRCcmFja2V0KGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlciwgbWF0Y2hlZDogc3RyaW5nKSB7XG5cdGlmICghbWF0Y2hlZCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdG1hdGNoZWQgPSBtb25hcmNoQ29tbW9uLmZpeENhc2UobGV4ZXIsIG1hdGNoZWQpO1xuXG5cdGNvbnN0IGJyYWNrZXRzID0gbGV4ZXIuYnJhY2tldHM7XG5cdGZvciAoY29uc3QgYnJhY2tldCBvZiBicmFja2V0cykge1xuXHRcdGlmIChicmFja2V0Lm9wZW4gPT09IG1hdGNoZWQpIHtcblx0XHRcdHJldHVybiB7IHRva2VuOiBicmFja2V0LnRva2VuLCBicmFja2V0VHlwZTogbW9uYXJjaENvbW1vbi5Nb25hcmNoQnJhY2tldC5PcGVuIH07XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGJyYWNrZXQuY2xvc2UgPT09IG1hdGNoZWQpIHtcblx0XHRcdHJldHVybiB7IHRva2VuOiBicmFja2V0LnRva2VuLCBicmFja2V0VHlwZTogbW9uYXJjaENvbW1vbi5Nb25hcmNoQnJhY2tldC5DbG9zZSB9O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBVUEsU0FBUyxrQkFBK0I7QUFDeEMsWUFBWSxlQUFlO0FBQzNCLFNBQVMsV0FBVyxxQkFBcUIsb0JBQW9CO0FBRzdELFlBQVksbUJBQW1CO0FBRS9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsWUFBWSxzQkFBc0I7QUFFM0MsTUFBTSxvQkFBb0I7QUFLMUIsTUFBTSw4QkFBTixNQUFNLDRCQUEyQjtBQUFBLEVBR2hDLE9BQWMsT0FBTyxRQUFvQyxPQUFvQztBQUM1RixXQUFPLEtB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QWdCLENBQUM7QUFBQSxJQUNsRjtBQUVBLFdBQU8sSUFBSSxxQkFBcUIsWUFBWSxTQUFTO0FBQUEsRUFDdEQ7QUFDRDtBQXhmYSxtQkFBTjtBQUFBLEVBVTRJO0FBQUEsR0FWdEk7QUE2ZmIsU0FBUyxZQUFZLE9BQTZCLFNBQWlCO0FBQ2xFLE1BQUksQ0FBQyxTQUFTO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFDQSxZQUFVLGNBQWMsUUFBUSxPQUFPLE9BQU87QUFFOUMsUUFBTSxXQUFXLE1BQU07QUFDdkIsYUFBVyxXQUFXLFVBQVU7QUFDL0IsUUFBSSxRQUFRLFNBQVMsU0FBUztBQUM3QixhQUFPLEVBQUUsT0FBTyxRQUFRLE9BQU8sYUFBYSxjQUFjLGVBQWUsS0FBSztBQUFBLElBQy9FLFdBQ1MsUUFBUSxVQUFVLFNBQVM7QUFDbkMsYUFBTyxFQUFFLE9BQU8sUUFBUSxPQUFPLGFBQWEsY0FBYyxlQUFlLE1BQU07QUFBQSxJQUNoRjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbInJ1bGUiLCAiZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlIiwgImVtYmVkZGVkTGFuZ3VhZ2VEYXRhIl0KfQo=
