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
import { $ } from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { StandardMouseEvent } from "../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { HoverStyle } from "../../../../../base/browser/ui/hover/hover.js";
import { createInstantHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import * as event from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/path.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { fillInSymbolsDragData } from "../../../../../platform/dnd/browser/dnd.js";
import { registerOpenEditorListeners } from "../../../../../platform/editor/browser/editor.js";
import { FileKind, IFileService } from "../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { FolderThemeIcon, IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { fillEditorsDragData } from "../../../../browser/dnd.js";
import { StaticResourceContextKey } from "../../../../common/contextkeys.js";
import { IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { revealInSideBarCommand } from "../../../files/browser/fileActions.contribution.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { toHistoryItemHoverContent } from "../../../scm/browser/scmHistory.js";
import { getHistoryItemEditorTitle } from "../../../scm/browser/util.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from "../../../browserView/common/browserView.js";
import { buildOpenSessionLinkForChatResource } from "../../../../../platform/agentHost/common/openSessionLink.js";
import { coerceImageBuffer } from "../../common/chatImageExtraction.js";
import { ChatConfiguration } from "../../common/constants.js";
import { getImageAttachmentLimit, OmittedState, PromptFileVariableKind, isStringVariableEntry, resolveChatContextIcon } from "../../common/attachments/chatVariableEntries.js";
import { ILanguageModelsService, isAutoLanguageModel } from "../../common/languageModels.js";
import { ILanguageModelToolsService, isToolSet } from "../../common/tools/languageModelToolsService.js";
import { getCleanPromptName } from "../../common/promptSyntax/config/promptFileLocations.js";
import { IChatContextService } from "../contextContrib/chatContextService.js";
import { IChatImageCarouselService } from "../chatImageCarouselService.js";
import { CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE, getOrCreateImageThumbnail } from "../chatImageUtils.js";
const commonHoverOptions = {
  style: HoverStyle.Pointer,
  position: {
    hoverPosition: HoverPosition.BELOW
  },
  trapFocus: true
};
const commonHoverLifecycleOptions = {
  groupId: "chat-attachments"
};
const KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES = [
  "display",
  "position",
  "margin",
  "padding",
  "font-size",
  "font-family",
  "color",
  "background-color"
];
let AbstractChatAttachmentWidget = class extends Disposable {
  constructor(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService) {
    super();
    this.attachment = attachment;
    this.options = options;
    this.currentLanguageModel = currentLanguageModel;
    this.commandService = commandService;
    this.openerService = openerService;
    this.configurationService = configurationService;
    this.terminalService = terminalService;
    this._onDidDelete = this._register(new event.Emitter());
    this._onDidOpen = this._register(new event.Emitter());
    this._hasClearButton = false;
    this.element = dom.append(container, $(".chat-attached-context-attachment.show-file-icons"));
    this.attachClearButton();
    this.label = contextResourceLabels.create(this.element, { supportIcons: true, hoverTargetOverride: this.element });
    this._register(this.label);
    this.element.tabIndex = 0;
    this.element.role = "button";
    this._register(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e) => {
      if (e.button === 1 && this.options.supportsDeletion && !this.attachment.range) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidDelete.fire(e);
      }
    }));
  }
  get onDidDelete() {
    return this._onDidDelete.event;
  }
  get onDidOpen() {
    return this._onDidOpen.event;
  }
  modelSupportsVision() {
    return modelSupportsVision(this.currentLanguageModel);
  }
  appendDeletionHint(ariaLabel) {
    if (!this._hasClearButton) {
      return ariaLabel;
    }
    return localize("chat.attachment.withDeleteHint", "{0} (Delete)", ariaLabel);
  }
  attachClearButton() {
    if (this.attachment.range || !this.options.supportsDeletion) {
      return;
    }
    this._hasClearButton = true;
    const clearButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.clearButton", "Remove from context")
    });
    clearButton.element.tabIndex = -1;
    clearButton.icon = Codicon.close;
    this._register(clearButton);
    this._register(event.Event.once(clearButton.onDidClick)((e) => {
      this._onDidDelete.fire(e);
    }));
    this._register(dom.addStandardDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      if (e.keyCode === KeyCode.Backspace || e.keyCode === KeyCode.Delete) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidDelete.fire(e.browserEvent);
      }
    }));
  }
  addResourceOpenHandlers(resource, range) {
    this.element.style.cursor = "pointer";
    this._register(registerOpenEditorListeners(this.element, async (options) => {
      if (this.attachment.kind === "directory") {
        await this.openResource(resource, options, true);
      } else {
        await this.openResource(resource, options, false, range);
      }
    }));
  }
  async openResource(resource, openOptions, isDirectory, range) {
    if (isDirectory) {
      this.commandService.executeCommand(revealInSideBarCommand.id, resource);
      return;
    }
    if (resource.scheme === Schemas.vscodeTerminal) {
      this.terminalService?.openResource(resource);
      return;
    }
    const openTextEditorOptions = range ? { selection: range } : void 0;
    const options = {
      fromUserGesture: true,
      openToSide: openOptions.openToSide,
      editorOptions: {
        ...openTextEditorOptions,
        ...openOptions.editorOptions
      }
    };
    await this.openerService.open(resource, options);
    this._onDidOpen.fire();
    this.element.focus();
  }
};
AbstractChatAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ITerminalService)
], AbstractChatAttachmentWidget);
function modelSupportsVision(currentLanguageModel) {
  return isAutoLanguageModel(currentLanguageModel) || (currentLanguageModel?.metadata.capabilities?.vision ?? false);
}
function getEffectiveImageOmittedState(omittedState, currentLanguageModel, isCurrentInput) {
  return isAutoLanguageModel(currentLanguageModel) && isCurrentInput && omittedState === OmittedState.Full ? OmittedState.NotOmitted : omittedState;
}
let FileAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, themeService, hoverService, languageModelsService, instantiationService, fileDialogService, fileService, notificationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.instantiationService = instantiationService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    const fileBasename = basename(resource.path);
    const fileDirname = dirname(resource.path);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    let ariaLabel = range ? localize("chat.fileAttachmentWithRange", "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize("chat.fileAttachment", "Attached file, {0}", friendlyName);
    if (attachment.omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedFileAttachment", "Omitted this file: {0}", attachment.name);
      this.renderOmittedWarning(friendlyName, ariaLabel);
    } else {
      const fileOptions = { hidePath: true, title: correspondingContentReference?.options?.status?.description };
      this.label.setFile(resource, attachment.kind === "file" ? {
        ...fileOptions,
        fileKind: FileKind.FILE,
        range
      } : {
        ...fileOptions,
        fileKind: FileKind.FOLDER,
        icon: !this.themeService.getFileIconTheme().hasFolderIcons ? FolderThemeIcon : void 0
      });
      if (attachment.kind === "directory" && typeof attachment.imageCount === "number") {
        const maxImagesPerRequest = getImageAttachmentLimit(currentLanguageModel?.metadata);
        if (maxImagesPerRequest !== void 0 && attachment.imageCount > maxImagesPerRequest) {
          this.renderFolderImageLimitWarning(attachment.imageCount, maxImagesPerRequest);
        }
      }
    }
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    if (attachment.kind === "file") {
      this.attachSaveButton(resource, fileBasename, options.supportsDeletion);
    }
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
    });
    this.addResourceOpenHandlers(resource, range);
  }
  attachSaveButton(resource, name, supportsDeletion) {
    if (supportsDeletion) {
      return;
    }
    const saveButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.saveFileButton", "Save As...")
    });
    saveButton.element.classList.add("chat-attached-context-download-button");
    saveButton.element.tabIndex = -1;
    saveButton.icon = Codicon.cloudDownload;
    this.element.insertBefore(saveButton.element, this.label.element);
    this._register(saveButton);
    this._register(saveButton.onDidClick(async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultUri = joinPath(await this.fileDialogService.defaultFilePath(), name);
      const target = await this.fileDialogService.showSaveDialog({ defaultUri });
      if (!target) {
        return;
      }
      try {
        await this.fileService.copy(resource, target, true);
      } catch (error) {
        this.notificationService.error(localize("chat.attachment.saveFileError", "Failed to save file: {0}", error));
      }
    }));
  }
  renderOmittedWarning(friendlyName, ariaLabel) {
    const pillIcon = dom.$("div.chat-attached-context-pill", {}, dom.$("span.codicon.codicon-warning"));
    const textLabel = dom.$("span.chat-attached-context-custom-text", {}, friendlyName);
    this.element.appendChild(pillIcon);
    this.element.appendChild(textLabel);
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.setAttribute("aria-label", ariaLabel);
    this.element.classList.add("warning");
    hoverElement.textContent = localize("chat.fileAttachmentHover", "{0} does not support this file type.", this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name : this.currentLanguageModel ?? "This model");
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverElement
    }, commonHoverLifecycleOptions));
  }
  renderFolderImageLimitWarning(imageCount, limit) {
    this.element.classList.add("warning");
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.textContent = localize(
      "chat.folderImageLimitExceededHover",
      "This folder contains {0} images, which exceeds the maximum of {1} images per request. Older images will not be sent.",
      imageCount,
      limit
    );
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverElement
    }, commonHoverLifecycleOptions));
  }
};
FileAttachmentWidget = __decorateClass([
  __decorateParam(8, ICommandService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, ILanguageModelsService),
  __decorateParam(14, IInstantiationService),
  __decorateParam(15, IFileDialogService),
  __decorateParam(16, IFileService),
  __decorateParam(17, INotificationService)
], FileAttachmentWidget);
let TerminalCommandAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, terminalService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService, terminalService);
    this.hoverService = hoverService;
    this.terminalService = terminalService;
    const ariaLabel = localize("chat.terminalCommand", "Terminal command, {0}", attachment.command);
    const clickHandler = () => this.openResource(attachment.resource, { editorOptions: { preserveFocus: true } }, false, void 0);
    this._register(createTerminalCommandElements(this.element, attachment, ariaLabel, this.hoverService, clickHandler));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        await clickHandler();
      }
    }));
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
};
TerminalCommandAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, ITerminalService)
], TerminalCommandAttachmentWidget);
var TerminalConstants = /* @__PURE__ */ ((TerminalConstants2) => {
  TerminalConstants2[TerminalConstants2["MaxAttachmentOutputLineCount"] = 5] = "MaxAttachmentOutputLineCount";
  TerminalConstants2[TerminalConstants2["MaxAttachmentOutputLineLength"] = 80] = "MaxAttachmentOutputLineLength";
  return TerminalConstants2;
})(TerminalConstants || {});
function createTerminalCommandElements(element, attachment, ariaLabel, hoverService, clickHandler) {
  const disposable = new DisposableStore();
  element.ariaLabel = ariaLabel;
  element.style.cursor = "pointer";
  const terminalIconSpan = dom.$("span");
  terminalIconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.terminal));
  const pillIcon = dom.$("div.chat-attached-context-pill", {}, terminalIconSpan);
  const textLabel = dom.$("span.chat-attached-context-custom-text", {}, attachment.command);
  element.appendChild(pillIcon);
  element.appendChild(textLabel);
  disposable.add(dom.addDisposableListener(element, dom.EventType.CLICK, (e) => {
    e.preventDefault();
    e.stopPropagation();
    clickHandler();
  }));
  disposable.add(hoverService.setupDelayedHover(element, () => getHoverContent(ariaLabel, attachment), commonHoverLifecycleOptions));
  return disposable;
}
function getHoverContent(ariaLabel, attachment) {
  {
    const hoverElement = dom.$("div.chat-attached-context-hover");
    hoverElement.setAttribute("aria-label", ariaLabel);
    const commandTitle = dom.$("div", {}, typeof attachment.exitCode === "number" ? localize("chat.terminalCommandHoverCommandTitleExit", "Command: {0}, exit code: {1}", attachment.command, attachment.exitCode) : localize("chat.terminalCommandHoverCommandTitle", "Command"));
    commandTitle.classList.add("attachment-additional-info");
    const commandBlock = dom.$("pre.chat-terminal-command-block");
    hoverElement.append(commandTitle, commandBlock);
    if (attachment.output && attachment.output.trim().length > 0) {
      const outputTitle = dom.$("div", {}, localize("chat.terminalCommandHoverOutputTitle", "Output:"));
      outputTitle.classList.add("attachment-additional-info");
      const outputBlock = dom.$("pre.chat-terminal-command-output");
      const fullOutputLines = attachment.output.split("\n");
      const hoverOutputLines = [];
      for (const line of fullOutputLines) {
        if (hoverOutputLines.length >= 5 /* MaxAttachmentOutputLineCount */) {
          hoverOutputLines.push("...");
          break;
        }
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        if (trimmed.length > 80 /* MaxAttachmentOutputLineLength */) {
          hoverOutputLines.push(`${trimmed.slice(0, 80 /* MaxAttachmentOutputLineLength */)}...`);
        } else {
          hoverOutputLines.push(trimmed);
        }
      }
      outputBlock.textContent = hoverOutputLines.join("\n");
      hoverElement.append(outputTitle, outputBlock);
    }
    return {
      ...commonHoverOptions,
      content: hoverElement
    };
  }
}
let ImageAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, instantiationService, labelService, chatImageCarouselService, fileDialogService, fileService, notificationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.labelService = labelService;
    this.chatImageCarouselService = chatImageCarouselService;
    this.fileDialogService = fileDialogService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.element.classList.add("image-attachment");
    const isAutoModel = isAutoLanguageModel(currentLanguageModel);
    const modelName = currentLanguageModel?.metadata.name;
    const omittedState = getEffectiveImageOmittedState(attachment.omittedState, currentLanguageModel, options.isCurrentInput);
    this.element.classList.toggle("auto-image-warning", isAutoModel);
    let ariaLabel;
    if (omittedState === OmittedState.Full && modelName && !modelSupportsVision(currentLanguageModel)) {
      ariaLabel = localize("chat.unsupportedImageAttachment", "Image not sent because {0} does not support images: {1}", modelName, attachment.name);
    } else if (omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedImageAttachment", "Omitted this image: {0}", attachment.name);
    } else if (omittedState === OmittedState.Partial) {
      ariaLabel = localize("chat.partiallyOmittedImageAttachment", "Partially omitted this image: {0}", attachment.name);
    } else if (omittedState === OmittedState.ImageLimitExceeded) {
      ariaLabel = localize("chat.imageLimitExceededAttachment", "Image not sent due to limit: {0}", attachment.name);
    } else if (isAutoModel) {
      ariaLabel = localize("chat.autoImageAttachment", "Attached image, {0}. Image support depends on the model selected by Auto.", attachment.name);
    } else {
      ariaLabel = localize("chat.imageAttachment", "Attached image, {0}", attachment.name);
    }
    const ref = attachment.references?.[0]?.reference;
    resource = ref && URI.isUri(ref) ? ref : void 0;
    const imageData = coerceImageBuffer(attachment.value);
    const clickHandler = async () => {
      if ((resource || imageData) && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
        await this.openInCarousel(attachment.id, attachment.name, imageData, resource, options.isCurrentInput);
      } else if (resource) {
        await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, void 0);
      }
    };
    const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : "Current model";
    const fullName = resource ? this.labelService.getUriLabel(resource) : attachment.fullName || attachment.name;
    const imageElements = this._register(new MutableDisposable());
    const renderImageElements = (buffer) => {
      imageElements.value = createImageElements(resource, attachment.name, fullName, this.element, buffer, attachment.id, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, omittedState);
      this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    };
    renderImageElements(imageData ?? new Uint8Array());
    if (!imageData && resource && omittedState !== OmittedState.Full && omittedState !== OmittedState.ImageLimitExceeded) {
      void this.loadImageBytes(resource, renderImageElements);
    }
    this.attachSaveButton(resource, imageData, attachment.name, options.supportsDeletion);
    const canOpenCarousel = !!imageData && configurationService.getValue(ChatConfiguration.ImageCarouselEnabled);
    if (canOpenCarousel || resource) {
      this.element.style.cursor = "pointer";
      this._register(registerOpenEditorListeners(this.element, async () => {
        await clickHandler();
      }));
    }
    if (resource) {
      instantiationService.invokeFunction((accessor) => {
        this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
      });
    }
  }
  async loadImageBytes(resource, render) {
    let content;
    try {
      content = (await this.fileService.readFile(resource)).value;
    } catch {
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    render(content.buffer);
  }
  async openInCarousel(id, name, data, referenceUri, preferCurrentInput) {
    const resource = referenceUri ?? URI.from({ scheme: "data", path: `${id}/${encodeURIComponent(name)}` });
    await this.chatImageCarouselService.openCarouselAtResource(resource, data, { preferCurrentInput });
  }
  attachSaveButton(resource, imageData, name, supportsDeletion) {
    if (supportsDeletion || !resource && !imageData) {
      return;
    }
    const saveButton = new Button(this.element, {
      supportIcons: true,
      hoverDelegate: createInstantHoverDelegate(),
      title: localize("chat.attachment.saveImageButton", "Save Image As...")
    });
    saveButton.element.classList.add("chat-attached-context-download-button");
    saveButton.element.tabIndex = -1;
    saveButton.icon = Codicon.cloudDownload;
    this._register(saveButton);
    this._register(saveButton.onDidClick(async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultUri = joinPath(await this.fileDialogService.defaultFilePath(), name);
      const target = await this.fileDialogService.showSaveDialog({ defaultUri });
      if (!target) {
        return;
      }
      try {
        if (resource) {
          await this.fileService.copy(resource, target, true);
        } else if (imageData) {
          await this.fileService.writeFile(target, VSBuffer.wrap(imageData));
        }
      } catch (error) {
        this.notificationService.error(localize("chat.attachment.saveImageError", "Failed to save image: {0}", error));
      }
    }));
  }
};
ImageAttachmentWidget = __decorateClass([
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IChatImageCarouselService),
  __decorateParam(14, IFileDialogService),
  __decorateParam(15, IFileService),
  __decorateParam(16, INotificationService)
], ImageAttachmentWidget);
function createImageHoverContent(resource, fullName, buffer, cacheKey, onContentsChanged, clickHandler, onImageUrl, imageAlt = "") {
  const disposable = new DisposableStore();
  const hoverElement = dom.$("div.chat-attached-context-hover");
  const hoverImage = dom.$("img.chat-attached-context-image", { alt: imageAlt });
  const imageContainer = dom.$("div.chat-attached-context-image-container", {}, hoverImage);
  hoverElement.appendChild(imageContainer);
  if (clickHandler) {
    imageContainer.classList.add("clickable");
    imageContainer.tabIndex = 0;
    imageContainer.role = "button";
    imageContainer.ariaLabel = localize("chat.openImagePreview", "Open in Images Preview");
    disposable.add(registerOpenEditorListeners(imageContainer, async () => {
      await clickHandler();
    }));
  }
  if (resource) {
    const urlContainer = clickHandler ? dom.$("a.chat-attached-context-url", {}, fullName) : dom.$("div.chat-attached-context-url", {}, fullName);
    const separator = dom.$("div.chat-attached-context-url-separator");
    if (clickHandler) {
      disposable.add(dom.addDisposableListener(urlContainer, "click", clickHandler));
    }
    hoverElement.append(separator, urlContainer);
  }
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const previewImageUrl = disposable.add(new MutableDisposable());
  const renderPreviewImage = async () => {
    const thumbnail = await getOrCreateImageThumbnail(cacheKey, data, CHAT_IMAGE_HOVER_THUMBNAIL_MAX_SIZE);
    if (disposable.isDisposed) {
      return;
    }
    const source = thumbnail ?? new Blob([data]);
    const url = URL.createObjectURL(source);
    previewImageUrl.value = toDisposable(() => URL.revokeObjectURL(url));
    hoverImage.onload = () => onContentsChanged?.();
    hoverImage.src = url;
    onImageUrl?.(url, !!thumbnail, hoverImage);
  };
  void renderPreviewImage();
  return { element: hoverElement, disposable };
}
function createImageElements(resource, name, fullName, element, buffer, cacheKey, hoverService, ariaLabel, currentLanguageModelName, clickHandler, currentLanguageModel, omittedState) {
  const disposable = new DisposableStore();
  if (omittedState === OmittedState.Partial) {
    element.classList.add("partial-warning");
  }
  element.ariaLabel = ariaLabel;
  element.style.position = "relative";
  if (resource) {
    element.style.cursor = "pointer";
  }
  const supportsVision = modelSupportsVision(currentLanguageModel);
  const pillIcon = dom.$("div.chat-attached-context-pill", {}, dom.$(supportsVision ? "span.codicon.codicon-file-media" : "span.codicon.codicon-warning"));
  const textLabel = dom.$("span.chat-attached-context-custom-text", {}, name);
  element.appendChild(pillIcon);
  element.appendChild(textLabel);
  let currentPill = pillIcon;
  const replacePill = (pill) => {
    currentPill.replaceWith(pill);
    currentPill = pill;
  };
  const hoverElement = dom.$("div.chat-attached-context-hover");
  hoverElement.setAttribute("aria-label", ariaLabel);
  if (!supportsVision && currentLanguageModel || omittedState === OmittedState.Full) {
    element.classList.add("warning");
    hoverElement.textContent = localize("chat.imageAttachmentHover", "{0} does not support images.", currentLanguageModelName ?? "This model");
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement,
      style: HoverStyle.Pointer
    }));
  } else if (omittedState === OmittedState.ImageLimitExceeded) {
    element.classList.add("warning");
    const maxImagesPerRequest = getImageAttachmentLimit(currentLanguageModel?.metadata);
    hoverElement.textContent = maxImagesPerRequest !== void 0 ? localize("chat.imageLimitExceededHover", "This image was not sent because the maximum of {0} images per request was exceeded.", maxImagesPerRequest) : localize("chat.imageLimitExceededHoverUnknownLimit", "This image was not sent because this model's image limit was exceeded.");
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement,
      style: HoverStyle.Pointer
    }));
  } else {
    const onImageFailed = () => {
      const pillIcon2 = dom.$("div.chat-attached-context-pill", {}, dom.$("span.codicon.codicon-file-media"));
      replacePill(pillIcon2);
    };
    const hoverFullName = omittedState === OmittedState.Partial ? localize("chat.imageAttachmentWarning", "This GIF was partially omitted - current frame will be sent.") : fullName;
    const hoverContent = createImageHoverContent(resource, hoverFullName, buffer, cacheKey, void 0, resource ? clickHandler : void 0, (url, isThumbnail, hoverImage) => {
      if (isThumbnail) {
        const pillImg = dom.$("img.chat-attached-context-pill-image", { src: url, alt: "" });
        const pill = dom.$("div.chat-attached-context-pill", {}, pillImg);
        replacePill(pill);
      }
      hoverImage.onerror = onImageFailed;
    });
    disposable.add(hoverContent.disposable);
    const hoverElement2 = hoverContent.element;
    hoverElement2.setAttribute("aria-label", ariaLabel);
    disposable.add(hoverService.setupDelayedHover(element, {
      content: hoverElement2,
      style: HoverStyle.Pointer
    }));
    if (isAutoLanguageModel(currentLanguageModel)) {
      hoverElement2.appendChild(dom.$("div", void 0, localize("chat.autoImageAttachmentHover", "Image support depends on the model selected by Auto.")));
    }
  }
  disposable.add(toDisposable(() => {
    currentPill.remove();
    textLabel.remove();
  }));
  return disposable;
}
let PasteAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    const ariaLabel = localize("chat.attachment", "Attached context, {0}", attachment.name);
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    const classNames = ["file-icon", `${attachment.language}-lang-file-icon`];
    let resource;
    let range;
    if (attachment.copiedFrom) {
      resource = attachment.copiedFrom.uri;
      range = attachment.copiedFrom.range;
      const filename = basename(resource.path);
      this.label.setLabel(filename, void 0, { extraClasses: classNames });
    } else {
      this.label.setLabel(attachment.fileName, void 0, { extraClasses: classNames });
    }
    this.element.appendChild(dom.$("span.attachment-additional-info", {}, `Pasted ${attachment.pastedLines}`));
    this.element.style.position = "relative";
    const sourceUri = attachment.copiedFrom?.uri;
    const hoverContent = new MarkdownString(`${sourceUri ? this.instantiationService.invokeFunction((accessor) => accessor.get(ILabelService).getUriLabel(sourceUri, { relative: true })) : attachment.fileName}

---

\`\`\`${attachment.language}

${attachment.code}
\`\`\``);
    this._register(this.hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: hoverContent
    }, commonHoverLifecycleOptions));
    const copiedFromResource = attachment.copiedFrom?.uri;
    if (copiedFromResource) {
      this._register(this.instantiationService.invokeFunction(hookUpResourceAttachmentDragAndContextMenu, this.element, copiedFromResource));
      this.addResourceOpenHandlers(copiedFromResource, range);
    }
  }
};
PasteAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IInstantiationService)
], PasteAttachmentWidget);
let DefaultChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, range, attachment, correspondingContentReference, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, contextKeyService, instantiationService, hoverService, modelService, languageService, themeService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.hoverService = hoverService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.themeService = themeService;
    this._tooltipHover = this._register(new MutableDisposable());
    const attachmentLabel = attachment.fullName ?? attachment.name;
    const description = correspondingContentReference?.options?.status?.description;
    const iconPath = isStringVariableEntry(attachment) || attachment.kind === "generic" ? attachment.iconPath : void 0;
    this._applyLabel(attachment, attachmentLabel, description, iconPath);
    if (iconPath && !ThemeIcon.isThemeIcon(iconPath) && !URI.isUri(iconPath)) {
      this._register(this.themeService.onDidColorThemeChange(() => this._applyLabel(attachment, attachmentLabel, description, iconPath)));
    }
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    if (attachment.kind === "diagnostic") {
      if (attachment.filterUri) {
        resource = attachment.filterUri ? URI.revive(attachment.filterUri) : void 0;
        range = attachment.filterRange;
      } else {
        this.element.style.cursor = "pointer";
        this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
          this.commandService.executeCommand("workbench.panel.markers.view.focus");
        }));
      }
    }
    if (attachment.kind === "symbol") {
      this._register(this.instantiationService.invokeFunction(hookUpSymbolAttachmentDragAndContextMenu, this.element, this.contextKeyService, { ...attachment, kind: attachment.symbolKind }, MenuId.ChatInputSymbolAttachmentContext));
    }
    if (isStringVariableEntry(attachment) && attachment.commandId) {
      this.element.style.cursor = "pointer";
      const contextItemHandle = attachment.handle;
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async () => {
        const chatContextService = this.instantiationService.invokeFunction((accessor) => accessor.get(IChatContextService));
        await chatContextService.executeChatContextItemCommand(contextItemHandle);
      }));
    }
    if (attachment.kind === "debugEvents") {
      this.element.style.cursor = "pointer";
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, () => {
        const d = new Date(attachment.snapshotTime);
        const filter = `before:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
        this.commandService.executeCommand("workbench.action.chat.openAgentDebugPanelForSession", attachment.sessionResource, filter);
      }));
    }
    if ((isStringVariableEntry(attachment) || attachment.kind === "generic") && attachment.tooltip) {
      this._setupTooltipHover(attachment.tooltip);
    }
    if (resource) {
      this.addResourceOpenHandlers(resource, range);
    }
  }
  _applyLabel(attachment, attachmentLabel, description, iconPath) {
    if (isStringVariableEntry(attachment) && iconPath && ThemeIcon.isThemeIcon(iconPath) && (ThemeIcon.isFile(iconPath) || ThemeIcon.isFolder(iconPath)) && attachment.resourceUri) {
      const fileKind = ThemeIcon.isFolder(iconPath) ? FileKind.FOLDER : FileKind.FILE;
      const iconClasses = getIconClasses(this.modelService, this.languageService, attachment.resourceUri, fileKind);
      this.label.setLabel(attachmentLabel, description, { extraClasses: iconClasses });
    } else if (iconPath) {
      const resolvedIcon = resolveChatContextIcon(iconPath, isDark(this.themeService.getColorTheme().type));
      this.label.setLabel(attachmentLabel, description, { iconPath: resolvedIcon });
    } else {
      const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
      this.label.setLabel(withIcon, description);
    }
  }
  _setupTooltipHover(tooltip) {
    this._tooltipHover.value = this.hoverService.setupDelayedHover(this.element, {
      content: tooltip,
      appearance: { showPointer: true }
    });
  }
};
DefaultChatAttachmentWidget = __decorateClass([
  __decorateParam(8, ICommandService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IModelService),
  __decorateParam(15, ILanguageService),
  __decorateParam(16, IThemeService)
], DefaultChatAttachmentWidget);
let PromptFileAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, labelService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.hintElement = dom.append(this.element, dom.$("span.prompt-type"));
    this.updateLabel(attachment);
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, attachment.value));
    });
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  updateLabel(attachment) {
    const resource = attachment.value;
    const fileBasename = basename(resource.path);
    const fileDirname = dirname(resource.path);
    const friendlyName = `${fileBasename} ${fileDirname}`;
    const isPrompt = attachment.id.startsWith(PromptFileVariableKind.PromptFile);
    const ariaLabel = isPrompt ? localize("chat.promptAttachment", "Prompt file, {0}", friendlyName) : localize("chat.instructionsAttachment", "Instructions attachment, {0}", friendlyName);
    const typeLabel = isPrompt ? localize("prompt", "Prompt") : localize("instructions", "Instructions");
    const title = this.labelService.getUriLabel(resource) + (attachment.originLabel ? `
${attachment.originLabel}` : "");
    this.element.classList.remove("warning", "error");
    const fileWithoutExtension = getCleanPromptName(resource);
    this.label.setFile(URI.file(fileWithoutExtension), {
      fileKind: FileKind.FILE,
      hidePath: true,
      range: void 0,
      title,
      icon: ThemeIcon.fromId(Codicon.bookmark.id),
      extraClasses: []
    });
    this.hintElement.innerText = typeLabel;
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
};
PromptFileAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IInstantiationService)
], PromptFileAttachmentWidget);
let PromptTextAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, preferencesService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    if (attachment.settingId) {
      const openSettings = () => preferencesService.openSettings({ jsonEditor: false, query: `@id:${attachment.settingId}` });
      this.element.style.cursor = "pointer";
      this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, async (e) => {
        dom.EventHelper.stop(e, true);
        openSettings();
      }));
      this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, async (e) => {
        const event2 = new StandardKeyboardEvent(e);
        if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
          dom.EventHelper.stop(e, true);
          openSettings();
        }
      }));
    }
    this.label.setLabel(localize("instructions.label", "Additional Instructions"), void 0, void 0);
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    this._register(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: attachment.value
    }, commonHoverLifecycleOptions));
  }
};
PromptTextAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IPreferencesService),
  __decorateParam(9, IHoverService)
], PromptTextAttachmentWidget);
let ToolSetOrToolItemAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, toolsService, commandService, openerService, configurationService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    const toolOrToolSet = Iterable.find(toolsService.getTools(currentLanguageModel?.metadata), (tool) => tool.id === attachment.id) ?? Iterable.find(toolsService.getToolSetsForModel(currentLanguageModel?.metadata), (toolSet) => toolSet.id === attachment.id);
    let name = attachment.name;
    const icon = attachment.icon ?? Codicon.tools;
    if (isToolSet(toolOrToolSet)) {
      name = toolOrToolSet.referenceName;
    } else if (toolOrToolSet) {
      name = toolOrToolSet.toolReferenceName ?? name;
    }
    this.label.setLabel(`$(${icon.id})\xA0${name}`, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", name));
    let hoverContent;
    if (isToolSet(toolOrToolSet)) {
      hoverContent = localize("toolset", "{0} - {1}", toolOrToolSet.description ?? toolOrToolSet.referenceName, toolOrToolSet.source.label);
    } else if (toolOrToolSet) {
      hoverContent = localize("tool", "{0} - {1}", toolOrToolSet.userDescription ?? toolOrToolSet.modelDescription, toolOrToolSet.source.label);
    }
    if (hoverContent) {
      this._register(hoverService.setupDelayedHover(this.element, {
        ...commonHoverOptions,
        content: hoverContent
      }, commonHoverLifecycleOptions));
    }
  }
};
ToolSetOrToolItemAttachmentWidget = __decorateClass([
  __decorateParam(5, ILanguageModelToolsService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService)
], ToolSetOrToolItemAttachmentWidget);
let ChatReferenceAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    const title = attachment.name;
    const chatResource = attachment.value;
    this.label.setLabel(`$(${Codicon.commentDiscussion.id})\xA0${title}`, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment.chatReference", "Link to chat {0}", title));
    this._register(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content: localize("chat.attachment.chatReference.hover", 'Open chat "{0}"', title)
    }, commonHoverLifecycleOptions));
    this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._openReferencedChat(chatResource);
    }));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._openReferencedChat(chatResource);
      }
    }));
  }
  async _openReferencedChat(chatResource) {
    const link = buildOpenSessionLinkForChatResource(chatResource);
    if (!link) {
      return;
    }
    await this.openerService.open(link);
  }
};
ChatReferenceAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IHoverService)
], ChatReferenceAttachmentWidget);
let NotebookCellOutputChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(resource, attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, hoverService, languageModelsService, notebookService, instantiationService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.hoverService = hoverService;
    this.languageModelsService = languageModelsService;
    this.notebookService = notebookService;
    this.instantiationService = instantiationService;
    switch (attachment.mimeType) {
      case "application/vnd.code.notebook.error": {
        this.renderErrorOutput(resource, attachment);
        break;
      }
      case "image/png":
      case "image/jpeg":
      case "image/svg": {
        this.renderImageOutput(resource, attachment);
        break;
      }
      default: {
        this.renderGenericOutput(resource, attachment);
      }
    }
    this.instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, resource));
    });
    this.addResourceOpenHandlers(resource, void 0);
  }
  getAriaLabel(attachment) {
    return localize("chat.NotebookImageAttachment", "Attached Notebook output, {0}", attachment.name);
  }
  renderErrorOutput(resource, attachment) {
    const attachmentLabel = attachment.name;
    const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
    const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
    let title = void 0;
    try {
      const error = JSON.parse(new TextDecoder().decode(buffer));
      if (error.name && error.message) {
        title = `${error.name}: ${error.message}`;
      }
    } catch {
    }
    this.label.setLabel(withIcon, void 0, { title });
    this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
  }
  renderGenericOutput(resource, attachment) {
    this.element.ariaLabel = this.appendDeletionHint(this.getAriaLabel(attachment));
    this.label.setFile(resource, { hidePath: true, icon: ThemeIcon.fromId("output") });
  }
  renderImageOutput(resource, attachment) {
    let ariaLabel;
    if (attachment.omittedState === OmittedState.Full) {
      ariaLabel = localize("chat.omittedNotebookImageAttachment", "Omitted this Notebook ouput: {0}", attachment.name);
    } else if (attachment.omittedState === OmittedState.Partial) {
      ariaLabel = localize("chat.partiallyOmittedNotebookImageAttachment", "Partially omitted this Notebook output: {0}", attachment.name);
    } else {
      ariaLabel = this.getAriaLabel(attachment);
    }
    const clickHandler = async () => await this.openResource(resource, { editorOptions: { preserveFocus: true } }, false, void 0);
    const currentLanguageModelName = this.currentLanguageModel ? this.languageModelsService.lookupLanguageModel(this.currentLanguageModel.identifier)?.name ?? this.currentLanguageModel.identifier : void 0;
    const buffer = this.getOutputItem(resource, attachment)?.data.buffer ?? new Uint8Array();
    this._register(createImageElements(resource, attachment.name, attachment.name, this.element, buffer, attachment.id, this.hoverService, ariaLabel, currentLanguageModelName, clickHandler, this.currentLanguageModel, attachment.omittedState));
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
  }
  getOutputItem(resource, attachment) {
    const parsedInfo = CellUri.parseCellOutputUri(resource);
    if (!parsedInfo || typeof parsedInfo.cellHandle !== "number" || typeof parsedInfo.outputIndex !== "number") {
      return void 0;
    }
    const notebook = this.notebookService.getNotebookTextModel(parsedInfo.notebook);
    if (!notebook) {
      return void 0;
    }
    const cell = notebook.cells.find((c) => c.handle === parsedInfo.cellHandle);
    if (!cell) {
      return void 0;
    }
    const output = cell.outputs.length > parsedInfo.outputIndex ? cell.outputs[parsedInfo.outputIndex] : void 0;
    return output?.outputs.find((o) => o.mime === attachment.mimeType);
  }
};
NotebookCellOutputChatAttachmentWidget = __decorateClass([
  __decorateParam(6, ICommandService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, INotebookService),
  __decorateParam(12, IInstantiationService)
], NotebookCellOutputChatAttachmentWidget);
let ElementChatAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService, hoverService, fileService, logService, markdownRendererService, chatImageCarouselService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    this.hoverService = hoverService;
    this.fileService = fileService;
    this.logService = logService;
    this.markdownRendererService = markdownRendererService;
    this.chatImageCarouselService = chatImageCarouselService;
    const ariaLabel = localize("chat.elementAttachment", "Attached element, {0}", attachment.name);
    this.element.ariaLabel = this.appendDeletionHint(ariaLabel);
    this.element.style.position = "relative";
    this.element.style.cursor = "pointer";
    const attachmentLabel = attachment.name;
    const withIcon = attachment.icon?.id ? `$(${attachment.icon.id})\xA0${attachmentLabel}` : attachmentLabel;
    this.label.setLabel(withIcon);
    this._register(this.hoverService.setupDelayedHover(this.element, this.getHoverContent(attachment), commonHoverLifecycleOptions));
    this._register(registerOpenEditorListeners(this.element, async () => {
      await this.openElementAttachment(attachment);
    }));
  }
  getHoverContent(attachment) {
    if (!this.shouldRenderRichElementHover(attachment)) {
      return this.getSimpleHoverContent(attachment);
    }
    const hoverElement = dom.$("div.chat-attached-context-hover.chat-element-hover");
    const scrollableContent = dom.$("div.chat-element-hover-content");
    const innerScrollables = [];
    if (attachment.imageData) {
      this.appendImagePreview(attachment, scrollableContent, () => scrollableElement.scanDomNode());
    }
    {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.element", "ELEMENT"));
      section.appendChild(header);
      const elementPre = dom.$("pre.chat-element-hover-code");
      const elementCode = dom.$("code");
      const tagDisplay = this.formatElementTag(attachment);
      elementCode.textContent = tagDisplay;
      elementPre.appendChild(elementCode);
      const elementScrollable = this._register(new DomScrollableElement(elementPre, {
        horizontal: ScrollbarVisibility.Auto,
        vertical: ScrollbarVisibility.Hidden
      }));
      innerScrollables.push(elementScrollable);
      section.appendChild(elementScrollable.getDomNode());
      scrollableContent.appendChild(section);
    }
    const computedStyleEntries = this.getComputedStyleEntriesForHover(attachment.computedStyles);
    if (computedStyleEntries.length > 0) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.computedStyles", "KEY COMPUTED STYLES"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      for (const [name, value] of computedStyleEntries) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, `${name}:`));
        const valueContainer = dom.$("span.chat-element-hover-value");
        if ((name === "color" || name === "background-color") && value) {
          const swatch = dom.$("span.chat-element-hover-color-swatch");
          swatch.style.backgroundColor = value;
          valueContainer.appendChild(swatch);
        }
        valueContainer.appendChild(document.createTextNode(value));
        row.appendChild(valueContainer);
        table.appendChild(row);
      }
      section.appendChild(table);
      const showMoreButton = dom.$("button.chat-element-hover-show-more", { type: "button" }, localize("chat.elementHover.showMore", "Show More..."));
      this._register(dom.addDisposableListener(showMoreButton, dom.EventType.CLICK, async (e) => {
        dom.EventHelper.stop(e, true);
        await this.openElementAttachment(attachment);
      }));
      section.appendChild(showMoreButton);
      scrollableContent.appendChild(section);
    }
    if (attachment.ancestors && attachment.ancestors.length > 1) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.htmlPath", "HTML PATH"));
      section.appendChild(header);
      const lines = [];
      for (let i = 0; i < attachment.ancestors.length; i++) {
        const ancestor = attachment.ancestors[i];
        const indent = "  ".repeat(i);
        const tag = this.formatAncestorTag(ancestor);
        lines.push(`${indent}${tag}`);
      }
      const pathPre = dom.$("pre.chat-element-hover-code");
      const pathCode = dom.$("code");
      pathCode.textContent = lines.join("\n");
      pathPre.appendChild(pathCode);
      const pathScrollable = this._register(new DomScrollableElement(pathPre, {
        horizontal: ScrollbarVisibility.Auto,
        vertical: ScrollbarVisibility.Hidden
      }));
      innerScrollables.push(pathScrollable);
      section.appendChild(pathScrollable.getDomNode());
      scrollableContent.appendChild(section);
    }
    if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.attributes", "ATTRIBUTES"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      for (const [name, value] of Object.entries(attachment.attributes)) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, `${name}:`));
        row.appendChild(dom.$("span.chat-element-hover-value", {}, value));
        table.appendChild(row);
      }
      section.appendChild(table);
      scrollableContent.appendChild(section);
    }
    if (attachment.dimensions) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.positionSize", "POSITION & SIZE"));
      section.appendChild(header);
      const table = dom.$("div.chat-element-hover-table");
      const dims = [
        ["top:", attachment.dimensions.top],
        ["left:", attachment.dimensions.left],
        ["width:", attachment.dimensions.width],
        ["height:", attachment.dimensions.height]
      ];
      for (const [label, val] of dims) {
        const row = dom.$("div.chat-element-hover-row");
        row.appendChild(dom.$("span.chat-element-hover-label", {}, label));
        row.appendChild(dom.$("span.chat-element-hover-value", {}, `${Math.round(val)}px`));
        table.appendChild(row);
      }
      section.appendChild(table);
      scrollableContent.appendChild(section);
    }
    if (attachment.innerText) {
      const section = dom.$("div.chat-element-hover-section");
      const header = dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.innerText", "INNER TEXT"));
      section.appendChild(header);
      section.appendChild(dom.$("div.chat-element-hover-text", {}, attachment.innerText));
      scrollableContent.appendChild(section);
    }
    const scrollableElement = this._register(new DomScrollableElement(scrollableContent, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    const scrollableDomNode = scrollableElement.getDomNode();
    scrollableDomNode.classList.add("chat-element-hover-scrollable");
    hoverElement.appendChild(scrollableDomNode);
    return {
      ...commonHoverOptions,
      content: hoverElement,
      additionalClasses: ["chat-element-data-hover"],
      onDidShow: () => {
        for (const s of innerScrollables) {
          s.scanDomNode();
        }
        scrollableElement.scanDomNode();
      }
    };
  }
  shouldRenderRichElementHover(attachment) {
    if (attachment.dimensions || attachment.innerText) {
      return true;
    }
    if (attachment.ancestors && attachment.ancestors.length > 0) {
      return true;
    }
    if (attachment.attributes && Object.keys(attachment.attributes).length > 0) {
      return true;
    }
    if (attachment.computedStyles && Object.keys(attachment.computedStyles).length > 0) {
      return true;
    }
    return false;
  }
  appendImagePreview(attachment, container, onContentsChanged) {
    const section = dom.$("div.chat-element-hover-section.chat-element-hover-screenshot");
    section.appendChild(dom.$("div.chat-element-hover-header", {}, localize("chat.elementHover.screenshot", "SCREENSHOT")));
    container.appendChild(section);
    const previewDisposables = this._register(new DisposableStore());
    const appendPreview = (data) => {
      if (previewDisposables.isDisposed) {
        return;
      }
      const resource = URI.isUri(attachment.imageData) ? attachment.imageData : URI.from({ scheme: Schemas.data, path: `${attachment.id}/${encodeURIComponent(attachment.name)}` });
      const clickHandler = this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled) ? async () => this.chatImageCarouselService.openCarouselAtResource(resource, data) : void 0;
      const preview = createImageHoverContent(
        void 0,
        attachment.name,
        data,
        `${attachment.id}:screenshot`,
        onContentsChanged,
        clickHandler,
        void 0,
        localize("chat.elementHover.screenshotAlt", "Screenshot of attached element {0}", attachment.name)
      );
      previewDisposables.add(preview.disposable);
      section.appendChild(preview.element);
    };
    const inlineData = coerceImageBuffer(attachment.imageData);
    if (inlineData) {
      appendPreview(inlineData);
    } else if (URI.isUri(attachment.imageData)) {
      void this.fileService.readFile(attachment.imageData).then(
        (content) => appendPreview(content.value.buffer),
        (error) => {
          this.logService.warn(`[ElementChatAttachmentWidget] Failed to read screenshot '${attachment.imageData}': ${toErrorMessage(error)}`);
          section.remove();
          onContentsChanged();
        }
      );
    }
  }
  getSimpleHoverContent(attachment) {
    const content = attachment.value?.toString() ?? "";
    const hoverContent = new MarkdownString();
    hoverContent.appendText(attachment.fullName ?? attachment.name);
    if (content.trim().length > 0) {
      hoverContent.appendMarkdown("\n\n");
      hoverContent.appendCodeblock("text", content);
    }
    if (attachment.imageData) {
      const hoverElement = dom.$("div.chat-attached-context-hover.chat-element-hover");
      const scrollableContent = dom.$("div.chat-element-hover-content");
      this.appendImagePreview(attachment, scrollableContent, () => scrollableElement.scanDomNode());
      const markdownSection = dom.$("div.chat-element-hover-section");
      const renderedMarkdown = this._register(this.markdownRendererService.render(hoverContent));
      markdownSection.appendChild(renderedMarkdown.element);
      scrollableContent.appendChild(markdownSection);
      const scrollableElement = this._register(new DomScrollableElement(scrollableContent, {
        vertical: ScrollbarVisibility.Auto,
        horizontal: ScrollbarVisibility.Hidden,
        consumeMouseWheelIfScrollbarIsNeeded: true
      }));
      const scrollableDomNode = scrollableElement.getDomNode();
      scrollableDomNode.classList.add("chat-element-hover-scrollable");
      hoverElement.appendChild(scrollableDomNode);
      return {
        ...commonHoverOptions,
        content: hoverElement,
        additionalClasses: ["chat-element-data-hover"],
        onDidShow: () => scrollableElement.scanDomNode()
      };
    }
    return {
      ...commonHoverOptions,
      content: hoverContent
    };
  }
  getComputedStyleEntriesForHover(computedStyles) {
    if (!computedStyles) {
      return [];
    }
    const keyEntries = [];
    for (const property of KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES) {
      if (property === "margin" || property === "padding") {
        const shorthand = this.getBoxShorthandValue(computedStyles, property);
        if (typeof shorthand === "string") {
          keyEntries.push([property, shorthand]);
          continue;
        }
      }
      const value = computedStyles[property];
      if (typeof value === "string") {
        keyEntries.push([property, value]);
      }
    }
    if (keyEntries.length > 0) {
      return keyEntries;
    }
    return Object.entries(computedStyles).slice(0, KEY_ELEMENT_HOVER_COMPUTED_STYLE_PROPERTIES.length);
  }
  getBoxShorthandValue(computedStyles, propertyName) {
    const top = computedStyles[`${propertyName}-top`];
    const right = computedStyles[`${propertyName}-right`];
    const bottom = computedStyles[`${propertyName}-bottom`];
    const left = computedStyles[`${propertyName}-left`];
    if (typeof top === "string" && typeof right === "string" && typeof bottom === "string" && typeof left === "string") {
      return `${top} ${right} ${bottom} ${left}`;
    }
    return computedStyles[propertyName];
  }
  async openElementAttachment(attachment) {
    const content = attachment.value?.toString() || "";
    await this.editorService.openEditor({
      resource: void 0,
      contents: content,
      options: {
        pinned: true
      }
    });
  }
  formatElementTag(attachment) {
    const content = attachment.value?.toString() ?? "";
    const htmlMatch = content.match(/\n\n(<[^>]+>)/);
    if (htmlMatch) {
      return htmlMatch[1];
    }
    const fallback = content.match(/<([^>]+)>/);
    if (fallback) {
      return `<${fallback[1]}>`;
    }
    return `<${attachment.name}>`;
  }
  formatAncestorTag(ancestor) {
    const parts = [`<${ancestor.tagName}`];
    if (ancestor.classNames?.length) {
      parts.push(` class="${ancestor.classNames.join(" ")}"`);
    }
    if (ancestor.id) {
      parts.push(` id="${ancestor.id}"`);
    }
    return parts.join("") + ">";
  }
};
ElementChatAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IFileService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IMarkdownRendererService),
  __decorateParam(13, IChatImageCarouselService)
], ElementChatAttachmentWidget);
let SCMHistoryItemAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, markdownRendererService, hoverService, openerService, configurationService, themeService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.label.setLabel(attachment.name, void 0);
    this.element.style.cursor = "pointer";
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
    this._store.add(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content
    }, commonHoverLifecycleOptions));
    this._store.add(disposables);
    this._store.add(dom.addDisposableListener(this.element, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._openAttachment(attachment);
    }));
    this._store.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event2 = new StandardKeyboardEvent(e);
      if (event2.equals(KeyCode.Enter) || event2.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._openAttachment(attachment);
      }
    }));
  }
  async _openAttachment(attachment) {
    await this.commandService.executeCommand("_workbench.openMultiDiffEditor", {
      title: getHistoryItemEditorTitle(attachment.historyItem),
      multiDiffSourceUri: attachment.value
    });
  }
};
SCMHistoryItemAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IMarkdownRendererService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeService)
], SCMHistoryItemAttachmentWidget);
let SCMHistoryItemChangeAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, hoverService, markdownRendererService, openerService, configurationService, themeService, editorService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    const nameSuffix = `\xA0$(${Codicon.gitCommit.id})${attachment.historyItem.displayId ?? attachment.historyItem.id}`;
    this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    const { content, disposables } = toHistoryItemHoverContent(markdownRendererService, attachment.historyItem, false);
    this._store.add(hoverService.setupDelayedHover(this.element, {
      ...commonHoverOptions,
      content
    }, commonHoverLifecycleOptions));
    this._store.add(disposables);
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  async openResource(resource, options, isDirectory, range) {
    const attachment = this.attachment;
    const historyItem = attachment.historyItem;
    await this.editorService.openEditor({
      resource,
      label: `${basename(resource.path)} (${historyItem.displayId ?? historyItem.id})`,
      options: { ...options.editorOptions }
    }, options.openToSide ? SIDE_GROUP : void 0);
  }
};
SCMHistoryItemChangeAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IEditorService)
], SCMHistoryItemChangeAttachmentWidget);
let SCMHistoryItemChangeRangeAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(attachment, currentLanguageModel, options, container, contextResourceLabels, commandService, openerService, configurationService, editorService) {
    super(attachment, options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this.editorService = editorService;
    const historyItemStartId = attachment.historyItemChangeStart.historyItem.displayId ?? attachment.historyItemChangeStart.historyItem.id;
    const historyItemEndId = attachment.historyItemChangeEnd.historyItem.displayId ?? attachment.historyItemChangeEnd.historyItem.id;
    const nameSuffix = `\xA0$(${Codicon.gitCommit.id})${historyItemStartId}..${historyItemEndId}`;
    this.label.setFile(attachment.value, { fileKind: FileKind.FILE, hidePath: true, nameSuffix });
    this.element.ariaLabel = this.appendDeletionHint(localize("chat.attachment", "Attached context, {0}", attachment.name));
    this.addResourceOpenHandlers(attachment.value, void 0);
  }
  async openResource(resource, options, isDirectory, range) {
    const attachment = this.attachment;
    const historyItemChangeStart = attachment.historyItemChangeStart;
    const historyItemChangeEnd = attachment.historyItemChangeEnd;
    const originalUriTitle = `${basename(historyItemChangeStart.uri.fsPath)} (${historyItemChangeStart.historyItem.displayId ?? historyItemChangeStart.historyItem.id})`;
    const modifiedUriTitle = `${basename(historyItemChangeEnd.uri.fsPath)} (${historyItemChangeEnd.historyItem.displayId ?? historyItemChangeEnd.historyItem.id})`;
    await this.editorService.openEditor({
      original: { resource: historyItemChangeStart.uri },
      modified: { resource: historyItemChangeEnd.uri },
      label: `${originalUriTitle} \u2194 ${modifiedUriTitle}`,
      options: { ...options.editorOptions }
    }, options.openToSide ? SIDE_GROUP : void 0);
  }
};
SCMHistoryItemChangeRangeAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IEditorService)
], SCMHistoryItemChangeRangeAttachmentWidget);
let BrowserViewAttachmentWidget = class extends AbstractChatAttachmentWidget {
  constructor(_attachment, currentLanguageModel, _options, container, contextResourceLabels, commandService, openerService, configurationService, _browserViewService, _hoverService, _editorService, _instantiationService) {
    super(_attachment, _options, container, contextResourceLabels, currentLanguageModel, commandService, openerService, configurationService);
    this._attachment = _attachment;
    this._options = _options;
    this._browserViewService = _browserViewService;
    this._hoverService = _hoverService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._inputListeners = this._register(new DisposableStore());
    this._resolveInput();
    this._register(this._browserViewService.onDidChangeBrowserViews(() => this._resolveInput()));
    this._register(this._browserViewService.onDidChangeSharingAvailable(() => this._updateLabel()));
    this._register(this._hoverService.setupDelayedHover(this.element, () => ({
      ...commonHoverOptions,
      content: this._input ? {
        [BrowserViewSharingState.Shared]: this._input.getTitle() ?? "",
        [BrowserViewSharingState.NotShared]: localize("chat.browserViewNotShared", "This browser page is not shared with the agent."),
        [BrowserViewSharingState.Unavailable]: localize("chat.browserToolsDisabled", "Browser tools are not enabled.")
      }[this._input.model?.sharingState ?? BrowserViewSharingState.Shared] : localize("chat.browserViewClosed", "This browser page is no longer open.")
    }), commonHoverLifecycleOptions));
    this._instantiationService.invokeFunction((accessor) => {
      this._register(hookUpResourceAttachmentDragAndContextMenu(accessor, this.element, _attachment.value));
    });
    this.addResourceOpenHandlers(_attachment.value, void 0);
  }
  /**
   * Look up the current BrowserEditorInput for this attachment's browser ID, bind listeners, and refresh the UI.
   */
  _resolveInput() {
    const input = this._browserViewService.getKnownBrowserViews().get(this._attachment.browserId);
    if (this._input === input) {
      return;
    }
    this._inputListeners.clear();
    this._input = input;
    if (input) {
      this._inputListeners.add(input.onWillDispose(() => {
        this._input = void 0;
        this._inputListeners.clear();
        this._updateLabel();
      }));
      if (this._options.supportsDeletion) {
        this._inputListeners.add(input.onDidChangeLabel(() => this._updateLabel()));
      }
      if (input.model) {
        this._inputListeners.add(input.model.onDidChangeSharingState(() => this._updateLabel()));
      } else {
        this._inputListeners.add(input.onDidResolveModel(() => {
          this._inputListeners.add(input.model.onDidChangeSharingState(() => this._updateLabel()));
          this._updateLabel();
        }));
      }
    }
    this._updateLabel();
  }
  _updateLabel() {
    const name = this._input?.getName() ?? this._attachment.name;
    const sharingState = this._input?.model?.sharingState ?? BrowserViewSharingState.Shared;
    const isAvailable = !!this._input && sharingState === BrowserViewSharingState.Shared;
    this.element.classList.toggle("warning", !isAvailable);
    this.label.setLabel(name, void 0, {
      iconPath: Codicon.globe,
      strikethrough: !isAvailable
    });
    this.element.ariaLabel = this.appendDeletionHint(
      this._input ? {
        [BrowserViewSharingState.Shared]: localize("chat.browserViewAttachment.aria", "Attached browser page, {0}", name),
        [BrowserViewSharingState.NotShared]: localize("chat.browserViewNotShared.aria", "Browser page not shared with agent, {0}", name),
        [BrowserViewSharingState.Unavailable]: localize("chat.browserToolsDisabled.aria", "Browser tools are not enabled, {0}", name)
      }[sharingState] : localize("chat.browserViewClosed.aria", "Browser page unavailable, {0}", name)
    );
  }
  async openResource(_resource, options, _isDirectory, _range) {
    if (this._input) {
      await this._editorService.openEditor(this._input, options.editorOptions, options.openToSide ? SIDE_GROUP : void 0);
    }
  }
};
BrowserViewAttachmentWidget = __decorateClass([
  __decorateParam(5, ICommandService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IBrowserViewWorkbenchService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IInstantiationService)
], BrowserViewAttachmentWidget);
function hookUpResourceAttachmentDragAndContextMenu(accessor, widget, resource) {
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const store = new DisposableStore();
  const scopedContextKeyService = store.add(contextKeyService.createScoped(widget));
  setResourceContext(accessor, scopedContextKeyService, resource);
  widget.draggable = true;
  store.add(dom.addDisposableListener(widget, "dragstart", (e) => {
    instantiationService.invokeFunction((accessor2) => fillEditorsDragData(accessor2, [resource], e));
    e.dataTransfer?.setDragImage(widget, 0, 0);
  }));
  store.add(addBasicContextMenu(accessor, widget, scopedContextKeyService, MenuId.ChatInputResourceAttachmentContext, resource));
  return store;
}
function hookUpSymbolAttachmentDragAndContextMenu(accessor, widget, parentContextKeyService, attachment, contextMenuId) {
  const instantiationService = accessor.get(IInstantiationService);
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const textModelService = accessor.get(ITextModelService);
  const contextMenuService = accessor.get(IContextMenuService);
  const menuService = accessor.get(IMenuService);
  const store = new DisposableStore();
  widget.draggable = true;
  store.add(dom.addDisposableListener(widget, "dragstart", (e) => {
    instantiationService.invokeFunction((accessor2) => fillEditorsDragData(accessor2, [{ resource: attachment.value.uri, selection: attachment.value.range }], e));
    fillInSymbolsDragData([{
      fsPath: attachment.value.uri.fsPath,
      range: attachment.value.range,
      name: attachment.name,
      kind: attachment.kind
    }], e);
    e.dataTransfer?.setDragImage(widget, 0, 0);
  }));
  let scopedContextKeyService;
  let providerContexts;
  const ensureContextKeyService = () => {
    if (!scopedContextKeyService) {
      scopedContextKeyService = store.add(parentContextKeyService.createScoped(widget));
      chatAttachmentResourceContextKey.bindTo(scopedContextKeyService).set(attachment.value.uri.toString());
      setResourceContext(accessor, scopedContextKeyService, attachment.value.uri);
    }
    return scopedContextKeyService;
  };
  const ensureProviderContexts = () => {
    const cks = ensureContextKeyService();
    if (!providerContexts) {
      providerContexts = [
        [EditorContextKeys.hasDefinitionProvider.bindTo(cks), languageFeaturesService.definitionProvider],
        [EditorContextKeys.hasReferenceProvider.bindTo(cks), languageFeaturesService.referenceProvider],
        [EditorContextKeys.hasImplementationProvider.bindTo(cks), languageFeaturesService.implementationProvider],
        [EditorContextKeys.hasTypeDefinitionProvider.bindTo(cks), languageFeaturesService.typeDefinitionProvider]
      ];
    }
  };
  const updateContextKeys = async () => {
    ensureProviderContexts();
    const modelRef = await textModelService.createModelReference(attachment.value.uri);
    try {
      const model = modelRef.object.textEditorModel;
      for (const [contextKey, registry] of providerContexts) {
        contextKey.set(registry.has(model));
      }
    } finally {
      modelRef.dispose();
    }
  };
  store.add(dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
    const event2 = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
    dom.EventHelper.stop(domEvent, true);
    const cks = ensureContextKeyService();
    try {
      await updateContextKeys();
    } catch (e) {
      console.error(e);
    }
    contextMenuService.showContextMenu({
      contextKeyService: cks,
      getAnchor: () => event2,
      getActions: () => {
        const menu = menuService.getMenuActions(contextMenuId, cks, { arg: attachment.value });
        return getFlatContextMenuActions(menu);
      }
    });
  }));
  return store;
}
function setResourceContext(accessor, scopedContextKeyService, resource) {
  const fileService = accessor.get(IFileService);
  const languageService = accessor.get(ILanguageService);
  const modelService = accessor.get(IModelService);
  const resourceContextKey = new StaticResourceContextKey(scopedContextKeyService, fileService, languageService, modelService);
  resourceContextKey.set(resource);
}
function addBasicContextMenu(accessor, widget, scopedContextKeyService, menuId, arg, updateContextKeys) {
  const contextMenuService = accessor.get(IContextMenuService);
  const menuService = accessor.get(IMenuService);
  return dom.addDisposableListener(widget, dom.EventType.CONTEXT_MENU, async (domEvent) => {
    const event2 = new StandardMouseEvent(dom.getWindow(domEvent), domEvent);
    dom.EventHelper.stop(domEvent, true);
    try {
      await updateContextKeys?.();
    } catch (e) {
      console.error(e);
    }
    contextMenuService.showContextMenu({
      contextKeyService: scopedContextKeyService,
      getAnchor: () => event2,
      getActions: () => {
        const menu = menuService.getMenuActions(menuId, scopedContextKeyService, { arg });
        return getFlatContextMenuActions(menu);
      }
    });
  });
}
const chatAttachmentResourceContextKey = new RawContextKey("chatAttachmentResource", void 0, { type: "URI", description: localize("resource", "The full value of the chat attachment resource, including scheme and path") });
export {
  BrowserViewAttachmentWidget,
  ChatReferenceAttachmentWidget,
  DefaultChatAttachmentWidget,
  ElementChatAttachmentWidget,
  FileAttachmentWidget,
  ImageAttachmentWidget,
  NotebookCellOutputChatAttachmentWidget,
  PasteAttachmentWidget,
  PromptFileAttachmentWidget,
  PromptTextAttachmentWidget,
  SCMHistoryItemAttachmentWidget,
  SCMHistoryItemChangeAttachmentWidget,
  SCMHistoryItemChangeRangeAttachmentWidget,
  TerminalCommandAttachmentWidget,
  ToolSetOrToolItemAttachmentWidget,
  chatAttachmentResourceContextKey,
  createImageHoverContent,
  getEffectiveImageOmittedState,
  hookUpResourceAttachmentDragAndContextMenu,
  hookUpSymbolAttachmentDragAndContextMenu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCBJRGVsYXllZEhvdmVyT3B0aW9ucywgdHlwZSBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLCB0eXBlIElIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCAqIGFzIGV2ZW50IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExvY2F0aW9uLCBTeW1ib2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgZmlsbEluU3ltYm9sc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElPcGVuRWRpdG9yT3B0aW9ucywgcmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UsIE9wZW5JbnRlcm5hbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBGb2xkZXJUaGVtZUljb24sIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUZpbGVMYWJlbE9wdGlvbnMsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IFN0YXRpY1Jlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IHJldmVhbEluU2lkZUJhckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVBY3Rpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvSGlzdG9yeUl0ZW1Ib3ZlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9zY20vYnJvd3Nlci9zY21IaXN0b3J5LmpzJztcbmltcG9ydCB7IGdldEhpc3RvcnlJdGVtRWRpdG9yVGl0bGUgfSBmcm9tICcuLi8uLi8uLi9zY20vYnJvd3Nlci91dGlsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUsIElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkT3BlblNlc3Npb25MaW5rRm9yQ2hhdFJlc291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgY29lcmNlSW1hZ2VCdWZmZXIgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdEltYWdlRXh0cmFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0SW1hZ2VBdHRhY2htZW50TGltaXQsIElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgSUJyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSwgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksIElFbGVtZW50VmFyaWFibGVFbnRyeSwgSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSwgSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5LCBJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnksIElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnksIE9taXR0ZWRTdGF0ZSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnksIElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSwgSVRlcm1pbmFsVmFyaWFibGVFbnRyeSwgaXNTdHJpbmdWYXJpYWJsZUVudHJ5LCByZXNvbHZlQ2hhdENvbnRleHRJY29uLCBDaGF0Q29udGV4dEljb25QYXRoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBpc0F1dG9MYW5ndWFnZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBpc1Rvb2xTZXQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDbGVhblByb21wdE5hbWUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi9jb250ZXh0Q29udHJpYi9jaGF0Q29udGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSB9IGZyb20gJy4uL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0lNQUdFX0hPVkVSX1RIVU1CTkFJTF9NQVhfU0laRSwgZ2V0T3JDcmVhdGVJbWFnZVRodW1ibmFpbCB9IGZyb20gJy4uL2NoYXRJbWFnZVV0aWxzLmpzJztcblxuY29uc3QgY29tbW9uSG92ZXJPcHRpb25zOiBQYXJ0aWFsPElIb3Zlck9wdGlvbnM+ID0ge1xuXHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRwb3NpdGlvbjoge1xuXHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1dcblx0fSxcblx0dHJhcEZvY3VzOiB0cnVlLFxufTtcbmNvbnN0IGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9uczogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyA9IHtcblx0Z3JvdXBJZDogJ2NoYXQtYXR0YWNobWVudHMnLFxufTtcblxuY29uc3QgS0VZX0VMRU1FTlRfSE9WRVJfQ09NUFVURURfU1RZTEVfUFJPUEVSVElFUyA9IFtcblx0J2Rpc3BsYXknLFxuXHQncG9zaXRpb24nLFxuXHQnbWFyZ2luJyxcblx0J3BhZGRpbmcnLFxuXHQnZm9udC1zaXplJyxcblx0J2ZvbnQtZmFtaWx5Jyxcblx0J2NvbG9yJyxcblx0J2JhY2tncm91bmQtY29sb3InXG5dO1xuXG5hYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHVibGljIHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlbGV0ZTogZXZlbnQuRW1pdHRlcjxFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgZXZlbnQuRW1pdHRlcjxFdmVudD4oKSk7XG5cdGdldCBvbkRpZERlbGV0ZSgpOiBldmVudC5FdmVudDxFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZERlbGV0ZS5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkT3BlbjogZXZlbnQuRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBldmVudC5FbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRPcGVuKCk6IGV2ZW50LkV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRPcGVuLmV2ZW50O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRlcm1pbmFsU2VydmljZT86IElUZXJtaW5hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudC5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0dGhpcy5hdHRhY2hDbGVhckJ1dHRvbigpO1xuXHRcdHRoaXMubGFiZWwgPSBjb250ZXh0UmVzb3VyY2VMYWJlbHMuY3JlYXRlKHRoaXMuZWxlbWVudCwgeyBzdXBwb3J0SWNvbnM6IHRydWUsIGhvdmVyVGFyZ2V0T3ZlcnJpZGU6IHRoaXMuZWxlbWVudCB9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuZWxlbWVudC5yb2xlID0gJ2J1dHRvbic7XG5cblx0XHQvLyBBZGQgbWlkZGxlLWNsaWNrIHN1cHBvcnQgZm9yIHJlbW92YWxcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5BVVhDTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSAvKiBNaWRkbGUgQnV0dG9uICovICYmIHRoaXMub3B0aW9ucy5zdXBwb3J0c0RlbGV0aW9uICYmICF0aGlzLmF0dGFjaG1lbnQucmFuZ2UpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZERlbGV0ZS5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBtb2RlbFN1cHBvcnRzVmlzaW9uKCkge1xuXHRcdHJldHVybiBtb2RlbFN1cHBvcnRzVmlzaW9uKHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzQ2xlYXJCdXR0b24gPSBmYWxzZTtcblxuXHRwcm90ZWN0ZWQgYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX2hhc0NsZWFyQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm4gYXJpYUxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC53aXRoRGVsZXRlSGludCcsIFwiezB9IChEZWxldGUpXCIsIGFyaWFMYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXR0YWNoQ2xlYXJCdXR0b24oKSB7XG5cblx0XHRpZiAodGhpcy5hdHRhY2htZW50LnJhbmdlIHx8ICF0aGlzLm9wdGlvbnMuc3VwcG9ydHNEZWxldGlvbikge1xuXHRcdFx0Ly8gbm8gY2xlYXIgYnV0dG9uIGZvciBhdHRhY2htZW50cyB3aXRoIHJhbmdlcyBiZWNhdXNlIHJhbmdlIG1lYW5zXG5cdFx0XHQvLyByZWZlcmVuY2VkIGZyb20gcHJvbXB0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faGFzQ2xlYXJCdXR0b24gPSB0cnVlO1xuXG5cdFx0Y29uc3QgY2xlYXJCdXR0b24gPSBuZXcgQnV0dG9uKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LmNsZWFyQnV0dG9uJywgXCJSZW1vdmUgZnJvbSBjb250ZXh0XCIpXG5cdFx0fSk7XG5cdFx0Y2xlYXJCdXR0b24uZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdGNsZWFyQnV0dG9uLmljb24gPSBDb2RpY29uLmNsb3NlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsZWFyQnV0dG9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihldmVudC5FdmVudC5vbmNlKGNsZWFyQnV0dG9uLm9uRGlkQ2xpY2spKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZERlbGV0ZS5maXJlKGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuQmFja3NwYWNlIHx8IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5EZWxldGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZERlbGV0ZS5maXJlKGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMocmVzb3VyY2U6IFVSSSwgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck9wZW5FZGl0b3JMaXN0ZW5lcnModGhpcy5lbGVtZW50LCBhc3luYyBvcHRpb25zID0+IHtcblx0XHRcdGlmICh0aGlzLmF0dGFjaG1lbnQua2luZCA9PT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuUmVzb3VyY2UocmVzb3VyY2UsIG9wdGlvbnMsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuUmVzb3VyY2UocmVzb3VyY2UsIG9wdGlvbnMsIGZhbHNlLCByYW5nZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBQYXJ0aWFsPElPcGVuRWRpdG9yT3B0aW9ucz4sIGlzRGlyZWN0b3J5OiB0cnVlKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBQYXJ0aWFsPElPcGVuRWRpdG9yT3B0aW9ucz4sIGlzRGlyZWN0b3J5OiBmYWxzZSwgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhc3luYyBvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgb3Blbk9wdGlvbnM6IFBhcnRpYWw8SU9wZW5FZGl0b3JPcHRpb25zPiwgaXNEaXJlY3Rvcnk/OiBib29sZWFuLCByYW5nZT86IElSYW5nZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc0RpcmVjdG9yeSkge1xuXHRcdFx0Ly8gUmV2ZWFsIERpcmVjdG9yeSBpbiBleHBsb3JlclxuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChyZXZlYWxJblNpZGVCYXJDb21tYW5kLmlkLCByZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVUZXJtaW5hbCkge1xuXHRcdFx0dGhpcy50ZXJtaW5hbFNlcnZpY2U/Lm9wZW5SZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBmaWxlIGluIGVkaXRvclxuXHRcdGNvbnN0IG9wZW5UZXh0RWRpdG9yT3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkID0gcmFuZ2UgPyB7IHNlbGVjdGlvbjogcmFuZ2UgfSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcHRpb25zOiBPcGVuSW50ZXJuYWxPcHRpb25zID0ge1xuXHRcdFx0ZnJvbVVzZXJHZXN0dXJlOiB0cnVlLFxuXHRcdFx0b3BlblRvU2lkZTogb3Blbk9wdGlvbnMub3BlblRvU2lkZSxcblx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0Li4ub3BlblRleHRFZGl0b3JPcHRpb25zLFxuXHRcdFx0XHQuLi5vcGVuT3B0aW9ucy5lZGl0b3JPcHRpb25zXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fb25EaWRPcGVuLmZpcmUoKTtcblx0XHR0aGlzLmVsZW1lbnQuZm9jdXMoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb2RlbFN1cHBvcnRzVmlzaW9uKGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIGlzQXV0b0xhbmd1YWdlTW9kZWwoY3VycmVudExhbmd1YWdlTW9kZWwpIHx8IChjdXJyZW50TGFuZ3VhZ2VNb2RlbD8ubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPz8gZmFsc2UpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWZmZWN0aXZlSW1hZ2VPbWl0dGVkU3RhdGUob21pdHRlZFN0YXRlOiBPbWl0dGVkU3RhdGUgfCB1bmRlZmluZWQsIGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsIGlzQ3VycmVudElucHV0OiBib29sZWFuIHwgdW5kZWZpbmVkKTogT21pdHRlZFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGlzQXV0b0xhbmd1YWdlTW9kZWwoY3VycmVudExhbmd1YWdlTW9kZWwpICYmIGlzQ3VycmVudElucHV0ICYmIG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGxcblx0XHQ/IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkXG5cdFx0OiBvbWl0dGVkU3RhdGU7XG59XG5cblxuZXhwb3J0IGNsYXNzIEZpbGVBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdFx0Y29ycmVzcG9uZGluZ0NvbnRlbnRSZWZlcmVuY2U6IElDaGF0Q29udGVudFJlZmVyZW5jZSB8IHVuZGVmaW5lZCxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZmlsZUJhc2VuYW1lID0gYmFzZW5hbWUocmVzb3VyY2UucGF0aCk7XG5cdFx0Y29uc3QgZmlsZURpcm5hbWUgPSBkaXJuYW1lKHJlc291cmNlLnBhdGgpO1xuXHRcdGNvbnN0IGZyaWVuZGx5TmFtZSA9IGAke2ZpbGVCYXNlbmFtZX0gJHtmaWxlRGlybmFtZX1gO1xuXHRcdGxldCBhcmlhTGFiZWwgPSByYW5nZSA/IGxvY2FsaXplKCdjaGF0LmZpbGVBdHRhY2htZW50V2l0aFJhbmdlJywgXCJBdHRhY2hlZCBmaWxlLCB7MH0sIGxpbmUgezF9IHRvIGxpbmUgezJ9XCIsIGZyaWVuZGx5TmFtZSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyKSA6IGxvY2FsaXplKCdjaGF0LmZpbGVBdHRhY2htZW50JywgXCJBdHRhY2hlZCBmaWxlLCB7MH1cIiwgZnJpZW5kbHlOYW1lKTtcblxuXHRcdGlmIChhdHRhY2htZW50Lm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0Lm9taXR0ZWRGaWxlQXR0YWNobWVudCcsIFwiT21pdHRlZCB0aGlzIGZpbGU6IHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdFx0dGhpcy5yZW5kZXJPbWl0dGVkV2FybmluZyhmcmllbmRseU5hbWUsIGFyaWFMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGZpbGVPcHRpb25zOiBJRmlsZUxhYmVsT3B0aW9ucyA9IHsgaGlkZVBhdGg6IHRydWUsIHRpdGxlOiBjb3JyZXNwb25kaW5nQ29udGVudFJlZmVyZW5jZT8ub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbiB9O1xuXHRcdFx0dGhpcy5sYWJlbC5zZXRGaWxlKHJlc291cmNlLCBhdHRhY2htZW50LmtpbmQgPT09ICdmaWxlJyA/IHtcblx0XHRcdFx0Li4uZmlsZU9wdGlvbnMsXG5cdFx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdH0gOiB7XG5cdFx0XHRcdC4uLmZpbGVPcHRpb25zLFxuXHRcdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRk9MREVSLFxuXHRcdFx0XHRpY29uOiAhdGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpLmhhc0ZvbGRlckljb25zID8gRm9sZGVyVGhlbWVJY29uIDogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSWYgdGhpcyBpcyBhIGZvbGRlciB3aG9zZSBjb250ZW50cyB3b3VsZCBleGNlZWQgdGhlIG1vZGVsJ3MgcGVyLXJlcXVlc3QgaW1hZ2UgbGltaXQsIHN1cmZhY2UgYSB3YXJuaW5nLlxuXHRcdFx0aWYgKGF0dGFjaG1lbnQua2luZCA9PT0gJ2RpcmVjdG9yeScgJiYgdHlwZW9mIGF0dGFjaG1lbnQuaW1hZ2VDb3VudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0Y29uc3QgbWF4SW1hZ2VzUGVyUmVxdWVzdCA9IGdldEltYWdlQXR0YWNobWVudExpbWl0KGN1cnJlbnRMYW5ndWFnZU1vZGVsPy5tZXRhZGF0YSk7XG5cdFx0XHRcdGlmIChtYXhJbWFnZXNQZXJSZXF1ZXN0ICE9PSB1bmRlZmluZWQgJiYgYXR0YWNobWVudC5pbWFnZUNvdW50ID4gbWF4SW1hZ2VzUGVyUmVxdWVzdCkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyRm9sZGVySW1hZ2VMaW1pdFdhcm5pbmcoYXR0YWNobWVudC5pbWFnZUNvdW50LCBtYXhJbWFnZXNQZXJSZXF1ZXN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChhcmlhTGFiZWwpO1xuXHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdmaWxlJykge1xuXHRcdFx0dGhpcy5hdHRhY2hTYXZlQnV0dG9uKHJlc291cmNlLCBmaWxlQmFzZW5hbWUsIG9wdGlvbnMuc3VwcG9ydHNEZWxldGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgcmVzb3VyY2UpKTtcblx0XHR9KTtcblx0XHR0aGlzLmFkZFJlc291cmNlT3BlbkhhbmRsZXJzKHJlc291cmNlLCByYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaFNhdmVCdXR0b24ocmVzb3VyY2U6IFVSSSwgbmFtZTogc3RyaW5nLCBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHN1cHBvcnRzRGVsZXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlQnV0dG9uID0gbmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC5zYXZlRmlsZUJ1dHRvbicsIFwiU2F2ZSBBcy4uLlwiKVxuXHRcdH0pO1xuXHRcdHNhdmVCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWF0dGFjaGVkLWNvbnRleHQtZG93bmxvYWQtYnV0dG9uJyk7XG5cdFx0c2F2ZUJ1dHRvbi5lbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0c2F2ZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jbG91ZERvd25sb2FkO1xuXHRcdHRoaXMuZWxlbWVudC5pbnNlcnRCZWZvcmUoc2F2ZUJ1dHRvbi5lbGVtZW50LCB0aGlzLmxhYmVsLmVsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNhdmVCdXR0b24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNhdmVCdXR0b24ub25EaWRDbGljayhhc3luYyBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0VXJpID0gam9pblBhdGgoYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKSwgbmFtZSk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHsgZGVmYXVsdFVyaSB9KTtcblx0XHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jb3B5KHJlc291cmNlLCB0YXJnZXQsIHRydWUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQuc2F2ZUZpbGVFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgZmlsZTogezB9XCIsIGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJPbWl0dGVkV2FybmluZyhmcmllbmRseU5hbWU6IHN0cmluZywgYXJpYUxhYmVsOiBzdHJpbmcpIHtcblx0XHRjb25zdCBwaWxsSWNvbiA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXBpbGwnLCB7fSwgZG9tLiQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLXdhcm5pbmcnKSk7XG5cdFx0Y29uc3QgdGV4dExhYmVsID0gZG9tLiQoJ3NwYW4uY2hhdC1hdHRhY2hlZC1jb250ZXh0LWN1c3RvbS10ZXh0Jywge30sIGZyaWVuZGx5TmFtZSk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHBpbGxJY29uKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGV4dExhYmVsKTtcblxuXHRcdGNvbnN0IGhvdmVyRWxlbWVudCA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWhvdmVyJyk7XG5cdFx0aG92ZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dhcm5pbmcnKTtcblxuXHRcdGhvdmVyRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LmZpbGVBdHRhY2htZW50SG92ZXInLCBcInswfSBkb2VzIG5vdCBzdXBwb3J0IHRoaXMgZmlsZSB0eXBlLlwiLCB0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbCh0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsLmlkZW50aWZpZXIpPy5uYW1lIDogdGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbCA/PyAnVGhpcyBtb2RlbCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdH0sIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGb2xkZXJJbWFnZUxpbWl0V2FybmluZyhpbWFnZUNvdW50OiBudW1iZXIsIGxpbWl0OiBudW1iZXIpIHtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2FybmluZycpO1xuXG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXInKTtcblx0XHRob3ZlckVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcblx0XHRcdCdjaGF0LmZvbGRlckltYWdlTGltaXRFeGNlZWRlZEhvdmVyJyxcblx0XHRcdFwiVGhpcyBmb2xkZXIgY29udGFpbnMgezB9IGltYWdlcywgd2hpY2ggZXhjZWVkcyB0aGUgbWF4aW11bSBvZiB7MX0gaW1hZ2VzIHBlciByZXF1ZXN0LiBPbGRlciBpbWFnZXMgd2lsbCBub3QgYmUgc2VudC5cIixcblx0XHRcdGltYWdlQ291bnQsXG5cdFx0XHRsaW1pdCxcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdH0sIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQ29tbWFuZEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhdHRhY2htZW50OiBJVGVybWluYWxWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSB0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGF0dGFjaG1lbnQsIG9wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQudGVybWluYWxDb21tYW5kJywgXCJUZXJtaW5hbCBjb21tYW5kLCB7MH1cIiwgYXR0YWNobWVudC5jb21tYW5kKTtcblx0XHRjb25zdCBjbGlja0hhbmRsZXIgPSAoKSA9PiB0aGlzLm9wZW5SZXNvdXJjZShhdHRhY2htZW50LnJlc291cmNlLCB7IGVkaXRvck9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0sIGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3JlYXRlVGVybWluYWxDb21tYW5kRWxlbWVudHModGhpcy5lbGVtZW50LCBhdHRhY2htZW50LCBhcmlhTGFiZWwsIHRoaXMuaG92ZXJTZXJ2aWNlLCBjbGlja0hhbmRsZXIpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBhc3luYyAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGNsaWNrSGFuZGxlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChhcmlhTGFiZWwpO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gVGVybWluYWxDb25zdGFudHMge1xuXHRNYXhBdHRhY2htZW50T3V0cHV0TGluZUNvdW50ID0gNSxcblx0TWF4QXR0YWNobWVudE91dHB1dExpbmVMZW5ndGggPSA4MCxcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVybWluYWxDb21tYW5kRWxlbWVudHMoXG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRhdHRhY2htZW50OiBJVGVybWluYWxWYXJpYWJsZUVudHJ5LFxuXHRhcmlhTGFiZWw6IHN0cmluZyxcblx0aG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRjbGlja0hhbmRsZXI6ICgpID0+IFByb21pc2U8dm9pZD5cbik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0ZWxlbWVudC5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdGVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXG5cdGNvbnN0IHRlcm1pbmFsSWNvblNwYW4gPSBkb20uJCgnc3BhbicpO1xuXHR0ZXJtaW5hbEljb25TcGFuLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi50ZXJtaW5hbCkpO1xuXHRjb25zdCBwaWxsSWNvbiA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXBpbGwnLCB7fSwgdGVybWluYWxJY29uU3Bhbik7XG5cdGNvbnN0IHRleHRMYWJlbCA9IGRvbS4kKCdzcGFuLmNoYXQtYXR0YWNoZWQtY29udGV4dC1jdXN0b20tdGV4dCcsIHt9LCBhdHRhY2htZW50LmNvbW1hbmQpO1xuXHRlbGVtZW50LmFwcGVuZENoaWxkKHBpbGxJY29uKTtcblx0ZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0TGFiZWwpO1xuXG5cdGRpc3Bvc2FibGUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0Y2xpY2tIYW5kbGVyKCk7XG5cdH0pKTtcblxuXHRkaXNwb3NhYmxlLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwgKCkgPT4gZ2V0SG92ZXJDb250ZW50KGFyaWFMYWJlbCwgYXR0YWNobWVudCksIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHRyZXR1cm4gZGlzcG9zYWJsZTtcbn1cblxuZnVuY3Rpb24gZ2V0SG92ZXJDb250ZW50KGFyaWFMYWJlbDogc3RyaW5nLCBhdHRhY2htZW50OiBJVGVybWluYWxWYXJpYWJsZUVudHJ5KTogSURlbGF5ZWRIb3Zlck9wdGlvbnMge1xuXHR7XG5cdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXInKTtcblx0XHRob3ZlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblxuXHRcdGNvbnN0IGNvbW1hbmRUaXRsZSA9IGRvbS4kKCdkaXYnLCB7fSwgdHlwZW9mIGF0dGFjaG1lbnQuZXhpdENvZGUgPT09ICdudW1iZXInXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsQ29tbWFuZEhvdmVyQ29tbWFuZFRpdGxlRXhpdCcsIFwiQ29tbWFuZDogezB9LCBleGl0IGNvZGU6IHsxfVwiLCBhdHRhY2htZW50LmNvbW1hbmQsIGF0dGFjaG1lbnQuZXhpdENvZGUpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsQ29tbWFuZEhvdmVyQ29tbWFuZFRpdGxlJywgXCJDb21tYW5kXCIpKTtcblx0XHRjb21tYW5kVGl0bGUuY2xhc3NMaXN0LmFkZCgnYXR0YWNobWVudC1hZGRpdGlvbmFsLWluZm8nKTtcblx0XHRjb25zdCBjb21tYW5kQmxvY2sgPSBkb20uJCgncHJlLmNoYXQtdGVybWluYWwtY29tbWFuZC1ibG9jaycpO1xuXHRcdGhvdmVyRWxlbWVudC5hcHBlbmQoY29tbWFuZFRpdGxlLCBjb21tYW5kQmxvY2spO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQub3V0cHV0ICYmIGF0dGFjaG1lbnQub3V0cHV0LnRyaW0oKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBvdXRwdXRUaXRsZSA9IGRvbS4kKCdkaXYnLCB7fSwgbG9jYWxpemUoJ2NoYXQudGVybWluYWxDb21tYW5kSG92ZXJPdXRwdXRUaXRsZScsIFwiT3V0cHV0OlwiKSk7XG5cdFx0XHRvdXRwdXRUaXRsZS5jbGFzc0xpc3QuYWRkKCdhdHRhY2htZW50LWFkZGl0aW9uYWwtaW5mbycpO1xuXHRcdFx0Y29uc3Qgb3V0cHV0QmxvY2sgPSBkb20uJCgncHJlLmNoYXQtdGVybWluYWwtY29tbWFuZC1vdXRwdXQnKTtcblx0XHRcdGNvbnN0IGZ1bGxPdXRwdXRMaW5lcyA9IGF0dGFjaG1lbnQub3V0cHV0LnNwbGl0KCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyT3V0cHV0TGluZXMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBmdWxsT3V0cHV0TGluZXMpIHtcblx0XHRcdFx0aWYgKGhvdmVyT3V0cHV0TGluZXMubGVuZ3RoID49IFRlcm1pbmFsQ29uc3RhbnRzLk1heEF0dGFjaG1lbnRPdXRwdXRMaW5lQ291bnQpIHtcblx0XHRcdFx0XHRob3Zlck91dHB1dExpbmVzLnB1c2goJy4uLicpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0XHRcdFx0aWYgKHRyaW1tZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRyaW1tZWQubGVuZ3RoID4gVGVybWluYWxDb25zdGFudHMuTWF4QXR0YWNobWVudE91dHB1dExpbmVMZW5ndGgpIHtcblx0XHRcdFx0XHRob3Zlck91dHB1dExpbmVzLnB1c2goYCR7dHJpbW1lZC5zbGljZSgwLCBUZXJtaW5hbENvbnN0YW50cy5NYXhBdHRhY2htZW50T3V0cHV0TGluZUxlbmd0aCl9Li4uYCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aG92ZXJPdXRwdXRMaW5lcy5wdXNoKHRyaW1tZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXRCbG9jay50ZXh0Q29udGVudCA9IGhvdmVyT3V0cHV0TGluZXMuam9pbignXFxuJyk7XG5cdFx0XHRob3ZlckVsZW1lbnQuYXBwZW5kKG91dHB1dFRpdGxlLCBvdXRwdXRCbG9jayk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGhvdmVyRWxlbWVudCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbWFnZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW47IGlzQ3VycmVudElucHV0PzogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2U6IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGF0dGFjaG1lbnQsIG9wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW1hZ2UtYXR0YWNobWVudCcpO1xuXG5cdFx0Y29uc3QgaXNBdXRvTW9kZWwgPSBpc0F1dG9MYW5ndWFnZU1vZGVsKGN1cnJlbnRMYW5ndWFnZU1vZGVsKTtcblx0XHRjb25zdCBtb2RlbE5hbWUgPSBjdXJyZW50TGFuZ3VhZ2VNb2RlbD8ubWV0YWRhdGEubmFtZTtcblx0XHRjb25zdCBvbWl0dGVkU3RhdGUgPSBnZXRFZmZlY3RpdmVJbWFnZU9taXR0ZWRTdGF0ZShhdHRhY2htZW50Lm9taXR0ZWRTdGF0ZSwgY3VycmVudExhbmd1YWdlTW9kZWwsIG9wdGlvbnMuaXNDdXJyZW50SW5wdXQpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhdXRvLWltYWdlLXdhcm5pbmcnLCBpc0F1dG9Nb2RlbCk7XG5cdFx0bGV0IGFyaWFMYWJlbDogc3RyaW5nO1xuXHRcdGlmIChvbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5GdWxsICYmIG1vZGVsTmFtZSAmJiAhbW9kZWxTdXBwb3J0c1Zpc2lvbihjdXJyZW50TGFuZ3VhZ2VNb2RlbCkpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnVuc3VwcG9ydGVkSW1hZ2VBdHRhY2htZW50JywgXCJJbWFnZSBub3Qgc2VudCBiZWNhdXNlIHswfSBkb2VzIG5vdCBzdXBwb3J0IGltYWdlczogezF9XCIsIG1vZGVsTmFtZSwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2UgaWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0Lm9taXR0ZWRJbWFnZUF0dGFjaG1lbnQnLCBcIk9taXR0ZWQgdGhpcyBpbWFnZTogezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0fSBlbHNlIGlmIChvbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5QYXJ0aWFsKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wYXJ0aWFsbHlPbWl0dGVkSW1hZ2VBdHRhY2htZW50JywgXCJQYXJ0aWFsbHkgb21pdHRlZCB0aGlzIGltYWdlOiB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2UgaWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZCkge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQuaW1hZ2VMaW1pdEV4Y2VlZGVkQXR0YWNobWVudCcsIFwiSW1hZ2Ugbm90IHNlbnQgZHVlIHRvIGxpbWl0OiB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2UgaWYgKGlzQXV0b01vZGVsKSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5hdXRvSW1hZ2VBdHRhY2htZW50JywgXCJBdHRhY2hlZCBpbWFnZSwgezB9LiBJbWFnZSBzdXBwb3J0IGRlcGVuZHMgb24gdGhlIG1vZGVsIHNlbGVjdGVkIGJ5IEF1dG8uXCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LmltYWdlQXR0YWNobWVudCcsIFwiQXR0YWNoZWQgaW1hZ2UsIHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZiA9IGF0dGFjaG1lbnQucmVmZXJlbmNlcz8uWzBdPy5yZWZlcmVuY2U7XG5cdFx0cmVzb3VyY2UgPSByZWYgJiYgVVJJLmlzVXJpKHJlZikgPyByZWYgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW1hZ2VEYXRhID0gY29lcmNlSW1hZ2VCdWZmZXIoYXR0YWNobWVudC52YWx1ZSk7XG5cdFx0Y29uc3QgY2xpY2tIYW5kbGVyID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKChyZXNvdXJjZSB8fCBpbWFnZURhdGEpICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltYWdlQ2Fyb3VzZWxFbmFibGVkKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5JbkNhcm91c2VsKGF0dGFjaG1lbnQuaWQsIGF0dGFjaG1lbnQubmFtZSwgaW1hZ2VEYXRhLCByZXNvdXJjZSwgb3B0aW9ucy5pc0N1cnJlbnRJbnB1dCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlblJlc291cmNlKHJlc291cmNlLCB7IGVkaXRvck9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0sIGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWUgPSB0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbCh0aGlzLmN1cnJlbnRMYW5ndWFnZU1vZGVsLmlkZW50aWZpZXIpPy5uYW1lID8/IHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwuaWRlbnRpZmllciA6ICdDdXJyZW50IG1vZGVsJztcblxuXHRcdGNvbnN0IGZ1bGxOYW1lID0gcmVzb3VyY2UgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSkgOiAoYXR0YWNobWVudC5mdWxsTmFtZSB8fCBhdHRhY2htZW50Lm5hbWUpO1xuXG5cdFx0Y29uc3QgaW1hZ2VFbGVtZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0Y29uc3QgcmVuZGVySW1hZ2VFbGVtZW50cyA9IChidWZmZXI6IFVpbnQ4QXJyYXkpID0+IHtcblx0XHRcdGltYWdlRWxlbWVudHMudmFsdWUgPSBjcmVhdGVJbWFnZUVsZW1lbnRzKHJlc291cmNlLCBhdHRhY2htZW50Lm5hbWUsIGZ1bGxOYW1lLCB0aGlzLmVsZW1lbnQsIGJ1ZmZlciwgYXR0YWNobWVudC5pZCwgdGhpcy5ob3ZlclNlcnZpY2UsIGFyaWFMYWJlbCwgY3VycmVudExhbmd1YWdlTW9kZWxOYW1lLCBjbGlja0hhbmRsZXIsIHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwsIG9taXR0ZWRTdGF0ZSk7XG5cdFx0XHQvLyBjcmVhdGVJbWFnZUVsZW1lbnRzIHJlc2V0cyB0aGUgbGFiZWw7IHJlc3RvcmUgdGhlIGRlbGV0aW9uIGhpbnQgYWZ0ZXIgZWFjaCByZW5kZXIuXG5cdFx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQoYXJpYUxhYmVsKTtcblx0XHR9O1xuXHRcdHJlbmRlckltYWdlRWxlbWVudHMoaW1hZ2VEYXRhID8/IG5ldyBVaW50OEFycmF5KCkpO1xuXG5cdFx0Ly8gSHlkcmF0ZWQgYXR0YWNobWVudHMgbmVlZCBkaXNrIGJ5dGVzIHNvIHRoZSBwcmV2aWV3IGRvZXMgbm90IGZhbGwgYmFjayB0byBhIGdlbmVyaWMgZmlsZSBpY29uLlxuXHRcdGlmICghaW1hZ2VEYXRhICYmIHJlc291cmNlICYmIG9taXR0ZWRTdGF0ZSAhPT0gT21pdHRlZFN0YXRlLkZ1bGwgJiYgb21pdHRlZFN0YXRlICE9PSBPbWl0dGVkU3RhdGUuSW1hZ2VMaW1pdEV4Y2VlZGVkKSB7XG5cdFx0XHR2b2lkIHRoaXMubG9hZEltYWdlQnl0ZXMocmVzb3VyY2UsIHJlbmRlckltYWdlRWxlbWVudHMpO1xuXHRcdH1cblx0XHR0aGlzLmF0dGFjaFNhdmVCdXR0b24ocmVzb3VyY2UsIGltYWdlRGF0YSwgYXR0YWNobWVudC5uYW1lLCBvcHRpb25zLnN1cHBvcnRzRGVsZXRpb24pO1xuXG5cdFx0Ly8gV2lyZSB1cCBjbGljayArIGtleWJvYXJkIChFbnRlci9TcGFjZSkgb3BlbiBoYW5kbGVyc1xuXHRcdGNvbnN0IGNhbk9wZW5DYXJvdXNlbCA9ICEhaW1hZ2VEYXRhICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltYWdlQ2Fyb3VzZWxFbmFibGVkKTtcblx0XHRpZiAoY2FuT3BlbkNhcm91c2VsIHx8IHJlc291cmNlKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBjbGlja0hhbmRsZXIoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoaG9va1VwUmVzb3VyY2VBdHRhY2htZW50RHJhZ0FuZENvbnRleHRNZW51KGFjY2Vzc29yLCB0aGlzLmVsZW1lbnQsIHJlc291cmNlKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRJbWFnZUJ5dGVzKHJlc291cmNlOiBVUkksIHJlbmRlcjogKGJ1ZmZlcjogVWludDhBcnJheSkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjb250ZW50OiBWU0J1ZmZlcjtcblx0XHR0cnkge1xuXHRcdFx0Y29udGVudCA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKSkudmFsdWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBUaGUgZmlsZSBtYXkgbm8gbG9uZ2VyIGV4aXN0OyBrZWVwIHRoZSBpY29uIGZhbGxiYWNrIHRoYXQgaXMgYWxyZWFkeSByZW5kZXJlZC5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVuZGVyKGNvbnRlbnQuYnVmZmVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkluQ2Fyb3VzZWwoaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBkYXRhOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkLCByZWZlcmVuY2VVcmk6IFVSSSB8IHVuZGVmaW5lZCwgcHJlZmVyQ3VycmVudElucHV0OiBib29sZWFuIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZWZlcmVuY2VVcmkgPz8gVVJJLmZyb20oeyBzY2hlbWU6ICdkYXRhJywgcGF0aDogYCR7aWR9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KG5hbWUpfWAgfSk7XG5cdFx0YXdhaXQgdGhpcy5jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2Uub3BlbkNhcm91c2VsQXRSZXNvdXJjZShyZXNvdXJjZSwgZGF0YSwgeyBwcmVmZXJDdXJyZW50SW5wdXQgfSk7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaFNhdmVCdXR0b24ocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgaW1hZ2VEYXRhOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkLCBuYW1lOiBzdHJpbmcsIHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3VwcG9ydHNEZWxldGlvbiB8fCAoIXJlc291cmNlICYmICFpbWFnZURhdGEpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZUJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5lbGVtZW50LCB7XG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRob3ZlckRlbGVnYXRlOiBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQuc2F2ZUltYWdlQnV0dG9uJywgXCJTYXZlIEltYWdlIEFzLi4uXCIpXG5cdFx0fSk7XG5cdFx0c2F2ZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtYXR0YWNoZWQtY29udGV4dC1kb3dubG9hZC1idXR0b24nKTtcblx0XHRzYXZlQnV0dG9uLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRzYXZlQnV0dG9uLmljb24gPSBDb2RpY29uLmNsb3VkRG93bmxvYWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2F2ZUJ1dHRvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2F2ZUJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRVcmkgPSBqb2luUGF0aChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCgpLCBuYW1lKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coeyBkZWZhdWx0VXJpIH0pO1xuXHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNvcHkocmVzb3VyY2UsIHRhcmdldCwgdHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW1hZ2VEYXRhKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBWU0J1ZmZlci53cmFwKGltYWdlRGF0YSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudC5zYXZlSW1hZ2VFcnJvcicsIFwiRmFpbGVkIHRvIHNhdmUgaW1hZ2U6IHswfVwiLCBlcnJvcikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW1hZ2VIb3ZlckNvbnRlbnQocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgZnVsbE5hbWU6IHN0cmluZyxcblx0YnVmZmVyOiBBcnJheUJ1ZmZlciB8IFVpbnQ4QXJyYXksXG5cdGNhY2hlS2V5OiBzdHJpbmcsXG5cdG9uQ29udGVudHNDaGFuZ2VkPzogKCkgPT4gdm9pZCxcblx0Y2xpY2tIYW5kbGVyPzogKCkgPT4gdm9pZCxcblx0b25JbWFnZVVybD86ICh1cmw6IHN0cmluZywgaXNUaHVtYm5haWw6IGJvb2xlYW4sIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50KSA9PiB2b2lkLFxuXHRpbWFnZUFsdCA9ICcnKTogeyByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDsgcmVhZG9ubHkgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfSB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXInKTtcblx0Y29uc3QgaG92ZXJJbWFnZSA9IGRvbS4kPEhUTUxJbWFnZUVsZW1lbnQ+KCdpbWcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWltYWdlJywgeyBhbHQ6IGltYWdlQWx0IH0pO1xuXHRjb25zdCBpbWFnZUNvbnRhaW5lciA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWltYWdlLWNvbnRhaW5lcicsIHt9LCBob3ZlckltYWdlKTtcblx0aG92ZXJFbGVtZW50LmFwcGVuZENoaWxkKGltYWdlQ29udGFpbmVyKTtcblxuXHRpZiAoY2xpY2tIYW5kbGVyKSB7XG5cdFx0aW1hZ2VDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2xpY2thYmxlJyk7XG5cdFx0aW1hZ2VDb250YWluZXIudGFiSW5kZXggPSAwO1xuXHRcdGltYWdlQ29udGFpbmVyLnJvbGUgPSAnYnV0dG9uJztcblx0XHRpbWFnZUNvbnRhaW5lci5hcmlhTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5vcGVuSW1hZ2VQcmV2aWV3JywgXCJPcGVuIGluIEltYWdlcyBQcmV2aWV3XCIpO1xuXHRcdGRpc3Bvc2FibGUuYWRkKHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyhpbWFnZUNvbnRhaW5lciwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY2xpY2tIYW5kbGVyKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0aWYgKHJlc291cmNlKSB7XG5cdFx0Y29uc3QgdXJsQ29udGFpbmVyID0gY2xpY2tIYW5kbGVyXG5cdFx0XHQ/IGRvbS4kKCdhLmNoYXQtYXR0YWNoZWQtY29udGV4dC11cmwnLCB7fSwgZnVsbE5hbWUpXG5cdFx0XHQ6IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXVybCcsIHt9LCBmdWxsTmFtZSk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtdXJsLXNlcGFyYXRvcicpO1xuXHRcdGlmIChjbGlja0hhbmRsZXIpIHtcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodXJsQ29udGFpbmVyLCAnY2xpY2snLCBjbGlja0hhbmRsZXIpKTtcblx0XHR9XG5cdFx0aG92ZXJFbGVtZW50LmFwcGVuZChzZXBhcmF0b3IsIHVybENvbnRhaW5lcik7XG5cdH1cblxuXHRjb25zdCBkYXRhID0gYnVmZmVyIGluc3RhbmNlb2YgVWludDhBcnJheSA/IGJ1ZmZlciA6IG5ldyBVaW50OEFycmF5KGJ1ZmZlcik7XG5cdGNvbnN0IHByZXZpZXdJbWFnZVVybCA9IGRpc3Bvc2FibGUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdGNvbnN0IHJlbmRlclByZXZpZXdJbWFnZSA9IGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aHVtYm5haWwgPSBhd2FpdCBnZXRPckNyZWF0ZUltYWdlVGh1bWJuYWlsKGNhY2hlS2V5LCBkYXRhLCBDSEFUX0lNQUdFX0hPVkVSX1RIVU1CTkFJTF9NQVhfU0laRSk7XG5cdFx0aWYgKGRpc3Bvc2FibGUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSB0aHVtYm5haWwgPz8gbmV3IEJsb2IoW2RhdGEgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj5dKTtcblx0XHRjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKHNvdXJjZSk7XG5cdFx0cHJldmlld0ltYWdlVXJsLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwodXJsKSk7XG5cdFx0aG92ZXJJbWFnZS5vbmxvYWQgPSAoKSA9PiBvbkNvbnRlbnRzQ2hhbmdlZD8uKCk7XG5cdFx0aG92ZXJJbWFnZS5zcmMgPSB1cmw7XG5cdFx0b25JbWFnZVVybD8uKHVybCwgISF0aHVtYm5haWwsIGhvdmVySW1hZ2UpO1xuXHR9O1xuXHR2b2lkIHJlbmRlclByZXZpZXdJbWFnZSgpO1xuXG5cdHJldHVybiB7IGVsZW1lbnQ6IGhvdmVyRWxlbWVudCwgZGlzcG9zYWJsZSB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVJbWFnZUVsZW1lbnRzKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIG5hbWU6IHN0cmluZywgZnVsbE5hbWU6IHN0cmluZyxcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdGJ1ZmZlcjogQXJyYXlCdWZmZXIgfCBVaW50OEFycmF5LFxuXHRjYWNoZUtleTogc3RyaW5nLFxuXHRob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsIGFyaWFMYWJlbDogc3RyaW5nLFxuXHRjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0Y2xpY2tIYW5kbGVyOiAoKSA9PiB2b2lkLFxuXHRjdXJyZW50TGFuZ3VhZ2VNb2RlbD86IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0b21pdHRlZFN0YXRlPzogT21pdHRlZFN0YXRlKTogSURpc3Bvc2FibGUge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGlmIChvbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5QYXJ0aWFsKSB7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdwYXJ0aWFsLXdhcm5pbmcnKTtcblx0fVxuXG5cdGVsZW1lbnQuYXJpYUxhYmVsID0gYXJpYUxhYmVsO1xuXHRlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuXHRpZiAocmVzb3VyY2UpIHtcblx0XHRlbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0fVxuXHRjb25zdCBzdXBwb3J0c1Zpc2lvbiA9IG1vZGVsU3VwcG9ydHNWaXNpb24oY3VycmVudExhbmd1YWdlTW9kZWwpO1xuXHRjb25zdCBwaWxsSWNvbiA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXBpbGwnLCB7fSwgZG9tLiQoc3VwcG9ydHNWaXNpb24gPyAnc3Bhbi5jb2RpY29uLmNvZGljb24tZmlsZS1tZWRpYScgOiAnc3Bhbi5jb2RpY29uLmNvZGljb24td2FybmluZycpKTtcblx0Y29uc3QgdGV4dExhYmVsID0gZG9tLiQoJ3NwYW4uY2hhdC1hdHRhY2hlZC1jb250ZXh0LWN1c3RvbS10ZXh0Jywge30sIG5hbWUpO1xuXHRlbGVtZW50LmFwcGVuZENoaWxkKHBpbGxJY29uKTtcblx0ZWxlbWVudC5hcHBlbmRDaGlsZCh0ZXh0TGFiZWwpO1xuXG5cdC8vIFRyYWNrcyB0aGUgY3VycmVudGx5IHJlbmRlcmVkIHBpbGwgc28gaXQgY2FuIGJlIHN3YXBwZWQgd2l0aG91dCBxdWVyeWluZyB0aGUgRE9NLlxuXHRsZXQgY3VycmVudFBpbGw6IEhUTUxFbGVtZW50ID0gcGlsbEljb247XG5cdGNvbnN0IHJlcGxhY2VQaWxsID0gKHBpbGw6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0Y3VycmVudFBpbGwucmVwbGFjZVdpdGgocGlsbCk7XG5cdFx0Y3VycmVudFBpbGwgPSBwaWxsO1xuXHR9O1xuXG5cdGNvbnN0IGhvdmVyRWxlbWVudCA9IGRvbS4kKCdkaXYuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWhvdmVyJyk7XG5cdGhvdmVyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXG5cdGlmICgoIXN1cHBvcnRzVmlzaW9uICYmIGN1cnJlbnRMYW5ndWFnZU1vZGVsKSB8fCBvbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5GdWxsKSB7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nJyk7XG5cdFx0aG92ZXJFbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQuaW1hZ2VBdHRhY2htZW50SG92ZXInLCBcInswfSBkb2VzIG5vdCBzdXBwb3J0IGltYWdlcy5cIiwgY3VycmVudExhbmd1YWdlTW9kZWxOYW1lID8/ICdUaGlzIG1vZGVsJyk7XG5cdFx0ZGlzcG9zYWJsZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IGhvdmVyRWxlbWVudCxcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0fSkpO1xuXHR9IGVsc2UgaWYgKG9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZCkge1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2FybmluZycpO1xuXHRcdGNvbnN0IG1heEltYWdlc1BlclJlcXVlc3QgPSBnZXRJbWFnZUF0dGFjaG1lbnRMaW1pdChjdXJyZW50TGFuZ3VhZ2VNb2RlbD8ubWV0YWRhdGEpO1xuXHRcdGhvdmVyRWxlbWVudC50ZXh0Q29udGVudCA9IG1heEltYWdlc1BlclJlcXVlc3QgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5pbWFnZUxpbWl0RXhjZWVkZWRIb3ZlcicsIFwiVGhpcyBpbWFnZSB3YXMgbm90IHNlbnQgYmVjYXVzZSB0aGUgbWF4aW11bSBvZiB7MH0gaW1hZ2VzIHBlciByZXF1ZXN0IHdhcyBleGNlZWRlZC5cIiwgbWF4SW1hZ2VzUGVyUmVxdWVzdClcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQuaW1hZ2VMaW1pdEV4Y2VlZGVkSG92ZXJVbmtub3duTGltaXQnLCBcIlRoaXMgaW1hZ2Ugd2FzIG5vdCBzZW50IGJlY2F1c2UgdGhpcyBtb2RlbCdzIGltYWdlIGxpbWl0IHdhcyBleGNlZWRlZC5cIik7XG5cdFx0ZGlzcG9zYWJsZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IGhvdmVyRWxlbWVudCxcblx0XHRcdHN0eWxlOiBIb3ZlclN0eWxlLlBvaW50ZXIsXG5cdFx0fSkpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IG9uSW1hZ2VGYWlsZWQgPSAoKSA9PiB7XG5cdFx0XHQvLyByZXNldCB0byBvcmlnaW5hbCBpY29uIG9uIGVycm9yIG9yIGludmFsaWQgaW1hZ2Vcblx0XHRcdGNvbnN0IHBpbGxJY29uID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbCcsIHt9LCBkb20uJCgnc3Bhbi5jb2RpY29uLmNvZGljb24tZmlsZS1tZWRpYScpKTtcblx0XHRcdHJlcGxhY2VQaWxsKHBpbGxJY29uKTtcblx0XHR9O1xuXHRcdGNvbnN0IGhvdmVyRnVsbE5hbWUgPSBvbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5QYXJ0aWFsID8gbG9jYWxpemUoJ2NoYXQuaW1hZ2VBdHRhY2htZW50V2FybmluZycsIFwiVGhpcyBHSUYgd2FzIHBhcnRpYWxseSBvbWl0dGVkIC0gY3VycmVudCBmcmFtZSB3aWxsIGJlIHNlbnQuXCIpIDogZnVsbE5hbWU7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gY3JlYXRlSW1hZ2VIb3ZlckNvbnRlbnQocmVzb3VyY2UsIGhvdmVyRnVsbE5hbWUsIGJ1ZmZlciwgY2FjaGVLZXksIHVuZGVmaW5lZCwgcmVzb3VyY2UgPyBjbGlja0hhbmRsZXIgOiB1bmRlZmluZWQsICh1cmwsIGlzVGh1bWJuYWlsLCBob3ZlckltYWdlKSA9PiB7XG5cdFx0XHRpZiAoaXNUaHVtYm5haWwpIHtcblx0XHRcdFx0Y29uc3QgcGlsbEltZyA9IGRvbS4kKCdpbWcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LXBpbGwtaW1hZ2UnLCB7IHNyYzogdXJsLCBhbHQ6ICcnIH0pO1xuXHRcdFx0XHRjb25zdCBwaWxsID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtcGlsbCcsIHt9LCBwaWxsSW1nKTtcblx0XHRcdFx0cmVwbGFjZVBpbGwocGlsbCk7XG5cdFx0XHR9XG5cdFx0XHRob3ZlckltYWdlLm9uZXJyb3IgPSBvbkltYWdlRmFpbGVkO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGUuYWRkKGhvdmVyQ29udGVudC5kaXNwb3NhYmxlKTtcblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBob3ZlckNvbnRlbnQuZWxlbWVudDtcblx0XHRob3ZlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHRkaXNwb3NhYmxlLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwge1xuXHRcdFx0Y29udGVudDogaG92ZXJFbGVtZW50LFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9KSk7XG5cblx0XHRpZiAoaXNBdXRvTGFuZ3VhZ2VNb2RlbChjdXJyZW50TGFuZ3VhZ2VNb2RlbCkpIHtcblx0XHRcdGhvdmVyRWxlbWVudC5hcHBlbmRDaGlsZChkb20uJCgnZGl2JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdC5hdXRvSW1hZ2VBdHRhY2htZW50SG92ZXInLCBcIkltYWdlIHN1cHBvcnQgZGVwZW5kcyBvbiB0aGUgbW9kZWwgc2VsZWN0ZWQgYnkgQXV0by5cIikpKTtcblx0XHR9XG5cdH1cblxuXHQvLyBSZW1vdmUgb2xkIERPTSBzbyB0aGUgd2lkZ2V0IGNhbiBzYWZlbHkgcmUtcmVuZGVyIGFmdGVyIGh5ZHJhdGVkIGJ5dGVzIGxvYWQuXG5cdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0Y3VycmVudFBpbGwucmVtb3ZlKCk7XG5cdFx0dGV4dExhYmVsLnJlbW92ZSgpO1xuXHR9KSk7XG5cblx0cmV0dXJuIGRpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBjbGFzcyBQYXN0ZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhdHRhY2htZW50OiBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGF0dGFjaG1lbnQsIG9wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGNvbnRleHQsIHswfVwiLCBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChhcmlhTGFiZWwpO1xuXG5cdFx0Y29uc3QgY2xhc3NOYW1lcyA9IFsnZmlsZS1pY29uJywgYCR7YXR0YWNobWVudC5sYW5ndWFnZX0tbGFuZy1maWxlLWljb25gXTtcblx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChhdHRhY2htZW50LmNvcGllZEZyb20pIHtcblx0XHRcdHJlc291cmNlID0gYXR0YWNobWVudC5jb3BpZWRGcm9tLnVyaTtcblx0XHRcdHJhbmdlID0gYXR0YWNobWVudC5jb3BpZWRGcm9tLnJhbmdlO1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBiYXNlbmFtZShyZXNvdXJjZS5wYXRoKTtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoZmlsZW5hbWUsIHVuZGVmaW5lZCwgeyBleHRyYUNsYXNzZXM6IGNsYXNzTmFtZXMgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoYXR0YWNobWVudC5maWxlTmFtZSwgdW5kZWZpbmVkLCB7IGV4dHJhQ2xhc3NlczogY2xhc3NOYW1lcyB9KTtcblx0XHR9XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmF0dGFjaG1lbnQtYWRkaXRpb25hbC1pbmZvJywge30sIGBQYXN0ZWQgJHthdHRhY2htZW50LnBhc3RlZExpbmVzfWApKTtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cblx0XHRjb25zdCBzb3VyY2VVcmkgPSBhdHRhY2htZW50LmNvcGllZEZyb20/LnVyaTtcblx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7c291cmNlVXJpID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSkuZ2V0VXJpTGFiZWwoc291cmNlVXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pKSA6IGF0dGFjaG1lbnQuZmlsZU5hbWV9XFxuXFxuLS0tXFxuXFxuXFxgXFxgXFxgJHthdHRhY2htZW50Lmxhbmd1YWdlfVxcblxcbiR7YXR0YWNobWVudC5jb2RlfVxcblxcYFxcYFxcYGApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogaG92ZXJDb250ZW50LFxuXHRcdH0sIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXG5cdFx0Y29uc3QgY29waWVkRnJvbVJlc291cmNlID0gYXR0YWNobWVudC5jb3BpZWRGcm9tPy51cmk7XG5cdFx0aWYgKGNvcGllZEZyb21SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUsIHRoaXMuZWxlbWVudCwgY29waWVkRnJvbVJlc291cmNlKSk7XG5cdFx0XHR0aGlzLmFkZFJlc291cmNlT3BlbkhhbmRsZXJzKGNvcGllZEZyb21SZXNvdXJjZSwgcmFuZ2UpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdENoYXRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbHRpcEhvdmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksXG5cdFx0Y29ycmVzcG9uZGluZ0NvbnRlbnRSZWZlcmVuY2U6IElDaGF0Q29udGVudFJlZmVyZW5jZSB8IHVuZGVmaW5lZCxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYXR0YWNobWVudExhYmVsID0gYXR0YWNobWVudC5mdWxsTmFtZSA/PyBhdHRhY2htZW50Lm5hbWU7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBjb3JyZXNwb25kaW5nQ29udGVudFJlZmVyZW5jZT8ub3B0aW9ucz8uc3RhdHVzPy5kZXNjcmlwdGlvbjtcblxuXHRcdC8vIFByb3ZpZGVyLXN1cHBsaWVkIGljb24gcGF0aCAoVGhlbWVJY29uIHwgVXJpIHwgeyBsaWdodCwgZGFyayB9KSBmb3IgY29udGV4dCBpdGVtc1xuXHRcdGNvbnN0IGljb25QYXRoID0gKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdnZW5lcmljJykgPyBhdHRhY2htZW50Lmljb25QYXRoIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fYXBwbHlMYWJlbChhdHRhY2htZW50LCBhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCBpY29uUGF0aCk7XG5cblx0XHQvLyBBIGxpZ2h0L2RhcmsgaWNvbiBtdXN0IGJlIHJlYXBwbGllZCB3aGVuIHRoZSBjb2xvciB0aGVtZSBjaGFuZ2VzIHNvIHRoZSBjb3JyZWN0IHVyaSBpcyB1c2VkXG5cdFx0aWYgKGljb25QYXRoICYmICFUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmICFVUkkuaXNVcmkoaWNvblBhdGgpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fYXBwbHlMYWJlbChhdHRhY2htZW50LCBhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCBpY29uUGF0aCkpKTtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudCcsIFwiQXR0YWNoZWQgY29udGV4dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSkpO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQua2luZCA9PT0gJ2RpYWdub3N0aWMnKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5maWx0ZXJVcmkpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBhdHRhY2htZW50LmZpbHRlclVyaSA/IFVSSS5yZXZpdmUoYXR0YWNobWVudC5maWx0ZXJVcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyYW5nZSA9IGF0dGFjaG1lbnQuZmlsdGVyUmFuZ2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5wYW5lbC5tYXJrZXJzLnZpZXcuZm9jdXMnKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdzeW1ib2wnKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGhvb2tVcFN5bWJvbEF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUsIHRoaXMuZWxlbWVudCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyAuLi5hdHRhY2htZW50LCBraW5kOiBhdHRhY2htZW50LnN5bWJvbEtpbmQgfSwgTWVudUlkLkNoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGNsaWNrIGZvciBzdHJpbmcgY29udGV4dCBhdHRhY2htZW50cyB3aXRoIGNvbnRleHQgY29tbWFuZHNcblx0XHRpZiAoaXNTdHJpbmdWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmIGF0dGFjaG1lbnQuY29tbWFuZElkKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0Y29uc3QgY29udGV4dEl0ZW1IYW5kbGUgPSBhdHRhY2htZW50LmhhbmRsZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRDb250ZXh0U2VydmljZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElDaGF0Q29udGV4dFNlcnZpY2UpKTtcblx0XHRcdFx0YXdhaXQgY2hhdENvbnRleHRTZXJ2aWNlLmV4ZWN1dGVDaGF0Q29udGV4dEl0ZW1Db21tYW5kKGNvbnRleHRJdGVtSGFuZGxlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgY2xpY2sgZm9yIGRlYnVnIGV2ZW50cyBhdHRhY2htZW50c1xuXHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdkZWJ1Z0V2ZW50cycpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkID0gbmV3IERhdGUoYXR0YWNobWVudC5zbmFwc2hvdFRpbWUpO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXIgPSBgYmVmb3JlOiR7ZC5nZXRGdWxsWWVhcigpfS0ke1N0cmluZyhkLmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpfS0ke1N0cmluZyhkLmdldERhdGUoKSkucGFkU3RhcnQoMiwgJzAnKX1UJHtTdHJpbmcoZC5nZXRIb3VycygpKS5wYWRTdGFydCgyLCAnMCcpfToke1N0cmluZyhkLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKX06JHtTdHJpbmcoZC5nZXRTZWNvbmRzKCkpLnBhZFN0YXJ0KDIsICcwJyl9YDtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudERlYnVnUGFuZWxGb3JTZXNzaW9uJywgYXR0YWNobWVudC5zZXNzaW9uUmVzb3VyY2UsIGZpbHRlcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dXAgdG9vbHRpcCBob3ZlciBmb3Igc3RyaW5nIGNvbnRleHQgYXR0YWNobWVudHNcblx0XHRpZiAoKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdnZW5lcmljJykgJiYgYXR0YWNobWVudC50b29sdGlwKSB7XG5cdFx0XHR0aGlzLl9zZXR1cFRvb2x0aXBIb3ZlcihhdHRhY2htZW50LnRvb2x0aXApO1xuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5hZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhyZXNvdXJjZSwgcmFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TGFiZWwoYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgYXR0YWNobWVudExhYmVsOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIGljb25QYXRoOiBDaGF0Q29udGV4dEljb25QYXRoIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSAmJiBpY29uUGF0aCAmJiBUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpICYmIChUaGVtZUljb24uaXNGaWxlKGljb25QYXRoKSB8fCBUaGVtZUljb24uaXNGb2xkZXIoaWNvblBhdGgpKSAmJiBhdHRhY2htZW50LnJlc291cmNlVXJpKSB7XG5cdFx0XHQvLyBEZXJpdmUgaWNvbiBjbGFzc2VzIGZyb20gcmVzb3VyY2VVcmkgZm9yIGZpbGUvZm9sZGVyIHRoZW1lIGljb25zXG5cdFx0XHRjb25zdCBmaWxlS2luZCA9IFRoZW1lSWNvbi5pc0ZvbGRlcihpY29uUGF0aCkgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIGF0dGFjaG1lbnQucmVzb3VyY2VVcmksIGZpbGVLaW5kKTtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoYXR0YWNobWVudExhYmVsLCBkZXNjcmlwdGlvbiwgeyBleHRyYUNsYXNzZXM6IGljb25DbGFzc2VzIH0pO1xuXHRcdH0gZWxzZSBpZiAoaWNvblBhdGgpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkSWNvbiA9IHJlc29sdmVDaGF0Q29udGV4dEljb24oaWNvblBhdGgsIGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkpO1xuXHRcdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChhdHRhY2htZW50TGFiZWwsIGRlc2NyaXB0aW9uLCB7IGljb25QYXRoOiByZXNvbHZlZEljb24gfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHdpdGhJY29uID0gYXR0YWNobWVudC5pY29uPy5pZCA/IGAkKCR7YXR0YWNobWVudC5pY29uLmlkfSlcXHUwMEEwJHthdHRhY2htZW50TGFiZWx9YCA6IGF0dGFjaG1lbnRMYWJlbDtcblx0XHRcdHRoaXMubGFiZWwuc2V0TGFiZWwod2l0aEljb24sIGRlc2NyaXB0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFRvb2x0aXBIb3Zlcih0b29sdGlwOiBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sdGlwSG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdGNvbnRlbnQ6IHRvb2x0aXAsXG5cdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdEZpbGVBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBoaW50RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblxuXHRcdHRoaXMuaGludEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoJ3NwYW4ucHJvbXB0LXR5cGUnKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUxhYmVsKGF0dGFjaG1lbnQpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob29rVXBSZXNvdXJjZUF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3IsIHRoaXMuZWxlbWVudCwgYXR0YWNobWVudC52YWx1ZSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMoYXR0YWNobWVudC52YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFiZWwoYXR0YWNobWVudDogSVByb21wdEZpbGVWYXJpYWJsZUVudHJ5KSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBhdHRhY2htZW50LnZhbHVlO1xuXHRcdGNvbnN0IGZpbGVCYXNlbmFtZSA9IGJhc2VuYW1lKHJlc291cmNlLnBhdGgpO1xuXHRcdGNvbnN0IGZpbGVEaXJuYW1lID0gZGlybmFtZShyZXNvdXJjZS5wYXRoKTtcblx0XHRjb25zdCBmcmllbmRseU5hbWUgPSBgJHtmaWxlQmFzZW5hbWV9ICR7ZmlsZURpcm5hbWV9YDtcblx0XHRjb25zdCBpc1Byb21wdCA9IGF0dGFjaG1lbnQuaWQuc3RhcnRzV2l0aChQcm9tcHRGaWxlVmFyaWFibGVLaW5kLlByb21wdEZpbGUpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGlzUHJvbXB0XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnByb21wdEF0dGFjaG1lbnQnLCBcIlByb21wdCBmaWxlLCB7MH1cIiwgZnJpZW5kbHlOYW1lKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5pbnN0cnVjdGlvbnNBdHRhY2htZW50JywgXCJJbnN0cnVjdGlvbnMgYXR0YWNobWVudCwgezB9XCIsIGZyaWVuZGx5TmFtZSk7XG5cdFx0Y29uc3QgdHlwZUxhYmVsID0gaXNQcm9tcHRcblx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdCcsIFwiUHJvbXB0XCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdpbnN0cnVjdGlvbnMnLCBcIkluc3RydWN0aW9uc1wiKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UpICsgKGF0dGFjaG1lbnQub3JpZ2luTGFiZWwgPyBgXFxuJHthdHRhY2htZW50Lm9yaWdpbkxhYmVsfWAgOiAnJyk7XG5cblx0XHQvL2NvbnN0IHsgdG9wRXJyb3IgfSA9IHRoaXMucHJvbXB0RmlsZTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnd2FybmluZycsICdlcnJvcicpO1xuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHNvbWUgZXJyb3JzL3dhcm5pbmcgZHVyaW5nIHRoZSBwcm9jZXNzIG9mIHJlc29sdmluZ1xuXHRcdC8vIGF0dGFjaG1lbnQgcmVmZXJlbmNlcyAoaW5jbHVkaW5nIGFsbCB0aGUgbmVzdGVkIGNoaWxkIHJlZmVyZW5jZXMpLFxuXHRcdC8vIGFkZCB0aGUgaXNzdWUgZGV0YWlscyBpbiB0aGUgaG92ZXIgdGl0bGUgZm9yIHRoZSBhdHRhY2htZW50LCBvbmVcblx0XHQvLyBlcnJvci93YXJuaW5nIGF0IGEgdGltZSBiZWNhdXNlIHRoZXJlIGlzIGEgbGltaXRlZCBzcGFjZSBhdmFpbGFibGVcblx0XHQvLyBpZiAodG9wRXJyb3IpIHtcblx0XHQvLyBcdGNvbnN0IHsgZXJyb3JTdWJqZWN0OiBzdWJqZWN0IH0gPSB0b3BFcnJvcjtcblx0XHQvLyBcdGNvbnN0IGlzRXJyb3IgPSAoc3ViamVjdCA9PT0gJ3Jvb3QnKTtcblx0XHQvLyBcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKChpc0Vycm9yKSA/ICdlcnJvcicgOiAnd2FybmluZycpO1xuXG5cdFx0Ly8gXHRjb25zdCBzZXZlcml0eSA9IChpc0Vycm9yKVxuXHRcdC8vIFx0XHQ/IGxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3JcIilcblx0XHQvLyBcdFx0OiBsb2NhbGl6ZSgnd2FybmluZycsIFwiV2FybmluZ1wiKTtcblxuXHRcdC8vIFx0dGl0bGUgKz0gYFxcblske3NldmVyaXR5fV06ICR7dG9wRXJyb3IubG9jYWxpemVkTWVzc2FnZX1gO1xuXHRcdC8vIH1cblxuXHRcdGNvbnN0IGZpbGVXaXRob3V0RXh0ZW5zaW9uID0gZ2V0Q2xlYW5Qcm9tcHROYW1lKHJlc291cmNlKTtcblx0XHR0aGlzLmxhYmVsLnNldEZpbGUoVVJJLmZpbGUoZmlsZVdpdGhvdXRFeHRlbnNpb24pLCB7XG5cdFx0XHRmaWxlS2luZDogRmlsZUtpbmQuRklMRSxcblx0XHRcdGhpZGVQYXRoOiB0cnVlLFxuXHRcdFx0cmFuZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmJvb2ttYXJrLmlkKSxcblx0XHRcdGV4dHJhQ2xhc3NlczogW10sXG5cdFx0fSk7XG5cblx0XHR0aGlzLmhpbnRFbGVtZW50LmlubmVyVGV4dCA9IHR5cGVMYWJlbDtcblxuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGFyaWFMYWJlbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdFRleHRBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVByb21wdFRleHRWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyLCBjb250ZXh0UmVzb3VyY2VMYWJlbHMsIGN1cnJlbnRMYW5ndWFnZU1vZGVsLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQuc2V0dGluZ0lkKSB7XG5cdFx0XHRjb25zdCBvcGVuU2V0dGluZ3MgPSAoKSA9PiBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiBgQGlkOiR7YXR0YWNobWVudC5zZXR0aW5nSWR9YCB9KTtcblxuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBhc3luYyAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0b3BlblNldHRpbmdzKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBhc3luYyAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0b3BlblNldHRpbmdzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zLmxhYmVsJywgJ0FkZGl0aW9uYWwgSW5zdHJ1Y3Rpb25zJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudCcsIFwiQXR0YWNoZWQgY29udGV4dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogYXR0YWNobWVudC52YWx1ZSxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBUb29sU2V0T3JUb29sSXRlbUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblxuXHRcdGNvbnN0IHRvb2xPclRvb2xTZXQgPSBJdGVyYWJsZS5maW5kKHRvb2xzU2VydmljZS5nZXRUb29scyhjdXJyZW50TGFuZ3VhZ2VNb2RlbD8ubWV0YWRhdGEpLCB0b29sID0+IHRvb2wuaWQgPT09IGF0dGFjaG1lbnQuaWQpID8/IEl0ZXJhYmxlLmZpbmQodG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRzRm9yTW9kZWwoY3VycmVudExhbmd1YWdlTW9kZWw/Lm1ldGFkYXRhKSwgdG9vbFNldCA9PiB0b29sU2V0LmlkID09PSBhdHRhY2htZW50LmlkKTtcblxuXHRcdGxldCBuYW1lID0gYXR0YWNobWVudC5uYW1lO1xuXHRcdGNvbnN0IGljb24gPSBhdHRhY2htZW50Lmljb24gPz8gQ29kaWNvbi50b29scztcblxuXHRcdGlmIChpc1Rvb2xTZXQodG9vbE9yVG9vbFNldCkpIHtcblx0XHRcdG5hbWUgPSB0b29sT3JUb29sU2V0LnJlZmVyZW5jZU5hbWU7XG5cdFx0fSBlbHNlIGlmICh0b29sT3JUb29sU2V0KSB7XG5cdFx0XHRuYW1lID0gdG9vbE9yVG9vbFNldC50b29sUmVmZXJlbmNlTmFtZSA/PyBuYW1lO1xuXHRcdH1cblxuXHRcdHRoaXMubGFiZWwuc2V0TGFiZWwoYCQoJHtpY29uLmlkfSlcXHUwMEEwJHtuYW1lfWAsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50JywgXCJBdHRhY2hlZCBjb250ZXh0LCB7MH1cIiwgbmFtZSkpO1xuXG5cdFx0bGV0IGhvdmVyQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlzVG9vbFNldCh0b29sT3JUb29sU2V0KSkge1xuXHRcdFx0aG92ZXJDb250ZW50ID0gbG9jYWxpemUoJ3Rvb2xzZXQnLCBcInswfSAtIHsxfVwiLCB0b29sT3JUb29sU2V0LmRlc2NyaXB0aW9uID8/IHRvb2xPclRvb2xTZXQucmVmZXJlbmNlTmFtZSwgdG9vbE9yVG9vbFNldC5zb3VyY2UubGFiZWwpO1xuXHRcdH0gZWxzZSBpZiAodG9vbE9yVG9vbFNldCkge1xuXHRcdFx0aG92ZXJDb250ZW50ID0gbG9jYWxpemUoJ3Rvb2wnLCBcInswfSAtIHsxfVwiLCB0b29sT3JUb29sU2V0LnVzZXJEZXNjcmlwdGlvbiA/PyB0b29sT3JUb29sU2V0Lm1vZGVsRGVzY3JpcHRpb24sIHRvb2xPclRvb2xTZXQuc291cmNlLmxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAoaG92ZXJDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29udGVudDogaG92ZXJDb250ZW50LFxuXHRcdFx0fSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmVuZGVycyBhbiBhZ2VudC1ob3N0IHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSBjaGF0LXJlZmVyZW5jZX1cbiAqIGF0dGFjaG1lbnQgKGAjY2hhdDo8dGl0bGU+YCkgYXMgYSBjbGlja2FibGUgY2hpcC4gQ2xpY2tpbmcgKG9yIHByZXNzaW5nXG4gKiBFbnRlci9TcGFjZSkgb3BlbnMgdGhlIHJlZmVyZW5jZWQgY2hhdCBpbiB0aGUgQWdlbnRzIHdpbmRvdyBieSBoYW5kaW5nIGFuXG4gKiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBsaW5rIHRvIHRoZSB7QGxpbmsgSU9wZW5lclNlcnZpY2V9LiBXaGVuIHRoZSBsaW5rXG4gKiBjYW5ub3QgYmUgYnVpbHQgb3IgdGhlIG9wZW5lciBkZWNsaW5lcyBpdCAoZS5nLiB0aGUgY2hhdCB3YXMgZGVsZXRlZCBvciBsaXZlc1xuICogaW4gYW5vdGhlciB3aW5kb3cpIHRoZSBjaGlwIGRlZ3JhZGVzIGdyYWNlZnVsbHkgYW5kIHN0aWxsIHJlbmRlcnMgaXRzIGxhYmVsLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCB0aXRsZSA9IGF0dGFjaG1lbnQubmFtZTtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBhdHRhY2htZW50LnZhbHVlO1xuXG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChgJCgke0NvZGljb24uY29tbWVudERpc2N1c3Npb24uaWR9KVxcdTAwQTAke3RpdGxlfWAsIHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LmNoYXRSZWZlcmVuY2UnLCBcIkxpbmsgdG8gY2hhdCB7MH1cIiwgdGl0bGUpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmVsZW1lbnQsIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQuY2hhdFJlZmVyZW5jZS5ob3ZlcicsIFwiT3BlbiBjaGF0IFxcXCJ7MH1cXFwiXCIsIHRpdGxlKSxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9vcGVuUmVmZXJlbmNlZENoYXQoY2hhdFJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9vcGVuUmVmZXJlbmNlZENoYXQoY2hhdFJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vcGVuUmVmZXJlbmNlZENoYXQoY2hhdFJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsaW5rID0gYnVpbGRPcGVuU2Vzc2lvbkxpbmtGb3JDaGF0UmVzb3VyY2UoY2hhdFJlc291cmNlKTtcblx0XHRpZiAoIWxpbmspIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIG9wZW5lciByZXR1cm5zIGZhbHNlIHdoZW4gdGhlIGxpbmsgY2Fubm90IGJlIHJlc29sdmVkIChlLmcuIHRoZVxuXHRcdC8vIHJlZmVyZW5jZWQgY2hhdCB3YXMgZGVsZXRlZCBvciBiZWxvbmdzIHRvIGEgZGlmZmVyZW50IHdpbmRvdykuIERlZ3JhZGVcblx0XHQvLyBncmFjZWZ1bGx5IGluIHRoYXQgY2FzZSBcdTIwMTQgdGhlIGNoaXAgc3RheXMgYnV0IG5vIGVycm9yIGRpYWxvZyBpcyBzaG93bi5cblx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihsaW5rKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsT3V0cHV0Q2hhdEF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRzd2l0Y2ggKGF0dGFjaG1lbnQubWltZVR5cGUpIHtcblx0XHRcdGNhc2UgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLmVycm9yJzoge1xuXHRcdFx0XHR0aGlzLnJlbmRlckVycm9yT3V0cHV0KHJlc291cmNlLCBhdHRhY2htZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbWFnZS9wbmcnOlxuXHRcdFx0Y2FzZSAnaW1hZ2UvanBlZyc6XG5cdFx0XHRjYXNlICdpbWFnZS9zdmcnOiB7XG5cdFx0XHRcdHRoaXMucmVuZGVySW1hZ2VPdXRwdXQocmVzb3VyY2UsIGF0dGFjaG1lbnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0dGhpcy5yZW5kZXJHZW5lcmljT3V0cHV0KHJlc291cmNlLCBhdHRhY2htZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGhvb2tVcFJlc291cmNlQXR0YWNobWVudERyYWdBbmRDb250ZXh0TWVudShhY2Nlc3NvciwgdGhpcy5lbGVtZW50LCByZXNvdXJjZSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMocmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdH1cblx0Z2V0QXJpYUxhYmVsKGF0dGFjaG1lbnQ6IElOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnkpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5Ob3RlYm9va0ltYWdlQXR0YWNobWVudCcsIFwiQXR0YWNoZWQgTm90ZWJvb2sgb3V0cHV0LCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0fVxuXHRwcml2YXRlIHJlbmRlckVycm9yT3V0cHV0KHJlc291cmNlOiBVUkksIGF0dGFjaG1lbnQ6IElOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnkpIHtcblx0XHRjb25zdCBhdHRhY2htZW50TGFiZWwgPSBhdHRhY2htZW50Lm5hbWU7XG5cdFx0Y29uc3Qgd2l0aEljb24gPSBhdHRhY2htZW50Lmljb24/LmlkID8gYCQoJHthdHRhY2htZW50Lmljb24uaWR9KVxcdTAwQTAke2F0dGFjaG1lbnRMYWJlbH1gIDogYXR0YWNobWVudExhYmVsO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuZ2V0T3V0cHV0SXRlbShyZXNvdXJjZSwgYXR0YWNobWVudCk/LmRhdGEuYnVmZmVyID8/IG5ldyBVaW50OEFycmF5KCk7XG5cdFx0bGV0IHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVycm9yID0gSlNPTi5wYXJzZShuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYnVmZmVyKSkgYXMgRXJyb3I7XG5cdFx0XHRpZiAoZXJyb3IubmFtZSAmJiBlcnJvci5tZXNzYWdlKSB7XG5cdFx0XHRcdHRpdGxlID0gYCR7ZXJyb3IubmFtZX06ICR7ZXJyb3IubWVzc2FnZX1gO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly9cblx0XHR9XG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbCh3aXRoSWNvbiwgdW5kZWZpbmVkLCB7IHRpdGxlIH0pO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludCh0aGlzLmdldEFyaWFMYWJlbChhdHRhY2htZW50KSk7XG5cdH1cblx0cHJpdmF0ZSByZW5kZXJHZW5lcmljT3V0cHV0KHJlc291cmNlOiBVUkksIGF0dGFjaG1lbnQ6IElOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnkpIHtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQodGhpcy5nZXRBcmlhTGFiZWwoYXR0YWNobWVudCkpO1xuXHRcdHRoaXMubGFiZWwuc2V0RmlsZShyZXNvdXJjZSwgeyBoaWRlUGF0aDogdHJ1ZSwgaWNvbjogVGhlbWVJY29uLmZyb21JZCgnb3V0cHV0JykgfSk7XG5cdH1cblx0cHJpdmF0ZSByZW5kZXJJbWFnZU91dHB1dChyZXNvdXJjZTogVVJJLCBhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KSB7XG5cdFx0bGV0IGFyaWFMYWJlbDogc3RyaW5nO1xuXHRcdGlmIChhdHRhY2htZW50Lm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkZ1bGwpIHtcblx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0Lm9taXR0ZWROb3RlYm9va0ltYWdlQXR0YWNobWVudCcsIFwiT21pdHRlZCB0aGlzIE5vdGVib29rIG91cHV0OiB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR9IGVsc2UgaWYgKGF0dGFjaG1lbnQub21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuUGFydGlhbCkge1xuXHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ2NoYXQucGFydGlhbGx5T21pdHRlZE5vdGVib29rSW1hZ2VBdHRhY2htZW50JywgXCJQYXJ0aWFsbHkgb21pdHRlZCB0aGlzIE5vdGVib29rIG91dHB1dDogezB9XCIsIGF0dGFjaG1lbnQubmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyaWFMYWJlbCA9IHRoaXMuZ2V0QXJpYUxhYmVsKGF0dGFjaG1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsaWNrSGFuZGxlciA9IGFzeW5jICgpID0+IGF3YWl0IHRoaXMub3BlblJlc291cmNlKHJlc291cmNlLCB7IGVkaXRvck9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0sIGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGN1cnJlbnRMYW5ndWFnZU1vZGVsTmFtZSA9IHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKHRoaXMuY3VycmVudExhbmd1YWdlTW9kZWwuaWRlbnRpZmllcik/Lm5hbWUgPz8gdGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbC5pZGVudGlmaWVyIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuZ2V0T3V0cHV0SXRlbShyZXNvdXJjZSwgYXR0YWNobWVudCk/LmRhdGEuYnVmZmVyID8/IG5ldyBVaW50OEFycmF5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW1hZ2VFbGVtZW50cyhyZXNvdXJjZSwgYXR0YWNobWVudC5uYW1lLCBhdHRhY2htZW50Lm5hbWUsIHRoaXMuZWxlbWVudCwgYnVmZmVyLCBhdHRhY2htZW50LmlkLCB0aGlzLmhvdmVyU2VydmljZSwgYXJpYUxhYmVsLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbE5hbWUsIGNsaWNrSGFuZGxlciwgdGhpcy5jdXJyZW50TGFuZ3VhZ2VNb2RlbCwgYXR0YWNobWVudC5vbWl0dGVkU3RhdGUpKTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQoYXJpYUxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3V0cHV0SXRlbShyZXNvdXJjZTogVVJJLCBhdHRhY2htZW50OiBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KSB7XG5cdFx0Y29uc3QgcGFyc2VkSW5mbyA9IENlbGxVcmkucGFyc2VDZWxsT3V0cHV0VXJpKHJlc291cmNlKTtcblx0XHRpZiAoIXBhcnNlZEluZm8gfHwgdHlwZW9mIHBhcnNlZEluZm8uY2VsbEhhbmRsZSAhPT0gJ251bWJlcicgfHwgdHlwZW9mIHBhcnNlZEluZm8ub3V0cHV0SW5kZXggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBub3RlYm9vayA9IHRoaXMubm90ZWJvb2tTZXJ2aWNlLmdldE5vdGVib29rVGV4dE1vZGVsKHBhcnNlZEluZm8ubm90ZWJvb2spO1xuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNlbGwgPSBub3RlYm9vay5jZWxscy5maW5kKGMgPT4gYy5oYW5kbGUgPT09IHBhcnNlZEluZm8uY2VsbEhhbmRsZSk7XG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBvdXRwdXQgPSBjZWxsLm91dHB1dHMubGVuZ3RoID4gcGFyc2VkSW5mby5vdXRwdXRJbmRleCA/IGNlbGwub3V0cHV0c1twYXJzZWRJbmZvLm91dHB1dEluZGV4XSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gb3V0cHV0Py5vdXRwdXRzLmZpbmQobyA9PiBvLm1pbWUgPT09IGF0dGFjaG1lbnQubWltZVR5cGUpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRDaGF0QXR0YWNobWVudFdpZGdldCBleHRlbmRzIEFic3RyYWN0Q2hhdEF0dGFjaG1lbnRXaWRnZXQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2U6IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGF0dGFjaG1lbnQsIG9wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0LmVsZW1lbnRBdHRhY2htZW50JywgXCJBdHRhY2hlZCBlbGVtZW50LCB7MH1cIiwgYXR0YWNobWVudC5uYW1lKTtcblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQoYXJpYUxhYmVsKTtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRjb25zdCBhdHRhY2htZW50TGFiZWwgPSBhdHRhY2htZW50Lm5hbWU7XG5cdFx0Y29uc3Qgd2l0aEljb24gPSBhdHRhY2htZW50Lmljb24/LmlkID8gYCQoJHthdHRhY2htZW50Lmljb24uaWR9KVxcdTAwQTAke2F0dGFjaG1lbnRMYWJlbH1gIDogYXR0YWNobWVudExhYmVsO1xuXHRcdHRoaXMubGFiZWwuc2V0TGFiZWwod2l0aEljb24pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5lbGVtZW50LCB0aGlzLmdldEhvdmVyQ29udGVudChhdHRhY2htZW50KSwgY29tbW9uSG92ZXJMaWZlY3ljbGVPcHRpb25zKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck9wZW5FZGl0b3JMaXN0ZW5lcnModGhpcy5lbGVtZW50LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5FbGVtZW50QXR0YWNobWVudChhdHRhY2htZW50KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvdmVyQ29udGVudChhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnkpOiBJRGVsYXllZEhvdmVyT3B0aW9ucyB7XG5cdFx0aWYgKCF0aGlzLnNob3VsZFJlbmRlclJpY2hFbGVtZW50SG92ZXIoYXR0YWNobWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNpbXBsZUhvdmVyQ29udGVudChhdHRhY2htZW50KTtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBkb20uJCgnZGl2LmNoYXQtYXR0YWNoZWQtY29udGV4dC1ob3Zlci5jaGF0LWVsZW1lbnQtaG92ZXInKTtcblxuXHRcdC8vIFdyYXAgYWxsIHNlY3Rpb25zIGluIGEgc2Nyb2xsYWJsZSBjb250YWluZXIgZm9yIFZTIENvZGUgc3R5bGVkIHNjcm9sbGJhclxuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItY29udGVudCcpO1xuXHRcdGNvbnN0IGlubmVyU2Nyb2xsYWJsZXM6IERvbVNjcm9sbGFibGVFbGVtZW50W10gPSBbXTtcblxuXHRcdGlmIChhdHRhY2htZW50LmltYWdlRGF0YSkge1xuXHRcdFx0dGhpcy5hcHBlbmRJbWFnZVByZXZpZXcoYXR0YWNobWVudCwgc2Nyb2xsYWJsZUNvbnRlbnQsICgpID0+IHNjcm9sbGFibGVFbGVtZW50LnNjYW5Eb21Ob2RlKCkpO1xuXHRcdH1cblxuXHRcdC8vIEVMRU1FTlQgc2VjdGlvbjogc2hvdyB0aGUgc2VsZWN0ZWQgZWxlbWVudCB0YWcgd2l0aCBhbGwgYXR0cmlidXRlc1xuXHRcdHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1oZWFkZXInLCB7fSwgbG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLmVsZW1lbnQnLCBcIkVMRU1FTlRcIikpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWxlbWVudFByZSA9IGRvbS4kKCdwcmUuY2hhdC1lbGVtZW50LWhvdmVyLWNvZGUnKTtcblx0XHRcdGNvbnN0IGVsZW1lbnRDb2RlID0gZG9tLiQoJ2NvZGUnKTtcblx0XHRcdC8vIEJ1aWxkIHRoZSBlbGVtZW50IHRhZyBmcm9tIHRoZSBvdXRlckhUTUwgKGp1c3QgdGhlIG9wZW5pbmcgdGFnKVxuXHRcdFx0Y29uc3QgdGFnRGlzcGxheSA9IHRoaXMuZm9ybWF0RWxlbWVudFRhZyhhdHRhY2htZW50KTtcblx0XHRcdGVsZW1lbnRDb2RlLnRleHRDb250ZW50ID0gdGFnRGlzcGxheTtcblx0XHRcdGVsZW1lbnRQcmUuYXBwZW5kQ2hpbGQoZWxlbWVudENvZGUpO1xuXHRcdFx0Y29uc3QgZWxlbWVudFNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoZWxlbWVudFByZSwge1xuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdH0pKTtcblx0XHRcdGlubmVyU2Nyb2xsYWJsZXMucHVzaChlbGVtZW50U2Nyb2xsYWJsZSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGVsZW1lbnRTY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBLRVkgQ09NUFVURUQgU1RZTEVTIHNlY3Rpb25cblx0XHRjb25zdCBjb21wdXRlZFN0eWxlRW50cmllcyA9IHRoaXMuZ2V0Q29tcHV0ZWRTdHlsZUVudHJpZXNGb3JIb3ZlcihhdHRhY2htZW50LmNvbXB1dGVkU3R5bGVzKTtcblx0XHRpZiAoY29tcHV0ZWRTdHlsZUVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IGhlYWRlciA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWhlYWRlcicsIHt9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuY29tcHV0ZWRTdHlsZXMnLCBcIktFWSBDT01QVVRFRCBTVFlMRVNcIikpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXHRcdFx0Y29uc3QgdGFibGUgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci10YWJsZScpO1xuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIGNvbXB1dGVkU3R5bGVFbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXJvdycpO1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoZG9tLiQoJ3NwYW4uY2hhdC1lbGVtZW50LWhvdmVyLWxhYmVsJywge30sIGAke25hbWV9OmApKTtcblx0XHRcdFx0Y29uc3QgdmFsdWVDb250YWluZXIgPSBkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItdmFsdWUnKTtcblx0XHRcdFx0Ly8gU2hvdyBjb2xvciBzd2F0Y2ggZm9yIGNvbG9yIHByb3BlcnRpZXNcblx0XHRcdFx0aWYgKChuYW1lID09PSAnY29sb3InIHx8IG5hbWUgPT09ICdiYWNrZ3JvdW5kLWNvbG9yJykgJiYgdmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBzd2F0Y2ggPSBkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItY29sb3Itc3dhdGNoJyk7XG5cdFx0XHRcdFx0c3dhdGNoLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHZhbHVlO1xuXHRcdFx0XHRcdHZhbHVlQ29udGFpbmVyLmFwcGVuZENoaWxkKHN3YXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFsdWVDb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodmFsdWUpKTtcblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKHZhbHVlQ29udGFpbmVyKTtcblx0XHRcdFx0dGFibGUuYXBwZW5kQ2hpbGQocm93KTtcblx0XHRcdH1cblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQodGFibGUpO1xuXHRcdFx0Y29uc3Qgc2hvd01vcmVCdXR0b24gPSBkb20uJCgnYnV0dG9uLmNoYXQtZWxlbWVudC1ob3Zlci1zaG93LW1vcmUnLCB7IHR5cGU6ICdidXR0b24nIH0sIGxvY2FsaXplKCdjaGF0LmVsZW1lbnRIb3Zlci5zaG93TW9yZScsIFwiU2hvdyBNb3JlLi4uXCIpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd01vcmVCdXR0b24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuRWxlbWVudEF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHNob3dNb3JlQnV0dG9uKTtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIEhUTUwgUEFUSCBzZWN0aW9uOiByZW5kZXIgYW5jZXN0b3IgY2hhaW4gYXMgaW5kZW50ZWQgSFRNTCB0cmVlXG5cdFx0aWYgKGF0dGFjaG1lbnQuYW5jZXN0b3JzICYmIGF0dGFjaG1lbnQuYW5jZXN0b3JzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHNlY3Rpb24gPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1zZWN0aW9uJyk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1oZWFkZXInLCB7fSwgbG9jYWxpemUoJ2NoYXQuZWxlbWVudEhvdmVyLmh0bWxQYXRoJywgXCJIVE1MIFBBVEhcIikpO1xuXHRcdFx0c2VjdGlvbi5hcHBlbmRDaGlsZChoZWFkZXIpO1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGF0dGFjaG1lbnQuYW5jZXN0b3JzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGFuY2VzdG9yID0gYXR0YWNobWVudC5hbmNlc3RvcnNbaV07XG5cdFx0XHRcdGNvbnN0IGluZGVudCA9ICcgICcucmVwZWF0KGkpO1xuXHRcdFx0XHRjb25zdCB0YWcgPSB0aGlzLmZvcm1hdEFuY2VzdG9yVGFnKGFuY2VzdG9yKTtcblx0XHRcdFx0bGluZXMucHVzaChgJHtpbmRlbnR9JHt0YWd9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXRoUHJlID0gZG9tLiQoJ3ByZS5jaGF0LWVsZW1lbnQtaG92ZXItY29kZScpO1xuXHRcdFx0Y29uc3QgcGF0aENvZGUgPSBkb20uJCgnY29kZScpO1xuXHRcdFx0cGF0aENvZGUudGV4dENvbnRlbnQgPSBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHRcdHBhdGhQcmUuYXBwZW5kQ2hpbGQocGF0aENvZGUpO1xuXHRcdFx0Y29uc3QgcGF0aFNjcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQocGF0aFByZSwge1xuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdH0pKTtcblx0XHRcdGlubmVyU2Nyb2xsYWJsZXMucHVzaChwYXRoU2Nyb2xsYWJsZSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHBhdGhTY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5hcHBlbmRDaGlsZChzZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBBVFRSSUJVVEVTIHNlY3Rpb25cblx0XHRpZiAoYXR0YWNobWVudC5hdHRyaWJ1dGVzICYmIE9iamVjdC5rZXlzKGF0dGFjaG1lbnQuYXR0cmlidXRlcykubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IGhlYWRlciA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWhlYWRlcicsIHt9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuYXR0cmlidXRlcycsIFwiQVRUUklCVVRFU1wiKSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cdFx0XHRjb25zdCB0YWJsZSA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXRhYmxlJyk7XG5cdFx0XHRmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoYXR0YWNobWVudC5hdHRyaWJ1dGVzKSkge1xuXHRcdFx0XHRjb25zdCByb3cgPSBkb20uJCgnZGl2LmNoYXQtZWxlbWVudC1ob3Zlci1yb3cnKTtcblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtZWxlbWVudC1ob3Zlci1sYWJlbCcsIHt9LCBgJHtuYW1lfTpgKSk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItdmFsdWUnLCB7fSwgdmFsdWUpKTtcblx0XHRcdFx0dGFibGUuYXBwZW5kQ2hpbGQocm93KTtcblx0XHRcdH1cblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQodGFibGUpO1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gUE9TSVRJT04gJiBTSVpFIHNlY3Rpb25cblx0XHRpZiAoYXR0YWNobWVudC5kaW1lbnNpb25zKSB7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItc2VjdGlvbicpO1xuXHRcdFx0Y29uc3QgaGVhZGVyID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItaGVhZGVyJywge30sIGxvY2FsaXplKCdjaGF0LmVsZW1lbnRIb3Zlci5wb3NpdGlvblNpemUnLCBcIlBPU0lUSU9OICYgU0laRVwiKSk7XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKGhlYWRlcik7XG5cdFx0XHRjb25zdCB0YWJsZSA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXRhYmxlJyk7XG5cdFx0XHRjb25zdCBkaW1zOiBbc3RyaW5nLCBudW1iZXJdW10gPSBbXG5cdFx0XHRcdFsndG9wOicsIGF0dGFjaG1lbnQuZGltZW5zaW9ucy50b3BdLFxuXHRcdFx0XHRbJ2xlZnQ6JywgYXR0YWNobWVudC5kaW1lbnNpb25zLmxlZnRdLFxuXHRcdFx0XHRbJ3dpZHRoOicsIGF0dGFjaG1lbnQuZGltZW5zaW9ucy53aWR0aF0sXG5cdFx0XHRcdFsnaGVpZ2h0OicsIGF0dGFjaG1lbnQuZGltZW5zaW9ucy5oZWlnaHRdLFxuXHRcdFx0XTtcblx0XHRcdGZvciAoY29uc3QgW2xhYmVsLCB2YWxdIG9mIGRpbXMpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItcm93Jyk7XG5cdFx0XHRcdHJvdy5hcHBlbmRDaGlsZChkb20uJCgnc3Bhbi5jaGF0LWVsZW1lbnQtaG92ZXItbGFiZWwnLCB7fSwgbGFiZWwpKTtcblx0XHRcdFx0cm93LmFwcGVuZENoaWxkKGRvbS4kKCdzcGFuLmNoYXQtZWxlbWVudC1ob3Zlci12YWx1ZScsIHt9LCBgJHtNYXRoLnJvdW5kKHZhbCl9cHhgKSk7XG5cdFx0XHRcdHRhYmxlLmFwcGVuZENoaWxkKHJvdyk7XG5cdFx0XHR9XG5cdFx0XHRzZWN0aW9uLmFwcGVuZENoaWxkKHRhYmxlKTtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIElOTkVSIFRFWFQgc2VjdGlvblxuXHRcdGlmIChhdHRhY2htZW50LmlubmVyVGV4dCkge1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLXNlY3Rpb24nKTtcblx0XHRcdGNvbnN0IGhlYWRlciA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWhlYWRlcicsIHt9LCBsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuaW5uZXJUZXh0JywgXCJJTk5FUiBURVhUXCIpKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItdGV4dCcsIHt9LCBhdHRhY2htZW50LmlubmVyVGV4dCkpO1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuYXBwZW5kQ2hpbGQoc2VjdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoc2Nyb2xsYWJsZUNvbnRlbnQsIHtcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdGNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZDogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSBzY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0c2Nyb2xsYWJsZURvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1lbGVtZW50LWhvdmVyLXNjcm9sbGFibGUnKTtcblx0XHRob3ZlckVsZW1lbnQuYXBwZW5kQ2hpbGQoc2Nyb2xsYWJsZURvbU5vZGUpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGhvdmVyRWxlbWVudCxcblx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2NoYXQtZWxlbWVudC1kYXRhLWhvdmVyJ10sXG5cdFx0XHRvbkRpZFNob3c6ICgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIGlubmVyU2Nyb2xsYWJsZXMpIHtcblx0XHRcdFx0XHRzLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Nyb2xsYWJsZUVsZW1lbnQuc2NhbkRvbU5vZGUoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkUmVuZGVyUmljaEVsZW1lbnRIb3ZlcihhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnkpOiBib29sZWFuIHtcblx0XHRpZiAoYXR0YWNobWVudC5kaW1lbnNpb25zIHx8IGF0dGFjaG1lbnQuaW5uZXJUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoYXR0YWNobWVudC5hbmNlc3RvcnMgJiYgYXR0YWNobWVudC5hbmNlc3RvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGF0dGFjaG1lbnQuYXR0cmlidXRlcyAmJiBPYmplY3Qua2V5cyhhdHRhY2htZW50LmF0dHJpYnV0ZXMpLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChhdHRhY2htZW50LmNvbXB1dGVkU3R5bGVzICYmIE9iamVjdC5rZXlzKGF0dGFjaG1lbnQuY29tcHV0ZWRTdHlsZXMpLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kSW1hZ2VQcmV2aWV3KGF0dGFjaG1lbnQ6IElFbGVtZW50VmFyaWFibGVFbnRyeSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb25Db250ZW50c0NoYW5nZWQ6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBzZWN0aW9uID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItc2VjdGlvbi5jaGF0LWVsZW1lbnQtaG92ZXItc2NyZWVuc2hvdCcpO1xuXHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQoZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItaGVhZGVyJywge30sIGxvY2FsaXplKCdjaGF0LmVsZW1lbnRIb3Zlci5zY3JlZW5zaG90JywgXCJTQ1JFRU5TSE9UXCIpKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlY3Rpb24pO1xuXG5cdFx0Y29uc3QgcHJldmlld0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBhcHBlbmRQcmV2aWV3ID0gKGRhdGE6IFVpbnQ4QXJyYXkpID0+IHtcblx0XHRcdGlmIChwcmV2aWV3RGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5pc1VyaShhdHRhY2htZW50LmltYWdlRGF0YSlcblx0XHRcdFx0PyBhdHRhY2htZW50LmltYWdlRGF0YVxuXHRcdFx0XHQ6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmRhdGEsIHBhdGg6IGAke2F0dGFjaG1lbnQuaWR9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KGF0dGFjaG1lbnQubmFtZSl9YCB9KTtcblx0XHRcdGNvbnN0IGNsaWNrSGFuZGxlciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpXG5cdFx0XHRcdD8gYXN5bmMgKCkgPT4gdGhpcy5jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2Uub3BlbkNhcm91c2VsQXRSZXNvdXJjZShyZXNvdXJjZSwgZGF0YSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcmV2aWV3ID0gY3JlYXRlSW1hZ2VIb3ZlckNvbnRlbnQoXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0YXR0YWNobWVudC5uYW1lLFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0XHRgJHthdHRhY2htZW50LmlkfTpzY3JlZW5zaG90YCxcblx0XHRcdFx0b25Db250ZW50c0NoYW5nZWQsXG5cdFx0XHRcdGNsaWNrSGFuZGxlcixcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC5lbGVtZW50SG92ZXIuc2NyZWVuc2hvdEFsdCcsIFwiU2NyZWVuc2hvdCBvZiBhdHRhY2hlZCBlbGVtZW50IHswfVwiLCBhdHRhY2htZW50Lm5hbWUpLFxuXHRcdFx0KTtcblx0XHRcdHByZXZpZXdEaXNwb3NhYmxlcy5hZGQocHJldmlldy5kaXNwb3NhYmxlKTtcblx0XHRcdHNlY3Rpb24uYXBwZW5kQ2hpbGQocHJldmlldy5lbGVtZW50KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5saW5lRGF0YSA9IGNvZXJjZUltYWdlQnVmZmVyKGF0dGFjaG1lbnQuaW1hZ2VEYXRhKTtcblx0XHRpZiAoaW5saW5lRGF0YSkge1xuXHRcdFx0YXBwZW5kUHJldmlldyhpbmxpbmVEYXRhKTtcblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShhdHRhY2htZW50LmltYWdlRGF0YSkpIHtcblx0XHRcdHZvaWQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShhdHRhY2htZW50LmltYWdlRGF0YSkudGhlbihcblx0XHRcdFx0Y29udGVudCA9PiBhcHBlbmRQcmV2aWV3KGNvbnRlbnQudmFsdWUuYnVmZmVyKSxcblx0XHRcdFx0ZXJyb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbRWxlbWVudENoYXRBdHRhY2htZW50V2lkZ2V0XSBGYWlsZWQgdG8gcmVhZCBzY3JlZW5zaG90ICcke2F0dGFjaG1lbnQuaW1hZ2VEYXRhfSc6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0XHRcdHNlY3Rpb24ucmVtb3ZlKCk7XG5cdFx0XHRcdFx0b25Db250ZW50c0NoYW5nZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFNpbXBsZUhvdmVyQ29udGVudChhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnkpOiBJRGVsYXllZEhvdmVyT3B0aW9ucyB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF0dGFjaG1lbnQudmFsdWU/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0aG92ZXJDb250ZW50LmFwcGVuZFRleHQoYXR0YWNobWVudC5mdWxsTmFtZSA/PyBhdHRhY2htZW50Lm5hbWUpO1xuXHRcdGlmIChjb250ZW50LnRyaW0oKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRob3ZlckNvbnRlbnQuYXBwZW5kTWFya2Rvd24oJ1xcblxcbicpO1xuXHRcdFx0aG92ZXJDb250ZW50LmFwcGVuZENvZGVibG9jaygndGV4dCcsIGNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdGlmIChhdHRhY2htZW50LmltYWdlRGF0YSkge1xuXHRcdFx0Y29uc3QgaG92ZXJFbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGF0LWF0dGFjaGVkLWNvbnRleHQtaG92ZXIuY2hhdC1lbGVtZW50LWhvdmVyJyk7XG5cdFx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IGRvbS4kKCdkaXYuY2hhdC1lbGVtZW50LWhvdmVyLWNvbnRlbnQnKTtcblx0XHRcdHRoaXMuYXBwZW5kSW1hZ2VQcmV2aWV3KGF0dGFjaG1lbnQsIHNjcm9sbGFibGVDb250ZW50LCAoKSA9PiBzY3JvbGxhYmxlRWxlbWVudC5zY2FuRG9tTm9kZSgpKTtcblxuXHRcdFx0Y29uc3QgbWFya2Rvd25TZWN0aW9uID0gZG9tLiQoJ2Rpdi5jaGF0LWVsZW1lbnQtaG92ZXItc2VjdGlvbicpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGhvdmVyQ29udGVudCkpO1xuXHRcdFx0bWFya2Rvd25TZWN0aW9uLmFwcGVuZENoaWxkKHJlbmRlcmVkTWFya2Rvd24uZWxlbWVudCk7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5hcHBlbmRDaGlsZChtYXJrZG93blNlY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBzY3JvbGxhYmxlRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChzY3JvbGxhYmxlQ29udGVudCwge1xuXHRcdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSBzY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0XHRzY3JvbGxhYmxlRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LWVsZW1lbnQtaG92ZXItc2Nyb2xsYWJsZScpO1xuXHRcdFx0aG92ZXJFbGVtZW50LmFwcGVuZENoaWxkKHNjcm9sbGFibGVEb21Ob2RlKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0XHRjb250ZW50OiBob3ZlckVsZW1lbnQsXG5cdFx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2NoYXQtZWxlbWVudC1kYXRhLWhvdmVyJ10sXG5cdFx0XHRcdG9uRGlkU2hvdzogKCkgPT4gc2Nyb2xsYWJsZUVsZW1lbnQuc2NhbkRvbU5vZGUoKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IGhvdmVyQ29udGVudCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21wdXRlZFN0eWxlRW50cmllc0ZvckhvdmVyKGNvbXB1dGVkU3R5bGVzOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB8IHVuZGVmaW5lZCk6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgc3RyaW5nXT4ge1xuXHRcdGlmICghY29tcHV0ZWRTdHlsZXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlFbnRyaWVzOiBBcnJheTxbc3RyaW5nLCBzdHJpbmddPiA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgS0VZX0VMRU1FTlRfSE9WRVJfQ09NUFVURURfU1RZTEVfUFJPUEVSVElFUykge1xuXHRcdFx0aWYgKHByb3BlcnR5ID09PSAnbWFyZ2luJyB8fCBwcm9wZXJ0eSA9PT0gJ3BhZGRpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IHNob3J0aGFuZCA9IHRoaXMuZ2V0Qm94U2hvcnRoYW5kVmFsdWUoY29tcHV0ZWRTdHlsZXMsIHByb3BlcnR5KTtcblx0XHRcdFx0aWYgKHR5cGVvZiBzaG9ydGhhbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0a2V5RW50cmllcy5wdXNoKFtwcm9wZXJ0eSwgc2hvcnRoYW5kXSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdmFsdWUgPSBjb21wdXRlZFN0eWxlc1twcm9wZXJ0eV07XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRrZXlFbnRyaWVzLnB1c2goW3Byb3BlcnR5LCB2YWx1ZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrIGZvciBvbGRlciBwYXlsb2FkcyB0aGF0IG1pZ2h0IG5vdCBpbmNsdWRlIHRoZSBrZXkgcHJvcGVydGllcy5cblx0XHRpZiAoa2V5RW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4ga2V5RW50cmllcztcblx0XHR9XG5cblx0XHRyZXR1cm4gT2JqZWN0LmVudHJpZXMoY29tcHV0ZWRTdHlsZXMpLnNsaWNlKDAsIEtFWV9FTEVNRU5UX0hPVkVSX0NPTVBVVEVEX1NUWUxFX1BST1BFUlRJRVMubGVuZ3RoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Qm94U2hvcnRoYW5kVmFsdWUoY29tcHV0ZWRTdHlsZXM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHN0cmluZz4+LCBwcm9wZXJ0eU5hbWU6ICdtYXJnaW4nIHwgJ3BhZGRpbmcnKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0b3AgPSBjb21wdXRlZFN0eWxlc1tgJHtwcm9wZXJ0eU5hbWV9LXRvcGBdO1xuXHRcdGNvbnN0IHJpZ2h0ID0gY29tcHV0ZWRTdHlsZXNbYCR7cHJvcGVydHlOYW1lfS1yaWdodGBdO1xuXHRcdGNvbnN0IGJvdHRvbSA9IGNvbXB1dGVkU3R5bGVzW2Ake3Byb3BlcnR5TmFtZX0tYm90dG9tYF07XG5cdFx0Y29uc3QgbGVmdCA9IGNvbXB1dGVkU3R5bGVzW2Ake3Byb3BlcnR5TmFtZX0tbGVmdGBdO1xuXG5cdFx0aWYgKHR5cGVvZiB0b3AgPT09ICdzdHJpbmcnICYmIHR5cGVvZiByaWdodCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGJvdHRvbSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGxlZnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gYCR7dG9wfSAke3JpZ2h0fSAke2JvdHRvbX0gJHtsZWZ0fWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXB1dGVkU3R5bGVzW3Byb3BlcnR5TmFtZV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5FbGVtZW50QXR0YWNobWVudChhdHRhY2htZW50OiBJRWxlbWVudFZhcmlhYmxlRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXR0YWNobWVudC52YWx1ZT8udG9TdHJpbmcoKSB8fCAnJztcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudHM6IGNvbnRlbnQsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRFbGVtZW50VGFnKGF0dGFjaG1lbnQ6IElFbGVtZW50VmFyaWFibGVFbnRyeSk6IHN0cmluZyB7XG5cdFx0Ly8gRXh0cmFjdCB0aGUgb3BlbmluZyB0YWcgZnJvbSB0aGUgb3V0ZXJIVE1MIHdpdGhpbiB0aGUgdmFsdWUgc3RyaW5nXG5cdFx0Ly8gVmFsdWUgZm9ybWF0OiBcIkF0dGFjaGVkIEhUTUwgYW5kIENTUyBDb250ZXh0XFxuXFxuPHRhZyAuLi4+Li4uPC90YWc+XFxuXFxuLi4uXCJcblx0XHRjb25zdCBjb250ZW50ID0gYXR0YWNobWVudC52YWx1ZT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRjb25zdCBodG1sTWF0Y2ggPSBjb250ZW50Lm1hdGNoKC9cXG5cXG4oPFtePl0rPikvKTtcblx0XHRpZiAoaHRtbE1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gaHRtbE1hdGNoWzFdO1xuXHRcdH1cblx0XHQvLyBGYWxsYmFjazogdHJ5IGZpcnN0IHRhZyBpbiBjb250ZW50XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBjb250ZW50Lm1hdGNoKC88KFtePl0rKT4vKTtcblx0XHRpZiAoZmFsbGJhY2spIHtcblx0XHRcdHJldHVybiBgPCR7ZmFsbGJhY2tbMV19PmA7XG5cdFx0fVxuXHRcdHJldHVybiBgPCR7YXR0YWNobWVudC5uYW1lfT5gO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXRBbmNlc3RvclRhZyhhbmNlc3RvcjogeyB0YWdOYW1lOiBzdHJpbmc7IGlkPzogc3RyaW5nOyBjbGFzc05hbWVzPzogc3RyaW5nW10gfSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcGFydHMgPSBbYDwke2FuY2VzdG9yLnRhZ05hbWV9YF07XG5cdFx0aWYgKGFuY2VzdG9yLmNsYXNzTmFtZXM/Lmxlbmd0aCkge1xuXHRcdFx0cGFydHMucHVzaChgIGNsYXNzPVwiJHthbmNlc3Rvci5jbGFzc05hbWVzLmpvaW4oJyAnKX1cImApO1xuXHRcdH1cblx0XHRpZiAoYW5jZXN0b3IuaWQpIHtcblx0XHRcdHBhcnRzLnB1c2goYCBpZD1cIiR7YW5jZXN0b3IuaWR9XCJgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnRzLmpvaW4oJycpICsgJz4nO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01IaXN0b3J5SXRlbUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVNDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeSxcblx0XHRjdXJyZW50TGFuZ3VhZ2VNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbjogYm9vbGVhbjsgc3VwcG9ydHNEZWxldGlvbjogYm9vbGVhbiB9LFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0Y29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLmxhYmVsLnNldExhYmVsKGF0dGFjaG1lbnQubmFtZSwgdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGNvbnRleHQsIHswfVwiLCBhdHRhY2htZW50Lm5hbWUpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCwgZGlzcG9zYWJsZXMgfSA9IHRvSGlzdG9yeUl0ZW1Ib3ZlckNvbnRlbnQobWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW0sIGZhbHNlKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudCxcblx0XHR9LCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9vcGVuQXR0YWNobWVudChhdHRhY2htZW50KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb3BlbkF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkF0dGFjaG1lbnQoYXR0YWNobWVudDogSVNDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ193b3JrYmVuY2gub3Blbk11bHRpRGlmZkVkaXRvcicsIHtcblx0XHRcdHRpdGxlOiBnZXRIaXN0b3J5SXRlbUVkaXRvclRpdGxlKGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW0pLCBtdWx0aURpZmZTb3VyY2VVcmk6IGF0dGFjaG1lbnQudmFsdWVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGF0dGFjaG1lbnQ6IElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGF0dGFjaG1lbnQsIG9wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5hbWVTdWZmaXggPSBgXFx1MDBBMCQoJHtDb2RpY29uLmdpdENvbW1pdC5pZH0pJHthdHRhY2htZW50Lmhpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBhdHRhY2htZW50Lmhpc3RvcnlJdGVtLmlkfWA7XG5cdFx0dGhpcy5sYWJlbC5zZXRGaWxlKGF0dGFjaG1lbnQudmFsdWUsIHsgZmlsZUtpbmQ6IEZpbGVLaW5kLkZJTEUsIGhpZGVQYXRoOiB0cnVlLCBuYW1lU3VmZml4IH0pO1xuXG5cdFx0dGhpcy5lbGVtZW50LmFyaWFMYWJlbCA9IHRoaXMuYXBwZW5kRGVsZXRpb25IaW50KGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQnLCBcIkF0dGFjaGVkIGNvbnRleHQsIHswfVwiLCBhdHRhY2htZW50Lm5hbWUpKTtcblxuXHRcdGNvbnN0IHsgY29udGVudCwgZGlzcG9zYWJsZXMgfSA9IHRvSGlzdG9yeUl0ZW1Ib3ZlckNvbnRlbnQobWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW0sIGZhbHNlKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0Li4uY29tbW9uSG92ZXJPcHRpb25zLCBjb250ZW50LFxuXHRcdH0sIGNvbW1vbkhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChkaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLmFkZFJlc291cmNlT3BlbkhhbmRsZXJzKGF0dGFjaG1lbnQudmFsdWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgaXNEaXJlY3Rvcnk6IHRydWUpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgaXNEaXJlY3Rvcnk6IGZhbHNlLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5PzogYm9vbGVhbiwgcmFuZ2U/OiBJUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhdHRhY2htZW50ID0gdGhpcy5hdHRhY2htZW50IGFzIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBhdHRhY2htZW50Lmhpc3RvcnlJdGVtO1xuXG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogYCR7YmFzZW5hbWUocmVzb3VyY2UucGF0aCl9ICgke2hpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBoaXN0b3J5SXRlbS5pZH0pYCxcblx0XHRcdG9wdGlvbnM6IHsgLi4ub3B0aW9ucy5lZGl0b3JPcHRpb25zIH1cblx0XHR9LCBvcHRpb25zLm9wZW5Ub1NpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUF0dGFjaG1lbnRXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdENoYXRBdHRhY2htZW50V2lkZ2V0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YXR0YWNobWVudDogSVNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5LFxuXHRcdGN1cnJlbnRMYW5ndWFnZU1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogeyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBib29sZWFuOyBzdXBwb3J0c0RlbGV0aW9uOiBib29sZWFuIH0sXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIsIGNvbnRleHRSZXNvdXJjZUxhYmVscywgY3VycmVudExhbmd1YWdlTW9kZWwsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbVN0YXJ0SWQgPSBhdHRhY2htZW50Lmhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQuaGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydC5oaXN0b3J5SXRlbS5pZDtcblx0XHRjb25zdCBoaXN0b3J5SXRlbUVuZElkID0gYXR0YWNobWVudC5oaXN0b3J5SXRlbUNoYW5nZUVuZC5oaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gYXR0YWNobWVudC5oaXN0b3J5SXRlbUNoYW5nZUVuZC5oaXN0b3J5SXRlbS5pZDtcblxuXHRcdGNvbnN0IG5hbWVTdWZmaXggPSBgXFx1MDBBMCQoJHtDb2RpY29uLmdpdENvbW1pdC5pZH0pJHtoaXN0b3J5SXRlbVN0YXJ0SWR9Li4ke2hpc3RvcnlJdGVtRW5kSWR9YDtcblx0XHR0aGlzLmxhYmVsLnNldEZpbGUoYXR0YWNobWVudC52YWx1ZSwgeyBmaWxlS2luZDogRmlsZUtpbmQuRklMRSwgaGlkZVBhdGg6IHRydWUsIG5hbWVTdWZmaXggfSk7XG5cblx0XHR0aGlzLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpcy5hcHBlbmREZWxldGlvbkhpbnQobG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudCcsIFwiQXR0YWNoZWQgY29udGV4dCwgezB9XCIsIGF0dGFjaG1lbnQubmFtZSkpO1xuXG5cdFx0dGhpcy5hZGRSZXNvdXJjZU9wZW5IYW5kbGVycyhhdHRhY2htZW50LnZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiB0cnVlKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlbkVkaXRvck9wdGlvbnMsIGlzRGlyZWN0b3J5OiBmYWxzZSwgcmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5FZGl0b3JPcHRpb25zLCBpc0RpcmVjdG9yeT86IGJvb2xlYW4sIHJhbmdlPzogSVJhbmdlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IHRoaXMuYXR0YWNobWVudCBhcyBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydCA9IGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydDtcblx0XHRjb25zdCBoaXN0b3J5SXRlbUNoYW5nZUVuZCA9IGF0dGFjaG1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2VFbmQ7XG5cblx0XHRjb25zdCBvcmlnaW5hbFVyaVRpdGxlID0gYCR7YmFzZW5hbWUoaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydC51cmkuZnNQYXRoKX0gKCR7aGlzdG9yeUl0ZW1DaGFuZ2VTdGFydC5oaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydC5oaXN0b3J5SXRlbS5pZH0pYDtcblx0XHRjb25zdCBtb2RpZmllZFVyaVRpdGxlID0gYCR7YmFzZW5hbWUoaGlzdG9yeUl0ZW1DaGFuZ2VFbmQudXJpLmZzUGF0aCl9ICgke2hpc3RvcnlJdGVtQ2hhbmdlRW5kLmhpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBoaXN0b3J5SXRlbUNoYW5nZUVuZC5oaXN0b3J5SXRlbS5pZH0pYDtcblxuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZVN0YXJ0LnVyaSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGhpc3RvcnlJdGVtQ2hhbmdlRW5kLnVyaSB9LFxuXHRcdFx0bGFiZWw6IGAke29yaWdpbmFsVXJpVGl0bGV9IFx1MjE5NCAke21vZGlmaWVkVXJpVGl0bGV9YCxcblx0XHRcdG9wdGlvbnM6IHsgLi4ub3B0aW9ucy5lZGl0b3JPcHRpb25zIH1cblx0XHR9LCBvcHRpb25zLm9wZW5Ub1NpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlclZpZXdBdHRhY2htZW50V2lkZ2V0IGV4dGVuZHMgQWJzdHJhY3RDaGF0QXR0YWNobWVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9pbnB1dDogQnJvd3NlckVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2F0dGFjaG1lbnQ6IElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnksXG5cdFx0Y3VycmVudExhbmd1YWdlTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiB7IHNob3VsZEZvY3VzQ2xlYXJCdXR0b246IGJvb2xlYW47IHN1cHBvcnRzRGVsZXRpb246IGJvb2xlYW4gfSxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihfYXR0YWNobWVudCwgX29wdGlvbnMsIGNvbnRhaW5lciwgY29udGV4dFJlc291cmNlTGFiZWxzLCBjdXJyZW50TGFuZ3VhZ2VNb2RlbCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3Jlc29sdmVJbnB1dCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5vbkRpZENoYW5nZUJyb3dzZXJWaWV3cygoKSA9PiB0aGlzLl9yZXNvbHZlSW5wdXQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5vbkRpZENoYW5nZVNoYXJpbmdBdmFpbGFibGUoKCkgPT4gdGhpcy5fdXBkYXRlTGFiZWwoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdC4uLmNvbW1vbkhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuX2lucHV0XG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFtCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWRdOiB0aGlzLl9pbnB1dC5nZXRUaXRsZSgpID8/ICcnLFxuXHRcdFx0XHRcdFtCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5Ob3RTaGFyZWRdOiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVmlld05vdFNoYXJlZCcsIFwiVGhpcyBicm93c2VyIHBhZ2UgaXMgbm90IHNoYXJlZCB3aXRoIHRoZSBhZ2VudC5cIiksXG5cdFx0XHRcdFx0W0Jyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlVuYXZhaWxhYmxlXTogbG9jYWxpemUoJ2NoYXQuYnJvd3NlclRvb2xzRGlzYWJsZWQnLCBcIkJyb3dzZXIgdG9vbHMgYXJlIG5vdCBlbmFibGVkLlwiKSxcblx0XHRcdFx0fVt0aGlzLl9pbnB1dC5tb2RlbD8uc2hhcmluZ1N0YXRlID8/IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZF1cblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVmlld0Nsb3NlZCcsIFwiVGhpcyBicm93c2VyIHBhZ2UgaXMgbm8gbG9uZ2VyIG9wZW4uXCIpLFxuXHRcdH0pLCBjb21tb25Ib3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblxuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGhvb2tVcFJlc291cmNlQXR0YWNobWVudERyYWdBbmRDb250ZXh0TWVudShhY2Nlc3NvciwgdGhpcy5lbGVtZW50LCBfYXR0YWNobWVudC52YWx1ZSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuYWRkUmVzb3VyY2VPcGVuSGFuZGxlcnMoX2F0dGFjaG1lbnQudmFsdWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogTG9vayB1cCB0aGUgY3VycmVudCBCcm93c2VyRWRpdG9ySW5wdXQgZm9yIHRoaXMgYXR0YWNobWVudCdzIGJyb3dzZXIgSUQsIGJpbmQgbGlzdGVuZXJzLCBhbmQgcmVmcmVzaCB0aGUgVUkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlSW5wdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9icm93c2VyVmlld1NlcnZpY2UuZ2V0S25vd25Ccm93c2VyVmlld3MoKS5nZXQodGhpcy5fYXR0YWNobWVudC5icm93c2VySWQpO1xuXHRcdGlmICh0aGlzLl9pbnB1dCA9PT0gaW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX2lucHV0ID0gaW5wdXQ7XG5cblx0XHRpZiAoaW5wdXQpIHtcblx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXJzLmFkZChpbnB1dC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5faW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUxhYmVsKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIExpdmUgbmFtZSB1cGRhdGVzIHdoaWxlIHRoZSBhdHRhY2htZW50IGlzIHN0aWxsIGluIHRoZSBpbnB1dCBhcmVhXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5zdXBwb3J0c0RlbGV0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXJzLmFkZChpbnB1dC5vbkRpZENoYW5nZUxhYmVsKCgpID0+IHRoaXMuX3VwZGF0ZUxhYmVsKCkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlucHV0Lm1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXJzLmFkZChpbnB1dC5tb2RlbC5vbkRpZENoYW5nZVNoYXJpbmdTdGF0ZSgoKSA9PiB0aGlzLl91cGRhdGVMYWJlbCgpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9pbnB1dExpc3RlbmVycy5hZGQoaW5wdXQub25EaWRSZXNvbHZlTW9kZWwoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2lucHV0TGlzdGVuZXJzLmFkZChpbnB1dC5tb2RlbCEub25EaWRDaGFuZ2VTaGFyaW5nU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlTGFiZWwoKSkpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUxhYmVsKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmFtZSA9IHRoaXMuX2lucHV0Py5nZXROYW1lKCkgPz8gdGhpcy5fYXR0YWNobWVudC5uYW1lO1xuXHRcdGNvbnN0IHNoYXJpbmdTdGF0ZSA9IHRoaXMuX2lucHV0Py5tb2RlbD8uc2hhcmluZ1N0YXRlID8/IEJyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLlNoYXJlZDtcblx0XHRjb25zdCBpc0F2YWlsYWJsZSA9ICEhdGhpcy5faW5wdXQgJiYgc2hhcmluZ1N0YXRlID09PSBCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWQ7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsICFpc0F2YWlsYWJsZSk7XG5cdFx0dGhpcy5sYWJlbC5zZXRMYWJlbChuYW1lLCB1bmRlZmluZWQsIHtcblx0XHRcdGljb25QYXRoOiBDb2RpY29uLmdsb2JlLFxuXHRcdFx0c3RyaWtldGhyb3VnaDogIWlzQXZhaWxhYmxlLFxuXHRcdH0pO1xuXHRcdHRoaXMuZWxlbWVudC5hcmlhTGFiZWwgPSB0aGlzLmFwcGVuZERlbGV0aW9uSGludChcblx0XHRcdHRoaXMuX2lucHV0XG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdFtCcm93c2VyVmlld1NoYXJpbmdTdGF0ZS5TaGFyZWRdOiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVmlld0F0dGFjaG1lbnQuYXJpYScsIFwiQXR0YWNoZWQgYnJvd3NlciBwYWdlLCB7MH1cIiwgbmFtZSksXG5cdFx0XHRcdFx0W0Jyb3dzZXJWaWV3U2hhcmluZ1N0YXRlLk5vdFNoYXJlZF06IGxvY2FsaXplKCdjaGF0LmJyb3dzZXJWaWV3Tm90U2hhcmVkLmFyaWEnLCBcIkJyb3dzZXIgcGFnZSBub3Qgc2hhcmVkIHdpdGggYWdlbnQsIHswfVwiLCBuYW1lKSxcblx0XHRcdFx0XHRbQnJvd3NlclZpZXdTaGFyaW5nU3RhdGUuVW5hdmFpbGFibGVdOiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVG9vbHNEaXNhYmxlZC5hcmlhJywgXCJCcm93c2VyIHRvb2xzIGFyZSBub3QgZW5hYmxlZCwgezB9XCIsIG5hbWUpLFxuXHRcdFx0XHR9W3NoYXJpbmdTdGF0ZV1cblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5icm93c2VyVmlld0Nsb3NlZC5hcmlhJywgXCJCcm93c2VyIHBhZ2UgdW5hdmFpbGFibGUsIHswfVwiLCBuYW1lKVxuXHRcdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgaXNEaXJlY3Rvcnk6IHRydWUpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgb3BlblJlc291cmNlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuRWRpdG9yT3B0aW9ucywgaXNEaXJlY3Rvcnk6IGZhbHNlLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIG9wZW5SZXNvdXJjZShfcmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSU9wZW5FZGl0b3JPcHRpb25zLCBfaXNEaXJlY3Rvcnk/OiBib29sZWFuLCBfcmFuZ2U/OiBJUmFuZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faW5wdXQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLl9pbnB1dCwgb3B0aW9ucy5lZGl0b3JPcHRpb25zLCBvcHRpb25zLm9wZW5Ub1NpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhvb2tVcFJlc291cmNlQXR0YWNobWVudERyYWdBbmRDb250ZXh0TWVudShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBIVE1MRWxlbWVudCwgcmVzb3VyY2U6IFVSSSk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHQvLyBDb250ZXh0XG5cdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh3aWRnZXQpKTtcblx0c2V0UmVzb3VyY2VDb250ZXh0KGFjY2Vzc29yLCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgcmVzb3VyY2UpO1xuXG5cdC8vIERyYWcgYW5kIGRyb3Bcblx0d2lkZ2V0LmRyYWdnYWJsZSA9IHRydWU7XG5cdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldCwgJ2RyYWdzdGFydCcsIGUgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIFtyZXNvdXJjZV0sIGUpKTtcblx0XHRlLmRhdGFUcmFuc2Zlcj8uc2V0RHJhZ0ltYWdlKHdpZGdldCwgMCwgMCk7XG5cdH0pKTtcblxuXHQvLyBDb250ZXh0IG1lbnVcblx0c3RvcmUuYWRkKGFkZEJhc2ljQ29udGV4dE1lbnUoYWNjZXNzb3IsIHdpZGdldCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIE1lbnVJZC5DaGF0SW5wdXRSZXNvdXJjZUF0dGFjaG1lbnRDb250ZXh0LCByZXNvdXJjZSkpO1xuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhvb2tVcFN5bWJvbEF0dGFjaG1lbnREcmFnQW5kQ29udGV4dE1lbnUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdpZGdldDogSFRNTEVsZW1lbnQsIHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGF0dGFjaG1lbnQ6IHsgbmFtZTogc3RyaW5nOyB2YWx1ZTogTG9jYXRpb247IGtpbmQ6IFN5bWJvbEtpbmQgfSwgY29udGV4dE1lbnVJZDogTWVudUlkKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRjb25zdCB0ZXh0TW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dE1lbnVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0TWVudVNlcnZpY2UpO1xuXHRjb25zdCBtZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJTWVudVNlcnZpY2UpO1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdC8vIERyYWcgYW5kIGRyb3Bcblx0d2lkZ2V0LmRyYWdnYWJsZSA9IHRydWU7XG5cdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldCwgJ2RyYWdzdGFydCcsIGUgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIFt7IHJlc291cmNlOiBhdHRhY2htZW50LnZhbHVlLnVyaSwgc2VsZWN0aW9uOiBhdHRhY2htZW50LnZhbHVlLnJhbmdlIH1dLCBlKSk7XG5cblx0XHRmaWxsSW5TeW1ib2xzRHJhZ0RhdGEoW3tcblx0XHRcdGZzUGF0aDogYXR0YWNobWVudC52YWx1ZS51cmkuZnNQYXRoLFxuXHRcdFx0cmFuZ2U6IGF0dGFjaG1lbnQudmFsdWUucmFuZ2UsXG5cdFx0XHRuYW1lOiBhdHRhY2htZW50Lm5hbWUsXG5cdFx0XHRraW5kOiBhdHRhY2htZW50LmtpbmQsXG5cdFx0fV0sIGUpO1xuXG5cdFx0ZS5kYXRhVHJhbnNmZXI/LnNldERyYWdJbWFnZSh3aWRnZXQsIDAsIDApO1xuXHR9KSk7XG5cblx0Ly8gQ29udGV4dCBtZW51IChjb250ZXh0IGtleSBzZXJ2aWNlIGFuZCByZXNvdXJjZSBjb250ZXh0cyBhcmUgaW5pdGlhbGl6ZWQgbGF6aWx5IG9uIGZpcnN0IGNvbnRleHQgbWVudSBvcGVuKVxuXHRsZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZDtcblx0bGV0IHByb3ZpZGVyQ29udGV4dHM6IFJlYWRvbmx5QXJyYXk8W0lDb250ZXh0S2V5PGJvb2xlYW4+LCBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTx1bmtub3duPl0+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGVuc3VyZUNvbnRleHRLZXlTZXJ2aWNlID0gKCkgPT4ge1xuXHRcdGlmICghc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKHBhcmVudENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh3aWRnZXQpKTtcblx0XHRcdGNoYXRBdHRhY2htZW50UmVzb3VyY2VDb250ZXh0S2V5LmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KGF0dGFjaG1lbnQudmFsdWUudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c2V0UmVzb3VyY2VDb250ZXh0KGFjY2Vzc29yLCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgYXR0YWNobWVudC52YWx1ZS51cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdH07XG5cblx0Y29uc3QgZW5zdXJlUHJvdmlkZXJDb250ZXh0cyA9ICgpID0+IHtcblx0XHRjb25zdCBja3MgPSBlbnN1cmVDb250ZXh0S2V5U2VydmljZSgpO1xuXHRcdGlmICghcHJvdmlkZXJDb250ZXh0cykge1xuXHRcdFx0cHJvdmlkZXJDb250ZXh0cyA9IFtcblx0XHRcdFx0W0VkaXRvckNvbnRleHRLZXlzLmhhc0RlZmluaXRpb25Qcm92aWRlci5iaW5kVG8oY2tzKSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyXSxcblx0XHRcdFx0W0VkaXRvckNvbnRleHRLZXlzLmhhc1JlZmVyZW5jZVByb3ZpZGVyLmJpbmRUbyhja3MpLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlcl0sXG5cdFx0XHRcdFtFZGl0b3JDb250ZXh0S2V5cy5oYXNJbXBsZW1lbnRhdGlvblByb3ZpZGVyLmJpbmRUbyhja3MpLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbXBsZW1lbnRhdGlvblByb3ZpZGVyXSxcblx0XHRcdFx0W0VkaXRvckNvbnRleHRLZXlzLmhhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXIuYmluZFRvKGNrcyksIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnR5cGVEZWZpbml0aW9uUHJvdmlkZXJdLFxuXHRcdFx0XTtcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgdXBkYXRlQ29udGV4dEtleXMgPSBhc3luYyAoKSA9PiB7XG5cdFx0ZW5zdXJlUHJvdmlkZXJDb250ZXh0cygpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShhdHRhY2htZW50LnZhbHVlLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdGZvciAoY29uc3QgW2NvbnRleHRLZXksIHJlZ2lzdHJ5XSBvZiBwcm92aWRlckNvbnRleHRzISkge1xuXHRcdFx0XHRjb250ZXh0S2V5LnNldChyZWdpc3RyeS5oYXMobW9kZWwpKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fTtcblxuXHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQsIGRvbS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBhc3luYyBkb21FdmVudCA9PiB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZG9tRXZlbnQpLCBkb21FdmVudCk7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZG9tRXZlbnQsIHRydWUpO1xuXG5cdFx0Y29uc3QgY2tzID0gZW5zdXJlQ29udGV4dEtleVNlcnZpY2UoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB1cGRhdGVDb250ZXh0S2V5cygpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0fVxuXG5cdFx0Y29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogY2tzLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKGNvbnRleHRNZW51SWQsIGNrcywgeyBhcmc6IGF0dGFjaG1lbnQudmFsdWUgfSk7XG5cdFx0XHRcdHJldHVybiBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHJldHVybiBzdG9yZTtcbn1cblxuZnVuY3Rpb24gc2V0UmVzb3VyY2VDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCByZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXG5cdGNvbnN0IHJlc291cmNlQ29udGV4dEtleSA9IG5ldyBTdGF0aWNSZXNvdXJjZUNvbnRleHRLZXkoc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIG1vZGVsU2VydmljZSk7XG5cdHJlc291cmNlQ29udGV4dEtleS5zZXQocmVzb3VyY2UpO1xufVxuXG5mdW5jdGlvbiBhZGRCYXNpY0NvbnRleHRNZW51KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IEhUTUxFbGVtZW50LCBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBtZW51SWQ6IE1lbnVJZCwgYXJnOiB1bmtub3duLCB1cGRhdGVDb250ZXh0S2V5cz86ICgpID0+IFByb21pc2U8dm9pZD4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGNvbnRleHRNZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dE1lbnVTZXJ2aWNlKTtcblx0Y29uc3QgbWVudVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1lbnVTZXJ2aWNlKTtcblxuXHRyZXR1cm4gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQsIGRvbS5FdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBhc3luYyBkb21FdmVudCA9PiB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZG9tRXZlbnQpLCBkb21FdmVudCk7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZG9tRXZlbnQsIHRydWUpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHVwZGF0ZUNvbnRleHRLZXlzPy4oKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdH1cblxuXHRcdGNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKG1lbnVJZCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHsgYXJnIH0pO1xuXHRcdFx0XHRyZXR1cm4gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgY29uc3QgY2hhdEF0dGFjaG1lbnRSZXNvdXJjZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdjaGF0QXR0YWNobWVudFJlc291cmNlJywgdW5kZWZpbmVkLCB7IHR5cGU6ICdVUkknLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Jlc291cmNlJywgXCJUaGUgZnVsbCB2YWx1ZSBvZiB0aGUgY2hhdCBhdHRhY2htZW50IHJlc291cmNlLCBpbmNsdWRpbmcgc2NoZW1lIGFuZCBwYXRoXCIpIH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUF5RjtBQUNsRyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxXQUFXO0FBQ3ZCLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsZUFB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QUFxQixJQUFJLHlCQUF5Qix5QkFBeUIsYUFBYSxpQkFBaUIsWUFBWTtBQUMzSCxxQkFBbUIsSUFBSSxRQUFRO0FBQ2hDO0FBRUEsU0FBUyxvQkFBb0IsVUFBNEIsUUFBcUIseUJBQW1ELFFBQWdCLEtBQWMsbUJBQXNEO0FBQ3BOLFFBQU0scUJBQXFCLFNBQVMsSUFBSSxtQkFBbUI7QUFDM0QsUUFBTSxjQUFjLFNBQVMsSUFBSSxZQUFZO0FBRTdDLFNBQU8sSUFBSSxzQkFBc0IsUUFBUSxJQUFJLFVBQVUsY0FBYyxPQUFNLGFBQVk7QUFDdEYsVUFBTUEsU0FBUSxJQUFJLG1CQUFtQixJQUFJLFVBQVUsUUFBUSxHQUFHLFFBQVE7QUFDdEUsUUFBSSxZQUFZLEtBQUssVUFBVSxJQUFJO0FBRW5DLFFBQUk7QUFDSCxZQUFNLG9CQUFvQjtBQUFBLElBQzNCLFNBQVMsR0FBRztBQUNYLGNBQVEsTUFBTSxDQUFDO0FBQUEsSUFDaEI7QUFFQSx1QkFBbUIsZ0JBQWdCO0FBQUEsTUFDbEMsbUJBQW1CO0FBQUEsTUFDbkIsV0FBVyxNQUFNQTtBQUFBLE1BQ2pCLFlBQVksTUFBTTtBQUNqQixjQUFNLE9BQU8sWUFBWSxlQUFlLFFBQVEseUJBQXlCLEVBQUUsSUFBSSxDQUFDO0FBQ2hGLGVBQU8sMEJBQTBCLElBQUk7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGO0FBRU8sTUFBTSxtQ0FBbUMsSUFBSSxjQUFzQiwwQkFBMEIsUUFBVyxFQUFFLE1BQU0sT0FBTyxhQUFhLFNBQVMsWUFBWSwyRUFBMkUsRUFBRSxDQUFDOyIsCiAgIm5hbWVzIjogWyJldmVudCIsICJUZXJtaW5hbENvbnN0YW50cyIsICJwaWxsSWNvbiIsICJob3ZlckVsZW1lbnQiLCAiYWNjZXNzb3IiXQp9Cg==
