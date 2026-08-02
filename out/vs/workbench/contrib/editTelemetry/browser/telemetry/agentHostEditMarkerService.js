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
import { raceTimeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/common/actions.js";
import { ToolResultContentType } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { buildCancelEditAttributionResource, buildCommitEditAttributionResource, buildPrepareEditAttributionResource, createFileEditContentDigest, getFileEditAttributionMarker } from "../../../../../platform/agentHost/common/fileEditAttribution.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
const MARKER_TTL = 5 * 60 * 1e3;
const ROUTE_TTL = 10 * 60 * 60 * 1e3;
const MAX_MARKERS_PER_RESOURCE = 128;
const MAX_OBSERVATIONS_PER_RESOURCE = 128;
const MAX_ROUTES = 1e3;
const COORDINATION_TIMEOUT = 15e3;
class AgentHostEditAttributionUnknownOutcomeError extends Error {
  constructor(cause) {
    super("The Agent Host edit attribution outcome is unknown", { cause });
  }
}
class AgentHostEditAttributionDeferredError extends Error {
  constructor(cause) {
    super("The Agent Host edit attribution was deferred", { cause });
  }
}
let AgentHostEditMarkerService = class extends Disposable {
  constructor(_connectionsService, _uriIdentityService) {
    super();
    this._connectionsService = _connectionsService;
    this._uriIdentityService = _uriIdentityService;
    this._markers = /* @__PURE__ */ new Map();
    this._observations = /* @__PURE__ */ new Map();
    this._routes = /* @__PURE__ */ new Map();
    this._coverageGaps = /* @__PURE__ */ new Map();
    this._onDidSuppress = this._register(new Emitter());
    this._onDidInvalidate = this._register(new Emitter());
    this._onDidReceiveMarker = this._register(new Emitter());
    this._connectionListeners = this._register(new DisposableStore());
    this._updateConnectionListeners();
    this._register(this._connectionsService.onDidChangeConnections(() => this._updateConnectionListeners()));
  }
  createCorrelation(resource) {
    const resourceKey = this._key(resource);
    return {
      onDidSuppress: this._onDidSuppress.event,
      onDidInvalidate: this._onDidInvalidate.event,
      register: (before, after) => this._registerObservation(resourceKey, before, after),
      isSuppressed: (id) => this._observations.get(resourceKey)?.some((observation) => observation.id === id && observation.suppressed) ?? false,
      release: (id) => this._releaseObservation(resourceKey, id)
    };
  }
  takeCoverageGap(resource) {
    const resourceKey = this._key(resource);
    const coverageGap = this._coverageGaps.get(resourceKey);
    if (!coverageGap) {
      return void 0;
    }
    this._coverageGaps.delete(resourceKey);
    if (coverageGap.timestamp < Date.now() - ROUTE_TTL) {
      return void 0;
    }
    return {
      editCount: coverageGap.editCount,
      insertedCount: coverageGap.insertedCount
    };
  }
  async prepareFlush(resource, trigger, statsUuid, isDirty, languageId = "plaintext") {
    const resourceKey = this._key(resource);
    this._prune(resourceKey);
    const route = this._routes.get(resourceKey);
    if (!route) {
      return void 0;
    }
    const flushToken = generateUuid();
    try {
      const result = await this._resourceRead(route.connection, buildPrepareEditAttributionResource({
        resource: route.resource,
        trigger,
        statsUuid,
        isDirty,
        flushToken,
        languageId
      }));
      const prepared = JSON.parse(result.data);
      if (prepared && (prepared.flushToken !== flushToken || !Number.isSafeInteger(prepared.agentModifiedCount) || prepared.agentModifiedCount < 0 || prepared.lastSequence !== void 0 && (!Number.isSafeInteger(prepared.lastSequence) || prepared.lastSequence < 0))) {
        throw new Error("Agent Host edit attribution returned an invalid prepared flush");
      }
      if (prepared?.lastSequence !== void 0) {
        await this._waitForMarker(resourceKey, route.connection, prepared.lastSequence);
      }
      return prepared ? {
        ...prepared,
        commit: async (totalModifiedCount) => {
          let commitError = new Error(`Agent Host edit attribution commit failed: ${prepared.flushToken}`);
          try {
            const result2 = await this._readOutcome(route.connection, buildCommitEditAttributionResource({
              flushToken: prepared.flushToken,
              totalModifiedCount
            }));
            if (result2.outcome === "committed") {
              return;
            }
            commitError = new Error(`Agent Host edit attribution commit was not found: ${prepared.flushToken}`);
          } catch (error) {
            commitError = error;
          }
          let cancelResult;
          try {
            cancelResult = await this._readOutcome(route.connection, buildCancelEditAttributionResource({
              flushToken: prepared.flushToken
            }));
          } catch (cancelError) {
            throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
              [commitError, cancelError],
              "Failed to commit or cancel Agent Host edit attribution"
            ));
          }
          if (cancelResult.outcome === "committed") {
            return;
          }
          throw new AgentHostEditAttributionDeferredError(commitError);
        }
      } : void 0;
    } catch (prepareError) {
      return this._recoverFailedPrepare(route.connection, flushToken, prepareError);
    }
  }
  async _recoverFailedPrepare(connection, flushToken, prepareError) {
    let cancelResult;
    try {
      cancelResult = await this._readOutcome(connection, buildCancelEditAttributionResource({ flushToken }));
    } catch (cancelError) {
      throw new AgentHostEditAttributionUnknownOutcomeError(new AggregateError(
        [prepareError, cancelError],
        "Failed to prepare or cancel Agent Host edit attribution"
      ));
    }
    if (cancelResult.outcome === "committed") {
      return {
        flushToken,
        agentModifiedCount: cancelResult.agentModifiedCount,
        commit: async () => {
        }
      };
    }
    throw new AgentHostEditAttributionDeferredError(prepareError);
  }
  async _waitForMarker(resourceKey, connection, sequence) {
    const isCaughtUp = () => {
      const route = this._routes.get(resourceKey);
      return route?.connection === connection && route.lastSequence >= sequence;
    };
    if (isCaughtUp()) {
      return;
    }
    const marker = await raceTimeout(Event.toPromise(Event.filter(
      this._onDidReceiveMarker.event,
      (event) => event.resourceKey === resourceKey && event.connection === connection && event.sequence >= sequence
    )), COORDINATION_TIMEOUT);
    if (!marker && !isCaughtUp()) {
      throw new Error(`Timed out waiting for Agent Host edit attribution marker: ${sequence}`);
    }
  }
  async _resourceRead(connection, resource) {
    const result = await raceTimeout(connection.resourceRead(resource), COORDINATION_TIMEOUT);
    if (!result) {
      throw new Error(`Agent Host edit attribution request timed out: ${resource.path}`);
    }
    return result;
  }
  async _readOutcome(connection, resource) {
    const result = await this._resourceRead(connection, resource);
    const parsed = JSON.parse(result.data);
    if (parsed.outcome !== "committed" && parsed.outcome !== "cancelled" && parsed.outcome !== "missing" || typeof parsed.agentModifiedCount !== "number") {
      throw new Error(`Invalid Agent Host edit attribution outcome: ${resource.path}`);
    }
    return {
      outcome: parsed.outcome,
      agentModifiedCount: parsed.agentModifiedCount
    };
  }
  _updateConnectionListeners() {
    this._connectionListeners.clear();
    const activeConnections = new Set(this._connectionsService.connections.flatMap((info) => info.connection ? [info.connection] : []));
    for (const [resourceKey, route] of this._routes) {
      if (!activeConnections.has(route.connection)) {
        this._invalidateObservations(resourceKey);
        this._routes.delete(resourceKey);
      }
    }
    for (const connectionInfo of this._connectionsService.connections) {
      const connection = connectionInfo.connection;
      if (!connection) {
        continue;
      }
      this._connectionListeners.add(connection.onDidAction((envelope) => {
        const action = envelope.action;
        if (action.type !== ActionType.ChatToolCallComplete) {
          return;
        }
        for (const content of action.result.content ?? []) {
          if (content.type !== ToolResultContentType.FileEdit) {
            continue;
          }
          const marker = getFileEditAttributionMarker(content);
          const resourceUri = content.after?.uri ?? content.before?.uri;
          if (!marker || !resourceUri) {
            continue;
          }
          const resource = toAgentHostUri(URI.parse(resourceUri), connectionInfo.authority);
          const resourceKey = this._key(resource);
          const previousRoute = this._routes.get(resourceKey);
          if (previousRoute && (previousRoute.connection !== connection || marker.sequence <= previousRoute.lastSequence)) {
            this._invalidateObservations(resourceKey);
          }
          this._routes.delete(resourceKey);
          this._routes.set(resourceKey, {
            connection,
            resource: URI.parse(resourceUri),
            timestamp: Date.now(),
            lastSequence: marker.sequence
          });
          this._onDidReceiveMarker.fire({ resourceKey, connection, sequence: marker.sequence });
          while (this._routes.size > MAX_ROUTES) {
            const oldestKey = this._routes.keys().next().value;
            if (oldestKey === void 0) {
              break;
            }
            this._invalidateObservations(oldestKey);
            this._routes.delete(oldestKey);
          }
          if (marker.status === "skipped") {
            this._recordCoverageGap(resourceKey, marker.insertedCount);
          } else {
            this._recordMarker(resourceKey, marker);
          }
        }
      }));
    }
  }
  _recordCoverageGap(resourceKey, insertedCount) {
    const existing = this._coverageGaps.get(resourceKey);
    this._coverageGaps.delete(resourceKey);
    this._coverageGaps.set(resourceKey, {
      editCount: (existing?.editCount ?? 0) + 1,
      insertedCount: (existing?.insertedCount ?? 0) + insertedCount,
      timestamp: Date.now()
    });
    while (this._coverageGaps.size > MAX_ROUTES) {
      const oldestKey = this._coverageGaps.keys().next().value;
      if (oldestKey === void 0) {
        break;
      }
      this._coverageGaps.delete(oldestKey);
    }
  }
  _registerObservation(resourceKey, before, after) {
    this._prune(resourceKey);
    const observation = {
      id: generateUuid(),
      beforeDigest: createFileEditContentDigest(before),
      afterDigest: createFileEditContentDigest(after),
      timestamp: Date.now(),
      suppressed: false
    };
    const observations = this._observations.get(resourceKey) ?? [];
    observations.push(observation);
    while (observations.length > MAX_OBSERVATIONS_PER_RESOURCE) {
      const removed = observations.shift();
      if (removed?.suppressed) {
        this._onDidInvalidate.fire(removed.id);
      }
    }
    this._observations.set(resourceKey, observations);
    this._trySuppress(resourceKey, observation);
    return observation.id;
  }
  _recordMarker(resourceKey, marker) {
    this._prune(resourceKey);
    const markers = this._markers.get(resourceKey) ?? [];
    if (!markers.some((candidate) => candidate.editId === marker.editId)) {
      markers.push({ ...marker, timestamp: Date.now() });
      markers.sort((a, b) => a.sequence - b.sequence);
      removeCompletedCycle(markers, marker.editId);
      while (markers.length > MAX_MARKERS_PER_RESOURCE) {
        markers.shift();
      }
      this._markers.set(resourceKey, markers);
    }
    for (const observation of this._observations.get(resourceKey) ?? []) {
      this._trySuppress(resourceKey, observation);
    }
  }
  _trySuppress(resourceKey, observation) {
    if (observation.suppressed) {
      return;
    }
    const markers = this._markers.get(resourceKey);
    if (!markers) {
      return;
    }
    for (let startIndex = 0; startIndex < markers.length; startIndex++) {
      const first = markers[startIndex];
      if (first.beforeDigest !== observation.beforeDigest) {
        continue;
      }
      const consumed = [startIndex];
      let afterDigest = first.afterDigest;
      let sequence = first.sequence;
      while (afterDigest !== observation.afterDigest) {
        const nextIndex = markers.findIndex(
          (marker, index) => index !== startIndex && !consumed.includes(index) && marker.sequence > sequence && marker.beforeDigest === afterDigest
        );
        if (nextIndex < 0) {
          break;
        }
        consumed.push(nextIndex);
        afterDigest = markers[nextIndex].afterDigest;
        sequence = markers[nextIndex].sequence;
      }
      if (afterDigest !== observation.afterDigest) {
        continue;
      }
      observation.suppressed = true;
      for (const index of consumed.toSorted((a, b) => b - a)) {
        markers.splice(index, 1);
      }
      if (markers.length === 0) {
        this._markers.delete(resourceKey);
      }
      this._onDidSuppress.fire(observation.id);
      return;
    }
  }
  _releaseObservation(resourceKey, id) {
    const observations = this._observations.get(resourceKey);
    if (!observations) {
      return;
    }
    const index = observations.findIndex((observation) => observation.id === id);
    if (index >= 0) {
      observations.splice(index, 1);
    }
    if (observations.length === 0) {
      this._observations.delete(resourceKey);
    }
  }
  _invalidateObservations(resourceKey) {
    this._markers.delete(resourceKey);
    const observations = this._observations.get(resourceKey);
    if (!observations) {
      return;
    }
    for (const observation of observations) {
      if (observation.suppressed) {
        this._onDidInvalidate.fire(observation.id);
      }
    }
    this._observations.delete(resourceKey);
  }
  _prune(resourceKey) {
    const now = Date.now();
    const minimumTimestamp = now - MARKER_TTL;
    const markers = this._markers.get(resourceKey)?.filter((marker) => marker.timestamp >= minimumTimestamp);
    if (markers?.length) {
      this._markers.set(resourceKey, markers);
    } else {
      this._markers.delete(resourceKey);
    }
    const observations = this._observations.get(resourceKey)?.filter((observation) => observation.suppressed || observation.timestamp >= minimumTimestamp);
    if (observations?.length) {
      this._observations.set(resourceKey, observations);
    } else {
      this._observations.delete(resourceKey);
    }
    if ((this._routes.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
      this._invalidateObservations(resourceKey);
      this._routes.delete(resourceKey);
    }
    if ((this._coverageGaps.get(resourceKey)?.timestamp ?? now) < now - ROUTE_TTL) {
      this._coverageGaps.delete(resourceKey);
    }
  }
  _key(resource) {
    const normalizedResource = resource.scheme === Schemas.vscodeRemote ? URI.from({ scheme: Schemas.file, path: resource.path }) : resource;
    return this._uriIdentityService.extUri.getComparisonKey(this._uriIdentityService.asCanonicalUri(normalizedResource));
  }
};
AgentHostEditMarkerService = __decorateClass([
  __decorateParam(0, IAgentHostConnectionsService),
  __decorateParam(1, IUriIdentityService)
], AgentHostEditMarkerService);
function removeCompletedCycle(markers, latestEditId) {
  const latestIndex = markers.findIndex((marker) => marker.editId === latestEditId);
  if (latestIndex < 0) {
    return;
  }
  const completedDigest = markers[latestIndex].afterDigest;
  const consumed = [latestIndex];
  let beforeDigest = markers[latestIndex].beforeDigest;
  let sequence = markers[latestIndex].sequence;
  while (true) {
    if (beforeDigest === completedDigest && consumed.length > 1) {
      for (const index of consumed.toSorted((a, b) => b - a)) {
        markers.splice(index, 1);
      }
      return;
    }
    let previousIndex = -1;
    for (let index = markers.length - 1; index >= 0; index--) {
      const marker = markers[index];
      if (marker.sequence < sequence && marker.afterDigest === beforeDigest) {
        previousIndex = index;
        break;
      }
    }
    if (previousIndex < 0) {
      return;
    }
    consumed.push(previousIndex);
    beforeDigest = markers[previousIndex].beforeDigest;
    sequence = markers[previousIndex].sequence;
  }
}
export {
  AgentHostEditAttributionDeferredError,
  AgentHostEditAttributionUnknownOutcomeError,
  AgentHostEditMarkerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci90ZWxlbWV0cnkvYWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb250ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2FuY2VsRWRpdEF0dHJpYnV0aW9uUmVzb3VyY2UsIGJ1aWxkQ29tbWl0RWRpdEF0dHJpYnV0aW9uUmVzb3VyY2UsIGJ1aWxkUHJlcGFyZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlLCBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QsIGdldEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIsIElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdCwgSVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2gsIElUcmFja2VkRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vZmlsZUVkaXRBdHRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0VGVsZW1ldHJ5VHJpZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vZWRpdFRlbGVtZXRyeS5qcyc7XG5cbmNvbnN0IE1BUktFUl9UVEwgPSA1ICogNjAgKiAxMDAwO1xuY29uc3QgUk9VVEVfVFRMID0gMTAgKiA2MCAqIDYwICogMTAwMDtcbmNvbnN0IE1BWF9NQVJLRVJTX1BFUl9SRVNPVVJDRSA9IDEyODtcbmNvbnN0IE1BWF9PQlNFUlZBVElPTlNfUEVSX1JFU09VUkNFID0gMTI4O1xuY29uc3QgTUFYX1JPVVRFUyA9IDFfMDAwO1xuY29uc3QgQ09PUkRJTkFUSU9OX1RJTUVPVVQgPSAxNV8wMDA7XG5cbmludGVyZmFjZSBJUmVjZW50TWFya2VyIGV4dGVuZHMgSVRyYWNrZWRGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyIHtcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkNvdmVyYWdlR2FwIHtcblx0cmVhZG9ubHkgZWRpdENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGluc2VydGVkQ291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElFeHRlcm5hbE9ic2VydmF0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgYmVmb3JlRGlnZXN0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFmdGVyRGlnZXN0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRzdXBwcmVzc2VkOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUFnZW50SG9zdFJlc291cmNlUm91dGUge1xuXHRyZWFkb25seSBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFzdFNlcXVlbmNlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2gge1xuXHRyZWFkb25seSBmbHVzaFRva2VuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50TW9kaWZpZWRDb3VudDogbnVtYmVyO1xuXHRjb21taXQodG90YWxNb2RpZmllZENvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uVW5rbm93bk91dGNvbWVFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IoY2F1c2U6IHVua25vd24pIHtcblx0XHRzdXBlcignVGhlIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiBvdXRjb21lIGlzIHVua25vd24nLCB7IGNhdXNlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25EZWZlcnJlZEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihjYXVzZTogdW5rbm93bikge1xuXHRcdHN1cGVyKCdUaGUgQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIHdhcyBkZWZlcnJlZCcsIHsgY2F1c2UgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2Uge1xuXHRjcmVhdGVDb3JyZWxhdGlvbihyZXNvdXJjZTogVVJJKTogSUV4dGVybmFsRWRpdENvcnJlbGF0aW9uO1xuXHR0YWtlQ292ZXJhZ2VHYXA/KHJlc291cmNlOiBVUkkpOiBJQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uQ292ZXJhZ2VHYXAgfCB1bmRlZmluZWQ7XG5cdHByZXBhcmVGbHVzaChyZXNvdXJjZTogVVJJLCB0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc3RhdHNVdWlkOiBzdHJpbmcsIGlzRGlydHk6IGJvb2xlYW4sIGxhbmd1YWdlSWQ/OiBzdHJpbmcpOiBQcm9taXNlPElQcmVwYXJlZEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkZsdXNoIHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZXJuYWxFZGl0Q29ycmVsYXRpb24ge1xuXHRyZWFkb25seSBvbkRpZFN1cHByZXNzOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZEludmFsaWRhdGU6IEV2ZW50PHN0cmluZz47XG5cdHJlZ2lzdGVyKGJlZm9yZTogc3RyaW5nLCBhZnRlcjogc3RyaW5nKTogc3RyaW5nO1xuXHRpc1N1cHByZXNzZWQoaWQ6IHN0cmluZyk6IGJvb2xlYW47XG5cdHJlbGVhc2UoaWQ6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RFZGl0TWFya2VyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0RWRpdE1hcmtlclNlcnZpY2Uge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJzID0gbmV3IE1hcDxzdHJpbmcsIElSZWNlbnRNYXJrZXJbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb2JzZXJ2YXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElFeHRlcm5hbE9ic2VydmF0aW9uW10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0UmVzb3VyY2VSb3V0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY292ZXJhZ2VHYXBzID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcCAmIHsgcmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXIgfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdXBwcmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW52YWxpZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZU1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgcmVzb3VyY2VLZXk6IHN0cmluZzsgcmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjsgcmVhZG9ubHkgc2VxdWVuY2U6IG51bWJlciB9PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbnNTZXJ2aWNlOiBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMoKCkgPT4gdGhpcy5fdXBkYXRlQ29ubmVjdGlvbkxpc3RlbmVycygpKSk7XG5cdH1cblxuXHRjcmVhdGVDb3JyZWxhdGlvbihyZXNvdXJjZTogVVJJKTogSUV4dGVybmFsRWRpdENvcnJlbGF0aW9uIHtcblx0XHRjb25zdCByZXNvdXJjZUtleSA9IHRoaXMuX2tleShyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkU3VwcHJlc3M6IHRoaXMuX29uRGlkU3VwcHJlc3MuZXZlbnQsXG5cdFx0XHRvbkRpZEludmFsaWRhdGU6IHRoaXMuX29uRGlkSW52YWxpZGF0ZS5ldmVudCxcblx0XHRcdHJlZ2lzdGVyOiAoYmVmb3JlLCBhZnRlcikgPT4gdGhpcy5fcmVnaXN0ZXJPYnNlcnZhdGlvbihyZXNvdXJjZUtleSwgYmVmb3JlLCBhZnRlciksXG5cdFx0XHRpc1N1cHByZXNzZWQ6IGlkID0+IHRoaXMuX29ic2VydmF0aW9ucy5nZXQocmVzb3VyY2VLZXkpPy5zb21lKG9ic2VydmF0aW9uID0+IG9ic2VydmF0aW9uLmlkID09PSBpZCAmJiBvYnNlcnZhdGlvbi5zdXBwcmVzc2VkKSA/PyBmYWxzZSxcblx0XHRcdHJlbGVhc2U6IGlkID0+IHRoaXMuX3JlbGVhc2VPYnNlcnZhdGlvbihyZXNvdXJjZUtleSwgaWQpLFxuXHRcdH07XG5cdH1cblxuXHR0YWtlQ292ZXJhZ2VHYXAocmVzb3VyY2U6IFVSSSk6IElBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Db3ZlcmFnZUdhcCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSB0aGlzLl9rZXkocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvdmVyYWdlR2FwID0gdGhpcy5fY292ZXJhZ2VHYXBzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFjb3ZlcmFnZUdhcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0aWYgKGNvdmVyYWdlR2FwLnRpbWVzdGFtcCA8IERhdGUubm93KCkgLSBST1VURV9UVEwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRlZGl0Q291bnQ6IGNvdmVyYWdlR2FwLmVkaXRDb3VudCxcblx0XHRcdGluc2VydGVkQ291bnQ6IGNvdmVyYWdlR2FwLmluc2VydGVkQ291bnQsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVGbHVzaChyZXNvdXJjZTogVVJJLCB0cmlnZ2VyOiBFZGl0VGVsZW1ldHJ5VHJpZ2dlciwgc3RhdHNVdWlkOiBzdHJpbmcsIGlzRGlydHk6IGJvb2xlYW4sIGxhbmd1YWdlSWQgPSAncGxhaW50ZXh0Jyk6IFByb21pc2U8SVByZXBhcmVkQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRmx1c2ggfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZUtleSA9IHRoaXMuX2tleShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fcHJ1bmUocmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IHJvdXRlID0gdGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZmx1c2hUb2tlbiA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVJlYWQocm91dGUuY29ubmVjdGlvbiwgYnVpbGRQcmVwYXJlRWRpdEF0dHJpYnV0aW9uUmVzb3VyY2Uoe1xuXHRcdFx0XHRyZXNvdXJjZTogcm91dGUucmVzb3VyY2UsXG5cdFx0XHRcdHRyaWdnZXIsXG5cdFx0XHRcdHN0YXRzVXVpZCxcblx0XHRcdFx0aXNEaXJ0eSxcblx0XHRcdFx0Zmx1c2hUb2tlbixcblx0XHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHByZXBhcmVkID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YSkgYXMgSVByZXBhcmVkRWRpdEF0dHJpYnV0aW9uRmx1c2ggfCBudWxsO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRwcmVwYXJlZCAmJlxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0cHJlcGFyZWQuZmx1c2hUb2tlbiAhPT0gZmx1c2hUb2tlbiB8fFxuXHRcdFx0XHRcdCFOdW1iZXIuaXNTYWZlSW50ZWdlcihwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQpIHx8XG5cdFx0XHRcdFx0cHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50IDwgMCB8fFxuXHRcdFx0XHRcdChwcmVwYXJlZC5sYXN0U2VxdWVuY2UgIT09IHVuZGVmaW5lZCAmJiAoIU51bWJlci5pc1NhZmVJbnRlZ2VyKHByZXBhcmVkLmxhc3RTZXF1ZW5jZSkgfHwgcHJlcGFyZWQubGFzdFNlcXVlbmNlIDwgMCkpXG5cdFx0XHRcdClcblx0XHRcdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbiByZXR1cm5lZCBhbiBpbnZhbGlkIHByZXBhcmVkIGZsdXNoJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJlcGFyZWQ/Lmxhc3RTZXF1ZW5jZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JNYXJrZXIocmVzb3VyY2VLZXksIHJvdXRlLmNvbm5lY3Rpb24sIHByZXBhcmVkLmxhc3RTZXF1ZW5jZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJlcGFyZWQgPyB7XG5cdFx0XHRcdC4uLnByZXBhcmVkLFxuXHRcdFx0XHRjb21taXQ6IGFzeW5jIHRvdGFsTW9kaWZpZWRDb3VudCA9PiB7XG5cdFx0XHRcdFx0bGV0IGNvbW1pdEVycm9yOiB1bmtub3duID0gbmV3IEVycm9yKGBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gY29tbWl0IGZhaWxlZDogJHtwcmVwYXJlZC5mbHVzaFRva2VufWApO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZWFkT3V0Y29tZShyb3V0ZS5jb25uZWN0aW9uLCBidWlsZENvbW1pdEVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHtcblx0XHRcdFx0XHRcdFx0Zmx1c2hUb2tlbjogcHJlcGFyZWQuZmx1c2hUb2tlbixcblx0XHRcdFx0XHRcdFx0dG90YWxNb2RpZmllZENvdW50LFxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5vdXRjb21lID09PSAnY29tbWl0dGVkJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb21taXRFcnJvciA9IG5ldyBFcnJvcihgQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIGNvbW1pdCB3YXMgbm90IGZvdW5kOiAke3ByZXBhcmVkLmZsdXNoVG9rZW59YCk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGNvbW1pdEVycm9yID0gZXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCBjYW5jZWxSZXN1bHQ6IElFZGl0QXR0cmlidXRpb25GbHVzaFJlc3VsdDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y2FuY2VsUmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVhZE91dGNvbWUocm91dGUuY29ubmVjdGlvbiwgYnVpbGRDYW5jZWxFZGl0QXR0cmlidXRpb25SZXNvdXJjZSh7XG5cdFx0XHRcdFx0XHRcdGZsdXNoVG9rZW46IHByZXBhcmVkLmZsdXNoVG9rZW4sXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoY2FuY2VsRXJyb3IpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKG5ldyBBZ2dyZWdhdGVFcnJvcihcblx0XHRcdFx0XHRcdFx0W2NvbW1pdEVycm9yLCBjYW5jZWxFcnJvcl0sXG5cdFx0XHRcdFx0XHRcdCdGYWlsZWQgdG8gY29tbWl0IG9yIGNhbmNlbCBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24nXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNhbmNlbFJlc3VsdC5vdXRjb21lID09PSAnY29tbWl0dGVkJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgQWdlbnRIb3N0RWRpdEF0dHJpYnV0aW9uRGVmZXJyZWRFcnJvcihjb21taXRFcnJvcik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9IDogdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2ggKHByZXBhcmVFcnJvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlY292ZXJGYWlsZWRQcmVwYXJlKHJvdXRlLmNvbm5lY3Rpb24sIGZsdXNoVG9rZW4sIHByZXBhcmVFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb3ZlckZhaWxlZFByZXBhcmUoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgZmx1c2hUb2tlbjogc3RyaW5nLCBwcmVwYXJlRXJyb3I6IHVua25vd24pOiBQcm9taXNlPElQcmVwYXJlZEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkZsdXNoPiB7XG5cdFx0bGV0IGNhbmNlbFJlc3VsdDogSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRjYW5jZWxSZXN1bHQgPSBhd2FpdCB0aGlzLl9yZWFkT3V0Y29tZShjb25uZWN0aW9uLCBidWlsZENhbmNlbEVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHsgZmx1c2hUb2tlbiB9KSk7XG5cdFx0fSBjYXRjaCAoY2FuY2VsRXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBBZ2VudEhvc3RFZGl0QXR0cmlidXRpb25Vbmtub3duT3V0Y29tZUVycm9yKG5ldyBBZ2dyZWdhdGVFcnJvcihcblx0XHRcdFx0W3ByZXBhcmVFcnJvciwgY2FuY2VsRXJyb3JdLFxuXHRcdFx0XHQnRmFpbGVkIHRvIHByZXBhcmUgb3IgY2FuY2VsIEFnZW50IEhvc3QgZWRpdCBhdHRyaWJ1dGlvbidcblx0XHRcdCkpO1xuXHRcdH1cblx0XHRpZiAoY2FuY2VsUmVzdWx0Lm91dGNvbWUgPT09ICdjb21taXR0ZWQnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmbHVzaFRva2VuLFxuXHRcdFx0XHRhZ2VudE1vZGlmaWVkQ291bnQ6IGNhbmNlbFJlc3VsdC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGNvbW1pdDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEFnZW50SG9zdEVkaXRBdHRyaWJ1dGlvbkRlZmVycmVkRXJyb3IocHJlcGFyZUVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JNYXJrZXIocmVzb3VyY2VLZXk6IHN0cmluZywgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgc2VxdWVuY2U6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlzQ2F1Z2h0VXAgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCByb3V0ZSA9IHRoaXMuX3JvdXRlcy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdFx0cmV0dXJuIHJvdXRlPy5jb25uZWN0aW9uID09PSBjb25uZWN0aW9uICYmIHJvdXRlLmxhc3RTZXF1ZW5jZSA+PSBzZXF1ZW5jZTtcblx0XHR9O1xuXHRcdGlmIChpc0NhdWdodFVwKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2VyID0gYXdhaXQgcmFjZVRpbWVvdXQoRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihcblx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZU1hcmtlci5ldmVudCxcblx0XHRcdGV2ZW50ID0+IGV2ZW50LnJlc291cmNlS2V5ID09PSByZXNvdXJjZUtleSAmJiBldmVudC5jb25uZWN0aW9uID09PSBjb25uZWN0aW9uICYmIGV2ZW50LnNlcXVlbmNlID49IHNlcXVlbmNlXG5cdFx0KSksIENPT1JESU5BVElPTl9USU1FT1VUKTtcblx0XHRpZiAoIW1hcmtlciAmJiAhaXNDYXVnaHRVcCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gbWFya2VyOiAke3NlcXVlbmNlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlUmVhZChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCByZXNvdXJjZTogVVJJKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZVRpbWVvdXQoY29ubmVjdGlvbi5yZXNvdXJjZVJlYWQocmVzb3VyY2UpLCBDT09SRElOQVRJT05fVElNRU9VVCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIHJlcXVlc3QgdGltZWQgb3V0OiAke3Jlc291cmNlLnBhdGh9YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkT3V0Y29tZShjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVJlYWQoY29ubmVjdGlvbiwgcmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmVzdWx0LmRhdGEpIGFzIFBhcnRpYWw8SUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0Pjtcblx0XHRpZiAoXG5cdFx0XHQocGFyc2VkLm91dGNvbWUgIT09ICdjb21taXR0ZWQnICYmIHBhcnNlZC5vdXRjb21lICE9PSAnY2FuY2VsbGVkJyAmJiBwYXJzZWQub3V0Y29tZSAhPT0gJ21pc3NpbmcnKSB8fFxuXHRcdFx0dHlwZW9mIHBhcnNlZC5hZ2VudE1vZGlmaWVkQ291bnQgIT09ICdudW1iZXInXG5cdFx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgQWdlbnQgSG9zdCBlZGl0IGF0dHJpYnV0aW9uIG91dGNvbWU6ICR7cmVzb3VyY2UucGF0aH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdG91dGNvbWU6IHBhcnNlZC5vdXRjb21lLFxuXHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwYXJzZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb25uZWN0aW9uTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25MaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRjb25zdCBhY3RpdmVDb25uZWN0aW9ucyA9IG5ldyBTZXQodGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLmNvbm5lY3Rpb25zLmZsYXRNYXAoaW5mbyA9PiBpbmZvLmNvbm5lY3Rpb24gPyBbaW5mby5jb25uZWN0aW9uXSA6IFtdKSk7XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2VLZXksIHJvdXRlXSBvZiB0aGlzLl9yb3V0ZXMpIHtcblx0XHRcdGlmICghYWN0aXZlQ29ubmVjdGlvbnMuaGFzKHJvdXRlLmNvbm5lY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVPYnNlcnZhdGlvbnMocmVzb3VyY2VLZXkpO1xuXHRcdFx0XHR0aGlzLl9yb3V0ZXMuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uSW5mbyBvZiB0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBjb25uZWN0aW9uSW5mby5jb25uZWN0aW9uO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbkxpc3RlbmVycy5hZGQoY29ubmVjdGlvbi5vbkRpZEFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udGVudCBvZiBhY3Rpb24ucmVzdWx0LmNvbnRlbnQgPz8gW10pIHtcblx0XHRcdFx0XHRpZiAoY29udGVudC50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBtYXJrZXIgPSBnZXRGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyKGNvbnRlbnQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gY29udGVudC5hZnRlcj8udXJpID8/IGNvbnRlbnQuYmVmb3JlPy51cmk7XG5cdFx0XHRcdFx0aWYgKCFtYXJrZXIgfHwgIXJlc291cmNlVXJpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UocmVzb3VyY2VVcmkpLCBjb25uZWN0aW9uSW5mby5hdXRob3JpdHkpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlS2V5ID0gdGhpcy5fa2V5KHJlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCBwcmV2aW91c1JvdXRlID0gdGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0aWYgKHByZXZpb3VzUm91dGUgJiYgKHByZXZpb3VzUm91dGUuY29ubmVjdGlvbiAhPT0gY29ubmVjdGlvbiB8fCBtYXJrZXIuc2VxdWVuY2UgPD0gcHJldmlvdXNSb3V0ZS5sYXN0U2VxdWVuY2UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlT2JzZXJ2YXRpb25zKHJlc291cmNlS2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcm91dGVzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcm91dGVzLnNldChyZXNvdXJjZUtleSwge1xuXHRcdFx0XHRcdFx0Y29ubmVjdGlvbixcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UocmVzb3VyY2VVcmkpLFxuXHRcdFx0XHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdFx0bGFzdFNlcXVlbmNlOiBtYXJrZXIuc2VxdWVuY2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlTWFya2VyLmZpcmUoeyByZXNvdXJjZUtleSwgY29ubmVjdGlvbiwgc2VxdWVuY2U6IG1hcmtlci5zZXF1ZW5jZSB9KTtcblx0XHRcdFx0XHR3aGlsZSAodGhpcy5fcm91dGVzLnNpemUgPiBNQVhfUk9VVEVTKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvbGRlc3RLZXkgPSB0aGlzLl9yb3V0ZXMua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHRcdFx0XHRcdGlmIChvbGRlc3RLZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVPYnNlcnZhdGlvbnMob2xkZXN0S2V5KTtcblx0XHRcdFx0XHRcdHRoaXMuX3JvdXRlcy5kZWxldGUob2xkZXN0S2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1hcmtlci5zdGF0dXMgPT09ICdza2lwcGVkJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVjb3JkQ292ZXJhZ2VHYXAocmVzb3VyY2VLZXksIG1hcmtlci5pbnNlcnRlZENvdW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVjb3JkTWFya2VyKHJlc291cmNlS2V5LCBtYXJrZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZENvdmVyYWdlR2FwKHJlc291cmNlS2V5OiBzdHJpbmcsIGluc2VydGVkQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY292ZXJhZ2VHYXBzLmdldChyZXNvdXJjZUtleSk7XG5cdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0dGhpcy5fY292ZXJhZ2VHYXBzLnNldChyZXNvdXJjZUtleSwge1xuXHRcdFx0ZWRpdENvdW50OiAoZXhpc3Rpbmc/LmVkaXRDb3VudCA/PyAwKSArIDEsXG5cdFx0XHRpbnNlcnRlZENvdW50OiAoZXhpc3Rpbmc/Lmluc2VydGVkQ291bnQgPz8gMCkgKyBpbnNlcnRlZENvdW50LFxuXHRcdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdHdoaWxlICh0aGlzLl9jb3ZlcmFnZUdhcHMuc2l6ZSA+IE1BWF9ST1VURVMpIHtcblx0XHRcdGNvbnN0IG9sZGVzdEtleSA9IHRoaXMuX2NvdmVyYWdlR2Fwcy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0aWYgKG9sZGVzdEtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShvbGRlc3RLZXkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyT2JzZXJ2YXRpb24ocmVzb3VyY2VLZXk6IHN0cmluZywgYmVmb3JlOiBzdHJpbmcsIGFmdGVyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRoaXMuX3BydW5lKHJlc291cmNlS2V5KTtcblx0XHRjb25zdCBvYnNlcnZhdGlvbjogSUV4dGVybmFsT2JzZXJ2YXRpb24gPSB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRiZWZvcmVEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChiZWZvcmUpLFxuXHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChhZnRlciksXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0XHRzdXBwcmVzc2VkOiBmYWxzZSxcblx0XHR9O1xuXHRcdGNvbnN0IG9ic2VydmF0aW9ucyA9IHRoaXMuX29ic2VydmF0aW9ucy5nZXQocmVzb3VyY2VLZXkpID8/IFtdO1xuXHRcdG9ic2VydmF0aW9ucy5wdXNoKG9ic2VydmF0aW9uKTtcblx0XHR3aGlsZSAob2JzZXJ2YXRpb25zLmxlbmd0aCA+IE1BWF9PQlNFUlZBVElPTlNfUEVSX1JFU09VUkNFKSB7XG5cdFx0XHRjb25zdCByZW1vdmVkID0gb2JzZXJ2YXRpb25zLnNoaWZ0KCk7XG5cdFx0XHRpZiAocmVtb3ZlZD8uc3VwcHJlc3NlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGUuZmlyZShyZW1vdmVkLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb2JzZXJ2YXRpb25zLnNldChyZXNvdXJjZUtleSwgb2JzZXJ2YXRpb25zKTtcblx0XHR0aGlzLl90cnlTdXBwcmVzcyhyZXNvdXJjZUtleSwgb2JzZXJ2YXRpb24pO1xuXHRcdHJldHVybiBvYnNlcnZhdGlvbi5pZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZE1hcmtlcihyZXNvdXJjZUtleTogc3RyaW5nLCBtYXJrZXI6IElUcmFja2VkRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BydW5lKHJlc291cmNlS2V5KTtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5fbWFya2Vycy5nZXQocmVzb3VyY2VLZXkpID8/IFtdO1xuXHRcdGlmICghbWFya2Vycy5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZWRpdElkID09PSBtYXJrZXIuZWRpdElkKSkge1xuXHRcdFx0bWFya2Vycy5wdXNoKHsgLi4ubWFya2VyLCB0aW1lc3RhbXA6IERhdGUubm93KCkgfSk7XG5cdFx0XHRtYXJrZXJzLnNvcnQoKGEsIGIpID0+IGEuc2VxdWVuY2UgLSBiLnNlcXVlbmNlKTtcblx0XHRcdHJlbW92ZUNvbXBsZXRlZEN5Y2xlKG1hcmtlcnMsIG1hcmtlci5lZGl0SWQpO1xuXHRcdFx0d2hpbGUgKG1hcmtlcnMubGVuZ3RoID4gTUFYX01BUktFUlNfUEVSX1JFU09VUkNFKSB7XG5cdFx0XHRcdG1hcmtlcnMuc2hpZnQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX21hcmtlcnMuc2V0KHJlc291cmNlS2V5LCBtYXJrZXJzKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBvYnNlcnZhdGlvbiBvZiB0aGlzLl9vYnNlcnZhdGlvbnMuZ2V0KHJlc291cmNlS2V5KSA/PyBbXSkge1xuXHRcdFx0dGhpcy5fdHJ5U3VwcHJlc3MocmVzb3VyY2VLZXksIG9ic2VydmF0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cnlTdXBwcmVzcyhyZXNvdXJjZUtleTogc3RyaW5nLCBvYnNlcnZhdGlvbjogSUV4dGVybmFsT2JzZXJ2YXRpb24pOiB2b2lkIHtcblx0XHRpZiAob2JzZXJ2YXRpb24uc3VwcHJlc3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5fbWFya2Vycy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdGlmICghbWFya2Vycykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGxldCBzdGFydEluZGV4ID0gMDsgc3RhcnRJbmRleCA8IG1hcmtlcnMubGVuZ3RoOyBzdGFydEluZGV4KyspIHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gbWFya2Vyc1tzdGFydEluZGV4XTtcblx0XHRcdGlmIChmaXJzdC5iZWZvcmVEaWdlc3QgIT09IG9ic2VydmF0aW9uLmJlZm9yZURpZ2VzdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnN1bWVkID0gW3N0YXJ0SW5kZXhdO1xuXHRcdFx0bGV0IGFmdGVyRGlnZXN0ID0gZmlyc3QuYWZ0ZXJEaWdlc3Q7XG5cdFx0XHRsZXQgc2VxdWVuY2UgPSBmaXJzdC5zZXF1ZW5jZTtcblx0XHRcdHdoaWxlIChhZnRlckRpZ2VzdCAhPT0gb2JzZXJ2YXRpb24uYWZ0ZXJEaWdlc3QpIHtcblx0XHRcdFx0Y29uc3QgbmV4dEluZGV4ID0gbWFya2Vycy5maW5kSW5kZXgoKG1hcmtlciwgaW5kZXgpID0+XG5cdFx0XHRcdFx0aW5kZXggIT09IHN0YXJ0SW5kZXggJiZcblx0XHRcdFx0XHQhY29uc3VtZWQuaW5jbHVkZXMoaW5kZXgpICYmXG5cdFx0XHRcdFx0bWFya2VyLnNlcXVlbmNlID4gc2VxdWVuY2UgJiZcblx0XHRcdFx0XHRtYXJrZXIuYmVmb3JlRGlnZXN0ID09PSBhZnRlckRpZ2VzdFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAobmV4dEluZGV4IDwgMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN1bWVkLnB1c2gobmV4dEluZGV4KTtcblx0XHRcdFx0YWZ0ZXJEaWdlc3QgPSBtYXJrZXJzW25leHRJbmRleF0uYWZ0ZXJEaWdlc3Q7XG5cdFx0XHRcdHNlcXVlbmNlID0gbWFya2Vyc1tuZXh0SW5kZXhdLnNlcXVlbmNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFmdGVyRGlnZXN0ICE9PSBvYnNlcnZhdGlvbi5hZnRlckRpZ2VzdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG9ic2VydmF0aW9uLnN1cHByZXNzZWQgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBjb25zdW1lZC50b1NvcnRlZCgoYSwgYikgPT4gYiAtIGEpKSB7XG5cdFx0XHRcdG1hcmtlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXJrZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9tYXJrZXJzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFN1cHByZXNzLmZpcmUob2JzZXJ2YXRpb24uaWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VPYnNlcnZhdGlvbihyZXNvdXJjZUtleTogc3RyaW5nLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JzZXJ2YXRpb25zID0gdGhpcy5fb2JzZXJ2YXRpb25zLmdldChyZXNvdXJjZUtleSk7XG5cdFx0aWYgKCFvYnNlcnZhdGlvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSBvYnNlcnZhdGlvbnMuZmluZEluZGV4KG9ic2VydmF0aW9uID0+IG9ic2VydmF0aW9uLmlkID09PSBpZCk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdG9ic2VydmF0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0XHRpZiAob2JzZXJ2YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb2JzZXJ2YXRpb25zLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZU9ic2VydmF0aW9ucyhyZXNvdXJjZUtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFya2Vycy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IG9ic2VydmF0aW9ucyA9IHRoaXMuX29ic2VydmF0aW9ucy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdGlmICghb2JzZXJ2YXRpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgb2JzZXJ2YXRpb24gb2Ygb2JzZXJ2YXRpb25zKSB7XG5cdFx0XHRpZiAob2JzZXJ2YXRpb24uc3VwcHJlc3NlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGUuZmlyZShvYnNlcnZhdGlvbi5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29ic2VydmF0aW9ucy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJ1bmUocmVzb3VyY2VLZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgbWluaW11bVRpbWVzdGFtcCA9IG5vdyAtIE1BUktFUl9UVEw7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMuX21hcmtlcnMuZ2V0KHJlc291cmNlS2V5KT8uZmlsdGVyKG1hcmtlciA9PiBtYXJrZXIudGltZXN0YW1wID49IG1pbmltdW1UaW1lc3RhbXApO1xuXHRcdGlmIChtYXJrZXJzPy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX21hcmtlcnMuc2V0KHJlc291cmNlS2V5LCBtYXJrZXJzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFya2Vycy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRjb25zdCBvYnNlcnZhdGlvbnMgPSB0aGlzLl9vYnNlcnZhdGlvbnMuZ2V0KHJlc291cmNlS2V5KT8uZmlsdGVyKG9ic2VydmF0aW9uID0+IG9ic2VydmF0aW9uLnN1cHByZXNzZWQgfHwgb2JzZXJ2YXRpb24udGltZXN0YW1wID49IG1pbmltdW1UaW1lc3RhbXApO1xuXHRcdGlmIChvYnNlcnZhdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb2JzZXJ2YXRpb25zLnNldChyZXNvdXJjZUtleSwgb2JzZXJ2YXRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb2JzZXJ2YXRpb25zLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGlmICgodGhpcy5fcm91dGVzLmdldChyZXNvdXJjZUtleSk/LnRpbWVzdGFtcCA/PyBub3cpIDwgbm93IC0gUk9VVEVfVFRMKSB7XG5cdFx0XHR0aGlzLl9pbnZhbGlkYXRlT2JzZXJ2YXRpb25zKHJlc291cmNlS2V5KTtcblx0XHRcdHRoaXMuX3JvdXRlcy5kZWxldGUocmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRpZiAoKHRoaXMuX2NvdmVyYWdlR2Fwcy5nZXQocmVzb3VyY2VLZXkpPy50aW1lc3RhbXAgPz8gbm93KSA8IG5vdyAtIFJPVVRFX1RUTCkge1xuXHRcdFx0dGhpcy5fY292ZXJhZ2VHYXBzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfa2V5KHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRSZXNvdXJjZSA9IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGVcblx0XHRcdD8gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogcmVzb3VyY2UucGF0aCB9KVxuXHRcdFx0OiByZXNvdXJjZTtcblx0XHRyZXR1cm4gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5hc0Nhbm9uaWNhbFVyaShub3JtYWxpemVkUmVzb3VyY2UpKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVDb21wbGV0ZWRDeWNsZShtYXJrZXJzOiBJUmVjZW50TWFya2VyW10sIGxhdGVzdEVkaXRJZDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGxhdGVzdEluZGV4ID0gbWFya2Vycy5maW5kSW5kZXgobWFya2VyID0+IG1hcmtlci5lZGl0SWQgPT09IGxhdGVzdEVkaXRJZCk7XG5cdGlmIChsYXRlc3RJbmRleCA8IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgY29tcGxldGVkRGlnZXN0ID0gbWFya2Vyc1tsYXRlc3RJbmRleF0uYWZ0ZXJEaWdlc3Q7XG5cdGNvbnN0IGNvbnN1bWVkID0gW2xhdGVzdEluZGV4XTtcblx0bGV0IGJlZm9yZURpZ2VzdCA9IG1hcmtlcnNbbGF0ZXN0SW5kZXhdLmJlZm9yZURpZ2VzdDtcblx0bGV0IHNlcXVlbmNlID0gbWFya2Vyc1tsYXRlc3RJbmRleF0uc2VxdWVuY2U7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0aWYgKGJlZm9yZURpZ2VzdCA9PT0gY29tcGxldGVkRGlnZXN0ICYmIGNvbnN1bWVkLmxlbmd0aCA+IDEpIHtcblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2YgY29uc3VtZWQudG9Tb3J0ZWQoKGEsIGIpID0+IGIgLSBhKSkge1xuXHRcdFx0XHRtYXJrZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBwcmV2aW91c0luZGV4ID0gLTE7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSBtYXJrZXJzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IG1hcmtlcnNbaW5kZXhdO1xuXHRcdFx0aWYgKG1hcmtlci5zZXF1ZW5jZSA8IHNlcXVlbmNlICYmIG1hcmtlci5hZnRlckRpZ2VzdCA9PT0gYmVmb3JlRGlnZXN0KSB7XG5cdFx0XHRcdHByZXZpb3VzSW5kZXggPSBpbmRleDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwcmV2aW91c0luZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdW1lZC5wdXNoKHByZXZpb3VzSW5kZXgpO1xuXHRcdGJlZm9yZURpZ2VzdCA9IG1hcmtlcnNbcHJldmlvdXNJbmRleF0uYmVmb3JlRGlnZXN0O1xuXHRcdHNlcXVlbmNlID0gbWFya2Vyc1twcmV2aW91c0luZGV4XS5zZXF1ZW5jZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0Msb0NBQW9DLHFDQUFxQyw2QkFB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
