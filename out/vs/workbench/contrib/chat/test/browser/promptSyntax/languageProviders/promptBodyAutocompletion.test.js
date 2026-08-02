import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { CompletionTriggerKind } from "../../../../../../../editor/common/languages.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { PromptBodyAutocompletion } from "../../../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { getLanguageIdForPromptsType, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
suite("PromptBodyAutocompletion", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let completionProvider;
  setup(async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    instaService = workbenchInstantiationService({
      contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, disposables);
    instaService.stub(ILogService, new NullLogService());
    const fileService = disposables.add(instaService.createInstance(FileService));
    instaService.stub(IFileService, fileService);
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("test", fileSystemProvider));
    await fileService.createFolder(URI.parse("test:///workspace"));
    await fileService.createFolder(URI.parse("test:///workspace/src"));
    await fileService.createFolder(URI.parse("test:///workspace/docs"));
    await fileService.writeFile(URI.parse("test:///workspace/src/index.ts"), VSBuffer.fromString("export function hello() {}"));
    await fileService.writeFile(URI.parse("test:///workspace/README.md"), VSBuffer.fromString("# Project"));
    await fileService.writeFile(URI.parse("test:///workspace/package.json"), VSBuffer.fromString("{}"));
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    const myExtSource = { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("My.extension") };
    const testTool3 = { id: "testTool3", displayName: "tool3", canBeReferencedInPrompt: true, toolReferenceName: "tool3", modelDescription: "Test Tool 3", source: myExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool3));
    const prExtSource = { type: "extension", label: "GitHub Pull Request Extension", extensionId: new ExtensionIdentifier("github.vscode-pull-request-github") };
    const prExtTool1 = { id: "suggestFix", canBeReferencedInPrompt: true, toolReferenceName: "suggest-fix", modelDescription: "tool4", displayName: "Test Tool 4", source: prExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(prExtTool1));
    instaService.set(ILanguageModelToolsService, toolService);
    completionProvider = instaService.createInstance(PromptBodyAutocompletion);
  });
  async function getCompletions(content, line, column, promptType) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const model = disposables.add(createTextModel(content, languageId, void 0, URI.parse("test://workspace/test" + getPromptFileExtension(promptType))));
    const position = new Position(line, column);
    const context = { triggerKind: CompletionTriggerKind.Invoke };
    const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
    if (!result || !result.suggestions) {
      return [];
    }
    const lineContent = model.getLineContent(position.lineNumber);
    return result.suggestions.map((s) => {
      assert(s.range instanceof Range);
      return {
        label: s.label,
        result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
      };
    });
  }
  suite("prompt body completions", () => {
    test("default suggestions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "",
        "Use # to reference a file or tool.",
        "One more #to"
      ].join("\n");
      {
        const actual = await getCompletions(content, 5, 6, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "file:",
            result: "Use #file: to reference a file or tool."
          },
          {
            label: "tool:",
            result: "Use #tool: to reference a file or tool."
          }
        ]);
      }
      {
        const actual = await getCompletions(content, 6, 13, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "file:",
            result: "One more #file:"
          },
          {
            label: "tool:",
            result: "One more #tool:"
          }
        ]);
      }
    });
    test("tool suggestions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "",
        "Use #tool: to reference a tool."
      ].join("\n");
      {
        const actual = await getCompletions(content, 5, 11, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "vscode",
            result: "Use #tool:vscode to reference a tool."
          },
          {
            label: "execute",
            result: "Use #tool:execute to reference a tool."
          },
          {
            label: "read",
            result: "Use #tool:read to reference a tool."
          },
          {
            label: "agent",
            result: "Use #tool:agent to reference a tool."
          },
          {
            label: "tool1",
            result: "Use #tool:tool1 to reference a tool."
          },
          {
            label: "tool2",
            result: "Use #tool:tool2 to reference a tool."
          },
          {
            label: "my.extension/tool3",
            result: "Use #tool:my.extension/tool3 to reference a tool."
          },
          {
            label: "github.vscode-pull-request-github/suggest-fix",
            result: "Use #tool:github.vscode-pull-request-github/suggest-fix to reference a tool."
          }
        ]);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25UcmlnZ2VyS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdEJvZHlBdXRvY29tcGxldGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuXG5zdWl0ZSgnUHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbXBsZXRpb25Qcm92aWRlcjogUHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXHRcdGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVNlcnZpY2UpKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZpbGVTeXN0ZW1Qcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ3Rlc3QnLCBmaWxlU3lzdGVtUHJvdmlkZXIpKTtcblxuXHRcdC8vIENyZWF0ZSBzb21lIHRlc3QgZmlsZXMgYW5kIGRpcmVjdG9yaWVzXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2UnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2Uvc3JjJykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihVUkkucGFyc2UoJ3Rlc3Q6Ly8vd29ya3NwYWNlL2RvY3MnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2Uvc3JjL2luZGV4LnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2V4cG9ydCBmdW5jdGlvbiBoZWxsbygpIHt9JykpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkucGFyc2UoJ3Rlc3Q6Ly8vd29ya3NwYWNlL1JFQURNRS5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcjIFByb2plY3QnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2UvcGFja2FnZS5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ3t9JykpO1xuXG5cdFx0Y29uc3QgdG9vbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMSA9IHsgaWQ6ICd0ZXN0VG9vbDEnLCBkaXNwbGF5TmFtZTogJ3Rvb2wxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wxKSk7XG5cblx0XHRjb25zdCB0ZXN0VG9vbDIgPSB7IGlkOiAndGVzdFRvb2wyJywgZGlzcGxheU5hbWU6ICd0b29sMicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2wyJywgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDIpKTtcblxuXHRcdGNvbnN0IG15RXh0U291cmNlID0geyB0eXBlOiAnZXh0ZW5zaW9uJywgbGFiZWw6ICdNeSBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ015LmV4dGVuc2lvbicpIH0gc2F0aXNmaWVzIFRvb2xEYXRhU291cmNlO1xuXHRcdGNvbnN0IHRlc3RUb29sMyA9IHsgaWQ6ICd0ZXN0VG9vbDMnLCBkaXNwbGF5TmFtZTogJ3Rvb2wzJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIHRvb2xSZWZlcmVuY2VOYW1lOiAndG9vbDMnLCBtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDMnLCBzb3VyY2U6IG15RXh0U291cmNlLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRlc3RUb29sMykpO1xuXG5cdFx0Y29uc3QgcHJFeHRTb3VyY2UgPSB7IHR5cGU6ICdleHRlbnNpb24nLCBsYWJlbDogJ0dpdEh1YiBQdWxsIFJlcXVlc3QgRXh0ZW5zaW9uJywgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWInKSB9IHNhdGlzZmllcyBUb29sRGF0YVNvdXJjZTtcblx0XHRjb25zdCBwckV4dFRvb2wxID0geyBpZDogJ3N1Z2dlc3RGaXgnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICdzdWdnZXN0LWZpeCcsIG1vZGVsRGVzY3JpcHRpb246ICd0b29sNCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sIDQnLCBzb3VyY2U6IHByRXh0U291cmNlLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHByRXh0VG9vbDEpKTtcblxuXHRcdGluc3RhU2VydmljZS5zZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHRvb2xTZXJ2aWNlKTtcblxuXHRcdGNvbXBsZXRpb25Qcm92aWRlciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24pO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBnZXRDb21wbGV0aW9ucyhjb250ZW50OiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHByb21wdFR5cGU6IFByb21wdHNUeXBlKSB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZShwcm9tcHRUeXBlKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCwgbGFuZ3VhZ2VJZCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6Ly93b3Jrc3BhY2UvdGVzdCcgKyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKHByb21wdFR5cGUpKSkpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmUsIGNvbHVtbik7XG5cdFx0Y29uc3QgY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQgPSB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcGxldGlvblByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIHBvc2l0aW9uLCBjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIXJlc3VsdCB8fCAhcmVzdWx0LnN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHJlc3VsdC5zdWdnZXN0aW9ucy5tYXAocyA9PiB7XG5cdFx0XHRhc3NlcnQocy5yYW5nZSBpbnN0YW5jZW9mIFJhbmdlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBzLmxhYmVsLFxuXHRcdFx0XHRyZXN1bHQ6IGxpbmVDb250ZW50LnN1YnN0cmluZygwLCBzLnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSkgKyBzLmluc2VydFRleHQgKyBsaW5lQ29udGVudC5zdWJzdHJpbmcocy5yYW5nZS5lbmRDb2x1bW4gLSAxKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHN1aXRlKCdwcm9tcHQgYm9keSBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdkZWZhdWx0IHN1Z2dlc3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdVc2UgIyB0byByZWZlcmVuY2UgYSBmaWxlIG9yIHRvb2wuJyxcblx0XHRcdFx0J09uZSBtb3JlICN0bydcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gKGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIDUsIDYsIFByb21wdHNUeXBlLnByb21wdCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnZmlsZTonLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnVXNlICNmaWxlOiB0byByZWZlcmVuY2UgYSBmaWxlIG9yIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd0b29sOicsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6IHRvIHJlZmVyZW5jZSBhIGZpbGUgb3IgdG9vbC4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gKGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIDYsIDEzLCBQcm9tcHRzVHlwZS5wcm9tcHQpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2ZpbGU6Jyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ09uZSBtb3JlICNmaWxlOidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAndG9vbDonLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnT25lIG1vcmUgI3Rvb2w6J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sIHN1Z2dlc3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdVc2UgI3Rvb2w6IHRvIHJlZmVyZW5jZSBhIHRvb2wuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IChhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCA1LCAxMSwgUHJvbXB0c1R5cGUucHJvbXB0KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd2c2NvZGUnLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnVXNlICN0b29sOnZzY29kZSB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnZXhlY3V0ZScsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6ZXhlY3V0ZSB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAncmVhZCcsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6cmVhZCB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnYWdlbnQnLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnVXNlICN0b29sOmFnZW50IHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd0b29sMScsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6dG9vbDEgdG8gcmVmZXJlbmNlIGEgdG9vbC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ3Rvb2wyJyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDp0b29sMiB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnbXkuZXh0ZW5zaW9uL3Rvb2wzJyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDpteS5leHRlbnNpb24vdG9vbDMgdG8gcmVmZXJlbmNlIGEgdG9vbC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yi9zdWdnZXN0LWZpeCcsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6Z2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL3N1Z2dlc3QtZml4IHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIsNkJBQTZCO0FBQ3pELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMseUJBQXlCO0FB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
