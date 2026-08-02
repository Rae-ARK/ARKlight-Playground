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
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { ObjectTreeElementCollapseState } from "../../../../base/browser/ui/tree/tree.js";
import { Delayer, RunOnceScheduler, Throttler } from "../../../../base/common/async.js";
import * as errors from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isLinux } from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import * as network from "../../../../base/common/network.js";
import "./media/searchview.css";
import { getCodeEditor, isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { CommonFindController } from "../../../../editor/contrib/find/browser/findController.js";
import { MultiCursorSelectionController } from "../../../../editor/contrib/multicursor/browser/multicursor.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { getSelectionKeyboardEvent, WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService, withSelection } from "../../../../platform/opener/common/opener.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { OpenFolderAction } from "../../../browser/actions/workspaceActions.js";
import { ResourceListDnDHandler } from "../../../browser/dnd.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { Memento } from "../../../common/memento.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { NotebookEditor } from "../../notebook/browser/notebookEditor.js";
import { ExcludePatternInputWidget, IncludePatternInputWidget } from "./patternInputWidget.js";
import { searchDetailsIcon } from "./searchIcons.js";
import { renderSearchMessage } from "./searchMessage.js";
import { FileMatchRenderer, FolderMatchRenderer, MatchRenderer, SearchAccessibilityProvider, SearchDelegate, TextSearchResultRenderer } from "./searchResultsView.js";
import { SearchWidget } from "./searchWidget.js";
import * as Constants from "../common/constants.js";
import { IReplaceService } from "./replace.js";
import { getOutOfWorkspaceEditorResources, SearchStateKey, SearchUIState } from "../common/search.js";
import { ISearchHistoryService, SearchHistoryService } from "../common/searchHistoryService.js";
import { createEditorFromSearchResult } from "../../searchEditor/browser/searchEditorActions.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { SemanticSearchBehavior, SearchCompletionExitCode, SearchSortOrder, TextSearchCompleteMessageType, ViewMode, isAIKeyword } from "../../../services/search/common/search.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { ISCMService } from "../../scm/common/scm.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ISearchViewModelWorkbenchService } from "./searchTreeModel/searchViewModelWorkbenchService.js";
import { isSearchTreeMatch, SearchModelLocation, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWithResource, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchHeader } from "./searchTreeModel/searchTreeCommon.js";
import { isIMatchInNotebook } from "./notebookSearch/notebookSearchModelBase.js";
import { searchMatchComparer } from "./searchCompare.js";
import { AIFolderMatchWorkspaceRootImpl } from "./AISearch/aiSearchModel.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { forcedExpandRecursively } from "./searchActionsTopBar.js";
const $ = dom.$;
var SearchViewPosition = /* @__PURE__ */ ((SearchViewPosition2) => {
  SearchViewPosition2[SearchViewPosition2["SideBar"] = 0] = "SideBar";
  SearchViewPosition2[SearchViewPosition2["Panel"] = 1] = "Panel";
  return SearchViewPosition2;
})(SearchViewPosition || {});
const SEARCH_CANCELLED_MESSAGE = nls.localize("searchCanceled", "Search was canceled before any results could be found - ");
const DEBOUNCE_DELAY = 75;
let SearchView = class extends ViewPane {
  constructor(options, fileService, editorService, codeEditorService, progressService, notificationService, dialogService, commandService, contextViewService, instantiationService, viewDescriptorService, configurationService, contextService, searchViewModelWorkbenchService, contextKeyService, replaceService, textFileService, preferencesService, themeService, searchHistoryService, contextMenuService, accessibilityService, keybindingService, storageService, openerService, hoverService, notebookService, logService, accessibilitySignalService, telemetryService, scmService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.fileService = fileService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.contextService = contextService;
    this.searchViewModelWorkbenchService = searchViewModelWorkbenchService;
    this.replaceService = replaceService;
    this.textFileService = textFileService;
    this.preferencesService = preferencesService;
    this.searchHistoryService = searchHistoryService;
    this.accessibilityService = accessibilityService;
    this.storageService = storageService;
    this.notebookService = notebookService;
    this.logService = logService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.telemetryService = telemetryService;
    this.scmService = scmService;
    this.isDisposed = false;
    this.lastFocusState = "input";
    this.messageDisposables = new DisposableStore();
    this.currentEditorCursorListener = this._register(new MutableDisposable());
    this.currentSearchQ = Promise.resolve();
    this.pauseSearching = false;
    this._visibleMatches = 0;
    this._cachedKeywords = [];
    this.container = dom.$(".search-view");
    this.viewletVisible = Constants.SearchContext.SearchViewVisibleKey.bindTo(this.contextKeyService);
    this.firstMatchFocused = Constants.SearchContext.FirstMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrMatchFocused = Constants.SearchContext.FileMatchOrMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrFolderMatchFocus = Constants.SearchContext.FileMatchOrFolderMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrFolderMatchWithResourceFocus = Constants.SearchContext.FileMatchOrFolderMatchWithResourceFocusKey.bindTo(this.contextKeyService);
    this.fileMatchFocused = Constants.SearchContext.FileFocusKey.bindTo(this.contextKeyService);
    this.folderMatchFocused = Constants.SearchContext.FolderFocusKey.bindTo(this.contextKeyService);
    this.folderMatchWithResourceFocused = Constants.SearchContext.ResourceFolderFocusKey.bindTo(this.contextKeyService);
    this.searchResultHeaderFocused = Constants.SearchContext.SearchResultHeaderFocused.bindTo(this.contextKeyService);
    this.hasSearchResultsKey = Constants.SearchContext.HasSearchResults.bindTo(this.contextKeyService);
    this.matchFocused = Constants.SearchContext.MatchFocusKey.bindTo(this.contextKeyService);
    this.searchStateKey = SearchStateKey.bindTo(this.contextKeyService);
    this.hasSearchPatternKey = Constants.SearchContext.ViewHasSearchPatternKey.bindTo(this.contextKeyService);
    this.hasReplacePatternKey = Constants.SearchContext.ViewHasReplacePatternKey.bindTo(this.contextKeyService);
    this.hasFilePatternKey = Constants.SearchContext.ViewHasFilePatternKey.bindTo(this.contextKeyService);
    this.hasSomeCollapsibleResultKey = Constants.SearchContext.ViewHasSomeCollapsibleKey.bindTo(this.contextKeyService);
    this.treeViewKey = Constants.SearchContext.InTreeViewKey.bindTo(this.contextKeyService);
    this.refreshTreeController = this._register(this.instantiationService.createInstance(RefreshTreeController, this, () => this.searchConfig));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      const keys = Constants.SearchContext.hasAIResultProvider.keys();
      if (e.affectsSome(new Set(keys))) {
        this.refreshHasAISetting();
      }
    }));
    this.contextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    Constants.SearchContext.SearchViewFocusedKey.bindTo(this.contextKeyService).set(true);
    this.inputBoxFocused = Constants.SearchContext.InputBoxFocusedKey.bindTo(this.contextKeyService);
    this.inputPatternIncludesFocused = Constants.SearchContext.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
    this.inputPatternExclusionsFocused = Constants.SearchContext.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
    this.isEditableItem = Constants.SearchContext.IsEditableItemKey.bindTo(this.contextKeyService);
    this.instantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("search.sortOrder")) {
        if (this.searchConfig.sortOrder === SearchSortOrder.Modified) {
          this.removeFileStats();
        }
        await this.refreshTreeController.queue();
      }
    }));
    this.viewModel = this.searchViewModelWorkbenchService.searchModel;
    this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
    this.memento = new Memento(this.id, storageService);
    this.viewletState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._register(this.fileService.onDidFilesChange((e) => this.onFilesChanged(e)));
    this._register(this.textFileService.untitled.onWillDispose((model) => this.onUntitledDidDispose(model.resource)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
    this._register(this.searchHistoryService.onDidClearHistory(() => this.clearHistory()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    const updateChangedFilesToggleEnabled = () => {
      const hasChanges = [...this.scmService.repositories].some(
        (repo) => repo.provider.groups.some((group) => group.resources.length > 0)
      );
      this.inputPatternIncludes?.setOnlySearchInChangedFilesEnabled(hasChanges);
    };
    const scmRepositoryListeners = this._register(new DisposableMap());
    const registerScmRepositoryListeners = (repository) => {
      scmRepositoryListeners.set(repository, repository.provider.onDidChangeResources(() => {
        updateChangedFilesToggleEnabled();
        if (this.inputPatternIncludes?.onlySearchInChangedFiles()) {
          this.triggerQueryChange();
        }
      }));
    };
    for (const repository of this.scmService.repositories) {
      registerScmRepositoryListeners(repository);
    }
    this._register(this.scmService.onDidAddRepository((repository) => {
      registerScmRepositoryListeners(repository);
      updateChangedFilesToggleEnabled();
    }));
    this._register(this.scmService.onDidRemoveRepository((repository) => {
      scmRepositoryListeners.deleteAndDispose(repository);
      updateChangedFilesToggleEnabled();
    }));
    this.delayedRefresh = this._register(new Delayer(250));
    this.addToSearchHistoryDelayer = this._register(new Delayer(2e3));
    this.toggleCollapseStateDelayer = this._register(new Delayer(100));
    this.triggerQueryDelayer = this._register(new Delayer(0));
    this.treeAccessibilityProvider = this.instantiationService.createInstance(SearchAccessibilityProvider, this);
    this.isTreeLayoutViewVisible = this.viewletState.view?.treeLayout ?? this.searchConfig.defaultViewMode === ViewMode.Tree;
    this._refreshResultsScheduler = this._register(new RunOnceScheduler(this._updateResults.bind(this), 80));
    this._register(this.storageService.onWillSaveState(() => {
      this._saveSearchHistoryService();
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, SearchHistoryService.SEARCH_HISTORY_KEY, this._store)(() => {
      const restoredHistory = this.searchHistoryService.load();
      if (restoredHistory.include) {
        this.inputPatternIncludes.prependHistory(restoredHistory.include);
      }
      if (restoredHistory.exclude) {
        this.inputPatternExcludes.prependHistory(restoredHistory.exclude);
      }
      if (restoredHistory.search) {
        this.searchWidget.prependSearchHistory(restoredHistory.search);
      }
      if (restoredHistory.replace) {
        this.searchWidget.prependReplaceHistory(restoredHistory.replace);
      }
    }));
    this.changedWhileHidden = this.hasSearchResults();
  }
  get cachedResults() {
    return this._cachedResults;
  }
  async queueRefreshTree() {
    return this.refreshTreeController.queue();
  }
  get isTreeLayoutViewVisible() {
    return this.treeViewKey.get() ?? false;
  }
  set isTreeLayoutViewVisible(visible) {
    this.treeViewKey.set(visible);
  }
  async setTreeView(visible) {
    if (visible === this.isTreeLayoutViewVisible) {
      return;
    }
    this.isTreeLayoutViewVisible = visible;
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    return this.refreshTreeController.queue();
  }
  get state() {
    return this.searchStateKey.get() ?? SearchUIState.Idle;
  }
  set state(v) {
    this.searchStateKey.set(v);
  }
  getContainer() {
    return this.container;
  }
  get searchResult() {
    return this.viewModel && this.viewModel.searchResult;
  }
  get model() {
    return this.viewModel;
  }
  async refreshHasAISetting() {
    const shouldShowAI = this.shouldShowAIResults();
    if (!this.tree || !this.tree.hasNode(this.searchResult)) {
      return;
    }
    if (shouldShowAI && !this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
      if (this.model.searchResult.getCachedSearchComplete(false)) {
        return this.refreshAndUpdateCount();
      }
    } else if (!shouldShowAI && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
      return this.refreshAndUpdateCount();
    }
  }
  onDidChangeWorkbenchState() {
    if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.searchWithoutFolderMessageElement) {
      dom.hide(this.searchWithoutFolderMessageElement);
    }
  }
  refreshInputs() {
    this.pauseSearching = true;
    this.searchWidget.setValue(this.viewModel.searchResult.query?.contentPattern.pattern ?? "");
    this.searchWidget.setReplaceAllActionState(false);
    this.searchWidget.toggleReplace(true);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(this.viewModel.searchResult.query?.onlyOpenEditors || false);
    this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(!this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles || true);
    this.searchIncludePattern.setValue("");
    this.searchExcludePattern.setValue("");
    this.pauseSearching = false;
  }
  async replaceSearchModel(searchModel, asyncResults) {
    let progressComplete;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: 0 }, (_progress) => {
      return new Promise((resolve) => progressComplete = resolve);
    });
    const slowTimer = setTimeout(() => {
      this.state = SearchUIState.SlowSearch;
    }, 2e3);
    this._refreshResultsScheduler.schedule();
    searchModel.location = SearchModelLocation.PANEL;
    searchModel.replaceActive = this.viewModel.isReplaceActive();
    searchModel.replaceString = this.searchWidget.getReplaceValue();
    this._onSearchResultChangedDisposable?.dispose();
    this._onSearchResultChangedDisposable = this._register(searchModel.onSearchResultChanged(async (event) => this.onSearchResultsChanged(event)));
    this.searchViewModelWorkbenchService.searchModel = searchModel;
    this.viewModel = searchModel;
    this.tree.setInput(this.viewModel.searchResult);
    await this.onSearchResultsChanged();
    this.refreshInputs();
    asyncResults.then((complete) => {
      clearTimeout(slowTimer);
      return this.onSearchComplete(progressComplete, void 0, void 0, complete);
    }, (e) => {
      clearTimeout(slowTimer);
      return this.onSearchError(e, progressComplete, void 0, void 0);
    });
    await this.expandIfSingularResult();
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.container = dom.append(parent, dom.$(".search-view"));
    this.searchWidgetsContainerElement = dom.append(this.container, $(".search-widgets-container"));
    this.createSearchWidget(this.searchWidgetsContainerElement);
    const history = this.searchHistoryService.load();
    const filePatterns = this.viewletState.query?.filePatterns || "";
    const patternExclusions = this.viewletState.query?.folderExclusions || "";
    const patternExclusionsHistory = history.exclude || [];
    const patternIncludes = this.viewletState.query?.folderIncludes || "";
    const patternIncludesHistory = history.include || [];
    const onlyOpenEditors = this.viewletState.query?.onlyOpenEditors || false;
    const queryDetailsExpanded = this.viewletState.query?.queryDetailsExpanded || "";
    const useExcludesAndIgnoreFiles = typeof this.viewletState.query?.useExcludesAndIgnoreFiles === "boolean" ? this.viewletState.query.useExcludesAndIgnoreFiles : true;
    this.queryDetails = dom.append(this.searchWidgetsContainerElement, $(".query-details"));
    const toggleQueryDetailsLabel = nls.localize("moreSearch", "Toggle Search Details");
    this.toggleQueryDetailsButton = dom.append(
      this.queryDetails,
      $(".more" + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: "button", "aria-label": toggleQueryDetailsLabel })
    );
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.toggleQueryDetailsButton, this.keybindingService.appendKeybinding(toggleQueryDetailsLabel, Constants.SearchCommandIds.ToggleQueryDetailsActionId)));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e);
      this.toggleQueryDetails(!this.accessibilityService.isScreenReaderOptimized());
    }));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e);
        this.toggleQueryDetails(false);
      }
    }));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this.searchWidget.isReplaceActive()) {
          this.searchWidget.focusReplaceAllAction();
        } else {
          this.searchWidget.isReplaceShown() ? this.searchWidget.replaceInput?.focusOnPreserve() : this.searchWidget.focusRegexAction();
        }
        dom.EventHelper.stop(e);
      }
    }));
    const folderIncludesList = dom.append(this.queryDetails, $(".file-types.includes"));
    const filesToIncludeTitle = nls.localize("searchScope.includes", "files to include");
    dom.append(folderIncludesList, $("h4", void 0, filesToIncludeTitle));
    this.inputPatternIncludes = this._register(this.instantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
      ariaLabel: filesToIncludeTitle,
      placeholder: nls.localize("placeholder.includes", "e.g. *.ts, src/**/include"),
      showPlaceholderOnFocus: true,
      history: patternIncludesHistory,
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.inputPatternIncludes.setValue(patternIncludes);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(onlyOpenEditors);
    this.inputPatternIncludes.setOnlySearchInChangedFilesEnabled(
      [...this.scmService.repositories].some((repo) => repo.provider.groups.some((group) => group.resources.length > 0))
    );
    this._register(this.inputPatternIncludes.onCancel(() => this.cancelSearch(false)));
    this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerQueryChange()));
    this._register(this.inputPatternIncludes.onChangeSearchInChangedFilesBox(() => this.triggerQueryChange()));
    this.trackInputBox(this.inputPatternIncludes.inputFocusTracker, this.inputPatternIncludesFocused);
    const excludesList = dom.append(this.queryDetails, $(".file-types.excludes"));
    const excludesTitle = nls.localize("searchScope.excludes", "files to exclude");
    dom.append(excludesList, $("h4", void 0, excludesTitle));
    this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
      ariaLabel: excludesTitle,
      placeholder: nls.localize("placeholder.excludes", "e.g. *.ts, src/**/exclude"),
      showPlaceholderOnFocus: true,
      history: patternExclusionsHistory,
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.inputPatternExcludes.setValue(patternExclusions);
    this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(useExcludesAndIgnoreFiles);
    this._register(this.inputPatternExcludes.onCancel(() => this.cancelSearch(false)));
    this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerQueryChange()));
    this.trackInputBox(this.inputPatternExcludes.inputFocusTracker, this.inputPatternExclusionsFocused);
    const updateHasFilePatternKey = () => this.hasFilePatternKey.set(this.inputPatternIncludes.getValue().length > 0 || this.inputPatternExcludes.getValue().length > 0);
    updateHasFilePatternKey();
    const onFilePatternSubmit = (triggeredOnType) => {
      this.triggerQueryChange({ triggeredOnType, delay: this.searchConfig.searchOnTypeDebouncePeriod });
      if (triggeredOnType) {
        updateHasFilePatternKey();
      }
    };
    this._register(this.inputPatternIncludes.onSubmit(onFilePatternSubmit));
    this._register(this.inputPatternExcludes.onSubmit(onFilePatternSubmit));
    this.messagesElement = dom.append(this.container, $(".messages.text-search-provider-messages"));
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.showSearchWithoutFolderMessage();
    }
    this.createSearchResultsView(this.container);
    if (filePatterns !== "" || patternExclusions !== "" || patternIncludes !== "" || queryDetailsExpanded !== "" || !useExcludesAndIgnoreFiles) {
      this.toggleQueryDetails(true, true, true);
    }
    this._onSearchResultChangedDisposable = this._register(this.viewModel.onSearchResultChanged(async (event) => await this.onSearchResultsChanged(event)));
    this._onAIResultChangedDisposable?.dispose();
    this._onAIResultChangedDisposable = this._register(
      this.viewModel.searchResult.aiTextSearchResult.onChange((e) => {
        if (this.tree && this.tree.hasNode(this.searchResult.aiTextSearchResult) && !e.removed) {
          this.tree.updateChildren(this.searchResult.aiTextSearchResult);
        }
      })
    );
    this._register(this.onDidChangeBodyVisibility((visible) => this.onVisibilityChanged(visible)));
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
  }
  updateIndentStyles(theme) {
    this.resultsElement.classList.toggle("hide-arrows", this.isTreeLayoutViewVisible && theme.hidesExplorerArrows);
  }
  async onVisibilityChanged(visible) {
    this.viewletVisible.set(visible);
    if (visible) {
      if (this.changedWhileHidden) {
        await this.refreshAndUpdateCount();
        this.changedWhileHidden = false;
      }
    } else {
      this.lastFocusState = "input";
    }
    this.viewModel?.searchResult.toggleHighlights(visible);
  }
  get searchAndReplaceWidget() {
    return this.searchWidget;
  }
  get searchIncludePattern() {
    return this.inputPatternIncludes;
  }
  get searchExcludePattern() {
    return this.inputPatternExcludes;
  }
  createSearchWidget(container) {
    const contentPattern = this.viewletState.query?.contentPattern || "";
    const replaceText = this.viewletState.query?.replaceText || "";
    const isRegex = this.viewletState.query?.regex === true;
    const isWholeWords = this.viewletState.query?.wholeWords === true;
    const isCaseSensitive = this.viewletState.query?.caseSensitive === true;
    const history = this.searchHistoryService.load();
    const searchHistory = history.search || this.viewletState.query?.searchHistory || [];
    const replaceHistory = history.replace || this.viewletState.query?.replaceHistory || [];
    const showReplace = typeof this.viewletState.view?.showReplace === "boolean" ? this.viewletState.view.showReplace : true;
    const preserveCase = this.viewletState.query?.preserveCase === true;
    const isInNotebookMarkdownInput = this.viewletState.query?.isInNotebookMarkdownInput ?? true;
    const isInNotebookMarkdownPreview = this.viewletState.query?.isInNotebookMarkdownPreview ?? true;
    const isInNotebookCellInput = this.viewletState.query?.isInNotebookCellInput ?? true;
    const isInNotebookCellOutput = this.viewletState.query?.isInNotebookCellOutput ?? true;
    this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, container, {
      value: contentPattern,
      replaceValue: replaceText,
      isRegex,
      isCaseSensitive,
      isWholeWords,
      searchHistory,
      replaceHistory,
      preserveCase,
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      notebookOptions: {
        isInNotebookMarkdownInput,
        isInNotebookMarkdownPreview,
        isInNotebookCellInput,
        isInNotebookCellOutput
      }
    }));
    if (!this.searchWidget.searchInput || !this.searchWidget.replaceInput) {
      this.logService.warn(`Cannot fully create search widget. Search or replace input undefined. SearchInput: ${this.searchWidget.searchInput}, ReplaceInput: ${this.searchWidget.replaceInput}`);
      return;
    }
    if (showReplace) {
      this.searchWidget.toggleReplace(true);
    }
    this._register(this.searchWidget.onSearchSubmit((options) => {
      const shouldRenderAIResults = this.configurationService.getValue("search").searchView.semanticSearchBehavior;
      if (shouldRenderAIResults === SemanticSearchBehavior.Auto) {
        this.logService.info(`SearchView: Automatically rendering AI results`);
      }
      this.triggerQueryChange({
        ...options,
        shouldKeepAIResults: false,
        shouldUpdateAISearch: shouldRenderAIResults === SemanticSearchBehavior.Auto
      });
    }));
    this._register(this.searchWidget.onSearchCancel(({ focus }) => this.cancelSearch(focus)));
    this._register(this.searchWidget.searchInput.onDidOptionChange(() => {
      this.triggerQueryChange({ shouldKeepAIResults: true });
    }));
    this._register(this.searchWidget.getNotebookFilters().onDidChange(() => this.triggerQueryChange({ shouldKeepAIResults: true })));
    const updateHasPatternKey = () => this.hasSearchPatternKey.set(this.searchWidget.searchInput ? this.searchWidget.searchInput.getValue().length > 0 : false);
    updateHasPatternKey();
    this._register(this.searchWidget.searchInput.onDidChange(() => updateHasPatternKey()));
    const updateHasReplacePatternKey = () => this.hasReplacePatternKey.set(this.searchWidget.getReplaceValue().length > 0);
    updateHasReplacePatternKey();
    this._register(this.searchWidget.replaceInput.inputBox.onDidChange(() => updateHasReplacePatternKey()));
    this._register(this.searchWidget.onDidHeightChange(() => this.reLayout()));
    this._register(this.searchWidget.onReplaceToggled(() => this.reLayout()));
    this._register(this.searchWidget.onReplaceStateChange(async (state) => {
      this.viewModel.replaceActive = state;
      await this.refreshTreeController.queue();
    }));
    this._register(this.searchWidget.onPreserveCaseChange(async (state) => {
      this.viewModel.preserveCase = state;
      await this.refreshTreeController.queue();
    }));
    this._register(this.searchWidget.onReplaceValueChanged(() => {
      this.viewModel.replaceString = this.searchWidget.getReplaceValue();
      this.delayedRefresh.trigger(async () => this.refreshTreeController.queue());
    }));
    this._register(this.searchWidget.onBlur(() => {
      this.toggleQueryDetailsButton.focus();
    }));
    this._register(this.searchWidget.onReplaceAll(() => this.replaceAll()));
    this.trackInputBox(this.searchWidget.searchInputFocusTracker);
    this.trackInputBox(this.searchWidget.replaceInputFocusTracker);
  }
  shouldShowAIResults() {
    const hasProvider = Constants.SearchContext.hasAIResultProvider.getValue(this.contextKeyService);
    return !!hasProvider;
  }
  async onConfigurationUpdated(event) {
    if (event && (event.affectsConfiguration("search.decorations.colors") || event.affectsConfiguration("search.decorations.badges"))) {
      return this.refreshTreeController.queue();
    }
  }
  trackInputBox(inputFocusTracker, contextKey) {
    if (!inputFocusTracker) {
      return;
    }
    this._register(inputFocusTracker.onDidFocus(() => {
      this.lastFocusState = "input";
      this.inputBoxFocused.set(true);
      contextKey?.set(true);
    }));
    this._register(inputFocusTracker.onDidBlur(() => {
      this.inputBoxFocused.set(this.searchWidget.searchInputHasFocus() || this.searchWidget.replaceInputHasFocus() || this.inputPatternIncludes.inputHasFocus() || this.inputPatternExcludes.inputHasFocus());
      contextKey?.set(false);
    }));
  }
  async onSearchResultsChanged(event) {
    if (this.isVisible()) {
      return this.refreshAndUpdateCount(event);
    } else {
      this.changedWhileHidden = true;
    }
  }
  async refreshAndUpdateCount(event) {
    this.searchWidget.setReplaceAllActionState(!this.viewModel.searchResult.isEmpty());
    this.updateSearchResultCount(this.viewModel.searchResult.query.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, event?.clearingAll);
    return this.refreshTreeController.queue(event);
  }
  originalShouldCollapse(match) {
    const collapseResults = this.searchConfig.collapseResults;
    return collapseResults === "alwaysCollapse" || !isSearchTreeMatch(match) && match.count() > 10 && collapseResults !== "alwaysExpand" ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded;
  }
  shouldCollapseAccordingToConfig(match) {
    const collapseResults = this.originalShouldCollapse(match);
    if (collapseResults === ObjectTreeElementCollapseState.PreserveOrCollapsed) {
      return true;
    }
    return false;
  }
  replaceAll() {
    if (this.viewModel.searchResult.count() === 0) {
      return;
    }
    const occurrences = this.viewModel.searchResult.count();
    const fileCount = this.viewModel.searchResult.fileCount();
    const replaceValue = this.searchWidget.getReplaceValue() || "";
    const afterReplaceAllMessage = this.buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue);
    let progressComplete;
    let progressReporter;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: 100, total: occurrences }, (p) => {
      progressReporter = p;
      return new Promise((resolve) => progressComplete = resolve);
    });
    const confirmation = {
      title: nls.localize("replaceAll.confirmation.title", "Replace All"),
      message: this.buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue),
      primaryButton: nls.localize({ key: "replaceAll.confirm.button", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    };
    this.dialogService.confirm(confirmation).then((res) => {
      if (res.confirmed) {
        this.searchWidget.setReplaceAllActionState(false);
        this.viewModel.searchResult.replaceAll(progressReporter).then(() => {
          progressComplete();
          const messageEl = this.clearMessage();
          dom.append(messageEl, afterReplaceAllMessage);
          this.reLayout();
        }, (error) => {
          progressComplete();
          errors.isCancellationError(error);
          this.notificationService.error(error);
        });
      } else {
        progressComplete();
      }
    });
  }
  buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue) {
    if (occurrences === 1) {
      if (fileCount === 1) {
        if (replaceValue) {
          return nls.localize("replaceAll.occurrence.file.message", "Replaced {0} occurrence across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
        }
        return nls.localize("removeAll.occurrence.file.message", "Replaced {0} occurrence across {1} file.", occurrences, fileCount);
      }
      if (replaceValue) {
        return nls.localize("replaceAll.occurrence.files.message", "Replaced {0} occurrence across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
      }
      return nls.localize("removeAll.occurrence.files.message", "Replaced {0} occurrence across {1} files.", occurrences, fileCount);
    }
    if (fileCount === 1) {
      if (replaceValue) {
        return nls.localize("replaceAll.occurrences.file.message", "Replaced {0} occurrences across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
      }
      return nls.localize("removeAll.occurrences.file.message", "Replaced {0} occurrences across {1} file.", occurrences, fileCount);
    }
    if (replaceValue) {
      return nls.localize("replaceAll.occurrences.files.message", "Replaced {0} occurrences across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
    }
    return nls.localize("removeAll.occurrences.files.message", "Replaced {0} occurrences across {1} files.", occurrences, fileCount);
  }
  buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue) {
    const truncateValue = (value) => {
      if (!value) {
        return value;
      }
      const lines = value.split("\n");
      if (lines.length > 10) {
        return lines.slice(0, 10).join("\n") + "\n...";
      }
      return value;
    };
    const displayReplaceValue = truncateValue(replaceValue);
    if (occurrences === 1) {
      if (fileCount === 1) {
        if (displayReplaceValue) {
          return nls.localize("removeAll.occurrence.file.confirmation.message", "Replace {0} occurrence across {1} file with '{2}'?", occurrences, fileCount, displayReplaceValue);
        }
        return nls.localize("replaceAll.occurrence.file.confirmation.message", "Replace {0} occurrence across {1} file?", occurrences, fileCount);
      }
      if (displayReplaceValue) {
        return nls.localize("removeAll.occurrence.files.confirmation.message", "Replace {0} occurrence across {1} files with '{2}'?", occurrences, fileCount, displayReplaceValue);
      }
      return nls.localize("replaceAll.occurrence.files.confirmation.message", "Replace {0} occurrence across {1} files?", occurrences, fileCount);
    }
    if (fileCount === 1) {
      if (displayReplaceValue) {
        return nls.localize("removeAll.occurrences.file.confirmation.message", "Replace {0} occurrences across {1} file with '{2}'?", occurrences, fileCount, displayReplaceValue);
      }
      return nls.localize("replaceAll.occurrences.file.confirmation.message", "Replace {0} occurrences across {1} file?", occurrences, fileCount);
    }
    if (displayReplaceValue) {
      return nls.localize("removeAll.occurrences.files.confirmation.message", "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, displayReplaceValue);
    }
    return nls.localize("replaceAll.occurrences.files.confirmation.message", "Replace {0} occurrences across {1} files?", occurrences, fileCount);
  }
  clearMessage() {
    this.searchWithoutFolderMessageElement = void 0;
    const wasHidden = this.messagesElement.style.display === "none";
    dom.clearNode(this.messagesElement);
    dom.show(this.messagesElement);
    this.messageDisposables.clear();
    const newMessage = dom.append(this.messagesElement, $(".message"));
    if (wasHidden) {
      this.reLayout();
    }
    return newMessage;
  }
  createSearchResultsView(container) {
    this.resultsElement = dom.append(container, $(".results.show-file-icons.file-icon-themable-tree"));
    const delegate = this.instantiationService.createInstance(SearchDelegate);
    const identityProvider = {
      getId(element) {
        return element.id();
      }
    };
    this.searchDataSource = this.instantiationService.createInstance(SearchViewDataSource, this);
    this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
    this.tree = this._register(this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SearchView",
      this.resultsElement,
      delegate,
      {
        isIncompressible: (element) => {
          if (isSearchTreeFolderMatch(element) && !isTextSearchHeading(element.parent()) && !isSearchTreeFolderMatchWorkspaceRoot(element.parent()) && !isSearchTreeFolderMatchNoRoot(element.parent())) {
            return false;
          }
          return true;
        }
      },
      [
        this._register(this.instantiationService.createInstance(FolderMatchRenderer, this, this.treeLabels)),
        this._register(this.instantiationService.createInstance(FileMatchRenderer, this, this.treeLabels)),
        this._register(this.instantiationService.createInstance(TextSearchResultRenderer, this.treeLabels)),
        this._register(this.instantiationService.createInstance(MatchRenderer, this))
      ],
      this.searchDataSource,
      {
        identityProvider,
        accessibilityProvider: this.treeAccessibilityProvider,
        dnd: this.instantiationService.createInstance(ResourceListDnDHandler, (element) => {
          if (isSearchTreeFileMatch(element)) {
            return element.resource;
          }
          if (isSearchTreeMatch(element)) {
            return withSelection(element.parent().resource, element.range());
          }
          return null;
        }),
        multipleSelectionSupport: true,
        selectionNavigation: true,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        paddingBottom: SearchDelegate.ITEM_HEIGHT,
        collapseByDefault: (e) => {
          if (isTextSearchHeading(e)) {
            return e.isAIContributed;
          }
          if (isSearchTreeFolderMatch(e) && e.matches().length === 1 && isSearchTreeFolderMatch(e.matches()[0])) {
            return false;
          }
          return this.shouldCollapseAccordingToConfig(e);
        }
      }
    ));
    Constants.SearchContext.SearchResultListFocusedKey.bindTo(this.tree.contextKeyService);
    this.tree.setInput(this.viewModel.searchResult);
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    const updateHasSomeCollapsible = () => this.toggleCollapseStateDelayer.trigger(() => this.hasSomeCollapsibleResultKey.set(this.hasSomeCollapsible()));
    updateHasSomeCollapsible();
    this._register(this.tree.onDidChangeCollapseState(() => updateHasSomeCollapsible()));
    this._register(this.tree.onDidChangeModel(() => updateHasSomeCollapsible()));
    this._register(Event.debounce(this.tree.onDidOpen, (last, event) => event, DEBOUNCE_DELAY, true)((options) => {
      if (isSearchTreeMatch(options.element)) {
        const selectedMatch = options.element;
        this.currentSelectedFileMatch?.setSelectedMatch(null);
        this.currentSelectedFileMatch = selectedMatch.parent();
        this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);
        this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
      }
    }));
    this._register(Event.debounce(this.tree.onDidChangeFocus, (last, event) => event, DEBOUNCE_DELAY, true)(() => {
      const selection = this.tree.getSelection();
      const focus = this.tree.getFocus()[0];
      if (selection.length > 1 && isSearchTreeMatch(focus)) {
        this.onFocus(focus, true);
      }
    }));
    this._register(Event.any(this.tree.onDidFocus, this.tree.onDidChangeFocus)(() => {
      const focus = this.tree.getFocus()[0];
      if (this.tree.isDOMFocused()) {
        const firstElem = this.tree.getFirstElementChild(this.tree.getInput());
        this.firstMatchFocused.set(firstElem === focus);
        this.fileMatchOrMatchFocused.set(!!focus);
        this.fileMatchFocused.set(isSearchTreeFileMatch(focus));
        this.folderMatchFocused.set(isSearchTreeFolderMatch(focus));
        this.matchFocused.set(isSearchTreeMatch(focus));
        this.fileMatchOrFolderMatchFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatch(focus));
        this.fileMatchOrFolderMatchWithResourceFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatchWithResource(focus));
        this.folderMatchWithResourceFocused.set(isSearchTreeFolderMatchWithResource(focus));
        this.searchResultHeaderFocused.set(isSearchHeader(focus));
        this.lastFocusState = "tree";
      }
      let editable = false;
      if (isSearchTreeMatch(focus)) {
        editable = !focus.isReadonly;
      } else if (isSearchTreeFileMatch(focus)) {
        editable = !focus.hasOnlyReadOnlyMatches();
      } else if (isSearchTreeFolderMatch(focus)) {
        editable = !focus.hasOnlyReadOnlyMatches();
      }
      this.isEditableItem.set(editable);
    }));
    this._register(this.tree.onDidBlur(() => {
      this.firstMatchFocused.reset();
      this.fileMatchOrMatchFocused.reset();
      this.fileMatchFocused.reset();
      this.folderMatchFocused.reset();
      this.matchFocused.reset();
      this.fileMatchOrFolderMatchFocus.reset();
      this.fileMatchOrFolderMatchWithResourceFocus.reset();
      this.folderMatchWithResourceFocused.reset();
      this.searchResultHeaderFocused.reset();
      this.isEditableItem.reset();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      const editor = getCodeEditor(this.editorService.activeTextEditorControl);
      this.currentEditorCursorListener.value = editor?.onDidChangeCursorPosition(() => {
        this.currentSelectedFileMatch?.setSelectedMatch(null);
        this.currentSelectedFileMatch = void 0;
      });
    }));
  }
  onContextMenu(e) {
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    const selection = this.tree.getSelection();
    let arg;
    let context;
    if (selection && selection.length > 0) {
      arg = e.element;
      context = selection;
    } else {
      context = e.element;
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.SearchContext,
      menuActionOptions: { shouldForwardArgs: true, arg },
      contextKeyService: this.contextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => context
    });
  }
  hasSomeCollapsible() {
    const viewer = this.getControl();
    const navigator = viewer.navigate();
    let node = navigator.first();
    const shouldShowAI = this.shouldShowAIResults();
    do {
      if (node && !viewer.isCollapsed(node) && (!shouldShowAI || !isTextSearchHeading(node))) {
        return true;
      }
    } while (node = navigator.next());
    return false;
  }
  async selectNextMatch() {
    if (!this.hasSearchResults()) {
      return;
    }
    const [selected] = this.tree.getSelection();
    if (selected && !isSearchTreeMatch(selected)) {
      if (this.tree.isCollapsed(selected)) {
        await this.tree.expand(selected);
      }
    }
    const navigator = this.tree.navigate(selected);
    let next = navigator.next();
    if (!next) {
      next = navigator.first();
    }
    while (next && !isSearchTreeMatch(next)) {
      if (this.tree.isCollapsed(next)) {
        await this.tree.expand(next);
      }
      next = navigator.next();
    }
    if (next) {
      if (next === selected) {
        this.tree.setFocus([]);
      }
      const event = getSelectionKeyboardEvent(void 0, false, false);
      this.tree.setFocus([next], event);
      this.tree.setSelection([next], event);
      this.tree.reveal(next);
      const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(next);
      if (ariaLabel) {
        aria.status(ariaLabel);
      }
    }
  }
  async selectPreviousMatch() {
    if (!this.hasSearchResults()) {
      return;
    }
    const [selected] = this.tree.getSelection();
    let navigator = this.tree.navigate(selected);
    let prev = navigator.previous();
    while (!prev || !isSearchTreeMatch(prev) && !this.tree.isCollapsed(prev)) {
      const nextPrev = prev ? navigator.previous() : navigator.last();
      if (!prev && !nextPrev) {
        return;
      }
      prev = nextPrev;
    }
    while (prev && !isSearchTreeMatch(prev)) {
      const nextItem = navigator.next();
      if (!nextItem) {
        break;
      }
      await this.tree.expand(prev);
      navigator = this.tree.navigate(nextItem);
      prev = nextItem ? navigator.previous() : navigator.last();
    }
    if (prev) {
      if (prev === selected) {
        this.tree.setFocus([]);
      }
      const event = getSelectionKeyboardEvent(void 0, false, false);
      this.tree.setFocus([prev], event);
      this.tree.setSelection([prev], event);
      this.tree.reveal(prev);
      const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(prev);
      if (ariaLabel) {
        aria.status(ariaLabel);
      }
    }
  }
  moveFocusToResults() {
    this.tree.domFocus();
  }
  focus() {
    super.focus();
    if (this.lastFocusState === "input" || !this.hasSearchResults()) {
      const updatedText = this.searchConfig.seedOnFocus ? this.updateTextFromSelection({ allowSearchOnType: false }) : false;
      this.searchWidget.focus(void 0, void 0, updatedText);
    } else {
      this.tree.domFocus();
    }
  }
  updateTextFromFindWidgetOrSelection({ allowUnselectedWord = true, allowSearchOnType = true }) {
    let activeEditor = this.editorService.activeTextEditorControl;
    if (isCodeEditor(activeEditor) && !activeEditor?.hasTextFocus()) {
      const controller = CommonFindController.get(activeEditor);
      if (controller && controller.isFindInputFocused()) {
        return this.updateTextFromFindWidget(controller, { allowSearchOnType });
      }
      const editors = this.codeEditorService.listCodeEditors();
      activeEditor = editors.find((editor) => editor instanceof EmbeddedCodeEditorWidget && editor.getParentEditor() === activeEditor && editor.hasTextFocus()) ?? activeEditor;
    }
    return this.updateTextFromSelection({ allowUnselectedWord, allowSearchOnType }, activeEditor);
  }
  updateTextFromFindWidget(controller, { allowSearchOnType = true }) {
    if (!this.searchConfig.seedWithNearestWord && (dom.getActiveWindow().getSelection()?.toString() ?? "") === "") {
      return false;
    }
    const searchString = controller.getState().searchString;
    if (searchString === "") {
      return false;
    }
    this.searchWidget.searchInput?.setCaseSensitive(controller.getState().matchCase);
    this.searchWidget.searchInput?.setWholeWords(controller.getState().wholeWord);
    this.searchWidget.searchInput?.setRegex(controller.getState().isRegex);
    this.updateText(searchString, allowSearchOnType);
    return true;
  }
  updateTextFromSelection({ allowUnselectedWord = true, allowSearchOnType = true }, editor) {
    const seedSearchStringFromSelection = this.configurationService.getValue("editor").find.seedSearchStringFromSelection;
    if (!seedSearchStringFromSelection || seedSearchStringFromSelection === "never") {
      return false;
    }
    let selectedText = this.getSearchTextFromEditor(allowUnselectedWord, editor);
    if (selectedText === null) {
      return false;
    }
    if (this.searchWidget.searchInput?.getRegex()) {
      selectedText = strings.escapeRegExpCharacters(selectedText);
    }
    this.updateText(selectedText, allowSearchOnType);
    return true;
  }
  updateText(text, allowSearchOnType = true) {
    if (allowSearchOnType && !this.viewModel.searchResult.isDirty) {
      this.searchWidget.setValue(text);
    } else {
      this.pauseSearching = true;
      this.searchWidget.setValue(text);
      this.pauseSearching = false;
    }
  }
  focusNextInputBox() {
    if (this.searchWidget.searchInputHasFocus()) {
      if (this.searchWidget.isReplaceShown()) {
        this.searchWidget.focus(true, true);
      } else {
        this.moveFocusFromSearchOrReplace();
      }
      return;
    }
    if (this.searchWidget.replaceInputHasFocus()) {
      this.moveFocusFromSearchOrReplace();
      return;
    }
    if (this.inputPatternIncludes.inputHasFocus()) {
      this.inputPatternExcludes.focus();
      this.inputPatternExcludes.select();
      return;
    }
    if (this.inputPatternExcludes.inputHasFocus()) {
      this.selectTreeIfNotSelected();
      return;
    }
  }
  moveFocusFromSearchOrReplace() {
    if (this.showsFileTypes()) {
      this.toggleQueryDetails(true, this.showsFileTypes());
    } else {
      this.selectTreeIfNotSelected();
    }
  }
  focusPreviousInputBox() {
    if (this.searchWidget.searchInputHasFocus()) {
      return;
    }
    if (this.searchWidget.replaceInputHasFocus()) {
      this.searchWidget.focus(true);
      return;
    }
    if (this.inputPatternIncludes.inputHasFocus()) {
      this.searchWidget.focus(true, true);
      return;
    }
    if (this.inputPatternExcludes.inputHasFocus()) {
      this.inputPatternIncludes.focus();
      this.inputPatternIncludes.select();
      return;
    }
    if (this.tree.isDOMFocused()) {
      this.moveFocusFromResults();
      return;
    }
  }
  moveFocusFromResults() {
    if (this.showsFileTypes()) {
      this.toggleQueryDetails(true, true, false, true);
    } else {
      this.searchWidget.focus(true, true);
    }
  }
  reLayout() {
    if (this.isDisposed || !this.size) {
      return;
    }
    const actionsPosition = this.searchConfig.actionsPosition;
    this.getContainer().classList.toggle(SearchView.ACTIONS_RIGHT_CLASS_NAME, actionsPosition === "right");
    this.searchWidget.setWidth(
      this.size.width - 28
      /* container margin */
    );
    this.inputPatternExcludes.setWidth(
      this.size.width - 28
      /* container margin */
    );
    this.inputPatternIncludes.setWidth(
      this.size.width - 28
      /* container margin */
    );
    const widgetHeight = dom.getTotalHeight(this.searchWidgetsContainerElement);
    const messagesHeight = dom.getTotalHeight(this.messagesElement);
    this.tree.layout(this.size.height - widgetHeight - messagesHeight, this.size.width - 28);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.size = new dom.Dimension(width, height);
    this.reLayout();
  }
  getControl() {
    return this.tree;
  }
  allSearchFieldsClear() {
    return this.searchWidget.getReplaceValue() === "" && (!this.searchWidget.searchInput || this.searchWidget.searchInput.getValue() === "");
  }
  allFilePatternFieldsClear() {
    return this.searchExcludePattern.getValue() === "" && this.searchIncludePattern.getValue() === "";
  }
  hasSearchResults() {
    return !this.viewModel.searchResult.isEmpty();
  }
  clearSearchResults(clearInput = true) {
    this.viewModel.searchResult.clear();
    this.showEmptyStage(true);
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.showSearchWithoutFolderMessage();
    }
    if (clearInput) {
      if (this.allSearchFieldsClear()) {
        this.clearFilePatternFields();
      }
      this.searchWidget.clear();
    }
    this.viewModel.cancelSearch();
    this.viewModel.cancelAISearch();
    this.tree.ariaLabel = nls.localize("emptySearch", "Empty Search");
    this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    this.reLayout();
  }
  clearFilePatternFields() {
    this.searchExcludePattern.clear();
    this.searchIncludePattern.clear();
  }
  cancelSearch(focus = true) {
    if (this.viewModel.cancelSearch() && this.viewModel.cancelAISearch()) {
      if (focus) {
        this.searchWidget.focus();
      }
      return true;
    }
    return false;
  }
  selectTreeIfNotSelected() {
    if (this.tree.getNode(void 0)) {
      this.tree.domFocus();
      const selection = this.tree.getSelection();
      if (selection.length === 0) {
        const event = getSelectionKeyboardEvent();
        this.tree.focusNext(void 0, void 0, event);
        this.tree.setSelection(this.tree.getFocus(), event);
      }
    }
  }
  getSearchTextFromEditor(allowUnselectedWord, editor) {
    if (dom.isAncestorOfActiveElement(this.getContainer())) {
      return null;
    }
    editor = editor ?? this.editorService.activeTextEditorControl;
    if (!editor) {
      return null;
    }
    const allowUnselected = this.searchConfig.seedWithNearestWord && allowUnselectedWord;
    return getSelectionTextFromEditor(allowUnselected, editor);
  }
  showsFileTypes() {
    return this.queryDetails.classList.contains("more");
  }
  toggleCaseSensitive() {
    this.searchWidget.searchInput?.setCaseSensitive(!this.searchWidget.searchInput.getCaseSensitive());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  toggleWholeWords() {
    this.searchWidget.searchInput?.setWholeWords(!this.searchWidget.searchInput.getWholeWords());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  toggleRegex() {
    this.searchWidget.searchInput?.setRegex(!this.searchWidget.searchInput.getRegex());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  togglePreserveCase() {
    this.searchWidget.replaceInput?.setPreserveCase(!this.searchWidget.replaceInput.getPreserveCase());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  setSearchParameters(args = {}) {
    if (typeof args.isCaseSensitive === "boolean") {
      this.searchWidget.searchInput?.setCaseSensitive(args.isCaseSensitive);
    }
    if (typeof args.matchWholeWord === "boolean") {
      this.searchWidget.searchInput?.setWholeWords(args.matchWholeWord);
    }
    if (typeof args.isRegex === "boolean") {
      this.searchWidget.searchInput?.setRegex(args.isRegex);
    }
    if (typeof args.filesToInclude === "string") {
      this.searchIncludePattern.setValue(String(args.filesToInclude));
    }
    if (typeof args.filesToExclude === "string") {
      this.searchExcludePattern.setValue(String(args.filesToExclude));
    }
    if (typeof args.query === "string") {
      this.searchWidget.searchInput?.setValue(args.query);
    }
    if (typeof args.replace === "string") {
      this.searchWidget.replaceInput?.setValue(args.replace);
    } else {
      if (this.searchWidget.replaceInput && this.searchWidget.replaceInput.getValue() !== "") {
        this.searchWidget.replaceInput.setValue("");
      }
    }
    if (typeof args.triggerSearch === "boolean" && args.triggerSearch) {
      this.triggerQueryChange();
    }
    if (typeof args.preserveCase === "boolean") {
      this.searchWidget.replaceInput?.setPreserveCase(args.preserveCase);
    }
    if (typeof args.useExcludeSettingsAndIgnoreFiles === "boolean") {
      this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(args.useExcludeSettingsAndIgnoreFiles);
    }
    if (typeof args.onlyOpenEditors === "boolean") {
      this.searchIncludePattern.setOnlySearchInOpenEditors(args.onlyOpenEditors);
    }
  }
  toggleQueryDetails(moveFocus = true, show, skipLayout, reverse) {
    show = typeof show === "undefined" ? !this.queryDetails.classList.contains("more") : Boolean(show);
    if (!this.viewletState.query) {
      this.viewletState.query = {};
    }
    this.viewletState.query.queryDetailsExpanded = show;
    skipLayout = Boolean(skipLayout);
    if (show) {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "true");
      this.queryDetails.classList.add("more");
      if (moveFocus) {
        if (reverse) {
          this.inputPatternExcludes.focus();
          this.inputPatternExcludes.select();
        } else {
          this.inputPatternIncludes.focus();
          this.inputPatternIncludes.select();
        }
      }
    } else {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "false");
      this.queryDetails.classList.remove("more");
      if (moveFocus) {
        this.searchWidget.focus();
      }
    }
    if (!skipLayout && this.size) {
      this.reLayout();
    }
  }
  searchInFolders(folderPaths = []) {
    this._searchWithIncludeOrExclude(true, folderPaths);
  }
  searchOutsideOfFolders(folderPaths = []) {
    this._searchWithIncludeOrExclude(false, folderPaths);
  }
  _searchWithIncludeOrExclude(include, folderPaths) {
    if (!folderPaths.length || folderPaths.some((folderPath) => folderPath === ".")) {
      this.inputPatternIncludes.setValue("");
      this.searchWidget.focus();
      return;
    }
    if (!this.showsFileTypes()) {
      this.toggleQueryDetails(true, true);
    }
    (include ? this.inputPatternIncludes : this.inputPatternExcludes).setValue(folderPaths.join(", "));
    this.searchWidget.focus(false);
  }
  triggerQueryChange(_options) {
    const options = { preserveFocus: true, triggeredOnType: false, delay: 0, ..._options };
    if (options.triggeredOnType && !this.searchConfig.searchOnType) {
      return;
    }
    if (!this.pauseSearching) {
      const delay = options.triggeredOnType ? options.delay : 0;
      this.triggerQueryDelayer.trigger(() => {
        this._onQueryChanged(options.preserveFocus, options.triggeredOnType, options.shouldKeepAIResults, options.shouldUpdateAISearch);
      }, delay);
    }
  }
  _getExcludePattern() {
    return this.inputPatternExcludes.getValue().trim();
  }
  _getIncludePattern() {
    return this.inputPatternIncludes.getValue().trim();
  }
  _onQueryChanged(preserveFocus, triggeredOnType = false, shouldKeepAIResults = false, shouldUpdateAISearch = false) {
    if (!this.searchWidget.searchInput?.inputBox.isInputValid()) {
      return;
    }
    const isRegex = this.searchWidget.searchInput.getRegex();
    const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
    const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;
    const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
    const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;
    const isWholeWords = this.searchWidget.searchInput.getWholeWords();
    const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
    const contentPattern = this.searchWidget.searchInput.getValue();
    const excludePatternText = this._getExcludePattern();
    const includePatternText = this._getIncludePattern();
    const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();
    const onlySearchInOpenEditors = this.inputPatternIncludes.onlySearchInOpenEditors();
    const onlySearchInChangedFiles = this.inputPatternIncludes.onlySearchInChangedFiles();
    if (contentPattern.length === 0) {
      this.clearSearchResults(false);
      this.clearMessage();
      this.clearAIResults();
      return;
    }
    const content = {
      pattern: contentPattern,
      isRegExp: isRegex,
      isCaseSensitive,
      isWordMatch: isWholeWords,
      notebookInfo: {
        isInNotebookMarkdownInput,
        isInNotebookMarkdownPreview,
        isInNotebookCellInput,
        isInNotebookCellOutput
      }
    };
    const excludePattern = [{ pattern: this.inputPatternExcludes.getValue() }];
    const includePattern = this.inputPatternIncludes.getValue();
    let changedFileUris;
    if (onlySearchInChangedFiles) {
      changedFileUris = [...this.scmService.repositories].flatMap((repository) => repository.provider.groups).flatMap((group) => group.resources).map((resource) => resource.sourceUri);
    }
    const charsPerLine = content.isRegExp ? 1e4 : 1e3;
    const options = {
      _reason: "searchView",
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      maxResults: this.searchConfig.maxResults ?? void 0,
      disregardIgnoreFiles: !useExcludesAndIgnoreFiles || void 0,
      disregardExcludeSettings: !useExcludesAndIgnoreFiles || void 0,
      ignoreGlobCase: !isLinux || void 0,
      onlyOpenEditors: onlySearchInOpenEditors,
      changedFileUris,
      excludePattern,
      includePattern,
      previewOptions: {
        matchLines: 1,
        charsPerLine
      },
      isSmartCase: this.searchConfig.smartCase,
      expandPatterns: true
    };
    const folderResources = this.contextService.getWorkspace().folders;
    const onQueryValidationError = (err) => {
      this.searchWidget.searchInput?.showMessage({ content: err.message, type: MessageType.ERROR });
      this.viewModel.searchResult.clear();
    };
    let query;
    try {
      query = this.queryBuilder.text(content, folderResources.map((folder) => folder.uri), options);
    } catch (err) {
      onQueryValidationError(err);
      return;
    }
    this.validateQuery(query).then(() => {
      if (!shouldKeepAIResults && shouldUpdateAISearch && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
        this.tree.collapse(this.searchResult.aiTextSearchResult);
      }
      this.onQueryTriggered(query, options, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch);
      if (!preserveFocus) {
        this.searchWidget.focus(false, void 0, true);
      }
    }, onQueryValidationError);
  }
  validateQuery(query) {
    const folderQueriesExistP = query.folderQueries.map((fq) => {
      return this.fileService.exists(fq.folder).catch(() => false);
    });
    return Promise.all(folderQueriesExistP).then((existResults) => {
      const existingFolderQueries = query.folderQueries.filter((folderQuery, i) => existResults[i]);
      if (!query.folderQueries.length || existingFolderQueries.length) {
        query.folderQueries = existingFolderQueries;
      } else {
        const nonExistantPath = query.folderQueries[0].folder.fsPath;
        const searchPathNotFoundError = nls.localize("searchPathNotFoundError", "Search path not found: {0}", nonExistantPath);
        return Promise.reject(new Error(searchPathNotFoundError));
      }
      return void 0;
    });
  }
  onQueryTriggered(query, options, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch) {
    this.addToSearchHistoryDelayer.trigger(() => {
      this.searchWidget.searchInput?.onSearchSubmit();
      this.inputPatternExcludes.onSearchSubmit();
      this.inputPatternIncludes.onSearchSubmit();
    });
    this.viewModel.cancelSearch(true);
    if (!shouldKeepAIResults) {
      this.clearAIResults();
    }
    this.currentSearchQ = this.currentSearchQ.then(() => this.doSearch(query, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch)).then(() => void 0, () => void 0);
  }
  async _updateResults() {
    if (this.state === SearchUIState.Idle) {
      return;
    }
    try {
      const fileCount = this.viewModel.searchResult.fileCount();
      if (this._visibleMatches !== fileCount) {
        this._visibleMatches = fileCount;
        await this.refreshAndUpdateCount();
      }
    } finally {
      this._refreshResultsScheduler.schedule();
    }
  }
  async expandIfSingularResult() {
    const collapseResults = this.searchConfig.collapseResults;
    if (collapseResults !== "alwaysCollapse" && this.viewModel.searchResult.matches().length === 1) {
      const onlyMatch = this.viewModel.searchResult.matches()[0];
      await this.tree.expandTo(onlyMatch);
      if (onlyMatch.count() < 50) {
        await this.tree.expand(onlyMatch);
      }
    }
  }
  appendSearchWithAIButton(messageEl) {
    const searchWithAIButtonTooltip = this.keybindingService.appendKeybinding(
      nls.localize("triggerAISearch.tooltip", "Search with AI."),
      Constants.SearchCommandIds.SearchWithAIActionId
    );
    const searchWithAIButtonText = nls.localize("searchWithAIButtonTooltip", "Search with AI");
    const searchWithAIButton = this.messageDisposables.add(new SearchLinkButton(
      searchWithAIButtonText,
      () => {
        this.commandService.executeCommand(Constants.SearchCommandIds.SearchWithAIActionId);
      },
      this.hoverService,
      searchWithAIButtonTooltip
    ));
    dom.append(messageEl, searchWithAIButton.element);
  }
  async onSearchComplete(progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh = true, keywords) {
    this.state = SearchUIState.Idle;
    progressComplete();
    if (shouldDoFinalRefresh) {
      await this.refreshAndUpdateCount();
    }
    const allResults = !this.viewModel.searchResult.isEmpty();
    const aiResults = this.searchResult.getCachedSearchComplete(true);
    if (completed?.exit === SearchCompletionExitCode.NewSearchStarted) {
      return;
    }
    Constants.SearchContext.AIResultsRequested.bindTo(this.contextKeyService).set(this.shouldShowAIResults() && !!aiResults);
    if (completed && this.tree.hasNode(this.searchResult.aiTextSearchResult) && this.tree.isCollapsed(this.searchResult.aiTextSearchResult)) {
      this.tree.expand(this.searchResult.aiTextSearchResult);
      return;
    }
    if (!allResults) {
      const hasExcludes = !!excludePatternText;
      const hasIncludes = !!includePatternText;
      let message;
      if (!completed) {
        message = SEARCH_CANCELLED_MESSAGE;
      } else if (this.inputPatternIncludes.onlySearchInOpenEditors()) {
        if (hasIncludes && hasExcludes) {
          message = nls.localize("noOpenEditorResultsIncludesExcludes", "No results found in open editors matching '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
        } else if (hasIncludes) {
          message = nls.localize("noOpenEditorResultsIncludes", "No results found in open editors matching '{0}' - ", includePatternText);
        } else if (hasExcludes) {
          message = nls.localize("noOpenEditorResultsExcludes", "No results found in open editors excluding '{0}' - ", excludePatternText);
        } else {
          message = nls.localize("noOpenEditorResultsFound", "No results found in open editors. Review your configured exclusions and check your gitignore files - ");
        }
      } else {
        if (hasIncludes && hasExcludes) {
          message = nls.localize("noResultsIncludesExcludes", "No results found in '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
        } else if (hasIncludes) {
          message = nls.localize("noResultsIncludes", "No results found in '{0}' - ", includePatternText);
        } else if (hasExcludes) {
          message = nls.localize("noResultsExcludes", "No results found excluding '{0}' - ", excludePatternText);
        } else {
          message = nls.localize("noResultsFound", "No results found. Review your configured exclusions and check your gitignore files - ");
        }
      }
      aria.status(message);
      const messageEl = this.clearMessage();
      dom.append(messageEl, message);
      if (this.shouldShowAIResults()) {
        this.appendSearchWithAIButton(messageEl);
        dom.append(messageEl, $("span", void 0, " - "));
      }
      if (!completed) {
        const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(
          nls.localize("rerunSearch.message", "Search again"),
          () => this.triggerQueryChange({ preserveFocus: false }),
          this.hoverService
        ));
        dom.append(messageEl, searchAgainButton.element);
      } else if (hasIncludes || hasExcludes) {
        const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("rerunSearchInAll.message", "Search again in all files"), this.onSearchAgain.bind(this), this.hoverService));
        dom.append(messageEl, searchAgainButton.element);
      } else {
        const openSettingsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("openSettings.message", "Open Settings"), this.onOpenSettings.bind(this), this.hoverService));
        dom.append(messageEl, openSettingsButton.element);
      }
      if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
        this.showSearchWithoutFolderMessage();
      }
      this.reLayout();
    } else {
      this.viewModel.searchResult.toggleHighlights(this.isVisible());
      aria.status(nls.localize("ariaSearchResultsStatus", "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
    }
    if (completed && completed.limitHit) {
      completed.messages.push({ type: TextSearchCompleteMessageType.Warning, text: nls.localize("searchMaxResultsWarning", "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") });
    }
    if (completed && completed.messages) {
      for (const message of completed.messages) {
        this.addMessage(message);
      }
    }
    this.reLayout();
  }
  async onSearchError(e, progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh = true) {
    this.state = SearchUIState.Idle;
    if (errors.isCancellationError(e)) {
      return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh);
    } else {
      progressComplete();
      this.searchWidget.searchInput?.showMessage({ content: e.message, type: MessageType.ERROR });
      this.viewModel.searchResult.clear();
      return Promise.resolve();
    }
  }
  clearAIResults() {
    this.model.searchResult.aiTextSearchResult.hidden = true;
    this.refreshTreeController.clearAllPending();
    this._pendingSemanticSearchPromise = void 0;
    this._cachedResults = void 0;
    this._cachedKeywords = [];
    this.model.cancelAISearch(true);
    this.model.clearAiSearchResults();
  }
  async requestAIResults() {
    this.logService.info(`SearchView: Requesting semantic results from keybinding. Cached: ${!!this.cachedResults}`);
    if ((!this.cachedResults || this.cachedResults.results.length === 0) && !this._pendingSemanticSearchPromise) {
      this.clearAIResults();
    }
    this.model.searchResult.aiTextSearchResult.hidden = false;
    await this.queueRefreshTree();
    await forcedExpandRecursively(this.getControl(), this.model.searchResult.aiTextSearchResult);
  }
  async addAIResults() {
    const excludePatternText = this._getExcludePattern();
    const includePatternText = this._getIncludePattern();
    this.searchWidget.searchInput?.clearMessage();
    this.showEmptyStage();
    this._visibleMatches = 0;
    this.tree.setSelection([]);
    this.tree.setFocus([]);
    this.viewModel.replaceString = this.searchWidget.getReplaceValue();
    let aiSearchPromise = this._pendingSemanticSearchPromise;
    if (!aiSearchPromise) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery();
      aiSearchPromise = this._pendingSemanticSearchPromise = this.viewModel.aiSearch(() => {
        if (this._pendingSemanticSearchPromise === aiSearchPromise) {
          this._pendingSemanticSearchPromise = void 0;
        }
      });
    }
    aiSearchPromise.then((complete) => {
      this.updateSearchResultCount(this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, false);
      return this.onSearchComplete(() => {
      }, excludePatternText, includePatternText, complete, false, complete.aiKeywords);
    }, (e) => {
      return this.onSearchError(e, () => {
      }, excludePatternText, includePatternText, void 0, false);
    });
  }
  doSearch(query, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch) {
    let progressComplete;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: triggeredOnType ? 300 : 0 }, (_progress) => {
      return new Promise((resolve) => progressComplete = resolve);
    });
    this.searchWidget.searchInput?.clearMessage();
    this.state = SearchUIState.Searching;
    this.showEmptyStage();
    if (this.model.searchResult.aiTextSearchResult.hidden && shouldUpdateAISearch) {
      this.logService.info(`SearchView: Semantic search visible. Keep semantic results: ${shouldKeepAIResults}. Update semantic search: ${shouldUpdateAISearch}`);
      this.model.searchResult.aiTextSearchResult.hidden = false;
    }
    const slowTimer = setTimeout(() => {
      this.state = SearchUIState.SlowSearch;
    }, 2e3);
    this._visibleMatches = 0;
    this._refreshResultsScheduler.schedule();
    this.searchWidget.setReplaceAllActionState(false);
    this.tree.setSelection([]);
    this.tree.setFocus([]);
    this.viewModel.replaceString = this.searchWidget.getReplaceValue();
    const result = this.viewModel.search(query);
    if (!shouldKeepAIResults || shouldUpdateAISearch) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery(query);
    }
    if (this.configurationService.getValue("search").searchView.keywordSuggestions) {
      this.getKeywordSuggestions();
    }
    return result.asyncResults.then((complete) => {
      clearTimeout(slowTimer);
      const config = this.configurationService.getValue("search").searchView.semanticSearchBehavior;
      if (complete.results.length === 0 && config === SemanticSearchBehavior.RunOnEmpty) {
        this.logService.info(`SearchView: Requesting semantic results on empty search.`);
        this.model.searchResult.aiTextSearchResult.hidden = false;
      }
      return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, complete);
    }, (e) => {
      clearTimeout(slowTimer);
      return this.onSearchError(e, progressComplete, excludePatternText, includePatternText);
    });
  }
  onOpenSettings(e) {
    dom.EventHelper.stop(e, false);
    this.openSettings("@id:files.exclude,search.exclude,search.useParentIgnoreFiles,search.useGlobalIgnoreFiles,search.useIgnoreFiles");
  }
  openSettings(query) {
    const options = { query };
    return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? this.preferencesService.openWorkspaceSettings(options) : this.preferencesService.openUserSettings(options);
  }
  onSearchAgain() {
    this.inputPatternExcludes.setValue("");
    this.inputPatternIncludes.setValue("");
    this.inputPatternIncludes.setOnlySearchInOpenEditors(false);
    this.inputPatternIncludes.setOnlySearchInChangedFiles(false);
    this.triggerQueryChange({ preserveFocus: false });
  }
  onEnableExcludes() {
    this.toggleQueryDetails(false, true);
    this.searchExcludePattern.setUseExcludesAndIgnoreFiles(true);
  }
  onDisableSearchInOpenEditors() {
    this.toggleQueryDetails(false, true);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(false);
  }
  updateSearchResultCount(disregardExcludesAndIgnores, onlyOpenEditors, clear = false) {
    if (this._cachedKeywords.length > 0) {
      return;
    }
    const fileCount = this.viewModel.searchResult.fileCount(this.viewModel.searchResult.aiTextSearchResult.hidden);
    const resultCount = this.viewModel.searchResult.count(this.viewModel.searchResult.aiTextSearchResult.hidden);
    this.hasSearchResultsKey.set(fileCount > 0);
    const msgWasHidden = this.messagesElement.style.display === "none";
    const messageEl = this.clearMessage();
    const resultMsg = clear ? "" : this.buildResultCountMessage(resultCount, fileCount);
    this.tree.ariaLabel = resultMsg + nls.localize("forTerm", " - Search: {0}", this.searchResult.query?.contentPattern.pattern ?? "");
    dom.append(messageEl, resultMsg);
    if (fileCount > 0) {
      if (disregardExcludesAndIgnores) {
        const excludesDisabledMessage = " - " + nls.localize("useIgnoresAndExcludesDisabled", "exclude settings and ignore files are disabled") + " ";
        const enableExcludesButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("excludes.enable", "enable"), this.onEnableExcludes.bind(this), this.hoverService, nls.localize("useExcludesAndIgnoreFilesDescription", "Use Exclude Settings and Ignore Files")));
        dom.append(messageEl, $("span", void 0, excludesDisabledMessage, "(", enableExcludesButton.element, ")"));
      }
      if (onlyOpenEditors) {
        const searchingInOpenMessage = " - " + nls.localize("onlyOpenEditors", "searching only in open files") + " ";
        const disableOpenEditorsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("openEditors.disable", "disable"), this.onDisableSearchInOpenEditors.bind(this), this.hoverService, nls.localize("disableOpenEditors", "Search in entire workspace")));
        dom.append(messageEl, $("span", void 0, searchingInOpenMessage, "(", disableOpenEditorsButton.element, ")"));
      }
      dom.append(messageEl, " - ");
      const openInEditorTooltip = this.keybindingService.appendKeybinding(
        nls.localize("openInEditor.tooltip", "Copy current search results to an editor"),
        Constants.SearchCommandIds.OpenInEditorCommandId
      );
      const openInEditorButton = this.messageDisposables.add(new SearchLinkButton(
        nls.localize("openInEditor.message", "Open in editor"),
        () => this.instantiationService.invokeFunction(createEditorFromSearchResult, this.searchResult, this.searchIncludePattern.getValue(), this.searchExcludePattern.getValue(), this.searchIncludePattern.onlySearchInOpenEditors()),
        this.hoverService,
        openInEditorTooltip
      ));
      dom.append(messageEl, openInEditorButton.element);
      if (this.shouldShowAIResults()) {
        dom.append(messageEl, " - ");
        this.appendSearchWithAIButton(messageEl);
      }
      this.reLayout();
    } else if (!msgWasHidden) {
      dom.hide(this.messagesElement);
    }
  }
  handleKeywordClick(keyword, index) {
    this.searchWidget.searchInput?.setValue(keyword);
    this.triggerQueryChange({ preserveFocus: false, triggeredOnType: false, shouldKeepAIResults: false });
    this.telemetryService.publicLog2("searchKeywordClick", {
      index,
      maxKeywords: this._cachedKeywords.length
    });
  }
  updateKeywordSuggestionUI(keyword) {
    const element = this.messagesElement.firstChild;
    if (this._cachedKeywords.length > 0) {
      if (this._cachedKeywords.length >= 3) {
        return;
      }
      dom.append(element, ", ");
      const index = this._cachedKeywords.length;
      const button = this.messageDisposables.add(new SearchLinkButton(
        keyword.keyword,
        () => this.handleKeywordClick(keyword.keyword, index),
        this.hoverService
      ));
      dom.append(element, button.element);
    } else {
      const messageEl = this.clearMessage();
      messageEl.classList.add("ai-keywords");
      const resultMsg = nls.localize("keywordSuggestion.message", "Search instead for: ");
      dom.append(messageEl, resultMsg);
      const button = this.messageDisposables.add(new SearchLinkButton(
        keyword.keyword,
        () => this.handleKeywordClick(keyword.keyword, 0),
        this.hoverService
      ));
      dom.append(messageEl, button.element);
    }
    this._cachedKeywords.push(keyword.keyword);
  }
  async getKeywordSuggestions() {
    let aiSearchPromise = this._pendingSemanticSearchPromise;
    if (!aiSearchPromise) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery();
      aiSearchPromise = this._pendingSemanticSearchPromise = this.viewModel.aiSearch((result) => {
        if (result && isAIKeyword(result)) {
          this.updateKeywordSuggestionUI(result);
          return;
        }
        if (this._pendingSemanticSearchPromise === aiSearchPromise) {
          this._pendingSemanticSearchPromise = void 0;
        }
      });
    }
    this._cachedResults = await aiSearchPromise;
  }
  addMessage(message) {
    const messageBox = this.messagesElement.firstChild;
    if (!messageBox) {
      return;
    }
    dom.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerQueryChange()));
  }
  buildResultCountMessage(resultCount, fileCount) {
    if (resultCount === 1 && fileCount === 1) {
      return nls.localize("search.file.result", "{0} result in {1} file", resultCount, fileCount);
    } else if (resultCount === 1) {
      return nls.localize("search.files.result", "{0} result in {1} files", resultCount, fileCount);
    } else if (fileCount === 1) {
      return nls.localize("search.file.results", "{0} results in {1} file", resultCount, fileCount);
    } else {
      return nls.localize("search.files.results", "{0} results in {1} files", resultCount, fileCount);
    }
  }
  showSearchWithoutFolderMessage() {
    this.searchWithoutFolderMessageElement = this.clearMessage();
    const textEl = dom.append(
      this.searchWithoutFolderMessageElement,
      $("p", void 0, nls.localize("searchWithoutFolder", "You have not opened or specified a folder. Only open files are currently searched - "))
    );
    const openFolderButton = this.messageDisposables.add(new SearchLinkButton(
      nls.localize("openFolder", "Open Folder"),
      () => {
        this.commandService.executeCommand(OpenFolderAction.ID).catch((err) => errors.onUnexpectedError(err));
      },
      this.hoverService
    ));
    dom.append(textEl, openFolderButton.element);
  }
  showEmptyStage(forceHideMessages = false) {
    const showingCancelled = (this.messagesElement.firstChild?.textContent?.indexOf(SEARCH_CANCELLED_MESSAGE) ?? -1) > -1;
    if (showingCancelled || forceHideMessages || !this.configurationService.getValue().search?.searchOnType) {
      dom.hide(this.messagesElement);
    }
    dom.show(this.resultsElement);
    this.currentSelectedFileMatch = void 0;
  }
  shouldOpenInNotebookEditor(match, uri) {
    return isIMatchInNotebook(match) || uri.scheme !== network.Schemas.untitled && this.notebookService.getContributedNotebookTypes(uri).length > 0;
  }
  onFocus(lineMatch, preserveFocus, sideBySide, pinned) {
    const useReplacePreview = this.configurationService.getValue().search?.useReplacePreview;
    const resource = isSearchTreeMatch(lineMatch) ? lineMatch.parent().resource : lineMatch.resource;
    return useReplacePreview && this.viewModel.isReplaceActive() && !!this.viewModel.replaceString && !this.shouldOpenInNotebookEditor(lineMatch, resource) ? this.replaceService.openReplacePreview(lineMatch, preserveFocus, sideBySide, pinned) : this.open(lineMatch, preserveFocus, sideBySide, pinned, resource);
  }
  async open(element, preserveFocus, sideBySide, pinned, resourceInput) {
    const selection = getEditorSelectionFromMatch(element, this.viewModel);
    const oldParentMatches = isSearchTreeMatch(element) ? element.parent().matches() : [];
    const resource = resourceInput ?? (isSearchTreeMatch(element) ? element.parent().resource : element.resource);
    let editor;
    const options = {
      preserveFocus,
      pinned,
      selection,
      revealIfVisible: true
    };
    try {
      editor = await this.editorService.openEditor({
        resource,
        options
      }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
      const editorControl = editor?.getControl();
      if (isSearchTreeMatch(element) && preserveFocus && isCodeEditor(editorControl)) {
        this.viewModel.searchResult.getRangeHighlightDecorations().highlightRange(
          editorControl.getModel(),
          element.range()
        );
      } else {
        this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
      }
    } catch (err) {
      errors.onUnexpectedError(err);
      return;
    }
    if (editor instanceof NotebookEditor) {
      const elemParent = element.parent();
      if (isSearchTreeMatch(element)) {
        if (isIMatchInNotebook(element)) {
          element.parent().showMatch(element);
        } else {
          const editorWidget = editor.getControl();
          if (editorWidget) {
            elemParent.bindNotebookEditorWidget(editorWidget);
            await elemParent.updateMatchesForEditorWidget();
            const matchIndex = oldParentMatches.findIndex((e) => e.id() === element.id());
            const matches = elemParent.matches();
            const match = matchIndex >= matches.length ? matches[matches.length - 1] : matches[matchIndex];
            if (isIMatchInNotebook(match)) {
              elemParent.showMatch(match);
              if (!this.tree.getFocus().includes(match) || !this.tree.getSelection().includes(match)) {
                this.tree.setSelection([match], getSelectionKeyboardEvent());
                this.tree.setFocus([match]);
              }
            }
          }
        }
      }
    }
  }
  openEditorWithMultiCursor(element) {
    const resource = isSearchTreeMatch(element) ? element.parent().resource : element.resource;
    return this.editorService.openEditor({
      resource,
      options: {
        preserveFocus: false,
        pinned: true,
        revealIfVisible: true
      }
    }).then((editor) => {
      if (editor) {
        let fileMatch = null;
        if (isSearchTreeFileMatch(element)) {
          fileMatch = element;
        } else if (isSearchTreeMatch(element)) {
          fileMatch = element.parent();
        }
        if (fileMatch) {
          const selections = fileMatch.matches().map((m) => new Selection(m.range().startLineNumber, m.range().startColumn, m.range().endLineNumber, m.range().endColumn));
          const codeEditor = getCodeEditor(editor.getControl());
          if (codeEditor) {
            const multiCursorController = MultiCursorSelectionController.get(codeEditor);
            multiCursorController?.selectAllUsingSelections(selections);
          }
        }
      }
      this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
    }, errors.onUnexpectedError);
  }
  onUntitledDidDispose(resource) {
    if (!this.viewModel) {
      return;
    }
    let matches = this.viewModel.searchResult.matches();
    for (let i = 0, len = matches.length; i < len; i++) {
      if (resource.toString() === matches[i].resource.toString()) {
        this.viewModel.searchResult.remove(matches[i]);
      }
    }
    matches = this.viewModel.searchResult.matches(true);
    for (let i = 0, len = matches.length; i < len; i++) {
      if (resource.toString() === matches[i].resource.toString()) {
        this.viewModel.searchResult.remove(matches[i]);
      }
    }
  }
  onFilesChanged(e) {
    if (!this.viewModel || this.searchConfig.sortOrder !== SearchSortOrder.Modified && !e.gotDeleted()) {
      return;
    }
    const matches = this.viewModel.searchResult.matches();
    if (e.gotDeleted()) {
      const deletedMatches = matches.filter((m) => e.contains(m.resource, FileChangeType.DELETED));
      this.viewModel.searchResult.remove(deletedMatches);
    } else {
      const changedMatches = matches.filter((m) => e.contains(m.resource));
      if (changedMatches.length && this.searchConfig.sortOrder === SearchSortOrder.Modified) {
        this.updateFileStats(changedMatches).then(async () => this.refreshTreeController.queue());
      }
    }
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  clearHistory() {
    this.searchWidget.clearHistory();
    this.inputPatternExcludes.clearHistory();
    this.inputPatternIncludes.clearHistory();
  }
  saveState() {
    if (!this.searchWidget) {
      return;
    }
    const patternExcludes = this.inputPatternExcludes?.getValue().trim() ?? "";
    const patternIncludes = this.inputPatternIncludes?.getValue().trim() ?? "";
    const onlyOpenEditors = this.inputPatternIncludes?.onlySearchInOpenEditors() ?? false;
    const useExcludesAndIgnoreFiles = this.inputPatternExcludes?.useExcludesAndIgnoreFiles() ?? true;
    const preserveCase = this.viewModel.preserveCase;
    if (!this.viewletState.query) {
      this.viewletState.query = {};
    }
    if (this.searchWidget.searchInput) {
      const isRegex = this.searchWidget.searchInput.getRegex();
      const isWholeWords = this.searchWidget.searchInput.getWholeWords();
      const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
      const contentPattern = this.searchWidget.searchInput.getValue();
      const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
      const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;
      const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
      const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;
      this.viewletState.query.contentPattern = contentPattern;
      this.viewletState.query.regex = isRegex;
      this.viewletState.query.wholeWords = isWholeWords;
      this.viewletState.query.caseSensitive = isCaseSensitive;
      this.viewletState.query.isInNotebookMarkdownInput = isInNotebookMarkdownInput;
      this.viewletState.query.isInNotebookMarkdownPreview = isInNotebookMarkdownPreview;
      this.viewletState.query.isInNotebookCellInput = isInNotebookCellInput;
      this.viewletState.query.isInNotebookCellOutput = isInNotebookCellOutput;
    }
    this.viewletState.query.folderExclusions = patternExcludes;
    this.viewletState.query.folderIncludes = patternIncludes;
    this.viewletState.query.useExcludesAndIgnoreFiles = useExcludesAndIgnoreFiles;
    this.viewletState.query.preserveCase = preserveCase;
    this.viewletState.query.onlyOpenEditors = onlyOpenEditors;
    const isReplaceShown = this.searchAndReplaceWidget.isReplaceShown();
    if (!this.viewletState.view) {
      this.viewletState.view = {};
    }
    this.viewletState.view.showReplace = isReplaceShown;
    this.viewletState.view.treeLayout = this.isTreeLayoutViewVisible;
    this.viewletState.query.replaceText = isReplaceShown && this.searchWidget.getReplaceValue();
    this._saveSearchHistoryService();
    this.memento.saveMemento();
    super.saveState();
  }
  _saveSearchHistoryService() {
    if (this.searchWidget === void 0) {
      return;
    }
    const history = /* @__PURE__ */ Object.create(null);
    const searchHistory = this.searchWidget.getSearchHistory();
    if (searchHistory && searchHistory.length) {
      history.search = searchHistory;
    }
    const replaceHistory = this.searchWidget.getReplaceHistory();
    if (replaceHistory && replaceHistory.length) {
      history.replace = replaceHistory;
    }
    const patternExcludesHistory = this.inputPatternExcludes.getHistory();
    if (patternExcludesHistory && patternExcludesHistory.length) {
      history.exclude = patternExcludesHistory;
    }
    const patternIncludesHistory = this.inputPatternIncludes.getHistory();
    if (patternIncludesHistory && patternIncludesHistory.length) {
      history.include = patternIncludesHistory;
    }
    this.searchHistoryService.save(history);
  }
  async updateFileStats(elements) {
    const files = elements.map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  removeFileStats() {
    for (const fileMatch of this.searchResult.matches()) {
      fileMatch.fileStat = void 0;
    }
    for (const fileMatch of this.searchResult.matches(true)) {
      fileMatch.fileStat = void 0;
    }
  }
  dispose() {
    this.isDisposed = true;
    this.saveState();
    super.dispose();
  }
};
SearchView.ACTIONS_RIGHT_CLASS_NAME = "actions-right";
SearchView = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, ISearchViewModelWorkbenchService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IReplaceService),
  __decorateParam(16, ITextFileService),
  __decorateParam(17, IPreferencesService),
  __decorateParam(18, IThemeService),
  __decorateParam(19, ISearchHistoryService),
  __decorateParam(20, IContextMenuService),
  __decorateParam(21, IAccessibilityService),
  __decorateParam(22, IKeybindingService),
  __decorateParam(23, IStorageService),
  __decorateParam(24, IOpenerService),
  __decorateParam(25, IHoverService),
  __decorateParam(26, INotebookService),
  __decorateParam(27, ILogService),
  __decorateParam(28, IAccessibilitySignalService),
  __decorateParam(29, ITelemetryService),
  __decorateParam(30, ISCMService)
], SearchView);
class SearchLinkButton extends Disposable {
  constructor(label, handler, hoverService, tooltip) {
    super();
    this.element = $("a.pointer", { tabindex: 0 }, label);
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, tooltip));
    this.addEventHandlers(handler);
  }
  addEventHandlers(handler) {
    const wrappedHandler = (e) => {
      dom.EventHelper.stop(e, false);
      handler(e);
    };
    this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, wrappedHandler));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
        wrappedHandler(e);
        event.preventDefault();
        event.stopPropagation();
      }
    }));
  }
}
function getEditorSelectionFromMatch(element, viewModel) {
  let match = null;
  if (isSearchTreeMatch(element)) {
    match = element;
  }
  if (isSearchTreeFileMatch(element) && element.count() > 0) {
    match = element.matches()[element.matches().length - 1];
  }
  if (match) {
    const range = match.range();
    if (viewModel.isReplaceActive() && !!viewModel.replaceString) {
      const replaceString = match.replaceString;
      return {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.startLineNumber,
        endColumn: range.startColumn + replaceString.length
      };
    }
    return range;
  }
  return void 0;
}
function getSelectionTextFromEditor(allowUnselectedWord, activeEditor) {
  let editor = activeEditor;
  if (isDiffEditor(editor)) {
    if (editor.getOriginalEditor().hasTextFocus()) {
      editor = editor.getOriginalEditor();
    } else {
      editor = editor.getModifiedEditor();
    }
  }
  if (!isCodeEditor(editor) || !editor.hasModel()) {
    return null;
  }
  const range = editor.getSelection();
  if (!range) {
    return null;
  }
  if (range.isEmpty()) {
    if (allowUnselectedWord) {
      const wordAtPosition = editor.getModel().getWordAtPosition(range.getStartPosition());
      return wordAtPosition?.word ?? null;
    } else {
      return null;
    }
  }
  let searchText = "";
  for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
    let lineText = editor.getModel().getLineContent(i);
    if (i === range.endLineNumber) {
      lineText = lineText.substring(0, range.endColumn - 1);
    }
    if (i === range.startLineNumber) {
      lineText = lineText.substring(range.startColumn - 1);
    }
    if (i !== range.startLineNumber) {
      lineText = "\n" + lineText;
    }
    searchText += lineText;
  }
  return searchText;
}
let SearchViewDataSource = class {
  constructor(searchView, configurationService) {
    this.searchView = searchView;
    this.configurationService = configurationService;
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  createSearchResultIterator(searchResult) {
    const ret = [];
    if (this.searchView.shouldShowAIResults() && searchResult.searchModel.hasPlainResults && !searchResult.aiTextSearchResult.hidden) {
      ret.push(searchResult.aiTextSearchResult);
    }
    if (!searchResult.plainTextSearchResult.isEmpty()) {
      if (!this.searchView.shouldShowAIResults() || searchResult.aiTextSearchResult.hidden) {
        return this.createTextSearchResultIterator(searchResult.plainTextSearchResult);
      }
      ret.push(searchResult.plainTextSearchResult);
    }
    return ret;
  }
  createTextSearchResultIterator(textSearchResult) {
    const folderMatches = textSearchResult.folderMatches().filter((fm) => !fm.isEmpty()).sort(searchMatchComparer);
    if (folderMatches.length === 1) {
      return this.createFolderIterator(folderMatches[0]);
    }
    return folderMatches;
  }
  createFolderIterator(folderMatch) {
    const matchArray = this.searchView.isTreeLayoutViewVisible ? folderMatch.matches() : folderMatch.allDownstreamFileMatches();
    let matches = matchArray;
    if (!(folderMatch instanceof AIFolderMatchWorkspaceRootImpl)) {
      matches = matchArray.sort((a, b) => searchMatchComparer(a, b, this.searchConfig.sortOrder));
    }
    return matches;
  }
  createFileIterator(fileMatch) {
    const matches = fileMatch.matches().sort(searchMatchComparer);
    return matches;
  }
  hasChildren(element) {
    if (isSearchTreeMatch(element)) {
      return false;
    }
    if (isTextSearchHeading(element) && element.isAIContributed) {
      return true;
    }
    const hasChildren = element.hasChildren;
    return hasChildren;
  }
  getChildren(element) {
    if (isSearchResult(element)) {
      return this.createSearchResultIterator(element);
    } else if (isTextSearchHeading(element)) {
      if (element.isAIContributed && (!this.searchView.model.hasAIResults || !!this.searchView._pendingSemanticSearchPromise)) {
        if (this.searchView.cachedResults) {
          return this.createTextSearchResultIterator(element);
        }
        this.searchView.addAIResults();
        return new Promise((resolve) => {
          const disposable = element.onChange(() => {
            disposable.dispose();
            resolve(this.createTextSearchResultIterator(element));
          });
        });
      }
      return this.createTextSearchResultIterator(element);
    } else if (isSearchTreeFolderMatch(element)) {
      return this.createFolderIterator(element);
    } else if (isSearchTreeFileMatch(element)) {
      return this.createFileIterator(element);
    }
    return [];
  }
  getParent(element) {
    const parent = element.parent();
    if (isSearchResult(parent)) {
      throw new Error("Invalid element passed to getParent");
    }
    return parent;
  }
};
SearchViewDataSource = __decorateClass([
  __decorateParam(1, IConfigurationService)
], SearchViewDataSource);
let RefreshTreeController = class extends Disposable {
  constructor(searchView, geSearchConfig, fileService) {
    super();
    this.searchView = searchView;
    this.geSearchConfig = geSearchConfig;
    this.fileService = fileService;
    this.queuedIChangeEvents = [];
    this.refreshTreeThrottler = this._register(new Throttler());
  }
  clearAllPending() {
    this.searchView.getControl().cancelAllRefreshPromises(true);
  }
  async queue(e) {
    if (e) {
      this.queuedIChangeEvents.push(e);
    }
    return this.refreshTreeThrottler.queue(this.refreshTreeUsingQueue.bind(this));
  }
  async refreshTreeUsingQueue() {
    const aggregateChangeEvent = this.queuedIChangeEvents.length === 0 ? void 0 : {
      elements: this.queuedIChangeEvents.map((e) => e.elements).flat(),
      added: this.queuedIChangeEvents.some((e) => e.added),
      removed: this.queuedIChangeEvents.some((e) => e.removed),
      clearingAll: this.queuedIChangeEvents.some((e) => e.clearingAll)
    };
    this.queuedIChangeEvents = [];
    return this.refreshTree(aggregateChangeEvent);
  }
  async retrieveFileStats() {
    const files = this.searchView.model.searchResult.matches().filter((f) => !f.fileStat).map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  async refreshTree(event) {
    const searchConfig = this.geSearchConfig();
    if (!event || event.added || event.removed) {
      if (searchConfig.sortOrder === SearchSortOrder.Modified) {
        await this.retrieveFileStats().then(() => this.searchView.getControl().updateChildren(void 0));
      } else {
        await this.searchView.getControl().updateChildren(void 0);
      }
    } else {
      if (searchConfig.sortOrder === SearchSortOrder.CountAscending || searchConfig.sortOrder === SearchSortOrder.CountDescending) {
        await this.searchView.getControl().updateChildren(void 0);
      } else {
        const treeHasAllElements = event.elements.every((elem) => this.searchView.getControl().hasNode(elem));
        if (treeHasAllElements) {
          await Promise.all(event.elements.map(async (element) => {
            await this.searchView.getControl().updateChildren(element);
            this.searchView.getControl().rerender(element);
          }));
        } else {
          this.searchView.getControl().updateChildren(void 0);
        }
      }
    }
  }
};
RefreshTreeController = __decorateClass([
  __decorateParam(2, IFileService)
], RefreshTreeController);
export {
  SearchView,
  SearchViewPosition,
  getEditorSelectionFromMatch,
  getSelectionTextFromEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBSdW5PbmNlU2NoZWR1bGVyLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmV0d29yayBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zZWFyY2h2aWV3LmNzcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb21tb25GaW5kQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9tdWx0aWN1cnNvci9icm93c2VyL211bHRpY3Vyc29yLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb25maXJtYXRpb24sIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlc0V2ZW50LCBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQsIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSwgd2l0aFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElGaWxlSWNvblRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IE9wZW5Gb2xkZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxpc3REbkRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJVmlld1BhbmVPcHRpb25zLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBFeGNsdWRlUGF0dGVybklucHV0V2lkZ2V0LCBJbmNsdWRlUGF0dGVybklucHV0V2lkZ2V0IH0gZnJvbSAnLi9wYXR0ZXJuSW5wdXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUZpbmRJbkZpbGVzQXJncyB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoRGV0YWlsc0ljb24gfSBmcm9tICcuL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCB7IHJlbmRlclNlYXJjaE1lc3NhZ2UgfSBmcm9tICcuL3NlYXJjaE1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRmlsZU1hdGNoUmVuZGVyZXIsIEZvbGRlck1hdGNoUmVuZGVyZXIsIE1hdGNoUmVuZGVyZXIsIFNlYXJjaEFjY2Vzc2liaWxpdHlQcm92aWRlciwgU2VhcmNoRGVsZWdhdGUsIFRleHRTZWFyY2hSZXN1bHRSZW5kZXJlciB9IGZyb20gJy4vc2VhcmNoUmVzdWx0c1ZpZXcuanMnO1xuaW1wb3J0IHsgU2VhcmNoV2lkZ2V0IH0gZnJvbSAnLi9zZWFyY2hXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVJlcGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi9yZXBsYWNlLmpzJztcbmltcG9ydCB7IGdldE91dE9mV29ya3NwYWNlRWRpdG9yUmVzb3VyY2VzLCBTZWFyY2hTdGF0ZUtleSwgU2VhcmNoVUlTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVNlYXJjaEhpc3RvcnlTZXJ2aWNlLCBJU2VhcmNoSGlzdG9yeVZhbHVlcywgU2VhcmNoSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoSGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRWRpdG9yRnJvbVNlYXJjaFJlc3VsdCB9IGZyb20gJy4uLy4uL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlLCBJU2V0dGluZ3NFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucywgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgU2VtYW50aWNTZWFyY2hCZWhhdmlvciwgSVBhdHRlcm5JbmZvLCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIElUZXh0UXVlcnksIFNlYXJjaENvbXBsZXRpb25FeGl0Q29kZSwgU2VhcmNoU29ydE9yZGVyLCBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZSwgVmlld01vZGUsIGlzQUlLZXl3b3JkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgQUlTZWFyY2hLZXl3b3JkLCBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU0NNUmVwb3NpdG9yeSwgSVNDTVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFRyZWVNYXRjaCwgaXNTZWFyY2hUcmVlTWF0Y2gsIFJlbmRlcmFibGVNYXRjaCwgU2VhcmNoTW9kZWxMb2NhdGlvbiwgSUNoYW5nZUV2ZW50LCBGaWxlTWF0Y2hPck1hdGNoLCBJU2VhcmNoVHJlZUZpbGVNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgSVNlYXJjaE1vZGVsLCBJU2VhcmNoUmVzdWx0LCBpc1NlYXJjaFRyZWVGaWxlTWF0Y2gsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2UsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdCwgaXNTZWFyY2hSZXN1bHQsIGlzVGV4dFNlYXJjaEhlYWRpbmcsIElUZXh0U2VhcmNoSGVhZGluZywgaXNTZWFyY2hIZWFkZXIgfSBmcm9tICcuL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0ZpbGVJbnN0YW5jZU1hdGNoLCBpc0lNYXRjaEluTm90ZWJvb2sgfSBmcm9tICcuL25vdGVib29rU2VhcmNoL25vdGVib29rU2VhcmNoTW9kZWxCYXNlLmpzJztcbmltcG9ydCB7IHNlYXJjaE1hdGNoQ29tcGFyZXIgfSBmcm9tICcuL3NlYXJjaENvbXBhcmUuanMnO1xuaW1wb3J0IHsgQUlGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3RJbXBsIH0gZnJvbSAnLi9BSVNlYXJjaC9haVNlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNUb3BCYXIuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBlbnVtIFNlYXJjaFZpZXdQb3NpdGlvbiB7XG5cdFNpZGVCYXIsXG5cdFBhbmVsXG59XG5cbmludGVyZmFjZSBJU2VhcmNoVmlld1N0YXRlUXVlcnkge1xuXHRjb250ZW50UGF0dGVybj86IHN0cmluZztcblx0cmVwbGFjZVRleHQ/OiBzdHJpbmcgfCBmYWxzZTtcblx0cmVnZXg/OiBib29sZWFuO1xuXHR3aG9sZVdvcmRzPzogYm9vbGVhbjtcblx0Y2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47XG5cdGZpbGVQYXR0ZXJucz86IHN0cmluZztcblx0Zm9sZGVyRXhjbHVzaW9ucz86IHN0cmluZztcblx0Zm9sZGVySW5jbHVkZXM/OiBzdHJpbmc7XG5cdG9ubHlPcGVuRWRpdG9ycz86IGJvb2xlYW47XG5cdHF1ZXJ5RGV0YWlsc0V4cGFuZGVkPzogc3RyaW5nIHwgYm9vbGVhbjtcblx0dXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcz86IGJvb2xlYW47XG5cdHByZXNlcnZlQ2FzZT86IGJvb2xlYW47XG5cdHNlYXJjaEhpc3Rvcnk/OiBzdHJpbmdbXTtcblx0cmVwbGFjZUhpc3Rvcnk/OiBzdHJpbmdbXTtcblx0aXNJbk5vdGVib29rTWFya2Rvd25JbnB1dD86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldz86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va0NlbGxJbnB1dD86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va0NlbGxPdXRwdXQ/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVNlYXJjaFZpZXdTdGF0ZSB7XG5cdHF1ZXJ5PzogSVNlYXJjaFZpZXdTdGF0ZVF1ZXJ5O1xuXHR2aWV3Pzoge1xuXHRcdHNob3dSZXBsYWNlPzogYm9vbGVhbjtcblx0XHR0cmVlTGF5b3V0PzogYm9vbGVhbjtcblx0fTtcbn1cblxuY29uc3QgU0VBUkNIX0NBTkNFTExFRF9NRVNTQUdFID0gbmxzLmxvY2FsaXplKCdzZWFyY2hDYW5jZWxlZCcsIFwiU2VhcmNoIHdhcyBjYW5jZWxlZCBiZWZvcmUgYW55IHJlc3VsdHMgY291bGQgYmUgZm91bmQgLSBcIik7XG5jb25zdCBERUJPVU5DRV9ERUxBWSA9IDc1O1xuZXhwb3J0IGNsYXNzIFNlYXJjaFZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQUNUSU9OU19SSUdIVF9DTEFTU19OQU1FID0gJ2FjdGlvbnMtcmlnaHQnO1xuXG5cdHByaXZhdGUgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcXVlcnlCdWlsZGVyOiBRdWVyeUJ1aWxkZXI7XG5cdHByaXZhdGUgdmlld01vZGVsOiBJU2VhcmNoTW9kZWw7XG5cdHByaXZhdGUgbWVtZW50bzogTWVtZW50bzxJU2VhcmNoVmlld1N0YXRlPjtcblxuXHRwcml2YXRlIHZpZXdsZXRWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dEJveEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlucHV0UGF0dGVybkluY2x1ZGVzRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaW5wdXRQYXR0ZXJuRXhjbHVzaW9uc0ZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZpcnN0TWF0Y2hGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmaWxlTWF0Y2hPck1hdGNoRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZmlsZU1hdGNoT3JGb2xkZXJNYXRjaEZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmaWxlTWF0Y2hPckZvbGRlck1hdGNoV2l0aFJlc291cmNlRm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZpbGVNYXRjaEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZvbGRlck1hdGNoRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBtYXRjaEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNlYXJjaFJlc3VsdEhlYWRlckZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlzRWRpdGFibGVJdGVtOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNTZWFyY2hSZXN1bHRzS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsYXN0Rm9jdXNTdGF0ZTogJ2lucHV0JyB8ICd0cmVlJyA9ICdpbnB1dCc7XG5cblx0cHJpdmF0ZSBzZWFyY2hTdGF0ZUtleTogSUNvbnRleHRLZXk8U2VhcmNoVUlTdGF0ZT47XG5cdHByaXZhdGUgaGFzU2VhcmNoUGF0dGVybktleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaGFzUmVwbGFjZVBhdHRlcm5LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhhc0ZpbGVQYXR0ZXJuS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNTb21lQ29sbGFwc2libGVSZXN1bHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoPjtcblx0cHJpdmF0ZSB0cmVlTGFiZWxzITogUmVzb3VyY2VMYWJlbHM7XG5cdHByaXZhdGUgdmlld2xldFN0YXRlOiBJU2VhcmNoVmlld1N0YXRlO1xuXHRwcml2YXRlIG1lc3NhZ2VzRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHNlYXJjaFdpZGdldHNDb250YWluZXJFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoV2lkZ2V0ITogU2VhcmNoV2lkZ2V0O1xuXHRwcml2YXRlIHNpemUhOiBkb20uRGltZW5zaW9uO1xuXHRwcml2YXRlIHF1ZXJ5RGV0YWlscyE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlucHV0UGF0dGVybkV4Y2x1ZGVzITogRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldDtcblx0cHJpdmF0ZSBpbnB1dFBhdHRlcm5JbmNsdWRlcyE6IEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQ7XG5cdHByaXZhdGUgcmVzdWx0c0VsZW1lbnQhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGN1cnJlbnRTZWxlY3RlZEZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudEVkaXRvckN1cnNvckxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgZGVsYXllZFJlZnJlc2g6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgY2hhbmdlZFdoaWxlSGlkZGVuOiBib29sZWFuO1xuXG5cdHByaXZhdGUgc2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGN1cnJlbnRTZWFyY2hRID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHByaXZhdGUgYWRkVG9TZWFyY2hIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblxuXHRwcml2YXRlIHRvZ2dsZUNvbGxhcHNlU3RhdGVEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgdHJpZ2dlclF1ZXJ5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBwYXVzZVNlYXJjaGluZyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgdHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlcjogU2VhcmNoQWNjZXNzaWJpbGl0eVByb3ZpZGVyO1xuXG5cdHByaXZhdGUgdHJlZVZpZXdLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX3Zpc2libGVNYXRjaGVzOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX3JlZnJlc2hSZXN1bHRzU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdHByaXZhdGUgX29uU2VhcmNoUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkFJUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2VhcmNoRGF0YVNvdXJjZTogU2VhcmNoVmlld0RhdGFTb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWZyZXNoVHJlZUNvbnRyb2xsZXI6IFJlZnJlc2hUcmVlQ29udHJvbGxlcjtcblxuXHRwcml2YXRlIF9jYWNoZWRSZXN1bHRzOiBJU2VhcmNoQ29tcGxldGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhY2hlZEtleXdvcmRzOiBzdHJpbmdbXSA9IFtdO1xuXHRwdWJsaWMgX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2U6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB8IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlOiBJU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElSZXBsYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcGxhY2VTZXJ2aWNlOiBJUmVwbGFjZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU2VhcmNoSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hIaXN0b3J5U2VydmljZTogSVNlYXJjaEhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gZG9tLiQoJy5zZWFyY2gtdmlldycpO1xuXG5cdFx0Ly8gZ2xvYmFsc1xuXHRcdHRoaXMudmlld2xldFZpc2libGUgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5maXJzdE1hdGNoRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpcnN0TWF0Y2hGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5maWxlTWF0Y2hPck1hdGNoRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yTWF0Y2hGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5maWxlTWF0Y2hPckZvbGRlck1hdGNoRm9jdXMgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPckZvbGRlck1hdGNoRm9jdXNLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsZU1hdGNoT3JGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZU1hdGNoT3JGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbGVNYXRjaEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZm9sZGVyTWF0Y2hGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRm9sZGVyRm9jdXNLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVzb3VyY2VGb2xkZXJGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRIZWFkZXJGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNTZWFyY2hSZXN1bHRzS2V5ID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSGFzU2VhcmNoUmVzdWx0cy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5tYXRjaEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaFN0YXRlS2V5ID0gU2VhcmNoU3RhdGVLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzU2VhcmNoUGF0dGVybktleSA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTZWFyY2hQYXR0ZXJuS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc1JlcGxhY2VQYXR0ZXJuS2V5ID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1JlcGxhY2VQYXR0ZXJuS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0ZpbGVQYXR0ZXJuS2V5ID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc0ZpbGVQYXR0ZXJuS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc1NvbWVDb2xsYXBzaWJsZVJlc3VsdEtleSA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTb21lQ29sbGFwc2libGVLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHJlZVZpZXdLZXkgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5JblRyZWVWaWV3S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVmcmVzaFRyZWVDb250cm9sbGVyLCB0aGlzLCAoKSA9PiB0aGlzLnNlYXJjaENvbmZpZykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRjb25zdCBrZXlzID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuaGFzQUlSZXN1bHRQcm92aWRlci5rZXlzKCk7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KGtleXMpKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hIYXNBSVNldHRpbmcoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBzY29wZWRcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5jb250YWluZXIpKTtcblx0XHRDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3Rm9jdXNlZEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdHRoaXMuaW5wdXRCb3hGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5wdXRCb3hGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlBhdHRlcm5JbmNsdWRlc0ZvY3VzZWRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVzaW9uc0ZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5QYXR0ZXJuRXhjbHVkZXNGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlzRWRpdGFibGVJdGVtID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzZWFyY2guc29ydE9yZGVyJykpIHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoQ29uZmlnLnNvcnRPcmRlciA9PT0gU2VhcmNoU29ydE9yZGVyLk1vZGlmaWVkKSB7XG5cdFx0XHRcdFx0Ly8gSWYgY2hhbmdpbmcgYXdheSBmcm9tIG1vZGlmaWVkLCByZW1vdmUgYWxsIGZpbGVTdGF0c1xuXHRcdFx0XHRcdC8vIHNvIHRoYXQgdXBkYXRlZCBmaWxlcyBhcmUgcmUtcmV0cmlldmVkIG5leHQgdGltZS5cblx0XHRcdFx0XHR0aGlzLnJlbW92ZUZpbGVTdGF0cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLnF1ZXVlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLnNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2Uuc2VhcmNoTW9kZWw7XG5cdFx0dGhpcy5xdWVyeUJ1aWxkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1ZXJ5QnVpbGRlcik7XG5cdFx0dGhpcy5tZW1lbnRvID0gbmV3IE1lbWVudG8odGhpcy5pZCwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMudmlld2xldFN0YXRlID0gdGhpcy5tZW1lbnRvLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25GaWxlc0NoYW5nZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRGaWxlU2VydmljZS51bnRpdGxlZC5vbldpbGxEaXNwb3NlKG1vZGVsID0+IHRoaXMub25VbnRpdGxlZERpZERpc3Bvc2UobW9kZWwucmVzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hIaXN0b3J5U2VydmljZS5vbkRpZENsZWFySGlzdG9yeSgoKSA9PiB0aGlzLmNsZWFySGlzdG9yeSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUNoYW5nZWRGaWxlc1RvZ2dsZUVuYWJsZWQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYXNDaGFuZ2VzID0gWy4uLnRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXNdLnNvbWUoXG5cdFx0XHRcdHJlcG8gPT4gcmVwby5wcm92aWRlci5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5yZXNvdXJjZXMubGVuZ3RoID4gMClcblx0XHRcdCk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzPy5zZXRPbmx5U2VhcmNoSW5DaGFuZ2VkRmlsZXNFbmFibGVkKGhhc0NoYW5nZXMpO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2NtUmVwb3NpdG9yeUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPElTQ01SZXBvc2l0b3J5PigpKTtcblx0XHRjb25zdCByZWdpc3RlclNjbVJlcG9zaXRvcnlMaXN0ZW5lcnMgPSAocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpID0+IHtcblx0XHRcdHNjbVJlcG9zaXRvcnlMaXN0ZW5lcnMuc2V0KHJlcG9zaXRvcnksIHJlcG9zaXRvcnkucHJvdmlkZXIub25EaWRDaGFuZ2VSZXNvdXJjZXMoKCkgPT4ge1xuXHRcdFx0XHR1cGRhdGVDaGFuZ2VkRmlsZXNUb2dnbGVFbmFibGVkKCk7XG5cdFx0XHRcdGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzPy5vbmx5U2VhcmNoSW5DaGFuZ2VkRmlsZXMoKSkge1xuXHRcdFx0XHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9O1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiB0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRyZWdpc3RlclNjbVJlcG9zaXRvcnlMaXN0ZW5lcnMocmVwb3NpdG9yeSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NtU2VydmljZS5vbkRpZEFkZFJlcG9zaXRvcnkocmVwb3NpdG9yeSA9PiB7XG5cdFx0XHRyZWdpc3RlclNjbVJlcG9zaXRvcnlMaXN0ZW5lcnMocmVwb3NpdG9yeSk7XG5cdFx0XHR1cGRhdGVDaGFuZ2VkRmlsZXNUb2dnbGVFbmFibGVkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2NtU2VydmljZS5vbkRpZFJlbW92ZVJlcG9zaXRvcnkocmVwb3NpdG9yeSA9PiB7XG5cdFx0XHRzY21SZXBvc2l0b3J5TGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UocmVwb3NpdG9yeSk7XG5cdFx0XHR1cGRhdGVDaGFuZ2VkRmlsZXNUb2dnbGVFbmFibGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kZWxheWVkUmVmcmVzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDI1MCkpO1xuXG5cdFx0dGhpcy5hZGRUb1NlYXJjaEhpc3RvcnlEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwMCkpO1xuXHRcdHRoaXMudG9nZ2xlQ29sbGFwc2VTdGF0ZURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigxMDApKTtcblx0XHR0aGlzLnRyaWdnZXJRdWVyeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigwKSk7XG5cblx0XHR0aGlzLnRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaEFjY2Vzc2liaWxpdHlQcm92aWRlciwgdGhpcyk7XG5cdFx0dGhpcy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSA9IHRoaXMudmlld2xldFN0YXRlLnZpZXc/LnRyZWVMYXlvdXQgPz8gKHRoaXMuc2VhcmNoQ29uZmlnLmRlZmF1bHRWaWV3TW9kZSA9PT0gVmlld01vZGUuVHJlZSk7XG5cblx0XHR0aGlzLl9yZWZyZXNoUmVzdWx0c1NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKHRoaXMuX3VwZGF0ZVJlc3VsdHMuYmluZCh0aGlzKSwgODApKTtcblxuXHRcdC8vIHN0b3JhZ2Ugc2VydmljZSBsaXN0ZW5lciBmb3IgZm9yIHJvYW1pbmcgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMuX3NhdmVTZWFyY2hIaXN0b3J5U2VydmljZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTZWFyY2hIaXN0b3J5U2VydmljZS5TRUFSQ0hfSElTVE9SWV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN0b3JlZEhpc3RvcnkgPSB0aGlzLnNlYXJjaEhpc3RvcnlTZXJ2aWNlLmxvYWQoKTtcblxuXHRcdFx0aWYgKHJlc3RvcmVkSGlzdG9yeS5pbmNsdWRlKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMucHJlcGVuZEhpc3RvcnkocmVzdG9yZWRIaXN0b3J5LmluY2x1ZGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3RvcmVkSGlzdG9yeS5leGNsdWRlKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMucHJlcGVuZEhpc3RvcnkocmVzdG9yZWRIaXN0b3J5LmV4Y2x1ZGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3RvcmVkSGlzdG9yeS5zZWFyY2gpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQucHJlcGVuZFNlYXJjaEhpc3RvcnkocmVzdG9yZWRIaXN0b3J5LnNlYXJjaCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdG9yZWRIaXN0b3J5LnJlcGxhY2UpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQucHJlcGVuZFJlcGxhY2VIaXN0b3J5KHJlc3RvcmVkSGlzdG9yeS5yZXBsYWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNoYW5nZWRXaGlsZUhpZGRlbiA9IHRoaXMuaGFzU2VhcmNoUmVzdWx0cygpO1xuXHR9XG5cblx0cHVibGljIGdldCBjYWNoZWRSZXN1bHRzKCkge1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRSZXN1bHRzO1xuXHR9XG5cblx0YXN5bmMgcXVldWVSZWZyZXNoVHJlZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIucXVldWUoKTtcblx0fVxuXHRnZXQgaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZVZpZXdLZXkuZ2V0KCkgPz8gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHNldCBpc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy50cmVlVmlld0tleS5zZXQodmlzaWJsZSk7XG5cdH1cblxuXHRhc3luYyBzZXRUcmVlVmlldyh2aXNpYmxlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHZpc2libGUgPT09IHRoaXMuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy51cGRhdGVJbmRlbnRTdHlsZXModGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIucXVldWUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHN0YXRlKCk6IFNlYXJjaFVJU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFN0YXRlS2V5LmdldCgpID8/IFNlYXJjaFVJU3RhdGUuSWRsZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IHN0YXRlKHY6IFNlYXJjaFVJU3RhdGUpIHtcblx0XHR0aGlzLnNlYXJjaFN0YXRlS2V5LnNldCh2KTtcblx0fVxuXG5cdGdldENvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IHNlYXJjaFJlc3VsdCgpOiBJU2VhcmNoUmVzdWx0IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWwgJiYgdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0O1xuXHR9XG5cblx0Z2V0IG1vZGVsKCk6IElTZWFyY2hNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoSGFzQUlTZXR0aW5nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNob3VsZFNob3dBSSA9IHRoaXMuc2hvdWxkU2hvd0FJUmVzdWx0cygpO1xuXHRcdGlmICghdGhpcy50cmVlIHx8ICF0aGlzLnRyZWUuaGFzTm9kZSh0aGlzLnNlYXJjaFJlc3VsdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNob3VsZFNob3dBSSAmJiAhdGhpcy50cmVlLmhhc05vZGUodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KSkge1xuXHRcdFx0aWYgKHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmdldENhY2hlZFNlYXJjaENvbXBsZXRlKGZhbHNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoQW5kVXBkYXRlQ291bnQoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFzaG91bGRTaG93QUkgJiYgdGhpcy50cmVlLmhhc05vZGUodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVmcmVzaEFuZFVwZGF0ZUNvdW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIHRoaXMuc2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2VFbGVtZW50KSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLnNlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoSW5wdXRzKCkge1xuXHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSB0cnVlO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5xdWVyeT8uY29udGVudFBhdHRlcm4ucGF0dGVybiA/PyAnJyk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKGZhbHNlKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC50b2dnbGVSZXBsYWNlKHRydWUpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluT3BlbkVkaXRvcnModGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnF1ZXJ5Py5vbmx5T3BlbkVkaXRvcnMgfHwgZmFsc2UpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyghdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnF1ZXJ5Py51c2VyRGlzYWJsZWRFeGNsdWRlc0FuZElnbm9yZUZpbGVzIHx8IHRydWUpO1xuXHRcdHRoaXMuc2VhcmNoSW5jbHVkZVBhdHRlcm4uc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuc2VhcmNoRXhjbHVkZVBhdHRlcm4uc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXBsYWNlU2VhcmNoTW9kZWwoc2VhcmNoTW9kZWw6IElTZWFyY2hNb2RlbCwgYXN5bmNSZXN1bHRzOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcHJvZ3Jlc3NDb21wbGV0ZTogKCkgPT4gdm9pZDtcblx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogdGhpcy5nZXRQcm9ncmVzc0xvY2F0aW9uKCksIGRlbGF5OiAwIH0sIF9wcm9ncmVzcyA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBwcm9ncmVzc0NvbXBsZXRlID0gcmVzb2x2ZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzbG93VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTZWFyY2hVSVN0YXRlLlNsb3dTZWFyY2g7XG5cdFx0fSwgMjAwMCk7XG5cblx0XHR0aGlzLl9yZWZyZXNoUmVzdWx0c1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0Ly8gcmVtb3ZlIG9sZCBtb2RlbCBhbmQgdXNlIHRoZSBuZXcgc2VhcmNoTW9kZWxcblx0XHRzZWFyY2hNb2RlbC5sb2NhdGlvbiA9IFNlYXJjaE1vZGVsTG9jYXRpb24uUEFORUw7XG5cdFx0c2VhcmNoTW9kZWwucmVwbGFjZUFjdGl2ZSA9IHRoaXMudmlld01vZGVsLmlzUmVwbGFjZUFjdGl2ZSgpO1xuXHRcdHNlYXJjaE1vZGVsLnJlcGxhY2VTdHJpbmcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKTtcblx0XHR0aGlzLl9vblNlYXJjaFJlc3VsdENoYW5nZWREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25TZWFyY2hSZXN1bHRDaGFuZ2VkRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKHNlYXJjaE1vZGVsLm9uU2VhcmNoUmVzdWx0Q2hhbmdlZChhc3luYyAoZXZlbnQpID0+IHRoaXMub25TZWFyY2hSZXN1bHRzQ2hhbmdlZChldmVudCkpKTtcblxuXHRcdC8vIHRoaXMgY2FsbCB3aWxsIGFsc28gZGlzcG9zZSBvZiB0aGUgb2xkIG1vZGVsXG5cdFx0dGhpcy5zZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlLnNlYXJjaE1vZGVsID0gc2VhcmNoTW9kZWw7XG5cdFx0dGhpcy52aWV3TW9kZWwgPSBzZWFyY2hNb2RlbDtcblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0KTtcblxuXHRcdGF3YWl0IHRoaXMub25TZWFyY2hSZXN1bHRzQ2hhbmdlZCgpO1xuXHRcdHRoaXMucmVmcmVzaElucHV0cygpO1xuXG5cdFx0YXN5bmNSZXN1bHRzLnRoZW4oKGNvbXBsZXRlKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoc2xvd1RpbWVyKTtcblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoQ29tcGxldGUocHJvZ3Jlc3NDb21wbGV0ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbXBsZXRlKTtcblx0XHR9LCAoZSkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNsb3dUaW1lcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblNlYXJjaEVycm9yKGUsIHByb2dyZXNzQ29tcGxldGUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRoaXMuZXhwYW5kSWZTaW5ndWxhclJlc3VsdCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkocGFyZW50KTtcblx0XHR0aGlzLmNvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLnNlYXJjaC12aWV3JykpO1xuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXRzQ29udGFpbmVyRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5zZWFyY2gtd2lkZ2V0cy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jcmVhdGVTZWFyY2hXaWRnZXQodGhpcy5zZWFyY2hXaWRnZXRzQ29udGFpbmVyRWxlbWVudCk7XG5cblx0XHRjb25zdCBoaXN0b3J5ID0gdGhpcy5zZWFyY2hIaXN0b3J5U2VydmljZS5sb2FkKCk7XG5cdFx0Y29uc3QgZmlsZVBhdHRlcm5zID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LmZpbGVQYXR0ZXJucyB8fCAnJztcblx0XHRjb25zdCBwYXR0ZXJuRXhjbHVzaW9ucyA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5mb2xkZXJFeGNsdXNpb25zIHx8ICcnO1xuXHRcdGNvbnN0IHBhdHRlcm5FeGNsdXNpb25zSGlzdG9yeTogc3RyaW5nW10gPSBoaXN0b3J5LmV4Y2x1ZGUgfHwgW107XG5cdFx0Y29uc3QgcGF0dGVybkluY2x1ZGVzID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LmZvbGRlckluY2x1ZGVzIHx8ICcnO1xuXHRcdGNvbnN0IHBhdHRlcm5JbmNsdWRlc0hpc3Rvcnk6IHN0cmluZ1tdID0gaGlzdG9yeS5pbmNsdWRlIHx8IFtdO1xuXHRcdGNvbnN0IG9ubHlPcGVuRWRpdG9ycyA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5vbmx5T3BlbkVkaXRvcnMgfHwgZmFsc2U7XG5cblx0XHRjb25zdCBxdWVyeURldGFpbHNFeHBhbmRlZCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5xdWVyeURldGFpbHNFeHBhbmRlZCB8fCAnJztcblx0XHRjb25zdCB1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzID0gdHlwZW9mIHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py51c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzID09PSAnYm9vbGVhbicgP1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkudXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyA6IHRydWU7XG5cblx0XHR0aGlzLnF1ZXJ5RGV0YWlscyA9IGRvbS5hcHBlbmQodGhpcy5zZWFyY2hXaWRnZXRzQ29udGFpbmVyRWxlbWVudCwgJCgnLnF1ZXJ5LWRldGFpbHMnKSk7XG5cblx0XHQvLyBUb2dnbGUgcXVlcnkgZGV0YWlscyBidXR0b25cblx0XHRjb25zdCB0b2dnbGVRdWVyeURldGFpbHNMYWJlbCA9IG5scy5sb2NhbGl6ZSgnbW9yZVNlYXJjaCcsIFwiVG9nZ2xlIFNlYXJjaCBEZXRhaWxzXCIpO1xuXHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uID0gZG9tLmFwcGVuZCh0aGlzLnF1ZXJ5RGV0YWlscyxcblx0XHRcdCQoJy5tb3JlJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHNlYXJjaERldGFpbHNJY29uKSwgeyB0YWJpbmRleDogMCwgcm9sZTogJ2J1dHRvbicsICdhcmlhLWxhYmVsJzogdG9nZ2xlUXVlcnlEZXRhaWxzTGFiZWwgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcodG9nZ2xlUXVlcnlEZXRhaWxzTGFiZWwsIENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlRvZ2dsZVF1ZXJ5RGV0YWlsc0FjdGlvbklkKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKCF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCBkb20uRXZlbnRUeXBlLktFWV9VUCwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYikpIHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LmlzUmVwbGFjZUFjdGl2ZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXNSZXBsYWNlQWxsQWN0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuaXNSZXBsYWNlU2hvd24oKSA/IHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dD8uZm9jdXNPblByZXNlcnZlKCkgOiB0aGlzLnNlYXJjaFdpZGdldC5mb2N1c1JlZ2V4QWN0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZm9sZGVyIGluY2x1ZGVzIGxpc3Rcblx0XHRjb25zdCBmb2xkZXJJbmNsdWRlc0xpc3QgPSBkb20uYXBwZW5kKHRoaXMucXVlcnlEZXRhaWxzLCAkKCcuZmlsZS10eXBlcy5pbmNsdWRlcycpKTtcblx0XHRjb25zdCBmaWxlc1RvSW5jbHVkZVRpdGxlID0gbmxzLmxvY2FsaXplKCdzZWFyY2hTY29wZS5pbmNsdWRlcycsIFwiZmlsZXMgdG8gaW5jbHVkZVwiKTtcblx0XHRkb20uYXBwZW5kKGZvbGRlckluY2x1ZGVzTGlzdCwgJCgnaDQnLCB1bmRlZmluZWQsIGZpbGVzVG9JbmNsdWRlVGl0bGUpKTtcblxuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQsIGZvbGRlckluY2x1ZGVzTGlzdCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdGFyaWFMYWJlbDogZmlsZXNUb0luY2x1ZGVUaXRsZSxcblx0XHRcdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLmluY2x1ZGVzJywgXCJlLmcuICoudHMsIHNyYy8qKi9pbmNsdWRlXCIpLFxuXHRcdFx0c2hvd1BsYWNlaG9sZGVyT25Gb2N1czogdHJ1ZSxcblx0XHRcdGhpc3Rvcnk6IHBhdHRlcm5JbmNsdWRlc0hpc3RvcnksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRWYWx1ZShwYXR0ZXJuSW5jbHVkZXMpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluT3BlbkVkaXRvcnMob25seU9wZW5FZGl0b3JzKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldE9ubHlTZWFyY2hJbkNoYW5nZWRGaWxlc0VuYWJsZWQoXG5cdFx0XHRbLi4udGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllc10uc29tZShyZXBvID0+IHJlcG8ucHJvdmlkZXIuZ3JvdXBzLnNvbWUoZ3JvdXAgPT4gZ3JvdXAucmVzb3VyY2VzLmxlbmd0aCA+IDApKVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9uQ2FuY2VsKCgpID0+IHRoaXMuY2FuY2VsU2VhcmNoKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25DaGFuZ2VTZWFyY2hJbkVkaXRvcnNCb3goKCkgPT4gdGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25DaGFuZ2VTZWFyY2hJbkNoYW5nZWRGaWxlc0JveCgoKSA9PiB0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSgpKSk7XG5cblx0XHR0aGlzLnRyYWNrSW5wdXRCb3godGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEZvY3VzVHJhY2tlciwgdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlc0ZvY3VzZWQpO1xuXG5cdFx0Ly8gZXhjbHVkZXMgbGlzdFxuXHRcdGNvbnN0IGV4Y2x1ZGVzTGlzdCA9IGRvbS5hcHBlbmQodGhpcy5xdWVyeURldGFpbHMsICQoJy5maWxlLXR5cGVzLmV4Y2x1ZGVzJykpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVzVGl0bGUgPSBubHMubG9jYWxpemUoJ3NlYXJjaFNjb3BlLmV4Y2x1ZGVzJywgXCJmaWxlcyB0byBleGNsdWRlXCIpO1xuXHRcdGRvbS5hcHBlbmQoZXhjbHVkZXNMaXN0LCAkKCdoNCcsIHVuZGVmaW5lZCwgZXhjbHVkZXNUaXRsZSkpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4Y2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQsIGV4Y2x1ZGVzTGlzdCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdGFyaWFMYWJlbDogZXhjbHVkZXNUaXRsZSxcblx0XHRcdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLmV4Y2x1ZGVzJywgXCJlLmcuICoudHMsIHNyYy8qKi9leGNsdWRlXCIpLFxuXHRcdFx0c2hvd1BsYWNlaG9sZGVyT25Gb2N1czogdHJ1ZSxcblx0XHRcdGhpc3Rvcnk6IHBhdHRlcm5FeGNsdXNpb25zSGlzdG9yeSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KSk7XG5cblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFZhbHVlKHBhdHRlcm5FeGNsdXNpb25zKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXModXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLm9uQ2FuY2VsKCgpID0+IHRoaXMuY2FuY2VsU2VhcmNoKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25DaGFuZ2VJZ25vcmVCb3goKCkgPT4gdGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoKSkpO1xuXHRcdHRoaXMudHJhY2tJbnB1dEJveCh0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmlucHV0Rm9jdXNUcmFja2VyLCB0aGlzLmlucHV0UGF0dGVybkV4Y2x1c2lvbnNGb2N1c2VkKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUhhc0ZpbGVQYXR0ZXJuS2V5ID0gKCkgPT4gdGhpcy5oYXNGaWxlUGF0dGVybktleS5zZXQodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5nZXRWYWx1ZSgpLmxlbmd0aCA+IDAgfHwgdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5nZXRWYWx1ZSgpLmxlbmd0aCA+IDApO1xuXHRcdHVwZGF0ZUhhc0ZpbGVQYXR0ZXJuS2V5KCk7XG5cdFx0Y29uc3Qgb25GaWxlUGF0dGVyblN1Ym1pdCA9ICh0cmlnZ2VyZWRPblR5cGU6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgdHJpZ2dlcmVkT25UeXBlLCBkZWxheTogdGhpcy5zZWFyY2hDb25maWcuc2VhcmNoT25UeXBlRGVib3VuY2VQZXJpb2QgfSk7XG5cdFx0XHRpZiAodHJpZ2dlcmVkT25UeXBlKSB7XG5cdFx0XHRcdHVwZGF0ZUhhc0ZpbGVQYXR0ZXJuS2V5KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9uU3VibWl0KG9uRmlsZVBhdHRlcm5TdWJtaXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLm9uU3VibWl0KG9uRmlsZVBhdHRlcm5TdWJtaXQpKTtcblxuXHRcdHRoaXMubWVzc2FnZXNFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLm1lc3NhZ2VzLnRleHQtc2VhcmNoLXByb3ZpZGVyLW1lc3NhZ2VzJykpO1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHR0aGlzLnNob3dTZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuY3JlYXRlU2VhcmNoUmVzdWx0c1ZpZXcodGhpcy5jb250YWluZXIpO1xuXG5cdFx0aWYgKGZpbGVQYXR0ZXJucyAhPT0gJycgfHwgcGF0dGVybkV4Y2x1c2lvbnMgIT09ICcnIHx8IHBhdHRlcm5JbmNsdWRlcyAhPT0gJycgfHwgcXVlcnlEZXRhaWxzRXhwYW5kZWQgIT09ICcnIHx8ICF1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlscyh0cnVlLCB0cnVlLCB0cnVlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vblNlYXJjaFJlc3VsdENoYW5nZWREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3TW9kZWwub25TZWFyY2hSZXN1bHRDaGFuZ2VkKGFzeW5jIChldmVudCkgPT4gYXdhaXQgdGhpcy5vblNlYXJjaFJlc3VsdHNDaGFuZ2VkKGV2ZW50KSkpO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIEFJIHNlYXJjaCByZXN1bHQgY2hhbmdlcyBhbmQgdXBkYXRlIHRoZSB0cmVlIHdoZW4gbmV3IEFJIHJlc3VsdHMgYXJlIHJlcG9ydGVkXG5cdFx0dGhpcy5fb25BSVJlc3VsdENoYW5nZWREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25BSVJlc3VsdENoYW5nZWREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0Lm9uQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdC8vIE9ubHkgcmVmcmVzaCB0aGUgQUkgbm9kZSwgbm90IHRoZSB3aG9sZSB0cmVlXG5cdFx0XHRcdGlmICh0aGlzLnRyZWUgJiYgdGhpcy50cmVlLmhhc05vZGUodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KSAmJiAhZS5yZW1vdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnVwZGF0ZUNoaWxkcmVuKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHRoaXMub25WaXNpYmlsaXR5Q2hhbmdlZCh2aXNpYmxlKSkpO1xuXG5cdFx0dGhpcy51cGRhdGVJbmRlbnRTdHlsZXModGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UodGhpcy51cGRhdGVJbmRlbnRTdHlsZXMsIHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5kZW50U3R5bGVzKHRoZW1lOiBJRmlsZUljb25UaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0c0VsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZS1hcnJvd3MnLCB0aGlzLmlzVHJlZUxheW91dFZpZXdWaXNpYmxlICYmIHRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblZpc2liaWxpdHlDaGFuZ2VkKHZpc2libGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnZpZXdsZXRWaXNpYmxlLnNldCh2aXNpYmxlKTtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0aWYgKHRoaXMuY2hhbmdlZFdoaWxlSGlkZGVuKSB7XG5cdFx0XHRcdC8vIFJlbmRlciBpZiByZXN1bHRzIGNoYW5nZWQgd2hpbGUgdmlld2xldCB3YXMgaGlkZGVuIC0gIzM3ODE4XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaEFuZFVwZGF0ZUNvdW50KCk7XG5cdFx0XHRcdHRoaXMuY2hhbmdlZFdoaWxlSGlkZGVuID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlc2V0IGxhc3QgZm9jdXMgdG8gaW5wdXQgdG8gcHJlc2VydmUgb3BlbmluZyB0aGUgdmlld2xldCBhbHdheXMgZm9jdXNpbmcgdGhlIHF1ZXJ5IGVkaXRvci5cblx0XHRcdHRoaXMubGFzdEZvY3VzU3RhdGUgPSAnaW5wdXQnO1xuXHRcdH1cblxuXHRcdC8vIEVuYWJsZSBoaWdobGlnaHRzIGlmIHRoZXJlIGFyZSBzZWFyY2hyZXN1bHRzXG5cdFx0dGhpcy52aWV3TW9kZWw/LnNlYXJjaFJlc3VsdC50b2dnbGVIaWdobGlnaHRzKHZpc2libGUpO1xuXHR9XG5cblx0Z2V0IHNlYXJjaEFuZFJlcGxhY2VXaWRnZXQoKTogU2VhcmNoV2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hXaWRnZXQ7XG5cdH1cblxuXHRnZXQgc2VhcmNoSW5jbHVkZVBhdHRlcm4oKTogSW5jbHVkZVBhdHRlcm5JbnB1dFdpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXM7XG5cdH1cblxuXHRnZXQgc2VhcmNoRXhjbHVkZVBhdHRlcm4oKTogRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlYXJjaFdpZGdldChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGVudFBhdHRlcm4gPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uY29udGVudFBhdHRlcm4gfHwgJyc7XG5cdFx0Y29uc3QgcmVwbGFjZVRleHQgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8ucmVwbGFjZVRleHQgfHwgJyc7XG5cdFx0Y29uc3QgaXNSZWdleCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5yZWdleCA9PT0gdHJ1ZTtcblx0XHRjb25zdCBpc1dob2xlV29yZHMgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8ud2hvbGVXb3JkcyA9PT0gdHJ1ZTtcblx0XHRjb25zdCBpc0Nhc2VTZW5zaXRpdmUgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uY2FzZVNlbnNpdGl2ZSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBoaXN0b3J5ID0gdGhpcy5zZWFyY2hIaXN0b3J5U2VydmljZS5sb2FkKCk7XG5cdFx0Y29uc3Qgc2VhcmNoSGlzdG9yeSA9IGhpc3Rvcnkuc2VhcmNoIHx8IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5zZWFyY2hIaXN0b3J5IHx8IFtdO1xuXHRcdGNvbnN0IHJlcGxhY2VIaXN0b3J5ID0gaGlzdG9yeS5yZXBsYWNlIHx8IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5yZXBsYWNlSGlzdG9yeSB8fCBbXTtcblx0XHRjb25zdCBzaG93UmVwbGFjZSA9IHR5cGVvZiB0aGlzLnZpZXdsZXRTdGF0ZS52aWV3Py5zaG93UmVwbGFjZSA9PT0gJ2Jvb2xlYW4nID8gdGhpcy52aWV3bGV0U3RhdGUudmlldy5zaG93UmVwbGFjZSA6IHRydWU7XG5cdFx0Y29uc3QgcHJlc2VydmVDYXNlID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnByZXNlcnZlQ2FzZSA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uaXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCA/PyB0cnVlO1xuXHRcdGNvbnN0IGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldyA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5pc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcgPz8gdHJ1ZTtcblx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsSW5wdXQgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uaXNJbk5vdGVib29rQ2VsbElucHV0ID8/IHRydWU7XG5cdFx0Y29uc3QgaXNJbk5vdGVib29rQ2VsbE91dHB1dCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5pc0luTm90ZWJvb2tDZWxsT3V0cHV0ID8/IHRydWU7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoV2lkZ2V0LCBjb250YWluZXIsIHtcblx0XHRcdHZhbHVlOiBjb250ZW50UGF0dGVybixcblx0XHRcdHJlcGxhY2VWYWx1ZTogcmVwbGFjZVRleHQsXG5cdFx0XHRpc1JlZ2V4OiBpc1JlZ2V4LFxuXHRcdFx0aXNDYXNlU2Vuc2l0aXZlOiBpc0Nhc2VTZW5zaXRpdmUsXG5cdFx0XHRpc1dob2xlV29yZHM6IGlzV2hvbGVXb3Jkcyxcblx0XHRcdHNlYXJjaEhpc3Rvcnk6IHNlYXJjaEhpc3RvcnksXG5cdFx0XHRyZXBsYWNlSGlzdG9yeTogcmVwbGFjZUhpc3RvcnksXG5cdFx0XHRwcmVzZXJ2ZUNhc2U6IHByZXNlcnZlQ2FzZSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0XHR0b2dnbGVTdHlsZXM6IGRlZmF1bHRUb2dnbGVTdHlsZXMsXG5cdFx0XHRub3RlYm9va09wdGlvbnM6IHtcblx0XHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCxcblx0XHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3LFxuXHRcdFx0XHRpc0luTm90ZWJvb2tDZWxsSW5wdXQsXG5cdFx0XHRcdGlzSW5Ob3RlYm9va0NlbGxPdXRwdXQsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dCB8fCAhdGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgQ2Fubm90IGZ1bGx5IGNyZWF0ZSBzZWFyY2ggd2lkZ2V0LiBTZWFyY2ggb3IgcmVwbGFjZSBpbnB1dCB1bmRlZmluZWQuIFNlYXJjaElucHV0OiAke3RoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0fSwgUmVwbGFjZUlucHV0OiAke3RoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2hvd1JlcGxhY2UpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnRvZ2dsZVJlcGxhY2UodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25TZWFyY2hTdWJtaXQob3B0aW9ucyA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGRSZW5kZXJBSVJlc3VsdHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvcjtcblx0XHRcdGlmIChzaG91bGRSZW5kZXJBSVJlc3VsdHMgPT09IFNlbWFudGljU2VhcmNoQmVoYXZpb3IuQXV0bykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2VhcmNoVmlldzogQXV0b21hdGljYWxseSByZW5kZXJpbmcgQUkgcmVzdWx0c2ApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2Uoe1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRzaG91bGRLZWVwQUlSZXN1bHRzOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkVXBkYXRlQUlTZWFyY2g6IHNob3VsZFJlbmRlckFJUmVzdWx0cyA9PT0gU2VtYW50aWNTZWFyY2hCZWhhdmlvci5BdXRvLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uU2VhcmNoQ2FuY2VsKCh7IGZvY3VzIH0pID0+IHRoaXMuY2FuY2VsU2VhcmNoKGZvY3VzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Lm9uRGlkT3B0aW9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgc2hvdWxkS2VlcEFJUmVzdWx0czogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7IHNob3VsZEtlZXBBSVJlc3VsdHM6IHRydWUgfSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUhhc1BhdHRlcm5LZXkgPSAoKSA9PiB0aGlzLmhhc1NlYXJjaFBhdHRlcm5LZXkuc2V0KHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0ID8gKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0LmdldFZhbHVlKCkubGVuZ3RoID4gMCkgOiBmYWxzZSk7XG5cdFx0dXBkYXRlSGFzUGF0dGVybktleSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZUhhc1BhdHRlcm5LZXkoKSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlSGFzUmVwbGFjZVBhdHRlcm5LZXkgPSAoKSA9PiB0aGlzLmhhc1JlcGxhY2VQYXR0ZXJuS2V5LnNldCh0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKS5sZW5ndGggPiAwKTtcblx0XHR1cGRhdGVIYXNSZXBsYWNlUGF0dGVybktleSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGVIYXNSZXBsYWNlUGF0dGVybktleSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vbkRpZEhlaWdodENoYW5nZSgoKSA9PiB0aGlzLnJlTGF5b3V0KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uUmVwbGFjZVRvZ2dsZWQoKCkgPT4gdGhpcy5yZUxheW91dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25SZXBsYWNlU3RhdGVDaGFuZ2UoYXN5bmMgKHN0YXRlKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5yZXBsYWNlQWN0aXZlID0gc3RhdGU7XG5cdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uUHJlc2VydmVDYXNlQ2hhbmdlKGFzeW5jIChzdGF0ZSkgPT4ge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwucHJlc2VydmVDYXNlID0gc3RhdGU7XG5cdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uUmVwbGFjZVZhbHVlQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5yZXBsYWNlU3RyaW5nID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0UmVwbGFjZVZhbHVlKCk7XG5cdFx0XHR0aGlzLmRlbGF5ZWRSZWZyZXNoLnRyaWdnZXIoYXN5bmMgKCkgPT4gdGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIucXVldWUoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25CbHVyKCgpID0+IHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLmZvY3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25SZXBsYWNlQWxsKCgpID0+IHRoaXMucmVwbGFjZUFsbCgpKSk7XG5cblx0XHR0aGlzLnRyYWNrSW5wdXRCb3godGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXRGb2N1c1RyYWNrZXIpO1xuXHRcdHRoaXMudHJhY2tJbnB1dEJveCh0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIpO1xuXHR9XG5cblx0cHVibGljIHNob3VsZFNob3dBSVJlc3VsdHMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaGFzUHJvdmlkZXIgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5oYXNBSVJlc3VsdFByb3ZpZGVyLmdldFZhbHVlKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHJldHVybiAhIWhhc1Byb3ZpZGVyO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgb25Db25maWd1cmF0aW9uVXBkYXRlZChldmVudD86IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZXZlbnQgJiYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdzZWFyY2guZGVjb3JhdGlvbnMuY29sb3JzJykgfHwgZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NlYXJjaC5kZWNvcmF0aW9ucy5iYWRnZXMnKSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdHJhY2tJbnB1dEJveChpbnB1dEZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXIgfCB1bmRlZmluZWQsIGNvbnRleHRLZXk/OiBJQ29udGV4dEtleTxib29sZWFuPik6IHZvaWQge1xuXHRcdGlmICghaW5wdXRGb2N1c1RyYWNrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dEZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMubGFzdEZvY3VzU3RhdGUgPSAnaW5wdXQnO1xuXHRcdFx0dGhpcy5pbnB1dEJveEZvY3VzZWQuc2V0KHRydWUpO1xuXHRcdFx0Y29udGV4dEtleT8uc2V0KHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dEZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbnB1dEJveEZvY3VzZWQuc2V0KHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0SGFzRm9jdXMoKVxuXHRcdFx0XHR8fCB0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXRIYXNGb2N1cygpXG5cdFx0XHRcdHx8IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuaW5wdXRIYXNGb2N1cygpXG5cdFx0XHRcdHx8IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRIYXNGb2N1cygpKTtcblx0XHRcdGNvbnRleHRLZXk/LnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaFJlc3VsdHNDaGFuZ2VkKGV2ZW50PzogSUNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlZnJlc2hBbmRVcGRhdGVDb3VudChldmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2hhbmdlZFdoaWxlSGlkZGVuID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hBbmRVcGRhdGVDb3VudChldmVudD86IElDaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFJlcGxhY2VBbGxBY3Rpb25TdGF0ZSghdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmlzRW1wdHkoKSk7XG5cdFx0dGhpcy51cGRhdGVTZWFyY2hSZXN1bHRDb3VudCh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucXVlcnkhLnVzZXJEaXNhYmxlZEV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMsIHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5xdWVyeT8ub25seU9wZW5FZGl0b3JzLCBldmVudD8uY2xlYXJpbmdBbGwpO1xuXHRcdHJldHVybiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZShldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9yaWdpbmFsU2hvdWxkQ29sbGFwc2UobWF0Y2g6IFJlbmRlcmFibGVNYXRjaCkge1xuXHRcdGNvbnN0IGNvbGxhcHNlUmVzdWx0cyA9IHRoaXMuc2VhcmNoQ29uZmlnLmNvbGxhcHNlUmVzdWx0cztcblx0XHRyZXR1cm4gKGNvbGxhcHNlUmVzdWx0cyA9PT0gJ2Fsd2F5c0NvbGxhcHNlJyB8fFxuXHRcdFx0KCEoaXNTZWFyY2hUcmVlTWF0Y2gobWF0Y2gpKSAmJiBtYXRjaC5jb3VudCgpID4gMTAgJiYgY29sbGFwc2VSZXN1bHRzICE9PSAnYWx3YXlzRXhwYW5kJykpID9cblx0XHRcdE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkIDogT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZDtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQ29sbGFwc2VBY2NvcmRpbmdUb0NvbmZpZyhtYXRjaDogUmVuZGVyYWJsZU1hdGNoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29sbGFwc2VSZXN1bHRzID0gdGhpcy5vcmlnaW5hbFNob3VsZENvbGxhcHNlKG1hdGNoKTtcblx0XHRpZiAoY29sbGFwc2VSZXN1bHRzID09PSBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgcmVwbGFjZUFsbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNvdW50KCkgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvY2N1cnJlbmNlcyA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5jb3VudCgpO1xuXHRcdGNvbnN0IGZpbGVDb3VudCA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5maWxlQ291bnQoKTtcblx0XHRjb25zdCByZXBsYWNlVmFsdWUgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKSB8fCAnJztcblx0XHRjb25zdCBhZnRlclJlcGxhY2VBbGxNZXNzYWdlID0gdGhpcy5idWlsZEFmdGVyUmVwbGFjZUFsbE1lc3NhZ2Uob2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgcmVwbGFjZVZhbHVlKTtcblxuXHRcdGxldCBwcm9ncmVzc0NvbXBsZXRlOiAoKSA9PiB2b2lkO1xuXHRcdGxldCBwcm9ncmVzc1JlcG9ydGVyOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD47XG5cblx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogdGhpcy5nZXRQcm9ncmVzc0xvY2F0aW9uKCksIGRlbGF5OiAxMDAsIHRvdGFsOiBvY2N1cnJlbmNlcyB9LCBwID0+IHtcblx0XHRcdHByb2dyZXNzUmVwb3J0ZXIgPSBwO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBwcm9ncmVzc0NvbXBsZXRlID0gcmVzb2x2ZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb25maXJtYXRpb246IElDb25maXJtYXRpb24gPSB7XG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdyZXBsYWNlQWxsLmNvbmZpcm1hdGlvbi50aXRsZScsIFwiUmVwbGFjZSBBbGxcIiksXG5cdFx0XHRtZXNzYWdlOiB0aGlzLmJ1aWxkUmVwbGFjZUFsbENvbmZpcm1hdGlvbk1lc3NhZ2Uob2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgcmVwbGFjZVZhbHVlKSxcblx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2VBbGwuY29uZmlybS5idXR0b24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBsYWNlXCIpXG5cdFx0fTtcblxuXHRcdHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKGNvbmZpcm1hdGlvbikudGhlbihyZXMgPT4ge1xuXHRcdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKGZhbHNlKTtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnJlcGxhY2VBbGwocHJvZ3Jlc3NSZXBvcnRlcikudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NDb21wbGV0ZSgpO1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY2xlYXJNZXNzYWdlKCk7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsIGFmdGVyUmVwbGFjZUFsbE1lc3NhZ2UpO1xuXHRcdFx0XHRcdHRoaXMucmVMYXlvdXQoKTtcblx0XHRcdFx0fSwgKGVycm9yKSA9PiB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NDb21wbGV0ZSgpO1xuXHRcdFx0XHRcdGVycm9ycy5pc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2dyZXNzQ29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRBZnRlclJlcGxhY2VBbGxNZXNzYWdlKG9jY3VycmVuY2VzOiBudW1iZXIsIGZpbGVDb3VudDogbnVtYmVyLCByZXBsYWNlVmFsdWU/OiBzdHJpbmcpIHtcblx0XHRpZiAob2NjdXJyZW5jZXMgPT09IDEpIHtcblx0XHRcdGlmIChmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0aWYgKHJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZS5maWxlLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZSB3aXRoICd7Mn0nLlwiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCByZXBsYWNlVmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2UuZmlsZS5tZXNzYWdlJywgXCJSZXBsYWNlZCB7MH0gb2NjdXJyZW5jZSBhY3Jvc3MgezF9IGZpbGUuXCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVwbGFjZVZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZS5maWxlcy5tZXNzYWdlJywgXCJSZXBsYWNlZCB7MH0gb2NjdXJyZW5jZSBhY3Jvc3MgezF9IGZpbGVzIHdpdGggJ3syfScuXCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIHJlcGxhY2VWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlLmZpbGVzLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZXMuXCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQpO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdGlmIChyZXBsYWNlVmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlcy5maWxlLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGUgd2l0aCAnezJ9Jy5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgcmVwbGFjZVZhbHVlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2VzLmZpbGUubWVzc2FnZScsIFwiUmVwbGFjZWQgezB9IG9jY3VycmVuY2VzIGFjcm9zcyB7MX0gZmlsZS5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlcy5maWxlcy5tZXNzYWdlJywgXCJSZXBsYWNlZCB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlcyB3aXRoICd7Mn0nLlwiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCByZXBsYWNlVmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlcy5maWxlcy5tZXNzYWdlJywgXCJSZXBsYWNlZCB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlcy5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkUmVwbGFjZUFsbENvbmZpcm1hdGlvbk1lc3NhZ2Uob2NjdXJyZW5jZXM6IG51bWJlciwgZmlsZUNvdW50OiBudW1iZXIsIHJlcGxhY2VWYWx1ZT86IHN0cmluZykge1xuXHRcdC8vIEhlbHBlciB0byB0cnVuY2F0ZSBsb25nIHZhbHVlcyB0byAxMCBsaW5lcyBtYXhcblx0XHRjb25zdCB0cnVuY2F0ZVZhbHVlID0gKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lcyA9IHZhbHVlLnNwbGl0KCdcXG4nKTtcblx0XHRcdGlmIChsaW5lcy5sZW5ndGggPiAxMCkge1xuXHRcdFx0XHRyZXR1cm4gbGluZXMuc2xpY2UoMCwgMTApLmpvaW4oJ1xcbicpICsgJ1xcbi4uLic7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3BsYXlSZXBsYWNlVmFsdWUgPSB0cnVuY2F0ZVZhbHVlKHJlcGxhY2VWYWx1ZSk7XG5cblx0XHRpZiAob2NjdXJyZW5jZXMgPT09IDEpIHtcblx0XHRcdGlmIChmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0aWYgKGRpc3BsYXlSZXBsYWNlVmFsdWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdmVBbGwub2NjdXJyZW5jZS5maWxlLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZSB3aXRoICd7Mn0nP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCBkaXNwbGF5UmVwbGFjZVZhbHVlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZS5maWxlLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZT9cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaXNwbGF5UmVwbGFjZVZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlLmZpbGVzLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZXMgd2l0aCAnezJ9Jz9cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgZGlzcGxheVJlcGxhY2VWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZS5maWxlcy5jb25maXJtYXRpb24ubWVzc2FnZScsIFwiUmVwbGFjZSB7MH0gb2NjdXJyZW5jZSBhY3Jvc3MgezF9IGZpbGVzP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0XHR9XG5cblx0XHRpZiAoZmlsZUNvdW50ID09PSAxKSB7XG5cdFx0XHRpZiAoZGlzcGxheVJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdmVBbGwub2NjdXJyZW5jZXMuZmlsZS5jb25maXJtYXRpb24ubWVzc2FnZScsIFwiUmVwbGFjZSB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlIHdpdGggJ3syfSc/XCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIGRpc3BsYXlSZXBsYWNlVmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXBsYWNlQWxsLm9jY3VycmVuY2VzLmZpbGUuY29uZmlybWF0aW9uLm1lc3NhZ2UnLCBcIlJlcGxhY2UgezB9IG9jY3VycmVuY2VzIGFjcm9zcyB7MX0gZmlsZT9cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc3BsYXlSZXBsYWNlVmFsdWUpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlcy5maWxlcy5jb25maXJtYXRpb24ubWVzc2FnZScsIFwiUmVwbGFjZSB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlcyB3aXRoICd7Mn0nP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCBkaXNwbGF5UmVwbGFjZVZhbHVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXBsYWNlQWxsLm9jY3VycmVuY2VzLmZpbGVzLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGVzP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJNZXNzYWdlKCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLnNlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlRWxlbWVudCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHdhc0hpZGRlbiA9IHRoaXMubWVzc2FnZXNFbGVtZW50LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJztcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMubWVzc2FnZXNFbGVtZW50KTtcblx0XHRkb20uc2hvdyh0aGlzLm1lc3NhZ2VzRWxlbWVudCk7XG5cdFx0dGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IG5ld01lc3NhZ2UgPSBkb20uYXBwZW5kKHRoaXMubWVzc2FnZXNFbGVtZW50LCAkKCcubWVzc2FnZScpKTtcblx0XHRpZiAod2FzSGlkZGVuKSB7XG5cdFx0XHR0aGlzLnJlTGF5b3V0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld01lc3NhZ2U7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlYXJjaFJlc3VsdHNWaWV3KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlc3VsdHNFbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5yZXN1bHRzLnNob3ctZmlsZS1pY29ucy5maWxlLWljb24tdGhlbWFibGUtdHJlZScpKTtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoRGVsZWdhdGUpO1xuXG5cdFx0Y29uc3QgaWRlbnRpdHlQcm92aWRlcjogSUlkZW50aXR5UHJvdmlkZXI8UmVuZGVyYWJsZU1hdGNoPiA9IHtcblx0XHRcdGdldElkKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pZCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLnNlYXJjaERhdGFTb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFZpZXdEYXRhU291cmNlLCB0aGlzKTtcblx0XHR0aGlzLnRyZWVMYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5IH0pKTtcblx0XHR0aGlzLnRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoPixcblx0XHRcdCdTZWFyY2hWaWV3Jyxcblx0XHRcdHRoaXMucmVzdWx0c0VsZW1lbnQsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHtcblx0XHRcdFx0aXNJbmNvbXByZXNzaWJsZTogKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCkgPT4ge1xuXG5cdFx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGVsZW1lbnQpICYmICFpc1RleHRTZWFyY2hIZWFkaW5nKGVsZW1lbnQucGFyZW50KCkpICYmICEoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KGVsZW1lbnQucGFyZW50KCkpKSAmJiAhKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290KGVsZW1lbnQucGFyZW50KCkpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb2xkZXJNYXRjaFJlbmRlcmVyLCB0aGlzLCB0aGlzLnRyZWVMYWJlbHMpKSxcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlTWF0Y2hSZW5kZXJlciwgdGhpcywgdGhpcy50cmVlTGFiZWxzKSksXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dFNlYXJjaFJlc3VsdFJlbmRlcmVyLCB0aGlzLnRyZWVMYWJlbHMpKSxcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXRjaFJlbmRlcmVyLCB0aGlzKSksXG5cdFx0XHRdLFxuXHRcdFx0dGhpcy5zZWFyY2hEYXRhU291cmNlLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHRoaXMudHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlcixcblx0XHRcdFx0ZG5kOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGlzdERuREhhbmRsZXIsIGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnJlc291cmNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB3aXRoU2VsZWN0aW9uKGVsZW1lbnQucGFyZW50KCkucmVzb3VyY2UsIGVsZW1lbnQucmFuZ2UoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRcdFx0XHRzZWxlY3Rpb25OYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0XHRwYWRkaW5nQm90dG9tOiBTZWFyY2hEZWxlZ2F0ZS5JVEVNX0hFSUdIVCxcblx0XHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IChlOiBSZW5kZXJhYmxlTWF0Y2gpID0+IHtcblx0XHRcdFx0XHRpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlKSkge1xuXHRcdFx0XHRcdFx0Ly8gYWx3YXlzIGNvbGxhcHNlIHRoZSBhaSB0ZXh0IHNlYXJjaCByZXN1bHQsIGJ1dCBhbHdheXMgZXhwYW5kIHRoZSB0ZXh0IHJlc3VsdFxuXHRcdFx0XHRcdFx0cmV0dXJuIGUuaXNBSUNvbnRyaWJ1dGVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGFsd2F5cyBleHBhbmQgY29tcHJlc3NlZCBub2Rlc1xuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChlKSAmJiBlLm1hdGNoZXMoKS5sZW5ndGggPT09IDEgJiYgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZS5tYXRjaGVzKClbMF0pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNob3VsZENvbGxhcHNlQWNjb3JkaW5nVG9Db25maWcoZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFJlc3VsdExpc3RGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy50cmVlLnNldElucHV0KHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSkpKTtcblx0XHRjb25zdCB1cGRhdGVIYXNTb21lQ29sbGFwc2libGUgPSAoKSA9PiB0aGlzLnRvZ2dsZUNvbGxhcHNlU3RhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5oYXNTb21lQ29sbGFwc2libGVSZXN1bHRLZXkuc2V0KHRoaXMuaGFzU29tZUNvbGxhcHNpYmxlKCkpKTtcblx0XHR1cGRhdGVIYXNTb21lQ29sbGFwc2libGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCgpID0+IHVwZGF0ZUhhc1NvbWVDb2xsYXBzaWJsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdXBkYXRlSGFzU29tZUNvbGxhcHNpYmxlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMudHJlZS5vbkRpZE9wZW4sIChsYXN0LCBldmVudCkgPT4gZXZlbnQsIERFQk9VTkNFX0RFTEFZLCB0cnVlKShvcHRpb25zID0+IHtcblx0XHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChvcHRpb25zLmVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkTWF0Y2g6IElTZWFyY2hUcmVlTWF0Y2ggPSBvcHRpb25zLmVsZW1lbnQ7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoPy5zZXRTZWxlY3RlZE1hdGNoKG51bGwpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRTZWxlY3RlZEZpbGVNYXRjaCA9IHNlbGVjdGVkTWF0Y2gucGFyZW50KCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoLnNldFNlbGVjdGVkTWF0Y2goc2VsZWN0ZWRNYXRjaCk7XG5cblx0XHRcdFx0dGhpcy5vbkZvY3VzKHNlbGVjdGVkTWF0Y2gsIG9wdGlvbnMuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLCBvcHRpb25zLnNpZGVCeVNpZGUsIG9wdGlvbnMuZWRpdG9yT3B0aW9ucy5waW5uZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMudHJlZS5vbkRpZENoYW5nZUZvY3VzLCAobGFzdCwgZXZlbnQpID0+IGV2ZW50LCBERUJPVU5DRV9ERUxBWSwgdHJ1ZSkoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdGlmIChzZWxlY3Rpb24ubGVuZ3RoID4gMSAmJiBpc1NlYXJjaFRyZWVNYXRjaChmb2N1cykpIHtcblx0XHRcdFx0dGhpcy5vbkZvY3VzKGZvY3VzLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnk8YW55Pih0aGlzLnRyZWUub25EaWRGb2N1cywgdGhpcy50cmVlLm9uRGlkQ2hhbmdlRm9jdXMpKCgpID0+IHtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy50cmVlLmdldEZvY3VzKClbMF07XG5cblx0XHRcdGlmICh0aGlzLnRyZWUuaXNET01Gb2N1c2VkKCkpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3RFbGVtID0gdGhpcy50cmVlLmdldEZpcnN0RWxlbWVudENoaWxkKHRoaXMudHJlZS5nZXRJbnB1dCgpKTtcblx0XHRcdFx0dGhpcy5maXJzdE1hdGNoRm9jdXNlZC5zZXQoZmlyc3RFbGVtID09PSBmb2N1cyk7XG5cdFx0XHRcdHRoaXMuZmlsZU1hdGNoT3JNYXRjaEZvY3VzZWQuc2V0KCEhZm9jdXMpO1xuXHRcdFx0XHR0aGlzLmZpbGVNYXRjaEZvY3VzZWQuc2V0KGlzU2VhcmNoVHJlZUZpbGVNYXRjaChmb2N1cykpO1xuXHRcdFx0XHR0aGlzLmZvbGRlck1hdGNoRm9jdXNlZC5zZXQoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZm9jdXMpKTtcblx0XHRcdFx0dGhpcy5tYXRjaEZvY3VzZWQuc2V0KGlzU2VhcmNoVHJlZU1hdGNoKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMuZmlsZU1hdGNoT3JGb2xkZXJNYXRjaEZvY3VzLnNldChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZm9jdXMpIHx8IGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMuZmlsZU1hdGNoT3JGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzLnNldChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZm9jdXMpIHx8IGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMuZm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1c2VkLnNldChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZShmb2N1cykpO1xuXHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEhlYWRlckZvY3VzZWQuc2V0KGlzU2VhcmNoSGVhZGVyKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMubGFzdEZvY3VzU3RhdGUgPSAndHJlZSc7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBlZGl0YWJsZSA9IGZhbHNlO1xuXHRcdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKGZvY3VzKSkge1xuXHRcdFx0XHRlZGl0YWJsZSA9ICFmb2N1cy5pc1JlYWRvbmx5O1xuXHRcdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZm9jdXMpKSB7XG5cdFx0XHRcdGVkaXRhYmxlID0gIWZvY3VzLmhhc09ubHlSZWFkT25seU1hdGNoZXMoKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZm9jdXMpKSB7XG5cdFx0XHRcdGVkaXRhYmxlID0gIWZvY3VzLmhhc09ubHlSZWFkT25seU1hdGNoZXMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuaXNFZGl0YWJsZUl0ZW0uc2V0KGVkaXRhYmxlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMuZmlyc3RNYXRjaEZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMuZmlsZU1hdGNoT3JNYXRjaEZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMuZmlsZU1hdGNoRm9jdXNlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5mb2xkZXJNYXRjaEZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMubWF0Y2hGb2N1c2VkLnJlc2V0KCk7XG5cdFx0XHR0aGlzLmZpbGVNYXRjaE9yRm9sZGVyTWF0Y2hGb2N1cy5yZXNldCgpO1xuXHRcdFx0dGhpcy5maWxlTWF0Y2hPckZvbGRlck1hdGNoV2l0aFJlc291cmNlRm9jdXMucmVzZXQoKTtcblx0XHRcdHRoaXMuZm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1c2VkLnJlc2V0KCk7XG5cdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEhlYWRlckZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMuaXNFZGl0YWJsZUl0ZW0ucmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTZXR1cCBjdXJzb3IgcG9zaXRpb24gbW9uaXRvcmluZyB0byBjbGVhciBzZWxlY3RlZCBtYXRjaCB3aGVuIGN1cnNvciBtb3Zlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBnZXRDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRFZGl0b3JDdXJzb3JMaXN0ZW5lci52YWx1ZSA9IGVkaXRvcj8ub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoPy5zZXRTZWxlY3RlZE1hdGNoKG51bGwpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRTZWxlY3RlZEZpbGVNYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8UmVuZGVyYWJsZU1hdGNoIHwgbnVsbD4pOiB2b2lkIHtcblxuXHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCBhcmc6IGFueTtcblx0XHRsZXQgY29udGV4dDogYW55O1xuXHRcdGlmIChzZWxlY3Rpb24gJiYgc2VsZWN0aW9uLmxlbmd0aCA+IDApIHtcblx0XHRcdGFyZyA9IGUuZWxlbWVudDtcblx0XHRcdGNvbnRleHQgPSBzZWxlY3Rpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQgPSBlLmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdG1lbnVJZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnIH0sXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gY29udGV4dCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaGFzU29tZUNvbGxhcHNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZpZXdlciA9IHRoaXMuZ2V0Q29udHJvbCgpO1xuXHRcdGNvbnN0IG5hdmlnYXRvciA9IHZpZXdlci5uYXZpZ2F0ZSgpO1xuXHRcdGxldCBub2RlID0gbmF2aWdhdG9yLmZpcnN0KCk7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0FJID0gdGhpcy5zaG91bGRTaG93QUlSZXN1bHRzKCk7XG5cdFx0ZG8ge1xuXHRcdFx0aWYgKG5vZGUgJiYgIXZpZXdlci5pc0NvbGxhcHNlZChub2RlKSAmJiAoIXNob3VsZFNob3dBSSB8fCAhKGlzVGV4dFNlYXJjaEhlYWRpbmcobm9kZSkpKSkge1xuXHRcdFx0XHQvLyBpZ25vcmUgdGhlIGFpIHRleHQgc2VhcmNoIHJlc3VsdCBpZFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9IHdoaWxlIChub2RlID0gbmF2aWdhdG9yLm5leHQoKSk7XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyBzZWxlY3ROZXh0TWF0Y2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmhhc1NlYXJjaFJlc3VsdHMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtzZWxlY3RlZF0gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHQvLyBFeHBhbmQgdGhlIGluaXRpYWwgc2VsZWN0ZWQgbm9kZSwgaWYgbmVlZGVkXG5cdFx0aWYgKHNlbGVjdGVkICYmICEoaXNTZWFyY2hUcmVlTWF0Y2goc2VsZWN0ZWQpKSkge1xuXHRcdFx0aWYgKHRoaXMudHJlZS5pc0NvbGxhcHNlZChzZWxlY3RlZCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChzZWxlY3RlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmF2aWdhdG9yID0gdGhpcy50cmVlLm5hdmlnYXRlKHNlbGVjdGVkKTtcblxuXHRcdGxldCBuZXh0ID0gbmF2aWdhdG9yLm5leHQoKTtcblx0XHRpZiAoIW5leHQpIHtcblx0XHRcdG5leHQgPSBuYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHR9XG5cblx0XHQvLyBFeHBhbmQgdW50aWwgZmlyc3QgY2hpbGQgaXMgYSBNYXRjaFxuXHRcdHdoaWxlIChuZXh0ICYmICEoaXNTZWFyY2hUcmVlTWF0Y2gobmV4dCkpKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2VkKG5leHQpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQobmV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlbGVjdCB0aGUgZmlyc3QgY2hpbGRcblx0XHRcdG5leHQgPSBuYXZpZ2F0b3IubmV4dCgpO1xuXHRcdH1cblxuXHRcdC8vIFJldmVhbCB0aGUgbmV3bHkgc2VsZWN0ZWQgZWxlbWVudFxuXHRcdGlmIChuZXh0KSB7XG5cdFx0XHRpZiAobmV4dCA9PT0gc2VsZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV2ZW50ID0gZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCh1bmRlZmluZWQsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW25leHRdLCBldmVudCk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtuZXh0XSwgZXZlbnQpO1xuXHRcdFx0dGhpcy50cmVlLnJldmVhbChuZXh0KTtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMudHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRBcmlhTGFiZWwobmV4dCk7XG5cdFx0XHRpZiAoYXJpYUxhYmVsKSB7IGFyaWEuc3RhdHVzKGFyaWFMYWJlbCk7IH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZWxlY3RQcmV2aW91c01hdGNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5oYXNTZWFyY2hSZXN1bHRzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbc2VsZWN0ZWRdID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdGxldCBuYXZpZ2F0b3IgPSB0aGlzLnRyZWUubmF2aWdhdGUoc2VsZWN0ZWQpO1xuXG5cdFx0bGV0IHByZXYgPSBuYXZpZ2F0b3IucHJldmlvdXMoKTtcblxuXHRcdC8vIFNlbGVjdCBwcmV2aW91cyB1bnRpbCBmaW5kIGEgTWF0Y2ggb3IgYSBjb2xsYXBzZWQgaXRlbVxuXHRcdHdoaWxlICghcHJldiB8fCAoIShpc1NlYXJjaFRyZWVNYXRjaChwcmV2KSkgJiYgIXRoaXMudHJlZS5pc0NvbGxhcHNlZChwcmV2KSkpIHtcblx0XHRcdGNvbnN0IG5leHRQcmV2ID0gcHJldiA/IG5hdmlnYXRvci5wcmV2aW91cygpIDogbmF2aWdhdG9yLmxhc3QoKTtcblxuXHRcdFx0aWYgKCFwcmV2ICYmICFuZXh0UHJldikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHByZXYgPSBuZXh0UHJldjtcblx0XHR9XG5cblx0XHQvLyBFeHBhbmQgdW50aWwgbGFzdCBjaGlsZCBpcyBhIE1hdGNoXG5cdFx0d2hpbGUgKHByZXYgJiYgIShpc1NlYXJjaFRyZWVNYXRjaChwcmV2KSkpIHtcblx0XHRcdGNvbnN0IG5leHRJdGVtID0gbmF2aWdhdG9yLm5leHQoKTtcblx0XHRcdGlmICghbmV4dEl0ZW0pIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKHByZXYpO1xuXHRcdFx0bmF2aWdhdG9yID0gdGhpcy50cmVlLm5hdmlnYXRlKG5leHRJdGVtKTsgLy8gcmVjcmVhdGUgbmF2aWdhdG9yIGJlY2F1c2UgbW9kaWZ5aW5nIHRoZSB0cmVlIGNhbiBpbnZhbGlkYXRlIGl0XG5cdFx0XHRwcmV2ID0gbmV4dEl0ZW0gPyBuYXZpZ2F0b3IucHJldmlvdXMoKSA6IG5hdmlnYXRvci5sYXN0KCk7IC8vIHNlbGVjdCBsYXN0IGNoaWxkXG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZWFsIHRoZSBuZXdseSBzZWxlY3RlZCBlbGVtZW50XG5cdFx0aWYgKHByZXYpIHtcblx0XHRcdGlmIChwcmV2ID09PSBzZWxlY3RlZCkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXZlbnQgPSBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KHVuZGVmaW5lZCwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbcHJldl0sIGV2ZW50KTtcblx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW3ByZXZdLCBldmVudCk7XG5cdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHByZXYpO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy50cmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMYWJlbChwcmV2KTtcblx0XHRcdGlmIChhcmlhTGFiZWwpIHsgYXJpYS5zdGF0dXMoYXJpYUxhYmVsKTsgfVxuXHRcdH1cblx0fVxuXG5cdG1vdmVGb2N1c1RvUmVzdWx0cygpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0aWYgKHRoaXMubGFzdEZvY3VzU3RhdGUgPT09ICdpbnB1dCcgfHwgIXRoaXMuaGFzU2VhcmNoUmVzdWx0cygpKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVkVGV4dCA9IHRoaXMuc2VhcmNoQ29uZmlnLnNlZWRPbkZvY3VzID8gdGhpcy51cGRhdGVUZXh0RnJvbVNlbGVjdGlvbih7IGFsbG93U2VhcmNoT25UeXBlOiBmYWxzZSB9KSA6IGZhbHNlO1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXModW5kZWZpbmVkLCB1bmRlZmluZWQsIHVwZGF0ZWRUZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlVGV4dEZyb21GaW5kV2lkZ2V0T3JTZWxlY3Rpb24oeyBhbGxvd1Vuc2VsZWN0ZWRXb3JkID0gdHJ1ZSwgYWxsb3dTZWFyY2hPblR5cGUgPSB0cnVlIH0pOiBib29sZWFuIHtcblx0XHRsZXQgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlRWRpdG9yKSAmJiAhYWN0aXZlRWRpdG9yPy5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChhY3RpdmVFZGl0b3IpO1xuXHRcdFx0aWYgKGNvbnRyb2xsZXIgJiYgY29udHJvbGxlci5pc0ZpbmRJbnB1dEZvY3VzZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy51cGRhdGVUZXh0RnJvbUZpbmRXaWRnZXQoY29udHJvbGxlciwgeyBhbGxvd1NlYXJjaE9uVHlwZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0XHRhY3RpdmVFZGl0b3IgPSBlZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCAmJiBlZGl0b3IuZ2V0UGFyZW50RWRpdG9yKCkgPT09IGFjdGl2ZUVkaXRvciAmJiBlZGl0b3IuaGFzVGV4dEZvY3VzKCkpXG5cdFx0XHRcdD8/IGFjdGl2ZUVkaXRvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy51cGRhdGVUZXh0RnJvbVNlbGVjdGlvbih7IGFsbG93VW5zZWxlY3RlZFdvcmQsIGFsbG93U2VhcmNoT25UeXBlIH0sIGFjdGl2ZUVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRleHRGcm9tRmluZFdpZGdldChjb250cm9sbGVyOiBDb21tb25GaW5kQ29udHJvbGxlciwgeyBhbGxvd1NlYXJjaE9uVHlwZSA9IHRydWUgfSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5zZWFyY2hDb25maWcuc2VlZFdpdGhOZWFyZXN0V29yZCAmJiAoZG9tLmdldEFjdGl2ZVdpbmRvdygpLmdldFNlbGVjdGlvbigpPy50b1N0cmluZygpID8/ICcnKSA9PT0gJycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hTdHJpbmcgPSBjb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU3RyaW5nO1xuXHRcdGlmIChzZWFyY2hTdHJpbmcgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldENhc2VTZW5zaXRpdmUoY29udHJvbGxlci5nZXRTdGF0ZSgpLm1hdGNoQ2FzZSk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFdob2xlV29yZHMoY29udHJvbGxlci5nZXRTdGF0ZSgpLndob2xlV29yZCk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFJlZ2V4KGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5pc1JlZ2V4KTtcblx0XHR0aGlzLnVwZGF0ZVRleHQoc2VhcmNoU3RyaW5nLCBhbGxvd1NlYXJjaE9uVHlwZSk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGV4dEZyb21TZWxlY3Rpb24oeyBhbGxvd1Vuc2VsZWN0ZWRXb3JkID0gdHJ1ZSwgYWxsb3dTZWFyY2hPblR5cGUgPSB0cnVlIH0sIGVkaXRvcj86IElFZGl0b3IpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKS5maW5kIS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjtcblx0XHRpZiAoIXNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uIHx8IHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID09PSAnbmV2ZXInKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IHNlbGVjdGVkVGV4dCA9IHRoaXMuZ2V0U2VhcmNoVGV4dEZyb21FZGl0b3IoYWxsb3dVbnNlbGVjdGVkV29yZCwgZWRpdG9yKTtcblx0XHRpZiAoc2VsZWN0ZWRUZXh0ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5nZXRSZWdleCgpKSB7XG5cdFx0XHRzZWxlY3RlZFRleHQgPSBzdHJpbmdzLmVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoc2VsZWN0ZWRUZXh0KTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVRleHQoc2VsZWN0ZWRUZXh0LCBhbGxvd1NlYXJjaE9uVHlwZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRleHQodGV4dDogc3RyaW5nLCBhbGxvd1NlYXJjaE9uVHlwZTogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRpZiAoYWxsb3dTZWFyY2hPblR5cGUgJiYgIXRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5pc0RpcnR5KSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZSh0ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IHRydWU7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZSh0ZXh0KTtcblx0XHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c05leHRJbnB1dEJveCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyh0cnVlLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubW92ZUZvY3VzRnJvbVNlYXJjaE9yUmVwbGFjZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLm1vdmVGb2N1c0Zyb21TZWFyY2hPclJlcGxhY2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuZm9jdXMoKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2VsZWN0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLnNlbGVjdFRyZWVJZk5vdFNlbGVjdGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlRm9jdXNGcm9tU2VhcmNoT3JSZXBsYWNlKCkge1xuXHRcdGlmICh0aGlzLnNob3dzRmlsZVR5cGVzKCkpIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKHRydWUsIHRoaXMuc2hvd3NGaWxlVHlwZXMoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0VHJlZUlmTm90U2VsZWN0ZWQoKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzSW5wdXRCb3goKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKHRydWUsIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5mb2N1cygpO1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZWxlY3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50cmVlLmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHR0aGlzLm1vdmVGb2N1c0Zyb21SZXN1bHRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlRm9jdXNGcm9tUmVzdWx0cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaG93c0ZpbGVUeXBlcygpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlscyh0cnVlLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKHRydWUsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVMYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCB8fCAhdGhpcy5zaXplKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uc1Bvc2l0aW9uID0gdGhpcy5zZWFyY2hDb25maWcuYWN0aW9uc1Bvc2l0aW9uO1xuXHRcdHRoaXMuZ2V0Q29udGFpbmVyKCkuY2xhc3NMaXN0LnRvZ2dsZShTZWFyY2hWaWV3LkFDVElPTlNfUklHSFRfQ0xBU1NfTkFNRSwgYWN0aW9uc1Bvc2l0aW9uID09PSAncmlnaHQnKTtcblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFdpZHRoKHRoaXMuc2l6ZS53aWR0aCAtIDI4IC8qIGNvbnRhaW5lciBtYXJnaW4gKi8pO1xuXG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZXRXaWR0aCh0aGlzLnNpemUud2lkdGggLSAyOCAvKiBjb250YWluZXIgbWFyZ2luICovKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldFdpZHRoKHRoaXMuc2l6ZS53aWR0aCAtIDI4IC8qIGNvbnRhaW5lciBtYXJnaW4gKi8pO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0SGVpZ2h0ID0gZG9tLmdldFRvdGFsSGVpZ2h0KHRoaXMuc2VhcmNoV2lkZ2V0c0NvbnRhaW5lckVsZW1lbnQpO1xuXHRcdGNvbnN0IG1lc3NhZ2VzSGVpZ2h0ID0gZG9tLmdldFRvdGFsSGVpZ2h0KHRoaXMubWVzc2FnZXNFbGVtZW50KTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KHRoaXMuc2l6ZS5oZWlnaHQgLSB3aWRnZXRIZWlnaHQgLSBtZXNzYWdlc0hlaWdodCwgdGhpcy5zaXplLndpZHRoIC0gMjgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuc2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdHRoaXMucmVMYXlvdXQoKTtcblx0fVxuXG5cdGdldENvbnRyb2woKSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZTtcblx0fVxuXG5cdGFsbFNlYXJjaEZpZWxkc0NsZWFyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKSA9PT0gJycgJiZcblx0XHRcdCghdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQgfHwgdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKSA9PT0gJycpO1xuXHR9XG5cblx0YWxsRmlsZVBhdHRlcm5GaWVsZHNDbGVhcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hFeGNsdWRlUGF0dGVybi5nZXRWYWx1ZSgpID09PSAnJyAmJlxuXHRcdFx0dGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5nZXRWYWx1ZSgpID09PSAnJztcblx0fVxuXG5cdGhhc1NlYXJjaFJlc3VsdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuaXNFbXB0eSgpO1xuXHR9XG5cblx0Y2xlYXJTZWFyY2hSZXN1bHRzKGNsZWFySW5wdXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNsZWFyKCk7XG5cdFx0dGhpcy5zaG93RW1wdHlTdGFnZSh0cnVlKTtcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0dGhpcy5zaG93U2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2UoKTtcblx0XHR9XG5cdFx0aWYgKGNsZWFySW5wdXQpIHtcblx0XHRcdGlmICh0aGlzLmFsbFNlYXJjaEZpZWxkc0NsZWFyKCkpIHtcblx0XHRcdFx0dGhpcy5jbGVhckZpbGVQYXR0ZXJuRmllbGRzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLnZpZXdNb2RlbC5jYW5jZWxTZWFyY2goKTtcblx0XHR0aGlzLnZpZXdNb2RlbC5jYW5jZWxBSVNlYXJjaCgpO1xuXHRcdHRoaXMudHJlZS5hcmlhTGFiZWwgPSBubHMubG9jYWxpemUoJ2VtcHR5U2VhcmNoJywgXCJFbXB0eSBTZWFyY2hcIik7XG5cblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jbGVhcik7XG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXHR9XG5cblx0Y2xlYXJGaWxlUGF0dGVybkZpZWxkcygpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuLmNsZWFyKCk7XG5cdFx0dGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5jbGVhcigpO1xuXHR9XG5cblx0Y2FuY2VsU2VhcmNoKGZvY3VzOiBib29sZWFuID0gdHJ1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5jYW5jZWxTZWFyY2goKSAmJiB0aGlzLnZpZXdNb2RlbC5jYW5jZWxBSVNlYXJjaCgpKSB7XG5cdFx0XHRpZiAoZm9jdXMpIHsgdGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTsgfVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0VHJlZUlmTm90U2VsZWN0ZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHJlZS5nZXROb2RlKHVuZGVmaW5lZCkpIHtcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KCk7XG5cdFx0XHRcdHRoaXMudHJlZS5mb2N1c05leHQodW5kZWZpbmVkLCB1bmRlZmluZWQsIGV2ZW50KTtcblx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbih0aGlzLnRyZWUuZ2V0Rm9jdXMoKSwgZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VhcmNoVGV4dEZyb21FZGl0b3IoYWxsb3dVbnNlbGVjdGVkV29yZDogYm9vbGVhbiwgZWRpdG9yPzogSUVkaXRvcik6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLmdldENvbnRhaW5lcigpKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yID0gZWRpdG9yID8/IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblxuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd1Vuc2VsZWN0ZWQgPSB0aGlzLnNlYXJjaENvbmZpZy5zZWVkV2l0aE5lYXJlc3RXb3JkICYmIGFsbG93VW5zZWxlY3RlZFdvcmQ7XG5cdFx0cmV0dXJuIGdldFNlbGVjdGlvblRleHRGcm9tRWRpdG9yKGFsbG93VW5zZWxlY3RlZCwgZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd3NGaWxlVHlwZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucXVlcnlEZXRhaWxzLmNsYXNzTGlzdC5jb250YWlucygnbW9yZScpO1xuXHR9XG5cblx0dG9nZ2xlQ2FzZVNlbnNpdGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0Q2FzZVNlbnNpdGl2ZSghdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpKTtcblx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7IHNob3VsZEtlZXBBSVJlc3VsdHM6IHRydWUgfSk7XG5cdH1cblxuXHR0b2dnbGVXaG9sZVdvcmRzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRXaG9sZVdvcmRzKCF0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRXaG9sZVdvcmRzKCkpO1xuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgc2hvdWxkS2VlcEFJUmVzdWx0czogdHJ1ZSB9KTtcblx0fVxuXG5cdHRvZ2dsZVJlZ2V4KCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRSZWdleCghdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0UmVnZXgoKSk7XG5cdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBzaG91bGRLZWVwQUlSZXN1bHRzOiB0cnVlIH0pO1xuXHR9XG5cblx0dG9nZ2xlUHJlc2VydmVDYXNlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dD8uc2V0UHJlc2VydmVDYXNlKCF0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQuZ2V0UHJlc2VydmVDYXNlKCkpO1xuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgc2hvdWxkS2VlcEFJUmVzdWx0czogdHJ1ZSB9KTtcblx0fVxuXG5cdHNldFNlYXJjaFBhcmFtZXRlcnMoYXJnczogSUZpbmRJbkZpbGVzQXJncyA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBhcmdzLmlzQ2FzZVNlbnNpdGl2ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0Q2FzZVNlbnNpdGl2ZShhcmdzLmlzQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy5tYXRjaFdob2xlV29yZCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0V2hvbGVXb3JkcyhhcmdzLm1hdGNoV2hvbGVXb3JkKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLmlzUmVnZXggPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFJlZ2V4KGFyZ3MuaXNSZWdleCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy5maWxlc1RvSW5jbHVkZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5jbHVkZVBhdHRlcm4uc2V0VmFsdWUoU3RyaW5nKGFyZ3MuZmlsZXNUb0luY2x1ZGUpKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLmZpbGVzVG9FeGNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZWFyY2hFeGNsdWRlUGF0dGVybi5zZXRWYWx1ZShTdHJpbmcoYXJncy5maWxlc1RvRXhjbHVkZSkpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFyZ3MucXVlcnkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0VmFsdWUoYXJncy5xdWVyeSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy5yZXBsYWNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0Py5zZXRWYWx1ZShhcmdzLnJlcGxhY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0ICYmIHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dC5nZXRWYWx1ZSgpICE9PSAnJykge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQuc2V0VmFsdWUoJycpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFyZ3MudHJpZ2dlclNlYXJjaCA9PT0gJ2Jvb2xlYW4nICYmIGFyZ3MudHJpZ2dlclNlYXJjaCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLnByZXNlcnZlQ2FzZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQ/LnNldFByZXNlcnZlQ2FzZShhcmdzLnByZXNlcnZlQ2FzZSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy51c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlcyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMoYXJncy51c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlcyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy5vbmx5T3BlbkVkaXRvcnMgPT09ICdib29sZWFuJykge1xuXHRcdFx0dGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5zZXRPbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyhhcmdzLm9ubHlPcGVuRWRpdG9ycyk7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlUXVlcnlEZXRhaWxzKG1vdmVGb2N1cyA9IHRydWUsIHNob3c/OiBib29sZWFuLCBza2lwTGF5b3V0PzogYm9vbGVhbiwgcmV2ZXJzZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzaG93ID0gdHlwZW9mIHNob3cgPT09ICd1bmRlZmluZWQnID8gIXRoaXMucXVlcnlEZXRhaWxzLmNsYXNzTGlzdC5jb250YWlucygnbW9yZScpIDogQm9vbGVhbihzaG93KTtcblx0XHRpZiAoIXRoaXMudmlld2xldFN0YXRlLnF1ZXJ5KSB7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeSA9IHt9O1xuXHRcdH1cblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5xdWVyeURldGFpbHNFeHBhbmRlZCA9IHNob3c7XG5cdFx0c2tpcExheW91dCA9IEJvb2xlYW4oc2tpcExheW91dCk7XG5cdFx0aWYgKHNob3cpIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0XHR0aGlzLnF1ZXJ5RGV0YWlscy5jbGFzc0xpc3QuYWRkKCdtb3JlJyk7XG5cdFx0XHRpZiAobW92ZUZvY3VzKSB7XG5cdFx0XHRcdGlmIChyZXZlcnNlKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5mb2N1cygpO1xuXHRcdFx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2VsZWN0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5mb2N1cygpO1xuXHRcdFx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2VsZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHR0aGlzLnF1ZXJ5RGV0YWlscy5jbGFzc0xpc3QucmVtb3ZlKCdtb3JlJyk7XG5cdFx0XHRpZiAobW92ZUZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFza2lwTGF5b3V0ICYmIHRoaXMuc2l6ZSkge1xuXHRcdFx0dGhpcy5yZUxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHNlYXJjaEluRm9sZGVycyhmb2xkZXJQYXRoczogc3RyaW5nW10gPSBbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaFdpdGhJbmNsdWRlT3JFeGNsdWRlKHRydWUsIGZvbGRlclBhdGhzKTtcblx0fVxuXG5cdHNlYXJjaE91dHNpZGVPZkZvbGRlcnMoZm9sZGVyUGF0aHM6IHN0cmluZ1tdID0gW10pOiB2b2lkIHtcblx0XHR0aGlzLl9zZWFyY2hXaXRoSW5jbHVkZU9yRXhjbHVkZShmYWxzZSwgZm9sZGVyUGF0aHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VhcmNoV2l0aEluY2x1ZGVPckV4Y2x1ZGUoaW5jbHVkZTogYm9vbGVhbiwgZm9sZGVyUGF0aHM6IHN0cmluZ1tdKSB7XG5cdFx0aWYgKCFmb2xkZXJQYXRocy5sZW5ndGggfHwgZm9sZGVyUGF0aHMuc29tZShmb2xkZXJQYXRoID0+IGZvbGRlclBhdGggPT09ICcuJykpIHtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0VmFsdWUoJycpO1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTaG93ICdmaWxlcyB0byBpbmNsdWRlJyBib3hcblx0XHRpZiAoIXRoaXMuc2hvd3NGaWxlVHlwZXMoKSkge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHModHJ1ZSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0KGluY2x1ZGUgPyB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzIDogdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcykuc2V0VmFsdWUoZm9sZGVyUGF0aHMuam9pbignLCAnKSk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoZmFsc2UpO1xuXHR9XG5cblx0dHJpZ2dlclF1ZXJ5Q2hhbmdlKF9vcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgdHJpZ2dlcmVkT25UeXBlPzogYm9vbGVhbjsgZGVsYXk/OiBudW1iZXI7IHNob3VsZEtlZXBBSVJlc3VsdHM/OiBib29sZWFuOyBzaG91bGRVcGRhdGVBSVNlYXJjaD86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7IHByZXNlcnZlRm9jdXM6IHRydWUsIHRyaWdnZXJlZE9uVHlwZTogZmFsc2UsIGRlbGF5OiAwLCAuLi5fb3B0aW9ucyB9O1xuXG5cdFx0aWYgKG9wdGlvbnMudHJpZ2dlcmVkT25UeXBlICYmICF0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hPblR5cGUpIHsgcmV0dXJuOyB9XG5cblx0XHRpZiAoIXRoaXMucGF1c2VTZWFyY2hpbmcpIHtcblxuXHRcdFx0Y29uc3QgZGVsYXkgPSBvcHRpb25zLnRyaWdnZXJlZE9uVHlwZSA/IG9wdGlvbnMuZGVsYXkgOiAwO1xuXHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vblF1ZXJ5Q2hhbmdlZChvcHRpb25zLnByZXNlcnZlRm9jdXMsIG9wdGlvbnMudHJpZ2dlcmVkT25UeXBlLCBvcHRpb25zLnNob3VsZEtlZXBBSVJlc3VsdHMsIG9wdGlvbnMuc2hvdWxkVXBkYXRlQUlTZWFyY2gpO1xuXHRcdFx0fSwgZGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEV4Y2x1ZGVQYXR0ZXJuKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuZ2V0VmFsdWUoKS50cmltKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmNsdWRlUGF0dGVybigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmdldFZhbHVlKCkudHJpbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25RdWVyeUNoYW5nZWQocHJlc2VydmVGb2N1czogYm9vbGVhbiwgdHJpZ2dlcmVkT25UeXBlID0gZmFsc2UsIHNob3VsZEtlZXBBSVJlc3VsdHMgPSBmYWxzZSwgc2hvdWxkVXBkYXRlQUlTZWFyY2ggPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5pbnB1dEJveC5pc0lucHV0VmFsaWQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc1JlZ2V4ID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0UmVnZXgoKTtcblx0XHRjb25zdCBpc0luTm90ZWJvb2tNYXJrZG93bklucHV0ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkubWFya3VwSW5wdXQ7XG5cdFx0Y29uc3QgaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkubWFya3VwUHJldmlldztcblx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsSW5wdXQgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5jb2RlSW5wdXQ7XG5cdFx0Y29uc3QgaXNJbk5vdGVib29rQ2VsbE91dHB1dCA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLmNvZGVPdXRwdXQ7XG5cblx0XHRjb25zdCBpc1dob2xlV29yZHMgPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRXaG9sZVdvcmRzKCk7XG5cdFx0Y29uc3QgaXNDYXNlU2Vuc2l0aXZlID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpO1xuXHRcdGNvbnN0IGNvbnRlbnRQYXR0ZXJuID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKTtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVyblRleHQgPSB0aGlzLl9nZXRFeGNsdWRlUGF0dGVybigpO1xuXHRcdGNvbnN0IGluY2x1ZGVQYXR0ZXJuVGV4dCA9IHRoaXMuX2dldEluY2x1ZGVQYXR0ZXJuKCk7XG5cdFx0Y29uc3QgdXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyA9IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMudXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcygpO1xuXHRcdGNvbnN0IG9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzID0gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbmx5U2VhcmNoSW5PcGVuRWRpdG9ycygpO1xuXHRcdGNvbnN0IG9ubHlTZWFyY2hJbkNoYW5nZWRGaWxlcyA9IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25seVNlYXJjaEluQ2hhbmdlZEZpbGVzKCk7XG5cblx0XHRpZiAoY29udGVudFBhdHRlcm4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cyhmYWxzZSk7XG5cdFx0XHR0aGlzLmNsZWFyTWVzc2FnZSgpO1xuXHRcdFx0dGhpcy5jbGVhckFJUmVzdWx0cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQ6IElQYXR0ZXJuSW5mbyA9IHtcblx0XHRcdHBhdHRlcm46IGNvbnRlbnRQYXR0ZXJuLFxuXHRcdFx0aXNSZWdFeHA6IGlzUmVnZXgsXG5cdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IGlzQ2FzZVNlbnNpdGl2ZSxcblx0XHRcdGlzV29yZE1hdGNoOiBpc1dob2xlV29yZHMsXG5cdFx0XHRub3RlYm9va0luZm86IHtcblx0XHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCxcblx0XHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3LFxuXHRcdFx0XHRpc0luTm90ZWJvb2tDZWxsSW5wdXQsXG5cdFx0XHRcdGlzSW5Ob3RlYm9va0NlbGxPdXRwdXRcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm4gPSBbeyBwYXR0ZXJuOiB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmdldFZhbHVlKCkgfV07XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm4gPSB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmdldFZhbHVlKCk7XG5cblx0XHRsZXQgY2hhbmdlZEZpbGVVcmlzOiBVUklbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAob25seVNlYXJjaEluQ2hhbmdlZEZpbGVzKSB7XG5cdFx0XHRjaGFuZ2VkRmlsZVVyaXMgPSBbLi4udGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllc11cblx0XHRcdFx0LmZsYXRNYXAocmVwb3NpdG9yeSA9PiByZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcylcblx0XHRcdFx0LmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAucmVzb3VyY2VzKVxuXHRcdFx0XHQubWFwKHJlc291cmNlID0+IHJlc291cmNlLnNvdXJjZVVyaSk7XG5cdFx0fVxuXG5cdFx0Ly8gTmVlZCB0aGUgZnVsbCBtYXRjaCBsaW5lIHRvIGNvcnJlY3RseSBjYWxjdWxhdGUgcmVwbGFjZSB0ZXh0LCBpZiB0aGlzIGlzIGEgc2VhcmNoL3JlcGxhY2Ugd2l0aCByZWdleCBncm91cCByZWZlcmVuY2VzICgkMSwgJDIsIC4uLikuXG5cdFx0Ly8gMTAwMDAgY2hhcnMgaXMgZW5vdWdoIHRvIGF2b2lkIHNlbmRpbmcgaHVnZSBhbW91bnRzIG9mIHRleHQgYXJvdW5kLCBpZiB5b3UgZG8gYSByZXBsYWNlIHdpdGggYSBsb25nZXIgbWF0Y2gsIGl0IG1heSBvciBtYXkgbm90IHJlc29sdmUgdGhlIGdyb3VwIHJlZnMgY29ycmVjdGx5LlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy81ODM3NFxuXHRcdGNvbnN0IGNoYXJzUGVyTGluZSA9IGNvbnRlbnQuaXNSZWdFeHAgPyAxMDAwMCA6IDEwMDA7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMgPSB7XG5cdFx0XHRfcmVhc29uOiAnc2VhcmNoVmlldycsXG5cdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3V0T2ZXb3Jrc3BhY2VFZGl0b3JSZXNvdXJjZXMpLFxuXHRcdFx0bWF4UmVzdWx0czogdGhpcy5zZWFyY2hDb25maWcubWF4UmVzdWx0cyA/PyB1bmRlZmluZWQsXG5cdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogIXVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzOiAhdXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRpZ25vcmVHbG9iQ2FzZTogIWlzTGludXggfHwgdW5kZWZpbmVkLFxuXHRcdFx0b25seU9wZW5FZGl0b3JzOiBvbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyxcblx0XHRcdGNoYW5nZWRGaWxlVXJpcyxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuLFxuXHRcdFx0aW5jbHVkZVBhdHRlcm4sXG5cdFx0XHRwcmV2aWV3T3B0aW9uczoge1xuXHRcdFx0XHRtYXRjaExpbmVzOiAxLFxuXHRcdFx0XHRjaGFyc1BlckxpbmVcblx0XHRcdH0sXG5cdFx0XHRpc1NtYXJ0Q2FzZTogdGhpcy5zZWFyY2hDb25maWcuc21hcnRDYXNlLFxuXHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IGZvbGRlclJlc291cmNlcyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblxuXHRcdGNvbnN0IG9uUXVlcnlWYWxpZGF0aW9uRXJyb3IgPSAoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNob3dNZXNzYWdlKHsgY29udGVudDogZXJyLm1lc3NhZ2UsIHR5cGU6IE1lc3NhZ2VUeXBlLkVSUk9SIH0pO1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNsZWFyKCk7XG5cdFx0fTtcblxuXHRcdGxldCBxdWVyeTogSVRleHRRdWVyeTtcblx0XHR0cnkge1xuXHRcdFx0cXVlcnkgPSB0aGlzLnF1ZXJ5QnVpbGRlci50ZXh0KGNvbnRlbnQsIGZvbGRlclJlc291cmNlcy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpLCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uUXVlcnlWYWxpZGF0aW9uRXJyb3IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZhbGlkYXRlUXVlcnkocXVlcnkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKCFzaG91bGRLZWVwQUlSZXN1bHRzICYmIHNob3VsZFVwZGF0ZUFJU2VhcmNoICYmIHRoaXMudHJlZS5oYXNOb2RlKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCkpIHtcblx0XHRcdFx0dGhpcy50cmVlLmNvbGxhcHNlKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub25RdWVyeVRyaWdnZXJlZChxdWVyeSwgb3B0aW9ucywgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIHRyaWdnZXJlZE9uVHlwZSwgc2hvdWxkS2VlcEFJUmVzdWx0cywgc2hvdWxkVXBkYXRlQUlTZWFyY2gpO1xuXG5cdFx0XHRpZiAoIXByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoZmFsc2UsIHVuZGVmaW5lZCwgdHJ1ZSk7IC8vIGZvY3VzIGJhY2sgdG8gaW5wdXQgZmllbGRcblx0XHRcdH1cblx0XHR9LCBvblF1ZXJ5VmFsaWRhdGlvbkVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVRdWVyeShxdWVyeTogSVRleHRRdWVyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFZhbGlkYXRlIGZvbGRlclF1ZXJpZXNcblx0XHRjb25zdCBmb2xkZXJRdWVyaWVzRXhpc3RQID1cblx0XHRcdHF1ZXJ5LmZvbGRlclF1ZXJpZXMubWFwKGZxID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKGZxLmZvbGRlcikuY2F0Y2goKCkgPT4gZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoZm9sZGVyUXVlcmllc0V4aXN0UCkudGhlbihleGlzdFJlc3VsdHMgPT4ge1xuXHRcdFx0Ly8gSWYgbm8gZm9sZGVycyBleGlzdCwgc2hvdyBhbiBlcnJvciBtZXNzYWdlIGFib3V0IHRoZSBmaXJzdCBvbmVcblx0XHRcdGNvbnN0IGV4aXN0aW5nRm9sZGVyUXVlcmllcyA9IHF1ZXJ5LmZvbGRlclF1ZXJpZXMuZmlsdGVyKChmb2xkZXJRdWVyeSwgaSkgPT4gZXhpc3RSZXN1bHRzW2ldKTtcblx0XHRcdGlmICghcXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGggfHwgZXhpc3RpbmdGb2xkZXJRdWVyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHRxdWVyeS5mb2xkZXJRdWVyaWVzID0gZXhpc3RpbmdGb2xkZXJRdWVyaWVzO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgbm9uRXhpc3RhbnRQYXRoID0gcXVlcnkuZm9sZGVyUXVlcmllc1swXS5mb2xkZXIuZnNQYXRoO1xuXHRcdFx0XHRjb25zdCBzZWFyY2hQYXRoTm90Rm91bmRFcnJvciA9IG5scy5sb2NhbGl6ZSgnc2VhcmNoUGF0aE5vdEZvdW5kRXJyb3InLCBcIlNlYXJjaCBwYXRoIG5vdCBmb3VuZDogezB9XCIsIG5vbkV4aXN0YW50UGF0aCk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3Ioc2VhcmNoUGF0aE5vdEZvdW5kRXJyb3IpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25RdWVyeVRyaWdnZXJlZChxdWVyeTogSVRleHRRdWVyeSwgb3B0aW9uczogSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCBleGNsdWRlUGF0dGVyblRleHQ6IHN0cmluZywgaW5jbHVkZVBhdHRlcm5UZXh0OiBzdHJpbmcsIHRyaWdnZXJlZE9uVHlwZTogYm9vbGVhbiwgc2hvdWxkS2VlcEFJUmVzdWx0czogYm9vbGVhbiwgc2hvdWxkVXBkYXRlQUlTZWFyY2g6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmFkZFRvU2VhcmNoSGlzdG9yeURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8ub25TZWFyY2hTdWJtaXQoKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25TZWFyY2hTdWJtaXQoKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25TZWFyY2hTdWJtaXQoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMudmlld01vZGVsLmNhbmNlbFNlYXJjaCh0cnVlKTtcblx0XHRpZiAoIXNob3VsZEtlZXBBSVJlc3VsdHMpIHtcblx0XHRcdHRoaXMuY2xlYXJBSVJlc3VsdHMoKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRTZWFyY2hRID0gdGhpcy5jdXJyZW50U2VhcmNoUVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5kb1NlYXJjaChxdWVyeSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIHRyaWdnZXJlZE9uVHlwZSwgc2hvdWxkS2VlcEFJUmVzdWx0cywgc2hvdWxkVXBkYXRlQUlTZWFyY2gpKVxuXHRcdFx0LnRoZW4oKCkgPT4gdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVSZXN1bHRzKCkge1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSBTZWFyY2hVSVN0YXRlLklkbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNlYXJjaCByZXN1bHQgdHJlZSB1cGRhdGVcblx0XHRcdGNvbnN0IGZpbGVDb3VudCA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5maWxlQ291bnQoKTtcblx0XHRcdGlmICh0aGlzLl92aXNpYmxlTWF0Y2hlcyAhPT0gZmlsZUNvdW50KSB7XG5cdFx0XHRcdHRoaXMuX3Zpc2libGVNYXRjaGVzID0gZmlsZUNvdW50O1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hBbmRVcGRhdGVDb3VudCgpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBzaG93IGZyZXF1ZW50IHByb2dyZXNzIGFuZCByZXN1bHRzIGJ5IHNjaGVkdWxpbmcgdXBkYXRlcyA4MCBtcyBhZnRlciB0aGUgbGFzdCBvbmVcblx0XHRcdHRoaXMuX3JlZnJlc2hSZXN1bHRzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBleHBhbmRJZlNpbmd1bGFyUmVzdWx0KCkge1xuXHRcdC8vIGV4cGFuZCBpZiBqdXN0IDEgZmlsZSB3aXRoIGxlc3MgdGhhbiA1MCBtYXRjaGVzXG5cblx0XHRjb25zdCBjb2xsYXBzZVJlc3VsdHMgPSB0aGlzLnNlYXJjaENvbmZpZy5jb2xsYXBzZVJlc3VsdHM7XG5cdFx0aWYgKGNvbGxhcHNlUmVzdWx0cyAhPT0gJ2Fsd2F5c0NvbGxhcHNlJyAmJiB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3Qgb25seU1hdGNoID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKVswXTtcblx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmRUbyhvbmx5TWF0Y2gpO1xuXHRcdFx0aWYgKG9ubHlNYXRjaC5jb3VudCgpIDwgNTApIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChvbmx5TWF0Y2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kU2VhcmNoV2l0aEFJQnV0dG9uKG1lc3NhZ2VFbDogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBzZWFyY2hXaXRoQUlCdXR0b25Ub29sdGlwID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKFxuXHRcdFx0bmxzLmxvY2FsaXplKCd0cmlnZ2VyQUlTZWFyY2gudG9vbHRpcCcsIFwiU2VhcmNoIHdpdGggQUkuXCIpLFxuXHRcdFx0Q29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuU2VhcmNoV2l0aEFJQWN0aW9uSWRcblx0XHQpO1xuXHRcdGNvbnN0IHNlYXJjaFdpdGhBSUJ1dHRvblRleHQgPSBubHMubG9jYWxpemUoJ3NlYXJjaFdpdGhBSUJ1dHRvblRvb2x0aXAnLCBcIlNlYXJjaCB3aXRoIEFJXCIpO1xuXHRcdGNvbnN0IHNlYXJjaFdpdGhBSUJ1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihcblx0XHRcdHNlYXJjaFdpdGhBSUJ1dHRvblRleHQsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuU2VhcmNoV2l0aEFJQWN0aW9uSWQpO1xuXHRcdFx0fSwgdGhpcy5ob3ZlclNlcnZpY2UsIHNlYXJjaFdpdGhBSUJ1dHRvblRvb2x0aXApKTtcblx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgc2VhcmNoV2l0aEFJQnV0dG9uLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaENvbXBsZXRlKFxuXHRcdHByb2dyZXNzQ29tcGxldGU6ICgpID0+IHZvaWQsXG5cdFx0ZXhjbHVkZVBhdHRlcm5UZXh0Pzogc3RyaW5nLFxuXHRcdGluY2x1ZGVQYXR0ZXJuVGV4dD86IHN0cmluZyxcblx0XHRjb21wbGV0ZWQ/OiBJU2VhcmNoQ29tcGxldGUsXG5cdFx0c2hvdWxkRG9GaW5hbFJlZnJlc2ggPSB0cnVlLFxuXHRcdGtleXdvcmRzPzogQUlTZWFyY2hLZXl3b3JkW10sXG5cdCkge1xuXG5cdFx0dGhpcy5zdGF0ZSA9IFNlYXJjaFVJU3RhdGUuSWRsZTtcblxuXHRcdC8vIENvbXBsZXRlIHVwIHRvIDEwMCUgYXMgbmVlZGVkXG5cdFx0cHJvZ3Jlc3NDb21wbGV0ZSgpO1xuXG5cdFx0aWYgKHNob3VsZERvRmluYWxSZWZyZXNoKSB7XG5cdFx0XHQvLyBhbnl0aGluZyB0aGF0IGdldHMgY2FsbGVkIGZyb20gYGdldENoaWxkcmVuYCBzaG91bGQgbm90IGRvIHRoaXMsIHNpbmNlIHRoZSB0cmVlIHdpbGwgcmVmcmVzaCBhbnl3YXlzLlxuXHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoQW5kVXBkYXRlQ291bnQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxSZXN1bHRzID0gIXRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5pc0VtcHR5KCk7XG5cdFx0Y29uc3QgYWlSZXN1bHRzID0gdGhpcy5zZWFyY2hSZXN1bHQuZ2V0Q2FjaGVkU2VhcmNoQ29tcGxldGUodHJ1ZSk7XG5cdFx0aWYgKGNvbXBsZXRlZD8uZXhpdCA9PT0gU2VhcmNoQ29tcGxldGlvbkV4aXRDb2RlLk5ld1NlYXJjaFN0YXJ0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTcGVjaWFsIGNhc2UgZm9yIHdoZW4gd2UgaGF2ZSBhbiBBSSBwcm92aWRlciByZWdpc3RlcmVkXG5cdFx0Q29uc3RhbnRzLlNlYXJjaENvbnRleHQuQUlSZXN1bHRzUmVxdWVzdGVkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodGhpcy5zaG91bGRTaG93QUlSZXN1bHRzKCkgJiYgISFhaVJlc3VsdHMpO1xuXG5cdFx0Ly8gRXhwYW5kIEFJIHJlc3VsdHMgaWYgdGhlIG5vZGUgaXMgY29sbGFwc2VkXG5cdFx0aWYgKGNvbXBsZXRlZCAmJiB0aGlzLnRyZWUuaGFzTm9kZSh0aGlzLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpICYmIHRoaXMudHJlZS5pc0NvbGxhcHNlZCh0aGlzLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpKSB7XG5cdFx0XHR0aGlzLnRyZWUuZXhwYW5kKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cblx0XHRpZiAoIWFsbFJlc3VsdHMpIHtcblx0XHRcdGNvbnN0IGhhc0V4Y2x1ZGVzID0gISFleGNsdWRlUGF0dGVyblRleHQ7XG5cdFx0XHRjb25zdCBoYXNJbmNsdWRlcyA9ICEhaW5jbHVkZVBhdHRlcm5UZXh0O1xuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblxuXHRcdFx0aWYgKCFjb21wbGV0ZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IFNFQVJDSF9DQU5DRUxMRURfTUVTU0FHRTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbmx5U2VhcmNoSW5PcGVuRWRpdG9ycygpKSB7XG5cdFx0XHRcdGlmIChoYXNJbmNsdWRlcyAmJiBoYXNFeGNsdWRlcykge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vT3BlbkVkaXRvclJlc3VsdHNJbmNsdWRlc0V4Y2x1ZGVzJywgXCJObyByZXN1bHRzIGZvdW5kIGluIG9wZW4gZWRpdG9ycyBtYXRjaGluZyAnezB9JyBleGNsdWRpbmcgJ3sxfScgLSBcIiwgaW5jbHVkZVBhdHRlcm5UZXh0LCBleGNsdWRlUGF0dGVyblRleHQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0luY2x1ZGVzKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbm9PcGVuRWRpdG9yUmVzdWx0c0luY2x1ZGVzJywgXCJObyByZXN1bHRzIGZvdW5kIGluIG9wZW4gZWRpdG9ycyBtYXRjaGluZyAnezB9JyAtIFwiLCBpbmNsdWRlUGF0dGVyblRleHQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0V4Y2x1ZGVzKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbm9PcGVuRWRpdG9yUmVzdWx0c0V4Y2x1ZGVzJywgXCJObyByZXN1bHRzIGZvdW5kIGluIG9wZW4gZWRpdG9ycyBleGNsdWRpbmcgJ3swfScgLSBcIiwgZXhjbHVkZVBhdHRlcm5UZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub09wZW5FZGl0b3JSZXN1bHRzRm91bmQnLCBcIk5vIHJlc3VsdHMgZm91bmQgaW4gb3BlbiBlZGl0b3JzLiBSZXZpZXcgeW91ciBjb25maWd1cmVkIGV4Y2x1c2lvbnMgYW5kIGNoZWNrIHlvdXIgZ2l0aWdub3JlIGZpbGVzIC0gXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoaGFzSW5jbHVkZXMgJiYgaGFzRXhjbHVkZXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub1Jlc3VsdHNJbmNsdWRlc0V4Y2x1ZGVzJywgXCJObyByZXN1bHRzIGZvdW5kIGluICd7MH0nIGV4Y2x1ZGluZyAnezF9JyAtIFwiLCBpbmNsdWRlUGF0dGVyblRleHQsIGV4Y2x1ZGVQYXR0ZXJuVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzSW5jbHVkZXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub1Jlc3VsdHNJbmNsdWRlcycsIFwiTm8gcmVzdWx0cyBmb3VuZCBpbiAnezB9JyAtIFwiLCBpbmNsdWRlUGF0dGVyblRleHQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0V4Y2x1ZGVzKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbm9SZXN1bHRzRXhjbHVkZXMnLCBcIk5vIHJlc3VsdHMgZm91bmQgZXhjbHVkaW5nICd7MH0nIC0gXCIsIGV4Y2x1ZGVQYXR0ZXJuVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbm9SZXN1bHRzRm91bmQnLCBcIk5vIHJlc3VsdHMgZm91bmQuIFJldmlldyB5b3VyIGNvbmZpZ3VyZWQgZXhjbHVzaW9ucyBhbmQgY2hlY2sgeW91ciBnaXRpZ25vcmUgZmlsZXMgLSBcIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5kaWNhdGUgYXMgc3RhdHVzIHRvIEFSSUFcblx0XHRcdGFyaWEuc3RhdHVzKG1lc3NhZ2UpO1xuXG5cdFx0XHRjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNsZWFyTWVzc2FnZSgpO1xuXHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsIG1lc3NhZ2UpO1xuXG5cdFx0XHRpZiAodGhpcy5zaG91bGRTaG93QUlSZXN1bHRzKCkpIHtcblx0XHRcdFx0dGhpcy5hcHBlbmRTZWFyY2hXaXRoQUlCdXR0b24obWVzc2FnZUVsKTtcblx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsICQoJ3NwYW4nLCB1bmRlZmluZWQsICcgLSAnKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghY29tcGxldGVkKSB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaEFnYWluQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVydW5TZWFyY2gubWVzc2FnZScsIFwiU2VhcmNoIGFnYWluXCIpLFxuXHRcdFx0XHRcdCgpID0+IHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSksIHRoaXMuaG92ZXJTZXJ2aWNlKSk7XG5cdFx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBzZWFyY2hBZ2FpbkJ1dHRvbi5lbGVtZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoaGFzSW5jbHVkZXMgfHwgaGFzRXhjbHVkZXMpIHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoQWdhaW5CdXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24obmxzLmxvY2FsaXplKCdyZXJ1blNlYXJjaEluQWxsLm1lc3NhZ2UnLCBcIlNlYXJjaCBhZ2FpbiBpbiBhbGwgZmlsZXNcIiksIHRoaXMub25TZWFyY2hBZ2Fpbi5iaW5kKHRoaXMpLCB0aGlzLmhvdmVyU2VydmljZSkpO1xuXHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgc2VhcmNoQWdhaW5CdXR0b24uZWxlbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBvcGVuU2V0dGluZ3NCdXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24obmxzLmxvY2FsaXplKCdvcGVuU2V0dGluZ3MubWVzc2FnZScsIFwiT3BlbiBTZXR0aW5nc1wiKSwgdGhpcy5vbk9wZW5TZXR0aW5ncy5iaW5kKHRoaXMpLCB0aGlzLmhvdmVyU2VydmljZSkpO1xuXHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgb3BlblNldHRpbmdzQnV0dG9uLmVsZW1lbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0XHR0aGlzLnNob3dTZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZUxheW91dCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQudG9nZ2xlSGlnaGxpZ2h0cyh0aGlzLmlzVmlzaWJsZSgpKTsgLy8gc2hvdyBoaWdobGlnaHRzXG5cblx0XHRcdC8vIEluZGljYXRlIGZpbmFsIHNlYXJjaCByZXN1bHQgY291bnQgZm9yIEFSSUFcblx0XHRcdGFyaWEuc3RhdHVzKG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaFJlc3VsdHNTdGF0dXMnLCBcIlNlYXJjaCByZXR1cm5lZCB7MH0gcmVzdWx0cyBpbiB7MX0gZmlsZXNcIiwgdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNvdW50KCksIHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5maWxlQ291bnQoKSkpO1xuXHRcdH1cblxuXG5cdFx0aWYgKGNvbXBsZXRlZCAmJiBjb21wbGV0ZWQubGltaXRIaXQpIHtcblx0XHRcdGNvbXBsZXRlZC5tZXNzYWdlcy5wdXNoKHsgdHlwZTogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUuV2FybmluZywgdGV4dDogbmxzLmxvY2FsaXplKCdzZWFyY2hNYXhSZXN1bHRzV2FybmluZycsIFwiVGhlIHJlc3VsdCBzZXQgb25seSBjb250YWlucyBhIHN1YnNldCBvZiBhbGwgbWF0Y2hlcy4gQmUgbW9yZSBzcGVjaWZpYyBpbiB5b3VyIHNlYXJjaCB0byBuYXJyb3cgZG93biB0aGUgcmVzdWx0cy5cIikgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbXBsZXRlZCAmJiBjb21wbGV0ZWQubWVzc2FnZXMpIHtcblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBjb21wbGV0ZWQubWVzc2FnZXMpIHtcblx0XHRcdFx0dGhpcy5hZGRNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVMYXlvdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25TZWFyY2hFcnJvcihlOiBhbnksIHByb2dyZXNzQ29tcGxldGU6ICgpID0+IHZvaWQsIGV4Y2x1ZGVQYXR0ZXJuVGV4dD86IHN0cmluZywgaW5jbHVkZVBhdHRlcm5UZXh0Pzogc3RyaW5nLCBjb21wbGV0ZWQ/OiBJU2VhcmNoQ29tcGxldGUsIHNob3VsZERvRmluYWxSZWZyZXNoID0gdHJ1ZSkge1xuXHRcdHRoaXMuc3RhdGUgPSBTZWFyY2hVSVN0YXRlLklkbGU7XG5cdFx0aWYgKGVycm9ycy5pc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblNlYXJjaENvbXBsZXRlKHByb2dyZXNzQ29tcGxldGUsIGV4Y2x1ZGVQYXR0ZXJuVGV4dCwgaW5jbHVkZVBhdHRlcm5UZXh0LCBjb21wbGV0ZWQsIHNob3VsZERvRmluYWxSZWZyZXNoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvZ3Jlc3NDb21wbGV0ZSgpO1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNob3dNZXNzYWdlKHsgY29udGVudDogZS5tZXNzYWdlLCB0eXBlOiBNZXNzYWdlVHlwZS5FUlJPUiB9KTtcblx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5jbGVhcigpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNsZWFyQUlSZXN1bHRzKCkge1xuXHRcdHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4gPSB0cnVlO1xuXHRcdHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLmNsZWFyQWxsUGVuZGluZygpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY2FjaGVkUmVzdWx0cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jYWNoZWRLZXl3b3JkcyA9IFtdO1xuXHRcdHRoaXMubW9kZWwuY2FuY2VsQUlTZWFyY2godHJ1ZSk7XG5cdFx0dGhpcy5tb2RlbC5jbGVhckFpU2VhcmNoUmVzdWx0cygpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlcXVlc3RBSVJlc3VsdHMoKSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNlYXJjaFZpZXc6IFJlcXVlc3Rpbmcgc2VtYW50aWMgcmVzdWx0cyBmcm9tIGtleWJpbmRpbmcuIENhY2hlZDogJHshIXRoaXMuY2FjaGVkUmVzdWx0c31gKTtcblx0XHRpZiAoKCF0aGlzLmNhY2hlZFJlc3VsdHMgfHwgdGhpcy5jYWNoZWRSZXN1bHRzLnJlc3VsdHMubGVuZ3RoID09PSAwKSAmJiAhdGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5jbGVhckFJUmVzdWx0cygpO1xuXHRcdH1cblx0XHR0aGlzLm1vZGVsLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuID0gZmFsc2U7XG5cdFx0YXdhaXQgdGhpcy5xdWV1ZVJlZnJlc2hUcmVlKCk7XG5cdFx0YXdhaXQgZm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkodGhpcy5nZXRDb250cm9sKCksIHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYWRkQUlSZXN1bHRzKCkge1xuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuVGV4dCA9IHRoaXMuX2dldEV4Y2x1ZGVQYXR0ZXJuKCk7XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm5UZXh0ID0gdGhpcy5fZ2V0SW5jbHVkZVBhdHRlcm4oKTtcblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5jbGVhck1lc3NhZ2UoKTtcblx0XHR0aGlzLnNob3dFbXB0eVN0YWdlKCk7XG5cdFx0dGhpcy5fdmlzaWJsZU1hdGNoZXMgPSAwO1xuXHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbC5yZXBsYWNlU3RyaW5nID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0UmVwbGFjZVZhbHVlKCk7XG5cdFx0Ly8gUmV1c2UgcGVuZGluZyBhaVNlYXJjaCBpZiBhdmFpbGFibGVcblx0XHRsZXQgYWlTZWFyY2hQcm9taXNlID0gdGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZTtcblx0XHRpZiAoIWFpU2VhcmNoUHJvbWlzZSkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnNldEFJUXVlcnlVc2luZ1RleHRRdWVyeSgpO1xuXHRcdFx0YWlTZWFyY2hQcm9taXNlID0gdGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSA9IHRoaXMudmlld01vZGVsLmFpU2VhcmNoKCgpID0+IHtcblx0XHRcdFx0Ly8gQ2xlYXIgcGVuZGluZyBwcm9taXNlIHdoZW4gZmlyc3QgcmVzdWx0IGNvbWVzIGluXG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID09PSBhaVNlYXJjaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhaVNlYXJjaFByb21pc2UudGhlbigoY29tcGxldGUpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU2VhcmNoUmVzdWx0Q291bnQodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnF1ZXJ5Py51c2VyRGlzYWJsZWRFeGNsdWRlc0FuZElnbm9yZUZpbGVzLCB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucXVlcnk/Lm9ubHlPcGVuRWRpdG9ycywgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMub25TZWFyY2hDb21wbGV0ZSgoKSA9PiB7IH0sIGV4Y2x1ZGVQYXR0ZXJuVGV4dCwgaW5jbHVkZVBhdHRlcm5UZXh0LCBjb21wbGV0ZSwgZmFsc2UsIGNvbXBsZXRlLmFpS2V5d29yZHMpO1xuXHRcdH0sIChlKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblNlYXJjaEVycm9yKGUsICgpID0+IHsgfSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NlYXJjaChxdWVyeTogSVRleHRRdWVyeSwgZXhjbHVkZVBhdHRlcm5UZXh0OiBzdHJpbmcsIGluY2x1ZGVQYXR0ZXJuVGV4dDogc3RyaW5nLCB0cmlnZ2VyZWRPblR5cGU6IGJvb2xlYW4sIHNob3VsZEtlZXBBSVJlc3VsdHM6IGJvb2xlYW4sIHNob3VsZFVwZGF0ZUFJU2VhcmNoOiBib29sZWFuKTogVGhlbmFibGU8dm9pZD4ge1xuXHRcdGxldCBwcm9ncmVzc0NvbXBsZXRlOiAoKSA9PiB2b2lkO1xuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmdldFByb2dyZXNzTG9jYXRpb24oKSwgZGVsYXk6IHRyaWdnZXJlZE9uVHlwZSA/IDMwMCA6IDAgfSwgX3Byb2dyZXNzID0+IHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHByb2dyZXNzQ29tcGxldGUgPSByZXNvbHZlKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5jbGVhck1lc3NhZ2UoKTtcblx0XHR0aGlzLnN0YXRlID0gU2VhcmNoVUlTdGF0ZS5TZWFyY2hpbmc7XG5cdFx0dGhpcy5zaG93RW1wdHlTdGFnZSgpO1xuXHRcdGlmICh0aGlzLm1vZGVsLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuICYmIHNob3VsZFVwZGF0ZUFJU2VhcmNoKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2VhcmNoVmlldzogU2VtYW50aWMgc2VhcmNoIHZpc2libGUuIEtlZXAgc2VtYW50aWMgcmVzdWx0czogJHtzaG91bGRLZWVwQUlSZXN1bHRzfS4gVXBkYXRlIHNlbWFudGljIHNlYXJjaDogJHtzaG91bGRVcGRhdGVBSVNlYXJjaH1gKTtcblx0XHRcdHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4gPSBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzbG93VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTZWFyY2hVSVN0YXRlLlNsb3dTZWFyY2g7XG5cdFx0fSwgMjAwMCk7XG5cblx0XHR0aGlzLl92aXNpYmxlTWF0Y2hlcyA9IDA7XG5cblx0XHR0aGlzLl9yZWZyZXNoUmVzdWx0c1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKGZhbHNlKTtcblxuXHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbC5yZXBsYWNlU3RyaW5nID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0UmVwbGFjZVZhbHVlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoKHF1ZXJ5KTtcblxuXHRcdGlmICghc2hvdWxkS2VlcEFJUmVzdWx0cyB8fCBzaG91bGRVcGRhdGVBSVNlYXJjaCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnNldEFJUXVlcnlVc2luZ1RleHRRdWVyeShxdWVyeSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykuc2VhcmNoVmlldy5rZXl3b3JkU3VnZ2VzdGlvbnMpIHtcblx0XHRcdHRoaXMuZ2V0S2V5d29yZFN1Z2dlc3Rpb25zKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5hc3luY1Jlc3VsdHMudGhlbigoY29tcGxldGUpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dChzbG93VGltZXIpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKS5zZWFyY2hWaWV3LnNlbWFudGljU2VhcmNoQmVoYXZpb3I7XG5cdFx0XHRpZiAoY29tcGxldGUucmVzdWx0cy5sZW5ndGggPT09IDAgJiYgY29uZmlnID09PSBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yLlJ1bk9uRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNlYXJjaFZpZXc6IFJlcXVlc3Rpbmcgc2VtYW50aWMgcmVzdWx0cyBvbiBlbXB0eSBzZWFyY2guYCk7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoQ29tcGxldGUocHJvZ3Jlc3NDb21wbGV0ZSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIGNvbXBsZXRlKTtcblx0XHR9LCAoZSkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNsb3dUaW1lcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblNlYXJjaEVycm9yKGUsIHByb2dyZXNzQ29tcGxldGUsIGV4Y2x1ZGVQYXR0ZXJuVGV4dCwgaW5jbHVkZVBhdHRlcm5UZXh0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25PcGVuU2V0dGluZ3MoZTogZG9tLkV2ZW50TGlrZSk6IHZvaWQge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIGZhbHNlKTtcblx0XHR0aGlzLm9wZW5TZXR0aW5ncygnQGlkOmZpbGVzLmV4Y2x1ZGUsc2VhcmNoLmV4Y2x1ZGUsc2VhcmNoLnVzZVBhcmVudElnbm9yZUZpbGVzLHNlYXJjaC51c2VHbG9iYWxJZ25vcmVGaWxlcyxzZWFyY2gudXNlSWdub3JlRmlsZXMnKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlblNldHRpbmdzKHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyA9IHsgcXVlcnkgfTtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSA/XG5cdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuV29ya3NwYWNlU2V0dGluZ3Mob3B0aW9ucykgOlxuXHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyhvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgb25TZWFyY2hBZ2FpbigpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldE9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKGZhbHNlKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldE9ubHlTZWFyY2hJbkNoYW5nZWRGaWxlcyhmYWxzZSk7XG5cblx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7IHByZXNlcnZlRm9jdXM6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVuYWJsZUV4Y2x1ZGVzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKGZhbHNlLCB0cnVlKTtcblx0XHR0aGlzLnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuLnNldFVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXModHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlzYWJsZVNlYXJjaEluT3BlbkVkaXRvcnMoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHMoZmFsc2UsIHRydWUpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluT3BlbkVkaXRvcnMoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTZWFyY2hSZXN1bHRDb3VudChkaXNyZWdhcmRFeGNsdWRlc0FuZElnbm9yZXM/OiBib29sZWFuLCBvbmx5T3BlbkVkaXRvcnM/OiBib29sZWFuLCBjbGVhcjogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZEtleXdvcmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmZpbGVDb3VudCh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbik7XG5cdFx0Y29uc3QgcmVzdWx0Q291bnQgPSB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuY291bnQodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4pO1xuXHRcdHRoaXMuaGFzU2VhcmNoUmVzdWx0c0tleS5zZXQoZmlsZUNvdW50ID4gMCk7XG5cblx0XHRjb25zdCBtc2dXYXNIaWRkZW4gPSB0aGlzLm1lc3NhZ2VzRWxlbWVudC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZSc7XG5cblx0XHRjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNsZWFyTWVzc2FnZSgpO1xuXHRcdGNvbnN0IHJlc3VsdE1zZyA9IGNsZWFyID8gJycgOiB0aGlzLmJ1aWxkUmVzdWx0Q291bnRNZXNzYWdlKHJlc3VsdENvdW50LCBmaWxlQ291bnQpO1xuXHRcdHRoaXMudHJlZS5hcmlhTGFiZWwgPSByZXN1bHRNc2cgKyBubHMubG9jYWxpemUoJ2ZvclRlcm0nLCBcIiAtIFNlYXJjaDogezB9XCIsIHRoaXMuc2VhcmNoUmVzdWx0LnF1ZXJ5Py5jb250ZW50UGF0dGVybi5wYXR0ZXJuID8/ICcnKTtcblx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgcmVzdWx0TXNnKTtcblxuXHRcdGlmIChmaWxlQ291bnQgPiAwKSB7XG5cdFx0XHRpZiAoZGlzcmVnYXJkRXhjbHVkZXNBbmRJZ25vcmVzKSB7XG5cdFx0XHRcdGNvbnN0IGV4Y2x1ZGVzRGlzYWJsZWRNZXNzYWdlID0gJyAtICcgKyBubHMubG9jYWxpemUoJ3VzZUlnbm9yZXNBbmRFeGNsdWRlc0Rpc2FibGVkJywgXCJleGNsdWRlIHNldHRpbmdzIGFuZCBpZ25vcmUgZmlsZXMgYXJlIGRpc2FibGVkXCIpICsgJyAnO1xuXHRcdFx0XHRjb25zdCBlbmFibGVFeGNsdWRlc0J1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihubHMubG9jYWxpemUoJ2V4Y2x1ZGVzLmVuYWJsZScsIFwiZW5hYmxlXCIpLCB0aGlzLm9uRW5hYmxlRXhjbHVkZXMuYmluZCh0aGlzKSwgdGhpcy5ob3ZlclNlcnZpY2UsIG5scy5sb2NhbGl6ZSgndXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlc0Rlc2NyaXB0aW9uJywgXCJVc2UgRXhjbHVkZSBTZXR0aW5ncyBhbmQgSWdub3JlIEZpbGVzXCIpKSk7XG5cdFx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCAkKCdzcGFuJywgdW5kZWZpbmVkLCBleGNsdWRlc0Rpc2FibGVkTWVzc2FnZSwgJygnLCBlbmFibGVFeGNsdWRlc0J1dHRvbi5lbGVtZW50LCAnKScpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9ubHlPcGVuRWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hpbmdJbk9wZW5NZXNzYWdlID0gJyAtICcgKyBubHMubG9jYWxpemUoJ29ubHlPcGVuRWRpdG9ycycsIFwic2VhcmNoaW5nIG9ubHkgaW4gb3BlbiBmaWxlc1wiKSArICcgJztcblx0XHRcdFx0Y29uc3QgZGlzYWJsZU9wZW5FZGl0b3JzQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKG5scy5sb2NhbGl6ZSgnb3BlbkVkaXRvcnMuZGlzYWJsZScsIFwiZGlzYWJsZVwiKSwgdGhpcy5vbkRpc2FibGVTZWFyY2hJbk9wZW5FZGl0b3JzLmJpbmQodGhpcyksIHRoaXMuaG92ZXJTZXJ2aWNlLCBubHMubG9jYWxpemUoJ2Rpc2FibGVPcGVuRWRpdG9ycycsIFwiU2VhcmNoIGluIGVudGlyZSB3b3Jrc3BhY2VcIikpKTtcblx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsICQoJ3NwYW4nLCB1bmRlZmluZWQsIHNlYXJjaGluZ0luT3Blbk1lc3NhZ2UsICcoJywgZGlzYWJsZU9wZW5FZGl0b3JzQnV0dG9uLmVsZW1lbnQsICcpJykpO1xuXHRcdFx0fVxuXG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgJyAtICcpO1xuXG5cdFx0XHRjb25zdCBvcGVuSW5FZGl0b3JUb29sdGlwID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ29wZW5JbkVkaXRvci50b29sdGlwJywgXCJDb3B5IGN1cnJlbnQgc2VhcmNoIHJlc3VsdHMgdG8gYW4gZWRpdG9yXCIpLFxuXHRcdFx0XHRDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5PcGVuSW5FZGl0b3JDb21tYW5kSWQpO1xuXHRcdFx0Y29uc3Qgb3BlbkluRWRpdG9yQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ29wZW5JbkVkaXRvci5tZXNzYWdlJywgXCJPcGVuIGluIGVkaXRvclwiKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVFZGl0b3JGcm9tU2VhcmNoUmVzdWx0LCB0aGlzLnNlYXJjaFJlc3VsdCwgdGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5nZXRWYWx1ZSgpLCB0aGlzLnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuLmdldFZhbHVlKCksIHRoaXMuc2VhcmNoSW5jbHVkZVBhdHRlcm4ub25seVNlYXJjaEluT3BlbkVkaXRvcnMoKSksIHRoaXMuaG92ZXJTZXJ2aWNlLFxuXHRcdFx0XHRvcGVuSW5FZGl0b3JUb29sdGlwKSk7XG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgb3BlbkluRWRpdG9yQnV0dG9uLmVsZW1lbnQpO1xuXG5cdFx0XHRpZiAodGhpcy5zaG91bGRTaG93QUlSZXN1bHRzKCkpIHtcblx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsICcgLSAnKTtcblx0XHRcdFx0dGhpcy5hcHBlbmRTZWFyY2hXaXRoQUlCdXR0b24obWVzc2FnZUVsKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZUxheW91dCgpO1xuXHRcdH0gZWxzZSBpZiAoIW1zZ1dhc0hpZGRlbikge1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5tZXNzYWdlc0VsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlS2V5d29yZENsaWNrKGtleXdvcmQ6IHN0cmluZywgaW5kZXg6IG51bWJlcikge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRWYWx1ZShrZXl3b3JkKTtcblx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7IHByZXNlcnZlRm9jdXM6IGZhbHNlLCB0cmlnZ2VyZWRPblR5cGU6IGZhbHNlLCBzaG91bGRLZWVwQUlSZXN1bHRzOiBmYWxzZSB9KTtcblx0XHR0eXBlIEtleXdvcmRDbGlja0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdvc29ydGVnYSc7XG5cdFx0XHRjb21tZW50OiAnRmlyZWQgd2hlbiB0aGUgdXNlciBjbGlja3Mgb24gYSBrZXl3b3JkIHN1Z2dlc3Rpb24nO1xuXHRcdFx0aW5kZXg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgaW5kZXggb2YgdGhlIGtleXdvcmQgY2xpY2tlZCcgfTtcblx0XHRcdG1heEtleXdvcmRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIHRvdGFsIG51bWJlciBvZiBzdWdnZXN0ZWQga2V5d29yZHMnIH07XG5cdFx0fTtcblx0XHR0eXBlIEtleXdvcmRDbGlja0V2ZW50ID0ge1xuXHRcdFx0aW5kZXg6IG51bWJlcjtcblx0XHRcdG1heEtleXdvcmRzOiBudW1iZXI7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxLZXl3b3JkQ2xpY2tFdmVudCwgS2V5d29yZENsaWNrQ2xhc3NpZmljYXRpb24+KCdzZWFyY2hLZXl3b3JkQ2xpY2snLCB7XG5cdFx0XHRpbmRleCxcblx0XHRcdG1heEtleXdvcmRzOiB0aGlzLl9jYWNoZWRLZXl3b3Jkcy5sZW5ndGhcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlS2V5d29yZFN1Z2dlc3Rpb25VSShrZXl3b3JkOiBBSVNlYXJjaEtleXdvcmQpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5tZXNzYWdlc0VsZW1lbnQuZmlyc3RDaGlsZCBhcyBIVE1MRGl2RWxlbWVudDtcblx0XHRpZiAodGhpcy5fY2FjaGVkS2V5d29yZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHRoaXMuX2NhY2hlZEtleXdvcmRzLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdC8vIElmIHdlIGFscmVhZHkgaGF2ZSAzIGtleXdvcmRzLCBqdXN0IHJldHVyblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkb20uYXBwZW5kKGVsZW1lbnQsICcsICcpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9jYWNoZWRLZXl3b3Jkcy5sZW5ndGg7XG5cdFx0XHRjb25zdCBidXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24oXG5cdFx0XHRcdGtleXdvcmQua2V5d29yZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5oYW5kbGVLZXl3b3JkQ2xpY2soa2V5d29yZC5rZXl3b3JkLCBpbmRleCksXG5cdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlXG5cdFx0XHQpKTtcblx0XHRcdGRvbS5hcHBlbmQoZWxlbWVudCwgYnV0dG9uLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlRWwgPSB0aGlzLmNsZWFyTWVzc2FnZSgpO1xuXHRcdFx0bWVzc2FnZUVsLmNsYXNzTGlzdC5hZGQoJ2FpLWtleXdvcmRzJyk7XG5cblx0XHRcdC8vIEFkZCB1bmNsaWNrYWJsZSBtZXNzYWdlXG5cdFx0XHRjb25zdCByZXN1bHRNc2cgPSBubHMubG9jYWxpemUoJ2tleXdvcmRTdWdnZXN0aW9uLm1lc3NhZ2UnLCBcIlNlYXJjaCBpbnN0ZWFkIGZvcjogXCIpO1xuXHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsIHJlc3VsdE1zZyk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihcblx0XHRcdFx0a2V5d29yZC5rZXl3b3JkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmhhbmRsZUtleXdvcmRDbGljayhrZXl3b3JkLmtleXdvcmQsIDApLFxuXHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZVxuXHRcdFx0KSk7XG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgYnV0dG9uLmVsZW1lbnQpO1xuXHRcdH1cblx0XHR0aGlzLl9jYWNoZWRLZXl3b3Jkcy5wdXNoKGtleXdvcmQua2V5d29yZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEtleXdvcmRTdWdnZXN0aW9ucygpIHtcblx0XHQvLyBSZXVzZSBwZW5kaW5nIGFpU2VhcmNoIGlmIGF2YWlsYWJsZVxuXHRcdGxldCBhaVNlYXJjaFByb21pc2UgPSB0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlO1xuXHRcdGlmICghYWlTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuc2V0QUlRdWVyeVVzaW5nVGV4dFF1ZXJ5KCk7XG5cdFx0XHRhaVNlYXJjaFByb21pc2UgPSB0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID0gdGhpcy52aWV3TW9kZWwuYWlTZWFyY2gocmVzdWx0ID0+IHtcblx0XHRcdFx0aWYgKHJlc3VsdCAmJiBpc0FJS2V5d29yZChyZXN1bHQpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVLZXl3b3JkU3VnZ2VzdGlvblVJKHJlc3VsdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENsZWFyIHBlbmRpbmcgcHJvbWlzZSB3aGVuIGZpcnN0IHJlc3VsdCBjb21lcyBpblxuXHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSA9PT0gYWlTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NhY2hlZFJlc3VsdHMgPSBhd2FpdCBhaVNlYXJjaFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFkZE1lc3NhZ2UobWVzc2FnZTogVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZSkge1xuXHRcdGNvbnN0IG1lc3NhZ2VCb3ggPSB0aGlzLm1lc3NhZ2VzRWxlbWVudC5maXJzdENoaWxkIGFzIEhUTUxEaXZFbGVtZW50O1xuXHRcdGlmICghbWVzc2FnZUJveCkgeyByZXR1cm47IH1cblx0XHRkb20uYXBwZW5kKG1lc3NhZ2VCb3gsIHJlbmRlclNlYXJjaE1lc3NhZ2UobWVzc2FnZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLCAoKSA9PiB0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkUmVzdWx0Q291bnRNZXNzYWdlKHJlc3VsdENvdW50OiBudW1iZXIsIGZpbGVDb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAocmVzdWx0Q291bnQgPT09IDEgJiYgZmlsZUNvdW50ID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzZWFyY2guZmlsZS5yZXN1bHQnLCBcInswfSByZXN1bHQgaW4gezF9IGZpbGVcIiwgcmVzdWx0Q291bnQsIGZpbGVDb3VudCk7XG5cdFx0fSBlbHNlIGlmIChyZXN1bHRDb3VudCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc2VhcmNoLmZpbGVzLnJlc3VsdCcsIFwiezB9IHJlc3VsdCBpbiB7MX0gZmlsZXNcIiwgcmVzdWx0Q291bnQsIGZpbGVDb3VudCk7XG5cdFx0fSBlbHNlIGlmIChmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NlYXJjaC5maWxlLnJlc3VsdHMnLCBcInswfSByZXN1bHRzIGluIHsxfSBmaWxlXCIsIHJlc3VsdENvdW50LCBmaWxlQ291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzZWFyY2guZmlsZXMucmVzdWx0cycsIFwiezB9IHJlc3VsdHMgaW4gezF9IGZpbGVzXCIsIHJlc3VsdENvdW50LCBmaWxlQ291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1NlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2VFbGVtZW50ID0gdGhpcy5jbGVhck1lc3NhZ2UoKTtcblxuXHRcdGNvbnN0IHRleHRFbCA9IGRvbS5hcHBlbmQodGhpcy5zZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZUVsZW1lbnQsXG5cdFx0XHQkKCdwJywgdW5kZWZpbmVkLCBubHMubG9jYWxpemUoJ3NlYXJjaFdpdGhvdXRGb2xkZXInLCBcIllvdSBoYXZlIG5vdCBvcGVuZWQgb3Igc3BlY2lmaWVkIGEgZm9sZGVyLiBPbmx5IG9wZW4gZmlsZXMgYXJlIGN1cnJlbnRseSBzZWFyY2hlZCAtIFwiKSkpO1xuXG5cdFx0Y29uc3Qgb3BlbkZvbGRlckJ1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihcblx0XHRcdG5scy5sb2NhbGl6ZSgnb3BlbkZvbGRlcicsIFwiT3BlbiBGb2xkZXJcIiksXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoT3BlbkZvbGRlckFjdGlvbi5JRCkuY2F0Y2goZXJyID0+IGVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlcnIpKTtcblx0XHRcdH0sIHRoaXMuaG92ZXJTZXJ2aWNlKSk7XG5cdFx0ZG9tLmFwcGVuZCh0ZXh0RWwsIG9wZW5Gb2xkZXJCdXR0b24uZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dFbXB0eVN0YWdlKGZvcmNlSGlkZU1lc3NhZ2VzID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCBzaG93aW5nQ2FuY2VsbGVkID0gKHRoaXMubWVzc2FnZXNFbGVtZW50LmZpcnN0Q2hpbGQ/LnRleHRDb250ZW50Py5pbmRleE9mKFNFQVJDSF9DQU5DRUxMRURfTUVTU0FHRSkgPz8gLTEpID4gLTE7XG5cblx0XHQvLyBjbGVhbiB1cCB1aVxuXHRcdC8vIHRoaXMucmVwbGFjZVNlcnZpY2UuZGlzcG9zZUFsbFJlcGxhY2VQcmV2aWV3cygpO1xuXHRcdGlmIChzaG93aW5nQ2FuY2VsbGVkIHx8IGZvcmNlSGlkZU1lc3NhZ2VzIHx8ICF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPigpLnNlYXJjaD8uc2VhcmNoT25UeXBlKSB7XG5cdFx0XHQvLyB3aGVuIGluIHNlYXJjaCB0byB0eXBlLCBkb24ndCBwcmVlbXB0aXZlbHkgaGlkZSwgYXMgaXQgY2F1c2VzIGZsaWNrZXJpbmcgYW5kIHNoaWZ0aW5nIG9mIHRoZSBsaXZlIHJlc3VsdHNcblx0XHRcdGRvbS5oaWRlKHRoaXMubWVzc2FnZXNFbGVtZW50KTtcblx0XHR9XG5cblx0XHRkb20uc2hvdyh0aGlzLnJlc3VsdHNFbGVtZW50KTtcblx0XHR0aGlzLmN1cnJlbnRTZWxlY3RlZEZpbGVNYXRjaCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkT3BlbkluTm90ZWJvb2tFZGl0b3IobWF0Y2g6IElTZWFyY2hUcmVlTWF0Y2gsIHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Ly8gVW50aXRsZWQgZmlsZXMgd2lsbCByZXR1cm4gYSBmYWxzZSBwb3NpdGl2ZSBmb3IgZ2V0Q29udHJpYnV0ZWROb3RlYm9va1R5cGVzLlxuXHRcdC8vIFNpbmNlIHVudGl0bGVkIGZpbGVzIGFyZSBhbHJlYWR5IG9wZW4sIHRoZW4gdW50aXRsZWQgbm90ZWJvb2tzIHNob3VsZCByZXR1cm4gTm90ZWJvb2tNYXRjaCByZXN1bHRzLlxuXHRcdHJldHVybiBpc0lNYXRjaEluTm90ZWJvb2sobWF0Y2gpIHx8ICh1cmkuc2NoZW1lICE9PSBuZXR3b3JrLlNjaGVtYXMudW50aXRsZWQgJiYgdGhpcy5ub3RlYm9va1NlcnZpY2UuZ2V0Q29udHJpYnV0ZWROb3RlYm9va1R5cGVzKHVyaSkubGVuZ3RoID4gMCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRm9jdXMobGluZU1hdGNoOiBJU2VhcmNoVHJlZU1hdGNoLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgc2lkZUJ5U2lkZT86IGJvb2xlYW4sIHBpbm5lZD86IGJvb2xlYW4pOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHVzZVJlcGxhY2VQcmV2aWV3ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oKS5zZWFyY2g/LnVzZVJlcGxhY2VQcmV2aWV3O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBpc1NlYXJjaFRyZWVNYXRjaChsaW5lTWF0Y2gpID8gbGluZU1hdGNoLnBhcmVudCgpLnJlc291cmNlIDogKDxJU2VhcmNoVHJlZUZpbGVNYXRjaD5saW5lTWF0Y2gpLnJlc291cmNlO1xuXHRcdHJldHVybiAodXNlUmVwbGFjZVByZXZpZXcgJiYgdGhpcy52aWV3TW9kZWwuaXNSZXBsYWNlQWN0aXZlKCkgJiYgISF0aGlzLnZpZXdNb2RlbC5yZXBsYWNlU3RyaW5nICYmICEodGhpcy5zaG91bGRPcGVuSW5Ob3RlYm9va0VkaXRvcihsaW5lTWF0Y2gsIHJlc291cmNlKSkpID9cblx0XHRcdHRoaXMucmVwbGFjZVNlcnZpY2Uub3BlblJlcGxhY2VQcmV2aWV3KGxpbmVNYXRjaCwgcHJlc2VydmVGb2N1cywgc2lkZUJ5U2lkZSwgcGlubmVkKSA6XG5cdFx0XHR0aGlzLm9wZW4obGluZU1hdGNoLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlLCBwaW5uZWQsIHJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIG9wZW4oZWxlbWVudDogRmlsZU1hdGNoT3JNYXRjaCwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHNpZGVCeVNpZGU/OiBib29sZWFuLCBwaW5uZWQ/OiBib29sZWFuLCByZXNvdXJjZUlucHV0PzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZ2V0RWRpdG9yU2VsZWN0aW9uRnJvbU1hdGNoKGVsZW1lbnQsIHRoaXMudmlld01vZGVsKTtcblx0XHRjb25zdCBvbGRQYXJlbnRNYXRjaGVzID0gaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkgPyBlbGVtZW50LnBhcmVudCgpLm1hdGNoZXMoKSA6IFtdO1xuXHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VJbnB1dCA/PyAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkgPyBlbGVtZW50LnBhcmVudCgpLnJlc291cmNlIDogKDxJU2VhcmNoVHJlZUZpbGVNYXRjaD5lbGVtZW50KS5yZXNvdXJjZSk7XG5cdFx0bGV0IGVkaXRvcjogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBvcHRpb25zID0ge1xuXHRcdFx0cHJlc2VydmVGb2N1cyxcblx0XHRcdHBpbm5lZCxcblx0XHRcdHNlbGVjdGlvbixcblx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0fSwgc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVApO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JDb250cm9sID0gZWRpdG9yPy5nZXRDb250cm9sKCk7XG5cdFx0XHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkgJiYgcHJlc2VydmVGb2N1cyAmJiBpc0NvZGVFZGl0b3IoZWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmdldFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMoKS5oaWdobGlnaHRSYW5nZShcblx0XHRcdFx0XHRlZGl0b3JDb250cm9sLmdldE1vZGVsKCkhLFxuXHRcdFx0XHRcdGVsZW1lbnQucmFuZ2UoKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmdldFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMoKS5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBlbGVtUGFyZW50ID0gZWxlbWVudC5wYXJlbnQoKSBhcyBJTm90ZWJvb2tGaWxlSW5zdGFuY2VNYXRjaDtcblx0XHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0XHRpZiAoaXNJTWF0Y2hJbk5vdGVib29rKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5wYXJlbnQoKS5zaG93TWF0Y2goZWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yV2lkZ2V0ID0gZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRcdFx0XHRpZiAoZWRpdG9yV2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHQvLyBFbnN1cmUgdGhhdCB0aGUgZWRpdG9yIHdpZGdldCBpcyBiaW5kZWQuIElmIGlmIGlzLCB0aGVuIHRoaXMgc2hvdWxkIHJldHVybiBpbW1lZGlhdGVseS5cblx0XHRcdFx0XHRcdC8vIE90aGVyd2lzZSwgaXQgd2lsbCBiaW5kIHRoZSB3aWRnZXQuXG5cdFx0XHRcdFx0XHRlbGVtUGFyZW50LmJpbmROb3RlYm9va0VkaXRvcldpZGdldChlZGl0b3JXaWRnZXQpO1xuXHRcdFx0XHRcdFx0YXdhaXQgZWxlbVBhcmVudC51cGRhdGVNYXRjaGVzRm9yRWRpdG9yV2lkZ2V0KCk7XG5cblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoSW5kZXggPSBvbGRQYXJlbnRNYXRjaGVzLmZpbmRJbmRleChlID0+IGUuaWQoKSA9PT0gZWxlbWVudC5pZCgpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoZXMgPSBlbGVtUGFyZW50Lm1hdGNoZXMoKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gbWF0Y2hJbmRleCA+PSBtYXRjaGVzLmxlbmd0aCA/IG1hdGNoZXNbbWF0Y2hlcy5sZW5ndGggLSAxXSA6IG1hdGNoZXNbbWF0Y2hJbmRleF07XG5cblx0XHRcdFx0XHRcdGlmIChpc0lNYXRjaEluTm90ZWJvb2sobWF0Y2gpKSB7XG5cdFx0XHRcdFx0XHRcdGVsZW1QYXJlbnQuc2hvd01hdGNoKG1hdGNoKTtcblx0XHRcdFx0XHRcdFx0aWYgKCF0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5pbmNsdWRlcyhtYXRjaCkgfHwgIXRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKS5pbmNsdWRlcyhtYXRjaCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFttYXRjaF0sIGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoKSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFttYXRjaF0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3BlbkVkaXRvcldpdGhNdWx0aUN1cnNvcihlbGVtZW50OiBGaWxlTWF0Y2hPck1hdGNoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSA/IGVsZW1lbnQucGFyZW50KCkucmVzb3VyY2UgOiAoPElTZWFyY2hUcmVlRmlsZU1hdGNoPmVsZW1lbnQpLnJlc291cmNlO1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pLnRoZW4oZWRpdG9yID0+IHtcblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0bGV0IGZpbGVNYXRjaCA9IG51bGw7XG5cdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdFx0XHRmaWxlTWF0Y2ggPSBlbGVtZW50O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKGlzU2VhcmNoVHJlZU1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0ZmlsZU1hdGNoID0gZWxlbWVudC5wYXJlbnQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChmaWxlTWF0Y2gpIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gZmlsZU1hdGNoLm1hdGNoZXMoKS5tYXAobSA9PiBuZXcgU2VsZWN0aW9uKG0ucmFuZ2UoKS5zdGFydExpbmVOdW1iZXIsIG0ucmFuZ2UoKS5zdGFydENvbHVtbiwgbS5yYW5nZSgpLmVuZExpbmVOdW1iZXIsIG0ucmFuZ2UoKS5lbmRDb2x1bW4pKTtcblx0XHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3IuZ2V0Q29udHJvbCgpKTtcblx0XHRcdFx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbXVsdGlDdXJzb3JDb250cm9sbGVyID0gTXVsdGlDdXJzb3JTZWxlY3Rpb25Db250cm9sbGVyLmdldChjb2RlRWRpdG9yKTtcblx0XHRcdFx0XHRcdG11bHRpQ3Vyc29yQ29udHJvbGxlcj8uc2VsZWN0QWxsVXNpbmdTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmdldFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMoKS5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdH0sIGVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIG9uVW50aXRsZWREaWREaXNwb3NlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gcmVtb3ZlIHNlYXJjaCByZXN1bHRzIGZyb20gdGhpcyByZXNvdXJjZSBhcyBpdCBnb3QgZGlzcG9zZWRcblx0XHRsZXQgbWF0Y2hlcyA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG1hdGNoZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpID09PSBtYXRjaGVzW2ldLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnJlbW92ZShtYXRjaGVzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bWF0Y2hlcyA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKHRydWUpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBtYXRjaGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbWF0Y2hlc1tpXS5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5yZW1vdmUobWF0Y2hlc1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkZpbGVzQ2hhbmdlZChlOiBGaWxlQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAodGhpcy5zZWFyY2hDb25maWcuc29ydE9yZGVyICE9PSBTZWFyY2hTb3J0T3JkZXIuTW9kaWZpZWQgJiYgIWUuZ290RGVsZXRlZCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpO1xuXHRcdGlmIChlLmdvdERlbGV0ZWQoKSkge1xuXHRcdFx0Y29uc3QgZGVsZXRlZE1hdGNoZXMgPSBtYXRjaGVzLmZpbHRlcihtID0+IGUuY29udGFpbnMobS5yZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucmVtb3ZlKGRlbGV0ZWRNYXRjaGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGNoYW5nZWQgZmlsZSBjb250YWluZWQgbWF0Y2hlc1xuXHRcdFx0Y29uc3QgY2hhbmdlZE1hdGNoZXMgPSBtYXRjaGVzLmZpbHRlcihtID0+IGUuY29udGFpbnMobS5yZXNvdXJjZSkpO1xuXHRcdFx0aWYgKGNoYW5nZWRNYXRjaGVzLmxlbmd0aCAmJiB0aGlzLnNlYXJjaENvbmZpZy5zb3J0T3JkZXIgPT09IFNlYXJjaFNvcnRPcmRlci5Nb2RpZmllZCkge1xuXHRcdFx0XHQvLyBObyBtYXRjaGVzIG5lZWQgdG8gYmUgcmVtb3ZlZCwgYnV0IG1vZGlmaWVkIGZpbGVzIG5lZWQgdG8gaGF2ZSB0aGVpciBmaWxlIHN0YXQgdXBkYXRlZC5cblx0XHRcdFx0dGhpcy51cGRhdGVGaWxlU3RhdHMoY2hhbmdlZE1hdGNoZXMpLnRoZW4oYXN5bmMgKCkgPT4gdGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIucXVldWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2VhcmNoQ29uZmlnKCk6IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJyk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFySGlzdG9yeSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5jbGVhckhpc3RvcnkoKTtcblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmNsZWFySGlzdG9yeSgpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuY2xlYXJIaXN0b3J5KCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIFRoaXMgY2FuIGJlIGNhbGxlZCBiZWZvcmUgcmVuZGVyQm9keSgpIG1ldGhvZCBnZXRzIGNhbGxlZCBmb3IgdGhlIGZpcnN0IHRpbWVcblx0XHQvLyBpZiB3ZSBtb3ZlIHRoZSBzZWFyY2hWaWV3IGluc2lkZSBhbm90aGVyIHZpZXdQYW5lQ29udGFpbmVyXG5cdFx0aWYgKCF0aGlzLnNlYXJjaFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdHRlcm5FeGNsdWRlcyA9IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXM/LmdldFZhbHVlKCkudHJpbSgpID8/ICcnO1xuXHRcdGNvbnN0IHBhdHRlcm5JbmNsdWRlcyA9IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXM/LmdldFZhbHVlKCkudHJpbSgpID8/ICcnO1xuXHRcdGNvbnN0IG9ubHlPcGVuRWRpdG9ycyA9IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXM/Lm9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKCkgPz8gZmFsc2U7XG5cdFx0Y29uc3QgdXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyA9IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXM/LnVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMoKSA/PyB0cnVlO1xuXHRcdGNvbnN0IHByZXNlcnZlQ2FzZSA9IHRoaXMudmlld01vZGVsLnByZXNlcnZlQ2FzZTtcblxuXHRcdGlmICghdGhpcy52aWV3bGV0U3RhdGUucXVlcnkpIHtcblx0XHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5ID0ge307XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0KSB7XG5cdFx0XHRjb25zdCBpc1JlZ2V4ID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0UmVnZXgoKTtcblx0XHRcdGNvbnN0IGlzV2hvbGVXb3JkcyA9IHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0LmdldFdob2xlV29yZHMoKTtcblx0XHRcdGNvbnN0IGlzQ2FzZVNlbnNpdGl2ZSA9IHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0LmdldENhc2VTZW5zaXRpdmUoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRQYXR0ZXJuID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKTtcblxuXHRcdFx0Y29uc3QgaXNJbk5vdGVib29rQ2VsbElucHV0ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkuY29kZUlucHV0O1xuXHRcdFx0Y29uc3QgaXNJbk5vdGVib29rQ2VsbE91dHB1dCA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLmNvZGVPdXRwdXQ7XG5cdFx0XHRjb25zdCBpc0luTm90ZWJvb2tNYXJrZG93bklucHV0ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkubWFya3VwSW5wdXQ7XG5cdFx0XHRjb25zdCBpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBQcmV2aWV3O1xuXG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5jb250ZW50UGF0dGVybiA9IGNvbnRlbnRQYXR0ZXJuO1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkucmVnZXggPSBpc1JlZ2V4O1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkud2hvbGVXb3JkcyA9IGlzV2hvbGVXb3Jkcztcblx0XHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LmNhc2VTZW5zaXRpdmUgPSBpc0Nhc2VTZW5zaXRpdmU7XG5cblx0XHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LmlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQgPSBpc0luTm90ZWJvb2tNYXJrZG93bklucHV0O1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3ID0gaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3O1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuaXNJbk5vdGVib29rQ2VsbElucHV0ID0gaXNJbk5vdGVib29rQ2VsbElucHV0O1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuaXNJbk5vdGVib29rQ2VsbE91dHB1dCA9IGlzSW5Ob3RlYm9va0NlbGxPdXRwdXQ7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuZm9sZGVyRXhjbHVzaW9ucyA9IHBhdHRlcm5FeGNsdWRlcztcblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5mb2xkZXJJbmNsdWRlcyA9IHBhdHRlcm5JbmNsdWRlcztcblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS51c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzID0gdXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcztcblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5wcmVzZXJ2ZUNhc2UgPSBwcmVzZXJ2ZUNhc2U7XG5cdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkub25seU9wZW5FZGl0b3JzID0gb25seU9wZW5FZGl0b3JzO1xuXG5cdFx0Y29uc3QgaXNSZXBsYWNlU2hvd24gPSB0aGlzLnNlYXJjaEFuZFJlcGxhY2VXaWRnZXQuaXNSZXBsYWNlU2hvd24oKTtcblxuXHRcdGlmICghdGhpcy52aWV3bGV0U3RhdGUudmlldykge1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUudmlldyA9IHt9O1xuXHRcdH1cblxuXHRcdHRoaXMudmlld2xldFN0YXRlLnZpZXcuc2hvd1JlcGxhY2UgPSBpc1JlcGxhY2VTaG93bjtcblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS52aWV3LnRyZWVMYXlvdXQgPSB0aGlzLmlzVHJlZUxheW91dFZpZXdWaXNpYmxlO1xuXHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LnJlcGxhY2VUZXh0ID0gaXNSZXBsYWNlU2hvd24gJiYgdGhpcy5zZWFyY2hXaWRnZXQuZ2V0UmVwbGFjZVZhbHVlKCk7XG5cblx0XHR0aGlzLl9zYXZlU2VhcmNoSGlzdG9yeVNlcnZpY2UoKTtcblxuXHRcdHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpO1xuXG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlU2VhcmNoSGlzdG9yeVNlcnZpY2UoKSB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGlzdG9yeTogSVNlYXJjaEhpc3RvcnlWYWx1ZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoSGlzdG9yeSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFNlYXJjaEhpc3RvcnkoKTtcblx0XHRpZiAoc2VhcmNoSGlzdG9yeSAmJiBzZWFyY2hIaXN0b3J5Lmxlbmd0aCkge1xuXHRcdFx0aGlzdG9yeS5zZWFyY2ggPSBzZWFyY2hIaXN0b3J5O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGxhY2VIaXN0b3J5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0UmVwbGFjZUhpc3RvcnkoKTtcblx0XHRpZiAocmVwbGFjZUhpc3RvcnkgJiYgcmVwbGFjZUhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHRoaXN0b3J5LnJlcGxhY2UgPSByZXBsYWNlSGlzdG9yeTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuRXhjbHVkZXNIaXN0b3J5ID0gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5nZXRIaXN0b3J5KCk7XG5cdFx0aWYgKHBhdHRlcm5FeGNsdWRlc0hpc3RvcnkgJiYgcGF0dGVybkV4Y2x1ZGVzSGlzdG9yeS5sZW5ndGgpIHtcblx0XHRcdGhpc3RvcnkuZXhjbHVkZSA9IHBhdHRlcm5FeGNsdWRlc0hpc3Rvcnk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0dGVybkluY2x1ZGVzSGlzdG9yeSA9IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZ2V0SGlzdG9yeSgpO1xuXHRcdGlmIChwYXR0ZXJuSW5jbHVkZXNIaXN0b3J5ICYmIHBhdHRlcm5JbmNsdWRlc0hpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHRoaXN0b3J5LmluY2x1ZGUgPSBwYXR0ZXJuSW5jbHVkZXNIaXN0b3J5O1xuXHRcdH1cblxuXHRcdHRoaXMuc2VhcmNoSGlzdG9yeVNlcnZpY2Uuc2F2ZShoaXN0b3J5KTtcblx0fVxuXG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVGaWxlU3RhdHMoZWxlbWVudHM6IElTZWFyY2hUcmVlRmlsZU1hdGNoW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlcyA9IGVsZW1lbnRzLm1hcChmID0+IGYucmVzb2x2ZUZpbGVTdGF0KHRoaXMuZmlsZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUZpbGVTdGF0cygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGZpbGVNYXRjaCBvZiB0aGlzLnNlYXJjaFJlc3VsdC5tYXRjaGVzKCkpIHtcblx0XHRcdGZpbGVNYXRjaC5maWxlU3RhdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmaWxlTWF0Y2ggb2YgdGhpcy5zZWFyY2hSZXN1bHQubWF0Y2hlcyh0cnVlKSkge1xuXHRcdFx0ZmlsZU1hdGNoLmZpbGVTdGF0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLnNhdmVTdGF0ZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5cbmNsYXNzIFNlYXJjaExpbmtCdXR0b24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcsIGhhbmRsZXI6IChlOiBkb20uRXZlbnRMaWtlKSA9PiB1bmtub3duLCBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsIHRvb2x0aXA/OiBzdHJpbmcpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJ2EucG9pbnRlcicsIHsgdGFiaW5kZXg6IDAgfSwgbGFiZWwpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbGVtZW50LCB0b29sdGlwKSk7XG5cdFx0dGhpcy5hZGRFdmVudEhhbmRsZXJzKGhhbmRsZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRFdmVudEhhbmRsZXJzKGhhbmRsZXI6IChlOiBkb20uRXZlbnRMaWtlKSA9PiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlZEhhbmRsZXIgPSAoZTogZG9tLkV2ZW50TGlrZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgZmFsc2UpO1xuXHRcdFx0aGFuZGxlcihlKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIHdyYXBwZWRIYW5kbGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0d3JhcHBlZEhhbmRsZXIoZSk7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWRpdG9yU2VsZWN0aW9uRnJvbU1hdGNoKGVsZW1lbnQ6IEZpbGVNYXRjaE9yTWF0Y2gsIHZpZXdNb2RlbDogSVNlYXJjaE1vZGVsKSB7XG5cdGxldCBtYXRjaDogSVNlYXJjaFRyZWVNYXRjaCB8IG51bGwgPSBudWxsO1xuXHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRtYXRjaCA9IGVsZW1lbnQ7XG5cdH1cblx0aWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSAmJiBlbGVtZW50LmNvdW50KCkgPiAwKSB7XG5cdFx0bWF0Y2ggPSBlbGVtZW50Lm1hdGNoZXMoKVtlbGVtZW50Lm1hdGNoZXMoKS5sZW5ndGggLSAxXTtcblx0fVxuXHRpZiAobWF0Y2gpIHtcblx0XHRjb25zdCByYW5nZSA9IG1hdGNoLnJhbmdlKCk7XG5cdFx0aWYgKHZpZXdNb2RlbC5pc1JlcGxhY2VBY3RpdmUoKSAmJiAhIXZpZXdNb2RlbC5yZXBsYWNlU3RyaW5nKSB7XG5cdFx0XHRjb25zdCByZXBsYWNlU3RyaW5nID0gbWF0Y2gucmVwbGFjZVN0cmluZztcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbjogcmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uOiByYW5nZS5zdGFydENvbHVtbiArIHJlcGxhY2VTdHJpbmcubGVuZ3RoXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2U7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlbGVjdGlvblRleHRGcm9tRWRpdG9yKGFsbG93VW5zZWxlY3RlZFdvcmQ6IGJvb2xlYW4sIGFjdGl2ZUVkaXRvcjogSUVkaXRvcik6IHN0cmluZyB8IG51bGwge1xuXG5cdGxldCBlZGl0b3IgPSBhY3RpdmVFZGl0b3I7XG5cblx0aWYgKGlzRGlmZkVkaXRvcihlZGl0b3IpKSB7XG5cdFx0aWYgKGVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRlZGl0b3IgPSBlZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWRpdG9yID0gZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCFpc0NvZGVFZGl0b3IoZWRpdG9yKSB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0aWYgKGFsbG93VW5zZWxlY3RlZFdvcmQpIHtcblx0XHRcdGNvbnN0IHdvcmRBdFBvc2l0aW9uID0gZWRpdG9yLmdldE1vZGVsKCkuZ2V0V29yZEF0UG9zaXRpb24ocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdHJldHVybiB3b3JkQXRQb3NpdGlvbj8ud29yZCA/PyBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRsZXQgc2VhcmNoVGV4dCA9ICcnO1xuXHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBpIDw9IHJhbmdlLmVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdGxldCBsaW5lVGV4dCA9IGVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KGkpO1xuXHRcdGlmIChpID09PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRsaW5lVGV4dCA9IGxpbmVUZXh0LnN1YnN0cmluZygwLCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHR9XG5cblx0XHRpZiAoaSA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRsaW5lVGV4dCA9IGxpbmVUZXh0LnN1YnN0cmluZyhyYW5nZS5zdGFydENvbHVtbiAtIDEpO1xuXHRcdH1cblxuXHRcdGlmIChpICE9PSByYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdGxpbmVUZXh0ID0gJ1xcbicgKyBsaW5lVGV4dDtcblx0XHR9XG5cblx0XHRzZWFyY2hUZXh0ICs9IGxpbmVUZXh0O1xuXHR9XG5cblx0cmV0dXJuIHNlYXJjaFRleHQ7XG59XG5cbmNsYXNzIFNlYXJjaFZpZXdEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHNlYXJjaFZpZXc6IFNlYXJjaFZpZXcsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblxuXHRwcml2YXRlIGdldCBzZWFyY2hDb25maWcoKTogSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2VhcmNoUmVzdWx0SXRlcmF0b3Ioc2VhcmNoUmVzdWx0OiBJU2VhcmNoUmVzdWx0KTogSXRlcmFibGU8UmVuZGVyYWJsZU1hdGNoPiB7XG5cblx0XHRjb25zdCByZXQ6IElUZXh0U2VhcmNoSGVhZGluZ1tdID0gW107XG5cblx0XHRpZiAodGhpcy5zZWFyY2hWaWV3LnNob3VsZFNob3dBSVJlc3VsdHMoKSAmJiBzZWFyY2hSZXN1bHQuc2VhcmNoTW9kZWwuaGFzUGxhaW5SZXN1bHRzICYmICFzZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbikge1xuXHRcdFx0Ly8gYXMgbG9uZyBhcyB0aGVyZSBpcyBhIHF1ZXJ5IHByZXNlbnQsIHdlIGNhbiBsb2FkIEFJIHJlc3VsdHNcblx0XHRcdHJldC5wdXNoKHNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpO1xuXHRcdH1cblxuXHRcdGlmICghc2VhcmNoUmVzdWx0LnBsYWluVGV4dFNlYXJjaFJlc3VsdC5pc0VtcHR5KCkpIHtcblx0XHRcdGlmICghdGhpcy5zZWFyY2hWaWV3LnNob3VsZFNob3dBSVJlc3VsdHMoKSB8fCBzZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbikge1xuXHRcdFx0XHQvLyBvbmx5IG9uZSByb290LCBzbyBqdXN0IHJldHVybiB0aGUgY2hpbGRyZW5cblx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlVGV4dFNlYXJjaFJlc3VsdEl0ZXJhdG9yKHNlYXJjaFJlc3VsdC5wbGFpblRleHRTZWFyY2hSZXN1bHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0LnB1c2goc2VhcmNoUmVzdWx0LnBsYWluVGV4dFNlYXJjaFJlc3VsdCk7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0O1xuXG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRleHRTZWFyY2hSZXN1bHRJdGVyYXRvcih0ZXh0U2VhcmNoUmVzdWx0OiBJVGV4dFNlYXJjaEhlYWRpbmcpOiBJdGVyYWJsZTxJU2VhcmNoVHJlZUZvbGRlck1hdGNoIHwgSVNlYXJjaFRyZWVGaWxlTWF0Y2g+IHtcblx0XHRjb25zdCBmb2xkZXJNYXRjaGVzID0gdGV4dFNlYXJjaFJlc3VsdC5mb2xkZXJNYXRjaGVzKClcblx0XHRcdC5maWx0ZXIoZm0gPT4gIWZtLmlzRW1wdHkoKSlcblx0XHRcdC5zb3J0KHNlYXJjaE1hdGNoQ29tcGFyZXIpO1xuXG5cdFx0aWYgKGZvbGRlck1hdGNoZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVGb2xkZXJJdGVyYXRvcihmb2xkZXJNYXRjaGVzWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvbGRlck1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZvbGRlckl0ZXJhdG9yKGZvbGRlck1hdGNoOiBJU2VhcmNoVHJlZUZvbGRlck1hdGNoKTogSXRlcmFibGU8SVNlYXJjaFRyZWVGb2xkZXJNYXRjaCB8IElTZWFyY2hUcmVlRmlsZU1hdGNoPiB7XG5cdFx0Y29uc3QgbWF0Y2hBcnJheSA9IHRoaXMuc2VhcmNoVmlldy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSA/IGZvbGRlck1hdGNoLm1hdGNoZXMoKSA6IGZvbGRlck1hdGNoLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpO1xuXHRcdGxldCBtYXRjaGVzID0gbWF0Y2hBcnJheTtcblx0XHRpZiAoIShmb2xkZXJNYXRjaCBpbnN0YW5jZW9mIEFJRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290SW1wbCkpIHtcblx0XHRcdG1hdGNoZXMgPSBtYXRjaEFycmF5LnNvcnQoKGEsIGIpID0+IHNlYXJjaE1hdGNoQ29tcGFyZXIoYSwgYiwgdGhpcy5zZWFyY2hDb25maWcuc29ydE9yZGVyKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZpbGVJdGVyYXRvcihmaWxlTWF0Y2g6IElTZWFyY2hUcmVlRmlsZU1hdGNoKTogSXRlcmFibGU8SVNlYXJjaFRyZWVNYXRjaD4ge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBmaWxlTWF0Y2gubWF0Y2hlcygpLnNvcnQoc2VhcmNoTWF0Y2hDb21wYXJlcik7XG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2gpOiBib29sZWFuIHtcblx0XHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlbGVtZW50KSAmJiBlbGVtZW50LmlzQUlDb250cmlidXRlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQ2hpbGRyZW4gPSBlbGVtZW50Lmhhc0NoaWxkcmVuO1xuXHRcdHJldHVybiBoYXNDaGlsZHJlbjtcblx0fVxuXG5cdGdldENoaWxkcmVuKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCB8IElTZWFyY2hSZXN1bHQpOiBJdGVyYWJsZTxSZW5kZXJhYmxlTWF0Y2g+IHwgUHJvbWlzZTxJdGVyYWJsZTxSZW5kZXJhYmxlTWF0Y2g+PiB7XG5cdFx0aWYgKGlzU2VhcmNoUmVzdWx0KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTZWFyY2hSZXN1bHRJdGVyYXRvcihlbGVtZW50KTtcblx0XHR9IGVsc2UgaWYgKGlzVGV4dFNlYXJjaEhlYWRpbmcoZWxlbWVudCkpIHtcblx0XHRcdGlmIChlbGVtZW50LmlzQUlDb250cmlidXRlZCAmJiAoIXRoaXMuc2VhcmNoVmlldy5tb2RlbC5oYXNBSVJlc3VsdHMgfHwgISF0aGlzLnNlYXJjaFZpZXcuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2UpKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNlYXJjaFZpZXcuY2FjaGVkUmVzdWx0cykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZVRleHRTZWFyY2hSZXN1bHRJdGVyYXRvcihlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnNlYXJjaFZpZXcuYWRkQUlSZXN1bHRzKCk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJdGVyYWJsZTxSZW5kZXJhYmxlTWF0Y2g+PihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gZWxlbWVudC5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTsgLy8gQ2xlYW4gdXAgbGlzdGVuZXIgYWZ0ZXIgZmlyc3QgcmVzdWx0XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHRoaXMuY3JlYXRlVGV4dFNlYXJjaFJlc3VsdEl0ZXJhdG9yKGVsZW1lbnQpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVUZXh0U2VhcmNoUmVzdWx0SXRlcmF0b3IoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRm9sZGVySXRlcmF0b3IoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUZpbGVJdGVyYXRvcihlbGVtZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cblx0fVxuXHRnZXRQYXJlbnQoZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKTogUmVuZGVyYWJsZU1hdGNoIHtcblx0XHRjb25zdCBwYXJlbnQgPSBlbGVtZW50LnBhcmVudCgpO1xuXHRcdGlmIChpc1NlYXJjaFJlc3VsdChwYXJlbnQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZWxlbWVudCBwYXNzZWQgdG8gZ2V0UGFyZW50Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJlbnQ7XG5cdH1cbn1cblxuY2xhc3MgUmVmcmVzaFRyZWVDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWZyZXNoVHJlZVRocm90dGxlcjogVGhyb3R0bGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoVmlldzogU2VhcmNoVmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdlU2VhcmNoQ29uZmlnOiAoKSA9PiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWZyZXNoVHJlZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cdH1cblxuXHRwcml2YXRlIHF1ZXVlZElDaGFuZ2VFdmVudHM6IElDaGFuZ2VFdmVudFtdID0gW107XG5cblx0cHVibGljIGNsZWFyQWxsUGVuZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLmNhbmNlbEFsbFJlZnJlc2hQcm9taXNlcyh0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBxdWV1ZShlPzogSUNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGUpIHtcblx0XHRcdHRoaXMucXVldWVkSUNoYW5nZUV2ZW50cy5wdXNoKGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoVHJlZVRocm90dGxlci5xdWV1ZSh0aGlzLnJlZnJlc2hUcmVlVXNpbmdRdWV1ZS5iaW5kKHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaFRyZWVVc2luZ1F1ZXVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZ3JlZ2F0ZUNoYW5nZUV2ZW50OiBJQ2hhbmdlRXZlbnQgfCB1bmRlZmluZWQgPSB0aGlzLnF1ZXVlZElDaGFuZ2VFdmVudHMubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0ZWxlbWVudHM6IHRoaXMucXVldWVkSUNoYW5nZUV2ZW50cy5tYXAoZSA9PiBlLmVsZW1lbnRzKS5mbGF0KCksXG5cdFx0XHRhZGRlZDogdGhpcy5xdWV1ZWRJQ2hhbmdlRXZlbnRzLnNvbWUoZSA9PiBlLmFkZGVkKSxcblx0XHRcdHJlbW92ZWQ6IHRoaXMucXVldWVkSUNoYW5nZUV2ZW50cy5zb21lKGUgPT4gZS5yZW1vdmVkKSxcblx0XHRcdGNsZWFyaW5nQWxsOiB0aGlzLnF1ZXVlZElDaGFuZ2VFdmVudHMuc29tZShlID0+IGUuY2xlYXJpbmdBbGwpLFxuXHRcdH07XG5cdFx0dGhpcy5xdWV1ZWRJQ2hhbmdlRXZlbnRzID0gW107XG5cdFx0cmV0dXJuIHRoaXMucmVmcmVzaFRyZWUoYWdncmVnYXRlQ2hhbmdlRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXRyaWV2ZUZpbGVTdGF0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlcyA9IHRoaXMuc2VhcmNoVmlldy5tb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpLmZpbHRlcihmID0+ICFmLmZpbGVTdGF0KS5tYXAoZiA9PiBmLnJlc29sdmVGaWxlU3RhdCh0aGlzLmZpbGVTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoVHJlZShldmVudD86IElDaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlYXJjaENvbmZpZyA9IHRoaXMuZ2VTZWFyY2hDb25maWcoKTtcblx0XHRpZiAoIWV2ZW50IHx8IGV2ZW50LmFkZGVkIHx8IGV2ZW50LnJlbW92ZWQpIHtcblx0XHRcdC8vIFJlZnJlc2ggd2hvbGUgdHJlZVxuXHRcdFx0aWYgKHNlYXJjaENvbmZpZy5zb3J0T3JkZXIgPT09IFNlYXJjaFNvcnRPcmRlci5Nb2RpZmllZCkge1xuXHRcdFx0XHQvLyBFbnN1cmUgYWxsIG1hdGNoZXMgaGF2ZSByZXRyaWV2ZWQgdGhlaXIgZmlsZSBzdGF0XG5cdFx0XHRcdGF3YWl0IHRoaXMucmV0cmlldmVGaWxlU3RhdHMoKVxuXHRcdFx0XHRcdC50aGVuKCgpID0+IHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkudXBkYXRlQ2hpbGRyZW4odW5kZWZpbmVkKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIElmIHVwZGF0ZWQgY291bnRzIGFmZmVjdCBvdXIgc2VhcmNoIG9yZGVyLCByZS1zb3J0IHRoZSB2aWV3LlxuXHRcdFx0aWYgKHNlYXJjaENvbmZpZy5zb3J0T3JkZXIgPT09IFNlYXJjaFNvcnRPcmRlci5Db3VudEFzY2VuZGluZyB8fFxuXHRcdFx0XHRzZWFyY2hDb25maWcuc29ydE9yZGVyID09PSBTZWFyY2hTb3J0T3JkZXIuQ291bnREZXNjZW5kaW5nKSB7XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdHJlZUhhc0FsbEVsZW1lbnRzID0gZXZlbnQuZWxlbWVudHMuZXZlcnkoZWxlbSA9PiB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLmhhc05vZGUoZWxlbSkpO1xuXHRcdFx0XHRpZiAodHJlZUhhc0FsbEVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0Ly8gSUZpbGVNYXRjaEluc3RhbmNlIG1vZGlmaWVkLCByZWZyZXNoIHRob3NlIGVsZW1lbnRzXG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXZlbnQuZWxlbWVudHMubWFwKGFzeW5jIGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKS51cGRhdGVDaGlsZHJlbihlbGVtZW50KTtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkucmVyZW5kZXIoZWxlbWVudCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkudXBkYXRlQ2hpbGRyZW4odW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQWtELHNDQUFzQztBQUN4RixTQUFTLFNBQVMsa0JBQWtCLGlCQUFpQjtBQUNyRCxZQUFZLFlBQVk7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FB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
