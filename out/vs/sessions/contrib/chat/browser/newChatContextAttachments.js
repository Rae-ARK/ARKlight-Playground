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
import { DragAndDropObserver } from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { renderIcon, renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { localize } from "../../../../nls.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { registerOpenEditorListeners } from "../../../../platform/editor/browser/editor.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ChatConfiguration } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatImageCarouselService } from "../../../../workbench/contrib/chat/browser/chatImageCarouselService.js";
import { coerceImageBuffer } from "../../../../workbench/contrib/chat/common/chatImageExtraction.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { basename } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { isAgentHostCompletionVariableEntry, OmittedState } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { isLocation } from "../../../../editor/common/languages.js";
import { resizeImage } from "../../../../workbench/contrib/chat/browser/chatImageUtils.js";
import { imageToHash, isImage } from "../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js";
import { CodeDataTransfers, containsDragType, extractEditorsDropData, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { getExcludes, ISearchService, QueryType } from "../../../../workbench/services/search/common/search.js";
let NewChatContextAttachments = class extends Disposable {
  constructor(quickInputService, textModelService, fileService, clipboardService, fileDialogService, labelService, searchService, configurationService, openerService, instantiationService, modelService, languageService, chatImageCarouselService) {
    super();
    this.quickInputService = quickInputService;
    this.textModelService = textModelService;
    this.fileService = fileService;
    this.clipboardService = clipboardService;
    this.fileDialogService = fileDialogService;
    this.labelService = labelService;
    this.searchService = searchService;
    this.configurationService = configurationService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.chatImageCarouselService = chatImageCarouselService;
    this._attachedContext = [];
    this._renderDisposables = this._register(new DisposableStore());
    this._onDidChangeContext = this._register(new Emitter());
    this.onDidChangeContext = this._onDidChangeContext.event;
    this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
  }
  get attachments() {
    return this._attachedContext;
  }
  setAttachments(entries) {
    this._attachedContext.length = 0;
    this._attachedContext.push(...entries);
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
  // --- Rendering ---
  renderAttachedContext(container) {
    this._container = container;
    this._updateRendering();
  }
  _updateRendering() {
    if (!this._container) {
      return;
    }
    this._renderDisposables.clear();
    this._resourceLabels.clear();
    dom.clearNode(this._container);
    const visibleAttachments = this._attachedContext.filter((entry) => !isAgentHostCompletionVariableEntry(entry));
    if (visibleAttachments.length === 0) {
      this._container.style.display = "none";
      return;
    }
    this._container.style.display = "";
    this._container.classList.add("show-file-icons");
    for (const entry of visibleAttachments) {
      const pill = dom.append(this._container, dom.$(".sessions-chat-attachment-pill"));
      const resource = URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : void 0;
      if (entry.kind === "image") {
        dom.append(pill, renderIcon(Codicon.fileMedia));
        dom.append(pill, dom.$("span.sessions-chat-attachment-name", void 0, entry.name));
      } else {
        const label = this._resourceLabels.create(pill, { supportIcons: true });
        this._renderDisposables.add(label);
        if (resource) {
          label.setFile(resource, {
            fileKind: entry.kind === "directory" ? FileKind.FOLDER : FileKind.FILE,
            hidePath: true
          });
        } else {
          label.setLabel(entry.name);
        }
      }
      const imageData = entry.kind === "image" ? coerceImageBuffer(entry.value) : void 0;
      if (imageData) {
        pill.style.cursor = "pointer";
        this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
          if (this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
            const imageResource = resource ?? URI.from({ scheme: "data", path: entry.name });
            await this.chatImageCarouselService.openCarouselAtResource(imageResource, imageData);
          } else if (resource) {
            await this.openerService.open(resource, { fromUserGesture: true });
          }
        }));
      } else if (resource) {
        pill.style.cursor = "pointer";
        this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
          await this.openerService.open(resource, { fromUserGesture: true });
        }));
      }
      if (imageData || resource) {
        pill.tabIndex = 0;
        pill.role = "button";
      }
      const removeButton = dom.append(pill, dom.$(".sessions-chat-attachment-remove"));
      removeButton.title = localize("removeAttachment", "Remove");
      removeButton.tabIndex = -1;
      dom.append(removeButton, renderIcon(Codicon.close));
      this._renderDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this._removeAttachment(entry.id);
      }));
    }
  }
  // --- Drag and drop ---
  registerDropTarget(dndContainer) {
    const overlay = dom.append(dndContainer, dom.$(".sessions-chat-dnd-overlay"));
    let overlayText;
    const isDropSupported = (e) => {
      return containsDragType(e, DataTransfers.FILES, CodeDataTransfers.EDITORS, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST);
    };
    const showOverlay = () => {
      overlay.classList.add("visible");
      if (!overlayText) {
        const label = localize("attachAsContext", "Attach as Context");
        const iconAndTextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${label}`);
        const htmlElements = iconAndTextElements.map((element) => {
          if (typeof element === "string") {
            return dom.$("span.overlay-text", void 0, element);
          }
          return element;
        });
        overlayText = dom.$("span.attach-context-overlay-text", void 0, ...htmlElements);
        overlay.appendChild(overlayText);
      }
    };
    const hideOverlay = () => {
      overlay.classList.remove("visible");
      overlayText?.remove();
      overlayText = void 0;
    };
    this._register(new DragAndDropObserver(dndContainer, {
      onDragOver: (e) => {
        if (isDropSupported(e)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
          }
          showOverlay();
        }
      },
      onDragLeave: () => {
        hideOverlay();
      },
      onDrop: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideOverlay();
        const editorDropData = extractEditorsDropData(e);
        if (editorDropData.length > 0) {
          for (const editor of editorDropData) {
            if (editor.resource) {
              await this._attachFileUri(editor.resource, basename(editor.resource));
            }
          }
          return;
        }
        const items = e.dataTransfer?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.kind === "file") {
              const file = item.getAsFile();
              if (!file) {
                continue;
              }
              const filePath = getPathForFile(file);
              if (!filePath) {
                continue;
              }
              const uri = URI.file(filePath);
              await this._attachFileUri(uri, file.name);
            }
          }
        }
      }
    }));
  }
  // --- Paste ---
  registerPasteHandler(element) {
    const supportedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/bmp",
      "image/gif",
      "image/tiff"
    ];
    this._register(dom.addDisposableListener(element, dom.EventType.PASTE, async (e) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }
      let imageFile;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/") || !supportedMimeTypes.includes(item.type)) {
          continue;
        }
        const file = item.getAsFile();
        if (file) {
          imageFile = file;
          break;
        }
      }
      if (!imageFile) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const arrayBuffer = await imageFile.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      if (!isImage(data)) {
        return;
      }
      const resizedData = await resizeImage(data, imageFile.type);
      const displayName = this._getUniqueImageName();
      this._addAttachments({
        id: await imageToHash(resizedData),
        name: displayName,
        fullName: displayName,
        value: resizedData,
        kind: "image"
      });
    }, true));
  }
  // --- Picker ---
  showPicker(folderUri) {
    const picker = this.quickInputService.createQuickPick({ useSeparators: true });
    const disposables = new DisposableStore();
    picker.placeholder = localize("chatContext.attach.placeholder", "Attach as context...");
    picker.matchOnDescription = true;
    picker.sortByLabel = false;
    const staticPicks = [
      {
        label: localize("files", "Files..."),
        iconClass: ThemeIcon.asClassName(Codicon.file),
        id: "sessions.filesAndFolders"
      },
      {
        label: localize("imageFromClipboard", "Image from Clipboard"),
        iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
        id: "sessions.imageFromClipboard"
      }
    ];
    picker.items = staticPicks;
    picker.show();
    if (folderUri) {
      let searchCts;
      let debounceTimer;
      const runSearch = (filePattern) => {
        searchCts?.dispose(true);
        searchCts = new CancellationTokenSource();
        const token = searchCts.token;
        picker.busy = true;
        this._collectFilePicks(folderUri, filePattern, token).then((filePicks) => {
          if (token.isCancellationRequested) {
            return;
          }
          picker.busy = false;
          if (filePicks.length > 0) {
            picker.items = [
              ...staticPicks,
              { type: "separator", label: basename(folderUri) },
              ...filePicks
            ];
          } else {
            picker.items = staticPicks;
          }
        });
      };
      runSearch();
      disposables.add(picker.onDidChangeValue((value) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => runSearch(value || void 0), 200);
      }));
      disposables.add({ dispose: () => {
        searchCts?.dispose(true);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
      } });
    }
    disposables.add(picker.onDidAccept(async () => {
      const [selected] = picker.selectedItems;
      if (!selected) {
        picker.hide();
        return;
      }
      picker.hide();
      if (selected.id === "sessions.filesAndFolders") {
        await this._handleFileDialog();
      } else if (selected.id === "sessions.imageFromClipboard") {
        await this._handleClipboardImage();
      } else if (selected.id) {
        await this._attachFileUri(URI.parse(selected.id), selected.label);
      }
    }));
    disposables.add(picker.onDidHide(() => {
      picker.dispose();
      disposables.dispose();
    }));
  }
  async _collectFilePicks(rootUri, filePattern, token) {
    const maxFiles = 200;
    if (rootUri.scheme === Schemas.file || rootUri.scheme === Schemas.vscodeRemote) {
      return this._collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token);
    }
    return this._collectFilePicksViaFileService(rootUri, maxFiles, filePattern);
  }
  async _collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token) {
    const excludePattern = getExcludes(this.configurationService.getValue({ resource: rootUri }));
    try {
      const searchResult = await this.searchService.fileSearch({
        folderQueries: [{
          folder: rootUri,
          disregardIgnoreFiles: false
        }],
        type: QueryType.File,
        filePattern: filePattern || "",
        excludePattern,
        sortByScore: true,
        maxResults: maxFiles
      }, token);
      return searchResult.results.map((result) => ({
        label: basename(result.resource),
        description: this.labelService.getUriLabel(result.resource, { relative: true }),
        iconClasses: getIconClasses(this.modelService, this.languageService, result.resource, FileKind.FILE),
        id: result.resource.toString()
      }));
    } catch {
      return [];
    }
  }
  async _collectFilePicksViaFileService(rootUri, maxFiles, filePattern) {
    const picks = [];
    const patternLower = filePattern?.toLowerCase();
    const maxDepth = 10;
    const collect = async (uri, depth) => {
      if (picks.length >= maxFiles || depth > maxDepth) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (!stat.children) {
          return;
        }
        const children = stat.children.slice().sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        for (const child of children) {
          if (picks.length >= maxFiles) {
            break;
          }
          if (child.isDirectory) {
            await collect(child.resource, depth + 1);
          } else {
            if (patternLower && !child.name.toLowerCase().includes(patternLower)) {
              continue;
            }
            picks.push({
              label: child.name,
              description: this.labelService.getUriLabel(child.resource, { relative: true }),
              iconClasses: getIconClasses(this.modelService, this.languageService, child.resource, FileKind.FILE),
              id: child.resource.toString()
            });
          }
        }
      } catch {
      }
    };
    await collect(rootUri, 0);
    return picks;
  }
  async _handleFileDialog() {
    const selected = await this.fileDialogService.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
      title: localize("selectFilesOrFolders", "Select Files or Folders")
    });
    if (!selected) {
      return;
    }
    for (const uri of selected) {
      await this._attachFileUri(uri, basename(uri));
    }
  }
  async _attachFileUri(uri, name) {
    let stat;
    try {
      stat = await this.fileService.stat(uri);
    } catch {
      return;
    }
    if (stat.isDirectory) {
      this._addAttachments({
        kind: "directory",
        id: uri.toString(),
        value: uri,
        name
      });
      return;
    }
    if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(uri.path)) {
      const readFile = await this.fileService.readFile(uri);
      const resizedImage = await resizeImage(readFile.value.buffer);
      this._addAttachments({
        id: uri.toString(),
        name,
        fullName: name,
        value: resizedImage,
        kind: "image",
        references: [{ reference: uri, kind: "reference" }]
      });
    } else {
      let omittedState = OmittedState.NotOmitted;
      try {
        const ref = await this.textModelService.createModelReference(uri);
        ref.dispose();
      } catch {
        omittedState = OmittedState.Full;
      }
      this._addAttachments({
        kind: "file",
        id: uri.toString(),
        value: uri,
        name,
        omittedState
      });
    }
  }
  async _handleClipboardImage() {
    const imageData = await this.clipboardService.readImage();
    if (!isImage(imageData)) {
      return;
    }
    const displayName = this._getUniqueImageName();
    this._addAttachments({
      id: await imageToHash(imageData),
      name: displayName,
      fullName: displayName,
      value: imageData,
      kind: "image"
    });
  }
  // --- State management ---
  _getUniqueImageName() {
    const baseName = localize("pastedImage", "Pasted Image");
    let name = baseName;
    for (let i = 2; this._attachedContext.some((a) => a.name === name); i++) {
      name = `${baseName} ${i}`;
    }
    return name;
  }
  addAttachments(...entries) {
    this._addAttachments(...entries);
  }
  _addAttachments(...entries) {
    for (const entry of entries) {
      if (!this._attachedContext.some((e) => e.id === entry.id)) {
        this._attachedContext.push(entry);
      }
    }
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
  _removeAttachment(id) {
    const index = this._attachedContext.findIndex((e) => e.id === id);
    if (index >= 0) {
      this._attachedContext.splice(index, 1);
      this._updateRendering();
      this._onDidChangeContext.fire();
    }
  }
  clear() {
    this._attachedContext.length = 0;
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
};
NewChatContextAttachments = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, ITextModelService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ISearchService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IModelService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, IChatImageCarouselService)
], NewChatContextAttachments);
export {
  NewChatContextAttachments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL25ld0NoYXRDb250ZXh0QXR0YWNobWVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEcmFnQW5kRHJvcE9ic2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24sIHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck9wZW5FZGl0b3JMaXN0ZW5lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb2VyY2VJbWFnZUJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRJbWFnZUV4dHJhY3Rpb24uanMnO1xuXG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9sYWJlbHMuanMnO1xuXG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5LCBPbWl0dGVkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyByZXNpemVJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0SW1hZ2VVdGlscy5qcyc7XG5pbXBvcnQgeyBpbWFnZVRvSGFzaCwgaXNJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRQYXN0ZVByb3ZpZGVycy5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgY29udGFpbnNEcmFnVHlwZSwgZXh0cmFjdEVkaXRvcnNEcm9wRGF0YSwgZ2V0UGF0aEZvckZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgZ2V0RXhjbHVkZXMsIElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoU2VydmljZSwgUXVlcnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcblxuLyoqXG4gKiBNYW5hZ2VzIGNvbnRleHQgYXR0YWNobWVudHMgZm9yIHRoZSBzZXNzaW9ucyBuZXctY2hhdCB3aWRnZXQuXG4gKlxuICogU3VwcG9ydHM6XG4gKiAtIEZpbGUgcGlja2VyIHZpYSBxdWljayBhY2Nlc3MgKFwiRmlsZXMgYW5kIE9wZW4gRm9sZGVycy4uLlwiKVxuICogLSBJbWFnZSBmcm9tIENsaXBib2FyZFxuICogLSBEcmFnIGFuZCBkcm9wIGZpbGVzXG4gKiAtIFBhc3RlIGltYWdlcyBmcm9tIGNsaXBib2FyZCAoQ3RybC9DbWQrVilcbiAqL1xuZXhwb3J0IGNsYXNzIE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5ldmVudDtcblxuXHRnZXQgYXR0YWNobWVudHMoKTogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWRDb250ZXh0O1xuXHR9XG5cblx0c2V0QXR0YWNobWVudHMoZW50cmllczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0Lmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0LnB1c2goLi4uZW50cmllcyk7XG5cdFx0dGhpcy5fdXBkYXRlUmVuZGVyaW5nKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbWFnZUNhcm91c2VsU2VydmljZTogSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZXNvdXJjZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXHR9XG5cblx0Ly8gLS0tIFJlbmRlcmluZyAtLS1cblxuXHRyZW5kZXJBdHRhY2hlZENvbnRleHQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl91cGRhdGVSZW5kZXJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlbmRlcmluZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzb3VyY2VMYWJlbHMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRjb25zdCB2aXNpYmxlQXR0YWNobWVudHMgPSB0aGlzLl9hdHRhY2hlZENvbnRleHQuZmlsdGVyKGVudHJ5ID0+ICFpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KGVudHJ5KSk7XG5cdFx0aWYgKHZpc2libGVBdHRhY2htZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB2aXNpYmxlQXR0YWNobWVudHMpIHtcblx0XHRcdGNvbnN0IHBpbGwgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtcGlsbCcpKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmlzVXJpKGVudHJ5LnZhbHVlKSA/IGVudHJ5LnZhbHVlIDogaXNMb2NhdGlvbihlbnRyeS52YWx1ZSkgPyBlbnRyeS52YWx1ZS51cmkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZW50cnkua2luZCA9PT0gJ2ltYWdlJykge1xuXHRcdFx0XHRkb20uYXBwZW5kKHBpbGwsIHJlbmRlckljb24oQ29kaWNvbi5maWxlTWVkaWEpKTtcblx0XHRcdFx0ZG9tLmFwcGVuZChwaWxsLCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtbmFtZScsIHVuZGVmaW5lZCwgZW50cnkubmFtZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9yZXNvdXJjZUxhYmVscy5jcmVhdGUocGlsbCwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChsYWJlbCk7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdGxhYmVsLnNldEZpbGUocmVzb3VyY2UsIHtcblx0XHRcdFx0XHRcdGZpbGVLaW5kOiBlbnRyeS5raW5kID09PSAnZGlyZWN0b3J5JyA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRcdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYWJlbC5zZXRMYWJlbChlbnRyeS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGljayB0byBvcGVuIHRoZSByZXNvdXJjZSBvciBpbWFnZVxuXHRcdFx0Y29uc3QgaW1hZ2VEYXRhID0gZW50cnkua2luZCA9PT0gJ2ltYWdlJyA/IGNvZXJjZUltYWdlQnVmZmVyKGVudHJ5LnZhbHVlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpbWFnZURhdGEpIHtcblx0XHRcdFx0cGlsbC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChyZWdpc3Rlck9wZW5FZGl0b3JMaXN0ZW5lcnMocGlsbCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltYWdlQ2Fyb3VzZWxFbmFibGVkKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW1hZ2VSZXNvdXJjZSA9IHJlc291cmNlID8/IFVSSS5mcm9tKHsgc2NoZW1lOiAnZGF0YScsIHBhdGg6IGVudHJ5Lm5hbWUgfSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNoYXRJbWFnZUNhcm91c2VsU2VydmljZS5vcGVuQ2Fyb3VzZWxBdFJlc291cmNlKGltYWdlUmVzb3VyY2UsIGltYWdlRGF0YSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb3VyY2UsIHsgZnJvbVVzZXJHZXN0dXJlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRwaWxsLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyhwaWxsLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4ocmVzb3VyY2UsIHsgZnJvbVVzZXJHZXN0dXJlOiB0cnVlIH0pO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9ubHkgZXhwb3NlIHRoZSBwaWxsIGl0c2VsZiBhcyBhIGZvY3VzYWJsZSBidXR0b24gd2hlbiBpdCBoYXMgYW4gb3BlblxuXHRcdFx0Ly8gYWN0aW9uOyByZWZlcmVuY2UgcGlsbHMgd2l0aG91dCBhIHJlc291cmNlIChlLmcuIGAjc2Vzc2lvbmApIHdvdWxkXG5cdFx0XHQvLyBvdGhlcndpc2UgYmUgYSBmb2N1c2FibGUgY29udHJvbCB0aGF0IGRvZXMgbm90aGluZy5cblx0XHRcdGlmIChpbWFnZURhdGEgfHwgcmVzb3VyY2UpIHtcblx0XHRcdFx0cGlsbC50YWJJbmRleCA9IDA7XG5cdFx0XHRcdHBpbGwucm9sZSA9ICdidXR0b24nO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZW1vdmVCdXR0b24gPSBkb20uYXBwZW5kKHBpbGwsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1hdHRhY2htZW50LXJlbW92ZScpKTtcblx0XHRcdHJlbW92ZUJ1dHRvbi50aXRsZSA9IGxvY2FsaXplKCdyZW1vdmVBdHRhY2htZW50JywgXCJSZW1vdmVcIik7XG5cdFx0XHRyZW1vdmVCdXR0b24udGFiSW5kZXggPSAtMTtcblx0XHRcdGRvbS5hcHBlbmQocmVtb3ZlQnV0dG9uLCByZW5kZXJJY29uKENvZGljb24uY2xvc2UpKTtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJlbW92ZUJ1dHRvbiwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQXR0YWNobWVudChlbnRyeS5pZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIERyYWcgYW5kIGRyb3AgLS0tXG5cblx0cmVnaXN0ZXJEcm9wVGFyZ2V0KGRuZENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBvdmVybGF5ID0gZG9tLmFwcGVuZChkbmRDb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1kbmQtb3ZlcmxheScpKTtcblx0XHRsZXQgb3ZlcmxheVRleHQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgaXNEcm9wU3VwcG9ydGVkID0gKGU6IERyYWdFdmVudCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0cmV0dXJuIGNvbnRhaW5zRHJhZ1R5cGUoZSwgRGF0YVRyYW5zZmVycy5GSUxFUywgQ29kZURhdGFUcmFuc2ZlcnMuRURJVE9SUywgQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBEYXRhVHJhbnNmZXJzLklOVEVSTkFMX1VSSV9MSVNUKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hvd092ZXJsYXkgPSAoKSA9PiB7XG5cdFx0XHRvdmVybGF5LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdGlmICghb3ZlcmxheVRleHQpIHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBsb2NhbGl6ZSgnYXR0YWNoQXNDb250ZXh0JywgXCJBdHRhY2ggYXMgQ29udGV4dFwiKTtcblx0XHRcdFx0Y29uc3QgaWNvbkFuZFRleHRFbGVtZW50cyA9IHJlbmRlckxhYmVsV2l0aEljb25zKGAkKCR7Q29kaWNvbi5hdHRhY2guaWR9KSAke2xhYmVsfWApO1xuXHRcdFx0XHRjb25zdCBodG1sRWxlbWVudHMgPSBpY29uQW5kVGV4dEVsZW1lbnRzLm1hcChlbGVtZW50ID0+IHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZG9tLiQoJ3NwYW4ub3ZlcmxheS10ZXh0JywgdW5kZWZpbmVkLCBlbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvdmVybGF5VGV4dCA9IGRvbS4kKCdzcGFuLmF0dGFjaC1jb250ZXh0LW92ZXJsYXktdGV4dCcsIHVuZGVmaW5lZCwgLi4uaHRtbEVsZW1lbnRzKTtcblx0XHRcdFx0b3ZlcmxheS5hcHBlbmRDaGlsZChvdmVybGF5VGV4dCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGhpZGVPdmVybGF5ID0gKCkgPT4ge1xuXHRcdFx0b3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0XHRvdmVybGF5VGV4dD8ucmVtb3ZlKCk7XG5cdFx0XHRvdmVybGF5VGV4dCA9IHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIoZG5kQ29udGFpbmVyLCB7XG5cdFx0XHRvbkRyYWdPdmVyOiAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoaXNEcm9wU3VwcG9ydGVkKGUpKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKGUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0XHRlLmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzaG93T3ZlcmxheSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6ICgpID0+IHtcblx0XHRcdFx0aGlkZU92ZXJsYXkoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyb3A6IGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0aGlkZU92ZXJsYXkoKTtcblxuXHRcdFx0XHQvLyBFeHRyYWN0IGVkaXRvciBkYXRhIGZyb20gVlMgQ29kZSBpbnRlcm5hbCBkcmFncyAoZS5nLiwgZXhwbG9yZXIgdmlldylcblx0XHRcdFx0Y29uc3QgZWRpdG9yRHJvcERhdGEgPSBleHRyYWN0RWRpdG9yc0Ryb3BEYXRhKGUpO1xuXHRcdFx0XHRpZiAoZWRpdG9yRHJvcERhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvckRyb3BEYXRhKSB7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2F0dGFjaEZpbGVVcmkoZWRpdG9yLnJlc291cmNlLCBiYXNlbmFtZShlZGl0b3IucmVzb3VyY2UpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmFsbGJhY2s6IHRyeSBuYXRpdmUgZmlsZSBpdGVtc1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IGUuZGF0YVRyYW5zZmVyPy5pdGVtcztcblx0XHRcdFx0aWYgKGl0ZW1zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIEFycmF5LmZyb20oaXRlbXMpKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSAnZmlsZScpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmlsZSA9IGl0ZW0uZ2V0QXNGaWxlKCk7XG5cdFx0XHRcdFx0XHRcdGlmICghZmlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZpbGVQYXRoID0gZ2V0UGF0aEZvckZpbGUoZmlsZSk7XG5cdFx0XHRcdFx0XHRcdGlmICghZmlsZVBhdGgpIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShmaWxlUGF0aCk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2F0dGFjaEZpbGVVcmkodXJpLCBmaWxlLm5hbWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gUGFzdGUgLS0tXG5cblx0cmVnaXN0ZXJQYXN0ZUhhbmRsZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwb3J0ZWRNaW1lVHlwZXMgPSBbXG5cdFx0XHQnaW1hZ2UvcG5nJyxcblx0XHRcdCdpbWFnZS9qcGVnJyxcblx0XHRcdCdpbWFnZS9qcGcnLFxuXHRcdFx0J2ltYWdlL2JtcCcsXG5cdFx0XHQnaW1hZ2UvZ2lmJyxcblx0XHRcdCdpbWFnZS90aWZmJ1xuXHRcdF07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuUEFTVEUsIGFzeW5jIChlOiBDbGlwYm9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBlLmNsaXBib2FyZERhdGE/Lml0ZW1zO1xuXHRcdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIHN5bmNocm9ub3VzbHkgZm9yIGltYWdlIGRhdGEgYmVmb3JlIGFueSBhc3luYyB3b3JrXG5cdFx0XHQvLyBzbyBwcmV2ZW50RGVmYXVsdCBzdG9wcyB0aGUgZWRpdG9yIGZyb20gaW5zZXJ0aW5nIHRleHQuXG5cdFx0XHRsZXQgaW1hZ2VGaWxlOiBGaWxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIEFycmF5LmZyb20oaXRlbXMpKSB7XG5cdFx0XHRcdGlmICghaXRlbS50eXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpIHx8ICFzdXBwb3J0ZWRNaW1lVHlwZXMuaW5jbHVkZXMoaXRlbS50eXBlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZpbGUgPSBpdGVtLmdldEFzRmlsZSgpO1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGltYWdlRmlsZSA9IGZpbGU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFpbWFnZUZpbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGltYWdlRmlsZS5hcnJheUJ1ZmZlcigpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBVaW50OEFycmF5KGFycmF5QnVmZmVyKTtcblx0XHRcdGlmICghaXNJbWFnZShkYXRhKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc2l6ZWREYXRhID0gYXdhaXQgcmVzaXplSW1hZ2UoZGF0YSwgaW1hZ2VGaWxlLnR5cGUpO1xuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSB0aGlzLl9nZXRVbmlxdWVJbWFnZU5hbWUoKTtcblxuXHRcdFx0dGhpcy5fYWRkQXR0YWNobWVudHMoe1xuXHRcdFx0XHRpZDogYXdhaXQgaW1hZ2VUb0hhc2gocmVzaXplZERhdGEpLFxuXHRcdFx0XHRuYW1lOiBkaXNwbGF5TmFtZSxcblx0XHRcdFx0ZnVsbE5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0XHR2YWx1ZTogcmVzaXplZERhdGEsXG5cdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHR9KTtcblx0XHR9LCB0cnVlKSk7XG5cdH1cblxuXHQvLyAtLS0gUGlja2VyIC0tLVxuXG5cdHNob3dQaWNrZXIoZm9sZGVyVXJpPzogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgcGlja2VyID0gdGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoLnBsYWNlaG9sZGVyJywgXCJBdHRhY2ggYXMgY29udGV4dC4uLlwiKTtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRwaWNrZXIuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHN0YXRpY1BpY2tzOiAoSVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZpbGVzJywgXCJGaWxlcy4uLlwiKSxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5maWxlKSxcblx0XHRcdFx0aWQ6ICdzZXNzaW9ucy5maWxlc0FuZEZvbGRlcnMnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbWFnZUZyb21DbGlwYm9hcmQnLCBcIkltYWdlIGZyb20gQ2xpcGJvYXJkXCIpLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZpbGVNZWRpYSksXG5cdFx0XHRcdGlkOiAnc2Vzc2lvbnMuaW1hZ2VGcm9tQ2xpcGJvYXJkJyxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdHBpY2tlci5pdGVtcyA9IHN0YXRpY1BpY2tzO1xuXHRcdHBpY2tlci5zaG93KCk7XG5cblx0XHRpZiAoZm9sZGVyVXJpKSB7XG5cdFx0XHRsZXQgc2VhcmNoQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBkZWJvdW5jZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcnVuU2VhcmNoID0gKGZpbGVQYXR0ZXJuPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHNlYXJjaEN0cz8uZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0c2VhcmNoQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gc2VhcmNoQ3RzLnRva2VuO1xuXG5cdFx0XHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY29sbGVjdEZpbGVQaWNrcyhmb2xkZXJVcmksIGZpbGVQYXR0ZXJuLCB0b2tlbikudGhlbihmaWxlUGlja3MgPT4ge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChmaWxlUGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gW1xuXHRcdFx0XHRcdFx0XHQuLi5zdGF0aWNQaWNrcyxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGJhc2VuYW1lKGZvbGRlclVyaSkgfSxcblx0XHRcdFx0XHRcdFx0Li4uZmlsZVBpY2tzLFxuXHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gc3RhdGljUGlja3M7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdC8vIEluaXRpYWwgc2VhcmNoIChubyBmaWx0ZXIpXG5cdFx0XHRydW5TZWFyY2goKTtcblxuXHRcdFx0Ly8gUmUtc2VhcmNoIG9uIHVzZXIgaW5wdXQgd2l0aCBkZWJvdW5jZVxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0aWYgKGRlYm91bmNlVGltZXIpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoZGVib3VuY2VUaW1lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcnVuU2VhcmNoKHZhbHVlIHx8IHVuZGVmaW5lZCksIDIwMCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgc2VhcmNoQ3RzPy5kaXNwb3NlKHRydWUpOyBpZiAoZGVib3VuY2VUaW1lcikgeyBjbGVhclRpbWVvdXQoZGVib3VuY2VUaW1lcik7IH0gfSB9KTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFtzZWxlY3RlZF0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmICghc2VsZWN0ZWQpIHtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXG5cdFx0XHRpZiAoc2VsZWN0ZWQuaWQgPT09ICdzZXNzaW9ucy5maWxlc0FuZEZvbGRlcnMnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUZpbGVEaWFsb2coKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWQuaWQgPT09ICdzZXNzaW9ucy5pbWFnZUZyb21DbGlwYm9hcmQnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUNsaXBib2FyZEltYWdlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkLmlkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2F0dGFjaEZpbGVVcmkoVVJJLnBhcnNlKHNlbGVjdGVkLmlkKSwgc2VsZWN0ZWQubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGVjdEZpbGVQaWNrcyhyb290VXJpOiBVUkksIGZpbGVQYXR0ZXJuPzogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUXVpY2tQaWNrSXRlbVtdPiB7XG5cdFx0Y29uc3QgbWF4RmlsZXMgPSAyMDA7XG5cblx0XHQvLyBGb3IgbG9jYWwgZmlsZTovLyBVUklzLCB1c2UgdGhlIHNlYXJjaCBzZXJ2aWNlIHdoaWNoIHJlc3BlY3RzIC5naXRpZ25vcmUgYW5kIGV4Y2x1ZGVzXG5cdFx0aWYgKHJvb3RVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgcm9vdFVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdEZpbGVQaWNrc1ZpYVNlYXJjaChyb290VXJpLCBtYXhGaWxlcywgZmlsZVBhdHRlcm4sIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgdmlydHVhbCBmaWxlc3lzdGVtcyAoZS5nLiBnaXRodWItcmVtb3RlLWZpbGU6Ly8pLCB3YWxrIHRoZSB0cmVlIHZpYSBJRmlsZVNlcnZpY2Vcblx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdEZpbGVQaWNrc1ZpYUZpbGVTZXJ2aWNlKHJvb3RVcmksIG1heEZpbGVzLCBmaWxlUGF0dGVybik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb2xsZWN0RmlsZVBpY2tzVmlhU2VhcmNoKHJvb3RVcmk6IFVSSSwgbWF4RmlsZXM6IG51bWJlciwgZmlsZVBhdHRlcm4/OiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IGdldEV4Y2x1ZGVzKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHJvb3RVcmkgfSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlYXJjaFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKHtcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0XHRmb2xkZXI6IHJvb3RVcmksXG5cdFx0XHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6IGZhbHNlLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiBmaWxlUGF0dGVybiB8fCAnJyxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm4sXG5cdFx0XHRcdHNvcnRCeVNjb3JlOiB0cnVlLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiBtYXhGaWxlcyxcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIHNlYXJjaFJlc3VsdC5yZXN1bHRzLm1hcChyZXN1bHQgPT4gKHtcblx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKHJlc3VsdC5yZXNvdXJjZSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXN1bHQucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSksXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHJlc3VsdC5yZXNvdXJjZSwgRmlsZUtpbmQuRklMRSksXG5cdFx0XHRcdGlkOiByZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdH0gc2F0aXNmaWVzIElRdWlja1BpY2tJdGVtKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGVjdEZpbGVQaWNrc1ZpYUZpbGVTZXJ2aWNlKHJvb3RVcmk6IFVSSSwgbWF4RmlsZXM6IG51bWJlciwgZmlsZVBhdHRlcm4/OiBzdHJpbmcpOiBQcm9taXNlPElRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBwaWNrczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGNvbnN0IHBhdHRlcm5Mb3dlciA9IGZpbGVQYXR0ZXJuPy50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IG1heERlcHRoID0gMTA7XG5cblx0XHRjb25zdCBjb2xsZWN0ID0gYXN5bmMgKHVyaTogVVJJLCBkZXB0aDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRpZiAocGlja3MubGVuZ3RoID49IG1heEZpbGVzIHx8IGRlcHRoID4gbWF4RGVwdGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHVyaSk7XG5cdFx0XHRcdGlmICghc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gc3RhdC5jaGlsZHJlbi5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRpZiAoYS5pc0RpcmVjdG9yeSAhPT0gYi5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGEuaXNEaXJlY3RvcnkgPyAtMSA6IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA+PSBtYXhGaWxlcykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgY29sbGVjdChjaGlsZC5yZXNvdXJjZSwgZGVwdGggKyAxKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHBhdHRlcm5Mb3dlciAmJiAhY2hpbGQubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBhdHRlcm5Mb3dlcikpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChjaGlsZC5yZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzKHRoaXMubW9kZWxTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgY2hpbGQucmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUpLFxuXHRcdFx0XHRcdFx0XHRpZDogY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgZm9yIGluZGl2aWR1YWwgZGlyZWN0b3JpZXNcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgY29sbGVjdChyb290VXJpLCAwKTtcblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVGaWxlRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGaWxlczogdHJ1ZSxcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiB0cnVlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RGaWxlc09yRm9sZGVycycsIFwiU2VsZWN0IEZpbGVzIG9yIEZvbGRlcnNcIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHNlbGVjdGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hdHRhY2hGaWxlVXJpKHVyaSwgYmFzZW5hbWUodXJpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoRmlsZVVyaSh1cmk6IFVSSSwgbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhpcy5fYWRkQXR0YWNobWVudHMoe1xuXHRcdFx0XHRraW5kOiAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKC9cXC4ocG5nfGpwZ3xqcGVnfGJtcHxnaWZ8dGlmZikkL2kudGVzdCh1cmkucGF0aCkpIHtcblx0XHRcdGNvbnN0IHJlYWRGaWxlID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgcmVzaXplZEltYWdlID0gYXdhaXQgcmVzaXplSW1hZ2UocmVhZEZpbGUudmFsdWUuYnVmZmVyKTtcblx0XHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKHtcblx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRmdWxsTmFtZTogbmFtZSxcblx0XHRcdFx0dmFsdWU6IHJlc2l6ZWRJbWFnZSxcblx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiB1cmksIGtpbmQ6ICdyZWZlcmVuY2UnIH1dXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0b21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLkZ1bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKHtcblx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRpZDogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZhbHVlOiB1cmksXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdG9taXR0ZWRTdGF0ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNsaXBib2FyZEltYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGltYWdlRGF0YSA9IGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS5yZWFkSW1hZ2UoKTtcblx0XHRpZiAoIWlzSW1hZ2UoaW1hZ2VEYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gdGhpcy5fZ2V0VW5pcXVlSW1hZ2VOYW1lKCk7XG5cblx0XHR0aGlzLl9hZGRBdHRhY2htZW50cyh7XG5cdFx0XHRpZDogYXdhaXQgaW1hZ2VUb0hhc2goaW1hZ2VEYXRhKSxcblx0XHRcdG5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0ZnVsbE5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0dmFsdWU6IGltYWdlRGF0YSxcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gU3RhdGUgbWFuYWdlbWVudCAtLS1cblxuXHRwcml2YXRlIF9nZXRVbmlxdWVJbWFnZU5hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBiYXNlTmFtZSA9IGxvY2FsaXplKCdwYXN0ZWRJbWFnZScsIFwiUGFzdGVkIEltYWdlXCIpO1xuXHRcdGxldCBuYW1lID0gYmFzZU5hbWU7XG5cdFx0Zm9yIChsZXQgaSA9IDI7IHRoaXMuX2F0dGFjaGVkQ29udGV4dC5zb21lKGEgPT4gYS5uYW1lID09PSBuYW1lKTsgaSsrKSB7XG5cdFx0XHRuYW1lID0gYCR7YmFzZU5hbWV9ICR7aX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZTtcblx0fVxuXG5cdGFkZEF0dGFjaG1lbnRzKC4uLmVudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKC4uLmVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQXR0YWNobWVudHMoLi4uZW50cmllczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2F0dGFjaGVkQ29udGV4dC5zb21lKGUgPT4gZS5pZCA9PT0gZW50cnkuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaGVkQ29udGV4dC5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlUmVuZGVyaW5nKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfcmVtb3ZlQXR0YWNobWVudChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9hdHRhY2hlZENvbnRleHQuZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hlZENvbnRleHQuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJlbmRlcmluZygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9hdHRhY2hlZENvbnRleHQubGVuZ3RoID0gMDtcblx0XHR0aGlzLl91cGRhdGVSZW5kZXJpbmcoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZmlyZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksNEJBQTRCO0FBQ2pELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsc0JBQXNCO0FBQy9CLFNB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
