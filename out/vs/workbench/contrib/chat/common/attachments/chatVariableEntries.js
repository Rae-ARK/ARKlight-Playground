import { Codicon } from "../../../../../base/common/codicons.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { localize } from "../../../../../nls.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../../base/common/buffer.js";
function isChatContextIconPath(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (ThemeIcon.isThemeIcon(value) || URI.isUri(value)) {
    return true;
  }
  const asDualPath = value;
  return URI.isUri(asDualPath.light) && URI.isUri(asDualPath.dark);
}
function resolveChatContextIcon(iconPath, useDark) {
  if (ThemeIcon.isThemeIcon(iconPath) || URI.isUri(iconPath)) {
    return iconPath;
  }
  return useDark ? iconPath.dark : iconPath.light;
}
const ChatPasteAttachmentMetadata = {
  Kind: "vscode.chat.attachment.kind",
  Language: "vscode.chat.attachment.language",
  FileName: "vscode.chat.attachment.fileName",
  PastedLines: "vscode.chat.attachment.pastedLines"
};
var AgentHostCompletionReferenceKind = /* @__PURE__ */ ((AgentHostCompletionReferenceKind2) => {
  AgentHostCompletionReferenceKind2["Skill"] = "skill";
  AgentHostCompletionReferenceKind2["Command"] = "command";
  return AgentHostCompletionReferenceKind2;
})(AgentHostCompletionReferenceKind || {});
function agentHostCompletionVariableValue(kind) {
  return { $mid: "agentHostCompletion", kind };
}
function agentHostCompletionVariableId(kind, reference) {
  switch (kind) {
    case "skill" /* Skill */:
      return reference.toString();
    case "command" /* Command */:
      return "agent-host-command:" + reference.toString();
  }
}
function toAgentHostCompletionVariableEntry(kind, name, reference, _meta) {
  return {
    kind: "generic",
    id: reference !== void 0 ? agentHostCompletionVariableId(kind, reference) : generateUuid(),
    name,
    value: agentHostCompletionVariableValue(kind),
    _meta
  };
}
function toAgentHostCompletionVariableEntryFromMetadata(kind, name, _meta) {
  switch (kind) {
    case "skill" /* Skill */:
      return toAgentHostCompletionVariableEntry(kind, name, typeof _meta?.uri === "string" ? _meta.uri : void 0, _meta);
    case "command" /* Command */:
      return toAgentHostCompletionVariableEntry(kind, name, typeof _meta?.command === "string" ? _meta.command : void 0, _meta);
  }
}
function getAgentHostCompletionReferenceKind(entry) {
  if (entry.kind !== "generic") {
    return void 0;
  }
  return getAgentHostCompletionReferenceKindFromValue(entry.value);
}
function getAgentHostCompletionReferenceKindFromValue(value) {
  if (typeof value !== "object" || value === null) {
    return void 0;
  }
  const record = value;
  if (record.$mid !== "agentHostCompletion") {
    return void 0;
  }
  switch (record.kind) {
    case "skill" /* Skill */:
    case "command" /* Command */:
      return record.kind;
  }
  return void 0;
}
function isAgentHostCompletionVariableEntry(entry) {
  return getAgentHostCompletionReferenceKind(entry) !== void 0;
}
var OmittedState = /* @__PURE__ */ ((OmittedState2) => {
  OmittedState2[OmittedState2["NotOmitted"] = 0] = "NotOmitted";
  OmittedState2[OmittedState2["Partial"] = 1] = "Partial";
  OmittedState2[OmittedState2["Full"] = 2] = "Full";
  OmittedState2[OmittedState2["ImageLimitExceeded"] = 3] = "ImageLimitExceeded";
  return OmittedState2;
})(OmittedState || {});
const CLAUDE_MESSAGES_MAX_IMAGES_PER_REQUEST = 20;
const GEMINI_MAX_IMAGES_PER_REQUEST = 10;
function getImageAttachmentLimit(model) {
  if (!model) {
    return void 0;
  }
  const family = model.family.toLowerCase();
  if (family.startsWith("gemini")) {
    return GEMINI_MAX_IMAGES_PER_REQUEST;
  }
  if (family.startsWith("claude") || family.startsWith("anthropic")) {
    return CLAUDE_MESSAGES_MAX_IMAGES_PER_REQUEST;
  }
  return void 0;
}
function toPasteVariableEntry(name, code, options) {
  const language = options?.language ?? "markdown";
  const fileName = options?.fileName ?? name;
  const pastedLines = options?.pastedLines ?? name;
  return {
    kind: "paste",
    id: options?.id ?? `chat-paste-${generateUuid()}`,
    name,
    icon: options?.icon,
    value: code,
    code,
    language,
    pastedLines,
    fileName,
    copiedFrom: void 0,
    _meta: {
      ...options?._meta,
      [ChatPasteAttachmentMetadata.Kind]: "paste",
      [ChatPasteAttachmentMetadata.Language]: language,
      [ChatPasteAttachmentMetadata.FileName]: fileName,
      [ChatPasteAttachmentMetadata.PastedLines]: pastedLines
    }
  };
}
function restorePasteVariableEntryFromAttachment(attachment) {
  const modelRepresentation = attachment.modelRepresentation;
  if (typeof modelRepresentation !== "string" || attachment._meta?.[ChatPasteAttachmentMetadata.Kind] !== "paste") {
    return void 0;
  }
  const stringMetadata = (key, fallback) => {
    const value = attachment._meta?.[key];
    return typeof value === "string" ? value : fallback;
  };
  return toPasteVariableEntry(attachment.label, modelRepresentation, {
    language: stringMetadata(ChatPasteAttachmentMetadata.Language, "markdown"),
    fileName: stringMetadata(ChatPasteAttachmentMetadata.FileName, attachment.label),
    pastedLines: stringMetadata(ChatPasteAttachmentMetadata.PastedLines, attachment.label),
    _meta: attachment._meta
  });
}
var IDiagnosticVariableEntryFilterData;
((IDiagnosticVariableEntryFilterData2) => {
  IDiagnosticVariableEntryFilterData2.icon = Codicon.error;
  function fromMarker(marker) {
    return {
      filterUri: marker.resource,
      owner: marker.owner,
      problemMessage: marker.message,
      filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
    };
  }
  IDiagnosticVariableEntryFilterData2.fromMarker = fromMarker;
  function toEntry(data) {
    return {
      id: id(data),
      name: label(data),
      icon: IDiagnosticVariableEntryFilterData2.icon,
      value: data,
      kind: "diagnostic",
      ...data
    };
  }
  IDiagnosticVariableEntryFilterData2.toEntry = toEntry;
  function id(data) {
    return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber, data.filterRange?.startColumn].join(":");
  }
  IDiagnosticVariableEntryFilterData2.id = id;
  function label(data) {
    let TrimThreshold;
    ((TrimThreshold2) => {
      TrimThreshold2[TrimThreshold2["MaxChars"] = 30] = "MaxChars";
      TrimThreshold2[TrimThreshold2["MaxSpaceLookback"] = 10] = "MaxSpaceLookback";
    })(TrimThreshold || (TrimThreshold = {}));
    if (data.problemMessage) {
      if (data.problemMessage.length < 30 /* MaxChars */) {
        return data.problemMessage;
      }
      const lastSpace = data.problemMessage.lastIndexOf(" ", 30 /* MaxChars */);
      if (lastSpace === -1 || lastSpace + 10 /* MaxSpaceLookback */ < 30 /* MaxChars */) {
        return data.problemMessage.substring(0, 30 /* MaxChars */) + "\u2026";
      }
      return data.problemMessage.substring(0, lastSpace) + "\u2026";
    }
    let labelStr = localize("chat.attachment.problems.all", "All Problems");
    if (data.filterUri) {
      labelStr = localize("chat.attachment.problems.inFile", "Problems in {0}", basename(data.filterUri));
    }
    return labelStr;
  }
  IDiagnosticVariableEntryFilterData2.label = label;
})(IDiagnosticVariableEntryFilterData || (IDiagnosticVariableEntryFilterData = {}));
function isBrowserViewVariableEntry(entry) {
  return entry.kind === "browserView";
}
function isChatReferenceVariableEntry(entry) {
  return entry.kind === "chatReference";
}
function chatReferenceVariableEntryId(chatResource, endTurn) {
  return endTurn === void 0 ? `agent-host-chat:${chatResource.toString()}` : `agent-host-chat:${chatResource.toString()}\0${endTurn}`;
}
function createChatReferenceVariableEntry(chatResource, endTurn, title, _meta, range) {
  return {
    kind: "chatReference",
    id: chatReferenceVariableEntryId(chatResource, endTurn),
    name: title,
    value: chatResource,
    endTurn,
    range,
    _meta
  };
}
function toChatReferenceDynamicVariableValue(chatResource, endTurn) {
  return endTurn === void 0 ? { $mid: "agentHostChatReference", chatResource: chatResource.toString() } : { $mid: "agentHostChatReference", chatResource: chatResource.toString(), endTurn };
}
function isChatReferenceDynamicVariableValue(value) {
  return typeof value === "object" && value !== null && value.$mid === "agentHostChatReference";
}
function chatReferenceVariableEntryFromDynamicValue(value, id, name, range, _meta) {
  let chatResource;
  try {
    chatResource = URI.parse(value.chatResource);
  } catch {
    return void 0;
  }
  return {
    kind: "chatReference",
    id,
    name,
    value: chatResource,
    endTurn: value.endTurn,
    range,
    _meta
  };
}
var IChatRequestVariableEntry;
((IChatRequestVariableEntry2) => {
  function toUri(entry) {
    return URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : void 0;
  }
  IChatRequestVariableEntry2.toUri = toUri;
  function toExport(v) {
    if (v.value instanceof Uint8Array) {
      const dup = { ...v };
      dup.value = { $base64: encodeBase64(VSBuffer.wrap(v.value)) };
      return dup;
    }
    if (isElementVariableEntry(v) && v.imageData instanceof Uint8Array) {
      return {
        ...v,
        imageData: { $base64: encodeBase64(VSBuffer.wrap(v.imageData)) }
      };
    }
    return v;
  }
  IChatRequestVariableEntry2.toExport = toExport;
  function fromExport(v) {
    if (v && "values" in v && Array.isArray(v.values)) {
      return {
        kind: "generic",
        id: v.id ?? "",
        name: v.name,
        value: v.values[0]?.value,
        range: v.range,
        modelDescription: v.modelDescription,
        references: v.references
      };
    } else {
      if (v.value && typeof v.value === "object" && "$base64" in v.value && typeof v.value.$base64 === "string") {
        const dup = { ...v };
        dup.value = decodeBase64(v.value.$base64).buffer;
        return dup;
      }
      if (isElementVariableEntry(v) && v.imageData && typeof v.imageData === "object" && "$base64" in v.imageData && typeof v.imageData.$base64 === "string") {
        return {
          ...v,
          imageData: decodeBase64(v.imageData.$base64).buffer
        };
      }
      return v;
    }
  }
  IChatRequestVariableEntry2.fromExport = fromExport;
})(IChatRequestVariableEntry || (IChatRequestVariableEntry = {}));
function isImplicitVariableEntry(obj) {
  return obj.kind === "implicit";
}
function isStringVariableEntry(obj) {
  return obj.kind === "string";
}
function isTerminalVariableEntry(obj) {
  return obj.kind === "terminalCommand";
}
function isDebugVariableEntry(obj) {
  return obj.kind === "debugVariable";
}
function isAgentFeedbackVariableEntry(obj) {
  return obj.kind === "agentFeedback";
}
function isPasteVariableEntry(obj) {
  return obj.kind === "paste";
}
function isWorkspaceVariableEntry(obj) {
  return obj.kind === "workspace";
}
function isImageVariableEntry(obj) {
  return obj.kind === "image";
}
function isExplicitFileOrImageVariableEntry(obj) {
  return obj.kind === "file" || obj.kind === "directory" || obj.kind === "image";
}
function getExplicitFileOrImageAttachmentSummary(entries) {
  const fileOrImageEntries = entries.filter(isExplicitFileOrImageVariableEntry);
  if (!fileOrImageEntries.length) {
    return void 0;
  }
  if (fileOrImageEntries.every(isImageVariableEntry)) {
    return fileOrImageEntries.length === 1 ? localize("chat.attachmentSummary.image.one", "Attached 1 image") : localize("chat.attachmentSummary.image.many", "Attached {0} images", fileOrImageEntries.length);
  }
  return fileOrImageEntries.length === 1 ? localize("chat.attachmentSummary.file.one", "Attached 1 file") : localize("chat.attachmentSummary.file.many", "Attached {0} files", fileOrImageEntries.length);
}
function isNotebookOutputVariableEntry(obj) {
  return obj.kind === "notebookOutput";
}
function isElementVariableEntry(obj) {
  return obj.kind === "element";
}
function isDiagnosticsVariableEntry(obj) {
  return obj.kind === "diagnostic";
}
function isChatRequestFileEntry(obj) {
  return obj.kind === "file";
}
function isPromptFileVariableEntry(obj) {
  return obj.kind === "promptFile";
}
function isPromptTextVariableEntry(obj) {
  return obj.kind === "promptText";
}
function isChatRequestVariableEntry(obj) {
  const entry = obj;
  return typeof entry === "object" && entry !== null && typeof entry.id === "string" && typeof entry.name === "string";
}
function isSCMHistoryItemVariableEntry(obj) {
  return obj.kind === "scmHistoryItem";
}
function isSCMHistoryItemChangeVariableEntry(obj) {
  return obj.kind === "scmHistoryItemChange";
}
function isSCMHistoryItemChangeRangeVariableEntry(obj) {
  return obj.kind === "scmHistoryItemChangeRange";
}
function isStringImplicitContextValue(value) {
  const asStringImplicitContextValue = value;
  return typeof asStringImplicitContextValue === "object" && asStringImplicitContextValue !== null && (typeof asStringImplicitContextValue.value === "string" || typeof asStringImplicitContextValue.value === "undefined") && (typeof asStringImplicitContextValue.name === "string" || typeof asStringImplicitContextValue.name === "undefined") && (asStringImplicitContextValue.resourceUri === void 0 || URI.isUri(asStringImplicitContextValue.resourceUri)) && (typeof asStringImplicitContextValue.name === "string" || URI.isUri(asStringImplicitContextValue.resourceUri)) && (asStringImplicitContextValue.iconPath === void 0 || isChatContextIconPath(asStringImplicitContextValue.iconPath)) && URI.isUri(asStringImplicitContextValue.uri) && typeof asStringImplicitContextValue.handle === "number";
}
var PromptFileVariableKind = /* @__PURE__ */ ((PromptFileVariableKind2) => {
  PromptFileVariableKind2["Instruction"] = "vscode.instructions.file.root";
  PromptFileVariableKind2["InstructionReference"] = `vscode.instructions.file.reference`;
  PromptFileVariableKind2["PromptFile"] = "vscode.prompt.file";
  return PromptFileVariableKind2;
})(PromptFileVariableKind || {});
function toPromptFileVariableEntry(uri, kind, originLabel, automaticallyAdded = false, toolReferences) {
  return {
    id: `${kind}__${uri.toString()}`,
    name: `prompt:${basename(uri)}`,
    value: uri,
    kind: "promptFile",
    modelDescription: "Prompt instructions file",
    isRoot: kind !== "vscode.instructions.file.reference" /* InstructionReference */,
    originLabel,
    toolReferences,
    automaticallyAdded
  };
}
var PromptTextVariableKind = /* @__PURE__ */ ((PromptTextVariableKind2) => {
  PromptTextVariableKind2["CustomizationsIndex"] = "vscode.customizations.index";
  return PromptTextVariableKind2;
})(PromptTextVariableKind || {});
function toPromptTextVariableEntry(content, automaticallyAdded = false, toolReferences) {
  return {
    id: "vscode.customizations.index" /* CustomizationsIndex */,
    name: `prompt:customizationsIndex`,
    value: content,
    kind: "promptText",
    modelDescription: "Chat customizations index",
    automaticallyAdded,
    toolReferences
  };
}
function toFileVariableEntry(uri, range) {
  return {
    kind: "file",
    value: range ? { uri, range } : uri,
    id: uri.toString() + (range?.toString() ?? ""),
    name: basename(uri)
  };
}
function toToolVariableEntry(entry, range) {
  return {
    kind: "tool",
    id: entry.id,
    icon: ThemeIcon.isThemeIcon(entry.icon) ? entry.icon : void 0,
    name: entry.displayName,
    value: void 0,
    range
  };
}
function toToolSetVariableEntry(entry, range) {
  return {
    kind: "toolset",
    id: entry.id,
    icon: entry.icon,
    name: entry.referenceName,
    value: Array.from(entry.getTools()).map((t) => toToolVariableEntry(t)),
    range
  };
}
class ChatRequestVariableSet {
  constructor(entries) {
    this._ids = /* @__PURE__ */ new Set();
    this._entries = [];
    if (entries) {
      this.add(...entries);
    }
  }
  add(...entry) {
    for (const e of entry) {
      if (!this._ids.has(e.id)) {
        this._ids.add(e.id);
        this._entries.push(e);
      }
    }
  }
  insertFirst(entry) {
    if (!this._ids.has(entry.id)) {
      this._ids.add(entry.id);
      this._entries.unshift(entry);
    }
  }
  remove(entry) {
    this._ids.delete(entry.id);
    this._entries = this._entries.filter((e) => e.id !== entry.id);
  }
  has(entry) {
    return this._ids.has(entry.id);
  }
  asArray() {
    return this._entries.slice(0);
  }
  get length() {
    return this._entries.length;
  }
}
export {
  AgentHostCompletionReferenceKind,
  ChatPasteAttachmentMetadata,
  ChatRequestVariableSet,
  IChatRequestVariableEntry,
  IDiagnosticVariableEntryFilterData,
  OmittedState,
  PromptFileVariableKind,
  chatReferenceVariableEntryFromDynamicValue,
  chatReferenceVariableEntryId,
  createChatReferenceVariableEntry,
  getAgentHostCompletionReferenceKind,
  getAgentHostCompletionReferenceKindFromValue,
  getExplicitFileOrImageAttachmentSummary,
  getImageAttachmentLimit,
  isAgentFeedbackVariableEntry,
  isAgentHostCompletionVariableEntry,
  isBrowserViewVariableEntry,
  isChatContextIconPath,
  isChatReferenceDynamicVariableValue,
  isChatReferenceVariableEntry,
  isChatRequestFileEntry,
  isChatRequestVariableEntry,
  isDebugVariableEntry,
  isDiagnosticsVariableEntry,
  isElementVariableEntry,
  isExplicitFileOrImageVariableEntry,
  isImageVariableEntry,
  isImplicitVariableEntry,
  isNotebookOutputVariableEntry,
  isPasteVariableEntry,
  isPromptFileVariableEntry,
  isPromptTextVariableEntry,
  isSCMHistoryItemChangeRangeVariableEntry,
  isSCMHistoryItemChangeVariableEntry,
  isSCMHistoryItemVariableEntry,
  isStringImplicitContextValue,
  isStringVariableEntry,
  isTerminalVariableEntry,
  isWorkspaceVariableEntry,
  resolveChatContextIcon,
  restorePasteVariableEntryFromAttachment,
  toAgentHostCompletionVariableEntry,
  toAgentHostCompletionVariableEntryFromMetadata,
  toChatReferenceDynamicVariableValue,
  toFileVariableEntry,
  toPasteVariableEntry,
  toPromptFileVariableEntry,
  toPromptTextVariableEntry,
  toToolSetVariableEntry,
  toToolVariableEntry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24sIExvY2F0aW9uLCBTeW1ib2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWFya2VyU2V2ZXJpdHksIElNYXJrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElTQ01IaXN0b3J5SXRlbSB9IGZyb20gJy4uLy4uLy4uL3NjbS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRSZWZlcmVuY2UgfSBmcm9tICcuLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlIH0gZnJvbSAnLi9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IElUb29sRGF0YSwgSVRvb2xTZXQgfSBmcm9tICcuLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuXG4vKipcbiAqIEFuIGljb24gZm9yIGEgY2hhdCBjb250ZXh0IGl0ZW0uIE1pcnJvcnMgdGhlIGBJY29uUGF0aGAgdHlwZSBmcm9tIHRoZSBleHRlbnNpb24gQVBJOlxuICogZWl0aGVyIGEge0BsaW5rIFRoZW1lSWNvbiB0aGVtZSBpY29ufSwgYSBzaW5nbGUge0BsaW5rIFVSSX0gb3Igc2VwYXJhdGUgbGlnaHQvZGFyayB7QGxpbmsgVVJJIHVyaXN9LlxuICovXG5leHBvcnQgdHlwZSBDaGF0Q29udGV4dEljb25QYXRoID0gVGhlbWVJY29uIHwgVVJJIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTtcblxuLyoqXG4gKiBUeXBlIGd1YXJkIGZvciB7QGxpbmsgQ2hhdENvbnRleHRJY29uUGF0aH0uIEFjY2VwdHMgYSB7QGxpbmsgVGhlbWVJY29uIHRoZW1lIGljb259LCBhIHNpbmdsZVxuICoge0BsaW5rIFVSSX0gb3IgYW4gb2JqZWN0IHdpdGggYm90aCBgbGlnaHRgIGFuZCBgZGFya2Age0BsaW5rIFVSSSB1cmlzfS4gUmVqZWN0cyBgbnVsbGAsIGB1bmRlZmluZWRgXG4gKiBhbmQgcGFydGlhbGx5LXNwZWNpZmllZCBsaWdodC9kYXJrIG9iamVjdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRDb250ZXh0SWNvblBhdGgodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBDaGF0Q29udGV4dEljb25QYXRoIHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24odmFsdWUpIHx8IFVSSS5pc1VyaSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBhc0R1YWxQYXRoID0gdmFsdWUgYXMgeyBsaWdodD86IHVua25vd247IGRhcms/OiB1bmtub3duIH07XG5cdHJldHVybiBVUkkuaXNVcmkoYXNEdWFsUGF0aC5saWdodCkgJiYgVVJJLmlzVXJpKGFzRHVhbFBhdGguZGFyayk7XG59XG5cbi8qKlxuICogUmVzb2x2ZSBhIHtAbGluayBDaGF0Q29udGV4dEljb25QYXRofSBpbnRvIGEgdmFsdWUgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBgaWNvblBhdGhgXG4gKiBvcHRpb24gb2YgYW4gaWNvbiBsYWJlbCwgcGlja2luZyB0aGUgbGlnaHQgb3IgZGFyayB1cmkgYmFzZWQgb24gdGhlIGN1cnJlbnQgdGhlbWUuXG4gKlxuICogQHBhcmFtIGljb25QYXRoIFRoZSBpY29uIHBhdGggdG8gcmVzb2x2ZS5cbiAqIEBwYXJhbSB1c2VEYXJrIFdoZXRoZXIgdGhlIGN1cnJlbnQgdGhlbWUgaXMgYSBkYXJrIHRoZW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoYXRDb250ZXh0SWNvbihpY29uUGF0aDogQ2hhdENvbnRleHRJY29uUGF0aCwgdXNlRGFyazogYm9vbGVhbik6IFRoZW1lSWNvbiB8IFVSSSB7XG5cdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpIHx8IFVSSS5pc1VyaShpY29uUGF0aCkpIHtcblx0XHRyZXR1cm4gaWNvblBhdGg7XG5cdH1cblx0cmV0dXJuIHVzZURhcmsgPyBpY29uUGF0aC5kYXJrIDogaWNvblBhdGgubGlnaHQ7XG59XG5cbmludGVyZmFjZSBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZ1bGxOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBvZmZzZXQtcmFuZ2UgaW4gdGhlIHByb21wdC4gVGhpcyBtZWFucyB0aGlzIGVudHJ5IGhhcyBiZWVuIGV4cGxpY2l0bHkgdHlwZWQgb3V0XG5cdCAqIGJ5IHRoZSB1c2VyLlxuXHQgKi9cblx0cmVhZG9ubHkgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2U7XG5cdHJlYWRvbmx5IHZhbHVlOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlO1xuXHRyZWFkb25seSByZWZlcmVuY2VzPzogSUNoYXRDb250ZW50UmVmZXJlbmNlW107XG5cblx0LyoqXG5cdCAqIEltcGxlbWVudGF0aW9uLWRlZmluZWQgbWV0YWRhdGEgdGhhdCBwcm92aWRlcnMgYXR0YWNoIHRvIGEgdmFyaWFibGVcblx0ICogZW50cnkuIFVzZWQgdG8gcm91bmQtdHJpcCBwcm92aWRlci1zcGVjaWZpYyBkYXRhIChlLmcuIGFnZW50LWhvc3Rcblx0ICogYF9tZXRhYCkgd2hlbiBhbiBlbnRyeSBpcyBzZW50IGJhY2sgdG8gdGhlIHByb3ZpZGVyIGFzIHBhcnQgb2YgYVxuXHQgKiByZXF1ZXN0IGF0dGFjaG1lbnQuXG5cdCAqL1xuXHRyZWFkb25seSBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdG9taXR0ZWRTdGF0ZT86IE9taXR0ZWRTdGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2VuZXJpY0NoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0a2luZDogJ2dlbmVyaWMnO1xuXHR0b29sdGlwPzogSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogQSBwcm92aWRlci1zdXBwbGllZCBpY29uIHRoYXQgbWF5IGJlIGEge0BsaW5rIFRoZW1lSWNvbiB0aGVtZSBpY29ufSwgYSBzaW5nbGUgdXJpIG9yIGxpZ2h0L2RhcmsgdXJpcy5cblx0ICogVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSB7QGxpbmsgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkuaWNvbiBiYXNlIHRoZW1lIGljb259IHdoZW4gcmVuZGVyaW5nLlxuXHQgKi9cblx0aWNvblBhdGg/OiBDaGF0Q29udGV4dEljb25QYXRoO1xufVxuXG5leHBvcnQgY29uc3QgQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhID0ge1xuXHRLaW5kOiAndnNjb2RlLmNoYXQuYXR0YWNobWVudC5raW5kJyxcblx0TGFuZ3VhZ2U6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50Lmxhbmd1YWdlJyxcblx0RmlsZU5hbWU6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50LmZpbGVOYW1lJyxcblx0UGFzdGVkTGluZXM6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50LnBhc3RlZExpbmVzJyxcbn0gYXMgY29uc3Q7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc3RvcmFibGVQYXN0ZUF0dGFjaG1lbnQge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5S2luZD86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZWxSZXByZXNlbnRhdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQge1xuXHRTa2lsbCA9ICdza2lsbCcsXG5cdENvbW1hbmQgPSAnY29tbWFuZCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIHtcblx0cmVhZG9ubHkgJG1pZDogJ2FnZW50SG9zdENvbXBsZXRpb24nO1xuXHRyZWFkb25seSBraW5kOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZDtcbn1cblxuZnVuY3Rpb24gYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQpOiBJQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUge1xuXHRyZXR1cm4geyAkbWlkOiAnYWdlbnRIb3N0Q29tcGxldGlvbicsIGtpbmQgfTtcbn1cblxuZnVuY3Rpb24gYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlSWQoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIHJlZmVyZW5jZTogVVJJIHwgc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Ta2lsbDpcblx0XHRcdHJldHVybiByZWZlcmVuY2UudG9TdHJpbmcoKTtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQ6XG5cdFx0XHRyZXR1cm4gJ2FnZW50LWhvc3QtY29tbWFuZDonICsgcmVmZXJlbmNlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIG5hbWU6IHN0cmluZywgcmVmZXJlbmNlOiBVUkkgfCBzdHJpbmcgfCB1bmRlZmluZWQsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRpZDogcmVmZXJlbmNlICE9PSB1bmRlZmluZWQgPyBhZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVJZChraW5kLCByZWZlcmVuY2UpIDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0bmFtZSxcblx0XHR2YWx1ZTogYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUoa2luZCksXG5cdFx0X21ldGEsXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5RnJvbU1ldGFkYXRhKGtpbmQ6IEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLCBuYW1lOiBzdHJpbmcsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsOlxuXHRcdFx0cmV0dXJuIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZCwgbmFtZSwgdHlwZW9mIF9tZXRhPy51cmkgPT09ICdzdHJpbmcnID8gX21ldGEudXJpIDogdW5kZWZpbmVkLCBfbWV0YSk7XG5cdFx0Y2FzZSBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Db21tYW5kOlxuXHRcdFx0cmV0dXJuIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZCwgbmFtZSwgdHlwZW9mIF9tZXRhPy5jb21tYW5kID09PSAnc3RyaW5nJyA/IF9tZXRhLmNvbW1hbmQgOiB1bmRlZmluZWQsIF9tZXRhKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQoZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCB8IHVuZGVmaW5lZCB7XG5cdGlmIChlbnRyeS5raW5kICE9PSAnZ2VuZXJpYycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBnZXRBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZEZyb21WYWx1ZShlbnRyeS52YWx1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZEZyb21WYWx1ZSh2YWx1ZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVWYWx1ZSk6IEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVjb3JkID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmIChyZWNvcmQuJG1pZCAhPT0gJ2FnZW50SG9zdENvbXBsZXRpb24nKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHN3aXRjaCAocmVjb3JkLmtpbmQpIHtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsOlxuXHRcdGNhc2UgQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZDpcblx0XHRcdHJldHVybiByZWNvcmQua2luZDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IGVudHJ5IGlzIElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRyZXR1cm4gZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQoZW50cnkpICE9PSB1bmRlZmluZWQ7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3REaXJlY3RvcnlFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0a2luZDogJ2RpcmVjdG9yeSc7XG5cdGltYWdlQ291bnQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRraW5kOiAnZmlsZSc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIE9taXR0ZWRTdGF0ZSB7XG5cdE5vdE9taXR0ZWQsXG5cdFBhcnRpYWwsXG5cdEZ1bGwsXG5cdEltYWdlTGltaXRFeGNlZWRlZCxcbn1cblxuY29uc3QgQ0xBVURFX01FU1NBR0VTX01BWF9JTUFHRVNfUEVSX1JFUVVFU1QgPSAyMDtcbmNvbnN0IEdFTUlOSV9NQVhfSU1BR0VTX1BFUl9SRVFVRVNUID0gMTA7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW1hZ2UtYXR0YWNobWVudCBsaW1pdCBmb3IgdGhlIHNlbGVjdGVkIG1vZGVsLlxuICpcbiAqIENsYXVkZS1mYW1pbHkgbW9kZWxzIHVzZSBhIG1heCBvZiAyMCAoTWVzc2FnZXMgQVBJKSwgR2VtaW5pLWZhbWlseSBtb2RlbHMgdXNlXG4gKiBhIG1heCBvZiAxMC4gT3RoZXIgbW9kZWxzIGRvIG5vdCBoYXZlIGEgVUktZW5mb3JjZWQgaW1hZ2UgY291bnQgbGltaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbWFnZUF0dGFjaG1lbnRMaW1pdChtb2RlbDogUGljazxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgJ2ZhbWlseSc+IHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBmYW1pbHkgPSBtb2RlbC5mYW1pbHkudG9Mb3dlckNhc2UoKTtcblx0aWYgKGZhbWlseS5zdGFydHNXaXRoKCdnZW1pbmknKSkge1xuXHRcdHJldHVybiBHRU1JTklfTUFYX0lNQUdFU19QRVJfUkVRVUVTVDtcblx0fVxuXG5cdGlmIChmYW1pbHkuc3RhcnRzV2l0aCgnY2xhdWRlJykgfHwgZmFtaWx5LnN0YXJ0c1dpdGgoJ2FudGhyb3BpYycpKSB7XG5cdFx0cmV0dXJuIENMQVVERV9NRVNTQUdFU19NQVhfSU1BR0VTX1BFUl9SRVFVRVNUO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RUb29sRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0b29sJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0b29sc2V0Jztcblx0cmVhZG9ubHkgdmFsdWU6IElDaGF0UmVxdWVzdFRvb2xFbnRyeVtdO1xufVxuXG5leHBvcnQgdHlwZSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeSA9IElDaGF0UmVxdWVzdFRvb2xFbnRyeSB8IElDaGF0UmVxdWVzdFRvb2xTZXRFbnRyeTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHtcblx0dmFsdWU/OiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdG1vZGVsRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGljb25QYXRoPzogQ2hhdENvbnRleHRJY29uUGF0aDtcblx0dXJpOiBVUkk7XG5cdHJlc291cmNlVXJpPzogVVJJO1xuXHR0b29sdGlwPzogSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogQ29tbWFuZCBJRCB0byBleGVjdXRlIHdoZW4gdGhpcyBjb250ZXh0IGl0ZW0gaXMgY2xpY2tlZC5cblx0ICovXG5cdHJlYWRvbmx5IGNvbW1hbmRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgaGFuZGxlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnaW1wbGljaXQnO1xuXHRyZWFkb25seSBpc0ZpbGU6IHRydWU7XG5cdHJlYWRvbmx5IHZhbHVlOiBVUkkgfCBMb2NhdGlvbiB8IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc1NlbGVjdGlvbjogYm9vbGVhbjtcblx0ZW5hYmxlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnc3RyaW5nJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbW9kZWxEZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvblBhdGg/OiBDaGF0Q29udGV4dEljb25QYXRoO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBJTWFya2Rvd25TdHJpbmc7XG5cdC8qKlxuXHQgKiBDb21tYW5kIElEIHRvIGV4ZWN1dGUgd2hlbiB0aGlzIGNvbnRleHQgaXRlbSBpcyBjbGlja2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29tbWFuZElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBoYW5kbGU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnd29ya3NwYWNlJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZWxEZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3Bhc3RlJztcblx0cmVhZG9ubHkgY29kZTogc3RyaW5nO1xuXHRyZWFkb25seSBsYW5ndWFnZTogc3RyaW5nO1xuXHRyZWFkb25seSBwYXN0ZWRMaW5lczogc3RyaW5nO1xuXG5cdC8vIFRoaXMgaXMgb25seSB1c2VkIGZvciBvbGQgc2VyaWFsaXplZCBkYXRhIGFuZCBzaG91bGQgYmUgcmVtb3ZlZCBvbmNlIHdlIG5vIGxvbmdlciBzdXBwb3J0IGl0XG5cdHJlYWRvbmx5IGZpbGVOYW1lOiBzdHJpbmc7XG5cblx0Ly8gVGhpcyBpcyBvbmx5IHVuZGVmaW5lZCBvbiBvbGQgc2VyaWFsaXplZCBkYXRhXG5cdHJlYWRvbmx5IGNvcGllZEZyb206IHtcblx0XHRyZWFkb25seSB1cmk6IFVSSTtcblx0XHRyZWFkb25seSByYW5nZTogSVJhbmdlO1xuXHR9IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9QYXN0ZVZhcmlhYmxlRW50cnkoXG5cdG5hbWU6IHN0cmluZyxcblx0Y29kZTogc3RyaW5nLFxuXHRvcHRpb25zPzoge1xuXHRcdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG5cdFx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZmlsZU5hbWU/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcGFzdGVkTGluZXM/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0fVxuKTogSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5IHtcblx0Y29uc3QgbGFuZ3VhZ2UgPSBvcHRpb25zPy5sYW5ndWFnZSA/PyAnbWFya2Rvd24nO1xuXHRjb25zdCBmaWxlTmFtZSA9IG9wdGlvbnM/LmZpbGVOYW1lID8/IG5hbWU7XG5cdGNvbnN0IHBhc3RlZExpbmVzID0gb3B0aW9ucz8ucGFzdGVkTGluZXMgPz8gbmFtZTtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAncGFzdGUnLFxuXHRcdGlkOiBvcHRpb25zPy5pZCA/PyBgY2hhdC1wYXN0ZS0ke2dlbmVyYXRlVXVpZCgpfWAsXG5cdFx0bmFtZSxcblx0XHRpY29uOiBvcHRpb25zPy5pY29uLFxuXHRcdHZhbHVlOiBjb2RlLFxuXHRcdGNvZGUsXG5cdFx0bGFuZ3VhZ2UsXG5cdFx0cGFzdGVkTGluZXMsXG5cdFx0ZmlsZU5hbWUsXG5cdFx0Y29waWVkRnJvbTogdW5kZWZpbmVkLFxuXHRcdF9tZXRhOiB7XG5cdFx0XHQuLi5vcHRpb25zPy5fbWV0YSxcblx0XHRcdFtDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuS2luZF06ICdwYXN0ZScsXG5cdFx0XHRbQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLkxhbmd1YWdlXTogbGFuZ3VhZ2UsXG5cdFx0XHRbQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLkZpbGVOYW1lXTogZmlsZU5hbWUsXG5cdFx0XHRbQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLlBhc3RlZExpbmVzXTogcGFzdGVkTGluZXMsXG5cdFx0fSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVQYXN0ZVZhcmlhYmxlRW50cnlGcm9tQXR0YWNobWVudChhdHRhY2htZW50OiBJUmVzdG9yYWJsZVBhc3RlQXR0YWNobWVudCk6IElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1vZGVsUmVwcmVzZW50YXRpb24gPSBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb247XG5cdGlmICh0eXBlb2YgbW9kZWxSZXByZXNlbnRhdGlvbiAhPT0gJ3N0cmluZycgfHwgYXR0YWNobWVudC5fbWV0YT8uW0NoYXRQYXN0ZUF0dGFjaG1lbnRNZXRhZGF0YS5LaW5kXSAhPT0gJ3Bhc3RlJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBzdHJpbmdNZXRhZGF0YSA9IChrZXk6IHN0cmluZywgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBhdHRhY2htZW50Ll9tZXRhPy5ba2V5XTtcblx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogZmFsbGJhY2s7XG5cdH07XG5cdHJldHVybiB0b1Bhc3RlVmFyaWFibGVFbnRyeShhdHRhY2htZW50LmxhYmVsLCBtb2RlbFJlcHJlc2VudGF0aW9uLCB7XG5cdFx0bGFuZ3VhZ2U6IHN0cmluZ01ldGFkYXRhKENoYXRQYXN0ZUF0dGFjaG1lbnRNZXRhZGF0YS5MYW5ndWFnZSwgJ21hcmtkb3duJyksXG5cdFx0ZmlsZU5hbWU6IHN0cmluZ01ldGFkYXRhKENoYXRQYXN0ZUF0dGFjaG1lbnRNZXRhZGF0YS5GaWxlTmFtZSwgYXR0YWNobWVudC5sYWJlbCksXG5cdFx0cGFzdGVkTGluZXM6IHN0cmluZ01ldGFkYXRhKENoYXRQYXN0ZUF0dGFjaG1lbnRNZXRhZGF0YS5QYXN0ZWRMaW5lcywgYXR0YWNobWVudC5sYWJlbCksXG5cdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTeW1ib2xWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnc3ltYm9sJztcblx0cmVhZG9ubHkgdmFsdWU6IExvY2F0aW9uO1xuXHRyZWFkb25seSBzeW1ib2xLaW5kOiBTeW1ib2xLaW5kO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kUmVzdWx0VmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ2NvbW1hbmQnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbWFnZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdpbWFnZSc7XG5cdHJlYWRvbmx5IGlzUGFzdGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNVUkw/OiBib29sZWFuO1xuXHRyZWFkb25seSBtaW1lVHlwZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnbm90ZWJvb2tPdXRwdXQnO1xuXHRyZWFkb25seSBvdXRwdXRJbmRleD86IG51bWJlcjtcblx0cmVhZG9ubHkgbWltZVR5cGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSB7XG5cdHJlYWRvbmx5IG93bmVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9ibGVtTWVzc2FnZT86IHN0cmluZztcblx0cmVhZG9ubHkgZmlsdGVyVXJpPzogVVJJO1xuXHRyZWFkb25seSBmaWx0ZXJTZXZlcml0eT86IE1hcmtlclNldmVyaXR5O1xuXHRyZWFkb25seSBmaWx0ZXJSYW5nZT86IElSYW5nZTtcbn1cblxuXG5cbmV4cG9ydCBuYW1lc3BhY2UgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSB7XG5cdGV4cG9ydCBjb25zdCBpY29uID0gQ29kaWNvbi5lcnJvcjtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbU1hcmtlcihtYXJrZXI6IElNYXJrZXIpOiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmlsdGVyVXJpOiBtYXJrZXIucmVzb3VyY2UsXG5cdFx0XHRvd25lcjogbWFya2VyLm93bmVyLFxuXHRcdFx0cHJvYmxlbU1lc3NhZ2U6IG1hcmtlci5tZXNzYWdlLFxuXHRcdFx0ZmlsdGVyUmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBtYXJrZXIuZW5kTGluZU51bWJlciwgc3RhcnRDb2x1bW46IG1hcmtlci5zdGFydENvbHVtbiwgZW5kQ29sdW1uOiBtYXJrZXIuZW5kQ29sdW1uIH1cblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvRW50cnkoZGF0YTogSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSk6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBpZChkYXRhKSxcblx0XHRcdG5hbWU6IGxhYmVsKGRhdGEpLFxuXHRcdFx0aWNvbixcblx0XHRcdHZhbHVlOiBkYXRhLFxuXHRcdFx0a2luZDogJ2RpYWdub3N0aWMnLFxuXHRcdFx0Li4uZGF0YSxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlkKGRhdGE6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEpIHtcblx0XHRyZXR1cm4gW2RhdGEuZmlsdGVyVXJpLCBkYXRhLm93bmVyLCBkYXRhLmZpbHRlclNldmVyaXR5LCBkYXRhLmZpbHRlclJhbmdlPy5zdGFydExpbmVOdW1iZXIsIGRhdGEuZmlsdGVyUmFuZ2U/LnN0YXJ0Q29sdW1uXS5qb2luKCc6Jyk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gbGFiZWwoZGF0YTogSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSkge1xuXHRcdGNvbnN0IGVudW0gVHJpbVRocmVzaG9sZCB7XG5cdFx0XHRNYXhDaGFycyA9IDMwLFxuXHRcdFx0TWF4U3BhY2VMb29rYmFjayA9IDEwLFxuXHRcdH1cblx0XHRpZiAoZGF0YS5wcm9ibGVtTWVzc2FnZSkge1xuXHRcdFx0aWYgKGRhdGEucHJvYmxlbU1lc3NhZ2UubGVuZ3RoIDwgVHJpbVRocmVzaG9sZC5NYXhDaGFycykge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5wcm9ibGVtTWVzc2FnZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJpbSB0aGUgbWVzc2FnZSwgb24gYSBzcGFjZSBpZiBpdCB3b3VsZCBub3QgbG9zZSB0b28gbXVjaFxuXHRcdFx0Ly8gZGF0YSAoTWF4U3BhY2VMb29rYmFjaykgb3IganVzdCBibGluZGx5IG90aGVyd2lzZS5cblx0XHRcdGNvbnN0IGxhc3RTcGFjZSA9IGRhdGEucHJvYmxlbU1lc3NhZ2UubGFzdEluZGV4T2YoJyAnLCBUcmltVGhyZXNob2xkLk1heENoYXJzKTtcblx0XHRcdGlmIChsYXN0U3BhY2UgPT09IC0xIHx8IGxhc3RTcGFjZSArIFRyaW1UaHJlc2hvbGQuTWF4U3BhY2VMb29rYmFjayA8IFRyaW1UaHJlc2hvbGQuTWF4Q2hhcnMpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEucHJvYmxlbU1lc3NhZ2Uuc3Vic3RyaW5nKDAsIFRyaW1UaHJlc2hvbGQuTWF4Q2hhcnMpICsgJ1x1MjAyNic7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGF0YS5wcm9ibGVtTWVzc2FnZS5zdWJzdHJpbmcoMCwgbGFzdFNwYWNlKSArICdcdTIwMjYnO1xuXHRcdH1cblx0XHRsZXQgbGFiZWxTdHIgPSBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LnByb2JsZW1zLmFsbCcsIFwiQWxsIFByb2JsZW1zXCIpO1xuXHRcdGlmIChkYXRhLmZpbHRlclVyaSkge1xuXHRcdFx0bGFiZWxTdHIgPSBsb2NhbGl6ZSgnY2hhdC5hdHRhY2htZW50LnByb2JsZW1zLmluRmlsZScsIFwiUHJvYmxlbXMgaW4gezB9XCIsIGJhc2VuYW1lKGRhdGEuZmlsdGVyVXJpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxhYmVsU3RyO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEge1xuXHRyZWFkb25seSBraW5kOiAnZGlhZ25vc3RpYyc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVsZW1lbnRBbmNlc3RvckRhdGEge1xuXHRyZWFkb25seSB0YWdOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRyZWFkb25seSBjbGFzc05hbWVzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVsZW1lbnRWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnZWxlbWVudCc7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGltYWdlRGF0YT86IElDaGF0UmVxdWVzdFZhcmlhYmxlVmFsdWU7XG5cdHJlYWRvbmx5IGltYWdlTWltZVR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFuY2VzdG9ycz86IElFbGVtZW50QW5jZXN0b3JEYXRhW107XG5cdHJlYWRvbmx5IGF0dHJpYnV0ZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRyZWFkb25seSBjb21wdXRlZFN0eWxlcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdHJlYWRvbmx5IGRpbWVuc2lvbnM/OiB7IHJlYWRvbmx5IHRvcDogbnVtYmVyOyByZWFkb25seSBsZWZ0OiBudW1iZXI7IHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7IHJlYWRvbmx5IGhlaWdodDogbnVtYmVyIH07XG5cdHJlYWRvbmx5IGlubmVyVGV4dD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdwcm9tcHRGaWxlJztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0cmVhZG9ubHkgaXNSb290OiBib29sZWFuO1xuXHRyZWFkb25seSBvcmlnaW5MYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZWxEZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBhdXRvbWF0aWNhbGx5QWRkZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRvb2xSZWZlcmVuY2VzPzogcmVhZG9ubHkgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdwcm9tcHRUZXh0Jztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgc2V0dGluZ0lkPzogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbERlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF1dG9tYXRpY2FsbHlBZGRlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbFJlZmVyZW5jZXM/OiByZWFkb25seSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdzY21IaXN0b3J5SXRlbSc7XG5cdHJlYWRvbmx5IHZhbHVlOiBVUkk7XG5cdHJlYWRvbmx5IGhpc3RvcnlJdGVtOiBJU0NNSGlzdG9yeUl0ZW07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3NjbUhpc3RvcnlJdGVtQ2hhbmdlJztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0cmVhZG9ubHkgaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdzY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlJztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0cmVhZG9ubHkgaGlzdG9yeUl0ZW1DaGFuZ2VTdGFydDoge1xuXHRcdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRcdHJlYWRvbmx5IGhpc3RvcnlJdGVtOiBJU0NNSGlzdG9yeUl0ZW07XG5cdH07XG5cdHJlYWRvbmx5IGhpc3RvcnlJdGVtQ2hhbmdlRW5kOiB7XG5cdFx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdFx0cmVhZG9ubHkgaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbTtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAndGVybWluYWxDb21tYW5kJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgY29tbWFuZDogc3RyaW5nO1xuXHRyZWFkb25seSBvdXRwdXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4aXRDb2RlPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWJ1Z1ZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdkZWJ1Z1ZhcmlhYmxlJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgZXhwcmVzc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSB0eXBlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ2FnZW50RmVlZGJhY2snO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0LyoqXG5cdCAqIFRoZSBhZ2VudC1ob3N0IGFubm90YXRpb25zIGNoYW5uZWwgVVJJIHRoYXQgYmFja3MgdGhlc2UgZmVlZGJhY2sgaXRlbXNcblx0ICogKGVhY2ggaXRlbSBpZCBpcyBhbiBhbm5vdGF0aW9uIGlkIG9uIHRoaXMgY2hhbm5lbCkuIFNldCBvbmx5IGZvclxuXHQgKiBhZ2VudC1ob3N0IHNlc3Npb25zOyB1c2VkIHRvIGVtaXQge0BsaW5rIE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnR9c1xuXHQgKiByZWZlcmVuY2luZyB0aGUgc3BlY2lmaWMgY29tbWVudHMgb24gdGhlIHdpcmUuXG5cdCAqL1xuXHRyZWFkb25seSBhbm5vdGF0aW9uc1Jlc291cmNlPzogVVJJO1xuXHRyZWFkb25seSBmZWVkYmFja0l0ZW1zOiBSZWFkb25seUFycmF5PHtcblx0XHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0XHRyZWFkb25seSByZXNvdXJjZVVyaTogVVJJO1xuXHRcdHJlYWRvbmx5IHJhbmdlOiBJUmFuZ2U7XG5cdFx0cmVhZG9ubHkgY29kZVNlbGVjdGlvbj86IHN0cmluZztcblx0XHRyZWFkb25seSBkaWZmSHVua3M/OiBzdHJpbmc7XG5cdFx0LyoqIFdoZW4gdGhpcyBpdGVtIHdhcyBjb252ZXJ0ZWQgZnJvbSBhIFBSIHJldmlldyBjb21tZW50LCB0aGUgb3JpZ2luYWwgdGhyZWFkIElELiAqL1xuXHRcdHJlYWRvbmx5IHNvdXJjZVBSUmV2aWV3Q29tbWVudElkPzogc3RyaW5nO1xuXHRcdC8qKiBBZGRpdGlvbmFsIHJlcGxpZXMgdGhhdCBiZWxvbmcgdG8gdGhlIHNhbWUgY29tbWVudCB0aHJlYWQgYXMge0BsaW5rIHRleHR9LiAqL1xuXHRcdHJlYWRvbmx5IHJlcGxpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0fT47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0RGVidWdFdmVudHNWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnZGVidWdFdmVudHMnO1xuXHQvKiogVGltZXN0YW1wIHdoZW4gdGhlIGRlYnVnIGV2ZW50cyB3ZXJlIHNuYXBzaG90dGVkLiAqL1xuXHRyZWFkb25seSBzbmFwc2hvdFRpbWU6IG51bWJlcjtcblx0LyoqIFRoZSBzZXNzaW9uIHJlc291cmNlIHRoZXNlIGRlYnVnIGV2ZW50cyBiZWxvbmcgdG8uICovXG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdFNlc3Npb25SZWZlcmVuY2VWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnc2Vzc2lvblJlZmVyZW5jZSc7XG5cdHJlYWRvbmx5IHZhbHVlOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ2Jyb3dzZXJWaWV3Jztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0cmVhZG9ubHkgYnJvd3NlcklkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0Jyb3dzZXJWaWV3VmFyaWFibGVFbnRyeShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IGVudHJ5IGlzIElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gZW50cnkua2luZCA9PT0gJ2Jyb3dzZXJWaWV3Jztcbn1cblxuLyoqXG4gKiBBIGZpcnN0LWNsYXNzIHJlZmVyZW5jZSB0byBhbm90aGVyIGFnZW50LWhvc3QgY2hhdCwgcHJvZHVjZWQgd2hlbiB0aGUgdXNlclxuICogdHlwZXMgYCNjaGF0Ojx0aXRsZT5gIGluIGFuIGFnZW50LWhvc3QgY2hhdCBpbnB1dCBvciBkcm9wcyBhIGNoYXQgdGFiIG9udG8gdGhlXG4gKiBpbnB1dC4gQ2FycmllcyBldmVyeXRoaW5nIG5lZWRlZCB0byByZW5kZXIgdGhlIHJlZmVyZW5jZSBjaGlwIGFuZCB0byBzZW5kIGFuXG4gKiBhZ2VudC1ob3N0IGNoYXQgYXR0YWNobWVudDogdGhlIHJlZmVyZW5jZWQgY2hhdCdzIG9wYXF1ZSBiYWNrZW5kIGNoYXQgVVJJXG4gKiAoe0BsaW5rIHZhbHVlfSkgYW5kLCB3aGVuIHBpbm5lZCwgdGhlIHtAbGluayBlbmRUdXJuIGxhc3QgY29tcGxldGVkIHR1cm59XG4gKiBpbmNsdWRlZCBpbiB0aGUgdHJhbnNjcmlwdC4gVGhlIGRpc3BsYXkgdGl0bGUgbGl2ZXMgb25cbiAqIHtAbGluayBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS5uYW1lIG5hbWV9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnY2hhdFJlZmVyZW5jZSc7XG5cdC8qKlxuXHQgKiBUaGUgcmVmZXJlbmNlZCBjaGF0J3MgKipvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSoqIFx1MjAxNCB0aGUgZXhhY3QgdmFsdWUgY2FycmllZFxuXHQgKiBvbiBgTWVzc2FnZUNoYXRBdHRhY2htZW50LnJlc291cmNlYCBvbiB0aGUgd2lyZS4gSXQgaXMgcHJvdmlkZXItZGVmaW5lZCBhbmRcblx0ICogb3BhcXVlOiBnZW5lcmljIGNvZGUgTVVTVCBvbmx5IHN0b3JlIGl0LCBjb21wYXJlIGl0IGJ5IGVxdWFsaXR5LCBhbmQgcGFzcyBpdFxuXHQgKiB0byBhZ2VudC1ob3N0LW93bmVkIGhlbHBlcnMgKGUuZy4gdGhlIGNoYXQtcmVmZXJlbmNlIHdpZGdldCdzIGxpbmsgYnVpbGRlcik7XG5cdCAqIGl0IE1VU1QgTk9UIHBhcnNlIG9yIGNvbnN0cnVjdCBpdC4gU2VuZCBhbmQgcmVzdG9yZSBhcmUgdGhlcmVmb3JlIHB1cmVcblx0ICogaWRlbnRpdHksIGFuZCB0aGUgY2xpZW50LXNpZGUgY2hhdCBpcyByZXNvbHZlZCBsYXppbHkgKG9ubHkgd2hlbiB0aGUgdXNlclxuXHQgKiBjbGlja3MgdGhlIHJlZmVyZW5jZSBjaGlwKS4gQmVjYXVzZSBhIHJlZmVyZW5jZSBjYW4gbmV2ZXIgY3Jvc3MgYWdlbnQgaG9zdHMsXG5cdCAqIHRoZSBVUkkgYWx3YXlzIG5hbWVzIGEgY2hhdCBvbiBhIGNvbm5lY3RlZCBob3N0LlxuXHQgKi9cblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0LyoqXG5cdCAqIExhc3QgY29tcGxldGVkIHR1cm4gaW5jbHVkZWQgaW4gdGhlIHJlZmVyZW5jZWQgdHJhbnNjcmlwdC4gT21pdHRlZCBmb3Jcblx0ICogcmVmZXJlbmNlcyB0aGF0IGRvIG5vdCBwaW4gYSB0dXJuIChlLmcuIGEgZHJvcHBlZCBjaGF0L3Nlc3Npb24pLCBpbiB3aGljaFxuXHQgKiBjYXNlIHRoZSBob3N0IHJlc29sdmVzIHRoZSByZWZlcmVuY2VkIGNoYXQncyBsYXRlc3QgY29tcGxldGVkIHR1cm4gd2hlbiBpdFxuXHQgKiBhY2NlcHRzIHRoZSBtZXNzYWdlLlxuXHQgKi9cblx0cmVhZG9ubHkgZW5kVHVybj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBUeXBlIGd1YXJkIGZvciBhIHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSBjaGF0LXJlZmVyZW5jZSBlbnRyeX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5KGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogZW50cnkgaXMgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gZW50cnkua2luZCA9PT0gJ2NoYXRSZWZlcmVuY2UnO1xufVxuXG4vKipcbiAqIFN0YWJsZSwgZGVkdXBlLWZyaWVuZGx5IGlkIGZvciBhIGNoYXQgcmVmZXJlbmNlLCBkZXJpdmVkIGZyb20gdGhlIHJlZmVyZW5jZWRcbiAqIGNoYXQgcmVzb3VyY2UgYW5kIFx1MjAxNCB3aGVuIHRoZSByZWZlcmVuY2UgcGlucyBhIHR1cm4gXHUyMDE0IHRoZSBsYXN0IGNvbXBsZXRlZCB0dXJuLlxuICogUmUtYWNjZXB0aW5nIHRoZSBzYW1lIHJlZmVyZW5jZSB0aGVyZWZvcmUgcHJvZHVjZXMgdGhlIHNhbWUgaWQuIEEgcGlubmVkXG4gKiByZWZlcmVuY2UgKHdpdGgge0BsaW5rIGVuZFR1cm59KSBhbmQgYW4gdW5waW5uZWQgb25lIHRvIHRoZSBzYW1lIGNoYXQgcHJvZHVjZVxuICogZGlzdGluY3QgaWRzIHNvIHRoZXkgbmV2ZXIgY29sbGlkZS5cbiAqXG4gKiBAcGFyYW0gY2hhdFJlc291cmNlIFRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSBvZiB0aGUgcmVmZXJlbmNlZCBjaGF0LiBTdG9yZWRcbiAqIHZlcmJhdGltIGluIHRoZSBpZDsgbmV2ZXIgcGFyc2VkLlxuICogQHBhcmFtIGVuZFR1cm4gVGhlIGxhc3QgY29tcGxldGVkIHR1cm4gaW5jbHVkZWQgaW4gdGhlIHJlZmVyZW5jZWQgdHJhbnNjcmlwdCwgaWYgcGlubmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlJZChjaGF0UmVzb3VyY2U6IFVSSSwgZW5kVHVybj86IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBlbmRUdXJuID09PSB1bmRlZmluZWRcblx0XHQ/IGBhZ2VudC1ob3N0LWNoYXQ6JHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX1gXG5cdFx0OiBgYWdlbnQtaG9zdC1jaGF0OiR7Y2hhdFJlc291cmNlLnRvU3RyaW5nKCl9XFx1MDAwMCR7ZW5kVHVybn1gO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSBmaXJzdC1jbGFzcyB7QGxpbmsgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkgY2hhdC1yZWZlcmVuY2UgZW50cnl9XG4gKiAodGhlIGlucHV0IHBpbGwpIGZvciBhIHJlZmVyZW5jZWQgY2hhdC5cbiAqXG4gKiBAcGFyYW0gY2hhdFJlc291cmNlIFRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSBvZiB0aGUgcmVmZXJlbmNlZCBjaGF0ICh0aGVcbiAqIHZhbHVlIGNhcnJpZWQgb24gYE1lc3NhZ2VDaGF0QXR0YWNobWVudC5yZXNvdXJjZWApLiBTdG9yZWQgdmVyYmF0aW07IG5ldmVyIHBhcnNlZC5cbiAqIEBwYXJhbSBlbmRUdXJuIFRoZSBsYXN0IGNvbXBsZXRlZCB0dXJuIGluY2x1ZGVkIGluIHRoZSByZWZlcmVuY2VkIHRyYW5zY3JpcHQsIGlmIHBpbm5lZC5cbiAqIEBwYXJhbSB0aXRsZSBUaGUgY2hhdCB0aXRsZSB1c2VkIGFzIHRoZSBkaXNwbGF5IGxhYmVsLlxuICogQHBhcmFtIF9tZXRhIFByb3ZpZGVyLXN1cHBsaWVkIGBfbWV0YWAgdG8gcHJlc2VydmUgb24gdGhlIGVudHJ5LlxuICogQHBhcmFtIHJhbmdlIFRoZSBvZmZzZXQtcmFuZ2Ugb2YgdGhlIHJlZmVyZW5jZSBpbiB0aGUgcHJvbXB0LCB3aGVuIHR5cGVkIG91dC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5KGNoYXRSZXNvdXJjZTogVVJJLCBlbmRUdXJuOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRpdGxlOiBzdHJpbmcsIF9tZXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHJhbmdlPzogSU9mZnNldFJhbmdlKTogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdjaGF0UmVmZXJlbmNlJyxcblx0XHRpZDogY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlJZChjaGF0UmVzb3VyY2UsIGVuZFR1cm4pLFxuXHRcdG5hbWU6IHRpdGxlLFxuXHRcdHZhbHVlOiBjaGF0UmVzb3VyY2UsXG5cdFx0ZW5kVHVybixcblx0XHRyYW5nZSxcblx0XHRfbWV0YSxcblx0fTtcbn1cblxuLyoqXG4gKiBUcmFuc2llbnQgdmFsdWUgY2FycmllZCBvbiBhIGNoYXQtcmVmZXJlbmNlIGR5bmFtaWMgdmFyaWFibGUgKHZpYSBpdHMgYGRhdGFgXG4gKiBjaGFubmVsKSBzbyB0aGUgcmVxdWVzdCBwYXJzZXIgY2FuIHJlYnVpbGQgdGhlIGZpcnN0LWNsYXNzXG4gKiB7QGxpbmsgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnl9IHdpdGhvdXQgYW4gb3V0LW9mLWJhbmQgYF9tZXRhYFxuICogYmFnLiBUaGlzIG5ldmVyIGJlY29tZXMgdGhlIGVudHJ5J3MgYHZhbHVlYCBcdTIwMTQgc2VlXG4gKiB7QGxpbmsgY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlGcm9tRHluYW1pY1ZhbHVlfS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlIHtcblx0cmVhZG9ubHkgJG1pZDogJ2FnZW50SG9zdENoYXRSZWZlcmVuY2UnO1xuXHQvKipcblx0ICogVGhlIHJlZmVyZW5jZWQgY2hhdCdzICoqb3BhcXVlIGJhY2tlbmQgY2hhdCBVUkkqKiBhcyBhIHN0cmluZyBcdTIwMTQgdGhlIGV4YWN0XG5cdCAqIHZhbHVlIGNhcnJpZWQgb24gYE1lc3NhZ2VDaGF0QXR0YWNobWVudC5yZXNvdXJjZWAuIEJlY29tZXMgdGhlIHJlYnVpbHRcblx0ICogZW50cnkncyB7QGxpbmsgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkudmFsdWV9LiBOZXZlciBwYXJzZWRcblx0ICogYnkgZ2VuZXJpYyBjb2RlLlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdFJlc291cmNlOiBzdHJpbmc7XG5cdC8qKiBMYXN0IGNvbXBsZXRlZCB0dXJuIGluY2x1ZGVkIGluIHRoZSByZWZlcmVuY2VkIHRyYW5zY3JpcHQsIGlmIHBpbm5lZC4gKi9cblx0cmVhZG9ubHkgZW5kVHVybj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUge0BsaW5rIElDaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUgZHluYW1pYy12YXJpYWJsZSB0cmFuc3BvcnR9XG4gKiBmb3IgYSBjaGF0IHJlZmVyZW5jZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlKGNoYXRSZXNvdXJjZTogVVJJLCBlbmRUdXJuPzogc3RyaW5nKTogSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSB7XG5cdHJldHVybiBlbmRUdXJuID09PSB1bmRlZmluZWRcblx0XHQ/IHsgJG1pZDogJ2FnZW50SG9zdENoYXRSZWZlcmVuY2UnLCBjaGF0UmVzb3VyY2U6IGNoYXRSZXNvdXJjZS50b1N0cmluZygpIH1cblx0XHQ6IHsgJG1pZDogJ2FnZW50SG9zdENoYXRSZWZlcmVuY2UnLCBjaGF0UmVzb3VyY2U6IGNoYXRSZXNvdXJjZS50b1N0cmluZygpLCBlbmRUdXJuIH07XG59XG5cbi8qKlxuICogVHlwZSBndWFyZCBmb3IgYSB7QGxpbmsgSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSh2YWx1ZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVWYWx1ZSk6IHZhbHVlIGlzIElDaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAodmFsdWUgYXMgeyAkbWlkPzogdW5rbm93biB9KS4kbWlkID09PSAnYWdlbnRIb3N0Q2hhdFJlZmVyZW5jZSc7XG59XG5cbi8qKlxuICogUmVidWlsZCBhIGZpcnN0LWNsYXNzIHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeX0gZnJvbSBhXG4gKiBjaGF0LXJlZmVyZW5jZSB7QGxpbmsgSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSBkeW5hbWljLXZhcmlhYmxlIHZhbHVlfVxuICogY2FycmllZCB0aHJvdWdoIHRoZSByZXF1ZXN0IHBhcnNlci4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSByZXNvdXJjZVxuICogY2Fubm90IGJlIHBhcnNlZC5cbiAqXG4gKiBAcGFyYW0gdmFsdWUgVGhlIGR5bmFtaWMtdmFyaWFibGUgdHJhbnNwb3J0IHZhbHVlLlxuICogQHBhcmFtIGlkIFRoZSBzdGFibGUgZHluYW1pYy12YXJpYWJsZSBpZC5cbiAqIEBwYXJhbSBuYW1lIFRoZSBkaXNwbGF5IHRpdGxlIGZvciB0aGUgcmVmZXJlbmNlLlxuICogQHBhcmFtIHJhbmdlIFRoZSBvZmZzZXQtcmFuZ2Ugb2YgdGhlIHJlZmVyZW5jZSBpbiB0aGUgcHJvbXB0LlxuICogQHBhcmFtIF9tZXRhIFByb3ZpZGVyLXN1cHBsaWVkIGBfbWV0YWAgdG8gcHJlc2VydmUgb24gdGhlIGVudHJ5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlGcm9tRHluYW1pY1ZhbHVlKHZhbHVlOiBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlLCBpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHJhbmdlOiBJT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0bGV0IGNoYXRSZXNvdXJjZTogVVJJO1xuXHR0cnkge1xuXHRcdGNoYXRSZXNvdXJjZSA9IFVSSS5wYXJzZSh2YWx1ZS5jaGF0UmVzb3VyY2UpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2NoYXRSZWZlcmVuY2UnLFxuXHRcdGlkLFxuXHRcdG5hbWUsXG5cdFx0dmFsdWU6IGNoYXRSZXNvdXJjZSxcblx0XHRlbmRUdXJuOiB2YWx1ZS5lbmRUdXJuLFxuXHRcdHJhbmdlLFxuXHRcdF9tZXRhLFxuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0gSUdlbmVyaWNDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCBJQ2hhdFJlcXVlc3RJbXBsaWNpdFZhcmlhYmxlRW50cnkgfCBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnlcblx0fCBJU3ltYm9sVmFyaWFibGVFbnRyeSB8IElDb21tYW5kUmVzdWx0VmFyaWFibGVFbnRyeSB8IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeSB8IElJbWFnZVZhcmlhYmxlRW50cnlcblx0fCBJQ2hhdFJlcXVlc3RUb29sRW50cnkgfCBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnlcblx0fCBJQ2hhdFJlcXVlc3REaXJlY3RvcnlFbnRyeSB8IElDaGF0UmVxdWVzdEZpbGVFbnRyeSB8IElOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnkgfCBJRWxlbWVudFZhcmlhYmxlRW50cnlcblx0fCBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkgfCBJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnlcblx0fCBJU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5IHwgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlVmFyaWFibGVFbnRyeSB8IElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSB8IElUZXJtaW5hbFZhcmlhYmxlRW50cnlcblx0fCBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5IHwgSUNoYXRSZXF1ZXN0V29ya3NwYWNlVmFyaWFibGVFbnRyeSB8IElEZWJ1Z1ZhcmlhYmxlRW50cnkgfCBJQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnlcblx0fCBJQ2hhdFJlcXVlc3REZWJ1Z0V2ZW50c1ZhcmlhYmxlRW50cnkgfCBJQ2hhdFJlcXVlc3RTZXNzaW9uUmVmZXJlbmNlVmFyaWFibGVFbnRyeSB8IElCcm93c2VyVmlld1ZhcmlhYmxlRW50cnkgfCBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeTtcblxuZXhwb3J0IG5hbWVzcGFjZSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblxuXHQvKipcblx0ICogUmV0dXJucyBVUkkgb2YgdGhlIHBhc3NlZCB2YXJpYW50IGVudHJ5LiBSZXR1cm4gdW5kZWZpbmVkIGlmIG5vdCBmb3VuZC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB0b1VyaShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIFVSSS5pc1VyaShlbnRyeS52YWx1ZSlcblx0XHRcdD8gZW50cnkudmFsdWVcblx0XHRcdDogaXNMb2NhdGlvbihlbnRyeS52YWx1ZSlcblx0XHRcdFx0PyBlbnRyeS52YWx1ZS51cmlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG9FeHBvcnQodjogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRcdGlmICh2LnZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0Ly8gJ2R1cCcgaGVyZSBpcyBuZWVkZWQgb3RoZXJ3aXNlIFRTIGNvbXBsYWlucyBhYm91dCB0aGUgbmFycm93ZWQgYHZhbHVlYCBpbiBhIHNwcmVhZCBvcGVyYXRpb25cblx0XHRcdGNvbnN0IGR1cDogTXV0YWJsZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5PiA9IHsgLi4udiB9O1xuXHRcdFx0ZHVwLnZhbHVlID0geyAkYmFzZTY0OiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcCh2LnZhbHVlKSkgfTtcblx0XHRcdHJldHVybiBkdXA7XG5cdFx0fVxuXHRcdGlmIChpc0VsZW1lbnRWYXJpYWJsZUVudHJ5KHYpICYmIHYuaW1hZ2VEYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4udixcblx0XHRcdFx0aW1hZ2VEYXRhOiB7ICRiYXNlNjQ6IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKHYuaW1hZ2VEYXRhKSkgfVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tRXhwb3J0KHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0XHQvLyBPbGQgdmFyaWFibGVzIGZvcm1hdFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdFx0aWYgKHYgJiYgJ3ZhbHVlcycgaW4gdiAmJiBBcnJheS5pc0FycmF5KHYudmFsdWVzKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRpZDogdi5pZCA/PyAnJyxcblx0XHRcdFx0bmFtZTogdi5uYW1lLFxuXHRcdFx0XHR2YWx1ZTogdi52YWx1ZXNbMF0/LnZhbHVlLFxuXHRcdFx0XHRyYW5nZTogdi5yYW5nZSxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogdi5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHRyZWZlcmVuY2VzOiB2LnJlZmVyZW5jZXNcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdFx0XHRpZiAodi52YWx1ZSAmJiB0eXBlb2Ygdi52YWx1ZSA9PT0gJ29iamVjdCcgJiYgJyRiYXNlNjQnIGluIHYudmFsdWUgJiYgdHlwZW9mIHYudmFsdWUuJGJhc2U2NCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Ly8gJ2R1cCcgaGVyZSBpcyBuZWVkZWQgb3RoZXJ3aXNlIFRTIGNvbXBsYWlucyBhYm91dCB0aGUgbmFycm93ZWQgYHZhbHVlYCBpbiBhIHNwcmVhZCBvcGVyYXRpb25cblx0XHRcdFx0Y29uc3QgZHVwOiBNdXRhYmxlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+ID0geyAuLi52IH07XG5cdFx0XHRcdGR1cC52YWx1ZSA9IGRlY29kZUJhc2U2NCh2LnZhbHVlLiRiYXNlNjQpLmJ1ZmZlcjtcblx0XHRcdFx0cmV0dXJuIGR1cDtcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWluLW9wZXJhdG9yXG5cdFx0XHRpZiAoaXNFbGVtZW50VmFyaWFibGVFbnRyeSh2KSAmJiB2LmltYWdlRGF0YSAmJiB0eXBlb2Ygdi5pbWFnZURhdGEgPT09ICdvYmplY3QnICYmICckYmFzZTY0JyBpbiB2LmltYWdlRGF0YSAmJiB0eXBlb2Ygdi5pbWFnZURhdGEuJGJhc2U2NCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi52LFxuXHRcdFx0XHRcdGltYWdlRGF0YTogZGVjb2RlQmFzZTY0KHYuaW1hZ2VEYXRhLiRiYXNlNjQpLmJ1ZmZlclxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdjtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSW1wbGljaXRWYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJQ2hhdFJlcXVlc3RJbXBsaWNpdFZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdpbXBsaWNpdCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0cmluZ1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdFN0cmluZ1ZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdzdHJpbmcnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNUZXJtaW5hbFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElUZXJtaW5hbFZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICd0ZXJtaW5hbENvbW1hbmQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEZWJ1Z1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElEZWJ1Z1ZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdkZWJ1Z1ZhcmlhYmxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2FnZW50RmVlZGJhY2snO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQYXN0ZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3Bhc3RlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzV29ya3NwYWNlVmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUNoYXRSZXF1ZXN0V29ya3NwYWNlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3dvcmtzcGFjZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ltYWdlVmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUltYWdlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2ltYWdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdEZpbGVFbnRyeSB8IElDaGF0UmVxdWVzdERpcmVjdG9yeUVudHJ5IHwgSUltYWdlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2ZpbGUnIHx8IG9iai5raW5kID09PSAnZGlyZWN0b3J5JyB8fCBvYmoua2luZCA9PT0gJ2ltYWdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50U3VtbWFyeShlbnRyaWVzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWxlT3JJbWFnZUVudHJpZXMgPSBlbnRyaWVzLmZpbHRlcihpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0aWYgKCFmaWxlT3JJbWFnZUVudHJpZXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChmaWxlT3JJbWFnZUVudHJpZXMuZXZlcnkoaXNJbWFnZVZhcmlhYmxlRW50cnkpKSB7XG5cdFx0cmV0dXJuIGZpbGVPckltYWdlRW50cmllcy5sZW5ndGggPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuaW1hZ2Uub25lJywgXCJBdHRhY2hlZCAxIGltYWdlXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnRTdW1tYXJ5LmltYWdlLm1hbnknLCBcIkF0dGFjaGVkIHswfSBpbWFnZXNcIiwgZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCk7XG5cdH1cblxuXHRyZXR1cm4gZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCA9PT0gMVxuXHRcdD8gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuZmlsZS5vbmUnLCBcIkF0dGFjaGVkIDEgZmlsZVwiKVxuXHRcdDogbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuZmlsZS5tYW55JywgXCJBdHRhY2hlZCB7MH0gZmlsZXNcIiwgZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ25vdGVib29rT3V0cHV0Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElFbGVtZW50VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2VsZW1lbnQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEaWFnbm9zdGljc1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2RpYWdub3N0aWMnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UmVxdWVzdEZpbGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IHtcblx0cmV0dXJuIG9iai5raW5kID09PSAnZmlsZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdwcm9tcHRGaWxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3Byb21wdFRleHQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkob2JqOiB1bmtub3duKTogb2JqIGlzIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRjb25zdCBlbnRyeSA9IG9iaiBhcyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5O1xuXHRyZXR1cm4gdHlwZW9mIGVudHJ5ID09PSAnb2JqZWN0JyAmJlxuXHRcdGVudHJ5ICE9PSBudWxsICYmXG5cdFx0dHlwZW9mIGVudHJ5LmlkID09PSAnc3RyaW5nJyAmJlxuXHRcdHR5cGVvZiBlbnRyeS5uYW1lID09PSAnc3RyaW5nJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5IHtcblx0cmV0dXJuIG9iai5raW5kID09PSAnc2NtSGlzdG9yeUl0ZW0nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdzY21IaXN0b3J5SXRlbUNoYW5nZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdzY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHtcblx0Y29uc3QgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSA9IHZhbHVlIGFzIFBhcnRpYWw8U3RyaW5nQ2hhdENvbnRleHRWYWx1ZT47XG5cdHJldHVybiAoXG5cdFx0dHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUgPT09ICdvYmplY3QnICYmXG5cdFx0YXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSAhPT0gbnVsbCAmJlxuXHRcdCh0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS52YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUudmFsdWUgPT09ICd1bmRlZmluZWQnKSAmJlxuXHRcdCh0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5uYW1lID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5uYW1lID09PSAndW5kZWZpbmVkJykgJiZcblx0XHQoYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5yZXNvdXJjZVVyaSA9PT0gdW5kZWZpbmVkIHx8IFVSSS5pc1VyaShhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLnJlc291cmNlVXJpKSkgJiZcblx0XHQodHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUubmFtZSA9PT0gJ3N0cmluZycgfHwgVVJJLmlzVXJpKGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUucmVzb3VyY2VVcmkpKSAmJlxuXHRcdChhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLmljb25QYXRoID09PSB1bmRlZmluZWQgfHwgaXNDaGF0Q29udGV4dEljb25QYXRoKGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUuaWNvblBhdGgpKSAmJlxuXHRcdFVSSS5pc1VyaShhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLnVyaSkgJiZcblx0XHR0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5oYW5kbGUgPT09ICdudW1iZXInXG5cdCk7XG59XG5cbmV4cG9ydCBlbnVtIFByb21wdEZpbGVWYXJpYWJsZUtpbmQge1xuXHRJbnN0cnVjdGlvbiA9ICd2c2NvZGUuaW5zdHJ1Y3Rpb25zLmZpbGUucm9vdCcsXG5cdEluc3RydWN0aW9uUmVmZXJlbmNlID0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yZWZlcmVuY2VgLFxuXHRQcm9tcHRGaWxlID0gJ3ZzY29kZS5wcm9tcHQuZmlsZScsXG59XG5cbi8qKlxuICogVXRpbGl0eSB0byBjb252ZXJ0IGEge0BsaW5rIHVyaX0gdG8gYSBjaGF0IHZhcmlhYmxlIGVudHJ5LlxuICogVGhlIGBpZGAgb2YgdGhlIGNoYXQgdmFyaWFibGUgY2FuIGJlIG9uZSBvZiB0aGUgZm9sbG93aW5nOlxuICpcbiAqIC0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yZWZlcmVuY2VfXzxVUkk+YDogZm9yIGFsbCBub24tcm9vdCBwcm9tcHQgaW5zdHJ1Y3Rpb25zIHJlZmVyZW5jZXNcbiAqIC0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yb290X188VVJJPmA6IGZvciAqcm9vdCogcHJvbXB0IGluc3RydWN0aW9ucyByZWZlcmVuY2VzXG4gKiAtIGB2c2NvZGUucHJvbXB0LmZpbGVfXzxVUkk+YDogZm9yIHByb21wdCBmaWxlIHJlZmVyZW5jZXNcbiAqXG4gKiBAcGFyYW0gdXJpIEEgcmVzb3VyY2UgVVJJIHRoYXQgcG9pbnRzIHRvIGEgcHJvbXB0IGluc3RydWN0aW9ucyBmaWxlLlxuICogQHBhcmFtIGtpbmQgVGhlIGtpbmQgb2YgdGhlIHByb21wdCBmaWxlIHZhcmlhYmxlIGVudHJ5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh1cmk6IFVSSSwga2luZDogUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgb3JpZ2luTGFiZWw/OiBzdHJpbmcsIGF1dG9tYXRpY2FsbHlBZGRlZCA9IGZhbHNlLCB0b29sUmVmZXJlbmNlcz86IENoYXRSZXF1ZXN0VG9vbFJlZmVyZW5jZUVudHJ5W10pOiBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkge1xuXHQvLyAgYGlkYCBmb3IgYWxsIGBwcm9tcHQgZmlsZXNgIHN0YXJ0cyB3aXRoIHRoZSB3ZWxsLWRlZmluZWQgcGFydCB0aGF0IHRoZSBjb3BpbG90IGV4dGVuc2lvbihvciBvdGhlciBjaGF0Ym90KSBjYW4gcmVseSBvblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBgJHtraW5kfV9fJHt1cmkudG9TdHJpbmcoKX1gLFxuXHRcdG5hbWU6IGBwcm9tcHQ6JHtiYXNlbmFtZSh1cmkpfWAsXG5cdFx0dmFsdWU6IHVyaSxcblx0XHRraW5kOiAncHJvbXB0RmlsZScsXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Byb21wdCBpbnN0cnVjdGlvbnMgZmlsZScsXG5cdFx0aXNSb290OiBraW5kICE9PSBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdG9yaWdpbkxhYmVsLFxuXHRcdHRvb2xSZWZlcmVuY2VzLFxuXHRcdGF1dG9tYXRpY2FsbHlBZGRlZFxuXHR9O1xufVxuXG5lbnVtIFByb21wdFRleHRWYXJpYWJsZUtpbmQge1xuXHRDdXN0b21pemF0aW9uc0luZGV4ID0gJ3ZzY29kZS5jdXN0b21pemF0aW9ucy5pbmRleCcsXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Byb21wdFRleHRWYXJpYWJsZUVudHJ5KGNvbnRlbnQ6IHN0cmluZywgYXV0b21hdGljYWxseUFkZGVkID0gZmFsc2UsIHRvb2xSZWZlcmVuY2VzPzogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXSk6IElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IFByb21wdFRleHRWYXJpYWJsZUtpbmQuQ3VzdG9taXphdGlvbnNJbmRleCxcblx0XHRuYW1lOiBgcHJvbXB0OmN1c3RvbWl6YXRpb25zSW5kZXhgLFxuXHRcdHZhbHVlOiBjb250ZW50LFxuXHRcdGtpbmQ6ICdwcm9tcHRUZXh0Jyxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2hhdCBjdXN0b21pemF0aW9ucyBpbmRleCcsXG5cdFx0YXV0b21hdGljYWxseUFkZGVkLFxuXHRcdHRvb2xSZWZlcmVuY2VzXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0ZpbGVWYXJpYWJsZUVudHJ5KHVyaTogVVJJLCByYW5nZT86IElSYW5nZSk6IElDaGF0UmVxdWVzdEZpbGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2ZpbGUnLFxuXHRcdHZhbHVlOiByYW5nZSA/IHsgdXJpLCByYW5nZSB9IDogdXJpLFxuXHRcdGlkOiB1cmkudG9TdHJpbmcoKSArIChyYW5nZT8udG9TdHJpbmcoKSA/PyAnJyksXG5cdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvVG9vbFZhcmlhYmxlRW50cnkoZW50cnk6IElUb29sRGF0YSwgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2UpOiBJQ2hhdFJlcXVlc3RUb29sRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd0b29sJyxcblx0XHRpZDogZW50cnkuaWQsXG5cdFx0aWNvbjogVGhlbWVJY29uLmlzVGhlbWVJY29uKGVudHJ5Lmljb24pID8gZW50cnkuaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRuYW1lOiBlbnRyeS5kaXNwbGF5TmFtZSxcblx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdHJhbmdlXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Rvb2xTZXRWYXJpYWJsZUVudHJ5KGVudHJ5OiBJVG9vbFNldCwgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2UpOiBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd0b29sc2V0Jyxcblx0XHRpZDogZW50cnkuaWQsXG5cdFx0aWNvbjogZW50cnkuaWNvbixcblx0XHRuYW1lOiBlbnRyeS5yZWZlcmVuY2VOYW1lLFxuXHRcdHZhbHVlOiBBcnJheS5mcm9tKGVudHJ5LmdldFRvb2xzKCkpLm1hcCh0ID0+IHRvVG9vbFZhcmlhYmxlRW50cnkodCkpLFxuXHRcdHJhbmdlXG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0IHtcblx0cHJpdmF0ZSBfaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2VudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGVudHJpZXM/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pIHtcblx0XHRpZiAoZW50cmllcykge1xuXHRcdFx0dGhpcy5hZGQoLi4uZW50cmllcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZCguLi5lbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGVudHJ5KSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lkcy5oYXMoZS5pZCkpIHtcblx0XHRcdFx0dGhpcy5faWRzLmFkZChlLmlkKTtcblx0XHRcdFx0dGhpcy5fZW50cmllcy5wdXNoKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRGaXJzdChlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faWRzLmhhcyhlbnRyeS5pZCkpIHtcblx0XHRcdHRoaXMuX2lkcy5hZGQoZW50cnkuaWQpO1xuXHRcdFx0dGhpcy5fZW50cmllcy51bnNoaWZ0KGVudHJ5KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5faWRzLmRlbGV0ZShlbnRyeS5pZCk7XG5cdFx0dGhpcy5fZW50cmllcyA9IHRoaXMuX2VudHJpZXMuZmlsdGVyKGUgPT4gZS5pZCAhPT0gZW50cnkuaWQpO1xuXHR9XG5cblx0cHVibGljIGhhcyhlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pZHMuaGFzKGVudHJ5LmlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc0FycmF5KCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMuc2xpY2UoMCk7IC8vIHJldHVybiBhIGNvcHlcblx0fVxuXG5cdHB1YmxpYyBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMubGVuZ3RoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMsa0JBQXdDO0FBQ2pELFNBQVMsZ0JBQWdCO0FBT3pCLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQWU5QyxTQUFTLHNCQUFzQixPQUE4QztBQUNuRixNQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksVUFBVSxZQUFZLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ3JELFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxhQUFhO0FBQ25CLFNBQU8sSUFBSSxNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUksTUFBTSxXQUFXLElBQUk7QUFDaEU7QUFTTyxTQUFTLHVCQUF1QixVQUErQixTQUFtQztBQUN4RyxNQUFJLFVBQVUsWUFBWSxRQUFRLEtBQUssSUFBSSxNQUFNLFFBQVEsR0FBRztBQUMzRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sVUFBVSxTQUFTLE9BQU8sU0FBUztBQUMzQztBQXNDTyxNQUFNLDhCQUE4QjtBQUFBLEVBQzFDLE1BQU07QUFBQSxFQUNOLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFBQSxFQUNWLGFBQWE7QUFDZDtBQVNPLElBQVcsbUNBQVgsa0JBQVdBLHNDQUFYO0FBQ04sRUFBQUEsa0NBQUEsV0FBUTtBQUNSLEVBQUFBLGtDQUFBLGFBQVU7QUFGTyxTQUFBQTtBQUFBLEdBQUE7QUFVbEIsU0FBUyxpQ0FBaUMsTUFBMkU7QUFDcEgsU0FBTyxFQUFFLE1BQU0sdUJBQXVCLEtBQUs7QUFDNUM7QUFFQSxTQUFTLDhCQUE4QixNQUF3QyxXQUFpQztBQUMvRyxVQUFRLE1BQU07QUFBQSxJQUNiLEtBQUs7QUFDSixhQUFPLFVBQVUsU0FBUztBQUFBLElBQzNCLEtBQUs7QUFDSixhQUFPLHdCQUF3QixVQUFVLFNBQVM7QUFBQSxFQUNwRDtBQUNEO0FBRU8sU0FBUyxtQ0FBbUMsTUFBd0MsTUFBYyxXQUFxQyxPQUE2SDtBQUMxUSxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixJQUFJLGNBQWMsU0FBWSw4QkFBOEIsTUFBTSxTQUFTLElBQUksYUFBYTtBQUFBLElBQzVGO0FBQUEsSUFDQSxPQUFPLGlDQUFpQyxJQUFJO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxTQUFTLCtDQUErQyxNQUF3QyxNQUFjLE9BQTZIO0FBQ2pQLFVBQVEsTUFBTTtBQUFBLElBQ2IsS0FBSztBQUNKLGFBQU8sbUNBQW1DLE1BQU0sTUFBTSxPQUFPLE9BQU8sUUFBUSxXQUFXLE1BQU0sTUFBTSxRQUFXLEtBQUs7QUFBQSxJQUNwSCxLQUFLO0FBQ0osYUFBTyxtQ0FBbUMsTUFBTSxNQUFNLE9BQU8sT0FBTyxZQUFZLFdBQVcsTUFBTSxVQUFVLFFBQVcsS0FBSztBQUFBLEVBQzdIO0FBQ0Q7QUFFTyxTQUFTLG9DQUFvQyxPQUFnRjtBQUNuSSxNQUFJLE1BQU0sU0FBUyxXQUFXO0FBQzdCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyw2Q0FBNkMsTUFBTSxLQUFLO0FBQ2hFO0FBRU8sU0FBUyw2Q0FBNkMsT0FBZ0Y7QUFDNUksTUFBSSxPQUFPLFVBQVUsWUFBWSxVQUFVLE1BQU07QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFNBQVM7QUFDZixNQUFJLE9BQU8sU0FBUyx1QkFBdUI7QUFDMUMsV0FBTztBQUFBLEVBQ1I7QUFFQSxVQUFRLE9BQU8sTUFBTTtBQUFBLElBQ3BCLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFDSixhQUFPLE9BQU87QUFBQSxFQUNoQjtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsbUNBQW1DLE9BQTRIO0FBQzlLLFNBQU8sb0NBQW9DLEtBQUssTUFBTTtBQUN2RDtBQVlPLElBQVcsZUFBWCxrQkFBV0Msa0JBQVg7QUFDTixFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUppQixTQUFBQTtBQUFBLEdBQUE7QUFPbEIsTUFBTSx5Q0FBeUM7QUFDL0MsTUFBTSxnQ0FBZ0M7QUFRL0IsU0FBUyx3QkFBd0IsT0FBbUY7QUFDMUgsTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sU0FBUyxNQUFNLE9BQU8sWUFBWTtBQUN4QyxNQUFJLE9BQU8sV0FBVyxRQUFRLEdBQUc7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLE9BQU8sV0FBVyxRQUFRLEtBQUssT0FBTyxXQUFXLFdBQVcsR0FBRztBQUNsRSxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFDUjtBQTJFTyxTQUFTLHFCQUNmLE1BQ0EsTUFDQSxTQVFpQztBQUNqQyxRQUFNLFdBQVcsU0FBUyxZQUFZO0FBQ3RDLFFBQU0sV0FBVyxTQUFTLFlBQVk7QUFDdEMsUUFBTSxjQUFjLFNBQVMsZUFBZTtBQUM1QyxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixJQUFJLFNBQVMsTUFBTSxjQUFjLGFBQWEsQ0FBQztBQUFBLElBQy9DO0FBQUEsSUFDQSxNQUFNLFNBQVM7QUFBQSxJQUNmLE9BQU87QUFBQSxJQUNQO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsTUFDTixHQUFHLFNBQVM7QUFBQSxNQUNaLENBQUMsNEJBQTRCLElBQUksR0FBRztBQUFBLE1BQ3BDLENBQUMsNEJBQTRCLFFBQVEsR0FBRztBQUFBLE1BQ3hDLENBQUMsNEJBQTRCLFFBQVEsR0FBRztBQUFBLE1BQ3hDLENBQUMsNEJBQTRCLFdBQVcsR0FBRztBQUFBLElBQzVDO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyx3Q0FBd0MsWUFBb0Y7QUFDM0ksUUFBTSxzQkFBc0IsV0FBVztBQUN2QyxNQUFJLE9BQU8sd0JBQXdCLFlBQVksV0FBVyxRQUFRLDRCQUE0QixJQUFJLE1BQU0sU0FBUztBQUNoSCxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0saUJBQWlCLENBQUMsS0FBYSxhQUE2QjtBQUNqRSxVQUFNLFFBQVEsV0FBVyxRQUFRLEdBQUc7QUFDcEMsV0FBTyxPQUFPLFVBQVUsV0FBVyxRQUFRO0FBQUEsRUFDNUM7QUFDQSxTQUFPLHFCQUFxQixXQUFXLE9BQU8scUJBQXFCO0FBQUEsSUFDbEUsVUFBVSxlQUFlLDRCQUE0QixVQUFVLFVBQVU7QUFBQSxJQUN6RSxVQUFVLGVBQWUsNEJBQTRCLFVBQVUsV0FBVyxLQUFLO0FBQUEsSUFDL0UsYUFBYSxlQUFlLDRCQUE0QixhQUFhLFdBQVcsS0FBSztBQUFBLElBQ3JGLE9BQU8sV0FBVztBQUFBLEVBQ25CLENBQUM7QUFDRjtBQW1DTyxJQUFVO0FBQUEsQ0FBVixDQUFVQyx3Q0FBVjtBQUNDLEVBQU1BLG9DQUFBLE9BQU8sUUFBUTtBQUVyQixXQUFTLFdBQVcsUUFBcUQ7QUFDL0UsV0FBTztBQUFBLE1BQ04sV0FBVyxPQUFPO0FBQUEsTUFDbEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxnQkFBZ0IsT0FBTztBQUFBLE1BQ3ZCLGFBQWEsRUFBRSxpQkFBaUIsT0FBTyxpQkFBaUIsZUFBZSxPQUFPLGVBQWUsYUFBYSxPQUFPLGFBQWEsV0FBVyxPQUFPLFVBQVU7QUFBQSxJQUMzSjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxvQ0FBUztBQVNULFdBQVMsUUFBUSxNQUFvRTtBQUMzRixXQUFPO0FBQUEsTUFDTixJQUFJLEdBQUcsSUFBSTtBQUFBLE1BQ1gsTUFBTSxNQUFNLElBQUk7QUFBQSxNQUNoQixNQUFBQSxvQ0FBQTtBQUFBLE1BQ0EsT0FBTztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sR0FBRztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBVE8sRUFBQUEsb0NBQVM7QUFXVCxXQUFTLEdBQUcsTUFBMEM7QUFDNUQsV0FBTyxDQUFDLEtBQUssV0FBVyxLQUFLLE9BQU8sS0FBSyxnQkFBZ0IsS0FBSyxhQUFhLGlCQUFpQixLQUFLLGFBQWEsV0FBVyxFQUFFLEtBQUssR0FBRztBQUFBLEVBQ3BJO0FBRk8sRUFBQUEsb0NBQVM7QUFJVCxXQUFTLE1BQU0sTUFBMEM7QUFDL0QsUUFBVztBQUFYLE1BQVdDLG1CQUFYO0FBQ0MsTUFBQUEsOEJBQUEsY0FBVyxNQUFYO0FBQ0EsTUFBQUEsOEJBQUEsc0JBQW1CLE1BQW5CO0FBQUEsT0FGVTtBQUlYLFFBQUksS0FBSyxnQkFBZ0I7QUFDeEIsVUFBSSxLQUFLLGVBQWUsU0FBUyxtQkFBd0I7QUFDeEQsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUlBLFlBQU0sWUFBWSxLQUFLLGVBQWUsWUFBWSxLQUFLLGlCQUFzQjtBQUM3RSxVQUFJLGNBQWMsTUFBTSxZQUFZLDRCQUFpQyxtQkFBd0I7QUFDNUYsZUFBTyxLQUFLLGVBQWUsVUFBVSxHQUFHLGlCQUFzQixJQUFJO0FBQUEsTUFDbkU7QUFDQSxhQUFPLEtBQUssZUFBZSxVQUFVLEdBQUcsU0FBUyxJQUFJO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLFdBQVcsU0FBUyxnQ0FBZ0MsY0FBYztBQUN0RSxRQUFJLEtBQUssV0FBVztBQUNuQixpQkFBVyxTQUFTLG1DQUFtQyxtQkFBbUIsU0FBUyxLQUFLLFNBQVMsQ0FBQztBQUFBLElBQ25HO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUF4Qk8sRUFBQUQsb0NBQVM7QUFBQSxHQTNCQTtBQW1MVixTQUFTLDJCQUEyQixPQUFzRTtBQUNoSCxTQUFPLE1BQU0sU0FBUztBQUN2QjtBQW9DTyxTQUFTLDZCQUE2QixPQUFtRjtBQUMvSCxTQUFPLE1BQU0sU0FBUztBQUN2QjtBQWFPLFNBQVMsNkJBQTZCLGNBQW1CLFNBQTBCO0FBQ3pGLFNBQU8sWUFBWSxTQUNoQixtQkFBbUIsYUFBYSxTQUFTLENBQUMsS0FDMUMsbUJBQW1CLGFBQWEsU0FBUyxDQUFDLEtBQVMsT0FBTztBQUM5RDtBQWFPLFNBQVMsaUNBQWlDLGNBQW1CLFNBQTZCLE9BQWUsT0FBaUMsT0FBOEQ7QUFDOU0sU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sSUFBSSw2QkFBNkIsY0FBYyxPQUFPO0FBQUEsSUFDdEQsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLElBQ1A7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQTBCTyxTQUFTLG9DQUFvQyxjQUFtQixTQUFzRDtBQUM1SCxTQUFPLFlBQVksU0FDaEIsRUFBRSxNQUFNLDBCQUEwQixjQUFjLGFBQWEsU0FBUyxFQUFFLElBQ3hFLEVBQUUsTUFBTSwwQkFBMEIsY0FBYyxhQUFhLFNBQVMsR0FBRyxRQUFRO0FBQ3JGO0FBS08sU0FBUyxvQ0FBb0MsT0FBK0U7QUFDbEksU0FBTyxPQUFPLFVBQVUsWUFBWSxVQUFVLFFBQVMsTUFBNkIsU0FBUztBQUM5RjtBQWNPLFNBQVMsMkNBQTJDLE9BQTJDLElBQVksTUFBYyxPQUFpQyxPQUFnRztBQUNoUSxNQUFJO0FBQ0osTUFBSTtBQUNILG1CQUFlLElBQUksTUFBTSxNQUFNLFlBQVk7QUFBQSxFQUM1QyxRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLE9BQU87QUFBQSxJQUNQLFNBQVMsTUFBTTtBQUFBLElBQ2Y7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBV08sSUFBVTtBQUFBLENBQVYsQ0FBVUUsK0JBQVY7QUFLQyxXQUFTLE1BQU0sT0FBbUQ7QUFDeEUsV0FBTyxJQUFJLE1BQU0sTUFBTSxLQUFLLElBQ3pCLE1BQU0sUUFDTixXQUFXLE1BQU0sS0FBSyxJQUNyQixNQUFNLE1BQU0sTUFDWjtBQUFBLEVBQ0w7QUFOTyxFQUFBQSwyQkFBUztBQVFULFdBQVMsU0FBUyxHQUF5RDtBQUNqRixRQUFJLEVBQUUsaUJBQWlCLFlBQVk7QUFFbEMsWUFBTSxNQUEwQyxFQUFFLEdBQUcsRUFBRTtBQUN2RCxVQUFJLFFBQVEsRUFBRSxTQUFTLGFBQWEsU0FBUyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUU7QUFDNUQsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLHVCQUF1QixDQUFDLEtBQUssRUFBRSxxQkFBcUIsWUFBWTtBQUNuRSxhQUFPO0FBQUEsUUFDTixHQUFHO0FBQUEsUUFDSCxXQUFXLEVBQUUsU0FBUyxhQUFhLFNBQVMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFmTyxFQUFBQSwyQkFBUztBQWlCVCxXQUFTLFdBQVcsR0FBeUQ7QUFHbkYsUUFBSSxLQUFLLFlBQVksS0FBSyxNQUFNLFFBQVEsRUFBRSxNQUFNLEdBQUc7QUFDbEQsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sSUFBSSxFQUFFLE1BQU07QUFBQSxRQUNaLE1BQU0sRUFBRTtBQUFBLFFBQ1IsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHO0FBQUEsUUFDcEIsT0FBTyxFQUFFO0FBQUEsUUFDVCxrQkFBa0IsRUFBRTtBQUFBLFFBQ3BCLFlBQVksRUFBRTtBQUFBLE1BQ2Y7QUFBQSxJQUNELE9BQU87QUFFTixVQUFJLEVBQUUsU0FBUyxPQUFPLEVBQUUsVUFBVSxZQUFZLGFBQWEsRUFBRSxTQUFTLE9BQU8sRUFBRSxNQUFNLFlBQVksVUFBVTtBQUUxRyxjQUFNLE1BQTBDLEVBQUUsR0FBRyxFQUFFO0FBQ3ZELFlBQUksUUFBUSxhQUFhLEVBQUUsTUFBTSxPQUFPLEVBQUU7QUFDMUMsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLHVCQUF1QixDQUFDLEtBQUssRUFBRSxhQUFhLE9BQU8sRUFBRSxjQUFjLFlBQVksYUFBYSxFQUFFLGFBQWEsT0FBTyxFQUFFLFVBQVUsWUFBWSxVQUFVO0FBQ3ZKLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILFdBQVcsYUFBYSxFQUFFLFVBQVUsT0FBTyxFQUFFO0FBQUEsUUFDOUM7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBL0JPLEVBQUFBLDJCQUFTO0FBQUEsR0E5QkE7QUFnRVYsU0FBUyx3QkFBd0IsS0FBMEU7QUFDakgsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLHNCQUFzQixLQUF3RTtBQUM3RyxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMsd0JBQXdCLEtBQStEO0FBQ3RHLFNBQU8sSUFBSSxTQUFTO0FBQ3JCO0FBRU8sU0FBUyxxQkFBcUIsS0FBNEQ7QUFDaEcsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLDZCQUE2QixLQUFvRTtBQUNoSCxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMscUJBQXFCLEtBQXVFO0FBQzNHLFNBQU8sSUFBSSxTQUFTO0FBQ3JCO0FBRU8sU0FBUyx5QkFBeUIsS0FBMkU7QUFDbkgsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLHFCQUFxQixLQUE0RDtBQUNoRyxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMsbUNBQW1DLEtBQWlIO0FBQ25LLFNBQU8sSUFBSSxTQUFTLFVBQVUsSUFBSSxTQUFTLGVBQWUsSUFBSSxTQUFTO0FBQ3hFO0FBRU8sU0FBUyx3Q0FBd0MsU0FBbUU7QUFDMUgsUUFBTSxxQkFBcUIsUUFBUSxPQUFPLGtDQUFrQztBQUM1RSxNQUFJLENBQUMsbUJBQW1CLFFBQVE7QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLG1CQUFtQixNQUFNLG9CQUFvQixHQUFHO0FBQ25ELFdBQU8sbUJBQW1CLFdBQVcsSUFDbEMsU0FBUyxvQ0FBb0Msa0JBQWtCLElBQy9ELFNBQVMscUNBQXFDLHVCQUF1QixtQkFBbUIsTUFBTTtBQUFBLEVBQ2xHO0FBRUEsU0FBTyxtQkFBbUIsV0FBVyxJQUNsQyxTQUFTLG1DQUFtQyxpQkFBaUIsSUFDN0QsU0FBUyxvQ0FBb0Msc0JBQXNCLG1CQUFtQixNQUFNO0FBQ2hHO0FBRU8sU0FBUyw4QkFBOEIsS0FBcUU7QUFDbEgsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLHVCQUF1QixLQUE4RDtBQUNwRyxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMsMkJBQTJCLEtBQWlFO0FBQzNHLFNBQU8sSUFBSSxTQUFTO0FBQ3JCO0FBRU8sU0FBUyx1QkFBdUIsS0FBOEQ7QUFDcEcsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLDBCQUEwQixLQUFpRTtBQUMxRyxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMsMEJBQTBCLEtBQWlFO0FBQzFHLFNBQU8sSUFBSSxTQUFTO0FBQ3JCO0FBRU8sU0FBUywyQkFBMkIsS0FBZ0Q7QUFDMUYsUUFBTSxRQUFRO0FBQ2QsU0FBTyxPQUFPLFVBQVUsWUFDdkIsVUFBVSxRQUNWLE9BQU8sTUFBTSxPQUFPLFlBQ3BCLE9BQU8sTUFBTSxTQUFTO0FBQ3hCO0FBRU8sU0FBUyw4QkFBOEIsS0FBcUU7QUFDbEgsU0FBTyxJQUFJLFNBQVM7QUFDckI7QUFFTyxTQUFTLG9DQUFvQyxLQUEyRTtBQUM5SCxTQUFPLElBQUksU0FBUztBQUNyQjtBQUVPLFNBQVMseUNBQXlDLEtBQWdGO0FBQ3hJLFNBQU8sSUFBSSxTQUFTO0FBQ3JCO0FBRU8sU0FBUyw2QkFBNkIsT0FBaUQ7QUFDN0YsUUFBTSwrQkFBK0I7QUFDckMsU0FDQyxPQUFPLGlDQUFpQyxZQUN4QyxpQ0FBaUMsU0FDaEMsT0FBTyw2QkFBNkIsVUFBVSxZQUFZLE9BQU8sNkJBQTZCLFVBQVUsaUJBQ3hHLE9BQU8sNkJBQTZCLFNBQVMsWUFBWSxPQUFPLDZCQUE2QixTQUFTLGlCQUN0Ryw2QkFBNkIsZ0JBQWdCLFVBQWEsSUFBSSxNQUFNLDZCQUE2QixXQUFXLE9BQzVHLE9BQU8sNkJBQTZCLFNBQVMsWUFBWSxJQUFJLE1BQU0sNkJBQTZCLFdBQVcsT0FDM0csNkJBQTZCLGFBQWEsVUFBYSxzQkFBc0IsNkJBQTZCLFFBQVEsTUFDbkgsSUFBSSxNQUFNLDZCQUE2QixHQUFHLEtBQzFDLE9BQU8sNkJBQTZCLFdBQVc7QUFFakQ7QUFFTyxJQUFLLHlCQUFMLGtCQUFLQyw0QkFBTDtBQUNOLEVBQUFBLHdCQUFBLGlCQUFjO0FBQ2QsRUFBQUEsd0JBQUEsMEJBQXVCO0FBQ3ZCLEVBQUFBLHdCQUFBLGdCQUFhO0FBSEYsU0FBQUE7QUFBQSxHQUFBO0FBaUJMLFNBQVMsMEJBQTBCLEtBQVUsTUFBOEIsYUFBc0IscUJBQXFCLE9BQU8sZ0JBQTRFO0FBRS9NLFNBQU87QUFBQSxJQUNOLElBQUksR0FBRyxJQUFJLEtBQUssSUFBSSxTQUFTLENBQUM7QUFBQSxJQUM5QixNQUFNLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFBQSxJQUM3QixPQUFPO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixrQkFBa0I7QUFBQSxJQUNsQixRQUFRLFNBQVM7QUFBQSxJQUNqQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBRUEsSUFBSyx5QkFBTCxrQkFBS0MsNEJBQUw7QUFDQyxFQUFBQSx3QkFBQSx5QkFBc0I7QUFEbEIsU0FBQUE7QUFBQSxHQUFBO0FBSUUsU0FBUywwQkFBMEIsU0FBaUIscUJBQXFCLE9BQU8sZ0JBQTRFO0FBQ2xLLFNBQU87QUFBQSxJQUNOLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGtCQUFrQjtBQUFBLElBQ2xCO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFDRDtBQUVPLFNBQVMsb0JBQW9CLEtBQVUsT0FBdUM7QUFDcEYsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTyxRQUFRLEVBQUUsS0FBSyxNQUFNLElBQUk7QUFBQSxJQUNoQyxJQUFJLElBQUksU0FBUyxLQUFLLE9BQU8sU0FBUyxLQUFLO0FBQUEsSUFDM0MsTUFBTSxTQUFTLEdBQUc7QUFBQSxFQUNuQjtBQUNEO0FBRU8sU0FBUyxvQkFBb0IsT0FBa0IsT0FBNkM7QUFDbEcsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sSUFBSSxNQUFNO0FBQUEsSUFDVixNQUFNLFVBQVUsWUFBWSxNQUFNLElBQUksSUFBSSxNQUFNLE9BQU87QUFBQSxJQUN2RCxNQUFNLE1BQU07QUFBQSxJQUNaLE9BQU87QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyx1QkFBdUIsT0FBaUIsT0FBZ0Q7QUFDdkcsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sSUFBSSxNQUFNO0FBQUEsSUFDVixNQUFNLE1BQU07QUFBQSxJQUNaLE1BQU0sTUFBTTtBQUFBLElBQ1osT0FBTyxNQUFNLEtBQUssTUFBTSxTQUFTLENBQUMsRUFBRSxJQUFJLE9BQUssb0JBQW9CLENBQUMsQ0FBQztBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSx1QkFBdUI7QUFBQSxFQUluQyxZQUFZLFNBQXVDO0FBSG5ELFNBQVEsT0FBTyxvQkFBSSxJQUFZO0FBQy9CLFNBQVEsV0FBd0MsQ0FBQztBQUdoRCxRQUFJLFNBQVM7QUFDWixXQUFLLElBQUksR0FBRyxPQUFPO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFTyxPQUFPLE9BQTBDO0FBQ3ZELGVBQVcsS0FBSyxPQUFPO0FBQ3RCLFVBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxFQUFFLEVBQUUsR0FBRztBQUN6QixhQUFLLEtBQUssSUFBSSxFQUFFLEVBQUU7QUFDbEIsYUFBSyxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFlBQVksT0FBd0M7QUFDMUQsUUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLE1BQU0sRUFBRSxHQUFHO0FBQzdCLFdBQUssS0FBSyxJQUFJLE1BQU0sRUFBRTtBQUN0QixXQUFLLFNBQVMsUUFBUSxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFTyxPQUFPLE9BQXdDO0FBQ3JELFNBQUssS0FBSyxPQUFPLE1BQU0sRUFBRTtBQUN6QixTQUFLLFdBQVcsS0FBSyxTQUFTLE9BQU8sT0FBSyxFQUFFLE9BQU8sTUFBTSxFQUFFO0FBQUEsRUFDNUQ7QUFBQSxFQUVPLElBQUksT0FBMkM7QUFDckQsV0FBTyxLQUFLLEtBQUssSUFBSSxNQUFNLEVBQUU7QUFBQSxFQUM5QjtBQUFBLEVBRU8sVUFBdUM7QUFDN0MsV0FBTyxLQUFLLFNBQVMsTUFBTSxDQUFDO0FBQUEsRUFDN0I7QUFBQSxFQUVBLElBQVcsU0FBaUI7QUFDM0IsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN0QjtBQUNEOyIsCiAgIm5hbWVzIjogWyJBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCIsICJPbWl0dGVkU3RhdGUiLCAiSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSIsICJUcmltVGhyZXNob2xkIiwgIklDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkiLCAiUHJvbXB0RmlsZVZhcmlhYmxlS2luZCIsICJQcm9tcHRUZXh0VmFyaWFibGVLaW5kIl0KfQo=
