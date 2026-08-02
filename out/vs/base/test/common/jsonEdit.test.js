import assert from "assert";
import { removeProperty, setProperty } from "../../common/jsonEdit.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON - edits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertEdit(content, edits, expected) {
    assert(edits);
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
  const formatterOptions = {
    insertSpaces: true,
    tabSize: 2,
    eol: "\n"
  };
  test("set property", () => {
    let content = '{\n  "x": "y"\n}';
    let edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}');
    content = "true";
    edits = setProperty(content, [], "bar", formatterOptions);
    assertEdit(content, edits, '"bar"');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["x"], { key: true }, formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "key": true\n  }\n}');
    content = '{\n  "a": "b",  "x": "y"\n}';
    edits = setProperty(content, ["a"], null, formatterOptions);
    assertEdit(content, edits, '{\n  "a": null,  "x": "y"\n}');
  });
  test("insert property", () => {
    let content = "{}";
    let edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": "bar"\n}');
    edits = setProperty(content, ["foo", "foo2"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": {\n    "foo2": "bar"\n  }\n}');
    content = "{\n}";
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": "bar"\n}');
    content = "  {\n  }";
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '  {\n    "foo": "bar"\n  }');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y",\n  "foo": "bar"\n}');
    content = '{\n  "x": "y"\n}';
    edits = setProperty(content, ["e"], "null", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y",\n  "e": "null"\n}');
    edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}');
    content = '{\n  "x": {\n    "a": 1,\n    "b": true\n  }\n}\n';
    edits = setProperty(content, ["x"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": "bar"\n}\n');
    edits = setProperty(content, ["x", "b"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": "bar"\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 0);
    assertEdit(content, edits, '{\n  "x": {\n    "c": "bar",\n    "a": 1,\n    "b": true\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 1);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "c": "bar",\n    "b": true\n  }\n}\n');
    edits = setProperty(content, ["x", "c"], "bar", formatterOptions, () => 2);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true,\n    "c": "bar"\n  }\n}\n');
    edits = setProperty(content, ["c"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true\n  },\n  "c": "bar"\n}\n');
    content = '{\n  "a": [\n    {\n    } \n  ]  \n}';
    edits = setProperty(content, ["foo"], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "a": [\n    {\n    } \n  ],\n  "foo": "bar"\n}');
    content = "";
    edits = setProperty(content, ["foo", 0], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n}');
    content = "//comment";
    edits = setProperty(content, ["foo", 0], "bar", formatterOptions);
    assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n} //comment');
  });
  test("remove property", () => {
    let content = '{\n  "x": "y"\n}';
    let edits = removeProperty(content, ["x"], formatterOptions);
    assertEdit(content, edits, "{\n}");
    content = '{\n  "x": "y", "a": []\n}';
    edits = removeProperty(content, ["x"], formatterOptions);
    assertEdit(content, edits, '{\n  "a": []\n}');
    content = '{\n  "x": "y", "a": []\n}';
    edits = removeProperty(content, ["a"], formatterOptions);
    assertEdit(content, edits, '{\n  "x": "y"\n}');
  });
  test("insert item at 0", () => {
    const content = "[\n  2,\n  3\n]";
    const edits = setProperty(content, [0], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at 0 in empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [0], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1\n]");
  });
  test("insert item at an index", () => {
    const content = "[\n  1,\n  3\n]";
    const edits = setProperty(content, [1], 2, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at an index im empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [1], 1, formatterOptions);
    assertEdit(content, edits, "[\n  1\n]");
  });
  test("insert item at end index", () => {
    const content = "[\n  1,\n  2\n]";
    const edits = setProperty(content, [2], 3, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2,\n  3\n]");
  });
  test("insert item at end to empty array", () => {
    const content = "[\n]";
    const edits = setProperty(content, [-1], "bar", formatterOptions);
    assertEdit(content, edits, '[\n  "bar"\n]');
  });
  test("insert item at end", () => {
    const content = "[\n  1,\n  2\n]";
    const edits = setProperty(content, [-1], "bar", formatterOptions);
    assertEdit(content, edits, '[\n  1,\n  2,\n  "bar"\n]');
  });
  test("remove item in array with one item", () => {
    const content = "[\n  1\n]";
    const edits = setProperty(content, [0], void 0, formatterOptions);
    assertEdit(content, edits, "[]");
  });
  test("remove item in the middle of the array", () => {
    const content = "[\n  1,\n  2,\n  3\n]";
    const edits = setProperty(content, [1], void 0, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  3\n]");
  });
  test("remove last item in the array", () => {
    const content = '[\n  1,\n  2,\n  "bar"\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, "[\n  1,\n  2\n]");
  });
  test("remove last item in the array if ends with comma", () => {
    const content = '[\n  1,\n  "foo",\n  "bar",\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, '[\n  1,\n  "foo"\n]');
  });
  test("remove last item in the array if there is a comment in the beginning", () => {
    const content = '// This is a comment\n[\n  1,\n  "foo",\n  "bar"\n]';
    const edits = setProperty(content, [2], void 0, formatterOptions);
    assertEdit(content, edits, '// This is a comment\n[\n  1,\n  "foo"\n]');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvbkVkaXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyByZW1vdmVQcm9wZXJ0eSwgc2V0UHJvcGVydHkgfSBmcm9tICcuLi8uLi9jb21tb24vanNvbkVkaXQuanMnO1xuaW1wb3J0IHsgRWRpdCwgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0pTT04gLSBlZGl0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBhc3NlcnRFZGl0KGNvbnRlbnQ6IHN0cmluZywgZWRpdHM6IEVkaXRbXSwgZXhwZWN0ZWQ6IHN0cmluZykge1xuXHRcdGFzc2VydChlZGl0cyk7XG5cdFx0bGV0IGxhc3RFZGl0T2Zmc2V0ID0gY29udGVudC5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgaSA9IGVkaXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cdFx0XHRhc3NlcnQoZWRpdC5vZmZzZXQgPj0gMCAmJiBlZGl0Lmxlbmd0aCA+PSAwICYmIGVkaXQub2Zmc2V0ICsgZWRpdC5sZW5ndGggPD0gY29udGVudC5sZW5ndGgpO1xuXHRcdFx0YXNzZXJ0KHR5cGVvZiBlZGl0LmNvbnRlbnQgPT09ICdzdHJpbmcnKTtcblx0XHRcdGFzc2VydChsYXN0RWRpdE9mZnNldCA+PSBlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTsgLy8gbWFrZSBzdXJlIGFsbCBlZGl0cyBhcmUgb3JkZXJlZFxuXHRcdFx0bGFzdEVkaXRPZmZzZXQgPSBlZGl0Lm9mZnNldDtcblx0XHRcdGNvbnRlbnQgPSBjb250ZW50LnN1YnN0cmluZygwLCBlZGl0Lm9mZnNldCkgKyBlZGl0LmNvbnRlbnQgKyBjb250ZW50LnN1YnN0cmluZyhlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fVxuXG5cdGNvbnN0IGZvcm1hdHRlck9wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zID0ge1xuXHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHR0YWJTaXplOiAyLFxuXHRcdGVvbDogJ1xcbidcblx0fTtcblxuXHR0ZXN0KCdzZXQgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0bGV0IGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IFwieVwiXFxufSc7XG5cdFx0bGV0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWyd4J10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IFwiYmFyXCJcXG59Jyk7XG5cblx0XHRjb250ZW50ID0gJ3RydWUnO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgW10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnXCJiYXJcIicpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjogXCJ5XCJcXG59Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCddLCB7IGtleTogdHJ1ZSB9LCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IHtcXG4gICAgXCJrZXlcIjogdHJ1ZVxcbiAgfVxcbn0nKTtcblx0XHRjb250ZW50ID0gJ3tcXG4gIFwiYVwiOiBcImJcIiwgIFwieFwiOiBcInlcIlxcbn0nO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydhJ10sIG51bGwsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImFcIjogbnVsbCwgIFwieFwiOiBcInlcIlxcbn0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGxldCBjb250ZW50ID0gJ3t9Jztcblx0XHRsZXQgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2ZvbyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwiZm9vXCI6IFwiYmFyXCJcXG59Jyk7XG5cblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZm9vJywgJ2ZvbzInXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImZvb1wiOiB7XFxuICAgIFwiZm9vMlwiOiBcImJhclwiXFxuICB9XFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxufSc7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2ZvbyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwiZm9vXCI6IFwiYmFyXCJcXG59Jyk7XG5cblx0XHRjb250ZW50ID0gJyAge1xcbiAgfSc7XG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ2ZvbyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJyAge1xcbiAgICBcImZvb1wiOiBcImJhclwiXFxuICB9Jyk7XG5cblx0XHRjb250ZW50ID0gJ3tcXG4gIFwieFwiOiBcInlcIlxcbn0nO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjogXCJ5XCIsXFxuICBcImZvb1wiOiBcImJhclwiXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjogXCJ5XCJcXG59Jztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZSddLCAnbnVsbCcsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjogXCJ5XCIsXFxuICBcImVcIjogXCJudWxsXCJcXG59Jyk7XG5cblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiBcImJhclwiXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjoge1xcbiAgICBcImFcIjogMSxcXG4gICAgXCJiXCI6IHRydWVcXG4gIH1cXG59XFxuJztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiBcImJhclwiXFxufVxcbicpO1xuXG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnLCAnYiddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiB7XFxuICAgIFwiYVwiOiAxLFxcbiAgICBcImJcIjogXCJiYXJcIlxcbiAgfVxcbn1cXG4nKTtcblxuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWyd4JywgJ2MnXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMsICgpID0+IDApO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcInhcIjoge1xcbiAgICBcImNcIjogXCJiYXJcIixcXG4gICAgXCJhXCI6IDEsXFxuICAgIFwiYlwiOiB0cnVlXFxuICB9XFxufVxcbicpO1xuXG5cdFx0ZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbJ3gnLCAnYyddLCAnYmFyJywgZm9ybWF0dGVyT3B0aW9ucywgKCkgPT4gMSk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiB7XFxuICAgIFwiYVwiOiAxLFxcbiAgICBcImNcIjogXCJiYXJcIixcXG4gICAgXCJiXCI6IHRydWVcXG4gIH1cXG59XFxuJyk7XG5cblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsneCcsICdjJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zLCAoKSA9PiAyKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IHtcXG4gICAgXCJhXCI6IDEsXFxuICAgIFwiYlwiOiB0cnVlLFxcbiAgICBcImNcIjogXCJiYXJcIlxcbiAgfVxcbn1cXG4nKTtcblxuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydjJ10sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJ4XCI6IHtcXG4gICAgXCJhXCI6IDEsXFxuICAgIFwiYlwiOiB0cnVlXFxuICB9LFxcbiAgXCJjXCI6IFwiYmFyXCJcXG59XFxuJyk7XG5cblx0XHRjb250ZW50ID0gJ3tcXG4gIFwiYVwiOiBbXFxuICAgIHtcXG4gICAgfSBcXG4gIF0gIFxcbn0nO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImFcIjogW1xcbiAgICB7XFxuICAgIH0gXFxuICBdLFxcbiAgXCJmb29cIjogXCJiYXJcIlxcbn0nKTtcblxuXHRcdGNvbnRlbnQgPSAnJztcblx0XHRlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsnZm9vJywgMF0sICdiYXInLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAne1xcbiAgXCJmb29cIjogW1xcbiAgICBcImJhclwiXFxuICBdXFxufScpO1xuXG5cdFx0Y29udGVudCA9ICcvL2NvbW1lbnQnO1xuXHRcdGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWydmb28nLCAwXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImZvb1wiOiBbXFxuICAgIFwiYmFyXCJcXG4gIF1cXG59IC8vY29tbWVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmUgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0bGV0IGNvbnRlbnQgPSAne1xcbiAgXCJ4XCI6IFwieVwiXFxufSc7XG5cdFx0bGV0IGVkaXRzID0gcmVtb3ZlUHJvcGVydHkoY29udGVudCwgWyd4J10sIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxufScpO1xuXG5cdFx0Y29udGVudCA9ICd7XFxuICBcInhcIjogXCJ5XCIsIFwiYVwiOiBbXVxcbn0nO1xuXHRcdGVkaXRzID0gcmVtb3ZlUHJvcGVydHkoY29udGVudCwgWyd4J10sIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICd7XFxuICBcImFcIjogW11cXG59Jyk7XG5cblx0XHRjb250ZW50ID0gJ3tcXG4gIFwieFwiOiBcInlcIiwgXCJhXCI6IFtdXFxufSc7XG5cdFx0ZWRpdHMgPSByZW1vdmVQcm9wZXJ0eShjb250ZW50LCBbJ2EnXSwgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ3tcXG4gIFwieFwiOiBcInlcIlxcbn0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGl0ZW0gYXQgMCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDIsXFxuICAzXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMF0sIDEsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgMixcXG4gIDNcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBpdGVtIGF0IDAgaW4gZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMF0sIDEsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgaXRlbSBhdCBhbiBpbmRleCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDEsXFxuICAzXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMV0sIDIsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgMixcXG4gIDNcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBpdGVtIGF0IGFuIGluZGV4IGltIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzFdLCAxLCBmb3JtYXR0ZXJPcHRpb25zKTtcblx0XHRhc3NlcnRFZGl0KGNvbnRlbnQsIGVkaXRzLCAnW1xcbiAgMVxcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGl0ZW0gYXQgZW5kIGluZGV4JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbiAgMSxcXG4gIDJcXG5dJztcblx0XHRjb25zdCBlZGl0cyA9IHNldFByb3BlcnR5KGNvbnRlbnQsIFsyXSwgMywgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ1tcXG4gIDEsXFxuICAyLFxcbiAgM1xcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGl0ZW0gYXQgZW5kIHRvIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWy0xXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICBcImJhclwiXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgaXRlbSBhdCBlbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuICAxLFxcbiAgMlxcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWy0xXSwgJ2JhcicsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgMixcXG4gIFwiYmFyXCJcXG5dJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSBpdGVtIGluIGFycmF5IHdpdGggb25lIGl0ZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdbXFxuICAxXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMF0sIHVuZGVmaW5lZCwgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ1tdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSBpdGVtIGluIHRoZSBtaWRkbGUgb2YgdGhlIGFycmF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbiAgMSxcXG4gIDIsXFxuICAzXFxuXSc7XG5cdFx0Y29uc3QgZWRpdHMgPSBzZXRQcm9wZXJ0eShjb250ZW50LCBbMV0sIHVuZGVmaW5lZCwgZm9ybWF0dGVyT3B0aW9ucyk7XG5cdFx0YXNzZXJ0RWRpdChjb250ZW50LCBlZGl0cywgJ1tcXG4gIDEsXFxuICAzXFxuXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmUgbGFzdCBpdGVtIGluIHRoZSBhcnJheScsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ1tcXG4gIDEsXFxuICAyLFxcbiAgXCJiYXJcIlxcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzJdLCB1bmRlZmluZWQsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgMlxcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIGxhc3QgaXRlbSBpbiB0aGUgYXJyYXkgaWYgZW5kcyB3aXRoIGNvbW1hJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnW1xcbiAgMSxcXG4gIFwiZm9vXCIsXFxuICBcImJhclwiLFxcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzJdLCB1bmRlZmluZWQsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICdbXFxuICAxLFxcbiAgXCJmb29cIlxcbl0nKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIGxhc3QgaXRlbSBpbiB0aGUgYXJyYXkgaWYgdGhlcmUgaXMgYSBjb21tZW50IGluIHRoZSBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICcvLyBUaGlzIGlzIGEgY29tbWVudFxcbltcXG4gIDEsXFxuICBcImZvb1wiLFxcbiAgXCJiYXJcIlxcbl0nO1xuXHRcdGNvbnN0IGVkaXRzID0gc2V0UHJvcGVydHkoY29udGVudCwgWzJdLCB1bmRlZmluZWQsIGZvcm1hdHRlck9wdGlvbnMpO1xuXHRcdGFzc2VydEVkaXQoY29udGVudCwgZWRpdHMsICcvLyBUaGlzIGlzIGEgY29tbWVudFxcbltcXG4gIDEsXFxuICBcImZvb1wiXFxuXScpO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBRTVDLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sZ0JBQWdCLE1BQU07QUFFM0IsMENBQXdDO0FBRXhDLFdBQVMsV0FBVyxTQUFpQixPQUFlLFVBQWtCO0FBQ3JFLFdBQU8sS0FBSztBQUNaLFFBQUksaUJBQWlCLFFBQVE7QUFDN0IsYUFBUyxJQUFJLE1BQU0sU0FB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
