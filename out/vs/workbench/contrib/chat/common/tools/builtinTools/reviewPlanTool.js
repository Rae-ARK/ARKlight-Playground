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
import { raceCancellation } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IChatService } from "../../chatService/chatService.js";
import { ChatPlanReviewData } from "../../model/chatProgressTypes/chatPlanReviewData.js";
import { ToolDataSource } from "../languageModelToolsService.js";
const ReviewPlanToolId = "vscode_reviewPlan";
function createReviewPlanToolData() {
  const approvalActionSchema = {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Short action label shown in the dropdown button."
      },
      description: {
        type: "string",
        description: "Optional detail shown below the label in the dropdown list."
      },
      default: {
        type: "boolean",
        description: "Whether this action should be selected by default."
      },
      permissionLevel: {
        type: "string",
        enum: ["autopilot"],
        description: 'When set to "autopilot", a confirmation dialog is shown before proceeding.'
      }
    },
    required: ["label"]
  };
  const inputSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: 'Title displayed in the widget header. Defaults to "Plan summary" if omitted.'
      },
      plan: {
        type: "string",
        description: "Optional URI of an editable plan file. An Edit button in the widget header opens it in the editor."
      },
      content: {
        type: "string",
        description: "Markdown content rendered in the body of the widget. May be the plan summary or full plan text."
      },
      actions: {
        type: "array",
        description: "List of approval actions offered in the primary dropdown button. Order is preserved.",
        items: approvalActionSchema,
        minItems: 1
      },
      canProvideFeedback: {
        type: "boolean",
        description: "When true, an additional feedback textarea is shown below the plan content."
      }
    },
    required: ["content", "actions", "canProvideFeedback"]
  };
  return {
    id: ReviewPlanToolId,
    toolReferenceName: "reviewPlan",
    canBeReferencedInPrompt: false,
    icon: ThemeIcon.fromId(Codicon.checklist.id),
    displayName: localize("tool.reviewPlan.displayName", "Review Plan"),
    userDescription: localize("tool.reviewPlan.userDescription", "Ask the user to review and approve a plan before proceeding."),
    modelDescription: "Use this tool to present a plan to the user for review. Provide the plan content as markdown, a list of approval actions (with optional default), and whether the user can provide freeform feedback. Optionally provide a URI to the backing plan file so the user can edit it. The tool returns the chosen action, whether the plan was rejected, and any feedback.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const ReviewPlanToolData = createReviewPlanToolData();
let ReviewPlanTool = class extends Disposable {
  constructor(chatService, logService) {
    super();
    this.chatService = chatService;
    this.logService = logService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const parameters = invocation.parameters;
    const { title, plan, content, actions, canProvideFeedback } = parameters;
    if (!actions || actions.length === 0) {
      throw new Error(localize("reviewPlanTool.noActions", "At least one approval action must be provided."));
    }
    const { request } = this.getRequest(invocation.context?.sessionResource, invocation.chatRequestId);
    if (!request) {
      this.logService.warn("[ReviewPlanTool] Missing chat context; returning rejected result.");
      return this.toResult({ rejected: true });
    }
    let planUri;
    if (plan) {
      try {
        planUri = URI.parse(plan);
      } catch {
        try {
          planUri = URI.file(plan);
        } catch {
          planUri = void 0;
        }
      }
    }
    const reviewData = new ChatPlanReviewData(
      title ?? localize("reviewPlanTool.defaultTitle", "Plan summary"),
      content,
      actions,
      canProvideFeedback,
      planUri?.toJSON(),
      generateUuid()
    );
    this.chatService.appendProgress(request, reviewData);
    const result = await raceCancellation(reviewData.completion.p, token);
    if (token.isCancellationRequested) {
      reviewData.dismiss();
      throw new CancellationError();
    }
    return this.toResult(result ?? { rejected: true });
  }
  async prepareToolInvocation(context, _token) {
    const parameters = context.parameters;
    if (!parameters.actions || parameters.actions.length === 0) {
      throw new Error(localize("reviewPlanTool.noActions", "At least one approval action must be provided."));
    }
    return {
      invocationMessage: new MarkdownString(localize("reviewPlanTool.invocation", "Asking you to review the plan")),
      pastTenseMessage: new MarkdownString(localize("reviewPlanTool.invocation.past", "Asked you to review the plan"))
    };
  }
  toResult(result) {
    return {
      content: [{ kind: "text", value: JSON.stringify(result) }]
    };
  }
  getRequest(chatSessionResource, chatRequestId) {
    if (!chatSessionResource) {
      return { request: void 0 };
    }
    const model = this.chatService.getSession(chatSessionResource);
    if (!model) {
      return { request: void 0 };
    }
    let request;
    if (chatRequestId) {
      request = model.getRequests().find((r) => r.id === chatRequestId);
    }
    if (!request) {
      request = model.getRequests().at(-1);
    }
    return { request };
  }
};
ReviewPlanTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ILogService)
], ReviewPlanTool);
export {
  ReviewPlanTool,
  ReviewPlanToolData,
  ReviewPlanToolId,
  createReviewPlanToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9yZXZpZXdQbGFuVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNoYXRQbGFuQXBwcm92YWxBY3Rpb24sIElDaGF0UGxhblJldmlld1Jlc3VsdCwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0TW9kZWwgfSBmcm9tICcuLi8uLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFBsYW5SZXZpZXdEYXRhLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBSZXZpZXdQbGFuVG9vbElkID0gJ3ZzY29kZV9yZXZpZXdQbGFuJztcblxuZXhwb3J0IGludGVyZmFjZSBJUmV2aWV3UGxhblBhcmFtcyB7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwbGFuPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IElDaGF0UGxhbkFwcHJvdmFsQWN0aW9uW107XG5cdHJlYWRvbmx5IGNhblByb3ZpZGVGZWVkYmFjazogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJldmlld1BsYW5Ub29sRGF0YSgpOiBJVG9vbERhdGEge1xuXHRjb25zdCBhcHByb3ZhbEFjdGlvblNjaGVtYTogSUpTT05TY2hlbWEgJiB7IHByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwIH0gPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnU2hvcnQgYWN0aW9uIGxhYmVsIHNob3duIGluIHRoZSBkcm9wZG93biBidXR0b24uJ1xuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIGRldGFpbCBzaG93biBiZWxvdyB0aGUgbGFiZWwgaW4gdGhlIGRyb3Bkb3duIGxpc3QuJ1xuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1doZXRoZXIgdGhpcyBhY3Rpb24gc2hvdWxkIGJlIHNlbGVjdGVkIGJ5IGRlZmF1bHQuJ1xuXHRcdFx0fSxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZW51bTogWydhdXRvcGlsb3QnXSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGVuIHNldCB0byBcImF1dG9waWxvdFwiLCBhIGNvbmZpcm1hdGlvbiBkaWFsb2cgaXMgc2hvd24gYmVmb3JlIHByb2NlZWRpbmcuJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsnbGFiZWwnXVxuXHR9O1xuXG5cdGNvbnN0IGlucHV0U2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgfSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaXRsZSBkaXNwbGF5ZWQgaW4gdGhlIHdpZGdldCBoZWFkZXIuIERlZmF1bHRzIHRvIFwiUGxhbiBzdW1tYXJ5XCIgaWYgb21pdHRlZC4nXG5cdFx0XHR9LFxuXHRcdFx0cGxhbjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBVUkkgb2YgYW4gZWRpdGFibGUgcGxhbiBmaWxlLiBBbiBFZGl0IGJ1dHRvbiBpbiB0aGUgd2lkZ2V0IGhlYWRlciBvcGVucyBpdCBpbiB0aGUgZWRpdG9yLidcblx0XHRcdH0sXG5cdFx0XHRjb250ZW50OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ01hcmtkb3duIGNvbnRlbnQgcmVuZGVyZWQgaW4gdGhlIGJvZHkgb2YgdGhlIHdpZGdldC4gTWF5IGJlIHRoZSBwbGFuIHN1bW1hcnkgb3IgZnVsbCBwbGFuIHRleHQuJ1xuXHRcdFx0fSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdMaXN0IG9mIGFwcHJvdmFsIGFjdGlvbnMgb2ZmZXJlZCBpbiB0aGUgcHJpbWFyeSBkcm9wZG93biBidXR0b24uIE9yZGVyIGlzIHByZXNlcnZlZC4nLFxuXHRcdFx0XHRpdGVtczogYXBwcm92YWxBY3Rpb25TY2hlbWEsXG5cdFx0XHRcdG1pbkl0ZW1zOiAxXG5cdFx0XHR9LFxuXHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGVuIHRydWUsIGFuIGFkZGl0aW9uYWwgZmVlZGJhY2sgdGV4dGFyZWEgaXMgc2hvd24gYmVsb3cgdGhlIHBsYW4gY29udGVudC4nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydjb250ZW50JywgJ2FjdGlvbnMnLCAnY2FuUHJvdmlkZUZlZWRiYWNrJ11cblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBSZXZpZXdQbGFuVG9vbElkLFxuXHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmV2aWV3UGxhbicsXG5cdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5jaGVja2xpc3QuaWQpLFxuXHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC5yZXZpZXdQbGFuLmRpc3BsYXlOYW1lJywgJ1JldmlldyBQbGFuJyksXG5cdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbC5yZXZpZXdQbGFuLnVzZXJEZXNjcmlwdGlvbicsICdBc2sgdGhlIHVzZXIgdG8gcmV2aWV3IGFuZCBhcHByb3ZlIGEgcGxhbiBiZWZvcmUgcHJvY2VlZGluZy4nKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnVXNlIHRoaXMgdG9vbCB0byBwcmVzZW50IGEgcGxhbiB0byB0aGUgdXNlciBmb3IgcmV2aWV3LiBQcm92aWRlIHRoZSBwbGFuIGNvbnRlbnQgYXMgbWFya2Rvd24sIGEgbGlzdCBvZiBhcHByb3ZhbCBhY3Rpb25zICh3aXRoIG9wdGlvbmFsIGRlZmF1bHQpLCBhbmQgd2hldGhlciB0aGUgdXNlciBjYW4gcHJvdmlkZSBmcmVlZm9ybSBmZWVkYmFjay4gT3B0aW9uYWxseSBwcm92aWRlIGEgVVJJIHRvIHRoZSBiYWNraW5nIHBsYW4gZmlsZSBzbyB0aGUgdXNlciBjYW4gZWRpdCBpdC4gVGhlIHRvb2wgcmV0dXJucyB0aGUgY2hvc2VuIGFjdGlvbiwgd2hldGhlciB0aGUgcGxhbiB3YXMgcmVqZWN0ZWQsIGFuZCBhbnkgZmVlZGJhY2suJyxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdGlucHV0U2NoZW1hXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCBSZXZpZXdQbGFuVG9vbERhdGE6IElUb29sRGF0YSA9IGNyZWF0ZVJldmlld1BsYW5Ub29sRGF0YSgpO1xuXG5leHBvcnQgY2xhc3MgUmV2aWV3UGxhblRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElSZXZpZXdQbGFuUGFyYW1zO1xuXHRcdGNvbnN0IHsgdGl0bGUsIHBsYW4sIGNvbnRlbnQsIGFjdGlvbnMsIGNhblByb3ZpZGVGZWVkYmFjayB9ID0gcGFyYW1ldGVycztcblxuXHRcdGlmICghYWN0aW9ucyB8fCBhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdyZXZpZXdQbGFuVG9vbC5ub0FjdGlvbnMnLCAnQXQgbGVhc3Qgb25lIGFwcHJvdmFsIGFjdGlvbiBtdXN0IGJlIHByb3ZpZGVkLicpKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlcXVlc3QgfSA9IHRoaXMuZ2V0UmVxdWVzdChpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSwgaW52b2NhdGlvbi5jaGF0UmVxdWVzdElkKTtcblx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbUmV2aWV3UGxhblRvb2xdIE1pc3NpbmcgY2hhdCBjb250ZXh0OyByZXR1cm5pbmcgcmVqZWN0ZWQgcmVzdWx0LicpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXN1bHQoeyByZWplY3RlZDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRsZXQgcGxhblVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwbGFuKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwbGFuVXJpID0gVVJJLnBhcnNlKHBsYW4pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cGxhblVyaSA9IFVSSS5maWxlKHBsYW4pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRwbGFuVXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV2aWV3RGF0YSA9IG5ldyBDaGF0UGxhblJldmlld0RhdGEoXG5cdFx0XHR0aXRsZSA/PyBsb2NhbGl6ZSgncmV2aWV3UGxhblRvb2wuZGVmYXVsdFRpdGxlJywgJ1BsYW4gc3VtbWFyeScpLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRjYW5Qcm92aWRlRmVlZGJhY2ssXG5cdFx0XHRwbGFuVXJpPy50b0pTT04oKSxcblx0XHRcdGdlbmVyYXRlVXVpZCgpLFxuXHRcdCk7XG5cblx0XHR0aGlzLmNoYXRTZXJ2aWNlLmFwcGVuZFByb2dyZXNzKHJlcXVlc3QsIHJldmlld0RhdGEpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbihyZXZpZXdEYXRhLmNvbXBsZXRpb24ucCwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV2aWV3RGF0YS5kaXNtaXNzKCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3VsdChyZXN1bHQgPz8geyByZWplY3RlZDogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJUmV2aWV3UGxhblBhcmFtcztcblx0XHRpZiAoIXBhcmFtZXRlcnMuYWN0aW9ucyB8fCBwYXJhbWV0ZXJzLmFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ3Jldmlld1BsYW5Ub29sLm5vQWN0aW9ucycsICdBdCBsZWFzdCBvbmUgYXBwcm92YWwgYWN0aW9uIG11c3QgYmUgcHJvdmlkZWQuJykpO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncmV2aWV3UGxhblRvb2wuaW52b2NhdGlvbicsICdBc2tpbmcgeW91IHRvIHJldmlldyB0aGUgcGxhbicpKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncmV2aWV3UGxhblRvb2wuaW52b2NhdGlvbi5wYXN0JywgJ0Fza2VkIHlvdSB0byByZXZpZXcgdGhlIHBsYW4nKSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b1Jlc3VsdChyZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdCk6IElUb29sUmVzdWx0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogSlNPTi5zdHJpbmdpZnkocmVzdWx0KSB9XVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFJlcXVlc3QoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBjaGF0UmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHsgcmVxdWVzdDogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB7IHJlcXVlc3Q6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRsZXQgcmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNoYXRSZXF1ZXN0SWQpIHtcblx0XHRcdHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmQociA9PiByLmlkID09PSBjaGF0UmVxdWVzdElkKTtcblx0XHR9XG5cdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHRyZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHJlcXVlc3QgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXlELG9CQUFvQjtBQUU3RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUE4SSxzQkFBb0M7QUFFM0ssTUFBTSxtQkFBbUI7QUFVekIsU0FBUywyQkFBc0M7QUFDckQsUUFBTSx1QkFBcUU7QUFBQSxJQUMxRSxNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxRQUNoQixNQUFNO0FBQUEsUUFDTixNQUFNLENBQUMsV0FBVztBQUFBLFFBQ2xCLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVSxDQUFDLE9BQU87QUFBQSxFQUNuQjtBQUVBLFFBQU0sY0FBNEQ7QUFBQSxJQUNqRSxNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0ws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
