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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { NotebookDto } from "./mainThreadNotebookDto.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { INotebookEditorService } from "../../contrib/notebook/browser/services/notebookEditorService.js";
import { INotebookExecutionStateService } from "../../contrib/notebook/common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../contrib/notebook/common/notebookKernelService.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { INotebookService } from "../../contrib/notebook/common/notebookService.js";
import { AsyncIterableProducer } from "../../../base/common/async.js";
class MainThreadKernel {
  constructor(data, _languageService) {
    this._languageService = _languageService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.id = data.id;
    this.viewType = data.notebookType;
    this.extension = data.extensionId;
    this.implementsInterrupt = data.supportsInterrupt ?? false;
    this.label = data.label;
    this.description = data.description;
    this.detail = data.detail;
    this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : _languageService.getRegisteredLanguageIds();
    this.implementsExecutionOrder = data.supportsExecutionOrder ?? false;
    this.hasVariableProvider = data.hasVariableProvider ?? false;
    this.localResourceRoot = URI.revive(data.extensionLocation);
    this.preloads = data.preloads?.map((u) => ({ uri: URI.revive(u.uri), provides: u.provides })) ?? [];
  }
  get preloadUris() {
    return this.preloads.map((p) => p.uri);
  }
  get preloadProvides() {
    return this.preloads.flatMap((p) => p.provides);
  }
  update(data) {
    const event = /* @__PURE__ */ Object.create(null);
    if (data.label !== void 0) {
      this.label = data.label;
      event.label = true;
    }
    if (data.description !== void 0) {
      this.description = data.description;
      event.description = true;
    }
    if (data.detail !== void 0) {
      this.detail = data.detail;
      event.detail = true;
    }
    if (data.supportedLanguages !== void 0) {
      this.supportedLanguages = isNonEmptyArray(data.supportedLanguages) ? data.supportedLanguages : this._languageService.getRegisteredLanguageIds();
      event.supportedLanguages = true;
    }
    if (data.supportsExecutionOrder !== void 0) {
      this.implementsExecutionOrder = data.supportsExecutionOrder;
      event.hasExecutionOrder = true;
    }
    if (data.supportsInterrupt !== void 0) {
      this.implementsInterrupt = data.supportsInterrupt;
      event.hasInterruptHandler = true;
    }
    if (data.hasVariableProvider !== void 0) {
      this.hasVariableProvider = data.hasVariableProvider;
      event.hasVariableProvider = true;
    }
    this._onDidChange.fire(event);
  }
}
class MainThreadKernelDetectionTask {
  constructor(notebookType) {
    this.notebookType = notebookType;
  }
}
let MainThreadNotebookKernels = class {
  constructor(extHostContext, _languageService, _notebookKernelService, _notebookExecutionStateService, _notebookService, notebookEditorService) {
    this._languageService = _languageService;
    this._notebookKernelService = _notebookKernelService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this._notebookService = _notebookService;
    this._editors = new DisposableMap();
    this._disposables = new DisposableStore();
    this._kernels = /* @__PURE__ */ new Map();
    this._kernelDetectionTasks = /* @__PURE__ */ new Map();
    this._kernelSourceActionProviders = /* @__PURE__ */ new Map();
    this._kernelSourceActionProvidersEventRegistrations = /* @__PURE__ */ new Map();
    this._executions = /* @__PURE__ */ new Map();
    this._notebookExecutions = /* @__PURE__ */ new Map();
    this.variableRequestIndex = 0;
    this.variableRequestMap = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookKernels);
    notebookEditorService.listNotebookEditors().forEach(this._onEditorAdd, this);
    notebookEditorService.onDidAddNotebookEditor(this._onEditorAdd, this, this._disposables);
    notebookEditorService.onDidRemoveNotebookEditor(this._onEditorRemove, this, this._disposables);
    this._disposables.add(toDisposable(() => {
      this._executions.forEach((e) => {
        e.complete({});
      });
      this._notebookExecutions.forEach((e) => e.complete());
    }));
    this._disposables.add(this._notebookKernelService.onDidChangeSelectedNotebooks((e) => {
      for (const [handle, [kernel]] of this._kernels) {
        if (e.oldKernel === kernel.id) {
          this._proxy.$acceptNotebookAssociation(handle, e.notebook, false);
        } else if (e.newKernel === kernel.id) {
          this._proxy.$acceptNotebookAssociation(handle, e.notebook, true);
        }
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    for (const [, registration] of this._kernels.values()) {
      registration.dispose();
    }
    for (const [, registration] of this._kernelDetectionTasks.values()) {
      registration.dispose();
    }
    for (const [, registration] of this._kernelSourceActionProviders.values()) {
      registration.dispose();
    }
    this._editors.dispose();
  }
  // --- kernel ipc
  _onEditorAdd(editor) {
    const ipcListener = editor.onDidReceiveMessage((e) => {
      if (!editor.hasModel()) {
        return;
      }
      const { selected } = this._notebookKernelService.getMatchingKernel(editor.textModel);
      if (!selected) {
        return;
      }
      for (const [handle, candidate] of this._kernels) {
        if (candidate[0] === selected) {
          this._proxy.$acceptKernelMessageFromRenderer(handle, editor.getId(), e.message);
          break;
        }
      }
    });
    this._editors.set(editor, ipcListener);
  }
  _onEditorRemove(editor) {
    this._editors.deleteAndDispose(editor);
  }
  async $postMessage(handle, editorId, message) {
    const tuple = this._kernels.get(handle);
    if (!tuple) {
      throw new Error("kernel already disposed");
    }
    const [kernel] = tuple;
    let didSend = false;
    for (const [editor] of this._editors) {
      if (!editor.hasModel()) {
        continue;
      }
      if (this._notebookKernelService.getMatchingKernel(editor.textModel).selected !== kernel) {
        continue;
      }
      if (editorId === void 0) {
        editor.postMessage(message);
        didSend = true;
      } else if (editor.getId() === editorId) {
        editor.postMessage(message);
        didSend = true;
        break;
      }
    }
    return didSend;
  }
  $receiveVariable(requestId, variable) {
    const emitter = this.variableRequestMap.get(requestId);
    if (emitter) {
      emitter.emitOne(variable);
    }
  }
  // --- kernel adding/updating/removal
  async $addKernel(handle, data) {
    const that = this;
    const kernel = new class extends MainThreadKernel {
      async executeNotebookCellsRequest(uri, handles) {
        await that._proxy.$executeCells(handle, uri, handles);
      }
      async cancelNotebookCellExecution(uri, handles) {
        await that._proxy.$cancelCells(handle, uri, handles);
      }
      provideVariables(notebookUri, parentId, kind, start, token) {
        const requestId = `${handle}variables${that.variableRequestIndex++}`;
        return new AsyncIterableProducer(async (emitter) => {
          that.variableRequestMap.set(requestId, emitter);
          try {
            await that._proxy.$provideVariables(handle, requestId, notebookUri, parentId, kind, start, token);
          } finally {
            that.variableRequestMap.delete(requestId);
          }
        });
      }
    }(data, this._languageService);
    const disposables = this._disposables.add(new DisposableStore());
    this._kernels.set(handle, [kernel, disposables]);
    disposables.add(this._notebookKernelService.registerKernel(kernel));
  }
  $updateKernel(handle, data) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      tuple[0].update(data);
    }
  }
  $removeKernel(handle) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernels.delete(handle);
    }
  }
  $updateNotebookPriority(handle, notebook, value) {
    const tuple = this._kernels.get(handle);
    if (tuple) {
      this._notebookKernelService.updateKernelNotebookAffinity(tuple[0], URI.revive(notebook), value);
    }
  }
  // --- Cell execution
  $createExecution(handle, controllerId, rawUri, cellHandle) {
    const uri = URI.revive(rawUri);
    const notebook = this._notebookService.getNotebookTextModel(uri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${uri.toString()}`);
    }
    const kernel = this._notebookKernelService.getMatchingKernel(notebook);
    if (!kernel.selected || kernel.selected.id !== controllerId) {
      throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
    }
    const execution = this._notebookExecutionStateService.createCellExecution(uri, cellHandle);
    execution.confirm();
    this._executions.set(handle, execution);
  }
  $updateExecution(handle, data) {
    const updates = data.value;
    try {
      const execution = this._executions.get(handle);
      execution?.update(updates.map(NotebookDto.fromCellExecuteUpdateDto));
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  $completeExecution(handle, data) {
    try {
      const execution = this._executions.get(handle);
      execution?.complete(NotebookDto.fromCellExecuteCompleteDto(data.value));
    } catch (e) {
      onUnexpectedError(e);
    } finally {
      this._executions.delete(handle);
    }
  }
  // --- Notebook execution
  $createNotebookExecution(handle, controllerId, rawUri) {
    const uri = URI.revive(rawUri);
    const notebook = this._notebookService.getNotebookTextModel(uri);
    if (!notebook) {
      throw new Error(`Notebook not found: ${uri.toString()}`);
    }
    const kernel = this._notebookKernelService.getMatchingKernel(notebook);
    if (!kernel.selected || kernel.selected.id !== controllerId) {
      throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
    }
    const execution = this._notebookExecutionStateService.createExecution(uri);
    execution.confirm();
    this._notebookExecutions.set(handle, execution);
  }
  $beginNotebookExecution(handle) {
    try {
      const execution = this._notebookExecutions.get(handle);
      execution?.begin();
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  $completeNotebookExecution(handle) {
    try {
      const execution = this._notebookExecutions.get(handle);
      execution?.complete();
    } catch (e) {
      onUnexpectedError(e);
    } finally {
      this._notebookExecutions.delete(handle);
    }
  }
  // --- notebook kernel detection task
  async $addKernelDetectionTask(handle, notebookType) {
    const kernelDetectionTask = new MainThreadKernelDetectionTask(notebookType);
    const registration = this._notebookKernelService.registerNotebookKernelDetectionTask(kernelDetectionTask);
    this._kernelDetectionTasks.set(handle, [kernelDetectionTask, registration]);
  }
  $removeKernelDetectionTask(handle) {
    const tuple = this._kernelDetectionTasks.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernelDetectionTasks.delete(handle);
    }
  }
  // --- notebook kernel source action provider
  async $addKernelSourceActionProvider(handle, eventHandle, notebookType) {
    const kernelSourceActionProvider = {
      viewType: notebookType,
      provideKernelSourceActions: async () => {
        const actions = await this._proxy.$provideKernelSourceActions(handle, CancellationToken.None);
        return actions.map((action) => {
          let documentation = action.documentation;
          if (action.documentation && typeof action.documentation !== "string") {
            documentation = URI.revive(action.documentation);
          }
          return {
            label: action.label,
            command: action.command,
            description: action.description,
            detail: action.detail,
            documentation
          };
        });
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._kernelSourceActionProvidersEventRegistrations.set(eventHandle, emitter);
      kernelSourceActionProvider.onDidChangeSourceActions = emitter.event;
    }
    const registration = this._notebookKernelService.registerKernelSourceActionProvider(notebookType, kernelSourceActionProvider);
    this._kernelSourceActionProviders.set(handle, [kernelSourceActionProvider, registration]);
  }
  $removeKernelSourceActionProvider(handle, eventHandle) {
    const tuple = this._kernelSourceActionProviders.get(handle);
    if (tuple) {
      tuple[1].dispose();
      this._kernelSourceActionProviders.delete(handle);
    }
    if (typeof eventHandle === "number") {
      this._kernelSourceActionProvidersEventRegistrations.delete(eventHandle);
    }
  }
  $emitNotebookKernelSourceActionsChangeEvent(eventHandle) {
    const emitter = this._kernelSourceActionProvidersEventRegistrations.get(eventHandle);
    if (emitter instanceof Emitter) {
      emitter.fire(void 0);
    }
  }
  $variablesUpdated(notebookUri) {
    this._notebookKernelService.notifyVariablesChange(URI.revive(notebookUri));
  }
};
MainThreadNotebookKernels = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadNotebookKernels),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, INotebookKernelService),
  __decorateParam(3, INotebookExecutionStateService),
  __decorateParam(4, INotebookService),
  __decorateParam(5, INotebookEditorService)
], MainThreadNotebookKernels);
export {
  MainThreadNotebookKernels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEdG8gfSBmcm9tICcuL21haW5UaHJlYWROb3RlYm9va0R0by5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxFeGVjdXRpb24sIElOb3RlYm9va0V4ZWN1dGlvbiwgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyLCBJTm90ZWJvb2tLZXJuZWwsIElOb3RlYm9va0tlcm5lbENoYW5nZUV2ZW50LCBJTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb25UYXNrLCBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLCBWYXJpYWJsZXNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3ROb3RlYm9va0tlcm5lbHNTaGFwZSwgSUNlbGxFeGVjdXRlVXBkYXRlRHRvLCBJQ2VsbEV4ZWN1dGlvbkNvbXBsZXRlRHRvLCBJTm90ZWJvb2tLZXJuZWxEdG8yLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE5vdGVib29rS2VybmVsc1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlRW1pdHRlciwgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5hYnN0cmFjdCBjbGFzcyBNYWluVGhyZWFkS2VybmVsIGltcGxlbWVudHMgSU5vdGVib29rS2VybmVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxJTm90ZWJvb2tLZXJuZWxDaGFuZ2VFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBwcmVsb2FkczogeyB1cmk6IFVSSTsgcHJvdmlkZXM6IHJlYWRvbmx5IHN0cmluZ1tdIH1bXTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElOb3RlYm9va0tlcm5lbENoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblxuXHRpbXBsZW1lbnRzSW50ZXJydXB0OiBib29sZWFuO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0ZGV0YWlsPzogc3RyaW5nO1xuXHRzdXBwb3J0ZWRMYW5ndWFnZXM6IHN0cmluZ1tdO1xuXHRpbXBsZW1lbnRzRXhlY3V0aW9uT3JkZXI6IGJvb2xlYW47XG5cdGhhc1ZhcmlhYmxlUHJvdmlkZXI6IGJvb2xlYW47XG5cdGxvY2FsUmVzb3VyY2VSb290OiBVUkk7XG5cblx0cHVibGljIGdldCBwcmVsb2FkVXJpcygpIHtcblx0XHRyZXR1cm4gdGhpcy5wcmVsb2Fkcy5tYXAocCA9PiBwLnVyaSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHByZWxvYWRQcm92aWRlcygpIHtcblx0XHRyZXR1cm4gdGhpcy5wcmVsb2Fkcy5mbGF0TWFwKHAgPT4gcC5wcm92aWRlcyk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihkYXRhOiBJTm90ZWJvb2tLZXJuZWxEdG8yLCBwcml2YXRlIF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UpIHtcblx0XHR0aGlzLmlkID0gZGF0YS5pZDtcblx0XHR0aGlzLnZpZXdUeXBlID0gZGF0YS5ub3RlYm9va1R5cGU7XG5cdFx0dGhpcy5leHRlbnNpb24gPSBkYXRhLmV4dGVuc2lvbklkO1xuXG5cdFx0dGhpcy5pbXBsZW1lbnRzSW50ZXJydXB0ID0gZGF0YS5zdXBwb3J0c0ludGVycnVwdCA/PyBmYWxzZTtcblx0XHR0aGlzLmxhYmVsID0gZGF0YS5sYWJlbDtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGF0YS5kZXNjcmlwdGlvbjtcblx0XHR0aGlzLmRldGFpbCA9IGRhdGEuZGV0YWlsO1xuXHRcdHRoaXMuc3VwcG9ydGVkTGFuZ3VhZ2VzID0gaXNOb25FbXB0eUFycmF5KGRhdGEuc3VwcG9ydGVkTGFuZ3VhZ2VzKSA/IGRhdGEuc3VwcG9ydGVkTGFuZ3VhZ2VzIDogX2xhbmd1YWdlU2VydmljZS5nZXRSZWdpc3RlcmVkTGFuZ3VhZ2VJZHMoKTtcblx0XHR0aGlzLmltcGxlbWVudHNFeGVjdXRpb25PcmRlciA9IGRhdGEuc3VwcG9ydHNFeGVjdXRpb25PcmRlciA/PyBmYWxzZTtcblx0XHR0aGlzLmhhc1ZhcmlhYmxlUHJvdmlkZXIgPSBkYXRhLmhhc1ZhcmlhYmxlUHJvdmlkZXIgPz8gZmFsc2U7XG5cdFx0dGhpcy5sb2NhbFJlc291cmNlUm9vdCA9IFVSSS5yZXZpdmUoZGF0YS5leHRlbnNpb25Mb2NhdGlvbik7XG5cdFx0dGhpcy5wcmVsb2FkcyA9IGRhdGEucHJlbG9hZHM/Lm1hcCh1ID0+ICh7IHVyaTogVVJJLnJldml2ZSh1LnVyaSksIHByb3ZpZGVzOiB1LnByb3ZpZGVzIH0pKSA/PyBbXTtcblx0fVxuXG5cblx0dXBkYXRlKGRhdGE6IFBhcnRpYWw8SU5vdGVib29rS2VybmVsRHRvMj4pIHtcblxuXHRcdGNvbnN0IGV2ZW50OiBJTm90ZWJvb2tLZXJuZWxDaGFuZ2VFdmVudCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0aWYgKGRhdGEubGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5sYWJlbCA9IGRhdGEubGFiZWw7XG5cdFx0XHRldmVudC5sYWJlbCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXRhLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb24gPSBkYXRhLmRlc2NyaXB0aW9uO1xuXHRcdFx0ZXZlbnQuZGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5kZXRhaWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5kZXRhaWwgPSBkYXRhLmRldGFpbDtcblx0XHRcdGV2ZW50LmRldGFpbCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXRhLnN1cHBvcnRlZExhbmd1YWdlcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnN1cHBvcnRlZExhbmd1YWdlcyA9IGlzTm9uRW1wdHlBcnJheShkYXRhLnN1cHBvcnRlZExhbmd1YWdlcykgPyBkYXRhLnN1cHBvcnRlZExhbmd1YWdlcyA6IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRSZWdpc3RlcmVkTGFuZ3VhZ2VJZHMoKTtcblx0XHRcdGV2ZW50LnN1cHBvcnRlZExhbmd1YWdlcyA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXRhLnN1cHBvcnRzRXhlY3V0aW9uT3JkZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5pbXBsZW1lbnRzRXhlY3V0aW9uT3JkZXIgPSBkYXRhLnN1cHBvcnRzRXhlY3V0aW9uT3JkZXI7XG5cdFx0XHRldmVudC5oYXNFeGVjdXRpb25PcmRlciA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXRhLnN1cHBvcnRzSW50ZXJydXB0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaW1wbGVtZW50c0ludGVycnVwdCA9IGRhdGEuc3VwcG9ydHNJbnRlcnJ1cHQ7XG5cdFx0XHRldmVudC5oYXNJbnRlcnJ1cHRIYW5kbGVyID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGRhdGEuaGFzVmFyaWFibGVQcm92aWRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmhhc1ZhcmlhYmxlUHJvdmlkZXIgPSBkYXRhLmhhc1ZhcmlhYmxlUHJvdmlkZXI7XG5cdFx0XHRldmVudC5oYXNWYXJpYWJsZVByb3ZpZGVyID0gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHRhYnN0cmFjdCBleGVjdXRlTm90ZWJvb2tDZWxsc1JlcXVlc3QodXJpOiBVUkksIGNlbGxIYW5kbGVzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD47XG5cdGFic3RyYWN0IGNhbmNlbE5vdGVib29rQ2VsbEV4ZWN1dGlvbih1cmk6IFVSSSwgY2VsbEhhbmRsZXM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPjtcblx0YWJzdHJhY3QgcHJvdmlkZVZhcmlhYmxlcyhub3RlYm9va1VyaTogVVJJLCBwYXJlbnRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBraW5kOiAnbmFtZWQnIHwgJ2luZGV4ZWQnLCBzdGFydDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VmFyaWFibGVzUmVzdWx0Pjtcbn1cblxuY2xhc3MgTWFpblRocmVhZEtlcm5lbERldGVjdGlvblRhc2sgaW1wbGVtZW50cyBJTm90ZWJvb2tLZXJuZWxEZXRlY3Rpb25UYXNrIHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgbm90ZWJvb2tUeXBlOiBzdHJpbmcpIHsgfVxufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZE5vdGVib29rS2VybmVscylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkTm90ZWJvb2tLZXJuZWxzIGltcGxlbWVudHMgTWFpblRocmVhZE5vdGVib29rS2VybmVsc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzID0gbmV3IERpc3Bvc2FibGVNYXA8SU5vdGVib29rRWRpdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxzID0gbmV3IE1hcDxudW1iZXIsIFtrZXJuZWw6IE1haW5UaHJlYWRLZXJuZWwsIHJlZ2lzdHJhaW9uOiBJRGlzcG9zYWJsZV0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2tlcm5lbERldGVjdGlvblRhc2tzID0gbmV3IE1hcDxudW1iZXIsIFt0YXNrOiBNYWluVGhyZWFkS2VybmVsRGV0ZWN0aW9uVGFzaywgcmVnaXN0cmFpb246IElEaXNwb3NhYmxlXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIFtwcm92aWRlcjogSUtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyLCByZWdpc3RyYWlvbjogSURpc3Bvc2FibGVdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnNFdmVudFJlZ2lzdHJhdGlvbnMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3ROb3RlYm9va0tlcm5lbHNTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leGVjdXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElOb3RlYm9va0NlbGxFeGVjdXRpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRXhlY3V0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBJTm90ZWJvb2tFeGVjdXRpb24+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvclNlcnZpY2Ugbm90ZWJvb2tFZGl0b3JTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdE5vdGVib29rS2VybmVscyk7XG5cblx0XHRub3RlYm9va0VkaXRvclNlcnZpY2UubGlzdE5vdGVib29rRWRpdG9ycygpLmZvckVhY2godGhpcy5fb25FZGl0b3JBZGQsIHRoaXMpO1xuXHRcdG5vdGVib29rRWRpdG9yU2VydmljZS5vbkRpZEFkZE5vdGVib29rRWRpdG9yKHRoaXMuX29uRWRpdG9yQWRkLCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdFx0bm90ZWJvb2tFZGl0b3JTZXJ2aWNlLm9uRGlkUmVtb3ZlTm90ZWJvb2tFZGl0b3IodGhpcy5fb25FZGl0b3JSZW1vdmUsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Ly8gRUggc2h1dCBkb3duLCBjb21wbGV0ZSBhbGwgZXhlY3V0aW9ucyBzdGFydGVkIGJ5IHRoaXMgRUhcblx0XHRcdHRoaXMuX2V4ZWN1dGlvbnMuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0ZS5jb21wbGV0ZSh7fSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX25vdGVib29rRXhlY3V0aW9ucy5mb3JFYWNoKGUgPT4gZS5jb21wbGV0ZSgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VsZWN0ZWROb3RlYm9va3MoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IFtoYW5kbGUsIFtrZXJuZWwsXV0gb2YgdGhpcy5fa2VybmVscykge1xuXHRcdFx0XHRpZiAoZS5vbGRLZXJuZWwgPT09IGtlcm5lbC5pZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHROb3RlYm9va0Fzc29jaWF0aW9uKGhhbmRsZSwgZS5ub3RlYm9vaywgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUubmV3S2VybmVsID09PSBrZXJuZWwuaWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0Tm90ZWJvb2tBc3NvY2lhdGlvbihoYW5kbGUsIGUubm90ZWJvb2ssIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBbLCByZWdpc3RyYXRpb25dIG9mIHRoaXMuX2tlcm5lbHMudmFsdWVzKCkpIHtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgWywgcmVnaXN0cmF0aW9uXSBvZiB0aGlzLl9rZXJuZWxEZXRlY3Rpb25UYXNrcy52YWx1ZXMoKSkge1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbLCByZWdpc3RyYXRpb25dIG9mIHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fZWRpdG9ycy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyAtLS0ga2VybmVsIGlwY1xuXG5cdHByaXZhdGUgX29uRWRpdG9yQWRkKGVkaXRvcjogSU5vdGVib29rRWRpdG9yKSB7XG5cblx0XHRjb25zdCBpcGNMaXN0ZW5lciA9IGVkaXRvci5vbkRpZFJlY2VpdmVNZXNzYWdlKGUgPT4ge1xuXHRcdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHNlbGVjdGVkIH0gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwoZWRpdG9yLnRleHRNb2RlbCk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW2hhbmRsZSwgY2FuZGlkYXRlXSBvZiB0aGlzLl9rZXJuZWxzKSB7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGVbMF0gPT09IHNlbGVjdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEtlcm5lbE1lc3NhZ2VGcm9tUmVuZGVyZXIoaGFuZGxlLCBlZGl0b3IuZ2V0SWQoKSwgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2VkaXRvcnMuc2V0KGVkaXRvciwgaXBjTGlzdGVuZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FZGl0b3JSZW1vdmUoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IpIHtcblx0XHR0aGlzLl9lZGl0b3JzLmRlbGV0ZUFuZERpc3Bvc2UoZWRpdG9yKTtcblx0fVxuXG5cdGFzeW5jICRwb3N0TWVzc2FnZShoYW5kbGU6IG51bWJlciwgZWRpdG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZTogdW5rbm93bik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHR1cGxlID0gdGhpcy5fa2VybmVscy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXR1cGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2tlcm5lbCBhbHJlYWR5IGRpc3Bvc2VkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IFtrZXJuZWxdID0gdHVwbGU7XG5cdFx0bGV0IGRpZFNlbmQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IFtlZGl0b3JdIG9mIHRoaXMuX2VkaXRvcnMpIHtcblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKGVkaXRvci50ZXh0TW9kZWwpLnNlbGVjdGVkICE9PSBrZXJuZWwpIHtcblx0XHRcdFx0Ly8gZGlmZmVyZW50IGtlcm5lbFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChlZGl0b3JJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIGFsbCBlZGl0b3JzXG5cdFx0XHRcdGVkaXRvci5wb3N0TWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdFx0ZGlkU2VuZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXRvci5nZXRJZCgpID09PSBlZGl0b3JJZCkge1xuXHRcdFx0XHQvLyBzZWxlY3RlZCBlZGl0b3JzXG5cdFx0XHRcdGVkaXRvci5wb3N0TWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdFx0ZGlkU2VuZCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGlkU2VuZDtcblx0fVxuXG5cdHByaXZhdGUgdmFyaWFibGVSZXF1ZXN0SW5kZXggPSAwO1xuXHRwcml2YXRlIHZhcmlhYmxlUmVxdWVzdE1hcCA9IG5ldyBNYXA8c3RyaW5nLCBBc3luY0l0ZXJhYmxlRW1pdHRlcjxWYXJpYWJsZXNSZXN1bHQ+PigpO1xuXHQkcmVjZWl2ZVZhcmlhYmxlKHJlcXVlc3RJZDogc3RyaW5nLCB2YXJpYWJsZTogVmFyaWFibGVzUmVzdWx0KSB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMudmFyaWFibGVSZXF1ZXN0TWFwLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmIChlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyLmVtaXRPbmUodmFyaWFibGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBrZXJuZWwgYWRkaW5nL3VwZGF0aW5nL3JlbW92YWxcblxuXHRhc3luYyAkYWRkS2VybmVsKGhhbmRsZTogbnVtYmVyLCBkYXRhOiBJTm90ZWJvb2tLZXJuZWxEdG8yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3Qga2VybmVsID0gbmV3IGNsYXNzIGV4dGVuZHMgTWFpblRocmVhZEtlcm5lbCB7XG5cdFx0XHRhc3luYyBleGVjdXRlTm90ZWJvb2tDZWxsc1JlcXVlc3QodXJpOiBVUkksIGhhbmRsZXM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGF3YWl0IHRoYXQuX3Byb3h5LiRleGVjdXRlQ2VsbHMoaGFuZGxlLCB1cmksIGhhbmRsZXMpO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgY2FuY2VsTm90ZWJvb2tDZWxsRXhlY3V0aW9uKHVyaTogVVJJLCBoYW5kbGVzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCB0aGF0Ll9wcm94eS4kY2FuY2VsQ2VsbHMoaGFuZGxlLCB1cmksIGhhbmRsZXMpO1xuXHRcdFx0fVxuXHRcdFx0cHJvdmlkZVZhcmlhYmxlcyhub3RlYm9va1VyaTogVVJJLCBwYXJlbnRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBraW5kOiAnbmFtZWQnIHwgJ2luZGV4ZWQnLCBzdGFydDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VmFyaWFibGVzUmVzdWx0PiB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IGAke2hhbmRsZX12YXJpYWJsZXMke3RoYXQudmFyaWFibGVSZXF1ZXN0SW5kZXgrK31gO1xuXG5cdFx0XHRcdHJldHVybiBuZXcgQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFZhcmlhYmxlc1Jlc3VsdD4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdFx0dGhhdC52YXJpYWJsZVJlcXVlc3RNYXAuc2V0KHJlcXVlc3RJZCwgZW1pdHRlcik7XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhhdC5fcHJveHkuJHByb3ZpZGVWYXJpYWJsZXMoaGFuZGxlLCByZXF1ZXN0SWQsIG5vdGVib29rVXJpLCBwYXJlbnRJZCwga2luZCwgc3RhcnQsIHRva2VuKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0dGhhdC52YXJpYWJsZVJlcXVlc3RNYXAuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KGRhdGEsIHRoaXMuX2xhbmd1YWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdC8vIEVuc3VyZSBfa2VybmVscyBpcyB1cCB0byBkYXRlIGJlZm9yZSB3ZSByZWdpc3RlciBhIGtlcm5lbC5cblx0XHR0aGlzLl9rZXJuZWxzLnNldChoYW5kbGUsIFtrZXJuZWwsIGRpc3Bvc2FibGVzXSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX25vdGVib29rS2VybmVsU2VydmljZS5yZWdpc3Rlcktlcm5lbChrZXJuZWwpKTtcblx0fVxuXG5cdCR1cGRhdGVLZXJuZWwoaGFuZGxlOiBudW1iZXIsIGRhdGE6IFBhcnRpYWw8SU5vdGVib29rS2VybmVsRHRvMj4pOiB2b2lkIHtcblx0XHRjb25zdCB0dXBsZSA9IHRoaXMuX2tlcm5lbHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHR1cGxlKSB7XG5cdFx0XHR0dXBsZVswXS51cGRhdGUoZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0JHJlbW92ZUtlcm5lbChoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHR1cGxlID0gdGhpcy5fa2VybmVscy5nZXQoaGFuZGxlKTtcblx0XHRpZiAodHVwbGUpIHtcblx0XHRcdHR1cGxlWzFdLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2tlcm5lbHMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0JHVwZGF0ZU5vdGVib29rUHJpb3JpdHkoaGFuZGxlOiBudW1iZXIsIG5vdGVib29rOiBVcmlDb21wb25lbnRzLCB2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVwbGUgPSB0aGlzLl9rZXJuZWxzLmdldChoYW5kbGUpO1xuXHRcdGlmICh0dXBsZSkge1xuXHRcdFx0dGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLnVwZGF0ZUtlcm5lbE5vdGVib29rQWZmaW5pdHkodHVwbGVbMF0sIFVSSS5yZXZpdmUobm90ZWJvb2spLCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIENlbGwgZXhlY3V0aW9uXG5cblx0JGNyZWF0ZUV4ZWN1dGlvbihoYW5kbGU6IG51bWJlciwgY29udHJvbGxlcklkOiBzdHJpbmcsIHJhd1VyaTogVXJpQ29tcG9uZW50cywgY2VsbEhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShyYXdVcmkpO1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKHVyaSk7XG5cdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBOb3RlYm9vayBub3QgZm91bmQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2VybmVsID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblx0XHRpZiAoIWtlcm5lbC5zZWxlY3RlZCB8fCBrZXJuZWwuc2VsZWN0ZWQuaWQgIT09IGNvbnRyb2xsZXJJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBLZXJuZWwgaXMgbm90IHNlbGVjdGVkOiAke2tlcm5lbC5zZWxlY3RlZD8uaWR9ICE9PSAke2NvbnRyb2xsZXJJZH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuY3JlYXRlQ2VsbEV4ZWN1dGlvbih1cmksIGNlbGxIYW5kbGUpO1xuXHRcdGV4ZWN1dGlvbi5jb25maXJtKCk7XG5cdFx0dGhpcy5fZXhlY3V0aW9ucy5zZXQoaGFuZGxlLCBleGVjdXRpb24pO1xuXHR9XG5cblx0JHVwZGF0ZUV4ZWN1dGlvbihoYW5kbGU6IG51bWJlciwgZGF0YTogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SUNlbGxFeGVjdXRlVXBkYXRlRHRvW10+KTogdm9pZCB7XG5cdFx0Y29uc3QgdXBkYXRlcyA9IGRhdGEudmFsdWU7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX2V4ZWN1dGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRleGVjdXRpb24/LnVwZGF0ZSh1cGRhdGVzLm1hcChOb3RlYm9va0R0by5mcm9tQ2VsbEV4ZWN1dGVVcGRhdGVEdG8pKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHQkY29tcGxldGVFeGVjdXRpb24oaGFuZGxlOiBudW1iZXIsIGRhdGE6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDZWxsRXhlY3V0aW9uQ29tcGxldGVEdG8+KTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX2V4ZWN1dGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRleGVjdXRpb24/LmNvbXBsZXRlKE5vdGVib29rRHRvLmZyb21DZWxsRXhlY3V0ZUNvbXBsZXRlRHRvKGRhdGEudmFsdWUpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXhlY3V0aW9ucy5kZWxldGUoaGFuZGxlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gTm90ZWJvb2sgZXhlY3V0aW9uXG5cblx0JGNyZWF0ZU5vdGVib29rRXhlY3V0aW9uKGhhbmRsZTogbnVtYmVyLCBjb250cm9sbGVySWQ6IHN0cmluZywgcmF3VXJpOiBVcmlDb21wb25lbnRzKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShyYXdVcmkpO1xuXHRcdGNvbnN0IG5vdGVib29rID0gdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKHVyaSk7XG5cdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBOb3RlYm9vayBub3QgZm91bmQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2VybmVsID0gdGhpcy5fbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKTtcblx0XHRpZiAoIWtlcm5lbC5zZWxlY3RlZCB8fCBrZXJuZWwuc2VsZWN0ZWQuaWQgIT09IGNvbnRyb2xsZXJJZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBLZXJuZWwgaXMgbm90IHNlbGVjdGVkOiAke2tlcm5lbC5zZWxlY3RlZD8uaWR9ICE9PSAke2NvbnRyb2xsZXJJZH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gdGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuY3JlYXRlRXhlY3V0aW9uKHVyaSk7XG5cdFx0ZXhlY3V0aW9uLmNvbmZpcm0oKTtcblx0XHR0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuc2V0KGhhbmRsZSwgZXhlY3V0aW9uKTtcblx0fVxuXG5cdCRiZWdpbk5vdGVib29rRXhlY3V0aW9uKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX25vdGVib29rRXhlY3V0aW9ucy5nZXQoaGFuZGxlKTtcblx0XHRcdGV4ZWN1dGlvbj8uYmVnaW4oKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHQkY29tcGxldGVOb3RlYm9va0V4ZWN1dGlvbihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSB0aGlzLl9ub3RlYm9va0V4ZWN1dGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRleGVjdXRpb24/LmNvbXBsZXRlKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX25vdGVib29rRXhlY3V0aW9ucy5kZWxldGUoaGFuZGxlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gbm90ZWJvb2sga2VybmVsIGRldGVjdGlvbiB0YXNrXG5cdGFzeW5jICRhZGRLZXJuZWxEZXRlY3Rpb25UYXNrKGhhbmRsZTogbnVtYmVyLCBub3RlYm9va1R5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtlcm5lbERldGVjdGlvblRhc2sgPSBuZXcgTWFpblRocmVhZEtlcm5lbERldGVjdGlvblRhc2sobm90ZWJvb2tUeXBlKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UucmVnaXN0ZXJOb3RlYm9va0tlcm5lbERldGVjdGlvblRhc2soa2VybmVsRGV0ZWN0aW9uVGFzayk7XG5cdFx0dGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFza3Muc2V0KGhhbmRsZSwgW2tlcm5lbERldGVjdGlvblRhc2ssIHJlZ2lzdHJhdGlvbl0pO1xuXHR9XG5cblx0JHJlbW92ZUtlcm5lbERldGVjdGlvblRhc2soaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0dXBsZSA9IHRoaXMuX2tlcm5lbERldGVjdGlvblRhc2tzLmdldChoYW5kbGUpO1xuXHRcdGlmICh0dXBsZSkge1xuXHRcdFx0dHVwbGVbMV0uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fa2VybmVsRGV0ZWN0aW9uVGFza3MuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIG5vdGVib29rIGtlcm5lbCBzb3VyY2UgYWN0aW9uIHByb3ZpZGVyXG5cblx0YXN5bmMgJGFkZEtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBldmVudEhhbmRsZTogbnVtYmVyLCBub3RlYm9va1R5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyOiBJS2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHR2aWV3VHlwZTogbm90ZWJvb2tUeXBlLFxuXHRcdFx0cHJvdmlkZUtlcm5lbFNvdXJjZUFjdGlvbnM6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlS2VybmVsU291cmNlQWN0aW9ucyhoYW5kbGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRcdHJldHVybiBhY3Rpb25zLm1hcChhY3Rpb24gPT4ge1xuXHRcdFx0XHRcdGxldCBkb2N1bWVudGF0aW9uID0gYWN0aW9uLmRvY3VtZW50YXRpb247XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5kb2N1bWVudGF0aW9uICYmIHR5cGVvZiBhY3Rpb24uZG9jdW1lbnRhdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb24gPSBVUkkucmV2aXZlKGFjdGlvbi5kb2N1bWVudGF0aW9uKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IGFjdGlvbi5jb21tYW5kLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFjdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGRldGFpbDogYWN0aW9uLmRldGFpbCxcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb24sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyc0V2ZW50UmVnaXN0cmF0aW9ucy5zZXQoZXZlbnRIYW5kbGUsIGVtaXR0ZXIpO1xuXHRcdFx0a2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXIub25EaWRDaGFuZ2VTb3VyY2VBY3Rpb25zID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2UucmVnaXN0ZXJLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcihub3RlYm9va1R5cGUsIGtlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyKTtcblx0XHR0aGlzLl9rZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgW2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyLCByZWdpc3RyYXRpb25dKTtcblx0fVxuXG5cdCRyZW1vdmVLZXJuZWxTb3VyY2VBY3Rpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlciwgZXZlbnRIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHR1cGxlID0gdGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICh0dXBsZSkge1xuXHRcdFx0dHVwbGVbMV0uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5fa2VybmVsU291cmNlQWN0aW9uUHJvdmlkZXJzRXZlbnRSZWdpc3RyYXRpb25zLmRlbGV0ZShldmVudEhhbmRsZSk7XG5cdFx0fVxuXHR9XG5cblx0JGVtaXROb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbnNDaGFuZ2VFdmVudChldmVudEhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX2tlcm5lbFNvdXJjZUFjdGlvblByb3ZpZGVyc0V2ZW50UmVnaXN0cmF0aW9ucy5nZXQoZXZlbnRIYW5kbGUpO1xuXHRcdGlmIChlbWl0dGVyIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0ZW1pdHRlci5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0JHZhcmlhYmxlc1VwZGF0ZWQobm90ZWJvb2tVcmk6IFVyaUNvbXBvbmVudHMpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RlYm9va0tlcm5lbFNlcnZpY2Uubm90aWZ5VmFyaWFibGVzQ2hhbmdlKFVSSS5yZXZpdmUobm90ZWJvb2tVcmkpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZSxpQkFBOEIsb0JBQW9CO0FBQzFFLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNkM7QUFFdEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBcUQsc0NBQXNDO0FBQzNGLFNBQWlILDhCQUErQztBQUVoSyxTQUFTLGdCQUFvSCxtQkFBbUQ7QUFDaEwsU0FBUyx3QkFBd0I7QUFDakMsU0FBK0IsNkJBQTZCO0FBRTVELE1BQWUsaUJBQTRDO0FBQUEsRUEwQjFELFlBQVksTUFBbUMsa0JBQW9DO0FBQXBDO0FBekIvQyxTQUFpQixlQUFlLElBQUksUUFBb0M7QUFFeEUsU0FBUyxjQUFpRCxLQUFLLGFBQWE7QUF3QjNFLFNBQUssS0FBSyxLQUFLO0FBQ2YsU0FBSyxXQUFXLEtBQUs7QUFDckIsU0FBSyxZQUFZLEtBQUs7QUFFdEIsU0FBSyxzQkFBc0IsS0FBSyxxQkFBcUI7QUFD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
