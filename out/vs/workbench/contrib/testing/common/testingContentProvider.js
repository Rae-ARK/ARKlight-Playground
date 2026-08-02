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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { removeAnsiEscapeCodes } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { ITestResultService } from "./testResultService.js";
import { TestMessageType } from "./testTypes.js";
import { TEST_DATA_SCHEME, TestUriType, parseTestUri } from "./testingUri.js";
let TestingContentProvider = class {
  constructor(textModelResolverService, languageService, modelService, resultService) {
    this.languageService = languageService;
    this.modelService = modelService;
    this.resultService = resultService;
    textModelResolverService.registerTextModelContentProvider(TEST_DATA_SCHEME, this);
  }
  /**
   * @inheritdoc
   */
  async provideTextContent(resource) {
    const existing = this.modelService.getModel(resource);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    const parsed = parseTestUri(resource);
    if (!parsed) {
      return null;
    }
    const result = this.resultService.getResult(parsed.resultId);
    if (!result) {
      return null;
    }
    if (parsed.type === TestUriType.TaskOutput) {
      const task = result.tasks[parsed.taskIndex];
      const model = this.modelService.createModel("", null, resource, false);
      const append = (text2) => model.applyEdits([{
        range: { startColumn: 1, endColumn: 1, startLineNumber: Infinity, endLineNumber: Infinity },
        text: text2
      }]);
      const init = VSBuffer.concat(task.output.buffers, task.output.length).toString();
      append(removeAnsiEscapeCodes(init));
      let hadContent = init.length > 0;
      const dispose = new DisposableStore();
      dispose.add(task.output.onDidWriteData((d) => {
        hadContent ||= d.byteLength > 0;
        append(removeAnsiEscapeCodes(d.toString()));
      }));
      task.output.endPromise.then(() => {
        if (dispose.isDisposed) {
          return;
        }
        if (!hadContent) {
          append(localize("runNoOutout", "The test run did not record any output."));
          dispose.dispose();
        }
      });
      dispose.add(model.onWillDispose(() => dispose.dispose()));
      return model;
    }
    const test = result?.getStateById(parsed.testExtId);
    if (!test) {
      return null;
    }
    let text;
    let language = null;
    switch (parsed.type) {
      case TestUriType.ResultActualOutput: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (message?.type === TestMessageType.Error) {
          text = message.actual;
        }
        break;
      }
      case TestUriType.TestOutput: {
        text = "";
        const output = result.tasks[parsed.taskIndex].output;
        for (const message of test.tasks[parsed.taskIndex].messages) {
          if (message.type === TestMessageType.Output) {
            text += removeAnsiEscapeCodes(output.getRange(message.offset, message.length).toString());
          }
        }
        break;
      }
      case TestUriType.ResultExpectedOutput: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (message?.type === TestMessageType.Error) {
          text = message.expected;
        }
        break;
      }
      case TestUriType.ResultMessage: {
        const message = test.tasks[parsed.taskIndex].messages[parsed.messageIndex];
        if (!message) {
          break;
        }
        if (message.type === TestMessageType.Output) {
          const content = result.tasks[parsed.taskIndex].output.getRange(message.offset, message.length);
          text = removeAnsiEscapeCodes(content.toString());
        } else if (typeof message.message === "string") {
          text = removeAnsiEscapeCodes(message.message);
        } else {
          text = message.message.value;
          language = this.languageService.createById("markdown");
        }
      }
    }
    if (text === void 0) {
      return null;
    }
    return this.modelService.createModel(text, language, resource, false);
  }
};
TestingContentProvider.ID = "workbench.contrib.testing.contentProvider";
TestingContentProvider = __decorateClass([
  __decorateParam(0, ITextModelService),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ITestResultService)
], TestingContentProvider);
export {
  TestingContentProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RpbmdDb250ZW50UHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VsZWN0aW9uLCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0TWVzc2FnZVR5cGUgfSBmcm9tICcuL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBURVNUX0RBVEFfU0NIRU1FLCBUZXN0VXJpVHlwZSwgcGFyc2VUZXN0VXJpIH0gZnJvbSAnLi90ZXN0aW5nVXJpLmpzJztcblxuLyoqXG4gKiBBIGNvbnRlbnQgcHJvdmlkZXIgdGhhdCByZXR1cm5zIHZhcmlvdXMgb3V0cHV0cyBmb3IgdGVzdHMuIFRoaXMgaXMgdXNlZFxuICogaW4gdGhlIGlubGluZSBwZWVrIHZpZXcuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXN0aW5nQ29udGVudFByb3ZpZGVyIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudGVzdGluZy5jb250ZW50UHJvdmlkZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdCkge1xuXHRcdHRleHRNb2RlbFJlc29sdmVyU2VydmljZS5yZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcihURVNUX0RBVEFfU0NIRU1FLCB0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW5oZXJpdGRvY1xuXHQgKi9cblx0cHVibGljIGFzeW5jIHByb3ZpZGVUZXh0Q29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZyAmJiAhZXhpc3RpbmcuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VUZXN0VXJpKHJlc291cmNlKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5yZXN1bHRTZXJ2aWNlLmdldFJlc3VsdChwYXJzZWQucmVzdWx0SWQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAocGFyc2VkLnR5cGUgPT09IFRlc3RVcmlUeXBlLlRhc2tPdXRwdXQpIHtcblx0XHRcdGNvbnN0IHRhc2sgPSByZXN1bHQudGFza3NbcGFyc2VkLnRhc2tJbmRleF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCByZXNvdXJjZSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgYXBwZW5kID0gKHRleHQ6IHN0cmluZykgPT4gbW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRyYW5nZTogeyBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAxLCBzdGFydExpbmVOdW1iZXI6IEluZmluaXR5LCBlbmRMaW5lTnVtYmVyOiBJbmZpbml0eSB9LFxuXHRcdFx0XHR0ZXh0LFxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCBpbml0ID0gVlNCdWZmZXIuY29uY2F0KHRhc2sub3V0cHV0LmJ1ZmZlcnMsIHRhc2sub3V0cHV0Lmxlbmd0aCkudG9TdHJpbmcoKTtcblx0XHRcdGFwcGVuZChyZW1vdmVBbnNpRXNjYXBlQ29kZXMoaW5pdCkpO1xuXG5cdFx0XHRsZXQgaGFkQ29udGVudCA9IGluaXQubGVuZ3RoID4gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NlLmFkZCh0YXNrLm91dHB1dC5vbkRpZFdyaXRlRGF0YShkID0+IHtcblx0XHRcdFx0aGFkQ29udGVudCB8fD0gZC5ieXRlTGVuZ3RoID4gMDtcblx0XHRcdFx0YXBwZW5kKHJlbW92ZUFuc2lFc2NhcGVDb2RlcyhkLnRvU3RyaW5nKCkpKTtcblx0XHRcdH0pKTtcblx0XHRcdHRhc2sub3V0cHV0LmVuZFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmIChkaXNwb3NlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFoYWRDb250ZW50KSB7XG5cdFx0XHRcdFx0YXBwZW5kKGxvY2FsaXplKCdydW5Ob091dG91dCcsICdUaGUgdGVzdCBydW4gZGlkIG5vdCByZWNvcmQgYW55IG91dHB1dC4nKSk7XG5cdFx0XHRcdFx0ZGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zZS5hZGQobW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiBkaXNwb3NlLmRpc3Bvc2UoKSkpO1xuXG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdCA9IHJlc3VsdD8uZ2V0U3RhdGVCeUlkKHBhcnNlZC50ZXN0RXh0SWQpO1xuXHRcdGlmICghdGVzdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFuZ3VhZ2U6IElMYW5ndWFnZVNlbGVjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdHN3aXRjaCAocGFyc2VkLnR5cGUpIHtcblx0XHRcdGNhc2UgVGVzdFVyaVR5cGUuUmVzdWx0QWN0dWFsT3V0cHV0OiB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0ZXN0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm1lc3NhZ2VzW3BhcnNlZC5tZXNzYWdlSW5kZXhdO1xuXHRcdFx0XHRpZiAobWVzc2FnZT8udHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLkVycm9yKSB7IHRleHQgPSBtZXNzYWdlLmFjdHVhbDsgfVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVzdFVyaVR5cGUuVGVzdE91dHB1dDoge1xuXHRcdFx0XHR0ZXh0ID0gJyc7XG5cdFx0XHRcdGNvbnN0IG91dHB1dCA9IHJlc3VsdC50YXNrc1twYXJzZWQudGFza0luZGV4XS5vdXRwdXQ7XG5cdFx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiB0ZXN0LnRhc2tzW3BhcnNlZC50YXNrSW5kZXhdLm1lc3NhZ2VzKSB7XG5cdFx0XHRcdFx0aWYgKG1lc3NhZ2UudHlwZSA9PT0gVGVzdE1lc3NhZ2VUeXBlLk91dHB1dCkge1xuXHRcdFx0XHRcdFx0dGV4dCArPSByZW1vdmVBbnNpRXNjYXBlQ29kZXMob3V0cHV0LmdldFJhbmdlKG1lc3NhZ2Uub2Zmc2V0LCBtZXNzYWdlLmxlbmd0aCkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUZXN0VXJpVHlwZS5SZXN1bHRFeHBlY3RlZE91dHB1dDoge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGVzdC50YXNrc1twYXJzZWQudGFza0luZGV4XS5tZXNzYWdlc1twYXJzZWQubWVzc2FnZUluZGV4XTtcblx0XHRcdFx0aWYgKG1lc3NhZ2U/LnR5cGUgPT09IFRlc3RNZXNzYWdlVHlwZS5FcnJvcikgeyB0ZXh0ID0gbWVzc2FnZS5leHBlY3RlZDsgfVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVzdFVyaVR5cGUuUmVzdWx0TWVzc2FnZToge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGVzdC50YXNrc1twYXJzZWQudGFza0luZGV4XS5tZXNzYWdlc1twYXJzZWQubWVzc2FnZUluZGV4XTtcblx0XHRcdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWVzc2FnZS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuT3V0cHV0KSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IHJlc3VsdC50YXNrc1twYXJzZWQudGFza0luZGV4XS5vdXRwdXQuZ2V0UmFuZ2UobWVzc2FnZS5vZmZzZXQsIG1lc3NhZ2UubGVuZ3RoKTtcblx0XHRcdFx0XHR0ZXh0ID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKGNvbnRlbnQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIG1lc3NhZ2UubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0ZXh0ID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKG1lc3NhZ2UubWVzc2FnZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGV4dCA9IG1lc3NhZ2UubWVzc2FnZS52YWx1ZTtcblx0XHRcdFx0XHRsYW5ndWFnZSA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ21hcmtkb3duJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwodGV4dCwgbGFuZ3VhZ2UsIHJlc291cmNlLCBmYWxzZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBNkIsd0JBQXdCO0FBRXJELFNBQVMscUJBQXFCO0FBQzlCLFNBQW9DLHlCQUF5QjtBQUM3RCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQixhQUFhLG9CQUFvQjtBQU1yRCxJQUFNLHlCQUFOLE1BQTBGO0FBQUEsRUFHaEcsWUFDb0IsMEJBQ2dCLGlCQUNILGNBQ0ssZUFDcEM7QUFIa0M7QUFDSDtBQUNLO0FBRXJDLDZCQUF5QixpQ0FBaUMsa0JBQWtCLElBQUk7QUFBQSxFQUNqRjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxtQkFBbUIsVUFBMkM7QUFDMUUsVUFBTSxXQUFXLEtBQUssYUFBYSxTQUFTLFFBQVE7QUFDcEQsUUFBSSxZQUFZLENBQUMsU0FBUyxXQUFXLEdBQUc7QUFDdkMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsYUFBYSxRQUFRO0FBQ3BDLFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsS0FB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
