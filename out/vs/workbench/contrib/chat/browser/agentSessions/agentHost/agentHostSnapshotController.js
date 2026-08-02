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
import { Sequencer } from "../../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { constObservable, derived, derivedOpts, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { FileEditKind, ToolCallStatus } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ChatEditingSessionState } from "../../../common/editing/chatEditingService.js";
import { fileEditsToExternalEdits } from "./stateToProgressAdapter.js";
let AgentHostSnapshotController = class extends Disposable {
  constructor(chatSessionResource, _connectionAuthority, _logService, _fileService) {
    super();
    this.chatSessionResource = chatSessionResource;
    this._connectionAuthority = _connectionAuthority;
    this._logService = _logService;
    this._fileService = _fileService;
    this.supportsKeepUndo = false;
    this.isGlobalEditingSession = false;
    this.state = constObservable(ChatEditingSessionState.Idle);
    this.entries = constObservable([]);
    this.requestDisablement = derivedOpts(
      { equalsFn: (a, b) => a.length === b.length && a.every((v, i) => v.requestId === b[i].requestId) },
      (reader) => {
        const currentIdx = this._currentCheckpointIndex.read(reader);
        const disabled = [];
        for (let i = currentIdx + 1; i < this._checkpoints.length; i++) {
          disabled.push({ requestId: this._checkpoints[i].requestId });
        }
        return disabled;
      }
    );
    this.canUndo = derived(this, (r) => this._currentCheckpointIndex.read(r) >= 0);
    this.canRedo = derived(this, (r) => this._currentCheckpointIndex.read(r) < this._checkpoints.length - 1);
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._checkpoints = [];
    this._currentCheckpointIndex = observableValue(this, -1);
    this._undoRedoSequencer = new Sequencer();
  }
  // ---- Hydration from protocol state --------------------------------------
  /**
   * Ensures a checkpoint exists for the given request. Called at the start
   * of every turn (and during history hydration) so {@link requestDisablement}
   * and {@link restoreSnapshot} can reference every request, even ones that
   * produce no file edits.
   *
   * Splices away stale checkpoints past the current index (undo branch
   * semantics) when a new request arrives after a checkpoint restore.
   */
  ensureRequestCheckpoint(requestId) {
    if (this._checkpoints.some((cp) => cp.requestId === requestId)) {
      return;
    }
    const currentIdx = this._currentCheckpointIndex.get();
    if (currentIdx < this._checkpoints.length - 1) {
      this._checkpoints.splice(currentIdx + 1);
    }
    this._checkpoints.push({ requestId, edits: [], seenToolCallIds: /* @__PURE__ */ new Set() });
    transaction((tx) => {
      this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
    });
  }
  /**
   * Folds a completed tool call's file edits into the checkpoint for the
   * given request. Idempotent on `toolCallId`.
   */
  addToolCallEdits(requestId, tc) {
    if (tc.status !== ToolCallStatus.Completed) {
      return;
    }
    this.ensureRequestCheckpoint(requestId);
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp || cp.seenToolCallIds.has(tc.toolCallId)) {
      return;
    }
    cp.seenToolCallIds.add(tc.toolCallId);
    const fileEdits = fileEditsToExternalEdits(tc);
    if (fileEdits.length === 0) {
      return;
    }
    const authority = this._connectionAuthority;
    for (const edit of fileEdits) {
      const resource = toAgentHostUri(edit.resource, authority);
      const entry = {
        kind: edit.kind,
        resource,
        originalResource: edit.originalResource ? toAgentHostUri(edit.originalResource, authority) : void 0,
        beforeContentUri: edit.beforeContentUri ? toAgentHostUri(edit.beforeContentUri, authority) : void 0,
        afterContentUri: edit.afterContentUri ? toAgentHostUri(edit.afterContentUri, authority) : void 0,
        undoStopId: edit.undoStopId,
        diff: edit.diff
      };
      const existingIdx = cp.edits.findIndex((e) => e.resource.toString() === resource.toString());
      if (existingIdx < 0) {
        cp.edits.push(entry);
      } else {
        cp.edits[existingIdx] = mergeFileEdit(cp.edits[existingIdx], entry);
      }
    }
  }
  // ---- Snapshots ----------------------------------------------------------
  _findCheckpointIndex(requestId) {
    return this._checkpoints.findIndex((cp) => cp.requestId === requestId);
  }
  async restoreSnapshot(requestId, _stopId) {
    return this._undoRedoSequencer.queue(async () => {
      const cpIdx = this._findCheckpointIndex(requestId);
      if (cpIdx < 0) {
        this._logService.warn(`[AgentHostSnapshotController] No checkpoint found for requestId=${requestId}`);
        return;
      }
      await this._navigateToCheckpointIndex(cpIdx - 1);
    });
  }
  /**
   * Steps a single checkpoint backwards, undoing the edits of the current
   * checkpoint. The "Undo" UI invokes this once per click.
   */
  async undoInteraction() {
    return this._undoRedoSequencer.queue(async () => {
      const currentIdx = this._currentCheckpointIndex.get();
      if (currentIdx < 0) {
        return;
      }
      await this._navigateToCheckpointIndex(currentIdx - 1);
    });
  }
  /**
   * Steps a single checkpoint forwards, redoing the edits of the next
   * checkpoint.
   *
   * Implementing this is essential: the "Redo" action repeatedly calls this
   * while {@link canRedo} is `true`, so a no-op implementation would spin
   * forever and hang the window.
   */
  async redoInteraction() {
    return this._undoRedoSequencer.queue(async () => {
      const currentIdx = this._currentCheckpointIndex.get();
      if (currentIdx >= this._checkpoints.length - 1) {
        return;
      }
      await this._navigateToCheckpointIndex(currentIdx + 1);
    });
  }
  /**
   * Moves the on-disk file state and the checkpoint cursor to `targetIdx`,
   * writing each crossed checkpoint's before/after content. Must run inside
   * the {@link _undoRedoSequencer} to avoid racing writes.
   */
  async _navigateToCheckpointIndex(targetIdx) {
    const currentIdx = this._currentCheckpointIndex.get();
    if (targetIdx < currentIdx) {
      for (let i = currentIdx; i > targetIdx; i--) {
        await this._writeCheckpointContent(this._checkpoints[i], "before");
      }
    } else if (targetIdx > currentIdx) {
      for (let i = currentIdx + 1; i <= targetIdx; i++) {
        await this._writeCheckpointContent(this._checkpoints[i], "after");
      }
    }
    transaction((tx) => {
      this._currentCheckpointIndex.set(targetIdx, tx);
    });
  }
  getSnapshotUri(requestId, uri, _stopId) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp || !cp.edits.some((e) => e.resource.toString() === uri.toString())) {
      return void 0;
    }
    return URI.from({
      scheme: Schemas.chatEditingSnapshotScheme,
      path: uri.path,
      query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: "" })
    });
  }
  async getSnapshotContents(requestId, uri, _stopId) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    if (!cp) {
      return void 0;
    }
    const uriStr = uri.toString();
    let edit;
    for (let i = cp.edits.length - 1; i >= 0; i--) {
      if (cp.edits[i].resource.toString() === uriStr) {
        edit = cp.edits[i];
        break;
      }
    }
    if (!edit) {
      return void 0;
    }
    try {
      if (!edit.afterContentUri) {
        return VSBuffer.fromByteArray([]);
      }
      const content = await this._fileService.readFile(edit.afterContentUri);
      return content.value;
    } catch (err) {
      this._logService.warn(`[AgentHostSnapshotController] Failed to fetch snapshot content`, err);
      return void 0;
    }
  }
  async getSnapshotModel(_requestId, _undoStop, _snapshotUri) {
    return null;
  }
  hasEditsInRequest(requestId, _reader) {
    const cp = this._checkpoints.find((c) => c.requestId === requestId);
    return !!cp && cp.edits.length > 0;
  }
  // ---- Unsupported / no-op (agent host owns edits server-side) ------------
  async show(_previousChanges) {
  }
  getEntry(_uri) {
    return void 0;
  }
  readEntry(_uri, _reader) {
    return void 0;
  }
  async accept(..._uris) {
  }
  async reject(..._uris) {
  }
  getEntryDiffBetweenStops(_uri, _requestId, _stopId) {
    return void 0;
  }
  getEntryDiffBetweenRequests(_uri, _startRequestId, _stopRequestId) {
    return constObservable(void 0);
  }
  getDiffsForFilesInSession() {
    return constObservable([]);
  }
  getDiffsForFilesInRequest(_requestId) {
    return constObservable([]);
  }
  getDiffForSession() {
    return constObservable({ added: 0, removed: 0 });
  }
  async triggerExplanationGeneration() {
  }
  clearExplanations() {
  }
  hasExplanations() {
    return false;
  }
  startStreamingEdits(_resource, _responseModel, _inUndoStop) {
    throw new Error("Not supported for agent host sessions");
  }
  applyWorkspaceEdit(_edit, _responseModel, _undoStopId) {
    throw new Error("Not supported for agent host sessions");
  }
  async startExternalEdits(_responseModel, _operationId, _resources, _undoStopId, _contentFor) {
    throw new Error("Not supported for agent host sessions");
  }
  async stopExternalEdits(_responseModel, _operationId, _contentFor) {
    throw new Error("Not supported for agent host sessions");
  }
  // ---- Stop / Dispose -----------------------------------------------------
  async stop(_clearState) {
    this.dispose();
  }
  dispose() {
    this._onDidDispose.fire();
    super.dispose();
  }
  // ---- Private helpers ----------------------------------------------------
  async _writeCheckpointContent(checkpoint, direction) {
    const ops = checkpoint.edits.map(async (edit) => {
      try {
        if (direction === "before") {
          switch (edit.kind) {
            case FileEditKind.Create:
              await this._fileService.del(edit.resource);
              break;
            case FileEditKind.Delete:
              if (edit.beforeContentUri) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Rename:
              if (edit.originalResource) {
                await this._fileService.move(edit.resource, edit.originalResource, true);
              }
              if (edit.beforeContentUri && edit.originalResource) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.originalResource, content.value);
              }
              break;
            case FileEditKind.Edit:
              if (edit.beforeContentUri) {
                const content = await this._fileService.readFile(edit.beforeContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
          }
        } else {
          switch (edit.kind) {
            case FileEditKind.Create:
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Delete:
              await this._fileService.del(edit.resource);
              break;
            case FileEditKind.Rename:
              if (edit.originalResource) {
                await this._fileService.move(edit.originalResource, edit.resource, true);
              }
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
            case FileEditKind.Edit:
              if (edit.afterContentUri) {
                const content = await this._fileService.readFile(edit.afterContentUri);
                await this._fileService.writeFile(edit.resource, content.value);
              }
              break;
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentHostSnapshotController] Failed to ${direction === "before" ? "undo" : "redo"} ${edit.kind} for ${edit.resource.toString()}`, err);
      }
    });
    await Promise.all(ops);
  }
};
AgentHostSnapshotController = __decorateClass([
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService)
], AgentHostSnapshotController);
function mergeFileEdit(prev, next) {
  const startsAbsent = prev.kind === FileEditKind.Create;
  const endsAbsent = next.kind === FileEditKind.Delete;
  let kind;
  if (startsAbsent && endsAbsent) {
    kind = FileEditKind.Edit;
  } else if (startsAbsent) {
    kind = FileEditKind.Create;
  } else if (endsAbsent) {
    kind = FileEditKind.Delete;
  } else {
    kind = FileEditKind.Edit;
  }
  return {
    kind,
    resource: next.resource,
    // Renames within a single request are uncommon; if the second edit
    // is itself a rename keep its originalResource, otherwise carry
    // forward the first one.
    originalResource: next.originalResource ?? prev.originalResource,
    beforeContentUri: prev.beforeContentUri,
    afterContentUri: next.afterContentUri,
    undoStopId: prev.undoStopId,
    diff: next.diff ?? prev.diff
  };
}
export {
  AgentHostSnapshotController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIElSZWFkZXIsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0S2luZCwgVG9vbENhbGxTdGF0dXMsIHR5cGUgVG9vbENhbGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3MsIElDaGF0V29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgSUVkaXRTZXNzaW9uRGlmZlN0YXRzLCBJRWRpdFNlc3Npb25FbnRyeURpZmYsIElNb2RpZmllZEZpbGVFbnRyeSwgSVN0cmVhbWluZ0VkaXRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdERpc2FibGVtZW50LCBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IGZpbGVFZGl0c1RvRXh0ZXJuYWxFZGl0cywgdHlwZSBJVG9vbENhbGxGaWxlRWRpdCB9IGZyb20gJy4vc3RhdGVUb1Byb2dyZXNzQWRhcHRlci5qcyc7XG5cbi8qKlxuICogT25lIGNoZWNrcG9pbnQgcGVyIHJlcXVlc3QuIEFjY3VtdWxhdGVzIHRoZSBiZWZvcmUvYWZ0ZXIgY29udGVudCBVUklzIG9mXG4gKiBldmVyeSBjb21wbGV0ZWQgdG9vbCBjYWxsJ3MgZmlsZSBlZGl0cyBzbyB0aGUgcmVxdWVzdCdzIGVkaXRzIGNhbiBiZVxuICogdW5kb25lL3JlZG9uZSBvbiBkaXNrIGR1cmluZyB7QGxpbmsgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLnJlc3RvcmVTbmFwc2hvdH0uXG4gKi9cbmludGVyZmFjZSBJQWdlbnRIb3N0Q2hlY2twb2ludCB7XG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSBlZGl0czogSVRvb2xDYWxsRmlsZUVkaXRbXTtcblx0LyoqIFRvb2wtY2FsbCBJRHMgd2hvc2UgZWRpdHMgaGF2ZSBhbHJlYWR5IGJlZW4gZm9sZGVkIGludG8gYGVkaXRzYC4gKi9cblx0cmVhZG9ubHkgc2VlblRvb2xDYWxsSWRzOiBTZXQ8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBBIHRoaW4ge0BsaW5rIElDaGF0RWRpdGluZ1Nlc3Npb259IGZvciBhZ2VudCBob3N0IHNlc3Npb25zLiBUaGUgYWdlbnQgaG9zdFxuICogaGFzIGl0cyBvd24gZGlmZiAvIGNoYW5nZXNldCBtYWNoaW5lcnkgYW5kIHJlbmRlcnMgZmlsZSBlZGl0cyB2aWEgdGhlXG4gKiBkZWRpY2F0ZWQge0BsaW5rIElDaGF0RXh0ZXJuYWxFZGl0fSBwcm9ncmVzcyBwYXJ0IFx1MjAxNCBzbyB0aGlzIHNlc3Npb24gb25seVxuICogbmVlZHMgdG8gc3VwcG9ydCB0aGUgY2hhdC1sZXZlbCBcInJlc3RvcmUgdG8gY2hlY2twb2ludFwiIFVYLlxuICpcbiAqIENvbmNyZXRlbHkgaXQgaW1wbGVtZW50czpcbiAqIC0ge0BsaW5rIHJlc3RvcmVTbmFwc2hvdH0gKHdyaXRlcyBiZWZvcmUvYWZ0ZXIgY29udGVudCB0byBkaXNrKVxuICogLSB7QGxpbmsgcmVxdWVzdERpc2FibGVtZW50fSAoc28gZGlzYWJsZWQtcmVxdWVzdCBVSSB3b3JrcyBhZnRlciByZXN0b3JlKVxuICogLSB7QGxpbmsgZ2V0U25hcHNob3RVcml9IC8ge0BsaW5rIGdldFNuYXBzaG90Q29udGVudHN9IChzbyBjaGVja3BvaW50IGRpZmZcbiAqICAgdmlld2VycyBjYW4gcmVzb2x2ZSBoaXN0b3JpY2FsIGNvbnRlbnQpXG4gKlxuICogRXZlcnl0aGluZyBlbHNlIGlzIGEgbm8tb3AgLyBlbXB0eSBvYnNlcnZhYmxlIC8gYHVuZGVmaW5lZGAuIEluIHBhcnRpY3VsYXI6XG4gKiAtIGBlbnRyaWVzYCBpcyBhbHdheXMgZW1wdHkgXHUyMTkyIHRoZSBnbG9iYWwgYWNjZXB0L3JlamVjdCBVSSBkb2Vzbid0IGFwcGVhclxuICogLSBubyBkaWZmIGNvbXB1dGF0aW9uLCBubyBtdWx0aS1kaWZmIGVkaXRvciwgbm8gc3RyZWFtaW5nLWVkaXRzIEFQSXNcbiAqXG4gKiBVbmRvL3JlZG8gZ3JhbnVsYXJpdHkgaXMgcGVyLXJlcXVlc3Q6IGV2ZXJ5IHJlcXVlc3Qgb2NjdXBpZXMgb25lIGNoZWNrcG9pbnRcbiAqIHJlZ2FyZGxlc3Mgb2YgaG93IG1hbnkgdG9vbCBjYWxscyBpdCByYW4uIFRoZSBgc3RvcElkYCBwYXJhbWV0ZXJzIG9uXG4gKiB7QGxpbmsgcmVzdG9yZVNuYXBzaG90fSwge0BsaW5rIGdldFNuYXBzaG90VXJpfSwgYW5kIHtAbGluayBnZXRTbmFwc2hvdENvbnRlbnRzfVxuICogYXJlIGFjY2VwdGVkIGZvciBpbnRlcmZhY2UgY29tcGF0aWJpbGl0eSBidXQgaWdub3JlZC5cbiAqXG4gKiBIeWRyYXRlZCBieSB0aGUgc2Vzc2lvbiBoYW5kbGVyIHZpYSB7QGxpbmsgZW5zdXJlUmVxdWVzdENoZWNrcG9pbnR9IGFuZFxuICoge0BsaW5rIGFkZFRvb2xDYWxsRWRpdHN9IGFzIHR1cm5zIGFuZCB0b29sIGNhbGxzIGFycml2ZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdEVkaXRpbmdTZXNzaW9uIHtcblxuXHRyZWFkb25seSBzdXBwb3J0c0tlZXBVbmRvID0gZmFsc2U7XG5cdHJlYWRvbmx5IGlzR2xvYmFsRWRpdGluZ1Nlc3Npb24gPSBmYWxzZTtcblxuXHRyZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8Q2hhdEVkaXRpbmdTZXNzaW9uU3RhdGU+ID0gY29uc3RPYnNlcnZhYmxlKENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLklkbGUpO1xuXHRyZWFkb25seSBlbnRyaWVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTW9kaWZpZWRGaWxlRW50cnlbXT4gPSBjb25zdE9ic2VydmFibGUoW10pO1xuXG5cdHJlYWRvbmx5IHJlcXVlc3REaXNhYmxlbWVudDogSU9ic2VydmFibGU8SUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnRbXT4gPSBkZXJpdmVkT3B0cyhcblx0XHR7IGVxdWFsc0ZuOiAoYSwgYikgPT4gYS5sZW5ndGggPT09IGIubGVuZ3RoICYmIGEuZXZlcnkoKHYsIGkpID0+IHYucmVxdWVzdElkID09PSBiW2ldLnJlcXVlc3RJZCkgfSxcblx0XHRyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudElkeCA9IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXgucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZGlzYWJsZWQ6IElDaGF0UmVxdWVzdERpc2FibGVtZW50W10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSBjdXJyZW50SWR4ICsgMTsgaSA8IHRoaXMuX2NoZWNrcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGRpc2FibGVkLnB1c2goeyByZXF1ZXN0SWQ6IHRoaXMuX2NoZWNrcG9pbnRzW2ldLnJlcXVlc3RJZCB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkaXNhYmxlZDtcblx0XHR9LFxuXHQpO1xuXG5cdHJlYWRvbmx5IGNhblVuZG86IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gZGVyaXZlZCh0aGlzLCByID0+IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXgucmVhZChyKSA+PSAwKTtcblx0cmVhZG9ubHkgY2FuUmVkbzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSBkZXJpdmVkKHRoaXMsIHIgPT4gdGhpcy5fY3VycmVudENoZWNrcG9pbnRJbmRleC5yZWFkKHIpIDwgdGhpcy5fY2hlY2twb2ludHMubGVuZ3RoIC0gMSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hlY2twb2ludHM6IElBZ2VudEhvc3RDaGVja3BvaW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudENoZWNrcG9pbnRJbmRleCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KHRoaXMsIC0xKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8gLS0tLSBIeWRyYXRpb24gZnJvbSBwcm90b2NvbCBzdGF0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIGEgY2hlY2twb2ludCBleGlzdHMgZm9yIHRoZSBnaXZlbiByZXF1ZXN0LiBDYWxsZWQgYXQgdGhlIHN0YXJ0XG5cdCAqIG9mIGV2ZXJ5IHR1cm4gKGFuZCBkdXJpbmcgaGlzdG9yeSBoeWRyYXRpb24pIHNvIHtAbGluayByZXF1ZXN0RGlzYWJsZW1lbnR9XG5cdCAqIGFuZCB7QGxpbmsgcmVzdG9yZVNuYXBzaG90fSBjYW4gcmVmZXJlbmNlIGV2ZXJ5IHJlcXVlc3QsIGV2ZW4gb25lcyB0aGF0XG5cdCAqIHByb2R1Y2Ugbm8gZmlsZSBlZGl0cy5cblx0ICpcblx0ICogU3BsaWNlcyBhd2F5IHN0YWxlIGNoZWNrcG9pbnRzIHBhc3QgdGhlIGN1cnJlbnQgaW5kZXggKHVuZG8gYnJhbmNoXG5cdCAqIHNlbWFudGljcykgd2hlbiBhIG5ldyByZXF1ZXN0IGFycml2ZXMgYWZ0ZXIgYSBjaGVja3BvaW50IHJlc3RvcmUuXG5cdCAqL1xuXHRlbnN1cmVSZXF1ZXN0Q2hlY2twb2ludChyZXF1ZXN0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIElkZW1wb3RlbnQgb24gZXhpc3RpbmcgcmVxdWVzdHMuXG5cdFx0aWYgKHRoaXMuX2NoZWNrcG9pbnRzLnNvbWUoY3AgPT4gY3AucmVxdWVzdElkID09PSByZXF1ZXN0SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3BsaWNlIHRoZSBmb3J3YXJkIGJyYW5jaCB3aGVuIHN0YXJ0aW5nIGEgYnJhbmQtbmV3IHJlcXVlc3QgYWZ0ZXJcblx0XHQvLyB0aGUgdXNlciByZXN0b3JlZCBhIGNoZWNrcG9pbnQuXG5cdFx0Y29uc3QgY3VycmVudElkeCA9IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXguZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnRJZHggPCB0aGlzLl9jaGVja3BvaW50cy5sZW5ndGggLSAxKSB7XG5cdFx0XHR0aGlzLl9jaGVja3BvaW50cy5zcGxpY2UoY3VycmVudElkeCArIDEpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NoZWNrcG9pbnRzLnB1c2goeyByZXF1ZXN0SWQsIGVkaXRzOiBbXSwgc2VlblRvb2xDYWxsSWRzOiBuZXcgU2V0KCkgfSk7XG5cblx0XHQvLyBBZHZhbmNlIHRoZSBjdXJzb3IgdG8gdGhlIG5ldyBjaGVja3BvaW50LiBPdGhlcndpc2UgdGhlIGp1c3QtYWRkZWRcblx0XHQvLyByZXF1ZXN0IHdvdWxkIGFwcGVhciBpbiByZXF1ZXN0RGlzYWJsZW1lbnQgKGl0IHdvdWxkIHNpdCBmb3J3YXJkIG9mXG5cdFx0Ly8gdGhlIGN1cnNvcikgYW5kIHRoZSBjaGF0IFVJIHdvdWxkIHJlbmRlciBpdCBhcyBhIGRpc2FibGVkIHR1cm4uXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudENoZWNrcG9pbnRJbmRleC5zZXQodGhpcy5fY2hlY2twb2ludHMubGVuZ3RoIC0gMSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvbGRzIGEgY29tcGxldGVkIHRvb2wgY2FsbCdzIGZpbGUgZWRpdHMgaW50byB0aGUgY2hlY2twb2ludCBmb3IgdGhlXG5cdCAqIGdpdmVuIHJlcXVlc3QuIElkZW1wb3RlbnQgb24gYHRvb2xDYWxsSWRgLlxuXHQgKi9cblx0YWRkVG9vbENhbGxFZGl0cyhyZXF1ZXN0SWQ6IHN0cmluZywgdGM6IFRvb2xDYWxsU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KHJlcXVlc3RJZCk7XG5cblx0XHRjb25zdCBjcCA9IHRoaXMuX2NoZWNrcG9pbnRzLmZpbmQoYyA9PiBjLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIWNwIHx8IGNwLnNlZW5Ub29sQ2FsbElkcy5oYXModGMudG9vbENhbGxJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y3Auc2VlblRvb2xDYWxsSWRzLmFkZCh0Yy50b29sQ2FsbElkKTtcblxuXHRcdGNvbnN0IGZpbGVFZGl0cyA9IGZpbGVFZGl0c1RvRXh0ZXJuYWxFZGl0cyh0Yyk7XG5cdFx0aWYgKGZpbGVFZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRob3JpdHkgPSB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5O1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBmaWxlRWRpdHMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdG9BZ2VudEhvc3RVcmkoZWRpdC5yZXNvdXJjZSwgYXV0aG9yaXR5KTtcblx0XHRcdGNvbnN0IGVudHJ5OiBJVG9vbENhbGxGaWxlRWRpdCA9IHtcblx0XHRcdFx0a2luZDogZWRpdC5raW5kLFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZTogZWRpdC5vcmlnaW5hbFJlc291cmNlID8gdG9BZ2VudEhvc3RVcmkoZWRpdC5vcmlnaW5hbFJlc291cmNlLCBhdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50VXJpOiBlZGl0LmJlZm9yZUNvbnRlbnRVcmkgPyB0b0FnZW50SG9zdFVyaShlZGl0LmJlZm9yZUNvbnRlbnRVcmksIGF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFmdGVyQ29udGVudFVyaTogZWRpdC5hZnRlckNvbnRlbnRVcmkgPyB0b0FnZW50SG9zdFVyaShlZGl0LmFmdGVyQ29udGVudFVyaSwgYXV0aG9yaXR5KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kb1N0b3BJZDogZWRpdC51bmRvU3RvcElkLFxuXHRcdFx0XHRkaWZmOiBlZGl0LmRpZmYsXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBNdWx0aXBsZSB0b29sIGNhbGxzIGluIG9uZSByZXF1ZXN0IG1heSB0b3VjaCB0aGUgc2FtZSBmaWxlXG5cdFx0XHQvLyAoZS5nLiBjcmVhdGVcdTIxOTJlZGl0LCBlZGl0XHUyMTkyZGVsZXRlKS4gRm9sZCBlYWNoIG5ldyBlZGl0IGludG8gdGhlXG5cdFx0XHQvLyBwcmlvciBvbmUgZm9yIHRoZSBzYW1lIHJlc291cmNlIHNvIHRoZSBjaGVja3BvaW50IHN0b3JlcyBhXG5cdFx0XHQvLyBzaW5nbGUgbmV0IGJlZm9yZS9hZnRlciBwYWlyIHBlciBmaWxlLiBPdGhlcndpc2Vcblx0XHRcdC8vIF93cml0ZUNoZWNrcG9pbnRDb250ZW50IHdvdWxkIGFwcGx5IGR1cGxpY2F0ZSB3cml0ZXMgaW5cblx0XHRcdC8vIHBhcmFsbGVsIGFuZCByYWNlIHRvIGxlYXZlIHRoZSBmaWxlIGluIGFuIHVuZGVmaW5lZCBzdGF0ZS5cblx0XHRcdGNvbnN0IGV4aXN0aW5nSWR4ID0gY3AuZWRpdHMuZmluZEluZGV4KGUgPT4gZS5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChleGlzdGluZ0lkeCA8IDApIHtcblx0XHRcdFx0Y3AuZWRpdHMucHVzaChlbnRyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjcC5lZGl0c1tleGlzdGluZ0lkeF0gPSBtZXJnZUZpbGVFZGl0KGNwLmVkaXRzW2V4aXN0aW5nSWR4XSwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gU25hcHNob3RzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9maW5kQ2hlY2twb2ludEluZGV4KHJlcXVlc3RJZDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hlY2twb2ludHMuZmluZEluZGV4KGNwID0+IGNwLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmVTbmFwc2hvdChyZXF1ZXN0SWQ6IHN0cmluZywgX3N0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuZG9SZWRvU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNwSWR4ID0gdGhpcy5fZmluZENoZWNrcG9pbnRJbmRleChyZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKGNwSWR4IDwgMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXJdIE5vIGNoZWNrcG9pbnQgZm91bmQgZm9yIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXN0b3JlIHRvIGJlZm9yZSB0aGlzIHJlcXVlc3Q6IHRhcmdldCBvbmUgc2xvdCBiZWZvcmUgaXQuXG5cdFx0XHRhd2FpdCB0aGlzLl9uYXZpZ2F0ZVRvQ2hlY2twb2ludEluZGV4KGNwSWR4IC0gMSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RlcHMgYSBzaW5nbGUgY2hlY2twb2ludCBiYWNrd2FyZHMsIHVuZG9pbmcgdGhlIGVkaXRzIG9mIHRoZSBjdXJyZW50XG5cdCAqIGNoZWNrcG9pbnQuIFRoZSBcIlVuZG9cIiBVSSBpbnZva2VzIHRoaXMgb25jZSBwZXIgY2xpY2suXG5cdCAqL1xuXHRhc3luYyB1bmRvSW50ZXJhY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuZG9SZWRvU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRJZHggPSB0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LmdldCgpO1xuXHRcdFx0aWYgKGN1cnJlbnRJZHggPCAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX25hdmlnYXRlVG9DaGVja3BvaW50SW5kZXgoY3VycmVudElkeCAtIDEpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0ZXBzIGEgc2luZ2xlIGNoZWNrcG9pbnQgZm9yd2FyZHMsIHJlZG9pbmcgdGhlIGVkaXRzIG9mIHRoZSBuZXh0XG5cdCAqIGNoZWNrcG9pbnQuXG5cdCAqXG5cdCAqIEltcGxlbWVudGluZyB0aGlzIGlzIGVzc2VudGlhbDogdGhlIFwiUmVkb1wiIGFjdGlvbiByZXBlYXRlZGx5IGNhbGxzIHRoaXNcblx0ICogd2hpbGUge0BsaW5rIGNhblJlZG99IGlzIGB0cnVlYCwgc28gYSBuby1vcCBpbXBsZW1lbnRhdGlvbiB3b3VsZCBzcGluXG5cdCAqIGZvcmV2ZXIgYW5kIGhhbmcgdGhlIHdpbmRvdy5cblx0ICovXG5cdGFzeW5jIHJlZG9JbnRlcmFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdW5kb1JlZG9TZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudElkeCA9IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXguZ2V0KCk7XG5cdFx0XHRpZiAoY3VycmVudElkeCA+PSB0aGlzLl9jaGVja3BvaW50cy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX25hdmlnYXRlVG9DaGVja3BvaW50SW5kZXgoY3VycmVudElkeCArIDEpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIHRoZSBvbi1kaXNrIGZpbGUgc3RhdGUgYW5kIHRoZSBjaGVja3BvaW50IGN1cnNvciB0byBgdGFyZ2V0SWR4YCxcblx0ICogd3JpdGluZyBlYWNoIGNyb3NzZWQgY2hlY2twb2ludCdzIGJlZm9yZS9hZnRlciBjb250ZW50LiBNdXN0IHJ1biBpbnNpZGVcblx0ICogdGhlIHtAbGluayBfdW5kb1JlZG9TZXF1ZW5jZXJ9IHRvIGF2b2lkIHJhY2luZyB3cml0ZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9uYXZpZ2F0ZVRvQ2hlY2twb2ludEluZGV4KHRhcmdldElkeDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudElkeCA9IHRoaXMuX2N1cnJlbnRDaGVja3BvaW50SW5kZXguZ2V0KCk7XG5cdFx0aWYgKHRhcmdldElkeCA8IGN1cnJlbnRJZHgpIHtcblx0XHRcdC8vIFVuZG8gZm9yd2FyZCBjaGVja3BvaW50c1xuXHRcdFx0Zm9yIChsZXQgaSA9IGN1cnJlbnRJZHg7IGkgPiB0YXJnZXRJZHg7IGktLSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNoZWNrcG9pbnRDb250ZW50KHRoaXMuX2NoZWNrcG9pbnRzW2ldLCAnYmVmb3JlJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0YXJnZXRJZHggPiBjdXJyZW50SWR4KSB7XG5cdFx0XHQvLyBSZWRvIHRvIHJlYWNoIHRoZSB0YXJnZXRcblx0XHRcdGZvciAobGV0IGkgPSBjdXJyZW50SWR4ICsgMTsgaSA8PSB0YXJnZXRJZHg7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNoZWNrcG9pbnRDb250ZW50KHRoaXMuX2NoZWNrcG9pbnRzW2ldLCAnYWZ0ZXInKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2hlY2twb2ludEluZGV4LnNldCh0YXJnZXRJZHgsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdGdldFNuYXBzaG90VXJpKHJlcXVlc3RJZDogc3RyaW5nLCB1cmk6IFVSSSwgX3N0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjcCA9IHRoaXMuX2NoZWNrcG9pbnRzLmZpbmQoYyA9PiBjLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIWNwIHx8ICFjcC5lZGl0cy5zb21lKGUgPT4gZS5yZXNvdXJjZS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuY2hhdEVkaXRpbmdTbmFwc2hvdFNjaGVtZSxcblx0XHRcdHBhdGg6IHVyaS5wYXRoLFxuXHRcdFx0cXVlcnk6IEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvbjogdGhpcy5jaGF0U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHJlcXVlc3RJZCwgdW5kb1N0b3A6ICcnIH0pLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0U25hcHNob3RDb250ZW50cyhyZXF1ZXN0SWQ6IHN0cmluZywgdXJpOiBVUkksIF9zdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjcCA9IHRoaXMuX2NoZWNrcG9pbnRzLmZpbmQoYyA9PiBjLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIWNwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cmlTdHIgPSB1cmkudG9TdHJpbmcoKTtcblx0XHQvLyBVc2UgdGhlIGxhc3QgZWRpdCBmb3IgdGhpcyBmaWxlIGluIHRoZSByZXF1ZXN0IFx1MjAxNCB0aGF0J3MgdGhlXG5cdFx0Ly8gXCJhZnRlci1jb250ZW50XCIgdGhlIGRpZmYgdmlld2VyIHdhbnRzIHRvIGRpc3BsYXkuXG5cdFx0bGV0IGVkaXQ6IElUb29sQ2FsbEZpbGVFZGl0IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSBjcC5lZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKGNwLmVkaXRzW2ldLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHVyaVN0cikge1xuXHRcdFx0XHRlZGl0ID0gY3AuZWRpdHNbaV07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWVkaXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWVkaXQuYWZ0ZXJDb250ZW50VXJpKSB7XG5cdFx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tQnl0ZUFycmF5KFtdKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0LmFmdGVyQ29udGVudFVyaSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlcl0gRmFpbGVkIHRvIGZldGNoIHNuYXBzaG90IGNvbnRlbnRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRTbmFwc2hvdE1vZGVsKF9yZXF1ZXN0SWQ6IHN0cmluZywgX3VuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQsIF9zbmFwc2hvdFVyaTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aGFzRWRpdHNJblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIF9yZWFkZXI/OiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY3AgPSB0aGlzLl9jaGVja3BvaW50cy5maW5kKGMgPT4gYy5yZXF1ZXN0SWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0cmV0dXJuICEhY3AgJiYgY3AuZWRpdHMubGVuZ3RoID4gMDtcblx0fVxuXG5cdC8vIC0tLS0gVW5zdXBwb3J0ZWQgLyBuby1vcCAoYWdlbnQgaG9zdCBvd25zIGVkaXRzIHNlcnZlci1zaWRlKSAtLS0tLS0tLS0tLS1cblxuXHRhc3luYyBzaG93KF9wcmV2aW91c0NoYW5nZXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vLW9wICovIH1cblx0Z2V0RW50cnkoX3VyaTogVVJJKTogSU1vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWFkRW50cnkoX3VyaTogVVJJLCBfcmVhZGVyOiBJUmVhZGVyKTogSU1vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBhY2NlcHQoLi4uX3VyaXM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7IC8qIG5vLW9wICovIH1cblx0YXN5bmMgcmVqZWN0KC4uLl91cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4geyAvKiBuby1vcCAqLyB9XG5cdGdldEVudHJ5RGlmZkJldHdlZW5TdG9wcyhfdXJpOiBVUkksIF9yZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgX3N0b3BJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSU9ic2VydmFibGU8SUVkaXRTZXNzaW9uRW50cnlEaWZmIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Z2V0RW50cnlEaWZmQmV0d2VlblJlcXVlc3RzKF91cmk6IFVSSSwgX3N0YXJ0UmVxdWVzdElkOiBzdHJpbmcsIF9zdG9wUmVxdWVzdElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25FbnRyeURpZmYgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpOyB9XG5cdGdldERpZmZzRm9yRmlsZXNJblNlc3Npb24oKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSUVkaXRTZXNzaW9uRW50cnlEaWZmW10+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZShbXSk7IH1cblx0Z2V0RGlmZnNGb3JGaWxlc0luUmVxdWVzdChfcmVxdWVzdElkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXT4geyByZXR1cm4gY29uc3RPYnNlcnZhYmxlKFtdKTsgfVxuXHRnZXREaWZmRm9yU2Vzc2lvbigpOiBJT2JzZXJ2YWJsZTxJRWRpdFNlc3Npb25EaWZmU3RhdHM+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh7IGFkZGVkOiAwLCByZW1vdmVkOiAwIH0pOyB9XG5cblx0YXN5bmMgdHJpZ2dlckV4cGxhbmF0aW9uR2VuZXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHsgLyogbm8tb3AgKi8gfVxuXHRjbGVhckV4cGxhbmF0aW9ucygpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRoYXNFeHBsYW5hdGlvbnMoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXG5cdHN0YXJ0U3RyZWFtaW5nRWRpdHMoX3Jlc291cmNlOiBVUkksIF9yZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIF9pblVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJU3RyZWFtaW5nRWRpdHMge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycpO1xuXHR9XG5cdGFwcGx5V29ya3NwYWNlRWRpdChfZWRpdDogSUNoYXRXb3Jrc3BhY2VFZGl0LCBfcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBfdW5kb1N0b3BJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkIGZvciBhZ2VudCBob3N0IHNlc3Npb25zJyk7XG5cdH1cblx0YXN5bmMgc3RhcnRFeHRlcm5hbEVkaXRzKF9yZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIF9vcGVyYXRpb25JZDogbnVtYmVyLCBfcmVzb3VyY2VzOiBVUklbXSwgX3VuZG9TdG9wSWQ6IHN0cmluZywgX2NvbnRlbnRGb3I/OiBVUklbXSk6IFByb21pc2U8SUNoYXRQcm9ncmVzc1tdPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkIGZvciBhZ2VudCBob3N0IHNlc3Npb25zJyk7XG5cdH1cblx0YXN5bmMgc3RvcEV4dGVybmFsRWRpdHMoX3Jlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgX29wZXJhdGlvbklkOiBudW1iZXIsIF9jb250ZW50Rm9yPzogVVJJW10pOiBQcm9taXNlPElDaGF0UHJvZ3Jlc3NbXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucycpO1xuXHR9XG5cblx0Ly8gLS0tLSBTdG9wIC8gRGlzcG9zZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIHN0b3AoX2NsZWFyU3RhdGU/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8gLS0tLSBQcml2YXRlIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlQ2hlY2twb2ludENvbnRlbnQoY2hlY2twb2ludDogSUFnZW50SG9zdENoZWNrcG9pbnQsIGRpcmVjdGlvbjogJ2JlZm9yZScgfCAnYWZ0ZXInKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BzID0gY2hlY2twb2ludC5lZGl0cy5tYXAoYXN5bmMgZWRpdCA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZGlyZWN0aW9uID09PSAnYmVmb3JlJykge1xuXHRcdFx0XHRcdC8vIFVuZG9pbmcgdGhpcyBlZGl0XG5cdFx0XHRcdFx0c3dpdGNoIChlZGl0LmtpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkNyZWF0ZTpcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkRlbGV0ZTpcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlQ29udGVudFVyaSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0LmJlZm9yZUNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLlJlbmFtZTpcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQub3JpZ2luYWxSZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUoZWRpdC5yZXNvdXJjZSwgZWRpdC5vcmlnaW5hbFJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdC5iZWZvcmVDb250ZW50VXJpICYmIGVkaXQub3JpZ2luYWxSZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0LmJlZm9yZUNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0Lm9yaWdpbmFsUmVzb3VyY2UsIGNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBGaWxlRWRpdEtpbmQuRWRpdDpcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQuYmVmb3JlQ29udGVudFVyaSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0LmJlZm9yZUNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gUmVkb2luZyB0aGlzIGVkaXRcblx0XHRcdFx0XHRzd2l0Y2ggKGVkaXQua2luZCkge1xuXHRcdFx0XHRcdFx0Y2FzZSBGaWxlRWRpdEtpbmQuQ3JlYXRlOlxuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdC5hZnRlckNvbnRlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5hZnRlckNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkRlbGV0ZTpcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLlJlbmFtZTpcblx0XHRcdFx0XHRcdFx0aWYgKGVkaXQub3JpZ2luYWxSZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUoZWRpdC5vcmlnaW5hbFJlc291cmNlLCBlZGl0LnJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdC5hZnRlckNvbnRlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZWRpdC5hZnRlckNvbnRlbnRVcmkpO1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShlZGl0LnJlc291cmNlLCBjb250ZW50LnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgRmlsZUVkaXRLaW5kLkVkaXQ6XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0LmFmdGVyQ29udGVudFVyaSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlZGl0LmFmdGVyQ29udGVudFVyaSk7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGVkaXQucmVzb3VyY2UsIGNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFNuYXBzaG90Q29udHJvbGxlcl0gRmFpbGVkIHRvICR7ZGlyZWN0aW9uID09PSAnYmVmb3JlJyA/ICd1bmRvJyA6ICdyZWRvJ30gJHtlZGl0LmtpbmR9IGZvciAke2VkaXQucmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKG9wcyk7XG5cdH1cbn1cblxuLyoqXG4gKiBDb21iaW5lcyB0d28gZWRpdHMgdG8gdGhlIHNhbWUgZmlsZSAoaW4gYXJyaXZhbCBvcmRlcikgaW50byBhIHNpbmdsZSBuZXRcbiAqIGVkaXQuIFRoZSBtZXJnZWQgZW50cnkga2VlcHMgdGhlIGVhcmxpZXIgYGJlZm9yZWAgc25hcHNob3QgYW5kIHRoZSBsYXRlclxuICogYGFmdGVyYCBzbmFwc2hvdCwgYW5kIGRlcml2ZXMgYSBuZXQgYGtpbmRgIGJhc2VkIG9uIHdoZXRoZXIgdGhlIGZpbGVcbiAqIGV4aXN0cyBhdCB0aGUgc3RhcnQgYW5kIGVuZCBvZiB0aGUgY29tYmluZWQgb3BlcmF0aW9uLlxuICpcbiAqIEEgY3JlYXRlLXRoZW4tZGVsZXRlIGNvbGxhcHNlcyB0byBhIG5vLW9wIGVkaXQgKG5vIGJlZm9yZSwgbm8gYWZ0ZXIpIFx1MjAxNCB3ZVxuICogc3RpbGwga2VlcCB0aGUgZW50cnkgc28gdGhlIGZpbGUgaXMgcmVzdG9yZWQgdG8gXCJhYnNlbnRcIiBvbiB1bmRvLCBidXRcbiAqIGBfd3JpdGVDaGVja3BvaW50Q29udGVudGAgd2lsbCBza2lwIHRoZSB3cml0ZSBzaW5jZSBib3RoIFVSSXMgYXJlIGFic2VudC5cbiAqL1xuZnVuY3Rpb24gbWVyZ2VGaWxlRWRpdChwcmV2OiBJVG9vbENhbGxGaWxlRWRpdCwgbmV4dDogSVRvb2xDYWxsRmlsZUVkaXQpOiBJVG9vbENhbGxGaWxlRWRpdCB7XG5cdGNvbnN0IHN0YXJ0c0Fic2VudCA9IHByZXYua2luZCA9PT0gRmlsZUVkaXRLaW5kLkNyZWF0ZTtcblx0Y29uc3QgZW5kc0Fic2VudCA9IG5leHQua2luZCA9PT0gRmlsZUVkaXRLaW5kLkRlbGV0ZTtcblxuXHRsZXQga2luZDogRmlsZUVkaXRLaW5kO1xuXHRpZiAoc3RhcnRzQWJzZW50ICYmIGVuZHNBYnNlbnQpIHtcblx0XHRraW5kID0gRmlsZUVkaXRLaW5kLkVkaXQ7IC8vIGNyZWF0ZStkZWxldGUgY29sbGFwc2VzIHRvIG5vLW9wXG5cdH0gZWxzZSBpZiAoc3RhcnRzQWJzZW50KSB7XG5cdFx0a2luZCA9IEZpbGVFZGl0S2luZC5DcmVhdGU7XG5cdH0gZWxzZSBpZiAoZW5kc0Fic2VudCkge1xuXHRcdGtpbmQgPSBGaWxlRWRpdEtpbmQuRGVsZXRlO1xuXHR9IGVsc2Uge1xuXHRcdGtpbmQgPSBGaWxlRWRpdEtpbmQuRWRpdDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0a2luZCxcblx0XHRyZXNvdXJjZTogbmV4dC5yZXNvdXJjZSxcblx0XHQvLyBSZW5hbWVzIHdpdGhpbiBhIHNpbmdsZSByZXF1ZXN0IGFyZSB1bmNvbW1vbjsgaWYgdGhlIHNlY29uZCBlZGl0XG5cdFx0Ly8gaXMgaXRzZWxmIGEgcmVuYW1lIGtlZXAgaXRzIG9yaWdpbmFsUmVzb3VyY2UsIG90aGVyd2lzZSBjYXJyeVxuXHRcdC8vIGZvcndhcmQgdGhlIGZpcnN0IG9uZS5cblx0XHRvcmlnaW5hbFJlc291cmNlOiBuZXh0Lm9yaWdpbmFsUmVzb3VyY2UgPz8gcHJldi5vcmlnaW5hbFJlc291cmNlLFxuXHRcdGJlZm9yZUNvbnRlbnRVcmk6IHByZXYuYmVmb3JlQ29udGVudFVyaSxcblx0XHRhZnRlckNvbnRlbnRVcmk6IG5leHQuYWZ0ZXJDb250ZW50VXJpLFxuXHRcdHVuZG9TdG9wSWQ6IHByZXYudW5kb1N0b3BJZCxcblx0XHRkaWZmOiBuZXh0LmRpZmYgPz8gcHJldi5kaWZmLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFT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
