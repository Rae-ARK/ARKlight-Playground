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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, RefCountedDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TextEdit } from "../../../../../../editor/common/languages.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { DefaultModelSHA1Computer } from "../../../../../../editor/common/services/modelService.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../../nls.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
const $ = dom.$;
const ICodeCompareModelService = createDecorator("ICodeCompareModelService");
let ChatTextEditContentPart = class extends Disposable {
  constructor(chatTextEdit, context, rendererOptions, diffEditorPool, currentWidth, codeCompareModelService) {
    super();
    this.codeCompareModelService = codeCompareModelService;
    const element = context.element;
    assertType(isResponseVM(element));
    if (rendererOptions.renderTextEditsAsSummary?.(chatTextEdit.uri)) {
      if (element.response.value.every((item) => item.kind === "textEditGroup")) {
        this.domNode = $(".interactive-edits-summary", void 0, !element.isComplete ? "" : element.isCanceled ? localize("edits0", "Making changes was aborted.") : localize("editsSummary", "Made changes."));
      } else {
        this.domNode = $("div");
      }
    } else {
      const cts = new CancellationTokenSource();
      let isDisposed = false;
      this._register(toDisposable(() => {
        isDisposed = true;
        cts.dispose(true);
      }));
      this.comparePart = this._register(diffEditorPool.get());
      const data = {
        element,
        edit: chatTextEdit,
        diffData: (async () => {
          const ref = await this.codeCompareModelService.createModel(element, chatTextEdit);
          if (isDisposed) {
            ref.dispose();
            return;
          }
          this._register(ref);
          return {
            modified: ref.object.modified.textEditorModel,
            original: ref.object.original.textEditorModel,
            originalSha1: ref.object.originalSha1
          };
        })()
      };
      this.comparePart.object.render(data, currentWidth, cts.token);
      this.domNode = this.comparePart.object.element;
    }
  }
  layout(width) {
    this.comparePart?.object.layout(width);
  }
  hasSameContent(other) {
    return other.kind === "textEditGroup";
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatTextEditContentPart = __decorateClass([
  __decorateParam(5, ICodeCompareModelService)
], ChatTextEditContentPart);
let CodeCompareModelService = class {
  constructor(textModelService, modelService, chatService) {
    this.textModelService = textModelService;
    this.modelService = modelService;
    this.chatService = chatService;
  }
  async createModel(element, chatTextEdit) {
    const original = await this.textModelService.createModelReference(chatTextEdit.uri);
    const modified = await this.textModelService.createModelReference(this.modelService.createModel(
      createTextBufferFactoryFromSnapshot(original.object.textEditorModel.createSnapshot()),
      { languageId: original.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
      URI.from({ scheme: Schemas.vscodeChatCodeBlock, path: chatTextEdit.uri.path, query: generateUuid() }),
      false
    ).uri);
    const d = new RefCountedDisposable(toDisposable(() => {
      original.dispose();
      modified.dispose();
    }));
    let originalSha1 = "";
    if (chatTextEdit.state) {
      originalSha1 = chatTextEdit.state.sha1;
    } else {
      const sha1 = new DefaultModelSHA1Computer();
      if (sha1.canComputeSHA1(original.object.textEditorModel)) {
        originalSha1 = sha1.computeSHA1(original.object.textEditorModel);
        chatTextEdit.state = { sha1: originalSha1, applied: 0 };
      }
    }
    const chatModel = this.chatService.getSession(element.sessionResource);
    const editGroups = [];
    for (const request of chatModel.getRequests()) {
      if (!request.response) {
        continue;
      }
      for (const item of request.response.response.value) {
        if (item.kind !== "textEditGroup" || item.state?.applied || !isEqual(item.uri, chatTextEdit.uri)) {
          continue;
        }
        for (const group of item.edits) {
          const edits = group.map(TextEdit.asEditOperation);
          editGroups.push(edits);
        }
      }
      if (request.response === element.model) {
        break;
      }
    }
    for (const edits of editGroups) {
      modified.object.textEditorModel.pushEditOperations(null, edits, () => null);
    }
    d.acquire();
    setTimeout(() => d.release(), 5e3);
    return {
      object: {
        originalSha1,
        original: original.object,
        modified: modified.object
      },
      dispose() {
        d.release();
      }
    };
  }
};
CodeCompareModelService = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, IModelService),
  __decorateParam(2, IChatService)
], CodeCompareModelService);
registerSingleton(ICodeCompareModelService, CodeCompareModelService, InstantiationType.Delayed);
export {
  ChatTextEditContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGV4dEVkaXRDb250ZW50UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIFJlZkNvdW50ZWREaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRGVmYXVsdE1vZGVsU0hBMUNvbXB1dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCwgSUNoYXRUZXh0RWRpdEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ29kZUNvbXBhcmVCbG9ja1BhcnQsIElDb2RlQ29tcGFyZUJsb2NrRGF0YSwgSUNvZGVDb21wYXJlQmxvY2tEaWZmRGF0YSB9IGZyb20gJy4vY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4vY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgSUNvZGVDb21wYXJlTW9kZWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDb2RlQ29tcGFyZU1vZGVsU2VydmljZT4oJ0lDb2RlQ29tcGFyZU1vZGVsU2VydmljZScpO1xuXG5pbnRlcmZhY2UgSUNvZGVDb21wYXJlTW9kZWxTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjcmVhdGVNb2RlbChyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgY2hhdFRleHRFZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXApOiBQcm9taXNlPElSZWZlcmVuY2U8eyBvcmlnaW5hbFNoYTE6IHN0cmluZzsgb3JpZ2luYWw6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbDsgbW9kaWZpZWQ6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCB9Pj47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGV4dEVkaXRDb250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBhcmVQYXJ0OiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQ29tcGFyZUJsb2NrUGFydD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y2hhdFRleHRFZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXAsXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cmVuZGVyZXJPcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zLFxuXHRcdGRpZmZFZGl0b3JQb29sOiBEaWZmRWRpdG9yUG9vbCxcblx0XHRjdXJyZW50V2lkdGg6IG51bWJlcixcblx0XHRASUNvZGVDb21wYXJlTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUNvbXBhcmVNb2RlbFNlcnZpY2U6IElDb2RlQ29tcGFyZU1vZGVsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBjb250ZXh0LmVsZW1lbnQ7XG5cblx0XHRhc3NlcnRUeXBlKGlzUmVzcG9uc2VWTShlbGVtZW50KSk7XG5cblx0XHQvLyBUT0RPQGpyaWVrZW4gbW92ZSB0aGlzIGludG8gdGhlIENvbXBhcmVDb2RlQmxvY2sgYW5kIHByb3Blcmx5IHNheSB3aGF0IGtpbmQgb2YgY2hhbmdlcyBoYXBwZW5cblx0XHRpZiAocmVuZGVyZXJPcHRpb25zLnJlbmRlclRleHRFZGl0c0FzU3VtbWFyeT8uKGNoYXRUZXh0RWRpdC51cmkpKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5yZXNwb25zZS52YWx1ZS5ldmVyeShpdGVtID0+IGl0ZW0ua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKSkge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuaW50ZXJhY3RpdmUtZWRpdHMtc3VtbWFyeScsIHVuZGVmaW5lZCwgIWVsZW1lbnQuaXNDb21wbGV0ZVxuXHRcdFx0XHRcdD8gJydcblx0XHRcdFx0XHQ6IGVsZW1lbnQuaXNDYW5jZWxlZFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZWRpdHMwJywgXCJNYWtpbmcgY2hhbmdlcyB3YXMgYWJvcnRlZC5cIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2VkaXRzU3VtbWFyeScsIFwiTWFkZSBjaGFuZ2VzLlwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUgPSAkKCdkaXYnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ET0Byb2Jsb3VyZW5zIHRoaXMgY2FzZSBpcyBub3cgaGFuZGxlZCBvdXRzaWRlIHRoaXMgUGFydCBpbiBDaGF0TGlzdFJlbmRlcmVyLCBidXQgY2FuIGl0IGJlIGNsZWFuZWQgdXA/XG5cdFx0XHQvLyByZXR1cm47XG5cdFx0fSBlbHNlIHtcblxuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5jb21wYXJlUGFydCA9IHRoaXMuX3JlZ2lzdGVyKGRpZmZFZGl0b3JQb29sLmdldCgpKTtcblxuXHRcdFx0Y29uc3QgZGF0YTogSUNvZGVDb21wYXJlQmxvY2tEYXRhID0ge1xuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlZGl0OiBjaGF0VGV4dEVkaXQsXG5cdFx0XHRcdGRpZmZEYXRhOiAoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5jb2RlQ29tcGFyZU1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChlbGVtZW50LCBjaGF0VGV4dEVkaXQpO1xuXG5cdFx0XHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVmKTtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRtb2RpZmllZDogcmVmLm9iamVjdC5tb2RpZmllZC50ZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbDogcmVmLm9iamVjdC5vcmlnaW5hbC50ZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRcdFx0XHRvcmlnaW5hbFNoYTE6IHJlZi5vYmplY3Qub3JpZ2luYWxTaGExXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNvZGVDb21wYXJlQmxvY2tEaWZmRGF0YTtcblx0XHRcdFx0fSkoKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuY29tcGFyZVBhcnQub2JqZWN0LnJlbmRlcihkYXRhLCBjdXJyZW50V2lkdGgsIGN0cy50b2tlbik7XG5cblx0XHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuY29tcGFyZVBhcnQub2JqZWN0LmVsZW1lbnQ7XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBhcmVQYXJ0Py5vYmplY3QubGF5b3V0KHdpZHRoKTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIE5vIG90aGVyIGNoYW5nZSBhbGxvd2VkIGZvciB0aGlzIGNvbnRlbnQgdHlwZVxuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAndGV4dEVkaXRHcm91cCc7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cblxuY2xhc3MgQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2UgaW1wbGVtZW50cyBJQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGNyZWF0ZU1vZGVsKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGNoYXRUZXh0RWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwKTogUHJvbWlzZTxJUmVmZXJlbmNlPHsgb3JpZ2luYWxTaGExOiBzdHJpbmc7IG9yaWdpbmFsOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw7IG1vZGlmaWVkOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgfT4+IHtcblxuXHRcdGNvbnN0IG9yaWdpbmFsID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNoYXRUZXh0RWRpdC51cmkpO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoKHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0Y3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3Qob3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5jcmVhdGVTbmFwc2hvdCgpKSxcblx0XHRcdHsgbGFuZ3VhZ2VJZDogb3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sXG5cdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrLCBwYXRoOiBjaGF0VGV4dEVkaXQudXJpLnBhdGgsIHF1ZXJ5OiBnZW5lcmF0ZVV1aWQoKSB9KSxcblx0XHRcdGZhbHNlXG5cdFx0KSkudXJpKTtcblxuXHRcdGNvbnN0IGQgPSBuZXcgUmVmQ291bnRlZERpc3Bvc2FibGUodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdG9yaWdpbmFsLmRpc3Bvc2UoKTtcblx0XHRcdG1vZGlmaWVkLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBjb21wdXRlIHRoZSBzaGExIG9mIHRoZSBvcmlnaW5hbCBtb2RlbFxuXHRcdGxldCBvcmlnaW5hbFNoYTE6IHN0cmluZyA9ICcnO1xuXHRcdGlmIChjaGF0VGV4dEVkaXQuc3RhdGUpIHtcblx0XHRcdG9yaWdpbmFsU2hhMSA9IGNoYXRUZXh0RWRpdC5zdGF0ZS5zaGExO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzaGExID0gbmV3IERlZmF1bHRNb2RlbFNIQTFDb21wdXRlcigpO1xuXHRcdFx0aWYgKHNoYTEuY2FuQ29tcHV0ZVNIQTEob3JpZ2luYWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbCkpIHtcblx0XHRcdFx0b3JpZ2luYWxTaGExID0gc2hhMS5jb21wdXRlU0hBMShvcmlnaW5hbC5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHRcdFx0Y2hhdFRleHRFZGl0LnN0YXRlID0geyBzaGExOiBvcmlnaW5hbFNoYTEsIGFwcGxpZWQ6IDAgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhcHBseSBlZGl0cyB0byB0aGUgXCJtb2RpZmllZFwiIG1vZGVsXG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlKSE7XG5cdFx0Y29uc3QgZWRpdEdyb3VwczogSVNpbmdsZUVkaXRPcGVyYXRpb25bXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpKSB7XG5cdFx0XHRpZiAoIXJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVxdWVzdC5yZXNwb25zZS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0XHRpZiAoaXRlbS5raW5kICE9PSAndGV4dEVkaXRHcm91cCcgfHwgaXRlbS5zdGF0ZT8uYXBwbGllZCB8fCAhaXNFcXVhbChpdGVtLnVyaSwgY2hhdFRleHRFZGl0LnVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGl0ZW0uZWRpdHMpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0cyA9IGdyb3VwLm1hcChUZXh0RWRpdC5hc0VkaXRPcGVyYXRpb24pO1xuXHRcdFx0XHRcdGVkaXRHcm91cHMucHVzaChlZGl0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlID09PSBlbGVtZW50Lm1vZGVsKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVkaXRzIG9mIGVkaXRHcm91cHMpIHtcblx0XHRcdG1vZGlmaWVkLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIGVkaXRzLCAoKSA9PiBudWxsKTtcblx0XHR9XG5cblx0XHQvLyBzZWxmLWFjcXVpcmUgYSByZWZlcmVuY2UgdG8gZGlmZiBtb2RlbHMgZm9yIGEgc2hvcnQgd2hpbGVcblx0XHQvLyBiZWNhdXNlIHN0cmVhbWluZyB1c3VhbGx5IG1lYW5zIHdlIHdpbGwgYmUgdXNpbmcgdGhlIG9yaWdpbmFsLW1vZGVsXG5cdFx0Ly8gcmVwZWF0ZWRseSBhbmQgdGhlcmVieSBhbHNvIHNob3VsZCByZXVzZSB0aGUgbW9kaWZpZWQtbW9kZWwgYW5kIGp1c3Rcblx0XHQvLyB1cGRhdGUgaXQgd2l0aCBtb3JlIGVkaXRzXG5cdFx0ZC5hY3F1aXJlKCk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiBkLnJlbGVhc2UoKSwgNTAwMCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdG9yaWdpbmFsU2hhMSxcblx0XHRcdFx0b3JpZ2luYWw6IG9yaWdpbmFsLm9iamVjdCxcblx0XHRcdFx0bW9kaWZpZWQ6IG1vZGlmaWVkLm9iamVjdFxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGQucmVsZWFzZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDb2RlQ29tcGFyZU1vZGVsU2VydmljZSwgQ29kZUNvbXBhcmVNb2RlbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBcUMsc0JBQXNCLG9CQUFvQjtBQUN4RixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFtQyx5QkFBeUI7QUFDNUQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWlDLG9CQUFvQjtBQU9yRCxNQUFNLElBQUksSUFBSTtBQUVkLE1BQU0sMkJBQTJCLGdCQUEwQywwQkFBMEI7QUFPOUYsSUFBTSwwQkFBTixjQUFzQyxXQUF1QztBQUFBLEVBSW5GLFlBQ0MsY0FDQSxTQUNBLGlCQUNBLGdCQUNBLGNBQzJDLHlCQUMxQztBQUNELFVBQU07QUFGcUM7QUFHM0MsVUFBTSxVQUFVLFFBQVE7QUFFeEIsZUFBVyxhQUFhLE9BQU8sQ0FBQztBQUdoQyxRQUFJLGdCQUFnQiwyQkFBMkIsYUFBYSxHQUFHLEdBQUc7QUFDakUsVUFBSSxRQUFRLFNBQVMsTUFBTSxNQUFNLFVBQVEsS0FBSyxTQUFTLGVBQWUsR0FBRztBQUN4RSxhQUFLLFVBQVUsRUFBRSw4QkFBOEIsUUFBVyxDQUFDLFFBQVEsYUFDaEUsS0FDQSxRQUFRLGFBQ1AsU0FBUyxVQUFVLDZCQUE2QixJQUNoRCxTQUFTLGdCQUFnQixlQUFlLENB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
