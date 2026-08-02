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
import { DeferredPromise, Sequencer, SequencerByKey, timeout } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, dispose } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { derived, observableValue, transaction } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../../editor/browser/services/bulkEditService.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { MultiDiffEditorInput } from "../../../multiDiffEditor/browser/multiDiffEditorInput.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { chatEditingSessionIsReady, ChatEditingSessionState, ChatEditKind, getMultiDiffSourceUri, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatEditingCheckpointTimelineImpl } from "./chatEditingCheckpointTimelineImpl.js";
import { ChatEditingDeletedFileEntry } from "./chatEditingDeletedFileEntry.js";
import { ChatEditingModifiedDocumentEntry } from "./chatEditingModifiedDocumentEntry.js";
import { AbstractChatEditingModifiedFileEntry } from "./chatEditingModifiedFileEntry.js";
import { ChatEditingModifiedNotebookEntry } from "./chatEditingModifiedNotebookEntry.js";
import { FileOperationType, getKeyForChatSessionResource } from "./chatEditingOperations.js";
import { IChatEditingExplanationModelManager } from "./chatEditingExplanationModelManager.js";
import { ChatEditingSessionStorage } from "./chatEditingSessionStorage.js";
import { ChatEditingTextModelContentProvider } from "./chatEditingTextModelContentProviders.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { AgentSessionProviders } from "../agentSessions/agentSessions.js";
var NotExistBehavior = /* @__PURE__ */ ((NotExistBehavior2) => {
  NotExistBehavior2[NotExistBehavior2["Create"] = 0] = "Create";
  NotExistBehavior2[NotExistBehavior2["Abort"] = 1] = "Abort";
  return NotExistBehavior2;
})(NotExistBehavior || {});
class ThrottledSequencer extends Sequencer {
  constructor(_minDuration, _maxOverallDelay) {
    super();
    this._minDuration = _minDuration;
    this._maxOverallDelay = _maxOverallDelay;
    this._size = 0;
  }
  queue(promiseTask) {
    this._size += 1;
    const noDelay = this._size * this._minDuration > this._maxOverallDelay;
    return super.queue(async () => {
      try {
        const p1 = promiseTask();
        const p2 = noDelay ? Promise.resolve(void 0) : timeout(this._minDuration, CancellationToken.None);
        const [result] = await Promise.all([p1, p2]);
        return result;
      } finally {
        this._size -= 1;
      }
    });
  }
}
function createOpeningEditCodeBlock(uri, isNotebook, undoStopId) {
  return [
    {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    },
    {
      kind: "codeblockUri",
      uri,
      isEdit: true,
      undoStopId
    },
    {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    },
    isNotebook ? {
      kind: "notebookEdit",
      uri,
      edits: [],
      done: false,
      isExternalEdit: true
    } : {
      kind: "textEdit",
      uri,
      edits: [],
      done: false,
      isExternalEdit: true
    }
  ];
}
let ChatEditingSession = class extends Disposable {
  constructor(chatSessionResource, isGlobalEditingSession, _lookupExternalEntry, transferFrom, _instantiationService, _modelService, _languageService, _textModelService, _bulkEditService, _editorGroupsService, _editorService, _notebookService, _accessibilitySignalService, _logService, configurationService, _fileService, _explanationModelManager, _telemetryService) {
    super();
    this.chatSessionResource = chatSessionResource;
    this.isGlobalEditingSession = isGlobalEditingSession;
    this._lookupExternalEntry = _lookupExternalEntry;
    this._instantiationService = _instantiationService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._textModelService = _textModelService;
    this._bulkEditService = _bulkEditService;
    this._editorGroupsService = _editorGroupsService;
    this._editorService = _editorService;
    this._notebookService = _notebookService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._logService = _logService;
    this.configurationService = configurationService;
    this._fileService = _fileService;
    this._explanationModelManager = _explanationModelManager;
    this._telemetryService = _telemetryService;
    this.supportsKeepUndo = false;
    this._state = observableValue(this, ChatEditingSessionState.Initial);
    /**
     * Contains the contents of a file when the AI first began doing edits to it.
     */
    this._initialFileContents = new ResourceMap();
    this._baselineCreationLocks = new SequencerByKey();
    this._streamingEditLocks = new SequencerByKey();
    /**
     * Tracks active external edit operations.
     * Key is operationId, value contains the operation state.
     */
    this._externalEditOperations = /* @__PURE__ */ new Map();
    this._entriesObs = observableValue(this, []);
    this.entries = derived((reader) => {
      const state = this._state.read(reader);
      if (state === ChatEditingSessionState.Disposed || state === ChatEditingSessionState.Initial) {
        return [];
      } else {
        return this._entriesObs.read(reader);
      }
    });
    this._onDidDispose = new Emitter();
    this._timeline = this._instantiationService.createInstance(
      ChatEditingCheckpointTimelineImpl,
      chatSessionResource,
      this._getTimelineDelegate()
    );
    this.canRedo = this._timeline.canRedo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
    this.canUndo = this._timeline.canUndo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === ChatEditingSessionState.Idle);
    this._init(transferFrom);
  }
  get state() {
    return this._state;
  }
  get requestDisablement() {
    return this._timeline.requestDisablement;
  }
  get onDidDispose() {
    this._assertNotDisposed();
    return this._onDidDispose.event;
  }
  _getTimelineDelegate() {
    return {
      createFile: (uri, content) => {
        return this._bulkEditService.apply({
          edits: [{
            newResource: uri,
            options: {
              overwrite: true,
              contents: content ? Promise.resolve(VSBuffer.fromString(content)) : void 0
            }
          }]
        });
      },
      deleteFile: async (uri) => {
        const removedEntry = this._entriesObs.get().find((e) => isEqual(e.modifiedURI, uri));
        const entries = this._entriesObs.get().filter((e) => !isEqual(e.modifiedURI, uri));
        this._entriesObs.set(entries, void 0);
        removedEntry?.dispose();
        await this._bulkEditService.apply({ edits: [{ oldResource: uri, options: { ignoreIfNotExists: true } }] });
      },
      renameFile: async (fromUri, toUri) => {
        const entries = this._entriesObs.get();
        const previousEntry = entries.find((e) => isEqual(e.modifiedURI, fromUri));
        if (previousEntry) {
          const newEntry = await this._getOrCreateModifiedFileEntry(toUri, 0 /* Create */, previousEntry.telemetryInfo, this._getCurrentTextOrNotebookSnapshot(previousEntry));
          previousEntry.dispose();
          this._entriesObs.set(entries.map((e) => e === previousEntry ? newEntry : e), void 0);
        }
      },
      setContents: async (uri, content, telemetryInfo) => {
        const entry = await this._getOrCreateModifiedFileEntry(uri, 0 /* Create */, telemetryInfo);
        const state = entry.state.get();
        if (entry instanceof ChatEditingModifiedNotebookEntry) {
          await entry.restoreModifiedModelFromSnapshot(content);
        } else {
          await entry.acceptAgentEdits(uri, [{ range: new Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), text: content }], true, void 0);
        }
        if (state !== ModifiedFileEntryState.Modified) {
          await entry.accept();
        }
      }
    };
  }
  async _init(transferFrom) {
    const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
    let restoredSessionState;
    if (transferFrom instanceof ChatEditingSession) {
      restoredSessionState = transferFrom._getStoredState(this.chatSessionResource);
    } else {
      restoredSessionState = await storage.restoreState().catch((err) => {
        this._logService.error(`Error restoring chat editing session state for ${this.chatSessionResource}`, err);
        return void 0;
      });
      if (this._store.isDisposed) {
        return;
      }
    }
    if (restoredSessionState) {
      for (const [uri, content] of restoredSessionState.initialFileContents) {
        this._initialFileContents.set(uri, content);
      }
      if (restoredSessionState.timeline) {
        transaction((tx) => this._timeline.restoreFromState(restoredSessionState.timeline, tx));
      }
      await this._initEntries(restoredSessionState.recentSnapshot);
    }
    this._state.set(ChatEditingSessionState.Idle, void 0);
  }
  _getEntry(uri) {
    uri = CellUri.parse(uri)?.notebook ?? uri;
    return this._entriesObs.get().find((e) => isEqual(e.modifiedURI, uri));
  }
  getEntry(uri) {
    return this._getEntry(uri);
  }
  readEntry(uri, reader) {
    uri = CellUri.parse(uri)?.notebook ?? uri;
    return this._entriesObs.read(reader).find((e) => isEqual(e.modifiedURI, uri));
  }
  storeState() {
    const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
    const storedState = this._getStoredState();
    this._telemetryService.publicLog2("chatEditing/sessionStore", {
      editSessionId: getKeyForChatSessionResource(this.chatSessionResource),
      ...this._countEntryStates(this._entriesObs.get())
    });
    return storage.storeState(storedState);
  }
  _getStoredState(sessionResource = this.chatSessionResource) {
    const entries = new ResourceMap();
    for (const entry of this._entriesObs.get()) {
      entries.set(entry.modifiedURI, entry.createSnapshot(sessionResource, void 0, void 0));
    }
    const state = {
      initialFileContents: this._initialFileContents,
      timeline: this._timeline.getStateForPersistence(),
      recentSnapshot: { entries, stopId: void 0 }
    };
    return state;
  }
  getEntryDiffBetweenStops(uri, requestId, stopId) {
    return this._timeline.getEntryDiffBetweenStops(uri, requestId, stopId);
  }
  getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
    return this._timeline.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
  }
  getDiffsForFilesInSession() {
    return this._timeline.getDiffsForFilesInSession();
  }
  getDiffForSession() {
    return this._timeline.getDiffForSession();
  }
  getDiffsForFilesInRequest(requestId) {
    return this._timeline.getDiffsForFilesInRequest(requestId);
  }
  hasEditsInRequest(requestId, reader) {
    return this._timeline.hasEditsInRequest(requestId, reader);
  }
  createSnapshot(requestId, undoStop) {
    const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
    this._timeline.createCheckpoint(requestId, undoStop, label);
  }
  async getSnapshotContents(requestId, uri, stopId) {
    const content = await this._timeline.getContentAtStop(requestId, uri, stopId);
    return typeof content === "string" ? VSBuffer.fromString(content) : content;
  }
  async getSnapshotModel(requestId, undoStop, snapshotUri) {
    await this._baselineCreationLocks.peek(snapshotUri.path);
    const content = await this._timeline.getContentAtStop(requestId, snapshotUri, undoStop);
    if (content === void 0) {
      return null;
    }
    const contentStr = typeof content === "string" ? content : content.toString();
    const model = this._modelService.createModel(contentStr, this._languageService.createByFilepathOrFirstLine(snapshotUri), snapshotUri, false);
    const store = new DisposableStore();
    store.add(model.onWillDispose(() => store.dispose()));
    store.add(this._timeline.onDidChangeContentsAtStop(requestId, snapshotUri, undoStop, (c) => model.setValue(c)));
    return model;
  }
  getSnapshotUri(requestId, uri, stopId) {
    return this._timeline.getContentURIAtStop(requestId, uri, stopId);
  }
  async restoreSnapshot(requestId, stopId) {
    const checkpointId = this._timeline.getCheckpointIdForRequest(requestId, stopId);
    if (checkpointId) {
      await this._timeline.navigateToCheckpoint(checkpointId);
    }
  }
  _assertNotDisposed() {
    if (this._state.get() === ChatEditingSessionState.Disposed) {
      throw new BugIndicatingError(`Cannot access a disposed editing session`);
    }
  }
  async accept(...uris) {
    if (await this._operateEntry("accept", uris)) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
    }
  }
  async reject(...uris) {
    if (await this._operateEntry("reject", uris)) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
    }
  }
  async _operateEntry(action, uris) {
    this._assertNotDisposed();
    const applicableEntries = this._entriesObs.get().filter((e) => uris.length === 0 || uris.some((u) => isEqual(u, e.modifiedURI))).filter((e) => !e.isCurrentlyBeingModifiedBy.get()).filter((e) => e.state.get() === ModifiedFileEntryState.Modified);
    if (applicableEntries.length === 0) {
      return 0;
    }
    const method = action === "accept" ? "acceptDeferred" : "rejectDeferred";
    const transitionCallbacks = await Promise.all(
      applicableEntries.map((entry) => entry[method]().catch((err) => {
        this._logService.error(`Error calling ${method} on entry ${entry.modifiedURI}`, err);
      }))
    );
    transaction((tx) => {
      transitionCallbacks.forEach((callback) => callback?.(tx));
    });
    return applicableEntries.length;
  }
  async show(previousChanges) {
    this._assertNotDisposed();
    if (this._editorPane) {
      if (this._editorPane.isVisible()) {
        return;
      } else if (this._editorPane.input) {
        await this._editorService.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
        return;
      }
    }
    const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
      multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
      label: localize("multiDiffEditorInput.name", "Suggested Edits")
    }, this._instantiationService);
    this._editorPane = await this._editorService.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });
  }
  async stop(clearState = false) {
    this._stopPromise ??= Promise.allSettled([this._performStop(), this.storeState()]).then(() => {
    });
    await this._stopPromise;
    if (clearState) {
      await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource).clearState();
    }
  }
  async _performStop() {
    const schemes = [AbstractChatEditingModifiedFileEntry.scheme, ChatEditingTextModelContentProvider.scheme];
    await Promise.allSettled(this._editorGroupsService.groups.flatMap(async (g) => {
      return g.editors.map(async (e) => {
        if (e instanceof MultiDiffEditorInput && e.initialResources?.some((r) => r.originalUri && schemes.indexOf(r.originalUri.scheme) !== -1) || e instanceof DiffEditorInput && e.original.resource && schemes.indexOf(e.original.resource.scheme) !== -1) {
          await g.closeEditor(e);
        }
      });
    }));
  }
  dispose() {
    this._assertNotDisposed();
    this.clearExplanations();
    dispose(this._entriesObs.get());
    super.dispose();
    this._state.set(ChatEditingSessionState.Disposed, void 0);
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
  get isDisposed() {
    return this._state.get() === ChatEditingSessionState.Disposed;
  }
  startStreamingEdits(resource, responseModel, inUndoStop) {
    const completePromise = new DeferredPromise();
    const startPromise = new DeferredPromise();
    const sequencer = new ThrottledSequencer(15, 1e3);
    sequencer.queue(() => startPromise.p);
    this._baselineCreationLocks.queue(resource.path, () => startPromise.p);
    this._streamingEditLocks.queue(resource.toString(), async () => {
      await chatEditingSessionIsReady(this);
      if (!this.isDisposed) {
        await this._acceptStreamingEditsStart(responseModel, inUndoStop, resource);
      }
      startPromise.complete();
      return completePromise.p;
    });
    let didComplete = false;
    return {
      pushText: (edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, edits, isLastEdits, responseModel);
          }
        });
      },
      pushNotebookCellText: (cell, edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(cell, edits, isLastEdits, responseModel);
          }
        });
      },
      pushNotebook: (edits, isLastEdits) => {
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, edits, isLastEdits, responseModel);
          }
        });
      },
      complete: () => {
        if (didComplete) {
          return;
        }
        didComplete = true;
        sequencer.queue(async () => {
          if (!this.isDisposed) {
            await this._acceptEdits(resource, [], true, responseModel);
            await this._resolve(responseModel.requestId, inUndoStop, resource);
            completePromise.complete();
          }
        });
      }
    };
  }
  startDeletion(resource, responseModel, undoStopId) {
    this._assertNotDisposed();
    this._streamingEditLocks.queue(resource.toString(), async () => {
      if (this.isDisposed) {
        return;
      }
      await chatEditingSessionIsReady(this);
      let fileContent;
      try {
        const content = await this._fileService.readFile(resource);
        fileContent = content.value.toString();
      } catch (e) {
        this._logService.warn(`Cannot delete file ${resource.toString()}: file does not exist`);
        return;
      }
      const existingEntry = this._getEntry(resource);
      if (existingEntry) {
        existingEntry.dispose();
        const entries2 = this._entriesObs.get().filter((e) => e !== existingEntry);
        this._entriesObs.set(entries2, void 0);
      }
      if (!this._initialFileContents.has(resource)) {
        this._initialFileContents.set(resource, fileContent);
      }
      await this._bulkEditService.apply({
        edits: [{ oldResource: resource, options: { ignoreIfNotExists: true } }]
      });
      this._timeline.recordFileOperation({
        type: FileOperationType.Delete,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        finalContent: fileContent
      });
      const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
      const languageSelection = this._languageService.createByFilepathOrFirstLine(resource);
      const entry = this._instantiationService.createInstance(
        ChatEditingDeletedFileEntry,
        resource,
        fileContent,
        { collapse: (tx) => this._collapse(resource, tx) },
        telemetryInfo,
        languageSelection.languageId
      );
      const entries = [...this._entriesObs.get(), entry];
      this._entriesObs.set(entries, void 0);
    });
  }
  applyWorkspaceEdit(edit, responseModel, undoStopId) {
    for (const fileEdit of edit.edits) {
      if (fileEdit.oldResource && !fileEdit.newResource) {
        this.startDeletion(fileEdit.oldResource, responseModel, undoStopId);
      }
    }
  }
  async startExternalEdits(responseModel, operationId, resources, undoStopId, contentFor) {
    const snapshots = new ResourceMap();
    const acquiredLockPromises = [];
    const releaseLockPromises = [];
    const progress = [];
    const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
    await chatEditingSessionIsReady(this);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const contentSource = contentFor?.[i];
      const releaseLock = new DeferredPromise();
      releaseLockPromises.push(releaseLock);
      const acquiredLock = new DeferredPromise();
      acquiredLockPromises.push(acquiredLock);
      this._streamingEditLocks.queue(resource.toString(), async () => {
        if (this.isDisposed) {
          acquiredLock.complete();
          return;
        }
        let initialContent;
        if (contentSource) {
          try {
            const data = await this._fileService.readFile(contentSource);
            initialContent = data.value.toString();
          } catch {
            initialContent = "";
          }
        }
        const entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* Abort */, telemetryInfo, initialContent);
        if (entry) {
          await this._acceptStreamingEditsStart(responseModel, undoStopId, resource);
        }
        const notebookUri = CellUri.parse(resource)?.notebook || resource;
        progress.push(...createOpeningEditCodeBlock(resource, this._notebookService.hasSupportedNotebooks(notebookUri), undoStopId));
        if (initialContent !== void 0) {
          if (entry) {
            entry.initialContent = initialContent;
            await entry.resetEditTrackerToInitialContent();
          }
          snapshots.set(resource, initialContent);
        } else {
          await entry?.save();
          snapshots.set(resource, entry && this._getCurrentTextOrNotebookSnapshot(entry));
        }
        entry?.startExternalEdit();
        acquiredLock.complete();
        return releaseLock.p;
      });
    }
    await Promise.all(acquiredLockPromises.map((p) => p.p));
    this.createSnapshot(responseModel.requestId, undoStopId);
    this._externalEditOperations.set(operationId, {
      responseModel,
      snapshots,
      undoStopId,
      releaseLocks: () => releaseLockPromises.forEach((p) => p.complete())
    });
    return progress;
  }
  async stopExternalEdits(responseModel, operationId, contentFor) {
    const operation = this._externalEditOperations.get(operationId);
    if (!operation) {
      this._logService.warn(`stopExternalEdits called for unknown operation ${operationId}`);
      return [];
    }
    this._externalEditOperations.delete(operationId);
    const progress = [];
    try {
      const contentForMap = new ResourceMap();
      if (contentFor) {
        let idx = 0;
        for (const [resource] of operation.snapshots) {
          if (idx < contentFor.length && contentFor[idx]) {
            contentForMap.set(resource, contentFor[idx]);
          }
          idx++;
        }
      }
      for (const [resource, beforeSnapshot] of operation.snapshots) {
        let entry = this._getEntry(resource);
        if (!entry && beforeSnapshot === void 0) {
          entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* Abort */, this._getTelemetryInfoForModel(responseModel), "");
          if (entry) {
            entry.startExternalEdit();
            entry.acceptStreamingEditsStart(responseModel, operation.undoStopId, void 0);
          }
        }
        if (!entry) {
          continue;
        }
        let afterSnapshot;
        const contentSource = contentForMap.get(resource);
        if (contentSource) {
          try {
            const data = await this._fileService.readFile(contentSource);
            afterSnapshot = data.value.toString();
          } catch (_e) {
            afterSnapshot = "";
          }
        } else {
          await entry.revertToDisk();
          afterSnapshot = this._getCurrentTextOrNotebookSnapshot(entry) ?? "";
        }
        let edits = [];
        if (beforeSnapshot === void 0) {
          this._timeline.recordFileOperation({
            type: FileOperationType.Create,
            uri: resource,
            requestId: responseModel.requestId,
            epoch: this._timeline.incrementEpoch(),
            initialContent: afterSnapshot,
            telemetryInfo: entry.telemetryInfo
          });
        } else {
          edits = await entry.computeEditsFromSnapshots(beforeSnapshot, afterSnapshot);
          this._recordEditOperations(entry, resource, edits, responseModel);
        }
        progress.push(entry instanceof ChatEditingModifiedNotebookEntry ? {
          kind: "notebookEdit",
          uri: resource,
          edits,
          done: true,
          isExternalEdit: true
        } : {
          kind: "textEdit",
          uri: resource,
          edits,
          done: true,
          isExternalEdit: true
        });
        await entry.acceptStreamingEditsEnd();
        if (getChatSessionType(this.chatSessionResource) === AgentSessionProviders.Background) {
          await entry.accept();
        }
        entry.stopExternalEdit();
      }
    } finally {
      operation.releaseLocks();
      const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), (k) => !operation.snapshots.has(URI.parse(k)));
      if (!hasOtherTasks) {
        this._state.set(ChatEditingSessionState.Idle, void 0);
      }
    }
    return progress;
  }
  async undoInteraction() {
    await this._timeline.undoToLastCheckpoint();
  }
  async redoInteraction() {
    await this._timeline.redoToNextCheckpoint();
  }
  async triggerExplanationGeneration() {
    this.clearExplanations();
    const entries = this._entriesObs.get();
    const diffInfos = [];
    for (const entry of entries) {
      if (entry instanceof ChatEditingModifiedDocumentEntry) {
        const diff = await entry.getDiffInfo();
        diffInfos.push({
          changes: diff.changes,
          identical: diff.identical,
          originalModel: entry.originalModel,
          modifiedModel: entry.modifiedModel
        });
      }
    }
    if (diffInfos.length > 0) {
      this._explanationHandle = this._explanationModelManager.generateExplanations(diffInfos, this.chatSessionResource, CancellationToken.None);
      await this._explanationHandle.completed;
    }
  }
  clearExplanations() {
    if (this._explanationHandle) {
      this._explanationHandle.dispose();
      this._explanationHandle = void 0;
    }
  }
  hasExplanations() {
    return this._explanationHandle !== void 0;
  }
  _recordEditOperations(entry, resource, edits, responseModel) {
    const isNotebookEdits = edits.length > 0 && hasKey(edits[0], { cells: true });
    if (isNotebookEdits) {
      const notebookEdits = edits;
      this._timeline.recordFileOperation({
        type: FileOperationType.NotebookEdit,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        cellEdits: notebookEdits
      });
    } else {
      let cellIndex;
      if (entry instanceof ChatEditingModifiedNotebookEntry) {
        const cellUri = CellUri.parse(resource);
        if (cellUri) {
          const i = entry.getIndexOfCellHandle(cellUri.handle);
          if (i !== -1) {
            cellIndex = i;
          }
        }
      }
      const textEdits = edits;
      this._timeline.recordFileOperation({
        type: FileOperationType.TextEdit,
        uri: resource,
        requestId: responseModel.requestId,
        epoch: this._timeline.incrementEpoch(),
        edits: textEdits,
        cellIndex
      });
    }
  }
  _getCurrentTextOrNotebookSnapshot(entry) {
    if (entry instanceof ChatEditingModifiedNotebookEntry) {
      return entry.getCurrentSnapshot();
    } else if (entry instanceof ChatEditingModifiedDocumentEntry) {
      return entry.getCurrentContents();
    } else if (entry instanceof ChatEditingDeletedFileEntry) {
      return "";
    } else {
      throw new Error(`unknown entry type for ${entry.modifiedURI}`);
    }
  }
  async _acceptStreamingEditsStart(responseModel, undoStop, resource) {
    const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* Create */, this._getTelemetryInfoForModel(responseModel));
    if (!this._timeline.hasFileBaseline(resource, responseModel.requestId)) {
      this._timeline.recordFileBaseline({
        uri: resource,
        requestId: responseModel.requestId,
        content: this._getCurrentTextOrNotebookSnapshot(entry),
        epoch: this._timeline.incrementEpoch(),
        telemetryInfo: entry.telemetryInfo,
        notebookViewType: entry instanceof ChatEditingModifiedNotebookEntry ? entry.viewType : void 0
      });
    }
    transaction((tx) => {
      this._state.set(ChatEditingSessionState.StreamingEdits, tx);
      entry.acceptStreamingEditsStart(responseModel, undoStop, tx);
    });
    return entry;
  }
  async _initEntries({ entries }) {
    for (const entry of this._entriesObs.get()) {
      const snapshotEntry = entries.get(entry.modifiedURI);
      if (!snapshotEntry) {
        await entry.resetToInitialContent();
        entry.dispose();
      }
    }
    const entriesArr = [];
    for (const snapshotEntry of entries.values()) {
      let entry;
      if (snapshotEntry.isDeleted) {
        entry = this._instantiationService.createInstance(
          ChatEditingDeletedFileEntry,
          snapshotEntry.resource,
          snapshotEntry.original,
          // original content before deletion
          { collapse: (tx) => this._collapse(snapshotEntry.resource, tx) },
          snapshotEntry.telemetryInfo,
          snapshotEntry.languageId
        );
        await entry.restoreFromSnapshot(snapshotEntry, false);
      } else {
        entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, 1 /* Abort */, snapshotEntry.telemetryInfo);
        if (entry) {
          const restoreToDisk = snapshotEntry.state === ModifiedFileEntryState.Modified;
          await entry.restoreFromSnapshot(snapshotEntry, restoreToDisk);
        }
      }
      if (entry) {
        entriesArr.push(entry);
      }
    }
    this._entriesObs.set(entriesArr, void 0);
    this._telemetryService.publicLog2("chatEditing/sessionRestore", {
      editSessionId: getKeyForChatSessionResource(this.chatSessionResource),
      ...this._countEntryStates(entriesArr)
    });
  }
  async _acceptEdits(resource, textEdits, isLastEdits, responseModel) {
    const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* Create */, this._getTelemetryInfoForModel(responseModel));
    if (textEdits.length > 0) {
      this._recordEditOperations(entry, resource, textEdits, responseModel);
    }
    await entry.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);
  }
  _getTelemetryInfoForModel(responseModel) {
    return new class {
      get agentId() {
        return responseModel.agent?.id;
      }
      get modelId() {
        return responseModel.request?.modelId;
      }
      get modeId() {
        return responseModel.request?.modeInfo?.telemetryModeId;
      }
      get command() {
        return responseModel.slashCommand?.name;
      }
      get sessionResource() {
        return responseModel.session.sessionResource;
      }
      get requestId() {
        return responseModel.requestId;
      }
      get result() {
        return responseModel.result;
      }
      get applyCodeBlockSuggestionId() {
        return responseModel.request?.modeInfo?.applyCodeBlockSuggestionId;
      }
      get feature() {
        if (responseModel.session.initialLocation === ChatAgentLocation.Chat) {
          return "sideBarChat";
        } else if (responseModel.session.initialLocation === ChatAgentLocation.EditorInline) {
          return "inlineChat";
        }
        return void 0;
      }
    }();
  }
  _countEntryStates(entries) {
    let entryCount = 0;
    let modifiedCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;
    for (const entry of entries) {
      entryCount += 1;
      switch (entry.state.get()) {
        case ModifiedFileEntryState.Modified:
          modifiedCount += 1;
          break;
        case ModifiedFileEntryState.Accepted:
          acceptedCount += 1;
          break;
        case ModifiedFileEntryState.Rejected:
          rejectedCount += 1;
          break;
      }
    }
    return { entryCount, modifiedCount, acceptedCount, rejectedCount };
  }
  async _resolve(requestId, undoStop, resource) {
    const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), (k) => k !== resource.toString());
    if (!hasOtherTasks) {
      this._state.set(ChatEditingSessionState.Idle, void 0);
    }
    const entry = this._getEntry(resource);
    if (!entry) {
      return;
    }
    const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
    this._timeline.createCheckpoint(requestId, undoStop, label);
    return entry.acceptStreamingEditsEnd();
  }
  async _getOrCreateModifiedFileEntry(resource, ifNotExists, telemetryInfo, _initialContent) {
    resource = CellUri.parse(resource)?.notebook ?? resource;
    const existingEntry = this._entriesObs.get().find((e) => isEqual(e.modifiedURI, resource));
    if (existingEntry) {
      if (existingEntry instanceof ChatEditingDeletedFileEntry) {
        const initialContentFromDeleted = existingEntry.state.get() === ModifiedFileEntryState.Modified ? existingEntry.initialContent : void 0;
        existingEntry.dispose();
        const entries = this._entriesObs.get().filter((e) => e !== existingEntry);
        this._entriesObs.set(entries, void 0);
        if (initialContentFromDeleted !== void 0) {
          _initialContent = initialContentFromDeleted;
        }
      } else {
        if (telemetryInfo.requestId !== existingEntry.telemetryInfo.requestId) {
          existingEntry.updateTelemetryInfo(telemetryInfo);
        }
        return existingEntry;
      }
    }
    let entry;
    const existingExternalEntry = this._lookupExternalEntry(resource);
    if (existingExternalEntry) {
      entry = existingExternalEntry;
      if (telemetryInfo.requestId !== entry.telemetryInfo.requestId) {
        entry.updateTelemetryInfo(telemetryInfo);
      }
    } else {
      const initialContent = _initialContent ?? this._initialFileContents.get(resource);
      const maybeEntry = await this._createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent);
      if (!maybeEntry) {
        return void 0;
      }
      entry = maybeEntry;
      if (initialContent === void 0) {
        this._initialFileContents.set(resource, entry.initialContent);
      }
    }
    const listener = entry.onDidDelete(() => {
      const newEntries = this._entriesObs.get().filter((e) => !isEqual(e.modifiedURI, entry.modifiedURI));
      this._entriesObs.set(newEntries, void 0);
      this._editorService.closeEditors(this._editorService.findEditors(entry.modifiedURI));
      if (!existingExternalEntry) {
        entry.dispose();
      }
      this._store.delete(listener);
    });
    this._store.add(listener);
    const entriesArr = [...this._entriesObs.get(), entry];
    this._entriesObs.set(entriesArr, void 0);
    return entry;
  }
  async _createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent) {
    const multiDiffEntryDelegate = {
      collapse: (transaction2) => this._collapse(resource, transaction2),
      recordOperation: (operation) => {
        operation.epoch = this._timeline.incrementEpoch();
        this._timeline.recordFileOperation(operation);
      }
    };
    const notebookUri = CellUri.parse(resource)?.notebook || resource;
    const doCreate = async (chatKind) => {
      if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
        return await ChatEditingModifiedNotebookEntry.create(notebookUri, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, this._instantiationService);
      } else {
        const ref = await this._textModelService.createModelReference(resource);
        return this._instantiationService.createInstance(ChatEditingModifiedDocumentEntry, ref, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent);
      }
    };
    try {
      return await doCreate(ChatEditKind.Modified);
    } catch (err) {
      if (ifNotExists === 1 /* Abort */) {
        return void 0;
      }
      await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
      if (this.configurationService.getValue("accessibility.openChatEditedFiles")) {
        this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true, isExplicit: false } });
      }
      this._timeline.recordFileOperation({
        type: FileOperationType.Create,
        uri: resource,
        requestId: telemetryInfo.requestId,
        epoch: this._timeline.incrementEpoch(),
        initialContent: initialContent || "",
        telemetryInfo
      });
      if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
        return await ChatEditingModifiedNotebookEntry.create(resource, multiDiffEntryDelegate, telemetryInfo, ChatEditKind.Created, initialContent, this._instantiationService);
      } else {
        return await doCreate(ChatEditKind.Created);
      }
    }
  }
  _collapse(resource, transaction2) {
    const multiDiffItem = this._editorPane?.findDocumentDiffItem(resource);
    if (multiDiffItem) {
      this._editorPane?.viewModel?.items.get().find((documentDiffItem) => isEqual(documentDiffItem.originalUri, multiDiffItem.originalUri) && isEqual(documentDiffItem.modifiedUri, multiDiffItem.modifiedUri))?.collapsed.set(true, transaction2);
    }
  }
};
ChatEditingSession = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IModelService),
  __decorateParam(6, ILanguageService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, IBulkEditService),
  __decorateParam(9, IEditorGroupsService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, INotebookService),
  __decorateParam(12, IAccessibilitySignalService),
  __decorateParam(13, ILogService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IFileService),
  __decorateParam(16, IChatEditingExplanationModelManager),
  __decorateParam(17, ITelemetryService)
], ChatEditingSession);
export {
  ChatEditingSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1Nlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIElUYXNrLCBTZXF1ZW5jZXIsIFNlcXVlbmNlckJ5S2V5LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBNdWx0aURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IENlbGxVcmksIElDZWxsRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0RWRpdGluZ1Nlc3Npb25Jc1JlYWR5LCBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgQ2hhdEVkaXRLaW5kLCBnZXRNdWx0aURpZmZTb3VyY2VVcmksIElDaGF0RWRpdGluZ1Nlc3Npb24sIElFZGl0U2Vzc2lvbkVudHJ5RGlmZiwgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBJTW9kaWZpZWRGaWxlRW50cnksIElTbmFwc2hvdEVudHJ5LCBJU3RyZWFtaW5nRWRpdHMsIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzLCBJQ2hhdFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmUuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLCBJQ2hhdEVkaXRpbmdUaW1lbGluZUZzRGVsZWdhdGUgfSBmcm9tICcuL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0RlbGV0ZWRGaWxlRW50cnkgfSBmcm9tICcuL2NoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ01vZGlmaWVkRG9jdW1lbnRFbnRyeSB9IGZyb20gJy4vY2hhdEVkaXRpbmdNb2RpZmllZERvY3VtZW50RW50cnkuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IH0gZnJvbSAnLi9jaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nTW9kaWZpZWROb3RlYm9va0VudHJ5IH0gZnJvbSAnLi9jaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uVHlwZSwgZ2V0S2V5Rm9yQ2hhdFNlc3Npb25SZXNvdXJjZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLCBJRXhwbGFuYXRpb25EaWZmSW5mbywgSUV4cGxhbmF0aW9uR2VuZXJhdGlvbkhhbmRsZSB9IGZyb20gJy4vY2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcCwgU3RvcmVkU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi9jaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ1RleHRNb2RlbENvbnRlbnRQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcblxuY29uc3QgZW51bSBOb3RFeGlzdEJlaGF2aW9yIHtcblx0Q3JlYXRlLFxuXHRBYm9ydCxcbn1cblxudHlwZSBDaGF0RWRpdGluZ1Nlc3Npb25JbmZvRXZlbnQgPSB7XG5cdGVkaXRTZXNzaW9uSWQ6IHN0cmluZztcblx0ZW50cnlDb3VudDogbnVtYmVyO1xuXHRtb2RpZmllZENvdW50OiBudW1iZXI7XG5cdGFjY2VwdGVkQ291bnQ6IG51bWJlcjtcblx0cmVqZWN0ZWRDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBDaGF0RWRpdGluZ1Nlc3Npb25JbmZvQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnanJpZWtlbic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdGhlIG51bWJlciBhbmQgc3RhdGUgb2YgY2hhdCBlZGl0aW5nIGVudHJpZXMgd2hlbiBhIHNlc3Npb24gaXMgc3RvcmVkLic7XG5cdGVkaXRTZXNzaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIYXNoZWQgaWRlbnRpZmllciBvZiB0aGUgY2hhdCBzZXNzaW9uIGZvciBjb3JyZWxhdGlvbi4nIH07XG5cdGVudHJ5Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgZW50cmllcyBzdG9yZWQgd2l0aCB0aGUgc2Vzc2lvbi4nIH07XG5cdG1vZGlmaWVkQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgZW50cmllcyBpbiBNb2RpZmllZCBzdGF0ZSB3aGVuIHN0b3JpbmcuJyB9O1xuXHRhY2NlcHRlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGVudHJpZXMgaW4gQWNjZXB0ZWQgc3RhdGUgd2hlbiBzdG9yaW5nLicgfTtcblx0cmVqZWN0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBlbnRyaWVzIGluIFJlamVjdGVkIHN0YXRlIHdoZW4gc3RvcmluZy4nIH07XG59O1xuXG5cbmNsYXNzIFRocm90dGxlZFNlcXVlbmNlciBleHRlbmRzIFNlcXVlbmNlciB7XG5cblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWluRHVyYXRpb246IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXhPdmVyYWxsRGVsYXk6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcXVldWU8VD4ocHJvbWlzZVRhc2s6IElUYXNrPFByb21pc2U8VD4+KTogUHJvbWlzZTxUPiB7XG5cblx0XHR0aGlzLl9zaXplICs9IDE7XG5cblx0XHRjb25zdCBub0RlbGF5ID0gdGhpcy5fc2l6ZSAqIHRoaXMuX21pbkR1cmF0aW9uID4gdGhpcy5fbWF4T3ZlcmFsbERlbGF5O1xuXG5cdFx0cmV0dXJuIHN1cGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHAxID0gcHJvbWlzZVRhc2soKTtcblx0XHRcdFx0Y29uc3QgcDIgPSBub0RlbGF5XG5cdFx0XHRcdFx0PyBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKVxuXHRcdFx0XHRcdDogdGltZW91dCh0aGlzLl9taW5EdXJhdGlvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdFx0Y29uc3QgW3Jlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbcDEsIHAyXSk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3NpemUgLT0gMTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVPcGVuaW5nRWRpdENvZGVCbG9jayh1cmk6IFVSSSwgaXNOb3RlYm9vazogYm9vbGVhbiwgdW5kb1N0b3BJZDogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1tdIHtcblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnXFxuYGBgYFxcbicpXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRraW5kOiAnY29kZWJsb2NrVXJpJyxcblx0XHRcdHVyaSxcblx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdHVuZG9TdG9wSWRcblx0XHR9LFxuXHRcdHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdcXG5gYGBgXFxuJylcblx0XHR9LFxuXHRcdGlzTm90ZWJvb2tcblx0XHRcdD8ge1xuXHRcdFx0XHRraW5kOiAnbm90ZWJvb2tFZGl0Jyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdGRvbmU6IGZhbHNlLFxuXHRcdFx0XHRpc0V4dGVybmFsRWRpdDogdHJ1ZVxuXHRcdFx0fVxuXHRcdFx0OiB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHRkb25lOiBmYWxzZSxcblx0XHRcdFx0aXNFeHRlcm5hbEVkaXQ6IHRydWVcblx0XHRcdH0sXG5cdF07XG59XG5cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nU2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdEVkaXRpbmdTZXNzaW9uIHtcblx0cmVhZG9ubHkgc3VwcG9ydHNLZWVwVW5kbyA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZT4odGhpcywgQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSW5pdGlhbCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVsaW5lOiBJQ2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmU7XG5cblx0LyoqXG5cdCAqIENvbnRhaW5zIHRoZSBjb250ZW50cyBvZiBhIGZpbGUgd2hlbiB0aGUgQUkgZmlyc3QgYmVnYW4gZG9pbmcgZWRpdHMgdG8gaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsRmlsZUNvbnRlbnRzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYXNlbGluZUNyZWF0aW9uTG9ja3MgPSBuZXcgU2VxdWVuY2VyQnlLZXk8LyogVVJJLnBhdGggKi8gc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJlYW1pbmdFZGl0TG9ja3MgPSBuZXcgU2VxdWVuY2VyQnlLZXk8LyogVVJJICovIHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogVHJhY2tzIGFjdGl2ZSBleHRlcm5hbCBlZGl0IG9wZXJhdGlvbnMuXG5cdCAqIEtleSBpcyBvcGVyYXRpb25JZCwgdmFsdWUgY29udGFpbnMgdGhlIG9wZXJhdGlvbiBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVybmFsRWRpdE9wZXJhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwge1xuXHRcdHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbDtcblx0XHRzbmFwc2hvdHM6IFJlc291cmNlTWFwPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdFx0dW5kb1N0b3BJZDogc3RyaW5nO1xuXHRcdHJlbGVhc2VMb2NrczogKCkgPT4gdm9pZDtcblx0fT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeVtdPih0aGlzLCBbXSk7XG5cdHB1YmxpYyByZWFkb25seSBlbnRyaWVzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTW9kaWZpZWRGaWxlRW50cnlbXT4gPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHN0YXRlID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZCB8fCBzdGF0ZSA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSW5pdGlhbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIF9lZGl0b3JQYW5lOiBNdWx0aURpZmZFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4cGxhbmF0aW9uSGFuZGxlOiBJRXhwbGFuYXRpb25HZW5lcmF0aW9uSGFuZGxlIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBzdGF0ZSgpOiBJT2JzZXJ2YWJsZTxDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBjYW5VbmRvOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHVibGljIHJlYWRvbmx5IGNhblJlZG86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHB1YmxpYyBnZXQgcmVxdWVzdERpc2FibGVtZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRnZXQgb25EaWREaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBpc0dsb2JhbEVkaXRpbmdTZXNzaW9uOiBib29sZWFuLFxuXHRcdHByaXZhdGUgX2xvb2t1cEV4dGVybmFsRW50cnk6ICh1cmk6IFVSSSkgPT4gQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkLFxuXHRcdHRyYW5zZmVyRnJvbTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHVibGljIHJlYWRvbmx5IF9idWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX2V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyOiBJQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlcixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdGltZWxpbmUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0aGlzLl9nZXRUaW1lbGluZURlbGVnYXRlKCksXG5cdFx0KTtcblxuXHRcdHRoaXMuY2FuUmVkbyA9IHRoaXMuX3RpbWVsaW5lLmNhblJlZG8ubWFwKChoYXNIaXN0b3J5LCByZWFkZXIpID0+XG5cdFx0XHRoYXNIaXN0b3J5ICYmIHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKSA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSk7XG5cdFx0dGhpcy5jYW5VbmRvID0gdGhpcy5fdGltZWxpbmUuY2FuVW5kby5tYXAoKGhhc0hpc3RvcnksIHJlYWRlcikgPT5cblx0XHRcdGhhc0hpc3RvcnkgJiYgdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5JZGxlKTtcblxuXHRcdHRoaXMuX2luaXQodHJhbnNmZXJGcm9tKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRpbWVsaW5lRGVsZWdhdGUoKTogSUNoYXRFZGl0aW5nVGltZWxpbmVGc0RlbGVnYXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3JlYXRlRmlsZTogKHVyaSwgY29udGVudCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHtcblx0XHRcdFx0XHRlZGl0czogW3tcblx0XHRcdFx0XHRcdG5ld1Jlc291cmNlOiB1cmksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdG92ZXJ3cml0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Y29udGVudHM6IGNvbnRlbnQgPyBQcm9taXNlLnJlc29sdmUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVGaWxlOiBhc3luYyAodXJpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWRFbnRyeSA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCkuZmluZChlID0+IGlzRXF1YWwoZS5tb2RpZmllZFVSSSwgdXJpKSk7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzT2JzLmdldCgpLmZpbHRlcihlID0+ICFpc0VxdWFsKGUubW9kaWZpZWRVUkksIHVyaSkpO1xuXHRcdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZW1vdmVkRW50cnk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KHsgZWRpdHM6IFt7IG9sZFJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgaWdub3JlSWZOb3RFeGlzdHM6IHRydWUgfSB9XSB9KTtcblx0XHRcdH0sXG5cdFx0XHRyZW5hbWVGaWxlOiBhc3luYyAoZnJvbVVyaSwgdG9VcmkpID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzRW50cnkgPSBlbnRyaWVzLmZpbmQoZSA9PiBpc0VxdWFsKGUubW9kaWZpZWRVUkksIGZyb21VcmkpKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzRW50cnkpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdFbnRyeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkodG9VcmksIE5vdEV4aXN0QmVoYXZpb3IuQ3JlYXRlLCBwcmV2aW91c0VudHJ5LnRlbGVtZXRyeUluZm8sIHRoaXMuX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KHByZXZpb3VzRW50cnkpKTtcblx0XHRcdFx0XHRwcmV2aW91c0VudHJ5LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzLm1hcChlID0+IGUgPT09IHByZXZpb3VzRW50cnkgPyBuZXdFbnRyeSA6IGUpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2V0Q29udGVudHM6IGFzeW5jICh1cmksIGNvbnRlbnQsIHRlbGVtZXRyeUluZm8pID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHVyaSwgTm90RXhpc3RCZWhhdmlvci5DcmVhdGUsIHRlbGVtZXRyeUluZm8pO1xuXG5cdFx0XHRcdC8vIFdlIGFwcGx5IHRoZXNlIGVkaXRzIGFzICdhZ2VudCBlZGl0cycgd2hpY2ggd2lsbCBieSBkZWZhdWx0IG1ha2UgdGhlbSBnZXQga2VlcFxuXHRcdFx0XHQvLyAvdW5kbyBpbmRpY2F0b3JzLiBUaGlzIGlzIGdvb2QgaW4gdGhlIGNhc2UgdGhlIGVkaXRzIHdlcmUgbmV2ZXIgaW5pdGlhbGx5IGFjY2VwdGVkLFxuXHRcdFx0XHQvLyBidXQgaWYgdGhlIGZpbGUgd2FzIGFscmVhZHkgaW4gYW4gYWNjZXB0ZWQgc3RhdGUgd2Ugc2hvdWxkIG5vdCBtYWtlIGl0IG1vZGlmaWVkIGFnYWluLlxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGVudHJ5LnN0YXRlLmdldCgpO1xuXHRcdFx0XHRpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSkge1xuXHRcdFx0XHRcdGF3YWl0IGVudHJ5LnJlc3RvcmVNb2RpZmllZE1vZGVsRnJvbVNuYXBzaG90KGNvbnRlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGVudHJ5LmFjY2VwdEFnZW50RWRpdHModXJpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksIHRleHQ6IGNvbnRlbnQgfV0sIHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc3RhdGUgIT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5hY2NlcHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0KHRyYW5zZmVyRnJvbT86IElDaGF0RWRpdGluZ1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZSwgdGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRsZXQgcmVzdG9yZWRTZXNzaW9uU3RhdGU6IFN0b3JlZFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHJhbnNmZXJGcm9tIGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRyZXN0b3JlZFNlc3Npb25TdGF0ZSA9IHRyYW5zZmVyRnJvbS5fZ2V0U3RvcmVkU3RhdGUodGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdG9yZWRTZXNzaW9uU3RhdGUgPSBhd2FpdCBzdG9yYWdlLnJlc3RvcmVTdGF0ZSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHJlc3RvcmluZyBjaGF0IGVkaXRpbmcgc2Vzc2lvbiBzdGF0ZSBmb3IgJHt0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2V9YCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRpc3Bvc2VkIHdoaWxlIHJlc3RvcmluZ1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0aWYgKHJlc3RvcmVkU2Vzc2lvblN0YXRlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFt1cmksIGNvbnRlbnRdIG9mIHJlc3RvcmVkU2Vzc2lvblN0YXRlLmluaXRpYWxGaWxlQ29udGVudHMpIHtcblx0XHRcdFx0dGhpcy5faW5pdGlhbEZpbGVDb250ZW50cy5zZXQodXJpLCBjb250ZW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN0b3JlZFNlc3Npb25TdGF0ZS50aW1lbGluZSkge1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB0aGlzLl90aW1lbGluZS5yZXN0b3JlRnJvbVN0YXRlKHJlc3RvcmVkU2Vzc2lvblN0YXRlLnRpbWVsaW5lISwgdHgpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2luaXRFbnRyaWVzKHJlc3RvcmVkU2Vzc2lvblN0YXRlLnJlY2VudFNuYXBzaG90KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5zZXQoQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudHJ5KHVyaTogVVJJKTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHR1cmkgPSBDZWxsVXJpLnBhcnNlKHVyaSk/Lm5vdGVib29rID8/IHVyaTtcblx0XHRyZXR1cm4gdGhpcy5fZW50cmllc09icy5nZXQoKS5maW5kKGUgPT4gaXNFcXVhbChlLm1vZGlmaWVkVVJJLCB1cmkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbnRyeSh1cmk6IFVSSSk6IElNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEVudHJ5KHVyaSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZEVudHJ5KHVyaTogVVJJLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBJTW9kaWZpZWRGaWxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHVyaSA9IENlbGxVcmkucGFyc2UodXJpKT8ubm90ZWJvb2sgPz8gdXJpO1xuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzT2JzLnJlYWQocmVhZGVyKS5maW5kKGUgPT4gaXNFcXVhbChlLm1vZGlmaWVkVVJJLCB1cmkpKTtcblx0fVxuXG5cdHB1YmxpYyBzdG9yZVN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLCB0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN0b3JlZFN0YXRlID0gdGhpcy5fZ2V0U3RvcmVkU3RhdGUoKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdEVkaXRpbmdTZXNzaW9uSW5mb0V2ZW50LCBDaGF0RWRpdGluZ1Nlc3Npb25JbmZvQ2xhc3NpZmljYXRpb24+KCdjaGF0RWRpdGluZy9zZXNzaW9uU3RvcmUnLCB7XG5cdFx0XHRlZGl0U2Vzc2lvbklkOiBnZXRLZXlGb3JDaGF0U2Vzc2lvblJlc291cmNlKHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHQuLi50aGlzLl9jb3VudEVudHJ5U3RhdGVzKHRoaXMuX2VudHJpZXNPYnMuZ2V0KCkpLFxuXHRcdH0pO1xuXHRcdHJldHVybiBzdG9yYWdlLnN0b3JlU3RhdGUoc3RvcmVkU3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3RvcmVkU3RhdGUoc2Vzc2lvblJlc291cmNlID0gdGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKTogU3RvcmVkU2Vzc2lvblN0YXRlIHtcblx0XHRjb25zdCBlbnRyaWVzID0gbmV3IFJlc291cmNlTWFwPElTbmFwc2hvdEVudHJ5PigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fZW50cmllc09icy5nZXQoKSkge1xuXHRcdFx0ZW50cmllcy5zZXQoZW50cnkubW9kaWZpZWRVUkksIGVudHJ5LmNyZWF0ZVNuYXBzaG90KHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZTogU3RvcmVkU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0aW5pdGlhbEZpbGVDb250ZW50czogdGhpcy5faW5pdGlhbEZpbGVDb250ZW50cyxcblx0XHRcdHRpbWVsaW5lOiB0aGlzLl90aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCksXG5cdFx0XHRyZWNlbnRTbmFwc2hvdDogeyBlbnRyaWVzLCBzdG9wSWQ6IHVuZGVmaW5lZCB9LFxuXHRcdH07XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW50cnlEaWZmQmV0d2VlblN0b3BzKHVyaTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc3RvcElkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGltZWxpbmUuZ2V0RW50cnlEaWZmQmV0d2VlblN0b3BzKHVyaSwgcmVxdWVzdElkLCBzdG9wSWQpO1xuXHR9XG5cblx0cHVibGljIGdldEVudHJ5RGlmZkJldHdlZW5SZXF1ZXN0cyh1cmk6IFVSSSwgc3RhcnRSZXF1ZXN0SWQ6IHN0cmluZywgc3RvcFJlcXVlc3RJZDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmdldEVudHJ5RGlmZkJldHdlZW5SZXF1ZXN0cyh1cmksIHN0YXJ0UmVxdWVzdElkLCBzdG9wUmVxdWVzdElkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREaWZmc0ZvckZpbGVzSW5TZXNzaW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZS5nZXREaWZmc0ZvckZpbGVzSW5TZXNzaW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGlmZkZvclNlc3Npb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmdldERpZmZGb3JTZXNzaW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGlmZnNGb3JGaWxlc0luUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmdldERpZmZzRm9yRmlsZXNJblJlcXVlc3QocmVxdWVzdElkKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNFZGl0c0luUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVhZGVyPzogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90aW1lbGluZS5oYXNFZGl0c0luUmVxdWVzdChyZXF1ZXN0SWQsIHJlYWRlcik7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QocmVxdWVzdElkOiBzdHJpbmcsIHVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbCA9IHVuZG9TdG9wID8gYFJlcXVlc3QgJHtyZXF1ZXN0SWR9IC0gU3RvcCAke3VuZG9TdG9wfWAgOiBgUmVxdWVzdCAke3JlcXVlc3RJZH1gO1xuXHRcdHRoaXMuX3RpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQocmVxdWVzdElkLCB1bmRvU3RvcCwgbGFiZWwpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFNuYXBzaG90Q29udGVudHMocmVxdWVzdElkOiBzdHJpbmcsIHVyaTogVVJJLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fdGltZWxpbmUuZ2V0Q29udGVudEF0U3RvcChyZXF1ZXN0SWQsIHVyaSwgc3RvcElkKTtcblx0XHRyZXR1cm4gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSA6IGNvbnRlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0U25hcHNob3RNb2RlbChyZXF1ZXN0SWQ6IHN0cmluZywgdW5kb1N0b3A6IHN0cmluZyB8IHVuZGVmaW5lZCwgc25hcHNob3RVcmk6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbCB8IG51bGw+IHtcblx0XHRhd2FpdCB0aGlzLl9iYXNlbGluZUNyZWF0aW9uTG9ja3MucGVlayhzbmFwc2hvdFVyaS5wYXRoKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl90aW1lbGluZS5nZXRDb250ZW50QXRTdG9wKHJlcXVlc3RJZCwgc25hcHNob3RVcmksIHVuZG9TdG9wKTtcblx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50U3RyID0gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gY29udGVudCA6IGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5jcmVhdGVNb2RlbChjb250ZW50U3RyLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHNuYXBzaG90VXJpKSwgc25hcHNob3RVcmksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IHN0b3JlLmRpc3Bvc2UoKSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90aW1lbGluZS5vbkRpZENoYW5nZUNvbnRlbnRzQXRTdG9wKHJlcXVlc3RJZCwgc25hcHNob3RVcmksIHVuZG9TdG9wLCBjID0+IG1vZGVsLnNldFZhbHVlKGMpKSk7XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U25hcHNob3RVcmkocmVxdWVzdElkOiBzdHJpbmcsIHVyaTogVVJJLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVsaW5lLmdldENvbnRlbnRVUklBdFN0b3AocmVxdWVzdElkLCB1cmksIHN0b3BJZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzdG9yZVNuYXBzaG90KHJlcXVlc3RJZDogc3RyaW5nLCBzdG9wSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRJZCA9IHRoaXMuX3RpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QocmVxdWVzdElkLCBzdG9wSWQpO1xuXHRcdGlmIChjaGVja3BvaW50SWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3RpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KGNoZWNrcG9pbnRJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXNzZXJ0Tm90RGlzcG9zZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmdldCgpID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgQ2Fubm90IGFjY2VzcyBhIGRpc3Bvc2VkIGVkaXRpbmcgc2Vzc2lvbmApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjY2VwdCguLi51cmlzOiBVUklbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhd2FpdCB0aGlzLl9vcGVyYXRlRW50cnkoJ2FjY2VwdCcsIHVyaXMpKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZWRpdHNLZXB0LCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSk7XG5cdFx0fVxuXG5cdH1cblxuXHRhc3luYyByZWplY3QoLi4udXJpczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYXdhaXQgdGhpcy5fb3BlcmF0ZUVudHJ5KCdyZWplY3QnLCB1cmlzKSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmVkaXRzVW5kb25lLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlcmF0ZUVudHJ5KGFjdGlvbjogJ2FjY2VwdCcgfCAncmVqZWN0JywgdXJpczogVVJJW10pOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cblx0XHRjb25zdCBhcHBsaWNhYmxlRW50cmllcyA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KClcblx0XHRcdC5maWx0ZXIoZSA9PiB1cmlzLmxlbmd0aCA9PT0gMCB8fCB1cmlzLnNvbWUodSA9PiBpc0VxdWFsKHUsIGUubW9kaWZpZWRVUkkpKSlcblx0XHRcdC5maWx0ZXIoZSA9PiAhZS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5nZXQoKSlcblx0XHRcdC5maWx0ZXIoZSA9PiBlLnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblxuXHRcdGlmIChhcHBsaWNhYmxlRW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdC8vIFBlcmZvcm0gYWxsIEkvTyBvcGVyYXRpb25zIGluIHBhcmFsbGVsLCBlYWNoIHJlc29sdmluZyB0byBhIHN0YXRlIHRyYW5zaXRpb24gY2FsbGJhY2tcblx0XHRjb25zdCBtZXRob2QgPSBhY3Rpb24gPT09ICdhY2NlcHQnID8gJ2FjY2VwdERlZmVycmVkJyA6ICdyZWplY3REZWZlcnJlZCc7XG5cdFx0Y29uc3QgdHJhbnNpdGlvbkNhbGxiYWNrcyA9IGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0YXBwbGljYWJsZUVudHJpZXMubWFwKGVudHJ5ID0+IGVudHJ5W21ldGhvZF0oKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBjYWxsaW5nICR7bWV0aG9kfSBvbiBlbnRyeSAke2VudHJ5Lm1vZGlmaWVkVVJJfWAsIGVycik7XG5cdFx0XHR9KSlcblx0XHQpO1xuXG5cdFx0Ly8gRXhlY3V0ZSBhbGwgc3RhdGUgdHJhbnNpdGlvbnMgYXRvbWljYWxseSBpbiBhIHNpbmdsZSB0cmFuc2FjdGlvblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRyYW5zaXRpb25DYWxsYmFja3MuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjaz8uKHR4KSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gYXBwbGljYWJsZUVudHJpZXMubGVuZ3RoO1xuXHR9XG5cblx0YXN5bmMgc2hvdyhwcmV2aW91c0NoYW5nZXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAodGhpcy5fZWRpdG9yUGFuZSkge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvclBhbmUuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9lZGl0b3JQYW5lLmlucHV0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLl9lZGl0b3JQYW5lLmlucHV0LCB7IHBpbm5lZDogdHJ1ZSwgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IE11bHRpRGlmZkVkaXRvcklucHV0LmZyb21SZXNvdXJjZU11bHRpRGlmZkVkaXRvcklucHV0KHtcblx0XHRcdG11bHRpRGlmZlNvdXJjZTogZ2V0TXVsdGlEaWZmU291cmNlVXJpKHRoaXMsIHByZXZpb3VzQ2hhbmdlcyksXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ211bHRpRGlmZkVkaXRvcklucHV0Lm5hbWUnLCBcIlN1Z2dlc3RlZCBFZGl0c1wiKVxuXHRcdH0sIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2VkaXRvclBhbmUgPSBhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlLCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uLkFDVElWQVRFIH0pIGFzIE11bHRpRGlmZkVkaXRvciB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGFzeW5jIHN0b3AoY2xlYXJTdGF0ZSA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc3RvcFByb21pc2UgPz89IFByb21pc2UuYWxsU2V0dGxlZChbdGhpcy5fcGVyZm9ybVN0b3AoKSwgdGhpcy5zdG9yZVN0YXRlKCldKS50aGVuKCgpID0+IHsgfSk7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcFByb21pc2U7XG5cdFx0aWYgKGNsZWFyU3RhdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nU2Vzc2lvblN0b3JhZ2UsIHRoaXMuY2hhdFNlc3Npb25SZXNvdXJjZSkuY2xlYXJTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1TdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENsb3NlIG91dCBhbGwgb3BlbiBmaWxlc1xuXHRcdGNvbnN0IHNjaGVtZXMgPSBbQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LnNjaGVtZSwgQ2hhdEVkaXRpbmdUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIuc2NoZW1lXTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMuZmxhdE1hcChhc3luYyAoZykgPT4ge1xuXHRcdFx0cmV0dXJuIGcuZWRpdG9ycy5tYXAoYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0aWYgKChlIGluc3RhbmNlb2YgTXVsdGlEaWZmRWRpdG9ySW5wdXQgJiYgZS5pbml0aWFsUmVzb3VyY2VzPy5zb21lKHIgPT4gci5vcmlnaW5hbFVyaSAmJiBzY2hlbWVzLmluZGV4T2Yoci5vcmlnaW5hbFVyaS5zY2hlbWUpICE9PSAtMSkpXG5cdFx0XHRcdFx0fHwgKGUgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgJiYgZS5vcmlnaW5hbC5yZXNvdXJjZSAmJiBzY2hlbWVzLmluZGV4T2YoZS5vcmlnaW5hbC5yZXNvdXJjZS5zY2hlbWUpICE9PSAtMSkpIHtcblx0XHRcdFx0XHRhd2FpdCBnLmNsb3NlRWRpdG9yKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0dGhpcy5jbGVhckV4cGxhbmF0aW9ucygpO1xuXHRcdGRpc3Bvc2UodGhpcy5fZW50cmllc09icy5nZXQoKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXRlLnNldChDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpc0Rpc3Bvc2VkKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZS5nZXQoKSA9PT0gQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuRGlzcG9zZWQ7XG5cdH1cblxuXHRzdGFydFN0cmVhbWluZ0VkaXRzKHJlc291cmNlOiBVUkksIHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgaW5VbmRvU3RvcDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVN0cmVhbWluZ0VkaXRzIHtcblx0XHRjb25zdCBjb21wbGV0ZVByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Ly8gU2VxdWVuY2UgYWxsIGVkaXRzIG1hZGUgdGhpcyB0aGlzIHJlc291cmNlIGluIHRoaXMgc3RyZWFtaW5nIGVkaXRzIGluc3RhbmNlLFxuXHRcdC8vIGFuZCBhbHNvIHNlcXVlbmNlIHRoZSByZXNvdXJjZSBvdmVyYWxsIGluIHRoZSByYXJlIChjdXJyZW50bHkgaW52YWxpZD8pIGNhc2Vcblx0XHQvLyB0aGF0IGVkaXRzIGFyZSBtYWRlIGluIHBhcmFsbGVsIHRvIHRoZSBzYW1lIHJlc291cmNlLFxuXHRcdGNvbnN0IHNlcXVlbmNlciA9IG5ldyBUaHJvdHRsZWRTZXF1ZW5jZXIoMTUsIDEwMDApO1xuXHRcdHNlcXVlbmNlci5xdWV1ZSgoKSA9PiBzdGFydFByb21pc2UucCk7XG5cblx0XHQvLyBMb2NrIGFyb3VuZCBjcmVhdGluZyB0aGUgYmFzZWxpbmUgc28gd2UgZG9uJ3QgZmFpbCB0byByZXNvbHZlIG1vZGVsc1xuXHRcdC8vIGluIHRoZSBlZGl0IHBpbGxzIGlmIHRoZXkgcmVuZGVyIHF1aWNrbHlcblx0XHR0aGlzLl9iYXNlbGluZUNyZWF0aW9uTG9ja3MucXVldWUocmVzb3VyY2UucGF0aCwgKCkgPT4gc3RhcnRQcm9taXNlLnApO1xuXG5cdFx0dGhpcy5fc3RyZWFtaW5nRWRpdExvY2tzLnF1ZXVlKHJlc291cmNlLnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGNoYXRFZGl0aW5nU2Vzc2lvbklzUmVhZHkodGhpcyk7XG5cblx0XHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FjY2VwdFN0cmVhbWluZ0VkaXRzU3RhcnQocmVzcG9uc2VNb2RlbCwgaW5VbmRvU3RvcCwgcmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGFydFByb21pc2UuY29tcGxldGUoKTtcblx0XHRcdHJldHVybiBjb21wbGV0ZVByb21pc2UucDtcblx0XHR9KTtcblxuXG5cdFx0bGV0IGRpZENvbXBsZXRlID0gZmFsc2U7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cHVzaFRleHQ6IChlZGl0cywgaXNMYXN0RWRpdHMpID0+IHtcblx0XHRcdFx0c2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fYWNjZXB0RWRpdHMocmVzb3VyY2UsIGVkaXRzLCBpc0xhc3RFZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRwdXNoTm90ZWJvb2tDZWxsVGV4dDogKGNlbGwsIGVkaXRzLCBpc0xhc3RFZGl0cykgPT4ge1xuXHRcdFx0XHRzZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hY2NlcHRFZGl0cyhjZWxsLCBlZGl0cywgaXNMYXN0RWRpdHMsIHJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0cHVzaE5vdGVib29rOiAoZWRpdHMsIGlzTGFzdEVkaXRzKSA9PiB7XG5cdFx0XHRcdHNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2FjY2VwdEVkaXRzKHJlc291cmNlLCBlZGl0cywgaXNMYXN0RWRpdHMsIHJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0Y29tcGxldGU6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpZENvbXBsZXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGlkQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRzZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hY2NlcHRFZGl0cyhyZXNvdXJjZSwgW10sIHRydWUsIHJlc3BvbnNlTW9kZWwpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZShyZXNwb25zZU1vZGVsLnJlcXVlc3RJZCwgaW5VbmRvU3RvcCwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0Y29tcGxldGVQcm9taXNlLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHN0YXJ0RGVsZXRpb24ocmVzb3VyY2U6IFVSSSwgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCB1bmRvU3RvcElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXG5cdFx0Ly8gUXVldWUgdGhlIGRlbGV0aW9uIG9wZXJhdGlvbiB3aXRoIHByb3BlciBsb2NraW5nXG5cdFx0dGhpcy5fc3RyZWFtaW5nRWRpdExvY2tzLnF1ZXVlKHJlc291cmNlLnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBjaGF0RWRpdGluZ1Nlc3Npb25Jc1JlYWR5KHRoaXMpO1xuXG5cdFx0XHQvLyBDaGVjayBpZiBmaWxlIGV4aXN0c1xuXHRcdFx0bGV0IGZpbGVDb250ZW50OiBzdHJpbmc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdFx0XHRmaWxlQ29udGVudCA9IGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gRmlsZSBkb2Vzbid0IGV4aXN0LCBub3RoaW5nIHRvIGRlbGV0ZVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYENhbm5vdCBkZWxldGUgZmlsZSAke3Jlc291cmNlLnRvU3RyaW5nKCl9OiBmaWxlIGRvZXMgbm90IGV4aXN0YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlcmUncyBhbHJlYWR5IGFuIGVudHJ5IGZvciB0aGlzIGZpbGVcblx0XHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSB0aGlzLl9nZXRFbnRyeShyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdFbnRyeSkge1xuXHRcdFx0XHQvLyBJZiB0aGVyZSdzIGFscmVhZHkgYW4gZW50cnksIHdlIG5lZWQgdG8gaGFuZGxlIGl0IGRpZmZlcmVudGx5XG5cdFx0XHRcdC8vIEZvciBub3csIHdlJ2xsIGp1c3QgY29sbGFwc2UgaXQgYW5kIHByb2NlZWQgd2l0aCBkZWxldGlvblxuXHRcdFx0XHRleGlzdGluZ0VudHJ5LmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCkuZmlsdGVyKGUgPT4gZSAhPT0gZXhpc3RpbmdFbnRyeSk7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXNPYnMuc2V0KGVudHJpZXMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0b3JlIGluaXRpYWwgY29udGVudCBmb3IgdGltZWxpbmUgcmVzdG9yYXRpb25cblx0XHRcdGlmICghdGhpcy5faW5pdGlhbEZpbGVDb250ZW50cy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxGaWxlQ29udGVudHMuc2V0KHJlc291cmNlLCBmaWxlQ29udGVudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERlbGV0ZSB0aGUgZmlsZSBvbiBkaXNrXG5cdFx0XHRhd2FpdCB0aGlzLl9idWxrRWRpdFNlcnZpY2UuYXBwbHkoe1xuXHRcdFx0XHRlZGl0czogW3sgb2xkUmVzb3VyY2U6IHJlc291cmNlLCBvcHRpb25zOiB7IGlnbm9yZUlmTm90RXhpc3RzOiB0cnVlIH0gfV1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZWNvcmQgdGhlIGRlbGV0ZSBvcGVyYXRpb24gaW4gdGhlIHRpbWVsaW5lXG5cdFx0XHR0aGlzLl90aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKHtcblx0XHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuRGVsZXRlLFxuXHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IHJlc3BvbnNlTW9kZWwucmVxdWVzdElkLFxuXHRcdFx0XHRlcG9jaDogdGhpcy5fdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFx0ZmluYWxDb250ZW50OiBmaWxlQ29udGVudFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIGRlbGV0ZWQgZmlsZSBlbnRyeVxuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5SW5mbyA9IHRoaXMuX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsKTtcblx0XHRcdGNvbnN0IGxhbmd1YWdlU2VsZWN0aW9uID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5RmlsZXBhdGhPckZpcnN0TGluZShyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0RWRpdGluZ0RlbGV0ZWRGaWxlRW50cnksXG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRmaWxlQ29udGVudCxcblx0XHRcdFx0eyBjb2xsYXBzZTogKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpID0+IHRoaXMuX2NvbGxhcHNlKHJlc291cmNlLCB0eCkgfSxcblx0XHRcdFx0dGVsZW1ldHJ5SW5mbyxcblx0XHRcdFx0bGFuZ3VhZ2VTZWxlY3Rpb24ubGFuZ3VhZ2VJZFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQWRkIGVudHJ5IHRvIHRoZSBlbnRyaWVzIG9ic2VydmFibGVcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBbLi4udGhpcy5fZW50cmllc09icy5nZXQoKSwgZW50cnldO1xuXHRcdFx0dGhpcy5fZW50cmllc09icy5zZXQoZW50cmllcywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdGFwcGx5V29ya3NwYWNlRWRpdChlZGl0OiBJQ2hhdFdvcmtzcGFjZUVkaXQsIHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgdW5kb1N0b3BJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBmaWxlRWRpdCBvZiBlZGl0LmVkaXRzKSB7XG5cdFx0XHRpZiAoZmlsZUVkaXQub2xkUmVzb3VyY2UgJiYgIWZpbGVFZGl0Lm5ld1Jlc291cmNlKSB7XG5cdFx0XHRcdC8vIEZpbGUgZGVsZXRpb25cblx0XHRcdFx0dGhpcy5zdGFydERlbGV0aW9uKGZpbGVFZGl0Lm9sZFJlc291cmNlLCByZXNwb25zZU1vZGVsLCB1bmRvU3RvcElkKTtcblx0XHRcdH1cblx0XHRcdC8vIEZ1dHVyZTogaGFuZGxlIGZpbGUgY3JlYXRpb25zIGFuZCByZW5hbWVzXG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RhcnRFeHRlcm5hbEVkaXRzKHJlc3BvbnNlTW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbCwgb3BlcmF0aW9uSWQ6IG51bWJlciwgcmVzb3VyY2VzOiBVUklbXSwgdW5kb1N0b3BJZDogc3RyaW5nLCBjb250ZW50Rm9yPzogVVJJW10pOiBQcm9taXNlPElDaGF0UHJvZ3Jlc3NbXT4ge1xuXHRcdGNvbnN0IHNuYXBzaG90cyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCB1bmRlZmluZWQ+KCk7XG5cdFx0Y29uc3QgYWNxdWlyZWRMb2NrUHJvbWlzZXM6IERlZmVycmVkUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Y29uc3QgcmVsZWFzZUxvY2tQcm9taXNlczogRGVmZXJyZWRQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cdFx0Y29uc3QgdGVsZW1ldHJ5SW5mbyA9IHRoaXMuX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsKTtcblxuXHRcdGF3YWl0IGNoYXRFZGl0aW5nU2Vzc2lvbklzUmVhZHkodGhpcyk7XG5cblx0XHQvLyBBY3F1aXJlIGxvY2tzIGZvciBlYWNoIHJlc291cmNlIGFuZCB0YWtlIHNuYXBzaG90c1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzb3VyY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHJlc291cmNlc1tpXTtcblx0XHRcdGNvbnN0IGNvbnRlbnRTb3VyY2UgPSBjb250ZW50Rm9yPy5baV07XG5cdFx0XHRjb25zdCByZWxlYXNlTG9jayA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdHJlbGVhc2VMb2NrUHJvbWlzZXMucHVzaChyZWxlYXNlTG9jayk7XG5cblx0XHRcdGNvbnN0IGFjcXVpcmVkTG9jayA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGFjcXVpcmVkTG9ja1Byb21pc2VzLnB1c2goYWNxdWlyZWRMb2NrKTtcblxuXHRcdFx0dGhpcy5fc3RyZWFtaW5nRWRpdExvY2tzLnF1ZXVlKHJlc291cmNlLnRvU3RyaW5nKCksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdGFjcXVpcmVkTG9jay5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBpbml0aWFsQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY29udGVudFNvdXJjZSkge1xuXHRcdFx0XHRcdC8vIFJlYWQgdGhlIGJlZm9yZS1jb250ZW50IGZyb20gdGhlIHByb3ZpZGVkIFVSSSBpbnN0ZWFkIG9mIGRpc2tcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGNvbnRlbnRTb3VyY2UpO1xuXHRcdFx0XHRcdFx0aW5pdGlhbENvbnRlbnQgPSBkYXRhLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRpbml0aWFsQ29udGVudCA9ICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZSwgTm90RXhpc3RCZWhhdmlvci5BYm9ydCwgdGVsZW1ldHJ5SW5mbywgaW5pdGlhbENvbnRlbnQpO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hY2NlcHRTdHJlYW1pbmdFZGl0c1N0YXJ0KHJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wSWQsIHJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5vdGVib29rVXJpID0gQ2VsbFVyaS5wYXJzZShyZXNvdXJjZSk/Lm5vdGVib29rIHx8IHJlc291cmNlO1xuXHRcdFx0XHRwcm9ncmVzcy5wdXNoKC4uLmNyZWF0ZU9wZW5pbmdFZGl0Q29kZUJsb2NrKHJlc291cmNlLCB0aGlzLl9ub3RlYm9va1NlcnZpY2UuaGFzU3VwcG9ydGVkTm90ZWJvb2tzKG5vdGVib29rVXJpKSwgdW5kb1N0b3BJZCkpO1xuXG5cdFx0XHRcdGlmIChpbml0aWFsQ29udGVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRlbnRyeS5pbml0aWFsQ29udGVudCA9IGluaXRpYWxDb250ZW50O1xuXHRcdFx0XHRcdFx0YXdhaXQgZW50cnkucmVzZXRFZGl0VHJhY2tlclRvSW5pdGlhbENvbnRlbnQoKTsgLy8gaW4gY2FzZSBpdCdzIHJldXNlZFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzbmFwc2hvdHMuc2V0KHJlc291cmNlLCBpbml0aWFsQ29udGVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gU2F2ZSB0byBkaXNrIHRvIGVuc3VyZSBkaXNrIHN0YXRlIGlzIGN1cnJlbnQgYmVmb3JlIGV4dGVybmFsIGVkaXRzXG5cdFx0XHRcdFx0YXdhaXQgZW50cnk/LnNhdmUoKTtcblx0XHRcdFx0XHQvLyBUYWtlIHNuYXBzaG90IG9mIGN1cnJlbnQgc3RhdGVcblx0XHRcdFx0XHRzbmFwc2hvdHMuc2V0KHJlc291cmNlLCBlbnRyeSAmJiB0aGlzLl9nZXRDdXJyZW50VGV4dE9yTm90ZWJvb2tTbmFwc2hvdChlbnRyeSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVudHJ5Py5zdGFydEV4dGVybmFsRWRpdCgpO1xuXHRcdFx0XHRhY3F1aXJlZExvY2suY29tcGxldGUoKTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgbG9jayB0byBiZSByZWxlYXNlZCBieSBzdG9wRXh0ZXJuYWxFZGl0c1xuXHRcdFx0XHRyZXR1cm4gcmVsZWFzZUxvY2sucDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGFjcXVpcmVkTG9ja1Byb21pc2VzLm1hcChwID0+IHAucCkpO1xuXHRcdHRoaXMuY3JlYXRlU25hcHNob3QocmVzcG9uc2VNb2RlbC5yZXF1ZXN0SWQsIHVuZG9TdG9wSWQpO1xuXG5cdFx0Ly8gU3RvcmUgdGhlIG9wZXJhdGlvbiBzdGF0ZVxuXHRcdHRoaXMuX2V4dGVybmFsRWRpdE9wZXJhdGlvbnMuc2V0KG9wZXJhdGlvbklkLCB7XG5cdFx0XHRyZXNwb25zZU1vZGVsLFxuXHRcdFx0c25hcHNob3RzLFxuXHRcdFx0dW5kb1N0b3BJZCxcblx0XHRcdHJlbGVhc2VMb2NrczogKCkgPT4gcmVsZWFzZUxvY2tQcm9taXNlcy5mb3JFYWNoKHAgPT4gcC5jb21wbGV0ZSgpKVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHByb2dyZXNzO1xuXHR9XG5cblx0YXN5bmMgc3RvcEV4dGVybmFsRWRpdHMocmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLCBvcGVyYXRpb25JZDogbnVtYmVyLCBjb250ZW50Rm9yPzogVVJJW10pOiBQcm9taXNlPElDaGF0UHJvZ3Jlc3NbXT4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMuX2V4dGVybmFsRWRpdE9wZXJhdGlvbnMuZ2V0KG9wZXJhdGlvbklkKTtcblx0XHRpZiAoIW9wZXJhdGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBzdG9wRXh0ZXJuYWxFZGl0cyBjYWxsZWQgZm9yIHVua25vd24gb3BlcmF0aW9uICR7b3BlcmF0aW9uSWR9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dGhpcy5fZXh0ZXJuYWxFZGl0T3BlcmF0aW9ucy5kZWxldGUob3BlcmF0aW9uSWQpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSA9IFtdO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIEJ1aWxkIGEgbWFwIG9mIHJlc291cmNlIC0+IGNvbnRlbnRGb3IgVVJJXG5cdFx0XHRjb25zdCBjb250ZW50Rm9yTWFwID0gbmV3IFJlc291cmNlTWFwPFVSST4oKTtcblx0XHRcdGlmIChjb250ZW50Rm9yKSB7XG5cdFx0XHRcdGxldCBpZHggPSAwO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZV0gb2Ygb3BlcmF0aW9uLnNuYXBzaG90cykge1xuXHRcdFx0XHRcdGlmIChpZHggPCBjb250ZW50Rm9yLmxlbmd0aCAmJiBjb250ZW50Rm9yW2lkeF0pIHtcblx0XHRcdFx0XHRcdGNvbnRlbnRGb3JNYXAuc2V0KHJlc291cmNlLCBjb250ZW50Rm9yW2lkeF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZHgrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgZWFjaCByZXNvdXJjZSwgY29tcHV0ZSB0aGUgZGlmZiBhbmQgY3JlYXRlIGVkaXQgcGFydHNcblx0XHRcdGZvciAoY29uc3QgW3Jlc291cmNlLCBiZWZvcmVTbmFwc2hvdF0gb2Ygb3BlcmF0aW9uLnNuYXBzaG90cykge1xuXHRcdFx0XHRsZXQgZW50cnkgPSB0aGlzLl9nZXRFbnRyeShyZXNvdXJjZSk7XG5cblx0XHRcdFx0Ly8gRmlsZXMgdGhhdCBkaWQgbm90IGV4aXN0IG9uIGRpc2sgYmVmb3JlIG1heSBub3QgZXhpc3QgaW4gb3VyIHdvcmtpbmdcblx0XHRcdFx0Ly8gc2V0IHlldC4gQ3JlYXRlIHRob3NlIGlmIHRoYXQncyB0aGUgY2FzZS5cblx0XHRcdFx0aWYgKCFlbnRyeSAmJiBiZWZvcmVTbmFwc2hvdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZW50cnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlLCBOb3RFeGlzdEJlaGF2aW9yLkFib3J0LCB0aGlzLl9nZXRUZWxlbWV0cnlJbmZvRm9yTW9kZWwocmVzcG9uc2VNb2RlbCksICcnKTtcblx0XHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRcdGVudHJ5LnN0YXJ0RXh0ZXJuYWxFZGl0KCk7XG5cdFx0XHRcdFx0XHRlbnRyeS5hY2NlcHRTdHJlYW1pbmdFZGl0c1N0YXJ0KHJlc3BvbnNlTW9kZWwsIG9wZXJhdGlvbi51bmRvU3RvcElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBhZnRlclNuYXBzaG90OiBzdHJpbmc7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRTb3VyY2UgPSBjb250ZW50Rm9yTWFwLmdldChyZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChjb250ZW50U291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gUmVhZCBhZnRlci1jb250ZW50IGZyb20gdGhlIHByb3ZpZGVkIFVSSSBpbnN0ZWFkIG9mIGRpc2tcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGNvbnRlbnRTb3VyY2UpO1xuXHRcdFx0XHRcdFx0YWZ0ZXJTbmFwc2hvdCA9IGRhdGEudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChfZSkge1xuXHRcdFx0XHRcdFx0YWZ0ZXJTbmFwc2hvdCA9ICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBSZWxvYWQgZnJvbSBkaXNrIHRvIGVuc3VyZSBpbi1tZW1vcnkgbW9kZWwgaXMgaW4gc3luYyB3aXRoIGZpbGUgc3lzdGVtXG5cdFx0XHRcdFx0YXdhaXQgZW50cnkucmV2ZXJ0VG9EaXNrKCk7XG5cdFx0XHRcdFx0YWZ0ZXJTbmFwc2hvdCA9IHRoaXMuX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KGVudHJ5KSA/PyAnJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENvbXB1dGUgZWRpdHMgZnJvbSB0aGUgc25hcHNob3RzXG5cdFx0XHRcdGxldCBlZGl0czogKFRleHRFZGl0IHwgSUNlbGxFZGl0T3BlcmF0aW9uKVtdID0gW107XG5cdFx0XHRcdGlmIChiZWZvcmVTbmFwc2hvdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbih7XG5cdFx0XHRcdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUsXG5cdFx0XHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRcdFx0cmVxdWVzdElkOiByZXNwb25zZU1vZGVsLnJlcXVlc3RJZCxcblx0XHRcdFx0XHRcdGVwb2NoOiB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0XHRcdFx0aW5pdGlhbENvbnRlbnQ6IGFmdGVyU25hcHNob3QsXG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnlJbmZvOiBlbnRyeS50ZWxlbWV0cnlJbmZvLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRzID0gYXdhaXQgZW50cnkuY29tcHV0ZUVkaXRzRnJvbVNuYXBzaG90cyhiZWZvcmVTbmFwc2hvdCwgYWZ0ZXJTbmFwc2hvdCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb3JkRWRpdE9wZXJhdGlvbnMoZW50cnksIHJlc291cmNlLCBlZGl0cywgcmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcm9ncmVzcy5wdXNoKGVudHJ5IGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkgPyB7XG5cdFx0XHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRlZGl0czogZWRpdHMgYXMgSUNlbGxFZGl0T3BlcmF0aW9uW10sXG5cdFx0XHRcdFx0ZG9uZTogdHJ1ZSxcblx0XHRcdFx0XHRpc0V4dGVybmFsRWRpdDogdHJ1ZVxuXHRcdFx0XHR9IDoge1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRlZGl0czogZWRpdHMgYXMgVGV4dEVkaXRbXSxcblx0XHRcdFx0XHRkb25lOiB0cnVlLFxuXHRcdFx0XHRcdGlzRXh0ZXJuYWxFZGl0OiB0cnVlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIE1hcmsgYXMgbm8gbG9uZ2VyIGJlaW5nIG1vZGlmaWVkXG5cdFx0XHRcdGF3YWl0IGVudHJ5LmFjY2VwdFN0cmVhbWluZ0VkaXRzRW5kKCk7XG5cblx0XHRcdFx0Ly8gQWNjZXB0IHRoZSBjaGFuZ2VzIGZvciBiYWNrZ3JvdW5kIHNlc3Npb25zXG5cdFx0XHRcdGlmIChnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5jaGF0U2Vzc2lvblJlc291cmNlKSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5hY2NlcHQoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENsZWFyIGV4dGVybmFsIGVkaXQgbW9kZVxuXHRcdFx0XHRlbnRyeS5zdG9wRXh0ZXJuYWxFZGl0KCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIFJlbGVhc2UgYWxsIHRoZSBsb2Nrc1xuXHRcdFx0b3BlcmF0aW9uLnJlbGVhc2VMb2NrcygpO1xuXG5cdFx0XHRjb25zdCBoYXNPdGhlclRhc2tzID0gSXRlcmFibGUuc29tZSh0aGlzLl9zdHJlYW1pbmdFZGl0TG9ja3Mua2V5cygpLCBrID0+ICFvcGVyYXRpb24uc25hcHNob3RzLmhhcyhVUkkucGFyc2UoaykpKTtcblx0XHRcdGlmICghaGFzT3RoZXJUYXNrcykge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQoQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdHJldHVybiBwcm9ncmVzcztcblx0fVxuXG5cdGFzeW5jIHVuZG9JbnRlcmFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl90aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHR9XG5cblx0YXN5bmMgcmVkb0ludGVyYWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3RpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdH1cblxuXHRhc3luYyB0cmlnZ2VyRXhwbGFuYXRpb25HZW5lcmF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENsZWFyIGFueSBleGlzdGluZyBleHBsYW5hdGlvbnMgZmlyc3Rcblx0XHR0aGlzLmNsZWFyRXhwbGFuYXRpb25zKCk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fZW50cmllc09icy5nZXQoKTtcblx0XHRjb25zdCBkaWZmSW5mb3M6IElFeHBsYW5hdGlvbkRpZmZJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmIChlbnRyeSBpbnN0YW5jZW9mIENoYXRFZGl0aW5nTW9kaWZpZWREb2N1bWVudEVudHJ5KSB7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBhd2FpdCBlbnRyeS5nZXREaWZmSW5mbygpO1xuXHRcdFx0XHRkaWZmSW5mb3MucHVzaCh7XG5cdFx0XHRcdFx0Y2hhbmdlczogZGlmZi5jaGFuZ2VzLFxuXHRcdFx0XHRcdGlkZW50aWNhbDogZGlmZi5pZGVudGljYWwsXG5cdFx0XHRcdFx0b3JpZ2luYWxNb2RlbDogZW50cnkub3JpZ2luYWxNb2RlbCxcblx0XHRcdFx0XHRtb2RpZmllZE1vZGVsOiBlbnRyeS5tb2RpZmllZE1vZGVsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGlmZkluZm9zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2V4cGxhbmF0aW9uSGFuZGxlID0gdGhpcy5fZXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIuZ2VuZXJhdGVFeHBsYW5hdGlvbnMoZGlmZkluZm9zLCB0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXdhaXQgdGhpcy5fZXhwbGFuYXRpb25IYW5kbGUuY29tcGxldGVkO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyRXhwbGFuYXRpb25zKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9leHBsYW5hdGlvbkhhbmRsZSkge1xuXHRcdFx0dGhpcy5fZXhwbGFuYXRpb25IYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZXhwbGFuYXRpb25IYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0aGFzRXhwbGFuYXRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9leHBsYW5hdGlvbkhhbmRsZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkRWRpdE9wZXJhdGlvbnMoZW50cnk6IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSwgcmVzb3VyY2U6IFVSSSwgZWRpdHM6IChUZXh0RWRpdCB8IElDZWxsRWRpdE9wZXJhdGlvbilbXSwgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsKTogdm9pZCB7XG5cdFx0Ly8gRGV0ZXJtaW5lIGlmIHRoZXNlIGFyZSB0ZXh0IGVkaXRzIG9yIG5vdGVib29rIGVkaXRzXG5cdFx0Y29uc3QgaXNOb3RlYm9va0VkaXRzID0gZWRpdHMubGVuZ3RoID4gMCAmJiBoYXNLZXkoZWRpdHNbMF0sIHsgY2VsbHM6IHRydWUgfSk7XG5cblx0XHRpZiAoaXNOb3RlYm9va0VkaXRzKSB7XG5cdFx0XHQvLyBSZWNvcmQgbm90ZWJvb2sgZWRpdCBvcGVyYXRpb25cblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdHMgPSBlZGl0cyBhcyBJQ2VsbEVkaXRPcGVyYXRpb25bXTtcblx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oe1xuXHRcdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5Ob3RlYm9va0VkaXQsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2VNb2RlbC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGVwb2NoOiB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0XHRjZWxsRWRpdHM6IG5vdGVib29rRWRpdHNcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgY2VsbEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSkge1xuXHRcdFx0XHRjb25zdCBjZWxsVXJpID0gQ2VsbFVyaS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChjZWxsVXJpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaSA9IGVudHJ5LmdldEluZGV4T2ZDZWxsSGFuZGxlKGNlbGxVcmkuaGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoaSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNlbGxJbmRleCA9IGk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRleHRFZGl0cyA9IGVkaXRzIGFzIFRleHRFZGl0W107XG5cdFx0XHR0aGlzLl90aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKHtcblx0XHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuVGV4dEVkaXQsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2VNb2RlbC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGVwb2NoOiB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0XHRlZGl0czogdGV4dEVkaXRzLFxuXHRcdFx0XHRjZWxsSW5kZXgsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXJyZW50VGV4dE9yTm90ZWJvb2tTbmFwc2hvdChlbnRyeTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5KTogc3RyaW5nIHtcblx0XHRpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeSkge1xuXHRcdFx0cmV0dXJuIGVudHJ5LmdldEN1cnJlbnRTbmFwc2hvdCgpO1xuXHRcdH0gZWxzZSBpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ01vZGlmaWVkRG9jdW1lbnRFbnRyeSkge1xuXHRcdFx0cmV0dXJuIGVudHJ5LmdldEN1cnJlbnRDb250ZW50cygpO1xuXHRcdH0gZWxzZSBpZiAoZW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ0RlbGV0ZWRGaWxlRW50cnkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIGVudHJ5IHR5cGUgZm9yICR7ZW50cnkubW9kaWZpZWRVUkl9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNjZXB0U3RyZWFtaW5nRWRpdHNTdGFydChyZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2UsIE5vdEV4aXN0QmVoYXZpb3IuQ3JlYXRlLCB0aGlzLl9nZXRUZWxlbWV0cnlJbmZvRm9yTW9kZWwocmVzcG9uc2VNb2RlbCkpO1xuXG5cdFx0Ly8gUmVjb3JkIGZpbGUgYmFzZWxpbmUgaWYgdGhpcyBpcyB0aGUgZmlyc3QgZWRpdCBmb3IgdGhpcyBmaWxlIGluIHRoaXMgcmVxdWVzdFxuXHRcdGlmICghdGhpcy5fdGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHJlc291cmNlLCByZXNwb25zZU1vZGVsLnJlcXVlc3RJZCkpIHtcblx0XHRcdHRoaXMuX3RpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh7XG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2VNb2RlbC5yZXF1ZXN0SWQsXG5cdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX2dldEN1cnJlbnRUZXh0T3JOb3RlYm9va1NuYXBzaG90KGVudHJ5KSxcblx0XHRcdFx0ZXBvY2g6IHRoaXMuX3RpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRcdHRlbGVtZXRyeUluZm86IGVudHJ5LnRlbGVtZXRyeUluZm8sXG5cdFx0XHRcdG5vdGVib29rVmlld1R5cGU6IGVudHJ5IGluc3RhbmNlb2YgQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkgPyBlbnRyeS52aWV3VHlwZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLlN0cmVhbWluZ0VkaXRzLCB0eCk7XG5cdFx0XHRlbnRyeS5hY2NlcHRTdHJlYW1pbmdFZGl0c1N0YXJ0KHJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wLCB0eCk7XG5cdFx0XHQvLyBOb3RlOiBJbmRpdmlkdWFsIGVkaXQgb3BlcmF0aW9ucyB3aWxsIGJlIHJlY29yZGVkIGJ5IHRoZSBmaWxlIGVudHJpZXNcblx0XHR9KTtcblxuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luaXRFbnRyaWVzKHsgZW50cmllcyB9OiBJQ2hhdEVkaXRpbmdTZXNzaW9uU3RvcCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlc2V0IGFsbCB0aGUgZmlsZXMgd2hpY2ggYXJlIG1vZGlmaWVkIGluIHRoaXMgc2Vzc2lvbiBzdGF0ZVxuXHRcdC8vIGJ1dCB3aGljaCBhcmUgbm90IGZvdW5kIGluIHRoZSBzbmFwc2hvdFxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fZW50cmllc09icy5nZXQoKSkge1xuXHRcdFx0Y29uc3Qgc25hcHNob3RFbnRyeSA9IGVudHJpZXMuZ2V0KGVudHJ5Lm1vZGlmaWVkVVJJKTtcblx0XHRcdGlmICghc25hcHNob3RFbnRyeSkge1xuXHRcdFx0XHRhd2FpdCBlbnRyeS5yZXNldFRvSW5pdGlhbENvbnRlbnQoKTtcblx0XHRcdFx0ZW50cnkuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXNBcnI6IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeVtdID0gW107XG5cdFx0Ly8gUmVzdG9yZSBhbGwgZW50cmllcyBmcm9tIHRoZSBzbmFwc2hvdFxuXHRcdGZvciAoY29uc3Qgc25hcHNob3RFbnRyeSBvZiBlbnRyaWVzLnZhbHVlcygpKSB7XG5cdFx0XHRsZXQgZW50cnk6IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHNuYXBzaG90RW50cnkuaXNEZWxldGVkKSB7XG5cdFx0XHRcdC8vIENyZWF0ZSBhIGRlbGV0ZWQgZmlsZSBlbnRyeVxuXHRcdFx0XHRlbnRyeSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdENoYXRFZGl0aW5nRGVsZXRlZEZpbGVFbnRyeSxcblx0XHRcdFx0XHRzbmFwc2hvdEVudHJ5LnJlc291cmNlLFxuXHRcdFx0XHRcdHNuYXBzaG90RW50cnkub3JpZ2luYWwsIC8vIG9yaWdpbmFsIGNvbnRlbnQgYmVmb3JlIGRlbGV0aW9uXG5cdFx0XHRcdFx0eyBjb2xsYXBzZTogKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpID0+IHRoaXMuX2NvbGxhcHNlKHNuYXBzaG90RW50cnkucmVzb3VyY2UsIHR4KSB9LFxuXHRcdFx0XHRcdHNuYXBzaG90RW50cnkudGVsZW1ldHJ5SW5mbyxcblx0XHRcdFx0XHRzbmFwc2hvdEVudHJ5Lmxhbmd1YWdlSWRcblx0XHRcdFx0KTtcblx0XHRcdFx0YXdhaXQgZW50cnkucmVzdG9yZUZyb21TbmFwc2hvdChzbmFwc2hvdEVudHJ5LCBmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlTW9kaWZpZWRGaWxlRW50cnkoc25hcHNob3RFbnRyeS5yZXNvdXJjZSwgTm90RXhpc3RCZWhhdmlvci5BYm9ydCwgc25hcHNob3RFbnRyeS50ZWxlbWV0cnlJbmZvKTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdG9yZVRvRGlzayA9IHNuYXBzaG90RW50cnkuc3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQ7XG5cdFx0XHRcdFx0YXdhaXQgZW50cnkucmVzdG9yZUZyb21TbmFwc2hvdChzbmFwc2hvdEVudHJ5LCByZXN0b3JlVG9EaXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0ZW50cmllc0Fyci5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzQXJyLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RWRpdGluZ1Nlc3Npb25JbmZvRXZlbnQsIENoYXRFZGl0aW5nU2Vzc2lvbkluZm9DbGFzc2lmaWNhdGlvbj4oJ2NoYXRFZGl0aW5nL3Nlc3Npb25SZXN0b3JlJywge1xuXHRcdFx0ZWRpdFNlc3Npb25JZDogZ2V0S2V5Rm9yQ2hhdFNlc3Npb25SZXNvdXJjZSh0aGlzLmNoYXRTZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0Li4udGhpcy5fY291bnRFbnRyeVN0YXRlcyhlbnRyaWVzQXJyKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjY2VwdEVkaXRzKHJlc291cmNlOiBVUkksIHRleHRFZGl0czogKFRleHRFZGl0IHwgSUNlbGxFZGl0T3BlcmF0aW9uKVtdLCBpc0xhc3RFZGl0czogYm9vbGVhbiwgcmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB0aGlzLl9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlLCBOb3RFeGlzdEJlaGF2aW9yLkNyZWF0ZSwgdGhpcy5fZ2V0VGVsZW1ldHJ5SW5mb0Zvck1vZGVsKHJlc3BvbnNlTW9kZWwpKTtcblxuXHRcdC8vIFJlY29yZCBlZGl0IG9wZXJhdGlvbnMgaW4gdGhlIHRpbWVsaW5lIGlmIHRoZXJlIGFyZSBhY3R1YWwgZWRpdHNcblx0XHRpZiAodGV4dEVkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3JlY29yZEVkaXRPcGVyYXRpb25zKGVudHJ5LCByZXNvdXJjZSwgdGV4dEVkaXRzLCByZXNwb25zZU1vZGVsKTtcblx0XHR9XG5cblx0XHRhd2FpdCBlbnRyeS5hY2NlcHRBZ2VudEVkaXRzKHJlc291cmNlLCB0ZXh0RWRpdHMsIGlzTGFzdEVkaXRzLCByZXNwb25zZU1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRlbGVtZXRyeUluZm9Gb3JNb2RlbChyZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwpOiBJTW9kaWZpZWRFbnRyeVRlbGVtZXRyeUluZm8ge1xuXHRcdC8vIE1ha2UgdGhlc2UgZ2V0dGVycyBiZWNhdXNlIHRoZSByZXNwb25zZSByZXN1bHQgaXMgbm90IGF2YWlsYWJsZSB3aGVuIHRoZSBmaWxlIGZpcnN0IHN0YXJ0cyB0byBiZSBlZGl0ZWRcblx0XHRyZXR1cm4gbmV3IGNsYXNzIGltcGxlbWVudHMgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvIHtcblx0XHRcdGdldCBhZ2VudElkKCkgeyByZXR1cm4gcmVzcG9uc2VNb2RlbC5hZ2VudD8uaWQ7IH1cblx0XHRcdGdldCBtb2RlbElkKCkgeyByZXR1cm4gcmVzcG9uc2VNb2RlbC5yZXF1ZXN0Py5tb2RlbElkOyB9XG5cdFx0XHRnZXQgbW9kZUlkKCkgeyByZXR1cm4gcmVzcG9uc2VNb2RlbC5yZXF1ZXN0Py5tb2RlSW5mbz8udGVsZW1ldHJ5TW9kZUlkOyB9XG5cdFx0XHRnZXQgY29tbWFuZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwuc2xhc2hDb21tYW5kPy5uYW1lOyB9XG5cdFx0XHRnZXQgc2Vzc2lvblJlc291cmNlKCkgeyByZXR1cm4gcmVzcG9uc2VNb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZTsgfVxuXHRcdFx0Z2V0IHJlcXVlc3RJZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwucmVxdWVzdElkOyB9XG5cdFx0XHRnZXQgcmVzdWx0KCkgeyByZXR1cm4gcmVzcG9uc2VNb2RlbC5yZXN1bHQ7IH1cblx0XHRcdGdldCBhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZCgpIHsgcmV0dXJuIHJlc3BvbnNlTW9kZWwucmVxdWVzdD8ubW9kZUluZm8/LmFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOyB9XG5cblx0XHRcdGdldCBmZWF0dXJlKCk6ICdzaWRlQmFyQ2hhdCcgfCAnaW5saW5lQ2hhdCcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRpZiAocmVzcG9uc2VNb2RlbC5zZXNzaW9uLmluaXRpYWxMb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkge1xuXHRcdFx0XHRcdHJldHVybiAnc2lkZUJhckNoYXQnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc3BvbnNlTW9kZWwuc2Vzc2lvbi5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSkge1xuXHRcdFx0XHRcdHJldHVybiAnaW5saW5lQ2hhdCc7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY291bnRFbnRyeVN0YXRlcyhlbnRyaWVzOiByZWFkb25seSBBYnN0cmFjdENoYXRFZGl0aW5nTW9kaWZpZWRGaWxlRW50cnlbXSk6IHsgZW50cnlDb3VudDogbnVtYmVyOyBtb2RpZmllZENvdW50OiBudW1iZXI7IGFjY2VwdGVkQ291bnQ6IG51bWJlcjsgcmVqZWN0ZWRDb3VudDogbnVtYmVyIH0ge1xuXHRcdGxldCBlbnRyeUNvdW50ID0gMDtcblx0XHRsZXQgbW9kaWZpZWRDb3VudCA9IDA7XG5cdFx0bGV0IGFjY2VwdGVkQ291bnQgPSAwO1xuXHRcdGxldCByZWplY3RlZENvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGVudHJ5Q291bnQgKz0gMTtcblx0XHRcdHN3aXRjaCAoZW50cnkuc3RhdGUuZ2V0KCkpIHtcblx0XHRcdFx0Y2FzZSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkOlxuXHRcdFx0XHRcdG1vZGlmaWVkQ291bnQgKz0gMTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkOlxuXHRcdFx0XHRcdGFjY2VwdGVkQ291bnQgKz0gMTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkOlxuXHRcdFx0XHRcdHJlamVjdGVkQ291bnQgKz0gMTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgZW50cnlDb3VudCwgbW9kaWZpZWRDb3VudCwgYWNjZXB0ZWRDb3VudCwgcmVqZWN0ZWRDb3VudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZShyZXF1ZXN0SWQ6IHN0cmluZywgdW5kb1N0b3A6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhhc090aGVyVGFza3MgPSBJdGVyYWJsZS5zb21lKHRoaXMuX3N0cmVhbWluZ0VkaXRMb2Nrcy5rZXlzKCksIGsgPT4gayAhPT0gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0aWYgKCFoYXNPdGhlclRhc2tzKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUuSWRsZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2dldEVudHJ5KHJlc291cmNlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGNoZWNrcG9pbnQgZm9yIHRoaXMgZWRpdCBjb21wbGV0aW9uXG5cdFx0Y29uc3QgbGFiZWwgPSB1bmRvU3RvcCA/IGBSZXF1ZXN0ICR7cmVxdWVzdElkfSAtIFN0b3AgJHt1bmRvU3RvcH1gIDogYFJlcXVlc3QgJHtyZXF1ZXN0SWR9YDtcblx0XHR0aGlzLl90aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KHJlcXVlc3RJZCwgdW5kb1N0b3AsIGxhYmVsKTtcblxuXHRcdHJldHVybiBlbnRyeS5hY2NlcHRTdHJlYW1pbmdFZGl0c0VuZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHJpZXZlcyBvciBjcmVhdGVzIGEgbW9kaWZpZWQgZmlsZSBlbnRyeS5cblx0ICpcblx0ICogQHJldHVybnMgVGhlIG1vZGlmaWVkIGZpbGUgZW50cnkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nZXRPckNyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlOiBVUkksIGlmTm90RXhpc3RzOiBOb3RFeGlzdEJlaGF2aW9yLkNyZWF0ZSwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBpbml0aWFsQ29udGVudD86IHN0cmluZyk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5Pjtcblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZTogVVJJLCBpZk5vdEV4aXN0czogTm90RXhpc3RCZWhhdmlvciwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBpbml0aWFsQ29udGVudD86IHN0cmluZyk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVNb2RpZmllZEZpbGVFbnRyeShyZXNvdXJjZTogVVJJLCBpZk5vdEV4aXN0czogTm90RXhpc3RCZWhhdmlvciwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBfaW5pdGlhbENvbnRlbnQ/OiBzdHJpbmcpOiBQcm9taXNlPEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0cmVzb3VyY2UgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKT8ubm90ZWJvb2sgPz8gcmVzb3VyY2U7XG5cblx0XHRjb25zdCBleGlzdGluZ0VudHJ5ID0gdGhpcy5fZW50cmllc09icy5nZXQoKS5maW5kKGUgPT4gaXNFcXVhbChlLm1vZGlmaWVkVVJJLCByZXNvdXJjZSkpO1xuXHRcdGlmIChleGlzdGluZ0VudHJ5KSB7XG5cdFx0XHQvLyBJZiB0aGUgZXhpc3RpbmcgZW50cnkgaXMgYSBkZWxldGVkIGZpbGUgZW50cnksIHdlIG5lZWQgdG8gcmVwbGFjZSBpdCB3aXRoIGEgbmV3IG1vZGlmaWVkIGVudHJ5XG5cdFx0XHQvLyBUaGlzIGhhbmRsZXMgdGhlIGNhc2Ugd2hlcmUgYSBmaWxlIHdhcyBkZWxldGVkIGFuZCB0aGVuIHJlY3JlYXRlZFxuXHRcdFx0aWYgKGV4aXN0aW5nRW50cnkgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ0RlbGV0ZWRGaWxlRW50cnkpIHtcblx0XHRcdFx0Ly8gVXNlIHRoZSBvcmlnaW5hbCBjb250ZW50IGZyb20gdGhlIGRlbGV0ZWQgZW50cnkgYXMgdGhlIGluaXRpYWwgY29udGVudCBmb3IgdGhlIG5ldyBlbnRyeVxuXHRcdFx0XHRjb25zdCBpbml0aWFsQ29udGVudEZyb21EZWxldGVkID0gZXhpc3RpbmdFbnRyeS5zdGF0ZS5nZXQoKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZFxuXHRcdFx0XHRcdD8gZXhpc3RpbmdFbnRyeS5pbml0aWFsQ29udGVudFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgZGVsZXRlZCBlbnRyeVxuXHRcdFx0XHRleGlzdGluZ0VudHJ5LmRpc3Bvc2UoKTtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VudHJpZXNPYnMuZ2V0KCkuZmlsdGVyKGUgPT4gZSAhPT0gZXhpc3RpbmdFbnRyeSk7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXNPYnMuc2V0KGVudHJpZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gU2V0IHRoZSBpbml0aWFsIGNvbnRlbnQgZnJvbSB0aGUgZGVsZXRlZCBlbnRyeSBpZiBpdCB3YXMgc3RpbGwgaW4gbW9kaWZpZWQgc3RhdGVcblx0XHRcdFx0aWYgKGluaXRpYWxDb250ZW50RnJvbURlbGV0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdF9pbml0aWFsQ29udGVudCA9IGluaXRpYWxDb250ZW50RnJvbURlbGV0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRmFsbCB0aHJvdWdoIHRvIGNyZWF0ZSBhIG5ldyBlbnRyeVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRlbGVtZXRyeUluZm8ucmVxdWVzdElkICE9PSBleGlzdGluZ0VudHJ5LnRlbGVtZXRyeUluZm8ucmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmdFbnRyeS51cGRhdGVUZWxlbWV0cnlJbmZvKHRlbGVtZXRyeUluZm8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ0VudHJ5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBlbnRyeTogQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5O1xuXHRcdGNvbnN0IGV4aXN0aW5nRXh0ZXJuYWxFbnRyeSA9IHRoaXMuX2xvb2t1cEV4dGVybmFsRW50cnkocmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZ0V4dGVybmFsRW50cnkpIHtcblx0XHRcdGVudHJ5ID0gZXhpc3RpbmdFeHRlcm5hbEVudHJ5O1xuXG5cdFx0XHRpZiAodGVsZW1ldHJ5SW5mby5yZXF1ZXN0SWQgIT09IGVudHJ5LnRlbGVtZXRyeUluZm8ucmVxdWVzdElkKSB7XG5cdFx0XHRcdGVudHJ5LnVwZGF0ZVRlbGVtZXRyeUluZm8odGVsZW1ldHJ5SW5mbyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluaXRpYWxDb250ZW50ID0gX2luaXRpYWxDb250ZW50ID8/IHRoaXMuX2luaXRpYWxGaWxlQ29udGVudHMuZ2V0KHJlc291cmNlKTtcblx0XHRcdC8vIFRoaXMgZ2V0cyBtYW51YWxseSBkaXNwb3NlZCBpbiAuZGlzcG9zZSgpIG9yIGluIC5yZXN0b3JlU25hcHNob3QoKVxuXHRcdFx0Y29uc3QgbWF5YmVFbnRyeSA9IGF3YWl0IHRoaXMuX2NyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlLCB0ZWxlbWV0cnlJbmZvLCBpZk5vdEV4aXN0cywgaW5pdGlhbENvbnRlbnQpO1xuXHRcdFx0aWYgKCFtYXliZUVudHJ5KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRlbnRyeSA9IG1heWJlRW50cnk7XG5cdFx0XHRpZiAoaW5pdGlhbENvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsRmlsZUNvbnRlbnRzLnNldChyZXNvdXJjZSwgZW50cnkuaW5pdGlhbENvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIGFuIGVudHJ5IGlzIGRlbGV0ZWQgZS5nLiByZXZlcnRpbmcgYSBjcmVhdGVkIGZpbGUsXG5cdFx0Ly8gcmVtb3ZlIGl0IGZyb20gdGhlIGVudHJpZXMgYW5kIGRvbid0IHNob3cgaXQgaW4gdGhlIHdvcmtpbmcgc2V0IGFueW1vcmVcblx0XHQvLyBzbyB0aGF0IGl0IGNhbiBiZSByZWNyZWF0ZWQgZS5nLiB0aHJvdWdoIHJldHJ5XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBlbnRyeS5vbkRpZERlbGV0ZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdFbnRyaWVzID0gdGhpcy5fZW50cmllc09icy5nZXQoKS5maWx0ZXIoZSA9PiAhaXNFcXVhbChlLm1vZGlmaWVkVVJJLCBlbnRyeS5tb2RpZmllZFVSSSkpO1xuXHRcdFx0dGhpcy5fZW50cmllc09icy5zZXQobmV3RW50cmllcywgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3JzKHRoaXMuX2VkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMoZW50cnkubW9kaWZpZWRVUkkpKTtcblxuXHRcdFx0aWYgKCFleGlzdGluZ0V4dGVybmFsRW50cnkpIHtcblx0XHRcdFx0Ly8gZG9uJ3QgZGlzcG9zZSBlbnRyaWVzIHRoYXQgYXJlIG5vdCB5b3VycyFcblx0XHRcdFx0ZW50cnkuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUobGlzdGVuZXIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChsaXN0ZW5lcik7XG5cblx0XHRjb25zdCBlbnRyaWVzQXJyID0gWy4uLnRoaXMuX2VudHJpZXNPYnMuZ2V0KCksIGVudHJ5XTtcblx0XHR0aGlzLl9lbnRyaWVzT2JzLnNldChlbnRyaWVzQXJyLCB1bmRlZmluZWQpO1xuXG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2U6IFVSSSwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBpZk5vdEV4aXN0czogTm90RXhpc3RCZWhhdmlvci5DcmVhdGUsIGluaXRpYWxDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeT47XG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZU1vZGlmaWVkRmlsZUVudHJ5KHJlc291cmNlOiBVUkksIHRlbGVtZXRyeUluZm86IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbywgaWZOb3RFeGlzdHM6IE5vdEV4aXN0QmVoYXZpb3IsIGluaXRpYWxDb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlTW9kaWZpZWRGaWxlRW50cnkocmVzb3VyY2U6IFVSSSwgdGVsZW1ldHJ5SW5mbzogSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvLCBpZk5vdEV4aXN0czogTm90RXhpc3RCZWhhdmlvciwgaW5pdGlhbENvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8QWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbXVsdGlEaWZmRW50cnlEZWxlZ2F0ZSA9IHtcblx0XHRcdGNvbGxhcHNlOiAodHJhbnNhY3Rpb246IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4gdGhpcy5fY29sbGFwc2UocmVzb3VyY2UsIHRyYW5zYWN0aW9uKSxcblx0XHRcdHJlY29yZE9wZXJhdGlvbjogKG9wZXJhdGlvbjogTXV0YWJsZTxGaWxlT3BlcmF0aW9uPikgPT4ge1xuXHRcdFx0XHRvcGVyYXRpb24uZXBvY2ggPSB0aGlzLl90aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdFx0XHR0aGlzLl90aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKG9wZXJhdGlvbik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBDZWxsVXJpLnBhcnNlKHJlc291cmNlKT8ubm90ZWJvb2sgfHwgcmVzb3VyY2U7XG5cdFx0Y29uc3QgZG9DcmVhdGUgPSBhc3luYyAoY2hhdEtpbmQ6IENoYXRFZGl0S2luZCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX25vdGVib29rU2VydmljZS5oYXNTdXBwb3J0ZWROb3RlYm9va3Mobm90ZWJvb2tVcmkpKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBDaGF0RWRpdGluZ01vZGlmaWVkTm90ZWJvb2tFbnRyeS5jcmVhdGUobm90ZWJvb2tVcmksIG11bHRpRGlmZkVudHJ5RGVsZWdhdGUsIHRlbGVtZXRyeUluZm8sIGNoYXRLaW5kLCBpbml0aWFsQ29udGVudCwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ01vZGlmaWVkRG9jdW1lbnRFbnRyeSwgcmVmLCBtdWx0aURpZmZFbnRyeURlbGVnYXRlLCB0ZWxlbWV0cnlJbmZvLCBjaGF0S2luZCwgaW5pdGlhbENvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGRvQ3JlYXRlKENoYXRFZGl0S2luZC5Nb2RpZmllZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoaWZOb3RFeGlzdHMgPT09IE5vdEV4aXN0QmVoYXZpb3IuQWJvcnQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhpcyBmaWxlIGRvZXMgbm90IGV4aXN0IHlldCwgY3JlYXRlIGl0IGFuZCB0cnkgYWdhaW5cblx0XHRcdGF3YWl0IHRoaXMuX2J1bGtFZGl0U2VydmljZS5hcHBseSh7IGVkaXRzOiBbeyBuZXdSZXNvdXJjZTogcmVzb3VyY2UgfV0gfSk7XG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWNjZXNzaWJpbGl0eS5vcGVuQ2hhdEVkaXRlZEZpbGVzJykpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UsIG9wdGlvbnM6IHsgaW5hY3RpdmU6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIHBpbm5lZDogdHJ1ZSwgaXNFeHBsaWNpdDogZmFsc2UgfSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVjb3JkIGZpbGUgY3JlYXRpb24gb3BlcmF0aW9uXG5cdFx0XHR0aGlzLl90aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKHtcblx0XHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuQ3JlYXRlLFxuXHRcdFx0XHR1cmk6IHJlc291cmNlLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IHRlbGVtZXRyeUluZm8ucmVxdWVzdElkLFxuXHRcdFx0XHRlcG9jaDogdGhpcy5fdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFx0aW5pdGlhbENvbnRlbnQ6IGluaXRpYWxDb250ZW50IHx8ICcnLFxuXHRcdFx0XHR0ZWxlbWV0cnlJbmZvLFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLl9ub3RlYm9va1NlcnZpY2UuaGFzU3VwcG9ydGVkTm90ZWJvb2tzKG5vdGVib29rVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgQ2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuY3JlYXRlKHJlc291cmNlLCBtdWx0aURpZmZFbnRyeURlbGVnYXRlLCB0ZWxlbWV0cnlJbmZvLCBDaGF0RWRpdEtpbmQuQ3JlYXRlZCwgaW5pdGlhbENvbnRlbnQsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBkb0NyZWF0ZShDaGF0RWRpdEtpbmQuQ3JlYXRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGFwc2UocmVzb3VyY2U6IFVSSSwgdHJhbnNhY3Rpb246IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG11bHRpRGlmZkl0ZW0gPSB0aGlzLl9lZGl0b3JQYW5lPy5maW5kRG9jdW1lbnREaWZmSXRlbShyZXNvdXJjZSk7XG5cdFx0aWYgKG11bHRpRGlmZkl0ZW0pIHtcblx0XHRcdHRoaXMuX2VkaXRvclBhbmU/LnZpZXdNb2RlbD8uaXRlbXMuZ2V0KCkuZmluZCgoZG9jdW1lbnREaWZmSXRlbSkgPT5cblx0XHRcdFx0aXNFcXVhbChkb2N1bWVudERpZmZJdGVtLm9yaWdpbmFsVXJpLCBtdWx0aURpZmZJdGVtLm9yaWdpbmFsVXJpKSAmJlxuXHRcdFx0XHRpc0VxdWFsKGRvY3VtZW50RGlmZkl0ZW0ubW9kaWZpZWRVcmksIG11bHRpRGlmZkl0ZW0ubW9kaWZpZWRVcmkpKVxuXHRcdFx0XHQ/LmNvbGxhcHNlZC5zZXQodHJ1ZSwgdHJhbnNhY3Rpb24pO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUF3QixXQUFXLGdCQUFnQixlQUFlO0FBQzNFLFNBQVMsZ0JBQWdCO0FB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QUFxQjtBQUFBLE1BQ3ZLLE9BQU87QUFDTixlQUFPLE1BQU0sU0FBUyxhQUFhLE9BQU87QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxVQUFVLFVBQWVBLGNBQXVDO0FBQ3ZFLFVBQU0sZ0JBQWdCLEtBQUssYUFBYSxxQkFBcUIsUUFBUTtBQUNyRSxRQUFJLGVBQWU7QUFDbEIsV0FBSyxhQUFhLFdBQVcsTUFBTSxJQUFJLEVBQUUsS0FBSyxDQUFDLHFCQUM5QyxRQUFRLGlCQUFpQixhQUFhLGNBQWMsV0FBVyxLQUMvRCxRQUFRLGlCQUFpQixhQUFhLGNBQWMsV0FBVyxDQUFDLEdBQzlELFVBQVUsSUFBSSxNQUFNQSxZQUFXO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQ0Q7QUFua0NhLHFCQUFOO0FBQUEsRUEyREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F4RVU7IiwKICAibmFtZXMiOiBbIk5vdEV4aXN0QmVoYXZpb3IiLCAiZW50cmllcyIsICJ0cmFuc2FjdGlvbiJdCn0K
