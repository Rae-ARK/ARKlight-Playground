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
import { asArray } from "../../../../../base/common/arrays.js";
import { softAssertNever } from "../../../../../base/common/assert.js";
import { VSBuffer, decodeHex, encodeHex } from "../../../../../base/common/buffer.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString, isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { Schemas } from "../../../../../base/common/network.js";
import { equals } from "../../../../../base/common/objects.js";
import { autorun, constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue, observableValueOpts, registerAutorunSelfDisposable } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { localize } from "../../../../../nls.js";
import { canLog, ILogService, LogLevel } from "../../../../../platform/log/common/log.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { IChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry } from "../attachments/chatVariableEntries.js";
import { migrateLegacyTerminalToolSpecificData } from "../chat.js";
import { ChatPerfMark, markChat } from "../chatPerf.js";
import { ChatRequestQueueKind, ChatResponseClearToPreviousToolInvocationReason, ElicitationState, IChatService, IChatToolInvocation, ResponseModelState, ToolConfirmKind, isIUsedContext } from "../chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../constants.js";
import { ChatToolInvocation } from "./chatProgressTypes/chatToolInvocation.js";
import { ChatPlanReviewData } from "./chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "./chatProgressTypes/chatQuestionCarouselData.js";
import { ToolDataSource } from "../tools/languageModelToolsService.js";
import { IChatEditingService, ModifiedFileEntryState } from "../editing/chatEditingService.js";
import { IChatAgentService, reviveSerializedAgent } from "../participants/chatAgents.js";
import { ChatRequestTextPart, reviveParsedChatRequest } from "../requestParser/chatParserTypes.js";
import { chatSessionResourceToId, LocalChatSessionUri } from "./chatUri.js";
const CHAT_ATTACHABLE_IMAGE_MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
function getAttachableImageExtension(mimeType) {
  return Object.entries(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).find(([_, value]) => value === mimeType)?.[0];
}
var IChatRequestVariableData;
((IChatRequestVariableData2) => {
  function toExport(data) {
    return { variables: data.variables.map(IChatRequestVariableEntry.toExport) };
  }
  IChatRequestVariableData2.toExport = toExport;
})(IChatRequestVariableData || (IChatRequestVariableData = {}));
function isCellTextEditOperation(value) {
  const candidate = value;
  return !!candidate && !!candidate.edit && !!candidate.uri && URI.isUri(candidate.uri);
}
function isCellTextEditOperationArray(value) {
  return value.some(isCellTextEditOperation);
}
const nonHistoryKinds = /* @__PURE__ */ new Set(["toolInvocation", "toolInvocationSerialized", "undoStop", "voiceProgress"]);
function isChatProgressHistoryResponseContent(content) {
  return !nonHistoryKinds.has(content.kind);
}
function toChatHistoryContent(content) {
  return content.filter(isChatProgressHistoryResponseContent);
}
const defaultChatResponseModelChangeReason = { reason: "other" };
class ChatRequestModel {
  constructor(params) {
    this._shouldBeBlocked = observableValue(this, false);
    this._version = 0;
    this._session = params.session;
    this.message = params.message;
    this._variableData = params.variableData;
    this.requestTimestamp = params.timestamp;
    this.timestamp = params.timestamp ?? params.fallbackTimestamp ?? Date.now();
    this._attempt = params.attempt ?? 0;
    this.modeInfo = params.modeInfo;
    this._confirmation = params.confirmation;
    this._locationData = params.locationData;
    this._attachedContext = params.attachedContext;
    this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
    this.modelId = params.modelId;
    this.id = params.restoredId ?? "request_" + generateUuid();
    this._editedFileEvents = params.editedFileEvents;
    this.userSelectedTools = params.userSelectedTools;
    this.isSystemInitiated = params.isSystemInitiated;
    this.systemInitiatedLabel = params.systemInitiatedLabel;
    this.terminalExecutionId = params.terminalExecutionId;
    this.isTerminalCommand = params.isTerminalCommand ?? false;
  }
  get shouldBeBlocked() {
    return this._shouldBeBlocked;
  }
  setShouldBeBlocked(value) {
    this._shouldBeBlocked.set(value, void 0);
  }
  get session() {
    return this._session;
  }
  get attempt() {
    return this._attempt;
  }
  get variableData() {
    return this._variableData;
  }
  set variableData(v) {
    this._version++;
    this._variableData = v;
  }
  get confirmation() {
    return this._confirmation;
  }
  get locationData() {
    return this._locationData;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get editedFileEvents() {
    return this._editedFileEvents;
  }
  get version() {
    return this._version;
  }
  adoptTo(session) {
    this._session = session;
  }
}
class AbstractResponse {
  get value() {
    return this._responseParts;
  }
  constructor(value) {
    this._responseParts = value;
  }
  toString() {
    if (this._responseRepr === void 0) {
      this._responseRepr = this.computeRepr();
    }
    return this._responseRepr;
  }
  /**
   * _Just_ the content of markdown parts in the response
   */
  getMarkdown() {
    if (this._markdownContent === void 0) {
      this._markdownContent = this.computeMarkdownContent();
    }
    return this._markdownContent;
  }
  /**
   * The trailing contiguous markdown/inline-reference content of the response,
   * skipping any trailing tool calls or empty markdown parts.
   */
  getFinalResponse() {
    const parts = this._responseParts;
    let i = parts.length - 1;
    while (i >= 0) {
      const part = parts[i];
      if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          break;
        }
      } else if (part.kind === "inlineReference") {
        break;
      }
      i--;
    }
    if (i < 0) {
      return "";
    }
    const end = i;
    while (i >= 0) {
      const part = parts[i];
      if (part.kind === "markdownContent" || part.kind === "markdownVuln" || part.kind === "inlineReference") {
        i--;
      } else {
        break;
      }
    }
    const start = i + 1;
    const segments = [];
    for (let j = start; j <= end; j++) {
      const part = parts[j];
      if (part.kind === "inlineReference") {
        segments.push(this.inlineRefToRepr(part));
      } else if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          segments.push(part.content.value);
        }
      }
    }
    return segments.join("");
  }
  /**
   * Invalidate cached representations so they are recomputed on next access.
   */
  _invalidateRepr() {
    this._responseRepr = void 0;
    this._markdownContent = void 0;
  }
  computeMarkdownContent() {
    const segments = [];
    for (const part of this._responseParts) {
      if (part.kind === "inlineReference") {
        segments.push(this.inlineRefToRepr(part));
      } else if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          segments.push(part.content.value);
        }
      }
    }
    return segments.join("");
  }
  computeRepr() {
    return this.partsToRepr(this._responseParts);
  }
  partsToRepr(parts) {
    const blocks = [];
    let currentBlockSegments = [];
    let hasEditGroupsAfterLastClear = false;
    for (const part of parts) {
      let segment;
      switch (part.kind) {
        case "clearToPreviousToolInvocation":
          currentBlockSegments = [];
          blocks.length = 0;
          hasEditGroupsAfterLastClear = false;
          continue;
        case "treeData":
        case "progressMessage":
        case "codeblockUri":
        case "extensions":
        case "pullRequest":
        case "undoStop":
        case "workspaceEdit":
        case "externalEdit":
        case "elicitation2":
        case "elicitationSerialized":
        case "thinking":
        case "hook":
        case "voiceProgress":
        case "multiDiffData":
        case "mcpServersStarting":
        case "mcpAuthenticationRequired":
        case "mcpServersStartingSlow":
        case "questionCarousel":
        case "planReview":
        case "disabledClaudeHooks":
        case "autoModeResolution":
          continue;
        case "systemNotification":
          segment = { text: part.content.value, isBlock: true };
          break;
        case "toolInvocation":
        case "toolInvocationSerialized":
          segment = this.getToolInvocationText(part);
          break;
        case "inlineReference":
          segment = { text: this.inlineRefToRepr(part) };
          break;
        case "command":
          segment = { text: part.command.title, isBlock: true };
          break;
        case "textEditGroup":
        case "notebookEditGroup":
          hasEditGroupsAfterLastClear = true;
          continue;
        case "confirmation":
          if (part.message instanceof MarkdownString) {
            segment = { text: `${part.title}
${part.message.value}`, isBlock: true };
            break;
          }
          segment = { text: `${part.title}
${part.message}`, isBlock: true };
          break;
        case "markdownContent":
        case "markdownVuln":
        case "progressTask":
        case "progressTaskSerialized":
        case "warning":
        case "info":
          segment = { text: part.content.value };
          break;
        default:
          softAssertNever(part);
          continue;
      }
      if (segment.isBlock) {
        if (currentBlockSegments.length) {
          blocks.push(currentBlockSegments.join(""));
          currentBlockSegments = [];
        }
        blocks.push(segment.text);
      } else {
        currentBlockSegments.push(segment.text);
      }
    }
    if (currentBlockSegments.length) {
      blocks.push(currentBlockSegments.join(""));
    }
    if (hasEditGroupsAfterLastClear) {
      blocks.push(localize("editsSummary", "Made changes."));
    }
    return blocks.join("\n\n");
  }
  inlineRefToRepr(part) {
    if ("uri" in part.inlineReference) {
      return this.uriToRepr(part.inlineReference.uri);
    }
    return "name" in part.inlineReference ? "`" + part.inlineReference.name + "`" : this.uriToRepr(part.inlineReference);
  }
  getToolInvocationText(toolInvocation) {
    const getTerminalDisplayInput = (terminalData) => terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
    let message = "";
    let input = "";
    if (toolInvocation.pastTenseMessage) {
      message = typeof toolInvocation.pastTenseMessage === "string" ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value;
    } else {
      message = typeof toolInvocation.invocationMessage === "string" ? toolInvocation.invocationMessage : toolInvocation.invocationMessage.value;
    }
    if (toolInvocation.toolSpecificData) {
      if (toolInvocation.toolSpecificData.kind === "terminal") {
        message = "Ran terminal command";
        const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
        input = getTerminalDisplayInput(terminalData);
      }
    }
    let text = message;
    if (input) {
      text += `: ${input}`;
    }
    if (toolInvocation.kind === "toolInvocationSerialized" || toolInvocation.kind === "toolInvocation" && IChatToolInvocation.isComplete(toolInvocation)) {
      const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
      if (resultDetails && "input" in resultDetails) {
        const resultPrefix = toolInvocation.kind === "toolInvocationSerialized" || IChatToolInvocation.isComplete(toolInvocation) ? "Completed" : "Errored";
        const resultInput = toolInvocation.toolSpecificData?.kind === "terminal" ? getTerminalDisplayInput(migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData)) : resultDetails.input;
        text += `
${resultPrefix} with input: ${resultInput}`;
      }
    }
    return { text, isBlock: true };
  }
  uriToRepr(uri) {
    if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
      return uri.toString(false);
    }
    return basename(uri);
  }
}
class ResponseView extends AbstractResponse {
  constructor(_response, undoStop) {
    let idx = _response.value.findIndex((v) => v.kind === "undoStop" && v.id === undoStop);
    if (_response.value[idx + 1]?.kind === "codeblockUri" && _response.value[idx - 1]?.kind === "markdownContent") {
      idx--;
    }
    super(idx === -1 ? _response.value.slice() : _response.value.slice(0, idx));
    this.undoStop = undoStop;
  }
}
class Response extends AbstractResponse {
  constructor(value) {
    super(asArray(value).map((v) => "kind" in v ? v : isMarkdownString(v) ? { content: v, kind: "markdownContent" } : { kind: "treeData", treeData: v }));
    this._store = new DisposableStore();
    this._onDidChangeValue = this._store.add(new Emitter());
    this._citations = [];
  }
  get onDidChangeValue() {
    return this._onDidChangeValue.event;
  }
  dispose() {
    this._store.dispose();
  }
  clear() {
    this.finalizeReasoningDuration();
    this._responseParts = [];
    this._contentChanged(true);
  }
  clearToPreviousToolInvocation(message) {
    this.finalizeReasoningDuration();
    let lastToolInvocationIndex = -1;
    for (let i = this._responseParts.length - 1; i >= 0; i--) {
      const part = this._responseParts[i];
      if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
        lastToolInvocationIndex = i;
        break;
      }
    }
    if (lastToolInvocationIndex !== -1) {
      this._responseParts = this._responseParts.slice(0, lastToolInvocationIndex + 1);
    } else {
      this._responseParts = [];
    }
    if (message) {
      this._responseParts.push({ kind: "warning", content: new MarkdownString(message) });
    }
    this._contentChanged(true);
  }
  updateContent(progress, quiet) {
    if (progress.kind !== "thinking") {
      this.finalizeReasoningDuration();
    }
    if (progress.kind === "clearToPreviousToolInvocation") {
      if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.CopyrightContentRetry) {
        this.clearToPreviousToolInvocation(localize("copyrightContentRetry", "Response cleared due to possible match to public code, retrying with modified prompt."));
      } else if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.FilteredContentRetry) {
        this.clearToPreviousToolInvocation(localize("filteredContentRetry", "Response cleared due to content safety filters, retrying with modified prompt."));
      } else {
        this.clearToPreviousToolInvocation();
      }
      return;
    } else if (progress.kind === "markdownContent") {
      const lastResponsePart = this._responseParts.filter((p) => p.kind !== "textEditGroup").at(-1);
      if (!lastResponsePart || lastResponsePart.kind !== "markdownContent" || !canMergeMarkdownStrings(lastResponsePart.content, progress.content)) {
        this._responseParts.push(progress);
      } else {
        const idx = this._responseParts.indexOf(lastResponsePart);
        this._responseParts[idx] = { ...lastResponsePart, content: appendMarkdownString(lastResponsePart.content, progress.content) };
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "thinking") {
      const lastResponsePart = this._responseParts.filter((p) => p.kind !== "textEditGroup").at(-1);
      const lastText = lastResponsePart && lastResponsePart.kind === "thinking" ? Array.isArray(lastResponsePart.value) ? lastResponsePart.value.join("") : lastResponsePart.value || "" : "";
      const currText = Array.isArray(progress.value) ? progress.value.join("") : progress.value || "";
      const isEmpty = (s) => s.length === 0;
      if (isEmpty(currText)) {
        this.finalizeReasoningDuration();
      } else if (!this._activeReasoning) {
        this._activeReasoning = { part: progress, startedAt: Date.now() };
      }
      if (!lastResponsePart || lastResponsePart.kind !== "thinking" || isEmpty(currText) || isEmpty(lastText) || !canMergeMarkdownStrings(new MarkdownString(lastText), new MarkdownString(currText))) {
        this._responseParts.push(progress);
      } else {
        const idx = this._responseParts.indexOf(lastResponsePart);
        const mergedPart = {
          ...lastResponsePart,
          value: appendMarkdownString(new MarkdownString(lastText), new MarkdownString(currText)).value
        };
        this._responseParts[idx] = mergedPart;
        if (this._activeReasoning?.part === lastResponsePart) {
          this._activeReasoning.part = mergedPart;
        }
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "textEdit" || progress.kind === "notebookEdit") {
      const notebookUri = CellUri.parse(progress.uri)?.notebook;
      const uri = notebookUri ?? progress.uri;
      const isExternalEdit = progress.isExternalEdit;
      if (progress.kind === "textEdit" && !notebookUri) {
        this._mergeOrPushTextEditGroup(uri, progress.edits, progress.done, isExternalEdit);
      } else if (progress.kind === "textEdit") {
        const cellEdits = progress.edits.map((edit) => ({ uri: progress.uri, edit }));
        this._mergeOrPushNotebookEditGroup(uri, cellEdits, progress.done, isExternalEdit);
      } else {
        this._mergeOrPushNotebookEditGroup(uri, progress.edits, progress.done, isExternalEdit);
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "progressTask") {
      const responsePosition = this._responseParts.push(progress) - 1;
      this._contentChanged(quiet);
      const disp = progress.onDidAddProgress(() => {
        this._contentChanged(false);
      });
      progress.task?.().then((content) => {
        disp.dispose();
        if (typeof content === "string") {
          this._responseParts[responsePosition].content = new MarkdownString(content);
        }
        this._contentChanged(false);
      });
    } else if (progress.kind === "toolInvocation") {
      registerAutorunSelfDisposable(this._store, (reader) => {
        progress.state.read(reader);
        this._contentChanged(false);
        if (IChatToolInvocation.isComplete(progress, reader)) {
          reader.dispose();
        }
      });
      this._responseParts.push(progress);
      this._contentChanged(quiet);
    } else if (progress.kind === "externalToolInvocationUpdate") {
      this._handleExternalToolInvocationUpdate(progress);
      this._contentChanged(quiet);
    } else if (progress.kind === "progressMessage" && progress.id !== void 0) {
      const idx = this._responseParts.findIndex((p) => p.kind === "progressMessage" && p.id === progress.id);
      if (idx === -1) {
        this._responseParts.push(progress);
      } else {
        this._responseParts[idx] = progress;
      }
      this._contentChanged(quiet);
    } else {
      this._responseParts.push(progress);
      this._contentChanged(quiet);
    }
  }
  /**
   * Persists the duration of the active reasoning interval.
   */
  finalizeReasoningDuration() {
    if (!this._activeReasoning) {
      return;
    }
    this._activeReasoning.part.reasoningDurationMs = Math.max(0, Date.now() - this._activeReasoning.startedAt);
    this._activeReasoning = void 0;
  }
  addCitation(citation) {
    this._citations.push(citation);
    this._contentChanged();
  }
  resolveInlineReference(resolveId, resolvedReference) {
    for (let i = 0; i < this._responseParts.length; i++) {
      const current = this._responseParts[i];
      if (current.kind !== "inlineReference" || current.resolveId !== resolveId) {
        continue;
      }
      this._responseParts[i] = {
        ...current,
        inlineReference: resolvedReference.inlineReference,
        name: resolvedReference.name ?? current.name
      };
      this._contentChanged();
      return true;
    }
    return false;
  }
  _mergeOrPushTextEditGroup(uri, edits, done, isExternalEdit) {
    for (const candidate of this._responseParts) {
      if (candidate.kind === "textEditGroup" && !candidate.done && isEqual(candidate.uri, uri)) {
        candidate.edits.push(edits);
        candidate.done = done;
        return;
      }
    }
    this._responseParts.push({ kind: "textEditGroup", uri, edits: [edits], done, isExternalEdit });
  }
  _mergeOrPushNotebookEditGroup(uri, edits, done, isExternalEdit) {
    for (const candidate of this._responseParts) {
      if (candidate.kind === "notebookEditGroup" && !candidate.done && isEqual(candidate.uri, uri)) {
        candidate.edits.push(edits);
        candidate.done = done;
        return;
      }
    }
    this._responseParts.push({ kind: "notebookEditGroup", uri, edits: [edits], done, isExternalEdit });
  }
  _handleExternalToolInvocationUpdate(progress) {
    const existingInvocation = this._responseParts.findLast(
      (part) => part.kind === "toolInvocation" && part.toolCallId === progress.toolCallId
    );
    if (existingInvocation) {
      if (progress.toolSpecificData !== void 0) {
        existingInvocation.toolSpecificData = progress.toolSpecificData;
      }
      if (progress.isComplete) {
        existingInvocation.didExecuteTool({
          content: [],
          toolResultMessage: progress.pastTenseMessage,
          toolResultError: progress.errorMessage,
          toolResultDetails: progress.resultDetails
        });
      }
      return;
    }
    const toolData = {
      id: progress.toolName,
      source: ToolDataSource.External,
      displayName: progress.toolName,
      modelDescription: progress.toolName
    };
    const invocation = new ChatToolInvocation(
      {
        invocationMessage: progress.invocationMessage,
        pastTenseMessage: progress.pastTenseMessage,
        toolSpecificData: progress.toolSpecificData
      },
      toolData,
      progress.toolCallId,
      progress.subagentInvocationId,
      void 0,
      // parameters
      {},
      void 0
      // chatRequestId
    );
    if (progress.isComplete) {
      if (progress.toolSpecificData !== void 0) {
        invocation.toolSpecificData = progress.toolSpecificData;
      }
      invocation.didExecuteTool({
        content: [],
        toolResultMessage: progress.pastTenseMessage,
        toolResultError: progress.errorMessage,
        toolResultDetails: progress.resultDetails
      });
    }
    this._responseParts.push(invocation);
  }
  computeRepr() {
    let repr = super.computeRepr();
    if (this._citations.length) {
      repr += "\n\n" + getCodeCitationsMessage(this._citations);
    }
    return repr;
  }
  _contentChanged(quiet) {
    this._invalidateRepr();
    if (!quiet) {
      this._onDidChangeValue.fire();
    }
  }
}
class ChatResponseModel extends Disposable {
  constructor(params) {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._modelState = observableValue(this, { value: ResponseModelState.Pending });
    this._usageObs = observableValue(this, void 0);
    this._subagentCopilotCredits = /* @__PURE__ */ new Map();
    this._completionTokenCountObs = observableValue(this, void 0);
    this._shouldBeBlocked = observableValue(this, false);
    this._contentReferences = [];
    this._codeCitations = [];
    this._progressMessages = [];
    this._isStale = false;
    this._session = params.session;
    this._agent = params.agent;
    this._slashCommand = params.slashCommand;
    this.requestId = params.requestId;
    this._timestamp = params.timestamp || Date.now();
    if (params.modelState) {
      this._modelState.set(params.modelState, void 0);
    }
    this._completionTimestamp = params.completionTimestamp === null ? void 0 : params.completionTimestamp ?? (params.modelState && "completedAt" in params.modelState ? params.modelState.completedAt : void 0);
    this._timeSpentWaitingAccumulator = params.timeSpentWaiting || 0;
    this._elapsedMs = params.elapsedMs;
    this._vote = params.vote;
    this._result = params.result;
    this._followups = params.followups ? [...params.followups] : void 0;
    this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
    this._shouldBeRemovedOnSend = params.shouldBeRemovedOnSend;
    this._shouldBeBlocked.set(params.shouldBeBlocked ?? false, void 0);
    this._isStale = Array.isArray(params.responseContent) && (params.responseContent.length !== 0 || isMarkdownString(params.responseContent) && params.responseContent.value.length !== 0);
    this._response = this._register(new Response(params.responseContent));
    this._codeBlockInfos = params.codeBlockInfos ? [...params.codeBlockInfos] : void 0;
    const signal = observableSignalFromEvent(this, this.onDidChange);
    const _pendingInfo = signal.map((_value, r) => {
      signal.read(r);
      for (const part of this._response.value) {
        if (part.kind === "toolInvocation") {
          const state = part.state.read(r);
          if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
            const title = state.confirmationMessages?.title;
            return title ? isMarkdownString(title) ? title.value : title : void 0;
          }
          if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
            return localize("waitingForPostApproval", "Approve tool result?");
          }
          if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
            return localize("waitingForToolAuthentication", "Authenticate {0} to continue...", state.server.name);
          }
        }
        if (part.kind === "confirmation" && !part.isUsed) {
          return part.title;
        }
        if (part.kind === "questionCarousel" && !part.isUsed) {
          return localize("waitingAnswer", "Answer questions to continue...");
        }
        if (part.kind === "planReview" && !part.isUsed) {
          return localize("waitingPlanReview", "Review the plan to continue...");
        }
        if (part.kind === "elicitation2" && part.state.read(r) === ElicitationState.Pending) {
          const title = part.title;
          return isMarkdownString(title) ? title.value : title;
        }
      }
      return void 0;
    });
    const _startedWaitingAt = _pendingInfo.map((p) => !!p).map((p) => p ? Date.now() : void 0);
    this.isPendingConfirmation = _startedWaitingAt.map((waiting, r) => waiting ? { startedWaitingAt: waiting, detail: _pendingInfo.read(r) } : void 0);
    this.isInProgress = signal.map((_value, r) => {
      signal.read(r);
      return !_pendingInfo.read(r) && !this.shouldBeRemovedOnSend && (this._modelState.read(r).value === ResponseModelState.Pending || this._modelState.read(r).value === ResponseModelState.NeedsInput);
    });
    this.isIncomplete = this._modelState.map((state) => {
      return state.value === ResponseModelState.Pending || state.value === ResponseModelState.NeedsInput;
    });
    this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
    this.id = params.restoredId ?? "response_" + generateUuid();
    let lastStartedWaitingAt = void 0;
    this.confirmationAdjustedTimestamp = derived((reader) => {
      const pending = this.isPendingConfirmation.read(reader);
      if (pending) {
        this._modelState.set({ value: ResponseModelState.NeedsInput }, void 0);
        if (!lastStartedWaitingAt) {
          lastStartedWaitingAt = pending.startedWaitingAt;
        }
      } else if (lastStartedWaitingAt) {
        if (this._modelState.read(reader).value === ResponseModelState.NeedsInput) {
          this._modelState.set({ value: ResponseModelState.Pending }, void 0);
        }
        this._timeSpentWaitingAccumulator += Date.now() - lastStartedWaitingAt;
        lastStartedWaitingAt = void 0;
      }
      return this._timestamp + this._timeSpentWaitingAccumulator;
    }).recomputeInitiallyAndOnChange(this._store);
  }
  get shouldBeBlocked() {
    return this._shouldBeBlocked;
  }
  get request() {
    return this.session.getRequests().find((r) => r.id === this.requestId);
  }
  get session() {
    return this._session;
  }
  get shouldBeRemovedOnSend() {
    return this._shouldBeRemovedOnSend;
  }
  get isComplete() {
    return this._modelState.get().value !== ResponseModelState.Pending && this._modelState.get().value !== ResponseModelState.NeedsInput;
  }
  get timestamp() {
    return this._timestamp;
  }
  set shouldBeRemovedOnSend(disablement) {
    if (this._shouldBeRemovedOnSend === disablement) {
      return;
    }
    this._shouldBeRemovedOnSend = disablement;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  get isCanceled() {
    return this._modelState.get().value === ResponseModelState.Cancelled;
  }
  get completedAt() {
    const state = this._modelState.get();
    if (state.value === ResponseModelState.Complete || state.value === ResponseModelState.Cancelled || state.value === ResponseModelState.Failed) {
      return state.completedAt;
    }
    return void 0;
  }
  get completionTimestamp() {
    return this._completionTimestamp;
  }
  get state() {
    const state = this._modelState.get().value;
    if (state === ResponseModelState.Complete && !!this._result?.errorDetails && this.result?.errorDetails?.code !== "canceled") {
      return ResponseModelState.Failed;
    }
    return state;
  }
  get stateT() {
    return this._modelState.get();
  }
  get vote() {
    return this._vote;
  }
  get followups() {
    return this._followups;
  }
  get entireResponse() {
    return this._finalizedResponse || this._response;
  }
  get result() {
    return this._result;
  }
  get usage() {
    return this._usageObs.get();
  }
  get usageObs() {
    return this._usageObs;
  }
  get completionTokenCount() {
    return this._completionTokenCountObs.get();
  }
  get completionTokenCountObs() {
    return this._completionTokenCountObs;
  }
  get elapsedMs() {
    return this._elapsedMs;
  }
  get username() {
    return this.session.responderUsername;
  }
  get agent() {
    return this._agent;
  }
  get slashCommand() {
    return this._slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._agentOrSlashCommandDetected ?? false;
  }
  get usedContext() {
    return this._usedContext;
  }
  get contentReferences() {
    return Array.from(this._contentReferences);
  }
  get codeCitations() {
    return this._codeCitations;
  }
  get progressMessages() {
    return this._progressMessages;
  }
  get isStale() {
    return this._isStale;
  }
  get response() {
    const undoStop = this._shouldBeRemovedOnSend?.afterUndoStop;
    if (!undoStop) {
      return this._finalizedResponse || this._response;
    }
    if (this._responseView?.undoStop !== undoStop) {
      this._responseView = new ResponseView(this._response, undoStop);
    }
    return this._responseView;
  }
  get codeBlockInfos() {
    return this._codeBlockInfos;
  }
  initializeCodeBlockInfos(codeBlockInfo) {
    if (this._codeBlockInfos) {
      throw new BugIndicatingError("Code block infos have already been initialized");
    }
    this._codeBlockInfos = [...codeBlockInfo];
  }
  setBlockedState(isBlocked) {
    this._shouldBeBlocked.set(isBlocked, void 0);
  }
  /**
   * Apply a progress update to the actual response content.
   */
  updateContent(responsePart, quiet) {
    this._response.updateContent(responsePart, quiet);
  }
  resolveInlineReference(resolveId, resolvedReference) {
    return this._response.resolveInlineReference(resolveId, resolvedReference);
  }
  /**
   * Adds an undo stop at the current position in the stream.
   */
  addUndoStop(undoStop) {
    this._onDidChange.fire({ reason: "undoStop", id: undoStop.id });
    this._response.updateContent(undoStop, true);
  }
  /**
   * Apply one of the progress updates that are not part of the actual response content.
   */
  applyReference(progress) {
    if (progress.kind === "usedContext") {
      this._usedContext = progress;
    } else if (progress.kind === "reference") {
      this._contentReferences.push(progress);
      this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
  }
  applyCodeCitation(progress) {
    this._codeCitations.push(progress);
    this._response.addCitation(progress);
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setAgent(agent, slashCommand) {
    this._agent = agent;
    this._slashCommand = slashCommand;
    this._agentOrSlashCommandDetected = !agent.isDefault || !!slashCommand;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setResult(result) {
    if (this.isCanceled && result.errorDetails) {
      const { errorDetails: _errorDetails, ...rest } = result;
      this._result = rest;
    } else {
      this._result = result;
    }
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setUsage(usage) {
    this._parentUsage = usage;
    this._setUsage(this._withSubagentCopilotCredits(usage), true);
  }
  setSubagentCopilotCredits(subagentCallId, copilotCredits) {
    const currentCredits = this._subagentCopilotCredits.get(subagentCallId);
    if (!Number.isFinite(copilotCredits) || copilotCredits < 0 || currentCredits !== void 0 && copilotCredits <= currentCredits) {
      return;
    }
    this._subagentCopilotCredits.set(subagentCallId, copilotCredits);
    const usage = this._parentUsage ?? { kind: "usage", promptTokens: 0, completionTokens: 0 };
    this._setUsage(this._withSubagentCopilotCredits(usage), false);
  }
  _withSubagentCopilotCredits(usage) {
    let subagentCopilotCredits = 0;
    for (const credits of this._subagentCopilotCredits.values()) {
      subagentCopilotCredits += credits;
    }
    return subagentCopilotCredits === 0 ? usage : { ...usage, copilotCredits: (usage.copilotCredits ?? 0) + subagentCopilotCredits };
  }
  _setUsage(usage, countCompletionTokens) {
    const currentUsage = this._usageObs.get();
    if (currentUsage && this.isSameUsage(currentUsage, usage)) {
      return;
    }
    const isNewCall = !currentUsage || currentUsage.promptTokens !== usage.promptTokens || currentUsage.completionTokens !== usage.completionTokens || currentUsage.outputBuffer !== usage.outputBuffer;
    this._usageObs.set(usage, void 0);
    if (countCompletionTokens && isNewCall) {
      const previousCompletionTokens = this._completionTokenCountObs.get() ?? 0;
      this._completionTokenCountObs.set(previousCompletionTokens + usage.completionTokens, void 0);
    }
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setElapsedMs(elapsedMs) {
    this._elapsedMs = Math.max(0, elapsedMs);
  }
  isSameUsage(currentUsage, usage) {
    return currentUsage.promptTokens === usage.promptTokens && currentUsage.completionTokens === usage.completionTokens && currentUsage.outputBuffer === usage.outputBuffer && currentUsage.copilotCredits === usage.copilotCredits && currentUsage.sessionCopilotCredits === usage.sessionCopilotCredits && equals(currentUsage.promptTokenDetails, usage.promptTokenDetails);
  }
  complete(completedAt = Date.now()) {
    this._complete(completedAt, completedAt);
  }
  completeWithoutTimestamp() {
    this._complete(Date.now(), void 0);
  }
  _complete(completedAt, completionTimestamp) {
    if (this.isComplete) {
      return;
    }
    if (this._result?.errorDetails?.responseIsRedacted) {
      this._response.clear();
    }
    this._response.finalizeReasoningDuration();
    this._elapsedMs ??= Math.max(0, completedAt - this.confirmationAdjustedTimestamp.get());
    const state = !!this._result?.errorDetails && this._result.errorDetails.code !== "canceled" ? ResponseModelState.Failed : ResponseModelState.Complete;
    this._completionTimestamp = completionTimestamp;
    this._modelState.set({ value: state, completedAt }, void 0);
    this._onDidChange.fire({ reason: "completedRequest" });
  }
  cancel() {
    this._response.finalizeReasoningDuration();
    for (const part of this._response.value) {
      if (part.kind === "toolInvocation" && part instanceof ChatToolInvocation) {
        part.cancelFromStreaming(ToolConfirmKind.Skipped);
      } else if (part instanceof ChatPlanReviewData) {
        part.dismiss();
      } else if (part instanceof ChatQuestionCarouselData) {
        part.dismiss(void 0);
      }
    }
    const completedAt = Date.now();
    this._elapsedMs ??= Math.max(0, completedAt - this.confirmationAdjustedTimestamp.get());
    this._completionTimestamp = completedAt;
    this._modelState.set({ value: ResponseModelState.Cancelled, completedAt }, void 0);
    this._onDidChange.fire({ reason: "completedRequest" });
  }
  setFollowups(followups) {
    this._followups = followups;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setVote(vote) {
    this._vote = vote;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setEditApplied(edit, editCount) {
    if (!this.response.value.includes(edit)) {
      return false;
    }
    if (!edit.state) {
      return false;
    }
    edit.state.applied = editCount;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
    return true;
  }
  adoptTo(session) {
    this._session = session;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  finalizeUndoState() {
    this._finalizedResponse = this.response;
    this._responseView = void 0;
    this._shouldBeRemovedOnSend = void 0;
  }
  dispose() {
    super.dispose();
    this._response.clear();
    if (this._codeBlockInfos) {
      this._codeBlockInfos.length = 0;
    }
  }
  toJSON() {
    const modelState = this._modelState.get();
    const pendingConfirmation = this.isPendingConfirmation.get();
    return {
      responseId: this.id,
      result: this.result,
      responseMarkdownInfo: this.codeBlockInfos?.map((info) => ({ suggestionId: info.suggestionId })),
      followups: this.followups,
      modelState: modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput ? { value: ResponseModelState.Cancelled, completedAt: Date.now() } : modelState,
      vote: this.vote,
      slashCommand: this.slashCommand,
      usedContext: this.usedContext,
      contentReferences: this.contentReferences,
      codeCitations: this.codeCitations,
      responseTimestamp: this._timestamp,
      timeSpentWaiting: (pendingConfirmation ? Date.now() - pendingConfirmation.startedWaitingAt : 0) + this._timeSpentWaitingAccumulator,
      promptTokens: this.usage?.promptTokens,
      completionTokens: this.completionTokenCount,
      outputBuffer: this.usage?.outputBuffer,
      promptTokenDetails: this.usage?.promptTokenDetails,
      copilotCredits: this.usage?.copilotCredits,
      sessionCopilotCredits: this.usage?.sessionCopilotCredits,
      elapsedMs: this.elapsedMs ?? (this.completedAt ? Math.max(0, this.completedAt - this.confirmationAdjustedTimestamp.get()) : void 0)
    };
  }
}
var ChatInputStateOrigin = /* @__PURE__ */ ((ChatInputStateOrigin2) => {
  ChatInputStateOrigin2["Remote"] = "remote";
  return ChatInputStateOrigin2;
})(ChatInputStateOrigin || {});
function reviveSerializableInputState(state) {
  return {
    attachments: (state.attachments ?? []).map(IChatRequestVariableEntry.fromExport),
    mode: state.mode,
    selectedModel: state.selectedModel && {
      identifier: state.selectedModel.identifier,
      metadata: state.selectedModel.metadata
    },
    modelConfiguration: state.selectedModel ? state.selectedModel.modelConfiguration ?? state.modelConfiguration : void 0,
    contrib: state.contrib,
    inputText: state.inputText,
    selections: state.selections,
    permissionLevel: state.permissionLevel
  };
}
function normalizeSerializableChatData(raw) {
  normalizeOldFields(raw);
  if (!("version" in raw)) {
    return {
      version: 3,
      ...raw,
      customTitle: void 0
    };
  }
  if (raw.version === 2) {
    return {
      ...raw,
      version: 3,
      customTitle: raw.computedTitle
    };
  }
  return raw;
}
function normalizeOldFields(raw) {
  if (!raw.sessionId) {
    raw.sessionId = generateUuid();
  }
  if (!raw.creationDate) {
    raw.creationDate = getLastYearDate();
  }
  if (raw.initialLocation === "editing-session") {
    raw.initialLocation = ChatAgentLocation.Chat;
  }
}
function getLastYearDate() {
  const lastYearDate = /* @__PURE__ */ new Date();
  lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
  return lastYearDate.getTime();
}
function isExportableSessionData(obj) {
  return !!obj && Array.isArray(obj.requests) && typeof obj.responderUsername === "string";
}
function isSerializableSessionData(obj) {
  const data = obj;
  return isExportableSessionData(obj) && typeof data.creationDate === "number" && typeof data.sessionId === "string" && obj.requests.every(
    (request) => !request.usedContext || isIUsedContext(request.usedContext)
  );
}
var ChatRequestRemovalReason = /* @__PURE__ */ ((ChatRequestRemovalReason2) => {
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Removal"] = 0] = "Removal";
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Resend"] = 1] = "Resend";
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Adoption"] = 2] = "Adoption";
  return ChatRequestRemovalReason2;
})(ChatRequestRemovalReason || {});
class InputModel {
  constructor(initialState, logger, sessionId) {
    this.logger = logger;
    this.sessionId = sessionId;
    this._state = observableValueOpts({ debugName: "inputModelState", equalsFn: equals }, initialState);
    this.state = this._state;
  }
  setState(state) {
    const current = this._state.get();
    _logChangesToStateModel(state, current, this.logger, this.sessionId);
    this._state.set({
      // If current is undefined, provide defaults for required fields
      attachments: [],
      mode: { id: "agent", kind: ChatModeKind.Agent },
      selectedModel: void 0,
      inputText: "",
      selections: [],
      contrib: {},
      ...current,
      ...state,
      origin: state.origin
    }, void 0);
  }
  clearState() {
    this._state.set(void 0, void 0);
  }
  toJSON() {
    const value = this.state.get();
    if (!value) {
      return void 0;
    }
    const persistableAttachments = value.attachments.filter((attachment) => {
      if (isStringVariableEntry(attachment)) {
        return false;
      }
      if (isImplicitVariableEntry(attachment) && isStringImplicitContextValue(attachment.value)) {
        return false;
      }
      return true;
    });
    return {
      contrib: value.contrib,
      attachments: persistableAttachments.map(IChatRequestVariableEntry.toExport),
      mode: value.mode,
      selectedModel: value.selectedModel ? {
        identifier: value.selectedModel.identifier,
        metadata: value.selectedModel.metadata,
        modelConfiguration: value.modelConfiguration
      } : void 0,
      inputText: value.inputText,
      selections: value.selections,
      permissionLevel: value.permissionLevel
    };
  }
}
let ChatModel = class extends Disposable {
  constructor(dataRef, initialModelProps, logService, chatAgentService, chatEditingService, chatService) {
    super();
    this.logService = logService;
    this.chatAgentService = chatAgentService;
    this.chatEditingService = chatEditingService;
    this.chatService = chatService;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._pendingRequests = [];
    this._onDidChangePendingRequests = this._register(new Emitter());
    this.onDidChangePendingRequests = this._onDidChangePendingRequests.event;
    this._isImported = false;
    this._isDeleted = false;
    this._canUseTools = true;
    this.currentEditedFileEvents = new ResourceMap();
    this._checkpoint = void 0;
    const initialData = dataRef?.value;
    const isValidExportedData = isExportableSessionData(initialData);
    const isValidFullData = isValidExportedData && isSerializableSessionData(initialData);
    if (initialData && !isValidExportedData) {
      this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
    }
    this._isImported = !!initialData && isValidExportedData && !isValidFullData;
    if (initialModelProps.resource) {
      this._sessionId = chatSessionResourceToId(initialModelProps.resource);
      this._sessionResource = initialModelProps.resource;
    } else if (isValidFullData) {
      this._sessionId = initialData.sessionId;
      this._sessionResource = LocalChatSessionUri.forSession(initialData.sessionId);
    } else {
      this._sessionId = generateUuid();
      this._sessionResource = LocalChatSessionUri.forSession(this._sessionId);
    }
    this._disableBackgroundKeepAlive = initialModelProps.disableBackgroundKeepAlive ?? false;
    this._timestamp = isValidFullData && initialData.creationDate || Date.now();
    this._requests = initialData ? this._deserialize(initialData) : [];
    this._customTitle = isValidFullData ? initialData.customTitle : void 0;
    const serializedInputState = initialModelProps.inputState || (isValidFullData && initialData.inputState ? initialData.inputState : void 0);
    this.inputModel = new InputModel(serializedInputState && reviveSerializableInputState(serializedInputState), this.logService, this._sessionId);
    this.dataSerializer = dataRef?.serializer;
    this._initialResponderUsername = initialData?.responderUsername;
    this._repoData = isValidFullData && initialData.repoData ? initialData.repoData : void 0;
    this._workingDirectory = isValidFullData && initialData.workingDirectory ? URI.parse(initialData.workingDirectory) : void 0;
    if (isValidFullData && initialData.pendingRequests) {
      this._pendingRequests = this._deserializePendingRequests(initialData.pendingRequests);
    }
    this._initialLocation = initialData?.initialLocation ?? initialModelProps.initialLocation;
    this._canUseTools = initialModelProps.canUseTools;
    this.isReadOnly = initialModelProps.isReadOnly ?? constObservable(false);
    this.lastRequestObs = observableFromEvent(this, this.onDidChange, () => this._requests.at(-1));
    this._register(autorun((reader) => {
      const request = this.lastRequestObs.read(reader);
      if (!request?.response) {
        return;
      }
      reader.store.add(request.response.onDidChange(async (ev) => {
        if (!this._editingSession || ev.reason !== "completedRequest") {
          return;
        }
        this._onDidChange.fire({ kind: "completedRequest", request });
      }));
    }));
    this.requestInProgress = this.lastRequestObs.map((request, r) => {
      return request?.response?.isInProgress.read(r) ?? false;
    });
    this.hasActiveRequest = this.lastRequestObs.map((request, r) => {
      return request?.response?.isIncomplete.read(r) ?? false;
    });
    this.requestNeedsInput = this.lastRequestObs.map((request, r) => {
      const pendingInfo = request?.response?.isPendingConfirmation.read(r);
      if (!pendingInfo) {
        return void 0;
      }
      return {
        title: this.title,
        detail: pendingInfo.detail
      };
    });
    if (this.initialLocation === ChatAgentLocation.Chat && !initialModelProps.disableBackgroundKeepAlive) {
      const selfRef = this._register(new MutableDisposable());
      this._register(autorun((r) => {
        const inProgress = this.requestInProgress.read(r);
        const needsInput = this.requestNeedsInput.read(r);
        const shouldStayAlive = inProgress || !!needsInput;
        if (shouldStayAlive && !selfRef.value) {
          selfRef.value = chatService.acquireExistingSession(this._sessionResource, "ChatModel#requestInProgressKeepAlive");
        } else if (!shouldStayAlive && selfRef.value) {
          selfRef.clear();
        }
      }));
    }
  }
  static getDefaultTitle(requests) {
    const firstRequestMessage = requests.at(0)?.message ?? "";
    const message = typeof firstRequestMessage === "string" ? firstRequestMessage : firstRequestMessage.text;
    return message.split("\n")[0].substring(0, 200);
  }
  get repoData() {
    return this._repoData;
  }
  setRepoData(data) {
    this._repoData = data;
  }
  get workingDirectory() {
    return this._workingDirectory;
  }
  setWorkingDirectory(uri) {
    this._workingDirectory = uri;
  }
  getPendingRequests() {
    return this._pendingRequests;
  }
  setPendingRequests(requests) {
    const existingMap = new Map(this._pendingRequests.map((p) => [p.request.id, p]));
    const newPending = [];
    for (const { requestId, kind } of requests) {
      const existing = existingMap.get(requestId);
      if (existing) {
        newPending.push(existing.kind === kind ? existing : { request: existing.request, kind, sendOptions: existing.sendOptions });
      }
    }
    this._pendingRequests.length = 0;
    this._pendingRequests.push(...newPending);
    this._onDidChangePendingRequests.fire();
  }
  /**
   * @internal Used by ChatService to atomically replace the pending request queue.
   */
  replacePendingRequests(requests) {
    if (this._pendingRequests.length === requests.length && requests.every((request, index) => this._pendingRequests[index] === request)) {
      return;
    }
    this._pendingRequests.length = 0;
    this._pendingRequests.push(...requests);
    this._onDidChangePendingRequests.fire();
  }
  /**
   * @internal Used by ChatService to add a request to the queue.
   * Steering messages are placed before queued messages.
   */
  addPendingRequest(request, kind, sendOptions) {
    const pendingRequest = {
      request,
      kind,
      sendOptions
    };
    if (kind === ChatRequestQueueKind.Steering) {
      let insertIndex = 0;
      for (let i = 0; i < this._pendingRequests.length; i++) {
        if (this._pendingRequests[i].kind === ChatRequestQueueKind.Steering) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }
      this._pendingRequests.splice(insertIndex, 0, pendingRequest);
    } else {
      this._pendingRequests.push(pendingRequest);
    }
    this._onDidChangePendingRequests.fire();
    return pendingRequest;
  }
  /**
   * @internal Used by ChatService to remove a pending request
   */
  removePendingRequest(id) {
    const index = this._pendingRequests.findIndex((r) => r.request.id === id);
    if (index !== -1) {
      this._pendingRequests.splice(index, 1);
      this._onDidChangePendingRequests.fire();
    }
  }
  /**
   * @internal Used by ChatService to dequeue the next pending request
   */
  dequeuePendingRequest() {
    const request = this._pendingRequests.shift();
    if (request) {
      this._onDidChangePendingRequests.fire();
    }
    return request;
  }
  /**
   * @internal Used by ChatService to dequeue all consecutive steering requests at the front of the queue.
   * Returns an empty array if the first pending request is not a steering request.
   */
  dequeueAllSteeringRequests() {
    const steeringRequests = [];
    while (this._pendingRequests.at(0)?.kind === ChatRequestQueueKind.Steering) {
      steeringRequests.push(this._pendingRequests.shift());
    }
    if (steeringRequests.length > 0) {
      this._onDidChangePendingRequests.fire();
    }
    return steeringRequests;
  }
  /**
   * @internal Used by ChatService to clear all pending requests
   */
  clearPendingRequests() {
    if (this._pendingRequests.length > 0) {
      this._pendingRequests.length = 0;
      this._onDidChangePendingRequests.fire();
    }
  }
  /** @deprecated Use {@link sessionResource} instead */
  get sessionId() {
    return this._sessionId;
  }
  get sessionResource() {
    return this._sessionResource;
  }
  get hasRequests() {
    return this._requests.length > 0;
  }
  get lastRequest() {
    return this._requests.at(-1);
  }
  get sessionCost() {
    let summedCredits = 0;
    let reportedSessionCredits = 0;
    for (const request of this._requests) {
      const usage = request.response?.usage;
      if (typeof usage?.copilotCredits === "number") {
        summedCredits += usage.copilotCredits;
      }
      if (typeof usage?.sessionCopilotCredits === "number") {
        reportedSessionCredits = Math.max(reportedSessionCredits, usage.sessionCopilotCredits);
      }
    }
    return Math.max(summedCredits, reportedSessionCredits);
  }
  get timestamp() {
    return this._timestamp;
  }
  get timing() {
    const lastRequest = this._requests.at(-1);
    const lastResponse = lastRequest?.response;
    const lastRequestStarted = lastRequest?.timestamp;
    const lastRequestEnded = lastResponse?.completedAt ?? lastResponse?.timestamp;
    return {
      created: this._timestamp,
      lastRequestStarted,
      lastRequestEnded
    };
  }
  get lastMessageDate() {
    return this._requests.at(-1)?.timestamp ?? this._timestamp;
  }
  get _defaultAgent() {
    return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Ask);
  }
  get responderUsername() {
    return this._defaultAgent?.fullName ?? this._initialResponderUsername ?? "";
  }
  get isImported() {
    return this._isImported;
  }
  get isDeleted() {
    return this._isDeleted;
  }
  markDeleted() {
    this._isDeleted = true;
  }
  get customTitle() {
    return this._customTitle;
  }
  get title() {
    return this._customTitle || ChatModel.getDefaultTitle(this._requests);
  }
  get hasCustomTitle() {
    return this._customTitle !== void 0;
  }
  get editingSession() {
    return this._editingSession;
  }
  get initialLocation() {
    return this._initialLocation;
  }
  get canUseTools() {
    return this._canUseTools;
  }
  get willKeepAlive() {
    return !this._disableBackgroundKeepAlive;
  }
  startEditingSession(isGlobalEditingSession, transferFromSession) {
    const session = this._editingSession ??= this._register(
      transferFromSession ? this.chatEditingService.transferEditingSession(this, transferFromSession) : isGlobalEditingSession ? this.chatEditingService.startOrContinueGlobalEditingSession(this) : this.chatEditingService.createEditingSession(this)
    );
    if (!this._disableBackgroundKeepAlive) {
      const selfRef = this._register(new MutableDisposable());
      this._register(autorun((r) => {
        const hasModified = session.entries.read(r).some((e) => e.state.read(r) === ModifiedFileEntryState.Modified);
        if (hasModified && !selfRef.value) {
          selfRef.value = this.chatService.acquireExistingSession(this._sessionResource, "ChatModel#modifiedEditsKeepAlive");
        } else if (!hasModified && selfRef.value) {
          selfRef.clear();
        }
      }));
    }
    this._register(autorun((reader) => {
      this._setDisabledRequests(session.requestDisablement.read(reader));
    }));
  }
  notifyEditingAction(action) {
    const state = action.outcome === "accepted" ? 1 /* Keep */ : action.outcome === "rejected" ? 2 /* Undo */ : action.outcome === "userModified" ? 3 /* UserModification */ : null;
    if (state === null) {
      return;
    }
    if (!this.currentEditedFileEvents.has(action.uri) || this.currentEditedFileEvents.get(action.uri)?.eventKind === 1 /* Keep */) {
      this.currentEditedFileEvents.set(action.uri, { eventKind: state, uri: action.uri });
    }
  }
  _deserialize(obj) {
    const requests = hasKey(obj, { serializer: true }) ? obj.value.requests : obj.requests;
    if (!Array.isArray(requests)) {
      this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
      return [];
    }
    try {
      return requests.map((r) => this._deserializeRequest(r));
    } catch (error) {
      this.logService.error("Failed to parse chat data", error);
      return [];
    }
  }
  _deserializeRequest(raw) {
    const parsedRequest = typeof raw.message === "string" ? this.getParsedRequestFromString(raw.message) : reviveParsedChatRequest(raw.message);
    const variableData = this.reviveVariableData(raw.variableData);
    const requestTimestamp = typeof raw.timestamp === "number" && raw.timestamp > 0 ? raw.timestamp : void 0;
    const request = new ChatRequestModel({
      session: this,
      message: parsedRequest,
      variableData,
      timestamp: requestTimestamp,
      fallbackTimestamp: this._timestamp,
      restoredId: raw.requestId,
      confirmation: raw.confirmation,
      editedFileEvents: raw.editedFileEvents,
      modelId: raw.modelId,
      modeInfo: raw.modeInfo,
      isSystemInitiated: raw.isSystemInitiated,
      systemInitiatedLabel: raw.systemInitiatedLabel,
      terminalExecutionId: raw.terminalExecutionId
    });
    request.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
    if (raw.response || raw.result || raw.responseErrorDetails) {
      const agent = raw.agent && "metadata" in raw.agent ? (
        // Check for the new format, ignore entries in the old format
        reviveSerializedAgent(raw.agent)
      ) : void 0;
      const result = "responseErrorDetails" in raw ? (
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        { errorDetails: raw.responseErrorDetails }
      ) : raw.result;
      let modelState = raw.modelState || { value: raw.isCanceled ? ResponseModelState.Cancelled : ResponseModelState.Complete, completedAt: Date.now() };
      if (modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput) {
        modelState = { value: ResponseModelState.Cancelled, completedAt: Date.now() };
      }
      if (raw.response) {
        for (const part of raw.response) {
          if (hasKey(part, { kind: true }) && (part.kind === "questionCarousel" || part.kind === "planReview")) {
            part.isUsed = true;
          }
        }
      }
      request.response = new ChatResponseModel({
        responseContent: raw.response ?? [new MarkdownString(raw.response)],
        session: this,
        agent,
        slashCommand: raw.slashCommand,
        requestId: request.id,
        modelState,
        completionTimestamp: raw.modelState && "completedAt" in raw.modelState && Number.isFinite(raw.modelState.completedAt) && raw.modelState.completedAt > 0 ? raw.modelState.completedAt : null,
        vote: raw.vote,
        timestamp: typeof raw.responseTimestamp === "number" && raw.responseTimestamp > 0 ? raw.responseTimestamp : requestTimestamp,
        result,
        followups: raw.followups,
        restoredId: raw.responseId,
        timeSpentWaiting: raw.timeSpentWaiting,
        elapsedMs: raw.elapsedMs,
        shouldBeBlocked: request.shouldBeBlocked.get(),
        codeBlockInfos: raw.responseMarkdownInfo?.map((info) => ({ suggestionId: info.suggestionId }))
      });
      request.response.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
      if (typeof raw.completionTokens === "number" || typeof raw.promptTokens === "number" || typeof raw.copilotCredits === "number" || typeof raw.sessionCopilotCredits === "number") {
        request.response.setUsage({
          kind: "usage",
          promptTokens: raw.promptTokens ?? 0,
          completionTokens: raw.completionTokens ?? 0,
          outputBuffer: raw.outputBuffer,
          promptTokenDetails: raw.promptTokenDetails,
          copilotCredits: raw.copilotCredits,
          sessionCopilotCredits: raw.sessionCopilotCredits
        });
      }
      if (raw.usedContext) {
        request.response.applyReference(revive(raw.usedContext));
      }
      raw.contentReferences?.forEach((r) => request.response.applyReference(revive(r)));
      raw.codeCitations?.forEach((c) => request.response.applyCodeCitation(revive(c)));
    }
    return request;
  }
  reviveVariableData(raw) {
    const variableData = raw && Array.isArray(raw.variables) ? raw : { variables: [] };
    variableData.variables = variableData.variables.map(IChatRequestVariableEntry.fromExport);
    return variableData;
  }
  getParsedRequestFromString(message) {
    const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
    return {
      text: message,
      parts
    };
  }
  /**
   * Hydrates pending requests from serialized data.
   * For each serialized pending request, finds the matching request model and adds it to the pending queue.
   */
  _deserializePendingRequests(pendingRequests) {
    try {
      return pendingRequests.map((pending) => ({
        id: pending.id,
        request: this._deserializeRequest(pending.request),
        kind: pending.kind,
        sendOptions: {
          ...pending.sendOptions,
          userSelectedTools: pending.sendOptions.userSelectedTools ? constObservable(pending.sendOptions.userSelectedTools) : void 0
        }
      }));
    } catch (e) {
      this.logService.error("Failed to parse pending chat requests", e);
      return [];
    }
  }
  getRequests() {
    return this._requests;
  }
  resetCheckpoint() {
    for (const request of this._requests) {
      request.setShouldBeBlocked(false);
      if (request.response) {
        request.response.setBlockedState(false);
      }
    }
  }
  setCheckpoint(requestId) {
    let checkpoint;
    let checkpointIndex = -1;
    if (requestId !== void 0) {
      this._requests.forEach((request, index) => {
        if (request.id === requestId) {
          checkpointIndex = index;
          checkpoint = request;
          request.setShouldBeBlocked(true);
        }
      });
      if (!checkpoint) {
        return;
      }
    }
    for (let i = this._requests.length - 1; i >= 0; i -= 1) {
      const request = this._requests[i];
      if (this._checkpoint && !checkpoint) {
        request.setShouldBeBlocked(false);
        if (request.response) {
          request.response.setBlockedState(false);
        }
      } else if (checkpoint && i >= checkpointIndex) {
        request.setShouldBeBlocked(true);
        if (request.response) {
          request.response.setBlockedState(true);
        }
      } else if (checkpoint && i < checkpointIndex) {
        request.setShouldBeBlocked(false);
        if (request.response) {
          request.response.setBlockedState(false);
        }
      }
    }
    this._checkpoint = checkpoint;
  }
  get checkpoint() {
    return this._checkpoint;
  }
  _setDisabledRequests(requestIds) {
    this._requests.forEach((request) => {
      const shouldBeRemovedOnSend = requestIds.find((r) => r.requestId === request.id);
      request.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
      if (request.response) {
        request.response.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
      }
    });
    this._onDidChange.fire({ kind: "setHidden" });
  }
  addRequest(message, variableData, attempt, modeInfo, chatAgent, slashCommand, confirmation, locationData, attachments, isCompleteAddedRequest, modelId, userSelectedTools, id, isSystemInitiated, systemInitiatedLabel, terminalExecutionId, isTerminalCommand, timestamp) {
    const editedFileEvents = [...this.currentEditedFileEvents.values()];
    this.currentEditedFileEvents.clear();
    const requestTimestamp = timestamp === void 0 ? Date.now() : typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : void 0;
    const request = new ChatRequestModel({
      restoredId: id,
      session: this,
      message,
      variableData,
      timestamp: requestTimestamp,
      fallbackTimestamp: this._timestamp,
      attempt,
      modeInfo,
      confirmation,
      locationData,
      attachedContext: attachments,
      isCompleteAddedRequest,
      modelId,
      editedFileEvents: editedFileEvents.length ? editedFileEvents : void 0,
      userSelectedTools,
      isSystemInitiated,
      systemInitiatedLabel,
      terminalExecutionId,
      isTerminalCommand
    });
    request.response = new ChatResponseModel({
      responseContent: [],
      session: this,
      agent: chatAgent,
      slashCommand,
      requestId: request.id,
      isCompleteAddedRequest,
      codeBlockInfos: void 0
    });
    this._requests.push(request);
    markChat(this.sessionResource, ChatPerfMark.RequestUiUpdated);
    this._onDidChange.fire({ kind: "addRequest", request });
    return request;
  }
  setCustomTitle(title) {
    this._customTitle = title;
    this._onDidChange.fire({ kind: "setCustomTitle", title });
  }
  updateRequest(request, variableData) {
    request.variableData = variableData;
    this._onDidChange.fire({ kind: "changedRequest", request });
  }
  adoptRequest(request) {
    const oldOwner = request.session;
    const index = oldOwner._requests.findIndex((candidate) => candidate.id === request.id);
    if (index === -1) {
      return;
    }
    oldOwner._requests.splice(index, 1);
    request.adoptTo(this);
    request.response?.adoptTo(this);
    this._requests.push(request);
    oldOwner._onDidChange.fire({ kind: "removeRequest", requestId: request.id, responseId: request.response?.id, reason: 2 /* Adoption */ });
    this._onDidChange.fire({ kind: "addRequest", request });
  }
  acceptResponseProgress(request, progress, quiet) {
    if (!request.response) {
      request.response = new ChatResponseModel({
        responseContent: [],
        session: this,
        requestId: request.id,
        codeBlockInfos: void 0
      });
    }
    if (request.response.isComplete) {
      throw new Error("acceptResponseProgress: Adding progress to a completed response");
    }
    if (progress.kind === "usage") {
      request.response.setUsage(progress);
    } else if (progress.kind === "usedContext" || progress.kind === "reference") {
      request.response.applyReference(progress);
    } else if (progress.kind === "codeCitation") {
      request.response.applyCodeCitation(progress);
    } else if (progress.kind === "move") {
      this._onDidChange.fire({ kind: "move", target: progress.uri, range: progress.range });
    } else if (progress.kind === "codeblockUri" && progress.isEdit) {
      request.response.addUndoStop({ id: progress.undoStopId ?? generateUuid(), kind: "undoStop" });
      request.response.updateContent(progress, quiet);
    } else if (progress.kind === "progressTaskResult") {
      this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
    } else {
      request.response.updateContent(progress, quiet);
    }
  }
  removeRequest(id, reason = 0 /* Removal */) {
    const index = this._requests.findIndex((request2) => request2.id === id);
    const request = this._requests[index];
    if (index !== -1) {
      this._onDidChange.fire({ kind: "removeRequest", requestId: request.id, responseId: request.response?.id, reason });
      this._requests.splice(index, 1);
      request.response?.dispose();
    }
  }
  cancelRequest(request) {
    if (request.response) {
      request.response.cancel();
    }
  }
  setResponse(request, result) {
    if (!request.response) {
      request.response = new ChatResponseModel({
        responseContent: [],
        session: this,
        requestId: request.id,
        codeBlockInfos: void 0
      });
    }
    request.response.setResult(result);
  }
  setFollowups(request, followups) {
    if (!request.response) {
      return;
    }
    request.response.setFollowups(followups);
  }
  setResponseModel(request, response) {
    request.response = response;
    this._onDidChange.fire({ kind: "addResponse", response });
  }
  toExport() {
    return {
      responderUsername: this.responderUsername,
      initialLocation: this.initialLocation,
      requests: this._requests.map((r) => {
        const message = {
          ...r.message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parts: r.message.parts.map((p) => p && "toJSON" in p ? p.toJSON() : p)
        };
        const agent = r.response?.agent;
        const agentJson = agent && "toJSON" in agent ? agent.toJSON() : agent ? { ...agent } : void 0;
        return {
          requestId: r.id,
          message,
          variableData: IChatRequestVariableData.toExport(r.variableData),
          response: r.response ? r.response.entireResponse.value.filter((item) => item.kind !== "voiceProgress").map((item) => {
            if (item.kind === "treeData") {
              return item.treeData;
            } else if (item.kind === "markdownContent") {
              return item.content;
            } else {
              return item;
            }
          }) : void 0,
          shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
          agent: agentJson,
          timestamp: r.requestTimestamp,
          confirmation: r.confirmation,
          editedFileEvents: r.editedFileEvents,
          modelId: r.modelId,
          modeInfo: r.modeInfo,
          isSystemInitiated: r.isSystemInitiated || void 0,
          systemInitiatedLabel: r.systemInitiatedLabel,
          terminalExecutionId: r.terminalExecutionId,
          ...r.response?.toJSON()
        };
      })
    };
  }
  toJSON() {
    return {
      version: 3,
      ...this.toExport(),
      sessionId: this.sessionId,
      creationDate: this._timestamp,
      customTitle: this._customTitle,
      inputState: this.inputModel.toJSON(),
      workingDirectory: this._workingDirectory?.toString()
    };
  }
  dispose() {
    this._requests.forEach((r) => r.response?.dispose());
    this._onDidDispose.fire();
    super.dispose();
    this._requests.length = 0;
    this.dataSerializer = void 0;
    this._editingSession = void 0;
  }
};
ChatModel = __decorateClass([
  __decorateParam(2, ILogService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, IChatEditingService),
  __decorateParam(5, IChatService)
], ChatModel);
function updateRanges(variableData, diff) {
  return {
    variables: variableData.variables.map((v) => ({
      ...v,
      range: v.range && {
        start: v.range.start - diff,
        endExclusive: v.range.endExclusive - diff
      }
    }))
  };
}
function canMergeMarkdownStrings(md1, md2) {
  if (md1.baseUri && md2.baseUri) {
    const baseUriEquals = md1.baseUri.scheme === md2.baseUri.scheme && md1.baseUri.authority === md2.baseUri.authority && md1.baseUri.path === md2.baseUri.path && md1.baseUri.query === md2.baseUri.query && md1.baseUri.fragment === md2.baseUri.fragment;
    if (!baseUriEquals) {
      return false;
    }
  } else if (md1.baseUri || md2.baseUri) {
    return false;
  }
  return equals(md1.isTrusted, md2.isTrusted) && md1.supportHtml === md2.supportHtml && md1.supportThemeIcons === md2.supportThemeIcons;
}
function appendMarkdownString(md1, md2) {
  const appendedValue = typeof md2 === "string" ? md2 : md2.value;
  return {
    value: md1.value + appendedValue,
    isTrusted: md1.isTrusted,
    supportThemeIcons: md1.supportThemeIcons,
    supportHtml: md1.supportHtml,
    baseUri: md1.baseUri
  };
}
function getCodeCitationsMessage(citations) {
  if (citations.length === 0) {
    return "";
  }
  const licenseTypes = citations.reduce((set, c) => set.add(c.license), /* @__PURE__ */ new Set());
  const label = licenseTypes.size === 1 ? localize("codeCitation", "Similar code found with 1 license type", licenseTypes.size) : localize("codeCitations", "Similar code found with {0} license types", licenseTypes.size);
  return label;
}
function serializeSendOptions(options) {
  return {
    modeInfo: options.modeInfo,
    userSelectedModelId: options.userSelectedModelId,
    userSelectedModelConfiguration: options.userSelectedModelConfiguration,
    userSelectedTools: options.userSelectedTools?.get(),
    location: options.location,
    locationData: options.locationData,
    attempt: options.attempt,
    noCommandDetection: options.noCommandDetection,
    isVoiceModeInput: options.isVoiceModeInput,
    agentId: options.agentId,
    agentIdSilent: options.agentIdSilent,
    slashCommand: options.slashCommand,
    confirmation: options.confirmation,
    isSystemInitiated: options.isSystemInitiated,
    systemInitiatedLabel: options.systemInitiatedLabel,
    terminalExecutionId: options.terminalExecutionId
  };
}
var ChatRequestEditedFileEventKind = /* @__PURE__ */ ((ChatRequestEditedFileEventKind2) => {
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Keep"] = 1] = "Keep";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Undo"] = 2] = "Undo";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["UserModification"] = 3] = "UserModification";
  return ChatRequestEditedFileEventKind2;
})(ChatRequestEditedFileEventKind || {});
var ChatResponseResource;
((ChatResponseResource2) => {
  ChatResponseResource2.scheme = "vscode-chat-response-resource";
  function createUri(sessionResource, toolCallId, index, basename2) {
    return URI.from({
      scheme: ChatResponseResource2.scheme,
      authority: encodeHex(VSBuffer.fromString(sessionResource.toString())),
      path: `/tool/${toolCallId}/${index}` + (basename2 ? `/${basename2}` : "")
    });
  }
  ChatResponseResource2.createUri = createUri;
  function parseUri(uri) {
    if (uri.scheme !== ChatResponseResource2.scheme) {
      return void 0;
    }
    const parts = uri.path.split("/");
    if (parts.length < 4) {
      return void 0;
    }
    const [, kind, toolCallId, index] = parts;
    if (kind !== "tool") {
      return void 0;
    }
    let sessionResource;
    try {
      sessionResource = URI.parse(decodeHex(uri.authority).toString());
    } catch (e) {
      if (e instanceof SyntaxError) {
        sessionResource = LocalChatSessionUri.forSession(uri.authority);
      } else {
        throw e;
      }
    }
    return {
      sessionResource,
      toolCallId,
      index: Number(index)
    };
  }
  ChatResponseResource2.parseUri = parseUri;
})(ChatResponseResource || (ChatResponseResource = {}));
function _logChangesToStateModel(newState, oldState, logger, sessionId) {
  if (!canLog(logger.getLevel(), LogLevel.Debug) || newState?.selectedModel?.identifier === oldState?.selectedModel?.identifier) {
    return;
  }
  const stack = new Error().stack;
  const message = `[ChatModelChanged] ChatModel Input State model changed: ${newState?.selectedModel?.identifier} (was: ${oldState?.selectedModel?.identifier}) in session ${sessionId} ${stack}`;
  logger.debug(message);
}
function logChangesToStateModel(model, message, newState, oldState, logger) {
  if (!canLog(logger.getLevel(), LogLevel.Debug)) {
    return;
  }
  message = [
    message,
    `model.selectedModel: ${model?.state.get()?.selectedModel?.identifier}`,
    `new state: ${newState?.selectedModel?.identifier}`,
    `old state: ${oldState?.selectedModel?.identifier}`,
    new Error().stack
  ].join(", ");
  logger.debug(`[ChatModelChanged] Chat Model Changed,${message}`);
}
export {
  CHAT_ATTACHABLE_IMAGE_MIME_TYPES,
  ChatInputStateOrigin,
  ChatModel,
  ChatRequestEditedFileEventKind,
  ChatRequestModel,
  ChatRequestRemovalReason,
  ChatResponseModel,
  ChatResponseResource,
  IChatRequestVariableData,
  Response,
  appendMarkdownString,
  canMergeMarkdownStrings,
  defaultChatResponseModelChangeReason,
  getAttachableImageExtension,
  getCodeCitationsMessage,
  isCellTextEditOperation,
  isCellTextEditOperationArray,
  isExportableSessionData,
  isSerializableSessionData,
  logChangesToStateModel,
  normalizeSerializableChatData,
  reviveSerializableInputState,
  serializeSendOptions,
  toChatHistoryContent,
  updateRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgc29mdEFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBkZWNvZGVIZXgsIGVuY29kZUhleCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgcmVnaXN0ZXJBdXRvcnVuU2VsZkRpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgV2l0aERlZmluZWRQcm9wcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpRHRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEVkaXRTdWdnZXN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY2FuTG9nLCBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJQ2VsbEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1wbGljaXRWYXJpYWJsZUVudHJ5LCBpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLCBpc1N0cmluZ1ZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRQZXJmTWFyaywgbWFya0NoYXQgfSBmcm9tICcuLi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLCBDaGF0UmVxdWVzdFF1ZXVlS2luZCwgQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24sIEVsaWNpdGF0aW9uU3RhdGUsIElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eSwgSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0LCBJQ2hhdENsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uLCBJQ2hhdENvZGVDaXRhdGlvbiwgSUNoYXRDb21tYW5kQnV0dG9uLCBJQ2hhdENvbmZpcm1hdGlvbiwgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlLCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UsIElDaGF0RGlzYWJsZWRDbGF1ZGVIb29rc1BhcnQsIElDaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb24sIElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0LCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFNlcmlhbGl6ZWQsIElDaGF0RXh0ZXJuYWxFZGl0LCBJQ2hhdEV4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUsIElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQsIElDaGF0Rm9sbG93dXAsIElDaGF0SG9va1BhcnQsIElDaGF0SW5mb01lc3NhZ2UsIElDaGF0TG9jYXRpb25EYXRhLCBJQ2hhdE1hcmtkb3duQ29udGVudCwgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZywgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTZXJpYWxpemVkLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3csIElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0TXVsdGlEaWZmRGF0YSwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCwgSUNoYXROb3RlYm9va0VkaXQsIElDaGF0UGxhblJldmlldywgSUNoYXRQcm9ncmVzcywgSUNoYXRQcm9ncmVzc01lc3NhZ2UsIElDaGF0UHVsbFJlcXVlc3RDb250ZW50LCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0LCBJQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NGaWxlVHJlZURhdGEsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCBJQ2hhdFNlcnZpY2UsIElDaGF0U2Vzc2lvblRpbWluZywgSUNoYXRTeXN0ZW1Ob3RpZmljYXRpb25QYXJ0LCBJQ2hhdFRhc2ssIElDaGF0VGFza1NlcmlhbGl6ZWQsIElDaGF0VGV4dEVkaXQsIElDaGF0VGhpbmtpbmdQYXJ0LCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgSUNoYXRUcmVlRGF0YSwgSUNoYXRVbmRvU3RvcCwgSUNoYXRVc2FnZSwgSUNoYXRVc2FnZVByb21wdFRva2VuRGV0YWlsLCBJQ2hhdFVzZWRDb250ZXh0LCBJQ2hhdFZvaWNlUHJvZ3Jlc3NQYXJ0LCBJQ2hhdFdhcm5pbmdNZXNzYWdlLCBJQ2hhdFdvcmtzcGFjZUVkaXQsIFJlc3BvbnNlTW9kZWxTdGF0ZSwgVG9vbENvbmZpcm1LaW5kLCBpc0lVc2VkQ29udGV4dCB9IGZyb20gJy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQsIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0VG9vbEludm9jYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UGxhblJldmlld0RhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIElUb29sRGF0YSB9IGZyb20gJy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50Q29tbWFuZCwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRSZXN1bHQsIElDaGF0QWdlbnRTZXJ2aWNlLCBVc2VyU2VsZWN0ZWRUb29scywgcmV2aXZlU2VyaWFsaXplZEFnZW50IH0gZnJvbSAnLi4vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUZXh0UGFydCwgSVBhcnNlZENoYXRSZXF1ZXN0LCByZXZpdmVQYXJzZWRDaGF0UmVxdWVzdCB9IGZyb20gJy4uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi9jaGF0VXJpLmpzJztcbmltcG9ydCB7IE9iamVjdE11dGF0aW9uTG9nIH0gZnJvbSAnLi9vYmplY3RNdXRhdGlvbkxvZy5qcyc7XG5cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgcXVldWVkIGNoYXQgcmVxdWVzdCB3YWl0aW5nIHRvIGJlIHByb2Nlc3NlZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFBlbmRpbmdSZXF1ZXN0IHtcblx0cmVhZG9ubHkgcmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWw7XG5cdHJlYWRvbmx5IGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kO1xuXHQvKipcblx0ICogVGhlIG9wdGlvbnMgdGhhdCB3ZXJlIHBhc3NlZCB0byBzZW5kUmVxdWVzdCB3aGVuIHRoaXMgcmVxdWVzdCB3YXMgcXVldWVkLlxuXHQgKiB1c2VyU2VsZWN0ZWRUb29scyBpcyBzbmFwc2hvdHRlZCB0byBhIHN0YXRpYyBvYnNlcnZhYmxlIGF0IHF1ZXVlIHRpbWUuXG5cdCAqL1xuXHRyZWFkb25seSBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnM7XG59XG5cbi8qKlxuICogU2VyaWFsaXphYmxlIHZlcnNpb24gb2YgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgZm9yIHBlbmRpbmcgcmVxdWVzdHMuXG4gKiBFeGNsdWRlcyBvYnNlcnZhYmxlcyBhbmQgbm9uLXNlcmlhbGl6YWJsZSBmaWVsZHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZVNlbmRPcHRpb25zIHtcblx0bW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbztcblx0dXNlclNlbGVjdGVkTW9kZWxJZD86IHN0cmluZztcblx0dXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdC8qKiBTdGF0aWMgc25hcHNob3Qgb2YgdXNlci1zZWxlY3RlZCB0b29scyAobm90IGFuIG9ic2VydmFibGUpICovXG5cdHVzZXJTZWxlY3RlZFRvb2xzPzogVXNlclNlbGVjdGVkVG9vbHM7XG5cdGxvY2F0aW9uPzogQ2hhdEFnZW50TG9jYXRpb247XG5cdGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRhdHRlbXB0PzogbnVtYmVyO1xuXHRub0NvbW1hbmREZXRlY3Rpb24/OiBib29sZWFuO1xuXHRpc1ZvaWNlTW9kZUlucHV0PzogYm9vbGVhbjtcblx0YWdlbnRJZD86IHN0cmluZztcblx0YWdlbnRJZFNpbGVudD86IHN0cmluZztcblx0c2xhc2hDb21tYW5kPzogc3RyaW5nO1xuXHRjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0c3lzdGVtSW5pdGlhdGVkTGFiZWw/OiBzdHJpbmc7XG5cdHRlcm1pbmFsRXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogU2VyaWFsaXphYmxlIHJlcHJlc2VudGF0aW9uIG9mIGEgcGVuZGluZyBjaGF0IHJlcXVlc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZVBlbmRpbmdSZXF1ZXN0RGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdHJlcXVlc3Q6IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGE7XG5cdGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kO1xuXHRzZW5kT3B0aW9uczogSVNlcmlhbGl6YWJsZVNlbmRPcHRpb25zO1xufVxuXG5leHBvcnQgY29uc3QgQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdHBuZzogJ2ltYWdlL3BuZycsXG5cdGpwZzogJ2ltYWdlL2pwZWcnLFxuXHRqcGVnOiAnaW1hZ2UvanBlZycsXG5cdGdpZjogJ2ltYWdlL2dpZicsXG5cdHdlYnA6ICdpbWFnZS93ZWJwJyxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdHRhY2hhYmxlSW1hZ2VFeHRlbnNpb24obWltZVR5cGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBPYmplY3QuZW50cmllcyhDSEFUX0FUVEFDSEFCTEVfSU1BR0VfTUlNRV9UWVBFUykuZmluZCgoW18sIHZhbHVlXSkgPT4gdmFsdWUgPT09IG1pbWVUeXBlKT8uWzBdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdHZhcmlhYmxlczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b0V4cG9ydChkYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEge1xuXHRcdHJldHVybiB7IHZhcmlhYmxlczogZGF0YS52YXJpYWJsZXMubWFwKElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9FeHBvcnQpIH07XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRyZWFkb25seSByZXF1ZXN0VGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbztcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUNoYXRNb2RlbDtcblx0cmVhZG9ubHkgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0O1xuXHRyZWFkb25seSBhdHRlbXB0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhO1xuXHRyZWFkb25seSBjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRyZWFkb25seSBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGVybWluYWxDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSByZXNwb25zZT86IElDaGF0UmVzcG9uc2VNb2RlbDtcblx0cmVhZG9ubHkgZWRpdGVkRmlsZUV2ZW50cz86IElDaGF0QWdlbnRFZGl0ZWRGaWxlRXZlbnRbXTtcblx0c2hvdWxkQmVSZW1vdmVkT25TZW5kOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2hvdWxkQmVCbG9ja2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0c2V0U2hvdWxkQmVCbG9ja2VkKHZhbHVlOiBib29sZWFuKTogdm9pZDtcblx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgdXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scztcblx0cmVhZG9ubHkgaXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgdGVybWluYWxFeGVjdXRpb25JZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUJsb2NrSW5mbyB7XG5cdHJlYWRvbmx5IHN1Z2dlc3Rpb25JZDogRWRpdFN1Z2dlc3Rpb25JZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFRleHRFZGl0R3JvdXBTdGF0ZSB7XG5cdHNoYTE6IHN0cmluZztcblx0YXBwbGllZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGV4dEVkaXRHcm91cCB7XG5cdHVyaTogVVJJO1xuXHRlZGl0czogVGV4dEVkaXRbXVtdO1xuXHRzdGF0ZT86IElDaGF0VGV4dEVkaXRHcm91cFN0YXRlO1xuXHRraW5kOiAndGV4dEVkaXRHcm91cCc7XG5cdGRvbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGlzRXh0ZXJuYWxFZGl0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2VsbFRleHRFZGl0T3BlcmF0aW9uKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSUNlbGxUZXh0RWRpdE9wZXJhdGlvbiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElDZWxsVGV4dEVkaXRPcGVyYXRpb247XG5cdHJldHVybiAhIWNhbmRpZGF0ZSAmJiAhIWNhbmRpZGF0ZS5lZGl0ICYmICEhY2FuZGlkYXRlLnVyaSAmJiBVUkkuaXNVcmkoY2FuZGlkYXRlLnVyaSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NlbGxUZXh0RWRpdE9wZXJhdGlvbkFycmF5KHZhbHVlOiBJQ2VsbFRleHRFZGl0T3BlcmF0aW9uW10gfCBJQ2VsbEVkaXRPcGVyYXRpb25bXSk6IHZhbHVlIGlzIElDZWxsVGV4dEVkaXRPcGVyYXRpb25bXSB7XG5cdHJldHVybiB2YWx1ZS5zb21lKGlzQ2VsbFRleHRFZGl0T3BlcmF0aW9uKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFRleHRFZGl0T3BlcmF0aW9uIHtcblx0ZWRpdDogVGV4dEVkaXQ7XG5cdHVyaTogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Tm90ZWJvb2tFZGl0R3JvdXAge1xuXHR1cmk6IFVSSTtcblx0ZWRpdHM6IChJQ2VsbFRleHRFZGl0T3BlcmF0aW9uW10gfCBJQ2VsbEVkaXRPcGVyYXRpb25bXSlbXTtcblx0c3RhdGU/OiBJQ2hhdFRleHRFZGl0R3JvdXBTdGF0ZTtcblx0a2luZDogJ25vdGVib29rRWRpdEdyb3VwJztcblx0ZG9uZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0aXNFeHRlcm5hbEVkaXQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFByb2dyZXNzIGtpbmRzIHRoYXQgYXJlIGluY2x1ZGVkIGluIHRoZSBoaXN0b3J5IG9mIGEgcmVzcG9uc2UuXG4gKiBFeGNsdWRlcyBcImludGVybmFsXCIgdHlwZXMgdGhhdCBhcmUgaW5jbHVkZWQgaW4gaGlzdG9yeS5cbiAqL1xuZXhwb3J0IHR5cGUgSUNoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnQgPVxuXHR8IElDaGF0TWFya2Rvd25Db250ZW50XG5cdHwgSUNoYXRBZ2VudE1hcmtkb3duQ29udGVudFdpdGhWdWxuZXJhYmlsaXR5XG5cdHwgSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnRcblx0fCBJQ2hhdFRyZWVEYXRhXG5cdHwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZFxuXHR8IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZVxuXHR8IElDaGF0UHJvZ3Jlc3NNZXNzYWdlXG5cdHwgSUNoYXRTeXN0ZW1Ob3RpZmljYXRpb25QYXJ0XG5cdHwgSUNoYXRDb21tYW5kQnV0dG9uXG5cdHwgSUNoYXRXYXJuaW5nTWVzc2FnZVxuXHR8IElDaGF0SW5mb01lc3NhZ2Vcblx0fCBJQ2hhdFRhc2tcblx0fCBJQ2hhdFRhc2tTZXJpYWxpemVkXG5cdHwgSUNoYXRUZXh0RWRpdEdyb3VwXG5cdHwgSUNoYXROb3RlYm9va0VkaXRHcm91cFxuXHR8IElDaGF0Q29uZmlybWF0aW9uXG5cdHwgSUNoYXRRdWVzdGlvbkNhcm91c2VsXG5cdHwgSUNoYXRQbGFuUmV2aWV3XG5cdHwgSUNoYXRFeHRlbnNpb25zQ29udGVudFxuXHR8IElDaGF0VGhpbmtpbmdQYXJ0XG5cdHwgSUNoYXRIb29rUGFydFxuXHR8IElDaGF0UHVsbFJlcXVlc3RDb250ZW50XG5cdHwgSUNoYXRXb3Jrc3BhY2VFZGl0XG5cdHwgSUNoYXRFeHRlcm5hbEVkaXRcblx0fCBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQ7XG5cbi8qKlxuICogXCJOb3JtYWxcIiBwcm9ncmVzcyBraW5kcyB0aGF0IGFyZSByZW5kZXJlZCBhcyBwYXJ0cyBvZiB0aGUgc3RyZWFtIG9mIGNvbnRlbnQuXG4gKi9cbmV4cG9ydCB0eXBlIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQgPVxuXHR8IElDaGF0UHJvZ3Jlc3NIaXN0b3J5UmVzcG9uc2VDb250ZW50XG5cdHwgSUNoYXRUb29sSW52b2NhdGlvblxuXHR8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkXG5cdHwgSUNoYXRNdWx0aURpZmZEYXRhXG5cdHwgSUNoYXRVbmRvU3RvcFxuXHR8IElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0XG5cdHwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3RTZXJpYWxpemVkXG5cdHwgSUNoYXRDbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvblxuXHR8IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nXG5cdHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTZXJpYWxpemVkXG5cdHwgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkXG5cdHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTbG93XG5cdHwgSUNoYXREaXNhYmxlZENsYXVkZUhvb2tzUGFydFxuXHR8IElDaGF0Vm9pY2VQcm9ncmVzc1BhcnQ7XG5cbmV4cG9ydCB0eXBlIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRTZXJpYWxpemVkID0gRXhjbHVkZTxJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50LFxuXHR8IElDaGF0VG9vbEludm9jYXRpb25cblx0fCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFxuXHR8IElDaGF0VGFza1xuXHR8IElDaGF0TXVsdGlEaWZmRGF0YVxuXHR8IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nXG5cdHwgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkXG5cdHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTbG93XG5cdHwgSUNoYXREaXNhYmxlZENsYXVkZUhvb2tzUGFydFxuXHR8IElDaGF0Vm9pY2VQcm9ncmVzc1BhcnRcbj47XG5cbmNvbnN0IG5vbkhpc3RvcnlLaW5kcyA9IG5ldyBTZXQoWyd0b29sSW52b2NhdGlvbicsICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLCAndW5kb1N0b3AnLCAndm9pY2VQcm9ncmVzcyddKTtcbmZ1bmN0aW9uIGlzQ2hhdFByb2dyZXNzSGlzdG9yeVJlc3BvbnNlQ29udGVudChjb250ZW50OiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50KTogY29udGVudCBpcyBJQ2hhdFByb2dyZXNzSGlzdG9yeVJlc3BvbnNlQ29udGVudCB7XG5cdHJldHVybiAhbm9uSGlzdG9yeUtpbmRzLmhhcyhjb250ZW50LmtpbmQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9DaGF0SGlzdG9yeUNvbnRlbnQoY29udGVudDogUmVhZG9ubHlBcnJheTxJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50Pik6IElDaGF0UHJvZ3Jlc3NIaXN0b3J5UmVzcG9uc2VDb250ZW50W10ge1xuXHRyZXR1cm4gY29udGVudC5maWx0ZXIoaXNDaGF0UHJvZ3Jlc3NIaXN0b3J5UmVzcG9uc2VDb250ZW50KTtcbn1cblxuZXhwb3J0IHR5cGUgSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQgPSBFeGNsdWRlPElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsIElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB8IElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eSB8IElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0IHwgSUNoYXRWb2ljZVByb2dyZXNzUGFydD47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc3BvbnNlIHtcblx0cmVhZG9ubHkgdmFsdWU6IFJlYWRvbmx5QXJyYXk8SUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudD47XG5cdGdldE1hcmtkb3duKCk6IHN0cmluZztcblx0Z2V0RmluYWxSZXNwb25zZSgpOiBzdHJpbmc7XG5cdHRvU3RyaW5nKCk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlTW9kZWwge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24+O1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVzZXJuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb246IElDaGF0TW9kZWw7XG5cdHJlYWRvbmx5IGFnZW50PzogSUNoYXRBZ2VudERhdGE7XG5cdHJlYWRvbmx5IHVzZWRDb250ZXh0OiBJQ2hhdFVzZWRDb250ZXh0IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb250ZW50UmVmZXJlbmNlczogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+O1xuXHRyZWFkb25seSBjb2RlQ2l0YXRpb25zOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPjtcblx0cmVhZG9ubHkgcHJvZ3Jlc3NNZXNzYWdlczogUmVhZG9ubHlBcnJheTxJQ2hhdFByb2dyZXNzTWVzc2FnZT47XG5cdHJlYWRvbmx5IHNsYXNoQ29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kO1xuXHRyZWFkb25seSBhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQ6IGJvb2xlYW47XG5cdC8qKiBWaWV3IG9mIHRoZSByZXNwb25zZSBzaG93biB0byB0aGUgdXNlciwgbWF5IGhhdmUgcGFydHMgb21pdHRlZCBmcm9tIHVuZG8gc3RvcHMuICovXG5cdHJlYWRvbmx5IHJlc3BvbnNlOiBJUmVzcG9uc2U7XG5cdC8qKiBFbnRpcmUgcmVzcG9uc2UgZnJvbSB0aGUgbW9kZWwuICovXG5cdHJlYWRvbmx5IGVudGlyZVJlc3BvbnNlOiBJUmVzcG9uc2U7XG5cdC8qKiBNaWxsaXNlY29uZHMgdGltZXN0YW1wIHdoZW4gdGhpcyBjaGF0IHJlc3BvbnNlIHdhcyBjcmVhdGVkLiAqL1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0LyoqIE1pbGxpc2Vjb25kcyB0aW1lc3RhbXAgd2hlbiB0aGlzIGNoYXQgcmVzcG9uc2Ugd2FzIGNvbXBsZXRlZCBvciBjYW5jZWxsZWQuICovXG5cdHJlYWRvbmx5IGNvbXBsZXRlZEF0PzogbnVtYmVyO1xuXHQvKiogS25vd24gY29tcGxldGlvbiB0aW1lc3RhbXAgZm9yIGRpc3BsYXkuIFVuZGVmaW5lZCBmb3IgbGVnYWN5IHJlc3BvbnNlcyB3aG9zZSBjb21wbGV0aW9uIHRpbWUgd2FzIHN5bnRoZXNpemVkIGR1cmluZyByZXN0b3JlLiAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uVGltZXN0YW1wPzogbnVtYmVyO1xuXHQvKiogVGhlIHN0YXRlIG9mIHRoaXMgcmVzcG9uc2UgKi9cblx0cmVhZG9ubHkgc3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZTtcblx0LyoqIEBpbnRlcm5hbCAqL1xuXHRyZWFkb25seSBzdGF0ZVQ6IFJlc3BvbnNlTW9kZWxTdGF0ZVQ7XG5cdC8qKlxuXHQgKiBBZGp1c3RlZCBtaWxsaXNlY29uZCB0aW1lc3RhbXAgdGhhdCBleGNsdWRlcyB0aGUgZHVyYXRpb24gZHVyaW5nIHdoaWNoXG5cdCAqIHRoZSBtb2RlbCB3YXMgcGVuZGluZyB1c2VyIGNvbmZpcm1hdGlvbi4gYERhdGUubm93KCkgLSBjb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcGBcblx0ICogd2lsbCByZXR1cm4gdGhlIGFtb3VudCBvZiB0aW1lIHRoZSByZXNwb25zZSB3YXMgYnVzeSBnZW5lcmF0aW5nIGNvbnRlbnQuXG5cdCAqIFRoaXMgaXMgdXBkYXRlZCBvbmx5IHdoZW4gYGlzUGVuZGluZ0NvbmZpcm1hdGlvbmAgY2hhbmdlcyBzdGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRyZWFkb25seSBpc0NvbXBsZXRlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc0NhbmNlbGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1BlbmRpbmdDb25maXJtYXRpb246IElPYnNlcnZhYmxlPHsgc3RhcnRlZFdhaXRpbmdBdDogbnVtYmVyOyBkZXRhaWw/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGlzSW5Qcm9ncmVzczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKlxuXHQgKiBUcnVlIHdoZW5ldmVyIHRoaXMgcmVzcG9uc2UgaGFzIG5vdCByZWFjaGVkIGEgdGVybWluYWwgc3RhdGUgeWV0LlxuXHQgKiBVbmxpa2Uge0BsaW5rIGlzSW5Qcm9ncmVzc30sIHRoaXMgcmVtYWlucyB0cnVlIGR1cmluZyB0b29sIGNvbmZpcm1hdGlvbnMsXG5cdCAqIGVsaWNpdGF0aW9ucywgYW5kIGFueSBvdGhlciBpbnRlcm1lZGlhdGUgc3RhdGUuXG5cdCAqL1xuXHRyZWFkb25seSBpc0luY29tcGxldGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBzaG91bGRCZVJlbW92ZWRPblNlbmQ6IElDaGF0UmVxdWVzdERpc2FibGVtZW50IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzaG91bGRCZUJsb2NrZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0OiBib29sZWFuO1xuXHQvKiogQSBzdGFsZSByZXNwb25zZSBpcyBvbmUgdGhhdCBoYXMgYmVlbiBwZXJzaXN0ZWQgYW5kIHJlaHlkcmF0ZWQsIHNvIGUuZy4gQ29tbWFuZHMgdGhhdCBoYXZlIHRoZWlyIGFyZ3VtZW50cyBzdG9yZWQgaW4gdGhlIEVIIGFyZSBnb25lLiAqL1xuXHRyZWFkb25seSBpc1N0YWxlOiBib29sZWFuO1xuXHRyZWFkb25seSB2b3RlOiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBmb2xsb3d1cHM/OiBJQ2hhdEZvbGxvd3VwW10gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlc3VsdD86IElDaGF0QWdlbnRSZXN1bHQ7XG5cdHJlYWRvbmx5IHVzYWdlPzogSUNoYXRVc2FnZTtcblx0cmVhZG9ubHkgdXNhZ2VPYnM6IElPYnNlcnZhYmxlPElDaGF0VXNhZ2UgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBjb21wbGV0aW9uVG9rZW5Db3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb21wbGV0aW9uVG9rZW5Db3VudE9iczogSU9ic2VydmFibGU8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0LyoqIEVsYXBzZWQgZ2VuZXJhdGlvbiB0aW1lIGluIG1zIChleGNsdWRpbmcgY29uZmlybWF0aW9uIHdhaXRzKS4gU2V0IG9uIGNvbXBsZXRpb24gYW5kIHNlcmlhbGl6ZWQuICovXG5cdHJlYWRvbmx5IGVsYXBzZWRNczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb2RlQmxvY2tJbmZvczogSUNvZGVCbG9ja0luZm9bXSB8IHVuZGVmaW5lZDtcblxuXHRpbml0aWFsaXplQ29kZUJsb2NrSW5mb3MoY29kZUJsb2NrSW5mbzogSUNvZGVCbG9ja0luZm9bXSk6IHZvaWQ7XG5cdGFkZFVuZG9TdG9wKHVuZG9TdG9wOiBJQ2hhdFVuZG9TdG9wKTogdm9pZDtcblx0c2V0Vm90ZSh2b3RlOiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uKTogdm9pZDtcblx0c2V0VXNhZ2UodXNhZ2U6IElDaGF0VXNhZ2UpOiB2b2lkO1xuXHRzZXRFbGFwc2VkTXMoZWxhcHNlZE1zOiBudW1iZXIpOiB2b2lkO1xuXHRzZXRFZGl0QXBwbGllZChlZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXAsIGVkaXRDb3VudDogbnVtYmVyKTogYm9vbGVhbjtcblx0cmVzb2x2ZUlubGluZVJlZmVyZW5jZShyZXNvbHZlSWQ6IHN0cmluZywgcmVzb2x2ZWRSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSk6IGJvb2xlYW47XG5cdHVwZGF0ZUNvbnRlbnQocHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQgfCBJQ2hhdFRleHRFZGl0IHwgSUNoYXROb3RlYm9va0VkaXQgfCBJQ2hhdFRhc2sgfCBJQ2hhdEV4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUsIHF1aWV0PzogYm9vbGVhbik6IHZvaWQ7XG5cdC8qKlxuXHQgKiBBZG9wdHMgYW55IHBhcnRpYWxseS11bmRvIHtAbGluayByZXNwb25zZX0gYXMgdGhlIHtAbGluayBlbnRpcmVSZXNwb25zZX0uXG5cdCAqIE9ubHkgdmFsaWQgd2hlbiB7QGxpbmsgaXNDb21wbGV0ZX0uIFRoaXMgaXMgbmVlZGVkIGJlY2F1c2Ugb3RoZXJ3aXNlIGFuXG5cdCAqIHVuZG9uZSBhbmQgdGhlbiBkaXZlcmdlZCBzdGF0ZSB3b3VsZCBzdGFydCBzaG93aW5nIG9sZCBkYXRhIGJlY2F1c2UgdGhlXG5cdCAqIHVuZG8gc3RvcHMgd291bGQgbm8gbG9uZ2VyIGV4aXN0IGluIHRoZSBtb2RlbC5cblx0ICovXG5cdGZpbmFsaXplVW5kb1N0YXRlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uID1cblx0fCB7IHJlYXNvbjogJ290aGVyJyB9XG5cdHwgeyByZWFzb246ICdjb21wbGV0ZWRSZXF1ZXN0JyB9XG5cdHwgeyByZWFzb246ICd1bmRvU3RvcCc7IGlkOiBzdHJpbmcgfTtcblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbjogQ2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24gPSB7IHJlYXNvbjogJ290aGVyJyB9O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdE1vZGVJbmZvIHtcblx0a2luZDogQ2hhdE1vZGVLaW5kIHwgdW5kZWZpbmVkOyAvLyBpcyB1bmRlZmluZWQgaW4gY2FzZSBvZiB0ZWxlbWV0cnlNb2RlSWQgPT09ICdhcHBseUNvZGVCbG9jaydcblx0aXNCdWlsdGluOiBib29sZWFuO1xuXHRtb2RlSW5zdHJ1Y3Rpb25zOiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkO1xuXHR0ZWxlbWV0cnlNb2RlSWQ6ICdhc2snIHwgJ2FnZW50JyB8ICdlZGl0JyB8ICdjdXN0b20nIHwgJ2FwcGx5Q29kZUJsb2NrJyB8IHVuZGVmaW5lZDtcblx0dGVsZW1ldHJ5TW9kZU5hbWU/OiBzdHJpbmc7XG5cdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiBFZGl0U3VnZ2VzdGlvbklkIHwgdW5kZWZpbmVkO1xuXHRwZXJtaXNzaW9uTGV2ZWw/OiBDaGF0UGVybWlzc2lvbkxldmVsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMge1xuXHRyZWFkb25seSB1cmk/OiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sUmVmZXJlbmNlczogcmVhZG9ubHkgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXTtcblx0cmVhZG9ubHkgYWxsb3dlZFN1YmFnZW50cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCBzdHJpbmcgfCBudW1iZXI+O1xuXHRyZWFkb25seSBpc0J1aWx0aW4/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdE1vZGVsUGFyYW1ldGVycyB7XG5cdHNlc3Npb246IENoYXRNb2RlbDtcblx0bWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0O1xuXHR2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YTtcblx0dGltZXN0YW1wPzogbnVtYmVyO1xuXHRmYWxsYmFja1RpbWVzdGFtcD86IG51bWJlcjtcblx0YXR0ZW1wdD86IG51bWJlcjtcblx0bW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbztcblx0Y29uZmlybWF0aW9uPzogc3RyaW5nO1xuXHRsb2NhdGlvbkRhdGE/OiBJQ2hhdExvY2F0aW9uRGF0YTtcblx0YXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0PzogYm9vbGVhbjtcblx0bW9kZWxJZD86IHN0cmluZztcblx0cmVzdG9yZWRJZD86IHN0cmluZztcblx0ZWRpdGVkRmlsZUV2ZW50cz86IElDaGF0QWdlbnRFZGl0ZWRGaWxlRXZlbnRbXTtcblx0dXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scztcblx0aXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0dGVybWluYWxFeGVjdXRpb25JZD86IHN0cmluZztcblx0LyoqIFdoZXRoZXIgdGhpcyByZXF1ZXN0IHJ1bnMgYXMgYSB0ZXJtaW5hbCBjb21tYW5kIChhZ2VudCBob3N0IGAhYCBwcmVmaXgpLiAqL1xuXHRpc1Rlcm1pbmFsQ29tbWFuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdE1vZGVsIGltcGxlbWVudHMgSUNoYXRSZXF1ZXN0TW9kZWwge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlc3BvbnNlOiBDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHVibGljIHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3RUaW1lc3RhbXA6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IG1lc3NhZ2U6IElQYXJzZWRDaGF0UmVxdWVzdDtcblx0cHVibGljIHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBtb2RlbElkPzogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbztcblx0cHVibGljIHJlYWRvbmx5IHVzZXJTZWxlY3RlZFRvb2xzPzogVXNlclNlbGVjdGVkVG9vbHM7XG5cdHB1YmxpYyByZWFkb25seSBpc1N5c3RlbUluaXRpYXRlZD86IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHRlcm1pbmFsRXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBpc1Rlcm1pbmFsQ29tbWFuZDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRCZUJsb2NrZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRwdWJsaWMgZ2V0IHNob3VsZEJlQmxvY2tlZCgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZEJlQmxvY2tlZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRTaG91bGRCZUJsb2NrZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRCZUJsb2NrZWQuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbjogQ2hhdE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRlbXB0OiBudW1iZXI7XG5cdHByaXZhdGUgX3ZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRlZEZpbGVFdmVudHM/OiBJQ2hhdEFnZW50RWRpdGVkRmlsZUV2ZW50W107XG5cblx0cHVibGljIGdldCBzZXNzaW9uKCk6IENoYXRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGF0dGVtcHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0ZW1wdDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdmFyaWFibGVEYXRhKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhcmlhYmxlRGF0YTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdmFyaWFibGVEYXRhKHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSkge1xuXHRcdHRoaXMuX3ZlcnNpb24rKztcblx0XHR0aGlzLl92YXJpYWJsZURhdGEgPSB2O1xuXHR9XG5cblx0cHVibGljIGdldCBjb25maXJtYXRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybWF0aW9uO1xuXHR9XG5cblx0cHVibGljIGdldCBsb2NhdGlvbkRhdGEoKTogSUNoYXRMb2NhdGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbkRhdGE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGF0dGFjaGVkQ29udGV4dCgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdHRhY2hlZENvbnRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGVkaXRlZEZpbGVFdmVudHMoKTogSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdGVkRmlsZUV2ZW50cztcblx0fVxuXG5cdHByaXZhdGUgX3ZlcnNpb24gPSAwO1xuXHRwdWJsaWMgZ2V0IHZlcnNpb24oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmVyc2lvbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHBhcmFtczogSUNoYXRSZXF1ZXN0TW9kZWxQYXJhbWV0ZXJzKSB7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHBhcmFtcy5zZXNzaW9uO1xuXHRcdHRoaXMubWVzc2FnZSA9IHBhcmFtcy5tZXNzYWdlO1xuXHRcdHRoaXMuX3ZhcmlhYmxlRGF0YSA9IHBhcmFtcy52YXJpYWJsZURhdGE7XG5cdFx0dGhpcy5yZXF1ZXN0VGltZXN0YW1wID0gcGFyYW1zLnRpbWVzdGFtcDtcblx0XHR0aGlzLnRpbWVzdGFtcCA9IHBhcmFtcy50aW1lc3RhbXAgPz8gcGFyYW1zLmZhbGxiYWNrVGltZXN0YW1wID8/IERhdGUubm93KCk7XG5cdFx0dGhpcy5fYXR0ZW1wdCA9IHBhcmFtcy5hdHRlbXB0ID8/IDA7XG5cdFx0dGhpcy5tb2RlSW5mbyA9IHBhcmFtcy5tb2RlSW5mbztcblx0XHR0aGlzLl9jb25maXJtYXRpb24gPSBwYXJhbXMuY29uZmlybWF0aW9uO1xuXHRcdHRoaXMuX2xvY2F0aW9uRGF0YSA9IHBhcmFtcy5sb2NhdGlvbkRhdGE7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0ID0gcGFyYW1zLmF0dGFjaGVkQ29udGV4dDtcblx0XHR0aGlzLmlzQ29tcGxldGVBZGRlZFJlcXVlc3QgPSBwYXJhbXMuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCA/PyBmYWxzZTtcblx0XHR0aGlzLm1vZGVsSWQgPSBwYXJhbXMubW9kZWxJZDtcblx0XHR0aGlzLmlkID0gcGFyYW1zLnJlc3RvcmVkSWQgPz8gJ3JlcXVlc3RfJyArIGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX2VkaXRlZEZpbGVFdmVudHMgPSBwYXJhbXMuZWRpdGVkRmlsZUV2ZW50cztcblx0XHR0aGlzLnVzZXJTZWxlY3RlZFRvb2xzID0gcGFyYW1zLnVzZXJTZWxlY3RlZFRvb2xzO1xuXHRcdHRoaXMuaXNTeXN0ZW1Jbml0aWF0ZWQgPSBwYXJhbXMuaXNTeXN0ZW1Jbml0aWF0ZWQ7XG5cdFx0dGhpcy5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCA9IHBhcmFtcy5zeXN0ZW1Jbml0aWF0ZWRMYWJlbDtcblx0XHR0aGlzLnRlcm1pbmFsRXhlY3V0aW9uSWQgPSBwYXJhbXMudGVybWluYWxFeGVjdXRpb25JZDtcblx0XHR0aGlzLmlzVGVybWluYWxDb21tYW5kID0gcGFyYW1zLmlzVGVybWluYWxDb21tYW5kID8/IGZhbHNlO1xuXHR9XG5cblx0YWRvcHRUbyhzZXNzaW9uOiBDaGF0TW9kZWwpIHtcblx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblx0fVxufVxuXG5jbGFzcyBBYnN0cmFjdFJlc3BvbnNlIGltcGxlbWVudHMgSVJlc3BvbnNlIHtcblx0cHJvdGVjdGVkIF9yZXNwb25zZVBhcnRzOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50W107XG5cblx0LyoqXG5cdCAqIEEgc3RyaW5naWZpZWQgcmVwcmVzZW50YXRpb24gb2YgcmVzcG9uc2UgZGF0YSB3aGljaCBtaWdodCBiZSBwcmVzZW50ZWQgdG8gYSBzY3JlZW5yZWFkZXIgb3IgdXNlZCB3aGVuIGNvcHlpbmcgYSByZXNwb25zZS5cblx0ICogQ29tcHV0ZWQgbGF6aWx5IG9uIGRlbWFuZCB0byBhdm9pZCBleHBlbnNpdmUgc3RyaW5nIHJlYnVpbGRpbmcgZHVyaW5nIHN0cmVhbWluZy5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3BvbnNlUmVwcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBKdXN0IHRoZSBtYXJrZG93biBjb250ZW50IG9mIHRoZSByZXNwb25zZSwgdXNlZCBmb3IgZGV0ZXJtaW5pbmcgdGhlIHJlbmRlcmluZyByYXRlIG9mIG1hcmtkb3duLlxuXHQgKiBDb21wdXRlZCBsYXppbHkgb24gZGVtYW5kIHRvIGF2b2lkIGV4cGVuc2l2ZSBzdHJpbmcgcmVidWlsZGluZyBkdXJpbmcgc3RyZWFtaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfbWFya2Rvd25Db250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IHZhbHVlKCk6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3BvbnNlUGFydHM7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFtdKSB7XG5cdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cyA9IHZhbHVlO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fcmVzcG9uc2VSZXByID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbnNlUmVwciA9IHRoaXMuY29tcHV0ZVJlcHIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc3BvbnNlUmVwcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBfSnVzdF8gdGhlIGNvbnRlbnQgb2YgbWFya2Rvd24gcGFydHMgaW4gdGhlIHJlc3BvbnNlXG5cdCAqL1xuXHRnZXRNYXJrZG93bigpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9tYXJrZG93bkNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbWFya2Rvd25Db250ZW50ID0gdGhpcy5jb21wdXRlTWFya2Rvd25Db250ZW50KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tYXJrZG93bkNvbnRlbnQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHRyYWlsaW5nIGNvbnRpZ3VvdXMgbWFya2Rvd24vaW5saW5lLXJlZmVyZW5jZSBjb250ZW50IG9mIHRoZSByZXNwb25zZSxcblx0ICogc2tpcHBpbmcgYW55IHRyYWlsaW5nIHRvb2wgY2FsbHMgb3IgZW1wdHkgbWFya2Rvd24gcGFydHMuXG5cdCAqL1xuXHRnZXRGaW5hbFJlc3BvbnNlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcGFydHMgPSB0aGlzLl9yZXNwb25zZVBhcnRzO1xuXHRcdC8vIFdhbGsgYmFja3dhcmRzIHRvIGZpbmQgd2hlcmUgdGhlIGxhc3QgY29udGlndW91cyBtYXJrZG93biBibG9jayBzdGFydHMuXG5cdFx0Ly8gUGhhc2UgMTogc2tpcCB0cmFpbGluZyBub24tbWFya2Rvd24gcGFydHMgYW5kIGVtcHR5IG1hcmtkb3duLlxuXHRcdGxldCBpID0gcGFydHMubGVuZ3RoIC0gMTtcblx0XHR3aGlsZSAoaSA+PSAwKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbaV07XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyB8fCBwYXJ0LmtpbmQgPT09ICdtYXJrZG93blZ1bG4nKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmNvbnRlbnQudmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ2lubGluZVJlZmVyZW5jZScpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpLS07XG5cdFx0fVxuXG5cdFx0aWYgKGkgPCAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gUGhhc2UgMjogY29sbGVjdCBjb250aWd1b3VzIG1hcmtkb3duL2lubGluZS1yZWZlcmVuY2UgcGFydHMgZ29pbmcgYmFja3dhcmRzLlxuXHRcdGNvbnN0IGVuZCA9IGk7XG5cdFx0d2hpbGUgKGkgPj0gMCkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydC5raW5kID09PSAnbWFya2Rvd25WdWxuJyB8fCBwYXJ0LmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnKSB7XG5cdFx0XHRcdGktLTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdGFydCA9IGkgKyAxO1xuXG5cdFx0Ly8gQ29tYmluZSB0aGUgY29sbGVjdGVkIHBhcnRzLlxuXHRcdGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGogPSBzdGFydDsgaiA8PSBlbmQ7IGorKykge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2pdO1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2lubGluZVJlZmVyZW5jZScpIHtcblx0XHRcdFx0c2VnbWVudHMucHVzaCh0aGlzLmlubGluZVJlZlRvUmVwcihwYXJ0KSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydC5raW5kID09PSAnbWFya2Rvd25WdWxuJykge1xuXHRcdFx0XHRpZiAocGFydC5jb250ZW50LnZhbHVlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWdtZW50cy5wdXNoKHBhcnQuY29udGVudC52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlZ21lbnRzLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEludmFsaWRhdGUgY2FjaGVkIHJlcHJlc2VudGF0aW9ucyBzbyB0aGV5IGFyZSByZWNvbXB1dGVkIG9uIG5leHQgYWNjZXNzLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9pbnZhbGlkYXRlUmVwcigpIHtcblx0XHR0aGlzLl9yZXNwb25zZVJlcHIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWFya2Rvd25Db250ZW50ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlTWFya2Rvd25Db250ZW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2VnbWVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX3Jlc3BvbnNlUGFydHMpIHtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnKSB7XG5cdFx0XHRcdHNlZ21lbnRzLnB1c2godGhpcy5pbmxpbmVSZWZUb1JlcHIocGFydCkpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHBhcnQua2luZCA9PT0gJ21hcmtkb3duVnVsbicpIHtcblx0XHRcdFx0aWYgKHBhcnQuY29udGVudC52YWx1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VnbWVudHMucHVzaChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZWdtZW50cy5qb2luKCcnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb21wdXRlUmVwcigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnBhcnRzVG9SZXByKHRoaXMuX3Jlc3BvbnNlUGFydHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJ0c1RvUmVwcihwYXJ0czogcmVhZG9ubHkgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFtdKTogc3RyaW5nIHtcblx0XHRjb25zdCBibG9ja3M6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGN1cnJlbnRCbG9ja1NlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBoYXNFZGl0R3JvdXBzQWZ0ZXJMYXN0Q2xlYXIgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0bGV0IHNlZ21lbnQ6IHsgdGV4dDogc3RyaW5nOyBpc0Jsb2NrPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0c3dpdGNoIChwYXJ0LmtpbmQpIHtcblx0XHRcdFx0Y2FzZSAnY2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb24nOlxuXHRcdFx0XHRcdGN1cnJlbnRCbG9ja1NlZ21lbnRzID0gW107XG5cdFx0XHRcdFx0YmxvY2tzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdFx0aGFzRWRpdEdyb3Vwc0FmdGVyTGFzdENsZWFyID0gZmFsc2U7IC8vIFJlc2V0IGVkaXQgZ3JvdXBzIGZsYWcgd2hlbiBjbGVhcmluZ1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRjYXNlICd0cmVlRGF0YSc6XG5cdFx0XHRcdGNhc2UgJ3Byb2dyZXNzTWVzc2FnZSc6XG5cdFx0XHRcdGNhc2UgJ2NvZGVibG9ja1VyaSc6XG5cdFx0XHRcdGNhc2UgJ2V4dGVuc2lvbnMnOlxuXHRcdFx0XHRjYXNlICdwdWxsUmVxdWVzdCc6XG5cdFx0XHRcdGNhc2UgJ3VuZG9TdG9wJzpcblx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlRWRpdCc6XG5cdFx0XHRcdGNhc2UgJ2V4dGVybmFsRWRpdCc6XG5cdFx0XHRcdGNhc2UgJ2VsaWNpdGF0aW9uMic6XG5cdFx0XHRcdGNhc2UgJ2VsaWNpdGF0aW9uU2VyaWFsaXplZCc6XG5cdFx0XHRcdGNhc2UgJ3RoaW5raW5nJzpcblx0XHRcdFx0Y2FzZSAnaG9vayc6XG5cdFx0XHRcdGNhc2UgJ3ZvaWNlUHJvZ3Jlc3MnOlxuXHRcdFx0XHRjYXNlICdtdWx0aURpZmZEYXRhJzpcblx0XHRcdFx0Y2FzZSAnbWNwU2VydmVyc1N0YXJ0aW5nJzpcblx0XHRcdFx0Y2FzZSAnbWNwQXV0aGVudGljYXRpb25SZXF1aXJlZCc6XG5cdFx0XHRcdGNhc2UgJ21jcFNlcnZlcnNTdGFydGluZ1Nsb3cnOlxuXHRcdFx0XHRjYXNlICdxdWVzdGlvbkNhcm91c2VsJzpcblx0XHRcdFx0Y2FzZSAncGxhblJldmlldyc6XG5cdFx0XHRcdGNhc2UgJ2Rpc2FibGVkQ2xhdWRlSG9va3MnOlxuXHRcdFx0XHRjYXNlICdhdXRvTW9kZVJlc29sdXRpb24nOlxuXHRcdFx0XHRcdC8vIElnbm9yZVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRjYXNlICdzeXN0ZW1Ob3RpZmljYXRpb24nOlxuXHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IHBhcnQuY29udGVudC52YWx1ZSwgaXNCbG9jazogdHJ1ZSB9O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0b29sSW52b2NhdGlvbic6XG5cdFx0XHRcdGNhc2UgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCc6XG5cdFx0XHRcdFx0Ly8gSW5jbHVkZSB0b29sIGludm9jYXRpb25zIGluIHRoZSBjb3B5IHRleHRcblx0XHRcdFx0XHRzZWdtZW50ID0gdGhpcy5nZXRUb29sSW52b2NhdGlvblRleHQocGFydCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2lubGluZVJlZmVyZW5jZSc6XG5cdFx0XHRcdFx0c2VnbWVudCA9IHsgdGV4dDogdGhpcy5pbmxpbmVSZWZUb1JlcHIocGFydCkgfTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY29tbWFuZCc6XG5cdFx0XHRcdFx0c2VnbWVudCA9IHsgdGV4dDogcGFydC5jb21tYW5kLnRpdGxlLCBpc0Jsb2NrOiB0cnVlIH07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3RleHRFZGl0R3JvdXAnOlxuXHRcdFx0XHRjYXNlICdub3RlYm9va0VkaXRHcm91cCc6XG5cdFx0XHRcdFx0Ly8gTWFyayB0aGF0IHdlIGhhdmUgZWRpdCBncm91cHMgYWZ0ZXIgdGhlIGxhc3QgY2xlYXJcblx0XHRcdFx0XHRoYXNFZGl0R3JvdXBzQWZ0ZXJMYXN0Q2xlYXIgPSB0cnVlO1xuXHRcdFx0XHRcdC8vIFNraXAgaW5kaXZpZHVhbCBlZGl0IGdyb3VwcyB0byBhdm9pZCBkdXBsaWNhdGlvblxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRjYXNlICdjb25maXJtYXRpb24nOlxuXHRcdFx0XHRcdGlmIChwYXJ0Lm1lc3NhZ2UgaW5zdGFuY2VvZiBNYXJrZG93blN0cmluZykge1xuXHRcdFx0XHRcdFx0c2VnbWVudCA9IHsgdGV4dDogYCR7cGFydC50aXRsZX1cXG4ke3BhcnQubWVzc2FnZS52YWx1ZX1gLCBpc0Jsb2NrOiB0cnVlIH07XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2VnbWVudCA9IHsgdGV4dDogYCR7cGFydC50aXRsZX1cXG4ke3BhcnQubWVzc2FnZX1gLCBpc0Jsb2NrOiB0cnVlIH07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ21hcmtkb3duQ29udGVudCc6XG5cdFx0XHRcdGNhc2UgJ21hcmtkb3duVnVsbic6XG5cdFx0XHRcdGNhc2UgJ3Byb2dyZXNzVGFzayc6XG5cdFx0XHRcdGNhc2UgJ3Byb2dyZXNzVGFza1NlcmlhbGl6ZWQnOlxuXHRcdFx0XHRjYXNlICd3YXJuaW5nJzpcblx0XHRcdFx0Y2FzZSAnaW5mbyc6XG5cdFx0XHRcdFx0c2VnbWVudCA9IHsgdGV4dDogcGFydC5jb250ZW50LnZhbHVlIH07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0Ly8gSWdub3JlIGFueSB1bmtub3duL29ic29sZXRlIHBhcnRzLCBidXQgYXNzZXJ0IHRoYXQgYWxsIGFyZSBoYW5kbGVkOlxuXHRcdFx0XHRcdHNvZnRBc3NlcnROZXZlcihwYXJ0KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlZ21lbnQuaXNCbG9jaykge1xuXHRcdFx0XHRpZiAoY3VycmVudEJsb2NrU2VnbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YmxvY2tzLnB1c2goY3VycmVudEJsb2NrU2VnbWVudHMuam9pbignJykpO1xuXHRcdFx0XHRcdGN1cnJlbnRCbG9ja1NlZ21lbnRzID0gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0YmxvY2tzLnB1c2goc2VnbWVudC50ZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRCbG9ja1NlZ21lbnRzLnB1c2goc2VnbWVudC50ZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEJsb2NrU2VnbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRibG9ja3MucHVzaChjdXJyZW50QmxvY2tTZWdtZW50cy5qb2luKCcnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGNvbnNvbGlkYXRlZCBlZGl0IHN1bW1hcnkgYXQgdGhlIGVuZCBpZiB0aGVyZSB3ZXJlIGFueSBlZGl0IGdyb3VwcyBhZnRlciB0aGUgbGFzdCBjbGVhclxuXHRcdGlmIChoYXNFZGl0R3JvdXBzQWZ0ZXJMYXN0Q2xlYXIpIHtcblx0XHRcdGJsb2Nrcy5wdXNoKGxvY2FsaXplKCdlZGl0c1N1bW1hcnknLCBcIk1hZGUgY2hhbmdlcy5cIikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBibG9ja3Muam9pbignXFxuXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIGlubGluZVJlZlRvUmVwcihwYXJ0OiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UpIHtcblx0XHRpZiAoJ3VyaScgaW4gcGFydC5pbmxpbmVSZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnVyaVRvUmVwcihwYXJ0LmlubGluZVJlZmVyZW5jZS51cmkpO1xuXHRcdH1cblxuXHRcdHJldHVybiAnbmFtZScgaW4gcGFydC5pbmxpbmVSZWZlcmVuY2Vcblx0XHRcdD8gJ2AnICsgcGFydC5pbmxpbmVSZWZlcmVuY2UubmFtZSArICdgJ1xuXHRcdFx0OiB0aGlzLnVyaVRvUmVwcihwYXJ0LmlubGluZVJlZmVyZW5jZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvb2xJbnZvY2F0aW9uVGV4dCh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogeyB0ZXh0OiBzdHJpbmc7IGlzQmxvY2s/OiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGdldFRlcm1pbmFsRGlzcGxheUlucHV0ID0gKHRlcm1pbmFsRGF0YTogUmV0dXJuVHlwZTx0eXBlb2YgbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YT4pID0+IHRlcm1pbmFsRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM/LmNvbW1hbmRMaW5lXG5cdFx0XHQ/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheVxuXHRcdFx0Pz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWRcblx0XHRcdD8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkXG5cdFx0XHQ/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWw7XG5cblx0XHQvLyBFeHRyYWN0IHRoZSBtZXNzYWdlIGFuZCBpbnB1dCBkZXRhaWxzXG5cdFx0bGV0IG1lc3NhZ2UgPSAnJztcblx0XHRsZXQgaW5wdXQgPSAnJztcblxuXHRcdGlmICh0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlKSB7XG5cdFx0XHRtZXNzYWdlID0gdHlwZW9mIHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZVxuXHRcdFx0XHQ6IHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UudmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSB0eXBlb2YgdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2Vcblx0XHRcdFx0OiB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZS52YWx1ZTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgZGlmZmVyZW50IHR5cGVzIG9mIHRvb2wgaW52b2NhdGlvbnNcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdFx0XHRtZXNzYWdlID0gJ1JhbiB0ZXJtaW5hbCBjb21tYW5kJztcblx0XHRcdFx0Y29uc3QgdGVybWluYWxEYXRhID0gbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdFx0aW5wdXQgPSBnZXRUZXJtaW5hbERpc3BsYXlJbnB1dCh0ZXJtaW5hbERhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZvcm1hdCB0aGUgdG9vbCBpbnZvY2F0aW9uIHRleHRcblx0XHRsZXQgdGV4dCA9IG1lc3NhZ2U7XG5cdFx0aWYgKGlucHV0KSB7XG5cdFx0XHR0ZXh0ICs9IGA6ICR7aW5wdXR9YDtcblx0XHR9XG5cblx0XHQvLyBGb3IgY29tcGxldGVkIHRvb2wgaW52b2NhdGlvbnMsIGFsc28gaW5jbHVkZSB0aGUgcmVzdWx0IGRldGFpbHMgaWYgYXZhaWxhYmxlXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnIHx8ICh0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikpKSB7XG5cdFx0XHRjb25zdCByZXN1bHREZXRhaWxzID0gSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdGlmIChyZXN1bHREZXRhaWxzICYmICdpbnB1dCcgaW4gcmVzdWx0RGV0YWlscykge1xuXHRcdFx0XHRjb25zdCByZXN1bHRQcmVmaXggPSB0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyB8fCBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24pID8gJ0NvbXBsZXRlZCcgOiAnRXJyb3JlZCc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdElucHV0ID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJ1xuXHRcdFx0XHRcdD8gZ2V0VGVybWluYWxEaXNwbGF5SW5wdXQobWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKSlcblx0XHRcdFx0XHQ6IHJlc3VsdERldGFpbHMuaW5wdXQ7XG5cdFx0XHRcdHRleHQgKz0gYFxcbiR7cmVzdWx0UHJlZml4fSB3aXRoIGlucHV0OiAke3Jlc3VsdElucHV0fWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdGV4dCwgaXNCbG9jazogdHJ1ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cmlUb1JlcHIodXJpOiBVUkkpOiBzdHJpbmcge1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmh0dHAgfHwgdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0cmV0dXJuIHVyaS50b1N0cmluZyhmYWxzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJhc2VuYW1lKHVyaSk7XG5cdH1cbn1cblxuLyoqIEEgdmlldyBvZiBhIHN1YnNldCBvZiBhIHJlc3BvbnNlICovXG5jbGFzcyBSZXNwb25zZVZpZXcgZXh0ZW5kcyBBYnN0cmFjdFJlc3BvbnNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0X3Jlc3BvbnNlOiBJUmVzcG9uc2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHVuZG9TdG9wOiBzdHJpbmcsXG5cdCkge1xuXHRcdGxldCBpZHggPSBfcmVzcG9uc2UudmFsdWUuZmluZEluZGV4KHYgPT4gdi5raW5kID09PSAndW5kb1N0b3AnICYmIHYuaWQgPT09IHVuZG9TdG9wKTtcblx0XHQvLyBVbmRvIHN0b3BzIGFyZSBpbnNlcnRlZCBiZWZvcmUgYGNvZGVibG9ja1VyaWAncywgd2hpY2ggYXJlIHByZWNlZWRlZCBieSBhXG5cdFx0Ly8gbWFya2Rvd25Db250ZW50IGNvbnRhaW5pbmcgdGhlIG9wZW5pbmcgY29kZSBmZW5jZS4gQWRqdXN0IHRoZSBpbmRleFxuXHRcdC8vIGJhY2t3YXJkcyB0byBhdm9pZCBhIGJ1Z2d5IHJlc3BvbnNlIGlmIGl0IGxvb2tlZCBsaWtlIHRoaXMgaGFwcGVuZWQuXG5cdFx0aWYgKF9yZXNwb25zZS52YWx1ZVtpZHggKyAxXT8ua2luZCA9PT0gJ2NvZGVibG9ja1VyaScgJiYgX3Jlc3BvbnNlLnZhbHVlW2lkeCAtIDFdPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0aWR4LS07XG5cdFx0fVxuXG5cdFx0c3VwZXIoaWR4ID09PSAtMSA/IF9yZXNwb25zZS52YWx1ZS5zbGljZSgpIDogX3Jlc3BvbnNlLnZhbHVlLnNsaWNlKDAsIGlkeCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNwb25zZSBleHRlbmRzIEFic3RyYWN0UmVzcG9uc2UgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9hY3RpdmVSZWFzb25pbmc6IHsgcGFydDogSUNoYXRUaGlua2luZ1BhcnQ7IHN0YXJ0ZWRBdDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VWYWx1ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgX2NpdGF0aW9uczogSUNoYXRDb2RlQ2l0YXRpb25bXSA9IFtdO1xuXG5cblx0Y29uc3RydWN0b3IodmFsdWU6IElNYXJrZG93blN0cmluZyB8IFJlYWRvbmx5QXJyYXk8U2VyaWFsaXplZENoYXRSZXNwb25zZVBhcnQ+KSB7XG5cdFx0c3VwZXIoYXNBcnJheSh2YWx1ZSkubWFwKCh2KSA9PiAoXG5cdFx0XHQna2luZCcgaW4gdiA/IHYgOlxuXHRcdFx0XHRpc01hcmtkb3duU3RyaW5nKHYpID8geyBjb250ZW50OiB2LCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9IHNhdGlzZmllcyBJQ2hhdE1hcmtkb3duQ29udGVudCA6XG5cdFx0XHRcdFx0eyBraW5kOiAndHJlZURhdGEnLCB0cmVlRGF0YTogdiB9XG5cdFx0KSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZmluYWxpemVSZWFzb25pbmdEdXJhdGlvbigpO1xuXHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMgPSBbXTtcblx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZCh0cnVlKTtcblx0fVxuXG5cdGNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uKG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmFsaXplUmVhc29uaW5nRHVyYXRpb24oKTtcblx0XHQvLyBsb29rIHRocm91Z2ggdGhlIHJlc3BvbnNlIHBhcnRzIGFuZCBmaW5kIHRoZSBsYXN0IHRvb2wgaW52b2NhdGlvbiwgdGhlbiBzbGljZSB0aGUgcmVzcG9uc2UgcGFydHMgdG8gdGhhdCBwb2ludFxuXHRcdGxldCBsYXN0VG9vbEludm9jYXRpb25JbmRleCA9IC0xO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9yZXNwb25zZVBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fcmVzcG9uc2VQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0XHRsYXN0VG9vbEludm9jYXRpb25JbmRleCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobGFzdFRvb2xJbnZvY2F0aW9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzID0gdGhpcy5fcmVzcG9uc2VQYXJ0cy5zbGljZSgwLCBsYXN0VG9vbEludm9jYXRpb25JbmRleCArIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzID0gW107XG5cdFx0fVxuXHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2goeyBraW5kOiAnd2FybmluZycsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlKSB9KTtcblx0XHR9XG5cdFx0dGhpcy5fY29udGVudENoYW5nZWQodHJ1ZSk7XG5cdH1cblxuXHR1cGRhdGVDb250ZW50KHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHwgSUNoYXRUZXh0RWRpdCB8IElDaGF0Tm90ZWJvb2tFZGl0IHwgSUNoYXRUYXNrIHwgSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlLCBxdWlldD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocHJvZ3Jlc3Mua2luZCAhPT0gJ3RoaW5raW5nJykge1xuXHRcdFx0dGhpcy5maW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICdjbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbicpIHtcblx0XHRcdGlmIChwcm9ncmVzcy5yZWFzb24gPT09IENoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uLkNvcHlyaWdodENvbnRlbnRSZXRyeSkge1xuXHRcdFx0XHR0aGlzLmNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uKGxvY2FsaXplKCdjb3B5cmlnaHRDb250ZW50UmV0cnknLCBcIlJlc3BvbnNlIGNsZWFyZWQgZHVlIHRvIHBvc3NpYmxlIG1hdGNoIHRvIHB1YmxpYyBjb2RlLCByZXRyeWluZyB3aXRoIG1vZGlmaWVkIHByb21wdC5cIikpO1xuXHRcdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5yZWFzb24gPT09IENoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uLkZpbHRlcmVkQ29udGVudFJldHJ5KSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb24obG9jYWxpemUoJ2ZpbHRlcmVkQ29udGVudFJldHJ5JywgXCJSZXNwb25zZSBjbGVhcmVkIGR1ZSB0byBjb250ZW50IHNhZmV0eSBmaWx0ZXJzLCByZXRyeWluZyB3aXRoIG1vZGlmaWVkIHByb21wdC5cIikpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpIHtcblxuXHRcdFx0Ly8gbGFzdCByZXNwb25zZSB3aGljaCBpcyBOT1QgYSB0ZXh0IGVkaXQgZ3JvdXAgYmVjYXVzZSB3ZSBkbyB3YW50IHRvIHN1cHBvcnQgaGV0ZXJvZ2Vub3VzIHN0cmVhbWluZyBidXQgbm90IGhhdmVcblx0XHRcdC8vIHRoZSBNRCBiZSBjaG9wcGVkIHVwIGJ5IHRleHQgZWRpdCBncm91cHMgKGFuZCBsaWtlbHkgb3RoZXIgbm9uLXJlbmRlcmFibGUgcGFydHMpXG5cdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VQYXJ0ID0gdGhpcy5fcmVzcG9uc2VQYXJ0c1xuXHRcdFx0XHQuZmlsdGVyKHAgPT4gcC5raW5kICE9PSAndGV4dEVkaXRHcm91cCcpXG5cdFx0XHRcdC5hdCgtMSk7XG5cblx0XHRcdGlmICghbGFzdFJlc3BvbnNlUGFydCB8fCBsYXN0UmVzcG9uc2VQYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnIHx8ICFjYW5NZXJnZU1hcmtkb3duU3RyaW5ncyhsYXN0UmVzcG9uc2VQYXJ0LmNvbnRlbnQsIHByb2dyZXNzLmNvbnRlbnQpKSB7XG5cdFx0XHRcdC8vIFRoZSBsYXN0IHBhcnQgY2FuJ3QgYmUgbWVyZ2VkIHdpdGgtIG5vdCBtYXJrZG93biwgb3IgbWFya2Rvd24gd2l0aCBkaWZmZXJlbnQgcGVybWlzc2lvbnNcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERvbid0IG1vZGlmeSB0aGUgY3VycmVudCBvYmplY3QsIHNpbmNlIGl0J3MgYmVpbmcgZGlmZmVkIGJ5IHRoZSByZW5kZXJlclxuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLl9yZXNwb25zZVBhcnRzLmluZGV4T2YobGFzdFJlc3BvbnNlUGFydCk7XG5cdFx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHNbaWR4XSA9IHsgLi4ubGFzdFJlc3BvbnNlUGFydCwgY29udGVudDogYXBwZW5kTWFya2Rvd25TdHJpbmcobGFzdFJlc3BvbnNlUGFydC5jb250ZW50LCBwcm9ncmVzcy5jb250ZW50KSB9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RoaW5raW5nJykge1xuXG5cdFx0XHQvLyB0cmllcyB0byBzcGxpdCB0aGlua2luZyBjaHVua3MgaWYgaXQgaXMgYW4gYXJyYXkuIG9ubHkgd2hpbGUgY2VydGFpbiBtb2RlbHMgZ2l2ZSB1cyBhcnJheSBjaHVua3MuXG5cdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VQYXJ0ID0gdGhpcy5fcmVzcG9uc2VQYXJ0c1xuXHRcdFx0XHQuZmlsdGVyKHAgPT4gcC5raW5kICE9PSAndGV4dEVkaXRHcm91cCcpXG5cdFx0XHRcdC5hdCgtMSk7XG5cblx0XHRcdGNvbnN0IGxhc3RUZXh0ID0gbGFzdFJlc3BvbnNlUGFydCAmJiBsYXN0UmVzcG9uc2VQYXJ0LmtpbmQgPT09ICd0aGlua2luZydcblx0XHRcdFx0PyAoQXJyYXkuaXNBcnJheShsYXN0UmVzcG9uc2VQYXJ0LnZhbHVlKSA/IGxhc3RSZXNwb25zZVBhcnQudmFsdWUuam9pbignJykgOiAobGFzdFJlc3BvbnNlUGFydC52YWx1ZSB8fCAnJykpXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRjb25zdCBjdXJyVGV4dCA9IEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MudmFsdWUpID8gcHJvZ3Jlc3MudmFsdWUuam9pbignJykgOiAocHJvZ3Jlc3MudmFsdWUgfHwgJycpO1xuXHRcdFx0Y29uc3QgaXNFbXB0eSA9IChzOiBzdHJpbmcpID0+IHMubGVuZ3RoID09PSAwO1xuXHRcdFx0aWYgKGlzRW1wdHkoY3VyclRleHQpKSB7XG5cdFx0XHRcdHRoaXMuZmluYWxpemVSZWFzb25pbmdEdXJhdGlvbigpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5fYWN0aXZlUmVhc29uaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVJlYXNvbmluZyA9IHsgcGFydDogcHJvZ3Jlc3MsIHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3QgbWVyZ2UgaWYgZWl0aGVyIHRoZSBjdXJyZW50IG9yIGxhc3QgdGhpbmtpbmcgY2h1bmsgaXMgZW1wdHk7IGVtcHR5IGNodW5rcyBzZXBhcmF0ZSB0aGlua2luZ1xuXHRcdFx0aWYgKCFsYXN0UmVzcG9uc2VQYXJ0XG5cdFx0XHRcdHx8IGxhc3RSZXNwb25zZVBhcnQua2luZCAhPT0gJ3RoaW5raW5nJ1xuXHRcdFx0XHR8fCBpc0VtcHR5KGN1cnJUZXh0KVxuXHRcdFx0XHR8fCBpc0VtcHR5KGxhc3RUZXh0KVxuXHRcdFx0XHR8fCAhY2FuTWVyZ2VNYXJrZG93blN0cmluZ3MobmV3IE1hcmtkb3duU3RyaW5nKGxhc3RUZXh0KSwgbmV3IE1hcmtkb3duU3RyaW5nKGN1cnJUZXh0KSkpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuX3Jlc3BvbnNlUGFydHMuaW5kZXhPZihsYXN0UmVzcG9uc2VQYXJ0KTtcblx0XHRcdFx0Y29uc3QgbWVyZ2VkUGFydDogSUNoYXRUaGlua2luZ1BhcnQgPSB7XG5cdFx0XHRcdFx0Li4ubGFzdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHR2YWx1ZTogYXBwZW5kTWFya2Rvd25TdHJpbmcobmV3IE1hcmtkb3duU3RyaW5nKGxhc3RUZXh0KSwgbmV3IE1hcmtkb3duU3RyaW5nKGN1cnJUZXh0KSkudmFsdWVcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0c1tpZHhdID0gbWVyZ2VkUGFydDtcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVJlYXNvbmluZz8ucGFydCA9PT0gbGFzdFJlc3BvbnNlUGFydCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVJlYXNvbmluZy5wYXJ0ID0gbWVyZ2VkUGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RleHRFZGl0JyB8fCBwcm9ncmVzcy5raW5kID09PSAnbm90ZWJvb2tFZGl0Jykge1xuXHRcdFx0Ly8gbWVyZ2UgZWRpdHMgZm9yIHRoZSBzYW1lIGZpbGUgbm8gbWF0dGVyIHdoZW4gdGhleSBjb21lIGluXG5cdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IENlbGxVcmkucGFyc2UocHJvZ3Jlc3MudXJpKT8ubm90ZWJvb2s7XG5cdFx0XHRjb25zdCB1cmkgPSBub3RlYm9va1VyaSA/PyBwcm9ncmVzcy51cmk7XG5cdFx0XHRjb25zdCBpc0V4dGVybmFsRWRpdCA9IHByb2dyZXNzLmlzRXh0ZXJuYWxFZGl0O1xuXG5cdFx0XHRpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RleHRFZGl0JyAmJiAhbm90ZWJvb2tVcmkpIHtcblx0XHRcdFx0Ly8gVGV4dCBlZGl0cyB0byBhIHJlZ3VsYXIgKG5vbi1ub3RlYm9vaykgZmlsZVxuXHRcdFx0XHR0aGlzLl9tZXJnZU9yUHVzaFRleHRFZGl0R3JvdXAodXJpLCBwcm9ncmVzcy5lZGl0cywgcHJvZ3Jlc3MuZG9uZSwgaXNFeHRlcm5hbEVkaXQpO1xuXHRcdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAndGV4dEVkaXQnKSB7XG5cdFx0XHRcdC8vIFRleHQgZWRpdHMgdG8gYSBub3RlYm9vayBjZWxsIC0gY29udmVydCB0byBJQ2VsbFRleHRFZGl0T3BlcmF0aW9uXG5cdFx0XHRcdGNvbnN0IGNlbGxFZGl0cyA9IHByb2dyZXNzLmVkaXRzLm1hcChlZGl0ID0+ICh7IHVyaTogcHJvZ3Jlc3MudXJpLCBlZGl0IH0pKTtcblx0XHRcdFx0dGhpcy5fbWVyZ2VPclB1c2hOb3RlYm9va0VkaXRHcm91cCh1cmksIGNlbGxFZGl0cywgcHJvZ3Jlc3MuZG9uZSwgaXNFeHRlcm5hbEVkaXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm90ZWJvb2sgY2VsbCBlZGl0cyAoSUNlbGxFZGl0T3BlcmF0aW9uKVxuXHRcdFx0XHR0aGlzLl9tZXJnZU9yUHVzaE5vdGVib29rRWRpdEdyb3VwKHVyaSwgcHJvZ3Jlc3MuZWRpdHMsIHByb2dyZXNzLmRvbmUsIGlzRXh0ZXJuYWxFZGl0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdwcm9ncmVzc1Rhc2snKSB7XG5cdFx0XHQvLyBBZGQgYSBuZXcgcmVzb2x2aW5nIHBhcnRcblx0XHRcdGNvbnN0IHJlc3BvbnNlUG9zaXRpb24gPSB0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2gocHJvZ3Jlc3MpIC0gMTtcblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblxuXHRcdFx0Y29uc3QgZGlzcCA9IHByb2dyZXNzLm9uRGlkQWRkUHJvZ3Jlc3MoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cHJvZ3Jlc3MudGFzaz8uKCkudGhlbigoY29udGVudCkgPT4ge1xuXHRcdFx0XHQvLyBTdG9wIGxpc3RlbmluZyBmb3IgcHJvZ3Jlc3MgdXBkYXRlcyBvbmNlIHRoZSB0YXNrIHNldHRsZXNcblx0XHRcdFx0ZGlzcC5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgcmVzb2x2aW5nIHBhcnQncyBjb250ZW50IHdpdGggdGhlIHJlc29sdmVkIHJlc3BvbnNlXG5cdFx0XHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHQodGhpcy5fcmVzcG9uc2VQYXJ0c1tyZXNwb25zZVBvc2l0aW9uXSBhcyBJQ2hhdFRhc2spLmNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQoZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJlZ2lzdGVyQXV0b3J1blNlbGZEaXNwb3NhYmxlKHRoaXMuX3N0b3JlLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRwcm9ncmVzcy5zdGF0ZS5yZWFkKHJlYWRlcik7IC8vIHVwZGF0ZSByZXByIHdoZW4gc3RhdGUgY2hhbmdlc1xuXHRcdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChmYWxzZSk7XG5cblx0XHRcdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShwcm9ncmVzcywgcmVhZGVyKSkge1xuXHRcdFx0XHRcdHJlYWRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJykge1xuXHRcdFx0dGhpcy5faGFuZGxlRXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZShwcm9ncmVzcyk7XG5cdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChxdWlldCk7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAncHJvZ3Jlc3NNZXNzYWdlJyAmJiBwcm9ncmVzcy5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLl9yZXNwb25zZVBhcnRzLmZpbmRJbmRleChwID0+IHAua2luZCA9PT0gJ3Byb2dyZXNzTWVzc2FnZScgJiYgcC5pZCA9PT0gcHJvZ3Jlc3MuaWQpO1xuXHRcdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHNbaWR4XSA9IHByb2dyZXNzO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyB0aGUgZHVyYXRpb24gb2YgdGhlIGFjdGl2ZSByZWFzb25pbmcgaW50ZXJ2YWwuXG5cdCAqL1xuXHRmaW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlUmVhc29uaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZlUmVhc29uaW5nLnBhcnQucmVhc29uaW5nRHVyYXRpb25NcyA9IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSB0aGlzLl9hY3RpdmVSZWFzb25pbmcuc3RhcnRlZEF0KTtcblx0XHR0aGlzLl9hY3RpdmVSZWFzb25pbmcgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ2l0YXRpb24oY2l0YXRpb246IElDaGF0Q29kZUNpdGF0aW9uKSB7XG5cdFx0dGhpcy5fY2l0YXRpb25zLnB1c2goY2l0YXRpb24pO1xuXHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUlubGluZVJlZmVyZW5jZShyZXNvbHZlSWQ6IHN0cmluZywgcmVzb2x2ZWRSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVzcG9uc2VQYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jlc3BvbnNlUGFydHNbaV07XG5cdFx0XHRpZiAoY3VycmVudC5raW5kICE9PSAnaW5saW5lUmVmZXJlbmNlJyB8fCBjdXJyZW50LnJlc29sdmVJZCAhPT0gcmVzb2x2ZUlkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzW2ldID0ge1xuXHRcdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHJlc29sdmVkUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZSxcblx0XHRcdFx0bmFtZTogcmVzb2x2ZWRSZWZlcmVuY2UubmFtZSA/PyBjdXJyZW50Lm5hbWUsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX21lcmdlT3JQdXNoVGV4dEVkaXRHcm91cCh1cmk6IFVSSSwgZWRpdHM6IFRleHRFZGl0W10sIGRvbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGlzRXh0ZXJuYWxFZGl0OiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fcmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5raW5kID09PSAndGV4dEVkaXRHcm91cCcgJiYgIWNhbmRpZGF0ZS5kb25lICYmIGlzRXF1YWwoY2FuZGlkYXRlLnVyaSwgdXJpKSkge1xuXHRcdFx0XHRjYW5kaWRhdGUuZWRpdHMucHVzaChlZGl0cyk7XG5cdFx0XHRcdGNhbmRpZGF0ZS5kb25lID0gZG9uZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2goeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaSwgZWRpdHM6IFtlZGl0c10sIGRvbmUsIGlzRXh0ZXJuYWxFZGl0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VPclB1c2hOb3RlYm9va0VkaXRHcm91cCh1cmk6IFVSSSwgZWRpdHM6IElDZWxsVGV4dEVkaXRPcGVyYXRpb25bXSB8IElDZWxsRWRpdE9wZXJhdGlvbltdLCBkb25lOiBib29sZWFuIHwgdW5kZWZpbmVkLCBpc0V4dGVybmFsRWRpdDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX3Jlc3BvbnNlUGFydHMpIHtcblx0XHRcdGlmIChjYW5kaWRhdGUua2luZCA9PT0gJ25vdGVib29rRWRpdEdyb3VwJyAmJiAhY2FuZGlkYXRlLmRvbmUgJiYgaXNFcXVhbChjYW5kaWRhdGUudXJpLCB1cmkpKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZS5lZGl0cy5wdXNoKGVkaXRzKTtcblx0XHRcdFx0Y2FuZGlkYXRlLmRvbmUgPSBkb25lO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMucHVzaCh7IGtpbmQ6ICdub3RlYm9va0VkaXRHcm91cCcsIHVyaSwgZWRpdHM6IFtlZGl0c10sIGRvbmUsIGlzRXh0ZXJuYWxFZGl0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZShwcm9ncmVzczogSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlKTogdm9pZCB7XG5cdFx0Ly8gTG9vayBmb3IgZXhpc3RpbmcgaW52b2NhdGlvbiBpbiB0aGUgcmVzcG9uc2UgcGFydHNcblx0XHRjb25zdCBleGlzdGluZ0ludm9jYXRpb24gPSB0aGlzLl9yZXNwb25zZVBhcnRzLmZpbmRMYXN0KFxuXHRcdFx0KHBhcnQpOiBwYXJ0IGlzIENoYXRUb29sSW52b2NhdGlvbiA9PiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgcGFydC50b29sQ2FsbElkID09PSBwcm9ncmVzcy50b29sQ2FsbElkXG5cdFx0KTtcblxuXHRcdGlmIChleGlzdGluZ0ludm9jYXRpb24pIHtcblx0XHRcdGlmIChwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZXhpc3RpbmdJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2dyZXNzLmlzQ29tcGxldGUpIHtcblx0XHRcdFx0ZXhpc3RpbmdJbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHtcblx0XHRcdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IHByb2dyZXNzLmVycm9yTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sUmVzdWx0RGV0YWlsczogcHJvZ3Jlc3MucmVzdWx0RGV0YWlsc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgZXh0ZXJuYWwgdG9vbCBpbnZvY2F0aW9uXG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiBwcm9ncmVzcy50b29sTmFtZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsXG5cdFx0XHRkaXNwbGF5TmFtZTogcHJvZ3Jlc3MudG9vbE5hbWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBwcm9ncmVzcy50b29sTmFtZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwcm9ncmVzcy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogcHJvZ3Jlc3MudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR0b29sRGF0YSxcblx0XHRcdHByb2dyZXNzLnRvb2xDYWxsSWQsXG5cdFx0XHRwcm9ncmVzcy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdHVuZGVmaW5lZCwgLy8gcGFyYW1ldGVyc1xuXHRcdFx0e30sXG5cdFx0XHR1bmRlZmluZWQgLy8gY2hhdFJlcXVlc3RJZFxuXHRcdCk7XG5cblx0XHRpZiAocHJvZ3Jlc3MuaXNDb21wbGV0ZSkge1xuXHRcdFx0Ly8gQWxyZWFkeSBjb21wbGV0ZWQgb24gZmlyc3QgcHVzaFxuXHRcdFx0aWYgKHByb2dyZXNzLnRvb2xTcGVjaWZpY0RhdGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0fVxuXHRcdFx0aW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbCh7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBwcm9ncmVzcy5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiBwcm9ncmVzcy5yZXN1bHREZXRhaWxzXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2goaW52b2NhdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZVJlcHIoKTogc3RyaW5nIHtcblx0XHRsZXQgcmVwciA9IHN1cGVyLmNvbXB1dGVSZXByKCk7XG5cdFx0aWYgKHRoaXMuX2NpdGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJlcHIgKz0gJ1xcblxcbicgKyBnZXRDb2RlQ2l0YXRpb25zTWVzc2FnZSh0aGlzLl9jaXRhdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVwcjtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRlbnRDaGFuZ2VkKHF1aWV0PzogYm9vbGVhbikge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVSZXByKCk7XG5cdFx0aWYgKCFxdWlldCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZU1vZGVsUGFyYW1ldGVycyB7XG5cdHJlc3BvbnNlQ29udGVudDogSU1hcmtkb3duU3RyaW5nIHwgUmVhZG9ubHlBcnJheTxTZXJpYWxpemVkQ2hhdFJlc3BvbnNlUGFydD47XG5cdHNlc3Npb246IENoYXRNb2RlbDtcblx0YWdlbnQ/OiBJQ2hhdEFnZW50RGF0YTtcblx0c2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdHZvdGU/OiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uO1xuXHRyZXN1bHQ/OiBJQ2hhdEFnZW50UmVzdWx0O1xuXHRmb2xsb3d1cHM/OiBSZWFkb25seUFycmF5PElDaGF0Rm9sbG93dXA+O1xuXHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0PzogYm9vbGVhbjtcblx0c2hvdWxkQmVSZW1vdmVkT25TZW5kPzogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQ7XG5cdHNob3VsZEJlQmxvY2tlZD86IGJvb2xlYW47XG5cdHJlc3RvcmVkSWQ/OiBzdHJpbmc7XG5cdG1vZGVsU3RhdGU/OiBSZXNwb25zZU1vZGVsU3RhdGVUO1xuXHRjb21wbGV0aW9uVGltZXN0YW1wPzogbnVtYmVyIHwgbnVsbDtcblx0dGltZVNwZW50V2FpdGluZz86IG51bWJlcjtcblx0ZWxhcHNlZE1zPzogbnVtYmVyO1xuXHQvKipcblx0ICogdW5kZWZpbmVkIG1lYW5zIGl0IHdpbGwgYmUgc2V0IGxhdGVyLlxuXHQqL1xuXHRjb2RlQmxvY2tJbmZvczogSUNvZGVCbG9ja0luZm9bXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHR5cGUgUmVzcG9uc2VNb2RlbFN0YXRlVCA9XG5cdHwgeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfVxuXHR8IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0IH1cblx0fCB7IHZhbHVlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUgfCBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkIHwgUmVzcG9uc2VNb2RlbFN0YXRlLkZhaWxlZDsgY29tcGxldGVkQXQ6IG51bWJlciB9O1xuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRSZXNwb25zZU1vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cHJpdmF0ZSBfc2Vzc2lvbjogQ2hhdE1vZGVsO1xuXHRwcml2YXRlIF9hZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NsYXNoQ29tbWFuZDogSUNoYXRBZ2VudENvbW1hbmQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8UmVzcG9uc2VNb2RlbFN0YXRlVD4odGhpcywgeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfSk7XG5cdHByaXZhdGUgX3ZvdGU/OiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uO1xuXHRwcml2YXRlIF9yZXN1bHQ/OiBJQ2hhdEFnZW50UmVzdWx0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91c2FnZU9icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFVzYWdlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIF9wYXJlbnRVc2FnZTogSUNoYXRVc2FnZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3ViYWdlbnRDb3BpbG90Q3JlZGl0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25Ub2tlbkNvdW50T2JzID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSBfc2hvdWxkQmVSZW1vdmVkT25TZW5kOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3VsZEJlQmxvY2tlZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVzdGFtcDogbnVtYmVyO1xuXHRwcml2YXRlIF9jb21wbGV0aW9uVGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpbWVTcGVudFdhaXRpbmdBY2N1bXVsYXRvcjogbnVtYmVyO1xuXHRwcml2YXRlIF9lbGFwc2VkTXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXA6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cblx0cHVibGljIGdldCBzaG91bGRCZUJsb2NrZWQoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9zaG91bGRCZUJsb2NrZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHJlcXVlc3QoKTogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlc3Npb24uZ2V0UmVxdWVzdHMoKS5maW5kKHIgPT4gci5pZCA9PT0gdGhpcy5yZXF1ZXN0SWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBzZXNzaW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uO1xuXHR9XG5cblx0cHVibGljIGdldCBzaG91bGRCZVJlbW92ZWRPblNlbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDb21wbGV0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSAhPT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgJiYgdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSAhPT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRpbWVzdGFtcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90aW1lc3RhbXA7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHNob3VsZEJlUmVtb3ZlZE9uU2VuZChkaXNhYmxlbWVudDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkQmVSZW1vdmVkT25TZW5kID09PSBkaXNhYmxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IGRpc2FibGVtZW50O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDYW5jZWxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGVkQXQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX21vZGVsU3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUgfHwgc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQgfHwgc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5GYWlsZWQpIHtcblx0XHRcdHJldHVybiBzdGF0ZS5jb21wbGV0ZWRBdDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGlvblRpbWVzdGFtcCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9uVGltZXN0YW1wO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGF0ZSgpOiBSZXNwb25zZU1vZGVsU3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZTtcblx0XHRpZiAoc3RhdGUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSAmJiAhIXRoaXMuX3Jlc3VsdD8uZXJyb3JEZXRhaWxzICYmIHRoaXMucmVzdWx0Py5lcnJvckRldGFpbHM/LmNvZGUgIT09ICdjYW5jZWxlZCcpIHtcblx0XHRcdC8vIFRoaXMgY2hlY2sgY292ZXJzIHNlc3Npb25zIGNyZWF0ZWQgaW4gcHJldmlvdXMgdnNjb2RlIHZlcnNpb25zIHdoaWNoIHNhdmVkIGEgZmFpbGVkIHJlc3BvbnNlIGFzICdDb21wbGV0ZSdcblx0XHRcdHJldHVybiBSZXNwb25zZU1vZGVsU3RhdGUuRmFpbGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3RhdGVUKCk6IFJlc3BvbnNlTW9kZWxTdGF0ZVQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFN0YXRlLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGdldCB2b3RlKCk6IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl92b3RlO1xuXHR9XG5cblx0cHVibGljIGdldCBmb2xsb3d1cHMoKTogSUNoYXRGb2xsb3d1cFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9sbG93dXBzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzcG9uc2U6IFJlc3BvbnNlO1xuXHRwcml2YXRlIF9maW5hbGl6ZWRSZXNwb25zZT86IElSZXNwb25zZTtcblx0cHVibGljIGdldCBlbnRpcmVSZXNwb25zZSgpOiBJUmVzcG9uc2Uge1xuXHRcdHJldHVybiB0aGlzLl9maW5hbGl6ZWRSZXNwb25zZSB8fCB0aGlzLl9yZXNwb25zZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcmVzdWx0KCk6IElDaGF0QWdlbnRSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHVzYWdlKCk6IElDaGF0VXNhZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl91c2FnZU9icy5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXNhZ2VPYnMoKTogSU9ic2VydmFibGU8SUNoYXRVc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl91c2FnZU9icztcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGlvblRva2VuQ291bnQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcGxldGlvblRva2VuQ291bnRPYnMuZ2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbXBsZXRpb25Ub2tlbkNvdW50T2JzKCk6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9uVG9rZW5Db3VudE9icztcblx0fVxuXG5cdHB1YmxpYyBnZXQgZWxhcHNlZE1zKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsYXBzZWRNcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXNlcm5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnJlc3BvbmRlclVzZXJuYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9sbG93dXBzPzogSUNoYXRGb2xsb3d1cFtdO1xuXG5cdHB1YmxpYyBnZXQgYWdlbnQoKTogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2xhc2hDb21tYW5kKCk6IElDaGF0QWdlbnRDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2xhc2hDb21tYW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlZENvbnRleHQ6IElDaGF0VXNlZENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgdXNlZENvbnRleHQoKTogSUNoYXRVc2VkQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzZWRDb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFJlZmVyZW5jZXM6IElDaGF0Q29udGVudFJlZmVyZW5jZVtdID0gW107XG5cdHB1YmxpYyBnZXQgY29udGVudFJlZmVyZW5jZXMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9jb250ZW50UmVmZXJlbmNlcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlQ2l0YXRpb25zOiBJQ2hhdENvZGVDaXRhdGlvbltdID0gW107XG5cdHB1YmxpYyBnZXQgY29kZUNpdGF0aW9ucygpOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVDaXRhdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc01lc3NhZ2VzOiBJQ2hhdFByb2dyZXNzTWVzc2FnZVtdID0gW107XG5cdHB1YmxpYyBnZXQgcHJvZ3Jlc3NNZXNzYWdlcygpOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2dyZXNzTWVzc2FnZXM7XG5cdH1cblxuXHRwcml2YXRlIF9pc1N0YWxlOiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgaXNTdGFsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNTdGFsZTtcblx0fVxuXG5cblx0cmVhZG9ubHkgaXNQZW5kaW5nQ29uZmlybWF0aW9uOiBJT2JzZXJ2YWJsZTx7IHN0YXJ0ZWRXYWl0aW5nQXQ6IG51bWJlcjsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IGlzSW5Qcm9ncmVzczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbmV2ZXIgdGhpcyByZXNwb25zZSBoYXMgbm90IHJlYWNoZWQgYSB0ZXJtaW5hbCBzdGF0ZSB5ZXQuXG5cdCAqIFVubGlrZSB7QGxpbmsgaXNJblByb2dyZXNzfSwgdGhpcyByZW1haW5zIHRydWUgZHVyaW5nIHRvb2wgY29uZmlybWF0aW9ucyxcblx0ICogZWxpY2l0YXRpb25zLCBhbmQgYW55IG90aGVyIGludGVybWVkaWF0ZSBzdGF0ZS4gSXQgb25seSBiZWNvbWVzIGZhbHNlIHdoZW5cblx0ICogdGhlIHJlc3BvbnNlIGNvbXBsZXRlcywgaXMgY2FuY2VsbGVkLCBvciBmYWlscy5cblx0ICovXG5cdHJlYWRvbmx5IGlzSW5jb21wbGV0ZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfcmVzcG9uc2VWaWV3PzogUmVzcG9uc2VWaWV3O1xuXHRwdWJsaWMgZ2V0IHJlc3BvbnNlKCk6IElSZXNwb25zZSB7XG5cdFx0Y29uc3QgdW5kb1N0b3AgPSB0aGlzLl9zaG91bGRCZVJlbW92ZWRPblNlbmQ/LmFmdGVyVW5kb1N0b3A7XG5cdFx0aWYgKCF1bmRvU3RvcCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmFsaXplZFJlc3BvbnNlIHx8IHRoaXMuX3Jlc3BvbnNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZXNwb25zZVZpZXc/LnVuZG9TdG9wICE9PSB1bmRvU3RvcCkge1xuXHRcdFx0dGhpcy5fcmVzcG9uc2VWaWV3ID0gbmV3IFJlc3BvbnNlVmlldyh0aGlzLl9yZXNwb25zZSwgdW5kb1N0b3ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNwb25zZVZpZXc7XG5cdH1cblxuXHRwcml2YXRlIF9jb2RlQmxvY2tJbmZvczogSUNvZGVCbG9ja0luZm9bXSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBjb2RlQmxvY2tJbmZvcygpOiBJQ29kZUJsb2NrSW5mb1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29kZUJsb2NrSW5mb3M7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwYXJhbXM6IElDaGF0UmVzcG9uc2VNb2RlbFBhcmFtZXRlcnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHBhcmFtcy5zZXNzaW9uO1xuXHRcdHRoaXMuX2FnZW50ID0gcGFyYW1zLmFnZW50O1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZCA9IHBhcmFtcy5zbGFzaENvbW1hbmQ7XG5cdFx0dGhpcy5yZXF1ZXN0SWQgPSBwYXJhbXMucmVxdWVzdElkO1xuXHRcdHRoaXMuX3RpbWVzdGFtcCA9IHBhcmFtcy50aW1lc3RhbXAgfHwgRGF0ZS5ub3coKTtcblx0XHRpZiAocGFyYW1zLm1vZGVsU3RhdGUpIHtcblx0XHRcdHRoaXMuX21vZGVsU3RhdGUuc2V0KHBhcmFtcy5tb2RlbFN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21wbGV0aW9uVGltZXN0YW1wID0gcGFyYW1zLmNvbXBsZXRpb25UaW1lc3RhbXAgPT09IG51bGxcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHBhcmFtcy5jb21wbGV0aW9uVGltZXN0YW1wID8/IChwYXJhbXMubW9kZWxTdGF0ZSAmJiAnY29tcGxldGVkQXQnIGluIHBhcmFtcy5tb2RlbFN0YXRlID8gcGFyYW1zLm1vZGVsU3RhdGUuY29tcGxldGVkQXQgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RpbWVTcGVudFdhaXRpbmdBY2N1bXVsYXRvciA9IHBhcmFtcy50aW1lU3BlbnRXYWl0aW5nIHx8IDA7XG5cdFx0dGhpcy5fZWxhcHNlZE1zID0gcGFyYW1zLmVsYXBzZWRNcztcblx0XHR0aGlzLl92b3RlID0gcGFyYW1zLnZvdGU7XG5cdFx0dGhpcy5fcmVzdWx0ID0gcGFyYW1zLnJlc3VsdDtcblx0XHR0aGlzLl9mb2xsb3d1cHMgPSBwYXJhbXMuZm9sbG93dXBzID8gWy4uLnBhcmFtcy5mb2xsb3d1cHNdIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCA9IHBhcmFtcy5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0ID8/IGZhbHNlO1xuXHRcdHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHBhcmFtcy5zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdFx0dGhpcy5fc2hvdWxkQmVCbG9ja2VkLnNldChwYXJhbXMuc2hvdWxkQmVCbG9ja2VkID8/IGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gSWYgd2UgYXJlIGNyZWF0aW5nIGEgcmVzcG9uc2Ugd2l0aCBzb21lIGV4aXN0aW5nIGNvbnRlbnQsIGNvbnNpZGVyIGl0IHN0YWxlXG5cdFx0dGhpcy5faXNTdGFsZSA9IEFycmF5LmlzQXJyYXkocGFyYW1zLnJlc3BvbnNlQ29udGVudCkgJiYgKHBhcmFtcy5yZXNwb25zZUNvbnRlbnQubGVuZ3RoICE9PSAwIHx8IGlzTWFya2Rvd25TdHJpbmcocGFyYW1zLnJlc3BvbnNlQ29udGVudCkgJiYgcGFyYW1zLnJlc3BvbnNlQ29udGVudC52YWx1ZS5sZW5ndGggIT09IDApO1xuXG5cdFx0dGhpcy5fcmVzcG9uc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzcG9uc2UocGFyYW1zLnJlc3BvbnNlQ29udGVudCkpO1xuXHRcdHRoaXMuX2NvZGVCbG9ja0luZm9zID0gcGFyYW1zLmNvZGVCbG9ja0luZm9zID8gWy4uLnBhcmFtcy5jb2RlQmxvY2tJbmZvc10gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMub25EaWRDaGFuZ2UpO1xuXG5cdFx0Y29uc3QgX3BlbmRpbmdJbmZvID0gc2lnbmFsLm1hcCgoX3ZhbHVlLCByKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdHNpZ25hbC5yZWFkKHIpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5fcmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZTtcblx0XHRcdFx0XHRcdHJldHVybiB0aXRsZSA/IChpc01hcmtkb3duU3RyaW5nKHRpdGxlKSA/IHRpdGxlLnZhbHVlIDogdGl0bGUpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nRm9yUG9zdEFwcHJvdmFsJywgXCJBcHByb3ZlIHRvb2wgcmVzdWx0P1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nRm9yVG9vbEF1dGhlbnRpY2F0aW9uJywgXCJBdXRoZW50aWNhdGUgezB9IHRvIGNvbnRpbnVlLi4uXCIsIHN0YXRlLnNlcnZlci5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgJiYgIXBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQudGl0bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmICFwYXJ0LmlzVXNlZCkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnd2FpdGluZ0Fuc3dlcicsIFwiQW5zd2VyIHF1ZXN0aW9ucyB0byBjb250aW51ZS4uLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSAncGxhblJldmlldycgJiYgIXBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nUGxhblJldmlldycsIFwiUmV2aWV3IHRoZSBwbGFuIHRvIGNvbnRpbnVlLi4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInICYmIHBhcnQuc3RhdGUucmVhZChyKSA9PT0gRWxpY2l0YXRpb25TdGF0ZS5QZW5kaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGl0bGUgPSBwYXJ0LnRpdGxlO1xuXHRcdFx0XHRcdHJldHVybiBpc01hcmtkb3duU3RyaW5nKHRpdGxlKSA/IHRpdGxlLnZhbHVlIDogdGl0bGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IF9zdGFydGVkV2FpdGluZ0F0ID0gX3BlbmRpbmdJbmZvLm1hcChwID0+ICEhcCkubWFwKHAgPT4gcCA/IERhdGUubm93KCkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuaXNQZW5kaW5nQ29uZmlybWF0aW9uID0gX3N0YXJ0ZWRXYWl0aW5nQXQubWFwKCh3YWl0aW5nLCByKSA9PiB3YWl0aW5nID8geyBzdGFydGVkV2FpdGluZ0F0OiB3YWl0aW5nLCBkZXRhaWw6IF9wZW5kaW5nSW5mby5yZWFkKHIpIH0gOiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5pc0luUHJvZ3Jlc3MgPSBzaWduYWwubWFwKChfdmFsdWUsIHIpID0+IHtcblxuXHRcdFx0c2lnbmFsLnJlYWQocik7XG5cblx0XHRcdHJldHVybiAhX3BlbmRpbmdJbmZvLnJlYWQocilcblx0XHRcdFx0JiYgIXRoaXMuc2hvdWxkQmVSZW1vdmVkT25TZW5kXG5cdFx0XHRcdCYmICh0aGlzLl9tb2RlbFN0YXRlLnJlYWQocikudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIHx8IHRoaXMuX21vZGVsU3RhdGUucmVhZChyKS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pc0luY29tcGxldGUgPSB0aGlzLl9tb2RlbFN0YXRlLm1hcChzdGF0ZSA9PiB7XG5cdFx0XHRyZXR1cm4gc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIHx8IHN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc3BvbnNlLm9uRGlkQ2hhbmdlVmFsdWUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pKSk7XG5cdFx0dGhpcy5pZCA9IHBhcmFtcy5yZXN0b3JlZElkID8/ICdyZXNwb25zZV8nICsgZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRsZXQgbGFzdFN0YXJ0ZWRXYWl0aW5nQXQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsU3RhdGUuc2V0KHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0IH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmICghbGFzdFN0YXJ0ZWRXYWl0aW5nQXQpIHtcblx0XHRcdFx0XHRsYXN0U3RhcnRlZFdhaXRpbmdBdCA9IHBlbmRpbmcuc3RhcnRlZFdhaXRpbmdBdDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChsYXN0U3RhcnRlZFdhaXRpbmdBdCkge1xuXHRcdFx0XHQvLyBSZXN0b3JlIHN0YXRlIHRvIFBlbmRpbmcgaWYgaXQgd2FzIHNldCB0byBOZWVkc0lucHV0IGJ5IHRoaXMgb2JzZXJ2YWJsZVxuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWxTdGF0ZS5yZWFkKHJlYWRlcikudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxTdGF0ZS5zZXQoeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90aW1lU3BlbnRXYWl0aW5nQWNjdW11bGF0b3IgKz0gRGF0ZS5ub3coKSAtIGxhc3RTdGFydGVkV2FpdGluZ0F0O1xuXHRcdFx0XHRsYXN0U3RhcnRlZFdhaXRpbmdBdCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX3RpbWVzdGFtcCArIHRoaXMuX3RpbWVTcGVudFdhaXRpbmdBY2N1bXVsYXRvcjtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRpbml0aWFsaXplQ29kZUJsb2NrSW5mb3MoY29kZUJsb2NrSW5mbzogSUNvZGVCbG9ja0luZm9bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2RlQmxvY2tJbmZvcykge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ29kZSBibG9jayBpbmZvcyBoYXZlIGFscmVhZHkgYmVlbiBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9jb2RlQmxvY2tJbmZvcyA9IFsuLi5jb2RlQmxvY2tJbmZvXTtcblx0fVxuXG5cdHNldEJsb2NrZWRTdGF0ZShpc0Jsb2NrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRCZUJsb2NrZWQuc2V0KGlzQmxvY2tlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBhIHByb2dyZXNzIHVwZGF0ZSB0byB0aGUgYWN0dWFsIHJlc3BvbnNlIGNvbnRlbnQuXG5cdCAqL1xuXHR1cGRhdGVDb250ZW50KHJlc3BvbnNlUGFydDogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB8IElDaGF0VGV4dEVkaXQgfCBJQ2hhdE5vdGVib29rRWRpdCB8IElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSwgcXVpZXQ/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fcmVzcG9uc2UudXBkYXRlQ29udGVudChyZXNwb25zZVBhcnQsIHF1aWV0KTtcblx0fVxuXG5cdHJlc29sdmVJbmxpbmVSZWZlcmVuY2UocmVzb2x2ZUlkOiBzdHJpbmcsIHJlc29sdmVkUmVmZXJlbmNlOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzcG9uc2UucmVzb2x2ZUlubGluZVJlZmVyZW5jZShyZXNvbHZlSWQsIHJlc29sdmVkUmVmZXJlbmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIHVuZG8gc3RvcCBhdCB0aGUgY3VycmVudCBwb3NpdGlvbiBpbiB0aGUgc3RyZWFtLlxuXHQgKi9cblx0YWRkVW5kb1N0b3AodW5kb1N0b3A6IElDaGF0VW5kb1N0b3ApIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgcmVhc29uOiAndW5kb1N0b3AnLCBpZDogdW5kb1N0b3AuaWQgfSk7XG5cdFx0dGhpcy5fcmVzcG9uc2UudXBkYXRlQ29udGVudCh1bmRvU3RvcCwgdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgb25lIG9mIHRoZSBwcm9ncmVzcyB1cGRhdGVzIHRoYXQgYXJlIG5vdCBwYXJ0IG9mIHRoZSBhY3R1YWwgcmVzcG9uc2UgY29udGVudC5cblx0ICovXG5cdGFwcGx5UmVmZXJlbmNlKHByb2dyZXNzOiBJQ2hhdFVzZWRDb250ZXh0IHwgSUNoYXRDb250ZW50UmVmZXJlbmNlKSB7XG5cdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICd1c2VkQ29udGV4dCcpIHtcblx0XHRcdHRoaXMuX3VzZWRDb250ZXh0ID0gcHJvZ3Jlc3M7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAncmVmZXJlbmNlJykge1xuXHRcdFx0dGhpcy5fY29udGVudFJlZmVyZW5jZXMucHVzaChwcm9ncmVzcyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbik7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlDb2RlQ2l0YXRpb24ocHJvZ3Jlc3M6IElDaGF0Q29kZUNpdGF0aW9uKSB7XG5cdFx0dGhpcy5fY29kZUNpdGF0aW9ucy5wdXNoKHByb2dyZXNzKTtcblx0XHR0aGlzLl9yZXNwb25zZS5hZGRDaXRhdGlvbihwcm9ncmVzcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblx0c2V0QWdlbnQoYWdlbnQ6IElDaGF0QWdlbnREYXRhLCBzbGFzaENvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZCkge1xuXHRcdHRoaXMuX2FnZW50ID0gYWdlbnQ7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kID0gc2xhc2hDb21tYW5kO1xuXHRcdHRoaXMuX2FnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCA9ICFhZ2VudC5pc0RlZmF1bHQgfHwgISFzbGFzaENvbW1hbmQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblx0c2V0UmVzdWx0KHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCk6IHZvaWQge1xuXHRcdC8vIElmIGFscmVhZHkgY2FuY2VsbGVkLCBkaXNjYXJkIGVycm9yIGRldGFpbHMgZnJvbSBsYXRlLWFycml2aW5nIGFnZW50IHJlc3BvbnNlcy5cblx0XHRpZiAodGhpcy5pc0NhbmNlbGVkICYmIHJlc3VsdC5lcnJvckRldGFpbHMpIHtcblx0XHRcdGNvbnN0IHsgZXJyb3JEZXRhaWxzOiBfZXJyb3JEZXRhaWxzLCAuLi5yZXN0IH0gPSByZXN1bHQ7XG5cdFx0XHR0aGlzLl9yZXN1bHQgPSByZXN0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXN1bHQgPSByZXN1bHQ7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHNldFVzYWdlKHVzYWdlOiBJQ2hhdFVzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50VXNhZ2UgPSB1c2FnZTtcblx0XHR0aGlzLl9zZXRVc2FnZSh0aGlzLl93aXRoU3ViYWdlbnRDb3BpbG90Q3JlZGl0cyh1c2FnZSksIHRydWUpO1xuXHR9XG5cblx0c2V0U3ViYWdlbnRDb3BpbG90Q3JlZGl0cyhzdWJhZ2VudENhbGxJZDogc3RyaW5nLCBjb3BpbG90Q3JlZGl0czogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudENyZWRpdHMgPSB0aGlzLl9zdWJhZ2VudENvcGlsb3RDcmVkaXRzLmdldChzdWJhZ2VudENhbGxJZCk7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUoY29waWxvdENyZWRpdHMpIHx8IGNvcGlsb3RDcmVkaXRzIDwgMCB8fCAoY3VycmVudENyZWRpdHMgIT09IHVuZGVmaW5lZCAmJiBjb3BpbG90Q3JlZGl0cyA8PSBjdXJyZW50Q3JlZGl0cykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3ViYWdlbnRDb3BpbG90Q3JlZGl0cy5zZXQoc3ViYWdlbnRDYWxsSWQsIGNvcGlsb3RDcmVkaXRzKTtcblx0XHRjb25zdCB1c2FnZSA9IHRoaXMuX3BhcmVudFVzYWdlID8/IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAwLCBjb21wbGV0aW9uVG9rZW5zOiAwIH07XG5cdFx0dGhpcy5fc2V0VXNhZ2UodGhpcy5fd2l0aFN1YmFnZW50Q29waWxvdENyZWRpdHModXNhZ2UpLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF93aXRoU3ViYWdlbnRDb3BpbG90Q3JlZGl0cyh1c2FnZTogSUNoYXRVc2FnZSk6IElDaGF0VXNhZ2Uge1xuXHRcdGxldCBzdWJhZ2VudENvcGlsb3RDcmVkaXRzID0gMDtcblx0XHRmb3IgKGNvbnN0IGNyZWRpdHMgb2YgdGhpcy5fc3ViYWdlbnRDb3BpbG90Q3JlZGl0cy52YWx1ZXMoKSkge1xuXHRcdFx0c3ViYWdlbnRDb3BpbG90Q3JlZGl0cyArPSBjcmVkaXRzO1xuXHRcdH1cblx0XHRyZXR1cm4gc3ViYWdlbnRDb3BpbG90Q3JlZGl0cyA9PT0gMFxuXHRcdFx0PyB1c2FnZVxuXHRcdFx0OiB7IC4uLnVzYWdlLCBjb3BpbG90Q3JlZGl0czogKHVzYWdlLmNvcGlsb3RDcmVkaXRzID8/IDApICsgc3ViYWdlbnRDb3BpbG90Q3JlZGl0cyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VXNhZ2UodXNhZ2U6IElDaGF0VXNhZ2UsIGNvdW50Q29tcGxldGlvblRva2VuczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRVc2FnZSA9IHRoaXMuX3VzYWdlT2JzLmdldCgpO1xuXHRcdGlmIChjdXJyZW50VXNhZ2UgJiYgdGhpcy5pc1NhbWVVc2FnZShjdXJyZW50VXNhZ2UsIHVzYWdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgYSByZXBvcnQgZGVzY3JpYmluZyBhICpkaWZmZXJlbnQqIG1vZGVsIGNhbGwgYWRkcyB0byB0aGUgcnVubmluZ1xuXHRcdC8vIGNvbXBsZXRpb24tdG9rZW4gdG90YWwuIEEgYmFja2VuZCBjYW4gcmUtcmVwb3J0IG9uZSBjYWxsIHNldmVyYWwgdGltZXMgYXNcblx0XHQvLyBzbG93ZXItYXJyaXZpbmcgZGV0YWlsIHJlc29sdmVzIFx1MjAxNCB0aGUgYWdlbnQgaG9zdCByZS1lbWl0cyB3aXRoIHRoZSBjb250ZXh0XG5cdFx0Ly8gYXR0cmlidXRpb24gYW5kIHRoZSBzZXNzaW9uIGNvc3Qgb25jZSBpdHMgUlBDcyByZXR1cm4gXHUyMDE0IGFuZCB0aG9zZVxuXHRcdC8vIHJlZmluZW1lbnRzIG11c3QgdXBkYXRlIHRoZSBzdG9yZWQgdXNhZ2Ugd2l0aG91dCBiZWluZyBjb3VudGVkIGFnYWluLlxuXHRcdC8vXG5cdFx0Ly8gVHdvIGNvbnNlY3V0aXZlIGNhbGxzIHJlcG9ydGluZyBpZGVudGljYWwgdG9rZW5zIGFyZSBpbmRpc3Rpbmd1aXNoYWJsZSBoZXJlXG5cdFx0Ly8gYW5kIHRoZSBzZWNvbmQgaXMgdHJlYXRlZCBhcyBhIHJlZmluZW1lbnQuIFRoYXQgaXMgcHJlLWV4aXN0aW5nOiB0aGVcblx0XHQvLyBgaXNTYW1lVXNhZ2VgIGd1YXJkIGFscmVhZHkgZGlzY2FyZGVkIHN1Y2ggYSByZXBvcnQgd2hvbGVzYWxlLlxuXHRcdGNvbnN0IGlzTmV3Q2FsbCA9ICFjdXJyZW50VXNhZ2Vcblx0XHRcdHx8IGN1cnJlbnRVc2FnZS5wcm9tcHRUb2tlbnMgIT09IHVzYWdlLnByb21wdFRva2Vuc1xuXHRcdFx0fHwgY3VycmVudFVzYWdlLmNvbXBsZXRpb25Ub2tlbnMgIT09IHVzYWdlLmNvbXBsZXRpb25Ub2tlbnNcblx0XHRcdHx8IGN1cnJlbnRVc2FnZS5vdXRwdXRCdWZmZXIgIT09IHVzYWdlLm91dHB1dEJ1ZmZlcjtcblxuXHRcdHRoaXMuX3VzYWdlT2JzLnNldCh1c2FnZSwgdW5kZWZpbmVkKTtcblx0XHRpZiAoY291bnRDb21wbGV0aW9uVG9rZW5zICYmIGlzTmV3Q2FsbCkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNDb21wbGV0aW9uVG9rZW5zID0gdGhpcy5fY29tcGxldGlvblRva2VuQ291bnRPYnMuZ2V0KCkgPz8gMDtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Ub2tlbkNvdW50T2JzLnNldChwcmV2aW91c0NvbXBsZXRpb25Ub2tlbnMgKyB1c2FnZS5jb21wbGV0aW9uVG9rZW5zLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbik7XG5cdH1cblxuXHRzZXRFbGFwc2VkTXMoZWxhcHNlZE1zOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGFwc2VkTXMgPSBNYXRoLm1heCgwLCBlbGFwc2VkTXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NhbWVVc2FnZShjdXJyZW50VXNhZ2U6IElDaGF0VXNhZ2UsIHVzYWdlOiBJQ2hhdFVzYWdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGN1cnJlbnRVc2FnZS5wcm9tcHRUb2tlbnMgPT09IHVzYWdlLnByb21wdFRva2Vuc1xuXHRcdFx0JiYgY3VycmVudFVzYWdlLmNvbXBsZXRpb25Ub2tlbnMgPT09IHVzYWdlLmNvbXBsZXRpb25Ub2tlbnNcblx0XHRcdCYmIGN1cnJlbnRVc2FnZS5vdXRwdXRCdWZmZXIgPT09IHVzYWdlLm91dHB1dEJ1ZmZlclxuXHRcdFx0JiYgY3VycmVudFVzYWdlLmNvcGlsb3RDcmVkaXRzID09PSB1c2FnZS5jb3BpbG90Q3JlZGl0c1xuXHRcdFx0JiYgY3VycmVudFVzYWdlLnNlc3Npb25Db3BpbG90Q3JlZGl0cyA9PT0gdXNhZ2Uuc2Vzc2lvbkNvcGlsb3RDcmVkaXRzXG5cdFx0XHQmJiBlcXVhbHMoY3VycmVudFVzYWdlLnByb21wdFRva2VuRGV0YWlscywgdXNhZ2UucHJvbXB0VG9rZW5EZXRhaWxzKTtcblx0fVxuXG5cdGNvbXBsZXRlKGNvbXBsZXRlZEF0ID0gRGF0ZS5ub3coKSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBsZXRlKGNvbXBsZXRlZEF0LCBjb21wbGV0ZWRBdCk7XG5cdH1cblxuXHRjb21wbGV0ZVdpdGhvdXRUaW1lc3RhbXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcGxldGUoRGF0ZS5ub3coKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBsZXRlKGNvbXBsZXRlZEF0OiBudW1iZXIsIGNvbXBsZXRpb25UaW1lc3RhbXA6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIE5vLW9wIGlmIGl0J3MgYWxyZWFkeSBjb21wbGV0ZVxuXHRcdGlmICh0aGlzLmlzQ29tcGxldGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Jlc3VsdD8uZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzUmVkYWN0ZWQpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbnNlLmNsZWFyKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3BvbnNlLmZpbmFsaXplUmVhc29uaW5nRHVyYXRpb24oKTtcblxuXHRcdC8vIENvbXB1dGUgZWxhcHNlZCBnZW5lcmF0aW9uIHRpbWUgYmVmb3JlIHNldHRpbmcgdGVybWluYWwgc3RhdGVcblx0XHR0aGlzLl9lbGFwc2VkTXMgPz89IE1hdGgubWF4KDAsIGNvbXBsZXRlZEF0IC0gdGhpcy5jb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcC5nZXQoKSk7XG5cblx0XHQvLyBDYW5jZWxlZCBzZXNzaW9ucyBjYW4gYmUgY29uc2lkZXJlZCAnQ29tcGxldGUnXG5cdFx0Y29uc3Qgc3RhdGUgPSAhIXRoaXMuX3Jlc3VsdD8uZXJyb3JEZXRhaWxzICYmIHRoaXMuX3Jlc3VsdC5lcnJvckRldGFpbHMuY29kZSAhPT0gJ2NhbmNlbGVkJyA/IFJlc3BvbnNlTW9kZWxTdGF0ZS5GYWlsZWQgOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGU7XG5cdFx0dGhpcy5fY29tcGxldGlvblRpbWVzdGFtcCA9IGNvbXBsZXRpb25UaW1lc3RhbXA7XG5cdFx0dGhpcy5fbW9kZWxTdGF0ZS5zZXQoeyB2YWx1ZTogc3RhdGUsIGNvbXBsZXRlZEF0IH0sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHJlYXNvbjogJ2NvbXBsZXRlZFJlcXVlc3QnIH0pO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3BvbnNlLmZpbmFsaXplUmVhc29uaW5nRHVyYXRpb24oKTtcblx0XHQvLyBUcmFuc2l0aW9uIGFueSB0b29sIGludm9jYXRpb25zIHRoYXQgYXJlIHN0aWxsIHN0cmVhbWluZyBwYXJ0aWFsXG5cdFx0Ly8gaW5wdXQgZnJvbSB0aGUgTE0gaW50byB0aGUgQ2FuY2VsbGVkIHN0YXRlIHNvIHRoYXQgVUkgY29uc3VtZXJzXG5cdFx0Ly8gKGUuZy4gdGhlIHRoaW5raW5nIGNvbnRlbnQgcGFydCkgc3RvcCBzaG93aW5nIHRoZWlyIGluLXByb2dyZXNzXG5cdFx0Ly8gc3Bpbm5lci9cIkVkaXRpbmcgZmlsZXNcIiBsYWJlbC4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yODg3MDEuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX3Jlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIHBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24pIHtcblx0XHRcdFx0cGFydC5jYW5jZWxGcm9tU3RyZWFtaW5nKFRvb2xDb25maXJtS2luZC5Ta2lwcGVkKTtcblx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0XHRwYXJ0LmRpc21pc3MoKTtcblx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkge1xuXHRcdFx0XHRwYXJ0LmRpc21pc3ModW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb21wbGV0ZWRBdCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fZWxhcHNlZE1zID8/PSBNYXRoLm1heCgwLCBjb21wbGV0ZWRBdCAtIHRoaXMuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCkpO1xuXHRcdHRoaXMuX2NvbXBsZXRpb25UaW1lc3RhbXAgPSBjb21wbGV0ZWRBdDtcblx0XHR0aGlzLl9tb2RlbFN0YXRlLnNldCh7IHZhbHVlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkLCBjb21wbGV0ZWRBdCB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyByZWFzb246ICdjb21wbGV0ZWRSZXF1ZXN0JyB9KTtcblx0fVxuXG5cdHNldEZvbGxvd3Vwcyhmb2xsb3d1cHM6IElDaGF0Rm9sbG93dXBbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGxvd3VwcyA9IGZvbGxvd3Vwcztcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbik7IC8vIEZpcmUgc28gdGhhdCBjb21tYW5kIGZvbGxvd3VwcyBnZXQgcmVuZGVyZWQgb24gdGhlIHJvd1xuXHR9XG5cblx0c2V0Vm90ZSh2b3RlOiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fdm90ZSA9IHZvdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblx0c2V0RWRpdEFwcGxpZWQoZWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwLCBlZGl0Q291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5yZXNwb25zZS52YWx1ZS5pbmNsdWRlcyhlZGl0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWVkaXQuc3RhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0ZWRpdC5zdGF0ZS5hcHBsaWVkID0gZWRpdENvdW50OyAvLyBtdXN0IG5vdCBiZSBlZGl0LmVkaXRzLmxlbmd0aFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFkb3B0VG8oc2Vzc2lvbjogQ2hhdE1vZGVsKSB7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblxuXHRmaW5hbGl6ZVVuZG9TdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5hbGl6ZWRSZXNwb25zZSA9IHRoaXMucmVzcG9uc2U7XG5cdFx0dGhpcy5fcmVzcG9uc2VWaWV3ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Jlc3BvbnNlLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2NvZGVCbG9ja0luZm9zKSB7XG5cdFx0XHR0aGlzLl9jb2RlQmxvY2tJbmZvcy5sZW5ndGggPSAwO1xuXHRcdH1cblx0fVxuXG5cdHRvSlNPTigpOiBPbWl0PElTZXJpYWxpemFibGVDaGF0UmVzcG9uc2VEYXRhLCAndGltZXN0YW1wJz4ge1xuXHRcdGNvbnN0IG1vZGVsU3RhdGUgPSB0aGlzLl9tb2RlbFN0YXRlLmdldCgpO1xuXHRcdGNvbnN0IHBlbmRpbmdDb25maXJtYXRpb24gPSB0aGlzLmlzUGVuZGluZ0NvbmZpcm1hdGlvbi5nZXQoKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNwb25zZUlkOiB0aGlzLmlkLFxuXHRcdFx0cmVzdWx0OiB0aGlzLnJlc3VsdCxcblx0XHRcdHJlc3BvbnNlTWFya2Rvd25JbmZvOiB0aGlzLmNvZGVCbG9ja0luZm9zPy5tYXA8SVNlcmlhbGl6YWJsZU1hcmtkb3duSW5mbz4oaW5mbyA9PiAoeyBzdWdnZXN0aW9uSWQ6IGluZm8uc3VnZ2VzdGlvbklkIH0pKSxcblx0XHRcdGZvbGxvd3VwczogdGhpcy5mb2xsb3d1cHMsXG5cdFx0XHRtb2RlbFN0YXRlOiBtb2RlbFN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuUGVuZGluZyB8fCBtb2RlbFN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dCA/IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQsIGNvbXBsZXRlZEF0OiBEYXRlLm5vdygpIH0gOiBtb2RlbFN0YXRlLFxuXHRcdFx0dm90ZTogdGhpcy52b3RlLFxuXHRcdFx0c2xhc2hDb21tYW5kOiB0aGlzLnNsYXNoQ29tbWFuZCxcblx0XHRcdHVzZWRDb250ZXh0OiB0aGlzLnVzZWRDb250ZXh0LFxuXHRcdFx0Y29udGVudFJlZmVyZW5jZXM6IHRoaXMuY29udGVudFJlZmVyZW5jZXMsXG5cdFx0XHRjb2RlQ2l0YXRpb25zOiB0aGlzLmNvZGVDaXRhdGlvbnMsXG5cdFx0XHRyZXNwb25zZVRpbWVzdGFtcDogdGhpcy5fdGltZXN0YW1wLFxuXHRcdFx0dGltZVNwZW50V2FpdGluZzogKHBlbmRpbmdDb25maXJtYXRpb24gPyBEYXRlLm5vdygpIC0gcGVuZGluZ0NvbmZpcm1hdGlvbi5zdGFydGVkV2FpdGluZ0F0IDogMCkgKyB0aGlzLl90aW1lU3BlbnRXYWl0aW5nQWNjdW11bGF0b3IsXG5cdFx0XHRwcm9tcHRUb2tlbnM6IHRoaXMudXNhZ2U/LnByb21wdFRva2Vucyxcblx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IHRoaXMuY29tcGxldGlvblRva2VuQ291bnQsXG5cdFx0XHRvdXRwdXRCdWZmZXI6IHRoaXMudXNhZ2U/Lm91dHB1dEJ1ZmZlcixcblx0XHRcdHByb21wdFRva2VuRGV0YWlsczogdGhpcy51c2FnZT8ucHJvbXB0VG9rZW5EZXRhaWxzLFxuXHRcdFx0Y29waWxvdENyZWRpdHM6IHRoaXMudXNhZ2U/LmNvcGlsb3RDcmVkaXRzLFxuXHRcdFx0c2Vzc2lvbkNvcGlsb3RDcmVkaXRzOiB0aGlzLnVzYWdlPy5zZXNzaW9uQ29waWxvdENyZWRpdHMsXG5cdFx0XHRlbGFwc2VkTXM6IHRoaXMuZWxhcHNlZE1zID8/ICh0aGlzLmNvbXBsZXRlZEF0ID8gTWF0aC5tYXgoMCwgdGhpcy5jb21wbGV0ZWRBdCAtIHRoaXMuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCkpIDogdW5kZWZpbmVkKSxcblx0XHR9IHNhdGlzZmllcyBXaXRoRGVmaW5lZFByb3BzPE9taXQ8SVNlcmlhbGl6YWJsZUNoYXRSZXNwb25zZURhdGEsICd0aW1lc3RhbXAnPj47XG5cdH1cbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdERpc2FibGVtZW50IHtcblx0cmVxdWVzdElkOiBzdHJpbmc7XG5cdGFmdGVyVW5kb1N0b3A/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogSW5mb3JtYXRpb24gYWJvdXQgYSBjaGF0IHJlcXVlc3QgdGhhdCBuZWVkcyB1c2VyIGlucHV0IHRvIGNvbnRpbnVlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdE5lZWRzSW5wdXRJbmZvIHtcblx0LyoqIFRoZSBjaGF0IHNlc3Npb24gdGl0bGUgKi9cblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGRldGFpbCBtZXNzYWdlLCBlLmcuLCBcIjx0b29sbmFtZT4gbmVlZHMgYXBwcm92YWwgdG8gcnVuLlwiICovXG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGVsIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SUNoYXRDaGFuZ2VFdmVudD47XG5cblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdC8qKiBAZGVwcmVjYXRlZCBVc2Uge0BsaW5rIHNlc3Npb25SZXNvdXJjZX0gaW5zdGVhZCAqL1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblxuXHQvKiogTWlsbGlzZWNvbmRzIHRpbWVzdGFtcCB0aGlzIGNoYXQgbW9kZWwgd2FzIGNyZWF0ZWQuICovXG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRyZWFkb25seSBsYXN0TWVzc2FnZURhdGU6IG51bWJlcjtcblx0cmVhZG9ubHkgdGltaW5nOiBJQ2hhdFNlc3Npb25UaW1pbmc7XG5cdHJlYWRvbmx5IGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhhc0N1c3RvbVRpdGxlOiBib29sZWFuO1xuXHRyZWFkb25seSByZXNwb25kZXJVc2VybmFtZTogc3RyaW5nO1xuXHQvKiogVHJ1ZSB3aGVuZXZlciBhIHJlcXVlc3QgaXMgY3VycmVudGx5IHJ1bm5pbmcgKi9cblx0cmVhZG9ubHkgcmVxdWVzdEluUHJvZ3Jlc3M6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHQvKiogVHJ1ZSB3aGVuZXZlciB0aGUgbGFzdCByZXF1ZXN0IGhhcyBub3QgcmVhY2hlZCBhIHRlcm1pbmFsIHN0YXRlLCByZWdhcmRsZXNzIG9mIGludGVybWVkaWF0ZSBzdGF0ZXMgbGlrZSB0b29sIGNhbGxzIG9yIGVsaWNpdGF0aW9ucyAqL1xuXHRyZWFkb25seSBoYXNBY3RpdmVSZXF1ZXN0OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFByb3ZpZGVzIHNlc3Npb24gaW5mb3JtYXRpb24gd2hlbiBhIHJlcXVlc3QgbmVlZHMgdXNlciBpbnRlcmFjdGlvbiB0byBjb250aW51ZSAqL1xuXHRyZWFkb25seSByZXF1ZXN0TmVlZHNJbnB1dDogSU9ic2VydmFibGU8SUNoYXRSZXF1ZXN0TmVlZHNJbnB1dEluZm8gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBpc1JlYWRPbmx5OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaW5wdXRQbGFjZWhvbGRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgZWRpdGluZ1Nlc3Npb24/OiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjaGVja3BvaW50OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0c3RhcnRFZGl0aW5nU2Vzc2lvbihpc0dsb2JhbEVkaXRpbmdTZXNzaW9uPzogYm9vbGVhbiwgdHJhbnNmZXJGcm9tU2Vzc2lvbj86IElDaGF0RWRpdGluZ1Nlc3Npb24pOiB2b2lkO1xuXHQvKiogSW5wdXQgbW9kZWwgZm9yIG1hbmFnaW5nIGlucHV0IHN0YXRlICovXG5cdHJlYWRvbmx5IGlucHV0TW9kZWw6IElJbnB1dE1vZGVsO1xuXHRyZWFkb25seSBoYXNSZXF1ZXN0czogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFzdFJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGlzIG1vZGVsIHdpbGwgYmUga2VwdCBhbGl2ZSB3aGlsZSBpdCBpcyBydW5uaW5nIG9yIGhhcyBlZGl0cyAqL1xuXHRyZWFkb25seSB3aWxsS2VlcEFsaXZlOiBib29sZWFuO1xuXHRyZWFkb25seSBsYXN0UmVxdWVzdE9iczogSU9ic2VydmFibGU8SUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ+O1xuXHQvKiogVG90YWwgY29waWxvdCBjcmVkaXRzIGNvbnN1bWVkIGFjcm9zcyBhbGwgdHVybnMgaW4gdGhpcyBzZXNzaW9uLiAqL1xuXHRyZWFkb25seSBzZXNzaW9uQ29zdDogbnVtYmVyO1xuXHRnZXRSZXF1ZXN0cygpOiBJQ2hhdFJlcXVlc3RNb2RlbFtdO1xuXHRzZXRDaGVja3BvaW50KHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHR0b0V4cG9ydCgpOiBJRXhwb3J0YWJsZUNoYXREYXRhO1xuXHR0b0pTT04oKTogSVNlcmlhbGl6YWJsZUNoYXREYXRhO1xuXG5cdHJlYWRvbmx5IHJlcG9EYXRhOiBJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkO1xuXHRzZXRSZXBvRGF0YShkYXRhOiBJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhlIHdvcmtpbmcgZGlyZWN0b3J5IFVSSSBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuXHQgKiBPbmx5IHNldCBpbiB0aGUgc2Vzc2lvbnMvYWdlbnRzIHdpbmRvdyBjb250ZXh0LlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRzZXRXb3JraW5nRGlyZWN0b3J5KHVyaTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0czogRXZlbnQ8dm9pZD47XG5cdGdldFBlbmRpbmdSZXF1ZXN0cygpOiByZWFkb25seSBJQ2hhdFBlbmRpbmdSZXF1ZXN0W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZUNoYXRzRGF0YSB7XG5cdFtzZXNzaW9uSWQ6IHN0cmluZ106IElTZXJpYWxpemFibGVDaGF0RGF0YTtcbn1cblxuZXhwb3J0IHR5cGUgSVNlcmlhbGl6YWJsZUNoYXRBZ2VudERhdGEgPSBVcmlEdG88SUNoYXRBZ2VudERhdGE+O1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6YWJsZUNoYXRSZXNwb25zZURhdGEge1xuXHRyZXNwb25zZUlkPzogc3RyaW5nO1xuXHRyZXN1bHQ/OiBJQ2hhdEFnZW50UmVzdWx0OyAvLyBPcHRpb25hbCBmb3IgYmFja2NvbXBhdFxuXHRyZXNwb25zZU1hcmtkb3duSW5mbz86IElTZXJpYWxpemFibGVNYXJrZG93bkluZm9bXTtcblx0Zm9sbG93dXBzPzogUmVhZG9ubHlBcnJheTxJQ2hhdEZvbGxvd3VwPjtcblx0bW9kZWxTdGF0ZT86IFJlc3BvbnNlTW9kZWxTdGF0ZVQ7XG5cdHZvdGU/OiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdHJlc3BvbnNlVGltZXN0YW1wPzogbnVtYmVyO1xuXHRzbGFzaENvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZDtcblx0LyoqIEZvciBiYWNrd2FyZCBjb21wYXQ6IHNob3VsZCBiZSBvcHRpb25hbCAqL1xuXHR1c2VkQ29udGV4dD86IElDaGF0VXNlZENvbnRleHQ7XG5cdGNvbnRlbnRSZWZlcmVuY2VzPzogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+O1xuXHRjb2RlQ2l0YXRpb25zPzogUmVhZG9ubHlBcnJheTxJQ2hhdENvZGVDaXRhdGlvbj47XG5cdHRpbWVTcGVudFdhaXRpbmc/OiBudW1iZXI7XG5cdHByb21wdFRva2Vucz86IG51bWJlcjtcblx0Y29tcGxldGlvblRva2Vucz86IG51bWJlcjtcblx0b3V0cHV0QnVmZmVyPzogbnVtYmVyO1xuXHRwcm9tcHRUb2tlbkRldGFpbHM/OiByZWFkb25seSBJQ2hhdFVzYWdlUHJvbXB0VG9rZW5EZXRhaWxbXTtcblx0Y29waWxvdENyZWRpdHM/OiBudW1iZXI7XG5cdHNlc3Npb25Db3BpbG90Q3JlZGl0cz86IG51bWJlcjtcblx0ZWxhcHNlZE1zPzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBTZXJpYWxpemVkQ2hhdFJlc3BvbnNlUGFydCA9IElNYXJrZG93blN0cmluZyB8IElDaGF0UmVzcG9uc2VQcm9ncmVzc0ZpbGVUcmVlRGF0YSB8IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB8IElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eSB8IElDaGF0VGhpbmtpbmdQYXJ0IHwgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFNlcmlhbGl6ZWQgfCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgfCBJQ2hhdFBsYW5SZXZpZXcgfCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGEgZXh0ZW5kcyBJU2VyaWFsaXphYmxlQ2hhdFJlc3BvbnNlRGF0YSB7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmcgfCBJUGFyc2VkQ2hhdFJlcXVlc3Q7IC8vIHN0cmluZyA9PiBvbGQgZm9ybWF0XG5cdC8qKiBJcyByZWFsbHkgbGlrZSBcInByb21wdCBkYXRhXCIuIFRoaXMgaXMgdGhlIG1lc3NhZ2UgaW4gdGhlIGZvcm1hdCBpbiB3aGljaCB0aGUgYWdlbnQgZ2V0cyBpdCArIHZhcmlhYmxlIHZhbHVlcy4gKi9cblx0dmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGE7XG5cdHJlc3BvbnNlOiBSZWFkb25seUFycmF5PFNlcmlhbGl6ZWRDaGF0UmVzcG9uc2VQYXJ0PiB8IHVuZGVmaW5lZDtcblxuXHQvKipPbGQsIHBlcnNpc3RlZCBuYW1lIGZvciBzaG91bGRCZVJlbW92ZWRPblNlbmQgKi9cblx0aXNIaWRkZW4/OiBib29sZWFuO1xuXHRzaG91bGRCZVJlbW92ZWRPblNlbmQ/OiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudDtcblx0YWdlbnQ/OiBJU2VyaWFsaXphYmxlQ2hhdEFnZW50RGF0YTtcblx0Ly8gcmVzcG9uc2VFcnJvckRldGFpbHM6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfCB1bmRlZmluZWQ7XG5cdC8qKiBAZGVwcmVjYXRlZCBtb2RlbFN0YXRlIGlzIHVzZWQgaW5zdGVhZCBub3cgKi9cblx0aXNDYW5jZWxlZD86IGJvb2xlYW47XG5cdHRpbWVzdGFtcD86IG51bWJlcjtcblx0Y29uZmlybWF0aW9uPzogc3RyaW5nO1xuXHRlZGl0ZWRGaWxlRXZlbnRzPzogSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudFtdO1xuXHRtb2RlbElkPzogc3RyaW5nO1xuXHRtb2RlSW5mbz86IElDaGF0UmVxdWVzdE1vZGVJbmZvO1xuXHRpc1N5c3RlbUluaXRpYXRlZD86IGJvb2xlYW47XG5cdHN5c3RlbUluaXRpYXRlZExhYmVsPzogc3RyaW5nO1xuXHR0ZXJtaW5hbEV4ZWN1dGlvbklkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVNYXJrZG93bkluZm8ge1xuXHRyZWFkb25seSBzdWdnZXN0aW9uSWQ6IEVkaXRTdWdnZXN0aW9uSWQ7XG59XG5cbi8qKlxuICogUmVwb3NpdG9yeSBzdGF0ZSBjYXB0dXJlZCBmb3IgY2hhdCBzZXNzaW9uIGV4cG9ydC5cbiAqIEVuYWJsZXMgcmVwcm9kdWNpbmcgdGhlIHdvcmtzcGFjZSBzdGF0ZSBieSBjbG9uaW5nLCBjaGVja2luZyBvdXQgdGhlIGNvbW1pdCwgYW5kIGFwcGx5aW5nIGRpZmZzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeHBvcnRhYmxlUmVwb0RhdGEge1xuXHQvKipcblx0ICogQ2xhc3NpZmljYXRpb24gb2YgdGhlIHdvcmtzcGFjZSdzIHZlcnNpb24gY29udHJvbCBzdGF0ZS5cblx0ICogLSBgcmVtb3RlLWdpdGA6IEdpdCByZXBvIHdpdGggYSBjb25maWd1cmVkIHJlbW90ZSBVUkxcblx0ICogLSBgbG9jYWwtZ2l0YDogR2l0IHJlcG8gd2l0aG91dCBhbnkgcmVtb3RlIChsb2NhbCBvbmx5KVxuXHQgKiAtIGBwbGFpbi1mb2xkZXJgOiBOb3QgYSBnaXQgcmVwb3NpdG9yeVxuXHQgKi9cblx0d29ya3NwYWNlVHlwZTogJ3JlbW90ZS1naXQnIHwgJ2xvY2FsLWdpdCcgfCAncGxhaW4tZm9sZGVyJztcblxuXHQvKipcblx0ICogU3luYyBzdGF0dXMgYmV0d2VlbiBsb2NhbCBhbmQgcmVtb3RlLlxuXHQgKiAtIGBzeW5jZWRgOiBMb2NhbCBIRUFEIG1hdGNoZXMgcmVtb3RlIHRyYWNraW5nIGJyYW5jaCAoZnVsbHkgcHVzaGVkKVxuXHQgKiAtIGB1bnB1c2hlZGA6IExvY2FsIGhhcyBjb21taXRzIG5vdCBwdXNoZWQgdG8gdGhlIHJlbW90ZSB0cmFja2luZyBicmFuY2hcblx0ICogLSBgdW5wdWJsaXNoZWRgOiBMb2NhbCBicmFuY2ggaGFzIG5vIHJlbW90ZSB0cmFja2luZyBicmFuY2ggY29uZmlndXJlZFxuXHQgKiAtIGBsb2NhbC1vbmx5YDogTm8gcmVtb3RlIGNvbmZpZ3VyZWQgKGxvY2FsIGdpdCByZXBvIG9ubHkpXG5cdCAqIC0gYG5vLWdpdGA6IE5vdCBhIGdpdCByZXBvc2l0b3J5XG5cdCAqL1xuXHRzeW5jU3RhdHVzOiAnc3luY2VkJyB8ICd1bnB1c2hlZCcgfCAndW5wdWJsaXNoZWQnIHwgJ2xvY2FsLW9ubHknIHwgJ25vLWdpdCc7XG5cblx0LyoqXG5cdCAqIFJlbW90ZSBVUkwgb2YgdGhlIHJlcG9zaXRvcnkgKGUuZy4sIGh0dHBzOi8vZ2l0aHViLmNvbS9vcmcvcmVwby5naXQpLlxuXHQgKiBVbmRlZmluZWQgaWYgbm8gcmVtb3RlIGlzIGNvbmZpZ3VyZWQuXG5cdCAqL1xuXHRyZW1vdGVVcmw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFZlbmRvci9ob3N0IG9mIHRoZSByZW1vdGUgcmVwb3NpdG9yeS5cblx0ICogVW5kZWZpbmVkIGlmIG5vIHJlbW90ZSBpcyBjb25maWd1cmVkLlxuXHQgKi9cblx0cmVtb3RlVmVuZG9yPzogJ2dpdGh1YicgfCAnYWRvJyB8ICdvdGhlcic7XG5cblx0LyoqXG5cdCAqIFJlbW90ZSB0cmFja2luZyBicmFuY2ggZm9yIHRoZSBjdXJyZW50IGJyYW5jaCAoZS5nLiwgXCJvcmlnaW4vZmVhdHVyZS9teS13b3JrXCIpLlxuXHQgKiBVbmRlZmluZWQgaWYgYnJhbmNoIGlzIHVucHVibGlzaGVkIG9yIG5vIHJlbW90ZS5cblx0ICovXG5cdHJlbW90ZVRyYWNraW5nQnJhbmNoPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IHJlbW90ZSBicmFuY2ggdXNlZCBhcyBiYXNlIGZvciB1bnB1Ymxpc2hlZCBicmFuY2hlcyAoZS5nLiwgXCJvcmlnaW4vbWFpblwiKS5cblx0ICogSGVscGZ1bCBmb3IgY29tcHV0aW5nIG1lcmdlLWJhc2Ugd2hlbiBicmFuY2ggaGFzIG5vIHRyYWNraW5nLlxuXHQgKi9cblx0cmVtb3RlQmFzZUJyYW5jaD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29tbWl0IGhhc2ggb2YgdGhlIHJlbW90ZSB0cmFja2luZyBicmFuY2ggSEVBRC5cblx0ICogVW5kZWZpbmVkIGlmIGJyYW5jaCBoYXMgbm8gcmVtb3RlIHRyYWNraW5nIGJyYW5jaC5cblx0ICovXG5cdHJlbW90ZUhlYWRDb21taXQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE5hbWUgb2YgdGhlIGN1cnJlbnQgbG9jYWwgYnJhbmNoIChlLmcuLCBcImZlYXR1cmUvbXktd29ya1wiKS5cblx0ICovXG5cdGxvY2FsQnJhbmNoPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb21taXQgaGFzaCBvZiB0aGUgbG9jYWwgSEVBRCB3aGVuIGNhcHR1cmVkLlxuXHQgKi9cblx0bG9jYWxIZWFkQ29tbWl0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXb3JraW5nIHRyZWUgZGlmZnMgKHVuY29tbWl0dGVkIGNoYW5nZXMpLlxuXHQgKi9cblx0ZGlmZnM/OiBJRXhwb3J0YWJsZVJlcG9EaWZmW107XG5cblx0LyoqXG5cdCAqIFN0YXR1cyBvZiB0aGUgZGlmZnMgY29sbGVjdGlvbi5cblx0ICogLSBgaW5jbHVkZWRgOiBEaWZmcyB3ZXJlIHN1Y2Nlc3NmdWxseSBjYXB0dXJlZCBhbmQgaW5jbHVkZWRcblx0ICogLSBgdG9vTWFueUNoYW5nZXNgOiBEaWZmcyBza2lwcGVkIGJlY2F1c2UgPjEwMCBmaWxlcyBjaGFuZ2VkIChkZWdlbmVyYXRlIGNhc2UgbGlrZSBtYXNzIHJlbmFtZXMpXG5cdCAqIC0gYHRvb0xhcmdlYDogRGlmZnMgc2tpcHBlZCBiZWNhdXNlIHRvdGFsIHNpemUgZXhjZWVkZWQgOTAwS0Jcblx0ICogLSBgdHJpbW1lZEZvclN0b3JhZ2VgOiBEaWZmcyB3ZXJlIHRyaW1tZWQgdG8gc2F2ZSBzdG9yYWdlIChvbGRlciBzZXNzaW9uKVxuXHQgKiAtIGBub0NoYW5nZXNgOiBObyB3b3JraW5nIHRyZWUgY2hhbmdlcyBkZXRlY3RlZFxuXHQgKiAtIGBub3RDYXB0dXJlZGA6IERpZmZzIG5vdCBjYXB0dXJlZCAoZGVmYXVsdC91bmRlZmluZWQgY2FzZSlcblx0ICovXG5cdGRpZmZzU3RhdHVzPzogJ2luY2x1ZGVkJyB8ICd0b29NYW55Q2hhbmdlcycgfCAndG9vTGFyZ2UnIHwgJ3RyaW1tZWRGb3JTdG9yYWdlJyB8ICdub0NoYW5nZXMnIHwgJ25vdENhcHR1cmVkJztcblxuXHQvKipcblx0ICogTnVtYmVyIG9mIGNoYW5nZWQgZmlsZXMgZGV0ZWN0ZWQsIGV2ZW4gaWYgZGlmZnMgd2VyZSBub3QgaW5jbHVkZWQuXG5cdCAqL1xuXHRjaGFuZ2VkRmlsZUNvdW50PzogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgZmlsZSBjaGFuZ2UgZXhwb3J0ZWQgYXMgYSB1bmlmaWVkIGRpZmYgcGF0Y2ggY29tcGF0aWJsZSB3aXRoIGBnaXQgYXBwbHlgLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeHBvcnRhYmxlUmVwb0RpZmYge1xuXHRyZWxhdGl2ZVBhdGg6IHN0cmluZztcblx0Y2hhbmdlVHlwZTogJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcgfCAncmVuYW1lZCc7XG5cdG9sZFJlbGF0aXZlUGF0aD86IHN0cmluZztcblx0dW5pZmllZERpZmY/OiBzdHJpbmc7XG5cdHN0YXR1czogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHBvcnRhYmxlQ2hhdERhdGEge1xuXHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uIHwgdW5kZWZpbmVkO1xuXHRyZXF1ZXN0czogSVNlcmlhbGl6YWJsZUNoYXRSZXF1ZXN0RGF0YVtdO1xuXHRyZXNwb25kZXJVc2VybmFtZTogc3RyaW5nO1xufVxuXG4vKlxuXHROT1RFOiBldmVyeSB0aW1lIHRoZSBzZXJpYWxpemVkIGRhdGEgZm9ybWF0IGlzIHVwZGF0ZWQsIHdlIG5lZWQgdG8gY3JlYXRlIGEgbmV3IGludGVyZmFjZSwgYmVjYXVzZSB3ZSBtYXkgbmVlZCB0byBoYW5kbGUgYW55IG9sZCBkYXRhIGZvcm1hdCB3aGVuIHBhcnNpbmcuXG4qL1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0RGF0YTEgZXh0ZW5kcyBJRXhwb3J0YWJsZUNoYXREYXRhIHtcblx0c2Vzc2lvbklkOiBzdHJpbmc7XG5cdGNyZWF0aW9uRGF0ZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0RGF0YTIgZXh0ZW5kcyBJU2VyaWFsaXphYmxlQ2hhdERhdGExIHtcblx0dmVyc2lvbjogMjtcblx0Y29tcHV0ZWRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0RGF0YTMgZXh0ZW5kcyBPbWl0PElTZXJpYWxpemFibGVDaGF0RGF0YTIsICd2ZXJzaW9uJyB8ICdjb21wdXRlZFRpdGxlJz4ge1xuXHR2ZXJzaW9uOiAzO1xuXHRjdXN0b21UaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGUgc2Vzc2lvbiBoYWQgcGVuZGluZyBlZGl0cyB3aGVuIGl0IHdhcyBzdG9yZWQuICovXG5cdGhhc1BlbmRpbmdFZGl0cz86IGJvb2xlYW47XG5cdC8qKiBDdXJyZW50IGRyYWZ0IGlucHV0IHN0YXRlIChhZGRlZCBsYXRlciwgZnVsbHkgYmFja3dhcmRzIGNvbXBhdGlibGUpICovXG5cdGlucHV0U3RhdGU/OiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZTtcblx0cmVwb0RhdGE/OiBJRXhwb3J0YWJsZVJlcG9EYXRhO1xuXHQvKiogUGVuZGluZyByZXF1ZXN0cyB0aGF0IHdlcmUgcXVldWVkIGJ1dCBub3QgeWV0IHByb2Nlc3NlZCAqL1xuXHRwZW5kaW5nUmVxdWVzdHM/OiBJU2VyaWFsaXphYmxlUGVuZGluZ1JlcXVlc3REYXRhW107XG5cdC8qKiBUaGUgd29ya2luZyBkaXJlY3RvcnkgVVJJIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24gKHNlc3Npb25zL2FnZW50cyB3aW5kb3cpLiAqL1xuXHR3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nO1xufVxuXG4vKipcbiAqIElucHV0IG1vZGVsIGZvciBtYW5hZ2luZyBjaGF0IGlucHV0IHN0YXRlIGluZGVwZW5kZW50bHkgZnJvbSB0aGUgY2hhdCBtb2RlbC5cbiAqIFRoaXMga2VlcHMgZGlzcGxheSBsb2dpYyBzZXBhcmF0ZWQgZnJvbSB0aGUgY29yZSBjaGF0IG1vZGVsLlxuICpcbiAqIFRoZSBpbnB1dCBtb2RlbDpcbiAqIC0gTWFuYWdlcyB0aGUgY3VycmVudCBkcmFmdCBzdGF0ZSAodGV4dCwgYXR0YWNobWVudHMsIG1vZGUsIG1vZGVsIHNlbGVjdGlvbiwgY3Vyc29yL3NlbGVjdGlvbilcbiAqIC0gUHJvdmlkZXMgYW4gb2JzZXJ2YWJsZSBpbnRlcmZhY2UgZm9yIHJlYWN0aXZlIFVJIHVwZGF0ZXNcbiAqIC0gQXV0b21hdGljYWxseSBwZXJzaXN0cyB0aHJvdWdoIHRoZSBjaGF0IG1vZGVsJ3Mgc2VyaWFsaXphdGlvblxuICogLSBFbmFibGVzIGJpZGlyZWN0aW9uYWwgc3luYyBiZXR3ZWVuIHRoZSBVSSAoQ2hhdElucHV0UGFydCkgYW5kIHRoZSBtb2RlbFxuICogLSBVc2VzIGB1bmRlZmluZWRgIHN0YXRlIHRvIGluZGljYXRlIG5vIHBlcnNpc3RlZCBzdGF0ZSAobmV3L2VtcHR5IGNoYXQpXG4gKlxuICogVGhpcyBhcmNoaXRlY3R1cmUgZW5zdXJlcyB0aGF0OlxuICogLSBJbnB1dCBzdGF0ZSBpcyBwcmVzZXJ2ZWQgd2hlbiBtb3ZpbmcgY2hhdHMgYmV0d2VlbiBlZGl0b3Ivc2lkZWJhci93aW5kb3dcbiAqIC0gTm8gbWFudWFsIHN0YXRlIHRyYW5zZmVyIGlzIG5lZWRlZCB3aGVuIHN3aXRjaGluZyBjb250ZXh0c1xuICogLSBUaGUgVUkgc3RheXMgaW4gc3luYyB3aXRoIHRoZSBwZXJzaXN0ZWQgc3RhdGVcbiAqIC0gTmV3IGNoYXRzIHVzZSBVSSBkZWZhdWx0cyAocGVyc2lzdGVkIHByZWZlcmVuY2VzKSBpbnN0ZWFkIG9mIGhhcmRjb2RlZCB2YWx1ZXNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSW5wdXRNb2RlbCB7XG5cdC8qKiBPYnNlcnZhYmxlIGZvciBjdXJyZW50IGlucHV0IHN0YXRlICh1bmRlZmluZWQgZm9yIG5ldy91bmluaXRpYWxpemVkIGNoYXRzKSAqL1xuXHRyZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBVcGRhdGUgdGhlIGlucHV0IHN0YXRlIChwYXJ0aWFsIHVwZGF0ZSkgKi9cblx0c2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZDtcblxuXHQvKiogQ2xlYXIgaW5wdXQgc3RhdGUgKGFmdGVyIHNlbmRpbmcgb3IgY2xlYXJpbmcpICovXG5cdGNsZWFyU3RhdGUoKTogdm9pZDtcblxuXHQvKiogU2VyaWFsaXplcyB0aGUgc3RhdGUgKi9cblx0dG9KU09OKCk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0SW5wdXRTdGF0ZU9yaWdpbiB7XG5cdC8qKiBQdXNoZWQgaW4gYnkgYSBkcmFmdCBzeW5jIGZyb20gYW5vdGhlciBjbGllbnQuIE5vdCBhIGxvY2FsIHVzZXIgZWRpdC4gKi9cblx0UmVtb3RlID0gJ3JlbW90ZScsXG59XG5cbi8qKlxuICogUmVwcmVzZW50cyB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgY2hhdCBpbnB1dCB0aGF0IGhhc24ndCBiZWVuIHNlbnQgeWV0LlxuICogVGhpcyBpcyB0aGUgXCJkcmFmdFwiIHN0YXRlIHRoYXQgc2hvdWxkIGJlIHByZXNlcnZlZCBhY3Jvc3Mgc2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHQvKiogQ3VycmVudCBhdHRhY2htZW50cyBpbiB0aGUgaW5wdXQgKi9cblx0YXR0YWNobWVudHM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblxuXHQvKiogQ3VycmVudGx5IHNlbGVjdGVkIGNoYXQgbW9kZSAqL1xuXHRtb2RlOiB7XG5cdFx0LyoqIE1vZGUgSUQgKGUuZy4sICdhc2snLCAnZWRpdCcsICdhZ2VudCcsIG9yIGN1c3RvbSBtb2RlIElEKSAqL1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0LyoqIE1vZGUga2luZCBmb3IgYnVpbHRpbiBtb2RlcyAqL1xuXHRcdGtpbmQ6IENoYXRNb2RlS2luZCB8IHVuZGVmaW5lZDtcblx0fTtcblxuXHQvKiogQ3VycmVudGx5IHNlbGVjdGVkIGxhbmd1YWdlIG1vZGVsLCBpZiBhbnkgKi9cblx0c2VsZWN0ZWRNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDb25maWd1cmF0aW9uIChlLmcuIGNvbnRleHQgc2l6ZSwgdGhpbmtpbmcgZWZmb3J0KSBmb3IgdGhlIHNlbGVjdGVkXG5cdCAqIG1vZGVsLCBjYXB0dXJlZCBzbyBpdCBjYW4gYmUgcmVzdG9yZWQgYWxvbmdzaWRlIHRoZSBtb2RlbCB3aGVuIHRoZVxuXHQgKiBzZXNzaW9uIGlzIHJlb3BlbmVkLlxuXHQgKi9cblx0bW9kZWxDb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cblx0LyoqIEN1cnJlbnQgaW5wdXQgdGV4dCAqL1xuXHRpbnB1dFRleHQ6IHN0cmluZztcblxuXHQvKiogQ3VycmVudCBzZWxlY3Rpb24gcmFuZ2VzICovXG5cdHNlbGVjdGlvbnM6IElTZWxlY3Rpb25bXTtcblxuXHQvKiogQ3VycmVudCBwZXJtaXNzaW9uIGxldmVsIGZvciB0b29sIGF1dG8tYXBwcm92YWwgKi9cblx0cGVybWlzc2lvbkxldmVsPzogQ2hhdFBlcm1pc3Npb25MZXZlbDtcblxuXHQvKipcblx0ICogV2hlcmUgdGhpcyBzdGF0ZSBjYW1lIGZyb20sIHdoZW4gaXQgd2FzIG5vdCBhdXRob3JlZCBieSB0aGUgbG9jYWwgdXNlci5cblx0ICogQWJzZW50IG1lYW5zIGEgbG9jYWwgdXNlciBlZGl0LiBMZXRzIGNvbnN1bWVycyB0aGF0IHN5bmMgaW5wdXQgc3RhdGVcblx0ICogZWxzZXdoZXJlIHJlY29nbml6ZSB0aGVpciBvd24gd3JpdGVzIGluc3RlYWQgb2YgdHJlYXRpbmcgdGhlbSBhcyBlZGl0cy5cblx0ICovXG5cdG9yaWdpbj86IENoYXRJbnB1dFN0YXRlT3JpZ2luO1xuXG5cdC8qKiBDb250cmlidXRlZCBzdG9yZWQgc3RhdGUgKi9cblx0Y29udHJpYjogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG59XG5cbi8qKlxuICogU2VyaWFsaXphYmxlIHZlcnNpb24gb2YgSUNoYXRNb2RlbElucHV0U3RhdGVcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdGF0dGFjaG1lbnRzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdG1vZGU6IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdGtpbmQ6IENoYXRNb2RlS2luZCB8IHVuZGVmaW5lZDtcblx0fTtcblx0c2VsZWN0ZWRNb2RlbDoge1xuXHRcdGlkZW50aWZpZXI6IHN0cmluZztcblx0XHRtZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7XG5cdFx0LyoqXG5cdFx0ICogQ29uZmlndXJhdGlvbiAoZS5nLiBjb250ZXh0IHNpemUsIHRoaW5raW5nIGVmZm9ydCkgZm9yIHRoZSBzZWxlY3RlZFxuXHRcdCAqIG1vZGVsLCBjYXB0dXJlZCBzbyBpdCBjYW4gYmUgcmVzdG9yZWQgYWxvbmdzaWRlIHRoZSBtb2RlbCB3aGVuIHRoZVxuXHRcdCAqIHNlc3Npb24gaXMgcmVvcGVuZWQuXG5cdFx0ICovXG5cdFx0bW9kZWxDb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdH0gfCB1bmRlZmluZWQ7XG5cdGlucHV0VGV4dDogc3RyaW5nO1xuXHRzZWxlY3Rpb25zOiBJU2VsZWN0aW9uW107XG5cdHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7XG5cdGNvbnRyaWI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG4vKipcbiAqIExlZ2FjeSBzaGFwZSBvZiB7QGxpbmsgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGV9IGFzIHBlcnNpc3RlZCBieSBvbGRlclxuICogdmVyc2lvbnMsIHdoZXJlIHRoZSBzZWxlY3RlZCBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gd2FzIHN0b3JlZCBhcyBhIHNpYmxpbmdcbiAqIGBtb2RlbENvbmZpZ3VyYXRpb25gIGZpZWxkIGluc3RlYWQgb2YgbmVzdGVkIGluc2lkZSBgc2VsZWN0ZWRNb2RlbGAuIFJldGFpbmVkXG4gKiBzbyBzZXNzaW9ucyBzZXJpYWxpemVkIGluIHRoZSBvbGQgZm9ybWF0IGNhbiBzdGlsbCBiZSByZWFkLlxuICovXG5pbnRlcmZhY2UgSUxlZ2FjeVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgZXh0ZW5kcyBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdG1vZGVsQ29uZmlndXJhdGlvbj86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xufVxuXG4vKipcbiAqIFJldml2ZXMgcGVyc2lzdGVkIG9yIHRyYW5zZmVycmVkIGlucHV0IHN0YXRlIGludG8gaXRzIGxpdmUgc2hhcGUsIGluY2x1ZGluZyB0aGUgbGVnYWN5IG1vZGVsIGNvbmZpZ3VyYXRpb24gZmFsbGJhY2suXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXZpdmVTZXJpYWxpemFibGVJbnB1dFN0YXRlKHN0YXRlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRhdHRhY2htZW50czogKHN0YXRlLmF0dGFjaG1lbnRzID8/IFtdKS5tYXAoSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS5mcm9tRXhwb3J0KSxcblx0XHRtb2RlOiBzdGF0ZS5tb2RlLFxuXHRcdHNlbGVjdGVkTW9kZWw6IHN0YXRlLnNlbGVjdGVkTW9kZWwgJiYge1xuXHRcdFx0aWRlbnRpZmllcjogc3RhdGUuc2VsZWN0ZWRNb2RlbC5pZGVudGlmaWVyLFxuXHRcdFx0bWV0YWRhdGE6IHN0YXRlLnNlbGVjdGVkTW9kZWwubWV0YWRhdGFcblx0XHR9LFxuXHRcdG1vZGVsQ29uZmlndXJhdGlvbjogc3RhdGUuc2VsZWN0ZWRNb2RlbCA/IChzdGF0ZS5zZWxlY3RlZE1vZGVsLm1vZGVsQ29uZmlndXJhdGlvbiA/PyAoc3RhdGUgYXMgSUxlZ2FjeVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUpLm1vZGVsQ29uZmlndXJhdGlvbikgOiB1bmRlZmluZWQsXG5cdFx0Y29udHJpYjogc3RhdGUuY29udHJpYixcblx0XHRpbnB1dFRleHQ6IHN0YXRlLmlucHV0VGV4dCxcblx0XHRzZWxlY3Rpb25zOiBzdGF0ZS5zZWxlY3Rpb25zLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogc3RhdGUucGVybWlzc2lvbkxldmVsLFxuXHR9O1xufVxuXG4vKipcbiogQ2hhdCBkYXRhIHRoYXQgaGFzIGJlZW4gcGFyc2VkIGFuZCBub3JtYWxpemVkIHRvIHRoZSBjdXJyZW50IGZvcm1hdC5cbiovXG5leHBvcnQgdHlwZSBJU2VyaWFsaXphYmxlQ2hhdERhdGEgPSBJU2VyaWFsaXphYmxlQ2hhdERhdGEzO1xuXG5leHBvcnQgdHlwZSBJQ2hhdERhdGFTZXJpYWxpemVyTG9nID0gT2JqZWN0TXV0YXRpb25Mb2c8SUNoYXRNb2RlbCwgSVNlcmlhbGl6YWJsZUNoYXREYXRhPjtcblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZENoYXREYXRhUmVmZXJlbmNlIHtcblx0dmFsdWU6IElTZXJpYWxpemFibGVDaGF0RGF0YSB8IElFeHBvcnRhYmxlQ2hhdERhdGE7XG5cdHNlcmlhbGl6ZXI6IElDaGF0RGF0YVNlcmlhbGl6ZXJMb2c7XG59XG5cbi8qKlxuICogQ2hhdCBkYXRhIHRoYXQgaGFzIGJlZW4gbG9hZGVkIGJ1dCBub3Qgbm9ybWFsaXplZCwgYW5kIGNvdWxkIGJlIGFueSBmb3JtYXRcbiAqL1xuZXhwb3J0IHR5cGUgSVNlcmlhbGl6YWJsZUNoYXREYXRhSW4gPSBJU2VyaWFsaXphYmxlQ2hhdERhdGExIHwgSVNlcmlhbGl6YWJsZUNoYXREYXRhMiB8IElTZXJpYWxpemFibGVDaGF0RGF0YTM7XG5cbi8qKlxuICogTm9ybWFsaXplIGNoYXQgZGF0YSBmcm9tIHN0b3JhZ2UgdG8gdGhlIGN1cnJlbnQgZm9ybWF0LlxuICogVE9ETy0gQ2hhdE1vZGVsI19kZXNlcmlhbGl6ZSBhbmQgcmV2aXZlU2VyaWFsaXplZEFnZW50IGFsc28gc3RpbGwgZG8gc29tZSBub3JtYWxpemF0aW9uIGFuZCBtYXliZSB0aGF0IHNob3VsZCBiZSBkb25lIGluIGhlcmUgdG9vLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEocmF3OiBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbik6IElTZXJpYWxpemFibGVDaGF0RGF0YSB7XG5cdG5vcm1hbGl6ZU9sZEZpZWxkcyhyYXcpO1xuXG5cdGlmICghKCd2ZXJzaW9uJyBpbiByYXcpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHQuLi5yYXcsXG5cdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRpZiAocmF3LnZlcnNpb24gPT09IDIpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucmF3LFxuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdGN1c3RvbVRpdGxlOiByYXcuY29tcHV0ZWRUaXRsZVxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gcmF3O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVPbGRGaWVsZHMocmF3OiBJU2VyaWFsaXphYmxlQ2hhdERhdGFJbik6IHZvaWQge1xuXHQvLyBGaWxsIGluIGZpZWxkcyB0aGF0IHZlcnkgb2xkIGNoYXQgZGF0YSBtYXkgYmUgbWlzc2luZ1xuXHRpZiAoIXJhdy5zZXNzaW9uSWQpIHtcblx0XHRyYXcuc2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdH1cblxuXHRpZiAoIXJhdy5jcmVhdGlvbkRhdGUpIHtcblx0XHRyYXcuY3JlYXRpb25EYXRlID0gZ2V0TGFzdFllYXJEYXRlKCk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSwgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aWYgKChyYXcuaW5pdGlhbExvY2F0aW9uIGFzIGFueSkgPT09ICdlZGl0aW5nLXNlc3Npb24nKSB7XG5cdFx0cmF3LmluaXRpYWxMb2NhdGlvbiA9IENoYXRBZ2VudExvY2F0aW9uLkNoYXQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0TGFzdFllYXJEYXRlKCk6IG51bWJlciB7XG5cdGNvbnN0IGxhc3RZZWFyRGF0ZSA9IG5ldyBEYXRlKCk7XG5cdGxhc3RZZWFyRGF0ZS5zZXRGdWxsWWVhcihsYXN0WWVhckRhdGUuZ2V0RnVsbFllYXIoKSAtIDEpO1xuXHRyZXR1cm4gbGFzdFllYXJEYXRlLmdldFRpbWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKG9iajogdW5rbm93bik6IG9iaiBpcyBJRXhwb3J0YWJsZUNoYXREYXRhIHtcblx0cmV0dXJuICEhb2JqICYmXG5cdFx0QXJyYXkuaXNBcnJheSgob2JqIGFzIElFeHBvcnRhYmxlQ2hhdERhdGEpLnJlcXVlc3RzKSAmJlxuXHRcdHR5cGVvZiAob2JqIGFzIElFeHBvcnRhYmxlQ2hhdERhdGEpLnJlc3BvbmRlclVzZXJuYW1lID09PSAnc3RyaW5nJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEob2JqOiB1bmtub3duKTogb2JqIGlzIElTZXJpYWxpemFibGVDaGF0RGF0YSB7XG5cdGNvbnN0IGRhdGEgPSBvYmogYXMgSVNlcmlhbGl6YWJsZUNoYXREYXRhO1xuXHRyZXR1cm4gaXNFeHBvcnRhYmxlU2Vzc2lvbkRhdGEob2JqKSAmJlxuXHRcdHR5cGVvZiBkYXRhLmNyZWF0aW9uRGF0ZSA9PT0gJ251bWJlcicgJiZcblx0XHR0eXBlb2YgZGF0YS5zZXNzaW9uSWQgPT09ICdzdHJpbmcnICYmXG5cdFx0b2JqLnJlcXVlc3RzLmV2ZXJ5KChyZXF1ZXN0OiBJU2VyaWFsaXphYmxlQ2hhdFJlcXVlc3REYXRhKSA9PlxuXHRcdFx0IXJlcXVlc3QudXNlZENvbnRleHQgLyogZm9yIGJhY2t3YXJkIGNvbXBhdCBhbGxvdyBtaXNzaW5nIHVzZWRDb250ZXh0ICovIHx8IGlzSVVzZWRDb250ZXh0KHJlcXVlc3QudXNlZENvbnRleHQpXG5cdFx0KTtcbn1cblxuZXhwb3J0IHR5cGUgSUNoYXRDaGFuZ2VFdmVudCA9XG5cdHwgSUNoYXRJbml0RXZlbnRcblx0fCBJQ2hhdEFkZFJlcXVlc3RFdmVudCB8IElDaGF0Q2hhbmdlZFJlcXVlc3RFdmVudCB8IElDaGF0UmVtb3ZlUmVxdWVzdEV2ZW50XG5cdHwgSUNoYXRBZGRSZXNwb25zZUV2ZW50XG5cdHwgSUNoYXRTZXRBZ2VudEV2ZW50XG5cdHwgSUNoYXRNb3ZlRXZlbnRcblx0fCBJQ2hhdFNldEhpZGRlbkV2ZW50XG5cdHwgSUNoYXRDb21wbGV0ZWRSZXF1ZXN0RXZlbnRcblx0fCBJQ2hhdFNldEN1c3RvbVRpdGxlRXZlbnRcblx0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0QWRkUmVxdWVzdEV2ZW50IHtcblx0a2luZDogJ2FkZFJlcXVlc3QnO1xuXHRyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdENoYW5nZWRSZXF1ZXN0RXZlbnQge1xuXHRraW5kOiAnY2hhbmdlZFJlcXVlc3QnO1xuXHRyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdENvbXBsZXRlZFJlcXVlc3RFdmVudCB7XG5cdGtpbmQ6ICdjb21wbGV0ZWRSZXF1ZXN0Jztcblx0cmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZGRSZXNwb25zZUV2ZW50IHtcblx0a2luZDogJ2FkZFJlc3BvbnNlJztcblx0cmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uIHtcblx0LyoqXG5cdCAqIFwiTm9ybWFsXCIgcmVtb3ZlXG5cdCAqL1xuXHRSZW1vdmFsLFxuXG5cdC8qKlxuXHQgKiBSZW1vdmVkIGJlY2F1c2UgdGhlIHJlcXVlc3Qgd2lsbCBiZSByZXNlbnRcblx0ICovXG5cdFJlc2VuZCxcblxuXHQvKipcblx0ICogUmVtb3ZlIGJlY2F1c2UgdGhlIHJlcXVlc3QgaXMgbW92aW5nIHRvIGFub3RoZXIgbW9kZWxcblx0ICovXG5cdEFkb3B0aW9uXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZW1vdmVSZXF1ZXN0RXZlbnQge1xuXHRraW5kOiAncmVtb3ZlUmVxdWVzdCc7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZXNwb25zZUlkPzogc3RyaW5nO1xuXHRyZWFzb246IENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNldEhpZGRlbkV2ZW50IHtcblx0a2luZDogJ3NldEhpZGRlbic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb3ZlRXZlbnQge1xuXHRraW5kOiAnbW92ZSc7XG5cdHRhcmdldDogVVJJO1xuXHRyYW5nZTogSVJhbmdlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2V0QWdlbnRFdmVudCB7XG5cdGtpbmQ6ICdzZXRBZ2VudCc7XG5cdGFnZW50OiBJQ2hhdEFnZW50RGF0YTtcblx0Y29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2V0Q3VzdG9tVGl0bGVFdmVudCB7XG5cdGtpbmQ6ICdzZXRDdXN0b21UaXRsZSc7XG5cdHRpdGxlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRJbml0RXZlbnQge1xuXHRraW5kOiAnaW5pdGlhbGl6ZSc7XG59XG5cbi8qKlxuICogSW50ZXJuYWwgaW1wbGVtZW50YXRpb24gb2YgSUlucHV0TW9kZWxcbiAqL1xuY2xhc3MgSW5wdXRNb2RlbCBpbXBsZW1lbnRzIElJbnB1dE1vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD4+O1xuXHRyZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+O1xuXG5cdGNvbnN0cnVjdG9yKGluaXRpYWxTdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQsIHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nU2VydmljZSwgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRcdHRoaXMuX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlT3B0cyh7IGRlYnVnTmFtZTogJ2lucHV0TW9kZWxTdGF0ZScsIGVxdWFsc0ZuOiBlcXVhbHMgfSwgaW5pdGlhbFN0YXRlKTtcblx0XHR0aGlzLnN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRzZXRTdGF0ZShzdGF0ZTogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT4pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0X2xvZ0NoYW5nZXNUb1N0YXRlTW9kZWwoc3RhdGUsIGN1cnJlbnQsIHRoaXMubG9nZ2VyLCB0aGlzLnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdC8vIElmIGN1cnJlbnQgaXMgdW5kZWZpbmVkLCBwcm92aWRlIGRlZmF1bHRzIGZvciByZXF1aXJlZCBmaWVsZHNcblx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdG1vZGU6IHsgaWQ6ICdhZ2VudCcsIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9LFxuXHRcdFx0c2VsZWN0ZWRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0aW5wdXRUZXh0OiAnJyxcblx0XHRcdHNlbGVjdGlvbnM6IFtdLFxuXHRcdFx0Y29udHJpYjoge30sXG5cdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRvcmlnaW46IHN0YXRlLm9yaWdpblxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRjbGVhclN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHR0b0pTT04oKTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciBvdXQgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIGNvbnRleHQgaXRlbXMgKGtpbmQ6ICdzdHJpbmcnIG9yIGltcGxpY2l0IGVudHJpZXMgd2l0aCBTdHJpbmdDaGF0Q29udGV4dFZhbHVlKVxuXHRcdC8vIFRoZXNlIGhhdmUgaGFuZGxlcyB0aGF0IGJlY29tZSBpbnZhbGlkIGFmdGVyIHdpbmRvdyByZWxvYWQgYW5kIGNhbm5vdCBiZSBwcm9wZXJseSByZXN0b3JlZC5cblx0XHRjb25zdCBwZXJzaXN0YWJsZUF0dGFjaG1lbnRzID0gdmFsdWUuYXR0YWNobWVudHMuZmlsdGVyKGF0dGFjaG1lbnQgPT4ge1xuXHRcdFx0aWYgKGlzU3RyaW5nVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNJbXBsaWNpdFZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkgJiYgaXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZShhdHRhY2htZW50LnZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250cmliOiB2YWx1ZS5jb250cmliLFxuXHRcdFx0YXR0YWNobWVudHM6IHBlcnNpc3RhYmxlQXR0YWNobWVudHMubWFwKElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9FeHBvcnQpLFxuXHRcdFx0bW9kZTogdmFsdWUubW9kZSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IHZhbHVlLnNlbGVjdGVkTW9kZWwgPyB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IHZhbHVlLnNlbGVjdGVkTW9kZWwuaWRlbnRpZmllcixcblx0XHRcdFx0bWV0YWRhdGE6IHZhbHVlLnNlbGVjdGVkTW9kZWwubWV0YWRhdGEsXG5cdFx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogdmFsdWUubW9kZWxDb25maWd1cmF0aW9uXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0aW5wdXRUZXh0OiB2YWx1ZS5pbnB1dFRleHQsXG5cdFx0XHRzZWxlY3Rpb25zOiB2YWx1ZS5zZWxlY3Rpb25zLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiB2YWx1ZS5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0TW9kZWwge1xuXHRzdGF0aWMgZ2V0RGVmYXVsdFRpdGxlKHJlcXVlc3RzOiAoSVNlcmlhbGl6YWJsZUNoYXRSZXF1ZXN0RGF0YSB8IElDaGF0UmVxdWVzdE1vZGVsKVtdKTogc3RyaW5nIHtcblx0XHRjb25zdCBmaXJzdFJlcXVlc3RNZXNzYWdlID0gcmVxdWVzdHMuYXQoMCk/Lm1lc3NhZ2UgPz8gJyc7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHR5cGVvZiBmaXJzdFJlcXVlc3RNZXNzYWdlID09PSAnc3RyaW5nJyA/XG5cdFx0XHRmaXJzdFJlcXVlc3RNZXNzYWdlIDpcblx0XHRcdGZpcnN0UmVxdWVzdE1lc3NhZ2UudGV4dDtcblx0XHRyZXR1cm4gbWVzc2FnZS5zcGxpdCgnXFxuJylbMF0uc3Vic3RyaW5nKDAsIDIwMCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JlcXVlc3RzOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMgPSB0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5ldmVudDtcblxuXHRwcml2YXRlIF9yZXF1ZXN0czogQ2hhdFJlcXVlc3RNb2RlbFtdO1xuXG5cdHByaXZhdGUgX3JlcG9EYXRhOiBJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IHJlcG9EYXRhKCk6IElFeHBvcnRhYmxlUmVwb0RhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXBvRGF0YTtcblx0fVxuXHRwdWJsaWMgc2V0UmVwb0RhdGEoZGF0YTogSUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcG9EYXRhID0gZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCB3b3JraW5nRGlyZWN0b3J5KCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcnk7XG5cdH1cblx0cHVibGljIHNldFdvcmtpbmdEaXJlY3RvcnkodXJpOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gdXJpO1xuXHR9XG5cblx0Z2V0UGVuZGluZ1JlcXVlc3RzKCk6IHJlYWRvbmx5IElDaGF0UGVuZGluZ1JlcXVlc3RbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdSZXF1ZXN0cztcblx0fVxuXG5cdHNldFBlbmRpbmdSZXF1ZXN0cyhyZXF1ZXN0czogcmVhZG9ubHkgeyByZXF1ZXN0SWQ6IHN0cmluZzsga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQgfVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmdNYXAgPSBuZXcgTWFwKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5tYXAocCA9PiBbcC5yZXF1ZXN0LmlkLCBwXSkpO1xuXHRcdGNvbnN0IG5ld1BlbmRpbmc6IElDaGF0UGVuZGluZ1JlcXVlc3RbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyByZXF1ZXN0SWQsIGtpbmQgfSBvZiByZXF1ZXN0cykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBleGlzdGluZ01hcC5nZXQocmVxdWVzdElkKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHQvLyBVcGRhdGUga2luZCBpZiBjaGFuZ2VkLCBrZWVwIGV4aXN0aW5nIHJlcXVlc3QgYW5kIHNlbmRPcHRpb25zXG5cdFx0XHRcdG5ld1BlbmRpbmcucHVzaChleGlzdGluZy5raW5kID09PSBraW5kID8gZXhpc3RpbmcgOiB7IHJlcXVlc3Q6IGV4aXN0aW5nLnJlcXVlc3QsIGtpbmQsIHNlbmRPcHRpb25zOiBleGlzdGluZy5zZW5kT3B0aW9ucyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnB1c2goLi4ubmV3UGVuZGluZyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIGF0b21pY2FsbHkgcmVwbGFjZSB0aGUgcGVuZGluZyByZXF1ZXN0IHF1ZXVlLlxuXHQgKi9cblx0cmVwbGFjZVBlbmRpbmdSZXF1ZXN0cyhyZXF1ZXN0czogcmVhZG9ubHkgSUNoYXRQZW5kaW5nUmVxdWVzdFtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5sZW5ndGggPT09IHJlcXVlc3RzLmxlbmd0aCAmJiByZXF1ZXN0cy5ldmVyeSgocmVxdWVzdCwgaW5kZXgpID0+IHRoaXMuX3BlbmRpbmdSZXF1ZXN0c1tpbmRleF0gPT09IHJlcXVlc3QpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5wdXNoKC4uLnJlcXVlc3RzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQGludGVybmFsIFVzZWQgYnkgQ2hhdFNlcnZpY2UgdG8gYWRkIGEgcmVxdWVzdCB0byB0aGUgcXVldWUuXG5cdCAqIFN0ZWVyaW5nIG1lc3NhZ2VzIGFyZSBwbGFjZWQgYmVmb3JlIHF1ZXVlZCBtZXNzYWdlcy5cblx0ICovXG5cdGFkZFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0IHtcblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdDogSUNoYXRQZW5kaW5nUmVxdWVzdCA9IHtcblx0XHRcdHJlcXVlc3QsXG5cdFx0XHRraW5kLFxuXHRcdFx0c2VuZE9wdGlvbnMsXG5cdFx0fTtcblxuXHRcdGlmIChraW5kID09PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZykge1xuXHRcdFx0Ly8gSW5zZXJ0IGFmdGVyIHRoZSBsYXN0IHN0ZWVyaW5nIG1lc3NhZ2UsIG9yIGF0IHRoZSBiZWdpbm5pbmcgaWYgdGhlcmUgaXMgbm9uZVxuXHRcdFx0bGV0IGluc2VydEluZGV4ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nUmVxdWVzdHNbaV0ua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpIHtcblx0XHRcdFx0XHRpbnNlcnRJbmRleCA9IGkgKyAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuc3BsaWNlKGluc2VydEluZGV4LCAwLCBwZW5kaW5nUmVxdWVzdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFF1ZXVlZCBtZXNzYWdlcyBhbHdheXMgZ28gYXQgdGhlIGVuZFxuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnB1c2gocGVuZGluZ1JlcXVlc3QpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzLmZpcmUoKTtcblx0XHRyZXR1cm4gcGVuZGluZ1JlcXVlc3Q7XG5cdH1cblxuXHQvKipcblx0ICogQGludGVybmFsIFVzZWQgYnkgQ2hhdFNlcnZpY2UgdG8gcmVtb3ZlIGEgcGVuZGluZyByZXF1ZXN0XG5cdCAqL1xuXHRyZW1vdmVQZW5kaW5nUmVxdWVzdChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZmluZEluZGV4KHIgPT4gci5yZXF1ZXN0LmlkID09PSBpZCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIGRlcXVldWUgdGhlIG5leHQgcGVuZGluZyByZXF1ZXN0XG5cdCAqL1xuXHRkZXF1ZXVlUGVuZGluZ1JlcXVlc3QoKTogSUNoYXRQZW5kaW5nUmVxdWVzdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zaGlmdCgpO1xuXHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXF1ZXN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIGRlcXVldWUgYWxsIGNvbnNlY3V0aXZlIHN0ZWVyaW5nIHJlcXVlc3RzIGF0IHRoZSBmcm9udCBvZiB0aGUgcXVldWUuXG5cdCAqIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgaWYgdGhlIGZpcnN0IHBlbmRpbmcgcmVxdWVzdCBpcyBub3QgYSBzdGVlcmluZyByZXF1ZXN0LlxuXHQgKi9cblx0ZGVxdWV1ZUFsbFN0ZWVyaW5nUmVxdWVzdHMoKTogSUNoYXRQZW5kaW5nUmVxdWVzdFtdIHtcblx0XHRjb25zdCBzdGVlcmluZ1JlcXVlc3RzOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10gPSBbXTtcblx0XHR3aGlsZSAodGhpcy5fcGVuZGluZ1JlcXVlc3RzLmF0KDApPy5raW5kID09PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZykge1xuXHRcdFx0c3RlZXJpbmdSZXF1ZXN0cy5wdXNoKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zaGlmdCgpISk7XG5cdFx0fVxuXHRcdGlmIChzdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzLmZpcmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0ZWVyaW5nUmVxdWVzdHM7XG5cdH1cblxuXHQvKipcblx0ICogQGludGVybmFsIFVzZWQgYnkgQ2hhdFNlcnZpY2UgdG8gY2xlYXIgYWxsIHBlbmRpbmcgcmVxdWVzdHNcblx0ICovXG5cdGNsZWFyUGVuZGluZ1JlcXVlc3RzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nUmVxdWVzdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmxlbmd0aCA9IDA7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVhZG9ubHkgbGFzdFJlcXVlc3RPYnM6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkPjtcblxuXHQvLyBUT0RPIHRvIGJlIGNsZWFyLCB0aGlzIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgaWQgZnJvbSB0aGUgc2Vzc2lvbiBvYmplY3QsIHdoaWNoIGJlbG9uZ3MgdG8gdGhlIHByb3ZpZGVyLlxuXHQvLyBJdCdzIGVhc2llciB0byBiZSBhYmxlIHRvIGlkZW50aWZ5IHRoaXMgbW9kZWwgYmVmb3JlIGl0cyBhc3luYyBpbml0aWFsaXphdGlvbiBpcyBjb21wbGV0ZVxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIEBkZXByZWNhdGVkIFVzZSB7QGxpbmsgc2Vzc2lvblJlc291cmNlfSBpbnN0ZWFkICovXG5cdGdldCBzZXNzaW9uSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbklkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdGdldCBzZXNzaW9uUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0cmVhZG9ubHkgcmVxdWVzdEluUHJvZ3Jlc3M6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBoYXNBY3RpdmVSZXF1ZXN0OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgcmVxdWVzdE5lZWRzSW5wdXQ6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdE5lZWRzSW5wdXRJbmZvIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaXNSZWFkT25seTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0LyoqIElucHV0IG1vZGVsIGZvciBtYW5hZ2luZyBpbnB1dCBzdGF0ZSAqL1xuXHRyZWFkb25seSBpbnB1dE1vZGVsOiBJbnB1dE1vZGVsO1xuXG5cdGdldCBoYXNSZXF1ZXN0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdHMubGVuZ3RoID4gMDtcblx0fVxuXG5cdGdldCBsYXN0UmVxdWVzdCgpOiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdHMuYXQoLTEpO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25Db3N0KCk6IG51bWJlciB7XG5cdFx0bGV0IHN1bW1lZENyZWRpdHMgPSAwO1xuXHRcdGxldCByZXBvcnRlZFNlc3Npb25DcmVkaXRzID0gMDtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgdGhpcy5fcmVxdWVzdHMpIHtcblx0XHRcdGNvbnN0IHVzYWdlID0gcmVxdWVzdC5yZXNwb25zZT8udXNhZ2U7XG5cdFx0XHRpZiAodHlwZW9mIHVzYWdlPy5jb3BpbG90Q3JlZGl0cyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0c3VtbWVkQ3JlZGl0cyArPSB1c2FnZS5jb3BpbG90Q3JlZGl0cztcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdXNhZ2U/LnNlc3Npb25Db3BpbG90Q3JlZGl0cyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmVwb3J0ZWRTZXNzaW9uQ3JlZGl0cyA9IE1hdGgubWF4KHJlcG9ydGVkU2Vzc2lvbkNyZWRpdHMsIHVzYWdlLnNlc3Npb25Db3BpbG90Q3JlZGl0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEEgYmFja2VuZCB0aGF0IHJlcG9ydHMgdGhlIHNlc3Npb24gdG90YWwgY292ZXJzIHdvcmsgYmlsbGVkIG91dHNpZGUgYW55XG5cdFx0Ly8gdHVybiwgd2hpY2ggc3VtbWluZyB0aGUgdHVybnMgd291bGQgbWlzcy4gU3VtbWluZyBjb3ZlcnMgdHVybnMgd2hvc2Vcblx0XHQvLyBiYWNrZW5kIHJlcG9ydHMgbm8gc2Vzc2lvbiB0b3RhbCwgYW5kIGFueSBiaWxsZWQgYWZ0ZXIgdGhlIG1vc3QgcmVjZW50XG5cdFx0Ly8gcmVwb3J0ZWQgdG90YWwuIE5laXRoZXIgaXMgYSBzdXBlcnNldCwgc28gdGFrZSB3aGljaGV2ZXIgaXMgbGFyZ2VyIFx1MjAxNFxuXHRcdC8vIHdoaWNoIGlzIGFsc28gaW5kZXBlbmRlbnQgb2YgdGhlIG9yZGVyIHRoZSB0d28ga2luZHMgYXJlIGludGVybGVhdmVkIGluLlxuXHRcdHJldHVybiBNYXRoLm1heChzdW1tZWRDcmVkaXRzLCByZXBvcnRlZFNlc3Npb25DcmVkaXRzKTtcblx0fVxuXG5cdHByaXZhdGUgX3RpbWVzdGFtcDogbnVtYmVyO1xuXHRnZXQgdGltZXN0YW1wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpbWVzdGFtcDtcblx0fVxuXG5cdGdldCB0aW1pbmcoKTogSUNoYXRTZXNzaW9uVGltaW5nIHtcblx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHRoaXMuX3JlcXVlc3RzLmF0KC0xKTtcblx0XHRjb25zdCBsYXN0UmVzcG9uc2UgPSBsYXN0UmVxdWVzdD8ucmVzcG9uc2U7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3RTdGFydGVkID0gbGFzdFJlcXVlc3Q/LnRpbWVzdGFtcDtcblx0XHRjb25zdCBsYXN0UmVxdWVzdEVuZGVkID0gbGFzdFJlc3BvbnNlPy5jb21wbGV0ZWRBdCA/PyBsYXN0UmVzcG9uc2U/LnRpbWVzdGFtcDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3JlYXRlZDogdGhpcy5fdGltZXN0YW1wLFxuXHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkLFxuXHRcdFx0bGFzdFJlcXVlc3RFbmRlZCxcblx0XHR9O1xuXHR9XG5cblx0Z2V0IGxhc3RNZXNzYWdlRGF0ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1ZXN0cy5hdCgtMSk/LnRpbWVzdGFtcCA/PyB0aGlzLl90aW1lc3RhbXA7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfZGVmYXVsdEFnZW50KCkge1xuXHRcdHJldHVybiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENoYXRNb2RlS2luZC5Bc2spO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbFJlc3BvbmRlclVzZXJuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCByZXNwb25kZXJVc2VybmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0QWdlbnQ/LmZ1bGxOYW1lID8/XG5cdFx0XHR0aGlzLl9pbml0aWFsUmVzcG9uZGVyVXNlcm5hbWUgPz8gJyc7XG5cdH1cblxuXHRwcml2YXRlIF9pc0ltcG9ydGVkID0gZmFsc2U7XG5cdGdldCBpc0ltcG9ydGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0ltcG9ydGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZWxldGVkID0gZmFsc2U7XG5cdGdldCBpc0RlbGV0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGVsZXRlZDtcblx0fVxuXHRtYXJrRGVsZXRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0RlbGV0ZWQgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3VzdG9tVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGN1c3RvbVRpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbVRpdGxlO1xuXHR9XG5cblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbVRpdGxlIHx8IENoYXRNb2RlbC5nZXREZWZhdWx0VGl0bGUodGhpcy5fcmVxdWVzdHMpO1xuXHR9XG5cblx0Z2V0IGhhc0N1c3RvbVRpdGxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21UaXRsZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGVkaXRpbmdTZXNzaW9uKCk6IElDaGF0RWRpdGluZ1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0aW5nU2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247XG5cdGdldCBpbml0aWFsTG9jYXRpb24oKTogQ2hhdEFnZW50TG9jYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsTG9jYXRpb247XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5Vc2VUb29sczogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBjYW5Vc2VUb29scygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuVXNlVG9vbHM7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNhYmxlQmFja2dyb3VuZEtlZXBBbGl2ZTogYm9vbGVhbjtcblx0Z2V0IHdpbGxLZWVwQWxpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9kaXNhYmxlQmFja2dyb3VuZEtlZXBBbGl2ZTtcblx0fVxuXG5cdHB1YmxpYyBkYXRhU2VyaWFsaXplcj86IElDaGF0RGF0YVNlcmlhbGl6ZXJMb2c7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZGF0YVJlZjogSVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB8IHVuZGVmaW5lZCxcblx0XHRpbml0aWFsTW9kZWxQcm9wczogeyBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uOyBjYW5Vc2VUb29sczogYm9vbGVhbjsgaW5wdXRTdGF0ZT86IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlOyByZXNvdXJjZT86IFVSSTsgZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmU/OiBib29sZWFuOyBpc1JlYWRPbmx5PzogSU9ic2VydmFibGU8Ym9vbGVhbj4gfSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGluaXRpYWxEYXRhID0gZGF0YVJlZj8udmFsdWU7XG5cdFx0Y29uc3QgaXNWYWxpZEV4cG9ydGVkRGF0YSA9IGlzRXhwb3J0YWJsZVNlc3Npb25EYXRhKGluaXRpYWxEYXRhKTtcblx0XHRjb25zdCBpc1ZhbGlkRnVsbERhdGEgPSBpc1ZhbGlkRXhwb3J0ZWREYXRhICYmIGlzU2VyaWFsaXphYmxlU2Vzc2lvbkRhdGEoaW5pdGlhbERhdGEpO1xuXHRcdGlmIChpbml0aWFsRGF0YSAmJiAhaXNWYWxpZEV4cG9ydGVkRGF0YSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYENoYXRNb2RlbCNjb25zdHJ1Y3RvcjogTG9hZGVkIG1hbGZvcm1lZCBzZXNzaW9uIGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoaW5pdGlhbERhdGEpfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzSW1wb3J0ZWQgPSAhIWluaXRpYWxEYXRhICYmIGlzVmFsaWRFeHBvcnRlZERhdGEgJiYgIWlzVmFsaWRGdWxsRGF0YTtcblxuXHRcdC8vIFNldCB0aGUgc2Vzc2lvbiByZXNvdXJjZSBhbmQgaWRcblx0XHRpZiAoaW5pdGlhbE1vZGVsUHJvcHMucmVzb3VyY2UpIHtcblx0XHRcdC8vIHByZWZlciB1c2luZyB0aGUgcHJvdmlkZWQgcmVzb3VyY2UgaWYgcHJvdmlkZWRcblx0XHRcdHRoaXMuX3Nlc3Npb25JZCA9IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKGluaXRpYWxNb2RlbFByb3BzLnJlc291cmNlKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IGluaXRpYWxNb2RlbFByb3BzLnJlc291cmNlO1xuXHRcdH0gZWxzZSBpZiAoaXNWYWxpZEZ1bGxEYXRhKSB7XG5cdFx0XHQvLyBPdGhlcndpc2UgdXNlIHRoZSBzZXJpYWxpemVkIGlkLiBUaGlzIGlzIG9ubHkgdmFsaWQgZm9yIGxvY2FsIGNoYXQgc2Vzc2lvbnNcblx0XHRcdHRoaXMuX3Nlc3Npb25JZCA9IGluaXRpYWxEYXRhLnNlc3Npb25JZDtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihpbml0aWFsRGF0YS5zZXNzaW9uSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGaW5hbGx5IGZhbGwgYmFjayB0byBnZW5lcmF0aW5nIGEgbmV3IGlkIGZvciBhIGxvY2FsIHNlc3Npb24uIFRoaXMgaXMgdXNlZCBpbiB0aGUgY2FzZSB3aGVyZSBhXG5cdFx0XHQvLyBjaGF0IGhhcyBiZWVuIGV4cG9ydGVkIChidXQgbm90IHNlcmlhbGl6ZWQpXG5cdFx0XHR0aGlzLl9zZXNzaW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbih0aGlzLl9zZXNzaW9uSWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlID0gaW5pdGlhbE1vZGVsUHJvcHMuZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmUgPz8gZmFsc2U7XG5cblx0XHR0aGlzLl90aW1lc3RhbXAgPSAoaXNWYWxpZEZ1bGxEYXRhICYmIGluaXRpYWxEYXRhLmNyZWF0aW9uRGF0ZSkgfHwgRGF0ZS5ub3coKTtcblx0XHR0aGlzLl9yZXF1ZXN0cyA9IGluaXRpYWxEYXRhID8gdGhpcy5fZGVzZXJpYWxpemUoaW5pdGlhbERhdGEpIDogW107XG5cdFx0dGhpcy5fY3VzdG9tVGl0bGUgPSBpc1ZhbGlkRnVsbERhdGEgPyBpbml0aWFsRGF0YS5jdXN0b21UaXRsZSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEluaXRpYWxpemUgaW5wdXQgbW9kZWwgZnJvbSBzZXJpYWxpemVkIGRhdGEgKHVuZGVmaW5lZCBmb3IgbmV3IGNoYXRzKVxuXHRcdGNvbnN0IHNlcmlhbGl6ZWRJbnB1dFN0YXRlID0gaW5pdGlhbE1vZGVsUHJvcHMuaW5wdXRTdGF0ZSB8fCAoaXNWYWxpZEZ1bGxEYXRhICYmIGluaXRpYWxEYXRhLmlucHV0U3RhdGUgPyBpbml0aWFsRGF0YS5pbnB1dFN0YXRlIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLmlucHV0TW9kZWwgPSBuZXcgSW5wdXRNb2RlbChzZXJpYWxpemVkSW5wdXRTdGF0ZSAmJiByZXZpdmVTZXJpYWxpemFibGVJbnB1dFN0YXRlKHNlcmlhbGl6ZWRJbnB1dFN0YXRlKSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLl9zZXNzaW9uSWQpO1xuXG5cdFx0dGhpcy5kYXRhU2VyaWFsaXplciA9IGRhdGFSZWY/LnNlcmlhbGl6ZXI7XG5cdFx0dGhpcy5faW5pdGlhbFJlc3BvbmRlclVzZXJuYW1lID0gaW5pdGlhbERhdGE/LnJlc3BvbmRlclVzZXJuYW1lO1xuXG5cdFx0dGhpcy5fcmVwb0RhdGEgPSBpc1ZhbGlkRnVsbERhdGEgJiYgaW5pdGlhbERhdGEucmVwb0RhdGEgPyBpbml0aWFsRGF0YS5yZXBvRGF0YSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkgPSBpc1ZhbGlkRnVsbERhdGEgJiYgaW5pdGlhbERhdGEud29ya2luZ0RpcmVjdG9yeSA/IFVSSS5wYXJzZShpbml0aWFsRGF0YS53b3JraW5nRGlyZWN0b3J5KSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEh5ZHJhdGUgcGVuZGluZyByZXF1ZXN0cyBmcm9tIHNlcmlhbGl6ZWQgZGF0YVxuXHRcdGlmIChpc1ZhbGlkRnVsbERhdGEgJiYgaW5pdGlhbERhdGEucGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMgPSB0aGlzLl9kZXNlcmlhbGl6ZVBlbmRpbmdSZXF1ZXN0cyhpbml0aWFsRGF0YS5wZW5kaW5nUmVxdWVzdHMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luaXRpYWxMb2NhdGlvbiA9IGluaXRpYWxEYXRhPy5pbml0aWFsTG9jYXRpb24gPz8gaW5pdGlhbE1vZGVsUHJvcHMuaW5pdGlhbExvY2F0aW9uO1xuXG5cdFx0dGhpcy5fY2FuVXNlVG9vbHMgPSBpbml0aWFsTW9kZWxQcm9wcy5jYW5Vc2VUb29scztcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBpbml0aWFsTW9kZWxQcm9wcy5pc1JlYWRPbmx5ID8/IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cblx0XHR0aGlzLmxhc3RSZXF1ZXN0T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLm9uRGlkQ2hhbmdlLCAoKSA9PiB0aGlzLl9yZXF1ZXN0cy5hdCgtMSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFyZXF1ZXN0Py5yZXNwb25zZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVxdWVzdC5yZXNwb25zZS5vbkRpZENoYW5nZShhc3luYyBldiA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fZWRpdGluZ1Nlc3Npb24gfHwgZXYucmVhc29uICE9PSAnY29tcGxldGVkUmVxdWVzdCcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ2NvbXBsZXRlZFJlcXVlc3QnLCByZXF1ZXN0IH0pO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVxdWVzdEluUHJvZ3Jlc3MgPSB0aGlzLmxhc3RSZXF1ZXN0T2JzLm1hcCgocmVxdWVzdCwgcikgPT4ge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0luUHJvZ3Jlc3MucmVhZChyKSA/PyBmYWxzZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuaGFzQWN0aXZlUmVxdWVzdCA9IHRoaXMubGFzdFJlcXVlc3RPYnMubWFwKChyZXF1ZXN0LCByKSA9PiB7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdD8ucmVzcG9uc2U/LmlzSW5jb21wbGV0ZS5yZWFkKHIpID8/IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5yZXF1ZXN0TmVlZHNJbnB1dCA9IHRoaXMubGFzdFJlcXVlc3RPYnMubWFwKChyZXF1ZXN0LCByKSA9PiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nSW5mbyA9IHJlcXVlc3Q/LnJlc3BvbnNlPy5pc1BlbmRpbmdDb25maXJtYXRpb24ucmVhZChyKTtcblx0XHRcdGlmICghcGVuZGluZ0luZm8pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRpdGxlOiB0aGlzLnRpdGxlLFxuXHRcdFx0XHRkZXRhaWw6IHBlbmRpbmdJbmZvLmRldGFpbCxcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHQvLyBSZXRhaW4gYSByZWZlcmVuY2UgdG8gaXRzZWxmIHdoZW4gYSByZXF1ZXN0IGlzIGluIHByb2dyZXNzLCBzbyB0aGUgQ2hhdE1vZGVsIHN0YXlzIGFsaXZlIGluIHRoZSBiYWNrZ3JvdW5kXG5cdFx0Ly8gb25seSB3aGlsZSBydW5uaW5nIGEgcmVxdWVzdC4gVE9ETyBhbHNvIGtlZXAgaXQgYWxpdmUgZm9yIDVtaW4gb3Igc28gc28gd2UgZG9uJ3QgaGF2ZSB0byBkaXNwb3NlL3Jlc3RvcmUgdG9vIG9mdGVuP1xuXHRcdGlmICh0aGlzLmluaXRpYWxMb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCAmJiAhaW5pdGlhbE1vZGVsUHJvcHMuZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmUpIHtcblx0XHRcdGNvbnN0IHNlbGZSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlbFJlZmVyZW5jZT4oKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0XHRjb25zdCBpblByb2dyZXNzID0gdGhpcy5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHIpO1xuXHRcdFx0XHRjb25zdCBuZWVkc0lucHV0ID0gdGhpcy5yZXF1ZXN0TmVlZHNJbnB1dC5yZWFkKHIpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRTdGF5QWxpdmUgPSBpblByb2dyZXNzIHx8ICEhbmVlZHNJbnB1dDtcblx0XHRcdFx0aWYgKHNob3VsZFN0YXlBbGl2ZSAmJiAhc2VsZlJlZi52YWx1ZSkge1xuXHRcdFx0XHRcdHNlbGZSZWYudmFsdWUgPSBjaGF0U2VydmljZS5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgJ0NoYXRNb2RlbCNyZXF1ZXN0SW5Qcm9ncmVzc0tlZXBBbGl2ZScpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFzaG91bGRTdGF5QWxpdmUgJiYgc2VsZlJlZi52YWx1ZSkge1xuXHRcdFx0XHRcdHNlbGZSZWYuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHN0YXJ0RWRpdGluZ1Nlc3Npb24oaXNHbG9iYWxFZGl0aW5nU2Vzc2lvbj86IGJvb2xlYW4sIHRyYW5zZmVyRnJvbVNlc3Npb24/OiBJQ2hhdEVkaXRpbmdTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2VkaXRpbmdTZXNzaW9uID8/PSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdHRyYW5zZmVyRnJvbVNlc3Npb25cblx0XHRcdFx0PyB0aGlzLmNoYXRFZGl0aW5nU2VydmljZS50cmFuc2ZlckVkaXRpbmdTZXNzaW9uKHRoaXMsIHRyYW5zZmVyRnJvbVNlc3Npb24pXG5cdFx0XHRcdDogaXNHbG9iYWxFZGl0aW5nU2Vzc2lvblxuXHRcdFx0XHRcdD8gdGhpcy5jaGF0RWRpdGluZ1NlcnZpY2Uuc3RhcnRPckNvbnRpbnVlR2xvYmFsRWRpdGluZ1Nlc3Npb24odGhpcylcblx0XHRcdFx0XHQ6IHRoaXMuY2hhdEVkaXRpbmdTZXJ2aWNlLmNyZWF0ZUVkaXRpbmdTZXNzaW9uKHRoaXMpXG5cdFx0KTtcblxuXHRcdGlmICghdGhpcy5fZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmUpIHtcblx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMjogaG9sZCBvbnRvIGEgcmVmZXJlbmNlIHNvIGJhY2tncm91bmQgc2Vzc2lvbnMgZG9uJ3Rcblx0XHRcdC8vIHRyaWdnZXIgZWFybHkgZGlzcG9zYWwuIFRoaXMgd2lsbCBiZSBjbGVhbmVkIHVwIHdpdGggdGhlIGdsb2JhbGl6YXRpb24gb2YgZWRpdHMuXG5cdFx0XHRjb25zdCBzZWxmUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElDaGF0TW9kZWxSZWZlcmVuY2U+KCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdFx0Y29uc3QgaGFzTW9kaWZpZWQgPSBzZXNzaW9uLmVudHJpZXMucmVhZChyKS5zb21lKGUgPT4gZS5zdGF0ZS5yZWFkKHIpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0XHRcdFx0aWYgKGhhc01vZGlmaWVkICYmICFzZWxmUmVmLnZhbHVlKSB7XG5cdFx0XHRcdFx0c2VsZlJlZi52YWx1ZSA9IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbih0aGlzLl9zZXNzaW9uUmVzb3VyY2UsICdDaGF0TW9kZWwjbW9kaWZpZWRFZGl0c0tlZXBBbGl2ZScpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFoYXNNb2RpZmllZCAmJiBzZWxmUmVmLnZhbHVlKSB7XG5cdFx0XHRcdFx0c2VsZlJlZi5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fc2V0RGlzYWJsZWRSZXF1ZXN0cyhzZXNzaW9uLnJlcXVlc3REaXNhYmxlbWVudC5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3VycmVudEVkaXRlZEZpbGVFdmVudHMgPSBuZXcgUmVzb3VyY2VNYXA8SUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudD4oKTtcblx0bm90aWZ5RWRpdGluZ0FjdGlvbihhY3Rpb246IElDaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IGFjdGlvbi5vdXRjb21lID09PSAnYWNjZXB0ZWQnID8gQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kLktlZXAgOlxuXHRcdFx0YWN0aW9uLm91dGNvbWUgPT09ICdyZWplY3RlZCcgPyBDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQuVW5kbyA6XG5cdFx0XHRcdGFjdGlvbi5vdXRjb21lID09PSAndXNlck1vZGlmaWVkJyA/IENoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZC5Vc2VyTW9kaWZpY2F0aW9uIDogbnVsbDtcblx0XHRpZiAoc3RhdGUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudEVkaXRlZEZpbGVFdmVudHMuaGFzKGFjdGlvbi51cmkpIHx8IHRoaXMuY3VycmVudEVkaXRlZEZpbGVFdmVudHMuZ2V0KGFjdGlvbi51cmkpPy5ldmVudEtpbmQgPT09IENoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZC5LZWVwKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzLnNldChhY3Rpb24udXJpLCB7IGV2ZW50S2luZDogc3RhdGUsIHVyaTogYWN0aW9uLnVyaSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZXNlcmlhbGl6ZShvYmo6IElFeHBvcnRhYmxlQ2hhdERhdGEgfCBJU2VyaWFsaXplZENoYXREYXRhUmVmZXJlbmNlKTogQ2hhdFJlcXVlc3RNb2RlbFtdIHtcblx0XHRjb25zdCByZXF1ZXN0cyA9IGhhc0tleShvYmosIHsgc2VyaWFsaXplcjogdHJ1ZSB9KSA/IG9iai52YWx1ZS5yZXF1ZXN0cyA6IG9iai5yZXF1ZXN0cztcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdHMpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYElnbm9yaW5nIG1hbGZvcm1lZCBzZXNzaW9uIGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkob2JqKX1gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3RzLm1hcChyID0+IHRoaXMuX2Rlc2VyaWFsaXplUmVxdWVzdChyKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIGNoYXQgZGF0YScsIGVycm9yKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kZXNlcmlhbGl6ZVJlcXVlc3QocmF3OiBJU2VyaWFsaXphYmxlQ2hhdFJlcXVlc3REYXRhKTogQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9XG5cdFx0XHR0eXBlb2YgcmF3Lm1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gdGhpcy5nZXRQYXJzZWRSZXF1ZXN0RnJvbVN0cmluZyhyYXcubWVzc2FnZSlcblx0XHRcdFx0OiByZXZpdmVQYXJzZWRDaGF0UmVxdWVzdChyYXcubWVzc2FnZSk7XG5cblx0XHQvLyBPbGQgbWVzc2FnZXMgZG9uJ3QgaGF2ZSB2YXJpYWJsZURhdGEsIG9yIGhhdmUgaXQgaW4gdGhlIHdyb25nIChub24tYXJyYXkpIHNoYXBlXG5cdFx0Y29uc3QgdmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEgPSB0aGlzLnJldml2ZVZhcmlhYmxlRGF0YShyYXcudmFyaWFibGVEYXRhKTtcblx0XHRjb25zdCByZXF1ZXN0VGltZXN0YW1wID0gdHlwZW9mIHJhdy50aW1lc3RhbXAgPT09ICdudW1iZXInICYmIHJhdy50aW1lc3RhbXAgPiAwID8gcmF3LnRpbWVzdGFtcCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IENoYXRSZXF1ZXN0TW9kZWwoe1xuXHRcdFx0c2Vzc2lvbjogdGhpcyxcblx0XHRcdG1lc3NhZ2U6IHBhcnNlZFJlcXVlc3QsXG5cdFx0XHR2YXJpYWJsZURhdGEsXG5cdFx0XHR0aW1lc3RhbXA6IHJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRmYWxsYmFja1RpbWVzdGFtcDogdGhpcy5fdGltZXN0YW1wLFxuXHRcdFx0cmVzdG9yZWRJZDogcmF3LnJlcXVlc3RJZCxcblx0XHRcdGNvbmZpcm1hdGlvbjogcmF3LmNvbmZpcm1hdGlvbixcblx0XHRcdGVkaXRlZEZpbGVFdmVudHM6IHJhdy5lZGl0ZWRGaWxlRXZlbnRzLFxuXHRcdFx0bW9kZWxJZDogcmF3Lm1vZGVsSWQsXG5cdFx0XHRtb2RlSW5mbzogcmF3Lm1vZGVJbmZvLFxuXHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHJhdy5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiByYXcuc3lzdGVtSW5pdGlhdGVkTGFiZWwsXG5cdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiByYXcudGVybWluYWxFeGVjdXRpb25JZCxcblx0XHR9KTtcblx0XHRyZXF1ZXN0LnNob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHJhdy5pc0hpZGRlbiA/IHsgcmVxdWVzdElkOiByYXcucmVxdWVzdElkIH0gOiByYXcuc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55LCBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmIChyYXcucmVzcG9uc2UgfHwgcmF3LnJlc3VsdCB8fCAocmF3IGFzIGFueSkucmVzcG9uc2VFcnJvckRldGFpbHMpIHtcblx0XHRcdGNvbnN0IGFnZW50ID0gKHJhdy5hZ2VudCAmJiAnbWV0YWRhdGEnIGluIHJhdy5hZ2VudCkgPyAvLyBDaGVjayBmb3IgdGhlIG5ldyBmb3JtYXQsIGlnbm9yZSBlbnRyaWVzIGluIHRoZSBvbGQgZm9ybWF0XG5cdFx0XHRcdHJldml2ZVNlcmlhbGl6ZWRBZ2VudChyYXcuYWdlbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBQb3J0IGVudHJpZXMgZnJvbSBvbGQgZm9ybWF0XG5cdFx0XHRjb25zdCByZXN1bHQgPSAncmVzcG9uc2VFcnJvckRldGFpbHMnIGluIHJhdyA/XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRcdFx0eyBlcnJvckRldGFpbHM6IHJhdy5yZXNwb25zZUVycm9yRGV0YWlscyB9IGFzIElDaGF0QWdlbnRSZXN1bHQgOiByYXcucmVzdWx0O1xuXHRcdFx0bGV0IG1vZGVsU3RhdGUgPSByYXcubW9kZWxTdGF0ZSB8fCB7IHZhbHVlOiByYXcuaXNDYW5jZWxlZCA/IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQgOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUsIGNvbXBsZXRlZEF0OiBEYXRlLm5vdygpIH07XG5cdFx0XHRpZiAobW9kZWxTdGF0ZS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfHwgbW9kZWxTdGF0ZS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQpIHtcblx0XHRcdFx0bW9kZWxTdGF0ZSA9IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQsIGNvbXBsZXRlZEF0OiBEYXRlLm5vdygpIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1hcmsgcXVlc3Rpb24gY2Fyb3VzZWxzIGFzIHVzZWQgYWZ0ZXJcblx0XHRcdC8vIGRlc2VyaWFsaXphdGlvbi4gQWZ0ZXIgYSByZWxvYWQsIHRoZSBleHRlbnNpb24gaXMgbm8gbG9uZ2VyIGxpc3RlbmluZyBmb3Jcblx0XHRcdC8vIHRoZWlyIHJlc3BvbnNlcywgc28gdGhleSBjYW5ub3QgYmUgaW50ZXJhY3RlZCB3aXRoLlxuXHRcdFx0aWYgKHJhdy5yZXNwb25zZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgcmF3LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0aWYgKGhhc0tleShwYXJ0LCB7IGtpbmQ6IHRydWUgfSkgJiYgKHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnIHx8IHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnKSkge1xuXHRcdFx0XHRcdFx0cGFydC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlID0gbmV3IENoYXRSZXNwb25zZU1vZGVsKHtcblx0XHRcdFx0cmVzcG9uc2VDb250ZW50OiByYXcucmVzcG9uc2UgPz8gW25ldyBNYXJrZG93blN0cmluZyhyYXcucmVzcG9uc2UpXSxcblx0XHRcdFx0c2Vzc2lvbjogdGhpcyxcblx0XHRcdFx0YWdlbnQsXG5cdFx0XHRcdHNsYXNoQ29tbWFuZDogcmF3LnNsYXNoQ29tbWFuZCxcblx0XHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRtb2RlbFN0YXRlLFxuXHRcdFx0XHRjb21wbGV0aW9uVGltZXN0YW1wOiByYXcubW9kZWxTdGF0ZSAmJiAnY29tcGxldGVkQXQnIGluIHJhdy5tb2RlbFN0YXRlICYmIE51bWJlci5pc0Zpbml0ZShyYXcubW9kZWxTdGF0ZS5jb21wbGV0ZWRBdCkgJiYgcmF3Lm1vZGVsU3RhdGUuY29tcGxldGVkQXQgPiAwXG5cdFx0XHRcdFx0PyByYXcubW9kZWxTdGF0ZS5jb21wbGV0ZWRBdFxuXHRcdFx0XHRcdDogbnVsbCxcblx0XHRcdFx0dm90ZTogcmF3LnZvdGUsXG5cdFx0XHRcdHRpbWVzdGFtcDogdHlwZW9mIHJhdy5yZXNwb25zZVRpbWVzdGFtcCA9PT0gJ251bWJlcicgJiYgcmF3LnJlc3BvbnNlVGltZXN0YW1wID4gMCA/IHJhdy5yZXNwb25zZVRpbWVzdGFtcCA6IHJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0Zm9sbG93dXBzOiByYXcuZm9sbG93dXBzLFxuXHRcdFx0XHRyZXN0b3JlZElkOiByYXcucmVzcG9uc2VJZCxcblx0XHRcdFx0dGltZVNwZW50V2FpdGluZzogcmF3LnRpbWVTcGVudFdhaXRpbmcsXG5cdFx0XHRcdGVsYXBzZWRNczogcmF3LmVsYXBzZWRNcyxcblx0XHRcdFx0c2hvdWxkQmVCbG9ja2VkOiByZXF1ZXN0LnNob3VsZEJlQmxvY2tlZC5nZXQoKSxcblx0XHRcdFx0Y29kZUJsb2NrSW5mb3M6IHJhdy5yZXNwb25zZU1hcmtkb3duSW5mbz8ubWFwPElDb2RlQmxvY2tJbmZvPihpbmZvID0+ICh7IHN1Z2dlc3Rpb25JZDogaW5mby5zdWdnZXN0aW9uSWQgfSkpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHJhdy5pc0hpZGRlbiA/IHsgcmVxdWVzdElkOiByYXcucmVxdWVzdElkIH0gOiByYXcuc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHRcdFx0aWYgKHR5cGVvZiByYXcuY29tcGxldGlvblRva2VucyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHJhdy5wcm9tcHRUb2tlbnMgPT09ICdudW1iZXInIHx8IHR5cGVvZiByYXcuY29waWxvdENyZWRpdHMgPT09ICdudW1iZXInIHx8IHR5cGVvZiByYXcuc2Vzc2lvbkNvcGlsb3RDcmVkaXRzID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNldFVzYWdlKHtcblx0XHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRcdHByb21wdFRva2VuczogcmF3LnByb21wdFRva2VucyA/PyAwLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25Ub2tlbnM6IHJhdy5jb21wbGV0aW9uVG9rZW5zID8/IDAsXG5cdFx0XHRcdFx0b3V0cHV0QnVmZmVyOiByYXcub3V0cHV0QnVmZmVyLFxuXHRcdFx0XHRcdHByb21wdFRva2VuRGV0YWlsczogcmF3LnByb21wdFRva2VuRGV0YWlscyxcblx0XHRcdFx0XHRjb3BpbG90Q3JlZGl0czogcmF3LmNvcGlsb3RDcmVkaXRzLFxuXHRcdFx0XHRcdHNlc3Npb25Db3BpbG90Q3JlZGl0czogcmF3LnNlc3Npb25Db3BpbG90Q3JlZGl0cyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmF3LnVzZWRDb250ZXh0KSB7IC8vIEB1bHVnYmVrbmE6IGlmIHRoaXMncyBhIG5ldyB2c2NvZGUgc2Vzc2lvbnMsIGRvYyB2ZXJzaW9ucyBhcmUgaW5jb3JyZWN0IGFueXdheT9cblx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZS5hcHBseVJlZmVyZW5jZShyZXZpdmUocmF3LnVzZWRDb250ZXh0KSk7XG5cdFx0XHR9XG5cblx0XHRcdHJhdy5jb250ZW50UmVmZXJlbmNlcz8uZm9yRWFjaChyID0+IHJlcXVlc3QucmVzcG9uc2UhLmFwcGx5UmVmZXJlbmNlKHJldml2ZShyKSkpO1xuXHRcdFx0cmF3LmNvZGVDaXRhdGlvbnM/LmZvckVhY2goYyA9PiByZXF1ZXN0LnJlc3BvbnNlIS5hcHBseUNvZGVDaXRhdGlvbihyZXZpdmUoYykpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcXVlc3Q7XG5cdH1cblxuXHRwcml2YXRlIHJldml2ZVZhcmlhYmxlRGF0YShyYXc6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdFx0Y29uc3QgdmFyaWFibGVEYXRhID0gcmF3ICYmIEFycmF5LmlzQXJyYXkocmF3LnZhcmlhYmxlcylcblx0XHRcdD8gcmF3IDpcblx0XHRcdHsgdmFyaWFibGVzOiBbXSB9O1xuXG5cdFx0dmFyaWFibGVEYXRhLnZhcmlhYmxlcyA9IHZhcmlhYmxlRGF0YS52YXJpYWJsZXMubWFwPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+KElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkuZnJvbUV4cG9ydCk7XG5cblx0XHRyZXR1cm4gdmFyaWFibGVEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYXJzZWRSZXF1ZXN0RnJvbVN0cmluZyhtZXNzYWdlOiBzdHJpbmcpOiBJUGFyc2VkQ2hhdFJlcXVlc3Qge1xuXHRcdC8vIFRPRE8gVGhlc2Ugb2Zmc2V0cyB3b24ndCBiZSB1c2VkLCBidXQgY2hhdCByZXBsaWVzIG5lZWQgdG8gZ28gdGhyb3VnaCB0aGUgcGFyc2VyIGFzIHdlbGxcblx0XHRjb25zdCBwYXJ0cyA9IFtuZXcgQ2hhdFJlcXVlc3RUZXh0UGFydChuZXcgT2Zmc2V0UmFuZ2UoMCwgbWVzc2FnZS5sZW5ndGgpLCB7IHN0YXJ0Q29sdW1uOiAxLCBzdGFydExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSB9LCBtZXNzYWdlKV07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6IG1lc3NhZ2UsXG5cdFx0XHRwYXJ0c1xuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogSHlkcmF0ZXMgcGVuZGluZyByZXF1ZXN0cyBmcm9tIHNlcmlhbGl6ZWQgZGF0YS5cblx0ICogRm9yIGVhY2ggc2VyaWFsaXplZCBwZW5kaW5nIHJlcXVlc3QsIGZpbmRzIHRoZSBtYXRjaGluZyByZXF1ZXN0IG1vZGVsIGFuZCBhZGRzIGl0IHRvIHRoZSBwZW5kaW5nIHF1ZXVlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVzZXJpYWxpemVQZW5kaW5nUmVxdWVzdHMocGVuZGluZ1JlcXVlc3RzOiBJU2VyaWFsaXphYmxlUGVuZGluZ1JlcXVlc3REYXRhW10pOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gcGVuZGluZ1JlcXVlc3RzLm1hcChwZW5kaW5nID0+ICh7XG5cdFx0XHRcdGlkOiBwZW5kaW5nLmlkLFxuXHRcdFx0XHRyZXF1ZXN0OiB0aGlzLl9kZXNlcmlhbGl6ZVJlcXVlc3QocGVuZGluZy5yZXF1ZXN0KSxcblx0XHRcdFx0a2luZDogcGVuZGluZy5raW5kLFxuXHRcdFx0XHRzZW5kT3B0aW9uczoge1xuXHRcdFx0XHRcdC4uLnBlbmRpbmcuc2VuZE9wdGlvbnMsXG5cdFx0XHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IHBlbmRpbmcuc2VuZE9wdGlvbnMudXNlclNlbGVjdGVkVG9vbHNcblx0XHRcdFx0XHRcdD8gY29uc3RPYnNlcnZhYmxlKHBlbmRpbmcuc2VuZE9wdGlvbnMudXNlclNlbGVjdGVkVG9vbHMpXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHBhcnNlIHBlbmRpbmcgY2hhdCByZXF1ZXN0cycsIGUpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cblxuXHRnZXRSZXF1ZXN0cygpOiBDaGF0UmVxdWVzdE1vZGVsW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1ZXN0cztcblx0fVxuXG5cdHJlc2V0Q2hlY2twb2ludCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgdGhpcy5fcmVxdWVzdHMpIHtcblx0XHRcdHJlcXVlc3Quc2V0U2hvdWxkQmVCbG9ja2VkKGZhbHNlKTtcblx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0QmxvY2tlZFN0YXRlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRDaGVja3BvaW50KHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0bGV0IGNoZWNrcG9pbnQ6IENoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoZWNrcG9pbnRJbmRleCA9IC0xO1xuXHRcdGlmIChyZXF1ZXN0SWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVxdWVzdHMuZm9yRWFjaCgocmVxdWVzdCwgaW5kZXgpID0+IHtcblx0XHRcdFx0aWYgKHJlcXVlc3QuaWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRcdGNoZWNrcG9pbnRJbmRleCA9IGluZGV4O1xuXHRcdFx0XHRcdGNoZWNrcG9pbnQgPSByZXF1ZXN0O1xuXHRcdFx0XHRcdHJlcXVlc3Quc2V0U2hvdWxkQmVCbG9ja2VkKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjaGVja3BvaW50KSB7XG5cdFx0XHRcdHJldHVybjsgLy8gSW52YWxpZCByZXF1ZXN0IElEXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX3JlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaSAtPSAxKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gdGhpcy5fcmVxdWVzdHNbaV07XG5cdFx0XHRpZiAodGhpcy5fY2hlY2twb2ludCAmJiAhY2hlY2twb2ludCkge1xuXHRcdFx0XHRyZXF1ZXN0LnNldFNob3VsZEJlQmxvY2tlZChmYWxzZSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZS5zZXRCbG9ja2VkU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNoZWNrcG9pbnQgJiYgaSA+PSBjaGVja3BvaW50SW5kZXgpIHtcblx0XHRcdFx0cmVxdWVzdC5zZXRTaG91bGRCZUJsb2NrZWQodHJ1ZSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZS5zZXRCbG9ja2VkU3RhdGUodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY2hlY2twb2ludCAmJiBpIDwgY2hlY2twb2ludEluZGV4KSB7XG5cdFx0XHRcdHJlcXVlc3Quc2V0U2hvdWxkQmVCbG9ja2VkKGZhbHNlKTtcblx0XHRcdFx0aWYgKHJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNldEJsb2NrZWRTdGF0ZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9jaGVja3BvaW50ID0gY2hlY2twb2ludDtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrcG9pbnQ6IENoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgY2hlY2twb2ludCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hlY2twb2ludDtcblx0fVxuXG5cdHByaXZhdGUgX3NldERpc2FibGVkUmVxdWVzdHMocmVxdWVzdElkczogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnRbXSkge1xuXHRcdHRoaXMuX3JlcXVlc3RzLmZvckVhY2goKHJlcXVlc3QpID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHJlcXVlc3RJZHMuZmluZChyID0+IHIucmVxdWVzdElkID09PSByZXF1ZXN0LmlkKTtcblx0XHRcdHJlcXVlc3Quc2hvdWxkQmVSZW1vdmVkT25TZW5kID0gc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHRcdFx0aWYgKHJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZS5zaG91bGRCZVJlbW92ZWRPblNlbmQgPSBzaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ3NldEhpZGRlbicgfSk7XG5cdH1cblxuXHRhZGRSZXF1ZXN0KFxuXHRcdG1lc3NhZ2U6IElQYXJzZWRDaGF0UmVxdWVzdCxcblx0XHR2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSxcblx0XHRhdHRlbXB0OiBudW1iZXIsXG5cdFx0bW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbyxcblx0XHRjaGF0QWdlbnQ/OiBJQ2hhdEFnZW50RGF0YSxcblx0XHRzbGFzaENvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZCxcblx0XHRjb25maXJtYXRpb24/OiBzdHJpbmcsXG5cdFx0bG9jYXRpb25EYXRhPzogSUNoYXRMb2NhdGlvbkRhdGEsXG5cdFx0YXR0YWNobWVudHM/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10sXG5cdFx0aXNDb21wbGV0ZUFkZGVkUmVxdWVzdD86IGJvb2xlYW4sXG5cdFx0bW9kZWxJZD86IHN0cmluZyxcblx0XHR1c2VyU2VsZWN0ZWRUb29scz86IFVzZXJTZWxlY3RlZFRvb2xzLFxuXHRcdGlkPzogc3RyaW5nLFxuXHRcdGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbixcblx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZyxcblx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkPzogc3RyaW5nLFxuXHRcdGlzVGVybWluYWxDb21tYW5kPzogYm9vbGVhbixcblx0XHR0aW1lc3RhbXA/OiBudW1iZXIgfCBudWxsLFxuXHQpOiBDaGF0UmVxdWVzdE1vZGVsIHtcblx0XHRjb25zdCBlZGl0ZWRGaWxlRXZlbnRzID0gWy4uLnRoaXMuY3VycmVudEVkaXRlZEZpbGVFdmVudHMudmFsdWVzKCldO1xuXHRcdHRoaXMuY3VycmVudEVkaXRlZEZpbGVFdmVudHMuY2xlYXIoKTtcblx0XHRjb25zdCByZXF1ZXN0VGltZXN0YW1wID0gdGltZXN0YW1wID09PSB1bmRlZmluZWRcblx0XHRcdD8gRGF0ZS5ub3coKVxuXHRcdFx0OiB0eXBlb2YgdGltZXN0YW1wID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSAmJiB0aW1lc3RhbXAgPiAwXG5cdFx0XHRcdD8gdGltZXN0YW1wXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgQ2hhdFJlcXVlc3RNb2RlbCh7XG5cdFx0XHRyZXN0b3JlZElkOiBpZCxcblx0XHRcdHNlc3Npb246IHRoaXMsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0dmFyaWFibGVEYXRhLFxuXHRcdFx0dGltZXN0YW1wOiByZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0ZmFsbGJhY2tUaW1lc3RhbXA6IHRoaXMuX3RpbWVzdGFtcCxcblx0XHRcdGF0dGVtcHQsXG5cdFx0XHRtb2RlSW5mbyxcblx0XHRcdGNvbmZpcm1hdGlvbixcblx0XHRcdGxvY2F0aW9uRGF0YSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogYXR0YWNobWVudHMsXG5cdFx0XHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0LFxuXHRcdFx0bW9kZWxJZCxcblx0XHRcdGVkaXRlZEZpbGVFdmVudHM6IGVkaXRlZEZpbGVFdmVudHMubGVuZ3RoID8gZWRpdGVkRmlsZUV2ZW50cyA6IHVuZGVmaW5lZCxcblx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzLFxuXHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbCxcblx0XHRcdHRlcm1pbmFsRXhlY3V0aW9uSWQsXG5cdFx0XHRpc1Rlcm1pbmFsQ29tbWFuZCxcblx0XHR9KTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlID0gbmV3IENoYXRSZXNwb25zZU1vZGVsKHtcblx0XHRcdHJlc3BvbnNlQ29udGVudDogW10sXG5cdFx0XHRzZXNzaW9uOiB0aGlzLFxuXHRcdFx0YWdlbnQ6IGNoYXRBZ2VudCxcblx0XHRcdHNsYXNoQ29tbWFuZCxcblx0XHRcdHJlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdGlzQ29tcGxldGVBZGRlZFJlcXVlc3QsXG5cdFx0XHRjb2RlQmxvY2tJbmZvczogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRtYXJrQ2hhdCh0aGlzLnNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLlJlcXVlc3RVaVVwZGF0ZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnYWRkUmVxdWVzdCcsIHJlcXVlc3QgfSk7XG5cdFx0cmV0dXJuIHJlcXVlc3Q7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3VzdG9tVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2N1c3RvbVRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdzZXRDdXN0b21UaXRsZScsIHRpdGxlIH0pO1xuXHR9XG5cblx0dXBkYXRlUmVxdWVzdChyZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsLCB2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSkge1xuXHRcdHJlcXVlc3QudmFyaWFibGVEYXRhID0gdmFyaWFibGVEYXRhO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnY2hhbmdlZFJlcXVlc3QnLCByZXF1ZXN0IH0pO1xuXHR9XG5cblx0YWRvcHRSZXF1ZXN0KHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwpOiB2b2lkIHtcblx0XHQvLyB0aGlzIGRvZXNuJ3QgdXNlIGByZW1vdmVSZXF1ZXN0YCBiZWNhdXNlIGl0IG11c3Qgbm90IGRpc3Bvc2UgdGhlIHJlcXVlc3Qgb2JqZWN0XG5cdFx0Y29uc3Qgb2xkT3duZXIgPSByZXF1ZXN0LnNlc3Npb247XG5cdFx0Y29uc3QgaW5kZXggPSBvbGRPd25lci5fcmVxdWVzdHMuZmluZEluZGV4KChjYW5kaWRhdGU6IENoYXRSZXF1ZXN0TW9kZWwpID0+IGNhbmRpZGF0ZS5pZCA9PT0gcmVxdWVzdC5pZCk7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b2xkT3duZXIuX3JlcXVlc3RzLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHRyZXF1ZXN0LmFkb3B0VG8odGhpcyk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uYWRvcHRUbyh0aGlzKTtcblx0XHR0aGlzLl9yZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXG5cdFx0b2xkT3duZXIuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAncmVtb3ZlUmVxdWVzdCcsIHJlcXVlc3RJZDogcmVxdWVzdC5pZCwgcmVzcG9uc2VJZDogcmVxdWVzdC5yZXNwb25zZT8uaWQsIHJlYXNvbjogQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uLkFkb3B0aW9uIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnYWRkUmVxdWVzdCcsIHJlcXVlc3QgfSk7XG5cdH1cblxuXHRhY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwsIHByb2dyZXNzOiBJQ2hhdFByb2dyZXNzLCBxdWlldD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSBuZXcgQ2hhdFJlc3BvbnNlTW9kZWwoe1xuXHRcdFx0XHRyZXNwb25zZUNvbnRlbnQ6IFtdLFxuXHRcdFx0XHRzZXNzaW9uOiB0aGlzLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdGNvZGVCbG9ja0luZm9zOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAocmVxdWVzdC5yZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2FjY2VwdFJlc3BvbnNlUHJvZ3Jlc3M6IEFkZGluZyBwcm9ncmVzcyB0byBhIGNvbXBsZXRlZCByZXNwb25zZScpO1xuXHRcdH1cblxuXHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAndXNhZ2UnKSB7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNldFVzYWdlKHByb2dyZXNzKTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICd1c2VkQ29udGV4dCcgfHwgcHJvZ3Jlc3Mua2luZCA9PT0gJ3JlZmVyZW5jZScpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UuYXBwbHlSZWZlcmVuY2UocHJvZ3Jlc3MpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ2NvZGVDaXRhdGlvbicpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UuYXBwbHlDb2RlQ2l0YXRpb24ocHJvZ3Jlc3MpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ21vdmUnKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ21vdmUnLCB0YXJnZXQ6IHByb2dyZXNzLnVyaSwgcmFuZ2U6IHByb2dyZXNzLnJhbmdlIH0pO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ2NvZGVibG9ja1VyaScgJiYgcHJvZ3Jlc3MuaXNFZGl0KSB7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLmFkZFVuZG9TdG9wKHsgaWQ6IHByb2dyZXNzLnVuZG9TdG9wSWQgPz8gZ2VuZXJhdGVVdWlkKCksIGtpbmQ6ICd1bmRvU3RvcCcgfSk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQocHJvZ3Jlc3MsIHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdwcm9ncmVzc1Rhc2tSZXN1bHQnKSB7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBiZWVuIGhhbmRsZWQgdXBzdHJlYW0sIG5vdCBzZW50IHRvIG1vZGVsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYENvdWxkbid0IGhhbmRsZSBwcm9ncmVzczogJHtKU09OLnN0cmluZ2lmeShwcm9ncmVzcyl9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UudXBkYXRlQ29udGVudChwcm9ncmVzcywgcXVpZXQpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZVJlcXVlc3QoaWQ6IHN0cmluZywgcmVhc29uOiBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24gPSBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24uUmVtb3ZhbCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcmVxdWVzdHMuZmluZEluZGV4KHJlcXVlc3QgPT4gcmVxdWVzdC5pZCA9PT0gaWQpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLl9yZXF1ZXN0c1tpbmRleF07XG5cblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ3JlbW92ZVJlcXVlc3QnLCByZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsIHJlc3BvbnNlSWQ6IHJlcXVlc3QucmVzcG9uc2U/LmlkLCByZWFzb24gfSk7XG5cdFx0XHR0aGlzLl9yZXF1ZXN0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZT8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNhbmNlbFJlcXVlc3QocmVxdWVzdDogQ2hhdFJlcXVlc3RNb2RlbCk6IHZvaWQge1xuXHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLmNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdHNldFJlc3BvbnNlKHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwsIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCk6IHZvaWQge1xuXHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZSA9IG5ldyBDaGF0UmVzcG9uc2VNb2RlbCh7XG5cdFx0XHRcdHJlc3BvbnNlQ29udGVudDogW10sXG5cdFx0XHRcdHNlc3Npb246IHRoaXMsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0Y29kZUJsb2NrSW5mb3M6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0UmVzdWx0KHJlc3VsdCk7XG5cdH1cblxuXHRzZXRGb2xsb3d1cHMocmVxdWVzdDogQ2hhdFJlcXVlc3RNb2RlbCwgZm9sbG93dXBzOiBJQ2hhdEZvbGxvd3VwW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdC8vIE1heWJlIHNvbWV0aGluZyB3ZW50IHdyb25nP1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNldEZvbGxvd3Vwcyhmb2xsb3d1cHMpO1xuXHR9XG5cblx0c2V0UmVzcG9uc2VNb2RlbChyZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsLCByZXNwb25zZTogQ2hhdFJlc3BvbnNlTW9kZWwpOiB2b2lkIHtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlID0gcmVzcG9uc2U7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdhZGRSZXNwb25zZScsIHJlc3BvbnNlIH0pO1xuXHR9XG5cblx0dG9FeHBvcnQoKTogSUV4cG9ydGFibGVDaGF0RGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3BvbmRlclVzZXJuYW1lOiB0aGlzLnJlc3BvbmRlclVzZXJuYW1lLFxuXHRcdFx0aW5pdGlhbExvY2F0aW9uOiB0aGlzLmluaXRpYWxMb2NhdGlvbixcblx0XHRcdHJlcXVlc3RzOiB0aGlzLl9yZXF1ZXN0cy5tYXAoKHIpOiBJU2VyaWFsaXphYmxlQ2hhdFJlcXVlc3REYXRhID0+IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHtcblx0XHRcdFx0XHQuLi5yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0XHRwYXJ0czogci5tZXNzYWdlLnBhcnRzLm1hcCgocDogYW55KSA9PiBwICYmICd0b0pTT04nIGluIHAgPyAocC50b0pTT04gYXMgRnVuY3Rpb24pKCkgOiBwKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHIucmVzcG9uc2U/LmFnZW50O1xuXHRcdFx0XHRjb25zdCBhZ2VudEpzb24gPSBhZ2VudCAmJiAndG9KU09OJyBpbiBhZ2VudCA/IChhZ2VudC50b0pTT04gYXMgRnVuY3Rpb24pKCkgOlxuXHRcdFx0XHRcdGFnZW50ID8geyAuLi5hZ2VudCB9IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlcXVlc3RJZDogci5pZCxcblx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhLnRvRXhwb3J0KHIudmFyaWFibGVEYXRhKSxcblx0XHRcdFx0XHRyZXNwb25zZTogci5yZXNwb25zZSA/XG5cdFx0XHRcdFx0XHRyLnJlc3BvbnNlLmVudGlyZVJlc3BvbnNlLnZhbHVlLmZpbHRlcihpdGVtID0+IGl0ZW0ua2luZCAhPT0gJ3ZvaWNlUHJvZ3Jlc3MnKS5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIEtlZXBpbmcgdGhlIHNoYXBlIG9mIHRoZSBwZXJzaXN0ZWQgZGF0YSB0aGUgc2FtZSBmb3IgYmFjayBjb21wYXRcblx0XHRcdFx0XHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ3RyZWVEYXRhJykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtLnRyZWVEYXRhO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gaXRlbS5jb250ZW50O1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtIGFzIGFueTsgLy8gVE9ET1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2hvdWxkQmVSZW1vdmVkT25TZW5kOiByLnNob3VsZEJlUmVtb3ZlZE9uU2VuZCxcblx0XHRcdFx0XHRhZ2VudDogYWdlbnRKc29uLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogci5yZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbjogci5jb25maXJtYXRpb24sXG5cdFx0XHRcdFx0ZWRpdGVkRmlsZUV2ZW50czogci5lZGl0ZWRGaWxlRXZlbnRzLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHIubW9kZWxJZCxcblx0XHRcdFx0XHRtb2RlSW5mbzogci5tb2RlSW5mbyxcblx0XHRcdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogci5pc1N5c3RlbUluaXRpYXRlZCB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw6IHIuc3lzdGVtSW5pdGlhdGVkTGFiZWwsXG5cdFx0XHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogci50ZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHRcdFx0XHRcdC4uLnIucmVzcG9uc2U/LnRvSlNPTigpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdHRvSlNPTigpOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0Li4udGhpcy50b0V4cG9ydCgpLFxuXHRcdFx0c2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdGNyZWF0aW9uRGF0ZTogdGhpcy5fdGltZXN0YW1wLFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHRoaXMuX2N1c3RvbVRpdGxlLFxuXHRcdFx0aW5wdXRTdGF0ZTogdGhpcy5pbnB1dE1vZGVsLnRvSlNPTigpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy5fd29ya2luZ0RpcmVjdG9yeT8udG9TdHJpbmcoKSxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9yZXF1ZXN0cy5mb3JFYWNoKHIgPT4gci5yZXNwb25zZT8uZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gTnVsbCBvdXQgaGVhdnkgZmllbGRzIHRvIGJyZWFrIHJldGVudGlvbiBjaGFpbnMuIEV2ZW4gYWZ0ZXIgZGlzcG9zYWwsXG5cdFx0Ly8gc3RhbGUgcmVmZXJlbmNlcyAoY2xvc3VyZXMsIGNhY2hlZCB0ZW1wbGF0ZXMsIGV0Yy4pIG1heSBwcmV2ZW50IEdDXG5cdFx0Ly8gZnJvbSBjb2xsZWN0aW5nIHRoaXMgb2JqZWN0LiBDbGVhcmluZyB0aGVzZSBmaWVsZHMgZW5zdXJlcyB0aGVcblx0XHQvLyBjb252ZXJzYXRpb24gZGF0YSwgc2VyaWFsaXphdGlvbiBzbmFwc2hvdCwgYW5kIGVkaXRpbmcgc2Vzc2lvbiBhcmVcblx0XHQvLyBmcmVlZCByZWdhcmRsZXNzLlxuXHRcdHRoaXMuX3JlcXVlc3RzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5kYXRhU2VyaWFsaXplciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lZGl0aW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlUmFuZ2VzKHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhLCBkaWZmOiBudW1iZXIpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEge1xuXHRyZXR1cm4ge1xuXHRcdHZhcmlhYmxlczogdmFyaWFibGVEYXRhLnZhcmlhYmxlcy5tYXAodiA9PiAoe1xuXHRcdFx0Li4udixcblx0XHRcdHJhbmdlOiB2LnJhbmdlICYmIHtcblx0XHRcdFx0c3RhcnQ6IHYucmFuZ2Uuc3RhcnQgLSBkaWZmLFxuXHRcdFx0XHRlbmRFeGNsdXNpdmU6IHYucmFuZ2UuZW5kRXhjbHVzaXZlIC0gZGlmZlxuXHRcdFx0fVxuXHRcdH0pKVxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2FuTWVyZ2VNYXJrZG93blN0cmluZ3MobWQxOiBJTWFya2Rvd25TdHJpbmcsIG1kMjogSU1hcmtkb3duU3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChtZDEuYmFzZVVyaSAmJiBtZDIuYmFzZVVyaSkge1xuXHRcdGNvbnN0IGJhc2VVcmlFcXVhbHMgPSBtZDEuYmFzZVVyaS5zY2hlbWUgPT09IG1kMi5iYXNlVXJpLnNjaGVtZVxuXHRcdFx0JiYgbWQxLmJhc2VVcmkuYXV0aG9yaXR5ID09PSBtZDIuYmFzZVVyaS5hdXRob3JpdHlcblx0XHRcdCYmIG1kMS5iYXNlVXJpLnBhdGggPT09IG1kMi5iYXNlVXJpLnBhdGhcblx0XHRcdCYmIG1kMS5iYXNlVXJpLnF1ZXJ5ID09PSBtZDIuYmFzZVVyaS5xdWVyeVxuXHRcdFx0JiYgbWQxLmJhc2VVcmkuZnJhZ21lbnQgPT09IG1kMi5iYXNlVXJpLmZyYWdtZW50O1xuXHRcdGlmICghYmFzZVVyaUVxdWFscykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fSBlbHNlIGlmIChtZDEuYmFzZVVyaSB8fCBtZDIuYmFzZVVyaSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBlcXVhbHMobWQxLmlzVHJ1c3RlZCwgbWQyLmlzVHJ1c3RlZCkgJiZcblx0XHRtZDEuc3VwcG9ydEh0bWwgPT09IG1kMi5zdXBwb3J0SHRtbCAmJlxuXHRcdG1kMS5zdXBwb3J0VGhlbWVJY29ucyA9PT0gbWQyLnN1cHBvcnRUaGVtZUljb25zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kTWFya2Rvd25TdHJpbmcobWQxOiBJTWFya2Rvd25TdHJpbmcsIG1kMjogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nKTogSU1hcmtkb3duU3RyaW5nIHtcblx0Y29uc3QgYXBwZW5kZWRWYWx1ZSA9IHR5cGVvZiBtZDIgPT09ICdzdHJpbmcnID8gbWQyIDogbWQyLnZhbHVlO1xuXHRyZXR1cm4ge1xuXHRcdHZhbHVlOiBtZDEudmFsdWUgKyBhcHBlbmRlZFZhbHVlLFxuXHRcdGlzVHJ1c3RlZDogbWQxLmlzVHJ1c3RlZCxcblx0XHRzdXBwb3J0VGhlbWVJY29uczogbWQxLnN1cHBvcnRUaGVtZUljb25zLFxuXHRcdHN1cHBvcnRIdG1sOiBtZDEuc3VwcG9ydEh0bWwsXG5cdFx0YmFzZVVyaTogbWQxLmJhc2VVcmlcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvZGVDaXRhdGlvbnNNZXNzYWdlKGNpdGF0aW9uczogUmVhZG9ubHlBcnJheTxJQ2hhdENvZGVDaXRhdGlvbj4pOiBzdHJpbmcge1xuXHRpZiAoY2l0YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGNvbnN0IGxpY2Vuc2VUeXBlcyA9IGNpdGF0aW9ucy5yZWR1Y2UoKHNldCwgYykgPT4gc2V0LmFkZChjLmxpY2Vuc2UpLCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IGxhYmVsID0gbGljZW5zZVR5cGVzLnNpemUgPT09IDEgP1xuXHRcdGxvY2FsaXplKCdjb2RlQ2l0YXRpb24nLCBcIlNpbWlsYXIgY29kZSBmb3VuZCB3aXRoIDEgbGljZW5zZSB0eXBlXCIsIGxpY2Vuc2VUeXBlcy5zaXplKSA6XG5cdFx0bG9jYWxpemUoJ2NvZGVDaXRhdGlvbnMnLCBcIlNpbWlsYXIgY29kZSBmb3VuZCB3aXRoIHswfSBsaWNlbnNlIHR5cGVzXCIsIGxpY2Vuc2VUeXBlcy5zaXplKTtcblx0cmV0dXJuIGxhYmVsO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIHRvIGEgc2VyaWFsaXphYmxlIGZvcm1hdCBieSBleHRyYWN0aW5nIG9ubHlcbiAqIHNlcmlhbGl6YWJsZSBmaWVsZHMgYW5kIGNvbnZlcnRpbmcgb2JzZXJ2YWJsZXMgdG8gc3RhdGljIHZhbHVlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVNlbmRPcHRpb25zKG9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKTogSVNlcmlhbGl6YWJsZVNlbmRPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRtb2RlSW5mbzogb3B0aW9ucy5tb2RlSW5mbyxcblx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWQsXG5cdFx0dXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsQ29uZmlndXJhdGlvbixcblx0XHR1c2VyU2VsZWN0ZWRUb29sczogb3B0aW9ucy51c2VyU2VsZWN0ZWRUb29scz8uZ2V0KCksXG5cdFx0bG9jYXRpb246IG9wdGlvbnMubG9jYXRpb24sXG5cdFx0bG9jYXRpb25EYXRhOiBvcHRpb25zLmxvY2F0aW9uRGF0YSxcblx0XHRhdHRlbXB0OiBvcHRpb25zLmF0dGVtcHQsXG5cdFx0bm9Db21tYW5kRGV0ZWN0aW9uOiBvcHRpb25zLm5vQ29tbWFuZERldGVjdGlvbixcblx0XHRpc1ZvaWNlTW9kZUlucHV0OiBvcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQsXG5cdFx0YWdlbnRJZDogb3B0aW9ucy5hZ2VudElkLFxuXHRcdGFnZW50SWRTaWxlbnQ6IG9wdGlvbnMuYWdlbnRJZFNpbGVudCxcblx0XHRzbGFzaENvbW1hbmQ6IG9wdGlvbnMuc2xhc2hDb21tYW5kLFxuXHRcdGNvbmZpcm1hdGlvbjogb3B0aW9ucy5jb25maXJtYXRpb24sXG5cdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IG9wdGlvbnMuaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw6IG9wdGlvbnMuc3lzdGVtSW5pdGlhdGVkTGFiZWwsXG5cdFx0dGVybWluYWxFeGVjdXRpb25JZDogb3B0aW9ucy50ZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHR9O1xufVxuXG5leHBvcnQgZW51bSBDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQge1xuXHRLZWVwID0gMSxcblx0VW5kbyA9IDIsXG5cdFVzZXJNb2RpZmljYXRpb24gPSAzLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0QWdlbnRFZGl0ZWRGaWxlRXZlbnQge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgZXZlbnRLaW5kOiBDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQ7XG59XG5cbi8qKiBVUkkgZm9yIGEgcmVzb3VyY2UgZW1iZWRkZWQgaW4gYSBjaGF0IHJlcXVlc3QvcmVzcG9uc2UgKi9cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlUmVzb3VyY2Uge1xuXHRleHBvcnQgY29uc3Qgc2NoZW1lID0gJ3ZzY29kZS1jaGF0LXJlc3BvbnNlLXJlc291cmNlJztcblxuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGJhc2VuYW1lPzogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBDaGF0UmVzcG9uc2VSZXNvdXJjZS5zY2hlbWUsXG5cdFx0XHRhdXRob3JpdHk6IGVuY29kZUhleChWU0J1ZmZlci5mcm9tU3RyaW5nKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSksXG5cdFx0XHRwYXRoOiBgL3Rvb2wvJHt0b29sQ2FsbElkfS8ke2luZGV4fWAgKyAoYmFzZW5hbWUgPyBgLyR7YmFzZW5hbWV9YCA6ICcnKSxcblx0XHR9KTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwYXJzZVVyaSh1cmk6IFVSSSk6IHVuZGVmaW5lZCB8IHsgc2Vzc2lvblJlc291cmNlOiBVUkk7IHRvb2xDYWxsSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9IHtcblx0XHRpZiAodXJpLnNjaGVtZSAhPT0gQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRzID0gdXJpLnBhdGguc3BsaXQoJy8nKTtcblx0XHRpZiAocGFydHMubGVuZ3RoIDwgNCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBbLCBraW5kLCB0b29sQ2FsbElkLCBpbmRleF0gPSBwYXJ0cztcblx0XHRpZiAoa2luZCAhPT0gJ3Rvb2wnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGRlY29kZUhleCh1cmkuYXV0aG9yaXR5KS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7IC8vIHByZS0xLjEwOCBsb2NhbCBzZXNzaW9uIElEXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbih1cmkuYXV0aG9yaXR5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsSWQsXG5cdFx0XHRpbmRleDogTnVtYmVyKGluZGV4KSxcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9sb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG5ld1N0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB8IHVuZGVmaW5lZCwgb2xkU3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+IHwgdW5kZWZpbmVkLCBsb2dnZXI6IElMb2dTZXJ2aWNlLCBzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRpZiAoIWNhbkxvZyhsb2dnZXIuZ2V0TGV2ZWwoKSwgTG9nTGV2ZWwuRGVidWcpIHx8IG5ld1N0YXRlPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyID09PSBvbGRTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcikge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBzdGFjayA9IG5ldyBFcnJvcigpLnN0YWNrO1xuXHRjb25zdCBtZXNzYWdlID0gYFtDaGF0TW9kZWxDaGFuZ2VkXSBDaGF0TW9kZWwgSW5wdXQgU3RhdGUgbW9kZWwgY2hhbmdlZDogJHtuZXdTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn0gKHdhczogJHtvbGRTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn0pIGluIHNlc3Npb24gJHtzZXNzaW9uSWR9ICR7c3RhY2t9YDtcblx0bG9nZ2VyLmRlYnVnKG1lc3NhZ2UpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbChtb2RlbDogSUlucHV0TW9kZWwgfCB1bmRlZmluZWQsIG1lc3NhZ2U6IHN0cmluZywgbmV3U3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+IHwgdW5kZWZpbmVkLCBvbGRTdGF0ZTogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT4gfCB1bmRlZmluZWQsIGxvZ2dlcjogSUxvZ1NlcnZpY2UpIHtcblx0aWYgKCFjYW5Mb2cobG9nZ2VyLmdldExldmVsKCksIExvZ0xldmVsLkRlYnVnKSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRtZXNzYWdlID0gW21lc3NhZ2UsXG5cdFx0YG1vZGVsLnNlbGVjdGVkTW9kZWw6ICR7bW9kZWw/LnN0YXRlLmdldCgpPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyfWAsXG5cdFx0YG5ldyBzdGF0ZTogJHtuZXdTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn1gLFxuXHRcdGBvbGQgc3RhdGU6ICR7b2xkU3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9YCxcblx0XHRuZXcgRXJyb3IoKS5zdGFja1xuXHRdLmpvaW4oJywgJyk7XG5cblx0bG9nZ2VyLmRlYnVnKGBbQ2hhdE1vZGVsQ2hhbmdlZF0gQ2hhdCBNb2RlbCBDaGFuZ2VkLCR7bWVzc2FnZX1gKTtc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LFVBQVUsZUFBZSxZQUFZO0FBQzlIO0FBQUEsRUFDRDtBQUNBLFFBQU0sUUFBUSxJQUFJLE1BQU0sRUFBRTtBQUMxQixRQUFNLFVBQVUsMkRBQTJELFVBQVUsZUFBZSxVQUFVLFVBQVUsVUFBVSxlQUFlLFVBQVUsZ0JBQWdCLFNBQVMsSUFBSSxLQUFLO0FBQzdMLFNBQU8sTUFBTSxPQUFPO0FBQ3JCO0FBRU8sU0FBUyx1QkFBdUIsT0FBZ0MsU0FBaUIsVUFBcUQsVUFBcUQsUUFBcUI7QUFDdE4sTUFBSSxDQUFDLE9BQU8sT0FBTyxTQUFTLEdBQUcsU0FBUyxLQUFLLEdBQUc7QUFDL0M7QUFBQSxFQUNEO0FBQ0EsWUFBVTtBQUFBLElBQUM7QUFBQSxJQUNWLHdCQUF3QixPQUFPLE1BQU0sSUFBSSxHQUFHLGVBQWUsVUFBVTtBQUFBLElBQ3JFLGNBQWMsVUFBVSxlQUFlLFVBQVU7QUFBQSxJQUNqRCxjQUFjLFVBQVUsZUFBZSxVQUFVO0FBQUEsSUFDakQsSUFBSSxNQUFNLEVBQUU7QUFBQSxFQUNiLEVBQUUsS0FBSyxJQUFJO0FBRVgsU0FBTyxNQUFNLHlDQUF5QyxPQUFPLEVBQUU7QUFDaEU7IiwKICAibmFtZXMiOiBbIklDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSIsICJDaGF0SW5wdXRTdGF0ZU9yaWdpbiIsICJDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24iLCAicmVxdWVzdCIsICJDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQiLCAiQ2hhdFJlc3BvbnNlUmVzb3VyY2UiLCAiYmFzZW5hbWUiXQp9Cg==
