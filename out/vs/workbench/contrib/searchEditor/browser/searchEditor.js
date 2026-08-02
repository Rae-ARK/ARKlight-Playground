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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Delayer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./media/searchEditor.css";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ReferencesController } from "../../../../editor/contrib/gotoSymbol/browser/peek/referencesController.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IEditorProgressService, LongRunningOperation } from "../../../../platform/progress/common/progress.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { inputBorder, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AbstractTextCodeEditor } from "../../../browser/parts/editor/textCodeEditor.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { ExcludePatternInputWidget, IncludePatternInputWidget } from "../../search/browser/patternInputWidget.js";
import { SearchWidget } from "../../search/browser/searchWidget.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { getOutOfWorkspaceEditorResources } from "../../search/common/search.js";
import { SearchModelImpl } from "../../search/browser/searchTreeModel/searchModel.js";
import { InSearchEditor, SearchEditorID, SearchEditorInputTypeId } from "./constants.js";
import { serializeSearchResultForEditor } from "./searchEditorSerialization.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { SearchSortOrder } from "../../../services/search/common/search.js";
import { searchDetailsIcon } from "../../search/browser/searchIcons.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { renderSearchMessage } from "../../search/browser/searchMessage.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { UnusualLineTerminatorsDetector } from "../../../../editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js";
import { defaultToggleStyles, getInputBoxStyle } from "../../../../platform/theme/browser/defaultStyles.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SearchContext } from "../../search/common/constants.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const RESULT_LINE_REGEX = /^(\s+)(\d+)(: |  )(\s*)(.*)$/;
const FILE_LINE_REGEX = /^(\S.*):$/;
let SearchEditor = class extends AbstractTextCodeEditor {
  constructor(group, telemetryService, themeService, storageService, modelService, contextService, labelService, instantiationService, contextViewService, commandService, openerService, notificationService, progressService, textResourceService, editorGroupService, editorService, configurationService, fileService, logService, hoverService) {
    super(SearchEditor.ID, group, telemetryService, instantiationService, storageService, textResourceService, themeService, editorService, editorGroupService, fileService);
    this.modelService = modelService;
    this.contextService = contextService;
    this.labelService = labelService;
    this.contextViewService = contextViewService;
    this.commandService = commandService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.hoverService = hoverService;
    this.runSearchDelayer = this._register(new Delayer(0));
    this.pauseSearching = false;
    this.showingIncludesExcludes = false;
    this.ongoingOperations = 0;
    this.updatingModelForSearch = false;
    this.container = DOM.$(".search-editor");
    this.searchOperation = this._register(new LongRunningOperation(progressService));
    this._register(this.messageDisposables = new DisposableStore());
    this.searchHistoryDelayer = this._register(new Delayer(2e3));
    this.searchModel = this._register(this.instantiationService.createInstance(SearchModelImpl));
  }
  get searchResultEditor() {
    return this.editorControl;
  }
  createEditor(parent) {
    DOM.append(parent, this.container);
    this.queryEditorContainer = DOM.append(this.container, DOM.$(".query-container"));
    const searchResultContainer = DOM.append(this.container, DOM.$(".search-results"));
    super.createEditor(searchResultContainer);
    this.registerEditorListeners();
    const scopedContextKeyService = assertReturnsDefined(this.scopedContextKeyService);
    InSearchEditor.bindTo(scopedContextKeyService).set(true);
    this.createQueryEditor(
      this.queryEditorContainer,
      this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))),
      SearchContext.InputBoxFocusedKey.bindTo(scopedContextKeyService)
    );
  }
  createQueryEditor(container, scopedInstantiationService, inputBoxFocusedContextKey) {
    const searchEditorInputboxStyles = getInputBoxStyle({ inputBorder: searchEditorTextInputBorder });
    this.queryEditorWidget = this._register(scopedInstantiationService.createInstance(SearchWidget, container, { _hideReplaceToggle: true, showContextToggle: true, inputBoxStyles: searchEditorInputboxStyles, toggleStyles: defaultToggleStyles }));
    this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
    this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
    this._register(this.queryEditorWidget.onSearchSubmit(({ delay }) => this.triggerSearch({ delay })));
    if (this.queryEditorWidget.searchInput) {
      this._register(this.queryEditorWidget.searchInput.onDidOptionChange(() => this.triggerSearch({ resetCursor: false })));
    } else {
      this.logService.warn("SearchEditor: SearchWidget.searchInput is undefined, cannot register onDidOptionChange listener");
    }
    this._register(this.queryEditorWidget.onDidToggleContext(() => this.triggerSearch({ resetCursor: false })));
    this.includesExcludesContainer = DOM.append(container, DOM.$(".includes-excludes"));
    const toggleQueryDetailsLabel = localize("moreSearch", "Toggle Search Details");
    this.toggleQueryDetailsButton = DOM.append(this.includesExcludesContainer, DOM.$(".expand" + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: "button", "aria-label": toggleQueryDetailsLabel }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.toggleQueryDetailsButton, toggleQueryDetailsLabel));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.CLICK, (e) => {
      DOM.EventHelper.stop(e);
      this.toggleIncludesExcludes();
    }));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        DOM.EventHelper.stop(e);
        this.toggleIncludesExcludes();
      }
    }));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this.queryEditorWidget.isReplaceActive()) {
          this.queryEditorWidget.focusReplaceAllAction();
        } else {
          this.queryEditorWidget.isReplaceShown() ? this.queryEditorWidget.replaceInput?.focusOnPreserve() : this.queryEditorWidget.focusRegexAction();
        }
        DOM.EventHelper.stop(e);
      }
    }));
    const folderIncludesList = DOM.append(this.includesExcludesContainer, DOM.$(".file-types.includes"));
    const filesToIncludeTitle = localize("searchScope.includes", "files to include");
    DOM.append(folderIncludesList, DOM.$("h4", void 0, filesToIncludeTitle));
    this.inputPatternIncludes = this._register(scopedInstantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
      ariaLabel: localize("label.includes", "Search Include Patterns"),
      inputBoxStyles: searchEditorInputboxStyles
    }));
    this._register(this.inputPatternIncludes.onSubmit((triggeredOnType) => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
    this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerSearch()));
    const excludesList = DOM.append(this.includesExcludesContainer, DOM.$(".file-types.excludes"));
    const excludesTitle = localize("searchScope.excludes", "files to exclude");
    DOM.append(excludesList, DOM.$("h4", void 0, excludesTitle));
    this.inputPatternExcludes = this._register(scopedInstantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
      ariaLabel: localize("label.excludes", "Search Exclude Patterns"),
      inputBoxStyles: searchEditorInputboxStyles
    }));
    this._register(this.inputPatternExcludes.onSubmit((triggeredOnType) => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
    this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerSearch()));
    this.messageBox = DOM.append(container, DOM.$(".messages.text-search-provider-messages"));
    [this.queryEditorWidget.searchInputFocusTracker, this.queryEditorWidget.replaceInputFocusTracker, this.inputPatternExcludes.inputFocusTracker, this.inputPatternIncludes.inputFocusTracker].forEach((tracker) => {
      if (!tracker) {
        return;
      }
      this._register(tracker.onDidFocus(() => setTimeout(() => inputBoxFocusedContextKey.set(true), 0)));
      this._register(tracker.onDidBlur(() => inputBoxFocusedContextKey.set(false)));
    });
  }
  toggleRunAgainMessage(show) {
    DOM.clearNode(this.messageBox);
    this.messageDisposables.clear();
    if (show) {
      const runAgainLink = DOM.append(this.messageBox, DOM.$("a.pointer.prominent.message", {}, localize("runSearch", "Run Search")));
      this.messageDisposables.add(DOM.addDisposableListener(runAgainLink, DOM.EventType.CLICK, async () => {
        await this.triggerSearch();
        this.searchResultEditor.focus();
      }));
    }
  }
  _getContributions() {
    const skipContributions = [UnusualLineTerminatorsDetector.ID];
    return EditorExtensionsRegistry.getEditorContributions().filter((c) => skipContributions.indexOf(c.id) === -1);
  }
  getCodeEditorWidgetOptions() {
    return { contributions: this._getContributions() };
  }
  registerEditorListeners() {
    this._register(this.searchResultEditor.onMouseUp((e) => {
      if (e.event.detail === 1) {
        const behaviour = this.searchConfig.searchEditor.singleClickBehaviour;
        const position = e.target.position;
        if (position && behaviour === "peekDefinition") {
          const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? "";
          if (line.match(FILE_LINE_REGEX) || line.match(RESULT_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand("editor.action.peekDefinition");
          }
        }
      } else if (e.event.detail === 2) {
        const behaviour = this.searchConfig.searchEditor.doubleClickBehaviour;
        const position = e.target.position;
        if (position && behaviour !== "selectWord") {
          const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? "";
          if (line.match(RESULT_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand(behaviour === "goToLocation" ? "editor.action.goToDeclaration" : "editor.action.openDeclarationToTheSide");
          } else if (line.match(FILE_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand("editor.action.peekDefinition");
          }
        }
      }
    }));
    this._register(this.searchResultEditor.onDidChangeModelContent(() => {
      if (!this.updatingModelForSearch) {
        this.getInput()?.setDirty(true);
      }
    }));
  }
  getControl() {
    return this.searchResultEditor;
  }
  focus() {
    super.focus();
    const viewState = this.loadEditorViewState(this.getInput());
    if (viewState && viewState.focused === "editor") {
      this.searchResultEditor.focus();
    } else {
      this.queryEditorWidget.focus();
    }
  }
  focusSearchInput() {
    this.queryEditorWidget.searchInput?.focus();
  }
  focusFilesToIncludeInput() {
    if (!this.showingIncludesExcludes) {
      this.toggleIncludesExcludes(true);
    }
    this.inputPatternIncludes.focus();
  }
  focusFilesToExcludeInput() {
    if (!this.showingIncludesExcludes) {
      this.toggleIncludesExcludes(true);
    }
    this.inputPatternExcludes.focus();
  }
  focusNextInput() {
    if (this.queryEditorWidget.searchInputHasFocus()) {
      if (this.showingIncludesExcludes) {
        this.inputPatternIncludes.focus();
      } else {
        this.searchResultEditor.focus();
      }
    } else if (this.inputPatternIncludes.inputHasFocus()) {
      this.inputPatternExcludes.focus();
    } else if (this.inputPatternExcludes.inputHasFocus()) {
      this.searchResultEditor.focus();
    } else if (this.searchResultEditor.hasWidgetFocus()) {
    }
  }
  focusPrevInput() {
    if (this.queryEditorWidget.searchInputHasFocus()) {
      this.searchResultEditor.focus();
    } else if (this.inputPatternIncludes.inputHasFocus()) {
      this.queryEditorWidget.searchInput?.focus();
    } else if (this.inputPatternExcludes.inputHasFocus()) {
      this.inputPatternIncludes.focus();
    } else if (this.searchResultEditor.hasWidgetFocus()) {
    }
  }
  setQuery(query) {
    this.queryEditorWidget.searchInput?.setValue(query);
  }
  selectQuery() {
    this.queryEditorWidget.searchInput?.select();
  }
  toggleWholeWords() {
    this.queryEditorWidget.searchInput?.setWholeWords(!this.queryEditorWidget.searchInput.getWholeWords());
    this.triggerSearch({ resetCursor: false });
  }
  toggleRegex() {
    this.queryEditorWidget.searchInput?.setRegex(!this.queryEditorWidget.searchInput.getRegex());
    this.triggerSearch({ resetCursor: false });
  }
  toggleCaseSensitive() {
    this.queryEditorWidget.searchInput?.setCaseSensitive(!this.queryEditorWidget.searchInput.getCaseSensitive());
    this.triggerSearch({ resetCursor: false });
  }
  toggleContextLines() {
    this.queryEditorWidget.toggleContextLines();
  }
  modifyContextLines(increase) {
    this.queryEditorWidget.modifyContextLines(increase);
  }
  toggleQueryDetails(shouldShow) {
    this.toggleIncludesExcludes(shouldShow);
  }
  deleteResultBlock() {
    const linesToDelete = /* @__PURE__ */ new Set();
    const selections = this.searchResultEditor.getSelections();
    const model = this.searchResultEditor.getModel();
    if (!(selections && model)) {
      return;
    }
    const maxLine = model.getLineCount();
    const minLine = 1;
    const deleteUp = (start) => {
      for (let cursor = start; cursor >= minLine; cursor--) {
        const line = model.getLineContent(cursor);
        linesToDelete.add(cursor);
        if (line[0] !== void 0 && line[0] !== " ") {
          break;
        }
      }
    };
    const deleteDown = (start) => {
      linesToDelete.add(start);
      for (let cursor = start + 1; cursor <= maxLine; cursor++) {
        const line = model.getLineContent(cursor);
        if (line[0] !== void 0 && line[0] !== " ") {
          return cursor;
        }
        linesToDelete.add(cursor);
      }
      return;
    };
    const endingCursorLines = [];
    for (const selection of selections) {
      const lineNumber = selection.startLineNumber;
      endingCursorLines.push(deleteDown(lineNumber));
      deleteUp(lineNumber);
      for (let inner = selection.startLineNumber; inner <= selection.endLineNumber; inner++) {
        linesToDelete.add(inner);
      }
    }
    if (endingCursorLines.length === 0) {
      endingCursorLines.push(1);
    }
    const isDefined = (x) => x !== void 0;
    model.pushEditOperations(
      this.searchResultEditor.getSelections(),
      [...linesToDelete].map((line) => ({ range: new Range(line, 1, line + 1, 1), text: "" })),
      () => endingCursorLines.filter(isDefined).map((line) => new Selection(line, 1, line, 1))
    );
  }
  cleanState() {
    this.getInput()?.setDirty(false);
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  iterateThroughMatches(reverse) {
    const model = this.searchResultEditor.getModel();
    if (!model) {
      return;
    }
    const lastLine = model.getLineCount() ?? 1;
    const lastColumn = model.getLineLength(lastLine);
    const fallbackStart = reverse ? new Position(lastLine, lastColumn) : new Position(1, 1);
    const currentPosition = this.searchResultEditor.getSelection()?.getStartPosition() ?? fallbackStart;
    const matchRanges = this.getInput()?.getMatchRanges();
    if (!matchRanges) {
      return;
    }
    const matchRange = (reverse ? findPrevRange : findNextRange)(matchRanges, currentPosition);
    if (!matchRange) {
      return;
    }
    this.searchResultEditor.setSelection(matchRange);
    this.searchResultEditor.revealLineInCenterIfOutsideViewport(matchRange.startLineNumber);
    this.searchResultEditor.focus();
    const matchLineText = model.getLineContent(matchRange.startLineNumber);
    const matchText = model.getValueInRange(matchRange);
    let file = "";
    for (let line = matchRange.startLineNumber; line >= 1; line--) {
      const lineText = model.getValueInRange(new Range(line, 1, line, 2));
      if (lineText !== " ") {
        file = model.getLineContent(line);
        break;
      }
    }
    alert(localize("searchResultItem", "Matched {0} at {1} in file {2}", matchText, matchLineText, file.slice(0, file.length - 1)));
  }
  focusNextResult() {
    this.iterateThroughMatches(false);
  }
  focusPreviousResult() {
    this.iterateThroughMatches(true);
  }
  focusAllResults() {
    this.searchResultEditor.setSelections((this.getInput()?.getMatchRanges() ?? []).map(
      (range) => new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)
    ));
    this.searchResultEditor.focus();
  }
  async triggerSearch(_options) {
    const focusResults = this.searchConfig.searchEditor.focusResultsOnSearch;
    if (_options === void 0) {
      _options = { focusResults };
    } else if (_options.focusResults === void 0) {
      _options.focusResults = focusResults;
    }
    const options = { resetCursor: true, delay: 0, ..._options };
    if (!this.queryEditorWidget.searchInput?.inputBox.isInputValid()) {
      return;
    }
    if (!this.pauseSearching) {
      await this.runSearchDelayer.trigger(async () => {
        this.toggleRunAgainMessage(false);
        await this.doRunSearch();
        if (options.resetCursor) {
          this.searchResultEditor.setPosition(new Position(1, 1));
          this.searchResultEditor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
        }
        if (options.focusResults) {
          this.searchResultEditor.focus();
        }
      }, options.delay);
    }
  }
  readConfigFromWidget() {
    return {
      isCaseSensitive: this.queryEditorWidget.searchInput?.getCaseSensitive() ?? false,
      contextLines: this.queryEditorWidget.getContextLines(),
      filesToExclude: this.inputPatternExcludes.getValue(),
      filesToInclude: this.inputPatternIncludes.getValue(),
      query: this.queryEditorWidget.searchInput?.getValue() ?? "",
      isRegexp: this.queryEditorWidget.searchInput?.getRegex() ?? false,
      matchWholeWord: this.queryEditorWidget.searchInput?.getWholeWords() ?? false,
      useExcludeSettingsAndIgnoreFiles: this.inputPatternExcludes.useExcludesAndIgnoreFiles(),
      onlyOpenEditors: this.inputPatternIncludes.onlySearchInOpenEditors(),
      showIncludesExcludes: this.showingIncludesExcludes,
      notebookSearchConfig: {
        includeMarkupInput: this.queryEditorWidget.getNotebookFilters().markupInput,
        includeMarkupPreview: this.queryEditorWidget.getNotebookFilters().markupPreview,
        includeCodeInput: this.queryEditorWidget.getNotebookFilters().codeInput,
        includeOutput: this.queryEditorWidget.getNotebookFilters().codeOutput
      }
    };
  }
  async doRunSearch() {
    this.searchModel.cancelSearch(true);
    const startInput = this.getInput();
    if (!startInput) {
      return;
    }
    this.searchHistoryDelayer.trigger(() => {
      this.queryEditorWidget.searchInput?.onSearchSubmit();
      this.inputPatternExcludes.onSearchSubmit();
      this.inputPatternIncludes.onSearchSubmit();
    });
    const config = this.readConfigFromWidget();
    if (!config.query) {
      return;
    }
    const content = {
      pattern: config.query,
      isRegExp: config.isRegexp,
      isCaseSensitive: config.isCaseSensitive,
      isWordMatch: config.matchWholeWord
    };
    const options = {
      _reason: "searchEditor",
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      maxResults: this.searchConfig.maxResults ?? void 0,
      disregardIgnoreFiles: !config.useExcludeSettingsAndIgnoreFiles || void 0,
      disregardExcludeSettings: !config.useExcludeSettingsAndIgnoreFiles || void 0,
      excludePattern: [{ pattern: config.filesToExclude }],
      includePattern: config.filesToInclude,
      onlyOpenEditors: config.onlyOpenEditors,
      previewOptions: {
        matchLines: 1,
        charsPerLine: 1e3
      },
      surroundingContext: config.contextLines,
      isSmartCase: this.searchConfig.smartCase,
      expandPatterns: true,
      notebookSearchConfig: {
        includeMarkupInput: config.notebookSearchConfig.includeMarkupInput,
        includeMarkupPreview: config.notebookSearchConfig.includeMarkupPreview,
        includeCodeInput: config.notebookSearchConfig.includeCodeInput,
        includeOutput: config.notebookSearchConfig.includeOutput
      }
    };
    const folderResources = this.contextService.getWorkspace().folders;
    let query;
    try {
      const queryBuilder = this.instantiationService.createInstance(QueryBuilder);
      query = queryBuilder.text(content, folderResources.map((folder) => folder.uri), options);
    } catch (err) {
      return;
    }
    this.searchOperation.start(500);
    this.ongoingOperations++;
    const { configurationModel } = await startInput.resolveModels();
    configurationModel.updateConfig(config);
    const result = this.searchModel.search(query);
    startInput.ongoingSearchOperation = result.asyncResults.finally(() => {
      this.ongoingOperations--;
      if (this.ongoingOperations === 0) {
        this.searchOperation.stop();
      }
    });
    const searchOperation = await startInput.ongoingSearchOperation;
    await this.onSearchComplete(searchOperation, config, startInput);
  }
  async onSearchComplete(searchOperation, startConfig, startInput) {
    const input = this.getInput();
    if (!input || input !== startInput || JSON.stringify(startConfig) !== JSON.stringify(this.readConfigFromWidget())) {
      return;
    }
    input.ongoingSearchOperation = void 0;
    const sortOrder = this.searchConfig.sortOrder;
    if (sortOrder === SearchSortOrder.Modified) {
      await this.retrieveFileStats(this.searchModel.searchResult);
    }
    const controller = ReferencesController.get(this.searchResultEditor);
    controller?.closeWidget(false);
    const labelFormatter = (uri) => this.labelService.getUriLabel(uri, { relative: true });
    const results = serializeSearchResultForEditor(this.searchModel.searchResult, startConfig.filesToInclude, startConfig.filesToExclude, startConfig.contextLines, labelFormatter, sortOrder, searchOperation?.limitHit);
    const { resultsModel } = await input.resolveModels();
    this.updatingModelForSearch = true;
    this.modelService.updateModel(resultsModel, results.text);
    this.updatingModelForSearch = false;
    if (searchOperation && searchOperation.messages) {
      for (const message of searchOperation.messages) {
        this.addMessage(message);
      }
    }
    this.reLayout();
    input.setDirty(!input.hasCapability(EditorInputCapabilities.Untitled));
    input.setMatchRanges(results.matchRanges);
  }
  addMessage(message) {
    let messageBox;
    if (this.messageBox.firstChild) {
      messageBox = this.messageBox.firstChild;
    } else {
      messageBox = DOM.append(this.messageBox, DOM.$(".message"));
    }
    DOM.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerSearch()));
  }
  async retrieveFileStats(searchResult) {
    const files = searchResult.matches().filter((f) => !f.fileStat).map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  layout(dimension) {
    this.dimension = dimension;
    this.reLayout();
  }
  getSelected() {
    const selection = this.searchResultEditor.getSelection();
    if (selection) {
      return this.searchResultEditor.getModel()?.getValueInRange(selection) ?? "";
    }
    return "";
  }
  reLayout() {
    if (this.dimension) {
      this.queryEditorWidget.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
      this.searchResultEditor.layout({ height: this.dimension.height - DOM.getTotalHeight(this.queryEditorContainer), width: this.dimension.width });
      this.inputPatternExcludes.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
      this.inputPatternIncludes.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
    }
  }
  getInput() {
    return this.input;
  }
  setSearchConfig(config) {
    this.priorConfig = config;
    if (config.query !== void 0) {
      this.queryEditorWidget.setValue(config.query);
    }
    if (config.isCaseSensitive !== void 0) {
      this.queryEditorWidget.searchInput?.setCaseSensitive(config.isCaseSensitive);
    }
    if (config.isRegexp !== void 0) {
      this.queryEditorWidget.searchInput?.setRegex(config.isRegexp);
    }
    if (config.matchWholeWord !== void 0) {
      this.queryEditorWidget.searchInput?.setWholeWords(config.matchWholeWord);
    }
    if (config.contextLines !== void 0) {
      this.queryEditorWidget.setContextLines(config.contextLines);
    }
    if (config.filesToExclude !== void 0) {
      this.inputPatternExcludes.setValue(config.filesToExclude);
    }
    if (config.filesToInclude !== void 0) {
      this.inputPatternIncludes.setValue(config.filesToInclude);
    }
    if (config.onlyOpenEditors !== void 0) {
      this.inputPatternIncludes.setOnlySearchInOpenEditors(config.onlyOpenEditors);
    }
    if (config.useExcludeSettingsAndIgnoreFiles !== void 0) {
      this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(config.useExcludeSettingsAndIgnoreFiles);
    }
    if (config.showIncludesExcludes !== void 0) {
      this.toggleIncludesExcludes(config.showIncludesExcludes);
    }
  }
  async setInput(newInput, options, context, token) {
    await super.setInput(newInput, options, context, token);
    if (token.isCancellationRequested) {
      return;
    }
    const { configurationModel, resultsModel } = await newInput.resolveModels();
    if (token.isCancellationRequested) {
      return;
    }
    this.searchResultEditor.setModel(resultsModel);
    this.pauseSearching = true;
    this.toggleRunAgainMessage(!newInput.ongoingSearchOperation && resultsModel.getLineCount() === 1 && resultsModel.getValueLength() === 0 && configurationModel.config.query !== "");
    this.setSearchConfig(configurationModel.config);
    this._register(configurationModel.onConfigDidUpdate((newConfig) => {
      if (newConfig !== this.priorConfig) {
        this.pauseSearching = true;
        this.setSearchConfig(newConfig);
        this.pauseSearching = false;
      }
    }));
    this.restoreViewState(context);
    if (!options?.preserveFocus) {
      this.focus();
    }
    this.pauseSearching = false;
    if (newInput.ongoingSearchOperation) {
      const existingConfig = this.readConfigFromWidget();
      newInput.ongoingSearchOperation.then((complete) => {
        this.onSearchComplete(complete, existingConfig, newInput);
      });
    }
  }
  toggleIncludesExcludes(_shouldShow) {
    const cls = "expanded";
    const shouldShow = _shouldShow ?? !this.includesExcludesContainer.classList.contains(cls);
    if (shouldShow) {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "true");
      this.includesExcludesContainer.classList.add(cls);
    } else {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "false");
      this.includesExcludesContainer.classList.remove(cls);
    }
    this.showingIncludesExcludes = this.includesExcludesContainer.classList.contains(cls);
    this.reLayout();
  }
  toEditorViewStateResource(input) {
    if (input.typeId === SearchEditorInputTypeId) {
      return input.modelUri;
    }
    return void 0;
  }
  computeEditorViewState(resource) {
    const control = this.getControl();
    const editorViewState = control.saveViewState();
    if (!editorViewState) {
      return void 0;
    }
    if (resource.toString() !== this.getInput()?.modelUri.toString()) {
      return void 0;
    }
    return { ...editorViewState, focused: this.searchResultEditor.hasWidgetFocus() ? "editor" : "input" };
  }
  tracksEditorViewState(input) {
    return input.typeId === SearchEditorInputTypeId;
  }
  restoreViewState(context) {
    const viewState = this.loadEditorViewState(this.getInput(), context);
    if (viewState) {
      this.searchResultEditor.restoreViewState(viewState);
    }
  }
  getAriaLabel() {
    return this.getInput()?.getName() ?? localize("searchEditor", "Search");
  }
};
SearchEditor.ID = SearchEditorID;
SearchEditor.SEARCH_EDITOR_VIEW_STATE_PREFERENCE_KEY = "searchEditorViewState";
SearchEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IEditorProgressService),
  __decorateParam(13, ITextResourceConfigurationService),
  __decorateParam(14, IEditorGroupsService),
  __decorateParam(15, IEditorService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, IFileService),
  __decorateParam(18, ILogService),
  __decorateParam(19, IHoverService)
], SearchEditor);
const searchEditorTextInputBorder = registerColor("searchEditor.textInputBorder", inputBorder, localize("textInputBoxBorder", "Search editor text input box border."));
function findNextRange(matchRanges, currentPosition) {
  for (const matchRange of matchRanges) {
    if (Position.isBefore(currentPosition, matchRange.getStartPosition())) {
      return matchRange;
    }
  }
  return matchRanges[0];
}
function findPrevRange(matchRanges, currentPosition) {
  for (let i = matchRanges.length - 1; i >= 0; i--) {
    const matchRange = matchRanges[i];
    if (Position.isBefore(matchRange.getStartPosition(), currentPosition)) {
      {
        return matchRange;
      }
    }
  }
  return matchRanges[matchRanges.length - 1];
}
export {
  SearchEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zZWFyY2hFZGl0b3IuY3NzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWZlcmVuY2VzQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9wZWVrL3JlZmVyZW5jZXNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsIExvbmdSdW5uaW5nT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpbnB1dEJvcmRlciwgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHRDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvdGV4dENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEV4Y2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQsIEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQgfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9wYXR0ZXJuSW5wdXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VhcmNoV2lkZ2V0IH0gZnJvbSAnLi4vLi4vc2VhcmNoL2Jyb3dzZXIvc2VhcmNoV2lkZ2V0LmpzJztcbmltcG9ydCB7IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgZ2V0T3V0T2ZXb3Jrc3BhY2VFZGl0b3JSZXNvdXJjZXMgfSBmcm9tICcuLi8uLi9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hNb2RlbEltcGwgfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgSW5TZWFyY2hFZGl0b3IsIFNlYXJjaEVkaXRvcklELCBTZWFyY2hFZGl0b3JJbnB1dFR5cGVJZCwgU2VhcmNoQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgU2VhcmNoRWRpdG9ySW5wdXQgfSBmcm9tICcuL3NlYXJjaEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IHNlcmlhbGl6ZVNlYXJjaFJlc3VsdEZvckVkaXRvciB9IGZyb20gJy4vc2VhcmNoRWRpdG9yU2VyaWFsaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXR0ZXJuSW5mbywgSVNlYXJjaENvbXBsZXRlLCBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIElUZXh0UXVlcnksIFNlYXJjaFNvcnRPcmRlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IHNlYXJjaERldGFpbHNJY29uIH0gZnJvbSAnLi4vLi4vc2VhcmNoL2Jyb3dzZXIvc2VhcmNoSWNvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IHJlbmRlclNlYXJjaE1lc3NhZ2UgfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSwgSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBVbnVzdWFsTGluZVRlcm1pbmF0b3JzRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi91bnVzdWFsTGluZVRlcm1pbmF0b3JzL2Jyb3dzZXIvdW51c3VhbExpbmVUZXJtaW5hdG9ycy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0VG9nZ2xlU3R5bGVzLCBnZXRJbnB1dEJveFN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2VhcmNoQ29udGV4dCB9IGZyb20gJy4uLy4uL3NlYXJjaC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElTZWFyY2hSZXN1bHQgfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5cbmNvbnN0IFJFU1VMVF9MSU5FX1JFR0VYID0gL14oXFxzKykoXFxkKykoOiB8ICApKFxccyopKC4qKSQvO1xuY29uc3QgRklMRV9MSU5FX1JFR0VYID0gL14oXFxTLiopOiQvO1xuXG50eXBlIFNlYXJjaEVkaXRvclZpZXdTdGF0ZSA9IElDb2RlRWRpdG9yVmlld1N0YXRlICYgeyBmb2N1c2VkOiAnaW5wdXQnIHwgJ2VkaXRvcicgfTtcblxuZXhwb3J0IGNsYXNzIFNlYXJjaEVkaXRvciBleHRlbmRzIEFic3RyYWN0VGV4dENvZGVFZGl0b3I8U2VhcmNoRWRpdG9yVmlld1N0YXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gU2VhcmNoRWRpdG9ySUQ7XG5cblx0c3RhdGljIHJlYWRvbmx5IFNFQVJDSF9FRElUT1JfVklFV19TVEFURV9QUkVGRVJFTkNFX0tFWSA9ICdzZWFyY2hFZGl0b3JWaWV3U3RhdGUnO1xuXG5cdHByaXZhdGUgcXVlcnlFZGl0b3JXaWRnZXQhOiBTZWFyY2hXaWRnZXQ7XG5cdHByaXZhdGUgZ2V0IHNlYXJjaFJlc3VsdEVkaXRvcigpIHsgcmV0dXJuIHRoaXMuZWRpdG9yQ29udHJvbCE7IH1cblx0cHJpdmF0ZSBxdWVyeUVkaXRvckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpbWVuc2lvbj86IERPTS5EaW1lbnNpb247XG5cdHByaXZhdGUgaW5wdXRQYXR0ZXJuSW5jbHVkZXMhOiBJbmNsdWRlUGF0dGVybklucHV0V2lkZ2V0O1xuXHRwcml2YXRlIGlucHV0UGF0dGVybkV4Y2x1ZGVzITogRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldDtcblx0cHJpdmF0ZSBpbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbWVzc2FnZUJveCE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcnVuU2VhcmNoRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKDApKTtcblx0cHJpdmF0ZSBwYXVzZVNlYXJjaGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHNob3dpbmdJbmNsdWRlc0V4Y2x1ZGVzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc2VhcmNoT3BlcmF0aW9uOiBMb25nUnVubmluZ09wZXJhdGlvbjtcblx0cHJpdmF0ZSBzZWFyY2hIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaE1vZGVsOiBTZWFyY2hNb2RlbEltcGw7XG5cdHByaXZhdGUgb25nb2luZ09wZXJhdGlvbnM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgdXBkYXRpbmdNb2RlbEZvclNlYXJjaDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSUVkaXRvclByb2dyZXNzU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZVNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoU2VhcmNoRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB0ZXh0UmVzb3VyY2VTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3VwU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLiQoJy5zZWFyY2gtZWRpdG9yJyk7XG5cblx0XHR0aGlzLnNlYXJjaE9wZXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMb25nUnVubmluZ09wZXJhdGlvbihwcm9ncmVzc1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLnNlYXJjaEhpc3RvcnlEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwMCkpO1xuXG5cdFx0dGhpcy5zZWFyY2hNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoTW9kZWxJbXBsKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcblx0XHRET00uYXBwZW5kKHBhcmVudCwgdGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMucXVlcnlFZGl0b3JDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBET00uJCgnLnF1ZXJ5LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBzZWFyY2hSZXN1bHRDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBET00uJCgnLnNlYXJjaC1yZXN1bHRzJykpO1xuXHRcdHN1cGVyLmNyZWF0ZUVkaXRvcihzZWFyY2hSZXN1bHRDb250YWluZXIpO1xuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoKTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0SW5TZWFyY2hFZGl0b3IuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLmNyZWF0ZVF1ZXJ5RWRpdG9yKFxuXHRcdFx0dGhpcy5xdWVyeUVkaXRvckNvbnRhaW5lcixcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKSxcblx0XHRcdFNlYXJjaENvbnRleHQuSW5wdXRCb3hGb2N1c2VkS2V5LmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSlcblx0XHQpO1xuXHR9XG5cblxuXHRwcml2YXRlIGNyZWF0ZVF1ZXJ5RWRpdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIGlucHV0Qm94Rm9jdXNlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+KSB7XG5cdFx0Y29uc3Qgc2VhcmNoRWRpdG9ySW5wdXRib3hTdHlsZXMgPSBnZXRJbnB1dEJveFN0eWxlKHsgaW5wdXRCb3JkZXI6IHNlYXJjaEVkaXRvclRleHRJbnB1dEJvcmRlciB9KTtcblxuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hXaWRnZXQsIGNvbnRhaW5lciwgeyBfaGlkZVJlcGxhY2VUb2dnbGU6IHRydWUsIHNob3dDb250ZXh0VG9nZ2xlOiB0cnVlLCBpbnB1dEJveFN0eWxlczogc2VhcmNoRWRpdG9ySW5wdXRib3hTdHlsZXMsIHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5xdWVyeUVkaXRvcldpZGdldC5vblJlcGxhY2VUb2dnbGVkKCgpID0+IHRoaXMucmVMYXlvdXQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucXVlcnlFZGl0b3JXaWRnZXQub25EaWRIZWlnaHRDaGFuZ2UoKCkgPT4gdGhpcy5yZUxheW91dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5xdWVyeUVkaXRvcldpZGdldC5vblNlYXJjaFN1Ym1pdCgoeyBkZWxheSB9KSA9PiB0aGlzLnRyaWdnZXJTZWFyY2goeyBkZWxheSB9KSkpO1xuXHRcdGlmICh0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Lm9uRGlkT3B0aW9uQ2hhbmdlKCgpID0+IHRoaXMudHJpZ2dlclNlYXJjaCh7IHJlc2V0Q3Vyc29yOiBmYWxzZSB9KSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignU2VhcmNoRWRpdG9yOiBTZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQgaXMgdW5kZWZpbmVkLCBjYW5ub3QgcmVnaXN0ZXIgb25EaWRPcHRpb25DaGFuZ2UgbGlzdGVuZXInKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5xdWVyeUVkaXRvcldpZGdldC5vbkRpZFRvZ2dsZUNvbnRleHQoKCkgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlIH0pKSk7XG5cblx0XHQvLyBJbmNsdWRlcy9FeGNsdWRlcyBEcm9wZG93blxuXHRcdHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmluY2x1ZGVzLWV4Y2x1ZGVzJykpO1xuXG5cdFx0Ly8gVG9nZ2xlIHF1ZXJ5IGRldGFpbHMgYnV0dG9uXG5cdFx0Y29uc3QgdG9nZ2xlUXVlcnlEZXRhaWxzTGFiZWwgPSBsb2NhbGl6ZSgnbW9yZVNlYXJjaCcsIFwiVG9nZ2xlIFNlYXJjaCBEZXRhaWxzXCIpO1xuXHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uID0gRE9NLmFwcGVuZCh0aGlzLmluY2x1ZGVzRXhjbHVkZXNDb250YWluZXIsIERPTS4kKCcuZXhwYW5kJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHNlYXJjaERldGFpbHNJY29uKSwgeyB0YWJpbmRleDogMCwgcm9sZTogJ2J1dHRvbicsICdhcmlhLWxhYmVsJzogdG9nZ2xlUXVlcnlEZXRhaWxzTGFiZWwgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCB0b2dnbGVRdWVyeURldGFpbHNMYWJlbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24sIERPTS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR0aGlzLnRvZ2dsZUluY2x1ZGVzRXhjbHVkZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiwgRE9NLkV2ZW50VHlwZS5LRVlfVVAsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdFx0dGhpcy50b2dnbGVJbmNsdWRlc0V4Y2x1ZGVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24sIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRpZiAodGhpcy5xdWVyeUVkaXRvcldpZGdldC5pc1JlcGxhY2VBY3RpdmUoKSkge1xuXHRcdFx0XHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuZm9jdXNSZXBsYWNlQWxsQWN0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5pc1JlcGxhY2VTaG93bigpID8gdGhpcy5xdWVyeUVkaXRvcldpZGdldC5yZXBsYWNlSW5wdXQ/LmZvY3VzT25QcmVzZXJ2ZSgpIDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5mb2N1c1JlZ2V4QWN0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5jbHVkZXNcblx0XHRjb25zdCBmb2xkZXJJbmNsdWRlc0xpc3QgPSBET00uYXBwZW5kKHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lciwgRE9NLiQoJy5maWxlLXR5cGVzLmluY2x1ZGVzJykpO1xuXHRcdGNvbnN0IGZpbGVzVG9JbmNsdWRlVGl0bGUgPSBsb2NhbGl6ZSgnc2VhcmNoU2NvcGUuaW5jbHVkZXMnLCBcImZpbGVzIHRvIGluY2x1ZGVcIik7XG5cdFx0RE9NLmFwcGVuZChmb2xkZXJJbmNsdWRlc0xpc3QsIERPTS4kKCdoNCcsIHVuZGVmaW5lZCwgZmlsZXNUb0luY2x1ZGVUaXRsZSkpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmNsdWRlUGF0dGVybklucHV0V2lkZ2V0LCBmb2xkZXJJbmNsdWRlc0xpc3QsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdsYWJlbC5pbmNsdWRlcycsICdTZWFyY2ggSW5jbHVkZSBQYXR0ZXJucycpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IHNlYXJjaEVkaXRvcklucHV0Ym94U3R5bGVzXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25TdWJtaXQodHJpZ2dlcmVkT25UeXBlID0+IHRoaXMudHJpZ2dlclNlYXJjaCh7IHJlc2V0Q3Vyc29yOiBmYWxzZSwgZGVsYXk6IHRyaWdnZXJlZE9uVHlwZSA/IHRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaE9uVHlwZURlYm91bmNlUGVyaW9kIDogMCB9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25DaGFuZ2VTZWFyY2hJbkVkaXRvcnNCb3goKCkgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKCkpKTtcblxuXHRcdC8vIEV4Y2x1ZGVzXG5cdFx0Y29uc3QgZXhjbHVkZXNMaXN0ID0gRE9NLmFwcGVuZCh0aGlzLmluY2x1ZGVzRXhjbHVkZXNDb250YWluZXIsIERPTS4kKCcuZmlsZS10eXBlcy5leGNsdWRlcycpKTtcblx0XHRjb25zdCBleGNsdWRlc1RpdGxlID0gbG9jYWxpemUoJ3NlYXJjaFNjb3BlLmV4Y2x1ZGVzJywgXCJmaWxlcyB0byBleGNsdWRlXCIpO1xuXHRcdERPTS5hcHBlbmQoZXhjbHVkZXNMaXN0LCBET00uJCgnaDQnLCB1bmRlZmluZWQsIGV4Y2x1ZGVzVGl0bGUpKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldCwgZXhjbHVkZXNMaXN0LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnbGFiZWwuZXhjbHVkZXMnLCAnU2VhcmNoIEV4Y2x1ZGUgUGF0dGVybnMnKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBzZWFyY2hFZGl0b3JJbnB1dGJveFN0eWxlc1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLm9uU3VibWl0KHRyaWdnZXJlZE9uVHlwZSA9PiB0aGlzLnRyaWdnZXJTZWFyY2goeyByZXNldEN1cnNvcjogZmFsc2UsIGRlbGF5OiB0cmlnZ2VyZWRPblR5cGUgPyB0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hPblR5cGVEZWJvdW5jZVBlcmlvZCA6IDAgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLm9uQ2hhbmdlSWdub3JlQm94KCgpID0+IHRoaXMudHJpZ2dlclNlYXJjaCgpKSk7XG5cblx0XHQvLyBNZXNzYWdlc1xuXHRcdHRoaXMubWVzc2FnZUJveCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLm1lc3NhZ2VzLnRleHQtc2VhcmNoLXByb3ZpZGVyLW1lc3NhZ2VzJykpO1xuXG5cdFx0W3RoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXRGb2N1c1RyYWNrZXIsIHRoaXMucXVlcnlFZGl0b3JXaWRnZXQucmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyLCB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmlucHV0Rm9jdXNUcmFja2VyLCB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0Rm9jdXNUcmFja2VyXVxuXHRcdFx0LmZvckVhY2godHJhY2tlciA9PiB7XG5cdFx0XHRcdGlmICghdHJhY2tlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0cmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gc2V0VGltZW91dCgoKSA9PiBpbnB1dEJveEZvY3VzZWRDb250ZXh0S2V5LnNldCh0cnVlKSwgMCkpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gaW5wdXRCb3hGb2N1c2VkQ29udGV4dEtleS5zZXQoZmFsc2UpKSk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlUnVuQWdhaW5NZXNzYWdlKHNob3c6IGJvb2xlYW4pIHtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMubWVzc2FnZUJveCk7XG5cdFx0dGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmIChzaG93KSB7XG5cdFx0XHRjb25zdCBydW5BZ2FpbkxpbmsgPSBET00uYXBwZW5kKHRoaXMubWVzc2FnZUJveCwgRE9NLiQoJ2EucG9pbnRlci5wcm9taW5lbnQubWVzc2FnZScsIHt9LCBsb2NhbGl6ZSgncnVuU2VhcmNoJywgXCJSdW4gU2VhcmNoXCIpKSk7XG5cdFx0XHR0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihydW5BZ2FpbkxpbmssIERPTS5FdmVudFR5cGUuQ0xJQ0ssIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmlnZ2VyU2VhcmNoKCk7XG5cdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29udHJpYnV0aW9ucygpOiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0Y29uc3Qgc2tpcENvbnRyaWJ1dGlvbnMgPSBbVW51c3VhbExpbmVUZXJtaW5hdG9yc0RldGVjdG9yLklEXTtcblx0XHRyZXR1cm4gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKS5maWx0ZXIoYyA9PiBza2lwQ29udHJpYnV0aW9ucy5pbmRleE9mKGMuaWQpID09PSAtMSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0Q29kZUVkaXRvcldpZGdldE9wdGlvbnMoKTogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIHtcblx0XHRyZXR1cm4geyBjb250cmlidXRpb25zOiB0aGlzLl9nZXRDb250cmlidXRpb25zKCkgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iub25Nb3VzZVVwKGUgPT4ge1xuXHRcdFx0aWYgKGUuZXZlbnQuZGV0YWlsID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGJlaGF2aW91ciA9IHRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaEVkaXRvci5zaW5nbGVDbGlja0JlaGF2aW91cjtcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBlLnRhcmdldC5wb3NpdGlvbjtcblx0XHRcdFx0aWYgKHBvc2l0aW9uICYmIGJlaGF2aW91ciA9PT0gJ3BlZWtEZWZpbml0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSA/PyAnJztcblx0XHRcdFx0XHRpZiAobGluZS5tYXRjaChGSUxFX0xJTkVfUkVHRVgpIHx8IGxpbmUubWF0Y2goUkVTVUxUX0xJTkVfUkVHRVgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5zZXRTZWxlY3Rpb24oUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbikpO1xuXHRcdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZWRpdG9yLmFjdGlvbi5wZWVrRGVmaW5pdGlvbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmV2ZW50LmRldGFpbCA9PT0gMikge1xuXHRcdFx0XHRjb25zdCBiZWhhdmlvdXIgPSB0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hFZGl0b3IuZG91YmxlQ2xpY2tCZWhhdmlvdXI7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gZS50YXJnZXQucG9zaXRpb247XG5cdFx0XHRcdGlmIChwb3NpdGlvbiAmJiBiZWhhdmlvdXIgIT09ICdzZWxlY3RXb3JkJykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSA/PyAnJztcblx0XHRcdFx0XHRpZiAobGluZS5tYXRjaChSRVNVTFRfTElORV9SRUdFWCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSk7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGJlaGF2aW91ciA9PT0gJ2dvVG9Mb2NhdGlvbicgPyAnZWRpdG9yLmFjdGlvbi5nb1RvRGVjbGFyYXRpb24nIDogJ2VkaXRvci5hY3Rpb24ub3BlbkRlY2xhcmF0aW9uVG9UaGVTaWRlJyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChsaW5lLm1hdGNoKEZJTEVfTElORV9SRUdFWCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSk7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdlZGl0b3IuYWN0aW9uLnBlZWtEZWZpbml0aW9uJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy51cGRhdGluZ01vZGVsRm9yU2VhcmNoKSB7XG5cdFx0XHRcdHRoaXMuZ2V0SW5wdXQoKT8uc2V0RGlydHkodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3I7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5sb2FkRWRpdG9yVmlld1N0YXRlKHRoaXMuZ2V0SW5wdXQoKSk7XG5cdFx0aWYgKHZpZXdTdGF0ZSAmJiB2aWV3U3RhdGUuZm9jdXNlZCA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c1NlYXJjaElucHV0KCkge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LmZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c0ZpbGVzVG9JbmNsdWRlSW5wdXQoKSB7XG5cdFx0aWYgKCF0aGlzLnNob3dpbmdJbmNsdWRlc0V4Y2x1ZGVzKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUluY2x1ZGVzRXhjbHVkZXModHJ1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzRmlsZXNUb0V4Y2x1ZGVJbnB1dCgpIHtcblx0XHRpZiAoIXRoaXMuc2hvd2luZ0luY2x1ZGVzRXhjbHVkZXMpIHtcblx0XHRcdHRoaXMudG9nZ2xlSW5jbHVkZXNFeGNsdWRlcyh0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNOZXh0SW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHRpZiAodGhpcy5zaG93aW5nSW5jbHVkZXNFeGNsdWRlcykge1xuXHRcdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0Ly8gcGFzc1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzUHJldklucHV0KCkge1xuXHRcdGlmICh0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZm9jdXMoKTsgLy8gd3JhcFxuXHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0Ly8gdW5yZWFjaGFibGUuXG5cdFx0fVxuXHR9XG5cblx0c2V0UXVlcnkocXVlcnk6IHN0cmluZykge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFZhbHVlKHF1ZXJ5KTtcblx0fVxuXG5cdHNlbGVjdFF1ZXJ5KCkge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNlbGVjdCgpO1xuXHR9XG5cblx0dG9nZ2xlV2hvbGVXb3JkcygpIHtcblx0XHR0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRXaG9sZVdvcmRzKCF0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0LmdldFdob2xlV29yZHMoKSk7XG5cdFx0dGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlIH0pO1xuXHR9XG5cblx0dG9nZ2xlUmVnZXgoKSB7XG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uc2V0UmVnZXgoIXRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0UmVnZXgoKSk7XG5cdFx0dGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlIH0pO1xuXHR9XG5cblx0dG9nZ2xlQ2FzZVNlbnNpdGl2ZSgpIHtcblx0XHR0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRDYXNlU2Vuc2l0aXZlKCF0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0LmdldENhc2VTZW5zaXRpdmUoKSk7XG5cdFx0dGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlIH0pO1xuXHR9XG5cblx0dG9nZ2xlQ29udGV4dExpbmVzKCkge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQudG9nZ2xlQ29udGV4dExpbmVzKCk7XG5cdH1cblxuXHRtb2RpZnlDb250ZXh0TGluZXMoaW5jcmVhc2U6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0Lm1vZGlmeUNvbnRleHRMaW5lcyhpbmNyZWFzZSk7XG5cdH1cblxuXHR0b2dnbGVRdWVyeURldGFpbHMoc2hvdWxkU2hvdz86IGJvb2xlYW4pIHtcblx0XHR0aGlzLnRvZ2dsZUluY2x1ZGVzRXhjbHVkZXMoc2hvdWxkU2hvdyk7XG5cdH1cblxuXHRkZWxldGVSZXN1bHRCbG9jaygpIHtcblx0XHRjb25zdCBsaW5lc1RvRGVsZXRlID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIShzZWxlY3Rpb25zICYmIG1vZGVsKSkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IG1heExpbmUgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBtaW5MaW5lID0gMTtcblxuXHRcdGNvbnN0IGRlbGV0ZVVwID0gKHN0YXJ0OiBudW1iZXIpID0+IHtcblx0XHRcdGZvciAobGV0IGN1cnNvciA9IHN0YXJ0OyBjdXJzb3IgPj0gbWluTGluZTsgY3Vyc29yLS0pIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGN1cnNvcik7XG5cdFx0XHRcdGxpbmVzVG9EZWxldGUuYWRkKGN1cnNvcik7XG5cdFx0XHRcdGlmIChsaW5lWzBdICE9PSB1bmRlZmluZWQgJiYgbGluZVswXSAhPT0gJyAnKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVsZXRlRG93biA9IChzdGFydDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGxpbmVzVG9EZWxldGUuYWRkKHN0YXJ0KTtcblx0XHRcdGZvciAobGV0IGN1cnNvciA9IHN0YXJ0ICsgMTsgY3Vyc29yIDw9IG1heExpbmU7IGN1cnNvcisrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChjdXJzb3IpO1xuXHRcdFx0XHRpZiAobGluZVswXSAhPT0gdW5kZWZpbmVkICYmIGxpbmVbMF0gIT09ICcgJykge1xuXHRcdFx0XHRcdHJldHVybiBjdXJzb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGluZXNUb0RlbGV0ZS5hZGQoY3Vyc29yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZW5kaW5nQ3Vyc29yTGluZXM6IEFycmF5PG51bWJlciB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGVuZGluZ0N1cnNvckxpbmVzLnB1c2goZGVsZXRlRG93bihsaW5lTnVtYmVyKSk7XG5cdFx0XHRkZWxldGVVcChsaW5lTnVtYmVyKTtcblx0XHRcdGZvciAobGV0IGlubmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjsgaW5uZXIgPD0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7IGlubmVyKyspIHtcblx0XHRcdFx0bGluZXNUb0RlbGV0ZS5hZGQoaW5uZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbmRpbmdDdXJzb3JMaW5lcy5sZW5ndGggPT09IDApIHsgZW5kaW5nQ3Vyc29yTGluZXMucHVzaCgxKTsgfVxuXG5cdFx0Y29uc3QgaXNEZWZpbmVkID0gPFQ+KHg6IFQgfCB1bmRlZmluZWQpOiB4IGlzIFQgPT4geCAhPT0gdW5kZWZpbmVkO1xuXG5cdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldFNlbGVjdGlvbnMoKSxcblx0XHRcdFsuLi5saW5lc1RvRGVsZXRlXS5tYXAobGluZSA9PiAoeyByYW5nZTogbmV3IFJhbmdlKGxpbmUsIDEsIGxpbmUgKyAxLCAxKSwgdGV4dDogJycgfSkpLFxuXHRcdFx0KCkgPT4gZW5kaW5nQ3Vyc29yTGluZXMuZmlsdGVyKGlzRGVmaW5lZCkubWFwKGxpbmUgPT4gbmV3IFNlbGVjdGlvbihsaW5lLCAxLCBsaW5lLCAxKSkpO1xuXHR9XG5cblx0Y2xlYW5TdGF0ZSgpIHtcblx0XHR0aGlzLmdldElucHV0KCk/LnNldERpcnR5KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHNlYXJjaENvbmZpZygpOiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBpdGVyYXRlVGhyb3VnaE1hdGNoZXMocmV2ZXJzZTogYm9vbGVhbikge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgbGFzdExpbmUgPSBtb2RlbC5nZXRMaW5lQ291bnQoKSA/PyAxO1xuXHRcdGNvbnN0IGxhc3RDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTGVuZ3RoKGxhc3RMaW5lKTtcblxuXHRcdGNvbnN0IGZhbGxiYWNrU3RhcnQgPSByZXZlcnNlID8gbmV3IFBvc2l0aW9uKGxhc3RMaW5lLCBsYXN0Q29sdW1uKSA6IG5ldyBQb3NpdGlvbigxLCAxKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRQb3NpdGlvbiA9IHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldFNlbGVjdGlvbigpPy5nZXRTdGFydFBvc2l0aW9uKCkgPz8gZmFsbGJhY2tTdGFydDtcblxuXHRcdGNvbnN0IG1hdGNoUmFuZ2VzID0gdGhpcy5nZXRJbnB1dCgpPy5nZXRNYXRjaFJhbmdlcygpO1xuXHRcdGlmICghbWF0Y2hSYW5nZXMpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBtYXRjaFJhbmdlID0gKHJldmVyc2UgPyBmaW5kUHJldlJhbmdlIDogZmluZE5leHRSYW5nZSkobWF0Y2hSYW5nZXMsIGN1cnJlbnRQb3NpdGlvbik7XG5cdFx0aWYgKCFtYXRjaFJhbmdlKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0U2VsZWN0aW9uKG1hdGNoUmFuZ2UpO1xuXHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KG1hdGNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpO1xuXG5cdFx0Y29uc3QgbWF0Y2hMaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KG1hdGNoUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBtYXRjaFRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobWF0Y2hSYW5nZSk7XG5cdFx0bGV0IGZpbGUgPSAnJztcblx0XHRmb3IgKGxldCBsaW5lID0gbWF0Y2hSYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmUgPj0gMTsgbGluZS0tKSB7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UobGluZSwgMSwgbGluZSwgMikpO1xuXHRcdFx0aWYgKGxpbmVUZXh0ICE9PSAnICcpIHsgZmlsZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmUpOyBicmVhazsgfVxuXHRcdH1cblx0XHRhbGVydChsb2NhbGl6ZSgnc2VhcmNoUmVzdWx0SXRlbScsIFwiTWF0Y2hlZCB7MH0gYXQgezF9IGluIGZpbGUgezJ9XCIsIG1hdGNoVGV4dCwgbWF0Y2hMaW5lVGV4dCwgZmlsZS5zbGljZSgwLCBmaWxlLmxlbmd0aCAtIDEpKSk7XG5cdH1cblxuXHRmb2N1c05leHRSZXN1bHQoKSB7XG5cdFx0dGhpcy5pdGVyYXRlVGhyb3VnaE1hdGNoZXMoZmFsc2UpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c1Jlc3VsdCgpIHtcblx0XHR0aGlzLml0ZXJhdGVUaHJvdWdoTWF0Y2hlcyh0cnVlKTtcblx0fVxuXG5cdGZvY3VzQWxsUmVzdWx0cygpIHtcblx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvclxuXHRcdFx0LnNldFNlbGVjdGlvbnMoKHRoaXMuZ2V0SW5wdXQoKT8uZ2V0TWF0Y2hSYW5nZXMoKSA/PyBbXSkubWFwKFxuXHRcdFx0XHRyYW5nZSA9PiBuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbikpKTtcblx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclNlYXJjaChfb3B0aW9ucz86IHsgcmVzZXRDdXJzb3I/OiBib29sZWFuOyBkZWxheT86IG51bWJlcjsgZm9jdXNSZXN1bHRzPzogYm9vbGVhbiB9KSB7XG5cdFx0Y29uc3QgZm9jdXNSZXN1bHRzID0gdGhpcy5zZWFyY2hDb25maWcuc2VhcmNoRWRpdG9yLmZvY3VzUmVzdWx0c09uU2VhcmNoO1xuXG5cdFx0Ly8gSWYgX29wdGlvbnMgZG9uJ3QgZGVmaW5lIGZvY3VzUmVzdWx0IGZpZWxkLCB0aGVuIHVzZSB0aGUgc2V0dGluZ1xuXHRcdGlmIChfb3B0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRfb3B0aW9ucyA9IHsgZm9jdXNSZXN1bHRzOiBmb2N1c1Jlc3VsdHMgfTtcblx0XHR9IGVsc2UgaWYgKF9vcHRpb25zLmZvY3VzUmVzdWx0cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRfb3B0aW9ucy5mb2N1c1Jlc3VsdHMgPSBmb2N1c1Jlc3VsdHM7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgcmVzZXRDdXJzb3I6IHRydWUsIGRlbGF5OiAwLCAuLi5fb3B0aW9ucyB9O1xuXG5cdFx0aWYgKCEodGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uaW5wdXRCb3guaXNJbnB1dFZhbGlkKCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnBhdXNlU2VhcmNoaW5nKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJ1blNlYXJjaERlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlUnVuQWdhaW5NZXNzYWdlKGZhbHNlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1J1blNlYXJjaCgpO1xuXHRcdFx0XHRpZiAob3B0aW9ucy5yZXNldEN1cnNvcikge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IDAsIHNjcm9sbExlZnQ6IDAgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnMuZm9jdXNSZXN1bHRzKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgb3B0aW9ucy5kZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkQ29uZmlnRnJvbVdpZGdldCgpOiBTZWFyY2hDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNDYXNlU2Vuc2l0aXZlOiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5nZXRDYXNlU2Vuc2l0aXZlKCkgPz8gZmFsc2UsXG5cdFx0XHRjb250ZXh0TGluZXM6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuZ2V0Q29udGV4dExpbmVzKCksXG5cdFx0XHRmaWxlc1RvRXhjbHVkZTogdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5nZXRWYWx1ZSgpLFxuXHRcdFx0ZmlsZXNUb0luY2x1ZGU6IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZ2V0VmFsdWUoKSxcblx0XHRcdHF1ZXJ5OiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5nZXRWYWx1ZSgpID8/ICcnLFxuXHRcdFx0aXNSZWdleHA6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LmdldFJlZ2V4KCkgPz8gZmFsc2UsXG5cdFx0XHRtYXRjaFdob2xlV29yZDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uZ2V0V2hvbGVXb3JkcygpID8/IGZhbHNlLFxuXHRcdFx0dXNlRXhjbHVkZVNldHRpbmdzQW5kSWdub3JlRmlsZXM6IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMudXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcygpLFxuXHRcdFx0b25seU9wZW5FZGl0b3JzOiB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKCksXG5cdFx0XHRzaG93SW5jbHVkZXNFeGNsdWRlczogdGhpcy5zaG93aW5nSW5jbHVkZXNFeGNsdWRlcyxcblx0XHRcdG5vdGVib29rU2VhcmNoQ29uZmlnOiB7XG5cdFx0XHRcdGluY2x1ZGVNYXJrdXBJbnB1dDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBJbnB1dCxcblx0XHRcdFx0aW5jbHVkZU1hcmt1cFByZXZpZXc6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkubWFya3VwUHJldmlldyxcblx0XHRcdFx0aW5jbHVkZUNvZGVJbnB1dDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5jb2RlSW5wdXQsXG5cdFx0XHRcdGluY2x1ZGVPdXRwdXQ6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkuY29kZU91dHB1dCxcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1J1blNlYXJjaCgpIHtcblx0XHR0aGlzLnNlYXJjaE1vZGVsLmNhbmNlbFNlYXJjaCh0cnVlKTtcblxuXHRcdGNvbnN0IHN0YXJ0SW5wdXQgPSB0aGlzLmdldElucHV0KCk7XG5cdFx0aWYgKCFzdGFydElucHV0KSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5zZWFyY2hIaXN0b3J5RGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/Lm9uU2VhcmNoU3VibWl0KCk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLm9uU2VhcmNoU3VibWl0KCk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9uU2VhcmNoU3VibWl0KCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb25maWcgPSB0aGlzLnJlYWRDb25maWdGcm9tV2lkZ2V0KCk7XG5cblx0XHRpZiAoIWNvbmZpZy5xdWVyeSkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGNvbnRlbnQ6IElQYXR0ZXJuSW5mbyA9IHtcblx0XHRcdHBhdHRlcm46IGNvbmZpZy5xdWVyeSxcblx0XHRcdGlzUmVnRXhwOiBjb25maWcuaXNSZWdleHAsXG5cdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IGNvbmZpZy5pc0Nhc2VTZW5zaXRpdmUsXG5cdFx0XHRpc1dvcmRNYXRjaDogY29uZmlnLm1hdGNoV2hvbGVXb3JkLFxuXHRcdH07XG5cblx0XHRjb25zdCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMgPSB7XG5cdFx0XHRfcmVhc29uOiAnc2VhcmNoRWRpdG9yJyxcblx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPdXRPZldvcmtzcGFjZUVkaXRvclJlc291cmNlcyksXG5cdFx0XHRtYXhSZXN1bHRzOiB0aGlzLnNlYXJjaENvbmZpZy5tYXhSZXN1bHRzID8/IHVuZGVmaW5lZCxcblx0XHRcdGRpc3JlZ2FyZElnbm9yZUZpbGVzOiAhY29uZmlnLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdGRpc3JlZ2FyZEV4Y2x1ZGVTZXR0aW5nczogIWNvbmZpZy51c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRleGNsdWRlUGF0dGVybjogW3sgcGF0dGVybjogY29uZmlnLmZpbGVzVG9FeGNsdWRlIH1dLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm46IGNvbmZpZy5maWxlc1RvSW5jbHVkZSxcblx0XHRcdG9ubHlPcGVuRWRpdG9yczogY29uZmlnLm9ubHlPcGVuRWRpdG9ycyxcblx0XHRcdHByZXZpZXdPcHRpb25zOiB7XG5cdFx0XHRcdG1hdGNoTGluZXM6IDEsXG5cdFx0XHRcdGNoYXJzUGVyTGluZTogMTAwMFxuXHRcdFx0fSxcblx0XHRcdHN1cnJvdW5kaW5nQ29udGV4dDogY29uZmlnLmNvbnRleHRMaW5lcyxcblx0XHRcdGlzU21hcnRDYXNlOiB0aGlzLnNlYXJjaENvbmZpZy5zbWFydENhc2UsXG5cdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZSxcblx0XHRcdG5vdGVib29rU2VhcmNoQ29uZmlnOiB7XG5cdFx0XHRcdGluY2x1ZGVNYXJrdXBJbnB1dDogY29uZmlnLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVNYXJrdXBJbnB1dCxcblx0XHRcdFx0aW5jbHVkZU1hcmt1cFByZXZpZXc6IGNvbmZpZy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlTWFya3VwUHJldmlldyxcblx0XHRcdFx0aW5jbHVkZUNvZGVJbnB1dDogY29uZmlnLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVDb2RlSW5wdXQsXG5cdFx0XHRcdGluY2x1ZGVPdXRwdXQ6IGNvbmZpZy5ub3RlYm9va1NlYXJjaENvbmZpZy5pbmNsdWRlT3V0cHV0LFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBmb2xkZXJSZXNvdXJjZXMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0bGV0IHF1ZXJ5OiBJVGV4dFF1ZXJ5O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBxdWVyeUJ1aWxkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1ZXJ5QnVpbGRlcik7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5QnVpbGRlci50ZXh0KGNvbnRlbnQsIGZvbGRlclJlc291cmNlcy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpLCBvcHRpb25zKTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VhcmNoT3BlcmF0aW9uLnN0YXJ0KDUwMCk7XG5cdFx0dGhpcy5vbmdvaW5nT3BlcmF0aW9ucysrO1xuXG5cdFx0Y29uc3QgeyBjb25maWd1cmF0aW9uTW9kZWwgfSA9IGF3YWl0IHN0YXJ0SW5wdXQucmVzb2x2ZU1vZGVscygpO1xuXHRcdGNvbmZpZ3VyYXRpb25Nb2RlbC51cGRhdGVDb25maWcoY29uZmlnKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNlYXJjaE1vZGVsLnNlYXJjaChxdWVyeSk7XG5cdFx0c3RhcnRJbnB1dC5vbmdvaW5nU2VhcmNoT3BlcmF0aW9uID0gcmVzdWx0LmFzeW5jUmVzdWx0cy5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMub25nb2luZ09wZXJhdGlvbnMtLTtcblx0XHRcdGlmICh0aGlzLm9uZ29pbmdPcGVyYXRpb25zID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoT3BlcmF0aW9uLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlYXJjaE9wZXJhdGlvbiA9IGF3YWl0IHN0YXJ0SW5wdXQub25nb2luZ1NlYXJjaE9wZXJhdGlvbjtcblx0XHRhd2FpdCB0aGlzLm9uU2VhcmNoQ29tcGxldGUoc2VhcmNoT3BlcmF0aW9uLCBjb25maWcsIHN0YXJ0SW5wdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaENvbXBsZXRlKHNlYXJjaE9wZXJhdGlvbjogSVNlYXJjaENvbXBsZXRlLCBzdGFydENvbmZpZzogU2VhcmNoQ29uZmlndXJhdGlvbiwgc3RhcnRJbnB1dDogU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuZ2V0SW5wdXQoKTtcblx0XHRpZiAoIWlucHV0IHx8XG5cdFx0XHRpbnB1dCAhPT0gc3RhcnRJbnB1dCB8fFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoc3RhcnRDb25maWcpICE9PSBKU09OLnN0cmluZ2lmeSh0aGlzLnJlYWRDb25maWdGcm9tV2lkZ2V0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aW5wdXQub25nb2luZ1NlYXJjaE9wZXJhdGlvbiA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHNvcnRPcmRlciA9IHRoaXMuc2VhcmNoQ29uZmlnLnNvcnRPcmRlcjtcblx0XHRpZiAoc29ydE9yZGVyID09PSBTZWFyY2hTb3J0T3JkZXIuTW9kaWZpZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucmV0cmlldmVGaWxlU3RhdHModGhpcy5zZWFyY2hNb2RlbC5zZWFyY2hSZXN1bHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBSZWZlcmVuY2VzQ29udHJvbGxlci5nZXQodGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IpO1xuXHRcdGNvbnRyb2xsZXI/LmNsb3NlV2lkZ2V0KGZhbHNlKTtcblx0XHRjb25zdCBsYWJlbEZvcm1hdHRlciA9ICh1cmk6IFVSSSk6IHN0cmluZyA9PiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1cmksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHNlcmlhbGl6ZVNlYXJjaFJlc3VsdEZvckVkaXRvcih0aGlzLnNlYXJjaE1vZGVsLnNlYXJjaFJlc3VsdCwgc3RhcnRDb25maWcuZmlsZXNUb0luY2x1ZGUsIHN0YXJ0Q29uZmlnLmZpbGVzVG9FeGNsdWRlLCBzdGFydENvbmZpZy5jb250ZXh0TGluZXMsIGxhYmVsRm9ybWF0dGVyLCBzb3J0T3JkZXIsIHNlYXJjaE9wZXJhdGlvbj8ubGltaXRIaXQpO1xuXHRcdGNvbnN0IHsgcmVzdWx0c01vZGVsIH0gPSBhd2FpdCBpbnB1dC5yZXNvbHZlTW9kZWxzKCk7XG5cdFx0dGhpcy51cGRhdGluZ01vZGVsRm9yU2VhcmNoID0gdHJ1ZTtcblx0XHR0aGlzLm1vZGVsU2VydmljZS51cGRhdGVNb2RlbChyZXN1bHRzTW9kZWwsIHJlc3VsdHMudGV4dCk7XG5cdFx0dGhpcy51cGRhdGluZ01vZGVsRm9yU2VhcmNoID0gZmFsc2U7XG5cblx0XHRpZiAoc2VhcmNoT3BlcmF0aW9uICYmIHNlYXJjaE9wZXJhdGlvbi5tZXNzYWdlcykge1xuXHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHNlYXJjaE9wZXJhdGlvbi5tZXNzYWdlcykge1xuXHRcdFx0XHR0aGlzLmFkZE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucmVMYXlvdXQoKTtcblxuXHRcdGlucHV0LnNldERpcnR5KCFpbnB1dC5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSk7XG5cdFx0aW5wdXQuc2V0TWF0Y2hSYW5nZXMocmVzdWx0cy5tYXRjaFJhbmdlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFkZE1lc3NhZ2UobWVzc2FnZTogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZSkge1xuXHRcdGxldCBtZXNzYWdlQm94OiBIVE1MRWxlbWVudDtcblx0XHRpZiAodGhpcy5tZXNzYWdlQm94LmZpcnN0Q2hpbGQpIHtcblx0XHRcdG1lc3NhZ2VCb3ggPSB0aGlzLm1lc3NhZ2VCb3guZmlyc3RDaGlsZCBhcyBIVE1MRWxlbWVudDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZUJveCA9IERPTS5hcHBlbmQodGhpcy5tZXNzYWdlQm94LCBET00uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0fVxuXG5cdFx0RE9NLmFwcGVuZChtZXNzYWdlQm94LCByZW5kZXJTZWFyY2hNZXNzYWdlKG1lc3NhZ2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMubm90aWZpY2F0aW9uU2VydmljZSwgdGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcywgKCkgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmV0cmlldmVGaWxlU3RhdHMoc2VhcmNoUmVzdWx0OiBJU2VhcmNoUmVzdWx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXMgPSBzZWFyY2hSZXN1bHQubWF0Y2hlcygpLmZpbHRlcihmID0+ICFmLmZpbGVTdGF0KS5tYXAoZiA9PiBmLnJlc29sdmVGaWxlU3RhdCh0aGlzLmZpbGVTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbikge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXHRcdHRoaXMucmVMYXlvdXQoKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkKCkge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRNb2RlbCgpPy5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKSA/PyAnJztcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSByZUxheW91dCgpIHtcblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2V0V2lkdGgodGhpcy5kaW1lbnNpb24ud2lkdGggLSAyOCAvKiBjb250YWluZXIgbWFyZ2luICovKTtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmxheW91dCh7IGhlaWdodDogdGhpcy5kaW1lbnNpb24uaGVpZ2h0IC0gRE9NLmdldFRvdGFsSGVpZ2h0KHRoaXMucXVlcnlFZGl0b3JDb250YWluZXIpLCB3aWR0aDogdGhpcy5kaW1lbnNpb24ud2lkdGggfSk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFdpZHRoKHRoaXMuZGltZW5zaW9uLndpZHRoIC0gMjggLyogY29udGFpbmVyIG1hcmdpbiAqLyk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldFdpZHRoKHRoaXMuZGltZW5zaW9uLndpZHRoIC0gMjggLyogY29udGFpbmVyIG1hcmdpbiAqLyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbnB1dCgpOiBTZWFyY2hFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQgYXMgU2VhcmNoRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRwcml2YXRlIHByaW9yQ29uZmlnOiBQYXJ0aWFsPFJlYWRvbmx5PFNlYXJjaENvbmZpZ3VyYXRpb24+PiB8IHVuZGVmaW5lZDtcblx0c2V0U2VhcmNoQ29uZmlnKGNvbmZpZzogUGFydGlhbDxSZWFkb25seTxTZWFyY2hDb25maWd1cmF0aW9uPj4pIHtcblx0XHR0aGlzLnByaW9yQ29uZmlnID0gY29uZmlnO1xuXHRcdGlmIChjb25maWcucXVlcnkgIT09IHVuZGVmaW5lZCkgeyB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNldFZhbHVlKGNvbmZpZy5xdWVyeSk7IH1cblx0XHRpZiAoY29uZmlnLmlzQ2FzZVNlbnNpdGl2ZSAhPT0gdW5kZWZpbmVkKSB7IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldENhc2VTZW5zaXRpdmUoY29uZmlnLmlzQ2FzZVNlbnNpdGl2ZSk7IH1cblx0XHRpZiAoY29uZmlnLmlzUmVnZXhwICE9PSB1bmRlZmluZWQpIHsgdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uc2V0UmVnZXgoY29uZmlnLmlzUmVnZXhwKTsgfVxuXHRcdGlmIChjb25maWcubWF0Y2hXaG9sZVdvcmQgIT09IHVuZGVmaW5lZCkgeyB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRXaG9sZVdvcmRzKGNvbmZpZy5tYXRjaFdob2xlV29yZCk7IH1cblx0XHRpZiAoY29uZmlnLmNvbnRleHRMaW5lcyAhPT0gdW5kZWZpbmVkKSB7IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2V0Q29udGV4dExpbmVzKGNvbmZpZy5jb250ZXh0TGluZXMpOyB9XG5cdFx0aWYgKGNvbmZpZy5maWxlc1RvRXhjbHVkZSAhPT0gdW5kZWZpbmVkKSB7IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VmFsdWUoY29uZmlnLmZpbGVzVG9FeGNsdWRlKTsgfVxuXHRcdGlmIChjb25maWcuZmlsZXNUb0luY2x1ZGUgIT09IHVuZGVmaW5lZCkgeyB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldFZhbHVlKGNvbmZpZy5maWxlc1RvSW5jbHVkZSk7IH1cblx0XHRpZiAoY29uZmlnLm9ubHlPcGVuRWRpdG9ycyAhPT0gdW5kZWZpbmVkKSB7IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluT3BlbkVkaXRvcnMoY29uZmlnLm9ubHlPcGVuRWRpdG9ycyk7IH1cblx0XHRpZiAoY29uZmlnLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzICE9PSB1bmRlZmluZWQpIHsgdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZXRVc2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKGNvbmZpZy51c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlcyk7IH1cblx0XHRpZiAoY29uZmlnLnNob3dJbmNsdWRlc0V4Y2x1ZGVzICE9PSB1bmRlZmluZWQpIHsgdGhpcy50b2dnbGVJbmNsdWRlc0V4Y2x1ZGVzKGNvbmZpZy5zaG93SW5jbHVkZXNFeGNsdWRlcyk7IH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KG5ld0lucHV0OiBTZWFyY2hFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuc2V0SW5wdXQobmV3SW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNvbmZpZ3VyYXRpb25Nb2RlbCwgcmVzdWx0c01vZGVsIH0gPSBhd2FpdCBuZXdJbnB1dC5yZXNvbHZlTW9kZWxzKCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0TW9kZWwocmVzdWx0c01vZGVsKTtcblx0XHR0aGlzLnBhdXNlU2VhcmNoaW5nID0gdHJ1ZTtcblxuXHRcdHRoaXMudG9nZ2xlUnVuQWdhaW5NZXNzYWdlKCFuZXdJbnB1dC5vbmdvaW5nU2VhcmNoT3BlcmF0aW9uICYmIHJlc3VsdHNNb2RlbC5nZXRMaW5lQ291bnQoKSA9PT0gMSAmJiByZXN1bHRzTW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA9PT0gMCAmJiBjb25maWd1cmF0aW9uTW9kZWwuY29uZmlnLnF1ZXJ5ICE9PSAnJyk7XG5cblx0XHR0aGlzLnNldFNlYXJjaENvbmZpZyhjb25maWd1cmF0aW9uTW9kZWwuY29uZmlnKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25Nb2RlbC5vbkNvbmZpZ0RpZFVwZGF0ZShuZXdDb25maWcgPT4ge1xuXHRcdFx0aWYgKG5ld0NvbmZpZyAhPT0gdGhpcy5wcmlvckNvbmZpZykge1xuXHRcdFx0XHR0aGlzLnBhdXNlU2VhcmNoaW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5zZXRTZWFyY2hDb25maWcobmV3Q29uZmlnKTtcblx0XHRcdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVzdG9yZVZpZXdTdGF0ZShjb250ZXh0KTtcblxuXHRcdGlmICghb3B0aW9ucz8ucHJlc2VydmVGb2N1cykge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblxuXHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSBmYWxzZTtcblxuXHRcdGlmIChuZXdJbnB1dC5vbmdvaW5nU2VhcmNoT3BlcmF0aW9uKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ0NvbmZpZyA9IHRoaXMucmVhZENvbmZpZ0Zyb21XaWRnZXQoKTtcblx0XHRcdG5ld0lucHV0Lm9uZ29pbmdTZWFyY2hPcGVyYXRpb24udGhlbihjb21wbGV0ZSA9PiB7XG5cdFx0XHRcdHRoaXMub25TZWFyY2hDb21wbGV0ZShjb21wbGV0ZSwgZXhpc3RpbmdDb25maWcsIG5ld0lucHV0KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlSW5jbHVkZXNFeGNsdWRlcyhfc2hvdWxkU2hvdz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjbHMgPSAnZXhwYW5kZWQnO1xuXHRcdGNvbnN0IHNob3VsZFNob3cgPSBfc2hvdWxkU2hvdyA/PyAhdGhpcy5pbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucyhjbHMpO1xuXG5cdFx0aWYgKHNob3VsZFNob3cpIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0XHR0aGlzLmluY2x1ZGVzRXhjbHVkZXNDb250YWluZXIuY2xhc3NMaXN0LmFkZChjbHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGNscyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93aW5nSW5jbHVkZXNFeGNsdWRlcyA9IHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoY2xzKTtcblxuXHRcdHRoaXMucmVMYXlvdXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB0b0VkaXRvclZpZXdTdGF0ZVJlc291cmNlKGlucHV0OiBFZGl0b3JJbnB1dCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlucHV0LnR5cGVJZCA9PT0gU2VhcmNoRWRpdG9ySW5wdXRUeXBlSWQpIHtcblx0XHRcdHJldHVybiAoaW5wdXQgYXMgU2VhcmNoRWRpdG9ySW5wdXQpLm1vZGVsVXJpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZUVkaXRvclZpZXdTdGF0ZShyZXNvdXJjZTogVVJJKTogU2VhcmNoRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb250cm9sID0gdGhpcy5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3QgZWRpdG9yVmlld1N0YXRlID0gY29udHJvbC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0aWYgKCFlZGl0b3JWaWV3U3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpICE9PSB0aGlzLmdldElucHV0KCk/Lm1vZGVsVXJpLnRvU3RyaW5nKCkpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0cmV0dXJuIHsgLi4uZWRpdG9yVmlld1N0YXRlLCBmb2N1c2VkOiB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5oYXNXaWRnZXRGb2N1cygpID8gJ2VkaXRvcicgOiAnaW5wdXQnIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgdHJhY2tzRWRpdG9yVmlld1N0YXRlKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dC50eXBlSWQgPT09IFNlYXJjaEVkaXRvcklucHV0VHlwZUlkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlVmlld1N0YXRlKGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCkge1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMubG9hZEVkaXRvclZpZXdTdGF0ZSh0aGlzLmdldElucHV0KCksIGNvbnRleHQpO1xuXHRcdGlmICh2aWV3U3RhdGUpIHsgdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IucmVzdG9yZVZpZXdTdGF0ZSh2aWV3U3RhdGUpOyB9XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5wdXQoKT8uZ2V0TmFtZSgpID8/IGxvY2FsaXplKCdzZWFyY2hFZGl0b3InLCBcIlNlYXJjaFwiKTtcblx0fVxufVxuXG5jb25zdCBzZWFyY2hFZGl0b3JUZXh0SW5wdXRCb3JkZXIgPSByZWdpc3RlckNvbG9yKCdzZWFyY2hFZGl0b3IudGV4dElucHV0Qm9yZGVyJywgaW5wdXRCb3JkZXIsIGxvY2FsaXplKCd0ZXh0SW5wdXRCb3hCb3JkZXInLCBcIlNlYXJjaCBlZGl0b3IgdGV4dCBpbnB1dCBib3ggYm9yZGVyLlwiKSk7XG5cbmZ1bmN0aW9uIGZpbmROZXh0UmFuZ2UobWF0Y2hSYW5nZXM6IFJhbmdlW10sIGN1cnJlbnRQb3NpdGlvbjogUG9zaXRpb24pIHtcblx0Zm9yIChjb25zdCBtYXRjaFJhbmdlIG9mIG1hdGNoUmFuZ2VzKSB7XG5cdFx0aWYgKFBvc2l0aW9uLmlzQmVmb3JlKGN1cnJlbnRQb3NpdGlvbiwgbWF0Y2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2hSYW5nZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG1hdGNoUmFuZ2VzWzBdO1xufVxuXG5mdW5jdGlvbiBmaW5kUHJldlJhbmdlKG1hdGNoUmFuZ2VzOiBSYW5nZVtdLCBjdXJyZW50UG9zaXRpb246IFBvc2l0aW9uKSB7XG5cdGZvciAobGV0IGkgPSBtYXRjaFJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGNvbnN0IG1hdGNoUmFuZ2UgPSBtYXRjaFJhbmdlc1tpXTtcblx0XHRpZiAoUG9zaXRpb24uaXNCZWZvcmUobWF0Y2hSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIGN1cnJlbnRQb3NpdGlvbikpIHtcblx0XHRcdHtcblx0XHRcdFx0cmV0dXJuIG1hdGNoUmFuZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBtYXRjaFJhbmdlc1ttYXRjaFJhbmdlcy5sZW5ndGggLSAxXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFFckMsT0FBTztBQUVQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0IsNEJBQTRCO0FBQzdELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYSxxQkFBcUI7QUFDM0MsU0FBUyxxQkFBcUI7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TztBQUFBLElBQVc7QUFFdEYsV0FBTyxFQUFFLEdBQUcsaUJBQWlCLFNBQVMsS0FBSyxtQkFBbUIsZUFBZSxJQUFJLFdBQVcsUUFBUTtBQUFBLEVBQ3JHO0FBQUEsRUFFVSxzQkFBc0IsT0FBNkI7QUFDNUQsV0FBTyxNQUFNLFdBQVc7QUFBQSxFQUN6QjtBQUFBLEVBRVEsaUJBQWlCLFNBQTZCO0FBQ3JELFVBQU0sWUFBWSxLQUFLLG9CQUFvQixLQUFLLFNBQVMsR0FBRyxPQUFPO0FBQ25FLFFBQUksV0FBVztBQUFFLFdBQUssbUJBQW1CLGlCQUFpQixTQUFTO0FBQUEsSUFBRztBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxlQUFlO0FBQ2QsV0FBTyxLQUFLLFNBQVMsR0FBRyxRQUFRLEtBQUssU0FBUyxnQkFBZ0IsUUFBUTtBQUFBLEVBQ3ZFO0FBQ0Q7QUE5c0JhLGFBQ0ksS0FBYTtBQURqQixhQUdJLDBDQUEwQztBQUg5QyxlQUFOO0FBQUEsRUE0Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTlDVTtBQWd0QmIsTUFBTSw4QkFBOEIsY0FBYyxnQ0FBZ0MsYUFBYSxTQUFTLHNCQUFzQixzQ0FBc0MsQ0FBQztBQUVySyxTQUFTLGNBQWMsYUFBc0IsaUJBQTJCO0FBQ3ZFLGFBQVcsY0FBYyxhQUFhO0FBQ3JDLFFBQUksU0FBUyxTQUFTLGlCQUFpQixXQUFXLGlCQUFpQixDQUFDLEdBQUc7QUFDdEUsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTyxZQUFZLENBQUM7QUFDckI7QUFFQSxTQUFTLGNBQWMsYUFBc0IsaUJBQTJCO0FBQ3ZFLFdBQVMsSUFBSSxZQUFZLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUNqRCxVQUFNLGFBQWEsWUFBWSxDQUFDO0FBQ2hDLFFBQUksU0FBUyxTQUFTLFdBQVcsaUJBQWlCLEdBQUcsZUFBZSxHQUFHO0FBQ3RFO0FBQ0MsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU8sWUFBWSxZQUFZLFNBQVMsQ0FBQztBQUMxQzsiLAogICJuYW1lcyI6IFtdCn0K
