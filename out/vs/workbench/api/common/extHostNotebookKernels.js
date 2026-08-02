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
import { asArray } from "../../../base/common/arrays.js";
import { DeferredPromise, timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { URI } from "../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { MainContext } from "./extHost.protocol.js";
import { ApiCommand, ApiCommandArgument, ApiCommandResult } from "./extHostCommands.js";
import * as extHostTypeConverters from "./extHostTypeConverters.js";
import { NotebookCellOutput, NotebookControllerAffinity2, NotebookVariablesRequestKind } from "./extHostTypes.js";
import { asWebviewUri } from "../../contrib/webview/common/webview.js";
import { CellExecutionUpdateType } from "../../contrib/notebook/common/notebookExecutionService.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { variablePageSize } from "../../contrib/notebook/common/notebookKernelService.js";
let ExtHostNotebookKernels = class {
  constructor(mainContext, _initData, _extHostNotebook, _commands, _logService) {
    this._initData = _initData;
    this._extHostNotebook = _extHostNotebook;
    this._commands = _commands;
    this._logService = _logService;
    this._activeExecutions = new ResourceMap();
    this._activeNotebookExecutions = new ResourceMap();
    this._kernelDetectionTask = /* @__PURE__ */ new Map();
    this._kernelDetectionTaskHandlePool = 0;
    this._kernelSourceActionProviders = /* @__PURE__ */ new Map();
    this._kernelSourceActionProviderHandlePool = 0;
    this._kernelData = /* @__PURE__ */ new Map();
    this._handlePool = 0;
    this.id = 0;
    this.variableStore = {};
    this._proxy = mainContext.getProxy(MainContext.MainThreadNotebookKernels);
    const selectKernelApiCommand = new ApiCommand(
      "notebook.selectKernel",
      "_notebook.selectKernel",
      "Trigger kernel picker for specified notebook editor widget",
      [
        new ApiCommandArgument("options", "Select kernel options", (v) => true, (v) => {
          if (v && "notebookEditor" in v && "id" in v) {
            const notebookEditorId = this._extHostNotebook.getIdByEditor(v.notebookEditor);
            return {
              id: v.id,
              extension: v.extension,
              notebookEditorId
            };
          } else if (v && "notebookEditor" in v) {
            const notebookEditorId = this._extHostNotebook.getIdByEditor(v.notebookEditor);
            if (notebookEditorId === void 0) {
              throw new Error(`Cannot invoke 'notebook.selectKernel' for unrecognized notebook editor ${v.notebookEditor.notebook.uri.toString()}`);
            }
            if ("skipIfAlreadySelected" in v) {
              return { notebookEditorId, skipIfAlreadySelected: v.skipIfAlreadySelected };
            }
            return { notebookEditorId };
          }
          return v;
        })
      ],
      ApiCommandResult.Void
    );
    const requestKernelVariablesApiCommand = new ApiCommand(
      "vscode.executeNotebookVariableProvider",
      "_executeNotebookVariableProvider",
      "Execute notebook variable provider",
      [ApiCommandArgument.Uri],
      new ApiCommandResult("A promise that resolves to an array of variables", (value, apiArgs) => {
        return value.map((variable) => {
          return {
            variable: {
              name: variable.name,
              value: variable.value,
              expression: variable.expression,
              type: variable.type,
              language: variable.language
            },
            hasNamedChildren: variable.hasNamedChildren,
            indexedChildrenCount: variable.indexedChildrenCount
          };
        });
      })
    );
    this._commands.registerApiCommand(selectKernelApiCommand);
    this._commands.registerApiCommand(requestKernelVariablesApiCommand);
  }
  createNotebookController(extension, id, viewType, label, handler, preloads) {
    for (const data2 of this._kernelData.values()) {
      if (data2.controller.id === id && ExtensionIdentifier.equals(extension.identifier, data2.extensionId)) {
        throw new Error(`notebook controller with id '${id}' ALREADY exist`);
      }
    }
    const handle = this._handlePool++;
    const that = this;
    this._logService.trace(`NotebookController[${handle}], CREATED by ${extension.identifier.value}, ${id}`);
    const _defaultExecutHandler = () => console.warn(`NO execute handler from notebook controller '${data.id}' of extension: '${extension.identifier}'`);
    let isDisposed = false;
    const onDidChangeSelection = new Emitter();
    const onDidReceiveMessage = new Emitter();
    const data = {
      id: createKernelId(extension.identifier, id),
      notebookType: viewType,
      extensionId: extension.identifier,
      extensionLocation: extension.extensionLocation,
      label: label || extension.identifier.value,
      preloads: preloads ? preloads.map(extHostTypeConverters.NotebookRendererScript.from) : []
    };
    let _executeHandler = handler ?? _defaultExecutHandler;
    let _interruptHandler;
    let _variableProvider;
    let _variableProviderDisposable;
    this._proxy.$addKernel(handle, data).catch((err) => {
      console.log(err);
      isDisposed = true;
    });
    let tokenPool = 0;
    const _update = () => {
      if (isDisposed) {
        return;
      }
      const myToken = ++tokenPool;
      Promise.resolve().then(() => {
        if (myToken === tokenPool) {
          this._proxy.$updateKernel(handle, data);
        }
      });
    };
    const associatedNotebooks = new ResourceMap();
    const controller = {
      get id() {
        return id;
      },
      get notebookType() {
        return data.notebookType;
      },
      onDidChangeSelectedNotebooks: onDidChangeSelection.event,
      get label() {
        return data.label;
      },
      set label(value) {
        data.label = value ?? extension.displayName ?? extension.name;
        _update();
      },
      get detail() {
        return data.detail ?? "";
      },
      set detail(value) {
        data.detail = value;
        _update();
      },
      get description() {
        return data.description ?? "";
      },
      set description(value) {
        data.description = value;
        _update();
      },
      get supportedLanguages() {
        return data.supportedLanguages;
      },
      set supportedLanguages(value) {
        data.supportedLanguages = value;
        _update();
      },
      get supportsExecutionOrder() {
        return data.supportsExecutionOrder ?? false;
      },
      set supportsExecutionOrder(value) {
        data.supportsExecutionOrder = value;
        _update();
      },
      get rendererScripts() {
        return data.preloads ? data.preloads.map(extHostTypeConverters.NotebookRendererScript.to) : [];
      },
      get executeHandler() {
        return _executeHandler;
      },
      set executeHandler(value) {
        _executeHandler = value ?? _defaultExecutHandler;
      },
      get interruptHandler() {
        return _interruptHandler;
      },
      set interruptHandler(value) {
        _interruptHandler = value;
        data.supportsInterrupt = Boolean(value);
        _update();
      },
      set variableProvider(value) {
        checkProposedApiEnabled(extension, "notebookVariableProvider");
        _variableProviderDisposable?.dispose();
        _variableProvider = value;
        data.hasVariableProvider = !!value;
        _variableProviderDisposable = value?.onDidChangeVariables((e) => that._proxy.$variablesUpdated(e.uri));
        _update();
      },
      get variableProvider() {
        return _variableProvider;
      },
      createNotebookCellExecution(cell) {
        if (isDisposed) {
          throw new Error("notebook controller is DISPOSED");
        }
        if (!associatedNotebooks.has(cell.notebook.uri)) {
          that._logService.trace(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`, Array.from(associatedNotebooks.keys()).map((u) => u.toString()));
          throw new Error(`notebook controller is NOT associated to notebook: ${cell.notebook.uri.toString()}`);
        }
        return that._createNotebookCellExecution(cell, createKernelId(extension.identifier, this.id));
      },
      createNotebookExecution(notebook) {
        checkProposedApiEnabled(extension, "notebookExecution");
        if (isDisposed) {
          throw new Error("notebook controller is DISPOSED");
        }
        if (!associatedNotebooks.has(notebook.uri)) {
          that._logService.trace(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`, Array.from(associatedNotebooks.keys()).map((u) => u.toString()));
          throw new Error(`notebook controller is NOT associated to notebook: ${notebook.uri.toString()}`);
        }
        return that._createNotebookExecution(notebook, createKernelId(extension.identifier, this.id));
      },
      dispose: () => {
        if (!isDisposed) {
          this._logService.trace(`NotebookController[${handle}], DISPOSED`);
          isDisposed = true;
          this._kernelData.delete(handle);
          onDidChangeSelection.dispose();
          onDidReceiveMessage.dispose();
          _variableProviderDisposable?.dispose();
          this._proxy.$removeKernel(handle);
        }
      },
      // --- priority
      updateNotebookAffinity(notebook, priority) {
        if (priority === NotebookControllerAffinity2.Hidden) {
          checkProposedApiEnabled(extension, "notebookControllerAffinityHidden");
        }
        that._proxy.$updateNotebookPriority(handle, notebook.uri, priority);
      },
      // --- ipc
      onDidReceiveMessage: onDidReceiveMessage.event,
      postMessage(message, editor) {
        checkProposedApiEnabled(extension, "notebookMessaging");
        return that._proxy.$postMessage(handle, editor && that._extHostNotebook.getIdByEditor(editor), message);
      },
      asWebviewUri(uri) {
        checkProposedApiEnabled(extension, "notebookMessaging");
        return asWebviewUri(uri, that._initData.remote);
      }
    };
    this._kernelData.set(handle, {
      extensionId: extension.identifier,
      controller,
      onDidReceiveMessage,
      onDidChangeSelection,
      associatedNotebooks
    });
    return controller;
  }
  getIdByController(controller) {
    for (const [_, candidate] of this._kernelData) {
      if (candidate.controller === controller) {
        return createKernelId(candidate.extensionId, controller.id);
      }
    }
    return null;
  }
  createNotebookControllerDetectionTask(extension, viewType) {
    const handle = this._kernelDetectionTaskHandlePool++;
    const that = this;
    this._logService.trace(`NotebookControllerDetectionTask[${handle}], CREATED by ${extension.identifier.value}`);
    this._proxy.$addKernelDetectionTask(handle, viewType);
    const detectionTask = {
      dispose: () => {
        this._kernelDetectionTask.delete(handle);
        that._proxy.$removeKernelDetectionTask(handle);
      }
    };
    this._kernelDetectionTask.set(handle, detectionTask);
    return detectionTask;
  }
  registerKernelSourceActionProvider(extension, viewType, provider) {
    const handle = this._kernelSourceActionProviderHandlePool++;
    const eventHandle = typeof provider.onDidChangeNotebookKernelSourceActions === "function" ? handle : void 0;
    const that = this;
    this._kernelSourceActionProviders.set(handle, provider);
    this._logService.trace(`NotebookKernelSourceActionProvider[${handle}], CREATED by ${extension.identifier.value}`);
    this._proxy.$addKernelSourceActionProvider(handle, handle, viewType);
    let subscription;
    if (eventHandle !== void 0) {
      subscription = provider.onDidChangeNotebookKernelSourceActions((_) => this._proxy.$emitNotebookKernelSourceActionsChangeEvent(eventHandle));
    }
    return {
      dispose: () => {
        this._kernelSourceActionProviders.delete(handle);
        that._proxy.$removeKernelSourceActionProvider(handle, handle);
        subscription?.dispose();
      }
    };
  }
  async $provideKernelSourceActions(handle, token) {
    const provider = this._kernelSourceActionProviders.get(handle);
    if (provider) {
      const disposables = new DisposableStore();
      const ret = await provider.provideNotebookKernelSourceActions(token);
      return (ret ?? []).map((item) => extHostTypeConverters.NotebookKernelSourceAction.from(item, this._commands.converter, disposables));
    }
    return [];
  }
  $acceptNotebookAssociation(handle, uri, value) {
    const obj = this._kernelData.get(handle);
    if (obj) {
      const notebook = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
      if (value) {
        obj.associatedNotebooks.set(notebook.uri, true);
      } else {
        obj.associatedNotebooks.delete(notebook.uri);
      }
      this._logService.trace(`NotebookController[${handle}] ASSOCIATE notebook`, notebook.uri.toString(), value);
      obj.onDidChangeSelection.fire({
        selected: value,
        notebook: notebook.apiNotebook
      });
    }
  }
  async $executeCells(handle, uri, handles) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
    const cells = [];
    for (const cellHandle of handles) {
      const cell = document.getCell(cellHandle);
      if (cell) {
        cells.push(cell.apiCell);
      }
    }
    try {
      this._logService.trace(`NotebookController[${handle}] EXECUTE cells`, document.uri.toString(), cells.length);
      await obj.controller.executeHandler.call(obj.controller, cells, document.apiNotebook, obj.controller);
    } catch (err) {
      this._logService.error(`NotebookController[${handle}] execute cells FAILED`, err);
      console.error(err);
    }
  }
  async $cancelCells(handle, uri, handles) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(uri));
    if (obj.controller.interruptHandler) {
      await obj.controller.interruptHandler.call(obj.controller, document.apiNotebook);
    } else {
      for (const cellHandle of handles) {
        const cell = document.getCell(cellHandle);
        if (cell) {
          this._activeExecutions.get(cell.uri)?.cancel();
        }
      }
    }
    if (obj.controller.interruptHandler) {
      const items = this._activeNotebookExecutions.get(document.uri);
      this._activeNotebookExecutions.delete(document.uri);
      if (handles.length && Array.isArray(items) && items.length) {
        items.forEach((d) => d.dispose());
      }
    }
  }
  async $provideVariables(handle, requestId, notebookUri, parentId, kind, start, token) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const document = this._extHostNotebook.getNotebookDocument(URI.revive(notebookUri));
    const variableProvider = obj.controller.variableProvider;
    if (!variableProvider) {
      return;
    }
    let parent = void 0;
    if (parentId !== void 0) {
      parent = this.variableStore[parentId];
      if (!parent) {
        return;
      }
    } else {
      this.variableStore = {};
    }
    const requestKind = kind === "named" ? NotebookVariablesRequestKind.Named : NotebookVariablesRequestKind.Indexed;
    const variableResults = variableProvider.provideVariables(document.apiNotebook, parent, requestKind, start, token);
    let resultCount = 0;
    for await (const result of variableResults) {
      if (token.isCancellationRequested) {
        return;
      }
      const variable = {
        id: this.id++,
        name: result.variable.name,
        value: result.variable.value,
        type: result.variable.type,
        interfaces: result.variable.interfaces,
        language: result.variable.language,
        expression: result.variable.expression,
        hasNamedChildren: result.hasNamedChildren,
        indexedChildrenCount: result.indexedChildrenCount,
        extensionId: obj.extensionId.value
      };
      this.variableStore[variable.id] = result.variable;
      this._proxy.$receiveVariable(requestId, variable);
      if (resultCount++ >= variablePageSize) {
        return;
      }
    }
  }
  $acceptKernelMessageFromRenderer(handle, editorId, message) {
    const obj = this._kernelData.get(handle);
    if (!obj) {
      return;
    }
    const editor = this._extHostNotebook.getEditorById(editorId);
    obj.onDidReceiveMessage.fire(Object.freeze({ editor: editor.apiEditor, message }));
  }
  // ---
  _createNotebookCellExecution(cell, controllerId) {
    if (cell.index < 0) {
      throw new Error("CANNOT execute cell that has been REMOVED from notebook");
    }
    const notebook = this._extHostNotebook.getNotebookDocument(cell.notebook.uri);
    const cellObj = notebook.getCellFromApiCell(cell);
    if (!cellObj) {
      throw new Error("invalid cell");
    }
    if (this._activeExecutions.has(cellObj.uri)) {
      throw new Error(`duplicate execution for ${cellObj.uri}`);
    }
    const execution = new NotebookCellExecutionTask(controllerId, cellObj, this._proxy);
    this._activeExecutions.set(cellObj.uri, execution);
    const listener = execution.onDidChangeState(() => {
      if (execution.state === 2 /* Resolved */) {
        execution.dispose();
        listener.dispose();
        this._activeExecutions.delete(cellObj.uri);
      }
    });
    return execution.asApiObject();
  }
  // ---
  _createNotebookExecution(nb, controllerId) {
    const notebook = this._extHostNotebook.getNotebookDocument(nb.uri);
    const runningCell = nb.getCells().find((cell) => {
      const apiCell = notebook.getCellFromApiCell(cell);
      return apiCell && this._activeExecutions.has(apiCell.uri);
    });
    if (runningCell) {
      throw new Error(`duplicate cell execution for ${runningCell.document.uri}`);
    }
    if (this._activeNotebookExecutions.has(notebook.uri)) {
      throw new Error(`duplicate notebook execution for ${notebook.uri}`);
    }
    const execution = new NotebookExecutionTask(controllerId, notebook, this._proxy);
    const listener = execution.onDidChangeState(() => {
      if (execution.state === 2 /* Resolved */) {
        execution.dispose();
        listener.dispose();
        this._activeNotebookExecutions.delete(notebook.uri);
      }
    });
    this._activeNotebookExecutions.set(notebook.uri, [execution, listener]);
    return execution.asApiObject();
  }
};
ExtHostNotebookKernels = __decorateClass([
  __decorateParam(4, ILogService)
], ExtHostNotebookKernels);
var NotebookCellExecutionTaskState = /* @__PURE__ */ ((NotebookCellExecutionTaskState2) => {
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Init"] = 0] = "Init";
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Started"] = 1] = "Started";
  NotebookCellExecutionTaskState2[NotebookCellExecutionTaskState2["Resolved"] = 2] = "Resolved";
  return NotebookCellExecutionTaskState2;
})(NotebookCellExecutionTaskState || {});
const _NotebookCellExecutionTask = class _NotebookCellExecutionTask extends Disposable {
  constructor(controllerId, _cell, _proxy) {
    super();
    this._cell = _cell;
    this._proxy = _proxy;
    this._handle = _NotebookCellExecutionTask.HANDLE++;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this._state = 0 /* Init */;
    this._tokenSource = this._register(new CancellationTokenSource());
    this._collector = new TimeoutBasedCollector(10, (updates) => this.update(updates));
    this._executionOrder = _cell.internalMetadata.executionOrder;
    this._proxy.$createExecution(this._handle, controllerId, this._cell.notebook.uri, this._cell.handle);
  }
  get state() {
    return this._state;
  }
  cancel() {
    this._tokenSource.cancel();
  }
  async updateSoon(update) {
    await this._collector.addItem(update);
  }
  async update(update) {
    const updates = Array.isArray(update) ? update : [update];
    return this._proxy.$updateExecution(this._handle, new SerializableObjectWithBuffers(updates));
  }
  verifyStateForOutput() {
    if (this._state === 0 /* Init */) {
      throw new Error("Must call start before modifying cell output");
    }
    if (this._state === 2 /* Resolved */) {
      throw new Error("Cannot modify cell output after calling resolve");
    }
  }
  cellIndexToHandle(cellOrCellIndex) {
    let cell = this._cell;
    if (cellOrCellIndex) {
      cell = this._cell.notebook.getCellFromApiCell(cellOrCellIndex);
    }
    if (!cell) {
      throw new Error("INVALID cell");
    }
    return cell.handle;
  }
  validateAndConvertOutputs(items) {
    return items.map((output) => {
      const newOutput = NotebookCellOutput.ensureUniqueMimeTypes(output.items, true);
      if (newOutput === output.items) {
        return extHostTypeConverters.NotebookCellOutput.from(output);
      }
      return extHostTypeConverters.NotebookCellOutput.from({
        items: newOutput,
        id: output.id,
        metadata: output.metadata
      });
    });
  }
  async updateOutputs(outputs, cell, append) {
    const handle = this.cellIndexToHandle(cell);
    const outputDtos = this.validateAndConvertOutputs(asArray(outputs));
    return this.updateSoon(
      {
        editType: CellExecutionUpdateType.Output,
        cellHandle: handle,
        append,
        outputs: outputDtos
      }
    );
  }
  async updateOutputItems(items, output, append) {
    items = NotebookCellOutput.ensureUniqueMimeTypes(asArray(items), true);
    return this.updateSoon({
      editType: CellExecutionUpdateType.OutputItems,
      items: items.map(extHostTypeConverters.NotebookCellOutputItem.from),
      outputId: output.id,
      append
    });
  }
  asApiObject() {
    const that = this;
    const result = {
      get token() {
        return that._tokenSource.token;
      },
      get cell() {
        return that._cell.apiCell;
      },
      get executionOrder() {
        return that._executionOrder;
      },
      set executionOrder(v) {
        that._executionOrder = v;
        that.update([{
          editType: CellExecutionUpdateType.ExecutionState,
          executionOrder: that._executionOrder
        }]);
      },
      start(startTime) {
        if (that._state === 2 /* Resolved */ || that._state === 1 /* Started */) {
          throw new Error("Cannot call start again");
        }
        that._state = 1 /* Started */;
        that._onDidChangeState.fire();
        that.update({
          editType: CellExecutionUpdateType.ExecutionState,
          runStartTime: startTime
        });
      },
      end(success, endTime, executionError) {
        if (that._state === 2 /* Resolved */) {
          throw new Error("Cannot call resolve twice");
        }
        that._state = 2 /* Resolved */;
        that._onDidChangeState.fire();
        that._collector.flush();
        const error = createSerializeableError(executionError);
        that._proxy.$completeExecution(that._handle, new SerializableObjectWithBuffers({
          runEndTime: endTime,
          lastRunSuccess: success,
          error
        }));
      },
      clearOutput(cell) {
        that.verifyStateForOutput();
        return that.updateOutputs([], cell, false);
      },
      appendOutput(outputs, cell) {
        that.verifyStateForOutput();
        return that.updateOutputs(outputs, cell, true);
      },
      replaceOutput(outputs, cell) {
        that.verifyStateForOutput();
        return that.updateOutputs(outputs, cell, false);
      },
      appendOutputItems(items, output) {
        that.verifyStateForOutput();
        return that.updateOutputItems(items, output, true);
      },
      replaceOutputItems(items, output) {
        that.verifyStateForOutput();
        return that.updateOutputItems(items, output, false);
      }
    };
    return Object.freeze(result);
  }
};
_NotebookCellExecutionTask.HANDLE = 0;
let NotebookCellExecutionTask = _NotebookCellExecutionTask;
function createSerializeableError(executionError) {
  const convertRange = (range) => range ? {
    startLineNumber: range.start.line,
    startColumn: range.start.character,
    endLineNumber: range.end.line,
    endColumn: range.end.character
  } : void 0;
  const convertStackFrame = (frame) => ({
    uri: frame.uri,
    position: frame.position,
    label: frame.label
  });
  const error = executionError ? {
    name: executionError.name,
    message: executionError.message,
    stack: executionError.stack instanceof Array ? executionError.stack.map((frame) => convertStackFrame(frame)) : executionError.stack,
    location: convertRange(executionError.location),
    uri: executionError.uri
  } : void 0;
  return error;
}
var NotebookExecutionTaskState = /* @__PURE__ */ ((NotebookExecutionTaskState2) => {
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Init"] = 0] = "Init";
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Started"] = 1] = "Started";
  NotebookExecutionTaskState2[NotebookExecutionTaskState2["Resolved"] = 2] = "Resolved";
  return NotebookExecutionTaskState2;
})(NotebookExecutionTaskState || {});
const _NotebookExecutionTask = class _NotebookExecutionTask extends Disposable {
  constructor(controllerId, _notebook, _proxy) {
    super();
    this._notebook = _notebook;
    this._proxy = _proxy;
    this._handle = _NotebookExecutionTask.HANDLE++;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this._state = 0 /* Init */;
    this._tokenSource = this._register(new CancellationTokenSource());
    this._proxy.$createNotebookExecution(this._handle, controllerId, this._notebook.uri);
  }
  get state() {
    return this._state;
  }
  cancel() {
    this._tokenSource.cancel();
  }
  asApiObject() {
    const result = {
      start: () => {
        if (this._state === 2 /* Resolved */ || this._state === 1 /* Started */) {
          throw new Error("Cannot call start again");
        }
        this._state = 1 /* Started */;
        this._onDidChangeState.fire();
        this._proxy.$beginNotebookExecution(this._handle);
      },
      end: () => {
        if (this._state === 2 /* Resolved */) {
          throw new Error("Cannot call resolve twice");
        }
        this._state = 2 /* Resolved */;
        this._onDidChangeState.fire();
        this._proxy.$completeNotebookExecution(this._handle);
      }
    };
    return Object.freeze(result);
  }
};
_NotebookExecutionTask.HANDLE = 0;
let NotebookExecutionTask = _NotebookExecutionTask;
class TimeoutBasedCollector {
  constructor(delay, callback) {
    this.delay = delay;
    this.callback = callback;
    this.batch = [];
    this.startedTimer = Date.now();
  }
  addItem(item) {
    this.batch.push(item);
    if (!this.currentDeferred) {
      this.currentDeferred = new DeferredPromise();
      this.startedTimer = Date.now();
      timeout(this.delay).then(() => {
        return this.flush();
      });
    }
    if (Date.now() - this.startedTimer > this.delay) {
      return this.flush();
    }
    return this.currentDeferred.p;
  }
  flush() {
    if (this.batch.length === 0 || !this.currentDeferred) {
      return Promise.resolve();
    }
    const deferred = this.currentDeferred;
    this.currentDeferred = void 0;
    const batch = this.batch;
    this.batch = [];
    return this.callback(batch).finally(() => deferred.complete());
  }
}
function createKernelId(extensionIdentifier, id) {
  return `${extensionIdentifier.value}/${id}`;
}
export {
  ExtHostNotebookKernels,
  createKernelId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3ROb3RlYm9va0tlcm5lbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0tlcm5lbHNTaGFwZSwgSUNlbGxFeGVjdXRlVXBkYXRlRHRvLCBJTWFpbkNvbnRleHQsIElOb3RlYm9va0tlcm5lbER0bzIsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzU2hhcGUsIE5vdGVib29rT3V0cHV0RHRvLCBWYXJpYWJsZXNSZXN1bHQgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQXBpQ29tbWFuZCwgQXBpQ29tbWFuZEFyZ3VtZW50LCBBcGlDb21tYW5kUmVzdWx0LCBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyIH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2suanMnO1xuaW1wb3J0IHsgRXh0SG9zdENlbGwsIEV4dEhvc3ROb3RlYm9va0RvY3VtZW50IH0gZnJvbSAnLi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudC5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZUNvbnZlcnRlcnMgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsT3V0cHV0LCBOb3RlYm9va0NvbnRyb2xsZXJBZmZpbml0eTIsIE5vdGVib29rVmFyaWFibGVzUmVxdWVzdEtpbmQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBhc1dlYnZpZXdVcmkgfSBmcm9tICcuLi8uLi9jb250cmliL3dlYnZpZXcvY29tbW9uL3dlYnZpZXcuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgdmFyaWFibGVQYWdlU2l6ZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJS2VybmVsRGF0YSB7XG5cdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRjb250cm9sbGVyOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyO1xuXHRvbkRpZENoYW5nZVNlbGVjdGlvbjogRW1pdHRlcjx7IHNlbGVjdGVkOiBib29sZWFuOyBub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQgfT47XG5cdG9uRGlkUmVjZWl2ZU1lc3NhZ2U6IEVtaXR0ZXI8eyBlZGl0b3I6IHZzY29kZS5Ob3RlYm9va0VkaXRvcjsgbWVzc2FnZTogdW5rbm93biB9Pjtcblx0YXNzb2NpYXRlZE5vdGVib29rczogUmVzb3VyY2VNYXA8Ym9vbGVhbj47XG59XG5cbnR5cGUgRXh0SG9zdFNlbGVjdEtlcm5lbEFyZ3MgPSBDb250cm9sbGVySW5mbyB8IHsgbm90ZWJvb2tFZGl0b3I6IHZzY29kZS5Ob3RlYm9va0VkaXRvciB9IHwgQ29udHJvbGxlckluZm8gJiB7IG5vdGVib29rRWRpdG9yOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3IgfSB8IHVuZGVmaW5lZDtcbnR5cGUgU2VsZWN0S2VybmVsUmV0dXJuQXJncyA9IENvbnRyb2xsZXJJbmZvIHwgeyBub3RlYm9va0VkaXRvcklkOiBzdHJpbmcgfSB8IENvbnRyb2xsZXJJbmZvICYgeyBub3RlYm9va0VkaXRvcklkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcbnR5cGUgQ29udHJvbGxlckluZm8gPSB7IGlkOiBzdHJpbmc7IGV4dGVuc2lvbjogc3RyaW5nIH07XG5cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3ROb3RlYm9va0tlcm5lbHMgaW1wbGVtZW50cyBFeHRIb3N0Tm90ZWJvb2tLZXJuZWxzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUV4ZWN1dGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8Tm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFzaz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zID0gbmV3IFJlc291cmNlTWFwPFtOb3RlYm9va0V4ZWN1dGlvblRhc2ssIElEaXNwb3NhYmxlXT4oKTtcblxuXHRwcml2YXRlIF9rZXJuZWxEZXRlY3Rpb25UYXNrID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5Ob3RlYm9va0NvbnRyb2xsZXJEZXRlY3Rpb25UYXNrPigpO1xuXHRwcml2YXRlIF9rZXJuZWxEZXRlY3Rpb25UYXNrSGFuZGxlUG9vbDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMgPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVySGFuZGxlUG9vbDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxEYXRhID0gbmV3IE1hcDxudW1iZXIsIElLZXJuZWxEYXRhPigpO1xuXHRwcml2YXRlIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3ROb3RlYm9vazogRXh0SG9zdE5vdGVib29rQ29udHJvbGxlcixcblx0XHRwcml2YXRlIF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzKTtcblxuXHRcdC8vIHRvZG9AcmVib3JuaXggQGpveWNlZXJobDogbW92ZSB0byBBUElDb21tYW5kcyBvbmNlIHN0YWJpbGl6ZWQuXG5cdFx0Y29uc3Qgc2VsZWN0S2VybmVsQXBpQ29tbWFuZCA9IG5ldyBBcGlDb21tYW5kKFxuXHRcdFx0J25vdGVib29rLnNlbGVjdEtlcm5lbCcsXG5cdFx0XHQnX25vdGVib29rLnNlbGVjdEtlcm5lbCcsXG5cdFx0XHQnVHJpZ2dlciBrZXJuZWwgcGlja2VyIGZvciBzcGVjaWZpZWQgbm90ZWJvb2sgZWRpdG9yIHdpZGdldCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8RXh0SG9zdFNlbGVjdEtlcm5lbEFyZ3MsIFNlbGVjdEtlcm5lbFJldHVybkFyZ3M+KCdvcHRpb25zJywgJ1NlbGVjdCBrZXJuZWwgb3B0aW9ucycsIHYgPT4gdHJ1ZSwgKHY6IEV4dEhvc3RTZWxlY3RLZXJuZWxBcmdzKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHYgJiYgJ25vdGVib29rRWRpdG9yJyBpbiB2ICYmICdpZCcgaW4gdikge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JJZCA9IHRoaXMuX2V4dEhvc3ROb3RlYm9vay5nZXRJZEJ5RWRpdG9yKHYubm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0aWQ6IHYuaWQsIGV4dGVuc2lvbjogdi5leHRlbnNpb24sIG5vdGVib29rRWRpdG9ySWRcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh2ICYmICdub3RlYm9va0VkaXRvcicgaW4gdikge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JJZCA9IHRoaXMuX2V4dEhvc3ROb3RlYm9vay5nZXRJZEJ5RWRpdG9yKHYubm90ZWJvb2tFZGl0b3IpO1xuXHRcdFx0XHRcdFx0aWYgKG5vdGVib29rRWRpdG9ySWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBpbnZva2UgJ25vdGVib29rLnNlbGVjdEtlcm5lbCcgZm9yIHVucmVjb2duaXplZCBub3RlYm9vayBlZGl0b3IgJHt2Lm5vdGVib29rRWRpdG9yLm5vdGVib29rLnVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCdza2lwSWZBbHJlYWR5U2VsZWN0ZWQnIGluIHYpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgbm90ZWJvb2tFZGl0b3JJZCwgc2tpcElmQWxyZWFkeVNlbGVjdGVkOiB2LnNraXBJZkFscmVhZHlTZWxlY3RlZCB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHsgbm90ZWJvb2tFZGl0b3JJZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdjtcblx0XHRcdFx0fSlcblx0XHRcdF0sXG5cdFx0XHRBcGlDb21tYW5kUmVzdWx0LlZvaWQpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdEtlcm5lbFZhcmlhYmxlc0FwaUNvbW1hbmQgPSBuZXcgQXBpQ29tbWFuZChcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZU5vdGVib29rVmFyaWFibGVQcm92aWRlcicsXG5cdFx0XHQnX2V4ZWN1dGVOb3RlYm9va1ZhcmlhYmxlUHJvdmlkZXInLFxuXHRcdFx0J0V4ZWN1dGUgbm90ZWJvb2sgdmFyaWFibGUgcHJvdmlkZXInLFxuXHRcdFx0W0FwaUNvbW1hbmRBcmd1bWVudC5VcmldLFxuXHRcdFx0bmV3IEFwaUNvbW1hbmRSZXN1bHQ8VmFyaWFibGVzUmVzdWx0W10sIHZzY29kZS5WYXJpYWJsZXNSZXN1bHRbXT4oJ0EgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHZhcmlhYmxlcycsICh2YWx1ZSwgYXBpQXJncykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUubWFwKHZhcmlhYmxlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dmFyaWFibGU6IHtcblx0XHRcdFx0XHRcdFx0bmFtZTogdmFyaWFibGUubmFtZSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRleHByZXNzaW9uOiB2YXJpYWJsZS5leHByZXNzaW9uLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiB2YXJpYWJsZS50eXBlLFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZTogdmFyaWFibGUubGFuZ3VhZ2Vcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRoYXNOYW1lZENoaWxkcmVuOiB2YXJpYWJsZS5oYXNOYW1lZENoaWxkcmVuLFxuXHRcdFx0XHRcdFx0aW5kZXhlZENoaWxkcmVuQ291bnQ6IHZhcmlhYmxlLmluZGV4ZWRDaGlsZHJlbkNvdW50XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdCk7XG5cdFx0dGhpcy5fY29tbWFuZHMucmVnaXN0ZXJBcGlDb21tYW5kKHNlbGVjdEtlcm5lbEFwaUNvbW1hbmQpO1xuXHRcdHRoaXMuX2NvbW1hbmRzLnJlZ2lzdGVyQXBpQ29tbWFuZChyZXF1ZXN0S2VybmVsVmFyaWFibGVzQXBpQ29tbWFuZCk7XG5cdH1cblxuXHRjcmVhdGVOb3RlYm9va0NvbnRyb2xsZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHZpZXdUeXBlOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGhhbmRsZXI/OiAoY2VsbHM6IHZzY29kZS5Ob3RlYm9va0NlbGxbXSwgbm90ZWJvb2s6IHZzY29kZS5Ob3RlYm9va0RvY3VtZW50LCBjb250cm9sbGVyOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyKSA9PiB2b2lkIHwgVGhlbmFibGU8dm9pZD4sIHByZWxvYWRzPzogdnNjb2RlLk5vdGVib29rUmVuZGVyZXJTY3JpcHRbXSk6IHZzY29kZS5Ob3RlYm9va0NvbnRyb2xsZXIge1xuXG5cdFx0Zm9yIChjb25zdCBkYXRhIG9mIHRoaXMuX2tlcm5lbERhdGEudmFsdWVzKCkpIHtcblx0XHRcdGlmIChkYXRhLmNvbnRyb2xsZXIuaWQgPT09IGlkICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBkYXRhLmV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vdGVib29rIGNvbnRyb2xsZXIgd2l0aCBpZCAnJHtpZH0nIEFMUkVBRFkgZXhpc3RgKTtcblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2hhbmRsZVBvb2wrKztcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dLCBDUkVBVEVEIGJ5ICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9LCAke2lkfWApO1xuXG5cdFx0Y29uc3QgX2RlZmF1bHRFeGVjdXRIYW5kbGVyID0gKCkgPT4gY29uc29sZS53YXJuKGBOTyBleGVjdXRlIGhhbmRsZXIgZnJvbSBub3RlYm9vayBjb250cm9sbGVyICcke2RhdGEuaWR9JyBvZiBleHRlbnNpb246ICcke2V4dGVuc2lvbi5pZGVudGlmaWVyfSdgKTtcblxuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IG5ldyBFbWl0dGVyPHsgc2VsZWN0ZWQ6IGJvb2xlYW47IG5vdGVib29rOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCB9PigpO1xuXHRcdGNvbnN0IG9uRGlkUmVjZWl2ZU1lc3NhZ2UgPSBuZXcgRW1pdHRlcjx7IGVkaXRvcjogdnNjb2RlLk5vdGVib29rRWRpdG9yOyBtZXNzYWdlOiB1bmtub3duIH0+KCk7XG5cblx0XHRjb25zdCBkYXRhOiBJTm90ZWJvb2tLZXJuZWxEdG8yID0ge1xuXHRcdFx0aWQ6IGNyZWF0ZUtlcm5lbElkKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCksXG5cdFx0XHRub3RlYm9va1R5cGU6IHZpZXdUeXBlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0ZXh0ZW5zaW9uTG9jYXRpb246IGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbixcblx0XHRcdGxhYmVsOiBsYWJlbCB8fCBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdHByZWxvYWRzOiBwcmVsb2FkcyA/IHByZWxvYWRzLm1hcChleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tSZW5kZXJlclNjcmlwdC5mcm9tKSA6IFtdXG5cdFx0fTtcblxuXHRcdC8vXG5cdFx0bGV0IF9leGVjdXRlSGFuZGxlciA9IGhhbmRsZXIgPz8gX2RlZmF1bHRFeGVjdXRIYW5kbGVyO1xuXHRcdGxldCBfaW50ZXJydXB0SGFuZGxlcjogKCh0aGlzOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyLCBub3RlYm9vazogdnNjb2RlLk5vdGVib29rRG9jdW1lbnQpID0+IHZvaWQgfCBUaGVuYWJsZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IF92YXJpYWJsZVByb3ZpZGVyOiB2c2NvZGUuTm90ZWJvb2tWYXJpYWJsZVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBfdmFyaWFibGVQcm92aWRlckRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcHJveHkuJGFkZEtlcm5lbChoYW5kbGUsIGRhdGEpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHQvLyB0aGlzIGNhbiBoYXBwZW4gd2hlbiBhIGtlcm5lbCB3aXRoIHRoYXQgSUQgaXMgYWxyZWFkeSByZWdpc3RlcmVkXG5cdFx0XHRjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0aXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHQvLyB1cGRhdGU6IGFsbCBzZXR0ZXJzIHdyaXRlIGRpcmVjdGx5IGludG8gdGhlIGR0byBvYmplY3Rcblx0XHQvLyBhbmQgdHJpZ2dlciBhbiB1cGRhdGUuIHRoZSBhY3R1YWwgdXBkYXRlIHdpbGwgb25seSBoYXBwZW5cblx0XHQvLyBvbmNlIHBlciBldmVudCBsb29wIGV4ZWN1dGlvblxuXHRcdGxldCB0b2tlblBvb2wgPSAwO1xuXHRcdGNvbnN0IF91cGRhdGUgPSAoKSA9PiB7XG5cdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBteVRva2VuID0gKyt0b2tlblBvb2w7XG5cdFx0XHRQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKG15VG9rZW4gPT09IHRva2VuUG9vbCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiR1cGRhdGVLZXJuZWwoaGFuZGxlLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdC8vIG5vdGVib29rIGRvY3VtZW50cyB0aGF0IGFyZSBhc3NvY2lhdGVkIHRvIHRoaXMgY29udHJvbGxlclxuXHRcdGNvbnN0IGFzc29jaWF0ZWROb3RlYm9va3MgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXI6IHZzY29kZS5Ob3RlYm9va0NvbnRyb2xsZXIgPSB7XG5cdFx0XHRnZXQgaWQoKSB7IHJldHVybiBpZDsgfSxcblx0XHRcdGdldCBub3RlYm9va1R5cGUoKSB7IHJldHVybiBkYXRhLm5vdGVib29rVHlwZTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3M6IG9uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50LFxuXHRcdFx0Z2V0IGxhYmVsKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5sYWJlbDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgbGFiZWwodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5sYWJlbCA9IHZhbHVlID8/IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24ubmFtZTtcblx0XHRcdFx0X3VwZGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBkZXRhaWwoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmRldGFpbCA/PyAnJztcblx0XHRcdH0sXG5cdFx0XHRzZXQgZGV0YWlsKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEuZGV0YWlsID0gdmFsdWU7XG5cdFx0XHRcdF91cGRhdGUoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgZGVzY3JpcHRpb24oKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmRlc2NyaXB0aW9uID8/ICcnO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkZXNjcmlwdGlvbih2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLmRlc2NyaXB0aW9uID0gdmFsdWU7XG5cdFx0XHRcdF91cGRhdGUoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc3VwcG9ydGVkTGFuZ3VhZ2VzKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5zdXBwb3J0ZWRMYW5ndWFnZXM7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHN1cHBvcnRlZExhbmd1YWdlcyh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLnN1cHBvcnRlZExhbmd1YWdlcyA9IHZhbHVlO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN1cHBvcnRzRXhlY3V0aW9uT3JkZXIoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLnN1cHBvcnRzRXhlY3V0aW9uT3JkZXIgPz8gZmFsc2U7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHN1cHBvcnRzRXhlY3V0aW9uT3JkZXIodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5zdXBwb3J0c0V4ZWN1dGlvbk9yZGVyID0gdmFsdWU7XG5cdFx0XHRcdF91cGRhdGUoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgcmVuZGVyZXJTY3JpcHRzKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5wcmVsb2FkcyA/IGRhdGEucHJlbG9hZHMubWFwKGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va1JlbmRlcmVyU2NyaXB0LnRvKSA6IFtdO1xuXHRcdFx0fSxcblx0XHRcdGdldCBleGVjdXRlSGFuZGxlcigpIHtcblx0XHRcdFx0cmV0dXJuIF9leGVjdXRlSGFuZGxlcjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgZXhlY3V0ZUhhbmRsZXIodmFsdWUpIHtcblx0XHRcdFx0X2V4ZWN1dGVIYW5kbGVyID0gdmFsdWUgPz8gX2RlZmF1bHRFeGVjdXRIYW5kbGVyO1xuXHRcdFx0fSxcblx0XHRcdGdldCBpbnRlcnJ1cHRIYW5kbGVyKCkge1xuXHRcdFx0XHRyZXR1cm4gX2ludGVycnVwdEhhbmRsZXI7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGludGVycnVwdEhhbmRsZXIodmFsdWUpIHtcblx0XHRcdFx0X2ludGVycnVwdEhhbmRsZXIgPSB2YWx1ZTtcblx0XHRcdFx0ZGF0YS5zdXBwb3J0c0ludGVycnVwdCA9IEJvb2xlYW4odmFsdWUpO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHZhcmlhYmxlUHJvdmlkZXIodmFsdWUpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tWYXJpYWJsZVByb3ZpZGVyJyk7XG5cdFx0XHRcdF92YXJpYWJsZVByb3ZpZGVyRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRfdmFyaWFibGVQcm92aWRlciA9IHZhbHVlO1xuXHRcdFx0XHRkYXRhLmhhc1ZhcmlhYmxlUHJvdmlkZXIgPSAhIXZhbHVlO1xuXHRcdFx0XHRfdmFyaWFibGVQcm92aWRlckRpc3Bvc2FibGUgPSB2YWx1ZT8ub25EaWRDaGFuZ2VWYXJpYWJsZXMoZSA9PiB0aGF0Ll9wcm94eS4kdmFyaWFibGVzVXBkYXRlZChlLnVyaSkpO1xuXHRcdFx0XHRfdXBkYXRlKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHZhcmlhYmxlUHJvdmlkZXIoKSB7XG5cdFx0XHRcdHJldHVybiBfdmFyaWFibGVQcm92aWRlcjtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVOb3RlYm9va0NlbGxFeGVjdXRpb24oY2VsbCkge1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90ZWJvb2sgY29udHJvbGxlciBpcyBESVNQT1NFRCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghYXNzb2NpYXRlZE5vdGVib29rcy5oYXMoY2VsbC5ub3RlYm9vay51cmkpKSB7XG5cdFx0XHRcdFx0dGhhdC5fbG9nU2VydmljZS50cmFjZShgTm90ZWJvb2tDb250cm9sbGVyWyR7aGFuZGxlfV0gTk9UIGFzc29jaWF0ZWQgdG8gbm90ZWJvb2ssIGFzc29jaWF0ZWQgdG8gVEhFU0Ugbm90ZWJvb2tzOmAsIEFycmF5LmZyb20oYXNzb2NpYXRlZE5vdGVib29rcy5rZXlzKCkpLm1hcCh1ID0+IHUudG9TdHJpbmcoKSkpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgbm90ZWJvb2sgY29udHJvbGxlciBpcyBOT1QgYXNzb2NpYXRlZCB0byBub3RlYm9vazogJHtjZWxsLm5vdGVib29rLnVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9jcmVhdGVOb3RlYm9va0NlbGxFeGVjdXRpb24oY2VsbCwgY3JlYXRlS2VybmVsSWQoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRoaXMuaWQpKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVOb3RlYm9va0V4ZWN1dGlvbihub3RlYm9vaykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdub3RlYm9va0V4ZWN1dGlvbicpO1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90ZWJvb2sgY29udHJvbGxlciBpcyBESVNQT1NFRCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghYXNzb2NpYXRlZE5vdGVib29rcy5oYXMobm90ZWJvb2sudXJpKSkge1xuXHRcdFx0XHRcdHRoYXQuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dIE5PVCBhc3NvY2lhdGVkIHRvIG5vdGVib29rLCBhc3NvY2lhdGVkIHRvIFRIRVNFIG5vdGVib29rczpgLCBBcnJheS5mcm9tKGFzc29jaWF0ZWROb3RlYm9va3Mua2V5cygpKS5tYXAodSA9PiB1LnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vdGVib29rIGNvbnRyb2xsZXIgaXMgTk9UIGFzc29jaWF0ZWQgdG8gbm90ZWJvb2s6ICR7bm90ZWJvb2sudXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoYXQuX2NyZWF0ZU5vdGVib29rRXhlY3V0aW9uKG5vdGVib29rLCBjcmVhdGVLZXJuZWxJZChleHRlbnNpb24uaWRlbnRpZmllciwgdGhpcy5pZCkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTm90ZWJvb2tDb250cm9sbGVyWyR7aGFuZGxlfV0sIERJU1BPU0VEYCk7XG5cdFx0XHRcdFx0aXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fa2VybmVsRGF0YS5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0XHRvbkRpZENoYW5nZVNlbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0b25EaWRSZWNlaXZlTWVzc2FnZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0X3ZhcmlhYmxlUHJvdmlkZXJEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbW92ZUtlcm5lbChoYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Ly8gLS0tIHByaW9yaXR5XG5cdFx0XHR1cGRhdGVOb3RlYm9va0FmZmluaXR5KG5vdGVib29rLCBwcmlvcml0eSkge1xuXHRcdFx0XHRpZiAocHJpb3JpdHkgPT09IE5vdGVib29rQ29udHJvbGxlckFmZmluaXR5Mi5IaWRkZW4pIHtcblx0XHRcdFx0XHQvLyBUaGlzIGFwaSBvbmx5IGFkZHMgYW4gZXh0cmEgZW51bSB2YWx1ZSwgdGhlIGZ1bmN0aW9uIGlzIHRoZSBzYW1lLCBzbyBqdXN0IGdhdGUgb24gdGhlIG5ldyB2YWx1ZSBiZWluZyBwYXNzZWRcblx0XHRcdFx0XHQvLyBmb3IgcHJvcG9zZWRBUEkgY2hlY2suXG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHlIaWRkZW4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGF0Ll9wcm94eS4kdXBkYXRlTm90ZWJvb2tQcmlvcml0eShoYW5kbGUsIG5vdGVib29rLnVyaSwgcHJpb3JpdHkpO1xuXHRcdFx0fSxcblx0XHRcdC8vIC0tLSBpcGNcblx0XHRcdG9uRGlkUmVjZWl2ZU1lc3NhZ2U6IG9uRGlkUmVjZWl2ZU1lc3NhZ2UuZXZlbnQsXG5cdFx0XHRwb3N0TWVzc2FnZShtZXNzYWdlLCBlZGl0b3IpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tNZXNzYWdpbmcnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3Byb3h5LiRwb3N0TWVzc2FnZShoYW5kbGUsIGVkaXRvciAmJiB0aGF0Ll9leHRIb3N0Tm90ZWJvb2suZ2V0SWRCeUVkaXRvcihlZGl0b3IpLCBtZXNzYWdlKTtcblx0XHRcdH0sXG5cdFx0XHRhc1dlYnZpZXdVcmkodXJpOiBVUkkpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbm90ZWJvb2tNZXNzYWdpbmcnKTtcblx0XHRcdFx0cmV0dXJuIGFzV2Vidmlld1VyaSh1cmksIHRoYXQuX2luaXREYXRhLnJlbW90ZSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0aGlzLl9rZXJuZWxEYXRhLnNldChoYW5kbGUsIHtcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdGNvbnRyb2xsZXIsXG5cdFx0XHRvbkRpZFJlY2VpdmVNZXNzYWdlLFxuXHRcdFx0b25EaWRDaGFuZ2VTZWxlY3Rpb24sXG5cdFx0XHRhc3NvY2lhdGVkTm90ZWJvb2tzXG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXI7XG5cdH1cblxuXHRnZXRJZEJ5Q29udHJvbGxlcihjb250cm9sbGVyOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyKSB7XG5cdFx0Zm9yIChjb25zdCBbXywgY2FuZGlkYXRlXSBvZiB0aGlzLl9rZXJuZWxEYXRhKSB7XG5cdFx0XHRpZiAoY2FuZGlkYXRlLmNvbnRyb2xsZXIgPT09IGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUtlcm5lbElkKGNhbmRpZGF0ZS5leHRlbnNpb25JZCwgY29udHJvbGxlci5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y3JlYXRlTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdmlld1R5cGU6IHN0cmluZyk6IHZzY29kZS5Ob3RlYm9va0NvbnRyb2xsZXJEZXRlY3Rpb25UYXNrIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9rZXJuZWxEZXRlY3Rpb25UYXNrSGFuZGxlUG9vbCsrO1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFza1ske2hhbmRsZX1dLCBDUkVBVEVEIGJ5ICR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9YCk7XG5cdFx0dGhpcy5fcHJveHkuJGFkZEtlcm5lbERldGVjdGlvblRhc2soaGFuZGxlLCB2aWV3VHlwZSk7XG5cblx0XHRjb25zdCBkZXRlY3Rpb25UYXNrOiB2c2NvZGUuTm90ZWJvb2tDb250cm9sbGVyRGV0ZWN0aW9uVGFzayA9IHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFzay5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhhdC5fcHJveHkuJHJlbW92ZUtlcm5lbERldGVjdGlvblRhc2soaGFuZGxlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFzay5zZXQoaGFuZGxlLCBkZXRlY3Rpb25UYXNrKTtcblx0XHRyZXR1cm4gZGV0ZWN0aW9uVGFzaztcblx0fVxuXG5cdHJlZ2lzdGVyS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHZpZXdUeXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcikge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVySGFuZGxlUG9vbCsrO1xuXHRcdGNvbnN0IGV2ZW50SGFuZGxlID0gdHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlTm90ZWJvb2tLZXJuZWxTb3VyY2VBY3Rpb25zID09PSAnZnVuY3Rpb24nID8gaGFuZGxlIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyWyR7aGFuZGxlfV0sIENSRUFURUQgYnkgJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX1gKTtcblx0XHR0aGlzLl9wcm94eS4kYWRkS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIoaGFuZGxlLCBoYW5kbGUsIHZpZXdUeXBlKTtcblxuXHRcdGxldCBzdWJzY3JpcHRpb246IHZzY29kZS5EaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChldmVudEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZU5vdGVib29rS2VybmVsU291cmNlQWN0aW9ucyEoXyA9PiB0aGlzLl9wcm94eS4kZW1pdE5vdGVib29rS2VybmVsU291cmNlQWN0aW9uc0NoYW5nZUV2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0XHR0aGF0Ll9wcm94eS4kcmVtb3ZlS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIoaGFuZGxlLCBoYW5kbGUpO1xuXHRcdFx0XHRzdWJzY3JpcHRpb24/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVLZXJuZWxTb3VyY2VBY3Rpb25zKGhhbmRsZTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbltdPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHJldCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbnModG9rZW4pO1xuXHRcdFx0cmV0dXJuIChyZXQgPz8gW10pLm1hcChpdGVtID0+IGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbi5mcm9tKGl0ZW0sIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlciwgZGlzcG9zYWJsZXMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0JGFjY2VwdE5vdGVib29rQXNzb2NpYXRpb24oaGFuZGxlOiBudW1iZXIsIHVyaTogVXJpQ29tcG9uZW50cywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9rZXJuZWxEYXRhLmdldChoYW5kbGUpO1xuXHRcdGlmIChvYmopIHtcblx0XHRcdC8vIHVwZGF0ZSBkYXRhIHN0cnVjdHVyZVxuXHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0Tm90ZWJvb2tEb2N1bWVudChVUkkucmV2aXZlKHVyaSkpITtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRvYmouYXNzb2NpYXRlZE5vdGVib29rcy5zZXQobm90ZWJvb2sudXJpLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9iai5hc3NvY2lhdGVkTm90ZWJvb2tzLmRlbGV0ZShub3RlYm9vay51cmkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTm90ZWJvb2tDb250cm9sbGVyWyR7aGFuZGxlfV0gQVNTT0NJQVRFIG5vdGVib29rYCwgbm90ZWJvb2sudXJpLnRvU3RyaW5nKCksIHZhbHVlKTtcblx0XHRcdC8vIHNlbmQgZXZlbnRcblx0XHRcdG9iai5vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKHtcblx0XHRcdFx0c2VsZWN0ZWQ6IHZhbHVlLFxuXHRcdFx0XHRub3RlYm9vazogbm90ZWJvb2suYXBpTm90ZWJvb2tcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRleGVjdXRlQ2VsbHMoaGFuZGxlOiBudW1iZXIsIHVyaTogVXJpQ29tcG9uZW50cywgaGFuZGxlczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9rZXJuZWxEYXRhLmdldChoYW5kbGUpO1xuXHRcdGlmICghb2JqKSB7XG5cdFx0XHQvLyBleHRlbnNpb24gY2FuIGRpc3Bvc2Uga2VybmVscyBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0Tm90ZWJvb2tEb2N1bWVudChVUkkucmV2aXZlKHVyaSkpO1xuXHRcdGNvbnN0IGNlbGxzOiB2c2NvZGUuTm90ZWJvb2tDZWxsW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGxIYW5kbGUgb2YgaGFuZGxlcykge1xuXHRcdFx0Y29uc3QgY2VsbCA9IGRvY3VtZW50LmdldENlbGwoY2VsbEhhbmRsZSk7XG5cdFx0XHRpZiAoY2VsbCkge1xuXHRcdFx0XHRjZWxscy5wdXNoKGNlbGwuYXBpQ2VsbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dIEVYRUNVVEUgY2VsbHNgLCBkb2N1bWVudC51cmkudG9TdHJpbmcoKSwgY2VsbHMubGVuZ3RoKTtcblx0XHRcdGF3YWl0IG9iai5jb250cm9sbGVyLmV4ZWN1dGVIYW5kbGVyLmNhbGwob2JqLmNvbnRyb2xsZXIsIGNlbGxzLCBkb2N1bWVudC5hcGlOb3RlYm9vaywgb2JqLmNvbnRyb2xsZXIpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly9cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE5vdGVib29rQ29udHJvbGxlclske2hhbmRsZX1dIGV4ZWN1dGUgY2VsbHMgRkFJTEVEYCwgZXJyKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkY2FuY2VsQ2VsbHMoaGFuZGxlOiBudW1iZXIsIHVyaTogVXJpQ29tcG9uZW50cywgaGFuZGxlczogbnVtYmVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9rZXJuZWxEYXRhLmdldChoYW5kbGUpO1xuXHRcdGlmICghb2JqKSB7XG5cdFx0XHQvLyBleHRlbnNpb24gY2FuIGRpc3Bvc2Uga2VybmVscyBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjYW5jZWwgb3IgaW50ZXJydXB0IGRlcGVuZHMgb24gdGhlIGNvbnRyb2xsZXIuIFdoZW4gYW4gaW50ZXJydXB0IGhhbmRsZXIgaXMgdXNlZCB3ZVxuXHRcdC8vIGRvbid0IHRyaWdnZXIgdGhlIGNhbmNlbGF0aW9uIHRva2VuIG9mIGV4ZWN1dGlvbnMuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0Tm90ZWJvb2tEb2N1bWVudChVUkkucmV2aXZlKHVyaSkpO1xuXHRcdGlmIChvYmouY29udHJvbGxlci5pbnRlcnJ1cHRIYW5kbGVyKSB7XG5cdFx0XHRhd2FpdCBvYmouY29udHJvbGxlci5pbnRlcnJ1cHRIYW5kbGVyLmNhbGwob2JqLmNvbnRyb2xsZXIsIGRvY3VtZW50LmFwaU5vdGVib29rKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNlbGxIYW5kbGUgb2YgaGFuZGxlcykge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gZG9jdW1lbnQuZ2V0Q2VsbChjZWxsSGFuZGxlKTtcblx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVFeGVjdXRpb25zLmdldChjZWxsLnVyaSk/LmNhbmNlbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9iai5jb250cm9sbGVyLmludGVycnVwdEhhbmRsZXIpIHtcblx0XHRcdC8vIElmIHdlJ3JlIGludGVycnVwdGluZyBhbGwgY2VsbHMsIHdlIGFsc28gbmVlZCB0byBjYW5jZWwgdGhlIG5vdGVib29rIGxldmVsIGV4ZWN1dGlvbi5cblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zLmdldChkb2N1bWVudC51cmkpO1xuXHRcdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zLmRlbGV0ZShkb2N1bWVudC51cmkpO1xuXHRcdFx0aWYgKGhhbmRsZXMubGVuZ3RoICYmIEFycmF5LmlzQXJyYXkoaXRlbXMpICYmIGl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRpdGVtcy5mb3JFYWNoKGQgPT4gZC5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaWQgPSAwO1xuXHRwcml2YXRlIHZhcmlhYmxlU3RvcmU6IFJlY29yZDxzdHJpbmcsIHZzY29kZS5WYXJpYWJsZT4gPSB7fTtcblxuXHRhc3luYyAkcHJvdmlkZVZhcmlhYmxlcyhoYW5kbGU6IG51bWJlciwgcmVxdWVzdElkOiBzdHJpbmcsIG5vdGVib29rVXJpOiBVcmlDb21wb25lbnRzLCBwYXJlbnRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBraW5kOiAnbmFtZWQnIHwgJ2luZGV4ZWQnLCBzdGFydDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9rZXJuZWxEYXRhLmdldChoYW5kbGUpO1xuXHRcdGlmICghb2JqKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0Tm90ZWJvb2tEb2N1bWVudChVUkkucmV2aXZlKG5vdGVib29rVXJpKSk7XG5cdFx0Y29uc3QgdmFyaWFibGVQcm92aWRlciA9IG9iai5jb250cm9sbGVyLnZhcmlhYmxlUHJvdmlkZXI7XG5cdFx0aWYgKCF2YXJpYWJsZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHBhcmVudDogdnNjb2RlLlZhcmlhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChwYXJlbnRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwYXJlbnQgPSB0aGlzLnZhcmlhYmxlU3RvcmVbcGFyZW50SWRdO1xuXHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0Ly8gcmVxdWVzdCBmb3IgdW5rbm93biBwYXJlbnRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyByb290IHJlcXVlc3QsIGNsZWFyIHN0b3JlXG5cdFx0XHR0aGlzLnZhcmlhYmxlU3RvcmUgPSB7fTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHJlcXVlc3RLaW5kID0ga2luZCA9PT0gJ25hbWVkJyA/IE5vdGVib29rVmFyaWFibGVzUmVxdWVzdEtpbmQuTmFtZWQgOiBOb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kLkluZGV4ZWQ7XG5cdFx0Y29uc3QgdmFyaWFibGVSZXN1bHRzID0gdmFyaWFibGVQcm92aWRlci5wcm92aWRlVmFyaWFibGVzKGRvY3VtZW50LmFwaU5vdGVib29rLCBwYXJlbnQsIHJlcXVlc3RLaW5kLCBzdGFydCwgdG9rZW4pO1xuXG5cdFx0bGV0IHJlc3VsdENvdW50ID0gMDtcblx0XHRmb3IgYXdhaXQgKGNvbnN0IHJlc3VsdCBvZiB2YXJpYWJsZVJlc3VsdHMpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YXJpYWJsZSA9IHtcblx0XHRcdFx0aWQ6IHRoaXMuaWQrKyxcblx0XHRcdFx0bmFtZTogcmVzdWx0LnZhcmlhYmxlLm5hbWUsXG5cdFx0XHRcdHZhbHVlOiByZXN1bHQudmFyaWFibGUudmFsdWUsXG5cdFx0XHRcdHR5cGU6IHJlc3VsdC52YXJpYWJsZS50eXBlLFxuXHRcdFx0XHRpbnRlcmZhY2VzOiByZXN1bHQudmFyaWFibGUuaW50ZXJmYWNlcyxcblx0XHRcdFx0bGFuZ3VhZ2U6IHJlc3VsdC52YXJpYWJsZS5sYW5ndWFnZSxcblx0XHRcdFx0ZXhwcmVzc2lvbjogcmVzdWx0LnZhcmlhYmxlLmV4cHJlc3Npb24sXG5cdFx0XHRcdGhhc05hbWVkQ2hpbGRyZW46IHJlc3VsdC5oYXNOYW1lZENoaWxkcmVuLFxuXHRcdFx0XHRpbmRleGVkQ2hpbGRyZW5Db3VudDogcmVzdWx0LmluZGV4ZWRDaGlsZHJlbkNvdW50LFxuXHRcdFx0XHRleHRlbnNpb25JZDogb2JqLmV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMudmFyaWFibGVTdG9yZVt2YXJpYWJsZS5pZF0gPSByZXN1bHQudmFyaWFibGU7XG5cdFx0XHR0aGlzLl9wcm94eS4kcmVjZWl2ZVZhcmlhYmxlKHJlcXVlc3RJZCwgdmFyaWFibGUpO1xuXG5cdFx0XHRpZiAocmVzdWx0Q291bnQrKyA+PSB2YXJpYWJsZVBhZ2VTaXplKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQkYWNjZXB0S2VybmVsTWVzc2FnZUZyb21SZW5kZXJlcihoYW5kbGU6IG51bWJlciwgZWRpdG9ySWQ6IHN0cmluZywgbWVzc2FnZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX2tlcm5lbERhdGEuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFvYmopIHtcblx0XHRcdC8vIGV4dGVuc2lvbiBjYW4gZGlzcG9zZSBrZXJuZWxzIGluIHRoZSBtZWFudGltZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2V4dEhvc3ROb3RlYm9vay5nZXRFZGl0b3JCeUlkKGVkaXRvcklkKTtcblx0XHRvYmoub25EaWRSZWNlaXZlTWVzc2FnZS5maXJlKE9iamVjdC5mcmVlemUoeyBlZGl0b3I6IGVkaXRvci5hcGlFZGl0b3IsIG1lc3NhZ2UgfSkpO1xuXHR9XG5cblxuXHQvLyAtLS1cblxuXHRfY3JlYXRlTm90ZWJvb2tDZWxsRXhlY3V0aW9uKGNlbGw6IHZzY29kZS5Ob3RlYm9va0NlbGwsIGNvbnRyb2xsZXJJZDogc3RyaW5nKTogdnNjb2RlLk5vdGVib29rQ2VsbEV4ZWN1dGlvbiB7XG5cdFx0aWYgKGNlbGwuaW5kZXggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NBTk5PVCBleGVjdXRlIGNlbGwgdGhhdCBoYXMgYmVlbiBSRU1PVkVEIGZyb20gbm90ZWJvb2snKTtcblx0XHR9XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLl9leHRIb3N0Tm90ZWJvb2suZ2V0Tm90ZWJvb2tEb2N1bWVudChjZWxsLm5vdGVib29rLnVyaSk7XG5cdFx0Y29uc3QgY2VsbE9iaiA9IG5vdGVib29rLmdldENlbGxGcm9tQXBpQ2VsbChjZWxsKTtcblx0XHRpZiAoIWNlbGxPYmopIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBjZWxsJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY3RpdmVFeGVjdXRpb25zLmhhcyhjZWxsT2JqLnVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgZHVwbGljYXRlIGV4ZWN1dGlvbiBmb3IgJHtjZWxsT2JqLnVyaX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gbmV3IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2soY29udHJvbGxlcklkLCBjZWxsT2JqLCB0aGlzLl9wcm94eSk7XG5cdFx0dGhpcy5fYWN0aXZlRXhlY3V0aW9ucy5zZXQoY2VsbE9iai51cmksIGV4ZWN1dGlvbik7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBleGVjdXRpb24ub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAoZXhlY3V0aW9uLnN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdFx0ZXhlY3V0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVFeGVjdXRpb25zLmRlbGV0ZShjZWxsT2JqLnVyaSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGV4ZWN1dGlvbi5hc0FwaU9iamVjdCgpO1xuXHR9XG5cblx0Ly8gLS0tXG5cblx0X2NyZWF0ZU5vdGVib29rRXhlY3V0aW9uKG5iOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudCwgY29udHJvbGxlcklkOiBzdHJpbmcpOiB2c2NvZGUuTm90ZWJvb2tFeGVjdXRpb24ge1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fZXh0SG9zdE5vdGVib29rLmdldE5vdGVib29rRG9jdW1lbnQobmIudXJpKTtcblx0XHRjb25zdCBydW5uaW5nQ2VsbCA9IG5iLmdldENlbGxzKCkuZmluZChjZWxsID0+IHtcblx0XHRcdGNvbnN0IGFwaUNlbGwgPSBub3RlYm9vay5nZXRDZWxsRnJvbUFwaUNlbGwoY2VsbCk7XG5cdFx0XHRyZXR1cm4gYXBpQ2VsbCAmJiB0aGlzLl9hY3RpdmVFeGVjdXRpb25zLmhhcyhhcGlDZWxsLnVyaSk7XG5cdFx0fSk7XG5cdFx0aWYgKHJ1bm5pbmdDZWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBjZWxsIGV4ZWN1dGlvbiBmb3IgJHtydW5uaW5nQ2VsbC5kb2N1bWVudC51cml9YCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY3RpdmVOb3RlYm9va0V4ZWN1dGlvbnMuaGFzKG5vdGVib29rLnVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgZHVwbGljYXRlIG5vdGVib29rIGV4ZWN1dGlvbiBmb3IgJHtub3RlYm9vay51cml9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IG5ldyBOb3RlYm9va0V4ZWN1dGlvblRhc2soY29udHJvbGxlcklkLCBub3RlYm9vaywgdGhpcy5fcHJveHkpO1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gZXhlY3V0aW9uLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKGV4ZWN1dGlvbi5zdGF0ZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdFx0ZXhlY3V0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVOb3RlYm9va0V4ZWN1dGlvbnMuZGVsZXRlKG5vdGVib29rLnVyaSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fYWN0aXZlTm90ZWJvb2tFeGVjdXRpb25zLnNldChub3RlYm9vay51cmksIFtleGVjdXRpb24sIGxpc3RlbmVyXSk7XG5cdFx0cmV0dXJuIGV4ZWN1dGlvbi5hc0FwaU9iamVjdCgpO1xuXHR9XG59XG5cblxuZW51bSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUge1xuXHRJbml0LFxuXHRTdGFydGVkLFxuXHRSZXNvbHZlZFxufVxuXG5jbGFzcyBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIEhBTkRMRSA9IDA7XG5cdHByaXZhdGUgX2hhbmRsZSA9IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2suSEFORExFKys7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9zdGF0ZSA9IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZS5Jbml0O1xuXHRnZXQgc3RhdGUoKTogTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlIHsgcmV0dXJuIHRoaXMuX3N0YXRlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5Tb3VyY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGVjdG9yOiBUaW1lb3V0QmFzZWRDb2xsZWN0b3I8SUNlbGxFeGVjdXRlVXBkYXRlRHRvPjtcblxuXHRwcml2YXRlIF9leGVjdXRpb25PcmRlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRyb2xsZXJJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NlbGw6IEV4dEhvc3RDZWxsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzU2hhcGVcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbGxlY3RvciA9IG5ldyBUaW1lb3V0QmFzZWRDb2xsZWN0b3IoMTAsIHVwZGF0ZXMgPT4gdGhpcy51cGRhdGUodXBkYXRlcykpO1xuXG5cdFx0dGhpcy5fZXhlY3V0aW9uT3JkZXIgPSBfY2VsbC5pbnRlcm5hbE1ldGFkYXRhLmV4ZWN1dGlvbk9yZGVyO1xuXHRcdHRoaXMuX3Byb3h5LiRjcmVhdGVFeGVjdXRpb24odGhpcy5faGFuZGxlLCBjb250cm9sbGVySWQsIHRoaXMuX2NlbGwubm90ZWJvb2sudXJpLCB0aGlzLl9jZWxsLmhhbmRsZSk7XG5cdH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVNvb24odXBkYXRlOiBJQ2VsbEV4ZWN1dGVVcGRhdGVEdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9jb2xsZWN0b3IuYWRkSXRlbSh1cGRhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGUodXBkYXRlOiBJQ2VsbEV4ZWN1dGVVcGRhdGVEdG8gfCBJQ2VsbEV4ZWN1dGVVcGRhdGVEdG9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVwZGF0ZXMgPSBBcnJheS5pc0FycmF5KHVwZGF0ZSkgPyB1cGRhdGUgOiBbdXBkYXRlXTtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHVwZGF0ZUV4ZWN1dGlvbih0aGlzLl9oYW5kbGUsIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh1cGRhdGVzKSk7XG5cdH1cblxuXHRwcml2YXRlIHZlcmlmeVN0YXRlRm9yT3V0cHV0KCkge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLkluaXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTXVzdCBjYWxsIHN0YXJ0IGJlZm9yZSBtb2RpZnlpbmcgY2VsbCBvdXRwdXQnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZS5SZXNvbHZlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgbW9kaWZ5IGNlbGwgb3V0cHV0IGFmdGVyIGNhbGxpbmcgcmVzb2x2ZScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2VsbEluZGV4VG9IYW5kbGUoY2VsbE9yQ2VsbEluZGV4OiB2c2NvZGUuTm90ZWJvb2tDZWxsIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHRsZXQgY2VsbDogRXh0SG9zdENlbGwgfCB1bmRlZmluZWQgPSB0aGlzLl9jZWxsO1xuXHRcdGlmIChjZWxsT3JDZWxsSW5kZXgpIHtcblx0XHRcdGNlbGwgPSB0aGlzLl9jZWxsLm5vdGVib29rLmdldENlbGxGcm9tQXBpQ2VsbChjZWxsT3JDZWxsSW5kZXgpO1xuXHRcdH1cblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSU5WQUxJRCBjZWxsJyk7XG5cdFx0fVxuXHRcdHJldHVybiBjZWxsLmhhbmRsZTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVBbmRDb252ZXJ0T3V0cHV0cyhpdGVtczogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dFtdKTogTm90ZWJvb2tPdXRwdXREdG9bXSB7XG5cdFx0cmV0dXJuIGl0ZW1zLm1hcChvdXRwdXQgPT4ge1xuXHRcdFx0Y29uc3QgbmV3T3V0cHV0ID0gTm90ZWJvb2tDZWxsT3V0cHV0LmVuc3VyZVVuaXF1ZU1pbWVUeXBlcyhvdXRwdXQuaXRlbXMsIHRydWUpO1xuXHRcdFx0aWYgKG5ld091dHB1dCA9PT0gb3V0cHV0Lml0ZW1zKSB7XG5cdFx0XHRcdHJldHVybiBleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0LmZyb20ob3V0cHV0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleHRIb3N0VHlwZUNvbnZlcnRlcnMuTm90ZWJvb2tDZWxsT3V0cHV0LmZyb20oe1xuXHRcdFx0XHRpdGVtczogbmV3T3V0cHV0LFxuXHRcdFx0XHRpZDogb3V0cHV0LmlkLFxuXHRcdFx0XHRtZXRhZGF0YTogb3V0cHV0Lm1ldGFkYXRhXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlT3V0cHV0cyhvdXRwdXRzOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0IHwgdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dFtdLCBjZWxsOiB2c2NvZGUuTm90ZWJvb2tDZWxsIHwgdW5kZWZpbmVkLCBhcHBlbmQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLmNlbGxJbmRleFRvSGFuZGxlKGNlbGwpO1xuXHRcdGNvbnN0IG91dHB1dER0b3MgPSB0aGlzLnZhbGlkYXRlQW5kQ29udmVydE91dHB1dHMoYXNBcnJheShvdXRwdXRzKSk7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlU29vbihcblx0XHRcdHtcblx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlLk91dHB1dCxcblx0XHRcdFx0Y2VsbEhhbmRsZTogaGFuZGxlLFxuXHRcdFx0XHRhcHBlbmQsXG5cdFx0XHRcdG91dHB1dHM6IG91dHB1dER0b3Ncblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVPdXRwdXRJdGVtcyhpdGVtczogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0gfCB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0SXRlbVtdLCBvdXRwdXQ6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXQsIGFwcGVuZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGl0ZW1zID0gTm90ZWJvb2tDZWxsT3V0cHV0LmVuc3VyZVVuaXF1ZU1pbWVUeXBlcyhhc0FycmF5KGl0ZW1zKSwgdHJ1ZSk7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlU29vbih7XG5cdFx0XHRlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRpdGVtczogaXRlbXMubWFwKGV4dEhvc3RUeXBlQ29udmVydGVycy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtLmZyb20pLFxuXHRcdFx0b3V0cHV0SWQ6IG91dHB1dC5pZCxcblx0XHRcdGFwcGVuZFxuXHRcdH0pO1xuXHR9XG5cblx0YXNBcGlPYmplY3QoKTogdnNjb2RlLk5vdGVib29rQ2VsbEV4ZWN1dGlvbiB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuTm90ZWJvb2tDZWxsRXhlY3V0aW9uID0ge1xuXHRcdFx0Z2V0IHRva2VuKCkgeyByZXR1cm4gdGhhdC5fdG9rZW5Tb3VyY2UudG9rZW47IH0sXG5cdFx0XHRnZXQgY2VsbCgpIHsgcmV0dXJuIHRoYXQuX2NlbGwuYXBpQ2VsbDsgfSxcblx0XHRcdGdldCBleGVjdXRpb25PcmRlcigpIHsgcmV0dXJuIHRoYXQuX2V4ZWN1dGlvbk9yZGVyOyB9LFxuXHRcdFx0c2V0IGV4ZWN1dGlvbk9yZGVyKHY6IG51bWJlciB8IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGF0Ll9leGVjdXRpb25PcmRlciA9IHY7XG5cdFx0XHRcdHRoYXQudXBkYXRlKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlLkV4ZWN1dGlvblN0YXRlLFxuXHRcdFx0XHRcdGV4ZWN1dGlvbk9yZGVyOiB0aGF0Ll9leGVjdXRpb25PcmRlclxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRzdGFydChzdGFydFRpbWU/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHRoYXQuX3N0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQgfHwgdGhhdC5fc3RhdGUgPT09IE5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZS5TdGFydGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FsbCBzdGFydCBhZ2FpbicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhhdC5fc3RhdGUgPSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuU3RhcnRlZDtcblx0XHRcdFx0dGhhdC5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKCk7XG5cblx0XHRcdFx0dGhhdC51cGRhdGUoe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRXhlY3V0aW9uVXBkYXRlVHlwZS5FeGVjdXRpb25TdGF0ZSxcblx0XHRcdFx0XHRydW5TdGFydFRpbWU6IHN0YXJ0VGltZVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cblx0XHRcdGVuZChzdWNjZXNzOiBib29sZWFuIHwgdW5kZWZpbmVkLCBlbmRUaW1lPzogbnVtYmVyLCBleGVjdXRpb25FcnJvcj86IHZzY29kZS5DZWxsRXhlY3V0aW9uRXJyb3IpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHRoYXQuX3N0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjYWxsIHJlc29sdmUgdHdpY2UnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoYXQuX3N0YXRlID0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkO1xuXHRcdFx0XHR0aGF0Ll9vbkRpZENoYW5nZVN0YXRlLmZpcmUoKTtcblxuXHRcdFx0XHQvLyBUaGUgbGFzdCB1cGRhdGUgbmVlZHMgdG8gYmUgb3JkZXJlZCBjb3JyZWN0bHkgYW5kIGFwcGxpZWQgaW1tZWRpYXRlbHksXG5cdFx0XHRcdC8vIHNvIHdlIHVzZSB1cGRhdGVTb29uIGFuZCBpbW1lZGlhdGVseSBmbHVzaC5cblx0XHRcdFx0dGhhdC5fY29sbGVjdG9yLmZsdXNoKCk7XG5cblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBjcmVhdGVTZXJpYWxpemVhYmxlRXJyb3IoZXhlY3V0aW9uRXJyb3IpO1xuXG5cdFx0XHRcdHRoYXQuX3Byb3h5LiRjb21wbGV0ZUV4ZWN1dGlvbih0aGF0Ll9oYW5kbGUsIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHRcdFx0cnVuRW5kVGltZTogZW5kVGltZSxcblx0XHRcdFx0XHRsYXN0UnVuU3VjY2Vzczogc3VjY2Vzcyxcblx0XHRcdFx0XHRlcnJvclxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRjbGVhck91dHB1dChjZWxsPzogdnNjb2RlLk5vdGVib29rQ2VsbCk6IFRoZW5hYmxlPHZvaWQ+IHtcblx0XHRcdFx0dGhhdC52ZXJpZnlTdGF0ZUZvck91dHB1dCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51cGRhdGVPdXRwdXRzKFtdLCBjZWxsLCBmYWxzZSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRhcHBlbmRPdXRwdXQob3V0cHV0czogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCB8IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRbXSwgY2VsbD86IHZzY29kZS5Ob3RlYm9va0NlbGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dGhhdC52ZXJpZnlTdGF0ZUZvck91dHB1dCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51cGRhdGVPdXRwdXRzKG91dHB1dHMsIGNlbGwsIHRydWUpO1xuXHRcdFx0fSxcblxuXHRcdFx0cmVwbGFjZU91dHB1dChvdXRwdXRzOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0IHwgdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dFtdLCBjZWxsPzogdnNjb2RlLk5vdGVib29rQ2VsbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0aGF0LnZlcmlmeVN0YXRlRm9yT3V0cHV0KCk7XG5cdFx0XHRcdHJldHVybiB0aGF0LnVwZGF0ZU91dHB1dHMob3V0cHV0cywgY2VsbCwgZmFsc2UpO1xuXHRcdFx0fSxcblxuXHRcdFx0YXBwZW5kT3V0cHV0SXRlbXMoaXRlbXM6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtIHwgdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dEl0ZW1bXSwgb3V0cHV0OiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoYXQudmVyaWZ5U3RhdGVGb3JPdXRwdXQoKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXBkYXRlT3V0cHV0SXRlbXMoaXRlbXMsIG91dHB1dCwgdHJ1ZSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRyZXBsYWNlT3V0cHV0SXRlbXMoaXRlbXM6IHZzY29kZS5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtIHwgdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dEl0ZW1bXSwgb3V0cHV0OiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoYXQudmVyaWZ5U3RhdGVGb3JPdXRwdXQoKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXBkYXRlT3V0cHV0SXRlbXMoaXRlbXMsIG91dHB1dCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUocmVzdWx0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXJpYWxpemVhYmxlRXJyb3IoZXhlY3V0aW9uRXJyb3I6IHZzY29kZS5DZWxsRXhlY3V0aW9uRXJyb3IgfCB1bmRlZmluZWQpIHtcblx0Y29uc3QgY29udmVydFJhbmdlID0gKHJhbmdlOiB2c2NvZGUuUmFuZ2UgfCB1bmRlZmluZWQpID0+IChyYW5nZSA/IHtcblx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0LmxpbmUsXG5cdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0LmNoYXJhY3Rlcixcblx0XHRlbmRMaW5lTnVtYmVyOiByYW5nZS5lbmQubGluZSxcblx0XHRlbmRDb2x1bW46IHJhbmdlLmVuZC5jaGFyYWN0ZXJcblx0fSA6IHVuZGVmaW5lZCk7XG5cblx0Y29uc3QgY29udmVydFN0YWNrRnJhbWUgPSAoZnJhbWU6IHZzY29kZS5DZWxsRXJyb3JTdGFja0ZyYW1lKSA9PiAoe1xuXHRcdHVyaTogZnJhbWUudXJpLFxuXHRcdHBvc2l0aW9uOiBmcmFtZS5wb3NpdGlvbixcblx0XHRsYWJlbDogZnJhbWUubGFiZWxcblx0fSk7XG5cblx0Y29uc3QgZXJyb3IgPSBleGVjdXRpb25FcnJvciA/IHtcblx0XHRuYW1lOiBleGVjdXRpb25FcnJvci5uYW1lLFxuXHRcdG1lc3NhZ2U6IGV4ZWN1dGlvbkVycm9yLm1lc3NhZ2UsXG5cdFx0c3RhY2s6IGV4ZWN1dGlvbkVycm9yLnN0YWNrIGluc3RhbmNlb2YgQXJyYXlcblx0XHRcdD8gZXhlY3V0aW9uRXJyb3Iuc3RhY2subWFwKGZyYW1lID0+IGNvbnZlcnRTdGFja0ZyYW1lKGZyYW1lKSlcblx0XHRcdDogZXhlY3V0aW9uRXJyb3Iuc3RhY2ssXG5cdFx0bG9jYXRpb246IGNvbnZlcnRSYW5nZShleGVjdXRpb25FcnJvci5sb2NhdGlvbiksXG5cdFx0dXJpOiBleGVjdXRpb25FcnJvci51cmlcblx0fSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIGVycm9yO1xufVxuXG5lbnVtIE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlIHtcblx0SW5pdCxcblx0U3RhcnRlZCxcblx0UmVzb2x2ZWRcbn1cblxuXG5jbGFzcyBOb3RlYm9va0V4ZWN1dGlvblRhc2sgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgSEFORExFID0gMDtcblx0cHJpdmF0ZSBfaGFuZGxlID0gTm90ZWJvb2tFeGVjdXRpb25UYXNrLkhBTkRMRSsrO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RhdGUgPSBOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZS5Jbml0O1xuXHRnZXQgc3RhdGUoKTogTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUgeyByZXR1cm4gdGhpcy5fc3RhdGU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlblNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250cm9sbGVySWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9vazogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWROb3RlYm9va0tlcm5lbHNTaGFwZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJveHkuJGNyZWF0ZU5vdGVib29rRXhlY3V0aW9uKHRoaXMuX2hhbmRsZSwgY29udHJvbGxlcklkLCB0aGlzLl9ub3RlYm9vay51cmkpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9XG5cdGFzQXBpT2JqZWN0KCk6IHZzY29kZS5Ob3RlYm9va0V4ZWN1dGlvbiB7XG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuTm90ZWJvb2tFeGVjdXRpb24gPSB7XG5cdFx0XHRzdGFydDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IE5vdGVib29rRXhlY3V0aW9uVGFza1N0YXRlLlJlc29sdmVkIHx8IHRoaXMuX3N0YXRlID09PSBOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZS5TdGFydGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY2FsbCBzdGFydCBhZ2FpbicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fc3RhdGUgPSBOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZS5TdGFydGVkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoKTtcblxuXHRcdFx0XHR0aGlzLl9wcm94eS4kYmVnaW5Ob3RlYm9va0V4ZWN1dGlvbih0aGlzLl9oYW5kbGUpO1xuXHRcdFx0fSxcblxuXHRcdFx0ZW5kOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBjYWxsIHJlc29sdmUgdHdpY2UnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gTm90ZWJvb2tFeGVjdXRpb25UYXNrU3RhdGUuUmVzb2x2ZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZSgpO1xuXG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRjb21wbGV0ZU5vdGVib29rRXhlY3V0aW9uKHRoaXMuX2hhbmRsZSk7XG5cdFx0XHR9LFxuXG5cdFx0fTtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZShyZXN1bHQpO1xuXHR9XG59XG5cbmNsYXNzIFRpbWVvdXRCYXNlZENvbGxlY3RvcjxUPiB7XG5cdHByaXZhdGUgYmF0Y2g6IFRbXSA9IFtdO1xuXHRwcml2YXRlIHN0YXJ0ZWRUaW1lciA9IERhdGUubm93KCk7XG5cdHByaXZhdGUgY3VycmVudERlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxheTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2s6IChpdGVtczogVFtdKSA9PiBQcm9taXNlPHZvaWQ+KSB7IH1cblxuXHRhZGRJdGVtKGl0ZW06IFQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmJhdGNoLnB1c2goaXRlbSk7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnREZWZlcnJlZCkge1xuXHRcdFx0dGhpcy5jdXJyZW50RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLnN0YXJ0ZWRUaW1lciA9IERhdGUubm93KCk7XG5cdFx0XHR0aW1lb3V0KHRoaXMuZGVsYXkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5mbHVzaCgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcyBjYW4gYmUgY2FsbGVkIGJ5IHRoZSBleHRlbnNpb24gcmVwZWF0ZWRseSBmb3IgYSBsb25nIHRpbWUgYmVmb3JlIHRoZSB0aW1lb3V0IGlzIGFibGUgdG8gcnVuLlxuXHRcdC8vIEZvcmNlIGEgZmx1c2ggYWZ0ZXIgdGhlIGRlbGF5LlxuXHRcdGlmIChEYXRlLm5vdygpIC0gdGhpcy5zdGFydGVkVGltZXIgPiB0aGlzLmRlbGF5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5mbHVzaCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmN1cnJlbnREZWZlcnJlZC5wO1xuXHR9XG5cblx0Zmx1c2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuYmF0Y2gubGVuZ3RoID09PSAwIHx8ICF0aGlzLmN1cnJlbnREZWZlcnJlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmVycmVkID0gdGhpcy5jdXJyZW50RGVmZXJyZWQ7XG5cdFx0dGhpcy5jdXJyZW50RGVmZXJyZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYmF0Y2ggPSB0aGlzLmJhdGNoO1xuXHRcdHRoaXMuYmF0Y2ggPSBbXTtcblx0XHRyZXR1cm4gdGhpcy5jYWxsYmFjayhiYXRjaClcblx0XHRcdC5maW5hbGx5KCgpID0+IGRlZmVycmVkLmNvbXBsZXRlKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVLZXJuZWxJZChleHRlbnNpb25JZGVudGlmaWVyOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke2V4dGVuc2lvbklkZW50aWZpZXIudmFsdWV9LyR7aWR9YDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUywyQkFBa0Q7QUFDM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBZ0csbUJBQXVGO0FBQ3ZMLFNBQVMsWUFBWSxvQkFBb0Isd0JBQXlDO0FBSWxGLFlBQVksMkJBQTJCO0FBQ3ZDLFNBQVMsb0JBQW9CLDZCQUE2QixvQ0FBb0M7QUFDOUYsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyx3QkFBd0I7QUFlMUIsSUFBTSx5QkFBTixNQUFvRTtBQUFBLEVBZTFFLFlBQ0MsYUFDaUIsV0FDQSxrQkFDVCxXQUNzQixhQUM3QjtBQUpnQjtBQUNBO0FBQ1Q7QUFDc0I7QUFqQi9CLFNBQWlCLG9CQUFvQixJQUFJLFlBQXVDO0FBQ2hGLFNBQWlCLDRCQUE0QixJQUFJLFlBQWtEO0FBRW5HLFNBQVEsdUJBQXVCLG9CQUFJLElBQW9EO0FBQ3ZGLFNBQVEsaUNBQXlDO0FBRWpELFNBQVEsK0JBQStCLG9CQUFJLElBQXVEO0FBQ2xHLFNBQVEsd0NBQWdEO0FBRXhELFNBQWlCLGNBQWMsb0JBQUksSUFBeUI7QUFDNUQsU0FBUSxjQUFzQjtBQXNZOUIsU0FBUSxLQUFLO0FBQ2IsU0FBUSxnQkFBaUQsQ0FBQztBQTlYekQsU0FBSyxTQUFTLFlBQVksU0FBUyxZQUFZLHlCQUF5QjtBQUd4RSxVQUFNLHlCQUF5QixJQUFJO0FBQUEsTUFDbEM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLElBQUks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O0FBQzdCLGNBQVEsS0FBSyxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQzlCLGVBQU8sS0FBSyxNQUFNO0FBQUEsTUFDbkIsQ0FBQztBQUFBLElBQ0Y7QUFJQSxRQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssZUFBZSxLQUFLLE9BQU87QUFDaEQsYUFBTyxLQUFLLE1BQU07QUFBQSxJQUNuQjtBQUVBLFdBQU8sS0FBSyxnQkFBZ0I7QUFBQSxFQUM3QjtBQUFBLEVBRUEsUUFBdUI7QUFDdEIsUUFBSSxLQUFLLE1BQU0sV0FBVyxLQUFLLENBQUMsS0FBSyxpQkFBaUI7QUFDckQsYUFBTyxRQUFRLFFBQVE7QUFBQSxJQUN4QjtBQUVBLFVBQU0sV0FBVyxLQUFLO0FBQ3RCLFNBQUssa0JBQWtCO0FBQ3ZCLFVBQU0sUUFBUSxLQUFLO0FBQ25CLFNBQUssUUFBUSxDQUFDO0FBQ2QsV0FBTyxLQUFLLFNBQVMsS0FBSyxFQUN4QixRQUFRLE1BQU0sU0FBUyxTQUFTLENBQUM7QUFBQSxFQUNwQztBQUNEO0FBRU8sU0FBUyxlQUFlLHFCQUEwQyxJQUFvQjtBQUM1RixTQUFPLEdBQUcsb0JBQW9CLEtBQUssSUFBSSxFQUFFO0FBQzFDOyIsCiAgIm5hbWVzIjogWyJkYXRhIiwgIk5vdGVib29rQ2VsbEV4ZWN1dGlvblRhc2tTdGF0ZSIsICJOb3RlYm9va0V4ZWN1dGlvblRhc2tTdGF0ZSJdCn0K
