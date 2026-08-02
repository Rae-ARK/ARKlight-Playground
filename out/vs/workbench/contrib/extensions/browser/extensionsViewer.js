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
import * as dom from "../../../../base/browser/dom.js";
import { localize } from "../../../../nls.js";
import { dispose, Disposable, DisposableStore, toDisposable, isDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Action, ActionRunner, Separator } from "../../../../base/common/actions.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { Event } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IListService, WorkbenchAsyncDataTree, WorkbenchPagedList } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Delegate, Renderer } from "./extensionsList.js";
import { listFocusForeground, listFocusBackground, foreground, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IWorkbenchLayoutService, Position } from "../../../services/layout/browser/layoutService.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionAction, getContextMenuActions, ManageExtensionAction } from "./extensionsActions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { getLocationBasedViewColors } from "../../../browser/parts/views/viewPane.js";
import { DelayedPagedModel } from "../../../../base/common/paging.js";
import { ExtensionIconWidget } from "./extensionsWidgets.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isCancellationError } from "../../../../base/common/errors.js";
function getAriaLabelForExtension(extension) {
  if (!extension) {
    return "";
  }
  const publisher = extension.publisherDomain?.verified ? localize("extension.arialabel.verifiedPublisher", "Verified Publisher {0}", extension.publisherDisplayName) : localize("extension.arialabel.publisher", "Publisher {0}", extension.publisherDisplayName);
  const deprecated = extension?.deprecationInfo ? localize("extension.arialabel.deprecated", "Deprecated") : "";
  const rating = extension?.rating ? localize("extension.arialabel.rating", "Rated {0} out of 5 stars by {1} users", extension.rating.toFixed(2), extension.ratingCount) : "";
  return `${extension.displayName}, ${deprecated ? `${deprecated}, ` : ""}${extension.version}, ${publisher}, ${extension.description} ${rating ? `, ${rating}` : ""}`;
}
let ExtensionsList = class extends Disposable {
  constructor(parent, viewId, options, extensionsViewState, extensionsWorkbenchService, viewDescriptorService, layoutService, notificationService, contextMenuService, contextKeyService, instantiationService, logService) {
    super();
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.contextMenuActionRunner = this._register(new ActionRunner());
    this.modalNavigationDisposable = this._register(new MutableDisposable());
    this._register(this.contextMenuActionRunner.onDidRun(({ error }) => error && notificationService.error(error)));
    const delegate = new Delegate();
    const renderer = instantiationService.createInstance(Renderer, extensionsViewState, {
      hoverOptions: {
        position: () => {
          const viewLocation = viewDescriptorService.getViewLocationById(viewId);
          if (viewLocation === ViewContainerLocation.Sidebar) {
            return layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
          }
          if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
            return layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
          }
          return HoverPosition.RIGHT;
        }
      }
    });
    this.list = instantiationService.createInstance(WorkbenchPagedList, `${viewId}-Extensions`, parent, delegate, [renderer], {
      multipleSelectionSupport: false,
      setRowLineHeight: false,
      horizontalScrolling: false,
      accessibilityProvider: {
        getAriaLabel(extension) {
          return getAriaLabelForExtension(extension);
        },
        getWidgetAriaLabel() {
          return localize("extensions", "Extensions");
        }
      },
      overrideStyles: getLocationBasedViewColors(viewDescriptorService.getViewLocationById(viewId)).listOverrideStyles,
      openOnSingleClick: true,
      ...options
    });
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e), this));
    this._register(this.list);
    this._register(Event.debounce(Event.filter(this.list.onDidOpen, (e) => e.element !== null), (_, event) => event, 75, true)((options2) => {
      this.openExtension(options2.element, { sideByside: options2.sideBySide, ...options2.editorOptions });
    }));
  }
  setModel(model) {
    this.list.model = new DelayedPagedModel(model);
  }
  layout(height, width) {
    this.list.layout(height, width);
  }
  openExtension(extension, options) {
    extension = this.extensionsWorkbenchService.local.filter((e) => areSameExtensions(e.identifier, extension.identifier))[0] || extension;
    this.extensionsWorkbenchService.open(extension, {
      ...options,
      modal: options.sideByside ? void 0 : buildModalNavigationForPagedList(
        extension,
        () => this.list.model,
        (extA, extB) => areSameExtensions(extA.identifier, extB.identifier),
        (ext, modal) => this.extensionsWorkbenchService.open(ext, { pinned: false, modal }),
        this.modalNavigationDisposable,
        this.logService
      )
    });
  }
  async onContextMenu(e) {
    if (e.element) {
      const disposables = new DisposableStore();
      const manageExtensionAction = disposables.add(this.instantiationService.createInstance(ManageExtensionAction));
      const extension = e.element ? this.extensionsWorkbenchService.local.find((local) => areSameExtensions(local.identifier, e.element.identifier) && (!e.element.server || e.element.server === local.server)) || e.element : e.element;
      manageExtensionAction.extension = extension;
      let groups = [];
      if (manageExtensionAction.enabled) {
        groups = await manageExtensionAction.getActionGroups();
      } else if (extension) {
        groups = await getContextMenuActions(extension, this.contextKeyService, this.instantiationService);
        groups.forEach((group) => group.forEach((extensionAction) => {
          if (extensionAction instanceof ExtensionAction) {
            extensionAction.extension = extension;
          }
        }));
      }
      const actions = [];
      for (const menuActions of groups) {
        for (const menuAction of menuActions) {
          actions.push(menuAction);
          if (isDisposable(menuAction)) {
            disposables.add(menuAction);
          }
        }
        actions.push(new Separator());
      }
      actions.pop();
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions,
        actionRunner: this.contextMenuActionRunner,
        onHide: () => disposables.dispose()
      });
    }
  }
};
ExtensionsList = __decorateClass([
  __decorateParam(4, IExtensionsWorkbenchService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, ILogService)
], ExtensionsList);
let ExtensionsGridView = class extends Disposable {
  constructor(parent, delegate, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.element = dom.append(parent, dom.$(".extensions-grid-view"));
    this.renderer = this.instantiationService.createInstance(Renderer, { onFocus: Event.None, onBlur: Event.None, filters: {} }, { hoverOptions: { position() {
      return HoverPosition.BELOW;
    } } });
    this.delegate = delegate;
    this.disposableStore = this._register(new DisposableStore());
  }
  setExtensions(extensions) {
    this.disposableStore.clear();
    extensions.forEach((e, index) => this.renderExtension(e, index));
  }
  renderExtension(extension, index) {
    const extensionContainer = dom.append(this.element, dom.$(".extension-container"));
    extensionContainer.style.height = `${this.delegate.getHeight()}px`;
    extensionContainer.setAttribute("tabindex", "0");
    const template = this.renderer.renderTemplate(extensionContainer);
    this.disposableStore.add(toDisposable(() => this.renderer.disposeTemplate(template)));
    const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
    openExtensionAction.extension = extension;
    template.name.setAttribute("tabindex", "0");
    const handleEvent = (e) => {
      if (e instanceof StandardKeyboardEvent && e.keyCode !== KeyCode.Enter) {
        return;
      }
      openExtensionAction.run(e.ctrlKey || e.metaKey);
      e.stopPropagation();
      e.preventDefault();
    };
    this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.CLICK, (e) => handleEvent(new StandardMouseEvent(dom.getWindow(template.name), e))));
    this.disposableStore.add(dom.addDisposableListener(template.name, dom.EventType.KEY_DOWN, (e) => handleEvent(new StandardKeyboardEvent(e))));
    this.disposableStore.add(dom.addDisposableListener(extensionContainer, dom.EventType.KEY_DOWN, (e) => handleEvent(new StandardKeyboardEvent(e))));
    this.renderer.renderElement(extension, index, template);
  }
};
ExtensionsGridView = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ExtensionsGridView);
class AsyncDataSource {
  hasChildren({ hasChildren }) {
    return hasChildren;
  }
  getChildren(extensionData) {
    return extensionData.getChildren();
  }
}
class VirualDelegate {
  getHeight(element) {
    return 62;
  }
  getTemplateId({ extension }) {
    return extension ? ExtensionRenderer.TEMPLATE_ID : UnknownExtensionRenderer.TEMPLATE_ID;
  }
}
let ExtensionRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  get templateId() {
    return ExtensionRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.classList.add("extension");
    const iconWidget = this.instantiationService.createInstance(ExtensionIconWidget, container);
    const details = dom.append(container, dom.$(".details"));
    const header = dom.append(details, dom.$(".header"));
    const name = dom.append(header, dom.$("span.name"));
    const openExtensionAction = this.instantiationService.createInstance(OpenExtensionAction);
    const extensionDisposables = [dom.addDisposableListener(name, "click", (e) => {
      openExtensionAction.run(e.ctrlKey || e.metaKey);
      e.stopPropagation();
      e.preventDefault();
    }), iconWidget, openExtensionAction];
    const identifier = dom.append(header, dom.$("span.identifier"));
    const footer = dom.append(details, dom.$(".footer"));
    const author = dom.append(footer, dom.$(".author"));
    return {
      name,
      identifier,
      author,
      extensionDisposables,
      set extensionData(extensionData) {
        iconWidget.extension = extensionData.extension;
        openExtensionAction.extension = extensionData.extension;
      }
    };
  }
  renderElement(node, index, data) {
    const extension = node.element.extension;
    data.name.textContent = extension.displayName;
    data.identifier.textContent = extension.identifier.id;
    data.author.textContent = extension.publisherDisplayName;
    data.extensionData = node.element;
  }
  disposeTemplate(templateData) {
    templateData.extensionDisposables = dispose(templateData.extensionDisposables);
  }
};
ExtensionRenderer.TEMPLATE_ID = "extension-template";
ExtensionRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ExtensionRenderer);
const _UnknownExtensionRenderer = class _UnknownExtensionRenderer {
  get templateId() {
    return _UnknownExtensionRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const messageContainer = dom.append(container, dom.$("div.unknown-extension"));
    dom.append(messageContainer, dom.$("span.error-marker")).textContent = localize("error", "Error");
    dom.append(messageContainer, dom.$("span.message")).textContent = localize("Unknown Extension", "Unknown Extension:");
    const identifier = dom.append(messageContainer, dom.$("span.message"));
    return { identifier };
  }
  renderElement(node, index, data) {
    data.identifier.textContent = node.element.extension.identifier.id;
  }
  disposeTemplate(data) {
  }
};
_UnknownExtensionRenderer.TEMPLATE_ID = "unknown-extension-template";
let UnknownExtensionRenderer = _UnknownExtensionRenderer;
let OpenExtensionAction = class extends Action {
  constructor(extensionsWorkdbenchService) {
    super("extensions.action.openExtension", "");
    this.extensionsWorkdbenchService = extensionsWorkdbenchService;
  }
  set extension(extension) {
    this._extension = extension;
  }
  run(sideByside) {
    if (this._extension) {
      return this.extensionsWorkdbenchService.open(this._extension, { sideByside });
    }
    return Promise.resolve();
  }
};
OpenExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], OpenExtensionAction);
let ExtensionsTree = class extends WorkbenchAsyncDataTree {
  constructor(input, container, overrideStyles, contextKeyService, listService, instantiationService, configurationService, extensionsWorkdbenchService) {
    const delegate = new VirualDelegate();
    const dataSource = new AsyncDataSource();
    const renderers = [instantiationService.createInstance(ExtensionRenderer), instantiationService.createInstance(UnknownExtensionRenderer)];
    const identityProvider = {
      getId({ extension, parent }) {
        return parent ? this.getId(parent) + "/" + extension.identifier.id : extension.identifier.id;
      }
    };
    super(
      "ExtensionsTree",
      container,
      delegate,
      renderers,
      dataSource,
      {
        indent: 40,
        identityProvider,
        multipleSelectionSupport: false,
        overrideStyles,
        accessibilityProvider: {
          getAriaLabel(extensionData) {
            return getAriaLabelForExtension(extensionData.extension);
          },
          getWidgetAriaLabel() {
            return localize("extensions", "Extensions");
          }
        }
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.setInput(input);
    this.disposables.add(this.onDidChangeSelection((event) => {
      if (dom.isKeyboardEvent(event.browserEvent)) {
        extensionsWorkdbenchService.open(event.elements[0].extension, { sideByside: false });
      }
    }));
  }
};
ExtensionsTree = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExtensionsWorkbenchService)
], ExtensionsTree);
class ExtensionData {
  constructor(extension, parent, getChildrenExtensionIds, extensionsWorkbenchService) {
    this.extension = extension;
    this.parent = parent;
    this.getChildrenExtensionIds = getChildrenExtensionIds;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.childrenExtensionIds = this.getChildrenExtensionIds(extension);
  }
  get hasChildren() {
    return isNonEmptyArray(this.childrenExtensionIds);
  }
  async getChildren() {
    if (this.hasChildren) {
      const result = await getExtensions(this.childrenExtensionIds, this.extensionsWorkbenchService);
      return result.map((extension) => new ExtensionData(extension, this, this.getChildrenExtensionIds, this.extensionsWorkbenchService));
    }
    return null;
  }
}
async function getExtensions(extensions, extensionsWorkbenchService) {
  const localById = extensionsWorkbenchService.local.reduce((result2, e) => {
    result2.set(e.identifier.id.toLowerCase(), e);
    return result2;
  }, /* @__PURE__ */ new Map());
  const result = [];
  const toQuery = [];
  for (const extensionId of extensions) {
    const id = extensionId.toLowerCase();
    const local = localById.get(id);
    if (local) {
      result.push(local);
    } else {
      toQuery.push(id);
    }
  }
  if (toQuery.length) {
    const galleryResult = await extensionsWorkbenchService.getExtensions(toQuery.map((id) => ({ id })), CancellationToken.None);
    result.push(...galleryResult);
  }
  return result;
}
function buildModalNavigationForPagedList(openedItem, getModel, isSame, openItem, cancellationStore, logService) {
  const model = getModel();
  if (!model) {
    return void 0;
  }
  const total = model.length;
  if (total <= 1) {
    return void 0;
  }
  let current = -1;
  for (let i = 0; i < total; i++) {
    if (model.isResolved(i) && isSame(model.get(i), openedItem)) {
      current = i;
      break;
    }
  }
  if (current === -1) {
    return void 0;
  }
  const openAtIndex = (index, item) => {
    const currentTotal = getModel()?.length ?? 0;
    openItem(item, { navigation: { total: currentTotal, current: index, navigate } });
  };
  let cts;
  const navigate = (index) => {
    cts?.cancel();
    cts = cancellationStore.value = new CancellationTokenSource();
    const token = cts.token;
    const currentModel = getModel();
    if (!currentModel || index < 0 || index >= currentModel.length) {
      return;
    }
    if (currentModel.isResolved(index)) {
      openAtIndex(index, currentModel.get(index));
    } else {
      currentModel.resolve(index, token).then((item) => {
        if (token.isCancellationRequested) {
          return;
        }
        openAtIndex(index, item);
      }, (error) => {
        if (!isCancellationError(error)) {
          logService.error(`Error while resolving item at index ${index} for modal navigation`, error);
        }
      });
    }
  };
  return { navigation: { total, current, navigate } };
}
registerThemingParticipant((theme, collector) => {
  const focusBackground = theme.getColor(listFocusBackground);
  if (focusBackground) {
    collector.addRule(`.extensions-grid-view .extension-container:focus { background-color: ${focusBackground}; outline: none; }`);
  }
  const focusForeground = theme.getColor(listFocusForeground);
  if (focusForeground) {
    collector.addRule(`.extensions-grid-view .extension-container:focus { color: ${focusForeground}; }`);
  }
  const foregroundColor = theme.getColor(foreground);
  const editorBackgroundColor = theme.getColor(editorBackground);
  if (foregroundColor && editorBackgroundColor) {
    const authorForeground = foregroundColor.transparent(0.9).makeOpaque(editorBackgroundColor);
    collector.addRule(`.extensions-grid-view .extension-container:not(.disabled) .author { color: ${authorForeground}; }`);
    const disabledExtensionForeground = foregroundColor.transparent(0.5).makeOpaque(editorBackgroundColor);
    collector.addRule(`.extensions-grid-view .extension-container.disabled { color: ${disabledExtensionForeground}; }`);
  }
});
export {
  ExtensionData,
  ExtensionsGridView,
  ExtensionsList,
  ExtensionsTree,
  buildModalNavigationForPagedList,
  getExtensions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zVmlld2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbnNWaWV3U3RhdGUgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBJV29ya2JlbmNoUGFnZWRMaXN0T3B0aW9ucywgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSwgV29ya2JlbmNoUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCwgSUNvbG9yVGhlbWUsIElDc3NTdHlsZUNvbGxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVsZWdhdGUsIFJlbmRlcmVyIH0gZnJvbSAnLi9leHRlbnNpb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBsaXN0Rm9jdXNGb3JlZ3JvdW5kLCBsaXN0Rm9jdXNCYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kLCBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElTdHlsZU92ZXJyaWRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uQWN0aW9uLCBnZXRDb250ZXh0TWVudUFjdGlvbnMsIE1hbmFnZUV4dGVuc2lvbkFjdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRMb2NhdGlvbkJhc2VkVmlld0NvbG9ycyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgRGVsYXllZFBhZ2VkTW9kZWwsIElQYWdlZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkljb25XaWRnZXQgfSBmcm9tICcuL2V4dGVuc2lvbnNXaWRnZXRzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbmZ1bmN0aW9uIGdldEFyaWFMYWJlbEZvckV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsKTogc3RyaW5nIHtcblx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgcHVibGlzaGVyID0gZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQgPyBsb2NhbGl6ZSgnZXh0ZW5zaW9uLmFyaWFsYWJlbC52ZXJpZmllZFB1Ymxpc2hlcicsIFwiVmVyaWZpZWQgUHVibGlzaGVyIHswfVwiLCBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUpIDogbG9jYWxpemUoJ2V4dGVuc2lvbi5hcmlhbGFiZWwucHVibGlzaGVyJywgXCJQdWJsaXNoZXIgezB9XCIsIGV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cdGNvbnN0IGRlcHJlY2F0ZWQgPSBleHRlbnNpb24/LmRlcHJlY2F0aW9uSW5mbyA/IGxvY2FsaXplKCdleHRlbnNpb24uYXJpYWxhYmVsLmRlcHJlY2F0ZWQnLCBcIkRlcHJlY2F0ZWRcIikgOiAnJztcblx0Y29uc3QgcmF0aW5nID0gZXh0ZW5zaW9uPy5yYXRpbmcgPyBsb2NhbGl6ZSgnZXh0ZW5zaW9uLmFyaWFsYWJlbC5yYXRpbmcnLCBcIlJhdGVkIHswfSBvdXQgb2YgNSBzdGFycyBieSB7MX0gdXNlcnNcIiwgZXh0ZW5zaW9uLnJhdGluZy50b0ZpeGVkKDIpLCBleHRlbnNpb24ucmF0aW5nQ291bnQpIDogJyc7XG5cdHJldHVybiBgJHtleHRlbnNpb24uZGlzcGxheU5hbWV9LCAke2RlcHJlY2F0ZWQgPyBgJHtkZXByZWNhdGVkfSwgYCA6ICcnfSR7ZXh0ZW5zaW9uLnZlcnNpb259LCAke3B1Ymxpc2hlcn0sICR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9ufSAke3JhdGluZyA/IGAsICR7cmF0aW5nfWAgOiAnJ31gO1xufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc0xpc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBsaXN0OiBXb3JrYmVuY2hQYWdlZExpc3Q8SUV4dGVuc2lvbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVBY3Rpb25SdW5uZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uUnVubmVyKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kYWxOYXZpZ2F0aW9uRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHZpZXdJZDogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IFBhcnRpYWw8SVdvcmtiZW5jaFBhZ2VkTGlzdE9wdGlvbnM8SUV4dGVuc2lvbj4+LFxuXHRcdGV4dGVuc2lvbnNWaWV3U3RhdGU6IElFeHRlbnNpb25zVmlld1N0YXRlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0TWVudUFjdGlvblJ1bm5lci5vbkRpZFJ1bigoeyBlcnJvciB9KSA9PiBlcnJvciAmJiBub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKSkpO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW5kZXJlciwgZXh0ZW5zaW9uc1ZpZXdTdGF0ZSwge1xuXHRcdFx0aG92ZXJPcHRpb25zOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld0xvY2F0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0lkKTtcblx0XHRcdFx0XHRpZiAodmlld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLkxFRlQgPyBIb3ZlclBvc2l0aW9uLlJJR0hUIDogSG92ZXJQb3NpdGlvbi5MRUZUO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodmlld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uTEVGVCA6IEhvdmVyUG9zaXRpb24uUklHSFQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBIb3ZlclBvc2l0aW9uLlJJR0hUO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5saXN0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoUGFnZWRMaXN0LCBgJHt2aWV3SWR9LUV4dGVuc2lvbnNgLCBwYXJlbnQsIGRlbGVnYXRlLCBbcmVuZGVyZXJdLCB7XG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRBcmlhTGFiZWwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIGdldEFyaWFMYWJlbEZvckV4dGVuc2lvbihleHRlbnNpb24pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2V4dGVuc2lvbnMnLCBcIkV4dGVuc2lvbnNcIik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvdmVycmlkZVN0eWxlczogZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0lkKSkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHQuLi5vcHRpb25zXG5cdFx0fSkgYXMgV29ya2JlbmNoUGFnZWRMaXN0PElFeHRlbnNpb24+O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKEV2ZW50LmZpbHRlcih0aGlzLmxpc3Qub25EaWRPcGVuLCBlID0+IGUuZWxlbWVudCAhPT0gbnVsbCksIChfLCBldmVudCkgPT4gZXZlbnQsIDc1LCB0cnVlKShvcHRpb25zID0+IHtcblx0XHRcdHRoaXMub3BlbkV4dGVuc2lvbihvcHRpb25zLmVsZW1lbnQhLCB7IHNpZGVCeXNpZGU6IG9wdGlvbnMuc2lkZUJ5U2lkZSwgLi4ub3B0aW9ucy5lZGl0b3JPcHRpb25zIH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldE1vZGVsKG1vZGVsOiBJUGFnZWRNb2RlbDxJRXh0ZW5zaW9uPikge1xuXHRcdHRoaXMubGlzdC5tb2RlbCA9IG5ldyBEZWxheWVkUGFnZWRNb2RlbChtb2RlbCk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGlzdC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5FeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBvcHRpb25zOiB7IHNpZGVCeXNpZGU/OiBib29sZWFuOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgcGlubmVkPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0ZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbC5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSlbMF0gfHwgZXh0ZW5zaW9uO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24sIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtb2RhbDogb3B0aW9ucy5zaWRlQnlzaWRlID8gdW5kZWZpbmVkIDogYnVpbGRNb2RhbE5hdmlnYXRpb25Gb3JQYWdlZExpc3QoXG5cdFx0XHRcdGV4dGVuc2lvbixcblx0XHRcdFx0KCkgPT4gdGhpcy5saXN0Lm1vZGVsLFxuXHRcdFx0XHQoZXh0QSwgZXh0QikgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZXh0QS5pZGVudGlmaWVyLCBleHRCLmlkZW50aWZpZXIpLFxuXHRcdFx0XHQoZXh0LCBtb2RhbCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dCwgeyBwaW5uZWQ6IGZhbHNlLCBtb2RhbCB9KSxcblx0XHRcdFx0dGhpcy5tb2RhbE5hdmlnYXRpb25EaXNwb3NhYmxlLFxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Vcblx0XHRcdCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uQ29udGV4dE1lbnUoZTogSUxpc3RDb250ZXh0TWVudUV2ZW50PElFeHRlbnNpb24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBtYW5hZ2VFeHRlbnNpb25BY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYW5hZ2VFeHRlbnNpb25BY3Rpb24pKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGUuZWxlbWVudCA/IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChsb2NhbCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhsb2NhbC5pZGVudGlmaWVyLCBlLmVsZW1lbnQhLmlkZW50aWZpZXIpICYmICghZS5lbGVtZW50IS5zZXJ2ZXIgfHwgZS5lbGVtZW50IS5zZXJ2ZXIgPT09IGxvY2FsLnNlcnZlcikpIHx8IGUuZWxlbWVudFxuXHRcdFx0XHQ6IGUuZWxlbWVudDtcblx0XHRcdG1hbmFnZUV4dGVuc2lvbkFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRsZXQgZ3JvdXBzOiBJQWN0aW9uW11bXSA9IFtdO1xuXHRcdFx0aWYgKG1hbmFnZUV4dGVuc2lvbkFjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRcdGdyb3VwcyA9IGF3YWl0IG1hbmFnZUV4dGVuc2lvbkFjdGlvbi5nZXRBY3Rpb25Hcm91cHMoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGdyb3VwcyA9IGF3YWl0IGdldENvbnRleHRNZW51QWN0aW9ucyhleHRlbnNpb24sIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRncm91cHMuZm9yRWFjaChncm91cCA9PiBncm91cC5mb3JFYWNoKGV4dGVuc2lvbkFjdGlvbiA9PiB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbkFjdGlvbiBpbnN0YW5jZW9mIEV4dGVuc2lvbkFjdGlvbikge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBtZW51QWN0aW9ucyBvZiBncm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtZW51QWN0aW9uIG9mIG1lbnVBY3Rpb25zKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG1lbnVBY3Rpb24pO1xuXHRcdFx0XHRcdGlmIChpc0Rpc3Bvc2FibGUobWVudUFjdGlvbikpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtZW51QWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnBvcCgpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmNvbnRleHRNZW51QWN0aW9uUnVubmVyLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zR3JpZFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlcjogUmVuZGVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IERlbGVnYXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IERlbGVnYXRlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcuZXh0ZW5zaW9ucy1ncmlkLXZpZXcnKSk7XG5cdFx0dGhpcy5yZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVuZGVyZXIsIHsgb25Gb2N1czogRXZlbnQuTm9uZSwgb25CbHVyOiBFdmVudC5Ob25lLCBmaWx0ZXJzOiB7fSB9LCB7IGhvdmVyT3B0aW9uczogeyBwb3NpdGlvbigpIHsgcmV0dXJuIEhvdmVyUG9zaXRpb24uQkVMT1c7IH0gfSB9KTtcblx0XHR0aGlzLmRlbGVnYXRlID0gZGVsZWdhdGU7XG5cdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHR9XG5cblx0c2V0RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXHRcdGV4dGVuc2lvbnMuZm9yRWFjaCgoZSwgaW5kZXgpID0+IHRoaXMucmVuZGVyRXh0ZW5zaW9uKGUsIGluZGV4KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24sIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25Db250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJy5leHRlbnNpb24tY29udGFpbmVyJykpO1xuXHRcdGV4dGVuc2lvbkNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLmRlbGVnYXRlLmdldEhlaWdodCgpfXB4YDtcblx0XHRleHRlbnNpb25Db250YWluZXIuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHRoaXMucmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoZXh0ZW5zaW9uQ29udGFpbmVyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlKSkpO1xuXG5cdFx0Y29uc3Qgb3BlbkV4dGVuc2lvbkFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3BlbkV4dGVuc2lvbkFjdGlvbik7XG5cdFx0b3BlbkV4dGVuc2lvbkFjdGlvbi5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0dGVtcGxhdGUubmFtZS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblxuXHRcdGNvbnN0IGhhbmRsZUV2ZW50ID0gKGU6IFN0YW5kYXJkTW91c2VFdmVudCB8IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTdGFuZGFyZEtleWJvYXJkRXZlbnQgJiYgZS5rZXlDb2RlICE9PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG9wZW5FeHRlbnNpb25BY3Rpb24ucnVuKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUubmFtZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IGhhbmRsZUV2ZW50KG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZG9tLmdldFdpbmRvdyh0ZW1wbGF0ZS5uYW1lKSwgZSkpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGUubmFtZSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IGhhbmRsZUV2ZW50KG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZXh0ZW5zaW9uQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4gaGFuZGxlRXZlbnQobmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSkpKTtcblxuXHRcdHRoaXMucmVuZGVyZXIucmVuZGVyRWxlbWVudChleHRlbnNpb24sIGluZGV4LCB0ZW1wbGF0ZSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25UZW1wbGF0ZURhdGEge1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0aWRlbnRpZmllcjogSFRNTEVsZW1lbnQ7XG5cdGF1dGhvcjogSFRNTEVsZW1lbnQ7XG5cdGV4dGVuc2lvbkRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRleHRlbnNpb25EYXRhOiBJRXh0ZW5zaW9uRGF0YTtcbn1cblxuaW50ZXJmYWNlIElVbmtub3duRXh0ZW5zaW9uVGVtcGxhdGVEYXRhIHtcblx0aWRlbnRpZmllcjogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uRGF0YSB7XG5cdGV4dGVuc2lvbjogSUV4dGVuc2lvbjtcblx0aGFzQ2hpbGRyZW46IGJvb2xlYW47XG5cdGdldENoaWxkcmVuOiAoKSA9PiBQcm9taXNlPElFeHRlbnNpb25EYXRhW10gfCBudWxsPjtcblx0cGFyZW50OiBJRXh0ZW5zaW9uRGF0YSB8IG51bGw7XG59XG5cbmNsYXNzIEFzeW5jRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SUV4dGVuc2lvbkRhdGEsIGFueT4ge1xuXG5cdHB1YmxpYyBoYXNDaGlsZHJlbih7IGhhc0NoaWxkcmVuIH06IElFeHRlbnNpb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGhhc0NoaWxkcmVuO1xuXHR9XG5cblx0cHVibGljIGdldENoaWxkcmVuKGV4dGVuc2lvbkRhdGE6IElFeHRlbnNpb25EYXRhKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uRGF0YS5nZXRDaGlsZHJlbigpO1xuXHR9XG5cbn1cblxuY2xhc3MgVmlydWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRXh0ZW5zaW9uRGF0YT4ge1xuXG5cdHB1YmxpYyBnZXRIZWlnaHQoZWxlbWVudDogSUV4dGVuc2lvbkRhdGEpOiBudW1iZXIge1xuXHRcdHJldHVybiA2Mjtcblx0fVxuXHRwdWJsaWMgZ2V0VGVtcGxhdGVJZCh7IGV4dGVuc2lvbiB9OiBJRXh0ZW5zaW9uRGF0YSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGV4dGVuc2lvbiA/IEV4dGVuc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEIDogVW5rbm93bkV4dGVuc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG59XG5cbmNsYXNzIEV4dGVuc2lvblJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJVHJlZU5vZGU8SUV4dGVuc2lvbkRhdGE+LCBJRXh0ZW5zaW9uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2V4dGVuc2lvbi10ZW1wbGF0ZSc7XG5cblx0Y29uc3RydWN0b3IoQElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBFeHRlbnNpb25SZW5kZXJlci5URU1QTEFURV9JRDtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUV4dGVuc2lvblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2V4dGVuc2lvbicpO1xuXG5cdFx0Y29uc3QgaWNvbldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSWNvbldpZGdldCwgY29udGFpbmVyKTtcblx0XHRjb25zdCBkZXRhaWxzID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuZGV0YWlscycpKTtcblxuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQoZGV0YWlscywgZG9tLiQoJy5oZWFkZXInKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGNvbnN0IG9wZW5FeHRlbnNpb25BY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE9wZW5FeHRlbnNpb25BY3Rpb24pO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkRpc3Bvc2FibGVzID0gW2RvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobmFtZSwgJ2NsaWNrJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdG9wZW5FeHRlbnNpb25BY3Rpb24ucnVuKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9KSwgaWNvbldpZGdldCwgb3BlbkV4dGVuc2lvbkFjdGlvbl07XG5cdFx0Y29uc3QgaWRlbnRpZmllciA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5pZGVudGlmaWVyJykpO1xuXG5cdFx0Y29uc3QgZm9vdGVyID0gZG9tLmFwcGVuZChkZXRhaWxzLCBkb20uJCgnLmZvb3RlcicpKTtcblx0XHRjb25zdCBhdXRob3IgPSBkb20uYXBwZW5kKGZvb3RlciwgZG9tLiQoJy5hdXRob3InKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWUsXG5cdFx0XHRpZGVudGlmaWVyLFxuXHRcdFx0YXV0aG9yLFxuXHRcdFx0ZXh0ZW5zaW9uRGlzcG9zYWJsZXMsXG5cdFx0XHRzZXQgZXh0ZW5zaW9uRGF0YShleHRlbnNpb25EYXRhOiBJRXh0ZW5zaW9uRGF0YSkge1xuXHRcdFx0XHRpY29uV2lkZ2V0LmV4dGVuc2lvbiA9IGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uO1xuXHRcdFx0XHRvcGVuRXh0ZW5zaW9uQWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUV4dGVuc2lvbkRhdGE+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJRXh0ZW5zaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gbm9kZS5lbGVtZW50LmV4dGVuc2lvbjtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSBleHRlbnNpb24uZGlzcGxheU5hbWU7XG5cdFx0ZGF0YS5pZGVudGlmaWVyLnRleHRDb250ZW50ID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0ZGF0YS5hdXRob3IudGV4dENvbnRlbnQgPSBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWU7XG5cdFx0ZGF0YS5leHRlbnNpb25EYXRhID0gbm9kZS5lbGVtZW50O1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElFeHRlbnNpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uRGlzcG9zYWJsZXMgPSBkaXNwb3NlKCg8SUV4dGVuc2lvblRlbXBsYXRlRGF0YT50ZW1wbGF0ZURhdGEpLmV4dGVuc2lvbkRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5jbGFzcyBVbmtub3duRXh0ZW5zaW9uUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxJRXh0ZW5zaW9uRGF0YT4sIElVbmtub3duRXh0ZW5zaW9uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Vua25vd24tZXh0ZW5zaW9uLXRlbXBsYXRlJztcblxuXHRwdWJsaWMgZ2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVW5rbm93bkV4dGVuc2lvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHR9XG5cblx0cHVibGljIHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVW5rbm93bkV4dGVuc2lvblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnZGl2LnVua25vd24tZXh0ZW5zaW9uJykpO1xuXHRcdGRvbS5hcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uZXJyb3ItbWFya2VyJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Vycm9yJywgXCJFcnJvclwiKTtcblx0XHRkb20uYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsIGRvbS4kKCdzcGFuLm1lc3NhZ2UnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnVW5rbm93biBFeHRlbnNpb24nLCBcIlVua25vd24gRXh0ZW5zaW9uOlwiKTtcblxuXHRcdGNvbnN0IGlkZW50aWZpZXIgPSBkb20uYXBwZW5kKG1lc3NhZ2VDb250YWluZXIsIGRvbS4kKCdzcGFuLm1lc3NhZ2UnKSk7XG5cdFx0cmV0dXJuIHsgaWRlbnRpZmllciB9O1xuXHR9XG5cblx0cHVibGljIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElFeHRlbnNpb25EYXRhPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSVVua25vd25FeHRlbnNpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmlkZW50aWZpZXIudGV4dENvbnRlbnQgPSBub2RlLmVsZW1lbnQuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZVRlbXBsYXRlKGRhdGE6IElVbmtub3duRXh0ZW5zaW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdH1cbn1cblxuY2xhc3MgT3BlbkV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2RiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmFjdGlvbi5vcGVuRXh0ZW5zaW9uJywgJycpO1xuXHR9XG5cblx0cHVibGljIHNldCBleHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKSB7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKHNpZGVCeXNpZGU6IGJvb2xlYW4pOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrZGJlbmNoU2VydmljZS5vcGVuKHRoaXMuX2V4dGVuc2lvbiwgeyBzaWRlQnlzaWRlIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbnNUcmVlIGV4dGVuZHMgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxJRXh0ZW5zaW9uRGF0YSwgSUV4dGVuc2lvbkRhdGE+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbnB1dDogSUV4dGVuc2lvbkRhdGEsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvdmVycmlkZVN0eWxlczogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrZGJlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IFZpcnVhbERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgZGF0YVNvdXJjZSA9IG5ldyBBc3luY0RhdGFTb3VyY2UoKTtcblx0XHRjb25zdCByZW5kZXJlcnMgPSBbaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uUmVuZGVyZXIpLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmtub3duRXh0ZW5zaW9uUmVuZGVyZXIpXTtcblx0XHRjb25zdCBpZGVudGl0eVByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0SWQoeyBleHRlbnNpb24sIHBhcmVudCB9OiBJRXh0ZW5zaW9uRGF0YSk6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBwYXJlbnQgPyB0aGlzLmdldElkKHBhcmVudCkgKyAnLycgKyBleHRlbnNpb24uaWRlbnRpZmllci5pZCA6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzdXBlcihcblx0XHRcdCdFeHRlbnNpb25zVHJlZScsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHJlbmRlcmVycyxcblx0XHRcdGRhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGluZGVudDogNDAsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZXh0ZW5zaW9uRGF0YTogSUV4dGVuc2lvbkRhdGEpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGdldEFyaWFMYWJlbEZvckV4dGVuc2lvbihleHRlbnNpb25EYXRhLmV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCk7XG5cblx0XHR0aGlzLnNldElucHV0KGlucHV0KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGRvbS5pc0tleWJvYXJkRXZlbnQoZXZlbnQuYnJvd3NlckV2ZW50KSkge1xuXHRcdFx0XHRleHRlbnNpb25zV29ya2RiZW5jaFNlcnZpY2Uub3BlbihldmVudC5lbGVtZW50c1swXS5leHRlbnNpb24sIHsgc2lkZUJ5c2lkZTogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25EYXRhIGltcGxlbWVudHMgSUV4dGVuc2lvbkRhdGEge1xuXG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbjtcblx0cmVhZG9ubHkgcGFyZW50OiBJRXh0ZW5zaW9uRGF0YSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2V0Q2hpbGRyZW5FeHRlbnNpb25JZHM6IChleHRlbnNpb246IElFeHRlbnNpb24pID0+IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoaWxkcmVuRXh0ZW5zaW9uSWRzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgcGFyZW50OiBJRXh0ZW5zaW9uRGF0YSB8IG51bGwsIGdldENoaWxkcmVuRXh0ZW5zaW9uSWRzOiAoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKSA9PiBzdHJpbmdbXSwgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdHRoaXMucGFyZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuZ2V0Q2hpbGRyZW5FeHRlbnNpb25JZHMgPSBnZXRDaGlsZHJlbkV4dGVuc2lvbklkcztcblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U7XG5cdFx0dGhpcy5jaGlsZHJlbkV4dGVuc2lvbklkcyA9IHRoaXMuZ2V0Q2hpbGRyZW5FeHRlbnNpb25JZHMoZXh0ZW5zaW9uKTtcblx0fVxuXG5cdGdldCBoYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNOb25FbXB0eUFycmF5KHRoaXMuY2hpbGRyZW5FeHRlbnNpb25JZHMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGF0YVtdIHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLmhhc0NoaWxkcmVuKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25bXSA9IGF3YWl0IGdldEV4dGVuc2lvbnModGhpcy5jaGlsZHJlbkV4dGVuc2lvbklkcywgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0Lm1hcChleHRlbnNpb24gPT4gbmV3IEV4dGVuc2lvbkRhdGEoZXh0ZW5zaW9uLCB0aGlzLCB0aGlzLmdldENoaWxkcmVuRXh0ZW5zaW9uSWRzLCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRFeHRlbnNpb25zKGV4dGVuc2lvbnM6IHN0cmluZ1tdLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0Y29uc3QgbG9jYWxCeUlkID0gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwucmVkdWNlKChyZXN1bHQsIGUpID0+IHsgcmVzdWx0LnNldChlLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwgZSk7IHJldHVybiByZXN1bHQ7IH0sIG5ldyBNYXA8c3RyaW5nLCBJRXh0ZW5zaW9uPigpKTtcblx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0Y29uc3QgdG9RdWVyeTogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiBleHRlbnNpb25zKSB7XG5cdFx0Y29uc3QgaWQgPSBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGxvY2FsID0gbG9jYWxCeUlkLmdldChpZCk7XG5cdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRyZXN1bHQucHVzaChsb2NhbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvUXVlcnkucHVzaChpZCk7XG5cdFx0fVxuXHR9XG5cdGlmICh0b1F1ZXJ5Lmxlbmd0aCkge1xuXHRcdGNvbnN0IGdhbGxlcnlSZXN1bHQgPSBhd2FpdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKHRvUXVlcnkubWFwKGlkID0+ICh7IGlkIH0pKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmVzdWx0LnB1c2goLi4uZ2FsbGVyeVJlc3VsdCk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBCdWlsZHMgbW9kYWwgbmF2aWdhdGlvbiBvcHRpb25zIGZvciBuYXZpZ2F0aW5nIGl0ZW1zIGluIGEgcGFnZWQgbGlzdCBtb2RlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTW9kYWxOYXZpZ2F0aW9uRm9yUGFnZWRMaXN0PFQ+KFxuXHRvcGVuZWRJdGVtOiBULFxuXHRnZXRNb2RlbDogKCkgPT4gSVBhZ2VkTW9kZWw8VD4gfCB1bmRlZmluZWQsXG5cdGlzU2FtZTogKGE6IFQsIGI6IFQpID0+IGJvb2xlYW4sXG5cdG9wZW5JdGVtOiAoaXRlbTogVCwgbW9kYWw6IElNb2RhbEVkaXRvclBhcnRPcHRpb25zKSA9PiB2b2lkLFxuXHRjYW5jZWxsYXRpb25TdG9yZTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+LFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuKTogSU1vZGFsRWRpdG9yUGFydE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtb2RlbCA9IGdldE1vZGVsKCk7XG5cdGlmICghbW9kZWwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgdG90YWwgPSBtb2RlbC5sZW5ndGg7XG5cdGlmICh0b3RhbCA8PSAxKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIEZpbmQgdGhlIGluZGV4IG9mIHRoZSBvcGVuZWQgaXRlbSBpbiB0aGUgbGlzdFxuXHRsZXQgY3VycmVudCA9IC0xO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHRvdGFsOyBpKyspIHtcblx0XHRpZiAobW9kZWwuaXNSZXNvbHZlZChpKSAmJiBpc1NhbWUobW9kZWwuZ2V0KGkpLCBvcGVuZWRJdGVtKSkge1xuXHRcdFx0Y3VycmVudCA9IGk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRpZiAoY3VycmVudCA9PT0gLTEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgb3BlbkF0SW5kZXggPSAoaW5kZXg6IG51bWJlciwgaXRlbTogVCkgPT4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUb3RhbCA9IGdldE1vZGVsKCk/Lmxlbmd0aCA/PyAwO1xuXHRcdG9wZW5JdGVtKGl0ZW0sIHsgbmF2aWdhdGlvbjogeyB0b3RhbDogY3VycmVudFRvdGFsLCBjdXJyZW50OiBpbmRleCwgbmF2aWdhdGUgfSB9KTtcblx0fTtcblxuXHRsZXQgY3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgbmF2aWdhdGUgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdGN0cz8uY2FuY2VsKCk7XG5cdFx0Y3RzID0gY2FuY2VsbGF0aW9uU3RvcmUudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCB0b2tlbiA9IGN0cy50b2tlbjtcblxuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IGdldE1vZGVsKCk7XG5cdFx0aWYgKCFjdXJyZW50TW9kZWwgfHwgaW5kZXggPCAwIHx8IGluZGV4ID49IGN1cnJlbnRNb2RlbC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGYXN0IHBhdGg6IGl0ZW0gYWxyZWFkeSByZXNvbHZlZFxuXHRcdGlmIChjdXJyZW50TW9kZWwuaXNSZXNvbHZlZChpbmRleCkpIHtcblx0XHRcdG9wZW5BdEluZGV4KGluZGV4LCBjdXJyZW50TW9kZWwuZ2V0KGluZGV4KSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2xvdyBwYXRoOiByZXNvbHZlIHRoZSBpdGVtIGZpcnN0XG5cdFx0ZWxzZSB7XG5cdFx0XHRjdXJyZW50TW9kZWwucmVzb2x2ZShpbmRleCwgdG9rZW4pLnRoZW4oaXRlbSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG9wZW5BdEluZGV4KGluZGV4LCBpdGVtKTtcblx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIHJlc29sdmluZyBpdGVtIGF0IGluZGV4ICR7aW5kZXh9IGZvciBtb2RhbCBuYXZpZ2F0aW9uYCwgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH07XG5cblx0cmV0dXJuIHsgbmF2aWdhdGlvbjogeyB0b3RhbCwgY3VycmVudCwgbmF2aWdhdGUgfSB9O1xufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWU6IElDb2xvclRoZW1lLCBjb2xsZWN0b3I6IElDc3NTdHlsZUNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBmb2N1c0JhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihsaXN0Rm9jdXNCYWNrZ3JvdW5kKTtcblx0aWYgKGZvY3VzQmFja2dyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9ucy1ncmlkLXZpZXcgLmV4dGVuc2lvbi1jb250YWluZXI6Zm9jdXMgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke2ZvY3VzQmFja2dyb3VuZH07IG91dGxpbmU6IG5vbmU7IH1gKTtcblx0fVxuXHRjb25zdCBmb2N1c0ZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihsaXN0Rm9jdXNGb3JlZ3JvdW5kKTtcblx0aWYgKGZvY3VzRm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9ucy1ncmlkLXZpZXcgLmV4dGVuc2lvbi1jb250YWluZXI6Zm9jdXMgeyBjb2xvcjogJHtmb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdH1cblx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZm9yZWdyb3VuZCk7XG5cdGNvbnN0IGVkaXRvckJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRpZiAoZm9yZWdyb3VuZENvbG9yICYmIGVkaXRvckJhY2tncm91bmRDb2xvcikge1xuXHRcdGNvbnN0IGF1dGhvckZvcmVncm91bmQgPSBmb3JlZ3JvdW5kQ29sb3IudHJhbnNwYXJlbnQoLjkpLm1ha2VPcGFxdWUoZWRpdG9yQmFja2dyb3VuZENvbG9yKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbnMtZ3JpZC12aWV3IC5leHRlbnNpb24tY29udGFpbmVyOm5vdCguZGlzYWJsZWQpIC5hdXRob3IgeyBjb2xvcjogJHthdXRob3JGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdGNvbnN0IGRpc2FibGVkRXh0ZW5zaW9uRm9yZWdyb3VuZCA9IGZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCguNSkubWFrZU9wYXF1ZShlZGl0b3JCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9ucy1ncmlkLXZpZXcgLmV4dGVuc2lvbi1jb250YWluZXIuZGlzYWJsZWQgeyBjb2xvcjogJHtkaXNhYmxlZEV4dGVuc2lvbkZvcmVncm91bmR9OyB9YCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBc0IsU0FBUyxZQUFZLGlCQUFpQixjQUFjLGNBQWMseUJBQXlCO0FBQ2pILFNBQVMsUUFBUSxjQUF1QixpQkFBaUI7QUFDekQsU0FBUyxtQ0FBcUU7QUFDOUUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBMEMsd0JBQXdCLDBCQUEwQjtBQUNyRyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtDQUFtRTtBQUc1RSxT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RyxVQUFVO0FBQzNDLGFBQVMsTUFBTSxFQUFFLFlBQVksRUFBRSxPQUFPLGNBQWMsU0FBUyxPQUFPLFNBQVMsRUFBRSxDQUFDO0FBQUEsRUFDakY7QUFFQSxNQUFJO0FBQ0osUUFBTSxXQUFXLENBQUMsVUFBa0I7QUFDbkMsU0FBSyxPQUFPO0FBQ1osVUFBTSxrQkFBa0IsUUFBUSxJQUFJLHdCQUF3QjtBQUM1RCxVQUFNLFFBQVEsSUFBSTtBQUVsQixVQUFNLGVBQWUsU0FBUztBQUM5QixRQUFJLENBQUMsZ0JBQWdCLFFBQVEsS0FBSyxTQUFTLGFBQWEsUUFBUTtBQUMvRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLGFBQWEsV0FBVyxLQUFLLEdBQUc7QUFDbkMsa0JBQVksT0FBTyxhQUFhLElBQUksS0FBSyxDQUFDO0FBQUEsSUFDM0MsT0FHSztBQUNKLG1CQUFhLFFBQVEsT0FBTyxLQUFLLEVBQUUsS0FBSyxVQUFRO0FBQy9DLFlBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxRQUNEO0FBRUEsb0JBQVksT0FBTyxJQUFJO0FBQUEsTUFDeEIsR0FBRyxXQUFTO0FBQ1gsWUFBSSxDQUFDLG9CQUFvQixLQUFLLEdBQUc7QUFDaEMscUJBQVcsTUFBTSx1Q0FBdUMsS0FBSyx5QkFBeUIsS0FBSztBQUFBLFFBQzVGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFFQSxTQUFPLEVBQUUsWUFBWSxFQUFFLE9BQU8sU0FBUyxTQUFTLEVBQUU7QUFDbkQ7QUFFQSwyQkFBMkIsQ0FBQyxPQUFvQixjQUFrQztBQUNqRixRQUFNLGtCQUFrQixNQUFNLFNBQVMsbUJBQW1CO0FBQzFELE1BQUksaUJBQWlCO0FBQ3BCLGNBQVUsUUFBUSx3RUFBd0UsZUFBZSxvQkFBb0I7QUFBQSxFQUM5SDtBQUNBLFFBQU0sa0JBQWtCLE1BQU0sU0FBUyxtQkFBbUI7QUFDMUQsTUFBSSxpQkFBaUI7QUFDcEIsY0FBVSxRQUFRLDZEQUE2RCxlQUFlLEtBQUs7QUFBQSxFQUNwRztBQUNBLFFBQU0sa0JBQWtCLE1BQU0sU0FBUyxVQUFVO0FBQ2pELFFBQU0sd0JBQXdCLE1BQU0sU0FBUyxnQkFBZ0I7QUFDN0QsTUFBSSxtQkFBbUIsdUJBQXVCO0FBQzdDLFVBQU0sbUJBQW1CLGdCQUFnQixZQUFZLEdBQUUsRUFBRSxXQUFXLHFCQUFxQjtBQUN6RixjQUFVLFFBQVEsOEVBQThFLGdCQUFnQixLQUFLO0FBQ3JILFVBQU0sOEJBQThCLGdCQUFnQixZQUFZLEdBQUUsRUFBRSxXQUFXLHFCQUFxQjtBQUNwRyxjQUFVLFFBQVEsZ0VBQWdFLDJCQUEyQixLQUFLO0FBQUEsRUFDbkg7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJvcHRpb25zIiwgInJlc3VsdCJdCn0K
