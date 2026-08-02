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
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../../base/common/marshalling.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { truncate } from "../../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import * as nls from "../../../../../../nls.js";
import { ConfirmResult, IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { registerIcon } from "../../../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { EditorInputCapabilities, Verbosity } from "../../../../../common/editor.js";
import { EditorInput } from "../../../../../common/editor/editorInput.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { ChatAgentLocation, ChatEditorTitleMaxLength, getDefaultNewChatSessionResource, getDefaultNewChatSessionType } from "../../../common/constants.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { LocalChatSessionUri, getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
const ChatEditorIcon = registerIcon("chat-editor-label-icon", Codicon.chatSparkle, nls.localize("chatEditorLabelIcon", "Icon of the chat editor label."));
let ChatEditorInput = class extends EditorInput {
  constructor(resource, options, chatService, dialogService, configurationService, chatSessionsService, instantiationService, storageService, logService, workspaceContextService, agentHostEnablementService) {
    super();
    this.resource = resource;
    this.options = options;
    this.chatService = chatService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.chatSessionsService = chatSessionsService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.didTransferOutEditingSession = false;
    this.modelRef = this._register(new MutableDisposable());
    this._modelChangeListener = this._register(new MutableDisposable());
    this.closeHandler = this;
    if (resource.scheme === Schemas.vscodeChatEditor) {
      const parsed = ChatEditorUri.parse(resource);
      if (!parsed || typeof parsed !== "number") {
        throw new Error("Invalid chat URI");
      }
    } else if (resource.scheme === Schemas.vscodeLocalChatSession) {
      const localSessionId = LocalChatSessionUri.parseLocalSessionId(resource);
      if (!localSessionId) {
        throw new Error("Invalid local chat session URI");
      }
      this._sessionResource = resource;
    } else {
      this._sessionResource = resource;
    }
  }
  /**
   * Get the uri of the session this editor input is associated with.
   *
   * This should be preferred over using `resource` directly, as it handles cases where a chat editor becomes a session
   */
  get sessionResource() {
    return this._sessionResource;
  }
  get model() {
    return this.modelRef.value?.object;
  }
  static getNewEditorUri() {
    return ChatEditorUri.getNewEditorUri();
  }
  showConfirm() {
    return !!(this.model && shouldShowClearEditingSessionConfirmation(this.model));
  }
  transferOutEditingSession() {
    this.didTransferOutEditingSession = true;
    return this.model?.editingSession;
  }
  async confirm(editors) {
    if (!this.model?.editingSession || this.didTransferOutEditingSession || this.getSessionType() !== localChatSessionType) {
      return ConfirmResult.SAVE;
    }
    const titleOverride = nls.localize("chatEditorConfirmTitle", "Close Chat Editor");
    const messageOverride = nls.localize("chat.startEditing.confirmation.pending.message.default", "Closing the chat editor will end your current edit session.");
    const result = await showClearEditingSessionConfirmation(this.model, this.dialogService, { titleOverride, messageOverride });
    return result ? ConfirmResult.SAVE : ConfirmResult.CANCEL;
  }
  get editorId() {
    return ChatEditorInput.EditorID;
  }
  get capabilities() {
    return super.capabilities | EditorInputCapabilities.ForceReveal | EditorInputCapabilities.CanDropIntoEditor;
  }
  copy() {
    return this.instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), {});
  }
  matches(otherInput) {
    if (!(otherInput instanceof ChatEditorInput)) {
      return false;
    }
    return isEqual(this.sessionResource, otherInput.sessionResource);
  }
  get typeId() {
    return ChatEditorInput.TypeID;
  }
  getName() {
    if (this.model?.title) {
      return this.model.hasCustomTitle ? this.model.title : truncate(this.model.title, ChatEditorTitleMaxLength);
    }
    if (this._sessionResource) {
      const existingSession = this.chatService.getSession(this._sessionResource);
      if (existingSession?.title) {
        return existingSession.title;
      }
      const persistedTitle = this.chatService.getSessionTitle(this._sessionResource);
      if (persistedTitle && persistedTitle.trim()) {
        return persistedTitle;
      }
    }
    if (this.options.title?.preferred) {
      return this.options.title.preferred;
    }
    return this.options.title?.fallback ?? nls.localize("chatEditorName", "Chat");
  }
  getTitle(verbosity) {
    const name = this.getName();
    if (verbosity === Verbosity.LONG) {
      const sessionTypeDisplayName = this.getSessionTypeDisplayName();
      if (sessionTypeDisplayName) {
        return `${name} | ${sessionTypeDisplayName}`;
      }
    }
    return name;
  }
  getSessionTypeDisplayName() {
    const sessionType = this.getSessionType();
    if (sessionType === localChatSessionType) {
      return;
    }
    const contributions = this.chatSessionsService.getAllChatSessionContributions();
    const contribution = contributions.find((c) => c.type === sessionType);
    return contribution?.displayName;
  }
  getIcon() {
    const resolvedIcon = this.resolveIcon();
    if (resolvedIcon) {
      this.cachedIcon = resolvedIcon;
      return resolvedIcon;
    }
    return ChatEditorIcon;
  }
  resolveIcon() {
    const sessionType = this.getSessionType();
    if (sessionType !== localChatSessionType) {
      return this.chatSessionsService.getChatSessionContribution(sessionType)?.icon;
    }
    return void 0;
  }
  /**
   * Returns chat session type from a URI, or {@linkcode localChatSessionType} if not specified or cannot be determined.
   */
  getSessionType() {
    return getChatSessionType(this._sessionResource ?? this.resource);
  }
  async resolve() {
    const searchParams = new URLSearchParams(this.resource.query);
    const chatSessionType = searchParams.get("chatSessionType");
    const inputType = chatSessionType ?? this.resource.authority;
    if (this._sessionResource) {
      try {
        this.modelRef.value = await this.chatService.acquireOrLoadSession(this._sessionResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolve");
      } catch (error) {
        this.logService.warn(`[ChatEditorInput] Failed to acquire session ${this._sessionResource.toString()}`, error);
      }
      if (!this.model && isUntitledChatSession(this._sessionResource) && getChatSessionType(this._sessionResource) !== localChatSessionType) {
        this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${this._sessionResource.toString()} could not be acquired`);
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitledFallback" });
      }
      if (this.shouldReplaceEmptyLocalSession(this._sessionResource)) {
        const defaultResource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get());
        if (getChatSessionType(defaultResource) !== localChatSessionType) {
          let modelRef;
          try {
            modelRef = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolveDefaultSession");
          } catch (error) {
            this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
          }
          if (modelRef) {
            this._sessionResource = defaultResource;
            this.modelRef.value = modelRef;
          } else {
            this.logService.warn(`[ChatEditorInput] Keeping local chat session because default session ${defaultResource.toString()} could not be acquired`);
          }
        }
      }
      if (!this.model && LocalChatSessionUri.parseLocalSessionId(this._sessionResource)) {
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: true, debugOwner: "ChatEditorInput#resolveNewLocalSession" });
      }
    } else if (!this.options.target) {
      if (this.options.explicitSessionType === localChatSessionType) {
        this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveExplicitLocal" });
      } else {
        const defaultResource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get());
        if (getChatSessionType(defaultResource) === localChatSessionType) {
          this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitled" });
        } else {
          try {
            this.modelRef.value = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatEditorInput#resolveDefaultUntitled");
          } catch (error) {
            this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
          }
          if (this.model) {
            this._sessionResource = defaultResource;
          } else {
            this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${defaultResource.toString()} could not be acquired`);
            this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: "ChatEditorInput#resolveUntitledFallback" });
          }
        }
      }
    } else if (this.options.target.data) {
      this.modelRef.value = this.chatService.loadSessionFromData(this.options.target.data, "ChatEditorInput#resolveImportedData");
    }
    if (!this.model || this.isDisposed()) {
      return null;
    }
    this._sessionResource = this.model.sessionResource;
    this._trackModelChanges();
    const newIcon = this.resolveIcon();
    if (newIcon && (!this.cachedIcon || !this.iconsEqual(this.cachedIcon, newIcon))) {
      this.cachedIcon = newIcon;
    }
    this._onDidChangeLabel.fire();
    return this._register(new ChatEditorModel(this.model));
  }
  shouldReplaceEmptyLocalSession(sessionResource) {
    return LocalChatSessionUri.isLocalSession(sessionResource) && this.options.explicitSessionType !== localChatSessionType && !!this.model && !this.model.hasRequests && getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get()) !== localChatSessionType;
  }
  /**
   * Updates the editor input to track a new model. Called when the widget swaps
   * from an untitled session to a real session.
   */
  updateModel(model) {
    this._sessionResource = model.sessionResource;
    this.modelRef.value = this.chatService.acquireExistingSession(model.sessionResource, "ChatEditorInput#updateModel");
    this._trackModelChanges();
    this.cachedIcon = void 0;
    this._onDidChangeLabel.fire();
  }
  _trackModelChanges() {
    if (!this.model) {
      return;
    }
    this._modelChangeListener.value = this.model.onDidChange(() => {
      this.cachedIcon = void 0;
      this._onDidChangeLabel.fire();
    });
  }
  iconsEqual(a, b) {
    if (ThemeIcon.isThemeIcon(a) && ThemeIcon.isThemeIcon(b)) {
      return a.id === b.id;
    }
    if (a instanceof URI && b instanceof URI) {
      return a.toString() === b.toString();
    }
    return false;
  }
};
ChatEditorInput.TypeID = "workbench.input.chatSession";
ChatEditorInput.EditorID = "workbench.editor.chatSession";
ChatEditorInput = __decorateClass([
  __decorateParam(2, IChatService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IAgentHostEnablementService)
], ChatEditorInput);
class ChatEditorModel extends Disposable {
  constructor(model) {
    super();
    this.model = model;
    this._isResolved = false;
  }
  async resolve() {
    this._isResolved = true;
  }
  isResolved() {
    return this._isResolved;
  }
  isDisposed() {
    return this._store.isDisposed;
  }
}
var ChatEditorUri;
((ChatEditorUri2) => {
  const scheme = Schemas.vscodeChatEditor;
  function getNewEditorUri() {
    const handle = Math.floor(Math.random() * 1e9);
    return URI.from({ scheme, path: `chat-${handle}` });
  }
  ChatEditorUri2.getNewEditorUri = getNewEditorUri;
  function parse(resource) {
    if (resource.scheme !== scheme) {
      return void 0;
    }
    const match = resource.path.match(/chat-(\d+)/);
    const handleStr = match?.[1];
    if (typeof handleStr !== "string") {
      return void 0;
    }
    const handle = parseInt(handleStr);
    if (isNaN(handle)) {
      return void 0;
    }
    return handle;
  }
  ChatEditorUri2.parse = parse;
})(ChatEditorUri || (ChatEditorUri = {}));
class ChatEditorInputSerializer {
  canSerialize(input) {
    return input instanceof ChatEditorInput && !!input.sessionResource;
  }
  serialize(input) {
    if (!this.canSerialize(input)) {
      return void 0;
    }
    const obj = {
      options: input.options,
      sessionResource: input.sessionResource,
      resource: input.resource
    };
    return JSON.stringify(obj);
  }
  deserialize(instantiationService, serializedEditor) {
    try {
      const parsed = revive(JSON.parse(serializedEditor));
      if (parsed.sessionResource) {
        const sessionResource = URI.revive(parsed.sessionResource);
        return instantiationService.createInstance(ChatEditorInput, sessionResource, parsed.options);
      }
      let resource = URI.revive(parsed.resource);
      if (resource.scheme === Schemas.vscodeChatEditor && parsed.sessionId) {
        resource = LocalChatSessionUri.forSession(parsed.sessionId);
      }
      return instantiationService.createInstance(ChatEditorInput, resource, parsed.options);
    } catch (err) {
      return void 0;
    }
  }
}
async function showClearEditingSessionConfirmation(model, dialogService, options) {
  const undecidedEdits = shouldShowClearEditingSessionConfirmation(model, options);
  if (!undecidedEdits) {
    return true;
  }
  const defaultPhrase = nls.localize("chat.startEditing.confirmation.pending.message.default1", "Starting a new chat will end your current edit session.");
  const defaultTitle = nls.localize("chat.startEditing.confirmation.title", "Start new chat?");
  const phrase = options?.messageOverride ?? defaultPhrase;
  const title = options?.titleOverride ?? defaultTitle;
  const { result } = await dialogService.prompt({
    title,
    message: phrase + " " + nls.localize("chat.startEditing.confirmation.pending.message.2", "Do you want to keep pending edits to {0} files?", undecidedEdits),
    type: "info",
    cancelButton: true,
    buttons: [
      {
        label: nls.localize("chat.startEditing.confirmation.acceptEdits", "Keep & Continue"),
        run: async () => {
          await model.editingSession.accept();
          return true;
        }
      },
      {
        label: nls.localize("chat.startEditing.confirmation.discardEdits", "Undo & Continue"),
        run: async () => {
          await model.editingSession.reject();
          return true;
        }
      }
    ]
  });
  return Boolean(result);
}
function shouldShowClearEditingSessionConfirmation(model, options) {
  if (!model.editingSession || model.willKeepAlive && !options?.isArchiveAction) {
    return 0;
  }
  const currentEdits = model.editingSession.entries.get();
  const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
  return undecidedEdits.length;
}
export {
  ChatEditorInput,
  ChatEditorInputSerializer,
  ChatEditorModel,
  shouldShowClearEditingSessionConfirmation,
  showClearEditingSessionConfirmation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvcklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgdHJ1bmNhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maXJtUmVzdWx0LCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIElFZGl0b3JJZGVudGlmaWVyLCBJRWRpdG9yU2VyaWFsaXplciwgSVVudHlwZWRFZGl0b3JJbnB1dCwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCwgSUVkaXRvckNsb3NlSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbFJlZmVyZW5jZSwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0RWRpdG9yVGl0bGVNYXhMZW5ndGgsIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmksIGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vY2hhdEVkaXRvci5qcyc7XG5cbmNvbnN0IENoYXRFZGl0b3JJY29uID0gcmVnaXN0ZXJJY29uKCdjaGF0LWVkaXRvci1sYWJlbC1pY29uJywgQ29kaWNvbi5jaGF0U3BhcmtsZSwgbmxzLmxvY2FsaXplKCdjaGF0RWRpdG9yTGFiZWxJY29uJywgJ0ljb24gb2YgdGhlIGNoYXQgZWRpdG9yIGxhYmVsLicpKTtcblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IGltcGxlbWVudHMgSUVkaXRvckNsb3NlSGFuZGxlciB7XG5cdHN0YXRpYyByZWFkb25seSBUeXBlSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guaW5wdXQuY2hhdFNlc3Npb24nO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9ySUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLmNoYXRTZXNzaW9uJztcblxuXHRwcml2YXRlIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogR2V0IHRoZSB1cmkgb2YgdGhlIHNlc3Npb24gdGhpcyBlZGl0b3IgaW5wdXQgaXMgYXNzb2NpYXRlZCB3aXRoLlxuXHQgKlxuXHQgKiBUaGlzIHNob3VsZCBiZSBwcmVmZXJyZWQgb3ZlciB1c2luZyBgcmVzb3VyY2VgIGRpcmVjdGx5LCBhcyBpdCBoYW5kbGVzIGNhc2VzIHdoZXJlIGEgY2hhdCBlZGl0b3IgYmVjb21lcyBhIHNlc3Npb25cblx0ICovXG5cdHB1YmxpYyBnZXQgc2Vzc2lvblJlc291cmNlKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zZXNzaW9uUmVzb3VyY2U7IH1cblxuXHRwcml2YXRlIGRpZFRyYW5zZmVyT3V0RWRpdGluZ1Nlc3Npb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBjYWNoZWRJY29uOiBUaGVtZUljb24gfCBVUkkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbFJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJQ2hhdE1vZGVsUmVmZXJlbmNlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxDaGFuZ2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIGdldCBtb2RlbCgpOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbFJlZi52YWx1ZT8ub2JqZWN0O1xuXHR9XG5cblx0c3RhdGljIGdldE5ld0VkaXRvclVyaSgpOiBVUkkge1xuXHRcdHJldHVybiBDaGF0RWRpdG9yVXJpLmdldE5ld0VkaXRvclVyaSgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBvcHRpb25zOiBJQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlOiBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUNoYXRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IENoYXRFZGl0b3JVcmkucGFyc2UocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZCAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNoYXQgVVJJJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTG9jYWxDaGF0U2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgbG9jYWxTZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFsb2NhbFNlc3Npb25JZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYWwgY2hhdCBzZXNzaW9uIFVSSScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGNsb3NlSGFuZGxlciA9IHRoaXM7XG5cblx0c2hvd0NvbmZpcm0oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhKHRoaXMubW9kZWwgJiYgc2hvdWxkU2hvd0NsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb24odGhpcy5tb2RlbCkpO1xuXHR9XG5cblx0dHJhbnNmZXJPdXRFZGl0aW5nU2Vzc2lvbigpOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmRpZFRyYW5zZmVyT3V0RWRpdGluZ1Nlc3Npb24gPSB0cnVlO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsPy5lZGl0aW5nU2Vzc2lvbjtcblx0fVxuXG5cdGFzeW5jIGNvbmZpcm0oZWRpdG9yczogUmVhZG9ubHlBcnJheTxJRWRpdG9ySWRlbnRpZmllcj4pOiBQcm9taXNlPENvbmZpcm1SZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMubW9kZWw/LmVkaXRpbmdTZXNzaW9uIHx8IHRoaXMuZGlkVHJhbnNmZXJPdXRFZGl0aW5nU2Vzc2lvbiB8fCB0aGlzLmdldFNlc3Npb25UeXBlKCkgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRyZXR1cm4gQ29uZmlybVJlc3VsdC5TQVZFO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlT3ZlcnJpZGUgPSBubHMubG9jYWxpemUoJ2NoYXRFZGl0b3JDb25maXJtVGl0bGUnLCBcIkNsb3NlIENoYXQgRWRpdG9yXCIpO1xuXHRcdGNvbnN0IG1lc3NhZ2VPdmVycmlkZSA9IG5scy5sb2NhbGl6ZSgnY2hhdC5zdGFydEVkaXRpbmcuY29uZmlybWF0aW9uLnBlbmRpbmcubWVzc2FnZS5kZWZhdWx0JywgXCJDbG9zaW5nIHRoZSBjaGF0IGVkaXRvciB3aWxsIGVuZCB5b3VyIGN1cnJlbnQgZWRpdCBzZXNzaW9uLlwiKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzaG93Q2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbih0aGlzLm1vZGVsLCB0aGlzLmRpYWxvZ1NlcnZpY2UsIHsgdGl0bGVPdmVycmlkZSwgbWVzc2FnZU92ZXJyaWRlIH0pO1xuXHRcdHJldHVybiByZXN1bHQgPyBDb25maXJtUmVzdWx0LlNBVkUgOiBDb25maXJtUmVzdWx0LkNBTkNFTDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRyZXR1cm4gc3VwZXIuY2FwYWJpbGl0aWVzIHwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRm9yY2VSZXZlYWwgfCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5Ecm9wSW50b0VkaXRvcjtcblx0fVxuXG5cdG92ZXJyaWRlIGNvcHkoKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0b3JJbnB1dCwgQ2hhdEVkaXRvcklucHV0LmdldE5ld0VkaXRvclVyaSgpLCB7fSk7XG5cdH1cblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVySW5wdXQ6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVySW5wdXQgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlzRXF1YWwodGhpcy5zZXNzaW9uUmVzb3VyY2UsIG90aGVySW5wdXQuc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ2hhdEVkaXRvcklucHV0LlR5cGVJRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHQvLyBJZiB3ZSBoYXZlIGEgcmVzb2x2ZWQgbW9kZWwsIHVzZSBpdHMgdGl0bGVcblx0XHRpZiAodGhpcy5tb2RlbD8udGl0bGUpIHtcblx0XHRcdC8vIE9ubHkgdHJ1bmNhdGUgaWYgdGhlIGRlZmF1bHQgdGl0bGUgaXMgYmVpbmcgdXNlZCAoZG9uJ3QgdHJ1bmNhdGUgY3VzdG9tIHRpdGxlcylcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmhhc0N1c3RvbVRpdGxlID8gdGhpcy5tb2RlbC50aXRsZSA6IHRydW5jYXRlKHRoaXMubW9kZWwudGl0bGUsIENoYXRFZGl0b3JUaXRsZU1heExlbmd0aCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhIHNlc3Npb25JZCBidXQgbm8gcmVzb2x2ZWQgbW9kZWwsIHRyeSB0byBnZXQgdGhlIHRpdGxlIGZyb20gcGVyc2lzdGVkIHNlc3Npb25zXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Ly8gRmlyc3QgdHJ5IHRoZSBhY3RpdmUgc2Vzc2lvbiByZWdpc3RyeVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uPy50aXRsZSkge1xuXHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdTZXNzaW9uLnRpdGxlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBub3QgaW4gYWN0aXZlIHJlZ2lzdHJ5LCB0cnkgcGVyc2lzdGVkIHNlc3Npb24gZGF0YVxuXHRcdFx0Y29uc3QgcGVyc2lzdGVkVGl0bGUgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHBlcnNpc3RlZFRpdGxlICYmIHBlcnNpc3RlZFRpdGxlLnRyaW0oKSkgeyAvLyBPbmx5IHVzZSBub24tZW1wdHkgcGVyc2lzdGVkIHRpdGxlc1xuXHRcdFx0XHRyZXR1cm4gcGVyc2lzdGVkVGl0bGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYSBwcmVmZXJyZWQgdGl0bGUgd2FzIHByb3ZpZGVkIGluIG9wdGlvbnMsIHVzZSBpdFxuXHRcdGlmICh0aGlzLm9wdGlvbnMudGl0bGU/LnByZWZlcnJlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9ucy50aXRsZS5wcmVmZXJyZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIGRlZmF1bHQgbmFtaW5nIHBhdHRlcm5cblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLnRpdGxlPy5mYWxsYmFjayA/PyBubHMubG9jYWxpemUoJ2NoYXRFZGl0b3JOYW1lJywgXCJDaGF0XCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0VGl0bGUodmVyYm9zaXR5PzogVmVyYm9zaXR5KTogc3RyaW5nIHtcblx0XHRjb25zdCBuYW1lID0gdGhpcy5nZXROYW1lKCk7XG5cdFx0aWYgKHZlcmJvc2l0eSA9PT0gVmVyYm9zaXR5LkxPTkcpIHsgLy8gVmVyYm9zaXR5IExPTkcgaXMgdXNlZCBmb3IgdG9vbHRpcHNcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlRGlzcGxheU5hbWUgPSB0aGlzLmdldFNlc3Npb25UeXBlRGlzcGxheU5hbWUoKTtcblx0XHRcdGlmIChzZXNzaW9uVHlwZURpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdHJldHVybiBgJHtuYW1lfSB8ICR7c2Vzc2lvblR5cGVEaXNwbGF5TmFtZX1gO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmFtZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2Vzc2lvblR5cGVEaXNwbGF5TmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5nZXRTZXNzaW9uVHlwZSgpO1xuXHRcdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udHJpYnV0aW9ucyA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSBjb250cmlidXRpb25zLmZpbmQoYyA9PiBjLnR5cGUgPT09IHNlc3Npb25UeXBlKTtcblx0XHRyZXR1cm4gY29udHJpYnV0aW9uPy5kaXNwbGF5TmFtZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEljb24oKTogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvbHZlZEljb24gPSB0aGlzLnJlc29sdmVJY29uKCk7XG5cdFx0aWYgKHJlc29sdmVkSWNvbikge1xuXHRcdFx0dGhpcy5jYWNoZWRJY29uID0gcmVzb2x2ZWRJY29uO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVkSWNvbjtcblx0XHR9XG5cblx0XHQvLyBGYWxsIGJhY2sgdG8gZGVmYXVsdCBpY29uXG5cdFx0cmV0dXJuIENoYXRFZGl0b3JJY29uO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlSWNvbigpOiBUaGVtZUljb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRPRE9Ab3NvcnRlZ2EsQHJlYm9ybml4IGRvdWJsZSBjaGVjazogQ2hhdCBTZXNzaW9uIEl0ZW0gaWNvbiBpcyByZXNlcnZlZCBmb3IgY2hhdCBzZXNzaW9uIGxpc3QgYW5kIGRlcHJlY2F0ZWQgZm9yIGNoYXQgc2Vzc2lvbiBzdGF0dXMuIHRodXMgaGVyZSB3ZSB1c2Ugc2Vzc2lvbiB0eXBlIGljb24uIFdlIG1heSB3YW50IHRvIHNob3cgc3RhdHVzIGZvciB0aGUgRWRpdG9yIFRpdGxlLlxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5nZXRTZXNzaW9uVHlwZSgpO1xuXHRcdGlmIChzZXNzaW9uVHlwZSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpPy5pY29uO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBjaGF0IHNlc3Npb24gdHlwZSBmcm9tIGEgVVJJLCBvciB7QGxpbmtjb2RlIGxvY2FsQ2hhdFNlc3Npb25UeXBlfSBpZiBub3Qgc3BlY2lmaWVkIG9yIGNhbm5vdCBiZSBkZXRlcm1pbmVkLlxuXHQgKi9cblx0cHVibGljIGdldFNlc3Npb25UeXBlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPz8gdGhpcy5yZXNvdXJjZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8Q2hhdEVkaXRvck1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModGhpcy5yZXNvdXJjZS5xdWVyeSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25UeXBlID0gc2VhcmNoUGFyYW1zLmdldCgnY2hhdFNlc3Npb25UeXBlJyk7XG5cdFx0Y29uc3QgaW5wdXRUeXBlID0gY2hhdFNlc3Npb25UeXBlID8/IHRoaXMucmVzb3VyY2UuYXV0aG9yaXR5O1xuXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odGhpcy5fc2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmUnKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQ2hhdEVkaXRvcklucHV0XSBGYWlsZWQgdG8gYWNxdWlyZSBzZXNzaW9uICR7dGhpcy5fc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCwgZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwgJiYgaXNVbnRpdGxlZENoYXRTZXNzaW9uKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSkgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSkgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQ2hhdEVkaXRvcklucHV0XSBGYWxsaW5nIGJhY2sgdG8gYSBsb2NhbCBjaGF0IHNlc3Npb24gYmVjYXVzZSAke3RoaXMuX3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBjb3VsZCBub3QgYmUgYWNxdWlyZWRgKTtcblx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBjYW5Vc2VUb29sczogIWlucHV0VHlwZSwgZGVidWdPd25lcjogJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlVW50aXRsZWRGYWxsYmFjaycgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZFJlcGxhY2VFbXB0eUxvY2FsU2Vzc2lvbih0aGlzLl9zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRSZXNvdXJjZSA9IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKTtcblx0XHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShkZWZhdWx0UmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRcdGxldCBtb2RlbFJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bW9kZWxSZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKGRlZmF1bHRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlRGVmYXVsdFNlc3Npb24nKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtDaGF0RWRpdG9ySW5wdXRdIEZhaWxlZCB0byBhY3F1aXJlIGRlZmF1bHQgc2Vzc2lvbiAke2RlZmF1bHRSZXNvdXJjZS50b1N0cmluZygpfWAsIGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBkZWZhdWx0UmVzb3VyY2U7XG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gbW9kZWxSZWY7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQ2hhdEVkaXRvcklucHV0XSBLZWVwaW5nIGxvY2FsIGNoYXQgc2Vzc2lvbiBiZWNhdXNlIGRlZmF1bHQgc2Vzc2lvbiAke2RlZmF1bHRSZXNvdXJjZS50b1N0cmluZygpfSBjb3VsZCBub3QgYmUgYWNxdWlyZWRgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yIGxvY2FsIHNlc3Npb24gb25seSwgaWYgd2UgZmluZCBubyBleGlzdGluZyBzZXNzaW9uLCBjcmVhdGUgYSBuZXcgb25lXG5cdFx0XHRpZiAoIXRoaXMubW9kZWwgJiYgTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBjYW5Vc2VUb29sczogdHJ1ZSwgZGVidWdPd25lcjogJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlTmV3TG9jYWxTZXNzaW9uJyB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCF0aGlzLm9wdGlvbnMudGFyZ2V0KSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmV4cGxpY2l0U2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdHRoaXMubW9kZWxSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgY2FuVXNlVG9vbHM6ICFpbnB1dFR5cGUsIGRlYnVnT3duZXI6ICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZUV4cGxpY2l0TG9jYWwnIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFJlc291cmNlID0gZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uUmVzb3VyY2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCB0aGlzLmFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpO1xuXHRcdFx0XHRpZiAoZ2V0Q2hhdFNlc3Npb25UeXBlKGRlZmF1bHRSZXNvdXJjZSkgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBjYW5Vc2VUb29sczogIWlucHV0VHlwZSwgZGVidWdPd25lcjogJ0NoYXRFZGl0b3JJbnB1dCNyZXNvbHZlVW50aXRsZWQnIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihkZWZhdWx0UmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZURlZmF1bHRVbnRpdGxlZCcpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRFZGl0b3JJbnB1dF0gRmFpbGVkIHRvIGFjcXVpcmUgZGVmYXVsdCBzZXNzaW9uICR7ZGVmYXVsdFJlc291cmNlLnRvU3RyaW5nKCl9YCwgZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5tb2RlbCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gZGVmYXVsdFJlc291cmNlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0NoYXRFZGl0b3JJbnB1dF0gRmFsbGluZyBiYWNrIHRvIGEgbG9jYWwgY2hhdCBzZXNzaW9uIGJlY2F1c2UgJHtkZWZhdWx0UmVzb3VyY2UudG9TdHJpbmcoKX0gY291bGQgbm90IGJlIGFjcXVpcmVkYCk7XG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gdGhpcy5jaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB7IGNhblVzZVRvb2xzOiAhaW5wdXRUeXBlLCBkZWJ1Z093bmVyOiAnQ2hhdEVkaXRvcklucHV0I3Jlc29sdmVVbnRpdGxlZEZhbGxiYWNrJyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMub3B0aW9ucy50YXJnZXQuZGF0YSkge1xuXHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2UubG9hZFNlc3Npb25Gcm9tRGF0YSh0aGlzLm9wdGlvbnMudGFyZ2V0LmRhdGEsICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZUltcG9ydGVkRGF0YScpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5tb2RlbCB8fCB0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gdGhpcy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHR0aGlzLl90cmFja01vZGVsQ2hhbmdlcygpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgaWNvbiBoYXMgY2hhbmdlZCBhZnRlciBtb2RlbCByZXNvbHV0aW9uXG5cdFx0Y29uc3QgbmV3SWNvbiA9IHRoaXMucmVzb2x2ZUljb24oKTtcblx0XHRpZiAobmV3SWNvbiAmJiAoIXRoaXMuY2FjaGVkSWNvbiB8fCAhdGhpcy5pY29uc0VxdWFsKHRoaXMuY2FjaGVkSWNvbiwgbmV3SWNvbikpKSB7XG5cdFx0XHR0aGlzLmNhY2hlZEljb24gPSBuZXdJY29uO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGF0RWRpdG9yTW9kZWwodGhpcy5tb2RlbCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRSZXBsYWNlRW1wdHlMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gTG9jYWxDaGF0U2Vzc2lvblVyaS5pc0xvY2FsU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQmJiB0aGlzLm9wdGlvbnMuZXhwbGljaXRTZXNzaW9uVHlwZSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGVcblx0XHRcdCYmICEhdGhpcy5tb2RlbFxuXHRcdFx0JiYgIXRoaXMubW9kZWwuaGFzUmVxdWVzdHNcblx0XHRcdCYmIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCB0aGlzLmFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBlZGl0b3IgaW5wdXQgdG8gdHJhY2sgYSBuZXcgbW9kZWwuIENhbGxlZCB3aGVuIHRoZSB3aWRnZXQgc3dhcHNcblx0ICogZnJvbSBhbiB1bnRpdGxlZCBzZXNzaW9uIHRvIGEgcmVhbCBzZXNzaW9uLlxuXHQgKi9cblx0dXBkYXRlTW9kZWwobW9kZWw6IElDaGF0TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBtb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbihtb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdDaGF0RWRpdG9ySW5wdXQjdXBkYXRlTW9kZWwnKTtcblx0XHR0aGlzLl90cmFja01vZGVsQ2hhbmdlcygpO1xuXHRcdHRoaXMuY2FjaGVkSWNvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrTW9kZWxDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbENoYW5nZUxpc3RlbmVyLnZhbHVlID0gdGhpcy5tb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmNhY2hlZEljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaWNvbnNFcXVhbChhOiBUaGVtZUljb24gfCBVUkksIGI6IFRoZW1lSWNvbiB8IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oYSkgJiYgVGhlbWVJY29uLmlzVGhlbWVJY29uKGIpKSB7XG5cdFx0XHRyZXR1cm4gYS5pZCA9PT0gYi5pZDtcblx0XHR9XG5cdFx0aWYgKGEgaW5zdGFuY2VvZiBVUkkgJiYgYiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0cmV0dXJuIGEudG9TdHJpbmcoKSA9PT0gYi50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRvck1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2lzUmVzb2x2ZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBtb2RlbDogSUNoYXRNb2RlbFxuXHQpIHsgc3VwZXIoKTsgfVxuXG5cdGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faXNSZXNvbHZlZCA9IHRydWU7XG5cdH1cblxuXHRpc1Jlc29sdmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Jlc29sdmVkO1xuXHR9XG5cblx0aXNEaXNwb3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmUuaXNEaXNwb3NlZDtcblx0fVxufVxuXG5cbm5hbWVzcGFjZSBDaGF0RWRpdG9yVXJpIHtcblxuXHRjb25zdCBzY2hlbWUgPSBTY2hlbWFzLnZzY29kZUNoYXRFZGl0b3I7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGdldE5ld0VkaXRvclVyaSgpOiBVUkkge1xuXHRcdGNvbnN0IGhhbmRsZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDFlOSk7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lLCBwYXRoOiBgY2hhdC0ke2hhbmRsZX1gIH0pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKHJlc291cmNlOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgIT09IHNjaGVtZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaCA9IHJlc291cmNlLnBhdGgubWF0Y2goL2NoYXQtKFxcZCspLyk7XG5cdFx0Y29uc3QgaGFuZGxlU3RyID0gbWF0Y2g/LlsxXTtcblx0XHRpZiAodHlwZW9mIGhhbmRsZVN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gcGFyc2VJbnQoaGFuZGxlU3RyKTtcblx0XHRpZiAoaXNOYU4oaGFuZGxlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZENoYXRFZGl0b3JJbnB1dCB7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IElDaGF0RWRpdG9yT3B0aW9ucztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogaW5wdXQgaXMgQ2hhdEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gaW5wdXQgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQgJiYgISFpbnB1dC5zZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRzZXJpYWxpemUoaW5wdXQ6IEVkaXRvcklucHV0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuY2FuU2VyaWFsaXplKGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBvYmo6IElTZXJpYWxpemVkQ2hhdEVkaXRvcklucHV0ID0ge1xuXHRcdFx0b3B0aW9uczogaW5wdXQub3B0aW9ucyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogaW5wdXQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IGlucHV0LnJlc291cmNlLFxuXG5cdFx0fTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkob2JqKTtcblx0fVxuXG5cdGRlc2VyaWFsaXplKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZWRFZGl0b3I6IHN0cmluZyk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gT2xkIGlucHV0cyBoYXZlIGEgc2Vzc2lvbiBpZCBmb3IgbG9jYWwgc2Vzc2lvblxuXHRcdFx0Ly8gVXNlIHJldml2ZSB0byBwcm9wZXJseSByZXN0b3JlIFVSSXMgYW5kIG90aGVyIHNwZWNpYWwgb2JqZWN0cyBpbiBvcHRpb25zLnRhcmdldC5kYXRhXG5cdFx0XHRjb25zdCBwYXJzZWQgPSByZXZpdmUoSlNPTi5wYXJzZShzZXJpYWxpemVkRWRpdG9yKSk7XG5cblx0XHRcdC8vIEZpcnN0IGlmIHdlIGhhdmUgYSBtb2Rlcm4gc2Vzc2lvbiByZXNvdXJjZSwgdXNlIHRoYXRcblx0XHRcdGlmIChwYXJzZWQuc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUocGFyc2VkLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdG9ySW5wdXQsIHNlc3Npb25SZXNvdXJjZSwgcGFyc2VkLm9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgY2hlY2sgdG8gc2VlIGlmIHdlJ3JlIGEgY2hhdCBlZGl0b3Igd2l0aCBhIGxvY2FsIHNlc3Npb24gaWRcblx0XHRcdGxldCByZXNvdXJjZSA9IFVSSS5yZXZpdmUocGFyc2VkLnJlc291cmNlKTtcblx0XHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQ2hhdEVkaXRvciAmJiBwYXJzZWQuc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKHBhcnNlZC5zZXNzaW9uSWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRvcklucHV0LCByZXNvdXJjZSwgcGFyc2VkLm9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKG1vZGVsOiBJQ2hhdE1vZGVsLCBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSwgb3B0aW9ucz86IElDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCB1bmRlY2lkZWRFZGl0cyA9IHNob3VsZFNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKG1vZGVsLCBvcHRpb25zKTtcblx0aWYgKCF1bmRlY2lkZWRFZGl0cykge1xuXHRcdHJldHVybiB0cnVlOyAvLyBzYWZlIHRvIGRpc3Bvc2Ugd2l0aG91dCBjb25maXJtYXRpb25cblx0fVxuXG5cdGNvbnN0IGRlZmF1bHRQaHJhc2UgPSBubHMubG9jYWxpemUoJ2NoYXQuc3RhcnRFZGl0aW5nLmNvbmZpcm1hdGlvbi5wZW5kaW5nLm1lc3NhZ2UuZGVmYXVsdDEnLCBcIlN0YXJ0aW5nIGEgbmV3IGNoYXQgd2lsbCBlbmQgeW91ciBjdXJyZW50IGVkaXQgc2Vzc2lvbi5cIik7XG5cdGNvbnN0IGRlZmF1bHRUaXRsZSA9IG5scy5sb2NhbGl6ZSgnY2hhdC5zdGFydEVkaXRpbmcuY29uZmlybWF0aW9uLnRpdGxlJywgXCJTdGFydCBuZXcgY2hhdD9cIik7XG5cdGNvbnN0IHBocmFzZSA9IG9wdGlvbnM/Lm1lc3NhZ2VPdmVycmlkZSA/PyBkZWZhdWx0UGhyYXNlO1xuXHRjb25zdCB0aXRsZSA9IG9wdGlvbnM/LnRpdGxlT3ZlcnJpZGUgPz8gZGVmYXVsdFRpdGxlO1xuXG5cdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0dGl0bGUsXG5cdFx0bWVzc2FnZTogcGhyYXNlICsgJyAnICsgbmxzLmxvY2FsaXplKCdjaGF0LnN0YXJ0RWRpdGluZy5jb25maXJtYXRpb24ucGVuZGluZy5tZXNzYWdlLjInLCBcIkRvIHlvdSB3YW50IHRvIGtlZXAgcGVuZGluZyBlZGl0cyB0byB7MH0gZmlsZXM/XCIsIHVuZGVjaWRlZEVkaXRzKSxcblx0XHR0eXBlOiAnaW5mbycsXG5cdFx0Y2FuY2VsQnV0dG9uOiB0cnVlLFxuXHRcdGJ1dHRvbnM6IFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2hhdC5zdGFydEVkaXRpbmcuY29uZmlybWF0aW9uLmFjY2VwdEVkaXRzJywgXCJLZWVwICYgQ29udGludWVcIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IG1vZGVsLmVkaXRpbmdTZXNzaW9uIS5hY2NlcHQoKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2hhdC5zdGFydEVkaXRpbmcuY29uZmlybWF0aW9uLmRpc2NhcmRFZGl0cycsIFwiVW5kbyAmIENvbnRpbnVlXCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBtb2RlbC5lZGl0aW5nU2Vzc2lvbiEucmVqZWN0KCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdLFxuXHR9KTtcblxuXHRyZXR1cm4gQm9vbGVhbihyZXN1bHQpO1xufVxuXG4vKiogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGZpbGVzIGluIHRoZSAgbW9kZWwncyBtb2RpZmljYXRpb25zIHRoYXQgbmVlZCBhIHByb21wdCBiZWZvcmUgc2F2aW5nICovXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd0NsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb24obW9kZWw6IElDaGF0TW9kZWwsIG9wdGlvbnM/OiBJQ2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbk9wdGlvbnMpOiBudW1iZXIge1xuXHRpZiAoIW1vZGVsLmVkaXRpbmdTZXNzaW9uIHx8IChtb2RlbC53aWxsS2VlcEFsaXZlICYmICFvcHRpb25zPy5pc0FyY2hpdmVBY3Rpb24pKSB7XG5cdFx0cmV0dXJuIDA7IC8vIHNhZmUgdG8gZGlzcG9zZSB3aXRob3V0IGNvbmZpcm1hdGlvblxuXHR9XG5cblx0Y29uc3QgY3VycmVudEVkaXRzID0gbW9kZWwuZWRpdGluZ1Nlc3Npb24uZW50cmllcy5nZXQoKTtcblx0Y29uc3QgdW5kZWNpZGVkRWRpdHMgPSBjdXJyZW50RWRpdHMuZmlsdGVyKChlZGl0KSA9PiBlZGl0LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0cmV0dXJuIHVuZGVjaWRlZEVkaXRzLmxlbmd0aDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWUsc0JBQXNCO0FBQzlDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMseUJBQW9GLGlCQUFpQjtBQUM5RyxTQUFTLG1CQUF3QztBQUNqRCxTQUE4QixvQkFBb0I7QUFDbEQsU0FBUyxzQkFBc0IsNEJBQTRCO0FBQzNELFNBQVMsbUJBQW1CLDBCQUEwQixrQ0FBa0Msb0NBQW9DO0FBQzVILFNBQThCLDhCQUE4QjtBQUU1RCxTQUFTLHFCQUFxQixv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
