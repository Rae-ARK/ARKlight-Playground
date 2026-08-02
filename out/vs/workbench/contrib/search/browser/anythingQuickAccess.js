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
import "./media/anythingQuickAccess.css";
import { quickPickItemScorerAccessor, QuickPickItemScorerAccessor, QuickInputHideReason, IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { prepareQuery, compareItemsByFuzzyScore, scoreItemFuzzy } from "../../../../base/common/fuzzyScorer.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getOutOfWorkspaceEditorResources, extractRangeFromFilter } from "../common/search.js";
import { ISearchService } from "../../../services/search/common/search.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { untildify } from "../../../../base/common/labels.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { URI } from "../../../../base/common/uri.js";
import { toLocalResource, dirname, basenameOrAuthority } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { DisposableStore, toDisposable, MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorResourceAccessor, isEditorInput } from "../../../common/editor.js";
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { top } from "../../../../base/common/arrays.js";
import { FileQueryCacheState } from "../common/cacheState.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { Schemas } from "../../../../base/common/network.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { SymbolsQuickAccessProvider } from "./symbolsQuickAccess.js";
import { DefaultQuickAccessFilterValue, Extensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { PickerEditorState } from "../../../browser/quickaccess.js";
import { GotoSymbolQuickAccessProvider } from "../../codeEditor/browser/quickaccess/gotoSymbolQuickAccess.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Event } from "../../../../base/common/event.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ASK_QUICK_QUESTION_ACTION_ID } from "../../chat/browser/actions/chatQuickInputActions.js";
import { IChatWidgetService, IQuickChatService } from "../../chat/browser/chat.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
function isEditorSymbolQuickPickItem(pick) {
  const candidate = pick;
  return !!candidate?.range && !!candidate.resource;
}
let AnythingQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(instantiationService, searchService, contextService, pathService, environmentService, fileService, labelService, modelService, languageService, workingCopyService, configurationService, editorService, historyService, filesConfigurationService, textModelService, uriIdentityService, quickInputService, keybindingService, contextKeyService, quickChatService, logService, customEditorLabelService, chatWidgetService) {
    super(AnythingQuickAccessProvider.PREFIX, {
      canAcceptInBackground: true,
      noResultsPick: AnythingQuickAccessProvider.NO_RESULTS_PICK
    });
    this.instantiationService = instantiationService;
    this.searchService = searchService;
    this.contextService = contextService;
    this.pathService = pathService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.workingCopyService = workingCopyService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.historyService = historyService;
    this.filesConfigurationService = filesConfigurationService;
    this.textModelService = textModelService;
    this.uriIdentityService = uriIdentityService;
    this.quickInputService = quickInputService;
    this.keybindingService = keybindingService;
    this.contextKeyService = contextKeyService;
    this.quickChatService = quickChatService;
    this.logService = logService;
    this.customEditorLabelService = customEditorLabelService;
    this.chatWidgetService = chatWidgetService;
    //#region Editor History
    this.labelOnlyEditorHistoryPickAccessor = new QuickPickItemScorerAccessor({ skipDescription: true });
    //#endregion
    //#region File Search
    this.fileQueryDelayer = this._register(new ThrottledDelayer(AnythingQuickAccessProvider.TYPING_SEARCH_DELAY));
    //#endregion
    //#region Command Center (if enabled)
    this.lazyRegistry = new Lazy(() => Registry.as(Extensions.Quickaccess));
    this.pickState = this._register(new class extends Disposable {
      constructor(provider, instantiationService2) {
        super();
        this.provider = provider;
        this.picker = void 0;
        this.scorerCache = /* @__PURE__ */ Object.create(null);
        this.fileQueryCache = void 0;
        this.lastOriginalFilter = void 0;
        this.lastFilter = void 0;
        this.lastRange = void 0;
        this.lastGlobalPicks = void 0;
        this.isQuickNavigating = void 0;
        this.editorViewState = this._register(instantiationService2.createInstance(PickerEditorState));
      }
      set(picker) {
        this.picker = picker;
        Event.once(picker.onDispose)(() => {
          if (picker === this.picker) {
            this.picker = void 0;
          }
        });
        const isQuickNavigating = !!picker.quickNavigate;
        if (!isQuickNavigating) {
          this.fileQueryCache = this.provider.createFileQueryCache();
          this.scorerCache = /* @__PURE__ */ Object.create(null);
        }
        this.isQuickNavigating = isQuickNavigating;
        this.lastOriginalFilter = void 0;
        this.lastFilter = void 0;
        this.lastRange = void 0;
        this.lastGlobalPicks = void 0;
        this.editorViewState.reset();
      }
    }(this, instantiationService));
    this.fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);
    this.workspaceSymbolsQuickAccess = this._register(instantiationService.createInstance(SymbolsQuickAccessProvider));
    this.editorSymbolsQuickAccess = this.instantiationService.createInstance(GotoSymbolQuickAccessProvider);
  }
  get defaultFilterValue() {
    if (this.configuration.preserveInput) {
      return DefaultQuickAccessFilterValue.LAST;
    }
    return void 0;
  }
  get configuration() {
    const editorConfig = this.configurationService.getValue().workbench?.editor;
    const searchConfig = this.configurationService.getValue().search;
    const quickAccessConfig = this.configurationService.getValue().workbench.quickOpen;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      openSideBySideDirection: editorConfig?.openSideBySideDirection,
      includeSymbols: searchConfig?.quickOpen?.includeSymbols,
      includeHistory: searchConfig?.quickOpen?.includeHistory ?? true,
      historyFilterSortOrder: searchConfig?.quickOpen?.history?.filterSortOrder,
      preserveInput: quickAccessConfig?.preserveInput
    };
  }
  provide(picker, token, runOptions) {
    const disposables = new DisposableStore();
    this.pickState.set(picker);
    const editorDecorationsDisposable = disposables.add(new MutableDisposable());
    disposables.add(picker.onDidChangeActive(() => {
      editorDecorationsDisposable.value = void 0;
      const [item] = picker.activeItems;
      if (isEditorSymbolQuickPickItem(item)) {
        editorDecorationsDisposable.value = this.decorateAndRevealSymbolRange(item);
      }
    }));
    disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
      if (reason === QuickInputHideReason.Gesture) {
        this.pickState.editorViewState.restore();
      }
    }));
    disposables.add(super.provide(picker, token, runOptions));
    return disposables;
  }
  decorateAndRevealSymbolRange(pick) {
    const activeEditor = this.editorService.activeEditor;
    if (!this.uriIdentityService.extUri.isEqual(pick.resource, activeEditor?.resource)) {
      return Disposable.None;
    }
    const activeEditorControl = this.editorService.activeTextEditorControl;
    if (!activeEditorControl) {
      return Disposable.None;
    }
    this.pickState.editorViewState.set();
    activeEditorControl.revealRangeInCenter(pick.range.selection, ScrollType.Smooth);
    this.addDecorations(activeEditorControl, pick.range.decoration);
    return toDisposable(() => this.clearDecorations(activeEditorControl));
  }
  _getPicks(originalFilter, disposables, token, runOptions) {
    const filterWithRange = extractRangeFromFilter(originalFilter, [GotoSymbolQuickAccessProvider.PREFIX]);
    let filter;
    if (filterWithRange) {
      filter = filterWithRange.filter;
    } else {
      filter = originalFilter;
    }
    this.pickState.lastRange = filterWithRange?.range;
    if (originalFilter !== this.pickState.lastOriginalFilter && filter === this.pickState.lastFilter) {
      return null;
    }
    const lastWasFiltering = !!this.pickState.lastOriginalFilter;
    this.pickState.lastOriginalFilter = originalFilter;
    this.pickState.lastFilter = filter;
    const picks = this.pickState.picker?.items;
    const activePick = this.pickState.picker?.activeItems[0];
    if (picks && activePick) {
      const activePickIsEditorSymbol = isEditorSymbolQuickPickItem(activePick);
      const activePickIsNoResultsInEditorSymbols = activePick === AnythingQuickAccessProvider.NO_RESULTS_PICK && filter.indexOf(GotoSymbolQuickAccessProvider.PREFIX) >= 0;
      if (!activePickIsEditorSymbol && !activePickIsNoResultsInEditorSymbols) {
        this.pickState.lastGlobalPicks = {
          items: picks,
          active: activePick
        };
      }
    }
    return this.doGetPicks(
      filter,
      {
        ...runOptions,
        enableEditorSymbolSearch: lastWasFiltering
      },
      disposables,
      token
    );
  }
  doGetPicks(filter, options, disposables, token) {
    const query = prepareQuery(filter);
    if (options.enableEditorSymbolSearch) {
      const editorSymbolPicks = this.getEditorSymbolPicks(query, disposables, token);
      if (editorSymbolPicks) {
        return editorSymbolPicks;
      }
    }
    const activePick = this.pickState.picker?.activeItems[0];
    if (isEditorSymbolQuickPickItem(activePick) && this.pickState.lastGlobalPicks) {
      return this.pickState.lastGlobalPicks;
    }
    const historyEditorPicks = this.getEditorHistoryPicks(query);
    let picks = new Array();
    if (options.additionPicks) {
      for (const pick of options.additionPicks) {
        if (pick.type === "separator") {
          picks.push(pick);
          continue;
        }
        if (!query.original) {
          pick.highlights = void 0;
          picks.push(pick);
          continue;
        }
        const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(pick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
        if (!score) {
          continue;
        }
        pick.highlights = {
          label: labelMatch,
          description: descriptionMatch
        };
        picks.push(pick);
      }
    }
    if (this.pickState.isQuickNavigating) {
      if (picks.length > 0) {
        picks.push({ type: "separator", label: localize("recentlyOpenedSeparator", "recently opened") });
      }
      picks = historyEditorPicks;
    } else {
      if (options.includeHelp) {
        picks.push(...this.getHelpPicks(query, token, options));
      }
      if (historyEditorPicks.length !== 0) {
        picks.push({ type: "separator", label: localize("recentlyOpenedSeparator", "recently opened") });
        picks.push(...historyEditorPicks);
      }
    }
    return {
      // Fast picks: help (if included) & editor history
      picks: options.filter ? picks.filter((p) => options.filter?.(p)) : picks,
      // Slow picks: files and symbols
      additionalPicks: (async () => {
        const additionalPicksExcludes = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
        for (const historyEditorPick of historyEditorPicks) {
          if (historyEditorPick.resource) {
            additionalPicksExcludes.set(historyEditorPick.resource, true);
          }
        }
        let additionalPicks = await this.getAdditionalPicks(query, additionalPicksExcludes, Boolean(this.configuration?.includeSymbols), token);
        if (options.filter) {
          additionalPicks = additionalPicks.filter((p) => options.filter?.(p));
        }
        if (token.isCancellationRequested) {
          return [];
        }
        return additionalPicks.length > 0 ? [
          { type: "separator", label: this.configuration.includeSymbols ? localize("fileAndSymbolResultsSeparator", "file and symbol results") : localize("fileResultsSeparator", "file results") },
          ...additionalPicks
        ] : [];
      })(),
      // allow some time to merge files and symbols to reduce flickering
      mergeDelay: AnythingQuickAccessProvider.SYMBOL_PICKS_MERGE_DELAY
    };
  }
  async getAdditionalPicks(query, excludes, includeSymbols, token) {
    const [filePicks, symbolPicks] = await Promise.all([
      this.getFilePicks(query, excludes, token),
      this.getWorkspaceSymbolPicks(query, includeSymbols, token)
    ]);
    if (token.isCancellationRequested) {
      return [];
    }
    const sortedAnythingPicks = top(
      [...filePicks, ...symbolPicks],
      (anyPickA, anyPickB) => compareItemsByFuzzyScore(anyPickA, anyPickB, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache),
      AnythingQuickAccessProvider.MAX_RESULTS
    );
    const filteredAnythingPicks = [];
    for (const anythingPick of sortedAnythingPicks) {
      if (anythingPick.highlights) {
        filteredAnythingPicks.push(anythingPick);
      } else {
        const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(anythingPick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
        if (!score) {
          continue;
        }
        anythingPick.highlights = {
          label: labelMatch,
          description: descriptionMatch
        };
        filteredAnythingPicks.push(anythingPick);
      }
    }
    return filteredAnythingPicks;
  }
  getEditorHistoryPicks(query) {
    const configuration = this.configuration;
    if (!query.normalized) {
      return this.historyService.getHistory().map((editor) => this.createAnythingPick(editor, configuration));
    }
    if (!this.configuration.includeHistory) {
      return [];
    }
    const editorHistoryScorerAccessor = query.containsPathSeparator ? quickPickItemScorerAccessor : this.labelOnlyEditorHistoryPickAccessor;
    const editorHistoryPicks = [];
    for (const editor of this.historyService.getHistory()) {
      const resource = editor.resource;
      if (!resource) {
        continue;
      }
      const editorHistoryPick = this.createAnythingPick(editor, configuration);
      const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(editorHistoryPick, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache);
      if (!score) {
        continue;
      }
      editorHistoryPick.highlights = {
        label: labelMatch,
        description: descriptionMatch
      };
      editorHistoryPicks.push(editorHistoryPick);
    }
    if (this.configuration.historyFilterSortOrder === "recency") {
      return editorHistoryPicks;
    }
    return editorHistoryPicks.sort((editorA, editorB) => compareItemsByFuzzyScore(editorA, editorB, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache));
  }
  createFileQueryCache() {
    return new FileQueryCacheState(
      (cacheKey) => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })),
      (query) => this.searchService.fileSearch(query),
      (cacheKey) => this.searchService.clearCache(cacheKey),
      this.pickState.fileQueryCache
    ).load();
  }
  async getFilePicks(query, excludes, token) {
    if (!query.normalized) {
      return [];
    }
    const absolutePathResult = await this.getAbsolutePathFileResult(query, token);
    if (token.isCancellationRequested) {
      return [];
    }
    let fileMatches;
    if (absolutePathResult) {
      if (excludes.has(absolutePathResult)) {
        return [];
      }
      const absolutePathPick = this.createAnythingPick(absolutePathResult, this.configuration);
      absolutePathPick.highlights = {
        label: [{ start: 0, end: absolutePathPick.label.length }],
        description: absolutePathPick.description ? [{ start: 0, end: absolutePathPick.description.length }] : void 0
      };
      return [absolutePathPick];
    }
    if (this.pickState.fileQueryCache?.isLoaded) {
      fileMatches = await this.doFileSearch(query, token);
    } else {
      fileMatches = await this.fileQueryDelayer.trigger(async () => {
        if (token.isCancellationRequested) {
          return [];
        }
        return this.doFileSearch(query, token);
      });
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const configuration = this.configuration;
    return fileMatches.filter((resource) => !excludes.has(resource)).map((resource) => this.createAnythingPick(resource, configuration));
  }
  async doFileSearch(query, token) {
    const [fileSearchResults, relativePathFileResults] = await Promise.all([
      // File search: this is a search over all files of the workspace using the provided pattern
      this.getFileSearchResults(query, token),
      // Relative path search: we also want to consider results that match files inside the workspace
      // by looking for relative paths that the user typed as query. This allows to return even excluded
      // results into the picker if found (e.g. helps for opening compilation results that are otherwise
      // excluded)
      this.getRelativePathFileResults(query, token)
    ]);
    if (token.isCancellationRequested) {
      return [];
    }
    if (!relativePathFileResults) {
      return fileSearchResults;
    }
    const relativePathFileResultsMap = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    for (const relativePathFileResult of relativePathFileResults) {
      relativePathFileResultsMap.set(relativePathFileResult, true);
    }
    return [
      ...fileSearchResults.filter((result) => !relativePathFileResultsMap.has(result)),
      ...relativePathFileResults
    ];
  }
  async getFileSearchResults(query, token) {
    let filePattern = "";
    if (query.values && query.values.length > 1) {
      filePattern = query.values[0].original;
    } else {
      filePattern = query.original;
    }
    const fileSearchResults = await this.doGetFileSearchResults(filePattern, token);
    if (token.isCancellationRequested) {
      return [];
    }
    if (fileSearchResults.limitHit && query.values && query.values.length > 1) {
      const additionalFileSearchResults = await this.doGetFileSearchResults(query.original, token);
      if (token.isCancellationRequested) {
        return [];
      }
      const existingFileSearchResultsMap = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
      for (const fileSearchResult of fileSearchResults.results) {
        existingFileSearchResultsMap.set(fileSearchResult.resource, true);
      }
      for (const additionalFileSearchResult of additionalFileSearchResults.results) {
        if (!existingFileSearchResultsMap.has(additionalFileSearchResult.resource)) {
          fileSearchResults.results.push(additionalFileSearchResult);
        }
      }
    }
    return fileSearchResults.results.map((result) => result.resource);
  }
  doGetFileSearchResults(filePattern, token) {
    const start = Date.now();
    return this.searchService.fileSearch(
      this.fileQueryBuilder.file(
        this.contextService.getWorkspace().folders,
        this.getFileQueryOptions({
          filePattern,
          cacheKey: this.pickState.fileQueryCache?.cacheKey,
          maxResults: AnythingQuickAccessProvider.MAX_RESULTS
        })
      ),
      token
    ).finally(() => {
      this.logService.trace(`QuickAccess fileSearch ${Date.now() - start}ms`);
    });
  }
  getFileQueryOptions(input) {
    return {
      _reason: "openFileHandler",
      // used for telemetry - do not change
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      filePattern: input.filePattern || "",
      cacheKey: input.cacheKey,
      maxResults: input.maxResults || 0,
      sortByScore: true
    };
  }
  async getAbsolutePathFileResult(query, token) {
    if (!query.containsPathSeparator) {
      return;
    }
    const userHome = await this.pathService.userHome();
    const detildifiedQuery = untildify(query.original, userHome.scheme === Schemas.file ? userHome.fsPath : userHome.path);
    if (token.isCancellationRequested) {
      return;
    }
    const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(detildifiedQuery);
    if (token.isCancellationRequested) {
      return;
    }
    if (isAbsolutePathQuery) {
      const resource = toLocalResource(
        await this.pathService.fileURI(detildifiedQuery),
        this.environmentService.remoteAuthority,
        this.pathService.defaultUriScheme
      );
      if (token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.stat(resource);
        if (stat.isFile) {
          return await this.matchFilenameCasing(resource);
        }
      } catch (error) {
      }
    }
    return;
  }
  async getRelativePathFileResults(query, token) {
    if (!query.containsPathSeparator) {
      return;
    }
    const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(query.original);
    if (!isAbsolutePathQuery) {
      const resources = [];
      for (const folder of this.contextService.getWorkspace().folders) {
        if (token.isCancellationRequested) {
          break;
        }
        const resource = toLocalResource(
          folder.toResource(query.original),
          this.environmentService.remoteAuthority,
          this.pathService.defaultUriScheme
        );
        try {
          const stat = await this.fileService.stat(resource);
          if (stat.isFile) {
            resources.push(await this.matchFilenameCasing(resource));
          }
        } catch (error) {
        }
      }
      return resources;
    }
    return;
  }
  /**
   * Attempts to match the filename casing to file system by checking the parent folder's children.
   */
  async matchFilenameCasing(resource) {
    const parent = dirname(resource);
    const stat = await this.fileService.resolve(parent, { resolveTo: [resource] });
    if (stat?.children) {
      const match = stat.children.find((child) => this.uriIdentityService.extUri.isEqual(child.resource, resource));
      if (match) {
        return URI.joinPath(parent, match.name);
      }
    }
    return resource;
  }
  getHelpPicks(query, token, runOptions) {
    if (query.normalized) {
      return [];
    }
    const providers = this.lazyRegistry.value.getQuickAccessProviders(this.contextKeyService).filter((p) => p.helpEntries.some((h) => h.commandCenterOrder !== void 0)).flatMap((provider) => provider.helpEntries.filter((h) => h.commandCenterOrder !== void 0).map((helpEntry) => {
      const providerSpecificOptions = {
        ...runOptions,
        includeHelp: provider.prefix === AnythingQuickAccessProvider.PREFIX ? false : runOptions?.includeHelp
      };
      const label = helpEntry.commandCenterLabel ?? helpEntry.description;
      return {
        label,
        description: helpEntry.prefix ?? provider.prefix,
        commandCenterOrder: helpEntry.commandCenterOrder,
        keybinding: helpEntry.commandId ? this.keybindingService.lookupKeybinding(helpEntry.commandId) : void 0,
        ariaLabel: localize("helpPickAriaLabel", "{0}, {1}", label, helpEntry.description),
        accept: () => {
          this.quickInputService.quickAccess.show(provider.prefix, {
            preserveValue: true,
            providerOptions: providerSpecificOptions
          });
        }
      };
    }));
    if (this.quickChatService.enabled) {
      providers.push({
        label: localize("chat", "Open Quick Chat"),
        commandCenterOrder: 30,
        keybinding: this.keybindingService.lookupKeybinding(ASK_QUICK_QUESTION_ACTION_ID),
        accept: () => this.quickChatService.toggle()
      });
    }
    return providers.sort((a, b) => a.commandCenterOrder - b.commandCenterOrder);
  }
  async getWorkspaceSymbolPicks(query, includeSymbols, token) {
    if (!query.normalized || // we need a value for search for
    !includeSymbols || // we need to enable symbols in search
    this.pickState.lastRange) {
      return [];
    }
    return this.workspaceSymbolsQuickAccess.getSymbolPicks(query.original, {
      skipLocal: true,
      skipSorting: true,
      delay: AnythingQuickAccessProvider.TYPING_SEARCH_DELAY
    }, token);
  }
  getEditorSymbolPicks(query, disposables, token) {
    const filterSegments = query.original.split(GotoSymbolQuickAccessProvider.PREFIX);
    const filter = filterSegments.length > 1 ? filterSegments[filterSegments.length - 1].trim() : void 0;
    if (typeof filter !== "string") {
      return null;
    }
    const activeGlobalPick = this.pickState.lastGlobalPicks?.active;
    if (!activeGlobalPick) {
      return null;
    }
    const activeGlobalResource = activeGlobalPick.resource;
    if (!activeGlobalResource || !this.fileService.hasProvider(activeGlobalResource) && activeGlobalResource.scheme !== Schemas.untitled) {
      return null;
    }
    if (activeGlobalPick.label.includes(GotoSymbolQuickAccessProvider.PREFIX) || activeGlobalPick.description?.includes(GotoSymbolQuickAccessProvider.PREFIX)) {
      if (filterSegments.length < 3) {
        return null;
      }
    }
    return this.doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token);
  }
  async doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token) {
    try {
      this.pickState.editorViewState.set();
      await this.pickState.editorViewState.openTransientEditor({
        resource: activeGlobalResource,
        options: { preserveFocus: true, revealIfOpened: true, ignoreError: true }
      });
    } catch (error) {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    let model = this.modelService.getModel(activeGlobalResource);
    if (!model) {
      try {
        const modelReference = disposables.add(await this.textModelService.createModelReference(activeGlobalResource));
        if (token.isCancellationRequested) {
          return [];
        }
        model = modelReference.object.textEditorModel;
      } catch (error) {
        return [];
      }
    }
    const editorSymbolPicks = await this.editorSymbolsQuickAccess.getSymbolPicks(model, filter, { extraContainerLabel: stripIcons(activeGlobalPick.label) }, disposables, token);
    if (token.isCancellationRequested) {
      return [];
    }
    return editorSymbolPicks.map((editorSymbolPick) => {
      if (editorSymbolPick.type === "separator") {
        return editorSymbolPick;
      }
      return {
        ...editorSymbolPick,
        resource: activeGlobalResource,
        description: editorSymbolPick.description,
        trigger: (buttonIndex, keyMods) => {
          this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, forceOpenSideBySide: true });
          return TriggerAction.CLOSE_PICKER;
        },
        accept: (keyMods, event) => this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, preserveFocus: event.inBackground, forcePinned: event.inBackground })
      };
    });
  }
  addDecorations(editor, range) {
    this.editorSymbolsQuickAccess.addDecorations(editor, range);
  }
  clearDecorations(editor) {
    this.editorSymbolsQuickAccess.clearDecorations(editor);
  }
  //#endregion
  //#region Helpers
  createAnythingPick(resourceOrEditor, configuration) {
    const isEditorHistoryEntry = !URI.isUri(resourceOrEditor);
    let resource;
    let label;
    let description = void 0;
    let isDirty = void 0;
    let extraClasses;
    let icon = void 0;
    if (isEditorInput(resourceOrEditor)) {
      resource = EditorResourceAccessor.getOriginalUri(resourceOrEditor);
      label = resourceOrEditor.getName();
      description = resourceOrEditor.getDescription();
      isDirty = resourceOrEditor.isDirty() && !resourceOrEditor.isSaving();
      extraClasses = resourceOrEditor.getLabelExtraClasses();
      icon = resourceOrEditor.getIcon();
    } else {
      resource = URI.isUri(resourceOrEditor) ? resourceOrEditor : resourceOrEditor.resource;
      const customLabel = this.customEditorLabelService.getName(resource);
      label = customLabel || basenameOrAuthority(resource);
      description = this.labelService.getUriLabel(!!customLabel ? resource : dirname(resource), { relative: true });
      isDirty = this.workingCopyService.isDirty(resource) && !this.filesConfigurationService.hasShortAutoSaveDelay(resource);
      extraClasses = [];
    }
    const labelAndDescription = description ? `${label} ${description}` : label;
    const iconClassesValue = new Lazy(() => getIconClasses(this.modelService, this.languageService, resource, void 0, icon).concat(extraClasses));
    const buttonsValue = new Lazy(() => {
      const openSideBySideDirection = configuration.openSideBySideDirection;
      const buttons = [];
      buttons.push({
        iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
        tooltip: openSideBySideDirection === "right" ? localize({ key: "openToSide", comment: ["Open this file in a split editor on the left/right side"] }, "Open to the Side") : localize({ key: "openToBottom", comment: ["Open this file in a split editor on the bottom"] }, "Open to the Bottom")
      });
      if (isEditorHistoryEntry) {
        buttons.push({
          iconClass: isDirty ? "dirty-anything " + ThemeIcon.asClassName(Codicon.circleFilled) : ThemeIcon.asClassName(Codicon.close),
          tooltip: localize("closeEditor", "Remove from Recently Opened"),
          alwaysVisible: isDirty
        });
      }
      return buttons;
    });
    return {
      resource,
      label,
      ariaLabel: isDirty ? localize("filePickAriaLabelDirty", "{0} unsaved changes", labelAndDescription) : labelAndDescription,
      description,
      iconPath: URI.isUri(icon) ? { dark: icon } : void 0,
      get iconClasses() {
        return iconClassesValue.value;
      },
      get buttons() {
        return buttonsValue.value;
      },
      trigger: (buttonIndex, keyMods) => {
        switch (buttonIndex) {
          // Open to side / below
          case 0:
            this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, forceOpenSideBySide: true });
            return TriggerAction.CLOSE_PICKER;
          // Remove from History
          case 1:
            if (!URI.isUri(resourceOrEditor)) {
              this.historyService.removeFromHistory(resourceOrEditor);
              return TriggerAction.REMOVE_ITEM;
            }
        }
        return TriggerAction.NO_ACTION;
      },
      accept: (keyMods, event) => this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
      attach: (keyMods, event) => {
        if (keyMods.shift) {
          const widget = this.chatWidgetService.lastFocusedWidget;
          if (widget && resource) {
            widget.attachmentModel.addContext(widget.attachmentModel.asFileVariableEntry(resource));
          }
          return;
        }
        this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground });
      }
    };
  }
  async openAnything(resourceOrEditor, options) {
    const editorOptions = {
      preserveFocus: options.preserveFocus,
      pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
      selection: options.range
    };
    const targetGroup = options.keyMods?.alt || this.configuration.openEditorPinned && options.keyMods?.ctrlCmd || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    if (targetGroup === SIDE_GROUP) {
      await this.pickState.editorViewState.restore();
    }
    if (isEditorInput(resourceOrEditor)) {
      await this.editorService.openEditor(resourceOrEditor, editorOptions, targetGroup);
    } else {
      let resourceEditorInput;
      if (URI.isUri(resourceOrEditor)) {
        resourceEditorInput = {
          resource: resourceOrEditor,
          options: editorOptions
        };
      } else {
        resourceEditorInput = {
          ...resourceOrEditor,
          options: {
            ...resourceOrEditor.options,
            ...editorOptions
          }
        };
      }
      await this.editorService.openEditor(resourceEditorInput, targetGroup);
    }
  }
  //#endregion
};
AnythingQuickAccessProvider.PREFIX = "";
AnythingQuickAccessProvider.NO_RESULTS_PICK = {
  label: localize("noAnythingResults", "No matching results")
};
AnythingQuickAccessProvider.MAX_RESULTS = 512;
AnythingQuickAccessProvider.TYPING_SEARCH_DELAY = 200;
// this delay accommodates for the user typing a word and then stops typing to start searching
AnythingQuickAccessProvider.SYMBOL_PICKS_MERGE_DELAY = 200;
AnythingQuickAccessProvider = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ISearchService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IPathService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IHistoryService),
  __decorateParam(13, IFilesConfigurationService),
  __decorateParam(14, ITextModelService),
  __decorateParam(15, IUriIdentityService),
  __decorateParam(16, IQuickInputService),
  __decorateParam(17, IKeybindingService),
  __decorateParam(18, IContextKeyService),
  __decorateParam(19, IQuickChatService),
  __decorateParam(20, ILogService),
  __decorateParam(21, ICustomEditorLabelService),
  __decorateParam(22, IChatWidgetService)
], AnythingQuickAccessProvider);
export {
  AnythingQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL2FueXRoaW5nUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYW55dGhpbmdRdWlja0FjY2Vzcy5jc3MnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElLZXlNb2RzLCBxdWlja1BpY2tJdGVtU2NvcmVyQWNjZXNzb3IsIFF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2UsIFF1aWNrSW5wdXRIaWRlUmVhc29uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIFRyaWdnZXJBY3Rpb24sIEZhc3RBbmRTbG93UGlja3MsIFBpY2tzLCBQaWNrc1dpdGhBY3RpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgcHJlcGFyZVF1ZXJ5LCBJUHJlcGFyZWRRdWVyeSwgY29tcGFyZUl0ZW1zQnlGdXp6eVNjb3JlLCBzY29yZUl0ZW1GdXp6eSwgRnV6enlTY29yZXJDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1enp5U2NvcmVyLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucywgUXVlcnlCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9xdWVyeUJ1aWxkZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRPdXRPZldvcmtzcGFjZUVkaXRvclJlc291cmNlcywgZXh0cmFjdFJhbmdlRnJvbUZpbHRlciwgSVdvcmtiZW5jaFNlYXJjaENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlLCBJU2VhcmNoQ29tcGxldGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyB1bnRpbGRpZnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHRvTG9jYWxSZXNvdXJjZSwgZGlybmFtZSwgYmFzZW5hbWVPckF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRWRpdG9yQ29uZmlndXJhdGlvbiwgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgaXNFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQLCBBQ1RJVkVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b3AgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9jYWNoZVN0YXRlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQsIElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZmlsZXNDb25maWd1cmF0aW9uL2NvbW1vbi9maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyIH0gZnJvbSAnLi9zeW1ib2xzUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucywgRGVmYXVsdFF1aWNrQWNjZXNzRmlsdGVyVmFsdWUsIEV4dGVuc2lvbnMsIElRdWlja0FjY2Vzc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgUGlja2VyRWRpdG9yU3RhdGUsIElXb3JrYmVuY2hRdWlja0FjY2Vzc0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3F1aWNrYWNjZXNzLmpzJztcbmltcG9ydCB7IEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3F1aWNrYWNjZXNzL2dvdG9TeW1ib2xRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUsIElFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQVNLX1FVSUNLX1FVRVNUSU9OX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRRdWlja0lucHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UsIElRdWlja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgSUFueXRoaW5nUXVpY2tQaWNrSXRlbSBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIElRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlIHsgfVxuXG5pbnRlcmZhY2UgSUVkaXRvclN5bWJvbEFueXRoaW5nUXVpY2tQaWNrSXRlbSBleHRlbmRzIElBbnl0aGluZ1F1aWNrUGlja0l0ZW0ge1xuXHRyZXNvdXJjZTogVVJJO1xuXHRyYW5nZTogeyBkZWNvcmF0aW9uOiBJUmFuZ2U7IHNlbGVjdGlvbjogSVJhbmdlIH07XG59XG5cbmZ1bmN0aW9uIGlzRWRpdG9yU3ltYm9sUXVpY2tQaWNrSXRlbShwaWNrPzogSUFueXRoaW5nUXVpY2tQaWNrSXRlbSk6IHBpY2sgaXMgSUVkaXRvclN5bWJvbEFueXRoaW5nUXVpY2tQaWNrSXRlbSB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHBpY2sgYXMgSUVkaXRvclN5bWJvbEFueXRoaW5nUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISFjYW5kaWRhdGU/LnJhbmdlICYmICEhY2FuZGlkYXRlLnJlc291cmNlO1xufVxuXG5pbnRlcmZhY2UgSUFueXRoaW5nUGlja1N0YXRlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRwaWNrZXI6IElRdWlja1BpY2s8SUFueXRoaW5nUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+IHwgdW5kZWZpbmVkO1xuXHRlZGl0b3JWaWV3U3RhdGU6IFBpY2tlckVkaXRvclN0YXRlO1xuXG5cdHNjb3JlckNhY2hlOiBGdXp6eVNjb3JlckNhY2hlO1xuXHRmaWxlUXVlcnlDYWNoZTogRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRsYXN0T3JpZ2luYWxGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGFzdEZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsYXN0UmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRsYXN0R2xvYmFsUGlja3M6IFBpY2tzV2l0aEFjdGl2ZTxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB8IHVuZGVmaW5lZDtcblxuXHRpc1F1aWNrTmF2aWdhdGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU2V0cyB0aGUgcGlja2VyIGZvciB0aGlzIHBpY2sgc3RhdGUuXG5cdCAqL1xuXHRzZXQocGlja2VyOiBJUXVpY2tQaWNrPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pik6IHZvaWQ7XG59XG5cblxuZXhwb3J0IGNsYXNzIEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4ge1xuXG5cdHN0YXRpYyBQUkVGSVggPSAnJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBOT19SRVNVTFRTX1BJQ0s6IElBbnl0aGluZ1F1aWNrUGlja0l0ZW0gPSB7XG5cdFx0bGFiZWw6IGxvY2FsaXplKCdub0FueXRoaW5nUmVzdWx0cycsIFwiTm8gbWF0Y2hpbmcgcmVzdWx0c1wiKVxuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9SRVNVTFRTID0gNTEyO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRZUElOR19TRUFSQ0hfREVMQVkgPSAyMDA7IC8vIHRoaXMgZGVsYXkgYWNjb21tb2RhdGVzIGZvciB0aGUgdXNlciB0eXBpbmcgYSB3b3JkIGFuZCB0aGVuIHN0b3BzIHR5cGluZyB0byBzdGFydCBzZWFyY2hpbmdcblxuXHRwcml2YXRlIHN0YXRpYyBTWU1CT0xfUElDS1NfTUVSR0VfREVMQVkgPSAyMDA7IC8vIGFsbG93IHNvbWUgdGltZSB0byBtZXJnZSBmYXN0IGFuZCBzbG93IHBpY2tzIHRvIHJlZHVjZSBmbGlja2VyaW5nXG5cblx0cHJpdmF0ZSByZWFkb25seSBwaWNrU3RhdGU6IElBbnl0aGluZ1BpY2tTdGF0ZTtcblxuXHRnZXQgZGVmYXVsdEZpbHRlclZhbHVlKCk6IERlZmF1bHRRdWlja0FjY2Vzc0ZpbHRlclZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uLnByZXNlcnZlSW5wdXQpIHtcblx0XHRcdHJldHVybiBEZWZhdWx0UXVpY2tBY2Nlc3NGaWx0ZXJWYWx1ZS5MQVNUO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVF1aWNrQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0NoYXRTZXJ2aWNlOiBJUXVpY2tDaGF0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbUVkaXRvckxhYmVsU2VydmljZTogSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLCB7XG5cdFx0XHRjYW5BY2NlcHRJbkJhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRub1Jlc3VsdHNQaWNrOiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuTk9fUkVTVUxUU19QSUNLXG5cdFx0fSk7XG5cblx0XHR0aGlzLnBpY2tTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBjbGFzcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdFx0XHRwaWNrZXI6IElRdWlja1BpY2s8SUFueXRoaW5nUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRlZGl0b3JWaWV3U3RhdGU6IFBpY2tlckVkaXRvclN0YXRlO1xuXG5cdFx0XHRzY29yZXJDYWNoZTogRnV6enlTY29yZXJDYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRmaWxlUXVlcnlDYWNoZTogRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0bGFzdE9yaWdpbmFsRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsYXN0RmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsYXN0UmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0bGFzdEdsb2JhbFBpY2tzOiBQaWNrc1dpdGhBY3RpdmU8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGlzUXVpY2tOYXZpZ2F0aW5nOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcjogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdFx0XHQpIHtcblx0XHRcdFx0c3VwZXIoKTtcblx0XHRcdFx0dGhpcy5lZGl0b3JWaWV3U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQaWNrZXJFZGl0b3JTdGF0ZSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzZXQocGlja2VyOiBJUXVpY2tQaWNrPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pik6IHZvaWQge1xuXG5cdFx0XHRcdC8vIFBpY2tlciBmb3IgdGhpcyBydW5cblx0XHRcdFx0dGhpcy5waWNrZXIgPSBwaWNrZXI7XG5cdFx0XHRcdEV2ZW50Lm9uY2UocGlja2VyLm9uRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChwaWNrZXIgPT09IHRoaXMucGlja2VyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBpY2tlciA9IHVuZGVmaW5lZDsgLy8gY2xlYXIgdGhlIHBpY2tlciB3aGVuIGRpc3Bvc2VkIHRvIG5vdCBrZWVwIGl0IGluIG1lbW9yeSBmb3IgdG9vIGxvbmdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIENhY2hlc1xuXHRcdFx0XHRjb25zdCBpc1F1aWNrTmF2aWdhdGluZyA9ICEhcGlja2VyLnF1aWNrTmF2aWdhdGU7XG5cdFx0XHRcdGlmICghaXNRdWlja05hdmlnYXRpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVRdWVyeUNhY2hlID0gdGhpcy5wcm92aWRlci5jcmVhdGVGaWxlUXVlcnlDYWNoZSgpO1xuXHRcdFx0XHRcdHRoaXMuc2NvcmVyQ2FjaGUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT3RoZXJcblx0XHRcdFx0dGhpcy5pc1F1aWNrTmF2aWdhdGluZyA9IGlzUXVpY2tOYXZpZ2F0aW5nO1xuXHRcdFx0XHR0aGlzLmxhc3RPcmlnaW5hbEZpbHRlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5sYXN0RmlsdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLmxhc3RSYW5nZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5sYXN0R2xvYmFsUGlja3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuZWRpdG9yVmlld1N0YXRlLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSh0aGlzLCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXG5cdFx0dGhpcy5maWxlUXVlcnlCdWlsZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWVyeUJ1aWxkZXIpO1xuXHRcdHRoaXMud29ya3NwYWNlU3ltYm9sc1F1aWNrQWNjZXNzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIpKTtcblx0XHR0aGlzLmVkaXRvclN5bWJvbHNRdWlja0FjY2VzcyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY29uZmlndXJhdGlvbigpIHtcblx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uPigpLndvcmtiZW5jaD8uZWRpdG9yO1xuXHRcdGNvbnN0IHNlYXJjaENvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdvcmtiZW5jaFNlYXJjaENvbmZpZ3VyYXRpb24+KCkuc2VhcmNoO1xuXHRcdGNvbnN0IHF1aWNrQWNjZXNzQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoUXVpY2tBY2Nlc3NDb25maWd1cmF0aW9uPigpLndvcmtiZW5jaC5xdWlja09wZW47XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlbkVkaXRvclBpbm5lZDogIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlld0Zyb21RdWlja09wZW4gfHwgIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlldyxcblx0XHRcdG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uOiBlZGl0b3JDb25maWc/Lm9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uLFxuXHRcdFx0aW5jbHVkZVN5bWJvbHM6IHNlYXJjaENvbmZpZz8ucXVpY2tPcGVuPy5pbmNsdWRlU3ltYm9scyxcblx0XHRcdGluY2x1ZGVIaXN0b3J5OiBzZWFyY2hDb25maWc/LnF1aWNrT3Blbj8uaW5jbHVkZUhpc3RvcnkgPz8gdHJ1ZSxcblx0XHRcdGhpc3RvcnlGaWx0ZXJTb3J0T3JkZXI6IHNlYXJjaENvbmZpZz8ucXVpY2tPcGVuPy5oaXN0b3J5Py5maWx0ZXJTb3J0T3JkZXIsXG5cdFx0XHRwcmVzZXJ2ZUlucHV0OiBxdWlja0FjY2Vzc0NvbmZpZz8ucHJlc2VydmVJbnB1dFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBwcm92aWRlKHBpY2tlcjogSVF1aWNrUGljazxJQW55dGhpbmdRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIHBpY2sgc3RhdGUgZm9yIHRoaXMgcnVuXG5cdFx0dGhpcy5waWNrU3RhdGUuc2V0KHBpY2tlcik7XG5cblx0XHQvLyBBZGQgZWRpdG9yIGRlY29yYXRpb25zIGZvciBhY3RpdmUgZWRpdG9yIHN5bWJvbCBwaWNrc1xuXHRcdGNvbnN0IGVkaXRvckRlY29yYXRpb25zRGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZUFjdGl2ZSgoKSA9PiB7XG5cblx0XHRcdC8vIENsZWFyIG9sZCBkZWNvcmF0aW9uc1xuXHRcdFx0ZWRpdG9yRGVjb3JhdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBBZGQgbmV3IGRlY29yYXRpb24gaWYgZWRpdG9yIHN5bWJvbCBpcyBhY3RpdmVcblx0XHRcdGNvbnN0IFtpdGVtXSA9IHBpY2tlci5hY3RpdmVJdGVtcztcblx0XHRcdGlmIChpc0VkaXRvclN5bWJvbFF1aWNrUGlja0l0ZW0oaXRlbSkpIHtcblx0XHRcdFx0ZWRpdG9yRGVjb3JhdGlvbnNEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5kZWNvcmF0ZUFuZFJldmVhbFN5bWJvbFJhbmdlKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc3RvcmUgdmlldyBzdGF0ZSB1cG9uIGNhbmNlbGxhdGlvbiBpZiB3ZSBjaGFuZ2VkIGl0XG5cdFx0Ly8gYnV0IG9ubHkgd2hlbiB0aGUgcGlja2VyIHdhcyBjbG9zZWQgdmlhIGV4cGxpY2l0IHVzZXJcblx0XHQvLyBnZXN0dXJlIGFuZCBub3QgZS5nLiB3aGVuIGZvY3VzIHdhcyBsb3N0IGJlY2F1c2UgdGhhdFxuXHRcdC8vIGNvdWxkIG1lYW4gdGhlIHVzZXIgY2xpY2tlZCBpbnRvIHRoZSBlZGl0b3IgZGlyZWN0bHkuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGlja2VyLm9uRGlkSGlkZSkoKHsgcmVhc29uIH0pID0+IHtcblx0XHRcdGlmIChyZWFzb24gPT09IFF1aWNrSW5wdXRIaWRlUmVhc29uLkdlc3R1cmUpIHtcblx0XHRcdFx0dGhpcy5waWNrU3RhdGUuZWRpdG9yVmlld1N0YXRlLnJlc3RvcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBwaWNrZXJcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3VwZXIucHJvdmlkZShwaWNrZXIsIHRva2VuLCBydW5PcHRpb25zKSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGRlY29yYXRlQW5kUmV2ZWFsU3ltYm9sUmFuZ2UocGljazogSUVkaXRvclN5bWJvbEFueXRoaW5nUXVpY2tQaWNrSXRlbSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocGljay5yZXNvdXJjZSwgYWN0aXZlRWRpdG9yPy5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IC8vIGFjdGl2ZSBlZGl0b3IgbmVlZHMgdG8gYmUgZm9yIHJlc291cmNlXG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ29udHJvbCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvckNvbnRyb2wpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IC8vIHdlIG5lZWQgYSB0ZXh0IGVkaXRvciBjb250cm9sIHRvIGRlY29yYXRlIGFuZCByZXZlYWxcblx0XHR9XG5cblx0XHQvLyB3ZSBtdXN0IHJlbWVtYmVyIG91ciBjdXJyZW50IHZpZXcgc3RhdGUgdG8gYmUgYWJsZSB0byByZXN0b3JlXG5cdFx0dGhpcy5waWNrU3RhdGUuZWRpdG9yVmlld1N0YXRlLnNldCgpO1xuXG5cdFx0Ly8gUmV2ZWFsXG5cdFx0YWN0aXZlRWRpdG9yQ29udHJvbC5yZXZlYWxSYW5nZUluQ2VudGVyKHBpY2sucmFuZ2Uuc2VsZWN0aW9uLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cblx0XHQvLyBEZWNvcmF0ZVxuXHRcdHRoaXMuYWRkRGVjb3JhdGlvbnMoYWN0aXZlRWRpdG9yQ29udHJvbCwgcGljay5yYW5nZS5kZWNvcmF0aW9uKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhckRlY29yYXRpb25zKGFjdGl2ZUVkaXRvckNvbnRyb2wpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UGlja3Mob3JpZ2luYWxGaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IFBpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+IHwgUHJvbWlzZTxQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4gfCBGYXN0QW5kU2xvd1BpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+IHwgbnVsbCB7XG5cblx0XHQvLyBGaW5kIGEgc3VpdGFibGUgcmFuZ2UgZnJvbSB0aGUgcGF0dGVybiBsb29raW5nIGZvciBcIjpcIiwgXCIjXCIgb3IgXCIsXCJcblx0XHQvLyB1bmxlc3Mgd2UgaGF2ZSB0aGUgYEBgIGVkaXRvciBzeW1ib2wgY2hhcmFjdGVyIGluc2lkZSB0aGUgZmlsdGVyXG5cdFx0Y29uc3QgZmlsdGVyV2l0aFJhbmdlID0gZXh0cmFjdFJhbmdlRnJvbUZpbHRlcihvcmlnaW5hbEZpbHRlciwgW0dvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWF0pO1xuXG5cdFx0Ly8gVXBkYXRlIGZpbHRlciB3aXRoIG5vcm1hbGl6ZWQgdmFsdWVzXG5cdFx0bGV0IGZpbHRlcjogc3RyaW5nO1xuXHRcdGlmIChmaWx0ZXJXaXRoUmFuZ2UpIHtcblx0XHRcdGZpbHRlciA9IGZpbHRlcldpdGhSYW5nZS5maWx0ZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbHRlciA9IG9yaWdpbmFsRmlsdGVyO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyIGFzIGxhc3QgcmFuZ2Vcblx0XHR0aGlzLnBpY2tTdGF0ZS5sYXN0UmFuZ2UgPSBmaWx0ZXJXaXRoUmFuZ2U/LnJhbmdlO1xuXG5cdFx0Ly8gSWYgdGhlIG9yaWdpbmFsIGZpbHRlciB2YWx1ZSBoYXMgY2hhbmdlZCBidXQgdGhlIG5vcm1hbGl6ZWRcblx0XHQvLyBvbmUgaGFzIG5vdCwgd2UgcmV0dXJuIGVhcmx5IHdpdGggYSBgbnVsbGAgcmVzdWx0IGluZGljYXRpbmdcblx0XHQvLyB0aGF0IHRoZSByZXN1bHRzIHNob3VsZCBwcmVzZXJ2ZSBiZWNhdXNlIHRoZSByYW5nZSBpbmZvcm1hdGlvblxuXHRcdC8vICg6PGxpbmU+Ojxjb2x1bW4+KSBkb2VzIG5vdCBuZWVkIHRvIHRyaWdnZXIgYW55IHJlLXNvcnRpbmcuXG5cdFx0aWYgKG9yaWdpbmFsRmlsdGVyICE9PSB0aGlzLnBpY2tTdGF0ZS5sYXN0T3JpZ2luYWxGaWx0ZXIgJiYgZmlsdGVyID09PSB0aGlzLnBpY2tTdGF0ZS5sYXN0RmlsdGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBhcyBsYXN0IGZpbHRlclxuXHRcdGNvbnN0IGxhc3RXYXNGaWx0ZXJpbmcgPSAhIXRoaXMucGlja1N0YXRlLmxhc3RPcmlnaW5hbEZpbHRlcjtcblx0XHR0aGlzLnBpY2tTdGF0ZS5sYXN0T3JpZ2luYWxGaWx0ZXIgPSBvcmlnaW5hbEZpbHRlcjtcblx0XHR0aGlzLnBpY2tTdGF0ZS5sYXN0RmlsdGVyID0gZmlsdGVyO1xuXG5cdFx0Ly8gUmVtZW1iZXIgb3VyIHBpY2sgc3RhdGUgYmVmb3JlIHJldHVybmluZyBuZXcgcGlja3Ncblx0XHQvLyB1bmxlc3Mgd2UgYXJlIGluc2lkZSBhbiBlZGl0b3Igc3ltYm9sIGZpbHRlciBvciByZXN1bHQuXG5cdFx0Ly8gV2UgY2FuIHVzZSB0aGlzIHN0YXRlIHRvIHJldHVybiBiYWNrIHRvIHRoZSBnbG9iYWwgcGlja1xuXHRcdC8vIHdoZW4gdGhlIHVzZXIgaXMgbmFycm93aW5nIGJhY2sgb3V0IG9mIGVkaXRvciBzeW1ib2xzLlxuXHRcdGNvbnN0IHBpY2tzID0gdGhpcy5waWNrU3RhdGUucGlja2VyPy5pdGVtcztcblx0XHRjb25zdCBhY3RpdmVQaWNrID0gdGhpcy5waWNrU3RhdGUucGlja2VyPy5hY3RpdmVJdGVtc1swXTtcblx0XHRpZiAocGlja3MgJiYgYWN0aXZlUGljaykge1xuXHRcdFx0Y29uc3QgYWN0aXZlUGlja0lzRWRpdG9yU3ltYm9sID0gaXNFZGl0b3JTeW1ib2xRdWlja1BpY2tJdGVtKGFjdGl2ZVBpY2spO1xuXHRcdFx0Y29uc3QgYWN0aXZlUGlja0lzTm9SZXN1bHRzSW5FZGl0b3JTeW1ib2xzID0gYWN0aXZlUGljayA9PT0gQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLk5PX1JFU1VMVFNfUElDSyAmJiBmaWx0ZXIuaW5kZXhPZihHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgpID49IDA7XG5cdFx0XHRpZiAoIWFjdGl2ZVBpY2tJc0VkaXRvclN5bWJvbCAmJiAhYWN0aXZlUGlja0lzTm9SZXN1bHRzSW5FZGl0b3JTeW1ib2xzKSB7XG5cdFx0XHRcdHRoaXMucGlja1N0YXRlLmxhc3RHbG9iYWxQaWNrcyA9IHtcblx0XHRcdFx0XHRpdGVtczogcGlja3MsXG5cdFx0XHRcdFx0YWN0aXZlOiBhY3RpdmVQaWNrXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYGVuYWJsZUVkaXRvclN5bWJvbFNlYXJjaGA6IHRoaXMgd2lsbCBlbmFibGUgbG9jYWwgZWRpdG9yIHN5bWJvbFxuXHRcdC8vIHNlYXJjaCBpZiB0aGUgZmlsdGVyIHZhbHVlIGluY2x1ZGVzIGBAYCBjaGFyYWN0ZXIuIFdlIG9ubHkgd2FudFxuXHRcdC8vIHRvIGVuYWJsZSB0aGlzIHN1cHBvcnQgdGhvdWdoIGlmIHRoZSB1c2VyIHdhcyBmaWx0ZXJpbmcgaW4gdGhlXG5cdFx0Ly8gcGlja2VyIGJlY2F1c2UgdGhpcyBmZWF0dXJlIGRlcGVuZHMgb24gYW4gYWN0aXZlIGl0ZW0gaW4gdGhlIHJlc3VsdFxuXHRcdC8vIGxpc3QgdG8gZ2V0IHN5bWJvbHMgZnJvbS4gSWYgd2Ugd291bGQgc2ltcGx5IHRyaWdnZXIgZWRpdG9yIHN5bWJvbFxuXHRcdC8vIHNlYXJjaCB3aXRob3V0IHByaW9yIGZpbHRlcmluZywgeW91IGNvdWxkIG5vdCBwYXN0ZSBhIGZpbGUgbmFtZVxuXHRcdC8vIGluY2x1ZGluZyB0aGUgYEBgIGNoYXJhY3RlciB0byBvcGVuIGl0IChlLmcuIC9zb21lL2ZpbGVAcGF0aClcblx0XHQvLyByZWZzOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTM4NDVcblx0XHRyZXR1cm4gdGhpcy5kb0dldFBpY2tzKFxuXHRcdFx0ZmlsdGVyLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5ydW5PcHRpb25zLFxuXHRcdFx0XHRlbmFibGVFZGl0b3JTeW1ib2xTZWFyY2g6IGxhc3RXYXNGaWx0ZXJpbmdcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHRva2VuXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRQaWNrcyhcblx0XHRmaWx0ZXI6IHN0cmluZyxcblx0XHRvcHRpb25zOiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zICYgeyBlbmFibGVFZGl0b3JTeW1ib2xTZWFyY2g6IGJvb2xlYW4gfSxcblx0XHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpOiBQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB8IFByb21pc2U8UGlja3M8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4+IHwgRmFzdEFuZFNsb3dQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBwcmVwYXJlUXVlcnkoZmlsdGVyKTtcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB3ZSBoYXZlIGVkaXRvciBzeW1ib2wgcGlja3MuIFdlIHN1cHBvcnQgdGhpcyBieTpcblx0XHQvLyAtIGhhdmluZyBhIHByZXZpb3VzbHkgYWN0aXZlIGdsb2JhbCBwaWNrIChlLmcuIGEgZmlsZSlcblx0XHQvLyAtIHRoZSB1c2VyIHR5cGluZyBgQGAgdG8gc3RhcnQgdGhlIGxvY2FsIHN5bWJvbCBxdWVyeVxuXHRcdGlmIChvcHRpb25zLmVuYWJsZUVkaXRvclN5bWJvbFNlYXJjaCkge1xuXHRcdFx0Y29uc3QgZWRpdG9yU3ltYm9sUGlja3MgPSB0aGlzLmdldEVkaXRvclN5bWJvbFBpY2tzKHF1ZXJ5LCBkaXNwb3NhYmxlcywgdG9rZW4pO1xuXHRcdFx0aWYgKGVkaXRvclN5bWJvbFBpY2tzKSB7XG5cdFx0XHRcdHJldHVybiBlZGl0b3JTeW1ib2xQaWNrcztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBoYXZlIGEga25vd24gbGFzdCBhY3RpdmUgZWRpdG9yIHN5bWJvbCBwaWNrLCB3ZSB0cnkgdG8gcmVzdG9yZVxuXHRcdC8vIHRoZSBsYXN0IGdsb2JhbCBwaWNrIHRvIHN1cHBvcnQgdGhlIGNhc2Ugb2YgbmFycm93aW5nIG91dCBmcm9tIGFcblx0XHQvLyBlZGl0b3Igc3ltYm9sIHNlYXJjaCBiYWNrIGludG8gdGhlIGdsb2JhbCBzZWFyY2hcblx0XHRjb25zdCBhY3RpdmVQaWNrID0gdGhpcy5waWNrU3RhdGUucGlja2VyPy5hY3RpdmVJdGVtc1swXTtcblx0XHRpZiAoaXNFZGl0b3JTeW1ib2xRdWlja1BpY2tJdGVtKGFjdGl2ZVBpY2spICYmIHRoaXMucGlja1N0YXRlLmxhc3RHbG9iYWxQaWNrcykge1xuXHRcdFx0cmV0dXJuIHRoaXMucGlja1N0YXRlLmxhc3RHbG9iYWxQaWNrcztcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgcmV0dXJuIG5vcm1hbGx5IHdpdGggaGlzdG9yeSBhbmQgZmlsZS9zeW1ib2wgcmVzdWx0c1xuXHRcdGNvbnN0IGhpc3RvcnlFZGl0b3JQaWNrcyA9IHRoaXMuZ2V0RWRpdG9ySGlzdG9yeVBpY2tzKHF1ZXJ5KTtcblxuXHRcdGxldCBwaWNrcyA9IG5ldyBBcnJheTxJQW55dGhpbmdRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4oKTtcblx0XHRpZiAob3B0aW9ucy5hZGRpdGlvblBpY2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBpY2sgb2Ygb3B0aW9ucy5hZGRpdGlvblBpY2tzKSB7XG5cdFx0XHRcdGlmIChwaWNrLnR5cGUgPT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdFx0cGlja3MucHVzaChwaWNrKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXF1ZXJ5Lm9yaWdpbmFsKSB7XG5cdFx0XHRcdFx0cGljay5oaWdobGlnaHRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHBpY2tzLnB1c2gocGljayk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBzY29yZSwgbGFiZWxNYXRjaCwgZGVzY3JpcHRpb25NYXRjaCB9ID0gc2NvcmVJdGVtRnV6enkocGljaywgcXVlcnksIHRydWUsIHF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciwgdGhpcy5waWNrU3RhdGUuc2NvcmVyQ2FjaGUpO1xuXHRcdFx0XHRpZiAoIXNjb3JlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGljay5oaWdobGlnaHRzID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBsYWJlbE1hdGNoLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbk1hdGNoXG5cdFx0XHRcdH07XG5cdFx0XHRcdHBpY2tzLnB1c2gocGljayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLnBpY2tTdGF0ZS5pc1F1aWNrTmF2aWdhdGluZykge1xuXHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3JlY2VudGx5T3BlbmVkU2VwYXJhdG9yJywgXCJyZWNlbnRseSBvcGVuZWRcIikgfSBzYXRpc2ZpZXMgSVF1aWNrUGlja1NlcGFyYXRvcik7XG5cdFx0XHR9XG5cdFx0XHRwaWNrcyA9IGhpc3RvcnlFZGl0b3JQaWNrcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG9wdGlvbnMuaW5jbHVkZUhlbHApIHtcblx0XHRcdFx0cGlja3MucHVzaCguLi50aGlzLmdldEhlbHBQaWNrcyhxdWVyeSwgdG9rZW4sIG9wdGlvbnMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChoaXN0b3J5RWRpdG9yUGlja3MubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdyZWNlbnRseU9wZW5lZFNlcGFyYXRvcicsIFwicmVjZW50bHkgb3BlbmVkXCIpIH0gc2F0aXNmaWVzIElRdWlja1BpY2tTZXBhcmF0b3IpO1xuXHRcdFx0XHRwaWNrcy5wdXNoKC4uLmhpc3RvcnlFZGl0b3JQaWNrcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblxuXHRcdFx0Ly8gRmFzdCBwaWNrczogaGVscCAoaWYgaW5jbHVkZWQpICYgZWRpdG9yIGhpc3Rvcnlcblx0XHRcdHBpY2tzOiBvcHRpb25zLmZpbHRlciA/IHBpY2tzLmZpbHRlcigocCkgPT4gb3B0aW9ucy5maWx0ZXI/LihwKSkgOiBwaWNrcyxcblxuXHRcdFx0Ly8gU2xvdyBwaWNrczogZmlsZXMgYW5kIHN5bWJvbHNcblx0XHRcdGFkZGl0aW9uYWxQaWNrczogKGFzeW5jICgpOiBQcm9taXNlPFBpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiA9PiB7XG5cblx0XHRcdFx0Ly8gRXhjbHVkZSBhbnkgcmVzdWx0IHRoYXQgaXMgYWxyZWFkeSBwcmVzZW50IGluIGVkaXRvciBoaXN0b3J5LlxuXHRcdFx0XHRjb25zdCBhZGRpdGlvbmFsUGlja3NFeGNsdWRlcyA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPih1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgaGlzdG9yeUVkaXRvclBpY2sgb2YgaGlzdG9yeUVkaXRvclBpY2tzKSB7XG5cdFx0XHRcdFx0aWYgKGhpc3RvcnlFZGl0b3JQaWNrLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUGlja3NFeGNsdWRlcy5zZXQoaGlzdG9yeUVkaXRvclBpY2sucmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBhZGRpdGlvbmFsUGlja3MgPSBhd2FpdCB0aGlzLmdldEFkZGl0aW9uYWxQaWNrcyhxdWVyeSwgYWRkaXRpb25hbFBpY2tzRXhjbHVkZXMsIEJvb2xlYW4odGhpcy5jb25maWd1cmF0aW9uPy5pbmNsdWRlU3ltYm9scyksIHRva2VuKTtcblx0XHRcdFx0aWYgKG9wdGlvbnMuZmlsdGVyKSB7XG5cdFx0XHRcdFx0YWRkaXRpb25hbFBpY2tzID0gYWRkaXRpb25hbFBpY2tzLmZpbHRlcigocCkgPT4gb3B0aW9ucy5maWx0ZXI/LihwKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFkZGl0aW9uYWxQaWNrcy5sZW5ndGggPiAwID8gW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiB0aGlzLmNvbmZpZ3VyYXRpb24uaW5jbHVkZVN5bWJvbHMgPyBsb2NhbGl6ZSgnZmlsZUFuZFN5bWJvbFJlc3VsdHNTZXBhcmF0b3InLCBcImZpbGUgYW5kIHN5bWJvbCByZXN1bHRzXCIpIDogbG9jYWxpemUoJ2ZpbGVSZXN1bHRzU2VwYXJhdG9yJywgXCJmaWxlIHJlc3VsdHNcIikgfSxcblx0XHRcdFx0XHQuLi5hZGRpdGlvbmFsUGlja3Ncblx0XHRcdFx0XSA6IFtdO1xuXHRcdFx0fSkoKSxcblxuXHRcdFx0Ly8gYWxsb3cgc29tZSB0aW1lIHRvIG1lcmdlIGZpbGVzIGFuZCBzeW1ib2xzIHRvIHJlZHVjZSBmbGlja2VyaW5nXG5cdFx0XHRtZXJnZURlbGF5OiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuU1lNQk9MX1BJQ0tTX01FUkdFX0RFTEFZXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QWRkaXRpb25hbFBpY2tzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgZXhjbHVkZXM6IFJlc291cmNlTWFwPGJvb2xlYW4+LCBpbmNsdWRlU3ltYm9sczogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4ge1xuXG5cdFx0Ly8gUmVzb2x2ZSBmaWxlIGFuZCBzeW1ib2wgcGlja3MgKGlmIGVuYWJsZWQpXG5cdFx0Y29uc3QgW2ZpbGVQaWNrcywgc3ltYm9sUGlja3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5nZXRGaWxlUGlja3MocXVlcnksIGV4Y2x1ZGVzLCB0b2tlbiksXG5cdFx0XHR0aGlzLmdldFdvcmtzcGFjZVN5bWJvbFBpY2tzKHF1ZXJ5LCBpbmNsdWRlU3ltYm9scywgdG9rZW4pXG5cdFx0XSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBQZXJmb3JtIHNvcnRpbmcgKHRvcCByZXN1bHRzIGJ5IHNjb3JlKVxuXHRcdGNvbnN0IHNvcnRlZEFueXRoaW5nUGlja3MgPSB0b3AoXG5cdFx0XHRbLi4uZmlsZVBpY2tzLCAuLi5zeW1ib2xQaWNrc10sXG5cdFx0XHQoYW55UGlja0EsIGFueVBpY2tCKSA9PiBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUoYW55UGlja0EsIGFueVBpY2tCLCBxdWVyeSwgdHJ1ZSwgcXVpY2tQaWNrSXRlbVNjb3JlckFjY2Vzc29yLCB0aGlzLnBpY2tTdGF0ZS5zY29yZXJDYWNoZSksXG5cdFx0XHRBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuTUFYX1JFU1VMVFNcblx0XHQpO1xuXG5cdFx0Ly8gUGVyZm9ybSBmaWx0ZXJpbmdcblx0XHRjb25zdCBmaWx0ZXJlZEFueXRoaW5nUGlja3M6IElBbnl0aGluZ1F1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYW55dGhpbmdQaWNrIG9mIHNvcnRlZEFueXRoaW5nUGlja3MpIHtcblxuXHRcdFx0Ly8gQWx3YXlzIHByZXNlcnZlIGFueSBleGlzdGluZyBoaWdobGlnaHRzIChlLmcuIGZyb20gd29ya3NwYWNlIHN5bWJvbHMpXG5cdFx0XHRpZiAoYW55dGhpbmdQaWNrLmhpZ2hsaWdodHMpIHtcblx0XHRcdFx0ZmlsdGVyZWRBbnl0aGluZ1BpY2tzLnB1c2goYW55dGhpbmdQaWNrKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBkbyB0aGUgc2NvcmluZyBhbmQgbWF0Y2hpbmcgaGVyZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHsgc2NvcmUsIGxhYmVsTWF0Y2gsIGRlc2NyaXB0aW9uTWF0Y2ggfSA9IHNjb3JlSXRlbUZ1enp5KGFueXRoaW5nUGljaywgcXVlcnksIHRydWUsIHF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciwgdGhpcy5waWNrU3RhdGUuc2NvcmVyQ2FjaGUpO1xuXHRcdFx0XHRpZiAoIXNjb3JlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhbnl0aGluZ1BpY2suaGlnaGxpZ2h0cyA9IHtcblx0XHRcdFx0XHRsYWJlbDogbGFiZWxNYXRjaCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25NYXRjaFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGZpbHRlcmVkQW55dGhpbmdQaWNrcy5wdXNoKGFueXRoaW5nUGljayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbHRlcmVkQW55dGhpbmdQaWNrcztcblx0fVxuXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBIaXN0b3J5XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYWJlbE9ubHlFZGl0b3JIaXN0b3J5UGlja0FjY2Vzc29yID0gbmV3IFF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3Nvcih7IHNraXBEZXNjcmlwdGlvbjogdHJ1ZSB9KTtcblxuXHRwcml2YXRlIGdldEVkaXRvckhpc3RvcnlQaWNrcyhxdWVyeTogSVByZXBhcmVkUXVlcnkpOiBBcnJheTxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvbjtcblxuXHRcdC8vIEp1c3QgcmV0dXJuIGFsbCBoaXN0b3J5IGVudHJpZXMgaWYgbm90IHNlYXJjaGluZ1xuXHRcdGlmICghcXVlcnkubm9ybWFsaXplZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeSgpLm1hcChlZGl0b3IgPT4gdGhpcy5jcmVhdGVBbnl0aGluZ1BpY2soZWRpdG9yLCBjb25maWd1cmF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb24uaW5jbHVkZUhpc3RvcnkpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gZGlzYWJsZWQgd2hlbiBzZWFyY2hpbmdcblx0XHR9XG5cblx0XHQvLyBQZXJmb3JtIGZpbHRlcmluZ1xuXHRcdGNvbnN0IGVkaXRvckhpc3RvcnlTY29yZXJBY2Nlc3NvciA9IHF1ZXJ5LmNvbnRhaW5zUGF0aFNlcGFyYXRvciA/IHF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciA6IHRoaXMubGFiZWxPbmx5RWRpdG9ySGlzdG9yeVBpY2tBY2Nlc3NvcjsgLy8gT25seSBtYXRjaCBvbiBsYWJlbCBvZiB0aGUgZWRpdG9yIHVubGVzcyB0aGUgc2VhcmNoIGluY2x1ZGVzIHBhdGggc2VwYXJhdG9yc1xuXHRcdGNvbnN0IGVkaXRvckhpc3RvcnlQaWNrczogQXJyYXk8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoKSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBlZGl0b3IucmVzb3VyY2U7XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JIaXN0b3J5UGljayA9IHRoaXMuY3JlYXRlQW55dGhpbmdQaWNrKGVkaXRvciwgY29uZmlndXJhdGlvbik7XG5cblx0XHRcdGNvbnN0IHsgc2NvcmUsIGxhYmVsTWF0Y2gsIGRlc2NyaXB0aW9uTWF0Y2ggfSA9IHNjb3JlSXRlbUZ1enp5KGVkaXRvckhpc3RvcnlQaWNrLCBxdWVyeSwgZmFsc2UsIGVkaXRvckhpc3RvcnlTY29yZXJBY2Nlc3NvciwgdGhpcy5waWNrU3RhdGUuc2NvcmVyQ2FjaGUpO1xuXHRcdFx0aWYgKCFzY29yZSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gZXhjbHVkZSBlZGl0b3JzIG5vdCBtYXRjaGluZyBxdWVyeVxuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JIaXN0b3J5UGljay5oaWdobGlnaHRzID0ge1xuXHRcdFx0XHRsYWJlbDogbGFiZWxNYXRjaCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uTWF0Y2hcblx0XHRcdH07XG5cblx0XHRcdGVkaXRvckhpc3RvcnlQaWNrcy5wdXNoKGVkaXRvckhpc3RvcnlQaWNrKTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gd2l0aG91dCBzb3J0aW5nIGlmIHNldHRpbmdzIHRlbGwgdG8gc29ydCBieSByZWNlbmN5XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvbi5oaXN0b3J5RmlsdGVyU29ydE9yZGVyID09PSAncmVjZW5jeScpIHtcblx0XHRcdHJldHVybiBlZGl0b3JIaXN0b3J5UGlja3M7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBzb3J0aW5nXG5cdFx0cmV0dXJuIGVkaXRvckhpc3RvcnlQaWNrcy5zb3J0KChlZGl0b3JBLCBlZGl0b3JCKSA9PiBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUoZWRpdG9yQSwgZWRpdG9yQiwgcXVlcnksIGZhbHNlLCBlZGl0b3JIaXN0b3J5U2NvcmVyQWNjZXNzb3IsIHRoaXMucGlja1N0YXRlLnNjb3JlckNhY2hlKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBGaWxlIFNlYXJjaFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZVF1ZXJ5RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyPFVSSVtdPihBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuVFlQSU5HX1NFQVJDSF9ERUxBWSkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZVF1ZXJ5QnVpbGRlcjogUXVlcnlCdWlsZGVyO1xuXG5cdHByaXZhdGUgY3JlYXRlRmlsZVF1ZXJ5Q2FjaGUoKTogRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlUXVlcnlDYWNoZVN0YXRlKFxuXHRcdFx0Y2FjaGVLZXkgPT4gdGhpcy5maWxlUXVlcnlCdWlsZGVyLmZpbGUodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLCB0aGlzLmdldEZpbGVRdWVyeU9wdGlvbnMoeyBjYWNoZUtleSB9KSksXG5cdFx0XHRxdWVyeSA9PiB0aGlzLnNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaChxdWVyeSksXG5cdFx0XHRjYWNoZUtleSA9PiB0aGlzLnNlYXJjaFNlcnZpY2UuY2xlYXJDYWNoZShjYWNoZUtleSksXG5cdFx0XHR0aGlzLnBpY2tTdGF0ZS5maWxlUXVlcnlDYWNoZVxuXHRcdCkubG9hZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRGaWxlUGlja3MocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBleGNsdWRlczogUmVzb3VyY2VNYXA8Ym9vbGVhbj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4+IHtcblx0XHRpZiAoIXF1ZXJ5Lm5vcm1hbGl6ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBBYnNvbHV0ZSBwYXRoIHJlc3VsdFxuXHRcdGNvbnN0IGFic29sdXRlUGF0aFJlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0QWJzb2x1dGVQYXRoRmlsZVJlc3VsdChxdWVyeSwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBhYnNvbHV0ZSBwYXRoIHJlc3VsdCBhcyBvbmx5IHJlc3VsdHMgaWYgcHJlc2VudFxuXHRcdGxldCBmaWxlTWF0Y2hlczogQXJyYXk8VVJJPjtcblx0XHRpZiAoYWJzb2x1dGVQYXRoUmVzdWx0KSB7XG5cdFx0XHRpZiAoZXhjbHVkZXMuaGFzKGFic29sdXRlUGF0aFJlc3VsdCkpIHtcblx0XHRcdFx0cmV0dXJuIFtdOyAvLyBleGNsdWRlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgYSBzaW5nbGUgcmVzdWx0IHBpY2sgYW5kIG1ha2Ugc3VyZSB0byBhcHBseSBmdWxsXG5cdFx0XHQvLyBoaWdobGlnaHRzIHRvIGVuc3VyZSB0aGUgcGljayBpcyBkaXNwbGF5ZWQuIFNpbmNlIGFcblx0XHRcdC8vIH4gbWlnaHQgaGF2ZSBiZWVuIHVzZWQgZm9yIHNlYXJjaGluZywgb3VyIGZ1enp5IHNjb3JlclxuXHRcdFx0Ly8gbWF5IG90aGVyd2lzZSBub3QgcHJvcGVybHkgcmVzcGVjdCB0aGUgcGljayBhcyBhIHJlc3VsdFxuXHRcdFx0Y29uc3QgYWJzb2x1dGVQYXRoUGljayA9IHRoaXMuY3JlYXRlQW55dGhpbmdQaWNrKGFic29sdXRlUGF0aFJlc3VsdCwgdGhpcy5jb25maWd1cmF0aW9uKTtcblx0XHRcdGFic29sdXRlUGF0aFBpY2suaGlnaGxpZ2h0cyA9IHtcblx0XHRcdFx0bGFiZWw6IFt7IHN0YXJ0OiAwLCBlbmQ6IGFic29sdXRlUGF0aFBpY2subGFiZWwubGVuZ3RoIH1dLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYWJzb2x1dGVQYXRoUGljay5kZXNjcmlwdGlvbiA/IFt7IHN0YXJ0OiAwLCBlbmQ6IGFic29sdXRlUGF0aFBpY2suZGVzY3JpcHRpb24ubGVuZ3RoIH1dIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gW2Fic29sdXRlUGF0aFBpY2tdO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBydW4gdGhlIGZpbGUgc2VhcmNoICh3aXRoIGEgZGVsYXllciBpZiBjYWNoZSBpcyBub3QgcmVhZHkgeWV0KVxuXHRcdGlmICh0aGlzLnBpY2tTdGF0ZS5maWxlUXVlcnlDYWNoZT8uaXNMb2FkZWQpIHtcblx0XHRcdGZpbGVNYXRjaGVzID0gYXdhaXQgdGhpcy5kb0ZpbGVTZWFyY2gocXVlcnksIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmlsZU1hdGNoZXMgPSBhd2FpdCB0aGlzLmZpbGVRdWVyeURlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmRvRmlsZVNlYXJjaChxdWVyeSwgdG9rZW4pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIGV4Y2x1ZGVzICYgY29udmVydCB0byBwaWNrc1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb247XG5cdFx0cmV0dXJuIGZpbGVNYXRjaGVzXG5cdFx0XHQuZmlsdGVyKHJlc291cmNlID0+ICFleGNsdWRlcy5oYXMocmVzb3VyY2UpKVxuXHRcdFx0Lm1hcChyZXNvdXJjZSA9PiB0aGlzLmNyZWF0ZUFueXRoaW5nUGljayhyZXNvdXJjZSwgY29uZmlndXJhdGlvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0ZpbGVTZWFyY2gocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0Y29uc3QgW2ZpbGVTZWFyY2hSZXN1bHRzLCByZWxhdGl2ZVBhdGhGaWxlUmVzdWx0c10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cblx0XHRcdC8vIEZpbGUgc2VhcmNoOiB0aGlzIGlzIGEgc2VhcmNoIG92ZXIgYWxsIGZpbGVzIG9mIHRoZSB3b3Jrc3BhY2UgdXNpbmcgdGhlIHByb3ZpZGVkIHBhdHRlcm5cblx0XHRcdHRoaXMuZ2V0RmlsZVNlYXJjaFJlc3VsdHMocXVlcnksIHRva2VuKSxcblxuXHRcdFx0Ly8gUmVsYXRpdmUgcGF0aCBzZWFyY2g6IHdlIGFsc28gd2FudCB0byBjb25zaWRlciByZXN1bHRzIHRoYXQgbWF0Y2ggZmlsZXMgaW5zaWRlIHRoZSB3b3Jrc3BhY2Vcblx0XHRcdC8vIGJ5IGxvb2tpbmcgZm9yIHJlbGF0aXZlIHBhdGhzIHRoYXQgdGhlIHVzZXIgdHlwZWQgYXMgcXVlcnkuIFRoaXMgYWxsb3dzIHRvIHJldHVybiBldmVuIGV4Y2x1ZGVkXG5cdFx0XHQvLyByZXN1bHRzIGludG8gdGhlIHBpY2tlciBpZiBmb3VuZCAoZS5nLiBoZWxwcyBmb3Igb3BlbmluZyBjb21waWxhdGlvbiByZXN1bHRzIHRoYXQgYXJlIG90aGVyd2lzZVxuXHRcdFx0Ly8gZXhjbHVkZWQpXG5cdFx0XHR0aGlzLmdldFJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzKHF1ZXJ5LCB0b2tlbilcblx0XHRdKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiBxdWlja2x5IGlmIG5vIHJlbGF0aXZlIHJlc3VsdHMgYXJlIHByZXNlbnRcblx0XHRpZiAoIXJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzKSB7XG5cdFx0XHRyZXR1cm4gZmlsZVNlYXJjaFJlc3VsdHM7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlLCBtYWtlIHN1cmUgdG8gZmlsdGVyIHJlbGF0aXZlIHBhdGggcmVzdWx0cyBmcm9tXG5cdFx0Ly8gdGhlIHNlYXJjaCByZXN1bHRzIHRvIHByZXZlbnQgZHVwbGljYXRlc1xuXHRcdGNvbnN0IHJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzTWFwID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRmb3IgKGNvbnN0IHJlbGF0aXZlUGF0aEZpbGVSZXN1bHQgb2YgcmVsYXRpdmVQYXRoRmlsZVJlc3VsdHMpIHtcblx0XHRcdHJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzTWFwLnNldChyZWxhdGl2ZVBhdGhGaWxlUmVzdWx0LCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0Li4uZmlsZVNlYXJjaFJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhcmVsYXRpdmVQYXRoRmlsZVJlc3VsdHNNYXAuaGFzKHJlc3VsdCkpLFxuXHRcdFx0Li4ucmVsYXRpdmVQYXRoRmlsZVJlc3VsdHNcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogSVByZXBhcmVkUXVlcnksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblxuXHRcdC8vIGZpbGVQYXR0ZXJuIGZvciBzZWFyY2ggZGVwZW5kcyBvbiB0aGUgbnVtYmVyIG9mIHF1ZXJpZXMgaW4gaW5wdXQ6XG5cdFx0Ly8gLSB3aXRoIG11bHRpcGxlOiBvbmx5IHRha2UgdGhlIGZpcnN0IG9uZSBhbmQgbGV0IHRoZSBmaWx0ZXIgbGF0ZXIgZHJvcCBub24tbWF0Y2hpbmcgcmVzdWx0c1xuXHRcdC8vIC0gd2l0aCBzaW5nbGU6IGp1c3QgdGFrZSB0aGUgb3JpZ2luYWwgaW4gZnVsbFxuXHRcdC8vXG5cdFx0Ly8gVGhpcyBlbmFibGVzIHRvIGUuZy4gc2VhcmNoIGZvciBcInNvbWVGaWxlIHNvbWVGb2xkZXJcIiBieSBvbmx5IHJldHVybmluZ1xuXHRcdC8vIHNlYXJjaCByZXN1bHRzIGZvciBcInNvbWVGaWxlXCIgYW5kIG5vdCBib3RoIHRoYXQgd291bGQgbm9ybWFsbHkgbm90IG1hdGNoLlxuXHRcdC8vXG5cdFx0bGV0IGZpbGVQYXR0ZXJuID0gJyc7XG5cdFx0aWYgKHF1ZXJ5LnZhbHVlcyAmJiBxdWVyeS52YWx1ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0ZmlsZVBhdHRlcm4gPSBxdWVyeS52YWx1ZXNbMF0ub3JpZ2luYWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbGVQYXR0ZXJuID0gcXVlcnkub3JpZ2luYWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZVNlYXJjaFJlc3VsdHMgPSBhd2FpdCB0aGlzLmRvR2V0RmlsZVNlYXJjaFJlc3VsdHMoZmlsZVBhdHRlcm4sIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBkZXRlY3QgdGhhdCB0aGUgc2VhcmNoIGxpbWl0IGhhcyBiZWVuIGhpdCBhbmQgd2UgaGF2ZSBhIHF1ZXJ5XG5cdFx0Ly8gdGhhdCB3YXMgY29tcG9zZWQgb2YgbXVsdGlwbGUgaW5wdXRzIHdoZXJlIHdlIG9ubHkgdG9vayB0aGUgZmlyc3QgcGFydFxuXHRcdC8vIHdlIHJ1biBhbm90aGVyIHNlYXJjaCB3aXRoIHRoZSBmdWxsIG9yaWdpbmFsIHF1ZXJ5IGluY2x1ZGVkIHRvIG1ha2Vcblx0XHQvLyBzdXJlIHdlIGFyZSBpbmNsdWRpbmcgYWxsIHBvc3NpYmxlIHJlc3VsdHMgdGhhdCBjb3VsZCBtYXRjaC5cblx0XHRpZiAoZmlsZVNlYXJjaFJlc3VsdHMubGltaXRIaXQgJiYgcXVlcnkudmFsdWVzICYmIHF1ZXJ5LnZhbHVlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBhZGRpdGlvbmFsRmlsZVNlYXJjaFJlc3VsdHMgPSBhd2FpdCB0aGlzLmRvR2V0RmlsZVNlYXJjaFJlc3VsdHMocXVlcnkub3JpZ2luYWwsIHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbWVtYmVyIHdoaWNoIHJlc3VsdCB3ZSBhbHJlYWR5IGNvdmVyZWRcblx0XHRcdGNvbnN0IGV4aXN0aW5nRmlsZVNlYXJjaFJlc3VsdHNNYXAgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4odXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlU2VhcmNoUmVzdWx0IG9mIGZpbGVTZWFyY2hSZXN1bHRzLnJlc3VsdHMpIHtcblx0XHRcdFx0ZXhpc3RpbmdGaWxlU2VhcmNoUmVzdWx0c01hcC5zZXQoZmlsZVNlYXJjaFJlc3VsdC5yZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZCBhbGwgYWRkaXRpb25hbCByZXN1bHRzIHRvIHRoZSBvcmlnaW5hbCBzZXQgZm9yIGluY2x1c2lvblxuXHRcdFx0Zm9yIChjb25zdCBhZGRpdGlvbmFsRmlsZVNlYXJjaFJlc3VsdCBvZiBhZGRpdGlvbmFsRmlsZVNlYXJjaFJlc3VsdHMucmVzdWx0cykge1xuXHRcdFx0XHRpZiAoIWV4aXN0aW5nRmlsZVNlYXJjaFJlc3VsdHNNYXAuaGFzKGFkZGl0aW9uYWxGaWxlU2VhcmNoUmVzdWx0LnJlc291cmNlKSkge1xuXHRcdFx0XHRcdGZpbGVTZWFyY2hSZXN1bHRzLnJlc3VsdHMucHVzaChhZGRpdGlvbmFsRmlsZVNlYXJjaFJlc3VsdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZVNlYXJjaFJlc3VsdHMucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0RmlsZVNlYXJjaFJlc3VsdHMoZmlsZVBhdHRlcm46IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0cmV0dXJuIHRoaXMuc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKFxuXHRcdFx0dGhpcy5maWxlUXVlcnlCdWlsZGVyLmZpbGUoXG5cdFx0XHRcdHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycyxcblx0XHRcdFx0dGhpcy5nZXRGaWxlUXVlcnlPcHRpb25zKHtcblx0XHRcdFx0XHRmaWxlUGF0dGVybixcblx0XHRcdFx0XHRjYWNoZUtleTogdGhpcy5waWNrU3RhdGUuZmlsZVF1ZXJ5Q2FjaGU/LmNhY2hlS2V5LFxuXHRcdFx0XHRcdG1heFJlc3VsdHM6IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlci5NQVhfUkVTVUxUU1xuXHRcdFx0XHR9KVxuXHRcdFx0KSwgdG9rZW4pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFF1aWNrQWNjZXNzIGZpbGVTZWFyY2ggJHtEYXRlLm5vdygpIC0gc3RhcnR9bXNgKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGaWxlUXVlcnlPcHRpb25zKGlucHV0OiB7IGZpbGVQYXR0ZXJuPzogc3RyaW5nOyBjYWNoZUtleT86IHN0cmluZzsgbWF4UmVzdWx0cz86IG51bWJlciB9KTogSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3JlYXNvbjogJ29wZW5GaWxlSGFuZGxlcicsIC8vIHVzZWQgZm9yIHRlbGVtZXRyeSAtIGRvIG5vdCBjaGFuZ2Vcblx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPdXRPZldvcmtzcGFjZUVkaXRvclJlc291cmNlcyksXG5cdFx0XHRmaWxlUGF0dGVybjogaW5wdXQuZmlsZVBhdHRlcm4gfHwgJycsXG5cdFx0XHRjYWNoZUtleTogaW5wdXQuY2FjaGVLZXksXG5cdFx0XHRtYXhSZXN1bHRzOiBpbnB1dC5tYXhSZXN1bHRzIHx8IDAsXG5cdFx0XHRzb3J0QnlTY29yZTogdHJ1ZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFic29sdXRlUGF0aEZpbGVSZXN1bHQocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghcXVlcnkuY29udGFpbnNQYXRoU2VwYXJhdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlckhvbWUgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0Y29uc3QgZGV0aWxkaWZpZWRRdWVyeSA9IHVudGlsZGlmeShxdWVyeS5vcmlnaW5hbCwgdXNlckhvbWUuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyB1c2VySG9tZS5mc1BhdGggOiB1c2VySG9tZS5wYXRoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0Fic29sdXRlUGF0aFF1ZXJ5ID0gKGF3YWl0IHRoaXMucGF0aFNlcnZpY2UucGF0aCkuaXNBYnNvbHV0ZShkZXRpbGRpZmllZFF1ZXJ5KTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNBYnNvbHV0ZVBhdGhRdWVyeSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b0xvY2FsUmVzb3VyY2UoXG5cdFx0XHRcdGF3YWl0IHRoaXMucGF0aFNlcnZpY2UuZmlsZVVSSShkZXRpbGRpZmllZFF1ZXJ5KSxcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHR0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWVcblx0XHRcdCk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc3RhdC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5tYXRjaEZpbGVuYW1lQ2FzaW5nKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWdub3JlIGlmIGZpbGUgZG9lcyBub3QgZXhpc3Rcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghcXVlcnkuY29udGFpbnNQYXRoU2VwYXJhdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29udmVydCByZWxhdGl2ZSBwYXRocyB0byBhYnNvbHV0ZSBwYXRocyBvdmVyIGFsbCBmb2xkZXJzIG9mIHRoZSB3b3Jrc3BhY2Vcblx0XHQvLyBhbmQgcmV0dXJuIHRoZW0gYXMgcmVzdWx0cyBpZiB0aGUgYWJzb2x1dGUgcGF0aHMgZXhpc3Rcblx0XHRjb25zdCBpc0Fic29sdXRlUGF0aFF1ZXJ5ID0gKGF3YWl0IHRoaXMucGF0aFNlcnZpY2UucGF0aCkuaXNBYnNvbHV0ZShxdWVyeS5vcmlnaW5hbCk7XG5cdFx0aWYgKCFpc0Fic29sdXRlUGF0aFF1ZXJ5KSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRvTG9jYWxSZXNvdXJjZShcblx0XHRcdFx0XHRmb2xkZXIudG9SZXNvdXJjZShxdWVyeS5vcmlnaW5hbCksXG5cdFx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRcdHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHN0YXQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMucHVzaChhd2FpdCB0aGlzLm1hdGNoRmlsZW5hbWVDYXNpbmcocmVzb3VyY2UpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlIGlmIGZpbGUgZG9lcyBub3QgZXhpc3Rcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VzO1xuXHRcdH1cblxuXHRcdHJldHVybjtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRlbXB0cyB0byBtYXRjaCB0aGUgZmlsZW5hbWUgY2FzaW5nIHRvIGZpbGUgc3lzdGVtIGJ5IGNoZWNraW5nIHRoZSBwYXJlbnQgZm9sZGVyJ3MgY2hpbGRyZW4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIG1hdGNoRmlsZW5hbWVDYXNpbmcocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgcGFyZW50ID0gZGlybmFtZShyZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShwYXJlbnQsIHsgcmVzb2x2ZVRvOiBbcmVzb3VyY2VdIH0pO1xuXHRcdGlmIChzdGF0Py5jaGlsZHJlbikge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBzdGF0LmNoaWxkcmVuLmZpbmQoY2hpbGQgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoY2hpbGQucmVzb3VyY2UsIHJlc291cmNlKSk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIFVSSS5qb2luUGF0aChwYXJlbnQsIG1hdGNoLm5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQ29tbWFuZCBDZW50ZXIgKGlmIGVuYWJsZWQpXG5cblx0cHJpdmF0ZSByZWFkb25seSBsYXp5UmVnaXN0cnkgPSBuZXcgTGF6eSgoKSA9PiBSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXG5cdHByaXZhdGUgZ2V0SGVscFBpY2tzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElBbnl0aGluZ1F1aWNrUGlja0l0ZW1bXSB7XG5cdFx0aWYgKHF1ZXJ5Lm5vcm1hbGl6ZWQpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gSWYgdGhlcmUncyBhIGZpbHRlciwgd2UgZG9uJ3Qgc2hvdyB0aGUgaGVscFxuXHRcdH1cblxuXHRcdHR5cGUgSUhlbHBBbnl0aGluZ1F1aWNrUGlja0l0ZW0gPSBJQW55dGhpbmdRdWlja1BpY2tJdGVtICYgeyBjb21tYW5kQ2VudGVyT3JkZXI6IG51bWJlciB9O1xuXHRcdGNvbnN0IHByb3ZpZGVyczogSUhlbHBBbnl0aGluZ1F1aWNrUGlja0l0ZW1bXSA9IHRoaXMubGF6eVJlZ2lzdHJ5LnZhbHVlLmdldFF1aWNrQWNjZXNzUHJvdmlkZXJzKHRoaXMuY29udGV4dEtleVNlcnZpY2UpXG5cdFx0XHQuZmlsdGVyKHAgPT4gcC5oZWxwRW50cmllcy5zb21lKGggPT4gaC5jb21tYW5kQ2VudGVyT3JkZXIgIT09IHVuZGVmaW5lZCkpXG5cdFx0XHQuZmxhdE1hcChwcm92aWRlciA9PiBwcm92aWRlci5oZWxwRW50cmllc1xuXHRcdFx0XHQuZmlsdGVyKGggPT4gaC5jb21tYW5kQ2VudGVyT3JkZXIgIT09IHVuZGVmaW5lZClcblx0XHRcdFx0Lm1hcChoZWxwRW50cnkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyU3BlY2lmaWNPcHRpb25zOiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zIHwgdW5kZWZpbmVkID0ge1xuXHRcdFx0XHRcdFx0Li4ucnVuT3B0aW9ucyxcblx0XHRcdFx0XHRcdGluY2x1ZGVIZWxwOiBwcm92aWRlci5wcmVmaXggPT09IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVggPyBmYWxzZSA6IHJ1bk9wdGlvbnM/LmluY2x1ZGVIZWxwXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gaGVscEVudHJ5LmNvbW1hbmRDZW50ZXJMYWJlbCA/PyBoZWxwRW50cnkuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGhlbHBFbnRyeS5wcmVmaXggPz8gcHJvdmlkZXIucHJlZml4LFxuXHRcdFx0XHRcdFx0Y29tbWFuZENlbnRlck9yZGVyOiBoZWxwRW50cnkuY29tbWFuZENlbnRlck9yZGVyISxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmc6IGhlbHBFbnRyeS5jb21tYW5kSWQgPyB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoaGVscEVudHJ5LmNvbW1hbmRJZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdoZWxwUGlja0FyaWFMYWJlbCcsIFwiezB9LCB7MX1cIiwgbGFiZWwsIGhlbHBFbnRyeS5kZXNjcmlwdGlvbiksXG5cdFx0XHRcdFx0XHRhY2NlcHQ6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KHByb3ZpZGVyLnByZWZpeCwge1xuXHRcdFx0XHRcdFx0XHRcdHByZXNlcnZlVmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0cHJvdmlkZXJPcHRpb25zOiBwcm92aWRlclNwZWNpZmljT3B0aW9uc1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSk7XG5cblx0XHQvLyBUT0RPOiBUaGVyZSBoYXMgdG8gYmUgYSBiZXR0ZXIgcGxhY2UgZm9yIHRoaXMsIGJ1dCBpdCdzIHRoZSBmaXJzdCB0aW1lIHdlIGFyZSBhZGRpbmcgYSBub24tcXVpY2sgYWNjZXNzIHByb3ZpZGVyXG5cdFx0Ly8gdG8gdGhlIGNvbW1hbmQgY2VudGVyLCBzbyBmb3Igbm93LCBsZXQncyBkbyB0aGlzLlxuXHRcdGlmICh0aGlzLnF1aWNrQ2hhdFNlcnZpY2UuZW5hYmxlZCkge1xuXHRcdFx0cHJvdmlkZXJzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQnLCBcIk9wZW4gUXVpY2sgQ2hhdFwiKSxcblx0XHRcdFx0Y29tbWFuZENlbnRlck9yZGVyOiAzMCxcblx0XHRcdFx0a2V5YmluZGluZzogdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFTS19RVUlDS19RVUVTVElPTl9BQ1RJT05fSUQpLFxuXHRcdFx0XHRhY2NlcHQ6ICgpID0+IHRoaXMucXVpY2tDaGF0U2VydmljZS50b2dnbGUoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3ZpZGVycy5zb3J0KChhLCBiKSA9PiBhLmNvbW1hbmRDZW50ZXJPcmRlciAtIGIuY29tbWFuZENlbnRlck9yZGVyKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBXb3Jrc3BhY2UgU3ltYm9scyAoaWYgZW5hYmxlZClcblxuXHRwcml2YXRlIHdvcmtzcGFjZVN5bWJvbHNRdWlja0FjY2VzczogU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXI7XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRXb3Jrc3BhY2VTeW1ib2xQaWNrcyhxdWVyeTogSVByZXBhcmVkUXVlcnksIGluY2x1ZGVTeW1ib2xzOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiB7XG5cdFx0aWYgKFxuXHRcdFx0IXF1ZXJ5Lm5vcm1hbGl6ZWQgfHxcdC8vIHdlIG5lZWQgYSB2YWx1ZSBmb3Igc2VhcmNoIGZvclxuXHRcdFx0IWluY2x1ZGVTeW1ib2xzIHx8XHRcdC8vIHdlIG5lZWQgdG8gZW5hYmxlIHN5bWJvbHMgaW4gc2VhcmNoXG5cdFx0XHR0aGlzLnBpY2tTdGF0ZS5sYXN0UmFuZ2VcdFx0XHRcdC8vIGEgcmFuZ2UgaXMgYW4gaW5kaWNhdG9yIGZvciBqdXN0IHNlYXJjaGluZyBmb3IgZmlsZXNcblx0XHQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBEZWxlZ2F0ZSB0byB0aGUgZXhpc3Rpbmcgc3ltYm9scyBxdWljayBhY2Nlc3Ncblx0XHQvLyBidXQgc2tpcCBsb2NhbCByZXN1bHRzIGFuZCBhbHNvIGRvIG5vdCBzY29yZVxuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVN5bWJvbHNRdWlja0FjY2Vzcy5nZXRTeW1ib2xQaWNrcyhxdWVyeS5vcmlnaW5hbCwge1xuXHRcdFx0c2tpcExvY2FsOiB0cnVlLFxuXHRcdFx0c2tpcFNvcnRpbmc6IHRydWUsXG5cdFx0XHRkZWxheTogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLlRZUElOR19TRUFSQ0hfREVMQVlcblx0XHR9LCB0b2tlbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgU3ltYm9scyAoaWYgbmFycm93aW5nIGRvd24gaW50byBhIGdsb2JhbCBwaWNrIHZpYSBgQGApXG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JTeW1ib2xzUXVpY2tBY2Nlc3M6IEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyO1xuXG5cdHByaXZhdGUgZ2V0RWRpdG9yU3ltYm9sUGlja3MocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFBpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiB8IG51bGwge1xuXHRcdGNvbnN0IGZpbHRlclNlZ21lbnRzID0gcXVlcnkub3JpZ2luYWwuc3BsaXQoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYKTtcblx0XHRjb25zdCBmaWx0ZXIgPSBmaWx0ZXJTZWdtZW50cy5sZW5ndGggPiAxID8gZmlsdGVyU2VnbWVudHNbZmlsdGVyU2VnbWVudHMubGVuZ3RoIC0gMV0udHJpbSgpIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZmlsdGVyICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIG51bGw7IC8vIHdlIG5lZWQgdG8gYmUgc2VhcmNoZWQgZm9yIGVkaXRvciBzeW1ib2xzIHZpYSBgQGBcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVHbG9iYWxQaWNrID0gdGhpcy5waWNrU3RhdGUubGFzdEdsb2JhbFBpY2tzPy5hY3RpdmU7XG5cdFx0aWYgKCFhY3RpdmVHbG9iYWxQaWNrKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDsgLy8gd2UgbmVlZCBhbiBhY3RpdmUgZ2xvYmFsIHBpY2sgdG8gZmluZCBzeW1ib2xzIGZvclxuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUdsb2JhbFJlc291cmNlID0gYWN0aXZlR2xvYmFsUGljay5yZXNvdXJjZTtcblx0XHRpZiAoIWFjdGl2ZUdsb2JhbFJlc291cmNlIHx8ICghdGhpcy5maWxlU2VydmljZS5oYXNQcm92aWRlcihhY3RpdmVHbG9iYWxSZXNvdXJjZSkgJiYgYWN0aXZlR2xvYmFsUmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7IC8vIHdlIG5lZWQgYSByZXNvdXJjZSB0aGF0IHdlIGNhbiByZXNvbHZlXG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2ZUdsb2JhbFBpY2subGFiZWwuaW5jbHVkZXMoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYKSB8fCBhY3RpdmVHbG9iYWxQaWNrLmRlc2NyaXB0aW9uPy5pbmNsdWRlcyhHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgpKSB7XG5cdFx0XHRpZiAoZmlsdGVyU2VnbWVudHMubGVuZ3RoIDwgMykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDsgLy8gcmVxdWlyZSBhdCBsZWFzdCAyIGBAYCBpZiBvdXIgYWN0aXZlIHBpY2sgY29udGFpbnMgYEBgIGluIGxhYmVsIG9yIGRlc2NyaXB0aW9uXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRFZGl0b3JTeW1ib2xQaWNrcyhhY3RpdmVHbG9iYWxQaWNrLCBhY3RpdmVHbG9iYWxSZXNvdXJjZSwgZmlsdGVyLCBkaXNwb3NhYmxlcywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0dldEVkaXRvclN5bWJvbFBpY2tzKGFjdGl2ZUdsb2JhbFBpY2s6IElBbnl0aGluZ1F1aWNrUGlja0l0ZW0sIGFjdGl2ZUdsb2JhbFJlc291cmNlOiBVUkksIGZpbHRlcjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFBpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiB7XG5cblx0XHQvLyBCcmluZyB0aGUgZWRpdG9yIHRvIGZyb250IHRvIHJldmlldyBzeW1ib2xzIHRvIGdvIHRvXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gd2UgbXVzdCByZW1lbWJlciBvdXIgY3VycmVudCB2aWV3IHN0YXRlIHRvIGJlIGFibGUgdG8gcmVzdG9yZVxuXHRcdFx0dGhpcy5waWNrU3RhdGUuZWRpdG9yVmlld1N0YXRlLnNldCgpO1xuXG5cdFx0XHQvLyBvcGVuIGl0XG5cdFx0XHRhd2FpdCB0aGlzLnBpY2tTdGF0ZS5lZGl0b3JWaWV3U3RhdGUub3BlblRyYW5zaWVudEVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBhY3RpdmVHbG9iYWxSZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgaWdub3JlRXJyb3I6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBbXTsgLy8gcmV0dXJuIGlmIHJlc291cmNlIGNhbm5vdCBiZSBvcGVuZWRcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBPYnRhaW4gbW9kZWwgZnJvbSByZXNvdXJjZVxuXHRcdGxldCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKGFjdGl2ZUdsb2JhbFJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtb2RlbFJlZmVyZW5jZSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoYWN0aXZlR2xvYmFsUmVzb3VyY2UpKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bW9kZWwgPSBtb2RlbFJlZmVyZW5jZS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIFtdOyAvLyByZXR1cm4gaWYgbW9kZWwgY2Fubm90IGJlIHJlc29sdmVkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXNrIHByb3ZpZGVyIGZvciBlZGl0b3Igc3ltYm9sc1xuXHRcdGNvbnN0IGVkaXRvclN5bWJvbFBpY2tzID0gKGF3YWl0IHRoaXMuZWRpdG9yU3ltYm9sc1F1aWNrQWNjZXNzLmdldFN5bWJvbFBpY2tzKG1vZGVsLCBmaWx0ZXIsIHsgZXh0cmFDb250YWluZXJMYWJlbDogc3RyaXBJY29ucyhhY3RpdmVHbG9iYWxQaWNrLmxhYmVsKSB9LCBkaXNwb3NhYmxlcywgdG9rZW4pKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yU3ltYm9sUGlja3MubWFwKGVkaXRvclN5bWJvbFBpY2sgPT4ge1xuXG5cdFx0XHQvLyBQcmVzZXJ2ZSBzZXBhcmF0b3JzXG5cdFx0XHRpZiAoZWRpdG9yU3ltYm9sUGljay50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yU3ltYm9sUGljaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCBlZGl0b3Igc3ltYm9scyB0byBhbnl0aGluZyBwaWNrXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5lZGl0b3JTeW1ib2xQaWNrLFxuXHRcdFx0XHRyZXNvdXJjZTogYWN0aXZlR2xvYmFsUmVzb3VyY2UsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3JTeW1ib2xQaWNrLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHR0cmlnZ2VyOiAoYnV0dG9uSW5kZXgsIGtleU1vZHMpID0+IHtcblx0XHRcdFx0XHR0aGlzLm9wZW5Bbnl0aGluZyhhY3RpdmVHbG9iYWxSZXNvdXJjZSwgeyBrZXlNb2RzLCByYW5nZTogZWRpdG9yU3ltYm9sUGljay5yYW5nZT8uc2VsZWN0aW9uLCBmb3JjZU9wZW5TaWRlQnlTaWRlOiB0cnVlIH0pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2NlcHQ6IChrZXlNb2RzLCBldmVudCkgPT4gdGhpcy5vcGVuQW55dGhpbmcoYWN0aXZlR2xvYmFsUmVzb3VyY2UsIHsga2V5TW9kcywgcmFuZ2U6IGVkaXRvclN5bWJvbFBpY2sucmFuZ2U/LnNlbGVjdGlvbiwgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLCBmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kIH0pXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0YWRkRGVjb3JhdGlvbnMoZWRpdG9yOiBJRWRpdG9yLCByYW5nZTogSVJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JTeW1ib2xzUXVpY2tBY2Nlc3MuYWRkRGVjb3JhdGlvbnMoZWRpdG9yLCByYW5nZSk7XG5cdH1cblxuXHRjbGVhckRlY29yYXRpb25zKGVkaXRvcjogSUVkaXRvcik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yU3ltYm9sc1F1aWNrQWNjZXNzLmNsZWFyRGVjb3JhdGlvbnMoZWRpdG9yKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIEhlbHBlcnNcblxuXHRwcml2YXRlIGNyZWF0ZUFueXRoaW5nUGljayhyZXNvdXJjZU9yRWRpdG9yOiBVUkkgfCBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCBjb25maWd1cmF0aW9uOiB7IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uOiAncmlnaHQnIHwgJ2Rvd24nIHwgdW5kZWZpbmVkIH0pOiBJQW55dGhpbmdRdWlja1BpY2tJdGVtIHtcblx0XHRjb25zdCBpc0VkaXRvckhpc3RvcnlFbnRyeSA9ICFVUkkuaXNVcmkocmVzb3VyY2VPckVkaXRvcik7XG5cblx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNEaXJ0eTogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZXh0cmFDbGFzc2VzOiBzdHJpbmdbXTtcblx0XHRsZXQgaWNvbjogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQocmVzb3VyY2VPckVkaXRvcikpIHtcblx0XHRcdHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShyZXNvdXJjZU9yRWRpdG9yKTtcblx0XHRcdGxhYmVsID0gcmVzb3VyY2VPckVkaXRvci5nZXROYW1lKCk7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IHJlc291cmNlT3JFZGl0b3IuZ2V0RGVzY3JpcHRpb24oKTtcblx0XHRcdGlzRGlydHkgPSByZXNvdXJjZU9yRWRpdG9yLmlzRGlydHkoKSAmJiAhcmVzb3VyY2VPckVkaXRvci5pc1NhdmluZygpO1xuXHRcdFx0ZXh0cmFDbGFzc2VzID0gcmVzb3VyY2VPckVkaXRvci5nZXRMYWJlbEV4dHJhQ2xhc3NlcygpO1xuXHRcdFx0aWNvbiA9IHJlc291cmNlT3JFZGl0b3IuZ2V0SWNvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IFVSSS5pc1VyaShyZXNvdXJjZU9yRWRpdG9yKSA/IHJlc291cmNlT3JFZGl0b3IgOiByZXNvdXJjZU9yRWRpdG9yLnJlc291cmNlO1xuXHRcdFx0Y29uc3QgY3VzdG9tTGFiZWwgPSB0aGlzLmN1c3RvbUVkaXRvckxhYmVsU2VydmljZS5nZXROYW1lKHJlc291cmNlKTtcblx0XHRcdGxhYmVsID0gY3VzdG9tTGFiZWwgfHwgYmFzZW5hbWVPckF1dGhvcml0eShyZXNvdXJjZSk7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKCEhY3VzdG9tTGFiZWwgPyByZXNvdXJjZSA6IGRpcm5hbWUocmVzb3VyY2UpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0aXNEaXJ0eSA9IHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkocmVzb3VyY2UpICYmICF0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaGFzU2hvcnRBdXRvU2F2ZURlbGF5KHJlc291cmNlKTtcblx0XHRcdGV4dHJhQ2xhc3NlcyA9IFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsQW5kRGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbiA/IGAke2xhYmVsfSAke2Rlc2NyaXB0aW9ufWAgOiBsYWJlbDtcblxuXHRcdGNvbnN0IGljb25DbGFzc2VzVmFsdWUgPSBuZXcgTGF6eSgoKSA9PiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlLCB1bmRlZmluZWQsIGljb24pLmNvbmNhdChleHRyYUNsYXNzZXMpKTtcblxuXHRcdGNvbnN0IGJ1dHRvbnNWYWx1ZSA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHRcdGNvbnN0IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID0gY29uZmlndXJhdGlvbi5vcGVuU2lkZUJ5U2lkZURpcmVjdGlvbjtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblxuXHRcdFx0Ly8gT3BlbiB0byBzaWRlIC8gYmVsb3dcblx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdGljb25DbGFzczogb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zcGxpdEhvcml6b250YWwpIDogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRWZXJ0aWNhbCksXG5cdFx0XHRcdHRvb2x0aXA6IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID9cblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ29wZW5Ub1NpZGUnLCBjb21tZW50OiBbJ09wZW4gdGhpcyBmaWxlIGluIGEgc3BsaXQgZWRpdG9yIG9uIHRoZSBsZWZ0L3JpZ2h0IHNpZGUnXSB9LCBcIk9wZW4gdG8gdGhlIFNpZGVcIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKHsga2V5OiAnb3BlblRvQm90dG9tJywgY29tbWVudDogWydPcGVuIHRoaXMgZmlsZSBpbiBhIHNwbGl0IGVkaXRvciBvbiB0aGUgYm90dG9tJ10gfSwgXCJPcGVuIHRvIHRoZSBCb3R0b21cIilcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBIaXN0b3J5XG5cdFx0XHRpZiAoaXNFZGl0b3JIaXN0b3J5RW50cnkpIHtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRpY29uQ2xhc3M6IGlzRGlydHkgPyAoJ2RpcnR5LWFueXRoaW5nICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jaXJjbGVGaWxsZWQpKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2xvc2VFZGl0b3InLCBcIlJlbW92ZSBmcm9tIFJlY2VudGx5IE9wZW5lZFwiKSxcblx0XHRcdFx0XHRhbHdheXNWaXNpYmxlOiBpc0RpcnR5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYnV0dG9ucztcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0YXJpYUxhYmVsOiBpc0RpcnR5ID8gbG9jYWxpemUoJ2ZpbGVQaWNrQXJpYUxhYmVsRGlydHknLCBcInswfSB1bnNhdmVkIGNoYW5nZXNcIiwgbGFiZWxBbmREZXNjcmlwdGlvbikgOiBsYWJlbEFuZERlc2NyaXB0aW9uLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRpY29uUGF0aDogVVJJLmlzVXJpKGljb24pID8geyBkYXJrOiBpY29uIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRnZXQgaWNvbkNsYXNzZXMoKSB7IHJldHVybiBpY29uQ2xhc3Nlc1ZhbHVlLnZhbHVlOyB9LFxuXHRcdFx0Z2V0IGJ1dHRvbnMoKSB7IHJldHVybiBidXR0b25zVmFsdWUudmFsdWU7IH0sXG5cdFx0XHR0cmlnZ2VyOiAoYnV0dG9uSW5kZXgsIGtleU1vZHMpID0+IHtcblx0XHRcdFx0c3dpdGNoIChidXR0b25JbmRleCkge1xuXG5cdFx0XHRcdFx0Ly8gT3BlbiB0byBzaWRlIC8gYmVsb3dcblx0XHRcdFx0XHRjYXNlIDA6XG5cdFx0XHRcdFx0XHR0aGlzLm9wZW5Bbnl0aGluZyhyZXNvdXJjZU9yRWRpdG9yLCB7IGtleU1vZHMsIHJhbmdlOiB0aGlzLnBpY2tTdGF0ZS5sYXN0UmFuZ2UsIGZvcmNlT3BlblNpZGVCeVNpZGU6IHRydWUgfSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblxuXHRcdFx0XHRcdC8vIFJlbW92ZSBmcm9tIEhpc3Rvcnlcblx0XHRcdFx0XHRjYXNlIDE6XG5cdFx0XHRcdFx0XHRpZiAoIVVSSS5pc1VyaShyZXNvdXJjZU9yRWRpdG9yKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhpc3RvcnlTZXJ2aWNlLnJlbW92ZUZyb21IaXN0b3J5KHJlc291cmNlT3JFZGl0b3IpO1xuXG5cdFx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLlJFTU9WRV9JVEVNO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uTk9fQUNUSU9OO1xuXHRcdFx0fSxcblx0XHRcdGFjY2VwdDogKGtleU1vZHMsIGV2ZW50KSA9PiB0aGlzLm9wZW5Bbnl0aGluZyhyZXNvdXJjZU9yRWRpdG9yLCB7IGtleU1vZHMsIHJhbmdlOiB0aGlzLnBpY2tTdGF0ZS5sYXN0UmFuZ2UsIHByZXNlcnZlRm9jdXM6IGV2ZW50LmluQmFja2dyb3VuZCwgZm9yY2VQaW5uZWQ6IGV2ZW50LmluQmFja2dyb3VuZCB9KSxcblx0XHRcdGF0dGFjaDogKGtleU1vZHMsIGV2ZW50KSA9PiB7XG5cdFx0XHRcdC8vIE9ubHkgc3VwcG9ydCBhZGRpbmcgY29udGV4dCB0byBjaGF0IHdoZW4gc2hpZnQgaXMgcHJlc3NlZFxuXHRcdFx0XHRpZiAoa2V5TW9kcy5zaGlmdCkge1xuXHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0XHRcdFx0aWYgKHdpZGdldCAmJiByZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHdpZGdldC5hdHRhY2htZW50TW9kZWwuYXNGaWxlVmFyaWFibGVFbnRyeShyZXNvdXJjZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGYWxsYmFjayB0byBhY2NlcHQgYmVoYXZpb3IuXG5cdFx0XHRcdHRoaXMub3BlbkFueXRoaW5nKHJlc291cmNlT3JFZGl0b3IsIHsga2V5TW9kcywgcmFuZ2U6IHRoaXMucGlja1N0YXRlLmxhc3RSYW5nZSwgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLCBmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Bbnl0aGluZyhyZXNvdXJjZU9yRWRpdG9yOiBVUkkgfCBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCBvcHRpb25zOiB7IGtleU1vZHM/OiBJS2V5TW9kczsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IHJhbmdlPzogSVJhbmdlOyBmb3JjZU9wZW5TaWRlQnlTaWRlPzogYm9vbGVhbjsgZm9yY2VQaW5uZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIENyYWZ0IHNvbWUgZWRpdG9yIG9wdGlvbnMgYmFzZWQgb24gcXVpY2sgYWNjZXNzIHVzYWdlXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0cHJlc2VydmVGb2N1czogb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0cGlubmVkOiBvcHRpb25zLmtleU1vZHM/LmN0cmxDbWQgfHwgb3B0aW9ucy5mb3JjZVBpbm5lZCB8fCB0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkVkaXRvclBpbm5lZCxcblx0XHRcdHNlbGVjdGlvbjogb3B0aW9ucy5yYW5nZVxuXHRcdH07XG5cblx0XHRjb25zdCB0YXJnZXRHcm91cCA9IG9wdGlvbnMua2V5TW9kcz8uYWx0IHx8ICh0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkVkaXRvclBpbm5lZCAmJiBvcHRpb25zLmtleU1vZHM/LmN0cmxDbWQpIHx8IG9wdGlvbnMuZm9yY2VPcGVuU2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVA7XG5cblx0XHQvLyBSZXN0b3JlIGFueSB2aWV3IHN0YXRlIGlmIHRoZSB0YXJnZXQgaXMgdGhlIHNpZGUgZ3JvdXBcblx0XHRpZiAodGFyZ2V0R3JvdXAgPT09IFNJREVfR1JPVVApIHtcblx0XHRcdGF3YWl0IHRoaXMucGlja1N0YXRlLmVkaXRvclZpZXdTdGF0ZS5yZXN0b3JlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBlZGl0b3IgKHR5cGVkKVxuXHRcdGlmIChpc0VkaXRvcklucHV0KHJlc291cmNlT3JFZGl0b3IpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihyZXNvdXJjZU9yRWRpdG9yLCBlZGl0b3JPcHRpb25zLCB0YXJnZXRHcm91cCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBlZGl0b3IgKHVudHlwZWQpXG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgcmVzb3VyY2VFZGl0b3JJbnB1dDogSVJlc291cmNlRWRpdG9ySW5wdXQ7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlT3JFZGl0b3IpKSB7XG5cdFx0XHRcdHJlc291cmNlRWRpdG9ySW5wdXQgPSB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlT3JFZGl0b3IsXG5cdFx0XHRcdFx0b3B0aW9uczogZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb3VyY2VFZGl0b3JJbnB1dCA9IHtcblx0XHRcdFx0XHQuLi5yZXNvdXJjZU9yRWRpdG9yLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdC4uLnJlc291cmNlT3JFZGl0b3Iub3B0aW9ucyxcblx0XHRcdFx0XHRcdC4uLmVkaXRvck9wdGlvbnNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHJlc291cmNlRWRpdG9ySW5wdXQsIHRhcmdldEdyb3VwKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQXNDLDZCQUE2Qiw2QkFBcUUsc0JBQXNCLDBCQUErQztBQUM3TSxTQUFpQywyQkFBMkIscUJBQStEO0FBQzNILFNBQVMsY0FBOEIsMEJBQTBCLHNCQUF3QztBQUN6RyxTQUFtQyxvQkFBb0I7QUFDdkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0MsOEJBQTZEO0FBQ3hHLFNBQVMsc0JBQXVDO0FBQ2hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQixTQUFTLDJCQUEyQjtBQUM5RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFT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
