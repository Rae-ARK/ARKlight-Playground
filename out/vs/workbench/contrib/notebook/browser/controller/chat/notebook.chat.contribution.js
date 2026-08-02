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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { codiconsLibrary } from "../../../../../../base/common/codiconsLibrary.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { IChatContextPickService } from "../../../../chat/browser/attachments/chatContextPickService.js";
import { ChatDynamicVariableModel } from "../../../../chat/browser/attachments/chatDynamicVariables.js";
import { computeCompletionRanges } from "../../../../chat/browser/widget/input/editor/chatInputCompletionUtils.js";
import { IChatAgentService } from "../../../../chat/common/participants/chatAgents.js";
import { ChatContextKeys } from "../../../../chat/common/actions/chatContextKeys.js";
import { chatVariableLeader } from "../../../../chat/common/requestParser/chatParserTypes.js";
import { ChatAgentLocation } from "../../../../chat/common/constants.js";
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from "../../../common/notebookContextKeys.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { createNotebookOutputVariableEntry, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST } from "../../contrib/chat/notebookChatUtils.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import * as icons from "../../notebookIcons.js";
import { getOutputViewModelFromId } from "../cellOutputActions.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "../coreActions.js";
import "./cellChatActions.js";
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from "./notebookChatContext.js";
const NotebookKernelVariableKey = "kernelVariable";
let NotebookChatContribution = class extends Disposable {
  constructor(contextKeyService, chatAgentService, editorService, chatWidgetService, notebookKernelService, languageFeaturesService, chatContextPickService) {
    super();
    this.editorService = editorService;
    this.chatWidgetService = chatWidgetService;
    this.notebookKernelService = notebookKernelService;
    this.languageFeaturesService = languageFeaturesService;
    this._register(chatContextPickService.registerChatContextItem(new KernelVariableContextPicker(this.editorService, this.notebookKernelService)));
    this._ctxHasProvider = CTX_NOTEBOOK_CHAT_HAS_AGENT.bindTo(contextKeyService);
    const updateNotebookAgentStatus = () => {
      const hasNotebookAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
      this._ctxHasProvider.set(hasNotebookAgent);
    };
    updateNotebookAgentStatus();
    this._register(chatAgentService.onDidChangeAgents(updateNotebookAgentStatus));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatKernelDynamicCompletions",
      triggerCharacters: [chatVariableLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.supportsFileReferences) {
          return null;
        }
        if (widget.location !== ChatAgentLocation.Notebook) {
          return null;
        }
        const variableNameDef = new RegExp(`${chatVariableLeader}\\w*`, "g");
        const range = computeCompletionRanges(model, position, variableNameDef, true);
        if (!range) {
          return null;
        }
        const result = { suggestions: [] };
        const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + `${chatVariableLeader}${NotebookKernelVariableKey}:`.length);
        result.suggestions.push({
          label: `${chatVariableLeader}${NotebookKernelVariableKey}`,
          insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:`,
          detail: localize("pickKernelVariableLabel", "Pick a variable from the kernel"),
          range,
          kind: CompletionItemKind.Text,
          command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: afterRange }] },
          sortText: "z"
        });
        await this.addKernelVariableCompletion(widget, result, range, token);
        return result;
      }
    }));
    NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.bindTo(contextKeyService).set(NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST);
  }
  async addKernelVariableCompletion(widget, result, info, token) {
    let pattern;
    if (info.varWord?.word && info.varWord.word.startsWith(chatVariableLeader)) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
    if (!notebook) {
      return;
    }
    const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
    const hasVariableProvider = selectedKernel?.hasVariableProvider;
    if (!hasVariableProvider) {
      return;
    }
    const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
    for await (const variable of variables) {
      if (pattern && !variable.name.toLowerCase().includes(pattern)) {
        continue;
      }
      result.suggestions.push({
        label: { label: variable.name, description: variable.type },
        insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:${variable.name} `,
        filterText: `${chatVariableLeader}${variable.name}`,
        range: info,
        kind: CompletionItemKind.Variable,
        sortText: "z",
        command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: info.insert, variable: variable.name }] },
        detail: variable.type,
        documentation: variable.value
      });
    }
  }
};
NotebookChatContribution.ID = "workbench.contrib.notebookChatContribution";
NotebookChatContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, INotebookKernelService),
  __decorateParam(5, ILanguageFeaturesService),
  __decorateParam(6, IChatContextPickService)
], NotebookChatContribution);
const _SelectAndInsertKernelVariableAction = class _SelectAndInsertKernelVariableAction extends Action2 {
  constructor() {
    super({
      id: _SelectAndInsertKernelVariableAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const notebookKernelService = accessor.get(INotebookKernelService);
    const quickInputService = accessor.get(IQuickInputService);
    const notebook = getNotebookEditorFromEditorPane(editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
    if (!notebook) {
      return;
    }
    const context = args[0];
    if (!context || !("widget" in context) || !("range" in context)) {
      return;
    }
    const widget = context.widget;
    const range = context.range;
    const variable = context.variable;
    if (variable !== void 0) {
      this.addVariableReference(widget, variable, range, false);
      return;
    }
    const selectedKernel = notebookKernelService.getMatchingKernel(notebook).selected;
    const hasVariableProvider = selectedKernel?.hasVariableProvider;
    if (!hasVariableProvider) {
      return;
    }
    const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
    const quickPickItems = [];
    for await (const variable2 of variables) {
      quickPickItems.push({
        label: variable2.name,
        description: variable2.value,
        detail: variable2.type
      });
    }
    const placeHolder = quickPickItems.length > 0 ? localize("selectKernelVariablePlaceholder", "Select a kernel variable") : localize("noKernelVariables", "No kernel variables found");
    const pickedVariable = await quickInputService.pick(quickPickItems, { placeHolder });
    if (!pickedVariable) {
      return;
    }
    this.addVariableReference(widget, pickedVariable.label, range, true);
  }
  addVariableReference(widget, variableName, range, updateText) {
    if (range) {
      const text = `#kernelVariable:${variableName}`;
      if (updateText) {
        const editor = widget.inputEditor;
        const success = editor.executeEdits("chatInsertFile", [{ range, text: text + " " }]);
        if (!success) {
          return;
        }
      }
      widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
        id: "vscode.notebook.variable",
        range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
        data: variableName,
        fullName: variableName,
        icon: codiconsLibrary.variable
      });
    } else {
      widget.attachmentModel.addContext({
        id: "vscode.notebook.variable",
        name: variableName,
        value: variableName,
        icon: codiconsLibrary.variable,
        kind: "generic"
      });
    }
  }
};
_SelectAndInsertKernelVariableAction.ID = "notebook.chat.selectAndInsertKernelVariable";
let SelectAndInsertKernelVariableAction = _SelectAndInsertKernelVariableAction;
let KernelVariableContextPicker = class {
  constructor(editorService, notebookKernelService) {
    this.editorService = editorService;
    this.notebookKernelService = notebookKernelService;
    this.type = "pickerPick";
    this.label = localize("chatContext.notebook.kernelVariable", "Kernel Variable...");
    this.icon = Codicon.serverEnvironment;
  }
  isEnabled(widget) {
    return widget.location === ChatAgentLocation.Notebook && Boolean(getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument);
  }
  asPicker() {
    const picks = (async () => {
      const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
      if (!notebook) {
        return [];
      }
      const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
      const hasVariableProvider = selectedKernel?.hasVariableProvider;
      if (!hasVariableProvider) {
        return [];
      }
      const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
      const result = [];
      for await (const variable of variables) {
        result.push({
          label: variable.name,
          description: variable.value,
          asAttachment: () => {
            return {
              kind: "generic",
              id: "vscode.notebook.variable",
              name: variable.name,
              value: variable.value,
              icon: codiconsLibrary.variable
            };
          }
        });
      }
      return result;
    })();
    return {
      placeholder: localize("chatContext.notebook.kernelVariable.placeholder", "Select a kernel variable"),
      picks
    };
  }
};
KernelVariableContextPicker = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, INotebookKernelService)
], KernelVariableContextPicker);
registerAction2(class AddCellOutputToChatAction extends Action2 {
  constructor() {
    super({
      id: "notebook.cellOutput.addToChat",
      title: localize("notebookActions.addOutputToChat", "Add Cell Output to Chat"),
      menu: {
        id: MenuId.NotebookOutputToolbar,
        when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, ContextKeyExpr.in(NOTEBOOK_CELL_OUTPUT_MIMETYPE.key, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.key)),
        order: 10,
        group: "notebook_chat_actions"
      },
      category: NOTEBOOK_ACTIONS_CATEGORY,
      icon: icons.copyIcon,
      precondition: ChatContextKeys.enabled
    });
  }
  getNoteboookEditor(editorService, outputContext) {
    if (outputContext && "notebookEditor" in outputContext) {
      return outputContext.notebookEditor;
    }
    return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  }
  async run(accessor, outputContext) {
    const notebookEditor = this.getNoteboookEditor(accessor.get(IEditorService), outputContext);
    if (!notebookEditor) {
      return;
    }
    let outputViewModel;
    if (outputContext && "outputId" in outputContext && typeof outputContext.outputId === "string") {
      outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
    } else if (outputContext && "outputViewModel" in outputContext) {
      outputViewModel = outputContext.outputViewModel;
    }
    if (!outputViewModel) {
      const activeCell = notebookEditor.getActiveCell();
      if (!activeCell) {
        return;
      }
      if (activeCell.focusedOutputId !== void 0) {
        outputViewModel = activeCell.outputsViewModels.find((output) => {
          return output.model.outputId === activeCell.focusedOutputId;
        });
      } else {
        outputViewModel = activeCell.outputsViewModels.find((output) => output.pickedMimeType?.isTrusted);
      }
    }
    if (!outputViewModel) {
      return;
    }
    const mimeType = outputViewModel.pickedMimeType?.mimeType;
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = await chatWidgetService.revealWidget();
    if (widget && mimeType && NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST.includes(mimeType)) {
      const entry = createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor);
      if (!entry) {
        return;
      }
      widget.attachmentModel.addContext(entry);
      (await chatWidgetService.revealWidget())?.focusInput();
    }
  }
});
registerAction2(SelectAndInsertKernelVariableAction);
registerWorkbenchContribution2(NotebookChatContribution.ID, NotebookChatContribution, WorkbenchPhase.BlockRestore);
export {
  SelectAndInsertKernelVariableAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJvbGxlci9jaGF0L25vdGVib29rLmNoYXQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNvZGljb25zTGlicmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zTGlicmFyeS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Db250ZXh0LCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrZXIsIElDaGF0Q29udGV4dFBpY2tlckl0ZW0sIElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlQ29tcGxldGlvblJhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dENvbXBsZXRpb25VdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGNoYXRWYXJpYWJsZUxlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfSEFTX09VVFBVVFMsIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVfVFlQRV9MSVNUX0ZPUl9DSEFULCBOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FVFlQRSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRV9UWVBFX0xJU1RfRk9SX0NIQVRfQ09OU1QgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvbm90ZWJvb2tDaGF0VXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSwgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuLi8uLi9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IGdldE91dHB1dFZpZXdNb2RlbEZyb21JZCB9IGZyb20gJy4uL2NlbGxPdXRwdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va091dHB1dEFjdGlvbkNvbnRleHQsIE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUlkgfSBmcm9tICcuLi9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vY2VsbENoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENUWF9OT1RFQk9PS19DSEFUX0hBU19BR0VOVCB9IGZyb20gJy4vbm90ZWJvb2tDaGF0Q29udGV4dC5qcyc7XG5cbmNvbnN0IE5vdGVib29rS2VybmVsVmFyaWFibGVLZXkgPSAna2VybmVsVmFyaWFibGUnO1xuXG5jbGFzcyBOb3RlYm9va0NoYXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ub3RlYm9va0NoYXRDb250cmlidXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eEhhc1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdENvbnRleHRQaWNrU2VydmljZSBjaGF0Q29udGV4dFBpY2tTZXJ2aWNlOiBJQ2hhdENvbnRleHRQaWNrU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdENvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShuZXcgS2VybmVsVmFyaWFibGVDb250ZXh0UGlja2VyKHRoaXMuZWRpdG9yU2VydmljZSwgdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UpKSk7XG5cblx0XHR0aGlzLl9jdHhIYXNQcm92aWRlciA9IENUWF9OT1RFQk9PS19DSEFUX0hBU19BR0VOVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXBkYXRlTm90ZWJvb2tBZ2VudFN0YXR1cyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGhhc05vdGVib29rQWdlbnQgPSBCb29sZWFuKGNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rKSk7XG5cdFx0XHR0aGlzLl9jdHhIYXNQcm92aWRlci5zZXQoaGFzTm90ZWJvb2tBZ2VudCk7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZU5vdGVib29rQWdlbnRTdGF0dXMoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKHVwZGF0ZU5vdGVib29rQWdlbnRTdGF0dXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdjaGF0S2VybmVsRHluYW1pY0NvbXBsZXRpb25zJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdFZhcmlhYmxlTGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC5zdXBwb3J0c0ZpbGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdmFyaWFibGVOYW1lRGVmID0gbmV3IFJlZ0V4cChgJHtjaGF0VmFyaWFibGVMZWFkZXJ9XFxcXHcqYCwgJ2cnKTtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIHZhcmlhYmxlTmFtZURlZiwgdHJ1ZSk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogQ29tcGxldGlvbkxpc3QgPSB7IHN1Z2dlc3Rpb25zOiBbXSB9O1xuXG5cdFx0XHRcdGNvbnN0IGFmdGVyUmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbiArIGAke2NoYXRWYXJpYWJsZUxlYWRlcn0ke05vdGVib29rS2VybmVsVmFyaWFibGVLZXl9OmAubGVuZ3RoKTtcblx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9JHtOb3RlYm9va0tlcm5lbFZhcmlhYmxlS2V5fWAsXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfSR7Tm90ZWJvb2tLZXJuZWxWYXJpYWJsZUtleX06YCxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdwaWNrS2VybmVsVmFyaWFibGVMYWJlbCcsIFwiUGljayBhIHZhcmlhYmxlIGZyb20gdGhlIGtlcm5lbFwiKSxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRjb21tYW5kOiB7IGlkOiBTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbi5JRCwgdGl0bGU6IFNlbGVjdEFuZEluc2VydEtlcm5lbFZhcmlhYmxlQWN0aW9uLklELCBhcmd1bWVudHM6IFt7IHdpZGdldCwgcmFuZ2U6IGFmdGVyUmFuZ2UgfV0gfSxcblx0XHRcdFx0XHRzb3J0VGV4dDogJ3onXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuYWRkS2VybmVsVmFyaWFibGVDb21wbGV0aW9uKHdpZGdldCwgcmVzdWx0LCByYW5nZSwgdG9rZW4pO1xuXG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gb3V0cHV0IGNvbnRleHRcblx0XHROT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FX1RZUEVfTElTVF9GT1JfQ0hBVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldChOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FX1RZUEVfTElTVF9GT1JfQ0hBVF9DT05TVCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZEtlcm5lbFZhcmlhYmxlQ29tcGxldGlvbih3aWRnZXQ6IElDaGF0V2lkZ2V0LCByZXN1bHQ6IENvbXBsZXRpb25MaXN0LCBpbmZvOiB7IGluc2VydDogUmFuZ2U7IHJlcGxhY2U6IFJhbmdlOyB2YXJXb3JkOiBJV29yZEF0UG9zaXRpb24gfCBudWxsIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGxldCBwYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGluZm8udmFyV29yZD8ud29yZCAmJiBpbmZvLnZhcldvcmQud29yZC5zdGFydHNXaXRoKGNoYXRWYXJpYWJsZUxlYWRlcikpIHtcblx0XHRcdHBhdHRlcm4gPSBpbmZvLnZhcldvcmQud29yZC50b0xvd2VyQ2FzZSgpLnNsaWNlKDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk/LmdldFZpZXdNb2RlbCgpPy5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkS2VybmVsID0gdGhpcy5ub3RlYm9va0tlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwobm90ZWJvb2spLnNlbGVjdGVkO1xuXHRcdGNvbnN0IGhhc1ZhcmlhYmxlUHJvdmlkZXIgPSBzZWxlY3RlZEtlcm5lbD8uaGFzVmFyaWFibGVQcm92aWRlcjtcblxuXHRcdGlmICghaGFzVmFyaWFibGVQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHNlbGVjdGVkS2VybmVsLnByb3ZpZGVWYXJpYWJsZXMobm90ZWJvb2sudXJpLCB1bmRlZmluZWQsICduYW1lZCcsIDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Zm9yIGF3YWl0IChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmIChwYXR0ZXJuICYmICF2YXJpYWJsZS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocGF0dGVybikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHZhcmlhYmxlLm5hbWUsIGRlc2NyaXB0aW9uOiB2YXJpYWJsZS50eXBlIH0sXG5cdFx0XHRcdGluc2VydFRleHQ6IGAke2NoYXRWYXJpYWJsZUxlYWRlcn0ke05vdGVib29rS2VybmVsVmFyaWFibGVLZXl9OiR7dmFyaWFibGUubmFtZX0gYCxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfSR7dmFyaWFibGUubmFtZX1gLFxuXHRcdFx0XHRyYW5nZTogaW5mbyxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlLFxuXHRcdFx0XHRzb3J0VGV4dDogJ3onLFxuXHRcdFx0XHRjb21tYW5kOiB7IGlkOiBTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbi5JRCwgdGl0bGU6IFNlbGVjdEFuZEluc2VydEtlcm5lbFZhcmlhYmxlQWN0aW9uLklELCBhcmd1bWVudHM6IFt7IHdpZGdldCwgcmFuZ2U6IGluZm8uaW5zZXJ0LCB2YXJpYWJsZTogdmFyaWFibGUubmFtZSB9XSB9LFxuXHRcdFx0XHRkZXRhaWw6IHZhcmlhYmxlLnR5cGUsXG5cdFx0XHRcdGRvY3VtZW50YXRpb246IHZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0QW5kSW5zZXJ0S2VybmVsVmFyaWFibGVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogJycgLy8gbm90IGRpc3BsYXllZFxuXHRcdH0pO1xuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ25vdGVib29rLmNoYXQuc2VsZWN0QW5kSW5zZXJ0S2VybmVsVmFyaWFibGUnO1xuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tLZXJuZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RlYm9va0tlcm5lbFNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRjb25zdCBub3RlYm9vayA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKT8uZ2V0Vmlld01vZGVsKCk/Lm5vdGVib29rRG9jdW1lbnQ7XG5cblx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgeyB3aWRnZXQ6IElDaGF0V2lkZ2V0OyByYW5nZT86IFJhbmdlOyB2YXJpYWJsZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGlmICghY29udGV4dCB8fCAhKCd3aWRnZXQnIGluIGNvbnRleHQpIHx8ICEoJ3JhbmdlJyBpbiBjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQud2lkZ2V0O1xuXHRcdGNvbnN0IHJhbmdlID0gY29udGV4dC5yYW5nZTtcblx0XHRjb25zdCB2YXJpYWJsZSA9IGNvbnRleHQudmFyaWFibGU7XG5cblx0XHRpZiAodmFyaWFibGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5hZGRWYXJpYWJsZVJlZmVyZW5jZSh3aWRnZXQsIHZhcmlhYmxlLCByYW5nZSwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGVkS2VybmVsID0gbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKS5zZWxlY3RlZDtcblx0XHRjb25zdCBoYXNWYXJpYWJsZVByb3ZpZGVyID0gc2VsZWN0ZWRLZXJuZWw/Lmhhc1ZhcmlhYmxlUHJvdmlkZXI7XG5cblx0XHRpZiAoIWhhc1ZhcmlhYmxlUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2YXJpYWJsZXMgPSBzZWxlY3RlZEtlcm5lbC5wcm92aWRlVmFyaWFibGVzKG5vdGVib29rLnVyaSwgdW5kZWZpbmVkLCAnbmFtZWQnLCAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHF1aWNrUGlja0l0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIGF3YWl0IChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdHF1aWNrUGlja0l0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogdmFyaWFibGUubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0XHRkZXRhaWw6IHZhcmlhYmxlLnR5cGUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwbGFjZUhvbGRlciA9IHF1aWNrUGlja0l0ZW1zLmxlbmd0aCA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ3NlbGVjdEtlcm5lbFZhcmlhYmxlUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBhIGtlcm5lbCB2YXJpYWJsZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnbm9LZXJuZWxWYXJpYWJsZXMnLCBcIk5vIGtlcm5lbCB2YXJpYWJsZXMgZm91bmRcIik7XG5cblx0XHRjb25zdCBwaWNrZWRWYXJpYWJsZSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socXVpY2tQaWNrSXRlbXMsIHsgcGxhY2VIb2xkZXIgfSk7XG5cdFx0aWYgKCFwaWNrZWRWYXJpYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkVmFyaWFibGVSZWZlcmVuY2Uod2lkZ2V0LCBwaWNrZWRWYXJpYWJsZS5sYWJlbCwgcmFuZ2UsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRWYXJpYWJsZVJlZmVyZW5jZSh3aWRnZXQ6IElDaGF0V2lkZ2V0LCB2YXJpYWJsZU5hbWU6IHN0cmluZywgcmFuZ2U/OiBSYW5nZSwgdXBkYXRlVGV4dD86IGJvb2xlYW4pIHtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBgI2tlcm5lbFZhcmlhYmxlOiR7dmFyaWFibGVOYW1lfWA7XG5cblx0XHRcdGlmICh1cGRhdGVUZXh0KSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHdpZGdldC5pbnB1dEVkaXRvcjtcblx0XHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGVkaXRvci5leGVjdXRlRWRpdHMoJ2NoYXRJbnNlcnRGaWxlJywgW3sgcmFuZ2UsIHRleHQ6IHRleHQgKyAnICcgfV0pO1xuXHRcdFx0XHRpZiAoIXN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0d2lkZ2V0LmdldENvbnRyaWI8Q2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsPihDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQpPy5hZGRSZWZlcmVuY2Uoe1xuXHRcdFx0XHRpZDogJ3ZzY29kZS5ub3RlYm9vay52YXJpYWJsZScsXG5cdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogcmFuZ2Uuc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IHJhbmdlLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogcmFuZ2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHRkYXRhOiB2YXJpYWJsZU5hbWUsXG5cdFx0XHRcdGZ1bGxOYW1lOiB2YXJpYWJsZU5hbWUsXG5cdFx0XHRcdGljb246IGNvZGljb25zTGlicmFyeS52YXJpYWJsZSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoe1xuXHRcdFx0XHRpZDogJ3ZzY29kZS5ub3RlYm9vay52YXJpYWJsZScsXG5cdFx0XHRcdG5hbWU6IHZhcmlhYmxlTmFtZSxcblx0XHRcdFx0dmFsdWU6IHZhcmlhYmxlTmFtZSxcblx0XHRcdFx0aWNvbjogY29kaWNvbnNMaWJyYXJ5LnZhcmlhYmxlLFxuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYydcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBLZXJuZWxWYXJpYWJsZUNvbnRleHRQaWNrZXIgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3BpY2tlclBpY2snO1xuXHRyZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdjaGF0Q29udGV4dC5ub3RlYm9vay5rZXJuZWxWYXJpYWJsZScsICdLZXJuZWwgVmFyaWFibGUuLi4nKTtcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uc2VydmVyRW52aXJvbm1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElOb3RlYm9va0tlcm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0tlcm5lbFNlcnZpY2U6IElOb3RlYm9va0tlcm5lbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0aXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpOiBQcm9taXNlPGJvb2xlYW4+IHwgYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdpZGdldC5sb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2sgJiYgQm9vbGVhbihnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKT8uZ2V0Vmlld01vZGVsKCk/Lm5vdGVib29rRG9jdW1lbnQpO1xuXHR9XG5cblx0YXNQaWNrZXIoKTogSUNoYXRDb250ZXh0UGlja2VyIHtcblxuXHRcdGNvbnN0IHBpY2tzID0gKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKT8uZ2V0Vmlld01vZGVsKCk/Lm5vdGVib29rRG9jdW1lbnQ7XG5cblx0XHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxlY3RlZEtlcm5lbCA9IHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKS5zZWxlY3RlZDtcblx0XHRcdGNvbnN0IGhhc1ZhcmlhYmxlUHJvdmlkZXIgPSBzZWxlY3RlZEtlcm5lbD8uaGFzVmFyaWFibGVQcm92aWRlcjtcblxuXHRcdFx0aWYgKCFoYXNWYXJpYWJsZVByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdmFyaWFibGVzID0gc2VsZWN0ZWRLZXJuZWwucHJvdmlkZVZhcmlhYmxlcyhub3RlYm9vay51cmksIHVuZGVmaW5lZCwgJ25hbWVkJywgMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSUNoYXRDb250ZXh0UGlja2VyUGlja0l0ZW1bXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiB2YXJpYWJsZS5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB2YXJpYWJsZS52YWx1ZSxcblx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRcdFx0aWQ6ICd2c2NvZGUubm90ZWJvb2sudmFyaWFibGUnLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiB2YXJpYWJsZS5uYW1lLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogdmFyaWFibGUudmFsdWUsXG5cdFx0XHRcdFx0XHRcdGljb246IGNvZGljb25zTGlicmFyeS52YXJpYWJsZSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2NoYXRDb250ZXh0Lm5vdGVib29rLmtlcm5lbFZhcmlhYmxlLnBsYWNlaG9sZGVyJywgJ1NlbGVjdCBhIGtlcm5lbCB2YXJpYWJsZScpLFxuXHRcdFx0cGlja3Ncblx0XHR9O1xuXHR9XG59XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFkZENlbGxPdXRwdXRUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5jZWxsT3V0cHV0LmFkZFRvQ2hhdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5hZGRPdXRwdXRUb0NoYXQnLCBcIkFkZCBDZWxsIE91dHB1dCB0byBDaGF0XCIpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rT3V0cHV0VG9vbGJhcixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfSEFTX09VVFBVVFMsIENvbnRleHRLZXlFeHByLmluKE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVUWVBFLmtleSwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRV9UWVBFX0xJU1RfRk9SX0NIQVQua2V5KSksXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0Z3JvdXA6ICdub3RlYm9va19jaGF0X2FjdGlvbnMnXG5cdFx0XHR9LFxuXHRcdFx0Y2F0ZWdvcnk6IE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUlksXG5cdFx0XHRpY29uOiBpY29ucy5jb3B5SWNvbixcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Tm90ZWJvb29rRWRpdG9yKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBvdXRwdXRDb250ZXh0OiBJTm90ZWJvb2tPdXRwdXRBY3Rpb25Db250ZXh0IHwgeyBvdXRwdXRWaWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsIH0gfCB1bmRlZmluZWQpOiBJTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvdXRwdXRDb250ZXh0ICYmICdub3RlYm9va0VkaXRvcicgaW4gb3V0cHV0Q29udGV4dCkge1xuXHRcdFx0cmV0dXJuIG91dHB1dENvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0fVxuXHRcdHJldHVybiBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG91dHB1dENvbnRleHQ6IElOb3RlYm9va091dHB1dEFjdGlvbkNvbnRleHQgfCB7IG91dHB1dFZpZXdNb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gdGhpcy5nZXROb3RlYm9vb2tFZGl0b3IoYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgb3V0cHV0Q29udGV4dCk7XG5cblx0XHRpZiAoIW5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG91dHB1dFZpZXdNb2RlbDogSUNlbGxPdXRwdXRWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG91dHB1dENvbnRleHQgJiYgJ291dHB1dElkJyBpbiBvdXRwdXRDb250ZXh0ICYmIHR5cGVvZiBvdXRwdXRDb250ZXh0Lm91dHB1dElkID09PSAnc3RyaW5nJykge1xuXHRcdFx0b3V0cHV0Vmlld01vZGVsID0gZ2V0T3V0cHV0Vmlld01vZGVsRnJvbUlkKG91dHB1dENvbnRleHQub3V0cHV0SWQsIG5vdGVib29rRWRpdG9yKTtcblx0XHR9IGVsc2UgaWYgKG91dHB1dENvbnRleHQgJiYgJ291dHB1dFZpZXdNb2RlbCcgaW4gb3V0cHV0Q29udGV4dCkge1xuXHRcdFx0b3V0cHV0Vmlld01vZGVsID0gb3V0cHV0Q29udGV4dC5vdXRwdXRWaWV3TW9kZWw7XG5cdFx0fVxuXG5cdFx0aWYgKCFvdXRwdXRWaWV3TW9kZWwpIHtcblx0XHRcdC8vIG5vdCBhYmxlIHRvIGZpbmQgdGhlIG91dHB1dCBmcm9tIHRoZSBwcm92aWRlZCBjb250ZXh0LCB1c2UgdGhlIGFjdGl2ZSBjZWxsXG5cdFx0XHRjb25zdCBhY3RpdmVDZWxsID0gbm90ZWJvb2tFZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVDZWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGl2ZUNlbGwuZm9jdXNlZE91dHB1dElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0b3V0cHV0Vmlld01vZGVsID0gYWN0aXZlQ2VsbC5vdXRwdXRzVmlld01vZGVscy5maW5kKG91dHB1dCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG91dHB1dC5tb2RlbC5vdXRwdXRJZCA9PT0gYWN0aXZlQ2VsbC5mb2N1c2VkT3V0cHV0SWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0Vmlld01vZGVsID0gYWN0aXZlQ2VsbC5vdXRwdXRzVmlld01vZGVscy5maW5kKG91dHB1dCA9PiBvdXRwdXQucGlja2VkTWltZVR5cGU/LmlzVHJ1c3RlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFvdXRwdXRWaWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtaW1lVHlwZSA9IG91dHB1dFZpZXdNb2RlbC5waWNrZWRNaW1lVHlwZT8ubWltZVR5cGU7XG5cblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXHRcdGlmICh3aWRnZXQgJiYgbWltZVR5cGUgJiYgTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRV9UWVBFX0xJU1RfRk9SX0NIQVRfQ09OU1QuaW5jbHVkZXMobWltZVR5cGUpKSB7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gY3JlYXRlTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KG91dHB1dFZpZXdNb2RlbCwgbWltZVR5cGUsIG5vdGVib29rRWRpdG9yKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoZW50cnkpO1xuXHRcdFx0KGF3YWl0IGNoYXRXaWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpKT8uZm9jdXNJbnB1dCgpO1xuXHRcdH1cblx0fVxuXG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKFNlbGVjdEFuZEluc2VydEtlcm5lbFZhcmlhYmxlQWN0aW9uKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va0NoYXRDb250cmlidXRpb24uSUQsIE5vdGVib29rQ2hhdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGFBQWE7QUFFdEIsU0FBNEIsMEJBQTBDO0FBRXRFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLGdCQUE2QiwwQkFBMEI7QUFFaEUsU0FBUywwQkFBMEM7QUFDbkQsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUN2RixTQUFTLHNCQUFzQjtBQUMvQixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBaUYsK0JBQStCO0FBQ2hILFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCLDhDQUE4QyxxQ0FBcUM7QUFDdkgsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQ0FBbUMsMERBQTBEO0FBQ3RHLFNBQVMsdUNBQThFO0FBQ3ZGLFlBQVksV0FBVztBQUN2QixTQUFTLGdDQUFnQztBQUN6QyxTQUF1QyxpQ0FBaUM7QUFDeEUsT0FBTztBQUNQLFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0sNEJB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
