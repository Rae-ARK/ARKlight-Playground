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
import { raceCancellationError } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { MarkdownString, markdownStringEqual } from "../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { revive } from "../../../base/common/marshalling.js";
import { equals } from "../../../base/common/objects.js";
import { autorun, observableSignalFromEvent, observableValue } from "../../../base/common/observable.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { hasValidDiff } from "../../contrib/chat/browser/agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { IChatWidgetService, isIChatViewViewContext } from "../../contrib/chat/browser/chat.js";
import { getInProgressSessionDescription } from "../../contrib/chat/browser/chatSessions/chatSessionDescription.js";
import { getSessionStatusForModel } from "../../contrib/chat/browser/chatSessions/chatSessions.contribution.js";
import { ChatEditorInput } from "../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js";
import { IChatDebugService } from "../../contrib/chat/common/chatDebugService.js";
import { IChatService } from "../../contrib/chat/common/chatService/chatService.js";
import { ChatSessionOptionsMap, IChatSessionsService } from "../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { getChatSessionType } from "../../contrib/chat/common/model/chatUri.js";
import { IChatArtifactsService } from "../../contrib/chat/common/tools/chatArtifactsService.js";
import { IChatTodoListService } from "../../contrib/chat/common/tools/chatTodoListService.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
function stringOrMarkdownEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (typeof a === "string" || typeof b === "string") {
    return false;
  }
  return markdownStringEqual(a, b);
}
class ObservableChatSession extends Disposable {
  constructor(resource, providerHandle, proxy, logService, dialogService) {
    super();
    this._progressObservable = observableValue(this, []);
    this._isCompleteObservable = observableValue(this, false);
    this._onWillDispose = new Emitter();
    this.onWillDispose = this._onWillDispose.event;
    this._pendingProgressChunks = /* @__PURE__ */ new Map();
    this._isInitialized = false;
    this._interruptionWasCanceled = false;
    this._disposalPending = false;
    /**
     * Number of currently in-flight `requestHandler` invocations. Used to
     * defer `$disposeChatSessionContent` when the workbench wants to release
     * this session while a request is mid-flight on a `requestHandler`-style
     * session (e.g. Copilot CLI). Without this guard, the proxy dispose
     * synchronously cancels the ext-host `disposeCts` and tears down the
     * underlying SDK session (which calls `sdkSession.abort()`), so the
     * in-flight request is lost. The `activeResponseCallback`-style sessions
     * have their own deferral via {@link interruptActiveResponseCallback};
     * this counter is the equivalent for `requestHandler`-style sessions.
     */
    this._inFlightRequestCount = 0;
    this.sessionResource = resource;
    this.providerHandle = providerHandle;
    this.history = [];
    this._proxy = proxy;
    this._providerHandle = providerHandle;
    this._logService = logService;
    this._dialogService = dialogService;
  }
  get options() {
    return this._options ? new Map(this._options) : void 0;
  }
  get progressObs() {
    return this._progressObservable;
  }
  get isCompleteObs() {
    return this._isCompleteObservable;
  }
  initialize(token, context) {
    if (!this._initializationPromise) {
      this._initializationPromise = this._doInitializeContent(token, context);
    }
    return this._initializationPromise;
  }
  async _doInitializeContent(token, context) {
    try {
      const sessionContent = await raceCancellationError(
        this._proxy.$provideChatSessionContent(this._providerHandle, this.sessionResource, context, token),
        token
      );
      this._options = sessionContent.options ? ChatSessionOptionsMap.fromRecord(sessionContent.options) : void 0;
      this.title = sessionContent.title;
      this.history.length = 0;
      this.history.push(...sessionContent.history.map((turn) => {
        if (turn.type === "request") {
          const variables = turn.variableData?.variables.map((v) => {
            const entry = {
              ...v,
              value: revive(v.value)
            };
            return entry;
          });
          return {
            type: "request",
            prompt: turn.prompt,
            participant: turn.participant,
            command: turn.command,
            variableData: variables ? { variables } : void 0,
            id: turn.id,
            modelId: turn.modelId,
            modeInstructions: turn.modeInstructions ? revive(turn.modeInstructions) : void 0
          };
        }
        return {
          type: "response",
          parts: turn.parts.map((part) => revive(part)),
          participant: turn.participant,
          details: turn.details
        };
      }));
      if (sessionContent.hasActiveResponseCallback && !this.interruptActiveResponseCallback) {
        this.interruptActiveResponseCallback = async () => {
          const confirmInterrupt = () => {
            if (this._disposalPending) {
              this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
              this._disposalPending = false;
            }
            this._proxy.$interruptChatSessionActiveResponse(this._providerHandle, this.sessionResource, "ongoing");
            return true;
          };
          if (sessionContent.supportsInterruption) {
            return confirmInterrupt();
          }
          return this._dialogService.confirm({
            message: localize("interruptActiveResponse", "Are you sure you want to interrupt the active session?")
          }).then((confirmed) => {
            if (confirmed.confirmed) {
              return confirmInterrupt();
            } else {
              this._addProgress([{
                kind: "progressMessage",
                content: { value: "", isTrusted: false }
              }]);
              this._interruptionWasCanceled = true;
              if (this._disposalPending) {
                this._logService.info(`Canceling deferred disposal for session ${this.sessionResource} (user canceled interruption)`);
                this._disposalPending = false;
              }
              return false;
            }
          });
        };
      }
      if (sessionContent.hasRequestHandler && !this.requestHandler) {
        this.requestHandler = async (request, progress, history, token2) => {
          this._inFlightRequestCount++;
          this._progressObservable.set([], void 0);
          this._isCompleteObservable.set(false, void 0);
          let lastProgressLength = 0;
          const progressDisposable = autorun((reader) => {
            const progressArray = this._progressObservable.read(reader);
            const isComplete = this._isCompleteObservable.read(reader);
            if (progressArray.length > lastProgressLength) {
              const newProgress = progressArray.slice(lastProgressLength);
              progress(newProgress);
              lastProgressLength = progressArray.length;
            }
            if (isComplete) {
              progressDisposable.dispose();
            }
          });
          try {
            await this._proxy.$invokeChatSessionRequestHandler(this._providerHandle, this.sessionResource, request, history, token2);
            if (!this._isCompleteObservable.get() && !this.interruptActiveResponseCallback) {
              this._markComplete();
            }
          } catch (error) {
            const errorProgress = {
              kind: "progressMessage",
              content: { value: `Error: ${error instanceof Error ? error.message : String(error)}`, isTrusted: false }
            };
            this._addProgress([errorProgress]);
            this._markComplete();
            throw error;
          } finally {
            progressDisposable.dispose();
            this._inFlightRequestCount--;
            if (this._disposalPending && this._inFlightRequestCount === 0 && !this.interruptActiveResponseCallback) {
              this._disposalPending = false;
              this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
            }
          }
        };
      }
      if (sessionContent.hasForkHandler && !this.forkSession) {
        this.forkSession = async (request, token2) => {
          const result = await this._proxy.$forkChatSession(this._providerHandle, this.sessionResource, request ? this.toRequestDto(request) : void 0, token2);
          return revive(result);
        };
      }
      this._isInitialized = true;
      const hasActiveResponse = sessionContent.hasActiveResponseCallback;
      const hasRequestHandler = sessionContent.hasRequestHandler;
      const hasAnyCapability = hasActiveResponse || hasRequestHandler;
      for (const [requestId, chunks] of this._pendingProgressChunks) {
        this._logService.debug(`Processing ${chunks.length} pending progress chunks for session ${this.sessionResource}, requestId ${requestId}`);
        this._addProgress(chunks);
      }
      this._pendingProgressChunks.clear();
      if (!hasAnyCapability) {
        this._isCompleteObservable.set(true, void 0);
      }
    } catch (error) {
      this._logService.error(`Failed to initialize chat session ${this.sessionResource}:`, error);
      throw error;
    }
  }
  /**
   * Handle progress chunks coming from the extension host.
   * If the session is not initialized yet, the chunks will be queued.
   */
  handleProgressChunk(requestId, progress) {
    if (!this._isInitialized) {
      const existing = this._pendingProgressChunks.get(requestId) || [];
      this._pendingProgressChunks.set(requestId, [...existing, ...progress]);
      this._logService.debug(`Queuing ${progress.length} progress chunks for session ${this.sessionResource}, requestId ${requestId} (session not initialized)`);
      return;
    }
    this._addProgress(progress);
  }
  /**
   * Handle progress completion from the extension host.
   */
  handleProgressComplete(requestId) {
    this._pendingProgressChunks.delete(requestId);
    if (this._isInitialized) {
      if (!this._interruptionWasCanceled) {
        this._markComplete();
      } else {
        this._interruptionWasCanceled = false;
      }
    }
  }
  _addProgress(progress) {
    const currentProgress = this._progressObservable.get();
    this._progressObservable.set([...currentProgress, ...progress], void 0);
  }
  _markComplete() {
    if (!this._isCompleteObservable.get()) {
      this._isCompleteObservable.set(true, void 0);
    }
  }
  toRequestDto(request) {
    return {
      type: "request",
      id: request.id,
      prompt: request.prompt,
      participant: request.participant,
      command: request.command,
      variableData: void 0,
      modelId: request.modelId,
      modeInstructions: request.modeInstructions
    };
  }
  dispose() {
    this._onWillDispose.fire();
    this._onWillDispose.dispose();
    this._pendingProgressChunks.clear();
    if (this.interruptActiveResponseCallback && !this._interruptionWasCanceled) {
      this._disposalPending = true;
    } else if (this._inFlightRequestCount > 0) {
      this._disposalPending = true;
    } else {
      this._proxy.$disposeChatSessionContent(this._providerHandle, this.sessionResource);
    }
    super.dispose();
  }
}
let MainThreadChatSessionItemController = class extends Disposable {
  constructor(proxy, chatSessionType, handle, supportsResolve, _chatService) {
    super();
    this._chatService = _chatService;
    this._onDidChangeChatSessionItems = this._register(new Emitter());
    this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
    this._modelListeners = this._register(new DisposableResourceMap());
    this._resolveCache = new ResourceMap();
    this._resolving = new ResourceMap();
    this._isDisposed = false;
    this._items = new ResourceMap();
    this._proxy = proxy;
    this._handle = handle;
    this._supportsResolve = supportsResolve;
    const addModelListeners = async (model) => {
      if (getChatSessionType(model.sessionResource) !== chatSessionType) {
        return;
      }
      await this.refresh(CancellationToken.None);
      if (this._isDisposed) {
        return;
      }
      this.tryUpdateItemForModel(model);
      const requestChangeListener = model.lastRequestObs.map((last) => last?.response && observableSignalFromEvent("chatSessions.modelRequestChangeListener", last.response.onDidChange));
      const modelChangeListener = observableSignalFromEvent("chatSessions.modelChangeListener", model.onDidChange);
      this._modelListeners.set(model.sessionResource, autorun((reader) => {
        requestChangeListener.read(reader)?.read(reader);
        modelChangeListener.read(reader);
        this.tryUpdateItemForModel(model);
      }));
    };
    this._register(_chatService.onDidCreateModel((model) => addModelListeners(model)));
    for (const model of _chatService.chatModels.get()) {
      addModelListeners(model);
    }
    this._register(_chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        this._modelListeners.deleteAndDispose(sessionResource);
      }
    }));
  }
  dispose() {
    this._isDisposed = true;
    this._resolveCache.clear();
    super.dispose();
  }
  get items() {
    return Array.from(this._items.values());
  }
  refresh(token) {
    return this._proxy.$refreshChatSessionItems(this._handle, token);
  }
  async newChatSessionItem(request, token) {
    const dto = await raceCancellationError(this._proxy.$newChatSessionItem(this._handle, {
      prompt: request.prompt,
      command: request.command,
      initialSessionOptions: request.initialSessionOptions ? ChatSessionOptionsMap.toStrValueArray(request.initialSessionOptions) : void 0
    }, token), token);
    if (!dto) {
      return void 0;
    }
    const item = this.addOrUpdateItem(dto);
    return item;
  }
  async acceptChange(change) {
    const addedOrUpdatedItems = [];
    for (const item of change.addedOrUpdated) {
      const resource = URI.revive(item.resource);
      if (!this._resolving.has(resource)) {
        this._resolveCache.delete(resource);
      }
      addedOrUpdatedItems.push(await this.addOrUpdateItem(item));
    }
    for (const uri of change.removed) {
      this._resolveCache.delete(uri);
      this._items.delete(uri);
    }
    this._onDidChangeChatSessionItems.fire({
      addedOrUpdated: addedOrUpdatedItems,
      removed: change.removed
    });
  }
  async addOrUpdateItem(dto) {
    const resource = URI.revive(dto.resource);
    const existing = this._items.get(resource);
    const updated = new MainThreadChatSessionItem(dto, this._chatService.getSession(resource), await this._chatService.getMetadataForSession(resource));
    if (existing?.isEqual(updated)) {
      return existing;
    }
    if (existing && existing.label !== updated.label && this._chatService.getSession(resource)) {
      this._chatService.setSessionTitle(resource, updated.label);
    }
    this._items.set(resource, updated);
    this._onDidChangeChatSessionItems.fire({
      addedOrUpdated: [updated]
    });
    return updated;
  }
  async tryUpdateItemForModel(model) {
    const resource = model.sessionResource;
    const existing = this._items.get(resource);
    if (existing) {
      this.addOrUpdateItem(existing);
    }
  }
  async getNewChatSessionInputState(sessionResource, token) {
    const optionGroups = await this._proxy.$provideChatSessionInputState(this._handle, sessionResource, token);
    if (!optionGroups?.length) {
      return void 0;
    }
    return optionGroups;
  }
  async resolveChatSessionItem(resource, token) {
    if (!this._supportsResolve) {
      return void 0;
    }
    const cached = this._resolveCache.get(resource);
    if (cached) {
      return cached;
    }
    const promise = this._doResolveItem(resource, token).catch(
      (err) => {
        this._resolveCache.delete(resource);
        throw err;
      }
    );
    this._resolveCache.set(resource, promise);
    return promise;
  }
  async _doResolveItem(resource, token) {
    const expectedItem = this._items.get(resource);
    this._resolving.set(resource, true);
    let dto;
    try {
      dto = await raceCancellationError(this._proxy.$resolveChatSessionItem(this._handle, resource, token), token);
    } finally {
      this._resolving.delete(resource);
    }
    if (!dto) {
      return void 0;
    }
    if (this._items.get(resource) !== expectedItem) {
      return this._items.get(resource);
    }
    const updated = new MainThreadChatSessionItem(
      dto,
      this._chatService.getSession(resource),
      await this._chatService.getMetadataForSession(resource)
    );
    if (this._items.get(resource) !== expectedItem) {
      return this._items.get(resource);
    }
    if (expectedItem?.isEqual(updated)) {
      return expectedItem;
    }
    this._items.set(resource, updated);
    this._onDidChangeChatSessionItems.fire({
      addedOrUpdated: [updated]
    });
    return updated;
  }
  setSupportsResolve(supportsResolve) {
    if (this._supportsResolve === supportsResolve) {
      return;
    }
    this._supportsResolve = supportsResolve;
    if (supportsResolve) {
      this._resolveCache.clear();
    }
  }
};
MainThreadChatSessionItemController = __decorateClass([
  __decorateParam(4, IChatService)
], MainThreadChatSessionItemController);
class MainThreadChatSessionItem {
  constructor(dto, model, detailOverrides) {
    this.resource = URI.revive(dto.resource);
    this.label = dto.label;
    this.timing = dto.timing;
    this.iconPath = dto.iconPath;
    this.badge = reviveMarkdownString(dto.badge);
    this.tooltip = reviveMarkdownString(dto.tooltip);
    this.archived = dto.archived;
    this.metadata = dto.metadata;
    this.legacyResource = dto.legacyResource ? URI.revive(dto.legacyResource) : void 0;
    this.description = (model && getInProgressSessionDescription(model)) ?? reviveMarkdownString(dto.description);
    this.status = (model && getSessionStatusForModel(model)) ?? dto.status;
    this.changes = revive(dto.changes);
    if (detailOverrides && !this.changes) {
      const diffs = {
        files: detailOverrides.stats?.fileCount || 0,
        insertions: detailOverrides.stats?.added || 0,
        deletions: detailOverrides.stats?.removed || 0
      };
      if (hasValidDiff(diffs)) {
        this.changes = diffs;
      }
    }
  }
  isEqual(other) {
    return isEqual(this.resource, other.resource) && this.label === other.label && this.description === other.description && this.status === other.status && this.timing.created === other.timing.created && this.timing.lastRequestStarted === other.timing.lastRequestStarted && this.timing.lastRequestEnded === other.timing.lastRequestEnded && equals(this.changes, other.changes) && equals(this.iconPath, other.iconPath) && stringOrMarkdownEqual(this.badge, other.badge) && stringOrMarkdownEqual(this.tooltip, other.tooltip) && this.archived === other.archived && equals(this.metadata, other.metadata) && isEqual(this.legacyResource, other.legacyResource);
  }
}
let MainThreadChatSessions = class extends Disposable {
  constructor(_extHostContext, _agentSessionsService, _chatSessionsService, _chatService, _chatWidgetService, _chatTodoListService, _chatArtifactsService, _chatDebugService, _dialogService, _editorService, editorGroupService, _logService, _instantiationService) {
    super();
    this._extHostContext = _extHostContext;
    this._agentSessionsService = _agentSessionsService;
    this._chatSessionsService = _chatSessionsService;
    this._chatService = _chatService;
    this._chatWidgetService = _chatWidgetService;
    this._chatTodoListService = _chatTodoListService;
    this._chatArtifactsService = _chatArtifactsService;
    this._chatDebugService = _chatDebugService;
    this._dialogService = _dialogService;
    this._editorService = _editorService;
    this.editorGroupService = editorGroupService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._itemControllerRegistrations = this._register(new DisposableMap());
    this._contentProvidersRegistrations = this._register(new DisposableMap());
    this._sessionTypeToHandle = /* @__PURE__ */ new Map();
    this._activeSessions = new ResourceMap();
    this._sessionDisposables = new ResourceMap();
    this._proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostChatSessions);
    this._register(this._chatSessionsService.onDidChangeSessionOptions(({ sessionResource, updates }) => {
      const sessionType = getChatSessionType(sessionResource);
      const handle = this._getHandleForSessionType(sessionType);
      this._logService.trace(`[MainThreadChatSessions] onRequestNotifyExtension received: sessionType '${sessionType}', handle ${handle}, ${updates.size} update(s)`);
      if (handle !== void 0) {
        this.notifyOptionsChange(handle, sessionResource, updates);
      } else {
        this._logService.warn(`[MainThreadChatSessions] Cannot notify option change for sessionType '${sessionType}': no provider registered. Registered types: [${Array.from(this._sessionTypeToHandle.keys()).join(", ")}]`);
      }
    }));
    this._register(this._agentSessionsService.model.onDidChangeSessionArchivedState((session) => {
      for (const [handle, { chatSessionType }] of this._itemControllerRegistrations) {
        if (chatSessionType === session.providerType) {
          this._proxy.$onDidChangeChatSessionItemState(handle, session.resource, session.isArchived());
        }
      }
    }));
  }
  _getHandleForSessionType(chatSessionType) {
    return this._sessionTypeToHandle.get(chatSessionType);
  }
  $registerChatSessionItemController(handle, chatSessionType, supportsResolve) {
    const disposables = new DisposableStore();
    const controller = disposables.add(this._instantiationService.createInstance(MainThreadChatSessionItemController, this._proxy, chatSessionType, handle, supportsResolve));
    disposables.add(this._chatSessionsService.registerChatSessionItemController(chatSessionType, controller));
    this._itemControllerRegistrations.set(handle, {
      chatSessionType,
      controller,
      dispose: () => disposables.dispose()
    });
    this._refreshControllerInputState(handle, chatSessionType);
  }
  $updateChatSessionItemControllerCapabilities(handle, supportsResolve) {
    const registration = this._itemControllerRegistrations.get(handle);
    if (!registration) {
      this._logService.warn(`No chat session item controller found for handle ${handle}`);
      return;
    }
    registration.controller.setSupportsResolve(supportsResolve);
  }
  _refreshControllerInputState(handle, chatSessionType) {
    this._proxy.$provideChatSessionInputState(handle, void 0, CancellationToken.None).then((optionGroups) => {
      if (optionGroups?.length) {
        this._applyOptionGroups(handle, chatSessionType, void 0, optionGroups);
      }
    }).catch((err) => this._logService.error("Error fetching chat session input state", err));
  }
  _applyOptionGroups(handle, chatSessionType, sessionResourceComponents, optionGroups) {
    this._chatSessionsService.setOptionGroupsForSessionType(chatSessionType, handle, optionGroups);
    if (sessionResourceComponents) {
      const sessionResource = URI.revive(sessionResourceComponents);
      optionGroups.forEach((group) => {
        if (group.selected) {
          this._chatSessionsService.setSessionOption(sessionResource, group.id, group.selected);
        }
      });
    }
  }
  getController(handle) {
    const registration = this._itemControllerRegistrations.get(handle);
    if (!registration) {
      throw new Error(`No chat session controller registered for handle ${handle}`);
    }
    return registration.controller;
  }
  async $updateChatSessionItems(controllerHandle, change) {
    const controller = this.getController(controllerHandle);
    controller.acceptChange({
      addedOrUpdated: change.addedOrUpdated,
      removed: change.removed.map((uri) => URI.revive(uri))
    });
  }
  async $addOrUpdateChatSessionItem(controllerHandle, item) {
    const controller = this.getController(controllerHandle);
    controller.acceptChange({
      addedOrUpdated: [item],
      removed: []
    });
  }
  $onDidChangeChatSessionOptions(handle, sessionResourceComponents, updates) {
    const sessionResource = URI.revive(sessionResourceComponents);
    this._chatSessionsService.updateSessionOptions(sessionResource, ChatSessionOptionsMap.fromRecord(updates));
  }
  async $onDidCommitChatSessionItem(handle, originalComponents, modifiedCompoennts) {
    const originalResource = URI.revive(originalComponents);
    const modifiedResource = URI.revive(modifiedCompoennts);
    this._logService.trace(`$onDidCommitChatSessionItem: handle(${handle}), original(${originalResource}), modified(${modifiedResource})`);
    const chatSessionType = this._itemControllerRegistrations.get(handle)?.chatSessionType;
    if (!chatSessionType) {
      this._logService.error(`No chat session type found for provider handle ${handle}`);
      return;
    }
    const originalEditor = this._editorService.editors.find((editor) => editor.resource?.toString() === originalResource.toString());
    const originalModel = this._chatService.acquireExistingSession(originalResource);
    const contribution = this._chatSessionsService.getAllChatSessionContributions().find((c) => c.type === chatSessionType);
    try {
      this._chatTodoListService.migrateTodos(originalResource, modifiedResource);
      this._chatArtifactsService.getArtifacts(originalResource).migrate(this._chatArtifactsService.getArtifacts(modifiedResource));
      if (chatSessionType === "copilotcli") {
        this._chatDebugService.invokeProviders(modifiedResource).catch(() => {
        });
      }
      const originalGroup = this.editorGroupService.groups.find((group) => group.editors.some((editor) => isEqual(editor.resource, originalResource))) ?? this.editorGroupService.activeGroup;
      const options = {
        title: {
          preferred: originalEditor?.getName() || void 0,
          fallback: localize("chatEditorContributionName", "{0}", contribution?.displayName)
        }
      };
      const newSession = await this._chatSessionsService.getOrCreateChatSession(
        URI.revive(modifiedResource),
        CancellationToken.None
      );
      if (originalEditor) {
        newSession.transferredState = originalEditor instanceof ChatEditorInput ? { editingSession: originalEditor.transferOutEditingSession(), inputState: originalModel?.object?.inputModel.toJSON() } : void 0;
        await this._editorService.replaceEditors([{
          editor: originalEditor,
          replacement: {
            resource: modifiedResource,
            options
          }
        }], originalGroup);
        this._resendPendingRequests(originalResource, modifiedResource);
        return;
      }
      if (originalModel) {
        newSession.transferredState = {
          editingSession: originalModel.object.editingSession,
          inputState: originalModel.object.inputModel.toJSON()
        };
      }
      const chatViewWidget = this._chatWidgetService.getWidgetBySessionResource(originalResource);
      if (chatViewWidget && isIChatViewViewContext(chatViewWidget.viewContext)) {
        await this._chatWidgetService.openSession(modifiedResource, void 0, { preserveFocus: true });
      } else if (!chatViewWidget) {
        const ref = await this._chatService.acquireOrLoadSession(modifiedResource, ChatAgentLocation.Chat, CancellationToken.None);
        ref?.dispose();
      }
      this._resendPendingRequests(originalResource, modifiedResource);
      this._chatSessionsService.fireSessionCommitted(originalResource, modifiedResource);
    } finally {
      originalModel?.dispose();
    }
  }
  /**
   * Re-sends pending and in-flight requests from the original session on the committed session.
   */
  _resendPendingRequests(originalResource, modifiedResource) {
    this._chatService.migrateRequests(originalResource, modifiedResource);
  }
  async _provideChatSessionContent(providerHandle, sessionResource, token) {
    const t0 = Date.now();
    this._logService.trace(`[MainThreadChatSessions] _provideChatSessionContent start handle=${providerHandle} uri=${sessionResource.toString()}`);
    let session = this._activeSessions.get(sessionResource);
    if (!session) {
      session = new ObservableChatSession(
        sessionResource,
        providerHandle,
        this._proxy,
        this._logService,
        this._dialogService
      );
      this._activeSessions.set(sessionResource, session);
      const disposable = session.onWillDispose(() => {
        this._activeSessions.delete(sessionResource);
        this._sessionDisposables.get(sessionResource)?.dispose();
        this._sessionDisposables.delete(sessionResource);
      });
      this._sessionDisposables.set(sessionResource, disposable);
    }
    try {
      const initialSessionOptions = this._chatSessionsService.getSessionOptions(sessionResource);
      await session.initialize(token, {
        initialSessionOptions: initialSessionOptions ? [...initialSessionOptions].map(([optionId, value]) => ({ optionId, value: typeof value === "string" ? value : value?.id })) : void 0
      });
      if (session.options) {
        for (const [_, handle] of this._sessionTypeToHandle) {
          if (handle === providerHandle) {
            for (const [optionId, value] of session.options) {
              this._chatSessionsService.setSessionOption(sessionResource, optionId, value);
            }
            break;
          }
        }
      }
      this._logService.trace(`[MainThreadChatSessions] _provideChatSessionContent done total=${Date.now() - t0}ms handle=${providerHandle} uri=${sessionResource.toString()}`);
      return session;
    } catch (error) {
      session.dispose();
      this._logService.error(`Error providing chat session content for handle ${providerHandle} and resource ${sessionResource.toString()}:`, error);
      throw error;
    }
  }
  $unregisterChatSessionItemController(handle) {
    this._itemControllerRegistrations.deleteAndDispose(handle);
  }
  $registerChatSessionContentProvider(handle, chatSessionScheme) {
    const provider = {
      provideChatSessionContent: (resource, token) => this._provideChatSessionContent(handle, resource, token)
    };
    this._sessionTypeToHandle.set(chatSessionScheme, handle);
    this._contentProvidersRegistrations.set(handle, this._chatSessionsService.registerChatSessionContentProvider(chatSessionScheme, provider));
    this._refreshProviderOptions(handle, chatSessionScheme);
  }
  $unregisterChatSessionContentProvider(handle) {
    this._contentProvidersRegistrations.deleteAndDispose(handle);
    for (const [sessionType, h] of this._sessionTypeToHandle) {
      if (h === handle) {
        this._sessionTypeToHandle.delete(sessionType);
        break;
      }
    }
    for (const [key, session] of this._activeSessions) {
      if (session.providerHandle === handle) {
        session.dispose();
        this._activeSessions.delete(key);
      }
    }
  }
  async $handleProgressChunk(handle, sessionResource, requestId, chunks) {
    const resource = URI.revive(sessionResource);
    const observableSession = this._activeSessions.get(resource);
    if (!observableSession) {
      this._logService.warn(`No session found for progress chunks: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
      return;
    }
    const chatProgressParts = chunks.map((chunk) => {
      const [progress] = Array.isArray(chunk) ? chunk : [chunk];
      return revive(progress);
    });
    observableSession.handleProgressChunk(requestId, chatProgressParts);
  }
  $handleProgressComplete(handle, sessionResource, requestId) {
    const resource = URI.revive(sessionResource);
    const observableSession = this._activeSessions.get(resource);
    if (!observableSession) {
      this._logService.warn(`No session found for progress completion: handle ${handle}, sessionResource ${resource}, requestId ${requestId}`);
      return;
    }
    observableSession.handleProgressComplete(requestId);
  }
  $handleAnchorResolve(handle, sesssionResource, requestId, requestHandle, anchor) {
  }
  $onDidChangeChatSessionProviderOptions(handle) {
    let sessionType;
    for (const [type, h] of this._sessionTypeToHandle) {
      if (h === handle) {
        sessionType = type;
        break;
      }
    }
    if (!sessionType) {
      this._logService.warn(`No session type found for chat session content provider handle ${handle} when refreshing provider options`);
      return;
    }
    this._refreshProviderOptions(handle, sessionType);
  }
  $updateChatSessionInputState(controllerHandle, sessionResource, optionGroups) {
    const registration = this._itemControllerRegistrations.get(controllerHandle);
    if (!registration) {
      this._logService.warn(`No controller found for handle ${controllerHandle} when updating input state`);
      return;
    }
    this._applyOptionGroups(controllerHandle, registration.chatSessionType, sessionResource, optionGroups);
  }
  _refreshProviderOptions(handle, chatSessionScheme) {
    this._proxy.$provideChatSessionProviderOptions(handle, CancellationToken.None).then((options) => {
      if (options?.optionGroups && options.optionGroups.length) {
        this._chatSessionsService.setOptionGroupsForSessionType(chatSessionScheme, handle, [...options.optionGroups]);
      }
    }).catch((err) => this._logService.error("Error fetching chat session options", err));
  }
  dispose() {
    for (const session of this._activeSessions.values()) {
      session.dispose();
    }
    this._activeSessions.clear();
    for (const disposable of this._sessionDisposables.values()) {
      disposable.dispose();
    }
    this._sessionDisposables.clear();
    super.dispose();
  }
  /**
   * Notify the extension about option changes for a session
   */
  async notifyOptionsChange(handle, sessionResource, updates) {
    this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: starting proxy call for handle ${handle}, sessionResource ${sessionResource}`);
    try {
      await this._proxy.$provideHandleOptionsChange(handle, sessionResource, Object.fromEntries(updates), CancellationToken.None);
      this._logService.trace(`[MainThreadChatSessions] notifyOptionsChange: proxy call completed for handle ${handle}, sessionResource ${sessionResource}`);
    } catch (error) {
      this._logService.error(`[MainThreadChatSessions] notifyOptionsChange: error for handle ${handle}, sessionResource ${sessionResource}:`, error);
    }
  }
};
MainThreadChatSessions = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatSessions),
  __decorateParam(1, IAgentSessionsService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IChatTodoListService),
  __decorateParam(6, IChatArtifactsService),
  __decorateParam(7, IChatDebugService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IEditorGroupsService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IInstantiationService)
], MainThreadChatSessions);
function reviveMarkdownString(value) {
  if (!value) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && "value" in value) {
    return MarkdownString.lift(value);
  }
  return void 0;
}
export {
  MainThreadChatSessions,
  ObservableChatSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdFNlc3Npb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcsIG1hcmtkb3duU3RyaW5nRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBoYXNWYWxpZERpZmYsIElBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0SW5Qcm9ncmVzc1Nlc3Npb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbkRlc2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25TdGF0dXNGb3JNb2RlbCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UsIElDaGF0RGV0YWlsLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UsIElDaGF0U2Vzc2lvblRpbWluZyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25PcHRpb25zTWFwLCBDaGF0U2Vzc2lvblN0YXR1cywgSUNoYXROZXdTZXNzaW9uUmVxdWVzdCwgSUNoYXRTZXNzaW9uLCBJQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIsIElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciwgSUNoYXRTZXNzaW9uSXRlbXNEZWx0YSwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtLCBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFJlcXVlc3QgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElDaGF0QXJ0aWZhY3RzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvY2hhdEFydGlmYWN0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRUb2RvTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uQ29udGVudENvbnRleHREdG8sIEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZSwgRXh0SG9zdENvbnRleHQsIElDaGF0UHJvZ3Jlc3NEdG8sIElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtRHRvLCBJQ2hhdFNlc3Npb25JdGVtc0NoYW5nZSwgSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXRTZXNzaW9uc1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuXG5mdW5jdGlvbiBzdHJpbmdPck1hcmtkb3duRXF1YWwoYTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBiOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIWEgfHwgIWIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHR5cGVvZiBhID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgYiA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIG1hcmtkb3duU3RyaW5nRXF1YWwoYSwgYik7XG59XG5cbmV4cG9ydCBjbGFzcyBPYnNlcnZhYmxlQ2hhdFNlc3Npb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRTZXNzaW9uIHtcblxuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvdmlkZXJIYW5kbGU6IG51bWJlcjtcblx0cmVhZG9ubHkgaGlzdG9yeTogQXJyYXk8SUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0+O1xuXHR0aXRsZT86IHN0cmluZztcblx0cHJpdmF0ZSBfb3B0aW9ucz86IENoYXRTZXNzaW9uT3B0aW9uc01hcDtcblx0cHVibGljIGdldCBvcHRpb25zKCk6IFJlYWRvbmx5Q2hhdFNlc3Npb25PcHRpb25zTWFwIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucyA/IG5ldyBNYXAodGhpcy5fb3B0aW9ucykgOiB1bmRlZmluZWQ7XG5cdH1cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0UHJvZ3Jlc3NbXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0NvbXBsZXRlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdQcm9ncmVzc0NodW5rcyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFByb2dyZXNzW10+KCk7XG5cdHByaXZhdGUgX2lzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaW50ZXJydXB0aW9uV2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlzcG9zYWxQZW5kaW5nID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiBjdXJyZW50bHkgaW4tZmxpZ2h0IGByZXF1ZXN0SGFuZGxlcmAgaW52b2NhdGlvbnMuIFVzZWQgdG9cblx0ICogZGVmZXIgYCRkaXNwb3NlQ2hhdFNlc3Npb25Db250ZW50YCB3aGVuIHRoZSB3b3JrYmVuY2ggd2FudHMgdG8gcmVsZWFzZVxuXHQgKiB0aGlzIHNlc3Npb24gd2hpbGUgYSByZXF1ZXN0IGlzIG1pZC1mbGlnaHQgb24gYSBgcmVxdWVzdEhhbmRsZXJgLXN0eWxlXG5cdCAqIHNlc3Npb24gKGUuZy4gQ29waWxvdCBDTEkpLiBXaXRob3V0IHRoaXMgZ3VhcmQsIHRoZSBwcm94eSBkaXNwb3NlXG5cdCAqIHN5bmNocm9ub3VzbHkgY2FuY2VscyB0aGUgZXh0LWhvc3QgYGRpc3Bvc2VDdHNgIGFuZCB0ZWFycyBkb3duIHRoZVxuXHQgKiB1bmRlcmx5aW5nIFNESyBzZXNzaW9uICh3aGljaCBjYWxscyBgc2RrU2Vzc2lvbi5hYm9ydCgpYCksIHNvIHRoZVxuXHQgKiBpbi1mbGlnaHQgcmVxdWVzdCBpcyBsb3N0LiBUaGUgYGFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2tgLXN0eWxlIHNlc3Npb25zXG5cdCAqIGhhdmUgdGhlaXIgb3duIGRlZmVycmFsIHZpYSB7QGxpbmsgaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFja307XG5cdCAqIHRoaXMgY291bnRlciBpcyB0aGUgZXF1aXZhbGVudCBmb3IgYHJlcXVlc3RIYW5kbGVyYC1zdHlsZSBzZXNzaW9ucy5cblx0ICovXG5cdHByaXZhdGUgX2luRmxpZ2h0UmVxdWVzdENvdW50ID0gMDtcblxuXHRwcml2YXRlIF9pbml0aWFsaXphdGlvblByb21pc2U/OiBQcm9taXNlPHZvaWQ+O1xuXG5cdGludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s/OiAoKSA9PiBQcm9taXNlPGJvb2xlYW4+O1xuXHRyZXF1ZXN0SGFuZGxlcj86IChcblx0XHRyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCxcblx0XHRwcm9ncmVzczogKHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsXG5cdFx0aGlzdG9yeTogYW55W10sXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuXG5cdCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0Zm9ya1Nlc3Npb24/OiAocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJIYW5kbGU6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlO1xuXG5cdGdldCBwcm9ncmVzc09icygpOiBJT2JzZXJ2YWJsZTxJQ2hhdFByb2dyZXNzW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvZ3Jlc3NPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IGlzQ29tcGxldGVPYnMoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0NvbXBsZXRlT2JzZXJ2YWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0cHJvdmlkZXJIYW5kbGU6IG51bWJlcixcblx0XHRwcm94eTogRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlLFxuXHRcdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNlc3Npb25SZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdHRoaXMucHJvdmlkZXJIYW5kbGUgPSBwcm92aWRlckhhbmRsZTtcblx0XHR0aGlzLmhpc3RvcnkgPSBbXTtcblx0XHR0aGlzLl9wcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuX3Byb3ZpZGVySGFuZGxlID0gcHJvdmlkZXJIYW5kbGU7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy5fZGlhbG9nU2VydmljZSA9IGRpYWxvZ1NlcnZpY2U7XG5cdH1cblxuXHRpbml0aWFsaXplKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogQ2hhdFNlc3Npb25Db250ZW50Q29udGV4dER0byk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faW5pdGlhbGl6YXRpb25Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9pbml0aWFsaXphdGlvblByb21pc2UgPSB0aGlzLl9kb0luaXRpYWxpemVDb250ZW50KHRva2VuLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxpemF0aW9uUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvSW5pdGlhbGl6ZUNvbnRlbnQodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjb250ZXh0OiBDaGF0U2Vzc2lvbkNvbnRlbnRDb250ZXh0RHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25Db250ZW50ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKFxuXHRcdFx0XHR0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCh0aGlzLl9wcm92aWRlckhhbmRsZSwgdGhpcy5zZXNzaW9uUmVzb3VyY2UsIGNvbnRleHQsIHRva2VuKSxcblx0XHRcdFx0dG9rZW5cblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX29wdGlvbnMgPSBzZXNzaW9uQ29udGVudC5vcHRpb25zID8gQ2hhdFNlc3Npb25PcHRpb25zTWFwLmZyb21SZWNvcmQoc2Vzc2lvbkNvbnRlbnQub3B0aW9ucykgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnRpdGxlID0gc2Vzc2lvbkNvbnRlbnQudGl0bGU7XG5cdFx0XHR0aGlzLmhpc3RvcnkubGVuZ3RoID0gMDtcblx0XHRcdHRoaXMuaGlzdG9yeS5wdXNoKC4uLnNlc3Npb25Db250ZW50Lmhpc3RvcnkubWFwKCh0dXJuOiBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbUR0bykgPT4ge1xuXHRcdFx0XHRpZiAodHVybi50eXBlID09PSAncmVxdWVzdCcpIHtcblx0XHRcdFx0XHRjb25zdCB2YXJpYWJsZXMgPSB0dXJuLnZhcmlhYmxlRGF0YT8udmFyaWFibGVzLm1hcCh2ID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0ge1xuXHRcdFx0XHRcdFx0XHQuLi52LFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogcmV2aXZlKHYudmFsdWUpXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVudHJ5IGFzIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3JlcXVlc3QnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdFx0cHJvbXB0OiB0dXJuLnByb21wdCxcblx0XHRcdFx0XHRcdHBhcnRpY2lwYW50OiB0dXJuLnBhcnRpY2lwYW50LFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogdHVybi5jb21tYW5kLFxuXHRcdFx0XHRcdFx0dmFyaWFibGVEYXRhOiB2YXJpYWJsZXMgPyB7IHZhcmlhYmxlcyB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRcdFx0XHRtb2RlbElkOiB0dXJuLm1vZGVsSWQsXG5cdFx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB0dXJuLm1vZGVJbnN0cnVjdGlvbnMgPyByZXZpdmUodHVybi5tb2RlSW5zdHJ1Y3Rpb25zKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdyZXNwb25zZScgYXMgY29uc3QsXG5cdFx0XHRcdFx0cGFydHM6IHR1cm4ucGFydHMubWFwKChwYXJ0OiBJQ2hhdFByb2dyZXNzRHRvKSA9PiByZXZpdmUocGFydCkgYXMgSUNoYXRQcm9ncmVzcyksXG5cdFx0XHRcdFx0cGFydGljaXBhbnQ6IHR1cm4ucGFydGljaXBhbnQsXG5cdFx0XHRcdFx0ZGV0YWlsczogdHVybi5kZXRhaWxzLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbkNvbnRlbnQuaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjayAmJiAhdGhpcy5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrKSB7XG5cdFx0XHRcdHRoaXMuaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjayA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb25maXJtSW50ZXJydXB0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2FsUGVuZGluZykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kZGlzcG9zZUNoYXRTZXNzaW9uQ29udGVudCh0aGlzLl9wcm92aWRlckhhbmRsZSwgdGhpcy5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NhbFBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRpbnRlcnJ1cHRDaGF0U2Vzc2lvbkFjdGl2ZVJlc3BvbnNlKHRoaXMuX3Byb3ZpZGVySGFuZGxlLCB0aGlzLnNlc3Npb25SZXNvdXJjZSwgJ29uZ29pbmcnKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRpZiAoc2Vzc2lvbkNvbnRlbnQuc3VwcG9ydHNJbnRlcnJ1cHRpb24pIHtcblx0XHRcdFx0XHRcdC8vIElmIHRoZSBzZXNzaW9uIHN1cHBvcnRzIGhvdCByZWxvYWQsIGludGVycnVwdCB3aXRob3V0IGNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdFx0cmV0dXJuIGNvbmZpcm1JbnRlcnJ1cHQoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBQcm9tcHQgdGhlIHVzZXIgdG8gY29uZmlybSBpbnRlcnJ1cHRpb25cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZScsICdBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gaW50ZXJydXB0IHRoZSBhY3RpdmUgc2Vzc2lvbj8nKVxuXHRcdFx0XHRcdH0pLnRoZW4oY29uZmlybWVkID0+IHtcblx0XHRcdFx0XHRcdGlmIChjb25maXJtZWQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFVzZXIgY29uZmlybWVkIGludGVycnVwdGlvbiAtIGRpc3Bvc2UgdGhlIHNlc3Npb24gY29udGVudCBvbiBleHRlbnNpb24gaG9zdFxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY29uZmlybUludGVycnVwdCgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2hlbiB1c2VyIGNhbmNlbHMgdGhlIGludGVycnVwdGlvbiwgZmlyZSBhbiBlbXB0eSBwcm9ncmVzcyBtZXNzYWdlIHRvIGtlZXAgdGhlIHNlc3Npb24gYWxpdmVcblx0XHRcdFx0XHRcdFx0Ly8gVGhpcyBtYXRjaGVzIHRoZSBiZWhhdmlvciBvZiB0aGUgb2xkIGltcGxlbWVudGF0aW9uXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FkZFByb2dyZXNzKFt7XG5cdFx0XHRcdFx0XHRcdFx0a2luZDogJ3Byb2dyZXNzTWVzc2FnZScsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogeyB2YWx1ZTogJycsIGlzVHJ1c3RlZDogZmFsc2UgfVxuXHRcdFx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0XHRcdC8vIFNldCBmbGFnIHRvIHByZXZlbnQgY29tcGxldGlvbiB3aGVuIGV4dGVuc2lvbiBob3N0IGNhbGxzIGhhbmRsZVByb2dyZXNzQ29tcGxldGVcblx0XHRcdFx0XHRcdFx0dGhpcy5faW50ZXJydXB0aW9uV2FzQ2FuY2VsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHQvLyBVc2VyIGNhbmNlbGVkIGludGVycnVwdGlvbiAtIGNhbmNlbCB0aGUgZGVmZXJyZWQgZGlzcG9zYWxcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX2Rpc3Bvc2FsUGVuZGluZykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQ2FuY2VsaW5nIGRlZmVycmVkIGRpc3Bvc2FsIGZvciBzZXNzaW9uICR7dGhpcy5zZXNzaW9uUmVzb3VyY2V9ICh1c2VyIGNhbmNlbGVkIGludGVycnVwdGlvbilgKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NhbFBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uQ29udGVudC5oYXNSZXF1ZXN0SGFuZGxlciAmJiAhdGhpcy5yZXF1ZXN0SGFuZGxlcikge1xuXHRcdFx0XHR0aGlzLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKFxuXHRcdFx0XHRcdHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LFxuXHRcdFx0XHRcdHByb2dyZXNzOiAocHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCxcblx0XHRcdFx0XHRoaXN0b3J5OiBhbnlbXSxcblx0XHRcdFx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cblx0XHRcdFx0KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5faW5GbGlnaHRSZXF1ZXN0Q291bnQrKztcblx0XHRcdFx0XHQvLyBDbGVhciBwcmV2aW91cyBwcm9ncmVzcyBhbmQgbWFyayBhcyBhY3RpdmVcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzc09ic2VydmFibGUuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMuX2lzQ29tcGxldGVPYnNlcnZhYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRcdC8vIFNldCB1cCByZWFjdGl2ZSBwcm9ncmVzcyBvYnNlcnZhdGlvbiBiZWZvcmUgc3RhcnRpbmcgdGhlIHJlcXVlc3Rcblx0XHRcdFx0XHRsZXQgbGFzdFByb2dyZXNzTGVuZ3RoID0gMDtcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc0Rpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc0FycmF5ID0gdGhpcy5fcHJvZ3Jlc3NPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGNvbnN0IGlzQ29tcGxldGUgPSB0aGlzLl9pc0NvbXBsZXRlT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0XHRcdGlmIChwcm9ncmVzc0FycmF5Lmxlbmd0aCA+IGxhc3RQcm9ncmVzc0xlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuZXdQcm9ncmVzcyA9IHByb2dyZXNzQXJyYXkuc2xpY2UobGFzdFByb2dyZXNzTGVuZ3RoKTtcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3MobmV3UHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdFx0XHRsYXN0UHJvZ3Jlc3NMZW5ndGggPSBwcm9ncmVzc0FycmF5Lmxlbmd0aDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kaW52b2tlQ2hhdFNlc3Npb25SZXF1ZXN0SGFuZGxlcih0aGlzLl9wcm92aWRlckhhbmRsZSwgdGhpcy5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QsIGhpc3RvcnksIHRva2VuKTtcblxuXHRcdFx0XHRcdFx0Ly8gT25seSBtYXJrIGFzIGNvbXBsZXRlIGlmIHRoZXJlJ3Mgbm8gYWN0aXZlIHJlc3BvbnNlIGNhbGxiYWNrXG5cdFx0XHRcdFx0XHQvLyBTZXNzaW9ucyB3aXRoIGFjdGl2ZSByZXNwb25zZSBjYWxsYmFja3Mgc2hvdWxkIG9ubHkgY29tcGxldGUgd2hlbiBleHBsaWNpdGx5IHRvbGQgdG8gdmlhIGhhbmRsZVByb2dyZXNzQ29tcGxldGVcblx0XHRcdFx0XHRcdGlmICghdGhpcy5faXNDb21wbGV0ZU9ic2VydmFibGUuZ2V0KCkgJiYgIXRoaXMuaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjaykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9tYXJrQ29tcGxldGUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3JQcm9ncmVzczogSUNoYXRQcm9ncmVzcyA9IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3Byb2dyZXNzTWVzc2FnZScsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdmFsdWU6IGBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCwgaXNUcnVzdGVkOiBmYWxzZSB9XG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9hZGRQcm9ncmVzcyhbZXJyb3JQcm9ncmVzc10pO1xuXHRcdFx0XHRcdFx0dGhpcy5fbWFya0NvbXBsZXRlKCk7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0Ly8gRW5zdXJlIHByb2dyZXNzIG9ic2VydmF0aW9uIGlzIGNsZWFuZWQgdXBcblx0XHRcdFx0XHRcdHByb2dyZXNzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbkZsaWdodFJlcXVlc3RDb3VudC0tO1xuXHRcdFx0XHRcdFx0Ly8gSWYgYSBkaXNwb3NlIHdhcyByZXF1ZXN0ZWQgd2hpbGUgdGhpcyByZXF1ZXN0IHdhcyBpbiBmbGlnaHQsXG5cdFx0XHRcdFx0XHQvLyBmaXJlIHRoZSBwcm94eSBkaXNwb3NhbCBub3cgdGhhdCB0aGUgbGFzdCByZXF1ZXN0IGhhcyBzZXR0bGVkLlxuXHRcdFx0XHRcdFx0Ly8gR3VhcmRlZCBieSBgIXRoaXMuaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFja2Agc28gd2UgZG9uJ3Rcblx0XHRcdFx0XHRcdC8vIHRyYW1wbGUgdGhlIGV4aXN0aW5nIGludGVycnVwdGlvbi1jb25maXJtYXRpb24gZmxvdy5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9kaXNwb3NhbFBlbmRpbmcgJiYgdGhpcy5faW5GbGlnaHRSZXF1ZXN0Q291bnQgPT09IDAgJiYgIXRoaXMuaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjaykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NhbFBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQodGhpcy5fcHJvdmlkZXJIYW5kbGUsIHRoaXMuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uQ29udGVudC5oYXNGb3JrSGFuZGxlciAmJiAhdGhpcy5mb3JrU2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLmZvcmtTZXNzaW9uID0gYXN5bmMgKHJlcXVlc3Q6IElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJGZvcmtDaGF0U2Vzc2lvbih0aGlzLl9wcm92aWRlckhhbmRsZSwgdGhpcy5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QgPyB0aGlzLnRvUmVxdWVzdER0byhyZXF1ZXN0KSA6IHVuZGVmaW5lZCwgdG9rZW4pO1xuXHRcdFx0XHRcdHJldHVybiByZXZpdmUocmVzdWx0KSBhcyBJQ2hhdFNlc3Npb25JdGVtO1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9pc0luaXRpYWxpemVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gUHJvY2VzcyBhbnkgcGVuZGluZyBwcm9ncmVzcyBjaHVua3Ncblx0XHRcdGNvbnN0IGhhc0FjdGl2ZVJlc3BvbnNlID0gc2Vzc2lvbkNvbnRlbnQuaGFzQWN0aXZlUmVzcG9uc2VDYWxsYmFjaztcblx0XHRcdGNvbnN0IGhhc1JlcXVlc3RIYW5kbGVyID0gc2Vzc2lvbkNvbnRlbnQuaGFzUmVxdWVzdEhhbmRsZXI7XG5cdFx0XHRjb25zdCBoYXNBbnlDYXBhYmlsaXR5ID0gaGFzQWN0aXZlUmVzcG9uc2UgfHwgaGFzUmVxdWVzdEhhbmRsZXI7XG5cblx0XHRcdGZvciAoY29uc3QgW3JlcXVlc3RJZCwgY2h1bmtzXSBvZiB0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3MpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUHJvY2Vzc2luZyAke2NodW5rcy5sZW5ndGh9IHBlbmRpbmcgcHJvZ3Jlc3MgY2h1bmtzIGZvciBzZXNzaW9uICR7dGhpcy5zZXNzaW9uUmVzb3VyY2V9LCByZXF1ZXN0SWQgJHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRcdHRoaXMuX2FkZFByb2dyZXNzKGNodW5rcyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3MuY2xlYXIoKTtcblxuXHRcdFx0Ly8gSWYgc2Vzc2lvbiBoYXMgbm8gYWN0aXZlIHJlc3BvbnNlIGNhbGxiYWNrIGFuZCBubyByZXF1ZXN0IGhhbmRsZXIsIG1hcmsgaXQgYXMgY29tcGxldGVcblx0XHRcdGlmICghaGFzQW55Q2FwYWJpbGl0eSkge1xuXHRcdFx0XHR0aGlzLl9pc0NvbXBsZXRlT2JzZXJ2YWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBjaGF0IHNlc3Npb24gJHt0aGlzLnNlc3Npb25SZXNvdXJjZX06YCwgZXJyb3IpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBwcm9ncmVzcyBjaHVua3MgY29taW5nIGZyb20gdGhlIGV4dGVuc2lvbiBob3N0LlxuXHQgKiBJZiB0aGUgc2Vzc2lvbiBpcyBub3QgaW5pdGlhbGl6ZWQgeWV0LCB0aGUgY2h1bmtzIHdpbGwgYmUgcXVldWVkLlxuXHQgKi9cblx0aGFuZGxlUHJvZ3Jlc3NDaHVuayhyZXF1ZXN0SWQ6IHN0cmluZywgcHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNJbml0aWFsaXplZCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3MuZ2V0KHJlcXVlc3RJZCkgfHwgW107XG5cdFx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3Muc2V0KHJlcXVlc3RJZCwgWy4uLmV4aXN0aW5nLCAuLi5wcm9ncmVzc10pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUXVldWluZyAke3Byb2dyZXNzLmxlbmd0aH0gcHJvZ3Jlc3MgY2h1bmtzIGZvciBzZXNzaW9uICR7dGhpcy5zZXNzaW9uUmVzb3VyY2V9LCByZXF1ZXN0SWQgJHtyZXF1ZXN0SWR9IChzZXNzaW9uIG5vdCBpbml0aWFsaXplZClgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9hZGRQcm9ncmVzcyhwcm9ncmVzcyk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIHByb2dyZXNzIGNvbXBsZXRpb24gZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3QuXG5cdCAqL1xuXHRoYW5kbGVQcm9ncmVzc0NvbXBsZXRlKHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYW4gdXAgYW55IHBlbmRpbmcgY2h1bmtzIGZvciB0aGlzIHJlcXVlc3Rcblx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3MuZGVsZXRlKHJlcXVlc3RJZCk7XG5cblx0XHRpZiAodGhpcy5faXNJbml0aWFsaXplZCkge1xuXHRcdFx0Ly8gRG9uJ3QgbWFyayBhcyBjb21wbGV0ZSBpZiB1c2VyIGNhbmNlbGVkIHRoZSBpbnRlcnJ1cHRpb25cblx0XHRcdGlmICghdGhpcy5faW50ZXJydXB0aW9uV2FzQ2FuY2VsZWQpIHtcblx0XHRcdFx0dGhpcy5fbWFya0NvbXBsZXRlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXNldCB0aGUgZmxhZyBhbmQgZG9uJ3QgbWFyayBhcyBjb21wbGV0ZVxuXHRcdFx0XHR0aGlzLl9pbnRlcnJ1cHRpb25XYXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZFByb2dyZXNzKHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzW10pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50UHJvZ3Jlc3MgPSB0aGlzLl9wcm9ncmVzc09ic2VydmFibGUuZ2V0KCk7XG5cdFx0dGhpcy5fcHJvZ3Jlc3NPYnNlcnZhYmxlLnNldChbLi4uY3VycmVudFByb2dyZXNzLCAuLi5wcm9ncmVzc10sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrQ29tcGxldGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0NvbXBsZXRlT2JzZXJ2YWJsZS5nZXQoKSkge1xuXHRcdFx0dGhpcy5faXNDb21wbGV0ZU9ic2VydmFibGUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1JlcXVlc3REdG8ocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtKTogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0aWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRwcm9tcHQ6IHJlcXVlc3QucHJvbXB0LFxuXHRcdFx0cGFydGljaXBhbnQ6IHJlcXVlc3QucGFydGljaXBhbnQsXG5cdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmQsXG5cdFx0XHR2YXJpYWJsZURhdGE6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVsSWQ6IHJlcXVlc3QubW9kZWxJZCxcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IHJlcXVlc3QubW9kZUluc3RydWN0aW9ucyxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3NDaHVua3MuY2xlYXIoKTtcblxuXHRcdC8vIElmIHRoaXMgc2Vzc2lvbiBoYXMgYW4gYWN0aXZlIHJlc3BvbnNlIGNhbGxiYWNrIGFuZCBkaXNwb3NhbCBpcyBoYXBwZW5pbmcsXG5cdFx0Ly8gZGVmZXIgdGhlIGFjdHVhbCBzZXNzaW9uIGNvbnRlbnQgZGlzcG9zYWwgdW50aWwgd2Uga25vdyB0aGUgdXNlcidzIGNob2ljZVxuXHRcdGlmICh0aGlzLmludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2sgJiYgIXRoaXMuX2ludGVycnVwdGlvbldhc0NhbmNlbGVkKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhbFBlbmRpbmcgPSB0cnVlO1xuXHRcdFx0Ly8gVGhlIGFjdHVhbCBkaXNwb3NhbCB3aWxsIGhhcHBlbiBpbiB0aGUgaW50ZXJydXB0aW9uIGNhbGxiYWNrIGJhc2VkIG9uIHVzZXIncyBjaG9pY2Vcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2luRmxpZ2h0UmVxdWVzdENvdW50ID4gMCkge1xuXHRcdFx0Ly8gRGVmZW5zZSBpbiBkZXB0aCBmb3IgYHJlcXVlc3RIYW5kbGVyYC1zdHlsZSBzZXNzaW9ucyAoZS5nLiBDb3BpbG90IENMSSk6XG5cdFx0XHQvLyBkZWZlciB0aGUgZXh0LWhvc3QgZGlzcG9zYWwgdW50aWwgYW55IGluLWZsaWdodCByZXF1ZXN0IHNldHRsZXMgc28gdGhlXG5cdFx0XHQvLyBTREsgc2Vzc2lvbiBpc24ndCBhYm9ydGVkIG1pZC1yZXF1ZXN0LiBUaGUgZGVmZXJyZWQgY2FsbCBmaXJlcyBmcm9tXG5cdFx0XHQvLyB0aGUgYHJlcXVlc3RIYW5kbGVyYCdzIGBmaW5hbGx5YCBibG9jayB3aGVuIHRoZSBjb3VudGVyIHJlYWNoZXMgemVyby5cblx0XHRcdHRoaXMuX2Rpc3Bvc2FsUGVuZGluZyA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vIGFjdGl2ZSByZXNwb25zZSBjYWxsYmFjayBvciB1c2VyIGFscmVhZHkgY2FuY2VsZWQgaW50ZXJydXB0aW9uIC0gZGlzcG9zZSBpbW1lZGlhdGVseVxuXHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQodGhpcy5fcHJvdmlkZXJIYW5kbGUsIHRoaXMuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcjtcblx0cHJpdmF0ZSBfc3VwcG9ydHNSZXNvbHZlOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0U2Vzc2lvbkl0ZW1zRGVsdGE+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zID0gdGhpcy5fb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNvdXJjZU1hcCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZUNhY2hlID0gbmV3IFJlc291cmNlTWFwPFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmluZyA9IG5ldyBSZXNvdXJjZU1hcDx0cnVlPigpO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm94eTogRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlLFxuXHRcdGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRcdGhhbmRsZTogbnVtYmVyLFxuXHRcdHN1cHBvcnRzUmVzb2x2ZTogYm9vbGVhbixcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9wcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuX2hhbmRsZSA9IGhhbmRsZTtcblx0XHR0aGlzLl9zdXBwb3J0c1Jlc29sdmUgPSBzdXBwb3J0c1Jlc29sdmU7XG5cdFx0Ly8gVXBkYXRlIHRoZSBjaGF0IHNlc3Npb24gaXRlbSBiYXNlZCBvbiBvbiB0aGUgYWN0dWFsIG1vZGVsIHN0YXRlXG5cdFx0Ly8gVE9ETzogVGhpcyBzaG91bGQgYmUgYmFzZWQgb24gdGhlIGNoYXQgc2Vzc2lvbiBjb250ZW50IHByb3ZpZGVyIGluc3RlYWQgb2YgdGhlIGNoYXQgbW9kZWxzIGRpcmVjdGx5XG5cdFx0Ly8gb3IgYmVkIG1vdmVkIGludG8gdGhlIGNoYXQgc2Vzc2lvbiBzZXJ2aWNlIHNvIHRoYXQgYWxsIGNvbnRyb2xsZXJzIGdldCB0aGUgc2FtZSBiZWhhdmlvci5cblx0XHRjb25zdCBhZGRNb2RlbExpc3RlbmVycyA9IGFzeW5jIChtb2RlbDogSUNoYXRNb2RlbCkgPT4ge1xuXHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpICE9PSBjaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2goQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJ5VXBkYXRlSXRlbUZvck1vZGVsKG1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVxdWVzdENoYW5nZUxpc3RlbmVyID0gbW9kZWwubGFzdFJlcXVlc3RPYnMubWFwKGxhc3QgPT4gbGFzdD8ucmVzcG9uc2UgJiYgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCgnY2hhdFNlc3Npb25zLm1vZGVsUmVxdWVzdENoYW5nZUxpc3RlbmVyJywgbGFzdC5yZXNwb25zZS5vbkRpZENoYW5nZSkpO1xuXHRcdFx0Y29uc3QgbW9kZWxDaGFuZ2VMaXN0ZW5lciA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoJ2NoYXRTZXNzaW9ucy5tb2RlbENoYW5nZUxpc3RlbmVyJywgbW9kZWwub25EaWRDaGFuZ2UpO1xuXHRcdFx0dGhpcy5fbW9kZWxMaXN0ZW5lcnMuc2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0Q2hhbmdlTGlzdGVuZXIucmVhZChyZWFkZXIpPy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdG1vZGVsQ2hhbmdlTGlzdGVuZXIucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdHRoaXMudHJ5VXBkYXRlSXRlbUZvck1vZGVsKG1vZGVsKTtcblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2NoYXRTZXJ2aWNlLm9uRGlkQ3JlYXRlTW9kZWwobW9kZWwgPT4gYWRkTW9kZWxMaXN0ZW5lcnMobW9kZWwpKSk7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBfY2hhdFNlcnZpY2UuY2hhdE1vZGVscy5nZXQoKSkge1xuXHRcdFx0YWRkTW9kZWxMaXN0ZW5lcnMobW9kZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jaGF0U2VydmljZS5vbkRpZERpc3Bvc2VTZXNzaW9uKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uUmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3Jlc29sdmVDYWNoZS5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zID0gbmV3IFJlc291cmNlTWFwPE1haW5UaHJlYWRDaGF0U2Vzc2lvbkl0ZW0+KCk7XG5cdGdldCBpdGVtcygpOiBJQ2hhdFNlc3Npb25JdGVtW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2l0ZW1zLnZhbHVlcygpKTtcblx0fVxuXG5cdHJlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZWZyZXNoQ2hhdFNlc3Npb25JdGVtcyh0aGlzLl9oYW5kbGUsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIG5ld0NoYXRTZXNzaW9uSXRlbShyZXF1ZXN0OiBJQ2hhdE5ld1Nlc3Npb25SZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkdG8gPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IodGhpcy5fcHJveHkuJG5ld0NoYXRTZXNzaW9uSXRlbSh0aGlzLl9oYW5kbGUsIHtcblx0XHRcdHByb21wdDogcmVxdWVzdC5wcm9tcHQsXG5cdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmQsXG5cdFx0XHRpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IHJlcXVlc3QuaW5pdGlhbFNlc3Npb25PcHRpb25zID8gQ2hhdFNlc3Npb25PcHRpb25zTWFwLnRvU3RyVmFsdWVBcnJheShyZXF1ZXN0LmluaXRpYWxTZXNzaW9uT3B0aW9ucykgOiB1bmRlZmluZWQsXG5cdFx0fSwgdG9rZW4pLCB0b2tlbik7XG5cdFx0aWYgKCFkdG8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmFkZE9yVXBkYXRlSXRlbShkdG8pO1xuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0Q2hhbmdlKGNoYW5nZTogeyByZWFkb25seSBhZGRlZE9yVXBkYXRlZDogcmVhZG9ubHkgRHRvPElDaGF0U2Vzc2lvbkl0ZW0+W107IHJlYWRvbmx5IHJlbW92ZWQ6IHJlYWRvbmx5IFVSSVtdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhZGRlZE9yVXBkYXRlZEl0ZW1zOiBNYWluVGhyZWFkQ2hhdFNlc3Npb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY2hhbmdlLmFkZGVkT3JVcGRhdGVkKSB7XG5cdFx0XHQvLyBJbnZhbGlkYXRlIHJlc29sdmUgY2FjaGUgd2hlbiBpdGVtIGlzIHVwZGF0ZWQgXHUyMDE0IGJ1dCBub3QgaWYgdGhlIHVwZGF0ZVxuXHRcdFx0Ly8gb3JpZ2luYXRlZCBmcm9tIGFuIGluLWZsaWdodCByZXNvbHZlIGNhbGwuXG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUoaXRlbS5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXRoaXMuX3Jlc29sdmluZy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVDYWNoZS5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0YWRkZWRPclVwZGF0ZWRJdGVtcy5wdXNoKGF3YWl0IHRoaXMuYWRkT3JVcGRhdGVJdGVtKGl0ZW0pKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgY2hhbmdlLnJlbW92ZWQpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVDYWNoZS5kZWxldGUodXJpKTtcblx0XHRcdHRoaXMuX2l0ZW1zLmRlbGV0ZSh1cmkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMuZmlyZSh7XG5cdFx0XHRhZGRlZE9yVXBkYXRlZDogYWRkZWRPclVwZGF0ZWRJdGVtcyxcblx0XHRcdHJlbW92ZWQ6IGNoYW5nZS5yZW1vdmVkLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRPclVwZGF0ZUl0ZW0oZHRvOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4pOiBQcm9taXNlPE1haW5UaHJlYWRDaGF0U2Vzc2lvbkl0ZW0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUoZHRvLnJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2l0ZW1zLmdldChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IG5ldyBNYWluVGhyZWFkQ2hhdFNlc3Npb25JdGVtKGR0bywgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSksIGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLmdldE1ldGFkYXRhRm9yU2Vzc2lvbihyZXNvdXJjZSkpO1xuXHRcdGlmIChleGlzdGluZz8uaXNFcXVhbCh1cGRhdGVkKSkge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdC8vIFByb3BhZ2F0ZSBhIHJlbmFtZWQgaXRlbSBsYWJlbCB0byB0aGUgb3BlbiBjaGF0IG1vZGVsIHNvIHRoZSBjaGF0IGVkaXRvciB0YWJcblx0XHQvLyBhbmQgY2hhdCBwYW5lbCBoZWFkZXIgcmVmbGVjdCB0aGUgbmV3IHRpdGxlLlxuXHRcdGlmIChleGlzdGluZyAmJiBleGlzdGluZy5sYWJlbCAhPT0gdXBkYXRlZC5sYWJlbCAmJiB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5fY2hhdFNlcnZpY2Uuc2V0U2Vzc2lvblRpdGxlKHJlc291cmNlLCB1cGRhdGVkLmxhYmVsKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pdGVtcy5zZXQocmVzb3VyY2UsIHVwZGF0ZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcy5maXJlKHtcblx0XHRcdGFkZGVkT3JVcGRhdGVkOiBbdXBkYXRlZF0sXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHVwZGF0ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeVVwZGF0ZUl0ZW1Gb3JNb2RlbChtb2RlbDogSUNoYXRNb2RlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5faXRlbXMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHRoaXMuYWRkT3JVcGRhdGVJdGVtKGV4aXN0aW5nKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXROZXdDaGF0U2Vzc2lvbklucHV0U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3B0aW9uR3JvdXBzID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDaGF0U2Vzc2lvbklucHV0U3RhdGUodGhpcy5faGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0XHRpZiAoIW9wdGlvbkdyb3Vwcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gb3B0aW9uR3JvdXBzO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3N1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gY2FjaGVkIHByb21pc2UgaWYgdGhpcyBpdGVtIHdhcyBhbHJlYWR5IHJlc29sdmVkIG9yIGlzIGN1cnJlbnRseSByZXNvbHZpbmcuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcmVzb2x2ZUNhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fZG9SZXNvbHZlSXRlbShyZXNvdXJjZSwgdG9rZW4pLmNhdGNoKFxuXHRcdFx0ZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNhY2hlLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX3Jlc29sdmVDYWNoZS5zZXQocmVzb3VyY2UsIHByb21pc2UpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZXNvbHZlSXRlbShyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleHBlY3RlZEl0ZW0gPSB0aGlzLl9pdGVtcy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0Ly8gTWFyayB0aGlzIHJlc291cmNlIGFzIHJlc29sdmluZyBzbyB0aGF0IGFueSBjb2xsZWN0aW9uIHVwZGF0ZXMgdHJpZ2dlcmVkXG5cdFx0Ly8gYnkgdGhlIGV4dGVuc2lvbiBpbnNpZGUgdGhlIHJlc29sdmUgaGFuZGxlciAoZS5nLiBjb2xsZWN0aW9uLmFkZCgpKSBkb1xuXHRcdC8vIG5vdCBjbGVhciB0aGUgcmVzb2x2ZSBjYWNoZSBhbmQgY2F1c2UgYW4gaW5maW5pdGUgbG9vcC5cblx0XHR0aGlzLl9yZXNvbHZpbmcuc2V0KHJlc291cmNlLCB0cnVlKTtcblx0XHRsZXQgZHRvOiBEdG88SUNoYXRTZXNzaW9uSXRlbT4gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGR0byA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLl9wcm94eS4kcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSh0aGlzLl9oYW5kbGUsIHJlc291cmNlLCB0b2tlbiksIHRva2VuKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcmVzb2x2aW5nLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGlmICghZHRvKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pdGVtcy5nZXQocmVzb3VyY2UpICE9PSBleHBlY3RlZEl0ZW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9pdGVtcy5nZXQocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZWQgPSBuZXcgTWFpblRocmVhZENoYXRTZXNzaW9uSXRlbShcblx0XHRcdGR0byxcblx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpLFxuXHRcdFx0YXdhaXQgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0TWV0YWRhdGFGb3JTZXNzaW9uKHJlc291cmNlKVxuXHRcdCk7XG5cblx0XHRpZiAodGhpcy5faXRlbXMuZ2V0KHJlc291cmNlKSAhPT0gZXhwZWN0ZWRJdGVtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faXRlbXMuZ2V0KHJlc291cmNlKTtcblx0XHR9XG5cblxuXHRcdGlmIChleHBlY3RlZEl0ZW0/LmlzRXF1YWwodXBkYXRlZCkpIHtcblx0XHRcdHJldHVybiBleHBlY3RlZEl0ZW07XG5cdFx0fVxuXG5cdFx0dGhpcy5faXRlbXMuc2V0KHJlc291cmNlLCB1cGRhdGVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMuZmlyZSh7XG5cdFx0XHRhZGRlZE9yVXBkYXRlZDogW3VwZGF0ZWRdLFxuXHRcdH0pO1xuXHRcdHJldHVybiB1cGRhdGVkO1xuXHR9XG5cblx0c2V0U3VwcG9ydHNSZXNvbHZlKHN1cHBvcnRzUmVzb2x2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdXBwb3J0c1Jlc29sdmUgPT09IHN1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdXBwb3J0c1Jlc29sdmUgPSBzdXBwb3J0c1Jlc29sdmU7XG5cdFx0Ly8gRHJvcCBhbnkgY2FjaGVkIGB1bmRlZmluZWRgIHJlc3VsdHMgc28gYSBuZXdseS1pbnN0YWxsZWQgaGFuZGxlciBjYW4gYmUgaW52b2tlZC5cblx0XHRpZiAoc3VwcG9ydHNSZXNvbHZlKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ2FjaGUuY2xlYXIoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZENoYXRTZXNzaW9uSXRlbSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkl0ZW0ge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb25QYXRoPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBiYWRnZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXR1cz86IENoYXRTZXNzaW9uU3RhdHVzO1xuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSB0aW1pbmc6IElDaGF0U2Vzc2lvblRpbWluZztcblx0cmVhZG9ubHkgY2hhbmdlcz86IElDaGF0U2Vzc2lvbkl0ZW1bJ2NoYW5nZXMnXTtcblx0cmVhZG9ubHkgYXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHRyZWFkb25seSBsZWdhY3lSZXNvdXJjZT86IFVSSTtcblxuXHRjb25zdHJ1Y3RvcihkdG86IER0bzxJQ2hhdFNlc3Npb25JdGVtPiwgbW9kZWw6IElDaGF0TW9kZWwgfCB1bmRlZmluZWQsIGRldGFpbE92ZXJyaWRlczogSUNoYXREZXRhaWwgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnJlc291cmNlID0gVVJJLnJldml2ZShkdG8ucmVzb3VyY2UpO1xuXHRcdHRoaXMubGFiZWwgPSBkdG8ubGFiZWw7XG5cdFx0dGhpcy50aW1pbmcgPSBkdG8udGltaW5nO1xuXHRcdHRoaXMuaWNvblBhdGggPSBkdG8uaWNvblBhdGg7XG5cdFx0dGhpcy5iYWRnZSA9IHJldml2ZU1hcmtkb3duU3RyaW5nKGR0by5iYWRnZSk7XG5cdFx0dGhpcy50b29sdGlwID0gcmV2aXZlTWFya2Rvd25TdHJpbmcoZHRvLnRvb2x0aXApO1xuXHRcdHRoaXMuYXJjaGl2ZWQgPSBkdG8uYXJjaGl2ZWQ7XG5cdFx0dGhpcy5tZXRhZGF0YSA9IGR0by5tZXRhZGF0YTtcblx0XHR0aGlzLmxlZ2FjeVJlc291cmNlID0gZHRvLmxlZ2FjeVJlc291cmNlID8gVVJJLnJldml2ZShkdG8ubGVnYWN5UmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IChtb2RlbCAmJiBnZXRJblByb2dyZXNzU2Vzc2lvbkRlc2NyaXB0aW9uKG1vZGVsKSkgPz8gcmV2aXZlTWFya2Rvd25TdHJpbmcoZHRvLmRlc2NyaXB0aW9uKTtcblx0XHR0aGlzLnN0YXR1cyA9IChtb2RlbCAmJiBnZXRTZXNzaW9uU3RhdHVzRm9yTW9kZWwobW9kZWwpKSA/PyBkdG8uc3RhdHVzO1xuXG5cdFx0dGhpcy5jaGFuZ2VzID0gcmV2aXZlKGR0by5jaGFuZ2VzKTtcblxuXHRcdC8vIFdlIGNhbiBzdGlsbCBnZXQgc3RhdHMgaWYgdGhlcmUgaXMgbm8gbW9kZWwgb3IgaWYgZmV0Y2hpbmcgZnJvbSBtb2RlbCBmYWlsZWRcblx0XHRpZiAoZGV0YWlsT3ZlcnJpZGVzICYmICF0aGlzLmNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IGRpZmZzOiBJQWdlbnRTZXNzaW9uWydjaGFuZ2VzJ10gPSB7XG5cdFx0XHRcdGZpbGVzOiBkZXRhaWxPdmVycmlkZXMuc3RhdHM/LmZpbGVDb3VudCB8fCAwLFxuXHRcdFx0XHRpbnNlcnRpb25zOiBkZXRhaWxPdmVycmlkZXMuc3RhdHM/LmFkZGVkIHx8IDAsXG5cdFx0XHRcdGRlbGV0aW9uczogZGV0YWlsT3ZlcnJpZGVzLnN0YXRzPy5yZW1vdmVkIHx8IDBcblx0XHRcdH07XG5cdFx0XHRpZiAoaGFzVmFsaWREaWZmKGRpZmZzKSkge1xuXHRcdFx0XHR0aGlzLmNoYW5nZXMgPSBkaWZmcztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpc0VxdWFsKG90aGVyOiBNYWluVGhyZWFkQ2hhdFNlc3Npb25JdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzRXF1YWwodGhpcy5yZXNvdXJjZSwgb3RoZXIucmVzb3VyY2UpXG5cdFx0XHQmJiB0aGlzLmxhYmVsID09PSBvdGhlci5sYWJlbFxuXHRcdFx0JiYgdGhpcy5kZXNjcmlwdGlvbiA9PT0gb3RoZXIuZGVzY3JpcHRpb25cblx0XHRcdCYmIHRoaXMuc3RhdHVzID09PSBvdGhlci5zdGF0dXNcblx0XHRcdCYmIHRoaXMudGltaW5nLmNyZWF0ZWQgPT09IG90aGVyLnRpbWluZy5jcmVhdGVkXG5cdFx0XHQmJiB0aGlzLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQgPT09IG90aGVyLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWRcblx0XHRcdCYmIHRoaXMudGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPT09IG90aGVyLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkXG5cdFx0XHQmJiBlcXVhbHModGhpcy5jaGFuZ2VzLCBvdGhlci5jaGFuZ2VzKVxuXHRcdFx0JiYgZXF1YWxzKHRoaXMuaWNvblBhdGgsIG90aGVyLmljb25QYXRoKVxuXHRcdFx0JiYgc3RyaW5nT3JNYXJrZG93bkVxdWFsKHRoaXMuYmFkZ2UsIG90aGVyLmJhZGdlKVxuXHRcdFx0JiYgc3RyaW5nT3JNYXJrZG93bkVxdWFsKHRoaXMudG9vbHRpcCwgb3RoZXIudG9vbHRpcClcblx0XHRcdCYmIHRoaXMuYXJjaGl2ZWQgPT09IG90aGVyLmFyY2hpdmVkXG5cdFx0XHQmJiBlcXVhbHModGhpcy5tZXRhZGF0YSwgb3RoZXIubWV0YWRhdGEpXG5cdFx0XHQmJiBpc0VxdWFsKHRoaXMubGVnYWN5UmVzb3VyY2UsIG90aGVyLmxlZ2FjeVJlc291cmNlKTtcblx0fVxufVxuXG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdFNlc3Npb25zKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDaGF0U2Vzc2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZENoYXRTZXNzaW9uc1NoYXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbUNvbnRyb2xsZXJSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZSAmIHtcblx0XHRyZWFkb25seSBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZztcblx0XHRyZWFkb25seSBjb250cm9sbGVyOiBNYWluVGhyZWFkQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcjtcblx0fT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRQcm92aWRlcnNSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblR5cGVUb0hhbmRsZSA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8T2JzZXJ2YWJsZUNoYXRTZXNzaW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFRvZG9MaXN0U2VydmljZTogSUNoYXRUb2RvTGlzdFNlcnZpY2UsXG5cdFx0QElDaGF0QXJ0aWZhY3RzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QXJ0aWZhY3RzU2VydmljZTogSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdERlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3Byb3h5ID0gdGhpcy5fZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdENoYXRTZXNzaW9ucyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMoKHsgc2Vzc2lvblJlc291cmNlLCB1cGRhdGVzIH0pID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9nZXRIYW5kbGVGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTWFpblRocmVhZENoYXRTZXNzaW9uc10gb25SZXF1ZXN0Tm90aWZ5RXh0ZW5zaW9uIHJlY2VpdmVkOiBzZXNzaW9uVHlwZSAnJHtzZXNzaW9uVHlwZX0nLCBoYW5kbGUgJHtoYW5kbGV9LCAke3VwZGF0ZXMuc2l6ZX0gdXBkYXRlKHMpYCk7XG5cdFx0XHRpZiAoaGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5ub3RpZnlPcHRpb25zQ2hhbmdlKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCB1cGRhdGVzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW01haW5UaHJlYWRDaGF0U2Vzc2lvbnNdIENhbm5vdCBub3RpZnkgb3B0aW9uIGNoYW5nZSBmb3Igc2Vzc2lvblR5cGUgJyR7c2Vzc2lvblR5cGV9Jzogbm8gcHJvdmlkZXIgcmVnaXN0ZXJlZC4gUmVnaXN0ZXJlZCB0eXBlczogWyR7QXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9uVHlwZVRvSGFuZGxlLmtleXMoKSkuam9pbignLCAnKX1dYCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZShzZXNzaW9uID0+IHtcblx0XHRcdGZvciAoY29uc3QgW2hhbmRsZSwgeyBjaGF0U2Vzc2lvblR5cGUgfV0gb2YgdGhpcy5faXRlbUNvbnRyb2xsZXJSZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRcdGlmIChjaGF0U2Vzc2lvblR5cGUgPT09IHNlc3Npb24ucHJvdmlkZXJUeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGUoaGFuZGxlLCBzZXNzaW9uLnJlc291cmNlLCBzZXNzaW9uLmlzQXJjaGl2ZWQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIYW5kbGVGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25UeXBlVG9IYW5kbGUuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGhhbmRsZTogbnVtYmVyLCBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgc3VwcG9ydHNSZXNvbHZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyLCB0aGlzLl9wcm94eSwgY2hhdFNlc3Npb25UeXBlLCBoYW5kbGUsIHN1cHBvcnRzUmVzb2x2ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblR5cGUsIGNvbnRyb2xsZXIpKTtcblxuXHRcdHRoaXMuX2l0ZW1Db250cm9sbGVyUmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB7XG5cdFx0XHRjaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRjb250cm9sbGVyLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpLFxuXHRcdH0pO1xuXG5cdFx0Ly8gRmV0Y2ggaW5pdGlhbCBpbnB1dCBzdGF0ZSBmb3IgbmV3L3VudGl0bGVkIHNlc3Npb25zXG5cdFx0dGhpcy5fcmVmcmVzaENvbnRyb2xsZXJJbnB1dFN0YXRlKGhhbmRsZSwgY2hhdFNlc3Npb25UeXBlKTtcblx0fVxuXG5cdCR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzKGhhbmRsZTogbnVtYmVyLCBzdXBwb3J0c1Jlc29sdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9pdGVtQ29udHJvbGxlclJlZ2lzdHJhdGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFyZWdpc3RyYXRpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gY2hhdCBzZXNzaW9uIGl0ZW0gY29udHJvbGxlciBmb3VuZCBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZWdpc3RyYXRpb24uY29udHJvbGxlci5zZXRTdXBwb3J0c1Jlc29sdmUoc3VwcG9ydHNSZXNvbHZlKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hDb250cm9sbGVySW5wdXRTdGF0ZShoYW5kbGU6IG51bWJlciwgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZShoYW5kbGUsIHVuZGVmaW5lZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihvcHRpb25Hcm91cHMgPT4ge1xuXHRcdFx0aWYgKG9wdGlvbkdyb3Vwcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5T3B0aW9uR3JvdXBzKGhhbmRsZSwgY2hhdFNlc3Npb25UeXBlLCB1bmRlZmluZWQsIG9wdGlvbkdyb3Vwcyk7XG5cdFx0XHR9XG5cdFx0fSkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIGNoYXQgc2Vzc2lvbiBpbnB1dCBzdGF0ZScsIGVycikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlPcHRpb25Hcm91cHMoaGFuZGxlOiBudW1iZXIsIGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCBvcHRpb25Hcm91cHM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlLCBoYW5kbGUsIG9wdGlvbkdyb3Vwcyk7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0XHRvcHRpb25Hcm91cHMuZm9yRWFjaChncm91cCA9PiB7XG5cdFx0XHRcdGlmIChncm91cC5zZWxlY3RlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIGdyb3VwLmlkLCBncm91cC5zZWxlY3RlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udHJvbGxlcihoYW5kbGU6IG51bWJlcik6IE1haW5UaHJlYWRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9pdGVtQ29udHJvbGxlclJlZ2lzdHJhdGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFyZWdpc3RyYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gY2hhdCBzZXNzaW9uIGNvbnRyb2xsZXIgcmVnaXN0ZXJlZCBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVnaXN0cmF0aW9uLmNvbnRyb2xsZXI7XG5cdH1cblxuXHRhc3luYyAkdXBkYXRlQ2hhdFNlc3Npb25JdGVtcyhjb250cm9sbGVySGFuZGxlOiBudW1iZXIsIGNoYW5nZTogSUNoYXRTZXNzaW9uSXRlbXNDaGFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5nZXRDb250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHRcdGNvbnRyb2xsZXIuYWNjZXB0Q2hhbmdlKHtcblx0XHRcdGFkZGVkT3JVcGRhdGVkOiBjaGFuZ2UuYWRkZWRPclVwZGF0ZWQsXG5cdFx0XHRyZW1vdmVkOiBjaGFuZ2UucmVtb3ZlZC5tYXAodXJpID0+IFVSSS5yZXZpdmUodXJpKSlcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbShjb250cm9sbGVySGFuZGxlOiBudW1iZXIsIGl0ZW06IER0bzxJQ2hhdFNlc3Npb25JdGVtPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmdldENvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0Y29udHJvbGxlci5hY2NlcHRDaGFuZ2Uoe1xuXHRcdFx0YWRkZWRPclVwZGF0ZWQ6IFtpdGVtXSxcblx0XHRcdHJlbW92ZWQ6IFtdXG5cdFx0fSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbk9wdGlvbnMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHVwZGF0ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbT4pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMoc2Vzc2lvblJlc291cmNlLCBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAuZnJvbVJlY29yZCh1cGRhdGVzKSk7XG5cdH1cblxuXHRhc3luYyAkb25EaWRDb21taXRDaGF0U2Vzc2lvbkl0ZW0oaGFuZGxlOiBudW1iZXIsIG9yaWdpbmFsQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgbW9kaWZpZWRDb21wb2VubnRzOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IFVSSS5yZXZpdmUob3JpZ2luYWxDb21wb25lbnRzKTtcblx0XHRjb25zdCBtb2RpZmllZFJlc291cmNlID0gVVJJLnJldml2ZShtb2RpZmllZENvbXBvZW5udHMpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJG9uRGlkQ29tbWl0Q2hhdFNlc3Npb25JdGVtOiBoYW5kbGUoJHtoYW5kbGV9KSwgb3JpZ2luYWwoJHtvcmlnaW5hbFJlc291cmNlfSksIG1vZGlmaWVkKCR7bW9kaWZpZWRSZXNvdXJjZX0pYCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25UeXBlID0gdGhpcy5faXRlbUNvbnRyb2xsZXJSZWdpc3RyYXRpb25zLmdldChoYW5kbGUpPy5jaGF0U2Vzc2lvblR5cGU7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE5vIGNoYXQgc2Vzc2lvbiB0eXBlIGZvdW5kIGZvciBwcm92aWRlciBoYW5kbGUgJHtoYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxFZGl0b3IgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpID09PSBvcmlnaW5hbFJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkuZmluZChjID0+IGMudHlwZSA9PT0gY2hhdFNlc3Npb25UeXBlKTtcblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIE1pZ3JhdGUgdG9kb3MgZnJvbSBvbGQgc2Vzc2lvbiB0byBuZXcgc2Vzc2lvblxuXHRcdFx0dGhpcy5fY2hhdFRvZG9MaXN0U2VydmljZS5taWdyYXRlVG9kb3Mob3JpZ2luYWxSZXNvdXJjZSwgbW9kaWZpZWRSZXNvdXJjZSk7XG5cblx0XHRcdC8vIE1pZ3JhdGUgYXJ0aWZhY3RzIGZyb20gb2xkIHNlc3Npb24gdG8gbmV3IHNlc3Npb25cblx0XHRcdHRoaXMuX2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmdldEFydGlmYWN0cyhvcmlnaW5hbFJlc291cmNlKS5taWdyYXRlKHRoaXMuX2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmdldEFydGlmYWN0cyhtb2RpZmllZFJlc291cmNlKSk7XG5cblx0XHRcdC8vIEVhZ2VybHkgaW52b2tlIGRlYnVnIHByb3ZpZGVycyBmb3IgQ29waWxvdCBDTEkgc2Vzc2lvbnMgc28gdGhlIHJlYWxcblx0XHRcdC8vIHNlc3Npb24gYXBwZWFycyBpbiB0aGUgZGVidWcgcGFuZWwgaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIHVudGl0bGVkIFx1MjE5MlxuXHRcdFx0Ly8gcmVhbCBzd2FwLiBXaXRob3V0IHRoaXMsIHRoZSB1bnRpdGxlZCBzZXNzaW9uIGlzIGZpbHRlcmVkIG91dCAoaXRcblx0XHRcdC8vIG9ubHkgaGFzIGEgXCJMb2FkIEhvb2tzXCIgZXZlbnQpIGFuZCB0aGUgcmVhbCBzZXNzaW9uIGhhcyBubyBldmVudHNcblx0XHRcdC8vIHVudGlsIHNvbWVvbmUgbmF2aWdhdGVzIHRvIGl0IFx1MjAxNCB3aGljaCBjYW4ndCBoYXBwZW4gYmVjYXVzZSBpdCdzXG5cdFx0XHQvLyBub3QgbGlzdGVkLlxuXHRcdFx0aWYgKGNoYXRTZXNzaW9uVHlwZSA9PT0gJ2NvcGlsb3RjbGknKSB7XG5cdFx0XHRcdC8vIEZpcmUtYW5kLWZvcmdldDogZG9uJ3QgYmxvY2sgdGhlIGVkaXRvciBzd2FwLiBFcnJvcnMgYXJlXG5cdFx0XHRcdC8vIGhhbmRsZWQgaW50ZXJuYWxseSBieSBpbnZva2VQcm92aWRlcnMgdmlhIG9uVW5leHBlY3RlZEVycm9yLlxuXHRcdFx0XHR0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmludm9rZVByb3ZpZGVycyhtb2RpZmllZFJlc291cmNlKS5jYXRjaCgoKSA9PiB7IC8qIGhhbmRsZWQgaW50ZXJuYWxseSAqLyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmluZCB0aGUgZ3JvdXAgY29udGFpbmluZyB0aGUgb3JpZ2luYWwgZWRpdG9yXG5cdFx0XHRjb25zdCBvcmlnaW5hbEdyb3VwID1cblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzLmZpbmQoZ3JvdXAgPT4gZ3JvdXAuZWRpdG9ycy5zb21lKGVkaXRvciA9PiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgb3JpZ2luYWxSZXNvdXJjZSkpKVxuXHRcdFx0XHQ/PyB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblxuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdHByZWZlcnJlZDogb3JpZ2luYWxFZGl0b3I/LmdldE5hbWUoKSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZmFsbGJhY2s6IGxvY2FsaXplKCdjaGF0RWRpdG9yQ29udHJpYnV0aW9uTmFtZScsIFwiezB9XCIsIGNvbnRyaWJ1dGlvbj8uZGlzcGxheU5hbWUpLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBQcmVmZXRjaCB0aGUgY2hhdCBzZXNzaW9uIGNvbnRlbnQgdG8gbWFrZSB0aGUgc3Vic2VxdWVudCBlZGl0b3Igc3dhcCBxdWlja1xuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihcblx0XHRcdFx0VVJJLnJldml2ZShtb2RpZmllZFJlc291cmNlKSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cblx0XHRcdGlmIChvcmlnaW5hbEVkaXRvcikge1xuXHRcdFx0XHRuZXdTZXNzaW9uLnRyYW5zZmVycmVkU3RhdGUgPSBvcmlnaW5hbEVkaXRvciBpbnN0YW5jZW9mIENoYXRFZGl0b3JJbnB1dFxuXHRcdFx0XHRcdD8geyBlZGl0aW5nU2Vzc2lvbjogb3JpZ2luYWxFZGl0b3IudHJhbnNmZXJPdXRFZGl0aW5nU2Vzc2lvbigpLCBpbnB1dFN0YXRlOiBvcmlnaW5hbE1vZGVsPy5vYmplY3Q/LmlucHV0TW9kZWwudG9KU09OKCkgfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2UucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdFx0XHRlZGl0b3I6IG9yaWdpbmFsRWRpdG9yLFxuXHRcdFx0XHRcdHJlcGxhY2VtZW50OiB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogbW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sIG9yaWdpbmFsR3JvdXApO1xuXG5cdFx0XHRcdC8vIFJlLXNlbmQgcXVldWVkIHJlcXVlc3RzIGZyb20gdGhlIG9yaWdpbmFsIHNlc3Npb24gb24gdGhlIGNvbW1pdHRlZCBzZXNzaW9uXG5cdFx0XHRcdHRoaXMuX3Jlc2VuZFBlbmRpbmdSZXF1ZXN0cyhvcmlnaW5hbFJlc291cmNlLCBtb2RpZmllZFJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBjaGF0IGVkaXRvciBpcyBpbiB0aGUgc2lkZSBwYW5lbCwgdGhlbiB0aG9zZSBhcmUgbm90IGxpc3RlZCBhcyBlZGl0b3JzLlxuXHRcdFx0Ly8gSW4gdGhhdCBjYXNlIHdlIG5lZWQgdG8gdHJhbnNmZXIgZWRpdGluZyBzZXNzaW9uIHVzaW5nIHRoZSBvcmlnaW5hbCBtb2RlbC5cblx0XHRcdGlmIChvcmlnaW5hbE1vZGVsKSB7XG5cdFx0XHRcdG5ld1Nlc3Npb24udHJhbnNmZXJyZWRTdGF0ZSA9IHtcblx0XHRcdFx0XHRlZGl0aW5nU2Vzc2lvbjogb3JpZ2luYWxNb2RlbC5vYmplY3QuZWRpdGluZ1Nlc3Npb24sXG5cdFx0XHRcdFx0aW5wdXRTdGF0ZTogb3JpZ2luYWxNb2RlbC5vYmplY3QuaW5wdXRNb2RlbC50b0pTT04oKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGF0Vmlld1dpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGNoYXRWaWV3V2lkZ2V0ICYmIGlzSUNoYXRWaWV3Vmlld0NvbnRleHQoY2hhdFZpZXdXaWRnZXQudmlld0NvbnRleHQpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKG1vZGlmaWVkUmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIGlmICghY2hhdFZpZXdXaWRnZXQpIHtcblx0XHRcdFx0Ly8gTm8gd2lkZ2V0IGN1cnJlbnRseSBzaG93cyB0aGUgb3JpZ2luYWwgc2Vzc2lvbiBcdTIwMTQgZWFnZXJseSBsb2FkIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9uIHNvIHRoZSB0cmFuc2ZlcnJlZCBzdGF0ZSBzZXQgYWJvdmUgaXMgbWF0ZXJpYWxpemVkIGludG8gYVxuXHRcdFx0XHQvLyBjaGF0IG1vZGVsLiBXZSBpbW1lZGlhdGVseSByZWxlYXNlIHRoZSByZWZlcmVuY2U7IGlmIGEgY29uc3VtZXJcblx0XHRcdFx0Ly8gbGF0ZXIgYWNxdWlyZXMgdGhlIHNlc3Npb24sIHRoZSBtb2RlbCB3aWxsIGJlIHJlLWNyZWF0ZWQuXG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKG1vZGlmaWVkUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRyZWY/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gYSBjaGF0IHdpZGdldCBleGlzdHMgZm9yIGBvcmlnaW5hbFJlc291cmNlYCBidXQgaXMgbm90IGFuXG5cdFx0XHQvLyBgSUNoYXRWaWV3Vmlld0NvbnRleHRgIChlLmcuIHRoZSBBZ2VudHMgV2luZG93J3Mgc2Vzc2lvbi12aWV3IGNoYXRcblx0XHRcdC8vIHdpZGdldCksIHRoYXQgd2lkZ2V0IG93bnMgdGhlIHJlYmluZCB0byBgbW9kaWZpZWRSZXNvdXJjZWAgdmlhIGl0c1xuXHRcdFx0Ly8gb3duIG9ic2VydmVyLWRyaXZlbiBtZWNoYW5pc20uIEVhZ2VybHkgbG9hZCtkaXNwb3NlIGhlcmUgd291bGRcblx0XHRcdC8vIGRyb3AgdGhlIGNoYXQgbW9kZWwgcmVmY291bnQgdG8gMCBiZXR3ZWVuIHRoaXMgZGlzcG9zZSBhbmQgdGhlXG5cdFx0XHQvLyB3aWRnZXQncyBhc3luYyByZS1hY3F1aXJlLCB0ZWFyaW5nIGRvd24gdGhlIGV4dC1ob3N0XG5cdFx0XHQvLyBgQ29waWxvdENMSVNlc3Npb25gIChhbmQgaXRzIFNESyBzZXNzaW9uKSBcdTIwMTQgd2hpY2ggYWJvcnRzIGFueVxuXHRcdFx0Ly8gaW4tZmxpZ2h0IHJlcXVlc3Qgb24gdGhhdCBzZXNzaW9uLlxuXG5cdFx0XHQvLyBSZS1zZW5kIHF1ZXVlZCByZXF1ZXN0cyBmcm9tIHRoZSBvcmlnaW5hbCBzZXNzaW9uIG9uIHRoZSBjb21taXR0ZWQgc2Vzc2lvblxuXHRcdFx0dGhpcy5fcmVzZW5kUGVuZGluZ1JlcXVlc3RzKG9yaWdpbmFsUmVzb3VyY2UsIG1vZGlmaWVkUmVzb3VyY2UpO1xuXG5cdFx0XHQvLyBOb3RpZnkgbGlzdGVuZXJzIHRoYXQgdGhlIHNlc3Npb24gaGFzIGJlZW4gY29tbWl0dGVkXG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmZpcmVTZXNzaW9uQ29tbWl0dGVkKG9yaWdpbmFsUmVzb3VyY2UsIG1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRvcmlnaW5hbE1vZGVsPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXNlbmRzIHBlbmRpbmcgYW5kIGluLWZsaWdodCByZXF1ZXN0cyBmcm9tIHRoZSBvcmlnaW5hbCBzZXNzaW9uIG9uIHRoZSBjb21taXR0ZWQgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX3Jlc2VuZFBlbmRpbmdSZXF1ZXN0cyhvcmlnaW5hbFJlc291cmNlOiBVUkksIG1vZGlmaWVkUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTZXJ2aWNlLm1pZ3JhdGVSZXF1ZXN0cyhvcmlnaW5hbFJlc291cmNlLCBtb2RpZmllZFJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Byb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQocHJvdmlkZXJIYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uPiB7XG5cdFx0Y29uc3QgdDAgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtNYWluVGhyZWFkQ2hhdFNlc3Npb25zXSBfcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCBzdGFydCBoYW5kbGU9JHtwcm92aWRlckhhbmRsZX0gdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cblx0XHRsZXQgc2Vzc2lvbiA9IHRoaXMuX2FjdGl2ZVNlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uID0gbmV3IE9ic2VydmFibGVDaGF0U2Vzc2lvbihcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRwcm92aWRlckhhbmRsZSxcblx0XHRcdFx0dGhpcy5fcHJveHksXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX2RpYWxvZ1NlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBzZXNzaW9uLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmdldChzZXNzaW9uUmVzb3VyY2UpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLnNldChzZXNzaW9uUmVzb3VyY2UsIGRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMgPSB0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb25zKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBzZXNzaW9uLmluaXRpYWxpemUodG9rZW4sIHtcblx0XHRcdFx0aW5pdGlhbFNlc3Npb25PcHRpb25zOiBpbml0aWFsU2Vzc2lvbk9wdGlvbnMgPyBbLi4uaW5pdGlhbFNlc3Npb25PcHRpb25zXS5tYXAoKFtvcHRpb25JZCwgdmFsdWVdKSA9PiAoeyBvcHRpb25JZCwgdmFsdWU6IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHZhbHVlPy5pZCB9KSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChzZXNzaW9uLm9wdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBbXywgaGFuZGxlXSBvZiB0aGlzLl9zZXNzaW9uVHlwZVRvSGFuZGxlKSB7XG5cdFx0XHRcdFx0aWYgKGhhbmRsZSA9PT0gcHJvdmlkZXJIYW5kbGUpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgW29wdGlvbklkLCB2YWx1ZV0gb2Ygc2Vzc2lvbi5vcHRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbklkLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtNYWluVGhyZWFkQ2hhdFNlc3Npb25zXSBfcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudCBkb25lIHRvdGFsPSR7RGF0ZS5ub3coKSAtIHQwfW1zIGhhbmRsZT0ke3Byb3ZpZGVySGFuZGxlfSB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHByb3ZpZGluZyBjaGF0IHNlc3Npb24gY29udGVudCBmb3IgaGFuZGxlICR7cHJvdmlkZXJIYW5kbGV9IGFuZCByZXNvdXJjZSAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfTpgLCBlcnJvcik7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9pdGVtQ29udHJvbGxlclJlZ2lzdHJhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHR9XG5cblx0JHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGNoYXRTZXNzaW9uU2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogKHJlc291cmNlLCB0b2tlbikgPT4gdGhpcy5fcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChoYW5kbGUsIHJlc291cmNlLCB0b2tlbilcblx0XHR9O1xuXG5cdFx0dGhpcy5fc2Vzc2lvblR5cGVUb0hhbmRsZS5zZXQoY2hhdFNlc3Npb25TY2hlbWUsIGhhbmRsZSk7XG5cdFx0dGhpcy5fY29udGVudFByb3ZpZGVyc1JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGNoYXRTZXNzaW9uU2NoZW1lLCBwcm92aWRlcikpO1xuXHRcdHRoaXMuX3JlZnJlc2hQcm92aWRlck9wdGlvbnMoaGFuZGxlLCBjaGF0U2Vzc2lvblNjaGVtZSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudFByb3ZpZGVyc1JlZ2lzdHJhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25UeXBlLCBoXSBvZiB0aGlzLl9zZXNzaW9uVHlwZVRvSGFuZGxlKSB7XG5cdFx0XHRpZiAoaCA9PT0gaGFuZGxlKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25UeXBlVG9IYW5kbGUuZGVsZXRlKHNlc3Npb25UeXBlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZGlzcG9zZSBhbGwgc2Vzc2lvbnMgZnJvbSB0aGlzIHByb3ZpZGVyIGFuZCBjbGVhbiB1cCBpdHMgZGlzcG9zYWJsZXNcblx0XHRmb3IgKGNvbnN0IFtrZXksIHNlc3Npb25dIG9mIHRoaXMuX2FjdGl2ZVNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlckhhbmRsZSA9PT0gaGFuZGxlKSB7XG5cdFx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyAkaGFuZGxlUHJvZ3Jlc3NDaHVuayhoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzLCByZXF1ZXN0SWQ6IHN0cmluZywgY2h1bmtzOiAoSUNoYXRQcm9ncmVzc0R0byB8IFtJQ2hhdFByb2dyZXNzRHRvLCBudW1iZXJdKVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb2JzZXJ2YWJsZVNlc3Npb24gPSB0aGlzLl9hY3RpdmVTZXNzaW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghb2JzZXJ2YWJsZVNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gc2Vzc2lvbiBmb3VuZCBmb3IgcHJvZ3Jlc3MgY2h1bmtzOiBoYW5kbGUgJHtoYW5kbGV9LCBzZXNzaW9uUmVzb3VyY2UgJHtyZXNvdXJjZX0sIHJlcXVlc3RJZCAke3JlcXVlc3RJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0UHJvZ3Jlc3NQYXJ0czogSUNoYXRQcm9ncmVzc1tdID0gY2h1bmtzLm1hcChjaHVuayA9PiB7XG5cdFx0XHRjb25zdCBbcHJvZ3Jlc3NdID0gQXJyYXkuaXNBcnJheShjaHVuaykgPyBjaHVuayA6IFtjaHVua107XG5cdFx0XHRyZXR1cm4gcmV2aXZlKHByb2dyZXNzKSBhcyBJQ2hhdFByb2dyZXNzO1xuXHRcdH0pO1xuXG5cdFx0b2JzZXJ2YWJsZVNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDaHVuayhyZXF1ZXN0SWQsIGNoYXRQcm9ncmVzc1BhcnRzKTtcblx0fVxuXG5cdCRoYW5kbGVQcm9ncmVzc0NvbXBsZXRlKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJlcXVlc3RJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb2JzZXJ2YWJsZVNlc3Npb24gPSB0aGlzLl9hY3RpdmVTZXNzaW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghb2JzZXJ2YWJsZVNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gc2Vzc2lvbiBmb3VuZCBmb3IgcHJvZ3Jlc3MgY29tcGxldGlvbjogaGFuZGxlICR7aGFuZGxlfSwgc2Vzc2lvblJlc291cmNlICR7cmVzb3VyY2V9LCByZXF1ZXN0SWQgJHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b2JzZXJ2YWJsZVNlc3Npb24uaGFuZGxlUHJvZ3Jlc3NDb21wbGV0ZShyZXF1ZXN0SWQpO1xuXHR9XG5cblx0JGhhbmRsZUFuY2hvclJlc29sdmUoaGFuZGxlOiBudW1iZXIsIHNlc3NzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJlcXVlc3RJZDogc3RyaW5nLCByZXF1ZXN0SGFuZGxlOiBzdHJpbmcsIGFuY2hvcjogRHRvPElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZT4pOiB2b2lkIHtcblx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyhoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBzZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgW3R5cGUsIGhdIG9mIHRoaXMuX3Nlc3Npb25UeXBlVG9IYW5kbGUpIHtcblx0XHRcdGlmIChoID09PSBoYW5kbGUpIHtcblx0XHRcdFx0c2Vzc2lvblR5cGUgPSB0eXBlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIHNlc3Npb24gdHlwZSBmb3VuZCBmb3IgY2hhdCBzZXNzaW9uIGNvbnRlbnQgcHJvdmlkZXIgaGFuZGxlICR7aGFuZGxlfSB3aGVuIHJlZnJlc2hpbmcgcHJvdmlkZXIgb3B0aW9uc2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZnJlc2hQcm92aWRlck9wdGlvbnMoaGFuZGxlLCBzZXNzaW9uVHlwZSk7XG5cdH1cblxuXHQkdXBkYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlKGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzLCBvcHRpb25Hcm91cHM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHRoaXMuX2l0ZW1Db250cm9sbGVyUmVnaXN0cmF0aW9ucy5nZXQoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0aWYgKCFyZWdpc3RyYXRpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gY29udHJvbGxlciBmb3VuZCBmb3IgaGFuZGxlICR7Y29udHJvbGxlckhhbmRsZX0gd2hlbiB1cGRhdGluZyBpbnB1dCBzdGF0ZWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FwcGx5T3B0aW9uR3JvdXBzKGNvbnRyb2xsZXJIYW5kbGUsIHJlZ2lzdHJhdGlvbi5jaGF0U2Vzc2lvblR5cGUsIHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXBzKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hQcm92aWRlck9wdGlvbnMoaGFuZGxlOiBudW1iZXIsIGNoYXRTZXNzaW9uU2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKGhhbmRsZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihvcHRpb25zID0+IHtcblx0XHRcdGlmIChvcHRpb25zPy5vcHRpb25Hcm91cHMgJiYgb3B0aW9ucy5vcHRpb25Hcm91cHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25TY2hlbWUsIGhhbmRsZSwgWy4uLm9wdGlvbnMub3B0aW9uR3JvdXBzXSk7XG5cdFx0XHR9XG5cdFx0fSkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIGNoYXQgc2Vzc2lvbiBvcHRpb25zJywgZXJyKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9hY3RpdmVTZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmNsZWFyKCk7XG5cblx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgdGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLnZhbHVlcygpKSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXG5cblx0LyoqXG5cdCAqIE5vdGlmeSB0aGUgZXh0ZW5zaW9uIGFib3V0IG9wdGlvbiBjaGFuZ2VzIGZvciBhIHNlc3Npb25cblx0ICovXG5cdGFzeW5jIG5vdGlmeU9wdGlvbnNDaGFuZ2UoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVVJJLCB1cGRhdGVzOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTWFpblRocmVhZENoYXRTZXNzaW9uc10gbm90aWZ5T3B0aW9uc0NoYW5nZTogc3RhcnRpbmcgcHJveHkgY2FsbCBmb3IgaGFuZGxlICR7aGFuZGxlfSwgc2Vzc2lvblJlc291cmNlICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UoaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsIE9iamVjdC5mcm9tRW50cmllcyh1cGRhdGVzKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbTWFpblRocmVhZENoYXRTZXNzaW9uc10gbm90aWZ5T3B0aW9uc0NoYW5nZTogcHJveHkgY2FsbCBjb21wbGV0ZWQgZm9yIGhhbmRsZSAke2hhbmRsZX0sIHNlc3Npb25SZXNvdXJjZSAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW01haW5UaHJlYWRDaGF0U2Vzc2lvbnNdIG5vdGlmeU9wdGlvbnNDaGFuZ2U6IGVycm9yIGZvciBoYW5kbGUgJHtoYW5kbGV9LCBzZXNzaW9uUmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2V9OmAsIGVycm9yKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcmV2aXZlTWFya2Rvd25TdHJpbmcodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2YWx1ZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBJZiBpdCdzIGFscmVhZHkgYSBzdHJpbmcsIHJldHVybiBhcy1pc1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdC8vIElmIGl0J3MgYSBzZXJpYWxpemVkIElNYXJrZG93blN0cmluZywgcmV2aXZlIGl0IHRvIE1hcmtkb3duU3RyaW5nXG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICd2YWx1ZScgaW4gdmFsdWUpIHtcblx0XHRyZXR1cm4gTWFya2Rvd25TdHJpbmcubGlmdCh2YWx1ZSk7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBMEIsZ0JBQWdCLDJCQUEyQjtBQUNyRSxTQUFTLFlBQVksZUFBZSx1QkFBdUIsdUJBQW9DO0FBQy9GLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFzQiwyQkFBMkIsdUJBQXVCO0FBQ2pGLFNBQVMsZUFBZTtBQUV4QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW1DO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CLDhCQUE4QjtBQUMzRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFrRSxvQkFBd0M7QUFDMUcsU0FBUyx1QkFBNlMsNEJBQTJEO0FBQ2pYLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTZDO0FBRXRELFNBQWlFLGdCQUEwSCxtQkFBZ0Q7QUFFM08sU0FBUyxzQkFBc0IsR0FBeUMsR0FBa0Q7QUFDekgsTUFBSSxNQUFNLEdBQUc7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksQ0FBQyxLQUFLLENBQUMsR0FBRztBQUNiLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVTtBQUNuRCxXQUFPO0FBQUEsRUFD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
