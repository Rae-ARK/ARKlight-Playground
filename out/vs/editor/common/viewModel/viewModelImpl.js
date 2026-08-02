import { ArrayQueue } from "../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { Color } from "../../../base/common/color.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as platform from "../../../base/common/platform.js";
import * as strings from "../../../base/common/strings.js";
import { EditorOption, filterValidationDecorations, filterFontDecorations } from "../config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../config/fontInfo.js";
import { CursorsController } from "../cursor/cursor.js";
import { CursorConfiguration } from "../cursorCommon.js";
import { CursorChangeReason } from "../cursorEvents.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { ScrollType } from "../editorCommon.js";
import { EndOfLinePreference, TextDirection, TrackedRangeStickiness } from "../model.js";
import * as textModelEvents from "../textModelEvents.js";
import { TokenizationRegistry } from "../languages.js";
import { ColorId } from "../encodedTokenAttributes.js";
import { PLAINTEXT_LANGUAGE_ID } from "../languages/modesRegistry.js";
import { tokenizeLineToHTML } from "../languages/textToHtmlTokenizer.js";
import * as viewEvents from "../viewEvents.js";
import { ViewLayout } from "../viewLayout/viewLayout.js";
import { MinimapTokensColorTracker } from "./minimapTokensColorTracker.js";
import { MinimapLinesRenderingData, OverviewRulerDecorationsGroup, ViewLineRenderingData } from "../viewModel.js";
import { ViewModelDecorations } from "./viewModelDecorations.js";
import { FocusChangedEvent, HiddenAreasChangedEvent, ModelContentChangedEvent, ModelDecorationsChangedEvent, ModelFontChangedEvent, ModelLanguageChangedEvent, ModelLanguageConfigurationChangedEvent, ModelLineHeightChangedEvent, ModelOptionsChangedEvent, ModelTokensChangedEvent, ReadOnlyEditAttemptEvent, ScrollChangedEvent, ViewModelEventDispatcher, ViewZonesChangedEvent, WidgetFocusChangedEvent } from "../viewModelEventDispatcher.js";
import { ViewModelLinesFromModelAsIs, ViewModelLinesFromProjectedModel } from "./viewModelLines.js";
import { GlyphMarginLanesModel } from "./glyphLanesModel.js";
import { CustomLineHeightData } from "../viewLayout/lineHeights.js";
const USE_IDENTITY_LINES_COLLECTION = true;
class ViewModel extends Disposable {
  constructor(editorId, configuration, model, domLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, scheduleAtNextAnimationFrame, languageConfigurationService, _themeService, _attachedView, _transactionalTarget) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    this._themeService = _themeService;
    this._attachedView = _attachedView;
    this._transactionalTarget = _transactionalTarget;
    this.hiddenAreasModel = new HiddenAreasModel();
    this.previousHiddenAreas = [];
    this._editorId = editorId;
    this._configuration = configuration;
    this.model = model;
    this._eventDispatcher = new ViewModelEventDispatcher();
    this.onEvent = this._eventDispatcher.onEvent;
    this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
    this._updateConfigurationViewLineCount = this._register(new RunOnceScheduler(() => this._updateConfigurationViewLineCountNow(), 0));
    this._hasFocus = false;
    this._viewportStart = ViewportStart.create(this.model);
    this.glyphLanes = new GlyphMarginLanesModel(0);
    if (USE_IDENTITY_LINES_COLLECTION && this.model.isTooLargeForTokenization()) {
      this._lines = new ViewModelLinesFromModelAsIs(this.model);
    } else {
      const options = this._configuration.options;
      const fontInfo = options.get(EditorOption.fontInfo);
      const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
      const wrappingInfo = options.get(EditorOption.wrappingInfo);
      const wrappingIndent = options.get(EditorOption.wrappingIndent);
      const wordBreak = options.get(EditorOption.wordBreak);
      const wrapOnEscapedLineFeeds = options.get(EditorOption.wrapOnEscapedLineFeeds);
      this._lines = new ViewModelLinesFromProjectedModel(
        this._editorId,
        this.model,
        domLineBreaksComputerFactory,
        monospaceLineBreaksComputerFactory,
        fontInfo,
        this.model.getOptions().tabSize,
        wrappingStrategy,
        wrappingInfo.wrappingColumn,
        wrappingIndent,
        wordBreak,
        wrapOnEscapedLineFeeds
      );
    }
    this.coordinatesConverter = this._lines.createCoordinatesConverter();
    this._cursor = this._register(new CursorsController(model, this, this.coordinatesConverter, this.cursorConfig));
    this.viewLayout = this._register(new ViewLayout(this._configuration, this.getLineCount(), this._getCustomLineHeights(), scheduleAtNextAnimationFrame));
    this._register(this.viewLayout.onDidScroll((e) => {
      if (e.scrollTopChanged) {
        this._handleVisibleLinesChanged();
      }
      if (e.scrollTopChanged) {
        this._viewportStart.invalidate();
      }
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewScrollChangedEvent(e));
      this._eventDispatcher.emitOutgoingEvent(new ScrollChangedEvent(
        e.oldScrollWidth,
        e.oldScrollLeft,
        e.oldScrollHeight,
        e.oldScrollTop,
        e.scrollWidth,
        e.scrollLeft,
        e.scrollHeight,
        e.scrollTop
      ));
    }));
    this._register(this.viewLayout.onDidContentSizeChange((e) => {
      this._eventDispatcher.emitOutgoingEvent(e);
    }));
    this._decorations = new ViewModelDecorations(this._editorId, this.model, this._configuration, this._lines, this.coordinatesConverter);
    this._registerModelEvents();
    this._register(this._configuration.onDidChangeFast((e) => {
      try {
        const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
        this._onConfigurationChanged(eventsCollector, e);
      } finally {
        this._eventDispatcher.endEmitViewEvents();
      }
    }));
    this._register(MinimapTokensColorTracker.getInstance().onDidChange(() => {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensColorsChangedEvent());
    }));
    this._register(this._themeService.onDidColorThemeChange((theme) => {
      this._invalidateDecorationsColorCache();
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewThemeChangedEvent(theme));
    }));
    this._updateConfigurationViewLineCountNow();
    this.model.registerViewModel(this);
  }
  dispose() {
    super.dispose();
    this._decorations.dispose();
    this._lines.dispose();
    this._viewportStart.dispose();
    this._eventDispatcher.dispose();
    this.model.unregisterViewModel(this);
  }
  getEditorOption(id) {
    return this._configuration.options.get(id);
  }
  createLineBreaksComputer(context) {
    return this._lines.createLineBreaksComputer(context);
  }
  addViewEventHandler(eventHandler) {
    this._eventDispatcher.addViewEventHandler(eventHandler);
  }
  removeViewEventHandler(eventHandler) {
    this._eventDispatcher.removeViewEventHandler(eventHandler);
  }
  _getCustomLineHeights() {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (!allowVariableLineHeights) {
      return [];
    }
    const decorations = this.model.getCustomLineHeightsDecorations(this._editorId);
    return CustomLineHeightData.fromDecorations(decorations, this.coordinatesConverter, this._configuration);
  }
  _getCustomLineHeightsForLines(fromLineNumber, toLineNumber) {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (!allowVariableLineHeights) {
      return [];
    }
    const modelRange = new Range(fromLineNumber, 1, toLineNumber, this.model.getLineMaxColumn(toLineNumber));
    const decorations = this.model.getCustomLineHeightsDecorationsInRange(modelRange, this._editorId);
    return CustomLineHeightData.fromDecorations(decorations, this.coordinatesConverter, this._configuration);
  }
  _updateConfigurationViewLineCountNow() {
    this._configuration.setViewLineCount(this._lines.getViewLineCount());
  }
  getModelVisibleRanges() {
    const linesViewportData = this.viewLayout.getLinesViewportData();
    const viewVisibleRange = new Range(
      linesViewportData.startLineNumber,
      this.getLineMinColumn(linesViewportData.startLineNumber),
      linesViewportData.endLineNumber,
      this.getLineMaxColumn(linesViewportData.endLineNumber)
    );
    const modelVisibleRanges = this._toModelVisibleRanges(viewVisibleRange);
    return modelVisibleRanges;
  }
  visibleLinesStabilized() {
    const modelVisibleRanges = this.getModelVisibleRanges();
    this._attachedView.setVisibleLines(modelVisibleRanges, true);
  }
  _handleVisibleLinesChanged() {
    const modelVisibleRanges = this.getModelVisibleRanges();
    this._attachedView.setVisibleLines(modelVisibleRanges, false);
  }
  setHasFocus(hasFocus) {
    this._hasFocus = hasFocus;
    this._cursor.setHasFocus(hasFocus);
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewFocusChangedEvent(hasFocus));
    this._eventDispatcher.emitOutgoingEvent(new FocusChangedEvent(!hasFocus, hasFocus));
  }
  setHasWidgetFocus(hasWidgetFocus) {
    this._eventDispatcher.emitOutgoingEvent(new WidgetFocusChangedEvent(!hasWidgetFocus, hasWidgetFocus));
  }
  onCompositionStart() {
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionStartEvent());
  }
  onCompositionEnd() {
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionEndEvent());
  }
  _captureStableViewport() {
    if (this._viewportStart.isValid && this.viewLayout.getCurrentScrollTop() > 0) {
      const previousViewportStartViewPosition = new Position(this._viewportStart.viewLineNumber, this.getLineMinColumn(this._viewportStart.viewLineNumber));
      const previousViewportStartModelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(previousViewportStartViewPosition);
      return new StableViewport(previousViewportStartModelPosition, this._viewportStart.startLineDelta);
    }
    return new StableViewport(null, 0);
  }
  _onConfigurationChanged(eventsCollector, e) {
    const stableViewport = this._captureStableViewport();
    const options = this._configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    const wrappingIndent = options.get(EditorOption.wrappingIndent);
    const wordBreak = options.get(EditorOption.wordBreak);
    if (this._lines.setWrappingSettings(fontInfo, wrappingStrategy, wrappingInfo.wrappingColumn, wrappingIndent, wordBreak)) {
      eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
      eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
      this._cursor.onLineMappingChanged(eventsCollector);
      this._decorations.onLineMappingChanged();
      this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
      this._updateConfigurationViewLineCount.schedule();
    }
    if (e.hasChanged(EditorOption.readOnly)) {
      this._decorations.reset();
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
    }
    if (e.hasChanged(EditorOption.renderValidationDecorations)) {
      this._decorations.reset();
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
    }
    eventsCollector.emitViewEvent(new viewEvents.ViewConfigurationChangedEvent(e));
    this.viewLayout.onConfigurationChanged(e);
    stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);
    if (CursorConfiguration.shouldRecreate(e)) {
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
    }
  }
  /**
   * Gets called directly by the text model.
   */
  onDidChangeContentOrInjectedText(e) {
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      let hadOtherModelChange = false;
      let hadModelLineChangeThatChangedLineMapping = false;
      const changes = e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes;
      const versionId = e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.versionId : null;
      const lineBreaksComputer = this._lines.createLineBreaksComputer();
      for (const change of changes) {
        switch (change.changeType) {
          case textModelEvents.RawContentChangedType.LinesInserted: {
            for (let i = 0; i < change.count; i++) {
              lineBreaksComputer.addRequest(change.fromLineNumberPostEdit + i, null);
            }
            break;
          }
          case textModelEvents.RawContentChangedType.LineChanged: {
            lineBreaksComputer.addRequest(change.lineNumberPostEdit, null);
            break;
          }
        }
      }
      const lineBreaks = lineBreaksComputer.finalize();
      const lineBreakQueue = new ArrayQueue(lineBreaks);
      const customLineHeightRangesToInsert = [];
      for (const change of changes) {
        switch (change.changeType) {
          case textModelEvents.RawContentChangedType.Flush: {
            this._lines.onModelFlushed();
            eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
            this._decorations.reset();
            this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LinesDeleted: {
            const linesDeletedEvent = this._lines.onModelLinesDeleted(versionId, change.fromLineNumber, change.toLineNumber);
            if (linesDeletedEvent !== null) {
              eventsCollector.emitViewEvent(linesDeletedEvent);
              this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lastUntouchedLinePostEdit, toLineNumber: change.lastUntouchedLinePostEdit });
            }
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LinesInserted: {
            const insertedLineBreaks = lineBreakQueue.takeCount(change.count);
            const linesInsertedEvent = this._lines.onModelLinesInserted(versionId, change.fromLineNumber, change.toLineNumber, insertedLineBreaks);
            if (linesInsertedEvent !== null) {
              eventsCollector.emitViewEvent(linesInsertedEvent);
              this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.fromLineNumberPostEdit, toLineNumber: change.toLineNumberPostEdit });
            }
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LineChanged: {
            const changedLineBreakData = lineBreakQueue.dequeue();
            const [lineMappingChanged, linesChangedEvent, linesInsertedEvent, linesDeletedEvent] = this._lines.onModelLineChanged(versionId, change.lineNumber, changedLineBreakData);
            hadModelLineChangeThatChangedLineMapping = lineMappingChanged;
            if (linesChangedEvent) {
              eventsCollector.emitViewEvent(linesChangedEvent);
            }
            if (linesInsertedEvent) {
              eventsCollector.emitViewEvent(linesInsertedEvent);
              this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lineNumberPostEdit, toLineNumber: change.lineNumberPostEdit });
            }
            if (linesDeletedEvent) {
              eventsCollector.emitViewEvent(linesDeletedEvent);
              this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lineNumberPostEdit, toLineNumber: change.lineNumberPostEdit });
            }
            break;
          }
          case textModelEvents.RawContentChangedType.EOLChanged: {
            break;
          }
        }
      }
      if (versionId !== null) {
        this._lines.acceptVersionId(versionId);
      }
      if (customLineHeightRangesToInsert.length > 0) {
        this.viewLayout.changeSpecialLineHeights((accessor) => {
          for (const range of customLineHeightRangesToInsert) {
            const customLineHeights = this._getCustomLineHeightsForLines(range.fromLineNumber, range.toLineNumber);
            for (const data of customLineHeights) {
              accessor.insertOrChangeCustomLineHeight(data.decorationId, data.startLineNumber, data.endLineNumber, data.lineHeight);
            }
          }
        });
      }
      this.viewLayout.onHeightMaybeChanged();
      if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
        eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
        this._cursor.onLineMappingChanged(eventsCollector);
        this._decorations.onLineMappingChanged();
      }
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
    const viewportStartWasValid = this._viewportStart.isValid;
    this._viewportStart.invalidate();
    this._configuration.setModelLineCount(this.model.getLineCount());
    this._updateConfigurationViewLineCountNow();
    if (!this._hasFocus && this.model.getAttachedEditorCount() >= 2 && viewportStartWasValid) {
      const modelRange = this.model._getTrackedRange(this._viewportStart.modelTrackedRange);
      if (modelRange) {
        const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelRange.getStartPosition());
        const viewPositionTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
        this.viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this._viewportStart.startLineDelta }, ScrollType.Immediate);
      }
    }
    this._handleVisibleLinesChanged();
  }
  /**
   * Gets called directly by the text model.
   */
  emitContentChangeEvent(e) {
    this._emitViewEvent((eventsCollector) => {
      if (e instanceof textModelEvents.InternalModelContentChangeEvent) {
        eventsCollector.emitOutgoingEvent(new ModelContentChangedEvent(e.contentChangedEvent));
      }
      this._cursor.onModelContentChanged(eventsCollector, e);
    });
  }
  _registerModelEvents() {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (allowVariableLineHeights) {
      this._register(this.model.onDidChangeLineHeight((e) => {
        const filteredChanges = e.changes.filter((change) => change.ownerId === this._editorId || change.ownerId === 0);
        this.viewLayout.changeSpecialLineHeights((accessor) => {
          for (const change of filteredChanges) {
            const { decorationId, lineNumber, lineHeightMultiplier } = change;
            const viewRange = this.coordinatesConverter.convertModelRangeToViewRange(new Range(lineNumber, 1, lineNumber, this.model.getLineMaxColumn(lineNumber)));
            if (lineHeightMultiplier !== null) {
              accessor.insertOrChangeCustomLineHeight(decorationId, viewRange.startLineNumber, viewRange.endLineNumber, lineHeightMultiplier * this._configuration.options.get(EditorOption.lineHeight));
            } else {
              accessor.removeCustomLineHeight(decorationId);
            }
          }
        });
        if (filteredChanges.length > 0) {
          const filteredEvent = new textModelEvents.ModelLineHeightChangedEvent(filteredChanges);
          this._eventDispatcher.emitOutgoingEvent(new ModelLineHeightChangedEvent(filteredEvent));
        }
      }));
    }
    const allowVariableFonts = this._configuration.options.get(EditorOption.effectiveAllowVariableFonts);
    if (allowVariableFonts) {
      this._register(this.model.onDidChangeFont((e) => {
        const filteredChanges = e.changes.filter((change) => change.ownerId === this._editorId || change.ownerId === 0);
        if (filteredChanges.length > 0) {
          const filteredEvent = new textModelEvents.ModelFontChangedEvent(filteredChanges);
          this._eventDispatcher.emitOutgoingEvent(new ModelFontChangedEvent(filteredEvent));
        }
      }));
    }
    this._register(this.model.onDidChangeTokens((e) => {
      const viewRanges = [];
      for (let j = 0, lenJ = e.ranges.length; j < lenJ; j++) {
        const modelRange = e.ranges[j];
        const viewStartLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.fromLineNumber, 1)).lineNumber;
        const viewEndLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber))).lineNumber;
        viewRanges[j] = {
          fromLineNumber: viewStartLineNumber,
          toLineNumber: viewEndLineNumber
        };
      }
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensChangedEvent(viewRanges));
      this._eventDispatcher.emitOutgoingEvent(new ModelTokensChangedEvent(e));
    }));
    this._register(this.model.onDidChangeLanguageConfiguration((e) => {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewLanguageConfigurationEvent());
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelLanguageConfigurationChangedEvent(e));
    }));
    this._register(this.model.onDidChangeLanguage((e) => {
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelLanguageChangedEvent(e));
    }));
    this._register(this.model.onDidChangeOptions((e) => {
      if (this._lines.setTabSize(this.model.getOptions().tabSize)) {
        try {
          const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
          eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
          eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
          eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
          this._cursor.onLineMappingChanged(eventsCollector);
          this._decorations.onLineMappingChanged();
          this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
        } finally {
          this._eventDispatcher.endEmitViewEvents();
        }
        this._updateConfigurationViewLineCount.schedule();
      }
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelOptionsChangedEvent(e));
    }));
    this._register(this.model.onDidChangeDecorations((e) => {
      this._decorations.onModelDecorationsChanged();
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewDecorationsChangedEvent(e));
      this._eventDispatcher.emitOutgoingEvent(new ModelDecorationsChangedEvent(e));
    }));
  }
  getFontSizeAtPosition(position) {
    const allowVariableFonts = this._configuration.options.get(EditorOption.effectiveAllowVariableFonts);
    if (!allowVariableFonts) {
      return null;
    }
    const fontDecorations = this.model.getFontDecorationsInRange(Range.fromPositions(position), this._editorId);
    let fontSize = this._configuration.options.get(EditorOption.fontInfo).fontSize + "px";
    for (const fontDecoration of fontDecorations) {
      if (fontDecoration.options.fontSize) {
        fontSize = fontDecoration.options.fontSize;
        break;
      }
    }
    return fontSize;
  }
  /**
   * @param forceUpdate If true, the hidden areas will be updated even if the new ranges are the same as the previous ranges.
   * This is because the model might have changed, which resets the hidden areas, but not the last cached value.
   * This needs a better fix in the future.
  */
  setHiddenAreas(ranges, source, forceUpdate) {
    this.hiddenAreasModel.setHiddenAreas(source, ranges);
    const mergedRanges = this.hiddenAreasModel.getMergedRanges();
    if (mergedRanges === this.previousHiddenAreas && !forceUpdate) {
      return;
    }
    this.previousHiddenAreas = mergedRanges;
    const stableViewport = this._captureStableViewport();
    let lineMappingChanged = false;
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      lineMappingChanged = this._lines.setHiddenAreas(mergedRanges);
      if (lineMappingChanged) {
        eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
        this._cursor.onLineMappingChanged(eventsCollector);
        this._decorations.onLineMappingChanged();
        this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
        this.viewLayout.onHeightMaybeChanged();
      }
      const firstModelLineInViewPort = stableViewport.viewportStartModelPosition?.lineNumber;
      const firstModelLineIsHidden = firstModelLineInViewPort && mergedRanges.some((range) => range.startLineNumber <= firstModelLineInViewPort && firstModelLineInViewPort <= range.endLineNumber);
      if (!firstModelLineIsHidden) {
        stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);
      }
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
    this._updateConfigurationViewLineCount.schedule();
    if (lineMappingChanged) {
      this._eventDispatcher.emitOutgoingEvent(new HiddenAreasChangedEvent());
    }
  }
  getVisibleRangesPlusViewportAboveBelow() {
    const layoutInfo = this._configuration.options.get(EditorOption.layoutInfo);
    const lineHeight = this._configuration.options.get(EditorOption.lineHeight);
    const linesAround = Math.max(20, Math.round(layoutInfo.height / lineHeight));
    const partialData = this.viewLayout.getLinesViewportData();
    const startViewLineNumber = Math.max(1, partialData.completelyVisibleStartLineNumber - linesAround);
    const endViewLineNumber = Math.min(this.getLineCount(), partialData.completelyVisibleEndLineNumber + linesAround);
    return this._toModelVisibleRanges(new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    ));
  }
  getVisibleRanges() {
    const visibleViewRange = this.getCompletelyVisibleViewRange();
    return this._toModelVisibleRanges(visibleViewRange);
  }
  getHiddenAreas() {
    return this._lines.getHiddenAreas();
  }
  _toModelVisibleRanges(visibleViewRange) {
    const visibleRange = this.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
    const hiddenAreas = this._lines.getHiddenAreas();
    if (hiddenAreas.length === 0) {
      return [visibleRange];
    }
    const result = [];
    let resultLen = 0;
    let startLineNumber = visibleRange.startLineNumber;
    let startColumn = visibleRange.startColumn;
    const endLineNumber = visibleRange.endLineNumber;
    const endColumn = visibleRange.endColumn;
    for (let i = 0, len = hiddenAreas.length; i < len; i++) {
      const hiddenStartLineNumber = hiddenAreas[i].startLineNumber;
      const hiddenEndLineNumber = hiddenAreas[i].endLineNumber;
      if (hiddenEndLineNumber < startLineNumber) {
        continue;
      }
      if (hiddenStartLineNumber > endLineNumber) {
        continue;
      }
      if (startLineNumber < hiddenStartLineNumber) {
        result[resultLen++] = new Range(
          startLineNumber,
          startColumn,
          hiddenStartLineNumber - 1,
          this.model.getLineMaxColumn(hiddenStartLineNumber - 1)
        );
      }
      startLineNumber = hiddenEndLineNumber + 1;
      startColumn = 1;
    }
    if (startLineNumber < endLineNumber || startLineNumber === endLineNumber && startColumn < endColumn) {
      result[resultLen++] = new Range(
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      );
    }
    return result;
  }
  getCompletelyVisibleViewRange() {
    const partialData = this.viewLayout.getLinesViewportData();
    const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
    const endViewLineNumber = partialData.completelyVisibleEndLineNumber;
    return new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    );
  }
  getCompletelyVisibleViewRangeAtScrollTop(scrollTop) {
    const partialData = this.viewLayout.getLinesViewportDataAtScrollTop(scrollTop);
    const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
    const endViewLineNumber = partialData.completelyVisibleEndLineNumber;
    return new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    );
  }
  /**
   * Applies `cursorSurroundingLines` and `stickyScroll` padding to the given view range.
   */
  getViewRangeWithCursorPadding(viewRange) {
    const options = this._configuration.options;
    const cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    const stickyScroll = options.get(EditorOption.stickyScroll);
    let { startLineNumber, endLineNumber } = viewRange;
    const padding = Math.min(
      Math.max(cursorSurroundingLines, stickyScroll.enabled ? stickyScroll.maxLineCount : 0),
      Math.floor((endLineNumber - startLineNumber + 1) / 2)
    );
    startLineNumber += padding;
    endLineNumber -= Math.max(0, padding - 1);
    if (padding === 0 || startLineNumber > endLineNumber) {
      return viewRange;
    }
    return new Range(
      startLineNumber,
      this.getLineMinColumn(startLineNumber),
      endLineNumber,
      this.getLineMaxColumn(endLineNumber)
    );
  }
  saveState() {
    const compatViewState = this.viewLayout.saveState();
    const scrollTop = compatViewState.scrollTop;
    const firstViewLineNumber = this.viewLayout.getLineNumberAtVerticalOffset(scrollTop);
    const firstPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(firstViewLineNumber, this.getLineMinColumn(firstViewLineNumber)));
    const firstPositionDeltaTop = this.viewLayout.getVerticalOffsetForLineNumber(firstViewLineNumber) - scrollTop;
    return {
      scrollLeft: compatViewState.scrollLeft,
      firstPosition,
      firstPositionDeltaTop
    };
  }
  reduceRestoreState(state) {
    if (typeof state.firstPosition === "undefined") {
      return this._reduceRestoreStateCompatibility(state);
    }
    const modelPosition = this.model.validatePosition(state.firstPosition);
    const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    const scrollTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber) - state.firstPositionDeltaTop;
    return {
      scrollLeft: state.scrollLeft,
      scrollTop
    };
  }
  _reduceRestoreStateCompatibility(state) {
    return {
      scrollLeft: state.scrollLeft,
      scrollTop: state.scrollTopWithoutViewZones
    };
  }
  getTabSize() {
    return this.model.getOptions().tabSize;
  }
  getLineCount() {
    return this._lines.getViewLineCount();
  }
  /**
   * Gives a hint that a lot of requests are about to come in for these line numbers.
   */
  setViewport(startLineNumber, endLineNumber, centeredLineNumber) {
    this._viewportStart.update(this, startLineNumber);
  }
  getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
    return this._lines.getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber);
  }
  getLinesIndentGuides(startLineNumber, endLineNumber) {
    return this._lines.getViewLinesIndentGuides(startLineNumber, endLineNumber);
  }
  getBracketGuidesInRangeByLine(startLineNumber, endLineNumber, activePosition, options) {
    return this._lines.getViewLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options);
  }
  getLineContent(lineNumber) {
    return this._lines.getViewLineContent(lineNumber);
  }
  getLineLength(lineNumber) {
    return this._lines.getViewLineLength(lineNumber);
  }
  getLineMinColumn(lineNumber) {
    return this._lines.getViewLineMinColumn(lineNumber);
  }
  getLineMaxColumn(lineNumber) {
    return this._lines.getViewLineMaxColumn(lineNumber);
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 1;
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 2;
  }
  getMinimapDecorationsInRange(range) {
    return this._decorations.getMinimapDecorationsInRange(range);
  }
  getDecorationsInViewport(visibleRange) {
    return this._decorations.getDecorationsViewportData(visibleRange).decorations;
  }
  getInjectedTextAt(viewPosition) {
    return this._lines.getInjectedTextAt(viewPosition);
  }
  _getTextDirection(lineNumber, decorations) {
    let rtlCount = 0;
    for (const decoration of decorations) {
      const range = decoration.range;
      if (range.startLineNumber > lineNumber || range.endLineNumber < lineNumber) {
        continue;
      }
      const textDirection = decoration.options.textDirection;
      if (textDirection === TextDirection.RTL) {
        rtlCount++;
      } else if (textDirection === TextDirection.LTR) {
        rtlCount--;
      }
    }
    return rtlCount > 0 ? TextDirection.RTL : TextDirection.LTR;
  }
  getTextDirection(lineNumber) {
    const decorationsCollection = this._decorations.getDecorationsOnLine(lineNumber);
    return this._getTextDirection(lineNumber, decorationsCollection.decorations);
  }
  getViewportViewLineRenderingData(visibleRange, lineNumber) {
    const viewportDecorationsCollection = this._decorations.getDecorationsViewportData(visibleRange);
    const relativeLineNumber = lineNumber - visibleRange.startLineNumber;
    const inlineDecorations = viewportDecorationsCollection.inlineDecorations[relativeLineNumber];
    const hasVariableFonts = viewportDecorationsCollection.hasVariableFonts[relativeLineNumber];
    return this._getViewLineRenderingData(lineNumber, inlineDecorations, hasVariableFonts, viewportDecorationsCollection.decorations);
  }
  getViewLineRenderingData(lineNumber) {
    const decorationsCollection = this._decorations.getDecorationsOnLine(lineNumber);
    return this._getViewLineRenderingData(lineNumber, decorationsCollection.inlineDecorations[0], decorationsCollection.hasVariableFonts[0], decorationsCollection.decorations);
  }
  _getViewLineRenderingData(lineNumber, inlineDecorations, hasVariableFonts, decorations) {
    const mightContainRTL = this.model.mightContainRTL();
    const mightContainNonBasicASCII = this.model.mightContainNonBasicASCII();
    const tabSize = this.getTabSize();
    const lineData = this._lines.getViewLineData(lineNumber);
    if (lineData.inlineDecorations) {
      inlineDecorations = [
        ...inlineDecorations,
        ...lineData.inlineDecorations
      ];
    }
    return new ViewLineRenderingData(
      lineData.minColumn,
      lineData.maxColumn,
      lineData.content,
      lineData.continuesWithWrappedLine,
      mightContainRTL,
      mightContainNonBasicASCII,
      lineData.tokens,
      inlineDecorations,
      tabSize,
      lineData.startVisibleColumn,
      this._getTextDirection(lineNumber, decorations),
      hasVariableFonts
    );
  }
  getViewLineData(lineNumber) {
    return this._lines.getViewLineData(lineNumber);
  }
  getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed) {
    const result = this._lines.getViewLinesData(startLineNumber, endLineNumber, needed);
    return new MinimapLinesRenderingData(
      this.getTabSize(),
      result
    );
  }
  getAllOverviewRulerDecorations(theme) {
    const decorations = this.model.getOverviewRulerDecorations(this._editorId, filterValidationDecorations(this._configuration.options), filterFontDecorations(this._configuration.options));
    const result = new OverviewRulerDecorations();
    for (const decoration of decorations) {
      const decorationOptions = decoration.options;
      const opts = decorationOptions.overviewRuler;
      if (!opts) {
        continue;
      }
      const lane = opts.position;
      if (lane === 0) {
        continue;
      }
      const color = opts.getColor(theme.value);
      const viewStartLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.startLineNumber, decoration.range.startColumn);
      const viewEndLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.endLineNumber, decoration.range.endColumn);
      result.accept(color, decorationOptions.zIndex, viewStartLineNumber, viewEndLineNumber, lane);
    }
    return result.asArray;
  }
  _invalidateDecorationsColorCache() {
    const decorations = this.model.getOverviewRulerDecorations();
    for (const decoration of decorations) {
      const opts1 = decoration.options.overviewRuler;
      opts1?.invalidateCachedColor();
      const opts2 = decoration.options.minimap;
      opts2?.invalidateCachedColor();
    }
  }
  getValueInRange(range, eol) {
    const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
    return this.model.getValueInRange(modelRange, eol);
  }
  getValueLengthInRange(range, eol) {
    const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
    return this.model.getValueLengthInRange(modelRange, eol);
  }
  modifyPosition(position, offset) {
    const modelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(position);
    const resultModelPosition = this.model.modifyPosition(modelPosition, offset);
    return this.coordinatesConverter.convertModelPositionToViewPosition(resultModelPosition);
  }
  deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt) {
    const modelAnchor = this.coordinatesConverter.convertViewPositionToModelPosition(viewAnchorPosition);
    if (this.model.getEOL().length === 2) {
      if (deltaOffset < 0) {
        deltaOffset -= lineFeedCnt;
      } else {
        deltaOffset += lineFeedCnt;
      }
    }
    const modelAnchorOffset = this.model.getOffsetAt(modelAnchor);
    const resultOffset = modelAnchorOffset + deltaOffset;
    return this.model.getPositionAt(resultOffset);
  }
  getPlainTextToCopy(modelRanges, emptySelectionClipboard, forceCRLF) {
    const newLineCharacter = forceCRLF ? "\r\n" : this.model.getEOL();
    modelRanges = modelRanges.slice(0);
    modelRanges.sort(Range.compareRangesUsingStarts);
    let hasEmptyRange = false;
    let hasNonEmptyRange = false;
    for (const range of modelRanges) {
      if (range.isEmpty()) {
        hasEmptyRange = true;
      } else {
        hasNonEmptyRange = true;
      }
    }
    if (!hasNonEmptyRange && !emptySelectionClipboard) {
      return { sourceRanges: [], sourceText: "" };
    }
    const ranges = [];
    const result = [];
    const pushRange = (modelRange, append = "") => {
      ranges.push(modelRange);
      result.push(this.model.getValueInRange(modelRange, forceCRLF ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined) + append);
    };
    if (hasEmptyRange && emptySelectionClipboard) {
      let prevModelLineNumber = 0;
      for (const modelRange of modelRanges) {
        const modelLineNumber = modelRange.startLineNumber;
        if (modelRange.isEmpty()) {
          if (modelLineNumber !== prevModelLineNumber) {
            pushRange(new Range(modelLineNumber, this.model.getLineMinColumn(modelLineNumber), modelLineNumber, this.model.getLineMaxColumn(modelLineNumber)), newLineCharacter);
          }
        } else {
          pushRange(modelRange);
        }
        prevModelLineNumber = modelLineNumber;
      }
    } else {
      for (const modelRange of modelRanges) {
        if (!modelRange.isEmpty()) {
          pushRange(modelRange);
        }
      }
    }
    return { sourceRanges: ranges, sourceText: result.length === 1 ? result[0] : result };
  }
  getRichTextToCopy(modelRanges, emptySelectionClipboard) {
    const languageId = this.model.getLanguageId();
    if (languageId === PLAINTEXT_LANGUAGE_ID) {
      return null;
    }
    if (modelRanges.length !== 1) {
      return null;
    }
    let range = modelRanges[0];
    if (range.isEmpty()) {
      if (!emptySelectionClipboard) {
        return null;
      }
      const lineNumber = range.startLineNumber;
      range = new Range(lineNumber, this.model.getLineMinColumn(lineNumber), lineNumber, this.model.getLineMaxColumn(lineNumber));
    }
    const fontInfo = this._configuration.options.get(EditorOption.fontInfo);
    const colorMap = this._getColorMap();
    const hasBadChars = /[:;\\\/<>]/.test(fontInfo.fontFamily);
    const useDefaultFontFamily = hasBadChars || fontInfo.fontFamily === EDITOR_FONT_DEFAULTS.fontFamily;
    let fontFamily;
    if (useDefaultFontFamily) {
      fontFamily = EDITOR_FONT_DEFAULTS.fontFamily;
    } else {
      fontFamily = fontInfo.fontFamily;
      fontFamily = fontFamily.replace(/"/g, "'");
      const hasQuotesOrIsList = /[,']/.test(fontFamily);
      if (!hasQuotesOrIsList) {
        const needsQuotes = /[+ ]/.test(fontFamily);
        if (needsQuotes) {
          fontFamily = `'${fontFamily}'`;
        }
      }
      fontFamily = `${fontFamily}, ${EDITOR_FONT_DEFAULTS.fontFamily}`;
    }
    return {
      mode: languageId,
      html: `<div style="color: ${colorMap[ColorId.DefaultForeground]};background-color: ${colorMap[ColorId.DefaultBackground]};font-family: ${fontFamily};font-weight: ${fontInfo.fontWeight};font-size: ${fontInfo.fontSize}px;line-height: ${fontInfo.lineHeight}px;white-space: pre;">` + this._getHTMLToCopy(range, colorMap) + "</div>"
    };
  }
  _getHTMLToCopy(modelRange, colorMap) {
    const startLineNumber = modelRange.startLineNumber;
    const startColumn = modelRange.startColumn;
    const endLineNumber = modelRange.endLineNumber;
    const endColumn = modelRange.endColumn;
    const tabSize = this.getTabSize();
    let result = "";
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineTokens = this.model.tokenization.getLineTokens(lineNumber);
      const lineContent = lineTokens.getLineContent();
      const startOffset = lineNumber === startLineNumber ? startColumn - 1 : 0;
      const endOffset = lineNumber === endLineNumber ? endColumn - 1 : lineContent.length;
      if (lineContent === "") {
        result += "<br>";
      } else {
        result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
      }
    }
    return result;
  }
  _getColorMap() {
    const colorMap = TokenizationRegistry.getColorMap();
    const result = ["#000000"];
    if (colorMap) {
      for (let i = 1, len = colorMap.length; i < len; i++) {
        result[i] = Color.Format.CSS.formatHex(colorMap[i]);
      }
    }
    return result;
  }
  //#region cursor operations
  getPrimaryCursorState() {
    return this._cursor.getPrimaryCursorState();
  }
  getLastAddedCursorIndex() {
    return this._cursor.getLastAddedCursorIndex();
  }
  getCursorStates() {
    return this._cursor.getCursorStates();
  }
  setCursorStates(source, reason, states) {
    return this._withViewEventsCollector((eventsCollector) => this._cursor.setStates(eventsCollector, source, reason, states));
  }
  getCursorColumnSelectData() {
    return this._cursor.getCursorColumnSelectData();
  }
  getCursorAutoClosedCharacters() {
    return this._cursor.getAutoClosedCharacters();
  }
  setCursorColumnSelectData(columnSelectData) {
    this._cursor.setCursorColumnSelectData(columnSelectData);
  }
  getPrevEditOperationType() {
    return this._cursor.getPrevEditOperationType();
  }
  setPrevEditOperationType(type) {
    this._cursor.setPrevEditOperationType(type);
  }
  getSelection() {
    return this._cursor.getSelection();
  }
  getSelections() {
    return this._cursor.getSelections();
  }
  getPosition() {
    return this._cursor.getPrimaryCursorState().modelState.position;
  }
  setSelections(source, selections, reason = CursorChangeReason.NotSet) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.setSelections(eventsCollector, source, selections, reason));
  }
  saveCursorState() {
    return this._cursor.saveState();
  }
  restoreCursorState(states) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.restoreState(eventsCollector, states));
  }
  _executeCursorEdit(callback) {
    if (this._cursor.context.cursorConfig.readOnly) {
      this._eventDispatcher.emitOutgoingEvent(new ReadOnlyEditAttemptEvent());
      return;
    }
    this._withViewEventsCollector(callback);
  }
  executeEdits(source, edits, cursorStateComputer, reason) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeEdits(eventsCollector, source, edits, cursorStateComputer, reason));
  }
  startComposition() {
    this._executeCursorEdit((eventsCollector) => this._cursor.startComposition(eventsCollector));
  }
  endComposition(source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.endComposition(eventsCollector, source));
  }
  type(text, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.type(eventsCollector, text, source));
  }
  compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source));
  }
  paste(text, pasteOnNewLine, multicursorText, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.paste(eventsCollector, text, pasteOnNewLine, multicursorText, source));
  }
  cut(source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.cut(eventsCollector, source));
  }
  executeCommand(command, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeCommand(eventsCollector, command, source));
  }
  executeCommands(commands, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeCommands(eventsCollector, commands, source));
  }
  revealAllCursors(source, revealHorizontal, minimalReveal = false) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.revealAll(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
  }
  revealPrimaryCursor(source, revealHorizontal, minimalReveal = false) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.revealPrimary(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
  }
  revealTopMostCursor(source) {
    const viewPosition = this._cursor.getTopMostViewPosition();
    const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
  }
  revealBottomMostCursor(source) {
    const viewPosition = this._cursor.getBottomMostViewPosition();
    const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
  }
  revealRange(source, revealHorizontal, viewRange, verticalType, scrollType) {
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, verticalType, revealHorizontal, scrollType)));
  }
  //#endregion
  //#region viewLayout
  changeWhitespace(callback) {
    const hadAChange = this.viewLayout.changeWhitespace(callback);
    if (hadAChange) {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewZonesChangedEvent());
      this._eventDispatcher.emitOutgoingEvent(new ViewZonesChangedEvent());
    }
  }
  //#endregion
  _withViewEventsCollector(callback) {
    return this._transactionalTarget.batchChanges(() => {
      return this._emitViewEvent(callback);
    });
  }
  _emitViewEvent(callback) {
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      return callback(eventsCollector);
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
  }
  batchEvents(callback) {
    this._withViewEventsCollector(() => {
      callback();
    });
  }
  normalizePosition(position, affinity) {
    return this._lines.normalizePosition(position, affinity);
  }
  /**
   * Gets the column at which indentation stops at a given line.
   * @internal
  */
  getLineIndentColumn(lineNumber) {
    return this._lines.getLineIndentColumn(lineNumber);
  }
}
class ViewportStart {
  constructor(_model, _viewLineNumber, _isValid, _modelTrackedRange, _startLineDelta) {
    this._model = _model;
    this._viewLineNumber = _viewLineNumber;
    this._isValid = _isValid;
    this._modelTrackedRange = _modelTrackedRange;
    this._startLineDelta = _startLineDelta;
  }
  static create(model) {
    const viewportStartLineTrackedRange = model._setTrackedRange(null, new Range(1, 1, 1, 1), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    return new ViewportStart(model, 1, false, viewportStartLineTrackedRange, 0);
  }
  get viewLineNumber() {
    return this._viewLineNumber;
  }
  get isValid() {
    return this._isValid;
  }
  get modelTrackedRange() {
    return this._modelTrackedRange;
  }
  get startLineDelta() {
    return this._startLineDelta;
  }
  dispose() {
    this._model._setTrackedRange(this._modelTrackedRange, null, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
  }
  update(viewModel, startLineNumber) {
    const position = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(startLineNumber, viewModel.getLineMinColumn(startLineNumber)));
    const viewportStartLineTrackedRange = viewModel.model._setTrackedRange(this._modelTrackedRange, new Range(position.lineNumber, position.column, position.lineNumber, position.column), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    const viewportStartLineTop = viewModel.viewLayout.getVerticalOffsetForLineNumber(startLineNumber);
    const scrollTop = viewModel.viewLayout.getCurrentScrollTop();
    this._viewLineNumber = startLineNumber;
    this._isValid = true;
    this._modelTrackedRange = viewportStartLineTrackedRange;
    this._startLineDelta = scrollTop - viewportStartLineTop;
  }
  invalidate() {
    this._isValid = false;
  }
}
class OverviewRulerDecorations {
  constructor() {
    this._asMap = /* @__PURE__ */ Object.create(null);
    this.asArray = [];
  }
  accept(color, zIndex, startLineNumber, endLineNumber, lane) {
    const prevGroup = this._asMap[color];
    if (prevGroup) {
      const prevData = prevGroup.data;
      const prevLane = prevData[prevData.length - 3];
      const prevEndLineNumber = prevData[prevData.length - 1];
      if (prevLane === lane && prevEndLineNumber + 1 >= startLineNumber) {
        if (endLineNumber > prevEndLineNumber) {
          prevData[prevData.length - 1] = endLineNumber;
        }
        return;
      }
      prevData.push(lane, startLineNumber, endLineNumber);
    } else {
      const group = new OverviewRulerDecorationsGroup(color, zIndex, [lane, startLineNumber, endLineNumber]);
      this._asMap[color] = group;
      this.asArray.push(group);
    }
  }
}
class HiddenAreasModel {
  constructor() {
    this.hiddenAreas = /* @__PURE__ */ new Map();
    this.shouldRecompute = false;
    this.ranges = [];
  }
  setHiddenAreas(source, ranges) {
    const existing = this.hiddenAreas.get(source);
    if (existing && rangeArraysEqual(existing, ranges)) {
      return;
    }
    this.hiddenAreas.set(source, ranges);
    this.shouldRecompute = true;
  }
  /**
   * The returned array is immutable.
  */
  getMergedRanges() {
    if (!this.shouldRecompute) {
      return this.ranges;
    }
    this.shouldRecompute = false;
    const newRanges = Array.from(this.hiddenAreas.values()).reduce((r, hiddenAreas) => mergeLineRangeArray(r, hiddenAreas), []);
    if (rangeArraysEqual(this.ranges, newRanges)) {
      return this.ranges;
    }
    this.ranges = newRanges;
    return this.ranges;
  }
}
function mergeLineRangeArray(arr1, arr2) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < arr1.length && j < arr2.length) {
    const item1 = arr1[i];
    const item2 = arr2[j];
    if (item1.endLineNumber < item2.startLineNumber - 1) {
      result.push(arr1[i++]);
    } else if (item2.endLineNumber < item1.startLineNumber - 1) {
      result.push(arr2[j++]);
    } else {
      const startLineNumber = Math.min(item1.startLineNumber, item2.startLineNumber);
      const endLineNumber = Math.max(item1.endLineNumber, item2.endLineNumber);
      result.push(new Range(startLineNumber, 1, endLineNumber, 1));
      i++;
      j++;
    }
  }
  while (i < arr1.length) {
    result.push(arr1[i++]);
  }
  while (j < arr2.length) {
    result.push(arr2[j++]);
  }
  return result;
}
function rangeArraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (!arr1[i].equalsRange(arr2[i])) {
      return false;
    }
  }
  return true;
}
class StableViewport {
  constructor(viewportStartModelPosition, startLineDelta) {
    this.viewportStartModelPosition = viewportStartModelPosition;
    this.startLineDelta = startLineDelta;
  }
  recoverViewportStart(coordinatesConverter, viewLayout) {
    if (!this.viewportStartModelPosition) {
      return;
    }
    const viewPosition = coordinatesConverter.convertModelPositionToViewPosition(this.viewportStartModelPosition);
    const viewPositionTop = viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
    viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this.startLineDelta }, ScrollType.Immediate);
  }
}
export {
  ViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBcnJheVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIEVkaXRvck9wdGlvbiwgZmlsdGVyVmFsaWRhdGlvbkRlY29yYXRpb25zLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZCB9IGZyb20gJy4uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IEN1cnNvcnNDb250cm9sbGVyIH0gZnJvbSAnLi4vY3Vyc29yL2N1cnNvci5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb25maWd1cmF0aW9uLCBDdXJzb3JTdGF0ZSwgRWRpdE9wZXJhdGlvblR5cGUsIElDb2x1bW5TZWxlY3REYXRhLCBQYXJ0aWFsQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi9jdXJzb3JDb21tb24uanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uLCBTZWxlY3Rpb24gfSBmcm9tICcuLi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCwgSUN1cnNvclN0YXRlLCBJVmlld1N0YXRlLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgSUF0dGFjaGVkVmlldywgSUN1cnNvclN0YXRlQ29tcHV0ZXIsIElHbHlwaE1hcmdpbkxhbmVzTW9kZWwsIElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbiwgSVRleHRNb2RlbCwgUG9zaXRpb25BZmZpbml0eSwgVGV4dERpcmVjdGlvbiwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElBY3RpdmVJbmRlbnRHdWlkZUluZm8sIEJyYWNrZXRHdWlkZU9wdGlvbnMsIEluZGVudEd1aWRlIH0gZnJvbSAnLi4vdGV4dE1vZGVsR3VpZGVzLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zLCBNb2RlbERlY29yYXRpb25PcHRpb25zLCBNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucyB9IGZyb20gJy4uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyB0ZXh0TW9kZWxFdmVudHMgZnJvbSAnLi4vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvbG9ySWQgfSBmcm9tICcuLi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHRva2VuaXplTGluZVRvSFRNTCB9IGZyb20gJy4uL2xhbmd1YWdlcy90ZXh0VG9IdG1sVG9rZW5pemVyLmpzJztcbmltcG9ydCB7IEVkaXRvclRoZW1lIH0gZnJvbSAnLi4vZWRpdG9yVGhlbWUuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IFZpZXdMYXlvdXQgfSBmcm9tICcuLi92aWV3TGF5b3V0L3ZpZXdMYXlvdXQuanMnO1xuaW1wb3J0IHsgTWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlciB9IGZyb20gJy4vbWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBJTGluZUJyZWFrc0NvbXB1dGVyLCBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCwgSUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksIEluamVjdGVkVGV4dCB9IGZyb20gJy4uL21vZGVsTGluZVByb2plY3Rpb25EYXRhLmpzJztcbmltcG9ydCB7IFZpZXdFdmVudEhhbmRsZXIgfSBmcm9tICcuLi92aWV3RXZlbnRIYW5kbGVyLmpzJztcbmltcG9ydCB7IElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IsIElWaWV3TW9kZWwsIElXaGl0ZXNwYWNlQ2hhbmdlQWNjZXNzb3IsIE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEsIE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwLCBWaWV3TGluZURhdGEsIFZpZXdMaW5lUmVuZGVyaW5nRGF0YSwgVmlld01vZGVsRGVjb3JhdGlvbiB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWxEZWNvcmF0aW9ucyB9IGZyb20gJy4vdmlld01vZGVsRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgRm9jdXNDaGFuZ2VkRXZlbnQsIEhpZGRlbkFyZWFzQ2hhbmdlZEV2ZW50LCBNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIE1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQsIE1vZGVsRm9udENoYW5nZWRFdmVudCwgTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudCwgTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudCwgTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50LCBNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCwgT3V0Z29pbmdWaWV3TW9kZWxFdmVudCwgUmVhZE9ubHlFZGl0QXR0ZW1wdEV2ZW50LCBTY3JvbGxDaGFuZ2VkRXZlbnQsIFZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlciwgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBWaWV3Wm9uZXNDaGFuZ2VkRXZlbnQsIFdpZGdldEZvY3VzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vdmlld01vZGVsRXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWxMaW5lcywgVmlld01vZGVsTGluZXNGcm9tTW9kZWxBc0lzLCBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbCB9IGZyb20gJy4vdmlld01vZGVsTGluZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lc01vZGVsIH0gZnJvbSAnLi9nbHlwaExhbmVzTW9kZWwuanMnO1xuaW1wb3J0IHsgQ3VzdG9tTGluZUhlaWdodERhdGEgfSBmcm9tICcuLi92aWV3TGF5b3V0L2xpbmVIZWlnaHRzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24gfSBmcm9tICcuL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElDb29yZGluYXRlc0NvbnZlcnRlciB9IGZyb20gJy4uL2Nvb3JkaW5hdGVzQ29udmVydGVyLmpzJztcblxuY29uc3QgVVNFX0lERU5USVRZX0xJTkVTX0NPTExFQ1RJT04gPSB0cnVlO1xuXG5leHBvcnQgY2xhc3MgVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWaWV3TW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcklkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V2ZW50RGlzcGF0Y2hlcjogVmlld01vZGVsRXZlbnREaXNwYXRjaGVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FdmVudDogRXZlbnQ8T3V0Z29pbmdWaWV3TW9kZWxFdmVudD47XG5cdHB1YmxpYyBjdXJzb3JDb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50OiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9oYXNGb2N1czogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld3BvcnRTdGFydDogVmlld3BvcnRTdGFydDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZXM6IElWaWV3TW9kZWxMaW5lcztcblx0cHVibGljIHJlYWRvbmx5IGNvb3JkaW5hdGVzQ29udmVydGVyOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXI7XG5cdHB1YmxpYyByZWFkb25seSB2aWV3TGF5b3V0OiBWaWV3TGF5b3V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJzb3I6IEN1cnNvcnNDb250cm9sbGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uczogVmlld01vZGVsRGVjb3JhdGlvbnM7XG5cdHB1YmxpYyByZWFkb25seSBnbHlwaExhbmVzOiBJR2x5cGhNYXJnaW5MYW5lc01vZGVsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcklkOiBudW1iZXIsXG5cdFx0Y29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24sXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0ZG9tTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeTogSUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0bW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeTogSUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogKGNhbGxiYWNrOiAoKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZFZpZXc6IElBdHRhY2hlZFZpZXcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNhY3Rpb25hbFRhcmdldDogSUJhdGNoYWJsZVRhcmdldCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvcklkID0gZWRpdG9ySWQ7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlciA9IG5ldyBWaWV3TW9kZWxFdmVudERpc3BhdGNoZXIoKTtcblx0XHR0aGlzLm9uRXZlbnQgPSB0aGlzLl9ldmVudERpc3BhdGNoZXIub25FdmVudDtcblx0XHR0aGlzLmN1cnNvckNvbmZpZyA9IG5ldyBDdXJzb3JDb25maWd1cmF0aW9uKHRoaXMubW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0aGlzLm1vZGVsLmdldE9wdGlvbnMoKSwgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50Tm93KCksIDApKTtcblx0XHR0aGlzLl9oYXNGb2N1cyA9IGZhbHNlO1xuXHRcdHRoaXMuX3ZpZXdwb3J0U3RhcnQgPSBWaWV3cG9ydFN0YXJ0LmNyZWF0ZSh0aGlzLm1vZGVsKTtcblx0XHR0aGlzLmdseXBoTGFuZXMgPSBuZXcgR2x5cGhNYXJnaW5MYW5lc01vZGVsKDApO1xuXG5cdFx0aWYgKFVTRV9JREVOVElUWV9MSU5FU19DT0xMRUNUSU9OICYmIHRoaXMubW9kZWwuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpKSB7XG5cblx0XHRcdHRoaXMuX2xpbmVzID0gbmV3IFZpZXdNb2RlbExpbmVzRnJvbU1vZGVsQXNJcyh0aGlzLm1vZGVsKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdFx0Y29uc3QgZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdFx0Y29uc3Qgd3JhcHBpbmdTdHJhdGVneSA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ1N0cmF0ZWd5KTtcblx0XHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXHRcdFx0Y29uc3Qgd3JhcHBpbmdJbmRlbnQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmRlbnQpO1xuXHRcdFx0Y29uc3Qgd29yZEJyZWFrID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRCcmVhayk7XG5cdFx0XHRjb25zdCB3cmFwT25Fc2NhcGVkTGluZUZlZWRzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBPbkVzY2FwZWRMaW5lRmVlZHMpO1xuXG5cdFx0XHR0aGlzLl9saW5lcyA9IG5ldyBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbChcblx0XHRcdFx0dGhpcy5fZWRpdG9ySWQsXG5cdFx0XHRcdHRoaXMubW9kZWwsXG5cdFx0XHRcdGRvbUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRcdGZvbnRJbmZvLFxuXHRcdFx0XHR0aGlzLm1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplLFxuXHRcdFx0XHR3cmFwcGluZ1N0cmF0ZWd5LFxuXHRcdFx0XHR3cmFwcGluZ0luZm8ud3JhcHBpbmdDb2x1bW4sXG5cdFx0XHRcdHdyYXBwaW5nSW5kZW50LFxuXHRcdFx0XHR3b3JkQnJlYWssXG5cdFx0XHRcdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHNcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb29yZGluYXRlc0NvbnZlcnRlciA9IHRoaXMuX2xpbmVzLmNyZWF0ZUNvb3JkaW5hdGVzQ29udmVydGVyKCk7XG5cblx0XHR0aGlzLl9jdXJzb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ3Vyc29yc0NvbnRyb2xsZXIobW9kZWwsIHRoaXMsIHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIsIHRoaXMuY3Vyc29yQ29uZmlnKSk7XG5cblx0XHR0aGlzLnZpZXdMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVmlld0xheW91dCh0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLmdldExpbmVDb3VudCgpLCB0aGlzLl9nZXRDdXN0b21MaW5lSGVpZ2h0cygpLCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdMYXlvdXQub25EaWRTY3JvbGwoKGUpID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlVmlzaWJsZUxpbmVzQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl92aWV3cG9ydFN0YXJ0LmludmFsaWRhdGUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0U2luZ2xlVmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQoZSkpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBTY3JvbGxDaGFuZ2VkRXZlbnQoXG5cdFx0XHRcdGUub2xkU2Nyb2xsV2lkdGgsIGUub2xkU2Nyb2xsTGVmdCwgZS5vbGRTY3JvbGxIZWlnaHQsIGUub2xkU2Nyb2xsVG9wLFxuXHRcdFx0XHRlLnNjcm9sbFdpZHRoLCBlLnNjcm9sbExlZnQsIGUuc2Nyb2xsSGVpZ2h0LCBlLnNjcm9sbFRvcFxuXHRcdFx0KSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3TGF5b3V0Lm9uRGlkQ29udGVudFNpemVDaGFuZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IG5ldyBWaWV3TW9kZWxEZWNvcmF0aW9ucyh0aGlzLl9lZGl0b3JJZCwgdGhpcy5tb2RlbCwgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5fbGluZXMsIHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJNb2RlbEV2ZW50cygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUZhc3QoKGUpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5iZWdpbkVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0XHRcdHRoaXMuX29uQ29uZmlndXJhdGlvbkNoYW5nZWQoZXZlbnRzQ29sbGVjdG9yLCBlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbmRFbWl0Vmlld0V2ZW50cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIuZ2V0SW5zdGFuY2UoKS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3VG9rZW5zQ29sb3JzQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKHRoZW1lKSA9PiB7XG5cdFx0XHR0aGlzLl9pbnZhbGlkYXRlRGVjb3JhdGlvbnNDb2xvckNhY2hlKCk7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3VGhlbWVDaGFuZ2VkRXZlbnQodGhlbWUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudE5vdygpO1xuXHRcdHRoaXMubW9kZWwucmVnaXN0ZXJWaWV3TW9kZWwodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBGaXJzdCByZW1vdmUgbGlzdGVuZXJzLCBhcyBkaXNwb3NpbmcgdGhlIGxpbmVzIG1pZ2h0IGVuZCB1cCBzZW5kaW5nXG5cdFx0Ly8gbW9kZWwgZGVjb3JhdGlvbiBjaGFuZ2VkIGV2ZW50cyAuLi4gYW5kIHdlIG5vIGxvbmdlciBjYXJlIGFib3V0IHRoZW0gLi4uXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9saW5lcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdmlld3BvcnRTdGFydC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsLnVucmVnaXN0ZXJWaWV3TW9kZWwodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdG9yT3B0aW9uPFQgZXh0ZW5kcyBFZGl0b3JPcHRpb24+KGlkOiBUKTogRmluZENvbXB1dGVkRWRpdG9yT3B0aW9uVmFsdWVCeUlkPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChpZCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKGNvbnRleHQ/OiBJTGluZUJyZWFrc0NvbXB1dGVyQ29udGV4dCk6IElMaW5lQnJlYWtzQ29tcHV0ZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5jcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoY29udGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgYWRkVmlld0V2ZW50SGFuZGxlcihldmVudEhhbmRsZXI6IFZpZXdFdmVudEhhbmRsZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuYWRkVmlld0V2ZW50SGFuZGxlcihldmVudEhhbmRsZXIpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVZpZXdFdmVudEhhbmRsZXIoZXZlbnRIYW5kbGVyOiBWaWV3RXZlbnRIYW5kbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLnJlbW92ZVZpZXdFdmVudEhhbmRsZXIoZXZlbnRIYW5kbGVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1c3RvbUxpbmVIZWlnaHRzKCk6IEN1c3RvbUxpbmVIZWlnaHREYXRhW10ge1xuXHRcdGNvbnN0IGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cyk7XG5cdFx0aWYgKCFhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLm1vZGVsLmdldEN1c3RvbUxpbmVIZWlnaHRzRGVjb3JhdGlvbnModGhpcy5fZWRpdG9ySWQpO1xuXHRcdHJldHVybiBDdXN0b21MaW5lSGVpZ2h0RGF0YS5mcm9tRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnMsIHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIsIHRoaXMuX2NvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q3VzdG9tTGluZUhlaWdodHNGb3JMaW5lcyhmcm9tTGluZU51bWJlcjogbnVtYmVyLCB0b0xpbmVOdW1iZXI6IG51bWJlcik6IEN1c3RvbUxpbmVIZWlnaHREYXRhW10ge1xuXHRcdGNvbnN0IGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cyk7XG5cdFx0aWYgKCFhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxSYW5nZSA9IG5ldyBSYW5nZShmcm9tTGluZU51bWJlciwgMSwgdG9MaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4odG9MaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLm1vZGVsLmdldEN1c3RvbUxpbmVIZWlnaHRzRGVjb3JhdGlvbnNJblJhbmdlKG1vZGVsUmFuZ2UsIHRoaXMuX2VkaXRvcklkKTtcblx0XHRyZXR1cm4gQ3VzdG9tTGluZUhlaWdodERhdGEuZnJvbURlY29yYXRpb25zKGRlY29yYXRpb25zLCB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLCB0aGlzLl9jb25maWd1cmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50Tm93KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24uc2V0Vmlld0xpbmVDb3VudCh0aGlzLl9saW5lcy5nZXRWaWV3TGluZUNvdW50KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbFZpc2libGVSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgbGluZXNWaWV3cG9ydERhdGEgPSB0aGlzLnZpZXdMYXlvdXQuZ2V0TGluZXNWaWV3cG9ydERhdGEoKTtcblx0XHRjb25zdCB2aWV3VmlzaWJsZVJhbmdlID0gbmV3IFJhbmdlKFxuXHRcdFx0bGluZXNWaWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0dGhpcy5nZXRMaW5lTWluQ29sdW1uKGxpbmVzVmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciksXG5cdFx0XHRsaW5lc1ZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0dGhpcy5nZXRMaW5lTWF4Q29sdW1uKGxpbmVzVmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIpXG5cdFx0KTtcblx0XHRjb25zdCBtb2RlbFZpc2libGVSYW5nZXMgPSB0aGlzLl90b01vZGVsVmlzaWJsZVJhbmdlcyh2aWV3VmlzaWJsZVJhbmdlKTtcblx0XHRyZXR1cm4gbW9kZWxWaXNpYmxlUmFuZ2VzO1xuXHR9XG5cblx0cHVibGljIHZpc2libGVMaW5lc1N0YWJpbGl6ZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWxWaXNpYmxlUmFuZ2VzID0gdGhpcy5nZXRNb2RlbFZpc2libGVSYW5nZXMoKTtcblx0XHR0aGlzLl9hdHRhY2hlZFZpZXcuc2V0VmlzaWJsZUxpbmVzKG1vZGVsVmlzaWJsZVJhbmdlcywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVWaXNpYmxlTGluZXNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsVmlzaWJsZVJhbmdlcyA9IHRoaXMuZ2V0TW9kZWxWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0dGhpcy5fYXR0YWNoZWRWaWV3LnNldFZpc2libGVMaW5lcyhtb2RlbFZpc2libGVSYW5nZXMsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIYXNGb2N1cyhoYXNGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2hhc0ZvY3VzID0gaGFzRm9jdXM7XG5cdFx0dGhpcy5fY3Vyc29yLnNldEhhc0ZvY3VzKGhhc0ZvY3VzKTtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Rm9jdXNDaGFuZ2VkRXZlbnQoaGFzRm9jdXMpKTtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IEZvY3VzQ2hhbmdlZEV2ZW50KCFoYXNGb2N1cywgaGFzRm9jdXMpKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRIYXNXaWRnZXRGb2N1cyhoYXNXaWRnZXRGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgV2lkZ2V0Rm9jdXNDaGFuZ2VkRXZlbnQoIWhhc1dpZGdldEZvY3VzLCBoYXNXaWRnZXRGb2N1cykpO1xuXHR9XG5cblx0cHVibGljIG9uQ29tcG9zaXRpb25TdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Q29tcG9zaXRpb25TdGFydEV2ZW50KCkpO1xuXHR9XG5cblx0cHVibGljIG9uQ29tcG9zaXRpb25FbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0NvbXBvc2l0aW9uRW5kRXZlbnQoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYXB0dXJlU3RhYmxlVmlld3BvcnQoKTogU3RhYmxlVmlld3BvcnQge1xuXHRcdC8vIFdlIG1pZ2h0IG5lZWQgdG8gcmVzdG9yZSB0aGUgY3VycmVudCBzdGFydCB2aWV3IHJhbmdlLCBzbyBzYXZlIGl0IChpZiBhdmFpbGFibGUpXG5cdFx0Ly8gQnV0IG9ubHkgaWYgdGhlIHNjcm9sbCBwb3NpdGlvbiBpcyBub3QgYXQgdGhlIHRvcCBvZiB0aGUgZmlsZVxuXHRcdGlmICh0aGlzLl92aWV3cG9ydFN0YXJ0LmlzVmFsaWQgJiYgdGhpcy52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSA+IDApIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzVmlld3BvcnRTdGFydFZpZXdQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLl92aWV3cG9ydFN0YXJ0LnZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNaW5Db2x1bW4odGhpcy5fdmlld3BvcnRTdGFydC52aWV3TGluZU51bWJlcikpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNWaWV3cG9ydFN0YXJ0TW9kZWxQb3NpdGlvbiA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihwcmV2aW91c1ZpZXdwb3J0U3RhcnRWaWV3UG9zaXRpb24pO1xuXHRcdFx0cmV0dXJuIG5ldyBTdGFibGVWaWV3cG9ydChwcmV2aW91c1ZpZXdwb3J0U3RhcnRNb2RlbFBvc2l0aW9uLCB0aGlzLl92aWV3cG9ydFN0YXJ0LnN0YXJ0TGluZURlbHRhKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBTdGFibGVWaWV3cG9ydChudWxsLCAwKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQ29uZmlndXJhdGlvbkNoYW5nZWQoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIGU6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzdGFibGVWaWV3cG9ydCA9IHRoaXMuX2NhcHR1cmVTdGFibGVWaWV3cG9ydCgpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IHdyYXBwaW5nU3RyYXRlZ3kgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdTdHJhdGVneSk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbyk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmRlbnQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmRlbnQpO1xuXHRcdGNvbnN0IHdvcmRCcmVhayA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkQnJlYWspO1xuXG5cdFx0aWYgKHRoaXMuX2xpbmVzLnNldFdyYXBwaW5nU2V0dGluZ3MoZm9udEluZm8sIHdyYXBwaW5nU3RyYXRlZ3ksIHdyYXBwaW5nSW5mby53cmFwcGluZ0NvbHVtbiwgd3JhcHBpbmdJbmRlbnQsIHdvcmRCcmVhaykpIHtcblx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQoKSk7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQobnVsbCkpO1xuXHRcdFx0dGhpcy5fY3Vyc29yLm9uTGluZU1hcHBpbmdDaGFuZ2VkKGV2ZW50c0NvbGxlY3Rvcik7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5vbkxpbmVNYXBwaW5nQ2hhbmdlZCgpO1xuXHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uRmx1c2hlZCh0aGlzLmdldExpbmVDb3VudCgpLCB0aGlzLl9nZXRDdXN0b21MaW5lSGVpZ2h0cygpKTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnQuc2NoZWR1bGUoKTtcblx0XHR9XG5cblx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdC8vIE11c3QgcmVhZCBhZ2FpbiBhbGwgZGVjb3JhdGlvbnMgZHVlIHRvIHJlYWRPbmx5IGZpbHRlcmluZ1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMucmVzZXQoKTtcblx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChudWxsKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ucmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMucmVzZXQoKTtcblx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChudWxsKSk7XG5cdFx0fVxuXG5cdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQoZSkpO1xuXHRcdHRoaXMudmlld0xheW91dC5vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGUpO1xuXG5cdFx0c3RhYmxlVmlld3BvcnQucmVjb3ZlclZpZXdwb3J0U3RhcnQodGhpcy5jb29yZGluYXRlc0NvbnZlcnRlciwgdGhpcy52aWV3TGF5b3V0KTtcblxuXHRcdGlmIChDdXJzb3JDb25maWd1cmF0aW9uLnNob3VsZFJlY3JlYXRlKGUpKSB7XG5cdFx0XHR0aGlzLmN1cnNvckNvbmZpZyA9IG5ldyBDdXJzb3JDb25maWd1cmF0aW9uKHRoaXMubW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0aGlzLm1vZGVsLmdldE9wdGlvbnMoKSwgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N1cnNvci51cGRhdGVDb25maWd1cmF0aW9uKHRoaXMuY3Vyc29yQ29uZmlnKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBjYWxsZWQgZGlyZWN0bHkgYnkgdGhlIHRleHQgbW9kZWwuXG5cdCAqL1xuXHRvbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChlOiB0ZXh0TW9kZWxFdmVudHMuSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IHRleHRNb2RlbEV2ZW50cy5Nb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQge1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5iZWdpbkVtaXRWaWV3RXZlbnRzKCk7XG5cblx0XHRcdGxldCBoYWRPdGhlck1vZGVsQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRsZXQgaGFkTW9kZWxMaW5lQ2hhbmdlVGhhdENoYW5nZWRMaW5lTWFwcGluZyA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gKGUgaW5zdGFuY2VvZiB0ZXh0TW9kZWxFdmVudHMuSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCA/IGUucmF3Q29udGVudENoYW5nZWRFdmVudC5jaGFuZ2VzIDogZS5jaGFuZ2VzKTtcblx0XHRcdGNvbnN0IHZlcnNpb25JZCA9IChlIGluc3RhbmNlb2YgdGV4dE1vZGVsRXZlbnRzLkludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgPyBlLnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQudmVyc2lvbklkIDogbnVsbCk7XG5cblx0XHRcdC8vIERvIGEgZmlyc3QgcGFzcyB0byBjb21wdXRlIGxpbmUgbWFwcGluZ3MsIGFuZCBhIHNlY29uZCBwYXNzIHRvIGFjdHVhbGx5IGludGVycHJldCB0aGVtXG5cdFx0XHRjb25zdCBsaW5lQnJlYWtzQ29tcHV0ZXIgPSB0aGlzLl9saW5lcy5jcmVhdGVMaW5lQnJlYWtzQ29tcHV0ZXIoKTtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0c3dpdGNoIChjaGFuZ2UuY2hhbmdlVHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lc0luc2VydGVkOiB7XG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNoYW5nZS5jb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGxpbmVCcmVha3NDb21wdXRlci5hZGRSZXF1ZXN0KGNoYW5nZS5mcm9tTGluZU51bWJlclBvc3RFZGl0ICsgaSwgbnVsbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSB0ZXh0TW9kZWxFdmVudHMuUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVDaGFuZ2VkOiB7XG5cdFx0XHRcdFx0XHRsaW5lQnJlYWtzQ29tcHV0ZXIuYWRkUmVxdWVzdChjaGFuZ2UubGluZU51bWJlclBvc3RFZGl0LCBudWxsKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZUJyZWFrcyA9IGxpbmVCcmVha3NDb21wdXRlci5maW5hbGl6ZSgpO1xuXHRcdFx0Y29uc3QgbGluZUJyZWFrUXVldWUgPSBuZXcgQXJyYXlRdWV1ZShsaW5lQnJlYWtzKTtcblxuXHRcdFx0Ly8gQ29sbGVjdCBtb2RlbCBsaW5lIHJhbmdlcyB0aGF0IG5lZWQgY3VzdG9tIGxpbmUgaGVpZ2h0IGNvbXB1dGF0aW9uLlxuXHRcdFx0Ly8gV2UgZGVmZXIgdGhpcyB1bnRpbCBhZnRlciB0aGUgbG9vcCBiZWNhdXNlIHRoZSBjb29yZGluYXRlc0NvbnZlcnRlclxuXHRcdFx0Ly8gcmVsaWVzIG9uIHByb2plY3Rpb25zIHRoYXQgbWF5IG5vdCB5ZXQgcmVmbGVjdCBhbGwgY2hhbmdlcyBpbiB0aGUgYmF0Y2guXG5cdFx0XHRjb25zdCBjdXN0b21MaW5lSGVpZ2h0UmFuZ2VzVG9JbnNlcnQ6IHsgZnJvbUxpbmVOdW1iZXI6IG51bWJlcjsgdG9MaW5lTnVtYmVyOiBudW1iZXIgfVtdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0c3dpdGNoIChjaGFuZ2UuY2hhbmdlVHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5GbHVzaDoge1xuXHRcdFx0XHRcdFx0dGhpcy5fbGluZXMub25Nb2RlbEZsdXNoZWQoKTtcblx0XHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQoKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5yZXNldCgpO1xuXHRcdFx0XHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uRmx1c2hlZCh0aGlzLmdldExpbmVDb3VudCgpLCB0aGlzLl9nZXRDdXN0b21MaW5lSGVpZ2h0cygpKTtcblx0XHRcdFx0XHRcdGhhZE90aGVyTW9kZWxDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lc0RlbGV0ZWQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVzRGVsZXRlZEV2ZW50ID0gdGhpcy5fbGluZXMub25Nb2RlbExpbmVzRGVsZXRlZCh2ZXJzaW9uSWQsIGNoYW5nZS5mcm9tTGluZU51bWJlciwgY2hhbmdlLnRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRpZiAobGluZXNEZWxldGVkRXZlbnQgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobGluZXNEZWxldGVkRXZlbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25MaW5lc0RlbGV0ZWQobGluZXNEZWxldGVkRXZlbnQuZnJvbUxpbmVOdW1iZXIsIGxpbmVzRGVsZXRlZEV2ZW50LnRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRcdGN1c3RvbUxpbmVIZWlnaHRSYW5nZXNUb0luc2VydC5wdXNoKHsgZnJvbUxpbmVOdW1iZXI6IGNoYW5nZS5sYXN0VW50b3VjaGVkTGluZVBvc3RFZGl0LCB0b0xpbmVOdW1iZXI6IGNoYW5nZS5sYXN0VW50b3VjaGVkTGluZVBvc3RFZGl0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aGFkT3RoZXJNb2RlbENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSB0ZXh0TW9kZWxFdmVudHMuUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVzSW5zZXJ0ZWQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGluc2VydGVkTGluZUJyZWFrcyA9IGxpbmVCcmVha1F1ZXVlLnRha2VDb3VudChjaGFuZ2UuY291bnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZXNJbnNlcnRlZEV2ZW50ID0gdGhpcy5fbGluZXMub25Nb2RlbExpbmVzSW5zZXJ0ZWQodmVyc2lvbklkLCBjaGFuZ2UuZnJvbUxpbmVOdW1iZXIsIGNoYW5nZS50b0xpbmVOdW1iZXIsIGluc2VydGVkTGluZUJyZWFrcyk7XG5cdFx0XHRcdFx0XHRpZiAobGluZXNJbnNlcnRlZEV2ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KGxpbmVzSW5zZXJ0ZWRFdmVudCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmlld0xheW91dC5vbkxpbmVzSW5zZXJ0ZWQobGluZXNJbnNlcnRlZEV2ZW50LmZyb21MaW5lTnVtYmVyLCBsaW5lc0luc2VydGVkRXZlbnQudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0Y3VzdG9tTGluZUhlaWdodFJhbmdlc1RvSW5zZXJ0LnB1c2goeyBmcm9tTGluZU51bWJlcjogY2hhbmdlLmZyb21MaW5lTnVtYmVyUG9zdEVkaXQsIHRvTGluZU51bWJlcjogY2hhbmdlLnRvTGluZU51bWJlclBvc3RFZGl0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aGFkT3RoZXJNb2RlbENoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSB0ZXh0TW9kZWxFdmVudHMuUmF3Q29udGVudENoYW5nZWRUeXBlLkxpbmVDaGFuZ2VkOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFuZ2VkTGluZUJyZWFrRGF0YSA9IGxpbmVCcmVha1F1ZXVlLmRlcXVldWUoKSE7XG5cdFx0XHRcdFx0XHRjb25zdCBbbGluZU1hcHBpbmdDaGFuZ2VkLCBsaW5lc0NoYW5nZWRFdmVudCwgbGluZXNJbnNlcnRlZEV2ZW50LCBsaW5lc0RlbGV0ZWRFdmVudF0gPVxuXHRcdFx0XHRcdFx0XHR0aGlzLl9saW5lcy5vbk1vZGVsTGluZUNoYW5nZWQodmVyc2lvbklkLCBjaGFuZ2UubGluZU51bWJlciwgY2hhbmdlZExpbmVCcmVha0RhdGEpO1xuXHRcdFx0XHRcdFx0aGFkTW9kZWxMaW5lQ2hhbmdlVGhhdENoYW5nZWRMaW5lTWFwcGluZyA9IGxpbmVNYXBwaW5nQ2hhbmdlZDtcblx0XHRcdFx0XHRcdGlmIChsaW5lc0NoYW5nZWRFdmVudCkge1xuXHRcdFx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChsaW5lc0NoYW5nZWRFdmVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobGluZXNJbnNlcnRlZEV2ZW50KSB7XG5cdFx0XHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KGxpbmVzSW5zZXJ0ZWRFdmVudCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmlld0xheW91dC5vbkxpbmVzSW5zZXJ0ZWQobGluZXNJbnNlcnRlZEV2ZW50LmZyb21MaW5lTnVtYmVyLCBsaW5lc0luc2VydGVkRXZlbnQudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0Y3VzdG9tTGluZUhlaWdodFJhbmdlc1RvSW5zZXJ0LnB1c2goeyBmcm9tTGluZU51bWJlcjogY2hhbmdlLmxpbmVOdW1iZXJQb3N0RWRpdCwgdG9MaW5lTnVtYmVyOiBjaGFuZ2UubGluZU51bWJlclBvc3RFZGl0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGxpbmVzRGVsZXRlZEV2ZW50KSB7XG5cdFx0XHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KGxpbmVzRGVsZXRlZEV2ZW50KTtcblx0XHRcdFx0XHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uTGluZXNEZWxldGVkKGxpbmVzRGVsZXRlZEV2ZW50LmZyb21MaW5lTnVtYmVyLCBsaW5lc0RlbGV0ZWRFdmVudC50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRjdXN0b21MaW5lSGVpZ2h0UmFuZ2VzVG9JbnNlcnQucHVzaCh7IGZyb21MaW5lTnVtYmVyOiBjaGFuZ2UubGluZU51bWJlclBvc3RFZGl0LCB0b0xpbmVOdW1iZXI6IGNoYW5nZS5saW5lTnVtYmVyUG9zdEVkaXQgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSB0ZXh0TW9kZWxFdmVudHMuUmF3Q29udGVudENoYW5nZWRUeXBlLkVPTENoYW5nZWQ6IHtcblx0XHRcdFx0XHRcdC8vIE5vdGhpbmcgdG8gZG8uIFRoZSBuZXcgdmVyc2lvbiB3aWxsIGJlIGFjY2VwdGVkIGJlbG93XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHZlcnNpb25JZCAhPT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl9saW5lcy5hY2NlcHRWZXJzaW9uSWQodmVyc2lvbklkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXBwbHkgZGVmZXJyZWQgY3VzdG9tIGxpbmUgaGVpZ2h0cyBub3cgdGhhdCBwcm9qZWN0aW9ucyBhcmUgc3RhYmxlXG5cdFx0XHRpZiAoY3VzdG9tTGluZUhlaWdodFJhbmdlc1RvSW5zZXJ0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy52aWV3TGF5b3V0LmNoYW5nZVNwZWNpYWxMaW5lSGVpZ2h0cygoYWNjZXNzb3I6IElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIGN1c3RvbUxpbmVIZWlnaHRSYW5nZXNUb0luc2VydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VzdG9tTGluZUhlaWdodHMgPSB0aGlzLl9nZXRDdXN0b21MaW5lSGVpZ2h0c0ZvckxpbmVzKHJhbmdlLmZyb21MaW5lTnVtYmVyLCByYW5nZS50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIGN1c3RvbUxpbmVIZWlnaHRzKSB7XG5cdFx0XHRcdFx0XHRcdGFjY2Vzc29yLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkYXRhLmRlY29yYXRpb25JZCwgZGF0YS5zdGFydExpbmVOdW1iZXIsIGRhdGEuZW5kTGluZU51bWJlciwgZGF0YS5saW5lSGVpZ2h0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXdMYXlvdXQub25IZWlnaHRNYXliZUNoYW5nZWQoKTtcblxuXHRcdFx0aWYgKCFoYWRPdGhlck1vZGVsQ2hhbmdlICYmIGhhZE1vZGVsTGluZUNoYW5nZVRoYXRDaGFuZ2VkTGluZU1hcHBpbmcpIHtcblx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQobnVsbCkpO1xuXHRcdFx0XHR0aGlzLl9jdXJzb3Iub25MaW5lTWFwcGluZ0NoYW5nZWQoZXZlbnRzQ29sbGVjdG9yKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMub25MaW5lTWFwcGluZ0NoYW5nZWQoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVuZEVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBjb25maWd1cmF0aW9uIGFuZCByZXNldCB0aGUgY2VudGVyZWQgdmlldyBsaW5lXG5cdFx0Y29uc3Qgdmlld3BvcnRTdGFydFdhc1ZhbGlkID0gdGhpcy5fdmlld3BvcnRTdGFydC5pc1ZhbGlkO1xuXHRcdHRoaXMuX3ZpZXdwb3J0U3RhcnQuaW52YWxpZGF0ZSgpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24uc2V0TW9kZWxMaW5lQ291bnQodGhpcy5tb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnROb3coKTtcblxuXHRcdC8vIFJlY292ZXIgdmlld3BvcnRcblx0XHRpZiAoIXRoaXMuX2hhc0ZvY3VzICYmIHRoaXMubW9kZWwuZ2V0QXR0YWNoZWRFZGl0b3JDb3VudCgpID49IDIgJiYgdmlld3BvcnRTdGFydFdhc1ZhbGlkKSB7XG5cdFx0XHRjb25zdCBtb2RlbFJhbmdlID0gdGhpcy5tb2RlbC5fZ2V0VHJhY2tlZFJhbmdlKHRoaXMuX3ZpZXdwb3J0U3RhcnQubW9kZWxUcmFja2VkUmFuZ2UpO1xuXHRcdFx0aWYgKG1vZGVsUmFuZ2UpIHtcblx0XHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uVG9wID0gdGhpcy52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdHRoaXMudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogdmlld1Bvc2l0aW9uVG9wICsgdGhpcy5fdmlld3BvcnRTdGFydC5zdGFydExpbmVEZWx0YSB9LCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5faGFuZGxlVmlzaWJsZUxpbmVzQ2hhbmdlZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgY2FsbGVkIGRpcmVjdGx5IGJ5IHRoZSB0ZXh0IG1vZGVsLlxuXHQgKi9cblx0ZW1pdENvbnRlbnRDaGFuZ2VFdmVudChlOiB0ZXh0TW9kZWxFdmVudHMuSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IHRleHRNb2RlbEV2ZW50cy5Nb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2VtaXRWaWV3RXZlbnQoKGV2ZW50c0NvbGxlY3RvcikgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiB0ZXh0TW9kZWxFdmVudHMuSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCkge1xuXHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsQ29udGVudENoYW5nZWRFdmVudChlLmNvbnRlbnRDaGFuZ2VkRXZlbnQpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnNvci5vbk1vZGVsQ29udGVudENoYW5nZWQoZXZlbnRzQ29sbGVjdG9yLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTW9kZWxFdmVudHMoKTogdm9pZCB7XG5cblx0XHRjb25zdCBhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpO1xuXHRcdGlmIChhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VMaW5lSGVpZ2h0KChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbHRlcmVkQ2hhbmdlcyA9IGUuY2hhbmdlcy5maWx0ZXIoKGNoYW5nZSkgPT4gY2hhbmdlLm93bmVySWQgPT09IHRoaXMuX2VkaXRvcklkIHx8IGNoYW5nZS5vd25lcklkID09PSAwKTtcblxuXHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQuY2hhbmdlU3BlY2lhbExpbmVIZWlnaHRzKChhY2Nlc3NvcjogSUxpbmVIZWlnaHRDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGZpbHRlcmVkQ2hhbmdlcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBkZWNvcmF0aW9uSWQsIGxpbmVOdW1iZXIsIGxpbmVIZWlnaHRNdWx0aXBsaWVyIH0gPSBjaGFuZ2U7XG5cdFx0XHRcdFx0XHRjb25zdCB2aWV3UmFuZ2UgPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UobmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSkpO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVIZWlnaHRNdWx0aXBsaWVyICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGFjY2Vzc29yLmluc2VydE9yQ2hhbmdlQ3VzdG9tTGluZUhlaWdodChkZWNvcmF0aW9uSWQsIHZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIsIHZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyLCBsaW5lSGVpZ2h0TXVsdGlwbGllciAqIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIHJlY3JlYXRlIHRoZSBtb2RlbCBldmVudCB1c2luZyB0aGUgZmlsdGVyZWQgY2hhbmdlc1xuXHRcdFx0XHRpZiAoZmlsdGVyZWRDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXJlZEV2ZW50ID0gbmV3IHRleHRNb2RlbEV2ZW50cy5Nb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQoZmlsdGVyZWRDaGFuZ2VzKTtcblx0XHRcdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudChmaWx0ZXJlZEV2ZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd1ZhcmlhYmxlRm9udHMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5lZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMpO1xuXHRcdGlmIChhbGxvd1ZhcmlhYmxlRm9udHMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VGb250KChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbHRlcmVkQ2hhbmdlcyA9IGUuY2hhbmdlcy5maWx0ZXIoKGNoYW5nZSkgPT4gY2hhbmdlLm93bmVySWQgPT09IHRoaXMuX2VkaXRvcklkIHx8IGNoYW5nZS5vd25lcklkID09PSAwKTtcblx0XHRcdFx0Ly8gcmVjcmVhdGUgdGhlIG1vZGVsIGV2ZW50IHVzaW5nIHRoZSBmaWx0ZXJlZCBjaGFuZ2VzXG5cdFx0XHRcdGlmIChmaWx0ZXJlZENoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkRXZlbnQgPSBuZXcgdGV4dE1vZGVsRXZlbnRzLk1vZGVsRm9udENoYW5nZWRFdmVudChmaWx0ZXJlZENoYW5nZXMpO1xuXHRcdFx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgTW9kZWxGb250Q2hhbmdlZEV2ZW50KGZpbHRlcmVkRXZlbnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VUb2tlbnMoKGUpID0+IHtcblx0XHRcdGNvbnN0IHZpZXdSYW5nZXM6IHsgZnJvbUxpbmVOdW1iZXI6IG51bWJlcjsgdG9MaW5lTnVtYmVyOiBudW1iZXIgfVtdID0gW107XG5cdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IGUucmFuZ2VzLmxlbmd0aDsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjb25zdCBtb2RlbFJhbmdlID0gZS5yYW5nZXNbal07XG5cdFx0XHRcdGNvbnN0IHZpZXdTdGFydExpbmVOdW1iZXIgPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKG1vZGVsUmFuZ2UuZnJvbUxpbmVOdW1iZXIsIDEpKS5saW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCB2aWV3RW5kTGluZU51bWJlciA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihuZXcgUG9zaXRpb24obW9kZWxSYW5nZS50b0xpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbFJhbmdlLnRvTGluZU51bWJlcikpKS5saW5lTnVtYmVyO1xuXHRcdFx0XHR2aWV3UmFuZ2VzW2pdID0ge1xuXHRcdFx0XHRcdGZyb21MaW5lTnVtYmVyOiB2aWV3U3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHRvTGluZU51bWJlcjogdmlld0VuZExpbmVOdW1iZXJcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0U2luZ2xlVmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQodmlld1JhbmdlcykpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbFRva2Vuc0NoYW5nZWRFdmVudChlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0xhbmd1YWdlQ29uZmlndXJhdGlvbkV2ZW50KCkpO1xuXHRcdFx0dGhpcy5jdXJzb3JDb25maWcgPSBuZXcgQ3Vyc29yQ29uZmlndXJhdGlvbih0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5tb2RlbC5nZXRPcHRpb25zKCksIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdXJzb3IudXBkYXRlQ29uZmlndXJhdGlvbih0aGlzLmN1cnNvckNvbmZpZyk7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlTGFuZ3VhZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMuY3Vyc29yQ29uZmlnID0gbmV3IEN1cnNvckNvbmZpZ3VyYXRpb24odGhpcy5tb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRoaXMubW9kZWwuZ2V0T3B0aW9ucygpLCB0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3Vyc29yLnVwZGF0ZUNvbmZpZ3VyYXRpb24odGhpcy5jdXJzb3JDb25maWcpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlT3B0aW9ucygoZSkgPT4ge1xuXHRcdFx0Ly8gQSB0YWIgc2l6ZSBjaGFuZ2UgY2F1c2VzIGEgbGluZSBtYXBwaW5nIGNoYW5nZWQgZXZlbnQgPT4gYWxsIHZpZXcgcGFydHMgd2lsbCByZXBhaW50IE9LLCBubyBmdXJ0aGVyIGV2ZW50IG5lZWRlZCBoZXJlXG5cdFx0XHRpZiAodGhpcy5fbGluZXMuc2V0VGFiU2l6ZSh0aGlzLm1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplKSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5iZWdpbkVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCgpKTtcblx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KG51bGwpKTtcblx0XHRcdFx0XHR0aGlzLl9jdXJzb3Iub25MaW5lTWFwcGluZ0NoYW5nZWQoZXZlbnRzQ29sbGVjdG9yKTtcblx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5vbkxpbmVNYXBwaW5nQ2hhbmdlZCgpO1xuXHRcdFx0XHRcdHRoaXMudmlld0xheW91dC5vbkZsdXNoZWQodGhpcy5nZXRMaW5lQ291bnQoKSwgdGhpcy5fZ2V0Q3VzdG9tTGluZUhlaWdodHMoKSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVuZEVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnQuc2NoZWR1bGUoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jdXJzb3JDb25maWcgPSBuZXcgQ3Vyc29yQ29uZmlndXJhdGlvbih0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5tb2RlbC5nZXRPcHRpb25zKCksIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdXJzb3IudXBkYXRlQ29uZmlndXJhdGlvbih0aGlzLmN1cnNvckNvbmZpZyk7XG5cblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKGUpID0+IHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLm9uTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWQoKTtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0U2luZ2xlVmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChlKSk7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQoZSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGlkZGVuQXJlYXNNb2RlbCA9IG5ldyBIaWRkZW5BcmVhc01vZGVsKCk7XG5cdHByaXZhdGUgcHJldmlvdXNIaWRkZW5BcmVhczogcmVhZG9ubHkgUmFuZ2VbXSA9IFtdO1xuXG5cdHB1YmxpYyBnZXRGb250U2l6ZUF0UG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IGFsbG93VmFyaWFibGVGb250cyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250cyk7XG5cdFx0aWYgKCFhbGxvd1ZhcmlhYmxlRm9udHMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBmb250RGVjb3JhdGlvbnMgPSB0aGlzLm1vZGVsLmdldEZvbnREZWNvcmF0aW9uc0luUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiksIHRoaXMuX2VkaXRvcklkKTtcblx0XHRsZXQgZm9udFNpemU6IHN0cmluZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS5mb250U2l6ZSArICdweCc7XG5cdFx0Zm9yIChjb25zdCBmb250RGVjb3JhdGlvbiBvZiBmb250RGVjb3JhdGlvbnMpIHtcblx0XHRcdGlmIChmb250RGVjb3JhdGlvbi5vcHRpb25zLmZvbnRTaXplKSB7XG5cdFx0XHRcdGZvbnRTaXplID0gZm9udERlY29yYXRpb24ub3B0aW9ucy5mb250U2l6ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmb250U2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0gZm9yY2VVcGRhdGUgSWYgdHJ1ZSwgdGhlIGhpZGRlbiBhcmVhcyB3aWxsIGJlIHVwZGF0ZWQgZXZlbiBpZiB0aGUgbmV3IHJhbmdlcyBhcmUgdGhlIHNhbWUgYXMgdGhlIHByZXZpb3VzIHJhbmdlcy5cblx0ICogVGhpcyBpcyBiZWNhdXNlIHRoZSBtb2RlbCBtaWdodCBoYXZlIGNoYW5nZWQsIHdoaWNoIHJlc2V0cyB0aGUgaGlkZGVuIGFyZWFzLCBidXQgbm90IHRoZSBsYXN0IGNhY2hlZCB2YWx1ZS5cblx0ICogVGhpcyBuZWVkcyBhIGJldHRlciBmaXggaW4gdGhlIGZ1dHVyZS5cblx0Ki9cblx0cHVibGljIHNldEhpZGRlbkFyZWFzKHJhbmdlczogUmFuZ2VbXSwgc291cmNlPzogdW5rbm93biwgZm9yY2VVcGRhdGU/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRkZW5BcmVhc01vZGVsLnNldEhpZGRlbkFyZWFzKHNvdXJjZSwgcmFuZ2VzKTtcblx0XHRjb25zdCBtZXJnZWRSYW5nZXMgPSB0aGlzLmhpZGRlbkFyZWFzTW9kZWwuZ2V0TWVyZ2VkUmFuZ2VzKCk7XG5cdFx0aWYgKG1lcmdlZFJhbmdlcyA9PT0gdGhpcy5wcmV2aW91c0hpZGRlbkFyZWFzICYmICFmb3JjZVVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucHJldmlvdXNIaWRkZW5BcmVhcyA9IG1lcmdlZFJhbmdlcztcblxuXHRcdGNvbnN0IHN0YWJsZVZpZXdwb3J0ID0gdGhpcy5fY2FwdHVyZVN0YWJsZVZpZXdwb3J0KCk7XG5cblx0XHRsZXQgbGluZU1hcHBpbmdDaGFuZ2VkID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5iZWdpbkVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0XHRsaW5lTWFwcGluZ0NoYW5nZWQgPSB0aGlzLl9saW5lcy5zZXRIaWRkZW5BcmVhcyhtZXJnZWRSYW5nZXMpO1xuXHRcdFx0aWYgKGxpbmVNYXBwaW5nQ2hhbmdlZCkge1xuXHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KCkpO1xuXHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3TGluZU1hcHBpbmdDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChudWxsKSk7XG5cdFx0XHRcdHRoaXMuX2N1cnNvci5vbkxpbmVNYXBwaW5nQ2hhbmdlZChldmVudHNDb2xsZWN0b3IpO1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5vbkxpbmVNYXBwaW5nQ2hhbmdlZCgpO1xuXHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25GbHVzaGVkKHRoaXMuZ2V0TGluZUNvdW50KCksIHRoaXMuX2dldEN1c3RvbUxpbmVIZWlnaHRzKCkpO1xuXHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25IZWlnaHRNYXliZUNoYW5nZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RNb2RlbExpbmVJblZpZXdQb3J0ID0gc3RhYmxlVmlld3BvcnQudmlld3BvcnRTdGFydE1vZGVsUG9zaXRpb24/LmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBmaXJzdE1vZGVsTGluZUlzSGlkZGVuID0gZmlyc3RNb2RlbExpbmVJblZpZXdQb3J0ICYmIG1lcmdlZFJhbmdlcy5zb21lKHJhbmdlID0+IHJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSBmaXJzdE1vZGVsTGluZUluVmlld1BvcnQgJiYgZmlyc3RNb2RlbExpbmVJblZpZXdQb3J0IDw9IHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKCFmaXJzdE1vZGVsTGluZUlzSGlkZGVuKSB7XG5cdFx0XHRcdHN0YWJsZVZpZXdwb3J0LnJlY292ZXJWaWV3cG9ydFN0YXJ0KHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIsIHRoaXMudmlld0xheW91dCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbmRFbWl0Vmlld0V2ZW50cygpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudC5zY2hlZHVsZSgpO1xuXG5cdFx0aWYgKGxpbmVNYXBwaW5nQ2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBIaWRkZW5BcmVhc0NoYW5nZWRFdmVudCgpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQmVsb3coKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCBsaW5lc0Fyb3VuZCA9IE1hdGgubWF4KDIwLCBNYXRoLnJvdW5kKGxheW91dEluZm8uaGVpZ2h0IC8gbGluZUhlaWdodCkpO1xuXHRcdGNvbnN0IHBhcnRpYWxEYXRhID0gdGhpcy52aWV3TGF5b3V0LmdldExpbmVzVmlld3BvcnREYXRhKCk7XG5cdFx0Y29uc3Qgc3RhcnRWaWV3TGluZU51bWJlciA9IE1hdGgubWF4KDEsIHBhcnRpYWxEYXRhLmNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyIC0gbGluZXNBcm91bmQpO1xuXHRcdGNvbnN0IGVuZFZpZXdMaW5lTnVtYmVyID0gTWF0aC5taW4odGhpcy5nZXRMaW5lQ291bnQoKSwgcGFydGlhbERhdGEuY29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyICsgbGluZXNBcm91bmQpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3RvTW9kZWxWaXNpYmxlUmFuZ2VzKG5ldyBSYW5nZShcblx0XHRcdHN0YXJ0Vmlld0xpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1pbkNvbHVtbihzdGFydFZpZXdMaW5lTnVtYmVyKSxcblx0XHRcdGVuZFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kVmlld0xpbmVOdW1iZXIpXG5cdFx0KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlcygpOiBSYW5nZVtdIHtcblx0XHRjb25zdCB2aXNpYmxlVmlld1JhbmdlID0gdGhpcy5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSgpO1xuXHRcdHJldHVybiB0aGlzLl90b01vZGVsVmlzaWJsZVJhbmdlcyh2aXNpYmxlVmlld1JhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRIaWRkZW5BcmVhcygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0SGlkZGVuQXJlYXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvTW9kZWxWaXNpYmxlUmFuZ2VzKHZpc2libGVWaWV3UmFuZ2U6IFJhbmdlKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHZpc2libGVWaWV3UmFuZ2UpO1xuXHRcdGNvbnN0IGhpZGRlbkFyZWFzID0gdGhpcy5fbGluZXMuZ2V0SGlkZGVuQXJlYXMoKTtcblxuXHRcdGlmIChoaWRkZW5BcmVhcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbdmlzaWJsZVJhbmdlXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFJhbmdlW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gdmlzaWJsZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRsZXQgc3RhcnRDb2x1bW4gPSB2aXNpYmxlUmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHZpc2libGVSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IHZpc2libGVSYW5nZS5lbmRDb2x1bW47XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGhpZGRlbkFyZWFzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBoaWRkZW5TdGFydExpbmVOdW1iZXIgPSBoaWRkZW5BcmVhc1tpXS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBoaWRkZW5FbmRMaW5lTnVtYmVyID0gaGlkZGVuQXJlYXNbaV0uZW5kTGluZU51bWJlcjtcblxuXHRcdFx0aWYgKGhpZGRlbkVuZExpbmVOdW1iZXIgPCBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGlkZGVuU3RhcnRMaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8IGhpZGRlblN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IFJhbmdlKFxuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0aGlkZGVuU3RhcnRMaW5lTnVtYmVyIC0gMSwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGhpZGRlblN0YXJ0TGluZU51bWJlciAtIDEpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPSBoaWRkZW5FbmRMaW5lTnVtYmVyICsgMTtcblx0XHRcdHN0YXJ0Q29sdW1uID0gMTtcblx0XHR9XG5cblx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyIDwgZW5kTGluZU51bWJlciB8fCAoc3RhcnRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyICYmIHN0YXJ0Q29sdW1uIDwgZW5kQ29sdW1uKSkge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSYW5nZShcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlciwgZW5kQ29sdW1uXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UoKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHBhcnRpYWxEYXRhID0gdGhpcy52aWV3TGF5b3V0LmdldExpbmVzVmlld3BvcnREYXRhKCk7XG5cdFx0Y29uc3Qgc3RhcnRWaWV3TGluZU51bWJlciA9IHBhcnRpYWxEYXRhLmNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZFZpZXdMaW5lTnVtYmVyID0gcGFydGlhbERhdGEuY29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyO1xuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRcdHN0YXJ0Vmlld0xpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1pbkNvbHVtbihzdGFydFZpZXdMaW5lTnVtYmVyKSxcblx0XHRcdGVuZFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kVmlld0xpbmVOdW1iZXIpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZUF0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHBhcnRpYWxEYXRhID0gdGhpcy52aWV3TGF5b3V0LmdldExpbmVzVmlld3BvcnREYXRhQXRTY3JvbGxUb3Aoc2Nyb2xsVG9wKTtcblx0XHRjb25zdCBzdGFydFZpZXdMaW5lTnVtYmVyID0gcGFydGlhbERhdGEuY29tcGxldGVseVZpc2libGVTdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kVmlld0xpbmVOdW1iZXIgPSBwYXJ0aWFsRGF0YS5jb21wbGV0ZWx5VmlzaWJsZUVuZExpbmVOdW1iZXI7XG5cblx0XHRyZXR1cm4gbmV3IFJhbmdlKFxuXHRcdFx0c3RhcnRWaWV3TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWluQ29sdW1uKHN0YXJ0Vmlld0xpbmVOdW1iZXIpLFxuXHRcdFx0ZW5kVmlld0xpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1heENvbHVtbihlbmRWaWV3TGluZU51bWJlcilcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgYGN1cnNvclN1cnJvdW5kaW5nTGluZXNgIGFuZCBgc3RpY2t5U2Nyb2xsYCBwYWRkaW5nIHRvIHRoZSBnaXZlbiB2aWV3IHJhbmdlLlxuXHQgKi9cblx0cHVibGljIGdldFZpZXdSYW5nZVdpdGhDdXJzb3JQYWRkaW5nKHZpZXdSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBjdXJzb3JTdXJyb3VuZGluZ0xpbmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmN1cnNvclN1cnJvdW5kaW5nTGluZXMpO1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpO1xuXG5cdFx0bGV0IHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyIH0gPSB2aWV3UmFuZ2U7XG5cdFx0Y29uc3QgcGFkZGluZyA9IE1hdGgubWluKFxuXHRcdFx0TWF0aC5tYXgoY3Vyc29yU3Vycm91bmRpbmdMaW5lcywgc3RpY2t5U2Nyb2xsLmVuYWJsZWQgPyBzdGlja3lTY3JvbGwubWF4TGluZUNvdW50IDogMCksXG5cdFx0XHRNYXRoLmZsb29yKChlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMSkgLyAyKSk7XG5cblx0XHRzdGFydExpbmVOdW1iZXIgKz0gcGFkZGluZztcblx0XHRlbmRMaW5lTnVtYmVyIC09IE1hdGgubWF4KDAsIHBhZGRpbmcgLSAxKTtcblxuXHRcdGlmIChwYWRkaW5nID09PSAwIHx8IHN0YXJ0TGluZU51bWJlciA+IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiB2aWV3UmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRcdHN0YXJ0TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWluQ29sdW1uKHN0YXJ0TGluZU51bWJlciksXG5cdFx0XHRlbmRMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcilcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHNhdmVTdGF0ZSgpOiBJVmlld1N0YXRlIHtcblx0XHRjb25zdCBjb21wYXRWaWV3U3RhdGUgPSB0aGlzLnZpZXdMYXlvdXQuc2F2ZVN0YXRlKCk7XG5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSBjb21wYXRWaWV3U3RhdGUuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IGZpcnN0Vmlld0xpbmVOdW1iZXIgPSB0aGlzLnZpZXdMYXlvdXQuZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQoc2Nyb2xsVG9wKTtcblx0XHRjb25zdCBmaXJzdFBvc2l0aW9uID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihmaXJzdFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNaW5Db2x1bW4oZmlyc3RWaWV3TGluZU51bWJlcikpKTtcblx0XHRjb25zdCBmaXJzdFBvc2l0aW9uRGVsdGFUb3AgPSB0aGlzLnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGZpcnN0Vmlld0xpbmVOdW1iZXIpIC0gc2Nyb2xsVG9wO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbExlZnQ6IGNvbXBhdFZpZXdTdGF0ZS5zY3JvbGxMZWZ0LFxuXHRcdFx0Zmlyc3RQb3NpdGlvbjogZmlyc3RQb3NpdGlvbixcblx0XHRcdGZpcnN0UG9zaXRpb25EZWx0YVRvcDogZmlyc3RQb3NpdGlvbkRlbHRhVG9wXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZWR1Y2VSZXN0b3JlU3RhdGUoc3RhdGU6IElWaWV3U3RhdGUpOiB7IHNjcm9sbExlZnQ6IG51bWJlcjsgc2Nyb2xsVG9wOiBudW1iZXIgfSB7XG5cdFx0aWYgKHR5cGVvZiBzdGF0ZS5maXJzdFBvc2l0aW9uID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gVGhpcyBpcyBhIHZpZXcgc3RhdGUgc2VyaWFsaXplZCBieSBhbiBvbGRlciB2ZXJzaW9uXG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVkdWNlUmVzdG9yZVN0YXRlQ29tcGF0aWJpbGl0eShzdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxQb3NpdGlvbiA9IHRoaXMubW9kZWwudmFsaWRhdGVQb3NpdGlvbihzdGF0ZS5maXJzdFBvc2l0aW9uKTtcblx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxQb3NpdGlvbik7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlcikgLSBzdGF0ZS5maXJzdFBvc2l0aW9uRGVsdGFUb3A7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNjcm9sbExlZnQ6IHN0YXRlLnNjcm9sbExlZnQsXG5cdFx0XHRzY3JvbGxUb3A6IHNjcm9sbFRvcFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZWR1Y2VSZXN0b3JlU3RhdGVDb21wYXRpYmlsaXR5KHN0YXRlOiBJVmlld1N0YXRlKTogeyBzY3JvbGxMZWZ0OiBudW1iZXI7IHNjcm9sbFRvcDogbnVtYmVyIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxMZWZ0OiBzdGF0ZS5zY3JvbGxMZWZ0LFxuXHRcdFx0c2Nyb2xsVG9wOiBzdGF0ZS5zY3JvbGxUb3BXaXRob3V0Vmlld1pvbmVzIVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYlNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVDb3VudCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVzIGEgaGludCB0aGF0IGEgbG90IG9mIHJlcXVlc3RzIGFyZSBhYm91dCB0byBjb21lIGluIGZvciB0aGVzZSBsaW5lIG51bWJlcnMuXG5cdCAqL1xuXHRwdWJsaWMgc2V0Vmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgY2VudGVyZWRMaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3cG9ydFN0YXJ0LnVwZGF0ZSh0aGlzLCBzdGFydExpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldEFjdGl2ZUluZGVudEd1aWRlKGxpbmVOdW1iZXI6IG51bWJlciwgbWluTGluZU51bWJlcjogbnVtYmVyLCBtYXhMaW5lTnVtYmVyOiBudW1iZXIpOiBJQWN0aXZlSW5kZW50R3VpZGVJbmZvIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0QWN0aXZlSW5kZW50R3VpZGUobGluZU51bWJlciwgbWluTGluZU51bWJlciwgbWF4TGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNJbmRlbnRHdWlkZXMoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QnJhY2tldEd1aWRlc0luUmFuZ2VCeUxpbmUoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgYWN0aXZlUG9zaXRpb246IElQb3NpdGlvbiB8IG51bGwsIG9wdGlvbnM6IEJyYWNrZXRHdWlkZU9wdGlvbnMpOiBJbmRlbnRHdWlkZVtdW10ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRWaWV3TGluZXNCcmFja2V0R3VpZGVzKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgYWN0aXZlUG9zaXRpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVNaW5Db2x1bW4obGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRWaWV3TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleCh0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKTtcblx0XHRpZiAocmVzdWx0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQgKyAxO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCh0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKTtcblx0XHRpZiAocmVzdWx0ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQgKyAyO1xuXHR9XG5cblx0cHVibGljIGdldE1pbmltYXBEZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IFJhbmdlKTogVmlld01vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0TWluaW1hcERlY29yYXRpb25zSW5SYW5nZShyYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbnNJblZpZXdwb3J0KHZpc2libGVSYW5nZTogUmFuZ2UpOiBWaWV3TW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9ucy5nZXREZWNvcmF0aW9uc1ZpZXdwb3J0RGF0YSh2aXNpYmxlUmFuZ2UpLmRlY29yYXRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldEluamVjdGVkVGV4dEF0KHZpZXdQb3NpdGlvbjogUG9zaXRpb24pOiBJbmplY3RlZFRleHQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0SW5qZWN0ZWRUZXh0QXQodmlld1Bvc2l0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRleHREaXJlY3Rpb24obGluZU51bWJlcjogbnVtYmVyLCBkZWNvcmF0aW9uczogVmlld01vZGVsRGVjb3JhdGlvbltdKTogVGV4dERpcmVjdGlvbiB7XG5cdFx0bGV0IHJ0bENvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBkZWNvcmF0aW9uLnJhbmdlO1xuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IGxpbmVOdW1iZXIgfHwgcmFuZ2UuZW5kTGluZU51bWJlciA8IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0RGlyZWN0aW9uID0gZGVjb3JhdGlvbi5vcHRpb25zLnRleHREaXJlY3Rpb247XG5cdFx0XHRpZiAodGV4dERpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEwpIHtcblx0XHRcdFx0cnRsQ291bnQrKztcblx0XHRcdH0gZWxzZSBpZiAodGV4dERpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5MVFIpIHtcblx0XHRcdFx0cnRsQ291bnQtLTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcnRsQ291bnQgPiAwID8gVGV4dERpcmVjdGlvbi5SVEwgOiBUZXh0RGlyZWN0aW9uLkxUUjtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZXh0RGlyZWN0aW9uKGxpbmVOdW1iZXI6IG51bWJlcik6IFRleHREaXJlY3Rpb24ge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zQ29sbGVjdGlvbiA9IHRoaXMuX2RlY29yYXRpb25zLmdldERlY29yYXRpb25zT25MaW5lKGxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRUZXh0RGlyZWN0aW9uKGxpbmVOdW1iZXIsIGRlY29yYXRpb25zQ29sbGVjdGlvbi5kZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld3BvcnRWaWV3TGluZVJlbmRlcmluZ0RhdGEodmlzaWJsZVJhbmdlOiBSYW5nZSwgbGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVSZW5kZXJpbmdEYXRhIHtcblx0XHRjb25zdCB2aWV3cG9ydERlY29yYXRpb25zQ29sbGVjdGlvbiA9IHRoaXMuX2RlY29yYXRpb25zLmdldERlY29yYXRpb25zVmlld3BvcnREYXRhKHZpc2libGVSYW5nZSk7XG5cdFx0Y29uc3QgcmVsYXRpdmVMaW5lTnVtYmVyID0gbGluZU51bWJlciAtIHZpc2libGVSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgaW5saW5lRGVjb3JhdGlvbnMgPSB2aWV3cG9ydERlY29yYXRpb25zQ29sbGVjdGlvbi5pbmxpbmVEZWNvcmF0aW9uc1tyZWxhdGl2ZUxpbmVOdW1iZXJdO1xuXHRcdGNvbnN0IGhhc1ZhcmlhYmxlRm9udHMgPSB2aWV3cG9ydERlY29yYXRpb25zQ29sbGVjdGlvbi5oYXNWYXJpYWJsZUZvbnRzW3JlbGF0aXZlTGluZU51bWJlcl07XG5cdFx0cmV0dXJuIHRoaXMuX2dldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyLCBpbmxpbmVEZWNvcmF0aW9ucywgaGFzVmFyaWFibGVGb250cywgdmlld3BvcnREZWNvcmF0aW9uc0NvbGxlY3Rpb24uZGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyOiBudW1iZXIpOiBWaWV3TGluZVJlbmRlcmluZ0RhdGEge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zQ29sbGVjdGlvbiA9IHRoaXMuX2RlY29yYXRpb25zLmdldERlY29yYXRpb25zT25MaW5lKGxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlciwgZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmlubGluZURlY29yYXRpb25zWzBdLCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24uaGFzVmFyaWFibGVGb250c1swXSwgZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmRlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdMaW5lUmVuZGVyaW5nRGF0YShsaW5lTnVtYmVyOiBudW1iZXIsIGlubGluZURlY29yYXRpb25zOiBJbmxpbmVEZWNvcmF0aW9uW10sIGhhc1ZhcmlhYmxlRm9udHM6IGJvb2xlYW4sIGRlY29yYXRpb25zOiBWaWV3TW9kZWxEZWNvcmF0aW9uW10pOiBWaWV3TGluZVJlbmRlcmluZ0RhdGEge1xuXHRcdGNvbnN0IG1pZ2h0Q29udGFpblJUTCA9IHRoaXMubW9kZWwubWlnaHRDb250YWluUlRMKCk7XG5cdFx0Y29uc3QgbWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSA9IHRoaXMubW9kZWwubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpO1xuXHRcdGNvbnN0IHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcblx0XHRjb25zdCBsaW5lRGF0YSA9IHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lRGF0YShsaW5lTnVtYmVyKTtcblxuXHRcdGlmIChsaW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0aW5saW5lRGVjb3JhdGlvbnMgPSBbXG5cdFx0XHRcdC4uLmlubGluZURlY29yYXRpb25zLFxuXHRcdFx0XHQuLi5saW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9uc1xuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFZpZXdMaW5lUmVuZGVyaW5nRGF0YShcblx0XHRcdGxpbmVEYXRhLm1pbkNvbHVtbixcblx0XHRcdGxpbmVEYXRhLm1heENvbHVtbixcblx0XHRcdGxpbmVEYXRhLmNvbnRlbnQsXG5cdFx0XHRsaW5lRGF0YS5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUsXG5cdFx0XHRtaWdodENvbnRhaW5SVEwsXG5cdFx0XHRtaWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJLFxuXHRcdFx0bGluZURhdGEudG9rZW5zLFxuXHRcdFx0aW5saW5lRGVjb3JhdGlvbnMsXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0bGluZURhdGEuc3RhcnRWaXNpYmxlQ29sdW1uLFxuXHRcdFx0dGhpcy5fZ2V0VGV4dERpcmVjdGlvbihsaW5lTnVtYmVyLCBkZWNvcmF0aW9ucyksXG5cdFx0XHRoYXNWYXJpYWJsZUZvbnRzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZURhdGEobGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVEYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVEYXRhKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbmVlZGVkOiBib29sZWFuW10pOiBNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9saW5lcy5nZXRWaWV3TGluZXNEYXRhKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbmVlZGVkKTtcblx0XHRyZXR1cm4gbmV3IE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoXG5cdFx0XHR0aGlzLmdldFRhYlNpemUoKSxcblx0XHRcdHJlc3VsdFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKHRoZW1lOiBFZGl0b3JUaGVtZSk6IE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwW10ge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5tb2RlbC5nZXRPdmVydmlld1J1bGVyRGVjb3JhdGlvbnModGhpcy5fZWRpdG9ySWQsIGZpbHRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyh0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMpLCBmaWx0ZXJGb250RGVjb3JhdGlvbnModGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbk9wdGlvbnMgPSA8TW9kZWxEZWNvcmF0aW9uT3B0aW9ucz5kZWNvcmF0aW9uLm9wdGlvbnM7XG5cdFx0XHRjb25zdCBvcHRzID0gZGVjb3JhdGlvbk9wdGlvbnMub3ZlcnZpZXdSdWxlcjtcblx0XHRcdGlmICghb3B0cykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhbmUgPSA8bnVtYmVyPm9wdHMucG9zaXRpb247XG5cdFx0XHRpZiAobGFuZSA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbG9yID0gb3B0cy5nZXRDb2xvcih0aGVtZS52YWx1ZSk7XG5cdFx0XHRjb25zdCB2aWV3U3RhcnRMaW5lTnVtYmVyID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5nZXRWaWV3TGluZU51bWJlck9mTW9kZWxQb3NpdGlvbihkZWNvcmF0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZGVjb3JhdGlvbi5yYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHRjb25zdCB2aWV3RW5kTGluZU51bWJlciA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuZ2V0Vmlld0xpbmVOdW1iZXJPZk1vZGVsUG9zaXRpb24oZGVjb3JhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyLCBkZWNvcmF0aW9uLnJhbmdlLmVuZENvbHVtbik7XG5cblx0XHRcdHJlc3VsdC5hY2NlcHQoY29sb3IsIGRlY29yYXRpb25PcHRpb25zLnpJbmRleCwgdmlld1N0YXJ0TGluZU51bWJlciwgdmlld0VuZExpbmVOdW1iZXIsIGxhbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LmFzQXJyYXk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlRGVjb3JhdGlvbnNDb2xvckNhY2hlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5tb2RlbC5nZXRPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IG9wdHMxID0gPE1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zPmRlY29yYXRpb24ub3B0aW9ucy5vdmVydmlld1J1bGVyO1xuXHRcdFx0b3B0czE/LmludmFsaWRhdGVDYWNoZWRDb2xvcigpO1xuXHRcdFx0Y29uc3Qgb3B0czIgPSA8TW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnM+ZGVjb3JhdGlvbi5vcHRpb25zLm1pbmltYXA7XG5cdFx0XHRvcHRzMj8uaW52YWxpZGF0ZUNhY2hlZENvbG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZhbHVlSW5SYW5nZShyYW5nZTogUmFuZ2UsIGVvbDogRW5kT2ZMaW5lUHJlZmVyZW5jZSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWxSYW5nZSA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZShyYW5nZSk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0VmFsdWVJblJhbmdlKG1vZGVsUmFuZ2UsIGVvbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHJhbmdlOiBSYW5nZSwgZW9sOiBFbmRPZkxpbmVQcmVmZXJlbmNlKTogbnVtYmVyIHtcblx0XHRjb25zdCBtb2RlbFJhbmdlID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1JhbmdlVG9Nb2RlbFJhbmdlKHJhbmdlKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobW9kZWxSYW5nZSwgZW9sKTtcblx0fVxuXG5cdHB1YmxpYyBtb2RpZnlQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24sIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGNvbnN0IHJlc3VsdE1vZGVsUG9zaXRpb24gPSB0aGlzLm1vZGVsLm1vZGlmeVBvc2l0aW9uKG1vZGVsUG9zaXRpb24sIG9mZnNldCk7XG5cdFx0cmV0dXJuIHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihyZXN1bHRNb2RlbFBvc2l0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBkZWR1Y2VNb2RlbFBvc2l0aW9uUmVsYXRpdmVUb1ZpZXdQb3NpdGlvbih2aWV3QW5jaG9yUG9zaXRpb246IFBvc2l0aW9uLCBkZWx0YU9mZnNldDogbnVtYmVyLCBsaW5lRmVlZENudDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IG1vZGVsQW5jaG9yID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHZpZXdBbmNob3JQb3NpdGlvbik7XG5cdFx0aWYgKHRoaXMubW9kZWwuZ2V0RU9MKCkubGVuZ3RoID09PSAyKSB7XG5cdFx0XHQvLyBUaGlzIG1vZGVsIHVzZXMgQ1JMRiwgc28gdGhlIGRlbHRhIG11c3QgdGFrZSB0aGF0IGludG8gYWNjb3VudFxuXHRcdFx0aWYgKGRlbHRhT2Zmc2V0IDwgMCkge1xuXHRcdFx0XHRkZWx0YU9mZnNldCAtPSBsaW5lRmVlZENudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlbHRhT2Zmc2V0ICs9IGxpbmVGZWVkQ250O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsQW5jaG9yT2Zmc2V0ID0gdGhpcy5tb2RlbC5nZXRPZmZzZXRBdChtb2RlbEFuY2hvcik7XG5cdFx0Y29uc3QgcmVzdWx0T2Zmc2V0ID0gbW9kZWxBbmNob3JPZmZzZXQgKyBkZWx0YU9mZnNldDtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRQb3NpdGlvbkF0KHJlc3VsdE9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UGxhaW5UZXh0VG9Db3B5KG1vZGVsUmFuZ2VzOiBSYW5nZVtdLCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZDogYm9vbGVhbiwgZm9yY2VDUkxGOiBib29sZWFuKTogeyBzb3VyY2VSYW5nZXM6IFJhbmdlW107IHNvdXJjZVRleHQ6IHN0cmluZyB8IHN0cmluZ1tdIH0ge1xuXHRcdGNvbnN0IG5ld0xpbmVDaGFyYWN0ZXIgPSBmb3JjZUNSTEYgPyAnXFxyXFxuJyA6IHRoaXMubW9kZWwuZ2V0RU9MKCk7XG5cblx0XHRtb2RlbFJhbmdlcyA9IG1vZGVsUmFuZ2VzLnNsaWNlKDApO1xuXHRcdG1vZGVsUmFuZ2VzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblxuXHRcdGxldCBoYXNFbXB0eVJhbmdlID0gZmFsc2U7XG5cdFx0bGV0IGhhc05vbkVtcHR5UmFuZ2UgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIG1vZGVsUmFuZ2VzKSB7XG5cdFx0XHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGhhc0VtcHR5UmFuZ2UgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzTm9uRW1wdHlSYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFoYXNOb25FbXB0eVJhbmdlICYmICFlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCkge1xuXHRcdFx0Ly8gYWxsIHJhbmdlcyBhcmUgZW1wdHlcblx0XHRcdHJldHVybiB7IHNvdXJjZVJhbmdlczogW10sIHNvdXJjZVRleHQ6ICcnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHB1c2hSYW5nZSA9IChtb2RlbFJhbmdlOiBSYW5nZSwgYXBwZW5kOiBzdHJpbmcgPSAnJykgPT4ge1xuXHRcdFx0cmFuZ2VzLnB1c2gobW9kZWxSYW5nZSk7XG5cdFx0XHRyZXN1bHQucHVzaCh0aGlzLm1vZGVsLmdldFZhbHVlSW5SYW5nZShtb2RlbFJhbmdlLCBmb3JjZUNSTEYgPyBFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYgOiBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSArIGFwcGVuZCk7XG5cdFx0fTtcblxuXHRcdGlmIChoYXNFbXB0eVJhbmdlICYmIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKSB7XG5cdFx0XHQvLyBzb21lIChtYXliZSBhbGwpIGVtcHR5IHNlbGVjdGlvbnNcblx0XHRcdGxldCBwcmV2TW9kZWxMaW5lTnVtYmVyID0gMDtcblx0XHRcdGZvciAoY29uc3QgbW9kZWxSYW5nZSBvZiBtb2RlbFJhbmdlcykge1xuXHRcdFx0XHRjb25zdCBtb2RlbExpbmVOdW1iZXIgPSBtb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0aWYgKG1vZGVsUmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGVsTGluZU51bWJlciAhPT0gcHJldk1vZGVsTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cHVzaFJhbmdlKG5ldyBSYW5nZShtb2RlbExpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1pbkNvbHVtbihtb2RlbExpbmVOdW1iZXIpLCBtb2RlbExpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbExpbmVOdW1iZXIpKSwgbmV3TGluZUNoYXJhY3Rlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHB1c2hSYW5nZShtb2RlbFJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcmV2TW9kZWxMaW5lTnVtYmVyID0gbW9kZWxMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsUmFuZ2Ugb2YgbW9kZWxSYW5nZXMpIHtcblx0XHRcdFx0aWYgKCFtb2RlbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdHB1c2hSYW5nZShtb2RlbFJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHNvdXJjZVJhbmdlczogcmFuZ2VzLCBzb3VyY2VUZXh0OiByZXN1bHQubGVuZ3RoID09PSAxID8gcmVzdWx0WzBdIDogcmVzdWx0IH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmljaFRleHRUb0NvcHkobW9kZWxSYW5nZXM6IFJhbmdlW10sIGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiBib29sZWFuKTogeyBodG1sOiBzdHJpbmc7IG1vZGU6IHN0cmluZyB9IHwgbnVsbCB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMubW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdGlmIChsYW5ndWFnZUlkID09PSBQTEFJTlRFWFRfTEFOR1VBR0VfSUQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbFJhbmdlcy5sZW5ndGggIT09IDEpIHtcblx0XHRcdC8vIG5vIG11bHRpcGxlIHNlbGVjdGlvbiBzdXBwb3J0IGF0IHRoaXMgdGltZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHJhbmdlID0gbW9kZWxSYW5nZXNbMF07XG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0aWYgKCFlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCkge1xuXHRcdFx0XHQvLyBub3RoaW5nIHRvIGNvcHlcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UobGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXIpLCBsaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gdGhpcy5fZ2V0Q29sb3JNYXAoKTtcblx0XHRjb25zdCBoYXNCYWRDaGFycyA9ICgvWzo7XFxcXFxcLzw+XS8udGVzdChmb250SW5mby5mb250RmFtaWx5KSk7XG5cdFx0Y29uc3QgdXNlRGVmYXVsdEZvbnRGYW1pbHkgPSAoaGFzQmFkQ2hhcnMgfHwgZm9udEluZm8uZm9udEZhbWlseSA9PT0gRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSk7XG5cdFx0bGV0IGZvbnRGYW1pbHk6IHN0cmluZztcblx0XHRpZiAodXNlRGVmYXVsdEZvbnRGYW1pbHkpIHtcblx0XHRcdGZvbnRGYW1pbHkgPSBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb250RmFtaWx5ID0gZm9udEluZm8uZm9udEZhbWlseTtcblx0XHRcdGZvbnRGYW1pbHkgPSBmb250RmFtaWx5LnJlcGxhY2UoL1wiL2csICdcXCcnKTtcblx0XHRcdGNvbnN0IGhhc1F1b3Rlc09ySXNMaXN0ID0gL1ssJ10vLnRlc3QoZm9udEZhbWlseSk7XG5cdFx0XHRpZiAoIWhhc1F1b3Rlc09ySXNMaXN0KSB7XG5cdFx0XHRcdGNvbnN0IG5lZWRzUXVvdGVzID0gL1srIF0vLnRlc3QoZm9udEZhbWlseSk7XG5cdFx0XHRcdGlmIChuZWVkc1F1b3Rlcykge1xuXHRcdFx0XHRcdGZvbnRGYW1pbHkgPSBgJyR7Zm9udEZhbWlseX0nYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9udEZhbWlseSA9IGAke2ZvbnRGYW1pbHl9LCAke0VESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHl9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kZTogbGFuZ3VhZ2VJZCxcblx0XHRcdGh0bWw6IChcblx0XHRcdFx0YDxkaXYgc3R5bGU9XCJgXG5cdFx0XHRcdCsgYGNvbG9yOiAke2NvbG9yTWFwW0NvbG9ySWQuRGVmYXVsdEZvcmVncm91bmRdfTtgXG5cdFx0XHRcdCsgYGJhY2tncm91bmQtY29sb3I6ICR7Y29sb3JNYXBbQ29sb3JJZC5EZWZhdWx0QmFja2dyb3VuZF19O2Bcblx0XHRcdFx0KyBgZm9udC1mYW1pbHk6ICR7Zm9udEZhbWlseX07YFxuXHRcdFx0XHQrIGBmb250LXdlaWdodDogJHtmb250SW5mby5mb250V2VpZ2h0fTtgXG5cdFx0XHRcdCsgYGZvbnQtc2l6ZTogJHtmb250SW5mby5mb250U2l6ZX1weDtgXG5cdFx0XHRcdCsgYGxpbmUtaGVpZ2h0OiAke2ZvbnRJbmZvLmxpbmVIZWlnaHR9cHg7YFxuXHRcdFx0XHQrIGB3aGl0ZS1zcGFjZTogcHJlO2Bcblx0XHRcdFx0KyBgXCI+YFxuXHRcdFx0XHQrIHRoaXMuX2dldEhUTUxUb0NvcHkocmFuZ2UsIGNvbG9yTWFwKVxuXHRcdFx0XHQrICc8L2Rpdj4nXG5cdFx0XHQpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEhUTUxUb0NvcHkobW9kZWxSYW5nZTogUmFuZ2UsIGNvbG9yTWFwOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gbW9kZWxSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBtb2RlbFJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBtb2RlbFJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gbW9kZWxSYW5nZS5lbmRDb2x1bW47XG5cblx0XHRjb25zdCB0YWJTaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMubW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IGxpbmVUb2tlbnMuZ2V0TGluZUNvbnRlbnQoKTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gKGxpbmVOdW1iZXIgPT09IHN0YXJ0TGluZU51bWJlciA/IHN0YXJ0Q29sdW1uIC0gMSA6IDApO1xuXHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gKGxpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgPyBlbmRDb2x1bW4gLSAxIDogbGluZUNvbnRlbnQubGVuZ3RoKTtcblxuXHRcdFx0aWYgKGxpbmVDb250ZW50ID09PSAnJykge1xuXHRcdFx0XHRyZXN1bHQgKz0gJzxicj4nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0ICs9IHRva2VuaXplTGluZVRvSFRNTChsaW5lQ29udGVudCwgbGluZVRva2Vucy5pbmZsYXRlKCksIGNvbG9yTWFwLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCB0YWJTaXplLCBwbGF0Zm9ybS5pc1dpbmRvd3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb2xvck1hcCgpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbJyMwMDAwMDAnXTtcblx0XHRpZiAoY29sb3JNYXApIHtcblx0XHRcdGZvciAobGV0IGkgPSAxLCBsZW4gPSBjb2xvck1hcC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRyZXN1bHRbaV0gPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleChjb2xvck1hcFtpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNyZWdpb24gY3Vyc29yIG9wZXJhdGlvbnNcblxuXHRwdWJsaWMgZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCk6IEN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldFByaW1hcnlDdXJzb3JTdGF0ZSgpO1xuXHR9XG5cdHB1YmxpYyBnZXRMYXN0QWRkZWRDdXJzb3JJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0TGFzdEFkZGVkQ3Vyc29ySW5kZXgoKTtcblx0fVxuXHRwdWJsaWMgZ2V0Q3Vyc29yU3RhdGVzKCk6IEN1cnNvclN0YXRlW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0Q3Vyc29yU3RhdGVzKCk7XG5cdH1cblx0cHVibGljIHNldEN1cnNvclN0YXRlcyhzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHJlYXNvbjogQ3Vyc29yQ2hhbmdlUmVhc29uLCBzdGF0ZXM6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcihldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLnNldFN0YXRlcyhldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgcmVhc29uLCBzdGF0ZXMpKTtcblx0fVxuXHRwdWJsaWMgZ2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YSgpOiBJQ29sdW1uU2VsZWN0RGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvci5nZXRDdXJzb3JDb2x1bW5TZWxlY3REYXRhKCk7XG5cdH1cblx0cHVibGljIGdldEN1cnNvckF1dG9DbG9zZWRDaGFyYWN0ZXJzKCk6IFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnMoKTtcblx0fVxuXHRwdWJsaWMgc2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YShjb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnNvci5zZXRDdXJzb3JDb2x1bW5TZWxlY3REYXRhKGNvbHVtblNlbGVjdERhdGEpO1xuXHR9XG5cdHB1YmxpYyBnZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoKTogRWRpdE9wZXJhdGlvblR5cGUge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCk7XG5cdH1cblx0cHVibGljIHNldFByZXZFZGl0T3BlcmF0aW9uVHlwZSh0eXBlOiBFZGl0T3BlcmF0aW9uVHlwZSk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnNvci5zZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUodHlwZSk7XG5cdH1cblx0cHVibGljIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0U2VsZWN0aW9uKCk7XG5cdH1cblx0cHVibGljIGdldFNlbGVjdGlvbnMoKTogU2VsZWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0U2VsZWN0aW9ucygpO1xuXHR9XG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvci5nZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKS5tb2RlbFN0YXRlLnBvc2l0aW9uO1xuXHR9XG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25zKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgc2VsZWN0aW9uczogcmVhZG9ubHkgSVNlbGVjdGlvbltdLCByZWFzb24gPSBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5zZXRTZWxlY3Rpb25zKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBzZWxlY3Rpb25zLCByZWFzb24pKTtcblx0fVxuXHRwdWJsaWMgc2F2ZUN1cnNvclN0YXRlKCk6IElDdXJzb3JTdGF0ZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLnNhdmVTdGF0ZSgpO1xuXHR9XG5cdHB1YmxpYyByZXN0b3JlQ3Vyc29yU3RhdGUoc3RhdGVzOiBJQ3Vyc29yU3RhdGVbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IucmVzdG9yZVN0YXRlKGV2ZW50c0NvbGxlY3Rvciwgc3RhdGVzKSk7XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlQ3Vyc29yRWRpdChjYWxsYmFjazogKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnNvci5jb250ZXh0LmN1cnNvckNvbmZpZy5yZWFkT25seSkge1xuXHRcdFx0Ly8gd2UgY2Fubm90IGVkaXQgd2hlbiByZWFkIG9ubHkuLi5cblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgUmVhZE9ubHlFZGl0QXR0ZW1wdEV2ZW50KCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcihjYWxsYmFjayk7XG5cdH1cblx0cHVibGljIGV4ZWN1dGVFZGl0cyhzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY3Vyc29yU3RhdGVDb21wdXRlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXIsIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IuZXhlY3V0ZUVkaXRzKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBlZGl0cywgY3Vyc29yU3RhdGVDb21wdXRlciwgcmVhc29uKSk7XG5cdH1cblx0cHVibGljIHN0YXJ0Q29tcG9zaXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUN1cnNvckVkaXQoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5zdGFydENvbXBvc2l0aW9uKGV2ZW50c0NvbGxlY3RvcikpO1xuXHR9XG5cdHB1YmxpYyBlbmRDb21wb3NpdGlvbihzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUN1cnNvckVkaXQoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5lbmRDb21wb3NpdGlvbihldmVudHNDb2xsZWN0b3IsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyB0eXBlKHRleHQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IudHlwZShldmVudHNDb2xsZWN0b3IsIHRleHQsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyBjb21wb3NpdGlvblR5cGUodGV4dDogc3RyaW5nLCByZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgcmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIHBvc2l0aW9uRGVsdGE6IG51bWJlciwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IuY29tcG9zaXRpb25UeXBlKGV2ZW50c0NvbGxlY3RvciwgdGV4dCwgcmVwbGFjZVByZXZDaGFyQ250LCByZXBsYWNlTmV4dENoYXJDbnQsIHBvc2l0aW9uRGVsdGEsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyBwYXN0ZSh0ZXh0OiBzdHJpbmcsIHBhc3RlT25OZXdMaW5lOiBib29sZWFuLCBtdWx0aWN1cnNvclRleHQ/OiBzdHJpbmdbXSB8IG51bGwgfCB1bmRlZmluZWQsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLnBhc3RlKGV2ZW50c0NvbGxlY3RvciwgdGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCwgc291cmNlKSk7XG5cdH1cblx0cHVibGljIGN1dChzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUN1cnNvckVkaXQoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5jdXQoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpKTtcblx0fVxuXHRwdWJsaWMgZXhlY3V0ZUNvbW1hbmQoY29tbWFuZDogSUNvbW1hbmQsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLmV4ZWN1dGVDb21tYW5kKGV2ZW50c0NvbGxlY3RvciwgY29tbWFuZCwgc291cmNlKSk7XG5cdH1cblx0cHVibGljIGV4ZWN1dGVDb21tYW5kcyhjb21tYW5kczogSUNvbW1hbmRbXSwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IuZXhlY3V0ZUNvbW1hbmRzKGV2ZW50c0NvbGxlY3RvciwgY29tbWFuZHMsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyByZXZlYWxBbGxDdXJzb3JzKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgbWluaW1hbFJldmVhbDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5yZXZlYWxBbGwoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIG1pbmltYWxSZXZlYWwsIHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgcmV2ZWFsSG9yaXpvbnRhbCwgU2Nyb2xsVHlwZS5TbW9vdGgpKTtcblx0fVxuXHRwdWJsaWMgcmV2ZWFsUHJpbWFyeUN1cnNvcihzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIG1pbmltYWxSZXZlYWw6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IucmV2ZWFsUHJpbWFyeShldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgbWluaW1hbFJldmVhbCwgdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLCByZXZlYWxIb3Jpem9udGFsLCBTY3JvbGxUeXBlLlNtb290aCkpO1xuXHR9XG5cdHB1YmxpYyByZXZlYWxUb3BNb3N0Q3Vyc29yKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHRoaXMuX2N1cnNvci5nZXRUb3BNb3N0Vmlld1Bvc2l0aW9uKCk7XG5cdFx0Y29uc3Qgdmlld1JhbmdlID0gbmV3IFJhbmdlKHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCB2aWV3UG9zaXRpb24uY29sdW1uLCB2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbik7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudChzb3VyY2UsIGZhbHNlLCB2aWV3UmFuZ2UsIG51bGwsIHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgdHJ1ZSwgU2Nyb2xsVHlwZS5TbW9vdGgpKSk7XG5cdH1cblx0cHVibGljIHJldmVhbEJvdHRvbU1vc3RDdXJzb3Ioc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdGhpcy5fY3Vyc29yLmdldEJvdHRvbU1vc3RWaWV3UG9zaXRpb24oKTtcblx0XHRjb25zdCB2aWV3UmFuZ2UgPSBuZXcgUmFuZ2Uodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHZpZXdQb3NpdGlvbi5jb2x1bW4sIHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCB2aWV3UG9zaXRpb24uY29sdW1uKTtcblx0XHR0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcihldmVudHNDb2xsZWN0b3IgPT4gZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50KHNvdXJjZSwgZmFsc2UsIHZpZXdSYW5nZSwgbnVsbCwgdmlld0V2ZW50cy5WZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLCB0cnVlLCBTY3JvbGxUeXBlLlNtb290aCkpKTtcblx0fVxuXHRwdWJsaWMgcmV2ZWFsUmFuZ2Uoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCByZXZlYWxIb3Jpem9udGFsOiBib29sZWFuLCB2aWV3UmFuZ2U6IFJhbmdlLCB2ZXJ0aWNhbFR5cGU6IHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLCBzY3JvbGxUeXBlOiBTY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudChzb3VyY2UsIGZhbHNlLCB2aWV3UmFuZ2UsIG51bGwsIHZlcnRpY2FsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbCwgc2Nyb2xsVHlwZSkpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiB2aWV3TGF5b3V0XG5cdHB1YmxpYyBjaGFuZ2VXaGl0ZXNwYWNlKGNhbGxiYWNrOiAoYWNjZXNzb3I6IElXaGl0ZXNwYWNlQ2hhbmdlQWNjZXNzb3IpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBoYWRBQ2hhbmdlID0gdGhpcy52aWV3TGF5b3V0LmNoYW5nZVdoaXRlc3BhY2UoY2FsbGJhY2spO1xuXHRcdGlmIChoYWRBQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IFZpZXdab25lc0NoYW5nZWRFdmVudCgpKTtcblx0XHR9XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBfd2l0aFZpZXdFdmVudHNDb2xsZWN0b3I8VD4oY2FsbGJhY2s6IChldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcikgPT4gVCk6IFQge1xuXHRcdHJldHVybiB0aGlzLl90cmFuc2FjdGlvbmFsVGFyZ2V0LmJhdGNoQ2hhbmdlcygoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW1pdFZpZXdFdmVudChjYWxsYmFjayk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0Vmlld0V2ZW50PFQ+KGNhbGxiYWNrOiAoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IpID0+IFQpOiBUIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXZlbnRzQ29sbGVjdG9yID0gdGhpcy5fZXZlbnREaXNwYXRjaGVyLmJlZ2luRW1pdFZpZXdFdmVudHMoKTtcblx0XHRcdHJldHVybiBjYWxsYmFjayhldmVudHNDb2xsZWN0b3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW5kRW1pdFZpZXdFdmVudHMoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYmF0Y2hFdmVudHMoY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcigoKSA9PiB7IGNhbGxiYWNrKCk7IH0pO1xuXHR9XG5cblx0bm9ybWFsaXplUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMubm9ybWFsaXplUG9zaXRpb24ocG9zaXRpb24sIGFmZmluaXR5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjb2x1bW4gYXQgd2hpY2ggaW5kZW50YXRpb24gc3RvcHMgYXQgYSBnaXZlbiBsaW5lLlxuXHQgKiBAaW50ZXJuYWxcblx0Ki9cblx0Z2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRMaW5lSW5kZW50Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhdGNoYWJsZVRhcmdldCB7XG5cdC8qKlxuXHQgKiBBbGxvd3MgdGhlIHRhcmdldCB0byBhcHBseSB0aGUgY2hhbmdlcyBpbnRyb2R1Y2VkIGJ5IHRoZSBjYWxsYmFjayBpbiBhIGJhdGNoLlxuXHQqL1xuXHRiYXRjaENoYW5nZXM8VD4oY2I6ICgpID0+IFQpOiBUO1xufVxuXG5jbGFzcyBWaWV3cG9ydFN0YXJ0IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKG1vZGVsOiBJVGV4dE1vZGVsKTogVmlld3BvcnRTdGFydCB7XG5cdFx0Y29uc3Qgdmlld3BvcnRTdGFydExpbmVUcmFja2VkUmFuZ2UgPSBtb2RlbC5fc2V0VHJhY2tlZFJhbmdlKG51bGwsIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMpO1xuXHRcdHJldHVybiBuZXcgVmlld3BvcnRTdGFydChtb2RlbCwgMSwgZmFsc2UsIHZpZXdwb3J0U3RhcnRMaW5lVHJhY2tlZFJhbmdlLCAwKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdmlld0xpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0xpbmVOdW1iZXI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzVmFsaWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmFsaWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1vZGVsVHJhY2tlZFJhbmdlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsVHJhY2tlZFJhbmdlO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGFydExpbmVEZWx0YSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydExpbmVEZWx0YTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSBfdmlld0xpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwcml2YXRlIF9pc1ZhbGlkOiBib29sZWFuLFxuXHRcdHByaXZhdGUgX21vZGVsVHJhY2tlZFJhbmdlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfc3RhcnRMaW5lRGVsdGE6IG51bWJlcixcblx0KSB7IH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbC5fc2V0VHJhY2tlZFJhbmdlKHRoaXMuX21vZGVsVHJhY2tlZFJhbmdlLCBudWxsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihzdGFydExpbmVOdW1iZXIsIHZpZXdNb2RlbC5nZXRMaW5lTWluQ29sdW1uKHN0YXJ0TGluZU51bWJlcikpKTtcblx0XHRjb25zdCB2aWV3cG9ydFN0YXJ0TGluZVRyYWNrZWRSYW5nZSA9IHZpZXdNb2RlbC5tb2RlbC5fc2V0VHJhY2tlZFJhbmdlKHRoaXMuX21vZGVsVHJhY2tlZFJhbmdlLCBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyk7XG5cdFx0Y29uc3Qgdmlld3BvcnRTdGFydExpbmVUb3AgPSB2aWV3TW9kZWwudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB2aWV3TW9kZWwudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCk7XG5cblx0XHR0aGlzLl92aWV3TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHR0aGlzLl9pc1ZhbGlkID0gdHJ1ZTtcblx0XHR0aGlzLl9tb2RlbFRyYWNrZWRSYW5nZSA9IHZpZXdwb3J0U3RhcnRMaW5lVHJhY2tlZFJhbmdlO1xuXHRcdHRoaXMuX3N0YXJ0TGluZURlbHRhID0gc2Nyb2xsVG9wIC0gdmlld3BvcnRTdGFydExpbmVUb3A7XG5cdH1cblxuXHRwdWJsaWMgaW52YWxpZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1ZhbGlkID0gZmFsc2U7XG5cdH1cbn1cblxuY2xhc3MgT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hc01hcDogeyBbY29sb3I6IHN0cmluZ106IE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRyZWFkb25seSBhc0FycmF5OiBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cFtdID0gW107XG5cblx0cHVibGljIGFjY2VwdChjb2xvcjogc3RyaW5nLCB6SW5kZXg6IG51bWJlciwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgbGFuZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldkdyb3VwID0gdGhpcy5fYXNNYXBbY29sb3JdO1xuXG5cdFx0aWYgKHByZXZHcm91cCkge1xuXHRcdFx0Y29uc3QgcHJldkRhdGEgPSBwcmV2R3JvdXAuZGF0YTtcblx0XHRcdGNvbnN0IHByZXZMYW5lID0gcHJldkRhdGFbcHJldkRhdGEubGVuZ3RoIC0gM107XG5cdFx0XHRjb25zdCBwcmV2RW5kTGluZU51bWJlciA9IHByZXZEYXRhW3ByZXZEYXRhLmxlbmd0aCAtIDFdO1xuXHRcdFx0aWYgKHByZXZMYW5lID09PSBsYW5lICYmIHByZXZFbmRMaW5lTnVtYmVyICsgMSA+PSBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gbWVyZ2UgaW50byBwcmV2XG5cdFx0XHRcdGlmIChlbmRMaW5lTnVtYmVyID4gcHJldkVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRwcmV2RGF0YVtwcmV2RGF0YS5sZW5ndGggLSAxXSA9IGVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBwdXNoXG5cdFx0XHRwcmV2RGF0YS5wdXNoKGxhbmUsIHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gbmV3IE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwKGNvbG9yLCB6SW5kZXgsIFtsYW5lLCBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJdKTtcblx0XHRcdHRoaXMuX2FzTWFwW2NvbG9yXSA9IGdyb3VwO1xuXHRcdFx0dGhpcy5hc0FycmF5LnB1c2goZ3JvdXApO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBIaWRkZW5BcmVhc01vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBoaWRkZW5BcmVhcyA9IG5ldyBNYXA8dW5rbm93biwgUmFuZ2VbXT4oKTtcblx0cHJpdmF0ZSBzaG91bGRSZWNvbXB1dGUgPSBmYWxzZTtcblx0cHJpdmF0ZSByYW5nZXM6IFJhbmdlW10gPSBbXTtcblxuXHRzZXRIaWRkZW5BcmVhcyhzb3VyY2U6IHVua25vd24sIHJhbmdlczogUmFuZ2VbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5oaWRkZW5BcmVhcy5nZXQoc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcgJiYgcmFuZ2VBcnJheXNFcXVhbChleGlzdGluZywgcmFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmhpZGRlbkFyZWFzLnNldChzb3VyY2UsIHJhbmdlcyk7XG5cdFx0dGhpcy5zaG91bGRSZWNvbXB1dGUgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSByZXR1cm5lZCBhcnJheSBpcyBpbW11dGFibGUuXG5cdCovXG5cdGdldE1lcmdlZFJhbmdlcygpOiByZWFkb25seSBSYW5nZVtdIHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkUmVjb21wdXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yYW5nZXM7XG5cdFx0fVxuXHRcdHRoaXMuc2hvdWxkUmVjb21wdXRlID0gZmFsc2U7XG5cdFx0Y29uc3QgbmV3UmFuZ2VzID0gQXJyYXkuZnJvbSh0aGlzLmhpZGRlbkFyZWFzLnZhbHVlcygpKS5yZWR1Y2UoKHIsIGhpZGRlbkFyZWFzKSA9PiBtZXJnZUxpbmVSYW5nZUFycmF5KHIsIGhpZGRlbkFyZWFzKSwgW10pO1xuXHRcdGlmIChyYW5nZUFycmF5c0VxdWFsKHRoaXMucmFuZ2VzLCBuZXdSYW5nZXMpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yYW5nZXM7XG5cdFx0fVxuXHRcdHRoaXMucmFuZ2VzID0gbmV3UmFuZ2VzO1xuXHRcdHJldHVybiB0aGlzLnJhbmdlcztcblx0fVxufVxuXG5mdW5jdGlvbiBtZXJnZUxpbmVSYW5nZUFycmF5KGFycjE6IFJhbmdlW10sIGFycjI6IFJhbmdlW10pOiBSYW5nZVtdIHtcblx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdGxldCBpID0gMDtcblx0bGV0IGogPSAwO1xuXHR3aGlsZSAoaSA8IGFycjEubGVuZ3RoICYmIGogPCBhcnIyLmxlbmd0aCkge1xuXHRcdGNvbnN0IGl0ZW0xID0gYXJyMVtpXTtcblx0XHRjb25zdCBpdGVtMiA9IGFycjJbal07XG5cblx0XHRpZiAoaXRlbTEuZW5kTGluZU51bWJlciA8IGl0ZW0yLnN0YXJ0TGluZU51bWJlciAtIDEpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGFycjFbaSsrXSk7XG5cdFx0fSBlbHNlIGlmIChpdGVtMi5lbmRMaW5lTnVtYmVyIDwgaXRlbTEuc3RhcnRMaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0cmVzdWx0LnB1c2goYXJyMltqKytdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gTWF0aC5taW4oaXRlbTEuc3RhcnRMaW5lTnVtYmVyLCBpdGVtMi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IE1hdGgubWF4KGl0ZW0xLmVuZExpbmVOdW1iZXIsIGl0ZW0yLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0cmVzdWx0LnB1c2gobmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgMSwgZW5kTGluZU51bWJlciwgMSkpO1xuXHRcdFx0aSsrO1xuXHRcdFx0aisrO1xuXHRcdH1cblx0fVxuXHR3aGlsZSAoaSA8IGFycjEubGVuZ3RoKSB7XG5cdFx0cmVzdWx0LnB1c2goYXJyMVtpKytdKTtcblx0fVxuXHR3aGlsZSAoaiA8IGFycjIubGVuZ3RoKSB7XG5cdFx0cmVzdWx0LnB1c2goYXJyMltqKytdKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByYW5nZUFycmF5c0VxdWFsKGFycjE6IFJhbmdlW10sIGFycjI6IFJhbmdlW10pOiBib29sZWFuIHtcblx0aWYgKGFycjEubGVuZ3RoICE9PSBhcnIyLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGFycjEubGVuZ3RoOyBpKyspIHtcblx0XHRpZiAoIWFycjFbaV0uZXF1YWxzUmFuZ2UoYXJyMltpXSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICogTWFpbnRhaW4gYSBzdGFibGUgdmlld3BvcnQgYnkgdHJ5aW5nIHRvIGtlZXAgdGhlIGZpcnN0IGxpbmUgaW4gdGhlIHZpZXdwb3J0IGNvbnN0YW50LlxuICovXG5jbGFzcyBTdGFibGVWaWV3cG9ydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3cG9ydFN0YXJ0TW9kZWxQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydExpbmVEZWx0YTogbnVtYmVyXG5cdCkgeyB9XG5cblx0cHVibGljIHJlY292ZXJWaWV3cG9ydFN0YXJ0KGNvb3JkaW5hdGVzQ29udmVydGVyOiBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIsIHZpZXdMYXlvdXQ6IFZpZXdMYXlvdXQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlld3BvcnRTdGFydE1vZGVsUG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbih0aGlzLnZpZXdwb3J0U3RhcnRNb2RlbFBvc2l0aW9uKTtcblx0XHRjb25zdCB2aWV3UG9zaXRpb25Ub3AgPSB2aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0dmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogdmlld1Bvc2l0aW9uVG9wICsgdGhpcy5zdGFydExpbmVEZWx0YSB9LCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYTtBQUV0QixTQUFTLGtCQUErQjtBQUN4QyxZQUFZLGNBQWM7QUFDMUIsWUFBWSxhQUFhO0FBQ3pCLFNBQW9DLGNBQWMsNkJBQTZCLDZCQUFnRTtBQUMvSSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUFrRztBQUMzRyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBUyxhQUFhO0FBRXRCLFNBQTZDLGtCQUFrQjtBQUUvRCxTQUFTLHFCQUFnSixlQUFlLDhCQUE4QjtBQUd0TSxZQUFZLHFCQUFxQjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFFbkMsWUFBWSxn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
