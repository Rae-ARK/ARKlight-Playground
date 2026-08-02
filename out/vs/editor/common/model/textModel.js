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
import { pushMany } from "../../../base/common/arrays.js";
import { CharCode } from "../../../base/common/charCode.js";
import { SetWithKey } from "../../../base/common/collections.js";
import { Color } from "../../../base/common/color.js";
import { BugIndicatingError, illegalArgument, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { listenStream } from "../../../base/common/stream.js";
import * as strings from "../../../base/common/strings.js";
import { Constants } from "../../../base/common/uint.js";
import { URI } from "../../../base/common/uri.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { isDark } from "../../../platform/theme/common/theme.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { normalizeIndentation } from "../core/misc/indentation.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { Selection } from "../core/selection.js";
import { ILanguageService } from "../languages/language.js";
import { ILanguageConfigurationService } from "../languages/languageConfigurationRegistry.js";
import * as model from "../model.js";
import { EditSources } from "../textModelEditSource.js";
import { InternalModelContentChangeEvent, LineInjectedText, ModelFontChanged, ModelFontChangedEvent, ModelInjectedTextChangedEvent, ModelLineHeightChanged, ModelLineHeightChangedEvent, ModelRawContentChangedEvent, ModelRawEOLChanged, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from "../textModelEvents.js";
import { LineTokens } from "../tokens/lineTokens.js";
import { BracketPairsTextModelPart } from "./bracketPairsTextModelPart/bracketPairsImpl.js";
import { ColorizedBracketPairsDecorationProvider } from "./bracketPairsTextModelPart/colorizedBracketPairsDecorationProvider.js";
import { EditStack } from "./editStack.js";
import { GuidesTextModelPart } from "./guidesTextModelPart.js";
import { guessIndentation } from "./indentationGuesser.js";
import { IntervalNode, IntervalTree, recomputeMaxEnd } from "./intervalTree.js";
import { PieceTreeTextBuffer } from "./pieceTreeTextBuffer/pieceTreeTextBuffer.js";
import { PieceTreeTextBufferBuilder } from "./pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js";
import { SearchParams, TextModelSearch } from "./textModelSearch.js";
import { AttachedViews } from "./tokens/abstractSyntaxTokenBackend.js";
import { TokenizationFontDecorationProvider } from "./tokens/tokenizationFontDecorationsProvider.js";
import { LineFontChangingDecoration, LineHeightChangingDecoration } from "./decorationProvider.js";
import { TokenizationTextModelPart } from "./tokens/tokenizationTextModelPart.js";
function createTextBufferFactory(text) {
  const builder = new PieceTreeTextBufferBuilder();
  builder.acceptChunk(text);
  return builder.finish();
}
function createTextBufferFactoryFromStream(stream) {
  return new Promise((resolve, reject) => {
    const builder = new PieceTreeTextBufferBuilder();
    let done = false;
    listenStream(stream, {
      onData: (chunk) => {
        builder.acceptChunk(typeof chunk === "string" ? chunk : chunk.toString());
      },
      onError: (error) => {
        if (!done) {
          done = true;
          reject(error);
        }
      },
      onEnd: () => {
        if (!done) {
          done = true;
          resolve(builder.finish());
        }
      }
    });
  });
}
function createTextBufferFactoryFromSnapshot(snapshot) {
  const builder = new PieceTreeTextBufferBuilder();
  let chunk;
  while (typeof (chunk = snapshot.read()) === "string") {
    builder.acceptChunk(chunk);
  }
  return builder.finish();
}
function createTextBuffer(value, defaultEOL) {
  let factory;
  if (typeof value === "string") {
    factory = createTextBufferFactory(value);
  } else if (model.isITextSnapshot(value)) {
    factory = createTextBufferFactoryFromSnapshot(value);
  } else {
    factory = value;
  }
  return factory.create(defaultEOL);
}
let MODEL_ID = 0;
const LIMIT_FIND_COUNT = 999;
const LONG_LINE_BOUNDARY = 1e4;
const LINE_HEIGHT_CEILING = 300;
class TextModelSnapshot {
  constructor(source) {
    this._source = source;
    this._eos = false;
  }
  read() {
    if (this._eos) {
      return null;
    }
    const result = [];
    let resultCnt = 0;
    let resultLength = 0;
    do {
      const tmp = this._source.read();
      if (tmp === null) {
        this._eos = true;
        if (resultCnt === 0) {
          return null;
        } else {
          return result.join("");
        }
      }
      if (tmp.length > 0) {
        result[resultCnt++] = tmp;
        resultLength += tmp.length;
      }
      if (resultLength >= 64 * 1024) {
        return result.join("");
      }
    } while (true);
  }
}
const invalidFunc = () => {
  throw new Error(`Invalid change accessor`);
};
var StringOffsetValidationType = /* @__PURE__ */ ((StringOffsetValidationType2) => {
  StringOffsetValidationType2[StringOffsetValidationType2["Relaxed"] = 0] = "Relaxed";
  StringOffsetValidationType2[StringOffsetValidationType2["SurrogatePairs"] = 1] = "SurrogatePairs";
  return StringOffsetValidationType2;
})(StringOffsetValidationType || {});
let TextModel = class extends Disposable {
  constructor(source, languageIdOrSelection, creationOptions, associatedResource = null, _undoRedoService, _languageService, _languageConfigurationService, instantiationService) {
    super();
    this._undoRedoService = _undoRedoService;
    this._languageService = _languageService;
    this._languageConfigurationService = _languageConfigurationService;
    this.instantiationService = instantiationService;
    //#region Events
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidChangeDecorations = this._register(new DidChangeDecorationsEmitter((affectedInjectedTextLines, affectedLineHeights, affectedFontLines) => this.handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines, affectedLineHeights, affectedFontLines)));
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._onDidChangeOptions = this._register(new Emitter());
    this._onDidChangeAttached = this._register(new Emitter());
    this._onDidChangeLineHeight = this._register(new Emitter());
    this._onDidChangeFont = this._register(new Emitter());
    this._eventEmitter = this._register(new DidChangeContentEmitter());
    this._languageSelectionListener = this._register(new MutableDisposable());
    this._deltaDecorationCallCnt = 0;
    this._attachedViews = this._register(new AttachedViews());
    this._viewModels = /* @__PURE__ */ new Set();
    MODEL_ID++;
    this.id = "$model" + MODEL_ID;
    this.isForSimpleWidget = creationOptions.isForSimpleWidget;
    if (typeof associatedResource === "undefined" || associatedResource === null) {
      this._associatedResource = URI.parse("inmemory://model/" + MODEL_ID);
    } else {
      this._associatedResource = associatedResource;
    }
    this._attachedEditorCount = 0;
    const { textBuffer, disposable } = createTextBuffer(source, creationOptions.defaultEOL);
    this._buffer = textBuffer;
    this._bufferDisposable = disposable;
    const bufferLineCount = this._buffer.getLineCount();
    const bufferTextLength = this._buffer.getValueLengthInRange(new Range(1, 1, bufferLineCount, this._buffer.getLineLength(bufferLineCount) + 1), model.EndOfLinePreference.TextDefined);
    if (creationOptions.largeFileOptimizations) {
      this._isTooLargeForTokenization = bufferTextLength > TextModel.LARGE_FILE_SIZE_THRESHOLD || bufferLineCount > TextModel.LARGE_FILE_LINE_COUNT_THRESHOLD;
      this._isTooLargeForHeapOperation = bufferTextLength > TextModel.LARGE_FILE_HEAP_OPERATION_THRESHOLD;
    } else {
      this._isTooLargeForTokenization = false;
      this._isTooLargeForHeapOperation = false;
    }
    this._options = TextModel.resolveOptions(this._buffer, creationOptions);
    const languageId = typeof languageIdOrSelection === "string" ? languageIdOrSelection : languageIdOrSelection.languageId;
    if (typeof languageIdOrSelection !== "string") {
      this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId));
    }
    this._bracketPairs = this._register(new BracketPairsTextModelPart(this, this._languageConfigurationService));
    this._guidesTextModelPart = this._register(new GuidesTextModelPart(this, this._languageConfigurationService));
    this._decorationProvider = this._register(new ColorizedBracketPairsDecorationProvider(this));
    this._tokenizationTextModelPart = this.instantiationService.createInstance(
      TokenizationTextModelPart,
      this,
      this._bracketPairs,
      languageId,
      this._attachedViews
    );
    this._fontTokenDecorationsProvider = this._register(new TokenizationFontDecorationProvider(this, this._tokenizationTextModelPart));
    this._isTooLargeForSyncing = bufferTextLength > TextModel._MODEL_SYNC_LIMIT;
    this._versionId = 1;
    this._alternativeVersionId = 1;
    this._initialUndoRedoSnapshot = null;
    this._isDisposed = false;
    this.__isDisposing = false;
    this._instanceId = strings.singleLetterHash(MODEL_ID);
    this._lastDecorationId = 0;
    this._decorations = /* @__PURE__ */ Object.create(null);
    this._decorationsTree = new DecorationsTrees();
    this._commandManager = new EditStack(this, this._undoRedoService);
    this._isUndoing = false;
    this._isRedoing = false;
    this._trimAutoWhitespaceLines = null;
    this._register(this._decorationProvider.onDidChange(() => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._register(this._fontTokenDecorationsProvider.onDidChangeLineHeight((affectedLineHeights) => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._fireOnDidChangeLineHeight(affectedLineHeights);
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._register(this._fontTokenDecorationsProvider.onDidChangeFont((affectedFontLines) => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._fireOnDidChangeFont(affectedFontLines);
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._languageService.requestRichLanguageFeatures(languageId);
    this._register(this._languageConfigurationService.onDidChange((e) => {
      this._bracketPairs.handleLanguageConfigurationServiceChange(e);
      this._tokenizationTextModelPart.handleLanguageConfigurationServiceChange(e);
    }));
  }
  static resolveOptions(textBuffer, options) {
    if (options.detectIndentation) {
      const guessedIndentation = guessIndentation(textBuffer, options.tabSize, options.insertSpaces);
      return new model.TextModelResolvedOptions({
        tabSize: guessedIndentation.tabSize,
        indentSize: "tabSize",
        // TODO@Alex: guess indentSize independent of tabSize
        insertSpaces: guessedIndentation.insertSpaces,
        trimAutoWhitespace: options.trimAutoWhitespace,
        defaultEOL: options.defaultEOL,
        bracketPairColorizationOptions: options.bracketPairColorizationOptions
      });
    }
    return new model.TextModelResolvedOptions(options);
  }
  get onDidChangeLanguage() {
    return this._tokenizationTextModelPart.onDidChangeLanguage;
  }
  get onDidChangeLanguageConfiguration() {
    return this._tokenizationTextModelPart.onDidChangeLanguageConfiguration;
  }
  get onDidChangeTokens() {
    return this._tokenizationTextModelPart.onDidChangeTokens;
  }
  get onDidChangeOptions() {
    return this._onDidChangeOptions.event;
  }
  get onDidChangeAttached() {
    return this._onDidChangeAttached.event;
  }
  get onDidChangeLineHeight() {
    return this._onDidChangeLineHeight.event;
  }
  get onDidChangeFont() {
    return this._onDidChangeFont.event;
  }
  onDidChangeContent(listener) {
    return this._eventEmitter.event((e) => listener(e.contentChangedEvent));
  }
  _isDisposing() {
    return this.__isDisposing;
  }
  get tokenization() {
    return this._tokenizationTextModelPart;
  }
  get bracketPairs() {
    return this._bracketPairs;
  }
  get guides() {
    return this._guidesTextModelPart;
  }
  dispose() {
    this.__isDisposing = true;
    this._onWillDispose.fire();
    this._tokenizationTextModelPart.dispose();
    this._isDisposed = true;
    super.dispose();
    this._bufferDisposable.dispose();
    this.__isDisposing = false;
    const emptyDisposedTextBuffer = new PieceTreeTextBuffer([], "", "\n", false, false, true, true);
    emptyDisposedTextBuffer.dispose();
    this._buffer = emptyDisposedTextBuffer;
    this._bufferDisposable = Disposable.None;
  }
  _hasListeners() {
    return this._onWillDispose.hasListeners() || this._onDidChangeDecorations.hasListeners() || this._tokenizationTextModelPart._hasListeners() || this._onDidChangeOptions.hasListeners() || this._onDidChangeAttached.hasListeners() || this._onDidChangeLineHeight.hasListeners() || this._onDidChangeFont.hasListeners() || this._eventEmitter.hasListeners();
  }
  _assertNotDisposed() {
    if (this._isDisposed) {
      throw new BugIndicatingError("Model is disposed!");
    }
  }
  registerViewModel(viewModel) {
    this._viewModels.add(viewModel);
  }
  unregisterViewModel(viewModel) {
    this._viewModels.delete(viewModel);
  }
  equalsTextBuffer(other) {
    this._assertNotDisposed();
    return this._buffer.equals(other);
  }
  getTextBuffer() {
    this._assertNotDisposed();
    return this._buffer;
  }
  _emitContentChangedEvent(rawChange, change, resultingSelection = null) {
    if (this.__isDisposing) {
      return;
    }
    this._tokenizationTextModelPart.handleDidChangeContent(change);
    this._bracketPairs.handleDidChangeContent(change);
    this._fontTokenDecorationsProvider.handleDidChangeContent(change);
    const contentChangeEvent = new InternalModelContentChangeEvent(rawChange, change);
    if (resultingSelection) {
      contentChangeEvent.rawContentChangedEvent.resultingSelection = resultingSelection;
    }
    this._onDidChangeContentOrInjectedText(contentChangeEvent);
    this._eventEmitter.fire(contentChangeEvent);
  }
  setValue(value, reason = EditSources.setValue()) {
    this._assertNotDisposed();
    if (value === null || value === void 0) {
      throw illegalArgument();
    }
    const { textBuffer, disposable } = createTextBuffer(value, this._options.defaultEOL);
    this._setValueFromTextBuffer(textBuffer, disposable, reason);
  }
  _createContentChanged2(range, rangeOffset, rangeLength, rangeEndPosition, text, isUndoing, isRedoing, isFlush, isEolChange, reason) {
    return {
      changes: [{
        range,
        rangeOffset,
        rangeLength,
        text
      }],
      eol: this._buffer.getEOL(),
      isEolChange,
      versionId: this.getVersionId(),
      isUndoing,
      isRedoing,
      isFlush,
      detailedReasons: [reason],
      detailedReasonsChangeLengths: [1]
    };
  }
  _setValueFromTextBuffer(textBuffer, textBufferDisposable, reason) {
    this._assertNotDisposed();
    const oldFullModelRange = this.getFullModelRange();
    const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
    const endLineNumber = this.getLineCount();
    const endColumn = this.getLineMaxColumn(endLineNumber);
    this._buffer = textBuffer;
    this._bufferDisposable.dispose();
    this._bufferDisposable = textBufferDisposable;
    this._increaseVersionId();
    this._decorations = /* @__PURE__ */ Object.create(null);
    this._decorationsTree = new DecorationsTrees();
    this._commandManager.clear();
    this._trimAutoWhitespaceLines = null;
    this._emitContentChangedEvent(
      new ModelRawContentChangedEvent(
        [
          new ModelRawFlush()
        ],
        this._versionId,
        false,
        false
      ),
      this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, true, false, reason)
    );
  }
  setEOL(eol) {
    this._assertNotDisposed();
    const newEOL = eol === model.EndOfLineSequence.CRLF ? "\r\n" : "\n";
    if (this._buffer.getEOL() === newEOL) {
      return;
    }
    const oldFullModelRange = this.getFullModelRange();
    const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
    const endLineNumber = this.getLineCount();
    const endColumn = this.getLineMaxColumn(endLineNumber);
    this._onBeforeEOLChange();
    this._buffer.setEOL(newEOL);
    this._increaseVersionId();
    this._onAfterEOLChange();
    this._emitContentChangedEvent(
      new ModelRawContentChangedEvent(
        [
          new ModelRawEOLChanged()
        ],
        this._versionId,
        false,
        false
      ),
      this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, false, true, EditSources.eolChange())
    );
  }
  _onBeforeEOLChange() {
    this._decorationsTree.ensureAllNodesHaveRanges(this);
  }
  _onAfterEOLChange() {
    const versionId = this.getVersionId();
    const allDecorations = this._decorationsTree.collectNodesPostOrder();
    for (let i = 0, len = allDecorations.length; i < len; i++) {
      const node = allDecorations[i];
      const range = node.range;
      const delta = node.cachedAbsoluteStart - node.start;
      const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
      const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
      node.cachedAbsoluteStart = startOffset;
      node.cachedAbsoluteEnd = endOffset;
      node.cachedVersionId = versionId;
      node.start = startOffset - delta;
      node.end = endOffset - delta;
      recomputeMaxEnd(node);
    }
  }
  onBeforeAttached() {
    this._attachedEditorCount++;
    if (this._attachedEditorCount === 1) {
      this._tokenizationTextModelPart.handleDidChangeAttached();
      this._onDidChangeAttached.fire(void 0);
    }
    return this._attachedViews.attachView();
  }
  onBeforeDetached(view) {
    this._attachedEditorCount--;
    if (this._attachedEditorCount === 0) {
      this._tokenizationTextModelPart.handleDidChangeAttached();
      this._onDidChangeAttached.fire(void 0);
    }
    this._attachedViews.detachView(view);
  }
  isAttachedToEditor() {
    return this._attachedEditorCount > 0;
  }
  getAttachedEditorCount() {
    return this._attachedEditorCount;
  }
  isTooLargeForSyncing() {
    return this._isTooLargeForSyncing;
  }
  isTooLargeForTokenization() {
    return this._isTooLargeForTokenization;
  }
  isTooLargeForHeapOperation() {
    return this._isTooLargeForHeapOperation;
  }
  isDisposed() {
    return this._isDisposed;
  }
  isDominatedByLongLines() {
    this._assertNotDisposed();
    if (this.isTooLargeForTokenization()) {
      return false;
    }
    let smallLineCharCount = 0;
    let longLineCharCount = 0;
    const lineCount = this._buffer.getLineCount();
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineLength = this._buffer.getLineLength(lineNumber);
      if (lineLength >= LONG_LINE_BOUNDARY) {
        longLineCharCount += lineLength;
      } else {
        smallLineCharCount += lineLength;
      }
    }
    return longLineCharCount > smallLineCharCount;
  }
  get uri() {
    return this._associatedResource;
  }
  //#region Options
  getOptions() {
    this._assertNotDisposed();
    return this._options;
  }
  getFormattingOptions() {
    return {
      tabSize: this._options.indentSize,
      insertSpaces: this._options.insertSpaces
    };
  }
  updateOptions(_newOpts) {
    this._assertNotDisposed();
    const tabSize = typeof _newOpts.tabSize !== "undefined" ? _newOpts.tabSize : this._options.tabSize;
    const indentSize = typeof _newOpts.indentSize !== "undefined" ? _newOpts.indentSize : this._options.originalIndentSize;
    const insertSpaces = typeof _newOpts.insertSpaces !== "undefined" ? _newOpts.insertSpaces : this._options.insertSpaces;
    const trimAutoWhitespace = typeof _newOpts.trimAutoWhitespace !== "undefined" ? _newOpts.trimAutoWhitespace : this._options.trimAutoWhitespace;
    const bracketPairColorizationOptions = typeof _newOpts.bracketColorizationOptions !== "undefined" ? _newOpts.bracketColorizationOptions : this._options.bracketPairColorizationOptions;
    const newOpts = new model.TextModelResolvedOptions({
      tabSize,
      indentSize,
      insertSpaces,
      defaultEOL: this._options.defaultEOL,
      trimAutoWhitespace,
      bracketPairColorizationOptions
    });
    if (this._options.equals(newOpts)) {
      return;
    }
    const e = this._options.createChangeEvent(newOpts);
    this._options = newOpts;
    this._bracketPairs.handleDidChangeOptions(e);
    this._decorationProvider.handleDidChangeOptions(e);
    this._onDidChangeOptions.fire(e);
  }
  detectIndentation(defaultInsertSpaces, defaultTabSize) {
    this._assertNotDisposed();
    const guessedIndentation = guessIndentation(this._buffer, defaultTabSize, defaultInsertSpaces);
    this.updateOptions({
      insertSpaces: guessedIndentation.insertSpaces,
      tabSize: guessedIndentation.tabSize,
      indentSize: guessedIndentation.tabSize
      // TODO@Alex: guess indentSize independent of tabSize
    });
  }
  normalizeIndentation(str) {
    this._assertNotDisposed();
    return normalizeIndentation(str, this._options.indentSize, this._options.insertSpaces);
  }
  //#endregion
  //#region Reading
  getVersionId() {
    this._assertNotDisposed();
    return this._versionId;
  }
  mightContainRTL() {
    return this._buffer.mightContainRTL();
  }
  mightContainUnusualLineTerminators() {
    return this._buffer.mightContainUnusualLineTerminators();
  }
  removeUnusualLineTerminators(selections = null) {
    const matches = this.findMatches(strings.UNUSUAL_LINE_TERMINATORS.source, false, true, false, null, false, Constants.MAX_SAFE_SMALL_INTEGER);
    this._buffer.resetMightContainUnusualLineTerminators();
    this.pushEditOperations(selections, matches.map((m) => ({ range: m.range, text: null })), () => null);
  }
  mightContainNonBasicASCII() {
    return this._buffer.mightContainNonBasicASCII();
  }
  getAlternativeVersionId() {
    this._assertNotDisposed();
    return this._alternativeVersionId;
  }
  getInitialUndoRedoSnapshot() {
    this._assertNotDisposed();
    return this._initialUndoRedoSnapshot;
  }
  getOffsetAt(rawPosition) {
    this._assertNotDisposed();
    const position = this._validatePosition(rawPosition.lineNumber, rawPosition.column, 0 /* Relaxed */);
    return this._buffer.getOffsetAt(position.lineNumber, position.column);
  }
  getPositionAt(rawOffset) {
    this._assertNotDisposed();
    const offset = Math.min(this._buffer.getLength(), Math.max(0, rawOffset));
    return this._buffer.getPositionAt(offset);
  }
  _increaseVersionId() {
    this._versionId = this._versionId + 1;
    this._alternativeVersionId = this._versionId;
  }
  _overwriteVersionId(versionId) {
    this._versionId = versionId;
  }
  _overwriteAlternativeVersionId(newAlternativeVersionId) {
    this._alternativeVersionId = newAlternativeVersionId;
  }
  _overwriteInitialUndoRedoSnapshot(newInitialUndoRedoSnapshot) {
    this._initialUndoRedoSnapshot = newInitialUndoRedoSnapshot;
  }
  getValue(eol, preserveBOM = false) {
    this._assertNotDisposed();
    if (this.isTooLargeForHeapOperation()) {
      throw new BugIndicatingError("Operation would exceed heap memory limits");
    }
    const fullModelRange = this.getFullModelRange();
    const fullModelValue = this.getValueInRange(fullModelRange, eol);
    if (preserveBOM) {
      return this._buffer.getBOM() + fullModelValue;
    }
    return fullModelValue;
  }
  createSnapshot(preserveBOM = false) {
    return new TextModelSnapshot(this._buffer.createSnapshot(preserveBOM));
  }
  getValueLength(eol, preserveBOM = false) {
    this._assertNotDisposed();
    const fullModelRange = this.getFullModelRange();
    const fullModelValue = this.getValueLengthInRange(fullModelRange, eol);
    if (preserveBOM) {
      return this._buffer.getBOM().length + fullModelValue;
    }
    return fullModelValue;
  }
  getValueInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getValueInRange(this.validateRange(rawRange), eol);
  }
  getValueLengthInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getValueLengthInRange(this.validateRange(rawRange), eol);
  }
  getCharacterCountInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getCharacterCountInRange(this.validateRange(rawRange), eol);
  }
  getLineCount() {
    this._assertNotDisposed();
    return this._buffer.getLineCount();
  }
  getLineContent(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineContent(lineNumber);
  }
  getLineLength(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLength(lineNumber);
  }
  getLinesContent() {
    this._assertNotDisposed();
    if (this.isTooLargeForHeapOperation()) {
      throw new BugIndicatingError("Operation would exceed heap memory limits");
    }
    return this._buffer.getLinesContent();
  }
  getEOL() {
    this._assertNotDisposed();
    return this._buffer.getEOL();
  }
  getEndOfLineSequence() {
    this._assertNotDisposed();
    return this._buffer.getEOL() === "\n" ? model.EndOfLineSequence.LF : model.EndOfLineSequence.CRLF;
  }
  getLineMinColumn(lineNumber) {
    this._assertNotDisposed();
    return 1;
  }
  getLineMaxColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLength(lineNumber) + 1;
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineFirstNonWhitespaceColumn(lineNumber);
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLastNonWhitespaceColumn(lineNumber);
  }
  /**
   * Validates `range` is within buffer bounds, but allows it to sit in between surrogate pairs, etc.
   * Will try to not allocate if possible.
   */
  _validateRangeRelaxedNoAllocations(range) {
    const linesCount = this._buffer.getLineCount();
    const initialStartLineNumber = range.startLineNumber;
    const initialStartColumn = range.startColumn;
    let startLineNumber = Math.floor(typeof initialStartLineNumber === "number" && !isNaN(initialStartLineNumber) ? initialStartLineNumber : 1);
    let startColumn = Math.floor(typeof initialStartColumn === "number" && !isNaN(initialStartColumn) ? initialStartColumn : 1);
    if (startLineNumber < 1) {
      startLineNumber = 1;
      startColumn = 1;
    } else if (startLineNumber > linesCount) {
      startLineNumber = linesCount;
      startColumn = this.getLineMaxColumn(startLineNumber);
    } else {
      if (startColumn <= 1) {
        startColumn = 1;
      } else {
        const maxColumn = this.getLineMaxColumn(startLineNumber);
        if (startColumn >= maxColumn) {
          startColumn = maxColumn;
        }
      }
    }
    const initialEndLineNumber = range.endLineNumber;
    const initialEndColumn = range.endColumn;
    let endLineNumber = Math.floor(typeof initialEndLineNumber === "number" && !isNaN(initialEndLineNumber) ? initialEndLineNumber : 1);
    let endColumn = Math.floor(typeof initialEndColumn === "number" && !isNaN(initialEndColumn) ? initialEndColumn : 1);
    if (endLineNumber < 1) {
      endLineNumber = 1;
      endColumn = 1;
    } else if (endLineNumber > linesCount) {
      endLineNumber = linesCount;
      endColumn = this.getLineMaxColumn(endLineNumber);
    } else {
      if (endColumn <= 1) {
        endColumn = 1;
      } else {
        const maxColumn = this.getLineMaxColumn(endLineNumber);
        if (endColumn >= maxColumn) {
          endColumn = maxColumn;
        }
      }
    }
    if (initialStartLineNumber === startLineNumber && initialStartColumn === startColumn && initialEndLineNumber === endLineNumber && initialEndColumn === endColumn && range instanceof Range && !(range instanceof Selection)) {
      return range;
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  _isValidPosition(lineNumber, column, validationType) {
    if (typeof lineNumber !== "number" || typeof column !== "number") {
      return false;
    }
    if (isNaN(lineNumber) || isNaN(column)) {
      return false;
    }
    if (lineNumber < 1 || column < 1) {
      return false;
    }
    if ((lineNumber | 0) !== lineNumber || (column | 0) !== column) {
      return false;
    }
    const lineCount = this._buffer.getLineCount();
    if (lineNumber > lineCount) {
      return false;
    }
    if (column === 1) {
      return true;
    }
    const maxColumn = this.getLineMaxColumn(lineNumber);
    if (column > maxColumn) {
      return false;
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
      if (strings.isHighSurrogate(charCodeBefore)) {
        return false;
      }
    }
    return true;
  }
  _validatePosition(_lineNumber, _column, validationType) {
    const lineNumber = Math.floor(typeof _lineNumber === "number" && !isNaN(_lineNumber) ? _lineNumber : 1);
    const column = Math.floor(typeof _column === "number" && !isNaN(_column) ? _column : 1);
    const lineCount = this._buffer.getLineCount();
    if (lineNumber < 1) {
      return new Position(1, 1);
    }
    if (lineNumber > lineCount) {
      return new Position(lineCount, this.getLineMaxColumn(lineCount));
    }
    if (column <= 1) {
      return new Position(lineNumber, 1);
    }
    const maxColumn = this.getLineMaxColumn(lineNumber);
    if (column >= maxColumn) {
      return new Position(lineNumber, maxColumn);
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
      if (strings.isHighSurrogate(charCodeBefore)) {
        return new Position(lineNumber, column - 1);
      }
    }
    return new Position(lineNumber, column);
  }
  validatePosition(position) {
    const validationType = 1 /* SurrogatePairs */;
    this._assertNotDisposed();
    if (position instanceof Position) {
      if (this._isValidPosition(position.lineNumber, position.column, validationType)) {
        return position;
      }
    }
    return this._validatePosition(position.lineNumber, position.column, validationType);
  }
  isValidRange(range) {
    return this._isValidRange(range, 1 /* SurrogatePairs */);
  }
  _isValidRange(range, validationType) {
    const startLineNumber = range.startLineNumber;
    const startColumn = range.startColumn;
    const endLineNumber = range.endLineNumber;
    const endColumn = range.endColumn;
    if (!this._isValidPosition(startLineNumber, startColumn, 0 /* Relaxed */)) {
      return false;
    }
    if (!this._isValidPosition(endLineNumber, endColumn, 0 /* Relaxed */)) {
      return false;
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBeforeStart = startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0;
      const charCodeBeforeEnd = endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0;
      const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
      const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);
      if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
        return true;
      }
      return false;
    }
    return true;
  }
  validateRange(_range) {
    const validationType = 1 /* SurrogatePairs */;
    this._assertNotDisposed();
    if (_range instanceof Range && !(_range instanceof Selection)) {
      if (this._isValidRange(_range, validationType)) {
        return _range;
      }
    }
    const start = this._validatePosition(_range.startLineNumber, _range.startColumn, 0 /* Relaxed */);
    const end = this._validatePosition(_range.endLineNumber, _range.endColumn, 0 /* Relaxed */);
    const startLineNumber = start.lineNumber;
    const startColumn = start.column;
    const endLineNumber = end.lineNumber;
    const endColumn = end.column;
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBeforeStart = startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0;
      const charCodeBeforeEnd = endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0;
      const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
      const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);
      if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      }
      if (startLineNumber === endLineNumber && startColumn === endColumn) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn - 1);
      }
      if (startInsideSurrogatePair && endInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn + 1);
      }
      if (startInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn);
      }
      return new Range(startLineNumber, startColumn, endLineNumber, endColumn + 1);
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  modifyPosition(rawPosition, offset) {
    this._assertNotDisposed();
    const candidate = this.getOffsetAt(rawPosition) + offset;
    return this.getPositionAt(Math.min(this._buffer.getLength(), Math.max(0, candidate)));
  }
  getFullModelRange() {
    this._assertNotDisposed();
    const lineCount = this.getLineCount();
    return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    return this._buffer.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
  }
  findMatches(searchString, rawSearchScope, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount = LIMIT_FIND_COUNT) {
    this._assertNotDisposed();
    let searchRanges = null;
    if (rawSearchScope !== null && typeof rawSearchScope !== "boolean") {
      if (!Array.isArray(rawSearchScope)) {
        rawSearchScope = [rawSearchScope];
      }
      if (rawSearchScope.every((searchScope) => Range.isIRange(searchScope))) {
        searchRanges = rawSearchScope.map((searchScope) => this.validateRange(searchScope));
      }
    }
    if (searchRanges === null) {
      searchRanges = [this.getFullModelRange()];
    }
    searchRanges = searchRanges.sort((d1, d2) => d1.startLineNumber - d2.startLineNumber || d1.startColumn - d2.startColumn);
    const uniqueSearchRanges = [];
    uniqueSearchRanges.push(searchRanges.reduce((prev, curr) => {
      if (Range.areIntersecting(prev, curr)) {
        return prev.plusRange(curr);
      }
      uniqueSearchRanges.push(prev);
      return curr;
    }));
    let matchMapper;
    if (!isRegex && searchString.indexOf("\n") < 0) {
      const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        return [];
      }
      matchMapper = (searchRange) => this.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
    } else {
      matchMapper = (searchRange) => TextModelSearch.findMatches(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchRange, captureMatches, limitResultCount);
    }
    return uniqueSearchRanges.map(matchMapper).reduce((arr, matches) => arr.concat(matches), []);
  }
  findNextMatch(searchString, rawSearchStart, isRegex, matchCase, wordSeparators, captureMatches) {
    this._assertNotDisposed();
    const searchStart = this.validatePosition(rawSearchStart);
    if (!isRegex && searchString.indexOf("\n") < 0) {
      const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        return null;
      }
      const lineCount = this.getLineCount();
      let searchRange = new Range(searchStart.lineNumber, searchStart.column, lineCount, this.getLineMaxColumn(lineCount));
      let ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);
      TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
      if (ret.length > 0) {
        return ret[0];
      }
      searchRange = new Range(1, 1, searchStart.lineNumber, this.getLineMaxColumn(searchStart.lineNumber));
      ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);
      if (ret.length > 0) {
        return ret[0];
      }
      return null;
    }
    return TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
  }
  findPreviousMatch(searchString, rawSearchStart, isRegex, matchCase, wordSeparators, captureMatches) {
    this._assertNotDisposed();
    const searchStart = this.validatePosition(rawSearchStart);
    return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
  }
  //#endregion
  //#region Editing
  pushStackElement() {
    this._commandManager.pushStackElement();
  }
  popStackElement() {
    this._commandManager.popStackElement();
  }
  pushEOL(eol) {
    const currentEOL = this.getEOL() === "\n" ? model.EndOfLineSequence.LF : model.EndOfLineSequence.CRLF;
    if (currentEOL === eol) {
      return;
    }
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      if (this._initialUndoRedoSnapshot === null) {
        this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
      }
      this._commandManager.pushEOL(eol);
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _validateEditOperation(rawOperation) {
    if (rawOperation instanceof model.ValidAnnotatedEditOperation) {
      return rawOperation;
    }
    const validatedRange = this.validateRange(rawOperation.range);
    let opText = rawOperation.text;
    if (opText) {
      const endsWithLoneCR = opText.length > 0 && opText.charCodeAt(opText.length - 1) === CharCode.CarriageReturn;
      const removeTrailingCR = this.getEOL() === "\r\n" && endsWithLoneCR && validatedRange.endColumn === this.getLineMaxColumn(validatedRange.endLineNumber);
      if (removeTrailingCR) {
        opText = opText.substring(0, opText.length - 1);
      }
    }
    return new model.ValidAnnotatedEditOperation(
      rawOperation.identifier || null,
      validatedRange,
      opText,
      rawOperation.forceMoveMarkers || false,
      rawOperation.isAutoWhitespaceEdit || false,
      rawOperation._isTracked || false
    );
  }
  _validateEditOperations(rawOperations) {
    const result = [];
    for (let i = 0, len = rawOperations.length; i < len; i++) {
      result[i] = this._validateEditOperation(rawOperations[i]);
    }
    return result;
  }
  edit(edit, options) {
    this.pushEditOperations(null, edit.replacements.map((r) => ({ range: r.range, text: r.text })), null);
  }
  pushEditOperations(beforeCursorState, editOperations, cursorStateComputer, group, reason) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      return this._pushEditOperations(beforeCursorState, this._validateEditOperations(editOperations), cursorStateComputer, group, reason);
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _pushEditOperations(beforeCursorState, editOperations, cursorStateComputer, group, reason) {
    if (this._options.trimAutoWhitespace && this._trimAutoWhitespaceLines) {
      const incomingEdits = editOperations.map((op) => {
        return {
          range: this.validateRange(op.range),
          text: op.text
        };
      });
      let editsAreNearCursors = true;
      if (beforeCursorState) {
        for (let i = 0, len = beforeCursorState.length; i < len; i++) {
          const sel = beforeCursorState[i];
          let foundEditNearSel = false;
          for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
            const editRange = incomingEdits[j].range;
            const selIsAbove = editRange.startLineNumber > sel.endLineNumber;
            const selIsBelow = sel.startLineNumber > editRange.endLineNumber;
            if (!selIsAbove && !selIsBelow) {
              foundEditNearSel = true;
              break;
            }
          }
          if (!foundEditNearSel) {
            editsAreNearCursors = false;
            break;
          }
        }
      }
      if (editsAreNearCursors) {
        for (let i = 0, len = this._trimAutoWhitespaceLines.length; i < len; i++) {
          const trimLineNumber = this._trimAutoWhitespaceLines[i];
          const maxLineColumn = this.getLineMaxColumn(trimLineNumber);
          let allowTrimLine = true;
          for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
            const editRange = incomingEdits[j].range;
            const editText = incomingEdits[j].text;
            if (trimLineNumber < editRange.startLineNumber || trimLineNumber > editRange.endLineNumber) {
              continue;
            }
            if (trimLineNumber === editRange.startLineNumber && editRange.startColumn === maxLineColumn && editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(0) === "\n") {
              continue;
            }
            if (trimLineNumber === editRange.startLineNumber && editRange.startColumn === 1 && editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(editText.length - 1) === "\n") {
              continue;
            }
            allowTrimLine = false;
            break;
          }
          if (allowTrimLine) {
            const trimRange = new Range(trimLineNumber, 1, trimLineNumber, maxLineColumn);
            editOperations.push(new model.ValidAnnotatedEditOperation(null, trimRange, null, false, false, false));
          }
        }
      }
      this._trimAutoWhitespaceLines = null;
    }
    if (this._initialUndoRedoSnapshot === null) {
      this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
    }
    return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer, group, reason);
  }
  _applyUndo(changes, eol, resultingAlternativeVersionId, resultingSelection) {
    const edits = changes.map((change) => {
      const rangeStart = this.getPositionAt(change.newPosition);
      const rangeEnd = this.getPositionAt(change.newEnd);
      return {
        range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
        text: change.oldText
      };
    });
    this._applyUndoRedoEdits(edits, eol, true, false, resultingAlternativeVersionId, resultingSelection);
  }
  _applyRedo(changes, eol, resultingAlternativeVersionId, resultingSelection) {
    const edits = changes.map((change) => {
      const rangeStart = this.getPositionAt(change.oldPosition);
      const rangeEnd = this.getPositionAt(change.oldEnd);
      return {
        range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
        text: change.newText
      };
    });
    this._applyUndoRedoEdits(edits, eol, false, true, resultingAlternativeVersionId, resultingSelection);
  }
  _applyUndoRedoEdits(edits, eol, isUndoing, isRedoing, resultingAlternativeVersionId, resultingSelection) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      this._isUndoing = isUndoing;
      this._isRedoing = isRedoing;
      const operations = this._validateEditOperations(edits);
      this._doApplyEdits(operations, false, EditSources.applyEdits(), resultingSelection);
      this.setEOL(eol);
      this._overwriteAlternativeVersionId(resultingAlternativeVersionId);
    } finally {
      this._isUndoing = false;
      this._isRedoing = false;
      this._eventEmitter.endDeferredEmit(resultingSelection);
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  applyEdits(rawOperations, computeUndoEdits, reason) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      const operations = this._validateEditOperations(rawOperations);
      return this._doApplyEdits(operations, computeUndoEdits ?? false, reason ?? EditSources.applyEdits());
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _doApplyEdits(rawOperations, computeUndoEdits, reason, resultingSelection = null) {
    const oldLineCount = this._buffer.getLineCount();
    const result = this._buffer.applyEdits(rawOperations, this._options.trimAutoWhitespace, computeUndoEdits);
    const newLineCount = this._buffer.getLineCount();
    const contentChanges = result.changes;
    this._trimAutoWhitespaceLines = result.trimAutoWhitespaceLineNumbers;
    if (contentChanges.length !== 0) {
      for (let i = 0, len = contentChanges.length; i < len; i++) {
        const change = contentChanges[i];
        this._decorationsTree.acceptReplace(change.rangeOffset, change.rangeLength, change.text.length, change.forceMoveMarkers);
      }
      const rawContentChanges = [];
      this._increaseVersionId();
      let lineCount = oldLineCount;
      for (let i = 0, len = contentChanges.length; i < len; i++) {
        const change = contentChanges[i];
        const [eolCount] = countEOL(change.text);
        this._onDidChangeDecorations.fire();
        const startLineNumber = change.range.startLineNumber;
        const endLineNumber = change.range.endLineNumber;
        const deletingLinesCnt = endLineNumber - startLineNumber;
        const insertingLinesCnt = eolCount;
        const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);
        const changeLineCountDelta = insertingLinesCnt - deletingLinesCnt;
        const currentEditStartLineNumber = newLineCount - lineCount - changeLineCountDelta + startLineNumber;
        for (let j = editingLinesCnt; j >= 0; j--) {
          const editLineNumber = startLineNumber + j;
          const currentEditLineNumber = currentEditStartLineNumber + j;
          rawContentChanges.push(
            new ModelRawLineChanged(
              editLineNumber,
              currentEditLineNumber
            )
          );
        }
        if (editingLinesCnt < deletingLinesCnt) {
          const spliceStartLineNumber = startLineNumber + editingLinesCnt;
          const cnt = insertingLinesCnt - deletingLinesCnt;
          const lastUntouchedLinePostEdit = newLineCount - lineCount - cnt + spliceStartLineNumber;
          rawContentChanges.push(new ModelRawLinesDeleted(spliceStartLineNumber + 1, endLineNumber, lastUntouchedLinePostEdit));
        }
        if (editingLinesCnt < insertingLinesCnt) {
          const spliceLineNumber = startLineNumber + editingLinesCnt;
          const cnt = insertingLinesCnt - editingLinesCnt;
          const fromLineNumber = newLineCount - lineCount - cnt + spliceLineNumber + 1;
          rawContentChanges.push(
            new ModelRawLinesInserted(
              spliceLineNumber + 1,
              fromLineNumber,
              cnt
            )
          );
        }
        lineCount += changeLineCountDelta;
      }
      this._emitContentChangedEvent(
        new ModelRawContentChangedEvent(
          rawContentChanges,
          this.getVersionId(),
          this._isUndoing,
          this._isRedoing
        ),
        {
          changes: contentChanges,
          eol: this._buffer.getEOL(),
          isEolChange: false,
          versionId: this.getVersionId(),
          isUndoing: this._isUndoing,
          isRedoing: this._isRedoing,
          isFlush: false,
          detailedReasons: [reason],
          detailedReasonsChangeLengths: [contentChanges.length]
        },
        resultingSelection
      );
    }
    return result.reverseEdits === null ? void 0 : result.reverseEdits;
  }
  undo() {
    return this._undoRedoService.undo(this.uri);
  }
  canUndo() {
    return this._undoRedoService.canUndo(this.uri);
  }
  redo() {
    return this._undoRedoService.redo(this.uri);
  }
  canRedo() {
    return this._undoRedoService.canRedo(this.uri);
  }
  //#endregion
  //#region Decorations
  handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines, affectedLineHeights, affectedFontLines) {
    if (affectedInjectedTextLines && affectedInjectedTextLines.size > 0) {
      const affectedLines = Array.from(affectedInjectedTextLines);
      const lineChangeEvents = affectedLines.map((lineNumber) => new ModelRawLineChanged(lineNumber, lineNumber));
      this._onDidChangeContentOrInjectedText(new ModelInjectedTextChangedEvent(lineChangeEvents));
    }
    this._fireOnDidChangeLineHeight(affectedLineHeights);
    this._fireOnDidChangeFont(affectedFontLines);
  }
  _fireOnDidChangeLineHeight(affectedLineHeights) {
    if (affectedLineHeights && affectedLineHeights.size > 0) {
      const affectedLines = Array.from(affectedLineHeights);
      const lineHeightChangeEvent = affectedLines.map((specialLineHeightChange) => new ModelLineHeightChanged(specialLineHeightChange.ownerId, specialLineHeightChange.decorationId, specialLineHeightChange.lineNumber, specialLineHeightChange.lineHeight));
      this._onDidChangeLineHeight.fire(new ModelLineHeightChangedEvent(lineHeightChangeEvent));
    }
  }
  _fireOnDidChangeFont(affectedFontLines) {
    if (affectedFontLines && affectedFontLines.size > 0) {
      const affectedLines = Array.from(affectedFontLines);
      const fontChangeEvent = affectedLines.map((fontChange) => new ModelFontChanged(fontChange.ownerId, fontChange.lineNumber));
      this._onDidChangeFont.fire(new ModelFontChangedEvent(fontChangeEvent));
    }
  }
  _onDidChangeContentOrInjectedText(e) {
    for (const viewModel of this._viewModels) {
      try {
        viewModel.onDidChangeContentOrInjectedText(e);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    for (const viewModel of this._viewModels) {
      try {
        viewModel.emitContentChangeEvent(e);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
  }
  changeDecorations(callback, ownerId = 0) {
    this._assertNotDisposed();
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      return this._changeDecorations(ownerId, callback);
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _changeDecorations(ownerId, callback) {
    const changeAccessor = {
      addDecoration: (range, options) => {
        return this._deltaDecorationsImpl(ownerId, [], [{ range, options }])[0];
      },
      changeDecoration: (id, newRange) => {
        this._changeDecorationImpl(ownerId, id, newRange);
      },
      changeDecorationOptions: (id, options) => {
        this._changeDecorationOptionsImpl(ownerId, id, _normalizeOptions(options));
      },
      removeDecoration: (id) => {
        this._deltaDecorationsImpl(ownerId, [id], []);
      },
      deltaDecorations: (oldDecorations, newDecorations) => {
        if (oldDecorations.length === 0 && newDecorations.length === 0) {
          return [];
        }
        return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
      }
    };
    let result = null;
    try {
      result = callback(changeAccessor);
    } catch (e) {
      onUnexpectedError(e);
    }
    changeAccessor.addDecoration = invalidFunc;
    changeAccessor.changeDecoration = invalidFunc;
    changeAccessor.changeDecorationOptions = invalidFunc;
    changeAccessor.removeDecoration = invalidFunc;
    changeAccessor.deltaDecorations = invalidFunc;
    return result;
  }
  deltaDecorations(oldDecorations, newDecorations, ownerId = 0) {
    this._assertNotDisposed();
    if (!oldDecorations) {
      oldDecorations = [];
    }
    if (oldDecorations.length === 0 && newDecorations.length === 0) {
      return [];
    }
    try {
      this._deltaDecorationCallCnt++;
      if (this._deltaDecorationCallCnt > 1) {
        console.warn(`Invoking deltaDecorations recursively could lead to leaking decorations.`);
        onUnexpectedError(new Error(`Invoking deltaDecorations recursively could lead to leaking decorations.`));
      }
      this._onDidChangeDecorations.beginDeferredEmit();
      return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
      this._deltaDecorationCallCnt--;
    }
  }
  _getTrackedRange(id) {
    return this.getDecorationRange(id);
  }
  _setTrackedRange(id, newRange, newStickiness) {
    const node = id ? this._decorations[id] : null;
    if (!node) {
      if (!newRange) {
        return null;
      }
      return this._deltaDecorationsImpl(0, [], [{ range: newRange, options: TRACKED_RANGE_OPTIONS[newStickiness] }], true)[0];
    }
    if (!newRange) {
      this._decorationsTree.delete(node);
      delete this._decorations[node.id];
      return null;
    }
    const range = this._validateRangeRelaxedNoAllocations(newRange);
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    this._decorationsTree.delete(node);
    node.reset(this.getVersionId(), startOffset, endOffset, range);
    node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
    this._decorationsTree.insert(node);
    return node.id;
  }
  removeAllDecorationsWithOwnerId(ownerId) {
    if (this._isDisposed) {
      return;
    }
    const nodes = this._decorationsTree.collectNodesFromOwner(ownerId);
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];
      this._decorationsTree.delete(node);
      delete this._decorations[node.id];
    }
  }
  getDecorationOptions(decorationId) {
    const node = this._decorations[decorationId];
    if (!node) {
      return null;
    }
    return node.options;
  }
  getDecorationRange(decorationId) {
    const node = this._decorations[decorationId];
    if (!node) {
      return null;
    }
    return this._decorationsTree.getNodeRange(this, node);
  }
  getLineDecorations(lineNumber, ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      return [];
    }
    return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation, filterFontDecorations);
  }
  getLinesDecorations(_startLineNumber, _endLineNumber, ownerId = 0, filterOutValidation = false, filterFontDecorations = false, onlyMarginDecorations = false) {
    const lineCount = this.getLineCount();
    const startLineNumber = Math.min(lineCount, Math.max(1, _startLineNumber));
    const endLineNumber = Math.min(lineCount, Math.max(1, _endLineNumber));
    const endColumn = this.getLineMaxColumn(endLineNumber);
    const range = new Range(startLineNumber, 1, endLineNumber, endColumn);
    const decorations = this._getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
    pushMany(decorations, this._decorationProvider.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations));
    pushMany(decorations, this._fontTokenDecorationsProvider.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations));
    return decorations;
  }
  getDecorationsInRange(range, ownerId = 0, filterOutValidation = false, filterFontDecorations = false, onlyMinimapDecorations = false, onlyMarginDecorations = false) {
    const validatedRange = this.validateRange(range);
    const decorations = this._getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
    pushMany(decorations, this._decorationProvider.getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
    pushMany(decorations, this._fontTokenDecorationsProvider.getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
    return decorations;
  }
  getOverviewRulerDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    return this._decorationsTree.getAll(this, ownerId, filterOutValidation, filterFontDecorations, true, false);
  }
  getInjectedTextDecorations(ownerId = 0) {
    return this._decorationsTree.getAllInjectedText(this, ownerId);
  }
  getCustomLineHeightsDecorations(ownerId = 0) {
    const decs = this._decorationsTree.getAllCustomLineHeights(this, ownerId);
    pushMany(decs, this._fontTokenDecorationsProvider.getAllDecorations(ownerId));
    return decs;
  }
  getCustomLineHeightsDecorationsInRange(range, ownerId = 0) {
    const decs = this._decorationsTree.getCustomLineHeightsInInterval(this, this.getOffsetAt(range.getStartPosition()), this.getOffsetAt(range.getEndPosition()), ownerId);
    pushMany(decs, this._fontTokenDecorationsProvider.getDecorationsInRange(range, ownerId));
    return decs;
  }
  getLineInjectedText(lineNumber, ownerId = 0) {
    const startOffset = this._buffer.getOffsetAt(lineNumber, 1);
    const endOffset = startOffset + this._buffer.getLineLength(lineNumber);
    const result = this._decorationsTree.getInjectedTextInInterval(this, startOffset, endOffset, ownerId);
    return LineInjectedText.fromDecorations(result).filter((t) => t.lineNumber === lineNumber);
  }
  getFontDecorationsInRange(range, ownerId = 0) {
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    return this._decorationsTree.getFontDecorationsInInterval(this, startOffset, endOffset, ownerId);
  }
  getAllDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    let result = this._decorationsTree.getAll(this, ownerId, filterOutValidation, filterFontDecorations, false, false);
    result = result.concat(this._decorationProvider.getAllDecorations(ownerId, filterOutValidation));
    result = result.concat(this._fontTokenDecorationsProvider.getAllDecorations(ownerId, filterOutValidation));
    return result;
  }
  getAllMarginDecorations(ownerId = 0) {
    return this._decorationsTree.getAll(this, ownerId, false, false, false, true);
  }
  _getDecorationsInRange(filterRange, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations) {
    const startOffset = this._buffer.getOffsetAt(filterRange.startLineNumber, filterRange.startColumn);
    const endOffset = this._buffer.getOffsetAt(filterRange.endLineNumber, filterRange.endColumn);
    return this._decorationsTree.getAllInInterval(this, startOffset, endOffset, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
  }
  getRangeAt(start, end) {
    return this._buffer.getRangeAt(start, end - start);
  }
  _changeDecorationImpl(ownerId, decorationId, _range) {
    const node = this._decorations[decorationId];
    if (!node) {
      return;
    }
    if (node.options.after) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange.endLineNumber);
    }
    if (node.options.before) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange.startLineNumber);
    }
    if (node.options.lineHeight !== null) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, oldRange.startLineNumber, null);
    }
    if (node.options.affectsFont) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, oldRange.startLineNumber);
    }
    const range = this._validateRangeRelaxedNoAllocations(_range);
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    this._decorationsTree.delete(node);
    node.reset(this.getVersionId(), startOffset, endOffset, range);
    this._decorationsTree.insert(node);
    this._onDidChangeDecorations.checkAffectedAndFire(node.options);
    if (node.options.after) {
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
    }
    if (node.options.before) {
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
    }
    if (node.options.lineHeight !== null) {
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, range.startLineNumber, node.options.lineHeight);
    }
    if (node.options.affectsFont) {
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, range.startLineNumber);
    }
  }
  _changeDecorationOptionsImpl(ownerId, decorationId, options) {
    const node = this._decorations[decorationId];
    if (!node) {
      return;
    }
    const nodeWasInOverviewRuler = node.options.overviewRuler && node.options.overviewRuler.color ? true : false;
    const nodeIsInOverviewRuler = options.overviewRuler && options.overviewRuler.color ? true : false;
    this._onDidChangeDecorations.checkAffectedAndFire(node.options);
    this._onDidChangeDecorations.checkAffectedAndFire(options);
    if (node.options.after || options.after) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
    }
    if (node.options.before || options.before) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
    }
    if (node.options.lineHeight !== null || options.lineHeight !== null) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, options.lineHeight);
    }
    if (node.options.affectsFont || options.affectsFont) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, decorationId, nodeRange.startLineNumber);
    }
    const movedInOverviewRuler = nodeWasInOverviewRuler !== nodeIsInOverviewRuler;
    const changedWhetherInjectedText = isOptionsInjectedText(options) !== isNodeInjectedText(node);
    if (movedInOverviewRuler || changedWhetherInjectedText) {
      this._decorationsTree.delete(node);
      node.setOptions(options);
      this._decorationsTree.insert(node);
    } else {
      node.setOptions(options);
    }
  }
  _deltaDecorationsImpl(ownerId, oldDecorationsIds, newDecorations, suppressEvents = false) {
    const versionId = this.getVersionId();
    const oldDecorationsLen = oldDecorationsIds.length;
    let oldDecorationIndex = 0;
    const newDecorationsLen = newDecorations.length;
    let newDecorationIndex = 0;
    this._onDidChangeDecorations.beginDeferredEmit();
    try {
      const result = new Array(newDecorationsLen);
      while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {
        let node = null;
        if (oldDecorationIndex < oldDecorationsLen) {
          let decorationId;
          do {
            decorationId = oldDecorationsIds[oldDecorationIndex++];
            node = this._decorations[decorationId];
          } while (!node && oldDecorationIndex < oldDecorationsLen);
          if (node) {
            if (node.options.after) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
            }
            if (node.options.before) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
            }
            if (node.options.lineHeight !== null) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, null);
            }
            if (node.options.affectsFont) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, decorationId, nodeRange.startLineNumber);
            }
            this._decorationsTree.delete(node);
            if (!suppressEvents) {
              this._onDidChangeDecorations.checkAffectedAndFire(node.options);
            }
          }
        }
        if (newDecorationIndex < newDecorationsLen) {
          if (!node) {
            const internalDecorationId = ++this._lastDecorationId;
            const decorationId = `${this._instanceId};${internalDecorationId}`;
            node = new IntervalNode(decorationId, 0, 0);
            this._decorations[decorationId] = node;
          }
          const newDecoration = newDecorations[newDecorationIndex];
          const range = this._validateRangeRelaxedNoAllocations(newDecoration.range);
          const options = _normalizeOptions(newDecoration.options);
          const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
          const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
          node.ownerId = ownerId;
          node.reset(versionId, startOffset, endOffset, range);
          node.setOptions(options);
          if (node.options.after) {
            this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
          }
          if (node.options.before) {
            this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
          }
          if (node.options.lineHeight !== null) {
            this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, node.id, range.startLineNumber, node.options.lineHeight);
          }
          if (node.options.affectsFont) {
            this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, range.startLineNumber);
          }
          if (!suppressEvents) {
            this._onDidChangeDecorations.checkAffectedAndFire(options);
          }
          this._decorationsTree.insert(node);
          result[newDecorationIndex] = node.id;
          newDecorationIndex++;
        } else {
          if (node) {
            delete this._decorations[node.id];
          }
        }
      }
      return result;
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  //#endregion
  //#region Tokenization
  // TODO move them to the tokenization part.
  getLanguageId() {
    return this.tokenization.getLanguageId();
  }
  setLanguage(languageIdOrSelection, source) {
    if (typeof languageIdOrSelection === "string") {
      this._languageSelectionListener.clear();
      this._setLanguage(languageIdOrSelection, source);
    } else {
      this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId, source));
      this._setLanguage(languageIdOrSelection.languageId, source);
    }
  }
  _setLanguage(languageId, source) {
    this.tokenization.setLanguageId(languageId, source);
    this._languageService.requestRichLanguageFeatures(languageId);
  }
  getLanguageIdAtPosition(lineNumber, column) {
    return this.tokenization.getLanguageIdAtPosition(lineNumber, column);
  }
  getWordAtPosition(position) {
    return this._tokenizationTextModelPart.getWordAtPosition(position);
  }
  getWordUntilPosition(position) {
    return this._tokenizationTextModelPart.getWordUntilPosition(position);
  }
  //#endregion
  normalizePosition(position, affinity) {
    return position;
  }
  /**
   * Gets the column at which indentation stops at a given line.
   * @internal
  */
  getLineIndentColumn(lineNumber) {
    return indentOfLine(this.getLineContent(lineNumber)) + 1;
  }
  toString() {
    return `TextModel(${this.uri.toString()})`;
  }
};
TextModel._MODEL_SYNC_LIMIT = 50 * 1024 * 1024;
// 50 MB,  // used in tests
TextModel.LARGE_FILE_SIZE_THRESHOLD = 20 * 1024 * 1024;
// 20 MB;
TextModel.LARGE_FILE_LINE_COUNT_THRESHOLD = 300 * 1e3;
// 300K lines
TextModel.LARGE_FILE_HEAP_OPERATION_THRESHOLD = 256 * 1024 * 1024;
// 256M characters, usually ~> 512MB memory usage
TextModel.DEFAULT_CREATION_OPTIONS = {
  isForSimpleWidget: false,
  tabSize: EDITOR_MODEL_DEFAULTS.tabSize,
  indentSize: EDITOR_MODEL_DEFAULTS.indentSize,
  insertSpaces: EDITOR_MODEL_DEFAULTS.insertSpaces,
  detectIndentation: false,
  defaultEOL: model.DefaultEndOfLine.LF,
  trimAutoWhitespace: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
  largeFileOptimizations: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
  bracketPairColorizationOptions: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions
};
TextModel = __decorateClass([
  __decorateParam(4, IUndoRedoService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, ILanguageConfigurationService),
  __decorateParam(7, IInstantiationService)
], TextModel);
function getLineTokensWithInjections(tokens, injectionOptions, injectionOffsets) {
  let lineTokens;
  if (injectionOffsets) {
    const tokensToInsert = [];
    for (let idx = 0; idx < injectionOffsets.length; idx++) {
      const offset = injectionOffsets[idx];
      const tokens2 = injectionOptions[idx].tokens;
      if (tokens2) {
        tokens2.forEach((range, info) => {
          tokensToInsert.push({
            offset,
            text: range.substring(injectionOptions[idx].content),
            tokenMetadata: info.metadata
          });
        });
      } else {
        tokensToInsert.push({
          offset,
          text: injectionOptions[idx].content,
          tokenMetadata: LineTokens.defaultTokenMetadata
        });
      }
    }
    lineTokens = tokens.withInserted(tokensToInsert);
  } else {
    lineTokens = tokens;
  }
  return lineTokens;
}
function indentOfLine(line) {
  let indent = 0;
  for (const c of line) {
    if (c === " " || c === "	") {
      indent++;
    } else {
      break;
    }
  }
  return indent;
}
function isNodeInOverviewRuler(node) {
  return node.options.overviewRuler && node.options.overviewRuler.color ? true : false;
}
function isOptionsInjectedText(options) {
  return !!options.after || !!options.before;
}
function isNodeInjectedText(node) {
  return !!node.options.after || !!node.options.before;
}
class DecorationsTrees {
  constructor() {
    this._decorationsTree0 = new IntervalTree();
    this._decorationsTree1 = new IntervalTree();
    this._injectedTextDecorationsTree = new IntervalTree();
  }
  ensureAllNodesHaveRanges(host) {
    this.getAll(host, 0, false, false, false, false);
  }
  _ensureNodesHaveRanges(host, nodes) {
    for (const node of nodes) {
      if (node.range === null) {
        node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
      }
    }
    return nodes;
  }
  getAllInInterval(host, start, end, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations) {
    const versionId = host.getVersionId();
    const result = this._intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, versionId, onlyMarginDecorations);
    return this._ensureNodesHaveRanges(host, result);
  }
  _intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    const r0 = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    const r1 = this._decorationsTree1.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    const r2 = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    return r0.concat(r1).concat(r2);
  }
  getInjectedTextInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
  }
  getFontDecorationsInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const decorations = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, decorations).filter((i) => i.options.affectsFont);
  }
  getAllInjectedText(host, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._injectedTextDecorationsTree.search(filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
  }
  getAllCustomLineHeights(host, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._search(filterOwnerId, false, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => typeof i.options.lineHeight === "number");
  }
  getCustomLineHeightsInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => typeof i.options.lineHeight === "number");
  }
  getAll(host, filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, onlyMarginDecorations) {
    const versionId = host.getVersionId();
    const result = this._search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, versionId, onlyMarginDecorations);
    return this._ensureNodesHaveRanges(host, result);
  }
  _search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, cachedVersionId, onlyMarginDecorations) {
    if (overviewRulerOnly) {
      return this._decorationsTree1.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    } else {
      const r0 = this._decorationsTree0.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      const r1 = this._decorationsTree1.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      const r2 = this._injectedTextDecorationsTree.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      return r0.concat(r1).concat(r2);
    }
  }
  collectNodesFromOwner(ownerId) {
    const r0 = this._decorationsTree0.collectNodesFromOwner(ownerId);
    const r1 = this._decorationsTree1.collectNodesFromOwner(ownerId);
    const r2 = this._injectedTextDecorationsTree.collectNodesFromOwner(ownerId);
    return r0.concat(r1).concat(r2);
  }
  collectNodesPostOrder() {
    const r0 = this._decorationsTree0.collectNodesPostOrder();
    const r1 = this._decorationsTree1.collectNodesPostOrder();
    const r2 = this._injectedTextDecorationsTree.collectNodesPostOrder();
    return r0.concat(r1).concat(r2);
  }
  insert(node) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.insert(node);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.insert(node);
    } else {
      this._decorationsTree0.insert(node);
    }
  }
  delete(node) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.delete(node);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.delete(node);
    } else {
      this._decorationsTree0.delete(node);
    }
  }
  getNodeRange(host, node) {
    const versionId = host.getVersionId();
    if (node.cachedVersionId !== versionId) {
      this._resolveNode(node, versionId);
    }
    if (node.range === null) {
      node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
    }
    return node.range;
  }
  _resolveNode(node, cachedVersionId) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.resolveNode(node, cachedVersionId);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.resolveNode(node, cachedVersionId);
    } else {
      this._decorationsTree0.resolveNode(node, cachedVersionId);
    }
  }
  acceptReplace(offset, length, textLength, forceMoveMarkers) {
    this._decorationsTree0.acceptReplace(offset, length, textLength, forceMoveMarkers);
    this._decorationsTree1.acceptReplace(offset, length, textLength, forceMoveMarkers);
    this._injectedTextDecorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
  }
}
function cleanClassName(className) {
  return className.replace(/[^a-z0-9\-_]/gi, " ");
}
class DecorationOptions {
  constructor(options) {
    this.color = options.color || "";
    this.darkColor = options.darkColor || "";
  }
}
class ModelDecorationOverviewRulerOptions extends DecorationOptions {
  constructor(options) {
    super(options);
    this._resolvedColor = null;
    this.position = typeof options.position === "number" ? options.position : model.OverviewRulerLane.Center;
  }
  getColor(theme) {
    if (!this._resolvedColor) {
      if (isDark(theme.type) && this.darkColor) {
        this._resolvedColor = this._resolveColor(this.darkColor, theme);
      } else {
        this._resolvedColor = this._resolveColor(this.color, theme);
      }
    }
    return this._resolvedColor;
  }
  invalidateCachedColor() {
    this._resolvedColor = null;
  }
  _resolveColor(color, theme) {
    if (typeof color === "string") {
      return color;
    }
    const c = color ? theme.getColor(color.id) : null;
    if (!c) {
      return "";
    }
    return c.toString();
  }
}
class ModelDecorationGlyphMarginOptions {
  constructor(options) {
    this.position = options?.position ?? model.GlyphMarginLane.Center;
    this.persistLane = options?.persistLane;
  }
}
class ModelDecorationMinimapOptions extends DecorationOptions {
  constructor(options) {
    super(options);
    this.position = options.position;
    this.sectionHeaderStyle = options.sectionHeaderStyle ?? null;
    this.sectionHeaderText = options.sectionHeaderText ?? null;
  }
  getColor(theme) {
    if (!this._resolvedColor) {
      if (isDark(theme.type) && this.darkColor) {
        this._resolvedColor = this._resolveColor(this.darkColor, theme);
      } else {
        this._resolvedColor = this._resolveColor(this.color, theme);
      }
    }
    return this._resolvedColor;
  }
  invalidateCachedColor() {
    this._resolvedColor = void 0;
  }
  _resolveColor(color, theme) {
    if (typeof color === "string") {
      return Color.fromHex(color);
    }
    return theme.getColor(color.id);
  }
}
class ModelDecorationInjectedTextOptions {
  static from(options) {
    if (options instanceof ModelDecorationInjectedTextOptions) {
      return options;
    }
    return new ModelDecorationInjectedTextOptions(options);
  }
  constructor(options) {
    this.content = options.content || "";
    this.tokens = options.tokens ?? null;
    this.inlineClassName = options.inlineClassName || null;
    this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
    this.attachedData = options.attachedData || null;
    this.cursorStops = options.cursorStops || null;
  }
}
class ModelDecorationOptions {
  static register(options) {
    return new ModelDecorationOptions(options);
  }
  static createDynamic(options) {
    return new ModelDecorationOptions(options);
  }
  constructor(options) {
    this.description = options.description;
    this.blockClassName = options.blockClassName ? cleanClassName(options.blockClassName) : null;
    this.blockDoesNotCollapse = options.blockDoesNotCollapse ?? null;
    this.blockIsAfterEnd = options.blockIsAfterEnd ?? null;
    this.blockPadding = options.blockPadding ?? null;
    this.stickiness = options.stickiness || model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
    this.zIndex = options.zIndex || 0;
    this.className = options.className ? cleanClassName(options.className) : null;
    this.shouldFillLineOnLineBreak = options.shouldFillLineOnLineBreak ?? null;
    this.hoverMessage = options.hoverMessage || null;
    this.glyphMarginHoverMessage = options.glyphMarginHoverMessage || null;
    this.lineNumberHoverMessage = options.lineNumberHoverMessage || null;
    this.isWholeLine = options.isWholeLine || false;
    this.lineHeight = options.lineHeight ? Math.min(options.lineHeight, LINE_HEIGHT_CEILING) : null;
    this.fontSize = options.fontSize || null;
    this.affectsFont = !!options.fontSize || !!options.fontFamily || !!options.fontWeight || !!options.fontStyle;
    this.showIfCollapsed = options.showIfCollapsed || false;
    this.collapseOnReplaceEdit = options.collapseOnReplaceEdit || false;
    this.overviewRuler = options.overviewRuler ? new ModelDecorationOverviewRulerOptions(options.overviewRuler) : null;
    this.minimap = options.minimap ? new ModelDecorationMinimapOptions(options.minimap) : null;
    this.glyphMargin = options.glyphMarginClassName ? new ModelDecorationGlyphMarginOptions(options.glyphMargin) : null;
    this.glyphMarginClassName = options.glyphMarginClassName ? cleanClassName(options.glyphMarginClassName) : null;
    this.linesDecorationsClassName = options.linesDecorationsClassName ? cleanClassName(options.linesDecorationsClassName) : null;
    this.lineNumberClassName = options.lineNumberClassName ? cleanClassName(options.lineNumberClassName) : null;
    this.linesDecorationsTooltip = options.linesDecorationsTooltip ? strings.htmlAttributeEncodeValue(options.linesDecorationsTooltip) : null;
    this.firstLineDecorationClassName = options.firstLineDecorationClassName ? cleanClassName(options.firstLineDecorationClassName) : null;
    this.marginClassName = options.marginClassName ? cleanClassName(options.marginClassName) : null;
    this.inlineClassName = options.inlineClassName ? cleanClassName(options.inlineClassName) : null;
    this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
    this.beforeContentClassName = options.beforeContentClassName ? cleanClassName(options.beforeContentClassName) : null;
    this.afterContentClassName = options.afterContentClassName ? cleanClassName(options.afterContentClassName) : null;
    this.after = options.after ? ModelDecorationInjectedTextOptions.from(options.after) : null;
    this.before = options.before ? ModelDecorationInjectedTextOptions.from(options.before) : null;
    this.hideInCommentTokens = options.hideInCommentTokens ?? false;
    this.hideInStringTokens = options.hideInStringTokens ?? false;
    this.textDirection = options.textDirection ?? null;
  }
}
ModelDecorationOptions.EMPTY = ModelDecorationOptions.register({ description: "empty" });
const TRACKED_RANGE_OPTIONS = [
  ModelDecorationOptions.register({ description: "tracked-range-always-grows-when-typing-at-edges", stickiness: model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "tracked-range-never-grows-when-typing-at-edges", stickiness: model.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "tracked-range-grows-only-when-typing-before", stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
  ModelDecorationOptions.register({ description: "tracked-range-grows-only-when-typing-after", stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter })
];
function _normalizeOptions(options) {
  if (options instanceof ModelDecorationOptions) {
    return options;
  }
  return ModelDecorationOptions.createDynamic(options);
}
class DidChangeDecorationsEmitter extends Disposable {
  constructor(handleBeforeFire) {
    super();
    this.handleBeforeFire = handleBeforeFire;
    this._actual = this._register(new Emitter());
    this.event = this._actual.event;
    this._affectedInjectedTextLines = null;
    this._affectedLineHeights = null;
    this._affectedFontLines = null;
    this._deferredCnt = 0;
    this._shouldFireDeferred = false;
    this._affectsMinimap = false;
    this._affectsOverviewRuler = false;
    this._affectsGlyphMargin = false;
    this._affectsLineNumber = false;
  }
  hasListeners() {
    return this._actual.hasListeners();
  }
  beginDeferredEmit() {
    this._deferredCnt++;
  }
  endDeferredEmit() {
    this._deferredCnt--;
    if (this._deferredCnt === 0) {
      if (this._shouldFireDeferred) {
        this.doFire();
      }
      this._affectedInjectedTextLines?.clear();
      this._affectedInjectedTextLines = null;
      this._affectedLineHeights?.clear();
      this._affectedLineHeights = null;
      this._affectedFontLines?.clear();
      this._affectedFontLines = null;
    }
  }
  recordLineAffectedByInjectedText(lineNumber) {
    if (!this._affectedInjectedTextLines) {
      this._affectedInjectedTextLines = /* @__PURE__ */ new Set();
    }
    this._affectedInjectedTextLines.add(lineNumber);
  }
  recordLineAffectedByLineHeightChange(ownerId, decorationId, lineNumber, lineHeight) {
    if (!this._affectedLineHeights) {
      this._affectedLineHeights = new SetWithKey([], LineHeightChangingDecoration.toKey);
    }
    this._affectedLineHeights.add(new LineHeightChangingDecoration(ownerId, decorationId, lineNumber, lineHeight));
  }
  recordLineAffectedByFontChange(ownerId, decorationId, lineNumber) {
    if (!this._affectedFontLines) {
      this._affectedFontLines = new SetWithKey([], LineFontChangingDecoration.toKey);
    }
    this._affectedFontLines.add(new LineFontChangingDecoration(ownerId, decorationId, lineNumber));
  }
  checkAffectedAndFire(options) {
    this._affectsMinimap ||= !!options.minimap?.position;
    this._affectsOverviewRuler ||= !!options.overviewRuler?.color;
    this._affectsGlyphMargin ||= !!options.glyphMarginClassName;
    this._affectsLineNumber ||= !!options.lineNumberClassName;
    this.tryFire();
  }
  fire() {
    this._affectsMinimap = true;
    this._affectsOverviewRuler = true;
    this._affectsGlyphMargin = true;
    this.tryFire();
  }
  tryFire() {
    if (this._deferredCnt === 0) {
      this.doFire();
    } else {
      this._shouldFireDeferred = true;
    }
  }
  doFire() {
    this.handleBeforeFire(this._affectedInjectedTextLines, this._affectedLineHeights, this._affectedFontLines);
    const event = {
      affectsMinimap: this._affectsMinimap,
      affectsOverviewRuler: this._affectsOverviewRuler,
      affectsGlyphMargin: this._affectsGlyphMargin,
      affectsLineNumber: this._affectsLineNumber
    };
    this._shouldFireDeferred = false;
    this._affectsMinimap = false;
    this._affectsOverviewRuler = false;
    this._affectsGlyphMargin = false;
    this._actual.fire(event);
  }
}
class DidChangeContentEmitter extends Disposable {
  constructor() {
    super();
    this._emitter = this._register(new Emitter());
    this.event = this._emitter.event;
    this._deferredCnt = 0;
    this._deferredEvent = null;
  }
  hasListeners() {
    return this._emitter.hasListeners();
  }
  beginDeferredEmit() {
    this._deferredCnt++;
  }
  endDeferredEmit(resultingSelection = null) {
    this._deferredCnt--;
    if (this._deferredCnt === 0) {
      if (this._deferredEvent !== null) {
        this._deferredEvent.rawContentChangedEvent.resultingSelection = resultingSelection;
        const e = this._deferredEvent;
        this._deferredEvent = null;
        this._emitter.fire(e);
      }
    }
  }
  fire(e) {
    if (this._deferredCnt > 0) {
      if (this._deferredEvent) {
        this._deferredEvent = this._deferredEvent.merge(e);
      } else {
        this._deferredEvent = e;
      }
      return;
    }
    this._emitter.fire(e);
  }
}
export {
  ModelDecorationGlyphMarginOptions,
  ModelDecorationInjectedTextOptions,
  ModelDecorationMinimapOptions,
  ModelDecorationOptions,
  ModelDecorationOverviewRulerOptions,
  TextModel,
  createTextBuffer,
  createTextBufferFactory,
  createTextBufferFactoryFromSnapshot,
  createTextBufferFactoryFromStream,
  getLineTokensWithInjections,
  indentOfLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcHVzaE1hbnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBTZXRXaXRoS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIGlsbGVnYWxBcmd1bWVudCwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbGlzdGVuU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlLCBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90LCBVbmRvUmVkb0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBjb3VudEVPTCB9IGZyb20gJy4uL2NvcmUvbWlzYy9lb2xDb3VudGVyLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZUluZGVudGF0aW9uIH0gZnJvbSAnLi4vY29yZS9taXNjL2luZGVudGF0aW9uLmpzJztcbmltcG9ydCB7IEVESVRPUl9NT0RFTF9ERUZBVUxUUyB9IGZyb20gJy4uL2NvcmUvbWlzYy90ZXh0TW9kZWxEZWZhdWx0cy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0Q2hhbmdlIH0gZnJvbSAnLi4vY29yZS90ZXh0Q2hhbmdlLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZWxlY3Rpb24sIElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0ICogYXMgbW9kZWwgZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQgfSBmcm9tICcuLi90ZXh0TW9kZWxCcmFja2V0UGFpcnMuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMsIFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50LCBJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50LCBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50LCBMaW5lSW5qZWN0ZWRUZXh0LCBNb2RlbEZvbnRDaGFuZ2VkLCBNb2RlbEZvbnRDaGFuZ2VkRXZlbnQsIE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50LCBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkLCBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQsIE1vZGVsUmF3Q2hhbmdlLCBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQsIE1vZGVsUmF3RU9MQ2hhbmdlZCwgTW9kZWxSYXdGbHVzaCwgTW9kZWxSYXdMaW5lQ2hhbmdlZCwgTW9kZWxSYXdMaW5lc0RlbGV0ZWQsIE1vZGVsUmF3TGluZXNJbnNlcnRlZCB9IGZyb20gJy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJR3VpZGVzVGV4dE1vZGVsUGFydCB9IGZyb20gJy4uL3RleHRNb2RlbEd1aWRlcy5qcyc7XG5pbXBvcnQgeyBJVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCB9IGZyb20gJy4uL3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucywgVG9rZW5BcnJheSB9IGZyb20gJy4uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IEJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQgfSBmcm9tICcuL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzSW1wbC5qcyc7XG5pbXBvcnQgeyBDb2xvcml6ZWRCcmFja2V0UGFpcnNEZWNvcmF0aW9uUHJvdmlkZXIgfSBmcm9tICcuL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvY29sb3JpemVkQnJhY2tldFBhaXJzRGVjb3JhdGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEVkaXRTdGFjayB9IGZyb20gJy4vZWRpdFN0YWNrLmpzJztcbmltcG9ydCB7IEd1aWRlc1RleHRNb2RlbFBhcnQgfSBmcm9tICcuL2d1aWRlc1RleHRNb2RlbFBhcnQuanMnO1xuaW1wb3J0IHsgZ3Vlc3NJbmRlbnRhdGlvbiB9IGZyb20gJy4vaW5kZW50YXRpb25HdWVzc2VyLmpzJztcbmltcG9ydCB7IEludGVydmFsTm9kZSwgSW50ZXJ2YWxUcmVlLCByZWNvbXB1dGVNYXhFbmQgfSBmcm9tICcuL2ludGVydmFsVHJlZS5qcyc7XG5pbXBvcnQgeyBQaWVjZVRyZWVUZXh0QnVmZmVyIH0gZnJvbSAnLi9waWVjZVRyZWVUZXh0QnVmZmVyL3BpZWNlVHJlZVRleHRCdWZmZXIuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIgfSBmcm9tICcuL3BpZWNlVHJlZVRleHRCdWZmZXIvcGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgU2VhcmNoUGFyYW1zLCBUZXh0TW9kZWxTZWFyY2ggfSBmcm9tICcuL3RleHRNb2RlbFNlYXJjaC5qcyc7XG5pbXBvcnQgeyBBdHRhY2hlZFZpZXdzIH0gZnJvbSAnLi90b2tlbnMvYWJzdHJhY3RTeW50YXhUb2tlbkJhY2tlbmQuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uRm9udERlY29yYXRpb25Qcm92aWRlciB9IGZyb20gJy4vdG9rZW5zL3Rva2VuaXphdGlvbkZvbnREZWNvcmF0aW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IExpbmVGb250Q2hhbmdpbmdEZWNvcmF0aW9uLCBMaW5lSGVpZ2h0Q2hhbmdpbmdEZWNvcmF0aW9uIH0gZnJvbSAnLi9kZWNvcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCB9IGZyb20gJy4vdG9rZW5zL3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuanMnO1xuaW1wb3J0IHsgSVZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSh0ZXh0OiBzdHJpbmcpOiBtb2RlbC5JVGV4dEJ1ZmZlckZhY3Rvcnkge1xuXHRjb25zdCBidWlsZGVyID0gbmV3IFBpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyKCk7XG5cdGJ1aWxkZXIuYWNjZXB0Q2h1bmsodGV4dCk7XG5cdHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xufVxuXG5pbnRlcmZhY2UgSVRleHRTdHJlYW0ge1xuXHRvbihldmVudDogJ2RhdGEnLCBjYWxsYmFjazogKGRhdGE6IHN0cmluZykgPT4gdm9pZCk6IHZvaWQ7XG5cdG9uKGV2ZW50OiAnZXJyb3InLCBjYWxsYmFjazogKGVycjogRXJyb3IpID0+IHZvaWQpOiB2b2lkO1xuXHRvbihldmVudDogJ2VuZCcsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZDtcblx0b24oZXZlbnQ6IHN0cmluZywgY2FsbGJhY2s6ICguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU3RyZWFtKHN0cmVhbTogSVRleHRTdHJlYW0pOiBQcm9taXNlPG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeT47XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU3RyZWFtKHN0cmVhbTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSk6IFByb21pc2U8bW9kZWwuSVRleHRCdWZmZXJGYWN0b3J5PjtcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0oc3RyZWFtOiBJVGV4dFN0cmVhbSB8IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8bW9kZWwuSVRleHRCdWZmZXJGYWN0b3J5PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgYnVpbGRlciA9IG5ldyBQaWVjZVRyZWVUZXh0QnVmZmVyQnVpbGRlcigpO1xuXG5cdFx0bGV0IGRvbmUgPSBmYWxzZTtcblxuXHRcdGxpc3RlblN0cmVhbTxzdHJpbmcgfCBWU0J1ZmZlcj4oc3RyZWFtLCB7XG5cdFx0XHRvbkRhdGE6IGNodW5rID0+IHtcblx0XHRcdFx0YnVpbGRlci5hY2NlcHRDaHVuaygodHlwZW9mIGNodW5rID09PSAnc3RyaW5nJykgPyBjaHVuayA6IGNodW5rLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRXJyb3I6IGVycm9yID0+IHtcblx0XHRcdFx0aWYgKCFkb25lKSB7XG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRW5kOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghZG9uZSkge1xuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmUoYnVpbGRlci5maW5pc2goKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdChzbmFwc2hvdDogbW9kZWwuSVRleHRTbmFwc2hvdCk6IG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeSB7XG5cdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIoKTtcblxuXHRsZXQgY2h1bms6IHN0cmluZyB8IG51bGw7XG5cdHdoaWxlICh0eXBlb2YgKGNodW5rID0gc25hcHNob3QucmVhZCgpKSA9PT0gJ3N0cmluZycpIHtcblx0XHRidWlsZGVyLmFjY2VwdENodW5rKGNodW5rKTtcblx0fVxuXG5cdHJldHVybiBidWlsZGVyLmZpbmlzaCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlcih2YWx1ZTogc3RyaW5nIHwgbW9kZWwuSVRleHRCdWZmZXJGYWN0b3J5IHwgbW9kZWwuSVRleHRTbmFwc2hvdCwgZGVmYXVsdEVPTDogbW9kZWwuRGVmYXVsdEVuZE9mTGluZSk6IHsgdGV4dEJ1ZmZlcjogbW9kZWwuSVRleHRCdWZmZXI7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXHRsZXQgZmFjdG9yeTogbW9kZWwuSVRleHRCdWZmZXJGYWN0b3J5O1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdGZhY3RvcnkgPSBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeSh2YWx1ZSk7XG5cdH0gZWxzZSBpZiAobW9kZWwuaXNJVGV4dFNuYXBzaG90KHZhbHVlKSkge1xuXHRcdGZhY3RvcnkgPSBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdCh2YWx1ZSk7XG5cdH0gZWxzZSB7XG5cdFx0ZmFjdG9yeSA9IHZhbHVlO1xuXHR9XG5cdHJldHVybiBmYWN0b3J5LmNyZWF0ZShkZWZhdWx0RU9MKTtcbn1cblxubGV0IE1PREVMX0lEID0gMDtcblxuY29uc3QgTElNSVRfRklORF9DT1VOVCA9IDk5OTtcbmNvbnN0IExPTkdfTElORV9CT1VOREFSWSA9IDEwMDAwO1xuY29uc3QgTElORV9IRUlHSFRfQ0VJTElORyA9IDMwMDtcblxuY2xhc3MgVGV4dE1vZGVsU25hcHNob3QgaW1wbGVtZW50cyBtb2RlbC5JVGV4dFNuYXBzaG90IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3VyY2U6IG1vZGVsLklUZXh0U25hcHNob3Q7XG5cdHByaXZhdGUgX2VvczogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IG1vZGVsLklUZXh0U25hcHNob3QpIHtcblx0XHR0aGlzLl9zb3VyY2UgPSBzb3VyY2U7XG5cdFx0dGhpcy5fZW9zID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVhZCgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fZW9zKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHJlc3VsdENudCA9IDA7XG5cdFx0bGV0IHJlc3VsdExlbmd0aCA9IDA7XG5cblx0XHRkbyB7XG5cdFx0XHRjb25zdCB0bXAgPSB0aGlzLl9zb3VyY2UucmVhZCgpO1xuXG5cdFx0XHRpZiAodG1wID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIGVuZC1vZi1zdHJlYW1cblx0XHRcdFx0dGhpcy5fZW9zID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHJlc3VsdENudCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQuam9pbignJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRtcC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRDbnQrK10gPSB0bXA7XG5cdFx0XHRcdHJlc3VsdExlbmd0aCArPSB0bXAubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0TGVuZ3RoID49IDY0ICogMTAyNCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJycpO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKHRydWUpO1xuXHR9XG59XG5cbmNvbnN0IGludmFsaWRGdW5jID0gKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgY2hhbmdlIGFjY2Vzc29yYCk7IH07XG5cbmNvbnN0IGVudW0gU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUge1xuXHQvKipcblx0ICogRXZlbiBhbGxvd2VkIGluIHN1cnJvZ2F0ZSBwYWlyc1xuXHQgKi9cblx0UmVsYXhlZCA9IDAsXG5cdC8qKlxuXHQgKiBOb3QgYWxsb3dlZCBpbiBzdXJyb2dhdGUgcGFpcnNcblx0ICovXG5cdFN1cnJvZ2F0ZVBhaXJzID0gMSxcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBtb2RlbC5JVGV4dE1vZGVsLCBJRGVjb3JhdGlvbnNUcmVlc0hvc3Qge1xuXG5cdHN0YXRpYyBfTU9ERUxfU1lOQ19MSU1JVCA9IDUwICogMTAyNCAqIDEwMjQ7IC8vIDUwIE1CLCAgLy8gdXNlZCBpbiB0ZXN0c1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQVJHRV9GSUxFX1NJWkVfVEhSRVNIT0xEID0gMjAgKiAxMDI0ICogMTAyNDsgLy8gMjAgTUI7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IExBUkdFX0ZJTEVfTElORV9DT1VOVF9USFJFU0hPTEQgPSAzMDAgKiAxMDAwOyAvLyAzMDBLIGxpbmVzXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IExBUkdFX0ZJTEVfSEVBUF9PUEVSQVRJT05fVEhSRVNIT0xEID0gMjU2ICogMTAyNCAqIDEwMjQ7IC8vIDI1Nk0gY2hhcmFjdGVycywgdXN1YWxseSB+PiA1MTJNQiBtZW1vcnkgdXNhZ2VcblxuXHRwdWJsaWMgc3RhdGljIERFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUzogbW9kZWwuSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyA9IHtcblx0XHRpc0ZvclNpbXBsZVdpZGdldDogZmFsc2UsXG5cdFx0dGFiU2l6ZTogRURJVE9SX01PREVMX0RFRkFVTFRTLnRhYlNpemUsXG5cdFx0aW5kZW50U2l6ZTogRURJVE9SX01PREVMX0RFRkFVTFRTLmluZGVudFNpemUsXG5cdFx0aW5zZXJ0U3BhY2VzOiBFRElUT1JfTU9ERUxfREVGQVVMVFMuaW5zZXJ0U3BhY2VzLFxuXHRcdGRldGVjdEluZGVudGF0aW9uOiBmYWxzZSxcblx0XHRkZWZhdWx0RU9MOiBtb2RlbC5EZWZhdWx0RW5kT2ZMaW5lLkxGLFxuXHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogRURJVE9SX01PREVMX0RFRkFVTFRTLnRyaW1BdXRvV2hpdGVzcGFjZSxcblx0XHRsYXJnZUZpbGVPcHRpbWl6YXRpb25zOiBFRElUT1JfTU9ERUxfREVGQVVMVFMubGFyZ2VGaWxlT3B0aW1pemF0aW9ucyxcblx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMsXG5cdH07XG5cblx0cHVibGljIHN0YXRpYyByZXNvbHZlT3B0aW9ucyh0ZXh0QnVmZmVyOiBtb2RlbC5JVGV4dEJ1ZmZlciwgb3B0aW9uczogbW9kZWwuSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyk6IG1vZGVsLlRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyB7XG5cdFx0aWYgKG9wdGlvbnMuZGV0ZWN0SW5kZW50YXRpb24pIHtcblx0XHRcdGNvbnN0IGd1ZXNzZWRJbmRlbnRhdGlvbiA9IGd1ZXNzSW5kZW50YXRpb24odGV4dEJ1ZmZlciwgb3B0aW9ucy50YWJTaXplLCBvcHRpb25zLmluc2VydFNwYWNlcyk7XG5cdFx0XHRyZXR1cm4gbmV3IG1vZGVsLlRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyh7XG5cdFx0XHRcdHRhYlNpemU6IGd1ZXNzZWRJbmRlbnRhdGlvbi50YWJTaXplLFxuXHRcdFx0XHRpbmRlbnRTaXplOiAndGFiU2l6ZScsIC8vIFRPRE9AQWxleDogZ3Vlc3MgaW5kZW50U2l6ZSBpbmRlcGVuZGVudCBvZiB0YWJTaXplXG5cdFx0XHRcdGluc2VydFNwYWNlczogZ3Vlc3NlZEluZGVudGF0aW9uLmluc2VydFNwYWNlcyxcblx0XHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlOiBvcHRpb25zLnRyaW1BdXRvV2hpdGVzcGFjZSxcblx0XHRcdFx0ZGVmYXVsdEVPTDogb3B0aW9ucy5kZWZhdWx0RU9MLFxuXHRcdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM6IG9wdGlvbnMuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBtb2RlbC5UZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURlY29yYXRpb25zOiBEaWRDaGFuZ2VEZWNvcmF0aW9uc0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlkQ2hhbmdlRGVjb3JhdGlvbnNFbWl0dGVyKChhZmZlY3RlZEluamVjdGVkVGV4dExpbmVzLCBhZmZlY3RlZExpbmVIZWlnaHRzLCBhZmZlY3RlZEZvbnRMaW5lcykgPT4gdGhpcy5oYW5kbGVCZWZvcmVGaXJlRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQoYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcywgYWZmZWN0ZWRMaW5lSGVpZ2h0cywgYWZmZWN0ZWRGb250TGluZXMpKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZURlY29yYXRpb25zOiBFdmVudDxJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmV2ZW50O1xuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VMYW5ndWFnZSgpIHsgcmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQub25EaWRDaGFuZ2VMYW5ndWFnZTsgfVxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VDb25maWd1cmF0aW9uKCkgeyByZXR1cm4gdGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5vbkRpZENoYW5nZUxhbmd1YWdlQ29uZmlndXJhdGlvbjsgfVxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlVG9rZW5zKCkgeyByZXR1cm4gdGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5vbkRpZENoYW5nZVRva2VuczsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3B0aW9uczogRW1pdHRlcjxJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlT3B0aW9ucygpOiBFdmVudDxJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF0dGFjaGVkOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VBdHRhY2hlZCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUF0dGFjaGVkLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMaW5lSGVpZ2h0OiBFbWl0dGVyPE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlTGluZUhlaWdodCgpOiBFdmVudDxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlTGluZUhlaWdodC5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRm9udDogRW1pdHRlcjxNb2RlbEZvbnRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kZWxGb250Q2hhbmdlZEV2ZW50PigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZUZvbnQoKTogRXZlbnQ8TW9kZWxGb250Q2hhbmdlZEV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUZvbnQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ldmVudEVtaXR0ZXI6IERpZENoYW5nZUNvbnRlbnRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpZENoYW5nZUNvbnRlbnRFbWl0dGVyKCkpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VDb250ZW50KGxpc3RlbmVyOiAoZTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fZXZlbnRFbWl0dGVyLmV2ZW50KChlOiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50KSA9PiBsaXN0ZW5lcihlLmNvbnRlbnRDaGFuZ2VkRXZlbnQpKTtcblx0fVxuXHQvLyNlbmRyZWdpb25cblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGlzRm9yU2ltcGxlV2lkZ2V0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3NvY2lhdGVkUmVzb3VyY2U6IFVSSTtcblx0cHJpdmF0ZSBfYXR0YWNoZWRFZGl0b3JDb3VudDogbnVtYmVyO1xuXHRwcml2YXRlIF9idWZmZXI6IG1vZGVsLklUZXh0QnVmZmVyO1xuXHRwcml2YXRlIF9idWZmZXJEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBfb3B0aW9uczogbW9kZWwuVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlbGVjdGlvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIF9faXNEaXNwb3Npbmc6IGJvb2xlYW47XG5cdHB1YmxpYyBfaXNEaXNwb3NpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9faXNEaXNwb3Npbmc7IH1cblx0cHJpdmF0ZSBfdmVyc2lvbklkOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBVbmxpa2UsIHZlcnNpb25JZCwgdGhpcyBjYW4gZ28gZG93biAodmlhIHVuZG8pIG9yIGdvIHRvIHByZXZpb3VzIHZhbHVlcyAodmlhIHJlZG8pXG5cdCAqL1xuXHRwcml2YXRlIF9hbHRlcm5hdGl2ZVZlcnNpb25JZDogbnVtYmVyO1xuXHRwcml2YXRlIF9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdDogUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzVG9vTGFyZ2VGb3JTeW5jaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbjogYm9vbGVhbjtcblxuXHQvLyNyZWdpb24gRWRpdGluZ1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kTWFuYWdlcjogRWRpdFN0YWNrO1xuXHRwcml2YXRlIF9pc1VuZG9pbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzUmVkb2luZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXM6IG51bWJlcltdIHwgbnVsbDtcblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERlY29yYXRpb25zXG5cdC8qKlxuXHQgKiBVc2VkIHRvIHdvcmthcm91bmQgYnJva2VuIGNsaWVudHMgdGhhdCBtaWdodCBhdHRlbXB0IHVzaW5nIGEgZGVjb3JhdGlvbiBpZCBnZW5lcmF0ZWQgYnkgYSBkaWZmZXJlbnQgbW9kZWwuXG5cdCAqIEl0IGlzIG5vdCBnbG9iYWxseSB1bmlxdWUgaW4gb3JkZXIgdG8gbGltaXQgaXQgdG8gb25lIGNoYXJhY3Rlci5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSBfZGVsdGFEZWNvcmF0aW9uQ2FsbENudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbGFzdERlY29yYXRpb25JZDogbnVtYmVyO1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uczogeyBbZGVjb3JhdGlvbklkOiBzdHJpbmddOiBJbnRlcnZhbE5vZGUgfTtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnNUcmVlOiBEZWNvcmF0aW9uc1RyZWVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uUHJvdmlkZXI6IENvbG9yaXplZEJyYWNrZXRQYWlyc0RlY29yYXRpb25Qcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlcjogVG9rZW5pemF0aW9uRm9udERlY29yYXRpb25Qcm92aWRlcjtcblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydDogVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydDtcblx0cHVibGljIGdldCB0b2tlbml6YXRpb24oKTogSVRva2VuaXphdGlvblRleHRNb2RlbFBhcnQgeyByZXR1cm4gdGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYWNrZXRQYWlyczogQnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydDtcblx0cHVibGljIGdldCBicmFja2V0UGFpcnMoKTogSUJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQgeyByZXR1cm4gdGhpcy5fYnJhY2tldFBhaXJzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ3VpZGVzVGV4dE1vZGVsUGFydDogR3VpZGVzVGV4dE1vZGVsUGFydDtcblx0cHVibGljIGdldCBndWlkZXMoKTogSUd1aWRlc1RleHRNb2RlbFBhcnQgeyByZXR1cm4gdGhpcy5fZ3VpZGVzVGV4dE1vZGVsUGFydDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F0dGFjaGVkVmlld3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgQXR0YWNoZWRWaWV3cygpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGVscyA9IG5ldyBTZXQ8SVZpZXdNb2RlbD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzb3VyY2U6IHN0cmluZyB8IG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeSxcblx0XHRsYW5ndWFnZUlkT3JTZWxlY3Rpb246IHN0cmluZyB8IElMYW5ndWFnZVNlbGVjdGlvbixcblx0XHRjcmVhdGlvbk9wdGlvbnM6IG1vZGVsLklUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMsXG5cdFx0YXNzb2NpYXRlZFJlc291cmNlOiBVUkkgfCBudWxsID0gbnVsbCxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NlcnZpY2U6IElVbmRvUmVkb1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgYSBuZXcgdW5pcXVlIG1vZGVsIGlkXG5cdFx0TU9ERUxfSUQrKztcblx0XHR0aGlzLmlkID0gJyRtb2RlbCcgKyBNT0RFTF9JRDtcblx0XHR0aGlzLmlzRm9yU2ltcGxlV2lkZ2V0ID0gY3JlYXRpb25PcHRpb25zLmlzRm9yU2ltcGxlV2lkZ2V0O1xuXHRcdGlmICh0eXBlb2YgYXNzb2NpYXRlZFJlc291cmNlID09PSAndW5kZWZpbmVkJyB8fCBhc3NvY2lhdGVkUmVzb3VyY2UgPT09IG51bGwpIHtcblx0XHRcdHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZSA9IFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9tb2RlbC8nICsgTU9ERUxfSUQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hc3NvY2lhdGVkUmVzb3VyY2UgPSBhc3NvY2lhdGVkUmVzb3VyY2U7XG5cdFx0fVxuXHRcdHRoaXMuX2F0dGFjaGVkRWRpdG9yQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgeyB0ZXh0QnVmZmVyLCBkaXNwb3NhYmxlIH0gPSBjcmVhdGVUZXh0QnVmZmVyKHNvdXJjZSwgY3JlYXRpb25PcHRpb25zLmRlZmF1bHRFT0wpO1xuXHRcdHRoaXMuX2J1ZmZlciA9IHRleHRCdWZmZXI7XG5cdFx0dGhpcy5fYnVmZmVyRGlzcG9zYWJsZSA9IGRpc3Bvc2FibGU7XG5cblx0XHRjb25zdCBidWZmZXJMaW5lQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgYnVmZmVyVGV4dExlbmd0aCA9IHRoaXMuX2J1ZmZlci5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIGJ1ZmZlckxpbmVDb3VudCwgdGhpcy5fYnVmZmVyLmdldExpbmVMZW5ndGgoYnVmZmVyTGluZUNvdW50KSArIDEpLCBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTtcblxuXHRcdC8vICEhISBNYWtlIGEgZGVjaXNpb24gaW4gdGhlIGN0b3IgYW5kIHBlcm1hbmVudGx5IHJlc3BlY3QgdGhpcyBkZWNpc2lvbiAhISFcblx0XHQvLyBJZiBhIG1vZGVsIGlzIHRvbyBsYXJnZSBhdCBjb25zdHJ1Y3Rpb24gdGltZSwgaXQgd2lsbCBuZXZlciBnZXQgdG9rZW5pemVkLFxuXHRcdC8vIHVuZGVyIG5vIGNpcmN1bXN0YW5jZXMuXG5cdFx0aWYgKGNyZWF0aW9uT3B0aW9ucy5sYXJnZUZpbGVPcHRpbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLl9pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uID0gKFxuXHRcdFx0XHQoYnVmZmVyVGV4dExlbmd0aCA+IFRleHRNb2RlbC5MQVJHRV9GSUxFX1NJWkVfVEhSRVNIT0xEKVxuXHRcdFx0XHR8fCAoYnVmZmVyTGluZUNvdW50ID4gVGV4dE1vZGVsLkxBUkdFX0ZJTEVfTElORV9DT1VOVF9USFJFU0hPTEQpXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbiA9IGJ1ZmZlclRleHRMZW5ndGggPiBUZXh0TW9kZWwuTEFSR0VfRklMRV9IRUFQX09QRVJBVElPTl9USFJFU0hPTEQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24gPSBmYWxzZTtcblx0XHRcdHRoaXMuX2lzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb3B0aW9ucyA9IFRleHRNb2RlbC5yZXNvbHZlT3B0aW9ucyh0aGlzLl9idWZmZXIsIGNyZWF0aW9uT3B0aW9ucyk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gKHR5cGVvZiBsYW5ndWFnZUlkT3JTZWxlY3Rpb24gPT09ICdzdHJpbmcnID8gbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uIDogbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLmxhbmd1YWdlSWQpO1xuXHRcdGlmICh0eXBlb2YgbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZWxlY3Rpb25MaXN0ZW5lci52YWx1ZSA9IGxhbmd1YWdlSWRPclNlbGVjdGlvbi5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9zZXRMYW5ndWFnZShsYW5ndWFnZUlkT3JTZWxlY3Rpb24ubGFuZ3VhZ2VJZCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2JyYWNrZXRQYWlycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCcmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0KHRoaXMsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9ndWlkZXNUZXh0TW9kZWxQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEd1aWRlc1RleHRNb2RlbFBhcnQodGhpcywgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25Qcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb2xvcml6ZWRCcmFja2V0UGFpcnNEZWNvcmF0aW9uUHJvdmlkZXIodGhpcykpO1xuXHRcdHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQsXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fYnJhY2tldFBhaXJzLFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdHRoaXMuX2F0dGFjaGVkVmlld3Ncblx0XHQpO1xuXHRcdHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9rZW5pemF0aW9uRm9udERlY29yYXRpb25Qcm92aWRlcih0aGlzLCB0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0KSk7XG5cblx0XHR0aGlzLl9pc1Rvb0xhcmdlRm9yU3luY2luZyA9IChidWZmZXJUZXh0TGVuZ3RoID4gVGV4dE1vZGVsLl9NT0RFTF9TWU5DX0xJTUlUKTtcblxuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IDE7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSAxO1xuXHRcdHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID0gbnVsbDtcblxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9faXNEaXNwb3NpbmcgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2luc3RhbmNlSWQgPSBzdHJpbmdzLnNpbmdsZUxldHRlckhhc2goTU9ERUxfSUQpO1xuXHRcdHRoaXMuX2xhc3REZWNvcmF0aW9uSWQgPSAwO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUgPSBuZXcgRGVjb3JhdGlvbnNUcmVlcygpO1xuXG5cdFx0dGhpcy5fY29tbWFuZE1hbmFnZXIgPSBuZXcgRWRpdFN0YWNrKHRoaXMsIHRoaXMuX3VuZG9SZWRvU2VydmljZSk7XG5cdFx0dGhpcy5faXNVbmRvaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5faXNSZWRvaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXMgPSBudWxsO1xuXG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mb250VG9rZW5EZWNvcmF0aW9uc1Byb3ZpZGVyLm9uRGlkQ2hhbmdlTGluZUhlaWdodCgoYWZmZWN0ZWRMaW5lSGVpZ2h0cykgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cdFx0XHR0aGlzLl9maXJlT25EaWRDaGFuZ2VMaW5lSGVpZ2h0KGFmZmVjdGVkTGluZUhlaWdodHMpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5vbkRpZENoYW5nZUZvbnQoKGFmZmVjdGVkRm9udExpbmVzKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmZpcmUoKTtcblx0XHRcdHRoaXMuX2ZpcmVPbkRpZENoYW5nZUZvbnQoYWZmZWN0ZWRGb250TGluZXMpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UucmVxdWVzdFJpY2hMYW5ndWFnZUZlYXR1cmVzKGxhbmd1YWdlSWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuX2JyYWNrZXRQYWlycy5oYW5kbGVMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlKGUpO1xuXHRcdFx0dGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5oYW5kbGVMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlKGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX19pc0Rpc3Bvc2luZyA9IHRydWU7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cdFx0dGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2J1ZmZlckRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX19pc0Rpc3Bvc2luZyA9IGZhbHNlO1xuXHRcdC8vIE1hbnVhbGx5IHJlbGVhc2UgcmVmZXJlbmNlIHRvIHByZXZpb3VzIHRleHQgYnVmZmVyIHRvIGF2b2lkIGxhcmdlIGxlYWtzXG5cdFx0Ly8gaW4gY2FzZSBzb21lb25lIGxlYWtzIGEgVGV4dE1vZGVsIHJlZmVyZW5jZVxuXHRcdGNvbnN0IGVtcHR5RGlzcG9zZWRUZXh0QnVmZmVyID0gbmV3IFBpZWNlVHJlZVRleHRCdWZmZXIoW10sICcnLCAnXFxuJywgZmFsc2UsIGZhbHNlLCB0cnVlLCB0cnVlKTtcblx0XHRlbXB0eURpc3Bvc2VkVGV4dEJ1ZmZlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYnVmZmVyID0gZW1wdHlEaXNwb3NlZFRleHRCdWZmZXI7XG5cdFx0dGhpcy5fYnVmZmVyRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdF9oYXNMaXN0ZW5lcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuaGFzTGlzdGVuZXJzKClcblx0XHRcdHx8IHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuaGFzTGlzdGVuZXJzKClcblx0XHRcdHx8IHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuX2hhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuaGFzTGlzdGVuZXJzKClcblx0XHRcdHx8IHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNoZWQuaGFzTGlzdGVuZXJzKClcblx0XHRcdHx8IHRoaXMuX29uRGlkQ2hhbmdlTGluZUhlaWdodC5oYXNMaXN0ZW5lcnMoKVxuXHRcdFx0fHwgdGhpcy5fb25EaWRDaGFuZ2VGb250Lmhhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl9ldmVudEVtaXR0ZXIuaGFzTGlzdGVuZXJzKClcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXNzZXJ0Tm90RGlzcG9zZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ01vZGVsIGlzIGRpc3Bvc2VkIScpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclZpZXdNb2RlbCh2aWV3TW9kZWw6IElWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3TW9kZWxzLmFkZCh2aWV3TW9kZWwpO1xuXHR9XG5cblx0cHVibGljIHVucmVnaXN0ZXJWaWV3TW9kZWwodmlld01vZGVsOiBJVmlld01vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld01vZGVscy5kZWxldGUodmlld01vZGVsKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHNUZXh0QnVmZmVyKG90aGVyOiBtb2RlbC5JVGV4dEJ1ZmZlcik6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5lcXVhbHMob3RoZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFRleHRCdWZmZXIoKTogbW9kZWwuSVRleHRCdWZmZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlcjtcblx0fVxuXG5cdHByaXZhdGUgX2VtaXRDb250ZW50Q2hhbmdlZEV2ZW50KHJhd0NoYW5nZTogTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50LCBjaGFuZ2U6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIHJlc3VsdGluZ1NlbGVjdGlvbjogU2VsZWN0aW9uW10gfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9faXNEaXNwb3NpbmcpIHtcblx0XHRcdC8vIERvIG5vdCBjb25mdXNlIGxpc3RlbmVycyBieSBlbWl0dGluZyBhbnkgZXZlbnQgYWZ0ZXIgZGlzcG9zaW5nXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuaGFuZGxlRGlkQ2hhbmdlQ29udGVudChjaGFuZ2UpO1xuXHRcdHRoaXMuX2JyYWNrZXRQYWlycy5oYW5kbGVEaWRDaGFuZ2VDb250ZW50KGNoYW5nZSk7XG5cdFx0dGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5oYW5kbGVEaWRDaGFuZ2VDb250ZW50KGNoYW5nZSk7XG5cdFx0Y29uc3QgY29udGVudENoYW5nZUV2ZW50ID0gbmV3IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQocmF3Q2hhbmdlLCBjaGFuZ2UpO1xuXHRcdC8vIFNldCByZXN1bHRpbmdTZWxlY3Rpb24gZWFybHkgc28gdmlld01vZGVscyBjYW4gdXNlIGl0IGZvciBjdXJzb3IgcG9zaXRpb25pbmdcblx0XHRpZiAocmVzdWx0aW5nU2VsZWN0aW9uKSB7XG5cdFx0XHRjb250ZW50Q2hhbmdlRXZlbnQucmF3Q29udGVudENoYW5nZWRFdmVudC5yZXN1bHRpbmdTZWxlY3Rpb24gPSByZXN1bHRpbmdTZWxlY3Rpb247XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudE9ySW5qZWN0ZWRUZXh0KGNvbnRlbnRDaGFuZ2VFdmVudCk7XG5cdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmZpcmUoY29udGVudENoYW5nZUV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nIHwgbW9kZWwuSVRleHRTbmFwc2hvdCwgcmVhc29uID0gRWRpdFNvdXJjZXMuc2V0VmFsdWUoKSk6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cblx0XHRpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0ZXh0QnVmZmVyLCBkaXNwb3NhYmxlIH0gPSBjcmVhdGVUZXh0QnVmZmVyKHZhbHVlLCB0aGlzLl9vcHRpb25zLmRlZmF1bHRFT0wpO1xuXHRcdHRoaXMuX3NldFZhbHVlRnJvbVRleHRCdWZmZXIodGV4dEJ1ZmZlciwgZGlzcG9zYWJsZSwgcmVhc29uKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNvbnRlbnRDaGFuZ2VkMihyYW5nZTogUmFuZ2UsIHJhbmdlT2Zmc2V0OiBudW1iZXIsIHJhbmdlTGVuZ3RoOiBudW1iZXIsIHJhbmdlRW5kUG9zaXRpb246IFBvc2l0aW9uLCB0ZXh0OiBzdHJpbmcsIGlzVW5kb2luZzogYm9vbGVhbiwgaXNSZWRvaW5nOiBib29sZWFuLCBpc0ZsdXNoOiBib29sZWFuLCBpc0VvbENoYW5nZTogYm9vbGVhbiwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdFx0cmFuZ2VPZmZzZXQ6IHJhbmdlT2Zmc2V0LFxuXHRcdFx0XHRyYW5nZUxlbmd0aDogcmFuZ2VMZW5ndGgsXG5cdFx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHR9XSxcblx0XHRcdGVvbDogdGhpcy5fYnVmZmVyLmdldEVPTCgpLFxuXHRcdFx0aXNFb2xDaGFuZ2U6IGlzRW9sQ2hhbmdlLFxuXHRcdFx0dmVyc2lvbklkOiB0aGlzLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0aXNVbmRvaW5nOiBpc1VuZG9pbmcsXG5cdFx0XHRpc1JlZG9pbmc6IGlzUmVkb2luZyxcblx0XHRcdGlzRmx1c2g6IGlzRmx1c2gsXG5cdFx0XHRkZXRhaWxlZFJlYXNvbnM6IFtyZWFzb25dLFxuXHRcdFx0ZGV0YWlsZWRSZWFzb25zQ2hhbmdlTGVuZ3RoczogWzFdLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zZXRWYWx1ZUZyb21UZXh0QnVmZmVyKHRleHRCdWZmZXI6IG1vZGVsLklUZXh0QnVmZmVyLCB0ZXh0QnVmZmVyRGlzcG9zYWJsZTogSURpc3Bvc2FibGUsIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3Qgb2xkRnVsbE1vZGVsUmFuZ2UgPSB0aGlzLmdldEZ1bGxNb2RlbFJhbmdlKCk7XG5cdFx0Y29uc3Qgb2xkTW9kZWxWYWx1ZUxlbmd0aCA9IHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG9sZEZ1bGxNb2RlbFJhbmdlKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cblx0XHR0aGlzLl9idWZmZXIgPSB0ZXh0QnVmZmVyO1xuXHRcdHRoaXMuX2J1ZmZlckRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2J1ZmZlckRpc3Bvc2FibGUgPSB0ZXh0QnVmZmVyRGlzcG9zYWJsZTtcblx0XHR0aGlzLl9pbmNyZWFzZVZlcnNpb25JZCgpO1xuXG5cdFx0Ly8gRGVzdHJveSBhbGwgbXkgZGVjb3JhdGlvbnNcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlID0gbmV3IERlY29yYXRpb25zVHJlZXMoKTtcblxuXHRcdC8vIERlc3Ryb3kgbXkgZWRpdCBoaXN0b3J5IGFuZCBzZXR0aW5nc1xuXHRcdHRoaXMuX2NvbW1hbmRNYW5hZ2VyLmNsZWFyKCk7XG5cdFx0dGhpcy5fdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXMgPSBudWxsO1xuXG5cdFx0dGhpcy5fZW1pdENvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bmV3IE1vZGVsUmF3Rmx1c2goKVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0aGlzLl92ZXJzaW9uSWQsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuX2NyZWF0ZUNvbnRlbnRDaGFuZ2VkMihuZXcgUmFuZ2UoMSwgMSwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSwgMCwgb2xkTW9kZWxWYWx1ZUxlbmd0aCwgbmV3IFBvc2l0aW9uKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksIHRoaXMuZ2V0VmFsdWUoKSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgcmVhc29uKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RU9MKGVvbDogbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IG5ld0VPTCA9IChlb2wgPT09IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlLkNSTEYgPyAnXFxyXFxuJyA6ICdcXG4nKTtcblx0XHRpZiAodGhpcy5fYnVmZmVyLmdldEVPTCgpID09PSBuZXdFT0wpIHtcblx0XHRcdC8vIE5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRGdWxsTW9kZWxSYW5nZSA9IHRoaXMuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblx0XHRjb25zdCBvbGRNb2RlbFZhbHVlTGVuZ3RoID0gdGhpcy5nZXRWYWx1ZUxlbmd0aEluUmFuZ2Uob2xkRnVsbE1vZGVsUmFuZ2UpO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB0aGlzLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKTtcblxuXHRcdHRoaXMuX29uQmVmb3JlRU9MQ2hhbmdlKCk7XG5cdFx0dGhpcy5fYnVmZmVyLnNldEVPTChuZXdFT0wpO1xuXHRcdHRoaXMuX2luY3JlYXNlVmVyc2lvbklkKCk7XG5cdFx0dGhpcy5fb25BZnRlckVPTENoYW5nZSgpO1xuXG5cdFx0dGhpcy5fZW1pdENvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0bmV3IE1vZGVsUmF3RU9MQ2hhbmdlZCgpXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHRoaXMuX3ZlcnNpb25JZCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5fY3JlYXRlQ29udGVudENoYW5nZWQyKG5ldyBSYW5nZSgxLCAxLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLCAwLCBvbGRNb2RlbFZhbHVlTGVuZ3RoLCBuZXcgUG9zaXRpb24oZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSwgdGhpcy5nZXRWYWx1ZSgpLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCB0cnVlLCBFZGl0U291cmNlcy5lb2xDaGFuZ2UoKSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25CZWZvcmVFT0xDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Ly8gRW5zdXJlIGFsbCBkZWNvcmF0aW9ucyBnZXQgdGhlaXIgYHJhbmdlYCBzZXQuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmVuc3VyZUFsbE5vZGVzSGF2ZVJhbmdlcyh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQWZ0ZXJFT0xDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Ly8gVHJhbnNmb3JtIGJhY2sgYHJhbmdlYCB0byBvZmZzZXRzXG5cdFx0Y29uc3QgdmVyc2lvbklkID0gdGhpcy5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBhbGxEZWNvcmF0aW9ucyA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5jb2xsZWN0Tm9kZXNQb3N0T3JkZXIoKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYWxsRGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBhbGxEZWNvcmF0aW9uc1tpXTtcblx0XHRcdGNvbnN0IHJhbmdlID0gbm9kZS5yYW5nZSE7IC8vIHRoZSByYW5nZSBpcyBkZWZpbmVkIGR1ZSB0byBgX29uQmVmb3JlRU9MQ2hhbmdlYFxuXG5cdFx0XHRjb25zdCBkZWx0YSA9IG5vZGUuY2FjaGVkQWJzb2x1dGVTdGFydCAtIG5vZGUuc3RhcnQ7XG5cblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cblx0XHRcdG5vZGUuY2FjaGVkQWJzb2x1dGVTdGFydCA9IHN0YXJ0T2Zmc2V0O1xuXHRcdFx0bm9kZS5jYWNoZWRBYnNvbHV0ZUVuZCA9IGVuZE9mZnNldDtcblx0XHRcdG5vZGUuY2FjaGVkVmVyc2lvbklkID0gdmVyc2lvbklkO1xuXG5cdFx0XHRub2RlLnN0YXJ0ID0gc3RhcnRPZmZzZXQgLSBkZWx0YTtcblx0XHRcdG5vZGUuZW5kID0gZW5kT2Zmc2V0IC0gZGVsdGE7XG5cblx0XHRcdHJlY29tcHV0ZU1heEVuZChub2RlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb25CZWZvcmVBdHRhY2hlZCgpOiBtb2RlbC5JQXR0YWNoZWRWaWV3IHtcblx0XHR0aGlzLl9hdHRhY2hlZEVkaXRvckNvdW50Kys7XG5cdFx0aWYgKHRoaXMuX2F0dGFjaGVkRWRpdG9yQ291bnQgPT09IDEpIHtcblx0XHRcdHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuaGFuZGxlRGlkQ2hhbmdlQXR0YWNoZWQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWRWaWV3cy5hdHRhY2hWaWV3KCk7XG5cdH1cblxuXHRwdWJsaWMgb25CZWZvcmVEZXRhY2hlZCh2aWV3OiBtb2RlbC5JQXR0YWNoZWRWaWV3KTogdm9pZCB7XG5cdFx0dGhpcy5fYXR0YWNoZWRFZGl0b3JDb3VudC0tO1xuXHRcdGlmICh0aGlzLl9hdHRhY2hlZEVkaXRvckNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmhhbmRsZURpZENoYW5nZUF0dGFjaGVkKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dGFjaGVkLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5fYXR0YWNoZWRWaWV3cy5kZXRhY2hWaWV3KHZpZXcpO1xuXHR9XG5cblx0cHVibGljIGlzQXR0YWNoZWRUb0VkaXRvcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWRFZGl0b3JDb3VudCA+IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXR0YWNoZWRFZGl0b3JDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9hdHRhY2hlZEVkaXRvckNvdW50O1xuXHR9XG5cblx0cHVibGljIGlzVG9vTGFyZ2VGb3JTeW5jaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Rvb0xhcmdlRm9yU3luY2luZztcblx0fVxuXG5cdHB1YmxpYyBpc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uO1xuXHR9XG5cblx0cHVibGljIGlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0Rpc3Bvc2VkO1xuXHR9XG5cblx0cHVibGljIGlzRG9taW5hdGVkQnlMb25nTGluZXMoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAodGhpcy5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdC8vIENhbm5vdCB3b3JkIHdyYXAgaHVnZSBmaWxlcyBhbnl3YXlzLCBzbyBpdCBkb2Vzbid0IHJlYWxseSBtYXR0ZXJcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0bGV0IHNtYWxsTGluZUNoYXJDb3VudCA9IDA7XG5cdFx0bGV0IGxvbmdMaW5lQ2hhckNvdW50ID0gMDtcblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMTsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGxpbmVMZW5ndGggPj0gTE9OR19MSU5FX0JPVU5EQVJZKSB7XG5cdFx0XHRcdGxvbmdMaW5lQ2hhckNvdW50ICs9IGxpbmVMZW5ndGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzbWFsbExpbmVDaGFyQ291bnQgKz0gbGluZUxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gKGxvbmdMaW5lQ2hhckNvdW50ID4gc21hbGxMaW5lQ2hhckNvdW50KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Fzc29jaWF0ZWRSZXNvdXJjZTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBPcHRpb25zXG5cblx0cHVibGljIGdldE9wdGlvbnMoKTogbW9kZWwuVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldEZvcm1hdHRpbmdPcHRpb25zKCk6IEZvcm1hdHRpbmdPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGFiU2l6ZTogdGhpcy5fb3B0aW9ucy5pbmRlbnRTaXplLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiB0aGlzLl9vcHRpb25zLmluc2VydFNwYWNlc1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlT3B0aW9ucyhfbmV3T3B0czogbW9kZWwuSVRleHRNb2RlbFVwZGF0ZU9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IHRhYlNpemUgPSAodHlwZW9mIF9uZXdPcHRzLnRhYlNpemUgIT09ICd1bmRlZmluZWQnKSA/IF9uZXdPcHRzLnRhYlNpemUgOiB0aGlzLl9vcHRpb25zLnRhYlNpemU7XG5cdFx0Y29uc3QgaW5kZW50U2l6ZSA9ICh0eXBlb2YgX25ld09wdHMuaW5kZW50U2l6ZSAhPT0gJ3VuZGVmaW5lZCcpID8gX25ld09wdHMuaW5kZW50U2l6ZSA6IHRoaXMuX29wdGlvbnMub3JpZ2luYWxJbmRlbnRTaXplO1xuXHRcdGNvbnN0IGluc2VydFNwYWNlcyA9ICh0eXBlb2YgX25ld09wdHMuaW5zZXJ0U3BhY2VzICE9PSAndW5kZWZpbmVkJykgPyBfbmV3T3B0cy5pbnNlcnRTcGFjZXMgOiB0aGlzLl9vcHRpb25zLmluc2VydFNwYWNlcztcblx0XHRjb25zdCB0cmltQXV0b1doaXRlc3BhY2UgPSAodHlwZW9mIF9uZXdPcHRzLnRyaW1BdXRvV2hpdGVzcGFjZSAhPT0gJ3VuZGVmaW5lZCcpID8gX25ld09wdHMudHJpbUF1dG9XaGl0ZXNwYWNlIDogdGhpcy5fb3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2U7XG5cdFx0Y29uc3QgYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zID0gKHR5cGVvZiBfbmV3T3B0cy5icmFja2V0Q29sb3JpemF0aW9uT3B0aW9ucyAhPT0gJ3VuZGVmaW5lZCcpID8gX25ld09wdHMuYnJhY2tldENvbG9yaXphdGlvbk9wdGlvbnMgOiB0aGlzLl9vcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucztcblxuXHRcdGNvbnN0IG5ld09wdHMgPSBuZXcgbW9kZWwuVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zKHtcblx0XHRcdHRhYlNpemU6IHRhYlNpemUsXG5cdFx0XHRpbmRlbnRTaXplOiBpbmRlbnRTaXplLFxuXHRcdFx0aW5zZXJ0U3BhY2VzOiBpbnNlcnRTcGFjZXMsXG5cdFx0XHRkZWZhdWx0RU9MOiB0aGlzLl9vcHRpb25zLmRlZmF1bHRFT0wsXG5cdFx0XHR0cmltQXV0b1doaXRlc3BhY2U6IHRyaW1BdXRvV2hpdGVzcGFjZSxcblx0XHRcdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyxcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zLmVxdWFscyhuZXdPcHRzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGUgPSB0aGlzLl9vcHRpb25zLmNyZWF0ZUNoYW5nZUV2ZW50KG5ld09wdHMpO1xuXHRcdHRoaXMuX29wdGlvbnMgPSBuZXdPcHRzO1xuXG5cdFx0dGhpcy5fYnJhY2tldFBhaXJzLmhhbmRsZURpZENoYW5nZU9wdGlvbnMoZSk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmhhbmRsZURpZENoYW5nZU9wdGlvbnMoZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmZpcmUoZSk7XG5cdH1cblxuXHRwdWJsaWMgZGV0ZWN0SW5kZW50YXRpb24oZGVmYXVsdEluc2VydFNwYWNlczogYm9vbGVhbiwgZGVmYXVsdFRhYlNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3QgZ3Vlc3NlZEluZGVudGF0aW9uID0gZ3Vlc3NJbmRlbnRhdGlvbih0aGlzLl9idWZmZXIsIGRlZmF1bHRUYWJTaXplLCBkZWZhdWx0SW5zZXJ0U3BhY2VzKTtcblx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0aW5zZXJ0U3BhY2VzOiBndWVzc2VkSW5kZW50YXRpb24uaW5zZXJ0U3BhY2VzLFxuXHRcdFx0dGFiU2l6ZTogZ3Vlc3NlZEluZGVudGF0aW9uLnRhYlNpemUsXG5cdFx0XHRpbmRlbnRTaXplOiBndWVzc2VkSW5kZW50YXRpb24udGFiU2l6ZSwgLy8gVE9ET0BBbGV4OiBndWVzcyBpbmRlbnRTaXplIGluZGVwZW5kZW50IG9mIHRhYlNpemVcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBub3JtYWxpemVJbmRlbnRhdGlvbihzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gbm9ybWFsaXplSW5kZW50YXRpb24oc3RyLCB0aGlzLl9vcHRpb25zLmluZGVudFNpemUsIHRoaXMuX29wdGlvbnMuaW5zZXJ0U3BhY2VzKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZWFkaW5nXG5cblx0cHVibGljIGdldFZlcnNpb25JZCgpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX3ZlcnNpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBtaWdodENvbnRhaW5SVEwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5taWdodENvbnRhaW5SVEwoKTtcblx0fVxuXG5cdHB1YmxpYyBtaWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIubWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycygpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVVudXN1YWxMaW5lVGVybWluYXRvcnMoc2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLmZpbmRNYXRjaGVzKHN0cmluZ3MuVU5VU1VBTF9MSU5FX1RFUk1JTkFUT1JTLnNvdXJjZSwgZmFsc2UsIHRydWUsIGZhbHNlLCBudWxsLCBmYWxzZSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXHRcdHRoaXMuX2J1ZmZlci5yZXNldE1pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMoKTtcblx0XHR0aGlzLnB1c2hFZGl0T3BlcmF0aW9ucyhzZWxlY3Rpb25zLCBtYXRjaGVzLm1hcChtID0+ICh7IHJhbmdlOiBtLnJhbmdlLCB0ZXh0OiBudWxsIH0pKSwgKCkgPT4gbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkO1xuXHR9XG5cblx0cHVibGljIGdldEluaXRpYWxVbmRvUmVkb1NuYXBzaG90KCk6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QgfCBudWxsIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRPZmZzZXRBdChyYXdQb3NpdGlvbjogSVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fdmFsaWRhdGVQb3NpdGlvbihyYXdQb3NpdGlvbi5saW5lTnVtYmVyLCByYXdQb3NpdGlvbi5jb2x1bW4sIFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlJlbGF4ZWQpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbkF0KHJhd09mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gKE1hdGgubWluKHRoaXMuX2J1ZmZlci5nZXRMZW5ndGgoKSwgTWF0aC5tYXgoMCwgcmF3T2Zmc2V0KSkpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5jcmVhc2VWZXJzaW9uSWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmVyc2lvbklkID0gdGhpcy5fdmVyc2lvbklkICsgMTtcblx0XHR0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZCA9IHRoaXMuX3ZlcnNpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBfb3ZlcndyaXRlVmVyc2lvbklkKHZlcnNpb25JZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdmVyc2lvbklkID0gdmVyc2lvbklkO1xuXHR9XG5cblx0cHVibGljIF9vdmVyd3JpdGVBbHRlcm5hdGl2ZVZlcnNpb25JZChuZXdBbHRlcm5hdGl2ZVZlcnNpb25JZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSBuZXdBbHRlcm5hdGl2ZVZlcnNpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBfb3ZlcndyaXRlSW5pdGlhbFVuZG9SZWRvU25hcHNob3QobmV3SW5pdGlhbFVuZG9SZWRvU25hcHNob3Q6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5faW5pdGlhbFVuZG9SZWRvU25hcHNob3QgPSBuZXdJbml0aWFsVW5kb1JlZG9TbmFwc2hvdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZShlb2w/OiBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlLCBwcmVzZXJ2ZUJPTTogYm9vbGVhbiA9IGZhbHNlKTogc3RyaW5nIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmICh0aGlzLmlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ09wZXJhdGlvbiB3b3VsZCBleGNlZWQgaGVhcCBtZW1vcnkgbGltaXRzJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnVsbE1vZGVsUmFuZ2UgPSB0aGlzLmdldEZ1bGxNb2RlbFJhbmdlKCk7XG5cdFx0Y29uc3QgZnVsbE1vZGVsVmFsdWUgPSB0aGlzLmdldFZhbHVlSW5SYW5nZShmdWxsTW9kZWxSYW5nZSwgZW9sKTtcblxuXHRcdGlmIChwcmVzZXJ2ZUJPTSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRCT00oKSArIGZ1bGxNb2RlbFZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmdWxsTW9kZWxWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTbmFwc2hvdChwcmVzZXJ2ZUJPTTogYm9vbGVhbiA9IGZhbHNlKTogbW9kZWwuSVRleHRTbmFwc2hvdCB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0TW9kZWxTbmFwc2hvdCh0aGlzLl9idWZmZXIuY3JlYXRlU25hcHNob3QocHJlc2VydmVCT00pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZUxlbmd0aChlb2w/OiBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlLCBwcmVzZXJ2ZUJPTTogYm9vbGVhbiA9IGZhbHNlKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IGZ1bGxNb2RlbFJhbmdlID0gdGhpcy5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdGNvbnN0IGZ1bGxNb2RlbFZhbHVlID0gdGhpcy5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UoZnVsbE1vZGVsUmFuZ2UsIGVvbCk7XG5cblx0XHRpZiAocHJlc2VydmVCT00pIHtcblx0XHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0Qk9NKCkubGVuZ3RoICsgZnVsbE1vZGVsVmFsdWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZ1bGxNb2RlbFZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlSW5SYW5nZShyYXdSYW5nZTogSVJhbmdlLCBlb2w6IG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UgPSBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTogc3RyaW5nIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0VmFsdWVJblJhbmdlKHRoaXMudmFsaWRhdGVSYW5nZShyYXdSYW5nZSksIGVvbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHJhd1JhbmdlOiBJUmFuZ2UsIGVvbDogbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZSA9IG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UodGhpcy52YWxpZGF0ZVJhbmdlKHJhd1JhbmdlKSwgZW9sKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFyYWN0ZXJDb3VudEluUmFuZ2UocmF3UmFuZ2U6IElSYW5nZSwgZW9sOiBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlID0gbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldENoYXJhY3RlckNvdW50SW5SYW5nZSh0aGlzLnZhbGlkYXRlUmFuZ2UocmF3UmFuZ2UpLCBlb2wpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiB0aGlzLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBsaW5lTnVtYmVyJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNDb250ZW50KCk6IHN0cmluZ1tdIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmICh0aGlzLmlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ09wZXJhdGlvbiB3b3VsZCBleGNlZWQgaGVhcCBtZW1vcnkgbGltaXRzJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lc0NvbnRlbnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFT0woKTogc3RyaW5nIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0RU9MKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kT2ZMaW5lU2VxdWVuY2UoKTogbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2Uge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMuX2J1ZmZlci5nZXRFT0woKSA9PT0gJ1xcbidcblx0XHRcdFx0PyBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZS5MRlxuXHRcdFx0XHQ6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlLkNSTEZcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gdGhpcy5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgbGluZU51bWJlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldExpbmVMZW5ndGgobGluZU51bWJlcikgKyAxO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gdGhpcy5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgbGluZU51bWJlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcik7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIGByYW5nZWAgaXMgd2l0aGluIGJ1ZmZlciBib3VuZHMsIGJ1dCBhbGxvd3MgaXQgdG8gc2l0IGluIGJldHdlZW4gc3Vycm9nYXRlIHBhaXJzLCBldGMuXG5cdCAqIFdpbGwgdHJ5IHRvIG5vdCBhbGxvY2F0ZSBpZiBwb3NzaWJsZS5cblx0ICovXG5cdHB1YmxpYyBfdmFsaWRhdGVSYW5nZVJlbGF4ZWROb0FsbG9jYXRpb25zKHJhbmdlOiBJUmFuZ2UpOiBSYW5nZSB7XG5cdFx0Y29uc3QgbGluZXNDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGNvbnN0IGluaXRpYWxTdGFydExpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgaW5pdGlhbFN0YXJ0Q29sdW1uID0gcmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IE1hdGguZmxvb3IoKHR5cGVvZiBpbml0aWFsU3RhcnRMaW5lTnVtYmVyID09PSAnbnVtYmVyJyAmJiAhaXNOYU4oaW5pdGlhbFN0YXJ0TGluZU51bWJlcikpID8gaW5pdGlhbFN0YXJ0TGluZU51bWJlciA6IDEpO1xuXHRcdGxldCBzdGFydENvbHVtbiA9IE1hdGguZmxvb3IoKHR5cGVvZiBpbml0aWFsU3RhcnRDb2x1bW4gPT09ICdudW1iZXInICYmICFpc05hTihpbml0aWFsU3RhcnRDb2x1bW4pKSA/IGluaXRpYWxTdGFydENvbHVtbiA6IDEpO1xuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8IDEpIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlciA9IDE7XG5cdFx0XHRzdGFydENvbHVtbiA9IDE7XG5cdFx0fSBlbHNlIGlmIChzdGFydExpbmVOdW1iZXIgPiBsaW5lc0NvdW50KSB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPSBsaW5lc0NvdW50O1xuXHRcdFx0c3RhcnRDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4oc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHN0YXJ0Q29sdW1uIDw9IDEpIHtcblx0XHRcdFx0c3RhcnRDb2x1bW4gPSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGlmIChzdGFydENvbHVtbiA+PSBtYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRzdGFydENvbHVtbiA9IG1heENvbHVtbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRpYWxFbmRMaW5lTnVtYmVyID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCBpbml0aWFsRW5kQ29sdW1uID0gcmFuZ2UuZW5kQ29sdW1uO1xuXHRcdGxldCBlbmRMaW5lTnVtYmVyID0gTWF0aC5mbG9vcigodHlwZW9mIGluaXRpYWxFbmRMaW5lTnVtYmVyID09PSAnbnVtYmVyJyAmJiAhaXNOYU4oaW5pdGlhbEVuZExpbmVOdW1iZXIpKSA/IGluaXRpYWxFbmRMaW5lTnVtYmVyIDogMSk7XG5cdFx0bGV0IGVuZENvbHVtbiA9IE1hdGguZmxvb3IoKHR5cGVvZiBpbml0aWFsRW5kQ29sdW1uID09PSAnbnVtYmVyJyAmJiAhaXNOYU4oaW5pdGlhbEVuZENvbHVtbikpID8gaW5pdGlhbEVuZENvbHVtbiA6IDEpO1xuXG5cdFx0aWYgKGVuZExpbmVOdW1iZXIgPCAxKSB7XG5cdFx0XHRlbmRMaW5lTnVtYmVyID0gMTtcblx0XHRcdGVuZENvbHVtbiA9IDE7XG5cdFx0fSBlbHNlIGlmIChlbmRMaW5lTnVtYmVyID4gbGluZXNDb3VudCkge1xuXHRcdFx0ZW5kTGluZU51bWJlciA9IGxpbmVzQ291bnQ7XG5cdFx0XHRlbmRDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChlbmRDb2x1bW4gPD0gMSkge1xuXHRcdFx0XHRlbmRDb2x1bW4gPSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoZW5kQ29sdW1uID49IG1heENvbHVtbikge1xuXHRcdFx0XHRcdGVuZENvbHVtbiA9IG1heENvbHVtbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdGluaXRpYWxTdGFydExpbmVOdW1iZXIgPT09IHN0YXJ0TGluZU51bWJlclxuXHRcdFx0JiYgaW5pdGlhbFN0YXJ0Q29sdW1uID09PSBzdGFydENvbHVtblxuXHRcdFx0JiYgaW5pdGlhbEVuZExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXJcblx0XHRcdCYmIGluaXRpYWxFbmRDb2x1bW4gPT09IGVuZENvbHVtblxuXHRcdFx0JiYgcmFuZ2UgaW5zdGFuY2VvZiBSYW5nZVxuXHRcdFx0JiYgIShyYW5nZSBpbnN0YW5jZW9mIFNlbGVjdGlvbilcblx0XHQpIHtcblx0XHRcdHJldHVybiByYW5nZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdH1cblxuXHRwcml2YXRlIF9pc1ZhbGlkUG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdmFsaWRhdGlvblR5cGU6IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiBsaW5lTnVtYmVyICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgY29sdW1uICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpc05hTihsaW5lTnVtYmVyKSB8fCBpc05hTihjb2x1bW4pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGNvbHVtbiA8IDEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoKGxpbmVOdW1iZXIgfCAwKSAhPT0gbGluZU51bWJlciB8fCAoY29sdW1uIHwgMCkgIT09IGNvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRpZiAobGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChjb2x1bW4gPT09IDEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRpZiAoY29sdW1uID4gbWF4Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbGlkYXRpb25UeXBlID09PSBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5TdXJyb2dhdGVQYWlycykge1xuXHRcdFx0Ly8gISFBdCB0aGlzIHBvaW50LCBjb2x1bW4gPiAxXG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZSA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUobGluZU51bWJlciwgY29sdW1uIC0gMik7XG5cdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlUG9zaXRpb24oX2xpbmVOdW1iZXI6IG51bWJlciwgX2NvbHVtbjogbnVtYmVyLCB2YWxpZGF0aW9uVHlwZTogU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUpOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IE1hdGguZmxvb3IoKHR5cGVvZiBfbGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgIWlzTmFOKF9saW5lTnVtYmVyKSkgPyBfbGluZU51bWJlciA6IDEpO1xuXHRcdGNvbnN0IGNvbHVtbiA9IE1hdGguZmxvb3IoKHR5cGVvZiBfY29sdW1uID09PSAnbnVtYmVyJyAmJiAhaXNOYU4oX2NvbHVtbikpID8gX2NvbHVtbiA6IDEpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbigxLCAxKTtcblx0XHR9XG5cblx0XHRpZiAobGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lQ291bnQsIHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKTtcblx0XHR9XG5cblx0XHRpZiAoY29sdW1uIDw9IDEpIHtcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4Q29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGlmIChjb2x1bW4gPj0gbWF4Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIG1heENvbHVtbik7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbGlkYXRpb25UeXBlID09PSBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5TdXJyb2dhdGVQYWlycykge1xuXHRcdFx0Ly8gSWYgdGhlIHBvc2l0aW9uIHdvdWxkIGVuZCB1cCBpbiB0aGUgbWlkZGxlIG9mIGEgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXIsXG5cdFx0XHQvLyB3ZSBtb3ZlIGl0IHRvIGJlZm9yZSB0aGUgcGFpclxuXHRcdFx0Ly8gISFBdCB0aGlzIHBvaW50LCBjb2x1bW4gPiAxXG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZSA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUobGluZU51bWJlciwgY29sdW1uIC0gMik7XG5cdFx0XHRpZiAoc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmUpKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uIC0gMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCB2YWxpZGF0aW9uVHlwZSA9IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlN1cnJvZ2F0ZVBhaXJzO1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cblx0XHQvLyBBdm9pZCBvYmplY3QgYWxsb2NhdGlvbiBhbmQgY292ZXIgbW9zdCBsaWtlbHkgY2FzZVxuXHRcdGlmIChwb3NpdGlvbiBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0XHRpZiAodGhpcy5faXNWYWxpZFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgdmFsaWRhdGlvblR5cGUpKSB7XG5cdFx0XHRcdHJldHVybiBwb3NpdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdmFsaWRhdGVQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHZhbGlkYXRpb25UeXBlKTtcblx0fVxuXG5cdHB1YmxpYyBpc1ZhbGlkUmFuZ2UocmFuZ2U6IFJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmFsaWRSYW5nZShyYW5nZSwgU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuU3Vycm9nYXRlUGFpcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNWYWxpZFJhbmdlKHJhbmdlOiBSYW5nZSwgdmFsaWRhdGlvblR5cGU6IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gcmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gcmFuZ2UuZW5kQ29sdW1uO1xuXG5cdFx0aWYgKCF0aGlzLl9pc1ZhbGlkUG9zaXRpb24oc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuUmVsYXhlZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9pc1ZhbGlkUG9zaXRpb24oZW5kTGluZU51bWJlciwgZW5kQ29sdW1uLCBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5SZWxheGVkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh2YWxpZGF0aW9uVHlwZSA9PT0gU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuU3Vycm9nYXRlUGFpcnMpIHtcblx0XHRcdGNvbnN0IGNoYXJDb2RlQmVmb3JlU3RhcnQgPSAoc3RhcnRDb2x1bW4gPiAxID8gdGhpcy5fYnVmZmVyLmdldExpbmVDaGFyQ29kZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uIC0gMikgOiAwKTtcblx0XHRcdGNvbnN0IGNoYXJDb2RlQmVmb3JlRW5kID0gKGVuZENvbHVtbiA+IDEgJiYgZW5kQ29sdW1uIDw9IHRoaXMuX2J1ZmZlci5nZXRMaW5lTGVuZ3RoKGVuZExpbmVOdW1iZXIpID8gdGhpcy5fYnVmZmVyLmdldExpbmVDaGFyQ29kZShlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gLSAyKSA6IDApO1xuXG5cdFx0XHRjb25zdCBzdGFydEluc2lkZVN1cnJvZ2F0ZVBhaXIgPSBzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZVN0YXJ0KTtcblx0XHRcdGNvbnN0IGVuZEluc2lkZVN1cnJvZ2F0ZVBhaXIgPSBzdHJpbmdzLmlzSGlnaFN1cnJvZ2F0ZShjaGFyQ29kZUJlZm9yZUVuZCk7XG5cblx0XHRcdGlmICghc3RhcnRJbnNpZGVTdXJyb2dhdGVQYWlyICYmICFlbmRJbnNpZGVTdXJyb2dhdGVQYWlyKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlUmFuZ2UoX3JhbmdlOiBJUmFuZ2UpOiBSYW5nZSB7XG5cdFx0Y29uc3QgdmFsaWRhdGlvblR5cGUgPSBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5TdXJyb2dhdGVQYWlycztcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXG5cdFx0Ly8gQXZvaWQgb2JqZWN0IGFsbG9jYXRpb24gYW5kIGNvdmVyIG1vc3QgbGlrZWx5IGNhc2Vcblx0XHRpZiAoKF9yYW5nZSBpbnN0YW5jZW9mIFJhbmdlKSAmJiAhKF9yYW5nZSBpbnN0YW5jZW9mIFNlbGVjdGlvbikpIHtcblx0XHRcdGlmICh0aGlzLl9pc1ZhbGlkUmFuZ2UoX3JhbmdlLCB2YWxpZGF0aW9uVHlwZSkpIHtcblx0XHRcdFx0cmV0dXJuIF9yYW5nZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24oX3JhbmdlLnN0YXJ0TGluZU51bWJlciwgX3JhbmdlLnN0YXJ0Q29sdW1uLCBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5SZWxheGVkKTtcblx0XHRjb25zdCBlbmQgPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKF9yYW5nZS5lbmRMaW5lTnVtYmVyLCBfcmFuZ2UuZW5kQ29sdW1uLCBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5SZWxheGVkKTtcblxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHN0YXJ0LmxpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzdGFydC5jb2x1bW47XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGVuZC5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IGVuZC5jb2x1bW47XG5cblx0XHRpZiAodmFsaWRhdGlvblR5cGUgPT09IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlN1cnJvZ2F0ZVBhaXJzKSB7XG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZVN0YXJ0ID0gKHN0YXJ0Q29sdW1uID4gMSA/IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiAtIDIpIDogMCk7XG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZUVuZCA9IChlbmRDb2x1bW4gPiAxICYmIGVuZENvbHVtbiA8PSB0aGlzLl9idWZmZXIuZ2V0TGluZUxlbmd0aChlbmRMaW5lTnVtYmVyKSA/IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUoZW5kTGluZU51bWJlciwgZW5kQ29sdW1uIC0gMikgOiAwKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnRJbnNpZGVTdXJyb2dhdGVQYWlyID0gc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmVTdGFydCk7XG5cdFx0XHRjb25zdCBlbmRJbnNpZGVTdXJyb2dhdGVQYWlyID0gc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmVFbmQpO1xuXG5cdFx0XHRpZiAoIXN0YXJ0SW5zaWRlU3Vycm9nYXRlUGFpciAmJiAhZW5kSW5zaWRlU3Vycm9nYXRlUGFpcikge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgJiYgc3RhcnRDb2x1bW4gPT09IGVuZENvbHVtbikge1xuXHRcdFx0XHQvLyBkbyBub3QgZXhwYW5kIGEgY29sbGFwc2VkIHJhbmdlLCBzaW1wbHkgbW92ZSBpdCB0byBhIHZhbGlkIGxvY2F0aW9uXG5cdFx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiAtIDEsIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiAtIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhcnRJbnNpZGVTdXJyb2dhdGVQYWlyICYmIGVuZEluc2lkZVN1cnJvZ2F0ZVBhaXIpIHtcblx0XHRcdFx0Ly8gZXhwYW5kIHJhbmdlIGF0IGJvdGggZW5kc1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4gLSAxLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gKyAxKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0SW5zaWRlU3Vycm9nYXRlUGFpcikge1xuXHRcdFx0XHQvLyBvbmx5IGV4cGFuZCByYW5nZSBhdCB0aGUgc3RhcnRcblx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uIC0gMSwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gb25seSBleHBhbmQgcmFuZ2UgYXQgdGhlIGVuZFxuXHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gKyAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgbW9kaWZ5UG9zaXRpb24ocmF3UG9zaXRpb246IElQb3NpdGlvbiwgb2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLmdldE9mZnNldEF0KHJhd1Bvc2l0aW9uKSArIG9mZnNldDtcblx0XHRyZXR1cm4gdGhpcy5nZXRQb3NpdGlvbkF0KE1hdGgubWluKHRoaXMuX2J1ZmZlci5nZXRMZW5ndGgoKSwgTWF0aC5tYXgoMCwgY2FuZGlkYXRlKSkpO1xuXHR9XG5cblx0cHVibGljIGdldEZ1bGxNb2RlbFJhbmdlKCk6IFJhbmdlIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuZ2V0TGluZUNvdW50KCk7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSgxLCAxLCBsaW5lQ291bnQsIHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZE1hdGNoZXNMaW5lQnlMaW5lKHNlYXJjaFJhbmdlOiBSYW5nZSwgc2VhcmNoRGF0YTogbW9kZWwuU2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlcik6IG1vZGVsLkZpbmRNYXRjaFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHR9XG5cblx0cHVibGljIGZpbmRNYXRjaGVzKHNlYXJjaFN0cmluZzogc3RyaW5nLCByYXdTZWFyY2hTY29wZTogYm9vbGVhbiB8IElSYW5nZSB8IElSYW5nZVtdIHwgbnVsbCwgaXNSZWdleDogYm9vbGVhbiwgbWF0Y2hDYXNlOiBib29sZWFuLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nIHwgbnVsbCwgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4sIGxpbWl0UmVzdWx0Q291bnQ6IG51bWJlciA9IExJTUlUX0ZJTkRfQ09VTlQpOiBtb2RlbC5GaW5kTWF0Y2hbXSB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblxuXHRcdGxldCBzZWFyY2hSYW5nZXM6IFJhbmdlW10gfCBudWxsID0gbnVsbDtcblxuXHRcdGlmIChyYXdTZWFyY2hTY29wZSAhPT0gbnVsbCAmJiB0eXBlb2YgcmF3U2VhcmNoU2NvcGUgIT09ICdib29sZWFuJykge1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHJhd1NlYXJjaFNjb3BlKSkge1xuXHRcdFx0XHRyYXdTZWFyY2hTY29wZSA9IFtyYXdTZWFyY2hTY29wZV07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyYXdTZWFyY2hTY29wZS5ldmVyeSgoc2VhcmNoU2NvcGU6IElSYW5nZSkgPT4gUmFuZ2UuaXNJUmFuZ2Uoc2VhcmNoU2NvcGUpKSkge1xuXHRcdFx0XHRzZWFyY2hSYW5nZXMgPSByYXdTZWFyY2hTY29wZS5tYXAoKHNlYXJjaFNjb3BlOiBJUmFuZ2UpID0+IHRoaXMudmFsaWRhdGVSYW5nZShzZWFyY2hTY29wZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZWFyY2hSYW5nZXMgPT09IG51bGwpIHtcblx0XHRcdHNlYXJjaFJhbmdlcyA9IFt0aGlzLmdldEZ1bGxNb2RlbFJhbmdlKCldO1xuXHRcdH1cblxuXHRcdHNlYXJjaFJhbmdlcyA9IHNlYXJjaFJhbmdlcy5zb3J0KChkMSwgZDIpID0+IGQxLnN0YXJ0TGluZU51bWJlciAtIGQyLnN0YXJ0TGluZU51bWJlciB8fCBkMS5zdGFydENvbHVtbiAtIGQyLnN0YXJ0Q29sdW1uKTtcblxuXHRcdGNvbnN0IHVuaXF1ZVNlYXJjaFJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdHVuaXF1ZVNlYXJjaFJhbmdlcy5wdXNoKHNlYXJjaFJhbmdlcy5yZWR1Y2UoKHByZXYsIGN1cnIpID0+IHtcblx0XHRcdGlmIChSYW5nZS5hcmVJbnRlcnNlY3RpbmcocHJldiwgY3VycikpIHtcblx0XHRcdFx0cmV0dXJuIHByZXYucGx1c1JhbmdlKGN1cnIpO1xuXHRcdFx0fVxuXG5cdFx0XHR1bmlxdWVTZWFyY2hSYW5nZXMucHVzaChwcmV2KTtcblx0XHRcdHJldHVybiBjdXJyO1xuXHRcdH0pKTtcblxuXHRcdGxldCBtYXRjaE1hcHBlcjogKHZhbHVlOiBSYW5nZSwgaW5kZXg6IG51bWJlciwgYXJyYXk6IFJhbmdlW10pID0+IG1vZGVsLkZpbmRNYXRjaFtdO1xuXHRcdGlmICghaXNSZWdleCAmJiBzZWFyY2hTdHJpbmcuaW5kZXhPZignXFxuJykgPCAwKSB7XG5cdFx0XHQvLyBub3QgcmVnZXgsIG5vdCBtdWx0aSBsaW5lXG5cdFx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyk7XG5cdFx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXG5cdFx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXRjaE1hcHBlciA9IChzZWFyY2hSYW5nZTogUmFuZ2UpID0+IHRoaXMuZmluZE1hdGNoZXNMaW5lQnlMaW5lKHNlYXJjaFJhbmdlLCBzZWFyY2hEYXRhLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hdGNoTWFwcGVyID0gKHNlYXJjaFJhbmdlOiBSYW5nZSkgPT4gVGV4dE1vZGVsU2VhcmNoLmZpbmRNYXRjaGVzKHRoaXMsIG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKSwgc2VhcmNoUmFuZ2UsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5pcXVlU2VhcmNoUmFuZ2VzLm1hcChtYXRjaE1hcHBlcikucmVkdWNlKChhcnIsIG1hdGNoZXM6IG1vZGVsLkZpbmRNYXRjaFtdKSA9PiBhcnIuY29uY2F0KG1hdGNoZXMpLCBbXSk7XG5cdH1cblxuXHRwdWJsaWMgZmluZE5leHRNYXRjaChzZWFyY2hTdHJpbmc6IHN0cmluZywgcmF3U2VhcmNoU3RhcnQ6IElQb3NpdGlvbiwgaXNSZWdleDogYm9vbGVhbiwgbWF0Y2hDYXNlOiBib29sZWFuLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IG1vZGVsLkZpbmRNYXRjaCB8IG51bGwge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3Qgc2VhcmNoU3RhcnQgPSB0aGlzLnZhbGlkYXRlUG9zaXRpb24ocmF3U2VhcmNoU3RhcnQpO1xuXG5cdFx0aWYgKCFpc1JlZ2V4ICYmIHNlYXJjaFN0cmluZy5pbmRleE9mKCdcXG4nKSA8IDApIHtcblx0XHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKTtcblx0XHRcdGNvbnN0IHNlYXJjaERhdGEgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cdFx0XHRpZiAoIXNlYXJjaERhdGEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRsZXQgc2VhcmNoUmFuZ2UgPSBuZXcgUmFuZ2Uoc2VhcmNoU3RhcnQubGluZU51bWJlciwgc2VhcmNoU3RhcnQuY29sdW1uLCBsaW5lQ291bnQsIHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKTtcblx0XHRcdGxldCByZXQgPSB0aGlzLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIDEpO1xuXHRcdFx0VGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2godGhpcywgbmV3IFNlYXJjaFBhcmFtcyhzZWFyY2hTdHJpbmcsIGlzUmVnZXgsIG1hdGNoQ2FzZSwgd29yZFNlcGFyYXRvcnMpLCBzZWFyY2hTdGFydCwgY2FwdHVyZU1hdGNoZXMpO1xuXHRcdFx0aWYgKHJldC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiByZXRbMF07XG5cdFx0XHR9XG5cblx0XHRcdHNlYXJjaFJhbmdlID0gbmV3IFJhbmdlKDEsIDEsIHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1heENvbHVtbihzZWFyY2hTdGFydC5saW5lTnVtYmVyKSk7XG5cdFx0XHRyZXQgPSB0aGlzLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIDEpO1xuXG5cdFx0XHRpZiAocmV0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHJldFswXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKHRoaXMsIG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKSwgc2VhcmNoU3RhcnQsIGNhcHR1cmVNYXRjaGVzKTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kUHJldmlvdXNNYXRjaChzZWFyY2hTdHJpbmc6IHN0cmluZywgcmF3U2VhcmNoU3RhcnQ6IElQb3NpdGlvbiwgaXNSZWdleDogYm9vbGVhbiwgbWF0Y2hDYXNlOiBib29sZWFuLCB3b3JkU2VwYXJhdG9yczogc3RyaW5nLCBjYXB0dXJlTWF0Y2hlczogYm9vbGVhbik6IG1vZGVsLkZpbmRNYXRjaCB8IG51bGwge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3Qgc2VhcmNoU3RhcnQgPSB0aGlzLnZhbGlkYXRlUG9zaXRpb24ocmF3U2VhcmNoU3RhcnQpO1xuXHRcdHJldHVybiBUZXh0TW9kZWxTZWFyY2guZmluZFByZXZpb3VzTWF0Y2godGhpcywgbmV3IFNlYXJjaFBhcmFtcyhzZWFyY2hTdHJpbmcsIGlzUmVnZXgsIG1hdGNoQ2FzZSwgd29yZFNlcGFyYXRvcnMpLCBzZWFyY2hTdGFydCwgY2FwdHVyZU1hdGNoZXMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRpbmdcblxuXHRwdWJsaWMgcHVzaFN0YWNrRWxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tYW5kTWFuYWdlci5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdH1cblxuXHRwdWJsaWMgcG9wU3RhY2tFbGVtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1hbmRNYW5hZ2VyLnBvcFN0YWNrRWxlbWVudCgpO1xuXHR9XG5cblx0cHVibGljIHB1c2hFT0woZW9sOiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRFT0wgPSAodGhpcy5nZXRFT0woKSA9PT0gJ1xcbicgPyBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZS5MRiA6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdGlmIChjdXJyZW50RU9MID09PSBlb2wpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX2V2ZW50RW1pdHRlci5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0aWYgKHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmNyZWF0ZVNuYXBzaG90KHRoaXMudXJpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbW1hbmRNYW5hZ2VyLnB1c2hFT0woZW9sKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZUVkaXRPcGVyYXRpb24ocmF3T3BlcmF0aW9uOiBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24pOiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24ge1xuXHRcdGlmIChyYXdPcGVyYXRpb24gaW5zdGFuY2VvZiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24pIHtcblx0XHRcdHJldHVybiByYXdPcGVyYXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsaWRhdGVkUmFuZ2UgPSB0aGlzLnZhbGlkYXRlUmFuZ2UocmF3T3BlcmF0aW9uLnJhbmdlKTtcblxuXHRcdC8vIE5vcm1hbGl6ZSBlZGl0IHdoZW4gcmVwbGFjZW1lbnQgdGV4dCBlbmRzIHdpdGggbG9uZSBDUlxuXHRcdC8vIGFuZCB0aGUgcmFuZ2UgZW5kcyByaWdodCBiZWZvcmUgYSBDUkxGIGluIHRoZSBidWZmZXIuXG5cdFx0Ly8gV2Ugc3RyaXAgdGhlIHRyYWlsaW5nIENSIGZyb20gdGhlIHJlcGxhY2VtZW50IHRleHQuXG5cdFx0bGV0IG9wVGV4dCA9IHJhd09wZXJhdGlvbi50ZXh0O1xuXHRcdGlmIChvcFRleHQpIHtcblx0XHRcdGNvbnN0IGVuZHNXaXRoTG9uZUNSID0gKFxuXHRcdFx0XHRvcFRleHQubGVuZ3RoID4gMCAmJiBvcFRleHQuY2hhckNvZGVBdChvcFRleHQubGVuZ3RoIC0gMSkgPT09IENoYXJDb2RlLkNhcnJpYWdlUmV0dXJuXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgcmVtb3ZlVHJhaWxpbmdDUiA9IChcblx0XHRcdFx0dGhpcy5nZXRFT0woKSA9PT0gJ1xcclxcbicgJiYgZW5kc1dpdGhMb25lQ1IgJiYgdmFsaWRhdGVkUmFuZ2UuZW5kQ29sdW1uID09PSB0aGlzLmdldExpbmVNYXhDb2x1bW4odmFsaWRhdGVkUmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHRcdCk7XG5cdFx0XHRpZiAocmVtb3ZlVHJhaWxpbmdDUikge1xuXHRcdFx0XHRvcFRleHQgPSBvcFRleHQuc3Vic3RyaW5nKDAsIG9wVGV4dC5sZW5ndGggLSAxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IG1vZGVsLlZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbihcblx0XHRcdHJhd09wZXJhdGlvbi5pZGVudGlmaWVyIHx8IG51bGwsXG5cdFx0XHR2YWxpZGF0ZWRSYW5nZSxcblx0XHRcdG9wVGV4dCxcblx0XHRcdHJhd09wZXJhdGlvbi5mb3JjZU1vdmVNYXJrZXJzIHx8IGZhbHNlLFxuXHRcdFx0cmF3T3BlcmF0aW9uLmlzQXV0b1doaXRlc3BhY2VFZGl0IHx8IGZhbHNlLFxuXHRcdFx0cmF3T3BlcmF0aW9uLl9pc1RyYWNrZWQgfHwgZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVFZGl0T3BlcmF0aW9ucyhyYXdPcGVyYXRpb25zOiByZWFkb25seSBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IG1vZGVsLlZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IG1vZGVsLlZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhd09wZXJhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdFtpXSA9IHRoaXMuX3ZhbGlkYXRlRWRpdE9wZXJhdGlvbihyYXdPcGVyYXRpb25zW2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBlZGl0KGVkaXQ6IFRleHRFZGl0LCBvcHRpb25zPzogeyByZWFzb24/OiBUZXh0TW9kZWxFZGl0U291cmNlIH0pOiB2b2lkIHtcblx0XHR0aGlzLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBlZGl0LnJlcGxhY2VtZW50cy5tYXAociA9PiAoeyByYW5nZTogci5yYW5nZSwgdGV4dDogci50ZXh0IH0pKSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgcHVzaEVkaXRPcGVyYXRpb25zKGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwsIGVkaXRPcGVyYXRpb25zOiBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY3Vyc29yU3RhdGVDb21wdXRlcjogbW9kZWwuSUN1cnNvclN0YXRlQ29tcHV0ZXIgfCBudWxsLCBncm91cD86IFVuZG9SZWRvR3JvdXAsIHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9ldmVudEVtaXR0ZXIuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHJldHVybiB0aGlzLl9wdXNoRWRpdE9wZXJhdGlvbnMoYmVmb3JlQ3Vyc29yU3RhdGUsIHRoaXMuX3ZhbGlkYXRlRWRpdE9wZXJhdGlvbnMoZWRpdE9wZXJhdGlvbnMpLCBjdXJzb3JTdGF0ZUNvbXB1dGVyLCBncm91cCwgcmVhc29uKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wdXNoRWRpdE9wZXJhdGlvbnMoYmVmb3JlQ3Vyc29yU3RhdGU6IFNlbGVjdGlvbltdIHwgbnVsbCwgZWRpdE9wZXJhdGlvbnM6IG1vZGVsLlZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbltdLCBjdXJzb3JTdGF0ZUNvbXB1dGVyOiBtb2RlbC5JQ3Vyc29yU3RhdGVDb21wdXRlciB8IG51bGwsIGdyb3VwPzogVW5kb1JlZG9Hcm91cCwgcmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudHJpbUF1dG9XaGl0ZXNwYWNlICYmIHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzKSB7XG5cdFx0XHQvLyBHbyB0aHJvdWdoIGVhY2ggc2F2ZWQgbGluZSBudW1iZXIgYW5kIGluc2VydCBhIHRyaW0gd2hpdGVzcGFjZSBlZGl0XG5cdFx0XHQvLyBpZiBpdCBpcyBzYWZlIHRvIGRvIHNvIChubyBjb25mbGljdHMgd2l0aCBvdGhlciBlZGl0cykuXG5cblx0XHRcdGNvbnN0IGluY29taW5nRWRpdHMgPSBlZGl0T3BlcmF0aW9ucy5tYXAoKG9wKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmFuZ2U6IHRoaXMudmFsaWRhdGVSYW5nZShvcC5yYW5nZSksXG5cdFx0XHRcdFx0dGV4dDogb3AudGV4dFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNvbWV0aW1lcywgYXV0by1mb3JtYXR0ZXJzIGNoYW5nZSByYW5nZXMgYXV0b21hdGljYWxseSB3aGljaCBjYW4gY2F1c2UgdW5kZXNpcmVkIGF1dG8gd2hpdGVzcGFjZSB0cmltbWluZyBuZWFyIHRoZSBjdXJzb3Jcblx0XHRcdC8vIFdlJ2xsIHVzZSB0aGUgZm9sbG93aW5nIGhldXJpc3RpYzogaWYgdGhlIGVkaXRzIG9jY3VyIG5lYXIgdGhlIGN1cnNvciwgdGhlbiBpdCdzIG9rIHRvIHRyaW0gYXV0byB3aGl0ZXNwYWNlXG5cdFx0XHRsZXQgZWRpdHNBcmVOZWFyQ3Vyc29ycyA9IHRydWU7XG5cdFx0XHRpZiAoYmVmb3JlQ3Vyc29yU3RhdGUpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGJlZm9yZUN1cnNvclN0YXRlLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsID0gYmVmb3JlQ3Vyc29yU3RhdGVbaV07XG5cdFx0XHRcdFx0bGV0IGZvdW5kRWRpdE5lYXJTZWwgPSBmYWxzZTtcblx0XHRcdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IGluY29taW5nRWRpdHMubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0UmFuZ2UgPSBpbmNvbWluZ0VkaXRzW2pdLnJhbmdlO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsSXNBYm92ZSA9IGVkaXRSYW5nZS5zdGFydExpbmVOdW1iZXIgPiBzZWwuZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbElzQmVsb3cgPSBzZWwuc3RhcnRMaW5lTnVtYmVyID4gZWRpdFJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRpZiAoIXNlbElzQWJvdmUgJiYgIXNlbElzQmVsb3cpIHtcblx0XHRcdFx0XHRcdFx0Zm91bmRFZGl0TmVhclNlbCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWZvdW5kRWRpdE5lYXJTZWwpIHtcblx0XHRcdFx0XHRcdGVkaXRzQXJlTmVhckN1cnNvcnMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdHNBcmVOZWFyQ3Vyc29ycykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCB0cmltTGluZU51bWJlciA9IHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzW2ldO1xuXHRcdFx0XHRcdGNvbnN0IG1heExpbmVDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4odHJpbUxpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdFx0bGV0IGFsbG93VHJpbUxpbmUgPSB0cnVlO1xuXHRcdFx0XHRcdGZvciAobGV0IGogPSAwLCBsZW5KID0gaW5jb21pbmdFZGl0cy5sZW5ndGg7IGogPCBsZW5KOyBqKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRSYW5nZSA9IGluY29taW5nRWRpdHNbal0ucmFuZ2U7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0VGV4dCA9IGluY29taW5nRWRpdHNbal0udGV4dDtcblxuXHRcdFx0XHRcdFx0aWYgKHRyaW1MaW5lTnVtYmVyIDwgZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCB0cmltTGluZU51bWJlciA+IGVkaXRSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGB0cmltTGluZWAgaXMgY29tcGxldGVseSBvdXRzaWRlIHRoaXMgZWRpdFxuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gQXQgdGhpcyBwb2ludDpcblx0XHRcdFx0XHRcdC8vICAgZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSB0cmltTGluZSA8PSBlZGl0UmFuZ2UuZW5kTGluZU51bWJlclxuXG5cdFx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHRcdHRyaW1MaW5lTnVtYmVyID09PSBlZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGVkaXRSYW5nZS5zdGFydENvbHVtbiA9PT0gbWF4TGluZUNvbHVtblxuXHRcdFx0XHRcdFx0XHQmJiBlZGl0UmFuZ2UuaXNFbXB0eSgpICYmIGVkaXRUZXh0ICYmIGVkaXRUZXh0Lmxlbmd0aCA+IDAgJiYgZWRpdFRleHQuY2hhckF0KDApID09PSAnXFxuJ1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoaXMgZWRpdCBpbnNlcnRzIGEgbmV3IGxpbmUgKGFuZCBtYXliZSBvdGhlciB0ZXh0KSBhZnRlciBgdHJpbUxpbmVgXG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHRcdHRyaW1MaW5lTnVtYmVyID09PSBlZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGVkaXRSYW5nZS5zdGFydENvbHVtbiA9PT0gMVxuXHRcdFx0XHRcdFx0XHQmJiBlZGl0UmFuZ2UuaXNFbXB0eSgpICYmIGVkaXRUZXh0ICYmIGVkaXRUZXh0Lmxlbmd0aCA+IDAgJiYgZWRpdFRleHQuY2hhckF0KGVkaXRUZXh0Lmxlbmd0aCAtIDEpID09PSAnXFxuJ1xuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFRoaXMgZWRpdCBpbnNlcnRzIGEgbmV3IGxpbmUgKGFuZCBtYXliZSBvdGhlciB0ZXh0KSBiZWZvcmUgYHRyaW1MaW5lYFxuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gTG9va3MgbGlrZSB3ZSBjYW4ndCB0cmltIHRoaXMgbGluZSBhcyBpdCB3b3VsZCBpbnRlcmZlcmUgd2l0aCBhbiBpbmNvbWluZyBlZGl0XG5cdFx0XHRcdFx0XHRhbGxvd1RyaW1MaW5lID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoYWxsb3dUcmltTGluZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdHJpbVJhbmdlID0gbmV3IFJhbmdlKHRyaW1MaW5lTnVtYmVyLCAxLCB0cmltTGluZU51bWJlciwgbWF4TGluZUNvbHVtbik7XG5cdFx0XHRcdFx0XHRlZGl0T3BlcmF0aW9ucy5wdXNoKG5ldyBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24obnVsbCwgdHJpbVJhbmdlLCBudWxsLCBmYWxzZSwgZmFsc2UsIGZhbHNlKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXMgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faW5pdGlhbFVuZG9SZWRvU25hcHNob3QgPT09IG51bGwpIHtcblx0XHRcdHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmNyZWF0ZVNuYXBzaG90KHRoaXMudXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRNYW5hZ2VyLnB1c2hFZGl0T3BlcmF0aW9uKGJlZm9yZUN1cnNvclN0YXRlLCBlZGl0T3BlcmF0aW9ucywgY3Vyc29yU3RhdGVDb21wdXRlciwgZ3JvdXAsIHJlYXNvbik7XG5cdH1cblxuXHRfYXBwbHlVbmRvKGNoYW5nZXM6IFRleHRDaGFuZ2VbXSwgZW9sOiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZSwgcmVzdWx0aW5nQWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlciwgcmVzdWx0aW5nU2VsZWN0aW9uOiBTZWxlY3Rpb25bXSB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0cyA9IGNoYW5nZXMubWFwPElTaW5nbGVFZGl0T3BlcmF0aW9uPigoY2hhbmdlKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZVN0YXJ0ID0gdGhpcy5nZXRQb3NpdGlvbkF0KGNoYW5nZS5uZXdQb3NpdGlvbik7XG5cdFx0XHRjb25zdCByYW5nZUVuZCA9IHRoaXMuZ2V0UG9zaXRpb25BdChjaGFuZ2UubmV3RW5kKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocmFuZ2VTdGFydC5saW5lTnVtYmVyLCByYW5nZVN0YXJ0LmNvbHVtbiwgcmFuZ2VFbmQubGluZU51bWJlciwgcmFuZ2VFbmQuY29sdW1uKSxcblx0XHRcdFx0dGV4dDogY2hhbmdlLm9sZFRleHRcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fYXBwbHlVbmRvUmVkb0VkaXRzKGVkaXRzLCBlb2wsIHRydWUsIGZhbHNlLCByZXN1bHRpbmdBbHRlcm5hdGl2ZVZlcnNpb25JZCwgcmVzdWx0aW5nU2VsZWN0aW9uKTtcblx0fVxuXG5cdF9hcHBseVJlZG8oY2hhbmdlczogVGV4dENoYW5nZVtdLCBlb2w6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlLCByZXN1bHRpbmdBbHRlcm5hdGl2ZVZlcnNpb25JZDogbnVtYmVyLCByZXN1bHRpbmdTZWxlY3Rpb246IFNlbGVjdGlvbltdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRzID0gY2hhbmdlcy5tYXA8SVNpbmdsZUVkaXRPcGVyYXRpb24+KChjaGFuZ2UpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlU3RhcnQgPSB0aGlzLmdldFBvc2l0aW9uQXQoY2hhbmdlLm9sZFBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IHJhbmdlRW5kID0gdGhpcy5nZXRQb3NpdGlvbkF0KGNoYW5nZS5vbGRFbmQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShyYW5nZVN0YXJ0LmxpbmVOdW1iZXIsIHJhbmdlU3RhcnQuY29sdW1uLCByYW5nZUVuZC5saW5lTnVtYmVyLCByYW5nZUVuZC5jb2x1bW4pLFxuXHRcdFx0XHR0ZXh0OiBjaGFuZ2UubmV3VGV4dFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9hcHBseVVuZG9SZWRvRWRpdHMoZWRpdHMsIGVvbCwgZmFsc2UsIHRydWUsIHJlc3VsdGluZ0FsdGVybmF0aXZlVmVyc2lvbklkLCByZXN1bHRpbmdTZWxlY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlVbmRvUmVkb0VkaXRzKGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBlb2w6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlLCBpc1VuZG9pbmc6IGJvb2xlYW4sIGlzUmVkb2luZzogYm9vbGVhbiwgcmVzdWx0aW5nQWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlciwgcmVzdWx0aW5nU2VsZWN0aW9uOiBTZWxlY3Rpb25bXSB8IG51bGwpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9pc1VuZG9pbmcgPSBpc1VuZG9pbmc7XG5cdFx0XHR0aGlzLl9pc1JlZG9pbmcgPSBpc1JlZG9pbmc7XG5cdFx0XHRjb25zdCBvcGVyYXRpb25zID0gdGhpcy5fdmFsaWRhdGVFZGl0T3BlcmF0aW9ucyhlZGl0cyk7XG5cdFx0XHR0aGlzLl9kb0FwcGx5RWRpdHMob3BlcmF0aW9ucywgZmFsc2UsIEVkaXRTb3VyY2VzLmFwcGx5RWRpdHMoKSwgcmVzdWx0aW5nU2VsZWN0aW9uKTtcblx0XHRcdHRoaXMuc2V0RU9MKGVvbCk7XG5cdFx0XHR0aGlzLl9vdmVyd3JpdGVBbHRlcm5hdGl2ZVZlcnNpb25JZChyZXN1bHRpbmdBbHRlcm5hdGl2ZVZlcnNpb25JZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzVW5kb2luZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faXNSZWRvaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9ldmVudEVtaXR0ZXIuZW5kRGVmZXJyZWRFbWl0KHJlc3VsdGluZ1NlbGVjdGlvbik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhcHBseUVkaXRzKG9wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdKTogdm9pZDtcblx0cHVibGljIGFwcGx5RWRpdHMob3BlcmF0aW9uczogcmVhZG9ubHkgbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGNvbXB1dGVVbmRvRWRpdHM6IGZhbHNlKTogdm9pZDtcblx0cHVibGljIGFwcGx5RWRpdHMob3BlcmF0aW9uczogcmVhZG9ubHkgbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGNvbXB1dGVVbmRvRWRpdHM6IHRydWUpOiBtb2RlbC5JVmFsaWRFZGl0T3BlcmF0aW9uW107XG5cdC8qKiBAaW50ZXJuYWwgKi9cblx0cHVibGljIGFwcGx5RWRpdHMob3BlcmF0aW9uczogcmVhZG9ubHkgbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGNvbXB1dGVVbmRvRWRpdHM6IGZhbHNlLCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkO1xuXHQvKiogQGludGVybmFsICovXG5cdHB1YmxpYyBhcHBseUVkaXRzKG9wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjb21wdXRlVW5kb0VkaXRzOiB0cnVlLCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiBtb2RlbC5JVmFsaWRFZGl0T3BlcmF0aW9uW107XG5cdHB1YmxpYyBhcHBseUVkaXRzKHJhd09wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjb21wdXRlVW5kb0VkaXRzPzogYm9vbGVhbiwgcmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQgfCBtb2RlbC5JVmFsaWRFZGl0T3BlcmF0aW9uW10ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9ldmVudEVtaXR0ZXIuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl92YWxpZGF0ZUVkaXRPcGVyYXRpb25zKHJhd09wZXJhdGlvbnMpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fZG9BcHBseUVkaXRzKG9wZXJhdGlvbnMsIGNvbXB1dGVVbmRvRWRpdHMgPz8gZmFsc2UsIHJlYXNvbiA/PyBFZGl0U291cmNlcy5hcHBseUVkaXRzKCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9ldmVudEVtaXR0ZXIuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvQXBwbHlFZGl0cyhyYXdPcGVyYXRpb25zOiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb25bXSwgY29tcHV0ZVVuZG9FZGl0czogYm9vbGVhbiwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlLCByZXN1bHRpbmdTZWxlY3Rpb246IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGwpOiB2b2lkIHwgbW9kZWwuSVZhbGlkRWRpdE9wZXJhdGlvbltdIHtcblxuXHRcdGNvbnN0IG9sZExpbmVDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9idWZmZXIuYXBwbHlFZGl0cyhyYXdPcGVyYXRpb25zLCB0aGlzLl9vcHRpb25zLnRyaW1BdXRvV2hpdGVzcGFjZSwgY29tcHV0ZVVuZG9FZGl0cyk7XG5cdFx0Y29uc3QgbmV3TGluZUNvdW50ID0gdGhpcy5fYnVmZmVyLmdldExpbmVDb3VudCgpO1xuXG5cdFx0Y29uc3QgY29udGVudENoYW5nZXMgPSByZXN1bHQuY2hhbmdlcztcblx0XHR0aGlzLl90cmltQXV0b1doaXRlc3BhY2VMaW5lcyA9IHJlc3VsdC50cmltQXV0b1doaXRlc3BhY2VMaW5lTnVtYmVycztcblxuXHRcdGlmIChjb250ZW50Q2hhbmdlcy5sZW5ndGggIT09IDApIHtcblx0XHRcdC8vIFdlIGRvIGEgZmlyc3QgcGFzcyB0byB1cGRhdGUgZGVjb3JhdGlvbnNcblx0XHRcdC8vIGJlY2F1c2Ugd2Ugd2FudCB0byByZWFkIGRlY29yYXRpb25zIGluIHRoZSBzZWNvbmQgcGFzc1xuXHRcdFx0Ly8gd2hlcmUgd2Ugd2lsbCBlbWl0IGNvbnRlbnQgY2hhbmdlIGV2ZW50c1xuXHRcdFx0Ly8gYW5kIHdlIHdhbnQgdG8gcmVhZCB0aGUgZmluYWwgZGVjb3JhdGlvbnNcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjb250ZW50Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBjb250ZW50Q2hhbmdlc1tpXTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmFjY2VwdFJlcGxhY2UoY2hhbmdlLnJhbmdlT2Zmc2V0LCBjaGFuZ2UucmFuZ2VMZW5ndGgsIGNoYW5nZS50ZXh0Lmxlbmd0aCwgY2hhbmdlLmZvcmNlTW92ZU1hcmtlcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByYXdDb250ZW50Q2hhbmdlczogTW9kZWxSYXdDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0XHR0aGlzLl9pbmNyZWFzZVZlcnNpb25JZCgpO1xuXG5cdFx0XHRsZXQgbGluZUNvdW50ID0gb2xkTGluZUNvdW50O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGNvbnRlbnRDaGFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZSA9IGNvbnRlbnRDaGFuZ2VzW2ldO1xuXHRcdFx0XHRjb25zdCBbZW9sQ291bnRdID0gY291bnRFT0woY2hhbmdlLnRleHQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmZpcmUoKTtcblxuXHRcdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBjaGFuZ2UucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gY2hhbmdlLnJhbmdlLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdFx0Y29uc3QgZGVsZXRpbmdMaW5lc0NudCA9IGVuZExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IGluc2VydGluZ0xpbmVzQ250ID0gZW9sQ291bnQ7XG5cdFx0XHRcdGNvbnN0IGVkaXRpbmdMaW5lc0NudCA9IE1hdGgubWluKGRlbGV0aW5nTGluZXNDbnQsIGluc2VydGluZ0xpbmVzQ250KTtcblxuXHRcdFx0XHRjb25zdCBjaGFuZ2VMaW5lQ291bnREZWx0YSA9IChpbnNlcnRpbmdMaW5lc0NudCAtIGRlbGV0aW5nTGluZXNDbnQpO1xuXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRFZGl0U3RhcnRMaW5lTnVtYmVyID0gbmV3TGluZUNvdW50IC0gbGluZUNvdW50IC0gY2hhbmdlTGluZUNvdW50RGVsdGEgKyBzdGFydExpbmVOdW1iZXI7XG5cblx0XHRcdFx0Zm9yIChsZXQgaiA9IGVkaXRpbmdMaW5lc0NudDsgaiA+PSAwOyBqLS0pIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlciArIGo7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudEVkaXRMaW5lTnVtYmVyID0gY3VycmVudEVkaXRTdGFydExpbmVOdW1iZXIgKyBqO1xuXG5cdFx0XHRcdFx0cmF3Q29udGVudENoYW5nZXMucHVzaChcblx0XHRcdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVDaGFuZ2VkKFxuXHRcdFx0XHRcdFx0XHRlZGl0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0Y3VycmVudEVkaXRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlZGl0aW5nTGluZXNDbnQgPCBkZWxldGluZ0xpbmVzQ250KSB7XG5cdFx0XHRcdFx0Ly8gTXVzdCBkZWxldGUgc29tZSBsaW5lc1xuXHRcdFx0XHRcdGNvbnN0IHNwbGljZVN0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlciArIGVkaXRpbmdMaW5lc0NudDtcblx0XHRcdFx0XHRjb25zdCBjbnQgPSBpbnNlcnRpbmdMaW5lc0NudCAtIGRlbGV0aW5nTGluZXNDbnQ7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdFVudG91Y2hlZExpbmVQb3N0RWRpdCA9IG5ld0xpbmVDb3VudCAtIGxpbmVDb3VudCAtIGNudCArIHNwbGljZVN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0XHRyYXdDb250ZW50Q2hhbmdlcy5wdXNoKG5ldyBNb2RlbFJhd0xpbmVzRGVsZXRlZChzcGxpY2VTdGFydExpbmVOdW1iZXIgKyAxLCBlbmRMaW5lTnVtYmVyLCBsYXN0VW50b3VjaGVkTGluZVBvc3RFZGl0KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZWRpdGluZ0xpbmVzQ250IDwgaW5zZXJ0aW5nTGluZXNDbnQpIHtcblx0XHRcdFx0XHQvLyBNdXN0IGluc2VydCBzb21lIGxpbmVzXG5cdFx0XHRcdFx0Y29uc3Qgc3BsaWNlTGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlciArIGVkaXRpbmdMaW5lc0NudDtcblx0XHRcdFx0XHRjb25zdCBjbnQgPSBpbnNlcnRpbmdMaW5lc0NudCAtIGVkaXRpbmdMaW5lc0NudDtcblx0XHRcdFx0XHRjb25zdCBmcm9tTGluZU51bWJlciA9IG5ld0xpbmVDb3VudCAtIGxpbmVDb3VudCAtIGNudCArIHNwbGljZUxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRcdHJhd0NvbnRlbnRDaGFuZ2VzLnB1c2goXG5cdFx0XHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lc0luc2VydGVkKFxuXHRcdFx0XHRcdFx0XHRzcGxpY2VMaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRcdFx0ZnJvbUxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdGNudFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsaW5lQ291bnQgKz0gY2hhbmdlTGluZUNvdW50RGVsdGE7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VtaXRDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0XHRuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0XHRcdHJhd0NvbnRlbnRDaGFuZ2VzLFxuXHRcdFx0XHRcdHRoaXMuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdFx0dGhpcy5faXNVbmRvaW5nLFxuXHRcdFx0XHRcdHRoaXMuX2lzUmVkb2luZ1xuXHRcdFx0XHQpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhbmdlczogY29udGVudENoYW5nZXMsXG5cdFx0XHRcdFx0ZW9sOiB0aGlzLl9idWZmZXIuZ2V0RU9MKCksXG5cdFx0XHRcdFx0aXNFb2xDaGFuZ2U6IGZhbHNlLFxuXHRcdFx0XHRcdHZlcnNpb25JZDogdGhpcy5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdFx0XHRpc1VuZG9pbmc6IHRoaXMuX2lzVW5kb2luZyxcblx0XHRcdFx0XHRpc1JlZG9pbmc6IHRoaXMuX2lzUmVkb2luZyxcblx0XHRcdFx0XHRpc0ZsdXNoOiBmYWxzZSxcblx0XHRcdFx0XHRkZXRhaWxlZFJlYXNvbnM6IFtyZWFzb25dLFxuXHRcdFx0XHRcdGRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHM6IFtjb250ZW50Q2hhbmdlcy5sZW5ndGhdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXN1bHRpbmdTZWxlY3Rpb25cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChyZXN1bHQucmV2ZXJzZUVkaXRzID09PSBudWxsID8gdW5kZWZpbmVkIDogcmVzdWx0LnJldmVyc2VFZGl0cyk7XG5cdH1cblxuXHRwdWJsaWMgdW5kbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuZG9SZWRvU2VydmljZS51bmRvKHRoaXMudXJpKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5VbmRvKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcnZpY2UuY2FuVW5kbyh0aGlzLnVyaSk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuZG9SZWRvU2VydmljZS5yZWRvKHRoaXMudXJpKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5SZWRvKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcnZpY2UuY2FuUmVkbyh0aGlzLnVyaSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRGVjb3JhdGlvbnNcblxuXHRwcml2YXRlIGhhbmRsZUJlZm9yZUZpcmVEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChhZmZlY3RlZEluamVjdGVkVGV4dExpbmVzOiBTZXQ8bnVtYmVyPiB8IG51bGwsIGFmZmVjdGVkTGluZUhlaWdodHM6IFNldDxMaW5lSGVpZ2h0Q2hhbmdpbmdEZWNvcmF0aW9uPiB8IG51bGwsIGFmZmVjdGVkRm9udExpbmVzOiBTZXQ8TGluZUZvbnRDaGFuZ2luZ0RlY29yYXRpb24+IHwgbnVsbCk6IHZvaWQge1xuXHRcdC8vIFRoaXMgaXMgY2FsbGVkIGJlZm9yZSB0aGUgZGVjb3JhdGlvbiBjaGFuZ2VkIGV2ZW50IGlzIGZpcmVkLlxuXG5cdFx0aWYgKGFmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMgJiYgYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcy5zaXplID4gMCkge1xuXHRcdFx0Y29uc3QgYWZmZWN0ZWRMaW5lcyA9IEFycmF5LmZyb20oYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcyk7XG5cdFx0XHRjb25zdCBsaW5lQ2hhbmdlRXZlbnRzID0gYWZmZWN0ZWRMaW5lcy5tYXAobGluZU51bWJlciA9PiBuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZChsaW5lTnVtYmVyLCBsaW5lTnVtYmVyKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChuZXcgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQobGluZUNoYW5nZUV2ZW50cykpO1xuXHRcdH1cblx0XHR0aGlzLl9maXJlT25EaWRDaGFuZ2VMaW5lSGVpZ2h0KGFmZmVjdGVkTGluZUhlaWdodHMpO1xuXHRcdHRoaXMuX2ZpcmVPbkRpZENoYW5nZUZvbnQoYWZmZWN0ZWRGb250TGluZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZU9uRGlkQ2hhbmdlTGluZUhlaWdodChhZmZlY3RlZExpbmVIZWlnaHRzOiBTZXQ8TGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGFmZmVjdGVkTGluZUhlaWdodHMgJiYgYWZmZWN0ZWRMaW5lSGVpZ2h0cy5zaXplID4gMCkge1xuXHRcdFx0Y29uc3QgYWZmZWN0ZWRMaW5lcyA9IEFycmF5LmZyb20oYWZmZWN0ZWRMaW5lSGVpZ2h0cyk7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0Q2hhbmdlRXZlbnQgPSBhZmZlY3RlZExpbmVzLm1hcChzcGVjaWFsTGluZUhlaWdodENoYW5nZSA9PiBuZXcgTW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZChzcGVjaWFsTGluZUhlaWdodENoYW5nZS5vd25lcklkLCBzcGVjaWFsTGluZUhlaWdodENoYW5nZS5kZWNvcmF0aW9uSWQsIHNwZWNpYWxMaW5lSGVpZ2h0Q2hhbmdlLmxpbmVOdW1iZXIsIHNwZWNpYWxMaW5lSGVpZ2h0Q2hhbmdlLmxpbmVIZWlnaHQpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGluZUhlaWdodC5maXJlKG5ldyBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQobGluZUhlaWdodENoYW5nZUV2ZW50KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZU9uRGlkQ2hhbmdlRm9udChhZmZlY3RlZEZvbnRMaW5lczogU2V0PExpbmVGb250Q2hhbmdpbmdEZWNvcmF0aW9uPiB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoYWZmZWN0ZWRGb250TGluZXMgJiYgYWZmZWN0ZWRGb250TGluZXMuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IGFmZmVjdGVkTGluZXMgPSBBcnJheS5mcm9tKGFmZmVjdGVkRm9udExpbmVzKTtcblx0XHRcdGNvbnN0IGZvbnRDaGFuZ2VFdmVudCA9IGFmZmVjdGVkTGluZXMubWFwKGZvbnRDaGFuZ2UgPT4gbmV3IE1vZGVsRm9udENoYW5nZWQoZm9udENoYW5nZS5vd25lcklkLCBmb250Q2hhbmdlLmxpbmVOdW1iZXIpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9udC5maXJlKG5ldyBNb2RlbEZvbnRDaGFuZ2VkRXZlbnQoZm9udENoYW5nZUV2ZW50KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDb250ZW50T3JJbmplY3RlZFRleHQoZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2aWV3TW9kZWwgb2YgdGhpcy5fdmlld01vZGVscykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dmlld01vZGVsLm9uRGlkQ2hhbmdlQ29udGVudE9ySW5qZWN0ZWRUZXh0KGUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHZpZXdNb2RlbCBvZiB0aGlzLl92aWV3TW9kZWxzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR2aWV3TW9kZWwuZW1pdENvbnRlbnRDaGFuZ2VFdmVudChlKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2hhbmdlRGVjb3JhdGlvbnM8VD4oY2FsbGJhY2s6IChjaGFuZ2VBY2Nlc3NvcjogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4gVCwgb3duZXJJZDogbnVtYmVyID0gMCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHJldHVybiB0aGlzLl9jaGFuZ2VEZWNvcmF0aW9ucyhvd25lcklkLCBjYWxsYmFjayk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlRGVjb3JhdGlvbnM8VD4ob3duZXJJZDogbnVtYmVyLCBjYWxsYmFjazogKGNoYW5nZUFjY2Vzc29yOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yKSA9PiBUKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGNoYW5nZUFjY2Vzc29yOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yID0ge1xuXHRcdFx0YWRkRGVjb3JhdGlvbjogKHJhbmdlOiBJUmFuZ2UsIG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PcHRpb25zKTogc3RyaW5nID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RlbHRhRGVjb3JhdGlvbnNJbXBsKG93bmVySWQsIFtdLCBbeyByYW5nZTogcmFuZ2UsIG9wdGlvbnM6IG9wdGlvbnMgfV0pWzBdO1xuXHRcdFx0fSxcblx0XHRcdGNoYW5nZURlY29yYXRpb246IChpZDogc3RyaW5nLCBuZXdSYW5nZTogSVJhbmdlKTogdm9pZCA9PiB7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZURlY29yYXRpb25JbXBsKG93bmVySWQsIGlkLCBuZXdSYW5nZSk7XG5cdFx0XHR9LFxuXHRcdFx0Y2hhbmdlRGVjb3JhdGlvbk9wdGlvbnM6IChpZDogc3RyaW5nLCBvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucykgPT4ge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VEZWNvcmF0aW9uT3B0aW9uc0ltcGwob3duZXJJZCwgaWQsIF9ub3JtYWxpemVPcHRpb25zKG9wdGlvbnMpKTtcblx0XHRcdH0sXG5cdFx0XHRyZW1vdmVEZWNvcmF0aW9uOiAoaWQ6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLl9kZWx0YURlY29yYXRpb25zSW1wbChvd25lcklkLCBbaWRdLCBbXSk7XG5cdFx0XHR9LFxuXHRcdFx0ZGVsdGFEZWNvcmF0aW9uczogKG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IG1vZGVsLklNb2RlbERlbHRhRGVjb3JhdGlvbltdKTogc3RyaW5nW10gPT4ge1xuXHRcdFx0XHRpZiAob2xkRGVjb3JhdGlvbnMubGVuZ3RoID09PSAwICYmIG5ld0RlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RlbHRhRGVjb3JhdGlvbnNJbXBsKG93bmVySWQsIG9sZERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRsZXQgcmVzdWx0OiBUIHwgbnVsbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGNhbGxiYWNrKGNoYW5nZUFjY2Vzc29yKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHR9XG5cdFx0Ly8gSW52YWxpZGF0ZSBjaGFuZ2UgYWNjZXNzb3Jcblx0XHRjaGFuZ2VBY2Nlc3Nvci5hZGREZWNvcmF0aW9uID0gaW52YWxpZEZ1bmM7XG5cdFx0Y2hhbmdlQWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbiA9IGludmFsaWRGdW5jO1xuXHRcdGNoYW5nZUFjY2Vzc29yLmNoYW5nZURlY29yYXRpb25PcHRpb25zID0gaW52YWxpZEZ1bmM7XG5cdFx0Y2hhbmdlQWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbiA9IGludmFsaWRGdW5jO1xuXHRcdGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMgPSBpbnZhbGlkRnVuYztcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnM6IHN0cmluZ1tdLCBuZXdEZWNvcmF0aW9uczogbW9kZWwuSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10sIG93bmVySWQ6IG51bWJlciA9IDApOiBzdHJpbmdbXSB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAoIW9sZERlY29yYXRpb25zKSB7XG5cdFx0XHRvbGREZWNvcmF0aW9ucyA9IFtdO1xuXHRcdH1cblx0XHRpZiAob2xkRGVjb3JhdGlvbnMubGVuZ3RoID09PSAwICYmIG5ld0RlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9kZWx0YURlY29yYXRpb25DYWxsQ250Kys7XG5cdFx0XHRpZiAodGhpcy5fZGVsdGFEZWNvcmF0aW9uQ2FsbENudCA+IDEpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBJbnZva2luZyBkZWx0YURlY29yYXRpb25zIHJlY3Vyc2l2ZWx5IGNvdWxkIGxlYWQgdG8gbGVha2luZyBkZWNvcmF0aW9ucy5gKTtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IobmV3IEVycm9yKGBJbnZva2luZyBkZWx0YURlY29yYXRpb25zIHJlY3Vyc2l2ZWx5IGNvdWxkIGxlYWQgdG8gbGVha2luZyBkZWNvcmF0aW9ucy5gKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVsdGFEZWNvcmF0aW9uc0ltcGwob3duZXJJZCwgb2xkRGVjb3JhdGlvbnMsIG5ld0RlY29yYXRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX2RlbHRhRGVjb3JhdGlvbkNhbGxDbnQtLTtcblx0XHR9XG5cdH1cblxuXHRfZ2V0VHJhY2tlZFJhbmdlKGlkOiBzdHJpbmcpOiBSYW5nZSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmdldERlY29yYXRpb25SYW5nZShpZCk7XG5cdH1cblxuXHRfc2V0VHJhY2tlZFJhbmdlKGlkOiBzdHJpbmcgfCBudWxsLCBuZXdSYW5nZTogbnVsbCwgbmV3U3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyk6IG51bGw7XG5cdF9zZXRUcmFja2VkUmFuZ2UoaWQ6IHN0cmluZyB8IG51bGwsIG5ld1JhbmdlOiBSYW5nZSwgbmV3U3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyk6IHN0cmluZztcblx0X3NldFRyYWNrZWRSYW5nZShpZDogc3RyaW5nIHwgbnVsbCwgbmV3UmFuZ2U6IFJhbmdlIHwgbnVsbCwgbmV3U3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IG5vZGUgPSAoaWQgPyB0aGlzLl9kZWNvcmF0aW9uc1tpZF0gOiBudWxsKTtcblxuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0aWYgKCFuZXdSYW5nZSkge1xuXHRcdFx0XHQvLyBub2RlIGRvZXNuJ3QgZXhpc3QsIHRoZSByZXF1ZXN0IGlzIHRvIGRlbGV0ZSA9PiBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Ly8gbm9kZSBkb2Vzbid0IGV4aXN0LCB0aGUgcmVxdWVzdCBpcyB0byBzZXQgPT4gYWRkIHRoZSB0cmFja2VkIHJhbmdlXG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVsdGFEZWNvcmF0aW9uc0ltcGwoMCwgW10sIFt7IHJhbmdlOiBuZXdSYW5nZSwgb3B0aW9uczogVFJBQ0tFRF9SQU5HRV9PUFRJT05TW25ld1N0aWNraW5lc3NdIH1dLCB0cnVlKVswXTtcblx0XHR9XG5cblx0XHRpZiAoIW5ld1JhbmdlKSB7XG5cdFx0XHQvLyBub2RlIGV4aXN0cywgdGhlIHJlcXVlc3QgaXMgdG8gZGVsZXRlID0+IGRlbGV0ZSBub2RlXG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRpb25zW25vZGUuaWRdO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gbm9kZSBleGlzdHMsIHRoZSByZXF1ZXN0IGlzIHRvIHNldCA9PiBjaGFuZ2UgdGhlIHRyYWNrZWQgcmFuZ2UgYW5kIGl0cyBvcHRpb25zXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl92YWxpZGF0ZVJhbmdlUmVsYXhlZE5vQWxsb2NhdGlvbnMobmV3UmFuZ2UpO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5kZWxldGUobm9kZSk7XG5cdFx0bm9kZS5yZXNldCh0aGlzLmdldFZlcnNpb25JZCgpLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCByYW5nZSk7XG5cdFx0bm9kZS5zZXRPcHRpb25zKFRSQUNLRURfUkFOR0VfT1BUSU9OU1tuZXdTdGlja2luZXNzXSk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmluc2VydChub2RlKTtcblx0XHRyZXR1cm4gbm9kZS5pZDtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkKG93bmVySWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5vZGVzID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmNvbGxlY3ROb2Rlc0Zyb21Pd25lcihvd25lcklkKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbm9kZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBub2Rlc1tpXTtcblxuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0aW9uc1tub2RlLmlkXTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbk9wdGlvbnMoZGVjb3JhdGlvbklkOiBzdHJpbmcpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB8IG51bGwge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9kZWNvcmF0aW9uc1tkZWNvcmF0aW9uSWRdO1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBub2RlLm9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZDogc3RyaW5nKTogUmFuZ2UgfCBudWxsIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fZGVjb3JhdGlvbnNbZGVjb3JhdGlvbklkXTtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lRGVjb3JhdGlvbnMobGluZU51bWJlcjogbnVtYmVyLCBvd25lcklkOiBudW1iZXIgPSAwLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuID0gZmFsc2UsIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TGluZXNEZWNvcmF0aW9ucyhsaW5lTnVtYmVyLCBsaW5lTnVtYmVyLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVzRGVjb3JhdGlvbnMoX3N0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBfZW5kTGluZU51bWJlcjogbnVtYmVyLCBvd25lcklkOiBudW1iZXIgPSAwLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuID0gZmFsc2UsIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1pbihsaW5lQ291bnQsIE1hdGgubWF4KDEsIF9zdGFydExpbmVOdW1iZXIpKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gTWF0aC5taW4obGluZUNvdW50LCBNYXRoLm1heCgxLCBfZW5kTGluZU51bWJlcikpO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuX2dldERlY29yYXRpb25zSW5SYW5nZShyYW5nZSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdHB1c2hNYW55KGRlY29yYXRpb25zLCB0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMpKTtcblx0XHRwdXNoTWFueShkZWNvcmF0aW9ucywgdGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5nZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2UsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucykpO1xuXHRcdHJldHVybiBkZWNvcmF0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBnZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IElSYW5nZSwgb3duZXJJZDogbnVtYmVyID0gMCwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSwgb25seU1pbmltYXBEZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmFsaWRhdGVkUmFuZ2UgPSB0aGlzLnZhbGlkYXRlUmFuZ2UocmFuZ2UpO1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9nZXREZWNvcmF0aW9uc0luUmFuZ2UodmFsaWRhdGVkUmFuZ2UsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRwdXNoTWFueShkZWNvcmF0aW9ucywgdGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmdldERlY29yYXRpb25zSW5SYW5nZSh2YWxpZGF0ZWRSYW5nZSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWluaW1hcERlY29yYXRpb25zKSk7XG5cdFx0cHVzaE1hbnkoZGVjb3JhdGlvbnMsIHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHZhbGlkYXRlZFJhbmdlLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnMpKTtcblx0XHRyZXR1cm4gZGVjb3JhdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKG93bmVySWQ6IG51bWJlciA9IDAsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2UpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0QWxsKHRoaXMsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgdHJ1ZSwgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGVkVGV4dERlY29yYXRpb25zKG93bmVySWQ6IG51bWJlciA9IDApOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0QWxsSW5qZWN0ZWRUZXh0KHRoaXMsIG93bmVySWQpO1xuXHR9XG5cblx0cHVibGljIGdldEN1c3RvbUxpbmVIZWlnaHRzRGVjb3JhdGlvbnMob3duZXJJZDogbnVtYmVyID0gMCk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgZGVjcyA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRBbGxDdXN0b21MaW5lSGVpZ2h0cyh0aGlzLCBvd25lcklkKTtcblx0XHRwdXNoTWFueShkZWNzLCB0aGlzLl9mb250VG9rZW5EZWNvcmF0aW9uc1Byb3ZpZGVyLmdldEFsbERlY29yYXRpb25zKG93bmVySWQpKTtcblx0XHRyZXR1cm4gZGVjcztcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXN0b21MaW5lSGVpZ2h0c0RlY29yYXRpb25zSW5SYW5nZShyYW5nZTogUmFuZ2UsIG93bmVySWQ6IG51bWJlciA9IDApOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IGRlY3MgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Q3VzdG9tTGluZUhlaWdodHNJbkludGVydmFsKHRoaXMsIHRoaXMuZ2V0T2Zmc2V0QXQocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSwgdGhpcy5nZXRPZmZzZXRBdChyYW5nZS5nZXRFbmRQb3NpdGlvbigpKSwgb3duZXJJZCk7XG5cdFx0cHVzaE1hbnkoZGVjcywgdGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5nZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2UsIG93bmVySWQpKTtcblx0XHRyZXR1cm4gZGVjcztcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lSW5qZWN0ZWRUZXh0KGxpbmVOdW1iZXI6IG51bWJlciwgb3duZXJJZDogbnVtYmVyID0gMCk6IExpbmVJbmplY3RlZFRleHRbXSB7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQobGluZU51bWJlciwgMSk7XG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gc3RhcnRPZmZzZXQgKyB0aGlzLl9idWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRJbmplY3RlZFRleHRJbkludGVydmFsKHRoaXMsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIG93bmVySWQpO1xuXHRcdHJldHVybiBMaW5lSW5qZWN0ZWRUZXh0LmZyb21EZWNvcmF0aW9ucyhyZXN1bHQpLmZpbHRlcih0ID0+IHQubGluZU51bWJlciA9PT0gbGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9udERlY29yYXRpb25zSW5SYW5nZShyYW5nZTogSVJhbmdlLCBvd25lcklkOiBudW1iZXIgPSAwKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldEZvbnREZWNvcmF0aW9uc0luSW50ZXJ2YWwodGhpcywgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgb3duZXJJZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsRGVjb3JhdGlvbnMob3duZXJJZDogbnVtYmVyID0gMCwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRBbGwodGhpcywgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBmYWxzZSwgZmFsc2UpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdC5jb25jYXQodGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmdldEFsbERlY29yYXRpb25zKG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24pKTtcblx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIuZ2V0QWxsRGVjb3JhdGlvbnMob3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbikpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsTWFyZ2luRGVjb3JhdGlvbnMob3duZXJJZDogbnVtYmVyID0gMCk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRBbGwodGhpcywgb3duZXJJZCwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWNvcmF0aW9uc0luUmFuZ2UoZmlsdGVyUmFuZ2U6IFJhbmdlLCBmaWx0ZXJPd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChmaWx0ZXJSYW5nZS5zdGFydExpbmVOdW1iZXIsIGZpbHRlclJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQoZmlsdGVyUmFuZ2UuZW5kTGluZU51bWJlciwgZmlsdGVyUmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldEFsbEluSW50ZXJ2YWwodGhpcywgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGdldFJhbmdlQXQoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRSYW5nZUF0KHN0YXJ0LCBlbmQgLSBzdGFydCk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VEZWNvcmF0aW9uSW1wbChvd25lcklkOiBudW1iZXIsIGRlY29yYXRpb25JZDogc3RyaW5nLCBfcmFuZ2U6IElSYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9kZWNvcmF0aW9uc1tkZWNvcmF0aW9uSWRdO1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLm9wdGlvbnMuYWZ0ZXIpIHtcblx0XHRcdGNvbnN0IG9sZFJhbmdlID0gdGhpcy5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQob2xkUmFuZ2UhLmVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5vcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0Y29uc3Qgb2xkUmFuZ2UgPSB0aGlzLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChvbGRSYW5nZSEuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0ICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBvbGRSYW5nZSA9IHRoaXMuZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5TGluZUhlaWdodENoYW5nZShvd25lcklkLCBkZWNvcmF0aW9uSWQsIG9sZFJhbmdlIS5zdGFydExpbmVOdW1iZXIsIG51bGwpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5vcHRpb25zLmFmZmVjdHNGb250KSB7XG5cdFx0XHRjb25zdCBvbGRSYW5nZSA9IHRoaXMuZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5Rm9udENoYW5nZShvd25lcklkLCBub2RlLmlkLCBvbGRSYW5nZSEuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZSA9IHRoaXMuX3ZhbGlkYXRlUmFuZ2VSZWxheGVkTm9BbGxvY2F0aW9ucyhfcmFuZ2UpO1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblx0XHRub2RlLnJlc2V0KHRoaXMuZ2V0VmVyc2lvbklkKCksIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIHJhbmdlKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuaW5zZXJ0KG5vZGUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuY2hlY2tBZmZlY3RlZEFuZEZpcmUobm9kZS5vcHRpb25zKTtcblxuXHRcdGlmIChub2RlLm9wdGlvbnMuYWZ0ZXIpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQocmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMuYmVmb3JlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMubGluZUhlaWdodCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUxpbmVIZWlnaHRDaGFuZ2Uob3duZXJJZCwgZGVjb3JhdGlvbklkLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0KTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5hZmZlY3RzRm9udCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUZvbnRDaGFuZ2Uob3duZXJJZCwgbm9kZS5pZCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jaGFuZ2VEZWNvcmF0aW9uT3B0aW9uc0ltcGwob3duZXJJZDogbnVtYmVyLCBkZWNvcmF0aW9uSWQ6IHN0cmluZywgb3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9kZWNvcmF0aW9uc1tkZWNvcmF0aW9uSWRdO1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGVXYXNJbk92ZXJ2aWV3UnVsZXIgPSAobm9kZS5vcHRpb25zLm92ZXJ2aWV3UnVsZXIgJiYgbm9kZS5vcHRpb25zLm92ZXJ2aWV3UnVsZXIuY29sb3IgPyB0cnVlIDogZmFsc2UpO1xuXHRcdGNvbnN0IG5vZGVJc0luT3ZlcnZpZXdSdWxlciA9IChvcHRpb25zLm92ZXJ2aWV3UnVsZXIgJiYgb3B0aW9ucy5vdmVydmlld1J1bGVyLmNvbG9yID8gdHJ1ZSA6IGZhbHNlKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuY2hlY2tBZmZlY3RlZEFuZEZpcmUobm9kZS5vcHRpb25zKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmNoZWNrQWZmZWN0ZWRBbmRGaXJlKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG5vZGUub3B0aW9ucy5hZnRlciB8fCBvcHRpb25zLmFmdGVyKSB7XG5cdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChub2RlUmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMuYmVmb3JlIHx8IG9wdGlvbnMuYmVmb3JlKSB7XG5cdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChub2RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0ICE9PSBudWxsIHx8IG9wdGlvbnMubGluZUhlaWdodCAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlMaW5lSGVpZ2h0Q2hhbmdlKG93bmVySWQsIGRlY29yYXRpb25JZCwgbm9kZVJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3B0aW9ucy5saW5lSGVpZ2h0KTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5hZmZlY3RzRm9udCB8fCBvcHRpb25zLmFmZmVjdHNGb250KSB7XG5cdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUZvbnRDaGFuZ2Uob3duZXJJZCwgZGVjb3JhdGlvbklkLCBub2RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb3ZlZEluT3ZlcnZpZXdSdWxlciA9IG5vZGVXYXNJbk92ZXJ2aWV3UnVsZXIgIT09IG5vZGVJc0luT3ZlcnZpZXdSdWxlcjtcblx0XHRjb25zdCBjaGFuZ2VkV2hldGhlckluamVjdGVkVGV4dCA9IGlzT3B0aW9uc0luamVjdGVkVGV4dChvcHRpb25zKSAhPT0gaXNOb2RlSW5qZWN0ZWRUZXh0KG5vZGUpO1xuXHRcdGlmIChtb3ZlZEluT3ZlcnZpZXdSdWxlciB8fCBjaGFuZ2VkV2hldGhlckluamVjdGVkVGV4dCkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblx0XHRcdG5vZGUuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5pbnNlcnQobm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5vZGUuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZWx0YURlY29yYXRpb25zSW1wbChvd25lcklkOiBudW1iZXIsIG9sZERlY29yYXRpb25zSWRzOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IG1vZGVsLklNb2RlbERlbHRhRGVjb3JhdGlvbltdLCBzdXBwcmVzc0V2ZW50czogYm9vbGVhbiA9IGZhbHNlKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IHRoaXMuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHRjb25zdCBvbGREZWNvcmF0aW9uc0xlbiA9IG9sZERlY29yYXRpb25zSWRzLmxlbmd0aDtcblx0XHRsZXQgb2xkRGVjb3JhdGlvbkluZGV4ID0gMDtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zTGVuID0gbmV3RGVjb3JhdGlvbnMubGVuZ3RoO1xuXHRcdGxldCBuZXdEZWNvcmF0aW9uSW5kZXggPSAwO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8c3RyaW5nPihuZXdEZWNvcmF0aW9uc0xlbik7XG5cdFx0XHR3aGlsZSAob2xkRGVjb3JhdGlvbkluZGV4IDwgb2xkRGVjb3JhdGlvbnNMZW4gfHwgbmV3RGVjb3JhdGlvbkluZGV4IDwgbmV3RGVjb3JhdGlvbnNMZW4pIHtcblxuXHRcdFx0XHRsZXQgbm9kZTogSW50ZXJ2YWxOb2RlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdFx0aWYgKG9sZERlY29yYXRpb25JbmRleCA8IG9sZERlY29yYXRpb25zTGVuKSB7XG5cdFx0XHRcdFx0Ly8gKDEpIGdldCBvdXJzZWx2ZXMgYW4gb2xkIG5vZGVcblx0XHRcdFx0XHRsZXQgZGVjb3JhdGlvbklkOiBzdHJpbmc7XG5cdFx0XHRcdFx0ZG8ge1xuXHRcdFx0XHRcdFx0ZGVjb3JhdGlvbklkID0gb2xkRGVjb3JhdGlvbnNJZHNbb2xkRGVjb3JhdGlvbkluZGV4KytdO1xuXHRcdFx0XHRcdFx0bm9kZSA9IHRoaXMuX2RlY29yYXRpb25zW2RlY29yYXRpb25JZF07XG5cdFx0XHRcdFx0fSB3aGlsZSAoIW5vZGUgJiYgb2xkRGVjb3JhdGlvbkluZGV4IDwgb2xkRGVjb3JhdGlvbnNMZW4pO1xuXG5cdFx0XHRcdFx0Ly8gKDIpIHJlbW92ZSB0aGUgbm9kZSBmcm9tIHRoZSB0cmVlIChpZiBpdCBleGlzdHMpXG5cdFx0XHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0XHRcdGlmIChub2RlLm9wdGlvbnMuYWZ0ZXIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChub2RlUmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KG5vZGVSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5vZGVSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXROb2RlUmFuZ2UodGhpcywgbm9kZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlMaW5lSGVpZ2h0Q2hhbmdlKG93bmVySWQsIGRlY29yYXRpb25JZCwgbm9kZVJhbmdlLnN0YXJ0TGluZU51bWJlciwgbnVsbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmFmZmVjdHNGb250KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5vZGVSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXROb2RlUmFuZ2UodGhpcywgbm9kZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlGb250Q2hhbmdlKG93bmVySWQsIGRlY29yYXRpb25JZCwgbm9kZVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXG5cdFx0XHRcdFx0XHRpZiAoIXN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuY2hlY2tBZmZlY3RlZEFuZEZpcmUobm9kZS5vcHRpb25zKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobmV3RGVjb3JhdGlvbkluZGV4IDwgbmV3RGVjb3JhdGlvbnNMZW4pIHtcblx0XHRcdFx0XHQvLyAoMykgY3JlYXRlIGEgbmV3IG5vZGUgaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnRlcm5hbERlY29yYXRpb25JZCA9ICgrK3RoaXMuX2xhc3REZWNvcmF0aW9uSWQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbklkID0gYCR7dGhpcy5faW5zdGFuY2VJZH07JHtpbnRlcm5hbERlY29yYXRpb25JZH1gO1xuXHRcdFx0XHRcdFx0bm9kZSA9IG5ldyBJbnRlcnZhbE5vZGUoZGVjb3JhdGlvbklkLCAwLCAwKTtcblx0XHRcdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zW2RlY29yYXRpb25JZF0gPSBub2RlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vICg0KSBpbml0aWFsaXplIG5vZGVcblx0XHRcdFx0XHRjb25zdCBuZXdEZWNvcmF0aW9uID0gbmV3RGVjb3JhdGlvbnNbbmV3RGVjb3JhdGlvbkluZGV4XTtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX3ZhbGlkYXRlUmFuZ2VSZWxheGVkTm9BbGxvY2F0aW9ucyhuZXdEZWNvcmF0aW9uLnJhbmdlKTtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zID0gX25vcm1hbGl6ZU9wdGlvbnMobmV3RGVjb3JhdGlvbi5vcHRpb25zKTtcblx0XHRcdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblxuXHRcdFx0XHRcdG5vZGUub3duZXJJZCA9IG93bmVySWQ7XG5cdFx0XHRcdFx0bm9kZS5yZXNldCh2ZXJzaW9uSWQsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIHJhbmdlKTtcblx0XHRcdFx0XHRub2RlLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmFmdGVyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmxpbmVIZWlnaHQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlMaW5lSGVpZ2h0Q2hhbmdlKG93bmVySWQsIG5vZGUuaWQsIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgbm9kZS5vcHRpb25zLmxpbmVIZWlnaHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmFmZmVjdHNGb250KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5Rm9udENoYW5nZShvd25lcklkLCBub2RlLmlkLCByYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXN1cHByZXNzRXZlbnRzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmNoZWNrQWZmZWN0ZWRBbmRGaXJlKG9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5pbnNlcnQobm9kZSk7XG5cblx0XHRcdFx0XHRyZXN1bHRbbmV3RGVjb3JhdGlvbkluZGV4XSA9IG5vZGUuaWQ7XG5cblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9uSW5kZXgrKztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRpb25zW25vZGUuaWRdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUb2tlbml6YXRpb25cblxuXHQvLyBUT0RPIG1vdmUgdGhlbSB0byB0aGUgdG9rZW5pemF0aW9uIHBhcnQuXG5cdHB1YmxpYyBnZXRMYW5ndWFnZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5pemF0aW9uLmdldExhbmd1YWdlSWQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRMYW5ndWFnZShsYW5ndWFnZUlkT3JTZWxlY3Rpb246IHN0cmluZyB8IElMYW5ndWFnZVNlbGVjdGlvbiwgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBsYW5ndWFnZUlkT3JTZWxlY3Rpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9sYW5ndWFnZVNlbGVjdGlvbkxpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9zZXRMYW5ndWFnZShsYW5ndWFnZUlkT3JTZWxlY3Rpb24sIHNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xhbmd1YWdlU2VsZWN0aW9uTGlzdGVuZXIudmFsdWUgPSBsYW5ndWFnZUlkT3JTZWxlY3Rpb24ub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLmxhbmd1YWdlSWQsIHNvdXJjZSkpO1xuXHRcdFx0dGhpcy5fc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLmxhbmd1YWdlSWQsIHNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRva2VuaXphdGlvbi5zZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQsIHNvdXJjZSk7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLnJlcXVlc3RSaWNoTGFuZ3VhZ2VGZWF0dXJlcyhsYW5ndWFnZUlkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy50b2tlbml6YXRpb24uZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uKTogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuZ2V0V29yZEF0UG9zaXRpb24ocG9zaXRpb24pO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmRVbnRpbFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBJV29yZEF0UG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXHRub3JtYWxpemVQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIGFmZmluaXR5OiBtb2RlbC5Qb3NpdGlvbkFmZmluaXR5KTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBwb3NpdGlvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjb2x1bW4gYXQgd2hpY2ggaW5kZW50YXRpb24gc3RvcHMgYXQgYSBnaXZlbiBsaW5lLlxuXHQgKiBAaW50ZXJuYWxcblx0Ki9cblx0cHVibGljIGdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHQvLyBDb2x1bW5zIHN0YXJ0IHdpdGggMS5cblx0XHRyZXR1cm4gaW5kZW50T2ZMaW5lKHRoaXMuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcikpICsgMTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgVGV4dE1vZGVsKCR7dGhpcy51cmkudG9TdHJpbmcoKX0pYDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGluZVRva2Vuc1dpdGhJbmplY3Rpb25zKHRva2VuczogTGluZVRva2VucywgaW5qZWN0aW9uT3B0aW9uczogbW9kZWwuSW5qZWN0ZWRUZXh0T3B0aW9uc1tdIHwgbnVsbCwgaW5qZWN0aW9uT2Zmc2V0czogbnVtYmVyW10gfCBudWxsKTogTGluZVRva2VucyB7XG5cdGxldCBsaW5lVG9rZW5zOiBMaW5lVG9rZW5zO1xuXHRpZiAoaW5qZWN0aW9uT2Zmc2V0cykge1xuXHRcdGNvbnN0IHRva2Vuc1RvSW5zZXJ0OiB7IG9mZnNldDogbnVtYmVyOyB0ZXh0OiBzdHJpbmc7IHRva2VuTWV0YWRhdGE6IG51bWJlciB9W10gPSBbXTtcblxuXHRcdGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IGluamVjdGlvbk9mZnNldHMubGVuZ3RoOyBpZHgrKykge1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gaW5qZWN0aW9uT2Zmc2V0c1tpZHhdO1xuXHRcdFx0Y29uc3QgdG9rZW5zID0gaW5qZWN0aW9uT3B0aW9ucyFbaWR4XS50b2tlbnM7XG5cdFx0XHRpZiAodG9rZW5zKSB7XG5cdFx0XHRcdHRva2Vucy5mb3JFYWNoKChyYW5nZSwgaW5mbykgPT4ge1xuXHRcdFx0XHRcdHRva2Vuc1RvSW5zZXJ0LnB1c2goe1xuXHRcdFx0XHRcdFx0b2Zmc2V0LFxuXHRcdFx0XHRcdFx0dGV4dDogcmFuZ2Uuc3Vic3RyaW5nKGluamVjdGlvbk9wdGlvbnMhW2lkeF0uY29udGVudCksXG5cdFx0XHRcdFx0XHR0b2tlbk1ldGFkYXRhOiBpbmZvLm1ldGFkYXRhLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRva2Vuc1RvSW5zZXJ0LnB1c2goe1xuXHRcdFx0XHRcdG9mZnNldCxcblx0XHRcdFx0XHR0ZXh0OiBpbmplY3Rpb25PcHRpb25zIVtpZHhdLmNvbnRlbnQsXG5cdFx0XHRcdFx0dG9rZW5NZXRhZGF0YTogTGluZVRva2Vucy5kZWZhdWx0VG9rZW5NZXRhZGF0YSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxpbmVUb2tlbnMgPSB0b2tlbnMud2l0aEluc2VydGVkKHRva2Vuc1RvSW5zZXJ0KTtcblx0fSBlbHNlIHtcblx0XHRsaW5lVG9rZW5zID0gdG9rZW5zO1xuXHR9XG5cdHJldHVybiBsaW5lVG9rZW5zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kZW50T2ZMaW5lKGxpbmU6IHN0cmluZyk6IG51bWJlciB7XG5cdGxldCBpbmRlbnQgPSAwO1xuXHRmb3IgKGNvbnN0IGMgb2YgbGluZSkge1xuXHRcdGlmIChjID09PSAnICcgfHwgYyA9PT0gJ1xcdCcpIHtcblx0XHRcdGluZGVudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblx0cmV0dXJuIGluZGVudDtcbn1cblxuLy8jcmVnaW9uIERlY29yYXRpb25zXG5cbmZ1bmN0aW9uIGlzTm9kZUluT3ZlcnZpZXdSdWxlcihub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuIChub2RlLm9wdGlvbnMub3ZlcnZpZXdSdWxlciAmJiBub2RlLm9wdGlvbnMub3ZlcnZpZXdSdWxlci5jb2xvciA/IHRydWUgOiBmYWxzZSk7XG59XG5cbmZ1bmN0aW9uIGlzT3B0aW9uc0luamVjdGVkVGV4dChvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIW9wdGlvbnMuYWZ0ZXIgfHwgISFvcHRpb25zLmJlZm9yZTtcbn1cblxuZnVuY3Rpb24gaXNOb2RlSW5qZWN0ZWRUZXh0KG5vZGU6IEludGVydmFsTm9kZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFub2RlLm9wdGlvbnMuYWZ0ZXIgfHwgISFub2RlLm9wdGlvbnMuYmVmb3JlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWNvcmF0aW9uc1RyZWVzSG9zdCB7XG5cdGdldFZlcnNpb25JZCgpOiBudW1iZXI7XG5cdGdldFJhbmdlQXQoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIpOiBSYW5nZTtcbn1cblxuY2xhc3MgRGVjb3JhdGlvbnNUcmVlcyB7XG5cblx0LyoqXG5cdCAqIFRoaXMgdHJlZSBob2xkcyBkZWNvcmF0aW9ucyB0aGF0IGRvIG5vdCBzaG93IHVwIGluIHRoZSBvdmVydmlldyBydWxlci5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zVHJlZTA6IEludGVydmFsVHJlZTtcblxuXHQvKipcblx0ICogVGhpcyB0cmVlIGhvbGRzIGRlY29yYXRpb25zIHRoYXQgc2hvdyB1cCBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uc1RyZWUxOiBJbnRlcnZhbFRyZWU7XG5cblx0LyoqXG5cdCAqIFRoaXMgdHJlZSBob2xkcyBkZWNvcmF0aW9ucyB0aGF0IGNvbnRhaW4gaW5qZWN0ZWQgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZTogSW50ZXJ2YWxUcmVlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTAgPSBuZXcgSW50ZXJ2YWxUcmVlKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlMSA9IG5ldyBJbnRlcnZhbFRyZWUoKTtcblx0XHR0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUgPSBuZXcgSW50ZXJ2YWxUcmVlKCk7XG5cdH1cblxuXHRwdWJsaWMgZW5zdXJlQWxsTm9kZXNIYXZlUmFuZ2VzKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0QWxsKGhvc3QsIDAsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZU5vZGVzSGF2ZVJhbmdlcyhob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QsIG5vZGVzOiBJbnRlcnZhbE5vZGVbXSk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0XHRpZiAobm9kZS5yYW5nZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRub2RlLnJhbmdlID0gaG9zdC5nZXRSYW5nZUF0KG5vZGUuY2FjaGVkQWJzb2x1dGVTdGFydCwgbm9kZS5jYWNoZWRBYnNvbHV0ZUVuZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiA8bW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdPm5vZGVzO1xuXHR9XG5cblx0cHVibGljIGdldEFsbEluSW50ZXJ2YWwoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gaG9zdC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIHZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnRlcnZhbFNlYXJjaChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0Y29uc3QgcjAgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmludGVydmFsU2VhcmNoKHN0YXJ0LCBlbmQsIGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdGNvbnN0IHIxID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRjb25zdCByMiA9IHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRyZXR1cm4gcjAuY29uY2F0KHIxKS5jb25jYXQocjIpO1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGVkVGV4dEluSW50ZXJ2YWwoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSBob3N0LmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmYWxzZSwgZmFsc2UsIHZlcnNpb25JZCwgZmFsc2UpO1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVOb2Rlc0hhdmVSYW5nZXMoaG9zdCwgcmVzdWx0KS5maWx0ZXIoKGkpID0+IGkub3B0aW9ucy5zaG93SWZDb2xsYXBzZWQgfHwgIWkucmFuZ2UuaXNFbXB0eSgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb250RGVjb3JhdGlvbnNJbkludGVydmFsKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlcik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gaG9zdC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTAuaW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmFsc2UsIGZhbHNlLCB2ZXJzaW9uSWQsIGZhbHNlKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIGRlY29yYXRpb25zKS5maWx0ZXIoKGkpID0+IGkub3B0aW9ucy5hZmZlY3RzRm9udCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsSW5qZWN0ZWRUZXh0KGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgZmlsdGVyT3duZXJJZDogbnVtYmVyKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSBob3N0LmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5zZWFyY2goZmlsdGVyT3duZXJJZCwgZmFsc2UsIGZhbHNlLCB2ZXJzaW9uSWQsIGZhbHNlKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCkuZmlsdGVyKChpKSA9PiBpLm9wdGlvbnMuc2hvd0lmQ29sbGFwc2VkIHx8ICFpLnJhbmdlLmlzRW1wdHkoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsQ3VzdG9tTGluZUhlaWdodHMoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBmaWx0ZXJPd25lcklkOiBudW1iZXIpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2VhcmNoKGZpbHRlck93bmVySWQsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIHZlcnNpb25JZCwgZmFsc2UpO1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVOb2Rlc0hhdmVSYW5nZXMoaG9zdCwgcmVzdWx0KS5maWx0ZXIoKGkpID0+IHR5cGVvZiBpLm9wdGlvbnMubGluZUhlaWdodCA9PT0gJ251bWJlcicpO1xuXHR9XG5cblx0cHVibGljIGdldEN1c3RvbUxpbmVIZWlnaHRzSW5JbnRlcnZhbChob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBmaWx0ZXJPd25lcklkOiBudW1iZXIpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5faW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmFsc2UsIGZhbHNlLCB2ZXJzaW9uSWQsIGZhbHNlKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCkuZmlsdGVyKChpKSA9PiB0eXBlb2YgaS5vcHRpb25zLmxpbmVIZWlnaHQgPT09ICdudW1iZXInKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGwoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBmaWx0ZXJPd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgb3ZlcnZpZXdSdWxlck9ubHk6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gaG9zdC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9zZWFyY2goZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvdmVydmlld1J1bGVyT25seSwgdmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVOb2Rlc0hhdmVSYW5nZXMoaG9zdCwgcmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NlYXJjaChmaWx0ZXJPd25lcklkOiBudW1iZXIsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4sIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiwgb3ZlcnZpZXdSdWxlck9ubHk6IGJvb2xlYW4sIGNhY2hlZFZlcnNpb25JZDogbnVtYmVyLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0aWYgKG92ZXJ2aWV3UnVsZXJPbmx5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5zZWFyY2goZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBjYWNoZWRWZXJzaW9uSWQsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHIwID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMC5zZWFyY2goZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBjYWNoZWRWZXJzaW9uSWQsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0XHRjb25zdCByMSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTEuc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdFx0Y29uc3QgcjIgPSB0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHIwLmNvbmNhdChyMSkuY29uY2F0KHIyKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29sbGVjdE5vZGVzRnJvbU93bmVyKG93bmVySWQ6IG51bWJlcik6IEludGVydmFsTm9kZVtdIHtcblx0XHRjb25zdCByMCA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTAuY29sbGVjdE5vZGVzRnJvbU93bmVyKG93bmVySWQpO1xuXHRcdGNvbnN0IHIxID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5jb2xsZWN0Tm9kZXNGcm9tT3duZXIob3duZXJJZCk7XG5cdFx0Y29uc3QgcjIgPSB0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuY29sbGVjdE5vZGVzRnJvbU93bmVyKG93bmVySWQpO1xuXHRcdHJldHVybiByMC5jb25jYXQocjEpLmNvbmNhdChyMik7XG5cdH1cblxuXHRwdWJsaWMgY29sbGVjdE5vZGVzUG9zdE9yZGVyKCk6IEludGVydmFsTm9kZVtdIHtcblx0XHRjb25zdCByMCA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTAuY29sbGVjdE5vZGVzUG9zdE9yZGVyKCk7XG5cdFx0Y29uc3QgcjEgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUxLmNvbGxlY3ROb2Rlc1Bvc3RPcmRlcigpO1xuXHRcdGNvbnN0IHIyID0gdGhpcy5faW5qZWN0ZWRUZXh0RGVjb3JhdGlvbnNUcmVlLmNvbGxlY3ROb2Rlc1Bvc3RPcmRlcigpO1xuXHRcdHJldHVybiByMC5jb25jYXQocjEpLmNvbmNhdChyMik7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0KG5vZGU6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRcdGlmIChpc05vZGVJbmplY3RlZFRleHQobm9kZSkpIHtcblx0XHRcdHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5pbnNlcnQobm9kZSk7XG5cdFx0fSBlbHNlIGlmIChpc05vZGVJbk92ZXJ2aWV3UnVsZXIobm9kZSkpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTEuaW5zZXJ0KG5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmluc2VydChub2RlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZGVsZXRlKG5vZGU6IEludGVydmFsTm9kZSk6IHZvaWQge1xuXHRcdGlmIChpc05vZGVJbmplY3RlZFRleHQobm9kZSkpIHtcblx0XHRcdHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5kZWxldGUobm9kZSk7XG5cdFx0fSBlbHNlIGlmIChpc05vZGVJbk92ZXJ2aWV3UnVsZXIobm9kZSkpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTEuZGVsZXRlKG5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmRlbGV0ZShub2RlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0Tm9kZVJhbmdlKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgbm9kZTogSW50ZXJ2YWxOb2RlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0aWYgKG5vZGUuY2FjaGVkVmVyc2lvbklkICE9PSB2ZXJzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVOb2RlKG5vZGUsIHZlcnNpb25JZCk7XG5cdFx0fVxuXHRcdGlmIChub2RlLnJhbmdlID09PSBudWxsKSB7XG5cdFx0XHRub2RlLnJhbmdlID0gaG9zdC5nZXRSYW5nZUF0KG5vZGUuY2FjaGVkQWJzb2x1dGVTdGFydCwgbm9kZS5jYWNoZWRBYnNvbHV0ZUVuZCk7XG5cdFx0fVxuXHRcdHJldHVybiBub2RlLnJhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZU5vZGUobm9kZTogSW50ZXJ2YWxOb2RlLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpc05vZGVJbmplY3RlZFRleHQobm9kZSkpIHtcblx0XHRcdHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5yZXNvbHZlTm9kZShub2RlLCBjYWNoZWRWZXJzaW9uSWQpO1xuXHRcdH0gZWxzZSBpZiAoaXNOb2RlSW5PdmVydmlld1J1bGVyKG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUxLnJlc29sdmVOb2RlKG5vZGUsIGNhY2hlZFZlcnNpb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTAucmVzb2x2ZU5vZGUobm9kZSwgY2FjaGVkVmVyc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0UmVwbGFjZShvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIHRleHRMZW5ndGg6IG51bWJlciwgZm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTAuYWNjZXB0UmVwbGFjZShvZmZzZXQsIGxlbmd0aCwgdGV4dExlbmd0aCwgZm9yY2VNb3ZlTWFya2Vycyk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5hY2NlcHRSZXBsYWNlKG9mZnNldCwgbGVuZ3RoLCB0ZXh0TGVuZ3RoLCBmb3JjZU1vdmVNYXJrZXJzKTtcblx0XHR0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuYWNjZXB0UmVwbGFjZShvZmZzZXQsIGxlbmd0aCwgdGV4dExlbmd0aCwgZm9yY2VNb3ZlTWFya2Vycyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2xlYW5DbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gY2xhc3NOYW1lLnJlcGxhY2UoL1teYS16MC05XFwtX10vZ2ksICcgJyk7XG59XG5cbmNsYXNzIERlY29yYXRpb25PcHRpb25zIGltcGxlbWVudHMgbW9kZWwuSURlY29yYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgY29sb3I6IHN0cmluZyB8IFRoZW1lQ29sb3I7XG5cdHJlYWRvbmx5IGRhcmtDb2xvcjogc3RyaW5nIHwgVGhlbWVDb2xvcjtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBtb2RlbC5JRGVjb3JhdGlvbk9wdGlvbnMpIHtcblx0XHR0aGlzLmNvbG9yID0gb3B0aW9ucy5jb2xvciB8fCAnJztcblx0XHR0aGlzLmRhcmtDb2xvciA9IG9wdGlvbnMuZGFya0NvbG9yIHx8ICcnO1xuXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zIGV4dGVuZHMgRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRyZWFkb25seSBwb3NpdGlvbjogbW9kZWwuT3ZlcnZpZXdSdWxlckxhbmU7XG5cdHByaXZhdGUgX3Jlc29sdmVkQ29sb3I6IHN0cmluZyB8IG51bGw7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zKSB7XG5cdFx0c3VwZXIob3B0aW9ucyk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRDb2xvciA9IG51bGw7XG5cdFx0dGhpcy5wb3NpdGlvbiA9ICh0eXBlb2Ygb3B0aW9ucy5wb3NpdGlvbiA9PT0gJ251bWJlcicgPyBvcHRpb25zLnBvc2l0aW9uIDogbW9kZWwuT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2xvcih0aGVtZTogSUNvbG9yVGhlbWUpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5fcmVzb2x2ZWRDb2xvcikge1xuXHRcdFx0aWYgKGlzRGFyayh0aGVtZS50eXBlKSAmJiB0aGlzLmRhcmtDb2xvcikge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZENvbG9yID0gdGhpcy5fcmVzb2x2ZUNvbG9yKHRoaXMuZGFya0NvbG9yLCB0aGVtZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZENvbG9yID0gdGhpcy5fcmVzb2x2ZUNvbG9yKHRoaXMuY29sb3IsIHRoZW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVkQ29sb3I7XG5cdH1cblxuXHRwdWJsaWMgaW52YWxpZGF0ZUNhY2hlZENvbG9yKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29sb3IgPSBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNvbG9yKGNvbG9yOiBzdHJpbmcgfCBUaGVtZUNvbG9yLCB0aGVtZTogSUNvbG9yVGhlbWUpOiBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgY29sb3IgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gY29sb3I7XG5cdFx0fVxuXHRcdGNvbnN0IGMgPSBjb2xvciA/IHRoZW1lLmdldENvbG9yKGNvbG9yLmlkKSA6IG51bGw7XG5cdFx0aWYgKCFjKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBjLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsRGVjb3JhdGlvbkdseXBoTWFyZ2luT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBvc2l0aW9uOiBtb2RlbC5HbHlwaE1hcmdpbkxhbmU7XG5cdHJlYWRvbmx5IHBlcnNpc3RMYW5lOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbk9wdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5wb3NpdGlvbiA9IG9wdGlvbnM/LnBvc2l0aW9uID8/IG1vZGVsLkdseXBoTWFyZ2luTGFuZS5DZW50ZXI7XG5cdFx0dGhpcy5wZXJzaXN0TGFuZSA9IG9wdGlvbnM/LnBlcnNpc3RMYW5lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbERlY29yYXRpb25NaW5pbWFwT3B0aW9ucyBleHRlbmRzIERlY29yYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgcG9zaXRpb246IG1vZGVsLk1pbmltYXBQb3NpdGlvbjtcblx0cmVhZG9ubHkgc2VjdGlvbkhlYWRlclN0eWxlOiBtb2RlbC5NaW5pbWFwU2VjdGlvbkhlYWRlclN0eWxlIHwgbnVsbDtcblx0cmVhZG9ubHkgc2VjdGlvbkhlYWRlclRleHQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX3Jlc29sdmVkQ29sb3I6IENvbG9yIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25NaW5pbWFwT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdGlvbnMpO1xuXHRcdHRoaXMucG9zaXRpb24gPSBvcHRpb25zLnBvc2l0aW9uO1xuXHRcdHRoaXMuc2VjdGlvbkhlYWRlclN0eWxlID0gb3B0aW9ucy5zZWN0aW9uSGVhZGVyU3R5bGUgPz8gbnVsbDtcblx0XHR0aGlzLnNlY3Rpb25IZWFkZXJUZXh0ID0gb3B0aW9ucy5zZWN0aW9uSGVhZGVyVGV4dCA/PyBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldENvbG9yKHRoZW1lOiBJQ29sb3JUaGVtZSk6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkQ29sb3IpIHtcblx0XHRcdGlmIChpc0RhcmsodGhlbWUudHlwZSkgJiYgdGhpcy5kYXJrQ29sb3IpIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb2xvciA9IHRoaXMuX3Jlc29sdmVDb2xvcih0aGlzLmRhcmtDb2xvciwgdGhlbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb2xvciA9IHRoaXMuX3Jlc29sdmVDb2xvcih0aGlzLmNvbG9yLCB0aGVtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVkQ29sb3I7XG5cdH1cblxuXHRwdWJsaWMgaW52YWxpZGF0ZUNhY2hlZENvbG9yKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29sb3IgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ29sb3IoY29sb3I6IHN0cmluZyB8IFRoZW1lQ29sb3IsIHRoZW1lOiBJQ29sb3JUaGVtZSk6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHlwZW9mIGNvbG9yID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIENvbG9yLmZyb21IZXgoY29sb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhlbWUuZ2V0Q29sb3IoY29sb3IuaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zIGltcGxlbWVudHMgbW9kZWwuSW5qZWN0ZWRUZXh0T3B0aW9ucyB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbShvcHRpb25zOiBtb2RlbC5JbmplY3RlZFRleHRPcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyB7XG5cdFx0aWYgKG9wdGlvbnMgaW5zdGFuY2VvZiBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucztcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHRva2VuczogVG9rZW5BcnJheSB8IG51bGw7XG5cdHJlYWRvbmx5IGlubGluZUNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGF0dGFjaGVkRGF0YTogdW5rbm93biB8IG51bGw7XG5cdHJlYWRvbmx5IGN1cnNvclN0b3BzOiBtb2RlbC5JbmplY3RlZFRleHRDdXJzb3JTdG9wcyB8IG51bGw7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihvcHRpb25zOiBtb2RlbC5JbmplY3RlZFRleHRPcHRpb25zKSB7XG5cdFx0dGhpcy5jb250ZW50ID0gb3B0aW9ucy5jb250ZW50IHx8ICcnO1xuXHRcdHRoaXMudG9rZW5zID0gb3B0aW9ucy50b2tlbnMgPz8gbnVsbDtcblx0XHR0aGlzLmlubGluZUNsYXNzTmFtZSA9IG9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lIHx8IG51bGw7XG5cdFx0dGhpcy5pbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZyA9IG9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmcgfHwgZmFsc2U7XG5cdFx0dGhpcy5hdHRhY2hlZERhdGEgPSBvcHRpb25zLmF0dGFjaGVkRGF0YSB8fCBudWxsO1xuXHRcdHRoaXMuY3Vyc29yU3RvcHMgPSBvcHRpb25zLmN1cnNvclN0b3BzIHx8IG51bGw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgaW1wbGVtZW50cyBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cblx0cHVibGljIHN0YXRpYyBFTVBUWTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucztcblxuXHRwdWJsaWMgc3RhdGljIHJlZ2lzdGVyKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIG5ldyBNb2RlbERlY29yYXRpb25PcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGVEeW5hbWljKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0cmV0dXJuIG5ldyBNb2RlbERlY29yYXRpb25PcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJsb2NrQ2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBibG9ja0lzQWZ0ZXJFbmQ6IGJvb2xlYW4gfCBudWxsO1xuXHRyZWFkb25seSBibG9ja0RvZXNOb3RDb2xsYXBzZT86IGJvb2xlYW4gfCBudWxsO1xuXHRyZWFkb25seSBibG9ja1BhZGRpbmc6IFt0b3A6IG51bWJlciwgcmlnaHQ6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIGxlZnQ6IG51bWJlcl0gfCBudWxsO1xuXHRyZWFkb25seSBzdGlja2luZXNzOiBtb2RlbC5UcmFja2VkUmFuZ2VTdGlja2luZXNzO1xuXHRyZWFkb25seSB6SW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBzaG91bGRGaWxsTGluZU9uTGluZUJyZWFrOiBib29sZWFuIHwgbnVsbDtcblx0cmVhZG9ubHkgaG92ZXJNZXNzYWdlOiBJTWFya2Rvd25TdHJpbmcgfCBJTWFya2Rvd25TdHJpbmdbXSB8IG51bGw7XG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlOiBJTWFya2Rvd25TdHJpbmcgfCBJTWFya2Rvd25TdHJpbmdbXSB8IG51bGw7XG5cdHJlYWRvbmx5IGlzV2hvbGVMaW5lOiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXIgfCBudWxsO1xuXHRyZWFkb25seSBmb250U2l6ZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgc2hvd0lmQ29sbGFwc2VkOiBib29sZWFuO1xuXHRyZWFkb25seSBjb2xsYXBzZU9uUmVwbGFjZUVkaXQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG92ZXJ2aWV3UnVsZXI6IE1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zIHwgbnVsbDtcblx0cmVhZG9ubHkgbWluaW1hcDogTW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMgfCBudWxsO1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbj86IG1vZGVsLklNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbk9wdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbkNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgbGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgbGluZU51bWJlckNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgbGluZU51bWJlckhvdmVyTWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nW10gfCBudWxsO1xuXHRyZWFkb25seSBsaW5lc0RlY29yYXRpb25zVG9vbHRpcDogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgZmlyc3RMaW5lRGVjb3JhdGlvbkNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgbWFyZ2luQ2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBpbmxpbmVDbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBiZWZvcmVDb250ZW50Q2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBhZnRlckNvbnRlbnRDbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGFmdGVyOiBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zIHwgbnVsbDtcblx0cmVhZG9ubHkgYmVmb3JlOiBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zIHwgbnVsbDtcblx0cmVhZG9ubHkgaGlkZUluQ29tbWVudFRva2VuczogYm9vbGVhbiB8IG51bGw7XG5cdHJlYWRvbmx5IGhpZGVJblN0cmluZ1Rva2VuczogYm9vbGVhbiB8IG51bGw7XG5cdHJlYWRvbmx5IGFmZmVjdHNGb250OiBib29sZWFuIHwgbnVsbDtcblx0cmVhZG9ubHkgdGV4dERpcmVjdGlvbj86IG1vZGVsLlRleHREaXJlY3Rpb24gfCBudWxsIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3Iob3B0aW9uczogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpIHtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb3B0aW9ucy5kZXNjcmlwdGlvbjtcblx0XHR0aGlzLmJsb2NrQ2xhc3NOYW1lID0gb3B0aW9ucy5ibG9ja0NsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMuYmxvY2tDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmJsb2NrRG9lc05vdENvbGxhcHNlID0gb3B0aW9ucy5ibG9ja0RvZXNOb3RDb2xsYXBzZSA/PyBudWxsO1xuXHRcdHRoaXMuYmxvY2tJc0FmdGVyRW5kID0gb3B0aW9ucy5ibG9ja0lzQWZ0ZXJFbmQgPz8gbnVsbDtcblx0XHR0aGlzLmJsb2NrUGFkZGluZyA9IG9wdGlvbnMuYmxvY2tQYWRkaW5nID8/IG51bGw7XG5cdFx0dGhpcy5zdGlja2luZXNzID0gb3B0aW9ucy5zdGlja2luZXNzIHx8IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcztcblx0XHR0aGlzLnpJbmRleCA9IG9wdGlvbnMuekluZGV4IHx8IDA7XG5cdFx0dGhpcy5jbGFzc05hbWUgPSBvcHRpb25zLmNsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMuY2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5zaG91bGRGaWxsTGluZU9uTGluZUJyZWFrID0gb3B0aW9ucy5zaG91bGRGaWxsTGluZU9uTGluZUJyZWFrID8/IG51bGw7XG5cdFx0dGhpcy5ob3Zlck1lc3NhZ2UgPSBvcHRpb25zLmhvdmVyTWVzc2FnZSB8fCBudWxsO1xuXHRcdHRoaXMuZ2x5cGhNYXJnaW5Ib3Zlck1lc3NhZ2UgPSBvcHRpb25zLmdseXBoTWFyZ2luSG92ZXJNZXNzYWdlIHx8IG51bGw7XG5cdFx0dGhpcy5saW5lTnVtYmVySG92ZXJNZXNzYWdlID0gb3B0aW9ucy5saW5lTnVtYmVySG92ZXJNZXNzYWdlIHx8IG51bGw7XG5cdFx0dGhpcy5pc1dob2xlTGluZSA9IG9wdGlvbnMuaXNXaG9sZUxpbmUgfHwgZmFsc2U7XG5cdFx0dGhpcy5saW5lSGVpZ2h0ID0gb3B0aW9ucy5saW5lSGVpZ2h0ID8gTWF0aC5taW4ob3B0aW9ucy5saW5lSGVpZ2h0LCBMSU5FX0hFSUdIVF9DRUlMSU5HKSA6IG51bGw7XG5cdFx0dGhpcy5mb250U2l6ZSA9IG9wdGlvbnMuZm9udFNpemUgfHwgbnVsbDtcblx0XHR0aGlzLmFmZmVjdHNGb250ID0gISFvcHRpb25zLmZvbnRTaXplIHx8ICEhb3B0aW9ucy5mb250RmFtaWx5IHx8ICEhb3B0aW9ucy5mb250V2VpZ2h0IHx8ICEhb3B0aW9ucy5mb250U3R5bGU7XG5cdFx0dGhpcy5zaG93SWZDb2xsYXBzZWQgPSBvcHRpb25zLnNob3dJZkNvbGxhcHNlZCB8fCBmYWxzZTtcblx0XHR0aGlzLmNvbGxhcHNlT25SZXBsYWNlRWRpdCA9IG9wdGlvbnMuY29sbGFwc2VPblJlcGxhY2VFZGl0IHx8IGZhbHNlO1xuXHRcdHRoaXMub3ZlcnZpZXdSdWxlciA9IG9wdGlvbnMub3ZlcnZpZXdSdWxlciA/IG5ldyBNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucyhvcHRpb25zLm92ZXJ2aWV3UnVsZXIpIDogbnVsbDtcblx0XHR0aGlzLm1pbmltYXAgPSBvcHRpb25zLm1pbmltYXAgPyBuZXcgTW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMob3B0aW9ucy5taW5pbWFwKSA6IG51bGw7XG5cdFx0dGhpcy5nbHlwaE1hcmdpbiA9IG9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWUgPyBuZXcgTW9kZWxEZWNvcmF0aW9uR2x5cGhNYXJnaW5PcHRpb25zKG9wdGlvbnMuZ2x5cGhNYXJnaW4pIDogbnVsbDtcblx0XHR0aGlzLmdseXBoTWFyZ2luQ2xhc3NOYW1lID0gb3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWUgPSBvcHRpb25zLmxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmxpbmVOdW1iZXJDbGFzc05hbWUgPSBvcHRpb25zLmxpbmVOdW1iZXJDbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmxpbmVOdW1iZXJDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmxpbmVzRGVjb3JhdGlvbnNUb29sdGlwID0gb3B0aW9ucy5saW5lc0RlY29yYXRpb25zVG9vbHRpcCA/IHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKG9wdGlvbnMubGluZXNEZWNvcmF0aW9uc1Rvb2x0aXApIDogbnVsbDtcblx0XHR0aGlzLmZpcnN0TGluZURlY29yYXRpb25DbGFzc05hbWUgPSBvcHRpb25zLmZpcnN0TGluZURlY29yYXRpb25DbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmZpcnN0TGluZURlY29yYXRpb25DbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLm1hcmdpbkNsYXNzTmFtZSA9IG9wdGlvbnMubWFyZ2luQ2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5tYXJnaW5DbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmlubGluZUNsYXNzTmFtZSA9IG9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5pbmxpbmVDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nID0gb3B0aW9ucy5pbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZyB8fCBmYWxzZTtcblx0XHR0aGlzLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUgPSBvcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmFmdGVyQ29udGVudENsYXNzTmFtZSA9IG9wdGlvbnMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5hZnRlckNvbnRlbnRDbGFzc05hbWUpIDogbnVsbDtcblx0XHR0aGlzLmFmdGVyID0gb3B0aW9ucy5hZnRlciA/IE1vZGVsRGVjb3JhdGlvbkluamVjdGVkVGV4dE9wdGlvbnMuZnJvbShvcHRpb25zLmFmdGVyKSA6IG51bGw7XG5cdFx0dGhpcy5iZWZvcmUgPSBvcHRpb25zLmJlZm9yZSA/IE1vZGVsRGVjb3JhdGlvbkluamVjdGVkVGV4dE9wdGlvbnMuZnJvbShvcHRpb25zLmJlZm9yZSkgOiBudWxsO1xuXHRcdHRoaXMuaGlkZUluQ29tbWVudFRva2VucyA9IG9wdGlvbnMuaGlkZUluQ29tbWVudFRva2VucyA/PyBmYWxzZTtcblx0XHR0aGlzLmhpZGVJblN0cmluZ1Rva2VucyA9IG9wdGlvbnMuaGlkZUluU3RyaW5nVG9rZW5zID8/IGZhbHNlO1xuXHRcdHRoaXMudGV4dERpcmVjdGlvbiA9IG9wdGlvbnMudGV4dERpcmVjdGlvbiA/PyBudWxsO1xuXHR9XG59XG5Nb2RlbERlY29yYXRpb25PcHRpb25zLkVNUFRZID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnZW1wdHknIH0pO1xuXG4vKipcbiAqIFRoZSBvcmRlciBjYXJlZnVsbHkgbWF0Y2hlcyB0aGUgdmFsdWVzIG9mIHRoZSBlbnVtLlxuICovXG5jb25zdCBUUkFDS0VEX1JBTkdFX09QVElPTlMgPSBbXG5cdE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ3RyYWNrZWQtcmFuZ2UtYWx3YXlzLWdyb3dzLXdoZW4tdHlwaW5nLWF0LWVkZ2VzJywgc3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzIH0pLFxuXHRNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHsgZGVzY3JpcHRpb246ICd0cmFja2VkLXJhbmdlLW5ldmVyLWdyb3dzLXdoZW4tdHlwaW5nLWF0LWVkZ2VzJywgc3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMgfSksXG5cdE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ3RyYWNrZWQtcmFuZ2UtZ3Jvd3Mtb25seS13aGVuLXR5cGluZy1iZWZvcmUnLCBzdGlja2luZXNzOiBtb2RlbC5UcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUgfSksXG5cdE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ3RyYWNrZWQtcmFuZ2UtZ3Jvd3Mtb25seS13aGVuLXR5cGluZy1hZnRlcicsIHN0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyIH0pLFxuXTtcblxuZnVuY3Rpb24gX25vcm1hbGl6ZU9wdGlvbnMob3B0aW9uczogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpOiBNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0aWYgKG9wdGlvbnMgaW5zdGFuY2VvZiBNb2RlbERlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblx0cmV0dXJuIE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyhvcHRpb25zKTtcbn1cblxuXG5jbGFzcyBEaWRDaGFuZ2VEZWNvcmF0aW9uc0VtaXR0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWw6IEVtaXR0ZXI8SU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgZXZlbnQ6IEV2ZW50PElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX2FjdHVhbC5ldmVudDtcblxuXHRwcml2YXRlIF9kZWZlcnJlZENudDogbnVtYmVyO1xuXHRwcml2YXRlIF9zaG91bGRGaXJlRGVmZXJyZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2FmZmVjdHNNaW5pbWFwOiBib29sZWFuO1xuXHRwcml2YXRlIF9hZmZlY3RzT3ZlcnZpZXdSdWxlcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lczogU2V0PG51bWJlcj4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfYWZmZWN0ZWRMaW5lSGVpZ2h0czogU2V0V2l0aEtleTxMaW5lSGVpZ2h0Q2hhbmdpbmdEZWNvcmF0aW9uPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9hZmZlY3RlZEZvbnRMaW5lczogU2V0V2l0aEtleTxMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfYWZmZWN0c0dseXBoTWFyZ2luOiBib29sZWFuO1xuXHRwcml2YXRlIF9hZmZlY3RzTGluZU51bWJlcjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGhhbmRsZUJlZm9yZUZpcmU6IChhZmZlY3RlZEluamVjdGVkVGV4dExpbmVzOiBTZXQ8bnVtYmVyPiB8IG51bGwsIGFmZmVjdGVkTGluZUhlaWdodHM6IFNldFdpdGhLZXk8TGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsLCBhZmZlY3RlZEZvbnRMaW5lczogU2V0V2l0aEtleTxMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kZWZlcnJlZENudCA9IDA7XG5cdFx0dGhpcy5fc2hvdWxkRmlyZURlZmVycmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fYWZmZWN0c01pbmltYXAgPSBmYWxzZTtcblx0XHR0aGlzLl9hZmZlY3RzT3ZlcnZpZXdSdWxlciA9IGZhbHNlO1xuXHRcdHRoaXMuX2FmZmVjdHNHbHlwaE1hcmdpbiA9IGZhbHNlO1xuXHRcdHRoaXMuX2FmZmVjdHNMaW5lTnVtYmVyID0gZmFsc2U7XG5cdH1cblxuXHRoYXNMaXN0ZW5lcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbC5oYXNMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHB1YmxpYyBiZWdpbkRlZmVycmVkRW1pdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZlcnJlZENudCsrO1xuXHR9XG5cblx0cHVibGljIGVuZERlZmVycmVkRW1pdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZlcnJlZENudC0tO1xuXHRcdGlmICh0aGlzLl9kZWZlcnJlZENudCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3VsZEZpcmVEZWZlcnJlZCkge1xuXHRcdFx0XHR0aGlzLmRvRmlyZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hZmZlY3RlZEluamVjdGVkVGV4dExpbmVzPy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcyA9IG51bGw7XG5cdFx0XHR0aGlzLl9hZmZlY3RlZExpbmVIZWlnaHRzPy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRMaW5lSGVpZ2h0cyA9IG51bGw7XG5cdFx0XHR0aGlzLl9hZmZlY3RlZEZvbnRMaW5lcz8uY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FmZmVjdGVkRm9udExpbmVzID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQobGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hZmZlY3RlZEluamVjdGVkVGV4dExpbmVzKSB7XG5cdFx0XHR0aGlzLl9hZmZlY3RlZEluamVjdGVkVGV4dExpbmVzID0gbmV3IFNldCgpO1xuXHRcdH1cblx0XHR0aGlzLl9hZmZlY3RlZEluamVjdGVkVGV4dExpbmVzLmFkZChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyByZWNvcmRMaW5lQWZmZWN0ZWRCeUxpbmVIZWlnaHRDaGFuZ2Uob3duZXJJZDogbnVtYmVyLCBkZWNvcmF0aW9uSWQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBsaW5lSGVpZ2h0OiBudW1iZXIgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hZmZlY3RlZExpbmVIZWlnaHRzKSB7XG5cdFx0XHR0aGlzLl9hZmZlY3RlZExpbmVIZWlnaHRzID0gbmV3IFNldFdpdGhLZXk8TGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbj4oW10sIExpbmVIZWlnaHRDaGFuZ2luZ0RlY29yYXRpb24udG9LZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9hZmZlY3RlZExpbmVIZWlnaHRzLmFkZChuZXcgTGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbihvd25lcklkLCBkZWNvcmF0aW9uSWQsIGxpbmVOdW1iZXIsIGxpbmVIZWlnaHQpKTtcblx0fVxuXG5cdHB1YmxpYyByZWNvcmRMaW5lQWZmZWN0ZWRCeUZvbnRDaGFuZ2Uob3duZXJJZDogbnVtYmVyLCBkZWNvcmF0aW9uSWQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hZmZlY3RlZEZvbnRMaW5lcykge1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRGb250TGluZXMgPSBuZXcgU2V0V2l0aEtleTxMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbj4oW10sIExpbmVGb250Q2hhbmdpbmdEZWNvcmF0aW9uLnRvS2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fYWZmZWN0ZWRGb250TGluZXMuYWRkKG5ldyBMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbihvd25lcklkLCBkZWNvcmF0aW9uSWQsIGxpbmVOdW1iZXIpKTtcblx0fVxuXG5cdHB1YmxpYyBjaGVja0FmZmVjdGVkQW5kRmlyZShvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fYWZmZWN0c01pbmltYXAgfHw9ICEhb3B0aW9ucy5taW5pbWFwPy5wb3NpdGlvbjtcblx0XHR0aGlzLl9hZmZlY3RzT3ZlcnZpZXdSdWxlciB8fD0gISFvcHRpb25zLm92ZXJ2aWV3UnVsZXI/LmNvbG9yO1xuXHRcdHRoaXMuX2FmZmVjdHNHbHlwaE1hcmdpbiB8fD0gISFvcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lO1xuXHRcdHRoaXMuX2FmZmVjdHNMaW5lTnVtYmVyIHx8PSAhIW9wdGlvbnMubGluZU51bWJlckNsYXNzTmFtZTtcblx0XHR0aGlzLnRyeUZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBmaXJlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FmZmVjdHNNaW5pbWFwID0gdHJ1ZTtcblx0XHR0aGlzLl9hZmZlY3RzT3ZlcnZpZXdSdWxlciA9IHRydWU7XG5cdFx0dGhpcy5fYWZmZWN0c0dseXBoTWFyZ2luID0gdHJ1ZTtcblx0XHR0aGlzLnRyeUZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgdHJ5RmlyZSgpIHtcblx0XHRpZiAodGhpcy5fZGVmZXJyZWRDbnQgPT09IDApIHtcblx0XHRcdHRoaXMuZG9GaXJlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3VsZEZpcmVEZWZlcnJlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb0ZpcmUoKSB7XG5cdFx0dGhpcy5oYW5kbGVCZWZvcmVGaXJlKHRoaXMuX2FmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMsIHRoaXMuX2FmZmVjdGVkTGluZUhlaWdodHMsIHRoaXMuX2FmZmVjdGVkRm9udExpbmVzKTtcblxuXHRcdGNvbnN0IGV2ZW50OiBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCA9IHtcblx0XHRcdGFmZmVjdHNNaW5pbWFwOiB0aGlzLl9hZmZlY3RzTWluaW1hcCxcblx0XHRcdGFmZmVjdHNPdmVydmlld1J1bGVyOiB0aGlzLl9hZmZlY3RzT3ZlcnZpZXdSdWxlcixcblx0XHRcdGFmZmVjdHNHbHlwaE1hcmdpbjogdGhpcy5fYWZmZWN0c0dseXBoTWFyZ2luLFxuXHRcdFx0YWZmZWN0c0xpbmVOdW1iZXI6IHRoaXMuX2FmZmVjdHNMaW5lTnVtYmVyLFxuXHRcdH07XG5cdFx0dGhpcy5fc2hvdWxkRmlyZURlZmVycmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fYWZmZWN0c01pbmltYXAgPSBmYWxzZTtcblx0XHR0aGlzLl9hZmZlY3RzT3ZlcnZpZXdSdWxlciA9IGZhbHNlO1xuXHRcdHRoaXMuX2FmZmVjdHNHbHlwaE1hcmdpbiA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdHVhbC5maXJlKGV2ZW50KTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuY2xhc3MgRGlkQ2hhbmdlQ29udGVudEVtaXR0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbWl0dGVyOiBFbWl0dGVyPEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBldmVudDogRXZlbnQ8SW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudD4gPSB0aGlzLl9lbWl0dGVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX2RlZmVycmVkQ250OiBudW1iZXI7XG5cdHByaXZhdGUgX2RlZmVycmVkRXZlbnQ6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQgPSAwO1xuXHRcdHRoaXMuX2RlZmVycmVkRXZlbnQgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIGhhc0xpc3RlbmVycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW1pdHRlci5oYXNMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHB1YmxpYyBiZWdpbkRlZmVycmVkRW1pdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZlcnJlZENudCsrO1xuXHR9XG5cblx0cHVibGljIGVuZERlZmVycmVkRW1pdChyZXN1bHRpbmdTZWxlY3Rpb246IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWZlcnJlZENudC0tO1xuXHRcdGlmICh0aGlzLl9kZWZlcnJlZENudCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX2RlZmVycmVkRXZlbnQgIT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fZGVmZXJyZWRFdmVudC5yYXdDb250ZW50Q2hhbmdlZEV2ZW50LnJlc3VsdGluZ1NlbGVjdGlvbiA9IHJlc3VsdGluZ1NlbGVjdGlvbjtcblx0XHRcdFx0Y29uc3QgZSA9IHRoaXMuX2RlZmVycmVkRXZlbnQ7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkRXZlbnQgPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9lbWl0dGVyLmZpcmUoZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZpcmUoZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWZlcnJlZENudCA+IDApIHtcblx0XHRcdGlmICh0aGlzLl9kZWZlcnJlZEV2ZW50KSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkRXZlbnQgPSB0aGlzLl9kZWZlcnJlZEV2ZW50Lm1lcmdlKGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGVmZXJyZWRFdmVudCA9IGU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXR0ZXIuZmlyZShlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtB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QUNiLE9BQU87QUFDTixXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUFBLEVBRVEsU0FBUztBQUNoQixTQUFLLGlCQUFpQixLQUFLLDRCQUE0QixLQUFLLHNCQUFzQixLQUFLLGtCQUFrQjtBQUV6RyxVQUFNLFFBQXVDO0FBQUEsTUFDNUMsZ0JBQWdCLEtBQUs7QUFBQSxNQUNyQixzQkFBc0IsS0FBSztBQUFBLE1BQzNCLG9CQUFvQixLQUFLO0FBQUEsTUFDekIsbUJBQW1CLEtBQUs7QUFBQSxJQUN6QjtBQUNBLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssUUFBUSxLQUFLLEtBQUs7QUFBQSxFQUN4QjtBQUNEO0FBSUEsTUFBTSxnQ0FBZ0MsV0FBVztBQUFBLEVBUWhELGNBQWM7QUFDYixVQUFNO0FBUFAsU0FBaUIsV0FBcUQsS0FBSyxVQUFVLElBQUksUUFBeUMsQ0FBQztBQUNuSSxTQUFnQixRQUFnRCxLQUFLLFNBQVM7QUFPN0UsU0FBSyxlQUFlO0FBQ3BCLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVPLGVBQXdCO0FBQzlCLFdBQU8sS0FBSyxTQUFTLGFBQWE7QUFBQSxFQUNuQztBQUFBLEVBRU8sb0JBQTBCO0FBQ2hDLFNBQUs7QUFBQSxFQUNOO0FBQUEsRUFFTyxnQkFBZ0IscUJBQXlDLE1BQVk7QUFDM0UsU0FBSztBQUNMLFFBQUksS0FBSyxpQkFBaUIsR0FBRztBQUM1QixVQUFJLEtBQUssbUJBQW1CLE1BQU07QUFDakMsYUFBSyxlQUFlLHVCQUF1QixxQkFBcUI7QUFDaEUsY0FBTSxJQUFJLEtBQUs7QUFDZixhQUFLLGlCQUFpQjtBQUN0QixhQUFLLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sS0FBSyxHQUEwQztBQUNyRCxRQUFJLEtBQUssZUFBZSxHQUFHO0FBQzFCLFVBQUksS0FBSyxnQkFBZ0I7QUFDeEIsYUFBSyxpQkFBaUIsS0FBSyxlQUFlLE1BQU0sQ0FBQztBQUFBLE1BQ2xELE9BQU87QUFDTixhQUFLLGlCQUFpQjtBQUFBLE1BQ3ZCO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsU0FBSyxTQUFTLEtBQUssQ0FBQztBQUFBLEVBQ3JCO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlIiwgInRva2VucyJdCn0K
