import assert from "assert";
import { getCleanPromptName, isPromptOrInstructionsFile } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../../base/common/uri.js";
suite("Prompt Constants", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getCleanPromptName", () => {
    test("returns a clean prompt name", () => {
      assert.strictEqual(
        getCleanPromptName(URI.file("/path/to/my-prompt.prompt.md")),
        "my-prompt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("../common.prompt.md")),
        "common"
      );
      const expectedPromptName = `some-3095`;
      assert.strictEqual(
        getCleanPromptName(URI.file(`./${expectedPromptName}.prompt.md`)),
        expectedPromptName
      );
      assert.strictEqual(
        getCleanPromptName(URI.file(".github/copilot-instructions.md")),
        "copilot-instructions"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("/etc/prompts/my-prompt")),
        "my-prompt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.file("../some-folder/frequent.txt")),
        "frequent.txt"
      );
      assert.strictEqual(
        getCleanPromptName(URI.parse("untitled:Untitled-1")),
        "Untitled-1"
      );
    });
  });
  suite("isPromptOrInstructionsFile", () => {
    test("returns `true` for prompt files", () => {
      assert(
        isPromptOrInstructionsFile(URI.file("/path/to/my-prompt.prompt.md"))
      );
      assert(
        isPromptOrInstructionsFile(URI.file("../common.prompt.md"))
      );
      assert(
        isPromptOrInstructionsFile(URI.file(`./some-38294.prompt.md`))
      );
      assert(
        isPromptOrInstructionsFile(URI.file(".github/copilot-instructions.md"))
      );
    });
    test("returns `false` for non-prompt files", () => {
      assert(
        !isPromptOrInstructionsFile(URI.file("/path/to/my-prompt.prompt.md1"))
      );
      assert(
        !isPromptOrInstructionsFile(URI.file("../common.md"))
      );
      assert(
        !isPromptOrInstructionsFile(URI.file(`./some-2530.txt`))
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25zdGFudHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGdldENsZWFuUHJvbXB0TmFtZSwgaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuXG5zdWl0ZSgnUHJvbXB0IENvbnN0YW50cycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldENsZWFuUHJvbXB0TmFtZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGEgY2xlYW4gcHJvbXB0IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldENsZWFuUHJvbXB0TmFtZShVUkkuZmlsZSgnL3BhdGgvdG8vbXktcHJvbXB0LnByb21wdC5tZCcpKSxcblx0XHRcdFx0J215LXByb21wdCcsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldENsZWFuUHJvbXB0TmFtZShVUkkuZmlsZSgnLi4vY29tbW9uLnByb21wdC5tZCcpKSxcblx0XHRcdFx0J2NvbW1vbicsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBleHBlY3RlZFByb21wdE5hbWUgPSBgc29tZS0zMDk1YDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q2xlYW5Qcm9tcHROYW1lKFVSSS5maWxlKGAuLyR7ZXhwZWN0ZWRQcm9tcHROYW1lfS5wcm9tcHQubWRgKSksXG5cdFx0XHRcdGV4cGVjdGVkUHJvbXB0TmFtZSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0Q2xlYW5Qcm9tcHROYW1lKFVSSS5maWxlKCcuZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJykpLFxuXHRcdFx0XHQnY29waWxvdC1pbnN0cnVjdGlvbnMnLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDbGVhblByb21wdE5hbWUoVVJJLmZpbGUoJy9ldGMvcHJvbXB0cy9teS1wcm9tcHQnKSksXG5cdFx0XHRcdCdteS1wcm9tcHQnLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRDbGVhblByb21wdE5hbWUoVVJJLmZpbGUoJy4uL3NvbWUtZm9sZGVyL2ZyZXF1ZW50LnR4dCcpKSxcblx0XHRcdFx0J2ZyZXF1ZW50LnR4dCcsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldENsZWFuUHJvbXB0TmFtZShVUkkucGFyc2UoJ3VudGl0bGVkOlVudGl0bGVkLTEnKSksXG5cdFx0XHRcdCdVbnRpdGxlZC0xJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGB0cnVlYCBmb3IgcHJvbXB0IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3BhdGgvdG8vbXktcHJvbXB0LnByb21wdC5tZCcpKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0aXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoJy4uL2NvbW1vbi5wcm9tcHQubWQnKSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKGAuL3NvbWUtMzgyOTQucHJvbXB0Lm1kYCkpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHRpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcpKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGBmYWxzZWAgZm9yIG5vbi1wcm9tcHQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdCFpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3BhdGgvdG8vbXktcHJvbXB0LnByb21wdC5tZDEnKSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQoXG5cdFx0XHRcdCFpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnLi4vY29tbW9uLm1kJykpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0KFxuXHRcdFx0XHQhaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoYC4vc29tZS0yNTMwLnR4dGApKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxvQkFBb0Isa0NBQWtDO0FBQy9ELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUdwQixNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssK0JBQStCLE1BQU07QUFDekMsYUFBTztBQUFBLFFBQ04sbUJBQW1CLElBQUksS0FBSyw4QkFBOEIsQ0FBQztBQUFBLFFBQzNEO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLEtBQUsscUJBQXFCLENBQUM7QUFBQSxRQUNsRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLHFCQUFxQjtBQUMzQixhQUFPO0FBQUEsUUFDTixtQkFBbUIsSUFBSSxLQUFLLEtBQUssa0JBQWtCLFlBQVksQ0FBQztBQUFBLFFBQ2hFO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLEtBQUssaUNBQWlDLENBQUM7QUFBQSxRQUM5RDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTixtQkFBbUIsSUFBSSxLQUFLLHdCQUF3QixDQUFDO0FBQUEsUUFDckQ7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sbUJBQW1CLElBQUksS0FBSyw2QkFBNkIsQ0FBQztBQUFBLFFBQzFEO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxRQUNOLG1CQUFtQixJQUFJLE1BQU0scUJBQXFCLENBQUM7QUFBQSxRQUNuRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDhCQUE4QixNQUFNO0FBQ3pDLFNBQUssbUNBQW1DLE1BQU07QUFDN0M7QUFBQSxRQUNDLDJCQUEyQixJQUFJLEtBQUssOEJBQThCLENBQUM7QUFBQSxNQUNwRTtBQUVBO0FBQUEsUUFDQywyQkFBMkIsSUFBSSxLQUFLLHFCQUFxQixDQUFDO0FBQUEsTUFDM0Q7QUFFQTtBQUFBLFFBQ0MsMkJBQTJCLElBQUksS0FBSyx3QkFBd0IsQ0FBQztBQUFBLE1BQzlEO0FBRUE7QUFBQSxRQUNDLDJCQUEyQixJQUFJLEtBQUssaUNBQWlDLENBQUM7QUFBQSxNQUN2RTtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssd0NBQXdDLE1BQU07QUFDbEQ7QUFBQSxRQUNDLENBQUMsMkJBQTJCLElBQUksS0FBSywrQkFBK0IsQ0FBQztBQUFBLE1BQ3RFO0FBRUE7QUFBQSxRQUNDLENBQUMsMkJBQTJCLElBQUksS0FBSyxjQUFjLENBQUM7QUFBQSxNQUNyRDtBQUVBO0FBQUEsUUFDQyxDQUFDLDJCQUEyQixJQUFJLEtBQUssaUJBQWlCLENBQUM7QUFBQSxNQUN4RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
