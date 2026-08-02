import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { isOrganizationPromptFile } from "../../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { mockService } from "./mock.js";
suite("promptsServiceUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isOrganizationPromptFile", () => {
    const CHAT_EXTENSION_ID = "github.copilot-chat";
    function createProductService(chatExtensionId) {
      return mockService({
        defaultChatAgent: chatExtensionId ? { chatExtensionId } : void 0
      });
    }
    test("returns false when no chatExtensionId is configured", () => {
      const uri = URI.file("/some/path/github/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(void 0);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when chatExtensionId is not configured"
      );
    });
    test("returns false when extension ID does not match", () => {
      const uri = URI.file("/some/path/github/prompt.md");
      const extensionId = new ExtensionIdentifier("some.other-extension");
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when extension ID does not match the built-in chat extension"
      );
    });
    test("returns false when path does not contain /github/", () => {
      const uri = URI.file("/some/path/to/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when path does not contain /github/"
      );
    });
    test("returns true when extension matches and path contains /github/", () => {
      const uri = URI.file("/some/path/github/prompts/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        true,
        "Should return true when extension matches and path contains /github/"
      );
    });
    test("extension ID comparison is case-insensitive", () => {
      const uri = URI.file("/some/github/prompt.md");
      const extensionId = new ExtensionIdentifier("GITHUB.COPILOT-CHAT");
      const productService = createProductService("github.copilot-chat");
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        true,
        "Extension ID comparison should be case-insensitive"
      );
    });
    test("returns false when defaultChatAgent exists but chatExtensionId is empty", () => {
      const uri = URI.file("/some/github/prompt.md");
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = mockService({
        defaultChatAgent: { chatExtensionId: "" }
      });
      assert.strictEqual(
        isOrganizationPromptFile(uri, extensionId, productService),
        false,
        "Should return false when chatExtensionId is empty string"
      );
    });
    test("returns false for similar but incorrect paths", () => {
      const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
      const productService = createProductService(CHAT_EXTENSION_ID);
      const invalidPaths = [
        "/some/githubs/prompt.md",
        // extra 's'
        "/some/github-org/prompt.md",
        // hyphenated
        "/some/mygithub/prompt.md",
        // prefix
        "/some/githubstuff/prompt.md",
        // suffix
        "/some/GITHUB/prompt.md",
        // uppercase (path matching is case-sensitive)
        "/some/Github/prompt.md"
        // mixed case
      ];
      for (const path of invalidPaths) {
        const uri = URI.file(path);
        assert.strictEqual(
          isOrganizationPromptFile(uri, extensionId, productService),
          false,
          `Should return false for path: ${path}`
        );
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdHNTZXJ2aWNlVXRpbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvdXRpbHMvcHJvbXB0c1NlcnZpY2VVdGlscy5qcyc7XG5pbXBvcnQgeyBtb2NrU2VydmljZSB9IGZyb20gJy4vbW9jay5qcyc7XG5cbnN1aXRlKCdwcm9tcHRzU2VydmljZVV0aWxzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnaXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IENIQVRfRVhURU5TSU9OX0lEID0gJ2dpdGh1Yi5jb3BpbG90LWNoYXQnO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlUHJvZHVjdFNlcnZpY2UoY2hhdEV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUHJvZHVjdFNlcnZpY2Uge1xuXHRcdFx0cmV0dXJuIG1vY2tTZXJ2aWNlPElQcm9kdWN0U2VydmljZT4oe1xuXHRcdFx0XHRkZWZhdWx0Q2hhdEFnZW50OiBjaGF0RXh0ZW5zaW9uSWQgPyB7IGNoYXRFeHRlbnNpb25JZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0fSBhcyBQYXJ0aWFsPElQcm9kdWN0U2VydmljZT4pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBubyBjaGF0RXh0ZW5zaW9uSWQgaXMgY29uZmlndXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2dpdGh1Yi9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBjcmVhdGVQcm9kdWN0U2VydmljZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSh1cmksIGV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIGNoYXRFeHRlbnNpb25JZCBpcyBub3QgY29uZmlndXJlZCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIGV4dGVuc2lvbiBJRCBkb2VzIG5vdCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvc29tZS9wYXRoL2dpdGh1Yi9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3NvbWUub3RoZXItZXh0ZW5zaW9uJyk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGNyZWF0ZVByb2R1Y3RTZXJ2aWNlKENIQVRfRVhURU5TSU9OX0lEKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc09yZ2FuaXphdGlvblByb21wdEZpbGUodXJpLCBleHRlbnNpb25JZCwgcHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0J1Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBleHRlbnNpb24gSUQgZG9lcyBub3QgbWF0Y2ggdGhlIGJ1aWx0LWluIGNoYXQgZXh0ZW5zaW9uJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gcGF0aCBkb2VzIG5vdCBjb250YWluIC9naXRodWIvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zb21lL3BhdGgvdG8vcHJvbXB0Lm1kJyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKENIQVRfRVhURU5TSU9OX0lEKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gY3JlYXRlUHJvZHVjdFNlcnZpY2UoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSh1cmksIGV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHQnU2hvdWxkIHJldHVybiBmYWxzZSB3aGVuIHBhdGggZG9lcyBub3QgY29udGFpbiAvZ2l0aHViLycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIHdoZW4gZXh0ZW5zaW9uIG1hdGNoZXMgYW5kIHBhdGggY29udGFpbnMgL2dpdGh1Yi8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3NvbWUvcGF0aC9naXRodWIvcHJvbXB0cy9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBjcmVhdGVQcm9kdWN0U2VydmljZShDSEFUX0VYVEVOU0lPTl9JRCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0aXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKHVyaSwgZXh0ZW5zaW9uSWQsIHByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0J1Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIGV4dGVuc2lvbiBtYXRjaGVzIGFuZCBwYXRoIGNvbnRhaW5zIC9naXRodWIvJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRlbnNpb24gSUQgY29tcGFyaXNvbiBpcyBjYXNlLWluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zb21lL2dpdGh1Yi9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ0dJVEhVQi5DT1BJTE9ULUNIQVQnKTtcblx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gY3JlYXRlUHJvZHVjdFNlcnZpY2UoJ2dpdGh1Yi5jb3BpbG90LWNoYXQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpc09yZ2FuaXphdGlvblByb21wdEZpbGUodXJpLCBleHRlbnNpb25JZCwgcHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQnRXh0ZW5zaW9uIElEIGNvbXBhcmlzb24gc2hvdWxkIGJlIGNhc2UtaW5zZW5zaXRpdmUnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiBkZWZhdWx0Q2hhdEFnZW50IGV4aXN0cyBidXQgY2hhdEV4dGVuc2lvbklkIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9zb21lL2dpdGh1Yi9wcm9tcHQubWQnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoQ0hBVF9FWFRFTlNJT05fSUQpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBtb2NrU2VydmljZTxJUHJvZHVjdFNlcnZpY2U+KHtcblx0XHRcdFx0ZGVmYXVsdENoYXRBZ2VudDogeyBjaGF0RXh0ZW5zaW9uSWQ6ICcnIH0sXG5cdFx0XHR9IGFzIFBhcnRpYWw8SVByb2R1Y3RTZXJ2aWNlPik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0aXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKHVyaSwgZXh0ZW5zaW9uSWQsIHByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdCdTaG91bGQgcmV0dXJuIGZhbHNlIHdoZW4gY2hhdEV4dGVuc2lvbklkIGlzIGVtcHR5IHN0cmluZycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3Igc2ltaWxhciBidXQgaW5jb3JyZWN0IHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihDSEFUX0VYVEVOU0lPTl9JRCk7XG5cdFx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGNyZWF0ZVByb2R1Y3RTZXJ2aWNlKENIQVRfRVhURU5TSU9OX0lEKTtcblxuXHRcdFx0Y29uc3QgaW52YWxpZFBhdGhzID0gW1xuXHRcdFx0XHQnL3NvbWUvZ2l0aHVicy9wcm9tcHQubWQnLCAgICAgIC8vIGV4dHJhICdzJ1xuXHRcdFx0XHQnL3NvbWUvZ2l0aHViLW9yZy9wcm9tcHQubWQnLCAgIC8vIGh5cGhlbmF0ZWRcblx0XHRcdFx0Jy9zb21lL215Z2l0aHViL3Byb21wdC5tZCcsICAgICAvLyBwcmVmaXhcblx0XHRcdFx0Jy9zb21lL2dpdGh1YnN0dWZmL3Byb21wdC5tZCcsICAvLyBzdWZmaXhcblx0XHRcdFx0Jy9zb21lL0dJVEhVQi9wcm9tcHQubWQnLCAgICAgICAvLyB1cHBlcmNhc2UgKHBhdGggbWF0Y2hpbmcgaXMgY2FzZS1zZW5zaXRpdmUpXG5cdFx0XHRcdCcvc29tZS9HaXRodWIvcHJvbXB0Lm1kJywgICAgICAgLy8gbWl4ZWQgY2FzZVxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXRoIG9mIGludmFsaWRQYXRocykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSh1cmksIGV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFx0YFNob3VsZCByZXR1cm4gZmFsc2UgZm9yIHBhdGg6ICR7cGF0aH1gLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUU1QixNQUFNLHVCQUF1QixNQUFNO0FBQ2xDLDBDQUF3QztBQUV4QyxRQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFVBQU0sb0JBQW9CO0FBRTFCLGFBQVMscUJBQXFCLGlCQUFzRDtBQUNuRixhQUFPLFlBQTZCO0FBQUEsUUFDbkMsa0JBQWtCLGtCQUFrQixFQUFFLGdCQUFnQixJQUFJO0FBQUEsTUFDM0QsQ0FBNkI7QUFBQSxJQUM5QjtBQUVBLFNBQUssdURBQXVELE1BQU07QUFDakUsWUFBTSxNQUFNLElBQUksS0FBSyw2QkFBNkI7QUFDbEQsWUFBTSxjQUFjLElBQUksb0JBQW9CLGlCQUFpQjtBQUM3RCxZQUFNLGlCQUFpQixxQkFBcUIsTUFBUztBQUVyRCxhQUFPO0FBQUEsUUFDTix5QkFBeUIsS0FBSyxhQUFhLGNBQWM7QUFBQSxRQUN6RDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFNLE1BQU0sSUFBSSxLQUFLLDZCQUE2QjtBQUNsRCxZQUFNLGNBQWMsSUFBSSxvQkFBb0Isc0JBQXNCO0FBQ2xFLFlBQU0saUJBQWlCLHFCQUFxQixpQkFBaUI7QUFFN0QsYUFBTztBQUFBLFFBQ04seUJBQXlCLEtBQUssYUFBYSxjQUFjO0FBQUEsUUFDekQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxNQUFNLElBQUksS0FBSyx5QkFBeUI7QUFDOUMsWUFBTSxjQUFjLElBQUksb0JBQW9CLGlCQUFpQjtBQUM3RCxZQUFNLGlCQUFpQixxQkFBcUIsaUJBQWlCO0FBRTdELGFBQU87QUFBQSxRQUNOLHlCQUF5QixLQUFLLGFBQWEsY0FBYztBQUFBLFFBQ3pEO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFlBQU0sTUFBTSxJQUFJLEtBQUsscUNBQXFDO0FBQzFELFlBQU0sY0FBYyxJQUFJLG9CQUFvQixpQkFBaUI7QUFDN0QsWUFBTSxpQkFBaUIscUJBQXFCLGlCQUFpQjtBQUU3RCxhQUFPO0FBQUEsUUFDTix5QkFBeUIsS0FBSyxhQUFhLGNBQWM7QUFBQSxRQUN6RDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxZQUFNLE1BQU0sSUFBSSxLQUFLLHdCQUF3QjtBQUM3QyxZQUFNLGNBQWMsSUFBSSxvQkFBb0IscUJBQXFCO0FBQ2pFLFlBQU0saUJBQWlCLHFCQUFxQixxQkFBcUI7QUFFakUsYUFBTztBQUFBLFFBQ04seUJBQXlCLEtBQUssYUFBYSxjQUFjO0FBQUEsUUFDekQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssMkVBQTJFLE1BQU07QUFDckYsWUFBTSxNQUFNLElBQUksS0FBSyx3QkFBd0I7QUFDN0MsWUFBTSxjQUFjLElBQUksb0JBQW9CLGlCQUFpQjtBQUM3RCxZQUFNLGlCQUFpQixZQUE2QjtBQUFBLFFBQ25ELGtCQUFrQixFQUFFLGlCQUFpQixHQUFHO0FBQUEsTUFDekMsQ0FBNkI7QUFFN0IsYUFBTztBQUFBLFFBQ04seUJBQXlCLEtBQUssYUFBYSxjQUFjO0FBQUEsUUFDekQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaURBQWlELE1BQU07QUFDM0QsWUFBTSxjQUFjLElBQUksb0JBQW9CLGlCQUFpQjtBQUM3RCxZQUFNLGlCQUFpQixxQkFBcUIsaUJBQWlCO0FBRTdELFlBQU0sZUFBZTtBQUFBLFFBQ3BCO0FBQUE7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUNBO0FBQUE7QUFBQSxRQUNBO0FBQUE7QUFBQSxNQUNEO0FBRUEsaUJBQVcsUUFBUSxjQUFjO0FBQ2hDLGNBQU0sTUFBTSxJQUFJLEtBQUssSUFBSTtBQUN6QixlQUFPO0FBQUEsVUFDTix5QkFBeUIsS0FBSyxhQUFhLGNBQWM7QUFBQSxVQUN6RDtBQUFBLFVBQ0EsaUNBQWlDLElBQUk7QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
