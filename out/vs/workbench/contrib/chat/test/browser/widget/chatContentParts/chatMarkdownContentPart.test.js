import assert from "assert";
import { Event } from "../../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { SymbolKind, SymbolTag } from "../../../../../../../editor/common/languages.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { toAgentHostUri } from "../../../../../../../platform/agentHost/common/agentHostUri.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatMarkdownContentPart } from "../../../../browser/widget/chatContentParts/chatMarkdownContentPart.js";
import { ChatContentMarkdownRenderer } from "../../../../browser/widget/chatContentMarkdownRenderer.js";
import { IChatOutputRendererService } from "../../../../browser/chatOutputItemRenderer.js";
import { IChatOutputPartStateCache } from "../../../../browser/widget/chatContentParts/chatOutputPartStateCache.js";
import { IChatSessionsService } from "../../../../common/chatSessionsService.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { rewriteAgentHostLinkTarget } from "../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js";
import { IAiEditTelemetryService } from "../../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { IViewDescriptorService } from "../../../../../../common/views.js";
import { MockChatSessionsService } from "../../../common/mockChatSessionsService.js";
suite("ChatMarkdownContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let editorPool;
  let renderer;
  let chatSessionsService;
  const renderedCodeBlocks = [];
  const renderedCodeBlockOutputs = [];
  let outputStateCache;
  function createMockEditorPool() {
    return {
      get() {
        const element = mainWindow.document.createElement("div");
        const mockPart = {
          element,
          get uri() {
            return void 0;
          },
          render(data, _width) {
            renderedCodeBlocks.push(data);
          },
          layout() {
          },
          focus() {
          },
          reset() {
          },
          onDidRemount() {
          }
        };
        return {
          object: mockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      },
      inUse: () => [],
      dispose: () => {
      }
    };
  }
  function createRenderContext(isComplete = true) {
    const mockElement = {
      isComplete,
      isCompleteAddedRequest: false,
      id: "test-response-id",
      sessionResource: URI.parse("chat-session://test/session1"),
      setVote: () => {
      },
      contentReferences: [],
      get model() {
        return {};
      }
    };
    const markdownContent = { kind: "markdownContent", content: new MarkdownString("") };
    return {
      element: mockElement,
      inlineTextModels: void 0,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [markdownContent],
      contentIndex: 0,
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: {},
      currentWidth: observableValue("currentWidth", 500),
      onDidChangeVisibility: Event.None
    };
  }
  function createMarkdownPart(markdownText, context, fillInIncompleteTokens = false) {
    const ctx = context ?? createRenderContext();
    return store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString(markdownText) },
      ctx,
      editorPool,
      fillInIncompleteTokens,
      ctx.codeBlockStartIndex,
      renderer,
      void 0,
      // markdownRenderOptions
      500,
      // currentWidth
      {}
      // rendererOptions
    ));
  }
  function createMarkdownPartWithInlineReferences(markdownText, inlineReferences, context, fillInIncompleteTokens = false) {
    const ctx = context ?? createRenderContext();
    return store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString(markdownText), inlineReferences },
      ctx,
      editorPool,
      fillInIncompleteTokens,
      ctx.codeBlockStartIndex,
      renderer,
      void 0,
      500,
      {}
    ));
  }
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, disposables);
    chatSessionsService = new MockChatSessionsService();
    instantiationService.stub(IChatSessionsService, chatSessionsService);
    renderedCodeBlocks.length = 0;
    renderedCodeBlockOutputs.length = 0;
    outputStateCache = /* @__PURE__ */ new Map();
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration("chat", {
      editor: {
        fontSize: 13,
        fontFamily: "default",
        fontWeight: "normal",
        lineHeight: 0,
        wordWrap: "on"
      }
    });
    configService.setUserConfiguration("editor", {
      fontFamily: "Consolas",
      fontLigatures: false,
      accessibilitySupport: "off"
    });
    instantiationService.stub(IHoverService, {
      _serviceBrand: void 0,
      showDelayedHover: () => void 0,
      setupDelayedHover: () => ({ dispose: () => {
      } }),
      setupDelayedHoverAtMouse: () => ({ dispose: () => {
      } }),
      showInstantHover: () => void 0,
      hideHover: () => {
      },
      showAndFocusLastHover: () => {
      },
      setupManagedHover: () => ({ dispose: () => {
      }, show: () => {
      }, hide: () => {
      }, update: () => {
      } }),
      showManagedHover: () => {
      }
    });
    instantiationService.stub(IAiEditTelemetryService, {
      _serviceBrand: void 0,
      createSuggestionId: () => void 0,
      handleCodeAccepted: () => {
      },
      handleCodeRejected: () => {
      }
    });
    instantiationService.stub(IChatOutputRendererService, {
      _serviceBrand: void 0,
      registerRenderer: () => ({ dispose: () => {
      } }),
      hasCodeBlockRenderer: (identifier) => identifier.toLowerCase() === "mermaid",
      renderOutputPart: async () => {
        throw new Error("Unexpected output render");
      },
      renderCodeBlock: async (identifier, data) => {
        renderedCodeBlockOutputs.push({ identifier, text: new TextDecoder().decode(data) });
        return {
          webview: {
            focus: () => {
            },
            onDidWheel: Event.None,
            onDidUpdateState: Event.None
          },
          onDidChangeHeight: Event.None,
          reinitialize: () => {
          },
          dispose: () => {
          }
        };
      }
    });
    instantiationService.stub(IChatOutputPartStateCache, {
      _serviceBrand: void 0,
      get: (key) => outputStateCache.get(key),
      set: (key, state) => outputStateCache.set(key, state)
    });
    instantiationService.stub(IViewDescriptorService, {
      onDidChangeLocation: Event.None,
      onDidChangeContainer: Event.None,
      getViewLocationById: () => null
    });
    renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
    editorPool = createMockEditorPool();
  });
  teardown(() => {
    disposables.dispose();
  });
  test("transforms accumulated response Markdown while preserving link text", () => {
    disposables.add(chatSessionsService.registerChatSessionContentProvider("chat-session", {
      provideChatSessionContent: async () => {
        throw new Error("Unexpected session resolution");
      },
      resolveChatResponseUri: (_resource, href) => rewriteAgentHostLinkTarget(href, "my-host")
    }));
    const part = createMarkdownPart('`[foo.ts](/code.ts)` [a[b].ts](/remote/a.ts "/remote/a.ts"), [a\\*b.ts](/remote/b.ts), [line.ts](/remote/line.ts:42), [column.ts](/remote/column.ts:42:7), [windows.ts](C:/remote/windows.ts:42), [unc.ts](//server/share/unc.ts:42), [skill](/remote/skill/SKILL.md), and [file-uri.ts](file:///remote/file-uri.ts:42). ![image](/remote/image.png)');
    const links = Array.from(part.domNode.querySelectorAll("a"));
    const skillUri = toAgentHostUri(URI.file("/remote/skill/SKILL.md"), "my-host");
    assert.deepStrictEqual(
      {
        links: links.map((link) => ({ text: link.textContent, href: link.dataset.href })),
        imageSource: part.domNode.querySelector("img")?.getAttribute("src")
      },
      {
        links: [
          { text: "a[b].ts", href: toAgentHostUri(URI.file("/remote/a.ts"), "my-host").toString() },
          { text: "a*b.ts", href: toAgentHostUri(URI.file("/remote/b.ts"), "my-host").toString() },
          { text: "line.ts", href: toAgentHostUri(URI.file("/remote/line.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "column.ts", href: toAgentHostUri(URI.file("/remote/column.ts").with({ fragment: "L42,7" }), "my-host").toString() },
          { text: "windows.ts", href: toAgentHostUri(URI.file("C:/remote/windows.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "unc.ts", href: toAgentHostUri(URI.file("//server/share/unc.ts").with({ fragment: "L42" }), "my-host").toString() },
          { text: "skill", href: skillUri.with({ query: `${skillUri.query}&vscodeLinkType=skill` }).toString() },
          { text: "file-uri.ts", href: toAgentHostUri(URI.file("/remote/file-uri.ts").with({ fragment: "L42" }), "my-host").toString() }
        ],
        imageSource: null
      }
    );
  });
  test("renders plain markdown without code blocks", () => {
    const part = createMarkdownPart("Hello, world!");
    assert.ok(part.domNode);
    assert.strictEqual(part.codeblocks.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.ok(part.domNode.textContent?.includes("Hello, world!"));
  });
  test("renders a single code block and passes text to CodeBlockPart", () => {
    const part = createMarkdownPart('```javascript\nconsole.log("hello");\n```');
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
    assert.strictEqual(part.codeblocks[0].languageId, "javascript");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(renderedCodeBlocks[0].languageId, "javascript");
  });
  test("renders complete code block with contributed chat output renderer", () => {
    const part = createMarkdownPart("```mermaid\ngraph TD\n```");
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "mermaid");
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: "mermaid", text: "graph TD" }]);
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
  });
  test("renders complete code block with contributed chat output renderer case-insensitively", () => {
    const part = createMarkdownPart("```Mermaid\ngraph TD\n```");
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "Mermaid");
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.deepStrictEqual(renderedCodeBlockOutputs, [{ identifier: "Mermaid", text: "graph TD" }]);
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
  });
  test("reuses rendered code block webview across incremental rerenders when content is unchanged", async () => {
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
    const ctx = createRenderContext(false);
    const markdown = "```mermaid\ngraph TD\n```";
    const part = createMarkdownPart(markdown, ctx, true);
    assert.strictEqual(renderedCodeBlockOutputs.length, 1);
    assert.strictEqual(part.tryIncrementalUpdate({ kind: "markdownContent", content: new MarkdownString(`${markdown}

Next paragraph`) }), true);
    await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
    assert.deepStrictEqual({
      renderedOutputs: renderedCodeBlockOutputs,
      outputBlockCount: part.domNode.querySelectorAll(".chat-output-code-block").length
    }, {
      renderedOutputs: [{ identifier: "mermaid", text: "graph TD" }],
      outputBlockCount: 1
    });
  });
  test("does not render initial incomplete code fence", () => {
    const ctx = createRenderContext(false);
    const part = createMarkdownPart("```", ctx);
    assert.strictEqual(part.codeblocks.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.strictEqual(renderedCodeBlockOutputs.length, 0);
    assert.strictEqual(part.domNode.querySelector(".interactive-result-code-block"), null);
  });
  test("shows pending chat output renderer for incomplete code block", () => {
    const ctx = createRenderContext(false);
    const part = createMarkdownPart("```mermaid\ngraph TD", ctx);
    assert.strictEqual(renderedCodeBlockOutputs.length, 0);
    assert.strictEqual(renderedCodeBlocks.length, 0);
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].languageId, "mermaid");
    assert.ok(part.domNode.querySelector(".chat-output-code-block"));
    assert.ok(part.domNode.textContent?.includes("Rendering code block"));
  });
  test("renders multiple code blocks with correct indices", () => {
    const part = createMarkdownPart(
      'Some text\n```python\nprint("a")\n```\nMore text\n```typescript\nconst x = 1;\n```'
    );
    assert.strictEqual(part.codeblocks.length, 2);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 0);
    assert.strictEqual(part.codeblocks[0].languageId, "python");
    assert.strictEqual(part.codeblocks[1].codeBlockIndex, 1);
    assert.strictEqual(part.codeblocks[1].languageId, "typescript");
    assert.strictEqual(renderedCodeBlocks[0].text, 'print("a")');
    assert.strictEqual(renderedCodeBlocks[1].text, "const x = 1;");
  });
  test("code block text is passed correctly", () => {
    const code = 'function greet() {\n  return "hello";\n}';
    createMarkdownPart("```javascript\n" + code + "\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, code);
    assert.strictEqual(renderedCodeBlocks[0].languageId, "javascript");
  });
  test("code block without language id passes empty languageId", () => {
    createMarkdownPart("```\nsome text\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, "some text");
  });
  test("respects codeBlockStartIndex for global indexing", () => {
    const ctx = createRenderContext();
    const part = store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString("```js\ncode\n```") },
      ctx,
      editorPool,
      false,
      5,
      // codeBlockStartIndex
      renderer,
      void 0,
      500,
      {}
    ));
    assert.strictEqual(part.codeblocks.length, 1);
    assert.strictEqual(part.codeblocks[0].codeBlockIndex, 5);
  });
  test("hasSameContent returns true for same markdown", () => {
    const part = createMarkdownPart("Hello");
    assert.ok(part.hasSameContent({ kind: "markdownContent", content: new MarkdownString("Hello") }));
  });
  test("hasSameContent returns false for different markdown", () => {
    const part = createMarkdownPart("Hello");
    assert.ok(!part.hasSameContent({ kind: "markdownContent", content: new MarkdownString("Goodbye") }));
  });
  test("hasSameContent compares inline reference metadata", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    };
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });
    assert.deepStrictEqual({
      equivalentReference: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: { uri, range: new Range(1, 1, 1, 1) },
            name: "Foo"
          }
        }
      }),
      resolvedReference: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              kind: SymbolKind.Class,
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      equivalentReference: true,
      resolvedReference: false
    });
  });
  test("hasSameContent compares workspace symbol metadata", () => {
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: {
        name: "Foo",
        containerName: "Bar",
        kind: SymbolKind.Class,
        tags: [SymbolTag.Deprecated],
        location: { uri, range: new Range(2, 7, 2, 10) }
      },
      name: "Foo"
    };
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference });
    assert.deepStrictEqual({
      equivalentSymbol: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Bar",
              kind: SymbolKind.Class,
              tags: [SymbolTag.Deprecated],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      }),
      differentContainer: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Baz",
              kind: SymbolKind.Class,
              tags: [SymbolTag.Deprecated],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      }),
      differentTags: part.hasSameContent({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              containerName: "Bar",
              kind: SymbolKind.Class,
              tags: [],
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      equivalentSymbol: true,
      differentContainer: false,
      differentTags: false
    });
  });
  test("tryIncrementalUpdate requires unchanged inline reference metadata", () => {
    const configService = instantiationService.get(IConfigurationService);
    configService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
    const uri = URI.parse("file:///workspace/foo.ts");
    const content = "Foo";
    const initialReference = {
      kind: "inlineReference",
      resolveId: "resolve1",
      inlineReference: { uri, range: new Range(1, 1, 1, 1) },
      name: "Foo"
    };
    const context = createRenderContext(false);
    const part = createMarkdownPartWithInlineReferences(content, { 0: initialReference }, context, true);
    assert.deepStrictEqual({
      unchangedReference: part.tryIncrementalUpdate({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: { 0: initialReference }
      }),
      resolvedReference: part.tryIncrementalUpdate({
        kind: "markdownContent",
        content: new MarkdownString(content),
        inlineReferences: {
          0: {
            kind: "inlineReference",
            resolveId: "resolve1",
            inlineReference: {
              name: "Foo",
              kind: SymbolKind.Class,
              location: { uri, range: new Range(2, 7, 2, 10) }
            },
            name: "Foo"
          }
        }
      })
    }, {
      unchangedReference: true,
      resolvedReference: false
    });
  });
  test("php code blocks get php opening tag prepended", () => {
    createMarkdownPart('```php\necho "hello";\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(renderedCodeBlocks[0].text.startsWith("<?php\n"), "PHP code should have <?php prepended");
  });
  test("php code blocks with existing opening tag are not modified", () => {
    createMarkdownPart('```php\n<?php\necho "hello";\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(!renderedCodeBlocks[0].text.startsWith("<?php\n<?php"), "PHP code with existing tag should not be doubled");
  });
  test("strips codeblock uri annotations before rendering standard code blocks", () => {
    createMarkdownPart("```typescript\nconst value = 1;\n<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>\n```");
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.ok(!renderedCodeBlocks[0].text.includes("<vscode_codeblock_uri"));
    assert.strictEqual(renderedCodeBlocks[0].codemapperUri?.toString(), "file:///test.ts");
  });
  test("code block toolbar context is set correctly with code text", () => {
    createMarkdownPart('```js\nconsole.log("hello");\n```');
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(renderedCodeBlocks[0].languageId, "js");
    assert.strictEqual(renderedCodeBlocks[0].codeBlockIndex, 0);
  });
  test("code block maintains content when markdown is re-rendered during streaming", () => {
    const ctx = createRenderContext(
      false
      /* isComplete = false, simulating streaming */
    );
    const part1 = createMarkdownPart("```js\nconsole\n```", ctx);
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, "console");
    assert.strictEqual(part1.codeblocks.length, 1);
    renderedCodeBlocks.length = 0;
    const part2 = createMarkdownPart('```js\nconsole.log("hello");\n```', ctx);
    assert.strictEqual(renderedCodeBlocks.length, 1);
    assert.strictEqual(renderedCodeBlocks[0].text, 'console.log("hello");');
    assert.strictEqual(part2.codeblocks.length, 1);
    assert.strictEqual(part2.codeblocks[0].codeBlockIndex, 0);
  });
  test("code block part element is reused from pool across streaming renders", () => {
    const elements = [];
    const poolWithTracking = {
      get() {
        const element = mainWindow.document.createElement("div");
        elements.push(element);
        const mockPart = {
          element,
          get uri() {
            return void 0;
          },
          render(data, _width) {
            renderedCodeBlocks.push(data);
          },
          layout() {
          },
          focus() {
          },
          reset() {
          },
          onDidRemount() {
          }
        };
        return {
          object: mockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      },
      inUse: () => [],
      dispose: () => {
      }
    };
    const ctx = createRenderContext(false);
    store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString("```js\nconsole\n```") },
      ctx,
      poolWithTracking,
      false,
      0,
      renderer,
      void 0,
      500,
      {}
    ));
    store.add(instantiationService.createInstance(
      ChatMarkdownContentPart,
      { kind: "markdownContent", content: new MarkdownString('```js\nconsole.log("hello");\n```') },
      ctx,
      poolWithTracking,
      false,
      0,
      renderer,
      void 0,
      500,
      {}
    ));
    assert.strictEqual(renderedCodeBlocks.length, 2);
    assert.strictEqual(renderedCodeBlocks[0].text, "console");
    assert.strictEqual(renderedCodeBlocks[1].text, 'console.log("hello");');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU3ltYm9sS2luZCwgU3ltYm9sVGFnIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25Db250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEVkaXRvclBvb2wsIERpZmZFZGl0b3JQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBDb2RlQmxvY2tQYXJ0LCBJQ29kZUJsb2NrRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwgdHlwZSBSZW5kZXJlZE91dHB1dFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2NoYXRPdXRwdXRJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZSwgSU91dHB1dFBhcnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE91dHB1dFBhcnRTdGF0ZUNhY2hlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgcmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L3N0YXRlVG9Qcm9ncmVzc0FkYXB0ZXIuanMnO1xuaW1wb3J0IHsgSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbnN1aXRlKCdDaGF0TWFya2Rvd25Db250ZW50UGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cdGxldCBlZGl0b3JQb29sOiBFZGl0b3JQb29sO1xuXHRsZXQgcmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyO1xuXHRsZXQgY2hhdFNlc3Npb25zU2VydmljZTogTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2U7XG5cblx0LyoqIERhdGEgY2FwdHVyZWQgZnJvbSBlYWNoIENvZGVCbG9ja1BhcnQucmVuZGVyKCkgY2FsbCAqL1xuXHRjb25zdCByZW5kZXJlZENvZGVCbG9ja3M6IElDb2RlQmxvY2tEYXRhW10gPSBbXTtcblx0Y29uc3QgcmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzOiB7IGlkZW50aWZpZXI6IHN0cmluZzsgdGV4dDogc3RyaW5nIH1bXSA9IFtdO1xuXHRsZXQgb3V0cHV0U3RhdGVDYWNoZTogTWFwPHN0cmluZywgSU91dHB1dFBhcnRTdGF0ZT47XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0VkaXRvclBvb2woKTogRWRpdG9yUG9vbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCgpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRjb25zdCBtb2NrUGFydCA9IHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGdldCB1cmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdFx0cmVuZGVyKGRhdGE6IElDb2RlQmxvY2tEYXRhLCBfd2lkdGg6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0cmVuZGVyZWRDb2RlQmxvY2tzLnB1c2goZGF0YSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsYXlvdXQoKSB7IH0sXG5cdFx0XHRcdFx0Zm9jdXMoKSB7IH0sXG5cdFx0XHRcdFx0cmVzZXQoKSB7IH0sXG5cdFx0XHRcdFx0b25EaWRSZW1vdW50KCkgeyB9LFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUJsb2NrUGFydDtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9iamVjdDogbW9ja1BhcnQsXG5cdFx0XHRcdFx0aXNTdGFsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGluVXNlOiAoKSA9PiBbXSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgRWRpdG9yUG9vbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlbmRlckNvbnRleHQoaXNDb21wbGV0ZTogYm9vbGVhbiA9IHRydWUpOiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB7XG5cdFx0Y29uc3QgbW9ja0VsZW1lbnQ6IFBhcnRpYWw8SUNoYXRSZXNwb25zZVZpZXdNb2RlbD4gPSB7XG5cdFx0XHRpc0NvbXBsZXRlLFxuXHRcdFx0aXNDb21wbGV0ZUFkZGVkUmVxdWVzdDogZmFsc2UsXG5cdFx0XHRpZDogJ3Rlc3QtcmVzcG9uc2UtaWQnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbjEnKSxcblx0XHRcdHNldFZvdGU6ICgpID0+IHsgfSxcblx0XHRcdGNvbnRlbnRSZWZlcmVuY2VzOiBbXSxcblx0XHRcdGdldCBtb2RlbCgpIHsgcmV0dXJuIHt9IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWxbJ21vZGVsJ107IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hcmtkb3duQ29udGVudCA9IHsga2luZDogJ21hcmtkb3duQ29udGVudCcgYXMgY29uc3QsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnJykgfTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBtb2NrRWxlbWVudCBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLFxuXHRcdFx0aW5saW5lVGV4dE1vZGVsczogdW5kZWZpbmVkISxcblx0XHRcdGVsZW1lbnRJbmRleDogMCxcblx0XHRcdGNvbnRhaW5lcjogbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdGNvbnRlbnQ6IFttYXJrZG93bkNvbnRlbnRdLFxuXHRcdFx0Y29udGVudEluZGV4OiAwLFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHR0cmVlU3RhcnRJbmRleDogMCxcblx0XHRcdGRpZmZFZGl0b3JQb29sOiB7fSBhcyBEaWZmRWRpdG9yUG9vbCxcblx0XHRcdGN1cnJlbnRXaWR0aDogb2JzZXJ2YWJsZVZhbHVlKCdjdXJyZW50V2lkdGgnLCA1MDApLFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNYXJrZG93blBhcnQobWFya2Rvd25UZXh0OiBzdHJpbmcsIGNvbnRleHQ/OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgZmlsbEluSW5jb21wbGV0ZVRva2VucyA9IGZhbHNlKTogQ2hhdE1hcmtkb3duQ29udGVudFBhcnQge1xuXHRcdGNvbnN0IGN0eCA9IGNvbnRleHQgPz8gY3JlYXRlUmVuZGVyQ29udGV4dCgpO1xuXHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhtYXJrZG93blRleHQpIH0sXG5cdFx0XHRjdHgsXG5cdFx0XHRlZGl0b3JQb29sLFxuXHRcdFx0ZmlsbEluSW5jb21wbGV0ZVRva2Vucyxcblx0XHRcdGN0eC5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0XHR1bmRlZmluZWQsIC8vIG1hcmtkb3duUmVuZGVyT3B0aW9uc1xuXHRcdFx0NTAwLCAvLyBjdXJyZW50V2lkdGhcblx0XHRcdHt9LCAvLyByZW5kZXJlck9wdGlvbnNcblx0XHQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1hcmtkb3duUGFydFdpdGhJbmxpbmVSZWZlcmVuY2VzKG1hcmtkb3duVGV4dDogc3RyaW5nLCBpbmxpbmVSZWZlcmVuY2VzOiBSZWNvcmQ8c3RyaW5nLCBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2U+LCBjb250ZXh0PzogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGZpbGxJbkluY29tcGxldGVUb2tlbnMgPSBmYWxzZSk6IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBjdHggPSBjb250ZXh0ID8/IGNyZWF0ZVJlbmRlckNvbnRleHQoKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobWFya2Rvd25UZXh0KSwgaW5saW5lUmVmZXJlbmNlcyB9LFxuXHRcdFx0Y3R4LFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGZpbGxJbkluY29tcGxldGVUb2tlbnMsXG5cdFx0XHRjdHguY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdHJlbmRlcmVyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0NTAwLFxuXHRcdFx0e30sXG5cdFx0KSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoID0gMDtcblx0XHRyZW5kZXJlZENvZGVCbG9ja091dHB1dHMubGVuZ3RoID0gMDtcblx0XHRvdXRwdXRTdGF0ZUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIElPdXRwdXRQYXJ0U3RhdGU+KCk7XG5cblx0XHQvLyBTZWVkIGNvbmZpZ3VyYXRpb24gdmFsdWVzIG5lZWRlZCBieSBDaGF0RWRpdG9yT3B0aW9uc1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdCcsIHtcblx0XHRcdGVkaXRvcjoge1xuXHRcdFx0XHRmb250U2l6ZTogMTMsXG5cdFx0XHRcdGZvbnRGYW1pbHk6ICdkZWZhdWx0Jyxcblx0XHRcdFx0Zm9udFdlaWdodDogJ25vcm1hbCcsXG5cdFx0XHRcdGxpbmVIZWlnaHQ6IDAsXG5cdFx0XHRcdHdvcmRXcmFwOiAnb24nLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIHtcblx0XHRcdGZvbnRGYW1pbHk6ICdDb25zb2xhcycsXG5cdFx0XHRmb250TGlnYXR1cmVzOiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlTdXBwb3J0OiAnb2ZmJyxcblx0XHR9KTtcblxuXHRcdC8vIFN0dWIgaG92ZXIgc2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0RlbGF5ZWRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNldHVwRGVsYXllZEhvdmVyQXRNb3VzZTogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdFx0c2hvd0luc3RhbnRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aGlkZUhvdmVyOiAoKSA9PiB7IH0sXG5cdFx0XHRzaG93QW5kRm9jdXNMYXN0SG92ZXI6ICgpID0+IHsgfSxcblx0XHRcdHNldHVwTWFuYWdlZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSwgaGlkZTogKCkgPT4geyB9LCB1cGRhdGU6ICgpID0+IHsgfSB9KSxcblx0XHRcdHNob3dNYW5hZ2VkSG92ZXI6ICgpID0+IHsgfSxcblx0XHR9KTtcblxuXHRcdC8vIFN0dWIgQUkgZWRpdCB0ZWxlbWV0cnkgc2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNyZWF0ZVN1Z2dlc3Rpb25JZDogKCkgPT4gdW5kZWZpbmVkISxcblx0XHRcdGhhbmRsZUNvZGVBY2NlcHRlZDogKCkgPT4geyB9LFxuXHRcdFx0aGFuZGxlQ29kZVJlamVjdGVkOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZWdpc3RlclJlbmRlcmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRoYXNDb2RlQmxvY2tSZW5kZXJlcjogaWRlbnRpZmllciA9PiBpZGVudGlmaWVyLnRvTG93ZXJDYXNlKCkgPT09ICdtZXJtYWlkJyxcblx0XHRcdHJlbmRlck91dHB1dFBhcnQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIG91dHB1dCByZW5kZXInKTsgfSxcblx0XHRcdHJlbmRlckNvZGVCbG9jazogYXN5bmMgKGlkZW50aWZpZXIsIGRhdGEpID0+IHtcblx0XHRcdFx0cmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLnB1c2goeyBpZGVudGlmaWVyLCB0ZXh0OiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoZGF0YSkgfSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0d2Vidmlldzoge1xuXHRcdFx0XHRcdFx0Zm9jdXM6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRcdG9uRGlkV2hlZWw6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0XHRvbkRpZFVwZGF0ZVN0YXRlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdH0gYXMgUmVuZGVyZWRPdXRwdXRQYXJ0Wyd3ZWJ2aWV3J10sXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0cmVpbml0aWFsaXplOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRPdXRwdXRQYXJ0U3RhdGVDYWNoZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0OiBrZXkgPT4gb3V0cHV0U3RhdGVDYWNoZS5nZXQoa2V5KSxcblx0XHRcdHNldDogKGtleSwgc3RhdGUpID0+IG91dHB1dFN0YXRlQ2FjaGUuc2V0KGtleSwgc3RhdGUpLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU3R1YiB2aWV3IGRlc2NyaXB0b3Igc2VydmljZVxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZpZXdEZXNjcmlwdG9yU2VydmljZSwge1xuXHRcdFx0b25EaWRDaGFuZ2VMb2NhdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlQ29udGFpbmVyOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0Vmlld0xvY2F0aW9uQnlJZDogKCkgPT4gbnVsbCxcblx0XHR9KTtcblxuXHRcdHJlbmRlcmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblxuXHRcdC8vIENyZWF0ZSBhIG1vY2sgZWRpdG9yIHBvb2xcblx0XHRlZGl0b3JQb29sID0gY3JlYXRlTW9ja0VkaXRvclBvb2woKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmb3JtcyBhY2N1bXVsYXRlZCByZXNwb25zZSBNYXJrZG93biB3aGlsZSBwcmVzZXJ2aW5nIGxpbmsgdGV4dCcsICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2hhdFNlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKCdjaGF0LXNlc3Npb24nLCB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBzZXNzaW9uIHJlc29sdXRpb24nKTsgfSxcblx0XHRcdHJlc29sdmVDaGF0UmVzcG9uc2VVcmk6IChfcmVzb3VyY2UsIGhyZWYpID0+IHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KGhyZWYsICdteS1ob3N0JyksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYFtmb28udHNdKC9jb2RlLnRzKWAgW2FbYl0udHNdKC9yZW1vdGUvYS50cyBcIi9yZW1vdGUvYS50c1wiKSwgW2FcXFxcKmIudHNdKC9yZW1vdGUvYi50cyksIFtsaW5lLnRzXSgvcmVtb3RlL2xpbmUudHM6NDIpLCBbY29sdW1uLnRzXSgvcmVtb3RlL2NvbHVtbi50czo0Mjo3KSwgW3dpbmRvd3MudHNdKEM6L3JlbW90ZS93aW5kb3dzLnRzOjQyKSwgW3VuYy50c10oLy9zZXJ2ZXIvc2hhcmUvdW5jLnRzOjQyKSwgW3NraWxsXSgvcmVtb3RlL3NraWxsL1NLSUxMLm1kKSwgYW5kIFtmaWxlLXVyaS50c10oZmlsZTovLy9yZW1vdGUvZmlsZS11cmkudHM6NDIpLiAhW2ltYWdlXSgvcmVtb3RlL2ltYWdlLnBuZyknKTtcblx0XHRjb25zdCBsaW5rcyA9IEFycmF5LmZyb20ocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKSk7XG5cdFx0Y29uc3Qgc2tpbGxVcmkgPSB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL3JlbW90ZS9za2lsbC9TS0lMTC5tZCcpLCAnbXktaG9zdCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGxpbmtzOiBsaW5rcy5tYXAobGluayA9PiAoeyB0ZXh0OiBsaW5rLnRleHRDb250ZW50LCBocmVmOiBsaW5rLmRhdGFzZXQuaHJlZiB9KSksXG5cdFx0XHRcdGltYWdlU291cmNlOiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignaW1nJyk/LmdldEF0dHJpYnV0ZSgnc3JjJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsaW5rczogW1xuXHRcdFx0XHRcdHsgdGV4dDogJ2FbYl0udHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL3JlbW90ZS9hLnRzJyksICdteS1ob3N0JykudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRcdHsgdGV4dDogJ2EqYi50cycsIGhyZWY6IHRvQWdlbnRIb3N0VXJpKFVSSS5maWxlKCcvcmVtb3RlL2IudHMnKSwgJ215LWhvc3QnKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0eyB0ZXh0OiAnbGluZS50cycsIGhyZWY6IHRvQWdlbnRIb3N0VXJpKFVSSS5maWxlKCcvcmVtb3RlL2xpbmUudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLCAnbXktaG9zdCcpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IHRleHQ6ICdjb2x1bW4udHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnL3JlbW90ZS9jb2x1bW4udHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDIsNycgfSksICdteS1ob3N0JykudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRcdHsgdGV4dDogJ3dpbmRvd3MudHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnQzovcmVtb3RlL3dpbmRvd3MudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLCAnbXktaG9zdCcpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XHR7IHRleHQ6ICd1bmMudHMnLCBocmVmOiB0b0FnZW50SG9zdFVyaShVUkkuZmlsZSgnLy9zZXJ2ZXIvc2hhcmUvdW5jLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KSwgJ215LWhvc3QnKS50b1N0cmluZygpIH0sXG5cdFx0XHRcdFx0eyB0ZXh0OiAnc2tpbGwnLCBocmVmOiBza2lsbFVyaS53aXRoKHsgcXVlcnk6IGAke3NraWxsVXJpLnF1ZXJ5fSZ2c2NvZGVMaW5rVHlwZT1za2lsbGAgfSkudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHRcdHsgdGV4dDogJ2ZpbGUtdXJpLnRzJywgaHJlZjogdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy9yZW1vdGUvZmlsZS11cmkudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLCAnbXktaG9zdCcpLnRvU3RyaW5nKCkgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aW1hZ2VTb3VyY2U6IG51bGwsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgcGxhaW4gbWFya2Rvd24gd2l0aG91dCBjb2RlIGJsb2NrcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0KCdIZWxsbywgd29ybGQhJyk7XG5cblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhwYXJ0LmRvbU5vZGUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdIZWxsbywgd29ybGQhJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIGEgc2luZ2xlIGNvZGUgYmxvY2sgYW5kIHBhc3NlcyB0ZXh0IHRvIENvZGVCbG9ja1BhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgamF2YXNjcmlwdFxcbmNvbnNvbGUubG9nKFwiaGVsbG9cIik7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5jb2RlQmxvY2tJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnamF2YXNjcmlwdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0ubGFuZ3VhZ2VJZCwgJ2phdmFzY3JpcHQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyBjb21wbGV0ZSBjb2RlIGJsb2NrIHdpdGggY29udHJpYnV0ZWQgY2hhdCBvdXRwdXQgcmVuZGVyZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgbWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnbWVybWFpZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cywgW3sgaWRlbnRpZmllcjogJ21lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIGNvbXBsZXRlIGNvZGUgYmxvY2sgd2l0aCBjb250cmlidXRlZCBjaGF0IG91dHB1dCByZW5kZXJlciBjYXNlLWluc2Vuc2l0aXZlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgTWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAnTWVybWFpZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cywgW3sgaWRlbnRpZmllcjogJ01lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgcmVuZGVyZWQgY29kZSBibG9jayB3ZWJ2aWV3IGFjcm9zcyBpbmNyZW1lbnRhbCByZXJlbmRlcnMgd2hlbiBjb250ZW50IGlzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmcsIHRydWUpO1xuXG5cdFx0Y29uc3QgY3R4ID0gY3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSAnYGBgbWVybWFpZFxcbmdyYXBoIFREXFxuYGBgJztcblx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0KG1hcmtkb3duLCBjdHgsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2NrT3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhgJHttYXJrZG93bn1cXG5cXG5OZXh0IHBhcmFncmFwaGApIH0pLCB0cnVlKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gbWFpbldpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkT3V0cHV0czogcmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLFxuXHRcdFx0b3V0cHV0QmxvY2tDb3VudDogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LW91dHB1dC1jb2RlLWJsb2NrJykubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlbmRlcmVkT3V0cHV0czogW3sgaWRlbnRpZmllcjogJ21lcm1haWQnLCB0ZXh0OiAnZ3JhcGggVEQnIH1dLFxuXHRcdFx0b3V0cHV0QmxvY2tDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIGluaXRpYWwgaW5jb21wbGV0ZSBjb2RlIGZlbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eCA9IGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYCcsIGN0eCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja091dHB1dHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5pbnRlcmFjdGl2ZS1yZXN1bHQtY29kZS1ibG9jaycpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgcGVuZGluZyBjaGF0IG91dHB1dCByZW5kZXJlciBmb3IgaW5jb21wbGV0ZSBjb2RlIGJsb2NrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eCA9IGNyZWF0ZVJlbmRlckNvbnRleHQoZmFsc2UpO1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYG1lcm1haWRcXG5ncmFwaCBURCcsIGN0eCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tPdXRwdXRzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvZGVibG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzWzBdLmxhbmd1YWdlSWQsICdtZXJtYWlkJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1vdXRwdXQtY29kZS1ibG9jaycpKTtcblx0XHRhc3NlcnQub2socGFydC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnUmVuZGVyaW5nIGNvZGUgYmxvY2snKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmRlcnMgbXVsdGlwbGUgY29kZSBibG9ja3Mgd2l0aCBjb3JyZWN0IGluZGljZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydChcblx0XHRcdCdTb21lIHRleHRcXG5gYGBweXRob25cXG5wcmludChcImFcIilcXG5gYGBcXG5Nb3JlIHRleHRcXG5gYGB0eXBlc2NyaXB0XFxuY29uc3QgeCA9IDE7XFxuYGBgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5jb2RlQmxvY2tJbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1swXS5sYW5ndWFnZUlkLCAncHl0aG9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1sxXS5jb2RlQmxvY2tJbmRleCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29kZWJsb2Nrc1sxXS5sYW5ndWFnZUlkLCAndHlwZXNjcmlwdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ3ByaW50KFwiYVwiKScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMV0udGV4dCwgJ2NvbnN0IHggPSAxOycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHRleHQgaXMgcGFzc2VkIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBjb2RlID0gJ2Z1bmN0aW9uIGdyZWV0KCkge1xcbiAgcmV0dXJuIFwiaGVsbG9cIjtcXG59Jztcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGphdmFzY3JpcHRcXG4nICsgY29kZSArICdcXG5gYGAnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsIGNvZGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0ubGFuZ3VhZ2VJZCwgJ2phdmFzY3JpcHQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29kZSBibG9jayB3aXRob3V0IGxhbmd1YWdlIGlkIHBhc3NlcyBlbXB0eSBsYW5ndWFnZUlkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgXFxuc29tZSB0ZXh0XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LCAnc29tZSB0ZXh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGNvZGVCbG9ja1N0YXJ0SW5kZXggZm9yIGdsb2JhbCBpbmRleGluZycsICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KCk7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LFxuXHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdgYGBqc1xcbmNvZGVcXG5gYGAnKSB9LFxuXHRcdFx0Y3R4LFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0NSwgLy8gY29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdFx0cmVuZGVyZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQ1MDAsXG5cdFx0XHR7fSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvZGVibG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb2RlYmxvY2tzWzBdLmNvZGVCbG9ja0luZGV4LCA1KTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgcmV0dXJucyB0cnVlIGZvciBzYW1lIG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnQuaGFzU2FtZUNvbnRlbnQoeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbycpIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgcmV0dXJucyBmYWxzZSBmb3IgZGlmZmVyZW50IG1hcmtkb3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBjcmVhdGVNYXJrZG93blBhcnQoJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0Lm9rKCFwYXJ0Lmhhc1NhbWVDb250ZW50KHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnR29vZGJ5ZScpIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzU2FtZUNvbnRlbnQgY29tcGFyZXMgaW5saW5lIHJlZmVyZW5jZSBtZXRhZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2Zvby50cycpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnRm9vJztcblx0XHRjb25zdCBpbml0aWFsUmVmZXJlbmNlOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UgPSB7XG5cdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdH07XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydFdpdGhJbmxpbmVSZWZlcmVuY2VzKGNvbnRlbnQsIHsgMDogaW5pdGlhbFJlZmVyZW5jZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXF1aXZhbGVudFJlZmVyZW5jZTogcGFydC5oYXNTYW1lQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCksXG5cdFx0XHRcdGlubGluZVJlZmVyZW5jZXM6IHtcblx0XHRcdFx0XHQwOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdFx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkgfSxcblx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH0sIHtcblx0XHRcdGVxdWl2YWxlbnRSZWZlcmVuY2U6IHRydWUsXG5cdFx0XHRyZXNvbHZlZFJlZmVyZW5jZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc1NhbWVDb250ZW50IGNvbXBhcmVzIHdvcmtzcGFjZSBzeW1ib2wgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9mb28udHMnKTtcblx0XHRjb25zdCBjb250ZW50ID0gJ0Zvbyc7XG5cdFx0Y29uc3QgaW5pdGlhbFJlZmVyZW5jZTogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlID0ge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRyZXNvbHZlSWQ6ICdyZXNvbHZlMScsXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHtcblx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdGNvbnRhaW5lck5hbWU6ICdCYXInLFxuXHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHR0YWdzOiBbU3ltYm9sVGFnLkRlcHJlY2F0ZWRdLFxuXHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHR9LFxuXHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0fTtcblx0XHRjb25zdCBwYXJ0ID0gY3JlYXRlTWFya2Rvd25QYXJ0V2l0aElubGluZVJlZmVyZW5jZXMoY29udGVudCwgeyAwOiBpbml0aWFsUmVmZXJlbmNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcXVpdmFsZW50U3ltYm9sOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRjb250YWluZXJOYW1lOiAnQmFyJyxcblx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdFx0dGFnczogW1N5bWJvbFRhZy5EZXByZWNhdGVkXSxcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IHsgdXJpLCByYW5nZTogbmV3IFJhbmdlKDIsIDcsIDIsIDEwKSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdGRpZmZlcmVudENvbnRhaW5lcjogcGFydC5oYXNTYW1lQ29udGVudCh7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCksXG5cdFx0XHRcdGlubGluZVJlZmVyZW5jZXM6IHtcblx0XHRcdFx0XHQwOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnaW5saW5lUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdHJlc29sdmVJZDogJ3Jlc29sdmUxJyxcblx0XHRcdFx0XHRcdGlubGluZVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyTmFtZTogJ0JheicsXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmQuQ2xhc3MsXG5cdFx0XHRcdFx0XHRcdHRhZ3M6IFtTeW1ib2xUYWcuRGVwcmVjYXRlZF0sXG5cdFx0XHRcdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRkaWZmZXJlbnRUYWdzOiBwYXJ0Lmhhc1NhbWVDb250ZW50KHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRjb250YWluZXJOYW1lOiAnQmFyJyxcblx0XHRcdFx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5DbGFzcyxcblx0XHRcdFx0XHRcdFx0dGFnczogW10sXG5cdFx0XHRcdFx0XHRcdGxvY2F0aW9uOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgyLCA3LCAyLCAxMCkgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnRm9vJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0fSwge1xuXHRcdFx0ZXF1aXZhbGVudFN5bWJvbDogdHJ1ZSxcblx0XHRcdGRpZmZlcmVudENvbnRhaW5lcjogZmFsc2UsXG5cdFx0XHRkaWZmZXJlbnRUYWdzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJ5SW5jcmVtZW50YWxVcGRhdGUgcmVxdWlyZXMgdW5jaGFuZ2VkIGlubGluZSByZWZlcmVuY2UgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nLCB0cnVlKTtcblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvZm9vLnRzJyk7XG5cdFx0Y29uc3QgY29udGVudCA9ICdGb28nO1xuXHRcdGNvbnN0IGluaXRpYWxSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSA9IHtcblx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7IHVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSB9LFxuXHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0fTtcblx0XHRjb25zdCBjb250ZXh0ID0gY3JlYXRlUmVuZGVyQ29udGV4dChmYWxzZSk7XG5cdFx0Y29uc3QgcGFydCA9IGNyZWF0ZU1hcmtkb3duUGFydFdpdGhJbmxpbmVSZWZlcmVuY2VzKGNvbnRlbnQsIHsgMDogaW5pdGlhbFJlZmVyZW5jZSB9LCBjb250ZXh0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dW5jaGFuZ2VkUmVmZXJlbmNlOiBwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczogeyAwOiBpbml0aWFsUmVmZXJlbmNlIH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBwYXJ0LnRyeUluY3JlbWVudGFsVXBkYXRlKHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50KSxcblx0XHRcdFx0aW5saW5lUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdDA6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0cmVzb2x2ZUlkOiAncmVzb2x2ZTEnLFxuXHRcdFx0XHRcdFx0aW5saW5lUmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICdGb28nLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbjogeyB1cmksIHJhbmdlOiBuZXcgUmFuZ2UoMiwgNywgMiwgMTApIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bmFtZTogJ0ZvbycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdH0sIHtcblx0XHRcdHVuY2hhbmdlZFJlZmVyZW5jZTogdHJ1ZSxcblx0XHRcdHJlc29sdmVkUmVmZXJlbmNlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGhwIGNvZGUgYmxvY2tzIGdldCBwaHAgb3BlbmluZyB0YWcgcHJlcGVuZGVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZU1hcmtkb3duUGFydCgnYGBgcGhwXFxuZWNobyBcImhlbGxvXCI7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LnN0YXJ0c1dpdGgoJzw/cGhwXFxuJyksICdQSFAgY29kZSBzaG91bGQgaGF2ZSA8P3BocCBwcmVwZW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncGhwIGNvZGUgYmxvY2tzIHdpdGggZXhpc3Rpbmcgb3BlbmluZyB0YWcgYXJlIG5vdCBtb2RpZmllZCcsICgpID0+IHtcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYHBocFxcbjw/cGhwXFxuZWNobyBcImhlbGxvXCI7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dC5zdGFydHNXaXRoKCc8P3BocFxcbjw/cGhwJyksICdQSFAgY29kZSB3aXRoIGV4aXN0aW5nIHRhZyBzaG91bGQgbm90IGJlIGRvdWJsZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGNvZGVibG9jayB1cmkgYW5ub3RhdGlvbnMgYmVmb3JlIHJlbmRlcmluZyBzdGFuZGFyZCBjb2RlIGJsb2NrcycsICgpID0+IHtcblx0XHRjcmVhdGVNYXJrZG93blBhcnQoJ2BgYHR5cGVzY3JpcHRcXG5jb25zdCB2YWx1ZSA9IDE7XFxuPHZzY29kZV9jb2RlYmxvY2tfdXJpPmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKCFyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dC5pbmNsdWRlcygnPHZzY29kZV9jb2RlYmxvY2tfdXJpJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0uY29kZW1hcHBlclVyaT8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vdGVzdC50cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHRvb2xiYXIgY29udGV4dCBpcyBzZXQgY29ycmVjdGx5IHdpdGggY29kZSB0ZXh0JywgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0aGUgc2NlbmFyaW8gaW4gIzI1NTI5MDogdGhlIGNvcHkgYnV0dG9uIHNob3VsZCBoYXZlXG5cdFx0Ly8gdmFsaWQgY29kZSB0ZXh0IGR1cmluZyBzdHJlYW1pbmcgZXZlbiBhcyBjb2RlIGJsb2NrcyBhcmUgcmUtcmVuZGVyZWQuXG5cdFx0Y3JlYXRlTWFya2Rvd25QYXJ0KCdgYGBqc1xcbmNvbnNvbGUubG9nKFwiaGVsbG9cIik7XFxuYGBgJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrc1swXS50ZXh0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKTsnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLmxhbmd1YWdlSWQsICdqcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0uY29kZUJsb2NrSW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIG1haW50YWlucyBjb250ZW50IHdoZW4gbWFya2Rvd24gaXMgcmUtcmVuZGVyZWQgZHVyaW5nIHN0cmVhbWluZycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgcHJvZ3Jlc3NpdmUgcmVuZGVyaW5nOiBmaXJzdCB0aWNrIHNob3dzIHBhcnRpYWwgY29kZSwgc2Vjb25kIHRpY2sgYWRkcyBtb3JlLlxuXHRcdC8vIEVhY2ggcmVuZGVyIGNyZWF0ZXMgYSBuZXcgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQgKGFzIGhhcHBlbnMgZHVyaW5nIHN0cmVhbWluZykuXG5cdFx0Ly8gVGhlIGNvZGUgYmxvY2sgc2hvdWxkIGdldCB0aGUgdXBkYXRlZCB0ZXh0IGVhY2ggdGltZS5cblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlIC8qIGlzQ29tcGxldGUgPSBmYWxzZSwgc2ltdWxhdGluZyBzdHJlYW1pbmcgKi8pO1xuXG5cdFx0Ly8gRmlyc3QgcmVuZGVyIHdpdGggcGFydGlhbCBjb2RlXG5cdFx0Y29uc3QgcGFydDEgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGpzXFxuY29uc29sZVxcbmBgYCcsIGN0eCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ2NvbnNvbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydDEuY29kZWJsb2Nrcy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gU2Vjb25kIHJlbmRlciB3aXRoIG1vcmUgY29kZSAoc2ltdWxhdGluZyBzdHJlYW1pbmcgcHJvZ3Jlc3MpXG5cdFx0cmVuZGVyZWRDb2RlQmxvY2tzLmxlbmd0aCA9IDA7XG5cdFx0Y29uc3QgcGFydDIgPSBjcmVhdGVNYXJrZG93blBhcnQoJ2BgYGpzXFxuY29uc29sZS5sb2coXCJoZWxsb1wiKTtcXG5gYGAnLCBjdHgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3MubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzBdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Mi5jb2RlYmxvY2tzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQyLmNvZGVibG9ja3NbMF0uY29kZUJsb2NrSW5kZXgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2RlIGJsb2NrIHBhcnQgZWxlbWVudCBpcyByZXVzZWQgZnJvbSBwb29sIGFjcm9zcyBzdHJlYW1pbmcgcmVuZGVycycsICgpID0+IHtcblx0XHQvLyBWZXJpZnkgdGhlIHNhbWUgQ29kZUJsb2NrUGFydCBlbGVtZW50IGlzIHJldHVybmVkIGZyb20gdGhlIHBvb2wgZm9yIHRoZSBzYW1lIGtleVxuXHRcdGNvbnN0IGVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Y29uc3QgcG9vbFdpdGhUcmFja2luZyA9IHtcblx0XHRcdGdldCgpOiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRjb25zdCBtb2NrUGFydCA9IHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGdldCB1cmkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdFx0cmVuZGVyKGRhdGE6IElDb2RlQmxvY2tEYXRhLCBfd2lkdGg6IG51bWJlcikge1xuXHRcdFx0XHRcdFx0cmVuZGVyZWRDb2RlQmxvY2tzLnB1c2goZGF0YSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsYXlvdXQoKSB7IH0sXG5cdFx0XHRcdFx0Zm9jdXMoKSB7IH0sXG5cdFx0XHRcdFx0cmVzZXQoKSB7IH0sXG5cdFx0XHRcdFx0b25EaWRSZW1vdW50KCkgeyB9LFxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgQ29kZUJsb2NrUGFydDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvYmplY3Q6IG1vY2tQYXJ0LFxuXHRcdFx0XHRcdGlzU3RhbGU6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0sXG5cdFx0XHRpblVzZTogKCkgPT4gW10sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIEVkaXRvclBvb2w7XG5cblx0XHRjb25zdCBjdHggPSBjcmVhdGVSZW5kZXJDb250ZXh0KGZhbHNlKTtcblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnYGBganNcXG5jb25zb2xlXFxuYGBgJykgfSxcblx0XHRcdGN0eCwgcG9vbFdpdGhUcmFja2luZywgZmFsc2UsIDAsIHJlbmRlcmVyLCB1bmRlZmluZWQsIDUwMCwge30sXG5cdFx0KSk7XG5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnYGBganNcXG5jb25zb2xlLmxvZyhcImhlbGxvXCIpO1xcbmBgYCcpIH0sXG5cdFx0XHRjdHgsIHBvb2xXaXRoVHJhY2tpbmcsIGZhbHNlLCAwLCByZW5kZXJlciwgdW5kZWZpbmVkLCA1MDAsIHt9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gQm90aCByZW5kZXJzIHNob3VsZCBoYXZlIGNyZWF0ZWQgY29kZSBibG9ja3Mgd2l0aCB0aGUgY29ycmVjdCB0ZXh0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlcmVkQ29kZUJsb2Nrcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW5kZXJlZENvZGVCbG9ja3NbMF0udGV4dCwgJ2NvbnNvbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyZWRDb2RlQmxvY2tzWzFdLnRleHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpOycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBaUI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQ0FBbUM7QUFHNUMsU0FBUyxrQ0FBMkQ7QUFDcEUsU0FBUyxpQ0FBbUQ7QUFHNUQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFB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
