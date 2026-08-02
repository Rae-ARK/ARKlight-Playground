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
import { timeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { extUri } from "../../../../base/common/resources.js";
import { ChatDebugLogLevel } from "./chatDebugService.js";
import { isAgentHostTarget, localChatSessionType } from "./chatSessionsService.js";
import { getChatSessionType } from "./model/chatUri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AgentHostAgentDebugLogMaxEventsSettingId } from "./promptSyntax/promptTypes.js";
class SessionEventBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this._head = 0;
    this._size = 0;
    this._buffer = new Array(capacity);
  }
  get size() {
    return this._size;
  }
  push(event) {
    const idx = (this._head + this._size) % this.capacity;
    this._buffer[idx] = event;
    if (this._size < this.capacity) {
      this._size++;
    } else {
      this._head = (this._head + 1) % this.capacity;
    }
  }
  /** Return events in insertion order. */
  toArray() {
    const result = [];
    for (let i = 0; i < this._size; i++) {
      const event = this._buffer[(this._head + i) % this.capacity];
      if (event) {
        result.push(event);
      }
    }
    return result;
  }
  /** Remove events matching the predicate and compact in-place. */
  removeWhere(predicate) {
    let write = 0;
    for (let i = 0; i < this._size; i++) {
      const idx = (this._head + i) % this.capacity;
      const event = this._buffer[idx];
      if (event && predicate(event)) {
        continue;
      }
      if (write !== i) {
        const writeIdx = (this._head + write) % this.capacity;
        this._buffer[writeIdx] = event;
      }
      write++;
    }
    for (let i = write; i < this._size; i++) {
      this._buffer[(this._head + i) % this.capacity] = void 0;
    }
    this._size = write;
  }
  clear() {
    this._buffer.fill(void 0);
    this._head = 0;
    this._size = 0;
  }
}
let ChatDebugServiceImpl = class extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    /** Per-session event buffers. Ordered from oldest to newest session (LRU). */
    this._sessionBuffers = new ResourceMap();
    /** Ordered list of session URIs for LRU eviction. */
    this._sessionOrder = [];
    /** Per-session tracking of seen event IDs to deduplicate events
     *  that share the same ID (e.g. subagentInvocation + userMessage
     *  emitted from the same span). Stores id → event kind so we can
     *  keep the richer event kind on collision. */
    this._seenEventIds = new ResourceMap();
    this._onDidAddEvent = this._register(new Emitter());
    this.onDidAddEvent = this._onDidAddEvent.event;
    this._onDidClearProviderEvents = this._register(new Emitter());
    this.onDidClearProviderEvents = this._onDidClearProviderEvents.event;
    this._onDidEndSession = this._register(new Emitter());
    this.onDidEndSession = this._onDidEndSession.event;
    this._onDidChangeAvailableSessionResources = this._register(new Emitter());
    this.onDidChangeAvailableSessionResources = this._onDidChangeAvailableSessionResources.event;
    this._providers = /* @__PURE__ */ new Set();
    this._invocationCts = new ResourceMap();
    /**
     * Sessions whose provider events should be cleared before the next batch of
     * provider events is applied. The clear is deferred until the first new
     * provider event actually arrives so that a provider which transiently
     * returns nothing (e.g. an Agent Host `events.jsonl` mid-rewrite) does not
     * wipe the events currently shown.
     */
    this._pendingProviderClear = new ResourceMap();
    /** Events that were returned by providers (not internally logged). */
    this._providerEvents = /* @__PURE__ */ new WeakSet();
    /** Session URIs created via import. */
    this._importedSessions = new ResourceMap();
    /** Session URIs reported by providers as available on disk (historical sessions). */
    this._availableSessionResources = [];
    this._availableSessionResourceSet = /* @__PURE__ */ new Set();
    /** Titles for historical sessions discovered from disk. */
    this._historicalSessionTitles = new ResourceMap();
    /** Human-readable titles for imported sessions. */
    this._importedSessionTitles = new ResourceMap();
    /** Lazy fetchers for available sessions from providers. Each is invoked at most once. */
    this._availableSessionsFetchers = /* @__PURE__ */ new Set();
    this._availableSessionsRequested = false;
  }
  _isDebugEligibleSession(sessionResource) {
    const sessionType = getChatSessionType(sessionResource);
    return ChatDebugServiceImpl._debugEligibleSessionTypes.has(sessionType) || sessionType.startsWith("remote-") && sessionType.endsWith("-copilotcli") || this._importedSessions.has(sessionResource);
  }
  /**
   * The in-memory event capacity for a session. Agent host (Copilot CLI)
   * sessions honor a dedicated, configurable cap so their (potentially large)
   * on-disk logs can be surfaced without changing the local-session default;
   * all other sessions use {@link ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION}.
   */
  _capacityForSession(sessionResource) {
    if (!isAgentHostTarget(getChatSessionType(sessionResource))) {
      return ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION;
    }
    const configured = this._configurationService.getValue(AgentHostAgentDebugLogMaxEventsSettingId);
    if (typeof configured === "number" && Number.isFinite(configured) && configured >= 1) {
      return Math.floor(configured);
    }
    return ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION;
  }
  log(sessionResource, name, details, level = ChatDebugLogLevel.Info, options) {
    if (!this._isDebugEligibleSession(sessionResource)) {
      return;
    }
    this.addEvent({
      kind: "generic",
      id: options?.id,
      sessionResource,
      created: /* @__PURE__ */ new Date(),
      name,
      details,
      level,
      category: options?.category,
      parentEventId: options?.parentEventId
    });
  }
  addEvent(event) {
    let buffer = this._sessionBuffers.get(event.sessionResource);
    const capacity = buffer?.capacity ?? this._capacityForSession(event.sessionResource);
    if (event.id) {
      let seen = this._seenEventIds.get(event.sessionResource);
      if (!seen) {
        seen = /* @__PURE__ */ new Map();
        this._seenEventIds.set(event.sessionResource, seen);
      }
      const existingKind = seen.get(event.id);
      if (existingKind !== void 0) {
        const priority = ChatDebugServiceImpl._eventKindPriority;
        if ((priority[event.kind] ?? 5) >= (priority[existingKind] ?? 5)) {
          return;
        }
      }
      seen.set(event.id, event.kind);
      if (seen.size > capacity) {
        const firstKey = seen.keys().next().value;
        if (firstKey !== void 0) {
          seen.delete(firstKey);
        }
      }
    }
    if (!buffer) {
      if (this._sessionOrder.length >= ChatDebugServiceImpl.MAX_SESSIONS) {
        const evicted = this._sessionOrder.shift();
        this._evictSession(evicted);
      }
      buffer = new SessionEventBuffer(capacity);
      this._sessionBuffers.set(event.sessionResource, buffer);
      this._sessionOrder.push(event.sessionResource);
    } else {
      const last = this._sessionOrder.length - 1;
      if (last < 0 || !extUri.isEqual(this._sessionOrder[last], event.sessionResource)) {
        const idx = this._sessionOrder.findIndex((u) => extUri.isEqual(u, event.sessionResource));
        if (idx !== -1 && idx !== last) {
          this._sessionOrder.splice(idx, 1);
          this._sessionOrder.push(event.sessionResource);
        }
      }
    }
    buffer.push(event);
    this._onDidAddEvent.fire(event);
  }
  addProviderEvent(event) {
    if (this._pendingProviderClear.has(event.sessionResource)) {
      this._pendingProviderClear.delete(event.sessionResource);
      this._clearProviderEvents(event.sessionResource);
    }
    this._providerEvents.add(event);
    this.addEvent(event);
  }
  getEvents(sessionResource) {
    if (sessionResource) {
      const buffer = this._sessionBuffers.get(sessionResource);
      if (!buffer) {
        return [];
      }
      let result2 = buffer.toArray();
      if (!this._isSorted(result2)) {
        result2.sort((a, b) => a.created.getTime() - b.created.getTime());
      }
      result2 = this._deduplicateEvents(result2);
      return result2;
    }
    const result = [];
    for (const buffer of this._sessionBuffers.values()) {
      result.push(...buffer.toArray());
    }
    result.sort((a, b) => a.created.getTime() - b.created.getTime());
    return result;
  }
  _isSorted(events) {
    for (let i = 1; i < events.length; i++) {
      if (events[i].created.getTime() < events[i - 1].created.getTime()) {
        return false;
      }
    }
    return true;
  }
  _deduplicateEvents(events) {
    const seen = /* @__PURE__ */ new Map();
    const priority = ChatDebugServiceImpl._eventKindPriority;
    const result = [];
    for (const event of events) {
      if (!event.id) {
        result.push(event);
        continue;
      }
      const existingIdx = seen.get(event.id);
      if (existingIdx === void 0) {
        seen.set(event.id, result.length);
        result.push(event);
      } else {
        const existing = result[existingIdx];
        if ((priority[event.kind] ?? 5) < (priority[existing.kind] ?? 5)) {
          result[existingIdx] = event;
        }
      }
    }
    return result;
  }
  getSessionResources() {
    return [...this._sessionOrder];
  }
  clear() {
    this._sessionBuffers.clear();
    this._sessionOrder.length = 0;
    this._seenEventIds.clear();
    this._importedSessions.clear();
    this._importedSessionTitles.clear();
    this._availableSessionResources.length = 0;
    this._availableSessionResourceSet.clear();
    this._historicalSessionTitles.clear();
  }
  /** Remove all ancillary state for an evicted session. */
  _evictSession(sessionResource) {
    this._sessionBuffers.delete(sessionResource);
    this._seenEventIds.delete(sessionResource);
    this._importedSessions.delete(sessionResource);
    this._importedSessionTitles.delete(sessionResource);
    const cts = this._invocationCts.get(sessionResource);
    if (cts) {
      cts.cancel();
      cts.dispose();
      this._invocationCts.delete(sessionResource);
    }
  }
  registerProvider(provider) {
    this._providers.add(provider);
    for (const [sessionResource, cts] of this._invocationCts) {
      if (!cts.token.isCancellationRequested) {
        this._invokeProvider(provider, sessionResource, cts.token).catch(onUnexpectedError);
      }
    }
    return toDisposable(() => {
      this._providers.delete(provider);
    });
  }
  hasInvokedProviders(sessionResource) {
    return this._invocationCts.has(sessionResource);
  }
  async invokeProviders(sessionResource) {
    if (!this._isDebugEligibleSession(sessionResource)) {
      return;
    }
    const existingCts = this._invocationCts.get(sessionResource);
    if (existingCts) {
      existingCts.cancel();
      existingCts.dispose();
    }
    this._pendingProviderClear.set(sessionResource, true);
    const cts = new CancellationTokenSource();
    this._invocationCts.set(sessionResource, cts);
    try {
      const promises = [...this._providers].map(
        (provider) => this._invokeProvider(provider, sessionResource, cts.token)
      );
      await Promise.allSettled(promises);
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  async _invokeProvider(provider, sessionResource, token) {
    try {
      const events = await provider.provideChatDebugLog(sessionResource, token);
      if (events) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < events.length; i++) {
          if (token.isCancellationRequested) {
            break;
          }
          this.addProviderEvent({
            ...events[i],
            sessionResource: events[i].sessionResource ?? sessionResource
          });
          if (i > 0 && i % BATCH_SIZE === 0) {
            await timeout(0);
          }
        }
      }
    } catch (err) {
      onUnexpectedError(err);
    }
  }
  endSession(sessionResource) {
    const cts = this._invocationCts.get(sessionResource);
    if (cts) {
      cts.cancel();
      cts.dispose();
      this._invocationCts.delete(sessionResource);
    }
    this._onDidEndSession.fire(sessionResource);
  }
  _clearProviderEvents(sessionResource) {
    const buffer = this._sessionBuffers.get(sessionResource);
    if (buffer) {
      const coreEvents = buffer.toArray().filter((e) => !this._providerEvents.has(e));
      buffer.clear();
      for (const e of coreEvents) {
        buffer.push(e);
      }
    }
    this._seenEventIds.delete(sessionResource);
    this._onDidClearProviderEvents.fire(sessionResource);
  }
  async resolveEvent(eventId) {
    for (const provider of this._providers) {
      if (provider.resolveChatDebugLogEvent) {
        try {
          const resolved = await provider.resolveChatDebugLogEvent(eventId, CancellationToken.None);
          if (resolved !== void 0) {
            return resolved;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  isCoreEvent(event) {
    return !this._providerEvents.has(event);
  }
  setImportedSessionTitle(sessionResource, title) {
    this._importedSessionTitles.set(sessionResource, title);
  }
  getImportedSessionTitle(sessionResource) {
    return this._importedSessionTitles.get(sessionResource);
  }
  addAvailableSessionResources(resources) {
    let added = false;
    for (const { uri, title } of resources) {
      const key = uri.toString();
      if (!this._availableSessionResourceSet.has(key)) {
        this._availableSessionResourceSet.add(key);
        this._availableSessionResources.push(uri);
        added = true;
      }
      if (title) {
        this._historicalSessionTitles.set(uri, title);
      }
    }
    if (added) {
      this._onDidChangeAvailableSessionResources.fire();
    }
  }
  getAvailableSessionResources() {
    this._availableSessionsRequested = true;
    this._tryFetchAvailableSessions();
    const known = new Set(this._sessionOrder.map((u) => u.toString()));
    const result = [...this._sessionOrder];
    for (const uri of this._availableSessionResources) {
      if (!known.has(uri.toString())) {
        known.add(uri.toString());
        result.push(uri);
      }
    }
    return result;
  }
  registerAvailableSessionsFetcher(fetcher) {
    const entry = { fetcher, started: false };
    this._availableSessionsFetchers.add(entry);
    this._tryFetchAvailableSessions();
    return toDisposable(() => this._availableSessionsFetchers.delete(entry));
  }
  _tryFetchAvailableSessions() {
    if (!this._availableSessionsRequested) {
      return;
    }
    for (const entry of this._availableSessionsFetchers) {
      if (entry.started) {
        continue;
      }
      entry.started = true;
      entry.fetcher(CancellationToken.None).then((entries) => {
        if (entries.length > 0) {
          this.addAvailableSessionResources(entries);
        }
      }).catch(onUnexpectedError);
    }
  }
  getHistoricalSessionTitle(sessionResource) {
    return this._historicalSessionTitles.get(sessionResource);
  }
  async exportLog(sessionResource) {
    for (const provider of this._providers) {
      if (provider.provideChatDebugLogExport) {
        try {
          const data = await provider.provideChatDebugLogExport(sessionResource, CancellationToken.None);
          if (data !== void 0) {
            return data;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  async importLog(data) {
    for (const provider of this._providers) {
      if (provider.resolveChatDebugLogImport) {
        try {
          const sessionUri = await provider.resolveChatDebugLogImport(data, CancellationToken.None);
          if (sessionUri !== void 0) {
            this._importedSessions.set(sessionUri, true);
            return sessionUri;
          }
        } catch (err) {
          onUnexpectedError(err);
        }
      }
    }
    return void 0;
  }
  dispose() {
    for (const cts of this._invocationCts.values()) {
      cts.cancel();
      cts.dispose();
    }
    this._invocationCts.clear();
    this.clear();
    this._providers.clear();
    super.dispose();
  }
};
ChatDebugServiceImpl.MAX_EVENTS_PER_SESSION = 1e4;
ChatDebugServiceImpl.MAX_SESSIONS = 5;
/** Priority for deduplicating events with the same ID: lower = richer. */
ChatDebugServiceImpl._eventKindPriority = {
  subagentInvocation: 0,
  modelTurn: 1,
  toolCall: 2,
  agentResponse: 3,
  userMessage: 4,
  generic: 5
};
/** Session types eligible for debug logging and provider invocation. */
ChatDebugServiceImpl._debugEligibleSessionTypes = /* @__PURE__ */ new Set([
  localChatSessionType,
  // local sessions
  "copilotcli",
  // Copilot CLI background sessions
  "agent-host-copilotcli",
  // local Agent Host Copilot CLI sessions
  "claude-code"
  // Claude Code CLI sessions
]);
ChatDebugServiceImpl = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ChatDebugServiceImpl);
export {
  ChatDebugServiceImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdMb2dMZXZlbCwgSUNoYXREZWJ1Z0V2ZW50LCBJQ2hhdERlYnVnTG9nUHJvdmlkZXIsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCwgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RUYXJnZXQsIGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFnZW50RGVidWdMb2dNYXhFdmVudHNTZXR0aW5nSWQgfSBmcm9tICcuL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5cbi8qKlxuICogUGVyLXNlc3Npb24gY2lyY3VsYXIgYnVmZmVyIGZvciBkZWJ1ZyBldmVudHMuXG4gKiBTdG9yZXMgdXAgdG8gYGNhcGFjaXR5YCBldmVudHMgdXNpbmcgYSByaW5nIGJ1ZmZlci5cbiAqL1xuY2xhc3MgU2Vzc2lvbkV2ZW50QnVmZmVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYnVmZmVyOiAoSUNoYXREZWJ1Z0V2ZW50IHwgdW5kZWZpbmVkKVtdO1xuXHRwcml2YXRlIF9oZWFkID0gMDtcblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgY2FwYWNpdHk6IG51bWJlcikge1xuXHRcdHRoaXMuX2J1ZmZlciA9IG5ldyBBcnJheShjYXBhY2l0eSk7XG5cdH1cblxuXHRnZXQgc2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zaXplO1xuXHR9XG5cblx0cHVzaChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaWR4ID0gKHRoaXMuX2hlYWQgKyB0aGlzLl9zaXplKSAlIHRoaXMuY2FwYWNpdHk7XG5cdFx0dGhpcy5fYnVmZmVyW2lkeF0gPSBldmVudDtcblx0XHRpZiAodGhpcy5fc2l6ZSA8IHRoaXMuY2FwYWNpdHkpIHtcblx0XHRcdHRoaXMuX3NpemUrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faGVhZCA9ICh0aGlzLl9oZWFkICsgMSkgJSB0aGlzLmNhcGFjaXR5O1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZXR1cm4gZXZlbnRzIGluIGluc2VydGlvbiBvcmRlci4gKi9cblx0dG9BcnJheSgpOiBJQ2hhdERlYnVnRXZlbnRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc2l6ZTsgaSsrKSB7XG5cdFx0XHRjb25zdCBldmVudCA9IHRoaXMuX2J1ZmZlclsodGhpcy5faGVhZCArIGkpICUgdGhpcy5jYXBhY2l0eV07XG5cdFx0XHRpZiAoZXZlbnQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqIFJlbW92ZSBldmVudHMgbWF0Y2hpbmcgdGhlIHByZWRpY2F0ZSBhbmQgY29tcGFjdCBpbi1wbGFjZS4gKi9cblx0cmVtb3ZlV2hlcmUocHJlZGljYXRlOiAoZXZlbnQ6IElDaGF0RGVidWdFdmVudCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCB3cml0ZSA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zaXplOyBpKyspIHtcblx0XHRcdGNvbnN0IGlkeCA9ICh0aGlzLl9oZWFkICsgaSkgJSB0aGlzLmNhcGFjaXR5O1xuXHRcdFx0Y29uc3QgZXZlbnQgPSB0aGlzLl9idWZmZXJbaWR4XTtcblx0XHRcdGlmIChldmVudCAmJiBwcmVkaWNhdGUoZXZlbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdyaXRlICE9PSBpKSB7XG5cdFx0XHRcdGNvbnN0IHdyaXRlSWR4ID0gKHRoaXMuX2hlYWQgKyB3cml0ZSkgJSB0aGlzLmNhcGFjaXR5O1xuXHRcdFx0XHR0aGlzLl9idWZmZXJbd3JpdGVJZHhdID0gZXZlbnQ7XG5cdFx0XHR9XG5cdFx0XHR3cml0ZSsrO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gd3JpdGU7IGkgPCB0aGlzLl9zaXplOyBpKyspIHtcblx0XHRcdHRoaXMuX2J1ZmZlclsodGhpcy5faGVhZCArIGkpICUgdGhpcy5jYXBhY2l0eV0gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3NpemUgPSB3cml0ZTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmZlci5maWxsKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5faGVhZCA9IDA7XG5cdFx0dGhpcy5fc2l6ZSA9IDA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z1NlcnZpY2VJbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0RGVidWdTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0c3RhdGljIHJlYWRvbmx5IE1BWF9FVkVOVFNfUEVSX1NFU1NJT04gPSAxMF8wMDA7XG5cdHN0YXRpYyByZWFkb25seSBNQVhfU0VTU0lPTlMgPSA1O1xuXG5cdC8qKiBQZXItc2Vzc2lvbiBldmVudCBidWZmZXJzLiBPcmRlcmVkIGZyb20gb2xkZXN0IHRvIG5ld2VzdCBzZXNzaW9uIChMUlUpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQnVmZmVycyA9IG5ldyBSZXNvdXJjZU1hcDxTZXNzaW9uRXZlbnRCdWZmZXI+KCk7XG5cdC8qKiBPcmRlcmVkIGxpc3Qgb2Ygc2Vzc2lvbiBVUklzIGZvciBMUlUgZXZpY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25PcmRlcjogVVJJW10gPSBbXTtcblx0LyoqIFBlci1zZXNzaW9uIHRyYWNraW5nIG9mIHNlZW4gZXZlbnQgSURzIHRvIGRlZHVwbGljYXRlIGV2ZW50c1xuXHQgKiAgdGhhdCBzaGFyZSB0aGUgc2FtZSBJRCAoZS5nLiBzdWJhZ2VudEludm9jYXRpb24gKyB1c2VyTWVzc2FnZVxuXHQgKiAgZW1pdHRlZCBmcm9tIHRoZSBzYW1lIHNwYW4pLiBTdG9yZXMgaWQgXHUyMTkyIGV2ZW50IGtpbmQgc28gd2UgY2FuXG5cdCAqICBrZWVwIHRoZSByaWNoZXIgZXZlbnQga2luZCBvbiBjb2xsaXNpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlZW5FdmVudElkcyA9IG5ldyBSZXNvdXJjZU1hcDxNYXA8c3RyaW5nLCBJQ2hhdERlYnVnRXZlbnRbJ2tpbmQnXT4+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRFdmVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0RGVidWdFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkRXZlbnQ6IEV2ZW50PElDaGF0RGVidWdFdmVudD4gPSB0aGlzLl9vbkRpZEFkZEV2ZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xlYXJQcm92aWRlckV2ZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xlYXJQcm92aWRlckV2ZW50czogRXZlbnQ8VVJJPiA9IHRoaXMuX29uRGlkQ2xlYXJQcm92aWRlckV2ZW50cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVUkk+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVuZFNlc3Npb246IEV2ZW50PFVSST4gPSB0aGlzLl9vbkRpZEVuZFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmxlU2Vzc2lvblJlc291cmNlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IFNldDxJQ2hhdERlYnVnTG9nUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ludm9jYXRpb25DdHMgPSBuZXcgUmVzb3VyY2VNYXA8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cblx0LyoqXG5cdCAqIFNlc3Npb25zIHdob3NlIHByb3ZpZGVyIGV2ZW50cyBzaG91bGQgYmUgY2xlYXJlZCBiZWZvcmUgdGhlIG5leHQgYmF0Y2ggb2Zcblx0ICogcHJvdmlkZXIgZXZlbnRzIGlzIGFwcGxpZWQuIFRoZSBjbGVhciBpcyBkZWZlcnJlZCB1bnRpbCB0aGUgZmlyc3QgbmV3XG5cdCAqIHByb3ZpZGVyIGV2ZW50IGFjdHVhbGx5IGFycml2ZXMgc28gdGhhdCBhIHByb3ZpZGVyIHdoaWNoIHRyYW5zaWVudGx5XG5cdCAqIHJldHVybnMgbm90aGluZyAoZS5nLiBhbiBBZ2VudCBIb3N0IGBldmVudHMuanNvbmxgIG1pZC1yZXdyaXRlKSBkb2VzIG5vdFxuXHQgKiB3aXBlIHRoZSBldmVudHMgY3VycmVudGx5IHNob3duLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Byb3ZpZGVyQ2xlYXIgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHQvKiogRXZlbnRzIHRoYXQgd2VyZSByZXR1cm5lZCBieSBwcm92aWRlcnMgKG5vdCBpbnRlcm5hbGx5IGxvZ2dlZCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyRXZlbnRzID0gbmV3IFdlYWtTZXQ8SUNoYXREZWJ1Z0V2ZW50PigpO1xuXG5cdC8qKiBTZXNzaW9uIFVSSXMgY3JlYXRlZCB2aWEgaW1wb3J0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbXBvcnRlZFNlc3Npb25zID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cblx0LyoqIFNlc3Npb24gVVJJcyByZXBvcnRlZCBieSBwcm92aWRlcnMgYXMgYXZhaWxhYmxlIG9uIGRpc2sgKGhpc3RvcmljYWwgc2Vzc2lvbnMpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKiogVGl0bGVzIGZvciBoaXN0b3JpY2FsIHNlc3Npb25zIGRpc2NvdmVyZWQgZnJvbSBkaXNrLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3JpY2FsU2Vzc2lvblRpdGxlcyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cblx0LyoqIEh1bWFuLXJlYWRhYmxlIHRpdGxlcyBmb3IgaW1wb3J0ZWQgc2Vzc2lvbnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ltcG9ydGVkU2Vzc2lvblRpdGxlcyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cblx0YWN0aXZlU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqIFByaW9yaXR5IGZvciBkZWR1cGxpY2F0aW5nIGV2ZW50cyB3aXRoIHRoZSBzYW1lIElEOiBsb3dlciA9IHJpY2hlci4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2V2ZW50S2luZFByaW9yaXR5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge1xuXHRcdHN1YmFnZW50SW52b2NhdGlvbjogMCxcblx0XHRtb2RlbFR1cm46IDEsXG5cdFx0dG9vbENhbGw6IDIsXG5cdFx0YWdlbnRSZXNwb25zZTogMyxcblx0XHR1c2VyTWVzc2FnZTogNCxcblx0XHRnZW5lcmljOiA1LFxuXHR9O1xuXG5cdC8qKiBTZXNzaW9uIHR5cGVzIGVsaWdpYmxlIGZvciBkZWJ1ZyBsb2dnaW5nIGFuZCBwcm92aWRlciBpbnZvY2F0aW9uLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZGVidWdFbGlnaWJsZVNlc3Npb25UeXBlcyA9IG5ldyBTZXQoW1xuXHRcdGxvY2FsQ2hhdFNlc3Npb25UeXBlLFx0XHRcdC8vIGxvY2FsIHNlc3Npb25zXG5cdFx0J2NvcGlsb3RjbGknLFx0XHRcdFx0Ly8gQ29waWxvdCBDTEkgYmFja2dyb3VuZCBzZXNzaW9uc1xuXHRcdCdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLFx0XHQvLyBsb2NhbCBBZ2VudCBIb3N0IENvcGlsb3QgQ0xJIHNlc3Npb25zXG5cdFx0J2NsYXVkZS1jb2RlJyxcdFx0XHRcdC8vIENsYXVkZSBDb2RlIENMSSBzZXNzaW9uc1xuXHRdKTtcblxuXHRwcml2YXRlIF9pc0RlYnVnRWxpZ2libGVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gQ2hhdERlYnVnU2VydmljZUltcGwuX2RlYnVnRWxpZ2libGVTZXNzaW9uVHlwZXMuaGFzKHNlc3Npb25UeXBlKVxuXHRcdFx0Ly8gUmVtb3RlIEFnZW50IEhvc3QgQ29waWxvdCBDTEkgc2Vzc2lvbnMgdXNlIGEgZHluYW1pY1xuXHRcdFx0Ly8gYHJlbW90ZS08YXV0aG9yaXR5Pi1jb3BpbG90Y2xpYCBzY2hlbWU7IHNlZSBjb3BpbG90Q2xpRXZlbnRzVXJpLnRzLlxuXHRcdFx0fHwgKHNlc3Npb25UeXBlLnN0YXJ0c1dpdGgoJ3JlbW90ZS0nKSAmJiBzZXNzaW9uVHlwZS5lbmRzV2l0aCgnLWNvcGlsb3RjbGknKSlcblx0XHRcdHx8IHRoaXMuX2ltcG9ydGVkU2Vzc2lvbnMuaGFzKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGluLW1lbW9yeSBldmVudCBjYXBhY2l0eSBmb3IgYSBzZXNzaW9uLiBBZ2VudCBob3N0IChDb3BpbG90IENMSSlcblx0ICogc2Vzc2lvbnMgaG9ub3IgYSBkZWRpY2F0ZWQsIGNvbmZpZ3VyYWJsZSBjYXAgc28gdGhlaXIgKHBvdGVudGlhbGx5IGxhcmdlKVxuXHQgKiBvbi1kaXNrIGxvZ3MgY2FuIGJlIHN1cmZhY2VkIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGxvY2FsLXNlc3Npb24gZGVmYXVsdDtcblx0ICogYWxsIG90aGVyIHNlc3Npb25zIHVzZSB7QGxpbmsgQ2hhdERlYnVnU2VydmljZUltcGwuTUFYX0VWRU5UU19QRVJfU0VTU0lPTn0uXG5cdCAqL1xuXHRwcml2YXRlIF9jYXBhY2l0eUZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBudW1iZXIge1xuXHRcdGlmICghaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERlYnVnU2VydmljZUltcGwuTUFYX0VWRU5UU19QRVJfU0VTU0lPTjtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ01heEV2ZW50c1NldHRpbmdJZCk7XG5cdFx0aWYgKHR5cGVvZiBjb25maWd1cmVkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoY29uZmlndXJlZCkgJiYgY29uZmlndXJlZCA+PSAxKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5mbG9vcihjb25maWd1cmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIENoYXREZWJ1Z1NlcnZpY2VJbXBsLk1BWF9FVkVOVFNfUEVSX1NFU1NJT047XG5cdH1cblxuXHRsb2coc2Vzc2lvblJlc291cmNlOiBVUkksIG5hbWU6IHN0cmluZywgZGV0YWlscz86IHN0cmluZywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsID0gQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbywgb3B0aW9ucz86IHsgaWQ/OiBzdHJpbmc7IGNhdGVnb3J5Pzogc3RyaW5nOyBwYXJlbnRFdmVudElkPzogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGVidWdFbGlnaWJsZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFkZEV2ZW50KHtcblx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdGlkOiBvcHRpb25zPy5pZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRuYW1lLFxuXHRcdFx0ZGV0YWlscyxcblx0XHRcdGxldmVsLFxuXHRcdFx0Y2F0ZWdvcnk6IG9wdGlvbnM/LmNhdGVnb3J5LFxuXHRcdFx0cGFyZW50RXZlbnRJZDogb3B0aW9ucz8ucGFyZW50RXZlbnRJZCxcblx0XHR9KTtcblx0fVxuXG5cdGFkZEV2ZW50KGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZlIHRoZSBzZXNzaW9uJ3MgYnVmZmVyIChpZiBhbnkpIG9uY2UsIGFuZCBpdHMgY2FwYWNpdHkuIE5ld1xuXHRcdC8vIGV2ZW50cyBkdXJpbmcgc3RyZWFtaW5nIHRhcmdldCBhbiBleGlzdGluZyBidWZmZXIsIHNvIHdlIHJldXNlIGl0c1xuXHRcdC8vIGNhcGFjaXR5IGFuZCBhdm9pZCByZS1yZWFkaW5nIGNvbmZpZ3VyYXRpb24gb24gdGhlIGhvdCBwYXRoLlxuXHRcdGxldCBidWZmZXIgPSB0aGlzLl9zZXNzaW9uQnVmZmVycy5nZXQoZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBjYXBhY2l0eSA9IGJ1ZmZlcj8uY2FwYWNpdHkgPz8gdGhpcy5fY2FwYWNpdHlGb3JTZXNzaW9uKGV2ZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHQvLyBEZWR1cGxpY2F0ZSBldmVudHMgdGhhdCBzaGFyZSB0aGUgc2FtZSBJRC4gVGhlIGV4dGVuc2lvbiBtYXkgZW1pdFxuXHRcdC8vIGJvdGggYSBzdWJhZ2VudEludm9jYXRpb24gYW5kIGEgdXNlck1lc3NhZ2UgZnJvbSB0aGUgc2FtZSBzcGFuO1xuXHRcdC8vIGtlZXAgdGhlIHJpY2hlciBraW5kIGFuZCBkaXNjYXJkIHRoZSBkdXBsaWNhdGUuXG5cdFx0aWYgKGV2ZW50LmlkKSB7XG5cdFx0XHRsZXQgc2VlbiA9IHRoaXMuX3NlZW5FdmVudElkcy5nZXQoZXZlbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghc2Vlbikge1xuXHRcdFx0XHRzZWVuID0gbmV3IE1hcCgpO1xuXHRcdFx0XHR0aGlzLl9zZWVuRXZlbnRJZHMuc2V0KGV2ZW50LnNlc3Npb25SZXNvdXJjZSwgc2Vlbik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZ0tpbmQgPSBzZWVuLmdldChldmVudC5pZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmdLaW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgcHJpb3JpdHkgPSBDaGF0RGVidWdTZXJ2aWNlSW1wbC5fZXZlbnRLaW5kUHJpb3JpdHk7XG5cdFx0XHRcdGlmICgocHJpb3JpdHlbZXZlbnQua2luZF0gPz8gNSkgPj0gKHByaW9yaXR5W2V4aXN0aW5nS2luZF0gPz8gNSkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGV4aXN0aW5nIGlzIHJpY2hlciBvciBlcXVhbDsgc2tpcCB0aGlzIGV2ZW50XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTmV3IGV2ZW50IGlzIHJpY2hlciBcdTIwMTQgd2UgY2FuJ3QgcmVtb3ZlIHRoZSBvbGQgb25lIGZyb21cblx0XHRcdFx0Ly8gdGhlIHJpbmcgYnVmZmVyLCBidXQgdGhlIGR1cGxpY2F0ZSB3aWxsIGJlIGZpbHRlcmVkIG91dFxuXHRcdFx0XHQvLyBpbiBnZXRFdmVudHMoKS4gVXBkYXRlIHRoZSB0cmFja2VkIGtpbmQuXG5cdFx0XHR9XG5cdFx0XHRzZWVuLnNldChldmVudC5pZCwgZXZlbnQua2luZCk7XG5cdFx0XHQvLyBDYXAgdGhlIGRlZHVwIG1hcCB0byBwcmV2ZW50IHVuYm91bmRlZCBncm93dGggaW4gbG9uZyBzZXNzaW9ucy5cblx0XHRcdGlmIChzZWVuLnNpemUgPiBjYXBhY2l0eSkge1xuXHRcdFx0XHQvLyBEZWxldGUgdGhlIG9sZGVzdCBlbnRyeSAoZmlyc3Qga2V5IGluIGluc2VydGlvbiBvcmRlcikuXG5cdFx0XHRcdGNvbnN0IGZpcnN0S2V5ID0gc2Vlbi5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHRpZiAoZmlyc3RLZXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHNlZW4uZGVsZXRlKGZpcnN0S2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghYnVmZmVyKSB7XG5cdFx0XHQvLyBFdmljdCBsZWFzdC1yZWNlbnRseS11c2VkIHNlc3Npb24gaWYgd2UgYXJlIGF0IHRoZSBzZXNzaW9uIGNhcC5cblx0XHRcdGlmICh0aGlzLl9zZXNzaW9uT3JkZXIubGVuZ3RoID49IENoYXREZWJ1Z1NlcnZpY2VJbXBsLk1BWF9TRVNTSU9OUykge1xuXHRcdFx0XHRjb25zdCBldmljdGVkID0gdGhpcy5fc2Vzc2lvbk9yZGVyLnNoaWZ0KCkhO1xuXHRcdFx0XHR0aGlzLl9ldmljdFNlc3Npb24oZXZpY3RlZCk7XG5cdFx0XHR9XG5cdFx0XHRidWZmZXIgPSBuZXcgU2Vzc2lvbkV2ZW50QnVmZmVyKGNhcGFjaXR5KTtcblx0XHRcdHRoaXMuX3Nlc3Npb25CdWZmZXJzLnNldChldmVudC5zZXNzaW9uUmVzb3VyY2UsIGJ1ZmZlcik7XG5cdFx0XHR0aGlzLl9zZXNzaW9uT3JkZXIucHVzaChldmVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBNb3ZlIHRvIGVuZCBvZiBMUlUgb3JkZXIgc28gYWN0aXZlbHktdXNlZCBzZXNzaW9ucyBhcmUgbm90IGV2aWN0ZWQuXG5cdFx0XHQvLyBGYXN0LXBhdGg6IGR1cmluZyBzdHJlYW1pbmcvYmFja2ZpbGwgYWxsIGV2ZW50cyB0YXJnZXQgdGhlIHNhbWVcblx0XHRcdC8vIHNlc3Npb24gd2hpY2ggaXMgYWxyZWFkeSBhdCB0aGUgdGFpbCBcdTIwMTQgc2tpcCB0aGUgbGluZWFyIHNjYW4uXG5cdFx0XHRjb25zdCBsYXN0ID0gdGhpcy5fc2Vzc2lvbk9yZGVyLmxlbmd0aCAtIDE7XG5cdFx0XHRpZiAobGFzdCA8IDAgfHwgIWV4dFVyaS5pc0VxdWFsKHRoaXMuX3Nlc3Npb25PcmRlcltsYXN0XSwgZXZlbnQuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLl9zZXNzaW9uT3JkZXIuZmluZEluZGV4KHUgPT4gZXh0VXJpLmlzRXF1YWwodSwgZXZlbnQuc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChpZHggIT09IC0xICYmIGlkeCAhPT0gbGFzdCkge1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25PcmRlci5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uT3JkZXIucHVzaChldmVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGJ1ZmZlci5wdXNoKGV2ZW50KTtcblx0XHR0aGlzLl9vbkRpZEFkZEV2ZW50LmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0YWRkUHJvdmlkZXJFdmVudChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogdm9pZCB7XG5cdFx0Ly8gSWYgYSByZS1pbnZvY2F0aW9uIGlzIHBlbmRpbmcgZm9yIHRoaXMgc2Vzc2lvbiwgY2xlYXIgdGhlIHByZXZpb3VzbHlcblx0XHQvLyBsb2FkZWQgcHJvdmlkZXIgZXZlbnRzIG5vdyB0aGF0IGZyZXNoIGRhdGEgaGFzIGFjdHVhbGx5IGFycml2ZWQuIFRoaXNcblx0XHQvLyBpcyBkZWZlcnJlZCAocmF0aGVyIHRoYW4gZG9uZSB1cCBmcm9udCBpbiBpbnZva2VQcm92aWRlcnMpIHNvIHRoYXQgYVxuXHRcdC8vIHByb3ZpZGVyIHdoaWNoIHJldHVybnMgbm90aGluZyB0aGlzIGN5Y2xlIGtlZXBzIHRoZSBjdXJyZW50IGV2ZW50cy5cblx0XHRpZiAodGhpcy5fcGVuZGluZ1Byb3ZpZGVyQ2xlYXIuaGFzKGV2ZW50LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdQcm92aWRlckNsZWFyLmRlbGV0ZShldmVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fY2xlYXJQcm92aWRlckV2ZW50cyhldmVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aWRlckV2ZW50cy5hZGQoZXZlbnQpO1xuXHRcdHRoaXMuYWRkRXZlbnQoZXZlbnQpO1xuXHR9XG5cblx0Z2V0RXZlbnRzKHNlc3Npb25SZXNvdXJjZT86IFVSSSk6IHJlYWRvbmx5IElDaGF0RGVidWdFdmVudFtdIHtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9zZXNzaW9uQnVmZmVycy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghYnVmZmVyKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGxldCByZXN1bHQgPSBidWZmZXIudG9BcnJheSgpO1xuXHRcdFx0Ly8gU29ydCBvbmx5IHdoZW4gdGhlIGJ1ZmZlciBpcyBub3QgaW4gY2hyb25vbG9naWNhbCBvcmRlcixcblx0XHRcdC8vIHdoaWNoIGNhbiBoYXBwZW4gd2hlbiBldmVudHMgYXJyaXZlIG91dCBvZiBvcmRlciAoZS5nLlxuXHRcdFx0Ly8gdGFpbC1maXJzdCBiYWNrZmlsbCkuIFdoZW4gZXZlbnRzIGFycml2ZSBpblxuXHRcdFx0Ly8gb3JkZXIgKHRoZSBjb21tb24gY2FzZSkgdGhlIGNoZWNrIGlzIE8obikgd2l0aCBubyBzb3J0LlxuXHRcdFx0aWYgKCF0aGlzLl9pc1NvcnRlZChyZXN1bHQpKSB7XG5cdFx0XHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhLmNyZWF0ZWQuZ2V0VGltZSgpIC0gYi5jcmVhdGVkLmdldFRpbWUoKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBEZWR1cGxpY2F0ZTogd2hlbiBtdWx0aXBsZSBldmVudHMgc2hhcmUgdGhlIHNhbWUgSUQgKGUuZy5cblx0XHRcdC8vIHN1YmFnZW50SW52b2NhdGlvbiArIHVzZXJNZXNzYWdlIGZyb20gdGhlIHNhbWUgc3BhbiksIGtlZXBcblx0XHRcdC8vIHRoZSBvbmUgd2l0aCB0aGUgcmljaGVzdCBraW5kLlxuXHRcdFx0cmVzdWx0ID0gdGhpcy5fZGVkdXBsaWNhdGVFdmVudHMocmVzdWx0KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ3Jvc3Mtc2Vzc2lvbiBxdWVyeTogbWVyZ2UgYWxsIGJ1ZmZlcnMgYW5kIHNvcnQgdG8gaW50ZXJsZWF2ZS5cblx0XHRjb25zdCByZXN1bHQ6IElDaGF0RGVidWdFdmVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBidWZmZXIgb2YgdGhpcy5fc2Vzc2lvbkJ1ZmZlcnMudmFsdWVzKCkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmJ1ZmZlci50b0FycmF5KCkpO1xuXHRcdH1cblx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gYS5jcmVhdGVkLmdldFRpbWUoKSAtIGIuY3JlYXRlZC5nZXRUaW1lKCkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NvcnRlZChldmVudHM6IElDaGF0RGVidWdFdmVudFtdKTogYm9vbGVhbiB7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChldmVudHNbaV0uY3JlYXRlZC5nZXRUaW1lKCkgPCBldmVudHNbaSAtIDFdLmNyZWF0ZWQuZ2V0VGltZSgpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9kZWR1cGxpY2F0ZUV2ZW50cyhldmVudHM6IElDaGF0RGVidWdFdmVudFtdKTogSUNoYXREZWJ1Z0V2ZW50W10ge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpOyAvLyBpZCBcdTIxOTIgaW5kZXggaW4gcmVzdWx0XG5cdFx0Y29uc3QgcHJpb3JpdHkgPSBDaGF0RGVidWdTZXJ2aWNlSW1wbC5fZXZlbnRLaW5kUHJpb3JpdHk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgZXZlbnRzKSB7XG5cdFx0XHRpZiAoIWV2ZW50LmlkKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGV2ZW50KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZ0lkeCA9IHNlZW4uZ2V0KGV2ZW50LmlkKTtcblx0XHRcdGlmIChleGlzdGluZ0lkeCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNlZW4uc2V0KGV2ZW50LmlkLCByZXN1bHQubGVuZ3RoKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goZXZlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHRbZXhpc3RpbmdJZHhdO1xuXHRcdFx0XHRpZiAoKHByaW9yaXR5W2V2ZW50LmtpbmRdID8/IDUpIDwgKHByaW9yaXR5W2V4aXN0aW5nLmtpbmRdID8/IDUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2V4aXN0aW5nSWR4XSA9IGV2ZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uUmVzb3VyY2VzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25PcmRlcl07XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uQnVmZmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX3Nlc3Npb25PcmRlci5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3NlZW5FdmVudElkcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ltcG9ydGVkU2Vzc2lvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9pbXBvcnRlZFNlc3Npb25UaXRsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fYXZhaWxhYmxlU2Vzc2lvblJlc291cmNlU2V0LmNsZWFyKCk7XG5cdFx0dGhpcy5faGlzdG9yaWNhbFNlc3Npb25UaXRsZXMuY2xlYXIoKTtcblx0fVxuXG5cdC8qKiBSZW1vdmUgYWxsIGFuY2lsbGFyeSBzdGF0ZSBmb3IgYW4gZXZpY3RlZCBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIF9ldmljdFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uQnVmZmVycy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9zZWVuRXZlbnRJZHMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5faW1wb3J0ZWRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9pbXBvcnRlZFNlc3Npb25UaXRsZXMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5faW52b2NhdGlvbkN0cy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoY3RzKSB7XG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faW52b2NhdGlvbkN0cy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fcHJvdmlkZXJzLmFkZChwcm92aWRlcik7XG5cblx0XHQvLyBJbnZva2UgdGhlIG5ldyBwcm92aWRlciBmb3IgYWxsIHNlc3Npb25zIHRoYXQgYWxyZWFkeSBoYXZlIGFjdGl2ZVxuXHRcdC8vIHBpcGVsaW5lcy4gVGhpcyBoYW5kbGVzIHRoZSBjYXNlIHdoZXJlIGludm9rZVByb3ZpZGVycygpIHdhcyBjYWxsZWRcblx0XHQvLyBiZWZvcmUgdGhpcyBwcm92aWRlciB3YXMgcmVnaXN0ZXJlZCAoZS5nLiBleHRlbnNpb24gYWN0aXZhdGVkIGxhdGUpLlxuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25SZXNvdXJjZSwgY3RzXSBvZiB0aGlzLl9pbnZvY2F0aW9uQ3RzKSB7XG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9pbnZva2VQcm92aWRlcihwcm92aWRlciwgc2Vzc2lvblJlc291cmNlLCBjdHMudG9rZW4pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0aGFzSW52b2tlZFByb3ZpZGVycyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnZvY2F0aW9uQ3RzLmhhcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlUHJvdmlkZXJzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoIXRoaXMuX2lzRGVidWdFbGlnaWJsZVNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBDYW5jZWwgb25seSB0aGUgcHJldmlvdXMgaW52b2NhdGlvbiBmb3IgVEhJUyBzZXNzaW9uLCBub3Qgb3RoZXJzLlxuXHRcdC8vIEVhY2ggc2Vzc2lvbiBoYXMgaXRzIG93biBwaXBlbGluZSBzbyBldmVudHMgZnJvbSBtdWx0aXBsZSBzZXNzaW9uc1xuXHRcdC8vIGNhbiBiZSBzdHJlYW1lZCBjb25jdXJyZW50bHkuXG5cdFx0Y29uc3QgZXhpc3RpbmdDdHMgPSB0aGlzLl9pbnZvY2F0aW9uQ3RzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZ0N0cykge1xuXHRcdFx0ZXhpc3RpbmdDdHMuY2FuY2VsKCk7XG5cdFx0XHRleGlzdGluZ0N0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBwcm92aWRlciBldmVudHMgZm9yIHRoaXMgc2Vzc2lvbiB0byBiZSBjbGVhcmVkIGJlZm9yZSB0aGUgbmV4dFxuXHRcdC8vIGJhdGNoIGlzIGFwcGxpZWQuIFRoZSBjbGVhciBpcyBkZWZlcnJlZCB0byBhZGRQcm92aWRlckV2ZW50IHNvIHRoYXQgYVxuXHRcdC8vIHByb3ZpZGVyIHJldHVybmluZyBub3RoaW5nIHRoaXMgY3ljbGUgcHJlc2VydmVzIHRoZSBjdXJyZW50IGV2ZW50cztcblx0XHQvLyBzZWUgX3BlbmRpbmdQcm92aWRlckNsZWFyLlxuXHRcdHRoaXMuX3BlbmRpbmdQcm92aWRlckNsZWFyLnNldChzZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5faW52b2NhdGlvbkN0cy5zZXQoc2Vzc2lvblJlc291cmNlLCBjdHMpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb21pc2VzID0gWy4uLnRoaXMuX3Byb3ZpZGVyc10ubWFwKHByb3ZpZGVyID0+XG5cdFx0XHRcdHRoaXMuX2ludm9rZVByb3ZpZGVyKHByb3ZpZGVyLCBzZXNzaW9uUmVzb3VyY2UsIGN0cy50b2tlbilcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQocHJvbWlzZXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9XG5cdFx0Ly8gTm90ZTogZG8gTk9UIGRpc3Bvc2UgdGhlIENUUyBoZXJlIC0gdGhlIHRva2VuIGlzIHVzZWQgYnkgdGhlXG5cdFx0Ly8gZXh0ZW5zaW9uLXNpZGUgcHJvZ3Jlc3MgcGlwZWxpbmUgd2hpY2ggc3RheXMgYWxpdmUgZm9yIHN0cmVhbWluZy5cblx0XHQvLyBJdCB3aWxsIGJlIGNhbmNlbGxlZCtkaXNwb3NlZCB3aGVuIHJlLWludm9raW5nIHRoZSBzYW1lIHNlc3Npb25cblx0XHQvLyBvciB3aGVuIHRoZSBzZXJ2aWNlIGlzIGRpc3Bvc2VkLlxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW52b2tlUHJvdmlkZXIocHJvdmlkZXI6IElDaGF0RGVidWdMb2dQcm92aWRlciwgc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBldmVudHMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdERlYnVnTG9nKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdFx0aWYgKGV2ZW50cykge1xuXHRcdFx0XHQvLyBZaWVsZCB0byB0aGUgZXZlbnQgbG9vcCBwZXJpb2RpY2FsbHkgc28gdGhlIFVJIHN0YXlzXG5cdFx0XHRcdC8vIHJlc3BvbnNpdmUgd2hlbiBhIHByb3ZpZGVyIHJldHVybnMgYSBsYXJnZSBiYXRjaCBvZiBldmVudHNcblx0XHRcdFx0Ly8gKGUuZy4gaW1wb3J0aW5nIGEgbXVsdGktTUIgbG9nIGZpbGUpLlxuXHRcdFx0XHRjb25zdCBCQVRDSF9TSVpFID0gNTAwO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuYWRkUHJvdmlkZXJFdmVudCh7XG5cdFx0XHRcdFx0XHQuLi5ldmVudHNbaV0sXG5cdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGV2ZW50c1tpXS5zZXNzaW9uUmVzb3VyY2UgPz8gc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChpID4gMCAmJiBpICUgQkFUQ0hfU0laRSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0ZW5kU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX2ludm9jYXRpb25DdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGN0cykge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2ludm9jYXRpb25DdHMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkRW5kU2Vzc2lvbi5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhclByb3ZpZGVyRXZlbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fc2Vzc2lvbkJ1ZmZlcnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGJ1ZmZlcikge1xuXHRcdFx0Ly8gUHJvdmlkZXIgZXZlbnRzIGFyZSB0eXBpY2FsbHkgdGhlIHZhc3QgbWFqb3JpdHkgKDkwJSspLlxuXHRcdFx0Ly8gSW5zdGVhZCBvZiBpdGVyYXRpbmcgdG8gcmVtb3ZlIHRoZW0sIGV4dHJhY3QgdGhlIGZldyBjb3JlXG5cdFx0XHQvLyBldmVudHMsIGNsZWFyIHRoZSBidWZmZXIsIGFuZCByZS1hZGQgdGhlbS5cblx0XHRcdGNvbnN0IGNvcmVFdmVudHMgPSBidWZmZXIudG9BcnJheSgpLmZpbHRlcihlID0+ICF0aGlzLl9wcm92aWRlckV2ZW50cy5oYXMoZSkpO1xuXHRcdFx0YnVmZmVyLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGUgb2YgY29yZUV2ZW50cykge1xuXHRcdFx0XHRidWZmZXIucHVzaChlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gUmVzZXQgZGVkdXAgdHJhY2tpbmcgc28gcmUtaW52b2tlZCBwcm92aWRlciBldmVudHMgYXJlIGFjY2VwdGVkXG5cdFx0dGhpcy5fc2VlbkV2ZW50SWRzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX29uRGlkQ2xlYXJQcm92aWRlckV2ZW50cy5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlRXZlbnQoZXZlbnRJZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyLnJlc29sdmVDaGF0RGVidWdMb2dFdmVudCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcHJvdmlkZXIucmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50KGV2ZW50SWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpc0NvcmVFdmVudChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9wcm92aWRlckV2ZW50cy5oYXMoZXZlbnQpO1xuXHR9XG5cblx0c2V0SW1wb3J0ZWRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlOiBVUkksIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbXBvcnRlZFNlc3Npb25UaXRsZXMuc2V0KHNlc3Npb25SZXNvdXJjZSwgdGl0bGUpO1xuXHR9XG5cblx0Z2V0SW1wb3J0ZWRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbXBvcnRlZFNlc3Npb25UaXRsZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhZGRBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzKHJlc291cmNlczogcmVhZG9ubHkgeyB1cmk6IFVSSTsgdGl0bGU/OiBzdHJpbmcgfVtdKTogdm9pZCB7XG5cdFx0bGV0IGFkZGVkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCB7IHVyaSwgdGl0bGUgfSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdGNvbnN0IGtleSA9IHVyaS50b1N0cmluZygpO1xuXHRcdFx0aWYgKCF0aGlzLl9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VTZXQuaGFzKGtleSkpIHtcblx0XHRcdFx0dGhpcy5fYXZhaWxhYmxlU2Vzc2lvblJlc291cmNlU2V0LmFkZChrZXkpO1xuXHRcdFx0XHR0aGlzLl9hdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzLnB1c2godXJpKTtcblx0XHRcdFx0YWRkZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHRcdHRoaXMuX2hpc3RvcmljYWxTZXNzaW9uVGl0bGVzLnNldCh1cmksIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFkZGVkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBMYXp5IGZldGNoZXJzIGZvciBhdmFpbGFibGUgc2Vzc2lvbnMgZnJvbSBwcm92aWRlcnMuIEVhY2ggaXMgaW52b2tlZCBhdCBtb3N0IG9uY2UuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F2YWlsYWJsZVNlc3Npb25zRmV0Y2hlcnMgPSBuZXcgU2V0PHsgcmVhZG9ubHkgZmV0Y2hlcjogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTx7IHVyaTogVVJJOyB0aXRsZT86IHN0cmluZyB9W10+OyBzdGFydGVkOiBib29sZWFuIH0+KCk7XG5cdHByaXZhdGUgX2F2YWlsYWJsZVNlc3Npb25zUmVxdWVzdGVkID0gZmFsc2U7XG5cblx0Z2V0QXZhaWxhYmxlU2Vzc2lvblJlc291cmNlcygpOiByZWFkb25seSBVUklbXSB7XG5cdFx0Ly8gVHJpZ2dlciBsYXp5IGZldGNoIHdoZW4gYm90aCBhIGZldGNoZXIgaXMgcmVnaXN0ZXJlZCBhbmQgdGhpcyBnZXR0ZXIgaXMgY2FsbGVkLlxuXHRcdHRoaXMuX2F2YWlsYWJsZVNlc3Npb25zUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHR0aGlzLl90cnlGZXRjaEF2YWlsYWJsZVNlc3Npb25zKCk7XG5cblx0XHRjb25zdCBrbm93biA9IG5ldyBTZXQodGhpcy5fc2Vzc2lvbk9yZGVyLm1hcCh1ID0+IHUudG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IFsuLi50aGlzLl9zZXNzaW9uT3JkZXJdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRoaXMuX2F2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdGlmICgha25vd24uaGFzKHVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRrbm93bi5hZGQodXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cmVnaXN0ZXJBdmFpbGFibGVTZXNzaW9uc0ZldGNoZXIoZmV0Y2hlcjogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTx7IHVyaTogVVJJOyB0aXRsZT86IHN0cmluZyB9W10+KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGVudHJ5ID0geyBmZXRjaGVyLCBzdGFydGVkOiBmYWxzZSB9O1xuXHRcdHRoaXMuX2F2YWlsYWJsZVNlc3Npb25zRmV0Y2hlcnMuYWRkKGVudHJ5KTtcblx0XHQvLyBJZiB0aGUgVUkgYWxyZWFkeSByZXF1ZXN0ZWQgc2Vzc2lvbnMgYmVmb3JlIHRoZSBmZXRjaGVyIHdhcyByZWdpc3RlcmVkLCBmZXRjaCBub3cuXG5cdFx0dGhpcy5fdHJ5RmV0Y2hBdmFpbGFibGVTZXNzaW9ucygpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fYXZhaWxhYmxlU2Vzc2lvbnNGZXRjaGVycy5kZWxldGUoZW50cnkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyeUZldGNoQXZhaWxhYmxlU2Vzc2lvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hdmFpbGFibGVTZXNzaW9uc1JlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2F2YWlsYWJsZVNlc3Npb25zRmV0Y2hlcnMpIHtcblx0XHRcdGlmIChlbnRyeS5zdGFydGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0ZW50cnkuc3RhcnRlZCA9IHRydWU7XG5cdFx0XHQvLyBGaXJlLWFuZC1mb3JnZXQ6IGRvbid0IGJsb2NrIHRoZSBjYWxsZXIuXG5cdFx0XHRlbnRyeS5mZXRjaGVyKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oZW50cmllcyA9PiB7XG5cdFx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLmFkZEF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMoZW50cmllcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRnZXRIaXN0b3JpY2FsU2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faGlzdG9yaWNhbFNlc3Npb25UaXRsZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyBleHBvcnRMb2coc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyLnByb3ZpZGVDaGF0RGVidWdMb2dFeHBvcnQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXREZWJ1Z0xvZ0V4cG9ydChzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGlmIChkYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBkYXRhO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaW1wb3J0TG9nKGRhdGE6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIucmVzb2x2ZUNoYXREZWJ1Z0xvZ0ltcG9ydCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBwcm92aWRlci5yZXNvbHZlQ2hhdERlYnVnTG9nSW1wb3J0KGRhdGEsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uVXJpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ltcG9ydGVkU2Vzc2lvbnMuc2V0KHNlc3Npb25VcmksIHRydWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNlc3Npb25Vcmk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY3RzIG9mIHRoaXMuX2ludm9jYXRpb25DdHMudmFsdWVzKCkpIHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2ludm9jYXRpb25DdHMuY2xlYXIoKTtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWM7QUFFdkIsU0FBUyx5QkFBb0g7QUFDN0gsU0FBUyxtQkFBbUIsNEJBQTRCO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0RBQWdEO0FBTXpELE1BQU0sbUJBQW1CO0FBQUEsRUFLeEIsWUFBcUIsVUFBa0I7QUFBbEI7QUFIckIsU0FBUSxRQUFRO0FBQ2hCLFNBQVEsUUFBUTtBQUdmLFNBQUssVUFBVSxJQUFJLE1BQU0sUUFBUTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxJQUFJLE9BQWU7QUFDbEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsS0FBSyxPQUE4QjtBQUNsQyxVQUFNLE9BQU8sS0FBSyxRQUFRLEtBQUssU0FBUyxLQUFLO0FBQzdDLFNBQUssUUFBUSxHQUFHLElBQUk7QUFDcEIsUUFBSSxLQUFLLFFBQVEsS0FBSyxVQUFVO0FBQy9CLFdBQUs7QUFBQSxJQUNOLE9BQU87QUFDTixXQUFLLFNBQVMsS0FBSyxRQUFRLEtBQUssS0FBSztBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHQSxVQUE2QjtBQUM1QixVQUFNLFNBQTRCLENBQUM7QUFDbkMs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
