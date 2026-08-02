import { asArray } from "../../../../../base/common/arrays.js";
import { DeferredPromise, isThenable } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isObject } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { AbstractGotoSymbolQuickAccessProvider } from "../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { resolveCommandsContext } from "../../../../browser/parts/editor/editorCommandsContext.js";
import { ResourceContextKey } from "../../../../common/contextkeys.js";
import { EditorResourceAccessor, isEditorCommandsContext, SideBySideEditor } from "../../../../common/editor.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ExplorerFolderContext } from "../../../files/common/files.js";
import { CTX_INLINE_CHAT_V2_ENABLED } from "../../../inlineChat/common/inlineChat.js";
import { AnythingQuickAccessProvider } from "../../../search/browser/anythingQuickAccess.js";
import { isSearchTreeFileMatch, isSearchTreeMatch } from "../../../search/browser/searchTreeModel/searchTreeCommon.js";
import { SymbolsQuickAccessProvider } from "../../../search/browser/symbolsQuickAccess.js";
import { SearchContext } from "../../../search/common/constants.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { OmittedState } from "../../common/attachments/chatVariableEntries.js";
import { ChatAgentLocation, isSupportedChatFileScheme } from "../../common/constants.js";
import { IChatWidgetService, IQuickChatService } from "../chat.js";
import { IChatContextPickService, isChatContextPickerPickItem } from "../attachments/chatContextPickService.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { isQuickChat } from "../widget/chatWidget.js";
import { resizeImage } from "../chatImageUtils.js";
import { registerPromptActions } from "../promptSyntax/promptFileActions.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { registerCreatePluginAction } from "./createPluginAction.js";
function registerChatContextActions() {
  const store = new DisposableStore();
  store.add(registerAction2(AttachContextAction));
  store.add(registerAction2(AttachFileToChatAction));
  store.add(registerAction2(AttachFolderToChatAction));
  store.add(registerAction2(AttachSelectionToChatAction));
  store.add(registerAction2(AttachSearchResultAction));
  store.add(registerAction2(AttachPinnedEditorsToChatAction));
  store.add(registerCreatePluginAction());
  registerPromptActions();
  return store;
}
async function withChatView(accessor) {
  const chatWidgetService = accessor.get(IChatWidgetService);
  const lastFocusedWidget = chatWidgetService.lastFocusedWidget;
  if (!lastFocusedWidget || lastFocusedWidget.location === ChatAgentLocation.Chat) {
    return chatWidgetService.revealWidget();
  }
  return lastFocusedWidget;
}
class AttachResourceAction extends Action2 {
  async run(accessor, ...args) {
    const instaService = accessor.get(IInstantiationService);
    const widget = await instaService.invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    return instaService.invokeFunction(this.runWithWidget.bind(this), widget, ...args);
  }
  _getResources(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const contexts = isEditorCommandsContext(args[1]) ? this._getEditorResources(accessor, ...args) : Array.isArray(args[1]) ? args[1] : [args[0]];
    const files = [];
    for (const context of contexts) {
      let uri;
      if (URI.isUri(context)) {
        uri = context;
      } else if (isSearchTreeFileMatch(context)) {
        uri = context.resource;
      } else if (isSearchTreeMatch(context)) {
        uri = context.parent().resource;
      } else if (!context && editorService.activeTextEditorControl) {
        uri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      }
      if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
        files.push(uri);
      }
    }
    return files;
  }
  _getEditorResources(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    return resolvedContext.groupedEditors.flatMap((groupedEditor) => groupedEditor.editors).map((editor) => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY })).filter((uri) => uri !== void 0);
  }
}
const _AttachFileToChatAction = class _AttachFileToChatAction extends AttachResourceAction {
  constructor() {
    super({
      id: _AttachFileToChatAction.ID,
      title: localize2("workbench.action.chat.attachFile.label", "Add File to Chat"),
      category: CHAT_CATEGORY,
      icon: Codicon.attach,
      precondition: ChatContextKeys.enabled,
      f1: true,
      menu: [{
        id: MenuId.SearchContext,
        group: "z_chat",
        order: 1,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, SearchContext.FileMatchOrMatchFocusKey, SearchContext.SearchResultHeaderFocused.negate())
      }, {
        id: MenuId.ExplorerContext,
        group: "5_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ExplorerFolderContext.negate(),
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }, {
        id: MenuId.EditorTitleContext,
        group: "2_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }, {
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 2,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          EditorContextKeys.hasNonEmptySelection.negate(),
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
            ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
          )
        )
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "0_chat",
        order: 3,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection.negate())
      }]
    });
  }
  async runWithWidget(accessor, widget, ...args) {
    const files = this._getResources(accessor, ...args);
    if (!files.length) {
      return;
    }
    if (widget) {
      widget.focusInput();
      for (const file of files) {
        widget.attachmentModel.addFile(file);
      }
    }
  }
};
_AttachFileToChatAction.ID = "workbench.action.chat.attachFile";
let AttachFileToChatAction = _AttachFileToChatAction;
const _AttachFolderToChatAction = class _AttachFolderToChatAction extends AttachResourceAction {
  constructor() {
    super({
      id: _AttachFolderToChatAction.ID,
      title: localize2("workbench.action.chat.attachFolder.label", "Add Folder to Chat"),
      category: CHAT_CATEGORY,
      f1: false,
      menu: {
        id: MenuId.ExplorerContext,
        group: "5_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ExplorerFolderContext,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote)
          )
        )
      }
    });
  }
  async runWithWidget(accessor, widget, ...args) {
    const folders = this._getResources(accessor, ...args);
    if (!folders.length) {
      return;
    }
    if (widget) {
      widget.focusInput();
      for (const folder of folders) {
        widget.attachmentModel.addFolder(folder);
      }
    }
  }
};
_AttachFolderToChatAction.ID = "workbench.action.chat.attachFolder";
let AttachFolderToChatAction = _AttachFolderToChatAction;
const _AttachPinnedEditorsToChatAction = class _AttachPinnedEditorsToChatAction extends Action2 {
  constructor() {
    super({
      id: _AttachPinnedEditorsToChatAction.ID,
      title: localize2("workbench.action.chat.attachPinnedEditors.label", "Add Pinned Editors to Chat"),
      category: CHAT_CATEGORY,
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  async run(accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const instaService = accessor.get(IInstantiationService);
    const widget = await instaService.invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    const files = [];
    for (const group of editorGroupsService.groups) {
      for (const editor of group.editors) {
        if (group.isPinned(editor)) {
          const uri = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
          if (uri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(uri.scheme)) {
            files.push(uri);
          }
        }
      }
    }
    if (!files.length) {
      return;
    }
    widget.focusInput();
    for (const file of files) {
      widget.attachmentModel.addFile(file);
    }
  }
};
_AttachPinnedEditorsToChatAction.ID = "workbench.action.chat.attachPinnedEditors";
let AttachPinnedEditorsToChatAction = _AttachPinnedEditorsToChatAction;
const _AttachSelectionToChatAction = class _AttachSelectionToChatAction extends Action2 {
  constructor() {
    super({
      id: _AttachSelectionToChatAction.ID,
      title: localize2("workbench.action.chat.attachSelection.label", "Add Selection to Chat"),
      category: CHAT_CATEGORY,
      icon: Codicon.attach,
      f1: true,
      precondition: ChatContextKeys.enabled,
      menu: [{
        id: MenuId.EditorContext,
        group: "1_chat",
        order: 1,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          EditorContextKeys.hasNonEmptySelection,
          ContextKeyExpr.or(
            ResourceContextKey.Scheme.isEqualTo(Schemas.file),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
            ResourceContextKey.Scheme.isEqualTo(Schemas.untitled),
            ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData)
          )
        )
      }, {
        id: MenuId.InlineChatEditorAffordance,
        group: "0_chat",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
      }, {
        id: MenuId.ChatEditorInlineMenu,
        group: "0_chat",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, EditorContextKeys.hasNonEmptySelection)
      }]
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
    if (!widget) {
      return;
    }
    const [_, matches] = args;
    if (matches && matches.length > 0) {
      const uris = /* @__PURE__ */ new Map();
      for (const match of matches) {
        if (isSearchTreeFileMatch(match)) {
          uris.set(match.resource, void 0);
        } else {
          const context = { uri: match._parent.resource, range: match._range };
          const range = uris.get(context.uri);
          if (!range || range.startLineNumber !== context.range.startLineNumber && range.endLineNumber !== context.range.endLineNumber) {
            uris.set(context.uri, context.range);
            widget.attachmentModel.addFile(context.uri, context.range);
          }
        }
      }
      for (const uri of uris) {
        const [resource, range] = uri;
        if (!range) {
          widget.attachmentModel.addFile(resource);
        }
      }
    } else {
      const activeEditor = editorService.activeTextEditorControl;
      const activeUri = EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (activeEditor && activeUri && [Schemas.file, Schemas.vscodeRemote, Schemas.untitled].includes(activeUri.scheme)) {
        const selection = activeEditor.getSelection();
        if (selection) {
          widget.focusInput();
          const range = selection.isEmpty() ? new Range(selection.startLineNumber, 1, selection.startLineNumber + 1, 1) : selection;
          widget.attachmentModel.addFile(activeUri, range);
        }
      }
    }
  }
};
_AttachSelectionToChatAction.ID = "workbench.action.chat.attachSelection";
let AttachSelectionToChatAction = _AttachSelectionToChatAction;
const _AttachSearchResultAction = class _AttachSearchResultAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.insertSearchResults",
      title: localize2("chat.insertSearchResults", "Add Search Results to Chat"),
      category: CHAT_CATEGORY,
      f1: false,
      menu: [{
        id: MenuId.SearchContext,
        group: "z_chat",
        order: 3,
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          SearchContext.SearchResultHeaderFocused
        )
      }]
    });
  }
  async run(accessor) {
    const logService = accessor.get(ILogService);
    const widget = await accessor.get(IInstantiationService).invokeFunction(withChatView);
    if (!widget) {
      logService.trace("InsertSearchResultAction: no chat view available");
      return;
    }
    const editor = widget.inputEditor;
    const originalRange = editor.getSelection() ?? editor.getModel()?.getFullModelRange().collapseToEnd();
    if (!originalRange) {
      logService.trace("InsertSearchResultAction: no selection");
      return;
    }
    let insertText = `#${_AttachSearchResultAction.Name}`;
    const varRange = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.startLineNumber + insertText.length);
    const model = editor.getModel();
    if (model && model.getValueInRange(new Range(originalRange.startLineNumber, originalRange.startColumn - 1, originalRange.startLineNumber, originalRange.startColumn)) !== " ") {
      insertText = " " + insertText;
    }
    const success = editor.executeEdits("chatInsertSearch", [{ range: varRange, text: insertText + " " }]);
    if (!success) {
      logService.trace(`InsertSearchResultAction: failed to insert "${insertText}"`);
      return;
    }
  }
};
_AttachSearchResultAction.Name = "searchResults";
let AttachSearchResultAction = _AttachSearchResultAction;
function isIContextPickItemItem(obj) {
  return isObject(obj) && typeof obj.kind === "string" && obj.kind === "contextPick";
}
function isIGotoSymbolQuickPickItem(obj) {
  return isObject(obj) && typeof obj.symbolName === "string" && !!obj.uri && !!obj.range;
}
function isIQuickPickItemWithResource(obj) {
  return isObject(obj) && URI.isUri(obj.resource);
}
class AttachContextAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.attachContext",
      title: localize2("workbench.action.chat.attachContext.label.2", "Add Context..."),
      icon: Codicon.addCompact,
      category: CHAT_CATEGORY,
      keybinding: {
        when: ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
        primary: KeyMod.CtrlCmd | KeyCode.Slash,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [{
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat.negate(),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: -1
      }, {
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat.negate(),
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.EditorInline),
          CTX_INLINE_CHAT_V2_ENABLED,
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: 2
      }, {
        when: ContextKeyExpr.and(
          ChatContextKeys.inQuickChat,
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.agentSupportsAttachments
          )
        ),
        id: MenuId.ChatExecute,
        group: "navigation",
        order: -1
      }]
    });
  }
  async run(accessor, ...args) {
    const instantiationService = accessor.get(IInstantiationService);
    const widgetService = accessor.get(IChatWidgetService);
    const contextKeyService = accessor.get(IContextKeyService);
    const keybindingService = accessor.get(IKeybindingService);
    const contextPickService = accessor.get(IChatContextPickService);
    const context = args[0];
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const quickPickItems = [];
    for (const item of contextPickService.items) {
      if (item.isEnabled && !await item.isEnabled(widget)) {
        continue;
      }
      quickPickItems.push({
        kind: "contextPick",
        item,
        label: item.label,
        iconClass: ThemeIcon.asClassName(item.icon),
        keybinding: item.commandId ? keybindingService.lookupKeybinding(item.commandId, contextKeyService) : void 0
      });
    }
    instantiationService.invokeFunction(this._show.bind(this), widget, quickPickItems, context?.placeholder);
  }
  _show(accessor, widget, additionPicks, placeholder) {
    const quickInputService = accessor.get(IQuickInputService);
    const quickChatService = accessor.get(IQuickChatService);
    const instantiationService = accessor.get(IInstantiationService);
    const commandService = accessor.get(ICommandService);
    const providerOptions = {
      filter: (pick) => {
        if (isIQuickPickItemWithResource(pick) && pick.resource) {
          return instantiationService.invokeFunction((accessor2) => isSupportedChatFileScheme(accessor2, pick.resource.scheme));
        }
        return true;
      },
      additionPicks,
      handleAccept: async (item, isBackgroundAccept) => {
        if (isIContextPickItemItem(item)) {
          let isDone = true;
          if (item.item.type === "valuePick") {
            this._handleContextPick(item.item, widget);
          } else if (item.item.type === "pickerPick") {
            isDone = await this._handleContextPickerItem(quickInputService, commandService, item.item, widget);
          }
          if (!isDone) {
            instantiationService.invokeFunction(this._show.bind(this), widget, additionPicks, placeholder);
            return;
          }
        } else {
          instantiationService.invokeFunction(this._handleQPPick.bind(this), widget, isBackgroundAccept, item);
        }
        if (isQuickChat(widget)) {
          quickChatService.open();
        }
      }
    };
    quickInputService.quickAccess.show("", {
      enabledProviderPrefixes: [
        AnythingQuickAccessProvider.PREFIX,
        SymbolsQuickAccessProvider.PREFIX,
        AbstractGotoSymbolQuickAccessProvider.PREFIX
      ],
      placeholder: placeholder ?? localize("chatContext.attach.placeholder", "Search attachments"),
      providerOptions
    });
  }
  async _handleQPPick(accessor, widget, isInBackground, pick) {
    const fileService = accessor.get(IFileService);
    const textModelService = accessor.get(ITextModelService);
    const chatAttachmentResolveService = accessor.get(IChatAttachmentResolveService);
    const toAttach = [];
    if (isIQuickPickItemWithResource(pick) && pick.resource) {
      if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(pick.resource.path)) {
        if (URI.isUri(pick.resource)) {
          const readFile = await fileService.readFile(pick.resource);
          const resizedImage = await resizeImage(readFile.value.buffer);
          toAttach.push({
            id: pick.resource.toString(),
            name: pick.label,
            fullName: pick.label,
            value: resizedImage,
            kind: "image",
            references: [{ reference: pick.resource, kind: "reference" }]
          });
        }
      } else if (pick.resource.scheme === Schemas.vscodeBrowser) {
        const entry = await chatAttachmentResolveService.resolveEditorAttachContext({ resource: pick.resource });
        if (entry) {
          toAttach.push(entry);
        }
      } else {
        let omittedState = OmittedState.NotOmitted;
        try {
          const createdModel = await textModelService.createModelReference(pick.resource);
          createdModel.dispose();
        } catch {
          omittedState = OmittedState.Full;
        }
        toAttach.push({
          kind: "file",
          id: pick.resource.toString(),
          value: pick.resource,
          name: pick.label,
          omittedState
        });
      }
    } else if (isIGotoSymbolQuickPickItem(pick) && pick.uri && pick.range) {
      toAttach.push({
        kind: "generic",
        id: JSON.stringify({ uri: pick.uri, range: pick.range.decoration }),
        value: { uri: pick.uri, range: pick.range.decoration },
        fullName: pick.label,
        name: pick.symbolName
      });
    }
    widget.attachmentModel.addContext(...toAttach);
    if (!isInBackground) {
      widget.focusInput();
    }
  }
  async _handleContextPick(item, widget) {
    const value = await item.asAttachment(widget);
    if (Array.isArray(value)) {
      widget.attachmentModel.addContext(...value);
    } else if (value) {
      widget.attachmentModel.addContext(value);
    }
  }
  async _handleContextPickerItem(quickInputService, commandService, item, widget) {
    const pickerConfig = item.asPicker(widget);
    const store = new DisposableStore();
    const goBackItem = {
      label: localize("goBack", "Go back \u21A9"),
      alwaysShow: true
    };
    const configureItem = pickerConfig.configure ? {
      label: pickerConfig.configure.label,
      commandId: pickerConfig.configure.commandId,
      alwaysShow: true
    } : void 0;
    const extraPicks = [{ type: "separator" }];
    if (configureItem) {
      extraPicks.push(configureItem);
    }
    extraPicks.push(goBackItem);
    const qp = store.add(quickInputService.createQuickPick({ useSeparators: true }));
    const cts = new CancellationTokenSource();
    store.add(qp.onDidHide(() => cts.cancel()));
    store.add(toDisposable(() => cts.dispose(true)));
    qp.placeholder = pickerConfig.placeholder;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    qp.canAcceptInBackground = true;
    qp.busy = true;
    qp.show();
    if (isThenable(pickerConfig.picks)) {
      const items = await pickerConfig.picks.then((value) => {
        return [].concat(value, extraPicks);
      });
      qp.items = items;
      qp.busy = false;
    } else {
      const query = observableValue("attachContext.query", qp.value);
      store.add(qp.onDidChangeValue(() => query.set(qp.value, void 0)));
      const picksObservable = pickerConfig.picks(query, cts.token);
      store.add(autorun((reader) => {
        const { busy, picks } = picksObservable.read(reader);
        qp.items = [].concat(picks, extraPicks);
        qp.busy = busy;
      }));
    }
    if (cts.token.isCancellationRequested) {
      pickerConfig.dispose?.();
      return true;
    }
    const defer = new DeferredPromise();
    const addPromises = [];
    store.add(qp.onDidAccept(async (e) => {
      const noop = "noop";
      const [selected] = qp.selectedItems;
      if (isChatContextPickerPickItem(selected)) {
        const attachment = selected.asAttachment();
        if (!attachment || attachment === noop) {
          return;
        }
        if (isThenable(attachment)) {
          addPromises.push(attachment.then((v) => {
            if (v !== noop) {
              widget.attachmentModel.addContext(...asArray(v));
            }
          }));
        } else {
          widget.attachmentModel.addContext(...asArray(attachment));
        }
      }
      if (selected === goBackItem) {
        if (pickerConfig.goBack?.()) {
          return;
        }
        defer.complete(false);
      }
      if (selected === configureItem) {
        defer.complete(true);
        commandService.executeCommand(configureItem.commandId);
      }
      if (!e.inBackground) {
        defer.complete(true);
      }
    }));
    store.add(qp.onDidHide(() => {
      defer.complete(true);
      pickerConfig.dispose?.();
    }));
    try {
      const result = await defer.p;
      qp.busy = true;
      await Promise.all(addPromises);
      return result;
    } finally {
      store.dispose();
    }
  }
}
export {
  AttachContextAction,
  AttachSearchResultAction,
  registerChatContextActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRDb250ZXh0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBpc1RoZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0R290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIsIElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvZ290b1N5bWJvbFF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSwgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckNvbW1hbmRzQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgaXNFZGl0b3JDb21tYW5kc0NvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDVFhfSU5MSU5FX0NIQVRfVjJfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uL2lubGluZUNoYXQvY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0IHsgQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VhcmNoL2Jyb3dzZXIvYW55dGhpbmdRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBpc1NlYXJjaFRyZWVGaWxlTWF0Y2gsIGlzU2VhcmNoVHJlZU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vc2VhcmNoL2Jyb3dzZXIvc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuaW1wb3J0IHsgSVN5bWJvbFF1aWNrUGlja0l0ZW0sIFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VhcmNoL2Jyb3dzZXIvc3ltYm9sc1F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFNlYXJjaENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9zZWFyY2gvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgT21pdHRlZFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIElRdWlja0NoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSwgSUNoYXRDb250ZXh0VmFsdWVJdGVtLCBpc0NoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0gfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1F1aWNrQ2hhdCB9IGZyb20gJy4uL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IHJlc2l6ZUltYWdlIH0gZnJvbSAnLi4vY2hhdEltYWdlVXRpbHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJQcm9tcHRBY3Rpb25zIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ3JlYXRlUGx1Z2luQWN0aW9uIH0gZnJvbSAnLi9jcmVhdGVQbHVnaW5BY3Rpb24uanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0Q29udGV4dEFjdGlvbnMoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQXR0YWNoQ29udGV4dEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEF0dGFjaEZpbGVUb0NoYXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihBdHRhY2hGb2xkZXJUb0NoYXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihBdHRhY2hTZWxlY3Rpb25Ub0NoYXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihBdHRhY2hTZWFyY2hSZXN1bHRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihBdHRhY2hQaW5uZWRFZGl0b3JzVG9DaGF0QWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckNyZWF0ZVBsdWdpbkFjdGlvbigpKTtcblx0cmVnaXN0ZXJQcm9tcHRBY3Rpb25zKCk7IC8vIFRPRE9AanJpZWtlbjogc2hvdWxkIGFsc28gcmV0dXJuIGEgRGlzcG9zYWJsZVN0b3JlXG5cdHJldHVybiBzdG9yZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2l0aENoYXRWaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXG5cdGNvbnN0IGxhc3RGb2N1c2VkV2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdGlmICghbGFzdEZvY3VzZWRXaWRnZXQgfHwgbGFzdEZvY3VzZWRXaWRnZXQubG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQpIHtcblx0XHRyZXR1cm4gY2hhdFdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7IC8vIG9ubHkgc2hvdyBjaGF0IHZpZXcgaWYgd2UgZWl0aGVyIGhhdmUgbm8gY2hhdCB2aWV3IG9yIGl0cyBsb2NhdGVkIGluIHZpZXcgY29udGFpbmVyXG5cdH1cblx0cmV0dXJuIGxhc3RGb2N1c2VkV2lkZ2V0O1xufVxuXG5hYnN0cmFjdCBjbGFzcyBBdHRhY2hSZXNvdXJjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdpdGhDaGF0Vmlldyk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbih0aGlzLnJ1bldpdGhXaWRnZXQuYmluZCh0aGlzKSwgd2lkZ2V0LCAuLi5hcmdzKTtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bldpdGhXaWRnZXQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSUNoYXRXaWRnZXQsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD47XG5cblx0cHJvdGVjdGVkIF9nZXRSZXNvdXJjZXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFVSSVtdIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRleHRzID0gaXNFZGl0b3JDb21tYW5kc0NvbnRleHQoYXJnc1sxXSkgPyB0aGlzLl9nZXRFZGl0b3JSZXNvdXJjZXMoYWNjZXNzb3IsIC4uLmFyZ3MpIDogQXJyYXkuaXNBcnJheShhcmdzWzFdKSA/IGFyZ3NbMV0gOiBbYXJnc1swXV07XG5cdFx0Y29uc3QgZmlsZXMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbnRleHQgb2YgY29udGV4dHMpIHtcblx0XHRcdGxldCB1cmk7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKGNvbnRleHQpKSB7XG5cdFx0XHRcdHVyaSA9IGNvbnRleHQ7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChjb250ZXh0KSkge1xuXHRcdFx0XHR1cmkgPSBjb250ZXh0LnJlc291cmNlO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVNYXRjaChjb250ZXh0KSkge1xuXHRcdFx0XHR1cmkgPSBjb250ZXh0LnBhcmVudCgpLnJlc291cmNlO1xuXHRcdFx0fSBlbHNlIGlmICghY29udGV4dCAmJiBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRcdHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cmkgJiYgW1NjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIFNjaGVtYXMudW50aXRsZWRdLmluY2x1ZGVzKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdGZpbGVzLnB1c2godXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZXM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JSZXNvdXJjZXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFVSSVtdIHtcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblxuXHRcdHJldHVybiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNcblx0XHRcdC5mbGF0TWFwKGdyb3VwZWRFZGl0b3IgPT4gZ3JvdXBlZEVkaXRvci5lZGl0b3JzKVxuXHRcdFx0Lm1hcChlZGl0b3IgPT4gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSkpXG5cdFx0XHQuZmlsdGVyKHVyaSA9PiB1cmkgIT09IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgQXR0YWNoRmlsZVRvQ2hhdEFjdGlvbiBleHRlbmRzIEF0dGFjaFJlc291cmNlQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaEZpbGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBdHRhY2hGaWxlVG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaEZpbGUubGFiZWwnLCBcIkFkZCBGaWxlIHRvIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uYXR0YWNoLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ3pfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIFNlYXJjaENvbnRleHQuRmlsZU1hdGNoT3JNYXRjaEZvY3VzS2V5LCBTZWFyY2hDb250ZXh0LlNlYXJjaFJlc3VsdEhlYWRlckZvY3VzZWQubmVnYXRlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkV4cGxvcmVyQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICc1X2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdEV4cGxvcmVyRm9sZGVyQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzJfY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmZpbGUpLFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVSZW1vdGUpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnVudGl0bGVkKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVXNlckRhdGEpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsXG5cdFx0XHRcdGdyb3VwOiAnMF9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24ubmVnYXRlKCkpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMF9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24ubmVnYXRlKCkpXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aFdpZGdldChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBJQ2hhdFdpZGdldCwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXMgPSB0aGlzLl9nZXRSZXNvdXJjZXMoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHRcdGlmICghZmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBdHRhY2hGb2xkZXJUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBdHRhY2hSZXNvdXJjZUFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hGb2xkZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBdHRhY2hGb2xkZXJUb0NoYXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoRm9sZGVyLmxhYmVsJywgXCJBZGQgRm9sZGVyIHRvIENoYXRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnNV9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRFeHBsb3JlckZvbGRlckNvbnRleHQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmZpbGUpLFxuXHRcdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LlNjaGVtZS5pc0VxdWFsVG8oU2NoZW1hcy52c2NvZGVSZW1vdGUpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5XaXRoV2lkZ2V0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fZ2V0UmVzb3VyY2VzKGFjY2Vzc29yLCAuLi5hcmdzKTtcblx0XHRpZiAoIWZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRm9sZGVyKGZvbGRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEF0dGFjaFBpbm5lZEVkaXRvcnNUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaFBpbm5lZEVkaXRvcnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBdHRhY2hQaW5uZWRFZGl0b3JzVG9DaGF0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaFBpbm5lZEVkaXRvcnMubGFiZWwnLCBcIkFkZCBQaW5uZWQgRWRpdG9ycyB0byBDaGF0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbih3aXRoQ2hhdFZpZXcpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZXM6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLmdyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXAuZWRpdG9ycykge1xuXHRcdFx0XHRpZiAoZ3JvdXAuaXNQaW5uZWQoZWRpdG9yKSkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdFx0XHRcdGlmICh1cmkgJiYgW1NjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIFNjaGVtYXMudW50aXRsZWRdLmluY2x1ZGVzKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHVyaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFmaWxlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGZpbGUpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBdHRhY2hTZWxlY3Rpb25Ub0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaFNlbGVjdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEF0dGFjaFNlbGVjdGlvblRvQ2hhdEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hTZWxlY3Rpb24ubGFiZWwnLCBcIkFkZCBTZWxlY3Rpb24gdG8gQ2hhdFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hdHRhY2gsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnMV9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNOb25FbXB0eVNlbGVjdGlvbixcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSksXG5cdFx0XHRcdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnVudGl0bGVkKSxcblx0XHRcdFx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMudnNjb2RlVXNlckRhdGEpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UsXG5cdFx0XHRcdGdyb3VwOiAnMF9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24pXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMF9jaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24pXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiBhbnlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuaW52b2tlRnVuY3Rpb24od2l0aENoYXRWaWV3KTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtfLCBtYXRjaGVzXSA9IGFyZ3M7XG5cdFx0Ly8gSWYgd2UgaGF2ZSBzZWFyY2ggbWF0Y2hlcywgaXQgbWVhbnMgdGhpcyBpcyBjb21pbmcgZnJvbSB0aGUgc2VhcmNoIHdpZGdldFxuXHRcdGlmIChtYXRjaGVzICYmIG1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdXJpcyA9IG5ldyBNYXA8VVJJLCBSYW5nZSB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKG1hdGNoKSkge1xuXHRcdFx0XHRcdHVyaXMuc2V0KG1hdGNoLnJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRleHQgPSB7IHVyaTogbWF0Y2guX3BhcmVudC5yZXNvdXJjZSwgcmFuZ2U6IG1hdGNoLl9yYW5nZSB9O1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gdXJpcy5nZXQoY29udGV4dC51cmkpO1xuXHRcdFx0XHRcdGlmICghcmFuZ2UgfHxcblx0XHRcdFx0XHRcdHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gY29udGV4dC5yYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgcmFuZ2UuZW5kTGluZU51bWJlciAhPT0gY29udGV4dC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHR1cmlzLnNldChjb250ZXh0LnVyaSwgY29udGV4dC5yYW5nZSk7XG5cdFx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoY29udGV4dC51cmksIGNvbnRleHQucmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gQWRkIHRoZSByb290IGZpbGVzIGZvciBhbGwgb2YgdGhlIG9uZXMgdGhhdCBkaWRuJ3QgaGF2ZSBhIG1hdGNoXG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG5cdFx0XHRcdGNvbnN0IFtyZXNvdXJjZSwgcmFuZ2VdID0gdXJpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0Y29uc3QgYWN0aXZlVXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3IgJiYgYWN0aXZlVXJpICYmIFtTY2hlbWFzLmZpbGUsIFNjaGVtYXMudnNjb2RlUmVtb3RlLCBTY2hlbWFzLnVudGl0bGVkXS5pbmNsdWRlcyhhY3RpdmVVcmkuc2NoZW1lKSkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhY3RpdmVFZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmlzRW1wdHkoKSA/IG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICsgMSwgMSkgOiBzZWxlY3Rpb247XG5cdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGFjdGl2ZVVyaSwgcmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBdHRhY2hTZWFyY2hSZXN1bHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBOYW1lID0gJ3NlYXJjaFJlc3VsdHMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydFNlYXJjaFJlc3VsdHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5pbnNlcnRTZWFyY2hSZXN1bHRzJywgJ0FkZCBTZWFyY2ggUmVzdWx0cyB0byBDaGF0JyksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICd6X2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdFNlYXJjaENvbnRleHQuU2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZCksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmludm9rZUZ1bmN0aW9uKHdpdGhDaGF0Vmlldyk7XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnSW5zZXJ0U2VhcmNoUmVzdWx0QWN0aW9uOiBubyBjaGF0IHZpZXcgYXZhaWxhYmxlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gd2lkZ2V0LmlucHV0RWRpdG9yO1xuXHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkgPz8gZWRpdG9yLmdldE1vZGVsKCk/LmdldEZ1bGxNb2RlbFJhbmdlKCkuY29sbGFwc2VUb0VuZCgpO1xuXG5cdFx0aWYgKCFvcmlnaW5hbFJhbmdlKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdJbnNlcnRTZWFyY2hSZXN1bHRBY3Rpb246IG5vIHNlbGVjdGlvbicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbnNlcnRUZXh0ID0gYCMke0F0dGFjaFNlYXJjaFJlc3VsdEFjdGlvbi5OYW1lfWA7XG5cdFx0Y29uc3QgdmFyUmFuZ2UgPSBuZXcgUmFuZ2Uob3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4sIG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIgKyBpbnNlcnRUZXh0Lmxlbmd0aCk7XG5cdFx0Ly8gY2hlY2sgY2hhcmFjdGVyIGJlZm9yZSB0aGUgc3RhcnQgb2YgdGhlIHJhbmdlLiBJZiBpdCdzIG5vdCBhIHNwYWNlLCBhZGQgYSBzcGFjZVxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsICYmIG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2Uob3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbikpICE9PSAnICcpIHtcblx0XHRcdGluc2VydFRleHQgPSAnICcgKyBpbnNlcnRUZXh0O1xuXHRcdH1cblx0XHRjb25zdCBzdWNjZXNzID0gZWRpdG9yLmV4ZWN1dGVFZGl0cygnY2hhdEluc2VydFNlYXJjaCcsIFt7IHJhbmdlOiB2YXJSYW5nZSwgdGV4dDogaW5zZXJ0VGV4dCArICcgJyB9XSk7XG5cdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBJbnNlcnRTZWFyY2hSZXN1bHRBY3Rpb246IGZhaWxlZCB0byBpbnNlcnQgXCIke2luc2VydFRleHR9XCJgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cbn1cblxuLyoqIFRoaXMgaXMgb3VyIHR5cGUgKi9cbmludGVyZmFjZSBJQ29udGV4dFBpY2tJdGVtSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0a2luZDogJ2NvbnRleHRQaWNrJztcblx0aXRlbTogSUNoYXRDb250ZXh0VmFsdWVJdGVtIHwgSUNoYXRDb250ZXh0UGlja2VySXRlbTtcbn1cblxuLyoqIFRoZXNlIGFyZSB0aGUgdHlwZXMgd2UgZ2V0IGZyb20gXCJwbGF0Zm9ybSBRUFwiICovXG50eXBlIElRdWlja1BpY2tTZXJ2aWNlUGlja0l0ZW0gPSBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0gfCBJU3ltYm9sUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlO1xuXG5mdW5jdGlvbiBpc0lDb250ZXh0UGlja0l0ZW1JdGVtKG9iajogdW5rbm93bik6IG9iaiBpcyBJQ29udGV4dFBpY2tJdGVtSXRlbSB7XG5cdHJldHVybiAoXG5cdFx0aXNPYmplY3Qob2JqKVxuXHRcdCYmIHR5cGVvZiAoPElDb250ZXh0UGlja0l0ZW1JdGVtPm9iaikua2luZCA9PT0gJ3N0cmluZydcblx0XHQmJiAoPElDb250ZXh0UGlja0l0ZW1JdGVtPm9iaikua2luZCA9PT0gJ2NvbnRleHRQaWNrJ1xuXHQpO1xufVxuXG5mdW5jdGlvbiBpc0lHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbShvYmo6IHVua25vd24pOiBvYmogaXMgSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtIHtcblx0cmV0dXJuIChcblx0XHRpc09iamVjdChvYmopXG5cdFx0JiYgdHlwZW9mIChvYmogYXMgSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKS5zeW1ib2xOYW1lID09PSAnc3RyaW5nJ1xuXHRcdCYmICEhKG9iaiBhcyBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0pLnVyaVxuXHRcdCYmICEhKG9iaiBhcyBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0pLnJhbmdlKTtcbn1cblxuZnVuY3Rpb24gaXNJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZShvYmo6IHVua25vd24pOiBvYmogaXMgSVF1aWNrUGlja0l0ZW1XaXRoUmVzb3VyY2Uge1xuXHRyZXR1cm4gKFxuXHRcdGlzT2JqZWN0KG9iailcblx0XHQmJiBVUkkuaXNVcmkoKG9iaiBhcyBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSkucmVzb3VyY2UpKTtcbn1cblxuXG5leHBvcnQgY2xhc3MgQXR0YWNoQ29udGV4dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaENvbnRleHQubGFiZWwuMicsIFwiQWRkIENvbnRleHQuLi5cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFkZENvbXBhY3QsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCwgQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TbGFzaCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTFcblx0XHRcdH0sIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSksXG5cdFx0XHRcdFx0Q1RYX0lOTElORV9DSEFUX1YyX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0LFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuYWdlbnRTdXBwb3J0c0F0dGFjaG1lbnRzXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogLTFcblx0XHRcdH1dLFxuXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRQaWNrU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdENvbnRleHRQaWNrU2VydmljZSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyB7IHdpZGdldD86IElDaGF0V2lkZ2V0OyBwbGFjZWhvbGRlcj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQ/LndpZGdldCA/PyB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVpY2tQaWNrSXRlbXM6IElDb250ZXh0UGlja0l0ZW1JdGVtW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjb250ZXh0UGlja1NlcnZpY2UuaXRlbXMpIHtcblxuXHRcdFx0aWYgKGl0ZW0uaXNFbmFibGVkICYmICFhd2FpdCBpdGVtLmlzRW5hYmxlZCh3aWRnZXQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0a2luZDogJ2NvbnRleHRQaWNrJyxcblx0XHRcdFx0aXRlbSxcblx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGl0ZW0uaWNvbiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IGl0ZW0uY29tbWFuZElkID8ga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhpdGVtLmNvbW1hbmRJZCwgY29udGV4dEtleVNlcnZpY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5fc2hvdy5iaW5kKHRoaXMpLCB3aWRnZXQsIHF1aWNrUGlja0l0ZW1zLCBjb250ZXh0Py5wbGFjZWhvbGRlcik7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCBhZGRpdGlvblBpY2tzOiBJQ29udGV4dFBpY2tJdGVtSXRlbVtdIHwgdW5kZWZpbmVkLCBwbGFjZWhvbGRlcj86IHN0cmluZykge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tDaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJPcHRpb25zOiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zID0ge1xuXHRcdFx0ZmlsdGVyOiAocGljaykgPT4ge1xuXHRcdFx0XHRpZiAoaXNJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZShwaWNrKSAmJiBwaWNrLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUoYWNjZXNzb3IsIHBpY2sucmVzb3VyY2UhLnNjaGVtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uUGlja3MsXG5cdFx0XHRoYW5kbGVBY2NlcHQ6IGFzeW5jIChpdGVtOiBJUXVpY2tQaWNrU2VydmljZVBpY2tJdGVtIHwgSUNvbnRleHRQaWNrSXRlbUl0ZW0sIGlzQmFja2dyb3VuZEFjY2VwdDogYm9vbGVhbikgPT4ge1xuXG5cdFx0XHRcdGlmIChpc0lDb250ZXh0UGlja0l0ZW1JdGVtKGl0ZW0pKSB7XG5cblx0XHRcdFx0XHRsZXQgaXNEb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoaXRlbS5pdGVtLnR5cGUgPT09ICd2YWx1ZVBpY2snKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oYW5kbGVDb250ZXh0UGljayhpdGVtLml0ZW0sIHdpZGdldCk7XG5cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0uaXRlbS50eXBlID09PSAncGlja2VyUGljaycpIHtcblx0XHRcdFx0XHRcdGlzRG9uZSA9IGF3YWl0IHRoaXMuX2hhbmRsZUNvbnRleHRQaWNrZXJJdGVtKHF1aWNrSW5wdXRTZXJ2aWNlLCBjb21tYW5kU2VydmljZSwgaXRlbS5pdGVtLCB3aWRnZXQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghaXNEb25lKSB7XG5cdFx0XHRcdFx0XHQvLyByZXN0YXJ0IHBpY2tlciB3aGVuIHN1Yi1waWNrZXIgZGlkbid0IHJldHVybiBhbnl0aGluZ1xuXHRcdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odGhpcy5fc2hvdy5iaW5kKHRoaXMpLCB3aWRnZXQsIGFkZGl0aW9uUGlja3MsIHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0aGlzLl9oYW5kbGVRUFBpY2suYmluZCh0aGlzKSwgd2lkZ2V0LCBpc0JhY2tncm91bmRBY2NlcHQsIGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc1F1aWNrQ2hhdCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0cXVpY2tDaGF0U2VydmljZS5vcGVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnJywge1xuXHRcdFx0ZW5hYmxlZFByb3ZpZGVyUHJlZml4ZXM6IFtcblx0XHRcdFx0QW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0XHRcdFx0U3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLFxuXHRcdFx0XHRBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWFxuXHRcdFx0XSxcblx0XHRcdHBsYWNlaG9sZGVyOiBwbGFjZWhvbGRlciA/PyBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoLnBsYWNlaG9sZGVyJywgJ1NlYXJjaCBhdHRhY2htZW50cycpLFxuXHRcdFx0cHJvdmlkZXJPcHRpb25zLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUVBQaWNrKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCBpc0luQmFja2dyb3VuZDogYm9vbGVhbiwgcGljazogSVF1aWNrUGlja1NlcnZpY2VQaWNrSXRlbSkge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSk7XG5cblx0XHRjb25zdCB0b0F0dGFjaDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cblx0XHRpZiAoaXNJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZShwaWNrKSAmJiBwaWNrLnJlc291cmNlKSB7XG5cdFx0XHRpZiAoL1xcLihwbmd8anBnfGpwZWd8Ym1wfGdpZnx0aWZmKSQvaS50ZXN0KHBpY2sucmVzb3VyY2UucGF0aCkpIHtcblx0XHRcdFx0Ly8gY2hlY2tzIGlmIHRoZSBmaWxlIGlzIGFuIGltYWdlXG5cdFx0XHRcdGlmIChVUkkuaXNVcmkocGljay5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHQvLyByZWFkIHRoZSBpbWFnZSBhbmQgYXR0YWNoIGEgbmV3IGZpbGUgY29udGV4dC5cblx0XHRcdFx0XHRjb25zdCByZWFkRmlsZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHBpY2sucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc2l6ZWRJbWFnZSA9IGF3YWl0IHJlc2l6ZUltYWdlKHJlYWRGaWxlLnZhbHVlLmJ1ZmZlcik7XG5cdFx0XHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogcGljay5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0bmFtZTogcGljay5sYWJlbCxcblx0XHRcdFx0XHRcdGZ1bGxOYW1lOiBwaWNrLmxhYmVsLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHJlc2l6ZWRJbWFnZSxcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0XHRyZWZlcmVuY2VzOiBbeyByZWZlcmVuY2U6IHBpY2sucmVzb3VyY2UsIGtpbmQ6ICdyZWZlcmVuY2UnIH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGljay5yZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQnJvd3Nlcikge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IGNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZUVkaXRvckF0dGFjaENvbnRleHQoeyByZXNvdXJjZTogcGljay5yZXNvdXJjZSB9KTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0dG9BdHRhY2gucHVzaChlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBvbWl0dGVkU3RhdGUgPSBPbWl0dGVkU3RhdGUuTm90T21pdHRlZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjcmVhdGVkTW9kZWwgPSBhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHBpY2sucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNyZWF0ZWRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5GdWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRcdGlkOiBwaWNrLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0dmFsdWU6IHBpY2sucmVzb3VyY2UsXG5cdFx0XHRcdFx0bmFtZTogcGljay5sYWJlbCxcblx0XHRcdFx0XHRvbWl0dGVkU3RhdGVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0lHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbShwaWNrKSAmJiBwaWNrLnVyaSAmJiBwaWNrLnJhbmdlKSB7XG5cdFx0XHR0b0F0dGFjaC5wdXNoKHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRpZDogSlNPTi5zdHJpbmdpZnkoeyB1cmk6IHBpY2sudXJpLCByYW5nZTogcGljay5yYW5nZS5kZWNvcmF0aW9uIH0pLFxuXHRcdFx0XHR2YWx1ZTogeyB1cmk6IHBpY2sudXJpLCByYW5nZTogcGljay5yYW5nZS5kZWNvcmF0aW9uIH0sXG5cdFx0XHRcdGZ1bGxOYW1lOiBwaWNrLmxhYmVsLFxuXHRcdFx0XHRuYW1lOiBwaWNrLnN5bWJvbE5hbWUhLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cblx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4udG9BdHRhY2gpO1xuXG5cdFx0aWYgKCFpc0luQmFja2dyb3VuZCkge1xuXHRcdFx0Ly8gU2V0IGZvY3VzIGJhY2sgaW50byB0aGUgaW5wdXQgb25jZSB0aGUgdXNlciBpcyBkb25lIGF0dGFjaGluZyBpdGVtc1xuXHRcdFx0Ly8gc28gdGhhdCB0aGUgdXNlciBjYW4gc3RhcnQgdHlwaW5nIHRoZWlyIG1lc3NhZ2Vcblx0XHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29udGV4dFBpY2soaXRlbTogSUNoYXRDb250ZXh0VmFsdWVJdGVtLCB3aWRnZXQ6IElDaGF0V2lkZ2V0KSB7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGl0ZW0uYXNBdHRhY2htZW50KHdpZGdldCk7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4udmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUpIHtcblx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29udGV4dFBpY2tlckl0ZW0ocXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSwgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwgaXRlbTogSUNoYXRDb250ZXh0UGlja2VySXRlbSwgd2lkZ2V0OiBJQ2hhdFdpZGdldCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Y29uc3QgcGlja2VyQ29uZmlnID0gaXRlbS5hc1BpY2tlcih3aWRnZXQpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBnb0JhY2tJdGVtOiBJUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ29CYWNrJywgJ0dvIGJhY2sgXHUyMUE5JyksXG5cdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0fTtcblx0XHRjb25zdCBjb25maWd1cmVJdGVtID0gcGlja2VyQ29uZmlnLmNvbmZpZ3VyZSA/IHtcblx0XHRcdGxhYmVsOiBwaWNrZXJDb25maWcuY29uZmlndXJlLmxhYmVsLFxuXHRcdFx0Y29tbWFuZElkOiBwaWNrZXJDb25maWcuY29uZmlndXJlLmNvbW1hbmRJZCxcblx0XHRcdGFsd2F5c1Nob3c6IHRydWVcblx0XHR9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGV4dHJhUGlja3M6IFF1aWNrUGlja0l0ZW1bXSA9IFt7IHR5cGU6ICdzZXBhcmF0b3InIH1dO1xuXHRcdGlmIChjb25maWd1cmVJdGVtKSB7XG5cdFx0XHRleHRyYVBpY2tzLnB1c2goY29uZmlndXJlSXRlbSk7XG5cdFx0fVxuXHRcdGV4dHJhUGlja3MucHVzaChnb0JhY2tJdGVtKTtcblxuXHRcdGNvbnN0IHFwID0gc3RvcmUuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0c3RvcmUuYWRkKHFwLm9uRGlkSGlkZSgoKSA9PiBjdHMuY2FuY2VsKCkpKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRxcC5wbGFjZWhvbGRlciA9IHBpY2tlckNvbmZpZy5wbGFjZWhvbGRlcjtcblx0XHRxcC5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHFwLm1hdGNoT25EZXRhaWwgPSB0cnVlO1xuXHRcdC8vIHFwLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRxcC5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdHFwLmJ1c3kgPSB0cnVlO1xuXHRcdHFwLnNob3coKTtcblxuXHRcdGlmIChpc1RoZW5hYmxlKHBpY2tlckNvbmZpZy5waWNrcykpIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgKHBpY2tlckNvbmZpZy5waWNrcy50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0cmV0dXJuIChbXSBhcyBRdWlja1BpY2tJdGVtW10pLmNvbmNhdCh2YWx1ZSwgZXh0cmFQaWNrcyk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHFwLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRxcC5idXN5ID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZz4oJ2F0dGFjaENvbnRleHQucXVlcnknLCBxcC52YWx1ZSk7XG5cdFx0XHRzdG9yZS5hZGQocXAub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiBxdWVyeS5zZXQocXAudmFsdWUsIHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0Y29uc3QgcGlja3NPYnNlcnZhYmxlID0gcGlja2VyQ29uZmlnLnBpY2tzKHF1ZXJ5LCBjdHMudG9rZW4pO1xuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgeyBidXN5LCBwaWNrcyB9ID0gcGlja3NPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cXAuaXRlbXMgPSAoW10gYXMgUXVpY2tQaWNrSXRlbVtdKS5jb25jYXQocGlja3MsIGV4dHJhUGlja3MpO1xuXHRcdFx0XHRxcC5idXN5ID0gYnVzeTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRwaWNrZXJDb25maWcuZGlzcG9zZT8uKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gcGlja2VyIGdvdCBoaWRkZW4gYWxyZWFkeVxuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmVyID0gbmV3IERlZmVycmVkUHJvbWlzZTxib29sZWFuPigpO1xuXHRcdGNvbnN0IGFkZFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblxuXHRcdHN0b3JlLmFkZChxcC5vbkRpZEFjY2VwdChhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IG5vb3AgPSAnbm9vcCc7XG5cdFx0XHRjb25zdCBbc2VsZWN0ZWRdID0gcXAuc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmIChpc0NoYXRDb250ZXh0UGlja2VyUGlja0l0ZW0oc2VsZWN0ZWQpKSB7XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBzZWxlY3RlZC5hc0F0dGFjaG1lbnQoKTtcblx0XHRcdFx0aWYgKCFhdHRhY2htZW50IHx8IGF0dGFjaG1lbnQgPT09IG5vb3ApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzVGhlbmFibGUoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0XHRhZGRQcm9taXNlcy5wdXNoKGF0dGFjaG1lbnQudGhlbih2ID0+IHtcblx0XHRcdFx0XHRcdGlmICh2ICE9PSBub29wKSB7XG5cdFx0XHRcdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi5hc0FycmF5KHYpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmFzQXJyYXkoYXR0YWNobWVudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VsZWN0ZWQgPT09IGdvQmFja0l0ZW0pIHtcblx0XHRcdFx0aWYgKHBpY2tlckNvbmZpZy5nb0JhY2s/LigpKSB7XG5cdFx0XHRcdFx0Ly8gQ3VzdG9tIGdvQmFjayBoYW5kbGVkIHRoZSBuYXZpZ2F0aW9uLCBzdGF5IGluIHRoZSBwaWNrZXJcblx0XHRcdFx0XHRyZXR1cm47IC8vIERvbid0IGNvbXBsZXRlLCBrZWVwIHBpY2tlciBvcGVuXG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRGVmYXVsdCBiZWhhdmlvcjogZ28gYmFjayB0byBtYWluIHBpY2tlclxuXHRcdFx0XHRkZWZlci5jb21wbGV0ZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VsZWN0ZWQgPT09IGNvbmZpZ3VyZUl0ZW0pIHtcblx0XHRcdFx0ZGVmZXIuY29tcGxldGUodHJ1ZSk7XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbmZpZ3VyZUl0ZW0uY29tbWFuZElkKTtcblx0XHRcdH1cblx0XHRcdGlmICghZS5pbkJhY2tncm91bmQpIHtcblx0XHRcdFx0ZGVmZXIuY29tcGxldGUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKHFwLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRkZWZlci5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdHBpY2tlckNvbmZpZy5kaXNwb3NlPy4oKTtcblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGVmZXIucDtcblx0XHRcdHFwLmJ1c3kgPSB0cnVlOyAvLyBpZiBzdGlsbCB2aXNpYmxlXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChhZGRQcm9taXNlcyk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsa0JBQWtCO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZDQUF1RTtBQUNoRixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUywwQkFBcUY7QUFDOUYsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0IseUJBQXlCLHdCQUF3QjtBQUNsRixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHVCQUF1Qix5QkFBeUI7QUFDekQsU0FBK0Isa0NBQWtDO0FBQ2pFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW9DLG9CQUFvQjtBQUN4RCxTQUFTLG1CQUFtQixpQ0FBaUM7QUFDN0QsU0FBc0Isb0JBQW9CLHlCQUF5QjtBQUNuRSxT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
