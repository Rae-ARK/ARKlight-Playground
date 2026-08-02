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
var _a, _b;
import * as dom from "../../../../../../base/browser/dom.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { matchesSomeScheme, Schemas } from "../../../../../../base/common/network.js";
import { basename } from "../../../../../../base/common/path.js";
import { basenameOrAuthority, isEqualAuthority } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { WorkbenchList } from "../../../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { isDark } from "../../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { fillEditorsDragData } from "../../../../../browser/dnd.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { ResourceContextKey } from "../../../../../common/contextkeys.js";
import { SETTINGS_AUTHORITY } from "../../../../../services/preferences/common/preferences.js";
import { createFileIconThemableTreeContainerScope } from "../../../../files/browser/views/explorerView.js";
import { ExplorerFolderContext } from "../../../../files/common/files.js";
import { chatEditingWidgetFileStateContextKey } from "../../../common/editing/chatEditingService.js";
import { ChatResponseReferencePartStatusKind } from "../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../chat.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ResourcePool } from "./chatCollections.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
const $ = dom.$;
let ChatCollapsibleListContentPart = class extends ChatCollapsibleContentPart {
  constructor(data, labelOverride, context, contentReferencesListPool, hoverMessage, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
    super(
      labelOverride ?? (data.length > 1 ? localize("usedReferencesPlural", "Used {0} references", data.length) : localize("usedReferencesSingular", "Used {0} reference", 1)),
      context,
      hoverMessage,
      hoverService,
      configurationService
    );
    this.data = data;
    this.contentReferencesListPool = contentReferencesListPool;
    this.openerService = openerService;
    this.menuService = menuService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.icon = Codicon.check;
  }
  initContent() {
    const ref = this._register(this.contentReferencesListPool.get());
    const list = ref.object;
    this._register(list.onDidOpen((e) => {
      if (e.element && "reference" in e.element && typeof e.element.reference === "object") {
        const uriOrLocation = "variableName" in e.element.reference ? e.element.reference.value : e.element.reference;
        const uri = URI.isUri(uriOrLocation) ? uriOrLocation : uriOrLocation?.uri;
        if (uri) {
          this.openerService.open(
            uri,
            {
              fromUserGesture: true,
              editorOptions: {
                ...e.editorOptions,
                ...{
                  selection: uriOrLocation && "range" in uriOrLocation ? uriOrLocation.range : void 0
                }
              }
            }
          );
        }
      }
    }));
    this._register(list.onContextMenu((e) => {
      dom.EventHelper.stop(e.browserEvent, true);
      const uri = e.element && getResourceForElement(e.element);
      if (!uri) {
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => {
          const menu = this.menuService.getMenuActions(MenuId.ChatAttachmentsContext, list.contextKeyService, { shouldForwardArgs: true, arg: uri });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
    const resourceContextKey = this._register(this.instantiationService.createInstance(ResourceContextKey));
    this._register(list.onDidChangeFocus((e) => {
      resourceContextKey.reset();
      const element = e.elements.length ? e.elements[0] : void 0;
      const uri = element && getResourceForElement(element);
      resourceContextKey.set(uri ?? null);
    }));
    const maxItemsShown = 6;
    const itemsShown = Math.min(this.data.length, maxItemsShown);
    const height = itemsShown * 22;
    list.layout(height);
    list.getHTMLElement().style.height = `${height}px`;
    list.splice(0, list.length, this.data);
    return list.getHTMLElement().parentElement;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "references" && other.references.length === this.data.length && !!followingContent.length === this.hasFollowingContent;
  }
};
ChatCollapsibleListContentPart = __decorateClass([
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService)
], ChatCollapsibleListContentPart);
let ChatUsedReferencesListContentPart = class extends ChatCollapsibleListContentPart {
  constructor(data, labelOverride, context, contentReferencesListPool, options, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService) {
    super(data, labelOverride, context, contentReferencesListPool, void 0, openerService, menuService, instantiationService, contextMenuService, hoverService, configurationService);
    this.options = options;
    if (data.length === 0) {
      dom.hide(this.domNode);
    }
  }
  isExpanded() {
    const element = this.element;
    return element.usedReferencesExpanded ?? !!(this.options.expandedWhenEmptyResponse && element.response.value.length === 0);
  }
  setExpanded(value) {
    const element = this.element;
    element.usedReferencesExpanded = !this.isExpanded();
  }
};
ChatUsedReferencesListContentPart = __decorateClass([
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService)
], ChatUsedReferencesListContentPart);
let CollapsibleListPool = class extends Disposable {
  constructor(_onDidChangeVisibility, menuId, listOptions, instantiationService, themeService, labelService) {
    super();
    this._onDidChangeVisibility = _onDidChangeVisibility;
    this.menuId = menuId;
    this.listOptions = listOptions;
    this.instantiationService = instantiationService;
    this.themeService = themeService;
    this.labelService = labelService;
    this._pool = this._register(new ResourcePool(() => this.listFactory()));
  }
  get inUse() {
    return this._pool.inUse;
  }
  listFactory() {
    const store = new DisposableStore();
    const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));
    const container = $(".chat-used-context-list");
    store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
    const list = store.add(this.instantiationService.createInstance(
      WorkbenchList,
      "ChatListRenderer",
      container,
      new CollapsibleListDelegate(),
      [this.instantiationService.createInstance(CollapsibleListRenderer, resourceLabels, this.menuId)],
      {
        ...this.listOptions,
        alwaysConsumeMouseWheel: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (element.kind === "warning") {
              return element.content.value;
            }
            const reference = element.reference;
            if (typeof reference === "string") {
              return reference;
            } else if ("variableName" in reference) {
              return reference.variableName;
            } else if (URI.isUri(reference)) {
              return basename(reference.path);
            } else {
              return basename(reference.uri.path);
            }
          },
          getWidgetAriaLabel: () => localize("chatCollapsibleList", "Collapsible Chat References List")
        },
        dnd: {
          getDragURI: (element) => getResourceForElement(element)?.toString() ?? null,
          getDragLabel: (elements, originalEvent) => {
            const uris = coalesce(elements.map(getResourceForElement));
            if (!uris.length) {
              return void 0;
            } else if (uris.length === 1) {
              return this.labelService.getUriLabel(uris[0], { relative: true });
            } else {
              return `${uris.length}`;
            }
          },
          dispose: () => {
          },
          onDragOver: () => false,
          drop: () => {
          },
          onDragStart: (data, originalEvent) => {
            try {
              const elements = data.getData();
              const uris = coalesce(elements.map(getResourceForElement));
              this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, uris, originalEvent));
            } catch {
            }
          }
        }
      }
    ));
    return {
      list,
      dispose: () => store.dispose()
    };
  }
  get() {
    const wrapper = this._pool.get();
    let stale = false;
    return {
      object: wrapper.list,
      isStale: () => stale,
      dispose: () => {
        stale = true;
        this._pool.release(wrapper);
      }
    };
  }
  clear() {
    this._pool.clear();
  }
};
CollapsibleListPool = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, ILabelService)
], CollapsibleListPool);
class CollapsibleListDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return CollapsibleListRenderer.TEMPLATE_ID;
  }
}
let CollapsibleListRenderer = class {
  constructor(labels, menuId, themeService, productService, instantiationService, contextKeyService) {
    this.labels = labels;
    this.menuId = menuId;
    this.themeService = themeService;
    this.productService = productService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.templateId = CollapsibleListRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
    const fileDiffsContainer = $(".working-set-line-counts");
    const addedSpan = dom.$(".working-set-lines-added");
    const removedSpan = dom.$(".working-set-lines-removed");
    fileDiffsContainer.appendChild(addedSpan);
    fileDiffsContainer.appendChild(removedSpan);
    label.element.appendChild(fileDiffsContainer);
    let toolbar;
    let actionBarContainer;
    let contextKeyService;
    if (this.menuId) {
      actionBarContainer = $(".chat-collapsible-list-action-bar");
      contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
      const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
      toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: void 0 } }));
      label.element.appendChild(actionBarContainer);
    }
    return { templateDisposables, label, toolbar, actionBarContainer, contextKeyService, fileDiffsContainer, addedSpan, removedSpan };
  }
  getReferenceIcon(data) {
    if (ThemeIcon.isThemeIcon(data.iconPath)) {
      return data.iconPath;
    } else {
      return isDark(this.themeService.getColorTheme().type) && data.iconPath?.dark ? data.iconPath?.dark : data.iconPath?.light;
    }
  }
  renderElement(data, index, templateData) {
    if (data.kind === "warning") {
      templateData.label.setResource({ name: data.content.value }, { icon: Codicon.warning });
      return;
    }
    const reference = data.reference;
    const icon = this.getReferenceIcon(data);
    templateData.label.element.style.display = "flex";
    let arg;
    if (typeof reference === "object" && "variableName" in reference) {
      if (reference.value) {
        const uri = URI.isUri(reference.value) ? reference.value : reference.value.uri;
        templateData.label.setResource(
          {
            resource: uri,
            name: basenameOrAuthority(uri),
            description: `#${reference.variableName}`,
            range: "range" in reference.value ? reference.value.range : void 0
          },
          { icon, title: data.options?.status?.description ?? data.title }
        );
      } else if (reference.variableName.startsWith("kernelVariable")) {
        const variable = reference.variableName.split(":")[1];
        const asVariableName = `${variable}`;
        const label = `Kernel variable`;
        templateData.label.setLabel(label, asVariableName, { title: data.options?.status?.description });
      } else {
        templateData.label.setLabel(reference.variableName, void 0, { title: data.options?.status?.description ?? data.title });
      }
    } else if (typeof reference === "string") {
      templateData.label.setLabel(reference, void 0, { iconPath: URI.isUri(icon) ? icon : void 0, title: data.options?.status?.description ?? data.title });
    } else {
      const uri = "uri" in reference ? reference.uri : reference;
      arg = uri;
      const extraClasses = data.excluded ? ["excluded"] : [];
      if (uri.scheme === "https" && isEqualAuthority(uri.authority, "github.com") && uri.path.includes("/tree/")) {
        templateData.label.setResource(getResourceLabelForGithubUri(uri), { icon: Codicon.github, title: data.title, strikethrough: data.excluded, extraClasses });
      } else if (uri.scheme === this.productService.urlProtocol && isEqualAuthority(uri.authority, SETTINGS_AUTHORITY)) {
        const settingId = uri.path.substring(1);
        templateData.label.setResource({ resource: uri, name: settingId }, { icon: Codicon.settingsGear, title: localize("setting.hover", "Open setting '{0}'", settingId), strikethrough: data.excluded, extraClasses });
      } else if (matchesSomeScheme(uri, Schemas.mailto, Schemas.http, Schemas.https)) {
        templateData.label.setResource({ resource: uri, name: uri.toString(true) }, { icon: icon ?? Codicon.globe, title: data.options?.status?.description ?? data.title ?? uri.toString(true), strikethrough: data.excluded, extraClasses });
      } else {
        templateData.label.setFile(uri, {
          fileKind: FileKind.FILE,
          // Should not have this live-updating data on a historical reference
          fileDecorations: void 0,
          range: "range" in reference ? reference.range : void 0,
          title: data.options?.status?.description ?? data.title,
          strikethrough: data.excluded,
          extraClasses
        });
      }
    }
    for (const selector of [".monaco-icon-suffix-container", ".monaco-icon-name-container"]) {
      const element = templateData.label.element.querySelector(selector);
      if (element) {
        if (data.options?.status?.kind === ChatResponseReferencePartStatusKind.Omitted || data.options?.status?.kind === ChatResponseReferencePartStatusKind.Partial) {
          element.classList.add("warning");
        } else {
          element.classList.remove("warning");
        }
      }
    }
    if (data.state !== void 0) {
      if (templateData.actionBarContainer || data.showModifiedState) {
        const diffMeta = data?.options?.diffMeta;
        if (diffMeta) {
          if (!templateData.fileDiffsContainer || !templateData.addedSpan || !templateData.removedSpan) {
            return;
          }
          templateData.addedSpan.textContent = `+${diffMeta.added}`;
          templateData.removedSpan.textContent = `-${diffMeta.removed}`;
          templateData.fileDiffsContainer.setAttribute("aria-label", localize("chatEditingSession.fileCounts", "{0} lines added, {1} lines removed", diffMeta.added, diffMeta.removed));
        }
        templateData.label.element.querySelector(".monaco-icon-name-container")?.classList.add("modified");
      }
      if (templateData.toolbar) {
        templateData.toolbar.context = arg;
      }
      if (templateData.contextKeyService) {
        if (data.state !== void 0) {
          chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
        }
      }
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
CollapsibleListRenderer.TEMPLATE_ID = "chatCollapsibleListRenderer";
CollapsibleListRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], CollapsibleListRenderer);
function getResourceLabelForGithubUri(uri) {
  const repoPath = uri.path.split("/").slice(1, 3).join("/");
  const filePath = uri.path.split("/").slice(5);
  const fileName = filePath.at(-1);
  const range = getLineRangeFromGithubUri(uri);
  return {
    resource: uri,
    name: fileName ?? filePath.join("/"),
    description: [repoPath, ...filePath.slice(0, -1)].join("/"),
    range
  };
}
function getLineRangeFromGithubUri(uri) {
  if (!uri.fragment) {
    return void 0;
  }
  const match = uri.fragment.match(/\bL(\d+)(?:-L(\d+))?/);
  if (!match) {
    return void 0;
  }
  const startLine = parseInt(match[1]);
  if (isNaN(startLine)) {
    return void 0;
  }
  const endLine = match[2] ? parseInt(match[2]) : startLine;
  if (isNaN(endLine)) {
    return void 0;
  }
  return {
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: 1
  };
}
function getResourceForElement(element) {
  if (element.kind === "warning") {
    return null;
  }
  const { reference } = element;
  if (typeof reference === "string" || "variableName" in reference) {
    return null;
  } else if (URI.isUri(reference)) {
    return reference;
  } else {
    return reference.uri;
  }
}
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: _a.id,
      title: {
        ...localize2("addToChat", "Add File to Chat")
      },
      f1: false,
      menu: [{
        id: MenuId.ChatAttachmentsContext,
        group: "chat",
        order: 1,
        when: ContextKeyExpr.and(ResourceContextKey.IsFileSystemResource, ExplorerFolderContext.negate())
      }]
    });
  }
  async run(accessor, resource) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    if (!resource) {
      return;
    }
    const widget = chatWidgetService.lastFocusedWidget;
    if (widget) {
      widget.attachmentModel.addFile(resource);
    }
  }
}, _a.id = "workbench.action.chat.addToChatAction", _a));
registerAction2((_b = class extends Action2 {
  constructor() {
    super({
      id: _b.id,
      title: {
        ...localize2("copyLink", "Copy Link")
      },
      f1: false,
      menu: [{
        id: MenuId.ChatAttachmentsContext,
        group: "chat",
        order: 0,
        when: ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.http), ResourceContextKey.Scheme.isEqualTo(Schemas.https))
      }]
    });
  }
  async run(accessor, resource) {
    await accessor.get(IClipboardService).writeResources([resource]);
  }
}, _b.id = "workbench.action.chat.copyLink", _b));
export {
  ChatCollapsibleListContentPart,
  ChatUsedReferencesListContentPart,
  CollapsibleListPool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU29tZVNjaGVtZSwgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lT3JBdXRob3JpdHksIGlzRXF1YWxBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIElSZXNvdXJjZUxhYmVsUHJvcHMsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNFVFRJTkdTX0FVVEhPUklUWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlSWNvblRoZW1hYmxlVHJlZUNvbnRhaW5lclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvYnJvd3Nlci92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGb2xkZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNoYXRFZGl0aW5nV2lkZ2V0RmlsZVN0YXRlQ29udGV4dEtleSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0U3RhdHVzS2luZCwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdFdhcm5pbmdNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50LCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZVJlZmVyZW5jZSwgUmVzb3VyY2VQb29sIH0gZnJvbSAnLi9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlZmVyZW5jZUxpc3RJdGVtIGV4dGVuZHMgSUNoYXRDb250ZW50UmVmZXJlbmNlIHtcblx0dGl0bGU/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRzdGF0ZT86IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGU7XG5cdGV4Y2x1ZGVkPzogYm9vbGVhbjtcblx0c2hvd01vZGlmaWVkU3RhdGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0gPSBJQ2hhdFJlZmVyZW5jZUxpc3RJdGVtIHwgSUNoYXRXYXJuaW5nTWVzc2FnZTtcblxuZXhwb3J0IGNsYXNzIENoYXRDb2xsYXBzaWJsZUxpc3RDb250ZW50UGFydCBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRhdGE6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPixcblx0XHRsYWJlbE92ZXJyaWRlOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50UmVmZXJlbmNlc0xpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdGhvdmVyTWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxhYmVsT3ZlcnJpZGUgPz8gKGRhdGEubGVuZ3RoID4gMSA/XG5cdFx0XHRsb2NhbGl6ZSgndXNlZFJlZmVyZW5jZXNQbHVyYWwnLCBcIlVzZWQgezB9IHJlZmVyZW5jZXNcIiwgZGF0YS5sZW5ndGgpIDpcblx0XHRcdGxvY2FsaXplKCd1c2VkUmVmZXJlbmNlc1Npbmd1bGFyJywgXCJVc2VkIHswfSByZWZlcmVuY2VcIiwgMSkpLCBjb250ZXh0LCBob3Zlck1lc3NhZ2UsXG5cdFx0XHRob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluaXRDb250ZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wuZ2V0KCkpO1xuXHRcdGNvbnN0IGxpc3QgPSByZWYub2JqZWN0O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlzdC5vbkRpZE9wZW4oKGUpID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQgJiYgJ3JlZmVyZW5jZScgaW4gZS5lbGVtZW50ICYmIHR5cGVvZiBlLmVsZW1lbnQucmVmZXJlbmNlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRjb25zdCB1cmlPckxvY2F0aW9uID0gJ3ZhcmlhYmxlTmFtZScgaW4gZS5lbGVtZW50LnJlZmVyZW5jZSA/IGUuZWxlbWVudC5yZWZlcmVuY2UudmFsdWUgOiBlLmVsZW1lbnQucmVmZXJlbmNlO1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuaXNVcmkodXJpT3JMb2NhdGlvbikgPyB1cmlPckxvY2F0aW9uIDpcblx0XHRcdFx0XHR1cmlPckxvY2F0aW9uPy51cmk7XG5cdFx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihcblx0XHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0Li4uZS5lZGl0b3JPcHRpb25zLFxuXHRcdFx0XHRcdFx0XHRcdC4uLntcblx0XHRcdFx0XHRcdFx0XHRcdHNlbGVjdGlvbjogdXJpT3JMb2NhdGlvbiAmJiAncmFuZ2UnIGluIHVyaU9yTG9jYXRpb24gPyB1cmlPckxvY2F0aW9uLnJhbmdlIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUuYnJvd3NlckV2ZW50LCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgdXJpID0gZS5lbGVtZW50ICYmIGdldFJlc291cmNlRm9yRWxlbWVudChlLmVsZW1lbnQpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsIGxpc3QuY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIGFyZzogdXJpIH0pO1xuXHRcdFx0XHRcdHJldHVybiBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXNvdXJjZUNvbnRleHRLZXkgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlQ29udGV4dEtleSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdHJlc291cmNlQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudHMubGVuZ3RoID8gZS5lbGVtZW50c1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHVyaSA9IGVsZW1lbnQgJiYgZ2V0UmVzb3VyY2VGb3JFbGVtZW50KGVsZW1lbnQpO1xuXHRcdFx0cmVzb3VyY2VDb250ZXh0S2V5LnNldCh1cmkgPz8gbnVsbCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbWF4SXRlbXNTaG93biA9IDY7XG5cdFx0Y29uc3QgaXRlbXNTaG93biA9IE1hdGgubWluKHRoaXMuZGF0YS5sZW5ndGgsIG1heEl0ZW1zU2hvd24pO1xuXHRcdGNvbnN0IGhlaWdodCA9IGl0ZW1zU2hvd24gKiAyMjtcblx0XHRsaXN0LmxheW91dChoZWlnaHQpO1xuXHRcdGxpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdGxpc3Quc3BsaWNlKDAsIGxpc3QubGVuZ3RoLCB0aGlzLmRhdGEpO1xuXG5cdFx0cmV0dXJuIGxpc3QuZ2V0SFRNTEVsZW1lbnQoKS5wYXJlbnRFbGVtZW50ITtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09ICdyZWZlcmVuY2VzJyAmJiBvdGhlci5yZWZlcmVuY2VzLmxlbmd0aCA9PT0gdGhpcy5kYXRhLmxlbmd0aCAmJiAoISFmb2xsb3dpbmdDb250ZW50Lmxlbmd0aCA9PT0gdGhpcy5oYXNGb2xsb3dpbmdDb250ZW50KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VXNlZFJlZmVyZW5jZXNMaXN0T3B0aW9ucyB7XG5cdGV4cGFuZGVkV2hlbkVtcHR5UmVzcG9uc2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFVzZWRSZWZlcmVuY2VzTGlzdENvbnRlbnRQYXJ0IGV4dGVuZHMgQ2hhdENvbGxhcHNpYmxlTGlzdENvbnRlbnRQYXJ0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0ZGF0YTogUmVhZG9ubHlBcnJheTxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+LFxuXHRcdGxhYmVsT3ZlcnJpZGU6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRjb250ZW50UmVmZXJlbmNlc0xpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUNoYXRVc2VkUmVmZXJlbmNlc0xpc3RPcHRpb25zLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkYXRhLCBsYWJlbE92ZXJyaWRlLCBjb250ZXh0LCBjb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLCB1bmRlZmluZWQsIG9wZW5lclNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoZGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGlzRXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdHJldHVybiBlbGVtZW50LnVzZWRSZWZlcmVuY2VzRXhwYW5kZWQgPz8gISEoXG5cdFx0XHR0aGlzLm9wdGlvbnMuZXhwYW5kZWRXaGVuRW1wdHlSZXNwb25zZSAmJiBlbGVtZW50LnJlc3BvbnNlLnZhbHVlLmxlbmd0aCA9PT0gMFxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RXhwYW5kZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5lbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWw7XG5cdFx0ZWxlbWVudC51c2VkUmVmZXJlbmNlc0V4cGFuZGVkID0gIXRoaXMuaXNFeHBhbmRlZCgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ29sbGFwc2libGVMaXN0V3JhcHBlciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0bGlzdDogV29ya2JlbmNoTGlzdDxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+O1xufVxuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2libGVMaXN0UG9vbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9wb29sOiBSZXNvdXJjZVBvb2w8SUNvbGxhcHNpYmxlTGlzdFdyYXBwZXI+O1xuXG5cdHB1YmxpYyBnZXQgaW5Vc2UoKTogUmVhZG9ubHlTZXQ8SUNvbGxhcHNpYmxlTGlzdFdyYXBwZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5fcG9vbC5pblVzZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtZW51SWQ6IE1lbnVJZCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RPcHRpb25zOiBJTGlzdE9wdGlvbnM8SUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wb29sID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlUG9vbCgoKSA9PiB0aGlzLmxpc3RGYWN0b3J5KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgbGlzdEZhY3RvcnkoKTogSUNvbGxhcHNpYmxlTGlzdFdyYXBwZXIge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxzID0gc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkgfSkpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QnKTtcblx0XHRzdG9yZS5hZGQoY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZShjb250YWluZXIsIHRoaXMudGhlbWVTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsaXN0ID0gc3RvcmUuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElDaGF0Q29sbGFwc2libGVMaXN0SXRlbT4sXG5cdFx0XHQnQ2hhdExpc3RSZW5kZXJlcicsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgQ29sbGFwc2libGVMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbGxhcHNpYmxlTGlzdFJlbmRlcmVyLCByZXNvdXJjZUxhYmVscywgdGhpcy5tZW51SWQpXSxcblx0XHRcdHtcblx0XHRcdFx0Li4udGhpcy5saXN0T3B0aW9ucyxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlbGVtZW50OiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LmtpbmQgPT09ICd3YXJuaW5nJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5jb250ZW50LnZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gZWxlbWVudC5yZWZlcmVuY2U7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJlZmVyZW5jZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlZmVyZW5jZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoJ3ZhcmlhYmxlTmFtZScgaW4gcmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZWZlcmVuY2UudmFyaWFibGVOYW1lO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkocmVmZXJlbmNlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYmFzZW5hbWUocmVmZXJlbmNlLnBhdGgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKHJlZmVyZW5jZS51cmkucGF0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2NoYXRDb2xsYXBzaWJsZUxpc3QnLCBcIkNvbGxhcHNpYmxlIENoYXQgUmVmZXJlbmNlcyBMaXN0XCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRuZDoge1xuXHRcdFx0XHRcdGdldERyYWdVUkk6IChlbGVtZW50OiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0pID0+IGdldFJlc291cmNlRm9yRWxlbWVudChlbGVtZW50KT8udG9TdHJpbmcoKSA/PyBudWxsLFxuXHRcdFx0XHRcdGdldERyYWdMYWJlbDogKGVsZW1lbnRzLCBvcmlnaW5hbEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmlzOiBVUklbXSA9IGNvYWxlc2NlKGVsZW1lbnRzLm1hcChnZXRSZXNvdXJjZUZvckVsZW1lbnQpKTtcblx0XHRcdFx0XHRcdGlmICghdXJpcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodXJpcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaXNbMF0sIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYCR7dXJpcy5sZW5ndGh9YDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRvbkRyYWdPdmVyOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0XHRkcm9wOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0b25EcmFnU3RhcnQ6IChkYXRhLCBvcmlnaW5hbEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbGVtZW50cyA9IGRhdGEuZ2V0RGF0YSgpIGFzIElDaGF0Q29sbGFwc2libGVMaXN0SXRlbVtdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB1cmlzOiBVUklbXSA9IGNvYWxlc2NlKGVsZW1lbnRzLm1hcChnZXRSZXNvdXJjZUZvckVsZW1lbnQpKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCB1cmlzLCBvcmlnaW5hbEV2ZW50KSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlzdCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKVxuXHRcdH07XG5cdH1cblxuXHRnZXQoKTogSURpc3Bvc2FibGVSZWZlcmVuY2U8V29ya2JlbmNoTGlzdDxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+PiB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3Bvb2wuZ2V0KCk7XG5cdFx0bGV0IHN0YWxlID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogd3JhcHBlci5saXN0LFxuXHRcdFx0aXNTdGFsZTogKCkgPT4gc3RhbGUsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHN0YWxlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcG9vbC5yZWxlYXNlKHdyYXBwZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wb29sLmNsZWFyKCk7XG5cdH1cbn1cblxuY2xhc3MgQ29sbGFwc2libGVMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+IHtcblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBDb2xsYXBzaWJsZUxpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbGxhcHNpYmxlTGlzdFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U/OiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHR0b29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0YWN0aW9uQmFyQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdGZpbGVEaWZmc0NvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRhZGRlZFNwYW4/OiBIVE1MRWxlbWVudDtcblx0cmVtb3ZlZFNwYW4/OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgQ29sbGFwc2libGVMaXN0UmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSwgSUNvbGxhcHNpYmxlTGlzdFRlbXBsYXRlPiB7XG5cdHN0YXRpYyBURU1QTEFURV9JRCA9ICdjaGF0Q29sbGFwc2libGVMaXN0UmVuZGVyZXInO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBDb2xsYXBzaWJsZUxpc3RSZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSBtZW51SWQ6IE1lbnVJZCB8IHVuZGVmaW5lZCxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNvbGxhcHNpYmxlTGlzdFRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGZpbGVEaWZmc0NvbnRhaW5lciA9ICQoJy53b3JraW5nLXNldC1saW5lLWNvdW50cycpO1xuXHRcdGNvbnN0IGFkZGVkU3BhbiA9IGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtYWRkZWQnKTtcblx0XHRjb25zdCByZW1vdmVkU3BhbiA9IGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtcmVtb3ZlZCcpO1xuXHRcdGZpbGVEaWZmc0NvbnRhaW5lci5hcHBlbmRDaGlsZChhZGRlZFNwYW4pO1xuXHRcdGZpbGVEaWZmc0NvbnRhaW5lci5hcHBlbmRDaGlsZChyZW1vdmVkU3Bhbik7XG5cdFx0bGFiZWwuZWxlbWVudC5hcHBlbmRDaGlsZChmaWxlRGlmZnNDb250YWluZXIpO1xuXG5cdFx0bGV0IHRvb2xiYXI7XG5cdFx0bGV0IGFjdGlvbkJhckNvbnRhaW5lcjtcblx0XHRsZXQgY29udGV4dEtleVNlcnZpY2U7XG5cdFx0aWYgKHRoaXMubWVudUlkKSB7XG5cdFx0XHRhY3Rpb25CYXJDb250YWluZXIgPSAkKCcuY2hhdC1jb2xsYXBzaWJsZS1saXN0LWFjdGlvbi1iYXInKTtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoYWN0aW9uQmFyQ29udGFpbmVyKSk7XG5cdFx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHRcdHRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgYWN0aW9uQmFyQ29udGFpbmVyLCB0aGlzLm1lbnVJZCwgeyBtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiB1bmRlZmluZWQgfSB9KSk7XG5cdFx0XHRsYWJlbC5lbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbkJhckNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdGVtcGxhdGVEaXNwb3NhYmxlcywgbGFiZWwsIHRvb2xiYXIsIGFjdGlvbkJhckNvbnRhaW5lciwgY29udGV4dEtleVNlcnZpY2UsIGZpbGVEaWZmc0NvbnRhaW5lciwgYWRkZWRTcGFuLCByZW1vdmVkU3BhbiB9O1xuXHR9XG5cblxuXHRwcml2YXRlIGdldFJlZmVyZW5jZUljb24oZGF0YTogSUNoYXRDb250ZW50UmVmZXJlbmNlKTogVVJJIHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGRhdGEuaWNvblBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gZGF0YS5pY29uUGF0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgJiYgZGF0YS5pY29uUGF0aD8uZGFya1xuXHRcdFx0XHQ/IGRhdGEuaWNvblBhdGg/LmRhcmtcblx0XHRcdFx0OiBkYXRhLmljb25QYXRoPy5saWdodDtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGRhdGE6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ29sbGFwc2libGVMaXN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoZGF0YS5raW5kID09PSAnd2FybmluZycpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRSZXNvdXJjZSh7IG5hbWU6IGRhdGEuY29udGVudC52YWx1ZSB9LCB7IGljb246IENvZGljb24ud2FybmluZyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZWZlcmVuY2UgPSBkYXRhLnJlZmVyZW5jZTtcblx0XHRjb25zdCBpY29uID0gdGhpcy5nZXRSZWZlcmVuY2VJY29uKGRhdGEpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0bGV0IGFyZzogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgcmVmZXJlbmNlID09PSAnb2JqZWN0JyAmJiAndmFyaWFibGVOYW1lJyBpbiByZWZlcmVuY2UpIHtcblx0XHRcdGlmIChyZWZlcmVuY2UudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLmlzVXJpKHJlZmVyZW5jZS52YWx1ZSkgPyByZWZlcmVuY2UudmFsdWUgOiByZWZlcmVuY2UudmFsdWUudXJpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHVyaSxcblx0XHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lT3JBdXRob3JpdHkodXJpKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBgIyR7cmVmZXJlbmNlLnZhcmlhYmxlTmFtZX1gLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdyYW5nZScgaW4gcmVmZXJlbmNlLnZhbHVlID8gcmVmZXJlbmNlLnZhbHVlLnJhbmdlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sIHsgaWNvbiwgdGl0bGU6IGRhdGEub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbiA/PyBkYXRhLnRpdGxlIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChyZWZlcmVuY2UudmFyaWFibGVOYW1lLnN0YXJ0c1dpdGgoJ2tlcm5lbFZhcmlhYmxlJykpIHtcblx0XHRcdFx0Y29uc3QgdmFyaWFibGUgPSByZWZlcmVuY2UudmFyaWFibGVOYW1lLnNwbGl0KCc6JylbMV07XG5cdFx0XHRcdGNvbnN0IGFzVmFyaWFibGVOYW1lID0gYCR7dmFyaWFibGV9YDtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgS2VybmVsIHZhcmlhYmxlYDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGxhYmVsLCBhc1ZhcmlhYmxlTmFtZSwgeyB0aXRsZTogZGF0YS5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKHJlZmVyZW5jZS52YXJpYWJsZU5hbWUsIHVuZGVmaW5lZCwgeyB0aXRsZTogZGF0YS5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uID8/IGRhdGEudGl0bGUgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgcmVmZXJlbmNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKHJlZmVyZW5jZSwgdW5kZWZpbmVkLCB7IGljb25QYXRoOiBVUkkuaXNVcmkoaWNvbikgPyBpY29uIDogdW5kZWZpbmVkLCB0aXRsZTogZGF0YS5vcHRpb25zPy5zdGF0dXM/LmRlc2NyaXB0aW9uID8/IGRhdGEudGl0bGUgfSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpID0gJ3VyaScgaW4gcmVmZXJlbmNlID8gcmVmZXJlbmNlLnVyaSA6IHJlZmVyZW5jZTtcblx0XHRcdGFyZyA9IHVyaTtcblx0XHRcdGNvbnN0IGV4dHJhQ2xhc3NlcyA9IGRhdGEuZXhjbHVkZWQgPyBbJ2V4Y2x1ZGVkJ10gOiBbXTtcblx0XHRcdGlmICh1cmkuc2NoZW1lID09PSAnaHR0cHMnICYmIGlzRXF1YWxBdXRob3JpdHkodXJpLmF1dGhvcml0eSwgJ2dpdGh1Yi5jb20nKSAmJiB1cmkucGF0aC5pbmNsdWRlcygnL3RyZWUvJykpIHtcblx0XHRcdFx0Ly8gUGFyc2UgYSBuaWNlciBsYWJlbCBmb3IgR2l0SHViIFVSSXMgdGhhdCBwb2ludCBhdCBhIHBhcnRpY3VsYXIgY29tbWl0ICsgZmlsZVxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoZ2V0UmVzb3VyY2VMYWJlbEZvckdpdGh1YlVyaSh1cmkpLCB7IGljb246IENvZGljb24uZ2l0aHViLCB0aXRsZTogZGF0YS50aXRsZSwgc3RyaWtldGhyb3VnaDogZGF0YS5leGNsdWRlZCwgZXh0cmFDbGFzc2VzIH0pO1xuXHRcdFx0fSBlbHNlIGlmICh1cmkuc2NoZW1lID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sICYmIGlzRXF1YWxBdXRob3JpdHkodXJpLmF1dGhvcml0eSwgU0VUVElOR1NfQVVUSE9SSVRZKSkge1xuXHRcdFx0XHQvLyBhIG5pY2VyIGxhYmVsIGZvciBzZXR0aW5ncyBVUklzXG5cdFx0XHRcdGNvbnN0IHNldHRpbmdJZCA9IHVyaS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IHVyaSwgbmFtZTogc2V0dGluZ0lkIH0sIHsgaWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsIHRpdGxlOiBsb2NhbGl6ZSgnc2V0dGluZy5ob3ZlcicsIFwiT3BlbiBzZXR0aW5nICd7MH0nXCIsIHNldHRpbmdJZCksIHN0cmlrZXRocm91Z2g6IGRhdGEuZXhjbHVkZWQsIGV4dHJhQ2xhc3NlcyB9KTtcblx0XHRcdH0gZWxzZSBpZiAobWF0Y2hlc1NvbWVTY2hlbWUodXJpLCBTY2hlbWFzLm1haWx0bywgU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzKSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0UmVzb3VyY2UoeyByZXNvdXJjZTogdXJpLCBuYW1lOiB1cmkudG9TdHJpbmcodHJ1ZSkgfSwgeyBpY29uOiBpY29uID8/IENvZGljb24uZ2xvYmUsIHRpdGxlOiBkYXRhLm9wdGlvbnM/LnN0YXR1cz8uZGVzY3JpcHRpb24gPz8gZGF0YS50aXRsZSA/PyB1cmkudG9TdHJpbmcodHJ1ZSksIHN0cmlrZXRocm91Z2g6IGRhdGEuZXhjbHVkZWQsIGV4dHJhQ2xhc3NlcyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRGaWxlKHVyaSwge1xuXHRcdFx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0XHRcdC8vIFNob3VsZCBub3QgaGF2ZSB0aGlzIGxpdmUtdXBkYXRpbmcgZGF0YSBvbiBhIGhpc3RvcmljYWwgcmVmZXJlbmNlXG5cdFx0XHRcdFx0ZmlsZURlY29yYXRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmFuZ2U6ICdyYW5nZScgaW4gcmVmZXJlbmNlID8gcmVmZXJlbmNlLnJhbmdlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRpdGxlOiBkYXRhLm9wdGlvbnM/LnN0YXR1cz8uZGVzY3JpcHRpb24gPz8gZGF0YS50aXRsZSxcblx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiBkYXRhLmV4Y2x1ZGVkLFxuXHRcdFx0XHRcdGV4dHJhQ2xhc3Nlc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIFsnLm1vbmFjby1pY29uLXN1ZmZpeC1jb250YWluZXInLCAnLm1vbmFjby1pY29uLW5hbWUtY29udGFpbmVyJ10pIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0aWYgKGRhdGEub3B0aW9ucz8uc3RhdHVzPy5raW5kID09PSBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0U3RhdHVzS2luZC5PbWl0dGVkIHx8IGRhdGEub3B0aW9ucz8uc3RhdHVzPy5raW5kID09PSBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0U3RhdHVzS2luZC5QYXJ0aWFsKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCd3YXJuaW5nJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGF0YS5zdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmFjdGlvbkJhckNvbnRhaW5lciB8fCBkYXRhLnNob3dNb2RpZmllZFN0YXRlKSB7XG5cdFx0XHRcdGNvbnN0IGRpZmZNZXRhID0gZGF0YT8ub3B0aW9ucz8uZGlmZk1ldGE7XG5cdFx0XHRcdGlmIChkaWZmTWV0YSkge1xuXHRcdFx0XHRcdGlmICghdGVtcGxhdGVEYXRhLmZpbGVEaWZmc0NvbnRhaW5lciB8fCAhdGVtcGxhdGVEYXRhLmFkZGVkU3BhbiB8fCAhdGVtcGxhdGVEYXRhLnJlbW92ZWRTcGFuKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5hZGRlZFNwYW4udGV4dENvbnRlbnQgPSBgKyR7ZGlmZk1ldGEuYWRkZWR9YDtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEucmVtb3ZlZFNwYW4udGV4dENvbnRlbnQgPSBgLSR7ZGlmZk1ldGEucmVtb3ZlZH1gO1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5maWxlRGlmZnNDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXRFZGl0aW5nU2Vzc2lvbi5maWxlQ291bnRzJywgJ3swfSBsaW5lcyBhZGRlZCwgezF9IGxpbmVzIHJlbW92ZWQnLCBkaWZmTWV0YS5hZGRlZCwgZGlmZk1ldGEucmVtb3ZlZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWljb24tbmFtZS1jb250YWluZXInKT8uY2xhc3NMaXN0LmFkZCgnbW9kaWZpZWQnKTtcblx0XHRcdH1cblx0XHRcdGlmICh0ZW1wbGF0ZURhdGEudG9vbGJhcikge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEudG9vbGJhci5jb250ZXh0ID0gYXJnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0XHRpZiAoZGF0YS5zdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y2hhdEVkaXRpbmdXaWRnZXRGaWxlU3RhdGVDb250ZXh0S2V5LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChkYXRhLnN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElDb2xsYXBzaWJsZUxpc3RUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRSZXNvdXJjZUxhYmVsRm9yR2l0aHViVXJpKHVyaTogVVJJKTogSVJlc291cmNlTGFiZWxQcm9wcyB7XG5cdGNvbnN0IHJlcG9QYXRoID0gdXJpLnBhdGguc3BsaXQoJy8nKS5zbGljZSgxLCAzKS5qb2luKCcvJyk7XG5cdGNvbnN0IGZpbGVQYXRoID0gdXJpLnBhdGguc3BsaXQoJy8nKS5zbGljZSg1KTtcblx0Y29uc3QgZmlsZU5hbWUgPSBmaWxlUGF0aC5hdCgtMSk7XG5cdGNvbnN0IHJhbmdlID0gZ2V0TGluZVJhbmdlRnJvbUdpdGh1YlVyaSh1cmkpO1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlOiB1cmksXG5cdFx0bmFtZTogZmlsZU5hbWUgPz8gZmlsZVBhdGguam9pbignLycpLFxuXHRcdGRlc2NyaXB0aW9uOiBbcmVwb1BhdGgsIC4uLmZpbGVQYXRoLnNsaWNlKDAsIC0xKV0uam9pbignLycpLFxuXHRcdHJhbmdlXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldExpbmVSYW5nZUZyb21HaXRodWJVcmkodXJpOiBVUkkpOiBJUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRpZiAoIXVyaS5mcmFnbWVudCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBFeHRyYWN0IHRoZSBsaW5lIHJhbmdlIGZyb20gdGhlIGZyYWdtZW50XG5cdC8vIEdpdGh1YiBsaW5lIHJhbmdlcyBhcmUgMS1iYXNlZFxuXHRjb25zdCBtYXRjaCA9IHVyaS5mcmFnbWVudC5tYXRjaCgvXFxiTChcXGQrKSg/Oi1MKFxcZCspKT8vKTtcblx0aWYgKCFtYXRjaCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBzdGFydExpbmUgPSBwYXJzZUludChtYXRjaFsxXSk7XG5cdGlmIChpc05hTihzdGFydExpbmUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGVuZExpbmUgPSBtYXRjaFsyXSA/IHBhcnNlSW50KG1hdGNoWzJdKSA6IHN0YXJ0TGluZTtcblx0aWYgKGlzTmFOKGVuZExpbmUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmUsXG5cdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0ZW5kTGluZU51bWJlcjogZW5kTGluZSxcblx0XHRlbmRDb2x1bW46IDFcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVzb3VyY2VGb3JFbGVtZW50KGVsZW1lbnQ6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSk6IFVSSSB8IG51bGwge1xuXHRpZiAoZWxlbWVudC5raW5kID09PSAnd2FybmluZycpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRjb25zdCB7IHJlZmVyZW5jZSB9ID0gZWxlbWVudDtcblx0aWYgKHR5cGVvZiByZWZlcmVuY2UgPT09ICdzdHJpbmcnIHx8ICd2YXJpYWJsZU5hbWUnIGluIHJlZmVyZW5jZSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9IGVsc2UgaWYgKFVSSS5pc1VyaShyZWZlcmVuY2UpKSB7XG5cdFx0cmV0dXJuIHJlZmVyZW5jZTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gcmVmZXJlbmNlLnVyaTtcblx0fVxufVxuXG4vLyNyZWdpb24gUmVzb3VyY2UgY29udGV4dCBtZW51XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBZGRUb0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFkZFRvQ2hhdEFjdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFkZFRvQ2hhdEFjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignYWRkVG9DaGF0JywgXCJBZGQgRmlsZSB0byBDaGF0XCIpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEF0dGFjaG1lbnRzQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICdjaGF0Jyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSZXNvdXJjZUNvbnRleHRLZXkuSXNGaWxlU3lzdGVtUmVzb3VyY2UsIEV4cGxvcmVyRm9sZGVyQ29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKHJlc291cmNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgT3BlbkNoYXRSZWZlcmVuY2VMaW5rQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb3B5TGluayc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5DaGF0UmVmZXJlbmNlTGlua0FjdGlvbi5pZCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignY29weUxpbmsnLCBcIkNvcHkgTGlua1wiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRBdHRhY2htZW50c0NvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnY2hhdCcsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmh0dHApLCBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmh0dHBzKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKS53cml0ZVJlc291cmNlcyhbcmVzb3VyY2VdKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFBQTtBQUtBLFlBQVksU0FBUztBQUdyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFHeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLG1CQUFtQixlQUFlO0FBQzNDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFFcEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFNBQVMsY0FBYyxRQUFRLHVCQUF1QjtBQUMvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQThDLHNCQUFzQjtBQUNwRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEw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
