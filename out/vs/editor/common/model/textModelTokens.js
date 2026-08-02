import { runWhenGlobalIdle } from "../../../base/common/async.js";
import { BugIndicatingError, onUnexpectedError } from "../../../base/common/errors.js";
import { setTimeout0 } from "../../../base/common/platform.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { LineRange } from "../core/ranges/lineRange.js";
import { OffsetRange } from "../core/ranges/offsetRange.js";
import { StandardTokenType } from "../encodedTokenAttributes.js";
import { nullTokenizeEncoded } from "../languages/nullTokenize.js";
import { FixedArray } from "./fixedArray.js";
import { ContiguousMultilineTokensBuilder } from "../tokens/contiguousMultilineTokensBuilder.js";
import { LineTokens } from "../tokens/lineTokens.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["CHEAP_TOKENIZATION_LENGTH_LIMIT"] = 2048] = "CHEAP_TOKENIZATION_LENGTH_LIMIT";
  return Constants2;
})(Constants || {});
class TokenizerWithStateStore {
  constructor(lineCount, tokenizationSupport) {
    this.tokenizationSupport = tokenizationSupport;
    this.initialState = this.tokenizationSupport.getInitialState();
    this.store = new TrackingTokenizationStateStore(lineCount);
  }
  getStartState(lineNumber) {
    return this.store.getStartState(lineNumber, this.initialState);
  }
  getFirstInvalidLine() {
    return this.store.getFirstInvalidLine(this.initialState);
  }
}
class TokenizerWithStateStoreAndTextModel extends TokenizerWithStateStore {
  constructor(lineCount, tokenizationSupport, _textModel, _languageIdCodec) {
    super(lineCount, tokenizationSupport);
    this._textModel = _textModel;
    this._languageIdCodec = _languageIdCodec;
  }
  updateTokensUntilLine(builder, lineNumber) {
    const languageId = this._textModel.getLanguageId();
    while (true) {
      const lineToTokenize = this.getFirstInvalidLine();
      if (!lineToTokenize || lineToTokenize.lineNumber > lineNumber) {
        break;
      }
      const text = this._textModel.getLineContent(lineToTokenize.lineNumber);
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineToTokenize.startState);
      builder.add(lineToTokenize.lineNumber, r.tokens);
      this.store.setEndState(lineToTokenize.lineNumber, r.endState);
    }
  }
  /** assumes state is up to date */
  getTokenTypeIfInsertingCharacter(position, character) {
    const lineStartState = this.getStartState(position.lineNumber);
    if (!lineStartState) {
      return StandardTokenType.Other;
    }
    const languageId = this._textModel.getLanguageId();
    const lineContent = this._textModel.getLineContent(position.lineNumber);
    const text = lineContent.substring(0, position.column - 1) + character + lineContent.substring(position.column - 1);
    const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineStartState);
    const lineTokens = new LineTokens(r.tokens, text, this._languageIdCodec);
    if (lineTokens.getCount() === 0) {
      return StandardTokenType.Other;
    }
    const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
    return lineTokens.getStandardTokenType(tokenIndex);
  }
  /** assumes state is up to date */
  tokenizeLinesAt(lineNumber, lines) {
    const lineStartState = this.getStartState(lineNumber);
    if (!lineStartState) {
      return null;
    }
    const languageId = this._textModel.getLanguageId();
    const result = [];
    let state = lineStartState;
    for (const line of lines) {
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, true, state);
      result.push(new LineTokens(r.tokens, line, this._languageIdCodec));
      state = r.endState;
    }
    return result;
  }
  hasAccurateTokensForLine(lineNumber) {
    const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
    return lineNumber < firstInvalidLineNumber;
  }
  isCheapToTokenize(lineNumber) {
    const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
    if (lineNumber < firstInvalidLineNumber) {
      return true;
    }
    if (lineNumber === firstInvalidLineNumber && this._textModel.getLineLength(lineNumber) < 2048 /* CHEAP_TOKENIZATION_LENGTH_LIMIT */) {
      return true;
    }
    return false;
  }
  /**
   * The result is not cached.
   */
  tokenizeHeuristically(builder, startLineNumber, endLineNumber) {
    if (endLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
      return { heuristicTokens: false };
    }
    if (startLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
      this.updateTokensUntilLine(builder, endLineNumber);
      return { heuristicTokens: false };
    }
    let state = this.guessStartState(startLineNumber);
    const languageId = this._textModel.getLanguageId();
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const text = this._textModel.getLineContent(lineNumber);
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, state);
      builder.add(lineNumber, r.tokens);
      state = r.endState;
    }
    return { heuristicTokens: true };
  }
  guessStartState(lineNumber) {
    let { likelyRelevantLines, initialState } = findLikelyRelevantLines(this._textModel, lineNumber, this);
    if (!initialState) {
      initialState = this.tokenizationSupport.getInitialState();
    }
    const languageId = this._textModel.getLanguageId();
    let state = initialState;
    for (const line of likelyRelevantLines) {
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, false, state);
      state = r.endState;
    }
    return state;
  }
}
function findLikelyRelevantLines(model, lineNumber, store) {
  let nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
  const likelyRelevantLines = [];
  let initialState = null;
  for (let i = lineNumber - 1; nonWhitespaceColumn > 1 && i >= 1; i--) {
    const newNonWhitespaceIndex = model.getLineFirstNonWhitespaceColumn(i);
    if (newNonWhitespaceIndex === 0) {
      continue;
    }
    if (newNonWhitespaceIndex < nonWhitespaceColumn) {
      likelyRelevantLines.push(model.getLineContent(i));
      nonWhitespaceColumn = newNonWhitespaceIndex;
      initialState = store?.getStartState(i);
      if (initialState) {
        break;
      }
    }
  }
  likelyRelevantLines.reverse();
  return { likelyRelevantLines, initialState: initialState ?? void 0 };
}
class TrackingTokenizationStateStore {
  constructor(lineCount) {
    this.lineCount = lineCount;
    this._tokenizationStateStore = new TokenizationStateStore();
    this._invalidEndStatesLineNumbers = new RangePriorityQueueImpl();
    this._invalidEndStatesLineNumbers.addRange(new OffsetRange(1, lineCount + 1));
  }
  getEndState(lineNumber) {
    return this._tokenizationStateStore.getEndState(lineNumber);
  }
  /**
   * @returns if the end state has changed.
   */
  setEndState(lineNumber, state) {
    if (!state) {
      throw new BugIndicatingError("Cannot set null/undefined state");
    }
    this._invalidEndStatesLineNumbers.delete(lineNumber);
    const r = this._tokenizationStateStore.setEndState(lineNumber, state);
    if (r && lineNumber < this.lineCount) {
      this._invalidEndStatesLineNumbers.addRange(new OffsetRange(lineNumber + 1, lineNumber + 2));
    }
    return r;
  }
  acceptChange(range, newLineCount) {
    this.lineCount += newLineCount - range.length;
    this._tokenizationStateStore.acceptChange(range, newLineCount);
    this._invalidEndStatesLineNumbers.addRangeAndResize(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive), newLineCount);
  }
  acceptChanges(changes) {
    for (const c of changes) {
      const [eolCount] = countEOL(c.text);
      this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
    }
  }
  invalidateEndStateRange(range) {
    this._invalidEndStatesLineNumbers.addRange(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive));
  }
  getFirstInvalidEndStateLineNumber() {
    return this._invalidEndStatesLineNumbers.min;
  }
  getFirstInvalidEndStateLineNumberOrMax() {
    return this.getFirstInvalidEndStateLineNumber() || Number.MAX_SAFE_INTEGER;
  }
  allStatesValid() {
    return this._invalidEndStatesLineNumbers.min === null;
  }
  getStartState(lineNumber, initialState) {
    if (lineNumber === 1) {
      return initialState;
    }
    return this.getEndState(lineNumber - 1);
  }
  getFirstInvalidLine(initialState) {
    const lineNumber = this.getFirstInvalidEndStateLineNumber();
    if (lineNumber === null) {
      return null;
    }
    const startState = this.getStartState(lineNumber, initialState);
    if (!startState) {
      throw new BugIndicatingError("Start state must be defined");
    }
    return { lineNumber, startState };
  }
}
class TokenizationStateStore {
  constructor() {
    this._lineEndStates = new FixedArray(null);
  }
  getEndState(lineNumber) {
    return this._lineEndStates.get(lineNumber);
  }
  setEndState(lineNumber, state) {
    const oldState = this._lineEndStates.get(lineNumber);
    if (oldState && oldState.equals(state)) {
      return false;
    }
    this._lineEndStates.set(lineNumber, state);
    return true;
  }
  acceptChange(range, newLineCount) {
    let length = range.length;
    if (newLineCount > 0 && length > 0) {
      length--;
      newLineCount--;
    }
    this._lineEndStates.replace(range.startLineNumber, length, newLineCount);
  }
  acceptChanges(changes) {
    for (const c of changes) {
      const [eolCount] = countEOL(c.text);
      this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
    }
  }
}
class RangePriorityQueueImpl {
  constructor() {
    this._ranges = [];
  }
  getRanges() {
    return this._ranges;
  }
  get min() {
    if (this._ranges.length === 0) {
      return null;
    }
    return this._ranges[0].start;
  }
  removeMin() {
    if (this._ranges.length === 0) {
      return null;
    }
    const range = this._ranges[0];
    if (range.start + 1 === range.endExclusive) {
      this._ranges.shift();
    } else {
      this._ranges[0] = new OffsetRange(range.start + 1, range.endExclusive);
    }
    return range.start;
  }
  delete(value) {
    const idx = this._ranges.findIndex((r) => r.contains(value));
    if (idx !== -1) {
      const range = this._ranges[idx];
      if (range.start === value) {
        if (range.endExclusive === value + 1) {
          this._ranges.splice(idx, 1);
        } else {
          this._ranges[idx] = new OffsetRange(value + 1, range.endExclusive);
        }
      } else {
        if (range.endExclusive === value + 1) {
          this._ranges[idx] = new OffsetRange(range.start, value);
        } else {
          this._ranges.splice(idx, 1, new OffsetRange(range.start, value), new OffsetRange(value + 1, range.endExclusive));
        }
      }
    }
  }
  addRange(range) {
    OffsetRange.addRange(range, this._ranges);
  }
  addRangeAndResize(range, newLength) {
    let idxFirstMightBeIntersecting = 0;
    while (!(idxFirstMightBeIntersecting >= this._ranges.length || range.start <= this._ranges[idxFirstMightBeIntersecting].endExclusive)) {
      idxFirstMightBeIntersecting++;
    }
    let idxFirstIsAfter = idxFirstMightBeIntersecting;
    while (!(idxFirstIsAfter >= this._ranges.length || range.endExclusive < this._ranges[idxFirstIsAfter].start)) {
      idxFirstIsAfter++;
    }
    const delta = newLength - range.length;
    for (let i = idxFirstIsAfter; i < this._ranges.length; i++) {
      this._ranges[i] = this._ranges[i].delta(delta);
    }
    if (idxFirstMightBeIntersecting === idxFirstIsAfter) {
      const newRange = new OffsetRange(range.start, range.start + newLength);
      if (!newRange.isEmpty) {
        this._ranges.splice(idxFirstMightBeIntersecting, 0, newRange);
      }
    } else {
      const start = Math.min(range.start, this._ranges[idxFirstMightBeIntersecting].start);
      const endEx = Math.max(range.endExclusive, this._ranges[idxFirstIsAfter - 1].endExclusive);
      const newRange = new OffsetRange(start, endEx + delta);
      if (!newRange.isEmpty) {
        this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting, newRange);
      } else {
        this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting);
      }
    }
  }
  toString() {
    return this._ranges.map((r) => r.toString()).join(" + ");
  }
}
function safeTokenize(languageIdCodec, languageId, tokenizationSupport, text, hasEOL, state) {
  let r = null;
  if (tokenizationSupport) {
    try {
      r = tokenizationSupport.tokenizeEncoded(text, hasEOL, state.clone());
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  if (!r) {
    r = nullTokenizeEncoded(languageIdCodec.encodeLanguageId(languageId), state);
  }
  LineTokens.convertToEndOffset(r.tokens, text.length);
  return r;
}
class DefaultBackgroundTokenizer {
  constructor(_tokenizerWithStateStore, _backgroundTokenStore) {
    this._tokenizerWithStateStore = _tokenizerWithStateStore;
    this._backgroundTokenStore = _backgroundTokenStore;
    this._isDisposed = false;
    this._isScheduled = false;
  }
  dispose() {
    this._isDisposed = true;
  }
  handleChanges() {
    this._beginBackgroundTokenization();
  }
  _beginBackgroundTokenization() {
    if (this._isScheduled || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
      return;
    }
    this._isScheduled = true;
    runWhenGlobalIdle((deadline) => {
      this._isScheduled = false;
      this._backgroundTokenizeWithDeadline(deadline);
    });
  }
  /**
   * Tokenize until the deadline occurs, but try to yield every 1-2ms.
   */
  _backgroundTokenizeWithDeadline(deadline) {
    const endTime = Date.now() + deadline.timeRemaining();
    const execute = () => {
      if (this._isDisposed || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
        return;
      }
      this._backgroundTokenizeForAtLeast1ms();
      if (Date.now() < endTime) {
        setTimeout0(execute);
      } else {
        this._beginBackgroundTokenization();
      }
    };
    execute();
  }
  /**
   * Tokenize for at least 1ms.
   */
  _backgroundTokenizeForAtLeast1ms() {
    const lineCount = this._tokenizerWithStateStore._textModel.getLineCount();
    const builder = new ContiguousMultilineTokensBuilder();
    const sw = StopWatch.create(false);
    do {
      if (sw.elapsed() > 1) {
        break;
      }
      const tokenizedLineNumber = this._tokenizeOneInvalidLine(builder);
      if (tokenizedLineNumber >= lineCount) {
        break;
      }
    } while (this._hasLinesToTokenize());
    this._backgroundTokenStore.setTokens(builder.finalize());
    this.checkFinished();
  }
  _hasLinesToTokenize() {
    if (!this._tokenizerWithStateStore) {
      return false;
    }
    return !this._tokenizerWithStateStore.store.allStatesValid();
  }
  _tokenizeOneInvalidLine(builder) {
    const firstInvalidLine = this._tokenizerWithStateStore?.getFirstInvalidLine();
    if (!firstInvalidLine) {
      return this._tokenizerWithStateStore._textModel.getLineCount() + 1;
    }
    this._tokenizerWithStateStore.updateTokensUntilLine(builder, firstInvalidLine.lineNumber);
    return firstInvalidLine.lineNumber;
  }
  checkFinished() {
    if (this._isDisposed) {
      return;
    }
    if (this._tokenizerWithStateStore.store.allStatesValid()) {
      this._backgroundTokenStore.backgroundTokenizationFinished();
    }
  }
  requestTokens(startLineNumber, endLineNumberExclusive) {
    this._tokenizerWithStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
  }
}
export {
  DefaultBackgroundTokenizer,
  RangePriorityQueueImpl,
  TokenizationStateStore,
  TokenizerWithStateStore,
  TokenizerWithStateStoreAndTextModel,
  TrackingTokenizationStateStore,
  findLikelyRelevantLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsVG9rZW5zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSWRsZURlYWRsaW5lLCBydW5XaGVuR2xvYmFsSWRsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgc2V0VGltZW91dDAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgY291bnRFT0wgfSBmcm9tICcuLi9jb3JlL21pc2MvZW9sQ291bnRlci5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RvcmUsIElCYWNrZ3JvdW5kVG9rZW5pemVyLCBJTGFuZ3VhZ2VJZENvZGVjLCBJU3RhdGUsIElUb2tlbml6YXRpb25TdXBwb3J0IH0gZnJvbSAnLi4vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IG51bGxUb2tlbml6ZUVuY29kZWQgfSBmcm9tICcuLi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBGaXhlZEFycmF5IH0gZnJvbSAnLi9maXhlZEFycmF5LmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2UgfSBmcm9tICcuL21pcnJvclRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb250aWd1b3VzTXVsdGlsaW5lVG9rZW5zQnVpbGRlciB9IGZyb20gJy4uL3Rva2Vucy9jb250aWd1b3VzTXVsdGlsaW5lVG9rZW5zQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zIH0gZnJvbSAnLi4vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdENIRUFQX1RPS0VOSVpBVElPTl9MRU5HVEhfTElNSVQgPSAyMDQ4XG59XG5cbmV4cG9ydCBjbGFzcyBUb2tlbml6ZXJXaXRoU3RhdGVTdG9yZTxUU3RhdGUgZXh0ZW5kcyBJU3RhdGUgPSBJU3RhdGU+IHtcblx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsU3RhdGU7XG5cblx0cHVibGljIHJlYWRvbmx5IHN0b3JlOiBUcmFja2luZ1Rva2VuaXphdGlvblN0YXRlU3RvcmU8VFN0YXRlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsaW5lQ291bnQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnRcblx0KSB7XG5cdFx0dGhpcy5pbml0aWFsU3RhdGUgPSB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCkgYXMgVFN0YXRlO1xuXHRcdHRoaXMuc3RvcmUgPSBuZXcgVHJhY2tpbmdUb2tlbml6YXRpb25TdGF0ZVN0b3JlPFRTdGF0ZT4obGluZUNvdW50KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGFydFN0YXRlKGxpbmVOdW1iZXI6IG51bWJlcik6IFRTdGF0ZSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnN0b3JlLmdldFN0YXJ0U3RhdGUobGluZU51bWJlciwgdGhpcy5pbml0aWFsU3RhdGUpO1xuXHR9XG5cblx0cHVibGljIGdldEZpcnN0SW52YWxpZExpbmUoKTogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHN0YXJ0U3RhdGU6IFRTdGF0ZSB9IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmUuZ2V0Rmlyc3RJbnZhbGlkTGluZSh0aGlzLmluaXRpYWxTdGF0ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRva2VuaXplcldpdGhTdGF0ZVN0b3JlQW5kVGV4dE1vZGVsPFRTdGF0ZSBleHRlbmRzIElTdGF0ZSA9IElTdGF0ZT4gZXh0ZW5kcyBUb2tlbml6ZXJXaXRoU3RhdGVTdG9yZTxUU3RhdGU+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0bGluZUNvdW50OiBudW1iZXIsXG5cdFx0dG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQsXG5cdFx0cHVibGljIHJlYWRvbmx5IF90ZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IF9sYW5ndWFnZUlkQ29kZWM6IElMYW5ndWFnZUlkQ29kZWNcblx0KSB7XG5cdFx0c3VwZXIobGluZUNvdW50LCB0b2tlbml6YXRpb25TdXBwb3J0KTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVUb2tlbnNVbnRpbExpbmUoYnVpbGRlcjogQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIsIGxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGxpbmVUb1Rva2VuaXplID0gdGhpcy5nZXRGaXJzdEludmFsaWRMaW5lKCk7XG5cdFx0XHRpZiAoIWxpbmVUb1Rva2VuaXplIHx8IGxpbmVUb1Rva2VuaXplLmxpbmVOdW1iZXIgPiBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVUb1Rva2VuaXplLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRjb25zdCByID0gc2FmZVRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWRDb2RlYywgbGFuZ3VhZ2VJZCwgdGhpcy50b2tlbml6YXRpb25TdXBwb3J0LCB0ZXh0LCB0cnVlLCBsaW5lVG9Ub2tlbml6ZS5zdGFydFN0YXRlKTtcblx0XHRcdGJ1aWxkZXIuYWRkKGxpbmVUb1Rva2VuaXplLmxpbmVOdW1iZXIsIHIudG9rZW5zKTtcblx0XHRcdHRoaXMuc3RvcmUuc2V0RW5kU3RhdGUobGluZVRvVG9rZW5pemUubGluZU51bWJlciwgci5lbmRTdGF0ZSBhcyBUU3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBhc3N1bWVzIHN0YXRlIGlzIHVwIHRvIGRhdGUgKi9cblx0cHVibGljIGdldFRva2VuVHlwZUlmSW5zZXJ0aW5nQ2hhcmFjdGVyKHBvc2l0aW9uOiBQb3NpdGlvbiwgY2hhcmFjdGVyOiBzdHJpbmcpOiBTdGFuZGFyZFRva2VuVHlwZSB7XG5cdFx0Ly8gVE9ET0BoZWRpZXQ6IHVzZSB0b2tlbml6ZUxpbmVXaXRoRWRpdFxuXHRcdGNvbnN0IGxpbmVTdGFydFN0YXRlID0gdGhpcy5nZXRTdGFydFN0YXRlKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGlmICghbGluZVN0YXJ0U3RhdGUpIHtcblx0XHRcdHJldHVybiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcjtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgdGV4dCBhcyBpZiBgY2hhcmFjdGVyYCB3YXMgaW5zZXJ0ZWRcblx0XHRjb25zdCB0ZXh0ID0gKFxuXHRcdFx0bGluZUNvbnRlbnQuc3Vic3RyaW5nKDAsIHBvc2l0aW9uLmNvbHVtbiAtIDEpXG5cdFx0XHQrIGNoYXJhY3RlclxuXHRcdFx0KyBsaW5lQ29udGVudC5zdWJzdHJpbmcocG9zaXRpb24uY29sdW1uIC0gMSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgciA9IHNhZmVUb2tlbml6ZSh0aGlzLl9sYW5ndWFnZUlkQ29kZWMsIGxhbmd1YWdlSWQsIHRoaXMudG9rZW5pemF0aW9uU3VwcG9ydCwgdGV4dCwgdHJ1ZSwgbGluZVN0YXJ0U3RhdGUpO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBuZXcgTGluZVRva2VucyhyLnRva2VucywgdGV4dCwgdGhpcy5fbGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRpZiAobGluZVRva2Vucy5nZXRDb3VudCgpID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW5JbmRleCA9IGxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRyZXR1cm4gbGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KTtcblx0fVxuXG5cdC8qKiBhc3N1bWVzIHN0YXRlIGlzIHVwIHRvIGRhdGUgKi9cblx0cHVibGljIHRva2VuaXplTGluZXNBdChsaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVzOiBzdHJpbmdbXSk6IExpbmVUb2tlbnNbXSB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVTdGFydFN0YXRlOiBJU3RhdGUgfCBudWxsID0gdGhpcy5nZXRTdGFydFN0YXRlKGxpbmVOdW1iZXIpO1xuXHRcdGlmICghbGluZVN0YXJ0U3RhdGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogTGluZVRva2Vuc1tdID0gW107XG5cblx0XHRsZXQgc3RhdGUgPSBsaW5lU3RhcnRTdGF0ZTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGNvbnN0IHIgPSBzYWZlVG9rZW5pemUodGhpcy5fbGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkLCB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQsIGxpbmUsIHRydWUsIHN0YXRlKTtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBMaW5lVG9rZW5zKHIudG9rZW5zLCBsaW5lLCB0aGlzLl9sYW5ndWFnZUlkQ29kZWMpKTtcblx0XHRcdHN0YXRlID0gci5lbmRTdGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGhhc0FjY3VyYXRlVG9rZW5zRm9yTGluZShsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBmaXJzdEludmFsaWRMaW5lTnVtYmVyID0gdGhpcy5zdG9yZS5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXJPck1heCgpO1xuXHRcdHJldHVybiAobGluZU51bWJlciA8IGZpcnN0SW52YWxpZExpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGlzQ2hlYXBUb1Rva2VuaXplKGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGZpcnN0SW52YWxpZExpbmVOdW1iZXIgPSB0aGlzLnN0b3JlLmdldEZpcnN0SW52YWxpZEVuZFN0YXRlTGluZU51bWJlck9yTWF4KCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCBmaXJzdEludmFsaWRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IGZpcnN0SW52YWxpZExpbmVOdW1iZXJcblx0XHRcdCYmIHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpIDwgQ29uc3RhbnRzLkNIRUFQX1RPS0VOSVpBVElPTl9MRU5HVEhfTElNSVQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcmVzdWx0IGlzIG5vdCBjYWNoZWQuXG5cdCAqL1xuXHRwdWJsaWMgdG9rZW5pemVIZXVyaXN0aWNhbGx5KGJ1aWxkZXI6IENvbnRpZ3VvdXNNdWx0aWxpbmVUb2tlbnNCdWlsZGVyLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyKTogeyBoZXVyaXN0aWNUb2tlbnM6IGJvb2xlYW4gfSB7XG5cdFx0aWYgKGVuZExpbmVOdW1iZXIgPD0gdGhpcy5zdG9yZS5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXJPck1heCgpKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm4geyBoZXVyaXN0aWNUb2tlbnM6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8PSB0aGlzLnN0b3JlLmdldEZpcnN0SW52YWxpZEVuZFN0YXRlTGluZU51bWJlck9yTWF4KCkpIHtcblx0XHRcdC8vIHRva2VuaXphdGlvbiBoYXMgcmVhY2hlZCB0aGUgdmlld3BvcnQgc3RhcnQuLi5cblx0XHRcdHRoaXMudXBkYXRlVG9rZW5zVW50aWxMaW5lKGJ1aWxkZXIsIGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHsgaGV1cmlzdGljVG9rZW5zOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGxldCBzdGF0ZSA9IHRoaXMuZ3Vlc3NTdGFydFN0YXRlKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHIgPSBzYWZlVG9rZW5pemUodGhpcy5fbGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkLCB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQsIHRleHQsIHRydWUsIHN0YXRlKTtcblx0XHRcdGJ1aWxkZXIuYWRkKGxpbmVOdW1iZXIsIHIudG9rZW5zKTtcblx0XHRcdHN0YXRlID0gci5lbmRTdGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBoZXVyaXN0aWNUb2tlbnM6IHRydWUgfTtcblx0fVxuXG5cdHByaXZhdGUgZ3Vlc3NTdGFydFN0YXRlKGxpbmVOdW1iZXI6IG51bWJlcik6IElTdGF0ZSB7XG5cdFx0bGV0IHsgbGlrZWx5UmVsZXZhbnRMaW5lcywgaW5pdGlhbFN0YXRlIH0gPSBmaW5kTGlrZWx5UmVsZXZhbnRMaW5lcyh0aGlzLl90ZXh0TW9kZWwsIGxpbmVOdW1iZXIsIHRoaXMpO1xuXG5cdFx0aWYgKCFpbml0aWFsU3RhdGUpIHtcblx0XHRcdGluaXRpYWxTdGF0ZSA9IHRoaXMudG9rZW5pemF0aW9uU3VwcG9ydC5nZXRJbml0aWFsU3RhdGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRsZXQgc3RhdGUgPSBpbml0aWFsU3RhdGU7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpa2VseVJlbGV2YW50TGluZXMpIHtcblx0XHRcdGNvbnN0IHIgPSBzYWZlVG9rZW5pemUodGhpcy5fbGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkLCB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQsIGxpbmUsIGZhbHNlLCBzdGF0ZSk7XG5cdFx0XHRzdGF0ZSA9IHIuZW5kU3RhdGU7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZExpa2VseVJlbGV2YW50TGluZXMobW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgc3RvcmU/OiBUb2tlbml6ZXJXaXRoU3RhdGVTdG9yZSk6IHsgbGlrZWx5UmVsZXZhbnRMaW5lczogc3RyaW5nW107IGluaXRpYWxTdGF0ZT86IElTdGF0ZSB9IHtcblx0bGV0IG5vbldoaXRlc3BhY2VDb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRjb25zdCBsaWtlbHlSZWxldmFudExpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgaW5pdGlhbFN0YXRlOiBJU3RhdGUgfCBudWxsIHwgdW5kZWZpbmVkID0gbnVsbDtcblx0Zm9yIChsZXQgaSA9IGxpbmVOdW1iZXIgLSAxOyBub25XaGl0ZXNwYWNlQ29sdW1uID4gMSAmJiBpID49IDE7IGktLSkge1xuXHRcdGNvbnN0IG5ld05vbldoaXRlc3BhY2VJbmRleCA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oaSk7XG5cdFx0Ly8gSWdub3JlIGxpbmVzIGZ1bGwgb2Ygd2hpdGVzcGFjZVxuXHRcdGlmIChuZXdOb25XaGl0ZXNwYWNlSW5kZXggPT09IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAobmV3Tm9uV2hpdGVzcGFjZUluZGV4IDwgbm9uV2hpdGVzcGFjZUNvbHVtbikge1xuXHRcdFx0bGlrZWx5UmVsZXZhbnRMaW5lcy5wdXNoKG1vZGVsLmdldExpbmVDb250ZW50KGkpKTtcblx0XHRcdG5vbldoaXRlc3BhY2VDb2x1bW4gPSBuZXdOb25XaGl0ZXNwYWNlSW5kZXg7XG5cdFx0XHRpbml0aWFsU3RhdGUgPSBzdG9yZT8uZ2V0U3RhcnRTdGF0ZShpKTtcblx0XHRcdGlmIChpbml0aWFsU3RhdGUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGlrZWx5UmVsZXZhbnRMaW5lcy5yZXZlcnNlKCk7XG5cdHJldHVybiB7IGxpa2VseVJlbGV2YW50TGluZXMsIGluaXRpYWxTdGF0ZTogaW5pdGlhbFN0YXRlID8/IHVuZGVmaW5lZCB9O1xufVxuXG4vKipcbiAqICoqSW52YXJpYW50OioqXG4gKiBJZiB0aGUgdGV4dCBtb2RlbCBpcyByZXRva2VuaXplZCBmcm9tIGxpbmUgMSB0byB7QGxpbmsgZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyfSgpIC0gMSxcbiAqIHRoZW4gdGhlIHJlY29tcHV0ZWQgZW5kIHN0YXRlIGZvciBsaW5lIGwgd2lsbCBiZSBlcXVhbCB0byB7QGxpbmsgZ2V0RW5kU3RhdGV9KGwpLlxuICovXG5leHBvcnQgY2xhc3MgVHJhY2tpbmdUb2tlbml6YXRpb25TdGF0ZVN0b3JlPFRTdGF0ZSBleHRlbmRzIElTdGF0ZT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbml6YXRpb25TdGF0ZVN0b3JlID0gbmV3IFRva2VuaXphdGlvblN0YXRlU3RvcmU8VFN0YXRlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMgPSBuZXcgUmFuZ2VQcmlvcml0eVF1ZXVlSW1wbCgpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbGluZUNvdW50OiBudW1iZXIpIHtcblx0XHR0aGlzLl9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMuYWRkUmFuZ2UobmV3IE9mZnNldFJhbmdlKDEsIGxpbmVDb3VudCArIDEpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIpOiBUU3RhdGUgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5pemF0aW9uU3RhdGVTdG9yZS5nZXRFbmRTdGF0ZShsaW5lTnVtYmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBpZiB0aGUgZW5kIHN0YXRlIGhhcyBjaGFuZ2VkLlxuXHQgKi9cblx0cHVibGljIHNldEVuZFN0YXRlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhdGU6IFRTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0Nhbm5vdCBzZXQgbnVsbC91bmRlZmluZWQgc3RhdGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMuZGVsZXRlKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHIgPSB0aGlzLl90b2tlbml6YXRpb25TdGF0ZVN0b3JlLnNldEVuZFN0YXRlKGxpbmVOdW1iZXIsIHN0YXRlKTtcblx0XHRpZiAociAmJiBsaW5lTnVtYmVyIDwgdGhpcy5saW5lQ291bnQpIHtcblx0XHRcdC8vIGJlY2F1c2UgdGhlIHN0YXRlIGNoYW5nZWQsIHdlIGNhbm5vdCB0cnVzdCB0aGUgbmV4dCBzdGF0ZSBhbnltb3JlIGFuZCBoYXZlIHRvIGludmFsaWRhdGUgaXQuXG5cdFx0XHR0aGlzLl9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMuYWRkUmFuZ2UobmV3IE9mZnNldFJhbmdlKGxpbmVOdW1iZXIgKyAxLCBsaW5lTnVtYmVyICsgMikpO1xuXHRcdH1cblxuXHRcdHJldHVybiByO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdENoYW5nZShyYW5nZTogTGluZVJhbmdlLCBuZXdMaW5lQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGluZUNvdW50ICs9IG5ld0xpbmVDb3VudCAtIHJhbmdlLmxlbmd0aDtcblx0XHR0aGlzLl90b2tlbml6YXRpb25TdGF0ZVN0b3JlLmFjY2VwdENoYW5nZShyYW5nZSwgbmV3TGluZUNvdW50KTtcblx0XHR0aGlzLl9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMuYWRkUmFuZ2VBbmRSZXNpemUobmV3IE9mZnNldFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSksIG5ld0xpbmVDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0Q2hhbmdlcyhjaGFuZ2VzOiBJTW9kZWxDb250ZW50Q2hhbmdlW10pIHtcblx0XHRmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykge1xuXHRcdFx0Y29uc3QgW2VvbENvdW50XSA9IGNvdW50RU9MKGMudGV4dCk7XG5cdFx0XHR0aGlzLmFjY2VwdENoYW5nZShuZXcgTGluZVJhbmdlKGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjLnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxKSwgZW9sQ291bnQgKyAxKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaW52YWxpZGF0ZUVuZFN0YXRlUmFuZ2UocmFuZ2U6IExpbmVSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX2ludmFsaWRFbmRTdGF0ZXNMaW5lTnVtYmVycy5hZGRSYW5nZShuZXcgT2Zmc2V0UmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyKCk6IG51bWJlciB8IG51bGwgeyByZXR1cm4gdGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLm1pbjsgfVxuXG5cdHB1YmxpYyBnZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXJPck1heCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdldEZpcnN0SW52YWxpZEVuZFN0YXRlTGluZU51bWJlcigpIHx8IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHR9XG5cblx0cHVibGljIGFsbFN0YXRlc1ZhbGlkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLm1pbiA9PT0gbnVsbDsgfVxuXG5cdHB1YmxpYyBnZXRTdGFydFN0YXRlKGxpbmVOdW1iZXI6IG51bWJlciwgaW5pdGlhbFN0YXRlOiBUU3RhdGUpOiBUU3RhdGUgfCBudWxsIHtcblx0XHRpZiAobGluZU51bWJlciA9PT0gMSkgeyByZXR1cm4gaW5pdGlhbFN0YXRlOyB9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RW5kU3RhdGUobGluZU51bWJlciAtIDEpO1xuXHR9XG5cblx0cHVibGljIGdldEZpcnN0SW52YWxpZExpbmUoaW5pdGlhbFN0YXRlOiBUU3RhdGUpOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgc3RhcnRTdGF0ZTogVFN0YXRlIH0gfCBudWxsIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXIoKTtcblx0XHRpZiAobGluZU51bWJlciA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0U3RhdGUgPSB0aGlzLmdldFN0YXJ0U3RhdGUobGluZU51bWJlciwgaW5pdGlhbFN0YXRlKTtcblx0XHRpZiAoIXN0YXJ0U3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1N0YXJ0IHN0YXRlIG11c3QgYmUgZGVmaW5lZCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGxpbmVOdW1iZXIsIHN0YXJ0U3RhdGUgfTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9rZW5pemF0aW9uU3RhdGVTdG9yZTxUU3RhdGUgZXh0ZW5kcyBJU3RhdGU+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZUVuZFN0YXRlcyA9IG5ldyBGaXhlZEFycmF5PFRTdGF0ZSB8IG51bGw+KG51bGwpO1xuXG5cdHB1YmxpYyBnZXRFbmRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIpOiBUU3RhdGUgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZUVuZFN0YXRlcy5nZXQobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0RW5kU3RhdGUobGluZU51bWJlcjogbnVtYmVyLCBzdGF0ZTogVFN0YXRlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgb2xkU3RhdGUgPSB0aGlzLl9saW5lRW5kU3RhdGVzLmdldChsaW5lTnVtYmVyKTtcblx0XHRpZiAob2xkU3RhdGUgJiYgb2xkU3RhdGUuZXF1YWxzKHN0YXRlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xpbmVFbmRTdGF0ZXMuc2V0KGxpbmVOdW1iZXIsIHN0YXRlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRDaGFuZ2UocmFuZ2U6IExpbmVSYW5nZSwgbmV3TGluZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRsZXQgbGVuZ3RoID0gcmFuZ2UubGVuZ3RoO1xuXHRcdGlmIChuZXdMaW5lQ291bnQgPiAwICYmIGxlbmd0aCA+IDApIHtcblx0XHRcdC8vIEtlZXAgdGhlIGxhc3Qgc3RhdGUsIGV2ZW4gdGhvdWdoIGl0IGlzIHVucmVsYXRlZC5cblx0XHRcdC8vIEJ1dCBpZiB0aGUgbmV3IHN0YXRlIGhhcHBlbnMgdG8gYWdyZWUgd2l0aCB0aGlzIGxhc3Qgc3RhdGUsIHRoZW4gd2Uga25vdyB3ZSBjYW4gc3RvcCB0b2tlbml6aW5nLlxuXHRcdFx0bGVuZ3RoLS07XG5cdFx0XHRuZXdMaW5lQ291bnQtLTtcblx0XHR9XG5cblx0XHR0aGlzLl9saW5lRW5kU3RhdGVzLnJlcGxhY2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBsZW5ndGgsIG5ld0xpbmVDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0Q2hhbmdlcyhjaGFuZ2VzOiBJTW9kZWxDb250ZW50Q2hhbmdlW10pIHtcblx0XHRmb3IgKGNvbnN0IGMgb2YgY2hhbmdlcykge1xuXHRcdFx0Y29uc3QgW2VvbENvdW50XSA9IGNvdW50RU9MKGMudGV4dCk7XG5cdFx0XHR0aGlzLmFjY2VwdENoYW5nZShuZXcgTGluZVJhbmdlKGMucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjLnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxKSwgZW9sQ291bnQgKyAxKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJhbmdlUHJpb3JpdHlRdWV1ZSB7XG5cdGdldCBtaW4oKTogbnVtYmVyIHwgbnVsbDtcblx0cmVtb3ZlTWluKCk6IG51bWJlciB8IG51bGw7XG5cblx0YWRkUmFuZ2UocmFuZ2U6IE9mZnNldFJhbmdlKTogdm9pZDtcblxuXHRhZGRSYW5nZUFuZFJlc2l6ZShyYW5nZTogT2Zmc2V0UmFuZ2UsIG5ld0xlbmd0aDogbnVtYmVyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFJhbmdlUHJpb3JpdHlRdWV1ZUltcGwgaW1wbGVtZW50cyBSYW5nZVByaW9yaXR5UXVldWUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYW5nZXM6IE9mZnNldFJhbmdlW10gPSBbXTtcblxuXHRwdWJsaWMgZ2V0UmFuZ2VzKCk6IE9mZnNldFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1pbigpOiBudW1iZXIgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fcmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yYW5nZXNbMF0uc3RhcnQ7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlTWluKCk6IG51bWJlciB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9yYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9yYW5nZXNbMF07XG5cdFx0aWYgKHJhbmdlLnN0YXJ0ICsgMSA9PT0gcmFuZ2UuZW5kRXhjbHVzaXZlKSB7XG5cdFx0XHR0aGlzLl9yYW5nZXMuc2hpZnQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmFuZ2VzWzBdID0gbmV3IE9mZnNldFJhbmdlKHJhbmdlLnN0YXJ0ICsgMSwgcmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlLnN0YXJ0O1xuXHR9XG5cblx0cHVibGljIGRlbGV0ZSh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fcmFuZ2VzLmZpbmRJbmRleChyID0+IHIuY29udGFpbnModmFsdWUpKTtcblx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9yYW5nZXNbaWR4XTtcblx0XHRcdGlmIChyYW5nZS5zdGFydCA9PT0gdmFsdWUpIHtcblx0XHRcdFx0aWYgKHJhbmdlLmVuZEV4Y2x1c2l2ZSA9PT0gdmFsdWUgKyAxKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmFuZ2VzLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Jhbmdlc1tpZHhdID0gbmV3IE9mZnNldFJhbmdlKHZhbHVlICsgMSwgcmFuZ2UuZW5kRXhjbHVzaXZlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHJhbmdlLmVuZEV4Y2x1c2l2ZSA9PT0gdmFsdWUgKyAxKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmFuZ2VzW2lkeF0gPSBuZXcgT2Zmc2V0UmFuZ2UocmFuZ2Uuc3RhcnQsIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yYW5nZXMuc3BsaWNlKGlkeCwgMSwgbmV3IE9mZnNldFJhbmdlKHJhbmdlLnN0YXJ0LCB2YWx1ZSksIG5ldyBPZmZzZXRSYW5nZSh2YWx1ZSArIDEsIHJhbmdlLmVuZEV4Y2x1c2l2ZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZFJhbmdlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IHZvaWQge1xuXHRcdE9mZnNldFJhbmdlLmFkZFJhbmdlKHJhbmdlLCB0aGlzLl9yYW5nZXMpO1xuXHR9XG5cblx0cHVibGljIGFkZFJhbmdlQW5kUmVzaXplKHJhbmdlOiBPZmZzZXRSYW5nZSwgbmV3TGVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRsZXQgaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nID0gMDtcblx0XHR3aGlsZSAoIShpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmcgPj0gdGhpcy5fcmFuZ2VzLmxlbmd0aCB8fCByYW5nZS5zdGFydCA8PSB0aGlzLl9yYW5nZXNbaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nXS5lbmRFeGNsdXNpdmUpKSB7XG5cdFx0XHRpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmcrKztcblx0XHR9XG5cdFx0bGV0IGlkeEZpcnN0SXNBZnRlciA9IGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZztcblx0XHR3aGlsZSAoIShpZHhGaXJzdElzQWZ0ZXIgPj0gdGhpcy5fcmFuZ2VzLmxlbmd0aCB8fCByYW5nZS5lbmRFeGNsdXNpdmUgPCB0aGlzLl9yYW5nZXNbaWR4Rmlyc3RJc0FmdGVyXS5zdGFydCkpIHtcblx0XHRcdGlkeEZpcnN0SXNBZnRlcisrO1xuXHRcdH1cblx0XHRjb25zdCBkZWx0YSA9IG5ld0xlbmd0aCAtIHJhbmdlLmxlbmd0aDtcblxuXHRcdGZvciAobGV0IGkgPSBpZHhGaXJzdElzQWZ0ZXI7IGkgPCB0aGlzLl9yYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3Jhbmdlc1tpXSA9IHRoaXMuX3Jhbmdlc1tpXS5kZWx0YShkZWx0YSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZyA9PT0gaWR4Rmlyc3RJc0FmdGVyKSB7XG5cdFx0XHRjb25zdCBuZXdSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShyYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnQgKyBuZXdMZW5ndGgpO1xuXHRcdFx0aWYgKCFuZXdSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX3Jhbmdlcy5zcGxpY2UoaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nLCAwLCBuZXdSYW5nZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gTWF0aC5taW4ocmFuZ2Uuc3RhcnQsIHRoaXMuX3Jhbmdlc1tpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmddLnN0YXJ0KTtcblx0XHRcdGNvbnN0IGVuZEV4ID0gTWF0aC5tYXgocmFuZ2UuZW5kRXhjbHVzaXZlLCB0aGlzLl9yYW5nZXNbaWR4Rmlyc3RJc0FmdGVyIC0gMV0uZW5kRXhjbHVzaXZlKTtcblxuXHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnQsIGVuZEV4ICsgZGVsdGEpO1xuXHRcdFx0aWYgKCFuZXdSYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX3Jhbmdlcy5zcGxpY2UoaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nLCBpZHhGaXJzdElzQWZ0ZXIgLSBpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmcsIG5ld1JhbmdlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Jhbmdlcy5zcGxpY2UoaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nLCBpZHhGaXJzdElzQWZ0ZXIgLSBpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRvU3RyaW5nKCkge1xuXHRcdHJldHVybiB0aGlzLl9yYW5nZXMubWFwKHIgPT4gci50b1N0cmluZygpKS5qb2luKCcgKyAnKTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIHNhZmVUb2tlbml6ZShsYW5ndWFnZUlkQ29kZWM6IElMYW5ndWFnZUlkQ29kZWMsIGxhbmd1YWdlSWQ6IHN0cmluZywgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgfCBudWxsLCB0ZXh0OiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQge1xuXHRsZXQgcjogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCB8IG51bGwgPSBudWxsO1xuXG5cdGlmICh0b2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0dHJ5IHtcblx0XHRcdHIgPSB0b2tlbml6YXRpb25TdXBwb3J0LnRva2VuaXplRW5jb2RlZCh0ZXh0LCBoYXNFT0wsIHN0YXRlLmNsb25lKCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGUpO1xuXHRcdH1cblx0fVxuXG5cdGlmICghcikge1xuXHRcdHIgPSBudWxsVG9rZW5pemVFbmNvZGVkKGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpLCBzdGF0ZSk7XG5cdH1cblxuXHRMaW5lVG9rZW5zLmNvbnZlcnRUb0VuZE9mZnNldChyLnRva2VucywgdGV4dC5sZW5ndGgpO1xuXHRyZXR1cm4gcjtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRCYWNrZ3JvdW5kVG9rZW5pemVyIGltcGxlbWVudHMgSUJhY2tncm91bmRUb2tlbml6ZXIge1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5pemVyV2l0aFN0YXRlU3RvcmU6IFRva2VuaXplcldpdGhTdGF0ZVN0b3JlQW5kVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2JhY2tncm91bmRUb2tlblN0b3JlOiBJQmFja2dyb3VuZFRva2VuaXphdGlvblN0b3JlLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZUNoYW5nZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYmVnaW5CYWNrZ3JvdW5kVG9rZW5pemF0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NjaGVkdWxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9iZWdpbkJhY2tncm91bmRUb2tlbml6YXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzU2NoZWR1bGVkIHx8ICF0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5fdGV4dE1vZGVsLmlzQXR0YWNoZWRUb0VkaXRvcigpIHx8ICF0aGlzLl9oYXNMaW5lc1RvVG9rZW5pemUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzU2NoZWR1bGVkID0gdHJ1ZTtcblx0XHRydW5XaGVuR2xvYmFsSWRsZSgoZGVhZGxpbmUpID0+IHtcblx0XHRcdHRoaXMuX2lzU2NoZWR1bGVkID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuX2JhY2tncm91bmRUb2tlbml6ZVdpdGhEZWFkbGluZShkZWFkbGluZSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVG9rZW5pemUgdW50aWwgdGhlIGRlYWRsaW5lIG9jY3VycywgYnV0IHRyeSB0byB5aWVsZCBldmVyeSAxLTJtcy5cblx0ICovXG5cdHByaXZhdGUgX2JhY2tncm91bmRUb2tlbml6ZVdpdGhEZWFkbGluZShkZWFkbGluZTogSWRsZURlYWRsaW5lKTogdm9pZCB7XG5cdFx0Ly8gUmVhZCB0aGUgdGltZSByZW1haW5pbmcgZnJvbSB0aGUgYGRlYWRsaW5lYCBpbW1lZGlhdGVseSBiZWNhdXNlIGl0IGlzIHVuY2xlYXJcblx0XHQvLyBpZiB0aGUgYGRlYWRsaW5lYCBvYmplY3Qgd2lsbCBiZSB2YWxpZCBhZnRlciBleGVjdXRpb24gbGVhdmVzIHRoaXMgZnVuY3Rpb24uXG5cdFx0Y29uc3QgZW5kVGltZSA9IERhdGUubm93KCkgKyBkZWFkbGluZS50aW1lUmVtYWluaW5nKCk7XG5cblx0XHRjb25zdCBleGVjdXRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQgfHwgIXRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlLl90ZXh0TW9kZWwuaXNBdHRhY2hlZFRvRWRpdG9yKCkgfHwgIXRoaXMuX2hhc0xpbmVzVG9Ub2tlbml6ZSgpKSB7XG5cdFx0XHRcdC8vIGRpc3Bvc2VkIGluIHRoZSBtZWFudGltZSBvciBkZXRhY2hlZCBvciBmaW5pc2hlZFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2JhY2tncm91bmRUb2tlbml6ZUZvckF0TGVhc3QxbXMoKTtcblxuXHRcdFx0aWYgKERhdGUubm93KCkgPCBlbmRUaW1lKSB7XG5cdFx0XHRcdC8vIFRoZXJlIGlzIHN0aWxsIHRpbWUgYmVmb3JlIHJlYWNoaW5nIHRoZSBkZWFkbGluZSwgc28geWllbGQgdG8gdGhlIGJyb3dzZXIgYW5kIHRoZW5cblx0XHRcdFx0Ly8gY29udGludWUgZXhlY3V0aW9uXG5cdFx0XHRcdHNldFRpbWVvdXQwKGV4ZWN1dGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhlIGRlYWRsaW5lIGhhcyBiZWVuIHJlYWNoZWQsIHNvIHNjaGVkdWxlIGEgbmV3IGlkbGUgY2FsbGJhY2sgaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdHRoaXMuX2JlZ2luQmFja2dyb3VuZFRva2VuaXphdGlvbigpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXhlY3V0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRva2VuaXplIGZvciBhdCBsZWFzdCAxbXMuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZ3JvdW5kVG9rZW5pemVGb3JBdExlYXN0MW1zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBDb250aWd1b3VzTXVsdGlsaW5lVG9rZW5zQnVpbGRlcigpO1xuXHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHRkbyB7XG5cdFx0XHRpZiAoc3cuZWxhcHNlZCgpID4gMSkge1xuXHRcdFx0XHQvLyB0aGUgY29tcGFyaXNvbiBpcyBpbnRlbnRpb25hbGx5ID4gMSBhbmQgbm90ID49IDEgdG8gZW5zdXJlIHRoYXRcblx0XHRcdFx0Ly8gYSBmdWxsIG1pbGxpc2Vjb25kIGhhcyBlbGFwc2VkLCBnaXZlbiBob3cgbWljcm9zZWNvbmRzIGFyZSByb3VuZGVkXG5cdFx0XHRcdC8vIHRvIG1pbGxpc2Vjb25kc1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9rZW5pemVkTGluZU51bWJlciA9IHRoaXMuX3Rva2VuaXplT25lSW52YWxpZExpbmUoYnVpbGRlcik7XG5cblx0XHRcdGlmICh0b2tlbml6ZWRMaW5lTnVtYmVyID49IGxpbmVDb3VudCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9IHdoaWxlICh0aGlzLl9oYXNMaW5lc1RvVG9rZW5pemUoKSk7XG5cblx0XHR0aGlzLl9iYWNrZ3JvdW5kVG9rZW5TdG9yZS5zZXRUb2tlbnMoYnVpbGRlci5maW5hbGl6ZSgpKTtcblx0XHR0aGlzLmNoZWNrRmluaXNoZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0xpbmVzVG9Ub2tlbml6ZSgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAhdGhpcy5fdG9rZW5pemVyV2l0aFN0YXRlU3RvcmUuc3RvcmUuYWxsU3RhdGVzVmFsaWQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Rva2VuaXplT25lSW52YWxpZExpbmUoYnVpbGRlcjogQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IGZpcnN0SW52YWxpZExpbmUgPSB0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZT8uZ2V0Rmlyc3RJbnZhbGlkTGluZSgpO1xuXHRcdGlmICghZmlyc3RJbnZhbGlkTGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxO1xuXHRcdH1cblx0XHR0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS51cGRhdGVUb2tlbnNVbnRpbExpbmUoYnVpbGRlciwgZmlyc3RJbnZhbGlkTGluZS5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gZmlyc3RJbnZhbGlkTGluZS5saW5lTnVtYmVyO1xuXHR9XG5cblx0cHVibGljIGNoZWNrRmluaXNoZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlLnN0b3JlLmFsbFN0YXRlc1ZhbGlkKCkpIHtcblx0XHRcdHRoaXMuX2JhY2tncm91bmRUb2tlblN0b3JlLmJhY2tncm91bmRUb2tlbml6YXRpb25GaW5pc2hlZCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXF1ZXN0VG9rZW5zKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyRXhjbHVzaXZlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5zdG9yZS5pbnZhbGlkYXRlRW5kU3RhdGVSYW5nZShuZXcgTGluZVJhbmdlKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUF1Qix5QkFBeUI7QUFDaEQsU0FBUyxvQkFBb0IseUJBQXlCO0FBQ3RELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsa0JBQWtCO0FBRTNCLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUNDLEVBQUFBLHNCQUFBLHFDQUFrQyxRQUFsQztBQURVLFNBQUFBO0FBQUEsR0FBQTtBQUlKLE1BQU0sd0JBQXdEO0FBQUEsRUFLcEUsWUFDQyxXQUNnQixxQkFDZjtBQURlO0FBRWhCLFNBQUssZUFBZSxLQUFLLG9CQUFvQixnQkFBZ0I7QUFDN0QsU0FBSyxRQUFRLElBQUksK0JBQXVDLFNBQVM7QUFBQSxFQUNsRTtBQUFBLEVBRU8sY0FBYyxZQUFtQztBQUN2RCxXQUFPLEtBQUssTUFBTSxjQUFjLFlBQVksS0FBSyxZQUFZO0FBQUEsRUFDOUQ7QUFBQSxFQUVPLHNCQUF5RTtBQUMvRSxXQUFPLEtBQUssTUFBTSxvQkFBb0IsS0FBSyxZQUFZO0FBQUEsRUFDeEQ7QUFDRDtBQUVPLE1BQU0sNENBQTRFLHdCQUFnQztBQUFBLEVBQ3hILFlBQ0MsV0FDQSxxQkFDZ0IsWUFDQSxrQkFDZjtBQUNELFVBQU0sV0FBVyxtQkFBbUI7QUFIcEI7QUFDQTtBQUFBLEVBR2pCO0FBQUEsRUFFTyxzQkFBc0IsU0FBMkMsWUFBMEI7QUFDakcsVUFBTSxhQUFhLEtBQUssV0FBVyxjQUFjO0FBRWpELFdBQU8sTUFBTTtBQUNaLFlBQU0saUJBQWlCLEtBQUssb0JBQW9CO0FBQ2hELFVBQUksQ0FB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
