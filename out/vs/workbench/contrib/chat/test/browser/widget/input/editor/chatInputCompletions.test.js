import assert from "assert";
import { CancellationToken } from "../../../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../../../editor/common/core/range.js";
import { CompletionItemKind, CompletionTriggerKind } from "../../../../../../../../editor/common/languages.js";
import { LanguageFeaturesService } from "../../../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../../../editor/test/common/testTextModel.js";
import { AgentHostInputCompletionsBase } from "../../../../../browser/widget/input/editor/agentHostInputCompletionsBase.js";
import { AgentHostInputCompletions } from "../../../../../browser/widget/input/editor/agentHostInputCompletions.js";
import { createChatReferenceVariableEntry } from "../../../../../common/attachments/chatVariableEntries.js";
import { attachedContextCompletionSortText, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionFilterText, isAtTriggerCharacterToken } from "../../../../../browser/widget/input/editor/chatInputCompletionUtils.js";
import { chatAgentLeader, chatVariableLeader } from "../../../../../common/requestParser/chatParserTypes.js";
import { MockChatSessionsService } from "../../../../common/mockChatSessionsService.js";
import { MockChatWidgetService } from "../../../widget/mockChatWidget.js";
import { TestConfigurationService } from "../../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { upcastPartial } from "../../../../../../../../base/test/common/mock.js";
class TestChatSessionsService extends MockChatSessionsService {
  async provideChatInputCompletions(_sessionResource, _params, _token) {
    return {
      items: [{
        insertText: "#roadmap.md",
        attachment: {
          kind: "resource",
          uri: URI.file("/workspace/roadmap.md")
        }
      }]
    };
  }
}
class TestAgentHostInputCompletions extends AgentHostInputCompletionsBase {
  constructor(languageFeaturesService, chatSessionsService, _completionKind = CompletionItemKind.File) {
    super(languageFeaturesService, chatSessionsService);
    this._completionKind = _completionKind;
  }
  register() {
    return this._registerProvider({ scheme: "test" }, "testAgentHostInputCompletions", ["#"], void 0);
  }
  _resolveContext(_model) {
    return { sessionResource: URI.parse("test:session"), context: void 0 };
  }
  _buildItem(position, item) {
    return {
      label: item.insertText,
      insertText: item.insertText,
      range: Range.fromPositions(position),
      kind: this._completionKind
    };
  }
}
suite("AgentHostInputCompletionsBase", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("marks results incomplete so the host is queried as the token changes", async () => {
    const languageFeaturesService = new LanguageFeaturesService();
    const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService()));
    store.add(completions.register());
    const model = store.add(createTextModel("#", null, void 0, URI.parse("test:input")));
    const provider = languageFeaturesService.completionProvider.ordered(model)[0];
    const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "#" }, CancellationToken.None);
    assert.deepStrictEqual(result, {
      suggestions: [{
        label: "#roadmap.md",
        insertText: "#roadmap.md",
        range: new Range(1, 2, 1, 2),
        kind: CompletionItemKind.File
      }],
      incomplete: true
    });
  });
  test("marks non-file results incomplete so the host can fuzzy match them", async () => {
    const languageFeaturesService = new LanguageFeaturesService();
    const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService(), CompletionItemKind.Text));
    store.add(completions.register());
    const model = store.add(createTextModel("#", null, void 0, URI.parse("test:input")));
    const provider = languageFeaturesService.completionProvider.ordered(model)[0];
    const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: "#" }, CancellationToken.None);
    assert.deepStrictEqual(result, {
      suggestions: [{
        label: "#roadmap.md",
        insertText: "#roadmap.md",
        range: new Range(1, 2, 1, 2),
        kind: CompletionItemKind.Text
      }],
      incomplete: true
    });
  });
});
class TestableAgentHostInputCompletions extends AgentHostInputCompletions {
  buildItem(position, item, widget) {
    return this._buildItem(position, item, widget);
  }
}
suite("AgentHostInputCompletions #chat references", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepting a multi-word #chat reference registers a range covering the whole token", () => {
    const completions = store.add(new TestableAgentHostInputCompletions(
      new LanguageFeaturesService(),
      new MockChatWidgetService(),
      new TestChatSessionsService(),
      new TestConfigurationService()
    ));
    const widget = upcastPartial({});
    const chatResource = URI.parse("ahp-chat://chat-2/base64session");
    const built = completions.buildItem(new Position(1, 19), {
      insertText: "#chat:Design chat ",
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 19 },
      attachment: {
        kind: "chat",
        uri: chatResource,
        endTurn: "turn-5",
        title: "Design chat"
      }
    }, widget);
    const argument = built?.command?.arguments?.[0];
    assert.deepStrictEqual({ id: argument?.id, range: argument?.range }, {
      // Stable dynamic-variable id, so the parser treats the reference as one part.
      id: createChatReferenceVariableEntry(chatResource, "turn-5", "Design chat").id,
      // Covers `#chat:Design chat` (columns 1..18, end-exclusive) — the whole
      // token minus the trailing space, never a partial slice.
      range: new Range(1, 1, 1, 18)
    });
  });
});
suite("escapeForCharClass", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes through simple characters unchanged", () => {
    assert.strictEqual(escapeForCharClass("a"), "a");
    assert.strictEqual(escapeForCharClass("#"), "#");
    assert.strictEqual(escapeForCharClass("@"), "@");
  });
  test("escapes backslash", () => {
    assert.strictEqual(escapeForCharClass("\\"), "\\\\");
  });
  test("escapes closing bracket", () => {
    assert.strictEqual(escapeForCharClass("]"), "\\]");
  });
  test("escapes caret", () => {
    assert.strictEqual(escapeForCharClass("^"), "\\^");
  });
  test("escapes hyphen", () => {
    assert.strictEqual(escapeForCharClass("-"), "\\-");
  });
  test("escapes multiple special chars in one string", () => {
    assert.strictEqual(escapeForCharClass("-^]\\"), "\\-\\^\\]\\\\");
  });
  test("is safe to use for chatVariableLeader and chatAgentLeader", () => {
    const escaped = `[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]`;
    const re = new RegExp(escaped);
    assert.ok(re.test("#"));
    assert.ok(re.test("@"));
    assert.ok(!re.test("a"));
    assert.ok(!re.test("/"));
  });
});
suite("attached context completion ranking", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("sorts before other chat input completions", () => {
    assert.ok(attachedContextCompletionSortText < " ");
  });
  test("matches bare and partial leaders from the start of filter text", () => {
    assert.deepStrictEqual({
      at: getAttachedContextCompletionFilterText("@", "Screen Recording.mov", "file"),
      hash: getAttachedContextCompletionFilterText("#", "Screen Recording.mov", "file")
    }, {
      at: "@Screen Recording.mov @attachment:Screen Recording.mov Screen Recording.mov file",
      hash: "#Screen Recording.mov #attachment:Screen Recording.mov Screen Recording.mov file"
    });
  });
});
suite("computeCompletionRanges", () => {
  let store;
  setup(() => {
    store = new DisposableStore();
  });
  teardown(() => {
    store.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function variableNameDef() {
    return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, "g");
  }
  function fileWordPattern() {
    return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g");
  }
  function toolVariableNameDef() {
    return new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, "g");
  }
  suite("with VariableNameDef regex", () => {
    test("matches #variable at start of line", () => {
      const model = store.add(createTextModel("#file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 6),
        replace: new Range(1, 1, 1, 6),
        varWord: { word: "#file", startColumn: 1, endColumn: 6 }
      });
    });
    test("matches @variable at start of line", () => {
      const model = store.add(createTextModel("@file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 6),
        replace: new Range(1, 1, 1, 6),
        varWord: { word: "@file", startColumn: 1, endColumn: 6 }
      });
    });
    test("matches #variable mid-line after space", () => {
      const model = store.add(createTextModel("hello #file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 7, 1, 12),
        replace: new Range(1, 7, 1, 12),
        varWord: { word: "#file", startColumn: 7, endColumn: 12 }
      });
    });
    test("matches @variable mid-line after space", () => {
      const model = store.add(createTextModel("hello @file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 7, 1, 12),
        replace: new Range(1, 7, 1, 12),
        varWord: { word: "@file", startColumn: 7, endColumn: 12 }
      });
    });
    test("matches # alone (just the leader)", () => {
      const model = store.add(createTextModel("#", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#");
    });
    test("matches @ alone (just the leader)", () => {
      const model = store.add(createTextModel("@", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@");
    });
    test("matches variable with colons and hyphens", () => {
      const model = store.add(createTextModel("#file:test-1", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 13), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:test-1");
    });
    test("cursor in middle of variable produces partial insert range", () => {
      const model = store.add(createTextModel("@selection", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 5), variableNameDef());
      assert.ok(result);
      assert.deepStrictEqual(result, {
        insert: new Range(1, 1, 1, 5),
        replace: new Range(1, 1, 1, 11),
        varWord: { word: "@selection", startColumn: 1, endColumn: 11 }
      });
    });
  });
  suite("with fileWordPattern regex", () => {
    test("matches #file:path/to/file.ts", () => {
      const model = store.add(createTextModel("#file:path/to/file.ts", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:path/to/file.ts");
    });
    test("matches @file:path/to/file.ts", () => {
      const model = store.add(createTextModel("@file:path/to/file.ts", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@file:path/to/file.ts");
    });
    test("stops at whitespace", () => {
      const model = store.add(createTextModel("#file:test rest", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), fileWordPattern());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file:test");
    });
  });
  suite("with toolVariableNameDef regex", () => {
    test("matches #tool at start of line", () => {
      const model = store.add(createTextModel("#tool", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#tool");
    });
    test("matches @tool at start of line", () => {
      const model = store.add(createTextModel("@tool", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@tool");
    });
    test("matches #tool after space", () => {
      const model = store.add(createTextModel("use #fetch", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#fetch");
    });
    test("matches @tool after space", () => {
      const model = store.add(createTextModel("use @fetch", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@fetch");
    });
  });
  suite("edge cases", () => {
    test("returns undefined inside a normal word", () => {
      const model = store.add(createTextModel("hello", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when no space before cursor mid-line", () => {
      const model = store.add(createTextModel("ab", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
      assert.strictEqual(result, void 0);
    });
    test("returns empty range at blank position after space", () => {
      const model = store.add(createTextModel("hello ", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 7), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord, null);
      assert.deepStrictEqual(result.insert, Range.fromPositions(new Position(1, 7)));
    });
    test("returns empty range at start of empty line", () => {
      const model = store.add(createTextModel("", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 1), variableNameDef());
      assert.ok(result);
      assert.strictEqual(result.varWord, null);
    });
    test("onlyOnWordStart=true rejects variable preceded by a word", () => {
      const model = store.add(createTextModel("abc#file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 9), variableNameDef(), true);
      assert.strictEqual(result, void 0);
    });
    test("onlyOnWordStart=true accepts variable after space", () => {
      const model = store.add(createTextModel("abc #file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "#file");
    });
    test("onlyOnWordStart=true accepts @variable after space", () => {
      const model = store.add(createTextModel("abc @file", null, void 0, URI.parse("test:input")));
      const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
      assert.ok(result);
      assert.strictEqual(result.varWord?.word, "@file");
    });
  });
});
suite("isAtTriggerCharacterToken", () => {
  let store;
  setup(() => {
    store = new DisposableStore();
  });
  teardown(() => {
    store.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  const triggerChars = ["@", "#"];
  function check(text, column, expected) {
    const model = store.add(createTextModel(text, null, void 0, URI.parse("test:input")));
    assert.strictEqual(
      isAtTriggerCharacterToken(model, new Position(1, column), triggerChars),
      expected,
      `text=${JSON.stringify(text)} column=${column}`
    );
  }
  test("cursor right after a trigger character at start of line", () => {
    check("@", 2, true);
  });
  test("cursor inside a trigger-led token at start of line", () => {
    check("@file", 4, true);
  });
  test("cursor at end of a trigger-led token at start of line", () => {
    check("@file", 6, true);
  });
  test("cursor inside a trigger-led token mid-line", () => {
    check("hello @file", 10, true);
  });
  test("cursor inside a # trigger-led token", () => {
    check("hello #file", 10, true);
  });
  test("cursor inside a non-trigger-led word at start of line", () => {
    check("hello", 4, false);
  });
  test("cursor inside a non-trigger-led word mid-line", () => {
    check("say hello", 8, false);
  });
  test("cursor at start of empty line", () => {
    check("", 1, false);
  });
  test("cursor right after whitespace, no token yet", () => {
    check("hello ", 7, false);
  });
  test("cursor after a trigger-led token followed by space", () => {
    check("@file ", 7, false);
  });
  test("cursor in token whose first char is not a trigger char", () => {
    check("abc@def", 8, false);
  });
  test("returns false when no trigger characters are configured", () => {
    const model = store.add(createTextModel("@file", null, void 0, URI.parse("test:input")));
    assert.strictEqual(isAtTriggerCharacterToken(model, new Position(1, 4), []), false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0Q29tcGxldGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvblRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2FnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25Tb3J0VGV4dCwgY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMsIGVzY2FwZUZvckNoYXJDbGFzcywgZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvbkZpbHRlclRleHQsIGlzQXRUcmlnZ2VyQ2hhcmFjdGVyVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0Q29tcGxldGlvblV0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSwgSUNoYXRJbnB1dENvbXBsZXRpb25zUGFyYW1zLCBJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vd2lkZ2V0L21vY2tDaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuXG5jbGFzcyBUZXN0Q2hhdFNlc3Npb25zU2VydmljZSBleHRlbmRzIE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgYXN5bmMgcHJvdmlkZUNoYXRJbnB1dENvbXBsZXRpb25zKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3BhcmFtczogSUNoYXRJbnB1dENvbXBsZXRpb25zUGFyYW1zLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdGluc2VydFRleHQ6ICcjcm9hZG1hcC5tZCcsXG5cdFx0XHRcdGF0dGFjaG1lbnQ6IHtcblx0XHRcdFx0XHRraW5kOiAncmVzb3VyY2UnLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvcm9hZG1hcC5tZCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyBleHRlbmRzIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlPHZvaWQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25LaW5kID0gQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsXG5cdCkge1xuXHRcdHN1cGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblx0fVxuXG5cdHJlZ2lzdGVyKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXJQcm92aWRlcih7IHNjaGVtZTogJ3Rlc3QnIH0sICd0ZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucycsIFsnIyddLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZXNvbHZlQ29udGV4dChfbW9kZWw6IElUZXh0TW9kZWwpOiB7IHNlc3Npb25SZXNvdXJjZTogVVJJOyBjb250ZXh0OiB2b2lkIH0ge1xuXHRcdHJldHVybiB7IHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0OnNlc3Npb24nKSwgY29udGV4dDogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2J1aWxkSXRlbShwb3NpdGlvbjogUG9zaXRpb24sIGl0ZW06IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSk6IENvbXBsZXRpb25JdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSxcblx0XHRcdGtpbmQ6IHRoaXMuX2NvbXBsZXRpb25LaW5kLFxuXHRcdH07XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdElucHV0Q29tcGxldGlvbnNCYXNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXJrcyByZXN1bHRzIGluY29tcGxldGUgc28gdGhlIGhvc3QgaXMgcXVlcmllZCBhcyB0aGUgdG9rZW4gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gc3RvcmUuYWRkKG5ldyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IFRlc3RDaGF0U2Vzc2lvbnNTZXJ2aWNlKCkpKTtcblx0XHRzdG9yZS5hZGQoY29tcGxldGlvbnMucmVnaXN0ZXIoKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLm9yZGVyZWQobW9kZWwpWzBdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpLCB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3RlciwgdHJpZ2dlckNoYXJhY3RlcjogJyMnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRsYWJlbDogJyNyb2FkbWFwLm1kJyxcblx0XHRcdFx0aW5zZXJ0VGV4dDogJyNyb2FkbWFwLm1kJyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCAyKSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsXG5cdFx0XHR9XSxcblx0XHRcdGluY29tcGxldGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIG5vbi1maWxlIHJlc3VsdHMgaW5jb21wbGV0ZSBzbyB0aGUgaG9zdCBjYW4gZnV6enkgbWF0Y2ggdGhlbScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gc3RvcmUuYWRkKG5ldyBUZXN0QWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IFRlc3RDaGF0U2Vzc2lvbnNTZXJ2aWNlKCksIENvbXBsZXRpb25JdGVtS2luZC5UZXh0KSk7XG5cdFx0c3RvcmUuYWRkKGNvbXBsZXRpb25zLnJlZ2lzdGVyKCkpO1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnIycsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5vcmRlcmVkKG1vZGVsKVswXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSwgeyB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXIsIHRyaWdnZXJDaGFyYWN0ZXI6ICcjJyB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0bGFiZWw6ICcjcm9hZG1hcC5tZCcsXG5cdFx0XHRcdGluc2VydFRleHQ6ICcjcm9hZG1hcC5tZCcsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0fV0sXG5cdFx0XHRpbmNvbXBsZXRlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vKipcbiAqIFRlc3QgZG91YmxlIGV4cG9zaW5nIHRoZSBwcm90ZWN0ZWQge0BsaW5rIEFnZW50SG9zdElucHV0Q29tcGxldGlvbnMuX2J1aWxkSXRlbX1cbiAqIHNvIHRoZSBhY2NlcHRlZC1yYW5nZSBpbnZhcmlhbnQgY2FuIGJlIGFzc2VydGVkIGRpcmVjdGx5LlxuICovXG5jbGFzcyBUZXN0YWJsZUFnZW50SG9zdElucHV0Q29tcGxldGlvbnMgZXh0ZW5kcyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zIHtcblx0YnVpbGRJdGVtKHBvc2l0aW9uOiBQb3NpdGlvbiwgaXRlbTogSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtLCB3aWRnZXQ6IElDaGF0V2lkZ2V0KTogQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZEl0ZW0ocG9zaXRpb24sIGl0ZW0sIHdpZGdldCk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdElucHV0Q29tcGxldGlvbnMgI2NoYXQgcmVmZXJlbmNlcycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWNjZXB0aW5nIGEgbXVsdGktd29yZCAjY2hhdCByZWZlcmVuY2UgcmVnaXN0ZXJzIGEgcmFuZ2UgY292ZXJpbmcgdGhlIHdob2xlIHRva2VuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gc3RvcmUuYWRkKG5ldyBUZXN0YWJsZUFnZW50SG9zdElucHV0Q29tcGxldGlvbnMoXG5cdFx0XHRuZXcgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UoKSxcblx0XHRcdG5ldyBNb2NrQ2hhdFdpZGdldFNlcnZpY2UoKSxcblx0XHRcdG5ldyBUZXN0Q2hhdFNlc3Npb25zU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCkpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRXaWRnZXQ+KHt9KTtcblx0XHQvLyBUaGUgY29tcGxldGlvbiBjYXJyaWVzIHRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSwgc3RvcmVkIHZlcmJhdGltIG9uXG5cdFx0Ly8gdGhlIGFjY2VwdGVkIHJlZmVyZW5jZSBlbnRyeS5cblx0XHRjb25zdCBjaGF0UmVzb3VyY2UgPSBVUkkucGFyc2UoJ2FocC1jaGF0Oi8vY2hhdC0yL2Jhc2U2NHNlc3Npb24nKTtcblxuXHRcdC8vIFRoZSBob3N0IGluc2VydHMgYCNjaGF0Ojx0aXRsZT4gYCAodHJhaWxpbmcgc3BhY2UpIHNwYW5uaW5nIGNvbHVtbnMgMS4uMTkuXG5cdFx0Y29uc3QgYnVpbHQgPSBjb21wbGV0aW9ucy5idWlsZEl0ZW0obmV3IFBvc2l0aW9uKDEsIDE5KSwge1xuXHRcdFx0aW5zZXJ0VGV4dDogJyNjaGF0OkRlc2lnbiBjaGF0ICcsXG5cdFx0XHRzdGFydDogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSxcblx0XHRcdGVuZDogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDE5IH0sXG5cdFx0XHRhdHRhY2htZW50OiB7XG5cdFx0XHRcdGtpbmQ6ICdjaGF0Jyxcblx0XHRcdFx0dXJpOiBjaGF0UmVzb3VyY2UsXG5cdFx0XHRcdGVuZFR1cm46ICd0dXJuLTUnLFxuXHRcdFx0XHR0aXRsZTogJ0Rlc2lnbiBjaGF0Jyxcblx0XHRcdH0sXG5cdFx0fSwgd2lkZ2V0KTtcblxuXHRcdGNvbnN0IGFyZ3VtZW50ID0gYnVpbHQ/LmNvbW1hbmQ/LmFyZ3VtZW50cz8uWzBdIGFzIHsgaWQ6IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGlkOiBhcmd1bWVudD8uaWQsIHJhbmdlOiBhcmd1bWVudD8ucmFuZ2UgfSwge1xuXHRcdFx0Ly8gU3RhYmxlIGR5bmFtaWMtdmFyaWFibGUgaWQsIHNvIHRoZSBwYXJzZXIgdHJlYXRzIHRoZSByZWZlcmVuY2UgYXMgb25lIHBhcnQuXG5cdFx0XHRpZDogY3JlYXRlQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkoY2hhdFJlc291cmNlLCAndHVybi01JywgJ0Rlc2lnbiBjaGF0JykuaWQsXG5cdFx0XHQvLyBDb3ZlcnMgYCNjaGF0OkRlc2lnbiBjaGF0YCAoY29sdW1ucyAxLi4xOCwgZW5kLWV4Y2x1c2l2ZSkgXHUyMDE0IHRoZSB3aG9sZVxuXHRcdFx0Ly8gdG9rZW4gbWludXMgdGhlIHRyYWlsaW5nIHNwYWNlLCBuZXZlciBhIHBhcnRpYWwgc2xpY2UuXG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE4KSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2VzY2FwZUZvckNoYXJDbGFzcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBzaW1wbGUgY2hhcmFjdGVycyB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUZvckNoYXJDbGFzcygnYScpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJyMnKSwgJyMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlRm9yQ2hhckNsYXNzKCdAJyksICdAJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgYmFja3NsYXNoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJ1xcXFwnKSwgJ1xcXFxcXFxcJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgY2xvc2luZyBicmFja2V0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVGb3JDaGFyQ2xhc3MoJ10nKSwgJ1xcXFxdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgY2FyZXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUZvckNoYXJDbGFzcygnXicpLCAnXFxcXF4nKTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlcyBoeXBoZW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUZvckNoYXJDbGFzcygnLScpLCAnXFxcXC0nKTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlcyBtdWx0aXBsZSBzcGVjaWFsIGNoYXJzIGluIG9uZSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUZvckNoYXJDbGFzcygnLV5dXFxcXCcpLCAnXFxcXC1cXFxcXlxcXFxdXFxcXFxcXFwnKTtcblx0fSk7XG5cblx0dGVzdCgnaXMgc2FmZSB0byB1c2UgZm9yIGNoYXRWYXJpYWJsZUxlYWRlciBhbmQgY2hhdEFnZW50TGVhZGVyJywgKCkgPT4ge1xuXHRcdC8vIFRoZXNlIGFyZSB0aGUgYWN0dWFsIHZhbHVlcyB1c2VkIGluIHRoZSBwcm9kdWN0IGNvZGVcblx0XHRjb25zdCBlc2NhcGVkID0gYFske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XWA7XG5cdFx0Y29uc3QgcmUgPSBuZXcgUmVnRXhwKGVzY2FwZWQpO1xuXHRcdGFzc2VydC5vayhyZS50ZXN0KCcjJykpO1xuXHRcdGFzc2VydC5vayhyZS50ZXN0KCdAJykpO1xuXHRcdGFzc2VydC5vayghcmUudGVzdCgnYScpKTtcblx0XHRhc3NlcnQub2soIXJlLnRlc3QoJy8nKSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdhdHRhY2hlZCBjb250ZXh0IGNvbXBsZXRpb24gcmFua2luZycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc29ydHMgYmVmb3JlIG90aGVyIGNoYXQgaW5wdXQgY29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25Tb3J0VGV4dCA8ICcgJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgYmFyZSBhbmQgcGFydGlhbCBsZWFkZXJzIGZyb20gdGhlIHN0YXJ0IG9mIGZpbHRlciB0ZXh0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXQ6IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25GaWx0ZXJUZXh0KCdAJywgJ1NjcmVlbiBSZWNvcmRpbmcubW92JywgJ2ZpbGUnKSxcblx0XHRcdGhhc2g6IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25GaWx0ZXJUZXh0KCcjJywgJ1NjcmVlbiBSZWNvcmRpbmcubW92JywgJ2ZpbGUnKSxcblx0XHR9LCB7XG5cdFx0XHRhdDogJ0BTY3JlZW4gUmVjb3JkaW5nLm1vdiBAYXR0YWNobWVudDpTY3JlZW4gUmVjb3JkaW5nLm1vdiBTY3JlZW4gUmVjb3JkaW5nLm1vdiBmaWxlJyxcblx0XHRcdGhhc2g6ICcjU2NyZWVuIFJlY29yZGluZy5tb3YgI2F0dGFjaG1lbnQ6U2NyZWVuIFJlY29yZGluZy5tb3YgU2NyZWVuIFJlY29yZGluZy5tb3YgZmlsZScsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdjb21wdXRlQ29tcGxldGlvblJhbmdlcycsICgpID0+IHtcblxuXHRsZXQgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIEhlbHBlcjogYnVpbGRzIHRoZSBzYW1lIHJlZ2V4IHBhdHRlcm5zIHVzZWQgaW4gdGhlIHByb2R1Y3QgY29kZVxuXHRmdW5jdGlvbiB2YXJpYWJsZU5hbWVEZWYoKSB7XG5cdFx0cmV0dXJuIG5ldyBSZWdFeHAoYFske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XVtcXFxcdzotXSpgLCAnZycpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlsZVdvcmRQYXR0ZXJuKCkge1xuXHRcdHJldHVybiBuZXcgUmVnRXhwKGBbJHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdFZhcmlhYmxlTGVhZGVyKX0ke2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0QWdlbnRMZWFkZXIpfV1bXlxcXFxzXSpgLCAnZycpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9vbFZhcmlhYmxlTmFtZURlZigpIHtcblx0XHRyZXR1cm4gbmV3IFJlZ0V4cChgKD88PV58XFxcXHMpWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dXFxcXHcqYCwgJ2cnKTtcblx0fVxuXG5cdC8vIC0tLSBWYXJpYWJsZU5hbWVEZWYgcGF0dGVybiB0ZXN0cyAtLS1cblxuXHRzdWl0ZSgnd2l0aCBWYXJpYWJsZU5hbWVEZWYgcmVnZXgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICN2YXJpYWJsZSBhdCBzdGFydCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjZmlsZScsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNiksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0aW5zZXJ0OiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksXG5cdFx0XHRcdHJlcGxhY2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSxcblx0XHRcdFx0dmFyV29yZDogeyB3b3JkOiAnI2ZpbGUnLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiA2IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQHZhcmlhYmxlIGF0IHN0YXJ0IG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ0BmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRpbnNlcnQ6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSxcblx0XHRcdFx0cmVwbGFjZTogbmV3IFJhbmdlKDEsIDEsIDEsIDYpLFxuXHRcdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICdAZmlsZScsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDYgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyAjdmFyaWFibGUgbWlkLWxpbmUgYWZ0ZXIgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvICNmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMiksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0aW5zZXJ0OiBuZXcgUmFuZ2UoMSwgNywgMSwgMTIpLFxuXHRcdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMSwgNywgMSwgMTIpLFxuXHRcdFx0XHR2YXJXb3JkOiB7IHdvcmQ6ICcjZmlsZScsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDEyIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQHZhcmlhYmxlIG1pZC1saW5lIGFmdGVyIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyBAZmlsZScsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTIpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGluc2VydDogbmV3IFJhbmdlKDEsIDcsIDEsIDEyKSxcblx0XHRcdFx0cmVwbGFjZTogbmV3IFJhbmdlKDEsIDcsIDEsIDEyKSxcblx0XHRcdFx0dmFyV29yZDogeyB3b3JkOiAnQGZpbGUnLCBzdGFydENvbHVtbjogNywgZW5kQ29sdW1uOiAxMiB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICMgYWxvbmUgKGp1c3QgdGhlIGxlYWRlciknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJyMnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZD8ud29yZCwgJyMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQCBhbG9uZSAoanVzdCB0aGUgbGVhZGVyKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnQCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMiksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnQCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyB2YXJpYWJsZSB3aXRoIGNvbG9ucyBhbmQgaHlwaGVucycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnI2ZpbGU6dGVzdC0xJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMyksIHZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnI2ZpbGU6dGVzdC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjdXJzb3IgaW4gbWlkZGxlIG9mIHZhcmlhYmxlIHByb2R1Y2VzIHBhcnRpYWwgaW5zZXJ0IHJhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdAc2VsZWN0aW9uJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRpbnNlcnQ6IG5ldyBSYW5nZSgxLCAxLCAxLCA1KSxcblx0XHRcdFx0cmVwbGFjZTogbmV3IFJhbmdlKDEsIDEsIDEsIDExKSxcblx0XHRcdFx0dmFyV29yZDogeyB3b3JkOiAnQHNlbGVjdGlvbicsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDExIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGZpbGVXb3JkUGF0dGVybiB0ZXN0cyAtLS1cblxuXHRzdWl0ZSgnd2l0aCBmaWxlV29yZFBhdHRlcm4gcmVnZXgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICNmaWxlOnBhdGgvdG8vZmlsZS50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnI2ZpbGU6cGF0aC90by9maWxlLnRzJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyMiksIGZpbGVXb3JkUGF0dGVybigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnI2ZpbGU6cGF0aC90by9maWxlLnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIEBmaWxlOnBhdGgvdG8vZmlsZS50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnQGZpbGU6cGF0aC90by9maWxlLnRzJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyMiksIGZpbGVXb3JkUGF0dGVybigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnQGZpbGU6cGF0aC90by9maWxlLnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9wcyBhdCB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcjZmlsZTp0ZXN0IHJlc3QnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDExKSwgZmlsZVdvcmRQYXR0ZXJuKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjZmlsZTp0ZXN0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSB0b29sVmFyaWFibGVOYW1lRGVmIHRlc3RzIC0tLVxuXG5cdHN1aXRlKCd3aXRoIHRvb2xWYXJpYWJsZU5hbWVEZWYgcmVnZXgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXRjaGVzICN0b29sIGF0IHN0YXJ0IG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJyN0b29sJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSwgdG9vbFZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnI3Rvb2wnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQHRvb2wgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnQHRvb2wnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpLCB0b29sVmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICdAdG9vbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyAjdG9vbCBhZnRlciBzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgndXNlICNmZXRjaCcsIG51bGwsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCd0ZXN0OmlucHV0JykpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTEpLCB0b29sVmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICcjZmV0Y2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgQHRvb2wgYWZ0ZXIgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ3VzZSBAZmV0Y2gnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDExKSwgdG9vbFZhcmlhYmxlTmFtZURlZigpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnQGZldGNoJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBFZGdlIGNhc2VzIC0tLVxuXG5cdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgaW5zaWRlIGEgbm9ybWFsIHdvcmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gc3BhY2UgYmVmb3JlIGN1cnNvciBtaWQtbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnYWInLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSByYW5nZSBhdCBibGFuayBwb3NpdGlvbiBhZnRlciBzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA3KSwgdmFyaWFibGVOYW1lRGVmKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaW5zZXJ0LCBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbigxLCA3KSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSByYW5nZSBhdCBzdGFydCBvZiBlbXB0eSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCB2YXJpYWJsZU5hbWVEZWYoKSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFyV29yZCwgbnVsbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmx5T25Xb3JkU3RhcnQ9dHJ1ZSByZWplY3RzIHZhcmlhYmxlIHByZWNlZGVkIGJ5IGEgd29yZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnYWJjI2ZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDkpLCB2YXJpYWJsZU5hbWVEZWYoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seU9uV29yZFN0YXJ0PXRydWUgYWNjZXB0cyB2YXJpYWJsZSBhZnRlciBzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCgnYWJjICNmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMCksIHZhcmlhYmxlTmFtZURlZigpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC52YXJXb3JkPy53b3JkLCAnI2ZpbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29ubHlPbldvcmRTdGFydD10cnVlIGFjY2VwdHMgQHZhcmlhYmxlIGFmdGVyIHNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKCdhYmMgQGZpbGUnLCBudWxsLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDppbnB1dCcpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEwKSwgdmFyaWFibGVOYW1lRGVmKCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnZhcldvcmQ/LndvcmQsICdAZmlsZScpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNBdFRyaWdnZXJDaGFyYWN0ZXJUb2tlbicsICgpID0+IHtcblxuXHRsZXQgc3RvcmU6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHRyaWdnZXJDaGFycyA9IFsnQCcsICcjJ107XG5cblx0ZnVuY3Rpb24gY2hlY2sodGV4dDogc3RyaW5nLCBjb2x1bW46IG51bWJlciwgZXhwZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwodGV4dCwgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGlzQXRUcmlnZ2VyQ2hhcmFjdGVyVG9rZW4obW9kZWwsIG5ldyBQb3NpdGlvbigxLCBjb2x1bW4pLCB0cmlnZ2VyQ2hhcnMpLFxuXHRcdFx0ZXhwZWN0ZWQsXG5cdFx0XHRgdGV4dD0ke0pTT04uc3RyaW5naWZ5KHRleHQpfSBjb2x1bW49JHtjb2x1bW59YCxcblx0XHQpO1xuXHR9XG5cblx0dGVzdCgnY3Vyc29yIHJpZ2h0IGFmdGVyIGEgdHJpZ2dlciBjaGFyYWN0ZXIgYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnQCcsIDIsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgaW5zaWRlIGEgdHJpZ2dlci1sZWQgdG9rZW4gYXQgc3RhcnQgb2YgbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnQGZpbGUnLCA0LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGF0IGVuZCBvZiBhIHRyaWdnZXItbGVkIHRva2VuIGF0IHN0YXJ0IG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y2hlY2soJ0BmaWxlJywgNiwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBpbnNpZGUgYSB0cmlnZ2VyLWxlZCB0b2tlbiBtaWQtbGluZScsICgpID0+IHtcblx0XHRjaGVjaygnaGVsbG8gQGZpbGUnLCAxMCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBpbnNpZGUgYSAjIHRyaWdnZXItbGVkIHRva2VuJywgKCkgPT4ge1xuXHRcdGNoZWNrKCdoZWxsbyAjZmlsZScsIDEwLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGluc2lkZSBhIG5vbi10cmlnZ2VyLWxlZCB3b3JkIGF0IHN0YXJ0IG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y2hlY2soJ2hlbGxvJywgNCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgaW5zaWRlIGEgbm9uLXRyaWdnZXItbGVkIHdvcmQgbWlkLWxpbmUnLCAoKSA9PiB7XG5cdFx0Y2hlY2soJ3NheSBoZWxsbycsIDgsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIGF0IHN0YXJ0IG9mIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0Y2hlY2soJycsIDEsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY3Vyc29yIHJpZ2h0IGFmdGVyIHdoaXRlc3BhY2UsIG5vIHRva2VuIHlldCcsICgpID0+IHtcblx0XHRjaGVjaygnaGVsbG8gJywgNywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXJzb3IgYWZ0ZXIgYSB0cmlnZ2VyLWxlZCB0b2tlbiBmb2xsb3dlZCBieSBzcGFjZScsICgpID0+IHtcblx0XHQvLyBDdXJzb3Igc2l0cyBpbiB0aGUgZW1wdHkgdG9rZW4gYWZ0ZXIgdGhlIHNwYWNlLCBub3QgaW4gdGhlIEBmaWxlIHRva2VuLlxuXHRcdGNoZWNrKCdAZmlsZSAnLCA3LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1cnNvciBpbiB0b2tlbiB3aG9zZSBmaXJzdCBjaGFyIGlzIG5vdCBhIHRyaWdnZXIgY2hhcicsICgpID0+IHtcblx0XHRjaGVjaygnYWJjQGRlZicsIDgsIGZhbHNlKTsgLy8gZmlyc3QgY2hhciBvZiB0b2tlbiBpcyAnYScsIG5vdCAnQCdcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBmYWxzZSB3aGVuIG5vIHRyaWdnZXIgY2hhcmFjdGVycyBhcmUgY29uZmlndXJlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ0BmaWxlJywgbnVsbCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ3Rlc3Q6aW5wdXQnKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F0VHJpZ2dlckNoYXJhY3RlclRva2VuKG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCksIFtdKSwg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
