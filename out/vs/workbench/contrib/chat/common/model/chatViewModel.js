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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, dispose } from "../../../../../base/common/lifecycle.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ChatRequestQueueKind } from "../chatService/chatService.js";
import { getFullyQualifiedId, IChatAgentNameService } from "../participants/chatAgents.js";
import { ChatStreamStatsTracker } from "./chatStreamStats.js";
import { countWords } from "./chatWordCounter.js";
function isRequestVM(item) {
  return !!item && typeof item === "object" && "message" in item;
}
function isResponseVM(item) {
  return !!item && typeof item.setVote !== "undefined";
}
function isPendingDividerVM(item) {
  return !!item && typeof item === "object" && item.kind === "pendingDivider";
}
function isPendingChatViewModelItem(item) {
  return item.kind === "pendingDivider" || item.pendingKind !== void 0;
}
function getStickyScrollTargetItem(items) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!isPendingChatViewModelItem(item)) {
      return item;
    }
  }
  return items.at(-1);
}
function isChatTreeItem(item) {
  return isRequestVM(item) || isResponseVM(item);
}
function assertIsResponseVM(item) {
  if (!isResponseVM(item)) {
    throw new Error("Expected item to be IChatResponseViewModel");
  }
}
let ChatViewModel = class extends Disposable {
  constructor(_model, _options, instantiationService) {
    super();
    this._model = _model;
    this._options = _options;
    this.instantiationService = instantiationService;
    this._onDidDisposeModel = this._register(new Emitter());
    this.onDidDisposeModel = this._onDidDisposeModel.event;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._items = [];
    this._inputPlaceholder = void 0;
    this._editing = void 0;
    _model.getRequests().forEach((request, i) => {
      const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, request);
      this._items.push(requestModel);
      if (request.response) {
        this.onAddResponse(request.response);
      }
    });
    this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
    this._register(_model.onDidChangePendingRequests(() => this._onDidChange.fire(null)));
    this._register(_model.onDidChange((e) => {
      if (e.kind === "addRequest") {
        const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, e.request);
        this._items.push(requestModel);
        if (e.request.response) {
          this.onAddResponse(e.request.response);
        }
      } else if (e.kind === "addResponse") {
        this.onAddResponse(e.response);
      } else if (e.kind === "removeRequest") {
        const requestIdx = this._items.findIndex((item) => isRequestVM(item) && item.id === e.requestId);
        if (requestIdx >= 0) {
          this._items.splice(requestIdx, 1);
        }
        const responseIdx = e.responseId && this._items.findIndex((item) => isResponseVM(item) && item.id === e.responseId);
        if (typeof responseIdx === "number" && responseIdx >= 0) {
          const items = this._items.splice(responseIdx, 1);
          const item = items[0];
          if (item instanceof ChatResponseViewModel) {
            item.dispose();
          }
        }
      }
      const modelEventToVmEvent = e.kind === "addRequest" ? { kind: "addRequest" } : e.kind === "initialize" ? { kind: "initialize" } : e.kind === "setHidden" ? { kind: "setHidden" } : null;
      this._onDidChange.fire(modelEventToVmEvent);
    }));
  }
  get inputPlaceholder() {
    return this._inputPlaceholder;
  }
  get model() {
    return this._model;
  }
  setInputPlaceholder(text) {
    this._inputPlaceholder = text;
    this._onDidChange.fire({ kind: "changePlaceholder" });
  }
  resetInputPlaceholder() {
    this._inputPlaceholder = void 0;
    this._onDidChange.fire({ kind: "changePlaceholder" });
  }
  get sessionResource() {
    return this._model.sessionResource;
  }
  onAddResponse(responseModel) {
    const response = this.instantiationService.createInstance(ChatResponseViewModel, responseModel, this);
    this._register(response.onDidChange(() => {
      return this._onDidChange.fire(null);
    }));
    this._items.push(response);
  }
  getItems() {
    let items = this._items.filter((item) => {
      if (item.shouldBeRemovedOnSend && !item.shouldBeRemovedOnSend.afterUndoStop) {
        return false;
      }
      return true;
    });
    if (this._options?.maxVisibleItems !== void 0 && items.length > this._options.maxVisibleItems) {
      items = items.slice(-this._options.maxVisibleItems);
    }
    const pendingRequests = this._model.getPendingRequests();
    if (pendingRequests.length > 0) {
      const steeringRequests = pendingRequests.filter((p) => p.kind === ChatRequestQueueKind.Steering);
      const queuedRequests = pendingRequests.filter((p) => p.kind === ChatRequestQueueKind.Queued);
      if (steeringRequests.length > 0) {
        const isSystemInitiated = steeringRequests.every((p) => p.request.isSystemInitiated);
        items.push({ kind: "pendingDivider", id: "pending-divider-steering", sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Steering, isSystemInitiated, currentRenderedHeight: void 0 });
        for (const pending of steeringRequests) {
          const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
          items.push(requestVM);
        }
      }
      if (queuedRequests.length > 0) {
        items.push({ kind: "pendingDivider", id: "pending-divider-queued", sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Queued, currentRenderedHeight: void 0 });
        for (const pending of queuedRequests) {
          const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
          items.push(requestVM);
        }
      }
    }
    return items;
  }
  get editing() {
    return this._editing;
  }
  setEditing(editing) {
    if (this.editing && editing && this.editing.id === editing.id) {
      return;
    }
    this._editing = editing;
  }
  dispose() {
    super.dispose();
    dispose(this._items.filter((item) => item instanceof ChatResponseViewModel));
    this._items.length = 0;
  }
};
ChatViewModel = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChatViewModel);
class ChatRequestViewModel {
  constructor(_model, _pendingKind) {
    this._model = _model;
    this._pendingKind = _pendingKind;
  }
  get id() {
    return this._model.id;
  }
  /**
   * An ID that changes when the request should be re-rendered.
   */
  get dataId() {
    return `${this.id}_${this._model.version + (this._model.response?.isComplete ? 1 : 0)}`;
  }
  get sessionResource() {
    return this._model.session.sessionResource;
  }
  get username() {
    return "User";
  }
  get avatarIcon() {
    return Codicon.account;
  }
  get message() {
    return this._model.message;
  }
  get messageText() {
    return this.message.text;
  }
  get attempt() {
    return this._model.attempt;
  }
  get variables() {
    return this._model.variableData.variables;
  }
  get contentReferences() {
    return this._model.response?.contentReferences;
  }
  get confirmation() {
    return this._model.confirmation;
  }
  get isComplete() {
    return this._model.response?.isComplete ?? false;
  }
  get isCompleteAddedRequest() {
    return this._model.isCompleteAddedRequest;
  }
  get isTerminalCommand() {
    return this._model.isTerminalCommand;
  }
  get shouldBeRemovedOnSend() {
    return this._model.shouldBeRemovedOnSend;
  }
  get shouldBeBlocked() {
    return this._model.shouldBeBlocked;
  }
  get slashCommand() {
    return this._model.response?.slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._model.response?.agentOrSlashCommandDetected ?? false;
  }
  get attachedContext() {
    return this._model.attachedContext;
  }
  get modelId() {
    return this._model.modelId;
  }
  get resolvedModelId() {
    const resolvedModel = this._model.response?.result?.metadata?.resolvedModel;
    return typeof resolvedModel === "string" ? resolvedModel : void 0;
  }
  get timestamp() {
    return this._model.timestamp;
  }
  get requestTimestamp() {
    return this._model.requestTimestamp;
  }
  get pendingKind() {
    return this._pendingKind;
  }
  get isSystemInitiated() {
    return this._model.isSystemInitiated;
  }
  get systemInitiatedLabel() {
    return this._model.systemInitiatedLabel;
  }
}
let ChatResponseViewModel = class extends Disposable {
  constructor(_model, session, instantiationService, chatAgentNameService) {
    super();
    this._model = _model;
    this.session = session;
    this.instantiationService = instantiationService;
    this.chatAgentNameService = chatAgentNameService;
    this._modelChangeCount = 0;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.renderData = void 0;
    this._vulnerabilitiesListExpanded = false;
    if (!_model.isComplete) {
      this.liveUpdateTracker = this.instantiationService.createInstance(ChatStreamStatsTracker);
    }
    const wordCountScheduler = this.liveUpdateTracker ? this._register(new RunOnceScheduler(() => {
      const wordCount = countWords(_model.entireResponse.getMarkdown());
      this.liveUpdateTracker.update({ totalWordCount: wordCount });
    }, 0)) : void 0;
    this._register(_model.onDidChange(() => {
      wordCountScheduler?.schedule();
      this._modelChangeCount++;
      this._onDidChange.fire();
    }));
  }
  get model() {
    return this._model;
  }
  get id() {
    return this._model.id;
  }
  get dataId() {
    return this._model.id + `_${this._modelChangeCount}` + (this.isLast ? "_last" : "");
  }
  get sessionResource() {
    return this._model.session.sessionResource;
  }
  get username() {
    if (this.agent) {
      const isAllowed = this.chatAgentNameService.getAgentNameRestriction(this.agent);
      if (isAllowed) {
        return this.agent.fullName || this.agent.name;
      } else {
        return getFullyQualifiedId(this.agent);
      }
    }
    return this._model.username;
  }
  get agent() {
    return this._model.agent;
  }
  get slashCommand() {
    return this._model.slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._model.agentOrSlashCommandDetected;
  }
  get response() {
    return this._model.response;
  }
  get usedContext() {
    return this._model.usedContext;
  }
  get contentReferences() {
    return this._model.contentReferences;
  }
  get codeCitations() {
    return this._model.codeCitations;
  }
  get progressMessages() {
    return this._model.progressMessages;
  }
  get isComplete() {
    return this._model.isComplete;
  }
  get isCanceled() {
    return this._model.isCanceled;
  }
  get shouldBeBlocked() {
    return this._model.shouldBeBlocked;
  }
  get shouldBeRemovedOnSend() {
    return this._model.shouldBeRemovedOnSend;
  }
  get isCompleteAddedRequest() {
    return this._model.isCompleteAddedRequest;
  }
  get isTerminalCommand() {
    return this._model.request?.isTerminalCommand ?? false;
  }
  get replyFollowups() {
    return this._model.followups?.filter((f) => f.kind === "reply");
  }
  get result() {
    return this._model.result;
  }
  get errorDetails() {
    return this.result?.errorDetails;
  }
  get vote() {
    return this._model.vote;
  }
  get requestId() {
    return this._model.requestId;
  }
  get isStale() {
    return this._model.isStale;
  }
  get isLast() {
    return this.session.getItems().at(-1) === this;
  }
  get usedReferencesExpanded() {
    if (typeof this._usedReferencesExpanded === "boolean") {
      return this._usedReferencesExpanded;
    }
    return void 0;
  }
  set usedReferencesExpanded(v) {
    this._usedReferencesExpanded = v;
  }
  get vulnerabilitiesListExpanded() {
    return this._vulnerabilitiesListExpanded;
  }
  set vulnerabilitiesListExpanded(v) {
    this._vulnerabilitiesListExpanded = v;
  }
  get contentUpdateTimings() {
    return this.liveUpdateTracker?.data;
  }
  get confirmationAdjustedTimestamp() {
    return this._model.confirmationAdjustedTimestamp;
  }
  get usageObs() {
    return this._model.usageObs;
  }
  get completionTokenCountObs() {
    return this._model.completionTokenCountObs;
  }
  setVote(vote) {
    this._modelChangeCount++;
    this._model.setVote(vote);
  }
  setEditApplied(edit, editCount) {
    this._modelChangeCount++;
    this._model.setEditApplied(edit, editCount);
  }
};
ChatResponseViewModel = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatAgentNameService)
], ChatResponseViewModel);
export {
  ChatRequestViewModel,
  ChatResponseViewModel,
  ChatViewModel,
  assertIsResponseVM,
  getStickyScrollTargetItem,
  isChatTreeItem,
  isPendingDividerVM,
  isRequestVM,
  isResponseVM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24sIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdENvZGVDaXRhdGlvbiwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBJQ2hhdEZvbGxvd3VwLCBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3csIElDaGF0UGxhblJldmlldywgSUNoYXRQcm9ncmVzc01lc3NhZ2UsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscywgSUNoYXRUYXNrLCBJQ2hhdFVzYWdlLCBJQ2hhdFVzZWRDb250ZXh0IH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RnVsbHlRdWFsaWZpZWRJZCwgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRSZXN1bHQgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCwgSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwsIElDaGF0VGV4dEVkaXRHcm91cCwgSVJlc3BvbnNlIH0gZnJvbSAnLi9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFN0cmVhbVN0YXRzVHJhY2tlciwgSUNoYXRTdHJlYW1TdGF0cyB9IGZyb20gJy4vY2hhdFN0cmVhbVN0YXRzLmpzJztcbmltcG9ydCB7IGNvdW50V29yZHMgfSBmcm9tICcuL2NoYXRXb3JkQ291bnRlci5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1JlcXVlc3RWTShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwge1xuXHRyZXR1cm4gISFpdGVtICYmIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gaXRlbTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVzcG9uc2VWTShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0cmV0dXJuICEhaXRlbSAmJiB0eXBlb2YgKGl0ZW0gYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCkuc2V0Vm90ZSAhPT0gJ3VuZGVmaW5lZCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BlbmRpbmdEaXZpZGVyVk0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCB7XG5cdHJldHVybiAhIWl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIChpdGVtIGFzIElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwpLmtpbmQgPT09ICdwZW5kaW5nRGl2aWRlcic7XG59XG5cbmludGVyZmFjZSBJQ2hhdFZpZXdNb2RlbEl0ZW1XaXRoUGVuZGluZ1N0YXRlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkga2luZD86IHN0cmluZztcblx0cmVhZG9ubHkgcGVuZGluZ0tpbmQ/OiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcbn1cblxuZnVuY3Rpb24gaXNQZW5kaW5nQ2hhdFZpZXdNb2RlbEl0ZW0oaXRlbTogSUNoYXRWaWV3TW9kZWxJdGVtV2l0aFBlbmRpbmdTdGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXRlbS5raW5kID09PSAncGVuZGluZ0RpdmlkZXInIHx8IGl0ZW0ucGVuZGluZ0tpbmQgIT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUaGUgYWN0aXZlIHJlc3BvbnNlIHRoYXQgY29udGVudCBzdHJlYW1zIGludG86IHRoZSBsYXN0IG5vbi1wZW5kaW5nIGl0ZW0sIGlnbm9yaW5nXG4gKiB0cmFpbGluZyBxdWV1ZWQvc3RlZXJpbmcgcm93cyAoYW5kIHRoZWlyIGRpdmlkZXJzKS4gRmFsbHMgYmFjayB0byB0aGUgbGFzdCBpdGVtIHdoZW5cbiAqIGV2ZXJ5dGhpbmcgaXMgcGVuZGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFN0aWNreVNjcm9sbFRhcmdldEl0ZW08VCBleHRlbmRzIElDaGF0Vmlld01vZGVsSXRlbVdpdGhQZW5kaW5nU3RhdGU+KGl0ZW1zOiByZWFkb25seSBUW10pOiBUIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdGlmICghaXNQZW5kaW5nQ2hhdFZpZXdNb2RlbEl0ZW0oaXRlbSkpIHtcblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gaXRlbXMuYXQoLTEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0VHJlZUl0ZW0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB7XG5cdHJldHVybiBpc1JlcXVlc3RWTShpdGVtKSB8fCBpc1Jlc3BvbnNlVk0oaXRlbSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRJc1Jlc3BvbnNlVk0oaXRlbTogdW5rbm93bik6IGFzc2VydHMgaXRlbSBpcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0aWYgKCFpc1Jlc3BvbnNlVk0oaXRlbSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGl0ZW0gdG8gYmUgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCcpO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0Vmlld01vZGVsQ2hhbmdlRXZlbnQgPSBJQ2hhdEFkZFJlcXVlc3RFdmVudCB8IElDaGFuZ2VQbGFjZWhvbGRlckV2ZW50IHwgSUNoYXRTZXNzaW9uSW5pdEV2ZW50IHwgSUNoYXRTZXRIaWRkZW5FdmVudCB8IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZGRSZXF1ZXN0RXZlbnQge1xuXHRraW5kOiAnYWRkUmVxdWVzdCc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYW5nZVBsYWNlaG9sZGVyRXZlbnQge1xuXHRraW5kOiAnY2hhbmdlUGxhY2Vob2xkZXInO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2Vzc2lvbkluaXRFdmVudCB7XG5cdGtpbmQ6ICdpbml0aWFsaXplJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNldEhpZGRlbkV2ZW50IHtcblx0a2luZDogJ3NldEhpZGRlbic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRWaWV3TW9kZWwge1xuXHRyZWFkb25seSBtb2RlbDogSUNoYXRNb2RlbDtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZU1vZGVsOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElDaGF0Vmlld01vZGVsQ2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBpbnB1dFBsYWNlaG9sZGVyPzogc3RyaW5nO1xuXHRnZXRJdGVtcygpOiAoSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB8IElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwpW107XG5cdHNldElucHV0UGxhY2Vob2xkZXIodGV4dDogc3RyaW5nKTogdm9pZDtcblx0cmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk6IHZvaWQ7XG5cdGVkaXRpbmc/OiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWw7XG5cdHNldEVkaXRpbmcoZWRpdGluZzogSUNoYXRSZXF1ZXN0Vmlld01vZGVsKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0LyoqIFRoaXMgSUQgdXBkYXRlcyBldmVyeSB0aW1lIHRoZSB1bmRlcmx5aW5nIGRhdGEgY2hhbmdlcyAqL1xuXHRyZWFkb25seSBkYXRhSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYXZhdGFySWNvbj86IFVSSSB8IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0IHwgSUNoYXRGb2xsb3d1cDtcblx0cmVhZG9ubHkgbWVzc2FnZVRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0ZW1wdDogbnVtYmVyO1xuXHRyZWFkb25seSB2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0Y3VycmVudFJlbmRlcmVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRlbnRSZWZlcmVuY2VzPzogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+O1xuXHRyZWFkb25seSBjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzQ29tcGxldGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGVybWluYWxDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSBzbGFzaENvbW1hbmQ6IElDaGF0QWdlbnRDb21tYW5kIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3VsZEJlQmxvY2tlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGF0dGFjaGVkQ29udGV4dD86IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb2x2ZWRNb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgcmVxdWVzdFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogVGhlIGtpbmQgb2YgcGVuZGluZyByZXF1ZXN0LCBvciB1bmRlZmluZWQgaWYgbm90IHBlbmRpbmcgKi9cblx0cmVhZG9ubHkgcGVuZGluZ0tpbmQ/OiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcblx0cmVhZG9ubHkgaXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlTWFya2Rvd25SZW5kZXJEYXRhIHtcblx0cmVuZGVyZWRXb3JkQ291bnQ6IG51bWJlcjtcblx0bGFzdFJlbmRlclRpbWU6IG51bWJlcjtcblx0aXNGdWxseVJlbmRlcmVkOiBib29sZWFuO1xuXHRvcmlnaW5hbE1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZU1hcmtkb3duUmVuZGVyRGF0YTIge1xuXHRyZW5kZXJlZFdvcmRDb3VudDogbnVtYmVyO1xuXHRsYXN0UmVuZGVyVGltZTogbnVtYmVyO1xuXHRpc0Z1bGx5UmVuZGVyZWQ6IGJvb2xlYW47XG5cdG9yaWdpbmFsTWFya2Rvd246IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFByb2dyZXNzTWVzc2FnZVJlbmRlckRhdGEge1xuXHRwcm9ncmVzc01lc3NhZ2U6IElDaGF0UHJvZ3Jlc3NNZXNzYWdlO1xuXG5cdC8qKlxuXHQgKiBJbmRpY2F0ZXMgd2hldGhlciB0aGlzIGlzIHBhcnQgb2YgYSBncm91cCBvZiBwcm9ncmVzcyBtZXNzYWdlcyB0aGF0IGFyZSBhdCB0aGUgZW5kIG9mIHRoZSByZXNwb25zZS5cblx0ICogKE5vdCB3aGV0aGVyIHRoaXMgcGFydGljdWxhciBpdGVtIGlzIHRoZSB2ZXJ5IGxhc3Qgb25lIGluIHRoZSByZXNwb25zZSkuXG5cdCAqIE5lZWQgdG8gcmUtcmVuZGVyIGFuZCBhZGQgdG8gcGFydHNUb1JlbmRlciB3aGVuIHRoaXMgY2hhbmdlcy5cblx0ICovXG5cdGlzQXRFbmRPZlJlc3BvbnNlOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgcHJvZ3Jlc3MgbWVzc2FnZSB0aGUgdmVyeSBsYXN0IGl0ZW0gaW4gdGhlIHJlc3BvbnNlLlxuXHQgKiBOZWVkIHRvIHJlLXJlbmRlciB0byB1cGRhdGUgc3Bpbm5lciB2cyBjaGVjayB3aGVuIHRoaXMgY2hhbmdlcy5cblx0ICovXG5cdGlzTGFzdDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFRhc2tSZW5kZXJEYXRhIHtcblx0dGFzazogSUNoYXRUYXNrO1xuXHRpc1NldHRsZWQ6IGJvb2xlYW47XG5cdHByb2dyZXNzTGVuZ3RoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVJlbmRlckRhdGEge1xuXHRyZW5kZXJlZFBhcnRzOiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdO1xuXG5cdHJlbmRlcmVkV29yZENvdW50OiBudW1iZXI7XG5cdGxhc3RSZW5kZXJUaW1lOiBudW1iZXI7XG59XG5cbi8qKlxuICogQ29udGVudCB0eXBlIGZvciByZWZlcmVuY2VzIHVzZWQgZHVyaW5nIHJlbmRlcmluZywgbm90IGluIHRoZSBtb2RlbFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVmZXJlbmNlcyB7XG5cdHJlZmVyZW5jZXM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UmVmZXJlbmNlPjtcblx0a2luZDogJ3JlZmVyZW5jZXMnO1xufVxuXG4vKipcbiAqIENvbnRlbnQgdHlwZSBmb3IgdGhlIFwiV29ya2luZ1wiIHByb2dyZXNzIG1lc3NhZ2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFdvcmtpbmdQcm9ncmVzcyB7XG5cdGtpbmQ6ICd3b3JraW5nJztcblx0Y29udGVudD86IElNYXJrZG93blN0cmluZztcbn1cblxuXG4vKipcbiAqIENvbnRlbnQgdHlwZSBmb3IgY2l0YXRpb25zIHVzZWQgZHVyaW5nIHJlbmRlcmluZywgbm90IGluIHRoZSBtb2RlbFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29kZUNpdGF0aW9ucyB7XG5cdGNpdGF0aW9uczogUmVhZG9ubHlBcnJheTxJQ2hhdENvZGVDaXRhdGlvbj47XG5cdGtpbmQ6ICdjb2RlQ2l0YXRpb25zJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEVycm9yRGV0YWlsc1BhcnQge1xuXHRraW5kOiAnZXJyb3JEZXRhaWxzJztcblx0ZXJyb3JEZXRhaWxzOiBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzO1xuXHRpc0xhc3Q6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQge1xuXHRyZWFkb25seSBraW5kOiAnY2hhbmdlc1N1bW1hcnknO1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRUdXJuUGlsbHNQYXJ0IHtcblx0cmVhZG9ubHkga2luZDogJ3R1cm5QaWxscyc7XG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcbn1cblxuLyoqXG4gKiBUeXBlIGZvciBjb250ZW50IHBhcnRzIHJlbmRlcmVkIGJ5IElDaGF0TGlzdFJlbmRlcmVyIChub3QgbmVjZXNzYXJpbHkgaW4gdGhlIG1vZGVsKVxuICovXG5leHBvcnQgdHlwZSBJQ2hhdFJlbmRlcmVyQ29udGVudCA9IElDaGF0UHJvZ3Jlc3NSZW5kZXJhYmxlUmVzcG9uc2VDb250ZW50IHwgSUNoYXRSZWZlcmVuY2VzIHwgSUNoYXRDb2RlQ2l0YXRpb25zIHwgSUNoYXRFcnJvckRldGFpbHNQYXJ0IHwgSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQgfCBJQ2hhdFdvcmtpbmdQcm9ncmVzcyB8IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nIHwgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkIHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTbG93IHwgSUNoYXRRdWVzdGlvbkNhcm91c2VsIHwgSUNoYXRQbGFuUmV2aWV3IHwgSUNoYXREaXNhYmxlZENsYXVkZUhvb2tzUGFydCB8IElDaGF0VHVyblBpbGxzUGFydDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0cmVhZG9ubHkgbW9kZWw6IElDaGF0UmVzcG9uc2VNb2RlbDtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUNoYXRWaWV3TW9kZWw7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHQvKiogVGhpcyBJRCB1cGRhdGVzIGV2ZXJ5IHRpbWUgdGhlIHVuZGVybHlpbmcgZGF0YSBjaGFuZ2VzICovXG5cdHJlYWRvbmx5IGRhdGFJZDogc3RyaW5nO1xuXHQvKiogVGhlIElEIG9mIHRoZSBhc3NvY2lhdGVkIElDaGF0UmVxdWVzdFZpZXdNb2RlbCAqL1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnQ/OiBJQ2hhdEFnZW50RGF0YTtcblx0cmVhZG9ubHkgc2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG5cdHJlYWRvbmx5IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVzcG9uc2U6IElSZXNwb25zZTtcblx0cmVhZG9ubHkgdXNlZENvbnRleHQ6IElDaGF0VXNlZENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRlbnRSZWZlcmVuY2VzOiBSZWFkb25seUFycmF5PElDaGF0Q29udGVudFJlZmVyZW5jZT47XG5cdHJlYWRvbmx5IGNvZGVDaXRhdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb2RlQ2l0YXRpb24+O1xuXHRyZWFkb25seSBwcm9ncmVzc01lc3NhZ2VzOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPjtcblx0cmVhZG9ubHkgaXNDb21wbGV0ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNDYW5jZWxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNTdGFsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgdm90ZTogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVwbHlGb2xsb3d1cHM/OiBJQ2hhdEZvbGxvd3VwW107XG5cdHJlYWRvbmx5IGVycm9yRGV0YWlscz86IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHM7XG5cdHJlYWRvbmx5IHJlc3VsdD86IElDaGF0QWdlbnRSZXN1bHQ7XG5cdHJlYWRvbmx5IGNvbnRlbnRVcGRhdGVUaW1pbmdzPzogSUNoYXRTdHJlYW1TdGF0cztcblx0cmVhZG9ubHkgY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXA6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdHJlYWRvbmx5IHVzYWdlT2JzOiBJT2JzZXJ2YWJsZTxJQ2hhdFVzYWdlIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgY29tcGxldGlvblRva2VuQ291bnRPYnM6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGVybWluYWxDb21tYW5kOiBib29sZWFuO1xuXHRyZW5kZXJEYXRhPzogSUNoYXRSZXNwb25zZVJlbmRlckRhdGE7XG5cdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRzZXRWb3RlKHZvdGU6IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24pOiB2b2lkO1xuXHR1c2VkUmVmZXJlbmNlc0V4cGFuZGVkPzogYm9vbGVhbjtcblx0dnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkOiBib29sZWFuO1xuXHRzZXRFZGl0QXBwbGllZChlZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXAsIGVkaXRDb3VudDogbnVtYmVyKTogdm9pZDtcblx0cmVhZG9ubHkgc2hvdWxkQmVCbG9ja2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFBlbmRpbmdEaXZpZGVyVmlld01vZGVsIHtcblx0cmVhZG9ubHkga2luZDogJ3BlbmRpbmdEaXZpZGVyJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZzsgLy8gZS5nLiwgJ3BlbmRpbmctZGl2aWRlci1zdGVlcmluZycgb3IgJ3BlbmRpbmctZGl2aWRlci1xdWV1ZWQnXG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBpc0NvbXBsZXRlOiB0cnVlO1xuXHRyZWFkb25seSBkaXZpZGVyS2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQ7XG5cdHJlYWRvbmx5IGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0Y3VycmVudFJlbmRlcmVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRWaWV3TW9kZWxPcHRpb25zIHtcblx0LyoqXG5cdCAqIE1heGltdW0gbnVtYmVyIG9mIGl0ZW1zIHRvIHJldHVybiBmcm9tIGdldEl0ZW1zKCkuXG5cdCAqIFdoZW4gc2V0LCBvbmx5IHRoZSBsYXN0IE4gaXRlbXMgYXJlIHJldHVybmVkIChtb3N0IHJlY2VudCByZXF1ZXN0L3Jlc3BvbnNlIHBhaXJzKS5cblx0ICovXG5cdHJlYWRvbmx5IG1heFZpc2libGVJdGVtcz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRWaWV3TW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZU1vZGVsID0gdGhpcy5fb25EaWREaXNwb3NlTW9kZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFZpZXdNb2RlbENoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtczogKENoYXRSZXF1ZXN0Vmlld01vZGVsIHwgQ2hhdFJlc3BvbnNlVmlld01vZGVsKVtdID0gW107XG5cblx0cHJpdmF0ZSBfaW5wdXRQbGFjZWhvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgaW5wdXRQbGFjZWhvbGRlcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dFBsYWNlaG9sZGVyO1xuXHR9XG5cblx0Z2V0IG1vZGVsKCk6IElDaGF0TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbDtcblx0fVxuXG5cdHNldElucHV0UGxhY2Vob2xkZXIodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faW5wdXRQbGFjZWhvbGRlciA9IHRleHQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdjaGFuZ2VQbGFjZWhvbGRlcicgfSk7XG5cdH1cblxuXHRyZXNldElucHV0UGxhY2Vob2xkZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5faW5wdXRQbGFjZWhvbGRlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ2NoYW5nZVBsYWNlaG9sZGVyJyB9KTtcblx0fVxuXG5cdGdldCBzZXNzaW9uUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElDaGF0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUNoYXRWaWV3TW9kZWxPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0X21vZGVsLmdldFJlcXVlc3RzKCkuZm9yRWFjaCgocmVxdWVzdCwgaSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdE1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFZpZXdNb2RlbCwgcmVxdWVzdCk7XG5cdFx0XHR0aGlzLl9pdGVtcy5wdXNoKHJlcXVlc3RNb2RlbCk7XG5cblx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHRoaXMub25BZGRSZXNwb25zZShyZXF1ZXN0LnJlc3BvbnNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9tb2RlbC5vbkRpZERpc3Bvc2UoKCkgPT4gdGhpcy5fb25EaWREaXNwb3NlTW9kZWwuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobnVsbCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbW9kZWwub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnYWRkUmVxdWVzdCcpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdE1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFZpZXdNb2RlbCwgZS5yZXF1ZXN0KTtcblx0XHRcdFx0dGhpcy5faXRlbXMucHVzaChyZXF1ZXN0TW9kZWwpO1xuXG5cdFx0XHRcdGlmIChlLnJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0XHR0aGlzLm9uQWRkUmVzcG9uc2UoZS5yZXF1ZXN0LnJlc3BvbnNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09ICdhZGRSZXNwb25zZScpIHtcblx0XHRcdFx0dGhpcy5vbkFkZFJlc3BvbnNlKGUucmVzcG9uc2UpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09ICdyZW1vdmVSZXF1ZXN0Jykge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWR4ID0gdGhpcy5faXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXNSZXF1ZXN0Vk0oaXRlbSkgJiYgaXRlbS5pZCA9PT0gZS5yZXF1ZXN0SWQpO1xuXHRcdFx0XHRpZiAocmVxdWVzdElkeCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5faXRlbXMuc3BsaWNlKHJlcXVlc3RJZHgsIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2VJZHggPSBlLnJlc3BvbnNlSWQgJiYgdGhpcy5faXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXNSZXNwb25zZVZNKGl0ZW0pICYmIGl0ZW0uaWQgPT09IGUucmVzcG9uc2VJZCk7XG5cdFx0XHRcdGlmICh0eXBlb2YgcmVzcG9uc2VJZHggPT09ICdudW1iZXInICYmIHJlc3BvbnNlSWR4ID49IDApIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2l0ZW1zLnNwbGljZShyZXNwb25zZUlkeCwgMSk7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zWzBdO1xuXHRcdFx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgQ2hhdFJlc3BvbnNlVmlld01vZGVsKSB7XG5cdFx0XHRcdFx0XHRpdGVtLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxFdmVudFRvVm1FdmVudDogSUNoYXRWaWV3TW9kZWxDaGFuZ2VFdmVudCA9XG5cdFx0XHRcdGUua2luZCA9PT0gJ2FkZFJlcXVlc3QnID8geyBraW5kOiAnYWRkUmVxdWVzdCcgfVxuXHRcdFx0XHRcdDogZS5raW5kID09PSAnaW5pdGlhbGl6ZScgPyB7IGtpbmQ6ICdpbml0aWFsaXplJyB9XG5cdFx0XHRcdFx0XHQ6IGUua2luZCA9PT0gJ3NldEhpZGRlbicgPyB7IGtpbmQ6ICdzZXRIaWRkZW4nIH1cblx0XHRcdFx0XHRcdFx0OiBudWxsO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShtb2RlbEV2ZW50VG9WbUV2ZW50KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQWRkUmVzcG9uc2UocmVzcG9uc2VNb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsKSB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXNwb25zZVZpZXdNb2RlbCwgcmVzcG9uc2VNb2RlbCwgdGhpcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzcG9uc2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobnVsbCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2l0ZW1zLnB1c2gocmVzcG9uc2UpO1xuXHR9XG5cblx0Z2V0SXRlbXMoKTogKElDaGF0UmVxdWVzdFZpZXdNb2RlbCB8IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfCBJQ2hhdFBlbmRpbmdEaXZpZGVyVmlld01vZGVsKVtdIHtcblx0XHRsZXQgaXRlbXM6IChJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbClbXSA9IHRoaXMuX2l0ZW1zLmZpbHRlcigoaXRlbSkgPT4ge1xuXHRcdFx0aWYgKGl0ZW0uc2hvdWxkQmVSZW1vdmVkT25TZW5kICYmICFpdGVtLnNob3VsZEJlUmVtb3ZlZE9uU2VuZC5hZnRlclVuZG9TdG9wKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5tYXhWaXNpYmxlSXRlbXMgIT09IHVuZGVmaW5lZCAmJiBpdGVtcy5sZW5ndGggPiB0aGlzLl9vcHRpb25zLm1heFZpc2libGVJdGVtcykge1xuXHRcdFx0aXRlbXMgPSBpdGVtcy5zbGljZSgtdGhpcy5fb3B0aW9ucy5tYXhWaXNpYmxlSXRlbXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0cyA9IHRoaXMuX21vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGlmIChwZW5kaW5nUmVxdWVzdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gU2VwYXJhdGUgc3RlZXJpbmcgYW5kIHF1ZXVlZCByZXF1ZXN0c1xuXHRcdFx0Y29uc3Qgc3RlZXJpbmdSZXF1ZXN0cyA9IHBlbmRpbmdSZXF1ZXN0cy5maWx0ZXIocCA9PiBwLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKTtcblx0XHRcdGNvbnN0IHF1ZXVlZFJlcXVlc3RzID0gcGVuZGluZ1JlcXVlc3RzLmZpbHRlcihwID0+IHAua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkKTtcblxuXHRcdFx0Ly8gQWRkIHN0ZWVyaW5nIHJlcXVlc3RzIHdpdGggdGhlaXIgZGl2aWRlciBmaXJzdFxuXHRcdFx0aWYgKHN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpc1N5c3RlbUluaXRpYXRlZCA9IHN0ZWVyaW5nUmVxdWVzdHMuZXZlcnkocCA9PiBwLnJlcXVlc3QuaXNTeXN0ZW1Jbml0aWF0ZWQpO1xuXHRcdFx0XHRpdGVtcy5wdXNoKHsga2luZDogJ3BlbmRpbmdEaXZpZGVyJywgaWQ6ICdwZW5kaW5nLWRpdmlkZXItc3RlZXJpbmcnLCBzZXNzaW9uUmVzb3VyY2U6IHRoaXMuX21vZGVsLnNlc3Npb25SZXNvdXJjZSwgaXNDb21wbGV0ZTogdHJ1ZSwgZGl2aWRlcktpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCBpc1N5c3RlbUluaXRpYXRlZCwgY3VycmVudFJlbmRlcmVkSGVpZ2h0OiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBzdGVlcmluZ1JlcXVlc3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdFZNID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFZpZXdNb2RlbCwgcGVuZGluZy5yZXF1ZXN0LCBwZW5kaW5nLmtpbmQpO1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2gocmVxdWVzdFZNKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgcXVldWVkIHJlcXVlc3RzIHdpdGggdGhlaXIgZGl2aWRlclxuXHRcdFx0aWYgKHF1ZXVlZFJlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6ICdwZW5kaW5nRGl2aWRlcicsIGlkOiAncGVuZGluZy1kaXZpZGVyLXF1ZXVlZCcsIHNlc3Npb25SZXNvdXJjZTogdGhpcy5fbW9kZWwuc2Vzc2lvblJlc291cmNlLCBpc0NvbXBsZXRlOiB0cnVlLCBkaXZpZGVyS2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCBjdXJyZW50UmVuZGVyZWRIZWlnaHQ6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHF1ZXVlZFJlcXVlc3RzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdFZNID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFZpZXdNb2RlbCwgcGVuZGluZy5yZXF1ZXN0LCBwZW5kaW5nLmtpbmQpO1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2gocmVxdWVzdFZNKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cblx0cHJpdmF0ZSBfZWRpdGluZzogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgZWRpdGluZygpOiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0aW5nO1xuXHR9XG5cblx0c2V0RWRpdGluZyhlZGl0aW5nOiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lZGl0aW5nICYmIGVkaXRpbmcgJiYgdGhpcy5lZGl0aW5nLmlkID09PSBlZGl0aW5nLmlkKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgZWRpdGluZyB0aGlzIHJlcXVlc3Rcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0aW5nID0gZWRpdGluZztcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5faXRlbXMuZmlsdGVyKChpdGVtKTogaXRlbSBpcyBDaGF0UmVzcG9uc2VWaWV3TW9kZWwgPT4gaXRlbSBpbnN0YW5jZW9mIENoYXRSZXNwb25zZVZpZXdNb2RlbCkpO1xuXHRcdHRoaXMuX2l0ZW1zLmxlbmd0aCA9IDA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXF1ZXN0Vmlld01vZGVsIGltcGxlbWVudHMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHtcblx0Z2V0IGlkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5pZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbiBJRCB0aGF0IGNoYW5nZXMgd2hlbiB0aGUgcmVxdWVzdCBzaG91bGQgYmUgcmUtcmVuZGVyZWQuXG5cdCAqL1xuXHRnZXQgZGF0YUlkKCkge1xuXHRcdHJldHVybiBgJHt0aGlzLmlkfV8ke3RoaXMuX21vZGVsLnZlcnNpb24gKyAodGhpcy5fbW9kZWwucmVzcG9uc2U/LmlzQ29tcGxldGUgPyAxIDogMCl9YDtcblx0fVxuXG5cdGdldCBzZXNzaW9uUmVzb3VyY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNlc3Npb24uc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0Z2V0IHVzZXJuYW1lKCkge1xuXHRcdHJldHVybiAnVXNlcic7XG5cdH1cblxuXHRnZXQgYXZhdGFySWNvbigpOiBUaGVtZUljb24ge1xuXHRcdHJldHVybiBDb2RpY29uLmFjY291bnQ7XG5cdH1cblxuXHRnZXQgbWVzc2FnZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwubWVzc2FnZTtcblx0fVxuXG5cdGdldCBtZXNzYWdlVGV4dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5tZXNzYWdlLnRleHQ7XG5cdH1cblxuXHRnZXQgYXR0ZW1wdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuYXR0ZW1wdDtcblx0fVxuXG5cdGdldCB2YXJpYWJsZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnZhcmlhYmxlRGF0YS52YXJpYWJsZXM7XG5cdH1cblxuXHRnZXQgY29udGVudFJlZmVyZW5jZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnJlc3BvbnNlPy5jb250ZW50UmVmZXJlbmNlcztcblx0fVxuXG5cdGdldCBjb25maXJtYXRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmNvbmZpcm1hdGlvbjtcblx0fVxuXG5cdGdldCBpc0NvbXBsZXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZT8uaXNDb21wbGV0ZSA/PyBmYWxzZTtcblx0fVxuXG5cdGdldCBpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0KCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0O1xuXHR9XG5cblx0Z2V0IGlzVGVybWluYWxDb21tYW5kKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5pc1Rlcm1pbmFsQ29tbWFuZDtcblx0fVxuXG5cdGdldCBzaG91bGRCZVJlbW92ZWRPblNlbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNob3VsZEJlUmVtb3ZlZE9uU2VuZDtcblx0fVxuXG5cdGdldCBzaG91bGRCZUJsb2NrZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNob3VsZEJlQmxvY2tlZDtcblx0fVxuXG5cdGdldCBzbGFzaENvbW1hbmQoKTogSUNoYXRBZ2VudENvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZT8uc2xhc2hDb21tYW5kO1xuXHR9XG5cblx0Z2V0IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVzcG9uc2U/LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCA/PyBmYWxzZTtcblx0fVxuXG5cdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBhdHRhY2hlZENvbnRleHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmF0dGFjaGVkQ29udGV4dDtcblx0fVxuXG5cdGdldCBtb2RlbElkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5tb2RlbElkO1xuXHR9XG5cblx0Z2V0IHJlc29sdmVkTW9kZWxJZCgpIHtcblx0XHRjb25zdCByZXNvbHZlZE1vZGVsID0gdGhpcy5fbW9kZWwucmVzcG9uc2U/LnJlc3VsdD8ubWV0YWRhdGE/LnJlc29sdmVkTW9kZWw7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXNvbHZlZE1vZGVsID09PSAnc3RyaW5nJyA/IHJlc29sdmVkTW9kZWwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdGltZXN0YW1wKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC50aW1lc3RhbXA7XG5cdH1cblxuXHRnZXQgcmVxdWVzdFRpbWVzdGFtcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVxdWVzdFRpbWVzdGFtcDtcblx0fVxuXG5cdGdldCBwZW5kaW5nS2luZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0tpbmQ7XG5cdH1cblxuXHRnZXQgaXNTeXN0ZW1Jbml0aWF0ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlzU3lzdGVtSW5pdGlhdGVkO1xuXHR9XG5cblx0Z2V0IHN5c3RlbUluaXRpYXRlZExhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zeXN0ZW1Jbml0aWF0ZWRMYWJlbDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nS2luZD86IENoYXRSZXF1ZXN0UXVldWVLaW5kLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwge1xuXHRwcml2YXRlIF9tb2RlbENoYW5nZUNvdW50ID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBtb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWw7XG5cdH1cblxuXHRnZXQgaWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlkO1xuXHR9XG5cblx0Z2V0IGRhdGFJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaWQgK1xuXHRcdFx0YF8ke3RoaXMuX21vZGVsQ2hhbmdlQ291bnR9YCArXG5cdFx0XHQodGhpcy5pc0xhc3QgPyAnX2xhc3QnIDogJycpO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25SZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdGdldCB1c2VybmFtZSgpIHtcblx0XHRpZiAodGhpcy5hZ2VudCkge1xuXHRcdFx0Y29uc3QgaXNBbGxvd2VkID0gdGhpcy5jaGF0QWdlbnROYW1lU2VydmljZS5nZXRBZ2VudE5hbWVSZXN0cmljdGlvbih0aGlzLmFnZW50KTtcblx0XHRcdGlmIChpc0FsbG93ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYWdlbnQuZnVsbE5hbWUgfHwgdGhpcy5hZ2VudC5uYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGdldEZ1bGx5UXVhbGlmaWVkSWQodGhpcy5hZ2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnVzZXJuYW1lO1xuXHR9XG5cblx0Z2V0IGFnZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5hZ2VudDtcblx0fVxuXG5cdGdldCBzbGFzaENvbW1hbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNsYXNoQ29tbWFuZDtcblx0fVxuXG5cdGdldCBhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZDtcblx0fVxuXG5cdGdldCByZXNwb25zZSgpOiBJUmVzcG9uc2Uge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZTtcblx0fVxuXG5cdGdldCB1c2VkQ29udGV4dCgpOiBJQ2hhdFVzZWRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwudXNlZENvbnRleHQ7XG5cdH1cblxuXHRnZXQgY29udGVudFJlZmVyZW5jZXMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuY29udGVudFJlZmVyZW5jZXM7XG5cdH1cblxuXHRnZXQgY29kZUNpdGF0aW9ucygpOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmNvZGVDaXRhdGlvbnM7XG5cdH1cblxuXHRnZXQgcHJvZ3Jlc3NNZXNzYWdlcygpOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnByb2dyZXNzTWVzc2FnZXM7XG5cdH1cblxuXHRnZXQgaXNDb21wbGV0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNDb21wbGV0ZTtcblx0fVxuXG5cdGdldCBpc0NhbmNlbGVkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5pc0NhbmNlbGVkO1xuXHR9XG5cblx0Z2V0IHNob3VsZEJlQmxvY2tlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuc2hvdWxkQmVCbG9ja2VkO1xuXHR9XG5cblx0Z2V0IHNob3VsZEJlUmVtb3ZlZE9uU2VuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHR9XG5cblx0Z2V0IGlzQ29tcGxldGVBZGRlZFJlcXVlc3QoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlzQ29tcGxldGVBZGRlZFJlcXVlc3Q7XG5cdH1cblxuXHRnZXQgaXNUZXJtaW5hbENvbW1hbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnJlcXVlc3Q/LmlzVGVybWluYWxDb21tYW5kID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHJlcGx5Rm9sbG93dXBzKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5mb2xsb3d1cHM/LmZpbHRlcigoZik6IGYgaXMgSUNoYXRGb2xsb3d1cCA9PiBmLmtpbmQgPT09ICdyZXBseScpO1xuXHR9XG5cblx0Z2V0IHJlc3VsdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVzdWx0O1xuXHR9XG5cblx0Z2V0IGVycm9yRGV0YWlscygpOiBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ/LmVycm9yRGV0YWlscztcblx0fVxuXG5cdGdldCB2b3RlKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC52b3RlO1xuXHR9XG5cblx0Z2V0IHJlcXVlc3RJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVxdWVzdElkO1xuXHR9XG5cblx0Z2V0IGlzU3RhbGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlzU3RhbGU7XG5cdH1cblxuXHRnZXQgaXNMYXN0KCk6IGJvb2xlYW4ge1xuXHRcdC8vIE5PVEU6IHRoaXMgaXMgdXNlZCBpbiBgZGF0YUlkYCB0byBmb3JjZSBhIHJlLXJlbmRlciB3aGVuIHRoZSByZXNwb25zZSB0cmFuc2l0aW9uc1xuXHRcdC8vIGJldHdlZW4gYmVpbmcgdGhlIGxhc3Qgcm93IGFuZCBub3QsIGUuZy4gd2hlbiBhIHF1ZXVlZC9zdGVlcmluZyByb3cgaXMgYWRkZWQgYmVsb3dcblx0XHQvLyBpdC4gSXQgbXVzdCByZWZsZWN0IHRoZSBhY3R1YWwgbGFzdCByb3cgc28gdGhlIHJvdyByZS1yZW5kZXJzIGFuZCBkcm9wcyB0aGVcblx0XHQvLyByZXNlcnZlZC1zcGFjZSBmaWxsZXIgY2xhc3MuIFByb2dyZXNzaXZlIHJlbmRlcmluZyB0YXJnZXRzIHRoZSBzdHJlYW1pbmcgcmVzcG9uc2Vcblx0XHQvLyBzZXBhcmF0ZWx5IChzZWUgYGdldFN0aWNreVNjcm9sbFRhcmdldEl0ZW1gKS5cblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLmdldEl0ZW1zKCkuYXQoLTEpID09PSB0aGlzO1xuXHR9XG5cblx0cmVuZGVyRGF0YTogSUNoYXRSZXNwb25zZVJlbmRlckRhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3VzZWRSZWZlcmVuY2VzRXhwYW5kZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdGdldCB1c2VkUmVmZXJlbmNlc0V4cGFuZGVkKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fdXNlZFJlZmVyZW5jZXNFeHBhbmRlZCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdXNlZFJlZmVyZW5jZXNFeHBhbmRlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0IHVzZWRSZWZlcmVuY2VzRXhwYW5kZWQodjogYm9vbGVhbikge1xuXHRcdHRoaXMuX3VzZWRSZWZlcmVuY2VzRXhwYW5kZWQgPSB2O1xuXHR9XG5cblx0cHJpdmF0ZSBfdnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCB2dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Z1bG5lcmFiaWxpdGllc0xpc3RFeHBhbmRlZDtcblx0fVxuXG5cdHNldCB2dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQodjogYm9vbGVhbikge1xuXHRcdHRoaXMuX3Z1bG5lcmFiaWxpdGllc0xpc3RFeHBhbmRlZCA9IHY7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGxpdmVVcGRhdGVUcmFja2VyOiBDaGF0U3RyZWFtU3RhdHNUcmFja2VyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBjb250ZW50VXBkYXRlVGltaW5ncygpOiBJQ2hhdFN0cmVhbVN0YXRzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5saXZlVXBkYXRlVHJhY2tlcj8uZGF0YTtcblx0fVxuXG5cdGdldCBjb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcCgpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXA7XG5cdH1cblxuXHRnZXQgdXNhZ2VPYnMoKTogSU9ic2VydmFibGU8SUNoYXRVc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC51c2FnZU9icztcblx0fVxuXG5cdGdldCBjb21wbGV0aW9uVG9rZW5Db3VudE9icygpOiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuY29tcGxldGlvblRva2VuQ291bnRPYnM7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXNzaW9uOiBJQ2hhdFZpZXdNb2RlbCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRBZ2VudE5hbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50TmFtZVNlcnZpY2U6IElDaGF0QWdlbnROYW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmICghX21vZGVsLmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMubGl2ZVVwZGF0ZVRyYWNrZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTdHJlYW1TdGF0c1RyYWNrZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmRDb3VudFNjaGVkdWxlciA9IHRoaXMubGl2ZVVwZGF0ZVRyYWNrZXIgPyB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JkQ291bnQgPSBjb3VudFdvcmRzKF9tb2RlbC5lbnRpcmVSZXNwb25zZS5nZXRNYXJrZG93bigpKTtcblx0XHRcdHRoaXMubGl2ZVVwZGF0ZVRyYWNrZXIhLnVwZGF0ZSh7IHRvdGFsV29yZENvdW50OiB3b3JkQ291bnQgfSk7XG5cdFx0fSwgMCkpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHdvcmRDb3VudFNjaGVkdWxlcj8uc2NoZWR1bGUoKTtcblxuXHRcdFx0Ly8gbmV3IGRhdGEgLT4gbmV3IGlkLCBuZXcgY29udGVudCB0byByZW5kZXJcblx0XHRcdHRoaXMuX21vZGVsQ2hhbmdlQ291bnQrKztcblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldFZvdGUodm90ZTogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsQ2hhbmdlQ291bnQrKztcblx0XHR0aGlzLl9tb2RlbC5zZXRWb3RlKHZvdGUpO1xuXHR9XG5cblx0c2V0RWRpdEFwcGxpZWQoZWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwLCBlZGl0Q291bnQ6IG51bWJlcikge1xuXHRcdHRoaXMuX21vZGVsQ2hhbmdlQ291bnQrKztcblx0XHR0aGlzLl9tb2RlbC5zZXRFZGl0QXBwbGllZChlZGl0LCBlZGl0Q291bnQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFNBQVMsd0JBQXdCO0FBSWpDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQWlDLDRCQUEyVTtBQUM1VyxTQUFTLHFCQUF3RCw2QkFBK0M7QUFHaEgsU0FBUyw4QkFBZ0Q7QUFDekQsU0FBUyxrQkFBa0I7QUFFcEIsU0FBUyxZQUFZLE1BQThDO0FBQ3pFLFNBQU8sQ0FBQyxDQUFDLFFBQVEsT0FBTyxTQUFTLFlBQVksYUFBYTtBQUMzRDtBQUVPLFNBQVMsYUFBYSxNQUErQztBQUMzRSxTQUFPLENBQUMsQ0FBQyxRQUFRLE9BQVEsS0FBZ0MsWUFBWTtBQUN0RTtBQUVPLFNBQVMsbUJBQW1CLE1BQXFEO0FBQ3ZGLFNBQU8sQ0FBQyxDQUFDLFFBQVEsT0FBTyxTQUFTLFlBQWEsS0FBc0MsU0FBUztBQUM5RjtBQVFBLFNBQVMsMkJBQTJCLE1BQW1EO0FBQ3RGLFNBQU8sS0FBSyxTQUFTLG9CQUFvQixLQUFLLGdCQUFnQjtBQUMvRDtBQU9PLFNBQVMsMEJB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
