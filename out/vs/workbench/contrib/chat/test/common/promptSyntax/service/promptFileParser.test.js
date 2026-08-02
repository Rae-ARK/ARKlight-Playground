import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { parseCommaSeparatedList, PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
suite("PromptFileParser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agent", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      `tools: ['tool1', 'tool2']`,
      /* 05 */
      "---",
      /* 06 */
      "This is an agent test.",
      /* 07 */
      "Here is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 5, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 26), value: { type: "scalar", value: "Agent test", range: new Range(2, 14, 2, 26), format: "double" } },
      { key: "model", range: new Range(3, 1, 3, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(3, 8, 3, 15), format: "none" } },
      {
        key: "tools",
        range: new Range(4, 1, 4, 26),
        value: {
          type: "sequence",
          items: [{ type: "scalar", value: "tool1", range: new Range(4, 9, 4, 16), format: "single" }, { type: "scalar", value: "tool2", range: new Range(4, 18, 4, 25), format: "single" }],
          range: new Range(4, 8, 4, 26)
        }
      }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 6, startColumn: 1, endLineNumber: 8, endColumn: 1 });
    assert.equal(result.body.offset, 75);
    assert.equal(result.body.getContent(), "This is an agent test.\nHere is a #tool:tool1 variable (and one with closing parenthesis after: #tool:tool-2) and a #file:./reference1.md as well as a [reference](./reference2.md) and an image ![image](./image.png).");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(7, 99, 7, 114), content: "./reference1.md", isMarkdownLink: false },
      { range: new Range(7, 140, 7, 155), content: "./reference2.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, [
      { range: new Range(7, 17, 7, 22), name: "tool1", offset: 108, fullLength: 11 },
      { range: new Range(7, 79, 7, 85), name: "tool-2", offset: 170, fullLength: 12 }
    ]);
    const [ref1, ref2] = result.body.variableReferences;
    assert.equal(content.substring(ref1.offset, ref1.offset + ref1.fullLength), "#tool:tool1");
    assert.equal(content.substring(ref2.offset, ref2.offset + ref2.fullLength), "#tool:tool-2");
    assert.deepEqual(result.header.description, "Agent test");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.tools);
    assert.deepEqual(result.header.tools, ["tool1", "tool2"]);
  });
  test("mode with handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      "handoffs:",
      /* 05 */
      '  - label: "Implement"',
      /* 06 */
      "    agent: Default",
      /* 07 */
      '    prompt: "Implement the plan"',
      /* 08 */
      "    send: false",
      /* 09 */
      '  - label: "Save"',
      /* 10 */
      "    agent: Default",
      /* 11 */
      '    prompt: "Save the plan to a file"',
      /* 12 */
      "    send: true",
      /* 13 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 13, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 26), value: { type: "scalar", value: "Agent test", range: new Range(2, 14, 2, 26), format: "double" } },
      { key: "model", range: new Range(3, 1, 3, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(3, 8, 3, 15), format: "none" } },
      {
        key: "handoffs",
        range: new Range(4, 1, 12, 15),
        value: {
          type: "sequence",
          range: new Range(5, 1, 12, 15),
          items: [
            {
              type: "map",
              range: new Range(5, 5, 8, 16),
              properties: [
                { key: { type: "scalar", value: "label", range: new Range(5, 5, 5, 10), format: "none" }, value: { type: "scalar", value: "Implement", range: new Range(5, 12, 5, 23), format: "double" } },
                { key: { type: "scalar", value: "agent", range: new Range(6, 5, 6, 10), format: "none" }, value: { type: "scalar", value: "Default", range: new Range(6, 12, 6, 19), format: "none" } },
                { key: { type: "scalar", value: "prompt", range: new Range(7, 5, 7, 11), format: "none" }, value: { type: "scalar", value: "Implement the plan", range: new Range(7, 13, 7, 33), format: "double" } },
                { key: { type: "scalar", value: "send", range: new Range(8, 5, 8, 9), format: "none" }, value: { type: "scalar", value: "false", range: new Range(8, 11, 8, 16), format: "none" } }
              ]
            },
            {
              type: "map",
              range: new Range(9, 5, 12, 15),
              properties: [
                { key: { type: "scalar", value: "label", range: new Range(9, 5, 9, 10), format: "none" }, value: { type: "scalar", value: "Save", range: new Range(9, 12, 9, 18), format: "double" } },
                { key: { type: "scalar", value: "agent", range: new Range(10, 5, 10, 10), format: "none" }, value: { type: "scalar", value: "Default", range: new Range(10, 12, 10, 19), format: "none" } },
                { key: { type: "scalar", value: "prompt", range: new Range(11, 5, 11, 11), format: "none" }, value: { type: "scalar", value: "Save the plan to a file", range: new Range(11, 13, 11, 38), format: "double" } },
                { key: { type: "scalar", value: "send", range: new Range(12, 5, 12, 9), format: "none" }, value: { type: "scalar", value: "true", range: new Range(12, 11, 12, 15), format: "none" } }
              ]
            }
          ]
        }
      }
    ]);
    assert.deepEqual(result.header.description, "Agent test");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs, [
      { label: "Implement", agent: "Default", prompt: "Implement the plan", send: false },
      { label: "Save", agent: "Default", prompt: "Save the plan to a file", send: true }
    ]);
  });
  test("mode with handoff and showContinueOn per handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "model: GPT 4.1",
      /* 04 */
      "handoffs:",
      /* 05 */
      '  - label: "Implement"',
      /* 06 */
      "    agent: Default",
      /* 07 */
      '    prompt: "Implement the plan"',
      /* 08 */
      "    send: false",
      /* 09 */
      "    showContinueOn: false",
      /* 10 */
      '  - label: "Save"',
      /* 11 */
      "    agent: Default",
      /* 12 */
      '    prompt: "Save the plan"',
      /* 13 */
      "    send: true",
      /* 14 */
      "    showContinueOn: true",
      /* 15 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs, [
      { label: "Implement", agent: "Default", prompt: "Implement the plan", send: false, showContinueOn: false },
      { label: "Save", agent: "Default", prompt: "Save the plan", send: true, showContinueOn: true }
    ]);
  });
  test("showContinueOn defaults to undefined when not specified per handoff", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "handoffs:",
      /* 04 */
      '  - label: "Save"',
      /* 05 */
      "    agent: Default",
      /* 06 */
      '    prompt: "Save the plan"',
      /* 07 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.header.handOffs);
    assert.deepEqual(result.header.handOffs[0].showContinueOn, void 0);
  });
  test("handoff with whitespace-only label is skipped", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Agent test"`,
      /* 03 */
      "handoffs:",
      /* 04 */
      '  - label: "   "',
      /* 05 */
      "    agent: Default",
      /* 06 */
      '    prompt: "Do something"',
      /* 07 */
      '  - label: "Valid"',
      /* 08 */
      "    agent: Default",
      /* 09 */
      '    prompt: "Also do something"',
      /* 10 */
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.header);
    assert.deepStrictEqual(result.header.handOffs, [
      { agent: "Default", label: "Valid", prompt: "Also do something" }
    ]);
  });
  test("instructions", async () => {
    const uri = URI.parse("file:///test/prompt1.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "Code style instructions for TypeScript"`,
      /* 03 */
      "applyTo: *.ts",
      /* 04 */
      "---",
      /* 05 */
      "Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 54), value: { type: "scalar", value: "Code style instructions for TypeScript", range: new Range(2, 14, 2, 54), format: "double" } },
      { key: "applyTo", range: new Range(3, 1, 3, 14), value: { type: "scalar", value: "*.ts", range: new Range(3, 10, 3, 14), format: "none" } }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 5, startColumn: 1, endLineNumber: 6, endColumn: 1 });
    assert.equal(result.body.offset, 76);
    assert.equal(result.body.getContent(), "Follow my companies coding guidlines at [mycomp-ts-guidelines](https://mycomp/guidelines#typescript.md)");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(5, 64, 5, 103), content: "https://mycomp/guidelines#typescript.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
    assert.deepEqual(result.header.description, "Code style instructions for TypeScript");
    assert.deepEqual(result.header.applyTo, "*.ts");
  });
  test("prompt file", async () => {
    const uri = URI.parse("file:///test/prompt2.md");
    const content = [
      /* 01 */
      "---",
      /* 02 */
      `description: "General purpose coding assistant"`,
      /* 03 */
      "agent: agent",
      /* 04 */
      "model: GPT 4.1",
      /* 05 */
      `tools: ['search', 'terminal']`,
      /* 06 */
      "---",
      /* 07 */
      "This is a prompt file body referencing #tool:search and [docs](https://example.com/docs)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.range, { startLineNumber: 2, startColumn: 1, endLineNumber: 6, endColumn: 1 });
    assert.deepEqual(result.header.attributes, [
      { key: "description", range: new Range(2, 1, 2, 48), value: { type: "scalar", value: "General purpose coding assistant", range: new Range(2, 14, 2, 48), format: "double" } },
      { key: "agent", range: new Range(3, 1, 3, 13), value: { type: "scalar", value: "agent", range: new Range(3, 8, 3, 13), format: "none" } },
      { key: "model", range: new Range(4, 1, 4, 15), value: { type: "scalar", value: "GPT 4.1", range: new Range(4, 8, 4, 15), format: "none" } },
      {
        key: "tools",
        range: new Range(5, 1, 5, 30),
        value: {
          type: "sequence",
          items: [{ type: "scalar", value: "search", range: new Range(5, 9, 5, 17), format: "single" }, { type: "scalar", value: "terminal", range: new Range(5, 19, 5, 29), format: "single" }],
          range: new Range(5, 8, 5, 30)
        }
      }
    ]);
    assert.deepEqual(result.body.range, { startLineNumber: 7, startColumn: 1, endLineNumber: 8, endColumn: 1 });
    assert.equal(result.body.offset, 114);
    assert.equal(result.body.getContent(), "This is a prompt file body referencing #tool:search and [docs](https://example.com/docs).");
    assert.deepEqual(result.body.fileReferences, [
      { range: new Range(7, 64, 7, 88), content: "https://example.com/docs", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, [
      { range: new Range(7, 46, 7, 52), name: "search", offset: 153, fullLength: 12 }
    ]);
    assert.deepEqual(result.header.description, "General purpose coding assistant");
    assert.deepEqual(result.header.agent, "agent");
    assert.deepEqual(result.header.model, ["GPT 4.1"]);
    assert.ok(result.header.tools);
    assert.deepEqual(result.header.tools, ["search", "terminal"]);
  });
  test("ignores links and variables inside inline code and fenced code blocks", async () => {
    const uri = URI.parse("file:///test/prompt3.md");
    const content = [
      "---",
      `description: "Prompt with markdown code"`,
      "---",
      "Outside #tool:outside and [outside](./outside.md).",
      "Inline code: `#tool:inline and [inline](./inline.md)` should be ignored.",
      "```ts",
      "#tool:block and #file:./inside-block.md and [block](./block.md)",
      "```",
      "After block #file:./after.md and [after](./after-link.md)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((reference) => ({ content: reference.content, isMarkdownLink: reference.isMarkdownLink })), [
      { content: "./outside.md", isMarkdownLink: true },
      { content: "./after.md", isMarkdownLink: false },
      { content: "./after-link.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences.map((reference) => reference.name), ["outside"]);
  });
  test("ignores references in multiple inline code spans on the same line", async () => {
    const uri = URI.parse("file:///test/prompt-inline.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "Before `#tool:ignored1` middle #tool:visible `[link](./ignored.md)` after [real](./real.md)."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./real.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
  });
  test("handles fenced code block without language specifier", async () => {
    const uri = URI.parse("file:///test/prompt-fence.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "```",
      "#file:./ignored.md",
      "[link](./ignored-link.md)",
      "```",
      "#file:./visible.md"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./visible.md", isMarkdownLink: false }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
  });
  test("handles multiple fenced code blocks", async () => {
    const uri = URI.parse("file:///test/prompt-multi-fence.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "#tool:before",
      "```js",
      "#tool:ignored1",
      "```",
      "#tool:between",
      "```python",
      "#tool:ignored2",
      "```",
      "#tool:after"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["before", "between", "after"]);
  });
  test("unclosed fenced code block ignores all remaining lines", async () => {
    const uri = URI.parse("file:///test/prompt-unclosed.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "#tool:visible",
      "```",
      "#tool:ignored",
      "#file:./ignored.md"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
    assert.deepEqual(result.body.fileReferences, []);
  });
  test("adjacent inline code does not suppress outside references", async () => {
    const uri = URI.parse("file:///test/prompt-adjacent.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "`code`#tool:attached `more`[link](./file.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["attached"]);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./file.md", isMarkdownLink: true }
    ]);
  });
  test("indented fenced code block is still detected", async () => {
    const uri = URI.parse("file:///test/prompt-indent.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "  ```ts",
      "  #tool:ignored",
      "  ```",
      "#tool:visible"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
  });
  test("fenced code block with 4 backticks", async () => {
    const uri = URI.parse("file:///test/prompt-4tick.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "````",
      "#tool:ignored and [link](./ignored.md)",
      "````",
      "#tool:visible"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.variableReferences.map((r) => r.name), ["visible"]);
    assert.deepEqual(result.body.fileReferences, []);
  });
  test("fenced code block with tilde fence (~~~)", async () => {
    const uri = URI.parse("file:///test/prompt-tilde.md");
    const content = [
      "---",
      'description: "test"',
      "---",
      "~~~",
      "#file:./ignored.md and [link](./ignored-link.md)",
      "#tool:ignored",
      "~~~",
      "[real](./real.md)"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.body);
    assert.deepEqual(result.body.fileReferences.map((r) => ({ content: r.content, isMarkdownLink: r.isMarkdownLink })), [
      { content: "./real.md", isMarkdownLink: true }
    ]);
    assert.deepEqual(result.body.variableReferences, []);
  });
  test("agent with agents", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with restrictions"`,
      'agents: ["subagent1", "subagent2"]',
      "---",
      "This is an agent with restricted subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.description, "Agent with restrictions");
    assert.deepEqual(result.header.agents, ["subagent1", "subagent2"]);
  });
  test("agent with empty agents array", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with no access"`,
      "agents: []",
      "---",
      "This agent has no access to subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent with no access");
    assert.deepEqual(result.header.agents, []);
  });
  test("agent with wildcard agents", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent with full access"`,
      'agents: ["*"]',
      "---",
      "This agent has access to all subagents."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent with full access");
    assert.deepEqual(result.header.agents, ["*"]);
  });
  test("agent without agents (undefined)", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      `description: "Agent without restrictions"`,
      "---",
      "This agent has default access to all."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.deepEqual(result.header.description, "Agent without restrictions");
    assert.deepEqual(result.header.agents, void 0);
  });
  suite("parseCommaSeparatedList", () => {
    function assertCommaSeparatedList(input, expected) {
      const actual = parseCommaSeparatedList({ type: "scalar", value: input, range: new Range(1, 1, 1, input.length + 1), format: "none" });
      assert.deepStrictEqual(actual.items, expected);
    }
    test("simple unquoted values", () => {
      assertCommaSeparatedList("a, b, c", [
        { type: "scalar", value: "a", range: new Range(1, 1, 1, 2), format: "none" },
        { type: "scalar", value: "b", range: new Range(1, 4, 1, 5), format: "none" },
        { type: "scalar", value: "c", range: new Range(1, 7, 1, 8), format: "none" }
      ]);
    });
    test("unquoted values without spaces", () => {
      assertCommaSeparatedList("foo,bar,baz", [
        { type: "scalar", value: "foo", range: new Range(1, 1, 1, 4), format: "none" },
        { type: "scalar", value: "bar", range: new Range(1, 5, 1, 8), format: "none" },
        { type: "scalar", value: "baz", range: new Range(1, 9, 1, 12), format: "none" }
      ]);
    });
    test("double quoted values", () => {
      assertCommaSeparatedList('"hello", "world"', [
        { type: "scalar", value: "hello", range: new Range(1, 1, 1, 8), format: "double" },
        { type: "scalar", value: "world", range: new Range(1, 10, 1, 17), format: "double" }
      ]);
    });
    test("single quoted values", () => {
      assertCommaSeparatedList(`'one', 'two'`, [
        { type: "scalar", value: "one", range: new Range(1, 1, 1, 6), format: "single" },
        { type: "scalar", value: "two", range: new Range(1, 8, 1, 13), format: "single" }
      ]);
    });
    test("mixed quoted and unquoted values", () => {
      assertCommaSeparatedList(`unquoted, "double", 'single'`, [
        { type: "scalar", value: "unquoted", range: new Range(1, 1, 1, 9), format: "none" },
        { type: "scalar", value: "double", range: new Range(1, 11, 1, 19), format: "double" },
        { type: "scalar", value: "single", range: new Range(1, 21, 1, 29), format: "single" }
      ]);
    });
    test("quoted values with commas inside", () => {
      assertCommaSeparatedList('"a,b", "c,d"', [
        { type: "scalar", value: "a,b", range: new Range(1, 1, 1, 6), format: "double" },
        { type: "scalar", value: "c,d", range: new Range(1, 8, 1, 13), format: "double" }
      ]);
    });
    test("empty string", () => {
      assertCommaSeparatedList("", []);
    });
    test("single value", () => {
      assertCommaSeparatedList("single", [
        { type: "scalar", value: "single", range: new Range(1, 1, 1, 7), format: "none" }
      ]);
    });
    test("values with extra whitespace", () => {
      assertCommaSeparatedList("  a  ,  b  ,  c  ", [
        { type: "scalar", value: "a", range: new Range(1, 3, 1, 4), format: "none" },
        { type: "scalar", value: "b", range: new Range(1, 9, 1, 10), format: "none" },
        { type: "scalar", value: "c", range: new Range(1, 15, 1, 16), format: "none" }
      ]);
    });
    test("quoted value with spaces", () => {
      assertCommaSeparatedList('"hello world", "foo bar"', [
        { type: "scalar", value: "hello world", range: new Range(1, 1, 1, 14), format: "double" },
        { type: "scalar", value: "foo bar", range: new Range(1, 16, 1, 25), format: "double" }
      ]);
    });
    test("with position offset", () => {
      const result = parseCommaSeparatedList({ type: "scalar", value: "a, b, c", range: new Range(6, 11, 6, 18), format: "none" });
      assert.deepStrictEqual(result.items, [
        { type: "scalar", value: "a", range: new Range(6, 11, 6, 12), format: "none" },
        { type: "scalar", value: "b", range: new Range(6, 14, 6, 15), format: "none" },
        { type: "scalar", value: "c", range: new Range(6, 17, 6, 18), format: "none" }
      ]);
    });
    test("entire input wrapped in double quotes", () => {
      assertCommaSeparatedList('"a, b, c"', [
        { type: "scalar", value: "a, b, c", range: new Range(1, 1, 1, 10), format: "double" }
      ]);
    });
    test("entire input wrapped in single quotes", () => {
      assertCommaSeparatedList(`'a, b, c'`, [
        { type: "scalar", value: "a, b, c", range: new Range(1, 1, 1, 10), format: "single" }
      ]);
    });
  });
  test("userInvocable getter reads user-invocable attribute", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content1 = [
      "---",
      'description: "Test"',
      "user-invocable: true",
      "---"
    ].join("\n");
    const result1 = new PromptFileParser().parse(uri, content1);
    assert.strictEqual(result1.header?.userInvocable, true);
    const content2 = [
      "---",
      'description: "Test"',
      "user-invocable: false",
      "---"
    ].join("\n");
    const result2 = new PromptFileParser().parse(uri, content2);
    assert.strictEqual(result2.header?.userInvocable, false);
    const content4 = [
      "---",
      'description: "Test"',
      "---"
    ].join("\n");
    const result4 = new PromptFileParser().parse(uri, content4);
    assert.strictEqual(result4.header?.userInvocable, void 0);
  });
  test("agent with all header fields including colons in description", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      "name: Explore",
      "description: Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.",
      `argument-hint: Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`,
      `model: ['Claude Haiku 4.5 (copilot)', 'Gemini 3 Flash (Preview) (copilot)', 'Auto (copilot)']`,
      "target: vscode",
      "user-invocable: false",
      `tools: ['search', 'read', 'web', 'vscode/memory', 'github/issue_read', 'github.vscode-pull-request-github/issue_fetch', 'github.vscode-pull-request-github/activePullRequest', 'execute/getTerminalOutput', 'execute/testFailure']`,
      "agents: []",
      "---",
      "You are an exploration agent specialized in rapid codebase analysis and answering questions efficiently.",
      "",
      "## Search Strategy",
      "",
      "- Go **broad to narrow**:",
      "	1. Start with glob patterns or semantic codesearch to discover relevant areas",
      "	2. Narrow with text search (regex) or usages (LSP) for specific symbols or patterns",
      "	3. Read files only when you know the path or need full context",
      "- Pay attention to provided agent instructions/rules/skills as they apply to areas of the codebase to better understand architecture and best practices.",
      "- Use the github repo tool to search references in external dependencies.",
      "",
      "## Speed Principles",
      "",
      "Adapt search strategy based on the requested thoroughness level.",
      "",
      "**Bias for speed** \u2014 return findings as quickly as possible:",
      "- Parallelize independent tool calls (multiple greps, multiple reads)",
      "- Stop searching once you have sufficient context",
      "- Make targeted searches, not exhaustive sweeps",
      "",
      "## Output",
      "",
      "Report findings directly as a message. Include:",
      "- Files with absolute links",
      "- Specific functions, types, or patterns that can be reused",
      "- Analogous existing features that serve as implementation templates",
      "- Clear answers to what was asked, not comprehensive overviews",
      "",
      "Remember: Your goal is searching efficiently through MAXIMUM PARALLELISM to report concise and clear answers."
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.deepEqual(result.uri, uri);
    assert.ok(result.header);
    assert.ok(result.body);
    assert.deepEqual(result.header.name, "Explore");
    assert.deepEqual(result.header.description, "Fast read-only codebase exploration and Q&A subagent. Prefer over manually chaining multiple search and file-reading operations to avoid cluttering the main conversation. Safe to call in parallel. Specify thoroughness: quick, medium, or thorough.");
    assert.deepEqual(result.header.argumentHint, `Describe WHAT you're looking for and desired thoroughness (quick/medium/thorough)`);
    assert.deepEqual(result.header.model, ["Claude Haiku 4.5 (copilot)", "Gemini 3 Flash (Preview) (copilot)", "Auto (copilot)"]);
    assert.deepEqual(result.header.target, "vscode");
    assert.deepEqual(result.header.userInvocable, false);
    assert.deepEqual(result.header.tools, ["search", "read", "web", "vscode/memory", "github/issue_read", "github.vscode-pull-request-github/issue_fetch", "github.vscode-pull-request-github/activePullRequest", "execute/getTerminalOutput", "execute/testFailure"]);
    assert.deepEqual(result.header.agents, []);
    assert.deepEqual(result.header.attributes.length, 8);
    assert.deepEqual(result.header.attributes.map((a) => a.key), [
      "name",
      "description",
      "argument-hint",
      "model",
      "target",
      "user-invocable",
      "tools",
      "agents"
    ]);
  });
  test("agent with unquoted description containing colon-space", async () => {
    const uri = URI.parse("file:///test/test.agent.md");
    const content = [
      "---",
      "name: Test",
      "description: This has a colon: in the middle",
      "target: vscode",
      "---"
    ].join("\n");
    const result = new PromptFileParser().parse(uri, content);
    assert.ok(result.header);
    assert.deepEqual(result.header.name, "Test");
    assert.deepEqual(result.header.description, "This has a colon: in the middle");
    assert.deepEqual(result.header.target, "vscode");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0RmlsZVBhcnNlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJU2NhbGFyVmFsdWUsIHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0LCBQcm9tcHRGaWxlUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcblxuc3VpdGUoJ1Byb21wdEZpbGVQYXJzZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkFnZW50IHRlc3RcImAsXG5cdFx0XHQvKiAwMyAqLydtb2RlbDogR1BUIDQuMScsXG5cdFx0XHQvKiAwNCAqL2B0b29sczogWyd0b29sMScsICd0b29sMiddYCxcblx0XHRcdC8qIDA1ICovJy0tLScsXG5cdFx0XHQvKiAwNiAqLydUaGlzIGlzIGFuIGFnZW50IHRlc3QuJyxcblx0XHRcdC8qIDA3ICovJ0hlcmUgaXMgYSAjdG9vbDp0b29sMSB2YXJpYWJsZSAoYW5kIG9uZSB3aXRoIGNsb3NpbmcgcGFyZW50aGVzaXMgYWZ0ZXI6ICN0b29sOnRvb2wtMikgYW5kIGEgI2ZpbGU6Li9yZWZlcmVuY2UxLm1kIGFzIHdlbGwgYXMgYSBbcmVmZXJlbmNlXSguL3JlZmVyZW5jZTIubWQpIGFuZCBhbiBpbWFnZSAhW2ltYWdlXSguL2ltYWdlLnBuZykuJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDUsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYXR0cmlidXRlcywgW1xuXHRcdFx0eyBrZXk6ICdkZXNjcmlwdGlvbicsIHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMjYpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdBZ2VudCB0ZXN0JywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxNCwgMiwgMjYpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdHsga2V5OiAnbW9kZWwnLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDE1KSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnR1BUIDQuMScsIHJhbmdlOiBuZXcgUmFuZ2UoMywgOCwgMywgMTUpLCBmb3JtYXQ6ICdub25lJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtleTogJ3Rvb2xzJywgcmFuZ2U6IG5ldyBSYW5nZSg0LCAxLCA0LCAyNiksIHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRcdFx0XHRpdGVtczogW3sgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAndG9vbDEnLCByYW5nZTogbmV3IFJhbmdlKDQsIDksIDQsIDE2KSwgZm9ybWF0OiAnc2luZ2xlJyB9LCB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3Rvb2wyJywgcmFuZ2U6IG5ldyBSYW5nZSg0LCAxOCwgNCwgMjUpLCBmb3JtYXQ6ICdzaW5nbGUnIH1dLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoNCwgOCwgNCwgMjYpXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDYsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA4LCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdC5ib2R5Lm9mZnNldCwgNzUpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHQuYm9keS5nZXRDb250ZW50KCksICdUaGlzIGlzIGFuIGFnZW50IHRlc3QuXFxuSGVyZSBpcyBhICN0b29sOnRvb2wxIHZhcmlhYmxlIChhbmQgb25lIHdpdGggY2xvc2luZyBwYXJlbnRoZXNpcyBhZnRlcjogI3Rvb2w6dG9vbC0yKSBhbmQgYSAjZmlsZTouL3JlZmVyZW5jZTEubWQgYXMgd2VsbCBhcyBhIFtyZWZlcmVuY2VdKC4vcmVmZXJlbmNlMi5tZCkgYW5kIGFuIGltYWdlICFbaW1hZ2VdKC4vaW1hZ2UucG5nKS4nKTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCA5OSwgNywgMTE0KSwgY29udGVudDogJy4vcmVmZXJlbmNlMS5tZCcsIGlzTWFya2Rvd25MaW5rOiBmYWxzZSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDE0MCwgNywgMTU1KSwgY29udGVudDogJy4vcmVmZXJlbmNlMi5tZCcsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH1cblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW1xuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDE3LCA3LCAyMiksIG5hbWU6ICd0b29sMScsIG9mZnNldDogMTA4LCBmdWxsTGVuZ3RoOiAxMSB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDc5LCA3LCA4NSksIG5hbWU6ICd0b29sLTInLCBvZmZzZXQ6IDE3MCwgZnVsbExlbmd0aDogMTIgfVxuXHRcdF0pO1xuXHRcdGNvbnN0IFtyZWYxLCByZWYyXSA9IHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcztcblx0XHRhc3NlcnQuZXF1YWwoY29udGVudC5zdWJzdHJpbmcocmVmMS5vZmZzZXQsIHJlZjEub2Zmc2V0ICsgcmVmMS5mdWxsTGVuZ3RoKSwgJyN0b29sOnRvb2wxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKGNvbnRlbnQuc3Vic3RyaW5nKHJlZjIub2Zmc2V0LCByZWYyLm9mZnNldCArIHJlZjIuZnVsbExlbmd0aCksICcjdG9vbDp0b29sLTInKTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ0FnZW50IHRlc3QnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIubW9kZWwsIFsnR1BUIDQuMSddKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlci50b29scyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLnRvb2xzLCBbJ3Rvb2wxJywgJ3Rvb2wyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlIHdpdGggaGFuZG9mZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdC8qIDAxICovJy0tLScsXG5cdFx0XHQvKiAwMiAqL2BkZXNjcmlwdGlvbjogXCJBZ2VudCB0ZXN0XCJgLFxuXHRcdFx0LyogMDMgKi8nbW9kZWw6IEdQVCA0LjEnLFxuXHRcdFx0LyogMDQgKi8naGFuZG9mZnM6Jyxcblx0XHRcdC8qIDA1ICovJyAgLSBsYWJlbDogXCJJbXBsZW1lbnRcIicsXG5cdFx0XHQvKiAwNiAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMDcgKi8nICAgIHByb21wdDogXCJJbXBsZW1lbnQgdGhlIHBsYW5cIicsXG5cdFx0XHQvKiAwOCAqLycgICAgc2VuZDogZmFsc2UnLFxuXHRcdFx0LyogMDkgKi8nICAtIGxhYmVsOiBcIlNhdmVcIicsXG5cdFx0XHQvKiAxMCAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMTEgKi8nICAgIHByb21wdDogXCJTYXZlIHRoZSBwbGFuIHRvIGEgZmlsZVwiJyxcblx0XHRcdC8qIDEyICovJyAgICBzZW5kOiB0cnVlJyxcblx0XHRcdC8qIDEzICovJy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMTMsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYXR0cmlidXRlcywgW1xuXHRcdFx0eyBrZXk6ICdkZXNjcmlwdGlvbicsIHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMjYpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdBZ2VudCB0ZXN0JywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxNCwgMiwgMjYpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdHsga2V5OiAnbW9kZWwnLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDE1KSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnR1BUIDQuMScsIHJhbmdlOiBuZXcgUmFuZ2UoMywgOCwgMywgMTUpLCBmb3JtYXQ6ICdub25lJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtleTogJ2hhbmRvZmZzJywgcmFuZ2U6IG5ldyBSYW5nZSg0LCAxLCAxMiwgMTUpLCB2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg1LCAxLCAxMiwgMTUpLFxuXHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdtYXAnLCByYW5nZTogbmV3IFJhbmdlKDUsIDUsIDgsIDE2KSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczogW1xuXHRcdFx0XHRcdFx0XHRcdHsga2V5OiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2xhYmVsJywgcmFuZ2U6IG5ldyBSYW5nZSg1LCA1LCA1LCAxMCksIGZvcm1hdDogJ25vbmUnIH0sIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0ltcGxlbWVudCcsIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMTIsIDUsIDIzKSwgZm9ybWF0OiAnZG91YmxlJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYWdlbnQnLCByYW5nZTogbmV3IFJhbmdlKDYsIDUsIDYsIDEwKSwgZm9ybWF0OiAnbm9uZScgfSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnRGVmYXVsdCcsIHJhbmdlOiBuZXcgUmFuZ2UoNiwgMTIsIDYsIDE5KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsga2V5OiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3Byb21wdCcsIHJhbmdlOiBuZXcgUmFuZ2UoNywgNSwgNywgMTEpLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdJbXBsZW1lbnQgdGhlIHBsYW4nLCByYW5nZTogbmV3IFJhbmdlKDcsIDEzLCA3LCAzMyksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsga2V5OiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3NlbmQnLCByYW5nZTogbmV3IFJhbmdlKDgsIDUsIDgsIDkpLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdmYWxzZScsIHJhbmdlOiBuZXcgUmFuZ2UoOCwgMTEsIDgsIDE2KSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbWFwJywgcmFuZ2U6IG5ldyBSYW5nZSg5LCA1LCAxMiwgMTUpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnbGFiZWwnLCByYW5nZTogbmV3IFJhbmdlKDksIDUsIDksIDEwKSwgZm9ybWF0OiAnbm9uZScgfSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnU2F2ZScsIHJhbmdlOiBuZXcgUmFuZ2UoOSwgMTIsIDksIDE4KSwgZm9ybWF0OiAnZG91YmxlJyB9IH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBrZXk6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYWdlbnQnLCByYW5nZTogbmV3IFJhbmdlKDEwLCA1LCAxMCwgMTApLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdEZWZhdWx0JywgcmFuZ2U6IG5ldyBSYW5nZSgxMCwgMTIsIDEwLCAxOSksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRcdFx0XHRcdFx0XHR7IGtleTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdwcm9tcHQnLCByYW5nZTogbmV3IFJhbmdlKDExLCA1LCAxMSwgMTEpLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdTYXZlIHRoZSBwbGFuIHRvIGEgZmlsZScsIHJhbmdlOiBuZXcgUmFuZ2UoMTEsIDEzLCAxMSwgMzgpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdFx0XHRcdFx0XHR7IGtleTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdzZW5kJywgcmFuZ2U6IG5ldyBSYW5nZSgxMiwgNSwgMTIsIDkpLCBmb3JtYXQ6ICdub25lJyB9LCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICd0cnVlJywgcmFuZ2U6IG5ldyBSYW5nZSgxMiwgMTEsIDEyLCAxNSksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnQWdlbnQgdGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5tb2RlbCwgWydHUFQgNC4xJ10pO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyLmhhbmRPZmZzKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuaGFuZE9mZnMsIFtcblx0XHRcdHsgbGFiZWw6ICdJbXBsZW1lbnQnLCBhZ2VudDogJ0RlZmF1bHQnLCBwcm9tcHQ6ICdJbXBsZW1lbnQgdGhlIHBsYW4nLCBzZW5kOiBmYWxzZSB9LFxuXHRcdFx0eyBsYWJlbDogJ1NhdmUnLCBhZ2VudDogJ0RlZmF1bHQnLCBwcm9tcHQ6ICdTYXZlIHRoZSBwbGFuIHRvIGEgZmlsZScsIHNlbmQ6IHRydWUgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlIHdpdGggaGFuZG9mZiBhbmQgc2hvd0NvbnRpbnVlT24gcGVyIGhhbmRvZmYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiQWdlbnQgdGVzdFwiYCxcblx0XHRcdC8qIDAzICovJ21vZGVsOiBHUFQgNC4xJyxcblx0XHRcdC8qIDA0ICovJ2hhbmRvZmZzOicsXG5cdFx0XHQvKiAwNSAqLycgIC0gbGFiZWw6IFwiSW1wbGVtZW50XCInLFxuXHRcdFx0LyogMDYgKi8nICAgIGFnZW50OiBEZWZhdWx0Jyxcblx0XHRcdC8qIDA3ICovJyAgICBwcm9tcHQ6IFwiSW1wbGVtZW50IHRoZSBwbGFuXCInLFxuXHRcdFx0LyogMDggKi8nICAgIHNlbmQ6IGZhbHNlJyxcblx0XHRcdC8qIDA5ICovJyAgICBzaG93Q29udGludWVPbjogZmFsc2UnLFxuXHRcdFx0LyogMTAgKi8nICAtIGxhYmVsOiBcIlNhdmVcIicsXG5cdFx0XHQvKiAxMSAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMTIgKi8nICAgIHByb21wdDogXCJTYXZlIHRoZSBwbGFuXCInLFxuXHRcdFx0LyogMTMgKi8nICAgIHNlbmQ6IHRydWUnLFxuXHRcdFx0LyogMTQgKi8nICAgIHNob3dDb250aW51ZU9uOiB0cnVlJyxcblx0XHRcdC8qIDE1ICovJy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlci5oYW5kT2Zmcyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmhhbmRPZmZzLCBbXG5cdFx0XHR7IGxhYmVsOiAnSW1wbGVtZW50JywgYWdlbnQ6ICdEZWZhdWx0JywgcHJvbXB0OiAnSW1wbGVtZW50IHRoZSBwbGFuJywgc2VuZDogZmFsc2UsIHNob3dDb250aW51ZU9uOiBmYWxzZSB9LFxuXHRcdFx0eyBsYWJlbDogJ1NhdmUnLCBhZ2VudDogJ0RlZmF1bHQnLCBwcm9tcHQ6ICdTYXZlIHRoZSBwbGFuJywgc2VuZDogdHJ1ZSwgc2hvd0NvbnRpbnVlT246IHRydWUgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93Q29udGludWVPbiBkZWZhdWx0cyB0byB1bmRlZmluZWQgd2hlbiBub3Qgc3BlY2lmaWVkIHBlciBoYW5kb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkFnZW50IHRlc3RcImAsXG5cdFx0XHQvKiAwMyAqLydoYW5kb2ZmczonLFxuXHRcdFx0LyogMDQgKi8nICAtIGxhYmVsOiBcIlNhdmVcIicsXG5cdFx0XHQvKiAwNSAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMDYgKi8nICAgIHByb21wdDogXCJTYXZlIHRoZSBwbGFuXCInLFxuXHRcdFx0LyogMDcgKi8nLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyLmhhbmRPZmZzKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuaGFuZE9mZnNbMF0uc2hvd0NvbnRpbnVlT24sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRvZmYgd2l0aCB3aGl0ZXNwYWNlLW9ubHkgbGFiZWwgaXMgc2tpcHBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdC8qIDAxICovJy0tLScsXG5cdFx0XHQvKiAwMiAqL2BkZXNjcmlwdGlvbjogXCJBZ2VudCB0ZXN0XCJgLFxuXHRcdFx0LyogMDMgKi8naGFuZG9mZnM6Jyxcblx0XHRcdC8qIDA0ICovJyAgLSBsYWJlbDogXCIgICBcIicsXG5cdFx0XHQvKiAwNSAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMDYgKi8nICAgIHByb21wdDogXCJEbyBzb21ldGhpbmdcIicsXG5cdFx0XHQvKiAwNyAqLycgIC0gbGFiZWw6IFwiVmFsaWRcIicsXG5cdFx0XHQvKiAwOCAqLycgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0LyogMDkgKi8nICAgIHByb21wdDogXCJBbHNvIGRvIHNvbWV0aGluZ1wiJyxcblx0XHRcdC8qIDEwICovJy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmhlYWRlci5oYW5kT2ZmcywgW1xuXHRcdFx0eyBhZ2VudDogJ0RlZmF1bHQnLCBsYWJlbDogJ1ZhbGlkJywgcHJvbXB0OiAnQWxzbyBkbyBzb21ldGhpbmcnIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdHJ1Y3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdDEubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0LyogMDEgKi8nLS0tJyxcblx0XHRcdC8qIDAyICovYGRlc2NyaXB0aW9uOiBcIkNvZGUgc3R5bGUgaW5zdHJ1Y3Rpb25zIGZvciBUeXBlU2NyaXB0XCJgLFxuXHRcdFx0LyogMDMgKi8nYXBwbHlUbzogKi50cycsXG5cdFx0XHQvKiAwNCAqLyctLS0nLFxuXHRcdFx0LyogMDUgKi8nRm9sbG93IG15IGNvbXBhbmllcyBjb2RpbmcgZ3VpZGxpbmVzIGF0IFtteWNvbXAtdHMtZ3VpZGVsaW5lc10oaHR0cHM6Ly9teWNvbXAvZ3VpZGVsaW5lcyN0eXBlc2NyaXB0Lm1kKScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmF0dHJpYnV0ZXMsIFtcblx0XHRcdHsga2V5OiAnZGVzY3JpcHRpb24nLCByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDU0KSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnQ29kZSBzdHlsZSBpbnN0cnVjdGlvbnMgZm9yIFR5cGVTY3JpcHQnLCByYW5nZTogbmV3IFJhbmdlKDIsIDE0LCAyLCA1NCksIGZvcm1hdDogJ2RvdWJsZScgfSB9LFxuXHRcdFx0eyBrZXk6ICdhcHBseVRvJywgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCAzLCAxNCksIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJyoudHMnLCByYW5nZTogbmV3IFJhbmdlKDMsIDEwLCAzLCAxNCksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogNSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDYsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LmJvZHkub2Zmc2V0LCA3Nik7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdC5ib2R5LmdldENvbnRlbnQoKSwgJ0ZvbGxvdyBteSBjb21wYW5pZXMgY29kaW5nIGd1aWRsaW5lcyBhdCBbbXljb21wLXRzLWd1aWRlbGluZXNdKGh0dHBzOi8vbXljb21wL2d1aWRlbGluZXMjdHlwZXNjcmlwdC5tZCknKTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkuZmlsZVJlZmVyZW5jZXMsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg1LCA2NCwgNSwgMTAzKSwgY29udGVudDogJ2h0dHBzOi8vbXljb21wL2d1aWRlbGluZXMjdHlwZXNjcmlwdC5tZCcsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdDb2RlIHN0eWxlIGluc3RydWN0aW9ucyBmb3IgVHlwZVNjcmlwdCcpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hcHBseVRvLCAnKi50cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tcHQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQyLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdC8qIDAxICovJy0tLScsXG5cdFx0XHQvKiAwMiAqL2BkZXNjcmlwdGlvbjogXCJHZW5lcmFsIHB1cnBvc2UgY29kaW5nIGFzc2lzdGFudFwiYCxcblx0XHRcdC8qIDAzICovJ2FnZW50OiBhZ2VudCcsXG5cdFx0XHQvKiAwNCAqLydtb2RlbDogR1BUIDQuMScsXG5cdFx0XHQvKiAwNSAqL2B0b29sczogWydzZWFyY2gnLCAndGVybWluYWwnXWAsXG5cdFx0XHQvKiAwNiAqLyctLS0nLFxuXHRcdFx0LyogMDcgKi8nVGhpcyBpcyBhIHByb21wdCBmaWxlIGJvZHkgcmVmZXJlbmNpbmcgI3Rvb2w6c2VhcmNoIGFuZCBbZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzKS4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNiwgZW5kQ29sdW1uOiAxIH0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hdHRyaWJ1dGVzLCBbXG5cdFx0XHR7IGtleTogJ2Rlc2NyaXB0aW9uJywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA0OCksIHZhbHVlOiB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ0dlbmVyYWwgcHVycG9zZSBjb2RpbmcgYXNzaXN0YW50JywgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxNCwgMiwgNDgpLCBmb3JtYXQ6ICdkb3VibGUnIH0gfSxcblx0XHRcdHsga2V5OiAnYWdlbnQnLCByYW5nZTogbmV3IFJhbmdlKDMsIDEsIDMsIDEzKSwgdmFsdWU6IHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYWdlbnQnLCByYW5nZTogbmV3IFJhbmdlKDMsIDgsIDMsIDEzKSwgZm9ybWF0OiAnbm9uZScgfSB9LFxuXHRcdFx0eyBrZXk6ICdtb2RlbCcsIHJhbmdlOiBuZXcgUmFuZ2UoNCwgMSwgNCwgMTUpLCB2YWx1ZTogeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdHUFQgNC4xJywgcmFuZ2U6IG5ldyBSYW5nZSg0LCA4LCA0LCAxNSksIGZvcm1hdDogJ25vbmUnIH0gfSxcblx0XHRcdHtcblx0XHRcdFx0a2V5OiAndG9vbHMnLCByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDUsIDMwKSwgdmFsdWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdFx0XHRcdGl0ZW1zOiBbeyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdzZWFyY2gnLCByYW5nZTogbmV3IFJhbmdlKDUsIDksIDUsIDE3KSwgZm9ybWF0OiAnc2luZ2xlJyB9LCB7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3Rlcm1pbmFsJywgcmFuZ2U6IG5ldyBSYW5nZSg1LCAxOSwgNSwgMjkpLCBmb3JtYXQ6ICdzaW5nbGUnIH1dLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoNSwgOCwgNSwgMzApXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDcsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA4LCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdC5ib2R5Lm9mZnNldCwgMTE0KTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0LmJvZHkuZ2V0Q29udGVudCgpLCAnVGhpcyBpcyBhIHByb21wdCBmaWxlIGJvZHkgcmVmZXJlbmNpbmcgI3Rvb2w6c2VhcmNoIGFuZCBbZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzKS4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLCBbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNjQsIDcsIDg4KSwgY29udGVudDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZG9jcycsIGlzTWFya2Rvd25MaW5rOiB0cnVlIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMsIFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCA0NiwgNywgNTIpLCBuYW1lOiAnc2VhcmNoJywgb2Zmc2V0OiAxNTMsIGZ1bGxMZW5ndGg6IDEyIH1cblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdHZW5lcmFsIHB1cnBvc2UgY29kaW5nIGFzc2lzdGFudCcpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hZ2VudCwgJ2FnZW50Jyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLm1vZGVsLCBbJ0dQVCA0LjEnXSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIudG9vbHMpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci50b29scywgWydzZWFyY2gnLCAndGVybWluYWwnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbGlua3MgYW5kIHZhcmlhYmxlcyBpbnNpZGUgaW5saW5lIGNvZGUgYW5kIGZlbmNlZCBjb2RlIGJsb2NrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQzLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0YGRlc2NyaXB0aW9uOiBcIlByb21wdCB3aXRoIG1hcmtkb3duIGNvZGVcImAsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdPdXRzaWRlICN0b29sOm91dHNpZGUgYW5kIFtvdXRzaWRlXSguL291dHNpZGUubWQpLicsXG5cdFx0XHQnSW5saW5lIGNvZGU6IGAjdG9vbDppbmxpbmUgYW5kIFtpbmxpbmVdKC4vaW5saW5lLm1kKWAgc2hvdWxkIGJlIGlnbm9yZWQuJyxcblx0XHRcdCdgYGB0cycsXG5cdFx0XHQnI3Rvb2w6YmxvY2sgYW5kICNmaWxlOi4vaW5zaWRlLWJsb2NrLm1kIGFuZCBbYmxvY2tdKC4vYmxvY2subWQpJyxcblx0XHRcdCdgYGAnLFxuXHRcdFx0J0FmdGVyIGJsb2NrICNmaWxlOi4vYWZ0ZXIubWQgYW5kIFthZnRlcl0oLi9hZnRlci1saW5rLm1kKS4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyZWZlcmVuY2UgPT4gKHsgY29udGVudDogcmVmZXJlbmNlLmNvbnRlbnQsIGlzTWFya2Rvd25MaW5rOiByZWZlcmVuY2UuaXNNYXJrZG93bkxpbmsgfSkpLCBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL291dHNpZGUubWQnLCBpc01hcmtkb3duTGluazogdHJ1ZSB9LFxuXHRcdFx0eyBjb250ZW50OiAnLi9hZnRlci5tZCcsIGlzTWFya2Rvd25MaW5rOiBmYWxzZSB9LFxuXHRcdFx0eyBjb250ZW50OiAnLi9hZnRlci1saW5rLm1kJywgaXNNYXJrZG93bkxpbms6IHRydWUgfVxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyZWZlcmVuY2UgPT4gcmVmZXJlbmNlLm5hbWUpLCBbJ291dHNpZGUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgcmVmZXJlbmNlcyBpbiBtdWx0aXBsZSBpbmxpbmUgY29kZSBzcGFucyBvbiB0aGUgc2FtZSBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC1pbmxpbmUubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J0JlZm9yZSBgI3Rvb2w6aWdub3JlZDFgIG1pZGRsZSAjdG9vbDp2aXNpYmxlIGBbbGlua10oLi9pZ25vcmVkLm1kKWAgYWZ0ZXIgW3JlYWxdKC4vcmVhbC5tZCkuJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5maWxlUmVmZXJlbmNlcy5tYXAociA9PiAoeyBjb250ZW50OiByLmNvbnRlbnQsIGlzTWFya2Rvd25MaW5rOiByLmlzTWFya2Rvd25MaW5rIH0pKSwgW1xuXHRcdFx0eyBjb250ZW50OiAnLi9yZWFsLm1kJywgaXNNYXJrZG93bkxpbms6IHRydWUgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAociA9PiByLm5hbWUpLCBbJ3Zpc2libGUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgZmVuY2VkIGNvZGUgYmxvY2sgd2l0aG91dCBsYW5ndWFnZSBzcGVjaWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0LWZlbmNlLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcInRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdgYGAnLFxuXHRcdFx0JyNmaWxlOi4vaWdub3JlZC5tZCcsXG5cdFx0XHQnW2xpbmtdKC4vaWdub3JlZC1saW5rLm1kKScsXG5cdFx0XHQnYGBgJyxcblx0XHRcdCcjZmlsZTouL3Zpc2libGUubWQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+ICh7IGNvbnRlbnQ6IHIuY29udGVudCwgaXNNYXJrZG93bkxpbms6IHIuaXNNYXJrZG93bkxpbmsgfSkpLCBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL3Zpc2libGUubWQnLCBpc01hcmtkb3duTGluazogZmFsc2UgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG11bHRpcGxlIGZlbmNlZCBjb2RlIGJsb2NrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQtbXVsdGktZmVuY2UubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0JyN0b29sOmJlZm9yZScsXG5cdFx0XHQnYGBganMnLFxuXHRcdFx0JyN0b29sOmlnbm9yZWQxJyxcblx0XHRcdCdgYGAnLFxuXHRcdFx0JyN0b29sOmJldHdlZW4nLFxuXHRcdFx0J2BgYHB5dGhvbicsXG5cdFx0XHQnI3Rvb2w6aWdub3JlZDInLFxuXHRcdFx0J2BgYCcsXG5cdFx0XHQnI3Rvb2w6YWZ0ZXInLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAociA9PiByLm5hbWUpLCBbJ2JlZm9yZScsICdiZXR3ZWVuJywgJ2FmdGVyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmNsb3NlZCBmZW5jZWQgY29kZSBibG9jayBpZ25vcmVzIGFsbCByZW1haW5pbmcgbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcHJvbXB0LXVuY2xvc2VkLm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcInRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCcjdG9vbDp2aXNpYmxlJyxcblx0XHRcdCdgYGAnLFxuXHRcdFx0JyN0b29sOmlnbm9yZWQnLFxuXHRcdFx0JyNmaWxlOi4vaWdub3JlZC5tZCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLm1hcChyID0+IHIubmFtZSksIFsndmlzaWJsZSddKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkamFjZW50IGlubGluZSBjb2RlIGRvZXMgbm90IHN1cHByZXNzIG91dHNpZGUgcmVmZXJlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQtYWRqYWNlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwidGVzdFwiJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Bjb2RlYCN0b29sOmF0dGFjaGVkIGBtb3JlYFtsaW5rXSguL2ZpbGUubWQpJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0Ly8gI3Rvb2w6YXR0YWNoZWQgc3RhcnRzIHJpZ2h0IGFmdGVyIHRoZSBjbG9zaW5nIGJhY2t0aWNrLCBzbyBpdCdzIG91dHNpZGUgaW5saW5lIGNvZGVcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAociA9PiByLm5hbWUpLCBbJ2F0dGFjaGVkJ10pO1xuXHRcdC8vIFtsaW5rXSguL2ZpbGUubWQpIHN0YXJ0cyBhZnRlciB0aGUgc2Vjb25kIGlubGluZSBjb2RlIHNwYW5cblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+ICh7IGNvbnRlbnQ6IHIuY29udGVudCwgaXNNYXJrZG93bkxpbms6IHIuaXNNYXJrZG93bkxpbmsgfSkpLCBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL2ZpbGUubWQnLCBpc01hcmtkb3duTGluazogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRlbnRlZCBmZW5jZWQgY29kZSBibG9jayBpcyBzdGlsbCBkZXRlY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9wcm9tcHQtaW5kZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBcInRlc3RcIicsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCcgIGBgYHRzJyxcblx0XHRcdCcgICN0b29sOmlnbm9yZWQnLFxuXHRcdFx0JyAgYGBgJyxcblx0XHRcdCcjdG9vbDp2aXNpYmxlJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS52YXJpYWJsZVJlZmVyZW5jZXMubWFwKHIgPT4gci5uYW1lKSwgWyd2aXNpYmxlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmZW5jZWQgY29kZSBibG9jayB3aXRoIDQgYmFja3RpY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC00dGljay5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJ0ZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnYGBgYCcsXG5cdFx0XHQnI3Rvb2w6aWdub3JlZCBhbmQgW2xpbmtdKC4vaWdub3JlZC5tZCknLFxuXHRcdFx0J2BgYGAnLFxuXHRcdFx0JyN0b29sOnZpc2libGUnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAociA9PiByLm5hbWUpLCBbJ3Zpc2libGUnXSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuYm9keS5maWxlUmVmZXJlbmNlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmZW5jZWQgY29kZSBibG9jayB3aXRoIHRpbGRlIGZlbmNlICh+fn4pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Byb21wdC10aWxkZS5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJ0ZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnfn5+Jyxcblx0XHRcdCcjZmlsZTouL2lnbm9yZWQubWQgYW5kIFtsaW5rXSguL2lnbm9yZWQtbGluay5tZCknLFxuXHRcdFx0JyN0b29sOmlnbm9yZWQnLFxuXHRcdFx0J35+ficsXG5cdFx0XHQnW3JlYWxdKC4vcmVhbC5tZCknLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ib2R5KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5ib2R5LmZpbGVSZWZlcmVuY2VzLm1hcChyID0+ICh7IGNvbnRlbnQ6IHIuY29udGVudCwgaXNNYXJrZG93bkxpbms6IHIuaXNNYXJrZG93bkxpbmsgfSkpLCBbXG5cdFx0XHR7IGNvbnRlbnQ6ICcuL3JlYWwubWQnLCBpc01hcmtkb3duTGluazogdHJ1ZSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmJvZHkudmFyaWFibGVSZWZlcmVuY2VzLCBbXSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnYWdlbnQgd2l0aCBhZ2VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdGBkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRoIHJlc3RyaWN0aW9uc1wiYCxcblx0XHRcdCdhZ2VudHM6IFtcInN1YmFnZW50MVwiLCBcInN1YmFnZW50MlwiXScsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdUaGlzIGlzIGFuIGFnZW50IHdpdGggcmVzdHJpY3RlZCBzdWJhZ2VudHMuJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBjb250ZW50KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC51cmksIHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5oZWFkZXIpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYm9keSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnQWdlbnQgd2l0aCByZXN0cmljdGlvbnMnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYWdlbnRzLCBbJ3N1YmFnZW50MScsICdzdWJhZ2VudDInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHdpdGggZW1wdHkgYWdlbnRzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHRgZGVzY3JpcHRpb246IFwiQWdlbnQgd2l0aCBubyBhY2Nlc3NcImAsXG5cdFx0XHQnYWdlbnRzOiBbXScsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdUaGlzIGFnZW50IGhhcyBubyBhY2Nlc3MgdG8gc3ViYWdlbnRzLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuZGVzY3JpcHRpb24sICdBZ2VudCB3aXRoIG5vIGFjY2VzcycpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hZ2VudHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCB3aWxkY2FyZCBhZ2VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdGBkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRoIGZ1bGwgYWNjZXNzXCJgLFxuXHRcdFx0J2FnZW50czogW1wiKlwiXScsXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdUaGlzIGFnZW50IGhhcyBhY2Nlc3MgdG8gYWxsIHN1YmFnZW50cy4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnQWdlbnQgd2l0aCBmdWxsIGFjY2VzcycpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hZ2VudHMsIFsnKiddKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aG91dCBhZ2VudHMgKHVuZGVmaW5lZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdC5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdGBkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRob3V0IHJlc3RyaWN0aW9uc1wiYCxcblx0XHRcdCctLS0nLFxuXHRcdFx0J1RoaXMgYWdlbnQgaGFzIGRlZmF1bHQgYWNjZXNzIHRvIGFsbC4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LnVyaSwgdXJpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmhlYWRlcik7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmRlc2NyaXB0aW9uLCAnQWdlbnQgd2l0aG91dCByZXN0cmljdGlvbnMnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYWdlbnRzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VDb21tYVNlcGFyYXRlZExpc3QnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IElTY2FsYXJWYWx1ZVtdKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogaW5wdXQsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgaW5wdXQubGVuZ3RoICsgMSksIGZvcm1hdDogJ25vbmUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuaXRlbXMsIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaW1wbGUgdW5xdW90ZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdhLCBiLCBjJywgW1xuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2EnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2InLCByYW5nZTogbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2MnLCByYW5nZTogbmV3IFJhbmdlKDEsIDcsIDEsIDgpLCBmb3JtYXQ6ICdub25lJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VucXVvdGVkIHZhbHVlcyB3aXRob3V0IHNwYWNlcycsICgpID0+IHtcblx0XHRcdGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdCgnZm9vLGJhcixiYXonLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnZm9vJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgZm9ybWF0OiAnbm9uZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdiYXInLCByYW5nZTogbmV3IFJhbmdlKDEsIDUsIDEsIDgpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2JheicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgMTIpLCBmb3JtYXQ6ICdub25lJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZSBxdW90ZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdcImhlbGxvXCIsIFwid29ybGRcIicsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdoZWxsbycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIGZvcm1hdDogJ2RvdWJsZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICd3b3JsZCcsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSwgZm9ybWF0OiAnZG91YmxlJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZSBxdW90ZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KGAnb25lJywgJ3R3bydgLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnb25lJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgZm9ybWF0OiAnc2luZ2xlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3R3bycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgOCwgMSwgMTMpLCBmb3JtYXQ6ICdzaW5nbGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWl4ZWQgcXVvdGVkIGFuZCB1bnF1b3RlZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ3VucXVvdGVkLCBcImRvdWJsZVwiLCBcXCdzaW5nbGVcXCcnLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAndW5xdW90ZWQnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDkpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2RvdWJsZScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTEsIDEsIDE5KSwgZm9ybWF0OiAnZG91YmxlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ3NpbmdsZScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMjEsIDEsIDI5KSwgZm9ybWF0OiAnc2luZ2xlJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3F1b3RlZCB2YWx1ZXMgd2l0aCBjb21tYXMgaW5zaWRlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdcImEsYlwiLCBcImMsZFwiJywgW1xuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2EsYicsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIGZvcm1hdDogJ2RvdWJsZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdjLGQnLCByYW5nZTogbmV3IFJhbmdlKDEsIDgsIDEsIDEzKSwgZm9ybWF0OiAnZG91YmxlJyB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdCgnJywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCdzaW5nbGUnLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnc2luZ2xlJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA3KSwgZm9ybWF0OiAnbm9uZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWx1ZXMgd2l0aCBleHRyYSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KCcgIGEgICwgIGIgICwgIGMgICcsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAzLCAxLCA0KSwgZm9ybWF0OiAnbm9uZScgfSxcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdiJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCAxMCksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTUsIDEsIDE2KSwgZm9ybWF0OiAnbm9uZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdxdW90ZWQgdmFsdWUgd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21tYVNlcGFyYXRlZExpc3QoJ1wiaGVsbG8gd29ybGRcIiwgXCJmb28gYmFyXCInLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnaGVsbG8gd29ybGQnLCByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE0KSwgZm9ybWF0OiAnZG91YmxlJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2ZvbyBiYXInLCByYW5nZTogbmV3IFJhbmdlKDEsIDE2LCAxLCAyNSksIGZvcm1hdDogJ2RvdWJsZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIHBvc2l0aW9uIG9mZnNldCcsICgpID0+IHtcblx0XHRcdC8vIFNpbXVsYXRlIHBhcnNpbmcgYSBsaXN0IHRoYXQgc3RhcnRzIGF0IGxpbmUgNSwgY2hhcmFjdGVyIDEwXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2EsIGIsIGMnLCByYW5nZTogbmV3IFJhbmdlKDYsIDExLCA2LCAxOCksIGZvcm1hdDogJ25vbmUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaXRlbXMsIFtcblx0XHRcdFx0eyB0eXBlOiAnc2NhbGFyJywgdmFsdWU6ICdhJywgcmFuZ2U6IG5ldyBSYW5nZSg2LCAxMSwgNiwgMTIpLCBmb3JtYXQ6ICdub25lJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzY2FsYXInLCB2YWx1ZTogJ2InLCByYW5nZTogbmV3IFJhbmdlKDYsIDE0LCA2LCAxNSksIGZvcm1hdDogJ25vbmUnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYycsIHJhbmdlOiBuZXcgUmFuZ2UoNiwgMTcsIDYsIDE4KSwgZm9ybWF0OiAnbm9uZScgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnRpcmUgaW5wdXQgd3JhcHBlZCBpbiBkb3VibGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2hlbiB0aGUgZW50aXJlIGlucHV0IGlzIHdyYXBwZWQgaW4gcXVvdGVzLCBpdCBzaG91bGQgYmUgdHJlYXRlZCBhcyBhIHNpbmdsZSBxdW90ZWQgdmFsdWVcblx0XHRcdGFzc2VydENvbW1hU2VwYXJhdGVkTGlzdCgnXCJhLCBiLCBjXCInLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYSwgYiwgYycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTApLCBmb3JtYXQ6ICdkb3VibGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW50aXJlIGlucHV0IHdyYXBwZWQgaW4gc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdC8vIFdoZW4gdGhlIGVudGlyZSBpbnB1dCBpcyB3cmFwcGVkIGluIHNpbmdsZSBxdW90ZXMsIGl0IHNob3VsZCBiZSB0cmVhdGVkIGFzIGEgc2luZ2xlIHF1b3RlZCB2YWx1ZVxuXHRcdFx0YXNzZXJ0Q29tbWFTZXBhcmF0ZWRMaXN0KGAnYSwgYiwgYydgLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3NjYWxhcicsIHZhbHVlOiAnYSwgYiwgYycsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTApLCBmb3JtYXQ6ICdzaW5nbGUnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXJJbnZvY2FibGUgZ2V0dGVyIHJlYWRzIHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cblx0XHQvLyB1c2VyLWludm9jYWJsZSB3b3Jrc1xuXHRcdGNvbnN0IGNvbnRlbnQxID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHQnLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmhlYWRlcj8udXNlckludm9jYWJsZSwgdHJ1ZSk7XG5cblx0XHQvLyB1c2VyLWludm9jYWJsZSBmYWxzZVxuXHRcdGNvbnN0IGNvbnRlbnQyID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0Jy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQyID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5oZWFkZXI/LnVzZXJJbnZvY2FibGUsIGZhbHNlKTtcblxuXHRcdC8vIG5laXRoZXIgc2V0IHJldHVybnMgdW5kZWZpbmVkXG5cdFx0Y29uc3QgY29udGVudDQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0Jy0tLScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQ0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0NC5oZWFkZXI/LnVzZXJJbnZvY2FibGUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50IHdpdGggYWxsIGhlYWRlciBmaWVsZHMgaW5jbHVkaW5nIGNvbG9ucyBpbiBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCctLS0nLFxuXHRcdFx0J25hbWU6IEV4cGxvcmUnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uOiBGYXN0IHJlYWQtb25seSBjb2RlYmFzZSBleHBsb3JhdGlvbiBhbmQgUSZBIHN1YmFnZW50LiBQcmVmZXIgb3ZlciBtYW51YWxseSBjaGFpbmluZyBtdWx0aXBsZSBzZWFyY2ggYW5kIGZpbGUtcmVhZGluZyBvcGVyYXRpb25zIHRvIGF2b2lkIGNsdXR0ZXJpbmcgdGhlIG1haW4gY29udmVyc2F0aW9uLiBTYWZlIHRvIGNhbGwgaW4gcGFyYWxsZWwuIFNwZWNpZnkgdGhvcm91Z2huZXNzOiBxdWljaywgbWVkaXVtLCBvciB0aG9yb3VnaC4nLFxuXHRcdFx0YGFyZ3VtZW50LWhpbnQ6IERlc2NyaWJlIFdIQVQgeW91J3JlIGxvb2tpbmcgZm9yIGFuZCBkZXNpcmVkIHRob3JvdWdobmVzcyAocXVpY2svbWVkaXVtL3Rob3JvdWdoKWAsXG5cdFx0XHRgbW9kZWw6IFsnQ2xhdWRlIEhhaWt1IDQuNSAoY29waWxvdCknLCAnR2VtaW5pIDMgRmxhc2ggKFByZXZpZXcpIChjb3BpbG90KScsICdBdXRvIChjb3BpbG90KSddYCxcblx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdGB0b29sczogWydzZWFyY2gnLCAncmVhZCcsICd3ZWInLCAndnNjb2RlL21lbW9yeScsICdnaXRodWIvaXNzdWVfcmVhZCcsICdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvaXNzdWVfZmV0Y2gnLCAnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL2FjdGl2ZVB1bGxSZXF1ZXN0JywgJ2V4ZWN1dGUvZ2V0VGVybWluYWxPdXRwdXQnLCAnZXhlY3V0ZS90ZXN0RmFpbHVyZSddYCxcblx0XHRcdCdhZ2VudHM6IFtdJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J1lvdSBhcmUgYW4gZXhwbG9yYXRpb24gYWdlbnQgc3BlY2lhbGl6ZWQgaW4gcmFwaWQgY29kZWJhc2UgYW5hbHlzaXMgYW5kIGFuc3dlcmluZyBxdWVzdGlvbnMgZWZmaWNpZW50bHkuJyxcblx0XHRcdCcnLFxuXHRcdFx0JyMjIFNlYXJjaCBTdHJhdGVneScsXG5cdFx0XHQnJyxcblx0XHRcdCctIEdvICoqYnJvYWQgdG8gbmFycm93Kio6Jyxcblx0XHRcdCdcXHQxLiBTdGFydCB3aXRoIGdsb2IgcGF0dGVybnMgb3Igc2VtYW50aWMgY29kZXNlYXJjaCB0byBkaXNjb3ZlciByZWxldmFudCBhcmVhcycsXG5cdFx0XHQnXFx0Mi4gTmFycm93IHdpdGggdGV4dCBzZWFyY2ggKHJlZ2V4KSBvciB1c2FnZXMgKExTUCkgZm9yIHNwZWNpZmljIHN5bWJvbHMgb3IgcGF0dGVybnMnLFxuXHRcdFx0J1xcdDMuIFJlYWQgZmlsZXMgb25seSB3aGVuIHlvdSBrbm93IHRoZSBwYXRoIG9yIG5lZWQgZnVsbCBjb250ZXh0Jyxcblx0XHRcdCctIFBheSBhdHRlbnRpb24gdG8gcHJvdmlkZWQgYWdlbnQgaW5zdHJ1Y3Rpb25zL3J1bGVzL3NraWxscyBhcyB0aGV5IGFwcGx5IHRvIGFyZWFzIG9mIHRoZSBjb2RlYmFzZSB0byBiZXR0ZXIgdW5kZXJzdGFuZCBhcmNoaXRlY3R1cmUgYW5kIGJlc3QgcHJhY3RpY2VzLicsXG5cdFx0XHQnLSBVc2UgdGhlIGdpdGh1YiByZXBvIHRvb2wgdG8gc2VhcmNoIHJlZmVyZW5jZXMgaW4gZXh0ZXJuYWwgZGVwZW5kZW5jaWVzLicsXG5cdFx0XHQnJyxcblx0XHRcdCcjIyBTcGVlZCBQcmluY2lwbGVzJyxcblx0XHRcdCcnLFxuXHRcdFx0J0FkYXB0IHNlYXJjaCBzdHJhdGVneSBiYXNlZCBvbiB0aGUgcmVxdWVzdGVkIHRob3JvdWdobmVzcyBsZXZlbC4nLFxuXHRcdFx0JycsXG5cdFx0XHQnKipCaWFzIGZvciBzcGVlZCoqIFx1MjAxNCByZXR1cm4gZmluZGluZ3MgYXMgcXVpY2tseSBhcyBwb3NzaWJsZTonLFxuXHRcdFx0Jy0gUGFyYWxsZWxpemUgaW5kZXBlbmRlbnQgdG9vbCBjYWxscyAobXVsdGlwbGUgZ3JlcHMsIG11bHRpcGxlIHJlYWRzKScsXG5cdFx0XHQnLSBTdG9wIHNlYXJjaGluZyBvbmNlIHlvdSBoYXZlIHN1ZmZpY2llbnQgY29udGV4dCcsXG5cdFx0XHQnLSBNYWtlIHRhcmdldGVkIHNlYXJjaGVzLCBub3QgZXhoYXVzdGl2ZSBzd2VlcHMnLFxuXHRcdFx0JycsXG5cdFx0XHQnIyMgT3V0cHV0Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1JlcG9ydCBmaW5kaW5ncyBkaXJlY3RseSBhcyBhIG1lc3NhZ2UuIEluY2x1ZGU6Jyxcblx0XHRcdCctIEZpbGVzIHdpdGggYWJzb2x1dGUgbGlua3MnLFxuXHRcdFx0Jy0gU3BlY2lmaWMgZnVuY3Rpb25zLCB0eXBlcywgb3IgcGF0dGVybnMgdGhhdCBjYW4gYmUgcmV1c2VkJyxcblx0XHRcdCctIEFuYWxvZ291cyBleGlzdGluZyBmZWF0dXJlcyB0aGF0IHNlcnZlIGFzIGltcGxlbWVudGF0aW9uIHRlbXBsYXRlcycsXG5cdFx0XHQnLSBDbGVhciBhbnN3ZXJzIHRvIHdoYXQgd2FzIGFza2VkLCBub3QgY29tcHJlaGVuc2l2ZSBvdmVydmlld3MnLFxuXHRcdFx0JycsXG5cdFx0XHQnUmVtZW1iZXI6IFlvdXIgZ29hbCBpcyBzZWFyY2hpbmcgZWZmaWNpZW50bHkgdGhyb3VnaCBNQVhJTVVNIFBBUkFMTEVMSVNNIHRvIHJlcG9ydCBjb25jaXNlIGFuZCBjbGVhciBhbnN3ZXJzLicsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29udGVudCk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQudXJpLCB1cmkpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJvZHkpO1xuXG5cdFx0Ly8gVmVyaWZ5IGFsbCBoZWFkZXIgYXR0cmlidXRlcyBhcmUgaWRlbnRpZmllZFxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5uYW1lLCAnRXhwbG9yZScpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ0Zhc3QgcmVhZC1vbmx5IGNvZGViYXNlIGV4cGxvcmF0aW9uIGFuZCBRJkEgc3ViYWdlbnQuIFByZWZlciBvdmVyIG1hbnVhbGx5IGNoYWluaW5nIG11bHRpcGxlIHNlYXJjaCBhbmQgZmlsZS1yZWFkaW5nIG9wZXJhdGlvbnMgdG8gYXZvaWQgY2x1dHRlcmluZyB0aGUgbWFpbiBjb252ZXJzYXRpb24uIFNhZmUgdG8gY2FsbCBpbiBwYXJhbGxlbC4gU3BlY2lmeSB0aG9yb3VnaG5lc3M6IHF1aWNrLCBtZWRpdW0sIG9yIHRob3JvdWdoLicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5hcmd1bWVudEhpbnQsIGBEZXNjcmliZSBXSEFUIHlvdSdyZSBsb29raW5nIGZvciBhbmQgZGVzaXJlZCB0aG9yb3VnaG5lc3MgKHF1aWNrL21lZGl1bS90aG9yb3VnaClgKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIubW9kZWwsIFsnQ2xhdWRlIEhhaWt1IDQuNSAoY29waWxvdCknLCAnR2VtaW5pIDMgRmxhc2ggKFByZXZpZXcpIChjb3BpbG90KScsICdBdXRvIChjb3BpbG90KSddKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIudGFyZ2V0LCAndnNjb2RlJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLnVzZXJJbnZvY2FibGUsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIudG9vbHMsIFsnc2VhcmNoJywgJ3JlYWQnLCAnd2ViJywgJ3ZzY29kZS9tZW1vcnknLCAnZ2l0aHViL2lzc3VlX3JlYWQnLCAnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL2lzc3VlX2ZldGNoJywgJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1Yi9hY3RpdmVQdWxsUmVxdWVzdCcsICdleGVjdXRlL2dldFRlcm1pbmFsT3V0cHV0JywgJ2V4ZWN1dGUvdGVzdEZhaWx1cmUnXSk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmFnZW50cywgW10pO1xuXG5cdFx0Ly8gVmVyaWZ5IGFsbCA4IGhlYWRlciBhdHRyaWJ1dGVzIGFyZSBwcmVzZW50XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuaGVhZGVyLmF0dHJpYnV0ZXMubGVuZ3RoLCA4KTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIuYXR0cmlidXRlcy5tYXAoYSA9PiBhLmtleSksIFtcblx0XHRcdCduYW1lJywgJ2Rlc2NyaXB0aW9uJywgJ2FyZ3VtZW50LWhpbnQnLCAnbW9kZWwnLCAndGFyZ2V0JywgJ3VzZXItaW52b2NhYmxlJywgJ3Rvb2xzJywgJ2FnZW50cydcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQgd2l0aCB1bnF1b3RlZCBkZXNjcmlwdGlvbiBjb250YWluaW5nIGNvbG9uLXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3Rlc3QuYWdlbnQubWQnKTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnbmFtZTogVGVzdCcsXG5cdFx0XHQnZGVzY3JpcHRpb246IFRoaXMgaGFzIGEgY29sb246IGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdCctLS0nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaGVhZGVyKTtcblxuXHRcdC8vIFRoZSBkZXNjcmlwdGlvbiBjb250YWlucyBcIjogXCIgd2hpY2ggY291bGQgaW50ZXJmZXJlIHdpdGggWUFNTCBwYXJzaW5nLlxuXHRcdC8vIEFsbCBoZWFkZXJzIGFmdGVyIGl0IHNob3VsZCBzdGlsbCBiZSBpZGVudGlmaWVkLlxuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5uYW1lLCAnVGVzdCcpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LmhlYWRlci5kZXNjcmlwdGlvbiwgJ1RoaXMgaGFzIGEgY29sb246IGluIHRoZSBtaWRkbGUnKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdC5oZWFkZXIudGFyZ2V0LCAndnNjb2RlJyk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQXVCLHlCQUF5Qix3QkFBd0I7QUFFeEUsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQiwwQ0FBd0M7QUFFeEMsT0FBSyxTQUFTLFlBQVk7QUFDekIsVUFBTSxNQUFNLElBQUksTUFBTSw0QkFBNEI7QUFDbEQsVUFBTSxVQUFVO0FBQUE7QUFBQSxNQUNQO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUEsSUFDVCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sU0FBUyxJQUFJLGlCQUFpQixFQUFFLE1BQU0sS0FBSyxPQUFPO0FBQ3hELFdBQU8sVUFBVSxPQUFPLEtBQUssR0FBRztBQUNoQyxXQUFPLEdBQUcsT0FBTyxNQUFNO0FBQ3ZCLFdBQU8sR0FBRyxPQUFPLElBQUk7QUFDckIsV0FBTyxVQUFVLE9BQU8sT0FBTyxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsYUFBYSxHQUFHLGVBQWUsR0FBRyxXQUFXLEVBQUUsQ0FBQztBQUM1RyxXQUFPLFVBQVUsT0FBTyxPQUFPLFlBQVk7QUFBQSxNQUMxQyxFQUFFLEtBQUssZUFBZSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsT0FBTyxFQUFFLE1BQU0sVUFBVSxPQUFPLGNBQWMsT0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLFFBQVEsU0FBUyxFQUFFO0FBQUEsTUFDdEosRUFBRSxLQUFLLFNBQVMsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLE9BQU8sRUFBRSxNQUFNLFVBQVUs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QUFHLFFBQVEsT0FBTyxHQUFHLE9BQU8sRUFBRSxNQUFNLFVBQVUsT0FBTyxXQUFXLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxRQUFRLE9BQU8sRUFBRTtBQUFBLGdCQUN0TCxFQUFFLEtBQUssRUFBRSxNQUFNLFVBQVUsT0FBTyxVQUFVLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUUsR0FBRyxRQUFRLE9BQU8sR0FBRyxPQUFPLEVBQUUsTUFBTSxVQUFVLE9BQU8sc0JBQXNCLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxRQUFRLFNBQVMsRUFBRTtBQUFBLGdCQUNwTSxFQUFFLEtBQUssRUFBRSxNQUFNLFVBQVUsT0FBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxRQUFRLE9BQU8sR0FBRyxPQUFPLEVBQUUsTUFBTSxVQUFVLE9BQU8sU0FBUyxPQUFPLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsUUFBUSxPQUFPLEVBQUU7QUFBQSxjQUNuTDtBQUFBLFlBQ0Q7QUFBQSxZQUNBO0FBQUEsY0FDQyxNQUFNO0FBQUEsY0FBTyxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxFQUFFO0FBQUEsY0FDMUMsWUFBWTtBQUFBLGdCQUNYLEVBQUUsS0FBSyxFQUFFLE1BQU0sVUFBVSxPQUFPLFNBQVMsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLFFBQVEsT0FBTyxHQUFHLE9BQU8sRUFBRSxNQUFNLFVBQVUsT0FBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxRQUFRLFNBQVMsRUFBRTtBQUFBLGdCQUNyTCxFQUFFLEtBQUssRUFBRSxNQUFNLFVBQVUsT0FBTyxTQUFTLE9BQU8sSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLEVBQUUsR0FBRyxRQUFRLE9BQU8sR0FBRyxPQUFPLEVBQUUsTUFBTSxVQUFVLE9BQU8s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
