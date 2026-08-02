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
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { $, DragAndDropObserver } from "../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { UriList } from "../../../../../base/common/dataTransfer.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { DraggedChatReferenceIdentifier, CodeDataTransfers, containsDragType, extractChatReferenceDropData, extractEditorsDropData, extractMarkerDropData, extractNotebookCellOutputDropData, extractSymbolDropData, LocalSelectionTransfer } from "../../../../../platform/dnd/browser/dnd.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IThemeService, Themable } from "../../../../../platform/theme/common/themeService.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { extractSCMHistoryItemDropData } from "../../../scm/browser/scmHistoryChatContext.js";
import { isAgentHostTarget } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { isCrossAgentHostChatReferenceDrop, isSelfChatReferenceDrop, resolveChatReferenceDropEntry } from "./chatReferenceDrop.js";
import { convertStringToUInt8Array } from "../chatImageUtils.js";
var ChatDragAndDropType = /* @__PURE__ */ ((ChatDragAndDropType2) => {
  ChatDragAndDropType2[ChatDragAndDropType2["CHAT_REFERENCE"] = 0] = "CHAT_REFERENCE";
  ChatDragAndDropType2[ChatDragAndDropType2["FILE_INTERNAL"] = 1] = "FILE_INTERNAL";
  ChatDragAndDropType2[ChatDragAndDropType2["FILE_EXTERNAL"] = 2] = "FILE_EXTERNAL";
  ChatDragAndDropType2[ChatDragAndDropType2["FOLDER"] = 3] = "FOLDER";
  ChatDragAndDropType2[ChatDragAndDropType2["IMAGE"] = 4] = "IMAGE";
  ChatDragAndDropType2[ChatDragAndDropType2["SYMBOL"] = 5] = "SYMBOL";
  ChatDragAndDropType2[ChatDragAndDropType2["HTML"] = 6] = "HTML";
  ChatDragAndDropType2[ChatDragAndDropType2["MARKER"] = 7] = "MARKER";
  ChatDragAndDropType2[ChatDragAndDropType2["NOTEBOOK_CELL_OUTPUT"] = 8] = "NOTEBOOK_CELL_OUTPUT";
  ChatDragAndDropType2[ChatDragAndDropType2["SCM_HISTORY_ITEM"] = 9] = "SCM_HISTORY_ITEM";
  return ChatDragAndDropType2;
})(ChatDragAndDropType || {});
const IMAGE_DATA_REGEX = /^data:image\/[a-z]+;base64,/;
const URL_REGEX = /^https?:\/\/.+/;
let ChatDragAndDrop = class extends Themable {
  constructor(widgetRef, attachmentModel, styles, themeService, extensionService, webContentExtractorService, logService, chatAttachmentResolveService) {
    super(themeService);
    this.widgetRef = widgetRef;
    this.attachmentModel = attachmentModel;
    this.styles = styles;
    this.extensionService = extensionService;
    this.webContentExtractorService = webContentExtractorService;
    this.logService = logService;
    this.chatAttachmentResolveService = chatAttachmentResolveService;
    this.overlays = /* @__PURE__ */ new Map();
    this.overlayTextBackground = "";
    this.disableOverlay = false;
    /**
     * In-process transfer for a dragged chat reference. Readable during
     * `dragover` (unlike the `dataTransfer` mime payload), so the self-reference
     * guard can suppress the overlay when a chat is dragged onto its own input.
     */
    this.chatReferenceTransfer = LocalSelectionTransfer.getInstance();
    this.currentActiveTarget = void 0;
    this.updateStyles();
    this._register(toDisposable(() => {
      this.overlays.forEach(({ overlay, disposable }) => {
        disposable.dispose();
        overlay.remove();
      });
      this.overlays.clear();
      this.currentActiveTarget = void 0;
      this.overlayText?.remove();
      this.overlayText = void 0;
    }));
  }
  addOverlay(target, overlayContainer) {
    this.removeOverlay(target);
    const { overlay, disposable } = this.createOverlay(target, overlayContainer);
    this.overlays.set(target, { overlay, disposable });
  }
  removeOverlay(target) {
    if (this.currentActiveTarget === target) {
      this.currentActiveTarget = void 0;
    }
    const existingOverlay = this.overlays.get(target);
    if (existingOverlay) {
      existingOverlay.overlay.remove();
      existingOverlay.disposable.dispose();
      this.overlays.delete(target);
    }
  }
  setDisabledOverlay(disable) {
    this.disableOverlay = disable;
  }
  createOverlay(target, overlayContainer) {
    const overlay = document.createElement("div");
    overlay.classList.add("chat-dnd-overlay");
    this.updateOverlayStyles(overlay);
    overlayContainer.appendChild(overlay);
    const disposable = new DragAndDropObserver(target, {
      onDragOver: (e) => {
        if (this.disableOverlay) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        if (target === this.currentActiveTarget) {
          return;
        }
        if (this.currentActiveTarget) {
          this.setOverlay(this.currentActiveTarget, void 0);
        }
        this.currentActiveTarget = target;
        this.onDragEnter(e, target);
      },
      onDragLeave: (e) => {
        if (this.disableOverlay) {
          return;
        }
        if (target === this.currentActiveTarget) {
          this.currentActiveTarget = void 0;
        }
        this.onDragLeave(e, target);
      },
      onDrop: (e) => {
        if (this.disableOverlay) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        if (target !== this.currentActiveTarget) {
          return;
        }
        this.currentActiveTarget = void 0;
        this.onDrop(e, target);
      }
    });
    return { overlay, disposable };
  }
  onDragEnter(e, target) {
    const estimatedDropType = this.guessDropType(e);
    this.updateDropFeedback(e, target, estimatedDropType);
  }
  onDragLeave(e, target) {
    this.updateDropFeedback(e, target, void 0);
  }
  onDrop(e, target) {
    this.updateDropFeedback(e, target, void 0);
    this.drop(e);
  }
  async drop(e) {
    const contexts = await this.resolveAttachmentsFromDragEvent(e);
    if (contexts.length === 0) {
      return;
    }
    this.attachmentModel.addContext(...contexts);
  }
  updateDropFeedback(e, target, dropType) {
    const showOverlay = dropType !== void 0;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = showOverlay ? "copy" : "none";
    }
    this.setOverlay(target, dropType);
  }
  guessDropType(e) {
    if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
      return this.guessChatReferenceDropType(e);
    } else if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
      return 8 /* NOTEBOOK_CELL_OUTPUT */;
    } else if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
      return 9 /* SCM_HISTORY_ITEM */;
    } else if (containsImageDragType(e)) {
      return this.extensionService.extensions.some((ext) => isProposedApiEnabled(ext, "chatReferenceBinaryData")) ? 4 /* IMAGE */ : void 0;
    } else if (containsDragType(e, "text/html")) {
      return 6 /* HTML */;
    } else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
      return 5 /* SYMBOL */;
    } else if (containsDragType(e, CodeDataTransfers.MARKERS)) {
      return 7 /* MARKER */;
    } else if (containsDragType(e, DataTransfers.FILES)) {
      return 2 /* FILE_EXTERNAL */;
    } else if (containsDragType(e, CodeDataTransfers.EDITORS)) {
      return 1 /* FILE_INTERNAL */;
    } else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST)) {
      return 3 /* FOLDER */;
    }
    return void 0;
  }
  /**
   * Resolves the drop type for a dragged chat reference. Only agent-host-backed
   * chat inputs can reference another chat, and a chat may reference any other
   * chat of the *same agent host* — including one from a different session shown
   * side by side in the Agents window.
   *
   * Two payload-dependent guards suppress the overlay entirely (rather than
   * appearing droppable and then doing nothing):
   * - a self-reference (a chat dropped onto its *own* input), and
   * - a cross-agent-host reference, which the owning host could never resolve.
   *
   * The dragged chat's client resource is read from the in-process
   * {@link LocalSelectionTransfer} (readable during `dragover`) with the
   * `dataTransfer` mime payload as a fallback (readable on `drop`), and compared
   * against this input's own client session resource. Both are opaque client
   * URIs, so the workbench never touches an AHP chat URI.
   */
  guessChatReferenceDropType(e) {
    const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
    if (!sessionResource || !isAgentHostTarget(getChatSessionType(sessionResource))) {
      return void 0;
    }
    const droppedClientResource = this.getDraggedClientResource(e);
    if (droppedClientResource !== void 0 && (isSelfChatReferenceDrop(droppedClientResource, sessionResource.toString()) || isCrossAgentHostChatReferenceDrop(droppedClientResource, sessionResource.toString()))) {
      return void 0;
    }
    return 0 /* CHAT_REFERENCE */;
  }
  /**
   * The client resource of the dragged chat reference (used only for
   * self-reference identity comparison). Prefers the in-process local transfer
   * (available during `dragover`), falling back to the `dataTransfer` mime
   * payload (only readable on `drop`). Returns `undefined` when neither source
   * carries a chat reference.
   */
  getDraggedClientResource(e) {
    const local = this.chatReferenceTransfer.getData(DraggedChatReferenceIdentifier.prototype);
    if (local && local.length > 0) {
      return local[0].clientResource;
    }
    return extractChatReferenceDropData(e)?.clientResource;
  }
  isDragEventSupported(e) {
    const dropType = this.guessDropType(e);
    return dropType !== void 0;
  }
  getDropTypeName(type) {
    switch (type) {
      case 1 /* FILE_INTERNAL */:
        return localize("file", "File");
      case 2 /* FILE_EXTERNAL */:
        return localize("file", "File");
      case 3 /* FOLDER */:
        return localize("folder", "Folder");
      case 4 /* IMAGE */:
        return localize("image", "Image");
      case 5 /* SYMBOL */:
        return localize("symbol", "Symbol");
      case 7 /* MARKER */:
        return localize("problem", "Problem");
      case 6 /* HTML */:
        return localize("url", "URL");
      case 8 /* NOTEBOOK_CELL_OUTPUT */:
        return localize("notebookOutput", "Output");
      case 9 /* SCM_HISTORY_ITEM */:
        return localize("scmHistoryItem", "Change");
      case 0 /* CHAT_REFERENCE */:
        return localize("chat", "Chat");
    }
  }
  async resolveAttachmentsFromDragEvent(e) {
    if (!this.isDragEventSupported(e)) {
      return [];
    }
    if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
      return this.resolveChatReferenceAttachContext(e);
    }
    if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
      const notebookOutputData = extractNotebookCellOutputDropData(e);
      if (notebookOutputData) {
        return this.chatAttachmentResolveService.resolveNotebookOutputAttachContext(notebookOutputData);
      }
    }
    if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
      const scmHistoryItemData = extractSCMHistoryItemDropData(e);
      if (scmHistoryItemData) {
        return this.chatAttachmentResolveService.resolveSourceControlHistoryItemAttachContext(scmHistoryItemData);
      }
    }
    const markerData = extractMarkerDropData(e);
    if (markerData) {
      return this.chatAttachmentResolveService.resolveMarkerAttachContext(markerData);
    }
    if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
      const symbolsData = extractSymbolDropData(e);
      return this.chatAttachmentResolveService.resolveSymbolsAttachContext(symbolsData);
    }
    const editorDragData = extractEditorsDropData(e);
    if (editorDragData.length > 0) {
      return coalesce(await Promise.all(editorDragData.map((editorInput) => {
        return this.chatAttachmentResolveService.resolveEditorAttachContext(editorInput);
      })));
    }
    const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);
    if (internal) {
      const uriList = UriList.parse(internal);
      if (uriList.length) {
        return coalesce(await Promise.all(
          uriList.map((uri) => this.chatAttachmentResolveService.resolveEditorAttachContext({ resource: URI.parse(uri) }))
        ));
      }
    }
    if (!containsDragType(e, DataTransfers.INTERNAL_URI_LIST) && containsDragType(e, Mimes.uriList) && (containsDragType(e, Mimes.html) || containsDragType(e, Mimes.text))) {
      return this.resolveHTMLAttachContext(e);
    }
    return [];
  }
  /**
   * Resolves a dropped chat reference (a chat tab from the Agents window) to a
   * plain chat-reference attachment (a pill) — the same shape every other drop
   * type produces, with no inline text, range, or editor manipulation.
   *
   * The target must be an agent-host-backed input; the actual resolution and
   * the self / cross-agent-host guards live in {@link resolveChatReferenceDropEntry}.
   * Returns `[]` when any guard rejects.
   */
  resolveChatReferenceAttachContext(e) {
    const data = extractChatReferenceDropData(e);
    if (!data) {
      return [];
    }
    const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
    const ownClientResource = sessionResource && isAgentHostTarget(getChatSessionType(sessionResource)) ? sessionResource.toString() : void 0;
    const entry = resolveChatReferenceDropEntry(data, ownClientResource);
    return entry ? [entry] : [];
  }
  async downloadImageAsUint8Array(url) {
    try {
      const extractedImages = await this.webContentExtractorService.readImage(URI.parse(url), CancellationToken.None);
      if (extractedImages) {
        return extractedImages.buffer;
      }
    } catch (error) {
      this.logService.warn("Fetch failed:", error);
    }
    const widget = this.widgetRef();
    const selection = widget?.inputEditor.getSelection();
    if (selection && widget) {
      widget.inputEditor.executeEdits("chatInsertUrl", [{ range: selection, text: url }]);
    }
    this.logService.warn(`Image URLs must end in .jpg, .png, .gif, .webp, or .bmp. Failed to fetch image from this URL: ${url}`);
    return void 0;
  }
  async resolveHTMLAttachContext(e) {
    const existingAttachmentNames = new Set(this.attachmentModel.attachments.map((attachment) => attachment.name));
    const createDisplayName = () => {
      const baseName = localize("dragAndDroppedImageName", "Image from URL");
      let uniqueName = baseName;
      let baseNameInstance = 1;
      while (existingAttachmentNames.has(uniqueName)) {
        uniqueName = `${baseName} ${++baseNameInstance}`;
      }
      existingAttachmentNames.add(uniqueName);
      return uniqueName;
    };
    const getImageTransferDataFromUrl = async (url) => {
      const resource = URI.parse(url);
      if (IMAGE_DATA_REGEX.test(url)) {
        return { data: convertStringToUInt8Array(url), name: createDisplayName(), resource };
      }
      if (URL_REGEX.test(url)) {
        const data = await this.downloadImageAsUint8Array(url);
        if (data) {
          return { data, name: createDisplayName(), resource, id: url };
        }
      }
      return void 0;
    };
    const getImageTransferDataFromFile = async (file) => {
      try {
        const buffer = await file.arrayBuffer();
        return { data: new Uint8Array(buffer), name: createDisplayName() };
      } catch (error) {
        this.logService.error("Error reading file:", error);
      }
      return void 0;
    };
    const imageTransferData = [];
    const imageFiles = extractImageFilesFromDragEvent(e);
    if (imageFiles.length) {
      const imageTransferDataFromFiles = await Promise.all(imageFiles.map((file) => getImageTransferDataFromFile(file)));
      imageTransferData.push(...imageTransferDataFromFiles.filter((data) => !!data));
    }
    const imageUrls = extractUrlsFromDragEvent(e);
    if (imageUrls.length) {
      const imageTransferDataFromUrl = await Promise.all(imageUrls.map(getImageTransferDataFromUrl));
      imageTransferData.push(...imageTransferDataFromUrl.filter((data) => !!data));
    }
    return await this.chatAttachmentResolveService.resolveImageAttachContext(imageTransferData);
  }
  setOverlay(target, type) {
    this.overlayText?.remove();
    this.overlayText = void 0;
    const { overlay } = this.overlays.get(target);
    if (type !== void 0) {
      const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${this.getOverlayText(type)}`);
      const htmlElements = iconAndtextElements.map((element) => {
        if (typeof element === "string") {
          return $("span.overlay-text", void 0, element);
        }
        return element;
      });
      this.overlayText = $("span.attach-context-overlay-text", void 0, ...htmlElements);
      this.overlayText.style.backgroundColor = this.overlayTextBackground;
      overlay.appendChild(this.overlayText);
    }
    overlay.classList.toggle("visible", type !== void 0);
  }
  getOverlayText(type) {
    const typeName = this.getDropTypeName(type);
    return localize("attacAsContext", "Attach {0} as Context", typeName);
  }
  updateOverlayStyles(overlay) {
    overlay.style.backgroundColor = this.getColor(this.styles.overlayBackground) || "";
    overlay.style.color = this.getColor(this.styles.listForeground) || "";
  }
  updateStyles() {
    this.overlays.forEach((overlay) => this.updateOverlayStyles(overlay.overlay));
    this.overlayTextBackground = this.getColor(this.styles.listBackground) || "";
  }
};
ChatDragAndDrop = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, ISharedWebContentExtractorService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IChatAttachmentResolveService)
], ChatDragAndDrop);
function containsImageDragType(e) {
  if (containsDragType(e, "image")) {
    return true;
  }
  if (containsDragType(e, DataTransfers.FILES)) {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      return Array.from(files).some((file) => file.type.startsWith("image/"));
    }
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      return Array.from(items).some((item) => item.type.startsWith("image/"));
    }
  }
  return false;
}
function extractUrlsFromDragEvent(e, logService) {
  const textUrl = e.dataTransfer?.getData("text/uri-list");
  if (textUrl) {
    try {
      const urls = UriList.parse(textUrl);
      if (urls.length > 0) {
        return urls;
      }
    } catch (error) {
      logService?.error("Error parsing URI list:", error);
      return [];
    }
  }
  return [];
}
function extractImageFilesFromDragEvent(e) {
  const files = e.dataTransfer?.files;
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}
export {
  ChatDragAndDrop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdERyYWdBbmREcm9wLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgJCwgRHJhZ0FuZERyb3BPYnNlcnZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFVyaUxpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERyYWdnZWRDaGF0UmVmZXJlbmNlSWRlbnRpZmllciwgQ29kZURhdGFUcmFuc2ZlcnMsIGNvbnRhaW5zRHJhZ1R5cGUsIGV4dHJhY3RDaGF0UmVmZXJlbmNlRHJvcERhdGEsIGV4dHJhY3RFZGl0b3JzRHJvcERhdGEsIGV4dHJhY3RNYXJrZXJEcm9wRGF0YSwgZXh0cmFjdE5vdGVib29rQ2VsbE91dHB1dERyb3BEYXRhLCBleHRyYWN0U3ltYm9sRHJvcERhdGEsIExvY2FsU2VsZWN0aW9uVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9jb21tb24vd2ViQ29udGVudEV4dHJhY3Rvci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGV4dHJhY3RTQ01IaXN0b3J5SXRlbURyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudE1vZGVsIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSwgSW1hZ2VUcmFuc2ZlckRhdGEgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ3Jvc3NBZ2VudEhvc3RDaGF0UmVmZXJlbmNlRHJvcCwgaXNTZWxmQ2hhdFJlZmVyZW5jZURyb3AsIHJlc29sdmVDaGF0UmVmZXJlbmNlRHJvcEVudHJ5IH0gZnJvbSAnLi9jaGF0UmVmZXJlbmNlRHJvcC5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0U3R5bGVzIH0gZnJvbSAnLi9pbnB1dC9jaGF0SW5wdXRQYXJ0LmpzJztcbmltcG9ydCB7IGNvbnZlcnRTdHJpbmdUb1VJbnQ4QXJyYXkgfSBmcm9tICcuLi9jaGF0SW1hZ2VVdGlscy5qcyc7XG5cbmVudW0gQ2hhdERyYWdBbmREcm9wVHlwZSB7XG5cdENIQVRfUkVGRVJFTkNFLFxuXHRGSUxFX0lOVEVSTkFMLFxuXHRGSUxFX0VYVEVSTkFMLFxuXHRGT0xERVIsXG5cdElNQUdFLFxuXHRTWU1CT0wsXG5cdEhUTUwsXG5cdE1BUktFUixcblx0Tk9URUJPT0tfQ0VMTF9PVVRQVVQsXG5cdFNDTV9ISVNUT1JZX0lURU1cbn1cblxuY29uc3QgSU1BR0VfREFUQV9SRUdFWCA9IC9eZGF0YTppbWFnZVxcL1thLXpdKztiYXNlNjQsLztcbmNvbnN0IFVSTF9SRUdFWCA9IC9eaHR0cHM/OlxcL1xcLy4rLztcblxuZXhwb3J0IGNsYXNzIENoYXREcmFnQW5kRHJvcCBleHRlbmRzIFRoZW1hYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJsYXlzOiBNYXA8SFRNTEVsZW1lbnQsIHsgb3ZlcmxheTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIG92ZXJsYXlUZXh0PzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgb3ZlcmxheVRleHRCYWNrZ3JvdW5kOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBkaXNhYmxlT3ZlcmxheTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBJbi1wcm9jZXNzIHRyYW5zZmVyIGZvciBhIGRyYWdnZWQgY2hhdCByZWZlcmVuY2UuIFJlYWRhYmxlIGR1cmluZ1xuXHQgKiBgZHJhZ292ZXJgICh1bmxpa2UgdGhlIGBkYXRhVHJhbnNmZXJgIG1pbWUgcGF5bG9hZCksIHNvIHRoZSBzZWxmLXJlZmVyZW5jZVxuXHQgKiBndWFyZCBjYW4gc3VwcHJlc3MgdGhlIG92ZXJsYXkgd2hlbiBhIGNoYXQgaXMgZHJhZ2dlZCBvbnRvIGl0cyBvd24gaW5wdXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoYXRSZWZlcmVuY2VUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZENoYXRSZWZlcmVuY2VJZGVudGlmaWVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0UmVmOiAoKSA9PiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF0dGFjaG1lbnRNb2RlbDogQ2hhdEF0dGFjaG1lbnRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0eWxlczogSUNoYXRJbnB1dFN0eWxlcyxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlOiBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZTogSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRoZW1lU2VydmljZSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMub3ZlcmxheXMuZm9yRWFjaCgoeyBvdmVybGF5LCBkaXNwb3NhYmxlIH0pID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdG92ZXJsYXkucmVtb3ZlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5vdmVybGF5cy5jbGVhcigpO1xuXHRcdFx0dGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5vdmVybGF5VGV4dD8ucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLm92ZXJsYXlUZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFkZE92ZXJsYXkodGFyZ2V0OiBIVE1MRWxlbWVudCwgb3ZlcmxheUNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW92ZU92ZXJsYXkodGFyZ2V0KTtcblxuXHRcdGNvbnN0IHsgb3ZlcmxheSwgZGlzcG9zYWJsZSB9ID0gdGhpcy5jcmVhdGVPdmVybGF5KHRhcmdldCwgb3ZlcmxheUNvbnRhaW5lcik7XG5cdFx0dGhpcy5vdmVybGF5cy5zZXQodGFyZ2V0LCB7IG92ZXJsYXksIGRpc3Bvc2FibGUgfSk7XG5cdH1cblxuXHRyZW1vdmVPdmVybGF5KHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0ID09PSB0YXJnZXQpIHtcblx0XHRcdHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ092ZXJsYXkgPSB0aGlzLm92ZXJsYXlzLmdldCh0YXJnZXQpO1xuXHRcdGlmIChleGlzdGluZ092ZXJsYXkpIHtcblx0XHRcdGV4aXN0aW5nT3ZlcmxheS5vdmVybGF5LnJlbW92ZSgpO1xuXHRcdFx0ZXhpc3RpbmdPdmVybGF5LmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5vdmVybGF5cy5kZWxldGUodGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRzZXREaXNhYmxlZE92ZXJsYXkoZGlzYWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMuZGlzYWJsZU92ZXJsYXkgPSBkaXNhYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBjdXJyZW50QWN0aXZlVGFyZ2V0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjcmVhdGVPdmVybGF5KHRhcmdldDogSFRNTEVsZW1lbnQsIG92ZXJsYXlDb250YWluZXI6IEhUTUxFbGVtZW50KTogeyBvdmVybGF5OiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfSB7XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnY2hhdC1kbmQtb3ZlcmxheScpO1xuXHRcdHRoaXMudXBkYXRlT3ZlcmxheVN0eWxlcyhvdmVybGF5KTtcblx0XHRvdmVybGF5Q29udGFpbmVyLmFwcGVuZENoaWxkKG92ZXJsYXkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEcmFnQW5kRHJvcE9ic2VydmVyKHRhcmdldCwge1xuXHRcdFx0b25EcmFnT3ZlcjogKGUpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZGlzYWJsZU92ZXJsYXkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0aWYgKHRhcmdldCA9PT0gdGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0T3ZlcmxheSh0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQgPSB0YXJnZXQ7XG5cblx0XHRcdFx0dGhpcy5vbkRyYWdFbnRlcihlLCB0YXJnZXQpO1xuXG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6IChlKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmRpc2FibGVPdmVybGF5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0YXJnZXQgPT09IHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCkge1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMub25EcmFnTGVhdmUoZSwgdGFyZ2V0KTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyb3A6IChlKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmRpc2FibGVPdmVybGF5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRpZiAodGFyZ2V0ICE9PSB0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMub25Ecm9wKGUsIHRhcmdldCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgb3ZlcmxheSwgZGlzcG9zYWJsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdFbnRlcihlOiBEcmFnRXZlbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlc3RpbWF0ZWREcm9wVHlwZSA9IHRoaXMuZ3Vlc3NEcm9wVHlwZShlKTtcblx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayhlLCB0YXJnZXQsIGVzdGltYXRlZERyb3BUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EcmFnTGVhdmUoZTogRHJhZ0V2ZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2soZSwgdGFyZ2V0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyb3AoZTogRHJhZ0V2ZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2soZSwgdGFyZ2V0LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuZHJvcChlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZHJvcChlOiBEcmFnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0cyA9IGF3YWl0IHRoaXMucmVzb2x2ZUF0dGFjaG1lbnRzRnJvbURyYWdFdmVudChlKTtcblx0XHRpZiAoY29udGV4dHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi5jb250ZXh0cyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURyb3BGZWVkYmFjayhlOiBEcmFnRXZlbnQsIHRhcmdldDogSFRNTEVsZW1lbnQsIGRyb3BUeXBlOiBDaGF0RHJhZ0FuZERyb3BUeXBlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvd092ZXJsYXkgPSBkcm9wVHlwZSAhPT0gdW5kZWZpbmVkO1xuXHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9IHNob3dPdmVybGF5ID8gJ2NvcHknIDogJ25vbmUnO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0T3ZlcmxheSh0YXJnZXQsIGRyb3BUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgZ3Vlc3NEcm9wVHlwZShlOiBEcmFnRXZlbnQpOiBDaGF0RHJhZ0FuZERyb3BUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUaGlzIGlzIGFuIGVzdGltYXRpb24gYmFzZWQgb24gdGhlIGRhdGF0cmFuc2ZlciB0eXBlcy9pdGVtc1xuXHRcdGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLkNIQVRfUkVGRVJFTkNFKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ3Vlc3NDaGF0UmVmZXJlbmNlRHJvcFR5cGUoZSk7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLk5PVEVCT09LX0NFTExfT1VUUFVUKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuTk9URUJPT0tfQ0VMTF9PVVRQVVQ7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLlNDTV9ISVNUT1JZX0lURU0pKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERyYWdBbmREcm9wVHlwZS5TQ01fSElTVE9SWV9JVEVNO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNJbWFnZURyYWdUeXBlKGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuc29tZShleHQgPT4gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0LCAnY2hhdFJlZmVyZW5jZUJpbmFyeURhdGEnKSkgPyBDaGF0RHJhZ0FuZERyb3BUeXBlLklNQUdFIDogdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCAndGV4dC9odG1sJykpIHtcblx0XHRcdHJldHVybiBDaGF0RHJhZ0FuZERyb3BUeXBlLkhUTUw7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLlNZTUJPTFMpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERyYWdBbmREcm9wVHlwZS5TWU1CT0w7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLk1BUktFUlMpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERyYWdBbmREcm9wVHlwZS5NQVJLRVI7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIERhdGFUcmFuc2ZlcnMuRklMRVMpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERyYWdBbmREcm9wVHlwZS5GSUxFX0VYVEVSTkFMO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5FRElUT1JTKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuRklMRV9JTlRFUk5BTDtcblx0XHR9IGVsc2UgaWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgTWltZXMudXJpTGlzdCwgQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBEYXRhVHJhbnNmZXJzLklOVEVSTkFMX1VSSV9MSVNUKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuRk9MREVSO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGRyb3AgdHlwZSBmb3IgYSBkcmFnZ2VkIGNoYXQgcmVmZXJlbmNlLiBPbmx5IGFnZW50LWhvc3QtYmFja2VkXG5cdCAqIGNoYXQgaW5wdXRzIGNhbiByZWZlcmVuY2UgYW5vdGhlciBjaGF0LCBhbmQgYSBjaGF0IG1heSByZWZlcmVuY2UgYW55IG90aGVyXG5cdCAqIGNoYXQgb2YgdGhlICpzYW1lIGFnZW50IGhvc3QqIFx1MjAxNCBpbmNsdWRpbmcgb25lIGZyb20gYSBkaWZmZXJlbnQgc2Vzc2lvbiBzaG93blxuXHQgKiBzaWRlIGJ5IHNpZGUgaW4gdGhlIEFnZW50cyB3aW5kb3cuXG5cdCAqXG5cdCAqIFR3byBwYXlsb2FkLWRlcGVuZGVudCBndWFyZHMgc3VwcHJlc3MgdGhlIG92ZXJsYXkgZW50aXJlbHkgKHJhdGhlciB0aGFuXG5cdCAqIGFwcGVhcmluZyBkcm9wcGFibGUgYW5kIHRoZW4gZG9pbmcgbm90aGluZyk6XG5cdCAqIC0gYSBzZWxmLXJlZmVyZW5jZSAoYSBjaGF0IGRyb3BwZWQgb250byBpdHMgKm93biogaW5wdXQpLCBhbmRcblx0ICogLSBhIGNyb3NzLWFnZW50LWhvc3QgcmVmZXJlbmNlLCB3aGljaCB0aGUgb3duaW5nIGhvc3QgY291bGQgbmV2ZXIgcmVzb2x2ZS5cblx0ICpcblx0ICogVGhlIGRyYWdnZWQgY2hhdCdzIGNsaWVudCByZXNvdXJjZSBpcyByZWFkIGZyb20gdGhlIGluLXByb2Nlc3Ncblx0ICoge0BsaW5rIExvY2FsU2VsZWN0aW9uVHJhbnNmZXJ9IChyZWFkYWJsZSBkdXJpbmcgYGRyYWdvdmVyYCkgd2l0aCB0aGVcblx0ICogYGRhdGFUcmFuc2ZlcmAgbWltZSBwYXlsb2FkIGFzIGEgZmFsbGJhY2sgKHJlYWRhYmxlIG9uIGBkcm9wYCksIGFuZCBjb21wYXJlZFxuXHQgKiBhZ2FpbnN0IHRoaXMgaW5wdXQncyBvd24gY2xpZW50IHNlc3Npb24gcmVzb3VyY2UuIEJvdGggYXJlIG9wYXF1ZSBjbGllbnRcblx0ICogVVJJcywgc28gdGhlIHdvcmtiZW5jaCBuZXZlciB0b3VjaGVzIGFuIEFIUCBjaGF0IFVSSS5cblx0ICovXG5cdHByaXZhdGUgZ3Vlc3NDaGF0UmVmZXJlbmNlRHJvcFR5cGUoZTogRHJhZ0V2ZW50KTogQ2hhdERyYWdBbmREcm9wVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy53aWRnZXRSZWYoKT8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UgfHwgIWlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZHJvcHBlZENsaWVudFJlc291cmNlID0gdGhpcy5nZXREcmFnZ2VkQ2xpZW50UmVzb3VyY2UoZSk7XG5cdFx0aWYgKGRyb3BwZWRDbGllbnRSZXNvdXJjZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiAoaXNTZWxmQ2hhdFJlZmVyZW5jZURyb3AoZHJvcHBlZENsaWVudFJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSlcblx0XHRcdFx0fHwgaXNDcm9zc0FnZW50SG9zdENoYXRSZWZlcmVuY2VEcm9wKGRyb3BwZWRDbGllbnRSZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuQ0hBVF9SRUZFUkVOQ0U7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGNsaWVudCByZXNvdXJjZSBvZiB0aGUgZHJhZ2dlZCBjaGF0IHJlZmVyZW5jZSAodXNlZCBvbmx5IGZvclxuXHQgKiBzZWxmLXJlZmVyZW5jZSBpZGVudGl0eSBjb21wYXJpc29uKS4gUHJlZmVycyB0aGUgaW4tcHJvY2VzcyBsb2NhbCB0cmFuc2ZlclxuXHQgKiAoYXZhaWxhYmxlIGR1cmluZyBgZHJhZ292ZXJgKSwgZmFsbGluZyBiYWNrIHRvIHRoZSBgZGF0YVRyYW5zZmVyYCBtaW1lXG5cdCAqIHBheWxvYWQgKG9ubHkgcmVhZGFibGUgb24gYGRyb3BgKS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5laXRoZXIgc291cmNlXG5cdCAqIGNhcnJpZXMgYSBjaGF0IHJlZmVyZW5jZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0RHJhZ2dlZENsaWVudFJlc291cmNlKGU6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmNoYXRSZWZlcmVuY2VUcmFuc2Zlci5nZXREYXRhKERyYWdnZWRDaGF0UmVmZXJlbmNlSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdGlmIChsb2NhbCAmJiBsb2NhbC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxbMF0uY2xpZW50UmVzb3VyY2U7XG5cdFx0fVxuXHRcdHJldHVybiBleHRyYWN0Q2hhdFJlZmVyZW5jZURyb3BEYXRhKGUpPy5jbGllbnRSZXNvdXJjZTtcblx0fVxuXG5cdHByaXZhdGUgaXNEcmFnRXZlbnRTdXBwb3J0ZWQoZTogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gaWYgZ3Vlc3NlZCBkcm9wIHR5cGUgaXMgdW5kZWZpbmVkLCBpdCBtZWFucyB0aGUgZHJvcCBpcyBub3Qgc3VwcG9ydGVkXG5cdFx0Y29uc3QgZHJvcFR5cGUgPSB0aGlzLmd1ZXNzRHJvcFR5cGUoZSk7XG5cdFx0cmV0dXJuIGRyb3BUeXBlICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldERyb3BUeXBlTmFtZSh0eXBlOiBDaGF0RHJhZ0FuZERyb3BUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5GSUxFX0lOVEVSTkFMOiByZXR1cm4gbG9jYWxpemUoJ2ZpbGUnLCAnRmlsZScpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLkZJTEVfRVhURVJOQUw6IHJldHVybiBsb2NhbGl6ZSgnZmlsZScsICdGaWxlJyk7XG5cdFx0XHRjYXNlIENoYXREcmFnQW5kRHJvcFR5cGUuRk9MREVSOiByZXR1cm4gbG9jYWxpemUoJ2ZvbGRlcicsICdGb2xkZXInKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5JTUFHRTogcmV0dXJuIGxvY2FsaXplKCdpbWFnZScsICdJbWFnZScpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLlNZTUJPTDogcmV0dXJuIGxvY2FsaXplKCdzeW1ib2wnLCAnU3ltYm9sJyk7XG5cdFx0XHRjYXNlIENoYXREcmFnQW5kRHJvcFR5cGUuTUFSS0VSOiByZXR1cm4gbG9jYWxpemUoJ3Byb2JsZW0nLCAnUHJvYmxlbScpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLkhUTUw6IHJldHVybiBsb2NhbGl6ZSgndXJsJywgJ1VSTCcpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLk5PVEVCT09LX0NFTExfT1VUUFVUOiByZXR1cm4gbG9jYWxpemUoJ25vdGVib29rT3V0cHV0JywgJ091dHB1dCcpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLlNDTV9ISVNUT1JZX0lURU06IHJldHVybiBsb2NhbGl6ZSgnc2NtSGlzdG9yeUl0ZW0nLCAnQ2hhbmdlJyk7XG5cdFx0XHRjYXNlIENoYXREcmFnQW5kRHJvcFR5cGUuQ0hBVF9SRUZFUkVOQ0U6IHJldHVybiBsb2NhbGl6ZSgnY2hhdCcsICdDaGF0Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQXR0YWNobWVudHNGcm9tRHJhZ0V2ZW50KGU6IERyYWdFdmVudCk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPiB7XG5cdFx0aWYgKCF0aGlzLmlzRHJhZ0V2ZW50U3VwcG9ydGVkKGUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgQ29kZURhdGFUcmFuc2ZlcnMuQ0hBVF9SRUZFUkVOQ0UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlQ2hhdFJlZmVyZW5jZUF0dGFjaENvbnRleHQoZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgQ29kZURhdGFUcmFuc2ZlcnMuTk9URUJPT0tfQ0VMTF9PVVRQVVQpKSB7XG5cdFx0XHRjb25zdCBub3RlYm9va091dHB1dERhdGEgPSBleHRyYWN0Tm90ZWJvb2tDZWxsT3V0cHV0RHJvcERhdGEoZSk7XG5cdFx0XHRpZiAobm90ZWJvb2tPdXRwdXREYXRhKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZU5vdGVib29rT3V0cHV0QXR0YWNoQ29udGV4dChub3RlYm9va091dHB1dERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLlNDTV9ISVNUT1JZX0lURU0pKSB7XG5cdFx0XHRjb25zdCBzY21IaXN0b3J5SXRlbURhdGEgPSBleHRyYWN0U0NNSGlzdG9yeUl0ZW1Ecm9wRGF0YShlKTtcblx0XHRcdGlmIChzY21IaXN0b3J5SXRlbURhdGEpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlU291cmNlQ29udHJvbEhpc3RvcnlJdGVtQXR0YWNoQ29udGV4dChzY21IaXN0b3J5SXRlbURhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtlckRhdGEgPSBleHRyYWN0TWFya2VyRHJvcERhdGEoZSk7XG5cdFx0aWYgKG1hcmtlckRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLmNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZU1hcmtlckF0dGFjaENvbnRleHQobWFya2VyRGF0YSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgQ29kZURhdGFUcmFuc2ZlcnMuU1lNQk9MUykpIHtcblx0XHRcdGNvbnN0IHN5bWJvbHNEYXRhID0gZXh0cmFjdFN5bWJvbERyb3BEYXRhKGUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlU3ltYm9sc0F0dGFjaENvbnRleHQoc3ltYm9sc0RhdGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvckRyYWdEYXRhID0gZXh0cmFjdEVkaXRvcnNEcm9wRGF0YShlKTtcblx0XHRpZiAoZWRpdG9yRHJhZ0RhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGNvYWxlc2NlKGF3YWl0IFByb21pc2UuYWxsKGVkaXRvckRyYWdEYXRhLm1hcChlZGl0b3JJbnB1dCA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZUVkaXRvckF0dGFjaENvbnRleHQoZWRpdG9ySW5wdXQpO1xuXHRcdFx0fSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnRlcm5hbCA9IGUuZGF0YVRyYW5zZmVyPy5nZXREYXRhKERhdGFUcmFuc2ZlcnMuSU5URVJOQUxfVVJJX0xJU1QpO1xuXHRcdGlmIChpbnRlcm5hbCkge1xuXHRcdFx0Y29uc3QgdXJpTGlzdCA9IFVyaUxpc3QucGFyc2UoaW50ZXJuYWwpO1xuXHRcdFx0aWYgKHVyaUxpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBjb2FsZXNjZShhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdFx0XHR1cmlMaXN0Lm1hcCh1cmkgPT4gdGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVFZGl0b3JBdHRhY2hDb250ZXh0KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSh1cmkpIH0pKVxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWNvbnRhaW5zRHJhZ1R5cGUoZSwgRGF0YVRyYW5zZmVycy5JTlRFUk5BTF9VUklfTElTVCkgJiYgY29udGFpbnNEcmFnVHlwZShlLCBNaW1lcy51cmlMaXN0KSAmJiAoKGNvbnRhaW5zRHJhZ1R5cGUoZSwgTWltZXMuaHRtbCkgfHwgY29udGFpbnNEcmFnVHlwZShlLCBNaW1lcy50ZXh0KSAvKiBUZXh0IG1pbWUgbmVlZGVkIGZvciBzYWZhcmkgc3VwcG9ydCAqLykpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlSFRNTEF0dGFjaENvbnRleHQoZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgZHJvcHBlZCBjaGF0IHJlZmVyZW5jZSAoYSBjaGF0IHRhYiBmcm9tIHRoZSBBZ2VudHMgd2luZG93KSB0byBhXG5cdCAqIHBsYWluIGNoYXQtcmVmZXJlbmNlIGF0dGFjaG1lbnQgKGEgcGlsbCkgXHUyMDE0IHRoZSBzYW1lIHNoYXBlIGV2ZXJ5IG90aGVyIGRyb3Bcblx0ICogdHlwZSBwcm9kdWNlcywgd2l0aCBubyBpbmxpbmUgdGV4dCwgcmFuZ2UsIG9yIGVkaXRvciBtYW5pcHVsYXRpb24uXG5cdCAqXG5cdCAqIFRoZSB0YXJnZXQgbXVzdCBiZSBhbiBhZ2VudC1ob3N0LWJhY2tlZCBpbnB1dDsgdGhlIGFjdHVhbCByZXNvbHV0aW9uIGFuZFxuXHQgKiB0aGUgc2VsZiAvIGNyb3NzLWFnZW50LWhvc3QgZ3VhcmRzIGxpdmUgaW4ge0BsaW5rIHJlc29sdmVDaGF0UmVmZXJlbmNlRHJvcEVudHJ5fS5cblx0ICogUmV0dXJucyBgW11gIHdoZW4gYW55IGd1YXJkIHJlamVjdHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVDaGF0UmVmZXJlbmNlQXR0YWNoQ29udGV4dChlOiBEcmFnRXZlbnQpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdGNvbnN0IGRhdGEgPSBleHRyYWN0Q2hhdFJlZmVyZW5jZURyb3BEYXRhKGUpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMud2lkZ2V0UmVmKCk/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IG93bkNsaWVudFJlc291cmNlID0gc2Vzc2lvblJlc291cmNlICYmIGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0PyBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlbnRyeSA9IHJlc29sdmVDaGF0UmVmZXJlbmNlRHJvcEVudHJ5KGRhdGEsIG93bkNsaWVudFJlc291cmNlKTtcblx0XHRyZXR1cm4gZW50cnkgPyBbZW50cnldIDogW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkSW1hZ2VBc1VpbnQ4QXJyYXkodXJsOiBzdHJpbmcpOiBQcm9taXNlPFVpbnQ4QXJyYXkgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXh0cmFjdGVkSW1hZ2VzID0gYXdhaXQgdGhpcy53ZWJDb250ZW50RXh0cmFjdG9yU2VydmljZS5yZWFkSW1hZ2UoVVJJLnBhcnNlKHVybCksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKGV4dHJhY3RlZEltYWdlcykge1xuXHRcdFx0XHRyZXR1cm4gZXh0cmFjdGVkSW1hZ2VzLmJ1ZmZlcjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZldGNoIGZhaWxlZDonLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETzogdXNlIGRuZCBwcm92aWRlciB0byBpbnNlcnQgdGV4dCBAanVzdHNjaGVuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy53aWRnZXRSZWYoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB3aWRnZXQ/LmlucHV0RWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24gJiYgd2lkZ2V0KSB7XG5cdFx0XHR3aWRnZXQuaW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdjaGF0SW5zZXJ0VXJsJywgW3sgcmFuZ2U6IHNlbGVjdGlvbiwgdGV4dDogdXJsIH1dKTtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgSW1hZ2UgVVJMcyBtdXN0IGVuZCBpbiAuanBnLCAucG5nLCAuZ2lmLCAud2VicCwgb3IgLmJtcC4gRmFpbGVkIHRvIGZldGNoIGltYWdlIGZyb20gdGhpcyBVUkw6ICR7dXJsfWApO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVIVE1MQXR0YWNoQ29udGV4dChlOiBEcmFnRXZlbnQpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nQXR0YWNobWVudE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KHRoaXMuYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLm1hcChhdHRhY2htZW50ID0+IGF0dGFjaG1lbnQubmFtZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZURpc3BsYXlOYW1lID0gKCk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBiYXNlTmFtZSA9IGxvY2FsaXplKCdkcmFnQW5kRHJvcHBlZEltYWdlTmFtZScsICdJbWFnZSBmcm9tIFVSTCcpO1xuXHRcdFx0bGV0IHVuaXF1ZU5hbWUgPSBiYXNlTmFtZTtcblx0XHRcdGxldCBiYXNlTmFtZUluc3RhbmNlID0gMTtcblxuXHRcdFx0d2hpbGUgKGV4aXN0aW5nQXR0YWNobWVudE5hbWVzLmhhcyh1bmlxdWVOYW1lKSkge1xuXHRcdFx0XHR1bmlxdWVOYW1lID0gYCR7YmFzZU5hbWV9ICR7KytiYXNlTmFtZUluc3RhbmNlfWA7XG5cdFx0XHR9XG5cblx0XHRcdGV4aXN0aW5nQXR0YWNobWVudE5hbWVzLmFkZCh1bmlxdWVOYW1lKTtcblx0XHRcdHJldHVybiB1bmlxdWVOYW1lO1xuXHRcdH07XG5cblx0XHRjb25zdCBnZXRJbWFnZVRyYW5zZmVyRGF0YUZyb21VcmwgPSBhc3luYyAodXJsOiBzdHJpbmcpOiBQcm9taXNlPEltYWdlVHJhbnNmZXJEYXRhIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSh1cmwpO1xuXG5cdFx0XHRpZiAoSU1BR0VfREFUQV9SRUdFWC50ZXN0KHVybCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgZGF0YTogY29udmVydFN0cmluZ1RvVUludDhBcnJheSh1cmwpLCBuYW1lOiBjcmVhdGVEaXNwbGF5TmFtZSgpLCByZXNvdXJjZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoVVJMX1JFR0VYLnRlc3QodXJsKSkge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5kb3dubG9hZEltYWdlQXNVaW50OEFycmF5KHVybCk7XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZGF0YSwgbmFtZTogY3JlYXRlRGlzcGxheU5hbWUoKSwgcmVzb3VyY2UsIGlkOiB1cmwgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBnZXRJbWFnZVRyYW5zZmVyRGF0YUZyb21GaWxlID0gYXN5bmMgKGZpbGU6IEZpbGUpOiBQcm9taXNlPEltYWdlVHJhbnNmZXJEYXRhIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBidWZmZXIgPSBhd2FpdCBmaWxlLmFycmF5QnVmZmVyKCk7XG5cdFx0XHRcdHJldHVybiB7IGRhdGE6IG5ldyBVaW50OEFycmF5KGJ1ZmZlciksIG5hbWU6IGNyZWF0ZURpc3BsYXlOYW1lKCkgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3IgcmVhZGluZyBmaWxlOicsIGVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW1hZ2VUcmFuc2ZlckRhdGE6IEltYWdlVHJhbnNmZXJEYXRhW10gPSBbXTtcblxuXHRcdC8vIEltYWdlIFdlYiBGaWxlIERyYWcgYW5kIERyb3Bcblx0XHRjb25zdCBpbWFnZUZpbGVzID0gZXh0cmFjdEltYWdlRmlsZXNGcm9tRHJhZ0V2ZW50KGUpO1xuXHRcdGlmIChpbWFnZUZpbGVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgaW1hZ2VUcmFuc2ZlckRhdGFGcm9tRmlsZXMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZUZpbGVzLm1hcChmaWxlID0+IGdldEltYWdlVHJhbnNmZXJEYXRhRnJvbUZpbGUoZmlsZSkpKTtcblx0XHRcdGltYWdlVHJhbnNmZXJEYXRhLnB1c2goLi4uaW1hZ2VUcmFuc2ZlckRhdGFGcm9tRmlsZXMuZmlsdGVyKGRhdGEgPT4gISFkYXRhKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW1hZ2UgV2ViIFVSTCBEcmFnIGFuZCBEcm9wXG5cdFx0Y29uc3QgaW1hZ2VVcmxzID0gZXh0cmFjdFVybHNGcm9tRHJhZ0V2ZW50KGUpO1xuXHRcdGlmIChpbWFnZVVybHMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpbWFnZVRyYW5zZmVyRGF0YUZyb21VcmwgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVVybHMubWFwKGdldEltYWdlVHJhbnNmZXJEYXRhRnJvbVVybCkpO1xuXHRcdFx0aW1hZ2VUcmFuc2ZlckRhdGEucHVzaCguLi5pbWFnZVRyYW5zZmVyRGF0YUZyb21VcmwuZmlsdGVyKGRhdGEgPT4gISFkYXRhKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlSW1hZ2VBdHRhY2hDb250ZXh0KGltYWdlVHJhbnNmZXJEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0T3ZlcmxheSh0YXJnZXQ6IEhUTUxFbGVtZW50LCB0eXBlOiBDaGF0RHJhZ0FuZERyb3BUeXBlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gUmVtb3ZlIGFueSBwcmV2aW91cyBvdmVybGF5IHRleHRcblx0XHR0aGlzLm92ZXJsYXlUZXh0Py5yZW1vdmUoKTtcblx0XHR0aGlzLm92ZXJsYXlUZXh0ID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgeyBvdmVybGF5IH0gPSB0aGlzLm92ZXJsYXlzLmdldCh0YXJnZXQpITtcblx0XHRpZiAodHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBSZW5kZXIgdGhlIG92ZXJsYXkgdGV4dFxuXG5cdFx0XHRjb25zdCBpY29uQW5kdGV4dEVsZW1lbnRzID0gcmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtDb2RpY29uLmF0dGFjaC5pZH0pICR7dGhpcy5nZXRPdmVybGF5VGV4dCh0eXBlKX1gKTtcblx0XHRcdGNvbnN0IGh0bWxFbGVtZW50cyA9IGljb25BbmR0ZXh0RWxlbWVudHMubWFwKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuICQoJ3NwYW4ub3ZlcmxheS10ZXh0JywgdW5kZWZpbmVkLCBlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLm92ZXJsYXlUZXh0ID0gJCgnc3Bhbi5hdHRhY2gtY29udGV4dC1vdmVybGF5LXRleHQnLCB1bmRlZmluZWQsIC4uLmh0bWxFbGVtZW50cyk7XG5cdFx0XHR0aGlzLm92ZXJsYXlUZXh0LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMub3ZlcmxheVRleHRCYWNrZ3JvdW5kO1xuXHRcdFx0b3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLm92ZXJsYXlUZXh0KTtcblx0XHR9XG5cblx0XHRvdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB0eXBlICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPdmVybGF5VGV4dCh0eXBlOiBDaGF0RHJhZ0FuZERyb3BUeXBlKTogc3RyaW5nIHtcblx0XHRjb25zdCB0eXBlTmFtZSA9IHRoaXMuZ2V0RHJvcFR5cGVOYW1lKHR5cGUpO1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYXR0YWNBc0NvbnRleHQnLCAnQXR0YWNoIHswfSBhcyBDb250ZXh0JywgdHlwZU5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVPdmVybGF5U3R5bGVzKG92ZXJsYXk6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0b3ZlcmxheS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLmdldENvbG9yKHRoaXMuc3R5bGVzLm92ZXJsYXlCYWNrZ3JvdW5kKSB8fCAnJztcblx0XHRvdmVybGF5LnN0eWxlLmNvbG9yID0gdGhpcy5nZXRDb2xvcih0aGlzLnN0eWxlcy5saXN0Rm9yZWdyb3VuZCkgfHwgJyc7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5vdmVybGF5cy5mb3JFYWNoKG92ZXJsYXkgPT4gdGhpcy51cGRhdGVPdmVybGF5U3R5bGVzKG92ZXJsYXkub3ZlcmxheSkpO1xuXHRcdHRoaXMub3ZlcmxheVRleHRCYWNrZ3JvdW5kID0gdGhpcy5nZXRDb2xvcih0aGlzLnN0eWxlcy5saXN0QmFja2dyb3VuZCkgfHwgJyc7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29udGFpbnNJbWFnZURyYWdUeXBlKGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHQvLyBJbWFnZSBkZXRlY3Rpb24gc2hvdWxkIG5vdCBoYXZlIGZhbHNlIHBvc2l0aXZlcywgb25seSBmYWxzZSBuZWdhdGl2ZXMgYXJlIGFsbG93ZWRcblx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgJ2ltYWdlJykpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChjb250YWluc0RyYWdUeXBlKGUsIERhdGFUcmFuc2ZlcnMuRklMRVMpKSB7XG5cdFx0Y29uc3QgZmlsZXMgPSBlLmRhdGFUcmFuc2Zlcj8uZmlsZXM7XG5cdFx0aWYgKGZpbGVzICYmIGZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBBcnJheS5mcm9tKGZpbGVzKS5zb21lKGZpbGUgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpKTtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IGUuZGF0YVRyYW5zZmVyPy5pdGVtcztcblx0XHRpZiAoaXRlbXMgJiYgaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20oaXRlbXMpLnNvbWUoaXRlbSA9PiBpdGVtLnR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFVybHNGcm9tRHJhZ0V2ZW50KGU6IERyYWdFdmVudCwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKTogc3RyaW5nW10ge1xuXHRjb25zdCB0ZXh0VXJsID0gZS5kYXRhVHJhbnNmZXI/LmdldERhdGEoJ3RleHQvdXJpLWxpc3QnKTtcblx0aWYgKHRleHRVcmwpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJscyA9IFVyaUxpc3QucGFyc2UodGV4dFVybCk7XG5cdFx0XHRpZiAodXJscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiB1cmxzO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRsb2dTZXJ2aWNlPy5lcnJvcignRXJyb3IgcGFyc2luZyBVUkkgbGlzdDonLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0SW1hZ2VGaWxlc0Zyb21EcmFnRXZlbnQoZTogRHJhZ0V2ZW50KTogRmlsZVtdIHtcblx0Y29uc3QgZmlsZXMgPSBlLmRhdGFUcmFuc2Zlcj8uZmlsZXM7XG5cdGlmICghZmlsZXMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRyZXR1cm4gQXJyYXkuZnJvbShmaWxlcykuZmlsdGVyKGZpbGUgPT4gZmlsZS50eXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxHQUFHLDJCQUEyQjtBQUN2QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGFBQWE7QUFD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
