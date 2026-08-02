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
import * as dom from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { localize } from "../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { FileKind, IFileService } from "../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ResourceContextKey } from "../../../../common/contextkeys.js";
import { isStringImplicitContextValue, resolveChatContextIcon } from "../../common/attachments/chatVariableEntries.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
import { BrowserViewUri } from "../../../../../platform/browserView/common/browserViewUri.js";
let ImplicitContextAttachmentWidget = class extends Disposable {
  constructor(widgetRef, isAttachmentAlreadyAttached, attachment, resourceLabels, attachmentModel, domNode, contextKeyService, contextMenuService, labelService, menuService, fileService, languageService, modelService, hoverService, configService, chatContextService, browserViewService, themeService) {
    super();
    this.widgetRef = widgetRef;
    this.isAttachmentAlreadyAttached = isAttachmentAlreadyAttached;
    this.attachment = attachment;
    this.resourceLabels = resourceLabels;
    this.attachmentModel = attachmentModel;
    this.domNode = domNode;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.labelService = labelService;
    this.menuService = menuService;
    this.fileService = fileService;
    this.languageService = languageService;
    this.modelService = modelService;
    this.hoverService = hoverService;
    this.configService = configService;
    this.chatContextService = chatContextService;
    this.browserViewService = browserViewService;
    this.themeService = themeService;
    this.renderDisposables = this._register(new DisposableStore());
    this.renderedCount = 0;
    this.render();
    this._register(this.themeService.onDidColorThemeChange(() => {
      if (this._hasDualPathIcon()) {
        this.render();
      }
    }));
  }
  _hasDualPathIcon() {
    return this.attachment.values.some((context) => {
      const iconPath = context.iconPath;
      return !!iconPath && !ThemeIcon.isThemeIcon(iconPath) && !URI.isUri(iconPath);
    });
  }
  render() {
    this.renderDisposables.clear();
    this.renderedCount = 0;
    for (const context of this.attachment.values) {
      const targetUri = context.uri;
      const targetRange = isLocation(context.value) ? context.value.range : void 0;
      const targetHandle = isStringImplicitContextValue(context.value) ? context.value.handle : void 0;
      const currentlyAttached = this.isAttachmentAlreadyAttached(targetUri, targetRange, targetHandle);
      if (!currentlyAttached) {
        this.renderMainContext(context, context.isSelection);
        this.renderedCount++;
      }
    }
  }
  get hasRenderedContexts() {
    return this.renderedCount > 0;
  }
  renderMainContext(context, isSelection) {
    const contextNode = dom.$(".chat-attached-context-attachment.show-file-icons.implicit");
    this.domNode.appendChild(contextNode);
    contextNode.tabIndex = 0;
    contextNode.classList.toggle("disabled", !context.enabled);
    const file = context.uri;
    const attachmentTypeName = file?.scheme === Schemas.vscodeNotebookCell ? localize("cell.lowercase", "cell") : localize("file.lowercase", "file");
    const contextLabel = context.name ?? (file ? basename(file) : localize("implicitContextFallback", "context"));
    const isSuggestedEnabled = this.configService.getValue("chat.implicitContext.suggestedContext");
    if (isSuggestedEnabled) {
      if (!isSelection) {
        const buttonMsg = context.enabled ? localize("disableImplicitContext", "Disable {0} context {1}", attachmentTypeName, contextLabel) : localize("addToContext", "Add {0} to context", contextLabel);
        const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
        toggleButton.icon = context.enabled ? Codicon.x : Codicon.plus;
        this.renderDisposables.add(toggleButton.onDidClick(async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!context.enabled) {
            await this.convertToRegularAttachment(context);
          }
          context.enabled = false;
        }));
      } else {
        const pinButtonMsg = localize("pinSelection", "Pin selection");
        const pinButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: pinButtonMsg }));
        pinButton.icon = Codicon.pinned;
        this.renderDisposables.add(pinButton.onDidClick(async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await this.pinSelection();
        }));
      }
      if (!context.enabled && isSelection) {
        contextNode.classList.remove("disabled");
      }
      this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CLICK, async (e) => {
        if (!context.enabled && !isSelection) {
          await this.convertToRegularAttachment(context);
        }
      }));
      this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.KEY_DOWN, async (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
          if (!context.enabled && !isSelection) {
            e.preventDefault();
            e.stopPropagation();
            await this.convertToRegularAttachment(context);
          }
        }
      }));
    } else {
      const buttonMsg = context.enabled ? localize("disable", "Disable current {0} context", attachmentTypeName) : localize("enable", "Enable current {0} context", attachmentTypeName);
      const toggleButton = this.renderDisposables.add(new Button(contextNode, { supportIcons: true, title: buttonMsg }));
      toggleButton.icon = context.enabled ? Codicon.eye : Codicon.eyeClosed;
      this.renderDisposables.add(toggleButton.onDidClick((e) => {
        e.stopPropagation();
        context.enabled = !context.enabled;
      }));
    }
    const label = this.renderDisposables.add(this.resourceLabels.create(contextNode, { supportIcons: true }));
    let title;
    let markdownTooltip;
    if (isStringImplicitContextValue(context.value)) {
      markdownTooltip = context.value.tooltip;
      title = this.renderString(label, context.name, context.iconPath, context.value.resourceUri, markdownTooltip, localize("openFile", "Current file context"));
      contextNode.ariaLabel = localize("chat.implicitStringContext", "Suggested context, {0}", context.name);
    } else {
      title = this.renderResource(context.value, context.isSelection, context.enabled, label, contextNode);
    }
    if (markdownTooltip || title) {
      this.renderDisposables.add(this.hoverService.setupDelayedHover(contextNode, {
        content: markdownTooltip ?? title,
        appearance: { showPointer: true }
      }));
    }
    const scopedContextKeyService = this.renderDisposables.add(this.contextKeyService.createScoped(contextNode));
    const resourceContextKey = this.renderDisposables.add(new ResourceContextKey(scopedContextKeyService, this.fileService, this.languageService, this.modelService));
    resourceContextKey.set(file);
    this.renderDisposables.add(dom.addDisposableListener(contextNode, dom.EventType.CONTEXT_MENU, async (domEvent) => {
      const event = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
      dom.EventHelper.stop(domEvent, true);
      this.contextMenuService.showContextMenu({
        contextKeyService: scopedContextKeyService,
        getAnchor: () => event,
        getActions: () => {
          const menu = this.menuService.getMenuActions(MenuId.ChatInputResourceAttachmentContext, scopedContextKeyService, { arg: file });
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  renderString(resourceLabel, name, iconPath, resourceUri, markdownTooltip, defaultTitle) {
    const title = markdownTooltip ? void 0 : defaultTitle;
    if (iconPath && ThemeIcon.isThemeIcon(iconPath) && (ThemeIcon.isFile(iconPath) || ThemeIcon.isFolder(iconPath)) && resourceUri) {
      const fileKind = ThemeIcon.isFolder(iconPath) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = getIconClasses(this.modelService, this.languageService, resourceUri, fileKind);
      resourceLabel.setLabel(name, void 0, { extraClasses: iconClasses, title });
    } else {
      const resolvedIcon = iconPath ? resolveChatContextIcon(iconPath, isDark(this.themeService.getColorTheme().type)) : void 0;
      resourceLabel.setLabel(name, void 0, { iconPath: resolvedIcon, title });
    }
    return title;
  }
  renderResource(attachmentValue, isSelection, enabled, label, contextNode) {
    const file = URI.isUri(attachmentValue) ? attachmentValue : attachmentValue.uri;
    const range = URI.isUri(attachmentValue) || !isSelection ? void 0 : attachmentValue.range;
    if (file.scheme === Schemas.vscodeBrowser) {
      return this.renderBrowserResource(file, label, contextNode);
    }
    const attachmentTypeName = file.scheme === Schemas.vscodeNotebookCell ? localize("cell.lowercase", "cell") : localize("file.lowercase", "file");
    const fileBasename = basename(file);
    const fileDirname = dirname(file);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    const ariaLabel = range ? localize("chat.implicitFileContextWithRange", "Suggested context, {0}, {1}, line {2} to line {3}", attachmentTypeName, friendlyName, range.startLineNumber, range.endLineNumber) : localize("chat.implicitFileContext", "Suggested context, {0}, {1}", attachmentTypeName, friendlyName);
    const uriLabel = this.labelService.getUriLabel(file, { relative: true });
    const currentFile = localize("openEditor", "Current {0} context", attachmentTypeName);
    const inactive = localize("enableHint", "Enable current {0} context", attachmentTypeName);
    const currentFileHint = enabled || isSelection ? currentFile : inactive;
    const title = `${currentFileHint}
${uriLabel}`;
    label.setFile(file, {
      fileKind: FileKind.FILE,
      hidePath: true,
      range,
      title
    });
    contextNode.ariaLabel = ariaLabel;
    return title;
  }
  renderBrowserResource(browserUri, label, contextNode) {
    const id = BrowserViewUri.getId(browserUri);
    const input = id && this.browserViewService.getKnownBrowserViews().get(id);
    if (!input) {
      return void 0;
    }
    const update = () => {
      label.setLabel(input.getName(), void 0, { iconPath: Codicon.globe });
      contextNode.ariaLabel = localize("chat.implicitBrowserContext", "Suggested browser context, {0}", input.getName());
    };
    update();
    this.renderDisposables.add(input.onDidChangeLabel(() => update()));
    return input.getTitle();
  }
  async convertToRegularAttachment(attachment) {
    if (!attachment.value) {
      return;
    }
    if (isStringImplicitContextValue(attachment.value)) {
      if (attachment.value.value === void 0) {
        await this.chatContextService.resolveChatContext(attachment.value);
      }
      const context = {
        kind: "string",
        value: attachment.value.value,
        id: attachment.id,
        name: attachment.name,
        iconPath: attachment.value.iconPath,
        modelDescription: attachment.modelDescription,
        uri: attachment.value.uri,
        resourceUri: attachment.value.resourceUri,
        tooltip: attachment.value.tooltip,
        commandId: attachment.value.commandId,
        handle: attachment.value.handle
      };
      this.attachmentModel.addContext(context);
    } else {
      const file = URI.isUri(attachment.value) ? attachment.value : attachment.value.uri;
      if (file.scheme === Schemas.vscodeNotebookCell && isLocation(attachment.value)) {
        this.attachmentModel.addFile(file, attachment.value.range);
      } else {
        this.attachmentModel.addFile(file);
      }
    }
    this.widgetRef()?.focusInput();
  }
  async pinSelection() {
    for (const attachment of this.attachment.values) {
      if (!attachment.value || !attachment.isSelection) {
        continue;
      }
      if (!URI.isUri(attachment.value) && !isStringImplicitContextValue(attachment.value)) {
        const location = attachment.value;
        this.attachmentModel.addFile(location.uri, location.range);
      }
    }
    this.widgetRef()?.focusInput();
  }
};
ImplicitContextAttachmentWidget = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, IFileService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, IModelService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IChatContextService),
  __decorateParam(16, IBrowserViewWorkbenchService),
  __decorateParam(17, IThemeService)
], ImplicitContextAttachmentWidget);
export {
  ImplicitContextAttachmentWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9pbXBsaWNpdENvbnRleHRBdHRhY2htZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0xvY2F0aW9uLCBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRJY29uUGF0aCwgSUNoYXRSZXF1ZXN0U3RyaW5nVmFyaWFibGVFbnRyeSwgaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSwgcmVzb2x2ZUNoYXRDb250ZXh0SWNvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRNb2RlbCB9IGZyb20gJy4vY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29udGV4dENvbnRyaWIvY2hhdENvbnRleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbXBsaWNpdENvbnRleHQsIENoYXRJbXBsaWNpdENvbnRleHRzIH0gZnJvbSAnLi9jaGF0SW1wbGljaXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3VXJpLmpzJztcblxuZXhwb3J0IGNsYXNzIEltcGxpY2l0Q29udGV4dEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZW5kZXJlZENvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldFJlZjogKCkgPT4gSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpc0F0dGFjaG1lbnRBbHJlYWR5QXR0YWNoZWQ6ICh0YXJnZXRVcmk6IFVSSSB8IHVuZGVmaW5lZCwgdGFyZ2V0UmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgdGFyZ2V0SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpID0+IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhdHRhY2htZW50OiBDaGF0SW1wbGljaXRDb250ZXh0cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF0dGFjaG1lbnRNb2RlbDogQ2hhdEF0dGFjaG1lbnRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0Q29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0Q29udGV4dFNlcnZpY2U6IElDaGF0Q29udGV4dFNlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1NlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXG5cdFx0Ly8gQSBsaWdodC9kYXJrIGljb24gbXVzdCBiZSByZWFwcGxpZWQgd2hlbiB0aGUgY29sb3IgdGhlbWUgY2hhbmdlcyBzbyB0aGUgY29ycmVjdCB1cmkgaXMgdXNlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faGFzRHVhbFBhdGhJY29uKCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNEdWFsUGF0aEljb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYXR0YWNobWVudC52YWx1ZXMuc29tZShjb250ZXh0ID0+IHtcblx0XHRcdGNvbnN0IGljb25QYXRoID0gY29udGV4dC5pY29uUGF0aDtcblx0XHRcdHJldHVybiAhIWljb25QYXRoICYmICFUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmICFVUkkuaXNVcmkoaWNvblBhdGgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoKSB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMucmVuZGVyZWRDb3VudCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRleHQgb2YgdGhpcy5hdHRhY2htZW50LnZhbHVlcykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0VXJpOiBVUkkgfCB1bmRlZmluZWQgPSBjb250ZXh0LnVyaTtcblx0XHRcdGNvbnN0IHRhcmdldFJhbmdlID0gaXNMb2NhdGlvbihjb250ZXh0LnZhbHVlKSA/IGNvbnRleHQudmFsdWUucmFuZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0YXJnZXRIYW5kbGUgPSBpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlKGNvbnRleHQudmFsdWUpID8gY29udGV4dC52YWx1ZS5oYW5kbGUgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjdXJyZW50bHlBdHRhY2hlZCA9IHRoaXMuaXNBdHRhY2htZW50QWxyZWFkeUF0dGFjaGVkKHRhcmdldFVyaSwgdGFyZ2V0UmFuZ2UsIHRhcmdldEhhbmRsZSk7XG5cdFx0XHRpZiAoIWN1cnJlbnRseUF0dGFjaGVkKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFpbkNvbnRleHQoY29udGV4dCwgY29udGV4dC5pc1NlbGVjdGlvbik7XG5cdFx0XHRcdHRoaXMucmVuZGVyZWRDb3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldCBoYXNSZW5kZXJlZENvbnRleHRzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlcmVkQ291bnQgPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYWluQ29udGV4dChjb250ZXh0OiBDaGF0SW1wbGljaXRDb250ZXh0LCBpc1NlbGVjdGlvbj86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBjb250ZXh0Tm9kZSA9IGRvbS4kKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQuc2hvdy1maWxlLWljb25zLmltcGxpY2l0Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGNvbnRleHROb2RlKTtcblx0XHRjb250ZXh0Tm9kZS50YWJJbmRleCA9IDA7XG5cblx0XHRjb250ZXh0Tm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFjb250ZXh0LmVuYWJsZWQpO1xuXHRcdGNvbnN0IGZpbGU6IFVSSSB8IHVuZGVmaW5lZCA9IGNvbnRleHQudXJpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRUeXBlTmFtZSA9IGZpbGU/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwgPyBsb2NhbGl6ZSgnY2VsbC5sb3dlcmNhc2UnLCBcImNlbGxcIikgOiBsb2NhbGl6ZSgnZmlsZS5sb3dlcmNhc2UnLCBcImZpbGVcIik7XG5cdFx0Y29uc3QgY29udGV4dExhYmVsID0gY29udGV4dC5uYW1lID8/IChmaWxlID8gYmFzZW5hbWUoZmlsZSkgOiBsb2NhbGl6ZSgnaW1wbGljaXRDb250ZXh0RmFsbGJhY2snLCBcImNvbnRleHRcIikpO1xuXG5cdFx0Y29uc3QgaXNTdWdnZXN0ZWRFbmFibGVkID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgdG9nZ2xlIGJ1dHRvbiBCRUZPUkUgdGhlIGxhYmVsIHNvIGl0IGFwcGVhcnMgb24gdGhlIGxlZnRcblx0XHRpZiAoaXNTdWdnZXN0ZWRFbmFibGVkKSB7XG5cdFx0XHRpZiAoIWlzU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbk1zZyA9IGNvbnRleHQuZW5hYmxlZFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Rpc2FibGVJbXBsaWNpdENvbnRleHQnLCBcIkRpc2FibGUgezB9IGNvbnRleHQgezF9XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSwgY29udGV4dExhYmVsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FkZFRvQ29udGV4dCcsIFwiQWRkIHswfSB0byBjb250ZXh0XCIsIGNvbnRleHRMYWJlbCk7XG5cdFx0XHRcdGNvbnN0IHRvZ2dsZUJ1dHRvbiA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oY29udGV4dE5vZGUsIHsgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogYnV0dG9uTXNnIH0pKTtcblx0XHRcdFx0dG9nZ2xlQnV0dG9uLmljb24gPSBjb250ZXh0LmVuYWJsZWQgPyBDb2RpY29uLnggOiBDb2RpY29uLnBsdXM7XG5cdFx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRvZ2dsZUJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0aWYgKCFjb250ZXh0LmVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29udmVydFRvUmVndWxhckF0dGFjaG1lbnQoY29udGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRleHQuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwaW5CdXR0b25Nc2cgPSBsb2NhbGl6ZSgncGluU2VsZWN0aW9uJywgXCJQaW4gc2VsZWN0aW9uXCIpO1xuXHRcdFx0XHRjb25zdCBwaW5CdXR0b24gPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGNvbnRleHROb2RlLCB7IHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IHBpbkJ1dHRvbk1zZyB9KSk7XG5cdFx0XHRcdHBpbkJ1dHRvbi5pY29uID0gQ29kaWNvbi5waW5uZWQ7XG5cdFx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHBpbkJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5waW5TZWxlY3Rpb24oKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWNvbnRleHQuZW5hYmxlZCAmJiBpc1NlbGVjdGlvbikge1xuXHRcdFx0XHRjb250ZXh0Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRleHROb2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWNvbnRleHQuZW5hYmxlZCAmJiAhaXNTZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbnZlcnRUb1JlZ3VsYXJBdHRhY2htZW50KGNvbnRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGV4dE5vZGUsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0XHRpZiAoIWNvbnRleHQuZW5hYmxlZCAmJiAhaXNTZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbnZlcnRUb1JlZ3VsYXJBdHRhY2htZW50KGNvbnRleHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBidXR0b25Nc2cgPSBjb250ZXh0LmVuYWJsZWQgPyBsb2NhbGl6ZSgnZGlzYWJsZScsIFwiRGlzYWJsZSBjdXJyZW50IHswfSBjb250ZXh0XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSkgOiBsb2NhbGl6ZSgnZW5hYmxlJywgXCJFbmFibGUgY3VycmVudCB7MH0gY29udGV4dFwiLCBhdHRhY2htZW50VHlwZU5hbWUpO1xuXHRcdFx0Y29uc3QgdG9nZ2xlQnV0dG9uID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihjb250ZXh0Tm9kZSwgeyBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBidXR0b25Nc2cgfSkpO1xuXHRcdFx0dG9nZ2xlQnV0dG9uLmljb24gPSBjb250ZXh0LmVuYWJsZWQgPyBDb2RpY29uLmV5ZSA6IENvZGljb24uZXllQ2xvc2VkO1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodG9nZ2xlQnV0dG9uLm9uRGlkQ2xpY2soKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTsgLy8gcHJldmVudCBpdCBmcm9tIHRyaWdnZXJpbmcgdGhlIGNsaWNrIGhhbmRsZXIgb24gdGhlIHBhcmVudCBpbW1lZGlhdGVseSBhZnRlciByZXJlbmRlcmluZ1xuXHRcdFx0XHRjb250ZXh0LmVuYWJsZWQgPSAhY29udGV4dC5lbmFibGVkO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5yZXNvdXJjZUxhYmVscy5jcmVhdGUoY29udGV4dE5vZGUsIHsgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblxuXHRcdGxldCB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBtYXJrZG93blRvb2x0aXA6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZShjb250ZXh0LnZhbHVlKSkge1xuXHRcdFx0bWFya2Rvd25Ub29sdGlwID0gY29udGV4dC52YWx1ZS50b29sdGlwO1xuXHRcdFx0dGl0bGUgPSB0aGlzLnJlbmRlclN0cmluZyhsYWJlbCwgY29udGV4dC5uYW1lLCBjb250ZXh0Lmljb25QYXRoLCBjb250ZXh0LnZhbHVlLnJlc291cmNlVXJpLCBtYXJrZG93blRvb2x0aXAsIGxvY2FsaXplKCdvcGVuRmlsZScsIFwiQ3VycmVudCBmaWxlIGNvbnRleHRcIikpO1xuXHRcdFx0Y29udGV4dE5vZGUuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuaW1wbGljaXRTdHJpbmdDb250ZXh0JywgXCJTdWdnZXN0ZWQgY29udGV4dCwgezB9XCIsIGNvbnRleHQubmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRpdGxlID0gdGhpcy5yZW5kZXJSZXNvdXJjZShjb250ZXh0LnZhbHVlLCBjb250ZXh0LmlzU2VsZWN0aW9uLCBjb250ZXh0LmVuYWJsZWQsIGxhYmVsLCBjb250ZXh0Tm9kZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcmtkb3duVG9vbHRpcCB8fCB0aXRsZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoY29udGV4dE5vZGUsIHtcblx0XHRcdFx0Y29udGVudDogbWFya2Rvd25Ub29sdGlwISA/PyB0aXRsZSEsXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IG1lbnVcblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMucmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGNvbnRleHROb2RlKSk7XG5cblx0XHRjb25zdCByZXNvdXJjZUNvbnRleHRLZXkgPSB0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgUmVzb3VyY2VDb250ZXh0S2V5KHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgdGhpcy5tb2RlbFNlcnZpY2UpKTtcblx0XHRyZXNvdXJjZUNvbnRleHRLZXkuc2V0KGZpbGUpO1xuXG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250ZXh0Tm9kZSwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGFzeW5jIGRvbUV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KGRvbUV2ZW50KSwgZG9tRXZlbnQpO1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZG9tRXZlbnQsIHRydWUpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRjb250ZXh0S2V5U2VydmljZTogc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQ2hhdElucHV0UmVzb3VyY2VBdHRhY2htZW50Q29udGV4dCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHsgYXJnOiBmaWxlIH0pO1xuXHRcdFx0XHRcdHJldHVybiBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTdHJpbmcocmVzb3VyY2VMYWJlbDogSVJlc291cmNlTGFiZWwsIG5hbWU6IHN0cmluZywgaWNvblBhdGg6IENoYXRDb250ZXh0SWNvblBhdGggfCB1bmRlZmluZWQsIHJlc291cmNlVXJpOiBVUkkgfCB1bmRlZmluZWQsIG1hcmtkb3duVG9vbHRpcDogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLCBkZWZhdWx0VGl0bGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRG9uJ3Qgc2V0IHRpdGxlIGlmIHdlIGhhdmUgYSBtYXJrZG93biB0b29sdGlwIC0gdGhlIGhvdmVyIHNlcnZpY2Ugd2lsbCBoYW5kbGUgaXRcblx0XHRjb25zdCB0aXRsZSA9IG1hcmtkb3duVG9vbHRpcCA/IHVuZGVmaW5lZCA6IGRlZmF1bHRUaXRsZTtcblxuXHRcdC8vIERlcml2ZSBpY29uIGNsYXNzZXMgZnJvbSByZXNvdXJjZVVyaSBmb3IgZmlsZS9mb2xkZXIgdGhlbWUgaWNvbnNcblx0XHRpZiAoaWNvblBhdGggJiYgVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb25QYXRoKSAmJiAoVGhlbWVJY29uLmlzRmlsZShpY29uUGF0aCkgfHwgVGhlbWVJY29uLmlzRm9sZGVyKGljb25QYXRoKSkgJiYgcmVzb3VyY2VVcmkpIHtcblx0XHRcdGNvbnN0IGZpbGVLaW5kID0gVGhlbWVJY29uLmlzRm9sZGVyKGljb25QYXRoKSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEU7XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NlcyA9IGdldEljb25DbGFzc2VzKHRoaXMubW9kZWxTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2VVcmksIGZpbGVLaW5kKTtcblx0XHRcdHJlc291cmNlTGFiZWwuc2V0TGFiZWwobmFtZSwgdW5kZWZpbmVkLCB7IGV4dHJhQ2xhc3NlczogaWNvbkNsYXNzZXMsIHRpdGxlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEljb24gPSBpY29uUGF0aCA/IHJlc29sdmVDaGF0Q29udGV4dEljb24oaWNvblBhdGgsIGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmVzb3VyY2VMYWJlbC5zZXRMYWJlbChuYW1lLCB1bmRlZmluZWQsIHsgaWNvblBhdGg6IHJlc29sdmVkSWNvbiwgdGl0bGUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmVzb3VyY2UoYXR0YWNobWVudFZhbHVlOiBMb2NhdGlvbiB8IFVSSSB8IHVuZGVmaW5lZCwgaXNTZWxlY3Rpb246IGJvb2xlYW4sIGVuYWJsZWQ6IGJvb2xlYW4sIGxhYmVsOiBJUmVzb3VyY2VMYWJlbCwgY29udGV4dE5vZGU6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaWxlID0gVVJJLmlzVXJpKGF0dGFjaG1lbnRWYWx1ZSkgPyBhdHRhY2htZW50VmFsdWUgOiBhdHRhY2htZW50VmFsdWUhLnVyaTtcblx0XHRjb25zdCByYW5nZSA9IFVSSS5pc1VyaShhdHRhY2htZW50VmFsdWUpIHx8ICFpc1NlbGVjdGlvbiA/IHVuZGVmaW5lZCA6IGF0dGFjaG1lbnRWYWx1ZSEucmFuZ2U7XG5cblx0XHRpZiAoZmlsZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQnJvd3Nlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyQnJvd3NlclJlc291cmNlKGZpbGUsIGxhYmVsLCBjb250ZXh0Tm9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0YWNobWVudFR5cGVOYW1lID0gZmlsZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsID8gbG9jYWxpemUoJ2NlbGwubG93ZXJjYXNlJywgXCJjZWxsXCIpIDogbG9jYWxpemUoJ2ZpbGUubG93ZXJjYXNlJywgXCJmaWxlXCIpO1xuXG5cdFx0Y29uc3QgZmlsZUJhc2VuYW1lID0gYmFzZW5hbWUoZmlsZSk7XG5cdFx0Y29uc3QgZmlsZURpcm5hbWUgPSBkaXJuYW1lKGZpbGUpO1xuXHRcdGNvbnN0IGZyaWVuZGx5TmFtZSA9IGAke2ZpbGVCYXNlbmFtZX0gJHtmaWxlRGlybmFtZX1gO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHJhbmdlXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmltcGxpY2l0RmlsZUNvbnRleHRXaXRoUmFuZ2UnLCBcIlN1Z2dlc3RlZCBjb250ZXh0LCB7MH0sIHsxfSwgbGluZSB7Mn0gdG8gbGluZSB7M31cIiwgYXR0YWNobWVudFR5cGVOYW1lLCBmcmllbmRseU5hbWUsIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQuaW1wbGljaXRGaWxlQ29udGV4dCcsIFwiU3VnZ2VzdGVkIGNvbnRleHQsIHswfSwgezF9XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSwgZnJpZW5kbHlOYW1lKTtcblxuXHRcdGNvbnN0IHVyaUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZmlsZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBjdXJyZW50RmlsZSA9IGxvY2FsaXplKCdvcGVuRWRpdG9yJywgXCJDdXJyZW50IHswfSBjb250ZXh0XCIsIGF0dGFjaG1lbnRUeXBlTmFtZSk7XG5cdFx0Y29uc3QgaW5hY3RpdmUgPSBsb2NhbGl6ZSgnZW5hYmxlSGludCcsIFwiRW5hYmxlIGN1cnJlbnQgezB9IGNvbnRleHRcIiwgYXR0YWNobWVudFR5cGVOYW1lKTtcblx0XHRjb25zdCBjdXJyZW50RmlsZUhpbnQgPSBlbmFibGVkIHx8IGlzU2VsZWN0aW9uID8gY3VycmVudEZpbGUgOiBpbmFjdGl2ZTtcblx0XHRjb25zdCB0aXRsZSA9IGAke2N1cnJlbnRGaWxlSGludH1cXG4ke3VyaUxhYmVsfWA7XG5cblx0XHRsYWJlbC5zZXRGaWxlKGZpbGUsIHtcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0aGlkZVBhdGg6IHRydWUsXG5cdFx0XHRyYW5nZSxcblx0XHRcdHRpdGxlXG5cdFx0fSk7XG5cdFx0Y29udGV4dE5vZGUuYXJpYUxhYmVsID0gYXJpYUxhYmVsO1xuXG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJCcm93c2VyUmVzb3VyY2UoYnJvd3NlclVyaTogVVJJLCBsYWJlbDogSVJlc291cmNlTGFiZWwsIGNvbnRleHROb2RlOiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaWQgPSBCcm93c2VyVmlld1VyaS5nZXRJZChicm93c2VyVXJpKTtcblx0XHRjb25zdCBpbnB1dCA9IGlkICYmIHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLmdldEtub3duQnJvd3NlclZpZXdzKCkuZ2V0KGlkKTtcblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdGxhYmVsLnNldExhYmVsKGlucHV0LmdldE5hbWUoKSwgdW5kZWZpbmVkLCB7IGljb25QYXRoOiBDb2RpY29uLmdsb2JlIH0pO1xuXHRcdFx0Y29udGV4dE5vZGUuYXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuaW1wbGljaXRCcm93c2VyQ29udGV4dCcsIFwiU3VnZ2VzdGVkIGJyb3dzZXIgY29udGV4dCwgezB9XCIsIGlucHV0LmdldE5hbWUoKSk7XG5cdFx0fTtcblx0XHR1cGRhdGUoKTtcblxuXHRcdC8vIEtlZXAgbGFiZWwgaW4gc3luYyBhcyB0aGUgdXNlciBuYXZpZ2F0ZXNcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZENoYW5nZUxhYmVsKCgpID0+IHVwZGF0ZSgpKSk7XG5cblx0XHRyZXR1cm4gaW5wdXQuZ2V0VGl0bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29udmVydFRvUmVndWxhckF0dGFjaG1lbnQoYXR0YWNobWVudDogQ2hhdEltcGxpY2l0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYXR0YWNobWVudC52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZShhdHRhY2htZW50LnZhbHVlKSkge1xuXHRcdFx0aWYgKGF0dGFjaG1lbnQudmFsdWUudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRDb250ZXh0U2VydmljZS5yZXNvbHZlQ2hhdENvbnRleHQoYXR0YWNobWVudC52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0XHRraW5kOiAnc3RyaW5nJyxcblx0XHRcdFx0dmFsdWU6IGF0dGFjaG1lbnQudmFsdWUudmFsdWUsXG5cdFx0XHRcdGlkOiBhdHRhY2htZW50LmlkLFxuXHRcdFx0XHRuYW1lOiBhdHRhY2htZW50Lm5hbWUsXG5cdFx0XHRcdGljb25QYXRoOiBhdHRhY2htZW50LnZhbHVlLmljb25QYXRoLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBhdHRhY2htZW50Lm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdHVyaTogYXR0YWNobWVudC52YWx1ZS51cmksXG5cdFx0XHRcdHJlc291cmNlVXJpOiBhdHRhY2htZW50LnZhbHVlLnJlc291cmNlVXJpLFxuXHRcdFx0XHR0b29sdGlwOiBhdHRhY2htZW50LnZhbHVlLnRvb2x0aXAsXG5cdFx0XHRcdGNvbW1hbmRJZDogYXR0YWNobWVudC52YWx1ZS5jb21tYW5kSWQsXG5cdFx0XHRcdGhhbmRsZTogYXR0YWNobWVudC52YWx1ZS5oYW5kbGVcblx0XHRcdH07XG5cdFx0XHR0aGlzLmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGNvbnRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmaWxlID0gVVJJLmlzVXJpKGF0dGFjaG1lbnQudmFsdWUpID8gYXR0YWNobWVudC52YWx1ZSA6IGF0dGFjaG1lbnQudmFsdWUudXJpO1xuXHRcdFx0aWYgKGZpbGUuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCAmJiBpc0xvY2F0aW9uKGF0dGFjaG1lbnQudmFsdWUpKSB7XG5cdFx0XHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUoZmlsZSwgYXR0YWNobWVudC52YWx1ZS5yYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmF0dGFjaG1lbnRNb2RlbC5hZGRGaWxlKGZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLndpZGdldFJlZigpPy5mb2N1c0lucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBpblNlbGVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgdGhpcy5hdHRhY2htZW50LnZhbHVlcykge1xuXHRcdFx0aWYgKCFhdHRhY2htZW50LnZhbHVlIHx8ICFhdHRhY2htZW50LmlzU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIVVSSS5pc1VyaShhdHRhY2htZW50LnZhbHVlKSAmJiAhaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZShhdHRhY2htZW50LnZhbHVlKSkge1xuXHRcdFx0XHRjb25zdCBsb2NhdGlvbiA9IGF0dGFjaG1lbnQudmFsdWU7XG5cdFx0XHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUobG9jYXRpb24udXJpLCBsb2NhdGlvbi5yYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMud2lkZ2V0UmVmKCk/LmZvY3VzSW5wdXQoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0JBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBK0QsOEJBQThCLDhCQUE4QjtBQUMzSCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGNBQWM7QUFHdkIsU0FBUywyQkFBMkI7QUFHcEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsSUFBTSxrQ0FBTixjQUE4QyxXQUFXO0FBQUEsRUFLL0QsWUFDa0IsV0FDQSw2QkFDQSxZQUNBLGdCQUNBLGlCQUNBLFNBQ29CLG1CQUNDLG9CQUNOLGNBQ0QsYUFDQSxhQUNJLGlCQUNILGNBQ0EsY0FDUSxlQUNGLG9CQUNTLG9CQUNmLGNBQy9CO0FBQ0QsVUFBTTtBQW5CVztBQUNBO0FBQ0E7QUFDQTtBQUNB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
