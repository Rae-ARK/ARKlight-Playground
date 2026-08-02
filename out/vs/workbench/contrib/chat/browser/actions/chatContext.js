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
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { isElectron } from "../../../../../base/common/platform.js";
import { localize } from "../../../../../nls.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { UntitledTextEditorInput } from "../../../../services/untitled/common/untitledTextEditorInput.js";
import { FileEditorInput } from "../../../files/browser/editors/fileEditorInput.js";
import { NotebookEditorInput } from "../../../notebook/common/notebookEditorInput.js";
import { IChatContextPickService } from "../attachments/chatContextPickService.js";
import { toToolSetVariableEntry, toToolVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { isToolSet, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { imageToHash, isImage } from "../widget/input/editor/chatPasteProviders.js";
import { convertBufferToScreenshotVariable } from "../attachments/chatScreenshotContext.js";
import { ChatInstructionsPickerPick } from "../promptSyntax/attachInstructionsAction.js";
import { IChatSessionsService, isAgentHostTarget } from "../../common/chatSessionsService.js";
import { getAgentSessionProviderIcon, AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { buildHostLocalEventsPath } from "../copilotCliEventsUri.js";
const EnableChatDebugToolsCommandId = "chat.enableDebugTools";
function shouldShowOpenEditorsContext(widget, hasEligibleOpenEditors) {
  if (!hasEligibleOpenEditors) {
    return false;
  }
  const sessionResource = widget.viewModel?.sessionResource;
  if (sessionResource && isAgentHostTarget(getChatSessionType(sessionResource))) {
    return false;
  }
  if (widget.lockedAgentId && isAgentHostTarget(widget.lockedAgentId)) {
    return false;
  }
  return true;
}
let ChatContextContributions = class extends Disposable {
  constructor(instantiationService, contextPickService) {
    super();
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ToolsContextPickerPick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ChatInstructionsPickerPick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(OpenEditorContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(ScreenshotContextValuePick)));
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(SessionReferenceContextPickerPick)));
  }
};
ChatContextContributions.ID = "chat.contextContributions";
ChatContextContributions = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IChatContextPickService)
], ChatContextContributions);
class ToolsContextPickerPick {
  constructor() {
    this.type = "pickerPick";
    this.label = localize("chatContext.tools", "Tools...");
    this.icon = Codicon.tools;
    this.ordinal = -500;
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsToolAttachments;
  }
  asPicker(widget) {
    const items = [];
    for (const [entry, enabled] of widget.input.selectedToolsModel.entriesMap.get()) {
      if (enabled) {
        if (isToolSet(entry)) {
          items.push({
            toolInfo: ToolDataSource.classify(entry.source),
            label: entry.referenceName,
            description: entry.description,
            asAttachment: () => toToolSetVariableEntry(entry)
          });
        } else {
          items.push({
            toolInfo: ToolDataSource.classify(entry.source),
            label: entry.toolReferenceName ?? entry.displayName,
            description: entry.userDescription ?? entry.modelDescription,
            asAttachment: () => toToolVariableEntry(entry)
          });
        }
      }
    }
    items.sort((a, b) => {
      let res = a.toolInfo.ordinal - b.toolInfo.ordinal;
      if (res === 0) {
        res = a.toolInfo.label.localeCompare(b.toolInfo.label);
      }
      if (res === 0) {
        res = a.label.localeCompare(b.label);
      }
      return res;
    });
    let lastGroupLabel;
    const picks = [];
    for (const item of items) {
      if (lastGroupLabel !== item.toolInfo.label) {
        picks.push({ type: "separator", label: item.toolInfo.label });
        lastGroupLabel = item.toolInfo.label;
      }
      picks.push(item);
    }
    return {
      placeholder: localize("chatContext.tools.placeholder", "Select a tool"),
      picks: Promise.resolve(picks)
    };
  }
}
let OpenEditorContextValuePick = class {
  constructor(_editorService, _labelService) {
    this._editorService = _editorService;
    this._labelService = _labelService;
    this.type = "valuePick";
    this.label = localize("chatContext.editors", "Open Editors");
    this.icon = Codicon.file;
    this.ordinal = 800;
  }
  isEnabled(widget) {
    const hasEligibleOpenEditors = this._editorService.editors.some((e) => e instanceof FileEditorInput || e instanceof DiffEditorInput || e instanceof UntitledTextEditorInput);
    return shouldShowOpenEditorsContext(widget, hasEligibleOpenEditors);
  }
  async asAttachment() {
    const result = [];
    for (const editor of this._editorService.editors) {
      if (!(editor instanceof FileEditorInput || editor instanceof DiffEditorInput || editor instanceof UntitledTextEditorInput || editor instanceof NotebookEditorInput)) {
        continue;
      }
      const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (!uri) {
        continue;
      }
      result.push({
        kind: "file",
        id: uri.toString(),
        value: uri,
        name: this._labelService.getUriBasenameLabel(uri)
      });
    }
    return result;
  }
};
OpenEditorContextValuePick = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, ILabelService)
], OpenEditorContextValuePick);
let ClipboardImageContextValuePick = class {
  constructor(_clipboardService) {
    this._clipboardService = _clipboardService;
    this.type = "valuePick";
    this.label = localize("imageFromClipboard", "Image from Clipboard");
    this.icon = Codicon.fileMedia;
  }
  async isEnabled(widget) {
    if (!widget.attachmentCapabilities.supportsImageAttachments) {
      return false;
    }
    if (!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision) {
      return false;
    }
    const imageData = await this._clipboardService.readImage();
    return isImage(imageData);
  }
  async asAttachment() {
    const fileBuffer = await this._clipboardService.readImage();
    return {
      id: await imageToHash(fileBuffer),
      name: localize("pastedImage", "Pasted Image"),
      fullName: localize("pastedImage", "Pasted Image"),
      value: fileBuffer,
      kind: "image"
    };
  }
};
ClipboardImageContextValuePick = __decorateClass([
  __decorateParam(0, IClipboardService)
], ClipboardImageContextValuePick);
let TerminalContext = class {
  constructor(_resource, _terminalService) {
    this._resource = _resource;
    this._terminalService = _terminalService;
    this.type = "valuePick";
    this.icon = Codicon.terminal;
    this.label = localize("terminal", "Terminal");
  }
  isEnabled(widget) {
    const terminal = this._terminalService.getInstanceFromResource(this._resource);
    return !!widget.attachmentCapabilities.supportsTerminalAttachments && terminal?.isDisposed === false;
  }
  async asAttachment(widget) {
    const terminal = this._terminalService.getInstanceFromResource(this._resource);
    if (!terminal) {
      return;
    }
    const params = new URLSearchParams(this._resource.query);
    const command = terminal.capabilities.get(TerminalCapability.CommandDetection)?.commands.find((cmd) => cmd.id === params.get("command"));
    if (!command) {
      return;
    }
    const attachment = {
      kind: "terminalCommand",
      id: `terminalCommand:${Date.now()}}`,
      value: this.asValue(command),
      name: command.command,
      command: command.command,
      output: command.getOutput(),
      exitCode: command.exitCode,
      resource: this._resource
    };
    const cleanup = new DisposableStore();
    let disposed = false;
    const disposeCleanup = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      cleanup.dispose();
    };
    cleanup.add(widget.attachmentModel.onDidChange((e) => {
      if (e.deleted.includes(attachment.id)) {
        disposeCleanup();
      }
    }));
    cleanup.add(terminal.onDisposed(() => {
      widget.attachmentModel.delete(attachment.id);
      widget.refreshParsedInput();
      disposeCleanup();
    }));
    return attachment;
  }
  asValue(command) {
    let value = `Command: ${command.command}`;
    const output = command.getOutput();
    if (output) {
      value += `
Output:
${output}`;
    }
    if (typeof command.exitCode === "number") {
      value += `
Exit Code: ${command.exitCode}`;
    }
    return value;
  }
};
TerminalContext = __decorateClass([
  __decorateParam(1, ITerminalService)
], TerminalContext);
let ScreenshotContextValuePick = class {
  constructor(_hostService) {
    this._hostService = _hostService;
    this.type = "valuePick";
    this.icon = Codicon.deviceCamera;
    this.label = isElectron ? localize("chatContext.attachScreenshot.labelElectron.Window", "Screenshot Window") : localize("chatContext.attachScreenshot.labelWeb", "Screenshot");
  }
  async isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsImageAttachments && !!widget.input.selectedLanguageModel.get()?.metadata.capabilities?.vision;
  }
  async asAttachment() {
    const blob = await this._hostService.getScreenshot();
    return blob && convertBufferToScreenshotVariable(blob);
  }
};
ScreenshotContextValuePick = __decorateClass([
  __decorateParam(0, IHostService)
], ScreenshotContextValuePick);
let SessionReferenceContextPickerPick = class {
  constructor(_chatSessionsService, _pathService, _remoteAgentHostService) {
    this._chatSessionsService = _chatSessionsService;
    this._pathService = _pathService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this.type = "pickerPick";
    this.icon = Codicon.comment;
    this.label = localize("chatContext.sessions", "Sessions...");
    this.ordinal = -400;
  }
  isEnabled(widget) {
    return widget.location === ChatAgentLocation.Chat;
  }
  asPicker(widget) {
    const currentSessionResource = widget.viewModel?.sessionResource;
    const onlyShowAttachableCopilotCliSessions = !!currentSessionResource && isAgentHostTarget(getChatSessionType(currentSessionResource));
    return {
      placeholder: localize("chatContext.sessions.placeholder", "Select a session"),
      picks: (async () => {
        const picks = [];
        const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.Claude, AgentSessionProviders.AgentHostCopilot];
        for await (const group of this._chatSessionsService.getChatSessionItems(sessionProviderFilter, CancellationToken.None)) {
          const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
          for (const item of group.items) {
            if (currentSessionResource && item.resource.toString() === currentSessionResource.toString()) {
              continue;
            }
            const sessionResource = item.resource;
            if (onlyShowAttachableCopilotCliSessions && !this._canAttachCopilotCliSession(sessionResource)) {
              continue;
            }
            const icon = item.iconPath ?? providerIcon;
            picks.push({
              label: item.label,
              description: new Date(item.timing.lastRequestEnded ?? item.timing.created).toLocaleString(),
              asAttachment: () => ({
                kind: "sessionReference",
                id: sessionResource.toString(),
                name: item.label,
                value: sessionResource,
                icon
              })
            });
          }
        }
        picks.sort((a, b) => (b.description ?? "").localeCompare(a.description ?? ""));
        return picks;
      })()
    };
  }
  _canAttachCopilotCliSession(sessionResource) {
    return !!buildHostLocalEventsPath(
      sessionResource,
      this._pathService.userHome({ preferLocal: true }),
      (authority) => this._remoteAgentHostService.connections.find((connection) => agentHostAuthority(connection.address) === authority)
    );
  }
};
SessionReferenceContextPickerPick = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IPathService),
  __decorateParam(2, IRemoteAgentHostService)
], SessionReferenceContextPickerPick);
export {
  ChatContextContributions,
  EnableChatDebugToolsCommandId,
  TerminalContext,
  shouldShowOpenEditorsContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFbGVjdHJvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhZ2VudEhvc3RBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZWRpdG9ycy9maWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0sIElDaGF0Q29udGV4dFBpY2tlckl0ZW0sIElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtLCBJQ2hhdENvbnRleHRQaWNrZXIgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFRvb2xFbnRyeSwgSUNoYXRSZXF1ZXN0VG9vbFNldEVudHJ5LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBJSW1hZ2VWYXJpYWJsZUVudHJ5LCB0b1Rvb2xTZXRWYXJpYWJsZUVudHJ5LCB0b1Rvb2xWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaXNUb29sU2V0LCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgaW1hZ2VUb0hhc2gsIGlzSW1hZ2UgfSBmcm9tICcuLi93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRQYXN0ZVByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0QnVmZmVyVG9TY3JlZW5zaG90VmFyaWFibGUgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0U2NyZWVuc2hvdENvbnRleHQuanMnO1xuaW1wb3J0IHsgQ2hhdEluc3RydWN0aW9uc1BpY2tlclBpY2sgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvYXR0YWNoSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBidWlsZEhvc3RMb2NhbEV2ZW50c1BhdGggfSBmcm9tICcuLi9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcblxuLyoqXG4gKiBDb21tYW5kIElEIHRoYXQgZXh0ZW5zaW9ucyBjYW4gY2FsbCB0byBlbmFibGUgZGVidWcgdG9vbHMgZm9yIHRoZSBjdXJyZW50XG4gKiBjaGF0IHNlc3Npb24uIFNldHMgdGhlIGNvbnRleHQga2V5IGFuZCBpbW1lZGlhdGVseSBmbHVzaGVzIHRvb2wgdXBkYXRlcyBzb1xuICogdGhhdCBuZXdseS1lbmFibGVkIHRvb2xzIGFyZSB2aXNpYmxlIG9uIHRoZSBuZXh0IGB2c2NvZGUubG0udG9vbHNgIHJlYWQuXG4gKi9cbmV4cG9ydCBjb25zdCBFbmFibGVDaGF0RGVidWdUb29sc0NvbW1hbmRJZCA9ICdjaGF0LmVuYWJsZURlYnVnVG9vbHMnO1xuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd09wZW5FZGl0b3JzQ29udGV4dCh3aWRnZXQ6IFBpY2s8SUNoYXRXaWRnZXQsICd2aWV3TW9kZWwnIHwgJ2xvY2tlZEFnZW50SWQnPiwgaGFzRWxpZ2libGVPcGVuRWRpdG9yczogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRpZiAoIWhhc0VsaWdpYmxlT3BlbkVkaXRvcnMpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkICYmIGlzQWdlbnRIb3N0VGFyZ2V0KHdpZGdldC5sb2NrZWRBZ2VudElkKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdENvbnRleHRDb250cmlidXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LmNvbnRleHRDb250cmlidXRpb25zJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIGNvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI1xuXHRcdC8vXG5cdFx0Ly8gRGVmYXVsdCBjb250ZXh0IHBpY2tzL3ZhbHVlcyB3aGljaCBhcmUgXCJuYXRpdmVcIiB0byBjaGF0LiBUaGlzIGlzIE5PVCB0aGUgY29tcGxldGUgbGlzdFxuXHRcdC8vIGFuZCBmZWF0dXJlIGFyZWEgc3BlY2lmaWMgY29udGV4dCwgbGlrZSBmb3Igbm90ZWJvb2tzLCBwcm9ibGVtcywgZXRjLCBzaG91bGQgYmUgY29udHJpYnV0ZWRcblx0XHQvLyBieSB0aGUgZmVhdHVyZSBhcmVhLlxuXHRcdC8vXG5cdFx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9vbHNDb250ZXh0UGlja2VyUGljaykpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnN0cnVjdGlvbnNQaWNrZXJQaWNrKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BlbkVkaXRvckNvbnRleHRWYWx1ZVBpY2spKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGlwYm9hcmRJbWFnZUNvbnRleHRWYWx1ZVBpY2spKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTY3JlZW5zaG90Q29udGV4dFZhbHVlUGljaykpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25SZWZlcmVuY2VDb250ZXh0UGlja2VyUGljaykpKTtcblx0fVxufVxuXG5jbGFzcyBUb29sc0NvbnRleHRQaWNrZXJQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IGxvY2FsaXplKCdjaGF0Q29udGV4dC50b29scycsICdUb29scy4uLicpO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gPSBDb2RpY29uLnRvb2xzO1xuXHRyZWFkb25seSBvcmRpbmFsID0gLTUwMDtcblxuXHRpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzVG9vbEF0dGFjaG1lbnRzO1xuXHR9XG5cblx0YXNQaWNrZXIod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IElDaGF0Q29udGV4dFBpY2tlciB7XG5cblx0XHR0eXBlIFBpY2sgPSBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbSAmIHsgdG9vbEluZm86IHsgb3JkaW5hbDogbnVtYmVyOyBsYWJlbDogc3RyaW5nIH0gfTtcblx0XHRjb25zdCBpdGVtczogUGlja1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtlbnRyeSwgZW5hYmxlZF0gb2Ygd2lkZ2V0LmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC5lbnRyaWVzTWFwLmdldCgpKSB7XG5cdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHRpZiAoaXNUb29sU2V0KGVudHJ5KSkge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dG9vbEluZm86IFRvb2xEYXRhU291cmNlLmNsYXNzaWZ5KGVudHJ5LnNvdXJjZSksXG5cdFx0XHRcdFx0XHRsYWJlbDogZW50cnkucmVmZXJlbmNlTmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBlbnRyeS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFRvb2xTZXRFbnRyeSA9PiB0b1Rvb2xTZXRWYXJpYWJsZUVudHJ5KGVudHJ5KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0dG9vbEluZm86IFRvb2xEYXRhU291cmNlLmNsYXNzaWZ5KGVudHJ5LnNvdXJjZSksXG5cdFx0XHRcdFx0XHRsYWJlbDogZW50cnkudG9vbFJlZmVyZW5jZU5hbWUgPz8gZW50cnkuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZW50cnkudXNlckRlc2NyaXB0aW9uID8/IGVudHJ5Lm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRhc0F0dGFjaG1lbnQ6ICgpOiBJQ2hhdFJlcXVlc3RUb29sRW50cnkgPT4gdG9Ub29sVmFyaWFibGVFbnRyeShlbnRyeSlcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGl0ZW1zLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGxldCByZXMgPSBhLnRvb2xJbmZvLm9yZGluYWwgLSBiLnRvb2xJbmZvLm9yZGluYWw7XG5cdFx0XHRpZiAocmVzID09PSAwKSB7XG5cdFx0XHRcdHJlcyA9IGEudG9vbEluZm8ubGFiZWwubG9jYWxlQ29tcGFyZShiLnRvb2xJbmZvLmxhYmVsKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXMgPT09IDApIHtcblx0XHRcdFx0cmVzID0gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9KTtcblxuXHRcdGxldCBsYXN0R3JvdXBMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBpY2tzOiAoSVF1aWNrUGlja1NlcGFyYXRvciB8IFBpY2spW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0aWYgKGxhc3RHcm91cExhYmVsICE9PSBpdGVtLnRvb2xJbmZvLmxhYmVsKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGl0ZW0udG9vbEluZm8ubGFiZWwgfSk7XG5cdFx0XHRcdGxhc3RHcm91cExhYmVsID0gaXRlbS50b29sSW5mby5sYWJlbDtcblx0XHRcdH1cblx0XHRcdHBpY2tzLnB1c2goaXRlbSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdENvbnRleHQudG9vbHMucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgdG9vbCcpLFxuXHRcdFx0cGlja3M6IFByb21pc2UucmVzb2x2ZShwaWNrcylcblx0XHR9O1xuXHR9XG5cblxufVxuXG5cblxuY2xhc3MgT3BlbkVkaXRvckNvbnRleHRWYWx1ZVBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndmFsdWVQaWNrJztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IGxvY2FsaXplKCdjaGF0Q29udGV4dC5lZGl0b3JzJywgJ09wZW4gRWRpdG9ycycpO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gPSBDb2RpY29uLmZpbGU7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSA4MDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7IH1cblxuXHRpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IFByb21pc2U8Ym9vbGVhbj4gfCBib29sZWFuIHtcblx0XHRjb25zdCBoYXNFbGlnaWJsZU9wZW5FZGl0b3JzID0gdGhpcy5fZWRpdG9yU2VydmljZS5lZGl0b3JzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgRmlsZUVkaXRvcklucHV0IHx8IGUgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgfHwgZSBpbnN0YW5jZW9mIFVudGl0bGVkVGV4dEVkaXRvcklucHV0KTtcblx0XHRyZXR1cm4gc2hvdWxkU2hvd09wZW5FZGl0b3JzQ29udGV4dCh3aWRnZXQsIGhhc0VsaWdpYmxlT3BlbkVkaXRvcnMpO1xuXHR9XG5cblx0YXN5bmMgYXNBdHRhY2htZW50KCk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLl9lZGl0b3JTZXJ2aWNlLmVkaXRvcnMpIHtcblx0XHRcdGlmICghKGVkaXRvciBpbnN0YW5jZW9mIEZpbGVFZGl0b3JJbnB1dCB8fCBlZGl0b3IgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgfHwgZWRpdG9yIGluc3RhbmNlb2YgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXQgfHwgZWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRuYW1lOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbCh1cmkpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxufVxuXG5cbmNsYXNzIENsaXBib2FyZEltYWdlQ29udGV4dFZhbHVlUGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFZhbHVlSXRlbSB7XG5cdHJlYWRvbmx5IHR5cGUgPSAndmFsdWVQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnaW1hZ2VGcm9tQ2xpcGJvYXJkJywgJ0ltYWdlIGZyb20gQ2xpcGJvYXJkJyk7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmZpbGVNZWRpYTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpIHtcblx0XHRpZiAoIXdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzSW1hZ2VBdHRhY2htZW50cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXdpZGdldC5pbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udmlzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGltYWdlRGF0YSA9IGF3YWl0IHRoaXMuX2NsaXBib2FyZFNlcnZpY2UucmVhZEltYWdlKCk7XG5cdFx0cmV0dXJuIGlzSW1hZ2UoaW1hZ2VEYXRhKTtcblx0fVxuXG5cdGFzeW5jIGFzQXR0YWNobWVudCgpOiBQcm9taXNlPElJbWFnZVZhcmlhYmxlRW50cnk+IHtcblx0XHRjb25zdCBmaWxlQnVmZmVyID0gYXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS5yZWFkSW1hZ2UoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGF3YWl0IGltYWdlVG9IYXNoKGZpbGVCdWZmZXIpLFxuXHRcdFx0bmFtZTogbG9jYWxpemUoJ3Bhc3RlZEltYWdlJywgJ1Bhc3RlZCBJbWFnZScpLFxuXHRcdFx0ZnVsbE5hbWU6IGxvY2FsaXplKCdwYXN0ZWRJbWFnZScsICdQYXN0ZWQgSW1hZ2UnKSxcblx0XHRcdHZhbHVlOiBmaWxlQnVmZmVyLFxuXHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENvbnRleHQgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndmFsdWVQaWNrJztcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24udGVybWluYWw7XG5cdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ3Rlcm1pbmFsJywgJ1Rlcm1pbmFsJyk7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlOiBVUkksIEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSkge1xuXG5cdH1cblx0aXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh0aGlzLl9yZXNvdXJjZSk7XG5cdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNUZXJtaW5hbEF0dGFjaG1lbnRzICYmIHRlcm1pbmFsPy5pc0Rpc3Bvc2VkID09PSBmYWxzZTtcblx0fVxuXHRhc3luYyBhc0F0dGFjaG1lbnQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbVJlc291cmNlKHRoaXMuX3Jlc291cmNlKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModGhpcy5fcmVzb3VyY2UucXVlcnkpO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB0ZXJtaW5hbC5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uY29tbWFuZHMuZmluZChjbWQgPT4gY21kLmlkID09PSBwYXJhbXMuZ2V0KCdjb21tYW5kJykpO1xuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0a2luZDogJ3Rlcm1pbmFsQ29tbWFuZCcsXG5cdFx0XHRpZDogYHRlcm1pbmFsQ29tbWFuZDoke0RhdGUubm93KCl9fWAsXG5cdFx0XHR2YWx1ZTogdGhpcy5hc1ZhbHVlKGNvbW1hbmQpLFxuXHRcdFx0bmFtZTogY29tbWFuZC5jb21tYW5kLFxuXHRcdFx0Y29tbWFuZDogY29tbWFuZC5jb21tYW5kLFxuXHRcdFx0b3V0cHV0OiBjb21tYW5kLmdldE91dHB1dCgpLFxuXHRcdFx0ZXhpdENvZGU6IGNvbW1hbmQuZXhpdENvZGUsXG5cdFx0XHRyZXNvdXJjZTogdGhpcy5fcmVzb3VyY2Vcblx0XHR9O1xuXHRcdGNvbnN0IGNsZWFudXAgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgZGlzcG9zZUNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0Y2xlYW51cC5kaXNwb3NlKCk7XG5cdFx0fTtcblx0XHRjbGVhbnVwLmFkZCh3aWRnZXQuYXR0YWNobWVudE1vZGVsLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuZGVsZXRlZC5pbmNsdWRlcyhhdHRhY2htZW50LmlkKSkge1xuXHRcdFx0XHRkaXNwb3NlQ2xlYW51cCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjbGVhbnVwLmFkZCh0ZXJtaW5hbC5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuZGVsZXRlKGF0dGFjaG1lbnQuaWQpO1xuXHRcdFx0d2lkZ2V0LnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHRcdFx0ZGlzcG9zZUNsZWFudXAoKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGFzVmFsdWUoY29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCk6IHN0cmluZyB7XG5cdFx0bGV0IHZhbHVlID0gYENvbW1hbmQ6ICR7Y29tbWFuZC5jb21tYW5kfWA7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gY29tbWFuZC5nZXRPdXRwdXQoKTtcblx0XHRpZiAob3V0cHV0KSB7XG5cdFx0XHR2YWx1ZSArPSBgXFxuT3V0cHV0OlxcbiR7b3V0cHV0fWA7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgY29tbWFuZC5leGl0Q29kZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHZhbHVlICs9IGBcXG5FeGl0IENvZGU6ICR7Y29tbWFuZC5leGl0Q29kZX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxuY2xhc3MgU2NyZWVuc2hvdENvbnRleHRWYWx1ZVBpY2sgaW1wbGVtZW50cyBJQ2hhdENvbnRleHRWYWx1ZUl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndmFsdWVQaWNrJztcblx0cmVhZG9ubHkgaWNvbiA9IENvZGljb24uZGV2aWNlQ2FtZXJhO1xuXHRyZWFkb25seSBsYWJlbCA9IChpc0VsZWN0cm9uXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoU2NyZWVuc2hvdC5sYWJlbEVsZWN0cm9uLldpbmRvdycsICdTY3JlZW5zaG90IFdpbmRvdycpXG5cdFx0OiBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoU2NyZWVuc2hvdC5sYWJlbFdlYicsICdTY3JlZW5zaG90JykpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpc0VuYWJsZWQod2lkZ2V0OiBJQ2hhdFdpZGdldCkge1xuXHRcdHJldHVybiAhIXdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzSW1hZ2VBdHRhY2htZW50cyAmJiAhIXdpZGdldC5pbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udmlzaW9uO1xuXHR9XG5cblx0YXN5bmMgYXNBdHRhY2htZW50KCk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGJsb2IgPSBhd2FpdCB0aGlzLl9ob3N0U2VydmljZS5nZXRTY3JlZW5zaG90KCk7XG5cdFx0cmV0dXJuIGJsb2IgJiYgY29udmVydEJ1ZmZlclRvU2NyZWVuc2hvdFZhcmlhYmxlKGJsb2IpO1xuXHR9XG59XG5cbmNsYXNzIFNlc3Npb25SZWZlcmVuY2VDb250ZXh0UGlja2VyUGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFBpY2tlckl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAncGlja2VyUGljayc7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmNvbW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ2NoYXRDb250ZXh0LnNlc3Npb25zJywgJ1Nlc3Npb25zLi4uJyk7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSAtNDAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdpZGdldC5sb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0fVxuXG5cdGFzUGlja2VyKHdpZGdldDogSUNoYXRXaWRnZXQpOiBJQ2hhdENvbnRleHRQaWNrZXIge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3Qgb25seVNob3dBdHRhY2hhYmxlQ29waWxvdENsaVNlc3Npb25zID0gISFjdXJyZW50U2Vzc2lvblJlc291cmNlICYmIGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShjdXJyZW50U2Vzc2lvblJlc291cmNlKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY2hhdENvbnRleHQuc2Vzc2lvbnMucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgc2Vzc2lvbicpLFxuXHRcdFx0cGlja3M6IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBpY2tzOiBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbVtdID0gW107XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25Qcm92aWRlckZpbHRlciA9IFtBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xhdWRlLCBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdF07XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgZ3JvdXAgb2YgdGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkl0ZW1zKHNlc3Npb25Qcm92aWRlckZpbHRlciwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oZ3JvdXAuY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50U2Vzc2lvblJlc291cmNlICYmIGl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gaXRlbS5yZXNvdXJjZTtcblx0XHRcdFx0XHRcdGlmIChvbmx5U2hvd0F0dGFjaGFibGVDb3BpbG90Q2xpU2Vzc2lvbnMgJiYgIXRoaXMuX2NhbkF0dGFjaENvcGlsb3RDbGlTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBpY29uID0gaXRlbS5pY29uUGF0aCA/PyBwcm92aWRlckljb247XG5cdFx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBuZXcgRGF0ZShpdGVtLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8/IGl0ZW0udGltaW5nLmNyZWF0ZWQpLnRvTG9jYWxlU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdGFzQXR0YWNobWVudDogKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAnc2Vzc2lvblJlZmVyZW5jZScsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRpY29uLFxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2tzLnNvcnQoKGEsIGIpID0+IChiLmRlc2NyaXB0aW9uID8/ICcnKS5sb2NhbGVDb21wYXJlKGEuZGVzY3JpcHRpb24gPz8gJycpKTtcblx0XHRcdFx0cmV0dXJuIHBpY2tzO1xuXHRcdFx0fSkoKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jYW5BdHRhY2hDb3BpbG90Q2xpU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdC8vIEZvciBub3csIGF0dGFjaG1lbnRzIHdoaWxlIGluIGFuIEFnZW50IEhvc3QgQ29waWxvdCBoYXJuZXNzIGFyZSBhdHRhY2hhYmxlIHdoZW4gYmFja2VkIGJ5IENvcGlsb3QgQ0xJIGV2ZW50cy5qc29ubC5cblx0XHRyZXR1cm4gISFidWlsZEhvc3RMb2NhbEV2ZW50c1BhdGgoXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0cnVlIH0pLFxuXHRcdFx0YXV0aG9yaXR5ID0+IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjb25uZWN0aW9uID0+IGFnZW50SG9zdEF1dGhvcml0eShjb25uZWN0aW9uLmFkZHJlc3MpID09PSBhdXRob3JpdHkpLFxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxrQkFB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
