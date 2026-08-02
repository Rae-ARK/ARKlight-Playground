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
import { localize } from "../../../../../nls.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableSignal, observableValue, transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { MultiDiffEditorInput } from "../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { MultiDiffEditorItem } from "../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { IChatResponseFileChangesService } from "../chatResponseFileChangesService.js";
import { IChatEditingService } from "../../common/editing/chatEditingService.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { budgetBucketPrompts, MAX_TICKS } from "./promptBucketing.js";
const MAX_PREVIEW_LENGTH = 80;
function itemKind(item) {
  if (isRequestVM(item)) {
    return "request";
  }
  if (isResponseVM(item)) {
    return "response";
  }
  return "other";
}
const CHARS_PER_LINE = 48;
const CODE_BLOCK_UNITS = 3;
const MAX_SIGNAL = 60;
const PRIOR_PX_PER_UNIT = { request: 18, response: 20, other: 40 };
function getPromptPreview(text) {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.length <= MAX_PREVIEW_LENGTH ? firstLine : `${firstLine.slice(0, MAX_PREVIEW_LENGTH)}\u2026`;
}
function promptsEqual(a, b) {
  return a.length === b.length && a.every((p, i) => p.requestId === b[i].requestId && p.text === b[i].text && p.timestamp === b[i].timestamp);
}
let PromptTimelineModel = class extends Disposable {
  constructor(widget, chatEditingService, chatResponseFileChangesService, editorService, instantiationService, fileService) {
    super();
    this.widget = widget;
    this.chatEditingService = chatEditingService;
    this.chatResponseFileChangesService = chatResponseFileChangesService;
    this.editorService = editorService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    /** All user prompts in the chat, updated as the transcript changes. */
    this._prompts = observableValue(this, []);
    /** The chat editing session for this chat, if one exists (local or agent-host). */
    this._editingSession = derived(this, (reader) => {
      const resource = this._sessionResource.read(reader);
      if (!resource) {
        return void 0;
      }
      return this.chatEditingService.editingSessionsObs.read(reader).find((s) => isEqual(s.chatSessionResource, resource));
    });
    /** Recency-bucketed ticks, capped to a fixed maximum so each keeps a >=24px slot. */
    this._baseTicks = derived(this, (reader) => {
      const prompts = this._prompts.read(reader);
      return budgetBucketPrompts(prompts, Date.now(), MAX_TICKS).map((bucket) => ({
        requestId: bucket.prompt.requestId,
        allRequestIds: bucket.prompts.map((p) => p.requestId),
        text: bucket.prompt.text,
        timestamp: bucket.prompt.timestamp,
        count: bucket.count,
        ariaLabel: bucket.count === 1 ? localize("promptTimeline.tick", "Prompt: {0}", bucket.prompt.text) : localize("promptTimeline.tickGrouped", "{0} prompts starting with: {1}", bucket.count, bucket.prompt.text)
      }));
    });
    /** Ticks decorated with per-prompt diff stats (server per-turn changeset, else editing session). */
    this._ticks = derived(this, (reader) => {
      const base = this._baseTicks.read(reader);
      return base.map((tick) => {
        const stat = this._statForRequests(tick.allRequestIds, reader);
        return stat ? { ...tick, stat } : tick;
      });
    });
    /**
     * One tick per user prompt — unbucketed and uncapped, decorated with per-prompt diff stats. The
     * dock rail lists every prompt as its own entry (no recency bucketing/sampling), so it needs the
     * raw prompt list rather than the capped {@link ticks} the overview ruler uses.
     */
    this._promptTicks = derived(this, (reader) => {
      const prompts = this._prompts.read(reader);
      return prompts.map((prompt) => {
        const base = {
          requestId: prompt.requestId,
          allRequestIds: [prompt.requestId],
          text: prompt.text,
          timestamp: prompt.timestamp,
          count: 1,
          ariaLabel: localize("promptTimeline.tick", "Prompt: {0}", prompt.text)
        };
        const stat = this._statForRequests(base.allRequestIds, reader);
        return stat ? { ...base, stat } : base;
      });
    });
    this._activeRequestId = observableValue(this, void 0);
    /** The exact request currently scrolled to the top, unbucketed — drives the sticky header's label/position and the dock rail's active row. */
    this._activePromptId = observableValue(this, void 0);
    /** True once the active prompt's own row has scrolled above the viewport top (drives the sticky header). */
    this._scrollPinned = observableValue(this, false);
    /** The active prompt with its 1-based position among all (unbucketed) prompts, for the sticky header. */
    this._activePrompt = derived(this, (reader) => {
      const id = this._activePromptId.read(reader);
      if (id === void 0) {
        return void 0;
      }
      const prompts = this._prompts.read(reader);
      const index = prompts.findIndex((p) => p.requestId === id);
      return index < 0 ? void 0 : { text: prompts[index].text, index: index + 1, total: prompts.length };
    });
    /** Fires when the transcript scroll offset or content height changes (drives the ruler rail). */
    this._scrollLayoutSignal = observableSignal(this);
    this._viewModelListener = this._register(new MutableDisposable());
    /** Per-item content-signal cache (id -> {version, signal}) for height estimation; version invalidates on content growth. */
    this._signalCache = /* @__PURE__ */ new Map();
    this._sessionResource = observableFromEvent(this, this.widget.onDidChangeViewModel, () => this.widget.viewModel?.sessionResource);
    this._register(this.widget.onDidChangeViewModel(() => this._bindViewModel()));
    this._register(this.widget.onDidScroll(() => {
      this._updateActive();
      this._triggerScrollLayout();
    }));
    this._register(this.widget.onDidChangeContentHeight(() => this._triggerScrollLayout()));
    this._register(autorun((reader) => {
      this._baseTicks.read(reader);
      this._updateActive();
      this._triggerScrollLayout();
    }));
    this._bindViewModel();
  }
  get ticks() {
    return this._ticks;
  }
  get promptTicks() {
    return this._promptTicks;
  }
  get activeRequestId() {
    return this._activeRequestId;
  }
  get activePromptId() {
    return this._activePromptId;
  }
  get activePinned() {
    return this._scrollPinned;
  }
  get activePrompt() {
    return this._activePrompt;
  }
  get onDidChangeScrollLayout() {
    return this._scrollLayoutSignal;
  }
  _triggerScrollLayout() {
    transaction((tx) => this._scrollLayoutSignal.trigger(tx));
  }
  /**
   * The prompts' positions for the overview-ruler rail, in an *estimated*
   * content space that stays stable while the transcript virtualizes. The rail
   * draws its own scrollbar thumb from `scrollTop`/`scrollHeight` (the transcript's
   * native scrollbar is hidden while the rail is active) so the whole lane is one
   * surface: a plain scrollbar that blooms into the prompt fan on engagement.
   *
   * The chat list's own height model (`getElementTop`/`scrollHeight`) guesses
   * every un-rendered row at one flat default height (200px). Real turns are
   * nothing like flat — prompts are short, responses tall and variable — so as
   * rows render and get measured the list's tops snap around, dragging the marks
   * with them (the "scroll jitter"). For the marks we instead build our own
   * heights: measured rows use their real `currentRenderedHeight`; un-measured
   * rows are estimated from a content signal calibrated to measured rows (see
   * `_computeAdaptiveLayout`), so marks land near their final spot immediately and
   * barely drift. Once every row is measured this estimate equals the list's real
   * layout.
   */
  getScrollLayout() {
    const layout = this._computeAdaptiveLayout();
    if (!layout) {
      return void 0;
    }
    const { items, tops, total } = layout;
    const marks = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (isRequestVM(item)) {
        marks.push({ requestId: item.id, top: tops[i] });
      }
    }
    return { marks, total, scrollTop: this.widget.scrollTop, scrollHeight: this.widget.scrollHeight, viewportHeight: this.widget.viewportHeight };
  }
  /**
   * Builds a per-item content-height model for the marks. Measured rows
   * contribute their real rendered height; un-measured rows are estimated from a
   * cheap content signal (~ rendered line count) scaled by a pixels-per-unit
   * factor *learned from the measured rows of the same kind*, so the estimate
   * calibrates to the real line height/width instead of relying on magic
   * constants. Falls back to a seed factor until a row of that kind is measured.
   */
  _computeAdaptiveLayout() {
    const items = this.widget.viewModel?.getItems();
    if (!items) {
      return void 0;
    }
    const measuredPx = { request: 0, response: 0, other: 0 };
    const measuredSignal = { request: 0, response: 0, other: 0 };
    for (const item of items) {
      const measured = item.currentRenderedHeight;
      if (measured !== void 0 && measured > 0) {
        const kind = itemKind(item);
        measuredPx[kind] += measured;
        measuredSignal[kind] += this._itemSignal(item);
      }
    }
    const pxPerUnit = (kind) => measuredSignal[kind] > 0 ? measuredPx[kind] / measuredSignal[kind] : PRIOR_PX_PER_UNIT[kind];
    const tops = [];
    let acc = 0;
    for (const item of items) {
      tops.push(acc);
      const measured = item.currentRenderedHeight;
      acc += measured !== void 0 && measured > 0 ? measured : pxPerUnit(itemKind(item)) * this._itemSignal(item);
    }
    return { items, tops, total: acc };
  }
  /**
   * A cheap, unit-less size proxy for a row (~ rendered line count), used to
   * estimate un-measured rows. Cached per item and only recomputed when the
   * content grows (responses stream), so scanning every row on each scroll stays
   * cheap even for long sessions.
   */
  _itemSignal(item) {
    if (isRequestVM(item)) {
      const cached = this._signalCache.get(item.id);
      const version = item.messageText.length;
      if (cached && cached.version === version) {
        return cached.signal;
      }
      const signal = Math.min(MAX_SIGNAL, 1 + Math.ceil(version / CHARS_PER_LINE));
      this._signalCache.set(item.id, { version, signal });
      return signal;
    }
    if (isResponseVM(item)) {
      const parts = item.response.value;
      const cached = this._signalCache.get(item.id);
      if (cached && cached.version === parts.length) {
        return cached.signal;
      }
      const text = item.response.getMarkdown();
      const codeBlocks = Math.floor((text.match(/```/g)?.length ?? 0) / 2);
      const lines = Math.ceil(text.length / CHARS_PER_LINE);
      const signal = Math.min(MAX_SIGNAL, 1 + lines + codeBlocks * CODE_BLOCK_UNITS);
      this._signalCache.set(item.id, { version: parts.length, signal });
      return signal;
    }
    return 1;
  }
  _bindViewModel() {
    this._signalCache.clear();
    this._viewModelListener.value = this.widget.viewModel?.onDidChange(() => this._recompute());
    this._recompute();
  }
  _recompute() {
    const prompts = [];
    for (const item of this.widget.viewModel?.getItems() ?? []) {
      if (isRequestVM(item)) {
        prompts.push({ requestId: item.id, text: getPromptPreview(item.messageText), timestamp: item.timestamp });
      }
    }
    if (promptsEqual(prompts, this._prompts.get())) {
      this._updateActive();
      return;
    }
    this._prompts.set(prompts, void 0);
  }
  /** Recomputes which tick maps to the prompt currently scrolled into view. */
  _updateActive() {
    const ticks = this._baseTicks.get();
    const items = this.widget.viewModel?.getItems();
    if (!items || ticks.length === 0) {
      transaction((tx) => {
        this._activeRequestId.set(void 0, tx);
        this._activePromptId.set(void 0, tx);
        this._scrollPinned.set(false, tx);
      });
      return;
    }
    const scrollTop = this.widget.scrollTop;
    const threshold = 24;
    let activeRequestId;
    let activeTimestamp = 0;
    let activeTop = -1;
    for (const item of items) {
      if (isRequestVM(item)) {
        const top = this.widget.getElementTop(item);
        if (top === void 0) {
          continue;
        }
        if (top > scrollTop + threshold) {
          break;
        }
        activeRequestId = item.id;
        activeTimestamp = item.timestamp;
        activeTop = top;
      }
    }
    if (activeRequestId === void 0) {
      transaction((tx) => {
        this._activeRequestId.set(ticks.at(0)?.requestId, tx);
        this._activePromptId.set(this._prompts.get().at(0)?.requestId, tx);
        this._scrollPinned.set(false, tx);
      });
      return;
    }
    let activeTick = ticks.find((t) => t.allRequestIds.includes(activeRequestId));
    if (!activeTick) {
      for (const tick of ticks) {
        if (tick.timestamp <= activeTimestamp) {
          activeTick = tick;
        } else {
          break;
        }
      }
    }
    const pinned = activeTop < scrollTop - 2;
    transaction((tx) => {
      this._activeRequestId.set((activeTick ?? ticks[ticks.length - 1]).requestId, tx);
      this._activePromptId.set(activeRequestId, tx);
      this._scrollPinned.set(pinned, tx);
    });
  }
  /** Reveals the request with the given id at the top of the transcript. */
  reveal(requestId) {
    const items = this.widget.viewModel?.getItems();
    const index = items?.findIndex((i) => isRequestVM(i) && i.id === requestId) ?? -1;
    if (items && index >= 0) {
      this.widget.reveal(items[index], 0);
    }
    const owningTick = this._baseTicks.get().find((t) => t.allRequestIds.includes(requestId));
    this._activeRequestId.set(owningTick?.requestId ?? requestId, void 0);
  }
  /**
   * Reveals the prompt the sticky header currently names (the prompt scrolled to the top). Used when the
   * header's label is activated so it jumps straight to that prompt, aligned to the top of the transcript.
   */
  revealActivePrompt() {
    const id = this._activePromptId.get();
    if (id !== void 0) {
      this.reveal(id);
    }
  }
  /**
   * Reveals the prompt `delta` positions away from the one the header names, aligned to the top of the
   * transcript like the rail and the label activation. The header then follows scroll tracking, hiding
   * once the target prompt is at the top.
   */
  navigate(delta) {
    const prompts = this._prompts.get();
    if (prompts.length === 0) {
      return;
    }
    const id = this._activePromptId.get();
    const current = id ? prompts.findIndex((p) => p.requestId === id) : 0;
    const base = current < 0 ? 0 : current;
    const target = Math.max(0, Math.min(prompts.length - 1, base + delta));
    if (target === base) {
      return;
    }
    this.reveal(prompts[target].requestId);
  }
  /** The changed files for a tick's prompts, aggregated per file (for the hover card / drill-down). */
  getRequestFiles(tick) {
    const byPath = /* @__PURE__ */ new Map();
    for (const requestId of tick.allRequestIds) {
      for (const diff of this._diffsForRequest(requestId)) {
        if (diff.identical) {
          continue;
        }
        const key = diff.modifiedURI.toString();
        const existing = byPath.get(key);
        if (existing) {
          byPath.set(key, {
            ...existing,
            diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
            added: existing.added + diff.added,
            removed: existing.removed + diff.removed
          });
        } else {
          byPath.set(key, {
            name: basename(diff.modifiedURI),
            originalURI: diff.originalURI,
            modifiedURI: diff.modifiedURI,
            diffModifiedURI: diff.modifiedSnapshotURI ?? diff.modifiedURI,
            added: diff.added,
            removed: diff.removed
          });
        }
      }
    }
    return [...byPath.values()];
  }
  /**
   * Opens the per-prompt changes as a multi-file diff. When a specific file is
   * given (a file row in the card), the same multi-diff is opened but revealed
   * at that file, so per-file and whole-prompt review share one experience.
   */
  async reviewChanges(tick, file) {
    const files = this.getRequestFiles(tick);
    if (files.length === 0) {
      return;
    }
    const items = [];
    let revealResource;
    for (const f of files) {
      const [originalURI, modifiedURI] = await this._readableSides(f);
      if (!originalURI && !modifiedURI) {
        continue;
      }
      items.push(new MultiDiffEditorItem(originalURI, modifiedURI, f.modifiedURI));
      if (file && isEqual(f.modifiedURI, file)) {
        revealResource = { original: originalURI, modified: modifiedURI };
      }
    }
    if (items.length === 0) {
      return;
    }
    const source = URI.parse(`multi-diff-editor:prompt-timeline/${generateUuid()}`);
    const input = this.instantiationService.createInstance(
      MultiDiffEditorInput,
      source,
      localize("promptTimeline.reviewTitle", "Changes \xB7 {0}", tick.text),
      items,
      false
    );
    const options = revealResource ? { viewState: { revealData: { resource: revealResource } } } : void 0;
    await this.editorService.openEditor(input, options);
  }
  /**
   * Resolves which sides of a file diff can actually be read. Prefers the frozen
   * before/after snapshots so only this turn's changes show, but the agent-host
   * checkpoint blobs backing them can be missing (an added file's original, or a
   * pruned/restored session where whole checkpoints are gone). The modified side
   * then falls back to the live working file so review still opens with the best
   * available fidelity; an unreadable side is dropped so the file still renders
   * as a pure add/delete instead of crashing the diff editor.
   */
  async _readableSides(file) {
    const hasFrozenOriginal = !isEqual(file.originalURI, file.modifiedURI);
    const hasFrozenModified = !isEqual(file.diffModifiedURI, file.modifiedURI);
    const [frozenOriginalReadable, frozenModifiedReadable, liveModifiedReadable] = await Promise.all([
      hasFrozenOriginal ? this._canRead(file.originalURI) : Promise.resolve(false),
      hasFrozenModified ? this._canRead(file.diffModifiedURI) : Promise.resolve(false),
      this._canRead(file.modifiedURI)
    ]);
    const modified = frozenModifiedReadable ? file.diffModifiedURI : liveModifiedReadable ? file.modifiedURI : void 0;
    return [frozenOriginalReadable ? file.originalURI : void 0, modified];
  }
  async _canRead(resource) {
    try {
      await this.fileService.readFile(resource, { length: 1 });
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Per-request file diffs, preferring the session type's authoritative
   * provider (agent-host sessions expose a server-computed per-turn changeset
   * that survives reload), and falling back to the chat editing session.
   */
  _diffsForRequest(requestId, reader) {
    const resource = reader ? this._sessionResource.read(reader) : this._sessionResource.get();
    if (resource) {
      const provided = this.chatResponseFileChangesService.getChangesForRequest(resource, requestId);
      if (provided) {
        return reader ? provided.read(reader) : provided.get();
      }
    }
    const session = reader ? this._editingSession.read(reader) : this._editingSession.get();
    if (session) {
      const obs = session.getDiffsForFilesInRequest(requestId);
      return reader ? obs.read(reader) : obs.get();
    }
    return [];
  }
  /** Sums the diff stats across the given requests, or undefined when nothing changed. */
  _statForRequests(requestIds, reader) {
    let added = 0;
    let removed = 0;
    const files = /* @__PURE__ */ new Set();
    for (const requestId of requestIds) {
      for (const diff of this._diffsForRequest(requestId, reader)) {
        if (diff.identical) {
          continue;
        }
        added += diff.added;
        removed += diff.removed;
        files.add(diff.modifiedURI.toString());
      }
    }
    return files.size > 0 ? { added, removed, fileCount: files.size } : void 0;
  }
};
PromptTimelineModel = __decorateClass([
  __decorateParam(1, IChatEditingService),
  __decorateParam(2, IChatResponseFileChangesService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IFileService)
], PromptTimelineModel);
export {
  PromptTimelineModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRUaW1lbGluZS9wcm9tcHRUaW1lbGluZU1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElPYnNlcnZhYmxlU2lnbmFsLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvckl0ZW0gfSBmcm9tICcuLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldEltcGwuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uL2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IGJ1ZGdldEJ1Y2tldFByb21wdHMsIE1BWF9USUNLUywgUHJvbXB0SXRlbSB9IGZyb20gJy4vcHJvbXB0QnVja2V0aW5nLmpzJztcblxuLyoqIEFnZ3JlZ2F0ZWQgZGlmZiBzdGF0cyBmb3IgdGhlIGVkaXRzIGEgcHJvbXB0IChvciBidWNrZXQpIHByb2R1Y2VkLiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9tcHREaWZmU3RhdCB7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZmlsZUNvdW50OiBudW1iZXI7XG59XG5cbi8qKiBBIHNpbmdsZSBmaWxlIGNoYW5nZWQgYnkgYSBwcm9tcHQsIHVzZWQgYnkgdGhlIGhvdmVyIGNhcmQgLyBkaWZmIGRyaWxsLWRvd24uICovXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdEZpbGVEaWZmIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBvcmlnaW5hbFVSSTogVVJJO1xuXHQvKiogRmlsZSBpZGVudGl0eSAvIGdvLXRvLWZpbGUgdGFyZ2V0IChtYXkgYmUgdGhlIGxpdmUgd29ya2luZyBmaWxlKS4gKi9cblx0cmVhZG9ubHkgbW9kaWZpZWRVUkk6IFVSSTtcblx0LyoqIFJIUyBjb250ZW50IHRoZSBkaWZmIHNob3VsZCByZW5kZXI7IHRoZSBmcm96ZW4gYWZ0ZXItdHVybiBzbmFwc2hvdCB3aGVuIGF2YWlsYWJsZS4gKi9cblx0cmVhZG9ubHkgZGlmZk1vZGlmaWVkVVJJOiBVUkk7XG5cdHJlYWRvbmx5IGFkZGVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IG51bWJlcjtcbn1cblxuLyoqIENvbnRlbnQtc3BhY2UgbGF5b3V0IHVzZWQgYnkgdGhlIG92ZXJ2aWV3LXJ1bGVyIHJhaWwgdG8gcGxhY2UgdGhlIHByb21wdCBtYXJrcy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVByb21wdFNjcm9sbExheW91dCB7XG5cdC8qKiBFYWNoIHByb21wdCdzIHRvcCBvZmZzZXQgaW4gdGhlIHJhaWwncyBlc3RpbWF0ZWQgY29udGVudCBzcGFjZS4gKi9cblx0cmVhZG9ubHkgbWFya3M6IHJlYWRvbmx5IHsgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7IHJlYWRvbmx5IHRvcDogbnVtYmVyIH1bXTtcblx0LyoqIFRvdGFsIGNvbnRlbnQgaGVpZ2h0IGluIHRoZSBlc3RpbWF0ZWQgc3BhY2UsIG1hdGNoaW5nIGBtYXJrc2AuICovXG5cdHJlYWRvbmx5IHRvdGFsOiBudW1iZXI7XG5cdC8qKiBDdXJyZW50IHNjcm9sbCBvZmZzZXQgKHB4LCB0aGUgdHJhbnNjcmlwdCdzIHJlYWwgc2Nyb2xsIHNwYWNlKSBcdTIwMTQgZHJpdmVzIHRoZSByYWlsJ3Mgb3duIHNjcm9sbGJhciB0aHVtYi4gKi9cblx0cmVhZG9ubHkgc2Nyb2xsVG9wOiBudW1iZXI7XG5cdC8qKiBGdWxsIHNjcm9sbGFibGUgY29udGVudCBoZWlnaHQgKHB4LCB0aGUgdHJhbnNjcmlwdCdzIHJlYWwgc2Nyb2xsIHNwYWNlKS4gKi9cblx0cmVhZG9ubHkgc2Nyb2xsSGVpZ2h0OiBudW1iZXI7XG5cdC8qKiBWaXNpYmxlIHZpZXdwb3J0IGhlaWdodCAocHgpIG9mIHRoZSB0cmFuc2NyaXB0IGxpc3QgXHUyMDE0IHRoZSBzY3JvbGxiYXIncyBgdmlzaWJsZVNpemVgLiAqL1xuXHRyZWFkb25seSB2aWV3cG9ydEhlaWdodDogbnVtYmVyO1xufVxuXG4vKiogQSBzaW5nbGUgdGljayBzaG93biBvbiB0aGUgcHJvbXB0IHRpbWVsaW5lIHJhaWwuICovXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdFRpY2sge1xuXHQvKiogSnVtcCB0YXJnZXQ6IHRoZSByZXF1ZXN0IGlkIG9mIHRoZSBmaXJzdCBwcm9tcHQgaW4gdGhlIGJ1Y2tldC4gKi9cblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdC8qKiBSZXF1ZXN0IGlkcyBvZiBldmVyeSBwcm9tcHQgdGhpcyB0aWNrIHJlcHJlc2VudHMgKGZvciBhY3RpdmUgdHJhY2tpbmcpLiAqL1xuXHRyZWFkb25seSBhbGxSZXF1ZXN0SWRzOiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIFByZXZpZXcgdGV4dCAoZmlyc3QgcHJvbXB0IGluIHRoZSBidWNrZXQpLiAqL1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdC8qKiBDcmVhdGlvbiB0aW1lIChtcyBzaW5jZSBlcG9jaCkgb2YgdGhlIGZpcnN0IHByb21wdCBpbiB0aGUgYnVja2V0LiAqL1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0LyoqIEhvdyBtYW55IHByb21wdHMgdGhpcyB0aWNrIHJlcHJlc2VudHMuICovXG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdC8qKiBBY2Nlc3NpYmxlIGxhYmVsIGFubm91bmNlZCBmb3IgdGhlIHRpY2suICovXG5cdHJlYWRvbmx5IGFyaWFMYWJlbDogc3RyaW5nO1xuXHQvKiogRGlmZiBzdW1tYXJ5IG9mIHRoZSBlZGl0cyB0aGlzIHRpY2sgcHJvZHVjZWQsIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgc3RhdD86IFByb21wdERpZmZTdGF0O1xufVxuXG5jb25zdCBNQVhfUFJFVklFV19MRU5HVEggPSA4MDtcblxuLyoqIEtpbmRzIG9mIHRyYW5zY3JpcHQgcm93LCBidWNrZXRlZCBmb3IgaGVpZ2h0IGVzdGltYXRpb24gKHByb21wdHMgYXJlIHNob3J0LCByZXNwb25zZXMgdGFsbCkuICovXG50eXBlIFByb21wdEl0ZW1LaW5kID0gJ3JlcXVlc3QnIHwgJ3Jlc3BvbnNlJyB8ICdvdGhlcic7XG5cbi8qKiBDbGFzc2lmaWVzIGEgdHJhbnNjcmlwdCBpdGVtIGZvciBwZXIta2luZCBoZWlnaHQgZXN0aW1hdGlvbi4gKi9cbmZ1bmN0aW9uIGl0ZW1LaW5kKGl0ZW06IENoYXRUcmVlSXRlbSk6IFByb21wdEl0ZW1LaW5kIHtcblx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuICdyZXF1ZXN0Jztcblx0fVxuXHRpZiAoaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuICdyZXNwb25zZSc7XG5cdH1cblx0cmV0dXJuICdvdGhlcic7XG59XG5cbi8vIENvbnRlbnQgXCJzaWduYWxcIiA9IGEgY2hlYXAsIHVuaXQtbGVzcyBzaXplIHByb3h5IChyb3VnaGx5IHRoZSByZW5kZXJlZCBsaW5lXG4vLyBjb3VudCkgZm9yIGFuIHVuLW1lYXN1cmVkIHJvdy4gQWJzb2x1dGUgcGl4ZWxzIGNvbWUgZnJvbSBhIGZhY3RvciBsZWFybmVkIGZyb21cbi8vIG1lYXN1cmVkIHJvd3MgKHNlZSBgX2NvbXB1dGVBZGFwdGl2ZUxheW91dGApLCBzbyB0aGVzZSBjb25zdGFudHMgb25seSBuZWVkIHRvXG4vLyBnZXQgdGhlICpyZWxhdGl2ZSogc2l6ZXMgcmlnaHQsIG5vdCB0aGUgZXhhY3QgbGluZSBoZWlnaHQuXG5jb25zdCBDSEFSU19QRVJfTElORSA9IDQ4O1xuLyoqIEV4dHJhIGxpbmUtdW5pdHMgYSBmZW5jZWQgY29kZSBibG9jayBhZGRzIGJleW9uZCBpdHMgdGV4dCAoYm9yZGVyLCBwYWRkaW5nLCB0b29sYmFyKS4gKi9cbmNvbnN0IENPREVfQkxPQ0tfVU5JVFMgPSAzO1xuLyoqIFNpZ25hbCBpcyBjYXBwZWQgc28gb25lIHBhdGhvbG9naWNhbCByb3cgY2FuJ3QgZG9taW5hdGUgdGhlIHdob2xlIGVzdGltYXRlLiAqL1xuY29uc3QgTUFYX1NJR05BTCA9IDYwO1xuLyoqIFNlZWQgcGl4ZWxzLXBlci1zaWduYWwtdW5pdCwgdXNlZCBvbmx5IHVudGlsIGEgcm93IG9mIHRoYXQga2luZCBoYXMgYmVlbiBtZWFzdXJlZC4gKi9cbmNvbnN0IFBSSU9SX1BYX1BFUl9VTklUOiBSZWNvcmQ8UHJvbXB0SXRlbUtpbmQsIG51bWJlcj4gPSB7IHJlcXVlc3Q6IDE4LCByZXNwb25zZTogMjAsIG90aGVyOiA0MCB9O1xuXG4vKiogRmlyc3Qgbm9uLWVtcHR5IGxpbmUgb2YgYSBwcm9tcHQsIHRyaW1tZWQgYW5kIGxlbmd0aC1jYXBwZWQgZm9yIHByZXZpZXdzLiAqL1xuZnVuY3Rpb24gZ2V0UHJvbXB0UHJldmlldyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBmaXJzdExpbmUgPSB0ZXh0LnNwbGl0KCdcXG4nKS5tYXAobCA9PiBsLnRyaW0oKSkuZmluZChsID0+IGwubGVuZ3RoID4gMCkgPz8gJyc7XG5cdHJldHVybiBmaXJzdExpbmUubGVuZ3RoIDw9IE1BWF9QUkVWSUVXX0xFTkdUSCA/IGZpcnN0TGluZSA6IGAke2ZpcnN0TGluZS5zbGljZSgwLCBNQVhfUFJFVklFV19MRU5HVEgpfVx1MjAyNmA7XG59XG5cbi8qKiBXaGV0aGVyIHR3byBkZXJpdmVkIHByb21wdCBsaXN0cyBhcmUgZXF1aXZhbGVudCAob3JkZXIsIGlkLCB0ZXh0IGFuZCB0aW1lKS4gKi9cbmZ1bmN0aW9uIHByb21wdHNFcXVhbChhOiByZWFkb25seSBQcm9tcHRJdGVtW10sIGI6IHJlYWRvbmx5IFByb21wdEl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYS5sZW5ndGggPT09IGIubGVuZ3RoICYmIGEuZXZlcnkoKHAsIGkpID0+XG5cdFx0cC5yZXF1ZXN0SWQgPT09IGJbaV0ucmVxdWVzdElkICYmIHAudGV4dCA9PT0gYltpXS50ZXh0ICYmIHAudGltZXN0YW1wID09PSBiW2ldLnRpbWVzdGFtcCk7XG59XG5cbi8qKiBUaGUgcHJvbXB0IGN1cnJlbnRseSBwaW5uZWQgYnkgdGhlIHN0aWNreSBoZWFkZXIsIHdpdGggaXRzIDEtYmFzZWQgcG9zaXRpb24gYW1vbmcgYWxsIHByb21wdHMuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVQcm9tcHQge1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRvdGFsOiBudW1iZXI7XG59XG5cbi8qKlxuICogRGVyaXZlcyB0aGUgcHJvbXB0IHRpbWVsaW5lIChidWNrZXRlZCB0aWNrcyArIHRoZSBhY3RpdmUgdGljaykgZnJvbSBhIGNoYXRcbiAqIHdpZGdldCdzIHZpZXcgbW9kZWwsIGFuZCByZXZlYWxzIHByb21wdHMgb24gcmVxdWVzdC5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdFRpbWVsaW5lTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKiogQWxsIHVzZXIgcHJvbXB0cyBpbiB0aGUgY2hhdCwgdXBkYXRlZCBhcyB0aGUgdHJhbnNjcmlwdCBjaGFuZ2VzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IFByb21wdEl0ZW1bXT4gPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgUHJvbXB0SXRlbVtdPih0aGlzLCBbXSk7XG5cblx0LyoqIFRoZSBjaGF0IHNlc3Npb24gcmVzb3VyY2UsIHRyYWNrZWQgcmVhY3RpdmVseSBzbyB0aGUgZWRpdGluZyBzZXNzaW9uIGNhbiBiZSByZXNvbHZlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBUaGUgY2hhdCBlZGl0aW5nIHNlc3Npb24gZm9yIHRoaXMgY2hhdCwgaWYgb25lIGV4aXN0cyAobG9jYWwgb3IgYWdlbnQtaG9zdCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRpbmdTZXNzaW9uID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fc2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocmVhZGVyKS5maW5kKHMgPT4gaXNFcXVhbChzLmNoYXRTZXNzaW9uUmVzb3VyY2UsIHJlc291cmNlKSk7XG5cdH0pO1xuXG5cdC8qKiBSZWNlbmN5LWJ1Y2tldGVkIHRpY2tzLCBjYXBwZWQgdG8gYSBmaXhlZCBtYXhpbXVtIHNvIGVhY2gga2VlcHMgYSA+PTI0cHggc2xvdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFzZVRpY2tzID0gZGVyaXZlZDxyZWFkb25seSBQcm9tcHRUaWNrW10+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcHJvbXB0cyA9IHRoaXMuX3Byb21wdHMucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBidWRnZXRCdWNrZXRQcm9tcHRzKHByb21wdHMsIERhdGUubm93KCksIE1BWF9USUNLUykubWFwKChidWNrZXQpOiBQcm9tcHRUaWNrID0+ICh7XG5cdFx0XHRyZXF1ZXN0SWQ6IGJ1Y2tldC5wcm9tcHQucmVxdWVzdElkLFxuXHRcdFx0YWxsUmVxdWVzdElkczogYnVja2V0LnByb21wdHMubWFwKHAgPT4gcC5yZXF1ZXN0SWQpLFxuXHRcdFx0dGV4dDogYnVja2V0LnByb21wdC50ZXh0LFxuXHRcdFx0dGltZXN0YW1wOiBidWNrZXQucHJvbXB0LnRpbWVzdGFtcCxcblx0XHRcdGNvdW50OiBidWNrZXQuY291bnQsXG5cdFx0XHRhcmlhTGFiZWw6IGJ1Y2tldC5jb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRUaW1lbGluZS50aWNrJywgXCJQcm9tcHQ6IHswfVwiLCBidWNrZXQucHJvbXB0LnRleHQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLnRpY2tHcm91cGVkJywgXCJ7MH0gcHJvbXB0cyBzdGFydGluZyB3aXRoOiB7MX1cIiwgYnVja2V0LmNvdW50LCBidWNrZXQucHJvbXB0LnRleHQpLFxuXHRcdH0pKTtcblx0fSk7XG5cblx0LyoqIFRpY2tzIGRlY29yYXRlZCB3aXRoIHBlci1wcm9tcHQgZGlmZiBzdGF0cyAoc2VydmVyIHBlci10dXJuIGNoYW5nZXNldCwgZWxzZSBlZGl0aW5nIHNlc3Npb24pLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aWNrcyA9IGRlcml2ZWQ8cmVhZG9ubHkgUHJvbXB0VGlja1tdPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9iYXNlVGlja3MucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBiYXNlLm1hcCh0aWNrID0+IHtcblx0XHRcdGNvbnN0IHN0YXQgPSB0aGlzLl9zdGF0Rm9yUmVxdWVzdHModGljay5hbGxSZXF1ZXN0SWRzLCByZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHN0YXQgPyB7IC4uLnRpY2ssIHN0YXQgfSA6IHRpY2s7XG5cdFx0fSk7XG5cdH0pO1xuXHRnZXQgdGlja3MoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgUHJvbXB0VGlja1tdPiB7IHJldHVybiB0aGlzLl90aWNrczsgfVxuXG5cdC8qKlxuXHQgKiBPbmUgdGljayBwZXIgdXNlciBwcm9tcHQgXHUyMDE0IHVuYnVja2V0ZWQgYW5kIHVuY2FwcGVkLCBkZWNvcmF0ZWQgd2l0aCBwZXItcHJvbXB0IGRpZmYgc3RhdHMuIFRoZVxuXHQgKiBkb2NrIHJhaWwgbGlzdHMgZXZlcnkgcHJvbXB0IGFzIGl0cyBvd24gZW50cnkgKG5vIHJlY2VuY3kgYnVja2V0aW5nL3NhbXBsaW5nKSwgc28gaXQgbmVlZHMgdGhlXG5cdCAqIHJhdyBwcm9tcHQgbGlzdCByYXRoZXIgdGhhbiB0aGUgY2FwcGVkIHtAbGluayB0aWNrc30gdGhlIG92ZXJ2aWV3IHJ1bGVyIHVzZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRUaWNrcyA9IGRlcml2ZWQ8cmVhZG9ubHkgUHJvbXB0VGlja1tdPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHByb21wdHMgPSB0aGlzLl9wcm9tcHRzLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gcHJvbXB0cy5tYXAoKHByb21wdCk6IFByb21wdFRpY2sgPT4ge1xuXHRcdFx0Y29uc3QgYmFzZTogUHJvbXB0VGljayA9IHtcblx0XHRcdFx0cmVxdWVzdElkOiBwcm9tcHQucmVxdWVzdElkLFxuXHRcdFx0XHRhbGxSZXF1ZXN0SWRzOiBbcHJvbXB0LnJlcXVlc3RJZF0sXG5cdFx0XHRcdHRleHQ6IHByb21wdC50ZXh0LFxuXHRcdFx0XHR0aW1lc3RhbXA6IHByb21wdC50aW1lc3RhbXAsXG5cdFx0XHRcdGNvdW50OiAxLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdwcm9tcHRUaW1lbGluZS50aWNrJywgXCJQcm9tcHQ6IHswfVwiLCBwcm9tcHQudGV4dCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3RhdCA9IHRoaXMuX3N0YXRGb3JSZXF1ZXN0cyhiYXNlLmFsbFJlcXVlc3RJZHMsIHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gc3RhdCA/IHsgLi4uYmFzZSwgc3RhdCB9IDogYmFzZTtcblx0XHR9KTtcblx0fSk7XG5cdGdldCBwcm9tcHRUaWNrcygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBQcm9tcHRUaWNrW10+IHsgcmV0dXJuIHRoaXMuX3Byb21wdFRpY2tzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUmVxdWVzdElkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgYWN0aXZlUmVxdWVzdElkKCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fYWN0aXZlUmVxdWVzdElkOyB9XG5cblx0LyoqIFRoZSBleGFjdCByZXF1ZXN0IGN1cnJlbnRseSBzY3JvbGxlZCB0byB0aGUgdG9wLCB1bmJ1Y2tldGVkIFx1MjAxNCBkcml2ZXMgdGhlIHN0aWNreSBoZWFkZXIncyBsYWJlbC9wb3NpdGlvbiBhbmQgdGhlIGRvY2sgcmFpbCdzIGFjdGl2ZSByb3cuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVByb21wdElkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgYWN0aXZlUHJvbXB0SWQoKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9hY3RpdmVQcm9tcHRJZDsgfVxuXG5cdC8qKiBUcnVlIG9uY2UgdGhlIGFjdGl2ZSBwcm9tcHQncyBvd24gcm93IGhhcyBzY3JvbGxlZCBhYm92ZSB0aGUgdmlld3BvcnQgdG9wIChkcml2ZXMgdGhlIHN0aWNreSBoZWFkZXIpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxQaW5uZWQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRnZXQgYWN0aXZlUGlubmVkKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX3Njcm9sbFBpbm5lZDsgfVxuXG5cdC8qKiBUaGUgYWN0aXZlIHByb21wdCB3aXRoIGl0cyAxLWJhc2VkIHBvc2l0aW9uIGFtb25nIGFsbCAodW5idWNrZXRlZCkgcHJvbXB0cywgZm9yIHRoZSBzdGlja3kgaGVhZGVyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVQcm9tcHQgPSBkZXJpdmVkPElBY3RpdmVQcm9tcHQgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9hY3RpdmVQcm9tcHRJZC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKGlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByb21wdHMgPSB0aGlzLl9wcm9tcHRzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpbmRleCA9IHByb21wdHMuZmluZEluZGV4KHAgPT4gcC5yZXF1ZXN0SWQgPT09IGlkKTtcblx0XHRyZXR1cm4gaW5kZXggPCAwID8gdW5kZWZpbmVkIDogeyB0ZXh0OiBwcm9tcHRzW2luZGV4XS50ZXh0LCBpbmRleDogaW5kZXggKyAxLCB0b3RhbDogcHJvbXB0cy5sZW5ndGggfTtcblx0fSk7XG5cdGdldCBhY3RpdmVQcm9tcHQoKTogSU9ic2VydmFibGU8SUFjdGl2ZVByb21wdCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fYWN0aXZlUHJvbXB0OyB9XG5cblx0LyoqIEZpcmVzIHdoZW4gdGhlIHRyYW5zY3JpcHQgc2Nyb2xsIG9mZnNldCBvciBjb250ZW50IGhlaWdodCBjaGFuZ2VzIChkcml2ZXMgdGhlIHJ1bGVyIHJhaWwpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxMYXlvdXRTaWduYWw6IElPYnNlcnZhYmxlU2lnbmFsPHZvaWQ+ID0gb2JzZXJ2YWJsZVNpZ25hbDx2b2lkPih0aGlzKTtcblx0Z2V0IG9uRGlkQ2hhbmdlU2Nyb2xsTGF5b3V0KCk6IElPYnNlcnZhYmxlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3Njcm9sbExheW91dFNpZ25hbDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBQZXItaXRlbSBjb250ZW50LXNpZ25hbCBjYWNoZSAoaWQgLT4ge3ZlcnNpb24sIHNpZ25hbH0pIGZvciBoZWlnaHQgZXN0aW1hdGlvbjsgdmVyc2lvbiBpbnZhbGlkYXRlcyBvbiBjb250ZW50IGdyb3d0aC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmFsQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgeyB2ZXJzaW9uOiBudW1iZXI7IHNpZ25hbDogbnVtYmVyIH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aWRnZXQ6IENoYXRXaWRnZXQsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2U6IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Ly8gQXNzaWduZWQgaGVyZSAobm90IGFzIGEgZmllbGQgaW5pdGlhbGl6ZXIpIGJlY2F1c2UgaXQgcmVhZHMgYHRoaXMud2lkZ2V0YCxcblx0XHQvLyB3aGljaCBwYXJhbWV0ZXIgcHJvcGVydGllcyBvbmx5IGFzc2lnbiBvbmNlIHRoZSBjb25zdHJ1Y3RvciBib2R5IHJ1bnMuXG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLndpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCwgKCkgPT4gdGhpcy53aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHRoaXMuX2JpbmRWaWV3TW9kZWwoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkU2Nyb2xsKCgpID0+IHsgdGhpcy5fdXBkYXRlQWN0aXZlKCk7IHRoaXMuX3RyaWdnZXJTY3JvbGxMYXlvdXQoKTsgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgoKSA9PiB0aGlzLl90cmlnZ2VyU2Nyb2xsTGF5b3V0KCkpKTtcblx0XHQvLyBSZS1ldmFsdWF0ZSB0aGUgYWN0aXZlIHRpY2sgd2hlbmV2ZXIgdGhlIHRpY2tzIGNoYW5nZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9iYXNlVGlja3MucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQWN0aXZlKCk7XG5cdFx0XHR0aGlzLl90cmlnZ2VyU2Nyb2xsTGF5b3V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2JpbmRWaWV3TW9kZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyaWdnZXJTY3JvbGxMYXlvdXQoKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4gdGhpcy5fc2Nyb2xsTGF5b3V0U2lnbmFsLnRyaWdnZXIodHgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcHJvbXB0cycgcG9zaXRpb25zIGZvciB0aGUgb3ZlcnZpZXctcnVsZXIgcmFpbCwgaW4gYW4gKmVzdGltYXRlZCpcblx0ICogY29udGVudCBzcGFjZSB0aGF0IHN0YXlzIHN0YWJsZSB3aGlsZSB0aGUgdHJhbnNjcmlwdCB2aXJ0dWFsaXplcy4gVGhlIHJhaWxcblx0ICogZHJhd3MgaXRzIG93biBzY3JvbGxiYXIgdGh1bWIgZnJvbSBgc2Nyb2xsVG9wYC9gc2Nyb2xsSGVpZ2h0YCAodGhlIHRyYW5zY3JpcHQnc1xuXHQgKiBuYXRpdmUgc2Nyb2xsYmFyIGlzIGhpZGRlbiB3aGlsZSB0aGUgcmFpbCBpcyBhY3RpdmUpIHNvIHRoZSB3aG9sZSBsYW5lIGlzIG9uZVxuXHQgKiBzdXJmYWNlOiBhIHBsYWluIHNjcm9sbGJhciB0aGF0IGJsb29tcyBpbnRvIHRoZSBwcm9tcHQgZmFuIG9uIGVuZ2FnZW1lbnQuXG5cdCAqXG5cdCAqIFRoZSBjaGF0IGxpc3QncyBvd24gaGVpZ2h0IG1vZGVsIChgZ2V0RWxlbWVudFRvcGAvYHNjcm9sbEhlaWdodGApIGd1ZXNzZXNcblx0ICogZXZlcnkgdW4tcmVuZGVyZWQgcm93IGF0IG9uZSBmbGF0IGRlZmF1bHQgaGVpZ2h0ICgyMDBweCkuIFJlYWwgdHVybnMgYXJlXG5cdCAqIG5vdGhpbmcgbGlrZSBmbGF0IFx1MjAxNCBwcm9tcHRzIGFyZSBzaG9ydCwgcmVzcG9uc2VzIHRhbGwgYW5kIHZhcmlhYmxlIFx1MjAxNCBzbyBhc1xuXHQgKiByb3dzIHJlbmRlciBhbmQgZ2V0IG1lYXN1cmVkIHRoZSBsaXN0J3MgdG9wcyBzbmFwIGFyb3VuZCwgZHJhZ2dpbmcgdGhlIG1hcmtzXG5cdCAqIHdpdGggdGhlbSAodGhlIFwic2Nyb2xsIGppdHRlclwiKS4gRm9yIHRoZSBtYXJrcyB3ZSBpbnN0ZWFkIGJ1aWxkIG91ciBvd25cblx0ICogaGVpZ2h0czogbWVhc3VyZWQgcm93cyB1c2UgdGhlaXIgcmVhbCBgY3VycmVudFJlbmRlcmVkSGVpZ2h0YDsgdW4tbWVhc3VyZWRcblx0ICogcm93cyBhcmUgZXN0aW1hdGVkIGZyb20gYSBjb250ZW50IHNpZ25hbCBjYWxpYnJhdGVkIHRvIG1lYXN1cmVkIHJvd3MgKHNlZVxuXHQgKiBgX2NvbXB1dGVBZGFwdGl2ZUxheW91dGApLCBzbyBtYXJrcyBsYW5kIG5lYXIgdGhlaXIgZmluYWwgc3BvdCBpbW1lZGlhdGVseSBhbmRcblx0ICogYmFyZWx5IGRyaWZ0LiBPbmNlIGV2ZXJ5IHJvdyBpcyBtZWFzdXJlZCB0aGlzIGVzdGltYXRlIGVxdWFscyB0aGUgbGlzdCdzIHJlYWxcblx0ICogbGF5b3V0LlxuXHQgKi9cblx0Z2V0U2Nyb2xsTGF5b3V0KCk6IElQcm9tcHRTY3JvbGxMYXlvdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuX2NvbXB1dGVBZGFwdGl2ZUxheW91dCgpO1xuXHRcdGlmICghbGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IGl0ZW1zLCB0b3BzLCB0b3RhbCB9ID0gbGF5b3V0O1xuXHRcdGNvbnN0IG1hcmtzOiB7IHJlcXVlc3RJZDogc3RyaW5nOyB0b3A6IG51bWJlciB9W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gaXRlbXNbaV07XG5cdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdFx0bWFya3MucHVzaCh7IHJlcXVlc3RJZDogaXRlbS5pZCwgdG9wOiB0b3BzW2ldIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBtYXJrcywgdG90YWwsIHNjcm9sbFRvcDogdGhpcy53aWRnZXQuc2Nyb2xsVG9wLCBzY3JvbGxIZWlnaHQ6IHRoaXMud2lkZ2V0LnNjcm9sbEhlaWdodCwgdmlld3BvcnRIZWlnaHQ6IHRoaXMud2lkZ2V0LnZpZXdwb3J0SGVpZ2h0IH07XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIGEgcGVyLWl0ZW0gY29udGVudC1oZWlnaHQgbW9kZWwgZm9yIHRoZSBtYXJrcy4gTWVhc3VyZWQgcm93c1xuXHQgKiBjb250cmlidXRlIHRoZWlyIHJlYWwgcmVuZGVyZWQgaGVpZ2h0OyB1bi1tZWFzdXJlZCByb3dzIGFyZSBlc3RpbWF0ZWQgZnJvbSBhXG5cdCAqIGNoZWFwIGNvbnRlbnQgc2lnbmFsICh+IHJlbmRlcmVkIGxpbmUgY291bnQpIHNjYWxlZCBieSBhIHBpeGVscy1wZXItdW5pdFxuXHQgKiBmYWN0b3IgKmxlYXJuZWQgZnJvbSB0aGUgbWVhc3VyZWQgcm93cyBvZiB0aGUgc2FtZSBraW5kKiwgc28gdGhlIGVzdGltYXRlXG5cdCAqIGNhbGlicmF0ZXMgdG8gdGhlIHJlYWwgbGluZSBoZWlnaHQvd2lkdGggaW5zdGVhZCBvZiByZWx5aW5nIG9uIG1hZ2ljXG5cdCAqIGNvbnN0YW50cy4gRmFsbHMgYmFjayB0byBhIHNlZWQgZmFjdG9yIHVudGlsIGEgcm93IG9mIHRoYXQga2luZCBpcyBtZWFzdXJlZC5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVBZGFwdGl2ZUxheW91dCgpOiB7IGl0ZW1zOiByZWFkb25seSBDaGF0VHJlZUl0ZW1bXTsgdG9wczogbnVtYmVyW107IHRvdGFsOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLndpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBMZWFybiBwaXhlbHMtcGVyLXNpZ25hbC11bml0IHBlciBraW5kIGZyb20gcm93cyB3ZSBoYXZlIGFscmVhZHkgbWVhc3VyZWQuXG5cdFx0Y29uc3QgbWVhc3VyZWRQeDogUmVjb3JkPFByb21wdEl0ZW1LaW5kLCBudW1iZXI+ID0geyByZXF1ZXN0OiAwLCByZXNwb25zZTogMCwgb3RoZXI6IDAgfTtcblx0XHRjb25zdCBtZWFzdXJlZFNpZ25hbDogUmVjb3JkPFByb21wdEl0ZW1LaW5kLCBudW1iZXI+ID0geyByZXF1ZXN0OiAwLCByZXNwb25zZTogMCwgb3RoZXI6IDAgfTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IG1lYXN1cmVkID0gaXRlbS5jdXJyZW50UmVuZGVyZWRIZWlnaHQ7XG5cdFx0XHRpZiAobWVhc3VyZWQgIT09IHVuZGVmaW5lZCAmJiBtZWFzdXJlZCA+IDApIHtcblx0XHRcdFx0Y29uc3Qga2luZCA9IGl0ZW1LaW5kKGl0ZW0pO1xuXHRcdFx0XHRtZWFzdXJlZFB4W2tpbmRdICs9IG1lYXN1cmVkO1xuXHRcdFx0XHRtZWFzdXJlZFNpZ25hbFtraW5kXSArPSB0aGlzLl9pdGVtU2lnbmFsKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBweFBlclVuaXQgPSAoa2luZDogUHJvbXB0SXRlbUtpbmQpOiBudW1iZXIgPT5cblx0XHRcdG1lYXN1cmVkU2lnbmFsW2tpbmRdID4gMCA/IG1lYXN1cmVkUHhba2luZF0gLyBtZWFzdXJlZFNpZ25hbFtraW5kXSA6IFBSSU9SX1BYX1BFUl9VTklUW2tpbmRdO1xuXG5cdFx0Y29uc3QgdG9wczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgYWNjID0gMDtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdHRvcHMucHVzaChhY2MpO1xuXHRcdFx0Y29uc3QgbWVhc3VyZWQgPSBpdGVtLmN1cnJlbnRSZW5kZXJlZEhlaWdodDtcblx0XHRcdGFjYyArPSAobWVhc3VyZWQgIT09IHVuZGVmaW5lZCAmJiBtZWFzdXJlZCA+IDApXG5cdFx0XHRcdD8gbWVhc3VyZWRcblx0XHRcdFx0OiBweFBlclVuaXQoaXRlbUtpbmQoaXRlbSkpICogdGhpcy5faXRlbVNpZ25hbChpdGVtKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgaXRlbXMsIHRvcHMsIHRvdGFsOiBhY2MgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGNoZWFwLCB1bml0LWxlc3Mgc2l6ZSBwcm94eSBmb3IgYSByb3cgKH4gcmVuZGVyZWQgbGluZSBjb3VudCksIHVzZWQgdG9cblx0ICogZXN0aW1hdGUgdW4tbWVhc3VyZWQgcm93cy4gQ2FjaGVkIHBlciBpdGVtIGFuZCBvbmx5IHJlY29tcHV0ZWQgd2hlbiB0aGVcblx0ICogY29udGVudCBncm93cyAocmVzcG9uc2VzIHN0cmVhbSksIHNvIHNjYW5uaW5nIGV2ZXJ5IHJvdyBvbiBlYWNoIHNjcm9sbCBzdGF5c1xuXHQgKiBjaGVhcCBldmVuIGZvciBsb25nIHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXRlbVNpZ25hbChpdGVtOiBDaGF0VHJlZUl0ZW0pOiBudW1iZXIge1xuXHRcdGlmIChpc1JlcXVlc3RWTShpdGVtKSkge1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fc2lnbmFsQ2FjaGUuZ2V0KGl0ZW0uaWQpO1xuXHRcdFx0Y29uc3QgdmVyc2lvbiA9IGl0ZW0ubWVzc2FnZVRleHQubGVuZ3RoO1xuXHRcdFx0aWYgKGNhY2hlZCAmJiBjYWNoZWQudmVyc2lvbiA9PT0gdmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkLnNpZ25hbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNpZ25hbCA9IE1hdGgubWluKE1BWF9TSUdOQUwsIDEgKyBNYXRoLmNlaWwodmVyc2lvbiAvIENIQVJTX1BFUl9MSU5FKSk7XG5cdFx0XHR0aGlzLl9zaWduYWxDYWNoZS5zZXQoaXRlbS5pZCwgeyB2ZXJzaW9uLCBzaWduYWwgfSk7XG5cdFx0XHRyZXR1cm4gc2lnbmFsO1xuXHRcdH1cblx0XHRpZiAoaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRjb25zdCBwYXJ0cyA9IGl0ZW0ucmVzcG9uc2UudmFsdWU7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9zaWduYWxDYWNoZS5nZXQoaXRlbS5pZCk7XG5cdFx0XHRpZiAoY2FjaGVkICYmIGNhY2hlZC52ZXJzaW9uID09PSBwYXJ0cy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlZC5zaWduYWw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gaXRlbS5yZXNwb25zZS5nZXRNYXJrZG93bigpO1xuXHRcdFx0Y29uc3QgY29kZUJsb2NrcyA9IE1hdGguZmxvb3IoKHRleHQubWF0Y2goL2BgYC9nKT8ubGVuZ3RoID8/IDApIC8gMik7XG5cdFx0XHRjb25zdCBsaW5lcyA9IE1hdGguY2VpbCh0ZXh0Lmxlbmd0aCAvIENIQVJTX1BFUl9MSU5FKTtcblx0XHRcdGNvbnN0IHNpZ25hbCA9IE1hdGgubWluKE1BWF9TSUdOQUwsIDEgKyBsaW5lcyArIGNvZGVCbG9ja3MgKiBDT0RFX0JMT0NLX1VOSVRTKTtcblx0XHRcdHRoaXMuX3NpZ25hbENhY2hlLnNldChpdGVtLmlkLCB7IHZlcnNpb246IHBhcnRzLmxlbmd0aCwgc2lnbmFsIH0pO1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRwcml2YXRlIF9iaW5kVmlld01vZGVsKCk6IHZvaWQge1xuXHRcdC8vIERpZmZlcmVudCBzZXNzaW9uJ3MgaXRlbXMgaGF2ZSB1bnJlbGF0ZWQgaWRzOyBkcm9wIHN0YWxlIHNpZ25hbCBlc3RpbWF0ZXMuXG5cdFx0dGhpcy5fc2lnbmFsQ2FjaGUuY2xlYXIoKTtcblx0XHR0aGlzLl92aWV3TW9kZWxMaXN0ZW5lci52YWx1ZSA9IHRoaXMud2lkZ2V0LnZpZXdNb2RlbD8ub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fcmVjb21wdXRlKCkpO1xuXHRcdHRoaXMuX3JlY29tcHV0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb21wdHM6IFByb21wdEl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLndpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCkgPz8gW10pIHtcblx0XHRcdGlmIChpc1JlcXVlc3RWTShpdGVtKSkge1xuXHRcdFx0XHRwcm9tcHRzLnB1c2goeyByZXF1ZXN0SWQ6IGl0ZW0uaWQsIHRleHQ6IGdldFByb21wdFByZXZpZXcoaXRlbS5tZXNzYWdlVGV4dCksIHRpbWVzdGFtcDogaXRlbS50aW1lc3RhbXAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RyZWFtaW5nIGZpcmVzIG9uRGlkQ2hhbmdlIGZvciBldmVyeSB0b2tlbjsgb25seSByZWJ1aWxkIHRpY2tzIHdoZW4gdGhlXG5cdFx0Ly8gc2V0IG9mIHByb21wdHMgYWN0dWFsbHkgY2hhbmdlZC4gUmVuZGVyZWQgaGVpZ2h0cyBzdGlsbCBzaGlmdCwgc28gcmVmcmVzaFxuXHRcdC8vIHRoZSBhY3RpdmUgdGljayBlaXRoZXIgd2F5LlxuXHRcdGlmIChwcm9tcHRzRXF1YWwocHJvbXB0cywgdGhpcy5fcHJvbXB0cy5nZXQoKSkpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUFjdGl2ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm9tcHRzLnNldChwcm9tcHRzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIFJlY29tcHV0ZXMgd2hpY2ggdGljayBtYXBzIHRvIHRoZSBwcm9tcHQgY3VycmVudGx5IHNjcm9sbGVkIGludG8gdmlldy4gKi9cblx0cHJpdmF0ZSBfdXBkYXRlQWN0aXZlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpY2tzID0gdGhpcy5fYmFzZVRpY2tzLmdldCgpO1xuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy53aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpO1xuXHRcdGlmICghaXRlbXMgfHwgdGlja3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVJlcXVlc3RJZC5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVByb21wdElkLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0dGhpcy5fc2Nyb2xsUGlubmVkLnNldChmYWxzZSwgdHgpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGFjdGl2ZSBwcm9tcHQgaXMgdGhlIGxhc3QgcmVxdWVzdCB3aG9zZSB0b3AgZWRnZSBpcyBhdCBvciBhYm92ZSB0aGVcblx0XHQvLyB2aWV3cG9ydCB0b3AuIFBvc2l0aW9ucyBjb21lIGZyb20gdGhlIGxpc3QncyBsYXlvdXQgaGVpZ2h0IG1vZGVsLCBzb1xuXHRcdC8vIG9mZi1zY3JlZW4gcHJvbXB0cyByZXNvbHZlIGNvcnJlY3RseSAobm90IGp1c3QgcmVuZGVyZWQgb25lcykuIFJvd3MgYXJlXG5cdFx0Ly8gb3JkZXJlZCwgc28gdGhlIHNlYXJjaCBzdG9wcyBhdCB0aGUgZmlyc3QgcmVxdWVzdCBiZWxvdyB0aGUgdmlld3BvcnQgdG9wXG5cdFx0Ly8gaW5zdGVhZCBvZiB3YWxraW5nIHRoZSB3aG9sZSAocG90ZW50aWFsbHkgbG9uZykgdHJhbnNjcmlwdCBvbiBldmVyeSBzY3JvbGwuXG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy53aWRnZXQuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IHRocmVzaG9sZCA9IDI0O1xuXHRcdGxldCBhY3RpdmVSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aXZlVGltZXN0YW1wID0gMDtcblx0XHRsZXQgYWN0aXZlVG9wID0gLTE7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XG5cdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbSkpIHtcblx0XHRcdFx0Y29uc3QgdG9wID0gdGhpcy53aWRnZXQuZ2V0RWxlbWVudFRvcChpdGVtKTtcblx0XHRcdFx0aWYgKHRvcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRvcCA+IHNjcm9sbFRvcCArIHRocmVzaG9sZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGl2ZVJlcXVlc3RJZCA9IGl0ZW0uaWQ7XG5cdFx0XHRcdGFjdGl2ZVRpbWVzdGFtcCA9IGl0ZW0udGltZXN0YW1wO1xuXHRcdFx0XHRhY3RpdmVUb3AgPSB0b3A7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2ZVJlcXVlc3RJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBTY3JvbGxlZCBhYm92ZSB0aGUgb2xkZXN0IHByb21wdDogdGhlIG9sZGVzdCB0aWNrIGlzIHRoZSBhY3RpdmUgb25lXG5cdFx0XHQvLyAodGhlIGxvb3AgYWR2YW5jZXMgb2xkZXN0IC0+IG5ld2VzdCBhcyB5b3Ugc2Nyb2xsIGRvd24pLlxuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVSZXF1ZXN0SWQuc2V0KHRpY2tzLmF0KDApPy5yZXF1ZXN0SWQsIHR4KTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlUHJvbXB0SWQuc2V0KHRoaXMuX3Byb21wdHMuZ2V0KCkuYXQoMCk/LnJlcXVlc3RJZCwgdHgpO1xuXHRcdFx0XHR0aGlzLl9zY3JvbGxQaW5uZWQuc2V0KGZhbHNlLCB0eCk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYWN0aXZlVGljayA9IHRpY2tzLmZpbmQodCA9PiB0LmFsbFJlcXVlc3RJZHMuaW5jbHVkZXMoYWN0aXZlUmVxdWVzdElkISkpO1xuXHRcdGlmICghYWN0aXZlVGljaykge1xuXHRcdFx0Ly8gVGhlIGFjdGl2ZSBwcm9tcHQncyBidWNrZXQgbWF5IGhhdmUgYmVlbiBzYW1wbGVkIGF3YXk7IGZhbGwgYmFjayB0byB0aGVcblx0XHRcdC8vIG5lYXJlc3Qgc3Vydml2aW5nIHRpY2sgYXQgb3IgYmVmb3JlIGl0ICh0aWNrcyBhcmUgY2hyb25vbG9naWNhbCkuXG5cdFx0XHRmb3IgKGNvbnN0IHRpY2sgb2YgdGlja3MpIHtcblx0XHRcdFx0aWYgKHRpY2sudGltZXN0YW1wIDw9IGFjdGl2ZVRpbWVzdGFtcCkge1xuXHRcdFx0XHRcdGFjdGl2ZVRpY2sgPSB0aWNrO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFBpbiB0aGUgc3RpY2t5IGhlYWRlciBvbmx5IG9uY2UgdGhlIGFjdGl2ZSBwcm9tcHQncyBvd24gcm93IGhhcyBzY3JvbGxlZCBhYm92ZSB0aGVcblx0XHQvLyB2aWV3cG9ydCB0b3A7IHRoZSBzbWFsbCBlcHNpbG9uIGF2b2lkcyBmbGlja2VyIGFzIGl0cyB0b3AgY3Jvc3NlcyB0aGUgZWRnZS5cblx0XHRjb25zdCBwaW5uZWQgPSBhY3RpdmVUb3AgPCBzY3JvbGxUb3AgLSAyO1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX2FjdGl2ZVJlcXVlc3RJZC5zZXQoKGFjdGl2ZVRpY2sgPz8gdGlja3NbdGlja3MubGVuZ3RoIC0gMV0pLnJlcXVlc3RJZCwgdHgpO1xuXHRcdFx0Ly8gVGhlIHN0aWNreSBoZWFkZXIgbmFtZXMgdGhlIGV4YWN0IGN1cnJlbnQgcHJvbXB0ICh1bmJ1Y2tldGVkKSwgbm90IHRoZSBidWNrZXQgcmVwcmVzZW50YXRpdmUuXG5cdFx0XHR0aGlzLl9hY3RpdmVQcm9tcHRJZC5zZXQoYWN0aXZlUmVxdWVzdElkLCB0eCk7XG5cdFx0XHR0aGlzLl9zY3JvbGxQaW5uZWQuc2V0KHBpbm5lZCwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFJldmVhbHMgdGhlIHJlcXVlc3Qgd2l0aCB0aGUgZ2l2ZW4gaWQgYXQgdGhlIHRvcCBvZiB0aGUgdHJhbnNjcmlwdC4gKi9cblx0cmV2ZWFsKHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLndpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCk7XG5cdFx0Y29uc3QgaW5kZXggPSBpdGVtcz8uZmluZEluZGV4KGkgPT4gaXNSZXF1ZXN0Vk0oaSkgJiYgaS5pZCA9PT0gcmVxdWVzdElkKSA/PyAtMTtcblx0XHRpZiAoaXRlbXMgJiYgaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy53aWRnZXQucmV2ZWFsKGl0ZW1zW2luZGV4XSwgMCk7XG5cdFx0fVxuXHRcdC8vIE5vcm1hbGl6ZSB0byB0aGUgb3duaW5nIHRpY2sncyByZXByZXNlbnRhdGl2ZSBpZCBzbyB0aGUgYWN0aXZlIGhpZ2hsaWdodFxuXHRcdC8vIHdvcmtzIGV2ZW4gd2hlbiB0aGUgaWQgaXMgYSBtaWQtYnVja2V0IHByb21wdCAocGlja2VyKS5cblx0XHRjb25zdCBvd25pbmdUaWNrID0gdGhpcy5fYmFzZVRpY2tzLmdldCgpLmZpbmQodCA9PiB0LmFsbFJlcXVlc3RJZHMuaW5jbHVkZXMocmVxdWVzdElkKSk7XG5cdFx0dGhpcy5fYWN0aXZlUmVxdWVzdElkLnNldChvd25pbmdUaWNrPy5yZXF1ZXN0SWQgPz8gcmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldmVhbHMgdGhlIHByb21wdCB0aGUgc3RpY2t5IGhlYWRlciBjdXJyZW50bHkgbmFtZXMgKHRoZSBwcm9tcHQgc2Nyb2xsZWQgdG8gdGhlIHRvcCkuIFVzZWQgd2hlbiB0aGVcblx0ICogaGVhZGVyJ3MgbGFiZWwgaXMgYWN0aXZhdGVkIHNvIGl0IGp1bXBzIHN0cmFpZ2h0IHRvIHRoYXQgcHJvbXB0LCBhbGlnbmVkIHRvIHRoZSB0b3Agb2YgdGhlIHRyYW5zY3JpcHQuXG5cdCAqL1xuXHRyZXZlYWxBY3RpdmVQcm9tcHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9hY3RpdmVQcm9tcHRJZC5nZXQoKTtcblx0XHRpZiAoaWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5yZXZlYWwoaWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBwcm9tcHQgYGRlbHRhYCBwb3NpdGlvbnMgYXdheSBmcm9tIHRoZSBvbmUgdGhlIGhlYWRlciBuYW1lcywgYWxpZ25lZCB0byB0aGUgdG9wIG9mIHRoZVxuXHQgKiB0cmFuc2NyaXB0IGxpa2UgdGhlIHJhaWwgYW5kIHRoZSBsYWJlbCBhY3RpdmF0aW9uLiBUaGUgaGVhZGVyIHRoZW4gZm9sbG93cyBzY3JvbGwgdHJhY2tpbmcsIGhpZGluZ1xuXHQgKiBvbmNlIHRoZSB0YXJnZXQgcHJvbXB0IGlzIGF0IHRoZSB0b3AuXG5cdCAqL1xuXHRuYXZpZ2F0ZShkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvbXB0cyA9IHRoaXMuX3Byb21wdHMuZ2V0KCk7XG5cdFx0aWYgKHByb21wdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlkID0gdGhpcy5fYWN0aXZlUHJvbXB0SWQuZ2V0KCk7XG5cdFx0Y29uc3QgY3VycmVudCA9IGlkID8gcHJvbXB0cy5maW5kSW5kZXgocCA9PiBwLnJlcXVlc3RJZCA9PT0gaWQpIDogMDtcblx0XHRjb25zdCBiYXNlID0gY3VycmVudCA8IDAgPyAwIDogY3VycmVudDtcblx0XHRjb25zdCB0YXJnZXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihwcm9tcHRzLmxlbmd0aCAtIDEsIGJhc2UgKyBkZWx0YSkpO1xuXHRcdGlmICh0YXJnZXQgPT09IGJhc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXZlYWwocHJvbXB0c1t0YXJnZXRdLnJlcXVlc3RJZCk7XG5cdH1cblxuXHQvKiogVGhlIGNoYW5nZWQgZmlsZXMgZm9yIGEgdGljaydzIHByb21wdHMsIGFnZ3JlZ2F0ZWQgcGVyIGZpbGUgKGZvciB0aGUgaG92ZXIgY2FyZCAvIGRyaWxsLWRvd24pLiAqL1xuXHRnZXRSZXF1ZXN0RmlsZXModGljazogUHJvbXB0VGljayk6IHJlYWRvbmx5IFByb21wdEZpbGVEaWZmW10ge1xuXHRcdGNvbnN0IGJ5UGF0aCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9tcHRGaWxlRGlmZj4oKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiB0aWNrLmFsbFJlcXVlc3RJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiB0aGlzLl9kaWZmc0ZvclJlcXVlc3QocmVxdWVzdElkKSkge1xuXHRcdFx0XHRpZiAoZGlmZi5pZGVudGljYWwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBrZXkgPSBkaWZmLm1vZGlmaWVkVVJJLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gYnlQYXRoLmdldChrZXkpO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0XHQvLyBHcm91cGVkIHRpY2ssIHNhbWUgZmlsZSBhY3Jvc3MgcHJvbXB0czogdGhlIHByb21wdHMgYXJlXG5cdFx0XHRcdFx0Ly8gY2hyb25vbG9naWNhbCwgc28ga2VlcCB0aGUgZWFybGllc3QgYG9yaWdpbmFsVVJJYCAoYmVmb3JlKSBidXRcblx0XHRcdFx0XHQvLyBhZHZhbmNlIGBkaWZmTW9kaWZpZWRVUklgIHRvIHRoaXMgbGF0ZXIgcHJvbXB0J3MgYWZ0ZXItc25hcHNob3Rcblx0XHRcdFx0XHQvLyBzbyB0aGUgb3BlbmVkIGRpZmYgc3BhbnMgdGhlIHdob2xlIHRpY2ssIG5vdCBqdXN0IHRoZSBmaXJzdCBlZGl0LlxuXHRcdFx0XHRcdGJ5UGF0aC5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdFx0XHRcdGRpZmZNb2RpZmllZFVSSTogZGlmZi5tb2RpZmllZFNuYXBzaG90VVJJID8/IGRpZmYubW9kaWZpZWRVUkksXG5cdFx0XHRcdFx0XHRhZGRlZDogZXhpc3RpbmcuYWRkZWQgKyBkaWZmLmFkZGVkLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogZXhpc3RpbmcucmVtb3ZlZCArIGRpZmYucmVtb3ZlZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRieVBhdGguc2V0KGtleSwge1xuXHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoZGlmZi5tb2RpZmllZFVSSSksXG5cdFx0XHRcdFx0XHRvcmlnaW5hbFVSSTogZGlmZi5vcmlnaW5hbFVSSSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkVVJJOiBkaWZmLm1vZGlmaWVkVVJJLFxuXHRcdFx0XHRcdFx0ZGlmZk1vZGlmaWVkVVJJOiBkaWZmLm1vZGlmaWVkU25hcHNob3RVUkkgPz8gZGlmZi5tb2RpZmllZFVSSSxcblx0XHRcdFx0XHRcdGFkZGVkOiBkaWZmLmFkZGVkLFxuXHRcdFx0XHRcdFx0cmVtb3ZlZDogZGlmZi5yZW1vdmVkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uYnlQYXRoLnZhbHVlcygpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgcGVyLXByb21wdCBjaGFuZ2VzIGFzIGEgbXVsdGktZmlsZSBkaWZmLiBXaGVuIGEgc3BlY2lmaWMgZmlsZSBpc1xuXHQgKiBnaXZlbiAoYSBmaWxlIHJvdyBpbiB0aGUgY2FyZCksIHRoZSBzYW1lIG11bHRpLWRpZmYgaXMgb3BlbmVkIGJ1dCByZXZlYWxlZFxuXHQgKiBhdCB0aGF0IGZpbGUsIHNvIHBlci1maWxlIGFuZCB3aG9sZS1wcm9tcHQgcmV2aWV3IHNoYXJlIG9uZSBleHBlcmllbmNlLlxuXHQgKi9cblx0YXN5bmMgcmV2aWV3Q2hhbmdlcyh0aWNrOiBQcm9tcHRUaWNrLCBmaWxlPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXMgPSB0aGlzLmdldFJlcXVlc3RGaWxlcyh0aWNrKTtcblx0XHRpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zOiBNdWx0aURpZmZFZGl0b3JJdGVtW10gPSBbXTtcblx0XHRsZXQgcmV2ZWFsUmVzb3VyY2U6IHsgb3JpZ2luYWw6IFVSSSB8IHVuZGVmaW5lZDsgbW9kaWZpZWQ6IFVSSSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZiBvZiBmaWxlcykge1xuXHRcdFx0Y29uc3QgW29yaWdpbmFsVVJJLCBtb2RpZmllZFVSSV0gPSBhd2FpdCB0aGlzLl9yZWFkYWJsZVNpZGVzKGYpO1xuXHRcdFx0aWYgKCFvcmlnaW5hbFVSSSAmJiAhbW9kaWZpZWRVUkkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBEaWZmIHRoZSBiZXN0LWF2YWlsYWJsZSBiZWZvcmUvYWZ0ZXIgY29udGVudCwgYnV0IGxldCBcImdvIHRvIGZpbGVcIiBvcGVuIHRoZSBsaXZlIGZpbGUuXG5cdFx0XHRpdGVtcy5wdXNoKG5ldyBNdWx0aURpZmZFZGl0b3JJdGVtKG9yaWdpbmFsVVJJLCBtb2RpZmllZFVSSSwgZi5tb2RpZmllZFVSSSkpO1xuXHRcdFx0aWYgKGZpbGUgJiYgaXNFcXVhbChmLm1vZGlmaWVkVVJJLCBmaWxlKSkge1xuXHRcdFx0XHRyZXZlYWxSZXNvdXJjZSA9IHsgb3JpZ2luYWw6IG9yaWdpbmFsVVJJLCBtb2RpZmllZDogbW9kaWZpZWRVUkkgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSBVUkkucGFyc2UoYG11bHRpLWRpZmYtZWRpdG9yOnByb21wdC10aW1lbGluZS8ke2dlbmVyYXRlVXVpZCgpfWApO1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE11bHRpRGlmZkVkaXRvcklucHV0LFxuXHRcdFx0c291cmNlLFxuXHRcdFx0bG9jYWxpemUoJ3Byb21wdFRpbWVsaW5lLnJldmlld1RpdGxlJywgXCJDaGFuZ2VzIFx1MDBCNyB7MH1cIiwgdGljay50ZXh0KSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KTtcblx0XHRjb25zdCBvcHRpb25zOiBJTXVsdGlEaWZmRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHJldmVhbFJlc291cmNlXG5cdFx0XHQ/IHsgdmlld1N0YXRlOiB7IHJldmVhbERhdGE6IHsgcmVzb3VyY2U6IHJldmVhbFJlc291cmNlIH0gfSB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgd2hpY2ggc2lkZXMgb2YgYSBmaWxlIGRpZmYgY2FuIGFjdHVhbGx5IGJlIHJlYWQuIFByZWZlcnMgdGhlIGZyb3plblxuXHQgKiBiZWZvcmUvYWZ0ZXIgc25hcHNob3RzIHNvIG9ubHkgdGhpcyB0dXJuJ3MgY2hhbmdlcyBzaG93LCBidXQgdGhlIGFnZW50LWhvc3Rcblx0ICogY2hlY2twb2ludCBibG9icyBiYWNraW5nIHRoZW0gY2FuIGJlIG1pc3NpbmcgKGFuIGFkZGVkIGZpbGUncyBvcmlnaW5hbCwgb3IgYVxuXHQgKiBwcnVuZWQvcmVzdG9yZWQgc2Vzc2lvbiB3aGVyZSB3aG9sZSBjaGVja3BvaW50cyBhcmUgZ29uZSkuIFRoZSBtb2RpZmllZCBzaWRlXG5cdCAqIHRoZW4gZmFsbHMgYmFjayB0byB0aGUgbGl2ZSB3b3JraW5nIGZpbGUgc28gcmV2aWV3IHN0aWxsIG9wZW5zIHdpdGggdGhlIGJlc3Rcblx0ICogYXZhaWxhYmxlIGZpZGVsaXR5OyBhbiB1bnJlYWRhYmxlIHNpZGUgaXMgZHJvcHBlZCBzbyB0aGUgZmlsZSBzdGlsbCByZW5kZXJzXG5cdCAqIGFzIGEgcHVyZSBhZGQvZGVsZXRlIGluc3RlYWQgb2YgY3Jhc2hpbmcgdGhlIGRpZmYgZWRpdG9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZGFibGVTaWRlcyhmaWxlOiBQcm9tcHRGaWxlRGlmZik6IFByb21pc2U8W1VSSSB8IHVuZGVmaW5lZCwgVVJJIHwgdW5kZWZpbmVkXT4ge1xuXHRcdC8vIFRoZSBwcm92aWRlciBzZXRzIG9yaWdpbmFsVVJJID09PSBtb2RpZmllZFVSSSB3aGVuIHRoZXJlIGlzIG5vIFwiYmVmb3JlXCJcblx0XHQvLyAoYSBjcmVhdGVkIGZpbGUpOyB0cmVhdCB0aGF0IGFzIG5vIGZyb3plbiBvcmlnaW5hbC5cblx0XHRjb25zdCBoYXNGcm96ZW5PcmlnaW5hbCA9ICFpc0VxdWFsKGZpbGUub3JpZ2luYWxVUkksIGZpbGUubW9kaWZpZWRVUkkpO1xuXHRcdGNvbnN0IGhhc0Zyb3plbk1vZGlmaWVkID0gIWlzRXF1YWwoZmlsZS5kaWZmTW9kaWZpZWRVUkksIGZpbGUubW9kaWZpZWRVUkkpO1xuXHRcdGNvbnN0IFtmcm96ZW5PcmlnaW5hbFJlYWRhYmxlLCBmcm96ZW5Nb2RpZmllZFJlYWRhYmxlLCBsaXZlTW9kaWZpZWRSZWFkYWJsZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRoYXNGcm96ZW5PcmlnaW5hbCA/IHRoaXMuX2NhblJlYWQoZmlsZS5vcmlnaW5hbFVSSSkgOiBQcm9taXNlLnJlc29sdmUoZmFsc2UpLFxuXHRcdFx0aGFzRnJvemVuTW9kaWZpZWQgPyB0aGlzLl9jYW5SZWFkKGZpbGUuZGlmZk1vZGlmaWVkVVJJKSA6IFByb21pc2UucmVzb2x2ZShmYWxzZSksXG5cdFx0XHR0aGlzLl9jYW5SZWFkKGZpbGUubW9kaWZpZWRVUkkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gZnJvemVuTW9kaWZpZWRSZWFkYWJsZSA/IGZpbGUuZGlmZk1vZGlmaWVkVVJJXG5cdFx0XHQ6IGxpdmVNb2RpZmllZFJlYWRhYmxlID8gZmlsZS5tb2RpZmllZFVSSVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW2Zyb3plbk9yaWdpbmFsUmVhZGFibGUgPyBmaWxlLm9yaWdpbmFsVVJJIDogdW5kZWZpbmVkLCBtb2RpZmllZF07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYW5SZWFkKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBBZ2VudC1ob3N0IGdpdC1ibG9iIFVSSXMgYWx3YXlzIGBzdGF0YCBzdWNjZXNzZnVsbHkgZXZlbiB3aGVuIHRoZSBibG9iXG5cdFx0Ly8gaXMgbWlzc2luZywgc28gcHJvYmUgd2l0aCBhbiBhY3R1YWwgcmVhZCB0byBkZXRlY3QgdW5yZWFkYWJsZSBzaWRlcy5cblx0XHQvLyBSZWFkIGEgc2luZ2xlIGJ5dGU6IGVub3VnaCB0byBzdXJmYWNlIGEgbm90LWZvdW5kIGVycm9yIHdpdGhvdXQgcHVsbGluZ1xuXHRcdC8vIHdob2xlIChwb3RlbnRpYWxseSBsYXJnZSkgZmlsZSBjb250ZW50cyBqdXN0IHRvIHRlc3QgYXZhaWxhYmlsaXR5LlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlLCB7IGxlbmd0aDogMSB9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQZXItcmVxdWVzdCBmaWxlIGRpZmZzLCBwcmVmZXJyaW5nIHRoZSBzZXNzaW9uIHR5cGUncyBhdXRob3JpdGF0aXZlXG5cdCAqIHByb3ZpZGVyIChhZ2VudC1ob3N0IHNlc3Npb25zIGV4cG9zZSBhIHNlcnZlci1jb21wdXRlZCBwZXItdHVybiBjaGFuZ2VzZXRcblx0ICogdGhhdCBzdXJ2aXZlcyByZWxvYWQpLCBhbmQgZmFsbGluZyBiYWNrIHRvIHRoZSBjaGF0IGVkaXRpbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2RpZmZzRm9yUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVhZGVyPzogSVJlYWRlcik6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHJlYWRlciA/IHRoaXMuX3Nlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikgOiB0aGlzLl9zZXNzaW9uUmVzb3VyY2UuZ2V0KCk7XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlZCA9IHRoaXMuY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNGb3JSZXF1ZXN0KHJlc291cmNlLCByZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVkKSB7XG5cdFx0XHRcdHJldHVybiByZWFkZXIgPyBwcm92aWRlZC5yZWFkKHJlYWRlcikgOiBwcm92aWRlZC5nZXQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHJlYWRlciA/IHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocmVhZGVyKSA6IHRoaXMuX2VkaXRpbmdTZXNzaW9uLmdldCgpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBvYnMgPSBzZXNzaW9uLmdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QocmVxdWVzdElkKTtcblx0XHRcdHJldHVybiByZWFkZXIgPyBvYnMucmVhZChyZWFkZXIpIDogb2JzLmdldCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHQvKiogU3VtcyB0aGUgZGlmZiBzdGF0cyBhY3Jvc3MgdGhlIGdpdmVuIHJlcXVlc3RzLCBvciB1bmRlZmluZWQgd2hlbiBub3RoaW5nIGNoYW5nZWQuICovXG5cdHByaXZhdGUgX3N0YXRGb3JSZXF1ZXN0cyhyZXF1ZXN0SWRzOiByZWFkb25seSBzdHJpbmdbXSwgcmVhZGVyPzogSVJlYWRlcik6IFByb21wdERpZmZTdGF0IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYWRkZWQgPSAwO1xuXHRcdGxldCByZW1vdmVkID0gMDtcblx0XHRjb25zdCBmaWxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdElkIG9mIHJlcXVlc3RJZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiB0aGlzLl9kaWZmc0ZvclJlcXVlc3QocmVxdWVzdElkLCByZWFkZXIpKSB7XG5cdFx0XHRcdGlmIChkaWZmLmlkZW50aWNhbCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkZGVkICs9IGRpZmYuYWRkZWQ7XG5cdFx0XHRcdHJlbW92ZWQgKz0gZGlmZi5yZW1vdmVkO1xuXHRcdFx0XHRmaWxlcy5hZGQoZGlmZi5tb2RpZmllZFVSSS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZpbGVzLnNpemUgPiAwID8geyBhZGRlZCwgcmVtb3ZlZCwgZmlsZUNvdW50OiBmaWxlcy5zaXplIH0gOiB1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
