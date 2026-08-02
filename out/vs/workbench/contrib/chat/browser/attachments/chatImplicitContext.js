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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { getCodeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { EditorsOrder } from "../../../../common/editor.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { getNotebookEditorFromEditorPane } from "../../../notebook/browser/notebookBrowser.js";
import { WebviewInput } from "../../../webviewPanel/browser/webviewEditorInput.js";
import { IChatEditingService } from "../../common/editing/chatEditingService.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { isStringImplicitContextValue } from "../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ILanguageModelIgnoredFilesService } from "../../common/ignoredFiles.js";
import { IChatWidgetService } from "../chat.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { BrowserEditorInput } from "../../../browserView/common/browserEditorInput.js";
let ChatImplicitContextContribution = class extends Disposable {
  constructor(codeEditorService, editorService, chatWidgetService, chatService, chatEditingService, configurationService, ignoredFilesService, chatContextService) {
    super();
    this.codeEditorService = codeEditorService;
    this.editorService = editorService;
    this.chatWidgetService = chatWidgetService;
    this.chatService = chatService;
    this.chatEditingService = chatEditingService;
    this.configurationService = configurationService;
    this.ignoredFilesService = ignoredFilesService;
    this.chatContextService = chatContextService;
    this._currentCancelTokenSource = this._register(new MutableDisposable());
    this._implicitContextEnablement = this.configurationService.getValue("chat.implicitContext.enabled");
    const activeEditorDisposables = this._register(new DisposableStore());
    this._register(Event.runAndSubscribe(
      editorService.onDidActiveEditorChange,
      (() => {
        activeEditorDisposables.clear();
        const codeEditor = this.findActiveCodeEditor();
        if (codeEditor) {
          activeEditorDisposables.add(Event.debounce(
            Event.any(
              codeEditor.onDidChangeModel,
              codeEditor.onDidChangeModelLanguage,
              codeEditor.onDidChangeCursorSelection,
              codeEditor.onDidScrollChange
            ),
            () => void 0,
            500
          )(() => this.updateImplicitContext()));
        }
        const notebookEditor = this.findActiveNotebookEditor();
        if (notebookEditor) {
          const activeCellDisposables = activeEditorDisposables.add(new DisposableStore());
          activeEditorDisposables.add(notebookEditor.onDidChangeActiveCell(() => {
            activeCellDisposables.clear();
            const codeEditor2 = this.codeEditorService.getActiveCodeEditor();
            if (codeEditor2 && codeEditor2.getModel()?.uri.scheme === Schemas.vscodeNotebookCell) {
              activeCellDisposables.add(Event.debounce(
                Event.any(
                  codeEditor2.onDidChangeModel,
                  codeEditor2.onDidChangeCursorSelection,
                  codeEditor2.onDidScrollChange
                ),
                () => void 0,
                500
              )(() => this.updateImplicitContext()));
            }
          }));
          activeEditorDisposables.add(Event.debounce(
            Event.any(
              notebookEditor.onDidChangeModel,
              notebookEditor.onDidChangeActiveCell
            ),
            () => void 0,
            500
          )(() => this.updateImplicitContext()));
        }
        const webviewEditor = this.findActiveWebviewEditor();
        if (webviewEditor) {
          activeEditorDisposables.add(Event.debounce(webviewEditor.input.webview.onMessage, () => void 0, 500)(() => {
            this.updateImplicitContext();
          }));
        }
        this.updateImplicitContext();
      })
    ));
    this._register(autorun((reader) => {
      this.chatEditingService.editingSessionsObs.read(reader);
      this.updateImplicitContext();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.implicitContext.enabled")) {
        this._implicitContextEnablement = this.configurationService.getValue("chat.implicitContext.enabled");
        this.updateImplicitContext();
      }
    }));
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      const widget = this.chatWidgetService.getWidgetBySessionResource(chatSessionResource);
      if (!widget?.input.implicitContext) {
        return;
      }
      if (this._implicitContextEnablement[widget.location] === "first" && widget.viewModel?.getItems().length !== 0) {
        widget.input.implicitContext.setValues([]);
      }
    }));
    this._register(this.chatWidgetService.onDidAddWidget(async (widget) => {
      await this.updateImplicitContext(widget);
    }));
  }
  findActiveCodeEditor() {
    const codeEditor = this.codeEditorService.getActiveCodeEditor();
    if (codeEditor) {
      const model = codeEditor.getModel();
      if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
        return void 0;
      }
      if (model) {
        return codeEditor;
      }
    }
    for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      const codeEditor2 = getCodeEditor(codeOrDiffEditor);
      if (!codeEditor2) {
        continue;
      }
      const model = codeEditor2.getModel();
      if (model) {
        return codeEditor2;
      }
    }
    return void 0;
  }
  findActiveWebviewEditor() {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane?.input instanceof WebviewInput) {
      return activeEditorPane;
    }
    return void 0;
  }
  findActiveBrowserEditor() {
    const activeEditorPane = this.editorService.activeEditorPane;
    if (activeEditorPane?.input instanceof BrowserEditorInput) {
      return activeEditorPane.input;
    }
    return void 0;
  }
  findActiveNotebookEditor() {
    return getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
  }
  async updateImplicitContext(updateWidget) {
    const cancelTokenSource = this._currentCancelTokenSource.value = new CancellationTokenSource();
    const codeEditor = this.findActiveCodeEditor();
    const model = codeEditor?.getModel();
    const selection = codeEditor?.getSelection();
    const useSuggestedContext = this.configurationService.getValue("chat.implicitContext.suggestedContext");
    let newValue;
    let isSelection = false;
    let languageId;
    let providerContext;
    if (model) {
      languageId = model.getLanguageId();
      if (selection && !selection.isEmpty()) {
        newValue = { uri: model.uri, range: selection };
        isSelection = true;
      } else {
        if (useSuggestedContext) {
          newValue = model.uri;
        } else {
          const visibleRanges = codeEditor?.getVisibleRanges();
          if (visibleRanges && visibleRanges.length > 0) {
            let range = visibleRanges[0];
            visibleRanges.slice(1).forEach((r) => {
              range = range.plusRange(r);
            });
            newValue = { uri: model.uri, range };
          } else {
            newValue = model.uri;
          }
        }
      }
      providerContext = await this.chatContextService.contextForResource(model.uri, languageId);
    }
    const notebookEditor = this.findActiveNotebookEditor();
    if (notebookEditor?.isReplHistory) {
      newValue = void 0;
    } else if (notebookEditor) {
      const activeCell = notebookEditor.getActiveCell();
      if (activeCell) {
        const codeEditor2 = this.codeEditorService.getActiveCodeEditor();
        const selection2 = codeEditor2?.getSelection();
        const visibleRanges = codeEditor2?.getVisibleRanges() || [];
        newValue = activeCell.uri;
        const cellModel = codeEditor2?.getModel();
        if (cellModel && isEqual(cellModel.uri, activeCell.uri)) {
          if (selection2 && !selection2.isEmpty()) {
            newValue = { uri: activeCell.uri, range: selection2 };
            isSelection = true;
          } else if (visibleRanges.length > 0) {
            if (!isEntireCellVisible(cellModel, visibleRanges)) {
              let range = visibleRanges[0];
              visibleRanges.slice(1).forEach((r) => {
                range = range.plusRange(r);
              });
              newValue = { uri: activeCell.uri, range };
            }
          }
        }
      } else {
        newValue = notebookEditor.textModel?.uri;
      }
    }
    const webviewEditor = this.findActiveWebviewEditor();
    if (webviewEditor?.input instanceof WebviewInput && webviewEditor.input.resource) {
      const webviewContext = await this.chatContextService.contextForResource(webviewEditor.input.resource, void 0, webviewEditor.input.viewType);
      if (webviewContext) {
        newValue = webviewContext;
      }
    }
    const browser = this.findActiveBrowserEditor();
    if (browser?.isSharingAvailable && useSuggestedContext) {
      newValue = browser.resource;
    }
    const uri = newValue instanceof URI ? newValue : isStringImplicitContextValue(newValue) ? void 0 : newValue?.uri;
    if (uri && (await this.ignoredFilesService.fileIsIgnored(uri, cancelTokenSource.token) || uri.path.endsWith(".copilotmd"))) {
      newValue = void 0;
    }
    if (cancelTokenSource.token.isCancellationRequested) {
      return;
    }
    const widgets = updateWidget ? [updateWidget] : [...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat), ...this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.EditorInline)];
    for (const widget of widgets) {
      if (!widget.input.implicitContext) {
        continue;
      }
      const setting = this._implicitContextEnablement[widget.location];
      const isFirstInteraction = widget.viewModel?.getItems().length === 0;
      if (setting === "always" || setting === "first" && isFirstInteraction) {
        const hasActiveEditor = !!this.editorService.activeEditor;
        if (newValue !== void 0 || !widget.input.implicitContext.hasValue || !hasActiveEditor) {
          widget.input.implicitContext.setValues([{ value: newValue, isSelection }, { value: providerContext, isSelection: false }]);
        }
      } else {
        widget.input.implicitContext.setValues([]);
      }
    }
  }
};
ChatImplicitContextContribution.ID = "chat.implicitContext";
ChatImplicitContextContribution = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatEditingService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILanguageModelIgnoredFilesService),
  __decorateParam(7, IChatContextService)
], ChatImplicitContextContribution);
function isEntireCellVisible(cellModel, visibleRanges) {
  if (visibleRanges.length === 1 && visibleRanges[0].startLineNumber === 1 && visibleRanges[0].startColumn === 1 && visibleRanges[0].endLineNumber === cellModel.getLineCount() && visibleRanges[0].endColumn === cellModel.getLineMaxColumn(visibleRanges[0].endLineNumber)) {
    return true;
  }
  return false;
}
class ChatImplicitContexts extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._values = this._register(new DisposableMap());
    this._valuesDisposables = this._register(new DisposableStore());
    this._enabled = false;
  }
  setValues(values) {
    this._valuesDisposables.clear();
    this._values.clearAndDisposeAll();
    if (!values || values.length === 0) {
      this._onDidChangeValue.fire();
      return;
    }
    const definedValues = values.filter((value) => value.value !== void 0);
    for (const value of definedValues) {
      const implicitContext = new ChatImplicitContext();
      implicitContext.setValue(value.value, value.isSelection);
      implicitContext.enabled = this._enabled;
      const disposableStore = new DisposableStore();
      disposableStore.add(implicitContext.onDidChangeValue(() => {
        this._onDidChangeValue.fire();
      }));
      disposableStore.add(implicitContext);
      this._values.set(implicitContext, disposableStore);
    }
    this._onDidChangeValue.fire();
  }
  get values() {
    return Array.from(this._values.keys());
  }
  get hasEnabled() {
    return Array.from(this._values.keys()).some((v) => v.enabled);
  }
  setEnabled(enabled) {
    this._enabled = enabled;
    this.values.forEach((v) => v.enabled = enabled);
  }
  get hasValue() {
    return this.values.some((v) => v.value !== void 0);
  }
  get hasNonUri() {
    return this.values.some((v) => v.value !== void 0 && !URI.isUri(v.value));
  }
  getLocations() {
    return this.values.filter((v) => isLocation(v.value)).map((v) => v.value);
  }
  getUris() {
    return this.values.filter((v) => URI.isUri(v.value)).map((v) => v.value);
  }
  get hasNonStringContext() {
    return this.values.some((v) => v.value !== void 0 && !isStringImplicitContextValue(v.value));
  }
  enabledBaseEntries(includeAllLocations) {
    return this.values.flatMap((v) => {
      if (v.enabled) {
        return v.toBaseEntries();
      } else if (includeAllLocations && isLocation(v.value)) {
        return v.toBaseEntries();
      }
      return [];
    });
  }
}
class ChatImplicitContext extends Disposable {
  constructor() {
    super(...arguments);
    this.kind = "implicit";
    this.isFile = true;
    this._isSelection = false;
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._enabled = false;
  }
  get id() {
    if (URI.isUri(this.value)) {
      return "vscode.implicit.file";
    } else if (isStringImplicitContextValue(this.value)) {
      return "vscode.implicit.string";
    } else if (this.value) {
      if (this._isSelection) {
        return "vscode.implicit.selection";
      } else {
        return "vscode.implicit.viewport";
      }
    } else {
      return "vscode.implicit";
    }
  }
  get name() {
    if (URI.isUri(this.value)) {
      if (this.value.scheme === Schemas.vscodeBrowser) {
        return `browser`;
      }
      return `file:${basename(this.value)}`;
    }
    if (isLocation(this.value)) {
      return `file:${basename(this.value.uri)}`;
    }
    if (isStringImplicitContextValue(this.value)) {
      if (this.value.name === void 0 && this.value.resourceUri === void 0) {
        throw new Error("ChatContextItem must have either a label or a resourceUri");
      }
      return this.value.name ?? basename(this.value.resourceUri);
    }
    return "implicit";
  }
  get modelDescription() {
    if (URI.isUri(this.value)) {
      return `User's active file`;
    } else if (isStringImplicitContextValue(this.value)) {
      if (this.value.name === void 0 && this.value.resourceUri === void 0) {
        throw new Error("ChatContextItem must have either a label or a resourceUri");
      }
      const contextName = this.value.name ?? basename(this.value.resourceUri);
      return this.value.modelDescription ?? `User's active context from ${contextName}`;
    } else if (this._isSelection) {
      return `User's active selection`;
    } else {
      return `User's current visible code`;
    }
  }
  get isSelection() {
    return this._isSelection;
  }
  get value() {
    return this._value;
  }
  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    this._enabled = value;
    this._onDidChangeValue.fire();
  }
  get uri() {
    if (isStringImplicitContextValue(this.value)) {
      return this.value.uri;
    }
    return this._uri;
  }
  get iconPath() {
    if (isStringImplicitContextValue(this.value)) {
      return this.value.iconPath;
    }
    return void 0;
  }
  setValue(value, isSelection) {
    if (isStringImplicitContextValue(value)) {
      this._value = value;
    } else {
      this._value = value;
      this._uri = URI.isUri(value) ? value : value?.uri;
    }
    this._isSelection = isSelection;
    this._onDidChangeValue.fire();
  }
  toBaseEntries() {
    if (!this.value) {
      return [];
    }
    if (URI.isUri(this.value) && this.value.scheme === Schemas.vscodeBrowser) {
      return [];
    }
    if (isStringImplicitContextValue(this.value)) {
      return [
        {
          kind: "string",
          id: this.id,
          name: this.name,
          value: this.value.value ?? this.name,
          modelDescription: this.modelDescription,
          iconPath: this.value.iconPath,
          uri: this.value.uri,
          resourceUri: this.value.resourceUri,
          handle: this.value.handle,
          commandId: this.value.commandId
        }
      ];
    }
    return [{
      kind: "file",
      id: this.id,
      name: this.name,
      value: this.value,
      modelDescription: this.modelDescription
    }];
  }
}
export {
  ChatImplicitContext,
  ChatImplicitContextContribution,
  ChatImplicitContexts
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0SW1wbGljaXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiwgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JzT3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IFdlYnZpZXdFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9yLmpzJztcbmltcG9ydCB7IFdlYnZpZXdJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RJbXBsaWNpdFZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUsIFN0cmluZ0NoYXRDb250ZXh0VmFsdWUsIENoYXRDb250ZXh0SWNvblBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lnbm9yZWRGaWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29udGV4dENvbnRyaWIvY2hhdENvbnRleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRJbXBsaWNpdENvbnRleHRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LmltcGxpY2l0Q29udGV4dCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudENhbmNlbFRva2VuU291cmNlOiBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT47XG5cblx0cHJpdmF0ZSBfaW1wbGljaXRDb250ZXh0RW5hYmxlbWVudDogeyBbbW9kZTogc3RyaW5nXTogc3RyaW5nIH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlnbm9yZWRGaWxlc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRDb250ZXh0U2VydmljZTogSUNoYXRDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRDYW5jZWxUb2tlblNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdFx0dGhpcy5faW1wbGljaXRDb250ZXh0RW5hYmxlbWVudCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBbbW9kZTogc3RyaW5nXTogc3RyaW5nIH0+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5lbmFibGVkJyk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLFxuXHRcdFx0KCgpID0+IHtcblx0XHRcdFx0YWN0aXZlRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuZmluZEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCxcblx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UsXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24sXG5cdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UpLFxuXHRcdFx0XHRcdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0NTAwKSgoKSA9PiB0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCgpKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHRoaXMuZmluZEFjdGl2ZU5vdGVib29rRWRpdG9yKCk7XG5cdFx0XHRcdGlmIChub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUNlbGxEaXNwb3NhYmxlcyA9IGFjdGl2ZUVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvckRpc3Bvc2FibGVzLmFkZChub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZUFjdGl2ZUNlbGwoKCkgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aXZlQ2VsbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRpZiAoY29kZUVkaXRvciAmJiBjb2RlRWRpdG9yLmdldE1vZGVsKCk/LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRcdFx0XHRcdGFjdGl2ZUNlbGxEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRcdFx0RXZlbnQuYW55KFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y29kZUVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdGNvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UpLFxuXHRcdFx0XHRcdFx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHQ1MDApKCgpID0+IHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UoXG5cdFx0XHRcdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwsXG5cdFx0XHRcdFx0XHRcdG5vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlQWN0aXZlQ2VsbFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdDUwMCkoKCkgPT4gdGhpcy51cGRhdGVJbXBsaWNpdENvbnRleHQoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdlYnZpZXdFZGl0b3IgPSB0aGlzLmZpbmRBY3RpdmVXZWJ2aWV3RWRpdG9yKCk7XG5cdFx0XHRcdGlmICh3ZWJ2aWV3RWRpdG9yKSB7XG5cdFx0XHRcdFx0YWN0aXZlRWRpdG9yRGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlKCh3ZWJ2aWV3RWRpdG9yLmlucHV0IGFzIFdlYnZpZXdJbnB1dCkud2Vidmlldy5vbk1lc3NhZ2UsICgpID0+IHVuZGVmaW5lZCwgNTAwKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCgpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCk7XG5cdFx0XHR9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0dGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlSW1wbGljaXRDb250ZXh0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2NoYXQuaW1wbGljaXRDb250ZXh0LmVuYWJsZWQnKSkge1xuXHRcdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHRFbmFibGVtZW50ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFttb2RlOiBzdHJpbmddOiBzdHJpbmcgfT4oJ2NoYXQuaW1wbGljaXRDb250ZXh0LmVuYWJsZWQnKTtcblx0XHRcdFx0dGhpcy51cGRhdGVJbXBsaWNpdENvbnRleHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoKHsgY2hhdFNlc3Npb25SZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF3aWRnZXQ/LmlucHV0LmltcGxpY2l0Q29udGV4dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faW1wbGljaXRDb250ZXh0RW5hYmxlbWVudFt3aWRnZXQubG9jYXRpb25dID09PSAnZmlyc3QnICYmIHdpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCkubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQuc2V0VmFsdWVzKFtdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldChhc3luYyAod2lkZ2V0KSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUltcGxpY2l0Q29udGV4dCh3aWRnZXQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFjdGl2ZUNvZGVFZGl0b3IoKTogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWw/LnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gY29kZUVkaXRvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjb2RlT3JEaWZmRWRpdG9yIG9mIHRoaXMuZWRpdG9yU2VydmljZS5nZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGNvZGVPckRpZmZFZGl0b3IpO1xuXHRcdFx0aWYgKCFjb2RlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gY29kZUVkaXRvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFjdGl2ZVdlYnZpZXdFZGl0b3IoKTogV2Vidmlld0VkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCBpbnN0YW5jZW9mIFdlYnZpZXdJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvclBhbmUgYXMgV2Vidmlld0VkaXRvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFjdGl2ZUJyb3dzZXJFZGl0b3IoKTogQnJvd3NlckVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmU/LmlucHV0IGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yUGFuZS5pbnB1dDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmluZEFjdGl2ZU5vdGVib29rRWRpdG9yKCk6IElOb3RlYm9va0VkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVJbXBsaWNpdENvbnRleHQodXBkYXRlV2lkZ2V0PzogSUNoYXRXaWRnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYW5jZWxUb2tlblNvdXJjZSA9IHRoaXMuX2N1cnJlbnRDYW5jZWxUb2tlblNvdXJjZS52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLmZpbmRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjb2RlRWRpdG9yPy5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGNvZGVFZGl0b3I/LmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IHVzZVN1Z2dlc3RlZENvbnRleHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jyk7XG5cdFx0bGV0IG5ld1ZhbHVlOiBMb2NhdGlvbiB8IFVSSSB8IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzU2VsZWN0aW9uID0gZmFsc2U7XG5cblx0XHRsZXQgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcm92aWRlckNvbnRleHQ6IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbiAmJiAhc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRuZXdWYWx1ZSA9IHsgdXJpOiBtb2RlbC51cmksIHJhbmdlOiBzZWxlY3Rpb24gfSBzYXRpc2ZpZXMgTG9jYXRpb247XG5cdFx0XHRcdGlzU2VsZWN0aW9uID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh1c2VTdWdnZXN0ZWRDb250ZXh0KSB7XG5cdFx0XHRcdFx0bmV3VmFsdWUgPSBtb2RlbC51cmk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IGNvZGVFZGl0b3I/LmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRcdFx0XHRpZiAodmlzaWJsZVJhbmdlcyAmJiB2aXNpYmxlUmFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdC8vIE1lcmdlIHZpc2libGUgcmFuZ2VzLiBNYXliZSB0aGUgcmVmZXJlbmNlIHZhbHVlIGNvdWxkIGFjdHVhbGx5IGJlIGFuIGFycmF5IG9mIExvY2F0aW9ucz9cblx0XHRcdFx0XHRcdC8vIFNvbWV0aGluZyBsaWtlIGEgTG9jYXRpb24gd2l0aCBhbiBhcnJheSBvZiBSYW5nZXM/XG5cdFx0XHRcdFx0XHRsZXQgcmFuZ2UgPSB2aXNpYmxlUmFuZ2VzWzBdO1xuXHRcdFx0XHRcdFx0dmlzaWJsZVJhbmdlcy5zbGljZSgxKS5mb3JFYWNoKHIgPT4ge1xuXHRcdFx0XHRcdFx0XHRyYW5nZSA9IHJhbmdlLnBsdXNSYW5nZShyKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bmV3VmFsdWUgPSB7IHVyaTogbW9kZWwudXJpLCByYW5nZSB9IHNhdGlzZmllcyBMb2NhdGlvbjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bmV3VmFsdWUgPSBtb2RlbC51cmk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBBbHNvIGNoZWNrIGlmIGEgY2hhdCBjb250ZXh0IHByb3ZpZGVyIGNhbiBwcm92aWRlIGFkZGl0aW9uYWwgY29udGV4dCBmb3IgdGhpcyB0ZXh0IGVkaXRvciByZXNvdXJjZVxuXHRcdFx0cHJvdmlkZXJDb250ZXh0ID0gYXdhaXQgdGhpcy5jaGF0Q29udGV4dFNlcnZpY2UuY29udGV4dEZvclJlc291cmNlKG1vZGVsLnVyaSwgbGFuZ3VhZ2VJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSB0aGlzLmZpbmRBY3RpdmVOb3RlYm9va0VkaXRvcigpO1xuXHRcdGlmIChub3RlYm9va0VkaXRvcj8uaXNSZXBsSGlzdG9yeSkge1xuXHRcdFx0Ly8gVGhlIGNoYXQgQVBJcyBkb24ndCB3b3JrIHdlbGwgd2l0aCBJbnRlcmFjdGl2ZSBXaW5kb3dzXG5cdFx0XHRuZXdWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKG5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVDZWxsID0gbm90ZWJvb2tFZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdFx0aWYgKGFjdGl2ZUNlbGwpIHtcblx0XHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBjb2RlRWRpdG9yPy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IGNvZGVFZGl0b3I/LmdldFZpc2libGVSYW5nZXMoKSB8fCBbXTtcblx0XHRcdFx0bmV3VmFsdWUgPSBhY3RpdmVDZWxsLnVyaTtcblx0XHRcdFx0Y29uc3QgY2VsbE1vZGVsID0gY29kZUVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKGNlbGxNb2RlbCAmJiBpc0VxdWFsKGNlbGxNb2RlbC51cmksIGFjdGl2ZUNlbGwudXJpKSkge1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdG5ld1ZhbHVlID0geyB1cmk6IGFjdGl2ZUNlbGwudXJpLCByYW5nZTogc2VsZWN0aW9uIH0gc2F0aXNmaWVzIExvY2F0aW9uO1xuXHRcdFx0XHRcdFx0aXNTZWxlY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodmlzaWJsZVJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHQvLyBJZiB0aGUgZW50aXJlIGNlbGwgaXMgdmlzaWJsZSwganVzdCB1c2UgdGhlIGNlbGwgVVJJLCBubyBuZWVkIHRvIHNwZWNpZnkgcmFuZ2UuXG5cdFx0XHRcdFx0XHRpZiAoIWlzRW50aXJlQ2VsbFZpc2libGUoY2VsbE1vZGVsLCB2aXNpYmxlUmFuZ2VzKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBNZXJnZSB2aXNpYmxlIHJhbmdlcy4gTWF5YmUgdGhlIHJlZmVyZW5jZSB2YWx1ZSBjb3VsZCBhY3R1YWxseSBiZSBhbiBhcnJheSBvZiBMb2NhdGlvbnM/XG5cdFx0XHRcdFx0XHRcdC8vIFNvbWV0aGluZyBsaWtlIGEgTG9jYXRpb24gd2l0aCBhbiBhcnJheSBvZiBSYW5nZXM/XG5cdFx0XHRcdFx0XHRcdGxldCByYW5nZSA9IHZpc2libGVSYW5nZXNbMF07XG5cdFx0XHRcdFx0XHRcdHZpc2libGVSYW5nZXMuc2xpY2UoMSkuZm9yRWFjaChyID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSA9IHJhbmdlLnBsdXNSYW5nZShyKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdG5ld1ZhbHVlID0geyB1cmk6IGFjdGl2ZUNlbGwudXJpLCByYW5nZSB9IHNhdGlzZmllcyBMb2NhdGlvbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5ld1ZhbHVlID0gbm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy51cmk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2Vidmlld0VkaXRvciA9IHRoaXMuZmluZEFjdGl2ZVdlYnZpZXdFZGl0b3IoKTtcblx0XHRpZiAod2Vidmlld0VkaXRvcj8uaW5wdXQgaW5zdGFuY2VvZiBXZWJ2aWV3SW5wdXQgJiYgd2Vidmlld0VkaXRvci5pbnB1dC5yZXNvdXJjZSkge1xuXHRcdFx0Y29uc3Qgd2Vidmlld0NvbnRleHQgPSBhd2FpdCB0aGlzLmNoYXRDb250ZXh0U2VydmljZS5jb250ZXh0Rm9yUmVzb3VyY2Uod2Vidmlld0VkaXRvci5pbnB1dC5yZXNvdXJjZSwgdW5kZWZpbmVkLCB3ZWJ2aWV3RWRpdG9yLmlucHV0LnZpZXdUeXBlKTtcblx0XHRcdGlmICh3ZWJ2aWV3Q29udGV4dCkge1xuXHRcdFx0XHRuZXdWYWx1ZSA9IHdlYnZpZXdDb250ZXh0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGJyb3dzZXIgPSB0aGlzLmZpbmRBY3RpdmVCcm93c2VyRWRpdG9yKCk7XG5cdFx0aWYgKGJyb3dzZXI/LmlzU2hhcmluZ0F2YWlsYWJsZSAmJiB1c2VTdWdnZXN0ZWRDb250ZXh0KSB7XG5cdFx0XHRuZXdWYWx1ZSA9IGJyb3dzZXIucmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gbmV3VmFsdWUgaW5zdGFuY2VvZiBVUkkgPyBuZXdWYWx1ZSA6IChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKG5ld1ZhbHVlKSA/IHVuZGVmaW5lZCA6IG5ld1ZhbHVlPy51cmkpO1xuXHRcdGlmICh1cmkgJiYgKFxuXHRcdFx0YXdhaXQgdGhpcy5pZ25vcmVkRmlsZXNTZXJ2aWNlLmZpbGVJc0lnbm9yZWQodXJpLCBjYW5jZWxUb2tlblNvdXJjZS50b2tlbikgfHxcblx0XHRcdHVyaS5wYXRoLmVuZHNXaXRoKCcuY29waWxvdG1kJykpXG5cdFx0KSB7XG5cdFx0XHRuZXdWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoY2FuY2VsVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXRzID0gdXBkYXRlV2lkZ2V0ID8gW3VwZGF0ZVdpZGdldF0gOiBbLi4udGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRzQnlMb2NhdGlvbnMoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksIC4uLnRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0c0J5TG9jYXRpb25zKENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSldO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHdpZGdldHMpIHtcblx0XHRcdGlmICghd2lkZ2V0LmlucHV0LmltcGxpY2l0Q29udGV4dCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLl9pbXBsaWNpdENvbnRleHRFbmFibGVtZW50W3dpZGdldC5sb2NhdGlvbl07XG5cdFx0XHRjb25zdCBpc0ZpcnN0SW50ZXJhY3Rpb24gPSB3aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpLmxlbmd0aCA9PT0gMDtcblx0XHRcdGlmICgoc2V0dGluZyA9PT0gJ2Fsd2F5cycgfHwgc2V0dGluZyA9PT0gJ2ZpcnN0JyAmJiBpc0ZpcnN0SW50ZXJhY3Rpb24pKSB7XG5cdFx0XHRcdC8vIFdoZW4gdGhlcmUncyBhIG5vbi1jb2RlIGFjdGl2ZSBlZGl0b3IgKGUuZy4gU2V0dGluZ3MgaXMgb3BlbiksIHByZXNlcnZlXG5cdFx0XHRcdC8vIGV4aXN0aW5nIHZhbHVlcyBzbyB0aGUgYXR0YWNobWVudCBiYXIgc3RheXMgdmlzaWJsZS5cblx0XHRcdFx0Ly8gQnV0IHdoZW4gdGhlcmUncyBubyBhY3RpdmUgZWRpdG9yIGF0IGFsbCwgY2xlYXIgdGhlIHZhbHVlcy5cblx0XHRcdFx0Y29uc3QgaGFzQWN0aXZlRWRpdG9yID0gISF0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdFx0XHRpZiAobmV3VmFsdWUgIT09IHVuZGVmaW5lZCB8fCAhd2lkZ2V0LmlucHV0LmltcGxpY2l0Q29udGV4dC5oYXNWYWx1ZSB8fCAhaGFzQWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdFx0d2lkZ2V0LmlucHV0LmltcGxpY2l0Q29udGV4dC5zZXRWYWx1ZXMoW3sgdmFsdWU6IG5ld1ZhbHVlLCBpc1NlbGVjdGlvbiB9LCB7IHZhbHVlOiBwcm92aWRlckNvbnRleHQsIGlzU2VsZWN0aW9uOiBmYWxzZSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZGdldC5pbnB1dC5pbXBsaWNpdENvbnRleHQuc2V0VmFsdWVzKFtdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNFbnRpcmVDZWxsVmlzaWJsZShjZWxsTW9kZWw6IElUZXh0TW9kZWwsIHZpc2libGVSYW5nZXM6IElSYW5nZVtdKTogYm9vbGVhbiB7XG5cdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA9PT0gMSAmJiB2aXNpYmxlUmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlciA9PT0gMSAmJiB2aXNpYmxlUmFuZ2VzWzBdLnN0YXJ0Q29sdW1uID09PSAxICYmIHZpc2libGVSYW5nZXNbMF0uZW5kTGluZU51bWJlciA9PT0gY2VsbE1vZGVsLmdldExpbmVDb3VudCgpICYmIHZpc2libGVSYW5nZXNbMF0uZW5kQ29sdW1uID09PSBjZWxsTW9kZWwuZ2V0TGluZU1heENvbHVtbih2aXNpYmxlUmFuZ2VzWzBdLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5pbnRlcmZhY2UgSW1wbGljaXRDb250ZXh0V2l0aFNlbGVjdGlvbiB7XG5cdHZhbHVlOiBMb2NhdGlvbiB8IFVSSSB8IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ7XG5cdGlzU2VsZWN0aW9uOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEltcGxpY2l0Q29udGV4dHMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudDtcblxuXHRwcml2YXRlIF92YWx1ZXM6IERpc3Bvc2FibGVNYXA8Q2hhdEltcGxpY2l0Q29udGV4dCwgRGlzcG9zYWJsZVN0b3JlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXNEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfZW5hYmxlZCA9IGZhbHNlO1xuXG5cdHNldFZhbHVlcyh2YWx1ZXM6IEltcGxpY2l0Q29udGV4dFdpdGhTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdmFsdWVzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXG5cdFx0aWYgKCF2YWx1ZXMgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmaW5lZFZhbHVlcyA9IHZhbHVlcy5maWx0ZXIodmFsdWUgPT4gdmFsdWUudmFsdWUgIT09IHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiBkZWZpbmVkVmFsdWVzKSB7XG5cdFx0XHRjb25zdCBpbXBsaWNpdENvbnRleHQgPSBuZXcgQ2hhdEltcGxpY2l0Q29udGV4dCgpO1xuXHRcdFx0aW1wbGljaXRDb250ZXh0LnNldFZhbHVlKHZhbHVlLnZhbHVlLCB2YWx1ZS5pc1NlbGVjdGlvbik7XG5cdFx0XHRpbXBsaWNpdENvbnRleHQuZW5hYmxlZCA9IHRoaXMuX2VuYWJsZWQ7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGltcGxpY2l0Q29udGV4dC5vbkRpZENoYW5nZVZhbHVlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGltcGxpY2l0Q29udGV4dCk7XG5cdFx0XHR0aGlzLl92YWx1ZXMuc2V0KGltcGxpY2l0Q29udGV4dCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdH1cblxuXHRnZXQgdmFsdWVzKCk6IENoYXRJbXBsaWNpdENvbnRleHRbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fdmFsdWVzLmtleXMoKSk7XG5cdH1cblxuXHRnZXQgaGFzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl92YWx1ZXMua2V5cygpKS5zb21lKHYgPT4gdi5lbmFibGVkKTtcblx0fVxuXG5cdHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2VuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMudmFsdWVzLmZvckVhY2goKHYpID0+IHYuZW5hYmxlZCA9IGVuYWJsZWQpO1xuXHR9XG5cblx0Z2V0IGhhc1ZhbHVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5zb21lKHYgPT4gdi52YWx1ZSAhPT0gdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldCBoYXNOb25VcmkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzLnNvbWUodiA9PiB2LnZhbHVlICE9PSB1bmRlZmluZWQgJiYgIVVSSS5pc1VyaSh2LnZhbHVlKSk7XG5cdH1cblxuXHRnZXRMb2NhdGlvbnMoKTogTG9jYXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzLmZpbHRlcih2ID0+IGlzTG9jYXRpb24odi52YWx1ZSkpLm1hcCh2ID0+IHYudmFsdWUgYXMgTG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0VXJpcygpOiBVUklbXSB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzLmZpbHRlcih2ID0+IFVSSS5pc1VyaSh2LnZhbHVlKSkubWFwKHYgPT4gdi52YWx1ZSBhcyBVUkkpO1xuXHR9XG5cblx0Z2V0IGhhc05vblN0cmluZ0NvbnRleHQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzLnNvbWUodiA9PiB2LnZhbHVlICE9PSB1bmRlZmluZWQgJiYgIWlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodi52YWx1ZSkpO1xuXHR9XG5cblx0ZW5hYmxlZEJhc2VFbnRyaWVzKGluY2x1ZGVBbGxMb2NhdGlvbnM6IGJvb2xlYW4pOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlcy5mbGF0TWFwKHYgPT4ge1xuXHRcdFx0aWYgKHYuZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm4gdi50b0Jhc2VFbnRyaWVzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGluY2x1ZGVBbGxMb2NhdGlvbnMgJiYgaXNMb2NhdGlvbih2LnZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gdi50b0Jhc2VFbnRyaWVzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRJbXBsaWNpdENvbnRleHQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5IHtcblx0Z2V0IGlkKCkge1xuXHRcdGlmIChVUkkuaXNVcmkodGhpcy52YWx1ZSkpIHtcblx0XHRcdHJldHVybiAndnNjb2RlLmltcGxpY2l0LmZpbGUnO1xuXHRcdH0gZWxzZSBpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuICd2c2NvZGUuaW1wbGljaXQuc3RyaW5nJztcblx0XHR9IGVsc2UgaWYgKHRoaXMudmFsdWUpIHtcblx0XHRcdGlmICh0aGlzLl9pc1NlbGVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gJ3ZzY29kZS5pbXBsaWNpdC5zZWxlY3Rpb24nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuICd2c2NvZGUuaW1wbGljaXQudmlld3BvcnQnO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJ3ZzY29kZS5pbXBsaWNpdCc7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRpZiAoVVJJLmlzVXJpKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRpZiAodGhpcy52YWx1ZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQnJvd3Nlcikge1xuXHRcdFx0XHRyZXR1cm4gYGJyb3dzZXJgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGBmaWxlOiR7YmFzZW5hbWUodGhpcy52YWx1ZSl9YDtcblx0XHR9XG5cdFx0aWYgKGlzTG9jYXRpb24odGhpcy52YWx1ZSkpIHtcblx0XHRcdHJldHVybiBgZmlsZToke2Jhc2VuYW1lKHRoaXMudmFsdWUudXJpKX1gO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0aWYgKHRoaXMudmFsdWUubmFtZSA9PT0gdW5kZWZpbmVkICYmIHRoaXMudmFsdWUucmVzb3VyY2VVcmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXRDb250ZXh0SXRlbSBtdXN0IGhhdmUgZWl0aGVyIGEgbGFiZWwgb3IgYSByZXNvdXJjZVVyaScpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMudmFsdWUubmFtZSA/PyBiYXNlbmFtZSh0aGlzLnZhbHVlLnJlc291cmNlVXJpISk7XG5cdFx0fVxuXHRcdHJldHVybiAnaW1wbGljaXQnO1xuXHR9XG5cblx0cmVhZG9ubHkga2luZCA9ICdpbXBsaWNpdCc7XG5cblx0Z2V0IG1vZGVsRGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHRpZiAoVVJJLmlzVXJpKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gYFVzZXIncyBhY3RpdmUgZmlsZWA7XG5cdFx0fSBlbHNlIGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRpZiAodGhpcy52YWx1ZS5uYW1lID09PSB1bmRlZmluZWQgJiYgdGhpcy52YWx1ZS5yZXNvdXJjZVVyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2hhdENvbnRleHRJdGVtIG11c3QgaGF2ZSBlaXRoZXIgYSBsYWJlbCBvciBhIHJlc291cmNlVXJpJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZXh0TmFtZSA9IHRoaXMudmFsdWUubmFtZSA/PyBiYXNlbmFtZSh0aGlzLnZhbHVlLnJlc291cmNlVXJpISk7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWx1ZS5tb2RlbERlc2NyaXB0aW9uID8/IGBVc2VyJ3MgYWN0aXZlIGNvbnRleHQgZnJvbSAke2NvbnRleHROYW1lfWA7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9pc1NlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGBVc2VyJ3MgYWN0aXZlIHNlbGVjdGlvbmA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBgVXNlcidzIGN1cnJlbnQgdmlzaWJsZSBjb2RlYDtcblx0XHR9XG5cdH1cblxuXHRyZWFkb25seSBpc0ZpbGUgPSB0cnVlO1xuXG5cdHByaXZhdGUgX2lzU2VsZWN0aW9uID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgaXNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzU2VsZWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudDtcblxuXHRwcml2YXRlIF92YWx1ZTogTG9jYXRpb24gfCBVUkkgfCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHwgdW5kZWZpbmVkO1xuXHRnZXQgdmFsdWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlZCA9IGZhbHNlO1xuXHRnZXQgZW5hYmxlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZW5hYmxlZCA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdGdldCB1cmkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSh0aGlzLnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsdWUudXJpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXJpO1xuXHR9XG5cblx0Z2V0IGljb25QYXRoKCk6IENoYXRDb250ZXh0SWNvblBhdGggfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKHRoaXMudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWx1ZS5pY29uUGF0aDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBMb2NhdGlvbiB8IFVSSSB8IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQsIGlzU2VsZWN0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodmFsdWUpKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fdXJpID0gVVJJLmlzVXJpKHZhbHVlKSA/IHZhbHVlIDogdmFsdWU/LnVyaTtcblx0XHR9XG5cdFx0dGhpcy5faXNTZWxlY3Rpb24gPSBpc1NlbGVjdGlvbjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyB0b0Jhc2VFbnRyaWVzKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0aWYgKCF0aGlzLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLnZhbHVlKSAmJiB0aGlzLnZhbHVlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodGhpcy52YWx1ZSkpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHRcdFx0dmFsdWU6IHRoaXMudmFsdWUudmFsdWUgPz8gdGhpcy5uYW1lLFxuXHRcdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHRoaXMubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdFx0XHRpY29uUGF0aDogdGhpcy52YWx1ZS5pY29uUGF0aCxcblx0XHRcdFx0XHR1cmk6IHRoaXMudmFsdWUudXJpLFxuXHRcdFx0XHRcdHJlc291cmNlVXJpOiB0aGlzLnZhbHVlLnJlc291cmNlVXJpLFxuXHRcdFx0XHRcdGhhbmRsZTogdGhpcy52YWx1ZS5oYW5kbGUsXG5cdFx0XHRcdFx0Y29tbWFuZElkOiB0aGlzLnZhbHVlLmNvbW1hbmRJZFxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdH1cblxuXHRcdHJldHVybiBbe1xuXHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUsXG5cdFx0XHR2YWx1ZTogdGhpcy52YWx1ZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHRoaXMubW9kZWxEZXNjcmlwdGlvbixcblx0XHR9XTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsU0FBUyxhQUFhO0FBQy9C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QUEsVUFDQyxNQUFNO0FBQUEsVUFDTixJQUFJLEtBQUs7QUFBQSxVQUNULE1BQU0sS0FBSztBQUFBLFVBQ1gsT0FBTyxLQUFLLE1BQU0sU0FBUyxLQUFLO0FBQUEsVUFDaEMsa0JBQWtCLEtBQUs7QUFBQSxVQUN2QixVQUFVLEtBQUssTUFBTTtBQUFBLFVBQ3JCLEtBQUssS0FBSyxNQUFNO0FBQUEsVUFDaEIsYUFBYSxLQUFLLE1BQU07QUFBQSxVQUN4QixRQUFRLEtBQUssTUFBTTtBQUFBLFVBQ25CLFdBQVcsS0FBSyxNQUFNO0FBQUEsUUFDdkI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sQ0FBQztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUs7QUFBQSxNQUNYLE9BQU8sS0FBSztBQUFBLE1BQ1osa0JBQWtCLEtBQUs7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRjtBQUVEOyIsCiAgIm5hbWVzIjogWyJjb2RlRWRpdG9yIiwgInNlbGVjdGlvbiJdCn0K
