import * as assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { convertAXTreeToMarkdown } from "../../electron-main/cdpAccessibilityDomain.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("CDP Accessibility Domain", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testUri = URI.parse("https://example.com/test");
  function createAXValue(type, value) {
    return { type, value };
  }
  function createAXProperty(name, value, type = "string") {
    return {
      name,
      value: createAXValue(type, value)
    };
  }
  test("empty tree returns empty string", () => {
    const result = convertAXTreeToMarkdown(testUri, []);
    assert.strictEqual(result, "");
  });
  test("simple heading conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        childIds: ["node2"],
        ignored: false,
        role: createAXValue("role", "heading"),
        name: createAXValue("string", "Test Heading"),
        properties: [
          createAXProperty("level", 2, "integer")
        ]
      },
      {
        nodeId: "node2",
        childIds: [],
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Test Heading")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "## Test Heading");
  });
  test("paragraph with text conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "paragraph"),
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "This is a paragraph of text.")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "This is a paragraph of text.");
  });
  test("really long paragraph should insert newlines at the space before 80 characters", () => {
    const longStr = [
      "This is a paragraph of text. It is really long. Like really really really really",
      "really really really really really really really long. That long."
    ];
    const nodes = [
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", longStr.join(" "))
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), longStr.join("\n"));
  });
  test("list conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["node2", "node3"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["node4", "node6"]
      },
      {
        nodeId: "node3",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["node5", "node7"]
      },
      {
        nodeId: "node4",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "1. ")
      },
      {
        nodeId: "node5",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "2. ")
      },
      {
        nodeId: "node6",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1")
      },
      {
        nodeId: "node7",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
1. Item 1
2. Item 2

`;
    assert.strictEqual(result, expected);
  });
  test("nested list conversion", () => {
    const nodes = [
      {
        nodeId: "list1",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["item1", "item2"]
      },
      {
        nodeId: "item1",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["marker1", "text1", "nestedList"],
        properties: [
          createAXProperty("level", 1, "integer")
        ]
      },
      {
        nodeId: "marker1",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "text1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1")
      },
      {
        nodeId: "nestedList",
        ignored: false,
        role: createAXValue("role", "list"),
        childIds: ["nestedItem"]
      },
      {
        nodeId: "nestedItem",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["nestedMarker", "nestedText"],
        properties: [
          createAXProperty("level", 2, "integer")
        ]
      },
      {
        nodeId: "nestedMarker",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "nestedText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 1a")
      },
      {
        nodeId: "item2",
        ignored: false,
        role: createAXValue("role", "listitem"),
        childIds: ["marker2", "text2"],
        properties: [
          createAXProperty("level", 1, "integer")
        ]
      },
      {
        nodeId: "marker2",
        ignored: false,
        role: createAXValue("role", "ListMarker"),
        name: createAXValue("string", "- ")
      },
      {
        nodeId: "text2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Item 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const indent = "  ";
    const expected = `
- Item 1
${indent}- Item 1a
- Item 2

`;
    assert.strictEqual(result, expected);
  });
  test("links conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "paragraph"),
        childIds: ["node2"]
      },
      {
        nodeId: "node2",
        ignored: false,
        role: createAXValue("role", "link"),
        name: createAXValue("string", "Test Link"),
        properties: [
          createAXProperty("url", "https://test.com")
        ]
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "[Test Link](https://test.com)");
  });
  test("links to same page are not converted to markdown links", () => {
    const pageUri = URI.parse("https://example.com/page");
    const nodes = [
      {
        nodeId: "link",
        ignored: false,
        role: createAXValue("role", "link"),
        name: createAXValue("string", "Current page link"),
        properties: [createAXProperty("url", "https://example.com/page?section=1#header")]
      }
    ];
    const result = convertAXTreeToMarkdown(pageUri, nodes);
    assert.strictEqual(result.includes("Current page link"), true);
    assert.strictEqual(result.includes("[Current page link]"), false);
  });
  test("image conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "image"),
        name: createAXValue("string", "Alt text"),
        properties: [
          createAXProperty("url", "https://test.com/image.png")
        ]
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "![Alt text](https://test.com/image.png)");
  });
  test("image without URL shows alt text", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "image"),
        name: createAXValue("string", "Alt text")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.trim(), "[Image: Alt text]");
  });
  test("description list conversion", () => {
    const nodes = [
      {
        nodeId: "dl",
        ignored: false,
        role: createAXValue("role", "DescriptionList"),
        childIds: ["term1", "def1", "term2", "def2"]
      },
      {
        nodeId: "term1",
        ignored: false,
        role: createAXValue("role", "term"),
        childIds: ["termText1"]
      },
      {
        nodeId: "termText1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Term 1")
      },
      {
        nodeId: "def1",
        ignored: false,
        role: createAXValue("role", "definition"),
        childIds: ["defText1"]
      },
      {
        nodeId: "defText1",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Definition 1")
      },
      {
        nodeId: "term2",
        ignored: false,
        role: createAXValue("role", "term"),
        childIds: ["termText2"]
      },
      {
        nodeId: "termText2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Term 2")
      },
      {
        nodeId: "def2",
        ignored: false,
        role: createAXValue("role", "definition"),
        childIds: ["defText2"]
      },
      {
        nodeId: "defText2",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "Definition 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("- **Term 1** Definition 1"), true);
    assert.strictEqual(result.includes("- **Term 2** Definition 2"), true);
  });
  test("blockquote conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "blockquote"),
        name: createAXValue("string", "This is a blockquote\nWith multiple lines")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `> This is a blockquote
> With multiple lines`;
    assert.strictEqual(result.trim(), expected);
  });
  test("preformatted text conversion", () => {
    const nodes = [
      {
        nodeId: "node1",
        ignored: false,
        role: createAXValue("role", "pre"),
        name: createAXValue("string", "function test() {\n  return true;\n}")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = "```\nfunction test() {\n  return true;\n}\n```";
    assert.strictEqual(result.trim(), expected);
  });
  test("code block conversion", () => {
    const nodes = [
      {
        nodeId: "code",
        ignored: false,
        role: createAXValue("role", "code"),
        childIds: ["codeText"]
      },
      {
        nodeId: "codeText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "const x = 42;\nconsole.log(x);")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("```"), true);
    assert.strictEqual(result.includes("const x = 42;"), true);
    assert.strictEqual(result.includes("console.log(x);"), true);
  });
  test("inline code conversion", () => {
    const nodes = [
      {
        nodeId: "code",
        ignored: false,
        role: createAXValue("role", "code"),
        childIds: ["codeText"]
      },
      {
        nodeId: "codeText",
        ignored: false,
        role: createAXValue("role", "StaticText"),
        name: createAXValue("string", "const x = 42;")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    assert.strictEqual(result.includes("`const x = 42;`"), true);
  });
  test("table conversion", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "cell1",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with columnheader role (th elements)", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["header1", "header2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "header1",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "header2",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with rowheader role", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader2", "cell4"]
      },
      {
        nodeId: "rowheader1",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Row 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "rowheader2",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Row 2")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Row 1 | Data 1 |
| --- | --- |
| Row 2 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with mixed cell types", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2", "row3"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["header1", "header2", "header3"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader1", "cell2", "cell3"]
      },
      {
        nodeId: "row3",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["rowheader2", "cell4", "cell5"]
      },
      {
        nodeId: "header1",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Name")
      },
      {
        nodeId: "header2",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "Age")
      },
      {
        nodeId: "header3",
        ignored: false,
        role: createAXValue("role", "columnheader"),
        name: createAXValue("string", "City")
      },
      {
        nodeId: "rowheader1",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "John")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "25")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "NYC")
      },
      {
        nodeId: "rowheader2",
        ignored: false,
        role: createAXValue("role", "rowheader"),
        name: createAXValue("string", "Jane")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "30")
      },
      {
        nodeId: "cell5",
        ignored: false,
        role: createAXValue("role", "cell"),
        name: createAXValue("string", "LA")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Name | Age | City |
| --- | --- | --- |
| John | 25 | NYC |
| Jane | 30 | LA |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
  test("table with gridcell role", () => {
    const nodes = [
      {
        nodeId: "table1",
        ignored: false,
        role: createAXValue("role", "table"),
        childIds: ["row1", "row2"]
      },
      {
        nodeId: "row1",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell1", "cell2"]
      },
      {
        nodeId: "row2",
        ignored: false,
        role: createAXValue("role", "row"),
        childIds: ["cell3", "cell4"]
      },
      {
        nodeId: "cell1",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Header 1")
      },
      {
        nodeId: "cell2",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Header 2")
      },
      {
        nodeId: "cell3",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Data 1")
      },
      {
        nodeId: "cell4",
        ignored: false,
        role: createAXValue("role", "gridcell"),
        name: createAXValue("string", "Data 2")
      }
    ];
    const result = convertAXTreeToMarkdown(testUri, nodes);
    const expected = `
| Header 1 | Header 2 |
| --- | --- |
| Data 1 | Data 2 |
`;
    assert.strictEqual(result.trim(), expected.trim());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvdGVzdC9lbGVjdHJvbi1tYWluL2NkcEFjY2Vzc2liaWxpdHlEb21haW4udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFYTm9kZSwgQVhQcm9wZXJ0eSwgQVhQcm9wZXJ0eU5hbWUsIEFYVmFsdWVUeXBlLCBjb252ZXJ0QVhUcmVlVG9NYXJrZG93biB9IGZyb20gJy4uLy4uL2VsZWN0cm9uLW1haW4vY2RwQWNjZXNzaWJpbGl0eURvbWFpbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0NEUCBBY2Nlc3NpYmlsaXR5IERvbWFpbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgdGVzdFVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS90ZXN0Jyk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQVhWYWx1ZSh0eXBlOiBBWFZhbHVlVHlwZSwgdmFsdWU6IGFueSkge1xuXHRcdHJldHVybiB7IHR5cGUsIHZhbHVlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVBWFByb3BlcnR5KG5hbWU6IEFYUHJvcGVydHlOYW1lLCB2YWx1ZTogYW55LCB0eXBlOiBBWFZhbHVlVHlwZSA9ICdzdHJpbmcnKTogQVhQcm9wZXJ0eSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWUsXG5cdFx0XHR2YWx1ZTogY3JlYXRlQVhWYWx1ZSh0eXBlLCB2YWx1ZSlcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZW1wdHkgdHJlZSByZXR1cm5zIGVtcHR5IHN0cmluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJycpO1xuXHR9KTtcblxuXHQvLyNyZWdpb24gSGVhZGluZyBUZXN0c1xuXG5cdHRlc3QoJ3NpbXBsZSBoZWFkaW5nIGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMScsXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25vZGUyJ10sXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2hlYWRpbmcnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ1Rlc3QgSGVhZGluZycpLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbXG5cdFx0XHRcdFx0Y3JlYXRlQVhQcm9wZXJ0eSgnbGV2ZWwnLCAyLCAnaW50ZWdlcicpXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUyJyxcblx0XHRcdFx0Y2hpbGRJZHM6IFtdLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdUZXN0IEhlYWRpbmcnKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksICcjIyBUZXN0IEhlYWRpbmcnKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFBhcmFncmFwaCBUZXN0c1xuXG5cdHRlc3QoJ3BhcmFncmFwaCB3aXRoIHRleHQgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncGFyYWdyYXBoJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25vZGUyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnVGhpcyBpcyBhIHBhcmFncmFwaCBvZiB0ZXh0LicpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgJ1RoaXMgaXMgYSBwYXJhZ3JhcGggb2YgdGV4dC4nKTtcblx0fSk7XG5cblx0dGVzdCgncmVhbGx5IGxvbmcgcGFyYWdyYXBoIHNob3VsZCBpbnNlcnQgbmV3bGluZXMgYXQgdGhlIHNwYWNlIGJlZm9yZSA4MCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvbmdTdHIgPSBbXG5cdFx0XHQnVGhpcyBpcyBhIHBhcmFncmFwaCBvZiB0ZXh0LiBJdCBpcyByZWFsbHkgbG9uZy4gTGlrZSByZWFsbHkgcmVhbGx5IHJlYWxseSByZWFsbHknLFxuXHRcdFx0J3JlYWxseSByZWFsbHkgcmVhbGx5IHJlYWxseSByZWFsbHkgcmVhbGx5IHJlYWxseSBsb25nLiBUaGF0IGxvbmcuJ1xuXHRcdF07XG5cblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCBsb25nU3RyLmpvaW4oJyAnKSlcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBsb25nU3RyLmpvaW4oJ1xcbicpKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIExpc3QgVGVzdHNcblxuXHR0ZXN0KCdsaXN0IGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3QnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbm9kZTInLCAnbm9kZTMnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbm9kZTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaXN0aXRlbScpLFxuXHRcdFx0XHRjaGlsZElkczogWydub2RlNCcsICdub2RlNiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3RpdGVtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25vZGU1JywgJ25vZGU3J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGU0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnTGlzdE1hcmtlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnMS4gJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGU1Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnTGlzdE1hcmtlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnMi4gJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGU2Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSXRlbSAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGU3Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSXRlbSAyJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGBcbjEuIEl0ZW0gMVxuMi4gSXRlbSAyXG5cbmA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXN0ZWQgbGlzdCBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbGlzdDEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaXN0JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2l0ZW0xJywgJ2l0ZW0yJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2l0ZW0xJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnbGlzdGl0ZW0nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnbWFya2VyMScsICd0ZXh0MScsICduZXN0ZWRMaXN0J10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCdsZXZlbCcsIDEsICdpbnRlZ2VyJylcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbWFya2VyMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ0xpc3RNYXJrZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJy0gJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3RleHQxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSXRlbSAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25lc3RlZExpc3QnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaXN0JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25lc3RlZEl0ZW0nXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkSXRlbScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpc3RpdGVtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ25lc3RlZE1hcmtlcicsICduZXN0ZWRUZXh0J10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCdsZXZlbCcsIDIsICdpbnRlZ2VyJylcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkTWFya2VyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnTGlzdE1hcmtlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnLSAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbmVzdGVkVGV4dCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0l0ZW0gMWEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnaXRlbTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaXN0aXRlbScpLFxuXHRcdFx0XHRjaGlsZElkczogWydtYXJrZXIyJywgJ3RleHQyJ10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCdsZXZlbCcsIDEsICdpbnRlZ2VyJylcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnbWFya2VyMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ0xpc3RNYXJrZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJy0gJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3RleHQyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSXRlbSAyJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGluZGVudCA9ICcgICc7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxuLSBJdGVtIDFcbiR7aW5kZW50fS0gSXRlbSAxYVxuLSBJdGVtIDJcblxuYDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBMaW5rcyBUZXN0c1xuXG5cdHRlc3QoJ2xpbmtzIGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3BhcmFncmFwaCcpLFxuXHRcdFx0XHRjaGlsZElkczogWydub2RlMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdub2RlMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2xpbmsnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ1Rlc3QgTGluaycpLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbXG5cdFx0XHRcdFx0Y3JlYXRlQVhQcm9wZXJ0eSgndXJsJywgJ2h0dHBzOi8vdGVzdC5jb20nKVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgJ1tUZXN0IExpbmtdKGh0dHBzOi8vdGVzdC5jb20pJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpbmtzIHRvIHNhbWUgcGFnZSBhcmUgbm90IGNvbnZlcnRlZCB0byBtYXJrZG93biBsaW5rcycsICgpID0+IHtcblx0XHRjb25zdCBwYWdlVXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnKTtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2xpbmsnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdsaW5rJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdDdXJyZW50IHBhZ2UgbGluaycpLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiBbY3JlYXRlQVhQcm9wZXJ0eSgndXJsJywgJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGFnZT9zZWN0aW9uPTEjaGVhZGVyJyldXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHBhZ2VVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdDdXJyZW50IHBhZ2UgbGluaycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdbQ3VycmVudCBwYWdlIGxpbmtdJyksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEltYWdlIFRlc3RzXG5cblx0dGVzdCgnaW1hZ2UgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnaW1hZ2UnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0FsdCB0ZXh0JyksXG5cdFx0XHRcdHByb3BlcnRpZXM6IFtcblx0XHRcdFx0XHRjcmVhdGVBWFByb3BlcnR5KCd1cmwnLCAnaHR0cHM6Ly90ZXN0LmNvbS9pbWFnZS5wbmcnKVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgJyFbQWx0IHRleHRdKGh0dHBzOi8vdGVzdC5jb20vaW1hZ2UucG5nKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbWFnZSB3aXRob3V0IFVSTCBzaG93cyBhbHQgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnaW1hZ2UnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0FsdCB0ZXh0Jylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCAnW0ltYWdlOiBBbHQgdGV4dF0nKTtcblx0fSk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERlc2NyaXB0aW9uIExpc3QgVGVzdHNcblxuXHR0ZXN0KCdkZXNjcmlwdGlvbiBsaXN0IGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdkbCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ0Rlc2NyaXB0aW9uTGlzdCcpLFxuXHRcdFx0XHRjaGlsZElkczogWyd0ZXJtMScsICdkZWYxJywgJ3Rlcm0yJywgJ2RlZjInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGVybTEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICd0ZXJtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3Rlcm1UZXh0MSddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0ZXJtVGV4dDEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdUZXJtIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnZGVmMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2RlZmluaXRpb24nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnZGVmVGV4dDEnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnZGVmVGV4dDEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEZWZpbml0aW9uIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGVybTInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICd0ZXJtJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3Rlcm1UZXh0MiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICd0ZXJtVGV4dDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdUZXJtIDInKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnZGVmMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2RlZmluaXRpb24nKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnZGVmVGV4dDInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnZGVmVGV4dDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdTdGF0aWNUZXh0JyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEZWZpbml0aW9uIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNsdWRlcygnLSAqKlRlcm0gMSoqIERlZmluaXRpb24gMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCctICoqVGVybSAyKiogRGVmaW5pdGlvbiAyJyksIHRydWUpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQmxvY2txdW90ZSBUZXN0c1xuXG5cdHRlc3QoJ2Jsb2NrcXVvdGUgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnYmxvY2txdW90ZScpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnVGhpcyBpcyBhIGJsb2NrcXVvdGVcXG5XaXRoIG11bHRpcGxlIGxpbmVzJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGA+IFRoaXMgaXMgYSBibG9ja3F1b3RlXG4+IFdpdGggbXVsdGlwbGUgbGluZXNgO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBDb2RlIFRlc3RzXG5cblx0dGVzdCgncHJlZm9ybWF0dGVkIHRleHQgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ25vZGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncHJlJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdmdW5jdGlvbiB0ZXN0KCkge1xcbiAgcmV0dXJuIHRydWU7XFxufScpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHQnYGBgXFxuZnVuY3Rpb24gdGVzdCgpIHtcXG4gIHJldHVybiB0cnVlO1xcbn1cXG5gYGAnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvZGUgYmxvY2sgY29udmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NvZGUnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2RlJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2NvZGVUZXh0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NvZGVUZXh0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnU3RhdGljVGV4dCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnY29uc3QgeCA9IDQyO1xcbmNvbnNvbGUubG9nKHgpOycpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdgYGAnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNsdWRlcygnY29uc3QgeCA9IDQyOycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmluY2x1ZGVzKCdjb25zb2xlLmxvZyh4KTsnKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubGluZSBjb2RlIGNvbnZlcnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZXM6IEFYTm9kZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjb2RlJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY29kZScpLFxuXHRcdFx0XHRjaGlsZElkczogWydjb2RlVGV4dCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjb2RlVGV4dCcsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ1N0YXRpY1RleHQnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ2NvbnN0IHggPSA0MjsnKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNsdWRlcygnYGNvbnN0IHggPSA0MjtgJyksIHRydWUpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVGFibGUgVGVzdHNcblxuXHR0ZXN0KCd0YWJsZSBjb252ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGFibGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAndGFibGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93MScsICdyb3cyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnY2VsbDEnLCAnY2VsbDInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydjZWxsMycsICdjZWxsNCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0hlYWRlciAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnSGVhZGVyIDInKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDMnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxufCBIZWFkZXIgMSB8IEhlYWRlciAyIHxcbnwgLS0tIHwgLS0tIHxcbnwgRGF0YSAxIHwgRGF0YSAyIHxcbmA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkLnRyaW0oKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhYmxlIHdpdGggY29sdW1uaGVhZGVyIHJvbGUgKHRoIGVsZW1lbnRzKScsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3RhYmxlMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3RhYmxlJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3JvdzEnLCAncm93MiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2hlYWRlcjEnLCAnaGVhZGVyMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ2NlbGwzJywgJ2NlbGw0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRlcjEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2x1bW5oZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0hlYWRlciAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRlcjInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2x1bW5oZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0hlYWRlciAyJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGwzJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnRGF0YSAxJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGw0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnRGF0YSAyJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGBcbnwgSGVhZGVyIDEgfCBIZWFkZXIgMiB8XG58IC0tLSB8IC0tLSB8XG58IERhdGEgMSB8IERhdGEgMiB8XG5gO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBleHBlY3RlZC50cmltKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd0YWJsZSB3aXRoIHJvd2hlYWRlciByb2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGFibGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAndGFibGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93MScsICdyb3cyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93aGVhZGVyMScsICdjZWxsMiddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3cyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93JyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3Jvd2hlYWRlcjInLCAnY2VsbDQnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93aGVhZGVyMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3Jvd2hlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnUm93IDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93aGVhZGVyMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3Jvd2hlYWRlcicpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnUm93IDInKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDInKVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QVhUcmVlVG9NYXJrZG93bih0ZXN0VXJpLCBub2Rlcyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPVxuXHRcdFx0YFxufCBSb3cgMSB8IERhdGEgMSB8XG58IC0tLSB8IC0tLSB8XG58IFJvdyAyIHwgRGF0YSAyIHxcbmA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC50cmltKCksIGV4cGVjdGVkLnRyaW0oKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhYmxlIHdpdGggbWl4ZWQgY2VsbCB0eXBlcycsICgpID0+IHtcblx0XHRjb25zdCBub2RlczogQVhOb2RlW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3RhYmxlMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3RhYmxlJyksXG5cdFx0XHRcdGNoaWxkSWRzOiBbJ3JvdzEnLCAncm93MicsICdyb3czJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnaGVhZGVyMScsICdoZWFkZXIyJywgJ2hlYWRlcjMnXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydyb3doZWFkZXIxJywgJ2NlbGwyJywgJ2NlbGwzJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzMnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93aGVhZGVyMicsICdjZWxsNCcsICdjZWxsNSddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdoZWFkZXIxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY29sdW1uaGVhZGVyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdOYW1lJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2hlYWRlcjInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjb2x1bW5oZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0FnZScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdoZWFkZXIzJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY29sdW1uaGVhZGVyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdDaXR5Jylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3Jvd2hlYWRlcjEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3doZWFkZXInKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ0pvaG4nKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDInLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICcyNScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2NlbGwnKSxcblx0XHRcdFx0bmFtZTogY3JlYXRlQVhWYWx1ZSgnc3RyaW5nJywgJ05ZQycpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdyb3doZWFkZXIyJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAncm93aGVhZGVyJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdKYW5lJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ2NlbGw0Jyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAnY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnMzAnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDUnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdMQScpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRBWFRyZWVUb01hcmtkb3duKHRlc3RVcmksIG5vZGVzKTtcblx0XHRjb25zdCBleHBlY3RlZCA9XG5cdFx0XHRgXG58IE5hbWUgfCBBZ2UgfCBDaXR5IHxcbnwgLS0tIHwgLS0tIHwgLS0tIHxcbnwgSm9obiB8IDI1IHwgTllDIHxcbnwgSmFuZSB8IDMwIHwgTEEgfFxuYDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRyaW0oKSwgZXhwZWN0ZWQudHJpbSgpKTtcblx0fSk7XG5cblx0dGVzdCgndGFibGUgd2l0aCBncmlkY2VsbCByb2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vZGVzOiBBWE5vZGVbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAndGFibGUxJyxcblx0XHRcdFx0aWdub3JlZDogZmFsc2UsXG5cdFx0XHRcdHJvbGU6IGNyZWF0ZUFYVmFsdWUoJ3JvbGUnLCAndGFibGUnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsncm93MScsICdyb3cyJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5vZGVJZDogJ3JvdzEnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdyb3cnKSxcblx0XHRcdFx0Y2hpbGRJZHM6IFsnY2VsbDEnLCAnY2VsbDInXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAncm93MicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ3JvdycpLFxuXHRcdFx0XHRjaGlsZElkczogWydjZWxsMycsICdjZWxsNCddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMScsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2dyaWRjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdIZWFkZXIgMScpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMicsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2dyaWRjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdIZWFkZXIgMicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRub2RlSWQ6ICdjZWxsMycsXG5cdFx0XHRcdGlnbm9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyb2xlOiBjcmVhdGVBWFZhbHVlKCdyb2xlJywgJ2dyaWRjZWxsJyksXG5cdFx0XHRcdG5hbWU6IGNyZWF0ZUFYVmFsdWUoJ3N0cmluZycsICdEYXRhIDEnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bm9kZUlkOiAnY2VsbDQnLFxuXHRcdFx0XHRpZ25vcmVkOiBmYWxzZSxcblx0XHRcdFx0cm9sZTogY3JlYXRlQVhWYWx1ZSgncm9sZScsICdncmlkY2VsbCcpLFxuXHRcdFx0XHRuYW1lOiBjcmVhdGVBWFZhbHVlKCdzdHJpbmcnLCAnRGF0YSAyJylcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEFYVHJlZVRvTWFya2Rvd24odGVzdFVyaSwgbm9kZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID1cblx0XHRcdGBcbnwgSGVhZGVyIDEgfCBIZWFkZXIgMiB8XG58IC0tLSB8IC0tLSB8XG58IERhdGEgMSB8IERhdGEgMiB8XG5gO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHJpbSgpLCBleHBlY3RlZC50cmltKCkpO1xuXHR9KTtcblxuXHQvLyNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUEwRCwrQkFBK0I7QUFDekYsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSw0QkFBNEIsTUFBTTtBQUN2QywwQ0FBd0M7QUFFeEMsUUFBTSxVQUFVLElBQUksTUFBTSwwQkFBMEI7QUFFcEQsV0FBUyxjQUFjLE1BQW1CLE9BQVk7QUFDckQsV0FBTyxFQUFFLE1BQU0sTUFBTTtBQUFBLEVBQ3RCO0FBRUEsV0FBUyxpQkFBaUIsTUFBc0IsT0FBWSxPQUFvQixVQUFzQjtBQUNyRyxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsT0FBTyxjQUFjLE1BQU0sS0FBSztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUVBLE9BQUssbUNBQW1DLE1BQU07QUFDN0MsVUFBTSxTQUFTLHdCQUF3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
