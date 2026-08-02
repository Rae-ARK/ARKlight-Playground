import { CallbackIterable, compareBy } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Range } from "../../core/range.js";
import { ignoreBracketsInToken } from "../../languages/supports.js";
import { BracketsUtils } from "../../languages/supports/richEditBrackets.js";
import { BracketPairsTree } from "./bracketPairsTree/bracketPairsTree.js";
class BracketPairsTextModelPart extends Disposable {
  constructor(textModel, languageConfigurationService) {
    super();
    this.textModel = textModel;
    this.languageConfigurationService = languageConfigurationService;
    this.bracketPairsTree = this._register(new MutableDisposable());
    this.onDidChangeEmitter = this._register(new Emitter());
    this.onDidChange = this.onDidChangeEmitter.event;
    this.bracketsRequested = false;
  }
  get canBuildAST() {
    const maxSupportedDocumentLength = (
      /* max lines */
      5e4 * /* average column count */
      100
    );
    return this.textModel.getValueLength() <= maxSupportedDocumentLength;
  }
  //#region TextModel events
  handleLanguageConfigurationServiceChange(e) {
    if (!e.languageId || this.bracketPairsTree.value?.object.didLanguageChange(e.languageId)) {
      this.bracketPairsTree.clear();
      this.updateBracketPairsTree();
    }
  }
  handleDidChangeOptions(e) {
    this.bracketPairsTree.clear();
    this.updateBracketPairsTree();
  }
  handleDidChangeLanguage(e) {
    this.bracketPairsTree.clear();
    this.updateBracketPairsTree();
  }
  handleDidChangeContent(change) {
    this.bracketPairsTree.value?.object.handleContentChanged(change);
  }
  handleDidChangeBackgroundTokenizationState() {
    this.bracketPairsTree.value?.object.handleDidChangeBackgroundTokenizationState();
  }
  handleDidChangeTokens(e) {
    this.bracketPairsTree.value?.object.handleDidChangeTokens(e);
  }
  //#endregion
  updateBracketPairsTree() {
    if (this.bracketsRequested && this.canBuildAST) {
      if (!this.bracketPairsTree.value) {
        const store = new DisposableStore();
        this.bracketPairsTree.value = createDisposableRef(
          store.add(
            new BracketPairsTree(this.textModel, (languageId) => {
              return this.languageConfigurationService.getLanguageConfiguration(languageId);
            })
          ),
          store
        );
        store.add(this.bracketPairsTree.value.object.onDidChange((e) => this.onDidChangeEmitter.fire(e)));
        this.onDidChangeEmitter.fire();
      }
    } else {
      if (this.bracketPairsTree.value) {
        this.bracketPairsTree.clear();
        this.onDidChangeEmitter.fire();
      }
    }
  }
  /**
   * Returns all bracket pairs that intersect the given range.
   * The result is sorted by the start position.
  */
  getBracketPairsInRange(range) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, false) || CallbackIterable.empty;
  }
  getBracketPairsInRangeWithMinIndentation(range) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, true) || CallbackIterable.empty;
  }
  getBracketsInRange(range, onlyColorizedBrackets = false) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketsInRange(range, onlyColorizedBrackets) || CallbackIterable.empty;
  }
  findMatchingBracketUp(_bracket, _position, maxDuration) {
    const position = this.textModel.validatePosition(_position);
    const languageId = this.textModel.getLanguageIdAtPosition(position.lineNumber, position.column);
    if (this.canBuildAST) {
      const closingBracketInfo = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew.getClosingBracketInfo(_bracket);
      if (!closingBracketInfo) {
        return null;
      }
      const bracketPair = this.getBracketPairsInRange(Range.fromPositions(_position, _position)).findLast(
        (b) => closingBracketInfo.closes(b.openingBracketInfo)
      );
      if (bracketPair) {
        return bracketPair.openingBracketRange;
      }
      return null;
    } else {
      const bracket = _bracket.toLowerCase();
      const bracketsSupport = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
      if (!bracketsSupport) {
        return null;
      }
      const data = bracketsSupport.textIsBracket[bracket];
      if (!data) {
        return null;
      }
      return stripBracketSearchCanceled(this._findMatchingBracketUp(data, position, createTimeBasedContinueBracketSearchPredicate(maxDuration)));
    }
  }
  matchBracket(position, maxDuration) {
    if (this.canBuildAST) {
      const bracketPair = this.getBracketPairsInRange(
        Range.fromPositions(position, position)
      ).filter(
        (item) => item.closingBracketRange !== void 0 && (item.openingBracketRange.containsPosition(position) || item.closingBracketRange.containsPosition(position))
      ).findLastMaxBy(
        compareBy(
          (item) => item.openingBracketRange.containsPosition(position) ? item.openingBracketRange : item.closingBracketRange,
          Range.compareRangesUsingStarts
        )
      );
      if (bracketPair) {
        return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
      }
      return null;
    } else {
      const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
      return this._matchBracket(this.textModel.validatePosition(position), continueSearchPredicate);
    }
  }
  _establishBracketSearchOffsets(position, lineTokens, modeBrackets, tokenIndex) {
    const tokenCount = lineTokens.getCount();
    const currentLanguageId = lineTokens.getLanguageId(tokenIndex);
    let searchStartOffset = Math.max(0, position.column - 1 - modeBrackets.maxBracketLength);
    for (let i = tokenIndex - 1; i >= 0; i--) {
      const tokenEndOffset = lineTokens.getEndOffset(i);
      if (tokenEndOffset <= searchStartOffset) {
        break;
      }
      if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
        searchStartOffset = tokenEndOffset;
        break;
      }
    }
    let searchEndOffset = Math.min(lineTokens.getLineContent().length, position.column - 1 + modeBrackets.maxBracketLength);
    for (let i = tokenIndex + 1; i < tokenCount; i++) {
      const tokenStartOffset = lineTokens.getStartOffset(i);
      if (tokenStartOffset >= searchEndOffset) {
        break;
      }
      if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
        searchEndOffset = tokenStartOffset;
        break;
      }
    }
    return { searchStartOffset, searchEndOffset };
  }
  _matchBracket(position, continueSearchPredicate) {
    const lineNumber = position.lineNumber;
    const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
    const lineText = this.textModel.getLineContent(lineNumber);
    const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
    if (tokenIndex < 0) {
      return null;
    }
    const currentModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex)).brackets;
    if (currentModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {
      let { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, currentModeBrackets, tokenIndex);
      let bestResult = null;
      while (true) {
        const foundBracket = BracketsUtils.findNextBracketInRange(currentModeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!foundBracket) {
          break;
        }
        if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
          const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
          const r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
          if (r) {
            if (r instanceof BracketSearchCanceled) {
              return null;
            }
            bestResult = r;
          }
        }
        searchStartOffset = foundBracket.endColumn - 1;
      }
      if (bestResult) {
        return bestResult;
      }
    }
    if (tokenIndex > 0 && lineTokens.getStartOffset(tokenIndex) === position.column - 1) {
      const prevTokenIndex = tokenIndex - 1;
      const prevModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(prevTokenIndex)).brackets;
      if (prevModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(prevTokenIndex))) {
        const { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, prevModeBrackets, prevTokenIndex);
        const foundBracket = BracketsUtils.findPrevBracketInRange(prevModeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
          const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
          const r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
          if (r) {
            if (r instanceof BracketSearchCanceled) {
              return null;
            }
            return r;
          }
        }
      }
    }
    return null;
  }
  _matchFoundBracket(foundBracket, data, isOpen, continueSearchPredicate) {
    if (!data) {
      return null;
    }
    const matched = isOpen ? this._findMatchingBracketDown(data, foundBracket.getEndPosition(), continueSearchPredicate) : this._findMatchingBracketUp(data, foundBracket.getStartPosition(), continueSearchPredicate);
    if (!matched) {
      return null;
    }
    if (matched instanceof BracketSearchCanceled) {
      return matched;
    }
    return [foundBracket, matched];
  }
  _findMatchingBracketUp(bracket, position, continueSearchPredicate) {
    const languageId = bracket.languageId;
    const reversedBracketRegex = bracket.reversedRegex;
    let count = -1;
    let totalCallCount = 0;
    const searchPrevMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findPrevBracketInRange(reversedBracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        if (bracket.isOpen(hitText)) {
          count++;
        } else if (bracket.isClose(hitText)) {
          count--;
        }
        if (count === 0) {
          return r;
        }
        searchEndOffset = r.startColumn - 1;
      }
      return null;
    };
    for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = tokenCount - 1;
      let searchStartOffset = lineText.length;
      let searchEndOffset = lineText.length;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
      }
      let prevSearchInToken = true;
      for (; tokenIndex >= 0; tokenIndex--) {
        const searchInToken = lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return r;
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return r;
        }
      }
    }
    return null;
  }
  _findMatchingBracketDown(bracket, position, continueSearchPredicate) {
    const languageId = bracket.languageId;
    const bracketRegex = bracket.forwardRegex;
    let count = 1;
    let totalCallCount = 0;
    const searchNextMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findNextBracketInRange(bracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        if (bracket.isOpen(hitText)) {
          count++;
        } else if (bracket.isClose(hitText)) {
          count--;
        }
        if (count === 0) {
          return r;
        }
        searchStartOffset = r.endColumn - 1;
      }
      return null;
    };
    const lineCount = this.textModel.getLineCount();
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const searchInToken = lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return r;
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return r;
        }
      }
    }
    return null;
  }
  findPrevBracket(_position) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      this.bracketsRequested = true;
      this.updateBracketPairsTree();
      return this.bracketPairsTree.value?.object.getFirstBracketBefore(position) || null;
    }
    let languageId = null;
    let modeBrackets = null;
    let bracketConfig = null;
    for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = tokenCount - 1;
      let searchStartOffset = lineText.length;
      let searchEndOffset = lineText.length;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex >= 0; tokenIndex--) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (modeBrackets && bracketConfig && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return this._toFoundBracket(bracketConfig, r);
        }
      }
    }
    return null;
  }
  findNextBracket(_position) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      this.bracketsRequested = true;
      this.updateBracketPairsTree();
      return this.bracketPairsTree.value?.object.getFirstBracketAfter(position) || null;
    }
    const lineCount = this.textModel.getLineCount();
    let languageId = null;
    let modeBrackets = null;
    let bracketConfig = null;
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return this._toFoundBracket(bracketConfig, r);
        }
      }
    }
    return null;
  }
  findEnclosingBrackets(_position, maxDuration) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      const range = Range.fromPositions(position);
      const bracketPair = this.getBracketPairsInRange(Range.fromPositions(position, position)).findLast(
        (item) => item.closingBracketRange !== void 0 && item.range.strictContainsRange(range)
      );
      if (bracketPair) {
        return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
      }
      return null;
    }
    const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
    const lineCount = this.textModel.getLineCount();
    const savedCounts = /* @__PURE__ */ new Map();
    let counts = [];
    const resetCounts = (languageId2, modeBrackets2) => {
      if (!savedCounts.has(languageId2)) {
        const tmp = [];
        for (let i = 0, len = modeBrackets2 ? modeBrackets2.brackets.length : 0; i < len; i++) {
          tmp[i] = 0;
        }
        savedCounts.set(languageId2, tmp);
      }
      counts = savedCounts.get(languageId2);
    };
    let totalCallCount = 0;
    const searchInRange = (modeBrackets2, lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findNextBracketInRange(modeBrackets2.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        const bracket = modeBrackets2.textIsBracket[hitText];
        if (bracket) {
          if (bracket.isOpen(hitText)) {
            counts[bracket.index]++;
          } else if (bracket.isClose(hitText)) {
            counts[bracket.index]--;
          }
          if (counts[bracket.index] === -1) {
            return this._matchFoundBracket(r, bracket, false, continueSearchPredicate);
          }
        }
        searchStartOffset = r.endColumn - 1;
      }
      return null;
    };
    let languageId = null;
    let modeBrackets = null;
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          resetCounts(languageId, modeBrackets);
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return stripBracketSearchCanceled(r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          resetCounts(languageId, modeBrackets);
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return stripBracketSearchCanceled(r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return stripBracketSearchCanceled(r);
        }
      }
    }
    return null;
  }
  _toFoundBracket(bracketConfig, r) {
    if (!r) {
      return null;
    }
    let text = this.textModel.getValueInRange(r);
    text = text.toLowerCase();
    const bracketInfo = bracketConfig.getBracketInfo(text);
    if (!bracketInfo) {
      return null;
    }
    return {
      range: r,
      bracketInfo
    };
  }
}
function createDisposableRef(object, disposable) {
  return {
    object,
    dispose: () => disposable?.dispose()
  };
}
function createTimeBasedContinueBracketSearchPredicate(maxDuration) {
  if (typeof maxDuration === "undefined") {
    return () => true;
  } else {
    const startTime = Date.now();
    return () => {
      return Date.now() - startTime <= maxDuration;
    };
  }
}
const _BracketSearchCanceled = class _BracketSearchCanceled {
  constructor() {
    this._searchCanceledBrand = void 0;
  }
};
_BracketSearchCanceled.INSTANCE = new _BracketSearchCanceled();
let BracketSearchCanceled = _BracketSearchCanceled;
function stripBracketSearchCanceled(result) {
  if (result instanceof BracketSearchCanceled) {
    return null;
  }
  return result;
}
export {
  BracketPairsTextModelPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FsbGJhY2tJdGVyYWJsZSwgY29tcGFyZUJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpZ25vcmVCcmFja2V0c0luVG9rZW4gfSBmcm9tICcuLi8uLi9sYW5ndWFnZXMvc3VwcG9ydHMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9sYW5ndWFnZXMvc3VwcG9ydHMvbGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQnJhY2tldHNVdGlscywgUmljaEVkaXRCcmFja2V0LCBSaWNoRWRpdEJyYWNrZXRzIH0gZnJvbSAnLi4vLi4vbGFuZ3VhZ2VzL3N1cHBvcnRzL3JpY2hFZGl0QnJhY2tldHMuanMnO1xuaW1wb3J0IHsgQnJhY2tldFBhaXJzVHJlZSB9IGZyb20gJy4vYnJhY2tldFBhaXJzVHJlZS9icmFja2V0UGFpcnNUcmVlLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBCcmFja2V0SW5mbywgQnJhY2tldFBhaXJJbmZvLCBCcmFja2V0UGFpcldpdGhNaW5JbmRlbnRhdGlvbkluZm8sIElCcmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0LCBJRm91bmRCcmFja2V0IH0gZnJvbSAnLi4vLi4vdGV4dE1vZGVsQnJhY2tldFBhaXJzLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50LCBJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50LCBJTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uLy4uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcblxuZXhwb3J0IGNsYXNzIEJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJyYWNrZXRQYWlyc1RyZWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlZmVyZW5jZTxCcmFja2V0UGFpcnNUcmVlPj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBnZXQgY2FuQnVpbGRBU1QoKSB7XG5cdFx0Y29uc3QgbWF4U3VwcG9ydGVkRG9jdW1lbnRMZW5ndGggPSAvKiBtYXggbGluZXMgKi8gNTBfMDAwICogLyogYXZlcmFnZSBjb2x1bW4gY291bnQgKi8gMTAwO1xuXHRcdHJldHVybiB0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZUxlbmd0aCgpIDw9IG1heFN1cHBvcnRlZERvY3VtZW50TGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBicmFja2V0c1JlcXVlc3RlZCA9IGZhbHNlO1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbDogVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBUZXh0TW9kZWwgZXZlbnRzXG5cblx0cHVibGljIGhhbmRsZUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2UoZTogTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFlLmxhbmd1YWdlSWQgfHwgdGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuZGlkTGFuZ3VhZ2VDaGFuZ2UoZS5sYW5ndWFnZUlkKSkge1xuXHRcdFx0dGhpcy5icmFja2V0UGFpcnNUcmVlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlT3B0aW9ucyhlOiBJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5icmFja2V0UGFpcnNUcmVlLmNsZWFyKCk7XG5cdFx0dGhpcy51cGRhdGVCcmFja2V0UGFpcnNUcmVlKCk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlTGFuZ3VhZ2UoZTogSU1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUuY2xlYXIoKTtcblx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVEaWRDaGFuZ2VDb250ZW50KGNoYW5nZTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCkge1xuXHRcdHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmhhbmRsZUNvbnRlbnRDaGFuZ2VkKGNoYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlQmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmhhbmRsZURpZENoYW5nZUJhY2tncm91bmRUb2tlbml6YXRpb25TdGF0ZSgpO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZURpZENoYW5nZVRva2VucyhlOiBJTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWU/Lm9iamVjdC5oYW5kbGVEaWRDaGFuZ2VUb2tlbnMoZSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKSB7XG5cdFx0aWYgKHRoaXMuYnJhY2tldHNSZXF1ZXN0ZWQgJiYgdGhpcy5jYW5CdWlsZEFTVCkge1xuXHRcdFx0aWYgKCF0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWUpIHtcblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0dGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlID0gY3JlYXRlRGlzcG9zYWJsZVJlZihcblx0XHRcdFx0XHRzdG9yZS5hZGQoXG5cdFx0XHRcdFx0XHRuZXcgQnJhY2tldFBhaXJzVHJlZSh0aGlzLnRleHRNb2RlbCwgKGxhbmd1YWdlSWQpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0c3RvcmVcblx0XHRcdFx0KTtcblx0XHRcdFx0c3RvcmUuYWRkKHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZS5vYmplY3Qub25EaWRDaGFuZ2UoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKGUpKSk7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUuY2xlYXIoKTtcblx0XHRcdFx0Ly8gSW1wb3J0YW50OiBEb24ndCBjYWxsIGZpcmUgaWYgdGhlcmUgd2FzIG5vIGNoYW5nZSFcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFsbCBicmFja2V0IHBhaXJzIHRoYXQgaW50ZXJzZWN0IHRoZSBnaXZlbiByYW5nZS5cblx0ICogVGhlIHJlc3VsdCBpcyBzb3J0ZWQgYnkgdGhlIHN0YXJ0IHBvc2l0aW9uLlxuXHQqL1xuXHRwdWJsaWMgZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShyYW5nZTogUmFuZ2UpOiBDYWxsYmFja0l0ZXJhYmxlPEJyYWNrZXRQYWlySW5mbz4ge1xuXHRcdHRoaXMuYnJhY2tldHNSZXF1ZXN0ZWQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpO1xuXHRcdHJldHVybiB0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWU/Lm9iamVjdC5nZXRCcmFja2V0UGFpcnNJblJhbmdlKHJhbmdlLCBmYWxzZSkgfHwgQ2FsbGJhY2tJdGVyYWJsZS5lbXB0eTtcblx0fVxuXG5cdHB1YmxpYyBnZXRCcmFja2V0UGFpcnNJblJhbmdlV2l0aE1pbkluZGVudGF0aW9uKHJhbmdlOiBSYW5nZSk6IENhbGxiYWNrSXRlcmFibGU8QnJhY2tldFBhaXJXaXRoTWluSW5kZW50YXRpb25JbmZvPiB7XG5cdFx0dGhpcy5icmFja2V0c1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVCcmFja2V0UGFpcnNUcmVlKCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmdldEJyYWNrZXRQYWlyc0luUmFuZ2UocmFuZ2UsIHRydWUpIHx8IENhbGxiYWNrSXRlcmFibGUuZW1wdHk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QnJhY2tldHNJblJhbmdlKHJhbmdlOiBSYW5nZSwgb25seUNvbG9yaXplZEJyYWNrZXRzOiBib29sZWFuID0gZmFsc2UpOiBDYWxsYmFja0l0ZXJhYmxlPEJyYWNrZXRJbmZvPiB7XG5cdFx0dGhpcy5icmFja2V0c1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVCcmFja2V0UGFpcnNUcmVlKCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmdldEJyYWNrZXRzSW5SYW5nZShyYW5nZSwgb25seUNvbG9yaXplZEJyYWNrZXRzKSB8fCBDYWxsYmFja0l0ZXJhYmxlLmVtcHR5O1xuXHR9XG5cblx0cHVibGljIGZpbmRNYXRjaGluZ0JyYWNrZXRVcChfYnJhY2tldDogc3RyaW5nLCBfcG9zaXRpb246IElQb3NpdGlvbiwgbWF4RHVyYXRpb24/OiBudW1iZXIpOiBSYW5nZSB8IG51bGwge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy50ZXh0TW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXG5cdFx0aWYgKHRoaXMuY2FuQnVpbGRBU1QpIHtcblx0XHRcdGNvbnN0IGNsb3NpbmdCcmFja2V0SW5mbyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0XHQuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpXG5cdFx0XHRcdC5icmFja2V0c05ldy5nZXRDbG9zaW5nQnJhY2tldEluZm8oX2JyYWNrZXQpO1xuXG5cdFx0XHRpZiAoIWNsb3NpbmdCcmFja2V0SW5mbykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYnJhY2tldFBhaXIgPSB0aGlzLmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhfcG9zaXRpb24sIF9wb3NpdGlvbikpLmZpbmRMYXN0KChiKSA9PlxuXHRcdFx0XHRjbG9zaW5nQnJhY2tldEluZm8uY2xvc2VzKGIub3BlbmluZ0JyYWNrZXRJbmZvKVxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKGJyYWNrZXRQYWlyKSB7XG5cdFx0XHRcdHJldHVybiBicmFja2V0UGFpci5vcGVuaW5nQnJhY2tldFJhbmdlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZhbGxiYWNrIHRvIG9sZCBicmFja2V0IG1hdGNoaW5nIGNvZGU6XG5cdFx0XHRjb25zdCBicmFja2V0ID0gX2JyYWNrZXQudG9Mb3dlckNhc2UoKTtcblxuXHRcdFx0Y29uc3QgYnJhY2tldHNTdXBwb3J0ID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0cztcblxuXHRcdFx0aWYgKCFicmFja2V0c1N1cHBvcnQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBicmFja2V0c1N1cHBvcnQudGV4dElzQnJhY2tldFticmFja2V0XTtcblxuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gc3RyaXBCcmFja2V0U2VhcmNoQ2FuY2VsZWQodGhpcy5fZmluZE1hdGNoaW5nQnJhY2tldFVwKGRhdGEsIHBvc2l0aW9uLCBjcmVhdGVUaW1lQmFzZWRDb250aW51ZUJyYWNrZXRTZWFyY2hQcmVkaWNhdGUobWF4RHVyYXRpb24pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1hdGNoQnJhY2tldChwb3NpdGlvbjogSVBvc2l0aW9uLCBtYXhEdXJhdGlvbj86IG51bWJlcik6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuY2FuQnVpbGRBU1QpIHtcblx0XHRcdGNvbnN0IGJyYWNrZXRQYWlyID1cblx0XHRcdFx0dGhpcy5nZXRCcmFja2V0UGFpcnNJblJhbmdlKFxuXHRcdFx0XHRcdFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24sIHBvc2l0aW9uKVxuXHRcdFx0XHQpLmZpbHRlcihcblx0XHRcdFx0XHQoaXRlbSkgPT5cblx0XHRcdFx0XHRcdGl0ZW0uY2xvc2luZ0JyYWNrZXRSYW5nZSAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0XHQoaXRlbS5vcGVuaW5nQnJhY2tldFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pIHx8XG5cdFx0XHRcdFx0XHRcdGl0ZW0uY2xvc2luZ0JyYWNrZXRSYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSlcblx0XHRcdFx0KS5maW5kTGFzdE1heEJ5KFxuXHRcdFx0XHRcdGNvbXBhcmVCeShcblx0XHRcdFx0XHRcdChpdGVtKSA9PlxuXHRcdFx0XHRcdFx0XHRpdGVtLm9wZW5pbmdCcmFja2V0UmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbilcblx0XHRcdFx0XHRcdFx0XHQ/IGl0ZW0ub3BlbmluZ0JyYWNrZXRSYW5nZVxuXHRcdFx0XHRcdFx0XHRcdDogaXRlbS5jbG9zaW5nQnJhY2tldFJhbmdlLFxuXHRcdFx0XHRcdFx0UmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0aWYgKGJyYWNrZXRQYWlyKSB7XG5cdFx0XHRcdHJldHVybiBbYnJhY2tldFBhaXIub3BlbmluZ0JyYWNrZXRSYW5nZSwgYnJhY2tldFBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZSFdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZhbGxiYWNrIHRvIG9sZCBicmFja2V0IG1hdGNoaW5nIGNvZGU6XG5cdFx0XHRjb25zdCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSA9IGNyZWF0ZVRpbWVCYXNlZENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZShtYXhEdXJhdGlvbik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hCcmFja2V0KHRoaXMudGV4dE1vZGVsLnZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb24pLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXN0YWJsaXNoQnJhY2tldFNlYXJjaE9mZnNldHMocG9zaXRpb246IFBvc2l0aW9uLCBsaW5lVG9rZW5zOiBMaW5lVG9rZW5zLCBtb2RlQnJhY2tldHM6IFJpY2hFZGl0QnJhY2tldHMsIHRva2VuSW5kZXg6IG51bWJlcikge1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSBsaW5lVG9rZW5zLmdldENvdW50KCk7XG5cdFx0Y29uc3QgY3VycmVudExhbmd1YWdlSWQgPSBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCk7XG5cblx0XHQvLyBsaW1pdCBzZWFyY2ggdG8gbm90IGdvIGJlZm9yZSBgbWF4QnJhY2tldExlbmd0aGBcblx0XHRsZXQgc2VhcmNoU3RhcnRPZmZzZXQgPSBNYXRoLm1heCgwLCBwb3NpdGlvbi5jb2x1bW4gLSAxIC0gbW9kZUJyYWNrZXRzLm1heEJyYWNrZXRMZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSB0b2tlbkluZGV4IC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHRva2VuRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaSk7XG5cdFx0XHRpZiAodG9rZW5FbmRPZmZzZXQgPD0gc2VhcmNoU3RhcnRPZmZzZXQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUoaSkpIHx8IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZChpKSAhPT0gY3VycmVudExhbmd1YWdlSWQpIHtcblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSB0b2tlbkVuZE9mZnNldDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbGltaXQgc2VhcmNoIHRvIG5vdCBnbyBhZnRlciBgbWF4QnJhY2tldExlbmd0aGBcblx0XHRsZXQgc2VhcmNoRW5kT2Zmc2V0ID0gTWF0aC5taW4obGluZVRva2Vucy5nZXRMaW5lQ29udGVudCgpLmxlbmd0aCwgcG9zaXRpb24uY29sdW1uIC0gMSArIG1vZGVCcmFja2V0cy5tYXhCcmFja2V0TGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gdG9rZW5JbmRleCArIDE7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2VuU3RhcnRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KGkpO1xuXHRcdFx0aWYgKHRva2VuU3RhcnRPZmZzZXQgPj0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlnbm9yZUJyYWNrZXRzSW5Ub2tlbihsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKGkpKSB8fCBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQoaSkgIT09IGN1cnJlbnRMYW5ndWFnZUlkKSB7XG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHRva2VuU3RhcnRPZmZzZXQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQgfTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoQnJhY2tldChwb3NpdGlvbjogUG9zaXRpb24sIGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlOiBDb250aW51ZUJyYWNrZXRTZWFyY2hQcmVkaWNhdGUpOiBbUmFuZ2UsIFJhbmdlXSB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLnRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsaW5lVGV4dCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgdG9rZW5JbmRleCA9IGxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRpZiAodG9rZW5JbmRleCA8IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50TW9kZUJyYWNrZXRzID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCkpLmJyYWNrZXRzO1xuXG5cdFx0Ly8gY2hlY2sgdGhhdCB0aGUgdG9rZW4gaXMgbm90IHRvIGJlIGlnbm9yZWRcblx0XHRpZiAoY3VycmVudE1vZGVCcmFja2V0cyAmJiAhaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCkpKSB7XG5cblx0XHRcdGxldCB7IHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQgfSA9IHRoaXMuX2VzdGFibGlzaEJyYWNrZXRTZWFyY2hPZmZzZXRzKHBvc2l0aW9uLCBsaW5lVG9rZW5zLCBjdXJyZW50TW9kZUJyYWNrZXRzLCB0b2tlbkluZGV4KTtcblxuXHRcdFx0Ly8gaXQgbWlnaHQgYmUgdGhlIGNhc2UgdGhhdCBbY3VycmVudFRva2VuU3RhcnQgLT4gY3VycmVudFRva2VuRW5kXSBjb250YWlucyBtdWx0aXBsZSBicmFja2V0c1xuXHRcdFx0Ly8gYGJlc3RSZXN1bHRgIHdpbGwgY29udGFpbiB0aGUgbW9zdCByaWdodC1zaWRlIHJlc3VsdFxuXHRcdFx0bGV0IGJlc3RSZXN1bHQ6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBmb3VuZEJyYWNrZXQgPSBCcmFja2V0c1V0aWxzLmZpbmROZXh0QnJhY2tldEluUmFuZ2UoY3VycmVudE1vZGVCcmFja2V0cy5mb3J3YXJkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKCFmb3VuZEJyYWNrZXQpIHtcblx0XHRcdFx0XHQvLyB0aGVyZSBhcmUgbm8gbW9yZSBicmFja2V0cyBpbiB0aGlzIHRleHRcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNoZWNrIHRoYXQgd2UgZGlkbid0IGhpdCBhIGJyYWNrZXQgdG9vIGZhciBhd2F5IGZyb20gcG9zaXRpb25cblx0XHRcdFx0aWYgKGZvdW5kQnJhY2tldC5zdGFydENvbHVtbiA8PSBwb3NpdGlvbi5jb2x1bW4gJiYgcG9zaXRpb24uY29sdW1uIDw9IGZvdW5kQnJhY2tldC5lbmRDb2x1bW4pIHtcblx0XHRcdFx0XHRjb25zdCBmb3VuZEJyYWNrZXRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKGZvdW5kQnJhY2tldC5zdGFydENvbHVtbiAtIDEsIGZvdW5kQnJhY2tldC5lbmRDb2x1bW4gLSAxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdGNvbnN0IHIgPSB0aGlzLl9tYXRjaEZvdW5kQnJhY2tldChmb3VuZEJyYWNrZXQsIGN1cnJlbnRNb2RlQnJhY2tldHMudGV4dElzQnJhY2tldFtmb3VuZEJyYWNrZXRUZXh0XSwgY3VycmVudE1vZGVCcmFja2V0cy50ZXh0SXNPcGVuQnJhY2tldFtmb3VuZEJyYWNrZXRUZXh0XSwgY29udGludWVTZWFyY2hQcmVkaWNhdGUpO1xuXHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRpZiAociBpbnN0YW5jZW9mIEJyYWNrZXRTZWFyY2hDYW5jZWxlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJlc3RSZXN1bHQgPSByO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gZm91bmRCcmFja2V0LmVuZENvbHVtbiAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChiZXN0UmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBiZXN0UmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHBvc2l0aW9uIGlzIGluIGJldHdlZW4gdHdvIHRva2VucywgdHJ5IGFsc28gbG9va2luZyBpbiB0aGUgcHJldmlvdXMgdG9rZW5cblx0XHRpZiAodG9rZW5JbmRleCA+IDAgJiYgbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KSA9PT0gcG9zaXRpb24uY29sdW1uIC0gMSkge1xuXHRcdFx0Y29uc3QgcHJldlRva2VuSW5kZXggPSB0b2tlbkluZGV4IC0gMTtcblx0XHRcdGNvbnN0IHByZXZNb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZChwcmV2VG9rZW5JbmRleCkpLmJyYWNrZXRzO1xuXG5cdFx0XHQvLyBjaGVjayB0aGF0IHByZXZpb3VzIHRva2VuIGlzIG5vdCB0byBiZSBpZ25vcmVkXG5cdFx0XHRpZiAocHJldk1vZGVCcmFja2V0cyAmJiAhaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUocHJldlRva2VuSW5kZXgpKSkge1xuXG5cdFx0XHRcdGNvbnN0IHsgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCB9ID0gdGhpcy5fZXN0YWJsaXNoQnJhY2tldFNlYXJjaE9mZnNldHMocG9zaXRpb24sIGxpbmVUb2tlbnMsIHByZXZNb2RlQnJhY2tldHMsIHByZXZUb2tlbkluZGV4KTtcblxuXHRcdFx0XHRjb25zdCBmb3VuZEJyYWNrZXQgPSBCcmFja2V0c1V0aWxzLmZpbmRQcmV2QnJhY2tldEluUmFuZ2UocHJldk1vZGVCcmFja2V0cy5yZXZlcnNlZFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cblx0XHRcdFx0Ly8gY2hlY2sgdGhhdCB3ZSBkaWRuJ3QgaGl0IGEgYnJhY2tldCB0b28gZmFyIGF3YXkgZnJvbSBwb3NpdGlvblxuXHRcdFx0XHRpZiAoZm91bmRCcmFja2V0ICYmIGZvdW5kQnJhY2tldC5zdGFydENvbHVtbiA8PSBwb3NpdGlvbi5jb2x1bW4gJiYgcG9zaXRpb24uY29sdW1uIDw9IGZvdW5kQnJhY2tldC5lbmRDb2x1bW4pIHtcblx0XHRcdFx0XHRjb25zdCBmb3VuZEJyYWNrZXRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKGZvdW5kQnJhY2tldC5zdGFydENvbHVtbiAtIDEsIGZvdW5kQnJhY2tldC5lbmRDb2x1bW4gLSAxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdGNvbnN0IHIgPSB0aGlzLl9tYXRjaEZvdW5kQnJhY2tldChmb3VuZEJyYWNrZXQsIHByZXZNb2RlQnJhY2tldHMudGV4dElzQnJhY2tldFtmb3VuZEJyYWNrZXRUZXh0XSwgcHJldk1vZGVCcmFja2V0cy50ZXh0SXNPcGVuQnJhY2tldFtmb3VuZEJyYWNrZXRUZXh0XSwgY29udGludWVTZWFyY2hQcmVkaWNhdGUpO1xuXHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRpZiAociBpbnN0YW5jZW9mIEJyYWNrZXRTZWFyY2hDYW5jZWxlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hGb3VuZEJyYWNrZXQoZm91bmRCcmFja2V0OiBSYW5nZSwgZGF0YTogUmljaEVkaXRCcmFja2V0LCBpc09wZW46IGJvb2xlYW4sIGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlOiBDb250aW51ZUJyYWNrZXRTZWFyY2hQcmVkaWNhdGUpOiBbUmFuZ2UsIFJhbmdlXSB8IG51bGwgfCBCcmFja2V0U2VhcmNoQ2FuY2VsZWQge1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlZCA9IChcblx0XHRcdGlzT3BlblxuXHRcdFx0XHQ/IHRoaXMuX2ZpbmRNYXRjaGluZ0JyYWNrZXREb3duKGRhdGEsIGZvdW5kQnJhY2tldC5nZXRFbmRQb3NpdGlvbigpLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSlcblx0XHRcdFx0OiB0aGlzLl9maW5kTWF0Y2hpbmdCcmFja2V0VXAoZGF0YSwgZm91bmRCcmFja2V0LmdldFN0YXJ0UG9zaXRpb24oKSwgY29udGludWVTZWFyY2hQcmVkaWNhdGUpXG5cdFx0KTtcblxuXHRcdGlmICghbWF0Y2hlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKG1hdGNoZWQgaW5zdGFuY2VvZiBCcmFja2V0U2VhcmNoQ2FuY2VsZWQpIHtcblx0XHRcdHJldHVybiBtYXRjaGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBbZm91bmRCcmFja2V0LCBtYXRjaGVkXTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNYXRjaGluZ0JyYWNrZXRVcChicmFja2V0OiBSaWNoRWRpdEJyYWNrZXQsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGludWVTZWFyY2hQcmVkaWNhdGU6IENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSk6IFJhbmdlIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ19maW5kTWF0Y2hpbmdCcmFja2V0VXA6ICcsICdicmFja2V0OiAnLCBKU09OLnN0cmluZ2lmeShicmFja2V0KSwgJ3N0YXJ0UG9zaXRpb246ICcsIFN0cmluZyhwb3NpdGlvbikpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGJyYWNrZXQubGFuZ3VhZ2VJZDtcblx0XHRjb25zdCByZXZlcnNlZEJyYWNrZXRSZWdleCA9IGJyYWNrZXQucmV2ZXJzZWRSZWdleDtcblx0XHRsZXQgY291bnQgPSAtMTtcblxuXHRcdGxldCB0b3RhbENhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VhcmNoUHJldk1hdGNoaW5nQnJhY2tldEluUmFuZ2UgPSAobGluZU51bWJlcjogbnVtYmVyLCBsaW5lVGV4dDogc3RyaW5nLCBzZWFyY2hTdGFydE9mZnNldDogbnVtYmVyLCBzZWFyY2hFbmRPZmZzZXQ6IG51bWJlcik6IFJhbmdlIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCA9PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRpZiAoY29udGludWVTZWFyY2hQcmVkaWNhdGUgJiYgKCsrdG90YWxDYWxsQ291bnQpICUgMTAwID09PSAwICYmICFjb250aW51ZVNlYXJjaFByZWRpY2F0ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEJyYWNrZXRTZWFyY2hDYW5jZWxlZC5JTlNUQU5DRTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByID0gQnJhY2tldHNVdGlscy5maW5kUHJldkJyYWNrZXRJblJhbmdlKHJldmVyc2VkQnJhY2tldFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdGlmICghcikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGl0VGV4dCA9IGxpbmVUZXh0LnN1YnN0cmluZyhyLnN0YXJ0Q29sdW1uIC0gMSwgci5lbmRDb2x1bW4gLSAxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAoYnJhY2tldC5pc09wZW4oaGl0VGV4dCkpIHtcblx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJyYWNrZXQuaXNDbG9zZShoaXRUZXh0KSkge1xuXHRcdFx0XHRcdGNvdW50LS07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHIuc3RhcnRDb2x1bW4gLSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPj0gMTsgbGluZU51bWJlci0tKSB7XG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gdGhpcy50ZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB0b2tlbkNvdW50ID0gbGluZVRva2Vucy5nZXRDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblxuXHRcdFx0bGV0IHRva2VuSW5kZXggPSB0b2tlbkNvdW50IC0gMTtcblx0XHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdGxldCBzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVGV4dC5sZW5ndGg7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHR0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBwcmV2U2VhcmNoSW5Ub2tlbiA9IHRydWU7XG5cdFx0XHRmb3IgKDsgdG9rZW5JbmRleCA+PSAwOyB0b2tlbkluZGV4LS0pIHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoSW5Ub2tlbiA9IChsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCkgPT09IGxhbmd1YWdlSWQgJiYgIWlnbm9yZUJyYWNrZXRzSW5Ub2tlbihsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXgpKSk7XG5cblx0XHRcdFx0aWYgKHNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZCwgc2ltcGx5IGV4dGVuZCBzZWFyY2hTdGFydE9mZnNldFxuXHRcdFx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gc2VhcmNoUHJldk1hdGNoaW5nQnJhY2tldEluUmFuZ2UobGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJldlNlYXJjaEluVG9rZW4gPSBzZWFyY2hJblRva2VuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRjb25zdCByID0gc2VhcmNoUHJldk1hdGNoaW5nQnJhY2tldEluUmFuZ2UobGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWF0Y2hpbmdCcmFja2V0RG93bihicmFja2V0OiBSaWNoRWRpdEJyYWNrZXQsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGludWVTZWFyY2hQcmVkaWNhdGU6IENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSk6IFJhbmdlIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCB7XG5cdFx0Ly8gY29uc29sZS5sb2coJ19maW5kTWF0Y2hpbmdCcmFja2V0RG93bjogJywgJ2JyYWNrZXQ6ICcsIEpTT04uc3RyaW5naWZ5KGJyYWNrZXQpLCAnc3RhcnRQb3NpdGlvbjogJywgU3RyaW5nKHBvc2l0aW9uKSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gYnJhY2tldC5sYW5ndWFnZUlkO1xuXHRcdGNvbnN0IGJyYWNrZXRSZWdleCA9IGJyYWNrZXQuZm9yd2FyZFJlZ2V4O1xuXHRcdGxldCBjb3VudCA9IDE7XG5cblx0XHRsZXQgdG90YWxDYWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IHNlYXJjaE5leHRNYXRjaGluZ0JyYWNrZXRJblJhbmdlID0gKGxpbmVOdW1iZXI6IG51bWJlciwgbGluZVRleHQ6IHN0cmluZywgc2VhcmNoU3RhcnRPZmZzZXQ6IG51bWJlciwgc2VhcmNoRW5kT2Zmc2V0OiBudW1iZXIpOiBSYW5nZSB8IG51bGwgfCBCcmFja2V0U2VhcmNoQ2FuY2VsZWQgPT4ge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlICYmICgrK3RvdGFsQ2FsbENvdW50KSAlIDEwMCA9PT0gMCAmJiAhY29udGludWVTZWFyY2hQcmVkaWNhdGUoKSkge1xuXHRcdFx0XHRcdHJldHVybiBCcmFja2V0U2VhcmNoQ2FuY2VsZWQuSU5TVEFOQ0U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZE5leHRCcmFja2V0SW5SYW5nZShicmFja2V0UmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKCFyKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBoaXRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKHIuc3RhcnRDb2x1bW4gLSAxLCByLmVuZENvbHVtbiAtIDEpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChicmFja2V0LmlzT3BlbihoaXRUZXh0KSkge1xuXHRcdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnJhY2tldC5pc0Nsb3NlKGhpdFRleHQpKSB7XG5cdFx0XHRcdFx0Y291bnQtLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSByLmVuZENvbHVtbiAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH07XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdGxldCB0b2tlbkluZGV4ID0gMDtcblx0XHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IDA7XG5cdFx0XHRsZXQgc2VhcmNoRW5kT2Zmc2V0ID0gMDtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZXZTZWFyY2hJblRva2VuID0gdHJ1ZTtcblx0XHRcdGZvciAoOyB0b2tlbkluZGV4IDwgdG9rZW5Db3VudDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaEluVG9rZW4gPSAobGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKHRva2VuSW5kZXgpID09PSBsYW5ndWFnZUlkICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KSkpO1xuXG5cdFx0XHRcdGlmIChzZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWQsIHNpbXBseSBleHRlbmQgc2VhcmNoRW5kT2Zmc2V0XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IHNlYXJjaE5leHRNYXRjaGluZ0JyYWNrZXRJblJhbmdlKGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZTZWFyY2hJblRva2VuID0gc2VhcmNoSW5Ub2tlbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0Y29uc3QgciA9IHNlYXJjaE5leHRNYXRjaGluZ0JyYWNrZXRJblJhbmdlKGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGZpbmRQcmV2QnJhY2tldChfcG9zaXRpb246IElQb3NpdGlvbik6IElGb3VuZEJyYWNrZXQgfCBudWxsIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMudGV4dE1vZGVsLnZhbGlkYXRlUG9zaXRpb24oX3Bvc2l0aW9uKTtcblxuXHRcdGlmICh0aGlzLmNhbkJ1aWxkQVNUKSB7XG5cdFx0XHR0aGlzLmJyYWNrZXRzUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmdldEZpcnN0QnJhY2tldEJlZm9yZShwb3NpdGlvbikgfHwgbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IG1vZGVCcmFja2V0czogUmljaEVkaXRCcmFja2V0cyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBicmFja2V0Q29uZmlnOiBMYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyOyBsaW5lTnVtYmVyID49IDE7IGxpbmVOdW1iZXItLSkge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdGxldCB0b2tlbkluZGV4ID0gdG9rZW5Db3VudCAtIDE7XG5cdFx0XHRsZXQgc2VhcmNoU3RhcnRPZmZzZXQgPSBsaW5lVGV4dC5sZW5ndGg7XG5cdFx0XHRsZXQgc2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0dG9rZW5JbmRleCA9IGxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdFx0XHRjb25zdCB0b2tlbkxhbmd1YWdlSWQgPSBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCk7XG5cdFx0XHRcdGlmIChsYW5ndWFnZUlkICE9PSB0b2tlbkxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHRsYW5ndWFnZUlkID0gdG9rZW5MYW5ndWFnZUlkO1xuXHRcdFx0XHRcdG1vZGVCcmFja2V0cyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHM7XG5cdFx0XHRcdFx0YnJhY2tldENvbmZpZyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHNOZXc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZXZTZWFyY2hJblRva2VuID0gdHJ1ZTtcblx0XHRcdGZvciAoOyB0b2tlbkluZGV4ID49IDA7IHRva2VuSW5kZXgtLSkge1xuXHRcdFx0XHRjb25zdCB0b2tlbkxhbmd1YWdlSWQgPSBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCk7XG5cblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdC8vIGxhbmd1YWdlIGlkIGNoYW5nZSFcblx0XHRcdFx0XHRpZiAobW9kZUJyYWNrZXRzICYmIGJyYWNrZXRDb25maWcgJiYgcHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZFByZXZCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMucmV2ZXJzZWRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWcsIHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHJldlNlYXJjaEluVG9rZW4gPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRva2VuTGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRtb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXHRcdFx0XHRcdGJyYWNrZXRDb25maWcgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzTmV3O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2VhcmNoSW5Ub2tlbiA9ICghIW1vZGVCcmFja2V0cyAmJiAhaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCkpKTtcblxuXHRcdFx0XHRpZiAoc2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkLCBzaW1wbHkgZXh0ZW5kIHNlYXJjaFN0YXJ0T2Zmc2V0XG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKGJyYWNrZXRDb25maWcgJiYgbW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmRQcmV2QnJhY2tldEluUmFuZ2UobW9kZUJyYWNrZXRzLnJldmVyc2VkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl90b0ZvdW5kQnJhY2tldChicmFja2V0Q29uZmlnLCByKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IHNlYXJjaEluVG9rZW47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChicmFja2V0Q29uZmlnICYmIG1vZGVCcmFja2V0cyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmRQcmV2QnJhY2tldEluUmFuZ2UobW9kZUJyYWNrZXRzLnJldmVyc2VkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9Gb3VuZEJyYWNrZXQoYnJhY2tldENvbmZpZywgcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBmaW5kTmV4dEJyYWNrZXQoX3Bvc2l0aW9uOiBJUG9zaXRpb24pOiBJRm91bmRCcmFja2V0IHwgbnVsbCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLnRleHRNb2RlbC52YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cblx0XHRpZiAodGhpcy5jYW5CdWlsZEFTVCkge1xuXHRcdFx0dGhpcy5icmFja2V0c1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0XHRcdHJldHVybiB0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWU/Lm9iamVjdC5nZXRGaXJzdEJyYWNrZXRBZnRlcihwb3NpdGlvbikgfHwgbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGxldCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgbW9kZUJyYWNrZXRzOiBSaWNoRWRpdEJyYWNrZXRzIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGJyYWNrZXRDb25maWc6IExhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLnRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHRva2VuQ291bnQgPSBsaW5lVG9rZW5zLmdldENvdW50KCk7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXG5cdFx0XHRsZXQgdG9rZW5JbmRleCA9IDA7XG5cdFx0XHRsZXQgc2VhcmNoU3RhcnRPZmZzZXQgPSAwO1xuXHRcdFx0bGV0IHNlYXJjaEVuZE9mZnNldCA9IDA7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHR0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdGNvbnN0IHRva2VuTGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdGxhbmd1YWdlSWQgPSB0b2tlbkxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0bW9kZUJyYWNrZXRzID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0cztcblx0XHRcdFx0XHRicmFja2V0Q29uZmlnID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0c05ldztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcHJldlNlYXJjaEluVG9rZW4gPSB0cnVlO1xuXHRcdFx0Zm9yICg7IHRva2VuSW5kZXggPCB0b2tlbkNvdW50OyB0b2tlbkluZGV4KyspIHtcblx0XHRcdFx0Y29uc3QgdG9rZW5MYW5ndWFnZUlkID0gbGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKHRva2VuSW5kZXgpO1xuXG5cdFx0XHRcdGlmIChsYW5ndWFnZUlkICE9PSB0b2tlbkxhbmd1YWdlSWQpIHtcblx0XHRcdFx0XHQvLyBsYW5ndWFnZSBpZCBjaGFuZ2UhXG5cdFx0XHRcdFx0aWYgKGJyYWNrZXRDb25maWcgJiYgbW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmROZXh0QnJhY2tldEluUmFuZ2UobW9kZUJyYWNrZXRzLmZvcndhcmRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWcsIHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHJldlNlYXJjaEluVG9rZW4gPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRva2VuTGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRtb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXHRcdFx0XHRcdGJyYWNrZXRDb25maWcgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzTmV3O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2VhcmNoSW5Ub2tlbiA9ICghIW1vZGVCcmFja2V0cyAmJiAhaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCkpKTtcblx0XHRcdFx0aWYgKHNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZCwgc2ltcGx5IGV4dGVuZCBzZWFyY2hFbmRPZmZzZXRcblx0XHRcdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChicmFja2V0Q29uZmlnICYmIG1vZGVCcmFja2V0cyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gQnJhY2tldHNVdGlscy5maW5kTmV4dEJyYWNrZXRJblJhbmdlKG1vZGVCcmFja2V0cy5mb3J3YXJkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl90b0ZvdW5kQnJhY2tldChicmFja2V0Q29uZmlnLCByKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IHNlYXJjaEluVG9rZW47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChicmFja2V0Q29uZmlnICYmIG1vZGVCcmFja2V0cyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmROZXh0QnJhY2tldEluUmFuZ2UobW9kZUJyYWNrZXRzLmZvcndhcmRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl90b0ZvdW5kQnJhY2tldChicmFja2V0Q29uZmlnLCByKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGZpbmRFbmNsb3NpbmdCcmFja2V0cyhfcG9zaXRpb246IElQb3NpdGlvbiwgbWF4RHVyYXRpb24/OiBudW1iZXIpOiBbUmFuZ2UsIFJhbmdlXSB8IG51bGwge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy50ZXh0TW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXG5cdFx0aWYgKHRoaXMuY2FuQnVpbGRBU1QpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBicmFja2V0UGFpciA9XG5cdFx0XHRcdHRoaXMuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uLCBwb3NpdGlvbikpLmZpbmRMYXN0KFxuXHRcdFx0XHRcdChpdGVtKSA9PiBpdGVtLmNsb3NpbmdCcmFja2V0UmFuZ2UgIT09IHVuZGVmaW5lZCAmJiBpdGVtLnJhbmdlLnN0cmljdENvbnRhaW5zUmFuZ2UocmFuZ2UpXG5cdFx0XHRcdCk7XG5cdFx0XHRpZiAoYnJhY2tldFBhaXIpIHtcblx0XHRcdFx0cmV0dXJuIFticmFja2V0UGFpci5vcGVuaW5nQnJhY2tldFJhbmdlLCBicmFja2V0UGFpci5jbG9zaW5nQnJhY2tldFJhbmdlIV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSA9IGNyZWF0ZVRpbWVCYXNlZENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZShtYXhEdXJhdGlvbik7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3Qgc2F2ZWRDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyW10+KCk7XG5cblx0XHRsZXQgY291bnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc2V0Q291bnRzID0gKGxhbmd1YWdlSWQ6IHN0cmluZywgbW9kZUJyYWNrZXRzOiBSaWNoRWRpdEJyYWNrZXRzIHwgbnVsbCkgPT4ge1xuXHRcdFx0aWYgKCFzYXZlZENvdW50cy5oYXMobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdFx0Y29uc3QgdG1wID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBtb2RlQnJhY2tldHMgPyBtb2RlQnJhY2tldHMuYnJhY2tldHMubGVuZ3RoIDogMDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0dG1wW2ldID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzYXZlZENvdW50cy5zZXQobGFuZ3VhZ2VJZCwgdG1wKTtcblx0XHRcdH1cblx0XHRcdGNvdW50cyA9IHNhdmVkQ291bnRzLmdldChsYW5ndWFnZUlkKSE7XG5cdFx0fTtcblxuXHRcdGxldCB0b3RhbENhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VhcmNoSW5SYW5nZSA9IChtb2RlQnJhY2tldHM6IFJpY2hFZGl0QnJhY2tldHMsIGxpbmVOdW1iZXI6IG51bWJlciwgbGluZVRleHQ6IHN0cmluZywgc2VhcmNoU3RhcnRPZmZzZXQ6IG51bWJlciwgc2VhcmNoRW5kT2Zmc2V0OiBudW1iZXIpOiBbUmFuZ2UsIFJhbmdlXSB8IG51bGwgfCBCcmFja2V0U2VhcmNoQ2FuY2VsZWQgPT4ge1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0aWYgKGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlICYmICgrK3RvdGFsQ2FsbENvdW50KSAlIDEwMCA9PT0gMCAmJiAhY29udGludWVTZWFyY2hQcmVkaWNhdGUoKSkge1xuXHRcdFx0XHRcdHJldHVybiBCcmFja2V0U2VhcmNoQ2FuY2VsZWQuSU5TVEFOQ0U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZE5leHRCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMuZm9yd2FyZFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdGlmICghcikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGl0VGV4dCA9IGxpbmVUZXh0LnN1YnN0cmluZyhyLnN0YXJ0Q29sdW1uIC0gMSwgci5lbmRDb2x1bW4gLSAxKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBicmFja2V0ID0gbW9kZUJyYWNrZXRzLnRleHRJc0JyYWNrZXRbaGl0VGV4dF07XG5cdFx0XHRcdGlmIChicmFja2V0KSB7XG5cdFx0XHRcdFx0aWYgKGJyYWNrZXQuaXNPcGVuKGhpdFRleHQpKSB7XG5cdFx0XHRcdFx0XHRjb3VudHNbYnJhY2tldC5pbmRleF0rKztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGJyYWNrZXQuaXNDbG9zZShoaXRUZXh0KSkge1xuXHRcdFx0XHRcdFx0Y291bnRzW2JyYWNrZXQuaW5kZXhdLS07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGNvdW50c1ticmFja2V0LmluZGV4XSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9tYXRjaEZvdW5kQnJhY2tldChyLCBicmFja2V0LCBmYWxzZSwgY29udGludWVTZWFyY2hQcmVkaWNhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gci5lbmRDb2x1bW4gLSAxO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fTtcblxuXHRcdGxldCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgbW9kZUJyYWNrZXRzOiBSaWNoRWRpdEJyYWNrZXRzIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLnRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHRva2VuQ291bnQgPSBsaW5lVG9rZW5zLmdldENvdW50KCk7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXG5cdFx0XHRsZXQgdG9rZW5JbmRleCA9IDA7XG5cdFx0XHRsZXQgc2VhcmNoU3RhcnRPZmZzZXQgPSAwO1xuXHRcdFx0bGV0IHNlYXJjaEVuZE9mZnNldCA9IDA7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHR0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdGNvbnN0IHRva2VuTGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdGxhbmd1YWdlSWQgPSB0b2tlbkxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0bW9kZUJyYWNrZXRzID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0cztcblx0XHRcdFx0XHRyZXNldENvdW50cyhsYW5ndWFnZUlkLCBtb2RlQnJhY2tldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBwcmV2U2VhcmNoSW5Ub2tlbiA9IHRydWU7XG5cdFx0XHRmb3IgKDsgdG9rZW5JbmRleCA8IHRva2VuQ291bnQ7IHRva2VuSW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCB0b2tlbkxhbmd1YWdlSWQgPSBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCk7XG5cblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdC8vIGxhbmd1YWdlIGlkIGNoYW5nZSFcblx0XHRcdFx0XHRpZiAobW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBzZWFyY2hJblJhbmdlKG1vZGVCcmFja2V0cywgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHN0cmlwQnJhY2tldFNlYXJjaENhbmNlbGVkKHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cHJldlNlYXJjaEluVG9rZW4gPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRva2VuTGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRtb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXHRcdFx0XHRcdHJlc2V0Q291bnRzKGxhbmd1YWdlSWQsIG1vZGVCcmFja2V0cyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZWFyY2hJblRva2VuID0gKCEhbW9kZUJyYWNrZXRzICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KSkpO1xuXHRcdFx0XHRpZiAoc2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkLCBzaW1wbHkgZXh0ZW5kIHNlYXJjaEVuZE9mZnNldFxuXHRcdFx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKG1vZGVCcmFja2V0cyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gc2VhcmNoSW5SYW5nZShtb2RlQnJhY2tldHMsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzdHJpcEJyYWNrZXRTZWFyY2hDYW5jZWxlZChyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IHNlYXJjaEluVG9rZW47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlQnJhY2tldHMgJiYgcHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRjb25zdCByID0gc2VhcmNoSW5SYW5nZShtb2RlQnJhY2tldHMsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RyaXBCcmFja2V0U2VhcmNoQ2FuY2VsZWQocik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWc6IExhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uLCByOiBSYW5nZSk6IElGb3VuZEJyYWNrZXQgfCBudWxsIHtcblx0XHRpZiAoIXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCB0ZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKHIpO1xuXHRcdHRleHQgPSB0ZXh0LnRvTG93ZXJDYXNlKCk7XG5cblx0XHRjb25zdCBicmFja2V0SW5mbyA9IGJyYWNrZXRDb25maWcuZ2V0QnJhY2tldEluZm8odGV4dCk7XG5cdFx0aWYgKCFicmFja2V0SW5mbykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiByLFxuXHRcdFx0YnJhY2tldEluZm9cblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURpc3Bvc2FibGVSZWY8VD4ob2JqZWN0OiBULCBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGUpOiBJUmVmZXJlbmNlPFQ+IHtcblx0cmV0dXJuIHtcblx0XHRvYmplY3QsXG5cdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZT8uZGlzcG9zZSgpLFxuXHR9O1xufVxuXG50eXBlIENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSA9ICgoKSA9PiBib29sZWFuKTtcblxuZnVuY3Rpb24gY3JlYXRlVGltZUJhc2VkQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlKG1heER1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQpOiBDb250aW51ZUJyYWNrZXRTZWFyY2hQcmVkaWNhdGUge1xuXHRpZiAodHlwZW9mIG1heER1cmF0aW9uID09PSAndW5kZWZpbmVkJykge1xuXHRcdHJldHVybiAoKSA9PiB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdHJldHVybiAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA8PSBtYXhEdXJhdGlvbik7XG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBCcmFja2V0U2VhcmNoQ2FuY2VsZWQge1xuXHRwdWJsaWMgc3RhdGljIElOU1RBTkNFID0gbmV3IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCgpO1xuXHRfc2VhcmNoQ2FuY2VsZWRCcmFuZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHsgfVxufVxuXG5mdW5jdGlvbiBzdHJpcEJyYWNrZXRTZWFyY2hDYW5jZWxlZDxUPihyZXN1bHQ6IFQgfCBudWxsIHwgQnJhY2tldFNlYXJjaENhbmNlbGVkKTogVCB8IG51bGwge1xuXHRpZiAocmVzdWx0IGluc3RhbmNlb2YgQnJhY2tldFNlYXJjaENhbmNlbGVkKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCLGlCQUFpQjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUEwQyx5QkFBeUI7QUFFeEYsU0FBUyxhQUFhO0FBRXRCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMscUJBQXdEO0FBQ2pFLFNBQVMsd0JBQXdCO0FBTTFCLE1BQU0sa0NBQWtDLFdBQWlEO0FBQUEsRUFheEYsWUFDVyxXQUNBLDhCQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBZGxCLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxrQkFBZ0QsQ0FBQztBQUV4RyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQWdCLGNBQWMsS0FBSyxtQkFBbUI7QUFPdEQsU0FBUSxvQkFBb0I7QUFBQSxFQU81QjtBQUFBLEVBWkEsSUFBWSxjQUFjO0FBQ3pCLFVBQU07QUFBQTtBQUFBLE1BQTZDO0FBQUEsTUFBb0M7QUFBQTtBQUN2RixXQUFPLEtBQUssVUFBVSxlQUFlLEtBQUs7QUFBQSxFQUMzQztBQUFBO0FBQUEsRUFhTyx5Q0FBeUMsR0FBa0Q7QUFDakcsUUFBSSxDQUFDLEVBQUUsY0FBYyxLQUFLLGlCQUFpQixPQUFPLE9BQU8sa0JBQWtCLEVBQUUsVUFBVSxHQUFHO0FBQ3pGLFdBQUssaUJBQWlCLE1BQU07QUFDNUIsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLHVCQUF1QixHQUFvQztBQUNqRSxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVPLHdCQUF3QixHQUFxQztBQUNuRSxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVPLHVCQUF1QixRQUFtQztBQUNoRSxTQUFLLGlCQUFpQixPQUFPLE9BQU8s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
