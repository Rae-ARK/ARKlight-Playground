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
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { hashAsync } from "../../../../../../base/common/hash.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { EditorModel } from "../../../../../common/editor/editorModel.js";
function parseUnifiedDiff(diffText) {
  const lines = diffText.split("\n");
  const beforeLines = [];
  const afterLines = [];
  for (const line of lines) {
    if (line.startsWith("- ")) {
      beforeLines.push(line.substring(2));
    } else if (line.startsWith("-")) {
      beforeLines.push(line.substring(1));
    } else if (line.startsWith("+ ")) {
      afterLines.push(line.substring(2));
    } else if (line.startsWith("+")) {
      afterLines.push(line.substring(1));
    } else if (line.startsWith(" ")) {
      const content = line.substring(1);
      beforeLines.push(content);
      afterLines.push(content);
    } else if (!line.startsWith("@@") && !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("diff ")) {
      beforeLines.push(line);
      afterLines.push(line);
    }
  }
  return {
    before: beforeLines.join("\n"),
    after: afterLines.join("\n")
  };
}
class SimpleDiffEditorModel extends EditorModel {
  constructor(_original, _modified) {
    super();
    this._original = _original;
    this._modified = _modified;
    this.original = this._original.object.textEditorModel;
    this.modified = this._modified.object.textEditorModel;
  }
  dispose() {
    super.dispose();
    this._original.dispose();
    this._modified.dispose();
  }
}
let MarkdownDiffBlockPart = class extends Disposable {
  constructor(data, diffEditorPool, currentWidth, modelService, textModelService, languageService) {
    super();
    this.modelService = modelService;
    this.textModelService = textModelService;
    this.languageService = languageService;
    this.modelRef = this._register(new MutableDisposable());
    this.comparePart = this._register(diffEditorPool.get());
    const originalUri = URI.from({
      scheme: Schemas.vscodeChatCodeBlock,
      path: `/chat-diff-original-${data.codeBlockIndex}-${generateUuid()}`
    });
    const modifiedUri = URI.from({
      scheme: Schemas.vscodeChatCodeBlock,
      path: `/chat-diff-modified-${data.codeBlockIndex}-${generateUuid()}`
    });
    const languageSelection = this.languageService.createById(data.languageId);
    const originalModel = this.modelService.createModel(data.beforeContent, languageSelection, originalUri, false);
    const modifiedModel = this.modelService.createModel(data.afterContent, languageSelection, modifiedUri, false);
    const cts = new CancellationTokenSource();
    let referencesSettled = false;
    let disposeRequested = false;
    let didDisposeModels = false;
    const disposeModels = () => {
      if (didDisposeModels) {
        return;
      }
      didDisposeModels = true;
      originalModel.dispose();
      modifiedModel.dispose();
    };
    this._register(toDisposable(() => {
      disposeRequested = true;
      cts.dispose(true);
      if (referencesSettled) {
        disposeModels();
      }
    }));
    const modelsPromise = Promise.all([
      this.textModelService.createModelReference(originalUri),
      this.textModelService.createModelReference(modifiedUri)
    ]).then(([originalRef, modifiedRef]) => {
      referencesSettled = true;
      const model = new SimpleDiffEditorModel(originalRef, modifiedRef);
      if (disposeRequested) {
        model.dispose();
        disposeModels();
        return void 0;
      }
      return model;
    }, (error) => {
      referencesSettled = true;
      disposeModels();
      if (disposeRequested) {
        return void 0;
      }
      throw error;
    });
    const compareData = {
      element: data.element,
      isReadOnly: data.isReadOnly,
      horizontalPadding: data.horizontalPadding,
      edit: {
        uri: data.codeBlockResource || modifiedUri,
        edits: [],
        kind: "textEditGroup",
        done: true
      },
      diffData: modelsPromise.then(async (model) => {
        if (!model) {
          return void 0;
        }
        this.modelRef.value = model;
        const diffData = {
          original: model.original,
          modified: model.modified,
          originalSha1: await hashAsync(model.original.getValue())
        };
        return diffData;
      })
    };
    this.comparePart.object.render(compareData, currentWidth, cts.token);
    this.element = this.comparePart.object.element;
  }
  layout(width) {
    this.comparePart.object.layout(width);
  }
  reset() {
    this.modelRef.clear();
  }
};
MarkdownDiffBlockPart = __decorateClass([
  __decorateParam(3, IModelService),
  __decorateParam(4, ITextModelService),
  __decorateParam(5, ILanguageService)
], MarkdownDiffBlockPart);
export {
  MarkdownDiffBlockPart,
  parseUnifiedDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0RGlmZkJsb2NrUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGhhc2hBc3luYyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yUG9vbCB9IGZyb20gJy4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgQ29kZUNvbXBhcmVCbG9ja1BhcnQsIElDb2RlQ29tcGFyZUJsb2NrRGF0YSwgSUNvZGVDb21wYXJlQmxvY2tEaWZmRGF0YSB9IGZyb20gJy4vY29kZUJsb2NrUGFydC5qcyc7XG5cbi8qKlxuICogUGFyc2VzIHVuaWZpZWQgZGlmZiBmb3JtYXQgaW50byBiZWZvcmUvYWZ0ZXIgY29udGVudC5cbiAqIFN1cHBvcnRzIHN0YW5kYXJkIHVuaWZpZWQgZGlmZiBmb3JtYXQgd2l0aCAtIGFuZCArIHByZWZpeGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VVbmlmaWVkRGlmZihkaWZmVGV4dDogc3RyaW5nKTogeyBiZWZvcmU6IHN0cmluZzsgYWZ0ZXI6IHN0cmluZyB9IHtcblx0Y29uc3QgbGluZXMgPSBkaWZmVGV4dC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IGJlZm9yZUxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBhZnRlckxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJy0gJykpIHtcblx0XHRcdGJlZm9yZUxpbmVzLnB1c2gobGluZS5zdWJzdHJpbmcoMikpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCctJykpIHtcblx0XHRcdGJlZm9yZUxpbmVzLnB1c2gobGluZS5zdWJzdHJpbmcoMSkpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCcrICcpKSB7XG5cdFx0XHRhZnRlckxpbmVzLnB1c2gobGluZS5zdWJzdHJpbmcoMikpO1xuXHRcdH0gZWxzZSBpZiAobGluZS5zdGFydHNXaXRoKCcrJykpIHtcblx0XHRcdGFmdGVyTGluZXMucHVzaChsaW5lLnN1YnN0cmluZygxKSk7XG5cdFx0fSBlbHNlIGlmIChsaW5lLnN0YXJ0c1dpdGgoJyAnKSkge1xuXHRcdFx0Ly8gQ29udGV4dCBsaW5lIC0gYXBwZWFycyBpbiBib3RoXG5cdFx0XHRjb25zdCBjb250ZW50ID0gbGluZS5zdWJzdHJpbmcoMSk7XG5cdFx0XHRiZWZvcmVMaW5lcy5wdXNoKGNvbnRlbnQpO1xuXHRcdFx0YWZ0ZXJMaW5lcy5wdXNoKGNvbnRlbnQpO1xuXHRcdH0gZWxzZSBpZiAoIWxpbmUuc3RhcnRzV2l0aCgnQEAnKSAmJiAhbGluZS5zdGFydHNXaXRoKCctLS0nKSAmJiAhbGluZS5zdGFydHNXaXRoKCcrKysnKSAmJiAhbGluZS5zdGFydHNXaXRoKCdkaWZmICcpKSB7XG5cdFx0XHQvLyBSZWd1bGFyIGxpbmUgd2l0aG91dCBwcmVmaXggLSB0cmVhdCBhcyBjb250ZXh0XG5cdFx0XHRiZWZvcmVMaW5lcy5wdXNoKGxpbmUpO1xuXHRcdFx0YWZ0ZXJMaW5lcy5wdXNoKGxpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0YmVmb3JlOiBiZWZvcmVMaW5lcy5qb2luKCdcXG4nKSxcblx0XHRhZnRlcjogYWZ0ZXJMaW5lcy5qb2luKCdcXG4nKVxuXHR9O1xufVxuXG4vKipcbiAqIFNpbXBsZSBkaWZmIGVkaXRvciBtb2RlbCBmb3IgaW5saW5lIGRpZmZzIGluIG1hcmtkb3duIGNvZGUgYmxvY2tzXG4gKi9cbmNsYXNzIFNpbXBsZURpZmZFZGl0b3JNb2RlbCBleHRlbmRzIEVkaXRvck1vZGVsIHtcblx0cHVibGljIHJlYWRvbmx5IG9yaWdpbmFsOiBJVGV4dE1vZGVsO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW9kaWZpZWQ6IElUZXh0TW9kZWw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWw6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZDogSVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub3JpZ2luYWwgPSB0aGlzLl9vcmlnaW5hbC5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdHRoaXMubW9kaWZpZWQgPSB0aGlzLl9tb2RpZmllZC5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29yaWdpbmFsLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RpZmllZC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2Rvd25EaWZmQmxvY2tEYXRhIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcblx0cmVhZG9ubHkgY29kZUJsb2NrSW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRyZWFkb25seSBiZWZvcmVDb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFmdGVyQ29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBjb2RlQmxvY2tSZXNvdXJjZT86IFVSSTtcblx0cmVhZG9ubHkgaXNSZWFkT25seT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhvcml6b250YWxQYWRkaW5nPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYSBkaWZmIGJsb2NrIGZyb20gbWFya2Rvd24gY29udGVudC5cbiAqIFRoaXMgaXMgYSBsaWdodHdlaWdodCB3cmFwcGVyIHRoYXQgdXNlcyBDb2RlQ29tcGFyZUJsb2NrUGFydCBmb3IgdGhlIGFjdHVhbCByZW5kZXJpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBNYXJrZG93bkRpZmZCbG9ja1BhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tcGFyZVBhcnQ6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENvZGVDb21wYXJlQmxvY2tQYXJ0Pjtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbFJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxTaW1wbGVEaWZmRWRpdG9yTW9kZWw+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRhdGE6IElNYXJrZG93bkRpZmZCbG9ja0RhdGEsXG5cdFx0ZGlmZkVkaXRvclBvb2w6IERpZmZFZGl0b3JQb29sLFxuXHRcdGN1cnJlbnRXaWR0aDogbnVtYmVyLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5jb21wYXJlUGFydCA9IHRoaXMuX3JlZ2lzdGVyKGRpZmZFZGl0b3JQb29sLmdldCgpKTtcblxuXHRcdC8vIENyZWF0ZSBpbi1tZW1vcnkgbW9kZWxzIGZvciB0aGUgZGlmZlxuXHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRDb2RlQmxvY2ssXG5cdFx0XHRwYXRoOiBgL2NoYXQtZGlmZi1vcmlnaW5hbC0ke2RhdGEuY29kZUJsb2NrSW5kZXh9LSR7Z2VuZXJhdGVVdWlkKCl9YCxcblx0XHR9KTtcblx0XHRjb25zdCBtb2RpZmllZFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrLFxuXHRcdFx0cGF0aDogYC9jaGF0LWRpZmYtbW9kaWZpZWQtJHtkYXRhLmNvZGVCbG9ja0luZGV4fS0ke2dlbmVyYXRlVXVpZCgpfWAsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZVNlbGVjdGlvbiA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoZGF0YS5sYW5ndWFnZUlkKTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChkYXRhLmJlZm9yZUNvbnRlbnQsIGxhbmd1YWdlU2VsZWN0aW9uLCBvcmlnaW5hbFVyaSwgZmFsc2UpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChkYXRhLmFmdGVyQ29udGVudCwgbGFuZ3VhZ2VTZWxlY3Rpb24sIG1vZGlmaWVkVXJpLCBmYWxzZSk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0bGV0IHJlZmVyZW5jZXNTZXR0bGVkID0gZmFsc2U7XG5cdFx0bGV0IGRpc3Bvc2VSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRsZXQgZGlkRGlzcG9zZU1vZGVscyA9IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3Bvc2VNb2RlbHMgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlkRGlzcG9zZU1vZGVscykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGRpZERpc3Bvc2VNb2RlbHMgPSB0cnVlO1xuXHRcdFx0b3JpZ2luYWxNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRtb2RpZmllZE1vZGVsLmRpc3Bvc2UoKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0aWYgKHJlZmVyZW5jZXNTZXR0bGVkKSB7XG5cdFx0XHRcdGRpc3Bvc2VNb2RlbHMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbHNQcm9taXNlID0gUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKG9yaWdpbmFsVXJpKSxcblx0XHRcdHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShtb2RpZmllZFVyaSlcblx0XHRdKS50aGVuKChbb3JpZ2luYWxSZWYsIG1vZGlmaWVkUmVmXSkgPT4ge1xuXHRcdFx0cmVmZXJlbmNlc1NldHRsZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgU2ltcGxlRGlmZkVkaXRvck1vZGVsKG9yaWdpbmFsUmVmLCBtb2RpZmllZFJlZik7XG5cdFx0XHRpZiAoZGlzcG9zZVJlcXVlc3RlZCkge1xuXHRcdFx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHRcdGRpc3Bvc2VNb2RlbHMoKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1vZGVsO1xuXHRcdH0sIGVycm9yID0+IHtcblx0XHRcdHJlZmVyZW5jZXNTZXR0bGVkID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2VNb2RlbHMoKTtcblx0XHRcdGlmIChkaXNwb3NlUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29tcGFyZURhdGE6IElDb2RlQ29tcGFyZUJsb2NrRGF0YSA9IHtcblx0XHRcdGVsZW1lbnQ6IGRhdGEuZWxlbWVudCxcblx0XHRcdGlzUmVhZE9ubHk6IGRhdGEuaXNSZWFkT25seSxcblx0XHRcdGhvcml6b250YWxQYWRkaW5nOiBkYXRhLmhvcml6b250YWxQYWRkaW5nLFxuXHRcdFx0ZWRpdDoge1xuXHRcdFx0XHR1cmk6IGRhdGEuY29kZUJsb2NrUmVzb3VyY2UgfHwgbW9kaWZpZWRVcmksXG5cdFx0XHRcdGVkaXRzOiBbXSxcblx0XHRcdFx0a2luZDogJ3RleHRFZGl0R3JvdXAnLFxuXHRcdFx0XHRkb25lOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0ZGlmZkRhdGE6IG1vZGVsc1Byb21pc2UudGhlbihhc3luYyBtb2RlbCA9PiB7XG5cdFx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IG1vZGVsO1xuXHRcdFx0XHRjb25zdCBkaWZmRGF0YTogSUNvZGVDb21wYXJlQmxvY2tEaWZmRGF0YSA9IHtcblx0XHRcdFx0XHRvcmlnaW5hbDogbW9kZWwub3JpZ2luYWwsXG5cdFx0XHRcdFx0bW9kaWZpZWQ6IG1vZGVsLm1vZGlmaWVkLFxuXHRcdFx0XHRcdG9yaWdpbmFsU2hhMTogYXdhaXQgaGFzaEFzeW5jKG1vZGVsLm9yaWdpbmFsLmdldFZhbHVlKCkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gZGlmZkRhdGE7XG5cdFx0XHR9KVxuXHRcdH07XG5cblx0XHR0aGlzLmNvbXBhcmVQYXJ0Lm9iamVjdC5yZW5kZXIoY29tcGFyZURhdGEsIGN1cnJlbnRXaWR0aCwgY3RzLnRva2VuKTtcblx0XHR0aGlzLmVsZW1lbnQgPSB0aGlzLmNvbXBhcmVQYXJ0Lm9iamVjdC5lbGVtZW50O1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBhcmVQYXJ0Lm9iamVjdC5sYXlvdXQod2lkdGgpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbFJlZi5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsWUFBd0IsbUJBQW1CLG9CQUFvQjtBQUN4RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLG1CQUFtQjtBQVVyQixTQUFTLGlCQUFpQixVQUFxRDtBQUNyRixRQUFNLFFBQVEsU0FBUyxNQUFNLElBQUk7QUFDakMsUUFBTSxjQUF3QixDQUFDO0FBQy9CLFFBQU0sYUFBdUIsQ0FBQztBQUU5QixhQUFXLFFBQVEsT0FBTztBQUN6QixR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QVEsSUFBSTtBQUFBLE1BQ2pDLEtBQUssaUJBQWlCLHFCQUFxQixXQUFXO0FBQUEsTUFDdEQsS0FBSyxpQkFBaUIscUJBQXFCLFdBQVc7QUFBQSxJQUN2RCxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsYUFBYSxXQUFXLE1BQU07QUFDdkMsMEJBQW9CO0FBQ3BCLFlBQU0sUUFBUSxJQUFJLHNCQUFzQixhQUFhLFdBQVc7QUFDaEUsVUFBSSxrQkFBa0I7QUFDckIsY0FBTSxRQUFRO0FBQ2Qsc0JBQWM7QUFDZCxlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSLEdBQUcsV0FBUztBQUNYLDBCQUFvQjtBQUNwQixvQkFBYztBQUNkLFVBQUksa0JBQWtCO0FBQ3JCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTTtBQUFBLElBQ1AsQ0FBQztBQUVELFVBQU0sY0FBcUM7QUFBQSxNQUMxQyxTQUFTLEtBQUs7QUFBQSxNQUNkLFlBQVksS0FBSztBQUFBLE1BQ2pCLG1CQUFtQixLQUFLO0FBQUEsTUFDeEIsTUFBTTtBQUFBLFFBQ0wsS0FBSyxLQUFLLHFCQUFxQjtBQUFBLFFBQy9CLE9BQU8sQ0FBQztBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLFVBQVUsY0FBYyxLQUFLLE9BQU0sVUFBUztBQUMzQyxZQUFJLENBQUMsT0FBTztBQUNYLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGFBQUssU0FBUyxRQUFRO0FBQ3RCLGNBQU0sV0FBc0M7QUFBQSxVQUMzQyxVQUFVLE1BQU07QUFBQSxVQUNoQixVQUFVLE1BQU07QUFBQSxVQUNoQixjQUFjLE1BQU0sVUFBVSxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQUEsUUFDeEQ7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRjtBQUVBLFNBQUssWUFBWSxPQUFPLE9BQU8sYUFBYSxjQUFjLElBQUksS0FBSztBQUNuRSxTQUFLLFVBQVUsS0FBSyxZQUFZLE9BQU87QUFBQSxFQUN4QztBQUFBLEVBRUEsT0FBTyxPQUFxQjtBQUMzQixTQUFLLFlBQVksT0FBTyxPQUFPLEtBQUs7QUFBQSxFQUNyQztBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssU0FBUyxNQUFNO0FBQUEsRUFDckI7QUFDRDtBQS9HYSx3QkFBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
