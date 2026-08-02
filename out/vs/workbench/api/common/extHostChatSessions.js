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
import { coalesce } from "../../../base/common/arrays.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import * as objects from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { SymbolKind, SymbolKinds } from "../../../editor/common/languages.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IDiagnosticVariableEntryFilterData, PromptFileVariableKind, toPromptFileVariableEntry } from "../../contrib/chat/common/attachments/chatVariableEntries.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { getChatSessionType, isUntitledChatSession } from "../../contrib/chat/common/model/chatUri.js";
import { MainContext } from "./extHost.protocol.js";
import { ChatAgentResponseStream } from "./extHostChatAgents2.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { Diagnostic } from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { isEqual } from "../../../base/common/resources.js";
class ChatSessionInputStateImpl {
  constructor(groups, onChangedDelegate) {
    this.#onDidChangeEmitter = new Emitter();
    this.onDidChange = this.#onDidChangeEmitter.event;
    this.#onDidDisposeEmitter = new Emitter();
    this.onDidDispose = this.#onDidDisposeEmitter.event;
    this.#groups = groups;
    this.#onChangedDelegate = onChangedDelegate;
  }
  #groups;
  #onChangedDelegate;
  #onDidChangeEmitter;
  #onDidDisposeEmitter;
  #sessionResource;
  get sessionResource() {
    return this.#sessionResource;
  }
  set sessionResource(value) {
    this.#sessionResource = value;
  }
  #untitledSessionResource;
  get untitledSessionResource() {
    return this.#untitledSessionResource;
  }
  set untitledSessionResource(value) {
    this.#untitledSessionResource = value;
  }
  get groups() {
    return this.#groups;
  }
  set groups(value) {
    this.#groups = value;
    this.#onChangedDelegate?.();
  }
  _fireDidChange() {
    this.#onDidChangeEmitter.fire();
  }
  _setGroups(groups) {
    this.#groups = groups;
  }
  _dispose() {
    this.#onDidDisposeEmitter.fire();
    this.#onDidDisposeEmitter.dispose();
    this.#onDidChangeEmitter.dispose();
  }
}
class ChatSessionItemImpl {
  #label;
  #iconPath;
  #description;
  #badge;
  #status;
  #archived;
  #tooltip;
  #timing;
  #changes;
  #metadata;
  #onChanged;
  constructor(resource, label, onChanged) {
    this.resource = resource;
    this.#label = label;
    this.#onChanged = onChanged;
  }
  get label() {
    return this.#label;
  }
  set label(value) {
    if (this.#label !== value) {
      this.#label = value;
      this.#onChanged();
    }
  }
  get iconPath() {
    return this.#iconPath;
  }
  set iconPath(value) {
    if (this.#iconPath !== value) {
      this.#iconPath = value;
      this.#onChanged();
    }
  }
  get description() {
    return this.#description;
  }
  set description(value) {
    if (this.#description !== value) {
      this.#description = value;
      this.#onChanged();
    }
  }
  get badge() {
    return this.#badge;
  }
  set badge(value) {
    if (this.#badge !== value) {
      this.#badge = value;
      this.#onChanged();
    }
  }
  get status() {
    return this.#status;
  }
  set status(value) {
    if (this.#status !== value) {
      this.#status = value;
      this.#onChanged();
    }
  }
  get archived() {
    return this.#archived;
  }
  set archived(value) {
    if (this.#archived !== value) {
      this.#archived = value;
      this.#onChanged();
    }
  }
  get tooltip() {
    return this.#tooltip;
  }
  set tooltip(value) {
    if (this.#tooltip !== value) {
      this.#tooltip = value;
      this.#onChanged();
    }
  }
  get timing() {
    return this.#timing;
  }
  set timing(value) {
    if (this.#timing !== value) {
      this.#timing = value;
      this.#onChanged();
    }
  }
  get changes() {
    return this.#changes;
  }
  set changes(value) {
    if (this.#changes !== value) {
      this.#changes = value;
      this.#onChanged();
    }
  }
  get metadata() {
    return this.#metadata;
  }
  set metadata(value) {
    if (value !== void 0) {
      try {
        JSON.stringify(value);
      } catch {
        throw new Error("metadata must be JSON-serializable");
      }
    }
    if (!objects.equals(this.#metadata, value)) {
      this.#metadata = value;
      this.#onChanged();
    }
  }
}
function computeItemsDelta(oldItems, newItems) {
  const delta = {
    addedOrUpdated: new ResourceMap(),
    removed: new ResourceSet()
  };
  for (const [newResource, newItem] of newItems) {
    const oldItem = oldItems.get(newResource);
    if (oldItem !== newItem) {
      delta.addedOrUpdated.set(newResource, newItem);
    }
  }
  for (const oldResource of oldItems.keys()) {
    if (!newItems.has(oldResource)) {
      delta.removed.add(oldResource);
    }
  }
  return delta;
}
function convertChatSessionDeltaToDto(delta) {
  return {
    addedOrUpdated: delta.addedOrUpdated ? Array.from(delta.addedOrUpdated.values(), typeConvert.ChatSessionItem.from) : [],
    removed: delta.removed ? Array.from(delta.removed.keys()) : []
  };
}
class ChatSessionItemCollectionImpl {
  #items = new ResourceMap();
  #proxy;
  #controllerHandle;
  constructor(controllerHandle, proxy) {
    this.#proxy = proxy;
    this.#controllerHandle = controllerHandle;
  }
  get size() {
    return this.#items.size;
  }
  replace(newItems) {
    if (!newItems.length && !this.#items.size) {
      return;
    }
    const newItemsMap = new ResourceMap(newItems.map((item) => [item.resource, item]));
    const delta = computeItemsDelta(this.#items, newItemsMap);
    if (!delta.addedOrUpdated?.size && !delta.removed?.size) {
      return;
    }
    this.#items = newItemsMap;
    void this.#proxy.$updateChatSessionItems(this.#controllerHandle, convertChatSessionDeltaToDto(delta));
  }
  forEach(callback, thisArg) {
    for (const [_, item] of this.#items) {
      callback.call(thisArg, item, this);
    }
  }
  add(item) {
    const existing = this.#items.get(item.resource);
    if (existing && existing === item) {
      return;
    }
    this.#items.set(item.resource, item);
    void this.#proxy.$addOrUpdateChatSessionItem(this.#controllerHandle, typeConvert.ChatSessionItem.from(item));
  }
  delete(resource) {
    if (this.#items.delete(resource)) {
      void this.#proxy.$updateChatSessionItems(this.#controllerHandle, {
        addedOrUpdated: [],
        removed: [resource]
      });
    }
  }
  get(resource) {
    return this.#items.get(resource);
  }
  [Symbol.iterator]() {
    return this.#items.entries();
  }
}
class ExtHostChatSession {
  constructor(session, extension, request, proxy, commandsConverter, sessionDisposables) {
    this.session = session;
    this.extension = extension;
    this.proxy = proxy;
    this.commandsConverter = commandsConverter;
    this.sessionDisposables = sessionDisposables;
    // Empty map since question carousel is designed for chat agents, not chat sessions
    this._pendingCarouselResolvers = /* @__PURE__ */ new Map();
    this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
  }
  get activeResponseStream() {
    return this._stream;
  }
  getActiveRequestStream(request) {
    return new ChatAgentResponseStream(this.extension, request, this.proxy, this.commandsConverter, this.sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
  }
}
let ExtHostChatSessions = class extends Disposable {
  constructor(commands, _languageModels, _extHostRpc, _logService) {
    super();
    this.commands = commands;
    this._languageModels = _languageModels;
    this._extHostRpc = _extHostRpc;
    this._logService = _logService;
    this._itemControllerHandlePool = 0;
    this._chatSessionItemControllers = /* @__PURE__ */ new Map();
    this._contentProviderHandlePool = 0;
    this._chatSessionContentProviders = /* @__PURE__ */ new Map();
    /**
     * Map of uri -> chat sessions infos
     */
    this._extHostChatSessions = new ResourceMap();
    /**
     * Map of proxy command id -> original command id + controller handle.
     * Used to wrap option group commands so they receive `{ inputState, sessionResource }` instead of just `sessionResource`.
     */
    this._proxyCommands = /* @__PURE__ */ new Map();
    this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);
    commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.AgentSessionContext) {
          const resource = arg.session.resource;
          for (const { controller } of this._chatSessionItemControllers.values()) {
            const item = controller.items.get(resource);
            if (item) {
              return item;
            }
          }
          this._logService.warn(`No chat session found with uri: ${resource}`);
          return arg;
        }
        return arg;
      }
    });
  }
  registerChatSessionItemProvider(extension, chatSessionType, provider) {
    const controllerHandle = this._itemControllerHandlePool++;
    const disposables = new DisposableStore();
    const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
    const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
    const controller = {
      id: chatSessionType,
      items: collection,
      createChatSessionItem: (_resource, _label) => {
        throw new Error("Not implemented for providers");
      },
      createChatSessionInputState: (_options) => {
        return new ChatSessionInputStateImpl([]);
      },
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
      newChatSessionItemHandler: void 0,
      // Bridge the deprecated `ChatSessionItemProvider.resolveChatSessionItem` hook through the
      // new controller surface so both code paths share the same `$resolveChatSessionItem` impl.
      // The legacy provider returns a new item; the bridge adds it to the collection so the
      // controller contract (update via collection, return void) is satisfied.
      resolveChatSessionItem: provider.resolveChatSessionItem ? async (item, token) => {
        const resolved = await provider.resolveChatSessionItem(item, token);
        if (resolved) {
          collection.add(resolved);
        }
      } : void 0,
      dispose: () => {
        disposables.dispose();
      },
      refreshHandler: async (token) => {
        const items = await provider.provideChatSessionItems(token) ?? [];
        collection.replace(items);
      }
    };
    this._chatSessionItemControllers.set(controllerHandle, { chatSessionType, controller, extension, disposable: disposables, onDidChangeChatSessionItemStateEmitter, inputStates: /* @__PURE__ */ new Set() });
    this._proxy.$registerChatSessionItemController(controllerHandle, chatSessionType, !!provider.resolveChatSessionItem);
    if (provider.onDidChangeChatSessionItems) {
      disposables.add(provider.onDidChangeChatSessionItems(() => {
        this._logService.trace(`ExtHostChatSessions. Provider items changed for ${chatSessionType}`);
        controller.refreshHandler(CancellationToken.None);
      }));
    }
    if (provider.onDidCommitChatSessionItem) {
      disposables.add(provider.onDidCommitChatSessionItem((e) => {
        const { original, modified } = e;
        this._proxy.$onDidCommitChatSessionItem(controllerHandle, original.resource, modified.resource);
      }));
    }
    const disposable = {
      dispose: () => {
        this._chatSessionItemControllers.delete(controllerHandle);
        disposables.dispose();
        this._proxy.$unregisterChatSessionItemController(controllerHandle);
      }
    };
    return Object.assign(disposable, {
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event
    });
  }
  createChatSessionItemController(extension, id, refreshHandler) {
    const controllerHandle = this._itemControllerHandlePool++;
    const disposables = new DisposableStore();
    let isDisposed = false;
    let newChatSessionItemHandler;
    let forkHandler;
    let resolveChatSessionItemHandler;
    let provideChatSessionInputStateHandler;
    const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
    const inputStates = /* @__PURE__ */ new Set();
    const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
    const proxy = this._proxy;
    const controller = Object.freeze({
      id,
      refreshHandler: async (refreshToken) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        this._logService.trace(`ExtHostChatSessions. Controller(${id}).refresh()`);
        await refreshHandler(refreshToken);
      },
      items: collection,
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
      createChatSessionItem: (resource, label) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        const item = new ChatSessionItemImpl(resource, label, () => {
          if (collection.get(resource) === item) {
            void this._proxy.$addOrUpdateChatSessionItem(controllerHandle, typeConvert.ChatSessionItem.from(item));
          }
        });
        return item;
      },
      get newChatSessionItemHandler() {
        return newChatSessionItemHandler;
      },
      set newChatSessionItemHandler(handler) {
        newChatSessionItemHandler = handler;
      },
      get forkHandler() {
        return forkHandler;
      },
      set forkHandler(handler) {
        forkHandler = handler;
      },
      get resolveChatSessionItem() {
        return resolveChatSessionItemHandler;
      },
      set resolveChatSessionItem(handler) {
        const hadHandler = !!resolveChatSessionItemHandler;
        resolveChatSessionItemHandler = handler;
        const hasHandler = !!handler;
        if (hadHandler !== hasHandler && !isDisposed) {
          proxy.$updateChatSessionItemControllerCapabilities(controllerHandle, hasHandler);
        }
      },
      get getChatSessionInputState() {
        return provideChatSessionInputStateHandler;
      },
      set getChatSessionInputState(handler) {
        provideChatSessionInputStateHandler = handler;
      },
      createChatSessionInputState: (groups) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        const inputState = new ChatSessionInputStateImpl(groups, () => {
          const entry = this._chatSessionItemControllers.get(controllerHandle);
          if (entry) {
            entry.optionGroups = inputState.groups;
          }
          const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);
          const serializableGroups = wrappedGroups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            items: g.items,
            selected: g.selected,
            when: g.when,
            icon: g.icon,
            commands: g.commands,
            kind: g.kind
          }));
          const resource = inputState.sessionResource ?? inputState.untitledSessionResource;
          if (resource) {
            void this._proxy.$updateChatSessionInputState(controllerHandle, resource, serializableGroups);
          }
        });
        inputStates.add(inputState);
        return inputState;
      },
      dispose: () => {
        isDisposed = true;
        for (const inputState of inputStates) {
          inputState._dispose();
        }
        inputStates.clear();
        disposables.dispose();
      }
    });
    this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, chatSessionType: id, onDidChangeChatSessionItemStateEmitter, inputStates });
    this._proxy.$registerChatSessionItemController(controllerHandle, id, !!resolveChatSessionItemHandler);
    disposables.add(toDisposable(() => {
      this._chatSessionItemControllers.delete(controllerHandle);
      this._proxy.$unregisterChatSessionItemController(controllerHandle);
    }));
    return controller;
  }
  registerChatSessionContentProvider(extension, chatSessionScheme, chatParticipant, provider, capabilities) {
    const handle = this._contentProviderHandlePool++;
    const disposables = new DisposableStore();
    this._chatSessionContentProviders.set(handle, { chatSessionScheme, provider, extension, capabilities, disposable: disposables });
    this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);
    if (provider.onDidChangeChatSessionOptions) {
      disposables.add(provider.onDidChangeChatSessionOptions((evt) => {
        const updates = /* @__PURE__ */ Object.create(null);
        for (const update of evt.updates) {
          updates[update.optionId] = update.value;
        }
        this._proxy.$onDidChangeChatSessionOptions(handle, evt.resource, updates);
      }));
    }
    if (provider.onDidChangeChatSessionProviderOptions) {
      disposables.add(provider.onDidChangeChatSessionProviderOptions(() => {
        this._proxy.$onDidChangeChatSessionProviderOptions(handle);
      }));
    }
    return new extHostTypes.Disposable(() => {
      this._chatSessionContentProviders.delete(handle);
      disposables.dispose();
      this._proxy.$unregisterChatSessionContentProvider(handle);
    });
  }
  async $provideChatSessionContent(handle, sessionResourceComponents, context, token) {
    const provider = this._chatSessionContentProviders.get(handle);
    if (!provider) {
      throw new Error(`No provider for handle ${handle}`);
    }
    const sessionResource = URI.revive(sessionResourceComponents);
    const controllerData = this.getChatSessionItemController(getChatSessionType(sessionResource));
    let inputState;
    if (controllerData?.controller.getChatSessionInputState) {
      const result = await controllerData.controller.getChatSessionInputState(isUntitledChatSession(sessionResource) ? void 0 : sessionResource, {
        previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], context.initialSessionOptions)
      }, token);
      if (result) {
        inputState = result;
      }
    }
    inputState ??= this._createInputStateFromOptions(
      controllerData?.optionGroups ?? [],
      context.initialSessionOptions
    );
    if (inputState instanceof ChatSessionInputStateImpl) {
      if (controllerData) {
        this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
      }
      if (isUntitledChatSession(sessionResource)) {
        inputState.untitledSessionResource = sessionResource;
      } else {
        inputState.sessionResource = sessionResource;
      }
    }
    const session = await provider.provider.provideChatSessionContent(sessionResource, token, {
      inputState
    });
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    const sessionDisposables = new DisposableStore();
    const id = sessionResource.toString();
    const chatSession = new ExtHostChatSession(session, provider.extension, {
      sessionResource,
      requestId: "ongoing",
      agentId: id,
      message: "",
      variables: { variables: [] },
      location: ChatAgentLocation.Chat
    }, {
      $handleProgressChunk: (requestId, chunks) => {
        return this._proxy.$handleProgressChunk(handle, sessionResource, requestId, chunks);
      },
      $handleAnchorResolve: (requestId, requestHandle, anchor) => {
        this._proxy.$handleAnchorResolve(handle, sessionResource, requestId, requestHandle, anchor);
      }
    }, this.commands.converter, sessionDisposables);
    const disposeCts = sessionDisposables.add(new CancellationTokenSource());
    this._extHostChatSessions.set(sessionResource, { sessionObj: chatSession, disposeCts });
    if (session.activeResponseCallback) {
      Promise.resolve(session.activeResponseCallback(chatSession.activeResponseStream.apiObject, disposeCts.token)).finally(() => {
        this._proxy.$handleProgressComplete(handle, sessionResource, "ongoing");
      });
    }
    const { capabilities } = provider;
    return {
      resource: URI.revive(sessionResource),
      title: session.title,
      hasActiveResponseCallback: !!session.activeResponseCallback,
      hasRequestHandler: !!session.requestHandler,
      hasForkHandler: !!controllerData?.controller.forkHandler || !!session.forkHandler,
      supportsInterruption: !!capabilities?.supportsInterruptions,
      options: session.options,
      history: session.history.map((turn) => {
        if (turn instanceof extHostTypes.ChatRequestTurn) {
          return this.convertRequestTurn(turn);
        } else {
          return this.convertResponseTurn(turn, sessionDisposables);
        }
      })
    };
  }
  async $provideHandleOptionsChange(handle, sessionResourceComponents, updates, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const provider = this._chatSessionContentProviders.get(handle);
    if (!provider) {
      this._logService.warn(`No provider for handle ${handle}`);
      return;
    }
    if (provider.provider.provideHandleOptionsChange) {
      try {
        const updatesToSend = Object.entries(updates).map(([optionId, value]) => ({
          optionId,
          value: value === void 0 ? void 0 : typeof value === "string" ? value : value.id
        }));
        provider.provider.provideHandleOptionsChange(sessionResource, updatesToSend, token);
      } catch (error) {
        this._logService.error(`Error calling provideHandleOptionsChange for handle ${handle}, sessionResource ${sessionResource}:`, error);
      }
      return;
    }
    const sessionType = getChatSessionType(sessionResource);
    const controllerData = this.getChatSessionItemController(sessionType);
    if (!controllerData || !controllerData.controller.getChatSessionInputState) {
      this._logService.warn(`No valid controller found for session type ${sessionType}`);
      return;
    }
    for (const inputState of controllerData?.inputStates ?? []) {
      const updatedGroups = inputState.groups.map((group) => {
        const update = updates[group.id];
        if (!update) {
          return group;
        }
        const selectedId = typeof update === "string" ? update : update.id;
        const selectedItem = group.items.find((item) => item.id === selectedId);
        if (!selectedItem) {
          return group;
        }
        return { ...group, selected: selectedItem };
      });
      inputState._setGroups(updatedGroups);
      inputState._fireDidChange();
    }
  }
  async $provideChatSessionProviderOptions(handle, token) {
    const entry = this._chatSessionContentProviders.get(handle);
    if (!entry) {
      this._logService.warn(`No provider for handle ${handle} when requesting chat session options`);
      return;
    }
    const provider = entry.provider;
    if (!provider.provideChatSessionProviderOptions) {
      return;
    }
    try {
      const result = await provider.provideChatSessionProviderOptions(token);
      if (!result) {
        return;
      }
      const { optionGroups, newSessionOptions } = result;
      if (optionGroups) {
        const controllerData = this.getChatSessionItemController(entry.chatSessionScheme);
        if (controllerData) {
          controllerData.optionGroups = optionGroups;
        }
      }
      return {
        optionGroups,
        newSessionOptions
      };
    } catch (error) {
      this._logService.error(`Error calling provideChatSessionProviderOptions for handle ${handle}:`, error);
      return;
    }
  }
  async $interruptChatSessionActiveResponse(providerHandle, sessionResource, requestId) {
    const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
    entry?.disposeCts.cancel();
  }
  async $disposeChatSessionContent(providerHandle, sessionResource) {
    const resource = URI.revive(sessionResource);
    const entry = this._extHostChatSessions.get(resource);
    if (!entry) {
      this._logService.warn(`No chat session found for resource: ${sessionResource}`);
      return;
    }
    const controllerData = this.getChatSessionItemController(resource.scheme);
    if (controllerData) {
      this._disposeInputStatesForResource(controllerData.inputStates, resource);
    }
    entry.disposeCts.cancel();
    entry.sessionObj.sessionDisposables.dispose();
    this._extHostChatSessions.delete(resource);
  }
  async $invokeChatSessionRequestHandler(handle, sessionResource, request, history, token) {
    const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
    if (!entry || !entry.sessionObj.session.requestHandler) {
      return {};
    }
    const chatRequest = typeConvert.ChatAgentRequest.to(request, void 0, await this.getModelForRequest(request, entry.sessionObj.extension), request.modelConfiguration, [], /* @__PURE__ */ new Map(), entry.sessionObj.extension, this._logService);
    const stream = entry.sessionObj.getActiveRequestStream(request);
    await entry.sessionObj.session.requestHandler(chatRequest, { history, yieldRequested: false }, stream.apiObject, token);
    return {};
  }
  async $forkChatSession(handle, sessionResourceComponents, request, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const entry = this._extHostChatSessions.get(sessionResource);
    if (!entry) {
      throw new Error(`No chat session found for resource ${sessionResource.toString()}`);
    }
    const requestTurn = this.convertRequestDtoToRequestTurn(request);
    const controllerData = this.getChatSessionItemController(getChatSessionType(sessionResource));
    if (controllerData?.controller.forkHandler) {
      const item2 = await controllerData.controller.forkHandler(sessionResource, requestTurn, token);
      return typeConvert.ChatSessionItem.from(item2);
    }
    if (!entry.sessionObj.session.forkHandler) {
      throw new Error(`No fork handler for session ${sessionResource.toString()}`);
    }
    const item = await entry.sessionObj.session.forkHandler(sessionResource, requestTurn, token);
    return typeConvert.ChatSessionItem.from(item);
  }
  convertRequestDtoToRequestTurn(request) {
    if (!request) {
      return void 0;
    }
    return new extHostTypes.ChatRequestTurn(
      request.prompt,
      request.command,
      [],
      request.participant,
      [],
      void 0,
      request.id,
      request.modelId,
      typeConvert.ChatRequestModeInstructions.to(request.modeInstructions)
    );
  }
  getChatSessionItemController(chatSessionType) {
    for (const controllerData of this._chatSessionItemControllers.values()) {
      if (controllerData.chatSessionType === chatSessionType) {
        return controllerData;
      }
    }
    return void 0;
  }
  _disposeInputStatesForResource(inputStates, resource) {
    for (const inputState of inputStates) {
      const inputResource = inputState.sessionResource ?? inputState.untitledSessionResource;
      if (inputResource && isEqual(resource, inputResource)) {
        inputState._dispose();
        inputStates.delete(inputState);
      }
    }
  }
  _createInputStateFromOptions(groups, sessionOptions) {
    if (!sessionOptions?.length) {
      return new ChatSessionInputStateImpl(groups);
    }
    const resolvedGroups = groups.map((group) => {
      const match = sessionOptions.find((o) => o.optionId === group.id);
      if (!match) {
        return group;
      }
      const selectedItem = group.items.find((item) => item.id === match.value);
      if (!selectedItem) {
        return group;
      }
      return { ...group, selected: selectedItem };
    });
    return new ChatSessionInputStateImpl(resolvedGroups);
  }
  /**
   * Gets the input state for a session. This calls the controller's `getChatSessionInputState` handler if available,
   * otherwise falls back to creating an input state from the session options.
   */
  async getInputStateForSession(sessionResource, initialSessionOptions, token) {
    const sessionType = sessionResource ? getChatSessionType(sessionResource) : void 0;
    const controllerData = sessionType ? this.getChatSessionItemController(sessionType) : void 0;
    const resolvedResource = sessionResource && !isUntitledChatSession(sessionResource) ? sessionResource : void 0;
    if (controllerData?.controller.getChatSessionInputState) {
      const result = await controllerData.controller.getChatSessionInputState(
        resolvedResource,
        { previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], initialSessionOptions) },
        token
      );
      if (result) {
        if (result instanceof ChatSessionInputStateImpl) {
          if (sessionResource && controllerData) {
            this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
          }
          if (sessionResource && isUntitledChatSession(sessionResource)) {
            result.untitledSessionResource = sessionResource;
          } else if (sessionResource) {
            result.sessionResource = resolvedResource;
          }
        }
        return result;
      }
    }
    const fallback = this._createInputStateFromOptions(controllerData?.optionGroups ?? [], initialSessionOptions);
    fallback.sessionResource = resolvedResource;
    return fallback;
  }
  /**
   * Wraps option group commands with proxy commands so that extensions using the new
   * `getChatSessionInputState` API receive `{ inputState, sessionResource }` instead of just `sessionResource`.
   *
   * For controllers that do not implement the new API, commands are returned unchanged.
   */
  _wrapOptionGroupCommands(controllerHandle, groups) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData?.controller.getChatSessionInputState) {
      return groups;
    }
    return groups.map((group) => {
      if (!group.commands?.length) {
        return group;
      }
      return {
        ...group,
        commands: group.commands.map((command) => {
          const proxyId = `_chatSession.proxyCommand.${generateUuid()}`;
          this._proxyCommands.set(proxyId, { originalCommandId: command.command, controllerHandle });
          this.commands.registerCommand(true, proxyId, async (...args) => {
            const sessionResource = args[0] instanceof URI ? args[0] : void 0;
            const inputState = await this.getInputStateForSession(
              sessionResource,
              void 0,
              CancellationToken.None
            );
            return this.commands.executeCommand(
              command.command,
              { inputState, sessionResource },
              ...command.arguments ?? []
            );
          });
          return { ...command, command: proxyId };
        })
      };
    });
  }
  async getModelForRequest(request, extension) {
    let model;
    if (request.userSelectedModelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  convertRequestTurn(turn) {
    const variables = turn.references.map((ref) => this.convertReferenceToVariable(ref));
    return {
      type: "request",
      id: turn.id,
      prompt: turn.prompt,
      participant: turn.participant,
      command: turn.command,
      variableData: variables.length > 0 ? { variables } : void 0,
      modelId: turn.modelId,
      modeInstructions: typeConvert.ChatRequestModeInstructions.from(turn.modeInstructions2)
    };
  }
  convertReferenceToVariable(ref) {
    const value = ref.value && typeof ref.value === "object" && "uri" in ref.value && "range" in ref.value ? typeConvert.Location.from(ref.value) : ref.value;
    const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : void 0;
    if (value && value instanceof extHostTypes.ChatReferenceDiagnostic && Array.isArray(value.diagnostics) && value.diagnostics.length && value.diagnostics[0][1].length) {
      const marker = Diagnostic.from(value.diagnostics[0][1][0]);
      const refValue = {
        filterRange: { startLineNumber: marker.startLineNumber, startColumn: marker.startColumn, endLineNumber: marker.endLineNumber, endColumn: marker.endColumn },
        filterSeverity: marker.severity,
        filterUri: value.diagnostics[0][0],
        problemMessage: value.diagnostics[0][1][0].message
      };
      return IDiagnosticVariableEntryFilterData.toEntry(refValue);
    }
    if (extHostTypes.Location.isLocation(ref.value) && ref.name.startsWith(`sym:`)) {
      const loc = typeConvert.Location.from(ref.value);
      return {
        id: ref.id,
        name: ref.name,
        fullName: ref.name.substring(4),
        value: { uri: ref.value.uri, range: loc.range },
        // We never send this information to extensions, so default to Property
        symbolKind: SymbolKind.Property,
        // We never send this information to extensions, so default to Property
        icon: SymbolKinds.toIcon(SymbolKind.Property),
        kind: "symbol",
        range
      };
    }
    if (URI.isUri(value) && ref.name.startsWith(`prompt:`)) {
      if (ref.id.startsWith(PromptFileVariableKind.Instruction)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.Instruction);
      }
      if (ref.id.startsWith(PromptFileVariableKind.InstructionReference)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.InstructionReference);
      }
      if (ref.id.startsWith(PromptFileVariableKind.PromptFile)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.PromptFile);
      }
    }
    const isFile = URI.isUri(value) || value && typeof value === "object" && "uri" in value;
    const isFolder = isFile && URI.isUri(value) && value.path.endsWith("/");
    return {
      id: ref.id,
      name: ref.name,
      value,
      modelDescription: ref.modelDescription,
      range,
      kind: isFolder ? "directory" : isFile ? "file" : "generic"
    };
  }
  convertResponseTurn(turn, sessionDisposables) {
    const parts = coalesce(turn.response.map((r) => typeConvert.ChatResponsePart.from(r, this.commands.converter, sessionDisposables)));
    return {
      type: "response",
      parts,
      participant: turn.participant,
      details: turn.result?.details
    };
  }
  async $refreshChatSessionItems(handle, token) {
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${handle}`);
      return;
    }
    await controllerData.controller.refreshHandler(token);
  }
  async $newChatSessionItem(handle, request, token) {
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${handle}`);
      return void 0;
    }
    const handler = controllerData.controller.newChatSessionItemHandler;
    if (!handler) {
      return void 0;
    }
    const previousInputState = this._createInputStateFromOptions(controllerData.optionGroups ?? [], request.initialSessionOptions);
    let inputState;
    if (controllerData.controller.getChatSessionInputState) {
      inputState = await controllerData.controller.getChatSessionInputState(void 0, { previousInputState }, token);
    } else {
      inputState = previousInputState;
    }
    const item = await handler({
      request: {
        prompt: request.prompt,
        command: request.command
      },
      inputState
    }, token);
    if (!item) {
      return void 0;
    }
    controllerData.controller.items.add(item);
    return typeConvert.ChatSessionItem.from(item);
  }
  $onDidChangeChatSessionItemState(controllerHandle, sessionResourceComponents, archived) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${controllerHandle}`);
      return;
    }
    const sessionResource = URI.revive(sessionResourceComponents);
    const item = controllerData.controller.items.get(sessionResource);
    if (!item) {
      this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
      return;
    }
    item.archived = archived;
    controllerData.onDidChangeChatSessionItemStateEmitter.fire(item);
  }
  async $resolveChatSessionItem(handle, sessionResourceComponents, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData?.controller.resolveChatSessionItem) {
      return void 0;
    }
    const item = controllerData.controller.items.get(sessionResource);
    if (!item) {
      this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
      return void 0;
    }
    await controllerData.controller.resolveChatSessionItem(item, token);
    const updatedItem = controllerData.controller.items.get(sessionResource);
    if (!updatedItem) {
      return void 0;
    }
    return typeConvert.ChatSessionItem.from(updatedItem);
  }
  async $provideChatSessionInputState(controllerHandle, sessionResourceComponents, token) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${controllerHandle}`);
      return void 0;
    }
    const handler = controllerData.controller.getChatSessionInputState;
    if (!handler) {
      return void 0;
    }
    const sessionResource = sessionResourceComponents ? URI.revive(sessionResourceComponents) : void 0;
    const inputState = await handler(!sessionResource || isUntitledChatSession(sessionResource) ? void 0 : sessionResource, { previousInputState: void 0 }, token);
    if (!inputState) {
      return void 0;
    }
    if (inputState instanceof ChatSessionInputStateImpl && sessionResource) {
      this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
      if (isUntitledChatSession(sessionResource)) {
        inputState.untitledSessionResource = sessionResource;
      } else {
        inputState.sessionResource = sessionResource;
      }
    }
    controllerData.optionGroups = inputState.groups;
    const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);
    return wrappedGroups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      items: g.items,
      selected: g.selected,
      when: g.when,
      icon: g.icon,
      commands: g.commands,
      kind: g.kind
    }));
  }
};
ExtHostChatSessions = __decorateClass([
  __decorateParam(2, IExtHostRpcService),
  __decorateParam(3, ILogService)
], ExtHostChatSessions);
export {
  ExtHostChatSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0U2Vzc2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFN5bWJvbEtpbmQsIFN5bWJvbEtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEsIElTeW1ib2xWYXJpYWJsZUVudHJ5LCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBQcm94aWVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uQ29udGVudENvbnRleHREdG8sIEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZSwgSUNoYXRBZ2VudFByb2dyZXNzU2hhcGUsIElDaGF0TmV3U2Vzc2lvblJlcXVlc3REdG8sIElDaGF0U2Vzc2lvbkR0bywgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zLCBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW1EdG8sIE1haW5Db250ZXh0LCBNYWluVGhyZWFkQ2hhdFNlc3Npb25zU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0gfSBmcm9tICcuL2V4dEhvc3RDaGF0QWdlbnRzMi5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc0NvbnZlcnRlciwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlTW9kZWxzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydCBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBEaWFnbm9zdGljIH0gZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG50eXBlIENoYXRTZXNzaW9uVGltaW5nID0gdnNjb2RlLkNoYXRTZXNzaW9uSXRlbVsndGltaW5nJ107XG5cbi8vICNyZWdpb24gQ2hhdCBTZXNzaW9uIElucHV0IFN0YXRlXG5cbmNsYXNzIENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGwgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFNlc3Npb25JbnB1dFN0YXRlIHtcblx0I2dyb3VwczogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdO1xuXHRyZWFkb25seSAjb25DaGFuZ2VkRGVsZWdhdGU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSAjb25EaWRDaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLiNvbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cmVhZG9ubHkgI29uRGlkRGlzcG9zZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2UgPSB0aGlzLiNvbkRpZERpc3Bvc2VFbWl0dGVyLmV2ZW50O1xuXG5cdCNzZXNzaW9uUmVzb3VyY2U6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQ7XG5cdGdldCBzZXNzaW9uUmVzb3VyY2UoKTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI3Nlc3Npb25SZXNvdXJjZTtcblx0fVxuXHRzZXQgc2Vzc2lvblJlc291cmNlKHZhbHVlOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy4jc2Vzc2lvblJlc291cmNlID0gdmFsdWU7XG5cdH1cblxuXHQjdW50aXRsZWRTZXNzaW9uUmVzb3VyY2U6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQ7XG5cdGdldCB1bnRpdGxlZFNlc3Npb25SZXNvdXJjZSgpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jdW50aXRsZWRTZXNzaW9uUmVzb3VyY2U7XG5cdH1cblx0c2V0IHVudGl0bGVkU2Vzc2lvblJlc291cmNlKHZhbHVlOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy4jdW50aXRsZWRTZXNzaW9uUmVzb3VyY2UgPSB2YWx1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGdyb3VwczogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdLCBvbkNoYW5nZWREZWxlZ2F0ZT86ICgpID0+IHZvaWQpIHtcblx0XHR0aGlzLiNncm91cHMgPSBncm91cHM7XG5cdFx0dGhpcy4jb25DaGFuZ2VkRGVsZWdhdGUgPSBvbkNoYW5nZWREZWxlZ2F0ZTtcblx0fVxuXG5cdGdldCBncm91cHMoKTogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy4jZ3JvdXBzO1xuXHR9XG5cblx0c2V0IGdyb3Vwcyh2YWx1ZTogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdKSB7XG5cdFx0dGhpcy4jZ3JvdXBzID0gdmFsdWU7XG5cdFx0dGhpcy4jb25DaGFuZ2VkRGVsZWdhdGU/LigpO1xuXHR9XG5cblx0X2ZpcmVEaWRDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy4jb25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdF9zZXRHcm91cHMoZ3JvdXBzOiByZWFkb25seSB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10pOiB2b2lkIHtcblx0XHR0aGlzLiNncm91cHMgPSBncm91cHM7XG5cdH1cblxuXHRfZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLiNvbkRpZERpc3Bvc2VFbWl0dGVyLmZpcmUoKTtcblx0XHR0aGlzLiNvbkRpZERpc3Bvc2VFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLiNvbkRpZENoYW5nZUVtaXR0ZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBDaGF0IFNlc3Npb24gSXRlbSBDb250cm9sbGVyXG5cbmNsYXNzIENoYXRTZXNzaW9uSXRlbUltcGwgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtIHtcblx0I2xhYmVsOiBzdHJpbmc7XG5cdCNpY29uUGF0aD86IHZzY29kZS5JY29uUGF0aDtcblx0I2Rlc2NyaXB0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHQjYmFkZ2U/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdCNzdGF0dXM/OiB2c2NvZGUuQ2hhdFNlc3Npb25TdGF0dXM7XG5cdCNhcmNoaXZlZD86IGJvb2xlYW47XG5cdCN0b29sdGlwPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHQjdGltaW5nPzogQ2hhdFNlc3Npb25UaW1pbmc7XG5cdCNjaGFuZ2VzPzogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uQ2hhbmdlZEZpbGVbXTtcblx0I21ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiB1bmtub3duIH07XG5cdCNvbkNoYW5nZWQ6ICgpID0+IHZvaWQ7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2U6IHZzY29kZS5Vcmk7XG5cblx0Y29uc3RydWN0b3IocmVzb3VyY2U6IHZzY29kZS5VcmksIGxhYmVsOiBzdHJpbmcsIG9uQ2hhbmdlZDogKCkgPT4gdm9pZCkge1xuXHRcdHRoaXMucmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHR0aGlzLiNsYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuI29uQ2hhbmdlZCA9IG9uQ2hhbmdlZDtcblx0fVxuXG5cdGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLiNsYWJlbDtcblx0fVxuXG5cdHNldCBsYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuI2xhYmVsICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jbGFiZWwgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpY29uUGF0aCgpOiB2c2NvZGUuSWNvblBhdGggfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNpY29uUGF0aDtcblx0fVxuXG5cdHNldCBpY29uUGF0aCh2YWx1ZTogdnNjb2RlLkljb25QYXRoIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuI2ljb25QYXRoICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jaWNvblBhdGggPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZXNjcmlwdGlvbjtcblx0fVxuXG5cdHNldCBkZXNjcmlwdGlvbih2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuI2Rlc2NyaXB0aW9uICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jZGVzY3JpcHRpb24gPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBiYWRnZSgpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNiYWRnZTtcblx0fVxuXG5cdHNldCBiYWRnZSh2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuI2JhZGdlICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jYmFkZ2UgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBzdGF0dXMoKTogdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jc3RhdHVzO1xuXHR9XG5cblx0c2V0IHN0YXR1cyh2YWx1ZTogdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuI3N0YXR1cyAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI3N0YXR1cyA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFyY2hpdmVkKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNhcmNoaXZlZDtcblx0fVxuXG5cdHNldCBhcmNoaXZlZCh2YWx1ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNhcmNoaXZlZCAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2FyY2hpdmVkID0gdmFsdWU7XG5cdFx0XHR0aGlzLiNvbkNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgdG9vbHRpcCgpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiN0b29sdGlwO1xuXHR9XG5cblx0c2V0IHRvb2x0aXAodmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiN0b29sdGlwICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jdG9vbHRpcCA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHRpbWluZygpOiBDaGF0U2Vzc2lvblRpbWluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI3RpbWluZztcblx0fVxuXG5cdHNldCB0aW1pbmcodmFsdWU6IENoYXRTZXNzaW9uVGltaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuI3RpbWluZyAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI3RpbWluZyA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNoYW5nZXMoKTogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uQ2hhbmdlZEZpbGVbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI2NoYW5nZXM7XG5cdH1cblxuXHRzZXQgY2hhbmdlcyh2YWx1ZTogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uQ2hhbmdlZEZpbGVbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNjaGFuZ2VzICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy4jY2hhbmdlcyA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG1ldGFkYXRhKCk6IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93biB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jbWV0YWRhdGE7XG5cdH1cblxuXHRzZXQgbWV0YWRhdGEodmFsdWU6IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93biB9IHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ21ldGFkYXRhIG11c3QgYmUgSlNPTi1zZXJpYWxpemFibGUnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFvYmplY3RzLmVxdWFscyh0aGlzLiNtZXRhZGF0YSwgdmFsdWUpKSB7XG5cdFx0XHR0aGlzLiNtZXRhZGF0YSA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBDaGF0U2Vzc2lvbkRlbHRhIHtcblx0cmVhZG9ubHkgYWRkZWRPclVwZGF0ZWQ/OiBSZXNvdXJjZU1hcDx2c2NvZGUuQ2hhdFNlc3Npb25JdGVtPjtcblx0cmVhZG9ubHkgcmVtb3ZlZD86IFJlc291cmNlU2V0O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlSXRlbXNEZWx0YShvbGRJdGVtczogUmVzb3VyY2VNYXA8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT4sIG5ld0l0ZW1zOiBSZXNvdXJjZU1hcDx2c2NvZGUuQ2hhdFNlc3Npb25JdGVtPik6IENoYXRTZXNzaW9uRGVsdGEge1xuXHRjb25zdCBkZWx0YSA9IHtcblx0XHRhZGRlZE9yVXBkYXRlZDogbmV3IFJlc291cmNlTWFwPHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0+KCksXG5cdFx0cmVtb3ZlZDogbmV3IFJlc291cmNlU2V0KCksXG5cdH0gc2F0aXNmaWVzIENoYXRTZXNzaW9uRGVsdGE7XG5cblx0Zm9yIChjb25zdCBbbmV3UmVzb3VyY2UsIG5ld0l0ZW1dIG9mIG5ld0l0ZW1zKSB7XG5cdFx0Y29uc3Qgb2xkSXRlbSA9IG9sZEl0ZW1zLmdldChuZXdSZXNvdXJjZSk7XG5cdFx0aWYgKG9sZEl0ZW0gIT09IG5ld0l0ZW0pIHtcblx0XHRcdGRlbHRhLmFkZGVkT3JVcGRhdGVkLnNldChuZXdSZXNvdXJjZSwgbmV3SXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9yIChjb25zdCBvbGRSZXNvdXJjZSBvZiBvbGRJdGVtcy5rZXlzKCkpIHtcblx0XHRpZiAoIW5ld0l0ZW1zLmhhcyhvbGRSZXNvdXJjZSkpIHtcblx0XHRcdGRlbHRhLnJlbW92ZWQuYWRkKG9sZFJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZGVsdGE7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRDaGF0U2Vzc2lvbkRlbHRhVG9EdG8oZGVsdGE6IENoYXRTZXNzaW9uRGVsdGEpOiB7IGFkZGVkT3JVcGRhdGVkOiBSZXR1cm5UeXBlPHR5cGVvZiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbT5bXTsgcmVtb3ZlZDogVVJJW10gfSB7XG5cdHJldHVybiB7XG5cdFx0YWRkZWRPclVwZGF0ZWQ6IGRlbHRhLmFkZGVkT3JVcGRhdGVkID8gQXJyYXkuZnJvbShkZWx0YS5hZGRlZE9yVXBkYXRlZC52YWx1ZXMoKSwgdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20pIDogW10sXG5cdFx0cmVtb3ZlZDogZGVsdGEucmVtb3ZlZCA/IEFycmF5LmZyb20oZGVsdGEucmVtb3ZlZC5rZXlzKCkpIDogW11cblx0fTtcbn1cblxuY2xhc3MgQ2hhdFNlc3Npb25JdGVtQ29sbGVjdGlvbkltcGwgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29sbGVjdGlvbiB7XG5cdCNpdGVtcyA9IG5ldyBSZXNvdXJjZU1hcDx2c2NvZGUuQ2hhdFNlc3Npb25JdGVtPigpO1xuXHRyZWFkb25seSAjcHJveHk6IFByb3hpZWQ8TWFpblRocmVhZENoYXRTZXNzaW9uc1NoYXBlPjtcblx0cmVhZG9ubHkgI2NvbnRyb2xsZXJIYW5kbGU6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihjb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHByb3h5OiBQcm94aWVkPE1haW5UaHJlYWRDaGF0U2Vzc2lvbnNTaGFwZT4pIHtcblx0XHR0aGlzLiNwcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuI2NvbnRyb2xsZXJIYW5kbGUgPSBjb250cm9sbGVySGFuZGxlO1xuXHR9XG5cblx0Z2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy4jaXRlbXMuc2l6ZTtcblx0fVxuXG5cdHJlcGxhY2UobmV3SXRlbXM6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1bXSk6IHZvaWQge1xuXHRcdGlmICghbmV3SXRlbXMubGVuZ3RoICYmICF0aGlzLiNpdGVtcy5zaXplKSB7XG5cdFx0XHQvLyBObyBjaGFuZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdJdGVtc01hcCA9IG5ldyBSZXNvdXJjZU1hcChuZXdJdGVtcy5tYXAoaXRlbSA9PiBbaXRlbS5yZXNvdXJjZSwgaXRlbV0gYXMgY29uc3QpKTtcblxuXHRcdGNvbnN0IGRlbHRhID0gY29tcHV0ZUl0ZW1zRGVsdGEodGhpcy4jaXRlbXMsIG5ld0l0ZW1zTWFwKTtcblx0XHRpZiAoIWRlbHRhLmFkZGVkT3JVcGRhdGVkPy5zaXplICYmICFkZWx0YS5yZW1vdmVkPy5zaXplKSB7XG5cdFx0XHQvLyBObyBjaGFuZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLiNpdGVtcyA9IG5ld0l0ZW1zTWFwO1xuXHRcdHZvaWQgdGhpcy4jcHJveHkuJHVwZGF0ZUNoYXRTZXNzaW9uSXRlbXModGhpcy4jY29udHJvbGxlckhhbmRsZSwgY29udmVydENoYXRTZXNzaW9uRGVsdGFUb0R0byhkZWx0YSkpO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFjazogKGl0ZW06IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0sIGNvbGxlY3Rpb246IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db2xsZWN0aW9uKSA9PiB1bmtub3duLCB0aGlzQXJnPzogYW55KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbXywgaXRlbV0gb2YgdGhpcy4jaXRlbXMpIHtcblx0XHRcdGNhbGxiYWNrLmNhbGwodGhpc0FyZywgaXRlbSwgdGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0YWRkKGl0ZW06IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuI2l0ZW1zLmdldChpdGVtLnJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcgJiYgZXhpc3RpbmcgPT09IGl0ZW0pIHtcblx0XHRcdC8vIFdlJ3JlIGFkZGluZyB0aGUgc2FtZSBpdGVtIGFnYWluXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy4jaXRlbXMuc2V0KGl0ZW0ucmVzb3VyY2UsIGl0ZW0pO1xuXHRcdHZvaWQgdGhpcy4jcHJveHkuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKHRoaXMuI2NvbnRyb2xsZXJIYW5kbGUsIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKGl0ZW0pKTtcblx0fVxuXG5cdGRlbGV0ZShyZXNvdXJjZTogdnNjb2RlLlVyaSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLiNpdGVtcy5kZWxldGUocmVzb3VyY2UpKSB7XG5cdFx0XHR2b2lkIHRoaXMuI3Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1zKHRoaXMuI2NvbnRyb2xsZXJIYW5kbGUsIHtcblx0XHRcdFx0YWRkZWRPclVwZGF0ZWQ6IFtdLFxuXHRcdFx0XHRyZW1vdmVkOiBbcmVzb3VyY2VdXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQocmVzb3VyY2U6IHZzY29kZS5VcmkpOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jaXRlbXMuZ2V0KHJlc291cmNlKTtcblx0fVxuXG5cdFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhdG9yPHJlYWRvbmx5IFtpZDogVVJJLCBjaGF0U2Vzc2lvbkl0ZW06IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1dPiB7XG5cdFx0cmV0dXJuIHRoaXMuI2l0ZW1zLmVudHJpZXMoKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbmNsYXNzIEV4dEhvc3RDaGF0U2Vzc2lvbiB7XG5cdHByaXZhdGUgX3N0cmVhbTogQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW07XG5cdC8vIEVtcHR5IG1hcCBzaW5jZSBxdWVzdGlvbiBjYXJvdXNlbCBpcyBkZXNpZ25lZCBmb3IgY2hhdCBhZ2VudHMsIG5vdCBjaGF0IHNlc3Npb25zXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycyA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+Pj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2Vzc2lvbjogdnNjb2RlLkNoYXRTZXNzaW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJveHk6IElDaGF0QWdlbnRQcm9ncmVzc1NoYXBlLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlXG5cdCkge1xuXHRcdHRoaXMuX3N0cmVhbSA9IG5ldyBDaGF0QWdlbnRSZXNwb25zZVN0cmVhbShleHRlbnNpb24sIHJlcXVlc3QsIHByb3h5LCBjb21tYW5kc0NvbnZlcnRlciwgc2Vzc2lvbkRpc3Bvc2FibGVzLCB0aGlzLl9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZVJlc3BvbnNlU3RyZWFtKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdHJlYW07XG5cdH1cblxuXHRnZXRBY3RpdmVSZXF1ZXN0U3RyZWFtKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0KSB7XG5cdFx0cmV0dXJuIG5ldyBDaGF0QWdlbnRSZXNwb25zZVN0cmVhbSh0aGlzLmV4dGVuc2lvbiwgcmVxdWVzdCwgdGhpcy5wcm94eSwgdGhpcy5jb21tYW5kc0NvbnZlcnRlciwgdGhpcy5zZXNzaW9uRGlzcG9zYWJsZXMsIHRoaXMuX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDaGF0U2Vzc2lvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRXh0SG9zdENoYXRTZXNzaW9uc1NoYXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IFByb3hpZWQ8TWFpblRocmVhZENoYXRTZXNzaW9uc1NoYXBlPjtcblxuXHRwcml2YXRlIF9pdGVtQ29udHJvbGxlckhhbmRsZVBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycyA9IG5ldyBNYXA8LyogaGFuZGxlICovIG51bWJlciwge1xuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNvbnRyb2xsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyO1xuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdHJlYWRvbmx5IGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcblx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlRW1pdHRlcjogRW1pdHRlcjx2c2NvZGUuQ2hhdFNlc3Npb25JdGVtPjtcblx0XHRyZWFkb25seSBpbnB1dFN0YXRlczogU2V0PENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGw+O1xuXHRcdG9wdGlvbkdyb3Vwcz86IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXTtcblx0fT4oKTtcblxuXHRwcml2YXRlIF9jb250ZW50UHJvdmlkZXJIYW5kbGVQb29sID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXJzID0gbmV3IE1hcDwvKiBoYW5kbGUgKi8gbnVtYmVyLCB7XG5cdFx0cmVhZG9ubHkgY2hhdFNlc3Npb25TY2hlbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBwcm92aWRlcjogdnNjb2RlLkNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyO1xuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRcdHJlYWRvbmx5IGNhcGFiaWxpdGllcz86IHZzY29kZS5DaGF0U2Vzc2lvbkNhcGFiaWxpdGllcztcblx0XHRyZWFkb25seSBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdH0+KCk7XG5cblx0LyoqXG5cdCAqIE1hcCBvZiB1cmkgLT4gY2hhdCBzZXNzaW9ucyBpbmZvc1xuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdENoYXRTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZU1hcDx7IHJlYWRvbmx5IHNlc3Npb25PYmo6IEV4dEhvc3RDaGF0U2Vzc2lvbjsgcmVhZG9ubHkgZGlzcG9zZUN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfT4oKTtcblxuXHQvKipcblx0ICogTWFwIG9mIHByb3h5IGNvbW1hbmQgaWQgLT4gb3JpZ2luYWwgY29tbWFuZCBpZCArIGNvbnRyb2xsZXIgaGFuZGxlLlxuXHQgKiBVc2VkIHRvIHdyYXAgb3B0aW9uIGdyb3VwIGNvbW1hbmRzIHNvIHRoZXkgcmVjZWl2ZSBgeyBpbnB1dFN0YXRlLCBzZXNzaW9uUmVzb3VyY2UgfWAgaW5zdGVhZCBvZiBqdXN0IGBzZXNzaW9uUmVzb3VyY2VgLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHlDb21tYW5kcyA9IG5ldyBNYXA8LyogcHJveHlJZCAqLyBzdHJpbmcsIHsgcmVhZG9ubHkgb3JpZ2luYWxDb21tYW5kSWQ6IHN0cmluZzsgcmVhZG9ubHkgY29udHJvbGxlckhhbmRsZTogbnVtYmVyIH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzOiBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMsXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gdGhpcy5fZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdFNlc3Npb25zKTtcblxuXHRcdGNvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiAoYXJnKSA9PiB7XG5cdFx0XHRcdGlmIChhcmcgJiYgYXJnLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhcmcuc2Vzc2lvbi5yZXNvdXJjZTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHsgY29udHJvbGxlciB9IG9mIHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtID0gY29udHJvbGxlci5pdGVtcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjaGF0IHNlc3Npb24gZm91bmQgd2l0aCB1cmk6ICR7cmVzb3VyY2V9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHQvLyBUaGUgbGVnYWN5IHByb3ZpZGVyIGFwaSBpcyBpbXBsZW1lbnRlZCB1c2luZyB0aGUgbmV3IGNvbnRyb2xsZXIgQVBJIG9uIHRoZSBiYWNrZW5kXG5cdFx0Y29uc3QgY29udHJvbGxlckhhbmRsZSA9IHRoaXMuX2l0ZW1Db250cm9sbGVySGFuZGxlUG9vbCsrO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT4oKSk7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IENoYXRTZXNzaW9uSXRlbUNvbGxlY3Rpb25JbXBsKGNvbnRyb2xsZXJIYW5kbGUsIHRoaXMuX3Byb3h5KTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyID0ge1xuXHRcdFx0aWQ6IGNoYXRTZXNzaW9uVHlwZSxcblx0XHRcdGl0ZW1zOiBjb2xsZWN0aW9uLFxuXHRcdFx0Y3JlYXRlQ2hhdFNlc3Npb25JdGVtOiAoX3Jlc291cmNlOiB2c2NvZGUuVXJpLCBfbGFiZWw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBmb3IgcHJvdmlkZXJzJyk7XG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlOiAoX29wdGlvbnM6IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGwoW10pO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGU6IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyLmV2ZW50LFxuXHRcdFx0bmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Ly8gQnJpZGdlIHRoZSBkZXByZWNhdGVkIGBDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtYCBob29rIHRocm91Z2ggdGhlXG5cdFx0XHQvLyBuZXcgY29udHJvbGxlciBzdXJmYWNlIHNvIGJvdGggY29kZSBwYXRocyBzaGFyZSB0aGUgc2FtZSBgJHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1gIGltcGwuXG5cdFx0XHQvLyBUaGUgbGVnYWN5IHByb3ZpZGVyIHJldHVybnMgYSBuZXcgaXRlbTsgdGhlIGJyaWRnZSBhZGRzIGl0IHRvIHRoZSBjb2xsZWN0aW9uIHNvIHRoZVxuXHRcdFx0Ly8gY29udHJvbGxlciBjb250cmFjdCAodXBkYXRlIHZpYSBjb2xsZWN0aW9uLCByZXR1cm4gdm9pZCkgaXMgc2F0aXNmaWVkLlxuXHRcdFx0cmVzb2x2ZUNoYXRTZXNzaW9uSXRlbTogcHJvdmlkZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbVxuXHRcdFx0XHQ/IGFzeW5jIChpdGVtLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcHJvdmlkZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSEoaXRlbSwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdGlvbi5hZGQocmVzb2x2ZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHRcdHJlZnJlc2hIYW5kbGVyOiBhc3luYyAodG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkl0ZW1zKHRva2VuKSA/PyBbXTtcblx0XHRcdFx0Y29sbGVjdGlvbi5yZXBsYWNlKGl0ZW1zKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLnNldChjb250cm9sbGVySGFuZGxlLCB7IGNoYXRTZXNzaW9uVHlwZTogY2hhdFNlc3Npb25UeXBlLCBjb250cm9sbGVyLCBleHRlbnNpb24sIGRpc3Bvc2FibGU6IGRpc3Bvc2FibGVzLCBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlRW1pdHRlciwgaW5wdXRTdGF0ZXM6IG5ldyBTZXQoKSB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIGNoYXRTZXNzaW9uVHlwZSwgISFwcm92aWRlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKTtcblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbXMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBFeHRIb3N0Q2hhdFNlc3Npb25zLiBQcm92aWRlciBpdGVtcyBjaGFuZ2VkIGZvciAke2NoYXRTZXNzaW9uVHlwZX1gKTtcblx0XHRcdFx0Ly8gV2hlbiBhIHByb3ZpZGVyIGZpcmVzIHRoaXMsIHdlIHRyZWF0IGl0IHRoZSBzYW1lIGFzIHRyaWdnZXJpbmcgYSByZWZyZXNoIGluIHRoZSBuZXcgY29udHJvbGxlciBiYXNlZCBtb2RlbC5cblx0XHRcdFx0Ly8gVGhpcyBpcyBiZWNhdXNlIHdpdGggcHJvdmlkZXJzLCBmaXJpbmcgdGhpcyBldmVudCB3b3VsZCBzaWduYWwgdGhhdCBgcHJvdmlkZWAgc2hvdWxkIGJlIGNhbGxlZCBhZ2Fpbi5cblx0XHRcdFx0Ly8gV2l0aCBjb250cm9sbGVycywgaXQgaW5zdGVhZCBzaWduYWxzIHRoYXQgeW91IHNob3VsZCByZWFkIHRoZSBjdXJyZW50IGl0ZW1zIGFnYWluLlxuXHRcdFx0XHRjb250cm9sbGVyLnJlZnJlc2hIYW5kbGVyKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENvbW1pdENoYXRTZXNzaW9uSXRlbSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ29tbWl0Q2hhdFNlc3Npb25JdGVtKChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgb3JpZ2luYWwsIG1vZGlmaWVkIH0gPSBlO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDb21taXRDaGF0U2Vzc2lvbkl0ZW0oY29udHJvbGxlckhhbmRsZSwgb3JpZ2luYWwucmVzb3VyY2UsIG1vZGlmaWVkLnJlc291cmNlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlOiB2c2NvZGUuRGlzcG9zYWJsZSA9IHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZGVsZXRlKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24oZGlzcG9zYWJsZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZTogb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIuZXZlbnQsXG5cdFx0fSk7XG5cdH1cblxuXHRjcmVhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCByZWZyZXNoSGFuZGxlcjogKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPHZvaWQ+KTogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSB0aGlzLl9pdGVtQ29udHJvbGxlckhhbmRsZVBvb2wrKztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IG5ld0NoYXRTZXNzaW9uSXRlbUhhbmRsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyWyduZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyJ107XG5cdFx0bGV0IGZvcmtIYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnZm9ya0hhbmRsZXInXTtcblx0XHRsZXQgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbUhhbmRsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyWydyZXNvbHZlQ2hhdFNlc3Npb25JdGVtJ107XG5cdFx0bGV0IHByb3ZpZGVDaGF0U2Vzc2lvbklucHV0U3RhdGVIYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlJ107XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT4oKSk7XG5cdFx0Y29uc3QgaW5wdXRTdGF0ZXMgPSBuZXcgU2V0PENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGw+KCk7XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IENoYXRTZXNzaW9uSXRlbUNvbGxlY3Rpb25JbXBsKGNvbnRyb2xsZXJIYW5kbGUsIHRoaXMuX3Byb3h5KTtcblx0XHRjb25zdCBwcm94eSA9IHRoaXMuX3Byb3h5O1xuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IE9iamVjdC5mcmVlemU8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI+KHtcblx0XHRcdGlkLFxuXHRcdFx0cmVmcmVzaEhhbmRsZXI6IGFzeW5jIChyZWZyZXNoVG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGlmIChpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGhhcyBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBFeHRIb3N0Q2hhdFNlc3Npb25zLiBDb250cm9sbGVyKCR7aWR9KS5yZWZyZXNoKClgKTtcblx0XHRcdFx0YXdhaXQgcmVmcmVzaEhhbmRsZXIocmVmcmVzaFRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRpdGVtczogY29sbGVjdGlvbixcblx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGU6IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyLmV2ZW50LFxuXHRcdFx0Y3JlYXRlQ2hhdFNlc3Npb25JdGVtOiAocmVzb3VyY2U6IHZzY29kZS5VcmksIGxhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBuZXcgQ2hhdFNlc3Npb25JdGVtSW1wbChyZXNvdXJjZSwgbGFiZWwsICgpID0+IHtcblx0XHRcdFx0XHQvLyBNYWtlIHN1cmUgdGhlIGl0ZW0gcmVhbGx5IGlzIGluIHRoZSBjb2xsZWN0aW9uLiBJZiBub3Qgd2UgZG9uJ3QgbmVlZCB0byB0cmFuc21pdCBpdCB0byB0aGUgbWFpbiB0aHJlYWQgeWV0XG5cdFx0XHRcdFx0aWYgKGNvbGxlY3Rpb24uZ2V0KHJlc291cmNlKSA9PT0gaXRlbSkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLl9wcm94eS4kYWRkT3JVcGRhdGVDaGF0U2Vzc2lvbkl0ZW0oY29udHJvbGxlckhhbmRsZSwgdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20oaXRlbSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0fSxcblx0XHRcdGdldCBuZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyKCkgeyByZXR1cm4gbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlcjsgfSxcblx0XHRcdHNldCBuZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyKGhhbmRsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyWyduZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyJ10pIHsgbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlciA9IGhhbmRsZXI7IH0sXG5cdFx0XHRnZXQgZm9ya0hhbmRsZXIoKSB7IHJldHVybiBmb3JrSGFuZGxlcjsgfSxcblx0XHRcdHNldCBmb3JrSGFuZGxlcihoYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnZm9ya0hhbmRsZXInXSkgeyBmb3JrSGFuZGxlciA9IGhhbmRsZXI7IH0sXG5cdFx0XHRnZXQgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSgpIHsgcmV0dXJuIHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyOyB9LFxuXHRcdFx0c2V0IHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oaGFuZGxlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJbJ3Jlc29sdmVDaGF0U2Vzc2lvbkl0ZW0nXSkge1xuXHRcdFx0XHRjb25zdCBoYWRIYW5kbGVyID0gISFyZXNvbHZlQ2hhdFNlc3Npb25JdGVtSGFuZGxlcjtcblx0XHRcdFx0cmVzb2x2ZUNoYXRTZXNzaW9uSXRlbUhhbmRsZXIgPSBoYW5kbGVyO1xuXHRcdFx0XHRjb25zdCBoYXNIYW5kbGVyID0gISFoYW5kbGVyO1xuXHRcdFx0XHRpZiAoaGFkSGFuZGxlciAhPT0gaGFzSGFuZGxlciAmJiAhaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHByb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzKGNvbnRyb2xsZXJIYW5kbGUsIGhhc0hhbmRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSgpIHsgcmV0dXJuIHByb3ZpZGVDaGF0U2Vzc2lvbklucHV0U3RhdGVIYW5kbGVyOyB9LFxuXHRcdFx0c2V0IGdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZShoYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlJ10pIHsgcHJvdmlkZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZUhhbmRsZXIgPSBoYW5kbGVyOyB9LFxuXHRcdFx0Y3JlYXRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlOiAoZ3JvdXBzOiB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10pID0+IHtcblx0XHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlucHV0U3RhdGUgPSBuZXcgQ2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbChncm91cHMsICgpID0+IHtcblx0XHRcdFx0XHQvLyBTdG9yZSB1cGRhdGVkIG9wdGlvbiBncm91cHMgb24gdGhlIGNvbnRyb2xsZXIgZW50cnlcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySGFuZGxlKTtcblx0XHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRcdGVudHJ5Lm9wdGlvbkdyb3VwcyA9IGlucHV0U3RhdGUuZ3JvdXBzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB3cmFwcGVkR3JvdXBzID0gdGhpcy5fd3JhcE9wdGlvbkdyb3VwQ29tbWFuZHMoY29udHJvbGxlckhhbmRsZSwgaW5wdXRTdGF0ZS5ncm91cHMpO1xuXHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6YWJsZUdyb3VwcyA9IHdyYXBwZWRHcm91cHMubWFwKGcgPT4gKHtcblx0XHRcdFx0XHRcdGlkOiBnLmlkLFxuXHRcdFx0XHRcdFx0bmFtZTogZy5uYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGcuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRpdGVtczogZy5pdGVtcyxcblx0XHRcdFx0XHRcdHNlbGVjdGVkOiBnLnNlbGVjdGVkLFxuXHRcdFx0XHRcdFx0d2hlbjogZy53aGVuLFxuXHRcdFx0XHRcdFx0aWNvbjogZy5pY29uLFxuXHRcdFx0XHRcdFx0Y29tbWFuZHM6IGcuY29tbWFuZHMsXG5cdFx0XHRcdFx0XHRraW5kOiBnLmtpbmQsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gaW5wdXRTdGF0ZS5zZXNzaW9uUmVzb3VyY2UgPz8gaW5wdXRTdGF0ZS51bnRpdGxlZFNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fcHJveHkuJHVwZGF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZShjb250cm9sbGVySGFuZGxlLCByZXNvdXJjZSwgc2VyaWFsaXphYmxlR3JvdXBzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpbnB1dFN0YXRlcy5hZGQoaW5wdXRTdGF0ZSk7XG5cdFx0XHRcdHJldHVybiBpbnB1dFN0YXRlO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdGZvciAoY29uc3QgaW5wdXRTdGF0ZSBvZiBpbnB1dFN0YXRlcykge1xuXHRcdFx0XHRcdGlucHV0U3RhdGUuX2Rpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbnB1dFN0YXRlcy5jbGVhcigpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuc2V0KGNvbnRyb2xsZXJIYW5kbGUsIHsgY29udHJvbGxlciwgZXh0ZW5zaW9uLCBkaXNwb3NhYmxlOiBkaXNwb3NhYmxlcywgY2hhdFNlc3Npb25UeXBlOiBpZCwgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIsIGlucHV0U3RhdGVzIH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNvbnRyb2xsZXIgd2l0aCB0aGUgbWFpbiB0aHJlYWQuIGByZXNvbHZlQ2hhdFNlc3Npb25JdGVtYCBtYXkgYmUgYXNzaWduZWRcblx0XHQvLyBsYXRlciB2aWEgdGhlIHNldHRlciwgd2hpY2ggZmlyZXMgYCR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyQ2FwYWJpbGl0aWVzYCB0b1xuXHRcdC8vIGZsaXAgYHN1cHBvcnRzUmVzb2x2ZWAgb24uIFN0YXJ0IG91dCBhcyBgZmFsc2VgIHNvIGNvbnRyb2xsZXJzIHRoYXQgbmV2ZXIgc2V0IHRoZVxuXHRcdC8vIGhhbmRsZXIgZG9uJ3QgcGF5IGFuIFJQQyBwZXIgcmVuZGVyLlxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSwgaWQsICEhcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbUhhbmRsZXIpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5kZWxldGUoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRyb2xsZXI7XG5cdH1cblxuXHRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBjaGF0U2Vzc2lvblNjaGVtZTogc3RyaW5nLCBjaGF0UGFydGljaXBhbnQ6IHZzY29kZS5DaGF0UGFydGljaXBhbnQsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIsIGNhcGFiaWxpdGllcz86IHZzY29kZS5DaGF0U2Vzc2lvbkNhcGFiaWxpdGllcyk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9jb250ZW50UHJvdmlkZXJIYW5kbGVQb29sKys7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0aGlzLl9jaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcnMuc2V0KGhhbmRsZSwgeyBjaGF0U2Vzc2lvblNjaGVtZSwgcHJvdmlkZXIsIGV4dGVuc2lvbiwgY2FwYWJpbGl0aWVzLCBkaXNwb3NhYmxlOiBkaXNwb3NhYmxlcyB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUsIGNoYXRTZXNzaW9uU2NoZW1lKTtcblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uT3B0aW9ucykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25PcHRpb25zKGV2dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbT4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHVwZGF0ZSBvZiBldnQudXBkYXRlcykge1xuXHRcdFx0XHRcdHVwZGF0ZXNbdXBkYXRlLm9wdGlvbklkXSA9IHVwZGF0ZS52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbk9wdGlvbnMoaGFuZGxlLCBldnQucmVzb3VyY2UsIHVwZGF0ZXMpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKGhhbmRsZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgY29udGV4dDogQ2hhdFNlc3Npb25Db250ZW50Q29udGV4dER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25EdG8+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvciBoYW5kbGUgJHtoYW5kbGV9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRsZXQgaW5wdXRTdGF0ZTogdnNjb2RlLkNoYXRTZXNzaW9uSW5wdXRTdGF0ZTtcblx0XHRpZiAoY29udHJvbGxlckRhdGE/LmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZShpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSA/IHVuZGVmaW5lZCA6IHNlc3Npb25SZXNvdXJjZSwge1xuXHRcdFx0XHRwcmV2aW91c0lucHV0U3RhdGU6IHRoaXMuX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhjb250cm9sbGVyRGF0YS5vcHRpb25Hcm91cHMgPz8gW10sIGNvbnRleHQuaW5pdGlhbFNlc3Npb25PcHRpb25zKSxcblx0XHRcdH0sIHRva2VuKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0aW5wdXRTdGF0ZSA9IHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aW5wdXRTdGF0ZSA/Pz0gdGhpcy5fY3JlYXRlSW5wdXRTdGF0ZUZyb21PcHRpb25zKFxuXHRcdFx0Y29udHJvbGxlckRhdGE/Lm9wdGlvbkdyb3VwcyA/PyBbXSwgY29udGV4dC5pbml0aWFsU2Vzc2lvbk9wdGlvbnNcblx0XHQpO1xuXG5cdFx0aWYgKGlucHV0U3RhdGUgaW5zdGFuY2VvZiBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsKSB7XG5cdFx0XHQvLyBEaXNwb3NlIGFueSBwcmV2aW91cyBpbnB1dCBzdGF0ZXMgZm9yIHRoaXMgc2Vzc2lvbiByZXNvdXJjZVxuXHRcdFx0aWYgKGNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VJbnB1dFN0YXRlc0ZvclJlc291cmNlKGNvbnRyb2xsZXJEYXRhLmlucHV0U3RhdGVzLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0aW5wdXRTdGF0ZS51bnRpdGxlZFNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlucHV0U3RhdGUuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBwcm92aWRlci5wcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25Db250ZW50KHNlc3Npb25SZXNvdXJjZSwgdG9rZW4sIHtcblx0XHRcdGlucHV0U3RhdGUsXG5cdFx0fSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaWQgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IG5ldyBFeHRIb3N0Q2hhdFNlc3Npb24oc2Vzc2lvbiwgcHJvdmlkZXIuZXh0ZW5zaW9uLCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRyZXF1ZXN0SWQ6ICdvbmdvaW5nJyxcblx0XHRcdGFnZW50SWQ6IGlkLFxuXHRcdFx0bWVzc2FnZTogJycsXG5cdFx0XHR2YXJpYWJsZXM6IHsgdmFyaWFibGVzOiBbXSB9LFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0fSwge1xuXHRcdFx0JGhhbmRsZVByb2dyZXNzQ2h1bms6IChyZXF1ZXN0SWQsIGNodW5rcykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGhhbmRsZVByb2dyZXNzQ2h1bmsoaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCwgY2h1bmtzKTtcblx0XHRcdH0sXG5cdFx0XHQkaGFuZGxlQW5jaG9yUmVzb2x2ZTogKHJlcXVlc3RJZCwgcmVxdWVzdEhhbmRsZSwgYW5jaG9yKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRoYW5kbGVBbmNob3JSZXNvbHZlKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0SWQsIHJlcXVlc3RIYW5kbGUsIGFuY2hvcik7XG5cdFx0XHR9LFxuXHRcdH0sIHRoaXMuY29tbWFuZHMuY29udmVydGVyLCBzZXNzaW9uRGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgZGlzcG9zZUN0cyA9IHNlc3Npb25EaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdHRoaXMuX2V4dEhvc3RDaGF0U2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgeyBzZXNzaW9uT2JqOiBjaGF0U2Vzc2lvbiwgZGlzcG9zZUN0cyB9KTtcblxuXHRcdC8vIENhbGwgYWN0aXZlUmVzcG9uc2VDYWxsYmFjayBpbW1lZGlhdGVseSBmb3IgYmVzdCB1c2VyIGV4cGVyaWVuY2Vcblx0XHRpZiAoc2Vzc2lvbi5hY3RpdmVSZXNwb25zZUNhbGxiYWNrKSB7XG5cdFx0XHRQcm9taXNlLnJlc29sdmUoc2Vzc2lvbi5hY3RpdmVSZXNwb25zZUNhbGxiYWNrKGNoYXRTZXNzaW9uLmFjdGl2ZVJlc3BvbnNlU3RyZWFtLmFwaU9iamVjdCwgZGlzcG9zZUN0cy50b2tlbikpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHQvLyBjb21wbGV0ZVxuXHRcdFx0XHR0aGlzLl9wcm94eS4kaGFuZGxlUHJvZ3Jlc3NDb21wbGV0ZShoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSwgJ29uZ29pbmcnKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRjb25zdCB7IGNhcGFiaWxpdGllcyB9ID0gcHJvdmlkZXI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHR0aXRsZTogc2Vzc2lvbi50aXRsZSxcblx0XHRcdGhhc0FjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6ICEhc2Vzc2lvbi5hY3RpdmVSZXNwb25zZUNhbGxiYWNrLFxuXHRcdFx0aGFzUmVxdWVzdEhhbmRsZXI6ICEhc2Vzc2lvbi5yZXF1ZXN0SGFuZGxlcixcblx0XHRcdGhhc0ZvcmtIYW5kbGVyOiAhIWNvbnRyb2xsZXJEYXRhPy5jb250cm9sbGVyLmZvcmtIYW5kbGVyIHx8ICEhc2Vzc2lvbi5mb3JrSGFuZGxlcixcblx0XHRcdHN1cHBvcnRzSW50ZXJydXB0aW9uOiAhIWNhcGFiaWxpdGllcz8uc3VwcG9ydHNJbnRlcnJ1cHRpb25zLFxuXHRcdFx0b3B0aW9uczogc2Vzc2lvbi5vcHRpb25zLFxuXHRcdFx0aGlzdG9yeTogc2Vzc2lvbi5oaXN0b3J5Lm1hcCh0dXJuID0+IHtcblx0XHRcdFx0aWYgKHR1cm4gaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3RUdXJuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY29udmVydFJlcXVlc3RUdXJuKHR1cm4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRSZXNwb25zZVR1cm4odHVybiBhcyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVHVybjIsIHNlc3Npb25EaXNwb3NhYmxlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZShoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdXBkYXRlczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgdW5kZWZpbmVkPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIHByb3ZpZGVyIGZvciBoYW5kbGUgJHtoYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT2xkIHByb3ZpZGVyIGJhc2VkIGltcGxlbWVudGF0aW9uXG5cdFx0aWYgKHByb3ZpZGVyLnByb3ZpZGVyLnByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVzVG9TZW5kID0gT2JqZWN0LmVudHJpZXModXBkYXRlcykubWFwKChbb3B0aW9uSWQsIHZhbHVlXSkgPT4gKHtcblx0XHRcdFx0XHRvcHRpb25JZCxcblx0XHRcdFx0XHR2YWx1ZTogdmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6ICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB2YWx1ZS5pZClcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRwcm92aWRlci5wcm92aWRlci5wcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZShzZXNzaW9uUmVzb3VyY2UsIHVwZGF0ZXNUb1NlbmQsIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIGNhbGxpbmcgcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UgZm9yIGhhbmRsZSAke2hhbmRsZX0sIHNlc3Npb25SZXNvdXJjZSAke3Nlc3Npb25SZXNvdXJjZX06YCwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLmdldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblR5cGUpO1xuXHRcdGlmICghY29udHJvbGxlckRhdGEgfHwgIWNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIHZhbGlkIGNvbnRyb2xsZXIgZm91bmQgZm9yIHNlc3Npb24gdHlwZSAke3Nlc3Npb25UeXBlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRlbXBvcmFyeSB3b3JrYXJvdW5kOiBpbnB1dCBzdGF0ZSBjaGFuZ2VzIGZvciBvbmUgcmVzb3VyY2UgYXJlIHByb3BhZ2F0ZWQgdG8gYWxsXG5cdFx0Ly8gaW5wdXQgc3RhdGVzIGZvciB0aGUgc2FtZSByZXNvdXJjZSB0eXBlIHVudGlsIHdlIGNhbiBtYWtlIHRoaXMgc2Vzc2lvbi1zcGVjaWZpYy5cblx0XHRmb3IgKGNvbnN0IGlucHV0U3RhdGUgb2YgY29udHJvbGxlckRhdGE/LmlucHV0U3RhdGVzID8/IFtdKSB7XG5cdFx0XHQvLyBVcGRhdGUgdGhlIHNlbGVjdGVkIGl0ZW1zIG9uIHRoZSBncm91cHMgYmVmb3JlIGZpcmluZyB0aGUgY2hhbmdlIGV2ZW50XG5cdFx0XHRjb25zdCB1cGRhdGVkR3JvdXBzID0gaW5wdXRTdGF0ZS5ncm91cHMubWFwKGdyb3VwID0+IHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlID0gdXBkYXRlc1tncm91cC5pZF07XG5cdFx0XHRcdGlmICghdXBkYXRlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRJZCA9IHR5cGVvZiB1cGRhdGUgPT09ICdzdHJpbmcnID8gdXBkYXRlIDogdXBkYXRlLmlkO1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZEl0ZW0gPSBncm91cC5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gc2VsZWN0ZWRJZCk7XG5cdFx0XHRcdGlmICghc2VsZWN0ZWRJdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IC4uLmdyb3VwLCBzZWxlY3RlZDogc2VsZWN0ZWRJdGVtIH07XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVXNlIHF1aWV0IHNldHRlciB0byBhdm9pZCBub3RpZnlpbmcgdGhlIG1haW4gdGhyZWFkIGJhY2sgKGl0J3MgdGhlIHNvdXJjZSBvZiB0aGlzIGNoYW5nZSlcblx0XHRcdGlucHV0U3RhdGUuX3NldEdyb3Vwcyh1cGRhdGVkR3JvdXBzKTtcblx0XHRcdGlucHV0U3RhdGUuX2ZpcmVEaWRDaGFuZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKGhhbmRsZTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fY2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gcHJvdmlkZXIgZm9yIGhhbmRsZSAke2hhbmRsZX0gd2hlbiByZXF1ZXN0aW5nIGNoYXQgc2Vzc2lvbiBvcHRpb25zYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBlbnRyeS5wcm92aWRlcjtcblx0XHRpZiAoIXByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnModG9rZW4pO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBvcHRpb25Hcm91cHMsIG5ld1Nlc3Npb25PcHRpb25zIH0gPSByZXN1bHQ7XG5cdFx0XHRpZiAob3B0aW9uR3JvdXBzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGVudHJ5LmNoYXRTZXNzaW9uU2NoZW1lKTtcblx0XHRcdFx0aWYgKGNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHRcdFx0Y29udHJvbGxlckRhdGEub3B0aW9uR3JvdXBzID0gb3B0aW9uR3JvdXBzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvcHRpb25Hcm91cHMsXG5cdFx0XHRcdG5ld1Nlc3Npb25PcHRpb25zLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXJyb3IgY2FsbGluZyBwcm92aWRlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMgZm9yIGhhbmRsZSAke2hhbmRsZX06YCwgZXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRpbnRlcnJ1cHRDaGF0U2Vzc2lvbkFjdGl2ZVJlc3BvbnNlKHByb3ZpZGVySGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmVxdWVzdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2V4dEhvc3RDaGF0U2Vzc2lvbnMuZ2V0KFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0ZW50cnk/LmRpc3Bvc2VDdHMuY2FuY2VsKCk7XG5cdH1cblxuXHRhc3luYyAkZGlzcG9zZUNoYXRTZXNzaW9uQ29udGVudChwcm92aWRlckhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2V4dEhvc3RDaGF0U2Vzc2lvbnMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIGNoYXQgc2Vzc2lvbiBmb3VuZCBmb3IgcmVzb3VyY2U6ICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2UgaW5wdXQgc3RhdGVzIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb25cblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihyZXNvdXJjZS5zY2hlbWUpO1xuXHRcdGlmIChjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUlucHV0U3RhdGVzRm9yUmVzb3VyY2UoY29udHJvbGxlckRhdGEuaW5wdXRTdGF0ZXMsIHJlc291cmNlKTtcblx0XHR9XG5cblx0XHRlbnRyeS5kaXNwb3NlQ3RzLmNhbmNlbCgpO1xuXHRcdGVudHJ5LnNlc3Npb25PYmouc2Vzc2lvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9leHRIb3N0Q2hhdFNlc3Npb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyAkaW52b2tlQ2hhdFNlc3Npb25SZXF1ZXN0SGFuZGxlcihoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzLCByZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgaGlzdG9yeTogYW55W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRBZ2VudFJlc3VsdD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZXh0SG9zdENoYXRTZXNzaW9ucy5nZXQoVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRpZiAoIWVudHJ5IHx8ICFlbnRyeS5zZXNzaW9uT2JqLnNlc3Npb24ucmVxdWVzdEhhbmRsZXIpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0UmVxdWVzdCA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFJlcXVlc3QudG8ocmVxdWVzdCwgdW5kZWZpbmVkLCBhd2FpdCB0aGlzLmdldE1vZGVsRm9yUmVxdWVzdChyZXF1ZXN0LCBlbnRyeS5zZXNzaW9uT2JqLmV4dGVuc2lvbiksIHJlcXVlc3QubW9kZWxDb25maWd1cmF0aW9uLCBbXSwgbmV3IE1hcCgpLCBlbnRyeS5zZXNzaW9uT2JqLmV4dGVuc2lvbiwgdGhpcy5fbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBzdHJlYW0gPSBlbnRyeS5zZXNzaW9uT2JqLmdldEFjdGl2ZVJlcXVlc3RTdHJlYW0ocmVxdWVzdCk7XG5cdFx0YXdhaXQgZW50cnkuc2Vzc2lvbk9iai5zZXNzaW9uLnJlcXVlc3RIYW5kbGVyKGNoYXRSZXF1ZXN0LCB7IGhpc3RvcnksIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9LCBzdHJlYW0uYXBpT2JqZWN0LCB0b2tlbik7XG5cblx0XHQvLyBUT0RPOiBkbyB3ZSBuZWVkIHRvIGRpc3Bvc2UgdGhlIHN0cmVhbSBvYmplY3Q/XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0YXN5bmMgJGZvcmtDaGF0U2Vzc2lvbihoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgcmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJldHVyblR5cGU8dHlwZW9mIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tPj4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9leHRIb3N0Q2hhdFNlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gY2hhdCBzZXNzaW9uIGZvdW5kIGZvciByZXNvdXJjZSAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RUdXJuID0gdGhpcy5jb252ZXJ0UmVxdWVzdER0b1RvUmVxdWVzdFR1cm4ocmVxdWVzdCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKGNvbnRyb2xsZXJEYXRhPy5jb250cm9sbGVyLmZvcmtIYW5kbGVyKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gYXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5mb3JrSGFuZGxlcihzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RUdXJuLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20oaXRlbSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFlbnRyeS5zZXNzaW9uT2JqLnNlc3Npb24uZm9ya0hhbmRsZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gZm9yayBoYW5kbGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGF3YWl0IGVudHJ5LnNlc3Npb25PYmouc2Vzc2lvbi5mb3JrSGFuZGxlcihzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RUdXJuLCB0b2tlbik7XG5cdFx0cmV0dXJuIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKGl0ZW0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0UmVxdWVzdER0b1RvUmVxdWVzdFR1cm4ocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvIHwgdW5kZWZpbmVkKTogZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybihcblx0XHRcdHJlcXVlc3QucHJvbXB0LFxuXHRcdFx0cmVxdWVzdC5jb21tYW5kLFxuXHRcdFx0W10sXG5cdFx0XHRyZXF1ZXN0LnBhcnRpY2lwYW50LFxuXHRcdFx0W10sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0LmlkLFxuXHRcdFx0cmVxdWVzdC5tb2RlbElkLFxuXHRcdFx0dHlwZUNvbnZlcnQuQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLnRvKHJlcXVlc3QubW9kZUluc3RydWN0aW9ucyksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjaGF0U2Vzc2lvblR5cGU6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgY29udHJvbGxlckRhdGEgb2YgdGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChjb250cm9sbGVyRGF0YS5jaGF0U2Vzc2lvblR5cGUgPT09IGNoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gY29udHJvbGxlckRhdGE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VJbnB1dFN0YXRlc0ZvclJlc291cmNlKGlucHV0U3RhdGVzOiBTZXQ8Q2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbD4sIHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGlucHV0U3RhdGUgb2YgaW5wdXRTdGF0ZXMpIHtcblx0XHRcdGNvbnN0IGlucHV0UmVzb3VyY2UgPSBpbnB1dFN0YXRlLnNlc3Npb25SZXNvdXJjZSA/PyBpbnB1dFN0YXRlLnVudGl0bGVkU2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKGlucHV0UmVzb3VyY2UgJiYgaXNFcXVhbChyZXNvdXJjZSwgaW5wdXRSZXNvdXJjZSkpIHtcblx0XHRcdFx0aW5wdXRTdGF0ZS5fZGlzcG9zZSgpO1xuXHRcdFx0XHRpbnB1dFN0YXRlcy5kZWxldGUoaW5wdXRTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSW5wdXRTdGF0ZUZyb21PcHRpb25zKFxuXHRcdGdyb3VwczogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdLFxuXHRcdHNlc3Npb25PcHRpb25zPzogUmVhZG9ubHlBcnJheTx7IG9wdGlvbklkOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT4sXG5cdCk6IENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGwge1xuXHRcdGlmICghc2Vzc2lvbk9wdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG5ldyBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsKGdyb3Vwcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWRHcm91cHMgPSBncm91cHMubWFwKGdyb3VwID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoID0gc2Vzc2lvbk9wdGlvbnMuZmluZChvID0+IG8ub3B0aW9uSWQgPT09IGdyb3VwLmlkKTtcblx0XHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gZ3JvdXAuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IG1hdGNoLnZhbHVlKTtcblx0XHRcdGlmICghc2VsZWN0ZWRJdGVtKSB7XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IC4uLmdyb3VwLCBzZWxlY3RlZDogc2VsZWN0ZWRJdGVtIH07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG5ldyBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsKHJlc29sdmVkR3JvdXBzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBpbnB1dCBzdGF0ZSBmb3IgYSBzZXNzaW9uLiBUaGlzIGNhbGxzIHRoZSBjb250cm9sbGVyJ3MgYGdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZWAgaGFuZGxlciBpZiBhdmFpbGFibGUsXG5cdCAqIG90aGVyd2lzZSBmYWxscyBiYWNrIHRvIGNyZWF0aW5nIGFuIGlucHV0IHN0YXRlIGZyb20gdGhlIHNlc3Npb24gb3B0aW9ucy5cblx0ICovXG5cdGFzeW5jIGdldElucHV0U3RhdGVGb3JTZXNzaW9uKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGluaXRpYWxTZXNzaW9uT3B0aW9uczogUmVhZG9ubHlBcnJheTx7IG9wdGlvbklkOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfT4gfCB1bmRlZmluZWQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHZzY29kZS5DaGF0U2Vzc2lvbklucHV0U3RhdGU+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gc2Vzc2lvblR5cGUgPyB0aGlzLmdldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoc2Vzc2lvblR5cGUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc29sdmVkUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2UgJiYgIWlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpID8gc2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKFxuXHRcdFx0XHRyZXNvbHZlZFJlc291cmNlLFxuXHRcdFx0XHR7IHByZXZpb3VzSW5wdXRTdGF0ZTogdGhpcy5fY3JlYXRlSW5wdXRTdGF0ZUZyb21PcHRpb25zKGNvbnRyb2xsZXJEYXRhLm9wdGlvbkdyb3VwcyA/PyBbXSwgaW5pdGlhbFNlc3Npb25PcHRpb25zKSB9LFxuXHRcdFx0XHR0b2tlbixcblx0XHRcdCk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsKSB7XG5cdFx0XHRcdFx0Ly8gRGlzcG9zZSBhbnkgcHJldmlvdXMgaW5wdXQgc3RhdGVzIGZvciB0aGlzIHNlc3Npb24gcmVzb3VyY2Vcblx0XHRcdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlSW5wdXRTdGF0ZXNGb3JSZXNvdXJjZShjb250cm9sbGVyRGF0YS5pbnB1dFN0YXRlcywgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQudW50aXRsZWRTZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zZXNzaW9uUmVzb3VyY2UgPSByZXNvbHZlZFJlc291cmNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBmYWxsYmFjayA9IHRoaXMuX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhjb250cm9sbGVyRGF0YT8ub3B0aW9uR3JvdXBzID8/IFtdLCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMpO1xuXHRcdGZhbGxiYWNrLnNlc3Npb25SZXNvdXJjZSA9IHJlc29sdmVkUmVzb3VyY2U7XG5cdFx0cmV0dXJuIGZhbGxiYWNrO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyYXBzIG9wdGlvbiBncm91cCBjb21tYW5kcyB3aXRoIHByb3h5IGNvbW1hbmRzIHNvIHRoYXQgZXh0ZW5zaW9ucyB1c2luZyB0aGUgbmV3XG5cdCAqIGBnZXRDaGF0U2Vzc2lvbklucHV0U3RhdGVgIEFQSSByZWNlaXZlIGB7IGlucHV0U3RhdGUsIHNlc3Npb25SZXNvdXJjZSB9YCBpbnN0ZWFkIG9mIGp1c3QgYHNlc3Npb25SZXNvdXJjZWAuXG5cdCAqXG5cdCAqIEZvciBjb250cm9sbGVycyB0aGF0IGRvIG5vdCBpbXBsZW1lbnQgdGhlIG5ldyBBUEksIGNvbW1hbmRzIGFyZSByZXR1cm5lZCB1bmNoYW5nZWQuXG5cdCAqL1xuXHRwcml2YXRlIF93cmFwT3B0aW9uR3JvdXBDb21tYW5kcyhcblx0XHRjb250cm9sbGVySGFuZGxlOiBudW1iZXIsXG5cdFx0Z3JvdXBzOiByZWFkb25seSB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10sXG5cdCk6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5nZXQoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUpIHtcblx0XHRcdHJldHVybiBncm91cHM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdyb3Vwcy5tYXAoZ3JvdXAgPT4ge1xuXHRcdFx0aWYgKCFncm91cC5jb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmdyb3VwLFxuXHRcdFx0XHRjb21tYW5kczogZ3JvdXAuY29tbWFuZHMubWFwKGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb3h5SWQgPSBgX2NoYXRTZXNzaW9uLnByb3h5Q29tbWFuZC4ke2dlbmVyYXRlVXVpZCgpfWA7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHlDb21tYW5kcy5zZXQocHJveHlJZCwgeyBvcmlnaW5hbENvbW1hbmRJZDogY29tbWFuZC5jb21tYW5kLCBjb250cm9sbGVySGFuZGxlIH0pO1xuXG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgcHJveHlJZCwgYXN5bmMgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIG1haW4gdGhyZWFkIHBhc3NlcyBzZXNzaW9uUmVzb3VyY2UgYXMgdGhlIGZpcnN0IGFyZ3VtZW50XG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBhcmdzWzBdIGluc3RhbmNlb2YgVVJJID8gYXJnc1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGNvbnN0IGlucHV0U3RhdGUgPSBhd2FpdCB0aGlzLmdldElucHV0U3RhdGVGb3JTZXNzaW9uKFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHQvLyBDYWxsIHRoZSBvcmlnaW5hbCBjb21tYW5kIHdpdGggdGhlIG5ldyBjb250ZXh0IG9iamVjdFxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQuY29tbWFuZCxcblx0XHRcdFx0XHRcdFx0eyBpbnB1dFN0YXRlLCBzZXNzaW9uUmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdFx0Li4uKGNvbW1hbmQuYXJndW1lbnRzID8/IFtdKSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRyZXR1cm4geyAuLi5jb21tYW5kLCBjb21tYW5kOiBwcm94eUlkIH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TW9kZWxGb3JSZXF1ZXN0KHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0PiB7XG5cdFx0bGV0IG1vZGVsOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlcXVlc3QudXNlclNlbGVjdGVkTW9kZWxJZCkge1xuXHRcdFx0bW9kZWwgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVscy5nZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyKGV4dGVuc2lvbiwgcmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkKTtcblx0XHR9XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVscy5nZXREZWZhdWx0TGFuZ3VhZ2VNb2RlbChleHRlbnNpb24pO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmd1YWdlIG1vZGVsIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0UmVxdWVzdFR1cm4odHVybjogZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybikge1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHR1cm4ucmVmZXJlbmNlcy5tYXAocmVmID0+IHRoaXMuY29udmVydFJlZmVyZW5jZVRvVmFyaWFibGUocmVmKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdyZXF1ZXN0JyBhcyBjb25zdCxcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0cHJvbXB0OiB0dXJuLnByb21wdCxcblx0XHRcdHBhcnRpY2lwYW50OiB0dXJuLnBhcnRpY2lwYW50LFxuXHRcdFx0Y29tbWFuZDogdHVybi5jb21tYW5kLFxuXHRcdFx0dmFyaWFibGVEYXRhOiB2YXJpYWJsZXMubGVuZ3RoID4gMCA/IHsgdmFyaWFibGVzIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbElkOiB0dXJuLm1vZGVsSWQsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB0eXBlQ29udmVydC5DaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMuZnJvbSh0dXJuLm1vZGVJbnN0cnVjdGlvbnMyKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0UmVmZXJlbmNlVG9WYXJpYWJsZShyZWY6IHZzY29kZS5DaGF0UHJvbXB0UmVmZXJlbmNlKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdFx0Y29uc3QgdmFsdWUgPSByZWYudmFsdWUgJiYgdHlwZW9mIHJlZi52YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3VyaScgaW4gcmVmLnZhbHVlICYmICdyYW5nZScgaW4gcmVmLnZhbHVlXG5cdFx0XHQ/IHR5cGVDb252ZXJ0LkxvY2F0aW9uLmZyb20ocmVmLnZhbHVlIGFzIHZzY29kZS5Mb2NhdGlvbilcblx0XHRcdDogcmVmLnZhbHVlO1xuXHRcdGNvbnN0IHJhbmdlID0gcmVmLnJhbmdlID8geyBzdGFydDogcmVmLnJhbmdlWzBdLCBlbmRFeGNsdXNpdmU6IHJlZi5yYW5nZVsxXSB9IDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHZhbHVlICYmIHZhbHVlIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZWZlcmVuY2VEaWFnbm9zdGljICYmIEFycmF5LmlzQXJyYXkodmFsdWUuZGlhZ25vc3RpY3MpICYmIHZhbHVlLmRpYWdub3N0aWNzLmxlbmd0aCAmJiB2YWx1ZS5kaWFnbm9zdGljc1swXVsxXS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IERpYWdub3N0aWMuZnJvbSh2YWx1ZS5kaWFnbm9zdGljc1swXVsxXVswXSk7XG5cdFx0XHRjb25zdCByZWZWYWx1ZTogSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSA9IHtcblx0XHRcdFx0ZmlsdGVyUmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogbWFya2VyLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBtYXJrZXIuZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBtYXJrZXIuZW5kQ29sdW1uIH0sXG5cdFx0XHRcdGZpbHRlclNldmVyaXR5OiBtYXJrZXIuc2V2ZXJpdHksXG5cdFx0XHRcdGZpbHRlclVyaTogdmFsdWUuZGlhZ25vc3RpY3NbMF1bMF0sXG5cdFx0XHRcdHByb2JsZW1NZXNzYWdlOiB2YWx1ZS5kaWFnbm9zdGljc1swXVsxXVswXS5tZXNzYWdlXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEudG9FbnRyeShyZWZWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dEhvc3RUeXBlcy5Mb2NhdGlvbi5pc0xvY2F0aW9uKHJlZi52YWx1ZSkgJiYgcmVmLm5hbWUuc3RhcnRzV2l0aChgc3ltOmApKSB7XG5cdFx0XHRjb25zdCBsb2MgPSB0eXBlQ29udmVydC5Mb2NhdGlvbi5mcm9tKHJlZi52YWx1ZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVmLmlkLFxuXHRcdFx0XHRuYW1lOiByZWYubmFtZSxcblx0XHRcdFx0ZnVsbE5hbWU6IHJlZi5uYW1lLnN1YnN0cmluZyg0KSxcblx0XHRcdFx0dmFsdWU6IHsgdXJpOiByZWYudmFsdWUudXJpLCByYW5nZTogbG9jLnJhbmdlIH0sXG5cdFx0XHRcdC8vIFdlIG5ldmVyIHNlbmQgdGhpcyBpbmZvcm1hdGlvbiB0byBleHRlbnNpb25zLCBzbyBkZWZhdWx0IHRvIFByb3BlcnR5XG5cdFx0XHRcdHN5bWJvbEtpbmQ6IFN5bWJvbEtpbmQuUHJvcGVydHksXG5cdFx0XHRcdC8vIFdlIG5ldmVyIHNlbmQgdGhpcyBpbmZvcm1hdGlvbiB0byBleHRlbnNpb25zLCBzbyBkZWZhdWx0IHRvIFByb3BlcnR5XG5cdFx0XHRcdGljb246IFN5bWJvbEtpbmRzLnRvSWNvbihTeW1ib2xLaW5kLlByb3BlcnR5KSxcblx0XHRcdFx0a2luZDogJ3N5bWJvbCcsXG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVN5bWJvbFZhcmlhYmxlRW50cnk7XG5cdFx0fVxuXG5cdFx0aWYgKFVSSS5pc1VyaSh2YWx1ZSkgJiYgcmVmLm5hbWUuc3RhcnRzV2l0aChgcHJvbXB0OmApKSB7XG5cdFx0XHRpZiAocmVmLmlkLnN0YXJ0c1dpdGgoUHJvbXB0RmlsZVZhcmlhYmxlS2luZC5JbnN0cnVjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHRvUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkodmFsdWUsIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuSW5zdHJ1Y3Rpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlZi5pZC5zdGFydHNXaXRoKFByb21wdEZpbGVWYXJpYWJsZUtpbmQuSW5zdHJ1Y3Rpb25SZWZlcmVuY2UpKSB7XG5cdFx0XHRcdHJldHVybiB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KHZhbHVlLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uUmVmZXJlbmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWYuaWQuc3RhcnRzV2l0aChQcm9tcHRGaWxlVmFyaWFibGVLaW5kLlByb21wdEZpbGUpKSB7XG5cdFx0XHRcdHJldHVybiB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KHZhbHVlLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLlByb21wdEZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlzRmlsZSA9IFVSSS5pc1VyaSh2YWx1ZSkgfHwgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3VyaScgaW4gdmFsdWUpO1xuXHRcdGNvbnN0IGlzRm9sZGVyID0gaXNGaWxlICYmIFVSSS5pc1VyaSh2YWx1ZSkgJiYgdmFsdWUucGF0aC5lbmRzV2l0aCgnLycpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogcmVmLmlkLFxuXHRcdFx0bmFtZTogcmVmLm5hbWUsXG5cdFx0XHR2YWx1ZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHJlZi5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRraW5kOiBpc0ZvbGRlciA/ICdkaXJlY3RvcnknIGFzIGNvbnN0IDogaXNGaWxlID8gJ2ZpbGUnIGFzIGNvbnN0IDogJ2dlbmVyaWMnIGFzIGNvbnN0XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFJlc3BvbnNlVHVybih0dXJuOiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVHVybjIsIHNlc3Npb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0Y29uc3QgcGFydHMgPSBjb2FsZXNjZSh0dXJuLnJlc3BvbnNlLm1hcChyID0+IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVBhcnQuZnJvbShyLCB0aGlzLmNvbW1hbmRzLmNvbnZlcnRlciwgc2Vzc2lvbkRpc3Bvc2FibGVzKSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UnIGFzIGNvbnN0LFxuXHRcdFx0cGFydHMsXG5cdFx0XHRwYXJ0aWNpcGFudDogdHVybi5wYXJ0aWNpcGFudCxcblx0XHRcdGRldGFpbHM6IHR1cm4ucmVzdWx0Py5kZXRhaWxzLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkcmVmcmVzaENoYXRTZXNzaW9uSXRlbXMoaGFuZGxlOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjb250cm9sbGVyIGZvdW5kIGZvciBoYW5kbGUgJHtoYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5yZWZyZXNoSGFuZGxlcih0b2tlbik7XG5cdH1cblxuXHRhc3luYyAkbmV3Q2hhdFNlc3Npb25JdGVtKGhhbmRsZTogbnVtYmVyLCByZXF1ZXN0OiBJQ2hhdE5ld1Nlc3Npb25SZXF1ZXN0RHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJldHVyblR5cGU8dHlwZW9mIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjb250cm9sbGVyIGZvdW5kIGZvciBoYW5kbGUgJHtoYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLm5ld0NoYXRTZXNzaW9uSXRlbUhhbmRsZXI7XG5cdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzSW5wdXRTdGF0ZSA9IHRoaXMuX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhjb250cm9sbGVyRGF0YS5vcHRpb25Hcm91cHMgPz8gW10sIHJlcXVlc3QuaW5pdGlhbFNlc3Npb25PcHRpb25zKTtcblx0XHRsZXQgaW5wdXRTdGF0ZTogdnNjb2RlLkNoYXRTZXNzaW9uSW5wdXRTdGF0ZTtcblx0XHRpZiAoY29udHJvbGxlckRhdGEuY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUpIHtcblx0XHRcdGlucHV0U3RhdGUgPSBhd2FpdCBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSh1bmRlZmluZWQsIHsgcHJldmlvdXNJbnB1dFN0YXRlIH0sIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5wdXRTdGF0ZSA9IHByZXZpb3VzSW5wdXRTdGF0ZTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gYXdhaXQgaGFuZGxlcih7XG5cdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdHByb21wdDogcmVxdWVzdC5wcm9tcHQsXG5cdFx0XHRcdGNvbW1hbmQ6IHJlcXVlc3QuY29tbWFuZFxuXHRcdFx0fSxcblx0XHRcdGlucHV0U3RhdGUsXG5cdFx0fSwgdG9rZW4pO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLml0ZW1zLmFkZChpdGVtKTtcblxuXHRcdHJldHVybiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbShpdGVtKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlKGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySGFuZGxlKTtcblx0XHRpZiAoIWNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIGNvbnRyb2xsZXIgZm91bmQgZm9yIGhhbmRsZSAke2NvbnRyb2xsZXJIYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBpdGVtID0gY29udHJvbGxlckRhdGEuY29udHJvbGxlci5pdGVtcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gaXRlbSBmb3VuZCBmb3Igc2Vzc2lvbiByZXNvdXJjZSAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGl0ZW0uYXJjaGl2ZWQgPSBhcmNoaXZlZDtcblx0XHRjb250cm9sbGVyRGF0YS5vbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlRW1pdHRlci5maXJlKGl0ZW0pO1xuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmV0dXJuVHlwZTx0eXBlb2YgdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzKTtcblxuXHRcdC8vIEJvdGggdGhlIG5ldyBgQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtYCBhbmQgdGhlIGRlcHJlY2F0ZWRcblx0XHQvLyBgQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbWAgaG9va3MgYXJlIGJyaWRnZWQgb250byB0aGUgY29udHJvbGxlclxuXHRcdC8vIHN1cmZhY2UsIHNvIGEgc2luZ2xlIGNvZGUgcGF0aCBoYW5kbGVzIGJvdGguXG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWNvbnRyb2xsZXJEYXRhPy5jb250cm9sbGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuaXRlbXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIGl0ZW0gZm91bmQgZm9yIHNlc3Npb24gcmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGNvbnRyb2xsZXIncyByZXNvbHZlIGhhbmRsZXIgdXBkYXRlcyB0aGUgaXRlbSBpbiB0aGUgY29sbGVjdGlvblxuXHRcdC8vICh2aWEgaXRlbXMuYWRkIG9yIGJ5IG11dGF0aW5nIHByb3BlcnRpZXMpLiBXZSByZS1yZWFkIGZyb20gdGhlXG5cdFx0Ly8gY29sbGVjdGlvbiBhZnRlciBpdCBjb21wbGV0ZXMgdG8gcGljayB1cCB0aGUgY2hhbmdlcy5cblx0XHRhd2FpdCBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oaXRlbSwgdG9rZW4pO1xuXG5cdFx0Y29uc3QgdXBkYXRlZEl0ZW0gPSBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLml0ZW1zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghdXBkYXRlZEl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKHVwZGF0ZWRJdGVtKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlKGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmdldChjb250cm9sbGVySGFuZGxlKTtcblx0XHRpZiAoIWNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIGNvbnRyb2xsZXIgZm91bmQgZm9yIGhhbmRsZSAke2NvbnRyb2xsZXJIYW5kbGV9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZTtcblx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHMgPyBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHMpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGlucHV0U3RhdGUgPSBhd2FpdCBoYW5kbGVyKCFzZXNzaW9uUmVzb3VyY2UgfHwgaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgPyB1bmRlZmluZWQgOiBzZXNzaW9uUmVzb3VyY2UsIHsgcHJldmlvdXNJbnB1dFN0YXRlOiB1bmRlZmluZWQgfSwgdG9rZW4pO1xuXHRcdGlmICghaW5wdXRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoaW5wdXRTdGF0ZSBpbnN0YW5jZW9mIENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGwgJiYgc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHQvLyBEaXNwb3NlIGFueSBwcmV2aW91cyBpbnB1dCBzdGF0ZXMgZm9yIHRoaXMgc2Vzc2lvbiByZXNvdXJjZVxuXHRcdFx0dGhpcy5fZGlzcG9zZUlucHV0U3RhdGVzRm9yUmVzb3VyY2UoY29udHJvbGxlckRhdGEuaW5wdXRTdGF0ZXMsIHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGlmIChpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRpbnB1dFN0YXRlLnVudGl0bGVkU2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5wdXRTdGF0ZS5zZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmUgdGhlIG9wdGlvbiBncm91cHMgZm9yIG9uU2VhcmNoIGNhbGxiYWNrc1xuXHRcdGNvbnRyb2xsZXJEYXRhLm9wdGlvbkdyb3VwcyA9IGlucHV0U3RhdGUuZ3JvdXBzO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZEdyb3VwcyA9IHRoaXMuX3dyYXBPcHRpb25Hcm91cENvbW1hbmRzKGNvbnRyb2xsZXJIYW5kbGUsIGlucHV0U3RhdGUuZ3JvdXBzKTtcblxuXHRcdC8vIFN0cmlwIG5vbi1zZXJpYWxpemFibGUgZmllbGRzIChvblNlYXJjaCkgYmVmb3JlIHJldHVybmluZyBvdmVyIHRoZSBwcm90b2NvbFxuXHRcdHJldHVybiB3cmFwcGVkR3JvdXBzLm1hcChnID0+ICh7XG5cdFx0XHRpZDogZy5pZCxcblx0XHRcdG5hbWU6IGcubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBnLmRlc2NyaXB0aW9uLFxuXHRcdFx0aXRlbXM6IGcuaXRlbXMsXG5cdFx0XHRzZWxlY3RlZDogZy5zZWxlY3RlZCxcblx0XHRcdHdoZW46IGcud2hlbixcblx0XHRcdGljb246IGcuaWNvbixcblx0XHRcdGNvbW1hbmRzOiBnLmNvbW1hbmRzLFxuXHRcdFx0a2luZDogZy5raW5kLFxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxZQUFZLG1CQUFtQjtBQUV4QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFvQyxvQ0FBMEQsd0JBQXdCLGlDQUFpQztBQUV2SixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQiw2QkFBNkI7QUFHMUQsU0FBc00sbUJBQWdEO0FBQ3RQLFNBQVMsK0JBQStCO0FBR3hDLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksa0JBQWtCO0FBQzlCLFNBQVMsZUFBZTtBQU14QixNQUFNLDBCQUFrRTtBQUFBLEVBMEJ2RSxZQUFZLFFBQTBELG1CQUFnQztBQXRCdEcsU0FBUyxzQkFBc0IsSUFBSSxRQUFjO0FBQ2pELFNBQVMsY0FBYyxLQUFLLG9CQUFvQjtBQUVoRCxTQUFTLHVCQUF1QixJQUFJLFFBQWM7QUFDbEQsU0FBUyxlQUFlLEtBQUsscUJBQXFCO0FBbUJqRCxTQUFLLFVBQVU7QUFDZixTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUE1QkE7QUFBQSxFQUNTO0FBQUEsRUFFQTtBQUFBLEVBR0E7QUFBQSxFQUdUO0FBQUEsRUFDQSxJQUFJLGtCQUEwQztBQUM3QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQSxJ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
