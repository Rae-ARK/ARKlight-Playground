import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ChatResponseAccessibleView, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, getToolSpecificDataDescription, getResultDetailsDescription, getToolInvocationA11yDescription } from "../../../browser/accessibility/chatResponseAccessibleView.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
suite("ChatResponseAccessibleView", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolSpecificDataDescription", () => {
    test("returns empty string for undefined", () => {
      assert.strictEqual(getToolSpecificDataDescription(void 0), "");
    });
    test("returns command line for terminal data", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install",
          toolEdited: "npm ci",
          userEdited: "npm install --save-dev"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm install --save-dev");
    });
    test("returns tool edited command for terminal data without user edit", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install",
          toolEdited: "npm ci"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm ci");
    });
    test("returns original command for terminal data without edits", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: {
          original: "npm install"
        },
        language: "bash"
      };
      assert.strictEqual(getToolSpecificDataDescription(terminalData), "npm install");
    });
    test("returns description for subagent data", () => {
      const subagentData = {
        kind: "subagent",
        agentName: "TestAgent",
        description: "Running analysis",
        prompt: "Analyze the code"
      };
      const result = getToolSpecificDataDescription(subagentData);
      assert.ok(result.includes("TestAgent"));
      assert.ok(result.includes("Running analysis"));
      assert.ok(result.includes("Analyze the code"));
    });
    test("handles subagent with only description", () => {
      const subagentData = {
        kind: "subagent",
        description: "Running analysis"
      };
      const result = getToolSpecificDataDescription(subagentData);
      assert.strictEqual(result, "Running analysis");
    });
    test("returns extensions list for extensions data", () => {
      const extensionsData = {
        kind: "extensions",
        extensions: ["eslint", "prettier", "typescript"]
      };
      const result = getToolSpecificDataDescription(extensionsData);
      assert.ok(result.includes("eslint"));
      assert.ok(result.includes("prettier"));
      assert.ok(result.includes("typescript"));
    });
    test("returns empty for empty extensions array", () => {
      const extensionsData = {
        kind: "extensions",
        extensions: []
      };
      assert.strictEqual(getToolSpecificDataDescription(extensionsData), "");
    });
    test("returns todo list description for todoList data", () => {
      const todoData = {
        kind: "todoList",
        todoList: [
          { id: "1", title: "Task 1", status: "in-progress" },
          { id: "2", title: "Task 2", status: "completed" }
        ]
      };
      const result = getToolSpecificDataDescription(todoData);
      assert.ok(result.includes("2 items"));
      assert.ok(result.includes("Task 1"));
      assert.ok(result.includes("in-progress"));
      assert.ok(result.includes("Task 2"));
      assert.ok(result.includes("completed"));
    });
    test("returns empty for empty todo list", () => {
      const todoData = {
        kind: "todoList",
        todoList: []
      };
      assert.strictEqual(getToolSpecificDataDescription(todoData), "");
    });
    test("returns PR info for pullRequest data", () => {
      const prData = {
        kind: "pullRequest",
        uri: URI.file("/test"),
        command: { id: "vscode.open", title: "Open Pull Request", arguments: [URI.file("/test")] },
        title: "Add new feature",
        description: "This PR adds a great feature",
        author: "testuser",
        linkTag: "#123"
      };
      const result = getToolSpecificDataDescription(prData);
      assert.ok(result.includes("Add new feature"));
      assert.ok(result.includes("testuser"));
    });
    test("returns raw input for input data (string)", () => {
      const inputData = {
        kind: "input",
        rawInput: "some input string"
      };
      assert.strictEqual(getToolSpecificDataDescription(inputData), "some input string");
    });
    test("returns JSON stringified for input data (object)", () => {
      const inputData = {
        kind: "input",
        rawInput: { key: "value", nested: { data: 123 } }
      };
      const result = getToolSpecificDataDescription(inputData);
      assert.ok(result.includes("key"));
      assert.ok(result.includes("value"));
    });
    test("returns resources list for resources data with URIs", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          URI.file("/path/to/file1.ts"),
          URI.file("/path/to/file2.ts")
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
    });
    test("returns resources list for resources data with Locations", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          { uri: URI.file("/path/to/file1.ts"), range: new Range(1, 1, 10, 1) },
          { uri: URI.file("/path/to/file2.ts"), range: new Range(5, 1, 15, 1) }
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes(":1"));
      assert.ok(result.includes("file2.ts"));
      assert.ok(result.includes(":5"));
    });
    test("returns resources list for mixed URIs and Locations", () => {
      const resourcesData = {
        kind: "resources",
        values: [
          URI.file("/path/to/file1.ts"),
          { uri: URI.file("/path/to/file2.ts"), range: new Range(10, 1, 20, 1) }
        ]
      };
      const result = getToolSpecificDataDescription(resourcesData);
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
      assert.ok(result.includes(":10"));
    });
    test("returns empty for empty resources array", () => {
      const resourcesData = {
        kind: "resources",
        values: []
      };
      assert.strictEqual(getToolSpecificDataDescription(resourcesData), "");
    });
    test("describes configured automation results", () => {
      assert.deepStrictEqual([
        getToolSpecificDataDescription({
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        }),
        getToolSpecificDataDescription({
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "updated"
        })
      ], [
        "Created an automation: Morning review",
        "Edited an automation: Morning review"
      ]);
    });
  });
  suite("getResultDetailsDescription", () => {
    test("returns empty object for undefined", () => {
      assert.deepStrictEqual(getResultDetailsDescription(void 0), {});
    });
    test("returns files for URI array", () => {
      const uris = [
        URI.file("/path/to/file1.ts"),
        URI.file("/path/to/file2.ts")
      ];
      const result = getResultDetailsDescription(uris);
      assert.ok(result.files);
      assert.strictEqual(result.files.length, 2);
      assert.ok(result.files[0].includes("file1.ts"));
      assert.ok(result.files[1].includes("file2.ts"));
    });
    test("returns files for Location array", () => {
      const locations = [
        { uri: URI.file("/path/to/file1.ts"), range: new Range(1, 1, 10, 1) },
        { uri: URI.file("/path/to/file2.ts"), range: new Range(5, 1, 15, 1) }
      ];
      const result = getResultDetailsDescription(locations);
      assert.ok(result.files);
      assert.strictEqual(result.files.length, 2);
    });
    test("returns input and isError for IToolResultInputOutputDetails", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: false
      };
      const result = getResultDetailsDescription(details);
      assert.strictEqual(result.input, "create_file path=/test/file.ts");
      assert.strictEqual(result.isError, false);
    });
    test("returns isError true for errored IToolResultInputOutputDetails", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: true
      };
      const result = getResultDetailsDescription(details);
      assert.strictEqual(result.isError, true);
    });
  });
  suite("getToolInvocationA11yDescription", () => {
    test("returns invocation message when not complete", () => {
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        void 0,
        false
      );
      assert.strictEqual(result, "Creating file");
    });
    test("returns past tense message when complete", () => {
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        void 0,
        true
      );
      assert.strictEqual(result, "Created file");
    });
    test("includes tool-specific data description", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: { original: "npm test" },
        language: "bash"
      };
      const result = getToolInvocationA11yDescription(
        "Running command",
        "Ran command",
        terminalData,
        void 0,
        true
      );
      assert.ok(result.includes("Ran command"));
      assert.ok(result.includes("npm test"));
    });
    test("includes files from result details when complete", () => {
      const uris = [
        URI.file("/path/to/file1.ts"),
        URI.file("/path/to/file2.ts")
      ];
      const result = getToolInvocationA11yDescription(
        "Creating files",
        "Created files",
        void 0,
        uris,
        true
      );
      assert.ok(result.includes("Created files"));
      assert.ok(result.includes("file1.ts"));
      assert.ok(result.includes("file2.ts"));
    });
    test("includes error status when result has error", () => {
      const details = {
        input: "create_file path=/test/file.ts",
        output: [],
        isError: true
      };
      const result = getToolInvocationA11yDescription(
        "Creating file",
        "Created file",
        void 0,
        details,
        true
      );
      assert.ok(result.includes("Errored"));
    });
    test("does not show input when tool-specific data is provided", () => {
      const terminalData = {
        kind: "terminal",
        commandLine: { original: "npm test" },
        language: "bash"
      };
      const details = {
        input: "some redundant input",
        output: [],
        isError: false
      };
      const result = getToolInvocationA11yDescription(
        "Running command",
        "Ran command",
        terminalData,
        details,
        true
      );
      assert.ok(result.includes("npm test"));
      assert.ok(!result.includes("Input:"));
    });
    test("shows input when no tool-specific data", () => {
      const details = {
        input: "apply_patch file=/test/file.ts",
        output: [],
        isError: false
      };
      const result = getToolInvocationA11yDescription(
        "Applying patch",
        "Applied patch",
        void 0,
        details,
        true
      );
      assert.ok(result.includes("Applied patch"));
      assert.ok(result.includes("Input:"));
      assert.ok(result.includes("apply_patch"));
    });
    test("handles all parts together", () => {
      const subagentData = {
        kind: "subagent",
        agentName: "CodeReviewer",
        description: "Reviewing code changes"
      };
      const uris = [URI.file("/src/test.ts")];
      const result = getToolInvocationA11yDescription(
        "Starting code review",
        "Completed code review",
        subagentData,
        uris,
        true
      );
      assert.ok(result.includes("Completed code review"));
      assert.ok(result.includes("CodeReviewer"));
      assert.ok(result.includes("Reviewing code changes"));
      assert.ok(result.includes("test.ts"));
    });
  });
  suite("getProvider", () => {
    test("omits thinking content when disabled in storage", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      storageService.store(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, false, StorageScope.PROFILE, StorageTarget.USER);
      const responseItem = {
        response: { value: [{ kind: "thinking", value: "Hidden reasoning" }, { kind: "markdownContent", content: new MarkdownString("Response content") }] },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("Response content"));
      assert.ok(!content.includes("Thinking: Hidden reasoning"));
    });
    test("prefers the latest response when focus is on a queued request", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const responseItem = {
        response: { value: [{ kind: "thinking", value: "Reasoning" }, { kind: "markdownContent", content: new MarkdownString("Response content") }] },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const queuedRequest = { message: "Queued request" };
      const items = [responseItem, queuedRequest];
      let focusedItem = queuedRequest;
      const widget = {
        hasInputFocus: () => true,
        focusResponseItem: () => {
          focusedItem = queuedRequest;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("Response content"));
      assert.ok(content.includes("Thinking: Reasoning"));
    });
    test("includes file path for URI inline references", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const inlineReferenceUri = URI.file("/path/to/index.ts");
      const responseItem = {
        response: {
          value: [
            { kind: "markdownContent", content: new MarkdownString("See file ") },
            { kind: "inlineReference", inlineReference: inlineReferenceUri, name: "index.ts" },
            { kind: "markdownContent", content: new MarkdownString(" for details") }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("index.ts"));
      assert.ok(content.includes(inlineReferenceUri.path));
      assert.ok(content.includes("See file"));
      assert.ok(content.includes("for details"));
    });
    test("includes file path and line number for Location inline references", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const fileLocation = {
        uri: URI.file("/src/app/main.ts"),
        range: new Range(42, 1, 42, 20)
      };
      const responseItem = {
        response: {
          value: [
            { kind: "markdownContent", content: new MarkdownString("Error at ") },
            { kind: "inlineReference", inlineReference: fileLocation, name: "main.ts" }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("main.ts"));
      assert.ok(content.includes(`${fileLocation.uri.path}:42`));
    });
    test("uses basename as name for URI inline references without explicit name", () => {
      const instantiationService = store.add(new TestInstantiationService());
      const storageService = store.add(new TestStorageService());
      const inlineReferenceUri = URI.file("/workspace/src/utils.ts");
      const responseItem = {
        response: {
          value: [
            { kind: "inlineReference", inlineReference: inlineReferenceUri }
          ]
        },
        model: { onDidChange: Event.None },
        setVote: () => void 0
      };
      const items = [responseItem];
      let focusedItem = responseItem;
      const widget = {
        hasInputFocus: () => false,
        focusResponseItem: () => {
          focusedItem = responseItem;
        },
        getFocus: () => focusedItem,
        focus: (item) => {
          focusedItem = item;
        },
        viewModel: { getItems: () => items }
      };
      const widgetService = {
        _serviceBrand: void 0,
        lastFocusedWidget: widget,
        onDidAddWidget: Event.None,
        onDidBackgroundSession: Event.None,
        reveal: async () => true,
        revealWidget: async () => widget,
        getAllWidgets: () => [widget],
        getWidgetByInputUri: () => widget,
        openSession: async () => widget,
        getWidgetBySessionResource: () => widget
      };
      instantiationService.stub(IChatWidgetService, widgetService);
      instantiationService.stub(IStorageService, storageService);
      const accessibleView = new ChatResponseAccessibleView();
      const provider = instantiationService.invokeFunction((accessor) => accessibleView.getProvider(accessor));
      assert.ok(provider);
      store.add(provider);
      const content = provider.provideContent();
      assert.ok(content.includes("utils.ts"));
      assert.ok(content.includes(inlineReferenceUri.path));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FjY2Vzc2liaWxpdHkvY2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldywgQ0hBVF9BQ0NFU1NJQkxFX1ZJRVdfSU5DTFVERV9USElOS0lOR19TVE9SQUdFX0tFWSwgZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uLCBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24sIGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY2Nlc3NpYmlsaXR5L2NoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRFeHRlbnNpb25zQ29udGVudCwgSUNoYXRQdWxsUmVxdWVzdENvbnRlbnQsIElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VG9kb0xpc3RDb250ZW50LCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhLCBJQ2hhdFRvb2xSZXNvdXJjZXNJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5zdWl0ZSgnQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHN0cmluZyBmb3IgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih1bmRlZmluZWQpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbW1hbmQgbGluZSBmb3IgdGVybWluYWwgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0XHRvcmlnaW5hbDogJ25wbSBpbnN0YWxsJyxcblx0XHRcdFx0XHR0b29sRWRpdGVkOiAnbnBtIGNpJyxcblx0XHRcdFx0XHR1c2VyRWRpdGVkOiAnbnBtIGluc3RhbGwgLS1zYXZlLWRldidcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdiYXNoJ1xuXHRcdFx0fTtcblx0XHRcdC8vIFNob3VsZCBwcmVmZXIgdXNlckVkaXRlZCBvdmVyIHRvb2xFZGl0ZWQgb3ZlciBvcmlnaW5hbFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0ZXJtaW5hbERhdGEpLCAnbnBtIGluc3RhbGwgLS1zYXZlLWRldicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0b29sIGVkaXRlZCBjb21tYW5kIGZvciB0ZXJtaW5hbCBkYXRhIHdpdGhvdXQgdXNlciBlZGl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiAnbnBtIGluc3RhbGwnLFxuXHRcdFx0XHRcdHRvb2xFZGl0ZWQ6ICducG0gY2knXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCdcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHRlcm1pbmFsRGF0YSksICducG0gY2knKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb3JpZ2luYWwgY29tbWFuZCBmb3IgdGVybWluYWwgZGF0YSB3aXRob3V0IGVkaXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiAnbnBtIGluc3RhbGwnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCdcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHRlcm1pbmFsRGF0YSksICducG0gaW5zdGFsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBkZXNjcmlwdGlvbiBmb3Igc3ViYWdlbnQgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHN1YmFnZW50RGF0YTogSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0YWdlbnROYW1lOiAnVGVzdEFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW5uaW5nIGFuYWx5c2lzJyxcblx0XHRcdFx0cHJvbXB0OiAnQW5hbHl6ZSB0aGUgY29kZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24oc3ViYWdlbnREYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1Rlc3RBZ2VudCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1J1bm5pbmcgYW5hbHlzaXMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdBbmFseXplIHRoZSBjb2RlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBzdWJhZ2VudCB3aXRoIG9ubHkgZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudERhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVubmluZyBhbmFseXNpcydcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24oc3ViYWdlbnREYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdSdW5uaW5nIGFuYWx5c2lzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGV4dGVuc2lvbnMgbGlzdCBmb3IgZXh0ZW5zaW9ucyBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0RhdGE6IElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdleHRlbnNpb25zJyxcblx0XHRcdFx0ZXh0ZW5zaW9uczogWydlc2xpbnQnLCAncHJldHRpZXInLCAndHlwZXNjcmlwdCddXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKGV4dGVuc2lvbnNEYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2VzbGludCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3ByZXR0aWVyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygndHlwZXNjcmlwdCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIGVtcHR5IGV4dGVuc2lvbnMgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zRGF0YTogSUNoYXRFeHRlbnNpb25zQ29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ2V4dGVuc2lvbnMnLFxuXHRcdFx0XHRleHRlbnNpb25zOiBbXVxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24oZXh0ZW5zaW9uc0RhdGEpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRvZG8gbGlzdCBkZXNjcmlwdGlvbiBmb3IgdG9kb0xpc3QgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvZG9EYXRhOiBJQ2hhdFRvZG9MaXN0Q29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ3RvZG9MaXN0Jyxcblx0XHRcdFx0dG9kb0xpc3Q6IFtcblx0XHRcdFx0XHR7IGlkOiAnMScsIHRpdGxlOiAnVGFzayAxJywgc3RhdHVzOiAnaW4tcHJvZ3Jlc3MnIH0sXG5cdFx0XHRcdFx0eyBpZDogJzInLCB0aXRsZTogJ1Rhc2sgMicsIHN0YXR1czogJ2NvbXBsZXRlZCcgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHRvZG9EYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzIgaXRlbXMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdUYXNrIDEnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdpbi1wcm9ncmVzcycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1Rhc2sgMicpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2NvbXBsZXRlZCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIGVtcHR5IHRvZG8gbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvZG9EYXRhOiBJQ2hhdFRvZG9MaXN0Q29udGVudCA9IHtcblx0XHRcdFx0a2luZDogJ3RvZG9MaXN0Jyxcblx0XHRcdFx0dG9kb0xpc3Q6IFtdXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0b2RvRGF0YSksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgUFIgaW5mbyBmb3IgcHVsbFJlcXVlc3QgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByRGF0YTogSUNoYXRQdWxsUmVxdWVzdENvbnRlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdwdWxsUmVxdWVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy90ZXN0JyksXG5cdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICd2c2NvZGUub3BlbicsIHRpdGxlOiAnT3BlbiBQdWxsIFJlcXVlc3QnLCBhcmd1bWVudHM6IFtVUkkuZmlsZSgnL3Rlc3QnKV0gfSxcblx0XHRcdFx0dGl0bGU6ICdBZGQgbmV3IGZlYXR1cmUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoaXMgUFIgYWRkcyBhIGdyZWF0IGZlYXR1cmUnLFxuXHRcdFx0XHRhdXRob3I6ICd0ZXN0dXNlcicsXG5cdFx0XHRcdGxpbmtUYWc6ICcjMTIzJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihwckRhdGEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnQWRkIG5ldyBmZWF0dXJlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygndGVzdHVzZXInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJhdyBpbnB1dCBmb3IgaW5wdXQgZGF0YSAoc3RyaW5nKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0RGF0YTogSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0cmF3SW5wdXQ6ICdzb21lIGlucHV0IHN0cmluZydcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKGlucHV0RGF0YSksICdzb21lIGlucHV0IHN0cmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBKU09OIHN0cmluZ2lmaWVkIGZvciBpbnB1dCBkYXRhIChvYmplY3QpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXREYXRhOiBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnaW5wdXQnLFxuXHRcdFx0XHRyYXdJbnB1dDogeyBrZXk6ICd2YWx1ZScsIG5lc3RlZDogeyBkYXRhOiAxMjMgfSB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKGlucHV0RGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdrZXknKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCd2YWx1ZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcmVzb3VyY2VzIGxpc3QgZm9yIHJlc291cmNlcyBkYXRhIHdpdGggVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlc0RhdGE6IElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAncmVzb3VyY2VzJyxcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUxLnRzJyksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUyLnRzJylcblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihyZXNvdXJjZXNEYXRhKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUxLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZmlsZTIudHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHJlc291cmNlcyBsaXN0IGZvciByZXNvdXJjZXMgZGF0YSB3aXRoIExvY2F0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlc0RhdGE6IElDaGF0VG9vbFJlc291cmNlc0ludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAncmVzb3VyY2VzJyxcblx0XHRcdFx0dmFsdWVzOiBbXG5cdFx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGF0aC90by9maWxlMS50cycpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEwLCAxKSB9LFxuXHRcdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTIudHMnKSwgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCAxNSwgMSkgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHJlc291cmNlc0RhdGEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZmlsZTEudHMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCc6MScpKTsgLy8gTGluZSBudW1iZXIgaW5jbHVkZWQgZm9yIExvY2F0aW9uc1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZmlsZTIudHMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCc6NScpKTsgLy8gTGluZSBudW1iZXIgaW5jbHVkZWQgZm9yIExvY2F0aW9uc1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyByZXNvdXJjZXMgbGlzdCBmb3IgbWl4ZWQgVVJJcyBhbmQgTG9jYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzRGF0YTogSUNoYXRUb29sUmVzb3VyY2VzSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvdXJjZXMnLFxuXHRcdFx0XHR2YWx1ZXM6IFtcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTEudHMnKSxcblx0XHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUyLnRzJyksIHJhbmdlOiBuZXcgUmFuZ2UoMTAsIDEsIDIwLCAxKSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24ocmVzb3VyY2VzRGF0YSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdmaWxlMS50cycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUyLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnOjEwJykpOyAvLyBMaW5lIG51bWJlciBmb3IgTG9jYXRpb24gb25seVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmb3IgZW1wdHkgcmVzb3VyY2VzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzRGF0YTogSUNoYXRUb29sUmVzb3VyY2VzSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdyZXNvdXJjZXMnLFxuXHRcdFx0XHR2YWx1ZXM6IFtdXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbihyZXNvdXJjZXNEYXRhKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVzY3JpYmVzIGNvbmZpZ3VyZWQgYXV0b21hdGlvbiByZXN1bHRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih7XG5cdFx0XHRcdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmVkJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRcdGF1dG9tYXRpb25OYW1lOiAnTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XHRcdG9wZXJhdGlvbjogJ2NyZWF0ZWQnLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHtcblx0XHRcdFx0XHRraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLFxuXHRcdFx0XHRcdGF1dG9tYXRpb25JZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRcdFx0YXV0b21hdGlvbk5hbWU6ICdNb3JuaW5nIHJldmlldycsXG5cdFx0XHRcdFx0b3BlcmF0aW9uOiAndXBkYXRlZCcsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnQ3JlYXRlZCBhbiBhdXRvbWF0aW9uOiBNb3JuaW5nIHJldmlldycsXG5cdFx0XHRcdCdFZGl0ZWQgYW4gYXV0b21hdGlvbjogTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBvYmplY3QgZm9yIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uKHVuZGVmaW5lZCksIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmlsZXMgZm9yIFVSSSBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaXMgPSBbXG5cdFx0XHRcdFVSSS5maWxlKCcvcGF0aC90by9maWxlMS50cycpLFxuXHRcdFx0XHRVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTIudHMnKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc3VsdERldGFpbHNEZXNjcmlwdGlvbih1cmlzKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZmlsZXMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5maWxlcyEubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZmlsZXMhWzBdLmluY2x1ZGVzKCdmaWxlMS50cycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZmlsZXMhWzFdLmluY2x1ZGVzKCdmaWxlMi50cycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmlsZXMgZm9yIExvY2F0aW9uIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9jYXRpb25zOiBMb2NhdGlvbltdID0gW1xuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUxLnRzJyksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMTAsIDEpIH0sXG5cdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3BhdGgvdG8vZmlsZTIudHMnKSwgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCAxNSwgMSkgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc3VsdERldGFpbHNEZXNjcmlwdGlvbihsb2NhdGlvbnMpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5maWxlcyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmZpbGVzIS5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBpbnB1dCBhbmQgaXNFcnJvciBmb3IgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0ge1xuXHRcdFx0XHRpbnB1dDogJ2NyZWF0ZV9maWxlIHBhdGg9L3Rlc3QvZmlsZS50cycsXG5cdFx0XHRcdG91dHB1dDogW10sXG5cdFx0XHRcdGlzRXJyb3I6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uKGRldGFpbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbnB1dCwgJ2NyZWF0ZV9maWxlIHBhdGg9L3Rlc3QvZmlsZS50cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pc0Vycm9yLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGlzRXJyb3IgdHJ1ZSBmb3IgZXJyb3JlZCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSB7XG5cdFx0XHRcdGlucHV0OiAnY3JlYXRlX2ZpbGUgcGF0aD0vdGVzdC9maWxlLnRzJyxcblx0XHRcdFx0b3V0cHV0OiBbXSxcblx0XHRcdFx0aXNFcnJvcjogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFJlc3VsdERldGFpbHNEZXNjcmlwdGlvbihkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXNFcnJvciwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGludm9jYXRpb24gbWVzc2FnZSB3aGVuIG5vdCBjb21wbGV0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnQ3JlYXRpbmcgZmlsZScsXG5cdFx0XHRcdCdDcmVhdGVkIGZpbGUnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnQ3JlYXRpbmcgZmlsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBwYXN0IHRlbnNlIG1lc3NhZ2Ugd2hlbiBjb21wbGV0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnQ3JlYXRpbmcgZmlsZScsXG5cdFx0XHRcdCdDcmVhdGVkIGZpbGUnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdDcmVhdGVkIGZpbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHRvb2wtc3BlY2lmaWMgZGF0YSBkZXNjcmlwdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZExpbmU6IHsgb3JpZ2luYWw6ICducG0gdGVzdCcgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdiYXNoJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRcdFx0XHQnUnVubmluZyBjb21tYW5kJyxcblx0XHRcdFx0J1JhbiBjb21tYW5kJyxcblx0XHRcdFx0dGVybWluYWxEYXRhLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdSYW4gY29tbWFuZCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ25wbSB0ZXN0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZmlsZXMgZnJvbSByZXN1bHQgZGV0YWlscyB3aGVuIGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpcyA9IFtcblx0XHRcdFx0VVJJLmZpbGUoJy9wYXRoL3RvL2ZpbGUxLnRzJyksXG5cdFx0XHRcdFVSSS5maWxlKCcvcGF0aC90by9maWxlMi50cycpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdCdDcmVhdGluZyBmaWxlcycsXG5cdFx0XHRcdCdDcmVhdGVkIGZpbGVzJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1cmlzLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnQ3JlYXRlZCBmaWxlcycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2ZpbGUxLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnZmlsZTIudHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBlcnJvciBzdGF0dXMgd2hlbiByZXN1bHQgaGFzIGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHtcblx0XHRcdFx0aW5wdXQ6ICdjcmVhdGVfZmlsZSBwYXRoPS90ZXN0L2ZpbGUudHMnLFxuXHRcdFx0XHRvdXRwdXQ6IFtdLFxuXHRcdFx0XHRpc0Vycm9yOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdCdDcmVhdGluZyBmaWxlJyxcblx0XHRcdFx0J0NyZWF0ZWQgZmlsZScsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZGV0YWlscyxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0Vycm9yZWQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzaG93IGlucHV0IHdoZW4gdG9vbC1zcGVjaWZpYyBkYXRhIGlzIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZTogeyBvcmlnaW5hbDogJ25wbSB0ZXN0JyB9LFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Jhc2gnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHtcblx0XHRcdFx0aW5wdXQ6ICdzb21lIHJlZHVuZGFudCBpbnB1dCcsXG5cdFx0XHRcdG91dHB1dDogW10sXG5cdFx0XHRcdGlzRXJyb3I6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdCdSdW5uaW5nIGNvbW1hbmQnLFxuXHRcdFx0XHQnUmFuIGNvbW1hbmQnLFxuXHRcdFx0XHR0ZXJtaW5hbERhdGEsXG5cdFx0XHRcdGRldGFpbHMsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0b29sLXNwZWNpZmljIGRhdGEgYnV0IG5vdCB0aGUgXCJJbnB1dDpcIiBsYWJlbFxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnbnBtIHRlc3QnKSk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcygnSW5wdXQ6JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvd3MgaW5wdXQgd2hlbiBubyB0b29sLXNwZWNpZmljIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0ge1xuXHRcdFx0XHRpbnB1dDogJ2FwcGx5X3BhdGNoIGZpbGU9L3Rlc3QvZmlsZS50cycsXG5cdFx0XHRcdG91dHB1dDogW10sXG5cdFx0XHRcdGlzRXJyb3I6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdCdBcHBseWluZyBwYXRjaCcsXG5cdFx0XHRcdCdBcHBsaWVkIHBhdGNoJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRkZXRhaWxzLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnQXBwbGllZCBwYXRjaCcpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0lucHV0OicpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2FwcGx5X3BhdGNoJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBhbGwgcGFydHMgdG9nZXRoZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudERhdGE6IElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0NvZGVSZXZpZXdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV2aWV3aW5nIGNvZGUgY2hhbmdlcydcblx0XHRcdH07XG5cdFx0XHRjb25zdCB1cmlzID0gW1VSSS5maWxlKCcvc3JjL3Rlc3QudHMnKV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0J1N0YXJ0aW5nIGNvZGUgcmV2aWV3Jyxcblx0XHRcdFx0J0NvbXBsZXRlZCBjb2RlIHJldmlldycsXG5cdFx0XHRcdHN1YmFnZW50RGF0YSxcblx0XHRcdFx0dXJpcyxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0NvbXBsZXRlZCBjb2RlIHJldmlldycpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0NvZGVSZXZpZXdlcicpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1Jldmlld2luZyBjb2RlIGNoYW5nZXMnKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCd0ZXN0LnRzJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnb21pdHMgdGhpbmtpbmcgY29udGVudCB3aGVuIGRpc2FibGVkIGluIHN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfU1RPUkFHRV9LRVksIGZhbHNlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VJdGVtID0ge1xuXHRcdFx0XHRyZXNwb25zZTogeyB2YWx1ZTogW3sga2luZDogJ3RoaW5raW5nJywgdmFsdWU6ICdIaWRkZW4gcmVhc29uaW5nJyB9LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1Jlc3BvbnNlIGNvbnRlbnQnKSB9XSB9LFxuXHRcdFx0XHRtb2RlbDogeyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LFxuXHRcdFx0XHRzZXRWb3RlOiAoKSA9PiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtyZXNwb25zZUl0ZW1dO1xuXHRcdFx0bGV0IGZvY3VzZWRJdGVtOiB1bmtub3duID0gcmVzcG9uc2VJdGVtO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRcdGhhc0lucHV0Rm9jdXM6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRmb2N1c1Jlc3BvbnNlSXRlbTogKCkgPT4geyBmb2N1c2VkSXRlbSA9IHJlc3BvbnNlSXRlbTsgfSxcblx0XHRcdFx0Z2V0Rm9jdXM6ICgpID0+IGZvY3VzZWRJdGVtLFxuXHRcdFx0XHRmb2N1czogKGl0ZW06IHVua25vd24pID0+IHsgZm9jdXNlZEl0ZW0gPSBpdGVtOyB9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHsgZ2V0SXRlbXM6ICgpID0+IGl0ZW1zIH1cblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogd2lkZ2V0LFxuXHRcdFx0XHRvbkRpZEFkZFdpZGdldDogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRCYWNrZ3JvdW5kU2Vzc2lvbjogRXZlbnQuTm9uZSxcblx0XHRcdFx0cmV2ZWFsOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0XHRyZXZlYWxXaWRnZXQ6IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0QWxsV2lkZ2V0czogKCkgPT4gW3dpZGdldF0sXG5cdFx0XHRcdGdldFdpZGdldEJ5SW5wdXRVcmk6ICgpID0+IHdpZGdldCxcblx0XHRcdFx0b3BlblNlc3Npb246IGFzeW5jICgpID0+IHdpZGdldCxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2U6ICgpID0+IHdpZGdldFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0U2VydmljZTtcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHdpZGdldFNlcnZpY2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXcgPSBuZXcgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcoKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzaWJsZVZpZXcuZ2V0UHJvdmlkZXIoYWNjZXNzb3IpKTtcblx0XHRcdGFzc2VydC5vayhwcm92aWRlcik7XG5cdFx0XHRzdG9yZS5hZGQocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHByb3ZpZGVyLnByb3ZpZGVDb250ZW50KCk7XG5cdFx0XHRhc3NlcnQub2soY29udGVudC5pbmNsdWRlcygnUmVzcG9uc2UgY29udGVudCcpKTtcblx0XHRcdGFzc2VydC5vayghY29udGVudC5pbmNsdWRlcygnVGhpbmtpbmc6IEhpZGRlbiByZWFzb25pbmcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIHRoZSBsYXRlc3QgcmVzcG9uc2Ugd2hlbiBmb2N1cyBpcyBvbiBhIHF1ZXVlZCByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCByZXNwb25zZUl0ZW0gPSB7XG5cdFx0XHRcdHJlc3BvbnNlOiB7IHZhbHVlOiBbeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogJ1JlYXNvbmluZycgfSwgeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdSZXNwb25zZSBjb250ZW50JykgfV0gfSxcblx0XHRcdFx0bW9kZWw6IHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSxcblx0XHRcdFx0c2V0Vm90ZTogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcXVldWVkUmVxdWVzdCA9IHsgbWVzc2FnZTogJ1F1ZXVlZCByZXF1ZXN0JyB9O1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbcmVzcG9uc2VJdGVtLCBxdWV1ZWRSZXF1ZXN0XTtcblx0XHRcdGxldCBmb2N1c2VkSXRlbTogdW5rbm93biA9IHF1ZXVlZFJlcXVlc3Q7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdFx0aGFzSW5wdXRGb2N1czogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0Zm9jdXNSZXNwb25zZUl0ZW06ICgpID0+IHsgZm9jdXNlZEl0ZW0gPSBxdWV1ZWRSZXF1ZXN0OyB9LFxuXHRcdFx0XHRnZXRGb2N1czogKCkgPT4gZm9jdXNlZEl0ZW0sXG5cdFx0XHRcdGZvY3VzOiAoaXRlbTogdW5rbm93bikgPT4geyBmb2N1c2VkSXRlbSA9IGl0ZW07IH0sXG5cdFx0XHRcdHZpZXdNb2RlbDogeyBnZXRJdGVtczogKCkgPT4gaXRlbXMgfVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRcdG9uRGlkQWRkV2lkZ2V0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEJhY2tncm91bmRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZXZlYWw6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdHJldmVhbFdpZGdldDogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbd2lkZ2V0XSxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlJbnB1dFVyaTogKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCkgPT4gd2lkZ2V0XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgd2lkZ2V0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY2Nlc3NpYmxlVmlldyA9IG5ldyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldygpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3NpYmxlVmlldy5nZXRQcm92aWRlcihhY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRcdHN0b3JlLmFkZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdSZXNwb25zZSBjb250ZW50JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ1RoaW5raW5nOiBSZWFzb25pbmcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBmaWxlIHBhdGggZm9yIFVSSSBpbmxpbmUgcmVmZXJlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCBpbmxpbmVSZWZlcmVuY2VVcmkgPSBVUkkuZmlsZSgnL3BhdGgvdG8vaW5kZXgudHMnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlSXRlbSA9IHtcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHR2YWx1ZTogW1xuXHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdTZWUgZmlsZSAnKSB9LFxuXHRcdFx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBpbmxpbmVSZWZlcmVuY2VVcmksIG5hbWU6ICdpbmRleC50cycgfSxcblx0XHRcdFx0XHRcdHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnIGZvciBkZXRhaWxzJykgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZWw6IHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSxcblx0XHRcdFx0c2V0Vm90ZTogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbcmVzcG9uc2VJdGVtXTtcblx0XHRcdGxldCBmb2N1c2VkSXRlbTogdW5rbm93biA9IHJlc3BvbnNlSXRlbTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0XHRoYXNJbnB1dEZvY3VzOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0Zm9jdXNSZXNwb25zZUl0ZW06ICgpID0+IHsgZm9jdXNlZEl0ZW0gPSByZXNwb25zZUl0ZW07IH0sXG5cdFx0XHRcdGdldEZvY3VzOiAoKSA9PiBmb2N1c2VkSXRlbSxcblx0XHRcdFx0Zm9jdXM6IChpdGVtOiB1bmtub3duKSA9PiB7IGZvY3VzZWRJdGVtID0gaXRlbTsgfSxcblx0XHRcdFx0dmlld01vZGVsOiB7IGdldEl0ZW1zOiAoKSA9PiBpdGVtcyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHdpZGdldCxcblx0XHRcdFx0b25EaWRBZGRXaWRnZXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQmFja2dyb3VuZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJldmVhbDogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHRcdFx0cmV2ZWFsV2lkZ2V0OiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldEFsbFdpZGdldHM6ICgpID0+IFt3aWRnZXRdLFxuXHRcdFx0XHRnZXRXaWRnZXRCeUlucHV0VXJpOiAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiB3aWRnZXRcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldFNlcnZpY2U7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB3aWRnZXRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3ID0gbmV3IENoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc2libGVWaWV3LmdldFByb3ZpZGVyKGFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBwcm92aWRlci5wcm92aWRlQ29udGVudCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ2luZGV4LnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoaW5saW5lUmVmZXJlbmNlVXJpLnBhdGgpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdTZWUgZmlsZScpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdmb3IgZGV0YWlscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGZpbGUgcGF0aCBhbmQgbGluZSBudW1iZXIgZm9yIExvY2F0aW9uIGlubGluZSByZWZlcmVuY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0XHRcdGNvbnN0IGZpbGVMb2NhdGlvbjogTG9jYXRpb24gPSB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9zcmMvYXBwL21haW4udHMnKSxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg0MiwgMSwgNDIsIDIwKVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VJdGVtID0ge1xuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdHZhbHVlOiBbXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ0Vycm9yIGF0ICcpIH0sXG5cdFx0XHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IGZpbGVMb2NhdGlvbiwgbmFtZTogJ21haW4udHMnIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGVsOiB7IG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sXG5cdFx0XHRcdHNldFZvdGU6ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW3Jlc3BvbnNlSXRlbV07XG5cdFx0XHRsZXQgZm9jdXNlZEl0ZW06IHVua25vd24gPSByZXNwb25zZUl0ZW07XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHtcblx0XHRcdFx0aGFzSW5wdXRGb2N1czogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdGZvY3VzUmVzcG9uc2VJdGVtOiAoKSA9PiB7IGZvY3VzZWRJdGVtID0gcmVzcG9uc2VJdGVtOyB9LFxuXHRcdFx0XHRnZXRGb2N1czogKCkgPT4gZm9jdXNlZEl0ZW0sXG5cdFx0XHRcdGZvY3VzOiAoaXRlbTogdW5rbm93bikgPT4geyBmb2N1c2VkSXRlbSA9IGl0ZW07IH0sXG5cdFx0XHRcdHZpZXdNb2RlbDogeyBnZXRJdGVtczogKCkgPT4gaXRlbXMgfVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElDaGF0V2lkZ2V0O1xuXG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRcdG9uRGlkQWRkV2lkZ2V0OiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZEJhY2tncm91bmRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRyZXZlYWw6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0XHRcdHJldmVhbFdpZGdldDogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRBbGxXaWRnZXRzOiAoKSA9PiBbd2lkZ2V0XSxcblx0XHRcdFx0Z2V0V2lkZ2V0QnlJbnB1dFVyaTogKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgKCkgPT4gd2lkZ2V0LFxuXHRcdFx0XHRnZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZTogKCkgPT4gd2lkZ2V0XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgd2lkZ2V0U2VydmljZSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhY2Nlc3NpYmxlVmlldyA9IG5ldyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldygpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3NpYmxlVmlldy5nZXRQcm92aWRlcihhY2Nlc3NvcikpO1xuXHRcdFx0YXNzZXJ0Lm9rKHByb3ZpZGVyKTtcblx0XHRcdHN0b3JlLmFkZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcHJvdmlkZXIucHJvdmlkZUNvbnRlbnQoKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdtYWluLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoYCR7ZmlsZUxvY2F0aW9uLnVyaS5wYXRofTo0MmApKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgYmFzZW5hbWUgYXMgbmFtZSBmb3IgVVJJIGlubGluZSByZWZlcmVuY2VzIHdpdGhvdXQgZXhwbGljaXQgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCBpbmxpbmVSZWZlcmVuY2VVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zcmMvdXRpbHMudHMnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlSXRlbSA9IHtcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHR2YWx1ZTogW1xuXHRcdFx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBpbmxpbmVSZWZlcmVuY2VVcmkgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZWw6IHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUgfSxcblx0XHRcdFx0c2V0Vm90ZTogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbcmVzcG9uc2VJdGVtXTtcblx0XHRcdGxldCBmb2N1c2VkSXRlbTogdW5rbm93biA9IHJlc3BvbnNlSXRlbTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0XHRoYXNJbnB1dEZvY3VzOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0Zm9jdXNSZXNwb25zZUl0ZW06ICgpID0+IHsgZm9jdXNlZEl0ZW0gPSByZXNwb25zZUl0ZW07IH0sXG5cdFx0XHRcdGdldEZvY3VzOiAoKSA9PiBmb2N1c2VkSXRlbSxcblx0XHRcdFx0Zm9jdXM6IChpdGVtOiB1bmtub3duKSA9PiB7IGZvY3VzZWRJdGVtID0gaXRlbTsgfSxcblx0XHRcdFx0dmlld01vZGVsOiB7IGdldEl0ZW1zOiAoKSA9PiBpdGVtcyB9XG5cdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHdpZGdldCxcblx0XHRcdFx0b25EaWRBZGRXaWRnZXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQmFja2dyb3VuZFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHJldmVhbDogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHRcdFx0cmV2ZWFsV2lkZ2V0OiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldEFsbFdpZGdldHM6ICgpID0+IFt3aWRnZXRdLFxuXHRcdFx0XHRnZXRXaWRnZXRCeUlucHV0VXJpOiAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiB3aWRnZXQsXG5cdFx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiB3aWRnZXRcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldFNlcnZpY2U7XG5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCB3aWRnZXRTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3ID0gbmV3IENoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc2libGVWaWV3LmdldFByb3ZpZGVyKGFjY2Vzc29yKSk7XG5cdFx0XHRhc3NlcnQub2socHJvdmlkZXIpO1xuXHRcdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBwcm92aWRlci5wcm92aWRlQ29udGVudCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ3V0aWxzLnRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoaW5saW5lUmVmZXJlbmNlVXJpLnBhdGgpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYTtBQUV0QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDRCQUE0QixtREFBbUQsZ0NBQWdDLDZCQUE2Qix3Q0FBd0M7QUFDN0wsU0FBc0IsMEJBQTBCO0FBRWhELFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sOEJBQThCLE1BQU07QUFDekMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxRQUFNLGtDQUFrQyxNQUFNO0FBQzdDLFNBQUssc0NBQXNDLE1BQU07QUFDaEQsYUFBTyxZQUFZLCtCQUErQixNQUFTLEdBQUcsRUFBRTtBQUFBLElBQ2pFLENBQUM7QUFFRCxTQUFLLDBDQUEwQyxNQUFNO0FBQ3BELFlBQU0sZUFBZ0Q7QUFBQSxRQUNyRCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsVUFDWixVQUFVO0FBQUEsVUFDVixZQUFZO0FBQUEsVUFDWixZQUFZO0FBQUEsUUFDYjtBQUFBLFFBQ0EsVUFBVTtBQUFBLE1BQ1g7QUFFQSxhQUFPLFlBQVksK0JBQStCLFlBQVksR0FBRyx3QkFBd0I7QUFBQSxJQUMxRixDQUFDO0FBRUQsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxZQUFNLGVBQWdEO0FBQUEsUUFDckQsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1YsWUFBWTtBQUFBLFFBQ2I7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
