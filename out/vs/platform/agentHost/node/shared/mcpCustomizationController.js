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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { ActionType } from "../../common/state/protocol/common/actions.js";
import { CustomizationType, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { DEFAULT_MCP_APP, DEFAULT_MCP_APP_CAPABILITIES } from "../../common/state/protocol/mcpAppDefaults.js";
import { IAgentHostStateManager } from "../agentHostStateManager.js";
function buildMcpTopLevelCustomizationId(providerId, sessionId, serverName) {
  return `mcp-top-level:${providerId}:${sessionId}:${serverName}`;
}
function buildMcpChannel(providerId, sessionId, serverName) {
  return `mcp://${providerId}/${encodeURIComponent(sessionId)}/${encodeURIComponent(serverName)}`;
}
let McpCustomizationController = class extends Disposable {
  constructor(_options, _stateManager) {
    super();
    this._options = _options;
    this._stateManager = _stateManager;
    /** Per-server live entries, keyed by server name. */
    this._live = observableValue(this, /* @__PURE__ */ new Map());
    this.runtimeStates = derived(this, (reader) => {
      const out = /* @__PURE__ */ new Map();
      for (const entry of this._live.read(reader).values()) {
        const id = entry.topLevelId ?? this._options.resolveChildId(entry.serverName);
        if (id === void 0) {
          continue;
        }
        out.set(id, { state: entry.state, channel: this._buildChannel(entry.serverName, entry.state) });
      }
      return out;
    });
  }
  /** Snapshot for inclusion in `getSessionCustomizations()` results. */
  topLevelCustomizations() {
    const out = [];
    for (const entry of this._live.get().values()) {
      if (entry.topLevelId === void 0) {
        continue;
      }
      out.push(this._buildTopLevel(entry.topLevelId, entry.serverName, entry.state, entry.enabled));
    }
    return out;
  }
  /**
   * Names of MCP servers currently in {@link McpServerStatus.Ready},
   * paired with their channel URI. Used by providers to drive
   * polling-based notification streams (e.g. re-fetch `tools/list`
   * after a refresh hint and fire
   * `notifications/tools/list_changed` if the result changed).
   */
  readyChannels() {
    const out = [];
    for (const entry of this._live.get().values()) {
      if (entry.state.kind !== McpServerStatus.Ready) {
        continue;
      }
      const channel = this._buildChannel(entry.serverName, entry.state);
      if (channel !== void 0) {
        out.push({ serverName: entry.serverName, channel });
      }
    }
    return out;
  }
  /**
   * Returns the customization id currently associated with the MCP
   * server named `serverName`, or `undefined` when no customization
   * exists. Top-level entries return the minted top-level id; child
   * entries return whatever {@link IMcpChildIdResolver} resolves to
   * for that server. Used by providers to tag
   * {@link ToolCallMcpContributor.customizationId | tool-call contributors}
   * so clients can correlate MCP tool calls with the originating
   * server customization.
   */
  customizationIdForServer(serverName) {
    const live = this._live.get().get(serverName);
    if (live?.topLevelId !== void 0) {
      return live.topLevelId;
    }
    return this._options.resolveChildId(serverName);
  }
  /** Returns the live server name associated with a customization id. */
  serverNameForCustomizationId(id) {
    for (const entry of this._live.get().values()) {
      const entryId = entry.topLevelId ?? this._options.resolveChildId(entry.serverName);
      if (entryId === id) {
        return entry.serverName;
      }
    }
    return void 0;
  }
  /** Returns the last live state recorded for the MCP server named `serverName`. */
  stateForServer(serverName) {
    return this._live.get().get(serverName)?.state;
  }
  /** Snapshot used by providers to reconcile desired and observed enablement. */
  serverEnablement() {
    const result = [];
    for (const entry of this._live.get().values()) {
      const customizationId = entry.topLevelId ?? this._options.resolveChildId(entry.serverName);
      if (customizationId !== void 0) {
        result.push({ serverName: entry.serverName, customizationId, enabled: entry.enabled });
      }
    }
    return result;
  }
  /**
   * Returns the `mcp://` AHP channel URI currently advertised for the
   * MCP server named `serverName`, or `undefined` when the server is
   * not in {@link McpServerStatus.Ready}. Used by providers to attach
   * the channel to MCP App `_meta.ui` so clients can route App
   * sub-RPCs (tools/call, resources/read, sampling/createMessage)
   * back through {@link IAgentHostService.handleMcpRequest}.
   */
  channelForServer(serverName) {
    const live = this._live.get().get(serverName);
    if (!live || live.state.kind !== McpServerStatus.Ready) {
      return void 0;
    }
    return this._buildChannel(serverName, live.state);
  }
  /**
   * Replaces the live inventory with `servers`. Servers no longer
   * present are removed; new servers and changed servers are upserted.
   * Batched in a single transaction so {@link runtimeStates} observers
   * see one coalesced update.
   */
  applyAll(servers) {
    transaction((tx) => {
      const seen = /* @__PURE__ */ new Set();
      for (const server of servers) {
        seen.add(server.name);
        this._applyOne(server, tx);
      }
      for (const name of [...this._live.get().keys()]) {
        if (!seen.has(name)) {
          this._remove(name, tx);
        }
      }
    });
  }
  /** Upserts a single server. */
  applyOne(server) {
    transaction((tx) => this._applyOne(server, tx));
  }
  _applyOne(server, tx) {
    const previous = this._live.get().get(server.name);
    const state = this._stateForUpdate(previous?.state, server.state);
    const enabled = server.enabled ?? previous?.enabled ?? true;
    let topLevelId = previous?.topLevelId;
    if (topLevelId === void 0) {
      const childId = this._options.resolveChildId(server.name);
      if (childId !== void 0) {
        this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId: void 0 }, tx);
        this._options.emit({
          type: ActionType.SessionMcpServerStateChanged,
          id: childId,
          state,
          channel: this._buildChannel(server.name, state)
        });
        return;
      }
      topLevelId = this._mintTopLevelId(server.name);
    }
    this._setLiveEntry(server.name, { serverName: server.name, state, enabled, topLevelId }, tx);
    this._options.emit({
      type: ActionType.SessionCustomizationUpdated,
      customization: this._buildTopLevel(topLevelId, server.name, state, enabled)
    });
  }
  /**
   * Removes a server from the live inventory. For top-level entries
   * (bare servers with no plugin-derived child) emits
   * {@link ActionType.SessionCustomizationRemoved} so the entry is
   * dropped from session state, not just from the in-memory live
   * inventory.
   *
   * For child entries we emit a final {@link ActionType.SessionMcpServerStateChanged}
   * carrying {@link McpServerStatus.Stopped} so the UI sees the
   * server settle into a terminal state; the plugin layer owns the
   * actual removal of the child container.
   */
  remove(serverName) {
    transaction((tx) => this._remove(serverName, tx));
  }
  _remove(serverName, tx) {
    const entry = this._live.get().get(serverName);
    if (!entry) {
      return;
    }
    this._deleteLiveEntry(serverName, tx);
    if (entry.topLevelId !== void 0) {
      this._options.emit({
        type: ActionType.SessionCustomizationRemoved,
        id: entry.topLevelId
      });
      return;
    }
    const childId = this._options.resolveChildId(serverName);
    if (childId === void 0) {
      return;
    }
    this._options.emit({
      type: ActionType.SessionMcpServerStateChanged,
      id: childId,
      state: { kind: McpServerStatus.Stopped }
    });
  }
  // ---- internals ---------------------------------------------------------
  /** Immutable upsert into the {@link _live} observable. */
  _setLiveEntry(serverName, entry, tx) {
    const next = new Map(this._live.get());
    next.set(serverName, entry);
    this._live.set(next, tx);
  }
  /** Immutable delete from the {@link _live} observable. */
  _deleteLiveEntry(serverName, tx) {
    const current = this._live.get();
    if (!current.has(serverName)) {
      return;
    }
    const next = new Map(current);
    next.delete(serverName);
    this._live.set(next, tx);
  }
  _stateForUpdate(previous, next) {
    if (previous?.kind === McpServerStatus.AuthRequired && next.kind === McpServerStatus.Starting) {
      return previous;
    }
    return next;
  }
  _mintTopLevelId(serverName) {
    return buildMcpTopLevelCustomizationId(this._options.providerId, this._options.sessionId, serverName);
  }
  _buildChannel(serverName, state) {
    if (state.kind !== McpServerStatus.Ready) {
      return void 0;
    }
    return buildMcpChannel(this._options.providerId, this._options.sessionId, serverName);
  }
  _buildTopLevel(id, serverName, state, enabled) {
    const channel = this._buildChannel(serverName, state);
    const mcpApp = this._options.capabilities ? { capabilities: this._options.capabilities } : DEFAULT_MCP_APP;
    return {
      type: CustomizationType.McpServer,
      id,
      uri: this._mintTopLevelId(serverName),
      name: serverName,
      enabled: getEffectiveMcpServerCustomizations(this._stateManager.getSessionState(this._options.sessionUri.toString())?.customizations ?? []).find((customization) => customization.id === id)?.enabled ?? enabled,
      state,
      channel,
      mcpApp
    };
  }
};
McpCustomizationController = __decorateClass([
  __decorateParam(1, IAgentHostStateManager)
], McpCustomizationController);
function findMcpChildId(customizations, serverName) {
  return getMcpServerCustomizations(customizations).find((server) => server.name === serverName)?.id;
}
function getMcpServerCustomizations(customizations) {
  const result = [];
  for (const top of customizations) {
    if (top.type === CustomizationType.McpServer) {
      result.push(top);
    } else {
      for (const child of top.children ?? []) {
        if (child.type === CustomizationType.McpServer) {
          result.push(child);
        }
      }
    }
  }
  return result;
}
function getEffectiveMcpServerCustomizations(customizations) {
  const result = [];
  for (const top of customizations) {
    if (top.type === CustomizationType.McpServer) {
      result.push(top);
    } else {
      for (const child of top.children ?? []) {
        if (child.type === CustomizationType.McpServer) {
          result.push(top.enabled ? child : { ...child, enabled: false });
        }
      }
    }
  }
  return result;
}
function applyMcpServerEnablement(customizations, desired) {
  const desiredById = new Map(getEffectiveMcpServerCustomizations(desired).map((server) => [server.id, server.enabled]));
  return customizations.map((customization) => {
    if (customization.type === CustomizationType.McpServer) {
      return applyMcpEnablement(customization, desiredById);
    }
    let changed = false;
    const children = customization.children?.map((child) => {
      const next = child.type === CustomizationType.McpServer ? applyMcpEnablement(child, desiredById) : child;
      changed ||= next !== child;
      return next;
    });
    return changed ? { ...customization, children } : customization;
  });
}
function applyMcpEnablement(customization, desiredById) {
  const enabled = desiredById.get(customization.id);
  return enabled === void 0 || enabled === customization.enabled ? customization : { ...customization, enabled };
}
function findMcpServerName(customizations, id) {
  return getMcpServerCustomizations(customizations).find((server) => server.id === id)?.name;
}
function parseMcpChannelUri(uri) {
  const prefix = "mcp://";
  if (!uri.startsWith(prefix)) {
    return void 0;
  }
  const rest = uri.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) {
    return void 0;
  }
  const providerId = rest.slice(0, slash);
  const tail = rest.slice(slash + 1);
  const sep = tail.indexOf("/");
  if (sep <= 0 || sep === tail.length - 1) {
    return void 0;
  }
  let sessionId;
  let serverName;
  try {
    sessionId = decodeURIComponent(tail.slice(0, sep));
    serverName = decodeURIComponent(tail.slice(sep + 1));
  } catch {
    return void 0;
  }
  if (!providerId || !sessionId || !serverName) {
    return void 0;
  }
  return { providerId, sessionId, serverName };
}
export {
  DEFAULT_MCP_APP,
  DEFAULT_MCP_APP_CAPABILITIES,
  McpCustomizationController,
  applyMcpServerEnablement,
  buildMcpChannel,
  buildMcpTopLevelCustomizationId,
  findMcpChildId,
  findMcpServerName,
  getEffectiveMcpServerCustomizations,
  getMcpServerCustomizations,
  parseMcpChannelUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiwgdHlwZSBJT2JzZXJ2YWJsZSwgdHlwZSBJVHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQWhwTWNwVWlIb3N0Q2FwYWJpbGl0aWVzLCB0eXBlIENoaWxkQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01DUF9BUFAsIERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbWNwQXBwRGVmYXVsdHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5cbi8qKlxuICogU0RLLW5ldXRyYWwgZGVzY3JpcHRpb24gb2YgYSBzaW5nbGUgTUNQIHNlcnZlciwgYXMgdGhlIGNvbnRyb2xsZXInc1xuICogY2FsbGVyIHNlZXMgaXQuIEVhY2ggcHJvdmlkZXIgYWRhcHRzIGl0cyBvd24gU0RLIGV2ZW50cyBpbnRvIHRoaXNcbiAqIHNoYXBlIChDb3BpbG90LCBDbGF1ZGUsIENvZGV4LCBcdTIwMjYpIGFuZCBmZWVkcyB0aGVtIHRvXG4gKiB7QGxpbmsgTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXJ9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtNY3BTZXJ2ZXIge1xuXHQvKiogU2VydmVyIG5hbWUgKHVzZWQgYm90aCBhcyB0aGUgY3VzdG9taXphdGlvbiBuYW1lIGFuZCB0aGUgY2hhbm5lbCBzdWZmaXgpLiAqL1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdC8qKiBDdXJyZW50IGxpZmVjeWNsZSBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgc3RhdGU6IE1jcFNlcnZlclN0YXRlO1xuXHQvKiogRXhwbGljaXQgcnVudGltZSBlbmFibGVtZW50IHdoZW4gdGhlIFNESyBkaXN0aW5ndWlzaGVzIGRpc2FibGVkIGZyb20gc3RvcHBlZC4gKi9cblx0cmVhZG9ubHkgZW5hYmxlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUnVudGltZSBmaWVsZHMgb2YgYW4gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uIHRoYXQgdGhpcyBjb250cm9sbGVyXG4gKiBvd25zIFx1MjAxNCB0aGUgaGlnaC1mcmVxdWVuY3kgYHN0YXRlYC9gY2hhbm5lbGAgcGFpci4gQ29uc3VtZXJzIG92ZXJsYXlcbiAqIHRoZXNlIG9udG8gdGhlaXIgcHVibGlzaGVkIGN1c3RvbWl6YXRpb25zIChrZXllZCBieSBjdXN0b21pemF0aW9uIGlkKVxuICogc28gYSB3aG9sZXNhbGUgY3VzdG9taXphdGlvbiByZXB1Ymxpc2ggcHJlc2VydmVzIGxpdmUgTUNQIHN0YXR1c1xuICogcmF0aGVyIHRoYW4gcmVzZXR0aW5nIGl0IHRvIHRoZSBgU3RvcHBlZGAgZGVmYXVsdCBiYWtlZCBpbnRvXG4gKiBgbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb25gLlxuICovXG5leHBvcnQgdHlwZSBJTWNwU2VydmVyUnVudGltZVN0YXRlID0gUGljazxNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCAnc3RhdGUnIHwgJ2NoYW5uZWwnPjtcblxuLyoqXG4gKiBSZS1leHBvcnQgc28gZXhpc3RpbmcgaW1wb3J0cyBvZiBgREVGQVVMVF9NQ1BfQVBQX0NBUEFCSUxJVElFU2AgZnJvbVxuICogdGhlIGNvbnRyb2xsZXIga2VlcCB3b3JraW5nIFx1MjAxNCB0aGUgY2Fub25pY2FsIGhvbWUgaXMgbm93XG4gKiBgYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tY3BBcHBEZWZhdWx0cy50c2AuXG4gKi9cbmV4cG9ydCB7IERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVMsIERFRkFVTFRfTUNQX0FQUCB9O1xuXG4vKipcbiAqIExvb2t1cCBjYWxsYmFjayB0aGUgY29udHJvbGxlciB1c2VzIHRvIGZpbmQgYW4gZXhpc3RpbmcgY2hpbGQgTUNQXG4gKiBjdXN0b21pemF0aW9uIGlkIGJ5IHNlcnZlciBuYW1lLiBUaGUgYWdlbnQncyBwbHVnaW4gbGF5ZXIgcHVibGlzaGVzXG4gKiBNQ1AgY3VzdG9taXphdGlvbnMgd2l0aCBwcm92aWRlci1kZWZpbmVkIGlkc1xuICogKGUuZy4gYHBsdWdpblBhcnNlcnMubWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb25gIHVzZXNcbiAqIGBidWlsZENoaWxkSWQoZGVmaW5pdGlvblVyaSwgJ21jcD0nICsgZW5jb2RlVVJJQ29tcG9uZW50KG5hbWUpKWApLCBzb1xuICogd2UgcmVzb2x2ZSB0aGVtIGJ5IG5hbWUgYXQgYWN0aW9uLWRpc3BhdGNoIHRpbWUgcmF0aGVyIHRoYW4gdHJ5aW5nIHRvXG4gKiByZWNvbnN0cnVjdCB0aGUgaWQuXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIGV4aXN0aW5nIGVudHJ5IG1hdGNoZXMgXHUyMDE0IGluIHRoYXQgY2FzZSB0aGVcbiAqIGNvbnRyb2xsZXIgc3VyZmFjZXMgYSBiYXJlIHRvcC1sZXZlbCBjdXN0b21pemF0aW9uIGZvciB0aGUgc2VydmVyLlxuICovXG5leHBvcnQgdHlwZSBJTWNwQ2hpbGRJZFJlc29sdmVyID0gKHNlcnZlck5hbWU6IHN0cmluZykgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHtAbGluayBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcn0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyT3B0aW9ucyB7XG5cdC8qKiBQcm92aWRlciBpZCAoZS5nLiBgJ2NvcGlsb3RjbGknYCkuIFVzZWQgYXMgdGhlIGNoYW5uZWwgVVJJIGF1dGhvcml0eS4gKi9cblx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHQvKiogU2Vzc2lvbiBpZCAodGhlIHJhdyBpZCwgbm90IHRoZSBmdWxsIFVSSSkuIFVzZWQgYXMgdGhlIGNoYW5uZWwgcGF0aCBzZWdtZW50LiAqL1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIENhbm9uaWNhbCBzZXNzaW9uIFVSSSB1c2VkIHRvIHJlc29sdmUgcGVyc2lzdGVkIGN1c3RvbWl6YXRpb24gc3RhdGUuICovXG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFVSSTtcblx0LyoqXG5cdCAqIFJlc29sdmVzIGFuIGV4aXN0aW5nIGNoaWxkIGN1c3RvbWl6YXRpb24gaWQgZm9yIGEgZ2l2ZW4gc2VydmVyXG5cdCAqIG5hbWUuIFNlZSB7QGxpbmsgSU1jcENoaWxkSWRSZXNvbHZlcn0uXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlQ2hpbGRJZDogSU1jcENoaWxkSWRSZXNvbHZlcjtcblx0LyoqIEVtaXRzIGEge0BsaW5rIFNlc3Npb25BY3Rpb259IGludG8gdGhlIHNlc3Npb24ncyBhY3Rpb24gc3RyZWFtLiAqL1xuXHRyZWFkb25seSBlbWl0OiAoYWN0aW9uOiBTZXNzaW9uQWN0aW9uKSA9PiB2b2lkO1xuXHQvKipcblx0ICogTUNQIEFwcCBjYXBhYmlsaXRpZXMgdG8gYWR2ZXJ0aXNlIG9uIGV2ZXJ5IHJlYWR5IHNlcnZlci4gRGVmYXVsdHNcblx0ICogdG8ge0BsaW5rIERFRkFVTFRfTUNQX0FQUF9DQVBBQklMSVRJRVN9LlxuXHQgKi9cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzPzogQWhwTWNwVWlIb3N0Q2FwYWJpbGl0aWVzO1xufVxuXG5pbnRlcmZhY2UgSUxpdmVFbnRyeSB7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdGU6IE1jcFNlcnZlclN0YXRlO1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHQvKiogVG9wLWxldmVsIGN1c3RvbWl6YXRpb24gaWQgKHdoZW4gbm8gY2hpbGQgbWF0Y2ggd2FzIGZvdW5kKS4gKi9cblx0cmVhZG9ubHkgdG9wTGV2ZWxJZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWNwVG9wTGV2ZWxDdXN0b21pemF0aW9uSWQocHJvdmlkZXJJZDogc3RyaW5nLCBzZXNzaW9uSWQ6IHN0cmluZywgc2VydmVyTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBtY3AtdG9wLWxldmVsOiR7cHJvdmlkZXJJZH06JHtzZXNzaW9uSWR9OiR7c2VydmVyTmFtZX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNY3BDaGFubmVsKHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvbklkOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgbWNwOi8vJHtwcm92aWRlcklkfS8ke2VuY29kZVVSSUNvbXBvbmVudChzZXNzaW9uSWQpfS8ke2VuY29kZVVSSUNvbXBvbmVudChzZXJ2ZXJOYW1lKX1gO1xufVxuXG4vKipcbiAqIFRyYW5zbGF0ZXMgYSBzdHJlYW0gb2YgU0RLLXJlcG9ydGVkIE1DUCBzZXJ2ZXIgc3RhdGVzIGludG8gQUhQXG4gKiBjdXN0b21pemF0aW9uIGFjdGlvbnM6XG4gKlxuICogIC0gRm9yIHNlcnZlcnMgYmFja2VkIGJ5IGFuIGV4aXN0aW5nIGNoaWxkIGN1c3RvbWl6YXRpb24gKHBsdWdpbi0gb3JcbiAqICAgIGRpcmVjdG9yeS1kZXJpdmVkKSwgdGhlIGNvbnRyb2xsZXIgZW1pdHNcbiAqICAgIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWR9IGtleWVkIG9uIHRoZVxuICogICAgcmVzb2x2ZWQgY2hpbGQgaWQuIFRoZSByZWR1Y2VyIG5hcnJvd2x5IHVwZGF0ZXMgYHN0YXRlYCBhbmRcbiAqICAgIGBjaGFubmVsYCBvbiB0aGUgbWF0Y2hpbmcgY2hpbGQuXG4gKiAgLSBGb3Igc2VydmVycyB3aXRoIG5vIG1hdGNoaW5nIGNoaWxkICh0eXBpY2FsbHkgZ2xvYmFsbHktY29uZmlndXJlZFxuICogICAgTUNQIHNlcnZlcnMgdGhlIFNESyByZXBvcnRzKSwgdGhlIGNvbnRyb2xsZXIgZW1pdHMgYSBmdWxsXG4gKiAgICB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWR9IGNhcnJ5aW5nIGEgYmFyZVxuICogICAgdG9wLWxldmVsIHtAbGluayBNY3BTZXJ2ZXJDdXN0b21pemF0aW9ufS4gVGhlIHNhbWUgaWQgaXMgcmV1c2VkXG4gKiAgICBhY3Jvc3MgdXBkYXRlcywgc28gdGhlIHJlZHVjZXIncyB1cHNlcnQga2VlcHMgaW4tcGxhY2UuXG4gKlxuICogVGhlIGNvbnRyb2xsZXIgaXMgU0RLLWFnbm9zdGljOiBwcm92aWRlcnMgdHJhbnNsYXRlIHRoZWlyIG93biBldmVudHNcbiAqIGludG8ge0BsaW5rIElTZGtNY3BTZXJ2ZXJ9IGFuZCBjYWxsIHtAbGluayBhcHBseUFsbH0gLyB7QGxpbmsgYXBwbHlPbmV9LlxuICogSWYgYSBwcm92aWRlciByZXBvcnRzIGEgY29hcnNlIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmd9IHVwZGF0ZVxuICogYWZ0ZXIgYSByaWNoZXIge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWR9IHN0YXRlLCB0aGUgY29udHJvbGxlclxuICogcHJlc2VydmVzIHRoZSBhdXRoLXJlcXVpcmVkIHN0YXRlIHVudGlsIGEgZGVmaW5pdGl2ZVxuICoge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5SZWFkeX0sIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3J9LCBvclxuICoge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkfSB1cGRhdGUgYXJyaXZlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqIFBlci1zZXJ2ZXIgbGl2ZSBlbnRyaWVzLCBrZXllZCBieSBzZXJ2ZXIgbmFtZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbGl2ZSA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seU1hcDxzdHJpbmcsIElMaXZlRW50cnk+Pih0aGlzLCBuZXcgTWFwKCkpO1xuXG5cdC8qKlxuXHQgKiBTbmFwc2hvdCBvZiBldmVyeSBsaXZlIHNlcnZlcidzIHJ1bnRpbWUge0BsaW5rIElNY3BTZXJ2ZXJSdW50aW1lU3RhdGV9LFxuXHQgKiBrZXllZCBieSB0aGUgY3VzdG9taXphdGlvbiBpZCB1bmRlciB3aGljaCBpdCBpcyBwdWJsaXNoZWQgKHRoZVxuXHQgKiBtaW50ZWQgdG9wLWxldmVsIGlkLCBvciB0aGUgcGx1Z2luLWRlcml2ZWQgY2hpbGQgaWQgcmVzb2x2ZWQgdmlhXG5cdCAqIHtAbGluayBJTWNwQ2hpbGRJZFJlc29sdmVyfSkuIERlcml2ZWQgZnJvbSB7QGxpbmsgX2xpdmV9LiBDYWxsZXJzIG1pcnJvclxuXHQgKiB0aGlzIGludG8gdGhlaXIgb3duIHB1Ymxpc2hlZCBjdXN0b21pemF0aW9ucyBzbyBhIHdob2xlc2FsZSByZXB1Ymxpc2hcblx0ICogcHJlc2VydmVzIGxpdmUgTUNQIHN0YXR1cy4gU2VydmVycyB3aG9zZSBjaGlsZCBpZCBjYW5ub3QgY3VycmVudGx5IGJlXG5cdCAqIHJlc29sdmVkIGFyZSBvbWl0dGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgcnVudGltZVN0YXRlczogSU9ic2VydmFibGU8UmVhZG9ubHlNYXA8c3RyaW5nLCBJTWNwU2VydmVyUnVudGltZVN0YXRlPj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSU1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyT3B0aW9ucyxcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJ1bnRpbWVTdGF0ZXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBuZXcgTWFwPHN0cmluZywgSU1jcFNlcnZlclJ1bnRpbWVTdGF0ZT4oKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5yZWFkKHJlYWRlcikudmFsdWVzKCkpIHtcblx0XHRcdFx0Y29uc3QgaWQgPSBlbnRyeS50b3BMZXZlbElkID8/IHRoaXMuX29wdGlvbnMucmVzb2x2ZUNoaWxkSWQoZW50cnkuc2VydmVyTmFtZSk7XG5cdFx0XHRcdGlmIChpZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3V0LnNldChpZCwgeyBzdGF0ZTogZW50cnkuc3RhdGUsIGNoYW5uZWw6IHRoaXMuX2J1aWxkQ2hhbm5lbChlbnRyeS5zZXJ2ZXJOYW1lLCBlbnRyeS5zdGF0ZSkgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3V0O1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IGZvciBpbmNsdXNpb24gaW4gYGdldFNlc3Npb25DdXN0b21pemF0aW9ucygpYCByZXN1bHRzLiAqL1xuXHR0b3BMZXZlbEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Y29uc3Qgb3V0OiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2xpdmUuZ2V0KCkudmFsdWVzKCkpIHtcblx0XHRcdGlmIChlbnRyeS50b3BMZXZlbElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRvdXQucHVzaCh0aGlzLl9idWlsZFRvcExldmVsKGVudHJ5LnRvcExldmVsSWQsIGVudHJ5LnNlcnZlck5hbWUsIGVudHJ5LnN0YXRlLCBlbnRyeS5lbmFibGVkKSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvKipcblx0ICogTmFtZXMgb2YgTUNQIHNlcnZlcnMgY3VycmVudGx5IGluIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHl9LFxuXHQgKiBwYWlyZWQgd2l0aCB0aGVpciBjaGFubmVsIFVSSS4gVXNlZCBieSBwcm92aWRlcnMgdG8gZHJpdmVcblx0ICogcG9sbGluZy1iYXNlZCBub3RpZmljYXRpb24gc3RyZWFtcyAoZS5nLiByZS1mZXRjaCBgdG9vbHMvbGlzdGBcblx0ICogYWZ0ZXIgYSByZWZyZXNoIGhpbnQgYW5kIGZpcmVcblx0ICogYG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkYCBpZiB0aGUgcmVzdWx0IGNoYW5nZWQpLlxuXHQgKi9cblx0cmVhZHlDaGFubmVscygpOiByZWFkb25seSB7IHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZzsgcmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nIH1bXSB7XG5cdFx0Y29uc3Qgb3V0OiB7IHNlcnZlck5hbWU6IHN0cmluZzsgY2hhbm5lbDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5nZXQoKS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGVudHJ5LnN0YXRlLmtpbmQgIT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9idWlsZENoYW5uZWwoZW50cnkuc2VydmVyTmFtZSwgZW50cnkuc3RhdGUpO1xuXHRcdFx0aWYgKGNoYW5uZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRvdXQucHVzaCh7IHNlcnZlck5hbWU6IGVudHJ5LnNlcnZlck5hbWUsIGNoYW5uZWwgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY3VzdG9taXphdGlvbiBpZCBjdXJyZW50bHkgYXNzb2NpYXRlZCB3aXRoIHRoZSBNQ1Bcblx0ICogc2VydmVyIG5hbWVkIGBzZXJ2ZXJOYW1lYCwgb3IgYHVuZGVmaW5lZGAgd2hlbiBubyBjdXN0b21pemF0aW9uXG5cdCAqIGV4aXN0cy4gVG9wLWxldmVsIGVudHJpZXMgcmV0dXJuIHRoZSBtaW50ZWQgdG9wLWxldmVsIGlkOyBjaGlsZFxuXHQgKiBlbnRyaWVzIHJldHVybiB3aGF0ZXZlciB7QGxpbmsgSU1jcENoaWxkSWRSZXNvbHZlcn0gcmVzb2x2ZXMgdG9cblx0ICogZm9yIHRoYXQgc2VydmVyLiBVc2VkIGJ5IHByb3ZpZGVycyB0byB0YWdcblx0ICoge0BsaW5rIFRvb2xDYWxsTWNwQ29udHJpYnV0b3IuY3VzdG9taXphdGlvbklkIHwgdG9vbC1jYWxsIGNvbnRyaWJ1dG9yc31cblx0ICogc28gY2xpZW50cyBjYW4gY29ycmVsYXRlIE1DUCB0b29sIGNhbGxzIHdpdGggdGhlIG9yaWdpbmF0aW5nXG5cdCAqIHNlcnZlciBjdXN0b21pemF0aW9uLlxuXHQgKi9cblx0Y3VzdG9taXphdGlvbklkRm9yU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX2xpdmUuZ2V0KCkuZ2V0KHNlcnZlck5hbWUpO1xuXHRcdGlmIChsaXZlPy50b3BMZXZlbElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBsaXZlLnRvcExldmVsSWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zLnJlc29sdmVDaGlsZElkKHNlcnZlck5hbWUpO1xuXHR9XG5cblx0LyoqIFJldHVybnMgdGhlIGxpdmUgc2VydmVyIG5hbWUgYXNzb2NpYXRlZCB3aXRoIGEgY3VzdG9taXphdGlvbiBpZC4gKi9cblx0c2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZChpZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2xpdmUuZ2V0KCkudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGVudHJ5SWQgPSBlbnRyeS50b3BMZXZlbElkID8/IHRoaXMuX29wdGlvbnMucmVzb2x2ZUNoaWxkSWQoZW50cnkuc2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoZW50cnlJZCA9PT0gaWQpIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LnNlcnZlck5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgbGFzdCBsaXZlIHN0YXRlIHJlY29yZGVkIGZvciB0aGUgTUNQIHNlcnZlciBuYW1lZCBgc2VydmVyTmFtZWAuICovXG5cdHN0YXRlRm9yU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IE1jcFNlcnZlclN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyTmFtZSk/LnN0YXRlO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IHVzZWQgYnkgcHJvdmlkZXJzIHRvIHJlY29uY2lsZSBkZXNpcmVkIGFuZCBvYnNlcnZlZCBlbmFibGVtZW50LiAqL1xuXHRzZXJ2ZXJFbmFibGVtZW50KCk6IHJlYWRvbmx5IHsgcmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nOyByZWFkb25seSBjdXN0b21pemF0aW9uSWQ6IHN0cmluZzsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbiB9W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogeyBzZXJ2ZXJOYW1lOiBzdHJpbmc7IGN1c3RvbWl6YXRpb25JZDogc3RyaW5nOyBlbmFibGVkOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbGl2ZS5nZXQoKS52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbklkID0gZW50cnkudG9wTGV2ZWxJZCA/PyB0aGlzLl9vcHRpb25zLnJlc29sdmVDaGlsZElkKGVudHJ5LnNlcnZlck5hbWUpO1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgc2VydmVyTmFtZTogZW50cnkuc2VydmVyTmFtZSwgY3VzdG9taXphdGlvbklkLCBlbmFibGVkOiBlbnRyeS5lbmFibGVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGBtY3A6Ly9gIEFIUCBjaGFubmVsIFVSSSBjdXJyZW50bHkgYWR2ZXJ0aXNlZCBmb3IgdGhlXG5cdCAqIE1DUCBzZXJ2ZXIgbmFtZWQgYHNlcnZlck5hbWVgLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXJ2ZXIgaXNcblx0ICogbm90IGluIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHl9LiBVc2VkIGJ5IHByb3ZpZGVycyB0byBhdHRhY2hcblx0ICogdGhlIGNoYW5uZWwgdG8gTUNQIEFwcCBgX21ldGEudWlgIHNvIGNsaWVudHMgY2FuIHJvdXRlIEFwcFxuXHQgKiBzdWItUlBDcyAodG9vbHMvY2FsbCwgcmVzb3VyY2VzL3JlYWQsIHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UpXG5cdCAqIGJhY2sgdGhyb3VnaCB7QGxpbmsgSUFnZW50SG9zdFNlcnZpY2UuaGFuZGxlTWNwUmVxdWVzdH0uXG5cdCAqL1xuXHRjaGFubmVsRm9yU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX2xpdmUuZ2V0KCkuZ2V0KHNlcnZlck5hbWUpO1xuXHRcdGlmICghbGl2ZSB8fCBsaXZlLnN0YXRlLmtpbmQgIT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1aWxkQ2hhbm5lbChzZXJ2ZXJOYW1lLCBsaXZlLnN0YXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlcyB0aGUgbGl2ZSBpbnZlbnRvcnkgd2l0aCBgc2VydmVyc2AuIFNlcnZlcnMgbm8gbG9uZ2VyXG5cdCAqIHByZXNlbnQgYXJlIHJlbW92ZWQ7IG5ldyBzZXJ2ZXJzIGFuZCBjaGFuZ2VkIHNlcnZlcnMgYXJlIHVwc2VydGVkLlxuXHQgKiBCYXRjaGVkIGluIGEgc2luZ2xlIHRyYW5zYWN0aW9uIHNvIHtAbGluayBydW50aW1lU3RhdGVzfSBvYnNlcnZlcnNcblx0ICogc2VlIG9uZSBjb2FsZXNjZWQgdXBkYXRlLlxuXHQgKi9cblx0YXBwbHlBbGwoc2VydmVyczogcmVhZG9ubHkgSVNka01jcFNlcnZlcltdKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0XHRzZWVuLmFkZChzZXJ2ZXIubmFtZSk7XG5cdFx0XHRcdHRoaXMuX2FwcGx5T25lKHNlcnZlciwgdHgpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBuYW1lIG9mIFsuLi50aGlzLl9saXZlLmdldCgpLmtleXMoKV0pIHtcblx0XHRcdFx0aWYgKCFzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW92ZShuYW1lLCB0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKiBVcHNlcnRzIGEgc2luZ2xlIHNlcnZlci4gKi9cblx0YXBwbHlPbmUoc2VydmVyOiBJU2RrTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4gdGhpcy5fYXBwbHlPbmUoc2VydmVyLCB0eCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlPbmUoc2VydmVyOiBJU2RrTWNwU2VydmVyLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9saXZlLmdldCgpLmdldChzZXJ2ZXIubmFtZSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZUZvclVwZGF0ZShwcmV2aW91cz8uc3RhdGUsIHNlcnZlci5zdGF0ZSk7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHNlcnZlci5lbmFibGVkID8/IHByZXZpb3VzPy5lbmFibGVkID8/IHRydWU7XG5cdFx0Ly8gT25jZSBwcm9tb3RlZCB0byBhIHRvcC1sZXZlbCBlbnRyeSwgc3RheSB0b3AtbGV2ZWwgZm9yIHRoZVxuXHRcdC8vIHNlc3Npb24gXHUyMDE0IGZsaXBwaW5nIGJhY2sgdG8gYSBjaGlsZCBtaWQtc3RyZWFtIHdvdWxkIG9ycGhhbiB0aGVcblx0XHQvLyBwcmV2aW91c2x5LXB1Ymxpc2hlZCB0b3AtbGV2ZWwgaWQuXG5cdFx0bGV0IHRvcExldmVsSWQgPSBwcmV2aW91cz8udG9wTGV2ZWxJZDtcblx0XHRpZiAodG9wTGV2ZWxJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjaGlsZElkID0gdGhpcy5fb3B0aW9ucy5yZXNvbHZlQ2hpbGRJZChzZXJ2ZXIubmFtZSk7XG5cdFx0XHRpZiAoY2hpbGRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3NldExpdmVFbnRyeShzZXJ2ZXIubmFtZSwgeyBzZXJ2ZXJOYW1lOiBzZXJ2ZXIubmFtZSwgc3RhdGUsIGVuYWJsZWQsIHRvcExldmVsSWQ6IHVuZGVmaW5lZCB9LCB0eCk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMuZW1pdCh7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRcdGlkOiBjaGlsZElkLFxuXHRcdFx0XHRcdHN0YXRlLFxuXHRcdFx0XHRcdGNoYW5uZWw6IHRoaXMuX2J1aWxkQ2hhbm5lbChzZXJ2ZXIubmFtZSwgc3RhdGUpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dG9wTGV2ZWxJZCA9IHRoaXMuX21pbnRUb3BMZXZlbElkKHNlcnZlci5uYW1lKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0TGl2ZUVudHJ5KHNlcnZlci5uYW1lLCB7IHNlcnZlck5hbWU6IHNlcnZlci5uYW1lLCBzdGF0ZSwgZW5hYmxlZCwgdG9wTGV2ZWxJZCB9LCB0eCk7XG5cdFx0dGhpcy5fb3B0aW9ucy5lbWl0KHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0Y3VzdG9taXphdGlvbjogdGhpcy5fYnVpbGRUb3BMZXZlbCh0b3BMZXZlbElkLCBzZXJ2ZXIubmFtZSwgc3RhdGUsIGVuYWJsZWQpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBzZXJ2ZXIgZnJvbSB0aGUgbGl2ZSBpbnZlbnRvcnkuIEZvciB0b3AtbGV2ZWwgZW50cmllc1xuXHQgKiAoYmFyZSBzZXJ2ZXJzIHdpdGggbm8gcGx1Z2luLWRlcml2ZWQgY2hpbGQpIGVtaXRzXG5cdCAqIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uUmVtb3ZlZH0gc28gdGhlIGVudHJ5IGlzXG5cdCAqIGRyb3BwZWQgZnJvbSBzZXNzaW9uIHN0YXRlLCBub3QganVzdCBmcm9tIHRoZSBpbi1tZW1vcnkgbGl2ZVxuXHQgKiBpbnZlbnRvcnkuXG5cdCAqXG5cdCAqIEZvciBjaGlsZCBlbnRyaWVzIHdlIGVtaXQgYSBmaW5hbCB7QGxpbmsgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkfVxuXHQgKiBjYXJyeWluZyB7QGxpbmsgTWNwU2VydmVyU3RhdHVzLlN0b3BwZWR9IHNvIHRoZSBVSSBzZWVzIHRoZVxuXHQgKiBzZXJ2ZXIgc2V0dGxlIGludG8gYSB0ZXJtaW5hbCBzdGF0ZTsgdGhlIHBsdWdpbiBsYXllciBvd25zIHRoZVxuXHQgKiBhY3R1YWwgcmVtb3ZhbCBvZiB0aGUgY2hpbGQgY29udGFpbmVyLlxuXHQgKi9cblx0cmVtb3ZlKHNlcnZlck5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHRoaXMuX3JlbW92ZShzZXJ2ZXJOYW1lLCB0eCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlKHNlcnZlck5hbWU6IHN0cmluZywgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fbGl2ZS5nZXQoKS5nZXQoc2VydmVyTmFtZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kZWxldGVMaXZlRW50cnkoc2VydmVyTmFtZSwgdHgpO1xuXHRcdGlmIChlbnRyeS50b3BMZXZlbElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMuZW1pdCh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkLFxuXHRcdFx0XHRpZDogZW50cnkudG9wTGV2ZWxJZCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZElkID0gdGhpcy5fb3B0aW9ucy5yZXNvbHZlQ2hpbGRJZChzZXJ2ZXJOYW1lKTtcblx0XHRpZiAoY2hpbGRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29wdGlvbnMuZW1pdCh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRpZDogY2hpbGRJZCxcblx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0tIGludGVybmFscyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKiogSW1tdXRhYmxlIHVwc2VydCBpbnRvIHRoZSB7QGxpbmsgX2xpdmV9IG9ic2VydmFibGUuICovXG5cdHByaXZhdGUgX3NldExpdmVFbnRyeShzZXJ2ZXJOYW1lOiBzdHJpbmcsIGVudHJ5OiBJTGl2ZUVudHJ5LCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dCA9IG5ldyBNYXAodGhpcy5fbGl2ZS5nZXQoKSk7XG5cdFx0bmV4dC5zZXQoc2VydmVyTmFtZSwgZW50cnkpO1xuXHRcdHRoaXMuX2xpdmUuc2V0KG5leHQsIHR4KTtcblx0fVxuXG5cdC8qKiBJbW11dGFibGUgZGVsZXRlIGZyb20gdGhlIHtAbGluayBfbGl2ZX0gb2JzZXJ2YWJsZS4gKi9cblx0cHJpdmF0ZSBfZGVsZXRlTGl2ZUVudHJ5KHNlcnZlck5hbWU6IHN0cmluZywgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9saXZlLmdldCgpO1xuXHRcdGlmICghY3VycmVudC5oYXMoc2VydmVyTmFtZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IG5ldyBNYXAoY3VycmVudCk7XG5cdFx0bmV4dC5kZWxldGUoc2VydmVyTmFtZSk7XG5cdFx0dGhpcy5fbGl2ZS5zZXQobmV4dCwgdHgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhdGVGb3JVcGRhdGUocHJldmlvdXM6IE1jcFNlcnZlclN0YXRlIHwgdW5kZWZpbmVkLCBuZXh0OiBNY3BTZXJ2ZXJTdGF0ZSk6IE1jcFNlcnZlclN0YXRlIHtcblx0XHRpZiAocHJldmlvdXM/LmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQgJiYgbmV4dC5raW5kID09PSBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcpIHtcblx0XHRcdHJldHVybiBwcmV2aW91cztcblx0XHR9XG5cdFx0cmV0dXJuIG5leHQ7XG5cdH1cblxuXHRwcml2YXRlIF9taW50VG9wTGV2ZWxJZChzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBidWlsZE1jcFRvcExldmVsQ3VzdG9taXphdGlvbklkKHRoaXMuX29wdGlvbnMucHJvdmlkZXJJZCwgdGhpcy5fb3B0aW9ucy5zZXNzaW9uSWQsIHNlcnZlck5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRDaGFubmVsKHNlcnZlck5hbWU6IHN0cmluZywgc3RhdGU6IE1jcFNlcnZlclN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLlJlYWR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVpbGRNY3BDaGFubmVsKHRoaXMuX29wdGlvbnMucHJvdmlkZXJJZCwgdGhpcy5fb3B0aW9ucy5zZXNzaW9uSWQsIHNlcnZlck5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRUb3BMZXZlbChpZDogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSwgZW5hYmxlZDogYm9vbGVhbik6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLl9idWlsZENoYW5uZWwoc2VydmVyTmFtZSwgc3RhdGUpO1xuXHRcdC8vIFBlciBBSFAgc3BlYywgYG1jcEFwcGAgaXMgYSBzdGF0aWMgY2FwYWJpbGl0eSBkZWNsYXJhdGlvbiBcdTIwMTRcblx0XHQvLyBcIlNIT1VMRCBiZSBwcmVzZW50IHdoZW5ldmVyIHRoZSBzZXJ2ZXIgY2FuIGhvc3QgQXBwc1wiLiBXZVxuXHRcdC8vIHByb3h5IGV2ZXJ5IE1DUCBzZXJ2ZXIgdW5pZm9ybWx5LCBzbyBhZHZlcnRpc2UgdGhlIGhvc3Qnc1xuXHRcdC8vIGNhcGFiaWxpdHkgc2V0IHJlZ2FyZGxlc3Mgb2YgcnVudGltZSBgc3RhdGVgLiBDbGllbnRzIGdhdGVcblx0XHQvLyByZW5kZXJpbmcgb24gYHN0YXRlLmtpbmQgPT09IFJlYWR5YCArIGBjaGFubmVsYCB0aGVtc2VsdmVzLlxuXHRcdGNvbnN0IG1jcEFwcCA9IHRoaXMuX29wdGlvbnMuY2FwYWJpbGl0aWVzXG5cdFx0XHQ/IHsgY2FwYWJpbGl0aWVzOiB0aGlzLl9vcHRpb25zLmNhcGFiaWxpdGllcyB9XG5cdFx0XHQ6IERFRkFVTFRfTUNQX0FQUDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0aWQsXG5cdFx0XHR1cmk6IHRoaXMuX21pbnRUb3BMZXZlbElkKHNlcnZlck5hbWUpLFxuXHRcdFx0bmFtZTogc2VydmVyTmFtZSxcblx0XHRcdGVuYWJsZWQ6IGdldEVmZmVjdGl2ZU1jcFNlcnZlckN1c3RvbWl6YXRpb25zKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUodGhpcy5fb3B0aW9ucy5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucyA/PyBbXSlcblx0XHRcdFx0LmZpbmQoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmlkID09PSBpZCk/LmVuYWJsZWQgPz8gZW5hYmxlZCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdG1jcEFwcCxcblx0XHR9O1xuXHR9XG59XG5cbi8qKlxuICogQ29udmVuaWVuY2UgaGVscGVyOiBnaXZlbiBhIGZsYXQgbGlzdCBvZiB7QGxpbmsgQ3VzdG9taXphdGlvbn1cbiAqIGVudHJpZXMsIHJldHVybnMgdGhlIGlkIG9mIHRoZSBmaXJzdCBNQ1AgY2hpbGQgY3VzdG9taXphdGlvbiB3aG9zZVxuICogbmFtZSBtYXRjaGVzIGBzZXJ2ZXJOYW1lYC4gVXNlZCBieSBwcm92aWRlcnMgdG8gd2lyZSB1cFxuICoge0BsaW5rIElNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlck9wdGlvbnMucmVzb2x2ZUNoaWxkSWR9IHdpdGhvdXRcbiAqIGVhY2ggcHJvdmlkZXIgaGF2aW5nIHRvIHdhbGsgdGhlIGN1c3RvbWl6YXRpb24gdHJlZSBpdHNlbGYuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdLCBzZXJ2ZXJOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0TWNwU2VydmVyQ3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnMpLmZpbmQoc2VydmVyID0+IHNlcnZlci5uYW1lID09PSBzZXJ2ZXJOYW1lKT8uaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNY3BTZXJ2ZXJDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogcmVhZG9ubHkgTWNwU2VydmVyQ3VzdG9taXphdGlvbltdIHtcblx0Y29uc3QgcmVzdWx0OiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCB0b3Agb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRpZiAodG9wLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmVzdWx0LnB1c2godG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0b3AuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0aWYgKGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGNoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IHJlYWRvbmx5IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSB7XG5cdGNvbnN0IHJlc3VsdDogTWNwU2VydmVyQ3VzdG9taXphdGlvbltdID0gW107XG5cdGZvciAoY29uc3QgdG9wIG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0aWYgKHRvcC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHRvcCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdG9wLmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0b3AuZW5hYmxlZCA/IGNoaWxkIDogeyAuLi5jaGlsZCwgZW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudChjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdLCBkZXNpcmVkOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRjb25zdCBkZXNpcmVkQnlJZCA9IG5ldyBNYXAoZ2V0RWZmZWN0aXZlTWNwU2VydmVyQ3VzdG9taXphdGlvbnMoZGVzaXJlZCkubWFwKHNlcnZlciA9PiBbc2VydmVyLmlkLCBzZXJ2ZXIuZW5hYmxlZF0pKTtcblx0cmV0dXJuIGN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+IHtcblx0XHRpZiAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBhcHBseU1jcEVuYWJsZW1lbnQoY3VzdG9taXphdGlvbiwgZGVzaXJlZEJ5SWQpO1xuXHRcdH1cblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gY3VzdG9taXphdGlvbi5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IHtcblx0XHRcdGNvbnN0IG5leHQgPSBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIgPyBhcHBseU1jcEVuYWJsZW1lbnQoY2hpbGQsIGRlc2lyZWRCeUlkKSA6IGNoaWxkO1xuXHRcdFx0Y2hhbmdlZCB8fD0gbmV4dCAhPT0gY2hpbGQ7XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9KTtcblx0XHRyZXR1cm4gY2hhbmdlZCA/IHsgLi4uY3VzdG9taXphdGlvbiwgY2hpbGRyZW4gfSA6IGN1c3RvbWl6YXRpb247XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBhcHBseU1jcEVuYWJsZW1lbnQ8VCBleHRlbmRzIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfCBFeHRyYWN0PENoaWxkQ3VzdG9taXphdGlvbiwgeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIgfT4+KGN1c3RvbWl6YXRpb246IFQsIGRlc2lyZWRCeUlkOiBSZWFkb25seU1hcDxzdHJpbmcsIGJvb2xlYW4+KTogVCB7XG5cdGNvbnN0IGVuYWJsZWQgPSBkZXNpcmVkQnlJZC5nZXQoY3VzdG9taXphdGlvbi5pZCk7XG5cdHJldHVybiBlbmFibGVkID09PSB1bmRlZmluZWQgfHwgZW5hYmxlZCA9PT0gY3VzdG9taXphdGlvbi5lbmFibGVkID8gY3VzdG9taXphdGlvbiA6IHsgLi4uY3VzdG9taXphdGlvbiwgZW5hYmxlZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZE1jcFNlcnZlck5hbWUoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSwgaWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBnZXRNY3BTZXJ2ZXJDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9ucykuZmluZChzZXJ2ZXIgPT4gc2VydmVyLmlkID09PSBpZCk/Lm5hbWU7XG59XG5cbi8qKlxuICogUGFyc2VkIGBtY3A6Ly88cHJvdmlkZXJJZD4vPHNlc3Npb25JZD4vPHNlcnZlck5hbWU+YCBVUkkgYXMgbWludGVkIGJ5XG4gKiB7QGxpbmsgTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXJ9LiBUaGUgcGF0aCBzZWdtZW50cyBhcmVcbiAqIFVSTC1kZWNvZGVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNY3BDaGFubmVsUm91dGUge1xuXHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXJ2ZXJOYW1lOiBzdHJpbmc7XG59XG5cbi8qKlxuICogRGVjb2RlcyBhIGNoYW5uZWwgVVJJIHN0cmluZyBpbnRvIGEge0BsaW5rIElNY3BDaGFubmVsUm91dGV9LCBvclxuICogcmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBVUkkgaXMgbm90IGFuIGBtY3A6Ly9gIGNoYW5uZWwgb3IgdGhlXG4gKiBwYXRoIGlzIG1hbGZvcm1lZC4gSW50ZW50aW9uYWxseSB1c2VzIHN0cmluZyBwYXJzaW5nIHJhdGhlciB0aGFuXG4gKiBgVVJJLnBhcnNlYCBzbyB0aGUgaGVscGVyIHN0YXlzIHVzYWJsZSBmcm9tIGxheWVycyAoZS5nLiBhZ2VudFNlcnZpY2VcbiAqIHRlc3QgZml4dHVyZXMpIHdpdGhvdXQgYSBmdWxsIFVSSSBkZXBlbmRlbmN5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNY3BDaGFubmVsVXJpKHVyaTogc3RyaW5nKTogSU1jcENoYW5uZWxSb3V0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHByZWZpeCA9ICdtY3A6Ly8nO1xuXHRpZiAoIXVyaS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3QgPSB1cmkuc2xpY2UocHJlZml4Lmxlbmd0aCk7XG5cdGNvbnN0IHNsYXNoID0gcmVzdC5pbmRleE9mKCcvJyk7XG5cdGlmIChzbGFzaCA8PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwcm92aWRlcklkID0gcmVzdC5zbGljZSgwLCBzbGFzaCk7XG5cdGNvbnN0IHRhaWwgPSByZXN0LnNsaWNlKHNsYXNoICsgMSk7XG5cdGNvbnN0IHNlcCA9IHRhaWwuaW5kZXhPZignLycpO1xuXHRpZiAoc2VwIDw9IDAgfHwgc2VwID09PSB0YWlsLmxlbmd0aCAtIDEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBzZXNzaW9uSWQ6IHN0cmluZztcblx0bGV0IHNlcnZlck5hbWU6IHN0cmluZztcblx0dHJ5IHtcblx0XHQvLyBgZGVjb2RlVVJJQ29tcG9uZW50YCB0aHJvd3MgYFVSSUVycm9yYCBvbiBtYWxmb3JtZWQgcGVyY2VudFxuXHRcdC8vIGVzY2FwZXMgKGUuZy4gYSBsb25lIGAlYCkuIFRyZWF0IGFueSBkZWNvZGUgZmFpbHVyZSBhcyBhXG5cdFx0Ly8gbWFsZm9ybWVkIGNoYW5uZWwgcmF0aGVyIHRoYW4gbGV0dGluZyBpdCBlc2NhcGUgXHUyMDE0IHRoZSBjYWxsZXJcblx0XHQvLyB0cmFuc2xhdGVzIGB1bmRlZmluZWRgIGludG8gYSBjbGVhbiBgTWV0aG9kIG5vdCBmb3VuZGAuXG5cdFx0c2Vzc2lvbklkID0gZGVjb2RlVVJJQ29tcG9uZW50KHRhaWwuc2xpY2UoMCwgc2VwKSk7XG5cdFx0c2VydmVyTmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudCh0YWlsLnNsaWNlKHNlcCArIDEpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIXByb3ZpZGVySWQgfHwgIXNlc3Npb25JZCB8fCAhc2VydmVyTmFtZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgcHJvdmlkZXJJZCwgc2Vzc2lvbklkLCBzZXJ2ZXJOYW1lIH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxpQkFBaUIsbUJBQXdEO0FBRTNGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CLHVCQUFxSjtBQUNqTCxTQUFT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
