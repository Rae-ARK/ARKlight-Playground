import * as assert from "assert";
import { parse, parseFrontMatter, parseCommaSeparatedList } from "../../common/yaml.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function parseOk(input) {
  const errors = [];
  const result = parse(input, errors);
  assert.deepStrictEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors)}`);
  return result;
}
function assertScalar(input, node, expected) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "scalar");
  const scalar = node;
  assert.strictEqual(scalar.value, expected.value);
  if (expected.format !== void 0) {
    assert.strictEqual(scalar.format, expected.format);
  }
  assert.strictEqual(
    input.substring(scalar.startOffset, scalar.endOffset),
    scalar.rawValue,
    `Offset mismatch: input[${scalar.startOffset}..${scalar.endOffset}] is "${input.substring(scalar.startOffset, scalar.endOffset)}" but rawValue is "${scalar.rawValue}"`
  );
}
function assertMap(node, expectedKeyCount) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "map", `Expected map but got ${node.type}`);
  const map = node;
  assert.strictEqual(map.properties.length, expectedKeyCount, `Expected ${expectedKeyCount} properties but got ${map.properties.length}`);
  return map;
}
function assertSequence(node, expectedItemCount) {
  assert.ok(node, "Expected a node but got undefined");
  assert.strictEqual(node.type, "sequence", `Expected sequence but got ${node.type}`);
  const seq = node;
  assert.strictEqual(seq.items.length, expectedItemCount, `Expected ${expectedItemCount} items but got ${seq.items.length}`);
  return seq;
}
suite("YAML Parser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Empty input", () => {
    test("returns undefined for empty string", () => {
      assert.strictEqual(parseOk(""), void 0);
    });
    test("returns undefined for whitespace-only input", () => {
      assert.strictEqual(parseOk("   "), void 0);
    });
    test("returns undefined for newline-only input", () => {
      assert.strictEqual(parseOk("\n\n"), void 0);
    });
  });
  suite("Scalars", () => {
    test("unquoted scalar", () => {
      const input = "hello world";
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "none" });
    });
    test("literal block scalar format", () => {
      const input = [
        "text: |",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two\n", format: "literal" });
    });
    test("folded block scalar format", () => {
      const input = [
        "text: >",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two\n", format: "folded" });
    });
    test("literal block scalar strip chomping (|-)", () => {
      const input = [
        "text: |-",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two", format: "literal" });
    });
    test("literal block scalar keep chomping (|+)", () => {
      const input = [
        "text: |+",
        "  line one",
        "  line two",
        ""
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one\nline two\n", format: "literal" });
    });
    test("folded block scalar strip chomping (>-)", () => {
      const input = [
        "text: >-",
        "  line one",
        "  line two"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two", format: "folded" });
    });
    test("folded block scalar keep chomping (>+)", () => {
      const input = [
        "text: >+",
        "  line one",
        "  line two",
        ""
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "line one line two\n", format: "folded" });
    });
    test("single-quoted scalar", () => {
      const input = `'hello world'`;
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "single" });
    });
    test("double-quoted scalar", () => {
      const input = '"hello world"';
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello world", format: "double" });
    });
    test("double-quoted scalar with escape sequences", () => {
      const input = '"hello\\nworld"';
      const node = parseOk(input);
      assertScalar(input, node, { value: "hello\nworld", format: "double" });
    });
    test("single-quoted scalar with escaped single quote", () => {
      const input = `'it''s a test'`;
      const node = parseOk(input);
      assertScalar(input, node, { value: `it's a test`, format: "single" });
    });
    test("scalar offsets are correct", () => {
      const node = parseOk("hello");
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 5);
    });
  });
  suite("Block mappings", () => {
    test("simple key-value pair", () => {
      const input = "name: John Doe";
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assert.strictEqual(map.properties[0].key.value, "name");
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
    });
    test("multiple key-value pairs", () => {
      const input = [
        "name: John Doe",
        "age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.value, "name");
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      assert.strictEqual(map.properties[1].key.value, "age");
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("nested mappings", () => {
      const input = [
        "name: John Doe",
        "age: 30",
        "mother:",
        "  name: Susi Doe",
        "  age: 50",
        "  address:",
        "    street: 123 Main St",
        "    city: Example City"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 3);
      assert.strictEqual(map.properties[0].key.value, "name");
      assert.strictEqual(map.properties[2].key.value, "mother");
      const mother = assertMap(map.properties[2].value, 3);
      assert.strictEqual(mother.properties[0].key.value, "name");
      assertScalar(input, mother.properties[0].value, { value: "Susi Doe" });
      const address = assertMap(mother.properties[2].value, 2);
      assert.strictEqual(address.properties[0].key.value, "street");
      assertScalar(input, address.properties[0].value, { value: "123 Main St" });
    });
    test("mapping with quoted keys and values", () => {
      const input = [
        `"name": 'John Doe'`,
        `'age': "30"`
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.format, "double");
      assert.strictEqual(map.properties[0].value.format, "single");
    });
    test("mapping offsets", () => {
      const input = "name: John";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 10);
    });
  });
  suite("Block sequences", () => {
    test("simple sequence", () => {
      const input = [
        "- Apple",
        "- Banana",
        "- Cherry"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Apple" });
      assertScalar(input, seq.items[1], { value: "Banana" });
      assertScalar(input, seq.items[2], { value: "Cherry" });
    });
    test("spec 2.4 - sequence of mappings (229Q)", () => {
      const input = [
        "-",
        "  name: Mark McGwire",
        "  hr:   65",
        "  avg:  0.278",
        "-",
        "  name: Sammy Sosa",
        "  hr:   63",
        "  avg:  0.288"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 3);
      assert.strictEqual(first.properties[0].key.value, "name");
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
      assert.strictEqual(first.properties[1].key.value, "hr");
      assertScalar(input, first.properties[1].value, { value: "65" });
      assert.strictEqual(first.properties[2].key.value, "avg");
      assertScalar(input, first.properties[2].value, { value: "0.278" });
      const second = assertMap(seq.items[1], 3);
      assert.strictEqual(second.properties[0].key.value, "name");
      assertScalar(input, second.properties[0].value, { value: "Sammy Sosa" });
      assert.strictEqual(second.properties[1].key.value, "hr");
      assertScalar(input, second.properties[1].value, { value: "63" });
      assert.strictEqual(second.properties[2].key.value, "avg");
      assertScalar(input, second.properties[2].value, { value: "0.288" });
    });
    test("sequence of mappings", () => {
      const input = [
        "-",
        "  name: Mark McGwire",
        "  hr:   65",
        "  avg:  0.278",
        "-",
        "  name: Sammy Sosa",
        "  hr:   63",
        "  avg:  0.288"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 3);
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
      const second = assertMap(seq.items[1], 3);
      assertScalar(input, second.properties[0].value, { value: "Sammy Sosa" });
    });
    test("map of sequences", () => {
      const input = [
        "american:",
        "  - Boston Red Sox",
        "  - Detroit Tigers",
        "  - New York Yankees",
        "national:",
        "  - New York Mets",
        "  - Chicago Cubs",
        "  - Atlanta Braves"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      const american = assertSequence(map.properties[0].value, 3);
      assertScalar(input, american.items[0], { value: "Boston Red Sox" });
      const national = assertSequence(map.properties[1].value, 3);
      assertScalar(input, national.items[2], { value: "Atlanta Braves" });
    });
    test("inline mapping after dash", () => {
      const input = [
        "- name: Mark McGwire",
        "  hr: 65",
        "- name: Sammy Sosa",
        "  hr: 63"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 2);
      const first = assertMap(seq.items[0], 2);
      assertScalar(input, first.properties[0].value, { value: "Mark McGwire" });
    });
  });
  suite("Flow mappings", () => {
    test("simple flow mapping", () => {
      const input = "{hr: 65, avg: 0.278}";
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assert.strictEqual(map.properties[0].key.value, "hr");
      assertScalar(input, map.properties[0].value, { value: "65" });
      assert.strictEqual(map.properties[1].key.value, "avg");
      assertScalar(input, map.properties[1].value, { value: "0.278" });
    });
    test("flow mapping offsets", () => {
      const input = "{hr: 65}";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 8);
    });
  });
  suite("Flow sequences", () => {
    test("simple flow sequence", () => {
      const input = "[Sammy Sosa  , 63, 0.288]";
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Sammy Sosa" });
      assertScalar(input, seq.items[1], { value: "63" });
      assertScalar(input, seq.items[2], { value: "0.288" });
    });
    test("flow sequence with quoted strings", () => {
      const input = `[ 'Sammy Sosa', 63, 0.288]`;
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "Sammy Sosa", format: "single" });
    });
    test("flow sequence offsets", () => {
      const input = "[a, b]";
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 6);
    });
  });
  suite("Mixed structures", () => {
    test("object with scalars, arrays, inline objects and arrays", () => {
      const input = [
        "object:",
        "    street: 123 Main St",
        '    city: "Example City"',
        "array:",
        "  - Boston Red Sox",
        `  - 'Detroit Tigers'`,
        "inline object: {hr: 65, avg: 0.278}",
        `inline array: [ 'Sammy Sosa', 63, 0.288]`,
        "bool: false"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 5);
      const obj = assertMap(map.properties[0].value, 2);
      assertScalar(input, obj.properties[0].value, { value: "123 Main St" });
      assertScalar(input, obj.properties[1].value, { value: "Example City", format: "double" });
      const arr = assertSequence(map.properties[1].value, 2);
      assertScalar(input, arr.items[0], { value: "Boston Red Sox" });
      assertScalar(input, arr.items[1], { value: "Detroit Tigers", format: "single" });
      const inlineObj = assertMap(map.properties[2].value, 2);
      assertScalar(input, inlineObj.properties[0].value, { value: "65" });
      const inlineArr = assertSequence(map.properties[3].value, 3);
      assertScalar(input, inlineArr.items[0], { value: "Sammy Sosa", format: "single" });
      assertScalar(input, map.properties[4].value, { value: "false" });
    });
    test("arrays of inline arrays", () => {
      const input = [
        "- [name        , hr, avg  ]",
        "- [Mark McGwire, 65, 0.278]",
        "- [Sammy Sosa  , 63, 0.288]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      const header = assertSequence(seq.items[0], 3);
      assertScalar(input, header.items[0], { value: "name" });
      assertScalar(input, header.items[1], { value: "hr" });
      assertScalar(input, header.items[2], { value: "avg" });
      const row1 = assertSequence(seq.items[1], 3);
      assertScalar(input, row1.items[0], { value: "Mark McGwire" });
    });
  });
  suite("Comments", () => {
    test("comment-only lines are ignored", () => {
      const input = [
        "# This is a comment",
        "name: John"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assert.strictEqual(map.properties[0].key.value, "name");
    });
    test("inline comment after value", () => {
      const input = [
        "hr: # 1998 hr ranking",
        "  - Mark McGwire",
        "  - Sammy Sosa",
        "rbi:",
        "  # 1998 rbi ranking",
        "  - Sammy Sosa",
        "  - Ken Griffey#part of the value, not a comment"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      const hr = assertSequence(map.properties[0].value, 2);
      assertScalar(input, hr.items[0], { value: "Mark McGwire" });
      const rbi = assertSequence(map.properties[1].value, 2);
      assertScalar(input, rbi.items[1], { value: "Ken Griffey#part of the value, not a comment" });
    });
  });
  suite("Error handling", () => {
    test("missing value emits error and creates empty scalar", () => {
      const errors = [];
      const input = [
        "name:",
        "age: 30"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "" });
      assert.ok(errors.some((e) => e.code === "missing-value"));
    });
    test("duplicate keys emit errors", () => {
      const errors = [];
      const input = [
        "name: John",
        "name: Jane"
      ].join("\n");
      const node = parse(input, errors);
      assertMap(node, 2);
      assert.ok(errors.some((e) => e.code === "duplicate-key"));
    });
    test("duplicate keys allowed with option", () => {
      const errors = [];
      const input = [
        "name: John",
        "name: Jane"
      ].join("\n");
      const node = parse(input, errors, { allowDuplicateKeys: true });
      assertMap(node, 2);
      assert.strictEqual(errors.length, 0);
    });
    test("wrong indentation emits error but still parses", () => {
      const errors = [];
      const input = [
        "parent:",
        "  child1: a",
        "    child2: b"
      ].join("\n");
      const node = parse(input, errors);
      assert.ok(node);
      assert.ok(errors.some((e) => e.code === "unexpected-indentation"));
    });
  });
  suite("Offset tracking", () => {
    test("scalar offsets in mapping", () => {
      const input = "key: value";
      const map = parseOk(input);
      assert.strictEqual(map.properties[0].key.startOffset, 0);
      assert.strictEqual(map.properties[0].key.endOffset, 3);
      const val = map.properties[0].value;
      assert.strictEqual(val.startOffset, 5);
      assert.strictEqual(val.endOffset, 10);
    });
    test("offsets are zero-based and endOffset is exclusive", () => {
      const input = '"hi"';
      const node = parseOk(input);
      assert.strictEqual(node.startOffset, 0);
      assert.strictEqual(node.endOffset, 4);
      assert.strictEqual(node.value, "hi");
      assert.strictEqual(node.rawValue, '"hi"');
    });
    test("sequence item offsets", () => {
      const input = [
        "- a",
        "- b"
      ].join("\n");
      const seq = parseOk(input);
      const first = seq.items[0];
      assert.strictEqual(first.startOffset, 2);
      assert.strictEqual(first.endOffset, 3);
    });
  });
  suite("Nested sequences", () => {
    test("block sequence in block sequence (dash-dash)", () => {
      const input = [
        "- - s1_i1",
        "  - s1_i2",
        "- s2"
      ].join("\n");
      const outer = assertSequence(parseOk(input), 2);
      const inner = assertSequence(outer.items[0], 2);
      assertScalar(input, inner.items[0], { value: "s1_i1" });
      assertScalar(input, inner.items[1], { value: "s1_i2" });
      assertScalar(input, outer.items[1], { value: "s2" });
    });
    test("sequence at same indent as parent mapping key", () => {
      const input = [
        "one:",
        "- 2",
        "- 3",
        "four: 5"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].key, { value: "one" });
      const seq = assertSequence(map.properties[0].value, 2);
      assertScalar(input, seq.items[0], { value: "2" });
      assertScalar(input, seq.items[1], { value: "3" });
      assertScalar(input, map.properties[1].key, { value: "four" });
      assertScalar(input, map.properties[1].value, { value: "5" });
    });
    test("sequence indented under mapping key", () => {
      const input = [
        "foo:",
        "  - 42",
        "bar:",
        "  - 44"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      const seq1 = assertSequence(map.properties[0].value, 1);
      assertScalar(input, seq1.items[0], { value: "42" });
      const seq2 = assertSequence(map.properties[1].value, 1);
      assertScalar(input, seq2.items[0], { value: "44" });
    });
  });
  suite("Multiline plain scalars", () => {
    test("multiline scalar in mapping value", () => {
      const input = [
        "a: b",
        " c"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "b c" });
    });
    test("multiline scalar with multiple continuation lines", () => {
      const input = [
        "plain:",
        "  This unquoted scalar",
        "  spans many lines."
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "This unquoted scalar spans many lines." });
    });
    test("multiline scalar at top level", () => {
      const input = [
        "a",
        "b",
        "  c",
        "d"
      ].join("\n");
      const result = parseOk(input);
      assertScalar(input, result, { value: "a b c d" });
    });
    test("multiline scalar with empty line preserves newline", () => {
      const input = [
        "a: val1",
        " val2",
        "",
        " val3"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "val1 val2\nval3" });
    });
    test("multiline scalar stops at same indent as mapping", () => {
      const input = [
        "a: b",
        " c",
        "d: e"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].value, { value: "b c" });
      assertScalar(input, map.properties[1].value, { value: "e" });
    });
    test("multiline scalar value on next line", () => {
      const input = [
        "a:",
        "  b",
        "  c"
      ].join("\n");
      const map = assertMap(parseOk(input), 1);
      assertScalar(input, map.properties[0].value, { value: "b c" });
    });
    test("multiline scalar stops at comment", () => {
      const input = [
        "value1",
        "# a comment",
        "value2"
      ].join("\n");
      const result = parseOk(input);
      assertScalar(input, result, { value: "value1" });
    });
    test("multiline scalar with multiple mappings", () => {
      const input = [
        "a: b",
        " c",
        "d:",
        " e",
        "  f"
      ].join("\n");
      const map = assertMap(parseOk(input), 2);
      assertScalar(input, map.properties[0].value, { value: "b c" });
      assertScalar(input, map.properties[1].value, { value: "e f" });
    });
  });
  suite("Edge cases", () => {
    test("colon in unquoted value", () => {
      const input = "url: http://example.com";
      const map = parseOk(input);
      assertScalar(input, map.properties[0].value, { value: "http://example.com" });
    });
    test("trailing whitespace is trimmed from unquoted scalars", () => {
      const input = "name: John   ";
      const map = parseOk(input);
      assertScalar(input, map.properties[0].value, { value: "John" });
    });
    test("empty flow map", () => {
      const node = parseOk("{}");
      const map = assertMap(node, 0);
      assert.strictEqual(map.startOffset, 0);
      assert.strictEqual(map.endOffset, 2);
    });
    test("empty flow sequence", () => {
      const node = parseOk("[]");
      const seq = assertSequence(node, 0);
      assert.strictEqual(seq.startOffset, 0);
      assert.strictEqual(seq.endOffset, 2);
    });
    test("CRLF line endings", () => {
      const input = "name: John\r\nage: 30";
      const map = parseOk(input);
      assertMap(map, 2);
      assertScalar(input, map.properties[0].value, { value: "John" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("multiple --- document separators: only first document is parsed", () => {
      const input = [
        "---",
        "key1: value1",
        "key2: value2",
        "---",
        "key3: value3"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "key1" });
      assertScalar(input, map.properties[0].value, { value: "value1" });
      assertScalar(input, map.properties[1].key, { value: "key2" });
      assertScalar(input, map.properties[1].value, { value: "value2" });
    });
  });
  suite("Old test suite", () => {
    test("mapping value on next line", () => {
      const input = [
        "name:",
        "  John Doe",
        "colors:",
        "  [ Red, Green, Blue ]"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      const colors = assertSequence(map.properties[1].value, 3);
      assertScalar(input, colors.items[0], { value: "Red" });
      assertScalar(input, colors.items[1], { value: "Green" });
      assertScalar(input, colors.items[2], { value: "Blue" });
    });
    test("flow map with different data types", () => {
      const input = "{active: true, score: 85.5, role: null}";
      const node = parseOk(input);
      const map = assertMap(node, 3);
      assertScalar(input, map.properties[0].key, { value: "active" });
      assertScalar(input, map.properties[0].value, { value: "true" });
      assertScalar(input, map.properties[1].key, { value: "score" });
      assertScalar(input, map.properties[1].value, { value: "85.5" });
      assertScalar(input, map.properties[2].key, { value: "role" });
      assertScalar(input, map.properties[2].value, { value: "null" });
    });
    test("flow map with quoted keys and values", () => {
      const input = '{"name": "John Doe", "age": 30}';
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "name", format: "double" });
      assertScalar(input, map.properties[0].value, { value: "John Doe", format: "double" });
      assertScalar(input, map.properties[1].key, { value: "age", format: "double" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("special characters in values", () => {
      const input = `key: value with 	 special chars`;
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: `value with 	 special chars` });
    });
    test("various whitespace after colon", () => {
      const input = `key:	 	 	 value`;
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "value" });
    });
    test("inline array with comment continuation", () => {
      const input = [
        "[one # comment about two",
        ",two, three]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "one" });
      assertScalar(input, seq.items[1], { value: "two" });
      assertScalar(input, seq.items[2], { value: "three" });
    });
    test("multi-line flow sequence", () => {
      const input = [
        "[",
        "    geen, ",
        "    yello, red]"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      assertScalar(input, seq.items[0], { value: "geen" });
      assertScalar(input, seq.items[1], { value: "yello" });
      assertScalar(input, seq.items[2], { value: "red" });
    });
    test("nested block sequences (dash on next line)", () => {
      const input = [
        "-",
        "  - Apple",
        "  - Banana",
        "  - Cherry"
      ].join("\n");
      const node = parseOk(input);
      const outer = assertSequence(node, 1);
      const inner = assertSequence(outer.items[0], 3);
      assertScalar(input, inner.items[0], { value: "Apple" });
      assertScalar(input, inner.items[1], { value: "Banana" });
      assertScalar(input, inner.items[2], { value: "Cherry" });
    });
    test("nested flow sequences", () => {
      const input = [
        "[",
        "  [ee], [ff, gg]",
        "]"
      ].join("\n");
      const node = parseOk(input);
      const outer = assertSequence(node, 2);
      const first = assertSequence(outer.items[0], 1);
      assertScalar(input, first.items[0], { value: "ee" });
      const second = assertSequence(outer.items[1], 2);
      assertScalar(input, second.items[0], { value: "ff" });
      assertScalar(input, second.items[1], { value: "gg" });
    });
    test("mapping with sequence containing a mapping", () => {
      const input = [
        "items:",
        "- name: John",
        "  age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "items" });
      const seq = assertSequence(map.properties[0].value, 1);
      const item = assertMap(seq.items[0], 2);
      assertScalar(input, item.properties[0].value, { value: "John" });
      assertScalar(input, item.properties[1].value, { value: "30" });
    });
    test("sequence of mappings with varying styles", () => {
      const input = [
        "-",
        "  name: one",
        "- name: two",
        "-",
        "  name: three"
      ].join("\n");
      const node = parseOk(input);
      const seq = assertSequence(node, 3);
      const first = assertMap(seq.items[0], 1);
      assertScalar(input, first.properties[0].value, { value: "one" });
      const second = assertMap(seq.items[1], 1);
      assertScalar(input, second.properties[0].value, { value: "two" });
      const third = assertMap(seq.items[2], 1);
      assertScalar(input, third.properties[0].value, { value: "three" });
    });
    test("sequence of multi-property mappings", () => {
      const input = [
        "products:",
        "  - name: Laptop",
        "    price: 999.99",
        "    in_stock: true",
        "  - name: Mouse",
        "    price: 25.50",
        "    in_stock: false"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const products = assertSequence(map.properties[0].value, 2);
      const laptop = assertMap(products.items[0], 3);
      assertScalar(input, laptop.properties[0].value, { value: "Laptop" });
      assertScalar(input, laptop.properties[1].value, { value: "999.99" });
      assertScalar(input, laptop.properties[2].value, { value: "true" });
      const mouse = assertMap(products.items[1], 3);
      assertScalar(input, mouse.properties[0].value, { value: "Mouse" });
      assertScalar(input, mouse.properties[1].value, { value: "25.50" });
      assertScalar(input, mouse.properties[2].value, { value: "false" });
    });
    test("flow sequence with mixed types", () => {
      const input = 'vals: [1, true, null, "str"]';
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const vals = assertSequence(map.properties[0].value, 4);
      assertScalar(input, vals.items[0], { value: "1" });
      assertScalar(input, vals.items[1], { value: "true" });
      assertScalar(input, vals.items[2], { value: "null" });
      assertScalar(input, vals.items[3], { value: "str", format: "double" });
    });
    test("flow map with nested flow sequence", () => {
      const input = 'config: {env: "prod", settings: [true, 42], debug: false}';
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const config = assertMap(map.properties[0].value, 3);
      assertScalar(input, config.properties[0].key, { value: "env" });
      assertScalar(input, config.properties[0].value, { value: "prod", format: "double" });
      const settings = assertSequence(config.properties[1].value, 2);
      assertScalar(input, settings.items[0], { value: "true" });
      assertScalar(input, settings.items[1], { value: "42" });
      assertScalar(input, config.properties[2].key, { value: "debug" });
      assertScalar(input, config.properties[2].value, { value: "false" });
    });
    test("full-line and inline comments", () => {
      const input = [
        "# This is a comment",
        "name: John Doe  # inline comment",
        "age: 30"
      ].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "name" });
      assertScalar(input, map.properties[0].value, { value: "John Doe" });
      assertScalar(input, map.properties[1].key, { value: "age" });
      assertScalar(input, map.properties[1].value, { value: "30" });
    });
    test("unexpected indentation with recovery", () => {
      const errors = [];
      const input = [
        "key: 1",
        "    stray: value"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "key" });
      assertScalar(input, map.properties[0].value, { value: "1" });
      assertScalar(input, map.properties[1].key, { value: "stray" });
      assertScalar(input, map.properties[1].value, { value: "value" });
      assert.ok(errors.some((e) => e.code === "unexpected-indentation"));
    });
    test("empty value followed by non-empty", () => {
      const input = [
        "empty:",
        "array: []"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "empty" });
      assertScalar(input, map.properties[0].value, { value: "" });
      assertScalar(input, map.properties[1].key, { value: "array" });
      const arr = assertSequence(map.properties[1].value, 0);
      assert.ok(arr);
    });
    test("nested mapping with empty value", () => {
      const input = [
        "parent:",
        "  child:"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      const parent = assertMap(map.properties[0].value, 1);
      assertScalar(input, parent.properties[0].key, { value: "child" });
      assertScalar(input, parent.properties[0].value, { value: "" });
    });
    test("multiple keys with empty values", () => {
      const errors = [];
      const input = [
        "key1:",
        "key2:",
        "key3:"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 3);
      assertScalar(input, map.properties[0].key, { value: "key1" });
      assertScalar(input, map.properties[0].value, { value: "" });
      assertScalar(input, map.properties[1].key, { value: "key2" });
      assertScalar(input, map.properties[1].value, { value: "" });
      assertScalar(input, map.properties[2].key, { value: "key3" });
      assertScalar(input, map.properties[2].value, { value: "" });
    });
    test("large input performance", () => {
      const lines = Array.from({ length: 1e3 }, (_, i) => `key${i}: value${i}`);
      const input = lines.join("\n");
      const start = Date.now();
      const node = parseOk(input);
      const duration = Date.now() - start;
      const map = assertMap(node, 1e3);
      assertScalar(input, map.properties[0].key, { value: "key0" });
      assertScalar(input, map.properties[999].key, { value: "key999" });
      assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
    });
    test("deeply nested structure performance", () => {
      const lines = [];
      for (let i = 0; i < 50; i++) {
        lines.push("  ".repeat(i) + `level${i}:`);
      }
      lines.push("  ".repeat(50) + "deepValue: reached");
      const input = lines.join("\n");
      const start = Date.now();
      const errors = [];
      const result = parse(input, errors);
      const duration = Date.now() - start;
      assert.ok(result);
      assert.strictEqual(result.type, "map");
      assert.ok(duration < 500, `Parsing took ${duration}ms, expected < 500ms`);
    });
    test("unclosed flow sequence with empty lines", () => {
      const errors = [];
      const input = [
        "key: [",
        "",
        "",
        "",
        ""
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "key" });
      const seq = map.properties[0].value;
      assert.strictEqual(seq.type, "sequence");
      assert.strictEqual(seq.items.length, 0);
    });
    test("deeply nested same-named keys", () => {
      const input = [
        "a:",
        "  b:",
        "    a:",
        "      b:",
        "        value: test"
      ].join("\n");
      const node = parseOk(input);
      const outerA = assertMap(node, 1);
      assertScalar(input, outerA.properties[0].key, { value: "a" });
      const outerB = assertMap(outerA.properties[0].value, 1);
      assertScalar(input, outerB.properties[0].key, { value: "b" });
      const innerA = assertMap(outerB.properties[0].value, 1);
      assertScalar(input, innerA.properties[0].key, { value: "a" });
      const innerB = assertMap(innerA.properties[0].value, 1);
      assertScalar(input, innerB.properties[0].key, { value: "b" });
      const leaf = assertMap(innerB.properties[0].value, 1);
      assertScalar(input, leaf.properties[0].key, { value: "value" });
      assertScalar(input, leaf.properties[0].value, { value: "test" });
    });
    test("flow sequence with empty lines between items", () => {
      const input = ["arr: [", "", "item1,", "", "item2", "", "]"].join("\n");
      const node = parseOk(input);
      const map = assertMap(node, 1);
      const seq = assertSequence(map.properties[0].value, 2);
      assertScalar(input, seq.items[0], { value: "item1" });
      assertScalar(input, seq.items[1], { value: "item2" });
    });
    test("excessive whitespace after colon", () => {
      const input = "key:      value";
      const node = parseOk(input);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].value, { value: "value" });
    });
    test("unclosed double quote", () => {
      const input = 'name: "John';
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "name" });
      assertScalar(input, map.properties[0].value, { value: "John" });
    });
    test("unclosed single quote", () => {
      const input = `description: 'Hello world`;
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 1);
      assertScalar(input, map.properties[0].key, { value: "description" });
      assertScalar(input, map.properties[0].value, { value: "Hello world" });
    });
    test("comment in unclosed flow sequence", () => {
      const input = [
        "mode: agent",
        "tools: [#r"
      ].join("\n");
      const errors = [];
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].key, { value: "mode" });
      assertScalar(input, map.properties[0].value, { value: "agent" });
      assertScalar(input, map.properties[1].key, { value: "tools" });
      const seq = map.properties[1].value;
      assert.strictEqual(seq.type, "sequence");
      assert.strictEqual(seq.items.length, 0);
    });
    test("duplicate keys emit error", () => {
      const errors = [];
      const input = [
        "key: 1",
        "key: 2"
      ].join("\n");
      const node = parse(input, errors);
      const map = assertMap(node, 2);
      assertScalar(input, map.properties[0].value, { value: "1" });
      assertScalar(input, map.properties[1].value, { value: "2" });
      assert.ok(errors.some((e) => e.code === "duplicate-key"));
    });
    test("duplicate keys allowed via option", () => {
      const errors = [];
      const input = [
        "key: 1",
        "key: 2"
      ].join("\n");
      const node = parse(input, errors, { allowDuplicateKeys: true });
      assertMap(node, 2);
      assert.strictEqual(errors.length, 0);
    });
  });
  suite("parseMarkdown", () => {
    test("no frontmatter returns undefined header and full input as body", () => {
      const input = "Just some markdown text\nwithout frontmatter.";
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, input);
    });
    test("empty input returns undefined header and empty body", () => {
      const result = parseFrontMatter("");
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "");
    });
    test("frontmatter with body", () => {
      const input = [
        "---",
        "title: Hello",
        "author: World",
        "---",
        "# Heading",
        "Body text here."
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      const map = assertMap(result.header, 2);
      assert.strictEqual(map.properties[0].value.value, "Hello");
      assert.strictEqual(map.properties[1].value.value, "World");
      assert.strictEqual(result.getStringValue("title"), "Hello");
      assert.strictEqual(result.getStringValue("author"), "World");
      assert.strictEqual(result.body, "# Heading\nBody text here.");
    });
    test("frontmatter only, no body", () => {
      const input = [
        "---",
        "key: value",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      const map = assertMap(result.header, 1);
      assert.strictEqual(map.properties[0].value.value, "value");
      assert.strictEqual(result.getStringValue("key"), "value");
      assert.strictEqual(result.body, "");
    });
    test("empty frontmatter strips delimiters", () => {
      const input = [
        "---",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "");
    });
    test("comment-only frontmatter strips delimiters and preserves body", () => {
      const input = [
        "---",
        "# note",
        "---",
        "Body text here."
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.header, void 0);
      assert.strictEqual(result.body, "Body text here.");
    });
    test("getStringValue returns the scalar for a known key", () => {
      const input = [
        "---",
        "name: my-agent",
        "tools: foo, bar",
        "---",
        "body content"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.strictEqual(result.getStringValue("name"), "my-agent");
      assert.deepStrictEqual(result.getStringArrayValue("tools"), ["foo", "bar"]);
    });
    test("getStringArrayValue returns array for a sequence key", () => {
      const input = [
        "---",
        "tags:",
        "  - foo",
        "  - bar",
        "  - baz",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo", "bar", "baz"]);
    });
    test("getStringArrayValue splits comma-separated scalar into array", () => {
      const input = [
        "---",
        "tags: foo, bar, baz",
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo", "bar", "baz"]);
    });
    test("getStringArrayValue wraps quoted scalars in a single-element array", () => {
      const input = [
        "---",
        'tags: "foo, bar"',
        "---"
      ].join("\n");
      const result = parseFrontMatter(input);
      assert.ok(result);
      assert.deepStrictEqual(result.getStringArrayValue("tags"), ["foo, bar"]);
    });
  });
  suite("parseCommaSeparatedList", () => {
    test("empty string produces empty array", () => {
      const items = parseCommaSeparatedList("");
      assert.deepStrictEqual(items, []);
    });
    test("single unquoted item", () => {
      const items = parseCommaSeparatedList("hello", 0);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].value, "hello");
      assert.strictEqual(items[0].format, "none");
    });
    test("multiple unquoted items", () => {
      const items = parseCommaSeparatedList("foo, bar, baz");
      assert.deepStrictEqual(items.map((i) => i.value), ["foo", "bar", "baz"]);
    });
    test("double-quoted items", () => {
      const items = parseCommaSeparatedList('"hello", "world"', 0);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "hello");
      assert.strictEqual(items[0].format, "double");
      assert.strictEqual(items[1].value, "world");
      assert.strictEqual(items[1].format, "double");
    });
    test("single-quoted items", () => {
      const items = parseCommaSeparatedList(`'foo', 'bar'`, 0);
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "foo");
      assert.strictEqual(items[0].format, "single");
      assert.strictEqual(items[1].value, "bar");
      assert.strictEqual(items[1].format, "single");
    });
    test("mixed quoted and unquoted items", () => {
      const items = parseCommaSeparatedList(`plain, "double", 'single'`);
      assert.strictEqual(items.length, 3);
      assert.deepStrictEqual([items[0].value, items[0].format], ["plain", "none"]);
      assert.deepStrictEqual([items[1].value, items[1].format], ["double", "double"]);
      assert.deepStrictEqual([items[2].value, items[2].format], ["single", "single"]);
    });
    test("trailing whitespace trimmed from unquoted items", () => {
      const items = parseCommaSeparatedList("  foo  ,  bar  ");
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].value, "foo");
      assert.strictEqual(items[1].value, "bar");
    });
    test("offsets are relative to the provided offset", () => {
      const value = "a, b, c";
      const offset = 10;
      const items = parseCommaSeparatedList(value, offset);
      assert.strictEqual(items.length, 3);
      const doc = " ".repeat(offset) + value;
      for (const item of items) {
        assert.strictEqual(doc.substring(item.startOffset, item.endOffset), item.rawValue);
      }
    });
    test("whitespace-only string produces empty array", () => {
      const items = parseCommaSeparatedList("   ");
      assert.deepStrictEqual(items, []);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24veWFtbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBwYXJzZSwgcGFyc2VGcm9udE1hdHRlciwgcGFyc2VDb21tYVNlcGFyYXRlZExpc3QsIFlhbWxOb2RlLCBZYW1sU2NhbGFyTm9kZSwgWWFtbE1hcE5vZGUsIFlhbWxTZXF1ZW5jZU5vZGUsIFlhbWxQYXJzZUVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL3lhbWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbi8vIEhlbHBlciB0byBwYXJzZSBhbmQgYXNzZXJ0IG5vIGVycm9yc1xuZnVuY3Rpb24gcGFyc2VPayhpbnB1dDogc3RyaW5nKTogWWFtbE5vZGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0Y29uc3QgcmVzdWx0ID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyb3JzLCBbXSwgYFVuZXhwZWN0ZWQgZXJyb3JzOiAke0pTT04uc3RyaW5naWZ5KGVycm9ycyl9YCk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8vIEhlbHBlciB0byBhc3NlcnQgYSBzY2FsYXIgbm9kZSBhbmQgdmVyaWZ5IGl0cyBvZmZzZXRzIG1hdGNoIHRoZSByYXcgdmFsdWUgaW4gdGhlIGlucHV0XG5mdW5jdGlvbiBhc3NlcnRTY2FsYXIoaW5wdXQ6IHN0cmluZywgbm9kZTogWWFtbE5vZGUgfCB1bmRlZmluZWQsIGV4cGVjdGVkOiB7IHZhbHVlOiBzdHJpbmc7IGZvcm1hdD86ICdzaW5nbGUnIHwgJ2RvdWJsZScgfCAnbm9uZScgfCAnbGl0ZXJhbCcgfCAnZm9sZGVkJyB9KTogdm9pZCB7XG5cdGFzc2VydC5vayhub2RlLCAnRXhwZWN0ZWQgYSBub2RlIGJ1dCBnb3QgdW5kZWZpbmVkJyk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnR5cGUsICdzY2FsYXInKTtcblx0Y29uc3Qgc2NhbGFyID0gbm9kZSBhcyBZYW1sU2NhbGFyTm9kZTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjYWxhci52YWx1ZSwgZXhwZWN0ZWQudmFsdWUpO1xuXHRpZiAoZXhwZWN0ZWQuZm9ybWF0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NhbGFyLmZvcm1hdCwgZXhwZWN0ZWQuZm9ybWF0KTtcblx0fVxuXHQvLyBWZXJpZnkgdGhhdCB0aGUgb2Zmc2V0cyBjb3JyZWN0bHkgY29ycmVzcG9uZCB0byB0aGUgcmF3VmFsdWUgaW4gdGhlIGlucHV0XG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRpbnB1dC5zdWJzdHJpbmcoc2NhbGFyLnN0YXJ0T2Zmc2V0LCBzY2FsYXIuZW5kT2Zmc2V0KSxcblx0XHRzY2FsYXIucmF3VmFsdWUsXG5cdFx0YE9mZnNldCBtaXNtYXRjaDogaW5wdXRbJHtzY2FsYXIuc3RhcnRPZmZzZXR9Li4ke3NjYWxhci5lbmRPZmZzZXR9XSBpcyBcIiR7aW5wdXQuc3Vic3RyaW5nKHNjYWxhci5zdGFydE9mZnNldCwgc2NhbGFyLmVuZE9mZnNldCl9XCIgYnV0IHJhd1ZhbHVlIGlzIFwiJHtzY2FsYXIucmF3VmFsdWV9XCJgXG5cdCk7XG59XG5cbi8vIEhlbHBlciB0byBhc3NlcnQgYSBtYXAgbm9kZSBhbmQgcmV0dXJuIHByb3BlcnRpZXMgZm9yIGZ1cnRoZXIgYXNzZXJ0aW9uc1xuZnVuY3Rpb24gYXNzZXJ0TWFwKG5vZGU6IFlhbWxOb2RlIHwgdW5kZWZpbmVkLCBleHBlY3RlZEtleUNvdW50OiBudW1iZXIpOiBZYW1sTWFwTm9kZSB7XG5cdGFzc2VydC5vayhub2RlLCAnRXhwZWN0ZWQgYSBub2RlIGJ1dCBnb3QgdW5kZWZpbmVkJyk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnR5cGUsICdtYXAnLCBgRXhwZWN0ZWQgbWFwIGJ1dCBnb3QgJHtub2RlLnR5cGV9YCk7XG5cdGNvbnN0IG1hcCA9IG5vZGUgYXMgWWFtbE1hcE5vZGU7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllcy5sZW5ndGgsIGV4cGVjdGVkS2V5Q291bnQsIGBFeHBlY3RlZCAke2V4cGVjdGVkS2V5Q291bnR9IHByb3BlcnRpZXMgYnV0IGdvdCAke21hcC5wcm9wZXJ0aWVzLmxlbmd0aH1gKTtcblx0cmV0dXJuIG1hcDtcbn1cblxuLy8gSGVscGVyIHRvIGFzc2VydCBhIHNlcXVlbmNlIG5vZGUgYW5kIHJldHVybiBpdGVtc1xuZnVuY3Rpb24gYXNzZXJ0U2VxdWVuY2Uobm9kZTogWWFtbE5vZGUgfCB1bmRlZmluZWQsIGV4cGVjdGVkSXRlbUNvdW50OiBudW1iZXIpOiBZYW1sU2VxdWVuY2VOb2RlIHtcblx0YXNzZXJ0Lm9rKG5vZGUsICdFeHBlY3RlZCBhIG5vZGUgYnV0IGdvdCB1bmRlZmluZWQnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUudHlwZSwgJ3NlcXVlbmNlJywgYEV4cGVjdGVkIHNlcXVlbmNlIGJ1dCBnb3QgJHtub2RlLnR5cGV9YCk7XG5cdGNvbnN0IHNlcSA9IG5vZGUgYXMgWWFtbFNlcXVlbmNlTm9kZTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcS5pdGVtcy5sZW5ndGgsIGV4cGVjdGVkSXRlbUNvdW50LCBgRXhwZWN0ZWQgJHtleHBlY3RlZEl0ZW1Db3VudH0gaXRlbXMgYnV0IGdvdCAke3NlcS5pdGVtcy5sZW5ndGh9YCk7XG5cdHJldHVybiBzZXE7XG59XG5cbnN1aXRlKCdZQU1MIFBhcnNlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnRW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU9rKCcnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB3aGl0ZXNwYWNlLW9ubHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VPaygnICAgJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgbmV3bGluZS1vbmx5IGlucHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlT2soJ1xcblxcbicpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnU2NhbGFycycsICgpID0+IHtcblx0XHR0ZXN0KCd1bnF1b3RlZCBzY2FsYXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdoZWxsbyB3b3JsZCc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG5vZGUsIHsgdmFsdWU6ICdoZWxsbyB3b3JsZCcsIGZvcm1hdDogJ25vbmUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGl0ZXJhbCBibG9jayBzY2FsYXIgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCd0ZXh0OiB8Jyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2xpbmUgb25lXFxubGluZSB0d29cXG4nLCBmb3JtYXQ6ICdsaXRlcmFsJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbGRlZCBibG9jayBzY2FsYXIgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCd0ZXh0OiA+Jyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2xpbmUgb25lIGxpbmUgdHdvXFxuJywgZm9ybWF0OiAnZm9sZGVkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpdGVyYWwgYmxvY2sgc2NhbGFyIHN0cmlwIGNob21waW5nICh8LSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3RleHQ6IHwtJyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2xpbmUgb25lXFxubGluZSB0d28nLCBmb3JtYXQ6ICdsaXRlcmFsJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpdGVyYWwgYmxvY2sgc2NhbGFyIGtlZXAgY2hvbXBpbmcgKHwrKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQndGV4dDogfCsnLFxuXHRcdFx0XHQnICBsaW5lIG9uZScsXG5cdFx0XHRcdCcgIGxpbmUgdHdvJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2xpbmUgb25lXFxubGluZSB0d29cXG4nLCBmb3JtYXQ6ICdsaXRlcmFsJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbGRlZCBibG9jayBzY2FsYXIgc3RyaXAgY2hvbXBpbmcgKD4tKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQndGV4dDogPi0nLFxuXHRcdFx0XHQnICBsaW5lIG9uZScsXG5cdFx0XHRcdCcgIGxpbmUgdHdvJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnbGluZSBvbmUgbGluZSB0d28nLCBmb3JtYXQ6ICdmb2xkZWQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9sZGVkIGJsb2NrIHNjYWxhciBrZWVwIGNob21waW5nICg+KyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3RleHQ6ID4rJyxcblx0XHRcdFx0JyAgbGluZSBvbmUnLFxuXHRcdFx0XHQnICBsaW5lIHR3bycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdsaW5lIG9uZSBsaW5lIHR3b1xcbicsIGZvcm1hdDogJ2ZvbGRlZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUtcXVvdGVkIHNjYWxhcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYCdoZWxsbyB3b3JsZCdgO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBub2RlLCB7IHZhbHVlOiAnaGVsbG8gd29ybGQnLCBmb3JtYXQ6ICdzaW5nbGUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlLXF1b3RlZCBzY2FsYXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdcImhlbGxvIHdvcmxkXCInO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBub2RlLCB7IHZhbHVlOiAnaGVsbG8gd29ybGQnLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlLXF1b3RlZCBzY2FsYXIgd2l0aCBlc2NhcGUgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnXCJoZWxsb1xcXFxud29ybGRcIic7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG5vZGUsIHsgdmFsdWU6ICdoZWxsb1xcbndvcmxkJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZS1xdW90ZWQgc2NhbGFyIHdpdGggZXNjYXBlZCBzaW5nbGUgcXVvdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGAnaXQnJ3MgYSB0ZXN0J2A7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG5vZGUsIHsgdmFsdWU6IGBpdCdzIGEgdGVzdGAsIGZvcm1hdDogJ3NpbmdsZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY2FsYXIgb2Zmc2V0cyBhcmUgY29ycmVjdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKCdoZWxsbycpIGFzIFlhbWxTY2FsYXJOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuZW5kT2Zmc2V0LCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0Jsb2NrIG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZSBrZXktdmFsdWUgcGFpcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ25hbWU6IEpvaG4gRG9lJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1swXS5rZXkudmFsdWUsICduYW1lJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obiBEb2UnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUga2V5LXZhbHVlIHBhaXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCduYW1lOiBKb2huIERvZScsXG5cdFx0XHRcdCdhZ2U6IDMwJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4gRG9lJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1sxXS5rZXkudmFsdWUsICdhZ2UnKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICczMCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXN0ZWQgbWFwcGluZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J25hbWU6IEpvaG4gRG9lJyxcblx0XHRcdFx0J2FnZTogMzAnLFxuXHRcdFx0XHQnbW90aGVyOicsXG5cdFx0XHRcdCcgIG5hbWU6IFN1c2kgRG9lJyxcblx0XHRcdFx0JyAgYWdlOiA1MCcsXG5cdFx0XHRcdCcgIGFkZHJlc3M6Jyxcblx0XHRcdFx0JyAgICBzdHJlZXQ6IDEyMyBNYWluIFN0Jyxcblx0XHRcdFx0JyAgICBjaXR5OiBFeGFtcGxlIENpdHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1swXS5rZXkudmFsdWUsICduYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMl0ua2V5LnZhbHVlLCAnbW90aGVyJyk7XG5cdFx0XHRjb25zdCBtb3RoZXIgPSBhc3NlcnRNYXAobWFwLnByb3BlcnRpZXNbMl0udmFsdWUsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vdGhlci5wcm9wZXJ0aWVzWzBdLmtleS52YWx1ZSwgJ25hbWUnKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbW90aGVyLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdTdXNpIERvZScgfSk7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gYXNzZXJ0TWFwKG1vdGhlci5wcm9wZXJ0aWVzWzJdLnZhbHVlLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRyZXNzLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnc3RyZWV0Jyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGFkZHJlc3MucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJzEyMyBNYWluIFN0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHBpbmcgd2l0aCBxdW90ZWQga2V5cyBhbmQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdcIm5hbWVcIjogXFwnSm9obiBEb2VcXCcnLFxuXHRcdFx0XHQnXFwnYWdlXFwnOiBcIjMwXCInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1swXS5rZXkuZm9ybWF0LCAnZG91YmxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlIGFzIFlhbWxTY2FsYXJOb2RlKS5mb3JtYXQsICdzaW5nbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHBpbmcgb2Zmc2V0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ25hbWU6IEpvaG4nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxNYXBOb2RlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUuZW5kT2Zmc2V0LCAxMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdCbG9jayBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlIHNlcXVlbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctIEFwcGxlJyxcblx0XHRcdFx0Jy0gQmFuYW5hJyxcblx0XHRcdFx0Jy0gQ2hlcnJ5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBzZXEgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzBdLCB7IHZhbHVlOiAnQXBwbGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMV0sIHsgdmFsdWU6ICdCYW5hbmEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMl0sIHsgdmFsdWU6ICdDaGVycnknIH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3BlYyBFeGFtcGxlIDIuNC4gU2VxdWVuY2Ugb2YgTWFwcGluZ3MgKDIyOVEpXG5cdFx0dGVzdCgnc3BlYyAyLjQgLSBzZXF1ZW5jZSBvZiBtYXBwaW5ncyAoMjI5USknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICBuYW1lOiBNYXJrIE1jR3dpcmUnLFxuXHRcdFx0XHQnICBocjogICA2NScsXG5cdFx0XHRcdCcgIGF2ZzogIDAuMjc4Jyxcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICBuYW1lOiBTYW1teSBTb3NhJyxcblx0XHRcdFx0JyAgaHI6ICAgNjMnLFxuXHRcdFx0XHQnICBhdmc6ICAwLjI4OCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMik7XG5cblx0XHRcdGNvbnN0IGZpcnN0ID0gYXNzZXJ0TWFwKHNlcS5pdGVtc1swXSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucHJvcGVydGllc1swXS5rZXkudmFsdWUsICduYW1lJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGZpcnN0LnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdNYXJrIE1jR3dpcmUnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnByb3BlcnRpZXNbMV0ua2V5LnZhbHVlLCAnaHInKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgZmlyc3QucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzY1JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wcm9wZXJ0aWVzWzJdLmtleS52YWx1ZSwgJ2F2ZycpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBmaXJzdC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAnMC4yNzgnIH0pO1xuXG5cdFx0XHRjb25zdCBzZWNvbmQgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzFdLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQucHJvcGVydGllc1swXS5rZXkudmFsdWUsICduYW1lJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlY29uZC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnU2FtbXkgU29zYScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnByb3BlcnRpZXNbMV0ua2V5LnZhbHVlLCAnaHInKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2Vjb25kLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICc2MycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnByb3BlcnRpZXNbMl0ua2V5LnZhbHVlLCAnYXZnJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlY29uZC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAnMC4yODgnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VxdWVuY2Ugb2YgbWFwcGluZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICBuYW1lOiBNYXJrIE1jR3dpcmUnLFxuXHRcdFx0XHQnICBocjogICA2NScsXG5cdFx0XHRcdCcgIGF2ZzogIDAuMjc4Jyxcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICBuYW1lOiBTYW1teSBTb3NhJyxcblx0XHRcdFx0JyAgaHI6ICAgNjMnLFxuXHRcdFx0XHQnICBhdmc6ICAwLjI4OCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMik7XG5cdFx0XHRjb25zdCBmaXJzdCA9IGFzc2VydE1hcChzZXEuaXRlbXNbMF0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBmaXJzdC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnTWFyayBNY0d3aXJlJyB9KTtcblx0XHRcdGNvbnN0IHNlY29uZCA9IGFzc2VydE1hcChzZXEuaXRlbXNbMV0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZWNvbmQucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ1NhbW15IFNvc2EnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwIG9mIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnYW1lcmljYW46Jyxcblx0XHRcdFx0JyAgLSBCb3N0b24gUmVkIFNveCcsXG5cdFx0XHRcdCcgIC0gRGV0cm9pdCBUaWdlcnMnLFxuXHRcdFx0XHQnICAtIE5ldyBZb3JrIFlhbmtlZXMnLFxuXHRcdFx0XHQnbmF0aW9uYWw6Jyxcblx0XHRcdFx0JyAgLSBOZXcgWW9yayBNZXRzJyxcblx0XHRcdFx0JyAgLSBDaGljYWdvIEN1YnMnLFxuXHRcdFx0XHQnICAtIEF0bGFudGEgQnJhdmVzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRjb25zdCBhbWVyaWNhbiA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgYW1lcmljYW4uaXRlbXNbMF0sIHsgdmFsdWU6ICdCb3N0b24gUmVkIFNveCcgfSk7XG5cdFx0XHRjb25zdCBuYXRpb25hbCA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbmF0aW9uYWwuaXRlbXNbMl0sIHsgdmFsdWU6ICdBdGxhbnRhIEJyYXZlcycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgbWFwcGluZyBhZnRlciBkYXNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctIG5hbWU6IE1hcmsgTWNHd2lyZScsXG5cdFx0XHRcdCcgIGhyOiA2NScsXG5cdFx0XHRcdCctIG5hbWU6IFNhbW15IFNvc2EnLFxuXHRcdFx0XHQnICBocjogNjMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzBdLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgZmlyc3QucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ01hcmsgTWNHd2lyZScgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdGbG93IG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZSBmbG93IG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICd7aHI6IDY1LCBhdmc6IDAuMjc4fSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnaHInKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICc2NScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMV0ua2V5LnZhbHVlLCAnYXZnJyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMC4yNzgnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxvdyBtYXBwaW5nIG9mZnNldHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICd7aHI6IDY1fSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbE1hcE5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5zdGFydE9mZnNldCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5lbmRPZmZzZXQsIDgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRmxvdyBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlIGZsb3cgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdbU2FtbXkgU29zYSAgLCA2MywgMC4yODhdJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMF0sIHsgdmFsdWU6ICdTYW1teSBTb3NhJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzFdLCB7IHZhbHVlOiAnNjMnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMl0sIHsgdmFsdWU6ICcwLjI4OCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IHNlcXVlbmNlIHdpdGggcXVvdGVkIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGBbICdTYW1teSBTb3NhJywgNjMsIDAuMjg4XWA7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBzZXEgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzBdLCB7IHZhbHVlOiAnU2FtbXkgU29zYScsIGZvcm1hdDogJ3NpbmdsZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IHNlcXVlbmNlIG9mZnNldHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdbYSwgYl0nO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxTZXF1ZW5jZU5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5zdGFydE9mZnNldCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5lbmRPZmZzZXQsIDYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTWl4ZWQgc3RydWN0dXJlcycsICgpID0+IHtcblx0XHR0ZXN0KCdvYmplY3Qgd2l0aCBzY2FsYXJzLCBhcnJheXMsIGlubGluZSBvYmplY3RzIGFuZCBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J29iamVjdDonLFxuXHRcdFx0XHQnICAgIHN0cmVldDogMTIzIE1haW4gU3QnLFxuXHRcdFx0XHQnICAgIGNpdHk6IFwiRXhhbXBsZSBDaXR5XCInLFxuXHRcdFx0XHQnYXJyYXk6Jyxcblx0XHRcdFx0JyAgLSBCb3N0b24gUmVkIFNveCcsXG5cdFx0XHRcdGAgIC0gJ0RldHJvaXQgVGlnZXJzJ2AsXG5cdFx0XHRcdCdpbmxpbmUgb2JqZWN0OiB7aHI6IDY1LCBhdmc6IDAuMjc4fScsXG5cdFx0XHRcdGBpbmxpbmUgYXJyYXk6IFsgJ1NhbW15IFNvc2EnLCA2MywgMC4yODhdYCxcblx0XHRcdFx0J2Jvb2w6IGZhbHNlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgNSk7XG5cblx0XHRcdC8vIE5lc3RlZCBvYmplY3Rcblx0XHRcdGNvbnN0IG9iaiA9IGFzc2VydE1hcChtYXAucHJvcGVydGllc1swXS52YWx1ZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG9iai5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnMTIzIE1haW4gU3QnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBvYmoucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJ0V4YW1wbGUgQ2l0eScsIGZvcm1hdDogJ2RvdWJsZScgfSk7XG5cblx0XHRcdC8vIEFycmF5XG5cdFx0XHRjb25zdCBhcnIgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGFyci5pdGVtc1swXSwgeyB2YWx1ZTogJ0Jvc3RvbiBSZWQgU294JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgYXJyLml0ZW1zWzFdLCB7IHZhbHVlOiAnRGV0cm9pdCBUaWdlcnMnLCBmb3JtYXQ6ICdzaW5nbGUnIH0pO1xuXG5cdFx0XHQvLyBJbmxpbmUgb2JqZWN0XG5cdFx0XHRjb25zdCBpbmxpbmVPYmogPSBhc3NlcnRNYXAobWFwLnByb3BlcnRpZXNbMl0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbmxpbmVPYmoucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJzY1JyB9KTtcblxuXHRcdFx0Ly8gSW5saW5lIGFycmF5XG5cdFx0XHRjb25zdCBpbmxpbmVBcnIgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1szXS52YWx1ZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGlubGluZUFyci5pdGVtc1swXSwgeyB2YWx1ZTogJ1NhbW15IFNvc2EnLCBmb3JtYXQ6ICdzaW5nbGUnIH0pO1xuXG5cdFx0XHQvLyBCb29sZWFuIGFzIHNjYWxhclxuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1s0XS52YWx1ZSwgeyB2YWx1ZTogJ2ZhbHNlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FycmF5cyBvZiBpbmxpbmUgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctIFtuYW1lICAgICAgICAsIGhyLCBhdmcgIF0nLFxuXHRcdFx0XHQnLSBbTWFyayBNY0d3aXJlLCA2NSwgMC4yNzhdJyxcblx0XHRcdFx0Jy0gW1NhbW15IFNvc2EgICwgNjMsIDAuMjg4XScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMyk7XG5cblx0XHRcdGNvbnN0IGhlYWRlciA9IGFzc2VydFNlcXVlbmNlKHNlcS5pdGVtc1swXSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGhlYWRlci5pdGVtc1swXSwgeyB2YWx1ZTogJ25hbWUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBoZWFkZXIuaXRlbXNbMV0sIHsgdmFsdWU6ICdocicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGhlYWRlci5pdGVtc1syXSwgeyB2YWx1ZTogJ2F2ZycgfSk7XG5cblx0XHRcdGNvbnN0IHJvdzEgPSBhc3NlcnRTZXF1ZW5jZShzZXEuaXRlbXNbMV0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCByb3cxLml0ZW1zWzBdLCB7IHZhbHVlOiAnTWFyayBNY0d3aXJlJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvbW1lbnRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbW1lbnQtb25seSBsaW5lcyBhcmUgaWdub3JlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnIyBUaGlzIGlzIGEgY29tbWVudCcsXG5cdFx0XHRcdCduYW1lOiBKb2huJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnByb3BlcnRpZXNbMF0ua2V5LnZhbHVlLCAnbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5saW5lIGNvbW1lbnQgYWZ0ZXIgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2hyOiAjIDE5OTggaHIgcmFua2luZycsXG5cdFx0XHRcdCcgIC0gTWFyayBNY0d3aXJlJyxcblx0XHRcdFx0JyAgLSBTYW1teSBTb3NhJyxcblx0XHRcdFx0J3JiaTonLFxuXHRcdFx0XHQnICAjIDE5OTggcmJpIHJhbmtpbmcnLFxuXHRcdFx0XHQnICAtIFNhbW15IFNvc2EnLFxuXHRcdFx0XHQnICAtIEtlbiBHcmlmZmV5I3BhcnQgb2YgdGhlIHZhbHVlLCBub3QgYSBjb21tZW50Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cblx0XHRcdGNvbnN0IGhyID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBoci5pdGVtc1swXSwgeyB2YWx1ZTogJ01hcmsgTWNHd2lyZScgfSk7XG5cblx0XHRcdGNvbnN0IHJiaSA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCAyKTtcblx0XHRcdC8vICcjJyB3aXRob3V0IGxlYWRpbmcgc3BhY2UgaXMgcGFydCBvZiB0aGUgdmFsdWVcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgcmJpLml0ZW1zWzFdLCB7IHZhbHVlOiAnS2VuIEdyaWZmZXkjcGFydCBvZiB0aGUgdmFsdWUsIG5vdCBhIGNvbW1lbnQnIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWlzc2luZyB2YWx1ZSBlbWl0cyBlcnJvciBhbmQgY3JlYXRlcyBlbXB0eSBzY2FsYXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnbmFtZTonLFxuXHRcdFx0XHQnYWdlOiAzMCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0XHRhc3NlcnQub2soZXJyb3JzLnNvbWUoZSA9PiBlLmNvZGUgPT09ICdtaXNzaW5nLXZhbHVlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGtleXMgZW1pdCBlcnJvcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnbmFtZTogSm9obicsXG5cdFx0XHRcdCduYW1lOiBKYW5lJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnQub2soZXJyb3JzLnNvbWUoZSA9PiBlLmNvZGUgPT09ICdkdXBsaWNhdGUta2V5JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGtleXMgYWxsb3dlZCB3aXRoIG9wdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yczogWWFtbFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCduYW1lOiBKb2huJyxcblx0XHRcdFx0J25hbWU6IEphbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzLCB7IGFsbG93RHVwbGljYXRlS2V5czogdHJ1ZSB9KTtcblx0XHRcdGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvcnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyb25nIGluZGVudGF0aW9uIGVtaXRzIGVycm9yIGJ1dCBzdGlsbCBwYXJzZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQncGFyZW50OicsXG5cdFx0XHRcdCcgIGNoaWxkMTogYScsXG5cdFx0XHRcdCcgICAgY2hpbGQyOiBiJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRhc3NlcnQub2sobm9kZSk7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSBwcm9kdWNlZCBhbiBpbmRlbnRhdGlvbiBlcnJvclxuXHRcdFx0YXNzZXJ0Lm9rKGVycm9ycy5zb21lKGUgPT4gZS5jb2RlID09PSAndW5leHBlY3RlZC1pbmRlbnRhdGlvbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ09mZnNldCB0cmFja2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdzY2FsYXIgb2Zmc2V0cyBpbiBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAna2V5OiB2YWx1ZSc7XG5cdFx0XHRjb25zdCBtYXAgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sTWFwTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAucHJvcGVydGllc1swXS5rZXkuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5wcm9wZXJ0aWVzWzBdLmtleS5lbmRPZmZzZXQsIDMpO1xuXHRcdFx0Y29uc3QgdmFsID0gbWFwLnByb3BlcnRpZXNbMF0udmFsdWUgYXMgWWFtbFNjYWxhck5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsLnN0YXJ0T2Zmc2V0LCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWwuZW5kT2Zmc2V0LCAxMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZzZXRzIGFyZSB6ZXJvLWJhc2VkIGFuZCBlbmRPZmZzZXQgaXMgZXhjbHVzaXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnXCJoaVwiJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sU2NhbGFyTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub2RlLmVuZE9mZnNldCwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS52YWx1ZSwgJ2hpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9kZS5yYXdWYWx1ZSwgJ1wiaGlcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VxdWVuY2UgaXRlbSBvZmZzZXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctIGEnLFxuXHRcdFx0XHQnLSBiJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBzZXEgPSBwYXJzZU9rKGlucHV0KSBhcyBZYW1sU2VxdWVuY2VOb2RlO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBzZXEuaXRlbXNbMF0gYXMgWWFtbFNjYWxhck5vZGU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Quc3RhcnRPZmZzZXQsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmVuZE9mZnNldCwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOZXN0ZWQgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jsb2NrIHNlcXVlbmNlIGluIGJsb2NrIHNlcXVlbmNlIChkYXNoLWRhc2gpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctIC0gczFfaTEnLFxuXHRcdFx0XHQnICAtIHMxX2kyJyxcblx0XHRcdFx0Jy0gczInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG91dGVyID0gYXNzZXJ0U2VxdWVuY2UocGFyc2VPayhpbnB1dCksIDIpO1xuXHRcdFx0Y29uc3QgaW5uZXIgPSBhc3NlcnRTZXF1ZW5jZShvdXRlci5pdGVtc1swXSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGlubmVyLml0ZW1zWzBdLCB7IHZhbHVlOiAnczFfaTEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbm5lci5pdGVtc1sxXSwgeyB2YWx1ZTogJ3MxX2kyJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgb3V0ZXIuaXRlbXNbMV0sIHsgdmFsdWU6ICdzMicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXF1ZW5jZSBhdCBzYW1lIGluZGVudCBhcyBwYXJlbnQgbWFwcGluZyBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J29uZTonLFxuXHRcdFx0XHQnLSAyJyxcblx0XHRcdFx0Jy0gMycsXG5cdFx0XHRcdCdmb3VyOiA1Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdvbmUnIH0pO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMF0sIHsgdmFsdWU6ICcyJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxLml0ZW1zWzFdLCB7IHZhbHVlOiAnMycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ2ZvdXInIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VxdWVuY2UgaW5kZW50ZWQgdW5kZXIgbWFwcGluZyBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2ZvbzonLFxuXHRcdFx0XHQnICAtIDQyJyxcblx0XHRcdFx0J2JhcjonLFxuXHRcdFx0XHQnICAtIDQ0Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDIpO1xuXHRcdFx0Y29uc3Qgc2VxMSA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2VxMS5pdGVtc1swXSwgeyB2YWx1ZTogJzQyJyB9KTtcblx0XHRcdGNvbnN0IHNlcTIgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcTIuaXRlbXNbMF0sIHsgdmFsdWU6ICc0NCcgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdNdWx0aWxpbmUgcGxhaW4gc2NhbGFycycsICgpID0+IHtcblx0XHR0ZXN0KCdtdWx0aWxpbmUgc2NhbGFyIGluIG1hcHBpbmcgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2E6IGInLFxuXHRcdFx0XHQnIGMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChwYXJzZU9rKGlucHV0KSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnYiBjJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgd2l0aCBtdWx0aXBsZSBjb250aW51YXRpb24gbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J3BsYWluOicsXG5cdFx0XHRcdCcgIFRoaXMgdW5xdW90ZWQgc2NhbGFyJyxcblx0XHRcdFx0JyAgc3BhbnMgbWFueSBsaW5lcy4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChwYXJzZU9rKGlucHV0KSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnVGhpcyB1bnF1b3RlZCBzY2FsYXIgc3BhbnMgbWFueSBsaW5lcy4nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciBhdCB0b3AgbGV2ZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2EnLFxuXHRcdFx0XHQnYicsXG5cdFx0XHRcdCcgIGMnLFxuXHRcdFx0XHQnZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHJlc3VsdCwgeyB2YWx1ZTogJ2EgYiBjIGQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciB3aXRoIGVtcHR5IGxpbmUgcHJlc2VydmVzIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2E6IHZhbDEnLFxuXHRcdFx0XHQnIHZhbDInLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyB2YWwzJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDEpO1xuXHRcdFx0Ly8gRW1wdHkgbGluZSBiZXR3ZWVuIHZhbDIgYW5kIHZhbDMgYmVjb21lcyBcXG5cblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd2YWwxIHZhbDJcXG52YWwzJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpbGluZSBzY2FsYXIgc3RvcHMgYXQgc2FtZSBpbmRlbnQgYXMgbWFwcGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnYTogYicsXG5cdFx0XHRcdCcgYycsXG5cdFx0XHRcdCdkOiBlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocGFyc2VPayhpbnB1dCksIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2IgYycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aWxpbmUgc2NhbGFyIHZhbHVlIG9uIG5leHQgbGluZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnYTonLFxuXHRcdFx0XHQnICBiJyxcblx0XHRcdFx0JyAgYycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdiIGMnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciBzdG9wcyBhdCBjb21tZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCd2YWx1ZTEnLFxuXHRcdFx0XHQnIyBhIGNvbW1lbnQnLFxuXHRcdFx0XHQndmFsdWUyJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBDb21tZW50IHRlcm1pbmF0ZXMgdGhlIHNjYWxhciBjb250aW51YXRpb24sIHNvIHZhbHVlMiBpcyBub3QgcGFydCBvZiB2YWx1ZTFcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCByZXN1bHQsIHsgdmFsdWU6ICd2YWx1ZTEnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlsaW5lIHNjYWxhciB3aXRoIG11bHRpcGxlIG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdhOiBiJyxcblx0XHRcdFx0JyBjJyxcblx0XHRcdFx0J2Q6Jyxcblx0XHRcdFx0JyBlJyxcblx0XHRcdFx0JyAgZicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHBhcnNlT2soaW5wdXQpLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdiIGMnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJ2UgZicgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbG9uIGluIHVucXVvdGVkIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAndXJsOiBodHRwOi8vZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgbWFwID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbE1hcE5vZGU7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnaHR0cDovL2V4YW1wbGUuY29tJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYWlsaW5nIHdoaXRlc3BhY2UgaXMgdHJpbW1lZCBmcm9tIHVucXVvdGVkIHNjYWxhcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICduYW1lOiBKb2huICAgJztcblx0XHRcdGNvbnN0IG1hcCA9IHBhcnNlT2soaW5wdXQpIGFzIFlhbWxNYXBOb2RlO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgZmxvdyBtYXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPaygne30nKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc3RhcnRPZmZzZXQsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5lbmRPZmZzZXQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgZmxvdyBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKCdbXScpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLnN0YXJ0T2Zmc2V0LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXEuZW5kT2Zmc2V0LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NSTEYgbGluZSBlbmRpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnbmFtZTogSm9oblxcclxcbmFnZTogMzAnO1xuXHRcdFx0Y29uc3QgbWFwID0gcGFyc2VPayhpbnB1dCkgYXMgWWFtbE1hcE5vZGU7XG5cdFx0XHRhc3NlcnRNYXAobWFwLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICczMCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSAtLS0gZG9jdW1lbnQgc2VwYXJhdG9yczogb25seSBmaXJzdCBkb2N1bWVudCBpcyBwYXJzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdrZXkxOiB2YWx1ZTEnLFxuXHRcdFx0XHQna2V5MjogdmFsdWUyJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdrZXkzOiB2YWx1ZTMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAna2V5MScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndmFsdWUxJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0ua2V5LCB7IHZhbHVlOiAna2V5MicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAndmFsdWUyJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ09sZCB0ZXN0IHN1aXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWFwcGluZyB2YWx1ZSBvbiBuZXh0IGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J25hbWU6Jyxcblx0XHRcdFx0JyAgSm9obiBEb2UnLFxuXHRcdFx0XHQnY29sb3JzOicsXG5cdFx0XHRcdCcgIFsgUmVkLCBHcmVlbiwgQmx1ZSBdJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obiBEb2UnIH0pO1xuXHRcdFx0Y29uc3QgY29sb3JzID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb2xvcnMuaXRlbXNbMF0sIHsgdmFsdWU6ICdSZWQnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb2xvcnMuaXRlbXNbMV0sIHsgdmFsdWU6ICdHcmVlbicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGNvbG9ycy5pdGVtc1syXSwgeyB2YWx1ZTogJ0JsdWUnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmxvdyBtYXAgd2l0aCBkaWZmZXJlbnQgZGF0YSB0eXBlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ3thY3RpdmU6IHRydWUsIHNjb3JlOiA4NS41LCByb2xlOiBudWxsfSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2FjdGl2ZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAndHJ1ZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ3Njb3JlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICc4NS41JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMl0ua2V5LCB7IHZhbHVlOiAncm9sZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAnbnVsbCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmbG93IG1hcCB3aXRoIHF1b3RlZCBrZXlzIGFuZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICd7XCJuYW1lXCI6IFwiSm9obiBEb2VcIiwgXCJhZ2VcIjogMzB9Jztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnbmFtZScsIGZvcm1hdDogJ2RvdWJsZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnSm9obiBEb2UnLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS5rZXksIHsgdmFsdWU6ICdhZ2UnLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzMwJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NwZWNpYWwgY2hhcmFjdGVycyBpbiB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGBrZXk6IHZhbHVlIHdpdGggXFx0IHNwZWNpYWwgY2hhcnNgO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogYHZhbHVlIHdpdGggXFx0IHNwZWNpYWwgY2hhcnNgIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFyaW91cyB3aGl0ZXNwYWNlIGFmdGVyIGNvbG9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBga2V5OlxcdCBcXHQgXFx0IHZhbHVlYDtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd2YWx1ZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmxpbmUgYXJyYXkgd2l0aCBjb21tZW50IGNvbnRpbnVhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnW29uZSAjIGNvbW1lbnQgYWJvdXQgdHdvJyxcblx0XHRcdFx0Jyx0d28sIHRocmVlXScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1swXSwgeyB2YWx1ZTogJ29uZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1sxXSwgeyB2YWx1ZTogJ3R3bycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1syXSwgeyB2YWx1ZTogJ3RocmVlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWxpbmUgZmxvdyBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnWycsXG5cdFx0XHRcdCcgICAgZ2VlbiwgJyxcblx0XHRcdFx0JyAgICB5ZWxsbywgcmVkXScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2Uobm9kZSwgMyk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1swXSwgeyB2YWx1ZTogJ2dlZW4nIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMV0sIHsgdmFsdWU6ICd5ZWxsbycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1syXSwgeyB2YWx1ZTogJ3JlZCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXN0ZWQgYmxvY2sgc2VxdWVuY2VzIChkYXNoIG9uIG5leHQgbGluZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0nLFxuXHRcdFx0XHQnICAtIEFwcGxlJyxcblx0XHRcdFx0JyAgLSBCYW5hbmEnLFxuXHRcdFx0XHQnICAtIENoZXJyeScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgb3V0ZXIgPSBhc3NlcnRTZXF1ZW5jZShub2RlLCAxKTtcblx0XHRcdGNvbnN0IGlubmVyID0gYXNzZXJ0U2VxdWVuY2Uob3V0ZXIuaXRlbXNbMF0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbm5lci5pdGVtc1swXSwgeyB2YWx1ZTogJ0FwcGxlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXIuaXRlbXNbMV0sIHsgdmFsdWU6ICdCYW5hbmEnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbm5lci5pdGVtc1syXSwgeyB2YWx1ZTogJ0NoZXJyeScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXN0ZWQgZmxvdyBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J1snLFxuXHRcdFx0XHQnICBbZWVdLCBbZmYsIGdnXScsXG5cdFx0XHRcdCddJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBvdXRlciA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhc3NlcnRTZXF1ZW5jZShvdXRlci5pdGVtc1swXSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGZpcnN0Lml0ZW1zWzBdLCB7IHZhbHVlOiAnZWUnIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXNzZXJ0U2VxdWVuY2Uob3V0ZXIuaXRlbXNbMV0sIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZWNvbmQuaXRlbXNbMF0sIHsgdmFsdWU6ICdmZicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlY29uZC5pdGVtc1sxXSwgeyB2YWx1ZTogJ2dnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHBpbmcgd2l0aCBzZXF1ZW5jZSBjb250YWluaW5nIGEgbWFwcGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnaXRlbXM6Jyxcblx0XHRcdFx0Jy0gbmFtZTogSm9obicsXG5cdFx0XHRcdCcgIGFnZTogMzAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnaXRlbXMnIH0pO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDEpO1xuXHRcdFx0Y29uc3QgaXRlbSA9IGFzc2VydE1hcChzZXEuaXRlbXNbMF0sIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpdGVtLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaXRlbS5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMzAnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VxdWVuY2Ugb2YgbWFwcGluZ3Mgd2l0aCB2YXJ5aW5nIHN0eWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLScsXG5cdFx0XHRcdCcgIG5hbWU6IG9uZScsXG5cdFx0XHRcdCctIG5hbWU6IHR3bycsXG5cdFx0XHRcdCctJyxcblx0XHRcdFx0JyAgbmFtZTogdGhyZWUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IHNlcSA9IGFzc2VydFNlcXVlbmNlKG5vZGUsIDMpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzBdLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgZmlyc3QucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ29uZScgfSk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzFdLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgc2Vjb25kLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd0d28nIH0pO1xuXHRcdFx0Y29uc3QgdGhpcmQgPSBhc3NlcnRNYXAoc2VxLml0ZW1zWzJdLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgdGhpcmQucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ3RocmVlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcXVlbmNlIG9mIG11bHRpLXByb3BlcnR5IG1hcHBpbmdzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdwcm9kdWN0czonLFxuXHRcdFx0XHQnICAtIG5hbWU6IExhcHRvcCcsXG5cdFx0XHRcdCcgICAgcHJpY2U6IDk5OS45OScsXG5cdFx0XHRcdCcgICAgaW5fc3RvY2s6IHRydWUnLFxuXHRcdFx0XHQnICAtIG5hbWU6IE1vdXNlJyxcblx0XHRcdFx0JyAgICBwcmljZTogMjUuNTAnLFxuXHRcdFx0XHQnICAgIGluX3N0b2NrOiBmYWxzZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0Y29uc3QgcHJvZHVjdHMgPSBhc3NlcnRTZXF1ZW5jZShtYXAucHJvcGVydGllc1swXS52YWx1ZSwgMik7XG5cdFx0XHRjb25zdCBsYXB0b3AgPSBhc3NlcnRNYXAocHJvZHVjdHMuaXRlbXNbMF0sIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBsYXB0b3AucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0xhcHRvcCcgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGxhcHRvcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnOTk5Ljk5JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbGFwdG9wLnByb3BlcnRpZXNbMl0udmFsdWUsIHsgdmFsdWU6ICd0cnVlJyB9KTtcblx0XHRcdGNvbnN0IG1vdXNlID0gYXNzZXJ0TWFwKHByb2R1Y3RzLml0ZW1zWzFdLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbW91c2UucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ01vdXNlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbW91c2UucHJvcGVydGllc1sxXS52YWx1ZSwgeyB2YWx1ZTogJzI1LjUwJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbW91c2UucHJvcGVydGllc1syXS52YWx1ZSwgeyB2YWx1ZTogJ2ZhbHNlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zsb3cgc2VxdWVuY2Ugd2l0aCBtaXhlZCB0eXBlcycsICgpID0+IHtcblx0XHRcdC8vIE5vdGU6IGN1cnJlbnQgcGFyc2VyIHRyZWF0cyBhbGwgdmFsdWVzIGFzIHNjYWxhcnMgKHN0cmluZ3MpLCBub3QgdHlwZWRcblx0XHRcdGNvbnN0IGlucHV0ID0gJ3ZhbHM6IFsxLCB0cnVlLCBudWxsLCBcInN0clwiXSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRjb25zdCB2YWxzID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDQpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCB2YWxzLml0ZW1zWzBdLCB7IHZhbHVlOiAnMScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHZhbHMuaXRlbXNbMV0sIHsgdmFsdWU6ICd0cnVlJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgdmFscy5pdGVtc1syXSwgeyB2YWx1ZTogJ251bGwnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCB2YWxzLml0ZW1zWzNdLCB7IHZhbHVlOiAnc3RyJywgZm9ybWF0OiAnZG91YmxlJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zsb3cgbWFwIHdpdGggbmVzdGVkIGZsb3cgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICdjb25maWc6IHtlbnY6IFwicHJvZFwiLCBzZXR0aW5nczogW3RydWUsIDQyXSwgZGVidWc6IGZhbHNlfSc7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2VPayhpbnB1dCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRjb25zdCBjb25maWcgPSBhc3NlcnRNYXAobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDMpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb25maWcucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdlbnYnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb25maWcucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ3Byb2QnLCBmb3JtYXQ6ICdkb3VibGUnIH0pO1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBhc3NlcnRTZXF1ZW5jZShjb25maWcucHJvcGVydGllc1sxXS52YWx1ZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNldHRpbmdzLml0ZW1zWzBdLCB7IHZhbHVlOiAndHJ1ZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNldHRpbmdzLml0ZW1zWzFdLCB7IHZhbHVlOiAnNDInIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBjb25maWcucHJvcGVydGllc1syXS5rZXksIHsgdmFsdWU6ICdkZWJ1ZycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIGNvbmZpZy5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAnZmFsc2UnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnVsbC1saW5lIGFuZCBpbmxpbmUgY29tbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0JyMgVGhpcyBpcyBhIGNvbW1lbnQnLFxuXHRcdFx0XHQnbmFtZTogSm9obiBEb2UgICMgaW5saW5lIGNvbW1lbnQnLFxuXHRcdFx0XHQnYWdlOiAzMCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICduYW1lJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICdKb2huIERvZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ2FnZScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnMzAnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5leHBlY3RlZCBpbmRlbnRhdGlvbiB3aXRoIHJlY292ZXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2tleTogMScsXG5cdFx0XHRcdCcgICAgc3RyYXk6IHZhbHVlJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2tleScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnMScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ3N0cmF5JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICd2YWx1ZScgfSk7XG5cdFx0XHQvLyBTaG91bGQgcmVwb3J0IGFuIGluZGVudGF0aW9uIGVycm9yXG5cdFx0XHRhc3NlcnQub2soZXJyb3JzLnNvbWUoZSA9PiBlLmNvZGUgPT09ICd1bmV4cGVjdGVkLWluZGVudGF0aW9uJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgdmFsdWUgZm9sbG93ZWQgYnkgbm9uLWVtcHR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdlbXB0eTonLFxuXHRcdFx0XHQnYXJyYXk6IFtdJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnZW1wdHknIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLmtleSwgeyB2YWx1ZTogJ2FycmF5JyB9KTtcblx0XHRcdGNvbnN0IGFyciA9IGFzc2VydFNlcXVlbmNlKG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCAwKTtcblx0XHRcdGFzc2VydC5vayhhcnIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIG1hcHBpbmcgd2l0aCBlbXB0eSB2YWx1ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQncGFyZW50OicsXG5cdFx0XHRcdCcgIGNoaWxkOicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBhc3NlcnRNYXAobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBwYXJlbnQucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdjaGlsZCcgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHBhcmVudC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGtleXMgd2l0aCBlbXB0eSB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQna2V5MTonLFxuXHRcdFx0XHQna2V5MjonLFxuXHRcdFx0XHQna2V5MzonLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAzKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAna2V5MScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlLCB7IHZhbHVlOiAnJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0ua2V5LCB7IHZhbHVlOiAna2V5MicgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlLCB7IHZhbHVlOiAnJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMl0ua2V5LCB7IHZhbHVlOiAna2V5MycgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzJdLnZhbHVlLCB7IHZhbHVlOiAnJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xhcmdlIGlucHV0IHBlcmZvcm1hbmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAwIH0sIChfLCBpKSA9PiBga2V5JHtpfTogdmFsdWUke2l9YCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnQ7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMTAwMCk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2tleTAnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1s5OTldLmtleSwgeyB2YWx1ZTogJ2tleTk5OScgfSk7XG5cdFx0XHRhc3NlcnQub2soZHVyYXRpb24gPCA1MDAsIGBQYXJzaW5nIHRvb2sgJHtkdXJhdGlvbn1tcywgZXhwZWN0ZWQgPCA1MDBtc2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVlcGx5IG5lc3RlZCBzdHJ1Y3R1cmUgcGVyZm9ybWFuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDsgaSsrKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goJyAgJy5yZXBlYXQoaSkgKyBgbGV2ZWwke2l9OmApO1xuXHRcdFx0fVxuXHRcdFx0bGluZXMucHVzaCgnICAnLnJlcGVhdCg1MCkgKyAnZGVlcFZhbHVlOiByZWFjaGVkJyk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsICdtYXAnKTtcblx0XHRcdGFzc2VydC5vayhkdXJhdGlvbiA8IDUwMCwgYFBhcnNpbmcgdG9vayAke2R1cmF0aW9ufW1zLCBleHBlY3RlZCA8IDUwMG1zYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmNsb3NlZCBmbG93IHNlcXVlbmNlIHdpdGggZW1wdHkgbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQna2V5OiBbJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdrZXknIH0pO1xuXHRcdFx0Y29uc3Qgc2VxID0gbWFwLnByb3BlcnRpZXNbMF0udmFsdWUgYXMgWWFtbFNlcXVlbmNlTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXEudHlwZSwgJ3NlcXVlbmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLml0ZW1zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWVwbHkgbmVzdGVkIHNhbWUtbmFtZWQga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnYTonLFxuXHRcdFx0XHQnICBiOicsXG5cdFx0XHRcdCcgICAgYTonLFxuXHRcdFx0XHQnICAgICAgYjonLFxuXHRcdFx0XHQnICAgICAgICB2YWx1ZTogdGVzdCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3Qgb3V0ZXJBID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBvdXRlckEucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdhJyB9KTtcblx0XHRcdGNvbnN0IG91dGVyQiA9IGFzc2VydE1hcChvdXRlckEucHJvcGVydGllc1swXS52YWx1ZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG91dGVyQi5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ2InIH0pO1xuXHRcdFx0Y29uc3QgaW5uZXJBID0gYXNzZXJ0TWFwKG91dGVyQi5wcm9wZXJ0aWVzWzBdLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgaW5uZXJBLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnYScgfSk7XG5cdFx0XHRjb25zdCBpbm5lckIgPSBhc3NlcnRNYXAoaW5uZXJBLnByb3BlcnRpZXNbMF0udmFsdWUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBpbm5lckIucHJvcGVydGllc1swXS5rZXksIHsgdmFsdWU6ICdiJyB9KTtcblx0XHRcdGNvbnN0IGxlYWYgPSBhc3NlcnRNYXAoaW5uZXJCLnByb3BlcnRpZXNbMF0udmFsdWUsIDEpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBsZWFmLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAndmFsdWUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBsZWFmLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd0ZXN0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zsb3cgc2VxdWVuY2Ugd2l0aCBlbXB0eSBsaW5lcyBiZXR3ZWVuIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbJ2FycjogWycsICcnLCAnaXRlbTEsJywgJycsICdpdGVtMicsICcnLCAnXSddLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlT2soaW5wdXQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKG5vZGUsIDEpO1xuXHRcdFx0Y29uc3Qgc2VxID0gYXNzZXJ0U2VxdWVuY2UobWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBzZXEuaXRlbXNbMF0sIHsgdmFsdWU6ICdpdGVtMScgfSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIHNlcS5pdGVtc1sxXSwgeyB2YWx1ZTogJ2l0ZW0yJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4Y2Vzc2l2ZSB3aGl0ZXNwYWNlIGFmdGVyIGNvbG9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAna2V5OiAgICAgIHZhbHVlJztcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZU9rKGlucHV0KTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICd2YWx1ZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmNsb3NlZCBkb3VibGUgcXVvdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9ICduYW1lOiBcIkpvaG4nO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMSk7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ25hbWUnIH0pO1xuXHRcdFx0Ly8gUGFyc2VyIHNob3VsZCByZWNvdmVyOiB2YWx1ZSBzaG91bGQgYmUgJ0pvaG4nIChzYW5zIHF1b3RlKVxuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0pvaG4nIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5jbG9zZWQgc2luZ2xlIHF1b3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgZGVzY3JpcHRpb246ICdIZWxsbyB3b3JsZGA7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAxKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0ua2V5LCB7IHZhbHVlOiAnZGVzY3JpcHRpb24nIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ0hlbGxvIHdvcmxkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbW1lbnQgaW4gdW5jbG9zZWQgZmxvdyBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnbW9kZTogYWdlbnQnLFxuXHRcdFx0XHQndG9vbHM6IFsjcicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBub2RlID0gcGFyc2UoaW5wdXQsIGVycm9ycyk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAobm9kZSwgMik7XG5cdFx0XHRhc3NlcnRTY2FsYXIoaW5wdXQsIG1hcC5wcm9wZXJ0aWVzWzBdLmtleSwgeyB2YWx1ZTogJ21vZGUnIH0pO1xuXHRcdFx0YXNzZXJ0U2NhbGFyKGlucHV0LCBtYXAucHJvcGVydGllc1swXS52YWx1ZSwgeyB2YWx1ZTogJ2FnZW50JyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0ua2V5LCB7IHZhbHVlOiAndG9vbHMnIH0pO1xuXHRcdFx0Y29uc3Qgc2VxID0gbWFwLnByb3BlcnRpZXNbMV0udmFsdWUgYXMgWWFtbFNlcXVlbmNlTm9kZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXEudHlwZSwgJ3NlcXVlbmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxLml0ZW1zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkdXBsaWNhdGUga2V5cyBlbWl0IGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBZYW1sUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0J2tleTogMScsXG5cdFx0XHRcdCdrZXk6IDInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG5vZGUgPSBwYXJzZShpbnB1dCwgZXJyb3JzKTtcblx0XHRcdGNvbnN0IG1hcCA9IGFzc2VydE1hcChub2RlLCAyKTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMF0udmFsdWUsIHsgdmFsdWU6ICcxJyB9KTtcblx0XHRcdGFzc2VydFNjYWxhcihpbnB1dCwgbWFwLnByb3BlcnRpZXNbMV0udmFsdWUsIHsgdmFsdWU6ICcyJyB9KTtcblx0XHRcdGFzc2VydC5vayhlcnJvcnMuc29tZShlID0+IGUuY29kZSA9PT0gJ2R1cGxpY2F0ZS1rZXknKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkdXBsaWNhdGUga2V5cyBhbGxvd2VkIHZpYSBvcHRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFlhbWxQYXJzZUVycm9yW10gPSBbXTtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQna2V5OiAxJyxcblx0XHRcdFx0J2tleTogMicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHBhcnNlKGlucHV0LCBlcnJvcnMsIHsgYWxsb3dEdXBsaWNhdGVLZXlzOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0TWFwKG5vZGUsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9ycy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VNYXJrZG93bicsICgpID0+IHtcblxuXHRcdHRlc3QoJ25vIGZyb250bWF0dGVyIHJldHVybnMgdW5kZWZpbmVkIGhlYWRlciBhbmQgZnVsbCBpbnB1dCBhcyBib2R5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnSnVzdCBzb21lIG1hcmtkb3duIHRleHRcXG53aXRob3V0IGZyb250bWF0dGVyLic7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5oZWFkZXIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmJvZHksIGlucHV0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGlucHV0IHJldHVybnMgdW5kZWZpbmVkIGhlYWRlciBhbmQgZW1wdHkgYm9keScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoJycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmhlYWRlciwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYm9keSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJvbnRtYXR0ZXIgd2l0aCBib2R5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQndGl0bGU6IEhlbGxvJyxcblx0XHRcdFx0J2F1dGhvcjogV29ybGQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0JyMgSGVhZGluZycsXG5cdFx0XHRcdCdCb2R5IHRleHQgaGVyZS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRjb25zdCBtYXAgPSBhc3NlcnRNYXAocmVzdWx0LmhlYWRlciwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1hcC5wcm9wZXJ0aWVzWzBdLnZhbHVlIGFzIFlhbWxTY2FsYXJOb2RlKS52YWx1ZSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1hcC5wcm9wZXJ0aWVzWzFdLnZhbHVlIGFzIFlhbWxTY2FsYXJOb2RlKS52YWx1ZSwgJ1dvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldFN0cmluZ1ZhbHVlKCd0aXRsZScpLCAnSGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZ2V0U3RyaW5nVmFsdWUoJ2F1dGhvcicpLCAnV29ybGQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYm9keSwgJyMgSGVhZGluZ1xcbkJvZHkgdGV4dCBoZXJlLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZnJvbnRtYXR0ZXIgb25seSwgbm8gYm9keScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2tleTogdmFsdWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0Y29uc3QgbWFwID0gYXNzZXJ0TWFwKHJlc3VsdC5oZWFkZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtYXAucHJvcGVydGllc1swXS52YWx1ZSBhcyBZYW1sU2NhbGFyTm9kZSkudmFsdWUsICd2YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdWYWx1ZSgna2V5JyksICd2YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ib2R5LCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBmcm9udG1hdHRlciBzdHJpcHMgZGVsaW1pdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VGcm9udE1hdHRlcihpbnB1dCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaGVhZGVyLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ib2R5LCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21tZW50LW9ubHkgZnJvbnRtYXR0ZXIgc3RyaXBzIGRlbGltaXRlcnMgYW5kIHByZXNlcnZlcyBib2R5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnIyBub3RlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5IHRleHQgaGVyZS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmhlYWRlciwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYm9keSwgJ0JvZHkgdGV4dCBoZXJlLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0U3RyaW5nVmFsdWUgcmV0dXJucyB0aGUgc2NhbGFyIGZvciBhIGtub3duIGtleScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LWFnZW50Jyxcblx0XHRcdFx0J3Rvb2xzOiBmb28sIGJhcicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnYm9keSBjb250ZW50Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUZyb250TWF0dGVyKGlucHV0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdWYWx1ZSgnbmFtZScpLCAnbXktYWdlbnQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmdldFN0cmluZ0FycmF5VmFsdWUoJ3Rvb2xzJyksIFsnZm9vJywgJ2JhciddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFN0cmluZ0FycmF5VmFsdWUgcmV0dXJucyBhcnJheSBmb3IgYSBzZXF1ZW5jZSBrZXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCd0YWdzOicsXG5cdFx0XHRcdCcgIC0gZm9vJyxcblx0XHRcdFx0JyAgLSBiYXInLFxuXHRcdFx0XHQnICAtIGJheicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdBcnJheVZhbHVlKCd0YWdzJyksIFsnZm9vJywgJ2JhcicsICdiYXonXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTdHJpbmdBcnJheVZhbHVlIHNwbGl0cyBjb21tYS1zZXBhcmF0ZWQgc2NhbGFyIGludG8gYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCd0YWdzOiBmb28sIGJhciwgYmF6Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VGcm9udE1hdHRlcihpbnB1dCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmdldFN0cmluZ0FycmF5VmFsdWUoJ3RhZ3MnKSwgWydmb28nLCAnYmFyJywgJ2JheiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFN0cmluZ0FycmF5VmFsdWUgd3JhcHMgcXVvdGVkIHNjYWxhcnMgaW4gYSBzaW5nbGUtZWxlbWVudCBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J3RhZ3M6IFwiZm9vLCBiYXJcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlRnJvbnRNYXR0ZXIoaW5wdXQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5nZXRTdHJpbmdBcnJheVZhbHVlKCd0YWdzJyksIFsnZm9vLCBiYXInXSk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZW1wdHkgc3RyaW5nIHByb2R1Y2VzIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCgnJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUgdW5xdW90ZWQgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QoJ2hlbGxvJywgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS52YWx1ZSwgJ2hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0uZm9ybWF0LCAnbm9uZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgdW5xdW90ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KCdmb28sIGJhciwgYmF6Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkudmFsdWUpLCBbJ2ZvbycsICdiYXInLCAnYmF6J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG91YmxlLXF1b3RlZCBpdGVtcycsICgpID0+IHtcblx0XHRcdC8vIFZhbHVlIGlzOiBcImhlbGxvXCIsIFwid29ybGRcIiAgXHUyMDE0IHBhc3MgaXQgZGlyZWN0bHkgYXMgYSBzdHJpbmcgd2l0aCBrbm93biBvZmZzZXQuXG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KCdcImhlbGxvXCIsIFwid29ybGRcIicsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0udmFsdWUsICdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmZvcm1hdCwgJ2RvdWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzFdLnZhbHVlLCAnd29ybGQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1sxXS5mb3JtYXQsICdkb3VibGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZS1xdW90ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KGAnZm9vJywgJ2JhcidgLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLnZhbHVlLCAnZm9vJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0uZm9ybWF0LCAnc2luZ2xlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0udmFsdWUsICdiYXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1sxXS5mb3JtYXQsICdzaW5nbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21peGVkIHF1b3RlZCBhbmQgdW5xdW90ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KGBwbGFpbiwgXCJkb3VibGVcIiwgJ3NpbmdsZSdgKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbaXRlbXNbMF0udmFsdWUsIGl0ZW1zWzBdLmZvcm1hdF0sIFsncGxhaW4nLCAnbm9uZSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2l0ZW1zWzFdLnZhbHVlLCBpdGVtc1sxXS5mb3JtYXRdLCBbJ2RvdWJsZScsICdkb3VibGUnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtpdGVtc1syXS52YWx1ZSwgaXRlbXNbMl0uZm9ybWF0XSwgWydzaW5nbGUnLCAnc2luZ2xlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkIGZyb20gdW5xdW90ZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KCcgIGZvbyAgLCAgYmFyICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLnZhbHVlLCAnZm9vJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0udmFsdWUsICdiYXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZnNldHMgYXJlIHJlbGF0aXZlIHRvIHRoZSBwcm92aWRlZCBvZmZzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9ICdhLCBiLCBjJztcblx0XHRcdGNvbnN0IG9mZnNldCA9IDEwO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh2YWx1ZSwgb2Zmc2V0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDMpO1xuXHRcdFx0Ly8gRWFjaCBpdGVtJ3MgcmF3VmFsdWUgc2hvdWxkIGFwcGVhciBhdCBzdGFydE9mZnNldCB3aXRoaW4gYG9mZnNldCArIHZhbHVlYFxuXHRcdFx0Y29uc3QgZG9jID0gJyAnLnJlcGVhdChvZmZzZXQpICsgdmFsdWU7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvYy5zdWJzdHJpbmcoaXRlbS5zdGFydE9mZnNldCwgaXRlbS5lbmRPZmZzZXQpLCBpdGVtLnJhd1ZhbHVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doaXRlc3BhY2Utb25seSBzdHJpbmcgcHJvZHVjZXMgZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KCcgICAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLE9BQU8sa0JBQWtCLCtCQUF3RztBQUMxSSxTQUFTLCtDQUErQztBQUd4RCxTQUFTLFFBQVEsT0FBcUM7QUFDckQsUUFBTSxTQUEyQixDQUFDO0FBQ2xDLFFBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTTtBQUNsQyxTQUFPLGdCQUFnQixRQUFRLENBQUMsR0FBRyxzQkFBc0IsS0FBSyxVQUFVLE1BQU0sQ0FBQyxFQUFFO0FBQ2pGLFNBQU87QUFDUjtBQUdBLFNBQVMsYUFBYSxPQUFlLE1BQTRCLFVBQWlHO0FBQ2pLLFNBQU8sR0FBRyxNQUFNLG1DQUFtQztBQUNuRCxTQUFPLFlBQVksS0FBSyxNQUFNLFFBQVE7QUFDdEMsUUFBTSxTQUFTO0FBQ2YsU0FBTyxZQUFZLE9BQU8sT0FBTyxTQUFTLEtBQUs7QUFDL0MsTUFBSSxTQUFTLFdBQVcsUUFBVztBQUNsQyxXQUFPLFlBQVksT0FBTyxRQUFRLFNBQVMsTUFBTTtBQUFBLEVBQ2xEO0FBRUEsU0FBTztBQUFBLElBQ04sTUFBTSxVQUFVLE9BQU8sYUFBYSxPQUFPLFNBQVM7QUFBQSxJQUNwRCxPQUFPO0FBQUEsSUFDUCwwQkFBMEIsT0FBTyxXQUFXLEtBQUssT0FBTyxTQUFTLFNBQVMsTUFBTSxVQUFVLE9BQU8sYUFBYSxPQUFPLFNBQVMsQ0FBQyxzQkFBc0IsT0FBTyxRQUFRO0FBQUEsRUFDcks7QUFDRDtBQUdBLFNBQVMsVUFBVSxN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
