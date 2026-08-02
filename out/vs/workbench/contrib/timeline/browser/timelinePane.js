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
import "./media/timelinePane.css";
import { localize, localize2 } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as css from "../../../../base/browser/cssValue.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { fromNow } from "../../../../base/common/date.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { DisposableStore, Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITimelineService } from "../common/timeline.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { SideBySideEditor, EditorResourceAccessor } from "../../../common/editor.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getContextMenuActions, createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { isString } from "../../../../base/common/types.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
const ItemHeight = 22;
function isLoadMoreCommand(item) {
  return item instanceof LoadMoreCommand;
}
function isTimelineItem(item) {
  return !!item && !item.handle.startsWith("vscode-command:");
}
function updateRelativeTime(item, lastRelativeTime) {
  item.relativeTime = isTimelineItem(item) ? fromNow(item.timestamp) : void 0;
  item.relativeTimeFullWord = isTimelineItem(item) ? fromNow(item.timestamp, false, true) : void 0;
  if (lastRelativeTime === void 0 || item.relativeTime !== lastRelativeTime) {
    lastRelativeTime = item.relativeTime;
    item.hideRelativeTime = false;
  } else {
    item.hideRelativeTime = true;
  }
  return lastRelativeTime;
}
class TimelineAggregate {
  constructor(timeline) {
    this._stale = false;
    this._requiresReset = false;
    this.source = timeline.source;
    this.items = timeline.items;
    this._cursor = timeline.paging?.cursor;
    this.lastRenderedIndex = -1;
  }
  get cursor() {
    return this._cursor;
  }
  get more() {
    return this._cursor !== void 0;
  }
  get newest() {
    return this.items[0];
  }
  get oldest() {
    return this.items[this.items.length - 1];
  }
  add(timeline, options) {
    let updated = false;
    if (timeline.items.length !== 0 && this.items.length !== 0) {
      updated = true;
      const ids = /* @__PURE__ */ new Set();
      const timestamps = /* @__PURE__ */ new Set();
      for (const item2 of timeline.items) {
        if (item2.id === void 0) {
          timestamps.add(item2.timestamp);
        } else {
          ids.add(item2.id);
        }
      }
      let i = this.items.length;
      let item;
      while (i--) {
        item = this.items[i];
        if (item.id !== void 0 && ids.has(item.id) || timestamps.has(item.timestamp)) {
          this.items.splice(i, 1);
        }
      }
      if ((timeline.items[timeline.items.length - 1]?.timestamp ?? 0) >= (this.newest?.timestamp ?? 0)) {
        this.items.splice(0, 0, ...timeline.items);
      } else {
        this.items.push(...timeline.items);
      }
    } else if (timeline.items.length !== 0) {
      updated = true;
      this.items.push(...timeline.items);
    }
    if (options.cursor !== void 0 || typeof options.limit !== "object") {
      this._cursor = timeline.paging?.cursor;
    }
    if (updated) {
      this.items.sort(
        (a, b) => b.timestamp - a.timestamp || (a.source === void 0 ? b.source === void 0 ? 0 : 1 : b.source === void 0 ? -1 : b.source.localeCompare(a.source, void 0, { numeric: true, sensitivity: "base" }))
      );
    }
    return updated;
  }
  get stale() {
    return this._stale;
  }
  get requiresReset() {
    return this._requiresReset;
  }
  invalidate(requiresReset) {
    this._stale = true;
    this._requiresReset = requiresReset;
  }
}
class LoadMoreCommand {
  constructor(loading) {
    this.handle = "vscode-command:loadMore";
    this.timestamp = 0;
    this.description = void 0;
    this.tooltip = void 0;
    this.contextValue = void 0;
    // Make things easier for duck typing
    this.id = void 0;
    this.icon = void 0;
    this.iconDark = void 0;
    this.source = void 0;
    this.relativeTime = void 0;
    this.relativeTimeFullWord = void 0;
    this.hideRelativeTime = void 0;
    this._loading = false;
    this._loading = loading;
  }
  get loading() {
    return this._loading;
  }
  set loading(value) {
    this._loading = value;
  }
  get ariaLabel() {
    return this.label;
  }
  get label() {
    return this.loading ? localize("timeline.loadingMore", "Loading...") : localize("timeline.loadMore", "Load more");
  }
  get themeIcon() {
    return void 0;
  }
}
const TimelineFollowActiveEditorContext = new RawContextKey("timelineFollowActiveEditor", true, true);
const TimelineExcludeSources = new RawContextKey("timelineExcludeSources", "[]", true);
const TimelineViewFocusedContext = new RawContextKey("timelineFocused", true);
let TimelinePane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, contextKeyService, configurationService, storageService, viewDescriptorService, instantiationService, editorService, commandService, progressService, timelineService, openerService, themeService, hoverService, labelService, uriIdentityService, extensionService) {
    super({ ...options, titleMenuId: MenuId.TimelineTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.storageService = storageService;
    this.editorService = editorService;
    this.commandService = commandService;
    this.progressService = progressService;
    this.timelineService = timelineService;
    this.labelService = labelService;
    this.uriIdentityService = uriIdentityService;
    this.extensionService = extensionService;
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.timelinesBySource = /* @__PURE__ */ new Map();
    this._followActiveEditor = true;
    this._isEmpty = true;
    this._maxItemCount = 0;
    this._visibleItemCount = 0;
    this._pendingRefresh = false;
    this.commands = this._register(this.instantiationService.createInstance(TimelinePaneCommands, this));
    this.followActiveEditorContext = TimelineFollowActiveEditorContext.bindTo(this.contextKeyService);
    this.timelineExcludeSourcesContext = TimelineExcludeSources.bindTo(this.contextKeyService);
    const excludedSourcesString = storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]");
    this.timelineExcludeSourcesContext.set(excludedSourcesString);
    this.excludedSources = new Set(JSON.parse(excludedSourcesString));
    this._register(storageService.onDidChangeValue(StorageScope.PROFILE, "timeline.excludeSources", this._store)(this.onStorageServiceChanged, this));
    this._register(configurationService.onDidChangeConfiguration(this.onConfigurationChanged, this));
    this._register(timelineService.onDidChangeProviders(this.onProvidersChanged, this));
    this._register(timelineService.onDidChangeTimeline(this.onTimelineChanged, this));
    this._register(timelineService.onDidChangeUri((uri) => this.setUri(uri), this));
  }
  get followActiveEditor() {
    return this._followActiveEditor;
  }
  set followActiveEditor(value) {
    if (this._followActiveEditor === value) {
      return;
    }
    this._followActiveEditor = value;
    this.followActiveEditorContext.set(value);
    this.updateFilename(this._filename);
    if (value) {
      this.onActiveEditorChanged();
    }
  }
  get pageOnScroll() {
    if (this._pageOnScroll === void 0) {
      this._pageOnScroll = this.configurationService.getValue("timeline.pageOnScroll") ?? false;
    }
    return this._pageOnScroll;
  }
  get pageSize() {
    let pageSize = this.configurationService.getValue("timeline.pageSize");
    if (pageSize === void 0 || pageSize === null) {
      pageSize = Math.max(20, Math.floor((this.tree?.renderHeight ?? 0 / ItemHeight) + (this.pageOnScroll ? 1 : -1)));
    }
    return pageSize;
  }
  reset() {
    this.loadTimeline(true);
  }
  setUri(uri) {
    this.setUriCore(uri, true);
  }
  setUriCore(uri, disableFollowing) {
    if (disableFollowing) {
      this.followActiveEditor = false;
    }
    this.uri = uri;
    this.updateFilename(uri ? this.labelService.getUriBasenameLabel(uri) : void 0);
    this.treeRenderer?.setUri(uri);
    this.loadTimeline(true);
  }
  onStorageServiceChanged() {
    const excludedSourcesString = this.storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]");
    this.timelineExcludeSourcesContext.set(excludedSourcesString);
    this.excludedSources = new Set(JSON.parse(excludedSourcesString));
    const missing = this.timelineService.getSources().filter(({ id }) => !this.excludedSources.has(id) && !this.timelinesBySource.has(id));
    if (missing.length !== 0) {
      this.loadTimeline(true, missing.map(({ id }) => id));
    } else {
      this.refresh();
    }
  }
  onConfigurationChanged(e) {
    if (e.affectsConfiguration("timeline.pageOnScroll")) {
      this._pageOnScroll = void 0;
    }
  }
  onActiveEditorChanged() {
    if (!this.followActiveEditor || !this.isExpanded()) {
      return;
    }
    const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (this.uriIdentityService.extUri.isEqual(uri, this.uri) && uri !== void 0 || // Fallback to match on fsPath if we are dealing with files or git schemes
    uri?.fsPath === this.uri?.fsPath && (uri?.scheme === Schemas.file || uri?.scheme === "git") && (this.uri?.scheme === Schemas.file || this.uri?.scheme === "git")) {
      for (const source of this.timelineService.getSources()) {
        if (this.excludedSources.has(source.id)) {
          continue;
        }
        const timeline = this.timelinesBySource.get(source.id);
        if (timeline !== void 0 && !timeline.stale) {
          continue;
        }
        if (timeline !== void 0) {
          this.updateTimeline(timeline, timeline.requiresReset);
        } else {
          this.loadTimelineForSource(source.id, uri, true);
        }
      }
      return;
    }
    this.setUriCore(uri, false);
  }
  onProvidersChanged(e) {
    if (e.removed) {
      for (const source of e.removed) {
        this.timelinesBySource.delete(source);
      }
      this.refresh();
    }
    if (e.added) {
      this.loadTimeline(true, e.added);
    }
  }
  onTimelineChanged(e) {
    if (e?.uri === void 0 || this.uriIdentityService.extUri.isEqual(URI.revive(e.uri), this.uri)) {
      const timeline = this.timelinesBySource.get(e.id);
      if (timeline === void 0) {
        return;
      }
      if (this.isBodyVisible()) {
        this.updateTimeline(timeline, e.reset);
      } else {
        timeline.invalidate(e.reset);
      }
    }
  }
  updateFilename(filename) {
    this._filename = filename;
    if (this.followActiveEditor || !filename) {
      this.updateTitleDescription(filename);
    } else {
      this.updateTitleDescription(`${filename} (pinned)`);
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this.updateMessage();
  }
  updateMessage() {
    if (this._message !== void 0) {
      this.showMessage(this._message);
    } else {
      this.hideMessage();
    }
  }
  showMessage(message) {
    if (!this.$message) {
      return;
    }
    this.$message.classList.remove("hide");
    this.resetMessageElement();
    this.$message.textContent = message;
  }
  hideMessage() {
    this.resetMessageElement();
    this.$message.classList.add("hide");
  }
  resetMessageElement() {
    DOM.clearNode(this.$message);
  }
  get hasVisibleItems() {
    return this._visibleItemCount > 0;
  }
  clear(cancelPending) {
    this._visibleItemCount = 0;
    this._maxItemCount = this.pageSize;
    this.timelinesBySource.clear();
    if (cancelPending) {
      for (const pendingRequest of this.pendingRequests.values()) {
        pendingRequest.request.tokenSource.cancel();
        pendingRequest.dispose();
      }
      this.pendingRequests.clear();
      if (!this.isBodyVisible() && this.tree) {
        this.tree.setChildren(null, void 0);
        this._isEmpty = true;
      }
    }
  }
  async loadTimeline(reset, sources) {
    if (sources === void 0) {
      if (reset) {
        this.clear(true);
      }
      if (this.uri?.scheme === Schemas.vscodeSettings || this.uri?.scheme === Schemas.webviewPanel || this.uri?.scheme === Schemas.walkThrough) {
        this.uri = void 0;
        this.clear(false);
        this.refresh();
        return;
      }
      if (this._isEmpty && this.uri !== void 0) {
        this.setLoadingUriMessage();
      }
    }
    if (this.uri === void 0) {
      this.clear(false);
      this.refresh();
      return;
    }
    if (!this.isBodyVisible()) {
      return;
    }
    let hasPendingRequests = false;
    for (const source of sources ?? this.timelineService.getSources().map((s) => s.id)) {
      const requested = this.loadTimelineForSource(source, this.uri, reset);
      if (requested) {
        hasPendingRequests = true;
      }
    }
    if (!hasPendingRequests) {
      this.refresh();
    } else if (this._isEmpty) {
      this.setLoadingUriMessage();
    }
  }
  loadTimelineForSource(source, uri, reset, options) {
    if (this.excludedSources.has(source)) {
      return false;
    }
    const timeline = this.timelinesBySource.get(source);
    if (!reset && options?.cursor !== void 0 && timeline !== void 0 && (!timeline?.more || timeline.items.length > timeline.lastRenderedIndex + this.pageSize)) {
      return false;
    }
    if (options === void 0) {
      if (!reset && timeline !== void 0 && timeline.items.length > 0 && !timeline.more) {
        return false;
      }
      options = { cursor: reset ? void 0 : timeline?.cursor, limit: this.pageSize };
    }
    const pendingRequest = this.pendingRequests.get(source);
    if (pendingRequest !== void 0) {
      options.cursor = pendingRequest.request.options.cursor;
      if (typeof options.limit === "number") {
        if (typeof pendingRequest.request.options.limit === "number") {
          options.limit += pendingRequest.request.options.limit;
        } else {
          options.limit = pendingRequest.request.options.limit;
        }
      }
    }
    pendingRequest?.request?.tokenSource.cancel();
    pendingRequest?.dispose();
    options.cacheResults = true;
    options.resetCache = reset;
    const tokenSource = new CancellationTokenSource();
    const newRequest = this.timelineService.getTimeline(source, uri, options, tokenSource);
    if (newRequest === void 0) {
      tokenSource.dispose();
      return false;
    }
    const disposables = new DisposableStore();
    this.pendingRequests.set(source, { request: newRequest, dispose: () => disposables.dispose() });
    disposables.add(tokenSource);
    disposables.add(tokenSource.token.onCancellationRequested(() => this.pendingRequests.delete(source)));
    this.handleRequest(newRequest);
    return true;
  }
  updateTimeline(timeline, reset) {
    if (reset) {
      this.timelinesBySource.delete(timeline.source);
      const { oldest } = timeline;
      this.loadTimelineForSource(timeline.source, this.uri, true, oldest !== void 0 ? { limit: { timestamp: oldest.timestamp, id: oldest.id } } : void 0);
    } else {
      const { newest } = timeline;
      this.loadTimelineForSource(timeline.source, this.uri, false, newest !== void 0 ? { limit: { timestamp: newest.timestamp, id: newest.id } } : { limit: this.pageSize });
    }
  }
  async handleRequest(request) {
    let response;
    try {
      response = await this.progressService.withProgress({ location: this.id }, () => request.result);
    } catch {
    }
    if (!request.tokenSource.token.isCancellationRequested) {
      this.pendingRequests.get(request.source)?.dispose();
      this.pendingRequests.delete(request.source);
    }
    if (response === void 0 || request.uri !== this.uri) {
      if (this.pendingRequests.size === 0 && this._pendingRefresh) {
        this.refresh();
      }
      return;
    }
    const source = request.source;
    let updated = false;
    const timeline = this.timelinesBySource.get(source);
    if (timeline === void 0) {
      this.timelinesBySource.set(source, new TimelineAggregate(response));
      updated = true;
    } else {
      updated = timeline.add(response, request.options);
    }
    if (updated) {
      this._pendingRefresh = true;
      if (this.hasVisibleItems && this.pendingRequests.size !== 0) {
        this.refreshDebounced();
      } else {
        this.refresh();
      }
    } else if (this.pendingRequests.size === 0) {
      if (this._pendingRefresh) {
        this.refresh();
      } else {
        this.tree.rerender();
      }
    }
  }
  *getItems() {
    let more = false;
    if (this.uri === void 0 || this.timelinesBySource.size === 0) {
      this._visibleItemCount = 0;
      return;
    }
    const maxCount = this._maxItemCount;
    let count = 0;
    if (this.timelinesBySource.size === 1) {
      const [source, timeline] = Iterable.first(this.timelinesBySource);
      timeline.lastRenderedIndex = -1;
      if (this.excludedSources.has(source)) {
        this._visibleItemCount = 0;
        return;
      }
      if (timeline.items.length !== 0) {
        this._visibleItemCount = 1;
      }
      more = timeline.more;
      let lastRelativeTime;
      for (const item of timeline.items) {
        item.relativeTime = void 0;
        item.hideRelativeTime = void 0;
        count++;
        if (count > maxCount) {
          more = true;
          break;
        }
        lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
        yield { element: item };
      }
      timeline.lastRenderedIndex = count - 1;
    } else {
      let getNextMostRecentSource2 = function() {
        return sources.filter((source) => !source.nextItem.done).reduce((previous, current) => previous === void 0 || current.nextItem.value.timestamp >= previous.nextItem.value.timestamp ? current : previous, void 0);
      };
      var getNextMostRecentSource = getNextMostRecentSource2;
      const sources = [];
      let hasAnyItems = false;
      let mostRecentEnd = 0;
      for (const [source, timeline] of this.timelinesBySource) {
        timeline.lastRenderedIndex = -1;
        if (this.excludedSources.has(source) || timeline.stale) {
          continue;
        }
        if (timeline.items.length !== 0) {
          hasAnyItems = true;
        }
        if (timeline.more) {
          more = true;
          const last = timeline.items[Math.min(maxCount, timeline.items.length - 1)];
          if (last.timestamp > mostRecentEnd) {
            mostRecentEnd = last.timestamp;
          }
        }
        const iterator = timeline.items[Symbol.iterator]();
        sources.push({ timeline, iterator, nextItem: iterator.next() });
      }
      this._visibleItemCount = hasAnyItems ? 1 : 0;
      let lastRelativeTime;
      let nextSource;
      while (nextSource = getNextMostRecentSource2()) {
        nextSource.timeline.lastRenderedIndex++;
        const item = nextSource.nextItem.value;
        item.relativeTime = void 0;
        item.hideRelativeTime = void 0;
        if (item.timestamp >= mostRecentEnd) {
          count++;
          if (count > maxCount) {
            more = true;
            break;
          }
          lastRelativeTime = updateRelativeTime(item, lastRelativeTime);
          yield { element: item };
        }
        nextSource.nextItem = nextSource.iterator.next();
      }
    }
    this._visibleItemCount = count;
    if (count > 0) {
      if (more) {
        yield {
          element: new LoadMoreCommand(this.pendingRequests.size !== 0)
        };
      } else if (this.pendingRequests.size !== 0) {
        yield {
          element: new LoadMoreCommand(true)
        };
      }
    }
  }
  refresh() {
    if (!this.isBodyVisible()) {
      return;
    }
    this.tree.setChildren(null, this.getItems());
    this._isEmpty = !this.hasVisibleItems;
    if (this.uri === void 0) {
      this.updateFilename(void 0);
      this.message = localize("timeline.editorCannotProvideTimeline", "The active editor cannot provide timeline information.");
    } else if (this._isEmpty) {
      if (this.pendingRequests.size !== 0) {
        this.setLoadingUriMessage();
      } else {
        this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
        const scmProviderCount = this.contextKeyService.getContextKeyValue("scm.providerCount");
        if (this.timelineService.getSources().filter(({ id }) => !this.excludedSources.has(id)).length === 0) {
          this.message = localize("timeline.noTimelineSourcesEnabled", "All timeline sources have been filtered out.");
        } else {
          if (this.configurationService.getValue("workbench.localHistory.enabled") && !this.excludedSources.has("timeline.localHistory")) {
            this.message = localize("timeline.noLocalHistoryYet", "Local History will track recent changes as you save them unless the file has been excluded or is too large.");
          } else if (this.excludedSources.size > 0) {
            this.message = localize("timeline.noTimelineInfoFromEnabledSources", "No filtered timeline information was provided.");
          } else {
            this.message = localize("timeline.noTimelineInfo", "No timeline information was provided.");
          }
        }
        if (!scmProviderCount || scmProviderCount === 0) {
          this.message += " " + localize("timeline.noSCM", "Source Control has not been configured.");
        }
      }
    } else {
      this.updateFilename(this.labelService.getUriBasenameLabel(this.uri));
      this.message = void 0;
    }
    this._pendingRefresh = false;
  }
  refreshDebounced() {
    this.refresh();
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  setExpanded(expanded) {
    const changed = super.setExpanded(expanded);
    if (changed && this.isBodyVisible()) {
      if (!this.followActiveEditor) {
        this.setUriCore(this.uri, true);
      } else {
        this.onActiveEditorChanged();
      }
    }
    return changed;
  }
  setVisible(visible) {
    if (visible) {
      this.extensionService.activateByEvent("onView:timeline");
      this.visibilityDisposables?.dispose();
      this.visibilityDisposables = new DisposableStore();
      this.editorService.onDidActiveEditorChange(this.onActiveEditorChanged, this, this.visibilityDisposables);
      this.onDidFocus(() => this.refreshDebounced(), this, this.visibilityDisposables);
      super.setVisible(visible);
      this.onActiveEditorChanged();
    } else {
      this.visibilityDisposables?.dispose();
      super.setVisible(visible);
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    container.classList.add("timeline-view");
  }
  renderBody(container) {
    super.renderBody(container);
    this.$container = container;
    container.classList.add("tree-explorer-viewlet-tree-view", "timeline-tree-view");
    this.$message = DOM.append(this.$container, DOM.$(".message"));
    this.$message.classList.add("timeline-subtle");
    this.message = localize("timeline.editorCannotProvideTimeline", "The active editor cannot provide timeline information.");
    this.$tree = document.createElement("div");
    this.$tree.classList.add("customview-tree", "file-icon-themable-tree", "hide-arrows");
    container.appendChild(this.$tree);
    this.treeRenderer = this._register(this.instantiationService.createInstance(TimelineTreeRenderer, this.commands, this.viewDescriptorService.getViewLocationById(this.id)));
    this._register(this.treeRenderer.onDidScrollToEnd((item) => {
      if (this.pageOnScroll) {
        this.loadMore(item);
      }
    }));
    this.tree = this.instantiationService.createInstance(
      WorkbenchObjectTree,
      "TimelinePane",
      this.$tree,
      new TimelineListVirtualDelegate(),
      [this.treeRenderer],
      {
        identityProvider: new TimelineIdentityProvider(),
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isLoadMoreCommand(element)) {
              return element.ariaLabel;
            }
            return element.accessibilityInformation ? element.accessibilityInformation.label : localize("timeline.aria.item", "{0}: {1}", element.relativeTimeFullWord ?? "", element.label);
          },
          getRole(element) {
            if (isLoadMoreCommand(element)) {
              return "treeitem";
            }
            return element.accessibilityInformation && element.accessibilityInformation.role ? element.accessibilityInformation.role : "treeitem";
          },
          getWidgetAriaLabel() {
            return localize("timeline", "Timeline");
          }
        },
        keyboardNavigationLabelProvider: new TimelineKeyboardNavigationLabelProvider(),
        multipleSelectionSupport: false,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    TimelineViewFocusedContext.bindTo(this.tree.contextKeyService);
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(this.commands, e)));
    this._register(this.tree.onDidChangeSelection((e) => this.ensureValidItems()));
    this._register(this.tree.onDidOpen((e) => {
      if (!e.browserEvent || !this.ensureValidItems()) {
        return;
      }
      const selection = this.tree.getSelection();
      let item;
      if (selection.length === 1) {
        item = selection[0];
      }
      if (item === null) {
        return;
      }
      if (isTimelineItem(item)) {
        if (item.command) {
          let args = item.command.arguments ?? [];
          if (item.command.id === API_OPEN_EDITOR_COMMAND_ID || item.command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
            args = [...args, e];
          }
          this.commandService.executeCommand(item.command.id, ...args);
        }
      } else if (isLoadMoreCommand(item)) {
        this.loadMore(item);
      }
    }));
  }
  loadMore(item) {
    if (item.loading) {
      return;
    }
    item.loading = true;
    this.tree.rerender(item);
    if (this.pendingRequests.size !== 0) {
      return;
    }
    this._maxItemCount = this._visibleItemCount + this.pageSize;
    this.loadTimeline(false);
  }
  ensureValidItems() {
    if (!this.hasVisibleItems || !this.timelineService.getSources().some(({ id }) => !this.excludedSources.has(id) && this.timelinesBySource.has(id))) {
      this.tree.setChildren(null, void 0);
      this._isEmpty = true;
      this.setLoadingUriMessage();
      return false;
    }
    return true;
  }
  setLoadingUriMessage() {
    const file = this.uri && this.labelService.getUriBasenameLabel(this.uri);
    this.updateFilename(file);
    this.message = file ? localize("timeline.loading", "Loading timeline for {0}...", file) : "";
  }
  onContextMenu(commands, treeEvent) {
    const item = treeEvent.element;
    if (item === null) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    if (!this.ensureValidItems()) {
      return;
    }
    this.tree.setFocus([item]);
    const actions = commands.getItemContextActions(item);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.tree.domFocus();
        }
      },
      getActionsContext: () => ({ uri: this.uri, item }),
      actionRunner: new TimelineActionRunner()
    });
  }
};
TimelinePane.TITLE = localize2("timeline", "Timeline");
__decorateClass([
  debounce(500)
], TimelinePane.prototype, "refreshDebounced", 1);
TimelinePane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProgressService),
  __decorateParam(11, ITimelineService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ILabelService),
  __decorateParam(16, IUriIdentityService),
  __decorateParam(17, IExtensionService)
], TimelinePane);
class TimelineElementTemplate {
  constructor(container, actionViewItemProvider, hoverDelegate) {
    container.classList.add("custom-view-tree-node-item");
    this.icon = DOM.append(container, DOM.$(".custom-view-tree-node-item-icon"));
    this.iconLabel = new IconLabel(container, { supportHighlights: true, supportIcons: true, hoverDelegate });
    const timestampContainer = DOM.append(this.iconLabel.element, DOM.$(".timeline-timestamp-container"));
    this.timestamp = DOM.append(timestampContainer, DOM.$("span.timeline-timestamp"));
    const actionsContainer = DOM.append(this.iconLabel.element, DOM.$(".actions"));
    this.actionBar = new ActionBar(actionsContainer, { actionViewItemProvider });
  }
  dispose() {
    this.iconLabel.dispose();
    this.actionBar.dispose();
  }
  reset() {
    this.icon.className = "";
    this.icon.style.backgroundImage = "";
    this.actionBar.clear();
  }
}
TimelineElementTemplate.id = "TimelineElementTemplate";
class TimelineIdentityProvider {
  getId(item) {
    return item.handle;
  }
}
class TimelineActionRunner extends ActionRunner {
  async runAction(action, { uri, item }) {
    if (!isTimelineItem(item)) {
      await action.run();
      return;
    }
    await action.run(
      {
        $mid: MarshalledId.TimelineActionContext,
        handle: item.handle,
        source: item.source,
        uri
      },
      uri,
      item.source
    );
  }
}
class TimelineKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.label;
  }
}
class TimelineListVirtualDelegate {
  getHeight(_element) {
    return ItemHeight;
  }
  getTemplateId(element) {
    return TimelineElementTemplate.id;
  }
}
let TimelineTreeRenderer = class extends Disposable {
  constructor(commands, viewContainerLocation, instantiationService, themeService) {
    super();
    this.commands = commands;
    this.viewContainerLocation = viewContainerLocation;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this._onDidScrollToEnd = this._register(new Emitter());
    this.onDidScrollToEnd = this._onDidScrollToEnd.event;
    this.templateId = TimelineElementTemplate.id;
    this.actionViewItemProvider = createActionViewItem.bind(void 0, this.instantiationService);
    this._hoverDelegate = this.instantiationService.createInstance(
      WorkbenchHoverDelegate,
      this.viewContainerLocation === ViewContainerLocation.Panel ? "mouse" : "element",
      {
        instantHover: this.viewContainerLocation !== ViewContainerLocation.Panel
      },
      {
        position: {
          hoverPosition: HoverPosition.RIGHT
          // Will flip when there's no space
        }
      }
    );
  }
  setUri(uri) {
    this.uri = uri;
  }
  renderTemplate(container) {
    return new TimelineElementTemplate(container, this.actionViewItemProvider, this._hoverDelegate);
  }
  renderElement(node, index, template) {
    template.reset();
    const { element: item } = node;
    const theme = this.themeService.getColorTheme();
    const icon = isDark(theme.type) ? item.iconDark : item.icon;
    const iconUrl = icon ? URI.revive(icon) : null;
    if (iconUrl) {
      template.icon.className = "custom-view-tree-node-item-icon";
      template.icon.style.backgroundImage = css.asCSSUrl(iconUrl);
      template.icon.style.color = "";
    } else if (item.themeIcon) {
      template.icon.className = `custom-view-tree-node-item-icon ${ThemeIcon.asClassName(item.themeIcon)}`;
      if (item.themeIcon.color) {
        template.icon.style.color = theme.getColor(item.themeIcon.color.id)?.toString() ?? "";
      } else {
        template.icon.style.color = "";
      }
      template.icon.style.backgroundImage = "";
    } else {
      template.icon.className = "custom-view-tree-node-item-icon";
      template.icon.style.backgroundImage = "";
      template.icon.style.color = "";
    }
    const tooltip = item.tooltip ? isString(item.tooltip) ? item.tooltip : { markdown: item.tooltip, markdownNotSupportedFallback: renderAsPlaintext(item.tooltip) } : void 0;
    template.iconLabel.setLabel(item.label, item.description, {
      title: tooltip,
      matches: createMatches(node.filterData)
    });
    template.timestamp.textContent = item.relativeTime ?? "";
    template.timestamp.ariaLabel = item.relativeTimeFullWord ?? "";
    template.timestamp.parentElement.classList.toggle("timeline-timestamp--duplicate", isTimelineItem(item) && item.hideRelativeTime);
    template.actionBar.context = { uri: this.uri, item };
    template.actionBar.actionRunner = new TimelineActionRunner();
    template.actionBar.push(this.commands.getItemActions(item), { icon: true, label: false });
    if (isLoadMoreCommand(item)) {
      setTimeout(() => this._onDidScrollToEnd.fire(item), 0);
    }
  }
  disposeElement(element, index, templateData) {
    templateData.actionBar.actionRunner.dispose();
  }
  disposeTemplate(template) {
    template.dispose();
  }
};
TimelineTreeRenderer = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService)
], TimelineTreeRenderer);
const timelineRefresh = registerIcon("timeline-refresh", Codicon.refresh, localize("timelineRefresh", "Icon for the refresh timeline action."));
const timelinePin = registerIcon("timeline-pin", Codicon.pin, localize("timelinePin", "Icon for the pin timeline action."));
const timelineUnpin = registerIcon("timeline-unpin", Codicon.pinned, localize("timelineUnpin", "Icon for the unpin timeline action."));
let TimelinePaneCommands = class extends Disposable {
  constructor(pane, timelineService, storageService, contextKeyService, menuService) {
    super();
    this.pane = pane;
    this.timelineService = timelineService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this._register(this.sourceDisposables = new DisposableStore());
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "timeline.refresh",
          title: localize2("refresh", "Refresh"),
          icon: timelineRefresh,
          category: localize2("timeline", "Timeline"),
          menu: {
            id: MenuId.TimelineTitle,
            group: "navigation",
            order: 99
          }
        });
      }
      run(accessor, ...args) {
        pane.reset();
      }
    }));
    this._register(CommandsRegistry.registerCommand(
      "timeline.toggleFollowActiveEditor",
      (accessor, ...args) => pane.followActiveEditor = !pane.followActiveEditor
    ));
    this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
      command: {
        id: "timeline.toggleFollowActiveEditor",
        title: localize2("timeline.toggleFollowActiveEditorCommand.follow", "Pin the Current Timeline"),
        icon: timelinePin,
        category: localize2("timeline", "Timeline")
      },
      group: "navigation",
      order: 98,
      when: TimelineFollowActiveEditorContext
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.TimelineTitle, {
      command: {
        id: "timeline.toggleFollowActiveEditor",
        title: localize2("timeline.toggleFollowActiveEditorCommand.unfollow", "Unpin the Current Timeline"),
        icon: timelineUnpin,
        category: localize2("timeline", "Timeline")
      },
      group: "navigation",
      order: 98,
      when: TimelineFollowActiveEditorContext.toNegated()
    }));
    this._register(timelineService.onDidChangeProviders(() => this.updateTimelineSourceFilters()));
    this.updateTimelineSourceFilters();
  }
  getItemActions(element) {
    return this.getActions(MenuId.TimelineItemContext, { key: "timelineItem", value: element.contextValue }).primary;
  }
  getItemContextActions(element) {
    return this.getActions(MenuId.TimelineItemContext, { key: "timelineItem", value: element.contextValue }).secondary;
  }
  getActions(menuId, context) {
    const contextKeyService = this.contextKeyService.createOverlay([
      ["view", this.pane.id],
      [context.key, context.value]
    ]);
    const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
    return getContextMenuActions(menu, "inline");
  }
  updateTimelineSourceFilters() {
    this.sourceDisposables.clear();
    const excluded = new Set(JSON.parse(this.storageService.get("timeline.excludeSources", StorageScope.PROFILE, "[]")));
    for (const source of this.timelineService.getSources()) {
      this.sourceDisposables.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `timeline.toggleExcludeSource:${source.id}`,
            title: source.label,
            menu: {
              id: MenuId.TimelineFilterSubMenu,
              group: "navigation"
            },
            toggled: ContextKeyExpr.regex(`timelineExcludeSources`, new RegExp(`\\b${escapeRegExpCharacters(source.id)}\\b`)).negate()
          });
        }
        run(accessor, ...args) {
          if (!excluded.delete(source.id)) {
            excluded.add(source.id);
          }
          const storageService = accessor.get(IStorageService);
          storageService.store("timeline.excludeSources", JSON.stringify([...excluded.keys()]), StorageScope.PROFILE, StorageTarget.USER);
        }
      }));
    }
  }
};
TimelinePaneCommands = __decorateClass([
  __decorateParam(1, ITimelineService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService)
], TimelinePaneCommands);
export {
  TimelineExcludeSources,
  TimelineFollowActiveEditorContext,
  TimelineIdentityProvider,
  TimelineKeyboardNavigationLabelProvider,
  TimelineListVirtualDelegate,
  TimelinePane,
  TimelineViewFocusedContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3RpbWVsaW5lL2Jyb3dzZXIvdGltZWxpbmVQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3RpbWVsaW5lUGFuZS5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBjc3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIEFjdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSwgY3JlYXRlTWF0Y2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJSWRlbnRpdHlQcm92aWRlciwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lLCBJVmlld1BhbmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGltZWxpbmVTZXJ2aWNlLCBUaW1lbGluZUNoYW5nZUV2ZW50LCBUaW1lbGluZUl0ZW0sIFRpbWVsaW5lT3B0aW9ucywgVGltZWxpbmVQcm92aWRlcnNDaGFuZ2VFdmVudCwgVGltZWxpbmVSZXF1ZXN0LCBUaW1lbGluZSB9IGZyb20gJy4uL2NvbW1vbi90aW1lbGluZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9yLCBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UsIENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IGdldENvbnRleHRNZW51QWN0aW9ucywgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELCBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBcmlhUm9sZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UsIFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuXG5jb25zdCBJdGVtSGVpZ2h0ID0gMjI7XG5cbnR5cGUgVHJlZUVsZW1lbnQgPSBUaW1lbGluZUl0ZW0gfCBMb2FkTW9yZUNvbW1hbmQ7XG5cbmZ1bmN0aW9uIGlzTG9hZE1vcmVDb21tYW5kKGl0ZW06IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkKTogaXRlbSBpcyBMb2FkTW9yZUNvbW1hbmQge1xuXHRyZXR1cm4gaXRlbSBpbnN0YW5jZW9mIExvYWRNb3JlQ29tbWFuZDtcbn1cblxuZnVuY3Rpb24gaXNUaW1lbGluZUl0ZW0oaXRlbTogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQpOiBpdGVtIGlzIFRpbWVsaW5lSXRlbSB7XG5cdHJldHVybiAhIWl0ZW0gJiYgIWl0ZW0uaGFuZGxlLnN0YXJ0c1dpdGgoJ3ZzY29kZS1jb21tYW5kOicpO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVSZWxhdGl2ZVRpbWUoaXRlbTogVGltZWxpbmVJdGVtLCBsYXN0UmVsYXRpdmVUaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpdGVtLnJlbGF0aXZlVGltZSA9IGlzVGltZWxpbmVJdGVtKGl0ZW0pID8gZnJvbU5vdyhpdGVtLnRpbWVzdGFtcCkgOiB1bmRlZmluZWQ7XG5cdGl0ZW0ucmVsYXRpdmVUaW1lRnVsbFdvcmQgPSBpc1RpbWVsaW5lSXRlbShpdGVtKSA/IGZyb21Ob3coaXRlbS50aW1lc3RhbXAsIGZhbHNlLCB0cnVlKSA6IHVuZGVmaW5lZDtcblx0aWYgKGxhc3RSZWxhdGl2ZVRpbWUgPT09IHVuZGVmaW5lZCB8fCBpdGVtLnJlbGF0aXZlVGltZSAhPT0gbGFzdFJlbGF0aXZlVGltZSkge1xuXHRcdGxhc3RSZWxhdGl2ZVRpbWUgPSBpdGVtLnJlbGF0aXZlVGltZTtcblx0XHRpdGVtLmhpZGVSZWxhdGl2ZVRpbWUgPSBmYWxzZTtcblx0fSBlbHNlIHtcblx0XHRpdGVtLmhpZGVSZWxhdGl2ZVRpbWUgPSB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGxhc3RSZWxhdGl2ZVRpbWU7XG59XG5cbmludGVyZmFjZSBUaW1lbGluZUFjdGlvbkNvbnRleHQge1xuXHR1cmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0aXRlbTogVHJlZUVsZW1lbnQ7XG59XG5cbmNsYXNzIFRpbWVsaW5lQWdncmVnYXRlIHtcblx0cmVhZG9ubHkgaXRlbXM6IFRpbWVsaW5lSXRlbVtdO1xuXHRyZWFkb25seSBzb3VyY2U6IHN0cmluZztcblxuXHRsYXN0UmVuZGVyZWRJbmRleDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHRpbWVsaW5lOiBUaW1lbGluZSkge1xuXHRcdHRoaXMuc291cmNlID0gdGltZWxpbmUuc291cmNlO1xuXHRcdHRoaXMuaXRlbXMgPSB0aW1lbGluZS5pdGVtcztcblx0XHR0aGlzLl9jdXJzb3IgPSB0aW1lbGluZS5wYWdpbmc/LmN1cnNvcjtcblx0XHR0aGlzLmxhc3RSZW5kZXJlZEluZGV4ID0gLTE7XG5cdH1cblxuXHRwcml2YXRlIF9jdXJzb3I/OiBzdHJpbmc7XG5cdGdldCBjdXJzb3IoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yO1xuXHR9XG5cblx0Z2V0IG1vcmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvciAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IG5ld2VzdCgpOiBUaW1lbGluZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zWzBdO1xuXHR9XG5cblx0Z2V0IG9sZGVzdCgpOiBUaW1lbGluZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zW3RoaXMuaXRlbXMubGVuZ3RoIC0gMV07XG5cdH1cblxuXHRhZGQodGltZWxpbmU6IFRpbWVsaW5lLCBvcHRpb25zOiBUaW1lbGluZU9wdGlvbnMpIHtcblx0XHRsZXQgdXBkYXRlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHRpbWVsaW5lLml0ZW1zLmxlbmd0aCAhPT0gMCAmJiB0aGlzLml0ZW1zLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0dXBkYXRlZCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IGlkcyA9IG5ldyBTZXQoKTtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcHMgPSBuZXcgU2V0KCk7XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aW1lbGluZS5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS5pZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGltZXN0YW1wcy5hZGQoaXRlbS50aW1lc3RhbXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlkcy5hZGQoaXRlbS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIGFueSBkdXBsaWNhdGUgaXRlbXNcblx0XHRcdGxldCBpID0gdGhpcy5pdGVtcy5sZW5ndGg7XG5cdFx0XHRsZXQgaXRlbTtcblx0XHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdFx0aXRlbSA9IHRoaXMuaXRlbXNbaV07XG5cdFx0XHRcdGlmICgoaXRlbS5pZCAhPT0gdW5kZWZpbmVkICYmIGlkcy5oYXMoaXRlbS5pZCkpIHx8IHRpbWVzdGFtcHMuaGFzKGl0ZW0udGltZXN0YW1wKSkge1xuXHRcdFx0XHRcdHRoaXMuaXRlbXMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICgodGltZWxpbmUuaXRlbXNbdGltZWxpbmUuaXRlbXMubGVuZ3RoIC0gMV0/LnRpbWVzdGFtcCA/PyAwKSA+PSAodGhpcy5uZXdlc3Q/LnRpbWVzdGFtcCA/PyAwKSkge1xuXHRcdFx0XHR0aGlzLml0ZW1zLnNwbGljZSgwLCAwLCAuLi50aW1lbGluZS5pdGVtcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLml0ZW1zLnB1c2goLi4udGltZWxpbmUuaXRlbXMpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGltZWxpbmUuaXRlbXMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHR1cGRhdGVkID0gdHJ1ZTtcblxuXHRcdFx0dGhpcy5pdGVtcy5wdXNoKC4uLnRpbWVsaW5lLml0ZW1zKTtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBhcmUgbm90IHJlcXVlc3RpbmcgbW9yZSByZWNlbnQgaXRlbXMgdGhhbiB3ZSBoYXZlLCB0aGVuIHVwZGF0ZSB0aGUgY3Vyc29yXG5cdFx0aWYgKG9wdGlvbnMuY3Vyc29yICE9PSB1bmRlZmluZWQgfHwgdHlwZW9mIG9wdGlvbnMubGltaXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHR0aGlzLl9jdXJzb3IgPSB0aW1lbGluZS5wYWdpbmc/LmN1cnNvcjtcblx0XHR9XG5cblx0XHRpZiAodXBkYXRlZCkge1xuXHRcdFx0dGhpcy5pdGVtcy5zb3J0KFxuXHRcdFx0XHQoYSwgYikgPT5cblx0XHRcdFx0XHQoYi50aW1lc3RhbXAgLSBhLnRpbWVzdGFtcCkgfHxcblx0XHRcdFx0XHQoYS5zb3VyY2UgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0PyBiLnNvdXJjZSA9PT0gdW5kZWZpbmVkID8gMCA6IDFcblx0XHRcdFx0XHRcdDogYi5zb3VyY2UgPT09IHVuZGVmaW5lZCA/IC0xIDogYi5zb3VyY2UubG9jYWxlQ29tcGFyZShhLnNvdXJjZSwgdW5kZWZpbmVkLCB7IG51bWVyaWM6IHRydWUsIHNlbnNpdGl2aXR5OiAnYmFzZScgfSkpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cGRhdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhbGUgPSBmYWxzZTtcblx0Z2V0IHN0YWxlKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGFsZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVpcmVzUmVzZXQgPSBmYWxzZTtcblx0Z2V0IHJlcXVpcmVzUmVzZXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVzUmVzZXQ7XG5cdH1cblxuXHRpbnZhbGlkYXRlKHJlcXVpcmVzUmVzZXQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zdGFsZSA9IHRydWU7XG5cdFx0dGhpcy5fcmVxdWlyZXNSZXNldCA9IHJlcXVpcmVzUmVzZXQ7XG5cdH1cbn1cblxuY2xhc3MgTG9hZE1vcmVDb21tYW5kIHtcblx0cmVhZG9ubHkgaGFuZGxlID0gJ3ZzY29kZS1jb21tYW5kOmxvYWRNb3JlJztcblx0cmVhZG9ubHkgdGltZXN0YW1wID0gMDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRvb2x0aXAgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRleHRWYWx1ZSA9IHVuZGVmaW5lZDtcblx0Ly8gTWFrZSB0aGluZ3MgZWFzaWVyIGZvciBkdWNrIHR5cGluZ1xuXHRyZWFkb25seSBpZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWNvbiA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWNvbkRhcmsgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNvdXJjZSA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVsYXRpdmVUaW1lID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZWxhdGl2ZVRpbWVGdWxsV29yZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaGlkZVJlbGF0aXZlVGltZSA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihsb2FkaW5nOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbG9hZGluZyA9IGxvYWRpbmc7XG5cdH1cblx0cHJpdmF0ZSBfbG9hZGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgbG9hZGluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9hZGluZztcblx0fVxuXHRzZXQgbG9hZGluZyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2xvYWRpbmcgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMubGFiZWw7XG5cdH1cblxuXHRnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMubG9hZGluZyA/IGxvY2FsaXplKCd0aW1lbGluZS5sb2FkaW5nTW9yZScsIFwiTG9hZGluZy4uLlwiKSA6IGxvY2FsaXplKCd0aW1lbGluZS5sb2FkTW9yZScsIFwiTG9hZCBtb3JlXCIpO1xuXHR9XG5cblx0Z2V0IHRoZW1lSWNvbigpOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IFRpbWVsaW5lRm9sbG93QWN0aXZlRWRpdG9yQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0aW1lbGluZUZvbGxvd0FjdGl2ZUVkaXRvcicsIHRydWUsIHRydWUpO1xuZXhwb3J0IGNvbnN0IFRpbWVsaW5lRXhjbHVkZVNvdXJjZXMgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCd0aW1lbGluZUV4Y2x1ZGVTb3VyY2VzJywgJ1tdJywgdHJ1ZSk7XG5leHBvcnQgY29uc3QgVGltZWxpbmVWaWV3Rm9jdXNlZENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndGltZWxpbmVGb2N1c2VkJywgdHJ1ZSk7XG5cbmludGVyZmFjZSBJUGVuZGluZ1JlcXVlc3QgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHJlcXVlc3Q6IFRpbWVsaW5lUmVxdWVzdDtcbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVsaW5lUGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFOiBJTG9jYWxpemVkU3RyaW5nID0gbG9jYWxpemUyKCd0aW1lbGluZScsIFwiVGltZWxpbmVcIik7XG5cblx0cHJpdmF0ZSAkY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgJG1lc3NhZ2UhOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSAkdHJlZSE6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hPYmplY3RUcmVlPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPjtcblx0cHJpdmF0ZSB0cmVlUmVuZGVyZXI6IFRpbWVsaW5lVHJlZVJlbmRlcmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbW1hbmRzOiBUaW1lbGluZVBhbmVDb21tYW5kcztcblx0cHJpdmF0ZSB2aXNpYmlsaXR5RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGZvbGxvd0FjdGl2ZUVkaXRvckNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRpbWVsaW5lRXhjbHVkZVNvdXJjZXNDb250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXG5cdHByaXZhdGUgZXhjbHVkZWRTb3VyY2VzOiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSBwZW5kaW5nUmVxdWVzdHMgPSBuZXcgTWFwPHN0cmluZywgSVBlbmRpbmdSZXF1ZXN0PigpO1xuXHRwcml2YXRlIHRpbWVsaW5lc0J5U291cmNlID0gbmV3IE1hcDxzdHJpbmcsIFRpbWVsaW5lQWdncmVnYXRlPigpO1xuXG5cdHByaXZhdGUgdXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJvdGVjdGVkIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElUaW1lbGluZVNlcnZpY2UgcHJvdGVjdGVkIHRpbWVsaW5lU2VydmljZTogSVRpbWVsaW5lU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyAuLi5vcHRpb25zLCB0aXRsZU1lbnVJZDogTWVudUlkLlRpbWVsaW5lVGl0bGUgfSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLmNvbW1hbmRzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUaW1lbGluZVBhbmVDb21tYW5kcywgdGhpcykpO1xuXG5cdFx0dGhpcy5mb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0ID0gVGltZWxpbmVGb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRpbWVsaW5lRXhjbHVkZVNvdXJjZXNDb250ZXh0ID0gVGltZWxpbmVFeGNsdWRlU291cmNlcy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBleGNsdWRlZFNvdXJjZXNTdHJpbmcgPSBzdG9yYWdlU2VydmljZS5nZXQoJ3RpbWVsaW5lLmV4Y2x1ZGVTb3VyY2VzJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHRcdHRoaXMudGltZWxpbmVFeGNsdWRlU291cmNlc0NvbnRleHQuc2V0KGV4Y2x1ZGVkU291cmNlc1N0cmluZyk7XG5cdFx0dGhpcy5leGNsdWRlZFNvdXJjZXMgPSBuZXcgU2V0KEpTT04ucGFyc2UoZXhjbHVkZWRTb3VyY2VzU3RyaW5nKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAndGltZWxpbmUuZXhjbHVkZVNvdXJjZXMnLCB0aGlzLl9zdG9yZSkodGhpcy5vblN0b3JhZ2VTZXJ2aWNlQ2hhbmdlZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbih0aGlzLm9uQ29uZmlndXJhdGlvbkNoYW5nZWQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aW1lbGluZVNlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnModGhpcy5vblByb3ZpZGVyc0NoYW5nZWQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aW1lbGluZVNlcnZpY2Uub25EaWRDaGFuZ2VUaW1lbGluZSh0aGlzLm9uVGltZWxpbmVDaGFuZ2VkLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGltZWxpbmVTZXJ2aWNlLm9uRGlkQ2hhbmdlVXJpKHVyaSA9PiB0aGlzLnNldFVyaSh1cmkpLCB0aGlzKSk7XG5cdH1cblxuXHRwcml2YXRlIF9mb2xsb3dBY3RpdmVFZGl0b3I6IGJvb2xlYW4gPSB0cnVlO1xuXHRnZXQgZm9sbG93QWN0aXZlRWRpdG9yKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9mb2xsb3dBY3RpdmVFZGl0b3I7XG5cdH1cblx0c2V0IGZvbGxvd0FjdGl2ZUVkaXRvcih2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9mb2xsb3dBY3RpdmVFZGl0b3IgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZm9sbG93QWN0aXZlRWRpdG9yID0gdmFsdWU7XG5cdFx0dGhpcy5mb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0LnNldCh2YWx1ZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUZpbGVuYW1lKHRoaXMuX2ZpbGVuYW1lKTtcblxuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhpcy5vbkFjdGl2ZUVkaXRvckNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wYWdlT25TY3JvbGw6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGdldCBwYWdlT25TY3JvbGwoKSB7XG5cdFx0aWYgKHRoaXMuX3BhZ2VPblNjcm9sbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wYWdlT25TY3JvbGwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCBudWxsIHwgdW5kZWZpbmVkPigndGltZWxpbmUucGFnZU9uU2Nyb2xsJykgPz8gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3BhZ2VPblNjcm9sbDtcblx0fVxuXG5cdGdldCBwYWdlU2l6ZSgpIHtcblx0XHRsZXQgcGFnZVNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQ+KCd0aW1lbGluZS5wYWdlU2l6ZScpO1xuXHRcdGlmIChwYWdlU2l6ZSA9PT0gdW5kZWZpbmVkIHx8IHBhZ2VTaXplID09PSBudWxsKSB7XG5cdFx0XHQvLyBJZiB3ZSBhcmUgcGFnaW5nIHdoZW4gc2Nyb2xsaW5nLCB0aGVuIGFkZCBhbiBleHRyYSBpdGVtIHRvIHRoZSBlbmQgdG8gbWFrZSBzdXJlIHRoZSBcIkxvYWQgbW9yZVwiIGl0ZW0gaXMgb3V0IG9mIHZpZXdcblx0XHRcdHBhZ2VTaXplID0gTWF0aC5tYXgoMjAsIE1hdGguZmxvb3IoKHRoaXMudHJlZT8ucmVuZGVySGVpZ2h0ID8/IDAgLyBJdGVtSGVpZ2h0KSArICh0aGlzLnBhZ2VPblNjcm9sbCA/IDEgOiAtMSkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhZ2VTaXplO1xuXHR9XG5cblx0cmVzZXQoKSB7XG5cdFx0dGhpcy5sb2FkVGltZWxpbmUodHJ1ZSk7XG5cdH1cblxuXHRzZXRVcmkodXJpOiBVUkkpIHtcblx0XHR0aGlzLnNldFVyaUNvcmUodXJpLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VXJpQ29yZSh1cmk6IFVSSSB8IHVuZGVmaW5lZCwgZGlzYWJsZUZvbGxvd2luZzogYm9vbGVhbikge1xuXHRcdGlmIChkaXNhYmxlRm9sbG93aW5nKSB7XG5cdFx0XHR0aGlzLmZvbGxvd0FjdGl2ZUVkaXRvciA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudXJpID0gdXJpO1xuXHRcdHRoaXMudXBkYXRlRmlsZW5hbWUodXJpID8gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh1cmkpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLnRyZWVSZW5kZXJlcj8uc2V0VXJpKHVyaSk7XG5cdFx0dGhpcy5sb2FkVGltZWxpbmUodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uU3RvcmFnZVNlcnZpY2VDaGFuZ2VkKCkge1xuXHRcdGNvbnN0IGV4Y2x1ZGVkU291cmNlc1N0cmluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCd0aW1lbGluZS5leGNsdWRlU291cmNlcycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblx0XHR0aGlzLnRpbWVsaW5lRXhjbHVkZVNvdXJjZXNDb250ZXh0LnNldChleGNsdWRlZFNvdXJjZXNTdHJpbmcpO1xuXHRcdHRoaXMuZXhjbHVkZWRTb3VyY2VzID0gbmV3IFNldChKU09OLnBhcnNlKGV4Y2x1ZGVkU291cmNlc1N0cmluZykpO1xuXG5cdFx0Y29uc3QgbWlzc2luZyA9IHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFNvdXJjZXMoKVxuXHRcdFx0LmZpbHRlcigoeyBpZCB9KSA9PiAhdGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKGlkKSAmJiAhdGhpcy50aW1lbGluZXNCeVNvdXJjZS5oYXMoaWQpKTtcblx0XHRpZiAobWlzc2luZy5sZW5ndGggIT09IDApIHtcblx0XHRcdHRoaXMubG9hZFRpbWVsaW5lKHRydWUsIG1pc3NpbmcubWFwKCh7IGlkIH0pID0+IGlkKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KSB7XG5cdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3RpbWVsaW5lLnBhZ2VPblNjcm9sbCcpKSB7XG5cdFx0XHR0aGlzLl9wYWdlT25TY3JvbGwgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkFjdGl2ZUVkaXRvckNoYW5nZWQoKSB7XG5cdFx0aWYgKCF0aGlzLmZvbGxvd0FjdGl2ZUVkaXRvciB8fCAhdGhpcy5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdGlmICgodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodXJpLCB0aGlzLnVyaSkgJiYgdXJpICE9PSB1bmRlZmluZWQpIHx8XG5cdFx0XHQvLyBGYWxsYmFjayB0byBtYXRjaCBvbiBmc1BhdGggaWYgd2UgYXJlIGRlYWxpbmcgd2l0aCBmaWxlcyBvciBnaXQgc2NoZW1lc1xuXHRcdFx0KHVyaT8uZnNQYXRoID09PSB0aGlzLnVyaT8uZnNQYXRoICYmICh1cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8IHVyaT8uc2NoZW1lID09PSAnZ2l0JykgJiYgKHRoaXMudXJpPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCB0aGlzLnVyaT8uc2NoZW1lID09PSAnZ2l0JykpKSB7XG5cblx0XHRcdC8vIElmIHRoZSB1cmkgaGFzbid0IGNoYW5nZWQsIG1ha2Ugc3VyZSB3ZSBoYXZlIHZhbGlkIGNhY2hlc1xuXHRcdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2YgdGhpcy50aW1lbGluZVNlcnZpY2UuZ2V0U291cmNlcygpKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4Y2x1ZGVkU291cmNlcy5oYXMoc291cmNlLmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnRpbWVsaW5lc0J5U291cmNlLmdldChzb3VyY2UuaWQpO1xuXHRcdFx0XHRpZiAodGltZWxpbmUgIT09IHVuZGVmaW5lZCAmJiAhdGltZWxpbmUuc3RhbGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aW1lbGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVUaW1lbGluZSh0aW1lbGluZSwgdGltZWxpbmUucmVxdWlyZXNSZXNldCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2FkVGltZWxpbmVGb3JTb3VyY2Uoc291cmNlLmlkLCB1cmksIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNldFVyaUNvcmUodXJpLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uUHJvdmlkZXJzQ2hhbmdlZChlOiBUaW1lbGluZVByb3ZpZGVyc0NoYW5nZUV2ZW50KSB7XG5cdFx0aWYgKGUucmVtb3ZlZCkge1xuXHRcdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMudGltZWxpbmVzQnlTb3VyY2UuZGVsZXRlKHNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblxuXHRcdGlmIChlLmFkZGVkKSB7XG5cdFx0XHR0aGlzLmxvYWRUaW1lbGluZSh0cnVlLCBlLmFkZGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVGltZWxpbmVDaGFuZ2VkKGU6IFRpbWVsaW5lQ2hhbmdlRXZlbnQpIHtcblx0XHRpZiAoZT8udXJpID09PSB1bmRlZmluZWQgfHwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoVVJJLnJldml2ZShlLnVyaSksIHRoaXMudXJpKSkge1xuXHRcdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnRpbWVsaW5lc0J5U291cmNlLmdldChlLmlkKTtcblx0XHRcdGlmICh0aW1lbGluZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVGltZWxpbmUodGltZWxpbmUsIGUucmVzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGltZWxpbmUuaW52YWxpZGF0ZShlLnJlc2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9maWxlbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR1cGRhdGVGaWxlbmFtZShmaWxlbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZmlsZW5hbWUgPSBmaWxlbmFtZTtcblx0XHRpZiAodGhpcy5mb2xsb3dBY3RpdmVFZGl0b3IgfHwgIWZpbGVuYW1lKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlRGVzY3JpcHRpb24oZmlsZW5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlRGVzY3JpcHRpb24oYCR7ZmlsZW5hbWV9IChwaW5uZWQpYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlO1xuXHR9XG5cblx0c2V0IG1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21lc3NhZ2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zaG93TWVzc2FnZSh0aGlzLl9tZXNzYWdlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5oaWRlTWVzc2FnZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLiRtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuJG1lc3NhZ2UuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdHRoaXMucmVzZXRNZXNzYWdlRWxlbWVudCgpO1xuXG5cdFx0dGhpcy4kbWVzc2FnZS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzZXRNZXNzYWdlRWxlbWVudCgpO1xuXHRcdHRoaXMuJG1lc3NhZ2UuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldE1lc3NhZ2VFbGVtZW50KCk6IHZvaWQge1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy4kbWVzc2FnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VtcHR5ID0gdHJ1ZTtcblx0cHJpdmF0ZSBfbWF4SXRlbUNvdW50ID0gMDtcblxuXHRwcml2YXRlIF92aXNpYmxlSXRlbUNvdW50ID0gMDtcblx0cHJpdmF0ZSBnZXQgaGFzVmlzaWJsZUl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlSXRlbUNvdW50ID4gMDtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoY2FuY2VsUGVuZGluZzogYm9vbGVhbikge1xuXHRcdHRoaXMuX3Zpc2libGVJdGVtQ291bnQgPSAwO1xuXHRcdHRoaXMuX21heEl0ZW1Db3VudCA9IHRoaXMucGFnZVNpemU7XG5cdFx0dGhpcy50aW1lbGluZXNCeVNvdXJjZS5jbGVhcigpO1xuXG5cdFx0aWYgKGNhbmNlbFBlbmRpbmcpIHtcblx0XHRcdGZvciAoY29uc3QgcGVuZGluZ1JlcXVlc3Qgb2YgdGhpcy5wZW5kaW5nUmVxdWVzdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0cGVuZGluZ1JlcXVlc3QucmVxdWVzdC50b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdFx0cGVuZGluZ1JlcXVlc3QuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5jbGVhcigpO1xuXG5cdFx0XHRpZiAoIXRoaXMuaXNCb2R5VmlzaWJsZSgpICYmIHRoaXMudHJlZSkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5faXNFbXB0eSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkVGltZWxpbmUocmVzZXQ6IGJvb2xlYW4sIHNvdXJjZXM/OiBzdHJpbmdbXSkge1xuXHRcdC8vIElmIHdlIGhhdmUgbm8gc291cmNlLCB3ZSBhcmUgcmVzZXR0aW5nIGFsbCBzb3VyY2VzLCBzbyBjYW5jZWwgZXZlcnl0aGluZyBpbiBmbGlnaHQgYW5kIHJlc2V0IGNhY2hlc1xuXHRcdGlmIChzb3VyY2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChyZXNldCkge1xuXHRcdFx0XHR0aGlzLmNsZWFyKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPQGVhbW9kaW86IEFyZSB0aGVzZSB0aGUgcmlnaHQgdGhlIGxpc3Qgb2Ygc2NoZW1lcyB0byBleGNsdWRlPyBJcyB0aGVyZSBhIGJldHRlciB3YXk/XG5cdFx0XHRpZiAodGhpcy51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVTZXR0aW5ncyB8fCB0aGlzLnVyaT8uc2NoZW1lID09PSBTY2hlbWFzLndlYnZpZXdQYW5lbCB8fCB0aGlzLnVyaT8uc2NoZW1lID09PSBTY2hlbWFzLndhbGtUaHJvdWdoKSB7XG5cdFx0XHRcdHRoaXMudXJpID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdHRoaXMuY2xlYXIoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9pc0VtcHR5ICYmIHRoaXMudXJpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRMb2FkaW5nVXJpTWVzc2FnZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnVyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmNsZWFyKGZhbHNlKTtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBoYXNQZW5kaW5nUmVxdWVzdHMgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3Qgc291cmNlIG9mIHNvdXJjZXMgPz8gdGhpcy50aW1lbGluZVNlcnZpY2UuZ2V0U291cmNlcygpLm1hcChzID0+IHMuaWQpKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ZWQgPSB0aGlzLmxvYWRUaW1lbGluZUZvclNvdXJjZShzb3VyY2UsIHRoaXMudXJpLCByZXNldCk7XG5cdFx0XHRpZiAocmVxdWVzdGVkKSB7XG5cdFx0XHRcdGhhc1BlbmRpbmdSZXF1ZXN0cyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFoYXNQZW5kaW5nUmVxdWVzdHMpIHtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNFbXB0eSkge1xuXHRcdFx0dGhpcy5zZXRMb2FkaW5nVXJpTWVzc2FnZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZFRpbWVsaW5lRm9yU291cmNlKHNvdXJjZTogc3RyaW5nLCB1cmk6IFVSSSwgcmVzZXQ6IGJvb2xlYW4sIG9wdGlvbnM/OiBUaW1lbGluZU9wdGlvbnMpIHtcblx0XHRpZiAodGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKHNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB0aW1lbGluZSA9IHRoaXMudGltZWxpbmVzQnlTb3VyY2UuZ2V0KHNvdXJjZSk7XG5cblx0XHQvLyBJZiB3ZSBhcmUgcGFnaW5nLCBhbmQgdGhlcmUgYXJlIG5vIG1vcmUgaXRlbXMgb3Igd2UgaGF2ZSBlbm91Z2ggY2FjaGVkIGl0ZW1zIHRvIGNvdmVyIHRoZSBuZXh0IHBhZ2UsXG5cdFx0Ly8gZG9uJ3QgYm90aGVyIHF1ZXJ5aW5nIGZvciBtb3JlXG5cdFx0aWYgKFxuXHRcdFx0IXJlc2V0ICYmXG5cdFx0XHRvcHRpb25zPy5jdXJzb3IgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0dGltZWxpbmUgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0KCF0aW1lbGluZT8ubW9yZSB8fCB0aW1lbGluZS5pdGVtcy5sZW5ndGggPiB0aW1lbGluZS5sYXN0UmVuZGVyZWRJbmRleCArIHRoaXMucGFnZVNpemUpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQhcmVzZXQgJiZcblx0XHRcdFx0dGltZWxpbmUgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0XHR0aW1lbGluZS5pdGVtcy5sZW5ndGggPiAwICYmXG5cdFx0XHRcdCF0aW1lbGluZS5tb3JlXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gSWYgd2UgYXJlIG5vdCByZXNldHRpbmcsIGhhdmUgaXRlbShzKSwgYW5kIGFscmVhZHkga25vdyB0aGVyZSBhcmUgbm8gbW9yZSB0byBmZXRjaCwgd2UncmUgZG9uZSBoZXJlXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMgPSB7IGN1cnNvcjogcmVzZXQgPyB1bmRlZmluZWQgOiB0aW1lbGluZT8uY3Vyc29yLCBsaW1pdDogdGhpcy5wYWdlU2l6ZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0ID0gdGhpcy5wZW5kaW5nUmVxdWVzdHMuZ2V0KHNvdXJjZSk7XG5cdFx0aWYgKHBlbmRpbmdSZXF1ZXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG9wdGlvbnMuY3Vyc29yID0gcGVuZGluZ1JlcXVlc3QucmVxdWVzdC5vcHRpb25zLmN1cnNvcjtcblxuXHRcdFx0Ly8gVE9ET0BlYW1vZGlvIGRlYWwgd2l0aCBjb25jdXJyZW50IHJlcXVlc3RzIGJldHRlclxuXHRcdFx0aWYgKHR5cGVvZiBvcHRpb25zLmxpbWl0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRpZiAodHlwZW9mIHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3Qub3B0aW9ucy5saW1pdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRvcHRpb25zLmxpbWl0ICs9IHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3Qub3B0aW9ucy5saW1pdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcHRpb25zLmxpbWl0ID0gcGVuZGluZ1JlcXVlc3QucmVxdWVzdC5vcHRpb25zLmxpbWl0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHBlbmRpbmdSZXF1ZXN0Py5yZXF1ZXN0Py50b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRwZW5kaW5nUmVxdWVzdD8uZGlzcG9zZSgpO1xuXG5cdFx0b3B0aW9ucy5jYWNoZVJlc3VsdHMgPSB0cnVlO1xuXHRcdG9wdGlvbnMucmVzZXRDYWNoZSA9IHJlc2V0O1xuXHRcdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgbmV3UmVxdWVzdCA9IHRoaXMudGltZWxpbmVTZXJ2aWNlLmdldFRpbWVsaW5lKHNvdXJjZSwgdXJpLCBvcHRpb25zLCB0b2tlblNvdXJjZSk7XG5cblx0XHRpZiAobmV3UmVxdWVzdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0b2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuc2V0KHNvdXJjZSwgeyByZXF1ZXN0OiBuZXdSZXF1ZXN0LCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkgfSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuU291cmNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW5Tb3VyY2UudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHNvdXJjZSkpKTtcblxuXHRcdHRoaXMuaGFuZGxlUmVxdWVzdChuZXdSZXF1ZXN0KTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaW1lbGluZSh0aW1lbGluZTogVGltZWxpbmVBZ2dyZWdhdGUsIHJlc2V0OiBib29sZWFuKSB7XG5cdFx0aWYgKHJlc2V0KSB7XG5cdFx0XHR0aGlzLnRpbWVsaW5lc0J5U291cmNlLmRlbGV0ZSh0aW1lbGluZS5zb3VyY2UpO1xuXHRcdFx0Ly8gT3ZlcnJpZGUgdGhlIGxpbWl0LCB0byByZS1xdWVyeSBmb3IgYWxsIG91ciBleGlzdGluZyBjYWNoZWQgKHBvc3NpYmx5IHZpc2libGUpIGl0ZW1zIHRvIGtlZXAgdmlzdWFsIGNvbnRpbnVpdHlcblx0XHRcdGNvbnN0IHsgb2xkZXN0IH0gPSB0aW1lbGluZTtcblx0XHRcdHRoaXMubG9hZFRpbWVsaW5lRm9yU291cmNlKHRpbWVsaW5lLnNvdXJjZSwgdGhpcy51cmkhLCB0cnVlLCBvbGRlc3QgIT09IHVuZGVmaW5lZCA/IHsgbGltaXQ6IHsgdGltZXN0YW1wOiBvbGRlc3QudGltZXN0YW1wLCBpZDogb2xkZXN0LmlkIH0gfSA6IHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE92ZXJyaWRlIHRoZSBsaW1pdCwgdG8gcXVlcnkgZm9yIGFueSBuZXdlciBpdGVtc1xuXHRcdFx0Y29uc3QgeyBuZXdlc3QgfSA9IHRpbWVsaW5lO1xuXHRcdFx0dGhpcy5sb2FkVGltZWxpbmVGb3JTb3VyY2UodGltZWxpbmUuc291cmNlLCB0aGlzLnVyaSEsIGZhbHNlLCBuZXdlc3QgIT09IHVuZGVmaW5lZCA/IHsgbGltaXQ6IHsgdGltZXN0YW1wOiBuZXdlc3QudGltZXN0YW1wLCBpZDogbmV3ZXN0LmlkIH0gfSA6IHsgbGltaXQ6IHRoaXMucGFnZVNpemUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGVuZGluZ1JlZnJlc2ggPSBmYWxzZTtcblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVJlcXVlc3QocmVxdWVzdDogVGltZWxpbmVSZXF1ZXN0KSB7XG5cdFx0bGV0IHJlc3BvbnNlOiBUaW1lbGluZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cmVzcG9uc2UgPSBhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogdGhpcy5pZCB9LCAoKSA9PiByZXF1ZXN0LnJlc3VsdCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmVcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgcmVxdWVzdCB3YXMgY2FuY2VsbGVkIHRoZW4gaXQgd2FzIGFscmVhZHkgZGVsZXRlZCBmcm9tIHRoZSBwZW5kaW5nUmVxdWVzdHMgbWFwXG5cdFx0aWYgKCFyZXF1ZXN0LnRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5nZXQocmVxdWVzdC5zb3VyY2UpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5kZWxldGUocmVxdWVzdC5zb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChyZXNwb25zZSA9PT0gdW5kZWZpbmVkIHx8IHJlcXVlc3QudXJpICE9PSB0aGlzLnVyaSkge1xuXHRcdFx0aWYgKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgPT09IDAgJiYgdGhpcy5fcGVuZGluZ1JlZnJlc2gpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlID0gcmVxdWVzdC5zb3VyY2U7XG5cblx0XHRsZXQgdXBkYXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHRpbWVsaW5lID0gdGhpcy50aW1lbGluZXNCeVNvdXJjZS5nZXQoc291cmNlKTtcblx0XHRpZiAodGltZWxpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy50aW1lbGluZXNCeVNvdXJjZS5zZXQoc291cmNlLCBuZXcgVGltZWxpbmVBZ2dyZWdhdGUocmVzcG9uc2UpKTtcblx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHVwZGF0ZWQgPSB0aW1lbGluZS5hZGQocmVzcG9uc2UsIHJlcXVlc3Qub3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZWQpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZWZyZXNoID0gdHJ1ZTtcblxuXHRcdFx0Ly8gSWYgd2UgaGF2ZSB2aXNpYmxlIGl0ZW1zIGFscmVhZHkgYW5kIHRoZXJlIGFyZSBvdGhlciBwZW5kaW5nIHJlcXVlc3RzLCBkZWJvdW5jZSBmb3IgYSBiaXQgdG8gd2FpdCBmb3Igb3RoZXIgcmVxdWVzdHNcblx0XHRcdGlmICh0aGlzLmhhc1Zpc2libGVJdGVtcyAmJiB0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaERlYm91bmNlZCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zaXplID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ1JlZnJlc2gpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyZWUucmVyZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlICpnZXRJdGVtcygpOiBHZW5lcmF0b3I8SVRyZWVFbGVtZW50PFRyZWVFbGVtZW50Piwgdm9pZCwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IG1vcmUgPSBmYWxzZTtcblxuXHRcdGlmICh0aGlzLnVyaSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMudGltZWxpbmVzQnlTb3VyY2Uuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA9IDA7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXhDb3VudCA9IHRoaXMuX21heEl0ZW1Db3VudDtcblx0XHRsZXQgY291bnQgPSAwO1xuXG5cdFx0aWYgKHRoaXMudGltZWxpbmVzQnlTb3VyY2Uuc2l6ZSA9PT0gMSkge1xuXHRcdFx0Y29uc3QgW3NvdXJjZSwgdGltZWxpbmVdID0gSXRlcmFibGUuZmlyc3QodGhpcy50aW1lbGluZXNCeVNvdXJjZSkhO1xuXG5cdFx0XHR0aW1lbGluZS5sYXN0UmVuZGVyZWRJbmRleCA9IC0xO1xuXG5cdFx0XHRpZiAodGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKHNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA9IDA7XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGltZWxpbmUuaXRlbXMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdC8vIElmIHdlIGhhdmUgYW55IGl0ZW1zLCBqdXN0IHNheSB3ZSBoYXZlIG9uZSBmb3Igbm93IC0tIHRoZSByZWFsIGNvdW50IHdpbGwgYmUgdXBkYXRlZCBiZWxvd1xuXHRcdFx0XHR0aGlzLl92aXNpYmxlSXRlbUNvdW50ID0gMTtcblx0XHRcdH1cblxuXHRcdFx0bW9yZSA9IHRpbWVsaW5lLm1vcmU7XG5cblx0XHRcdGxldCBsYXN0UmVsYXRpdmVUaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGltZWxpbmUuaXRlbXMpIHtcblx0XHRcdFx0aXRlbS5yZWxhdGl2ZVRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGl0ZW0uaGlkZVJlbGF0aXZlVGltZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHRpZiAoY291bnQgPiBtYXhDb3VudCkge1xuXHRcdFx0XHRcdG1vcmUgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGFzdFJlbGF0aXZlVGltZSA9IHVwZGF0ZVJlbGF0aXZlVGltZShpdGVtLCBsYXN0UmVsYXRpdmVUaW1lKTtcblx0XHRcdFx0eWllbGQgeyBlbGVtZW50OiBpdGVtIH07XG5cdFx0XHR9XG5cblx0XHRcdHRpbWVsaW5lLmxhc3RSZW5kZXJlZEluZGV4ID0gY291bnQgLSAxO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHNvdXJjZXM6IHsgdGltZWxpbmU6IFRpbWVsaW5lQWdncmVnYXRlOyBpdGVyYXRvcjogSXRlcmFibGVJdGVyYXRvcjxUaW1lbGluZUl0ZW0+OyBuZXh0SXRlbTogSXRlcmF0b3JSZXN1bHQ8VGltZWxpbmVJdGVtLCB1bmRlZmluZWQ+IH1bXSA9IFtdO1xuXG5cdFx0XHRsZXQgaGFzQW55SXRlbXMgPSBmYWxzZTtcblx0XHRcdGxldCBtb3N0UmVjZW50RW5kID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCBbc291cmNlLCB0aW1lbGluZV0gb2YgdGhpcy50aW1lbGluZXNCeVNvdXJjZSkge1xuXHRcdFx0XHR0aW1lbGluZS5sYXN0UmVuZGVyZWRJbmRleCA9IC0xO1xuXG5cdFx0XHRcdGlmICh0aGlzLmV4Y2x1ZGVkU291cmNlcy5oYXMoc291cmNlKSB8fCB0aW1lbGluZS5zdGFsZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRpbWVsaW5lLml0ZW1zLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRcdGhhc0FueUl0ZW1zID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aW1lbGluZS5tb3JlKSB7XG5cdFx0XHRcdFx0bW9yZSA9IHRydWU7XG5cblx0XHRcdFx0XHRjb25zdCBsYXN0ID0gdGltZWxpbmUuaXRlbXNbTWF0aC5taW4obWF4Q291bnQsIHRpbWVsaW5lLml0ZW1zLmxlbmd0aCAtIDEpXTtcblx0XHRcdFx0XHRpZiAobGFzdC50aW1lc3RhbXAgPiBtb3N0UmVjZW50RW5kKSB7XG5cdFx0XHRcdFx0XHRtb3N0UmVjZW50RW5kID0gbGFzdC50aW1lc3RhbXA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaXRlcmF0b3IgPSB0aW1lbGluZS5pdGVtc1tTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdFx0XHRcdHNvdXJjZXMucHVzaCh7IHRpbWVsaW5lLCBpdGVyYXRvciwgbmV4dEl0ZW06IGl0ZXJhdG9yLm5leHQoKSB9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA9IGhhc0FueUl0ZW1zID8gMSA6IDA7XG5cblx0XHRcdGZ1bmN0aW9uIGdldE5leHRNb3N0UmVjZW50U291cmNlKCkge1xuXHRcdFx0XHRyZXR1cm4gc291cmNlc1xuXHRcdFx0XHRcdC5maWx0ZXIoc291cmNlID0+ICFzb3VyY2UubmV4dEl0ZW0uZG9uZSlcblx0XHRcdFx0XHQucmVkdWNlKChwcmV2aW91cywgY3VycmVudCkgPT4gKHByZXZpb3VzID09PSB1bmRlZmluZWQgfHwgY3VycmVudC5uZXh0SXRlbS52YWx1ZSEudGltZXN0YW1wID49IHByZXZpb3VzLm5leHRJdGVtLnZhbHVlIS50aW1lc3RhbXApID8gY3VycmVudCA6IHByZXZpb3VzLCB1bmRlZmluZWQhKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGxhc3RSZWxhdGl2ZVRpbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBuZXh0U291cmNlO1xuXHRcdFx0d2hpbGUgKG5leHRTb3VyY2UgPSBnZXROZXh0TW9zdFJlY2VudFNvdXJjZSgpKSB7XG5cdFx0XHRcdG5leHRTb3VyY2UudGltZWxpbmUubGFzdFJlbmRlcmVkSW5kZXgrKztcblxuXHRcdFx0XHRjb25zdCBpdGVtID0gbmV4dFNvdXJjZS5uZXh0SXRlbS52YWx1ZSE7XG5cdFx0XHRcdGl0ZW0ucmVsYXRpdmVUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpdGVtLmhpZGVSZWxhdGl2ZVRpbWUgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGl0ZW0udGltZXN0YW1wID49IG1vc3RSZWNlbnRFbmQpIHtcblx0XHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHRcdGlmIChjb3VudCA+IG1heENvdW50KSB7XG5cdFx0XHRcdFx0XHRtb3JlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxhc3RSZWxhdGl2ZVRpbWUgPSB1cGRhdGVSZWxhdGl2ZVRpbWUoaXRlbSwgbGFzdFJlbGF0aXZlVGltZSk7XG5cdFx0XHRcdFx0eWllbGQgeyBlbGVtZW50OiBpdGVtIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRuZXh0U291cmNlLm5leHRJdGVtID0gbmV4dFNvdXJjZS5pdGVyYXRvci5uZXh0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlzaWJsZUl0ZW1Db3VudCA9IGNvdW50O1xuXHRcdGlmIChjb3VudCA+IDApIHtcblx0XHRcdGlmIChtb3JlKSB7XG5cdFx0XHRcdHlpZWxkIHtcblx0XHRcdFx0XHRlbGVtZW50OiBuZXcgTG9hZE1vcmVDb21tYW5kKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgIT09IDApXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgIT09IDApIHtcblx0XHRcdFx0eWllbGQge1xuXHRcdFx0XHRcdGVsZW1lbnQ6IG5ldyBMb2FkTW9yZUNvbW1hbmQodHJ1ZSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2goKSB7XG5cdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihudWxsLCB0aGlzLmdldEl0ZW1zKCkpO1xuXHRcdHRoaXMuX2lzRW1wdHkgPSAhdGhpcy5oYXNWaXNpYmxlSXRlbXM7XG5cblx0XHRpZiAodGhpcy51cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVGaWxlbmFtZSh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ3RpbWVsaW5lLmVkaXRvckNhbm5vdFByb3ZpZGVUaW1lbGluZScsIFwiVGhlIGFjdGl2ZSBlZGl0b3IgY2Fubm90IHByb3ZpZGUgdGltZWxpbmUgaW5mb3JtYXRpb24uXCIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faXNFbXB0eSkge1xuXHRcdFx0aWYgKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgIT09IDApIHtcblx0XHRcdFx0dGhpcy5zZXRMb2FkaW5nVXJpTWVzc2FnZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGaWxlbmFtZSh0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHRoaXMudXJpKSk7XG5cdFx0XHRcdGNvbnN0IHNjbVByb3ZpZGVyQ291bnQgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxudW1iZXI+KCdzY20ucHJvdmlkZXJDb3VudCcpO1xuXHRcdFx0XHRpZiAodGhpcy50aW1lbGluZVNlcnZpY2UuZ2V0U291cmNlcygpLmZpbHRlcigoeyBpZCB9KSA9PiAhdGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKGlkKSkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ3RpbWVsaW5lLm5vVGltZWxpbmVTb3VyY2VzRW5hYmxlZCcsIFwiQWxsIHRpbWVsaW5lIHNvdXJjZXMgaGF2ZSBiZWVuIGZpbHRlcmVkIG91dC5cIik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5sb2NhbEhpc3RvcnkuZW5hYmxlZCcpICYmICF0aGlzLmV4Y2x1ZGVkU291cmNlcy5oYXMoJ3RpbWVsaW5lLmxvY2FsSGlzdG9yeScpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1lc3NhZ2UgPSBsb2NhbGl6ZSgndGltZWxpbmUubm9Mb2NhbEhpc3RvcnlZZXQnLCBcIkxvY2FsIEhpc3Rvcnkgd2lsbCB0cmFjayByZWNlbnQgY2hhbmdlcyBhcyB5b3Ugc2F2ZSB0aGVtIHVubGVzcyB0aGUgZmlsZSBoYXMgYmVlbiBleGNsdWRlZCBvciBpcyB0b28gbGFyZ2UuXCIpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5leGNsdWRlZFNvdXJjZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCd0aW1lbGluZS5ub1RpbWVsaW5lSW5mb0Zyb21FbmFibGVkU291cmNlcycsIFwiTm8gZmlsdGVyZWQgdGltZWxpbmUgaW5mb3JtYXRpb24gd2FzIHByb3ZpZGVkLlwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5tZXNzYWdlID0gbG9jYWxpemUoJ3RpbWVsaW5lLm5vVGltZWxpbmVJbmZvJywgXCJObyB0aW1lbGluZSBpbmZvcm1hdGlvbiB3YXMgcHJvdmlkZWQuXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXNjbVByb3ZpZGVyQ291bnQgfHwgc2NtUHJvdmlkZXJDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMubWVzc2FnZSArPSAnICcgKyBsb2NhbGl6ZSgndGltZWxpbmUubm9TQ00nLCBcIlNvdXJjZSBDb250cm9sIGhhcyBub3QgYmVlbiBjb25maWd1cmVkLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZpbGVuYW1lKHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwodGhpcy51cmkpKTtcblx0XHRcdHRoaXMubWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9wZW5kaW5nUmVmcmVzaCA9IGZhbHNlO1xuXHR9XG5cblx0QGRlYm91bmNlKDUwMClcblx0cHJpdmF0ZSByZWZyZXNoRGVib3VuY2VkKCkge1xuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEV4cGFuZGVkKGV4cGFuZGVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IHN1cGVyLnNldEV4cGFuZGVkKGV4cGFuZGVkKTtcblxuXHRcdGlmIChjaGFuZ2VkICYmIHRoaXMuaXNCb2R5VmlzaWJsZSgpKSB7XG5cdFx0XHRpZiAoIXRoaXMuZm9sbG93QWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuc2V0VXJpQ29yZSh0aGlzLnVyaSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm9uQWN0aXZlRWRpdG9yQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjaGFuZ2VkO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoJ29uVmlldzp0aW1lbGluZScpO1xuXHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UodGhpcy5vbkFjdGl2ZUVkaXRvckNoYW5nZWQsIHRoaXMsIHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzKTtcblx0XHRcdC8vIFJlZnJlc2ggdGhlIHZpZXcgb24gZm9jdXMgdG8gdXBkYXRlIHRoZSByZWxhdGl2ZSB0aW1lc3RhbXBzXG5cdFx0XHR0aGlzLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5yZWZyZXNoRGVib3VuY2VkKCksIHRoaXMsIHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzKTtcblxuXHRcdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblxuXHRcdFx0dGhpcy5vbkFjdGl2ZUVkaXRvckNoYW5nZWQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblxuXHRcdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJIZWFkZXJUaXRsZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyLCB0aGlzLnRpdGxlKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0aW1lbGluZS12aWV3Jyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy4kY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0cmVlLWV4cGxvcmVyLXZpZXdsZXQtdHJlZS12aWV3JywgJ3RpbWVsaW5lLXRyZWUtdmlldycpO1xuXG5cdFx0dGhpcy4kbWVzc2FnZSA9IERPTS5hcHBlbmQodGhpcy4kY29udGFpbmVyLCBET00uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0dGhpcy4kbWVzc2FnZS5jbGFzc0xpc3QuYWRkKCd0aW1lbGluZS1zdWJ0bGUnKTtcblxuXHRcdHRoaXMubWVzc2FnZSA9IGxvY2FsaXplKCd0aW1lbGluZS5lZGl0b3JDYW5ub3RQcm92aWRlVGltZWxpbmUnLCBcIlRoZSBhY3RpdmUgZWRpdG9yIGNhbm5vdCBwcm92aWRlIHRpbWVsaW5lIGluZm9ybWF0aW9uLlwiKTtcblxuXHRcdHRoaXMuJHRyZWUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLiR0cmVlLmNsYXNzTGlzdC5hZGQoJ2N1c3RvbXZpZXctdHJlZScsICdmaWxlLWljb24tdGhlbWFibGUtdHJlZScsICdoaWRlLWFycm93cycpO1xuXHRcdC8vIHRoaXMudHJlZUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2hvdy1maWxlLWljb25zJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuJHRyZWUpO1xuXG5cdFx0dGhpcy50cmVlUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpbWVsaW5lVHJlZVJlbmRlcmVyLCB0aGlzLmNvbW1hbmRzLCB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlUmVuZGVyZXIub25EaWRTY3JvbGxUb0VuZChpdGVtID0+IHtcblx0XHRcdGlmICh0aGlzLnBhZ2VPblNjcm9sbCkge1xuXHRcdFx0XHR0aGlzLmxvYWRNb3JlKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoT2JqZWN0VHJlZTxUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sICdUaW1lbGluZVBhbmUnLFxuXHRcdFx0dGhpcy4kdHJlZSwgbmV3IFRpbWVsaW5lTGlzdFZpcnR1YWxEZWxlZ2F0ZSgpLCBbdGhpcy50cmVlUmVuZGVyZXJdLCB7XG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgVGltZWxpbmVJZGVudGl0eVByb3ZpZGVyKCksXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRcdFx0XHRpZiAoaXNMb2FkTW9yZUNvbW1hbmQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmFyaWFMYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uID8gZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ubGFiZWwgOiBsb2NhbGl6ZSgndGltZWxpbmUuYXJpYS5pdGVtJywgXCJ7MH06IHsxfVwiLCBlbGVtZW50LnJlbGF0aXZlVGltZUZ1bGxXb3JkID8/ICcnLCBlbGVtZW50LmxhYmVsKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Um9sZShlbGVtZW50OiBUcmVlRWxlbWVudCk6IEFyaWFSb2xlIHtcblx0XHRcdFx0XHRpZiAoaXNMb2FkTW9yZUNvbW1hbmQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiAndHJlZWl0ZW0nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gJiYgZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ucm9sZSA/IGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uLnJvbGUgOiAndHJlZWl0ZW0nO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG5ldyBUaW1lbGluZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIoKSxcblx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdH0pO1xuXG5cdFx0VGltZWxpbmVWaWV3Rm9jdXNlZENvbnRleHQuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudSh0aGlzLmNvbW1hbmRzLCBlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMuZW5zdXJlVmFsaWRJdGVtcygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmICghZS5icm93c2VyRXZlbnQgfHwgIXRoaXMuZW5zdXJlVmFsaWRJdGVtcygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0bGV0IGl0ZW07XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRpdGVtID0gc2VsZWN0aW9uWzBdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXRlbSA9PT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1RpbWVsaW5lSXRlbShpdGVtKSkge1xuXHRcdFx0XHRpZiAoaXRlbS5jb21tYW5kKSB7XG5cdFx0XHRcdFx0bGV0IGFyZ3MgPSBpdGVtLmNvbW1hbmQuYXJndW1lbnRzID8/IFtdO1xuXHRcdFx0XHRcdGlmIChpdGVtLmNvbW1hbmQuaWQgPT09IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIHx8IGl0ZW0uY29tbWFuZC5pZCA9PT0gQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCkge1xuXHRcdFx0XHRcdFx0Ly8gU29tZSBjb21tYW5kcyBvd25lZCBieSB1cyBzaG91bGQgcmVjZWl2ZSB0aGVcblx0XHRcdFx0XHRcdC8vIGBJT3BlbkV2ZW50YCBhcyBjb250ZXh0IHRvIG9wZW4gcHJvcGVybHlcblx0XHRcdFx0XHRcdGFyZ3MgPSBbLi4uYXJncywgZV07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpdGVtLmNvbW1hbmQuaWQsIC4uLmFyZ3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChpc0xvYWRNb3JlQ29tbWFuZChpdGVtKSkge1xuXHRcdFx0XHR0aGlzLmxvYWRNb3JlKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZE1vcmUoaXRlbTogTG9hZE1vcmVDb21tYW5kKSB7XG5cdFx0aWYgKGl0ZW0ubG9hZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGl0ZW0ubG9hZGluZyA9IHRydWU7XG5cdFx0dGhpcy50cmVlLnJlcmVuZGVyKGl0ZW0pO1xuXG5cdFx0aWYgKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgIT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tYXhJdGVtQ291bnQgPSB0aGlzLl92aXNpYmxlSXRlbUNvdW50ICsgdGhpcy5wYWdlU2l6ZTtcblx0XHR0aGlzLmxvYWRUaW1lbGluZShmYWxzZSk7XG5cdH1cblxuXHRlbnN1cmVWYWxpZEl0ZW1zKCkge1xuXHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYW55IG5vbi1leGNsdWRlZCB0aW1lbGluZXMsIGNsZWFyIHRoZSB0cmVlIGFuZCBzaG93IHRoZSBsb2FkaW5nIG1lc3NhZ2Vcblx0XHRpZiAoIXRoaXMuaGFzVmlzaWJsZUl0ZW1zIHx8ICF0aGlzLnRpbWVsaW5lU2VydmljZS5nZXRTb3VyY2VzKCkuc29tZSgoeyBpZCB9KSA9PiAhdGhpcy5leGNsdWRlZFNvdXJjZXMuaGFzKGlkKSAmJiB0aGlzLnRpbWVsaW5lc0J5U291cmNlLmhhcyhpZCkpKSB7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2lzRW1wdHkgPSB0cnVlO1xuXG5cdFx0XHR0aGlzLnNldExvYWRpbmdVcmlNZXNzYWdlKCk7XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNldExvYWRpbmdVcmlNZXNzYWdlKCkge1xuXHRcdGNvbnN0IGZpbGUgPSB0aGlzLnVyaSAmJiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHRoaXMudXJpKTtcblx0XHR0aGlzLnVwZGF0ZUZpbGVuYW1lKGZpbGUpO1xuXHRcdHRoaXMubWVzc2FnZSA9IGZpbGUgPyBsb2NhbGl6ZSgndGltZWxpbmUubG9hZGluZycsIFwiTG9hZGluZyB0aW1lbGluZSBmb3IgezB9Li4uXCIsIGZpbGUpIDogJyc7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoY29tbWFuZHM6IFRpbWVsaW5lUGFuZUNvbW1hbmRzLCB0cmVlRXZlbnQ6IElUcmVlQ29udGV4dE1lbnVFdmVudDxUcmVlRWxlbWVudCB8IG51bGw+KTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRyZWVFdmVudC5lbGVtZW50O1xuXHRcdGlmIChpdGVtID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV2ZW50OiBVSUV2ZW50ID0gdHJlZUV2ZW50LmJyb3dzZXJFdmVudDtcblxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRpZiAoIXRoaXMuZW5zdXJlVmFsaWRJdGVtcygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGNvbW1hbmRzLmdldEl0ZW1Db250ZXh0QWN0aW9ucyhpdGVtKTtcblx0XHRpZiAoIWFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gdHJlZUV2ZW50LmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwga2V5YmluZGluZzoga2V5YmluZGluZy5nZXRMYWJlbCgpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAod2FzQ2FuY2VsbGVkPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAod2FzQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCk6IFRpbWVsaW5lQWN0aW9uQ29udGV4dCA9PiAoeyB1cmk6IHRoaXMudXJpLCBpdGVtIH0pLFxuXHRcdFx0YWN0aW9uUnVubmVyOiBuZXcgVGltZWxpbmVBY3Rpb25SdW5uZXIoKVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnVGltZWxpbmVFbGVtZW50VGVtcGxhdGUnO1xuXG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbkxhYmVsOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogSFRNTFNwYW5FbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0aG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsXG5cdCkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbScpO1xuXHRcdHRoaXMuaWNvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLmN1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24nKSk7XG5cblx0XHR0aGlzLmljb25MYWJlbCA9IG5ldyBJY29uTGFiZWwoY29udGFpbmVyLCB7IHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIGhvdmVyRGVsZWdhdGUgfSk7XG5cblx0XHRjb25zdCB0aW1lc3RhbXBDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuaWNvbkxhYmVsLmVsZW1lbnQsIERPTS4kKCcudGltZWxpbmUtdGltZXN0YW1wLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnRpbWVzdGFtcCA9IERPTS5hcHBlbmQodGltZXN0YW1wQ29udGFpbmVyLCBET00uJCgnc3Bhbi50aW1lbGluZS10aW1lc3RhbXAnKSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmljb25MYWJlbC5lbGVtZW50LCBET00uJCgnLmFjdGlvbnMnKSk7XG5cdFx0dGhpcy5hY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHsgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5pY29uTGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRoaXMuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuaWNvbi5jbGFzc05hbWUgPSAnJztcblx0XHR0aGlzLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0dGhpcy5hY3Rpb25CYXIuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGltZWxpbmVJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8VHJlZUVsZW1lbnQ+IHtcblx0Z2V0SWQoaXRlbTogVHJlZUVsZW1lbnQpOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4gaXRlbS5oYW5kbGU7XG5cdH1cbn1cblxuY2xhc3MgVGltZWxpbmVBY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCB7IHVyaSwgaXRlbSB9OiBUaW1lbGluZUFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzVGltZWxpbmVJdGVtKGl0ZW0pKSB7XG5cdFx0XHQvLyBUT0RPQGVhbW9kaW8gZG8gd2UgbmVlZCB0byBkbyBhbnl0aGluZyBlbHNlP1xuXHRcdFx0YXdhaXQgYWN0aW9uLnJ1bigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGFjdGlvbi5ydW4oXG5cdFx0XHR7XG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5UaW1lbGluZUFjdGlvbkNvbnRleHQsXG5cdFx0XHRcdGhhbmRsZTogaXRlbS5oYW5kbGUsXG5cdFx0XHRcdHNvdXJjZTogaXRlbS5zb3VyY2UsXG5cdFx0XHRcdHVyaVxuXHRcdFx0fSxcblx0XHRcdHVyaSxcblx0XHRcdGl0ZW0uc291cmNlLFxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVsaW5lS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciBpbXBsZW1lbnRzIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVsaW5lTGlzdFZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFRyZWVFbGVtZW50PiB7XG5cdGdldEhlaWdodChfZWxlbWVudDogVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBJdGVtSGVpZ2h0O1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlLmlkO1xuXHR9XG59XG5cbmNsYXNzIFRpbWVsaW5lVHJlZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8VHJlZUVsZW1lbnQsIEZ1enp5U2NvcmUsIFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsVG9FbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMb2FkTW9yZUNvbW1hbmQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbFRvRW5kOiBFdmVudDxMb2FkTW9yZUNvbW1hbmQ+ID0gdGhpcy5fb25EaWRTY3JvbGxUb0VuZC5ldmVudDtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZS5pZDtcblxuXHRwcml2YXRlIF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRwcml2YXRlIGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHM6IFRpbWVsaW5lUGFuZUNvbW1hbmRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIgPSBjcmVhdGVBY3Rpb25WaWV3SXRlbS5iaW5kKHVuZGVmaW5lZCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsXG5cdFx0XHR0aGlzLnZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsID8gJ21vdXNlJyA6ICdlbGVtZW50Jyxcblx0XHRcdHtcblx0XHRcdFx0aW5zdGFudEhvdmVyOiB0aGlzLnZpZXdDb250YWluZXJMb2NhdGlvbiAhPT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsXG5cdFx0XHR9LCB7XG5cdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLlJJR0hUIC8vIFdpbGwgZmxpcCB3aGVuIHRoZXJlJ3Mgbm8gc3BhY2Vcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHNldFVyaSh1cmk6IFVSSSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlIHtcblx0XHRyZXR1cm4gbmV3IFRpbWVsaW5lRWxlbWVudFRlbXBsYXRlKGNvbnRhaW5lciwgdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyLCB0aGlzLl9ob3ZlckRlbGVnYXRlKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoXG5cdFx0bm9kZTogSVRyZWVOb2RlPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPixcblx0XHRpbmRleDogbnVtYmVyLFxuXHRcdHRlbXBsYXRlOiBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZVxuXHQpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5yZXNldCgpO1xuXG5cdFx0Y29uc3QgeyBlbGVtZW50OiBpdGVtIH0gPSBub2RlO1xuXG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgaWNvbiA9IGlzRGFyayh0aGVtZS50eXBlKSA/IGl0ZW0uaWNvbkRhcmsgOiBpdGVtLmljb247XG5cdFx0Y29uc3QgaWNvblVybCA9IGljb24gPyBVUkkucmV2aXZlKGljb24pIDogbnVsbDtcblxuXHRcdGlmIChpY29uVXJsKSB7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uLmNsYXNzTmFtZSA9ICdjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uJztcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gY3NzLmFzQ1NTVXJsKGljb25VcmwpO1xuXHRcdFx0dGVtcGxhdGUuaWNvbi5zdHlsZS5jb2xvciA9ICcnO1xuXHRcdH0gZWxzZSBpZiAoaXRlbS50aGVtZUljb24pIHtcblx0XHRcdHRlbXBsYXRlLmljb24uY2xhc3NOYW1lID0gYGN1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoaXRlbS50aGVtZUljb24pfWA7XG5cdFx0XHRpZiAoaXRlbS50aGVtZUljb24uY29sb3IpIHtcblx0XHRcdFx0dGVtcGxhdGUuaWNvbi5zdHlsZS5jb2xvciA9IHRoZW1lLmdldENvbG9yKGl0ZW0udGhlbWVJY29uLmNvbG9yLmlkKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuY29sb3IgPSAnJztcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlLmljb24uY2xhc3NOYW1lID0gJ2N1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24nO1xuXHRcdFx0dGVtcGxhdGUuaWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSAnJztcblx0XHRcdHRlbXBsYXRlLmljb24uc3R5bGUuY29sb3IgPSAnJztcblx0XHR9XG5cdFx0Y29uc3QgdG9vbHRpcCA9IGl0ZW0udG9vbHRpcFxuXHRcdFx0PyBpc1N0cmluZyhpdGVtLnRvb2x0aXApXG5cdFx0XHRcdD8gaXRlbS50b29sdGlwXG5cdFx0XHRcdDogeyBtYXJrZG93bjogaXRlbS50b29sdGlwLCBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiByZW5kZXJBc1BsYWludGV4dChpdGVtLnRvb2x0aXApIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0dGVtcGxhdGUuaWNvbkxhYmVsLnNldExhYmVsKGl0ZW0ubGFiZWwsIGl0ZW0uZGVzY3JpcHRpb24sIHtcblx0XHRcdHRpdGxlOiB0b29sdGlwLFxuXHRcdFx0bWF0Y2hlczogY3JlYXRlTWF0Y2hlcyhub2RlLmZpbHRlckRhdGEpXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZS50aW1lc3RhbXAudGV4dENvbnRlbnQgPSBpdGVtLnJlbGF0aXZlVGltZSA/PyAnJztcblx0XHR0ZW1wbGF0ZS50aW1lc3RhbXAuYXJpYUxhYmVsID0gaXRlbS5yZWxhdGl2ZVRpbWVGdWxsV29yZCA/PyAnJztcblx0XHR0ZW1wbGF0ZS50aW1lc3RhbXAucGFyZW50RWxlbWVudCEuY2xhc3NMaXN0LnRvZ2dsZSgndGltZWxpbmUtdGltZXN0YW1wLS1kdXBsaWNhdGUnLCBpc1RpbWVsaW5lSXRlbShpdGVtKSAmJiBpdGVtLmhpZGVSZWxhdGl2ZVRpbWUpO1xuXG5cdFx0dGVtcGxhdGUuYWN0aW9uQmFyLmNvbnRleHQgPSB7IHVyaTogdGhpcy51cmksIGl0ZW0gfSBzYXRpc2ZpZXMgVGltZWxpbmVBY3Rpb25Db250ZXh0O1xuXHRcdHRlbXBsYXRlLmFjdGlvbkJhci5hY3Rpb25SdW5uZXIgPSBuZXcgVGltZWxpbmVBY3Rpb25SdW5uZXIoKTtcblx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIucHVzaCh0aGlzLmNvbW1hbmRzLmdldEl0ZW1BY3Rpb25zKGl0ZW0pLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdC8vIElmIHdlIGFyZSByZW5kZXJpbmcgdGhlIGxvYWQgbW9yZSBpdGVtLCB3ZSd2ZSBzY3JvbGxlZCB0byB0aGUgZW5kLCBzbyB0cmlnZ2VyIGFuIGV2ZW50XG5cdFx0aWYgKGlzTG9hZE1vcmVDb21tYW5kKGl0ZW0pKSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX29uRGlkU2Nyb2xsVG9FbmQuZmlyZShpdGVtKSwgMCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBUaW1lbGluZUVsZW1lbnRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuYWN0aW9uUnVubmVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZTogVGltZWxpbmVFbGVtZW50VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5jb25zdCB0aW1lbGluZVJlZnJlc2ggPSByZWdpc3Rlckljb24oJ3RpbWVsaW5lLXJlZnJlc2gnLCBDb2RpY29uLnJlZnJlc2gsIGxvY2FsaXplKCd0aW1lbGluZVJlZnJlc2gnLCAnSWNvbiBmb3IgdGhlIHJlZnJlc2ggdGltZWxpbmUgYWN0aW9uLicpKTtcbmNvbnN0IHRpbWVsaW5lUGluID0gcmVnaXN0ZXJJY29uKCd0aW1lbGluZS1waW4nLCBDb2RpY29uLnBpbiwgbG9jYWxpemUoJ3RpbWVsaW5lUGluJywgJ0ljb24gZm9yIHRoZSBwaW4gdGltZWxpbmUgYWN0aW9uLicpKTtcbmNvbnN0IHRpbWVsaW5lVW5waW4gPSByZWdpc3Rlckljb24oJ3RpbWVsaW5lLXVucGluJywgQ29kaWNvbi5waW5uZWQsIGxvY2FsaXplKCd0aW1lbGluZVVucGluJywgJ0ljb24gZm9yIHRoZSB1bnBpbiB0aW1lbGluZSBhY3Rpb24uJykpO1xuXG5jbGFzcyBUaW1lbGluZVBhbmVDb21tYW5kcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IHNvdXJjZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYW5lOiBUaW1lbGluZVBhbmUsXG5cdFx0QElUaW1lbGluZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aW1lbGluZVNlcnZpY2U6IElUaW1lbGluZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNvdXJjZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3RpbWVsaW5lLnJlZnJlc2gnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3JlZnJlc2gnLCBcIlJlZnJlc2hcIiksXG5cdFx0XHRcdFx0aWNvbjogdGltZWxpbmVSZWZyZXNoLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lVGl0bGUsXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDk5LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRwYW5lLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3RpbWVsaW5lLnRvZ2dsZUZvbGxvd0FjdGl2ZUVkaXRvcicsXG5cdFx0XHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gcGFuZS5mb2xsb3dBY3RpdmVFZGl0b3IgPSAhcGFuZS5mb2xsb3dBY3RpdmVFZGl0b3Jcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVGltZWxpbmVUaXRsZSwgKHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd0aW1lbGluZS50b2dnbGVGb2xsb3dBY3RpdmVFZGl0b3InLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aW1lbGluZS50b2dnbGVGb2xsb3dBY3RpdmVFZGl0b3JDb21tYW5kLmZvbGxvdycsICdQaW4gdGhlIEN1cnJlbnQgVGltZWxpbmUnKSxcblx0XHRcdFx0aWNvbjogdGltZWxpbmVQaW4sXG5cdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDk4LFxuXHRcdFx0d2hlbjogVGltZWxpbmVGb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0XG5cdFx0fSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVGltZWxpbmVUaXRsZSwgKHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd0aW1lbGluZS50b2dnbGVGb2xsb3dBY3RpdmVFZGl0b3InLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aW1lbGluZS50b2dnbGVGb2xsb3dBY3RpdmVFZGl0b3JDb21tYW5kLnVuZm9sbG93JywgJ1VucGluIHRoZSBDdXJyZW50IFRpbWVsaW5lJyksXG5cdFx0XHRcdGljb246IHRpbWVsaW5lVW5waW4sXG5cdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ3RpbWVsaW5lJywgXCJUaW1lbGluZVwiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDk4LFxuXHRcdFx0d2hlbjogVGltZWxpbmVGb2xsb3dBY3RpdmVFZGl0b3JDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0fSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRpbWVsaW5lU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB0aGlzLnVwZGF0ZVRpbWVsaW5lU291cmNlRmlsdGVycygpKSk7XG5cdFx0dGhpcy51cGRhdGVUaW1lbGluZVNvdXJjZUZpbHRlcnMoKTtcblx0fVxuXG5cdGdldEl0ZW1BY3Rpb25zKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBY3Rpb25zKE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LCB7IGtleTogJ3RpbWVsaW5lSXRlbScsIHZhbHVlOiBlbGVtZW50LmNvbnRleHRWYWx1ZSB9KS5wcmltYXJ5O1xuXHR9XG5cblx0Z2V0SXRlbUNvbnRleHRBY3Rpb25zKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBY3Rpb25zKE1lbnVJZC5UaW1lbGluZUl0ZW1Db250ZXh0LCB7IGtleTogJ3RpbWVsaW5lSXRlbScsIHZhbHVlOiBlbGVtZW50LmNvbnRleHRWYWx1ZSB9KS5zZWNvbmRhcnk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMobWVudUlkOiBNZW51SWQsIGNvbnRleHQ6IHsga2V5OiBzdHJpbmc7IHZhbHVlPzogc3RyaW5nIH0pOiB7IHByaW1hcnk6IElBY3Rpb25bXTsgc2Vjb25kYXJ5OiBJQWN0aW9uW10gfSB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0Wyd2aWV3JywgdGhpcy5wYW5lLmlkXSxcblx0XHRcdFtjb250ZXh0LmtleSwgY29udGV4dC52YWx1ZV0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhtZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlLCB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRcdHJldHVybiBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUaW1lbGluZVNvdXJjZUZpbHRlcnMoKSB7XG5cdFx0dGhpcy5zb3VyY2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZXhjbHVkZWQgPSBuZXcgU2V0KEpTT04ucGFyc2UodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoJ3RpbWVsaW5lLmV4Y2x1ZGVTb3VyY2VzJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpKSk7XG5cdFx0Zm9yIChjb25zdCBzb3VyY2Ugb2YgdGhpcy50aW1lbGluZVNlcnZpY2UuZ2V0U291cmNlcygpKSB7XG5cdFx0XHR0aGlzLnNvdXJjZURpc3Bvc2FibGVzLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB0aW1lbGluZS50b2dnbGVFeGNsdWRlU291cmNlOiR7c291cmNlLmlkfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogc291cmNlLmxhYmVsLFxuXHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLlRpbWVsaW5lRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5yZWdleChgdGltZWxpbmVFeGNsdWRlU291cmNlc2AsIG5ldyBSZWdFeHAoYFxcXFxiJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHNvdXJjZS5pZCl9XFxcXGJgKSkubmVnYXRlKClcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0XHRcdGlmICghZXhjbHVkZWQuZGVsZXRlKHNvdXJjZS5pZCkpIHtcblx0XHRcdFx0XHRcdGV4Y2x1ZGVkLmFkZChzb3VyY2UuaWQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3RpbWVsaW5lLmV4Y2x1ZGVTb3VyY2VzJywgSlNPTi5zdHJpbmdpZnkoWy4uLmV4Y2x1ZGVkLmtleXMoKV0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFNBQWtCLG9CQUFvQjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFxQixxQkFBcUI7QUFDMUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBOEIsa0JBQWtCO0FBQ3pELFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxpQkFB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S0FBSyxXQUFXLE9BQU8scUJBQXFCLEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxRQUFRLGFBQWEsQ0FBQyxFQUFFO0FBQUEsRUFDMUc7QUFBQSxFQUVRLFdBQVcsUUFBZ0IsU0FBd0Y7QUFDMUgsVUFBTSxvQkFBb0IsS0FBSyxrQkFBa0IsY0FBYztBQUFBLE1BQzlELENBQUMsUUFBUSxLQUFLLEtBQUssRUFBRTtBQUFBLE1BQ3JCLENBQUMsUUFBUSxLQUFLLFFBQVEsS0FBSztBQUFBLElBQzVCLENBQUM7QUFFRCxVQUFNLE9BQU8sS0FBSyxZQUFZLGVBQWUsUUFBUSxtQkFBbUIsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBQ25HLFdBQU8sc0JBQXNCLE1BQU0sUUFBUTtBQUFBLEVBQzVDO0FBQUEsRUFFUSw4QkFBOEI7QUFDckMsU0FBSyxrQkFBa0IsTUFBTTtBQUU3QixVQUFNLFdBQVcsSUFBSSxJQUFJLEtBQUssTUFBTSxLQUFLLGVBQWUsSUFBSSwyQkFBMkIsYUFBYSxTQUFTLElBQUksQ0FBQyxDQUFDO0FBQ25ILGVBQVcsVUFBVSxLQUFLLGdCQUFnQixXQUFXLEdBQUc7QUFDdkQsV0FBSyxrQkFBa0IsSUFBSSxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsUUFDaEUsY0FBYztBQUNiLGdCQUFNO0FBQUEsWUFDTCxJQUFJLGdDQUFnQyxPQUFPLEVBQUU7QUFBQSxZQUM3QyxPQUFPLE9BQU87QUFBQSxZQUNkLE1BQU07QUFBQSxjQUNMLElBQUksT0FBTztBQUFBLGNBQ1gsT0FBTztBQUFBLFlBQ1I7QUFBQSxZQUNBLFNBQVMsZUFBZSxNQUFNLDBCQUEwQixJQUFJLE9BQU8sTUFBTSx1QkFBdUIsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsT0FBTztBQUFBLFVBQzFILENBQUM7QUFBQSxRQUNGO0FBQUEsUUFDQSxJQUFJLGFBQStCLE1BQWlCO0FBQ25ELGNBQUksQ0FBQyxTQUFTLE9BQU8sT0FBTyxFQUFFLEdBQUc7QUFDaEMscUJBQVMsSUFBSSxPQUFPLEVBQUU7QUFBQSxVQUN2QjtBQUVBLGdCQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCx5QkFBZSxNQUFNLDJCQUEyQixLQUFLLFVBQVUsQ0FBQyxHQUFHLFNBQVMsS0FBSyxDQUFDLENBQUMsR0FBRyxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQUEsUUFDL0g7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQ0Q7QUEvR00sdUJBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSRzsiLAogICJuYW1lcyI6IFsiaXRlbSIsICJnZXROZXh0TW9zdFJlY2VudFNvdXJjZSJdCn0K
