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
import { Sequencer } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { isEqual, joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfilesService } from "../../../../../platform/userDataProfile/common/userDataProfile.js";
import { isEmptyWorkspaceIdentifier, IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkspaceEditingService } from "../../../../services/workspaces/common/workspaceEditing.js";
import { awaitStatsForSession } from "../chat.js";
import { ResponseModelState } from "../chatService/chatService.js";
import { ModifiedFileEntryState } from "../editing/chatEditingService.js";
import { ChatModel, normalizeSerializableChatData } from "./chatModel.js";
import { ChatSessionOperationLog } from "./chatSessionOperationLog.js";
import { LocalChatSessionUri } from "./chatUri.js";
import { stringifyEntryWithFallback } from "./objectMutationLog.js";
const maxPersistedSessions = 400;
const ChatIndexStorageKey = "chat.ChatSessionStore.index";
const ChatTransferIndexStorageKey = "ChatSessionStore.transferIndex";
let ChatSessionStore = class extends Disposable {
  constructor(fileService, environmentService, logService, workspaceContextService, telemetryService, storageService, lifecycleService, userDataProfilesService, configurationService, workspaceEditingService, dialogService, openerService) {
    super();
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.telemetryService = telemetryService;
    this.storageService = storageService;
    this.lifecycleService = lifecycleService;
    this.userDataProfilesService = userDataProfilesService;
    this.configurationService = configurationService;
    this.workspaceEditingService = workspaceEditingService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.storeQueue = new Sequencer();
    this.shuttingDown = false;
    this._didReportIssue = false;
    const workspace = this.workspaceContextService.getWorkspace();
    const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
    const workspaceId = this.workspaceContextService.getWorkspace().id;
    this.storageRoot = isEmptyWindow ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, workspaceId, "chatSessions");
    this.previousEmptyWindowStorageRoot = isEmptyWindow ? joinPath(this.environmentService.workspaceStorageHome, "no-workspace", "chatSessions") : void 0;
    this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "transferredChatSessions");
    this._register(this.workspaceEditingService.onDidEnterWorkspace((event) => {
      const transitionPromise = this.storeQueue.queue(() => this.handleWorkspaceTransition(event.oldWorkspace, event.newWorkspace));
      event.join(transitionPromise);
    }));
    this._register(this.lifecycleService.onWillShutdown((e) => {
      this.shuttingDown = true;
      if (!this.storeTask) {
        return;
      }
      e.join(this.storeTask, {
        id: "join.chatSessionStore",
        label: localize("join.chatSessionStore", "Saving chat history")
      });
    }));
  }
  async handleWorkspaceTransition(oldWorkspace, newWorkspace) {
    const wasEmptyWindow = isEmptyWorkspaceIdentifier(oldWorkspace);
    const isNewWorkspaceEmpty = isEmptyWorkspaceIdentifier(newWorkspace);
    const oldWorkspaceId = oldWorkspace.id;
    const newWorkspaceId = newWorkspace.id;
    this.logService.info(`ChatSessionStore: Workspace transition from ${oldWorkspaceId} to ${newWorkspaceId}`);
    const oldStorageRoot = wasEmptyWindow ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, oldWorkspaceId, "chatSessions");
    const newStorageRoot = isNewWorkspaceEmpty ? joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, "emptyWindowChatSessions") : joinPath(this.environmentService.workspaceStorageHome, newWorkspaceId, "chatSessions");
    if (isEqual(oldStorageRoot, newStorageRoot)) {
      this.storageRoot = newStorageRoot;
      return;
    }
    this.storageRoot = newStorageRoot;
    await this.migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty);
  }
  async migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty) {
    try {
      const oldStorageExists = await this.fileService.exists(oldStorageRoot);
      if (!oldStorageExists) {
        this.logService.info(`ChatSessionStore: Old storage location does not exist, skipping migration`);
        return;
      }
      const oldDirectory = await this.fileService.resolve(oldStorageRoot);
      if (!oldDirectory.children) {
        this.logService.info(`ChatSessionStore: No children in old storage location, skipping migration`);
        return;
      }
      this.logService.info(`ChatSessionStore: Found ${oldDirectory.children.length} files in old storage location`);
      let migratedCount = 0;
      for (const child of oldDirectory.children) {
        if (!child.isDirectory && (child.name.endsWith(".json") || child.name.endsWith(".jsonl"))) {
          const oldFilePath = child.resource;
          const newFilePath = joinPath(this.storageRoot, child.name);
          try {
            await this.fileService.copy(oldFilePath, newFilePath, false);
            migratedCount++;
          } catch (e) {
            if (toFileOperationResult(e) === FileOperationResult.FILE_MOVE_CONFLICT) {
              this.logService.trace(`ChatSessionStore: Session file ${child.name} already exists at target, skipping`);
            } else {
              this.reportError("sessionMigration", `Error migrating chat session file ${child.name}`, e);
            }
          }
        }
      }
      this.logService.info(`ChatSessionStore: Copied ${migratedCount} chat session files from ${wasEmptyWindow ? "empty window" : oldStorageRoot.toString()} to ${isNewWorkspaceEmpty ? "empty window" : this.storageRoot.toString()} (originals preserved at old location)`);
      this.indexCache = void 0;
      try {
        await this.flushIndex();
      } catch (e) {
        this.reportError("migrateWorkspace", "Error flushing chat session index after workspace migration", e);
      }
    } catch (e) {
      this.reportError("migrateWorkspace", "Error migrating chat sessions to new workspace", e);
    }
  }
  async storeSessions(sessions) {
    if (this.shuttingDown) {
      return;
    }
    try {
      this.storeTask = this.storeQueue.queue(async () => {
        try {
          await Promise.all(sessions.map((session) => this.writeSession(session)));
          await this.trimEntries();
          await this.flushIndex();
        } catch (e) {
          this.reportError("storeSessions", "Error storing chat sessions", e);
        }
      });
      await this.storeTask;
    } finally {
      this.storeTask = void 0;
    }
  }
  async storeSessionsMetadataOnly(sessions) {
    if (this.shuttingDown) {
      return;
    }
    try {
      this.storeTask = this.storeQueue.queue(async () => {
        try {
          await Promise.all(sessions.map((session) => this.writeSessionMetadataOnly(session)));
          await this.flushIndex();
        } catch (e) {
          this.reportError("storeSessions", "Error storing chat sessions", e);
        }
      });
      await this.storeTask;
    } finally {
      this.storeTask = void 0;
    }
  }
  async storeTransferSession(transferData, session) {
    const index = this.getTransferredSessionIndex();
    const workspaceKey = transferData.toWorkspace.toString();
    const existingTransfer = index[workspaceKey];
    if (existingTransfer) {
      try {
        const existingSessionResource = URI.revive(existingTransfer.sessionResource);
        if (existingSessionResource && LocalChatSessionUri.parseLocalSessionId(existingSessionResource)) {
          const existingStorageLocation = this.getTransferredSessionStorageLocation(existingSessionResource);
          await this.fileService.del(existingStorageLocation);
        }
      } catch (e) {
        if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
          this.reportError("storeTransferSession", "Error deleting old transferred session file", e);
        }
      }
    }
    try {
      const content = stringifyEntryWithFallback(session);
      const storageLocation = this.getTransferredSessionStorageLocation(session.sessionResource);
      await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));
    } catch (e) {
      this.reportError("sessionWrite", "Error writing chat session", e);
      return;
    }
    index[workspaceKey] = transferData;
    try {
      this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("storeTransferSession", "Error storing chat transfer session", e);
    }
  }
  getTransferredSessionIndex() {
    try {
      const data = this.storageService.getObject(ChatTransferIndexStorageKey, StorageScope.PROFILE, {});
      return data;
    } catch (e) {
      this.reportError("getTransferredSessionIndex", "Error reading chat transfer index", e);
      return {};
    }
  }
  getTransferredSessionData() {
    try {
      const index = this.getTransferredSessionIndex();
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders.length !== 1) {
        return void 0;
      }
      const workspaceKey = workspaceFolders[0].uri.toString();
      const transferredSessionForWorkspace = index[workspaceKey];
      if (!transferredSessionForWorkspace) {
        return void 0;
      }
      const revivedTransferData = revive(transferredSessionForWorkspace);
      if (Date.now() - transferredSessionForWorkspace.timestampInMilliseconds > ChatSessionStore.TRANSFER_EXPIRATION_MS) {
        this.logService.info("ChatSessionStore: Transferred session has expired");
        this.cleanupTransferredSession(revivedTransferData.sessionResource);
        return void 0;
      }
      return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
    } catch (e) {
      this.reportError("getTransferredSession", "Error getting transferred chat session URI", e);
      return void 0;
    }
  }
  async readTransferredSession(sessionResource) {
    try {
      const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
      const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
      if (!sessionId) {
        return void 0;
      }
      const sessionData = await this.readSessionFromLocation(storageLocation, void 0, sessionId);
      await this.cleanupTransferredSession(sessionResource);
      return sessionData;
    } catch (e) {
      this.reportError("getTransferredSession", "Error getting transferred chat session", e);
      return void 0;
    }
  }
  async cleanupTransferredSession(sessionResource) {
    try {
      const index = this.getTransferredSessionIndex();
      const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
      if (workspaceFolders.length === 1) {
        const workspaceKey = workspaceFolders[0].uri.toString();
        delete index[workspaceKey];
        this.storageService.store(ChatTransferIndexStorageKey, index, StorageScope.PROFILE, StorageTarget.MACHINE);
      }
      const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
      await this.fileService.del(storageLocation);
    } catch (e) {
      if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
        this.reportError("cleanupTransferredSession", "Error cleaning up transferred session", e);
      }
    }
  }
  async writeSession(session) {
    try {
      const index = this.internalGetIndex();
      const storageLocation = this.getStorageLocation(session.sessionId);
      if (storageLocation.log) {
        if (session instanceof ChatModel) {
          if (!session.dataSerializer) {
            session.dataSerializer = new ChatSessionOperationLog();
          }
          let op;
          let data;
          try {
            ({ op, data } = session.dataSerializer.write(session));
          } catch (e) {
            if (!this._didReportIssue) {
              this._didReportIssue = true;
              this.dialogService.prompt({
                custom: true,
                // so text is copyable
                title: localize("chatSessionStore.serializationError", "Error saving chat session"),
                message: localize("chatSessionStore.writeError", "Error serializing chat session for storage. The session will be lost if the window is closed. Please report this issue to the VS Code team:\n\n{0}", e.stack || toErrorMessage(e)),
                buttons: [
                  { label: localize("reportIssue", "Report Issue"), run: () => this.openerService.open("https://github.com/microsoft/vscode/issues/new?template=bug_report.md") }
                ]
              });
            }
            throw e;
          }
          if (data.byteLength > 0) {
            await this.fileService.writeFile(storageLocation.log, data, { append: op === "append" });
          }
          session.dataSerializer.confirmWrite();
        } else {
          const content = new ChatSessionOperationLog().createInitialFromSerialized(session);
          await this.fileService.writeFile(storageLocation.log, content);
        }
      } else {
        await this.fileService.writeFile(storageLocation.flat, VSBuffer.fromString(stringifyEntryWithFallback(session)));
      }
      const newMetadata = await getSessionMetadata(session);
      index.entries[session.sessionId] = newMetadata;
    } catch (e) {
      this.reportError("sessionWrite", "Error writing chat session", e);
    }
  }
  async writeSessionMetadataOnly(session) {
    if (LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
      return;
    }
    try {
      const index = this.internalGetIndex();
      const externalSessionId = session.sessionResource.toString();
      index.entries[externalSessionId] = await getSessionMetadata(session);
    } catch (e) {
      this.reportError("sessionMetadataWrite", "Error writing chat session metadata", e);
    }
  }
  async flushIndex() {
    const index = this.internalGetIndex();
    try {
      this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("indexWrite", "Error writing index", e);
    }
  }
  getIndexStorageScope() {
    const workspace = this.workspaceContextService.getWorkspace();
    const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
    return isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE;
  }
  async trimEntries() {
    const index = this.internalGetIndex();
    const entries = Object.entries(index.entries).filter(([_id, entry]) => !entry.isExternal).sort((a, b) => b[1].lastMessageDate - a[1].lastMessageDate).map(([id]) => id);
    if (entries.length > maxPersistedSessions) {
      const entriesToDelete = entries.slice(maxPersistedSessions);
      for (const entry of entriesToDelete) {
        delete index.entries[entry];
      }
      this.logService.trace(`ChatSessionStore: Trimmed ${entriesToDelete.length} old chat sessions from index`);
    }
  }
  async internalDeleteSession(sessionId) {
    const index = this.internalGetIndex();
    if (!index.entries[sessionId]) {
      return;
    }
    const storageLocation = this.getStorageLocation(sessionId);
    for (const uri of [storageLocation.flat, storageLocation.log]) {
      try {
        if (uri) {
          await this.fileService.del(uri);
        }
      } catch (e) {
        if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
          this.reportError("sessionDelete", "Error deleting chat session", e);
        }
      }
      delete index.entries[sessionId];
    }
  }
  hasSessions() {
    return Object.keys(this.internalGetIndex().entries).length > 0;
  }
  isSessionEmpty(sessionId) {
    const index = this.internalGetIndex();
    return index.entries[sessionId]?.isEmpty ?? true;
  }
  async deleteSession(sessionId) {
    await this.storeQueue.queue(async () => {
      await this.internalDeleteSession(sessionId);
      await this.flushIndex();
    });
  }
  async clearAllSessions() {
    await this.storeQueue.queue(async () => {
      const index = this.internalGetIndex();
      const entries = Object.keys(index.entries);
      this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions`);
      await Promise.all(entries.map((entry) => this.internalDeleteSession(entry)));
      await this.flushIndex();
    });
  }
  async setSessionTitle(sessionId, title) {
    await this.storeQueue.queue(async () => {
      const index = this.internalGetIndex();
      if (index.entries[sessionId]) {
        index.entries[sessionId].title = title;
      }
    });
  }
  reportError(reasonForTelemetry, message, error) {
    const fileOperationReason = error && toFileOperationResult(error);
    if (fileOperationReason === FileOperationResult.FILE_NOT_FOUND) {
      this.logService.trace(`ChatSessionStore: ` + message, toErrorMessage(error));
    } else {
      this.logService.error(`ChatSessionStore: ` + message, toErrorMessage(error));
    }
    this.telemetryService.publicLog2("chatSessionStoreError", {
      reason: reasonForTelemetry,
      fileOperationReason: fileOperationReason ?? -1
    });
  }
  internalGetIndex() {
    if (this.indexCache) {
      return this.indexCache;
    }
    const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
    if (!data) {
      this.indexCache = { version: 1, entries: {} };
      return this.indexCache;
    }
    try {
      const index = JSON.parse(data);
      if (isChatSessionIndex(index)) {
        this.indexCache = index;
      } else {
        this.reportError("invalidIndexFormat", `Invalid index format: ${data}`);
        this.indexCache = { version: 1, entries: {} };
      }
    } catch (e) {
      this.reportError("invalidIndexJSON", `Index corrupt: ${data}`, e);
      this.indexCache = { version: 1, entries: {} };
    }
    for (const entry of Object.values(this.indexCache.entries)) {
      entry.timing ??= {
        created: entry.lastMessageDate,
        lastRequestStarted: void 0,
        lastRequestEnded: entry.lastMessageDate
      };
      entry.lastResponseState ??= entry.lastResponseState === ResponseModelState.Pending || entry.lastResponseState === ResponseModelState.NeedsInput ? ResponseModelState.Complete : entry.lastResponseState || ResponseModelState.Complete;
    }
    return this.indexCache;
  }
  async getIndex() {
    return this.storeQueue.queue(async () => {
      return this.internalGetIndex().entries;
    });
  }
  getMetadataForSessionSync(sessionResource) {
    const index = this.internalGetIndex();
    return index.entries[this.getIndexKey(sessionResource)];
  }
  getIndexKey(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    return sessionId ?? sessionResource.toString();
  }
  logIndex() {
    const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
    this.logService.info("ChatSessionStore index: ", data);
  }
  async migrateDataIfNeeded(getInitialData) {
    await this.storeQueue.queue(async () => {
      const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), void 0);
      const needsMigrationFromStorageService = !data;
      if (needsMigrationFromStorageService) {
        const initialData = getInitialData();
        if (initialData) {
          await this.migrate(initialData);
        }
      }
    });
  }
  async migrate(initialData) {
    const numSessions = Object.keys(initialData).length;
    this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);
    await Promise.all(Object.values(initialData).map(async (session) => {
      await this.writeSession(session);
    }));
    await this.flushIndex();
  }
  async readSession(sessionId) {
    return await this.storeQueue.queue(async () => {
      const storageLocation = this.getStorageLocation(sessionId);
      return this.readSessionFromLocation(storageLocation.flat, storageLocation.log, sessionId);
    });
  }
  async readSessionFromLocation(flatStorageLocation, logStorageLocation, sessionId) {
    let fromLocation = flatStorageLocation;
    let rawData;
    if (logStorageLocation) {
      try {
        rawData = (await this.fileService.readFile(logStorageLocation)).value;
        fromLocation = logStorageLocation;
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading log chat session file ${sessionId}`, e);
      }
    }
    if (!rawData) {
      try {
        rawData = (await this.fileService.readFile(flatStorageLocation)).value;
        fromLocation = flatStorageLocation;
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading flat chat session file ${sessionId}`, e);
        if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND && this.previousEmptyWindowStorageRoot) {
          rawData = await this.readSessionFromPreviousLocation(sessionId);
        }
      }
    }
    if (!rawData) {
      return void 0;
    }
    try {
      let session;
      const log = new ChatSessionOperationLog();
      if (fromLocation === logStorageLocation) {
        session = revive(log.read(rawData));
      } else {
        session = revive(JSON.parse(rawData.toString()));
      }
      for (const request of session.requests) {
        if (Array.isArray(request.response)) {
          request.response = request.response.map((response) => {
            if (typeof response === "string") {
              return new MarkdownString(response);
            }
            return response;
          });
        } else if (typeof request.response === "string") {
          request.response = [new MarkdownString(request.response)];
        }
      }
      return { value: normalizeSerializableChatData(session), serializer: log };
    } catch (err) {
      this.reportError("malformedSession", `Malformed session data in ${fromLocation.fsPath}: [${rawData.slice(0, 20).toString()}${rawData.byteLength > 20 ? "..." : ""}]`, err);
      return void 0;
    }
  }
  async readSessionFromPreviousLocation(sessionId) {
    let rawData;
    if (this.previousEmptyWindowStorageRoot) {
      const storageLocation2 = joinPath(this.previousEmptyWindowStorageRoot, `${sessionId}.json`);
      try {
        rawData = (await this.fileService.readFile(storageLocation2)).value;
        this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
      } catch (e) {
        this.reportError("sessionReadFile", `Error reading chat session file ${sessionId} from previous location`, e);
        return void 0;
      }
    }
    return rawData;
  }
  getStorageLocation(chatSessionId) {
    return {
      flat: joinPath(this.storageRoot, `${chatSessionId}.json`),
      // todo@connor4312: remove after stabilizing
      log: this.configurationService.getValue("chat.useLogSessionStorage") !== false ? joinPath(this.storageRoot, `${chatSessionId}.jsonl`) : void 0
    };
  }
  getTransferredSessionStorageLocation(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    return joinPath(this.transferredSessionStorageRoot, `${sessionId}.json`);
  }
  /**
   * Synchronously update the in-memory index entries for the given sessions
   * and flush the index to storage. This ensures the index is persisted
   * even when called from a synchronous `onWillSaveState` handler where
   * async file-write work would complete after the storage service has
   * already flushed.
   */
  updateAndFlushIndexSync(localSessions, externalSessions) {
    const index = this.internalGetIndex();
    for (const session of localSessions) {
      index.entries[session.sessionId] = getSessionMetadataSync(session);
    }
    for (const session of externalSessions) {
      const externalSessionId = session.sessionResource.toString();
      index.entries[externalSessionId] = getSessionMetadataSync(session);
    }
    try {
      this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), StorageTarget.MACHINE);
    } catch (e) {
      this.reportError("indexWrite", "Error writing index synchronously", e);
    }
  }
  getChatStorageFolder() {
    return this.storageRoot;
  }
};
ChatSessionStore.TRANSFER_EXPIRATION_MS = 60 * 1e3 * 5;
ChatSessionStore = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IWorkspaceEditingService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IOpenerService)
], ChatSessionStore);
function isChatSessionEntryMetadata(obj) {
  return !!obj && typeof obj === "object" && typeof obj.sessionId === "string" && typeof obj.title === "string" && typeof obj.lastMessageDate === "number";
}
function isChatSessionIndex(data) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const index = data;
  if (index.version !== 1) {
    return false;
  }
  if (typeof index.entries !== "object" || index.entries === null) {
    return false;
  }
  for (const key in index.entries) {
    if (!isChatSessionEntryMetadata(index.entries[key])) {
      return false;
    }
  }
  return true;
}
function getSessionMetadataSync(session) {
  const title = session.customTitle || session.title;
  let lastResponseState = session.lastRequest?.response?.state ?? ResponseModelState.Complete;
  if (lastResponseState === ResponseModelState.Pending || lastResponseState === ResponseModelState.NeedsInput) {
    lastResponseState = ResponseModelState.Cancelled;
  }
  const isExternal = !LocalChatSessionUri.parseLocalSessionId(session.sessionResource);
  const rawInputState = isExternal ? session.inputModel.toJSON() : void 0;
  const inputState = rawInputState ? { ...rawInputState, attachments: [] } : void 0;
  return {
    sessionId: session.sessionId,
    title: title || localize("newChat", "New Chat"),
    lastMessageDate: session.lastMessageDate,
    timing: session.timing,
    initialLocation: session.initialLocation,
    hasPendingEdits: session.editingSession?.entries.get().some((e) => e.state.get() === ModifiedFileEntryState.Modified) ?? false,
    isEmpty: session.getRequests().length === 0,
    isExternal,
    lastResponseState,
    permissionLevel: session.inputModel.state.get()?.permissionLevel,
    inputState,
    workingDirectory: session.workingDirectory?.toString()
  };
}
async function getSessionMetadata(session) {
  if (session instanceof ChatModel) {
    const metadata = getSessionMetadataSync(session);
    metadata.stats = await awaitStatsForSession(session);
    return metadata;
  }
  const lastMessageDate = session.requests.at(-1)?.timestamp ?? session.creationDate;
  return {
    sessionId: session.sessionId,
    title: session.customTitle || localize("newChat", "New Chat"),
    lastMessageDate,
    timing: {
      created: session.creationDate,
      lastRequestStarted: session.requests.at(-1)?.timestamp,
      lastRequestEnded: lastMessageDate
    },
    initialLocation: session.initialLocation,
    hasPendingEdits: false,
    isEmpty: session.requests.length === 0,
    isExternal: false,
    lastResponseState: ResponseModelState.Complete
  };
}
export {
  ChatSessionStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRTZXNzaW9uU3RvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBhd2FpdFN0YXRzRm9yU2Vzc2lvbiB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uU3RhdHMsIElDaGF0U2Vzc2lvblRpbWluZywgUmVzcG9uc2VNb2RlbFN0YXRlIH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgSVNlcmlhbGl6YWJsZUNoYXREYXRhLCBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbiwgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUsIElTZXJpYWxpemFibGVDaGF0c0RhdGEsIElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UsIG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhIH0gZnJvbSAnLi9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2cgfSBmcm9tICcuL2NoYXRTZXNzaW9uT3BlcmF0aW9uTG9nLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2sgfSBmcm9tICcuL29iamVjdE11dGF0aW9uTG9nLmpzJztcblxuY29uc3QgbWF4UGVyc2lzdGVkU2Vzc2lvbnMgPSA0MDA7XG5cbmNvbnN0IENoYXRJbmRleFN0b3JhZ2VLZXkgPSAnY2hhdC5DaGF0U2Vzc2lvblN0b3JlLmluZGV4JztcbmNvbnN0IENoYXRUcmFuc2ZlckluZGV4U3RvcmFnZUtleSA9ICdDaGF0U2Vzc2lvblN0b3JlLnRyYW5zZmVySW5kZXgnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFNlc3Npb25TdG9yZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0b3JhZ2VSb290OiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldmlvdXNFbXB0eVdpbmRvd1N0b3JhZ2VSb290OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhbnNmZXJyZWRTZXNzaW9uU3RvcmFnZVJvb3Q6IFVSSTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3JlUXVldWUgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0cHJpdmF0ZSBzdG9yZVRhc2s6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2h1dHRpbmdEb3duID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlOiBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGlzRW1wdHlXaW5kb3cgPSAhd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAwO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5pZDtcblx0XHR0aGlzLnN0b3JhZ2VSb290ID0gaXNFbXB0eVdpbmRvdyA/XG5cdFx0XHRqb2luUGF0aCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLCAnZW1wdHlXaW5kb3dDaGF0U2Vzc2lvbnMnKSA6XG5cdFx0XHRqb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZSwgd29ya3NwYWNlSWQsICdjaGF0U2Vzc2lvbnMnKTtcblxuXHRcdHRoaXMucHJldmlvdXNFbXB0eVdpbmRvd1N0b3JhZ2VSb290ID0gaXNFbXB0eVdpbmRvdyA/XG5cdFx0XHRqb2luUGF0aCh0aGlzLmVudmlyb25tZW50U2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZSwgJ25vLXdvcmtzcGFjZScsICdjaGF0U2Vzc2lvbnMnKSA6XG5cdFx0XHR1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VSb290ID0gam9pblBhdGgodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSwgJ3RyYW5zZmVycmVkQ2hhdFNlc3Npb25zJyk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gd29ya3NwYWNlIHRyYW5zaXRpb25zIHRvIG1pZ3JhdGUgY2hhdCBzZXNzaW9uc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlRWRpdGluZ1NlcnZpY2Uub25EaWRFbnRlcldvcmtzcGFjZShldmVudCA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2l0aW9uUHJvbWlzZSA9IHRoaXMuc3RvcmVRdWV1ZS5xdWV1ZSgoKSA9PiB0aGlzLmhhbmRsZVdvcmtzcGFjZVRyYW5zaXRpb24oZXZlbnQub2xkV29ya3NwYWNlLCBldmVudC5uZXdXb3Jrc3BhY2UpKTtcblx0XHRcdGV2ZW50LmpvaW4odHJhbnNpdGlvblByb21pc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bihlID0+IHtcblx0XHRcdHRoaXMuc2h1dHRpbmdEb3duID0gdHJ1ZTtcblx0XHRcdGlmICghdGhpcy5zdG9yZVRhc2spIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRlLmpvaW4odGhpcy5zdG9yZVRhc2ssIHtcblx0XHRcdFx0aWQ6ICdqb2luLmNoYXRTZXNzaW9uU3RvcmUnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2pvaW4uY2hhdFNlc3Npb25TdG9yZScsIFwiU2F2aW5nIGNoYXQgaGlzdG9yeVwiKVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVXb3Jrc3BhY2VUcmFuc2l0aW9uKG9sZFdvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIsIG5ld1dvcmtzcGFjZTogSUFueVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3YXNFbXB0eVdpbmRvdyA9IGlzRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyKG9sZFdvcmtzcGFjZSk7XG5cdFx0Y29uc3QgaXNOZXdXb3Jrc3BhY2VFbXB0eSA9IGlzRW1wdHlXb3Jrc3BhY2VJZGVudGlmaWVyKG5ld1dvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgb2xkV29ya3NwYWNlSWQgPSBvbGRXb3Jrc3BhY2UuaWQ7XG5cdFx0Y29uc3QgbmV3V29ya3NwYWNlSWQgPSBuZXdXb3Jrc3BhY2UuaWQ7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogV29ya3NwYWNlIHRyYW5zaXRpb24gZnJvbSAke29sZFdvcmtzcGFjZUlkfSB0byAke25ld1dvcmtzcGFjZUlkfWApO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSBvbGQgc3RvcmFnZSBsb2NhdGlvbiBiYXNlZCBvbiB0aGUgb2xkIHdvcmtzcGFjZVxuXHRcdGNvbnN0IG9sZFN0b3JhZ2VSb290ID0gd2FzRW1wdHlXaW5kb3cgP1xuXHRcdFx0am9pblBhdGgodGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5nbG9iYWxTdG9yYWdlSG9tZSwgJ2VtcHR5V2luZG93Q2hhdFNlc3Npb25zJykgOlxuXHRcdFx0am9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsIG9sZFdvcmtzcGFjZUlkLCAnY2hhdFNlc3Npb25zJyk7XG5cblx0XHQvLyBEZXRlcm1pbmUgdGhlIG5ldyBzdG9yYWdlIGxvY2F0aW9uIGJhc2VkIG9uIHRoZSBuZXcgd29ya3NwYWNlXG5cdFx0Y29uc3QgbmV3U3RvcmFnZVJvb3QgPSBpc05ld1dvcmtzcGFjZUVtcHR5ID9cblx0XHRcdGpvaW5QYXRoKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuZ2xvYmFsU3RvcmFnZUhvbWUsICdlbXB0eVdpbmRvd0NoYXRTZXNzaW9ucycpIDpcblx0XHRcdGpvaW5QYXRoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLCBuZXdXb3Jrc3BhY2VJZCwgJ2NoYXRTZXNzaW9ucycpO1xuXG5cdFx0Ly8gSWYgdGhlIHN0b3JhZ2Ugcm9vdHMgYXJlIGlkZW50aWNhbCwgdGhlcmUgaXMgbm90aGluZyB0byBtaWdyYXRlXG5cdFx0aWYgKGlzRXF1YWwob2xkU3RvcmFnZVJvb3QsIG5ld1N0b3JhZ2VSb290KSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlUm9vdCA9IG5ld1N0b3JhZ2VSb290O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzdG9yYWdlIHJvb3QgZm9yIHRoZSBuZXcgd29ya3NwYWNlXG5cdFx0dGhpcy5zdG9yYWdlUm9vdCA9IG5ld1N0b3JhZ2VSb290O1xuXG5cdFx0Ly8gTWlncmF0ZSBzZXNzaW9uIGZpbGVzIGZyb20gb2xkIHRvIG5ldyBsb2NhdGlvblxuXHRcdGF3YWl0IHRoaXMubWlncmF0ZVNlc3Npb25zVG9OZXdXb3Jrc3BhY2Uob2xkU3RvcmFnZVJvb3QsIHdhc0VtcHR5V2luZG93LCBpc05ld1dvcmtzcGFjZUVtcHR5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWlncmF0ZVNlc3Npb25zVG9OZXdXb3Jrc3BhY2Uob2xkU3RvcmFnZVJvb3Q6IFVSSSwgd2FzRW1wdHlXaW5kb3c6IGJvb2xlYW4sIGlzTmV3V29ya3NwYWNlRW1wdHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgb2xkIHN0b3JhZ2UgbG9jYXRpb24gZXhpc3RzXG5cdFx0XHRjb25zdCBvbGRTdG9yYWdlRXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMob2xkU3RvcmFnZVJvb3QpO1xuXHRcdFx0aWYgKCFvbGRTdG9yYWdlRXhpc3RzKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2Vzc2lvblN0b3JlOiBPbGQgc3RvcmFnZSBsb2NhdGlvbiBkb2VzIG5vdCBleGlzdCwgc2tpcHBpbmcgbWlncmF0aW9uYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVhZCBhbGwgc2Vzc2lvbiBmaWxlcyBmcm9tIG9sZCBsb2NhdGlvblxuXHRcdFx0Y29uc3Qgb2xkRGlyZWN0b3J5ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKG9sZFN0b3JhZ2VSb290KTtcblx0XHRcdGlmICghb2xkRGlyZWN0b3J5LmNoaWxkcmVuKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2Vzc2lvblN0b3JlOiBObyBjaGlsZHJlbiBpbiBvbGQgc3RvcmFnZSBsb2NhdGlvbiwgc2tpcHBpbmcgbWlncmF0aW9uYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXNzaW9uU3RvcmU6IEZvdW5kICR7b2xkRGlyZWN0b3J5LmNoaWxkcmVuLmxlbmd0aH0gZmlsZXMgaW4gb2xkIHN0b3JhZ2UgbG9jYXRpb25gKTtcblxuXHRcdFx0Ly8gQ29weSBlYWNoIGZpbGUgdG8gdGhlIG5ldyBsb2NhdGlvblxuXHRcdFx0bGV0IG1pZ3JhdGVkQ291bnQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBvbGREaXJlY3RvcnkuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKCFjaGlsZC5pc0RpcmVjdG9yeSAmJiAoY2hpbGQubmFtZS5lbmRzV2l0aCgnLmpzb24nKSB8fCBjaGlsZC5uYW1lLmVuZHNXaXRoKCcuanNvbmwnKSkpIHtcblx0XHRcdFx0XHRjb25zdCBvbGRGaWxlUGF0aCA9IGNoaWxkLnJlc291cmNlO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0ZpbGVQYXRoID0gam9pblBhdGgodGhpcy5zdG9yYWdlUm9vdCwgY2hpbGQubmFtZSk7XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jb3B5KG9sZEZpbGVQYXRoLCBuZXdGaWxlUGF0aCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0bWlncmF0ZWRDb3VudCsrO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSkgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEZpbGUgYWxyZWFkeSBleGlzdHMgYXQgdGFyZ2V0IC0gc2tpcCBhcyBhIG5vLW9wXG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdFNlc3Npb25TdG9yZTogU2Vzc2lvbiBmaWxlICR7Y2hpbGQubmFtZX0gYWxyZWFkeSBleGlzdHMgYXQgdGFyZ2V0LCBza2lwcGluZ2ApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvbk1pZ3JhdGlvbicsIGBFcnJvciBtaWdyYXRpbmcgY2hhdCBzZXNzaW9uIGZpbGUgJHtjaGlsZC5uYW1lfWAsIGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogQ29waWVkICR7bWlncmF0ZWRDb3VudH0gY2hhdCBzZXNzaW9uIGZpbGVzIGZyb20gJHt3YXNFbXB0eVdpbmRvdyA/ICdlbXB0eSB3aW5kb3cnIDogb2xkU3RvcmFnZVJvb3QudG9TdHJpbmcoKX0gdG8gJHtpc05ld1dvcmtzcGFjZUVtcHR5ID8gJ2VtcHR5IHdpbmRvdycgOiB0aGlzLnN0b3JhZ2VSb290LnRvU3RyaW5nKCl9IChvcmlnaW5hbHMgcHJlc2VydmVkIGF0IG9sZCBsb2NhdGlvbilgKTtcblxuXHRcdFx0Ly8gQ2xlYXIgdGhlIGluZGV4IGNhY2hlIGFuZCBmbHVzaCBpdCB0byB0aGUgbmV3IHN0b3JhZ2Ugc2NvcGVcblx0XHRcdHRoaXMuaW5kZXhDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmx1c2hJbmRleCgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdtaWdyYXRlV29ya3NwYWNlJywgJ0Vycm9yIGZsdXNoaW5nIGNoYXQgc2Vzc2lvbiBpbmRleCBhZnRlciB3b3Jrc3BhY2UgbWlncmF0aW9uJywgZSk7XG5cdFx0XHR9XG5cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdtaWdyYXRlV29ya3NwYWNlJywgJ0Vycm9yIG1pZ3JhdGluZyBjaGF0IHNlc3Npb25zIHRvIG5ldyB3b3Jrc3BhY2UnLCBlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9yZVNlc3Npb25zKHNlc3Npb25zOiBDaGF0TW9kZWxbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnNodXR0aW5nRG93bikge1xuXHRcdFx0Ly8gRG9uJ3Qgc3RhcnQgdGhpcyB0YXNrIGlmIHdlIG1pc3NlZCB0aGUgY2hhbmNlIHRvIGJsb2NrIHNodXRkb3duXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc3RvcmVUYXNrID0gdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiB0aGlzLndyaXRlU2Vzc2lvbihzZXNzaW9uKSkpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJpbUVudHJpZXMoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3N0b3JlU2Vzc2lvbnMnLCAnRXJyb3Igc3RvcmluZyBjaGF0IHNlc3Npb25zJywgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZVRhc2s7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3RvcmVUYXNrID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3JlU2Vzc2lvbnNNZXRhZGF0YU9ubHkoc2Vzc2lvbnM6IENoYXRNb2RlbFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2h1dHRpbmdEb3duKSB7XG5cdFx0XHQvLyBEb24ndCBzdGFydCB0aGlzIHRhc2sgaWYgd2UgbWlzc2VkIHRoZSBjaGFuY2UgdG8gYmxvY2sgc2h1dGRvd25cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zdG9yZVRhc2sgPSB0aGlzLnN0b3JlUXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHNlc3Npb25zLm1hcChzZXNzaW9uID0+IHRoaXMud3JpdGVTZXNzaW9uTWV0YWRhdGFPbmx5KHNlc3Npb24pKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5mbHVzaEluZGV4KCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzdG9yZVNlc3Npb25zJywgJ0Vycm9yIHN0b3JpbmcgY2hhdCBzZXNzaW9ucycsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmVUYXNrO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN0b3JlVGFzayA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9yZVRyYW5zZmVyU2Vzc2lvbih0cmFuc2ZlckRhdGE6IElDaGF0VHJhbnNmZXIsIHNlc3Npb246IENoYXRNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25JbmRleCgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUtleSA9IHRyYW5zZmVyRGF0YS50b1dvcmtzcGFjZS50b1N0cmluZygpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgYW55IHByZWV4aXN0aW5nIHRyYW5zZmVycmVkIHNlc3Npb24gZm9yIHRoaXMgd29ya3NwYWNlXG5cdFx0Y29uc3QgZXhpc3RpbmdUcmFuc2ZlciA9IGluZGV4W3dvcmtzcGFjZUtleV07XG5cdFx0aWYgKGV4aXN0aW5nVHJhbnNmZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShleGlzdGluZ1RyYW5zZmVyLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChleGlzdGluZ1Nlc3Npb25SZXNvdXJjZSAmJiBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoZXhpc3RpbmdTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdTdG9yYWdlTG9jYXRpb24gPSB0aGlzLmdldFRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VMb2NhdGlvbihleGlzdGluZ1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwoZXhpc3RpbmdTdG9yYWdlTG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSkgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzdG9yZVRyYW5zZmVyU2Vzc2lvbicsICdFcnJvciBkZWxldGluZyBvbGQgdHJhbnNmZXJyZWQgc2Vzc2lvbiBmaWxlJywgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKHNlc3Npb24pO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlTG9jYXRpb24oc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoc3RvcmFnZUxvY2F0aW9uLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzZXNzaW9uV3JpdGUnLCAnRXJyb3Igd3JpdGluZyBjaGF0IHNlc3Npb24nLCBlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpbmRleFt3b3Jrc3BhY2VLZXldID0gdHJhbnNmZXJEYXRhO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUcmFuc2ZlckluZGV4U3RvcmFnZUtleSwgaW5kZXgsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3N0b3JlVHJhbnNmZXJTZXNzaW9uJywgJ0Vycm9yIHN0b3JpbmcgY2hhdCB0cmFuc2ZlciBzZXNzaW9uJywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmFuc2ZlcnJlZFNlc3Npb25JbmRleCgpOiBJQ2hhdFRyYW5zZmVySW5kZXgge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhOiBJQ2hhdFRyYW5zZmVySW5kZXggPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChDaGF0VHJhbnNmZXJJbmRleFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSk7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdnZXRUcmFuc2ZlcnJlZFNlc3Npb25JbmRleCcsICdFcnJvciByZWFkaW5nIGNoYXQgdHJhbnNmZXIgaW5kZXgnLCBlKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUUkFOU0ZFUl9FWFBJUkFUSU9OX01TID0gNjAgKiAxMDAwICogNTtcblxuXHRnZXRUcmFuc2ZlcnJlZFNlc3Npb25EYXRhKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25JbmRleCgpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCAhPT0gMSkge1xuXHRcdFx0XHQvLyBDYW4gb25seSB0cmFuc2ZlciBzZXNzaW9ucyB0byBzaW5nbGUtZm9sZGVyIHdvcmtzcGFjZXNcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlS2V5ID0gd29ya3NwYWNlRm9sZGVyc1swXS51cmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHRyYW5zZmVycmVkU2Vzc2lvbkZvcldvcmtzcGFjZTogSUNoYXRUcmFuc2ZlckR0byA9IGluZGV4W3dvcmtzcGFjZUtleV07XG5cdFx0XHRpZiAoIXRyYW5zZmVycmVkU2Vzc2lvbkZvcldvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgdHJhbnNmZXIgaGFzIGV4cGlyZWRcblx0XHRcdGNvbnN0IHJldml2ZWRUcmFuc2ZlckRhdGEgPSByZXZpdmUodHJhbnNmZXJyZWRTZXNzaW9uRm9yV29ya3NwYWNlKTtcblx0XHRcdGlmIChEYXRlLm5vdygpIC0gdHJhbnNmZXJyZWRTZXNzaW9uRm9yV29ya3NwYWNlLnRpbWVzdGFtcEluTWlsbGlzZWNvbmRzID4gQ2hhdFNlc3Npb25TdG9yZS5UUkFOU0ZFUl9FWFBJUkFUSU9OX01TKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdDaGF0U2Vzc2lvblN0b3JlOiBUcmFuc2ZlcnJlZCBzZXNzaW9uIGhhcyBleHBpcmVkJyk7XG5cdFx0XHRcdHRoaXMuY2xlYW51cFRyYW5zZmVycmVkU2Vzc2lvbihyZXZpdmVkVHJhbnNmZXJEYXRhLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gISFMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQocmV2aXZlZFRyYW5zZmVyRGF0YS5zZXNzaW9uUmVzb3VyY2UpICYmIHJldml2ZWRUcmFuc2ZlckRhdGEuc2Vzc2lvblJlc291cmNlO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ2dldFRyYW5zZmVycmVkU2Vzc2lvbicsICdFcnJvciBnZXR0aW5nIHRyYW5zZmVycmVkIGNoYXQgc2Vzc2lvbiBVUkknLCBlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdG9yYWdlTG9jYXRpb24gPSB0aGlzLmdldFRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VMb2NhdGlvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IGF3YWl0IHRoaXMucmVhZFNlc3Npb25Gcm9tTG9jYXRpb24oc3RvcmFnZUxvY2F0aW9uLCB1bmRlZmluZWQsIHNlc3Npb25JZCk7XG5cblx0XHRcdC8vIENsZWFuIHVwIHRoZSB0cmFuc2ZlcnJlZCBzZXNzaW9uIGFmdGVyIHJlYWRpbmdcblx0XHRcdGF3YWl0IHRoaXMuY2xlYW51cFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRyZXR1cm4gc2Vzc2lvbkRhdGE7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignZ2V0VHJhbnNmZXJyZWRTZXNzaW9uJywgJ0Vycm9yIGdldHRpbmcgdHJhbnNmZXJyZWQgY2hhdCBzZXNzaW9uJywgZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW51cFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBpbmRleFxuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldFRyYW5zZmVycmVkU2Vzc2lvbkluZGV4KCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUtleSA9IHdvcmtzcGFjZUZvbGRlcnNbMF0udXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGRlbGV0ZSBpbmRleFt3b3Jrc3BhY2VLZXldO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRUcmFuc2ZlckluZGV4U3RvcmFnZUtleSwgaW5kZXgsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZWxldGUgdGhlIHRyYW5zZmVycmVkIHNlc3Npb24gZmlsZVxuXHRcdFx0Y29uc3Qgc3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRUcmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlTG9jYXRpb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHN0b3JhZ2VMb2NhdGlvbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdjbGVhbnVwVHJhbnNmZXJyZWRTZXNzaW9uJywgJ0Vycm9yIGNsZWFuaW5nIHVwIHRyYW5zZmVycmVkIHNlc3Npb24nLCBlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaWRSZXBvcnRJc3N1ZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVTZXNzaW9uKHNlc3Npb246IENoYXRNb2RlbCB8IElTZXJpYWxpemFibGVDaGF0RGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW50ZXJuYWxHZXRJbmRleCgpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZUxvY2F0aW9uID0gdGhpcy5nZXRTdG9yYWdlTG9jYXRpb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0aWYgKHN0b3JhZ2VMb2NhdGlvbi5sb2cpIHtcblx0XHRcdFx0aWYgKHNlc3Npb24gaW5zdGFuY2VvZiBDaGF0TW9kZWwpIHtcblx0XHRcdFx0XHRpZiAoIXNlc3Npb24uZGF0YVNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0XHRcdHNlc3Npb24uZGF0YVNlcmlhbGl6ZXIgPSBuZXcgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2coKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgb3A6ICdhcHBlbmQnIHwgJ3JlcGxhY2UnO1xuXHRcdFx0XHRcdGxldCBkYXRhOiBWU0J1ZmZlcjtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0KHsgb3AsIGRhdGEgfSA9IHNlc3Npb24uZGF0YVNlcmlhbGl6ZXIud3JpdGUoc2Vzc2lvbikpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgaXMgYSBiaWcgb2YgYW4gdWdseSBwcm9tcHQsIGJ1dCB0aGVyZSBpcyBfc29tZXRoaW5nXyBnb2luZyBvbiB3aXRoXG5cdFx0XHRcdFx0XHQvLyBtaXNzaW5nIHNlc3Npb25zLiBVbmZvcnR1bmF0ZWx5IGl0J3MgaGFyZCB0byByb290IGNhdXNlIGJlY2F1c2UgdXNlcnMgd291bGRcblx0XHRcdFx0XHRcdC8vIG5vdCBub3RpY2UgYW4gZXJyb3IgdW50aWwgdGhleSByZWxvYWQgdGhlIHdpbmRvdywgYXQgd2hpY2ggcG9pbnQgYW55IGVycm9yXG5cdFx0XHRcdFx0XHQvLyBpcyBnb25lLiBUaHJvdyBhIHZlcnkgdmVyYm9zZSBkaWFsb2cgaGVyZSBzbyB3ZSBjYW4gZ2V0IHNvbWUgcXVhbGl0eVxuXHRcdFx0XHRcdFx0Ly8gYnVnIHJlcG9ydHMsIGlmIHRoZSBpc3N1ZSBpcyBpbmRlZWQgaW4gdGhlIHNlcmlhbGl6ZWQuXG5cdFx0XHRcdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHJlbW92ZSBhZnRlciBhIGxpdHRsZSBiaXRcblx0XHRcdFx0XHRcdGlmICghdGhpcy5fZGlkUmVwb3J0SXNzdWUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZGlkUmVwb3J0SXNzdWUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0XHRcdFx0XHRjdXN0b206IHRydWUsIC8vIHNvIHRleHQgaXMgY29weWFibGVcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXRTZXNzaW9uU3RvcmUuc2VyaWFsaXphdGlvbkVycm9yJywgJ0Vycm9yIHNhdmluZyBjaGF0IHNlc3Npb24nKSxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25TdG9yZS53cml0ZUVycm9yJywgJ0Vycm9yIHNlcmlhbGl6aW5nIGNoYXQgc2Vzc2lvbiBmb3Igc3RvcmFnZS4gVGhlIHNlc3Npb24gd2lsbCBiZSBsb3N0IGlmIHRoZSB3aW5kb3cgaXMgY2xvc2VkLiBQbGVhc2UgcmVwb3J0IHRoaXMgaXNzdWUgdG8gdGhlIFZTIENvZGUgdGVhbTpcXG5cXG57MH0nLCBlLnN0YWNrIHx8IHRvRXJyb3JNZXNzYWdlKGUpKSxcblx0XHRcdFx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgncmVwb3J0SXNzdWUnLCAnUmVwb3J0IElzc3VlJyksIHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy9uZXc/dGVtcGxhdGU9YnVnX3JlcG9ydC5tZCcpIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkYXRhLmJ5dGVMZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShzdG9yYWdlTG9jYXRpb24ubG9nLCBkYXRhLCB7IGFwcGVuZDogb3AgPT09ICdhcHBlbmQnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZXNzaW9uLmRhdGFTZXJpYWxpemVyLmNvbmZpcm1Xcml0ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBuZXcgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2coKS5jcmVhdGVJbml0aWFsRnJvbVNlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUoc3RvcmFnZUxvY2F0aW9uLmxvZywgY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHN0b3JhZ2VMb2NhdGlvbi5mbGF0LCBWU0J1ZmZlci5mcm9tU3RyaW5nKHN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKHNlc3Npb24pKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdyaXRlIHN1Y2NlZWRlZCwgdXBkYXRlIGluZGV4XG5cdFx0XHRjb25zdCBuZXdNZXRhZGF0YSA9IGF3YWl0IGdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHRcdGluZGV4LmVudHJpZXNbc2Vzc2lvbi5zZXNzaW9uSWRdID0gbmV3TWV0YWRhdGE7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvbldyaXRlJywgJ0Vycm9yIHdyaXRpbmcgY2hhdCBzZXNzaW9uJywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZVNlc3Npb25NZXRhZGF0YU9ubHkoc2Vzc2lvbjogQ2hhdE1vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSB0byBiZSB1c2VkIGZvciBleHRlcm5hbCBzZXNzaW9uc1xuXHRcdGlmIChMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cblx0XHRcdC8vIFRPRE8gZ2V0IHRoaXMgY2xhc3Mgb24gc2Vzc2lvblJlc291cmNlXG5cdFx0XHRjb25zdCBleHRlcm5hbFNlc3Npb25JZCA9IHNlc3Npb24uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRpbmRleC5lbnRyaWVzW2V4dGVybmFsU2Vzc2lvbklkXSA9IGF3YWl0IGdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdzZXNzaW9uTWV0YWRhdGFXcml0ZScsICdFcnJvciB3cml0aW5nIGNoYXQgc2Vzc2lvbiBtZXRhZGF0YScsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmx1c2hJbmRleCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW50ZXJuYWxHZXRJbmRleCgpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRJbmRleFN0b3JhZ2VLZXksIGluZGV4LCB0aGlzLmdldEluZGV4U3RvcmFnZVNjb3BlKCksIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gT25seSBpZiBKU09OLnN0cmluZ2lmeSBmYWlscywgQUZBSUtcblx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ2luZGV4V3JpdGUnLCAnRXJyb3Igd3JpdGluZyBpbmRleCcsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhTdG9yYWdlU2NvcGUoKTogU3RvcmFnZVNjb3BlIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGlzRW1wdHlXaW5kb3cgPSAhd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAwO1xuXHRcdHJldHVybiBpc0VtcHR5V2luZG93ID8gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OIDogU3RvcmFnZVNjb3BlLldPUktTUEFDRTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJpbUVudHJpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMoaW5kZXguZW50cmllcylcblx0XHRcdC5maWx0ZXIoKFtfaWQsIGVudHJ5XSkgPT4gIWVudHJ5LmlzRXh0ZXJuYWwpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYlsxXS5sYXN0TWVzc2FnZURhdGUgLSBhWzFdLmxhc3RNZXNzYWdlRGF0ZSlcblx0XHRcdC5tYXAoKFtpZF0pID0+IGlkKTtcblxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IG1heFBlcnNpc3RlZFNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCBlbnRyaWVzVG9EZWxldGUgPSBlbnRyaWVzLnNsaWNlKG1heFBlcnNpc3RlZFNlc3Npb25zKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllc1RvRGVsZXRlKSB7XG5cdFx0XHRcdGRlbGV0ZSBpbmRleC5lbnRyaWVzW2VudHJ5XTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDaGF0U2Vzc2lvblN0b3JlOiBUcmltbWVkICR7ZW50cmllc1RvRGVsZXRlLmxlbmd0aH0gb2xkIGNoYXQgc2Vzc2lvbnMgZnJvbSBpbmRleGApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW50ZXJuYWxEZWxldGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRpZiAoIWluZGV4LmVudHJpZXNbc2Vzc2lvbklkXSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbiA9IHRoaXMuZ2V0U3RvcmFnZUxvY2F0aW9uKHNlc3Npb25JZCk7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgW3N0b3JhZ2VMb2NhdGlvbi5mbGF0LCBzdG9yYWdlTG9jYXRpb24ubG9nXSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMucmVwb3J0RXJyb3IoJ3Nlc3Npb25EZWxldGUnLCAnRXJyb3IgZGVsZXRpbmcgY2hhdCBzZXNzaW9uJywgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIGluZGV4LmVudHJpZXNbc2Vzc2lvbklkXTtcblx0XHR9XG5cdH1cblxuXHRoYXNTZXNzaW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5pbnRlcm5hbEdldEluZGV4KCkuZW50cmllcykubGVuZ3RoID4gMDtcblx0fVxuXG5cdGlzU2Vzc2lvbkVtcHR5KHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRyZXR1cm4gaW5kZXguZW50cmllc1tzZXNzaW9uSWRdPy5pc0VtcHR5ID8/IHRydWU7XG5cdH1cblxuXHRhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuaW50ZXJuYWxEZWxldGVTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyQWxsU2Vzc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gT2JqZWN0LmtleXMoaW5kZXguZW50cmllcyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogQ2xlYXJpbmcgJHtlbnRyaWVzLmxlbmd0aH0gY2hhdCBzZXNzaW9uc2ApO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZW50cmllcy5tYXAoZW50cnkgPT4gdGhpcy5pbnRlcm5hbERlbGV0ZVNlc3Npb24oZW50cnkpKSk7XG5cdFx0XHRhd2FpdCB0aGlzLmZsdXNoSW5kZXgoKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRTZXNzaW9uVGl0bGUoc2Vzc2lvbklkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnN0b3JlUXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmludGVybmFsR2V0SW5kZXgoKTtcblx0XHRcdGlmIChpbmRleC5lbnRyaWVzW3Nlc3Npb25JZF0pIHtcblx0XHRcdFx0aW5kZXguZW50cmllc1tzZXNzaW9uSWRdLnRpdGxlID0gdGl0bGU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydEVycm9yKHJlYXNvbkZvclRlbGVtZXRyeTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIGVycm9yPzogRXJyb3IpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlT3BlcmF0aW9uUmVhc29uID0gZXJyb3IgJiYgdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKTtcblxuXHRcdGlmIChmaWxlT3BlcmF0aW9uUmVhc29uID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHQvLyBFeHBlY3RlZCBjYXNlIChlLmcuIHJlYWRpbmcgYSBub24tZXhpc3RlbnQgc2Vzc2lvbik7IGtlZXAgbm9pc2UgbG93XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoYXRTZXNzaW9uU3RvcmU6IGAgKyBtZXNzYWdlLCB0b0Vycm9yTWVzc2FnZShlcnJvcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBVbmV4cGVjdGVkIG9yIHNlcmlvdXMgZXJyb3I7IHN1cmZhY2UgYXQgZXJyb3IgbGV2ZWxcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ2hhdFNlc3Npb25TdG9yZTogYCArIG1lc3NhZ2UsIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHRcdHR5cGUgQ2hhdFNlc3Npb25TdG9yZUVycm9yRGF0YSA9IHtcblx0XHRcdHJlYXNvbjogc3RyaW5nO1xuXHRcdFx0ZmlsZU9wZXJhdGlvblJlYXNvbjogbnVtYmVyO1xuXHRcdFx0Ly8gZXJyb3I6IEVycm9yO1xuXHRcdH07XG5cdFx0dHlwZSBDaGF0U2Vzc2lvblN0b3JlRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAncm9ibG91cmVucyc7XG5cdFx0XHRjb21tZW50OiAnRGV0ZWN0IGlzc3VlcyByZWxhdGVkIHRvIG1hbmFnaW5nIGNoYXQgc2Vzc2lvbnMnO1xuXHRcdFx0cmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5mbyBhYm91dCB0aGUgZXJyb3IgdGhhdCBvY2N1cnJlZCcgfTtcblx0XHRcdGZpbGVPcGVyYXRpb25SZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdBbiBlcnJvciBjb2RlIGZyb20gdGhlIGZpbGUgc2VydmljZScgfTtcblx0XHRcdC8vIGVycm9yOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5mbyBhYm91dCB0aGUgZXJyb3IgdGhhdCBvY2N1cnJlZCcgfTtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTZXNzaW9uU3RvcmVFcnJvckRhdGEsIENoYXRTZXNzaW9uU3RvcmVFcnJvckNsYXNzaWZpY2F0aW9uPignY2hhdFNlc3Npb25TdG9yZUVycm9yJywge1xuXHRcdFx0cmVhc29uOiByZWFzb25Gb3JUZWxlbWV0cnksXG5cdFx0XHRmaWxlT3BlcmF0aW9uUmVhc29uOiBmaWxlT3BlcmF0aW9uUmVhc29uID8/IC0xXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGluZGV4Q2FjaGU6IElDaGF0U2Vzc2lvbkluZGV4RGF0YSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbnRlcm5hbEdldEluZGV4KCk6IElDaGF0U2Vzc2lvbkluZGV4RGF0YSB7XG5cdFx0aWYgKHRoaXMuaW5kZXhDYWNoZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5kZXhDYWNoZTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQ2hhdEluZGV4U3RvcmFnZUtleSwgdGhpcy5nZXRJbmRleFN0b3JhZ2VTY29wZSgpLCB1bmRlZmluZWQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhpcy5pbmRleENhY2hlID0geyB2ZXJzaW9uOiAxLCBlbnRyaWVzOiB7fSB9O1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5kZXhDYWNoZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBKU09OLnBhcnNlKGRhdGEpIGFzIHVua25vd247XG5cdFx0XHRpZiAoaXNDaGF0U2Vzc2lvbkluZGV4KGluZGV4KSkge1xuXHRcdFx0XHQvLyBTdWNjZXNzXG5cdFx0XHRcdHRoaXMuaW5kZXhDYWNoZSA9IGluZGV4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignaW52YWxpZEluZGV4Rm9ybWF0JywgYEludmFsaWQgaW5kZXggZm9ybWF0OiAke2RhdGF9YCk7XG5cdFx0XHRcdHRoaXMuaW5kZXhDYWNoZSA9IHsgdmVyc2lvbjogMSwgZW50cmllczoge30gfTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIE9ubHkgaWYgSlNPTi5wYXJzZSBmYWlsc1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignaW52YWxpZEluZGV4SlNPTicsIGBJbmRleCBjb3JydXB0OiAke2RhdGF9YCwgZSk7XG5cdFx0XHR0aGlzLmluZGV4Q2FjaGUgPSB7IHZlcnNpb246IDEsIGVudHJpZXM6IHt9IH07XG5cdFx0fVxuXG5cdFx0Ly8gQ29udmVydCBmcm9tIHByZS0xLjEwOSBmb3JtYXQgd2hpY2ggbGFja3MgdGltaW5nXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBPYmplY3QudmFsdWVzKHRoaXMuaW5kZXhDYWNoZS5lbnRyaWVzKSkge1xuXHRcdFx0ZW50cnkudGltaW5nID8/PSB7XG5cdFx0XHRcdGNyZWF0ZWQ6IGVudHJ5Lmxhc3RNZXNzYWdlRGF0ZSxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQ6IGVudHJ5Lmxhc3RNZXNzYWdlRGF0ZSxcblx0XHRcdH07XG5cblx0XHRcdC8vIFRPRE9AY29ubm9yNDMxMjogdGhlIGNoZWNrIGZvciBQZW5kaW5nL05lZWRzSW5wdXQgZ3VhcmRzIG9sZCBzZXNzaW9ucyBmcm9tIEluc2lkZXJzIHByZSBQUiAjMjg4MTYxIGFuZCBpdCBjYW4gYmUgc2FmZWx5IHJlbW92ZWQgYWZ0ZXIgYSB0cmFuc2l0aW9uIHBlcmlvZCwgdG8gb25seSBiYWNrZmlsbCB0aGUgXCJjb21wbGV0ZVwiIHN0YXRlIHdoZW4gbWlzc2luZy5cblx0XHRcdGVudHJ5Lmxhc3RSZXNwb25zZVN0YXRlID8/PSBlbnRyeS5sYXN0UmVzcG9uc2VTdGF0ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfHwgZW50cnkubGFzdFJlc3BvbnNlU3RhdGUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0ID8gUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlIDogZW50cnkubGFzdFJlc3BvbnNlU3RhdGUgfHwgUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluZGV4Q2FjaGU7XG5cdH1cblxuXHRhc3luYyBnZXRJbmRleCgpOiBQcm9taXNlPElDaGF0U2Vzc2lvbkluZGV4PiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmVRdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnRlcm5hbEdldEluZGV4KCkuZW50cmllcztcblx0XHR9KTtcblx0fVxuXG5cdGdldE1ldGFkYXRhRm9yU2Vzc2lvblN5bmMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW50ZXJuYWxHZXRJbmRleCgpO1xuXHRcdHJldHVybiBpbmRleC5lbnRyaWVzW3RoaXMuZ2V0SW5kZXhLZXkoc2Vzc2lvblJlc291cmNlKV07XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4S2V5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gc2Vzc2lvbklkID8/IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0bG9nSW5kZXgoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KENoYXRJbmRleFN0b3JhZ2VLZXksIHRoaXMuZ2V0SW5kZXhTdG9yYWdlU2NvcGUoKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnQ2hhdFNlc3Npb25TdG9yZSBpbmRleDogJywgZGF0YSk7XG5cdH1cblxuXHRhc3luYyBtaWdyYXRlRGF0YUlmTmVlZGVkKGdldEluaXRpYWxEYXRhOiAoKSA9PiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChDaGF0SW5kZXhTdG9yYWdlS2V5LCB0aGlzLmdldEluZGV4U3RvcmFnZVNjb3BlKCksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBuZWVkc01pZ3JhdGlvbkZyb21TdG9yYWdlU2VydmljZSA9ICFkYXRhO1xuXHRcdFx0aWYgKG5lZWRzTWlncmF0aW9uRnJvbVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxEYXRhID0gZ2V0SW5pdGlhbERhdGEoKTtcblx0XHRcdFx0aWYgKGluaXRpYWxEYXRhKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5taWdyYXRlKGluaXRpYWxEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtaWdyYXRlKGluaXRpYWxEYXRhOiBJU2VyaWFsaXphYmxlQ2hhdHNEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbnVtU2Vzc2lvbnMgPSBPYmplY3Qua2V5cyhpbml0aWFsRGF0YSkubGVuZ3RoO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2Vzc2lvblN0b3JlOiBNaWdyYXRpbmcgJHtudW1TZXNzaW9uc30gY2hhdCBzZXNzaW9ucyBmcm9tIHN0b3JhZ2Ugc2VydmljZSB0byBmaWxlIHN5c3RlbWApO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoT2JqZWN0LnZhbHVlcyhpbml0aWFsRGF0YSkubWFwKGFzeW5jIHNlc3Npb24gPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53cml0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgdGhpcy5mbHVzaEluZGV4KCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVhZFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zdG9yZVF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbiA9IHRoaXMuZ2V0U3RvcmFnZUxvY2F0aW9uKHNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZWFkU2Vzc2lvbkZyb21Mb2NhdGlvbihzdG9yYWdlTG9jYXRpb24uZmxhdCwgc3RvcmFnZUxvY2F0aW9uLmxvZywgc2Vzc2lvbklkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZFNlc3Npb25Gcm9tTG9jYXRpb24oZmxhdFN0b3JhZ2VMb2NhdGlvbjogVVJJLCBsb2dTdG9yYWdlTG9jYXRpb246IFVSSSB8IHVuZGVmaW5lZCwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgZnJvbUxvY2F0aW9uID0gZmxhdFN0b3JhZ2VMb2NhdGlvbjtcblx0XHRsZXQgcmF3RGF0YTogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAobG9nU3RvcmFnZUxvY2F0aW9uKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyYXdEYXRhID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobG9nU3RvcmFnZUxvY2F0aW9uKSkudmFsdWU7XG5cdFx0XHRcdGZyb21Mb2NhdGlvbiA9IGxvZ1N0b3JhZ2VMb2NhdGlvbjtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvblJlYWRGaWxlJywgYEVycm9yIHJlYWRpbmcgbG9nIGNoYXQgc2Vzc2lvbiBmaWxlICR7c2Vzc2lvbklkfWAsIGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmF3RGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmF3RGF0YSA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGZsYXRTdG9yYWdlTG9jYXRpb24pKS52YWx1ZTtcblx0XHRcdFx0ZnJvbUxvY2F0aW9uID0gZmxhdFN0b3JhZ2VMb2NhdGlvbjtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvblJlYWRGaWxlJywgYEVycm9yIHJlYWRpbmcgZmxhdCBjaGF0IHNlc3Npb24gZmlsZSAke3Nlc3Npb25JZH1gLCBlKTtcblxuXHRcdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EICYmIHRoaXMucHJldmlvdXNFbXB0eVdpbmRvd1N0b3JhZ2VSb290KSB7XG5cdFx0XHRcdFx0cmF3RGF0YSA9IGF3YWl0IHRoaXMucmVhZFNlc3Npb25Gcm9tUHJldmlvdXNMb2NhdGlvbihzZXNzaW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFyYXdEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgc2Vzc2lvbjogSVNlcmlhbGl6YWJsZUNoYXREYXRhSW47XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2coKTtcblx0XHRcdGlmIChmcm9tTG9jYXRpb24gPT09IGxvZ1N0b3JhZ2VMb2NhdGlvbikge1xuXHRcdFx0XHRzZXNzaW9uID0gcmV2aXZlKGxvZy5yZWFkKHJhd0RhdGEpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb24gPSByZXZpdmUoSlNPTi5wYXJzZShyYXdEYXRhLnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ETyBDb3BpZWQgZnJvbSBDaGF0U2VydmljZS50cywgY2xlYW51cFxuXHRcdFx0Ly8gUmV2aXZlIHNlcmlhbGl6ZWQgbWFya2Rvd24gc3RyaW5ncyBpbiByZXNwb25zZSBkYXRhXG5cdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2Ygc2Vzc2lvbi5yZXF1ZXN0cykge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXF1ZXN0LnJlc3BvbnNlKSkge1xuXHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSByZXF1ZXN0LnJlc3BvbnNlLm1hcCgocmVzcG9uc2UpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzcG9uc2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcocmVzcG9uc2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiByZXF1ZXN0LnJlc3BvbnNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSBbbmV3IE1hcmtkb3duU3RyaW5nKHJlcXVlc3QucmVzcG9uc2UpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEoc2Vzc2lvbiksIHNlcmlhbGl6ZXI6IGxvZyB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5yZXBvcnRFcnJvcignbWFsZm9ybWVkU2Vzc2lvbicsIGBNYWxmb3JtZWQgc2Vzc2lvbiBkYXRhIGluICR7ZnJvbUxvY2F0aW9uLmZzUGF0aH06IFske3Jhd0RhdGEuc2xpY2UoMCwgMjApLnRvU3RyaW5nKCl9JHtyYXdEYXRhLmJ5dGVMZW5ndGggPiAyMCA/ICcuLi4nIDogJyd9XWAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVhZFNlc3Npb25Gcm9tUHJldmlvdXNMb2NhdGlvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgcmF3RGF0YTogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5wcmV2aW91c0VtcHR5V2luZG93U3RvcmFnZVJvb3QpIHtcblx0XHRcdGNvbnN0IHN0b3JhZ2VMb2NhdGlvbjIgPSBqb2luUGF0aCh0aGlzLnByZXZpb3VzRW1wdHlXaW5kb3dTdG9yYWdlUm9vdCwgYCR7c2Vzc2lvbklkfS5qc29uYCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyYXdEYXRhID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoc3RvcmFnZUxvY2F0aW9uMikpLnZhbHVlO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdFNlc3Npb25TdG9yZTogUmVhZCBjaGF0IHNlc3Npb24gJHtzZXNzaW9uSWR9IGZyb20gcHJldmlvdXMgbG9jYXRpb25gKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRFcnJvcignc2Vzc2lvblJlYWRGaWxlJywgYEVycm9yIHJlYWRpbmcgY2hhdCBzZXNzaW9uIGZpbGUgJHtzZXNzaW9uSWR9IGZyb20gcHJldmlvdXMgbG9jYXRpb25gLCBlKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmF3RGF0YTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RvcmFnZUxvY2F0aW9uKGNoYXRTZXNzaW9uSWQ6IHN0cmluZyk6IHtcblx0XHQvKiogPDEuMTA5IGZsYXQgSlNPTiBmaWxlICovXG5cdFx0ZmxhdDogVVJJO1xuXHRcdC8qKiA+PTEuMTA5IGFwcGVuZCBsb2cgKi9cblx0XHRsb2c/OiBVUkk7XG5cdH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRmbGF0OiBqb2luUGF0aCh0aGlzLnN0b3JhZ2VSb290LCBgJHtjaGF0U2Vzc2lvbklkfS5qc29uYCksXG5cdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHJlbW92ZSBhZnRlciBzdGFiaWxpemluZ1xuXHRcdFx0bG9nOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdjaGF0LnVzZUxvZ1Nlc3Npb25TdG9yYWdlJykgIT09IGZhbHNlID8gam9pblBhdGgodGhpcy5zdG9yYWdlUm9vdCwgYCR7Y2hhdFNlc3Npb25JZH0uanNvbmxgKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUcmFuc2ZlcnJlZFNlc3Npb25TdG9yYWdlTG9jYXRpb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiBqb2luUGF0aCh0aGlzLnRyYW5zZmVycmVkU2Vzc2lvblN0b3JhZ2VSb290LCBgJHtzZXNzaW9uSWR9Lmpzb25gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91c2x5IHVwZGF0ZSB0aGUgaW4tbWVtb3J5IGluZGV4IGVudHJpZXMgZm9yIHRoZSBnaXZlbiBzZXNzaW9uc1xuXHQgKiBhbmQgZmx1c2ggdGhlIGluZGV4IHRvIHN0b3JhZ2UuIFRoaXMgZW5zdXJlcyB0aGUgaW5kZXggaXMgcGVyc2lzdGVkXG5cdCAqIGV2ZW4gd2hlbiBjYWxsZWQgZnJvbSBhIHN5bmNocm9ub3VzIGBvbldpbGxTYXZlU3RhdGVgIGhhbmRsZXIgd2hlcmVcblx0ICogYXN5bmMgZmlsZS13cml0ZSB3b3JrIHdvdWxkIGNvbXBsZXRlIGFmdGVyIHRoZSBzdG9yYWdlIHNlcnZpY2UgaGFzXG5cdCAqIGFscmVhZHkgZmx1c2hlZC5cblx0ICovXG5cdHVwZGF0ZUFuZEZsdXNoSW5kZXhTeW5jKGxvY2FsU2Vzc2lvbnM6IENoYXRNb2RlbFtdLCBleHRlcm5hbFNlc3Npb25zOiBDaGF0TW9kZWxbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbnRlcm5hbEdldEluZGV4KCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGxvY2FsU2Vzc2lvbnMpIHtcblx0XHRcdGluZGV4LmVudHJpZXNbc2Vzc2lvbi5zZXNzaW9uSWRdID0gZ2V0U2Vzc2lvbk1ldGFkYXRhU3luYyhzZXNzaW9uKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGV4dGVybmFsU2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IGV4dGVybmFsU2Vzc2lvbklkID0gc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGluZGV4LmVudHJpZXNbZXh0ZXJuYWxTZXNzaW9uSWRdID0gZ2V0U2Vzc2lvbk1ldGFkYXRhU3luYyhzZXNzaW9uKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdEluZGV4U3RvcmFnZUtleSwgaW5kZXgsIHRoaXMuZ2V0SW5kZXhTdG9yYWdlU2NvcGUoKSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydEVycm9yKCdpbmRleFdyaXRlJywgJ0Vycm9yIHdyaXRpbmcgaW5kZXggc3luY2hyb25vdXNseScsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRDaGF0U3RvcmFnZUZvbGRlcigpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VSb290O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YSB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRsYXN0TWVzc2FnZURhdGU6IG51bWJlcjtcblx0dGltaW5nOiBJQ2hhdFNlc3Npb25UaW1pbmc7XG5cdGluaXRpYWxMb2NhdGlvbj86IENoYXRBZ2VudExvY2F0aW9uO1xuXHRoYXNQZW5kaW5nRWRpdHM/OiBib29sZWFuO1xuXHRzdGF0cz86IElDaGF0U2Vzc2lvblN0YXRzO1xuXHRsYXN0UmVzcG9uc2VTdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlO1xuXG5cdC8qKlxuXHQgKiBUaGUgd29ya2luZyBkaXJlY3RvcnkgVVJJIHN0cmluZyBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuXHQgKiBQZXJzaXN0ZWQgc28gaXQgc3Vydml2ZXMgd2luZG93IHJlbG9hZCBpbiB0aGUgYWdlbnRzL3Nlc3Npb25zIHdpbmRvdy5cblx0ICovXG5cdHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoaXMgb25seSBleGlzdHMgYmVjYXVzZSB0aGUgbWlncmF0ZWQgZGF0YSBmcm9tIHRoZSBzdG9yYWdlIHNlcnZpY2UgaGFkIGVtcHR5IHNlc3Npb25zIHBlcnNpc3RlZCwgYW5kIGl0J3MgaW1wb3NzaWJsZSB0byBrbm93IHdoaWNoIG9uZXMgYXJlXG5cdCAqIGN1cnJlbnRseSBpbiB1c2UuIE5vdywgYGNsZWFyU2Vzc2lvbmAgZGVsZXRlcyBlbXB0eSBzZXNzaW9ucywgc28gb2xkIG9uZXMgc2hvdWxkbid0IHRha2UgdXAgc3BhY2UgaW4gdGhlIHN0b3JlIGFueW1vcmUsIGJ1dCB3ZSBzdGlsbCBuZWVkIHRvXG5cdCAqIGZpbHRlciB0aGUgb2xkIG9uZXMgb3V0IG9mIGhpc3RvcnkuXG5cdCAqL1xuXHRpc0VtcHR5PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIHNlc3Npb24gd2FzIGxvYWRlZCBmcm9tIGFuIGV4dGVybmFsIHByb3ZpZGVyIChlZyBiYWNrZ3JvdW5kL2Nsb3VkIHNlc3Npb25zKS5cblx0ICovXG5cdGlzRXh0ZXJuYWw/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgcGVybWlzc2lvbiBsZXZlbCBmb3IgdG9vbCBhdXRvLWFwcHJvdmFsLCBpZiBub3QgZGVmYXVsdC5cblx0ICovXG5cdHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZWQgZHJhZnQgaW5wdXQgc3RhdGUgKHRleHQsIGF0dGFjaG1lbnRzLCBtb2RlLCBzZWxlY3RlZCBtb2RlbCwgLi4uKSBmb3Jcblx0ICogZXh0ZXJuYWwgc2Vzc2lvbnMsIHNvIHRoYXQgdW5zZW50IGlucHV0IGlzIHByZXNlcnZlZCB3aGVuIHN3aXRjaGluZyBhd2F5IGFuZFxuXHQgKiBiYWNrLiBMb2NhbCBzZXNzaW9ucyBpbnN0ZWFkIHBlcnNpc3QgdGhlaXIgZnVsbCBzdGF0ZSB2aWEgc3RvcmVTZXNzaW9ucy5cblx0ICovXG5cdGlucHV0U3RhdGU/OiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZTtcbn1cblxuZnVuY3Rpb24gaXNDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEob2JqOiB1bmtub3duKTogb2JqIGlzIElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEge1xuXHRyZXR1cm4gKFxuXHRcdCEhb2JqICYmXG5cdFx0dHlwZW9mIG9iaiA9PT0gJ29iamVjdCcgJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhKS5zZXNzaW9uSWQgPT09ICdzdHJpbmcnICYmXG5cdFx0dHlwZW9mIChvYmogYXMgSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YSkudGl0bGUgPT09ICdzdHJpbmcnICYmXG5cdFx0dHlwZW9mIChvYmogYXMgSUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YSkubGFzdE1lc3NhZ2VEYXRlID09PSAnbnVtYmVyJ1xuXHQpO1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdFNlc3Npb25JbmRleCA9IFJlY29yZDxzdHJpbmcsIElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGE+O1xuXG5pbnRlcmZhY2UgSUNoYXRTZXNzaW9uSW5kZXhEYXRhIHtcblx0dmVyc2lvbjogMTtcblx0ZW50cmllczogSUNoYXRTZXNzaW9uSW5kZXg7XG59XG5cbi8vIFRPRE8gaWYgd2UgdXBkYXRlIHRoZSBpbmRleCB2ZXJzaW9uOlxuLy8gRG9uJ3QgdGhyb3cgYXdheSBpbmRleCB3aGVuIG1vdmluZyBiYWNrd2FyZHMgaW4gVlMgQ29kZSB2ZXJzaW9uLiBUcnkgdG8gcmVjb3ZlciBpdC4gQnV0IHRoaXMgc2NlbmFyaW8gaXMgaGFyZC5cbmZ1bmN0aW9uIGlzQ2hhdFNlc3Npb25JbmRleChkYXRhOiB1bmtub3duKTogZGF0YSBpcyBJQ2hhdFNlc3Npb25JbmRleERhdGEge1xuXHRpZiAodHlwZW9mIGRhdGEgIT09ICdvYmplY3QnIHx8IGRhdGEgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBpbmRleCA9IGRhdGEgYXMgSUNoYXRTZXNzaW9uSW5kZXhEYXRhO1xuXHRpZiAoaW5kZXgudmVyc2lvbiAhPT0gMSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmICh0eXBlb2YgaW5kZXguZW50cmllcyAhPT0gJ29iamVjdCcgfHwgaW5kZXguZW50cmllcyA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvciAoY29uc3Qga2V5IGluIGluZGV4LmVudHJpZXMpIHtcblx0XHRpZiAoIWlzQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhKGluZGV4LmVudHJpZXNba2V5XSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgc2Vzc2lvbiBtZXRhZGF0YSBzeW5jaHJvbm91c2x5IGZyb20gYSBsaXZlIENoYXRNb2RlbC5cbiAqIFVzZWQgYm90aCBieSB7QGxpbmsgdXBkYXRlQW5kRmx1c2hJbmRleFN5bmN9ICh3aGVyZSBhc3luYyB3b3JrIGlzIG5vdFxuICogcG9zc2libGUpIGFuZCBieSB7QGxpbmsgZ2V0U2Vzc2lvbk1ldGFkYXRhfSAod2hpY2ggbGF5ZXJzIG9uIGFzeW5jIHN0YXRzKS5cbiAqL1xuZnVuY3Rpb24gZ2V0U2Vzc2lvbk1ldGFkYXRhU3luYyhzZXNzaW9uOiBDaGF0TW9kZWwpOiBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhIHtcblx0Y29uc3QgdGl0bGUgPSBzZXNzaW9uLmN1c3RvbVRpdGxlIHx8IHNlc3Npb24udGl0bGU7XG5cblx0bGV0IGxhc3RSZXNwb25zZVN0YXRlID0gc2Vzc2lvbi5sYXN0UmVxdWVzdD8ucmVzcG9uc2U/LnN0YXRlID8/IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZTtcblx0aWYgKGxhc3RSZXNwb25zZVN0YXRlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuUGVuZGluZyB8fCBsYXN0UmVzcG9uc2VTdGF0ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQpIHtcblx0XHRsYXN0UmVzcG9uc2VTdGF0ZSA9IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQ7XG5cdH1cblxuXHRjb25zdCBpc0V4dGVybmFsID0gIUxvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdGNvbnN0IHJhd0lucHV0U3RhdGUgPSBpc0V4dGVybmFsID8gc2Vzc2lvbi5pbnB1dE1vZGVsLnRvSlNPTigpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBpbnB1dFN0YXRlID0gcmF3SW5wdXRTdGF0ZSA/IHsgLi4ucmF3SW5wdXRTdGF0ZSwgYXR0YWNobWVudHM6IFtdIH0gOiB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdHRpdGxlOiB0aXRsZSB8fCBsb2NhbGl6ZSgnbmV3Q2hhdCcsIFwiTmV3IENoYXRcIiksXG5cdFx0bGFzdE1lc3NhZ2VEYXRlOiBzZXNzaW9uLmxhc3RNZXNzYWdlRGF0ZSxcblx0XHR0aW1pbmc6IHNlc3Npb24udGltaW5nLFxuXHRcdGluaXRpYWxMb2NhdGlvbjogc2Vzc2lvbi5pbml0aWFsTG9jYXRpb24sXG5cdFx0aGFzUGVuZGluZ0VkaXRzOiBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uPy5lbnRyaWVzLmdldCgpLnNvbWUoZSA9PiBlLnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSA/PyBmYWxzZSxcblx0XHRpc0VtcHR5OiBzZXNzaW9uLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwLFxuXHRcdGlzRXh0ZXJuYWwsXG5cdFx0bGFzdFJlc3BvbnNlU3RhdGUsXG5cdFx0cGVybWlzc2lvbkxldmVsOiBzZXNzaW9uLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk/LnBlcm1pc3Npb25MZXZlbCxcblx0XHRpbnB1dFN0YXRlLFxuXHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeT8udG9TdHJpbmcoKSxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb246IENoYXRNb2RlbCB8IElTZXJpYWxpemFibGVDaGF0RGF0YSk6IFByb21pc2U8SUNoYXRTZXNzaW9uRW50cnlNZXRhZGF0YT4ge1xuXHRpZiAoc2Vzc2lvbiBpbnN0YW5jZW9mIENoYXRNb2RlbCkge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0U2Vzc2lvbk1ldGFkYXRhU3luYyhzZXNzaW9uKTtcblx0XHRtZXRhZGF0YS5zdGF0cyA9IGF3YWl0IGF3YWl0U3RhdHNGb3JTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHJldHVybiBtZXRhZGF0YTtcblx0fVxuXG5cdC8vIElTZXJpYWxpemFibGVDaGF0RGF0YSBcdTIwMTQgb25seSB1c2VkIGluIHRoZSBvbGQgcHJlLWZzIHN0b3JhZ2UgZGF0YSBtaWdyYXRpb24gc2NlbmFyaW9cblx0Y29uc3QgbGFzdE1lc3NhZ2VEYXRlID0gc2Vzc2lvbi5yZXF1ZXN0cy5hdCgtMSk/LnRpbWVzdGFtcCA/PyBzZXNzaW9uLmNyZWF0aW9uRGF0ZTtcblxuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0dGl0bGU6IHNlc3Npb24uY3VzdG9tVGl0bGUgfHwgbG9jYWxpemUoJ25ld0NoYXQnLCBcIk5ldyBDaGF0XCIpLFxuXHRcdGxhc3RNZXNzYWdlRGF0ZSxcblx0XHR0aW1pbmc6IHtcblx0XHRcdGNyZWF0ZWQ6IHNlc3Npb24uY3JlYXRpb25EYXRlLFxuXHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkOiBzZXNzaW9uLnJlcXVlc3RzLmF0KC0xKT8udGltZXN0YW1wLFxuXHRcdFx0bGFzdFJlcXVlc3RFbmRlZDogbGFzdE1lc3NhZ2VEYXRlLFxuXHRcdH0sXG5cdFx0aW5pdGlhbExvY2F0aW9uOiBzZXNzaW9uLmluaXRpYWxMb2NhdGlvbixcblx0XHRoYXNQZW5kaW5nRWRpdHM6IGZhbHNlLFxuXHRcdGlzRW1wdHk6IHNlc3Npb24ucmVxdWVzdHMubGVuZ3RoID09PSAwLFxuXHRcdGlzRXh0ZXJuYWw6IGZhbHNlLFxuXHRcdGxhc3RSZXNwb25zZVN0YXRlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsXG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRUcmFuc2ZlciB7XG5cdHRvV29ya3NwYWNlOiBVUkk7XG5cdHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHR0aW1lc3RhbXBJbk1pbGxpc2Vjb25kczogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VHJhbnNmZXIyIGV4dGVuZHMgSUNoYXRUcmFuc2ZlciB7XG5cdGNoYXQ6IElTZXJpYWxpemFibGVDaGF0RGF0YTtcbn1cblxudHlwZSBJQ2hhdFRyYW5zZmVyRHRvID0gRHRvPElDaGF0VHJhbnNmZXI+O1xuXG4vKipcbiAqIE1hcCBvZiBkZXN0aW5hdGlvbiB3b3Jrc3BhY2UgVVJJIHRvIGNoYXQgdHJhbnNmZXIgZGF0YVxuICovXG50eXBlIElDaGF0VHJhbnNmZXJJbmRleCA9IFJlY29yZDxzdHJpbmcsIElDaGF0VHJhbnNmZXJEdG8+O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLGdCQUFnQjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUIsY0FBYyw2QkFBNkI7QUFDekUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBa0MsNEJBQTRCLGdDQUFnQztBQUU5RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFnRCwwQkFBMEI7QUFFMUUsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxXQUFtSixxQ0FBcUM7QUFDak0sU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSx1QkFBdUI7QUFFN0IsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw4QkFBOEI7QUFFN0IsSUFBTSxtQkFBTixjQUErQixXQUFXO0FBQUEsRUFVaEQsWUFDZ0MsYUFDTyxvQkFDUixZQUNhLHlCQUNQLGtCQUNGLGdCQUNFLGtCQUNPLHlCQUNILHNCQUNHLHlCQUNWLGVBQ0EsZUFDaEM7QUFDRCxVQUFNO0FBYnlCO0FBQ087QUFDUjtBQUNhO0FBQ1A7QUFDRjtBQUNFO0FBQ087QUFDSDtBQUNHO0FBQ1Y7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
