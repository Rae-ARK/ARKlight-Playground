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
import { ProgressBar } from "../../../../../../../base/browser/ui/progressbar/progressbar.js";
import { Lazy } from "../../../../../../../base/common/lazy.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { getExtensionForMimeType } from "../../../../../../../base/common/mime.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ChatResponseResource } from "../../../../common/model/chatModel.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { ChatCollapsibleInputOutputContentPart } from "../chatToolInputOutputContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { getToolApprovalMessage, shouldShimmerForTool } from "./chatToolPartUtilities.js";
let ChatInputOutputMarkdownProgressPart = class extends BaseChatToolInvocationSubPart {
  get codeblocks() {
    return this.collapsibleListPart.codeblocks;
  }
  constructor(toolInvocation, context, codeBlockStartIndex, message, subtitle, input, inputLanguage, output, isError, instantiationService, modelService, languageService) {
    super(toolInvocation);
    let codeBlockIndex = codeBlockStartIndex;
    const createCodePart = (data, languageId = "json") => ({
      kind: "code",
      data,
      languageId,
      codeBlockIndex: codeBlockIndex++,
      ownerMarkdownPartId: this.codeblocksPartId,
      options: {
        hideToolbar: true,
        reserveWidth: 19,
        maxHeightInLines: 13,
        verticalPadding: 5,
        editorOptions: {
          wordWrap: "on"
        }
      }
    });
    let processedOutput = output;
    if (typeof output === "string") {
      processedOutput = [{ type: "embed", value: output, isText: true }];
    }
    const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(
      ChatCollapsibleInputOutputContentPart,
      message,
      subtitle,
      this.getAutoApproveMessageContent(),
      context,
      createCodePart(input, inputLanguage),
      processedOutput && processedOutput.length > 0 ? {
        parts: processedOutput.map((o, i) => {
          const permalinkBasename = o.type === "ref" || o.uri ? basename(o.uri) : o.mimeType && getExtensionForMimeType(o.mimeType) ? `file${getExtensionForMimeType(o.mimeType)}` : "file" + (o.isText ? ".txt" : ".bin");
          if (o.type === "ref") {
            return { kind: "data", uri: o.uri, mimeType: o.mimeType };
          } else if (o.isText && !o.asResource) {
            return createCodePart(o.value);
          } else {
            const permalinkUri = ChatResponseResource.createUri(context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
            if (!o.isText) {
              return { kind: "data", base64Value: o.value, mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
            } else {
              return { kind: "data", value: new TextEncoder().encode(o.value), mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
            }
          }
        })
      } : void 0,
      isError,
      ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false,
      shouldShimmerForTool(toolInvocation, message)
    ));
    this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));
    const progressObservable = toolInvocation.kind === "toolInvocation" ? toolInvocation.state.map((s, r) => s.type === IChatToolInvocation.StateKind.Executing ? s.progress.read(r) : void 0) : void 0;
    const progressBar = new Lazy(() => this._register(new ProgressBar(collapsibleListPart.domNode)));
    if (progressObservable) {
      this._register(autorun((reader) => {
        const progress = progressObservable?.read(reader);
        if (progress?.message) {
          collapsibleListPart.title = progress.message;
        }
        if (progress?.progress && !IChatToolInvocation.isComplete(toolInvocation, reader)) {
          progressBar.value.setWorked(progress.progress * 100);
        }
      }));
    }
    this.domNode = collapsibleListPart.domNode;
  }
  getAutoApproveMessageContent() {
    return getToolApprovalMessage(this.toolInvocation);
  }
};
/** Remembers expanded tool parts on re-render */
ChatInputOutputMarkdownProgressPart._expandedByDefault = /* @__PURE__ */ new WeakMap();
ChatInputOutputMarkdownProgressPart = __decorateClass([
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IModelService),
  __decorateParam(11, ILanguageService)
], ChatInputOutputMarkdownProgressPart);
export {
  ChatInputOutputMarkdownProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRJbnB1dE91dHB1dE1hcmtkb3duUHJvZ3Jlc3NQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkZvck1pbWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8gfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVJbnB1dE91dHB1dENvbnRlbnRQYXJ0LCBDaGF0Q29sbGFwc2libGVJT1BhcnQsIElDaGF0Q29sbGFwc2libGVJT0NvZGVQYXJ0IH0gZnJvbSAnLi4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IGdldFRvb2xBcHByb3ZhbE1lc3NhZ2UsIHNob3VsZFNoaW1tZXJGb3JUb29sIH0gZnJvbSAnLi9jaGF0VG9vbFBhcnRVdGlsaXRpZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdC8qKiBSZW1lbWJlcnMgZXhwYW5kZWQgdG9vbCBwYXJ0cyBvbiByZS1yZW5kZXIgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2V4cGFuZGVkQnlEZWZhdWx0ID0gbmV3IFdlYWtNYXA8SUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBib29sZWFuPigpO1xuXG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb2xsYXBzaWJsZUxpc3RQYXJ0OiBDaGF0Q29sbGFwc2libGVJbnB1dE91dHB1dENvbnRlbnRQYXJ0O1xuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2NrcygpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGFwc2libGVMaXN0UGFydC5jb2RlYmxvY2tzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRjb2RlQmxvY2tTdGFydEluZGV4OiBudW1iZXIsXG5cdFx0bWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLFxuXHRcdHN1YnRpdGxlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0aW5wdXQ6IHN0cmluZyxcblx0XHRpbnB1dExhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0b3V0cHV0OiBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlsc1snb3V0cHV0J10gfCB1bmRlZmluZWQsXG5cdFx0aXNFcnJvcjogYm9vbGVhbixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24pO1xuXG5cdFx0bGV0IGNvZGVCbG9ja0luZGV4ID0gY29kZUJsb2NrU3RhcnRJbmRleDtcblxuXHRcdC8vIFNpbXBsZSBmYWN0b3J5IHRvIGNyZWF0ZSBjb2RlIHBhcnQgZGF0YSBvYmplY3RzXG5cdFx0Y29uc3QgY3JlYXRlQ29kZVBhcnQgPSAoZGF0YTogc3RyaW5nLCBsYW5ndWFnZUlkID0gJ2pzb24nKTogSUNoYXRDb2xsYXBzaWJsZUlPQ29kZVBhcnQgPT4gKHtcblx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdGRhdGEsXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0Y29kZUJsb2NrSW5kZXg6IGNvZGVCbG9ja0luZGV4KyssXG5cdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHRtYXhIZWlnaHRJbkxpbmVzOiAxMyxcblx0XHRcdFx0dmVydGljYWxQYWRkaW5nOiA1LFxuXHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdFx0d29yZFdyYXA6ICdvbidcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHByb2Nlc3NlZE91dHB1dCA9IG91dHB1dDtcblx0XHRpZiAodHlwZW9mIG91dHB1dCA9PT0gJ3N0cmluZycpIHsgLy8gYmFjayBjb21wYXQgd2l0aCBvbGRlciBzdG9yZWQgdmVyc2lvbnNcblx0XHRcdHByb2Nlc3NlZE91dHB1dCA9IFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiBvdXRwdXQsIGlzVGV4dDogdHJ1ZSB9XTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2xsYXBzaWJsZUxpc3RQYXJ0ID0gdGhpcy5jb2xsYXBzaWJsZUxpc3RQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q29sbGFwc2libGVJbnB1dE91dHB1dENvbnRlbnRQYXJ0LFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHN1YnRpdGxlLFxuXHRcdFx0dGhpcy5nZXRBdXRvQXBwcm92ZU1lc3NhZ2VDb250ZW50KCksXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0Y3JlYXRlQ29kZVBhcnQoaW5wdXQsIGlucHV0TGFuZ3VhZ2UpLFxuXHRcdFx0cHJvY2Vzc2VkT3V0cHV0ICYmIHByb2Nlc3NlZE91dHB1dC5sZW5ndGggPiAwID8ge1xuXHRcdFx0XHRwYXJ0czogcHJvY2Vzc2VkT3V0cHV0Lm1hcCgobywgaSk6IENoYXRDb2xsYXBzaWJsZUlPUGFydCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGVybWFsaW5rQmFzZW5hbWUgPSBvLnR5cGUgPT09ICdyZWYnIHx8IG8udXJpXG5cdFx0XHRcdFx0XHQ/IGJhc2VuYW1lKG8udXJpISlcblx0XHRcdFx0XHRcdDogby5taW1lVHlwZSAmJiBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShvLm1pbWVUeXBlKVxuXHRcdFx0XHRcdFx0XHQ/IGBmaWxlJHtnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShvLm1pbWVUeXBlKX1gXG5cdFx0XHRcdFx0XHRcdDogJ2ZpbGUnICsgKG8uaXNUZXh0ID8gJy50eHQnIDogJy5iaW4nKTtcblxuXG5cdFx0XHRcdFx0aWYgKG8udHlwZSA9PT0gJ3JlZicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdkYXRhJywgdXJpOiBvLnVyaSwgbWltZVR5cGU6IG8ubWltZVR5cGUgfTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKG8uaXNUZXh0ICYmICFvLmFzUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjcmVhdGVDb2RlUGFydChvLnZhbHVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gRGVmZXIgYmFzZTY0IGRlY29kaW5nIHRvIGF2b2lkIGV4cGVuc2l2ZSBkZWNvZGUgZHVyaW5nIHNjcm9sbC5cblx0XHRcdFx0XHRcdC8vIFRoZSB2YWx1ZSB3aWxsIGJlIGRlY29kZWQgbGF6aWx5IGluIENoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQuXG5cdFx0XHRcdFx0XHRjb25zdCBwZXJtYWxpbmtVcmkgPSBDaGF0UmVzcG9uc2VSZXNvdXJjZS5jcmVhdGVVcmkoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgdG9vbEludm9jYXRpb24udG9vbENhbGxJZCwgaSwgcGVybWFsaW5rQmFzZW5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKCFvLmlzVGV4dCkge1xuXHRcdFx0XHRcdFx0XHQvLyBQYXNzIGJhc2U2NCBzdHJpbmcgZm9yIGxhenkgZGVjb2Rpbmdcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2RhdGEnLCBiYXNlNjRWYWx1ZTogby52YWx1ZSwgbWltZVR5cGU6IG8ubWltZVR5cGUsIHVyaTogcGVybWFsaW5rVXJpLCBhdWRpZW5jZTogby5hdWRpZW5jZSB9O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gVGV4dCBjb250ZW50OiBlbmNvZGUgaW1tZWRpYXRlbHkgc2luY2UgaXQncyBub3QgZXhwZW5zaXZlXG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdkYXRhJywgdmFsdWU6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShvLnZhbHVlKSwgbWltZVR5cGU6IG8ubWltZVR5cGUsIHVyaTogcGVybWFsaW5rVXJpLCBhdWRpZW5jZTogby5hdWRpZW5jZSB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0aXNFcnJvcixcblx0XHRcdENoYXRJbnB1dE91dHB1dE1hcmtkb3duUHJvZ3Jlc3NQYXJ0Ll9leHBhbmRlZEJ5RGVmYXVsdC5nZXQodG9vbEludm9jYXRpb24pID8/IGZhbHNlLFxuXHRcdFx0c2hvdWxkU2hpbW1lckZvclRvb2wodG9vbEludm9jYXRpb24sIG1lc3NhZ2UpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydC5fZXhwYW5kZWRCeURlZmF1bHQuc2V0KHRvb2xJbnZvY2F0aW9uLCBjb2xsYXBzaWJsZUxpc3RQYXJ0LmV4cGFuZGVkKSkpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NPYnNlcnZhYmxlID0gdG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyA/IHRvb2xJbnZvY2F0aW9uLnN0YXRlLm1hcCgocywgcikgPT4gcy50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcgPyBzLnByb2dyZXNzLnJlYWQocikgOiB1bmRlZmluZWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByb2dyZXNzQmFyID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKGNvbGxhcHNpYmxlTGlzdFBhcnQuZG9tTm9kZSkpKTtcblx0XHRpZiAocHJvZ3Jlc3NPYnNlcnZhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb2dyZXNzID0gcHJvZ3Jlc3NPYnNlcnZhYmxlPy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChwcm9ncmVzcz8ubWVzc2FnZSkge1xuXHRcdFx0XHRcdGNvbGxhcHNpYmxlTGlzdFBhcnQudGl0bGUgPSBwcm9ncmVzcy5tZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwcm9ncmVzcz8ucHJvZ3Jlc3MgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbiwgcmVhZGVyKSkge1xuXHRcdFx0XHRcdHByb2dyZXNzQmFyLnZhbHVlLnNldFdvcmtlZChwcm9ncmVzcy5wcm9ncmVzcyAqIDEwMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBjb2xsYXBzaWJsZUxpc3RQYXJ0LmRvbU5vZGU7XG5cdH1cblxuXHRwcml2YXRlIGdldEF1dG9BcHByb3ZlTWVzc2FnZUNvbnRlbnQoKSB7XG5cdFx0cmV0dXJuIGdldFRvb2xBcHByb3ZhbE1lc3NhZ2UodGhpcy50b29sSW52b2NhdGlvbik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMs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
