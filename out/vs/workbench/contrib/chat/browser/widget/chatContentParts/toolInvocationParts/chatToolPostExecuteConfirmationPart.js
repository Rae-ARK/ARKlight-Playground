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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Separator } from "../../../../../../../base/common/actions.js";
import { getExtensionForMimeType } from "../../../../../../../base/common/mime.js";
import { localize } from "../../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ChatResponseResource } from "../../../../common/model/chatModel.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsConfirmationService } from "../../../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService, stringifyPromptTsxPart } from "../../../../common/tools/languageModelToolsService.js";
import { AcceptToolPostConfirmationActionId, SkipToolPostConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatToolOutputContentSubPart } from "../chatToolOutputContentSubPart.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
let ChatToolPostExecuteConfirmationPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, confirmationService, riskAssessmentService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.confirmationService = confirmationService;
    this._codeblocks = [];
    const subtitle = toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
    this.render({
      allowActionId: AcceptToolPostConfirmationActionId,
      skipActionId: SkipToolPostConfirmationActionId,
      allowLabel: localize("allow", "Allow Once"),
      skipLabel: localize("skip.post", "Skip Results"),
      partType: "chatToolPostConfirmation",
      subtitle: typeof subtitle === "string" ? subtitle : subtitle?.value
    });
  }
  get codeblocks() {
    return this._codeblocks;
  }
  createContentElement() {
    if (this.toolInvocation.kind !== "toolInvocation") {
      throw new Error("post-approval not supported for serialized data");
    }
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      throw new Error("Tool invocation is not waiting for post-approval");
    }
    return this.createResultsDisplay(this.toolInvocation, state.contentForModel);
  }
  getTitle() {
    return localize("approveToolResult", "Approve Tool Result");
  }
  additionalPrimaryActions() {
    const actions = super.additionalPrimaryActions();
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      return actions;
    }
    const confirmActions = this.confirmationService.getPostConfirmActions({
      toolId: this.toolInvocation.toolId,
      source: this.toolInvocation.source,
      parameters: state.parameters
    });
    for (const action of confirmActions) {
      if (action.divider) {
        actions.push(new Separator());
      }
      actions.push({
        label: action.label,
        tooltip: action.detail,
        scope: action.scope,
        data: async () => {
          const shouldConfirm = await action.select();
          if (shouldConfirm) {
            this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
          }
        }
      });
    }
    return actions;
  }
  createResultsDisplay(toolInvocation, contentForModel) {
    const container = dom.$(".tool-postconfirm-display");
    if (!contentForModel || contentForModel.length === 0) {
      container.textContent = localize("noResults", "No results to display");
      return container;
    }
    const parts = [];
    for (const [i, part] of contentForModel.entries()) {
      if (part.kind === "text") {
        parts.push({
          kind: "code",
          title: part.title,
          data: part.value,
          languageId: "plaintext",
          codeBlockIndex: i,
          ownerMarkdownPartId: this.codeblocksPartId,
          options: {
            hideToolbar: true,
            reserveWidth: 19,
            maxHeightInLines: 13,
            verticalPadding: 5,
            editorOptions: { wordWrap: "on", readOnly: true }
          }
        });
      } else if (part.kind === "promptTsx") {
        const stringified = stringifyPromptTsxPart(part);
        parts.push({
          kind: "code",
          data: stringified,
          languageId: "json",
          codeBlockIndex: i,
          ownerMarkdownPartId: this.codeblocksPartId,
          options: {
            hideToolbar: true,
            reserveWidth: 19,
            maxHeightInLines: 13,
            verticalPadding: 5,
            editorOptions: { wordWrap: "on", readOnly: true }
          }
        });
      } else if (part.kind === "data") {
        const mimeType = part.value.mimeType;
        const data = part.value.data;
        if (mimeType?.startsWith("image/")) {
          const permalinkBasename = getExtensionForMimeType(mimeType) ? `image${getExtensionForMimeType(mimeType)}` : "image.bin";
          const permalinkUri = ChatResponseResource.createUri(this.context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
          parts.push({ kind: "data", value: data.buffer, mimeType, uri: permalinkUri, audience: part.audience });
        } else {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          try {
            const text = decoder.decode(data.buffer);
            parts.push({
              kind: "code",
              data: text,
              languageId: "plaintext",
              codeBlockIndex: i,
              ownerMarkdownPartId: this.codeblocksPartId,
              options: {
                hideToolbar: true,
                reserveWidth: 19,
                maxHeightInLines: 13,
                verticalPadding: 5,
                editorOptions: { wordWrap: "on", readOnly: true }
              }
            });
          } catch {
            const base64 = data.toString();
            parts.push({
              kind: "code",
              data: base64,
              languageId: "plaintext",
              codeBlockIndex: i,
              ownerMarkdownPartId: this.codeblocksPartId,
              options: {
                hideToolbar: true,
                reserveWidth: 19,
                maxHeightInLines: 13,
                verticalPadding: 5,
                editorOptions: { wordWrap: "on", readOnly: true }
              }
            });
          }
        }
      }
    }
    if (parts.length > 0) {
      const outputSubPart = this._register(this.instantiationService.createInstance(
        ChatToolOutputContentSubPart,
        this.context,
        parts
      ));
      this._codeblocks.push(...outputSubPart.codeblocks);
      outputSubPart.domNode.classList.add("tool-postconfirm-display");
      return outputSubPart.domNode;
    }
    container.textContent = localize("noDisplayableResults", "No displayable results");
    return container;
  }
};
ChatToolPostExecuteConfirmationPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, ILanguageModelToolsConfirmationService),
  __decorateParam(8, IChatToolRiskAssessmentService)
], ChatToolPostExecuteConfirmationPart);
export {
  ChatToolPostExecuteConfirmationPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbFJlc3VsdERhdGFQYXJ0LCBJVG9vbFJlc3VsdFByb21wdFRzeFBhcnQsIElUb29sUmVzdWx0VGV4dFBhcnQsIHN0cmluZ2lmeVByb21wdFRzeFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2NlcHRUb29sUG9zdENvbmZpcm1hdGlvbkFjdGlvbklkLCBTa2lwVG9vbFBvc3RDb25maXJtYXRpb25BY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrSW5mbywgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90b29scy9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlSU9QYXJ0IH0gZnJvbSAnLi4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQgfSBmcm9tICcuLi9jaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2Fic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQgZXh0ZW5kcyBBYnN0cmFjdFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IHtcblx0cHJpdmF0ZSBfY29kZWJsb2NrczogSUNoYXRDb2RlQmxvY2tJbmZvW10gPSBbXTtcblx0cHVibGljIGdldCBjb2RlYmxvY2tzKCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29kZWJsb2Nrcztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlybWF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSByaXNrQXNzZXNzbWVudFNlcnZpY2U6IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodG9vbEludm9jYXRpb24sIGNvbnRleHQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCByaXNrQXNzZXNzbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IHN1YnRpdGxlID0gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSB8fCB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0XHR0aGlzLnJlbmRlcih7XG5cdFx0XHRhbGxvd0FjdGlvbklkOiBBY2NlcHRUb29sUG9zdENvbmZpcm1hdGlvbkFjdGlvbklkLFxuXHRcdFx0c2tpcEFjdGlvbklkOiBTa2lwVG9vbFBvc3RDb25maXJtYXRpb25BY3Rpb25JZCxcblx0XHRcdGFsbG93TGFiZWw6IGxvY2FsaXplKCdhbGxvdycsIFwiQWxsb3cgT25jZVwiKSxcblx0XHRcdHNraXBMYWJlbDogbG9jYWxpemUoJ3NraXAucG9zdCcsICdTa2lwIFJlc3VsdHMnKSxcblx0XHRcdHBhcnRUeXBlOiAnY2hhdFRvb2xQb3N0Q29uZmlybWF0aW9uJyxcblx0XHRcdHN1YnRpdGxlOiB0eXBlb2Ygc3VidGl0bGUgPT09ICdzdHJpbmcnID8gc3VidGl0bGUgOiBzdWJ0aXRsZT8udmFsdWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29udGVudEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigncG9zdC1hcHByb3ZhbCBub3Qgc3VwcG9ydGVkIGZvciBzZXJpYWxpemVkIGRhdGEnKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgaW52b2NhdGlvbiBpcyBub3Qgd2FpdGluZyBmb3IgcG9zdC1hcHByb3ZhbCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZVJlc3VsdHNEaXNwbGF5KHRoaXMudG9vbEludm9jYXRpb24sIHN0YXRlLmNvbnRlbnRGb3JNb2RlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FwcHJvdmVUb29sUmVzdWx0JywgXCJBcHByb3ZlIFRvb2wgUmVzdWx0XCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFkZGl0aW9uYWxQcmltYXJ5QWN0aW9ucygpIHtcblx0XHRjb25zdCBhY3Rpb25zID0gc3VwZXIuYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zKCk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwpIHtcblx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdH1cblxuXHRcdC8vIEdldCBhY3Rpb25zIGZyb20gY29uZmlybWF0aW9uIHNlcnZpY2Vcblx0XHRjb25zdCBjb25maXJtQWN0aW9ucyA9IHRoaXMuY29uZmlybWF0aW9uU2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMoe1xuXHRcdFx0dG9vbElkOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xJZCxcblx0XHRcdHNvdXJjZTogdGhpcy50b29sSW52b2NhdGlvbi5zb3VyY2UsXG5cdFx0XHRwYXJhbWV0ZXJzOiBzdGF0ZS5wYXJhbWV0ZXJzXG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBjb25maXJtQWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbi5kaXZpZGVyKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0dG9vbHRpcDogYWN0aW9uLmRldGFpbCxcblx0XHRcdFx0c2NvcGU6IGFjdGlvbi5zY29wZSxcblx0XHRcdFx0ZGF0YTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNob3VsZENvbmZpcm0gPSBhd2FpdCBhY3Rpb24uc2VsZWN0KCk7XG5cdFx0XHRcdFx0aWYgKHNob3VsZENvbmZpcm0pIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlybVdpdGgodGhpcy50b29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZXN1bHRzRGlzcGxheSh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiwgY29udGVudEZvck1vZGVsOiAoSVRvb2xSZXN1bHRQcm9tcHRUc3hQYXJ0IHwgSVRvb2xSZXN1bHRUZXh0UGFydCB8IElUb29sUmVzdWx0RGF0YVBhcnQpW10pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy50b29sLXBvc3Rjb25maXJtLWRpc3BsYXknKTtcblxuXHRcdGlmICghY29udGVudEZvck1vZGVsIHx8IGNvbnRlbnRGb3JNb2RlbC5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnRhaW5lci50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub1Jlc3VsdHMnLCAnTm8gcmVzdWx0cyB0byBkaXNwbGF5Jyk7XG5cdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRzOiBDaGF0Q29sbGFwc2libGVJT1BhcnRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBbaSwgcGFydF0gb2YgY29udGVudEZvck1vZGVsLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdC8vIERpc3BsYXkgdGV4dCBwYXJ0c1xuXHRcdFx0XHRwYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnY29kZScsXG5cdFx0XHRcdFx0dGl0bGU6IHBhcnQudGl0bGUsXG5cdFx0XHRcdFx0ZGF0YTogcGFydC52YWx1ZSxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogaSxcblx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0aGlkZVRvb2xiYXI6IHRydWUsXG5cdFx0XHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHRcdFx0bWF4SGVpZ2h0SW5MaW5lczogMTMsXG5cdFx0XHRcdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7IHdvcmRXcmFwOiAnb24nLCByZWFkT25seTogdHJ1ZSB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAncHJvbXB0VHN4Jykge1xuXHRcdFx0XHQvLyBEaXNwbGF5IFRTWCBwYXJ0cyBhcyBKU09OLXN0cmluZ2lmaWVkXG5cdFx0XHRcdGNvbnN0IHN0cmluZ2lmaWVkID0gc3RyaW5naWZ5UHJvbXB0VHN4UGFydChwYXJ0KTtcblxuXHRcdFx0XHRwYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnY29kZScsXG5cdFx0XHRcdFx0ZGF0YTogc3RyaW5naWZpZWQsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2pzb24nLFxuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBpLFxuXHRcdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IHRoaXMuY29kZWJsb2Nrc1BhcnRJZCxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHRcdFx0XHRtYXhIZWlnaHRJbkxpbmVzOiAxMyxcblx0XHRcdFx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IHsgd29yZFdyYXA6ICdvbicsIHJlYWRPbmx5OiB0cnVlIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0XHQvLyBEaXNwbGF5IGRhdGEgcGFydHNcblx0XHRcdFx0Y29uc3QgbWltZVR5cGUgPSBwYXJ0LnZhbHVlLm1pbWVUeXBlO1xuXHRcdFx0XHRjb25zdCBkYXRhID0gcGFydC52YWx1ZS5kYXRhO1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIGl0J3MgYW4gaW1hZ2Vcblx0XHRcdFx0aWYgKG1pbWVUeXBlPy5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBlcm1hbGlua0Jhc2VuYW1lID0gZ2V0RXh0ZW5zaW9uRm9yTWltZVR5cGUobWltZVR5cGUpID8gYGltYWdlJHtnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShtaW1lVHlwZSl9YCA6ICdpbWFnZS5iaW4nO1xuXHRcdFx0XHRcdGNvbnN0IHBlcm1hbGlua1VyaSA9IENoYXRSZXNwb25zZVJlc291cmNlLmNyZWF0ZVVyaSh0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQsIGksIHBlcm1hbGlua0Jhc2VuYW1lKTtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ2RhdGEnLCB2YWx1ZTogZGF0YS5idWZmZXIsIG1pbWVUeXBlLCB1cmk6IHBlcm1hbGlua1VyaSwgYXVkaWVuY2U6IHBhcnQuYXVkaWVuY2UgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVHJ5IHRvIGRpc3BsYXkgYXMgVVRGLTggdGV4dCwgb3RoZXJ3aXNlIGJhc2U2NFxuXHRcdFx0XHRcdGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoJ3V0Zi04JywgeyBmYXRhbDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGV4dCA9IGRlY29kZXIuZGVjb2RlKGRhdGEuYnVmZmVyKTtcblxuXHRcdFx0XHRcdFx0cGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0XHRcdFx0ZGF0YTogdGV4dCxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBpLFxuXHRcdFx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHRcdFx0XHRcdG1heEhlaWdodEluTGluZXM6IDEzLFxuXHRcdFx0XHRcdFx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7IHdvcmRXcmFwOiAnb24nLCByZWFkT25seTogdHJ1ZSB9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gTm90IHZhbGlkIFVURi04LCBzaG93IGJhc2U2NFxuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZTY0ID0gZGF0YS50b1N0cmluZygpO1xuXG5cdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2NvZGUnLFxuXHRcdFx0XHRcdFx0XHRkYXRhOiBiYXNlNjQsXG5cdFx0XHRcdFx0XHRcdGxhbmd1YWdlSWQ6ICdwbGFpbnRleHQnLFxuXHRcdFx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogaSxcblx0XHRcdFx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogdGhpcy5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0aGlkZVRvb2xiYXI6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdFx0XHRcdFx0XHRtYXhIZWlnaHRJbkxpbmVzOiAxMyxcblx0XHRcdFx0XHRcdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDUsXG5cdFx0XHRcdFx0XHRcdFx0ZWRpdG9yT3B0aW9uczogeyB3b3JkV3JhcDogJ29uJywgcmVhZE9ubHk6IHRydWUgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0U3ViUGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQsXG5cdFx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdFx0cGFydHMsXG5cdFx0XHQpKTtcblxuXHRcdFx0dGhpcy5fY29kZWJsb2Nrcy5wdXNoKC4uLm91dHB1dFN1YlBhcnQuY29kZWJsb2Nrcyk7XG5cdFx0XHRvdXRwdXRTdWJQYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgndG9vbC1wb3N0Y29uZmlybS1kaXNwbGF5Jyk7XG5cdFx0XHRyZXR1cm4gb3V0cHV0U3ViUGFydC5kb21Ob2RlO1xuXHRcdH1cblxuXHRcdGNvbnRhaW5lci50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0Rpc3BsYXlhYmxlUmVzdWx0cycsICdObyBkaXNwbGF5YWJsZSByZXN1bHRzJyk7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3JELFNBQVMsOENBQThD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QUN0RyxPQUFPO0FBRU4sZ0JBQU0sVUFBVSxJQUFJLFlBQVksU0FBUyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQ3hELGNBQUk7QUFDSCxrQkFBTSxPQUFPLFFBQVEsT0FBTyxLQUFLLE1BQU07QUFFdkMsa0JBQU0sS0FBSztBQUFBLGNBQ1YsTUFBTTtBQUFBLGNBQ04sTUFBTTtBQUFBLGNBQ04sWUFBWTtBQUFBLGNBQ1osZ0JBQWdCO0FBQUEsY0FDaEIscUJBQXFCLEtBQUs7QUFBQSxjQUMxQixTQUFTO0FBQUEsZ0JBQ1IsYUFBYTtBQUFBLGdCQUNiLGNBQWM7QUFBQSxnQkFDZCxrQkFBa0I7QUFBQSxnQkFDbEIsaUJBQWlCO0FBQUEsZ0JBQ2pCLGVBQWUsRUFBRSxVQUFVLE1BQU0sVUFBVSxLQUFLO0FBQUEsY0FDakQ7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGLFFBQVE7QUFFUCxrQkFBTSxTQUFTLEtBQUssU0FBUztBQUU3QixrQkFBTSxLQUFLO0FBQUEsY0FDVixNQUFNO0FBQUEsY0FDTixNQUFNO0FBQUEsY0FDTixZQUFZO0FBQUEsY0FDWixnQkFBZ0I7QUFBQSxjQUNoQixxQkFBcUIsS0FBSztBQUFBLGNBQzFCLFNBQVM7QUFBQSxnQkFDUixhQUFhO0FBQUEsZ0JBQ2IsY0FBYztBQUFBLGdCQUNkLGtCQUFrQjtBQUFBLGdCQUNsQixpQkFBaUI7QUFBQSxnQkFDakIsZUFBZSxFQUFFLFVBQVUsTUFBTSxVQUFVLEtBQUs7QUFBQSxjQUNqRDtBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3JCLFlBQU0sZ0JBQWdCLEtBQUssVUFBVSxLQUFLLHFCQUFxQjtBQUFBLFFBQzlEO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssWUFBWSxLQUFLLEdBQUcsY0FBYyxVQUFVO0FBQ2pELG9CQUFjLFFBQVEsVUFBVSxJQUFJLDBCQUEwQjtBQUM5RCxhQUFPLGNBQWM7QUFBQSxJQUN0QjtBQUVBLGNBQVUsY0FBYyxTQUFTLHdCQUF3Qix3QkFBd0I7QUFDakYsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWxNYSxzQ0FBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWZVOyIsCiAgIm5hbWVzIjogW10KfQo=
