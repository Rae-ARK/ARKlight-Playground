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
import { alert } from "../../../../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { createStringDataTransferItem, VSDataTransfer } from "../../../../../../../base/common/dataTransfer.js";
import { convertHtmlToMarkdown } from "../../../../../../../base/browser/htmlToMarkdown.js";
import { HierarchicalKind } from "../../../../../../../base/common/hierarchicalKind.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../../../base/common/marshalling.js";
import { Mimes } from "../../../../../../../base/common/mime.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename, joinPath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { DocumentPasteTriggerKind, SymbolKinds } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { IOutlineModelService } from "../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { getDefinitionsAtPosition } from "../../../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js";
import { localize } from "../../../../../../../nls.js";
import { IEnvironmentService } from "../../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../../../services/extensions/common/extensions.js";
import { isImageVariableEntry } from "../../../../common/attachments/chatVariableEntries.js";
import { chatVariableLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { IChatWidgetService } from "../../../chat.js";
import { getDynamicVariablesForWidget } from "../../../attachments/chatVariables.js";
import { ChatDynamicVariableModel } from "../../../attachments/chatDynamicVariables.js";
import { cleanupOldImages, createFileForMedia, resizeImage } from "../../../chatImageUtils.js";
const COPY_MIME_TYPES = "application/vnd.code.additional-editor-data";
let PasteImageProvider = class {
  constructor(chatWidgetService, extensionService, fileService, environmentService, logService) {
    this.chatWidgetService = chatWidgetService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.kind = new HierarchicalKind("chat.attach.image");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = ["image/*"];
    this.imagesFolder = joinPath(this.environmentService.workspaceStorageHome, "vscode-chat-images");
    cleanupOldImages(this.fileService, this.logService, this.imagesFolder);
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, context, token) {
    if (!this.extensionService.extensions.some((ext) => isProposedApiEnabled(ext, "chatReferenceBinaryData"))) {
      return;
    }
    const supportedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/bmp",
      "image/gif",
      "image/tiff"
    ];
    let mimeType;
    let imageItem;
    for (const type of supportedMimeTypes) {
      imageItem = dataTransfer.get(type);
      if (imageItem) {
        mimeType = type;
        break;
      }
    }
    if (!imageItem || !mimeType) {
      return;
    }
    const currClipboard = await imageItem.asFile()?.data();
    if (token.isCancellationRequested || !currClipboard) {
      return;
    }
    const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget) {
      return;
    }
    const attachedVariables = widget.attachmentModel.attachments;
    const displayName = localize("pastedImageName", "Pasted Image");
    let tempDisplayName = displayName;
    for (let appendValue = 2; attachedVariables.some((attachment) => attachment.name === tempDisplayName); appendValue++) {
      tempDisplayName = `${displayName} ${appendValue}`;
    }
    const fileReference = await createFileForMedia(this.fileService, this.imagesFolder, currClipboard, mimeType);
    if (token.isCancellationRequested || !fileReference) {
      return;
    }
    const scaledImageData = await resizeImage(currClipboard);
    if (token.isCancellationRequested || !scaledImageData) {
      return;
    }
    const scaledImageContext = await getImageAttachContext(scaledImageData, mimeType, token, tempDisplayName, fileReference);
    if (token.isCancellationRequested || !scaledImageContext) {
      return;
    }
    const currentContextIds = widget.attachmentModel.getAttachmentIDs();
    if (currentContextIds.has(scaledImageContext.id)) {
      return;
    }
    const edit = createCustomPasteEdit(model, [scaledImageContext], mimeType, this.kind, localize("pastedImageAttachment", "Pasted Image Attachment"), this.chatWidgetService);
    return createEditSession(edit);
  }
};
PasteImageProvider = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ILogService)
], PasteImageProvider);
async function getImageAttachContext(data, mimeType, token, displayName, resource) {
  const imageHash = await imageToHash(data);
  if (token.isCancellationRequested) {
    return void 0;
  }
  return {
    kind: "image",
    value: data,
    id: imageHash,
    name: displayName,
    icon: Codicon.fileMedia,
    mimeType,
    isPasted: true,
    references: [{ reference: resource, kind: "reference" }]
  };
}
async function imageToHash(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isImage(array) {
  if (array.length < 4) {
    return false;
  }
  const identifier = {
    png: [137, 80, 78, 71, 13, 10, 26, 10],
    jpeg: [255, 216, 255],
    bmp: [66, 77],
    gif: [71, 73, 70, 56],
    tiff: [73, 73, 42, 0]
  };
  return Object.values(identifier).some(
    (signature) => signature.every((byte, index) => array[index] === byte)
  );
}
let CopyTextProvider = class {
  constructor(modelService, languageFeaturesService, outlineModelService) {
    this.modelService = modelService;
    this.languageFeaturesService = languageFeaturesService;
    this.outlineModelService = outlineModelService;
    this.providedPasteEditKinds = [];
    this.copyMimeTypes = [COPY_MIME_TYPES];
    this.pasteMimeTypes = [];
  }
  async prepareDocumentPaste(model, ranges, dataTransfer, token) {
    if (model.uri.scheme === Schemas.vscodeChatInput) {
      return;
    }
    const customDataTransfer = new VSDataTransfer();
    const data = { range: ranges[0], uri: model.uri.toJSON() };
    customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(JSON.stringify(data)));
    const text = dataTransfer.get(Mimes.text);
    if (text && ranges.length) {
      void this.primeSymbolReferenceCache(model, ranges[0], text, token);
    }
    return customDataTransfer;
  }
  async primeSymbolReferenceCache(model, range, textItem, token) {
    const copiedText = model.getValueInRange(range);
    if (range.startLineNumber !== range.endLineNumber) {
      return;
    }
    if (token.isCancellationRequested || !identifierPattern.test(copiedText)) {
      return;
    }
    cacheSymbolReference(model.uri, range, copiedText, resolveSymbolReference(
      this.modelService,
      this.languageFeaturesService,
      this.outlineModelService,
      model.uri,
      range,
      copiedText,
      token
    ));
  }
};
CopyTextProvider = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IOutlineModelService)
], CopyTextProvider);
let CopyAttachmentsProvider = class {
  constructor(chatWidgetService) {
    this.chatWidgetService = chatWidgetService;
    this.kind = new HierarchicalKind("chat.attach.attachments");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE];
    this.pasteMimeTypes = [CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE];
  }
  async prepareDocumentPaste(model, _ranges, _dataTransfer, _token) {
    const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget || !widget.viewModel) {
      return void 0;
    }
    const attachments = widget.attachmentModel.attachments;
    const dynamicVariables = getDynamicVariablesForWidget(widget);
    if (attachments.length === 0 && dynamicVariables.length === 0) {
      return void 0;
    }
    const result = new VSDataTransfer();
    result.append(CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE, createStringDataTransferItem(JSON.stringify({ attachments, dynamicVariables })));
    return result;
  }
  async provideDocumentPasteEdits(model, _ranges, dataTransfer, _context, token) {
    const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget || !widget.viewModel) {
      return void 0;
    }
    const chatDynamicVariable = widget.getContrib(ChatDynamicVariableModel.ID);
    if (!chatDynamicVariable) {
      return void 0;
    }
    const text = dataTransfer.get(Mimes.text);
    const data = dataTransfer.get(CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE);
    const rawData = await data?.asString();
    const textdata = await text?.asString();
    if (textdata === void 0 || rawData === void 0) {
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }
    let pastedData;
    try {
      pastedData = revive(JSON.parse(rawData));
    } catch {
    }
    if (!Array.isArray(pastedData?.attachments) && !Array.isArray(pastedData?.dynamicVariables)) {
      return;
    }
    const edit = {
      insertText: textdata,
      title: localize("pastedChatAttachments", "Insert Prompt & Attachments"),
      kind: this.kind,
      handledMimeType: CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE,
      additionalEdit: {
        edits: []
      }
    };
    edit.additionalEdit?.edits.push({
      resource: model.uri,
      redo: () => {
        widget.attachmentModel.addContext(...pastedData.attachments);
        for (const dynamicVariable of pastedData.dynamicVariables) {
          chatDynamicVariable?.addReference(dynamicVariable);
        }
        widget.refreshParsedInput();
      },
      undo: () => {
        widget.attachmentModel.delete(...pastedData.attachments.map((c) => c.id));
        widget.refreshParsedInput();
      }
    });
    return createEditSession(edit);
  }
};
CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE = "application/vnd.chat.attachment+json";
CopyAttachmentsProvider = __decorateClass([
  __decorateParam(0, IChatWidgetService)
], CopyAttachmentsProvider);
class PasteTextProvider {
  constructor(chatWidgetService, modelService) {
    this.chatWidgetService = chatWidgetService;
    this.modelService = modelService;
    this.kind = new HierarchicalKind("chat.attach.text");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [COPY_MIME_TYPES];
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
    if (model.uri.scheme !== Schemas.vscodeChatInput) {
      return;
    }
    const text = dataTransfer.get(Mimes.text);
    const editorData = dataTransfer.get("vscode-editor-data");
    const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);
    if (!editorData || !text || !additionalEditorData) {
      return;
    }
    const textdata = await text.asString();
    const metadata = JSON.parse(await editorData.asString());
    const additionalData = JSON.parse(await additionalEditorData.asString());
    const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget) {
      return;
    }
    const start = additionalData.range.startLineNumber;
    const end = additionalData.range.endLineNumber;
    if (start === end) {
      const textModel = this.modelService.getModel(URI.revive(additionalData.uri));
      if (!textModel) {
        return;
      }
      const lineContent = textModel.getLineContent(start);
      if (lineContent !== textdata) {
        return;
      }
    }
    const copiedContext = getCopiedContext(textdata, URI.revive(additionalData.uri), metadata.mode, additionalData.range);
    if (token.isCancellationRequested || !copiedContext) {
      return;
    }
    const currentContextIds = widget.attachmentModel.getAttachmentIDs();
    if (currentContextIds.has(copiedContext.id)) {
      return;
    }
    const edit = createCustomPasteEdit(model, [copiedContext], Mimes.text, this.kind, localize("pastedCodeAttachment", "Pasted Code Attachment"), this.chatWidgetService);
    edit.yieldTo = [{ kind: HierarchicalKind.Empty.append("text", "plain") }];
    return createEditSession(edit);
  }
}
function getCopiedContext(code, file, language, range) {
  const fileName = basename(file);
  const start = range.startLineNumber;
  const end = range.endLineNumber;
  const resultText = `Copied Selection of Code: 


 From the file: ${fileName} From lines ${start} to ${end} 
 \`\`\`${code}\`\`\``;
  const pastedLines = start === end ? localize("pastedAttachment.oneLine", "1 line") : localize("pastedAttachment.multipleLines", "{0} lines", end + 1 - start);
  return {
    kind: "paste",
    value: resultText,
    id: `${fileName}${start}${end}${range.startColumn}${range.endColumn}`,
    name: `${fileName} ${pastedLines}`,
    icon: Codicon.code,
    pastedLines,
    language,
    fileName: file.toString(),
    copiedFrom: {
      uri: file,
      range
    },
    code,
    references: [{
      reference: file,
      kind: "reference"
    }]
  };
}
function createCustomPasteEdit(model, context, handledMimeType, kind, title, chatWidgetService) {
  const label = context.length === 1 ? context[0].name : localize("pastedAttachment.multiple", "{0} and {1} more", context[0].name, context.length - 1);
  const announceImageAttachment = context.length === 1 && isImageVariableEntry(context[0]);
  const customEdit = {
    resource: model.uri,
    variable: context,
    undo: () => {
      const widget = chatWidgetService.getWidgetByInputUri(model.uri);
      if (!widget) {
        throw new Error("No widget found for undo");
      }
      widget.attachmentModel.delete(...context.map((c) => c.id));
    },
    redo: () => {
      const widget = chatWidgetService.getWidgetByInputUri(model.uri);
      if (!widget) {
        throw new Error("No widget found for redo");
      }
      widget.attachmentModel.addContext(...context);
      if (announceImageAttachment) {
        alert(localize("chat.pastedImageAttached", "Attached image"));
      }
    },
    metadata: {
      needsConfirmation: false,
      label
    }
  };
  return {
    insertText: "",
    title,
    kind,
    handledMimeType,
    additionalEdit: {
      edits: [customEdit]
    }
  };
}
function createEditSession(edit) {
  return {
    edits: [edit],
    dispose: () => {
    }
  };
}
const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const symbolCacheMaxSize = 3;
const symbolReferenceCache = [];
function getSymbolReferenceCacheKey(uri, range, text) {
  return `${uri.toString()}|${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}|${text}`;
}
async function getCachedSymbolReference(uri, range, text) {
  const key = getSymbolReferenceCacheKey(uri, range, text);
  return symbolReferenceCache.find((e) => e.key === key)?.promise;
}
function cacheSymbolReference(uri, range, text, valuePromise) {
  const entry = {
    key: getSymbolReferenceCacheKey(uri, range, text),
    promise: valuePromise
  };
  symbolReferenceCache.unshift(entry);
  while (symbolReferenceCache.length > symbolCacheMaxSize) {
    symbolReferenceCache.pop();
  }
  valuePromise.catch(() => {
    const i = symbolReferenceCache.indexOf(entry);
    if (i !== -1) {
      symbolReferenceCache.splice(i, 1);
    }
  });
}
async function resolveSymbolReference(modelService, languageFeaturesService, outlineModelService, sourceUri, sourceRange, pastedText, token) {
  const sourceModel = modelService.getModel(sourceUri);
  if (!sourceModel) {
    return;
  }
  const sourcePosition = new Position(sourceRange.startLineNumber, sourceRange.startColumn);
  const definitions = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, sourceModel, sourcePosition, false, token);
  if (token.isCancellationRequested || !definitions.length) {
    return;
  }
  const def = definitions[0];
  const defRange = def.targetSelectionRange ?? def.range;
  const defLocation = { uri: def.uri, range: defRange };
  let icon = Codicon.symbolProperty;
  const defModel = modelService.getModel(def.uri);
  if (defModel) {
    try {
      const outline = await outlineModelService.getOrCreate(defModel, token);
      if (!token.isCancellationRequested) {
        const element = outline.getItemEnclosingPosition({ lineNumber: defRange.startLineNumber, column: defRange.startColumn });
        if (element) {
          icon = SymbolKinds.toIcon(element.symbol.kind);
        }
      }
    } catch {
    }
  }
  if (token.isCancellationRequested) {
    return;
  }
  return {
    id: `vscode.symbol/${JSON.stringify(defLocation)}`,
    fullName: pastedText,
    data: defLocation,
    icon
  };
}
let PasteSymbolProvider = class {
  constructor(chatWidgetService, modelService, languageFeaturesService, outlineModelService) {
    this.chatWidgetService = chatWidgetService;
    this.modelService = modelService;
    this.languageFeaturesService = languageFeaturesService;
    this.outlineModelService = outlineModelService;
    this.kind = new HierarchicalKind("chat.attach.symbol");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [COPY_MIME_TYPES];
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
    if (model.uri.scheme !== Schemas.vscodeChatInput) {
      return;
    }
    const text = dataTransfer.get(Mimes.text);
    const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);
    if (!text || !additionalEditorData) {
      return;
    }
    const pastedText = await text.asString();
    if (!identifierPattern.test(pastedText)) {
      return;
    }
    let additionalData;
    try {
      additionalData = JSON.parse(await additionalEditorData.asString());
    } catch {
      return;
    }
    const sourceUri = URI.revive(additionalData.uri);
    const sourceRange = additionalData.range;
    const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
    if (!widget) {
      return;
    }
    const cached = await getCachedSymbolReference(sourceUri, sourceRange, pastedText);
    let resolved = cached;
    if (!resolved) {
      resolved = await resolveSymbolReference(
        this.modelService,
        this.languageFeaturesService,
        this.outlineModelService,
        sourceUri,
        sourceRange,
        pastedText,
        token
      );
    }
    if (!resolved) {
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }
    const symText = `${chatVariableLeader}sym:${pastedText}`;
    const pasteRange = ranges[0];
    const insertText = `${symText} `;
    const refRange = {
      startLineNumber: pasteRange.startLineNumber,
      startColumn: pasteRange.startColumn,
      endLineNumber: pasteRange.startLineNumber,
      endColumn: pasteRange.startColumn + symText.length
    };
    const dynamicRef = {
      id: resolved.id,
      fullName: resolved.fullName,
      range: refRange,
      data: resolved.data,
      icon: resolved.icon
    };
    const edit = {
      insertText,
      title: localize("pastedSymbolReference", "Pasted Symbol Reference"),
      kind: this.kind,
      handledMimeType: COPY_MIME_TYPES,
      additionalEdit: {
        edits: [{
          resource: model.uri,
          redo: () => {
            const w = this.chatWidgetService.getWidgetByInputUri(model.uri);
            w?.getContrib(ChatDynamicVariableModel.ID)?.addReference(dynamicRef);
          },
          undo: () => {
          }
        }]
      }
    };
    edit.yieldTo = [{ kind: new HierarchicalKind("chat.attach.text") }];
    return createEditSession(edit);
  }
};
PasteSymbolProvider = __decorateClass([
  __decorateParam(0, IChatWidgetService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IOutlineModelService)
], PasteSymbolProvider);
class PasteHtmlProvider {
  constructor() {
    this.kind = new HierarchicalKind("chat.paste.html");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [Mimes.html];
  }
  async provideDocumentPasteEdits(model, _ranges, dataTransfer, context, token) {
    if (model.uri.scheme !== Schemas.vscodeChatInput) {
      return;
    }
    if (context.triggerKind !== DocumentPasteTriggerKind.Automatic) {
      return;
    }
    const entry = dataTransfer.get(Mimes.html);
    const htmlText = await entry?.asString();
    if (!htmlText || token.isCancellationRequested) {
      return;
    }
    if (!/<(a|strong|b|em|i|h[1-6]|code|pre|ul|ol|li|blockquote|del|s|strike|img|hr)\b/i.test(htmlText)) {
      return;
    }
    const markdown = convertHtmlToMarkdown(htmlText);
    if (!markdown) {
      return;
    }
    return createEditSession({
      insertText: markdown,
      title: localize("pasteHtmlAsMarkdown", "Paste as Markdown"),
      kind: this.kind,
      handledMimeType: Mimes.html,
      yieldTo: [
        { kind: new HierarchicalKind("chat.attach.text") },
        { kind: new HierarchicalKind("chat.attach.image") }
      ]
    });
  }
}
let ChatPasteProvidersFeature = class extends Disposable {
  constructor(instaService, languageFeaturesService, chatWidgetService, extensionService, fileService, modelService, environmentService, logService) {
    super();
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, instaService.createInstance(CopyAttachmentsProvider)));
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService, fileService, environmentService, logService)));
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService, modelService)));
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, new PasteHtmlProvider()));
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, instaService.createInstance(PasteSymbolProvider)));
    this._register(languageFeaturesService.documentPasteEditProvider.register("*", instaService.createInstance(CopyTextProvider)));
  }
};
ChatPasteProvidersFeature = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IModelService),
  __decorateParam(6, IEnvironmentService),
  __decorateParam(7, ILogService)
], ChatPasteProvidersFeature);
export {
  ChatPasteProvidersFeature,
  CopyTextProvider,
  PasteImageProvider,
  PasteTextProvider,
  imageToHash,
  isImage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRQYXN0ZVByb3ZpZGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0sIElEYXRhVHJhbnNmZXJJdGVtLCBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgVlNEYXRhVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgY29udmVydEh0bWxUb01hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2h0bWxUb01hcmtkb3duLmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERvY3VtZW50UGFzdGVDb250ZXh0LCBEb2N1bWVudFBhc3RlRWRpdCwgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgRG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiwgRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLCBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub1N5bWJvbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1hZ2VWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgY2hhdFZhcmlhYmxlTGVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElEeW5hbWljVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2F0dGFjaG1lbnRzL2NoYXREeW5hbWljVmFyaWFibGVzLmpzJztcbmltcG9ydCB7IGNsZWFudXBPbGRJbWFnZXMsIGNyZWF0ZUZpbGVGb3JNZWRpYSwgcmVzaXplSW1hZ2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0SW1hZ2VVdGlscy5qcyc7XG5cbmNvbnN0IENPUFlfTUlNRV9UWVBFUyA9ICdhcHBsaWNhdGlvbi92bmQuY29kZS5hZGRpdGlvbmFsLWVkaXRvci1kYXRhJztcblxuaW50ZXJmYWNlIFNlcmlhbGl6ZWRDb3B5RGF0YSB7XG5cdHJlYWRvbmx5IHVyaTogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgcmFuZ2U6IElSYW5nZTtcbn1cblxuaW50ZXJmYWNlIFJlc29sdmVkU3ltYm9sUmVmZXJlbmNlIHtcblx0aWQ6IHN0cmluZztcblx0ZnVsbE5hbWU6IHN0cmluZztcblx0ZGF0YToge1xuXHRcdHVyaTogVVJJO1xuXHRcdHJhbmdlOiBJUmFuZ2U7XG5cdH07XG5cdGljb246IElEeW5hbWljVmFyaWFibGVbJ2ljb24nXTtcbn1cblxuZXhwb3J0IGNsYXNzIFBhc3RlSW1hZ2VQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGltYWdlc0ZvbGRlcjogVVJJO1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQuYXR0YWNoLmltYWdlJyk7XG5cdHB1YmxpYyByZWFkb25seSBwcm92aWRlZFBhc3RlRWRpdEtpbmRzID0gW3RoaXMua2luZF07XG5cblx0cHVibGljIHJlYWRvbmx5IGNvcHlNaW1lVHlwZXMgPSBbXTtcblx0cHVibGljIHJlYWRvbmx5IHBhc3RlTWltZVR5cGVzID0gWydpbWFnZS8qJ107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuaW1hZ2VzRm9sZGVyID0gam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uud29ya3NwYWNlU3RvcmFnZUhvbWUsICd2c2NvZGUtY2hhdC1pbWFnZXMnKTtcblx0XHRjbGVhbnVwT2xkSW1hZ2VzKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5pbWFnZXNGb2xkZXIsKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIGNvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERvY3VtZW50UGFzdGVFZGl0c1Nlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZXh0ID0+IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dCwgJ2NoYXRSZWZlcmVuY2VCaW5hcnlEYXRhJykpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VwcG9ydGVkTWltZVR5cGVzID0gW1xuXHRcdFx0J2ltYWdlL3BuZycsXG5cdFx0XHQnaW1hZ2UvanBlZycsXG5cdFx0XHQnaW1hZ2UvanBnJyxcblx0XHRcdCdpbWFnZS9ibXAnLFxuXHRcdFx0J2ltYWdlL2dpZicsXG5cdFx0XHQnaW1hZ2UvdGlmZidcblx0XHRdO1xuXG5cdFx0bGV0IG1pbWVUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGltYWdlSXRlbTogSURhdGFUcmFuc2Zlckl0ZW0gfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBGaW5kIHRoZSBmaXJzdCBtYXRjaGluZyBpbWFnZSB0eXBlIGluIHRoZSBkYXRhVHJhbnNmZXJcblx0XHRmb3IgKGNvbnN0IHR5cGUgb2Ygc3VwcG9ydGVkTWltZVR5cGVzKSB7XG5cdFx0XHRpbWFnZUl0ZW0gPSBkYXRhVHJhbnNmZXIuZ2V0KHR5cGUpO1xuXHRcdFx0aWYgKGltYWdlSXRlbSkge1xuXHRcdFx0XHRtaW1lVHlwZSA9IHR5cGU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaW1hZ2VJdGVtIHx8ICFtaW1lVHlwZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyQ2xpcGJvYXJkID0gYXdhaXQgaW1hZ2VJdGVtLmFzRmlsZSgpPy5kYXRhKCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFjdXJyQ2xpcGJvYXJkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRhY2hlZFZhcmlhYmxlcyA9IHdpZGdldC5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHM7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBsb2NhbGl6ZSgncGFzdGVkSW1hZ2VOYW1lJywgJ1Bhc3RlZCBJbWFnZScpO1xuXHRcdGxldCB0ZW1wRGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcblxuXHRcdGZvciAobGV0IGFwcGVuZFZhbHVlID0gMjsgYXR0YWNoZWRWYXJpYWJsZXMuc29tZShhdHRhY2htZW50ID0+IGF0dGFjaG1lbnQubmFtZSA9PT0gdGVtcERpc3BsYXlOYW1lKTsgYXBwZW5kVmFsdWUrKykge1xuXHRcdFx0dGVtcERpc3BsYXlOYW1lID0gYCR7ZGlzcGxheU5hbWV9ICR7YXBwZW5kVmFsdWV9YDtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlUmVmZXJlbmNlID0gYXdhaXQgY3JlYXRlRmlsZUZvck1lZGlhKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuaW1hZ2VzRm9sZGVyLCBjdXJyQ2xpcGJvYXJkLCBtaW1lVHlwZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFmaWxlUmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NhbGVkSW1hZ2VEYXRhID0gYXdhaXQgcmVzaXplSW1hZ2UoY3VyckNsaXBib2FyZCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFzY2FsZWRJbWFnZURhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY2FsZWRJbWFnZUNvbnRleHQgPSBhd2FpdCBnZXRJbWFnZUF0dGFjaENvbnRleHQoc2NhbGVkSW1hZ2VEYXRhLCBtaW1lVHlwZSwgdG9rZW4sIHRlbXBEaXNwbGF5TmFtZSwgZmlsZVJlZmVyZW5jZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFzY2FsZWRJbWFnZUNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYXR0YWNoIG9ubHkgbmV3IGNvbnRleHRzXG5cdFx0Y29uc3QgY3VycmVudENvbnRleHRJZHMgPSB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmdldEF0dGFjaG1lbnRJRHMoKTtcblx0XHRpZiAoY3VycmVudENvbnRleHRJZHMuaGFzKHNjYWxlZEltYWdlQ29udGV4dC5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0ID0gY3JlYXRlQ3VzdG9tUGFzdGVFZGl0KG1vZGVsLCBbc2NhbGVkSW1hZ2VDb250ZXh0XSwgbWltZVR5cGUsIHRoaXMua2luZCwgbG9jYWxpemUoJ3Bhc3RlZEltYWdlQXR0YWNobWVudCcsICdQYXN0ZWQgSW1hZ2UgQXR0YWNobWVudCcpLCB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRyZXR1cm4gY3JlYXRlRWRpdFNlc3Npb24oZWRpdCk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW1hZ2VBdHRhY2hDb250ZXh0KGRhdGE6IFVpbnQ4QXJyYXksIG1pbWVUeXBlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZGlzcGxheU5hbWU6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBpbWFnZUhhc2ggPSBhd2FpdCBpbWFnZVRvSGFzaChkYXRhKTtcblx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2ltYWdlJyxcblx0XHR2YWx1ZTogZGF0YSxcblx0XHRpZDogaW1hZ2VIYXNoLFxuXHRcdG5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdGljb246IENvZGljb24uZmlsZU1lZGlhLFxuXHRcdG1pbWVUeXBlLFxuXHRcdGlzUGFzdGVkOiB0cnVlLFxuXHRcdHJlZmVyZW5jZXM6IFt7IHJlZmVyZW5jZTogcmVzb3VyY2UsIGtpbmQ6ICdyZWZlcmVuY2UnIH1dXG5cdH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBpbWFnZVRvSGFzaChkYXRhOiBVaW50OEFycmF5KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KCdTSEEtMjU2JywgZGF0YSk7XG5cdGNvbnN0IGhhc2hBcnJheSA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcikpO1xuXHRyZXR1cm4gaGFzaEFycmF5Lm1hcChiID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJbWFnZShhcnJheTogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRpZiAoYXJyYXkubGVuZ3RoIDwgNCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIE1hZ2ljIG51bWJlcnMgKGlkZW50aWZpY2F0aW9uIGJ5dGVzKSBmb3IgdmFyaW91cyBpbWFnZSBmb3JtYXRzXG5cdGNvbnN0IGlkZW50aWZpZXI6IHsgW2tleTogc3RyaW5nXTogbnVtYmVyW10gfSA9IHtcblx0XHRwbmc6IFsweDg5LCAweDUwLCAweDRFLCAweDQ3LCAweDBELCAweDBBLCAweDFBLCAweDBBXSxcblx0XHRqcGVnOiBbMHhGRiwgMHhEOCwgMHhGRl0sXG5cdFx0Ym1wOiBbMHg0MiwgMHg0RF0sXG5cdFx0Z2lmOiBbMHg0NywgMHg0OSwgMHg0NiwgMHgzOF0sXG5cdFx0dGlmZjogWzB4NDksIDB4NDksIDB4MkEsIDB4MDBdXG5cdH07XG5cblx0cmV0dXJuIE9iamVjdC52YWx1ZXMoaWRlbnRpZmllcikuc29tZSgoc2lnbmF0dXJlKSA9PlxuXHRcdHNpZ25hdHVyZS5ldmVyeSgoYnl0ZSwgaW5kZXgpID0+IGFycmF5W2luZGV4XSA9PT0gYnl0ZSlcblx0KTtcbn1cblxuZXhwb3J0IGNsYXNzIENvcHlUZXh0UHJvdmlkZXIgaW1wbGVtZW50cyBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyIHtcblx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVkUGFzdGVFZGl0S2luZHMgPSBbXTtcblx0cHVibGljIHJlYWRvbmx5IGNvcHlNaW1lVHlwZXMgPSBbQ09QWV9NSU1FX1RZUEVTXTtcblx0cHVibGljIHJlYWRvbmx5IHBhc3RlTWltZVR5cGVzID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElPdXRsaW5lTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0bGluZU1vZGVsU2VydmljZTogSU91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZURvY3VtZW50UGFzdGUobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dW5kZWZpbmVkIHwgSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXI+IHtcblx0XHRpZiAobW9kZWwudXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXN0b21EYXRhVHJhbnNmZXIgPSBuZXcgVlNEYXRhVHJhbnNmZXIoKTtcblx0XHRjb25zdCBkYXRhOiBTZXJpYWxpemVkQ29weURhdGEgPSB7IHJhbmdlOiByYW5nZXNbMF0sIHVyaTogbW9kZWwudXJpLnRvSlNPTigpIH07XG5cdFx0Y3VzdG9tRGF0YVRyYW5zZmVyLmFwcGVuZChDT1BZX01JTUVfVFlQRVMsIGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0oSlNPTi5zdHJpbmdpZnkoZGF0YSkpKTtcblxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGlmICh0ZXh0ICYmIHJhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHZvaWQgdGhpcy5wcmltZVN5bWJvbFJlZmVyZW5jZUNhY2hlKG1vZGVsLCByYW5nZXNbMF0sIHRleHQsIHRva2VuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VzdG9tRGF0YVRyYW5zZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcmltZVN5bWJvbFJlZmVyZW5jZUNhY2hlKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogSVJhbmdlLCB0ZXh0SXRlbTogSURhdGFUcmFuc2Zlckl0ZW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvcGllZFRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIWlkZW50aWZpZXJQYXR0ZXJuLnRlc3QoY29waWVkVGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjYWNoZVN5bWJvbFJlZmVyZW5jZShtb2RlbC51cmksIHJhbmdlLCBjb3BpZWRUZXh0LCByZXNvbHZlU3ltYm9sUmVmZXJlbmNlKFxuXHRcdFx0dGhpcy5tb2RlbFNlcnZpY2UsXG5cdFx0XHR0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdFx0dGhpcy5vdXRsaW5lTW9kZWxTZXJ2aWNlLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRjb3BpZWRUZXh0LFxuXHRcdFx0dG9rZW4sXG5cdFx0KSk7XG5cdH1cbn1cblxuY2xhc3MgQ29weUF0dGFjaG1lbnRzUHJvdmlkZXIgaW1wbGVtZW50cyBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyIHtcblxuXHRzdGF0aWMgQVRUQUNITUVOVF9NSU1FX1RZUEUgPSAnYXBwbGljYXRpb24vdm5kLmNoYXQuYXR0YWNobWVudCtqc29uJztcblxuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9IG5ldyBIaWVyYXJjaGljYWxLaW5kKCdjaGF0LmF0dGFjaC5hdHRhY2htZW50cycpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW0NvcHlBdHRhY2htZW50c1Byb3ZpZGVyLkFUVEFDSE1FTlRfTUlNRV9UWVBFXTtcblx0cHVibGljIHJlYWRvbmx5IHBhc3RlTWltZVR5cGVzID0gW0NvcHlBdHRhY2htZW50c1Byb3ZpZGVyLkFUVEFDSE1FTlRfTUlNRV9UWVBFXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlRG9jdW1lbnRQYXN0ZShtb2RlbDogSVRleHRNb2RlbCwgX3JhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIF9kYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx1bmRlZmluZWQgfCBJUmVhZG9ubHlWU0RhdGFUcmFuc2Zlcj4ge1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzO1xuXHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZXMgPSBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCk7XG5cblx0XHRpZiAoYXR0YWNobWVudHMubGVuZ3RoID09PSAwICYmIGR5bmFtaWNWYXJpYWJsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdHJlc3VsdC5hcHBlbmQoQ29weUF0dGFjaG1lbnRzUHJvdmlkZXIuQVRUQUNITUVOVF9NSU1FX1RZUEUsIGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0oSlNPTi5zdHJpbmdpZnkoeyBhdHRhY2htZW50cywgZHluYW1pY1ZhcmlhYmxlcyB9KSkpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsOiBJVGV4dE1vZGVsLCBfcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgX2NvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERvY3VtZW50UGFzdGVFZGl0c1Nlc3Npb24gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXREeW5hbWljVmFyaWFibGUgPSB3aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk7XG5cdFx0aWYgKCFjaGF0RHluYW1pY1ZhcmlhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGNvbnN0IGRhdGEgPSBkYXRhVHJhbnNmZXIuZ2V0KENvcHlBdHRhY2htZW50c1Byb3ZpZGVyLkFUVEFDSE1FTlRfTUlNRV9UWVBFKTtcblx0XHRjb25zdCByYXdEYXRhID0gYXdhaXQgZGF0YT8uYXNTdHJpbmcoKTtcblx0XHRjb25zdCB0ZXh0ZGF0YSA9IGF3YWl0IHRleHQ/LmFzU3RyaW5nKCk7XG5cblx0XHRpZiAodGV4dGRhdGEgPT09IHVuZGVmaW5lZCB8fCByYXdEYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcGFzdGVkRGF0YTogeyBhdHRhY2htZW50czogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdOyBkeW5hbWljVmFyaWFibGVzOiBJRHluYW1pY1ZhcmlhYmxlW10gfSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cGFzdGVkRGF0YSA9IHJldml2ZShKU09OLnBhcnNlKHJhd0RhdGEpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vXG5cdFx0fVxuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhc3RlZERhdGE/LmF0dGFjaG1lbnRzKSAmJiAhQXJyYXkuaXNBcnJheShwYXN0ZWREYXRhPy5keW5hbWljVmFyaWFibGVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXQ6IERvY3VtZW50UGFzdGVFZGl0ID0ge1xuXHRcdFx0aW5zZXJ0VGV4dDogdGV4dGRhdGEsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Bhc3RlZENoYXRBdHRhY2htZW50cycsICdJbnNlcnQgUHJvbXB0ICYgQXR0YWNobWVudHMnKSxcblx0XHRcdGtpbmQ6IHRoaXMua2luZCxcblx0XHRcdGhhbmRsZWRNaW1lVHlwZTogQ29weUF0dGFjaG1lbnRzUHJvdmlkZXIuQVRUQUNITUVOVF9NSU1FX1RZUEUsXG5cdFx0XHRhZGRpdGlvbmFsRWRpdDoge1xuXHRcdFx0XHRlZGl0czogW11cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZWRpdC5hZGRpdGlvbmFsRWRpdD8uZWRpdHMucHVzaCh7XG5cdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0cmVkbzogKCkgPT4ge1xuXHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4ucGFzdGVkRGF0YS5hdHRhY2htZW50cyk7XG5cdFx0XHRcdGZvciAoY29uc3QgZHluYW1pY1ZhcmlhYmxlIG9mIHBhc3RlZERhdGEuZHluYW1pY1ZhcmlhYmxlcykge1xuXHRcdFx0XHRcdGNoYXREeW5hbWljVmFyaWFibGU/LmFkZFJlZmVyZW5jZShkeW5hbWljVmFyaWFibGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdpZGdldC5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHRcdH0sXG5cdFx0XHR1bmRvOiAoKSA9PiB7XG5cdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuZGVsZXRlKC4uLnBhc3RlZERhdGEuYXR0YWNobWVudHMubWFwKGMgPT4gYy5pZCkpO1xuXHRcdFx0XHR3aWRnZXQucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY3JlYXRlRWRpdFNlc3Npb24oZWRpdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhc3RlVGV4dFByb3ZpZGVyIGltcGxlbWVudHMgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciB7XG5cblx0cHVibGljIHJlYWRvbmx5IGtpbmQgPSBuZXcgSGllcmFyY2hpY2FsS2luZCgnY2hhdC5hdHRhY2gudGV4dCcpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFtDT1BZX01JTUVfVFlQRVNdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIF9jb250ZXh0OiBEb2N1bWVudFBhc3RlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEb2N1bWVudFBhc3RlRWRpdHNTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG1vZGVsLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGNvbnN0IGVkaXRvckRhdGEgPSBkYXRhVHJhbnNmZXIuZ2V0KCd2c2NvZGUtZWRpdG9yLWRhdGEnKTtcblx0XHRjb25zdCBhZGRpdGlvbmFsRWRpdG9yRGF0YSA9IGRhdGFUcmFuc2Zlci5nZXQoQ09QWV9NSU1FX1RZUEVTKTtcblxuXHRcdGlmICghZWRpdG9yRGF0YSB8fCAhdGV4dCB8fCAhYWRkaXRpb25hbEVkaXRvckRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0ZGF0YSA9IGF3YWl0IHRleHQuYXNTdHJpbmcoKTtcblx0XHRjb25zdCBtZXRhZGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgZWRpdG9yRGF0YS5hc1N0cmluZygpKTtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGF0YTogU2VyaWFsaXplZENvcHlEYXRhID0gSlNPTi5wYXJzZShhd2FpdCBhZGRpdGlvbmFsRWRpdG9yRGF0YS5hc1N0cmluZygpKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBhZGRpdGlvbmFsRGF0YS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kID0gYWRkaXRpb25hbERhdGEucmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRpZiAoc3RhcnQgPT09IGVuZCkge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwoVVJJLnJldml2ZShhZGRpdGlvbmFsRGF0YS51cmkpKTtcblx0XHRcdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgY29waWVkIGxpbmUgdGV4dCBkYXRhIGlzIHRoZSBlbnRpcmUgbGluZSBjb250ZW50LCB0aGVuIHdlIGNhbiBwYXN0ZSBpdCBhcyBhIGNvZGUgYXR0YWNobWVudC4gT3RoZXJ3aXNlLCB3ZSBpZ25vcmUgYW5kIHVzZSBkZWZhdWx0IHBhc3RlIHByb3ZpZGVyLlxuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnQpO1xuXHRcdFx0aWYgKGxpbmVDb250ZW50ICE9PSB0ZXh0ZGF0YSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29waWVkQ29udGV4dCA9IGdldENvcGllZENvbnRleHQodGV4dGRhdGEsIFVSSS5yZXZpdmUoYWRkaXRpb25hbERhdGEudXJpKSwgbWV0YWRhdGEubW9kZSwgYWRkaXRpb25hbERhdGEucmFuZ2UpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFjb3BpZWRDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudENvbnRleHRJZHMgPSB3aWRnZXQuYXR0YWNobWVudE1vZGVsLmdldEF0dGFjaG1lbnRJRHMoKTtcblx0XHRpZiAoY3VycmVudENvbnRleHRJZHMuaGFzKGNvcGllZENvbnRleHQuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdCA9IGNyZWF0ZUN1c3RvbVBhc3RlRWRpdChtb2RlbCwgW2NvcGllZENvbnRleHRdLCBNaW1lcy50ZXh0LCB0aGlzLmtpbmQsIGxvY2FsaXplKCdwYXN0ZWRDb2RlQXR0YWNobWVudCcsICdQYXN0ZWQgQ29kZSBBdHRhY2htZW50JyksIHRoaXMuY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGVkaXQueWllbGRUbyA9IFt7IGtpbmQ6IEhpZXJhcmNoaWNhbEtpbmQuRW1wdHkuYXBwZW5kKCd0ZXh0JywgJ3BsYWluJykgfV07XG5cdFx0cmV0dXJuIGNyZWF0ZUVkaXRTZXNzaW9uKGVkaXQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldENvcGllZENvbnRleHQoY29kZTogc3RyaW5nLCBmaWxlOiBVUkksIGxhbmd1YWdlOiBzdHJpbmcsIHJhbmdlOiBJUmFuZ2UpOiBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnkge1xuXHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKGZpbGUpO1xuXHRjb25zdCBzdGFydCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0Y29uc3QgZW5kID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0Y29uc3QgcmVzdWx0VGV4dCA9IGBDb3BpZWQgU2VsZWN0aW9uIG9mIENvZGU6IFxcblxcblxcbiBGcm9tIHRoZSBmaWxlOiAke2ZpbGVOYW1lfSBGcm9tIGxpbmVzICR7c3RhcnR9IHRvICR7ZW5kfSBcXG4gXFxgXFxgXFxgJHtjb2RlfVxcYFxcYFxcYGA7XG5cdGNvbnN0IHBhc3RlZExpbmVzID0gc3RhcnQgPT09IGVuZCA/IGxvY2FsaXplKCdwYXN0ZWRBdHRhY2htZW50Lm9uZUxpbmUnLCAnMSBsaW5lJykgOiBsb2NhbGl6ZSgncGFzdGVkQXR0YWNobWVudC5tdWx0aXBsZUxpbmVzJywgJ3swfSBsaW5lcycsIGVuZCArIDEgLSBzdGFydCk7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3Bhc3RlJyxcblx0XHR2YWx1ZTogcmVzdWx0VGV4dCxcblx0XHRpZDogYCR7ZmlsZU5hbWV9JHtzdGFydH0ke2VuZH0ke3JhbmdlLnN0YXJ0Q29sdW1ufSR7cmFuZ2UuZW5kQ29sdW1ufWAsXG5cdFx0bmFtZTogYCR7ZmlsZU5hbWV9ICR7cGFzdGVkTGluZXN9YCxcblx0XHRpY29uOiBDb2RpY29uLmNvZGUsXG5cdFx0cGFzdGVkTGluZXMsXG5cdFx0bGFuZ3VhZ2UsXG5cdFx0ZmlsZU5hbWU6IGZpbGUudG9TdHJpbmcoKSxcblx0XHRjb3BpZWRGcm9tOiB7XG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0XHRyYW5nZVxuXHRcdH0sXG5cdFx0Y29kZSxcblx0XHRyZWZlcmVuY2VzOiBbe1xuXHRcdFx0cmVmZXJlbmNlOiBmaWxlLFxuXHRcdFx0a2luZDogJ3JlZmVyZW5jZSdcblx0XHR9XVxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDdXN0b21QYXN0ZUVkaXQobW9kZWw6IElUZXh0TW9kZWwsIGNvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSwgaGFuZGxlZE1pbWVUeXBlOiBzdHJpbmcsIGtpbmQ6IEhpZXJhcmNoaWNhbEtpbmQsIHRpdGxlOiBzdHJpbmcsIGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UpOiBEb2N1bWVudFBhc3RlRWRpdCB7XG5cblx0Y29uc3QgbGFiZWwgPSBjb250ZXh0Lmxlbmd0aCA9PT0gMVxuXHRcdD8gY29udGV4dFswXS5uYW1lXG5cdFx0OiBsb2NhbGl6ZSgncGFzdGVkQXR0YWNobWVudC5tdWx0aXBsZScsICd7MH0gYW5kIHsxfSBtb3JlJywgY29udGV4dFswXS5uYW1lLCBjb250ZXh0Lmxlbmd0aCAtIDEpO1xuXHRjb25zdCBhbm5vdW5jZUltYWdlQXR0YWNobWVudCA9IGNvbnRleHQubGVuZ3RoID09PSAxICYmIGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGNvbnRleHRbMF0pO1xuXG5cdGNvbnN0IGN1c3RvbUVkaXQgPSB7XG5cdFx0cmVzb3VyY2U6IG1vZGVsLnVyaSxcblx0XHR2YXJpYWJsZTogY29udGV4dCxcblx0XHR1bmRvOiAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHdpZGdldCBmb3VuZCBmb3IgdW5kbycpO1xuXHRcdFx0fVxuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5kZWxldGUoLi4uY29udGV4dC5tYXAoYyA9PiBjLmlkKSk7XG5cdFx0fSxcblx0XHRyZWRvOiAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHdpZGdldCBmb3VuZCBmb3IgcmVkbycpO1xuXHRcdFx0fVxuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmNvbnRleHQpO1xuXHRcdFx0aWYgKGFubm91bmNlSW1hZ2VBdHRhY2htZW50KSB7XG5cdFx0XHRcdGFsZXJ0KGxvY2FsaXplKCdjaGF0LnBhc3RlZEltYWdlQXR0YWNoZWQnLCAnQXR0YWNoZWQgaW1hZ2UnKSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0bmVlZHNDb25maXJtYXRpb246IGZhbHNlLFxuXHRcdFx0bGFiZWxcblx0XHR9XG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRpbnNlcnRUZXh0OiAnJyxcblx0XHR0aXRsZSxcblx0XHRraW5kLFxuXHRcdGhhbmRsZWRNaW1lVHlwZSxcblx0XHRhZGRpdGlvbmFsRWRpdDoge1xuXHRcdFx0ZWRpdHM6IFtjdXN0b21FZGl0XSxcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVkaXRTZXNzaW9uKGVkaXQ6IERvY3VtZW50UGFzdGVFZGl0KTogRG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0ZWRpdHM6IFtlZGl0XSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG59XG5cbmNvbnN0IGlkZW50aWZpZXJQYXR0ZXJuID0gL15bYS16QS1aXyRdW2EtekEtWjAtOV8kXSokLztcbmNvbnN0IHN5bWJvbENhY2hlTWF4U2l6ZSA9IDM7XG50eXBlIFN5bWJvbFJlZmVyZW5jZUNhY2hlRW50cnkgPSB7XG5cdGtleTogc3RyaW5nO1xuXHRwcm9taXNlPzogUHJvbWlzZTxSZXNvbHZlZFN5bWJvbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD47XG59O1xuXG5jb25zdCBzeW1ib2xSZWZlcmVuY2VDYWNoZTogU3ltYm9sUmVmZXJlbmNlQ2FjaGVFbnRyeVtdID0gW107XG5cbmZ1bmN0aW9uIGdldFN5bWJvbFJlZmVyZW5jZUNhY2hlS2V5KHVyaTogVVJJLCByYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7dXJpLnRvU3RyaW5nKCl9fCR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfToke3JhbmdlLnN0YXJ0Q29sdW1ufS0ke3JhbmdlLmVuZExpbmVOdW1iZXJ9OiR7cmFuZ2UuZW5kQ29sdW1ufXwke3RleHR9YDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2FjaGVkU3ltYm9sUmVmZXJlbmNlKHVyaTogVVJJLCByYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVkU3ltYm9sUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGtleSA9IGdldFN5bWJvbFJlZmVyZW5jZUNhY2hlS2V5KHVyaSwgcmFuZ2UsIHRleHQpO1xuXHRyZXR1cm4gc3ltYm9sUmVmZXJlbmNlQ2FjaGUuZmluZChlID0+IGUua2V5ID09PSBrZXkpPy5wcm9taXNlO1xufVxuXG5mdW5jdGlvbiBjYWNoZVN5bWJvbFJlZmVyZW5jZSh1cmk6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nLCB2YWx1ZVByb21pc2U6IFByb21pc2U8UmVzb2x2ZWRTeW1ib2xSZWZlcmVuY2UgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdGNvbnN0IGVudHJ5OiBTeW1ib2xSZWZlcmVuY2VDYWNoZUVudHJ5ID0ge1xuXHRcdGtleTogZ2V0U3ltYm9sUmVmZXJlbmNlQ2FjaGVLZXkodXJpLCByYW5nZSwgdGV4dCksXG5cdFx0cHJvbWlzZTogdmFsdWVQcm9taXNlLFxuXHR9O1xuXHRzeW1ib2xSZWZlcmVuY2VDYWNoZS51bnNoaWZ0KGVudHJ5KTtcblx0d2hpbGUgKHN5bWJvbFJlZmVyZW5jZUNhY2hlLmxlbmd0aCA+IHN5bWJvbENhY2hlTWF4U2l6ZSkge1xuXHRcdHN5bWJvbFJlZmVyZW5jZUNhY2hlLnBvcCgpO1xuXHR9XG5cblx0dmFsdWVQcm9taXNlLmNhdGNoKCgpID0+IHtcblx0XHRjb25zdCBpID0gc3ltYm9sUmVmZXJlbmNlQ2FjaGUuaW5kZXhPZihlbnRyeSk7XG5cdFx0aWYgKGkgIT09IC0xKSB7XG5cdFx0XHRzeW1ib2xSZWZlcmVuY2VDYWNoZS5zcGxpY2UoaSwgMSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVN5bWJvbFJlZmVyZW5jZShcblx0bW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRvdXRsaW5lTW9kZWxTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0c291cmNlVXJpOiBVUkksXG5cdHNvdXJjZVJhbmdlOiBJUmFuZ2UsXG5cdHBhc3RlZFRleHQ6IHN0cmluZyxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuKTogUHJvbWlzZTxSZXNvbHZlZFN5bWJvbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzb3VyY2VNb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChzb3VyY2VVcmkpO1xuXHRpZiAoIXNvdXJjZU1vZGVsKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3Qgc291cmNlUG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc291cmNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzb3VyY2VSYW5nZS5zdGFydENvbHVtbik7XG5cdGNvbnN0IGRlZmluaXRpb25zID0gYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgc291cmNlTW9kZWwsIHNvdXJjZVBvc2l0aW9uLCBmYWxzZSwgdG9rZW4pO1xuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIWRlZmluaXRpb25zLmxlbmd0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGRlZiA9IGRlZmluaXRpb25zWzBdO1xuXHRjb25zdCBkZWZSYW5nZSA9IGRlZi50YXJnZXRTZWxlY3Rpb25SYW5nZSA/PyBkZWYucmFuZ2U7XG5cdGNvbnN0IGRlZkxvY2F0aW9uID0geyB1cmk6IGRlZi51cmksIHJhbmdlOiBkZWZSYW5nZSB9O1xuXG5cdGxldCBpY29uID0gQ29kaWNvbi5zeW1ib2xQcm9wZXJ0eTtcblx0Y29uc3QgZGVmTW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZGVmLnVyaSk7XG5cdGlmIChkZWZNb2RlbCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvdXRsaW5lID0gYXdhaXQgb3V0bGluZU1vZGVsU2VydmljZS5nZXRPckNyZWF0ZShkZWZNb2RlbCwgdG9rZW4pO1xuXHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gb3V0bGluZS5nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24oeyBsaW5lTnVtYmVyOiBkZWZSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogZGVmUmFuZ2Uuc3RhcnRDb2x1bW4gfSk7XG5cdFx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdFx0aWNvbiA9IFN5bWJvbEtpbmRzLnRvSWNvbihlbGVtZW50LnN5bWJvbC5raW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gVXNlIGRlZmF1bHQgaWNvbi5cblx0XHR9XG5cdH1cblxuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBgdnNjb2RlLnN5bWJvbC8ke0pTT04uc3RyaW5naWZ5KGRlZkxvY2F0aW9uKX1gLFxuXHRcdGZ1bGxOYW1lOiBwYXN0ZWRUZXh0LFxuXHRcdGRhdGE6IGRlZkxvY2F0aW9uLFxuXHRcdGljb25cblx0fTtcbn1cblxuY2xhc3MgUGFzdGVTeW1ib2xQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQuYXR0YWNoLnN5bWJvbCcpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFtDT1BZX01JTUVfVFlQRVNdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJT3V0bGluZU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG91dGxpbmVNb2RlbFNlcnZpY2U6IElPdXRsaW5lTW9kZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIF9jb250ZXh0OiBEb2N1bWVudFBhc3RlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEb2N1bWVudFBhc3RlRWRpdHNTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG1vZGVsLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IGRhdGFUcmFuc2Zlci5nZXQoTWltZXMudGV4dCk7XG5cdFx0Y29uc3QgYWRkaXRpb25hbEVkaXRvckRhdGEgPSBkYXRhVHJhbnNmZXIuZ2V0KENPUFlfTUlNRV9UWVBFUyk7XG5cdFx0aWYgKCF0ZXh0IHx8ICFhZGRpdGlvbmFsRWRpdG9yRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhc3RlZFRleHQgPSBhd2FpdCB0ZXh0LmFzU3RyaW5nKCk7XG5cdFx0aWYgKCFpZGVudGlmaWVyUGF0dGVybi50ZXN0KHBhc3RlZFRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGFkZGl0aW9uYWxEYXRhOiBTZXJpYWxpemVkQ29weURhdGE7XG5cdFx0dHJ5IHtcblx0XHRcdGFkZGl0aW9uYWxEYXRhID0gSlNPTi5wYXJzZShhd2FpdCBhZGRpdGlvbmFsRWRpdG9yRGF0YS5hc1N0cmluZygpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkucmV2aXZlKGFkZGl0aW9uYWxEYXRhLnVyaSk7XG5cdFx0Y29uc3Qgc291cmNlUmFuZ2UgPSBhZGRpdGlvbmFsRGF0YS5yYW5nZTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gYXdhaXQgZ2V0Q2FjaGVkU3ltYm9sUmVmZXJlbmNlKHNvdXJjZVVyaSwgc291cmNlUmFuZ2UsIHBhc3RlZFRleHQpO1xuXHRcdGxldCByZXNvbHZlZCA9IGNhY2hlZDtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRyZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVTeW1ib2xSZWZlcmVuY2UoXG5cdFx0XHRcdHRoaXMubW9kZWxTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdFx0XHRcdHNvdXJjZVVyaSxcblx0XHRcdFx0c291cmNlUmFuZ2UsXG5cdFx0XHRcdHBhc3RlZFRleHQsXG5cdFx0XHRcdHRva2VuLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5bVRleHQgPSBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9c3ltOiR7cGFzdGVkVGV4dH1gO1xuXHRcdGNvbnN0IHBhc3RlUmFuZ2UgPSByYW5nZXNbMF07XG5cdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IGAke3N5bVRleHR9IGA7XG5cblx0XHRjb25zdCByZWZSYW5nZSA9IHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogcGFzdGVSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRzdGFydENvbHVtbjogcGFzdGVSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdGVuZExpbmVOdW1iZXI6IHBhc3RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBwYXN0ZVJhbmdlLnN0YXJ0Q29sdW1uICsgc3ltVGV4dC5sZW5ndGhcblx0XHR9O1xuXG5cdFx0Y29uc3QgZHluYW1pY1JlZiA9IHtcblx0XHRcdGlkOiByZXNvbHZlZC5pZCxcblx0XHRcdGZ1bGxOYW1lOiByZXNvbHZlZC5mdWxsTmFtZSxcblx0XHRcdHJhbmdlOiByZWZSYW5nZSxcblx0XHRcdGRhdGE6IHJlc29sdmVkLmRhdGEsXG5cdFx0XHRpY29uOiByZXNvbHZlZC5pY29uXG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXQ6IERvY3VtZW50UGFzdGVFZGl0ID0ge1xuXHRcdFx0aW5zZXJ0VGV4dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncGFzdGVkU3ltYm9sUmVmZXJlbmNlJywgJ1Bhc3RlZCBTeW1ib2wgUmVmZXJlbmNlJyksXG5cdFx0XHRraW5kOiB0aGlzLmtpbmQsXG5cdFx0XHRoYW5kbGVkTWltZVR5cGU6IENPUFlfTUlNRV9UWVBFUyxcblx0XHRcdGFkZGl0aW9uYWxFZGl0OiB7XG5cdFx0XHRcdGVkaXRzOiBbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0XHRcdFx0cmVkbzogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdyA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRcdFx0dz8uZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LmFkZFJlZmVyZW5jZShkeW5hbWljUmVmKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVuZG86ICgpID0+IHtcblx0XHRcdFx0XHRcdC8vIFRoZSB0ZXh0IHJlbW92YWwgYnkgdW5kbyBpcyBzdWZmaWNpZW50OyB0aGUgZHluYW1pYyB2YXJpYWJsZVxuXHRcdFx0XHRcdFx0Ly8gbW9kZWwgYXV0by1jbGVhbnMgd2hlbiB0aGUgZGVjb3JhdGlvbiB0ZXh0IGNoYW5nZXMuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRlZGl0LnlpZWxkVG8gPSBbeyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnY2hhdC5hdHRhY2gudGV4dCcpIH1dO1xuXHRcdHJldHVybiBjcmVhdGVFZGl0U2Vzc2lvbihlZGl0KTtcblx0fVxufVxuXG5jbGFzcyBQYXN0ZUh0bWxQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQucGFzdGUuaHRtbCcpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFtNaW1lcy5odG1sXTtcblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsOiBJVGV4dE1vZGVsLCBfcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgY29udGV4dDogRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChtb2RlbC51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgYWN0aXZhdGUgb24gYXV0b21hdGljIHBhc3RlIFx1MjAxNCBmb3IgZXhwbGljaXQgXCJQYXN0ZSBBc1wiIHRoZSB1c2VyXG5cdFx0Ly8gbGlrZWx5IHdhbnRzIHRoZSByYXcgdGV4dCBvciBhbiBhdHRhY2htZW50LCBub3QgYSBjb252ZXJ0ZWQgbWFya2Rvd24gZm9ybS5cblx0XHRpZiAoY29udGV4dC50cmlnZ2VyS2luZCAhPT0gRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLkF1dG9tYXRpYykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gZGF0YVRyYW5zZmVyLmdldChNaW1lcy5odG1sKTtcblx0XHRjb25zdCBodG1sVGV4dCA9IGF3YWl0IGVudHJ5Py5hc1N0cmluZygpO1xuXHRcdGlmICghaHRtbFRleHQgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIGlmIHRoZSBIVE1MIGlzIHRyaXZpYWxseSBwbGFpbiB0ZXh0IChubyBtZWFuaW5nZnVsIHRhZ3MpXG5cdFx0aWYgKCEvPChhfHN0cm9uZ3xifGVtfGl8aFsxLTZdfGNvZGV8cHJlfHVsfG9sfGxpfGJsb2NrcXVvdGV8ZGVsfHN8c3RyaWtlfGltZ3xocilcXGIvaS50ZXN0KGh0bWxUZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duID0gY29udmVydEh0bWxUb01hcmtkb3duKGh0bWxUZXh0KTtcblxuXHRcdC8vIElmIGNvbnZlcnNpb24gcHJvZHVjZWQgbm90aGluZyB1c2VmdWwsIGZhbGwgYmFja1xuXHRcdGlmICghbWFya2Rvd24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3JlYXRlRWRpdFNlc3Npb24oe1xuXHRcdFx0aW5zZXJ0VGV4dDogbWFya2Rvd24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3Bhc3RlSHRtbEFzTWFya2Rvd24nLCAnUGFzdGUgYXMgTWFya2Rvd24nKSxcblx0XHRcdGtpbmQ6IHRoaXMua2luZCxcblx0XHRcdGhhbmRsZWRNaW1lVHlwZTogTWltZXMuaHRtbCxcblx0XHRcdHlpZWxkVG86IFtcblx0XHRcdFx0eyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnY2hhdC5hdHRhY2gudGV4dCcpIH0sXG5cdFx0XHRcdHsga2luZDogbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQuYXR0YWNoLmltYWdlJykgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRQYXN0ZVByb3ZpZGVyc0ZlYXR1cmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIHBhdHRlcm46ICcqJywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwgaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcHlBdHRhY2htZW50c1Byb3ZpZGVyKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBwYXR0ZXJuOiAnKicsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIG5ldyBQYXN0ZUltYWdlUHJvdmlkZXIoY2hhdFdpZGdldFNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIHBhdHRlcm46ICcqJywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwgbmV3IFBhc3RlVGV4dFByb3ZpZGVyKGNoYXRXaWRnZXRTZXJ2aWNlLCBtb2RlbFNlcnZpY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIHBhdHRlcm46ICcqJywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwgbmV3IFBhc3RlSHRtbFByb3ZpZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgcGF0dGVybjogJyonLCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGFzdGVTeW1ib2xQcm92aWRlcikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKCcqJywgaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcHlUZXh0UHJvdmlkZXIpKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDhCQUEwRSxzQkFBc0I7QUFDekcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGdCQUFnQjtBQUNuQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQXdHLDBCQUEwQixtQkFBbUI7QUFFckosU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUIsNEJBQTRCO0FBQ3hELFNB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
