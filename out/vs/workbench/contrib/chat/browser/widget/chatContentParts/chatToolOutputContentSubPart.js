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
import * as dom from "../../../../../../base/browser/dom.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { CodeBlockPart } from "./codeBlockPart.js";
import { ChatResourceGroupWidget } from "./chatResourceGroupWidget.js";
let ChatToolOutputContentSubPart = class extends Disposable {
  constructor(context, parts, _instantiationService, contextKeyService, _markdownRendererService) {
    super();
    this.context = context;
    this.parts = parts;
    this._instantiationService = _instantiationService;
    this.contextKeyService = contextKeyService;
    this._markdownRendererService = _markdownRendererService;
    this._editorReferences = [];
    this.codeblocks = [];
    this.domNode = this.createOutputContents();
  }
  toMdString(value) {
    if (typeof value === "string") {
      return new MarkdownString("").appendText(value);
    }
    return new MarkdownString(value.value, { isTrusted: value.isTrusted });
  }
  createOutputContents() {
    const container = dom.$("div");
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      if (part.kind === "code") {
        const codeParts = [part];
        while (i + 1 < this.parts.length) {
          const nextPart = this.parts[i + 1];
          if (nextPart.kind !== "code" || nextPart.title) {
            break;
          }
          codeParts.push(nextPart);
          i++;
        }
        this.addCodeBlock(codeParts, container);
        continue;
      }
      const group = [];
      for (let k = i; k < this.parts.length; k++) {
        const part2 = this.parts[k];
        if (part2.kind !== "data") {
          break;
        }
        group.push(part2);
      }
      this.addResourceGroup(group, container);
      i += group.length - 1;
    }
    return container;
  }
  addResourceGroup(parts, container) {
    const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, parts));
    container.appendChild(widget.domNode);
  }
  addCodeBlock(parts, container) {
    const firstPart = parts[0];
    if (firstPart.title) {
      const title = dom.$("div.chat-confirmation-widget-title");
      const renderedTitle = this._register(this._markdownRendererService.render(this.toMdString(firstPart.title)));
      title.appendChild(renderedTitle.element);
      container.appendChild(title);
    }
    const combinedText = parts.map((p) => p.data).join("\n");
    const data = {
      languageId: firstPart.languageId,
      text: combinedText,
      codeBlockIndex: firstPart.codeBlockIndex,
      element: this.context.element,
      parentContextKeyService: this.contextKeyService,
      renderOptions: firstPart.options,
      chatSessionResource: this.context.element.sessionResource
    };
    const key = CodeBlockPart.poolKey(this.context.element.id, firstPart.codeBlockIndex);
    const editorReference = this._register(this.context.editorPool.get(key));
    editorReference.object.render(data, this.context.currentWidth.get());
    container.appendChild(editorReference.object.element);
    this._editorReferences.push(editorReference);
    this.codeblocks.push({
      ownerMarkdownPartId: firstPart.ownerMarkdownPartId,
      codeBlockIndex: firstPart.codeBlockIndex,
      elementId: this.context.element.id,
      uri: editorReference.object.uri,
      codemapperUri: void 0,
      chatSessionResource: this.context.element.sessionResource,
      focus: () => {
      }
    });
  }
  layout(width) {
    this._editorReferences.forEach((r) => r.object.layout(width));
  }
};
ChatToolOutputContentSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMarkdownRendererService)
], ChatToolOutputContentSubPart);
export {
  ChatToolOutputContentSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENvZGVCbG9ja1BhcnQsIElDb2RlQmxvY2tEYXRhIH0gZnJvbSAnLi9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlUmVmZXJlbmNlIH0gZnJvbSAnLi9jaGF0Q29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlSU9QYXJ0LCBJQ2hhdENvbGxhcHNpYmxlSU9Db2RlUGFydCwgSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzb3VyY2VHcm91cFdpZGdldCB9IGZyb20gJy4vY2hhdFJlc291cmNlR3JvdXBXaWRnZXQuanMnO1xuXG4vKipcbiAqIEEgcmV1c2FibGUgY29tcG9uZW50IGZvciByZW5kZXJpbmcgdG9vbCBvdXRwdXQgY29uc2lzdGluZyBvZiBjb2RlIGJsb2NrcyBhbmQvb3IgcmVzb3VyY2VzLlxuICogVGhpcyBpcyB1c2VkIGJ5IGJvdGggQ2hhdENvbGxhcHNpYmxlSW5wdXRPdXRwdXRDb250ZW50UGFydCBhbmQgQ2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlZmVyZW5jZXM6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENvZGVCbG9ja1BhcnQ+W10gPSBbXTtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJ0czogQ2hhdENvbGxhcHNpYmxlSU9QYXJ0W10sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmRvbU5vZGUgPSB0aGlzLmNyZWF0ZU91dHB1dENvbnRlbnRzKCk7XG5cdH1cblxuXHRwcml2YXRlIHRvTWRTdHJpbmcodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IE1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygnJykuYXBwZW5kVGV4dCh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUudmFsdWUsIHsgaXNUcnVzdGVkOiB2YWx1ZS5pc1RydXN0ZWQgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU91dHB1dENvbnRlbnRzKCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnZGl2Jyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLnBhcnRzW2ldO1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2NvZGUnKSB7XG5cdFx0XHRcdC8vIENvbGxlY3QgYWRqYWNlbnQgY29kZSBwYXJ0cyBhbmQgY29tYmluZSB0aGVpciBjb250ZW50c1xuXHRcdFx0XHRjb25zdCBjb2RlUGFydHMgPSBbcGFydF07XG5cdFx0XHRcdHdoaWxlIChpICsgMSA8IHRoaXMucGFydHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dFBhcnQgPSB0aGlzLnBhcnRzW2kgKyAxXTtcblx0XHRcdFx0XHRpZiAobmV4dFBhcnQua2luZCAhPT0gJ2NvZGUnIHx8IG5leHRQYXJ0LnRpdGxlKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29kZVBhcnRzLnB1c2gobmV4dFBhcnQpO1xuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmFkZENvZGVCbG9jayhjb2RlUGFydHMsIGNvbnRhaW5lcik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cDogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgayA9IGk7IGsgPCB0aGlzLnBhcnRzLmxlbmd0aDsgaysrKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLnBhcnRzW2tdO1xuXHRcdFx0XHRpZiAocGFydC5raW5kICE9PSAnZGF0YScpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRncm91cC5wdXNoKHBhcnQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFkZFJlc291cmNlR3JvdXAoZ3JvdXAsIGNvbnRhaW5lcik7XG5cdFx0XHRpICs9IGdyb3VwLmxlbmd0aCAtIDE7IC8vIFNraXAgdGhlIHBhcnRzIHdlIGp1c3QgYWRkZWRcblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRSZXNvdXJjZUdyb3VwKHBhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdLCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlc291cmNlR3JvdXBXaWRnZXQsIHBhcnRzKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ29kZUJsb2NrKHBhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9Db2RlUGFydFtdLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZmlyc3RQYXJ0ID0gcGFydHNbMF07XG5cdFx0aWYgKGZpcnN0UGFydC50aXRsZSkge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBkb20uJCgnZGl2LmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZScpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcih0aGlzLnRvTWRTdHJpbmcoZmlyc3RQYXJ0LnRpdGxlKSkpO1xuXHRcdFx0dGl0bGUuYXBwZW5kQ2hpbGQocmVuZGVyZWRUaXRsZS5lbGVtZW50KTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aXRsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tYmluZSB0ZXh0IGZyb20gYWxsIGFkamFjZW50IGNvZGUgcGFydHNcblx0XHRjb25zdCBjb21iaW5lZFRleHQgPSBwYXJ0cy5tYXAocCA9PiBwLmRhdGEpLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZGF0YTogSUNvZGVCbG9ja0RhdGEgPSB7XG5cdFx0XHRsYW5ndWFnZUlkOiBmaXJzdFBhcnQubGFuZ3VhZ2VJZCxcblx0XHRcdHRleHQ6IGNvbWJpbmVkVGV4dCxcblx0XHRcdGNvZGVCbG9ja0luZGV4OiBmaXJzdFBhcnQuY29kZUJsb2NrSW5kZXgsXG5cdFx0XHRlbGVtZW50OiB0aGlzLmNvbnRleHQuZWxlbWVudCxcblx0XHRcdHBhcmVudENvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVuZGVyT3B0aW9uczogZmlyc3RQYXJ0Lm9wdGlvbnMsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0fTtcblx0XHRjb25zdCBrZXkgPSBDb2RlQmxvY2tQYXJ0LnBvb2xLZXkodGhpcy5jb250ZXh0LmVsZW1lbnQuaWQsIGZpcnN0UGFydC5jb2RlQmxvY2tJbmRleCk7XG5cdFx0Y29uc3QgZWRpdG9yUmVmZXJlbmNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0LmVkaXRvclBvb2wuZ2V0KGtleSkpO1xuXHRcdGVkaXRvclJlZmVyZW5jZS5vYmplY3QucmVuZGVyKGRhdGEsIHRoaXMuY29udGV4dC5jdXJyZW50V2lkdGguZ2V0KCkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlZGl0b3JSZWZlcmVuY2Uub2JqZWN0LmVsZW1lbnQpO1xuXHRcdHRoaXMuX2VkaXRvclJlZmVyZW5jZXMucHVzaChlZGl0b3JSZWZlcmVuY2UpO1xuXG5cdFx0Ly8gVHJhY2sgdGhlIGNvZGVibG9ja1xuXHRcdHRoaXMuY29kZWJsb2Nrcy5wdXNoKHtcblx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IGZpcnN0UGFydC5vd25lck1hcmtkb3duUGFydElkLFxuXHRcdFx0Y29kZUJsb2NrSW5kZXg6IGZpcnN0UGFydC5jb2RlQmxvY2tJbmRleCxcblx0XHRcdGVsZW1lbnRJZDogdGhpcy5jb250ZXh0LmVsZW1lbnQuaWQsXG5cdFx0XHR1cmk6IGVkaXRvclJlZmVyZW5jZS5vYmplY3QudXJpLFxuXHRcdFx0Y29kZW1hcHBlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Zm9jdXM6ICgpID0+IHsgfVxuXHRcdH0pO1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JSZWZlcmVuY2VzLmZvckVhY2gociA9PiByLm9iamVjdC5sYXlvdXQod2lkdGgpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMscUJBQXFDO0FBSTlDLFNBQVMsK0JBQStCO0FBTWpDLElBQU0sK0JBQU4sY0FBMkMsV0FBVztBQUFBLEVBSzVELFlBQ2tCLFNBQ0EsT0FDdUIsdUJBQ0gsbUJBQ00sMEJBQzFDO0FBQ0QsVUFBTTtBQU5XO0FBQ0E7QUFDdUI7QUFDSDtBQUNNO0FBVDVDLFNBQWlCLG9CQUEyRCxDQUFDO0FBRTdFLFNBQVMsYUFBbUMsQ0FBQztBQVU1QyxTQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxFQUMxQztBQUFBLEVBRVEsV0FBVyxPQUFpRDtBQUNuRSxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGFBQU8sSUFBSSxlQUFlLEVBQUUsRUFBRSxXQUFXLEtB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
