import { equals } from "../../../../base/common/arrays.js";
import { assertNever, softAssertNever } from "../../../../base/common/assert.js";
import { DeferredPromise, disposableTimeout, IntervalTimer, isThenable } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { JsonRpcError, JsonRpcProtocol } from "../../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, ObservablePromise, observableValue, transaction } from "../../../../base/common/observable.js";
import { canLog, log, LogLevel } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { McpConnectionState, McpError, MpcResponseError } from "./mcpTypes.js";
import { isTaskResult, translateMcpLogMessage } from "./mcpTypesUtils.js";
import { MCP } from "./modelContextProtocol.js";
class McpServerRequestHandler extends Disposable {
  constructor({
    launch,
    logger,
    createMessageRequestHandler,
    elicitationRequestHandler,
    requestLogLevel = LogLevel.Debug,
    taskManager
  }) {
    super();
    this._hasAnnouncedRoots = false;
    this._roots = [];
    // Event emitters for server notifications
    this._onDidReceiveCancelledNotification = this._register(new Emitter());
    this.onDidReceiveCancelledNotification = this._onDidReceiveCancelledNotification.event;
    this._onDidReceiveProgressNotification = this._register(new Emitter());
    this.onDidReceiveProgressNotification = this._onDidReceiveProgressNotification.event;
    this._onDidReceiveElicitationCompleteNotification = this._register(new Emitter());
    this.onDidReceiveElicitationCompleteNotification = this._onDidReceiveElicitationCompleteNotification.event;
    this._onDidChangeResourceList = this._register(new Emitter());
    this.onDidChangeResourceList = this._onDidChangeResourceList.event;
    this._onDidUpdateResource = this._register(new Emitter());
    this.onDidUpdateResource = this._onDidUpdateResource.event;
    this._onDidChangeToolList = this._register(new Emitter());
    this.onDidChangeToolList = this._onDidChangeToolList.event;
    this._onDidChangePromptList = this._register(new Emitter());
    this.onDidChangePromptList = this._onDidChangePromptList.event;
    this._launch = launch;
    this.logger = logger;
    this._requestLogLevel = requestLogLevel;
    this._createMessageRequestHandler = createMessageRequestHandler;
    this._elicitationRequestHandler = elicitationRequestHandler;
    this._taskManager = taskManager;
    this._rpc = this._register(new JsonRpcProtocol(
      (message) => this.send(message),
      {
        handleRequest: (request, token) => this.handleServerRequest(request, token),
        handleNotification: (notification) => this.handleServerNotification(notification)
      }
    ));
    this._taskManager.setHandler(this);
    this._register(this._taskManager.onDidUpdateTask((task) => {
      this.send({
        jsonrpc: MCP.JSONRPC_VERSION,
        method: "notifications/tasks/status",
        params: task
      });
    }));
    this._register(toDisposable(() => this._taskManager.setHandler(void 0)));
    this._register(launch.onDidReceiveMessage((message) => {
      if (canLog(this.logger.getLevel(), this._requestLogLevel)) {
        log(this.logger, this._requestLogLevel, `[server -> editor] ${JSON.stringify(message)}`);
      }
      void this._rpc.handleMessage(message);
    }));
    this._register(autorun((reader) => {
      const state = launch.state.read(reader).state;
      if (state === McpConnectionState.Kind.Error || state === McpConnectionState.Kind.Stopped) {
        this.cancelAllRequests();
      }
    }));
    this._register(logger.onDidChangeLogLevel((logLevel) => {
      this._sendLogLevelToServer(logLevel);
    }));
  }
  set roots(roots) {
    if (!equals(this._roots, roots)) {
      this._roots = roots;
      if (this._hasAnnouncedRoots) {
        this.sendNotification({ method: "notifications/roots/list_changed" });
        this._hasAnnouncedRoots = false;
      }
    }
  }
  get capabilities() {
    return this._serverInit.capabilities;
  }
  get serverInfo() {
    return this._serverInit.serverInfo;
  }
  get serverInstructions() {
    return this._serverInit.instructions;
  }
  /**
   * Connects to the MCP server and does the initialization handshake.
   * @throws MpcResponseError if the server fails to initialize.
   */
  static async create(instaService, opts, token) {
    const mcp = new McpServerRequestHandler(opts);
    const store = new DisposableStore();
    try {
      const timer = store.add(new IntervalTimer());
      timer.cancelAndSet(() => {
        opts.logger.info("Waiting for server to respond to `initialize` request...");
      }, 5e3);
      await instaService.invokeFunction(async (accessor) => {
        const productService = accessor.get(IProductService);
        const initialized = await mcp.sendRequest({
          method: "initialize",
          params: {
            protocolVersion: MCP.LATEST_PROTOCOL_VERSION,
            capabilities: {
              roots: { listChanged: true },
              sampling: opts.createMessageRequestHandler ? {} : void 0,
              elicitation: opts.elicitationRequestHandler ? { form: {}, url: {} } : void 0,
              tasks: {
                list: {},
                cancel: {},
                requests: {
                  sampling: opts.createMessageRequestHandler ? { createMessage: {} } : void 0,
                  elicitation: opts.elicitationRequestHandler ? { create: {} } : void 0
                }
              },
              extensions: {
                "io.modelcontextprotocol/ui": {
                  mimeTypes: ["text/html;profile=mcp-app"]
                }
              }
            },
            clientInfo: {
              name: productService.nameLong,
              version: productService.version
            }
          }
        }, token);
        mcp._serverInit = initialized;
        mcp._sendLogLevelToServer(opts.logger.getLevel());
        mcp.sendNotification({
          method: "notifications/initialized"
        });
      });
      return mcp;
    } catch (e) {
      mcp.dispose();
      throw e;
    } finally {
      store.dispose();
    }
  }
  /**
   * Send a client request to the server and return the response.
   *
   * @param request The request to send
   * @param token Cancellation token
   * @param timeoutMs Optional timeout in milliseconds
   * @returns A promise that resolves with the response
   */
  async sendRequest(request, token = CancellationToken.None) {
    if (this._store.isDisposed) {
      return Promise.reject(new CancellationError());
    }
    return this._rpc.sendRequest(
      request,
      token,
      (id) => this.sendNotification({ method: "notifications/cancelled", params: { requestId: id } })
    ).catch((error) => {
      if (error instanceof JsonRpcError) {
        throw new MpcResponseError(error.message, error.code, error.data);
      }
      throw error;
    });
  }
  send(mcp) {
    if (canLog(this.logger.getLevel(), this._requestLogLevel)) {
      log(this.logger, this._requestLogLevel, `[editor -> server] ${JSON.stringify(mcp)}`);
    }
    this._launch.send(mcp);
  }
  /**
   * Handles paginated requests by making multiple requests until all items are retrieved.
   *
   * @param method The method name to call
   * @param getItems Function to extract the array of items from a result
   * @param initialParams Initial parameters
   * @param token Cancellation token
   * @returns Promise with all items combined
   */
  async *sendRequestPaginated(method, getItems, initialParams, token = CancellationToken.None) {
    let nextCursor = void 0;
    do {
      const params = {
        ...initialParams,
        cursor: nextCursor
      };
      const result = await this.sendRequest({ method, params }, token);
      yield getItems(result);
      nextCursor = result.nextCursor;
    } while (nextCursor !== void 0 && !token.isCancellationRequested);
  }
  sendNotification(notification) {
    this.send({ ...notification, jsonrpc: MCP.JSONRPC_VERSION });
  }
  /**
   * Handle incoming server requests
   */
  handleServerRequest(request, token) {
    const mapError = (error) => {
      if (error instanceof McpError) {
        return new JsonRpcError(error.code, error.message, error.data);
      }
      this.logger.error(`Error handling request ${request.method}:`, error);
      const mcpError = McpError.unknown(error instanceof Error ? error : new Error(String(error)));
      return new JsonRpcError(mcpError.code, mcpError.message, mcpError.data);
    };
    try {
      let result;
      if (request.method === "ping") {
        result = this.handlePing(request);
      } else if (request.method === "roots/list") {
        result = this.handleRootsList(request);
      } else if (request.method === "sampling/createMessage" && this._createMessageRequestHandler) {
        if (request.params.task) {
          const taskResult = this._taskManager.createTask(
            request.params.task.ttl ?? null,
            (token2) => this._createMessageRequestHandler(request.params, token2)
          );
          taskResult._meta ??= {};
          taskResult._meta["io.modelcontextprotocol/related-task"] = { taskId: taskResult.task.taskId };
          result = taskResult;
        } else {
          result = this._createMessageRequestHandler(request.params, token);
        }
      } else if (request.method === "elicitation/create" && this._elicitationRequestHandler) {
        if (request.params.task) {
          const taskResult = this._taskManager.createTask(
            request.params.task.ttl ?? null,
            (token2) => this._elicitationRequestHandler(request.params, token2)
          );
          taskResult._meta ??= {};
          taskResult._meta["io.modelcontextprotocol/related-task"] = { taskId: taskResult.task.taskId };
          result = taskResult;
        } else {
          result = this._elicitationRequestHandler(request.params, token);
        }
      } else if (request.method === "tasks/get") {
        result = this._taskManager.getTask(request.params.taskId);
      } else if (request.method === "tasks/result") {
        result = this._taskManager.getTaskResult(request.params.taskId);
      } else if (request.method === "tasks/cancel") {
        result = this._taskManager.cancelTask(request.params.taskId);
      } else if (request.method === "tasks/list") {
        result = this._taskManager.listTasks();
      } else {
        throw McpError.methodNotFound(request.method);
      }
      if (isThenable(result)) {
        return result.then(void 0, (error) => {
          throw mapError(error);
        });
      }
      return result;
    } catch (e) {
      throw mapError(e);
    }
  }
  /**
   * Handle incoming server notifications
   */
  handleServerNotification(request) {
    try {
      switch (request.method) {
        case "notifications/message":
          return this.handleLoggingNotification(request);
        case "notifications/cancelled":
          this._onDidReceiveCancelledNotification.fire(request);
          return this.handleCancelledNotification(request);
        case "notifications/progress":
          this._onDidReceiveProgressNotification.fire(request);
          return;
        case "notifications/resources/list_changed":
          this._onDidChangeResourceList.fire();
          return;
        case "notifications/resources/updated":
          this._onDidUpdateResource.fire(request);
          return;
        case "notifications/tools/list_changed":
          this._onDidChangeToolList.fire();
          return;
        case "notifications/prompts/list_changed":
          this._onDidChangePromptList.fire();
          return;
        case "notifications/elicitation/complete":
          this._onDidReceiveElicitationCompleteNotification.fire(request);
          return;
        case "notifications/tasks/status":
          this._taskManager.getClientTask(request.params.taskId)?.onDidUpdateState(request.params);
          return;
        default:
          softAssertNever(request);
      }
    } catch (error) {
      this.logger.error(`Error handling notification ${request.method}:`, error);
    }
  }
  handleCancelledNotification(request) {
    if (request.params.requestId) {
      this._rpc.cancelPendingRequest(request.params.requestId);
    }
  }
  handleLoggingNotification(request) {
    translateMcpLogMessage(this.logger, request.params);
  }
  /**
   * Send a response to a ping request
   */
  handlePing(_request) {
    return {};
  }
  /**
   * Send a response to a roots/list request
   */
  handleRootsList(_request) {
    this._hasAnnouncedRoots = true;
    return { roots: this._roots };
  }
  cancelAllRequests() {
    this._rpc.cancelAllRequests();
  }
  dispose() {
    this.cancelAllRequests();
    super.dispose();
  }
  /**
   * Forwards log level changes to the MCP server if it supports logging
   */
  async _sendLogLevelToServer(logLevel) {
    try {
      if (!this.capabilities.logging) {
        return;
      }
      await this.setLevel({ level: mapLogLevelToMcp(logLevel) });
    } catch (error) {
      this.logger.error(`Failed to set MCP server log level: ${error}`);
    }
  }
  /**
   * Send an initialize request
   */
  initialize(params, token) {
    return this.sendRequest({ method: "initialize", params }, token);
  }
  /**
   * List available resources
   */
  listResources(params, token) {
    return Iterable.asyncToArrayFlat(this.listResourcesIterable(params, token));
  }
  /**
   * List available resources (iterable)
   */
  listResourcesIterable(params, token) {
    return this.sendRequestPaginated("resources/list", (result) => result.resources, params, token);
  }
  /**
   * Read a specific resource
   */
  readResource(params, token) {
    return this.sendRequest({ method: "resources/read", params }, token);
  }
  /**
   * List available resource templates
   */
  listResourceTemplates(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("resources/templates/list", (result) => result.resourceTemplates, params, token));
  }
  /**
   * Subscribe to resource updates
   */
  subscribe(params, token) {
    return this.sendRequest({ method: "resources/subscribe", params }, token);
  }
  /**
   * Unsubscribe from resource updates
   */
  unsubscribe(params, token) {
    return this.sendRequest({ method: "resources/unsubscribe", params }, token);
  }
  /**
   * List available prompts
   */
  listPrompts(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("prompts/list", (result) => result.prompts, params, token));
  }
  /**
   * Get a specific prompt
   */
  getPrompt(params, token) {
    return this.sendRequest({ method: "prompts/get", params }, token);
  }
  /**
   * List available tools
   */
  listTools(params, token) {
    return Iterable.asyncToArrayFlat(this.sendRequestPaginated("tools/list", (result) => result.tools, params, token));
  }
  /**
   * Call a specific tool. Supports tasks automatically if `task` is set on the request.
   */
  async callTool(params, token, onStatusMessage) {
    const response = await this.sendRequest({ method: "tools/call", params }, token);
    if (isTaskResult(response)) {
      const task = new McpTask(response.task, token, onStatusMessage);
      this._taskManager.adoptClientTask(task);
      task.setHandler(this);
      return task.result.finally(() => {
        this._taskManager.abandonClientTask(task.id);
      });
    }
    return response;
  }
  /**
   * Set the logging level
   */
  setLevel(params, token) {
    return this.sendRequest({ method: "logging/setLevel", params }, token);
  }
  /**
   * Find completions for an argument
   */
  complete(params, token) {
    return this.sendRequest({ method: "completion/complete", params }, token);
  }
  /**
   * Get task status
   */
  getTask(params, token) {
    return this.sendRequest({ method: "tasks/get", params }, token);
  }
  /**
   * Get task result
   */
  getTaskResult(params, token) {
    return this.sendRequest({ method: "tasks/result", params }, token);
  }
  /**
   * Cancel a task
   */
  cancelTask(params, token) {
    return this.sendRequest({ method: "tasks/cancel", params }, token);
  }
  /**
   * List all tasks
   */
  listTasks(params, token) {
    return Iterable.asyncToArrayFlat(
      this.sendRequestPaginated(
        "tasks/list",
        (result) => result.tasks,
        params,
        token
      )
    );
  }
}
function isTaskInTerminalState(task) {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}
class McpTask extends Disposable {
  constructor(_task, _token = CancellationToken.None, _onStatusMessage) {
    super();
    this._task = _task;
    this._onStatusMessage = _onStatusMessage;
    this.promise = new DeferredPromise();
    this._handler = observableValue("mcpTaskHandler", void 0);
    const expiresAt = _task.ttl ? Date.now() + _task.ttl : void 0;
    this._lastTaskState = observableValue("lastTaskState", this._task);
    const store = this._register(new DisposableStore());
    if (_token.isCancellationRequested) {
      this._lastTaskState.set({ ...this._task, status: "cancelled" }, void 0);
    } else {
      store.add(_token.onCancellationRequested(() => {
        const current = this._lastTaskState.get();
        if (!isTaskInTerminalState(current)) {
          this._lastTaskState.set({ ...current, status: "cancelled" }, void 0);
        }
      }));
    }
    if (expiresAt) {
      const ttlTimeout = expiresAt - Date.now();
      if (ttlTimeout <= 0) {
        this._lastTaskState.set({ ...this._task, status: "cancelled", statusMessage: "Task timed out." }, void 0);
      } else {
        store.add(disposableTimeout(() => {
          const current = this._lastTaskState.get();
          if (!isTaskInTerminalState(current)) {
            this._lastTaskState.set({ ...current, status: "cancelled", statusMessage: "Task timed out." }, void 0);
          }
        }, ttlTimeout));
      }
    }
    const inputRequiredLookup = observableValue("activeResultLookup", void 0);
    store.add(autorun((reader) => {
      const current = this._lastTaskState.read(reader);
      if (isTaskInTerminalState(current)) {
        return;
      }
      const lookup = inputRequiredLookup.read(reader);
      if (lookup) {
        const result = lookup.promiseResult.read(reader);
        return transaction((tx) => {
          if (!result) {
          } else if (result.data) {
            inputRequiredLookup.set(void 0, tx);
            this._lastTaskState.set(result.data, tx);
          } else {
            inputRequiredLookup.set(void 0, tx);
            if (result.error instanceof McpError && result.error.code === MCP.INVALID_PARAMS) {
              this._lastTaskState.set({ ...current, status: "cancelled" }, void 0);
            } else {
              this._lastTaskState.set({ ...current, status: "working" }, void 0);
            }
          }
        });
      }
      const handler = this._handler.read(reader);
      if (!handler) {
        return;
      }
      const pollInterval = _task.pollInterval ?? 2e3;
      const cts = new CancellationTokenSource(_token);
      reader.store.add(toDisposable(() => cts.dispose(true)));
      reader.store.add(disposableTimeout(() => {
        handler.getTask({ taskId: current.taskId }, cts.token).catch((e) => {
          if (e instanceof McpError && e.code === MCP.INVALID_PARAMS) {
            return { ...current, status: "cancelled" };
          } else {
            return { ...current };
          }
        }).then((r) => {
          if (r && !cts.token.isCancellationRequested) {
            this._lastTaskState.set(r, void 0);
          }
        });
      }, pollInterval));
    }));
    const lastStatus = this._lastTaskState.map((task) => task.status);
    store.add(autorun((reader) => {
      const status = lastStatus.read(reader);
      if (status === "failed") {
        const current = this._lastTaskState.read(void 0);
        this.promise.error(new Error(`Task ${current.taskId} failed: ${current.statusMessage ?? "unknown error"}`));
        store.dispose();
      } else if (status === "cancelled") {
        this.promise.cancel();
        store.dispose();
      } else if (status === "input_required") {
        const handler = this._handler.read(reader);
        if (handler) {
          const current = this._lastTaskState.read(void 0);
          const cts = new CancellationTokenSource(_token);
          reader.store.add(toDisposable(() => cts.dispose(true)));
          inputRequiredLookup.set(new ObservablePromise(handler.getTask({ taskId: current.taskId }, cts.token)), void 0);
        }
      } else if (status === "completed") {
        const handler = this._handler.read(reader);
        if (handler) {
          this.promise.settleWith(handler.getTaskResult({ taskId: _task.taskId }, _token));
          store.dispose();
        }
      } else if (status === "working") {
      } else {
        softAssertNever(status);
      }
    }));
  }
  get result() {
    return this.promise.p;
  }
  get id() {
    return this._task.taskId;
  }
  onDidUpdateState(task) {
    this._lastTaskState.set(task, void 0);
    if (task.statusMessage && this._onStatusMessage) {
      this._onStatusMessage(task.statusMessage);
    }
  }
  setHandler(handler) {
    this._handler.set(handler, void 0);
  }
}
function mapLogLevelToMcp(logLevel) {
  switch (logLevel) {
    case LogLevel.Trace:
      return "debug";
    // MCP doesn't have trace, use debug
    case LogLevel.Debug:
      return "debug";
    case LogLevel.Info:
      return "info";
    case LogLevel.Warning:
      return "warning";
    case LogLevel.Error:
      return "error";
    case LogLevel.Off:
      return "emergency";
    // MCP doesn't have off, use emergency
    default:
      return assertNever(logLevel);
  }
}
export {
  McpServerRequestHandler,
  McpTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2VydmVyUmVxdWVzdEhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIsIHNvZnRBc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIGRpc3Bvc2FibGVUaW1lb3V0LCBJbnRlcnZhbFRpbWVyLCBpc1RoZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEpzb25ScGNFcnJvciwgSnNvblJwY1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblJwY1Byb3RvY29sLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElTZXR0YWJsZU9ic2VydmFibGUsIE9ic2VydmFibGVQcm9taXNlLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGNhbkxvZywgSUxvZ2dlciwgbG9nLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BNZXNzYWdlVHJhbnNwb3J0IH0gZnJvbSAnLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BUYXNrSW50ZXJuYWwsIE1jcFRhc2tNYW5hZ2VyIH0gZnJvbSAnLi9tY3BUYXNrTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJTWNwQ2xpZW50TWV0aG9kcywgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BFcnJvciwgTXBjUmVzcG9uc2VFcnJvciB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgaXNUYXNrUmVzdWx0LCB0cmFuc2xhdGVNY3BMb2dNZXNzYWdlIH0gZnJvbSAnLi9tY3BUeXBlc1V0aWxzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1jcFJvb3Qge1xuXHR1cmk6IHN0cmluZztcblx0bmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWNwU2VydmVyUmVxdWVzdEhhbmRsZXJPcHRpb25zIGV4dGVuZHMgSU1jcENsaWVudE1ldGhvZHMge1xuXHQvKiogTUNQIG1lc3NhZ2UgdHJhbnNwb3J0ICovXG5cdGxhdW5jaDogSU1jcE1lc3NhZ2VUcmFuc3BvcnQ7XG5cdC8qKiBMb2dnZXIgaW5zdGFuY2UuICovXG5cdGxvZ2dlcjogSUxvZ2dlcjtcblx0LyoqIExvZyBsZXZlbCBNQ1AgbWVzc2FnZXMgaXMgbG9nZ2VkIGF0ICovXG5cdHJlcXVlc3RMb2dMZXZlbD86IExvZ0xldmVsO1xuXHQvKiogVGFzayBtYW5hZ2VyIGZvciBzZXJ2ZXItc2lkZSBNQ1AgdGFza3MgKHNoYXJlZCBhY3Jvc3MgcmVjb25uZWN0aW9ucykgKi9cblx0dGFza01hbmFnZXI6IE1jcFRhc2tNYW5hZ2VyO1xufVxuXG4vKipcbiAqIFJlcXVlc3QgaGFuZGxlciBmb3IgY29tbXVuaWNhdGluZyB3aXRoIGFuIE1DUCBzZXJ2ZXIuXG4gKlxuICogSGFuZGxlcyBzZW5kaW5nIHJlcXVlc3RzIGFuZCByZWNlaXZpbmcgcmVzcG9uc2VzLCB3aXRoIGF1dG9tYXRpY1xuICogaGFuZGxpbmcgb2YgcGluZyByZXF1ZXN0cyBhbmQgdHlwZWQgY2xpZW50IHJlcXVlc3QgbWV0aG9kcy5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JwYzogSnNvblJwY1Byb3RvY29sO1xuXG5cdHByaXZhdGUgX2hhc0Fubm91bmNlZFJvb3RzID0gZmFsc2U7XG5cdHByaXZhdGUgX3Jvb3RzOiBNQ1AuUm9vdFtdID0gW107XG5cblx0cHVibGljIHNldCByb290cyhyb290czogTUNQLlJvb3RbXSkge1xuXHRcdGlmICghZXF1YWxzKHRoaXMuX3Jvb3RzLCByb290cykpIHtcblx0XHRcdHRoaXMuX3Jvb3RzID0gcm9vdHM7XG5cdFx0XHRpZiAodGhpcy5faGFzQW5ub3VuY2VkUm9vdHMpIHtcblx0XHRcdFx0dGhpcy5zZW5kTm90aWZpY2F0aW9uKHsgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9yb290cy9saXN0X2NoYW5nZWQnIH0pO1xuXHRcdFx0XHR0aGlzLl9oYXNBbm5vdW5jZWRSb290cyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlcnZlckluaXQhOiBNQ1AuSW5pdGlhbGl6ZVJlc3VsdDtcblx0cHVibGljIGdldCBjYXBhYmlsaXRpZXMoKTogTUNQLlNlcnZlckNhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcnZlckluaXQuY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0cHVibGljIGdldCBzZXJ2ZXJJbmZvKCk6IE1DUC5JbXBsZW1lbnRhdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcnZlckluaXQuc2VydmVySW5mbztcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2VydmVySW5zdHJ1Y3Rpb25zKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcnZlckluaXQuaW5zdHJ1Y3Rpb25zO1xuXHR9XG5cblx0Ly8gRXZlbnQgZW1pdHRlcnMgZm9yIHNlcnZlciBub3RpZmljYXRpb25zXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZUNhbmNlbGxlZE5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5DYW5jZWxsZWROb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlY2VpdmVDYW5jZWxsZWROb3RpZmljYXRpb24gPSB0aGlzLl9vbkRpZFJlY2VpdmVDYW5jZWxsZWROb3RpZmljYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlUHJvZ3Jlc3NOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNQ1AuUHJvZ3Jlc3NOb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlY2VpdmVQcm9ncmVzc05vdGlmaWNhdGlvbiA9IHRoaXMuX29uRGlkUmVjZWl2ZVByb2dyZXNzTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZUVsaWNpdGF0aW9uQ29tcGxldGVOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNQ1AuRWxpY2l0YXRpb25Db21wbGV0ZU5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZUVsaWNpdGF0aW9uQ29tcGxldGVOb3RpZmljYXRpb24gPSB0aGlzLl9vbkRpZFJlY2VpdmVFbGljaXRhdGlvbkNvbXBsZXRlTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzb3VyY2VMaXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzb3VyY2VMaXN0ID0gdGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZUxpc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGVSZXNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5SZXNvdXJjZVVwZGF0ZWROb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZVJlc291cmNlID0gdGhpcy5fb25EaWRVcGRhdGVSZXNvdXJjZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRvb2xMaXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVG9vbExpc3QgPSB0aGlzLl9vbkRpZENoYW5nZVRvb2xMaXN0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvbXB0TGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb21wdExpc3QgPSB0aGlzLl9vbkRpZENoYW5nZVByb21wdExpc3QuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIENvbm5lY3RzIHRvIHRoZSBNQ1Agc2VydmVyIGFuZCBkb2VzIHRoZSBpbml0aWFsaXphdGlvbiBoYW5kc2hha2UuXG5cdCAqIEB0aHJvd3MgTXBjUmVzcG9uc2VFcnJvciBpZiB0aGUgc2VydmVyIGZhaWxzIHRvIGluaXRpYWxpemUuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGFzeW5jIGNyZWF0ZShpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgb3B0czogSU1jcFNlcnZlclJlcXVlc3RIYW5kbGVyT3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGNvbnN0IG1jcCA9IG5ldyBNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlcihvcHRzKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzdG9yZS5hZGQobmV3IEludGVydmFsVGltZXIoKSk7XG5cdFx0XHR0aW1lci5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0XHRvcHRzLmxvZ2dlci5pbmZvKCdXYWl0aW5nIGZvciBzZXJ2ZXIgdG8gcmVzcG9uZCB0byBgaW5pdGlhbGl6ZWAgcmVxdWVzdC4uLicpO1xuXHRcdFx0fSwgNTAwMCk7XG5cblx0XHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxpemVkID0gYXdhaXQgbWNwLnNlbmRSZXF1ZXN0PE1DUC5Jbml0aWFsaXplUmVxdWVzdCwgTUNQLkluaXRpYWxpemVSZXN1bHQ+KHtcblx0XHRcdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0XHRcdHByb3RvY29sVmVyc2lvbjogTUNQLkxBVEVTVF9QUk9UT0NPTF9WRVJTSU9OLFxuXHRcdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHJvb3RzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdHNhbXBsaW5nOiBvcHRzLmNyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlciA/IHt9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRlbGljaXRhdGlvbjogb3B0cy5lbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyID8geyBmb3JtOiB7fSwgdXJsOiB7fSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR0YXNrczoge1xuXHRcdFx0XHRcdFx0XHRcdGxpc3Q6IHt9LFxuXHRcdFx0XHRcdFx0XHRcdGNhbmNlbDoge30sXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWVzdHM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHNhbXBsaW5nOiBvcHRzLmNyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlciA/IHsgY3JlYXRlTWVzc2FnZToge30gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRcdGVsaWNpdGF0aW9uOiBvcHRzLmVsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIgPyB7IGNyZWF0ZToge30gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2lvLm1vZGVsY29udGV4dHByb3RvY29sL3VpJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bWltZVR5cGVzOiBbJ3RleHQvaHRtbDtwcm9maWxlPW1jcC1hcHAnXVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGNsaWVudEluZm86IHtcblx0XHRcdFx0XHRcdFx0bmFtZTogcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsXG5cdFx0XHRcdFx0XHRcdHZlcnNpb246IHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0b2tlbik7XG5cdFx0XHRcdG1jcC5fc2VydmVySW5pdCA9IGluaXRpYWxpemVkO1xuXHRcdFx0XHRtY3AuX3NlbmRMb2dMZXZlbFRvU2VydmVyKG9wdHMubG9nZ2VyLmdldExldmVsKCkpO1xuXG5cdFx0XHRcdG1jcC5zZW5kTm90aWZpY2F0aW9uPE1DUC5Jbml0aWFsaXplZE5vdGlmaWNhdGlvbj4oe1xuXHRcdFx0XHRcdG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBtY3A7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0bWNwLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXVuY2g6IElNY3BNZXNzYWdlVHJhbnNwb3J0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0TG9nTGV2ZWw6IExvZ0xldmVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXI6IElNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlck9wdGlvbnNbJ2NyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlciddO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyOiBJTWNwU2VydmVyUmVxdWVzdEhhbmRsZXJPcHRpb25zWydlbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyJ107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tNYW5hZ2VyOiBNY3BUYXNrTWFuYWdlcjtcblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3Ioe1xuXHRcdGxhdW5jaCxcblx0XHRsb2dnZXIsXG5cdFx0Y3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyLFxuXHRcdGVsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIsXG5cdFx0cmVxdWVzdExvZ0xldmVsID0gTG9nTGV2ZWwuRGVidWcsXG5cdFx0dGFza01hbmFnZXIsXG5cdH06IElNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlck9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xhdW5jaCA9IGxhdW5jaDtcblx0XHR0aGlzLmxvZ2dlciA9IGxvZ2dlcjtcblx0XHR0aGlzLl9yZXF1ZXN0TG9nTGV2ZWwgPSByZXF1ZXN0TG9nTGV2ZWw7XG5cdFx0dGhpcy5fY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyID0gY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyO1xuXHRcdHRoaXMuX2VsaWNpdGF0aW9uUmVxdWVzdEhhbmRsZXIgPSBlbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyO1xuXHRcdHRoaXMuX3Rhc2tNYW5hZ2VyID0gdGFza01hbmFnZXI7XG5cblx0XHR0aGlzLl9ycGMgPSB0aGlzLl9yZWdpc3RlcihuZXcgSnNvblJwY1Byb3RvY29sKFxuXHRcdFx0bWVzc2FnZSA9PiB0aGlzLnNlbmQobWVzc2FnZSBhcyBNQ1AuSlNPTlJQQ01lc3NhZ2UpLFxuXHRcdFx0e1xuXHRcdFx0XHRoYW5kbGVSZXF1ZXN0OiAocmVxdWVzdCwgdG9rZW4pID0+IHRoaXMuaGFuZGxlU2VydmVyUmVxdWVzdChyZXF1ZXN0IGFzIE1DUC5KU09OUlBDUmVxdWVzdCAmIE1DUC5TZXJ2ZXJSZXF1ZXN0LCB0b2tlbiksXG5cdFx0XHRcdGhhbmRsZU5vdGlmaWNhdGlvbjogbm90aWZpY2F0aW9uID0+IHRoaXMuaGFuZGxlU2VydmVyTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbiBhcyBNQ1AuSlNPTlJQQ05vdGlmaWNhdGlvbiAmIE1DUC5TZXJ2ZXJOb3RpZmljYXRpb24pLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gQXR0YWNoIHRoaXMgaGFuZGxlciB0byB0aGUgdGFzayBtYW5hZ2VyXG5cdFx0dGhpcy5fdGFza01hbmFnZXIuc2V0SGFuZGxlcih0aGlzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90YXNrTWFuYWdlci5vbkRpZFVwZGF0ZVRhc2sodGFzayA9PiB7XG5cdFx0XHR0aGlzLnNlbmQoe1xuXHRcdFx0XHRqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OLFxuXHRcdFx0XHRtZXRob2Q6ICdub3RpZmljYXRpb25zL3Rhc2tzL3N0YXR1cycsXG5cdFx0XHRcdHBhcmFtczogdGFza1xuXHRcdFx0fSBzYXRpc2ZpZXMgTUNQLlRhc2tTdGF0dXNOb3RpZmljYXRpb24pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fdGFza01hbmFnZXIuc2V0SGFuZGxlcih1bmRlZmluZWQpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsYXVuY2gub25EaWRSZWNlaXZlTWVzc2FnZShtZXNzYWdlID0+IHtcblx0XHRcdGlmIChjYW5Mb2codGhpcy5sb2dnZXIuZ2V0TGV2ZWwoKSwgdGhpcy5fcmVxdWVzdExvZ0xldmVsKSkge1xuXHRcdFx0XHRsb2codGhpcy5sb2dnZXIsIHRoaXMuX3JlcXVlc3RMb2dMZXZlbCwgYFtzZXJ2ZXIgLT4gZWRpdG9yXSAke0pTT04uc3RyaW5naWZ5KG1lc3NhZ2UpfWApO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9ycGMuaGFuZGxlTWVzc2FnZShtZXNzYWdlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsYXVuY2guc3RhdGUucmVhZChyZWFkZXIpLnN0YXRlO1xuXHRcdFx0Ly8gdGhlIGhhbmRsZXIgd2lsbCBnZXQgZGlzcG9zZWQgd2hlbiB0aGUgbGF1bmNoIHN0b3BzLCBidXQgaWYgd2UncmUgc3RpbGxcblx0XHRcdC8vIGNyZWF0ZSgpJ2luZyB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB0byBjYW5jZWwgdGhlIGluaXRpYWxpemUgcmVxdWVzdC5cblx0XHRcdGlmIChzdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IgfHwgc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQpIHtcblx0XHRcdFx0dGhpcy5jYW5jZWxBbGxSZXF1ZXN0cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgbG9nIGxldmVsIGNoYW5nZXMgYW5kIGZvcndhcmQgdGhlbSB0byB0aGUgTUNQIHNlcnZlclxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxvZ2dlci5vbkRpZENoYW5nZUxvZ0xldmVsKChsb2dMZXZlbCkgPT4ge1xuXHRcdFx0dGhpcy5fc2VuZExvZ0xldmVsVG9TZXJ2ZXIobG9nTGV2ZWwpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGEgY2xpZW50IHJlcXVlc3QgdG8gdGhlIHNlcnZlciBhbmQgcmV0dXJuIHRoZSByZXNwb25zZS5cblx0ICpcblx0ICogQHBhcmFtIHJlcXVlc3QgVGhlIHJlcXVlc3QgdG8gc2VuZFxuXHQgKiBAcGFyYW0gdG9rZW4gQ2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEBwYXJhbSB0aW1lb3V0TXMgT3B0aW9uYWwgdGltZW91dCBpbiBtaWxsaXNlY29uZHNcblx0ICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGUgcmVzcG9uc2Vcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgc2VuZFJlcXVlc3Q8VCBleHRlbmRzIE1DUC5DbGllbnRSZXF1ZXN0LCBSIGV4dGVuZHMgTUNQLlNlcnZlclJlc3VsdD4oXG5cdFx0cmVxdWVzdDogUGljazxULCAncGFyYW1zJyB8ICdtZXRob2QnPixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdCk6IFByb21pc2U8Uj4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9ycGMuc2VuZFJlcXVlc3Q8Uj4oXG5cdFx0XHRyZXF1ZXN0LFxuXHRcdFx0dG9rZW4sXG5cdFx0XHRpZCA9PiB0aGlzLnNlbmROb3RpZmljYXRpb24oeyBtZXRob2Q6ICdub3RpZmljYXRpb25zL2NhbmNlbGxlZCcsIHBhcmFtczogeyByZXF1ZXN0SWQ6IGlkIH0gfSlcblx0XHQpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEpzb25ScGNFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgTXBjUmVzcG9uc2VFcnJvcihlcnJvci5tZXNzYWdlLCBlcnJvci5jb2RlLCBlcnJvci5kYXRhKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZW5kKG1jcDogTUNQLkpTT05SUENNZXNzYWdlKSB7XG5cdFx0aWYgKGNhbkxvZyh0aGlzLmxvZ2dlci5nZXRMZXZlbCgpLCB0aGlzLl9yZXF1ZXN0TG9nTGV2ZWwpKSB7IC8vIGF2b2lkIGJ1aWxkaW5nIHRoZSBzdHJpbmcgaWYgd2UgZG9uJ3QgbmVlZCB0b1xuXHRcdFx0bG9nKHRoaXMubG9nZ2VyLCB0aGlzLl9yZXF1ZXN0TG9nTGV2ZWwsIGBbZWRpdG9yIC0+IHNlcnZlcl0gJHtKU09OLnN0cmluZ2lmeShtY3ApfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhdW5jaC5zZW5kKG1jcCk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBwYWdpbmF0ZWQgcmVxdWVzdHMgYnkgbWFraW5nIG11bHRpcGxlIHJlcXVlc3RzIHVudGlsIGFsbCBpdGVtcyBhcmUgcmV0cmlldmVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gbWV0aG9kIFRoZSBtZXRob2QgbmFtZSB0byBjYWxsXG5cdCAqIEBwYXJhbSBnZXRJdGVtcyBGdW5jdGlvbiB0byBleHRyYWN0IHRoZSBhcnJheSBvZiBpdGVtcyBmcm9tIGEgcmVzdWx0XG5cdCAqIEBwYXJhbSBpbml0aWFsUGFyYW1zIEluaXRpYWwgcGFyYW1ldGVyc1xuXHQgKiBAcGFyYW0gdG9rZW4gQ2FuY2VsbGF0aW9uIHRva2VuXG5cdCAqIEByZXR1cm5zIFByb21pc2Ugd2l0aCBhbGwgaXRlbXMgY29tYmluZWRcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgKnNlbmRSZXF1ZXN0UGFnaW5hdGVkPFQgZXh0ZW5kcyBNQ1AuUGFnaW5hdGVkUmVxdWVzdCAmIE1DUC5DbGllbnRSZXF1ZXN0LCBSIGV4dGVuZHMgTUNQLlBhZ2luYXRlZFJlc3VsdCwgST4obWV0aG9kOiBUWydtZXRob2QnXSwgZ2V0SXRlbXM6IChyZXN1bHQ6IFIpID0+IElbXSwgaW5pdGlhbFBhcmFtcz86IE9taXQ8VFsncGFyYW1zJ10sICdqc29ucnBjJyB8ICdpZCc+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogQXN5bmNJdGVyYWJsZTxJW10+IHtcblx0XHRsZXQgbmV4dEN1cnNvcjogTUNQLkN1cnNvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGRvIHtcblx0XHRcdGNvbnN0IHBhcmFtczogVFsncGFyYW1zJ10gPSB7XG5cdFx0XHRcdC4uLmluaXRpYWxQYXJhbXMsXG5cdFx0XHRcdGN1cnNvcjogbmV4dEN1cnNvclxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBSID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdDxULCBSPih7IG1ldGhvZCwgcGFyYW1zIH0sIHRva2VuKTtcblx0XHRcdHlpZWxkIGdldEl0ZW1zKHJlc3VsdCk7XG5cdFx0XHRuZXh0Q3Vyc29yID0gcmVzdWx0Lm5leHRDdXJzb3I7XG5cdFx0fSB3aGlsZSAobmV4dEN1cnNvciAhPT0gdW5kZWZpbmVkICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCk7XG5cdH1cblxuXHRwcml2YXRlIHNlbmROb3RpZmljYXRpb248TiBleHRlbmRzIE1DUC5DbGllbnROb3RpZmljYXRpb24+KG5vdGlmaWNhdGlvbjogT21pdDxOLCAnanNvbnJwYyc+KTogdm9pZCB7XG5cdFx0dGhpcy5zZW5kKHsgLi4ubm90aWZpY2F0aW9uLCBqc29ucnBjOiBNQ1AuSlNPTlJQQ19WRVJTSU9OIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBpbmNvbWluZyBzZXJ2ZXIgcmVxdWVzdHNcblx0ICovXG5cdHByaXZhdGUgaGFuZGxlU2VydmVyUmVxdWVzdChyZXF1ZXN0OiBNQ1AuSlNPTlJQQ1JlcXVlc3QgJiBNQ1AuU2VydmVyUmVxdWVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogTUNQLlJlc3VsdCB8IFByb21pc2U8TUNQLlJlc3VsdD4ge1xuXHRcdGNvbnN0IG1hcEVycm9yID0gKGVycm9yOiB1bmtub3duKTogSnNvblJwY0Vycm9yID0+IHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIE1jcEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgSnNvblJwY0Vycm9yKGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGVycm9yLmRhdGEpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgRXJyb3IgaGFuZGxpbmcgcmVxdWVzdCAke3JlcXVlc3QubWV0aG9kfTpgLCBlcnJvcik7XG5cdFx0XHRjb25zdCBtY3BFcnJvciA9IE1jcEVycm9yLnVua25vd24oZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpKTtcblx0XHRcdHJldHVybiBuZXcgSnNvblJwY0Vycm9yKG1jcEVycm9yLmNvZGUsIG1jcEVycm9yLm1lc3NhZ2UsIG1jcEVycm9yLmRhdGEpO1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IHJlc3VsdDogTUNQLlJlc3VsdCB8IFByb21pc2U8TUNQLlJlc3VsdD47XG5cdFx0XHRpZiAocmVxdWVzdC5tZXRob2QgPT09ICdwaW5nJykge1xuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLmhhbmRsZVBpbmcocmVxdWVzdCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3QubWV0aG9kID09PSAncm9vdHMvbGlzdCcpIHtcblx0XHRcdFx0cmVzdWx0ID0gdGhpcy5oYW5kbGVSb290c0xpc3QocmVxdWVzdCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnc2FtcGxpbmcvY3JlYXRlTWVzc2FnZScgJiYgdGhpcy5fY3JlYXRlTWVzc2FnZVJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSB0YXNrLWF1Z21lbnRlZCByZXF1ZXN0XG5cdFx0XHRcdGlmIChyZXF1ZXN0LnBhcmFtcy50YXNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza1Jlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmNyZWF0ZVRhc2soXG5cdFx0XHRcdFx0XHRyZXF1ZXN0LnBhcmFtcy50YXNrLnR0bCA/PyBudWxsLFxuXHRcdFx0XHRcdFx0KHRva2VuKSA9PiB0aGlzLl9jcmVhdGVNZXNzYWdlUmVxdWVzdEhhbmRsZXIhKHJlcXVlc3QucGFyYW1zLCB0b2tlbilcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRhc2tSZXN1bHQuX21ldGEgPz89IHt9O1xuXHRcdFx0XHRcdHRhc2tSZXN1bHQuX21ldGFbJ2lvLm1vZGVsY29udGV4dHByb3RvY29sL3JlbGF0ZWQtdGFzayddID0geyB0YXNrSWQ6IHRhc2tSZXN1bHQudGFzay50YXNrSWQgfTtcblx0XHRcdFx0XHRyZXN1bHQgPSB0YXNrUmVzdWx0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRoaXMuX2NyZWF0ZU1lc3NhZ2VSZXF1ZXN0SGFuZGxlcihyZXF1ZXN0LnBhcmFtcywgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3QubWV0aG9kID09PSAnZWxpY2l0YXRpb24vY3JlYXRlJyAmJiB0aGlzLl9lbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYSB0YXNrLWF1Z21lbnRlZCByZXF1ZXN0XG5cdFx0XHRcdGlmIChyZXF1ZXN0LnBhcmFtcy50YXNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza1Jlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmNyZWF0ZVRhc2soXG5cdFx0XHRcdFx0XHRyZXF1ZXN0LnBhcmFtcy50YXNrLnR0bCA/PyBudWxsLFxuXHRcdFx0XHRcdFx0KHRva2VuKSA9PiB0aGlzLl9lbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyIShyZXF1ZXN0LnBhcmFtcywgdG9rZW4pXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR0YXNrUmVzdWx0Ll9tZXRhID8/PSB7fTtcblx0XHRcdFx0XHR0YXNrUmVzdWx0Ll9tZXRhWydpby5tb2RlbGNvbnRleHRwcm90b2NvbC9yZWxhdGVkLXRhc2snXSA9IHsgdGFza0lkOiB0YXNrUmVzdWx0LnRhc2sudGFza0lkIH07XG5cdFx0XHRcdFx0cmVzdWx0ID0gdGFza1Jlc3VsdDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQgPSB0aGlzLl9lbGljaXRhdGlvblJlcXVlc3RIYW5kbGVyKHJlcXVlc3QucGFyYW1zLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICd0YXNrcy9nZXQnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmdldFRhc2socmVxdWVzdC5wYXJhbXMudGFza0lkKTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICd0YXNrcy9yZXN1bHQnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmdldFRhc2tSZXN1bHQocmVxdWVzdC5wYXJhbXMudGFza0lkKTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICd0YXNrcy9jYW5jZWwnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHRoaXMuX3Rhc2tNYW5hZ2VyLmNhbmNlbFRhc2socmVxdWVzdC5wYXJhbXMudGFza0lkKTtcblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tZXRob2QgPT09ICd0YXNrcy9saXN0Jykge1xuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLl90YXNrTWFuYWdlci5saXN0VGFza3MoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IE1jcEVycm9yLm1ldGhvZE5vdEZvdW5kKHJlcXVlc3QubWV0aG9kKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzVGhlbmFibGUocmVzdWx0KSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LnRoZW4odW5kZWZpbmVkLCAoZXJyb3I6IHVua25vd24pID0+IHtcblx0XHRcdFx0XHR0aHJvdyBtYXBFcnJvcihlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93IG1hcEVycm9yKGUpO1xuXHRcdH1cblx0fVxuXHQvKipcblx0ICogSGFuZGxlIGluY29taW5nIHNlcnZlciBub3RpZmljYXRpb25zXG5cdCAqL1xuXHRwcml2YXRlIGhhbmRsZVNlcnZlck5vdGlmaWNhdGlvbihyZXF1ZXN0OiBNQ1AuSlNPTlJQQ05vdGlmaWNhdGlvbiAmIE1DUC5TZXJ2ZXJOb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0c3dpdGNoIChyZXF1ZXN0Lm1ldGhvZCkge1xuXHRcdFx0XHRjYXNlICdub3RpZmljYXRpb25zL21lc3NhZ2UnOlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZUxvZ2dpbmdOb3RpZmljYXRpb24ocmVxdWVzdCk7XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvY2FuY2VsbGVkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlY2VpdmVDYW5jZWxsZWROb3RpZmljYXRpb24uZmlyZShyZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVDYW5jZWxsZWROb3RpZmljYXRpb24ocmVxdWVzdCk7XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvcHJvZ3Jlc3MnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZVByb2dyZXNzTm90aWZpY2F0aW9uLmZpcmUocmVxdWVzdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlICdub3RpZmljYXRpb25zL3Jlc291cmNlcy9saXN0X2NoYW5nZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VMaXN0LmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL3VwZGF0ZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkVXBkYXRlUmVzb3VyY2UuZmlyZShyZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvb2xMaXN0LmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGNhc2UgJ25vdGlmaWNhdGlvbnMvcHJvbXB0cy9saXN0X2NoYW5nZWQnOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvbXB0TGlzdC5maXJlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlICdub3RpZmljYXRpb25zL2VsaWNpdGF0aW9uL2NvbXBsZXRlJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlY2VpdmVFbGljaXRhdGlvbkNvbXBsZXRlTm90aWZpY2F0aW9uLmZpcmUocmVxdWVzdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRjYXNlICdub3RpZmljYXRpb25zL3Rhc2tzL3N0YXR1cyc6XG5cdFx0XHRcdFx0dGhpcy5fdGFza01hbmFnZXIuZ2V0Q2xpZW50VGFzayhyZXF1ZXN0LnBhcmFtcy50YXNrSWQpPy5vbkRpZFVwZGF0ZVN0YXRlKHJlcXVlc3QucGFyYW1zKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0c29mdEFzc2VydE5ldmVyKHJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgRXJyb3IgaGFuZGxpbmcgbm90aWZpY2F0aW9uICR7cmVxdWVzdC5tZXRob2R9OmAsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNhbmNlbGxlZE5vdGlmaWNhdGlvbihyZXF1ZXN0OiBNQ1AuQ2FuY2VsbGVkTm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHJlcXVlc3QucGFyYW1zLnJlcXVlc3RJZCkge1xuXHRcdFx0dGhpcy5fcnBjLmNhbmNlbFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QucGFyYW1zLnJlcXVlc3RJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVMb2dnaW5nTm90aWZpY2F0aW9uKHJlcXVlc3Q6IE1DUC5Mb2dnaW5nTWVzc2FnZU5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdHRyYW5zbGF0ZU1jcExvZ01lc3NhZ2UodGhpcy5sb2dnZXIsIHJlcXVlc3QucGFyYW1zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGEgcmVzcG9uc2UgdG8gYSBwaW5nIHJlcXVlc3Rcblx0ICovXG5cdHByaXZhdGUgaGFuZGxlUGluZyhfcmVxdWVzdDogTUNQLlBpbmdSZXF1ZXN0KToge30ge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIGEgcmVzcG9uc2UgdG8gYSByb290cy9saXN0IHJlcXVlc3Rcblx0ICovXG5cdHByaXZhdGUgaGFuZGxlUm9vdHNMaXN0KF9yZXF1ZXN0OiBNQ1AuTGlzdFJvb3RzUmVxdWVzdCk6IE1DUC5MaXN0Um9vdHNSZXN1bHQge1xuXHRcdHRoaXMuX2hhc0Fubm91bmNlZFJvb3RzID0gdHJ1ZTtcblx0XHRyZXR1cm4geyByb290czogdGhpcy5fcm9vdHMgfTtcblx0fVxuXG5cdHByaXZhdGUgY2FuY2VsQWxsUmVxdWVzdHMoKSB7XG5cdFx0dGhpcy5fcnBjLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbEFsbFJlcXVlc3RzKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmRzIGxvZyBsZXZlbCBjaGFuZ2VzIHRvIHRoZSBNQ1Agc2VydmVyIGlmIGl0IHN1cHBvcnRzIGxvZ2dpbmdcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRMb2dMZXZlbFRvU2VydmVyKGxvZ0xldmVsOiBMb2dMZXZlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBPbmx5IHNlbmQgaWYgdGhlIHNlcnZlciBzdXBwb3J0cyBsb2dnaW5nIGNhcGFiaWxpdGllc1xuXHRcdFx0aWYgKCF0aGlzLmNhcGFiaWxpdGllcy5sb2dnaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5zZXRMZXZlbCh7IGxldmVsOiBtYXBMb2dMZXZlbFRvTWNwKGxvZ0xldmVsKSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBzZXQgTUNQIHNlcnZlciBsb2cgbGV2ZWw6ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYW4gaW5pdGlhbGl6ZSByZXF1ZXN0XG5cdCAqL1xuXHRpbml0aWFsaXplKHBhcmFtczogTUNQLkluaXRpYWxpemVSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkluaXRpYWxpemVSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuSW5pdGlhbGl6ZVJlcXVlc3QsIE1DUC5Jbml0aWFsaXplUmVzdWx0Pih7IG1ldGhvZDogJ2luaXRpYWxpemUnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYXZhaWxhYmxlIHJlc291cmNlc1xuXHQgKi9cblx0bGlzdFJlc291cmNlcyhwYXJhbXM/OiBNQ1AuTGlzdFJlc291cmNlc1JlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVzb3VyY2VbXT4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5hc3luY1RvQXJyYXlGbGF0KHRoaXMubGlzdFJlc291cmNlc0l0ZXJhYmxlKHBhcmFtcywgdG9rZW4pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IGF2YWlsYWJsZSByZXNvdXJjZXMgKGl0ZXJhYmxlKVxuXHQgKi9cblx0bGlzdFJlc291cmNlc0l0ZXJhYmxlKHBhcmFtcz86IE1DUC5MaXN0UmVzb3VyY2VzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlPE1DUC5SZXNvdXJjZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3RQYWdpbmF0ZWQ8TUNQLkxpc3RSZXNvdXJjZXNSZXF1ZXN0LCBNQ1AuTGlzdFJlc291cmNlc1Jlc3VsdCwgTUNQLlJlc291cmNlPigncmVzb3VyY2VzL2xpc3QnLCByZXN1bHQgPT4gcmVzdWx0LnJlc291cmNlcywgcGFyYW1zLCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCBhIHNwZWNpZmljIHJlc291cmNlXG5cdCAqL1xuXHRyZWFkUmVzb3VyY2UocGFyYW1zOiBNQ1AuUmVhZFJlc291cmNlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5SZWFkUmVzb3VyY2VSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuUmVhZFJlc291cmNlUmVxdWVzdCwgTUNQLlJlYWRSZXNvdXJjZVJlc3VsdD4oeyBtZXRob2Q6ICdyZXNvdXJjZXMvcmVhZCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhdmFpbGFibGUgcmVzb3VyY2UgdGVtcGxhdGVzXG5cdCAqL1xuXHRsaXN0UmVzb3VyY2VUZW1wbGF0ZXMocGFyYW1zPzogTUNQLkxpc3RSZXNvdXJjZVRlbXBsYXRlc1JlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUmVzb3VyY2VUZW1wbGF0ZVtdPiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmFzeW5jVG9BcnJheUZsYXQodGhpcy5zZW5kUmVxdWVzdFBhZ2luYXRlZDxNQ1AuTGlzdFJlc291cmNlVGVtcGxhdGVzUmVxdWVzdCwgTUNQLkxpc3RSZXNvdXJjZVRlbXBsYXRlc1Jlc3VsdCwgTUNQLlJlc291cmNlVGVtcGxhdGU+KCdyZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3QnLCByZXN1bHQgPT4gcmVzdWx0LnJlc291cmNlVGVtcGxhdGVzLCBwYXJhbXMsIHRva2VuKSk7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIHJlc291cmNlIHVwZGF0ZXNcblx0ICovXG5cdHN1YnNjcmliZShwYXJhbXM6IE1DUC5TdWJzY3JpYmVSZXF1ZXN0WydwYXJhbXMnXSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkVtcHR5UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLlN1YnNjcmliZVJlcXVlc3QsIE1DUC5FbXB0eVJlc3VsdD4oeyBtZXRob2Q6ICdyZXNvdXJjZXMvc3Vic2NyaWJlJywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVbnN1YnNjcmliZSBmcm9tIHJlc291cmNlIHVwZGF0ZXNcblx0ICovXG5cdHVuc3Vic2NyaWJlKHBhcmFtczogTUNQLlVuc3Vic2NyaWJlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5FbXB0eVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5VbnN1YnNjcmliZVJlcXVlc3QsIE1DUC5FbXB0eVJlc3VsdD4oeyBtZXRob2Q6ICdyZXNvdXJjZXMvdW5zdWJzY3JpYmUnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYXZhaWxhYmxlIHByb21wdHNcblx0ICovXG5cdGxpc3RQcm9tcHRzKHBhcmFtcz86IE1DUC5MaXN0UHJvbXB0c1JlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuUHJvbXB0W10+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUuYXN5bmNUb0FycmF5RmxhdCh0aGlzLnNlbmRSZXF1ZXN0UGFnaW5hdGVkPE1DUC5MaXN0UHJvbXB0c1JlcXVlc3QsIE1DUC5MaXN0UHJvbXB0c1Jlc3VsdCwgTUNQLlByb21wdD4oJ3Byb21wdHMvbGlzdCcsIHJlc3VsdCA9PiByZXN1bHQucHJvbXB0cywgcGFyYW1zLCB0b2tlbikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhIHNwZWNpZmljIHByb21wdFxuXHQgKi9cblx0Z2V0UHJvbXB0KHBhcmFtczogTUNQLkdldFByb21wdFJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuR2V0UHJvbXB0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLkdldFByb21wdFJlcXVlc3QsIE1DUC5HZXRQcm9tcHRSZXN1bHQ+KHsgbWV0aG9kOiAncHJvbXB0cy9nZXQnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYXZhaWxhYmxlIHRvb2xzXG5cdCAqL1xuXHRsaXN0VG9vbHMocGFyYW1zPzogTUNQLkxpc3RUb29sc1JlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuVG9vbFtdPiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmFzeW5jVG9BcnJheUZsYXQodGhpcy5zZW5kUmVxdWVzdFBhZ2luYXRlZDxNQ1AuTGlzdFRvb2xzUmVxdWVzdCwgTUNQLkxpc3RUb29sc1Jlc3VsdCwgTUNQLlRvb2w+KCd0b29scy9saXN0JywgcmVzdWx0ID0+IHJlc3VsdC50b29scywgcGFyYW1zLCB0b2tlbikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGwgYSBzcGVjaWZpYyB0b29sLiBTdXBwb3J0cyB0YXNrcyBhdXRvbWF0aWNhbGx5IGlmIGB0YXNrYCBpcyBzZXQgb24gdGhlIHJlcXVlc3QuXG5cdCAqL1xuXHRhc3luYyBjYWxsVG9vbChwYXJhbXM6IE1DUC5DYWxsVG9vbFJlcXVlc3RbJ3BhcmFtcyddICYgTUNQLlJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBvblN0YXR1c01lc3NhZ2U/OiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkKTogUHJvbWlzZTxNQ1AuQ2FsbFRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc2VuZFJlcXVlc3Q8TUNQLkNhbGxUb29sUmVxdWVzdCwgTUNQLkNhbGxUb29sUmVzdWx0IHwgTUNQLkNyZWF0ZVRhc2tSZXN1bHQ+KHsgbWV0aG9kOiAndG9vbHMvY2FsbCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cblx0XHRpZiAoaXNUYXNrUmVzdWx0KHJlc3BvbnNlKSkge1xuXHRcdFx0Y29uc3QgdGFzayA9IG5ldyBNY3BUYXNrPE1DUC5DYWxsVG9vbFJlc3VsdD4ocmVzcG9uc2UudGFzaywgdG9rZW4sIG9uU3RhdHVzTWVzc2FnZSk7XG5cdFx0XHR0aGlzLl90YXNrTWFuYWdlci5hZG9wdENsaWVudFRhc2sodGFzayk7XG5cdFx0XHR0YXNrLnNldEhhbmRsZXIodGhpcyk7XG5cdFx0XHRyZXR1cm4gdGFzay5yZXN1bHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Rhc2tNYW5hZ2VyLmFiYW5kb25DbGllbnRUYXNrKHRhc2suaWQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBsb2dnaW5nIGxldmVsXG5cdCAqL1xuXHRzZXRMZXZlbChwYXJhbXM6IE1DUC5TZXRMZXZlbFJlcXVlc3RbJ3BhcmFtcyddLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNQ1AuRW1wdHlSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuU2V0TGV2ZWxSZXF1ZXN0LCBNQ1AuRW1wdHlSZXN1bHQ+KHsgbWV0aG9kOiAnbG9nZ2luZy9zZXRMZXZlbCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogRmluZCBjb21wbGV0aW9ucyBmb3IgYW4gYXJndW1lbnRcblx0ICovXG5cdGNvbXBsZXRlKHBhcmFtczogTUNQLkNvbXBsZXRlUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5Db21wbGV0ZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1DUC5Db21wbGV0ZVJlcXVlc3QsIE1DUC5Db21wbGV0ZVJlc3VsdD4oeyBtZXRob2Q6ICdjb21wbGV0aW9uL2NvbXBsZXRlJywgcGFyYW1zIH0sIHRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGFzayBzdGF0dXNcblx0ICovXG5cdGdldFRhc2socGFyYW1zOiB7IHRhc2tJZDogc3RyaW5nIH0sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5HZXRUYXNrUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLkdldFRhc2tSZXF1ZXN0LCBNQ1AuR2V0VGFza1Jlc3VsdD4oeyBtZXRob2Q6ICd0YXNrcy9nZXQnLCBwYXJhbXMgfSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0YXNrIHJlc3VsdFxuXHQgKi9cblx0Z2V0VGFza1Jlc3VsdChwYXJhbXM6IHsgdGFza0lkOiBzdHJpbmcgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkdldFRhc2tQYXlsb2FkUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TUNQLkdldFRhc2tQYXlsb2FkUmVxdWVzdCwgTUNQLkdldFRhc2tQYXlsb2FkUmVzdWx0Pih7IG1ldGhvZDogJ3Rhc2tzL3Jlc3VsdCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VsIGEgdGFza1xuXHQgKi9cblx0Y2FuY2VsVGFzayhwYXJhbXM6IHsgdGFza0lkOiBzdHJpbmcgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TUNQLkNhbmNlbFRhc2tSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZW5kUmVxdWVzdDxNQ1AuQ2FuY2VsVGFza1JlcXVlc3QsIE1DUC5DYW5jZWxUYXNrUmVzdWx0Pih7IG1ldGhvZDogJ3Rhc2tzL2NhbmNlbCcsIHBhcmFtcyB9LCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhbGwgdGFza3Ncblx0ICovXG5cdGxpc3RUYXNrcyhwYXJhbXM/OiBNQ1AuTGlzdFRhc2tzUmVxdWVzdFsncGFyYW1zJ10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE1DUC5UYXNrW10+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUuYXN5bmNUb0FycmF5RmxhdChcblx0XHRcdHRoaXMuc2VuZFJlcXVlc3RQYWdpbmF0ZWQ8TUNQLkxpc3RUYXNrc1JlcXVlc3QsIE1DUC5MaXN0VGFza3NSZXN1bHQsIE1DUC5UYXNrPihcblx0XHRcdFx0J3Rhc2tzL2xpc3QnLCByZXN1bHQgPT4gcmVzdWx0LnRhc2tzLCBwYXJhbXMsIHRva2VuXG5cdFx0XHQpXG5cdFx0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1Rhc2tJblRlcm1pbmFsU3RhdGUodGFzazogTUNQLlRhc2spOiBib29sZWFuIHtcblx0cmV0dXJuIHRhc2suc3RhdHVzID09PSAnY29tcGxldGVkJyB8fCB0YXNrLnN0YXR1cyA9PT0gJ2ZhaWxlZCcgfHwgdGFzay5zdGF0dXMgPT09ICdjYW5jZWxsZWQnO1xufVxuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIGEgdGFzayB0aGF0IGhhbmRsZXMgcG9sbGluZywgc3RhdHVzIG5vdGlmaWNhdGlvbnMsIGFuZCBoYW5kbGVyIHJlY29ubmVjdGlvbnMuIEl0IGltcGxlbWVudHMgdGhlIHRhc2sgcG9sbGluZyBsb29wIGludGVybmFsbHkgYW5kIGNhbiBhbHNvIGJlXG4gKiB1cGRhdGVkIGV4dGVybmFsbHkgdmlhIGBvbkRpZFVwZGF0ZVN0YXRlYCwgd2hlbiBub3RpZmljYXRpb25zIGFyZSByZWNlaXZlZFxuICogZm9yIGV4YW1wbGUuXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFRhc2s8VCBleHRlbmRzIE1DUC5SZXN1bHQ+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BUYXNrSW50ZXJuYWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb21pc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPFQ+KCk7XG5cblx0cHVibGljIGdldCByZXN1bHQoKTogUHJvbWlzZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvbWlzZS5wO1xuXHR9XG5cblx0cHVibGljIGdldCBpZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFzay50YXNrSWQ7XG5cdH1cblxuXHRwcml2YXRlIF9sYXN0VGFza1N0YXRlOiBJU2V0dGFibGVPYnNlcnZhYmxlPE1DUC5UYXNrPjtcblx0cHJpdmF0ZSBfaGFuZGxlciA9IG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB8IHVuZGVmaW5lZD4oJ21jcFRhc2tIYW5kbGVyJywgdW5kZWZpbmVkKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YXNrOiBNQ1AuVGFzayxcblx0XHRfdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vblN0YXR1c01lc3NhZ2U/OiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZXhwaXJlc0F0ID0gX3Rhc2sudHRsID8gKERhdGUubm93KCkgKyBfdGFzay50dGwpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2xhc3RUYXNrU3RhdGUnLCB0aGlzLl90YXNrKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdC8vIEhhbmRsZSBleHRlcm5hbCBjYW5jZWxsYXRpb24gdG9rZW5cblx0XHRpZiAoX3Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldCh7IC4uLnRoaXMuX3Rhc2ssIHN0YXR1czogJ2NhbmNlbGxlZCcgfSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmUuYWRkKF90b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9sYXN0VGFza1N0YXRlLmdldCgpO1xuXHRcdFx0XHRpZiAoIWlzVGFza0luVGVybWluYWxTdGF0ZShjdXJyZW50KSkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHsgLi4uY3VycmVudCwgc3RhdHVzOiAnY2FuY2VsbGVkJyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIFRUTCBleHBpcmF0aW9uIHdpdGggYW4gZXhwbGljaXQgdGltZW91dFxuXHRcdGlmIChleHBpcmVzQXQpIHtcblx0XHRcdGNvbnN0IHR0bFRpbWVvdXQgPSBleHBpcmVzQXQgLSBEYXRlLm5vdygpO1xuXHRcdFx0aWYgKHR0bFRpbWVvdXQgPD0gMCkge1xuXHRcdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldCh7IC4uLnRoaXMuX3Rhc2ssIHN0YXR1czogJ2NhbmNlbGxlZCcsIHN0YXR1c01lc3NhZ2U6ICdUYXNrIHRpbWVkIG91dC4nIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9sYXN0VGFza1N0YXRlLmdldCgpO1xuXHRcdFx0XHRcdGlmICghaXNUYXNrSW5UZXJtaW5hbFN0YXRlKGN1cnJlbnQpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldCh7IC4uLmN1cnJlbnQsIHN0YXR1czogJ2NhbmNlbGxlZCcsIHN0YXR1c01lc3NhZ2U6ICdUYXNrIHRpbWVkIG91dC4nIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB0dGxUaW1lb3V0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQSBgdGFza3MvcmVzdWx0YCBjYWxsIHRyaWdnZXJlZCBieSBhbiBpbnB1dF9yZXF1aXJlZCBzdGF0ZS5cblx0XHRjb25zdCBpbnB1dFJlcXVpcmVkTG9va3VwID0gb2JzZXJ2YWJsZVZhbHVlPE9ic2VydmFibGVQcm9taXNlPE1DUC5UYXNrPiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVJlc3VsdExvb2t1cCcsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyAxLiBQb2xsIGZvciB0YXNrIHVwZGF0ZXMgd2hlbiB0aGUgdGFzayBpc24ndCBpbiBhIHRlcm1pbmFsIHN0YXRlXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9sYXN0VGFza1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc1Rhc2tJblRlcm1pbmFsU3RhdGUoY3VycmVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaGVuIGEgdGFzayBnb2VzIGludG8gdGhlIGlucHV0X3JlcXVpcmVkIHN0YXRlLCBieSBzcGVjIHdlIHNob3VsZCBjYWxsXG5cdFx0XHQvLyBgdGFza3MvcmVzdWx0YCB3aGljaCBjYW4gcmV0dXJuIGFuIFNTRSBzdHJlYW0gb2YgdGFzayB1cGRhdGVzLiBObyBuZWVkXG5cdFx0XHQvLyB0byBwb2xsIHdoaWxlIHN1Y2ggYSBsb29rdXAgaXMgZ29pbmcgb24sIGJ1dCBvbmNlIGl0IHJlc29sdmVzIHdlIHNob3VsZFxuXHRcdFx0Ly8gY2xlYXIgYW5kIHVwZGF0ZSBvdXIgc3RhdGUuXG5cdFx0XHRjb25zdCBsb29rdXAgPSBpbnB1dFJlcXVpcmVkTG9va3VwLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChsb29rdXApIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gbG9va3VwLnByb21pc2VSZXN1bHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRyZXR1cm4gdHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHQvLyBzdGlsbCBvbmdvaW5nXG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQuZGF0YSkge1xuXHRcdFx0XHRcdFx0aW5wdXRSZXF1aXJlZExvb2t1cC5zZXQodW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldChyZXN1bHQuZGF0YSwgdHgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnB1dFJlcXVpcmVkTG9va3VwLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQuZXJyb3IgaW5zdGFuY2VvZiBNY3BFcnJvciAmJiByZXN1bHQuZXJyb3IuY29kZSA9PT0gTUNQLklOVkFMSURfUEFSQU1TKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhc3RUYXNrU3RhdGUuc2V0KHsgLi4uY3VycmVudCwgc3RhdHVzOiAnY2FuY2VsbGVkJyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gTWF5YmUgYSBjb25uZWN0aW9uIGVycm9yIC0tIHN0YXJ0IHBvbGxpbmcgYWdhaW5cblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFzdFRhc2tTdGF0ZS5zZXQoeyAuLi5jdXJyZW50LCBzdGF0dXM6ICd3b3JraW5nJyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBvbGxJbnRlcnZhbCA9IF90YXNrLnBvbGxJbnRlcnZhbCA/PyAyMDAwO1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKF90b2tlbik7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGhhbmRsZXIuZ2V0VGFzayh7IHRhc2tJZDogY3VycmVudC50YXNrSWQgfSwgY3RzLnRva2VuKVxuXHRcdFx0XHRcdC5jYXRjaCgoZSk6IE1DUC5UYXNrIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgTWNwRXJyb3IgJiYgZS5jb2RlID09PSBNQ1AuSU5WQUxJRF9QQVJBTVMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4uY3VycmVudCwgc3RhdHVzOiAnY2FuY2VsbGVkJyB9O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4uY3VycmVudCB9OyAvLyBlcnJvcnMgYXJlIGFscmVhZHkgbG9nZ2VkLCBrZWVwIGluIGN1cnJlbnQgc3RhdGVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdC50aGVuKHIgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHIgJiYgIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sYXN0VGFza1N0YXRlLnNldChyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSwgcG9sbEludGVydmFsKSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gMi4gR2V0IHRoZSByZXN1bHQgb25jZSBpdCdzIGF2YWlsYWJsZSAob3IgcHJvcGFnYXRlIGVycm9ycykuIFRyaWdnZXJcblx0XHQvLyBpbnB1dF9yZXF1aXJlZCBoYW5kbGluZyBhcyBuZWVkZWQuIE9ubHkgcmVhY3Qgd2hlbiB0aGUgc3RhdHVzIGl0c2VsZiBjaGFuZ2VzLlxuXHRcdGNvbnN0IGxhc3RTdGF0dXMgPSB0aGlzLl9sYXN0VGFza1N0YXRlLm1hcCh0YXNrID0+IHRhc2suc3RhdHVzKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gbGFzdFN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc3RhdHVzID09PSAnZmFpbGVkJykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbGFzdFRhc2tTdGF0ZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMucHJvbWlzZS5lcnJvcihuZXcgRXJyb3IoYFRhc2sgJHtjdXJyZW50LnRhc2tJZH0gZmFpbGVkOiAke2N1cnJlbnQuc3RhdHVzTWVzc2FnZSA/PyAndW5rbm93biBlcnJvcid9YCkpO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpIHtcblx0XHRcdFx0dGhpcy5wcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gJ2lucHV0X3JlcXVpcmVkJykge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5faGFuZGxlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX2xhc3RUYXNrU3RhdGUucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShfdG9rZW4pO1xuXHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRcdFx0aW5wdXRSZXF1aXJlZExvb2t1cC5zZXQobmV3IE9ic2VydmFibGVQcm9taXNlPE1DUC5UYXNrPihoYW5kbGVyLmdldFRhc2soeyB0YXNrSWQ6IGN1cnJlbnQudGFza0lkIH0sIGN0cy50b2tlbikpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcpIHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuX2hhbmRsZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoaGFuZGxlcikge1xuXHRcdFx0XHRcdHRoaXMucHJvbWlzZS5zZXR0bGVXaXRoKGhhbmRsZXIuZ2V0VGFza1Jlc3VsdCh7IHRhc2tJZDogX3Rhc2sudGFza0lkIH0sIF90b2tlbikgYXMgUHJvbWlzZTxUPik7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gJ3dvcmtpbmcnKSB7XG5cdFx0XHRcdC8vIG5vLW9wXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIoc3RhdHVzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvbkRpZFVwZGF0ZVN0YXRlKHRhc2s6IE1DUC5UYXNrKSB7XG5cdFx0dGhpcy5fbGFzdFRhc2tTdGF0ZS5zZXQodGFzaywgdW5kZWZpbmVkKTtcblx0XHRpZiAodGFzay5zdGF0dXNNZXNzYWdlICYmIHRoaXMuX29uU3RhdHVzTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5fb25TdGF0dXNNZXNzYWdlKHRhc2suc3RhdHVzTWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0SGFuZGxlcihoYW5kbGVyOiBNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2hhbmRsZXIuc2V0KGhhbmRsZXIsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqXG4gKiBNYXBzIFZTQ29kZSBMb2dMZXZlbCB0byBNQ1AgTG9nZ2luZ0xldmVsXG4gKi9cbmZ1bmN0aW9uIG1hcExvZ0xldmVsVG9NY3AobG9nTGV2ZWw6IExvZ0xldmVsKTogTUNQLkxvZ2dpbmdMZXZlbCB7XG5cdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOlxuXHRcdFx0cmV0dXJuICdkZWJ1Zyc7IC8vIE1DUCBkb2Vzbid0IGhhdmUgdHJhY2UsIHVzZSBkZWJ1Z1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6XG5cdFx0XHRyZXR1cm4gJ2RlYnVnJztcblx0XHRjYXNlIExvZ0xldmVsLkluZm86XG5cdFx0XHRyZXR1cm4gJ2luZm8nO1xuXHRcdGNhc2UgTG9nTGV2ZWwuV2FybmluZzpcblx0XHRcdHJldHVybiAnd2FybmluZyc7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjpcblx0XHRcdHJldHVybiAnZXJyb3InO1xuXHRcdGNhc2UgTG9nTGV2ZWwuT2ZmOlxuXHRcdFx0cmV0dXJuICdlbWVyZ2VuY3knOyAvLyBNQ1AgZG9lc24ndCBoYXZlIG9mZiwgdXNlIGVtZXJnZW5jeVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gYXNzZXJ0TmV2ZXIobG9nTGV2ZWwpOyAvLyBPZmYgYW5kIG90aGVyIGxldmVscyBhcmUgbm90IHN1cHBvcnRlZFxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhLHVCQUF1QjtBQUM3QyxTQUFTLGlCQUFpQixtQkFBbUIsZUFBZSxrQkFBa0I7QUFDOUUsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsdUJBQXVCO0FBQzlDLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsU0FBOEIsbUJBQW1CLGlCQUFpQixtQkFB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
