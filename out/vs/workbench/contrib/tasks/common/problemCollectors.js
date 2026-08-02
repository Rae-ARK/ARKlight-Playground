import { URI } from "../../../../base/common/uri.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { DisposableStore, Disposable } from "../../../../base/common/lifecycle.js";
import { createLineMatcher, ApplyToKind, getResource } from "./problemMatcher.js";
import { IMarkerData } from "../../../../platform/markers/common/markers.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isWindows } from "../../../../base/common/platform.js";
var ProblemCollectorEventKind = /* @__PURE__ */ ((ProblemCollectorEventKind2) => {
  ProblemCollectorEventKind2["BackgroundProcessingBegins"] = "backgroundProcessingBegins";
  ProblemCollectorEventKind2["BackgroundProcessingEnds"] = "backgroundProcessingEnds";
  return ProblemCollectorEventKind2;
})(ProblemCollectorEventKind || {});
var IProblemCollectorEvent;
((IProblemCollectorEvent2) => {
  function create(kind, capturedVariables) {
    return Object.freeze({ kind, capturedVariables });
  }
  IProblemCollectorEvent2.create = create;
})(IProblemCollectorEvent || (IProblemCollectorEvent = {}));
class AbstractProblemCollector extends Disposable {
  constructor(problemMatchers, markerService, modelService, fileService, logService) {
    super();
    this.problemMatchers = problemMatchers;
    this.markerService = markerService;
    this.modelService = modelService;
    this.logService = logService;
    this.modelListeners = new DisposableStore();
    this._onDidFindFirstMatch = this._register(new Emitter());
    this.onDidFindFirstMatch = this._onDidFindFirstMatch.event;
    this._onDidFindErrors = this._register(new Emitter());
    this.onDidFindErrors = this._onDidFindErrors.event;
    this._onDidRequestInvalidateLastMarker = this._register(new Emitter());
    this.onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;
    this.matchers = /* @__PURE__ */ Object.create(null);
    this.bufferLength = 1;
    problemMatchers.map((elem) => createLineMatcher(elem, fileService, logService)).forEach((matcher) => {
      const length = matcher.matchLength;
      if (length > this.bufferLength) {
        this.bufferLength = length;
      }
      let value = this.matchers[length];
      if (!value) {
        value = [];
        this.matchers[length] = value;
      }
      value.push(matcher);
    });
    this.buffer = [];
    this.activeMatcher = null;
    this._numberOfMatches = 0;
    this._maxMarkerSeverity = void 0;
    this.openModels = /* @__PURE__ */ Object.create(null);
    this.applyToByOwner = /* @__PURE__ */ new Map();
    for (const problemMatcher of problemMatchers) {
      const current = this.applyToByOwner.get(problemMatcher.owner);
      if (current === void 0) {
        this.applyToByOwner.set(problemMatcher.owner, problemMatcher.applyTo);
      } else {
        this.applyToByOwner.set(problemMatcher.owner, this.mergeApplyTo(current, problemMatcher.applyTo));
      }
    }
    this.resourcesToClean = /* @__PURE__ */ new Map();
    this.markers = /* @__PURE__ */ new Map();
    this.deliveredMarkers = /* @__PURE__ */ new Map();
    this._register(this.modelService.onModelAdded((model) => {
      this.openModels[model.uri.toString()] = true;
    }, this, this.modelListeners));
    this._register(this.modelService.onModelRemoved((model) => {
      delete this.openModels[model.uri.toString()];
    }, this, this.modelListeners));
    this.modelService.getModels().forEach((model) => this.openModels[model.uri.toString()] = true);
    this._onDidStateChange = this._register(new Emitter());
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  processLine(line) {
    if (this.tail) {
      const oldTail = this.tail;
      this.tail = oldTail.then(() => {
        return this.processLineInternal(line);
      });
    } else {
      this.tail = this.processLineInternal(line);
    }
  }
  dispose() {
    super.dispose();
    this.modelListeners.dispose();
  }
  get numberOfMatches() {
    return this._numberOfMatches;
  }
  get maxMarkerSeverity() {
    return this._maxMarkerSeverity;
  }
  tryFindMarker(line) {
    let result = null;
    if (this.activeMatcher) {
      result = this.activeMatcher.next(line);
      if (result) {
        this.captureMatch(result);
        return result;
      }
      this.clearBuffer();
      this.activeMatcher = null;
    }
    if (this.buffer.length < this.bufferLength) {
      this.buffer.push(line);
    } else {
      const end = this.buffer.length - 1;
      for (let i = 0; i < end; i++) {
        this.buffer[i] = this.buffer[i + 1];
      }
      this.buffer[end] = line;
    }
    result = this.tryMatchers();
    if (result) {
      this.clearBuffer();
    }
    return result;
  }
  async shouldApplyMatch(result) {
    switch (result.description.applyTo) {
      case ApplyToKind.allDocuments:
        return true;
      case ApplyToKind.openDocuments:
        return !!this.openModels[(await result.resource).toString()];
      case ApplyToKind.closedDocuments:
        return !this.openModels[(await result.resource).toString()];
      default:
        return true;
    }
  }
  mergeApplyTo(current, value) {
    if (current === value || current === ApplyToKind.allDocuments) {
      return current;
    }
    return ApplyToKind.allDocuments;
  }
  tryMatchers() {
    this.activeMatcher = null;
    const length = this.buffer.length;
    for (let startIndex = 0; startIndex < length; startIndex++) {
      const candidates = this.matchers[length - startIndex];
      if (!candidates) {
        continue;
      }
      for (const matcher of candidates) {
        const result = matcher.handle(this.buffer, startIndex);
        if (result.match) {
          this.captureMatch(result.match);
          if (result.continue) {
            this.activeMatcher = matcher;
          }
          return result.match;
        }
      }
    }
    return null;
  }
  captureMatch(match) {
    this._numberOfMatches++;
    if (this._maxMarkerSeverity === void 0 || match.marker.severity > this._maxMarkerSeverity) {
      this._maxMarkerSeverity = match.marker.severity;
    }
  }
  clearBuffer() {
    if (this.buffer.length > 0) {
      this.buffer = [];
    }
  }
  recordResourcesToClean(owner) {
    const resourceSetToClean = this.getResourceSetToClean(owner);
    this.markerService.read({ owner }).forEach((marker) => resourceSetToClean.set(marker.resource.toString(), marker.resource));
  }
  recordResourceToClean(owner, resource) {
    this.getResourceSetToClean(owner).set(resource.toString(), resource);
  }
  removeResourceToClean(owner, resource) {
    const resourceSet = this.resourcesToClean.get(owner);
    resourceSet?.delete(resource);
  }
  getResourceSetToClean(owner) {
    let result = this.resourcesToClean.get(owner);
    if (!result) {
      result = /* @__PURE__ */ new Map();
      this.resourcesToClean.set(owner, result);
    }
    return result;
  }
  cleanAllMarkers() {
    this.resourcesToClean.forEach((value, owner) => {
      this._cleanMarkers(owner, value);
    });
    this.resourcesToClean = /* @__PURE__ */ new Map();
  }
  cleanMarkers(owner) {
    const toClean = this.resourcesToClean.get(owner);
    if (toClean) {
      this._cleanMarkers(owner, toClean);
      this.resourcesToClean.delete(owner);
    }
  }
  _cleanMarkers(owner, toClean) {
    const uris = [];
    const applyTo = this.applyToByOwner.get(owner);
    toClean.forEach((uri, uriAsString) => {
      if (applyTo === ApplyToKind.allDocuments || applyTo === ApplyToKind.openDocuments && this.openModels[uriAsString] || applyTo === ApplyToKind.closedDocuments && !this.openModels[uriAsString]) {
        uris.push(uri);
      }
    });
    this.markerService.remove(owner, uris);
  }
  recordMarker(marker, owner, resourceAsString) {
    let markersPerOwner = this.markers.get(owner);
    if (!markersPerOwner) {
      markersPerOwner = /* @__PURE__ */ new Map();
      this.markers.set(owner, markersPerOwner);
    }
    let markersPerResource = markersPerOwner.get(resourceAsString);
    if (!markersPerResource) {
      markersPerResource = /* @__PURE__ */ new Map();
      markersPerOwner.set(resourceAsString, markersPerResource);
    }
    const key = IMarkerData.makeKeyOptionalMessage(marker, false);
    let existingMarker;
    if (!markersPerResource.has(key)) {
      markersPerResource.set(key, marker);
    } else if ((existingMarker = markersPerResource.get(key)) !== void 0 && existingMarker.message.length < marker.message.length && isWindows) {
      markersPerResource.set(key, marker);
    }
  }
  reportMarkers() {
    this.markers.forEach((markersPerOwner, owner) => {
      const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
      markersPerOwner.forEach((markers, resource) => {
        this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, deliveredMarkersPerOwner);
      });
    });
  }
  deliverMarkersPerOwnerAndResource(owner, resource) {
    const markersPerOwner = this.markers.get(owner);
    if (!markersPerOwner) {
      return;
    }
    const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
    const markersPerResource = markersPerOwner.get(resource);
    if (!markersPerResource) {
      return;
    }
    this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markersPerResource, deliveredMarkersPerOwner);
  }
  deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, reported) {
    if (markers.size !== reported.get(resource)) {
      const toSet = [];
      markers.forEach((value) => toSet.push(value));
      this.markerService.changeOne(owner, URI.parse(resource), toSet);
      reported.set(resource, markers.size);
    }
  }
  getDeliveredMarkersPerOwner(owner) {
    let result = this.deliveredMarkers.get(owner);
    if (!result) {
      result = /* @__PURE__ */ new Map();
      this.deliveredMarkers.set(owner, result);
    }
    return result;
  }
  cleanMarkerCaches() {
    this._numberOfMatches = 0;
    this._maxMarkerSeverity = void 0;
    this.markers.clear();
    this.deliveredMarkers.clear();
  }
  done() {
    this.reportMarkers();
    this.cleanAllMarkers();
  }
}
var ProblemHandlingStrategy = /* @__PURE__ */ ((ProblemHandlingStrategy2) => {
  ProblemHandlingStrategy2[ProblemHandlingStrategy2["Clean"] = 0] = "Clean";
  return ProblemHandlingStrategy2;
})(ProblemHandlingStrategy || {});
class StartStopProblemCollector extends AbstractProblemCollector {
  constructor(problemMatchers, markerService, modelService, _strategy = 0 /* Clean */, fileService, logService) {
    super(problemMatchers, markerService, modelService, fileService, logService);
    this._hasStarted = false;
    const ownerSet = /* @__PURE__ */ Object.create(null);
    problemMatchers.forEach((description) => ownerSet[description.owner] = true);
    this.owners = Object.keys(ownerSet);
    this.owners.forEach((owner) => {
      this.recordResourcesToClean(owner);
    });
  }
  async processLineInternal(line) {
    if (!this._hasStarted) {
      this._hasStarted = true;
      this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
    }
    const markerMatch = this.tryFindMarker(line);
    if (!markerMatch) {
      return;
    }
    const owner = markerMatch.description.owner;
    const resource = await markerMatch.resource;
    const resourceAsString = resource.toString();
    this.removeResourceToClean(owner, resourceAsString);
    const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
    if (shouldApplyMatch) {
      this.recordMarker(markerMatch.marker, owner, resourceAsString);
      if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
        if (this.currentOwner && this.currentResource) {
          this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
        }
        this.currentOwner = owner;
        this.currentResource = resourceAsString;
      }
    }
  }
}
class WatchingProblemCollector extends AbstractProblemCollector {
  constructor(problemMatchers, markerService, modelService, fileService, logService) {
    super(problemMatchers, markerService, modelService, fileService, logService);
    this.lines = [];
    this.beginPatterns = [];
    this.resetCurrentResource();
    this.backgroundPatterns = [];
    this._activeBackgroundMatchers = /* @__PURE__ */ new Set();
    this.problemMatchers.forEach((matcher) => {
      if (matcher.watching) {
        const key = generateUuid();
        this.backgroundPatterns.push({
          key,
          matcher,
          begin: matcher.watching.beginsPattern,
          end: matcher.watching.endsPattern
        });
        this.beginPatterns.push(matcher.watching.beginsPattern.regexp);
      }
    });
    this.modelListeners.add(this.modelService.onModelRemoved((modelEvent) => {
      let markerChanged = Event.debounce(
        this.markerService.onMarkerChanged,
        (last, e) => (last ?? []).concat(e),
        500,
        false,
        true
      )(async (markerEvent) => {
        if (markerEvent.length === 0) {
          return;
        }
        const modelEventUriStr = modelEvent.uri.toString();
        if (!markerEvent.some((uri) => uri.toString() === modelEventUriStr) || this.markerService.read({ resource: modelEvent.uri }).length !== 0) {
          return;
        }
        const oldLines = Array.from(this.lines);
        for (const line of oldLines) {
          await this.processLineInternal(line);
        }
      });
      setTimeout(() => {
        if (markerChanged) {
          const _markerChanged = markerChanged;
          markerChanged = void 0;
          _markerChanged.dispose();
        }
      }, 600);
    }));
  }
  aboutToStart() {
    for (const background of this.backgroundPatterns) {
      if (background.matcher.watching && background.matcher.watching.activeOnStart) {
        this._activeBackgroundMatchers.add(background.key);
        this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
        this.recordResourcesToClean(background.matcher.owner);
      }
    }
  }
  async processLineInternal(line) {
    if (await this.tryBegin(line) || this.tryFinish(line)) {
      return;
    }
    this.lines.push(line);
    const markerMatch = this.tryFindMarker(line);
    if (!markerMatch) {
      return;
    }
    const resource = await markerMatch.resource;
    const owner = markerMatch.description.owner;
    const resourceAsString = resource.toString();
    this.removeResourceToClean(owner, resourceAsString);
    const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
    if (shouldApplyMatch) {
      this.recordMarker(markerMatch.marker, owner, resourceAsString);
      if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
        this.reportMarkersForCurrentResource();
        this.currentOwner = owner;
        this.currentResource = resourceAsString;
      }
    }
  }
  forceDelivery() {
    this.reportMarkersForCurrentResource();
  }
  async tryBegin(line) {
    let result = false;
    for (const background of this.backgroundPatterns) {
      const start = Date.now();
      const matches = background.begin.regexp.exec(line);
      const elapsed = Date.now() - start;
      if (elapsed > 5) {
        this.logService?.trace(`ProblemMatcher: slow begin regexp took ${elapsed}ms to execute`, background.begin.regexp.source);
      }
      if (matches) {
        if (this._activeBackgroundMatchers.has(background.key)) {
          continue;
        }
        this._activeBackgroundMatchers.add(background.key);
        result = true;
        this._onDidFindFirstMatch.fire();
        this.lines = [];
        this.lines.push(line);
        this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
        this.cleanMarkerCaches();
        this.resetCurrentResource();
        const owner = background.matcher.owner;
        const file = matches[background.begin.file];
        if (file) {
          const resource = getResource(file, background.matcher);
          this.recordResourceToClean(owner, await resource);
        } else {
          this.recordResourcesToClean(owner);
        }
      }
    }
    return result;
  }
  tryFinish(line) {
    let result = false;
    for (const background of this.backgroundPatterns) {
      const start = Date.now();
      const matches = background.end.regexp.exec(line);
      const elapsed = Date.now() - start;
      if (elapsed > 5) {
        this.logService?.trace(`ProblemMatcher: slow end regexp took ${elapsed}ms to execute`, background.end.regexp.source);
      }
      if (matches) {
        if (this._numberOfMatches > 0) {
          this._onDidFindErrors.fire(this.markerService.read({ owner: background.matcher.owner }));
        } else {
          this._onDidRequestInvalidateLastMarker.fire();
        }
        if (this._activeBackgroundMatchers.delete(background.key)) {
          this.resetCurrentResource();
          const capturedVariables = matches.groups ? new Map(Object.entries(matches.groups)) : void 0;
          this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingEnds" /* BackgroundProcessingEnds */, capturedVariables));
          result = true;
          this.lines.push(line);
          const owner = background.matcher.owner;
          this.cleanMarkers(owner);
          this.cleanMarkerCaches();
        }
      }
    }
    return result;
  }
  resetCurrentResource() {
    this.reportMarkersForCurrentResource();
    this.currentOwner = void 0;
    this.currentResource = void 0;
  }
  reportMarkersForCurrentResource() {
    if (this.currentOwner && this.currentResource) {
      this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
    }
  }
  done() {
    [...this.applyToByOwner.keys()].forEach((owner) => {
      this.recordResourcesToClean(owner);
    });
    super.done();
  }
  isWatching() {
    return this.backgroundPatterns.length > 0;
  }
}
export {
  AbstractProblemCollector,
  ProblemCollectorEventKind,
  ProblemHandlingStrategy,
  StartStopProblemCollector,
  WatchingProblemCollector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9wcm9ibGVtQ29sbGVjdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5LCBJTnVtYmVyRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5cbmltcG9ydCB7IElMaW5lTWF0Y2hlciwgY3JlYXRlTGluZU1hdGNoZXIsIFByb2JsZW1NYXRjaGVyLCBJUHJvYmxlbU1hdGNoLCBBcHBseVRvS2luZCwgSVdhdGNoaW5nUGF0dGVybiwgZ2V0UmVzb3VyY2UgfSBmcm9tICcuL3Byb2JsZW1NYXRjaGVyLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlLCBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHksIElNYXJrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kIHtcblx0QmFja2dyb3VuZFByb2Nlc3NpbmdCZWdpbnMgPSAnYmFja2dyb3VuZFByb2Nlc3NpbmdCZWdpbnMnLFxuXHRCYWNrZ3JvdW5kUHJvY2Vzc2luZ0VuZHMgPSAnYmFja2dyb3VuZFByb2Nlc3NpbmdFbmRzJ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtQ29sbGVjdG9yRXZlbnQge1xuXHRraW5kOiBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kO1xuXHRjYXB0dXJlZFZhcmlhYmxlcz86IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPjtcbn1cblxubmFtZXNwYWNlIElQcm9ibGVtQ29sbGVjdG9yRXZlbnQge1xuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlKGtpbmQ6IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQsIGNhcHR1cmVkVmFyaWFibGVzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+KSB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoeyBraW5kLCBjYXB0dXJlZFZhcmlhYmxlcyB9KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtTWF0Y2hlciB7XG5cdHByb2Nlc3NMaW5lKGxpbmU6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFByb2JsZW1Db2xsZWN0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgbWF0Y2hlcnM6IElOdW1iZXJEaWN0aW9uYXJ5PElMaW5lTWF0Y2hlcltdPjtcblx0cHJpdmF0ZSBhY3RpdmVNYXRjaGVyOiBJTGluZU1hdGNoZXIgfCBudWxsO1xuXHRwcm90ZWN0ZWQgX251bWJlck9mTWF0Y2hlczogbnVtYmVyO1xuXHRwcml2YXRlIF9tYXhNYXJrZXJTZXZlcml0eT86IE1hcmtlclNldmVyaXR5O1xuXHRwcml2YXRlIGJ1ZmZlcjogc3RyaW5nW107XG5cdHByaXZhdGUgYnVmZmVyTGVuZ3RoOiBudW1iZXI7XG5cdHByaXZhdGUgb3Blbk1vZGVsczogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj47XG5cdHByb3RlY3RlZCByZWFkb25seSBtb2RlbExpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSB0YWlsOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8vIFtvd25lcl0gLT4gQXBwbHlUb0tpbmRcblx0cHJvdGVjdGVkIGFwcGx5VG9CeU93bmVyOiBNYXA8c3RyaW5nLCBBcHBseVRvS2luZD47XG5cdC8vIFtvd25lcl0gLT4gW3Jlc291cmNlXSAtPiBVUklcblx0cHJpdmF0ZSByZXNvdXJjZXNUb0NsZWFuOiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBVUkk+Pjtcblx0Ly8gW293bmVyXSAtPiBbcmVzb3VyY2VdIC0+IFttYXJrZXJrZXldIC0+IG1hcmtlckRhdGFcblx0cHJpdmF0ZSBtYXJrZXJzOiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBJTWFya2VyRGF0YT4+Pjtcblx0Ly8gW293bmVyXSAtPiBbcmVzb3VyY2VdIC0+IG51bWJlcjtcblx0cHJpdmF0ZSBkZWxpdmVyZWRNYXJrZXJzOiBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBudW1iZXI+PjtcblxuXHRwcm90ZWN0ZWQgX29uRGlkU3RhdGVDaGFuZ2U6IEVtaXR0ZXI8SVByb2JsZW1Db2xsZWN0b3JFdmVudD47XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEZpbmRGaXJzdE1hdGNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRmluZEZpcnN0TWF0Y2ggPSB0aGlzLl9vbkRpZEZpbmRGaXJzdE1hdGNoLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRGaW5kRXJyb3JzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1hcmtlcltdPigpKTtcblx0cmVhZG9ubHkgb25EaWRGaW5kRXJyb3JzID0gdGhpcy5fb25EaWRGaW5kRXJyb3JzLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRSZXF1ZXN0SW52YWxpZGF0ZUxhc3RNYXJrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0SW52YWxpZGF0ZUxhc3RNYXJrZXIgPSB0aGlzLl9vbkRpZFJlcXVlc3RJbnZhbGlkYXRlTGFzdE1hcmtlci5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgcHJvYmxlbU1hdGNoZXJzOiBQcm9ibGVtTWF0Y2hlcltdLCBwcm90ZWN0ZWQgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsIHByb3RlY3RlZCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIGZpbGVTZXJ2aWNlPzogSUZpbGVTZXJ2aWNlLCBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1hdGNoZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmJ1ZmZlckxlbmd0aCA9IDE7XG5cdFx0cHJvYmxlbU1hdGNoZXJzLm1hcChlbGVtID0+IGNyZWF0ZUxpbmVNYXRjaGVyKGVsZW0sIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSkuZm9yRWFjaCgobWF0Y2hlcikgPT4ge1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gbWF0Y2hlci5tYXRjaExlbmd0aDtcblx0XHRcdGlmIChsZW5ndGggPiB0aGlzLmJ1ZmZlckxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmJ1ZmZlckxlbmd0aCA9IGxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZSA9IHRoaXMubWF0Y2hlcnNbbGVuZ3RoXTtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0dmFsdWUgPSBbXTtcblx0XHRcdFx0dGhpcy5tYXRjaGVyc1tsZW5ndGhdID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZS5wdXNoKG1hdGNoZXIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYnVmZmVyID0gW107XG5cdFx0dGhpcy5hY3RpdmVNYXRjaGVyID0gbnVsbDtcblx0XHR0aGlzLl9udW1iZXJPZk1hdGNoZXMgPSAwO1xuXHRcdHRoaXMuX21heE1hcmtlclNldmVyaXR5ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMub3Blbk1vZGVscyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5hcHBseVRvQnlPd25lciA9IG5ldyBNYXA8c3RyaW5nLCBBcHBseVRvS2luZD4oKTtcblx0XHRmb3IgKGNvbnN0IHByb2JsZW1NYXRjaGVyIG9mIHByb2JsZW1NYXRjaGVycykge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuYXBwbHlUb0J5T3duZXIuZ2V0KHByb2JsZW1NYXRjaGVyLm93bmVyKTtcblx0XHRcdGlmIChjdXJyZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5hcHBseVRvQnlPd25lci5zZXQocHJvYmxlbU1hdGNoZXIub3duZXIsIHByb2JsZW1NYXRjaGVyLmFwcGx5VG8pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hcHBseVRvQnlPd25lci5zZXQocHJvYmxlbU1hdGNoZXIub3duZXIsIHRoaXMubWVyZ2VBcHBseVRvKGN1cnJlbnQsIHByb2JsZW1NYXRjaGVyLmFwcGx5VG8pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZXNvdXJjZXNUb0NsZWFuID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIFVSST4+KCk7XG5cdFx0dGhpcy5tYXJrZXJzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIElNYXJrZXJEYXRhPj4+KCk7XG5cdFx0dGhpcy5kZWxpdmVyZWRNYXJrZXJzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIG51bWJlcj4+KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKChtb2RlbCkgPT4ge1xuXHRcdFx0dGhpcy5vcGVuTW9kZWxzW21vZGVsLnVyaS50b1N0cmluZygpXSA9IHRydWU7XG5cdFx0fSwgdGhpcywgdGhpcy5tb2RlbExpc3RlbmVycykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKChtb2RlbCkgPT4ge1xuXHRcdFx0ZGVsZXRlIHRoaXMub3Blbk1vZGVsc1ttb2RlbC51cmkudG9TdHJpbmcoKV07XG5cdFx0fSwgdGhpcywgdGhpcy5tb2RlbExpc3RlbmVycykpO1xuXHRcdHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVscygpLmZvckVhY2gobW9kZWwgPT4gdGhpcy5vcGVuTW9kZWxzW21vZGVsLnVyaS50b1N0cmluZygpXSA9IHRydWUpO1xuXG5cdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyKCkpO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFN0YXRlQ2hhbmdlKCk6IEV2ZW50PElQcm9ibGVtQ29sbGVjdG9yRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBwcm9jZXNzTGluZShsaW5lOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy50YWlsKSB7XG5cdFx0XHRjb25zdCBvbGRUYWlsID0gdGhpcy50YWlsO1xuXHRcdFx0dGhpcy50YWlsID0gb2xkVGFpbC50aGVuKCgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvY2Vzc0xpbmVJbnRlcm5hbChsaW5lKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRhaWwgPSB0aGlzLnByb2Nlc3NMaW5lSW50ZXJuYWwobGluZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHByb2Nlc3NMaW5lSW50ZXJuYWwobGluZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5tb2RlbExpc3RlbmVycy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG51bWJlck9mTWF0Y2hlcygpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9udW1iZXJPZk1hdGNoZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1heE1hcmtlclNldmVyaXR5KCk6IE1hcmtlclNldmVyaXR5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF4TWFya2VyU2V2ZXJpdHk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdHJ5RmluZE1hcmtlcihsaW5lOiBzdHJpbmcpOiBJUHJvYmxlbU1hdGNoIHwgbnVsbCB7XG5cdFx0bGV0IHJlc3VsdDogSVByb2JsZW1NYXRjaCB8IG51bGwgPSBudWxsO1xuXHRcdGlmICh0aGlzLmFjdGl2ZU1hdGNoZXIpIHtcblx0XHRcdHJlc3VsdCA9IHRoaXMuYWN0aXZlTWF0Y2hlci5uZXh0KGxpbmUpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVNYXRjaChyZXN1bHQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jbGVhckJ1ZmZlcigpO1xuXHRcdFx0dGhpcy5hY3RpdmVNYXRjaGVyID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYnVmZmVyLmxlbmd0aCA8IHRoaXMuYnVmZmVyTGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmJ1ZmZlci5wdXNoKGxpbmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlbmQgPSB0aGlzLmJ1ZmZlci5sZW5ndGggLSAxO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbmQ7IGkrKykge1xuXHRcdFx0XHR0aGlzLmJ1ZmZlcltpXSA9IHRoaXMuYnVmZmVyW2kgKyAxXTtcblx0XHRcdH1cblx0XHRcdHRoaXMuYnVmZmVyW2VuZF0gPSBsaW5lO1xuXHRcdH1cblxuXHRcdHJlc3VsdCA9IHRoaXMudHJ5TWF0Y2hlcnMoKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHR0aGlzLmNsZWFyQnVmZmVyKCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgc2hvdWxkQXBwbHlNYXRjaChyZXN1bHQ6IElQcm9ibGVtTWF0Y2gpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRzd2l0Y2ggKHJlc3VsdC5kZXNjcmlwdGlvbi5hcHBseVRvKSB7XG5cdFx0XHRjYXNlIEFwcGx5VG9LaW5kLmFsbERvY3VtZW50czpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIEFwcGx5VG9LaW5kLm9wZW5Eb2N1bWVudHM6XG5cdFx0XHRcdHJldHVybiAhIXRoaXMub3Blbk1vZGVsc1soYXdhaXQgcmVzdWx0LnJlc291cmNlKS50b1N0cmluZygpXTtcblx0XHRcdGNhc2UgQXBwbHlUb0tpbmQuY2xvc2VkRG9jdW1lbnRzOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMub3Blbk1vZGVsc1soYXdhaXQgcmVzdWx0LnJlc291cmNlKS50b1N0cmluZygpXTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VBcHBseVRvKGN1cnJlbnQ6IEFwcGx5VG9LaW5kLCB2YWx1ZTogQXBwbHlUb0tpbmQpOiBBcHBseVRvS2luZCB7XG5cdFx0aWYgKGN1cnJlbnQgPT09IHZhbHVlIHx8IGN1cnJlbnQgPT09IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cykge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBBcHBseVRvS2luZC5hbGxEb2N1bWVudHM7XG5cdH1cblxuXHRwcml2YXRlIHRyeU1hdGNoZXJzKCk6IElQcm9ibGVtTWF0Y2ggfCBudWxsIHtcblx0XHR0aGlzLmFjdGl2ZU1hdGNoZXIgPSBudWxsO1xuXHRcdGNvbnN0IGxlbmd0aCA9IHRoaXMuYnVmZmVyLmxlbmd0aDtcblx0XHRmb3IgKGxldCBzdGFydEluZGV4ID0gMDsgc3RhcnRJbmRleCA8IGxlbmd0aDsgc3RhcnRJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gdGhpcy5tYXRjaGVyc1tsZW5ndGggLSBzdGFydEluZGV4XTtcblx0XHRcdGlmICghY2FuZGlkYXRlcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgbWF0Y2hlciBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG1hdGNoZXIuaGFuZGxlKHRoaXMuYnVmZmVyLCBzdGFydEluZGV4KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5tYXRjaCkge1xuXHRcdFx0XHRcdHRoaXMuY2FwdHVyZU1hdGNoKHJlc3VsdC5tYXRjaCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5jb250aW51ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hY3RpdmVNYXRjaGVyID0gbWF0Y2hlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdC5tYXRjaDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgY2FwdHVyZU1hdGNoKG1hdGNoOiBJUHJvYmxlbU1hdGNoKTogdm9pZCB7XG5cdFx0dGhpcy5fbnVtYmVyT2ZNYXRjaGVzKys7XG5cdFx0aWYgKHRoaXMuX21heE1hcmtlclNldmVyaXR5ID09PSB1bmRlZmluZWQgfHwgbWF0Y2gubWFya2VyLnNldmVyaXR5ID4gdGhpcy5fbWF4TWFya2VyU2V2ZXJpdHkpIHtcblx0XHRcdHRoaXMuX21heE1hcmtlclNldmVyaXR5ID0gbWF0Y2gubWFya2VyLnNldmVyaXR5O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJCdWZmZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYnVmZmVyLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuYnVmZmVyID0gW107XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlY29yZFJlc291cmNlc1RvQ2xlYW4ob3duZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlU2V0VG9DbGVhbiA9IHRoaXMuZ2V0UmVzb3VyY2VTZXRUb0NsZWFuKG93bmVyKTtcblx0XHR0aGlzLm1hcmtlclNlcnZpY2UucmVhZCh7IG93bmVyOiBvd25lciB9KS5mb3JFYWNoKG1hcmtlciA9PiByZXNvdXJjZVNldFRvQ2xlYW4uc2V0KG1hcmtlci5yZXNvdXJjZS50b1N0cmluZygpLCBtYXJrZXIucmVzb3VyY2UpKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZWNvcmRSZXNvdXJjZVRvQ2xlYW4ob3duZXI6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0UmVzb3VyY2VTZXRUb0NsZWFuKG93bmVyKS5zZXQocmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbW92ZVJlc291cmNlVG9DbGVhbihvd25lcjogc3RyaW5nLCByZXNvdXJjZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VTZXQgPSB0aGlzLnJlc291cmNlc1RvQ2xlYW4uZ2V0KG93bmVyKTtcblx0XHRyZXNvdXJjZVNldD8uZGVsZXRlKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VTZXRUb0NsZWFuKG93bmVyOiBzdHJpbmcpOiBNYXA8c3RyaW5nLCBVUkk+IHtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5yZXNvdXJjZXNUb0NsZWFuLmdldChvd25lcik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cdFx0XHR0aGlzLnJlc291cmNlc1RvQ2xlYW4uc2V0KG93bmVyLCByZXN1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNsZWFuQWxsTWFya2VycygpOiB2b2lkIHtcblx0XHR0aGlzLnJlc291cmNlc1RvQ2xlYW4uZm9yRWFjaCgodmFsdWUsIG93bmVyKSA9PiB7XG5cdFx0XHR0aGlzLl9jbGVhbk1hcmtlcnMob3duZXIsIHZhbHVlKTtcblx0XHR9KTtcblx0XHR0aGlzLnJlc291cmNlc1RvQ2xlYW4gPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgVVJJPj4oKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjbGVhbk1hcmtlcnMob3duZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRvQ2xlYW4gPSB0aGlzLnJlc291cmNlc1RvQ2xlYW4uZ2V0KG93bmVyKTtcblx0XHRpZiAodG9DbGVhbikge1xuXHRcdFx0dGhpcy5fY2xlYW5NYXJrZXJzKG93bmVyLCB0b0NsZWFuKTtcblx0XHRcdHRoaXMucmVzb3VyY2VzVG9DbGVhbi5kZWxldGUob3duZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFuTWFya2Vycyhvd25lcjogc3RyaW5nLCB0b0NsZWFuOiBNYXA8c3RyaW5nLCBVUkk+KTogdm9pZCB7XG5cdFx0Y29uc3QgdXJpczogVVJJW10gPSBbXTtcblx0XHRjb25zdCBhcHBseVRvID0gdGhpcy5hcHBseVRvQnlPd25lci5nZXQob3duZXIpO1xuXHRcdHRvQ2xlYW4uZm9yRWFjaCgodXJpLCB1cmlBc1N0cmluZykgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRhcHBseVRvID09PSBBcHBseVRvS2luZC5hbGxEb2N1bWVudHMgfHxcblx0XHRcdFx0KGFwcGx5VG8gPT09IEFwcGx5VG9LaW5kLm9wZW5Eb2N1bWVudHMgJiYgdGhpcy5vcGVuTW9kZWxzW3VyaUFzU3RyaW5nXSkgfHxcblx0XHRcdFx0KGFwcGx5VG8gPT09IEFwcGx5VG9LaW5kLmNsb3NlZERvY3VtZW50cyAmJiAhdGhpcy5vcGVuTW9kZWxzW3VyaUFzU3RyaW5nXSlcblx0XHRcdCkge1xuXHRcdFx0XHR1cmlzLnB1c2godXJpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLm1hcmtlclNlcnZpY2UucmVtb3ZlKG93bmVyLCB1cmlzKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZWNvcmRNYXJrZXIobWFya2VyOiBJTWFya2VyRGF0YSwgb3duZXI6IHN0cmluZywgcmVzb3VyY2VBc1N0cmluZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IG1hcmtlcnNQZXJPd25lciA9IHRoaXMubWFya2Vycy5nZXQob3duZXIpO1xuXHRcdGlmICghbWFya2Vyc1Blck93bmVyKSB7XG5cdFx0XHRtYXJrZXJzUGVyT3duZXIgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgSU1hcmtlckRhdGE+PigpO1xuXHRcdFx0dGhpcy5tYXJrZXJzLnNldChvd25lciwgbWFya2Vyc1Blck93bmVyKTtcblx0XHR9XG5cdFx0bGV0IG1hcmtlcnNQZXJSZXNvdXJjZSA9IG1hcmtlcnNQZXJPd25lci5nZXQocmVzb3VyY2VBc1N0cmluZyk7XG5cdFx0aWYgKCFtYXJrZXJzUGVyUmVzb3VyY2UpIHtcblx0XHRcdG1hcmtlcnNQZXJSZXNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBJTWFya2VyRGF0YT4oKTtcblx0XHRcdG1hcmtlcnNQZXJPd25lci5zZXQocmVzb3VyY2VBc1N0cmluZywgbWFya2Vyc1BlclJlc291cmNlKTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gSU1hcmtlckRhdGEubWFrZUtleU9wdGlvbmFsTWVzc2FnZShtYXJrZXIsIGZhbHNlKTtcblx0XHRsZXQgZXhpc3RpbmdNYXJrZXI7XG5cdFx0aWYgKCFtYXJrZXJzUGVyUmVzb3VyY2UuaGFzKGtleSkpIHtcblx0XHRcdG1hcmtlcnNQZXJSZXNvdXJjZS5zZXQoa2V5LCBtYXJrZXIpO1xuXHRcdH0gZWxzZSBpZiAoKChleGlzdGluZ01hcmtlciA9IG1hcmtlcnNQZXJSZXNvdXJjZS5nZXQoa2V5KSkgIT09IHVuZGVmaW5lZCkgJiYgKGV4aXN0aW5nTWFya2VyLm1lc3NhZ2UubGVuZ3RoIDwgbWFya2VyLm1lc3NhZ2UubGVuZ3RoKSAmJiBpc1dpbmRvd3MpIHtcblx0XHRcdC8vIE1vc3QgbGlrZWx5IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83NzQ3NVxuXHRcdFx0Ly8gSGV1cmlzdGljIGRpY3RhdGVzIHRoYXQgd2hlbiB0aGUga2V5IGlzIHRoZSBzYW1lIGFuZCBtZXNzYWdlIGlzIHNtYWxsZXIsIHdlIGhhdmUgaGl0IHRoaXMgbGltaXRhdGlvbi5cblx0XHRcdG1hcmtlcnNQZXJSZXNvdXJjZS5zZXQoa2V5LCBtYXJrZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCByZXBvcnRNYXJrZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2Vycy5mb3JFYWNoKChtYXJrZXJzUGVyT3duZXIsIG93bmVyKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxpdmVyZWRNYXJrZXJzUGVyT3duZXIgPSB0aGlzLmdldERlbGl2ZXJlZE1hcmtlcnNQZXJPd25lcihvd25lcik7XG5cdFx0XHRtYXJrZXJzUGVyT3duZXIuZm9yRWFjaCgobWFya2VycywgcmVzb3VyY2UpID0+IHtcblx0XHRcdFx0dGhpcy5kZWxpdmVyTWFya2Vyc1Blck93bmVyQW5kUmVzb3VyY2VSZXNvbHZlZChvd25lciwgcmVzb3VyY2UsIG1hcmtlcnMsIGRlbGl2ZXJlZE1hcmtlcnNQZXJPd25lcik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBkZWxpdmVyTWFya2Vyc1Blck93bmVyQW5kUmVzb3VyY2Uob3duZXI6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtlcnNQZXJPd25lciA9IHRoaXMubWFya2Vycy5nZXQob3duZXIpO1xuXHRcdGlmICghbWFya2Vyc1Blck93bmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlbGl2ZXJlZE1hcmtlcnNQZXJPd25lciA9IHRoaXMuZ2V0RGVsaXZlcmVkTWFya2Vyc1Blck93bmVyKG93bmVyKTtcblx0XHRjb25zdCBtYXJrZXJzUGVyUmVzb3VyY2UgPSBtYXJrZXJzUGVyT3duZXIuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIW1hcmtlcnNQZXJSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmRlbGl2ZXJNYXJrZXJzUGVyT3duZXJBbmRSZXNvdXJjZVJlc29sdmVkKG93bmVyLCByZXNvdXJjZSwgbWFya2Vyc1BlclJlc291cmNlLCBkZWxpdmVyZWRNYXJrZXJzUGVyT3duZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWxpdmVyTWFya2Vyc1Blck93bmVyQW5kUmVzb3VyY2VSZXNvbHZlZChvd25lcjogc3RyaW5nLCByZXNvdXJjZTogc3RyaW5nLCBtYXJrZXJzOiBNYXA8c3RyaW5nLCBJTWFya2VyRGF0YT4sIHJlcG9ydGVkOiBNYXA8c3RyaW5nLCBudW1iZXI+KTogdm9pZCB7XG5cdFx0aWYgKG1hcmtlcnMuc2l6ZSAhPT0gcmVwb3J0ZWQuZ2V0KHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgdG9TZXQ6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRcdG1hcmtlcnMuZm9yRWFjaCh2YWx1ZSA9PiB0b1NldC5wdXNoKHZhbHVlKSk7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKG93bmVyLCBVUkkucGFyc2UocmVzb3VyY2UpLCB0b1NldCk7XG5cdFx0XHRyZXBvcnRlZC5zZXQocmVzb3VyY2UsIG1hcmtlcnMuc2l6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWxpdmVyZWRNYXJrZXJzUGVyT3duZXIob3duZXI6IHN0cmluZyk6IE1hcDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLmRlbGl2ZXJlZE1hcmtlcnMuZ2V0KG93bmVyKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdHRoaXMuZGVsaXZlcmVkTWFya2Vycy5zZXQob3duZXIsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2xlYW5NYXJrZXJDYWNoZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbnVtYmVyT2ZNYXRjaGVzID0gMDtcblx0XHR0aGlzLl9tYXhNYXJrZXJTZXZlcml0eSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLm1hcmtlcnMuY2xlYXIoKTtcblx0XHR0aGlzLmRlbGl2ZXJlZE1hcmtlcnMuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyBkb25lKCk6IHZvaWQge1xuXHRcdHRoaXMucmVwb3J0TWFya2VycygpO1xuXHRcdHRoaXMuY2xlYW5BbGxNYXJrZXJzKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUHJvYmxlbUhhbmRsaW5nU3RyYXRlZ3kge1xuXHRDbGVhblxufVxuXG5leHBvcnQgY2xhc3MgU3RhcnRTdG9wUHJvYmxlbUNvbGxlY3RvciBleHRlbmRzIEFic3RyYWN0UHJvYmxlbUNvbGxlY3RvciBpbXBsZW1lbnRzIElQcm9ibGVtTWF0Y2hlciB7XG5cdHByaXZhdGUgb3duZXJzOiBzdHJpbmdbXTtcblxuXHRwcml2YXRlIGN1cnJlbnRPd25lcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRSZXNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2hhc1N0YXJ0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihwcm9ibGVtTWF0Y2hlcnM6IFByb2JsZW1NYXRjaGVyW10sIG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsIF9zdHJhdGVneTogUHJvYmxlbUhhbmRsaW5nU3RyYXRlZ3kgPSBQcm9ibGVtSGFuZGxpbmdTdHJhdGVneS5DbGVhbiwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKHByb2JsZW1NYXRjaGVycywgbWFya2VyU2VydmljZSwgbW9kZWxTZXJ2aWNlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgb3duZXJTZXQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRwcm9ibGVtTWF0Y2hlcnMuZm9yRWFjaChkZXNjcmlwdGlvbiA9PiBvd25lclNldFtkZXNjcmlwdGlvbi5vd25lcl0gPSB0cnVlKTtcblx0XHR0aGlzLm93bmVycyA9IE9iamVjdC5rZXlzKG93bmVyU2V0KTtcblx0XHR0aGlzLm93bmVycy5mb3JFYWNoKChvd25lcikgPT4ge1xuXHRcdFx0dGhpcy5yZWNvcmRSZXNvdXJjZXNUb0NsZWFuKG93bmVyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBwcm9jZXNzTGluZUludGVybmFsKGxpbmU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faGFzU3RhcnRlZCkge1xuXHRcdFx0dGhpcy5faGFzU3RhcnRlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUoSVByb2JsZW1Db2xsZWN0b3JFdmVudC5jcmVhdGUoUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZC5CYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucykpO1xuXHRcdH1cblx0XHRjb25zdCBtYXJrZXJNYXRjaCA9IHRoaXMudHJ5RmluZE1hcmtlcihsaW5lKTtcblx0XHRpZiAoIW1hcmtlck1hdGNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3duZXIgPSBtYXJrZXJNYXRjaC5kZXNjcmlwdGlvbi5vd25lcjtcblx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IG1hcmtlck1hdGNoLnJlc291cmNlO1xuXHRcdGNvbnN0IHJlc291cmNlQXNTdHJpbmcgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMucmVtb3ZlUmVzb3VyY2VUb0NsZWFuKG93bmVyLCByZXNvdXJjZUFzU3RyaW5nKTtcblx0XHRjb25zdCBzaG91bGRBcHBseU1hdGNoID0gYXdhaXQgdGhpcy5zaG91bGRBcHBseU1hdGNoKG1hcmtlck1hdGNoKTtcblx0XHRpZiAoc2hvdWxkQXBwbHlNYXRjaCkge1xuXHRcdFx0dGhpcy5yZWNvcmRNYXJrZXIobWFya2VyTWF0Y2gubWFya2VyLCBvd25lciwgcmVzb3VyY2VBc1N0cmluZyk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50T3duZXIgIT09IG93bmVyIHx8IHRoaXMuY3VycmVudFJlc291cmNlICE9PSByZXNvdXJjZUFzU3RyaW5nKSB7XG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRPd25lciAmJiB0aGlzLmN1cnJlbnRSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuZGVsaXZlck1hcmtlcnNQZXJPd25lckFuZFJlc291cmNlKHRoaXMuY3VycmVudE93bmVyLCB0aGlzLmN1cnJlbnRSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jdXJyZW50T3duZXIgPSBvd25lcjtcblx0XHRcdFx0dGhpcy5jdXJyZW50UmVzb3VyY2UgPSByZXNvdXJjZUFzU3RyaW5nO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUJhY2tncm91bmRQYXR0ZXJucyB7XG5cdGtleTogc3RyaW5nO1xuXHRtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlcjtcblx0YmVnaW46IElXYXRjaGluZ1BhdHRlcm47XG5cdGVuZDogSVdhdGNoaW5nUGF0dGVybjtcbn1cblxuZXhwb3J0IGNsYXNzIFdhdGNoaW5nUHJvYmxlbUNvbGxlY3RvciBleHRlbmRzIEFic3RyYWN0UHJvYmxlbUNvbGxlY3RvciBpbXBsZW1lbnRzIElQcm9ibGVtTWF0Y2hlciB7XG5cblx0cHJpdmF0ZSBiYWNrZ3JvdW5kUGF0dGVybnM6IElCYWNrZ3JvdW5kUGF0dGVybnNbXTtcblxuXHQvLyB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDQwMThcblx0cHJpdmF0ZSBfYWN0aXZlQmFja2dyb3VuZE1hdGNoZXJzOiBTZXQ8c3RyaW5nPjtcblxuXHQvLyBDdXJyZW50IFN0YXRlXG5cdHByaXZhdGUgY3VycmVudE93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudFJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0cHVibGljIGJlZ2luUGF0dGVybnM6IFJlZ0V4cFtdID0gW107XG5cdGNvbnN0cnVjdG9yKHByb2JsZW1NYXRjaGVyczogUHJvYmxlbU1hdGNoZXJbXSwgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKHByb2JsZW1NYXRjaGVycywgbWFya2VyU2VydmljZSwgbW9kZWxTZXJ2aWNlLCBmaWxlU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5yZXNldEN1cnJlbnRSZXNvdXJjZSgpO1xuXHRcdHRoaXMuYmFja2dyb3VuZFBhdHRlcm5zID0gW107XG5cdFx0dGhpcy5fYWN0aXZlQmFja2dyb3VuZE1hdGNoZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5wcm9ibGVtTWF0Y2hlcnMuZm9yRWFjaChtYXRjaGVyID0+IHtcblx0XHRcdGlmIChtYXRjaGVyLndhdGNoaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGtleTogc3RyaW5nID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdHRoaXMuYmFja2dyb3VuZFBhdHRlcm5zLnB1c2goe1xuXHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRtYXRjaGVyOiBtYXRjaGVyLFxuXHRcdFx0XHRcdGJlZ2luOiBtYXRjaGVyLndhdGNoaW5nLmJlZ2luc1BhdHRlcm4sXG5cdFx0XHRcdFx0ZW5kOiBtYXRjaGVyLndhdGNoaW5nLmVuZHNQYXR0ZXJuXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmJlZ2luUGF0dGVybnMucHVzaChtYXRjaGVyLndhdGNoaW5nLmJlZ2luc1BhdHRlcm4ucmVnZXhwKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMubW9kZWxMaXN0ZW5lcnMuYWRkKHRoaXMubW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKG1vZGVsRXZlbnQgPT4ge1xuXHRcdFx0bGV0IG1hcmtlckNoYW5nZWQ6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdHRoaXMubWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQsXG5cdFx0XHRcdChsYXN0OiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgZTogcmVhZG9ubHkgVVJJW10pID0+IChsYXN0ID8/IFtdKS5jb25jYXQoZSksXG5cdFx0XHRcdDUwMCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRydWVcblx0XHRcdCkoYXN5bmMgKG1hcmtlckV2ZW50OiByZWFkb25seSBVUklbXSkgPT4ge1xuXHRcdFx0XHRpZiAobWFya2VyRXZlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsRXZlbnRVcmlTdHIgPSBtb2RlbEV2ZW50LnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAoKCFtYXJrZXJFdmVudC5zb21lKHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gbW9kZWxFdmVudFVyaVN0cikpIHx8ICh0aGlzLm1hcmtlclNlcnZpY2UucmVhZCh7IHJlc291cmNlOiBtb2RlbEV2ZW50LnVyaSB9KS5sZW5ndGggIT09IDApKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG9sZExpbmVzID0gQXJyYXkuZnJvbSh0aGlzLmxpbmVzKTtcblx0XHRcdFx0Zm9yIChjb25zdCBsaW5lIG9mIG9sZExpbmVzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wcm9jZXNzTGluZUludGVybmFsKGxpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRGlzcG9zZSB0aGUgZGVib3VuY2VkIGxpc3RlbmVyIGFmdGVyIHRpbWVvdXQgLSBubyBuZWVkIHRvIHJlZ2lzdGVyIGl0IHNpbmNlXG5cdFx0XHQvLyBpdCdzIG9ubHkgdXNlZCB0ZW1wb3JhcmlseSBhbmQgd2lsbCBiZSBkaXNwb3NlZCBiZWxvd1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmIChtYXJrZXJDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Y29uc3QgX21hcmtlckNoYW5nZWQgPSBtYXJrZXJDaGFuZ2VkO1xuXHRcdFx0XHRcdG1hcmtlckNoYW5nZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0X21hcmtlckNoYW5nZWQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCA2MDApO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhYm91dFRvU3RhcnQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBiYWNrZ3JvdW5kIG9mIHRoaXMuYmFja2dyb3VuZFBhdHRlcm5zKSB7XG5cdFx0XHRpZiAoYmFja2dyb3VuZC5tYXRjaGVyLndhdGNoaW5nICYmIGJhY2tncm91bmQubWF0Y2hlci53YXRjaGluZy5hY3RpdmVPblN0YXJ0KSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5hZGQoYmFja2dyb3VuZC5rZXkpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUoSVByb2JsZW1Db2xsZWN0b3JFdmVudC5jcmVhdGUoUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZC5CYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucykpO1xuXHRcdFx0XHR0aGlzLnJlY29yZFJlc291cmNlc1RvQ2xlYW4oYmFja2dyb3VuZC5tYXRjaGVyLm93bmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcHJvY2Vzc0xpbmVJbnRlcm5hbChsaW5lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYXdhaXQgdGhpcy50cnlCZWdpbihsaW5lKSB8fCB0aGlzLnRyeUZpbmlzaChsaW5lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxpbmVzLnB1c2gobGluZSk7XG5cdFx0Y29uc3QgbWFya2VyTWF0Y2ggPSB0aGlzLnRyeUZpbmRNYXJrZXIobGluZSk7XG5cdFx0aWYgKCFtYXJrZXJNYXRjaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IG1hcmtlck1hdGNoLnJlc291cmNlO1xuXHRcdGNvbnN0IG93bmVyID0gbWFya2VyTWF0Y2guZGVzY3JpcHRpb24ub3duZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2VBc1N0cmluZyA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5yZW1vdmVSZXNvdXJjZVRvQ2xlYW4ob3duZXIsIHJlc291cmNlQXNTdHJpbmcpO1xuXHRcdGNvbnN0IHNob3VsZEFwcGx5TWF0Y2ggPSBhd2FpdCB0aGlzLnNob3VsZEFwcGx5TWF0Y2gobWFya2VyTWF0Y2gpO1xuXHRcdGlmIChzaG91bGRBcHBseU1hdGNoKSB7XG5cdFx0XHR0aGlzLnJlY29yZE1hcmtlcihtYXJrZXJNYXRjaC5tYXJrZXIsIG93bmVyLCByZXNvdXJjZUFzU3RyaW5nKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRPd25lciAhPT0gb3duZXIgfHwgdGhpcy5jdXJyZW50UmVzb3VyY2UgIT09IHJlc291cmNlQXNTdHJpbmcpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRNYXJrZXJzRm9yQ3VycmVudFJlc291cmNlKCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudE93bmVyID0gb3duZXI7XG5cdFx0XHRcdHRoaXMuY3VycmVudFJlc291cmNlID0gcmVzb3VyY2VBc1N0cmluZztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9yY2VEZWxpdmVyeSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlcG9ydE1hcmtlcnNGb3JDdXJyZW50UmVzb3VyY2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5QmVnaW4obGluZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHJlc3VsdCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgYmFja2dyb3VuZCBvZiB0aGlzLmJhY2tncm91bmRQYXR0ZXJucykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGJhY2tncm91bmQuYmVnaW4ucmVnZXhwLmV4ZWMobGluZSk7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuXHRcdFx0aWYgKGVsYXBzZWQgPiA1KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZT8udHJhY2UoYFByb2JsZW1NYXRjaGVyOiBzbG93IGJlZ2luIHJlZ2V4cCB0b29rICR7ZWxhcHNlZH1tcyB0byBleGVjdXRlYCwgYmFja2dyb3VuZC5iZWdpbi5yZWdleHAuc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVCYWNrZ3JvdW5kTWF0Y2hlcnMuaGFzKGJhY2tncm91bmQua2V5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5hZGQoYmFja2dyb3VuZC5rZXkpO1xuXHRcdFx0XHRyZXN1bHQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZpbmRGaXJzdE1hdGNoLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5saW5lcyA9IFtdO1xuXHRcdFx0XHR0aGlzLmxpbmVzLnB1c2gobGluZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShJUHJvYmxlbUNvbGxlY3RvckV2ZW50LmNyZWF0ZShQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nQmVnaW5zKSk7XG5cdFx0XHRcdHRoaXMuY2xlYW5NYXJrZXJDYWNoZXMoKTtcblx0XHRcdFx0dGhpcy5yZXNldEN1cnJlbnRSZXNvdXJjZSgpO1xuXHRcdFx0XHRjb25zdCBvd25lciA9IGJhY2tncm91bmQubWF0Y2hlci5vd25lcjtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IG1hdGNoZXNbYmFja2dyb3VuZC5iZWdpbi5maWxlIV07XG5cdFx0XHRcdGlmIChmaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBnZXRSZXNvdXJjZShmaWxlLCBiYWNrZ3JvdW5kLm1hdGNoZXIpO1xuXHRcdFx0XHRcdHRoaXMucmVjb3JkUmVzb3VyY2VUb0NsZWFuKG93bmVyLCBhd2FpdCByZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZWNvcmRSZXNvdXJjZXNUb0NsZWFuKG93bmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSB0cnlGaW5pc2gobGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlc3VsdCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgYmFja2dyb3VuZCBvZiB0aGlzLmJhY2tncm91bmRQYXR0ZXJucykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGJhY2tncm91bmQuZW5kLnJlZ2V4cC5leGVjKGxpbmUpO1xuXHRcdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRcdGlmIChlbGFwc2VkID4gNSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2U/LnRyYWNlKGBQcm9ibGVtTWF0Y2hlcjogc2xvdyBlbmQgcmVnZXhwIHRvb2sgJHtlbGFwc2VkfW1zIHRvIGV4ZWN1dGVgLCBiYWNrZ3JvdW5kLmVuZC5yZWdleHAuc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9udW1iZXJPZk1hdGNoZXMgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRGaW5kRXJyb3JzLmZpcmUodGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyBvd25lcjogYmFja2dyb3VuZC5tYXRjaGVyLm93bmVyIH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RJbnZhbGlkYXRlTGFzdE1hcmtlci5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5kZWxldGUoYmFja2dyb3VuZC5rZXkpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXNldEN1cnJlbnRSZXNvdXJjZSgpO1xuXHRcdFx0XHRcdGNvbnN0IGNhcHR1cmVkVmFyaWFibGVzID0gbWF0Y2hlcy5ncm91cHMgPyBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKG1hdGNoZXMuZ3JvdXBzKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKElQcm9ibGVtQ29sbGVjdG9yRXZlbnQuY3JlYXRlKFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdFbmRzLCBjYXB0dXJlZFZhcmlhYmxlcykpO1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5saW5lcy5wdXNoKGxpbmUpO1xuXHRcdFx0XHRcdGNvbnN0IG93bmVyID0gYmFja2dyb3VuZC5tYXRjaGVyLm93bmVyO1xuXHRcdFx0XHRcdHRoaXMuY2xlYW5NYXJrZXJzKG93bmVyKTtcblx0XHRcdFx0XHR0aGlzLmNsZWFuTWFya2VyQ2FjaGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRDdXJyZW50UmVzb3VyY2UoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBvcnRNYXJrZXJzRm9yQ3VycmVudFJlc291cmNlKCk7XG5cdFx0dGhpcy5jdXJyZW50T3duZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50UmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydE1hcmtlcnNGb3JDdXJyZW50UmVzb3VyY2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudE93bmVyICYmIHRoaXMuY3VycmVudFJlc291cmNlKSB7XG5cdFx0XHR0aGlzLmRlbGl2ZXJNYXJrZXJzUGVyT3duZXJBbmRSZXNvdXJjZSh0aGlzLmN1cnJlbnRPd25lciwgdGhpcy5jdXJyZW50UmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkb25lKCk6IHZvaWQge1xuXHRcdFsuLi50aGlzLmFwcGx5VG9CeU93bmVyLmtleXMoKV0uZm9yRWFjaChvd25lciA9PiB7XG5cdFx0XHR0aGlzLnJlY29yZFJlc291cmNlc1RvQ2xlYW4ob3duZXIpO1xuXHRcdH0pO1xuXHRcdHN1cGVyLmRvbmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1dhdGNoaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmJhY2tncm91bmRQYXR0ZXJucy5sZW5ndGggPiAwO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBc0IsaUJBQWlCLGtCQUFrQjtBQUl6RCxTQUF1QixtQkFBa0QsYUFBK0IsbUJBQW1CO0FBQzNILFNBQXlCLG1CQUE0QztBQUNyRSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGlCQUFpQjtBQUduQixJQUFXLDRCQUFYLGtCQUFXQSwrQkFBWDtBQUNOLEVBQUFBLDJCQUFBLGdDQUE2QjtBQUM3QixFQUFBQSwyQkFBQSw4QkFBMkI7QUFGVixTQUFBQTtBQUFBLEdBQUE7QUFVbEIsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNEJBQVY7QUFDUSxXQUFTLE9BQU8sTUFBaUMsbUJBQWlEO0FBQ3hHLFdBQU8sT0FBTyxPQUFPLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUFBLEVBQ2pEO0FBRk8sRUFBQUEsd0JBQVM7QUFBQSxHQURQO0FBVUgsTUFBZSxpQ0FBaUMsV0FBa0M7QUFBQSxFQWdDeEYsWUFBNEIsaUJBQTZDLGVBQXlDLGNBQTZCLGFBQStDLFlBQTBCO0FBQ3ZOLFVB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O0FBQy9DLFlBQU0sVUFBVSxLQUFLLElBQUksSUFBSTtBQUM3QixVQUFJLFVBQVUsR0FBRztBQUNoQixhQUFLLFlBQVksTUFBTSx3Q0FBd0MsT0FBTyxpQkFBaUIsV0FBVyxJQUFJLE9BQU8sTUFBTTtBQUFBLE1BQ3BIO0FBQ0EsVUFBSSxTQUFTO0FBQ1osWUFBSSxLQUFLLG1CQUFtQixHQUFHO0FBQzlCLGVBQUssaUJBQWlCLEtBQUssS0FBSyxjQUFjLEtBQUssRUFBRSxPQUFPLFdBQVcsUUFBUSxNQUFNLENBQUMsQ0FBQztBQUFBLFFBQ3hGLE9BQU87QUFDTixlQUFLLGtDQUFrQyxLQUFLO0FBQUEsUUFDN0M7QUFDQSxZQUFJLEtBQUssMEJBQTBCLE9BQU8sV0FBVyxHQUFHLEdBQUc7QUFDMUQsZUFBSyxxQkFBcUI7QUFDMUIsZ0JBQU0sb0JBQW9CLFFBQVEsU0FBUyxJQUFJLElBQUksT0FBTyxRQUFRLFFBQVEsTUFBTSxDQUFDLElBQUk7QUFDckYsZUFBSyxrQkFBa0IsS0FBSyx1QkFBdUIsT0FBTywyREFBb0QsaUJBQWlCLENBQUM7QUFDaEksbUJBQVM7QUFDVCxlQUFLLE1BQU0sS0FBSyxJQUFJO0FBQ3BCLGdCQUFNLFFBQVEsV0FBVyxRQUFRO0FBQ2pDLGVBQUssYUFBYSxLQUFLO0FBQ3ZCLGVBQUssa0JBQWtCO0FBQUEsUUFDeEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsU0FBSyxnQ0FBZ0M7QUFDckMsU0FBSyxlQUFlO0FBQ3BCLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLGtDQUF3QztBQUMvQyxRQUFJLEtBQUssZ0JBQWdCLEtBQUssaUJBQWlCO0FBQzlDLFdBQUssa0NBQWtDLEtBQUssY0FBYyxLQUFLLGVBQWU7QUFBQSxJQUMvRTtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixPQUFhO0FBQzVCLEtBQUMsR0FBRyxLQUFLLGVBQWUsS0FBSyxDQUFDLEVBQUUsUUFBUSxXQUFTO0FBQ2hELFdBQUssdUJBQXVCLEtBQUs7QUFBQSxJQUNsQyxDQUFDO0FBQ0QsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBRU8sYUFBc0I7QUFDNUIsV0FBTyxLQUFLLG1CQUFtQixTQUFTO0FBQUEsRUFDekM7QUFDRDsiLAogICJuYW1lcyI6IFsiUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZCIsICJJUHJvYmxlbUNvbGxlY3RvckV2ZW50IiwgIlByb2JsZW1IYW5kbGluZ1N0cmF0ZWd5Il0KfQo=
