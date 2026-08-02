import assert from "assert";
import * as Formatter from "../../common/jsonFormatter.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON - formatter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function format(content, expected, insertSpaces = true) {
    let range = void 0;
    const rangeStart = content.indexOf("|");
    const rangeEnd = content.lastIndexOf("|");
    if (rangeStart !== -1 && rangeEnd !== -1) {
      content = content.substring(0, rangeStart) + content.substring(rangeStart + 1, rangeEnd) + content.substring(rangeEnd + 1);
      range = { offset: rangeStart, length: rangeEnd - rangeStart };
    }
    const edits = Formatter.format(content, range, { tabSize: 2, insertSpaces, eol: "\n" });
    let lastEditOffset = content.length;
    for (let i = edits.length - 1; i >= 0; i--) {
      const edit = edits[i];
      assert(edit.offset >= 0 && edit.length >= 0 && edit.offset + edit.length <= content.length);
      assert(typeof edit.content === "string");
      assert(lastEditOffset >= edit.offset + edit.length);
      lastEditOffset = edit.offset;
      content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
    }
    assert.strictEqual(content, expected);
  }
  test("object - single property", () => {
    const content = [
      '{"x" : 1}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": 1',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - multiple properties", () => {
    const content = [
      '{"x" : 1,  "y" : "foo", "z"  : true}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": 1,',
      '  "y": "foo",',
      '  "z": true',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - no properties ", () => {
    const content = [
      '{"x" : {    },  "y" : {}}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": {},',
      '  "y": {}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("object - nesting", () => {
    const content = [
      '{"x" : {  "y" : { "z"  : { }}, "a": true}}'
    ].join("\n");
    const expected = [
      "{",
      '  "x": {',
      '    "y": {',
      '      "z": {}',
      "    },",
      '    "a": true',
      "  }",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("array - single items", () => {
    const content = [
      '["[]"]'
    ].join("\n");
    const expected = [
      "[",
      '  "[]"',
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("array - multiple items", () => {
    const content = [
      "[true,null,1.2]"
    ].join("\n");
    const expected = [
      "[",
      "  true,",
      "  null,",
      "  1.2",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("array - no items", () => {
    const content = [
      "[      ]"
    ].join("\n");
    const expected = [
      "[]"
    ].join("\n");
    format(content, expected);
  });
  test("array - nesting", () => {
    const content = [
      '[ [], [ [ {} ], "a" ]  ]'
    ].join("\n");
    const expected = [
      "[",
      "  [],",
      "  [",
      "    [",
      "      {}",
      "    ],",
      '    "a"',
      "  ]",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("syntax errors", () => {
    const content = [
      "[ null 1.2 ]"
    ].join("\n");
    const expected = [
      "[",
      "  null 1.2",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("empty lines", () => {
    const content = [
      "{",
      '"a": true,',
      "",
      '"b": true',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '	"a": true,',
      '	"b": true',
      "}"
    ].join("\n");
    format(content, expected, false);
  });
  test("single line comment", () => {
    const content = [
      "[ ",
      "//comment",
      '"foo", "bar"',
      "] "
    ].join("\n");
    const expected = [
      "[",
      "  //comment",
      '  "foo",',
      '  "bar"',
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("block line comment", () => {
    const content = [
      "[{",
      "        /*comment*/     ",
      '"foo" : true',
      "}] "
    ].join("\n");
    const expected = [
      "[",
      "  {",
      "    /*comment*/",
      '    "foo": true',
      "  }",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("single line comment on same line", () => {
    const content = [
      " {  ",
      '        "a": {}// comment    ',
      " } "
    ].join("\n");
    const expected = [
      "{",
      '  "a": {} // comment    ',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("single line comment on same line 2", () => {
    const content = [
      "{ //comment",
      "}"
    ].join("\n");
    const expected = [
      "{ //comment",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("block comment on same line", () => {
    const content = [
      '{      "a": {}, /*comment*/    ',
      '        /*comment*/ "b": {},    ',
      '        "c": {/*comment*/}    } '
    ].join("\n");
    const expected = [
      "{",
      '  "a": {}, /*comment*/',
      '  /*comment*/ "b": {},',
      '  "c": { /*comment*/}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("block comment on same line advanced", () => {
    const content = [
      ' {       "d": [',
      "             null",
      "        ] /*comment*/",
      '        ,"e": /*comment*/ [null] }'
    ].join("\n");
    const expected = [
      "{",
      '  "d": [',
      "    null",
      "  ] /*comment*/,",
      '  "e": /*comment*/ [',
      "    null",
      "  ]",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("multiple block comments on same line", () => {
    const content = [
      '{      "a": {} /*comment*/, /*comment*/   ',
      '        /*comment*/ "b": {}  /*comment*/  } '
    ].join("\n");
    const expected = [
      "{",
      '  "a": {} /*comment*/, /*comment*/',
      '  /*comment*/ "b": {} /*comment*/',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("multiple mixed comments on same line", () => {
    const content = [
      "[ /*comment*/  /*comment*/   // comment ",
      "]"
    ].join("\n");
    const expected = [
      "[ /*comment*/ /*comment*/ // comment ",
      "]"
    ].join("\n");
    format(content, expected);
  });
  test("range", () => {
    const content = [
      '{ "a": {},',
      '|"b": [null, null]|',
      "} "
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '"b": [',
      "  null,",
      "  null",
      "]",
      "} "
    ].join("\n");
    format(content, expected);
  });
  test("range with existing indent", () => {
    const content = [
      '{ "a": {},',
      '   |"b": [null],',
      '"c": {}',
      "}|"
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '   "b": [',
      "    null",
      "  ],",
      '  "c": {}',
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("range with existing indent - tabs", () => {
    const content = [
      '{ "a": {},',
      '|  "b": [null],   ',
      '"c": {}',
      "} |    "
    ].join("\n");
    const expected = [
      '{ "a": {},',
      '	"b": [',
      "		null",
      "	],",
      '	"c": {}',
      "}"
    ].join("\n");
    format(content, expected, false);
  });
  test("block comment none-line breaking symbols", () => {
    const content = [
      '{ "a": [ 1',
      "/* comment */",
      ", 2",
      "/* comment */",
      "]",
      "/* comment */",
      ",",
      ' "b": true',
      "/* comment */",
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "a": [',
      "    1",
      "    /* comment */",
      "    ,",
      "    2",
      "    /* comment */",
      "  ]",
      "  /* comment */",
      "  ,",
      '  "b": true',
      "  /* comment */",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("line comment after none-line breaking symbols", () => {
    const content = [
      '{ "a":',
      "// comment",
      "null,",
      ' "b"',
      "// comment",
      ": null",
      "// comment",
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "a":',
      "  // comment",
      "  null,",
      '  "b"',
      "  // comment",
      "  : null",
      "  // comment",
      "}"
    ].join("\n");
    format(content, expected);
  });
  test("toFormattedString", () => {
    const obj = {
      a: { b: 1, d: ["hello"] }
    };
    const getExpected = (tab, eol) => {
      return [
        `{`,
        `${tab}"a": {`,
        `${tab}${tab}"b": 1,`,
        `${tab}${tab}"d": [`,
        `${tab}${tab}${tab}"hello"`,
        `${tab}${tab}]`,
        `${tab}}`,
        "}"
      ].join(eol);
    };
    let actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: "\n" });
    assert.strictEqual(actual, getExpected("  ", "\n"));
    actual = Formatter.toFormattedString(obj, { insertSpaces: true, tabSize: 2, eol: "\r\n" });
    assert.strictEqual(actual, getExpected("  ", "\r\n"));
    actual = Formatter.toFormattedString(obj, { insertSpaces: false, eol: "\r\n" });
    assert.strictEqual(actual, getExpected("	", "\r\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvbkZvcm1hdHRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIEZvcm1hdHRlciBmcm9tICcuLi8uLi9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0pTT04gLSBmb3JtYXR0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZm9ybWF0KGNvbnRlbnQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZywgaW5zZXJ0U3BhY2VzID0gdHJ1ZSkge1xuXHRcdGxldCByYW5nZTogRm9ybWF0dGVyLlJhbmdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJhbmdlU3RhcnQgPSBjb250ZW50LmluZGV4T2YoJ3wnKTtcblx0XHRjb25zdCByYW5nZUVuZCA9IGNvbnRlbnQubGFzdEluZGV4T2YoJ3wnKTtcblx0XHRpZiAocmFuZ2VTdGFydCAhPT0gLTEgJiYgcmFuZ2VFbmQgIT09IC0xKSB7XG5cdFx0XHRjb250ZW50ID0gY29udGVudC5zdWJzdHJpbmcoMCwgcmFuZ2VTdGFydCkgKyBjb250ZW50LnN1YnN0cmluZyhyYW5nZVN0YXJ0ICsgMSwgcmFuZ2VFbmQpICsgY29udGVudC5zdWJzdHJpbmcocmFuZ2VFbmQgKyAxKTtcblx0XHRcdHJhbmdlID0geyBvZmZzZXQ6IHJhbmdlU3RhcnQsIGxlbmd0aDogcmFuZ2VFbmQgLSByYW5nZVN0YXJ0IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHMgPSBGb3JtYXR0ZXIuZm9ybWF0KGNvbnRlbnQsIHJhbmdlLCB7IHRhYlNpemU6IDIsIGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzLCBlb2w6ICdcXG4nIH0pO1xuXG5cdFx0bGV0IGxhc3RFZGl0T2Zmc2V0ID0gY29udGVudC5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgaSA9IGVkaXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cdFx0XHRhc3NlcnQoZWRpdC5vZmZzZXQgPj0gMCAmJiBlZGl0Lmxlbmd0aCA+PSAwICYmIGVkaXQub2Zmc2V0ICsgZWRpdC5sZW5ndGggPD0gY29udGVudC5sZW5ndGgpO1xuXHRcdFx0YXNzZXJ0KHR5cGVvZiBlZGl0LmNvbnRlbnQgPT09ICdzdHJpbmcnKTtcblx0XHRcdGFzc2VydChsYXN0RWRpdE9mZnNldCA+PSBlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTsgLy8gbWFrZSBzdXJlIGFsbCBlZGl0cyBhcmUgb3JkZXJlZFxuXHRcdFx0bGFzdEVkaXRPZmZzZXQgPSBlZGl0Lm9mZnNldDtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnN1YnN0cmluZygwLCBlZGl0Lm9mZnNldCkgKyBlZGl0LmNvbnRlbnQgKyBjb250ZW50LnN1YnN0cmluZyhlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0dGVzdCgnb2JqZWN0IC0gc2luZ2xlIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQne1wieFwiIDogMX0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJ4XCI6IDEnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdvYmplY3QgLSBtdWx0aXBsZSBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQne1wieFwiIDogMSwgIFwieVwiIDogXCJmb29cIiwgXCJ6XCIgIDogdHJ1ZX0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJ4XCI6IDEsJyxcblx0XHRcdCcgIFwieVwiOiBcImZvb1wiLCcsXG5cdFx0XHQnICBcInpcIjogdHJ1ZScsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ29iamVjdCAtIG5vIHByb3BlcnRpZXMgJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQne1wieFwiIDogeyAgICB9LCAgXCJ5XCIgOiB7fX0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJ4XCI6IHt9LCcsXG5cdFx0XHQnICBcInlcIjoge30nLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdvYmplY3QgLSBuZXN0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQne1wieFwiIDogeyAgXCJ5XCIgOiB7IFwielwiICA6IHsgfX0sIFwiYVwiOiB0cnVlfX0nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJ4XCI6IHsnLFxuXHRcdFx0JyAgICBcInlcIjogeycsXG5cdFx0XHQnICAgICAgXCJ6XCI6IHt9Jyxcblx0XHRcdCcgICAgfSwnLFxuXHRcdFx0JyAgICBcImFcIjogdHJ1ZScsXG5cdFx0XHQnICB9Jyxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcnJheSAtIHNpbmdsZSBpdGVtcycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1tcIltdXCJdJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCdbJyxcblx0XHRcdCcgIFwiW11cIicsXG5cdFx0XHQnXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXJyYXkgLSBtdWx0aXBsZSBpdGVtcycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1t0cnVlLG51bGwsMS4yXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWycsXG5cdFx0XHQnICB0cnVlLCcsXG5cdFx0XHQnICBudWxsLCcsXG5cdFx0XHQnICAxLjInLFxuXHRcdFx0J10nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FycmF5IC0gbm8gaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCdbICAgICAgXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnW10nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FycmF5IC0gbmVzdGluZycsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J1sgW10sIFsgWyB7fSBdLCBcImFcIiBdICBdJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCdbJyxcblx0XHRcdCcgIFtdLCcsXG5cdFx0XHQnICBbJyxcblx0XHRcdCcgICAgWycsXG5cdFx0XHQnICAgICAge30nLFxuXHRcdFx0JyAgICBdLCcsXG5cdFx0XHQnICAgIFwiYVwiJyxcblx0XHRcdCcgIF0nLFxuXHRcdFx0J10nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW50YXggZXJyb3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnWyBudWxsIDEuMiBdJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCdbJyxcblx0XHRcdCcgIG51bGwgMS4yJyxcblx0XHRcdCddJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCdcImFcIjogdHJ1ZSwnLFxuXHRcdFx0JycsXG5cdFx0XHQnXCJiXCI6IHRydWUnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCdcXHRcImFcIjogdHJ1ZSwnLFxuXHRcdFx0J1xcdFwiYlwiOiB0cnVlJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkLCBmYWxzZSk7XG5cdH0pO1xuXHR0ZXN0KCdzaW5nbGUgbGluZSBjb21tZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnWyAnLFxuXHRcdFx0Jy8vY29tbWVudCcsXG5cdFx0XHQnXCJmb29cIiwgXCJiYXJcIicsXG5cdFx0XHQnXSAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J1snLFxuXHRcdFx0JyAgLy9jb21tZW50Jyxcblx0XHRcdCcgIFwiZm9vXCIsJyxcblx0XHRcdCcgIFwiYmFyXCInLFxuXHRcdFx0J10nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnYmxvY2sgbGluZSBjb21tZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnW3snLFxuXHRcdFx0JyAgICAgICAgLypjb21tZW50Ki8gICAgICcsXG5cdFx0XHQnXCJmb29cIiA6IHRydWUnLFxuXHRcdFx0J31dICdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWycsXG5cdFx0XHQnICB7Jyxcblx0XHRcdCcgICAgLypjb21tZW50Ki8nLFxuXHRcdFx0JyAgICBcImZvb1wiOiB0cnVlJyxcblx0XHRcdCcgIH0nLFxuXHRcdFx0J10nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnc2luZ2xlIGxpbmUgY29tbWVudCBvbiBzYW1lIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCcgeyAgJyxcblx0XHRcdCcgICAgICAgIFwiYVwiOiB7fS8vIGNvbW1lbnQgICAgJyxcblx0XHRcdCcgfSAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJhXCI6IHt9IC8vIGNvbW1lbnQgICAgJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ3NpbmdsZSBsaW5lIGNvbW1lbnQgb24gc2FtZSBsaW5lIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7IC8vY29tbWVudCcsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneyAvL2NvbW1lbnQnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdibG9jayBjb21tZW50IG9uIHNhbWUgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3sgICAgICBcImFcIjoge30sIC8qY29tbWVudCovICAgICcsXG5cdFx0XHQnICAgICAgICAvKmNvbW1lbnQqLyBcImJcIjoge30sICAgICcsXG5cdFx0XHQnICAgICAgICBcImNcIjogey8qY29tbWVudCovfSAgICB9ICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJhXCI6IHt9LCAvKmNvbW1lbnQqLycsXG5cdFx0XHQnICAvKmNvbW1lbnQqLyBcImJcIjoge30sJyxcblx0XHRcdCcgIFwiY1wiOiB7IC8qY29tbWVudCovfScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGZvcm1hdChjb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jsb2NrIGNvbW1lbnQgb24gc2FtZSBsaW5lIGFkdmFuY2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnIHsgICAgICAgXCJkXCI6IFsnLFxuXHRcdFx0JyAgICAgICAgICAgICBudWxsJyxcblx0XHRcdCcgICAgICAgIF0gLypjb21tZW50Ki8nLFxuXHRcdFx0JyAgICAgICAgLFwiZVwiOiAvKmNvbW1lbnQqLyBbbnVsbF0gfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJkXCI6IFsnLFxuXHRcdFx0JyAgICBudWxsJyxcblx0XHRcdCcgIF0gLypjb21tZW50Ki8sJyxcblx0XHRcdCcgIFwiZVwiOiAvKmNvbW1lbnQqLyBbJyxcblx0XHRcdCcgICAgbnVsbCcsXG5cdFx0XHQnICBdJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgYmxvY2sgY29tbWVudHMgb24gc2FtZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyAgICAgIFwiYVwiOiB7fSAvKmNvbW1lbnQqLywgLypjb21tZW50Ki8gICAnLFxuXHRcdFx0JyAgICAgICAgLypjb21tZW50Ki8gXCJiXCI6IHt9ICAvKmNvbW1lbnQqLyAgfSAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJhXCI6IHt9IC8qY29tbWVudCovLCAvKmNvbW1lbnQqLycsXG5cdFx0XHQnICAvKmNvbW1lbnQqLyBcImJcIjoge30gLypjb21tZW50Ki8nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnbXVsdGlwbGUgbWl4ZWQgY29tbWVudHMgb24gc2FtZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnWyAvKmNvbW1lbnQqLyAgLypjb21tZW50Ki8gICAvLyBjb21tZW50ICcsXG5cdFx0XHQnXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQnWyAvKmNvbW1lbnQqLyAvKmNvbW1lbnQqLyAvLyBjb21tZW50ICcsXG5cdFx0XHQnXSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgncmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0J3xcImJcIjogW251bGwsIG51bGxdfCcsXG5cdFx0XHQnfSAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3sgXCJhXCI6IHt9LCcsXG5cdFx0XHQnXCJiXCI6IFsnLFxuXHRcdFx0JyAgbnVsbCwnLFxuXHRcdFx0JyAgbnVsbCcsXG5cdFx0XHQnXScsXG5cdFx0XHQnfSAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5nZSB3aXRoIGV4aXN0aW5nIGluZGVudCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0J3sgXCJhXCI6IHt9LCcsXG5cdFx0XHQnICAgfFwiYlwiOiBbbnVsbF0sJyxcblx0XHRcdCdcImNcIjoge30nLFxuXHRcdFx0J318J1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0JyAgIFwiYlwiOiBbJyxcblx0XHRcdCcgICAgbnVsbCcsXG5cdFx0XHQnICBdLCcsXG5cdFx0XHQnICBcImNcIjoge30nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyYW5nZSB3aXRoIGV4aXN0aW5nIGluZGVudCAtIHRhYnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdCd7IFwiYVwiOiB7fSwnLFxuXHRcdFx0J3wgIFwiYlwiOiBbbnVsbF0sICAgJyxcblx0XHRcdCdcImNcIjoge30nLFxuXHRcdFx0J30gfCAgICAnXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3sgXCJhXCI6IHt9LCcsXG5cdFx0XHQnXFx0XCJiXCI6IFsnLFxuXHRcdFx0J1xcdFxcdG51bGwnLFxuXHRcdFx0J1xcdF0sJyxcblx0XHRcdCdcXHRcImNcIjoge30nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQsIGZhbHNlKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdibG9jayBjb21tZW50IG5vbmUtbGluZSBicmVha2luZyBzeW1ib2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyBcImFcIjogWyAxJyxcblx0XHRcdCcvKiBjb21tZW50ICovJyxcblx0XHRcdCcsIDInLFxuXHRcdFx0Jy8qIGNvbW1lbnQgKi8nLFxuXHRcdFx0J10nLFxuXHRcdFx0Jy8qIGNvbW1lbnQgKi8nLFxuXHRcdFx0JywnLFxuXHRcdFx0JyBcImJcIjogdHJ1ZScsXG5cdFx0XHQnLyogY29tbWVudCAqLycsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcImFcIjogWycsXG5cdFx0XHQnICAgIDEnLFxuXHRcdFx0JyAgICAvKiBjb21tZW50ICovJyxcblx0XHRcdCcgICAgLCcsXG5cdFx0XHQnICAgIDInLFxuXHRcdFx0JyAgICAvKiBjb21tZW50ICovJyxcblx0XHRcdCcgIF0nLFxuXHRcdFx0JyAgLyogY29tbWVudCAqLycsXG5cdFx0XHQnICAsJyxcblx0XHRcdCcgIFwiYlwiOiB0cnVlJyxcblx0XHRcdCcgIC8qIGNvbW1lbnQgKi8nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRmb3JtYXQoY29udGVudCwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnbGluZSBjb21tZW50IGFmdGVyIG5vbmUtbGluZSBicmVha2luZyBzeW1ib2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQneyBcImFcIjonLFxuXHRcdFx0Jy8vIGNvbW1lbnQnLFxuXHRcdFx0J251bGwsJyxcblx0XHRcdCcgXCJiXCInLFxuXHRcdFx0Jy8vIGNvbW1lbnQnLFxuXHRcdFx0JzogbnVsbCcsXG5cdFx0XHQnLy8gY29tbWVudCcsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcImFcIjonLFxuXHRcdFx0JyAgLy8gY29tbWVudCcsXG5cdFx0XHQnICBudWxsLCcsXG5cdFx0XHQnICBcImJcIicsXG5cdFx0XHQnICAvLyBjb21tZW50Jyxcblx0XHRcdCcgIDogbnVsbCcsXG5cdFx0XHQnICAvLyBjb21tZW50Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Zm9ybWF0KGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndG9Gb3JtYXR0ZWRTdHJpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb2JqID0ge1xuXHRcdFx0YTogeyBiOiAxLCBkOiBbJ2hlbGxvJ10gfVxuXHRcdH07XG5cblxuXHRcdGNvbnN0IGdldEV4cGVjdGVkID0gKHRhYjogc3RyaW5nLCBlb2w6IHN0cmluZykgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0YHtgLFxuXHRcdFx0XHRgJHt0YWJ9XCJhXCI6IHtgLFxuXHRcdFx0XHRgJHt0YWJ9JHt0YWJ9XCJiXCI6IDEsYCxcblx0XHRcdFx0YCR7dGFifSR7dGFifVwiZFwiOiBbYCxcblx0XHRcdFx0YCR7dGFifSR7dGFifSR7dGFifVwiaGVsbG9cImAsXG5cdFx0XHRcdGAke3RhYn0ke3RhYn1dYCxcblx0XHRcdFx0YCR7dGFifX1gLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0uam9pbihlb2wpO1xuXHRcdH07XG5cblx0XHRsZXQgYWN0dWFsID0gRm9ybWF0dGVyLnRvRm9ybWF0dGVkU3RyaW5nKG9iaiwgeyBpbnNlcnRTcGFjZXM6IHRydWUsIHRhYlNpemU6IDIsIGVvbDogJ1xcbicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZ2V0RXhwZWN0ZWQoJyAgJywgJ1xcbicpKTtcblxuXHRcdGFjdHVhbCA9IEZvcm1hdHRlci50b0Zvcm1hdHRlZFN0cmluZyhvYmosIHsgaW5zZXJ0U3BhY2VzOiB0cnVlLCB0YWJTaXplOiAyLCBlb2w6ICdcXHJcXG4nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGdldEV4cGVjdGVkKCcgICcsICdcXHJcXG4nKSk7XG5cblx0XHRhY3R1YWwgPSBGb3JtYXR0ZXIudG9Gb3JtYXR0ZWRTdHJpbmcob2JqLCB7IGluc2VydFNwYWNlczogZmFsc2UsIGVvbDogJ1xcclxcbicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZ2V0RXhwZWN0ZWQo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
