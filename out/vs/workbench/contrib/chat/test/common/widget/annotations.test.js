import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { annotateSpecialMarkdownContent, extractCodeblockUrisFromText, extractSubAgentInvocationIdFromText, extractVulnerabilitiesFromText, hasEditCodeblockUriTag, isInsideCodeContext } from "../../../common/widget/annotations.js";
function content(str) {
  return { kind: "markdownContent", content: new MarkdownString(str) };
}
suite("Annotations", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("voice progress is not renderable", () => {
    assert.deepStrictEqual(
      annotateSpecialMarkdownContent([
        { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." },
        content("Visible response")
      ]),
      [content("Visible response")]
    );
  });
  suite("extractVulnerabilitiesFromText", () => {
    test("single line", async () => {
      const before = "some code ";
      const vulnContent = "content with vuln";
      const after = " after";
      const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }, content(after)]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
    test("multiline", async () => {
      const before = "some code\nover\nmultiple lines ";
      const vulnContent = "content with vuln\nand\nnewlines";
      const after = "more code\nwith newline";
      const annotatedResult = annotateSpecialMarkdownContent([content(before), { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }, content(after)]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
    test("multiple vulns", async () => {
      const before = "some code\nover\nmultiple lines ";
      const vulnContent = "content with vuln\nand\nnewlines";
      const after = "more code\nwith newline";
      const annotatedResult = annotateSpecialMarkdownContent([
        content(before),
        { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] },
        content(after),
        { kind: "markdownVuln", content: new MarkdownString(vulnContent), vulnerabilities: [{ title: "title", description: "vuln" }] }
      ]);
      await assertSnapshot(annotatedResult);
      const markdown = annotatedResult[0];
      const result = extractVulnerabilitiesFromText(markdown.content.value);
      await assertSnapshot(result);
    });
  });
  suite("extractSubAgentInvocationIdFromText", () => {
    test("extracts subAgentInvocationId from codeblock uri tag", () => {
      const subAgentId = "test-agent-123";
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, subAgentId);
    });
    test("returns undefined when no subAgentInvocationId", () => {
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for text without codeblock uri tag", () => {
      const result = extractSubAgentInvocationIdFromText("some random text");
      assert.strictEqual(result, void 0);
    });
    test("handles special characters in subAgentInvocationId via URL encoding", () => {
      const subAgentId = "agent-with-special&chars=value";
      const uri = URI.parse("file:///test.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractSubAgentInvocationIdFromText(markdown.content.value);
      assert.strictEqual(result, subAgentId);
    });
    test("handles malformed URL encoding gracefully", () => {
      const malformedTag = '<vscode_codeblock_uri isEdit subAgentInvocationId="%ZZ">file:///test.ts</vscode_codeblock_uri>';
      const result = extractSubAgentInvocationIdFromText(malformedTag);
      assert.strictEqual(result, "%ZZ");
    });
  });
  suite("extractCodeblockUrisFromText with subAgentInvocationId", () => {
    test("extracts subAgentInvocationId from codeblock uri", () => {
      const subAgentId = "test-subagent-456";
      const uri = URI.parse("file:///example.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const result = extractCodeblockUrisFromText(markdown.content.value);
      assert.ok(result);
      assert.strictEqual(result.subAgentInvocationId, subAgentId);
      assert.strictEqual(result.uri.toString(), uri.toString());
      assert.strictEqual(result.isEdit, true);
    });
    test("returns undefined for invalid URI content inside codeblock uri tag", () => {
      const invalidTag = "<vscode_codeblock_uri>```typescript\nconst uri: string\n```</vscode_codeblock_uri>";
      const result = extractCodeblockUrisFromText(invalidTag);
      assert.strictEqual(result, void 0);
    });
    test("round-trip encoding/decoding with special characters", () => {
      const subAgentId = "agent/with spaces&special=chars?more";
      const uri = URI.parse("file:///path/to/file.ts");
      const codeblockUriPart = {
        kind: "codeblockUri",
        uri,
        isEdit: true,
        subAgentInvocationId: subAgentId
      };
      const annotated = annotateSpecialMarkdownContent([content("code"), codeblockUriPart]);
      const markdown = annotated[0];
      const extracted = extractCodeblockUrisFromText(markdown.content.value);
      assert.ok(extracted);
      assert.strictEqual(extracted.subAgentInvocationId, subAgentId);
    });
  });
  suite("isInsideCodeContext", () => {
    test("not inside code for plain text", () => {
      assert.strictEqual(isInsideCodeContext("hello world"), false);
    });
    test("not inside code after closed inline code", () => {
      assert.strictEqual(isInsideCodeContext("run `code` and"), false);
    });
    test("inside unclosed single backtick", () => {
      assert.strictEqual(isInsideCodeContext("run `npx tsx "), true);
    });
    test("inside unclosed double backtick", () => {
      assert.strictEqual(isInsideCodeContext("run ``npx tsx "), true);
    });
    test("not inside code after closed double backtick", () => {
      assert.strictEqual(isInsideCodeContext("run ``code`` and"), false);
    });
    test("inside fenced code block", () => {
      assert.strictEqual(isInsideCodeContext("text\n```bash\nnpx tsx "), true);
    });
    test("not inside closed fenced code block", () => {
      assert.strictEqual(isInsideCodeContext("text\n```bash\ncode\n```\nafter"), false);
    });
    test("inside fenced code block with tildes", () => {
      assert.strictEqual(isInsideCodeContext("text\n~~~\ncode"), true);
    });
    test("empty string", () => {
      assert.strictEqual(isInsideCodeContext(""), false);
    });
  });
  suite("annotateSpecialMarkdownContent - inline references in code blocks", () => {
    test("inline reference inside backtick code span uses plain text", () => {
      const result = annotateSpecialMarkdownContent([
        content("Run `npx tsx "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        content(" eval "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///primer.eval.json"), name: "primer.eval.json" },
        content(" --repo .`")
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.strictEqual(md.content.value, "Run `npx tsx index.ts eval primer.eval.json --repo .`");
      assert.strictEqual(md.inlineReferences, void 0);
    });
    test("inline reference outside code span uses content ref link", () => {
      const result = annotateSpecialMarkdownContent([
        content("See "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        content(" for details")
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(md.content.value.includes("[index.ts]"));
      assert.ok(md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.inlineReferences);
    });
    test("inline reference inside fenced code block uses plain text", () => {
      const result = annotateSpecialMarkdownContent([
        content("Example:\n```bash\nnpx tsx "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" }
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(!md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.content.value.endsWith("index.ts"));
    });
    test("inline reference at start of block merges with following markdown", () => {
      const result = annotateSpecialMarkdownContent([
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        { kind: "markdownContent", content: new MarkdownString(" is the entry point", { isTrusted: true, supportThemeIcons: true }) }
      ]);
      assert.strictEqual(result.length, 1);
      const md = result[0];
      assert.ok(md.content.value.includes("[index.ts]"));
      assert.ok(md.content.value.includes("_vscodecontentref_"));
      assert.ok(md.content.value.endsWith(" is the entry point"));
      assert.ok(md.inlineReferences);
      assert.strictEqual(md.content.isTrusted, true);
      assert.strictEqual(md.content.supportThemeIcons, true);
    });
    test("inline reference after regular text does not force-merge incompatible markdown", () => {
      const result = annotateSpecialMarkdownContent([
        content("See "),
        { kind: "inlineReference", inlineReference: URI.parse("file:///index.ts"), name: "index.ts" },
        { kind: "markdownContent", content: new MarkdownString(" more info", { isTrusted: true, supportThemeIcons: true }) }
      ]);
      assert.strictEqual(result.length, 2);
      const first = result[0];
      assert.ok(first.content.value.startsWith("See "));
      assert.ok(first.inlineReferences);
      const second = result[1];
      assert.strictEqual(second.content.value, " more info");
      assert.strictEqual(second.content.isTrusted, true);
    });
  });
  suite("hasEditCodeblockUriTag", () => {
    test("returns true for edit codeblock URI tags", () => {
      const editTag = "<vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(editTag), true);
    });
    test("returns false for non-edit codeblock URI tags", () => {
      const nonEditTag = "<vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(nonEditTag), false);
    });
    test("returns true for edit codeblock URI tags with subAgentInvocationId", () => {
      const editTagWithSubAgent = '<vscode_codeblock_uri isEdit subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
      assert.strictEqual(hasEditCodeblockUriTag(editTagWithSubAgent), true);
    });
    test("returns false for non-edit codeblock URI tags with subAgentInvocationId", () => {
      const nonEditTagWithSubAgent = '<vscode_codeblock_uri subAgentInvocationId="agent-123">file:///test.ts</vscode_codeblock_uri>';
      assert.strictEqual(hasEditCodeblockUriTag(nonEditTagWithSubAgent), false);
    });
    test("returns false for text without codeblock URI tags", () => {
      assert.strictEqual(hasEditCodeblockUriTag("some plain text"), false);
    });
    test("returns false for text with only partial tag prefix", () => {
      assert.strictEqual(hasEditCodeblockUriTag("<vscode_codebloc"), false);
    });
    test("returns true for text containing multiple edit codeblock URI tags", () => {
      const multipleEditTags = "some text <vscode_codeblock_uri isEdit>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri isEdit>file:///other.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(multipleEditTags), true);
    });
    test("returns false for text containing only non-edit codeblock URI tags", () => {
      const multipleNonEditTags = "some text <vscode_codeblock_uri>file:///test.ts</vscode_codeblock_uri> more <vscode_codeblock_uri>file:///other.ts</vscode_codeblock_uri>";
      assert.strictEqual(hasEditCodeblockUriTag(multipleNonEditTags), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vd2lkZ2V0L2Fubm90YXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQ29udGVudCwgSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50LCBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0LCBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dCwgZXh0cmFjdFZ1bG5lcmFiaWxpdGllc0Zyb21UZXh0LCBoYXNFZGl0Q29kZWJsb2NrVXJpVGFnLCBpc0luc2lkZUNvZGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dpZGdldC9hbm5vdGF0aW9ucy5qcyc7XG5cbmZ1bmN0aW9uIGNvbnRlbnQoc3RyOiBzdHJpbmcpOiBJQ2hhdE1hcmtkb3duQ29udGVudCB7XG5cdHJldHVybiB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoc3RyKSB9O1xufVxuXG5zdWl0ZSgnQW5ub3RhdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZvaWNlIHByb2dyZXNzIGlzIG5vdCByZW5kZXJhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW1xuXHRcdFx0XHR7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdpbnZlc3RpZ2F0aW5nJywgdmFsdWU6ICdJbnZlc3RpZ2F0aW5nIHRoZSByZWxldmFudCBjb2RlLicgfSxcblx0XHRcdFx0Y29udGVudCgnVmlzaWJsZSByZXNwb25zZScpLFxuXHRcdFx0XSksXG5cdFx0XHRbY29udGVudCgnVmlzaWJsZSByZXNwb25zZScpXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0VnVsbmVyYWJpbGl0aWVzRnJvbVRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2luZ2xlIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSAnc29tZSBjb2RlICc7XG5cdFx0XHRjb25zdCB2dWxuQ29udGVudCA9ICdjb250ZW50IHdpdGggdnVsbic7XG5cdFx0XHRjb25zdCBhZnRlciA9ICcgYWZ0ZXInO1xuXHRcdFx0Y29uc3QgYW5ub3RhdGVkUmVzdWx0ID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtjb250ZW50KGJlZm9yZSksIHsga2luZDogJ21hcmtkb3duVnVsbicsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyh2dWxuQ29udGVudCksIHZ1bG5lcmFiaWxpdGllczogW3sgdGl0bGU6ICd0aXRsZScsIGRlc2NyaXB0aW9uOiAndnVsbicgfV0gfSwgY29udGVudChhZnRlcildKTtcblx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFubm90YXRlZFJlc3VsdCk7XG5cblx0XHRcdGNvbnN0IG1hcmtkb3duID0gYW5ub3RhdGVkUmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFZ1bG5lcmFiaWxpdGllc0Zyb21UZXh0KG1hcmtkb3duLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdzb21lIGNvZGVcXG5vdmVyXFxubXVsdGlwbGUgbGluZXMgJztcblx0XHRcdGNvbnN0IHZ1bG5Db250ZW50ID0gJ2NvbnRlbnQgd2l0aCB2dWxuXFxuYW5kXFxubmV3bGluZXMnO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnbW9yZSBjb2RlXFxud2l0aCBuZXdsaW5lJztcblx0XHRcdGNvbnN0IGFubm90YXRlZFJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbY29udGVudChiZWZvcmUpLCB7IGtpbmQ6ICdtYXJrZG93blZ1bG4nLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcodnVsbkNvbnRlbnQpLCB2dWxuZXJhYmlsaXRpZXM6IFt7IHRpdGxlOiAndGl0bGUnLCBkZXNjcmlwdGlvbjogJ3Z1bG4nIH1dIH0sIGNvbnRlbnQoYWZ0ZXIpXSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhbm5vdGF0ZWRSZXN1bHQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGFubm90YXRlZFJlc3VsdFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSB2dWxucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9ICdzb21lIGNvZGVcXG5vdmVyXFxubXVsdGlwbGUgbGluZXMgJztcblx0XHRcdGNvbnN0IHZ1bG5Db250ZW50ID0gJ2NvbnRlbnQgd2l0aCB2dWxuXFxuYW5kXFxubmV3bGluZXMnO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSAnbW9yZSBjb2RlXFxud2l0aCBuZXdsaW5lJztcblx0XHRcdGNvbnN0IGFubm90YXRlZFJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbXG5cdFx0XHRcdGNvbnRlbnQoYmVmb3JlKSxcblx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25WdWxuJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHZ1bG5Db250ZW50KSwgdnVsbmVyYWJpbGl0aWVzOiBbeyB0aXRsZTogJ3RpdGxlJywgZGVzY3JpcHRpb246ICd2dWxuJyB9XSB9LFxuXHRcdFx0XHRjb250ZW50KGFmdGVyKSxcblx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25WdWxuJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHZ1bG5Db250ZW50KSwgdnVsbmVyYWJpbGl0aWVzOiBbeyB0aXRsZTogJ3RpdGxlJywgZGVzY3JpcHRpb246ICd2dWxuJyB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhbm5vdGF0ZWRSZXN1bHQpO1xuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGFubm90YXRlZFJlc3VsdFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RWdWxuZXJhYmlsaXRpZXNGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dCcsICgpID0+IHtcblx0XHR0ZXN0KCdleHRyYWN0cyBzdWJBZ2VudEludm9jYXRpb25JZCBmcm9tIGNvZGVibG9jayB1cmkgdGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViQWdlbnRJZCA9ICd0ZXN0LWFnZW50LTEyMyc7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50cycpO1xuXHRcdFx0Y29uc3QgY29kZWJsb2NrVXJpUGFydDogSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoJ2NvZGUnKSwgY29kZWJsb2NrVXJpUGFydF0pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KG1hcmtkb3duLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgc3ViQWdlbnRJZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHN1YkFnZW50SW52b2NhdGlvbklkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHMnKTtcblx0XHRcdGNvbnN0IGNvZGVibG9ja1VyaVBhcnQ6IElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0ID0ge1xuXHRcdFx0XHRraW5kOiAnY29kZWJsb2NrVXJpJyxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRpc0VkaXQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoJ2NvZGUnKSwgY29kZWJsb2NrVXJpUGFydF0pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KG1hcmtkb3duLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB0ZXh0IHdpdGhvdXQgY29kZWJsb2NrIHVyaSB0YWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dCgnc29tZSByYW5kb20gdGV4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHN1YkFnZW50SW52b2NhdGlvbklkIHZpYSBVUkwgZW5jb2RpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJBZ2VudElkID0gJ2FnZW50LXdpdGgtc3BlY2lhbCZjaGFycz12YWx1ZSc7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50cycpO1xuXHRcdFx0Y29uc3QgY29kZWJsb2NrVXJpUGFydDogSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgPSB7XG5cdFx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGlzRWRpdDogdHJ1ZSxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN1YkFnZW50SWRcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbm5vdGF0ZWQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW2NvbnRlbnQoJ2NvZGUnKSwgY29kZWJsb2NrVXJpUGFydF0pO1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBhbm5vdGF0ZWRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KG1hcmtkb3duLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgc3ViQWdlbnRJZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG1hbGZvcm1lZCBVUkwgZW5jb2RpbmcgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRcdC8vIE1hbnVhbGx5IGNvbnN0cnVjdCBhIG1hbGZvcm1lZCB0YWcgd2l0aCBpbnZhbGlkIFVSTCBlbmNvZGluZ1xuXHRcdFx0Y29uc3QgbWFsZm9ybWVkVGFnID0gJzx2c2NvZGVfY29kZWJsb2NrX3VyaSBpc0VkaXQgc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCIlWlpcIj5maWxlOi8vL3Rlc3QudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChtYWxmb3JtZWRUYWcpO1xuXHRcdFx0Ly8gU2hvdWxkIHJldHVybiB0aGUgcmF3IHZhbHVlIHdoZW4gZGVjb2RpbmcgZmFpbHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICclWlonKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3RDb2RlYmxvY2tVcmlzRnJvbVRleHQgd2l0aCBzdWJBZ2VudEludm9jYXRpb25JZCcsICgpID0+IHtcblx0XHR0ZXN0KCdleHRyYWN0cyBzdWJBZ2VudEludm9jYXRpb25JZCBmcm9tIGNvZGVibG9jayB1cmknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJBZ2VudElkID0gJ3Rlc3Qtc3ViYWdlbnQtNDU2Jztcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9leGFtcGxlLnRzJyk7XG5cdFx0XHRjb25zdCBjb2RlYmxvY2tVcmlQYXJ0OiBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCA9IHtcblx0XHRcdFx0a2luZDogJ2NvZGVibG9ja1VyaScsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0aXNFZGl0OiB0cnVlLFxuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFubm90YXRlZCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbY29udGVudCgnY29kZScpLCBjb2RlYmxvY2tVcmlQYXJ0XSk7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGFubm90YXRlZFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdWJBZ2VudEludm9jYXRpb25JZCwgc3ViQWdlbnRJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVyaS50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlzRWRpdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgaW52YWxpZCBVUkkgY29udGVudCBpbnNpZGUgY29kZWJsb2NrIHVyaSB0YWcnLCAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIGNvbnRlbnQgY29udGFpbnMgYmFja3RpY2tzIGFuZCBhIGNvbG9uLCBVUkkucGFyc2UgZXh0cmFjdHNcblx0XHRcdC8vIHRoZSB0ZXh0IGJlZm9yZSB0aGUgY29sb24gYXMgdGhlIHNjaGVtZS4gQmFja3RpY2tzIGFyZSBpbGxlZ2FsXG5cdFx0XHQvLyBzY2hlbWUgY2hhcmFjdGVycywgY2F1c2luZyBVUkkucGFyc2UgdG8gdGhyb3cuXG5cdFx0XHRjb25zdCBpbnZhbGlkVGFnID0gJzx2c2NvZGVfY29kZWJsb2NrX3VyaT5gYGB0eXBlc2NyaXB0XFxuY29uc3QgdXJpOiBzdHJpbmdcXG5gYGA8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Q29kZWJsb2NrVXJpc0Zyb21UZXh0KGludmFsaWRUYWcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdW5kLXRyaXAgZW5jb2RpbmcvZGVjb2Rpbmcgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJBZ2VudElkID0gJ2FnZW50L3dpdGggc3BhY2VzJnNwZWNpYWw9Y2hhcnM/bW9yZSc7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGF0aC90by9maWxlLnRzJyk7XG5cdFx0XHRjb25zdCBjb2RlYmxvY2tVcmlQYXJ0OiBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCA9IHtcblx0XHRcdFx0a2luZDogJ2NvZGVibG9ja1VyaScsXG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0aXNFZGl0OiB0cnVlLFxuXHRcdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJZFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFubm90YXRlZCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbY29udGVudCgnY29kZScpLCBjb2RlYmxvY2tVcmlQYXJ0XSk7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGFubm90YXRlZFswXSBhcyBJQ2hhdE1hcmtkb3duQ29udGVudDtcblxuXHRcdFx0Y29uc3QgZXh0cmFjdGVkID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dChtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRcdGFzc2VydC5vayhleHRyYWN0ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RlZC5zdWJBZ2VudEludm9jYXRpb25JZCwgc3ViQWdlbnRJZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc0luc2lkZUNvZGVDb250ZXh0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ25vdCBpbnNpZGUgY29kZSBmb3IgcGxhaW4gdGV4dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCdoZWxsbyB3b3JsZCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3QgaW5zaWRlIGNvZGUgYWZ0ZXIgY2xvc2VkIGlubGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJ3J1biBgY29kZWAgYW5kJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2lkZSB1bmNsb3NlZCBzaW5nbGUgYmFja3RpY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgncnVuIGBucHggdHN4ICcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2lkZSB1bmNsb3NlZCBkb3VibGUgYmFja3RpY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgncnVuIGBgbnB4IHRzeCAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3QgaW5zaWRlIGNvZGUgYWZ0ZXIgY2xvc2VkIGRvdWJsZSBiYWNrdGljaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCdydW4gYGBjb2RlYGAgYW5kJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc2lkZSBmZW5jZWQgY29kZSBibG9jaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0luc2lkZUNvZGVDb250ZXh0KCd0ZXh0XFxuYGBgYmFzaFxcbm5weCB0c3ggJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm90IGluc2lkZSBjbG9zZWQgZmVuY2VkIGNvZGUgYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNJbnNpZGVDb2RlQ29udGV4dCgndGV4dFxcbmBgYGJhc2hcXG5jb2RlXFxuYGBgXFxuYWZ0ZXInKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zaWRlIGZlbmNlZCBjb2RlIGJsb2NrIHdpdGggdGlsZGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJ3RleHRcXG5+fn5cXG5jb2RlJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzSW5zaWRlQ29kZUNvbnRleHQoJycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQgLSBpbmxpbmUgcmVmZXJlbmNlcyBpbiBjb2RlIGJsb2NrcycsICgpID0+IHtcblx0XHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlIGluc2lkZSBiYWNrdGljayBjb2RlIHNwYW4gdXNlcyBwbGFpbiB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtcblx0XHRcdFx0Y29udGVudCgnUnVuIGBucHggdHN4ICcpLFxuXHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9pbmRleC50cycpLCBuYW1lOiAnaW5kZXgudHMnIH0sXG5cdFx0XHRcdGNvbnRlbnQoJyBldmFsICcpLFxuXHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9wcmltZXIuZXZhbC5qc29uJyksIG5hbWU6ICdwcmltZXIuZXZhbC5qc29uJyB9LFxuXHRcdFx0XHRjb250ZW50KCcgLS1yZXBvIC5gJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgbWQgPSByZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWQuY29udGVudC52YWx1ZSwgJ1J1biBgbnB4IHRzeCBpbmRleC50cyBldmFsIHByaW1lci5ldmFsLmpzb24gLS1yZXBvIC5gJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWQuaW5saW5lUmVmZXJlbmNlcywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lubGluZSByZWZlcmVuY2Ugb3V0c2lkZSBjb2RlIHNwYW4gdXNlcyBjb250ZW50IHJlZiBsaW5rJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtcblx0XHRcdFx0Y29udGVudCgnU2VlICcpLFxuXHRcdFx0XHR7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9pbmRleC50cycpLCBuYW1lOiAnaW5kZXgudHMnIH0sXG5cdFx0XHRcdGNvbnRlbnQoJyBmb3IgZGV0YWlscycpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IG1kID0gcmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ1tpbmRleC50c10nKSk7XG5cdFx0XHRhc3NlcnQub2sobWQuY29udGVudC52YWx1ZS5pbmNsdWRlcygnX3ZzY29kZWNvbnRlbnRyZWZfJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1kLmlubGluZVJlZmVyZW5jZXMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIHJlZmVyZW5jZSBpbnNpZGUgZmVuY2VkIGNvZGUgYmxvY2sgdXNlcyBwbGFpbiB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50KFtcblx0XHRcdFx0Y29udGVudCgnRXhhbXBsZTpcXG5gYGBiYXNoXFxubnB4IHRzeCAnKSxcblx0XHRcdFx0eyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaW5kZXgudHMnKSwgbmFtZTogJ2luZGV4LnRzJyB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IG1kID0gcmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKCFtZC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdfdnNjb2RlY29udGVudHJlZl8nKSk7XG5cdFx0XHRhc3NlcnQub2sobWQuY29udGVudC52YWx1ZS5lbmRzV2l0aCgnaW5kZXgudHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlIGF0IHN0YXJ0IG9mIGJsb2NrIG1lcmdlcyB3aXRoIGZvbGxvd2luZyBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChbXG5cdFx0XHRcdHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogVVJJLnBhcnNlKCdmaWxlOi8vL2luZGV4LnRzJyksIG5hbWU6ICdpbmRleC50cycgfSxcblx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcgaXMgdGhlIGVudHJ5IHBvaW50JywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgbWQgPSByZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2sobWQuY29udGVudC52YWx1ZS5pbmNsdWRlcygnW2luZGV4LnRzXScpKTtcblx0XHRcdGFzc2VydC5vayhtZC5jb250ZW50LnZhbHVlLmluY2x1ZGVzKCdfdnNjb2RlY29udGVudHJlZl8nKSk7XG5cdFx0XHRhc3NlcnQub2sobWQuY29udGVudC52YWx1ZS5lbmRzV2l0aCgnIGlzIHRoZSBlbnRyeSBwb2ludCcpKTtcblx0XHRcdGFzc2VydC5vayhtZC5pbmxpbmVSZWZlcmVuY2VzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZC5jb250ZW50LmlzVHJ1c3RlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWQuY29udGVudC5zdXBwb3J0VGhlbWVJY29ucywgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgcmVmZXJlbmNlIGFmdGVyIHJlZ3VsYXIgdGV4dCBkb2VzIG5vdCBmb3JjZS1tZXJnZSBpbmNvbXBhdGlibGUgbWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoW1xuXHRcdFx0XHRjb250ZW50KCdTZWUgJyksXG5cdFx0XHRcdHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogVVJJLnBhcnNlKCdmaWxlOi8vL2luZGV4LnRzJyksIG5hbWU6ICdpbmRleC50cycgfSxcblx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCcgbW9yZSBpbmZvJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlIGZpcnN0IGl0ZW0gaGFzIFwiU2VlIFtpbmRleC50c10oLi4uKVwiIHdpdGggZGVmYXVsdCBtYXJrZG93biBwcm9wZXJ0aWVzLFxuXHRcdFx0Ly8gdGhlIHNlY29uZCBpdGVtIGhhcyBkaWZmZXJlbnQgcHJvcGVydGllcyAtIHRoZXkgbXVzdCBzdGF5IHNlcGFyYXRlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSByZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2soZmlyc3QuY29udGVudC52YWx1ZS5zdGFydHNXaXRoKCdTZWUgJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0LmlubGluZVJlZmVyZW5jZXMpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gcmVzdWx0WzFdIGFzIElDaGF0TWFya2Rvd25Db250ZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5jb250ZW50LnZhbHVlLCAnIG1vcmUgaW5mbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5jb250ZW50LmlzVHJ1c3RlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYXNFZGl0Q29kZWJsb2NrVXJpVGFnJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZWRpdCBjb2RlYmxvY2sgVVJJIHRhZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0VGFnID0gJzx2c2NvZGVfY29kZWJsb2NrX3VyaSBpc0VkaXQ+ZmlsZTovLy90ZXN0LnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcoZWRpdFRhZyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3Igbm9uLWVkaXQgY29kZWJsb2NrIFVSSSB0YWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9uRWRpdFRhZyA9ICc8dnNjb2RlX2NvZGVibG9ja191cmk+ZmlsZTovLy90ZXN0LnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcobm9uRWRpdFRhZyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZWRpdCBjb2RlYmxvY2sgVVJJIHRhZ3Mgd2l0aCBzdWJBZ2VudEludm9jYXRpb25JZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRUYWdXaXRoU3ViQWdlbnQgPSAnPHZzY29kZV9jb2RlYmxvY2tfdXJpIGlzRWRpdCBzdWJBZ2VudEludm9jYXRpb25JZD1cImFnZW50LTEyM1wiPmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+Jztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKGVkaXRUYWdXaXRoU3ViQWdlbnQpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIG5vbi1lZGl0IGNvZGVibG9jayBVUkkgdGFncyB3aXRoIHN1YkFnZW50SW52b2NhdGlvbklkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgbm9uRWRpdFRhZ1dpdGhTdWJBZ2VudCA9ICc8dnNjb2RlX2NvZGVibG9ja191cmkgc3ViQWdlbnRJbnZvY2F0aW9uSWQ9XCJhZ2VudC0xMjNcIj5maWxlOi8vL3Rlc3QudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPic7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRWRpdENvZGVibG9ja1VyaVRhZyhub25FZGl0VGFnV2l0aFN1YkFnZW50KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgdGV4dCB3aXRob3V0IGNvZGVibG9jayBVUkkgdGFncycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKCdzb21lIHBsYWluIHRleHQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgdGV4dCB3aXRoIG9ubHkgcGFydGlhbCB0YWcgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcoJzx2c2NvZGVfY29kZWJsb2MnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciB0ZXh0IGNvbnRhaW5pbmcgbXVsdGlwbGUgZWRpdCBjb2RlYmxvY2sgVVJJIHRhZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtdWx0aXBsZUVkaXRUYWdzID0gJ3NvbWUgdGV4dCA8dnNjb2RlX2NvZGVibG9ja191cmkgaXNFZGl0PmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+IG1vcmUgPHZzY29kZV9jb2RlYmxvY2tfdXJpIGlzRWRpdD5maWxlOi8vL290aGVyLnRzPC92c2NvZGVfY29kZWJsb2NrX3VyaT4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0VkaXRDb2RlYmxvY2tVcmlUYWcobXVsdGlwbGVFZGl0VGFncyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgdGV4dCBjb250YWluaW5nIG9ubHkgbm9uLWVkaXQgY29kZWJsb2NrIFVSSSB0YWdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXVsdGlwbGVOb25FZGl0VGFncyA9ICdzb21lIHRleHQgPHZzY29kZV9jb2RlYmxvY2tfdXJpPmZpbGU6Ly8vdGVzdC50czwvdnNjb2RlX2NvZGVibG9ja191cmk+IG1vcmUgPHZzY29kZV9jb2RlYmxvY2tfdXJpPmZpbGU6Ly8vb3RoZXIudHM8L3ZzY29kZV9jb2RlYmxvY2tfdXJpPic7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRWRpdENvZGVibG9ja1VyaVRhZyhtdWx0aXBsZU5vbkVkaXRUYWdzKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDLDhC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
