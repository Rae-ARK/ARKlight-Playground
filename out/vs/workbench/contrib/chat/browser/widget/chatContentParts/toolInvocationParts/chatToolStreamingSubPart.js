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
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IChatToolInvocation } from "../../../../common/chatService/chatService.js";
import { ChatProgressContentPart } from "../chatProgressContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
let ChatToolStreamingSubPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, context, renderer, instantiationService) {
    super(toolInvocation);
    this.context = context;
    this.renderer = renderer;
    this.instantiationService = instantiationService;
    this.codeblocks = [];
    this.domNode = this.createStreamingPart();
  }
  createStreamingPart() {
    const container = document.createElement("div");
    if (this.toolInvocation.kind !== "toolInvocation") {
      return container;
    }
    const toolInvocation = this.toolInvocation;
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.Streaming) {
      return container;
    }
    this._register(autorun((reader) => {
      const currentState = toolInvocation.state.read(reader);
      if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
        dom.clearNode(container);
        this._onNeedsRerender.fire();
        return;
      }
      const streamingMessage = currentState.streamingMessage.read(reader);
      const displayMessage = streamingMessage ?? toolInvocation.invocationMessage;
      const messageText = typeof displayMessage === "string" ? displayMessage : displayMessage.value;
      if (!messageText || messageText.trim().length === 0) {
        dom.clearNode(container);
        return;
      }
      const content = typeof displayMessage === "string" ? new MarkdownString().appendText(displayMessage) : displayMessage;
      const progressMessage = {
        kind: "progressMessage",
        content
      };
      const part = reader.store.add(this.instantiationService.createInstance(
        ChatProgressContentPart,
        progressMessage,
        this.renderer,
        this.context,
        void 0,
        true,
        this.getIcon(),
        toolInvocation,
        false
      ));
      dom.reset(container, part.domNode);
    }));
    return container;
  }
};
ChatToolStreamingSubPart = __decorateClass([
  __decorateParam(3, IInstantiationService)
], ChatToolStreamingSubPart);
export {
  ChatToolStreamingSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sU3RyZWFtaW5nU3ViUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3NNZXNzYWdlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUJsb2NrSW5mbyB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2hhdFByb2dyZXNzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuXG4vKipcbiAqIFN1Yi1wYXJ0IGZvciByZW5kZXJpbmcgYSB0b29sIGludm9jYXRpb24gaW4gdGhlIHN0cmVhbWluZyBzdGF0ZS5cbiAqIFRoaXMgc2hvd3MgcHJvZ3Jlc3Mgd2hpbGUgdGhlIHRvb2wgYXJndW1lbnRzIGFyZSBiZWluZyBzdHJlYW1lZCBmcm9tIHRoZSBMTS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRUb29sU3RyZWFtaW5nU3ViUGFydCBleHRlbmRzIEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuY3JlYXRlU3RyZWFtaW5nUGFydCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTdHJlYW1pbmdQYXJ0KCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb24gPSB0aGlzLnRvb2xJbnZvY2F0aW9uO1xuXHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHR9XG5cblx0XHQvLyBPYnNlcnZlIHN0cmVhbWluZyBtZXNzYWdlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHQvLyBTdGF0ZSBjaGFuZ2VkIC0gY2xlYXIgdGhlIGNvbnRhaW5lciBET00gYmVmb3JlIHRyaWdnZXJpbmcgcmUtcmVuZGVyXG5cdFx0XHRcdC8vIFRoaXMgcHJldmVudHMgdGhlIG9sZCBzdHJlYW1pbmcgbWVzc2FnZSBmcm9tIGxpbmdlcmluZ1xuXHRcdFx0XHRkb20uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMuX29uTmVlZHNSZXJlbmRlci5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVhZCB0aGUgc3RyZWFtaW5nIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IHN0cmVhbWluZ01lc3NhZ2UgPSBjdXJyZW50U3RhdGUuc3RyZWFtaW5nTWVzc2FnZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkaXNwbGF5TWVzc2FnZSA9IHN0cmVhbWluZ01lc3NhZ2UgPz8gdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cblx0XHRcdC8vIERvbid0IHJlbmRlciBhbnl0aGluZyBpZiB0aGVyZSdzIG5vIG1lYW5pbmdmdWwgY29udGVudFxuXHRcdFx0Y29uc3QgbWVzc2FnZVRleHQgPSB0eXBlb2YgZGlzcGxheU1lc3NhZ2UgPT09ICdzdHJpbmcnID8gZGlzcGxheU1lc3NhZ2UgOiBkaXNwbGF5TWVzc2FnZS52YWx1ZTtcblx0XHRcdGlmICghbWVzc2FnZVRleHQgfHwgbWVzc2FnZVRleHQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRkb20uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudDogSU1hcmtkb3duU3RyaW5nID0gdHlwZW9mIGRpc3BsYXlNZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoZGlzcGxheU1lc3NhZ2UpXG5cdFx0XHRcdDogZGlzcGxheU1lc3NhZ2U7XG5cblx0XHRcdGNvbnN0IHByb2dyZXNzTWVzc2FnZTogSUNoYXRQcm9ncmVzc01lc3NhZ2UgPSB7XG5cdFx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0XHRjb250ZW50XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVhZGVyLnN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0UHJvZ3Jlc3NDb250ZW50UGFydCxcblx0XHRcdFx0cHJvZ3Jlc3NNZXNzYWdlLFxuXHRcdFx0XHR0aGlzLnJlbmRlcmVyLFxuXHRcdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dGhpcy5nZXRJY29uKCksXG5cdFx0XHRcdHRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSk7XG5cblx0XHRcdGRvbS5yZXNldChjb250YWluZXIsIHBhcnQuZG9tTm9kZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUErQiwyQkFBMkI7QUFHMUQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFNdkMsSUFBTSwyQkFBTixjQUF1Qyw4QkFBOEI7QUFBQSxFQUszRSxZQUNDLGdCQUNpQixTQUNBLFVBQ3VCLHNCQUN2QztBQUNELFVBQU0sY0FBYztBQUpIO0FBQ0E7QUFDdUI7QUFOekMsU0FBeUIsYUFBbUMsQ0FBQztBQVU1RCxTQUFLLFVBQVUsS0FBSyxvQkFBb0I7QUFBQSxFQUN6QztBQUFBLEVBRVEsc0JBQW1DO0FBQzFDLFVBQU0sWUFBWSxTQUFTLGNBQWMsS0FBSztBQUU5QyxRQUFJLEtBQUssZUFBZSxTQUFTLGtCQUFrQjtBQUNsRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsVUFBTSxRQUFRLGVBQWUsTUFBTSxJQUFJO0FBQ3ZDLFFBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLFdBQVc7QUFDM0QsYUFBTztBQUFBLElBQ1I7QUFHQSxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sZUFBZSxlQUFlLE1BQU0sS0FBSyxNQUFNO0FBQ3JELFVBQUksYUFBYSxTQUFTLG9CQUFvQixVQUFVLFdBQVc7QUFHbEUsWUFBSSxVQUFVLFNBQVM7QUFDdkIsYUFBSyxpQkFBaUIsS0FBSztBQUMzQjtBQUFBLE1BQ0Q7QUFHQSxZQUFNLG1CQUFtQixhQUFhLGlCQUFpQixLQUFLLE1BQU07QUFDbEUsWUFBTSxpQkFBaUIsb0JBQW9CLGVBQWU7QUFHMUQsWUFBTSxjQUFjLE9BQU8sbUJBQW1CLFdBQVcsaUJBQWlCLGVBQWU7QUFDekYsVUFBSSxDQUFDLGVBQWUsWUFBWSxLQUFLLEVBQUUsV0FBVyxHQUFHO0FBQ3BELFlBQUksVUFBVSxTQUFTO0FBQ3ZCO0FBQUEsTUFDRDtBQUVBLFlBQU0sVUFBMkIsT0FBTyxtQkFBbUIsV0FDeEQsSUFBSSxlQUFlLEVBQUUsV0FBVyxjQUFjLElBQzlDO0FBRUgsWUFBTSxrQkFBd0M7QUFBQSxRQUM3QyxNQUFNO0FBQUEsUUFDTjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQU8sT0FBTyxNQUFNLElBQUksS0FBSyxxQkFBcUI7QUFBQSxRQUN2RDtBQUFBLFFBQ0E7QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxRQUFRO0FBQUEsUUFDYjtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLE1BQU0sV0FBVyxLQUFLLE9BQU87QUFBQSxJQUNsQyxDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBN0VhLDJCQUFOO0FBQUEsRUFTSjtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
