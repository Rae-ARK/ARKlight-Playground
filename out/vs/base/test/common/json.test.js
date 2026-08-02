import assert from "assert";
import { createScanner, parse, ParseErrorCode, parseTree, ScanError, SyntaxKind } from "../../common/json.js";
import { getParseErrorMessage } from "../../common/jsonErrorMessages.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function assertKinds(text, ...kinds) {
  const scanner = createScanner(text);
  let kind;
  while ((kind = scanner.scan()) !== SyntaxKind.EOF) {
    assert.strictEqual(kind, kinds.shift());
  }
  assert.strictEqual(kinds.length, 0);
}
function assertScanError(text, expectedKind, scanError) {
  const scanner = createScanner(text);
  scanner.scan();
  assert.strictEqual(scanner.getToken(), expectedKind);
  assert.strictEqual(scanner.getTokenError(), scanError);
}
function assertValidParse(input, expected, options) {
  const errors = [];
  const actual = parse(input, errors, options);
  if (errors.length !== 0) {
    assert(false, getParseErrorMessage(errors[0].error));
  }
  assert.deepStrictEqual(actual, expected);
}
function assertInvalidParse(input, expected, options) {
  const errors = [];
  const actual = parse(input, errors, options);
  assert(errors.length > 0);
  assert.deepStrictEqual(actual, expected);
}
function assertTree(input, expected, expectedErrors = [], options) {
  const errors = [];
  const actual = parseTree(input, errors, options);
  assert.deepStrictEqual(errors.map((e) => e.error, expected), expectedErrors);
  const checkParent = (node) => {
    if (node.children) {
      for (const child of node.children) {
        assert.strictEqual(node, child.parent);
        delete child.parent;
        checkParent(child);
      }
    }
  };
  checkParent(actual);
  assert.deepStrictEqual(actual, expected);
}
suite("JSON", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tokens", () => {
    assertKinds("{", SyntaxKind.OpenBraceToken);
    assertKinds("}", SyntaxKind.CloseBraceToken);
    assertKinds("[", SyntaxKind.OpenBracketToken);
    assertKinds("]", SyntaxKind.CloseBracketToken);
    assertKinds(":", SyntaxKind.ColonToken);
    assertKinds(",", SyntaxKind.CommaToken);
  });
  test("comments", () => {
    assertKinds("// this is a comment", SyntaxKind.LineCommentTrivia);
    assertKinds("// this is a comment\n", SyntaxKind.LineCommentTrivia, SyntaxKind.LineBreakTrivia);
    assertKinds("/* this is a comment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \r\ncomment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \ncomment*/", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a", SyntaxKind.BlockCommentTrivia);
    assertKinds("/* this is a \ncomment", SyntaxKind.BlockCommentTrivia);
    assertKinds("/ ttt", SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
  });
  test("strings", () => {
    assertKinds('"test"', SyntaxKind.StringLiteral);
    assertKinds('"\\""', SyntaxKind.StringLiteral);
    assertKinds('"\\/"', SyntaxKind.StringLiteral);
    assertKinds('"\\b"', SyntaxKind.StringLiteral);
    assertKinds('"\\f"', SyntaxKind.StringLiteral);
    assertKinds('"\\n"', SyntaxKind.StringLiteral);
    assertKinds('"\\r"', SyntaxKind.StringLiteral);
    assertKinds('"\\t"', SyntaxKind.StringLiteral);
    assertKinds('"\\v"', SyntaxKind.StringLiteral);
    assertKinds('"\u88FF"', SyntaxKind.StringLiteral);
    assertKinds('"\u200B\u2028"', SyntaxKind.StringLiteral);
    assertKinds('"test', SyntaxKind.StringLiteral);
    assertKinds('"test\n"', SyntaxKind.StringLiteral, SyntaxKind.LineBreakTrivia, SyntaxKind.StringLiteral);
    assertScanError('"	"', SyntaxKind.StringLiteral, ScanError.InvalidCharacter);
    assertScanError('"	 "', SyntaxKind.StringLiteral, ScanError.InvalidCharacter);
  });
  test("numbers", () => {
    assertKinds("0", SyntaxKind.NumericLiteral);
    assertKinds("0.1", SyntaxKind.NumericLiteral);
    assertKinds("-0.1", SyntaxKind.NumericLiteral);
    assertKinds("-1", SyntaxKind.NumericLiteral);
    assertKinds("1", SyntaxKind.NumericLiteral);
    assertKinds("123456789", SyntaxKind.NumericLiteral);
    assertKinds("10", SyntaxKind.NumericLiteral);
    assertKinds("90", SyntaxKind.NumericLiteral);
    assertKinds("90E+123", SyntaxKind.NumericLiteral);
    assertKinds("90e+123", SyntaxKind.NumericLiteral);
    assertKinds("90e-123", SyntaxKind.NumericLiteral);
    assertKinds("90E-123", SyntaxKind.NumericLiteral);
    assertKinds("90E123", SyntaxKind.NumericLiteral);
    assertKinds("90e123", SyntaxKind.NumericLiteral);
    assertKinds("01", SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);
    assertKinds("-01", SyntaxKind.NumericLiteral, SyntaxKind.NumericLiteral);
    assertKinds("-", SyntaxKind.Unknown);
    assertKinds(".0", SyntaxKind.Unknown);
  });
  test("keywords: true, false, null", () => {
    assertKinds("true", SyntaxKind.TrueKeyword);
    assertKinds("false", SyntaxKind.FalseKeyword);
    assertKinds("null", SyntaxKind.NullKeyword);
    assertKinds(
      "true false null",
      SyntaxKind.TrueKeyword,
      SyntaxKind.Trivia,
      SyntaxKind.FalseKeyword,
      SyntaxKind.Trivia,
      SyntaxKind.NullKeyword
    );
    assertKinds("nulllll", SyntaxKind.Unknown);
    assertKinds("True", SyntaxKind.Unknown);
    assertKinds("foo-bar", SyntaxKind.Unknown);
    assertKinds("foo bar", SyntaxKind.Unknown, SyntaxKind.Trivia, SyntaxKind.Unknown);
  });
  test("trivia", () => {
    assertKinds(" ", SyntaxKind.Trivia);
    assertKinds("  	  ", SyntaxKind.Trivia);
    assertKinds("  	  \n  	  ", SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia);
    assertKinds("\r\n", SyntaxKind.LineBreakTrivia);
    assertKinds("\r", SyntaxKind.LineBreakTrivia);
    assertKinds("\n", SyntaxKind.LineBreakTrivia);
    assertKinds("\n\r", SyntaxKind.LineBreakTrivia, SyntaxKind.LineBreakTrivia);
    assertKinds("\n   \n", SyntaxKind.LineBreakTrivia, SyntaxKind.Trivia, SyntaxKind.LineBreakTrivia);
  });
  test("parse: literals", () => {
    assertValidParse("true", true);
    assertValidParse("false", false);
    assertValidParse("null", null);
    assertValidParse('"foo"', "foo");
    assertValidParse('"\\"-\\\\-\\/-\\b-\\f-\\n-\\r-\\t"', '"-\\-/-\b-\f-\n-\r-	');
    assertValidParse('"\\u00DC"', "\xDC");
    assertValidParse("9", 9);
    assertValidParse("-9", -9);
    assertValidParse("0.129", 0.129);
    assertValidParse("23e3", 23e3);
    assertValidParse("1.2E+3", 1200);
    assertValidParse("1.2E-3", 12e-4);
    assertValidParse("1.2E-3 // comment", 12e-4);
  });
  test("parse: objects", () => {
    assertValidParse("{}", {});
    assertValidParse('{ "foo": true }', { foo: true });
    assertValidParse('{ "bar": 8, "xoo": "foo" }', { bar: 8, xoo: "foo" });
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
    assertValidParse('{ "a": false, "b": true, "c": [ 7.4 ] }', { a: false, b: true, c: [7.4] });
    assertValidParse('{ "lineComment": "//", "blockComment": ["/*", "*/"], "brackets": [ ["{", "}"], ["[", "]"], ["(", ")"] ] }', { lineComment: "//", blockComment: ["/*", "*/"], brackets: [["{", "}"], ["[", "]"], ["(", ")"]] });
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} });
    assertValidParse('{ "hello": { "again": { "inside": 5 }, "world": 1 }}', { hello: { again: { inside: 5 }, world: 1 } });
    assertValidParse('{ "foo": /*hello*/true }', { foo: true });
  });
  test("parse: arrays", () => {
    assertValidParse("[]", []);
    assertValidParse("[ [],  [ [] ]]", [[], [[]]]);
    assertValidParse("[ 1, 2, 3 ]", [1, 2, 3]);
    assertValidParse('[ { "a": null } ]', [{ a: null }]);
  });
  test("parse: objects with errors", () => {
    assertInvalidParse("{,}", {});
    assertInvalidParse('{ "foo": true, }', { foo: true }, { allowTrailingComma: false });
    assertInvalidParse('{ "bar": 8 "xoo": "foo" }', { bar: 8, xoo: "foo" });
    assertInvalidParse('{ ,"bar": 8 }', { bar: 8 });
    assertInvalidParse('{ ,"bar": 8, "foo" }', { bar: 8 });
    assertInvalidParse('{ "bar": 8, "foo": }', { bar: 8 });
    assertInvalidParse('{ 8, "foo": 9 }', { foo: 9 });
  });
  test("parse: array with errors", () => {
    assertInvalidParse("[,]", []);
    assertInvalidParse("[ 1, 2, ]", [1, 2], { allowTrailingComma: false });
    assertInvalidParse("[ 1 2, 3 ]", [1, 2, 3]);
    assertInvalidParse("[ ,1, 2, 3 ]", [1, 2, 3]);
    assertInvalidParse("[ ,1, 2, 3, ]", [1, 2, 3], { allowTrailingComma: false });
  });
  test("parse: disallow commments", () => {
    const options = { disallowComments: true };
    assertValidParse('[ 1, 2, null, "foo" ]', [1, 2, null, "foo"], options);
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
    assertInvalidParse('{ "foo": /*comment*/ true }', { foo: true }, options);
  });
  test("parse: trailing comma", () => {
    assertValidParse('{ "hello": [], }', { hello: [] });
    let options = { allowTrailingComma: true };
    assertValidParse('{ "hello": [], }', { hello: [] }, options);
    assertValidParse('{ "hello": [] }', { hello: [] }, options);
    assertValidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
    assertValidParse('{ "hello": [], "world": {} }', { hello: [], world: {} }, options);
    assertValidParse('{ "hello": [1,] }', { hello: [1] }, options);
    options = { allowTrailingComma: false };
    assertInvalidParse('{ "hello": [], }', { hello: [] }, options);
    assertInvalidParse('{ "hello": [], "world": {}, }', { hello: [], world: {} }, options);
  });
  test("tree: literals", () => {
    assertTree("true", { type: "boolean", offset: 0, length: 4, value: true });
    assertTree("false", { type: "boolean", offset: 0, length: 5, value: false });
    assertTree("null", { type: "null", offset: 0, length: 4, value: null });
    assertTree("23", { type: "number", offset: 0, length: 2, value: 23 });
    assertTree("-1.93e-19", { type: "number", offset: 0, length: 9, value: -193e-21 });
    assertTree('"hello"', { type: "string", offset: 0, length: 7, value: "hello" });
  });
  test("tree: arrays", () => {
    assertTree("[]", { type: "array", offset: 0, length: 2, children: [] });
    assertTree("[ 1 ]", { type: "array", offset: 0, length: 5, children: [{ type: "number", offset: 2, length: 1, value: 1 }] });
    assertTree('[ 1,"x"]', {
      type: "array",
      offset: 0,
      length: 8,
      children: [
        { type: "number", offset: 2, length: 1, value: 1 },
        { type: "string", offset: 4, length: 3, value: "x" }
      ]
    });
    assertTree("[[]]", {
      type: "array",
      offset: 0,
      length: 4,
      children: [
        { type: "array", offset: 1, length: 2, children: [] }
      ]
    });
  });
  test("tree: objects", () => {
    assertTree("{ }", { type: "object", offset: 0, length: 3, children: [] });
    assertTree('{ "val": 1 }', {
      type: "object",
      offset: 0,
      length: 12,
      children: [
        {
          type: "property",
          offset: 2,
          length: 8,
          colonOffset: 7,
          children: [
            { type: "string", offset: 2, length: 5, value: "val" },
            { type: "number", offset: 9, length: 1, value: 1 }
          ]
        }
      ]
    });
    assertTree(
      '{"id": "$", "v": [ null, null] }',
      {
        type: "object",
        offset: 0,
        length: 32,
        children: [
          {
            type: "property",
            offset: 1,
            length: 9,
            colonOffset: 5,
            children: [
              { type: "string", offset: 1, length: 4, value: "id" },
              { type: "string", offset: 7, length: 3, value: "$" }
            ]
          },
          {
            type: "property",
            offset: 12,
            length: 18,
            colonOffset: 15,
            children: [
              { type: "string", offset: 12, length: 3, value: "v" },
              {
                type: "array",
                offset: 17,
                length: 13,
                children: [
                  { type: "null", offset: 19, length: 4, value: null },
                  { type: "null", offset: 25, length: 4, value: null }
                ]
              }
            ]
          }
        ]
      }
    );
    assertTree(
      '{  "id": { "foo": { } } , }',
      {
        type: "object",
        offset: 0,
        length: 27,
        children: [
          {
            type: "property",
            offset: 3,
            length: 20,
            colonOffset: 7,
            children: [
              { type: "string", offset: 3, length: 4, value: "id" },
              {
                type: "object",
                offset: 9,
                length: 14,
                children: [
                  {
                    type: "property",
                    offset: 11,
                    length: 10,
                    colonOffset: 16,
                    children: [
                      { type: "string", offset: 11, length: 5, value: "foo" },
                      { type: "object", offset: 18, length: 3, children: [] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      [ParseErrorCode.PropertyNameExpected, ParseErrorCode.ValueExpected],
      { allowTrailingComma: false }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNyZWF0ZVNjYW5uZXIsIE5vZGUsIHBhcnNlLCBQYXJzZUVycm9yLCBQYXJzZUVycm9yQ29kZSwgUGFyc2VPcHRpb25zLCBwYXJzZVRyZWUsIFNjYW5FcnJvciwgU3ludGF4S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IGdldFBhcnNlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2pzb25FcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5mdW5jdGlvbiBhc3NlcnRLaW5kcyh0ZXh0OiBzdHJpbmcsIC4uLmtpbmRzOiBTeW50YXhLaW5kW10pOiB2b2lkIHtcblx0Y29uc3Qgc2Nhbm5lciA9IGNyZWF0ZVNjYW5uZXIodGV4dCk7XG5cdGxldCBraW5kOiBTeW50YXhLaW5kO1xuXHR3aGlsZSAoKGtpbmQgPSBzY2FubmVyLnNjYW4oKSkgIT09IFN5bnRheEtpbmQuRU9GKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGtpbmQsIGtpbmRzLnNoaWZ0KCkpO1xuXHR9XG5cdGFzc2VydC5zdHJpY3RFcXVhbChraW5kcy5sZW5ndGgsIDApO1xufVxuZnVuY3Rpb24gYXNzZXJ0U2NhbkVycm9yKHRleHQ6IHN0cmluZywgZXhwZWN0ZWRLaW5kOiBTeW50YXhLaW5kLCBzY2FuRXJyb3I6IFNjYW5FcnJvcik6IHZvaWQge1xuXHRjb25zdCBzY2FubmVyID0gY3JlYXRlU2Nhbm5lcih0ZXh0KTtcblx0c2Nhbm5lci5zY2FuKCk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLmdldFRva2VuKCksIGV4cGVjdGVkS2luZCk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzY2FubmVyLmdldFRva2VuRXJyb3IoKSwgc2NhbkVycm9yKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VmFsaWRQYXJzZShpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogYW55LCBvcHRpb25zPzogUGFyc2VPcHRpb25zKTogdm9pZCB7XG5cdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdGNvbnN0IGFjdHVhbCA9IHBhcnNlKGlucHV0LCBlcnJvcnMsIG9wdGlvbnMpO1xuXG5cdGlmIChlcnJvcnMubGVuZ3RoICE9PSAwKSB7XG5cdFx0YXNzZXJ0KGZhbHNlLCBnZXRQYXJzZUVycm9yTWVzc2FnZShlcnJvcnNbMF0uZXJyb3IpKTtcblx0fVxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRJbnZhbGlkUGFyc2UoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IGFueSwgb3B0aW9ucz86IFBhcnNlT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRjb25zdCBhY3R1YWwgPSBwYXJzZShpbnB1dCwgZXJyb3JzLCBvcHRpb25zKTtcblxuXHRhc3NlcnQoZXJyb3JzLmxlbmd0aCA+IDApO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRUcmVlKGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBhbnksIGV4cGVjdGVkRXJyb3JzOiBudW1iZXJbXSA9IFtdLCBvcHRpb25zPzogUGFyc2VPcHRpb25zKTogdm9pZCB7XG5cdGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdGNvbnN0IGFjdHVhbCA9IHBhcnNlVHJlZShpbnB1dCwgZXJyb3JzLCBvcHRpb25zKTtcblxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVycm9ycy5tYXAoZSA9PiBlLmVycm9yLCBleHBlY3RlZCksIGV4cGVjdGVkRXJyb3JzKTtcblx0Y29uc3QgY2hlY2tQYXJlbnQgPSAobm9kZTogTm9kZSkgPT4ge1xuXHRcdGlmIChub2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vZGUsIGNoaWxkLnBhcmVudCk7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRkZWxldGUgKDxhbnk+Y2hpbGQpLnBhcmVudDsgLy8gZGVsZXRlIHRvIGF2b2lkIHJlY3Vyc2lvbiBpbiBkZWVwIGVxdWFsXG5cdFx0XHRcdGNoZWNrUGFyZW50KGNoaWxkKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cdGNoZWNrUGFyZW50KGFjdHVhbCk7XG5cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcbn1cblxuc3VpdGUoJ0pTT04nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndG9rZW5zJywgKCkgPT4ge1xuXHRcdGFzc2VydEtpbmRzKCd7JywgU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbik7XG5cdFx0YXNzZXJ0S2luZHMoJ30nLCBTeW50YXhLaW5kLkNsb3NlQnJhY2VUb2tlbik7XG5cdFx0YXNzZXJ0S2luZHMoJ1snLCBTeW50YXhLaW5kLk9wZW5CcmFja2V0VG9rZW4pO1xuXHRcdGFzc2VydEtpbmRzKCddJywgU3ludGF4S2luZC5DbG9zZUJyYWNrZXRUb2tlbik7XG5cdFx0YXNzZXJ0S2luZHMoJzonLCBTeW50YXhLaW5kLkNvbG9uVG9rZW4pO1xuXHRcdGFzc2VydEtpbmRzKCcsJywgU3ludGF4S2luZC5Db21tYVRva2VuKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWVudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0S2luZHMoJy8vIHRoaXMgaXMgYSBjb21tZW50JywgU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYSk7XG5cdFx0YXNzZXJ0S2luZHMoJy8vIHRoaXMgaXMgYSBjb21tZW50XFxuJywgU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYSwgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcvKiB0aGlzIGlzIGEgY29tbWVudCovJywgU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcvKiB0aGlzIGlzIGEgXFxyXFxuY29tbWVudCovJywgU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcvKiB0aGlzIGlzIGEgXFxuY29tbWVudCovJywgU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpO1xuXG5cdFx0Ly8gdW5leHBlY3RlZCBlbmRcblx0XHRhc3NlcnRLaW5kcygnLyogdGhpcyBpcyBhJywgU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcvKiB0aGlzIGlzIGEgXFxuY29tbWVudCcsIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKTtcblxuXHRcdC8vIGJyb2tlbiBjb21tZW50XG5cdFx0YXNzZXJ0S2luZHMoJy8gdHR0JywgU3ludGF4S2luZC5Vbmtub3duLCBTeW50YXhLaW5kLlRyaXZpYSwgU3ludGF4S2luZC5Vbmtub3duKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaW5ncycsICgpID0+IHtcblx0XHRhc3NlcnRLaW5kcygnXCJ0ZXN0XCInLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCdcIlxcXFxcIlwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcL1wiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcYlwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcZlwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcblwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcclwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcdFwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXFxcdlwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnXCJcXHU4OGZmXCInLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCdcIlx1MjAwQlxcdTIwMjhcIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cblx0XHQvLyB1bmV4cGVjdGVkIGVuZFxuXHRcdGFzc2VydEtpbmRzKCdcInRlc3QnLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCdcInRlc3RcXG5cIicsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCwgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEsIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbCk7XG5cblx0XHQvLyBpbnZhbGlkIGNoYXJhY3RlcnNcblx0XHRhc3NlcnRTY2FuRXJyb3IoJ1wiXFx0XCInLCBTeW50YXhLaW5kLlN0cmluZ0xpdGVyYWwsIFNjYW5FcnJvci5JbnZhbGlkQ2hhcmFjdGVyKTtcblx0XHRhc3NlcnRTY2FuRXJyb3IoJ1wiXFx0IFwiJywgU3ludGF4S2luZC5TdHJpbmdMaXRlcmFsLCBTY2FuRXJyb3IuSW52YWxpZENoYXJhY3Rlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ251bWJlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0S2luZHMoJzAnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnMC4xJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJy0wLjEnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnLTEnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnMScsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCcxMjM0NTY3ODknLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnMTAnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTAnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTBFKzEyMycsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCc5MGUrMTIzJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJzkwZS0xMjMnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTBFLTEyMycsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXHRcdGFzc2VydEtpbmRzKCc5MEUxMjMnLCBTeW50YXhLaW5kLk51bWVyaWNMaXRlcmFsKTtcblx0XHRhc3NlcnRLaW5kcygnOTBlMTIzJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cblx0XHQvLyB6ZXJvIGhhbmRsaW5nXG5cdFx0YXNzZXJ0S2luZHMoJzAxJywgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCwgU3ludGF4S2luZC5OdW1lcmljTGl0ZXJhbCk7XG5cdFx0YXNzZXJ0S2luZHMoJy0wMScsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwsIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWwpO1xuXG5cdFx0Ly8gdW5leHBlY3RlZCBlbmRcblx0XHRhc3NlcnRLaW5kcygnLScsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdFx0YXNzZXJ0S2luZHMoJy4wJywgU3ludGF4S2luZC5Vbmtub3duKTtcblx0fSk7XG5cblx0dGVzdCgna2V5d29yZHM6IHRydWUsIGZhbHNlLCBudWxsJywgKCkgPT4ge1xuXHRcdGFzc2VydEtpbmRzKCd0cnVlJywgU3ludGF4S2luZC5UcnVlS2V5d29yZCk7XG5cdFx0YXNzZXJ0S2luZHMoJ2ZhbHNlJywgU3ludGF4S2luZC5GYWxzZUtleXdvcmQpO1xuXHRcdGFzc2VydEtpbmRzKCdudWxsJywgU3ludGF4S2luZC5OdWxsS2V5d29yZCk7XG5cblxuXHRcdGFzc2VydEtpbmRzKCd0cnVlIGZhbHNlIG51bGwnLFxuXHRcdFx0U3ludGF4S2luZC5UcnVlS2V5d29yZCxcblx0XHRcdFN5bnRheEtpbmQuVHJpdmlhLFxuXHRcdFx0U3ludGF4S2luZC5GYWxzZUtleXdvcmQsXG5cdFx0XHRTeW50YXhLaW5kLlRyaXZpYSxcblx0XHRcdFN5bnRheEtpbmQuTnVsbEtleXdvcmQpO1xuXG5cdFx0Ly8gaW52YWxpZCB3b3Jkc1xuXHRcdGFzc2VydEtpbmRzKCdudWxsbGxsJywgU3ludGF4S2luZC5Vbmtub3duKTtcblx0XHRhc3NlcnRLaW5kcygnVHJ1ZScsIFN5bnRheEtpbmQuVW5rbm93bik7XG5cdFx0YXNzZXJ0S2luZHMoJ2Zvby1iYXInLCBTeW50YXhLaW5kLlVua25vd24pO1xuXHRcdGFzc2VydEtpbmRzKCdmb28gYmFyJywgU3ludGF4S2luZC5Vbmtub3duLCBTeW50YXhLaW5kLlRyaXZpYSwgU3ludGF4S2luZC5Vbmtub3duKTtcblx0fSk7XG5cblx0dGVzdCgndHJpdmlhJywgKCkgPT4ge1xuXHRcdGFzc2VydEtpbmRzKCcgJywgU3ludGF4S2luZC5Ucml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcgIFxcdCAgJywgU3ludGF4S2luZC5Ucml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCcgIFxcdCAgXFxuICBcXHQgICcsIFN5bnRheEtpbmQuVHJpdmlhLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSwgU3ludGF4S2luZC5Ucml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCdcXHJcXG4nLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSk7XG5cdFx0YXNzZXJ0S2luZHMoJ1xccicsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0XHRhc3NlcnRLaW5kcygnXFxuJywgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCdcXG5cXHInLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSwgU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEpO1xuXHRcdGFzc2VydEtpbmRzKCdcXG4gICBcXG4nLCBTeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYSwgU3ludGF4S2luZC5Ucml2aWEsIFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IGxpdGVyYWxzJywgKCkgPT4ge1xuXG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgndHJ1ZScsIHRydWUpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ2ZhbHNlJywgZmFsc2UpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ251bGwnLCBudWxsKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdcImZvb1wiJywgJ2ZvbycpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ1wiXFxcXFwiLVxcXFxcXFxcLVxcXFwvLVxcXFxiLVxcXFxmLVxcXFxuLVxcXFxyLVxcXFx0XCInLCAnXCItXFxcXC0vLVxcYi1cXGYtXFxuLVxcci1cXHQnKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdcIlxcXFx1MDBEQ1wiJywgJ1x1MDBEQycpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJzknLCA5KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCctOScsIC05KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCcwLjEyOScsIDAuMTI5KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCcyM2UzJywgMjNlMyk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnMS4yRSszJywgMS4yRSszKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCcxLjJFLTMnLCAxLjJFLTMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJzEuMkUtMyAvLyBjb21tZW50JywgMS4yRS0zKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IG9iamVjdHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgne30nLCB7fSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImZvb1wiOiB0cnVlIH0nLCB7IGZvbzogdHJ1ZSB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiYmFyXCI6IDgsIFwieG9vXCI6IFwiZm9vXCIgfScsIHsgYmFyOiA4LCB4b286ICdmb28nIH0pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbXSwgXCJ3b3JsZFwiOiB7fSB9JywgeyBoZWxsbzogW10sIHdvcmxkOiB7fSB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiYVwiOiBmYWxzZSwgXCJiXCI6IHRydWUsIFwiY1wiOiBbIDcuNCBdIH0nLCB7IGE6IGZhbHNlLCBiOiB0cnVlLCBjOiBbNy40XSB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwibGluZUNvbW1lbnRcIjogXCIvL1wiLCBcImJsb2NrQ29tbWVudFwiOiBbXCIvKlwiLCBcIiovXCJdLCBcImJyYWNrZXRzXCI6IFsgW1wie1wiLCBcIn1cIl0sIFtcIltcIiwgXCJdXCJdLCBbXCIoXCIsIFwiKVwiXSBdIH0nLCB7IGxpbmVDb21tZW50OiAnLy8nLCBibG9ja0NvbW1lbnQ6IFsnLyonLCAnKi8nXSwgYnJhY2tldHM6IFtbJ3snLCAnfSddLCBbJ1snLCAnXSddLCBbJygnLCAnKSddXSB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIFwid29ybGRcIjoge30gfScsIHsgaGVsbG86IFtdLCB3b3JsZDoge30gfSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IHsgXCJhZ2FpblwiOiB7IFwiaW5zaWRlXCI6IDUgfSwgXCJ3b3JsZFwiOiAxIH19JywgeyBoZWxsbzogeyBhZ2FpbjogeyBpbnNpZGU6IDUgfSwgd29ybGQ6IDEgfSB9KTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiZm9vXCI6IC8qaGVsbG8qL3RydWUgfScsIHsgZm9vOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZTogYXJyYXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ1tdJywgW10pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ1sgW10sICBbIFtdIF1dJywgW1tdLCBbW11dXSk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgnWyAxLCAyLCAzIF0nLCBbMSwgMiwgM10pO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ1sgeyBcImFcIjogbnVsbCB9IF0nLCBbeyBhOiBudWxsIH1dKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IG9iamVjdHMgd2l0aCBlcnJvcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7LH0nLCB7fSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7IFwiZm9vXCI6IHRydWUsIH0nLCB7IGZvbzogdHJ1ZSB9LCB7IGFsbG93VHJhaWxpbmdDb21tYTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7IFwiYmFyXCI6IDggXCJ4b29cIjogXCJmb29cIiB9JywgeyBiYXI6IDgsIHhvbzogJ2ZvbycgfSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7ICxcImJhclwiOiA4IH0nLCB7IGJhcjogOCB9KTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ3sgLFwiYmFyXCI6IDgsIFwiZm9vXCIgfScsIHsgYmFyOiA4IH0pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyBcImJhclwiOiA4LCBcImZvb1wiOiB9JywgeyBiYXI6IDggfSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7IDgsIFwiZm9vXCI6IDkgfScsIHsgZm9vOiA5IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZTogYXJyYXkgd2l0aCBlcnJvcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCdbLF0nLCBbXSk7XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCdbIDEsIDIsIF0nLCBbMSwgMl0sIHsgYWxsb3dUcmFpbGluZ0NvbW1hOiBmYWxzZSB9KTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ1sgMSAyLCAzIF0nLCBbMSwgMiwgM10pO1xuXHRcdGFzc2VydEludmFsaWRQYXJzZSgnWyAsMSwgMiwgMyBdJywgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ1sgLDEsIDIsIDMsIF0nLCBbMSwgMiwgM10sIHsgYWxsb3dUcmFpbGluZ0NvbW1hOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IGRpc2FsbG93IGNvbW1tZW50cycsICgpID0+IHtcblx0XHRjb25zdCBvcHRpb25zID0geyBkaXNhbGxvd0NvbW1lbnRzOiB0cnVlIH07XG5cblx0XHRhc3NlcnRWYWxpZFBhcnNlKCdbIDEsIDIsIG51bGwsIFwiZm9vXCIgXScsIFsxLCAyLCBudWxsLCAnZm9vJ10sIG9wdGlvbnMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbXSwgXCJ3b3JsZFwiOiB7fSB9JywgeyBoZWxsbzogW10sIHdvcmxkOiB7fSB9LCBvcHRpb25zKTtcblxuXHRcdGFzc2VydEludmFsaWRQYXJzZSgneyBcImZvb1wiOiAvKmNvbW1lbnQqLyB0cnVlIH0nLCB7IGZvbzogdHJ1ZSB9LCBvcHRpb25zKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2U6IHRyYWlsaW5nIGNvbW1hJywgKCkgPT4ge1xuXHRcdC8vIGRlZmF1bHQgaXMgYWxsb3dcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIH0nLCB7IGhlbGxvOiBbXSB9KTtcblxuXHRcdGxldCBvcHRpb25zID0geyBhbGxvd1RyYWlsaW5nQ29tbWE6IHRydWUgfTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIH0nLCB7IGhlbGxvOiBbXSB9LCBvcHRpb25zKTtcblx0XHRhc3NlcnRWYWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10gfScsIHsgaGVsbG86IFtdIH0sIG9wdGlvbnMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbXSwgXCJ3b3JsZFwiOiB7fSwgfScsIHsgaGVsbG86IFtdLCB3b3JsZDoge30gfSwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0VmFsaWRQYXJzZSgneyBcImhlbGxvXCI6IFtdLCBcIndvcmxkXCI6IHt9IH0nLCB7IGhlbGxvOiBbXSwgd29ybGQ6IHt9IH0sIG9wdGlvbnMpO1xuXHRcdGFzc2VydFZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbMSxdIH0nLCB7IGhlbGxvOiBbMV0gfSwgb3B0aW9ucyk7XG5cblx0XHRvcHRpb25zID0geyBhbGxvd1RyYWlsaW5nQ29tbWE6IGZhbHNlIH07XG5cdFx0YXNzZXJ0SW52YWxpZFBhcnNlKCd7IFwiaGVsbG9cIjogW10sIH0nLCB7IGhlbGxvOiBbXSB9LCBvcHRpb25zKTtcblx0XHRhc3NlcnRJbnZhbGlkUGFyc2UoJ3sgXCJoZWxsb1wiOiBbXSwgXCJ3b3JsZFwiOiB7fSwgfScsIHsgaGVsbG86IFtdLCB3b3JsZDoge30gfSwgb3B0aW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWU6IGxpdGVyYWxzJywgKCkgPT4ge1xuXHRcdGFzc2VydFRyZWUoJ3RydWUnLCB7IHR5cGU6ICdib29sZWFuJywgb2Zmc2V0OiAwLCBsZW5ndGg6IDQsIHZhbHVlOiB0cnVlIH0pO1xuXHRcdGFzc2VydFRyZWUoJ2ZhbHNlJywgeyB0eXBlOiAnYm9vbGVhbicsIG9mZnNldDogMCwgbGVuZ3RoOiA1LCB2YWx1ZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0VHJlZSgnbnVsbCcsIHsgdHlwZTogJ251bGwnLCBvZmZzZXQ6IDAsIGxlbmd0aDogNCwgdmFsdWU6IG51bGwgfSk7XG5cdFx0YXNzZXJ0VHJlZSgnMjMnLCB7IHR5cGU6ICdudW1iZXInLCBvZmZzZXQ6IDAsIGxlbmd0aDogMiwgdmFsdWU6IDIzIH0pO1xuXHRcdGFzc2VydFRyZWUoJy0xLjkzZS0xOScsIHsgdHlwZTogJ251bWJlcicsIG9mZnNldDogMCwgbGVuZ3RoOiA5LCB2YWx1ZTogLTEuOTNlLTE5IH0pO1xuXHRcdGFzc2VydFRyZWUoJ1wiaGVsbG9cIicsIHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMCwgbGVuZ3RoOiA3LCB2YWx1ZTogJ2hlbGxvJyB9KTtcblx0fSk7XG5cblx0dGVzdCgndHJlZTogYXJyYXlzJywgKCkgPT4ge1xuXHRcdGFzc2VydFRyZWUoJ1tdJywgeyB0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDAsIGxlbmd0aDogMiwgY2hpbGRyZW46IFtdIH0pO1xuXHRcdGFzc2VydFRyZWUoJ1sgMSBdJywgeyB0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDAsIGxlbmd0aDogNSwgY2hpbGRyZW46IFt7IHR5cGU6ICdudW1iZXInLCBvZmZzZXQ6IDIsIGxlbmd0aDogMSwgdmFsdWU6IDEgfV0gfSk7XG5cdFx0YXNzZXJ0VHJlZSgnWyAxLFwieFwiXScsIHtcblx0XHRcdHR5cGU6ICdhcnJheScsIG9mZnNldDogMCwgbGVuZ3RoOiA4LCBjaGlsZHJlbjogW1xuXHRcdFx0XHR7IHR5cGU6ICdudW1iZXInLCBvZmZzZXQ6IDIsIGxlbmd0aDogMSwgdmFsdWU6IDEgfSxcblx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgb2Zmc2V0OiA0LCBsZW5ndGg6IDMsIHZhbHVlOiAneCcgfVxuXHRcdFx0XVxuXHRcdH0pO1xuXHRcdGFzc2VydFRyZWUoJ1tbXV0nLCB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDAsIGxlbmd0aDogNCwgY2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDEsIGxlbmd0aDogMiwgY2hpbGRyZW46IFtdIH1cblx0XHRcdF1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJlZTogb2JqZWN0cycsICgpID0+IHtcblx0XHRhc3NlcnRUcmVlKCd7IH0nLCB7IHR5cGU6ICdvYmplY3QnLCBvZmZzZXQ6IDAsIGxlbmd0aDogMywgY2hpbGRyZW46IFtdIH0pO1xuXHRcdGFzc2VydFRyZWUoJ3sgXCJ2YWxcIjogMSB9Jywge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsIG9mZnNldDogMCwgbGVuZ3RoOiAxMiwgY2hpbGRyZW46IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsIG9mZnNldDogMiwgbGVuZ3RoOiA4LCBjb2xvbk9mZnNldDogNywgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMiwgbGVuZ3RoOiA1LCB2YWx1ZTogJ3ZhbCcgfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ251bWJlcicsIG9mZnNldDogOSwgbGVuZ3RoOiAxLCB2YWx1ZTogMSB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdFx0YXNzZXJ0VHJlZSgne1wiaWRcIjogXCIkXCIsIFwidlwiOiBbIG51bGwsIG51bGxdIH0nLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDMyLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsIG9mZnNldDogMSwgbGVuZ3RoOiA5LCBjb2xvbk9mZnNldDogNSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgb2Zmc2V0OiAxLCBsZW5ndGg6IDQsIHZhbHVlOiAnaWQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogNywgbGVuZ3RoOiAzLCB2YWx1ZTogJyQnIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsIG9mZnNldDogMTIsIGxlbmd0aDogMTgsIGNvbG9uT2Zmc2V0OiAxNSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgb2Zmc2V0OiAxMiwgbGVuZ3RoOiAzLCB2YWx1ZTogJ3YnIH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLCBvZmZzZXQ6IDE3LCBsZW5ndGg6IDEzLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbnVsbCcsIG9mZnNldDogMTksIGxlbmd0aDogNCwgdmFsdWU6IG51bGwgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ251bGwnLCBvZmZzZXQ6IDI1LCBsZW5ndGg6IDQsIHZhbHVlOiBudWxsIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHQpO1xuXHRcdGFzc2VydFRyZWUoJ3sgIFwiaWRcIjogeyBcImZvb1wiOiB7IH0gfSAsIH0nLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jywgb2Zmc2V0OiAwLCBsZW5ndGg6IDI3LCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsIG9mZnNldDogMywgbGVuZ3RoOiAyMCwgY29sb25PZmZzZXQ6IDcsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMywgbGVuZ3RoOiA0LCB2YWx1ZTogJ2lkJyB9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsIG9mZnNldDogOSwgbGVuZ3RoOiAxNCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3Byb3BlcnR5Jywgb2Zmc2V0OiAxMSwgbGVuZ3RoOiAxMCwgY29sb25PZmZzZXQ6IDE2LCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIG9mZnNldDogMTEsIGxlbmd0aDogNSwgdmFsdWU6ICdmb28nIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnb2JqZWN0Jywgb2Zmc2V0OiAxOCwgbGVuZ3RoOiAzLCBjaGlsZHJlbjogW10gfVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XHQsIFtQYXJzZUVycm9yQ29kZS5Qcm9wZXJ0eU5hbWVFeHBlY3RlZCwgUGFyc2VFcnJvckNvZGUuVmFsdWVFeHBlY3RlZF0sIHsgYWxsb3dUcmFpbGluZ0NvbW1hOiBmYWxzZSB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQXFCLE9BQW1CLGdCQUE4QixXQUFXLFdBQVcsa0JBQWtCO0FBQ3ZILFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsWUFBWSxTQUFpQixPQUEyQjtBQUNoRSxRQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLE1BQUk7QUFDSixVQUFRLE9BQU8sUUFBUSxLQUFLLE9BQU8sV0FBVyxLQUFLO0FBQ2xELFdBQU8sWUFBWSxNQUFNLE1BQU0sTUFBTSxDQUFDO0FBQUEsRUFDdkM7QUFDQSxTQUFPLFlBQVksTUFBTSxRQUFRLENBQUM7QUFDbkM7QUFDQSxTQUFTLGdCQUFnQixNQUFjLGNBQTBCLFdBQTRCO0FBQzVGLFFBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsVUFBUSxLQUFLO0FBQ2IsU0FBTyxZQUFZLFFBQVEsU0FBUyxHQUFHLFlBQVk7QUFDbkQsU0FBTyxZQUFZLFFBQVEsY0FBYyxHQUFHLFNBQVM7QUFDdEQ7QUFFQSxTQUFTLGlCQUFpQixPQUFlLFVBQWUsU0FBOEI7QUFDckYsUUFBTSxTQUF1QixDQUFDO0FBQzlCLFFBQU0sU0FBUyxNQUFNLE9BQU8sUUFBUSxPQUFPO0FBRTNDLE1BQUksT0FBTyxXQUFXLEdBQUc7QUFDeEIsV0FBTyxPQUFPLHFCQUFxQixPQUFPLENBQUMsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUNwRDtBQUNBLFNBQU8sZ0JBQWdCLFFBQVEsUUFBUTtBQUN4QztBQUVBLFNBQVMsbUJBQW1CLE9BQWUsVUFBZSxTQUE4QjtBQUN2RixRQUFNLFNBQXVCLENBQUM7QUFDOUIsUUFBTSxTQUFTLE1BQU0sT0FBTyxRQUFRLE9BQU87QUFFM0MsU0FBTyxPQUFPLFNBQVMsQ0FBQztBQUN4QixTQUFPLGdCQUFnQixRQUFRLFFB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
