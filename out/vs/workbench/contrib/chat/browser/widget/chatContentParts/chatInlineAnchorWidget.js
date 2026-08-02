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
var _a, _b, _c, _d, _e, _f, _g;
import "./media/chatInlineAnchorWidget.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { SymbolKinds } from "../../../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefinitionAction } from "../../../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import * as nls from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { FileKind, IFileService } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { FolderThemeIcon, IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { fillEditorsDragData } from "../../../../../browser/dnd.js";
import { StaticResourceContextKey } from "../../../../../common/contextkeys.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { INotebookDocumentService } from "../../../../../services/notebook/common/notebookDocumentService.js";
import { ExplorerFolderContext } from "../../../../files/common/files.js";
import { IChatWidgetService } from "../../chat.js";
import { IChatImageCarouselService } from "../../chatImageCarouselService.js";
import { chatAttachmentResourceContextKey, hookUpSymbolAttachmentDragAndContextMenu } from "../../attachments/chatAttachmentWidgets.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { getMediaMime } from "../../../../../../base/common/mime.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { BrowserEditorInput } from "../../../../browserView/common/browserEditorInput.js";
import { getEditorOverrideForChatResource } from "../chatEditorAssociations.js";
function renderFileWidgets(element, instantiationService, chatMarkdownAnchorService, disposables, options) {
  const links = element.querySelectorAll("a");
  links.forEach((a) => {
    const linkText = a.textContent?.trim();
    let shouldRenderWidget = false;
    let metadata;
    const href = a.getAttribute("data-href");
    let uri;
    if (href) {
      try {
        uri = URI.parse(href);
      } catch {
      }
    }
    if (!linkText) {
      shouldRenderWidget = true;
    } else if (uri) {
      const searchParams = new URLSearchParams(uri.query);
      const vscodeLinkType = searchParams.get("vscodeLinkType");
      if (vscodeLinkType) {
        metadata = {
          vscodeLinkType,
          linkText
        };
        shouldRenderWidget = true;
        searchParams.delete("vscodeLinkType");
        const remainingQuery = searchParams.toString();
        uri = uri.with({ query: remainingQuery });
      }
    }
    if (shouldRenderWidget && uri?.scheme) {
      const widget = instantiationService.createInstance(InlineAnchorWidget, a, { kind: "inlineReference", inlineReference: uri }, metadata, options);
      disposables.add(chatMarkdownAnchorService.register(widget));
      disposables.add(widget);
    }
  });
}
let InlineAnchorWidget = class extends Disposable {
  constructor(element, inlineReference, metadata, options, chatImageCarouselService, configurationService, originalContextKeyService, contextMenuService, fileService, hoverService, instantiationService, labelService, languageService, menuService, modelService, telemetryService, themeService, notebookDocumentService, openerService, editorService) {
    super();
    this.element = element;
    this.inlineReference = inlineReference;
    this.metadata = metadata;
    this.options = options;
    this.chatImageCarouselService = chatImageCarouselService;
    this.configurationService = configurationService;
    this.notebookDocumentService = notebookDocumentService;
    this.openerService = openerService;
    this.editorService = editorService;
    this.data = "uri" in inlineReference.inlineReference ? inlineReference.inlineReference : "name" in inlineReference.inlineReference ? { kind: "symbol", symbol: inlineReference.inlineReference } : { uri: inlineReference.inlineReference };
    element.classList.add(InlineAnchorWidget.className, "show-file-icons");
    let iconText;
    let iconClasses;
    let location;
    if (this.data.kind === "symbol") {
      const symbol = this.data.symbol;
      location = this.data.symbol.location;
      iconText = [this.data.symbol.name];
      iconClasses = ["codicon", ...getIconClasses(modelService, languageService, void 0, void 0, SymbolKinds.toIcon(symbol.kind))];
      this._store.add(instantiationService.invokeFunction((accessor) => hookUpSymbolAttachmentDragAndContextMenu(accessor, element, originalContextKeyService, { value: symbol.location, name: symbol.name, kind: symbol.kind }, MenuId.ChatInlineSymbolAnchorContext)));
    } else {
      location = this.data;
      const filePathLabel = this.metadata?.linkText ?? labelService.getUriBasenameLabel(location.uri);
      let defaultIcon;
      if (location.range && this.data.kind !== "symbol") {
        const suffix = location.range.startLineNumber === location.range.endLineNumber ? `:${location.range.startLineNumber}` : `:${location.range.startLineNumber}-${location.range.endLineNumber}`;
        iconText = [filePathLabel, dom.$("span.label-suffix", void 0, suffix)];
      } else if (location.uri.scheme === "vscode-notebook-cell" && this.data.kind !== "symbol") {
        iconText = [`${filePathLabel} \u2022 cell${this.getCellIndex(location.uri)}`];
      } else if (location.uri.scheme === Schemas.vscodeBrowser) {
        defaultIcon = Codicon.globe;
        const editorName = this.editorService.findEditors(location.uri)[0]?.editor?.getName() ?? BrowserEditorInput.DEFAULT_LABEL;
        iconText = [editorName];
      } else {
        iconText = [filePathLabel];
      }
      let fileKind = location.uri.path.endsWith("/") ? FileKind.FOLDER : FileKind.FILE;
      const recomputeIconClasses = () => getIconClasses(modelService, languageService, location.uri, fileKind, fileKind === FileKind.FOLDER && !themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : defaultIcon);
      iconClasses = recomputeIconClasses();
      const refreshIconClasses = () => {
        iconEl.classList.remove(...iconClasses);
        iconClasses = recomputeIconClasses();
        iconEl.classList.add(...iconClasses);
      };
      let isDirectory = false;
      fileService.stat(location.uri).then((stat) => {
        isDirectory = stat.isDirectory;
        if (stat.isDirectory) {
          fileKind = FileKind.FOLDER;
          refreshIconClasses();
        }
      }).catch(() => {
      });
      let contextKeyService;
      let isFolderContext;
      let contextMenuInitialized = false;
      const ensureContextKeyService = () => {
        if (!contextKeyService) {
          contextKeyService = this._register(originalContextKeyService.createScoped(element));
          chatAttachmentResourceContextKey.bindTo(contextKeyService).set(location.uri.toString());
          isFolderContext = ExplorerFolderContext.bindTo(contextKeyService);
        }
        return contextKeyService;
      };
      this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (domEvent) => {
        const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
        dom.EventHelper.stop(domEvent, true);
        const cks = ensureContextKeyService();
        if (!contextMenuInitialized) {
          contextMenuInitialized = true;
          const resourceContextKey = new StaticResourceContextKey(cks, fileService, languageService, modelService);
          resourceContextKey.set(location.uri);
        }
        isFolderContext.set(isDirectory);
        if (this._store.isDisposed) {
          return;
        }
        contextMenuService.showContextMenu({
          contextKeyService: cks,
          getAnchor: () => event,
          getActions: () => {
            const menu = menuService.getMenuActions(MenuId.ChatInlineResourceAnchorContext, cks, { arg: location.uri });
            return getFlatContextMenuActions(menu);
          }
        });
      }));
      if (location.range) {
        if (location.range.startLineNumber === location.range.endLineNumber) {
          element.setAttribute("aria-label", nls.localize("chat.inlineAnchor.ariaLabel.line", "{0} line {1}", filePathLabel, location.range.startLineNumber));
        } else {
          element.setAttribute("aria-label", nls.localize("chat.inlineAnchor.ariaLabel.range", "{0} lines {1} to {2}", filePathLabel, location.range.startLineNumber, location.range.endLineNumber));
        }
      }
    }
    const iconEl = dom.$("span.icon");
    iconEl.classList.add(...iconClasses);
    element.replaceChildren(iconEl, dom.$("span.icon-label", {}, ...iconText));
    const fragment = location.range ? `${location.range.startLineNumber},${location.range.startColumn}` : "";
    element.setAttribute("data-href", (fragment ? location.uri.with({ fragment }) : location.uri).toString());
    const relativeLabel = labelService.getUriLabel(location.uri, { relative: true });
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), element, relativeLabel));
    if (this.data.kind !== "symbol") {
      element.draggable = true;
      this._register(dom.addDisposableListener(element, "dragstart", (e) => {
        const stat = {
          resource: location.uri,
          selection: location.range
        };
        instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, [stat], e));
        e.dataTransfer?.setDragImage(element, 0, 0);
      }));
    }
    this._register(dom.addDisposableListener(element, "click", async (e) => {
      dom.EventHelper.stop(e, true);
      const editorOverride = getEditorOverrideForChatResource(location.uri, this.configurationService);
      const editorOptions = {
        override: editorOverride,
        selection: location.range
      };
      const open = async () => {
        if (this.options?.openResource && await this.options.openResource(location.uri, editorOptions)) {
          return;
        }
        const mimeType = getMediaMime(location.uri.path);
        if (mimeType?.startsWith("image/") && this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
          await this.chatImageCarouselService.openCarouselAtResource(location.uri);
          return;
        }
        await this.openerService.open(location.uri, {
          fromUserGesture: true,
          editorOptions
        });
      };
      if (this.options?.trackOpen) {
        await this.options.trackOpen(open);
      } else {
        await open();
      }
    }));
  }
  getHTMLElement() {
    return this.element;
  }
  getCellIndex(location) {
    const notebook = this.notebookDocumentService.getNotebook(location);
    const index = notebook?.getCellIndex(location) ?? -1;
    return index >= 0 ? ` ${index + 1}` : "";
  }
};
InlineAnchorWidget.className = "chat-inline-anchor-widget";
InlineAnchorWidget = __decorateClass([
  __decorateParam(4, IChatImageCarouselService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ILabelService),
  __decorateParam(12, ILanguageService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IModelService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, IThemeService),
  __decorateParam(17, INotebookDocumentService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IEditorService)
], InlineAnchorWidget);
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: _a.id,
      title: nls.localize2("actions.attach.label", "Add File to Chat"),
      menu: [{
        id: MenuId.ChatInlineResourceAnchorContext,
        group: "chat",
        order: 1,
        when: ExplorerFolderContext.negate()
      }]
    });
  }
  async run(accessor, resource) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.lastFocusedWidget;
    if (widget) {
      widget.attachmentModel.addFile(resource);
    }
  }
}, _a.id = "chat.inlineResourceAnchor.addFileToChat", _a));
registerAction2((_b = class extends Action2 {
  constructor() {
    super({
      id: _b.id,
      title: nls.localize2("actions.copy.label", "Copy"),
      f1: false,
      precondition: chatAttachmentResourceContextKey,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyC
      }
    });
  }
  async run(accessor) {
    const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
    const clipboardService = accessor.get(IClipboardService);
    const anchor = chatWidgetService.lastFocusedAnchor;
    if (!anchor) {
      return;
    }
    const resource = anchor.data.kind === "symbol" ? anchor.data.symbol.location.uri : anchor.data.uri;
    clipboardService.writeResources([resource]);
  }
}, _b.id = "chat.inlineResourceAnchor.copyResource", _b));
registerAction2((_c = class extends Action2 {
  constructor() {
    super({
      id: _c.id,
      title: nls.localize2("actions.openToSide.label", "Open to the Side"),
      f1: false,
      precondition: chatAttachmentResourceContextKey,
      keybinding: {
        weight: KeybindingWeight.ExternalExtension + 2,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        }
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "navigation",
        order: 1
      }))
    });
  }
  async run(accessor, arg) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const target = this.getTarget(accessor, arg);
    if (!target) {
      return;
    }
    const targetUri = URI.isUri(target) ? target : target.uri;
    const editorOverride = getEditorOverrideForChatResource(targetUri, configurationService);
    const input = URI.isUri(target) ? { resource: target, options: { override: editorOverride } } : {
      resource: target.uri,
      options: {
        override: editorOverride,
        selection: {
          startColumn: target.range.startColumn,
          startLineNumber: target.range.startLineNumber
        }
      }
    };
    await editorService.openEditors([input], SIDE_GROUP);
  }
  getTarget(accessor, arg) {
    const chatWidgetService = accessor.get(IChatMarkdownAnchorService);
    if (arg) {
      return arg;
    }
    const anchor = chatWidgetService.lastFocusedAnchor;
    if (!anchor) {
      return void 0;
    }
    return anchor.data.kind === "symbol" ? anchor.data.symbol.location : anchor.data.uri;
  }
}, _c.id = "chat.inlineResourceAnchor.openToSide", _c));
registerAction2((_d = class extends Action2 {
  constructor() {
    super({
      id: _d.id,
      title: {
        ...nls.localize2("actions.goToDecl.label", "Go to Definition"),
        mnemonicTitle: nls.localize({ key: "miGotoDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Definition")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.1,
        when: EditorContextKeys.hasDefinitionProvider
      }))
    });
  }
  async run(accessor, location) {
    const editorService = accessor.get(ICodeEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    await openEditorWithSelection(editorService, location);
    const action = new DefinitionAction({ openToSide: false, openInPeek: false, muteMessage: true }, { title: { value: "", original: "" }, id: "", precondition: void 0 });
    return instantiationService.invokeFunction((accessor2) => action.run(accessor2));
  }
}, _d.id = "chat.inlineSymbolAnchor.goToDefinition", _d));
async function openEditorWithSelection(editorService, location) {
  await editorService.openCodeEditor({
    resource: location.uri,
    options: {
      selection: {
        startColumn: location.range.startColumn,
        startLineNumber: location.range.startLineNumber
      }
    }
  }, null);
}
async function runGoToCommand(accessor, command, location) {
  const editorService = accessor.get(ICodeEditorService);
  const commandService = accessor.get(ICommandService);
  await openEditorWithSelection(editorService, location);
  return commandService.executeCommand(command);
}
registerAction2((_e = class extends Action2 {
  constructor() {
    super({
      id: _e.id,
      title: {
        ...nls.localize2("goToTypeDefinitions.label", "Go to Type Definitions"),
        mnemonicTitle: nls.localize({ key: "miGotoTypeDefinition", comment: ["&& denotes a mnemonic"] }, "Go to &&Type Definitions")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.1,
        when: EditorContextKeys.hasTypeDefinitionProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToTypeDefinition", location);
  }
}, _e.id = "chat.inlineSymbolAnchor.goToTypeDefinitions", _e));
registerAction2((_f = class extends Action2 {
  constructor() {
    super({
      id: _f.id,
      title: {
        ...nls.localize2("goToImplementations.label", "Go to Implementations"),
        mnemonicTitle: nls.localize({ key: "miGotoImplementations", comment: ["&& denotes a mnemonic"] }, "Go to &&Implementations")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.2,
        when: EditorContextKeys.hasImplementationProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToImplementation", location);
  }
}, _f.id = "chat.inlineSymbolAnchor.goToImplementations", _f));
registerAction2((_g = class extends Action2 {
  constructor() {
    super({
      id: _g.id,
      title: {
        ...nls.localize2("goToReferences.label", "Go to References"),
        mnemonicTitle: nls.localize({ key: "miGotoReference", comment: ["&& denotes a mnemonic"] }, "Go to &&References")
      },
      menu: [MenuId.ChatInlineSymbolAnchorContext, MenuId.ChatInputSymbolAttachmentContext].map((id) => ({
        id,
        group: "4_symbol_nav",
        order: 1.3,
        when: EditorContextKeys.hasReferenceProvider
      }))
    });
  }
  async run(accessor, location) {
    await runGoToCommand(accessor, "editor.action.goToReferences", location);
  }
}, _g.id = "chat.inlineSymbolAnchor.goToReferences", _g));
export {
  InlineAnchorWidget,
  renderFileWidgets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRJbmxpbmVBbmNob3JXaWRnZXQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiwgU3ltYm9sS2luZHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IERlZmluaXRpb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub0NvbW1hbmRzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlU3RhdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMsIElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBGb2xkZXJUaGVtZUljb24sIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZpbGxFZGl0b3JzRHJhZ0RhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBTdGF0aWNSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbm90ZWJvb2svY29tbW9uL25vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyRm9sZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlU3ltYm9sIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0QXR0YWNobWVudFJlc291cmNlQ29udGV4dEtleSwgaG9va1VwU3ltYm9sQXR0YWNobWVudERyYWdBbmRDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXRNZWRpYU1pbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JPdmVycmlkZUZvckNoYXRSZXNvdXJjZSB9IGZyb20gJy4uL2NoYXRFZGl0b3JBc3NvY2lhdGlvbnMuanMnO1xuXG50eXBlIENvbnRlbnRSZWZEYXRhID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdzeW1ib2wnOyByZWFkb25seSBzeW1ib2w6IElXb3Jrc3BhY2VTeW1ib2wgfVxuXHR8IHtcblx0XHRyZWFkb25seSBraW5kPzogdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRcdHJlYWRvbmx5IHJhbmdlPzogSVJhbmdlO1xuXHR9O1xuXG50eXBlIElubGluZUFuY2hvcldpZGdldE1ldGFkYXRhID0ge1xuXHR2c2NvZGVMaW5rVHlwZTogc3RyaW5nO1xuXHRsaW5rVGV4dD86IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbmRlckZpbGVXaWRnZXRzT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG9wZW5SZXNvdXJjZT86IChyZXNvdXJjZTogVVJJLCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMpID0+IFByb21pc2U8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFdyYXBzIG9wZW5pbmcgdGhlIHJlc291cmNlIHNvIHRoYXQgY2FsbGVycyBjYW4gb2JzZXJ2ZSB3aGljaCBlZGl0b3JzIGEgY2xpY2sgb24gdGhlXG5cdCAqIGFuY2hvciBvcGVuZWQsIGZvciBleGFtcGxlIHRvIGNsb3NlIHRoZW0gYWdhaW4gbGF0ZXIuXG5cdCAqL1xuXHRyZWFkb25seSB0cmFja09wZW4/OiAob3BlbjogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckZpbGVXaWRnZXRzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IElSZW5kZXJGaWxlV2lkZ2V0c09wdGlvbnMpIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGNvbnN0IGxpbmtzID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCdhJyk7XG5cdGxpbmtzLmZvckVhY2goYSA9PiB7XG5cdFx0Ly8gRW1wdHkgbGluayB0ZXh0IC0+IHJlbmRlciBmaWxlIHdpZGdldFxuXHRcdC8vIEFsc28gc3VwcG9ydCBtZXRhZGF0YSBmb3JtYXQ6IFtsaW5rVGV4dF0oZmlsZTovLy8uLi51cmk/dnNjb2RlTGlua1R5cGU9Li4uKVxuXHRcdGNvbnN0IGxpbmtUZXh0ID0gYS50ZXh0Q29udGVudD8udHJpbSgpO1xuXHRcdGxldCBzaG91bGRSZW5kZXJXaWRnZXQgPSBmYWxzZTtcblx0XHRsZXQgbWV0YWRhdGE6IElubGluZUFuY2hvcldpZGdldE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgaHJlZiA9IGEuZ2V0QXR0cmlidXRlKCdkYXRhLWhyZWYnKTtcblx0XHRsZXQgdXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGhyZWYpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHVyaSA9IFVSSS5wYXJzZShocmVmKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBJbnZhbGlkIFVSSSwgc2tpcCByZW5kZXJpbmcgd2lkZ2V0XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFsaW5rVGV4dCkge1xuXHRcdFx0c2hvdWxkUmVuZGVyV2lkZ2V0ID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHVyaSkge1xuXHRcdFx0Ly8gQ2hlY2sgZm9yIHZzY29kZUxpbmtUeXBlIGluIHF1ZXJ5IHBhcmFtZXRlcnNcblx0XHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXModXJpLnF1ZXJ5KTtcblx0XHRcdGNvbnN0IHZzY29kZUxpbmtUeXBlID0gc2VhcmNoUGFyYW1zLmdldCgndnNjb2RlTGlua1R5cGUnKTtcblx0XHRcdGlmICh2c2NvZGVMaW5rVHlwZSkge1xuXHRcdFx0XHRtZXRhZGF0YSA9IHtcblx0XHRcdFx0XHR2c2NvZGVMaW5rVHlwZSxcblx0XHRcdFx0XHRsaW5rVGV4dFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzaG91bGRSZW5kZXJXaWRnZXQgPSB0cnVlO1xuXG5cdFx0XHRcdC8vIFN0cmlwIHZzY29kZUxpbmtUeXBlIGZyb20gdGhlIFVSSSBvbmNlIHdlJ3ZlIGV4dHJhY3RlZCB0aGUgbWV0YWRhdGEgZm9yIGJldHRlciBjb21wYXRpYmlsaXR5IHdpdGggZGlmZmVyZW50IEZTXG5cdFx0XHRcdHNlYXJjaFBhcmFtcy5kZWxldGUoJ3ZzY29kZUxpbmtUeXBlJyk7XG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZ1F1ZXJ5ID0gc2VhcmNoUGFyYW1zLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IHJlbWFpbmluZ1F1ZXJ5IH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzaG91bGRSZW5kZXJXaWRnZXQgJiYgdXJpPy5zY2hlbWUpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUFuY2hvcldpZGdldCwgYSwgeyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiB1cmkgfSwgbWV0YWRhdGEsIG9wdGlvbnMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UucmVnaXN0ZXIod2lkZ2V0KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQod2lkZ2V0KTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQW5jaG9yV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjbGFzc05hbWUgPSAnY2hhdC1pbmxpbmUtYW5jaG9yLXdpZGdldCc7XG5cblx0cmVhZG9ubHkgZGF0YTogQ29udGVudFJlZkRhdGE7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MQW5jaG9yRWxlbWVudCB8IEhUTUxFbGVtZW50LFxuXHRcdHB1YmxpYyByZWFkb25seSBpbmxpbmVSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1ldGFkYXRhOiBJbmxpbmVBbmNob3JXaWRnZXRNZXRhZGF0YSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElSZW5kZXJGaWxlV2lkZ2V0c09wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2U6IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBvcmlnaW5hbENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tEb2N1bWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RlYm9va0RvY3VtZW50U2VydmljZTogSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kYXRhID0gJ3VyaScgaW4gaW5saW5lUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZVxuXHRcdFx0PyBpbmxpbmVSZWZlcmVuY2UuaW5saW5lUmVmZXJlbmNlXG5cdFx0XHQ6ICduYW1lJyBpbiBpbmxpbmVSZWZlcmVuY2UuaW5saW5lUmVmZXJlbmNlXG5cdFx0XHRcdD8geyBraW5kOiAnc3ltYm9sJywgc3ltYm9sOiBpbmxpbmVSZWZlcmVuY2UuaW5saW5lUmVmZXJlbmNlIH1cblx0XHRcdFx0OiB7IHVyaTogaW5saW5lUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZSB9O1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKElubGluZUFuY2hvcldpZGdldC5jbGFzc05hbWUsICdzaG93LWZpbGUtaWNvbnMnKTtcblxuXHRcdGxldCBpY29uVGV4dDogQXJyYXk8c3RyaW5nIHwgSFRNTEVsZW1lbnQ+O1xuXHRcdGxldCBpY29uQ2xhc3Nlczogc3RyaW5nW107XG5cblx0XHRsZXQgbG9jYXRpb246IHsgcmVhZG9ubHkgdXJpOiBVUkk7IHJlYWRvbmx5IHJhbmdlPzogSVJhbmdlIH07XG5cblx0XHRpZiAodGhpcy5kYXRhLmtpbmQgPT09ICdzeW1ib2wnKSB7XG5cdFx0XHRjb25zdCBzeW1ib2wgPSB0aGlzLmRhdGEuc3ltYm9sO1xuXG5cdFx0XHRsb2NhdGlvbiA9IHRoaXMuZGF0YS5zeW1ib2wubG9jYXRpb247XG5cdFx0XHRpY29uVGV4dCA9IFt0aGlzLmRhdGEuc3ltYm9sLm5hbWVdO1xuXHRcdFx0aWNvbkNsYXNzZXMgPSBbJ2NvZGljb24nLCAuLi5nZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFN5bWJvbEtpbmRzLnRvSWNvbihzeW1ib2wua2luZCkpXTtcblxuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGhvb2tVcFN5bWJvbEF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIGVsZW1lbnQsIG9yaWdpbmFsQ29udGV4dEtleVNlcnZpY2UsIHsgdmFsdWU6IHN5bWJvbC5sb2NhdGlvbiwgbmFtZTogc3ltYm9sLm5hbWUsIGtpbmQ6IHN5bWJvbC5raW5kIH0sIE1lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9jYXRpb24gPSB0aGlzLmRhdGE7XG5cblx0XHRcdGNvbnN0IGZpbGVQYXRoTGFiZWwgPSB0aGlzLm1ldGFkYXRhPy5saW5rVGV4dCA/PyBsYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChsb2NhdGlvbi51cmkpO1xuXHRcdFx0bGV0IGRlZmF1bHRJY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChsb2NhdGlvbi5yYW5nZSAmJiB0aGlzLmRhdGEua2luZCAhPT0gJ3N5bWJvbCcpIHtcblx0XHRcdFx0Y29uc3Qgc3VmZml4ID0gbG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBsb2NhdGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0PyBgOiR7bG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWBcblx0XHRcdFx0XHQ6IGA6JHtsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXJ9LSR7bG9jYXRpb24ucmFuZ2UuZW5kTGluZU51bWJlcn1gO1xuXG5cdFx0XHRcdGljb25UZXh0ID0gW2ZpbGVQYXRoTGFiZWwsIGRvbS4kKCdzcGFuLmxhYmVsLXN1ZmZpeCcsIHVuZGVmaW5lZCwgc3VmZml4KV07XG5cdFx0XHR9IGVsc2UgaWYgKGxvY2F0aW9uLnVyaS5zY2hlbWUgPT09ICd2c2NvZGUtbm90ZWJvb2stY2VsbCcgJiYgdGhpcy5kYXRhLmtpbmQgIT09ICdzeW1ib2wnKSB7XG5cdFx0XHRcdGljb25UZXh0ID0gW2Ake2ZpbGVQYXRoTGFiZWx9IFx1MjAyMiBjZWxsJHt0aGlzLmdldENlbGxJbmRleChsb2NhdGlvbi51cmkpfWBdO1xuXHRcdFx0fSBlbHNlIGlmIChsb2NhdGlvbi51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZUJyb3dzZXIpIHtcblx0XHRcdFx0ZGVmYXVsdEljb24gPSBDb2RpY29uLmdsb2JlO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JOYW1lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKGxvY2F0aW9uLnVyaSlbMF0/LmVkaXRvcj8uZ2V0TmFtZSgpID8/IEJyb3dzZXJFZGl0b3JJbnB1dC5ERUZBVUxUX0xBQkVMO1xuXHRcdFx0XHRpY29uVGV4dCA9IFtlZGl0b3JOYW1lXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGljb25UZXh0ID0gW2ZpbGVQYXRoTGFiZWxdO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmlsZUtpbmQgPSBsb2NhdGlvbi51cmkucGF0aC5lbmRzV2l0aCgnLycpID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblx0XHRcdGNvbnN0IHJlY29tcHV0ZUljb25DbGFzc2VzID0gKCkgPT4gZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGxvY2F0aW9uLnVyaSwgZmlsZUtpbmQsIGZpbGVLaW5kID09PSBGaWxlS2luZC5GT0xERVIgJiYgIXRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkuaGFzRm9sZGVySWNvbnMgPyBGb2xkZXJUaGVtZUljb24gOiBkZWZhdWx0SWNvbik7XG5cblx0XHRcdGljb25DbGFzc2VzID0gcmVjb21wdXRlSWNvbkNsYXNzZXMoKTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaEljb25DbGFzc2VzID0gKCkgPT4ge1xuXHRcdFx0XHRpY29uRWwuY2xhc3NMaXN0LnJlbW92ZSguLi5pY29uQ2xhc3Nlcyk7XG5cdFx0XHRcdGljb25DbGFzc2VzID0gcmVjb21wdXRlSWNvbkNsYXNzZXMoKTtcblx0XHRcdFx0aWNvbkVsLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzZXMpO1xuXHRcdFx0fTtcblxuXHRcdFx0bGV0IGlzRGlyZWN0b3J5ID0gZmFsc2U7XG5cdFx0XHRmaWxlU2VydmljZS5zdGF0KGxvY2F0aW9uLnVyaSlcblx0XHRcdFx0LnRoZW4oc3RhdCA9PiB7XG5cdFx0XHRcdFx0aXNEaXJlY3RvcnkgPSBzdGF0LmlzRGlyZWN0b3J5O1xuXHRcdFx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRmaWxlS2luZCA9IEZpbGVLaW5kLkZPTERFUjtcblx0XHRcdFx0XHRcdHJlZnJlc2hJY29uQ2xhc3NlcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdFx0LmNhdGNoKCgpID0+IHsgfSk7XG5cblx0XHRcdC8vIENvbnRleHQgbWVudSAoY29udGV4dCBrZXkgc2VydmljZSBjcmVhdGVkIGxhemlseSBvbiBmaXJzdCBjb250ZXh0IG1lbnUgb3Blbilcblx0XHRcdGxldCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGlzRm9sZGVyQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29udGV4dE1lbnVJbml0aWFsaXplZCA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBlbnN1cmVDb250ZXh0S2V5U2VydmljZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCFjb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIob3JpZ2luYWxDb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoZWxlbWVudCkpO1xuXHRcdFx0XHRcdGNoYXRBdHRhY2htZW50UmVzb3VyY2VDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KGxvY2F0aW9uLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRpc0ZvbGRlckNvbnRleHQgPSBFeHBsb3JlckZvbGRlckNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29udGV4dEtleVNlcnZpY2U7XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBhc3luYyBkb21FdmVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KGRvbUV2ZW50KSwgZG9tRXZlbnQpO1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChkb21FdmVudCwgdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY2tzID0gZW5zdXJlQ29udGV4dEtleVNlcnZpY2UoKTtcblxuXHRcdFx0XHRpZiAoIWNvbnRleHRNZW51SW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0XHRjb250ZXh0TWVudUluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZUNvbnRleHRLZXkgPSBuZXcgU3RhdGljUmVzb3VyY2VDb250ZXh0S2V5KGNrcywgZmlsZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbW9kZWxTZXJ2aWNlKTtcblx0XHRcdFx0XHRyZXNvdXJjZUNvbnRleHRLZXkuc2V0KGxvY2F0aW9uLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aXNGb2xkZXJDb250ZXh0IS5zZXQoaXNEaXJlY3RvcnkpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IGNrcyxcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lbnUgPSBtZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQ2hhdElubGluZVJlc291cmNlQW5jaG9yQ29udGV4dCwgY2tzLCB7IGFyZzogbG9jYXRpb24udXJpIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEFkZCBsaW5lIHJhbmdlIGxhYmVsIGZvciBzY3JlZW4gcmVhZGVyc1xuXHRcdFx0aWYgKGxvY2F0aW9uLnJhbmdlKSB7XG5cdFx0XHRcdGlmIChsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGxvY2F0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG5scy5sb2NhbGl6ZSgnY2hhdC5pbmxpbmVBbmNob3IuYXJpYUxhYmVsLmxpbmUnLCBcInswfSBsaW5lIHsxfVwiLCBmaWxlUGF0aExhYmVsLCBsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG5scy5sb2NhbGl6ZSgnY2hhdC5pbmxpbmVBbmNob3IuYXJpYUxhYmVsLnJhbmdlJywgXCJ7MH0gbGluZXMgezF9IHRvIHsyfVwiLCBmaWxlUGF0aExhYmVsLCBsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGxvY2F0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGljb25FbCA9IGRvbS4kKCdzcGFuLmljb24nKTtcblx0XHRpY29uRWwuY2xhc3NMaXN0LmFkZCguLi5pY29uQ2xhc3Nlcyk7XG5cdFx0ZWxlbWVudC5yZXBsYWNlQ2hpbGRyZW4oaWNvbkVsLCBkb20uJCgnc3Bhbi5pY29uLWxhYmVsJywge30sIC4uLmljb25UZXh0KSk7XG5cblx0XHRjb25zdCBmcmFnbWVudCA9IGxvY2F0aW9uLnJhbmdlID8gYCR7bG9jYXRpb24ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfSwke2xvY2F0aW9uLnJhbmdlLnN0YXJ0Q29sdW1ufWAgOiAnJztcblx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJywgKGZyYWdtZW50ID8gbG9jYXRpb24udXJpLndpdGgoeyBmcmFnbWVudCB9KSA6IGxvY2F0aW9uLnVyaSkudG9TdHJpbmcoKSk7XG5cblx0XHQvLyBIb3ZlclxuXHRcdGNvbnN0IHJlbGF0aXZlTGFiZWwgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwobG9jYXRpb24udXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBlbGVtZW50LCByZWxhdGl2ZUxhYmVsKSk7XG5cblx0XHQvLyBEcmFnIGFuZCBkcm9wXG5cdFx0aWYgKHRoaXMuZGF0YS5raW5kICE9PSAnc3ltYm9sJykge1xuXHRcdFx0ZWxlbWVudC5kcmFnZ2FibGUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCAnZHJhZ3N0YXJ0JywgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXQ6IElSZXNvdXJjZVN0YXQgPSB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IGxvY2F0aW9uLnVyaSxcblx0XHRcdFx0XHRzZWxlY3Rpb246IGxvY2F0aW9uLnJhbmdlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCBbc3RhdF0sIGUpKTtcblxuXG5cdFx0XHRcdGUuZGF0YVRyYW5zZmVyPy5zZXREcmFnSW1hZ2UoZWxlbWVudCwgMCwgMCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xpY2sgaGFuZGxlciB0byBvcGVuIHdpdGggY3VzdG9tIGVkaXRvciBhc3NvY2lhdGlvbiBmcm9tIGNoYXQuZWRpdG9yQXNzb2NpYXRpb25zIHNldHRpbmdcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsICdjbGljaycsIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yT3ZlcnJpZGUgPSBnZXRFZGl0b3JPdmVycmlkZUZvckNoYXRSZXNvdXJjZShsb2NhdGlvbi51cmksIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUsXG5cdFx0XHRcdHNlbGVjdGlvbjogbG9jYXRpb24ucmFuZ2UsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvcGVuID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5vcHRpb25zPy5vcGVuUmVzb3VyY2UgJiYgYXdhaXQgdGhpcy5vcHRpb25zLm9wZW5SZXNvdXJjZShsb2NhdGlvbi51cmksIGVkaXRvck9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHJlZmVyZW5jZSBpcyBhbiBpbWFnZSBmaWxlIGFuZCB0aGUgY2Fyb3VzZWwgaXMgZW5hYmxlZCwgb3BlbiB0aGUgY2Fyb3VzZWxcblx0XHRcdFx0Y29uc3QgbWltZVR5cGUgPSBnZXRNZWRpYU1pbWUobG9jYXRpb24udXJpLnBhdGgpO1xuXHRcdFx0XHRpZiAobWltZVR5cGU/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2Uub3BlbkNhcm91c2VsQXRSZXNvdXJjZShsb2NhdGlvbi51cmkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxvY2F0aW9uLnVyaSwge1xuXHRcdFx0XHRcdGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSxcblx0XHRcdFx0XHRlZGl0b3JPcHRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucz8udHJhY2tPcGVuKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3B0aW9ucy50cmFja09wZW4ob3Blbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBvcGVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0SFRNTEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENlbGxJbmRleChsb2NhdGlvbjogVVJJKSB7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB0aGlzLm5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLmdldE5vdGVib29rKGxvY2F0aW9uKTtcblx0XHRjb25zdCBpbmRleCA9IG5vdGVib29rPy5nZXRDZWxsSW5kZXgobG9jYXRpb24pID8/IC0xO1xuXHRcdHJldHVybiBpbmRleCA+PSAwID8gYCAke2luZGV4ICsgMX1gIDogJyc7XG5cdH1cbn1cblxuLy8jcmVnaW9uIFJlc291cmNlIGNvbnRleHQgbWVudVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQWRkRmlsZVRvQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdjaGF0LmlubGluZVJlc291cmNlQW5jaG9yLmFkZEZpbGVUb0NoYXQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBZGRGaWxlVG9DaGF0QWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuYXR0YWNoLmxhYmVsJywgXCJBZGQgRmlsZSB0byBDaGF0XCIpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5saW5lUmVzb3VyY2VBbmNob3JDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJ2NoYXQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogRXhwbG9yZXJGb2xkZXJDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUocmVzb3VyY2UpO1xuXG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBSZXNvdXJjZSBrZXliaW5kaW5nc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weVJlc291cmNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2NoYXQuaW5saW5lUmVzb3VyY2VBbmNob3IuY29weVJlc291cmNlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29weVJlc291cmNlQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMuY29weS5sYWJlbCcsIFwiQ29weVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY2hhdEF0dGFjaG1lbnRSZXNvdXJjZUNvbnRleHRLZXksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFuY2hvciA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkQW5jaG9yO1xuXHRcdGlmICghYW5jaG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETzogd2Ugc2hvdWxkIGFsc28gd3JpdGUgb3V0IHRoZSBzdGFuZGFyZCBtaW1lIHR5cGVzIHNvIHRoYXQgZXh0ZXJuYWwgcHJvZ3JhbXMgY2FuIHVzZSB0aGVtXG5cdFx0Ly8gbGlrZSBob3cgYGZpbGxFZGl0b3JzRHJhZ0RhdGFgIHdvcmtzIGJ1dCB3aXRob3V0IGhhdmluZyBhbiBldmVudCB0byB3b3JrIHdpdGguXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhbmNob3IuZGF0YS5raW5kID09PSAnc3ltYm9sJyA/IGFuY2hvci5kYXRhLnN5bWJvbC5sb2NhdGlvbi51cmkgOiBhbmNob3IuZGF0YS51cmk7XG5cdFx0Y2xpcGJvYXJkU2VydmljZS53cml0ZVJlc291cmNlcyhbcmVzb3VyY2VdKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuVG9TaWRlUmVzb3VyY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5pbmxpbmVSZXNvdXJjZUFuY2hvci5vcGVuVG9TaWRlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlblRvU2lkZVJlc291cmNlQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2FjdGlvbnMub3BlblRvU2lkZS5sYWJlbCcsIFwiT3BlbiB0byB0aGUgU2lkZVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY2hhdEF0dGFjaG1lbnRSZXNvdXJjZUNvbnRleHRLZXksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FeHRlcm5hbEV4dGVuc2lvbiArIDIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkVudGVyXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW01lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0XS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQ6IGlkLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZz86IExvY2F0aW9uIHwgVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuZ2V0VGFyZ2V0KGFjY2Vzc29yLCBhcmcpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0VXJpID0gVVJJLmlzVXJpKHRhcmdldCkgPyB0YXJnZXQgOiB0YXJnZXQudXJpO1xuXHRcdGNvbnN0IGVkaXRvck92ZXJyaWRlID0gZ2V0RWRpdG9yT3ZlcnJpZGVGb3JDaGF0UmVzb3VyY2UodGFyZ2V0VXJpLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dDogSVRleHRSZXNvdXJjZUVkaXRvcklucHV0ID0gVVJJLmlzVXJpKHRhcmdldClcblx0XHRcdD8geyByZXNvdXJjZTogdGFyZ2V0LCBvcHRpb25zOiB7IG92ZXJyaWRlOiBlZGl0b3JPdmVycmlkZSB9IH1cblx0XHRcdDoge1xuXHRcdFx0XHRyZXNvdXJjZTogdGFyZ2V0LnVyaSwgb3B0aW9uczoge1xuXHRcdFx0XHRcdG92ZXJyaWRlOiBlZGl0b3JPdmVycmlkZSxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiB0YXJnZXQucmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHRhcmdldC5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhbaW5wdXRdLCBTSURFX0dST1VQKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFyZ2V0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IFVSSSB8IExvY2F0aW9uIHwgdW5kZWZpbmVkKTogTG9jYXRpb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlKTtcblxuXHRcdGlmIChhcmcpIHtcblx0XHRcdHJldHVybiBhcmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5jaG9yID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRBbmNob3I7XG5cdFx0aWYgKCFhbmNob3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFuY2hvci5kYXRhLmtpbmQgPT09ICdzeW1ib2wnID8gYW5jaG9yLmRhdGEuc3ltYm9sLmxvY2F0aW9uIDogYW5jaG9yLmRhdGEudXJpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTeW1ib2wgY29udGV4dCBtZW51XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvRGVmaW5pdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdjaGF0LmlubGluZVN5bWJvbEFuY2hvci5nb1RvRGVmaW5pdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvVG9EZWZpbml0aW9uQWN0aW9uLmlkLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubmxzLmxvY2FsaXplMignYWN0aW9ucy5nb1RvRGVjbC5sYWJlbCcsIFwiR28gdG8gRGVmaW5pdGlvblwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvRGVmaW5pdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJkRlZmluaXRpb25cIiksXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW01lbnVJZC5DaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0XS5tYXAoaWQgPT4gKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGdyb3VwOiAnNF9zeW1ib2xfbmF2Jyxcblx0XHRcdFx0b3JkZXI6IDEuMSxcblx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuaGFzRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0fSkpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGxvY2F0aW9uOiBMb2NhdGlvbik6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgb3BlbkVkaXRvcldpdGhTZWxlY3Rpb24oZWRpdG9yU2VydmljZSwgbG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgYWN0aW9uID0gbmV3IERlZmluaXRpb25BY3Rpb24oeyBvcGVuVG9TaWRlOiBmYWxzZSwgb3BlbkluUGVlazogZmFsc2UsIG11dGVNZXNzYWdlOiB0cnVlIH0sIHsgdGl0bGU6IHsgdmFsdWU6ICcnLCBvcmlnaW5hbDogJycgfSwgaWQ6ICcnLCBwcmVjb25kaXRpb246IHVuZGVmaW5lZCB9KTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWN0aW9uLnJ1bihhY2Nlc3NvcikpO1xuXHR9XG59KTtcblxuYXN5bmMgZnVuY3Rpb24gb3BlbkVkaXRvcldpdGhTZWxlY3Rpb24oZWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLCBsb2NhdGlvbjogTG9jYXRpb24pIHtcblx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcih7XG5cdFx0cmVzb3VyY2U6IGxvY2F0aW9uLnVyaSwgb3B0aW9uczoge1xuXHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBsb2NhdGlvbi5yYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHR9XG5cdFx0fVxuXHR9LCBudWxsKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuR29Ub0NvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbW1hbmQ6IHN0cmluZywgbG9jYXRpb246IExvY2F0aW9uKSB7XG5cdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRhd2FpdCBvcGVuRWRpdG9yV2l0aFNlbGVjdGlvbihlZGl0b3JTZXJ2aWNlLCBsb2NhdGlvbik7XG5cblx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmQpO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgR29Ub1R5cGVEZWZpbml0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZCA9ICdjaGF0LmlubGluZVN5bWJvbEFuY2hvci5nb1RvVHlwZURlZmluaXRpb25zJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR29Ub1R5cGVEZWZpbml0aW9uc0FjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLm5scy5sb2NhbGl6ZTIoJ2dvVG9UeXBlRGVmaW5pdGlvbnMubGFiZWwnLCBcIkdvIHRvIFR5cGUgRGVmaW5pdGlvbnNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b1R5cGVEZWZpbml0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmVHlwZSBEZWZpbml0aW9uc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbTWVudUlkLkNoYXRJbmxpbmVTeW1ib2xBbmNob3JDb250ZXh0LCBNZW51SWQuQ2hhdElucHV0U3ltYm9sQXR0YWNobWVudENvbnRleHRdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogMS4xLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdFx0fSkpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsb2NhdGlvbjogTG9jYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBydW5Hb1RvQ29tbWFuZChhY2Nlc3NvciwgJ2VkaXRvci5hY3Rpb24uZ29Ub1R5cGVEZWZpbml0aW9uJywgbG9jYXRpb24pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9JbXBsZW1lbnRhdGlvbnMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnY2hhdC5pbmxpbmVTeW1ib2xBbmNob3IuZ29Ub0ltcGxlbWVudGF0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvVG9JbXBsZW1lbnRhdGlvbnMuaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdnb1RvSW1wbGVtZW50YXRpb25zLmxhYmVsJywgXCJHbyB0byBJbXBsZW1lbnRhdGlvbnNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pR290b0ltcGxlbWVudGF0aW9ucycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJkltcGxlbWVudGF0aW9uc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbTWVudUlkLkNoYXRJbmxpbmVTeW1ib2xBbmNob3JDb250ZXh0LCBNZW51SWQuQ2hhdElucHV0U3ltYm9sQXR0YWNobWVudENvbnRleHRdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogMS4yLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNJbXBsZW1lbnRhdGlvblByb3ZpZGVyLFxuXHRcdFx0fSkpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsb2NhdGlvbjogTG9jYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBydW5Hb1RvQ29tbWFuZChhY2Nlc3NvciwgJ2VkaXRvci5hY3Rpb24uZ29Ub0ltcGxlbWVudGF0aW9uJywgbG9jYXRpb24pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdvVG9SZWZlcmVuY2VzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2NoYXQuaW5saW5lU3ltYm9sQW5jaG9yLmdvVG9SZWZlcmVuY2VzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR29Ub1JlZmVyZW5jZXNBY3Rpb24uaWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdnb1RvUmVmZXJlbmNlcy5sYWJlbCcsIFwiR28gdG8gUmVmZXJlbmNlc1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb3RvUmVmZXJlbmNlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmUmVmZXJlbmNlc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbTWVudUlkLkNoYXRJbmxpbmVTeW1ib2xBbmNob3JDb250ZXh0LCBNZW51SWQuQ2hhdElucHV0U3ltYm9sQXR0YWNobWVudENvbnRleHRdLm1hcChpZCA9PiAoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0Z3JvdXA6ICc0X3N5bWJvbF9uYXYnLFxuXHRcdFx0XHRvcmRlcjogMS4zLFxuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNSZWZlcmVuY2VQcm92aWRlcixcblx0XHRcdH0pKSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbG9jYXRpb246IExvY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgcnVuR29Ub0NvbW1hbmQoYWNjZXNzb3IsICdlZGl0b3IuYWN0aW9uLmdvVG9SZWZlcmVuY2VzJywgbG9jYXRpb24pO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUFBO0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGtCQUFtQztBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx5QkFB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Q0Y7QUFBQSxFQUVBLE1BQWUsSUFBSSxVQUE0QixVQUFtQztBQUNqRixVQUFNLGVBQWUsVUFBVSxvQ0FBb0MsUUFBUTtBQUFBLEVBQzVFO0FBQ0QsR0F2QmdCLEdBRUMsS0FBSywrQ0FGTixHQXVCZjtBQUVELGlCQUFnQixtQkFBa0MsUUFBUTtBQUFBLEVBSXpELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLEdBQW9CO0FBQUEsTUFDeEIsT0FBTztBQUFBLFFBQ04sR0FBRyxJQUFJLFVBQVUsNkJBQTZCLHVCQUF1QjtBQUFBLFFBQ3JFLGVBQWUsSUFBSSxTQUFTLEVBQUUsS0FBSyx5QkFBeUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcseUJBQXlCO0FBQUEsTUFDNUg7QUFBQSxNQUNBLE1BQU0sQ0FBQyxPQUFPLCtCQUErQixPQUFPLGdDQUFnQyxFQUFFLElBQUksU0FBTztBQUFBLFFBQ2hHO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxNQUFNLGtCQUFrQjtBQUFBLE1BQ3pCLEVBQUU7QUFBQSxJQUNILENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFlLElBQUksVUFBNEIsVUFBbUM7QUFDakYsVUFBTSxlQUFlLFVBQVUsb0NBQW9DLFFBQVE7QUFBQSxFQUM1RTtBQUNELEdBdkJnQixHQUVDLEtBQUssK0NBRk4sR0F1QmY7QUFFRCxpQkFBZ0IsbUJBQW1DLFFBQVE7QUFBQSxFQUkxRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxHQUFxQjtBQUFBLE1BQ3pCLE9BQU87QUFBQSxRQUNOLEdBQUcsSUFBSSxVQUFVLHdCQUF3QixrQkFBa0I7QUFBQSxRQUMzRCxlQUFlLElBQUksU0FBUyxFQUFFLEtBQUssbUJBQW1CLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLG9CQUFvQjtBQUFBLE1BQ2pIO0FBQUEsTUFDQSxNQUFNLENBQUMsT0FBTywrQkFBK0IsT0FBTyxnQ0FBZ0MsRUFBRSxJQUFJLFNBQU87QUFBQSxRQUNoRztBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxrQkFBa0I7QUFBQSxNQUN6QixFQUFFO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTRCLFVBQW1DO0FBQ2pGLFVBQU0sZUFBZSxVQUFVLGdDQUFnQyxRQUFRO0FBQUEsRUFDeEU7QUFDRCxHQXZCZ0IsR0FFQyxLQUFLLDBDQUZOLEdBdUJmOyIsCiAgIm5hbWVzIjogWyJhY2Nlc3NvciJdCn0K
