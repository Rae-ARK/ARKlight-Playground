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
import { AsyncIterableProducer, raceCancellationError, Sequencer } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Iterable } from "../../../../base/common/iterator.js";
import * as json from "../../../../base/common/json.js";
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import { mapValues } from "../../../../base/common/objects.js";
import { autorun, autorunSelfDisposable, derived, derivedDisposable, disposableObservableValue, observableFromEvent, ObservablePromise, observableValue, transaction } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { createURITransformer } from "../../../../base/common/uriTransformer.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IAllowedMcpServersService } from "../../../../platform/mcp/common/mcpManagement.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationResolverExpression } from "../../../services/configurationResolver/common/configurationResolverExpression.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { chatSessionResourceToId } from "../../chat/common/model/chatUri.js";
import { mcpActivationEvent } from "./mcpConfiguration.js";
import { McpDevModeServerAttache } from "./mcpDevMode.js";
import { McpIcons, parseAndValidateMcpIcon } from "./mcpIcons.js";
import { IMcpRegistry } from "./mcpRegistryTypes.js";
import { IMcpSandboxService } from "./mcpSandboxService.js";
import { McpTaskManager } from "./mcpTaskManager.js";
import { ElicitationKind, extensionMcpCollectionPrefix, IMcpElicitationService, IMcpSamplingService, McpCapability, McpConnectionFailedError, McpConnectionState, mcpPromptReplaceSpecialChars, McpResourceURI, McpServerCacheState, McpServerStaticToolAvailability, McpServerTransportType, McpToolName, McpToolVisibility, MpcResponseError, UserInteractionRequiredError } from "./mcpTypes.js";
import { MCP } from "./modelContextProtocol.js";
import { UriTemplate } from "../../../../base/common/uriTemplate.js";
const emptyToolEntry = {
  serverName: void 0,
  serverIcons: [],
  serverInstructions: void 0,
  trustedAtNonce: void 0,
  nonce: void 0,
  tools: [],
  prompts: void 0,
  capabilities: void 0
};
const toolInvalidCharRe = /[^a-z0-9_-]/gi;
let McpServerMetadataCache = class extends Disposable {
  constructor(scope, storageService) {
    super();
    this.didChange = false;
    this.cache = new LRUCache(128);
    this.extensionServers = /* @__PURE__ */ new Map();
    const storageKey = "mcpToolCache";
    this._register(storageService.onWillSaveState(() => {
      if (this.didChange) {
        storageService.store(storageKey, {
          extensionServers: [...this.extensionServers],
          serverTools: this.cache.toJSON()
        }, scope, StorageTarget.MACHINE);
        this.didChange = false;
      }
    }));
    try {
      const cached = storageService.getObject(storageKey, scope);
      this.extensionServers = new Map(cached?.extensionServers ?? []);
      cached?.serverTools?.forEach(([k, v]) => this.cache.set(k, v));
    } catch {
    }
  }
  /** Resets the cache for primitives and extension servers */
  reset() {
    this.cache.clear();
    this.extensionServers.clear();
    this.didChange = true;
  }
  /** Gets cached primitives for a server (used before a server is running) */
  get(definitionId) {
    return this.cache.get(definitionId);
  }
  /** Sets cached primitives for a server */
  store(definitionId, entry) {
    const prev = this.get(definitionId) || emptyToolEntry;
    this.cache.set(definitionId, { ...prev, ...entry });
    this.didChange = true;
  }
  /** Gets cached servers for a collection (used for extensions, before the extension activates) */
  getServers(collectionId) {
    return this.extensionServers.get(collectionId);
  }
  /** Sets cached servers for a collection */
  storeServers(collectionId, entry) {
    if (entry) {
      this.extensionServers.set(collectionId, entry);
    } else {
      this.extensionServers.delete(collectionId);
    }
    this.didChange = true;
  }
};
McpServerMetadataCache = __decorateClass([
  __decorateParam(1, IStorageService)
], McpServerMetadataCache);
class McpPrefixGenerator {
  constructor() {
    this._buckets = /* @__PURE__ */ new Map();
  }
  take(name) {
    const safeName = name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, McpToolName.MaxPrefixLen - McpToolName.Prefix.length - 1);
    let bucket = this._buckets.get(safeName);
    if (!bucket) {
      bucket = { usedIndexes: /* @__PURE__ */ new Set(), size: 0 };
      this._buckets.set(safeName, bucket);
    }
    let index = 1;
    while (bucket.usedIndexes.has(index)) {
      index++;
    }
    bucket.usedIndexes.add(index);
    bucket.size++;
    const suffix = (index === 1 ? "" : String(index)) + "_";
    const maxNameLen = McpToolName.MaxPrefixLen - McpToolName.Prefix.length - suffix.length;
    const prefix = McpToolName.Prefix + safeName.slice(0, maxNameLen) + suffix;
    return {
      object: prefix,
      dispose: () => {
        bucket.usedIndexes.delete(index);
        bucket.size--;
        if (bucket.size === 0) {
          this._buckets.delete(safeName);
        }
      }
    };
  }
}
class CachedPrimitive {
  /**
   * @param _definitionId Server definition ID
   * @param _cache Metadata cache instance
   * @param _fromStaticDefinition Static definition that came with the server.
   * This should ONLY have a value if it should be used instead of whatever
   * is currently in the cache.
   * @param _fromCache Pull the value from the cache entry.
   * @param _toT Transform the value to the observable type.
   * @param defaultValue Default value if no cache entry.
   */
  constructor(_definitionId, _cache, _fromStaticDefinition, _fromCache, _toT, defaultValue) {
    this._definitionId = _definitionId;
    this._cache = _cache;
    this._fromStaticDefinition = _fromStaticDefinition;
    this._fromCache = _fromCache;
    this._toT = _toT;
    this.defaultValue = defaultValue;
    this.fromServerPromise = observableValue(this, void 0);
    this.fromServer = derived((reader) => this.fromServerPromise.read(reader)?.promiseResult.read(reader)?.data);
    this.value = derived((reader) => {
      const serverTools = this.fromServer.read(reader);
      const definitions = serverTools?.data ?? this._fromStaticDefinition?.read(reader) ?? this.fromCache?.data ?? this.defaultValue;
      return this._toT(definitions, reader);
    });
  }
  get fromCache() {
    const c = this._cache.get(this._definitionId);
    return c ? { data: this._fromCache(c), nonce: c.nonce } : void 0;
  }
  hasStaticDefinition(reader) {
    return !!this._fromStaticDefinition?.read(reader);
  }
}
let McpServer = class extends Disposable {
  constructor(initialCollection, definition, explicitRoots, _requiresExtensionActivation, _primitiveCache, prefixGenerator, enablementModel, _mcpRegistry, _allowedMcpServersService, workspacesService, _extensionService, _loggerService, _outputService, _telemetryService, _commandService, _instantiationService, _dialogService, _notificationService, _openerService, _samplingService, _elicitationService, _mcpSandboxService, environmentService) {
    super();
    this.definition = definition;
    this._requiresExtensionActivation = _requiresExtensionActivation;
    this._primitiveCache = _primitiveCache;
    this._mcpRegistry = _mcpRegistry;
    this._allowedMcpServersService = _allowedMcpServersService;
    this._extensionService = _extensionService;
    this._loggerService = _loggerService;
    this._outputService = _outputService;
    this._telemetryService = _telemetryService;
    this._commandService = _commandService;
    this._instantiationService = _instantiationService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._samplingService = _samplingService;
    this._elicitationService = _elicitationService;
    this._mcpSandboxService = _mcpSandboxService;
    /** Shared task manager that survives reconnections */
    this._taskManager = this._register(new McpTaskManager());
    this._connectionSequencer = new Sequencer();
    this._connection = this._register(disposableObservableValue(this, void 0));
    this.connection = this._connection;
    this.connectionState = derived((reader) => this._policyBlock.read(reader) ?? this._connection.read(reader)?.state.read(reader) ?? { state: McpConnectionState.Kind.Stopped });
    /** Cached tools are suppressed while the server is blocked by policy so they cannot be listed, referenced, or executed. */
    this._gatedTools = derived((reader) => this._policyBlock.read(reader) ? [] : this._tools.value.read(reader));
    /** Cached prompts are suppressed while the server is blocked by policy. */
    this._gatedPrompts = derived((reader) => this._policyBlock.read(reader) ? [] : this._prompts.value.read(reader));
    this.cacheState = derived((reader) => {
      const currentNonce = () => this._fullDefinitions.read(reader)?.server?.cacheNonce;
      const stateWhenServingFromCache = () => {
        if (this._tools.hasStaticDefinition(reader)) {
          return McpServerCacheState.Cached;
        }
        if (!this._tools.fromCache) {
          return McpServerCacheState.Unknown;
        }
        return currentNonce() === this._tools.fromCache.nonce ? McpServerCacheState.Cached : McpServerCacheState.Outdated;
      };
      const fromServer = this._tools.fromServerPromise.read(reader);
      const connectionState = this.connectionState.read(reader);
      const isIdle = McpConnectionState.canBeStarted(connectionState.state) || !fromServer;
      if (isIdle) {
        return stateWhenServingFromCache();
      }
      const fromServerResult = fromServer?.promiseResult.read(reader);
      if (!fromServerResult) {
        return this._tools.fromCache ? McpServerCacheState.RefreshingFromCached : McpServerCacheState.RefreshingFromUnknown;
      }
      if (fromServerResult.error) {
        return stateWhenServingFromCache();
      }
      return fromServerResult.data?.nonce === currentNonce() ? McpServerCacheState.Live : McpServerCacheState.Outdated;
    });
    this._lastModeDebugged = false;
    this._isQuietStart = false;
    this._isSandboxSuggestionDialogVisible = false;
    this._potentialSandboxBlocks = [];
    this._potentialSandboxBlockListener = this._register(new MutableDisposable());
    /** Count of running tool calls, used to detect if sampling is during an LM call */
    this.runningToolCalls = /* @__PURE__ */ new Set();
    this.collection = initialCollection;
    this._fullDefinitions = this._mcpRegistry.getServerDefinition(this.collection, this.definition);
    this.enablement = derived((r) => enablementModel.readEnabled(definition.id, r));
    this._policyEpoch = observableFromEvent(this, this._allowedMcpServersService.onDidChangeAllowedMcpServers, () => void 0);
    this._policyBlock = derived(this, (reader) => {
      this._policyEpoch.read(reader);
      const connection = this._connection.read(reader);
      if (connection) {
        return this._evaluatePolicy(this._identityFromLaunch(connection.launchDefinition));
      }
      const launch = this._fullDefinitions.read(reader).server?.launch;
      if (!launch) {
        return void 0;
      }
      const identity = this._identityFromLaunch(launch);
      if (McpServer._hasUnresolvedVariables(identity)) {
        return void 0;
      }
      return this._evaluatePolicy(identity);
    });
    this._register(autorun((reader) => {
      if (this._policyBlock.read(reader) && this._connection.read(void 0)) {
        this._connection.set(void 0, void 0);
      }
    }));
    this._loggerId = `mcpServer.${definition.id}`;
    this._logger = this._register(_loggerService.createLogger(this._loggerId, { hidden: true, name: `MCP: ${definition.label}` }));
    const that = this;
    this._register(this._instantiationService.createInstance(McpDevModeServerAttache, this, { get lastModeDebugged() {
      return that._lastModeDebugged;
    } }));
    this._register(toDisposable(() => _loggerService.deregisterLogger(this._loggerId)));
    const workspaces = explicitRoots ? observableValue(this, explicitRoots.map((uri) => ({ uri, name: basename(uri) }))) : observableFromEvent(
      this,
      workspacesService.onDidChangeWorkspaceFolders,
      () => workspacesService.getWorkspace().folders
    );
    const uriTransformer = environmentService.remoteAuthority ? createURITransformer(environmentService.remoteAuthority) : void 0;
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader)?.handler.read(reader);
      if (!cnx) {
        return;
      }
      cnx.roots = workspaces.read(reader).filter((w) => w.uri.authority === (initialCollection.remoteAuthority || "")).map((w) => {
        let uri = URI.from(uriTransformer?.transformIncoming(w.uri) ?? w.uri);
        if (uri.scheme === Schemas.file) {
          uri = URI.file(normalizeDriveLetter(uri.fsPath, true));
        }
        return { name: w.name, uri: uri.toString() };
      });
    }));
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader);
      const handler = cnx?.handler.read(reader);
      if (handler) {
        this._populateLiveData(handler, cnx?.definition.cacheNonce, reader.store);
      } else if (this._tools) {
        this.resetLiveData();
      }
    }));
    this._register(autorun((reader) => {
      const cnx = this._connection.read(reader);
      this._potentialSandboxBlockListener.value = cnx?.onPotentialSandboxBlock((block) => this.recordPotentialSandboxBlock(block));
    }));
    const staticMetadata = derived((reader) => {
      const def = this._fullDefinitions.read(reader).server;
      return def && def.cacheNonce !== this._tools.fromCache?.nonce ? def.staticMetadata : void 0;
    });
    this._serverMetadata = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => m ? this._toStoredMetadata(m?.serverInfo, m?.instructions) : void 0),
      (entry) => ({ serverName: entry.serverName, serverInstructions: entry.serverInstructions, serverIcons: entry.serverIcons }),
      (entry) => ({ serverName: entry?.serverName, serverInstructions: entry?.serverInstructions, icons: McpIcons.fromStored(entry?.serverIcons) }),
      void 0
    );
    const preferredName = derived((reader) => this._serverMetadata.value.read(reader)?.serverName || this.definition.label);
    const prefixRef = derivedDisposable((reader) => prefixGenerator.take(preferredName.read(reader)));
    const toolPrefix = prefixRef.map((ref) => ref.object);
    this._tools = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => {
        const tools = m?.tools?.filter((t) => t.availability === McpServerStaticToolAvailability.Initial).map((t) => t.definition);
        return tools?.length ? new ObservablePromise(this._getValidatedTools(tools)) : void 0;
      }).map((o, reader) => o?.promiseResult.read(reader)?.data),
      (entry) => entry.tools,
      (entry, reader) => entry.map((def) => this._instantiationService.createInstance(McpTool, this, toolPrefix.read(reader), def)).sort((a, b) => a.compare(b)),
      []
    );
    this._prompts = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      void 0,
      (entry) => entry.prompts || [],
      (entry) => entry.map((e) => new McpPrompt(this, e)),
      []
    );
    this._capabilities = new CachedPrimitive(
      this.definition.id,
      this._primitiveCache,
      staticMetadata.map((m) => m?.capabilities !== void 0 ? encodeCapabilities(m.capabilities) : void 0),
      (entry) => entry.capabilities,
      (entry) => entry,
      void 0
    );
    prefixRef.recomputeInitiallyAndOnChange(this._store);
  }
  /**
   * Helper function to call the function on the handler once it's online. The
   * connection started if it is not already.
   */
  static async callOn(server, fn, token = CancellationToken.None) {
    await server.start({ promptType: "all-untrusted" });
    let ranOnce = false;
    let d;
    const callPromise = new Promise((resolve, reject) => {
      d = autorun((reader) => {
        if (ranOnce) {
          return;
        }
        const connection = server.connection.read(reader);
        if (!connection) {
          const state = server.connectionState.read(reader);
          if (state.state === McpConnectionState.Kind.Error) {
            reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
          } else if (state.state === McpConnectionState.Kind.Stopped) {
            reject(new McpConnectionFailedError("MCP server has stopped"));
          }
          return;
        }
        const handler = connection.handler.read(reader);
        if (!handler) {
          const state = connection.state.read(reader);
          if (state.state === McpConnectionState.Kind.Error) {
            reject(new McpConnectionFailedError(`MCP server could not be started: ${state.message}`));
            return;
          } else if (state.state === McpConnectionState.Kind.Stopped) {
            reject(new McpConnectionFailedError("MCP server has stopped"));
            return;
          } else {
            return;
          }
        }
        resolve(fn(handler, connection));
        ranOnce = true;
      });
    });
    return raceCancellationError(callPromise, token).finally(() => d.dispose());
  }
  get capabilities() {
    return this._capabilities.value;
  }
  get tools() {
    return this._gatedTools;
  }
  get prompts() {
    return this._gatedPrompts;
  }
  get serverMetadata() {
    return this._serverMetadata.value;
  }
  get trustedAtNonce() {
    return this._primitiveCache.get(this.definition.id)?.trustedAtNonce;
  }
  set trustedAtNonce(nonce) {
    this._primitiveCache.store(this.definition.id, { trustedAtNonce: nonce });
  }
  get logger() {
    return this._logger;
  }
  readDefinitions() {
    return this._fullDefinitions;
  }
  showOutput(preserveFocus) {
    this._loggerService.setVisibility(this._loggerId, true);
    return this._outputService.showChannel(this._loggerId, preserveFocus);
  }
  resources(token) {
    const cts = new CancellationTokenSource(token);
    return new AsyncIterableProducer(async (emitter) => {
      await McpServer.callOn(this, async (handler) => {
        for await (const resource of handler.listResourcesIterable({}, cts.token)) {
          emitter.emitOne(resource.map((r) => new McpResource(this, r, McpIcons.fromParsed(this._parseIcons(r)))));
          if (cts.token.isCancellationRequested) {
            return;
          }
        }
      });
    }, () => cts.dispose(true));
  }
  resourceTemplates(token) {
    return McpServer.callOn(this, async (handler) => {
      const templates = await handler.listResourceTemplates({}, token);
      return templates.map((t) => new McpResourceTemplate(this, t, McpIcons.fromParsed(this._parseIcons(t))));
    }, token);
  }
  _identityFromLaunch(launch) {
    if (launch?.type === McpServerTransportType.HTTP) {
      return { name: this.definition.label, url: launch.uri.toString(true) };
    }
    if (launch?.type === McpServerTransportType.Stdio) {
      return typeof launch.command === "string" ? { name: this.definition.label, command: [launch.command, ...(launch.args ?? []).filter((arg) => typeof arg === "string")] } : { name: this.definition.label };
    }
    return { name: this.definition.label };
  }
  _evaluatePolicy(identity) {
    const allowed = this._allowedMcpServersService.isServerAllowed(identity);
    return allowed === true ? void 0 : { state: McpConnectionState.Kind.Error, message: allowed.value };
  }
  /**
   * Whether the URL/command fields matched by the policy still contain unresolved `${...}`
   * configuration variables. When they do, matching against allow/deny URL or command rules is
   * unreliable, so the block is deferred until the launch is resolved. The server name is used
   * verbatim and is not considered here.
   */
  static _hasUnresolvedVariables(identity) {
    const variableMarker = ConfigurationResolverExpression.VARIABLE_LHS;
    return !!identity.url?.includes(variableMarker) || !!identity.command?.some((arg) => arg.includes(variableMarker));
  }
  start({ interaction, autoTrustChanges, promptType, debug, errorOnUserInteraction } = {}) {
    interaction?.participants.set(this.definition.id, { s: "unknown" });
    return this._connectionSequencer.queue(async () => {
      const preStartBlock = this._policyBlock.get();
      if (preStartBlock) {
        return preStartBlock;
      }
      const activationEvent = mcpActivationEvent(this.collection.id.slice(extensionMcpCollectionPrefix.length));
      if (this._requiresExtensionActivation && !this._extensionService.activationEventIsDone(activationEvent)) {
        await this._extensionService.activateByEvent(activationEvent);
        await Promise.all(this._mcpRegistry.delegates.get().map((r) => r.waitForInitialProviderPromises()));
        if (this._store.isDisposed) {
          return { state: McpConnectionState.Kind.Stopped };
        }
      }
      let connection = this._connection.get();
      this._isQuietStart = !!errorOnUserInteraction;
      if (connection && McpConnectionState.canBeStarted(connection.state.get().state)) {
        connection.dispose();
        connection = void 0;
        this._connection.set(connection, void 0);
      }
      if (!connection) {
        this._lastModeDebugged = !!debug;
        const that = this;
        connection = await this._mcpRegistry.resolveConnection({
          interaction,
          autoTrustChanges,
          promptType,
          trustNonceBearer: {
            get trustedAtNonce() {
              return that.trustedAtNonce;
            },
            set trustedAtNonce(nonce) {
              that.trustedAtNonce = nonce;
            }
          },
          logger: this._logger,
          collectionRef: this.collection,
          definitionRef: this.definition,
          debug,
          errorOnUserInteraction,
          taskManager: this._taskManager
        });
        if (!connection) {
          return { state: McpConnectionState.Kind.Stopped };
        }
        if (this._store.isDisposed) {
          connection.dispose();
          return { state: McpConnectionState.Kind.Stopped };
        }
        this._connection.set(connection, void 0);
        if (connection.definition.devMode) {
          this.showOutput();
        }
      }
      const resolvedBlock = this._policyBlock.get();
      if (resolvedBlock) {
        this._connection.set(void 0, void 0);
        return resolvedBlock;
      }
      this._potentialSandboxBlocks.length = 0;
      const start = Date.now();
      let state = await connection.start({
        createMessageRequestHandler: (params, token) => this._samplingService.sample({
          isDuringToolCall: this.runningToolCalls.size > 0,
          server: this,
          params
        }, token).then((r) => r.sample),
        elicitationRequestHandler: async (req, token) => {
          const serverInfo = connection.handler.get()?.serverInfo;
          if (serverInfo) {
            this._telemetryService.publicLog2("mcp.elicitationRequested", {
              serverName: serverInfo.name,
              serverVersion: serverInfo.version
            });
          }
          const r = await this._elicitationService.elicit(this, Iterable.first(this.runningToolCalls), req, token || CancellationToken.None);
          r.dispose();
          return r.value;
        }
      });
      this._telemetryService.publicLog2("mcp/serverBootState", {
        state: McpConnectionState.toKindString(state.state),
        time: Date.now() - start
      });
      if (errorOnUserInteraction && state.state === McpConnectionState.Kind.Running) {
        let disposable;
        state = await new Promise((resolve, reject) => {
          disposable = autorun((reader) => {
            const handler = connection.handler.read(reader);
            if (handler) {
              resolve(state);
            }
            const s = connection.state.read(reader);
            if (s.state === McpConnectionState.Kind.Stopped && s.reason === "needs-user-interaction") {
              reject(new UserInteractionRequiredError("auth"));
            }
            if (!McpConnectionState.isRunning(s)) {
              resolve(s);
            }
          });
        }).finally(() => disposable.dispose());
      }
      if (state.state === McpConnectionState.Kind.Error) {
        let disposable;
        state = await new Promise((resolve, reject) => {
          disposable = autorun((reader) => {
            const cnx = this._connection.read(reader);
            const state2 = cnx?.state.read(reader);
            if (cnx && state2?.state === McpConnectionState.Kind.Error) {
              if (!this._isQuietStart) {
                this.showInteractiveError(cnx, state2, this._lastModeDebugged);
              } else {
                reject(new UserInteractionRequiredError("start"));
              }
            }
          });
        }).finally(() => disposable.dispose());
      }
      return state;
    }).finally(() => {
      interaction?.participants.set(this.definition.id, { s: "resolved" });
    });
  }
  showInteractiveError(cnx, error, debug) {
    if (cnx.definition.sandboxEnabled) {
      if (!this.showSandboxConfigSuggestionFromPotentialBlocks(cnx, this._potentialSandboxBlocks)) {
        this._notificationService.warn(localize("mcpServerError", "The MCP server {0} could not be started: {1}", cnx.definition.label, error.message));
      }
      return;
    }
    if (error.code === "ENOENT" && cnx.launchDefinition.type === McpServerTransportType.Stdio) {
      let docsLink;
      switch (cnx.launchDefinition.command) {
        case "uvx":
          docsLink = `https://aka.ms/vscode-mcp-install/uvx`;
          break;
        case "npx":
          docsLink = `https://aka.ms/vscode-mcp-install/npx`;
          break;
        case "dnx":
          docsLink = `https://aka.ms/vscode-mcp-install/dnx`;
          break;
        case "dotnet":
          docsLink = `https://aka.ms/vscode-mcp-install/dotnet`;
          break;
      }
      const options = [{
        label: localize("mcp.command.showOutput", "Show Output"),
        run: () => this.showOutput()
      }];
      if (cnx.definition.devMode?.debug?.type === "debugpy" && debug) {
        this._notificationService.prompt(Severity.Error, localize("mcpDebugPyHelp", 'The command "{0}" was not found. You can specify the path to debugpy in the `dev.debug.debugpyPath` option.', cnx.launchDefinition.command, cnx.definition.label), [...options, {
          label: localize("mcpViewDocs", "View Docs"),
          run: () => this._openerService.open(URI.parse("https://aka.ms/vscode-mcp-install/debugpy"))
        }]);
        return;
      }
      if (docsLink) {
        options.push({
          label: localize("mcpServerInstall", "Install {0}", cnx.launchDefinition.command),
          run: () => this._openerService.open(URI.parse(docsLink))
        });
      }
      this._notificationService.prompt(Severity.Error, localize("mcpServerNotFound", 'The command "{0}" needed to run {1} was not found.', cnx.launchDefinition.command, cnx.definition.label), options);
    } else {
      this._notificationService.warn(localize("mcpServerError", "The MCP server {0} could not be started: {1}", cnx.definition.label, error.message));
    }
  }
  showSandboxConfigSuggestionFromPotentialBlocks(cnx, potentialBlocks) {
    if (!cnx.definition.sandboxEnabled || !potentialBlocks.length || this._isSandboxSuggestionDialogVisible) {
      return false;
    }
    if (this._isQuietStart) {
      throw new UserInteractionRequiredError("sandbox-suggestion");
    }
    const existingSandboxConfig = this._fullDefinitions.get().collection?.sandbox;
    const suggestion = this._mcpSandboxService.getSandboxConfigSuggestionMessage(cnx.definition.label, potentialBlocks, existingSandboxConfig);
    if (!suggestion) {
      this._removePotentialSandboxBlocks(potentialBlocks);
      return false;
    }
    this._confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion);
    return true;
  }
  _confirmAndApplySandboxConfigSuggestion(cnx, potentialBlocks, suggestion) {
    const mcpResource = cnx.definition.presentation?.origin?.uri ?? this.collection.presentation?.origin;
    const configTarget = this._fullDefinitions.get().collection?.configTarget;
    this._isSandboxSuggestionDialogVisible = true;
    void this._dialogService.confirm({
      type: "warning",
      message: localize("mcpSandboxSuggestion.confirm.message", "Update sandbox configuration in mcp.json for {0}?", cnx.definition.label),
      detail: suggestion.message,
      primaryButton: localize("mcpSandboxSuggestion.confirm.yes", "Yes"),
      cancelButton: localize("mcpSandboxSuggestion.confirm.no", "No")
    }).then(async (result) => {
      if (!result.confirmed) {
        return;
      }
      if (!mcpResource || configTarget === void 0) {
        this._notificationService.warn(localize("mcpSandboxSuggestion.apply.unavailable", "Couldn't determine where to update sandbox configuration for {0}.", cnx.definition.label));
        return;
      }
      try {
        const updated = await this._mcpSandboxService.applySandboxConfigSuggestion(cnx.definition, mcpResource, configTarget, potentialBlocks, suggestion.sandboxConfig);
        if (updated) {
          this._removePotentialSandboxBlocks(potentialBlocks);
          this._notificationService.info(localize("mcpSandboxSuggestion.apply.success", "Updated sandbox configuration for {0} in mcp.json. Restart server.", cnx.definition.label));
        }
      } catch (e) {
        this._notificationService.error(localize("mcpSandboxSuggestion.apply.error", "Failed to update sandbox configuration for {0}: {1}", cnx.definition.label, e instanceof Error ? e.message : String(e)));
      }
    }).finally(() => {
      this._isSandboxSuggestionDialogVisible = false;
    });
  }
  recordPotentialSandboxBlock(block) {
    this._potentialSandboxBlocks.push(block);
    if (this._potentialSandboxBlocks.length > 200) {
      this._potentialSandboxBlocks.splice(0, this._potentialSandboxBlocks.length - 200);
    }
    const connection = this._connection.get();
    if (connection?.state.get().state === McpConnectionState.Kind.Running) {
      this.showSandboxConfigSuggestionFromPotentialBlocks(connection, this._potentialSandboxBlocks);
    }
  }
  _removePotentialSandboxBlocks(blocks) {
    if (!blocks.length || !this._potentialSandboxBlocks.length) {
      return;
    }
    const toRemove = new Set(blocks);
    this._potentialSandboxBlocks = this._potentialSandboxBlocks.filter((block) => !toRemove.has(block));
  }
  stop() {
    return this._connection.get()?.stop() || Promise.resolve();
  }
  /** Waits for any ongoing tools to be refreshed before resolving. */
  awaitToolRefresh() {
    return new Promise((resolve) => {
      autorunSelfDisposable((reader) => {
        const promise = this._tools.fromServerPromise.read(reader);
        const result = promise?.promiseResult.read(reader);
        if (result) {
          resolve();
        }
      });
    });
  }
  resetLiveData() {
    transaction((tx) => {
      this._tools.fromServerPromise.set(void 0, tx);
      this._prompts.fromServerPromise.set(void 0, tx);
    });
  }
  async _normalizeTool(originalTool) {
    const uiMeta = originalTool._meta?.ui;
    let visibility = McpToolVisibility.Model | McpToolVisibility.App;
    if (uiMeta?.visibility && Array.isArray(uiMeta.visibility)) {
      visibility &= 0;
      if (uiMeta.visibility.includes("model")) {
        visibility |= McpToolVisibility.Model;
      }
      if (uiMeta.visibility.includes("app")) {
        visibility |= McpToolVisibility.App;
      }
    }
    const tool = {
      ...originalTool,
      serverToolName: originalTool.name,
      _icons: this._parseIcons(originalTool),
      visibility,
      uiResourceUri: uiMeta?.resourceUri
    };
    if (!tool.description) {
      this._logger.warn(`Tool ${tool.name} does not have a description. Tools must be accurately described to be called`);
      tool.description = "<empty>";
    }
    if (toolInvalidCharRe.test(tool.name)) {
      this._logger.warn(`Tool ${JSON.stringify(tool.name)} is invalid. Tools names may only contain [a-z0-9_-]`);
      tool.name = tool.name.replace(toolInvalidCharRe, "_");
    }
    if (tool.inputSchema && !tool.inputSchema.properties) {
      tool.inputSchema = { ...tool.inputSchema, properties: {} };
    }
    let diagnostics = [];
    const toolJson = JSON.stringify(tool.inputSchema);
    try {
      const schemaUri = URI.parse("https://json-schema.org/draft-07/schema");
      diagnostics = await this._commandService.executeCommand("json.validate", schemaUri, toolJson) || [];
    } catch (e) {
    }
    if (!diagnostics.length) {
      return tool;
    }
    const tree = json.parseTree(toolJson);
    const messages = diagnostics.map((d) => {
      const node = json.findNodeAtOffset(tree, d.range[0].character);
      const path = node && `/${json.getNodePath(node).join("/")}`;
      return d.message + (path ? ` (at ${path})` : "");
    });
    return { error: messages };
  }
  async _getValidatedTools(tools) {
    let error = "";
    const validations = await Promise.all(tools.map((t) => this._normalizeTool(t)));
    const validated = [];
    for (const [i, result] of validations.entries()) {
      if ("error" in result) {
        error += localize("mcpBadSchema.tool", "Tool `{0}` has invalid JSON parameters:", tools[i].name) + "\n";
        for (const message of result.error) {
          error += `	- ${message}
`;
        }
        error += `	- Schema: ${JSON.stringify(tools[i].inputSchema)}

`;
      } else {
        validated.push(result);
      }
    }
    if (error) {
      this._logger.warn(`${tools.length - validated.length} tools have invalid JSON schemas and will be omitted`);
      warnInvalidTools(this._instantiationService, this.definition.label, error);
    }
    return validated;
  }
  /**
   * Parses incoming MCP icons and returns the resulting 'stored' record. Note
   * that this requires an active MCP server connection since we validate
   * against some of that connection's data. The icons may however be stored
   * and rehydrated later.
   */
  _parseIcons(icons) {
    const cnx = this._connection.get();
    if (!cnx) {
      return [];
    }
    return parseAndValidateMcpIcon(icons, cnx.launchDefinition, this._logger);
  }
  _setServerTools(nonce, toolsPromise, tx) {
    const toolPromiseSafe = toolsPromise.then(async (tools) => {
      this._logger.info(`Discovered ${tools.length} tools`);
      const data = await this._getValidatedTools(tools);
      this._primitiveCache.store(this.definition.id, { tools: data, nonce });
      return { data, nonce };
    });
    this._tools.fromServerPromise.set(new ObservablePromise(toolPromiseSafe), tx);
    return toolPromiseSafe;
  }
  _setServerPrompts(nonce, promptsPromise, tx) {
    const promptsPromiseSafe = promptsPromise.then((result) => {
      const data = result.map((prompt) => ({
        ...prompt,
        _icons: this._parseIcons(prompt)
      }));
      this._primitiveCache.store(this.definition.id, { prompts: data, nonce });
      return { data, nonce };
    });
    this._prompts.fromServerPromise.set(new ObservablePromise(promptsPromiseSafe), tx);
    return promptsPromiseSafe;
  }
  _toStoredMetadata(serverInfo, instructions) {
    return {
      serverName: serverInfo ? serverInfo.title || serverInfo.name : void 0,
      serverInstructions: instructions,
      serverIcons: serverInfo ? this._parseIcons(serverInfo) : void 0
    };
  }
  _setServerMetadata(nonce, { serverInfo, instructions, capabilities }, tx) {
    const serverMetadata = this._toStoredMetadata(serverInfo, instructions);
    this._serverMetadata.fromServerPromise.set(ObservablePromise.resolved({ nonce, data: serverMetadata }), tx);
    const capabilitiesEncoded = encodeCapabilities(capabilities);
    this._capabilities.fromServerPromise.set(ObservablePromise.resolved({ data: capabilitiesEncoded, nonce }), tx);
    this._primitiveCache.store(this.definition.id, { ...serverMetadata, nonce, capabilities: capabilitiesEncoded });
  }
  _populateLiveData(handler, cacheNonce, store) {
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    const updateTools = (tx) => {
      const toolPromise = handler.capabilities.tools ? handler.listTools({}, cts.token) : Promise.resolve([]);
      return this._setServerTools(cacheNonce, toolPromise, tx);
    };
    const updatePrompts = (tx) => {
      const promptsPromise = handler.capabilities.prompts ? handler.listPrompts({}, cts.token) : Promise.resolve([]);
      return this._setServerPrompts(cacheNonce, promptsPromise, tx);
    };
    store.add(handler.onDidChangeToolList(() => {
      this._logger.info("Tool list changed, refreshing tools...");
      updateTools(void 0);
    }));
    store.add(handler.onDidChangePromptList(() => {
      this._logger.info("Prompts list changed, refreshing prompts...");
      updatePrompts(void 0);
    }));
    transaction((tx) => {
      this._setServerMetadata(cacheNonce, { serverInfo: handler.serverInfo, instructions: handler.serverInstructions, capabilities: handler.capabilities }, tx);
      updatePrompts(tx);
      const toolUpdate = updateTools(tx);
      toolUpdate.then((tools) => {
        this._telemetryService.publicLog2("mcp/serverBoot", {
          supportsLogging: !!handler.capabilities.logging,
          supportsPrompts: !!handler.capabilities.prompts,
          supportsResources: !!handler.capabilities.resources,
          toolCount: tools.data.length,
          serverName: handler.serverInfo.name,
          serverVersion: handler.serverInfo.version
        });
      });
    });
  }
};
McpServer = __decorateClass([
  __decorateParam(7, IMcpRegistry),
  __decorateParam(8, IAllowedMcpServersService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, ILoggerService),
  __decorateParam(12, IOutputService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, ICommandService),
  __decorateParam(15, IInstantiationService),
  __decorateParam(16, IDialogService),
  __decorateParam(17, INotificationService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IMcpSamplingService),
  __decorateParam(20, IMcpElicitationService),
  __decorateParam(21, IMcpSandboxService),
  __decorateParam(22, IWorkbenchEnvironmentService)
], McpServer);
class McpPrompt {
  constructor(_server, _definition) {
    this._server = _server;
    this._definition = _definition;
    this.id = mcpPromptReplaceSpecialChars(this._server.definition.label + "." + _definition.name);
    this.name = _definition.name;
    this.title = _definition.title;
    this.description = _definition.description;
    this.arguments = _definition.arguments || [];
    this.icons = McpIcons.fromStored(this._definition._icons);
  }
  async resolve(args, token) {
    const result = await McpServer.callOn(this._server, (h) => h.getPrompt({ name: this._definition.name, arguments: args }, token), token);
    return result.messages;
  }
  async complete(argument, prefix, alreadyResolved, token) {
    const result = await McpServer.callOn(this._server, (h) => h.complete({
      ref: { type: "ref/prompt", name: this._definition.name },
      argument: { name: argument, value: prefix },
      context: { arguments: alreadyResolved }
    }, token), token);
    return result.completion.values;
  }
}
function encodeCapabilities(cap) {
  let out = 0;
  if (cap.logging) {
    out |= McpCapability.Logging;
  }
  if (cap.completions) {
    out |= McpCapability.Completions;
  }
  if (cap.prompts) {
    out |= McpCapability.Prompts;
    if (cap.prompts.listChanged) {
      out |= McpCapability.PromptsListChanged;
    }
  }
  if (cap.resources) {
    out |= McpCapability.Resources;
    if (cap.resources.subscribe) {
      out |= McpCapability.ResourcesSubscribe;
    }
    if (cap.resources.listChanged) {
      out |= McpCapability.ResourcesListChanged;
    }
  }
  if (cap.tools) {
    out |= McpCapability.Tools;
    if (cap.tools.listChanged) {
      out |= McpCapability.ToolsListChanged;
    }
  }
  return out;
}
let McpTool = class {
  constructor(_server, idPrefix, _definition, _elicitationService) {
    this._server = _server;
    this._definition = _definition;
    this._elicitationService = _elicitationService;
    this.referenceName = _definition.name.replaceAll(".", "_");
    this.id = (idPrefix + _definition.name).replaceAll(".", "_").slice(0, McpToolName.MaxLength);
    this.icons = McpIcons.fromStored(this._definition._icons);
    this.visibility = _definition.visibility ?? McpToolVisibility.Model | McpToolVisibility.App;
  }
  get definition() {
    return this._definition;
  }
  get uiResourceUri() {
    return this._definition.uiResourceUri;
  }
  async call(params, context, token) {
    if (context) {
      this._server.runningToolCalls.add(context);
    }
    try {
      return await this._callWithProgress(params, void 0, context, token);
    } finally {
      if (context) {
        this._server.runningToolCalls.delete(context);
      }
    }
  }
  async callWithProgress(params, progress, context, token) {
    if (context) {
      this._server.runningToolCalls.add(context);
    }
    try {
      return await this._callWithProgress(params, progress, context, token);
    } finally {
      if (context) {
        this._server.runningToolCalls.delete(context);
      }
    }
  }
  _callWithProgress(params, progress, context, token = CancellationToken.None, allowRetry = true) {
    const name = this._definition.serverToolName ?? this._definition.name;
    const progressToken = progress ? generateUuid() : void 0;
    const store = new DisposableStore();
    return McpServer.callOn(this._server, async (h) => {
      if (progress) {
        store.add(h.onDidReceiveProgressNotification((e) => {
          if (e.params.progressToken === progressToken) {
            progress.report({
              message: e.params.message,
              progress: e.params.total !== void 0 && e.params.progress !== void 0 ? e.params.progress / e.params.total : void 0
            });
          }
        }));
      }
      const meta = { progressToken };
      if (context?.chatSessionResource) {
        meta["vscode.conversationId"] = chatSessionResourceToId(context.chatSessionResource);
      }
      if (context?.chatRequestId) {
        meta["vscode.requestId"] = context.chatRequestId;
      }
      if (context?.traceparent) {
        meta["traceparent"] = context.traceparent;
        if (context.tracestate) {
          meta["tracestate"] = context.tracestate;
        }
      }
      const taskHint = this._definition.execution?.taskSupport;
      const serverSupportsTasksForTools = h.capabilities.tasks?.requests?.tools?.call !== void 0;
      const shouldUseTask = serverSupportsTasksForTools && (taskHint === "required" || taskHint === "optional");
      try {
        const result = await h.callTool({
          name,
          arguments: params,
          task: shouldUseTask ? {} : void 0,
          _meta: meta
        }, token, progress ? (message) => progress.report({ message }) : void 0);
        await this._server.awaitToolRefresh();
        return result;
      } catch (err) {
        if (err instanceof MpcResponseError && err.code === MCP.URL_ELICITATION_REQUIRED && allowRetry) {
          await this._handleElicitationErr(err, context, token);
          return this._callWithProgress(params, progress, context, token, false);
        }
        const state = this._server.connectionState.get();
        if (allowRetry && state.state === McpConnectionState.Kind.Error && state.shouldRetry) {
          return this._callWithProgress(params, progress, context, token, false);
        } else {
          throw err;
        }
      } finally {
        store.dispose();
      }
    }, token);
  }
  async _handleElicitationErr(err, context, token) {
    const elicitations = err.data?.elicitations;
    if (Array.isArray(elicitations) && elicitations.length > 0) {
      for (const elicitation of elicitations) {
        const elicitResult = await this._elicitationService.elicit(this._server, context, elicitation, token);
        try {
          if (elicitResult.value.action !== "accept") {
            throw err;
          }
          if (elicitResult.kind === ElicitationKind.URL) {
            await elicitResult.wait;
          }
        } finally {
          elicitResult.dispose();
        }
      }
    }
  }
  compare(other) {
    return this._definition.name.localeCompare(other.definition.name);
  }
};
McpTool = __decorateClass([
  __decorateParam(3, IMcpElicitationService)
], McpTool);
function warnInvalidTools(instaService, serverName, errorText) {
  instaService.invokeFunction((accessor) => {
    const notificationService = accessor.get(INotificationService);
    const editorService = accessor.get(IEditorService);
    notificationService.notify({
      severity: Severity.Warning,
      message: localize("mcpBadSchema", "MCP server `{0}` has tools with invalid parameters which will be omitted.", serverName),
      actions: {
        primary: [{
          class: void 0,
          enabled: true,
          id: "mcpBadSchema.show",
          tooltip: "",
          label: localize("mcpBadSchema.show", "Show"),
          run: () => {
            editorService.openEditor({
              resource: void 0,
              contents: errorText
            });
          }
        }]
      }
    });
  });
}
class McpResource {
  constructor(server, original, icons) {
    this.icons = icons;
    this.mcpUri = original.uri;
    this.title = original.title;
    this.uri = McpResourceURI.fromServer(server.definition, original.uri);
    this.name = original.name;
    this.description = original.description;
    this.mimeType = original.mimeType;
    this.sizeInBytes = original.size;
  }
}
class McpResourceTemplate {
  constructor(_server, _definition, icons) {
    this._server = _server;
    this._definition = _definition;
    this.icons = icons;
    this.name = _definition.name;
    this.description = _definition.description;
    this.mimeType = _definition.mimeType;
    this.title = _definition.title;
    this.template = UriTemplate.parse(_definition.uriTemplate);
  }
  resolveURI(vars) {
    const serverUri = this.template.resolve(vars);
    return McpResourceURI.fromServer(this._server.definition, serverUri);
  }
  async complete(templatePart, prefix, alreadyResolved, token) {
    const result = await McpServer.callOn(this._server, (h) => h.complete({
      ref: { type: "ref/resource", uri: this._definition.uriTemplate },
      argument: { name: templatePart, value: prefix },
      context: {
        arguments: mapValues(alreadyResolved, (v) => Array.isArray(v) ? v.join("/") : v)
      }
    }, token), token);
    return result.completion.values;
  }
}
export {
  McpPrefixGenerator,
  McpServer,
  McpServerMetadataCache,
  McpTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2VydmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyLCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IsIFNlcXVlbmNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEcml2ZUxldHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG1hcFZhbHVlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1blNlbGZEaXNwb3NhYmxlLCBkZXJpdmVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgZGlzcG9zYWJsZU9ic2VydmFibGVWYWx1ZSwgSURlcml2ZWRSZWFkZXIsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJVHJhbnNhY3Rpb24sIG9ic2VydmFibGVGcm9tRXZlbnQsIE9ic2VydmFibGVQcm9taXNlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlVVJJVHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlUcmFuc2Zvcm1lci5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVySWRlbnRpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL2FsbG93ZWRNY3BTZXJ2ZXJzLmpzJztcbmltcG9ydCB7IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWNwQWN0aXZhdGlvbkV2ZW50IH0gZnJvbSAnLi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1jcERldk1vZGVTZXJ2ZXJBdHRhY2hlIH0gZnJvbSAnLi9tY3BEZXZNb2RlLmpzJztcbmltcG9ydCB7IE1jcEljb25zLCBwYXJzZUFuZFZhbGlkYXRlTWNwSWNvbiwgU3RvcmVkTWNwSWNvbnMgfSBmcm9tICcuL21jcEljb25zLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2FuZGJveFNlcnZpY2UgfSBmcm9tICcuL21jcFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIH0gZnJvbSAnLi9tY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBNY3BUYXNrTWFuYWdlciB9IGZyb20gJy4vbWNwVGFza01hbmFnZXIuanMnO1xuaW1wb3J0IHsgRWxpY2l0YXRpb25LaW5kLCBleHRlbnNpb25NY3BDb2xsZWN0aW9uUHJlZml4LCBJTWNwRWxpY2l0YXRpb25TZXJ2aWNlLCBJTWNwSWNvbnMsIElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2ssIElNY3BQcm9tcHQsIElNY3BQcm9tcHRNZXNzYWdlLCBJTWNwUmVzb3VyY2UsIElNY3BSZXNvdXJjZVRlbXBsYXRlLCBJTWNwU2FtcGxpbmdTZXJ2aWNlLCBJTWNwU2VydmVyLCBJTWNwU2VydmVyQ29ubmVjdGlvbiwgSU1jcFNlcnZlclN0YXJ0T3B0cywgSU1jcFRvb2wsIElNY3BUb29sQ2FsbENvbnRleHQsIE1jcENhcGFiaWxpdHksIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uUmVmZXJlbmNlLCBNY3BDb25uZWN0aW9uRmFpbGVkRXJyb3IsIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwRGVmaW5pdGlvblJlZmVyZW5jZSwgbWNwUHJvbXB0UmVwbGFjZVNwZWNpYWxDaGFycywgTWNwUmVzb3VyY2VVUkksIE1jcFNlcnZlckNhY2hlU3RhdGUsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyU3RhdGljVG9vbEF2YWlsYWJpbGl0eSwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSwgTWNwVG9vbE5hbWUsIE1jcFRvb2xWaXNpYmlsaXR5LCBNcGNSZXNwb25zZUVycm9yLCBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUsIElFbmFibGVtZW50TW9kZWwgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTWNwQXBwcyB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2xBcHBzLmpzJztcbmltcG9ydCB7IFVyaVRlbXBsYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpVGVtcGxhdGUuanMnO1xuXG50eXBlIFNlcnZlckJvb3REYXRhID0ge1xuXHRzdXBwb3J0c0xvZ2dpbmc6IGJvb2xlYW47XG5cdHN1cHBvcnRzUHJvbXB0czogYm9vbGVhbjtcblx0c3VwcG9ydHNSZXNvdXJjZXM6IGJvb2xlYW47XG5cdHRvb2xDb3VudDogbnVtYmVyO1xuXHRzZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdHNlcnZlclZlcnNpb246IHN0cmluZztcbn07XG50eXBlIFNlcnZlckJvb3RDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0Y29tbWVudDogJ0RldGFpbHMgdGhlIGNhcGFiaWxpdGllcyBvZiB0aGUgTUNQIHNlcnZlcic7XG5cdHN1cHBvcnRzTG9nZ2luZzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIHNlcnZlciBzdXBwb3J0cyBsb2dnaW5nJyB9O1xuXHRzdXBwb3J0c1Byb21wdHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzZXJ2ZXIgc3VwcG9ydHMgcHJvbXB0cycgfTtcblx0c3VwcG9ydHNSZXNvdXJjZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzZXJ2ZXIgc3VwcG9ydHMgcmVzb3VyY2UnIH07XG5cdHRvb2xDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgdG9vbHMgdGhlIHNlcnZlciBhZHZlcnRpc2VzJyB9O1xuXHRzZXJ2ZXJOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIE1DUCBzZXJ2ZXInIH07XG5cdHNlcnZlclZlcnNpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdmVyc2lvbiBvZiB0aGUgTUNQIHNlcnZlcicgfTtcbn07XG5cbnR5cGUgRWxpY2l0YXRpb25UZWxlbWV0cnlEYXRhID0ge1xuXHRzZXJ2ZXJOYW1lOiBzdHJpbmc7XG5cdHNlcnZlclZlcnNpb246IHN0cmluZztcbn07XG5cbnR5cGUgRWxpY2l0YXRpb25UZWxlbWV0cnlDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0Y29tbWVudDogJ1RyaWdnZXJlZCB3aGVuIGVsaWN0YXRpb24gaXMgcmVxdWVzdGVkJztcblx0c2VydmVyTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSBNQ1Agc2VydmVyJyB9O1xuXHRzZXJ2ZXJWZXJzaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHZlcnNpb24gb2YgdGhlIE1DUCBzZXJ2ZXInIH07XG59O1xuXG5leHBvcnQgdHlwZSBNY3BTZXJ2ZXJJbnN0YWxsRGF0YSA9IHtcblx0c2VydmVyTmFtZTogc3RyaW5nO1xuXHRzb3VyY2U6ICdnYWxsZXJ5JyB8ICdsb2NhbCc7XG5cdHNjb3BlOiBzdHJpbmc7XG5cdHN1Y2Nlc3M6IGJvb2xlYW47XG5cdGVycm9yPzogc3RyaW5nO1xuXHRoYXNJbnB1dHM6IGJvb2xlYW47XG59O1xuXG5leHBvcnQgdHlwZSBNY3BTZXJ2ZXJJbnN0YWxsQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnY29ubm9yNDMxMic7XG5cdGNvbW1lbnQ6ICdNQ1Agc2VydmVyIGluc3RhbGxhdGlvbiBldmVudCB0cmFja2luZyc7XG5cdHNlcnZlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgTUNQIHNlcnZlciBiZWluZyBpbnN0YWxsZWQnIH07XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0luc3RhbGxhdGlvbiBzb3VyY2UgKGdhbGxlcnkgb3IgbG9jYWwpJyB9O1xuXHRzY29wZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0luc3RhbGxhdGlvbiBzY29wZSAodXNlciwgd29ya3NwYWNlLCBldGMuKScgfTtcblx0c3VjY2VzczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgaW5zdGFsbGF0aW9uIHN1Y2NlZWRlZCcgfTtcblx0ZXJyb3I/OiB7IGNsYXNzaWZpY2F0aW9uOiAnQ2FsbHN0YWNrT3JFeGNlcHRpb24nOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXJyb3IgbWVzc2FnZSBpZiBpbnN0YWxsYXRpb24gZmFpbGVkJyB9O1xuXHRoYXNJbnB1dHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBzZXJ2ZXIgcmVxdWlyZXMgaW5wdXQgY29uZmlndXJhdGlvbicgfTtcbn07XG5cbnR5cGUgU2VydmVyQm9vdFN0YXRlID0ge1xuXHRzdGF0ZTogc3RyaW5nO1xuXHR0aW1lOiBudW1iZXI7XG59O1xudHlwZSBTZXJ2ZXJCb290U3RhdGVDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdjb25ub3I0MzEyJztcblx0Y29tbWVudDogJ0RldGFpbHMgdGhlIGNhcGFiaWxpdGllcyBvZiB0aGUgTUNQIHNlcnZlcic7XG5cdHN0YXRlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNlcnZlciBvdXRjb21lJyB9O1xuXHR0aW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnRHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzIHRvIHJlYWNoIHRoYXQgc3RhdGUnIH07XG59O1xuXG50eXBlIFN0b3JlZE1jcFByb21wdCA9IE1DUC5Qcm9tcHQgJiB7IF9pY29uczogU3RvcmVkTWNwSWNvbnMgfTtcblxuaW50ZXJmYWNlIElUb29sQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2VydmVySW5zdHJ1Y3Rpb25zOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNlcnZlckljb25zOiBTdG9yZWRNY3BJY29ucztcblxuXHRyZWFkb25seSB0cnVzdGVkQXROb25jZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBDYWNoZWQgdG9vbHMgc28gd2UgY2FuIHNob3cgd2hhdCdzIGF2YWlsYWJsZSBiZWZvcmUgaXQncyBzdGFydGVkICovXG5cdHJlYWRvbmx5IHRvb2xzOiByZWFkb25seSBWYWxpZGF0ZWRNY3BUb29sW107XG5cdC8qKiBDYWNoZWQgcHJvbXB0cyAqL1xuXHRyZWFkb25seSBwcm9tcHRzOiByZWFkb25seSBTdG9yZWRNY3BQcm9tcHRbXSB8IHVuZGVmaW5lZDtcblx0LyoqIENhY2hlZCBjYXBhYmlsaXRpZXMgKi9cblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzOiBNY3BDYXBhYmlsaXR5IHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBlbXB0eVRvb2xFbnRyeTogSVRvb2xDYWNoZUVudHJ5ID0ge1xuXHRzZXJ2ZXJOYW1lOiB1bmRlZmluZWQsXG5cdHNlcnZlckljb25zOiBbXSxcblx0c2VydmVySW5zdHJ1Y3Rpb25zOiB1bmRlZmluZWQsXG5cdHRydXN0ZWRBdE5vbmNlOiB1bmRlZmluZWQsXG5cdG5vbmNlOiB1bmRlZmluZWQsXG5cdHRvb2xzOiBbXSxcblx0cHJvbXB0czogdW5kZWZpbmVkLFxuXHRjYXBhYmlsaXRpZXM6IHVuZGVmaW5lZCxcbn07XG5cbmludGVyZmFjZSBJU2VydmVyQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IE1jcFNlcnZlckRlZmluaXRpb24uU2VyaWFsaXplZFtdO1xufVxuXG5jb25zdCB0b29sSW52YWxpZENoYXJSZSA9IC9bXmEtejAtOV8tXS9naTtcblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlck1ldGFkYXRhQ2FjaGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIElUb29sQ2FjaGVFbnRyeT4oMTI4KTtcblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2ZXJzID0gbmV3IE1hcDwvKiBjb2xsZWN0aW9uIElEICovc3RyaW5nLCBJU2VydmVyQ2FjaGVFbnRyeT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzY29wZTogU3RvcmFnZVNjb3BlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHR5cGUgU3RvcmVkVHlwZSA9IHtcblx0XHRcdGV4dGVuc2lvblNlcnZlcnM6IFtzdHJpbmcsIElTZXJ2ZXJDYWNoZUVudHJ5XVtdO1xuXHRcdFx0c2VydmVyVG9vbHM6IFtzdHJpbmcsIElUb29sQ2FjaGVFbnRyeV1bXTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmFnZUtleSA9ICdtY3BUb29sQ2FjaGUnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kaWRDaGFuZ2UpIHtcblx0XHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoc3RvcmFnZUtleSwge1xuXHRcdFx0XHRcdGV4dGVuc2lvblNlcnZlcnM6IFsuLi50aGlzLmV4dGVuc2lvblNlcnZlcnNdLFxuXHRcdFx0XHRcdHNlcnZlclRvb2xzOiB0aGlzLmNhY2hlLnRvSlNPTigpLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBTdG9yZWRUeXBlLCBzY29wZSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0dGhpcy5kaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVkOiBTdG9yZWRUeXBlIHwgdW5kZWZpbmVkID0gc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0KHN0b3JhZ2VLZXksIHNjb3BlKTtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmVycyA9IG5ldyBNYXAoY2FjaGVkPy5leHRlbnNpb25TZXJ2ZXJzID8/IFtdKTtcblx0XHRcdGNhY2hlZD8uc2VydmVyVG9vbHM/LmZvckVhY2goKFtrLCB2XSkgPT4gdGhpcy5jYWNoZS5zZXQoaywgdikpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlZFxuXHRcdH1cblx0fVxuXG5cdC8qKiBSZXNldHMgdGhlIGNhY2hlIGZvciBwcmltaXRpdmVzIGFuZCBleHRlbnNpb24gc2VydmVycyAqL1xuXHRyZXNldCgpIHtcblx0XHR0aGlzLmNhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2ZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5kaWRDaGFuZ2UgPSB0cnVlO1xuXHR9XG5cblx0LyoqIEdldHMgY2FjaGVkIHByaW1pdGl2ZXMgZm9yIGEgc2VydmVyICh1c2VkIGJlZm9yZSBhIHNlcnZlciBpcyBydW5uaW5nKSAqL1xuXHRnZXQoZGVmaW5pdGlvbklkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5jYWNoZS5nZXQoZGVmaW5pdGlvbklkKTtcblx0fVxuXG5cdC8qKiBTZXRzIGNhY2hlZCBwcmltaXRpdmVzIGZvciBhIHNlcnZlciAqL1xuXHRzdG9yZShkZWZpbml0aW9uSWQ6IHN0cmluZywgZW50cnk6IFBhcnRpYWw8SVRvb2xDYWNoZUVudHJ5Pik6IHZvaWQge1xuXHRcdGNvbnN0IHByZXYgPSB0aGlzLmdldChkZWZpbml0aW9uSWQpIHx8IGVtcHR5VG9vbEVudHJ5O1xuXHRcdHRoaXMuY2FjaGUuc2V0KGRlZmluaXRpb25JZCwgeyAuLi5wcmV2LCAuLi5lbnRyeSB9KTtcblx0XHR0aGlzLmRpZENoYW5nZSA9IHRydWU7XG5cdH1cblxuXHQvKiogR2V0cyBjYWNoZWQgc2VydmVycyBmb3IgYSBjb2xsZWN0aW9uICh1c2VkIGZvciBleHRlbnNpb25zLCBiZWZvcmUgdGhlIGV4dGVuc2lvbiBhY3RpdmF0ZXMpICovXG5cdGdldFNlcnZlcnMoY29sbGVjdGlvbklkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25TZXJ2ZXJzLmdldChjb2xsZWN0aW9uSWQpO1xuXHR9XG5cblx0LyoqIFNldHMgY2FjaGVkIHNlcnZlcnMgZm9yIGEgY29sbGVjdGlvbiAqL1xuXHRzdG9yZVNlcnZlcnMoY29sbGVjdGlvbklkOiBzdHJpbmcsIGVudHJ5OiBJU2VydmVyQ2FjaGVFbnRyeSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2ZXJzLnNldChjb2xsZWN0aW9uSWQsIGVudHJ5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5leHRlbnNpb25TZXJ2ZXJzLmRlbGV0ZShjb2xsZWN0aW9uSWQpO1xuXHRcdH1cblx0XHR0aGlzLmRpZENoYW5nZSA9IHRydWU7XG5cdH1cbn1cblxuLyoqXG4gKiBTaGFyZWQgYWNyb3NzIGFsbCB7QGxpbmsgTWNwU2VydmVyfXMuIEVhY2ggc2VydmVyIGB0YWtlYHMgdGhlIG5hbWUgaXQgd2FudHNcbiAqIHRvIGJhc2UgaXRzIHRvb2wgcHJlZml4IG9uIChhbm5vdW5jZWQgYHNlcnZlckluZm8udGl0bGVgL2BuYW1lYCB3aGVuIGtub3duLFxuICogb3RoZXJ3aXNlIHRoZSBtY3AuanNvbiBrZXkpIGFuZCBnZXRzIGJhY2sgYSBzdGFibGUsIGNvbGxpc2lvbi1yZXNvbHZlZCBwcmVmaXhcbiAqIG9ic2VydmFibGUuIFdoZW4gYSBzZXJ2ZXIncyBwcmVmZXJyZWQgbmFtZSBjaGFuZ2VzIChlLmcuIGFmdGVyIHRoZSBsaXZlXG4gKiBgc2VydmVySW5mb2AgYXJyaXZlcyksIGl0IHNpbXBseSB0YWtlcyBhZ2FpbiBhbmQgZGlzcG9zZXMgdGhlIHByZXZpb3VzXG4gKiByZWZlcmVuY2U7IG90aGVyIHNlcnZlcnMgdGhhdCBzaGFyZSB0aGUgbmFtZSBrZWVwIHRoZSBzdWZmaXggdGhleSB3ZXJlXG4gKiBhbHJlYWR5IGFzc2lnbmVkLiBTZWUgIzI5OTc0OS5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFByZWZpeEdlbmVyYXRvciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1Y2tldHMgPSBuZXcgTWFwPHN0cmluZywgeyB1c2VkSW5kZXhlczogU2V0PG51bWJlcj47IHNpemU6IG51bWJlciB9PigpO1xuXG5cdHRha2UobmFtZTogc3RyaW5nKTogSVJlZmVyZW5jZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzYWZlTmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXmEtejAtOV8uLV0rL2csICdfJykuc2xpY2UoMCwgTWNwVG9vbE5hbWUuTWF4UHJlZml4TGVuIC0gTWNwVG9vbE5hbWUuUHJlZml4Lmxlbmd0aCAtIDEpO1xuXHRcdGxldCBidWNrZXQgPSB0aGlzLl9idWNrZXRzLmdldChzYWZlTmFtZSk7XG5cdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdGJ1Y2tldCA9IHsgdXNlZEluZGV4ZXM6IG5ldyBTZXQoKSwgc2l6ZTogMCB9O1xuXHRcdFx0dGhpcy5fYnVja2V0cy5zZXQoc2FmZU5hbWUsIGJ1Y2tldCk7XG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4ID0gMTtcblx0XHR3aGlsZSAoYnVja2V0LnVzZWRJbmRleGVzLmhhcyhpbmRleCkpIHtcblx0XHRcdGluZGV4Kys7XG5cdFx0fVxuXHRcdGJ1Y2tldC51c2VkSW5kZXhlcy5hZGQoaW5kZXgpO1xuXHRcdGJ1Y2tldC5zaXplKys7XG5cblx0XHQvLyBUcmltIHNhZmVOYW1lIGZvciB0aGlzIG91dHB1dCBpZiBhIG11bHRpLWRpZ2l0IHN1ZmZpeCB3b3VsZCBwdXNoIHVzIHBhc3Rcblx0XHQvLyBNYXhQcmVmaXhMZW4uIFRoZSBidWNrZXQgaXMga2V5ZWQgb24gdGhlIHVuLXRyaW1tZWQgc2FmZU5hbWUgc28gY29sbGlzaW9uc1xuXHRcdC8vIGFyZSBzdGlsbCBkZXRlY3RlZCBjb25zaXN0ZW50bHkgYWNyb3NzIGluZGV4ZXMuXG5cdFx0Y29uc3Qgc3VmZml4ID0gKGluZGV4ID09PSAxID8gJycgOiBTdHJpbmcoaW5kZXgpKSArICdfJztcblx0XHRjb25zdCBtYXhOYW1lTGVuID0gTWNwVG9vbE5hbWUuTWF4UHJlZml4TGVuIC0gTWNwVG9vbE5hbWUuUHJlZml4Lmxlbmd0aCAtIHN1ZmZpeC5sZW5ndGg7XG5cdFx0Y29uc3QgcHJlZml4ID0gTWNwVG9vbE5hbWUuUHJlZml4ICsgc2FmZU5hbWUuc2xpY2UoMCwgbWF4TmFtZUxlbikgKyBzdWZmaXg7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b2JqZWN0OiBwcmVmaXgsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGJ1Y2tldCEudXNlZEluZGV4ZXMuZGVsZXRlKGluZGV4KTtcblx0XHRcdFx0YnVja2V0IS5zaXplLS07XG5cdFx0XHRcdGlmIChidWNrZXQhLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9idWNrZXRzLmRlbGV0ZShzYWZlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fTtcblx0fVxufVxuXG50eXBlIFZhbGlkYXRlZE1jcFRvb2wgPSBNQ1AuVG9vbCAmIHtcblx0X2ljb25zOiBTdG9yZWRNY3BJY29ucztcblxuXHQvKipcblx0ICogVG9vbCBuYW1lIGFzIHB1Ymxpc2hlZCBieSB0aGUgTUNQIHNlcnZlci4gVGhpcyBtYXlcblx0ICogYmUgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBpbiB7QGxpbmsgZGVmaW5pdGlvbn0gZHVlIHRvIG5hbWUgbm9ybWFsaXphdGlvblxuXHQgKiBpbiB7QGxpbmsgTWNwU2VydmVyLl9nZXRWYWxpZGF0ZWRUb29sc30uXG5cdCAqL1xuXHRzZXJ2ZXJUb29sTmFtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBWaXNpYmlsaXR5IG9mIHRoZSB0b29sLCBwYXJzZWQgZnJvbSBgX21ldGEudWkudmlzaWJpbGl0eWAuXG5cdCAqIERlZmF1bHRzIHRvIE1vZGVsIHwgQXBwIGlmIG5vdCBzcGVjaWZpZWQuXG5cdCAqL1xuXHR2aXNpYmlsaXR5OiBNY3BUb29sVmlzaWJpbGl0eTtcblxuXHQvKipcblx0ICogVUkgcmVzb3VyY2UgVVJJIGlmIHRoaXMgdG9vbCBoYXMgYW4gYXNzb2NpYXRlZCBNQ1AgQXBwIFVJLlxuXHQgKiBQYXJzZWQgZnJvbSBgX21ldGEudWkucmVzb3VyY2VVcmlgLlxuXHQgKi9cblx0dWlSZXNvdXJjZVVyaT86IHN0cmluZztcbn07XG5cbmludGVyZmFjZSBTdG9yZWRTZXJ2ZXJNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2VydmVySW5zdHJ1Y3Rpb25zOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNlcnZlckljb25zOiBTdG9yZWRNY3BJY29ucyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIFNlcnZlck1ldGFkYXRhIHtcblx0cmVhZG9ubHkgc2VydmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzZXJ2ZXJJbnN0cnVjdGlvbnM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWNvbnM6IElNY3BJY29ucztcbn1cblxuY2xhc3MgQ2FjaGVkUHJpbWl0aXZlPFQsIEM+IHtcblx0LyoqXG5cdCAqIEBwYXJhbSBfZGVmaW5pdGlvbklkIFNlcnZlciBkZWZpbml0aW9uIElEXG5cdCAqIEBwYXJhbSBfY2FjaGUgTWV0YWRhdGEgY2FjaGUgaW5zdGFuY2Vcblx0ICogQHBhcmFtIF9mcm9tU3RhdGljRGVmaW5pdGlvbiBTdGF0aWMgZGVmaW5pdGlvbiB0aGF0IGNhbWUgd2l0aCB0aGUgc2VydmVyLlxuXHQgKiBUaGlzIHNob3VsZCBPTkxZIGhhdmUgYSB2YWx1ZSBpZiBpdCBzaG91bGQgYmUgdXNlZCBpbnN0ZWFkIG9mIHdoYXRldmVyXG5cdCAqIGlzIGN1cnJlbnRseSBpbiB0aGUgY2FjaGUuXG5cdCAqIEBwYXJhbSBfZnJvbUNhY2hlIFB1bGwgdGhlIHZhbHVlIGZyb20gdGhlIGNhY2hlIGVudHJ5LlxuXHQgKiBAcGFyYW0gX3RvVCBUcmFuc2Zvcm0gdGhlIHZhbHVlIHRvIHRoZSBvYnNlcnZhYmxlIHR5cGUuXG5cdCAqIEBwYXJhbSBkZWZhdWx0VmFsdWUgRGVmYXVsdCB2YWx1ZSBpZiBubyBjYWNoZSBlbnRyeS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlZmluaXRpb25JZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlOiBNY3BTZXJ2ZXJNZXRhZGF0YUNhY2hlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Zyb21TdGF0aWNEZWZpbml0aW9uOiBJT2JzZXJ2YWJsZTxDIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mcm9tQ2FjaGU6IChlbnRyeTogSVRvb2xDYWNoZUVudHJ5KSA9PiBDLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RvVDogKHZhbHVlczogQywgcmVhZGVyOiBJRGVyaXZlZFJlYWRlcjx2b2lkPikgPT4gVCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogQyxcblx0KSB7IH1cblxuXHRwdWJsaWMgZ2V0IGZyb21DYWNoZSgpOiB7IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGRhdGE6IEMgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYyA9IHRoaXMuX2NhY2hlLmdldCh0aGlzLl9kZWZpbml0aW9uSWQpO1xuXHRcdHJldHVybiBjID8geyBkYXRhOiB0aGlzLl9mcm9tQ2FjaGUoYyksIG5vbmNlOiBjLm5vbmNlIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgaGFzU3RhdGljRGVmaW5pdGlvbihyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9mcm9tU3RhdGljRGVmaW5pdGlvbj8ucmVhZChyZWFkZXIpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGZyb21TZXJ2ZXJQcm9taXNlID0gb2JzZXJ2YWJsZVZhbHVlPE9ic2VydmFibGVQcm9taXNlPHtcblx0XHRyZWFkb25seSBkYXRhOiBDO1xuXHRcdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdH0+IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZnJvbVNlcnZlciA9IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuZnJvbVNlcnZlclByb21pc2UucmVhZChyZWFkZXIpPy5wcm9taXNlUmVzdWx0LnJlYWQocmVhZGVyKT8uZGF0YSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHZhbHVlOiBJT2JzZXJ2YWJsZTxUPiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRjb25zdCBzZXJ2ZXJUb29scyA9IHRoaXMuZnJvbVNlcnZlci5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbnMgPSBzZXJ2ZXJUb29scz8uZGF0YSA/PyB0aGlzLl9mcm9tU3RhdGljRGVmaW5pdGlvbj8ucmVhZChyZWFkZXIpID8/IHRoaXMuZnJvbUNhY2hlPy5kYXRhID8/IHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdHJldHVybiB0aGlzLl90b1QoZGVmaW5pdGlvbnMsIHJlYWRlcik7XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BTZXJ2ZXIge1xuXHQvKiogU2hhcmVkIHRhc2sgbWFuYWdlciB0aGF0IHN1cnZpdmVzIHJlY29ubmVjdGlvbnMgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdGFza01hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTWNwVGFza01hbmFnZXIoKSk7XG5cblx0LyoqXG5cdCAqIEhlbHBlciBmdW5jdGlvbiB0byBjYWxsIHRoZSBmdW5jdGlvbiBvbiB0aGUgaGFuZGxlciBvbmNlIGl0J3Mgb25saW5lLiBUaGVcblx0ICogY29ubmVjdGlvbiBzdGFydGVkIGlmIGl0IGlzIG5vdCBhbHJlYWR5LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBhc3luYyBjYWxsT248Uj4oc2VydmVyOiBJTWNwU2VydmVyLCBmbjogKGhhbmRsZXI6IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyLCBjb25uZWN0aW9uOiBJTWNwU2VydmVyQ29ubmVjdGlvbikgPT4gUHJvbWlzZTxSPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8Uj4ge1xuXHRcdGF3YWl0IHNlcnZlci5zdGFydCh7IHByb21wdFR5cGU6ICdhbGwtdW50cnVzdGVkJyB9KTsgLy8gaWRlbXBvdGVudFxuXG5cdFx0bGV0IHJhbk9uY2UgPSBmYWxzZTtcblx0XHRsZXQgZDogSURpc3Bvc2FibGU7XG5cblx0XHRjb25zdCBjYWxsUHJvbWlzZSA9IG5ldyBQcm9taXNlPFI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0ZCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0aWYgKHJhbk9uY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb25uZWN0aW9uID0gc2VydmVyLmNvbm5lY3Rpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHQvLyBObyBsaXZlIGNvbm5lY3Rpb246IHRoZSBzZXJ2ZXIgbWF5IGJlIGJsb2NrZWQgYnkgcG9saWN5IChpdHMgY29ubmVjdGlvbiBpcyB0b3JuXG5cdFx0XHRcdFx0Ly8gZG93biB3aGlsZSBibG9ja2VkKSBvciBzdG9wcGVkLiBTdXJmYWNlIHRoZSB0ZXJtaW5hbCBzdGF0ZSBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yZXZlci5cblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZlci5jb25uZWN0aW9uU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IpIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgTWNwQ29ubmVjdGlvbkZhaWxlZEVycm9yKGBNQ1Agc2VydmVyIGNvdWxkIG5vdCBiZSBzdGFydGVkOiAke3N0YXRlLm1lc3NhZ2V9YCkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQpIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgTWNwQ29ubmVjdGlvbkZhaWxlZEVycm9yKCdNQ1Agc2VydmVyIGhhcyBzdG9wcGVkJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gY29ubmVjdGlvbi5oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjb25uZWN0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IE1jcENvbm5lY3Rpb25GYWlsZWRFcnJvcihgTUNQIHNlcnZlciBjb3VsZCBub3QgYmUgc3RhcnRlZDogJHtzdGF0ZS5tZXNzYWdlfWApKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IE1jcENvbm5lY3Rpb25GYWlsZWRFcnJvcignTUNQIHNlcnZlciBoYXMgc3RvcHBlZCcpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8ga2VlcCB3YWl0aW5nIGZvciBoYW5kbGVyXG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzb2x2ZShmbihoYW5kbGVyLCBjb25uZWN0aW9uKSk7XG5cdFx0XHRcdHJhbk9uY2UgPSB0cnVlOyAvLyBhZ2dyZXNzaXZlIHByZXZlbnQgbXVsdGlwbGUgcmFjZXkgY2FsbHMsIGRvbid0IGRpc3Bvc2UgYmVjYXVzZSBhdXRvcnVuIGlzIHN5bmNcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJhY2VDYW5jZWxsYXRpb25FcnJvcihjYWxsUHJvbWlzZSwgdG9rZW4pLmZpbmFsbHkoKCkgPT4gZC5kaXNwb3NlKCkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25SZWZlcmVuY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlPElNY3BTZXJ2ZXJDb25uZWN0aW9uIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cblx0LyoqXG5cdCAqIFJlYWN0aXZlbHkgZXZhbHVhdGVzIHRoZSBgY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnNgIC8gYGNoYXQubWNwLmRlbmllZFNlcnZlcnNgIHBvbGljeSBhZ2FpbnN0XG5cdCAqIHRoaXMgc2VydmVyJ3MgaWRlbnRpdHkuIEhvbGRzIGFuIGVycm9yIHN0YXRlIHdoaWxlIGJsb2NrZWQsIGB1bmRlZmluZWRgIHdoaWxlIGFsbG93ZWQuXG5cdCAqXG5cdCAqIEJlaW5nIGEgZGVyaXZlZCwgaXQgcmVjb21wdXRlcyB3aGVuZXZlciB0aGUgcG9saWN5IGNoYW5nZXMgKHZpYSB7QGxpbmsgX3BvbGljeUVwb2NofSksIHRoZVxuXHQgKiBzZXJ2ZXIgZGVmaW5pdGlvbiBjaGFuZ2VzLCBvciBhIGNvbm5lY3Rpb24gcmVzb2x2ZXMgXHUyMDE0IHNvIGl0IGFsd2F5cyBldmFsdWF0ZXMgdGhlICpyZXNvbHZlZCpcblx0ICogbGF1bmNoIG9mIGEgbGl2ZSBjb25uZWN0aW9uIGFuZCBmYWxscyBiYWNrIHRvIHRoZSBkZWZpbml0aW9uIG90aGVyd2lzZS4gVGhpcyBhbHNvIG1lYW5zIGFcblx0ICogYmxvY2tlZCBzZXJ2ZXIgc3VyZmFjZXMgdGhlIGJsb2NrIGF0IHJlc3QgKGJlZm9yZSBhbnkgc3RhcnQpLCB3aGljaCBoaWRlcyBpdHMgY2FjaGVkIHRvb2xzXG5cdCAqIGFuZCBwcm9tcHRzIGFuZCBsZXRzIHRoZSBVSSBzaG93IHRoZSByZWFzb24uXG5cdCAqXG5cdCAqIEluaXRpYWxpemVkIGluIHRoZSBjb25zdHJ1Y3RvciBiZWNhdXNlIGl0IGRlcGVuZHMgb24gdGhlIGluamVjdGVkIGFsbG93ZWQtc2VydmVycyBzZXJ2aWNlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcG9saWN5RXBvY2g6IElPYnNlcnZhYmxlPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb2xpY3lCbG9jazogSU9ic2VydmFibGU8TWNwQ29ubmVjdGlvblN0YXRlLkVycm9yIHwgdW5kZWZpbmVkPjtcblx0cHVibGljIHJlYWRvbmx5IGNvbm5lY3Rpb25TdGF0ZTogSU9ic2VydmFibGU8TWNwQ29ubmVjdGlvblN0YXRlPiA9IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3BvbGljeUJsb2NrLnJlYWQocmVhZGVyKSA/PyB0aGlzLl9jb25uZWN0aW9uLnJlYWQocmVhZGVyKT8uc3RhdGUucmVhZChyZWFkZXIpID8/IHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSk7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhYmlsaXRpZXM6IENhY2hlZFByaW1pdGl2ZTxudW1iZXIgfCB1bmRlZmluZWQsIG51bWJlciB8IHVuZGVmaW5lZD47XG5cdHB1YmxpYyBnZXQgY2FwYWJpbGl0aWVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9jYXBhYmlsaXRpZXMudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sczogQ2FjaGVkUHJpbWl0aXZlPHJlYWRvbmx5IElNY3BUb29sW10sIHJlYWRvbmx5IFZhbGlkYXRlZE1jcFRvb2xbXT47XG5cdC8qKiBDYWNoZWQgdG9vbHMgYXJlIHN1cHByZXNzZWQgd2hpbGUgdGhlIHNlcnZlciBpcyBibG9ja2VkIGJ5IHBvbGljeSBzbyB0aGV5IGNhbm5vdCBiZSBsaXN0ZWQsIHJlZmVyZW5jZWQsIG9yIGV4ZWN1dGVkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRlZFRvb2xzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJTWNwVG9vbFtdPiA9IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3BvbGljeUJsb2NrLnJlYWQocmVhZGVyKSA/IFtdIDogdGhpcy5fdG9vbHMudmFsdWUucmVhZChyZWFkZXIpKTtcblx0cHVibGljIGdldCB0b29scygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2F0ZWRUb29scztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdHM6IENhY2hlZFByaW1pdGl2ZTxyZWFkb25seSBJTWNwUHJvbXB0W10sIHJlYWRvbmx5IFN0b3JlZE1jcFByb21wdFtdPjtcblx0LyoqIENhY2hlZCBwcm9tcHRzIGFyZSBzdXBwcmVzc2VkIHdoaWxlIHRoZSBzZXJ2ZXIgaXMgYmxvY2tlZCBieSBwb2xpY3kuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dhdGVkUHJvbXB0czogSU9ic2VydmFibGU8cmVhZG9ubHkgSU1jcFByb21wdFtdPiA9IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3BvbGljeUJsb2NrLnJlYWQocmVhZGVyKSA/IFtdIDogdGhpcy5fcHJvbXB0cy52YWx1ZS5yZWFkKHJlYWRlcikpO1xuXHRwdWJsaWMgZ2V0IHByb21wdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dhdGVkUHJvbXB0cztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlck1ldGFkYXRhOiBDYWNoZWRQcmltaXRpdmU8U2VydmVyTWV0YWRhdGEsIFN0b3JlZFNlcnZlck1ldGFkYXRhIHwgdW5kZWZpbmVkPjtcblx0cHVibGljIGdldCBzZXJ2ZXJNZXRhZGF0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VydmVyTWV0YWRhdGEudmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRydXN0ZWRBdE5vbmNlKCkge1xuXHRcdHJldHVybiB0aGlzLl9wcmltaXRpdmVDYWNoZS5nZXQodGhpcy5kZWZpbml0aW9uLmlkKT8udHJ1c3RlZEF0Tm9uY2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHRydXN0ZWRBdE5vbmNlKG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZS5zdG9yZSh0aGlzLmRlZmluaXRpb24uaWQsIHsgdHJ1c3RlZEF0Tm9uY2U6IG5vbmNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZnVsbERlZmluaXRpb25zOiBJT2JzZXJ2YWJsZTx7XG5cdFx0c2VydmVyOiBNY3BTZXJ2ZXJEZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xuXHR9PjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY2FjaGVTdGF0ZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRjb25zdCBjdXJyZW50Tm9uY2UgPSAoKSA9PiB0aGlzLl9mdWxsRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpPy5zZXJ2ZXI/LmNhY2hlTm9uY2U7XG5cdFx0Y29uc3Qgc3RhdGVXaGVuU2VydmluZ0Zyb21DYWNoZSA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl90b29scy5oYXNTdGF0aWNEZWZpbml0aW9uKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIE1jcFNlcnZlckNhY2hlU3RhdGUuQ2FjaGVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX3Rvb2xzLmZyb21DYWNoZSkge1xuXHRcdFx0XHRyZXR1cm4gTWNwU2VydmVyQ2FjaGVTdGF0ZS5Vbmtub3duO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY3VycmVudE5vbmNlKCkgPT09IHRoaXMuX3Rvb2xzLmZyb21DYWNoZS5ub25jZSA/IE1jcFNlcnZlckNhY2hlU3RhdGUuQ2FjaGVkIDogTWNwU2VydmVyQ2FjaGVTdGF0ZS5PdXRkYXRlZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZnJvbVNlcnZlciA9IHRoaXMuX3Rvb2xzLmZyb21TZXJ2ZXJQcm9taXNlLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBjb25uZWN0aW9uU3RhdGUgPSB0aGlzLmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaXNJZGxlID0gTWNwQ29ubmVjdGlvblN0YXRlLmNhbkJlU3RhcnRlZChjb25uZWN0aW9uU3RhdGUuc3RhdGUpIHx8ICFmcm9tU2VydmVyO1xuXHRcdGlmIChpc0lkbGUpIHtcblx0XHRcdHJldHVybiBzdGF0ZVdoZW5TZXJ2aW5nRnJvbUNhY2hlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJvbVNlcnZlclJlc3VsdCA9IGZyb21TZXJ2ZXI/LnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZnJvbVNlcnZlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Rvb2xzLmZyb21DYWNoZSA/IE1jcFNlcnZlckNhY2hlU3RhdGUuUmVmcmVzaGluZ0Zyb21DYWNoZWQgOiBNY3BTZXJ2ZXJDYWNoZVN0YXRlLlJlZnJlc2hpbmdGcm9tVW5rbm93bjtcblx0XHR9XG5cblx0XHRpZiAoZnJvbVNlcnZlclJlc3VsdC5lcnJvcikge1xuXHRcdFx0cmV0dXJuIHN0YXRlV2hlblNlcnZpbmdGcm9tQ2FjaGUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZnJvbVNlcnZlclJlc3VsdC5kYXRhPy5ub25jZSA9PT0gY3VycmVudE5vbmNlKCkgPyBNY3BTZXJ2ZXJDYWNoZVN0YXRlLkxpdmUgOiBNY3BTZXJ2ZXJDYWNoZVN0YXRlLk91dGRhdGVkO1xuXHR9KTtcblxuXHRwdWJsaWMgZ2V0IGxvZ2dlcigpOiBJTG9nZ2VyIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9nZ2VyO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VySWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nZ2VyO1xuXHRwcml2YXRlIF9sYXN0TW9kZURlYnVnZ2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUXVpZXRTdGFydCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1NhbmRib3hTdWdnZXN0aW9uRGlhbG9nVmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wb3RlbnRpYWxTYW5kYm94QmxvY2tzOiBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrW10gPSBbXTtcblx0cHJpdmF0ZSBfcG90ZW50aWFsU2FuZGJveEJsb2NrTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHQvKiogQ291bnQgb2YgcnVubmluZyB0b29sIGNhbGxzLCB1c2VkIHRvIGRldGVjdCBpZiBzYW1wbGluZyBpcyBkdXJpbmcgYW4gTE0gY2FsbCAqL1xuXHRwdWJsaWMgcnVubmluZ1Rvb2xDYWxscyA9IG5ldyBTZXQ8SU1jcFRvb2xDYWxsQ29udGV4dD4oKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZW5hYmxlbWVudDogSU9ic2VydmFibGU8Q29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbml0aWFsQ29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlZmluaXRpb246IE1jcERlZmluaXRpb25SZWZlcmVuY2UsXG5cdFx0ZXhwbGljaXRSb290czogVVJJW10gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWlyZXNFeHRlbnNpb25BY3RpdmF0aW9uOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ByaW1pdGl2ZUNhY2hlOiBNY3BTZXJ2ZXJNZXRhZGF0YUNhY2hlLFxuXHRcdHByZWZpeEdlbmVyYXRvcjogTWNwUHJlZml4R2VuZXJhdG9yLFxuXHRcdGVuYWJsZW1lbnRNb2RlbDogSUVuYWJsZW1lbnRNb2RlbCxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX21jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlOiBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1jcFNhbXBsaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zYW1wbGluZ1NlcnZpY2U6IElNY3BTYW1wbGluZ1NlcnZpY2UsXG5cdFx0QElNY3BFbGljaXRhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWxpY2l0YXRpb25TZXJ2aWNlOiBJTWNwRWxpY2l0YXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwU2FuZGJveFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwU2FuZGJveFNlcnZpY2U6IElNY3BTYW5kYm94U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbGxlY3Rpb24gPSBpbml0aWFsQ29sbGVjdGlvbjtcblx0XHR0aGlzLl9mdWxsRGVmaW5pdGlvbnMgPSB0aGlzLl9tY3BSZWdpc3RyeS5nZXRTZXJ2ZXJEZWZpbml0aW9uKHRoaXMuY29sbGVjdGlvbiwgdGhpcy5kZWZpbml0aW9uKTtcblx0XHR0aGlzLmVuYWJsZW1lbnQgPSBkZXJpdmVkKHIgPT4gZW5hYmxlbWVudE1vZGVsLnJlYWRFbmFibGVkKGRlZmluaXRpb24uaWQsIHIpKTtcblxuXHRcdHRoaXMuX3BvbGljeUVwb2NoID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9hbGxvd2VkTWNwU2VydmVyc1NlcnZpY2Uub25EaWRDaGFuZ2VBbGxvd2VkTWNwU2VydmVycywgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9wb2xpY3lCbG9jayA9IGRlcml2ZWQ8TWNwQ29ubmVjdGlvblN0YXRlLkVycm9yIHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fcG9saWN5RXBvY2gucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0Ly8gQXV0aG9yaXRhdGl2ZTogdGhlIGNvbm5lY3Rpb24gY2FycmllcyB0aGUgZnVsbHkgcmVzb2x2ZWQgbGF1bmNoLlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZXZhbHVhdGVQb2xpY3kodGhpcy5faWRlbnRpdHlGcm9tTGF1bmNoKGNvbm5lY3Rpb24ubGF1bmNoRGVmaW5pdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQXQgcmVzdCwgb25seSBkZWNpZGUgd2hlbiB3ZSBoYXZlIGEgY29uY3JldGUsIGZ1bGx5LXJlc29sdmVkIGxhdW5jaC4gSWYgdGhlIGRlZmluaXRpb25cblx0XHRcdC8vIGhhcyBub3QgYmVlbiBwcm92aWRlZCB5ZXQgKGUuZy4gYSBsYXp5L2V4dGVuc2lvbiBzZXJ2ZXIgYmVmb3JlIGFjdGl2YXRpb24pIG9yIHRoZSBsYXVuY2hcblx0XHRcdC8vIHN0aWxsIGNvbnRhaW5zIHVucmVzb2x2ZWQgYCR7Li4ufWAgdmFyaWFibGVzIChpbnB1dHMsIHdvcmtzcGFjZSBvciBlbnYgdmFycyksIGFcblx0XHRcdC8vIFVSTC9jb21tYW5kIGFsbG93L2RlbnkgcnVsZSBjYW5ub3QgYmUgbWF0Y2hlZCByZWxpYWJseSwgc28gZGVmZXIgdGhlIGRlY2lzaW9uIHRvIHN0YXJ0KClcblx0XHRcdC8vIFx1MjAxNCB3aGljaCByZS1jaGVja3MgdGhlIGZ1bGx5IHJlc29sdmVkIGxhdW5jaCBcdTIwMTQgdG8gYXZvaWQgb3Zlci1lYWdlcmx5IGJsb2NraW5nIChhbmQgaGlkaW5nXG5cdFx0XHQvLyB0aGUgY2FjaGVkIHRvb2xzIG9mKSBhIHNlcnZlciB0aGF0IHdpbGwgYWN0dWFsbHkgYmUgYWxsb3dlZCBvbmNlIHJlc29sdmVkLiBgY2hhdC5tY3AuYWNjZXNzYFxuXHRcdFx0Ly8gYW5kIGRlbnktYnktbmFtZSBhcmUgc3RpbGwgZW5mb3JjZWQgYXQgc3RhcnQoKSwgYW5kIGFjY2VzcyBhbHNvIGJ5IHRoZSBlbmFibGVtZW50IGxheWVyLlxuXHRcdFx0Y29uc3QgbGF1bmNoID0gdGhpcy5fZnVsbERlZmluaXRpb25zLnJlYWQocmVhZGVyKS5zZXJ2ZXI/LmxhdW5jaDtcblx0XHRcdGlmICghbGF1bmNoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZGVudGl0eSA9IHRoaXMuX2lkZW50aXR5RnJvbUxhdW5jaChsYXVuY2gpO1xuXHRcdFx0aWYgKE1jcFNlcnZlci5faGFzVW5yZXNvbHZlZFZhcmlhYmxlcyhpZGVudGl0eSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9ldmFsdWF0ZVBvbGljeShpZGVudGl0eSk7XG5cdFx0fSk7XG5cblx0XHQvLyBTdG9wIGEgbGl2ZSBjb25uZWN0aW9uIHdoZW4gdGhlIHBvbGljeSBibG9ja3MgaXQgKGUuZy4gdGhlIHBvbGljeSB3YXMgdGlnaHRlbmVkIHdoaWxlIHRoZVxuXHRcdC8vIHNlcnZlciB3YXMgcnVubmluZykuIFRoZSBibG9jayBpdHNlbGYgaXMgZXZhbHVhdGVkIHJlYWN0aXZlbHkgYnkgYF9wb2xpY3lCbG9ja2AsIHdoaWNoIGFsc29cblx0XHQvLyBoaWRlcyBjYWNoZWQgdG9vbHMvcHJvbXB0cyBhbmQgc3VyZmFjZXMgdGhlIHJlYXNvbiBpbiB0aGUgVUkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BvbGljeUJsb2NrLnJlYWQocmVhZGVyKSAmJiB0aGlzLl9jb25uZWN0aW9uLnJlYWQodW5kZWZpbmVkKSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7IC8vIGRpc3Bvc2VzIGFuZCBzdG9wcyB0aGUgY29ubmVjdGlvblxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvZ2dlcklkID0gYG1jcFNlcnZlci4ke2RlZmluaXRpb24uaWR9YDtcblx0XHR0aGlzLl9sb2dnZXIgPSB0aGlzLl9yZWdpc3RlcihfbG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIodGhpcy5fbG9nZ2VySWQsIHsgaGlkZGVuOiB0cnVlLCBuYW1lOiBgTUNQOiAke2RlZmluaXRpb24ubGFiZWx9YCB9KSk7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BEZXZNb2RlU2VydmVyQXR0YWNoZSwgdGhpcywgeyBnZXQgbGFzdE1vZGVEZWJ1Z2dlZCgpIHsgcmV0dXJuIHRoYXQuX2xhc3RNb2RlRGVidWdnZWQ7IH0gfSkpO1xuXG5cdFx0Ly8gSWYgdGhlIGxvZ2dlciBpcyBkaXNwb3NlZCBidXQgbm90IGRlcmVnaXN0ZXJlZCwgdGhlbiB0aGUgZGlzcG9zZWQgaW5zdGFuY2Vcblx0XHQvLyBpcyByZXVzZWQgYW5kIG5vLW9wcy4gdG9kb0BzYW5keTA4MSB0aGlzIHNlZW1zIGxpa2UgYSBidWcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IF9sb2dnZXJTZXJ2aWNlLmRlcmVnaXN0ZXJMb2dnZXIodGhpcy5fbG9nZ2VySWQpKSk7XG5cblx0XHQvLyAxLiBSZWZsZWN0IHdvcmtzcGFjZXMgaW50byB0aGUgTUNQIHJvb3RzXG5cdFx0Y29uc3Qgd29ya3NwYWNlcyA9IGV4cGxpY2l0Um9vdHNcblx0XHRcdD8gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGV4cGxpY2l0Um9vdHMubWFwKHVyaSA9PiAoeyB1cmksIG5hbWU6IGJhc2VuYW1lKHVyaSkgfSkpKVxuXHRcdFx0OiBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0XHR0aGlzLFxuXHRcdFx0XHR3b3Jrc3BhY2VzU2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMsXG5cdFx0XHRcdCgpID0+IHdvcmtzcGFjZXNTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMsXG5cdFx0XHQpO1xuXG5cdFx0Y29uc3QgdXJpVHJhbnNmb3JtZXIgPSBlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gY3JlYXRlVVJJVHJhbnNmb3JtZXIoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjbnggPSB0aGlzLl9jb25uZWN0aW9uLnJlYWQocmVhZGVyKT8uaGFuZGxlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWNueCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNueC5yb290cyA9IHdvcmtzcGFjZXMucmVhZChyZWFkZXIpXG5cdFx0XHRcdC5maWx0ZXIodyA9PiB3LnVyaS5hdXRob3JpdHkgPT09IChpbml0aWFsQ29sbGVjdGlvbi5yZW1vdGVBdXRob3JpdHkgfHwgJycpKVxuXHRcdFx0XHQubWFwKHcgPT4ge1xuXHRcdFx0XHRcdGxldCB1cmkgPSBVUkkuZnJvbSh1cmlUcmFuc2Zvcm1lcj8udHJhbnNmb3JtSW5jb21pbmcody51cmkpID8/IHcudXJpKTtcblx0XHRcdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7IC8vICMyNzE4MTJcblx0XHRcdFx0XHRcdHVyaSA9IFVSSS5maWxlKG5vcm1hbGl6ZURyaXZlTGV0dGVyKHVyaS5mc1BhdGgsIHRydWUpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4geyBuYW1lOiB3Lm5hbWUsIHVyaTogdXJpLnRvU3RyaW5nKCkgfTtcblx0XHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gMi4gUG9wdWxhdGUgdGhpcy50b29scyB3aGVuIHdlIGNvbm5lY3QgdG8gYSBzZXJ2ZXIuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY254ID0gdGhpcy5fY29ubmVjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYW5kbGVyID0gY254Py5oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRcdHRoaXMuX3BvcHVsYXRlTGl2ZURhdGEoaGFuZGxlciwgY254Py5kZWZpbml0aW9uLmNhY2hlTm9uY2UsIHJlYWRlci5zdG9yZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3Rvb2xzKSB7XG5cdFx0XHRcdHRoaXMucmVzZXRMaXZlRGF0YSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNueCA9IHRoaXMuX2Nvbm5lY3Rpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2NrTGlzdGVuZXIudmFsdWUgPSBjbng/Lm9uUG90ZW50aWFsU2FuZGJveEJsb2NrKGJsb2NrID0+IHRoaXMucmVjb3JkUG90ZW50aWFsU2FuZGJveEJsb2NrKGJsb2NrKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc3RhdGljTWV0YWRhdGEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkZWYgPSB0aGlzLl9mdWxsRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpLnNlcnZlcjtcblx0XHRcdHJldHVybiBkZWYgJiYgZGVmLmNhY2hlTm9uY2UgIT09IHRoaXMuX3Rvb2xzLmZyb21DYWNoZT8ubm9uY2UgPyBkZWYuc3RhdGljTWV0YWRhdGEgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZXJ2ZXJNZXRhZGF0YSA9IG5ldyBDYWNoZWRQcmltaXRpdmU8U2VydmVyTWV0YWRhdGEsIFN0b3JlZFNlcnZlck1ldGFkYXRhIHwgdW5kZWZpbmVkPihcblx0XHRcdHRoaXMuZGVmaW5pdGlvbi5pZCxcblx0XHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLFxuXHRcdFx0c3RhdGljTWV0YWRhdGEubWFwKG0gPT4gbSA/IHRoaXMuX3RvU3RvcmVkTWV0YWRhdGEobT8uc2VydmVySW5mbywgbT8uaW5zdHJ1Y3Rpb25zKSA6IHVuZGVmaW5lZCksXG5cdFx0XHQoZW50cnkpID0+ICh7IHNlcnZlck5hbWU6IGVudHJ5LnNlcnZlck5hbWUsIHNlcnZlckluc3RydWN0aW9uczogZW50cnkuc2VydmVySW5zdHJ1Y3Rpb25zLCBzZXJ2ZXJJY29uczogZW50cnkuc2VydmVySWNvbnMgfSksXG5cdFx0XHQoZW50cnkpID0+ICh7IHNlcnZlck5hbWU6IGVudHJ5Py5zZXJ2ZXJOYW1lLCBzZXJ2ZXJJbnN0cnVjdGlvbnM6IGVudHJ5Py5zZXJ2ZXJJbnN0cnVjdGlvbnMsIGljb25zOiBNY3BJY29ucy5mcm9tU3RvcmVkKGVudHJ5Py5zZXJ2ZXJJY29ucykgfSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdC8vIEZvcm0gdGhlIHRvb2wgcHJlZml4IGZyb20gdGhlIHNlcnZlci1hbm5vdW5jZWQgbmFtZSB3aGVuIGtub3duIHNvIHRoYXRcblx0XHQvLyByZWdpc3RyeS1zdHlsZSBtY3AuanNvbiBrZXlzIGxpa2UgYGlvLmdpdGh1Yi51cHN0YXNoL2NvbnRleHQ3YCBkb24ndCBlbmRcblx0XHQvLyB1cCBpbiBgbWNwX2lvX2dpdGh1Yl91cHNfKmAgdHJ1bmNhdGVkIG5hbWVzLiBTZWUgIzI5OTc0OS5cblx0XHRjb25zdCBwcmVmZXJyZWROYW1lID0gZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fc2VydmVyTWV0YWRhdGEudmFsdWUucmVhZChyZWFkZXIpPy5zZXJ2ZXJOYW1lIHx8IHRoaXMuZGVmaW5pdGlvbi5sYWJlbCk7XG5cdFx0Y29uc3QgcHJlZml4UmVmID0gZGVyaXZlZERpc3Bvc2FibGUocmVhZGVyID0+IHByZWZpeEdlbmVyYXRvci50YWtlKHByZWZlcnJlZE5hbWUucmVhZChyZWFkZXIpKSk7XG5cdFx0Y29uc3QgdG9vbFByZWZpeCA9IHByZWZpeFJlZi5tYXAocmVmID0+IHJlZi5vYmplY3QpO1xuXG5cdFx0Ly8gMy4gUHVibGlzaCB0b29sc1xuXHRcdHRoaXMuX3Rvb2xzID0gbmV3IENhY2hlZFByaW1pdGl2ZTxyZWFkb25seSBJTWNwVG9vbFtdLCByZWFkb25seSBWYWxpZGF0ZWRNY3BUb29sW10+KFxuXHRcdFx0dGhpcy5kZWZpbml0aW9uLmlkLFxuXHRcdFx0dGhpcy5fcHJpbWl0aXZlQ2FjaGUsXG5cdFx0XHRzdGF0aWNNZXRhZGF0YVxuXHRcdFx0XHQubWFwKG0gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xzID0gbT8udG9vbHM/LmZpbHRlcih0ID0+IHQuYXZhaWxhYmlsaXR5ID09PSBNY3BTZXJ2ZXJTdGF0aWNUb29sQXZhaWxhYmlsaXR5LkluaXRpYWwpLm1hcCh0ID0+IHQuZGVmaW5pdGlvbik7XG5cdFx0XHRcdFx0cmV0dXJuIHRvb2xzPy5sZW5ndGggPyBuZXcgT2JzZXJ2YWJsZVByb21pc2UodGhpcy5fZ2V0VmFsaWRhdGVkVG9vbHModG9vbHMpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fSlcblx0XHRcdFx0Lm1hcCgobywgcmVhZGVyKSA9PiBvPy5wcm9taXNlUmVzdWx0LnJlYWQocmVhZGVyKT8uZGF0YSksXG5cdFx0XHQoZW50cnkpID0+IGVudHJ5LnRvb2xzLFxuXHRcdFx0KGVudHJ5LCByZWFkZXIpID0+IGVudHJ5Lm1hcChkZWYgPT4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwVG9vbCwgdGhpcywgdG9vbFByZWZpeC5yZWFkKHJlYWRlciksIGRlZikpLnNvcnQoKGEsIGIpID0+IGEuY29tcGFyZShiKSksXG5cdFx0XHRbXSxcblx0XHQpO1xuXG5cdFx0Ly8gNC4gUHVibGlzaCBwcm9tcHRzXG5cdFx0dGhpcy5fcHJvbXB0cyA9IG5ldyBDYWNoZWRQcmltaXRpdmU8cmVhZG9ubHkgSU1jcFByb21wdFtdLCByZWFkb25seSBTdG9yZWRNY3BQcm9tcHRbXT4oXG5cdFx0XHR0aGlzLmRlZmluaXRpb24uaWQsXG5cdFx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdChlbnRyeSkgPT4gZW50cnkucHJvbXB0cyB8fCBbXSxcblx0XHRcdChlbnRyeSkgPT4gZW50cnkubWFwKGUgPT4gbmV3IE1jcFByb21wdCh0aGlzLCBlKSksXG5cdFx0XHRbXSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fY2FwYWJpbGl0aWVzID0gbmV3IENhY2hlZFByaW1pdGl2ZTxudW1iZXIgfCB1bmRlZmluZWQsIG51bWJlciB8IHVuZGVmaW5lZD4oXG5cdFx0XHR0aGlzLmRlZmluaXRpb24uaWQsXG5cdFx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZSxcblx0XHRcdHN0YXRpY01ldGFkYXRhLm1hcChtID0+IG0/LmNhcGFiaWxpdGllcyAhPT0gdW5kZWZpbmVkID8gZW5jb2RlQ2FwYWJpbGl0aWVzKG0uY2FwYWJpbGl0aWVzKSA6IHVuZGVmaW5lZCksXG5cdFx0XHQoZW50cnkpID0+IGVudHJ5LmNhcGFiaWxpdGllcyxcblx0XHRcdChlbnRyeSkgPT4gZW50cnksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdC8vIEhvbGQgdGhlIHByZWZpeCBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZSBzZXJ2ZXIgc28gaXRzIHRvb2wgbmFtZSBzdGF5c1xuXHRcdC8vIHN0YWJsZSBldmVuIHdoZW4gbm8gb25lIGlzIGN1cnJlbnRseSBvYnNlcnZpbmcgdGhlIHRvb2xzIGxpc3QuXG5cdFx0cHJlZml4UmVmLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkRGVmaW5pdGlvbnMoKTogSU9ic2VydmFibGU8eyBzZXJ2ZXI6IE1jcFNlcnZlckRlZmluaXRpb24gfCB1bmRlZmluZWQ7IGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZnVsbERlZmluaXRpb25zO1xuXHR9XG5cblx0cHVibGljIHNob3dPdXRwdXQocHJlc2VydmVGb2N1cz86IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9sb2dnZXJTZXJ2aWNlLnNldFZpc2liaWxpdHkodGhpcy5fbG9nZ2VySWQsIHRydWUpO1xuXHRcdHJldHVybiB0aGlzLl9vdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKHRoaXMuX2xvZ2dlcklkLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvdXJjZXModG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IEFzeW5jSXRlcmFibGU8SU1jcFJlc291cmNlW10+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPElNY3BSZXNvdXJjZVtdPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdGF3YWl0IE1jcFNlcnZlci5jYWxsT24odGhpcywgYXN5bmMgKGhhbmRsZXIpID0+IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCByZXNvdXJjZSBvZiBoYW5kbGVyLmxpc3RSZXNvdXJjZXNJdGVyYWJsZSh7fSwgY3RzLnRva2VuKSkge1xuXHRcdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZShyZXNvdXJjZS5tYXAociA9PiBuZXcgTWNwUmVzb3VyY2UodGhpcywgciwgTWNwSWNvbnMuZnJvbVBhcnNlZCh0aGlzLl9wYXJzZUljb25zKHIpKSkpKTtcblx0XHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LCAoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb3VyY2VUZW1wbGF0ZXModG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU1jcFJlc291cmNlVGVtcGxhdGVbXT4ge1xuXHRcdHJldHVybiBNY3BTZXJ2ZXIuY2FsbE9uKHRoaXMsIGFzeW5jIChoYW5kbGVyKSA9PiB7XG5cdFx0XHRjb25zdCB0ZW1wbGF0ZXMgPSBhd2FpdCBoYW5kbGVyLmxpc3RSZXNvdXJjZVRlbXBsYXRlcyh7fSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHRlbXBsYXRlcy5tYXAodCA9PiBuZXcgTWNwUmVzb3VyY2VUZW1wbGF0ZSh0aGlzLCB0LCBNY3BJY29ucy5mcm9tUGFyc2VkKHRoaXMuX3BhcnNlSWNvbnModCkpKSk7XG5cdFx0fSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaWRlbnRpdHlGcm9tTGF1bmNoKGxhdW5jaDogTWNwU2VydmVyTGF1bmNoIHwgdW5kZWZpbmVkKTogSU1jcFNlcnZlcklkZW50aXR5IHtcblx0XHRpZiAobGF1bmNoPy50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApIHtcblx0XHRcdHJldHVybiB7IG5hbWU6IHRoaXMuZGVmaW5pdGlvbi5sYWJlbCwgdXJsOiBsYXVuY2gudXJpLnRvU3RyaW5nKHRydWUpIH07XG5cdFx0fVxuXHRcdGlmIChsYXVuY2g/LnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8pIHtcblx0XHRcdC8vIGBsYXVuY2guY29tbWFuZGAvYGxhdW5jaC5hcmdzYCBhcmUgdHlwZWQgYXMgbm9uLW51bGxhYmxlIGJ1dCBjYW4gYmUgYHVuZGVmaW5lZGAgYXRcblx0XHRcdC8vIHJ1bnRpbWUgd2hlbiB0aGV5IG9yaWdpbmF0ZSBmcm9tIHVzZXIvZGlzY292ZXJ5IGNvbmZpZ3VyYXRpb24gdGhhdCBvbWl0dGVkIHRoZSBmaWVsZC5cblx0XHRcdC8vIFdoZW4gYGNvbW1hbmRgIGlzIHByZXNlbnQsIGJ1aWxkIHRoZSBmdWxsIGNvbW1hbmQgbGluZSAoZGVmYXVsdGluZyBgYXJnc2AgdG8gYW4gZW1wdHlcblx0XHRcdC8vIGFycmF5IGFuZCBkcm9wcGluZyBhbnkgbm9uLXN0cmluZyBlbnRyaWVzKTsgdGhlIHByb2R1Y2VkIGBJTWNwU2VydmVySWRlbnRpdHkuY29tbWFuZGBcblx0XHRcdC8vIHRoZW4gbmV2ZXIgY29udGFpbnMgYSBub24tc3RyaW5nIGVudHJ5LCB3aGljaCB3b3VsZCBvdGhlcndpc2UgYnJlYWsgcG9saWN5IG1hdGNoaW5nIGFuZFxuXHRcdFx0Ly8gdGhlIHVucmVzb2x2ZWQtdmFyaWFibGUgY2hlY2suIFVzZSBhIHN0cmluZyBjaGVjayBzbyBhIHZhbGlkLWJ1dC1lbXB0eSBjb21tYW5kIHN0cmluZyBpc1xuXHRcdFx0Ly8gcHJlc2VydmVkIHdoaWxlIG1hbGZvcm1lZCBub24tc3RyaW5nIGNvbW1hbmQgdmFsdWVzIGFyZSBkcm9wcGVkLiBXaGVuIGBjb21tYW5kYCBpcyBhYnNlbnRcblx0XHRcdC8vIHRoZSBmdWxsIGNvbW1hbmQgbGluZSBpcyB1bmtub3duLCBzbyBvbWl0IHRoZSBmaWVsZCBlbnRpcmVseSByYXRoZXIgdGhhbiBtYXRjaGluZyBvbiBhcmdzXG5cdFx0XHQvLyBhbG9uZSAod2hpY2ggY291bGQgY29sbGlkZSB3aXRoIHVucmVsYXRlZCBzZXJ2ZXJzKS5cblx0XHRcdHJldHVybiB0eXBlb2YgbGF1bmNoLmNvbW1hbmQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8geyBuYW1lOiB0aGlzLmRlZmluaXRpb24ubGFiZWwsIGNvbW1hbmQ6IFtsYXVuY2guY29tbWFuZCwgLi4uKGxhdW5jaC5hcmdzID8/IFtdKS5maWx0ZXIoYXJnID0+IHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnKV0gfVxuXHRcdFx0XHQ6IHsgbmFtZTogdGhpcy5kZWZpbml0aW9uLmxhYmVsIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IG5hbWU6IHRoaXMuZGVmaW5pdGlvbi5sYWJlbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZXZhbHVhdGVQb2xpY3koaWRlbnRpdHk6IElNY3BTZXJ2ZXJJZGVudGl0eSk6IE1jcENvbm5lY3Rpb25TdGF0ZS5FcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWxsb3dlZCA9IHRoaXMuX2FsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZS5pc1NlcnZlckFsbG93ZWQoaWRlbnRpdHkpO1xuXHRcdHJldHVybiBhbGxvd2VkID09PSB0cnVlID8gdW5kZWZpbmVkIDogeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsIG1lc3NhZ2U6IGFsbG93ZWQudmFsdWUgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBVUkwvY29tbWFuZCBmaWVsZHMgbWF0Y2hlZCBieSB0aGUgcG9saWN5IHN0aWxsIGNvbnRhaW4gdW5yZXNvbHZlZCBgJHsuLi59YFxuXHQgKiBjb25maWd1cmF0aW9uIHZhcmlhYmxlcy4gV2hlbiB0aGV5IGRvLCBtYXRjaGluZyBhZ2FpbnN0IGFsbG93L2RlbnkgVVJMIG9yIGNvbW1hbmQgcnVsZXMgaXNcblx0ICogdW5yZWxpYWJsZSwgc28gdGhlIGJsb2NrIGlzIGRlZmVycmVkIHVudGlsIHRoZSBsYXVuY2ggaXMgcmVzb2x2ZWQuIFRoZSBzZXJ2ZXIgbmFtZSBpcyB1c2VkXG5cdCAqIHZlcmJhdGltIGFuZCBpcyBub3QgY29uc2lkZXJlZCBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2hhc1VucmVzb2x2ZWRWYXJpYWJsZXMoaWRlbnRpdHk6IElNY3BTZXJ2ZXJJZGVudGl0eSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHZhcmlhYmxlTWFya2VyID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5WQVJJQUJMRV9MSFM7XG5cdFx0cmV0dXJuICEhaWRlbnRpdHkudXJsPy5pbmNsdWRlcyh2YXJpYWJsZU1hcmtlcikgfHwgISFpZGVudGl0eS5jb21tYW5kPy5zb21lKGFyZyA9PiBhcmcuaW5jbHVkZXModmFyaWFibGVNYXJrZXIpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGFydCh7IGludGVyYWN0aW9uLCBhdXRvVHJ1c3RDaGFuZ2VzLCBwcm9tcHRUeXBlLCBkZWJ1ZywgZXJyb3JPblVzZXJJbnRlcmFjdGlvbiB9OiBJTWNwU2VydmVyU3RhcnRPcHRzID0ge30pOiBQcm9taXNlPE1jcENvbm5lY3Rpb25TdGF0ZT4ge1xuXHRcdGludGVyYWN0aW9uPy5wYXJ0aWNpcGFudHMuc2V0KHRoaXMuZGVmaW5pdGlvbi5pZCwgeyBzOiAndW5rbm93bicgfSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvblNlcXVlbmNlci5xdWV1ZTxNY3BDb25uZWN0aW9uU3RhdGU+KGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEV2YWx1YXRlZCBhZ2FpbnN0IHRoZSBkZWZpbml0aW9uIGhlcmUgKG5vIGNvbm5lY3Rpb24geWV0KS4gYF9wb2xpY3lCbG9ja2AgcmUtZXZhbHVhdGVzXG5cdFx0XHQvLyBhZ2FpbnN0IHRoZSByZXNvbHZlZCBsYXVuY2ggb25jZSB0aGUgY29ubmVjdGlvbiBleGlzdHMgKGNoZWNrZWQgYWdhaW4gYmVsb3cpLlxuXHRcdFx0Y29uc3QgcHJlU3RhcnRCbG9jayA9IHRoaXMuX3BvbGljeUJsb2NrLmdldCgpO1xuXHRcdFx0aWYgKHByZVN0YXJ0QmxvY2spIHtcblx0XHRcdFx0cmV0dXJuIHByZVN0YXJ0QmxvY2s7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGl2YXRpb25FdmVudCA9IG1jcEFjdGl2YXRpb25FdmVudCh0aGlzLmNvbGxlY3Rpb24uaWQuc2xpY2UoZXh0ZW5zaW9uTWNwQ29sbGVjdGlvblByZWZpeC5sZW5ndGgpKTtcblx0XHRcdGlmICh0aGlzLl9yZXF1aXJlc0V4dGVuc2lvbkFjdGl2YXRpb24gJiYgIXRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGlvbkV2ZW50SXNEb25lKGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50KTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5fbWNwUmVnaXN0cnkuZGVsZWdhdGVzLmdldCgpXG5cdFx0XHRcdFx0Lm1hcChyID0+IHIud2FpdEZvckluaXRpYWxQcm92aWRlclByb21pc2VzKCkpKTtcblx0XHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBzZXJ2ZXIgd2FzIGNyZWF0ZWQgZnJvbSBhIGNhY2hlZCBNQ1Agc2VydmVyIHNlZW5cblx0XHRcdFx0Ly8gZnJvbSBhbiBleHRlbnNpb24sIGJ1dCB0aGVuIGl0IHdhc24ndCByZWdpc3RlcmVkIHdoZW4gdGhlIGV4dGVuc2lvbiBhY3RpdmF0ZWQuXG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb24uZ2V0KCk7XG5cdFx0XHR0aGlzLl9pc1F1aWV0U3RhcnQgPSAhIWVycm9yT25Vc2VySW50ZXJhY3Rpb247XG5cdFx0XHRpZiAoY29ubmVjdGlvbiAmJiBNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKGNvbm5lY3Rpb24uc3RhdGUuZ2V0KCkuc3RhdGUpKSB7XG5cdFx0XHRcdGNvbm5lY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRjb25uZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uLnNldChjb25uZWN0aW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fbGFzdE1vZGVEZWJ1Z2dlZCA9ICEhZGVidWc7XG5cdFx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0XHRjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fbWNwUmVnaXN0cnkucmVzb2x2ZUNvbm5lY3Rpb24oe1xuXHRcdFx0XHRcdGludGVyYWN0aW9uLFxuXHRcdFx0XHRcdGF1dG9UcnVzdENoYW5nZXMsXG5cdFx0XHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdFx0XHR0cnVzdE5vbmNlQmVhcmVyOiB7XG5cdFx0XHRcdFx0XHRnZXQgdHJ1c3RlZEF0Tm9uY2UoKSB7IHJldHVybiB0aGF0LnRydXN0ZWRBdE5vbmNlOyB9LFxuXHRcdFx0XHRcdFx0c2V0IHRydXN0ZWRBdE5vbmNlKG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHsgdGhhdC50cnVzdGVkQXROb25jZSA9IG5vbmNlOyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsb2dnZXI6IHRoaXMuX2xvZ2dlcixcblx0XHRcdFx0XHRjb2xsZWN0aW9uUmVmOiB0aGlzLmNvbGxlY3Rpb24sXG5cdFx0XHRcdFx0ZGVmaW5pdGlvblJlZjogdGhpcy5kZWZpbml0aW9uLFxuXHRcdFx0XHRcdGRlYnVnLFxuXHRcdFx0XHRcdGVycm9yT25Vc2VySW50ZXJhY3Rpb24sXG5cdFx0XHRcdFx0dGFza01hbmFnZXI6IHRoaXMuX3Rhc2tNYW5hZ2VyLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uc2V0KGNvbm5lY3Rpb24sIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0aWYgKGNvbm5lY3Rpb24uZGVmaW5pdGlvbi5kZXZNb2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93T3V0cHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gUmUtZXZhbHVhdGUgdGhlIHBvbGljeSBhZ2FpbnN0IHRoZSAqcmVzb2x2ZWQqIGxhdW5jaCBkZWZpbml0aW9uLiBFeHRlbnNpb24gYWN0aXZhdGlvbiBhbmRcblx0XHRcdC8vIHZhcmlhYmxlL2lucHV0IHN1YnN0aXR1dGlvbiBkdXJpbmcgcmVzb2x1dGlvbiBjYW4gY2hhbmdlIHRoZSBVUkwgb3IgY29tbWFuZCwgc28gdGhlXG5cdFx0XHQvLyBpZGVudGl0eSB0aGF0IGFjdHVhbGx5IGxhdW5jaGVzIG1heSBkaWZmZXIgZnJvbSB0aGUgb25lIGNoZWNrZWQgYmVmb3JlIHJlc29sdXRpb24uXG5cdFx0XHQvLyBgX3BvbGljeUJsb2NrYCBub3cgc2VlcyB0aGUgbGl2ZSBjb25uZWN0aW9uIGFuZCB1c2VzIGl0cyByZXNvbHZlZCBsYXVuY2guXG5cdFx0XHRjb25zdCByZXNvbHZlZEJsb2NrID0gdGhpcy5fcG9saWN5QmxvY2suZ2V0KCk7XG5cdFx0XHRpZiAocmVzb2x2ZWRCbG9jaykge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7IC8vIGRpc3Bvc2UgdGhlIGp1c3QtcmVzb2x2ZWQgY29ubmVjdGlvblxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRCbG9jaztcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcy5sZW5ndGggPSAwO1xuXG5cdFx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0XHRsZXQgc3RhdGUgPSBhd2FpdCBjb25uZWN0aW9uLnN0YXJ0KHtcblx0XHRcdFx0Y3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyOiAocGFyYW1zLCB0b2tlbikgPT4gdGhpcy5fc2FtcGxpbmdTZXJ2aWNlLnNhbXBsZSh7XG5cdFx0XHRcdFx0aXNEdXJpbmdUb29sQ2FsbDogdGhpcy5ydW5uaW5nVG9vbENhbGxzLnNpemUgPiAwLFxuXHRcdFx0XHRcdHNlcnZlcjogdGhpcyxcblx0XHRcdFx0XHRwYXJhbXMsXG5cdFx0XHRcdH0sIHRva2VuKS50aGVuKHIgPT4gci5zYW1wbGUpLFxuXHRcdFx0XHRlbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyOiBhc3luYyAocmVxLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlcnZlckluZm8gPSBjb25uZWN0aW9uLmhhbmRsZXIuZ2V0KCk/LnNlcnZlckluZm87XG5cdFx0XHRcdFx0aWYgKHNlcnZlckluZm8pIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFbGljaXRhdGlvblRlbGVtZXRyeURhdGEsIEVsaWNpdGF0aW9uVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCdtY3AuZWxpY2l0YXRpb25SZXF1ZXN0ZWQnLCB7XG5cdFx0XHRcdFx0XHRcdHNlcnZlck5hbWU6IHNlcnZlckluZm8ubmFtZSxcblx0XHRcdFx0XHRcdFx0c2VydmVyVmVyc2lvbjogc2VydmVySW5mby52ZXJzaW9uLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgciA9IGF3YWl0IHRoaXMuX2VsaWNpdGF0aW9uU2VydmljZS5lbGljaXQodGhpcywgSXRlcmFibGUuZmlyc3QodGhpcy5ydW5uaW5nVG9vbENhbGxzKSwgcmVxLCB0b2tlbiB8fCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gci52YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXJ2ZXJCb290U3RhdGUsIFNlcnZlckJvb3RTdGF0ZUNsYXNzaWZpY2F0aW9uPignbWNwL3NlcnZlckJvb3RTdGF0ZScsIHtcblx0XHRcdFx0c3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS50b0tpbmRTdHJpbmcoc3RhdGUuc3RhdGUpLFxuXHRcdFx0XHR0aW1lOiBEYXRlLm5vdygpIC0gc3RhcnQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTUNQIHNlcnZlcnMgdGhhdCBuZWVkIGF1dGggY2FuICdzdGFydCcgYnV0IHdpbGwgc3RvcCB3aXRoIGFuIGludGVyYWN0aW9uLW5lZWRlZFxuXHRcdFx0Ly8gZXJyb3IgdGhleSBmaXJzdCBtYWtlIGEgcmVxdWVzdC4gSW4gdGhpcyBjYXNlLCB3YWl0IHVudGlsIHRoZSBoYW5kbGVyIGZ1bGx5XG5cdFx0XHQvLyBpbml0aWFsaXplcyBiZWZvcmUgcmVzb2x2aW5nICh0aHJvd2luZyBpZiBpdCBlbmRzIHVwIG5lZWRpbmcgYXV0aClcblx0XHRcdGlmIChlcnJvck9uVXNlckludGVyYWN0aW9uICYmIHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nKSB7XG5cdFx0XHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0XHRcdFx0c3RhdGUgPSBhd2FpdCBuZXcgUHJvbWlzZTxNY3BDb25uZWN0aW9uU3RhdGU+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaGFuZGxlciA9IGNvbm5lY3Rpb24uaGFuZGxlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRpZiAoaGFuZGxlcikge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcyA9IGNvbm5lY3Rpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKHMuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgJiYgcy5yZWFzb24gPT09ICduZWVkcy11c2VyLWludGVyYWN0aW9uJykge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QobmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ2F1dGgnKSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghTWNwQ29ubmVjdGlvblN0YXRlLmlzUnVubmluZyhzKSkge1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXRlLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcikge1xuXHRcdFx0XHRsZXQgZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdFx0XHRcdHN0YXRlID0gYXdhaXQgbmV3IFByb21pc2U8TWNwQ29ubmVjdGlvblN0YXRlPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNueCA9IHRoaXMuX2Nvbm5lY3Rpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBjbng/LnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGlmIChjbnggJiYgc3RhdGU/LnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcikge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzUXVpZXRTdGFydCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuc2hvd0ludGVyYWN0aXZlRXJyb3IoY254LCBzdGF0ZSwgdGhpcy5fbGFzdE1vZGVEZWJ1Z2dlZCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yKCdzdGFydCcpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aW50ZXJhY3Rpb24/LnBhcnRpY2lwYW50cy5zZXQodGhpcy5kZWZpbml0aW9uLmlkLCB7IHM6ICdyZXNvbHZlZCcgfSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dJbnRlcmFjdGl2ZUVycm9yKGNueDogSU1jcFNlcnZlckNvbm5lY3Rpb24sIGVycm9yOiBNY3BDb25uZWN0aW9uU3RhdGUuRXJyb3IsIGRlYnVnPzogYm9vbGVhbikge1xuXHRcdGlmIChjbnguZGVmaW5pdGlvbi5zYW5kYm94RW5hYmxlZCkge1xuXHRcdFx0aWYgKCF0aGlzLnNob3dTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbkZyb21Qb3RlbnRpYWxCbG9ja3MoY254LCB0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzKSkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ21jcFNlcnZlckVycm9yJywgJ1RoZSBNQ1Agc2VydmVyIHswfSBjb3VsZCBub3QgYmUgc3RhcnRlZDogezF9JywgY254LmRlZmluaXRpb24ubGFiZWwsIGVycm9yLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVycm9yLmNvZGUgPT09ICdFTk9FTlQnICYmIGNueC5sYXVuY2hEZWZpbml0aW9uLnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8pIHtcblx0XHRcdGxldCBkb2NzTGluazogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0c3dpdGNoIChjbngubGF1bmNoRGVmaW5pdGlvbi5jb21tYW5kKSB7XG5cdFx0XHRcdGNhc2UgJ3V2eCc6XG5cdFx0XHRcdFx0ZG9jc0xpbmsgPSBgaHR0cHM6Ly9ha2EubXMvdnNjb2RlLW1jcC1pbnN0YWxsL3V2eGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ25weCc6XG5cdFx0XHRcdFx0ZG9jc0xpbmsgPSBgaHR0cHM6Ly9ha2EubXMvdnNjb2RlLW1jcC1pbnN0YWxsL25weGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RueCc6XG5cdFx0XHRcdFx0ZG9jc0xpbmsgPSBgaHR0cHM6Ly9ha2EubXMvdnNjb2RlLW1jcC1pbnN0YWxsL2RueGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RvdG5ldCc6XG5cdFx0XHRcdFx0ZG9jc0xpbmsgPSBgaHR0cHM6Ly9ha2EubXMvdnNjb2RlLW1jcC1pbnN0YWxsL2RvdG5ldGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wdGlvbnM6IElQcm9tcHRDaG9pY2VbXSA9IFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmNvbW1hbmQuc2hvd091dHB1dCcsIFwiU2hvdyBPdXRwdXRcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5zaG93T3V0cHV0KCksXG5cdFx0XHR9XTtcblxuXHRcdFx0aWYgKGNueC5kZWZpbml0aW9uLmRldk1vZGU/LmRlYnVnPy50eXBlID09PSAnZGVidWdweScgJiYgZGVidWcpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGxvY2FsaXplKCdtY3BEZWJ1Z1B5SGVscCcsICdUaGUgY29tbWFuZCBcInswfVwiIHdhcyBub3QgZm91bmQuIFlvdSBjYW4gc3BlY2lmeSB0aGUgcGF0aCB0byBkZWJ1Z3B5IGluIHRoZSBgZGV2LmRlYnVnLmRlYnVncHlQYXRoYCBvcHRpb24uJywgY254LmxhdW5jaERlZmluaXRpb24uY29tbWFuZCwgY254LmRlZmluaXRpb24ubGFiZWwpLCBbLi4ub3B0aW9ucywge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwVmlld0RvY3MnLCAnVmlldyBEb2NzJyksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUtbWNwLWluc3RhbGwvZGVidWdweScpKSxcblx0XHRcdFx0fV0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkb2NzTGluaykge1xuXHRcdFx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwU2VydmVySW5zdGFsbCcsICdJbnN0YWxsIHswfScsIGNueC5sYXVuY2hEZWZpbml0aW9uLmNvbW1hbmQpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShkb2NzTGluaykpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGxvY2FsaXplKCdtY3BTZXJ2ZXJOb3RGb3VuZCcsICdUaGUgY29tbWFuZCBcInswfVwiIG5lZWRlZCB0byBydW4gezF9IHdhcyBub3QgZm91bmQuJywgY254LmxhdW5jaERlZmluaXRpb24uY29tbWFuZCwgY254LmRlZmluaXRpb24ubGFiZWwpLCBvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdtY3BTZXJ2ZXJFcnJvcicsICdUaGUgTUNQIHNlcnZlciB7MH0gY291bGQgbm90IGJlIHN0YXJ0ZWQ6IHsxfScsIGNueC5kZWZpbml0aW9uLmxhYmVsLCBlcnJvci5tZXNzYWdlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3dTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbkZyb21Qb3RlbnRpYWxCbG9ja3MoY254OiBJTWNwU2VydmVyQ29ubmVjdGlvbiwgcG90ZW50aWFsQmxvY2tzOiByZWFkb25seSBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrW10pOiBib29sZWFuIHtcblx0XHRpZiAoIWNueC5kZWZpbml0aW9uLnNhbmRib3hFbmFibGVkIHx8ICFwb3RlbnRpYWxCbG9ja3MubGVuZ3RoIHx8IHRoaXMuX2lzU2FuZGJveFN1Z2dlc3Rpb25EaWFsb2dWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc1F1aWV0U3RhcnQpIHtcblx0XHRcdHRocm93IG5ldyBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yKCdzYW5kYm94LXN1Z2dlc3Rpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ1NhbmRib3hDb25maWcgPSB0aGlzLl9mdWxsRGVmaW5pdGlvbnMuZ2V0KCkuY29sbGVjdGlvbj8uc2FuZGJveDtcblx0XHRjb25zdCBzdWdnZXN0aW9uID0gdGhpcy5fbWNwU2FuZGJveFNlcnZpY2UuZ2V0U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25NZXNzYWdlKGNueC5kZWZpbml0aW9uLmxhYmVsLCBwb3RlbnRpYWxCbG9ja3MsIGV4aXN0aW5nU2FuZGJveENvbmZpZyk7XG5cdFx0aWYgKCFzdWdnZXN0aW9uKSB7XG5cdFx0XHQvLyBjbGVhciBwb3RlbnRpYWwgYmxvY2tzIGFzIHRoZXJlIGFyZSBubyBzdWdnZXN0aW9ucyBmb3IgdGhlbS5cblx0XHRcdHRoaXMuX3JlbW92ZVBvdGVudGlhbFNhbmRib3hCbG9ja3MocG90ZW50aWFsQmxvY2tzKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb25maXJtQW5kQXBwbHlTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbihjbngsIHBvdGVudGlhbEJsb2Nrcywgc3VnZ2VzdGlvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maXJtQW5kQXBwbHlTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbihjbng6IElNY3BTZXJ2ZXJDb25uZWN0aW9uLCBwb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgc3VnZ2VzdGlvbjogTm9uTnVsbGFibGU8UmV0dXJuVHlwZTxJTWNwU2FuZGJveFNlcnZpY2VbJ2dldFNhbmRib3hDb25maWdTdWdnZXN0aW9uTWVzc2FnZSddPj4pOiB2b2lkIHtcblx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGNueC5kZWZpbml0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luPy51cmkgPz8gdGhpcy5jb2xsZWN0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luO1xuXHRcdGNvbnN0IGNvbmZpZ1RhcmdldCA9IHRoaXMuX2Z1bGxEZWZpbml0aW9ucy5nZXQoKS5jb2xsZWN0aW9uPy5jb25maWdUYXJnZXQ7XG5cdFx0dGhpcy5faXNTYW5kYm94U3VnZ2VzdGlvbkRpYWxvZ1Zpc2libGUgPSB0cnVlO1xuXG5cdFx0dm9pZCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21jcFNhbmRib3hTdWdnZXN0aW9uLmNvbmZpcm0ubWVzc2FnZScsIFwiVXBkYXRlIHNhbmRib3ggY29uZmlndXJhdGlvbiBpbiBtY3AuanNvbiBmb3IgezB9P1wiLCBjbnguZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRkZXRhaWw6IHN1Z2dlc3Rpb24ubWVzc2FnZSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5jb25maXJtLnllcycsIFwiWWVzXCIpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uY29uZmlybS5ubycsIFwiTm9cIiksXG5cdFx0fSkudGhlbihhc3luYyByZXN1bHQgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtY3BSZXNvdXJjZSB8fCBjb25maWdUYXJnZXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ21jcFNhbmRib3hTdWdnZXN0aW9uLmFwcGx5LnVuYXZhaWxhYmxlJywgXCJDb3VsZG4ndCBkZXRlcm1pbmUgd2hlcmUgdG8gdXBkYXRlIHNhbmRib3ggY29uZmlndXJhdGlvbiBmb3IgezB9LlwiLCBjbnguZGVmaW5pdGlvbi5sYWJlbCkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCB0aGlzLl9tY3BTYW5kYm94U2VydmljZS5hcHBseVNhbmRib3hDb25maWdTdWdnZXN0aW9uKGNueC5kZWZpbml0aW9uLCBtY3BSZXNvdXJjZSwgY29uZmlnVGFyZ2V0LCBwb3RlbnRpYWxCbG9ja3MsIHN1Z2dlc3Rpb24uc2FuZGJveENvbmZpZyk7XG5cdFx0XHRcdGlmICh1cGRhdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVtb3ZlUG90ZW50aWFsU2FuZGJveEJsb2Nrcyhwb3RlbnRpYWxCbG9ja3MpO1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uYXBwbHkuc3VjY2VzcycsIFwiVXBkYXRlZCBzYW5kYm94IGNvbmZpZ3VyYXRpb24gZm9yIHswfSBpbiBtY3AuanNvbi4gUmVzdGFydCBzZXJ2ZXIuXCIsIGNueC5kZWZpbml0aW9uLmxhYmVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbWNwU2FuZGJveFN1Z2dlc3Rpb24uYXBwbHkuZXJyb3InLCBcIkZhaWxlZCB0byB1cGRhdGUgc2FuZGJveCBjb25maWd1cmF0aW9uIGZvciB7MH06IHsxfVwiLCBjbnguZGVmaW5pdGlvbi5sYWJlbCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKSk7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc1NhbmRib3hTdWdnZXN0aW9uRGlhbG9nVmlzaWJsZSA9IGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlY29yZFBvdGVudGlhbFNhbmRib3hCbG9jayhibG9jazogSU1jcFBvdGVudGlhbFNhbmRib3hCbG9jayk6IHZvaWQge1xuXHRcdHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3MucHVzaChibG9jayk7XG5cdFx0aWYgKHRoaXMuX3BvdGVudGlhbFNhbmRib3hCbG9ja3MubGVuZ3RoID4gMjAwKSB7XG5cdFx0XHR0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzLnNwbGljZSgwLCB0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzLmxlbmd0aCAtIDIwMCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb24uZ2V0KCk7XG5cdFx0aWYgKGNvbm5lY3Rpb24/LnN0YXRlLmdldCgpLnN0YXRlID09PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nKSB7XG5cdFx0XHR0aGlzLnNob3dTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbkZyb21Qb3RlbnRpYWxCbG9ja3MoY29ubmVjdGlvbiwgdGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlUG90ZW50aWFsU2FuZGJveEJsb2NrcyhibG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSk6IHZvaWQge1xuXHRcdGlmICghYmxvY2tzLmxlbmd0aCB8fCAhdGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b1JlbW92ZSA9IG5ldyBTZXQoYmxvY2tzKTtcblx0XHR0aGlzLl9wb3RlbnRpYWxTYW5kYm94QmxvY2tzID0gdGhpcy5fcG90ZW50aWFsU2FuZGJveEJsb2Nrcy5maWx0ZXIoYmxvY2sgPT4gIXRvUmVtb3ZlLmhhcyhibG9jaykpO1xuXHR9XG5cblx0cHVibGljIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb24uZ2V0KCk/LnN0b3AoKSB8fCBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdC8qKiBXYWl0cyBmb3IgYW55IG9uZ29pbmcgdG9vbHMgdG8gYmUgcmVmcmVzaGVkIGJlZm9yZSByZXNvbHZpbmcuICovXG5cdHB1YmxpYyBhd2FpdFRvb2xSZWZyZXNoKCkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGF1dG9ydW5TZWxmRGlzcG9zYWJsZShyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fdG9vbHMuZnJvbVNlcnZlclByb21pc2UucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwcm9taXNlPy5wcm9taXNlUmVzdWx0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0TGl2ZURhdGEoKSB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fdG9vbHMuZnJvbVNlcnZlclByb21pc2Uuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0dGhpcy5fcHJvbXB0cy5mcm9tU2VydmVyUHJvbWlzZS5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ub3JtYWxpemVUb29sKG9yaWdpbmFsVG9vbDogTUNQLlRvb2wpOiBQcm9taXNlPFZhbGlkYXRlZE1jcFRvb2wgfCB7IGVycm9yOiBzdHJpbmdbXSB9PiB7XG5cdFx0Ly8gUGFyc2UgTUNQIEFwcHMgVUkgbWV0YWRhdGEgZnJvbSBfbWV0YS51aVxuXHRcdGNvbnN0IHVpTWV0YSA9IG9yaWdpbmFsVG9vbC5fbWV0YT8udWkgYXMgTWNwQXBwcy5NY3BVaVRvb2xNZXRhIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQ29tcHV0ZSB2aXNpYmlsaXR5IGZyb20gX21ldGEudWkudmlzaWJpbGl0eSwgZGVmYXVsdGluZyB0byBNb2RlbCB8IEFwcFxuXHRcdGxldCB2aXNpYmlsaXR5OiBNY3BUb29sVmlzaWJpbGl0eSA9IE1jcFRvb2xWaXNpYmlsaXR5Lk1vZGVsIHwgTWNwVG9vbFZpc2liaWxpdHkuQXBwO1xuXHRcdGlmICh1aU1ldGE/LnZpc2liaWxpdHkgJiYgQXJyYXkuaXNBcnJheSh1aU1ldGEudmlzaWJpbGl0eSkpIHtcblx0XHRcdHZpc2liaWxpdHkgJj0gMDtcblxuXHRcdFx0aWYgKHVpTWV0YS52aXNpYmlsaXR5LmluY2x1ZGVzKCdtb2RlbCcpKSB7XG5cdFx0XHRcdHZpc2liaWxpdHkgfD0gTWNwVG9vbFZpc2liaWxpdHkuTW9kZWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAodWlNZXRhLnZpc2liaWxpdHkuaW5jbHVkZXMoJ2FwcCcpKSB7XG5cdFx0XHRcdHZpc2liaWxpdHkgfD0gTWNwVG9vbFZpc2liaWxpdHkuQXBwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2w6IFZhbGlkYXRlZE1jcFRvb2wgPSB7XG5cdFx0XHQuLi5vcmlnaW5hbFRvb2wsXG5cdFx0XHRzZXJ2ZXJUb29sTmFtZTogb3JpZ2luYWxUb29sLm5hbWUsXG5cdFx0XHRfaWNvbnM6IHRoaXMuX3BhcnNlSWNvbnMob3JpZ2luYWxUb29sKSxcblx0XHRcdHZpc2liaWxpdHksXG5cdFx0XHR1aVJlc291cmNlVXJpOiB1aU1ldGE/LnJlc291cmNlVXJpLFxuXHRcdH07XG5cdFx0aWYgKCF0b29sLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHQvLyBFbnN1cmUgYSBkZXNjcmlwdGlvbiBpcyBwcm92aWRlZCBmb3IgZWFjaCB0b29sLCAjMjQzOTE5XG5cdFx0XHR0aGlzLl9sb2dnZXIud2FybihgVG9vbCAke3Rvb2wubmFtZX0gZG9lcyBub3QgaGF2ZSBhIGRlc2NyaXB0aW9uLiBUb29scyBtdXN0IGJlIGFjY3VyYXRlbHkgZGVzY3JpYmVkIHRvIGJlIGNhbGxlZGApO1xuXHRcdFx0dG9vbC5kZXNjcmlwdGlvbiA9ICc8ZW1wdHk+Jztcblx0XHR9XG5cblx0XHRpZiAodG9vbEludmFsaWRDaGFyUmUudGVzdCh0b29sLm5hbWUpKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIud2FybihgVG9vbCAke0pTT04uc3RyaW5naWZ5KHRvb2wubmFtZSl9IGlzIGludmFsaWQuIFRvb2xzIG5hbWVzIG1heSBvbmx5IGNvbnRhaW4gW2EtejAtOV8tXWApO1xuXHRcdFx0dG9vbC5uYW1lID0gdG9vbC5uYW1lLnJlcGxhY2UodG9vbEludmFsaWRDaGFyUmUsICdfJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyIE1DUCBzcGVjLCBwcm9wZXJ0aWVzIGlzIG9wdGlvbmFsLiBCdXQgSlNPTiBTY2hlbWEgRHJhZnQgNyByZXF1aXJlc1xuXHRcdC8vIGl0IGZvciBvYmplY3QgdHlwZXMuIE5vcm1hbGl6ZSB0aGUgc2NoZW1hIHRvIGluY2x1ZGUgYW4gZW1wdHkgcHJvcGVydGllc1xuXHRcdC8vIG9iamVjdCBpZiBub3QgcHJlc2VudC4gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MTcyM1xuXHRcdGlmICh0b29sLmlucHV0U2NoZW1hICYmICF0b29sLmlucHV0U2NoZW1hLnByb3BlcnRpZXMpIHtcblx0XHRcdHRvb2wuaW5wdXRTY2hlbWEgPSB7IC4uLnRvb2wuaW5wdXRTY2hlbWEsIHByb3BlcnRpZXM6IHt9IH07XG5cdFx0fVxuXG5cdFx0dHlwZSBKc29uRGlhZ25vc3RpYyA9IHsgbWVzc2FnZTogc3RyaW5nOyByYW5nZTogeyBsaW5lOiBudW1iZXI7IGNoYXJhY3RlcjogbnVtYmVyIH1bXSB9O1xuXG5cdFx0bGV0IGRpYWdub3N0aWNzOiBKc29uRGlhZ25vc3RpY1tdID0gW107XG5cdFx0Y29uc3QgdG9vbEpzb24gPSBKU09OLnN0cmluZ2lmeSh0b29sLmlucHV0U2NoZW1hKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2NoZW1hVXJpID0gVVJJLnBhcnNlKCdodHRwczovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEnKTtcblx0XHRcdGRpYWdub3N0aWNzID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SnNvbkRpYWdub3N0aWNbXT4oJ2pzb24udmFsaWRhdGUnLCBzY2hlbWFVcmksIHRvb2xKc29uKSB8fCBbXTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVkIChlcnJvciBpbiBqc29uIGV4dGVuc2lvbj8pO1xuXHRcdH1cblxuXHRcdGlmICghZGlhZ25vc3RpY3MubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdG9vbDtcblx0XHR9XG5cblx0XHQvLyBiZWNhdXNlIGl0J3MgYWxsIG9uZSBsaW5lIGZyb20gSlNPTi5zdHJpbmdpZnksIHdlIGNhbiB0cmVhdCBjaGFyYWN0ZXJzIGFzIG9mZnNldHMuXG5cdFx0Y29uc3QgdHJlZSA9IGpzb24ucGFyc2VUcmVlKHRvb2xKc29uKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IGRpYWdub3N0aWNzLm1hcChkID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSBqc29uLmZpbmROb2RlQXRPZmZzZXQodHJlZSwgZC5yYW5nZVswXS5jaGFyYWN0ZXIpO1xuXHRcdFx0Y29uc3QgcGF0aCA9IG5vZGUgJiYgYC8ke2pzb24uZ2V0Tm9kZVBhdGgobm9kZSkuam9pbignLycpfWA7XG5cdFx0XHRyZXR1cm4gZC5tZXNzYWdlICsgKHBhdGggPyBgIChhdCAke3BhdGh9KWAgOiAnJyk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyBlcnJvcjogbWVzc2FnZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFZhbGlkYXRlZFRvb2xzKHRvb2xzOiBNQ1AuVG9vbFtdKTogUHJvbWlzZTxWYWxpZGF0ZWRNY3BUb29sW10+IHtcblx0XHRsZXQgZXJyb3IgPSAnJztcblxuXHRcdGNvbnN0IHZhbGlkYXRpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwodG9vbHMubWFwKHQgPT4gdGhpcy5fbm9ybWFsaXplVG9vbCh0KSkpO1xuXHRcdGNvbnN0IHZhbGlkYXRlZDogVmFsaWRhdGVkTWNwVG9vbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbaSwgcmVzdWx0XSBvZiB2YWxpZGF0aW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICgnZXJyb3InIGluIHJlc3VsdCkge1xuXHRcdFx0XHRlcnJvciArPSBsb2NhbGl6ZSgnbWNwQmFkU2NoZW1hLnRvb2wnLCAnVG9vbCBgezB9YCBoYXMgaW52YWxpZCBKU09OIHBhcmFtZXRlcnM6JywgdG9vbHNbaV0ubmFtZSkgKyAnXFxuJztcblx0XHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIHJlc3VsdC5lcnJvcikge1xuXHRcdFx0XHRcdGVycm9yICs9IGBcXHQtICR7bWVzc2FnZX1cXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVycm9yICs9IGBcXHQtIFNjaGVtYTogJHtKU09OLnN0cmluZ2lmeSh0b29sc1tpXS5pbnB1dFNjaGVtYSl9XFxuXFxuYDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhbGlkYXRlZC5wdXNoKHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIud2FybihgJHt0b29scy5sZW5ndGggLSB2YWxpZGF0ZWQubGVuZ3RofSB0b29scyBoYXZlIGludmFsaWQgSlNPTiBzY2hlbWFzIGFuZCB3aWxsIGJlIG9taXR0ZWRgKTtcblx0XHRcdHdhcm5JbnZhbGlkVG9vbHModGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuZGVmaW5pdGlvbi5sYWJlbCwgZXJyb3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiB2YWxpZGF0ZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUGFyc2VzIGluY29taW5nIE1DUCBpY29ucyBhbmQgcmV0dXJucyB0aGUgcmVzdWx0aW5nICdzdG9yZWQnIHJlY29yZC4gTm90ZVxuXHQgKiB0aGF0IHRoaXMgcmVxdWlyZXMgYW4gYWN0aXZlIE1DUCBzZXJ2ZXIgY29ubmVjdGlvbiBzaW5jZSB3ZSB2YWxpZGF0ZVxuXHQgKiBhZ2FpbnN0IHNvbWUgb2YgdGhhdCBjb25uZWN0aW9uJ3MgZGF0YS4gVGhlIGljb25zIG1heSBob3dldmVyIGJlIHN0b3JlZFxuXHQgKiBhbmQgcmVoeWRyYXRlZCBsYXRlci5cblx0ICovXG5cdHByaXZhdGUgX3BhcnNlSWNvbnMoaWNvbnM6IE1DUC5JY29ucykge1xuXHRcdGNvbnN0IGNueCA9IHRoaXMuX2Nvbm5lY3Rpb24uZ2V0KCk7XG5cdFx0aWYgKCFjbngpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyc2VBbmRWYWxpZGF0ZU1jcEljb24oaWNvbnMsIGNueC5sYXVuY2hEZWZpbml0aW9uLCB0aGlzLl9sb2dnZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2VydmVyVG9vbHMobm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9vbHNQcm9taXNlOiBQcm9taXNlPE1DUC5Ub29sW10+LCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgdG9vbFByb21pc2VTYWZlID0gdG9vbHNQcm9taXNlLnRoZW4oYXN5bmMgdG9vbHMgPT4ge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYERpc2NvdmVyZWQgJHt0b29scy5sZW5ndGh9IHRvb2xzYCk7XG5cdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5fZ2V0VmFsaWRhdGVkVG9vbHModG9vbHMpO1xuXHRcdFx0dGhpcy5fcHJpbWl0aXZlQ2FjaGUuc3RvcmUodGhpcy5kZWZpbml0aW9uLmlkLCB7IHRvb2xzOiBkYXRhLCBub25jZSB9KTtcblx0XHRcdHJldHVybiB7IGRhdGEsIG5vbmNlIH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fdG9vbHMuZnJvbVNlcnZlclByb21pc2Uuc2V0KG5ldyBPYnNlcnZhYmxlUHJvbWlzZSh0b29sUHJvbWlzZVNhZmUpLCB0eCk7XG5cdFx0cmV0dXJuIHRvb2xQcm9taXNlU2FmZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFNlcnZlclByb21wdHMobm9uY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgcHJvbXB0c1Byb21pc2U6IFByb21pc2U8TUNQLlByb21wdFtdPiwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHByb21wdHNQcm9taXNlU2FmZSA9IHByb21wdHNQcm9taXNlLnRoZW4oKHJlc3VsdCk6IHsgZGF0YTogU3RvcmVkTWNwUHJvbXB0W107IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSA9PiB7XG5cdFx0XHRjb25zdCBkYXRhOiBTdG9yZWRNY3BQcm9tcHRbXSA9IHJlc3VsdC5tYXAocHJvbXB0ID0+ICh7XG5cdFx0XHRcdC4uLnByb21wdCxcblx0XHRcdFx0X2ljb25zOiB0aGlzLl9wYXJzZUljb25zKHByb21wdClcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3ByaW1pdGl2ZUNhY2hlLnN0b3JlKHRoaXMuZGVmaW5pdGlvbi5pZCwgeyBwcm9tcHRzOiBkYXRhLCBub25jZSB9KTtcblx0XHRcdHJldHVybiB7IGRhdGEsIG5vbmNlIH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9wcm9tcHRzLmZyb21TZXJ2ZXJQcm9taXNlLnNldChuZXcgT2JzZXJ2YWJsZVByb21pc2UocHJvbXB0c1Byb21pc2VTYWZlKSwgdHgpO1xuXHRcdHJldHVybiBwcm9tcHRzUHJvbWlzZVNhZmU7XG5cdH1cblxuXHRwcml2YXRlIF90b1N0b3JlZE1ldGFkYXRhKHNlcnZlckluZm8/OiBNQ1AuSW1wbGVtZW50YXRpb24sIGluc3RydWN0aW9ucz86IHN0cmluZyk6IFN0b3JlZFNlcnZlck1ldGFkYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VydmVyTmFtZTogc2VydmVySW5mbyA/IHNlcnZlckluZm8udGl0bGUgfHwgc2VydmVySW5mby5uYW1lIDogdW5kZWZpbmVkLFxuXHRcdFx0c2VydmVySW5zdHJ1Y3Rpb25zOiBpbnN0cnVjdGlvbnMsXG5cdFx0XHRzZXJ2ZXJJY29uczogc2VydmVySW5mbyA/IHRoaXMuX3BhcnNlSWNvbnMoc2VydmVySW5mbykgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFNlcnZlck1ldGFkYXRhKFxuXHRcdG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0eyBzZXJ2ZXJJbmZvLCBpbnN0cnVjdGlvbnMsIGNhcGFiaWxpdGllcyB9OiB7IHNlcnZlckluZm86IE1DUC5JbXBsZW1lbnRhdGlvbjsgaW5zdHJ1Y3Rpb25zOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNhcGFiaWxpdGllczogTUNQLlNlcnZlckNhcGFiaWxpdGllcyB9LFxuXHRcdHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBTdG9yZWRTZXJ2ZXJNZXRhZGF0YSA9IHRoaXMuX3RvU3RvcmVkTWV0YWRhdGEoc2VydmVySW5mbywgaW5zdHJ1Y3Rpb25zKTtcblx0XHR0aGlzLl9zZXJ2ZXJNZXRhZGF0YS5mcm9tU2VydmVyUHJvbWlzZS5zZXQoT2JzZXJ2YWJsZVByb21pc2UucmVzb2x2ZWQoeyBub25jZSwgZGF0YTogc2VydmVyTWV0YWRhdGEgfSksIHR4KTtcblxuXHRcdGNvbnN0IGNhcGFiaWxpdGllc0VuY29kZWQgPSBlbmNvZGVDYXBhYmlsaXRpZXMoY2FwYWJpbGl0aWVzKTtcblx0XHR0aGlzLl9jYXBhYmlsaXRpZXMuZnJvbVNlcnZlclByb21pc2Uuc2V0KE9ic2VydmFibGVQcm9taXNlLnJlc29sdmVkKHsgZGF0YTogY2FwYWJpbGl0aWVzRW5jb2RlZCwgbm9uY2UgfSksIHR4KTtcblx0XHR0aGlzLl9wcmltaXRpdmVDYWNoZS5zdG9yZSh0aGlzLmRlZmluaXRpb24uaWQsIHsgLi4uc2VydmVyTWV0YWRhdGEsIG5vbmNlLCBjYXBhYmlsaXRpZXM6IGNhcGFiaWxpdGllc0VuY29kZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9wb3B1bGF0ZUxpdmVEYXRhKGhhbmRsZXI6IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyLCBjYWNoZU5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCB1cGRhdGVUb29scyA9ICh0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sUHJvbWlzZSA9IGhhbmRsZXIuY2FwYWJpbGl0aWVzLnRvb2xzID8gaGFuZGxlci5saXN0VG9vbHMoe30sIGN0cy50b2tlbikgOiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NldFNlcnZlclRvb2xzKGNhY2hlTm9uY2UsIHRvb2xQcm9taXNlLCB0eCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVwZGF0ZVByb21wdHMgPSAodHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbXB0c1Byb21pc2UgPSBoYW5kbGVyLmNhcGFiaWxpdGllcy5wcm9tcHRzID8gaGFuZGxlci5saXN0UHJvbXB0cyh7fSwgY3RzLnRva2VuKSA6IFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0U2VydmVyUHJvbXB0cyhjYWNoZU5vbmNlLCBwcm9tcHRzUHJvbWlzZSwgdHgpO1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoaGFuZGxlci5vbkRpZENoYW5nZVRvb2xMaXN0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdUb29sIGxpc3QgY2hhbmdlZCwgcmVmcmVzaGluZyB0b29scy4uLicpO1xuXHRcdFx0dXBkYXRlVG9vbHModW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoaGFuZGxlci5vbkRpZENoYW5nZVByb21wdExpc3QoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1Byb21wdHMgbGlzdCBjaGFuZ2VkLCByZWZyZXNoaW5nIHByb21wdHMuLi4nKTtcblx0XHRcdHVwZGF0ZVByb21wdHModW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zZXRTZXJ2ZXJNZXRhZGF0YShjYWNoZU5vbmNlLCB7IHNlcnZlckluZm86IGhhbmRsZXIuc2VydmVySW5mbywgaW5zdHJ1Y3Rpb25zOiBoYW5kbGVyLnNlcnZlckluc3RydWN0aW9ucywgY2FwYWJpbGl0aWVzOiBoYW5kbGVyLmNhcGFiaWxpdGllcyB9LCB0eCk7XG5cdFx0XHR1cGRhdGVQcm9tcHRzKHR4KTtcblx0XHRcdGNvbnN0IHRvb2xVcGRhdGUgPSB1cGRhdGVUb29scyh0eCk7XG5cblx0XHRcdHRvb2xVcGRhdGUudGhlbih0b29scyA9PiB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXJ2ZXJCb290RGF0YSwgU2VydmVyQm9vdENsYXNzaWZpY2F0aW9uPignbWNwL3NlcnZlckJvb3QnLCB7XG5cdFx0XHRcdFx0c3VwcG9ydHNMb2dnaW5nOiAhIWhhbmRsZXIuY2FwYWJpbGl0aWVzLmxvZ2dpbmcsXG5cdFx0XHRcdFx0c3VwcG9ydHNQcm9tcHRzOiAhIWhhbmRsZXIuY2FwYWJpbGl0aWVzLnByb21wdHMsXG5cdFx0XHRcdFx0c3VwcG9ydHNSZXNvdXJjZXM6ICEhaGFuZGxlci5jYXBhYmlsaXRpZXMucmVzb3VyY2VzLFxuXHRcdFx0XHRcdHRvb2xDb3VudDogdG9vbHMuZGF0YS5sZW5ndGgsXG5cdFx0XHRcdFx0c2VydmVyTmFtZTogaGFuZGxlci5zZXJ2ZXJJbmZvLm5hbWUsXG5cdFx0XHRcdFx0c2VydmVyVmVyc2lvbjogaGFuZGxlci5zZXJ2ZXJJbmZvLnZlcnNpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgTWNwUHJvbXB0IGltcGxlbWVudHMgSU1jcFByb21wdCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmd1bWVudHM6IHJlYWRvbmx5IE1DUC5Qcm9tcHRBcmd1bWVudFtdO1xuXHRyZWFkb25seSBpY29uczogSU1jcEljb25zO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlcjogTWNwU2VydmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlZmluaXRpb246IFN0b3JlZE1jcFByb21wdCxcblx0KSB7XG5cdFx0dGhpcy5pZCA9IG1jcFByb21wdFJlcGxhY2VTcGVjaWFsQ2hhcnModGhpcy5fc2VydmVyLmRlZmluaXRpb24ubGFiZWwgKyAnLicgKyBfZGVmaW5pdGlvbi5uYW1lKTtcblx0XHR0aGlzLm5hbWUgPSBfZGVmaW5pdGlvbi5uYW1lO1xuXHRcdHRoaXMudGl0bGUgPSBfZGVmaW5pdGlvbi50aXRsZTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gX2RlZmluaXRpb24uZGVzY3JpcHRpb247XG5cdFx0dGhpcy5hcmd1bWVudHMgPSBfZGVmaW5pdGlvbi5hcmd1bWVudHMgfHwgW107XG5cdFx0dGhpcy5pY29ucyA9IE1jcEljb25zLmZyb21TdG9yZWQodGhpcy5fZGVmaW5pdGlvbi5faWNvbnMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZShhcmdzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTWNwUHJvbXB0TWVzc2FnZVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgTWNwU2VydmVyLmNhbGxPbih0aGlzLl9zZXJ2ZXIsIGggPT4gaC5nZXRQcm9tcHQoeyBuYW1lOiB0aGlzLl9kZWZpbml0aW9uLm5hbWUsIGFyZ3VtZW50czogYXJncyB9LCB0b2tlbiksIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0Lm1lc3NhZ2VzO1xuXHR9XG5cblx0YXN5bmMgY29tcGxldGUoYXJndW1lbnQ6IHN0cmluZywgcHJlZml4OiBzdHJpbmcsIGFscmVhZHlSZXNvbHZlZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBNY3BTZXJ2ZXIuY2FsbE9uKHRoaXMuX3NlcnZlciwgaCA9PiBoLmNvbXBsZXRlKHtcblx0XHRcdHJlZjogeyB0eXBlOiAncmVmL3Byb21wdCcsIG5hbWU6IHRoaXMuX2RlZmluaXRpb24ubmFtZSB9LFxuXHRcdFx0YXJndW1lbnQ6IHsgbmFtZTogYXJndW1lbnQsIHZhbHVlOiBwcmVmaXggfSxcblx0XHRcdGNvbnRleHQ6IHsgYXJndW1lbnRzOiBhbHJlYWR5UmVzb2x2ZWQgfSxcblx0XHR9LCB0b2tlbiksIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0LmNvbXBsZXRpb24udmFsdWVzO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVuY29kZUNhcGFiaWxpdGllcyhjYXA6IE1DUC5TZXJ2ZXJDYXBhYmlsaXRpZXMpOiBNY3BDYXBhYmlsaXR5IHtcblx0bGV0IG91dCA9IDA7XG5cdGlmIChjYXAubG9nZ2luZykgeyBvdXQgfD0gTWNwQ2FwYWJpbGl0eS5Mb2dnaW5nOyB9XG5cdGlmIChjYXAuY29tcGxldGlvbnMpIHsgb3V0IHw9IE1jcENhcGFiaWxpdHkuQ29tcGxldGlvbnM7IH1cblx0aWYgKGNhcC5wcm9tcHRzKSB7XG5cdFx0b3V0IHw9IE1jcENhcGFiaWxpdHkuUHJvbXB0cztcblx0XHRpZiAoY2FwLnByb21wdHMubGlzdENoYW5nZWQpIHtcblx0XHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlByb21wdHNMaXN0Q2hhbmdlZDtcblx0XHR9XG5cdH1cblx0aWYgKGNhcC5yZXNvdXJjZXMpIHtcblx0XHRvdXQgfD0gTWNwQ2FwYWJpbGl0eS5SZXNvdXJjZXM7XG5cdFx0aWYgKGNhcC5yZXNvdXJjZXMuc3Vic2NyaWJlKSB7XG5cdFx0XHRvdXQgfD0gTWNwQ2FwYWJpbGl0eS5SZXNvdXJjZXNTdWJzY3JpYmU7XG5cdFx0fVxuXHRcdGlmIChjYXAucmVzb3VyY2VzLmxpc3RDaGFuZ2VkKSB7XG5cdFx0XHRvdXQgfD0gTWNwQ2FwYWJpbGl0eS5SZXNvdXJjZXNMaXN0Q2hhbmdlZDtcblx0XHR9XG5cdH1cblx0aWYgKGNhcC50b29scykge1xuXHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlRvb2xzO1xuXHRcdGlmIChjYXAudG9vbHMubGlzdENoYW5nZWQpIHtcblx0XHRcdG91dCB8PSBNY3BDYXBhYmlsaXR5LlRvb2xzTGlzdENoYW5nZWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BUb29sIGltcGxlbWVudHMgSU1jcFRvb2wge1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlZmVyZW5jZU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbnM6IElNY3BJY29ucztcblx0cmVhZG9ubHkgdmlzaWJpbGl0eTogTWNwVG9vbFZpc2liaWxpdHk7XG5cblx0cHVibGljIGdldCBkZWZpbml0aW9uKCk6IE1DUC5Ub29sIHsgcmV0dXJuIHRoaXMuX2RlZmluaXRpb247IH1cblx0cHVibGljIGdldCB1aVJlc291cmNlVXJpKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9kZWZpbml0aW9uLnVpUmVzb3VyY2VVcmk7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXI6IE1jcFNlcnZlcixcblx0XHRpZFByZWZpeDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlZmluaXRpb246IFZhbGlkYXRlZE1jcFRvb2wsXG5cdFx0QElNY3BFbGljaXRhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWxpY2l0YXRpb25TZXJ2aWNlOiBJTWNwRWxpY2l0YXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLnJlZmVyZW5jZU5hbWUgPSBfZGVmaW5pdGlvbi5uYW1lLnJlcGxhY2VBbGwoJy4nLCAnXycpO1xuXHRcdHRoaXMuaWQgPSAoaWRQcmVmaXggKyBfZGVmaW5pdGlvbi5uYW1lKS5yZXBsYWNlQWxsKCcuJywgJ18nKS5zbGljZSgwLCBNY3BUb29sTmFtZS5NYXhMZW5ndGgpO1xuXHRcdHRoaXMuaWNvbnMgPSBNY3BJY29ucy5mcm9tU3RvcmVkKHRoaXMuX2RlZmluaXRpb24uX2ljb25zKTtcblx0XHR0aGlzLnZpc2liaWxpdHkgPSBfZGVmaW5pdGlvbi52aXNpYmlsaXR5ID8/IChNY3BUb29sVmlzaWJpbGl0eS5Nb2RlbCB8IE1jcFRvb2xWaXNpYmlsaXR5LkFwcCk7XG5cdH1cblxuXHRhc3luYyBjYWxsKHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGNvbnRleHQ/OiBJTWNwVG9vbENhbGxDb250ZXh0LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRpZiAoY29udGV4dCkgeyB0aGlzLl9zZXJ2ZXIucnVubmluZ1Rvb2xDYWxscy5hZGQoY29udGV4dCk7IH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2NhbGxXaXRoUHJvZ3Jlc3MocGFyYW1zLCB1bmRlZmluZWQsIGNvbnRleHQsIHRva2VuKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKGNvbnRleHQpIHsgdGhpcy5fc2VydmVyLnJ1bm5pbmdUb29sQ2FsbHMuZGVsZXRlKGNvbnRleHQpOyB9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2FsbFdpdGhQcm9ncmVzcyhwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCBjb250ZXh0PzogSU1jcFRvb2xDYWxsQ29udGV4dCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNhbGxUb29sUmVzdWx0PiB7XG5cdFx0aWYgKGNvbnRleHQpIHsgdGhpcy5fc2VydmVyLnJ1bm5pbmdUb29sQ2FsbHMuYWRkKGNvbnRleHQpOyB9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9jYWxsV2l0aFByb2dyZXNzKHBhcmFtcywgcHJvZ3Jlc3MsIGNvbnRleHQsIHRva2VuKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKGNvbnRleHQpIHsgdGhpcy5fc2VydmVyLnJ1bm5pbmdUb29sQ2FsbHMuZGVsZXRlKGNvbnRleHQpOyB9XG5cdFx0fVxuXHR9XG5cblx0X2NhbGxXaXRoUHJvZ3Jlc3MocGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcyB8IHVuZGVmaW5lZCwgY29udGV4dD86IElNY3BUb29sQ2FsbENvbnRleHQsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgYWxsb3dSZXRyeSA9IHRydWUpOiBQcm9taXNlPE1DUC5DYWxsVG9vbFJlc3VsdD4ge1xuXHRcdC8vIHNlcnZlclRvb2xOYW1lIGlzIGFsd2F5cyBzZXQgbm93LCBidXQgb2xkZXIgY2FjaGUgZW50cmllcyAoZnJvbSAxLjk5LUluc2lkZXJzKSBtYXkgbm90IGhhdmUgaXQuXG5cdFx0Y29uc3QgbmFtZSA9IHRoaXMuX2RlZmluaXRpb24uc2VydmVyVG9vbE5hbWUgPz8gdGhpcy5fZGVmaW5pdGlvbi5uYW1lO1xuXHRcdGNvbnN0IHByb2dyZXNzVG9rZW4gPSBwcm9ncmVzcyA/IGdlbmVyYXRlVXVpZCgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0cmV0dXJuIE1jcFNlcnZlci5jYWxsT24odGhpcy5fc2VydmVyLCBhc3luYyBoID0+IHtcblx0XHRcdGlmIChwcm9ncmVzcykge1xuXHRcdFx0XHRzdG9yZS5hZGQoaC5vbkRpZFJlY2VpdmVQcm9ncmVzc05vdGlmaWNhdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLnBhcmFtcy5wcm9ncmVzc1Rva2VuID09PSBwcm9ncmVzc1Rva2VuKSB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBlLnBhcmFtcy5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRwcm9ncmVzczogZS5wYXJhbXMudG90YWwgIT09IHVuZGVmaW5lZCAmJiBlLnBhcmFtcy5wcm9ncmVzcyAhPT0gdW5kZWZpbmVkID8gZS5wYXJhbXMucHJvZ3Jlc3MgLyBlLnBhcmFtcy50b3RhbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgcHJvZ3Jlc3NUb2tlbiB9O1xuXHRcdFx0aWYgKGNvbnRleHQ/LmNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0bWV0YVsndnNjb2RlLmNvbnZlcnNhdGlvbklkJ10gPSBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRleHQ/LmNoYXRSZXF1ZXN0SWQpIHtcblx0XHRcdFx0bWV0YVsndnNjb2RlLnJlcXVlc3RJZCddID0gY29udGV4dC5jaGF0UmVxdWVzdElkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUHJvcGFnYXRlIFczQyB0cmFjZSBjb250ZXh0IHRvIHRoZSBNQ1Agc2VydmVyIChNQ1AgU0VQLTQxNCkgc28gc2VydmVyLXNpZGVcblx0XHRcdC8vIHNwYW5zIGNhbiBiZSBjb3JyZWxhdGVkIHdpdGggdGhlIGNsaWVudCB0cmFjZS5cblx0XHRcdGlmIChjb250ZXh0Py50cmFjZXBhcmVudCkge1xuXHRcdFx0XHRtZXRhWyd0cmFjZXBhcmVudCddID0gY29udGV4dC50cmFjZXBhcmVudDtcblx0XHRcdFx0aWYgKGNvbnRleHQudHJhY2VzdGF0ZSkge1xuXHRcdFx0XHRcdG1ldGFbJ3RyYWNlc3RhdGUnXSA9IGNvbnRleHQudHJhY2VzdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXNrSGludCA9IHRoaXMuX2RlZmluaXRpb24uZXhlY3V0aW9uPy50YXNrU3VwcG9ydDtcblx0XHRcdGNvbnN0IHNlcnZlclN1cHBvcnRzVGFza3NGb3JUb29scyA9IGguY2FwYWJpbGl0aWVzLnRhc2tzPy5yZXF1ZXN0cz8udG9vbHM/LmNhbGwgIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNob3VsZFVzZVRhc2sgPSBzZXJ2ZXJTdXBwb3J0c1Rhc2tzRm9yVG9vbHMgJiYgKHRhc2tIaW50ID09PSAncmVxdWlyZWQnIHx8IHRhc2tIaW50ID09PSAnb3B0aW9uYWwnKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaC5jYWxsVG9vbCh7XG5cdFx0XHRcdFx0bmFtZSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IHBhcmFtcyxcblx0XHRcdFx0XHR0YXNrOiBzaG91bGRVc2VUYXNrID8ge30gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IG1ldGEsXG5cdFx0XHRcdH0sIHRva2VuLCBwcm9ncmVzcyA/IChtZXNzYWdlKSA9PiBwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlIH0pIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0b29scyB0byByZWZyZXNoIGZvciBkeW5hbWljIHNlcnZlcnMgKCMyNjE2MTEpXG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlci5hd2FpdFRvb2xSZWZyZXNoKCk7XG5cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyBIYW5kbGUgVVJMIGVsaWNpdGF0aW9uIHJlcXVpcmVkIGVycm9yXG5cdFx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBNcGNSZXNwb25zZUVycm9yICYmIGVyci5jb2RlID09PSBNQ1AuVVJMX0VMSUNJVEFUSU9OX1JFUVVJUkVEICYmIGFsbG93UmV0cnkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVFbGljaXRhdGlvbkVycihlcnIsIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY2FsbFdpdGhQcm9ncmVzcyhwYXJhbXMsIHByb2dyZXNzLCBjb250ZXh0LCB0b2tlbiwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdFx0XHRpZiAoYWxsb3dSZXRyeSAmJiBzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IgJiYgc3RhdGUuc2hvdWxkUmV0cnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY2FsbFdpdGhQcm9ncmVzcyhwYXJhbXMsIHByb2dyZXNzLCBjb250ZXh0LCB0b2tlbiwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0sIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUVsaWNpdGF0aW9uRXJyKGVycjogTXBjUmVzcG9uc2VFcnJvciwgY29udGV4dDogSU1jcFRvb2xDYWxsQ29udGV4dCB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3QgZWxpY2l0YXRpb25zID0gKGVyci5kYXRhIGFzIE1DUC5VUkxFbGljaXRhdGlvblJlcXVpcmVkRXJyb3JbJ2Vycm9yJ11bJ2RhdGEnXSk/LmVsaWNpdGF0aW9ucztcblx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGljaXRhdGlvbnMpICYmIGVsaWNpdGF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVsaWNpdGF0aW9uIG9mIGVsaWNpdGF0aW9ucykge1xuXHRcdFx0XHRjb25zdCBlbGljaXRSZXN1bHQgPSBhd2FpdCB0aGlzLl9lbGljaXRhdGlvblNlcnZpY2UuZWxpY2l0KHRoaXMuX3NlcnZlciwgY29udGV4dCwgZWxpY2l0YXRpb24sIHRva2VuKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChlbGljaXRSZXN1bHQudmFsdWUuYWN0aW9uICE9PSAnYWNjZXB0Jykge1xuXHRcdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlbGljaXRSZXN1bHQua2luZCA9PT0gRWxpY2l0YXRpb25LaW5kLlVSTCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgZWxpY2l0UmVzdWx0LndhaXQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGVsaWNpdFJlc3VsdC5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb21wYXJlKG90aGVyOiBJTWNwVG9vbCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmluaXRpb24ubmFtZS5sb2NhbGVDb21wYXJlKG90aGVyLmRlZmluaXRpb24ubmFtZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gd2FybkludmFsaWRUb29scyhpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgc2VydmVyTmFtZTogc3RyaW5nLCBlcnJvclRleHQ6IHN0cmluZykge1xuXHRpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbWNwQmFkU2NoZW1hJywgJ01DUCBzZXJ2ZXIgYHswfWAgaGFzIHRvb2xzIHdpdGggaW52YWxpZCBwYXJhbWV0ZXJzIHdoaWNoIHdpbGwgYmUgb21pdHRlZC4nLCBzZXJ2ZXJOYW1lKSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeTogW3tcblx0XHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0aWQ6ICdtY3BCYWRTY2hlbWEuc2hvdycsXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BCYWRTY2hlbWEuc2hvdycsICdTaG93JyksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50czogZXJyb3JUZXh0LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cblxuY2xhc3MgTWNwUmVzb3VyY2UgaW1wbGVtZW50cyBJTWNwUmVzb3VyY2Uge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgbWNwVXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbWltZVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2l6ZUluQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZXJ2ZXI6IE1jcFNlcnZlcixcblx0XHRvcmlnaW5hbDogTUNQLlJlc291cmNlLFxuXHRcdHB1YmxpYyByZWFkb25seSBpY29uczogSU1jcEljb25zLFxuXHQpIHtcblx0XHR0aGlzLm1jcFVyaSA9IG9yaWdpbmFsLnVyaTtcblx0XHR0aGlzLnRpdGxlID0gb3JpZ2luYWwudGl0bGU7XG5cdFx0dGhpcy51cmkgPSBNY3BSZXNvdXJjZVVSSS5mcm9tU2VydmVyKHNlcnZlci5kZWZpbml0aW9uLCBvcmlnaW5hbC51cmkpO1xuXHRcdHRoaXMubmFtZSA9IG9yaWdpbmFsLm5hbWU7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IG9yaWdpbmFsLmRlc2NyaXB0aW9uO1xuXHRcdHRoaXMubWltZVR5cGUgPSBvcmlnaW5hbC5taW1lVHlwZTtcblx0XHR0aGlzLnNpemVJbkJ5dGVzID0gb3JpZ2luYWwuc2l6ZTtcblx0fVxufVxuXG5jbGFzcyBNY3BSZXNvdXJjZVRlbXBsYXRlIGltcGxlbWVudHMgSU1jcFJlc291cmNlVGVtcGxhdGUge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgbWltZVR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlOiBVcmlUZW1wbGF0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXI6IE1jcFNlcnZlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWZpbml0aW9uOiBNQ1AuUmVzb3VyY2VUZW1wbGF0ZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWNvbnM6IElNY3BJY29ucyxcblx0KSB7XG5cdFx0dGhpcy5uYW1lID0gX2RlZmluaXRpb24ubmFtZTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gX2RlZmluaXRpb24uZGVzY3JpcHRpb247XG5cdFx0dGhpcy5taW1lVHlwZSA9IF9kZWZpbml0aW9uLm1pbWVUeXBlO1xuXHRcdHRoaXMudGl0bGUgPSBfZGVmaW5pdGlvbi50aXRsZTtcblx0XHR0aGlzLnRlbXBsYXRlID0gVXJpVGVtcGxhdGUucGFyc2UoX2RlZmluaXRpb24udXJpVGVtcGxhdGUpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVVUkkodmFyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBVUkkge1xuXHRcdGNvbnN0IHNlcnZlclVyaSA9IHRoaXMudGVtcGxhdGUucmVzb2x2ZSh2YXJzKTtcblx0XHRyZXR1cm4gTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcih0aGlzLl9zZXJ2ZXIuZGVmaW5pdGlvbiwgc2VydmVyVXJpKTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRlKHRlbXBsYXRlUGFydDogc3RyaW5nLCBwcmVmaXg6IHN0cmluZywgYWxyZWFkeVJlc29sdmVkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT4sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgTWNwU2VydmVyLmNhbGxPbih0aGlzLl9zZXJ2ZXIsIGggPT4gaC5jb21wbGV0ZSh7XG5cdFx0XHRyZWY6IHsgdHlwZTogJ3JlZi9yZXNvdXJjZScsIHVyaTogdGhpcy5fZGVmaW5pdGlvbi51cmlUZW1wbGF0ZSB9LFxuXHRcdFx0YXJndW1lbnQ6IHsgbmFtZTogdGVtcGxhdGVQYXJ0LCB2YWx1ZTogcHJlZml4IH0sXG5cdFx0XHRjb250ZXh0OiB7XG5cdFx0XHRcdGFyZ3VtZW50czogbWFwVmFsdWVzKGFscmVhZHlSZXNvbHZlZCwgdiA9PiBBcnJheS5pc0FycmF5KHYpID8gdi5qb2luKCcvJykgOiB2KSxcblx0XHRcdH0sXG5cdFx0fSwgdG9rZW4pLCB0b2tlbik7XG5cdFx0cmV0dXJuIHJlc3VsdC5jb21wbGV0aW9uLnZhbHVlcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1Qix1QkFBdUIsaUJBQWlCO0FBQ3hFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFVBQVU7QUFDdEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZLGlCQUEwQyxtQkFBbUIsb0JBQW9CO0FBQ3RHLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFNBQVMsdUJBQXVCLFNBQVMsbUJBQW1CLDJCQUErRSxxQkFBcUIsbUJBQW1CLGlCQUFpQixtQkFBbUI7QUFDaE8sU0FBUyxnQkFBZ0I7QUFD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
