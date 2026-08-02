import * as nls from "../../../../nls.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { ITextMateTokenizationService } from "../../../services/textMate/browser/textMateTokenizationFeature.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Constants } from "../../../../base/common/uint.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IFileService } from "../../../../platform/files/common/files.js";
const _StartDebugTextMate = class _StartDebugTextMate extends Action2 {
  constructor() {
    super({
      id: "editor.action.startDebugTextMate",
      title: nls.localize2("startDebugTextMate", "Start TextMate Syntax Grammar Logging"),
      category: Categories.Developer,
      f1: true
    });
  }
  _getOrCreateModel(modelService) {
    const model = modelService.getModel(_StartDebugTextMate.resource);
    if (model) {
      return model;
    }
    return modelService.createModel("", null, _StartDebugTextMate.resource);
  }
  _append(model, str) {
    const lineCount = model.getLineCount();
    model.applyEdits([{
      range: new Range(lineCount, Constants.MAX_SAFE_SMALL_INTEGER, lineCount, Constants.MAX_SAFE_SMALL_INTEGER),
      text: str
    }]);
  }
  async run(accessor) {
    const textMateService = accessor.get(ITextMateTokenizationService);
    const modelService = accessor.get(IModelService);
    const editorService = accessor.get(IEditorService);
    const codeEditorService = accessor.get(ICodeEditorService);
    const hostService = accessor.get(IHostService);
    const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
    const loggerService = accessor.get(ILoggerService);
    const fileService = accessor.get(IFileService);
    const pathInTemp = joinPath(environmentService.tmpDir, `vcode-tm-log-${generateUuid()}.txt`);
    await fileService.createFile(pathInTemp);
    const logger = loggerService.createLogger(pathInTemp, { name: "debug textmate" });
    const model = this._getOrCreateModel(modelService);
    const append = (str) => {
      this._append(model, str + "\n");
      scrollEditor();
      logger.info(str);
      logger.flush();
    };
    await hostService.openWindow([{ fileUri: pathInTemp }], { forceNewWindow: true });
    const textEditorPane = await editorService.openEditor({
      resource: model.uri,
      options: { pinned: true }
    });
    if (!textEditorPane) {
      return;
    }
    const scrollEditor = () => {
      const editors = codeEditorService.listCodeEditors();
      for (const editor of editors) {
        if (editor.hasModel()) {
          if (editor.getModel().uri.toString() === _StartDebugTextMate.resource.toString()) {
            editor.revealLine(editor.getModel().getLineCount());
          }
        }
      }
    };
    append(`// Open the file you want to test to the side and watch here`);
    append(`// Output mirrored at ${pathInTemp}`);
    textMateService.startDebugMode(
      (str) => {
        this._append(model, str + "\n");
        scrollEditor();
        logger.info(str);
        logger.flush();
      },
      () => {
      }
    );
  }
};
_StartDebugTextMate.resource = URI.parse(`inmemory:///tm-log.txt`);
let StartDebugTextMate = _StartDebugTextMate;
registerAction2(StartDebugTextMate);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvZWxlY3Ryb24tYnJvd3Nlci9zdGFydERlYnVnVGV4dE1hdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dE1hdGUvYnJvd3Nlci90ZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5jbGFzcyBTdGFydERlYnVnVGV4dE1hdGUgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZXNvdXJjZSA9IFVSSS5wYXJzZShgaW5tZW1vcnk6Ly8vdG0tbG9nLnR4dGApO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5zdGFydERlYnVnVGV4dE1hdGUnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3N0YXJ0RGVidWdUZXh0TWF0ZScsIFwiU3RhcnQgVGV4dE1hdGUgU3ludGF4IEdyYW1tYXIgTG9nZ2luZ1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZU1vZGVsKG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSk6IElUZXh0TW9kZWwge1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKFN0YXJ0RGVidWdUZXh0TWF0ZS5yZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIFN0YXJ0RGVidWdUZXh0TWF0ZS5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmQobW9kZWw6IElUZXh0TW9kZWwsIHN0cjogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShsaW5lQ291bnQsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLCBsaW5lQ291bnQsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKSxcblx0XHRcdHRleHQ6IHN0clxuXHRcdH1dKTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRleHRNYXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dnZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dnZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGF0aEluVGVtcCA9IGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS50bXBEaXIsIGB2Y29kZS10bS1sb2ctJHtnZW5lcmF0ZVV1aWQoKX0udHh0YCk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShwYXRoSW5UZW1wKTtcblx0XHRjb25zdCBsb2dnZXIgPSBsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihwYXRoSW5UZW1wLCB7IG5hbWU6ICdkZWJ1ZyB0ZXh0bWF0ZScgfSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRPckNyZWF0ZU1vZGVsKG1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgYXBwZW5kID0gKHN0cjogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aGlzLl9hcHBlbmQobW9kZWwsIHN0ciArICdcXG4nKTtcblx0XHRcdHNjcm9sbEVkaXRvcigpO1xuXHRcdFx0bG9nZ2VyLmluZm8oc3RyKTtcblx0XHRcdGxvZ2dlci5mbHVzaCgpO1xuXHRcdH07XG5cdFx0YXdhaXQgaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyBmaWxlVXJpOiBwYXRoSW5UZW1wIH1dLCB7IGZvcmNlTmV3V2luZG93OiB0cnVlIH0pO1xuXHRcdGNvbnN0IHRleHRFZGl0b3JQYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0fSk7XG5cdFx0aWYgKCF0ZXh0RWRpdG9yUGFuZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY3JvbGxFZGl0b3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdGlmIChlZGl0b3IuZ2V0TW9kZWwoKS51cmkudG9TdHJpbmcoKSA9PT0gU3RhcnREZWJ1Z1RleHRNYXRlLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5yZXZlYWxMaW5lKGVkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXBwZW5kKGAvLyBPcGVuIHRoZSBmaWxlIHlvdSB3YW50IHRvIHRlc3QgdG8gdGhlIHNpZGUgYW5kIHdhdGNoIGhlcmVgKTtcblx0XHRhcHBlbmQoYC8vIE91dHB1dCBtaXJyb3JlZCBhdCAke3BhdGhJblRlbXB9YCk7XG5cblx0XHR0ZXh0TWF0ZVNlcnZpY2Uuc3RhcnREZWJ1Z01vZGUoXG5cdFx0XHQoc3RyKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FwcGVuZChtb2RlbCwgc3RyICsgJ1xcbicpO1xuXHRcdFx0XHRzY3JvbGxFZGl0b3IoKTtcblx0XHRcdFx0bG9nZ2VyLmluZm8oc3RyKTtcblx0XHRcdFx0bG9nZ2VyLmZsdXNoKCk7XG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4ge1xuXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU3RhcnREZWJ1Z1RleHRNYXRlKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFHN0IsTUFBTSxzQkFBTixNQUFNLDRCQUEyQixRQUFRO0FBQUEsRUFJeEMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLHNCQUFzQix1Q0FBdUM7QUFBQSxNQUNsRixVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsa0JBQWtCLGNBQXlDO0FBQ2xFLFVBQU0sUUFBUSxhQUFhLFNBQVMsb0JBQW1CLFFBQVE7QUFDL0QsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLGFBQWEsWUFBWSxJQUFJLE1BQU0sb0JBQW1CLFFBQVE7QUFBQSxFQUN0RTtBQUFBLEVBRVEsUUFBUSxPQUFtQixLQUFhO0FBQy9DLFVBQU0sWUFBWSxNQUFNLGFBQWE7QUFDckMsVUFBTSxXQUFXLENBQUM7QUFBQSxNQUNqQixPQUFPLElBQUksTUFBTSxXQUFXLFVBQVUsd0JBQXdCLFdBQVcsVUFBVSxzQkFBc0I7QUFBQSxNQUN6RyxNQUFNO0FBQUEsSUFDUCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEI7QUFDckMsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLDRCQUE0QjtBQUNqRSxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxvQkFBb0IsU0FBUyxJQUFJLGtCQUFrQjtBQUN6RCxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFDN0MsVUFBTSxxQkFBcUIsU0FBUyxJQUFJLGtDQUFrQztBQUMxRSxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLGNBQWMsU0FBUyxJQUFJLFlBQVk7QUFFN0MsVUFBTSxhQUFhLFNBQVMsbUJBQW1CLFFBQVEsZ0JBQWdCLGFBQWEsQ0FBQyxNQUFNO0FBQzNGLFVBQU0sWUFBWSxXQUFXLFVBQVU7QUFDdkMsVUFBTSxTQUFTLGNBQWMsYUFBYSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUNoRixVQUFNLFFBQVEsS0FBSyxrQkFBa0IsWUFBWTtBQUNqRCxVQUFNLFNBQVMsQ0FBQyxRQUFnQjtBQUMvQixXQUFLLFFBQVEsT0FBTyxNQUFNLElBQUk7QUFDOUIsbUJBQWE7QUFDYixhQUFPLEtBQUssR0FBRztBQUNmLGFBQU8sTUFBTTtBQUFBLElBQ2Q7QUFDQSxVQUFNLFlBQVksV0FBVyxDQUFDLEVBQUUsU0FBUyxXQUFXLENBQUMsR0FBRyxFQUFFLGdCQUFnQixLQUFLLENBQUM7QUFDaEYsVUFBTSxpQkFBaUIsTUFBTSxjQUFjLFdBQVc7QUFBQSxNQUNyRCxVQUFVLE1BQU07QUFBQSxNQUNoQixTQUFTLEVBQUUsUUFBUSxLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUNELFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLE1BQU07QUFDMUIsWUFBTSxVQUFVLGtCQUFrQixnQkFBZ0I7QUFDbEQsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsY0FBSSxPQUFPLFNBQVMsRUFBRSxJQUFJLFNBQVMsTUFBTSxvQkFBbUIsU0FBUyxTQUFTLEdBQUc7QUFDaEYsbUJBQU8sV0FBVyxPQUFPLFNBQVMsRUFBRSxhQUFhLENBQUM7QUFBQSxVQUNuRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU8sOERBQThEO0FBQ3JFLFdBQU8seUJBQXlCLFVBQVUsRUFBRTtBQUU1QyxvQkFBZ0I7QUFBQSxNQUNmLENBQUMsUUFBUTtBQUNSLGFBQUssUUFBUSxPQUFPLE1BQU0sSUFBSTtBQUM5QixxQkFBYTtBQUNiLGVBQU8sS0FBSyxHQUFHO0FBQ2YsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BRU47QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBbkZNLG9CQUVVLFdBQVcsSUFBSSxNQUFNLHdCQUF3QjtBQUY3RCxJQUFNLHFCQUFOO0FBcUZBLGdCQUFnQixrQkFBa0I7IiwKICAibmFtZXMiOiBbXQp9Cg==
