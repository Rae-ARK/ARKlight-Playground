import * as assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ResourceMap } from "../../../../../../../base/common/map.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { testWorkspace } from "../../../../../../../platform/workspace/test/common/testWorkspace.js";
import { FetchWebPageTool } from "../../../../electron-browser/builtInTools/fetchPageTool.js";
import { TestContextService, TestFileService } from "../../../../../../test/common/workbenchTestServices.js";
import { MockTrustedDomainService } from "../../../../../url/test/browser/mockTrustedDomainService.js";
import { InternalFetchWebPageToolId } from "../../../../common/tools/builtinTools/tools.js";
import { MockChatService } from "../../../common/chatService/mockChatService.js";
import { upcastDeepPartial } from "../../../../../../../base/test/common/mock.js";
import { LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import { Event } from "../../../../../../../base/common/event.js";
class TestWebContentExtractorService {
  constructor(uriToContentMap) {
    this.uriToContentMap = uriToContentMap;
  }
  async extract(uris) {
    return uris.map((uri) => {
      const content = this.uriToContentMap.get(uri);
      if (content === void 0) {
        throw new Error(`No content configured for URI: ${uri.toString()}`);
      }
      return { status: "ok", result: content };
    });
  }
}
class ExtendedTestFileService extends TestFileService {
  constructor(uriToContentMap) {
    super();
    this.uriToContentMap = uriToContentMap;
  }
  async readFile(resource, options) {
    const content = this.uriToContentMap.get(resource);
    if (content === void 0) {
      throw new Error(`File not found: ${resource.toString()}`);
    }
    const buffer = typeof content === "string" ? VSBuffer.fromString(content) : content;
    return {
      resource,
      value: buffer,
      name: "",
      size: buffer.byteLength,
      etag: "",
      mtime: 0,
      ctime: 0,
      readonly: false,
      locked: false,
      executable: false
    };
  }
  async stat(resource) {
    if (!this.uriToContentMap.has(resource)) {
      throw new Error(`File not found: ${resource.toString()}`);
    }
    return super.stat(resource);
  }
}
class MockAgentNetworkFilterService {
  constructor() {
    this.onDidChange = Event.None;
  }
  isUriAllowed(_uri) {
    return true;
  }
  formatError(uri) {
    return `Access to ${uri.authority} is blocked by network domain policy.`;
  }
}
suite("FetchWebPageTool", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should handle http/https via web content extractor and other schemes via file service", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://example.com"), "HTTPS content"],
      [URI.parse("http://example.com"), "HTTP content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://static/resource/50"), "MCP resource content"],
      [URI.parse("mcp-resource://746573742D736572766572/custom/hello/world.txt"), "Custom MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const testUrls = [
      "https://example.com",
      "http://example.com",
      "test://static/resource/50",
      "mcp-resource://746573742D736572766572/custom/hello/world.txt",
      "file:///path/to/nonexistent",
      "ftp://example.com",
      "invalid-url"
    ];
    const result = await tool.invoke(
      { callId: "test-call-1", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 7, "Should have result for each input URL");
    assert.strictEqual(result.content[0].value, "HTTPS content", "HTTPS URL should return content");
    assert.strictEqual(result.content[1].value, "HTTP content", "HTTP URL should return content");
    assert.strictEqual(result.content[2].value, "MCP resource content", "test:// URL should return content from file service");
    assert.strictEqual(result.content[3].value, "Custom MCP content", "mcp-resource:// URL should return content from file service");
    assert.strictEqual(result.content[4].value, "Invalid URL", "Nonexistent file should be invalid");
    assert.strictEqual(result.content[5].value, "Invalid URL", "ftp:// URL should be invalid");
    assert.strictEqual(result.content[6].value, "Invalid URL", "Invalid URL should be invalid");
    assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 4, "Should have 4 valid URLs in toolResultDetails");
  });
  test("should handle empty and undefined URLs", async () => {
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(new ResourceMap()),
      new MockTrustedDomainService([]),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const emptyResult = await tool.invoke(
      { callId: "test-call-2", toolId: "fetch-page", parameters: { urls: [] }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(emptyResult.content.length, 1, "Empty array should return single message");
    assert.strictEqual(emptyResult.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
    const undefinedResult = await tool.invoke(
      { callId: "test-call-3", toolId: "fetch-page", parameters: {}, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(undefinedResult.content.length, 1, "Undefined URLs should return single message");
    assert.strictEqual(undefinedResult.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
    const invalidResult = await tool.invoke(
      { callId: "test-call-4", toolId: "fetch-page", parameters: { urls: ["", " ", "invalid-scheme-that-fileservice-cannot-handle://test"] }, context: void 0 },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(invalidResult.content.length, 3, "Should have result for each invalid URL");
    assert.strictEqual(invalidResult.content[0].value, "Invalid URL", "Empty string should be invalid");
    assert.strictEqual(invalidResult.content[1].value, "Invalid URL", "Space-only string should be invalid");
    assert.strictEqual(invalidResult.content[2].value, "Invalid URL", "Unhandleable scheme should be invalid");
  });
  test("should provide correct past tense messages for mixed valid/invalid URLs", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://valid.com"), "Valid content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://valid/resource"), "Valid MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://valid.com", "test://valid/resource", "invalid://invalid"] }, toolCallId: "test-call-1", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.pastTenseMessage, "Should have past tense message");
    const messageText = typeof preparation.pastTenseMessage === "string" ? preparation.pastTenseMessage : preparation.pastTenseMessage.value;
    assert.ok(messageText.includes("Fetched"), "Should mention fetched resources");
    assert.ok(messageText.includes("invalid://invalid"), "Should mention invalid URL");
  });
  test("should not show confirmation dialog for file URIs inside the workspace", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"],
      [URI.file("/workspaceRoot/subdir/notes.txt"), "Notes content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/workspaceRoot/plan.md").toString()] }, toolCallId: "test-file-in-ws", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "File inside workspace should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "File inside workspace should not require post-confirmation");
  });
  test("should show confirmation dialog for file URIs outside the workspace", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/tmp/external-plan.md"), "External plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/tmp/external-plan.md").toString()] }, toolCallId: "test-file-outside-ws", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "File outside workspace should show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "File outside workspace should require post-confirmation");
  });
  test("file URI that traverses out of the workspace requires confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/etc/secret.txt"), "secret content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///workspaceRoot/../../etc/secret.txt"] }, toolCallId: "test-file-traversal", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Traversal escaping the workspace should show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Traversal escaping the workspace should require post-confirmation");
  });
  test("file URI with `..` that stays inside the workspace still skips confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///workspaceRoot/subdir/../plan.md"] }, toolCallId: "test-file-inside-traversal", chatSessionResource: void 0 },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "In-workspace file (after normalization) should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "In-workspace file should not require post-confirmation");
  });
  test("workspace file mixed with untrusted web URI: only web URI triggers confirmation", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const webContentMap = new ResourceMap([
      [URI.parse("https://example.com"), "Web content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.file("/workspaceRoot/plan.md"), "Plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      // No trusted domains
      new MockChatService(),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      {
        parameters: { urls: ["https://example.com", URI.file("/workspaceRoot/plan.md").toString()] },
        toolCallId: "test-mixed",
        chatSessionResource: void 0
      },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Should show confirmation for untrusted web URI");
    const msgValue = typeof preparation.confirmationMessages?.message === "string" ? preparation.confirmationMessages.message : preparation.confirmationMessages?.message?.value ?? "";
    assert.ok(!msgValue.includes("/workspaceRoot/"), "Confirmation message should not mention workspace file");
    assert.ok(msgValue.includes("example.com"), "Confirmation message should mention web URI");
  });
  test("should approve when all URLs were mentioned in chat", async () => {
    const webContentMap = new ResourceMap([
      [URI.parse("https://valid.com"), "Valid content"]
    ]);
    const fileContentMap = new ResourceMap([
      [URI.parse("test://valid/resource"), "Valid MCP content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(webContentMap),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "fetch https://example.com"
              }
            }]
          };
        }
      }),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation1 = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://example.com"] }, toolCallId: "test-call-2", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation1, "Should return prepared invocation");
    assert.strictEqual(preparation1.confirmationMessages?.title, void 0);
    const preparation2 = await tool.prepareToolInvocation(
      { parameters: { urls: ["https://other.com"] }, toolCallId: "test-call-3", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation2, "Should return prepared invocation");
    assert.ok(preparation2.confirmationMessages?.title);
  });
  test("should require confirmation for a file URI embedded inside a pasted web URL", async () => {
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///home/victim/.ssh/id_rsa"), "secret key"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "fetch https://attacker.example/p.html?u=file:///home/victim/.ssh/id_rsa"
              }
            }]
          };
        }
      }),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///home/victim/.ssh/id_rsa"] }, toolCallId: "test-call-injection", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Embedded file URI should still show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Embedded file URI should still require post-confirmation");
  });
  test("should auto-approve a standalone out-of-workspace file URI the user pasted", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/tmp/external-plan.md"), "External plan content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "please fetch (file:///tmp/external-plan.md) for me"
              }
            }]
          };
        }
      }),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: [URI.file("/tmp/external-plan.md").toString()] }, toolCallId: "test-call-standalone-file", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.strictEqual(preparation.confirmationMessages?.title, void 0, "Explicitly referenced file URI should not show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, "Explicitly referenced file URI should not require post-confirmation");
  });
  test("should require confirmation when a prior message only mentions a bare (scheme-less) path", async () => {
    const workspaceRoot = URI.file("/workspaceRoot");
    const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
    const fileContentMap = new ResourceMap([
      [URI.file("/etc/secret.txt"), "secret content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService([]),
      upcastDeepPartial({
        getSession: () => {
          return {
            getRequests: () => [{
              message: {
                text: "the config lives at /etc/secret.txt on the box"
              }
            }]
          };
        }
      }),
      workspaceContextService,
      new MockAgentNetworkFilterService()
    );
    const preparation = await tool.prepareToolInvocation(
      { parameters: { urls: ["file:///etc/secret.txt"] }, toolCallId: "test-call-bare-path", chatSessionResource: LocalChatSessionUri.forSession("a") },
      CancellationToken.None
    );
    assert.ok(preparation, "Should return prepared invocation");
    assert.ok(preparation.confirmationMessages?.title, "Bare path mention should still show confirmation dialog");
    assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, "Bare path mention should still require post-confirmation");
  });
  test("should return message for binary files indicating they are not supported", async () => {
    const binaryContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const binaryBuffer = VSBuffer.wrap(binaryContent);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///path/to/binary.dat"), binaryBuffer],
      [URI.parse("file:///path/to/text.txt"), "This is text content"]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-call-binary",
        toolId: "fetch-page",
        parameters: { urls: ["file:///path/to/binary.dat", "file:///path/to/text.txt"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 2, "Should have 2 results");
    assert.strictEqual(result.content[0].kind, "text", "Binary file should return text part");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, "Binary files are not supported at the moment.", "Should return not supported message");
    }
    assert.strictEqual(result.content[1].kind, "text", "Text file should return text part");
    if (result.content[1].kind === "text") {
      assert.strictEqual(result.content[1].value, "This is text content", "Should return text content");
    }
    assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 2, "Should have 2 valid URLs in toolResultDetails");
  });
  test("PNG files are now supported as image data parts (regression test)", async () => {
    const binaryContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const binaryBuffer = VSBuffer.wrap(binaryContent);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///path/to/image.png"), binaryBuffer]
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-png-support",
        toolId: "fetch-page",
        parameters: { urls: ["file:///path/to/image.png"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 1, "Should have 1 result");
    assert.strictEqual(result.content[0].kind, "data", "PNG file should return data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "Should have PNG MIME type");
      assert.strictEqual(result.content[0].value.data, binaryBuffer, "Should have correct binary data");
    }
  });
  test("should correctly distinguish between binary and text content", async () => {
    const jsonData = '{"name": "test", "value": 123}';
    const realBinaryData = new Uint8Array([137, 80, 78, 71, 0, 0, 0, 13, 255, 0, 171]);
    const fileContentMap = new ResourceMap([
      [URI.parse("file:///data.json"), jsonData],
      // Should be detected as text
      [URI.parse("file:///binary.dat"), VSBuffer.wrap(realBinaryData)]
      // Should be detected as binary
    ]);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-distinguish",
        toolId: "fetch-page",
        parameters: { urls: ["file:///data.json", "file:///binary.dat"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "text", "JSON should be detected as text");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, jsonData, "Should return JSON as text");
    }
    assert.strictEqual(result.content[1].kind, "text", "Binary content should return text part with message");
    if (result.content[1].kind === "text") {
      assert.strictEqual(result.content[1].value, "Binary files are not supported at the moment.", "Should return not supported message");
    }
  });
  test("Supported image files are returned as data parts", async () => {
    const pngData = VSBuffer.fromString("fake PNG data");
    const jpegData = VSBuffer.fromString("fake JPEG data");
    const gifData = VSBuffer.fromString("fake GIF data");
    const webpData = VSBuffer.fromString("fake WebP data");
    const bmpData = VSBuffer.fromString("fake BMP data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///image.png"), pngData);
    fileContentMap.set(URI.parse("file:///photo.jpg"), jpegData);
    fileContentMap.set(URI.parse("file:///animation.gif"), gifData);
    fileContentMap.set(URI.parse("file:///modern.webp"), webpData);
    fileContentMap.set(URI.parse("file:///bitmap.bmp"), bmpData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-images",
        toolId: "fetch-page",
        parameters: { urls: ["file:///image.png", "file:///photo.jpg", "file:///animation.gif", "file:///modern.webp", "file:///bitmap.bmp"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content.length, 5, "Should have 5 results");
    assert.strictEqual(result.content[0].kind, "data", "PNG should be data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "PNG should have correct MIME type");
      assert.strictEqual(result.content[0].value.data, pngData, "PNG should have correct data");
    }
    assert.strictEqual(result.content[1].kind, "data", "JPEG should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/jpeg", "JPEG should have correct MIME type");
      assert.strictEqual(result.content[1].value.data, jpegData, "JPEG should have correct data");
    }
    assert.strictEqual(result.content[2].kind, "data", "GIF should be data part");
    if (result.content[2].kind === "data") {
      assert.strictEqual(result.content[2].value.mimeType, "image/gif", "GIF should have correct MIME type");
      assert.strictEqual(result.content[2].value.data, gifData, "GIF should have correct data");
    }
    assert.strictEqual(result.content[3].kind, "data", "WebP should be data part");
    if (result.content[3].kind === "data") {
      assert.strictEqual(result.content[3].value.mimeType, "image/webp", "WebP should have correct MIME type");
      assert.strictEqual(result.content[3].value.data, webpData, "WebP should have correct data");
    }
    assert.strictEqual(result.content[4].kind, "data", "BMP should be data part");
    if (result.content[4].kind === "data") {
      assert.strictEqual(result.content[4].value.mimeType, "image/bmp", "BMP should have correct MIME type");
      assert.strictEqual(result.content[4].value.data, bmpData, "BMP should have correct data");
    }
  });
  test("Mixed image and text files work correctly", async () => {
    const textData = "This is some text content";
    const imageData = VSBuffer.fromString("fake image data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///text.txt"), textData);
    fileContentMap.set(URI.parse("file:///image.png"), imageData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-mixed",
        toolId: "fetch-page",
        parameters: { urls: ["file:///text.txt", "file:///image.png"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "text", "Text file should be text part");
    if (result.content[0].kind === "text") {
      assert.strictEqual(result.content[0].value, textData, "Text should have correct content");
    }
    assert.strictEqual(result.content[1].kind, "data", "Image file should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/png", "Image should have correct MIME type");
      assert.strictEqual(result.content[1].value.data, imageData, "Image should have correct data");
    }
  });
  test("Case insensitive image extensions work", async () => {
    const imageData = VSBuffer.fromString("fake image data");
    const fileContentMap = new ResourceMap();
    fileContentMap.set(URI.parse("file:///image.PNG"), imageData);
    fileContentMap.set(URI.parse("file:///photo.JPEG"), imageData);
    const tool = new FetchWebPageTool(
      new TestWebContentExtractorService(new ResourceMap()),
      new ExtendedTestFileService(fileContentMap),
      new MockTrustedDomainService(),
      new MockChatService(),
      new TestContextService(),
      new MockAgentNetworkFilterService()
    );
    const result = await tool.invoke(
      {
        callId: "test-case",
        toolId: "fetch-page",
        parameters: { urls: ["file:///image.PNG", "file:///photo.JPEG"] },
        context: void 0
      },
      () => Promise.resolve(0),
      { report: () => {
      } },
      CancellationToken.None
    );
    assert.strictEqual(result.content[0].kind, "data", "PNG with uppercase extension should be data part");
    if (result.content[0].kind === "data") {
      assert.strictEqual(result.content[0].value.mimeType, "image/png", "Should have correct MIME type");
    }
    assert.strictEqual(result.content[1].kind, "data", "JPEG with uppercase extension should be data part");
    if (result.content[1].kind === "data") {
      assert.strictEqual(result.content[1].value.mimeType, "image/jpeg", "Should have correct MIME type");
    }
  });
  suite("toolResultDetails", () => {
    test("should include only successfully fetched URIs in correct order", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success1.com"), "Content 1"],
        [URI.parse("https://success2.com"), "Content 2"]
      ]);
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///success.txt"), "File content"],
        [URI.parse("mcp-resource://server/file.txt"), "MCP content"]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://success1.com",
        // index 0 - should be in toolResultDetails
        "invalid-url",
        // index 1 - should NOT be in toolResultDetails
        "file:///success.txt",
        // index 2 - should be in toolResultDetails
        "https://success2.com",
        // index 3 - should be in toolResultDetails
        "file:///nonexistent.txt",
        // index 4 - should NOT be in toolResultDetails
        "mcp-resource://server/file.txt"
        // index 5 - should be in toolResultDetails
      ];
      const result = await tool.invoke(
        { callId: "test-details", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 4, "Should have 4 successful URIs");
      const uriDetails = result.toolResultDetails;
      assert.ok(uriDetails.every((uri) => uri instanceof URI), "All toolResultDetails entries should be URI objects");
      const expectedUris = [
        "https://success1.com/",
        "https://success2.com/",
        "file:///success.txt",
        "mcp-resource://server/file.txt"
      ];
      const actualUriStrings = uriDetails.map((uri) => uri.toString());
      assert.deepStrictEqual(actualUriStrings.sort(), expectedUris.sort(), "Should contain exactly the expected successful URIs");
      assert.strictEqual(result.content.length, 6, "Content should have result for each input URL");
      assert.strictEqual(result.content[0].value, "Content 1", "First web URI content");
      assert.strictEqual(result.content[1].value, "Invalid URL", "Invalid URL marked as invalid");
      assert.strictEqual(result.content[2].value, "File content", "File URI content");
      assert.strictEqual(result.content[3].value, "Content 2", "Second web URI content");
      assert.strictEqual(result.content[4].value, "Invalid URL", "Nonexistent file marked as invalid");
      assert.strictEqual(result.content[5].value, "MCP content", "MCP resource content");
    });
    test("should exclude failed web requests from toolResultDetails", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success.com"), "Success content"]
        // https://failure.com not in map - will throw error
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://success.com",
        // Should succeed
        "https://failure.com"
        // Should fail (not in content map)
      ];
      try {
        await tool.invoke(
          { callId: "test-web-failure", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
          () => Promise.resolve(0),
          { report: () => {
          } },
          CancellationToken.None
        );
        assert.fail("Expected test web content extractor to throw for missing URI");
      } catch (error) {
        assert.ok(error.message.includes("No content configured for URI"), "Should throw for unconfigured URI");
      }
    });
    test("should exclude failed file reads from toolResultDetails", async () => {
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///existing.txt"), "File exists"]
        // file:///missing.txt not in map - will throw error
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "file:///existing.txt",
        // Should succeed
        "file:///missing.txt"
        // Should fail (not in file map)
      ];
      const result = await tool.invoke(
        { callId: "test-file-failure", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 1, "Should have only 1 successful URI");
      const uriDetails = result.toolResultDetails;
      assert.strictEqual(uriDetails[0].toString(), "file:///existing.txt", "Should contain only the successful file URI");
      assert.strictEqual(result.content.length, 2, "Should have results for both input URLs");
      assert.strictEqual(result.content[0].value, "File exists", "First file should have content");
      assert.strictEqual(result.content[1].value, "Invalid URL", "Second file should be marked invalid");
    });
    test("should handle mixed success and failure scenarios", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://web-success.com"), "Web success"]
      ]);
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///file-success.txt"), "File success"],
        [URI.parse("mcp-resource://good/file.txt"), VSBuffer.fromString("MCP binary content")]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(webContentMap),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "invalid-scheme://bad",
        // Invalid URI
        "https://web-success.com",
        // Web success
        "file:///file-missing.txt",
        // File failure
        "file:///file-success.txt",
        // File success
        "completely-invalid-url",
        // Invalid URL format
        "mcp-resource://good/file.txt"
        // MCP success
      ];
      const result = await tool.invoke(
        { callId: "test-mixed", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 3, "Should have 3 successful URIs");
      const uriDetails = result.toolResultDetails;
      const actualUriStrings = uriDetails.map((uri) => uri.toString());
      const expectedSuccessful = [
        "https://web-success.com/",
        "file:///file-success.txt",
        "mcp-resource://good/file.txt"
      ];
      assert.deepStrictEqual(actualUriStrings.sort(), expectedSuccessful.sort(), "Should contain exactly the successful URIs");
      assert.strictEqual(result.content.length, 6, "Should have results for all input URLs");
      assert.strictEqual(result.content[0].value, "Invalid URL", "Invalid scheme marked as invalid");
      assert.strictEqual(result.content[1].value, "Web success", "Web success content");
      assert.strictEqual(result.content[2].value, "Invalid URL", "Missing file marked as invalid");
      assert.strictEqual(result.content[3].value, "File success", "File success content");
      assert.strictEqual(result.content[4].value, "Invalid URL", "Invalid URL marked as invalid");
      assert.strictEqual(result.content[5].value, "MCP binary content", "MCP success content");
    });
    test("should return empty toolResultDetails when all requests fail", async () => {
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        // Empty - all web requests fail
        new ExtendedTestFileService(new ResourceMap()),
        // Empty - all file ,
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const testUrls = [
        "https://nonexistent.com",
        "file:///missing.txt",
        "invalid-url",
        "bad://scheme"
      ];
      try {
        const result = await tool.invoke(
          { callId: "test-all-fail", toolId: "fetch-page", parameters: { urls: testUrls }, context: void 0 },
          () => Promise.resolve(0),
          { report: () => {
          } },
          CancellationToken.None
        );
        assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
        assert.strictEqual(result.toolResultDetails.length, 0, "Should have no successful URIs");
        assert.strictEqual(result.content.length, 4, "Should have results for all input URLs");
        assert.ok(result.content.every((content) => content.value === "Invalid URL"), "All content should be marked as invalid");
      } catch (error) {
        assert.ok(error.message.includes("No content configured for URI"), "Should throw for unconfigured URI");
      }
    });
    test("should handle empty URL array", async () => {
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService([]),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-empty", toolId: "fetch-page", parameters: { urls: [] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1, "Should have one content item for empty URLs");
      assert.strictEqual(result.content[0].value, "No valid URLs provided.", "Should indicate no valid URLs");
      assert.ok(!result.toolResultDetails, "toolResultDetails should not be present for empty URLs");
    });
    test("should handle image files in toolResultDetails", async () => {
      const imageBuffer = VSBuffer.fromString("fake-png-data");
      const fileContentMap = new ResourceMap([
        [URI.parse("file:///image.png"), imageBuffer],
        [URI.parse("file:///document.txt"), "Text content"]
      ]);
      const tool = new FetchWebPageTool(
        new TestWebContentExtractorService(new ResourceMap()),
        new ExtendedTestFileService(fileContentMap),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-images", toolId: "fetch-page", parameters: { urls: ["file:///image.png", "file:///document.txt"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.ok(Array.isArray(result.toolResultDetails), "toolResultDetails should be an array");
      assert.strictEqual(result.toolResultDetails.length, 2, "Should have 2 successful file URIs");
      const uriDetails = result.toolResultDetails;
      assert.strictEqual(uriDetails[0].toString(), "file:///image.png", "Should include image file");
      assert.strictEqual(uriDetails[1].toString(), "file:///document.txt", "Should include text file");
      assert.strictEqual(result.content[0].kind, "data", "Image should be data part");
      assert.strictEqual(result.content[1].kind, "text", "Text file should be text part");
    });
    test("confirmResults is false when all web contents are errors or redirects", async () => {
      const webContentMap = new ResourceMap();
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return uris.map(() => ({ status: "error", error: "Failed to fetch" }));
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, false, "confirmResults should be false when all results are errors");
    });
    test("confirmResults is false when all web contents are redirects", async () => {
      const webContentMap = new ResourceMap();
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return uris.map(() => ({ status: "redirect", toURI: URI.parse("https://redirected.com") }));
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, false, "confirmResults should be false when all results are redirects");
    });
    test("confirmResults is undefined when at least one web content succeeds", async () => {
      const webContentMap = new ResourceMap([
        [URI.parse("https://success.com"), "Success content"]
      ]);
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(webContentMap);
          }
          async extract(uris) {
            return [
              { status: "ok", result: "Success content" },
              { status: "error", error: "Failed" }
            ];
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://success.com", "https://error.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.confirmResults, void 0, "confirmResults should be undefined when at least one result succeeds");
    });
    test("redirect result provides correct message with new URL", async () => {
      const redirectURI = URI.parse("https://redirected.com/page");
      const tool = new FetchWebPageTool(
        new class extends TestWebContentExtractorService {
          constructor() {
            super(new ResourceMap());
          }
          async extract(uris) {
            return [{ status: "redirect", toURI: redirectURI }];
          }
        }(),
        new ExtendedTestFileService(new ResourceMap()),
        new MockTrustedDomainService(),
        new MockChatService(),
        new TestContextService(),
        new MockAgentNetworkFilterService()
      );
      const result = await tool.invoke(
        { callId: "test-call", toolId: "fetch-page", parameters: { urls: ["https://example.com"] }, context: void 0 },
        () => Promise.resolve(0),
        { report: () => {
        } },
        CancellationToken.None
      );
      assert.strictEqual(result.content.length, 1);
      assert.strictEqual(result.content[0].kind, "text");
      if (result.content[0].kind === "text") {
        assert.ok(result.content[0].value.includes(redirectURI.toString(true)), "Redirect message should include target URL");
        assert.ok(result.content[0].value.includes(InternalFetchWebPageToolId), "Redirect message should suggest using tool again");
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9lbGVjdHJvbi1icm93c2VyL3Rvb2xzL2J1aWx0aW5Ub29scy9mZXRjaFBhZ2VUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlQ29udGVudCwgSVJlYWRGaWxlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsIFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9jb21tb24vd2ViQ29udGVudEV4dHJhY3Rvci5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRmV0Y2hXZWJQYWdlVG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VsZWN0cm9uLWJyb3dzZXIvYnVpbHRJblRvb2xzL2ZldGNoUGFnZVRvb2wuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdXJsL3Rlc3QvYnJvd3Nlci9tb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3Rvb2xzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdXBjYXN0RGVlcFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuXG5jbGFzcyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgaW1wbGVtZW50cyBJV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB1cmlUb0NvbnRlbnRNYXA6IFJlc291cmNlTWFwPHN0cmluZz4pIHsgfVxuXG5cdGFzeW5jIGV4dHJhY3QodXJpczogVVJJW10pOiBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0W10+IHtcblx0XHRyZXR1cm4gdXJpcy5tYXAodXJpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLnVyaVRvQ29udGVudE1hcC5nZXQodXJpKTtcblx0XHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBjb250ZW50IGNvbmZpZ3VyZWQgZm9yIFVSSTogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHN0YXR1czogJ29rJywgcmVzdWx0OiBjb250ZW50IH07XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UgZXh0ZW5kcyBUZXN0RmlsZVNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHVyaVRvQ29udGVudE1hcDogUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZEZpbGVPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJRmlsZUNvbnRlbnQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gdGhpcy51cmlUb0NvbnRlbnRNYXAuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZpbGUgbm90IGZvdW5kOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVmZmVyID0gdHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnID8gVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSA6IGNvbnRlbnQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dmFsdWU6IGJ1ZmZlcixcblx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0c2l6ZTogYnVmZmVyLmJ5dGVMZW5ndGgsXG5cdFx0XHRldGFnOiAnJyxcblx0XHRcdG10aW1lOiAwLFxuXHRcdFx0Y3RpbWU6IDAsXG5cdFx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdFx0ZXhlY3V0YWJsZTogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKSB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHJlc291cmNlIGV4aXN0cyBpbiBvdXIgbWFwXG5cdFx0aWYgKCF0aGlzLnVyaVRvQ29udGVudE1hcC5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZpbGUgbm90IGZvdW5kOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLnN0YXQocmVzb3VyY2UpO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0aXNVcmlBbGxvd2VkKF91cmk6IFVSSSk6IGJvb2xlYW4geyByZXR1cm4gdHJ1ZTsgfVxuXHRmb3JtYXRFcnJvcih1cmk6IFVSSSk6IHN0cmluZyB7IHJldHVybiBgQWNjZXNzIHRvICR7dXJpLmF1dGhvcml0eX0gaXMgYmxvY2tlZCBieSBuZXR3b3JrIGRvbWFpbiBwb2xpY3kuYDsgfVxufVxuXG5zdWl0ZSgnRmV0Y2hXZWJQYWdlVG9vbCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBodHRwL2h0dHBzIHZpYSB3ZWIgY29udGVudCBleHRyYWN0b3IgYW5kIG90aGVyIHNjaGVtZXMgdmlhIGZpbGUgc2VydmljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCAnSFRUUFMgY29udGVudCddLFxuXHRcdFx0W1VSSS5wYXJzZSgnaHR0cDovL2V4YW1wbGUuY29tJyksICdIVFRQIGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ3Rlc3Q6Ly9zdGF0aWMvcmVzb3VyY2UvNTAnKSwgJ01DUCByZXNvdXJjZSBjb250ZW50J10sXG5cdFx0XHRbVVJJLnBhcnNlKCdtY3AtcmVzb3VyY2U6Ly83NDY1NzM3NDJENzM2NTcyNzY2NTcyL2N1c3RvbS9oZWxsby93b3JsZC50eHQnKSwgJ0N1c3RvbSBNQ1AgY29udGVudCddXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKHdlYkNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCB0ZXN0VXJscyA9IFtcblx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdCdodHRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0J3Rlc3Q6Ly9zdGF0aWMvcmVzb3VyY2UvNTAnLFxuXHRcdFx0J21jcC1yZXNvdXJjZTovLzc0NjU3Mzc0MkQ3MzY1NzI3NjY1NzIvY3VzdG9tL2hlbGxvL3dvcmxkLnR4dCcsXG5cdFx0XHQnZmlsZTovLy9wYXRoL3RvL25vbmV4aXN0ZW50Jyxcblx0XHRcdCdmdHA6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnaW52YWxpZC11cmwnXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwtMScsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IHRlc3RVcmxzIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBTaG91bGQgaGF2ZSA3IHJlc3VsdHMgKG9uZSBmb3IgZWFjaCBpbnB1dCBVUkwpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgNywgJ1Nob3VsZCBoYXZlIHJlc3VsdCBmb3IgZWFjaCBpbnB1dCBVUkwnKTtcblxuXHRcdC8vIEhUVFAgYW5kIEhUVFBTIFVSTHMgc2hvdWxkIGhhdmUgdGhlaXIgY29udGVudCBmcm9tIHdlYiBleHRyYWN0b3Jcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdIVFRQUyBjb250ZW50JywgJ0hUVFBTIFVSTCBzaG91bGQgcmV0dXJuIGNvbnRlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUsICdIVFRQIGNvbnRlbnQnLCAnSFRUUCBVUkwgc2hvdWxkIHJldHVybiBjb250ZW50Jyk7XG5cblx0XHQvLyBNQ1AgcmVzb3VyY2VzIHNob3VsZCBoYXZlIHRoZWlyIGNvbnRlbnQgZnJvbSBmaWxlIHNlcnZpY2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMl0udmFsdWUsICdNQ1AgcmVzb3VyY2UgY29udGVudCcsICd0ZXN0Oi8vIFVSTCBzaG91bGQgcmV0dXJuIGNvbnRlbnQgZnJvbSBmaWxlIHNlcnZpY2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbM10udmFsdWUsICdDdXN0b20gTUNQIGNvbnRlbnQnLCAnbWNwLXJlc291cmNlOi8vIFVSTCBzaG91bGQgcmV0dXJuIGNvbnRlbnQgZnJvbSBmaWxlIHNlcnZpY2UnKTtcblxuXHRcdC8vIE5vbmV4aXN0ZW50IGZpbGUgc2hvdWxkIGJlIG1hcmtlZCBhcyBpbnZhbGlkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzRdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnTm9uZXhpc3RlbnQgZmlsZSBzaG91bGQgYmUgaW52YWxpZCcpO1xuXG5cdFx0Ly8gVW5zdXBwb3J0ZWQgc2NoZW1lIChmdHApIHNob3VsZCBiZSBtYXJrZWQgYXMgaW52YWxpZCBzaW5jZSBmaWxlIHNlcnZpY2UgY2FuJ3QgaGFuZGxlIGl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzVdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnZnRwOi8vIFVSTCBzaG91bGQgYmUgaW52YWxpZCcpO1xuXG5cdFx0Ly8gSW52YWxpZCBVUkwgc2hvdWxkIGJlIG1hcmtlZCBhcyBpbnZhbGlkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzZdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnSW52YWxpZCBVUkwgc2hvdWxkIGJlIGludmFsaWQnKTtcblxuXHRcdC8vIEFsbCBzdWNjZXNzZnVsbHkgZmV0Y2hlZCBVUkxzIHNob3VsZCBiZSBpbiB0b29sUmVzdWx0RGV0YWlsc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscykgPyByZXN1bHQudG9vbFJlc3VsdERldGFpbHMubGVuZ3RoIDogMCwgNCwgJ1Nob3VsZCBoYXZlIDQgdmFsaWQgVVJMcyBpbiB0b29sUmVzdWx0RGV0YWlscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGFuZCB1bmRlZmluZWQgVVJMcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKSksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHQvLyBUZXN0IGVtcHR5IGFycmF5XG5cdFx0Y29uc3QgZW1wdHlSZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdHsgY2FsbElkOiAndGVzdC1jYWxsLTInLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbXSB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbXB0eVJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMSwgJ0VtcHR5IGFycmF5IHNob3VsZCByZXR1cm4gc2luZ2xlIG1lc3NhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW1wdHlSZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ05vIHZhbGlkIFVSTHMgcHJvdmlkZWQuJywgJ1Nob3VsZCBpbmRpY2F0ZSBubyB2YWxpZCBVUkxzJyk7XG5cblx0XHQvLyBUZXN0IHVuZGVmaW5lZFxuXHRcdGNvbnN0IHVuZGVmaW5lZFJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwtMycsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7fSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kZWZpbmVkUmVzdWx0LmNvbnRlbnQubGVuZ3RoLCAxLCAnVW5kZWZpbmVkIFVSTHMgc2hvdWxkIHJldHVybiBzaW5nbGUgbWVzc2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRlZmluZWRSZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ05vIHZhbGlkIFVSTHMgcHJvdmlkZWQuJywgJ1Nob3VsZCBpbmRpY2F0ZSBubyB2YWxpZCBVUkxzJyk7XG5cblx0XHQvLyBUZXN0IGFycmF5IHdpdGggaW52YWxpZCBVUkxzXG5cdFx0Y29uc3QgaW52YWxpZFJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwtNCcsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnJywgJyAnLCAnaW52YWxpZC1zY2hlbWUtdGhhdC1maWxlc2VydmljZS1jYW5ub3QtaGFuZGxlOi8vdGVzdCddIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludmFsaWRSZXN1bHQuY29udGVudC5sZW5ndGgsIDMsICdTaG91bGQgaGF2ZSByZXN1bHQgZm9yIGVhY2ggaW52YWxpZCBVUkwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52YWxpZFJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnRW1wdHkgc3RyaW5nIHNob3VsZCBiZSBpbnZhbGlkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludmFsaWRSZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ1NwYWNlLW9ubHkgc3RyaW5nIHNob3VsZCBiZSBpbnZhbGlkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludmFsaWRSZXN1bHQuY29udGVudFsyXS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ1VuaGFuZGxlYWJsZSBzY2hlbWUgc2hvdWxkIGJlIGludmFsaWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByb3ZpZGUgY29ycmVjdCBwYXN0IHRlbnNlIG1lc3NhZ2VzIGZvciBtaXhlZCB2YWxpZC9pbnZhbGlkIFVSTHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2ViQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KFtcblx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vdmFsaWQuY29tJyksICdWYWxpZCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLnBhcnNlKCd0ZXN0Oi8vdmFsaWQvcmVzb3VyY2UnKSwgJ1ZhbGlkIE1DUCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL3ZhbGlkLmNvbScsICd0ZXN0Oi8vdmFsaWQvcmVzb3VyY2UnLCAnaW52YWxpZDovL2ludmFsaWQnXSB9LCB0b29sQ2FsbElkOiAndGVzdC1jYWxsLTEnLCBjaGF0U2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLnBhc3RUZW5zZU1lc3NhZ2UsICdTaG91bGQgaGF2ZSBwYXN0IHRlbnNlIG1lc3NhZ2UnKTtcblx0XHRjb25zdCBtZXNzYWdlVGV4dCA9IHR5cGVvZiBwcmVwYXJhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID09PSAnc3RyaW5nJyA/IHByZXBhcmF0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgOiBwcmVwYXJhdGlvbi5wYXN0VGVuc2VNZXNzYWdlIS52YWx1ZTtcblx0XHRhc3NlcnQub2sobWVzc2FnZVRleHQuaW5jbHVkZXMoJ0ZldGNoZWQnKSwgJ1Nob3VsZCBtZW50aW9uIGZldGNoZWQgcmVzb3VyY2VzJyk7XG5cdFx0YXNzZXJ0Lm9rKG1lc3NhZ2VUZXh0LmluY2x1ZGVzKCdpbnZhbGlkOi8vaW52YWxpZCcpLCAnU2hvdWxkIG1lbnRpb24gaW52YWxpZCBVUkwnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cgZm9yIGZpbGUgVVJJcyBpbnNpZGUgdGhlIHdvcmtzcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBVc2UgYSB3b3Jrc3BhY2Ugcm9vdGVkIGF0IC93b3Jrc3BhY2VSb290XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlUm9vdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKHdvcmtzcGFjZVJvb3QpKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3BsYW4ubWQnKSwgJ1BsYW4gY29udGVudCddLFxuXHRcdFx0W1VSSS5maWxlKCcvd29ya3NwYWNlUm9vdC9zdWJkaXIvbm90ZXMudHh0JyksICdOb3RlcyBjb250ZW50J10sXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Ly8gRmlsZSBpbnNpZGUgd29ya3NwYWNlIC0gc2hvdWxkIE5PVCB0cmlnZ2VyIGNvbmZpcm1hdGlvblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogW1VSSS5maWxlKCcvd29ya3NwYWNlUm9vdC9wbGFuLm1kJykudG9TdHJpbmcoKV0gfSwgdG9vbENhbGxJZDogJ3Rlc3QtZmlsZS1pbi13cycsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSwgdW5kZWZpbmVkLCAnRmlsZSBpbnNpZGUgd29ya3NwYWNlIHNob3VsZCBub3Qgc2hvdyBjb25maXJtYXRpb24gZGlhbG9nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cywgZmFsc2UsICdGaWxlIGluc2lkZSB3b3Jrc3BhY2Ugc2hvdWxkIG5vdCByZXF1aXJlIHBvc3QtY29uZmlybWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cgZm9yIGZpbGUgVVJJcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVXNlIGEgd29ya3NwYWNlIHJvb3RlZCBhdCAvd29ya3NwYWNlUm9vdFxuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5maWxlKCcvdG1wL2V4dGVybmFsLXBsYW4ubWQnKSwgJ0V4dGVybmFsIHBsYW4gY29udGVudCddLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdC8vIEZpbGUgb3V0c2lkZSB3b3Jrc3BhY2UgLSBzaG91bGQgc3RpbGwgdHJpZ2dlciBjb25maXJtYXRpb25cblx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFtVUkkuZmlsZSgnL3RtcC9leHRlcm5hbC1wbGFuLm1kJykudG9TdHJpbmcoKV0gfSwgdG9vbENhbGxJZDogJ3Rlc3QtZmlsZS1vdXRzaWRlLXdzJywgY2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCAnRmlsZSBvdXRzaWRlIHdvcmtzcGFjZSBzaG91bGQgc2hvdyBjb25maXJtYXRpb24gZGlhbG9nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cywgdHJ1ZSwgJ0ZpbGUgb3V0c2lkZSB3b3Jrc3BhY2Ugc2hvdWxkIHJlcXVpcmUgcG9zdC1jb25maXJtYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBVUkkgdGhhdCB0cmF2ZXJzZXMgb3V0IG9mIHRoZSB3b3Jrc3BhY2UgcmVxdWlyZXMgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IGEgYC4uYCB0cmF2ZXJzYWwgdGhhdCBlc2NhcGVzIHRoZSB3b3Jrc3BhY2UgbXVzdCBub3QgYmUganVkZ2VkIGFzIGluc2lkZSBpdC5cblx0XHQvLyBUaGUgbWVtYmVyc2hpcCBjaGVjayBhbmQgdGhlIHJlYWQgbXVzdCBhZ3JlZSBvbiB0aGUgY2Fub25pY2FsIChub3JtYWxpemVkKSBwYXRoLlxuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHQvLyBUaGUgcmVhbCB0YXJnZXQsIGFmdGVyIHJlc29sdmluZyBgLi5gLCBsaXZlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9zZWNyZXQudHh0JyksICdzZWNyZXQgY29udGVudCddLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL3dvcmtzcGFjZVJvb3QvLi4vLi4vZXRjL3NlY3JldC50eHQnXSB9LCB0b29sQ2FsbElkOiAndGVzdC1maWxlLXRyYXZlcnNhbCcsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSwgJ1RyYXZlcnNhbCBlc2NhcGluZyB0aGUgd29ya3NwYWNlIHNob3VsZCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCB0cnVlLCAnVHJhdmVyc2FsIGVzY2FwaW5nIHRoZSB3b3Jrc3BhY2Ugc2hvdWxkIHJlcXVpcmUgcG9zdC1jb25maXJtYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBVUkkgd2l0aCBgLi5gIHRoYXQgc3RheXMgaW5zaWRlIHRoZSB3b3Jrc3BhY2Ugc3RpbGwgc2tpcHMgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE5vcm1hbGl6YXRpb24gbXVzdCBub3Qgb3Zlci1ibG9jazogYW4gaW4td29ya3NwYWNlIHBhdGggdGhhdCBoYXBwZW5zIHRvIGNvbnRhaW4gYC4uYFxuXHRcdC8vIHJlc29sdmVzIGJhY2sgaW5zaWRlIHRoZSB3b3Jrc3BhY2UgYW5kIHNob3VsZCBub3QgcHJvbXB0LlxuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5maWxlKCcvd29ya3NwYWNlUm9vdC9wbGFuLm1kJyksICdQbGFuIGNvbnRlbnQnXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZShbXSksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy93b3Jrc3BhY2VSb290L3N1YmRpci8uLi9wbGFuLm1kJ10gfSwgdG9vbENhbGxJZDogJ3Rlc3QtZmlsZS1pbnNpZGUtdHJhdmVyc2FsJywgY2hhdFNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCB1bmRlZmluZWQsICdJbi13b3Jrc3BhY2UgZmlsZSAoYWZ0ZXIgbm9ybWFsaXphdGlvbikgc2hvdWxkIG5vdCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCBmYWxzZSwgJ0luLXdvcmtzcGFjZSBmaWxlIHNob3VsZCBub3QgcmVxdWlyZSBwb3N0LWNvbmZpcm1hdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3Jrc3BhY2UgZmlsZSBtaXhlZCB3aXRoIHVudHJ1c3RlZCB3ZWIgVVJJOiBvbmx5IHdlYiBVUkkgdHJpZ2dlcnMgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCAnV2ViIGNvbnRlbnQnXVxuXHRcdF0pO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3BsYW4ubWQnKSwgJ1BsYW4gY29udGVudCddXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKHdlYkNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoW10pLCAvLyBObyB0cnVzdGVkIGRvbWFpbnNcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdC8vIE1peDogb25lIHVudHJ1c3RlZCB3ZWIgVVJJICsgb25lIHdvcmtzcGFjZSBmaWxlIFVSSVxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL2V4YW1wbGUuY29tJywgVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290L3BsYW4ubWQnKS50b1N0cmluZygpXSB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGVzdC1taXhlZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdC8vIENvbmZpcm1hdGlvbiBzaG91bGQgb25seSBiZSBmb3IgdGhlIHdlYiBVUklcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCAnU2hvdWxkIHNob3cgY29uZmlybWF0aW9uIGZvciB1bnRydXN0ZWQgd2ViIFVSSScpO1xuXHRcdC8vIFRoZSBjb25maXJtYXRpb24gbWVzc2FnZSBzaG91bGQgbWVudGlvbiBvbmx5IHRoZSB3ZWIgVVJJLCBub3QgdGhlIHdvcmtzcGFjZSBmaWxlXG5cdFx0Y29uc3QgbXNnVmFsdWUgPSB0eXBlb2YgcHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2Vcblx0XHRcdDogcHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U/LnZhbHVlID8/ICcnO1xuXHRcdGFzc2VydC5vayghbXNnVmFsdWUuaW5jbHVkZXMoJy93b3Jrc3BhY2VSb290LycpLCAnQ29uZmlybWF0aW9uIG1lc3NhZ2Ugc2hvdWxkIG5vdCBtZW50aW9uIHdvcmtzcGFjZSBmaWxlJyk7XG5cdFx0YXNzZXJ0Lm9rKG1zZ1ZhbHVlLmluY2x1ZGVzKCdleGFtcGxlLmNvbScpLCAnQ29uZmlybWF0aW9uIG1lc3NhZ2Ugc2hvdWxkIG1lbnRpb24gd2ViIFVSSScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgYXBwcm92ZSB3aGVuIGFsbCBVUkxzIHdlcmUgbWVudGlvbmVkIGluIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2ViQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KFtcblx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vdmFsaWQuY29tJyksICdWYWxpZCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLnBhcnNlKCd0ZXN0Oi8vdmFsaWQvcmVzb3VyY2UnKSwgJ1ZhbGlkIE1DUCBjb250ZW50J11cblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uod2ViQ29udGVudE1hcCksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0dXBjYXN0RGVlcFBhcnRpYWw8SUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRcdGdldFNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiAnZmV0Y2ggaHR0cHM6Ly9leGFtcGxlLmNvbSdcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uMSA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddIH0sIHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwtMicsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYScpIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbjEsICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24xLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uMiA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnaHR0cHM6Ly9vdGhlci5jb20nXSB9LCB0b29sQ2FsbElkOiAndGVzdC1jYWxsLTMnLCBjaGF0U2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2EnKSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24yLCAnU2hvdWxkIHJldHVybiBwcmVwYXJlZCBpbnZvY2F0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHByZXBhcmF0aW9uMi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVxdWlyZSBjb25maXJtYXRpb24gZm9yIGEgZmlsZSBVUkkgZW1iZWRkZWQgaW5zaWRlIGEgcGFzdGVkIHdlYiBVUkwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92aWN0aW0vLnNzaC9pZF9yc2EnKSwgJ3NlY3JldCBrZXknXVxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIHVzZXIgb25seSBldmVyIHBhc3RlZCBhIHdlYiBVUkwgdGhhdCBoYXBwZW5zIHRvIGNvbnRhaW4gdGhlIGZpbGUgVVJJIGFzIGFcblx0XHQvLyBxdWVyeS1wYXJhbWV0ZXIgdmFsdWUuIEl0IG11c3QgTk9UIGJlIHRyZWF0ZWQgYXMgYW4gZXhwbGljaXQgcmVxdWVzdCBmb3IgdGhlIGZpbGUsXG5cdFx0Ly8gc28gdGhlIGNvbmZpcm1hdGlvbiBkaWFsb2cgbXVzdCBzdGlsbCBiZSBzaG93bi5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdHVwY2FzdERlZXBQYXJ0aWFsPElDaGF0U2VydmljZT4oe1xuXHRcdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ2ZldGNoIGh0dHBzOi8vYXR0YWNrZXIuZXhhbXBsZS9wLmh0bWw/dT1maWxlOi8vL2hvbWUvdmljdGltLy5zc2gvaWRfcnNhJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdHsgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vaG9tZS92aWN0aW0vLnNzaC9pZF9yc2EnXSB9LCB0b29sQ2FsbElkOiAndGVzdC1jYWxsLWluamVjdGlvbicsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignYScpIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbiwgJ1Nob3VsZCByZXR1cm4gcHJlcGFyZWQgaW52b2NhdGlvbicpO1xuXHRcdGFzc2VydC5vayhwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdFbWJlZGRlZCBmaWxlIFVSSSBzaG91bGQgc3RpbGwgc2hvdyBjb25maXJtYXRpb24gZGlhbG9nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZXBhcmF0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jb25maXJtUmVzdWx0cywgdHJ1ZSwgJ0VtYmVkZGVkIGZpbGUgVVJJIHNob3VsZCBzdGlsbCByZXF1aXJlIHBvc3QtY29uZmlybWF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgYSBzdGFuZGFsb25lIG91dC1vZi13b3Jrc3BhY2UgZmlsZSBVUkkgdGhlIHVzZXIgcGFzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZVJvb3QnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZSh3b3Jrc3BhY2VSb290KSk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5maWxlKCcvdG1wL2V4dGVybmFsLXBsYW4ubWQnKSwgJ0V4dGVybmFsIHBsYW4gY29udGVudCddXG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdXNlciBleHBsaWNpdGx5IHJlZmVyZW5jZWQgdGhlIGZpbGUgVVJJIGFzIGl0cyBvd24gdG9rZW4sIHNvIGl0IHNob3VsZCBiZVxuXHRcdC8vIHRyZWF0ZWQgYXMgdXNlci1hcHByb3ZlZCBldmVuIHRob3VnaCBpdCBsaXZlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdHVwY2FzdERlZXBQYXJ0aWFsPElDaGF0U2VydmljZT4oe1xuXHRcdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ3BsZWFzZSBmZXRjaCAoZmlsZTovLy90bXAvZXh0ZXJuYWwtcGxhbi5tZCkgZm9yIG1lJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0eyBwYXJhbWV0ZXJzOiB7IHVybHM6IFtVUkkuZmlsZSgnL3RtcC9leHRlcm5hbC1wbGFuLm1kJykudG9TdHJpbmcoKV0gfSwgdG9vbENhbGxJZDogJ3Rlc3QtY2FsbC1zdGFuZGFsb25lLWZpbGUnLCBjaGF0U2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2EnKSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCB1bmRlZmluZWQsICdFeHBsaWNpdGx5IHJlZmVyZW5jZWQgZmlsZSBVUkkgc2hvdWxkIG5vdCBzaG93IGNvbmZpcm1hdGlvbiBkaWFsb2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1SZXN1bHRzLCBmYWxzZSwgJ0V4cGxpY2l0bHkgcmVmZXJlbmNlZCBmaWxlIFVSSSBzaG91bGQgbm90IHJlcXVpcmUgcG9zdC1jb25maXJtYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uIHdoZW4gYSBwcmlvciBtZXNzYWdlIG9ubHkgbWVudGlvbnMgYSBiYXJlIChzY2hlbWUtbGVzcykgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2VSb290Jyk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHRlc3RXb3Jrc3BhY2Uod29ya3NwYWNlUm9vdCkpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkuZmlsZSgnL2V0Yy9zZWNyZXQudHh0JyksICdzZWNyZXQgY29udGVudCddXG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdXNlciBvbmx5IGV2ZXIgdHlwZWQgYSBiYXJlIGZpbGVzeXN0ZW0gcGF0aCAobm8gYGZpbGU6Ly9gIHNjaGVtZSkuIEl0IG11c3Qgbm90IGJlXG5cdFx0Ly8gdHJlYXRlZCBhcyBhIHJlZmVyZW5jZWQgcmVzb3VyY2UgXHUyMDE0IGEgc2NoZW1lLWxlc3MgdG9rZW4gbXVzdCBub3QgZGVmYXVsdCB0byBhIGZpbGUgVVJJXG5cdFx0Ly8gYW5kIGF1dG8tYXBwcm92ZSBhIG1hdGNoaW5nIHJlYWQuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdHVwY2FzdERlZXBQYXJ0aWFsPElDaGF0U2VydmljZT4oe1xuXHRcdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogJ3RoZSBjb25maWcgbGl2ZXMgYXQgL2V0Yy9zZWNyZXQudHh0IG9uIHRoZSBib3gnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oXG5cdFx0XHR7IHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL2V0Yy9zZWNyZXQudHh0J10gfSwgdG9vbENhbGxJZDogJ3Rlc3QtY2FsbC1iYXJlLXBhdGgnLCBjaGF0U2Vzc2lvblJlc291cmNlOiBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2EnKSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24sICdTaG91bGQgcmV0dXJuIHByZXBhcmVkIGludm9jYXRpb24nKTtcblx0XHRhc3NlcnQub2socHJlcGFyYXRpb24uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLCAnQmFyZSBwYXRoIG1lbnRpb24gc2hvdWxkIHN0aWxsIHNob3cgY29uZmlybWF0aW9uIGRpYWxvZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMsIHRydWUsICdCYXJlIHBhdGggbWVudGlvbiBzaG91bGQgc3RpbGwgcmVxdWlyZSBwb3N0LWNvbmZpcm1hdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIG1lc3NhZ2UgZm9yIGJpbmFyeSBmaWxlcyBpbmRpY2F0aW5nIHRoZXkgYXJlIG5vdCBzdXBwb3J0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQ3JlYXRlIGJpbmFyeSBjb250ZW50IChhIHNpbXBsZSBQTkctbGlrZSBoZWFkZXIgd2l0aCBudWxsIGJ5dGVzKVxuXHRcdGNvbnN0IGJpbmFyeUNvbnRlbnQgPSBuZXcgVWludDhBcnJheShbMHg4OSwgMHg1MCwgMHg0RSwgMHg0NywgMHgwRCwgMHgwQSwgMHgxQSwgMHgwQSwgMHgwMCwgMHgwMCwgMHgwMCwgMHgwRF0pO1xuXHRcdGNvbnN0IGJpbmFyeUJ1ZmZlciA9IFZTQnVmZmVyLndyYXAoYmluYXJ5Q29udGVudCk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9wYXRoL3RvL2JpbmFyeS5kYXQnKSwgYmluYXJ5QnVmZmVyXSxcblx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC90by90ZXh0LnR4dCcpLCAnVGhpcyBpcyB0ZXh0IGNvbnRlbnQnXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJ3Rlc3QtY2FsbC1iaW5hcnknLFxuXHRcdFx0XHR0b29sSWQ6ICdmZXRjaC1wYWdlJyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vcGF0aC90by9iaW5hcnkuZGF0JywgJ2ZpbGU6Ly8vcGF0aC90by90ZXh0LnR4dCddIH0sXG5cdFx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgMiByZXN1bHRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIDIgcmVzdWx0cycpO1xuXG5cdFx0Ly8gRmlyc3QgcmVzdWx0IHNob3VsZCBiZSBhIHRleHQgcGFydCB3aXRoIGJpbmFyeSBub3Qgc3VwcG9ydGVkIG1lc3NhZ2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ3RleHQnLCAnQmluYXJ5IGZpbGUgc2hvdWxkIHJldHVybiB0ZXh0IHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdCaW5hcnkgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgYXQgdGhlIG1vbWVudC4nLCAnU2hvdWxkIHJldHVybiBub3Qgc3VwcG9ydGVkIG1lc3NhZ2UnKTtcblx0XHR9XG5cblx0XHQvLyBTZWNvbmQgcmVzdWx0IHNob3VsZCBiZSBhIHRleHQgcGFydCBmb3IgdGhlIHRleHQgZmlsZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS5raW5kLCAndGV4dCcsICdUZXh0IGZpbGUgc2hvdWxkIHJldHVybiB0ZXh0IHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMV0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUsICdUaGlzIGlzIHRleHQgY29udGVudCcsICdTaG91bGQgcmV0dXJuIHRleHQgY29udGVudCcpO1xuXHRcdH1cblxuXHRcdC8vIEJvdGggZmlsZXMgc2hvdWxkIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzIHNpbmNlIHRoZXkgd2VyZSBzdWNjZXNzZnVsbHkgZmV0Y2hlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscykgPyByZXN1bHQudG9vbFJlc3VsdERldGFpbHMubGVuZ3RoIDogMCwgMiwgJ1Nob3VsZCBoYXZlIDIgdmFsaWQgVVJMcyBpbiB0b29sUmVzdWx0RGV0YWlscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdQTkcgZmlsZXMgYXJlIG5vdyBzdXBwb3J0ZWQgYXMgaW1hZ2UgZGF0YSBwYXJ0cyAocmVncmVzc2lvbiB0ZXN0KScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGlzIHRlc3QgZW5zdXJlcyB0aGF0IFBORyBmaWxlcyB0aGF0IHByZXZpb3VzbHkgcmV0dXJuZWQgXCJub3Qgc3VwcG9ydGVkXCJcblx0XHQvLyBtZXNzYWdlcyBub3cgcmV0dXJuIHByb3BlciBpbWFnZSBkYXRhIHBhcnRzXG5cdFx0Y29uc3QgYmluYXJ5Q29udGVudCA9IG5ldyBVaW50OEFycmF5KFsweDg5LCAweDUwLCAweDRFLCAweDQ3LCAweDBELCAweDBBLCAweDFBLCAweDBBLCAweDAwLCAweDAwLCAweDAwLCAweDBEXSk7XG5cdFx0Y29uc3QgYmluYXJ5QnVmZmVyID0gVlNCdWZmZXIud3JhcChiaW5hcnlDb250ZW50KTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRbVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvdG8vaW1hZ2UucG5nJyksIGJpbmFyeUJ1ZmZlcl1cblx0XHRdKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0e1xuXHRcdFx0XHRjYWxsSWQ6ICd0ZXN0LXBuZy1zdXBwb3J0Jyxcblx0XHRcdFx0dG9vbElkOiAnZmV0Y2gtcGFnZScsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL3BhdGgvdG8vaW1hZ2UucG5nJ10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBTaG91bGQgaGF2ZSAxIHJlc3VsdFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEsICdTaG91bGQgaGF2ZSAxIHJlc3VsdCcpO1xuXG5cdFx0Ly8gUE5HIGZpbGUgc2hvdWxkIG5vdyBiZSByZXR1cm5lZCBhcyBhIGRhdGEgcGFydCwgbm90IGEgXCJub3Qgc3VwcG9ydGVkXCIgbWVzc2FnZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS5raW5kLCAnZGF0YScsICdQTkcgZmlsZSBzaG91bGQgcmV0dXJuIGRhdGEgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFswXS5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZS5taW1lVHlwZSwgJ2ltYWdlL3BuZycsICdTaG91bGQgaGF2ZSBQTkcgTUlNRSB0eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUuZGF0YSwgYmluYXJ5QnVmZmVyLCAnU2hvdWxkIGhhdmUgY29ycmVjdCBiaW5hcnkgZGF0YScpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNvcnJlY3RseSBkaXN0aW5ndWlzaCBiZXR3ZWVuIGJpbmFyeSBhbmQgdGV4dCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBjb250ZW50IHRoYXQgbWlnaHQgYmUgYW1iaWd1b3VzXG5cdFx0Y29uc3QganNvbkRhdGEgPSAne1wibmFtZVwiOiBcInRlc3RcIiwgXCJ2YWx1ZVwiOiAxMjN9Jztcblx0XHQvLyBDcmVhdGUgZGVmaW5pdGVseSBiaW5hcnkgZGF0YSAtIHNvbWUgcmFuZG9tIGJ5dGVzIHdpdGggbnVsbCBieXRlcyB0aGF0IGRvbid0IGZvbGxvdyBVVEYtMTYgcGF0dGVyblxuXHRcdGNvbnN0IHJlYWxCaW5hcnlEYXRhID0gbmV3IFVpbnQ4QXJyYXkoWzB4ODksIDB4NTAsIDB4NEUsIDB4NDcsIDB4MDAsIDB4MDAsIDB4MDAsIDB4MEQsIDB4RkYsIDB4MDAsIDB4QUJdKTsgLy8gTW9yZSBjbGVhcmx5IGJpbmFyeVxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KFtcblx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vZGF0YS5qc29uJyksIGpzb25EYXRhXSwgLy8gU2hvdWxkIGJlIGRldGVjdGVkIGFzIHRleHRcblx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vYmluYXJ5LmRhdCcpLCBWU0J1ZmZlci53cmFwKHJlYWxCaW5hcnlEYXRhKV0gLy8gU2hvdWxkIGJlIGRldGVjdGVkIGFzIGJpbmFyeVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSxcblx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHR7XG5cdFx0XHRcdGNhbGxJZDogJ3Rlc3QtZGlzdGluZ3Vpc2gnLFxuXHRcdFx0XHR0b29sSWQ6ICdmZXRjaC1wYWdlJyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vZGF0YS5qc29uJywgJ2ZpbGU6Ly8vYmluYXJ5LmRhdCddIH0sXG5cdFx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gSlNPTiBzaG91bGQgYmUgcmV0dXJuZWQgYXMgdGV4dFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS5raW5kLCAndGV4dCcsICdKU09OIHNob3VsZCBiZSBkZXRlY3RlZCBhcyB0ZXh0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICd0ZXh0Jykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCBqc29uRGF0YSwgJ1Nob3VsZCByZXR1cm4gSlNPTiBhcyB0ZXh0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gQmluYXJ5IGRhdGEgc2hvdWxkIGJlIHJldHVybmVkIGFzIG5vdCBzdXBwb3J0ZWQgbWVzc2FnZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS5raW5kLCAndGV4dCcsICdCaW5hcnkgY29udGVudCBzaG91bGQgcmV0dXJuIHRleHQgcGFydCB3aXRoIG1lc3NhZ2UnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMV0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUsICdCaW5hcnkgZmlsZXMgYXJlIG5vdCBzdXBwb3J0ZWQgYXQgdGhlIG1vbWVudC4nLCAnU2hvdWxkIHJldHVybiBub3Qgc3VwcG9ydGVkIG1lc3NhZ2UnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1N1cHBvcnRlZCBpbWFnZSBmaWxlcyBhcmUgcmV0dXJuZWQgYXMgZGF0YSBwYXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBUZXN0IGRhdGEgZm9yIGRpZmZlcmVudCBzdXBwb3J0ZWQgaW1hZ2UgZm9ybWF0c1xuXHRcdGNvbnN0IHBuZ0RhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIFBORyBkYXRhJyk7XG5cdFx0Y29uc3QganBlZ0RhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIEpQRUcgZGF0YScpO1xuXHRcdGNvbnN0IGdpZkRhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIEdJRiBkYXRhJyk7XG5cdFx0Y29uc3Qgd2VicERhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIFdlYlAgZGF0YScpO1xuXHRcdGNvbnN0IGJtcERhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIEJNUCBkYXRhJyk7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKTtcblx0XHRmaWxlQ29udGVudE1hcC5zZXQoVVJJLnBhcnNlKCdmaWxlOi8vL2ltYWdlLnBuZycpLCBwbmdEYXRhKTtcblx0XHRmaWxlQ29udGVudE1hcC5zZXQoVVJJLnBhcnNlKCdmaWxlOi8vL3Bob3RvLmpwZycpLCBqcGVnRGF0YSk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy9hbmltYXRpb24uZ2lmJyksIGdpZkRhdGEpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vbW9kZXJuLndlYnAnKSwgd2VicERhdGEpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vYml0bWFwLmJtcCcpLCBibXBEYXRhKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0e1xuXHRcdFx0XHRjYWxsSWQ6ICd0ZXN0LWltYWdlcycsXG5cdFx0XHRcdHRvb2xJZDogJ2ZldGNoLXBhZ2UnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy9pbWFnZS5wbmcnLCAnZmlsZTovLy9waG90by5qcGcnLCAnZmlsZTovLy9hbmltYXRpb24uZ2lmJywgJ2ZpbGU6Ly8vbW9kZXJuLndlYnAnLCAnZmlsZTovLy9iaXRtYXAuYm1wJ10gfSxcblx0XHRcdFx0Y29udGV4dDogdW5kZWZpbmVkXG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdCk7XG5cblx0XHQvLyBBbGwgaW1hZ2VzIHNob3VsZCBiZSByZXR1cm5lZCBhcyBkYXRhIHBhcnRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgNSwgJ1Nob3VsZCBoYXZlIDUgcmVzdWx0cycpO1xuXG5cdFx0Ly8gQ2hlY2sgUE5HXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICdkYXRhJywgJ1BORyBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvcG5nJywgJ1BORyBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmRhdGEsIHBuZ0RhdGEsICdQTkcgc2hvdWxkIGhhdmUgY29ycmVjdCBkYXRhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgSlBFR1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS5raW5kLCAnZGF0YScsICdKUEVHIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMV0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUubWltZVR5cGUsICdpbWFnZS9qcGVnJywgJ0pQRUcgc2hvdWxkIGhhdmUgY29ycmVjdCBNSU1FIHR5cGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZS5kYXRhLCBqcGVnRGF0YSwgJ0pQRUcgc2hvdWxkIGhhdmUgY29ycmVjdCBkYXRhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgR0lGXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzJdLmtpbmQsICdkYXRhJywgJ0dJRiBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzJdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzJdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvZ2lmJywgJ0dJRiBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzJdLnZhbHVlLmRhdGEsIGdpZkRhdGEsICdHSUYgc2hvdWxkIGhhdmUgY29ycmVjdCBkYXRhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgV2ViUFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFszXS5raW5kLCAnZGF0YScsICdXZWJQIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbM10ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbM10udmFsdWUubWltZVR5cGUsICdpbWFnZS93ZWJwJywgJ1dlYlAgc2hvdWxkIGhhdmUgY29ycmVjdCBNSU1FIHR5cGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFszXS52YWx1ZS5kYXRhLCB3ZWJwRGF0YSwgJ1dlYlAgc2hvdWxkIGhhdmUgY29ycmVjdCBkYXRhJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgQk1QXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzRdLmtpbmQsICdkYXRhJywgJ0JNUCBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzRdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzRdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvYm1wJywgJ0JNUCBzaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzRdLnZhbHVlLmRhdGEsIGJtcERhdGEsICdCTVAgc2hvdWxkIGhhdmUgY29ycmVjdCBkYXRhJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdNaXhlZCBpbWFnZSBhbmQgdGV4dCBmaWxlcyB3b3JrIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXh0RGF0YSA9ICdUaGlzIGlzIHNvbWUgdGV4dCBjb250ZW50Jztcblx0XHRjb25zdCBpbWFnZURhdGEgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmYWtlIGltYWdlIGRhdGEnKTtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vdGV4dC50eHQnKSwgdGV4dERhdGEpO1xuXHRcdGZpbGVDb250ZW50TWFwLnNldChVUkkucGFyc2UoJ2ZpbGU6Ly8vaW1hZ2UucG5nJyksIGltYWdlRGF0YSk7XG5cblx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKGZpbGVDb250ZW50TWFwKSxcblx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdHtcblx0XHRcdFx0Y2FsbElkOiAndGVzdC1taXhlZCcsXG5cdFx0XHRcdHRvb2xJZDogJ2ZldGNoLXBhZ2UnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHVybHM6IFsnZmlsZTovLy90ZXh0LnR4dCcsICdmaWxlOi8vL2ltYWdlLnBuZyddIH0sXG5cdFx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gVGV4dCBzaG91bGQgYmUgcmV0dXJuZWQgYXMgdGV4dCBwYXJ0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0JywgJ1RleHQgZmlsZSBzaG91bGQgYmUgdGV4dCBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzBdLmtpbmQgPT09ICd0ZXh0Jykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCB0ZXh0RGF0YSwgJ1RleHQgc2hvdWxkIGhhdmUgY29ycmVjdCBjb250ZW50Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gSW1hZ2Ugc2hvdWxkIGJlIHJldHVybmVkIGFzIGRhdGEgcGFydFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS5raW5kLCAnZGF0YScsICdJbWFnZSBmaWxlIHNob3VsZCBiZSBkYXRhIHBhcnQnKTtcblx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMV0ua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUubWltZVR5cGUsICdpbWFnZS9wbmcnLCAnSW1hZ2Ugc2hvdWxkIGhhdmUgY29ycmVjdCBNSU1FIHR5cGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZS5kYXRhLCBpbWFnZURhdGEsICdJbWFnZSBzaG91bGQgaGF2ZSBjb3JyZWN0IGRhdGEnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0Nhc2UgaW5zZW5zaXRpdmUgaW1hZ2UgZXh0ZW5zaW9ucyB3b3JrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGltYWdlRGF0YSA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UgaW1hZ2UgZGF0YScpO1xuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCk7XG5cdFx0ZmlsZUNvbnRlbnRNYXAuc2V0KFVSSS5wYXJzZSgnZmlsZTovLy9pbWFnZS5QTkcnKSwgaW1hZ2VEYXRhKTtcblx0XHRmaWxlQ29udGVudE1hcC5zZXQoVVJJLnBhcnNlKCdmaWxlOi8vL3Bob3RvLkpQRUcnKSwgaW1hZ2VEYXRhKTtcblxuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0e1xuXHRcdFx0XHRjYWxsSWQ6ICd0ZXN0LWNhc2UnLFxuXHRcdFx0XHR0b29sSWQ6ICdmZXRjaC1wYWdlJyxcblx0XHRcdFx0cGFyYW1ldGVyczogeyB1cmxzOiBbJ2ZpbGU6Ly8vaW1hZ2UuUE5HJywgJ2ZpbGU6Ly8vcGhvdG8uSlBFRyddIH0sXG5cdFx0XHRcdGNvbnRleHQ6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHQpO1xuXG5cdFx0Ly8gQm90aCBzaG91bGQgYmUgcmV0dXJuZWQgYXMgZGF0YSBwYXJ0cyBkZXNwaXRlIHVwcGVyY2FzZSBleHRlbnNpb25zXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICdkYXRhJywgJ1BORyB3aXRoIHVwcGVyY2FzZSBleHRlbnNpb24gc2hvdWxkIGJlIGRhdGEgcGFydCcpO1xuXHRcdGlmIChyZXN1bHQuY29udGVudFswXS5raW5kID09PSAnZGF0YScpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZS5taW1lVHlwZSwgJ2ltYWdlL3BuZycsICdTaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS5raW5kLCAnZGF0YScsICdKUEVHIHdpdGggdXBwZXJjYXNlIGV4dGVuc2lvbiBzaG91bGQgYmUgZGF0YSBwYXJ0Jyk7XG5cdFx0aWYgKHJlc3VsdC5jb250ZW50WzFdLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLnZhbHVlLm1pbWVUeXBlLCAnaW1hZ2UvanBlZycsICdTaG91bGQgaGF2ZSBjb3JyZWN0IE1JTUUgdHlwZScpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gQ29tcHJlaGVuc2l2ZSB0ZXN0cyBmb3IgdG9vbFJlc3VsdERldGFpbHNcblx0c3VpdGUoJ3Rvb2xSZXN1bHREZXRhaWxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIG9ubHkgc3VjY2Vzc2Z1bGx5IGZldGNoZWQgVVJJcyBpbiBjb3JyZWN0IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2ViQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KFtcblx0XHRcdFx0W1VSSS5wYXJzZSgnaHR0cHM6Ly9zdWNjZXNzMS5jb20nKSwgJ0NvbnRlbnQgMSddLFxuXHRcdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL3N1Y2Nlc3MyLmNvbScpLCAnQ29udGVudCAyJ11cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBmaWxlQ29udGVudE1hcCA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oW1xuXHRcdFx0XHRbVVJJLnBhcnNlKCdmaWxlOi8vL3N1Y2Nlc3MudHh0JyksICdGaWxlIGNvbnRlbnQnXSxcblx0XHRcdFx0W1VSSS5wYXJzZSgnbWNwLXJlc291cmNlOi8vc2VydmVyL2ZpbGUudHh0JyksICdNQ1AgY29udGVudCddXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKHdlYkNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRlc3RVcmxzID0gW1xuXHRcdFx0XHQnaHR0cHM6Ly9zdWNjZXNzMS5jb20nLCAgICAgICAvLyBpbmRleCAwIC0gc2hvdWxkIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRcdCdpbnZhbGlkLXVybCcsICAgICAgICAgICAgICAgIC8vIGluZGV4IDEgLSBzaG91bGQgTk9UIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRcdCdmaWxlOi8vL3N1Y2Nlc3MudHh0JywgICAgICAgIC8vIGluZGV4IDIgLSBzaG91bGQgYmUgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdFx0J2h0dHBzOi8vc3VjY2VzczIuY29tJywgICAgICAgLy8gaW5kZXggMyAtIHNob3VsZCBiZSBpbiB0b29sUmVzdWx0RGV0YWlsc1xuXHRcdFx0XHQnZmlsZTovLy9ub25leGlzdGVudC50eHQnLCAgICAvLyBpbmRleCA0IC0gc2hvdWxkIE5PVCBiZSBpbiB0b29sUmVzdWx0RGV0YWlsc1xuXHRcdFx0XHQnbWNwLXJlc291cmNlOi8vc2VydmVyL2ZpbGUudHh0JyAvLyBpbmRleCA1IC0gc2hvdWxkIGJlIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWRldGFpbHMnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiB0ZXN0VXJscyB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdC8vIFZlcmlmeSB0b29sUmVzdWx0RGV0YWlscyBjb250YWlucyBleGFjdGx5IHRoZSBzdWNjZXNzZnVsIFVSSXNcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyksICd0b29sUmVzdWx0RGV0YWlscyBzaG91bGQgYmUgYW4gYXJyYXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMubGVuZ3RoLCA0LCAnU2hvdWxkIGhhdmUgNCBzdWNjZXNzZnVsIFVSSXMnKTtcblxuXHRcdFx0Ly8gQ2hlY2sgdGhhdCBhbGwgZW50cmllcyBhcmUgVVJJIG9iamVjdHNcblx0XHRcdGNvbnN0IHVyaURldGFpbHMgPSByZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW107XG5cdFx0XHRhc3NlcnQub2sodXJpRGV0YWlscy5ldmVyeSh1cmkgPT4gdXJpIGluc3RhbmNlb2YgVVJJKSwgJ0FsbCB0b29sUmVzdWx0RGV0YWlscyBlbnRyaWVzIHNob3VsZCBiZSBVUkkgb2JqZWN0cycpO1xuXG5cdFx0XHQvLyBDaGVjayBzcGVjaWZpYyBVUklzIGFyZSBpbmNsdWRlZCAod2ViIFVSSXMgZmlyc3QsIHRoZW4gc3VjY2Vzc2Z1bCBmaWxlIFVSSXMpXG5cdFx0XHRjb25zdCBleHBlY3RlZFVyaXMgPSBbXG5cdFx0XHRcdCdodHRwczovL3N1Y2Nlc3MxLmNvbS8nLFxuXHRcdFx0XHQnaHR0cHM6Ly9zdWNjZXNzMi5jb20vJyxcblx0XHRcdFx0J2ZpbGU6Ly8vc3VjY2Vzcy50eHQnLFxuXHRcdFx0XHQnbWNwLXJlc291cmNlOi8vc2VydmVyL2ZpbGUudHh0J1xuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsVXJpU3RyaW5ncyA9IHVyaURldGFpbHMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFVyaVN0cmluZ3Muc29ydCgpLCBleHBlY3RlZFVyaXMuc29ydCgpLCAnU2hvdWxkIGNvbnRhaW4gZXhhY3RseSB0aGUgZXhwZWN0ZWQgc3VjY2Vzc2Z1bCBVUklzJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IGFycmF5IG1hdGNoZXMgaW5wdXQgb3JkZXIgKGluY2x1ZGluZyBmYWlsdXJlcylcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDYsICdDb250ZW50IHNob3VsZCBoYXZlIHJlc3VsdCBmb3IgZWFjaCBpbnB1dCBVUkwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFswXS52YWx1ZSwgJ0NvbnRlbnQgMScsICdGaXJzdCB3ZWIgVVJJIGNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ0ludmFsaWQgVVJMIG1hcmtlZCBhcyBpbnZhbGlkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMl0udmFsdWUsICdGaWxlIGNvbnRlbnQnLCAnRmlsZSBVUkkgY29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzNdLnZhbHVlLCAnQ29udGVudCAyJywgJ1NlY29uZCB3ZWIgVVJJIGNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFs0XS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ05vbmV4aXN0ZW50IGZpbGUgbWFya2VkIGFzIGludmFsaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFs1XS52YWx1ZSwgJ01DUCBjb250ZW50JywgJ01DUCByZXNvdXJjZSBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXhjbHVkZSBmYWlsZWQgd2ViIHJlcXVlc3RzIGZyb20gdG9vbFJlc3VsdERldGFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXQgdXAgd2ViIGNvbnRlbnQgZXh0cmFjdG9yIHRoYXQgd2lsbCB0aHJvdyBmb3Igc29tZSBVUklzXG5cdFx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL3N1Y2Nlc3MuY29tJyksICdTdWNjZXNzIGNvbnRlbnQnXVxuXHRcdFx0XHQvLyBodHRwczovL2ZhaWx1cmUuY29tIG5vdCBpbiBtYXAgLSB3aWxsIHRocm93IGVycm9yXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKHdlYkNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZShbXSksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRlc3RVcmxzID0gW1xuXHRcdFx0XHQnaHR0cHM6Ly9zdWNjZXNzLmNvbScsICAvLyBTaG91bGQgc3VjY2VlZFxuXHRcdFx0XHQnaHR0cHM6Ly9mYWlsdXJlLmNvbScgICAvLyBTaG91bGQgZmFpbCAobm90IGluIGNvbnRlbnQgbWFwKVxuXHRcdFx0XTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LXdlYi1mYWlsdXJlJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogdGVzdFVybHMgfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHdlYiBleHRyYWN0b3IgdGhyb3dzLCBpdCBzaG91bGQgYmUgaGFuZGxlZCBncmFjZWZ1bGx5XG5cdFx0XHRcdC8vIEJ1dCBpbiB0aGlzIHRlc3Qgc2V0dXAsIHRoZSBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgdGhyb3dzIGZvciBtaXNzaW5nIGNvbnRlbnRcblx0XHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIHRlc3Qgd2ViIGNvbnRlbnQgZXh0cmFjdG9yIHRvIHRocm93IGZvciBtaXNzaW5nIFVSSScpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gVGhpcyBpcyBleHBlY3RlZCBiZWhhdmlvciB3aXRoIHRoZSBjdXJyZW50IHRlc3Qgc2V0dXBcblx0XHRcdFx0Ly8gVGhlIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB0aHJvd3Mgd2hlbiBjb250ZW50IGlzIG5vdCBmb3VuZFxuXHRcdFx0XHRhc3NlcnQub2soZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTm8gY29udGVudCBjb25maWd1cmVkIGZvciBVUkknKSwgJ1Nob3VsZCB0aHJvdyBmb3IgdW5jb25maWd1cmVkIFVSSScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4Y2x1ZGUgZmFpbGVkIGZpbGUgcmVhZHMgZnJvbSB0b29sUmVzdWx0RGV0YWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vZXhpc3RpbmcudHh0JyksICdGaWxlIGV4aXN0cyddXG5cdFx0XHRcdC8vIGZpbGU6Ly8vbWlzc2luZy50eHQgbm90IGluIG1hcCAtIHdpbGwgdGhyb3cgZXJyb3Jcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZz4oKSksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShmaWxlQ29udGVudE1hcCksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGVzdFVybHMgPSBbXG5cdFx0XHRcdCdmaWxlOi8vL2V4aXN0aW5nLnR4dCcsICAvLyBTaG91bGQgc3VjY2VlZFxuXHRcdFx0XHQnZmlsZTovLy9taXNzaW5nLnR4dCcgICAgLy8gU2hvdWxkIGZhaWwgKG5vdCBpbiBmaWxlIG1hcClcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtZmlsZS1mYWlsdXJlJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogdGVzdFVybHMgfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgb25seSBzdWNjZXNzZnVsIGZpbGUgVVJJIGlzIGluIHRvb2xSZXN1bHREZXRhaWxzXG5cdFx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheShyZXN1bHQudG9vbFJlc3VsdERldGFpbHMpLCAndG9vbFJlc3VsdERldGFpbHMgc2hvdWxkIGJlIGFuIGFycmF5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIG9ubHkgMSBzdWNjZXNzZnVsIFVSSScpO1xuXG5cdFx0XHRjb25zdCB1cmlEZXRhaWxzID0gcmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzIGFzIFVSSVtdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaURldGFpbHNbMF0udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vZXhpc3RpbmcudHh0JywgJ1Nob3VsZCBjb250YWluIG9ubHkgdGhlIHN1Y2Nlc3NmdWwgZmlsZSBVUkknKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGNvbnRlbnQgcmVmbGVjdHMgYm90aCBhdHRlbXB0c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50Lmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIHJlc3VsdHMgZm9yIGJvdGggaW5wdXQgVVJMcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnRmlsZSBleGlzdHMnLCAnRmlyc3QgZmlsZSBzaG91bGQgaGF2ZSBjb250ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMV0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdTZWNvbmQgZmlsZSBzaG91bGQgYmUgbWFya2VkIGludmFsaWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgc3VjY2VzcyBhbmQgZmFpbHVyZSBzY2VuYXJpb3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oW1xuXHRcdFx0XHRbVVJJLnBhcnNlKCdodHRwczovL3dlYi1zdWNjZXNzLmNvbScpLCAnV2ViIHN1Y2Nlc3MnXVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vZmlsZS1zdWNjZXNzLnR4dCcpLCAnRmlsZSBzdWNjZXNzJ10sXG5cdFx0XHRcdFtVUkkucGFyc2UoJ21jcC1yZXNvdXJjZTovL2dvb2QvZmlsZS50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTUNQIGJpbmFyeSBjb250ZW50JyldXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKHdlYkNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRlc3RVcmxzID0gW1xuXHRcdFx0XHQnaW52YWxpZC1zY2hlbWU6Ly9iYWQnLCAgICAgIC8vIEludmFsaWQgVVJJXG5cdFx0XHRcdCdodHRwczovL3dlYi1zdWNjZXNzLmNvbScsICAgLy8gV2ViIHN1Y2Nlc3Ncblx0XHRcdFx0J2ZpbGU6Ly8vZmlsZS1taXNzaW5nLnR4dCcsICAvLyBGaWxlIGZhaWx1cmVcblx0XHRcdFx0J2ZpbGU6Ly8vZmlsZS1zdWNjZXNzLnR4dCcsICAvLyBGaWxlIHN1Y2Nlc3Ncblx0XHRcdFx0J2NvbXBsZXRlbHktaW52YWxpZC11cmwnLCAgICAvLyBJbnZhbGlkIFVSTCBmb3JtYXRcblx0XHRcdFx0J21jcC1yZXNvdXJjZTovL2dvb2QvZmlsZS50eHQnIC8vIE1DUCBzdWNjZXNzXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LW1peGVkJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogdGVzdFVybHMgfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSAzIHN1Y2Nlc3NmdWwgVVJJczogd2ViLXN1Y2Nlc3MsIGZpbGUtc3VjY2VzcywgbWNwLXN1Y2Nlc3Ncblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyksICd0b29sUmVzdWx0RGV0YWlscyBzaG91bGQgYmUgYW4gYXJyYXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzIGFzIFVSSVtdKS5sZW5ndGgsIDMsICdTaG91bGQgaGF2ZSAzIHN1Y2Nlc3NmdWwgVVJJcycpO1xuXG5cdFx0XHRjb25zdCB1cmlEZXRhaWxzID0gcmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzIGFzIFVSSVtdO1xuXHRcdFx0Y29uc3QgYWN0dWFsVXJpU3RyaW5ncyA9IHVyaURldGFpbHMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZFN1Y2Nlc3NmdWwgPSBbXG5cdFx0XHRcdCdodHRwczovL3dlYi1zdWNjZXNzLmNvbS8nLFxuXHRcdFx0XHQnZmlsZTovLy9maWxlLXN1Y2Nlc3MudHh0Jyxcblx0XHRcdFx0J21jcC1yZXNvdXJjZTovL2dvb2QvZmlsZS50eHQnXG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFVyaVN0cmluZ3Muc29ydCgpLCBleHBlY3RlZFN1Y2Nlc3NmdWwuc29ydCgpLCAnU2hvdWxkIGNvbnRhaW4gZXhhY3RseSB0aGUgc3VjY2Vzc2Z1bCBVUklzJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBjb250ZW50IGFycmF5IHJlZmxlY3RzIGFsbCBpbnB1dHMgaW4gb3JpZ2luYWwgb3JkZXJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDYsICdTaG91bGQgaGF2ZSByZXN1bHRzIGZvciBhbGwgaW5wdXQgVVJMcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLCAnSW52YWxpZCBVUkwnLCAnSW52YWxpZCBzY2hlbWUgbWFya2VkIGFzIGludmFsaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsxXS52YWx1ZSwgJ1dlYiBzdWNjZXNzJywgJ1dlYiBzdWNjZXNzIGNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudFsyXS52YWx1ZSwgJ0ludmFsaWQgVVJMJywgJ01pc3NpbmcgZmlsZSBtYXJrZWQgYXMgaW52YWxpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzNdLnZhbHVlLCAnRmlsZSBzdWNjZXNzJywgJ0ZpbGUgc3VjY2VzcyBjb250ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbNF0udmFsdWUsICdJbnZhbGlkIFVSTCcsICdJbnZhbGlkIFVSTCBtYXJrZWQgYXMgaW52YWxpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzVdLnZhbHVlLCAnTUNQIGJpbmFyeSBjb250ZW50JywgJ01DUCBzdWNjZXNzIGNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgdG9vbFJlc3VsdERldGFpbHMgd2hlbiBhbGwgcmVxdWVzdHMgZmFpbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBuZXcgRmV0Y2hXZWJQYWdlVG9vbChcblx0XHRcdFx0bmV3IFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKSwgLy8gRW1wdHkgLSBhbGwgd2ViIHJlcXVlc3RzIGZhaWxcblx0XHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKSksIC8vIEVtcHR5IC0gYWxsIGZpbGUgLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKFtdKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGVzdFVybHMgPSBbXG5cdFx0XHRcdCdodHRwczovL25vbmV4aXN0ZW50LmNvbScsXG5cdFx0XHRcdCdmaWxlOi8vL21pc3NpbmcudHh0Jyxcblx0XHRcdFx0J2ludmFsaWQtdXJsJyxcblx0XHRcdFx0J2JhZDovL3NjaGVtZSdcblx0XHRcdF07XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRcdHsgY2FsbElkOiAndGVzdC1hbGwtZmFpbCcsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IHRlc3RVcmxzIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdC8vIElmIHdlYiBleHRyYWN0b3IgZG9lc24ndCB0aHJvdywgY2hlY2sgdGhlIHJlc3VsdHNcblx0XHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzKSwgJ3Rvb2xSZXN1bHREZXRhaWxzIHNob3VsZCBiZSBhbiBhcnJheScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyBhcyBVUklbXSkubGVuZ3RoLCAwLCAnU2hvdWxkIGhhdmUgbm8gc3VjY2Vzc2Z1bCBVUklzJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDQsICdTaG91bGQgaGF2ZSByZXN1bHRzIGZvciBhbGwgaW5wdXQgVVJMcycpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0LmNvbnRlbnQuZXZlcnkoY29udGVudCA9PiBjb250ZW50LnZhbHVlID09PSAnSW52YWxpZCBVUkwnKSwgJ0FsbCBjb250ZW50IHNob3VsZCBiZSBtYXJrZWQgYXMgaW52YWxpZCcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gRXhwZWN0ZWQgd2l0aCBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Ugd2hlbiBubyBjb250ZW50IGlzIGNvbmZpZ3VyZWRcblx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ05vIGNvbnRlbnQgY29uZmlndXJlZCBmb3IgVVJJJyksICdTaG91bGQgdGhyb3cgZm9yIHVuY29uZmlndXJlZCBVUkknKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgVVJMIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZShbXSksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtZW1wdHknLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbXSB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEsICdTaG91bGQgaGF2ZSBvbmUgY29udGVudCBpdGVtIGZvciBlbXB0eSBVUkxzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0udmFsdWUsICdObyB2YWxpZCBVUkxzIHByb3ZpZGVkLicsICdTaG91bGQgaW5kaWNhdGUgbm8gdmFsaWQgVVJMcycpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQudG9vbFJlc3VsdERldGFpbHMsICd0b29sUmVzdWx0RGV0YWlscyBzaG91bGQgbm90IGJlIHByZXNlbnQgZm9yIGVtcHR5IFVSTHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgaW1hZ2UgZmlsZXMgaW4gdG9vbFJlc3VsdERldGFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbWFnZUJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2Zha2UtcG5nLWRhdGEnKTtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2ZpbGU6Ly8vaW1hZ2UucG5nJyksIGltYWdlQnVmZmVyXSxcblx0XHRcdFx0W1VSSS5wYXJzZSgnZmlsZTovLy9kb2N1bWVudC50eHQnKSwgJ1RleHQgY29udGVudCddXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgVGVzdFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCkpLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UoZmlsZUNvbnRlbnRNYXApLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtaW1hZ2VzJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogWydmaWxlOi8vL2ltYWdlLnBuZycsICdmaWxlOi8vL2RvY3VtZW50LnR4dCddIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQm90aCBmaWxlcyBzaG91bGQgYmUgc3VjY2Vzc2Z1bCBhbmQgaW4gdG9vbFJlc3VsdERldGFpbHNcblx0XHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJlc3VsdC50b29sUmVzdWx0RGV0YWlscyksICd0b29sUmVzdWx0RGV0YWlscyBzaG91bGQgYmUgYW4gYXJyYXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzIGFzIFVSSVtdKS5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIHN1Y2Nlc3NmdWwgZmlsZSBVUklzJyk7XG5cblx0XHRcdGNvbnN0IHVyaURldGFpbHMgPSByZXN1bHQudG9vbFJlc3VsdERldGFpbHMgYXMgVVJJW107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpRGV0YWlsc1swXS50b1N0cmluZygpLCAnZmlsZTovLy9pbWFnZS5wbmcnLCAnU2hvdWxkIGluY2x1ZGUgaW1hZ2UgZmlsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaURldGFpbHNbMV0udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vZG9jdW1lbnQudHh0JywgJ1Nob3VsZCBpbmNsdWRlIHRleHQgZmlsZScpO1xuXG5cdFx0XHQvLyBDaGVjayBjb250ZW50IHR5cGVzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbnRlbnRbMF0ua2luZCwgJ2RhdGEnLCAnSW1hZ2Ugc2hvdWxkIGJlIGRhdGEgcGFydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzFdLmtpbmQsICd0ZXh0JywgJ1RleHQgZmlsZSBzaG91bGQgYmUgdGV4dCBwYXJ0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25maXJtUmVzdWx0cyBpcyBmYWxzZSB3aGVuIGFsbCB3ZWIgY29udGVudHMgYXJlIGVycm9ycyBvciByZWRpcmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZWJDb250ZW50TWFwID0gbmV3IFJlc291cmNlTWFwPHN0cmluZz4oKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIod2ViQ29udGVudE1hcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGV4dHJhY3QodXJpczogVVJJW10pOiBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0W10+IHtcblx0XHRcdFx0XHRcdHJldHVybiB1cmlzLm1hcCgoKSA9PiAoeyBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiAnRmFpbGVkIHRvIGZldGNoJyB9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KCksXG5cdFx0XHRcdG5ldyBFeHRlbmRlZFRlc3RGaWxlU2VydmljZShuZXcgUmVzb3VyY2VNYXA8c3RyaW5nIHwgVlNCdWZmZXI+KCkpLFxuXHRcdFx0XHRuZXcgTW9ja1RydXN0ZWREb21haW5TZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UoKSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7IGNhbGxJZDogJ3Rlc3QtY2FsbCcsIHRvb2xJZDogJ2ZldGNoLXBhZ2UnLCBwYXJhbWV0ZXJzOiB7IHVybHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddIH0sIGNvbnRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoMCksXG5cdFx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25maXJtUmVzdWx0cywgZmFsc2UsICdjb25maXJtUmVzdWx0cyBzaG91bGQgYmUgZmFsc2Ugd2hlbiBhbGwgcmVzdWx0cyBhcmUgZXJyb3JzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25maXJtUmVzdWx0cyBpcyBmYWxzZSB3aGVuIGFsbCB3ZWIgY29udGVudHMgYXJlIHJlZGlyZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpO1xuXG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcih3ZWJDb250ZW50TWFwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZXh0cmFjdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V2ViQ29udGVudEV4dHJhY3RSZXN1bHRbXT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVyaXMubWFwKCgpID0+ICh7IHN0YXR1czogJ3JlZGlyZWN0JywgdG9VUkk6IFVSSS5wYXJzZSgnaHR0cHM6Ly9yZWRpcmVjdGVkLmNvbScpIH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oKSxcblx0XHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKSksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1jYWxsJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL2V4YW1wbGUuY29tJ10gfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpcm1SZXN1bHRzLCBmYWxzZSwgJ2NvbmZpcm1SZXN1bHRzIHNob3VsZCBiZSBmYWxzZSB3aGVuIGFsbCByZXN1bHRzIGFyZSByZWRpcmVjdHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmZpcm1SZXN1bHRzIGlzIHVuZGVmaW5lZCB3aGVuIGF0IGxlYXN0IG9uZSB3ZWIgY29udGVudCBzdWNjZWVkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdlYkNvbnRlbnRNYXAgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPihbXG5cdFx0XHRcdFtVUkkucGFyc2UoJ2h0dHBzOi8vc3VjY2Vzcy5jb20nKSwgJ1N1Y2Nlc3MgY29udGVudCddXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IG5ldyBGZXRjaFdlYlBhZ2VUb29sKFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0V2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2Uge1xuXHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0c3VwZXIod2ViQ29udGVudE1hcCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGV4dHJhY3QodXJpczogVVJJW10pOiBQcm9taXNlPFdlYkNvbnRlbnRFeHRyYWN0UmVzdWx0W10+IHtcblx0XHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHRcdHsgc3RhdHVzOiAnb2snLCByZXN1bHQ6ICdTdWNjZXNzIGNvbnRlbnQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogJ0ZhaWxlZCcgfVxuXHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0oKSxcblx0XHRcdFx0bmV3IEV4dGVuZGVkVGVzdEZpbGVTZXJ2aWNlKG5ldyBSZXNvdXJjZU1hcDxzdHJpbmcgfCBWU0J1ZmZlcj4oKSksXG5cdFx0XHRcdG5ldyBNb2NrVHJ1c3RlZERvbWFpblNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tDaGF0U2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBNb2NrQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdHsgY2FsbElkOiAndGVzdC1jYWxsJywgdG9vbElkOiAnZmV0Y2gtcGFnZScsIHBhcmFtZXRlcnM6IHsgdXJsczogWydodHRwczovL3N1Y2Nlc3MuY29tJywgJ2h0dHBzOi8vZXJyb3IuY29tJ10gfSwgY29udGV4dDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgwKSxcblx0XHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbmZpcm1SZXN1bHRzLCB1bmRlZmluZWQsICdjb25maXJtUmVzdWx0cyBzaG91bGQgYmUgdW5kZWZpbmVkIHdoZW4gYXQgbGVhc3Qgb25lIHJlc3VsdCBzdWNjZWVkcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVkaXJlY3QgcmVzdWx0IHByb3ZpZGVzIGNvcnJlY3QgbWVzc2FnZSB3aXRoIG5ldyBVUkwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWRpcmVjdFVSSSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9yZWRpcmVjdGVkLmNvbS9wYWdlJyk7XG5cdFx0XHRjb25zdCB0b29sID0gbmV3IEZldGNoV2ViUGFnZVRvb2woXG5cdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIFRlc3RXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB7XG5cdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRzdXBlcihuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZXh0cmFjdCh1cmlzOiBVUklbXSk6IFByb21pc2U8V2ViQ29udGVudEV4dHJhY3RSZXN1bHRbXT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7IHN0YXR1czogJ3JlZGlyZWN0JywgdG9VUkk6IHJlZGlyZWN0VVJJIH1dO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSgpLFxuXHRcdFx0XHRuZXcgRXh0ZW5kZWRUZXN0RmlsZVNlcnZpY2UobmV3IFJlc291cmNlTWFwPHN0cmluZyB8IFZTQnVmZmVyPigpKSxcblx0XHRcdFx0bmV3IE1vY2tUcnVzdGVkRG9tYWluU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSxcblx0XHRcdFx0bmV3IE1vY2tBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlKCksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0eyBjYWxsSWQ6ICd0ZXN0LWNhbGwnLCB0b29sSWQ6ICdmZXRjaC1wYWdlJywgcGFyYW1ldGVyczogeyB1cmxzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSB9LCBjb250ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKDApLFxuXHRcdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb250ZW50WzBdLmtpbmQsICd0ZXh0Jyk7XG5cdFx0XHRpZiAocmVzdWx0LmNvbnRlbnRbMF0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQuY29udGVudFswXS52YWx1ZS5pbmNsdWRlcyhyZWRpcmVjdFVSSS50b1N0cmluZyh0cnVlKSksICdSZWRpcmVjdCBtZXNzYWdlIHNob3VsZCBpbmNsdWRlIHRhcmdldCBVUkwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5jb250ZW50WzBdLnZhbHVlLmluY2x1ZGVzKEludGVybmFsRmV0Y2hXZWJQYWdlVG9vbElkKSwgJ1JlZGlyZWN0IG1lc3NhZ2Ugc2hvdWxkIHN1Z2dlc3QgdXNpbmcgdG9vbCBhZ2FpbicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtDQUErQztBQUd4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQix1QkFBdUI7QUFDcEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBR3RCLE1BQU0sK0JBQXNFO0FBQUEsRUFHM0UsWUFBb0IsaUJBQXNDO0FBQXRDO0FBQUEsRUFBd0M7QUFBQSxFQUU1RCxNQUFNLFFBQVEsTUFBaUQ7QUFDOUQsV0FBTyxLQUFLLElBQUksU0FBTztBQUN0QixZQUFNLFVBQVUsS0FBSyxnQkFBZ0IsSUFBSSxHQUFHO0FBQzVDLFVBQUksWUFBWSxRQUFXO0FBQzFCLGNBQU0sSUFBSSxNQUFNLGtDQUFrQyxJQUFJLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDbkU7QUFDQSxhQUFPLEVBQUUsUUFBUSxNQUFNLFFBQVEsUUFBUTtBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxNQUFNLGdDQUFnQyxnQkFBZ0I7QUFBQSxFQUNyRCxZQUFvQixpQkFBaUQ7QUFDcEUsVUFBTTtBQURhO0FBQUEsRUFFcEI7QUFBQSxFQUVBLE1BQWUsU0FBUyxVQUFlLFNBQStEO0FBQ3JHLFVBQU0sVUFBVSxL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
