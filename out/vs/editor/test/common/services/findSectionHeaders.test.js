import * as assert from "assert";
import { findSectionHeaders } from "../../../common/services/findSectionHeaders.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
class TestSectionHeaderFinderTarget {
  constructor(lines) {
    this.lines = lines;
  }
  getLineCount() {
    return this.lines.length;
  }
  getLineContent(lineNumber) {
    return this.lines[lineNumber - 1];
  }
}
suite("FindSectionHeaders", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("finds simple section headers", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "MARK: My Section",
      "another line",
      "MARK: Another Section",
      "last line"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "MARK:\\s*(?<label>.*)$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].range.startLineNumber, 2);
    assert.strictEqual(headers[0].range.endLineNumber, 2);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 4);
  });
  test("finds section headers with separators", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "MARK: -My Section",
      "another line",
      "MARK: - Another Section",
      "last line"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "MARK:\\s*(?<separator>-?)\\s*(?<label>.*)$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].hasSeparatorLine, true);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].hasSeparatorLine, true);
  });
  test("finds multi-line section headers with separators", () => {
    const model = new TestSectionHeaderFinderTarget([
      "regular line",
      "// ==========",
      "// My Section",
      "// ==========",
      "code...",
      "// ==========",
      "// Another Section",
      "// ==========",
      "more code..."
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "My Section");
    assert.strictEqual(headers[0].range.startLineNumber, 2);
    assert.strictEqual(headers[0].range.endLineNumber, 4);
    assert.strictEqual(headers[1].text, "Another Section");
    assert.strictEqual(headers[1].range.startLineNumber, 6);
    assert.strictEqual(headers[1].range.endLineNumber, 8);
  });
  test("handles overlapping multi-line section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "// ==========",
      // This line starts another header
      "// Section 2",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 6);
  });
  test("section headers must be in comments when specified", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      // This one is in a comment
      "// ==========",
      "==========",
      // This one isn't
      "Section 2",
      "=========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^(?:// )?=+\\n^(?:// )?(?<label>[^\\n]+?)\\n^(?:// )?=+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers[0].shouldBeInComments, true);
  });
  test("handles section headers at chunk boundaries", () => {
    const lines = [];
    for (let i = 0; i < 150; i++) {
      lines.push("line " + i);
    }
    lines[97] = "// ==========";
    lines[98] = "// Section 1";
    lines[99] = "// ==========";
    lines[100] = "// ==========";
    lines[101] = "// Section 2";
    lines[102] = "// ==========";
    const model = new TestSectionHeaderFinderTarget(lines);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 98);
    assert.strictEqual(headers[0].range.endLineNumber, 100);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 101);
    assert.strictEqual(headers[1].range.endLineNumber, 103);
  });
  test("handles empty regex gracefully without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "line 1",
      "line 2",
      "line 3"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: ""
      // Empty string that would cause infinite loop
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 0, "Should return no headers for empty regex");
  });
  test("handles whitespace-only regex gracefully without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "line 1",
      "line 2",
      "line 3"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "   "
      // Whitespace that would cause infinite loop
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 0, "Should return no headers for whitespace-only regex");
  });
  test("correctly advances past matches without infinite loop", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "some code",
      "// ==========",
      "// Section 2",
      "// ==========",
      "more code",
      "// ==========",
      "// Section 3",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 3, "Should find all three section headers");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[2].text, "Section 3");
  });
  test("handles consecutive section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      "// Section 1",
      "// ==========",
      "// ==========",
      // This line is both the end of Section 1 and start of Section 2
      "// Section 2",
      "// =========="
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[1].text, "Section 2");
  });
  test("handles nested separators correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==============",
      "// Major Section",
      "// ==============",
      "",
      "// ----------",
      "// Subsection",
      "// ----------"
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// [-=]+\\n^// (?<label>[^\\n]+?)\\n^// [-=]+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers");
    assert.strictEqual(headers[0].text, "Major Section");
    assert.strictEqual(headers[1].text, "Subsection");
  });
  test("handles section headers at chunk boundaries correctly", () => {
    const lines = [];
    for (let i = 0; i < 97; i++) {
      lines.push(`line ${i}`);
    }
    lines.push("// ==========");
    lines.push("// Section 1");
    lines.push("// ==========");
    lines.push("// ==========");
    lines.push("// Section 2");
    lines.push("// ==========");
    for (let i = 103; i < 150; i++) {
      lines.push(`line ${i}`);
    }
    const model = new TestSectionHeaderFinderTarget(lines);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2, "Should find both section headers across chunk boundary");
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 98);
    assert.strictEqual(headers[0].range.endLineNumber, 100);
    assert.strictEqual(headers[1].text, "Section 2");
    assert.strictEqual(headers[1].range.startLineNumber, 101);
    assert.strictEqual(headers[1].range.endLineNumber, 103);
  });
  test("handles overlapping section headers without duplicates", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ==========",
      // Line 1
      "// Section 1",
      // Line 2 - This is part of first header
      "// ==========",
      // Line 3 - This is the end of first
      "// Section 2",
      // Line 4 - This is not a header
      "// ==========",
      // Line 5
      "// ==========",
      // Line 6 - Start of second header
      "// Section 3",
      // Line 7
      "// ==========="
      // Line 8
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 2);
    assert.strictEqual(headers[0].text, "Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Section 3");
    assert.strictEqual(headers[1].range.startLineNumber, 6);
    assert.strictEqual(headers[1].range.endLineNumber, 8);
  });
  test("handles partially overlapping multiline section headers correctly", () => {
    const model = new TestSectionHeaderFinderTarget([
      "// ================",
      // Line 1
      "// Major Section 1",
      // Line 2
      "// ================",
      // Line 3
      "// --------",
      // Line 4 - Start of subsection that overlaps with end of major section
      "// Subsection 1.1",
      // Line 5
      "// --------",
      // Line 6
      "// ================",
      // Line 7
      "// Major Section 2",
      // Line 8
      "// ================"
      // Line 9
    ]);
    const options = {
      findRegionSectionHeaders: false,
      findMarkSectionHeaders: true,
      markSectionHeaderRegex: "^// [-=]+\\n^// (?<label>[^\\n]+?)\\n^// [-=]+$"
    };
    const headers = findSectionHeaders(model, options);
    assert.strictEqual(headers.length, 3);
    assert.strictEqual(headers[0].text, "Major Section 1");
    assert.strictEqual(headers[0].range.startLineNumber, 1);
    assert.strictEqual(headers[0].range.endLineNumber, 3);
    assert.strictEqual(headers[1].text, "Subsection 1.1");
    assert.strictEqual(headers[1].range.startLineNumber, 4);
    assert.strictEqual(headers[1].range.endLineNumber, 6);
    assert.strictEqual(headers[2].text, "Major Section 2");
    assert.strictEqual(headers[2].range.startLineNumber, 7);
    assert.strictEqual(headers[2].range.endLineNumber, 9);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9maW5kU2VjdGlvbkhlYWRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zLCBJU2VjdGlvbkhlYWRlckZpbmRlclRhcmdldCwgZmluZFNlY3Rpb25IZWFkZXJzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2ZpbmRTZWN0aW9uSGVhZGVycy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY2xhc3MgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQgaW1wbGVtZW50cyBJU2VjdGlvbkhlYWRlckZpbmRlclRhcmdldCB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbGluZXM6IHN0cmluZ1tdKSB7IH1cblxuXHRnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saW5lcy5sZW5ndGg7XG5cdH1cblxuXHRnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmxpbmVzW2xpbmVOdW1iZXIgLSAxXTtcblx0fVxufVxuXG5zdWl0ZSgnRmluZFNlY3Rpb25IZWFkZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZpbmRzIHNpbXBsZSBzZWN0aW9uIGhlYWRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0J3JlZ3VsYXIgbGluZScsXG5cdFx0XHQnTUFSSzogTXkgU2VjdGlvbicsXG5cdFx0XHQnYW5vdGhlciBsaW5lJyxcblx0XHRcdCdNQVJLOiBBbm90aGVyIFNlY3Rpb24nLFxuXHRcdFx0J2xhc3QgbGluZSdcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ01BUks6XFxcXHMqKD88bGFiZWw+LiopJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdNeSBTZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdBbm90aGVyIFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kcyBzZWN0aW9uIGhlYWRlcnMgd2l0aCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCdyZWd1bGFyIGxpbmUnLFxuXHRcdFx0J01BUks6IC1NeSBTZWN0aW9uJyxcblx0XHRcdCdhbm90aGVyIGxpbmUnLFxuXHRcdFx0J01BUks6IC0gQW5vdGhlciBTZWN0aW9uJyxcblx0XHRcdCdsYXN0IGxpbmUnXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdNQVJLOlxcXFxzKig/PHNlcGFyYXRvcj4tPylcXFxccyooPzxsYWJlbD4uKikkJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0udGV4dCwgJ015IFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5oYXNTZXBhcmF0b3JMaW5lLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdBbm90aGVyIFNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5oYXNTZXBhcmF0b3JMaW5lLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZHMgbXVsdGktbGluZSBzZWN0aW9uIGhlYWRlcnMgd2l0aCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCdyZWd1bGFyIGxpbmUnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIE15IFNlY3Rpb24nLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0J2NvZGUuLi4nLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIEFub3RoZXIgU2VjdGlvbicsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnbW9yZSBjb2RlLi4uJ1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnTXkgU2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2UuZW5kTGluZU51bWJlciwgNCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS50ZXh0LCAnQW5vdGhlciBTZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCA4KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBvdmVybGFwcGluZyBtdWx0aS1saW5lIHNlY3Rpb24gaGVhZGVycyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQoW1xuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIFNlY3Rpb24gMScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gPT09PT09PT09PScsIC8vIFRoaXMgbGluZSBzdGFydHMgYW5vdGhlciBoZWFkZXJcblx0XHRcdCcvLyBTZWN0aW9uIDInLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTZWN0aW9uIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDYpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWN0aW9uIGhlYWRlcnMgbXVzdCBiZSBpbiBjb21tZW50cyB3aGVuIHNwZWNpZmllZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChbXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gU2VjdGlvbiAxJywgIC8vIFRoaXMgb25lIGlzIGluIGEgY29tbWVudFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jz09PT09PT09PT0nLCAgICAvLyBUaGlzIG9uZSBpc24ndFxuXHRcdFx0J1NlY3Rpb24gMicsXG5cdFx0XHQnPT09PT09PT09PSdcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ14oPzpcXC9cXC8gKT89K1xcXFxuXig/OlxcL1xcLyApPyg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eKD86XFwvXFwvICk/PSskJ1xuXHRcdH07XG5cblx0XHQvLyBCb3RoIHBhdHRlcm5zIG1hdGNoLCBidXQgdGhlIHNlY29uZCBvbmUgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCBieSB0aGUgdG9rZW4gY2hlY2tcblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5zaG91bGRCZUluQ29tbWVudHMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHNlY3Rpb24gaGVhZGVycyBhdCBjaHVuayBib3VuZGFyaWVzJywgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBlbm91Z2ggbGluZXMgdG8gZW5zdXJlIHdlIGNyb3NzIGNodW5rIGJvdW5kYXJpZXNcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDE1MDsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKCdsaW5lICcgKyBpKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgaGVhZGVycyBuZWFyIHRoZSBjaHVuayBib3VuZGFyeSAoY2h1bmsgc2l6ZSBpcyAxMDApXG5cdFx0bGluZXNbOTddID0gJy8vID09PT09PT09PT0nO1xuXHRcdGxpbmVzWzk4XSA9ICcvLyBTZWN0aW9uIDEnO1xuXHRcdGxpbmVzWzk5XSA9ICcvLyA9PT09PT09PT09Jztcblx0XHRsaW5lc1sxMDBdID0gJy8vID09PT09PT09PT0nO1xuXHRcdGxpbmVzWzEwMV0gPSAnLy8gU2VjdGlvbiAyJztcblx0XHRsaW5lc1sxMDJdID0gJy8vID09PT09PT09PT0nO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVzdFNlY3Rpb25IZWFkZXJGaW5kZXJUYXJnZXQobGluZXMpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA5OCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2UuZW5kTGluZU51bWJlciwgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTZWN0aW9uIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEwMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgMTAzKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBlbXB0eSByZWdleCBncmFjZWZ1bGx5IHdpdGhvdXQgaW5maW5pdGUgbG9vcCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJycgLy8gRW1wdHkgc3RyaW5nIHRoYXQgd291bGQgY2F1c2UgaW5maW5pdGUgbG9vcFxuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDAsICdTaG91bGQgcmV0dXJuIG5vIGhlYWRlcnMgZm9yIGVtcHR5IHJlZ2V4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgd2hpdGVzcGFjZS1vbmx5IHJlZ2V4IGdyYWNlZnVsbHkgd2l0aG91dCBpbmZpbml0ZSBsb29wJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnICAgJyAvLyBXaGl0ZXNwYWNlIHRoYXQgd291bGQgY2F1c2UgaW5maW5pdGUgbG9vcFxuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDAsICdTaG91bGQgcmV0dXJuIG5vIGhlYWRlcnMgZm9yIHdoaXRlc3BhY2Utb25seSByZWdleCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3JyZWN0bHkgYWR2YW5jZXMgcGFzdCBtYXRjaGVzIHdpdGhvdXQgaW5maW5pdGUgbG9vcCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChbXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnLy8gU2VjdGlvbiAxJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCdzb21lIGNvZGUnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vIFNlY3Rpb24gMicsXG5cdFx0XHQnLy8gPT09PT09PT09PScsXG5cdFx0XHQnbW9yZSBjb2RlJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCcvLyBTZWN0aW9uIDMnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMywgJ1Nob3VsZCBmaW5kIGFsbCB0aHJlZSBzZWN0aW9uIGhlYWRlcnMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzJdLnRleHQsICdTZWN0aW9uIDMnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBjb25zZWN1dGl2ZSBzZWN0aW9uIGhlYWRlcnMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRcdCcvLyBTZWN0aW9uIDEnLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLFxuXHRcdFx0Jy8vID09PT09PT09PT0nLCAvLyBUaGlzIGxpbmUgaXMgYm90aCB0aGUgZW5kIG9mIFNlY3Rpb24gMSBhbmQgc3RhcnQgb2YgU2VjdGlvbiAyXG5cdFx0XHQnLy8gU2VjdGlvbiAyJyxcblx0XHRcdCcvLyA9PT09PT09PT09Jyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucyA9IHtcblx0XHRcdGZpbmRSZWdpb25TZWN0aW9uSGVhZGVyczogZmFsc2UsXG5cdFx0XHRmaW5kTWFya1NlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0bWFya1NlY3Rpb25IZWFkZXJSZWdleDogJ15cXC9cXC8gPStcXFxcbl5cXC9cXC8gKD88bGFiZWw+W15cXFxcbl0rPylcXFxcbl5cXC9cXC8gPSskJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoZWFkZXJzID0gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycy5sZW5ndGgsIDIsICdTaG91bGQgZmluZCBib3RoIHNlY3Rpb24gaGVhZGVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzBdLnRleHQsICdTZWN0aW9uIDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS50ZXh0LCAnU2VjdGlvbiAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbmVzdGVkIHNlcGFyYXRvcnMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09PT09PScsXG5cdFx0XHQnLy8gTWFqb3IgU2VjdGlvbicsXG5cdFx0XHQnLy8gPT09PT09PT09PT09PT0nLFxuXHRcdFx0JycsXG5cdFx0XHQnLy8gLS0tLS0tLS0tLScsXG5cdFx0XHQnLy8gU3Vic2VjdGlvbicsXG5cdFx0XHQnLy8gLS0tLS0tLS0tLScsXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvIFstPV0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvIFstPV0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgYm90aCBzZWN0aW9uIGhlYWRlcnMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnTWFqb3IgU2VjdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTdWJzZWN0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgc2VjdGlvbiBoZWFkZXJzIGF0IGNodW5rIGJvdW5kYXJpZXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdC8vIEZpbGwgdXAgdG8gbmVhciB0aGUgY2h1bmsgYm91bmRhcnkgKGNodW5rIHNpemUgaXMgMTAwKVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgOTc7IGkrKykge1xuXHRcdFx0bGluZXMucHVzaChgbGluZSAke2l9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGEgc2VjdGlvbiBoZWFkZXIgdGhhdCB3b3VsZCBjcm9zcyB0aGUgY2h1bmsgYm91bmRhcnlcblx0XHRsaW5lcy5wdXNoKCcvLyA9PT09PT09PT09Jyk7ICAvLyBsaW5lIDk3XG5cdFx0bGluZXMucHVzaCgnLy8gU2VjdGlvbiAxJyk7IC8vIGxpbmUgOThcblx0XHRsaW5lcy5wdXNoKCcvLyA9PT09PT09PT09Jyk7IC8vIGxpbmUgOTlcblx0XHRsaW5lcy5wdXNoKCcvLyA9PT09PT09PT09Jyk7IC8vIGxpbmUgMTAwIChjaHVuayBib3VuZGFyeSlcblx0XHRsaW5lcy5wdXNoKCcvLyBTZWN0aW9uIDInKTsgLy8gbGluZSAxMDFcblx0XHRsaW5lcy5wdXNoKCcvLyA9PT09PT09PT09Jyk7IC8vIGxpbmUgMTAyXG5cblx0XHQvLyBBZGQgbW9yZSBjb250ZW50IGFmdGVyXG5cdFx0Zm9yIChsZXQgaSA9IDEwMzsgaSA8IDE1MDsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGBsaW5lICR7aX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXN0U2VjdGlvbkhlYWRlckZpbmRlclRhcmdldChsaW5lcyk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBGaW5kU2VjdGlvbkhlYWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmaW5kUmVnaW9uU2VjdGlvbkhlYWRlcnM6IGZhbHNlLFxuXHRcdFx0ZmluZE1hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdeXFwvXFwvID0rXFxcXG5eXFwvXFwvICg/PGxhYmVsPlteXFxcXG5dKz8pXFxcXG5eXFwvXFwvID0rJCdcblx0XHR9O1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGZpbmRTZWN0aW9uSGVhZGVycyhtb2RlbCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnMubGVuZ3RoLCAyLCAnU2hvdWxkIGZpbmQgYm90aCBzZWN0aW9uIGhlYWRlcnMgYWNyb3NzIGNodW5rIGJvdW5kYXJ5Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA5OCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2UuZW5kTGluZU51bWJlciwgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTZWN0aW9uIDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEwMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgMTAzKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBvdmVybGFwcGluZyBzZWN0aW9uIGhlYWRlcnMgd2l0aG91dCBkdXBsaWNhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09JywgIC8vIExpbmUgMVxuXHRcdFx0Jy8vIFNlY3Rpb24gMScsICAgLy8gTGluZSAyIC0gVGhpcyBpcyBwYXJ0IG9mIGZpcnN0IGhlYWRlclxuXHRcdFx0Jy8vID09PT09PT09PT0nLCAgLy8gTGluZSAzIC0gVGhpcyBpcyB0aGUgZW5kIG9mIGZpcnN0XG5cdFx0XHQnLy8gU2VjdGlvbiAyJywgICAvLyBMaW5lIDQgLSBUaGlzIGlzIG5vdCBhIGhlYWRlclxuXHRcdFx0Jy8vID09PT09PT09PT0nLCAgLy8gTGluZSA1XG5cdFx0XHQnLy8gPT09PT09PT09PScsICAvLyBMaW5lIDYgLSBTdGFydCBvZiBzZWNvbmQgaGVhZGVyXG5cdFx0XHQnLy8gU2VjdGlvbiAzJywgICAvLyBMaW5lIDdcblx0XHRcdCcvLyA9PT09PT09PT09PScgIC8vIExpbmUgOFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyA9K1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyA9KyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAzKTtcblxuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTZWN0aW9uIDInKTtcblx0XHQvLyBhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1sxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDMpO1xuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLmVuZExpbmVOdW1iZXIsIDUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0udGV4dCwgJ1NlY3Rpb24gMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgOCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcGFydGlhbGx5IG92ZXJsYXBwaW5nIG11bHRpbGluZSBzZWN0aW9uIGhlYWRlcnMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlc3RTZWN0aW9uSGVhZGVyRmluZGVyVGFyZ2V0KFtcblx0XHRcdCcvLyA9PT09PT09PT09PT09PT09JywgIC8vIExpbmUgMVxuXHRcdFx0Jy8vIE1ham9yIFNlY3Rpb24gMScsICAgLy8gTGluZSAyXG5cdFx0XHQnLy8gPT09PT09PT09PT09PT09PScsICAvLyBMaW5lIDNcblx0XHRcdCcvLyAtLS0tLS0tLScsICAgICAgICAgLy8gTGluZSA0IC0gU3RhcnQgb2Ygc3Vic2VjdGlvbiB0aGF0IG92ZXJsYXBzIHdpdGggZW5kIG9mIG1ham9yIHNlY3Rpb25cblx0XHRcdCcvLyBTdWJzZWN0aW9uIDEuMScsICAgLy8gTGluZSA1XG5cdFx0XHQnLy8gLS0tLS0tLS0nLCAgICAgICAgIC8vIExpbmUgNlxuXHRcdFx0Jy8vID09PT09PT09PT09PT09PT0nLCAgLy8gTGluZSA3XG5cdFx0XHQnLy8gTWFqb3IgU2VjdGlvbiAyJywgICAvLyBMaW5lIDhcblx0XHRcdCcvLyA9PT09PT09PT09PT09PT09JywgIC8vIExpbmUgOVxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zID0ge1xuXHRcdFx0ZmluZFJlZ2lvblNlY3Rpb25IZWFkZXJzOiBmYWxzZSxcblx0XHRcdGZpbmRNYXJrU2VjdGlvbkhlYWRlcnM6IHRydWUsXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiAnXlxcL1xcLyBbLT1dK1xcXFxuXlxcL1xcLyAoPzxsYWJlbD5bXlxcXFxuXSs/KVxcXFxuXlxcL1xcLyBbLT1dKyQnXG5cdFx0fTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBmaW5kU2VjdGlvbkhlYWRlcnMobW9kZWwsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzLmxlbmd0aCwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS50ZXh0LCAnTWFqb3IgU2VjdGlvbiAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMF0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1swXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnRleHQsICdTdWJzZWN0aW9uIDEuMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWzFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMV0ucmFuZ2UuZW5kTGluZU51bWJlciwgNik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1syXS50ZXh0LCAnTWFqb3IgU2VjdGlvbiAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbMl0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1syXS5yYW5nZS5lbmRMaW5lTnVtYmVyLCA5KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUErRCwwQkFBMEI7QUFDekYsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSw4QkFBb0U7QUFBQSxFQUN6RSxZQUE2QixPQUFpQjtBQUFqQjtBQUFB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
