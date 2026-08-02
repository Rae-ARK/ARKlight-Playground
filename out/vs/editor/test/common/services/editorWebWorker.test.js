import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { EditorWorker } from "../../../common/services/editorWebWorker.js";
suite("EditorWebWorker", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class WorkerWithModels extends EditorWorker {
    getModel(uri) {
      return this._getModel(uri);
    }
    addModel(lines, eol = "\n") {
      const uri = "test:file#" + Date.now();
      this.$acceptNewModel({
        url: uri,
        versionId: 1,
        lines,
        EOL: eol
      });
      return this._getModel(uri);
    }
  }
  let worker;
  let model;
  setup(() => {
    worker = new WorkerWithModels();
    model = worker.addModel([
      "This is line one",
      //16
      "and this is line number two",
      //27
      "it is followed by #3",
      //20
      "and finished with the fourth."
      //29
    ]);
  });
  function assertPositionAt(offset, line, column) {
    const position = model.positionAt(offset);
    assert.strictEqual(position.lineNumber, line);
    assert.strictEqual(position.column, column);
  }
  function assertOffsetAt(lineNumber, column, offset) {
    const actual = model.offsetAt({ lineNumber, column });
    assert.strictEqual(actual, offset);
  }
  test("ICommonModel#offsetAt", () => {
    assertOffsetAt(1, 1, 0);
    assertOffsetAt(1, 2, 1);
    assertOffsetAt(1, 17, 16);
    assertOffsetAt(2, 1, 17);
    assertOffsetAt(2, 4, 20);
    assertOffsetAt(3, 1, 45);
    assertOffsetAt(5, 30, 95);
    assertOffsetAt(5, 31, 95);
    assertOffsetAt(5, Number.MAX_VALUE, 95);
    assertOffsetAt(6, 30, 95);
    assertOffsetAt(Number.MAX_VALUE, 30, 95);
    assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
  });
  test("ICommonModel#positionAt", () => {
    assertPositionAt(0, 1, 1);
    assertPositionAt(Number.MIN_VALUE, 1, 1);
    assertPositionAt(1, 1, 2);
    assertPositionAt(16, 1, 17);
    assertPositionAt(17, 2, 1);
    assertPositionAt(20, 2, 4);
    assertPositionAt(45, 3, 1);
    assertPositionAt(95, 4, 30);
    assertPositionAt(96, 4, 30);
    assertPositionAt(99, 4, 30);
    assertPositionAt(Number.MAX_VALUE, 4, 30);
  });
  test("ICommonModel#validatePosition, issue #15882", function() {
    const model2 = worker.addModel(['{"id": "0001","type": "donut","name": "Cake","image":{"url": "images/0001.jpg","width": 200,"height": 200},"thumbnail":{"url": "images/thumbnails/0001.jpg","width": 32,"height": 32}}']);
    assert.strictEqual(model2.offsetAt({ lineNumber: 1, column: 2 }), 1);
  });
  test("MoreMinimal", () => {
    return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: "This is line One", range: new Range(1, 1, 1, 17) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "O");
      assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 15 });
    });
  });
  test("MoreMinimal, merge adjacent edits", async function() {
    const model2 = worker.addModel([
      "one",
      "two",
      "three",
      "four",
      "five"
    ], "\n");
    const newEdits = await worker.$computeMoreMinimalEdits(model2.uri.toString(), [
      {
        range: new Range(1, 1, 2, 1),
        text: "one\ntwo\nthree\n"
      },
      {
        range: new Range(2, 1, 3, 1),
        text: ""
      },
      {
        range: new Range(3, 1, 4, 1),
        text: ""
      },
      {
        range: new Range(4, 2, 4, 3),
        text: "4"
      },
      {
        range: new Range(5, 3, 5, 5),
        text: "5"
      }
    ], false);
    assert.strictEqual(newEdits.length, 2);
    assert.strictEqual(newEdits[0].text, "4");
    assert.strictEqual(newEdits[1].text, "5");
  });
  test("MoreMinimal, issue #15385 newline changes only", function() {
    const model2 = worker.addModel([
      "{",
      '	"a":1',
      "}"
    ], "\n");
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: '{\r\n	"a":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then((edits) => {
      assert.strictEqual(edits.length, 0);
    });
  });
  test("MoreMinimal, issue #15385 newline changes and other", function() {
    const model2 = worker.addModel([
      "{",
      '	"a":1',
      "}"
    ], "\n");
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: '{\r\n	"b":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "b");
      assert.deepStrictEqual(first.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 });
    });
  });
  test("MoreMinimal, issue #15385 newline changes and other 2/2", function() {
    const model2 = worker.addModel([
      "package main",
      // 1
      "func foo() {",
      // 2
      "}"
      // 3
    ]);
    return worker.$computeMoreMinimalEdits(model2.uri.toString(), [{ text: "\n", range: new Range(3, 2, 4, 1e3) }], false).then((edits) => {
      assert.strictEqual(edits.length, 1);
      const [first] = edits;
      assert.strictEqual(first.text, "\n");
      assert.deepStrictEqual(first.range, { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 2 });
    });
  });
  async function testEdits(lines, edits) {
    const model2 = worker.addModel(lines);
    const smallerEdits = await worker.$computeHumanReadableDiff(
      model2.uri.toString(),
      edits,
      { ignoreTrimWhitespace: false, maxComputationTimeMs: 0, computeMoves: false }
    );
    const t1 = applyEdits(model2.getValue(), edits);
    const t2 = applyEdits(model2.getValue(), smallerEdits);
    assert.deepStrictEqual(t1, t2);
    return smallerEdits.map((e) => ({ range: Range.lift(e.range).toString(), text: e.text }));
  }
  test("computeHumanReadableDiff 1", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function test() {}"
        ],
        [{
          text: "\n/** Some Comment */\n",
          range: new Range(1, 1, 1, 1)
        }]
      ),
      [{ range: "[1,1 -> 1,1]", text: "\n/** Some Comment */\n" }]
    );
  });
  test("computeHumanReadableDiff 2", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function test() {}"
        ],
        [{
          text: "function test(myParam: number) { console.log(myParam); }",
          range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
        }]
      ),
      [{ range: "[1,15 -> 1,15]", text: "myParam: number" }, { range: "[1,18 -> 1,18]", text: " console.log(myParam); " }]
    );
  });
  test("computeHumanReadableDiff 3", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "",
          "",
          "",
          ""
        ],
        [{
          text: "function test(myParam: number) { console.log(myParam); }\n\n",
          range: new Range(2, 1, 3, 20)
        }]
      ),
      [{ range: "[2,1 -> 2,1]", text: "function test(myParam: number) { console.log(myParam); }\n" }]
    );
  });
  test("computeHumanReadableDiff 4", async () => {
    assert.deepStrictEqual(
      await testEdits(
        [
          "function algorithm() {}"
        ],
        [{
          text: "function alm() {}",
          range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
        }]
      ),
      [{ range: "[1,10 -> 1,19]", text: "alm" }]
    );
  });
  test('[Bug] Getting Message "Overlapping ranges are not allowed" and nothing happens with Inline-Chat ', async function() {
    await testEdits(
      "const API = require('../src/api');\n\ndescribe('API', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe('GET /books', () => {\n    it('should return all books', async () => {\n      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const req = {};\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === '/books') {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe('GET /books/author/:author', () => {\n    it('should return books by author', async () => {\n      const mockAuthor = 'John Doe';\n      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          author: mockAuthor,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/author/${mockAuthor}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe('GET /books/title/:title', () => {\n    it('should return books by title', async () => {\n      const mockTitle = 'Book 1';\n      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          title: mockTitle,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/title/${mockTitle}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n});\n".split("\n"),
      [{
        range: { startLineNumber: 1, startColumn: 1, endLineNumber: 96, endColumn: 1 },
        text: `const request = require('supertest');
const API = require('../src/api');

describe('API', () => {
  let api;
  let database;

  beforeAll(() => {
    database = {
      getAllBooks: jest.fn(),
      getBooksByAuthor: jest.fn(),
      getBooksByTitle: jest.fn(),
    };
    api = new API(database);
  });

  describe('GET /books', () => {
    it('should return all books', async () => {
      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];
      database.getAllBooks.mockResolvedValue(mockBooks);

      const response = await request(api.app).get('/books');

      expect(database.getAllBooks).toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/author/:author', () => {
    it('should return books by author', async () => {
      const mockAuthor = 'John Doe';
      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];
      database.getBooksByAuthor.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(\`/books/author/\${mockAuthor}\`);

      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });

  describe('GET /books/title/:title', () => {
    it('should return books by title', async () => {
      const mockTitle = 'Book 1';
      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];
      database.getBooksByTitle.mockResolvedValue(mockBooks);

      const response = await request(api.app).get(\`/books/title/\${mockTitle}\`);

      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
    });
  });
});
`
      }]
    );
  });
  test("ICommonModel#getValueInRange, issue #17424", function() {
    const model2 = worker.addModel([
      "package main",
      // 1
      "func foo() {",
      // 2
      "}"
      // 3
    ]);
    const value = model2.getValueInRange({ startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 1 });
    assert.strictEqual(value, "}");
  });
  test("textualSuggest, issue #17785", function() {
    const model2 = worker.addModel([
      "foobar",
      // 1
      "f f"
      // 2
    ]);
    return worker.$textualSuggest([model2.uri.toString()], "f", "[a-z]+", "img").then((result) => {
      if (!result) {
        assert.ok(false);
      }
      assert.strictEqual(result.words.length, 1);
      assert.strictEqual(typeof result.duration, "number");
      assert.strictEqual(result.words[0], "foobar");
    });
  });
  test("get words via iterator, issue #46930", function() {
    const model2 = worker.addModel([
      "one line",
      // 1
      "two line",
      // 2
      "",
      "past empty",
      "single",
      "",
      "and now we are done"
    ]);
    const words = [...model2.words(/[a-z]+/img)];
    assert.deepStrictEqual(words, ["one", "line", "two", "line", "past", "empty", "single", "and", "now", "we", "are", "done"]);
  });
});
function applyEdits(text, edits) {
  const transformer = new PositionOffsetTransformer(text);
  const offsetEdits = edits.map((e) => {
    const range = Range.lift(e.range);
    return {
      startOffset: transformer.getOffset(range.getStartPosition()),
      endOffset: transformer.getOffset(range.getEndPosition()),
      text: e.text
    };
  });
  offsetEdits.sort((a, b) => b.startOffset - a.startOffset);
  for (const edit of offsetEdits) {
    text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
  }
  return text;
}
class PositionOffsetTransformer {
  constructor(text) {
    this.text = text;
    this.lineStartOffsetByLineIdx = [];
    this.lineStartOffsetByLineIdx.push(0);
    for (let i = 0; i < text.length; i++) {
      if (text.charAt(i) === "\n") {
        this.lineStartOffsetByLineIdx.push(i + 1);
      }
    }
    this.lineStartOffsetByLineIdx.push(text.length + 1);
  }
  getOffset(position) {
    const maxLineOffset = position.lineNumber >= this.lineStartOffsetByLineIdx.length ? this.text.length : this.lineStartOffsetByLineIdx[position.lineNumber] - 1;
    return Math.min(this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1, maxLineOffset);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEVkaXRvcldvcmtlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgSUNvbW1vbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RleHRNb2RlbFN5bmMvdGV4dE1vZGVsU3luYy5pbXBsLmpzJztcblxuc3VpdGUoJ0VkaXRvcldlYldvcmtlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBXb3JrZXJXaXRoTW9kZWxzIGV4dGVuZHMgRWRpdG9yV29ya2VyIHtcblxuXHRcdGdldE1vZGVsKHVyaTogc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0TW9kZWwodXJpKTtcblx0XHR9XG5cblx0XHRhZGRNb2RlbChsaW5lczogc3RyaW5nW10sIGVvbDogc3RyaW5nID0gJ1xcbicpIHtcblx0XHRcdGNvbnN0IHVyaSA9ICd0ZXN0OmZpbGUjJyArIERhdGUubm93KCk7XG5cdFx0XHR0aGlzLiRhY2NlcHROZXdNb2RlbCh7XG5cdFx0XHRcdHVybDogdXJpLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IDEsXG5cdFx0XHRcdGxpbmVzOiBsaW5lcyxcblx0XHRcdFx0RU9MOiBlb2xcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE1vZGVsKHVyaSkhO1xuXHRcdH1cblx0fVxuXG5cdGxldCB3b3JrZXI6IFdvcmtlcldpdGhNb2RlbHM7XG5cdGxldCBtb2RlbDogSUNvbW1vbk1vZGVsO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR3b3JrZXIgPSBuZXcgV29ya2VyV2l0aE1vZGVscygpO1xuXHRcdG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRdKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UG9zaXRpb25BdChvZmZzZXQ6IG51bWJlciwgbGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gbW9kZWwucG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb3NpdGlvbi5saW5lTnVtYmVyLCBsaW5lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9zaXRpb24uY29sdW1uLCBjb2x1bW4pO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0T2Zmc2V0QXQobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgb2Zmc2V0OiBudW1iZXIpIHtcblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5vZmZzZXRBdCh7IGxpbmVOdW1iZXIsIGNvbHVtbiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBvZmZzZXQpO1xuXHR9XG5cblx0dGVzdCgnSUNvbW1vbk1vZGVsI29mZnNldEF0JywgKCkgPT4ge1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDEsIDApO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDIsIDEpO1xuXHRcdGFzc2VydE9mZnNldEF0KDEsIDE3LCAxNik7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoMiwgMSwgMTcpO1xuXHRcdGFzc2VydE9mZnNldEF0KDIsIDQsIDIwKTtcblx0XHRhc3NlcnRPZmZzZXRBdCgzLCAxLCA0NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoNSwgMzAsIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdCg1LCAzMSwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KDUsIE51bWJlci5NQVhfVkFMVUUsIDk1KTtcblx0XHRhc3NlcnRPZmZzZXRBdCg2LCAzMCwgOTUpO1xuXHRcdGFzc2VydE9mZnNldEF0KE51bWJlci5NQVhfVkFMVUUsIDMwLCA5NSk7XG5cdFx0YXNzZXJ0T2Zmc2V0QXQoTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSwgOTUpO1xuXHR9KTtcblxuXHR0ZXN0KCdJQ29tbW9uTW9kZWwjcG9zaXRpb25BdCcsICgpID0+IHtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDAsIDEsIDEpO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoTnVtYmVyLk1JTl9WQUxVRSwgMSwgMSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCgxLCAxLCAyKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDE2LCAxLCAxNyk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCgxNywgMiwgMSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCgyMCwgMiwgNCk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCg0NSwgMywgMSk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdCg5NSwgNCwgMzApO1xuXHRcdGFzc2VydFBvc2l0aW9uQXQoOTYsIDQsIDMwKTtcblx0XHRhc3NlcnRQb3NpdGlvbkF0KDk5LCA0LCAzMCk7XG5cdFx0YXNzZXJ0UG9zaXRpb25BdChOdW1iZXIuTUFYX1ZBTFVFLCA0LCAzMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lDb21tb25Nb2RlbCN2YWxpZGF0ZVBvc2l0aW9uLCBpc3N1ZSAjMTU4ODInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwoWyd7XCJpZFwiOiBcIjAwMDFcIixcInR5cGVcIjogXCJkb251dFwiLFwibmFtZVwiOiBcIkNha2VcIixcImltYWdlXCI6e1widXJsXCI6IFwiaW1hZ2VzLzAwMDEuanBnXCIsXCJ3aWR0aFwiOiAyMDAsXCJoZWlnaHRcIjogMjAwfSxcInRodW1ibmFpbFwiOntcInVybFwiOiBcImltYWdlcy90aHVtYm5haWxzLzAwMDEuanBnXCIsXCJ3aWR0aFwiOiAzMixcImhlaWdodFwiOiAzMn19J10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5vZmZzZXRBdCh7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMiB9KSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01vcmVNaW5pbWFsJywgKCkgPT4ge1xuXG5cdFx0cmV0dXJuIHdvcmtlci4kY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMobW9kZWwudXJpLnRvU3RyaW5nKCksIFt7IHRleHQ6ICdUaGlzIGlzIGxpbmUgT25lJywgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxNykgfV0sIGZhbHNlKS50aGVuKGVkaXRzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IGVkaXRzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHQsICdPJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDE0LCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDE1IH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNb3JlTWluaW1hbCwgbWVyZ2UgYWRqYWNlbnQgZWRpdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQnb25lJyxcblx0XHRcdCd0d28nLFxuXHRcdFx0J3RocmVlJyxcblx0XHRcdCdmb3VyJyxcblx0XHRcdCdmaXZlJ1xuXHRcdF0sICdcXG4nKTtcblxuXG5cdFx0Y29uc3QgbmV3RWRpdHMgPSBhd2FpdCB3b3JrZXIuJGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaS50b1N0cmluZygpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMiwgMSksXG5cdFx0XHRcdHRleHQ6ICdvbmVcXG50d29cXG50aHJlZVxcbicsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMywgMSksXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDMsIDEsIDQsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSg0LCAyLCA0LCAzKSxcblx0XHRcdFx0dGV4dDogJzQnLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDUsIDMsIDUsIDUpLFxuXHRcdFx0XHR0ZXh0OiAnNScsXG5cdFx0XHR9XG5cdFx0XSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0VkaXRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0VkaXRzWzBdLnRleHQsICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0VkaXRzWzFdLnRleHQsICc1Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ01vcmVNaW5pbWFsLCBpc3N1ZSAjMTUzODUgbmV3bGluZSBjaGFuZ2VzIG9ubHknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQneycsXG5cdFx0XHQnXFx0XCJhXCI6MScsXG5cdFx0XHQnfSdcblx0XHRdLCAnXFxuJyk7XG5cblx0XHRyZXR1cm4gd29ya2VyLiRjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmkudG9TdHJpbmcoKSwgW3sgdGV4dDogJ3tcXHJcXG5cXHRcImFcIjoxXFxyXFxufScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMywgMikgfV0sIGZhbHNlKS50aGVuKGVkaXRzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNb3JlTWluaW1hbCwgaXNzdWUgIzE1Mzg1IG5ld2xpbmUgY2hhbmdlcyBhbmQgb3RoZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQneycsXG5cdFx0XHQnXFx0XCJhXCI6MScsXG5cdFx0XHQnfSdcblx0XHRdLCAnXFxuJyk7XG5cblx0XHRyZXR1cm4gd29ya2VyLiRjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhtb2RlbC51cmkudG9TdHJpbmcoKSwgW3sgdGV4dDogJ3tcXHJcXG5cXHRcImJcIjoxXFxyXFxufScsIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMywgMikgfV0sIGZhbHNlKS50aGVuKGVkaXRzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IGVkaXRzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHQsICdiJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogNCB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTW9yZU1pbmltYWwsIGlzc3VlICMxNTM4NSBuZXdsaW5lIGNoYW5nZXMgYW5kIG90aGVyIDIvMicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gd29ya2VyLmFkZE1vZGVsKFtcblx0XHRcdCdwYWNrYWdlIG1haW4nLFx0Ly8gMVxuXHRcdFx0J2Z1bmMgZm9vKCkgeycsXHQvLyAyXG5cdFx0XHQnfSdcdFx0XHRcdC8vIDNcblx0XHRdKTtcblxuXHRcdHJldHVybiB3b3JrZXIuJGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsLnVyaS50b1N0cmluZygpLCBbeyB0ZXh0OiAnXFxuJywgcmFuZ2U6IG5ldyBSYW5nZSgzLCAyLCA0LCAxMDAwKSB9XSwgZmFsc2UpLnRoZW4oZWRpdHMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gZWRpdHM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiAyLCBlbmRMaW5lTnVtYmVyOiAzLCBlbmRDb2x1bW46IDIgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RFZGl0cyhsaW5lczogc3RyaW5nW10sIGVkaXRzOiBUZXh0RWRpdFtdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwobGluZXMpO1xuXG5cdFx0Y29uc3Qgc21hbGxlckVkaXRzID0gYXdhaXQgd29ya2VyLiRjb21wdXRlSHVtYW5SZWFkYWJsZURpZmYoXG5cdFx0XHRtb2RlbC51cmkudG9TdHJpbmcoKSxcblx0XHRcdGVkaXRzLFxuXHRcdFx0eyBpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsIG1heENvbXB1dGF0aW9uVGltZU1zOiAwLCBjb21wdXRlTW92ZXM6IGZhbHNlIH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgdDEgPSBhcHBseUVkaXRzKG1vZGVsLmdldFZhbHVlKCksIGVkaXRzKTtcblx0XHRjb25zdCB0MiA9IGFwcGx5RWRpdHMobW9kZWwuZ2V0VmFsdWUoKSwgc21hbGxlckVkaXRzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQxLCB0Mik7XG5cblx0XHRyZXR1cm4gc21hbGxlckVkaXRzLm1hcChlID0+ICh7IHJhbmdlOiBSYW5nZS5saWZ0KGUucmFuZ2UpLnRvU3RyaW5nKCksIHRleHQ6IGUudGV4dCB9KSk7XG5cdH1cblxuXG5cdHRlc3QoJ2NvbXB1dGVIdW1hblJlYWRhYmxlRGlmZiAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCB0ZXN0RWRpdHMoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnZnVuY3Rpb24gdGVzdCgpIHt9J1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdHRleHQ6ICdcXG4vKiogU29tZSBDb21tZW50ICovXFxuJyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpXG5cdFx0XHRcdH1dKSxcblx0XHRcdChbeyByYW5nZTogJ1sxLDEgLT4gMSwxXScsIHRleHQ6ICdcXG4vKiogU29tZSBDb21tZW50ICovXFxuJyB9XSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlSHVtYW5SZWFkYWJsZURpZmYgMicsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgdGVzdEVkaXRzKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2Z1bmN0aW9uIHRlc3QoKSB7fSdcblx0XHRcdFx0XSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHR0ZXh0OiAnZnVuY3Rpb24gdGVzdChteVBhcmFtOiBudW1iZXIpIHsgY29uc29sZS5sb2cobXlQYXJhbSk7IH0nLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpXG5cdFx0XHRcdH1dKSxcblx0XHRcdChbeyByYW5nZTogJ1sxLDE1IC0+IDEsMTVdJywgdGV4dDogJ215UGFyYW06IG51bWJlcicgfSwgeyByYW5nZTogJ1sxLDE4IC0+IDEsMThdJywgdGV4dDogJyBjb25zb2xlLmxvZyhteVBhcmFtKTsgJyB9XSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlSHVtYW5SZWFkYWJsZURpZmYgMycsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgdGVzdEVkaXRzKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0Jydcblx0XHRcdFx0XSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHR0ZXh0OiAnZnVuY3Rpb24gdGVzdChteVBhcmFtOiBudW1iZXIpIHsgY29uc29sZS5sb2cobXlQYXJhbSk7IH1cXG5cXG4nLFxuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMywgMjApXG5cdFx0XHRcdH1dKSxcblx0XHRcdChbeyByYW5nZTogJ1syLDEgLT4gMiwxXScsIHRleHQ6ICdmdW5jdGlvbiB0ZXN0KG15UGFyYW06IG51bWJlcikgeyBjb25zb2xlLmxvZyhteVBhcmFtKTsgfVxcbicgfV0pXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUh1bWFuUmVhZGFibGVEaWZmIDQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IHRlc3RFZGl0cyhcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdmdW5jdGlvbiBhbGdvcml0aG0oKSB7fScsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0dGV4dDogJ2Z1bmN0aW9uIGFsbSgpIHt9Jyxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKVxuXHRcdFx0XHR9XSksXG5cdFx0XHQoW3sgcmFuZ2U6ICdbMSwxMCAtPiAxLDE5XScsIHRleHQ6ICdhbG0nIH1dKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tCdWddIEdldHRpbmcgTWVzc2FnZSBcIk92ZXJsYXBwaW5nIHJhbmdlcyBhcmUgbm90IGFsbG93ZWRcIiBhbmQgbm90aGluZyBoYXBwZW5zIHdpdGggSW5saW5lLUNoYXQgJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHRlc3RFZGl0cygoJ2NvbnN0IEFQSSA9IHJlcXVpcmUoXFwnLi4vc3JjL2FwaVxcJyk7XFxuXFxuZGVzY3JpYmUoXFwnQVBJXFwnLCAoKSA9PiB7XFxuICBsZXQgYXBpO1xcbiAgbGV0IGRhdGFiYXNlO1xcblxcbiAgYmVmb3JlQWxsKCgpID0+IHtcXG4gICAgZGF0YWJhc2UgPSB7XFxuICAgICAgZ2V0QWxsQm9va3M6IGplc3QuZm4oKSxcXG4gICAgICBnZXRCb29rc0J5QXV0aG9yOiBqZXN0LmZuKCksXFxuICAgICAgZ2V0Qm9va3NCeVRpdGxlOiBqZXN0LmZuKCksXFxuICAgIH07XFxuICAgIGFwaSA9IG5ldyBBUEkoZGF0YWJhc2UpO1xcbiAgfSk7XFxuXFxuICBkZXNjcmliZShcXCdHRVQgL2Jvb2tzXFwnLCAoKSA9PiB7XFxuICAgIGl0KFxcJ3Nob3VsZCByZXR1cm4gYWxsIGJvb2tzXFwnLCBhc3luYyAoKSA9PiB7XFxuICAgICAgY29uc3QgbW9ja0Jvb2tzID0gW3sgdGl0bGU6IFxcJ0Jvb2sgMVxcJyB9LCB7IHRpdGxlOiBcXCdCb29rIDJcXCcgfV07XFxuICAgICAgZGF0YWJhc2UuZ2V0QWxsQm9va3MubW9ja1Jlc29sdmVkVmFsdWUobW9ja0Jvb2tzKTtcXG5cXG4gICAgICBjb25zdCByZXEgPSB7fTtcXG4gICAgICBjb25zdCByZXMgPSB7XFxuICAgICAgICBqc29uOiBqZXN0LmZuKCksXFxuICAgICAgfTtcXG5cXG4gICAgICBhd2FpdCBhcGkucmVnaXN0ZXIoe1xcbiAgICAgICAgZ2V0OiAocGF0aCwgaGFuZGxlcikgPT4ge1xcbiAgICAgICAgICBpZiAocGF0aCA9PT0gXFwnL2Jvb2tzXFwnKSB7XFxuICAgICAgICAgICAgaGFuZGxlcihyZXEsIHJlcyk7XFxuICAgICAgICAgIH1cXG4gICAgICAgIH0sXFxuICAgICAgfSk7XFxuXFxuICAgICAgZXhwZWN0KGRhdGFiYXNlLmdldEFsbEJvb2tzKS50b0hhdmVCZWVuQ2FsbGVkKCk7XFxuICAgICAgZXhwZWN0KHJlcy5qc29uKS50b0hhdmVCZWVuQ2FsbGVkV2l0aChtb2NrQm9va3MpO1xcbiAgICB9KTtcXG4gIH0pO1xcblxcbiAgZGVzY3JpYmUoXFwnR0VUIC9ib29rcy9hdXRob3IvOmF1dGhvclxcJywgKCkgPT4ge1xcbiAgICBpdChcXCdzaG91bGQgcmV0dXJuIGJvb2tzIGJ5IGF1dGhvclxcJywgYXN5bmMgKCkgPT4ge1xcbiAgICAgIGNvbnN0IG1vY2tBdXRob3IgPSBcXCdKb2huIERvZVxcJztcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogXFwnQm9vayAxXFwnLCBhdXRob3I6IG1vY2tBdXRob3IgfSwgeyB0aXRsZTogXFwnQm9vayAyXFwnLCBhdXRob3I6IG1vY2tBdXRob3IgfV07XFxuICAgICAgZGF0YWJhc2UuZ2V0Qm9va3NCeUF1dGhvci5tb2NrUmVzb2x2ZWRWYWx1ZShtb2NrQm9va3MpO1xcblxcbiAgICAgIGNvbnN0IHJlcSA9IHtcXG4gICAgICAgIHBhcmFtczoge1xcbiAgICAgICAgICBhdXRob3I6IG1vY2tBdXRob3IsXFxuICAgICAgICB9LFxcbiAgICAgIH07XFxuICAgICAgY29uc3QgcmVzID0ge1xcbiAgICAgICAganNvbjogamVzdC5mbigpLFxcbiAgICAgIH07XFxuXFxuICAgICAgYXdhaXQgYXBpLnJlZ2lzdGVyKHtcXG4gICAgICAgIGdldDogKHBhdGgsIGhhbmRsZXIpID0+IHtcXG4gICAgICAgICAgaWYgKHBhdGggPT09IGAvYm9va3MvYXV0aG9yLyR7bW9ja0F1dGhvcn1gKSB7XFxuICAgICAgICAgICAgaGFuZGxlcihyZXEsIHJlcyk7XFxuICAgICAgICAgIH1cXG4gICAgICAgIH0sXFxuICAgICAgfSk7XFxuXFxuICAgICAgZXhwZWN0KGRhdGFiYXNlLmdldEJvb2tzQnlBdXRob3IpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKG1vY2tBdXRob3IpO1xcbiAgICAgIGV4cGVjdChyZXMuanNvbikudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja0Jvb2tzKTtcXG4gICAgfSk7XFxuICB9KTtcXG5cXG4gIGRlc2NyaWJlKFxcJ0dFVCAvYm9va3MvdGl0bGUvOnRpdGxlXFwnLCAoKSA9PiB7XFxuICAgIGl0KFxcJ3Nob3VsZCByZXR1cm4gYm9va3MgYnkgdGl0bGVcXCcsIGFzeW5jICgpID0+IHtcXG4gICAgICBjb25zdCBtb2NrVGl0bGUgPSBcXCdCb29rIDFcXCc7XFxuICAgICAgY29uc3QgbW9ja0Jvb2tzID0gW3sgdGl0bGU6IG1vY2tUaXRsZSwgYXV0aG9yOiBcXCdKb2huIERvZVxcJyB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRCb29rc0J5VGl0bGUubW9ja1Jlc29sdmVkVmFsdWUobW9ja0Jvb2tzKTtcXG5cXG4gICAgICBjb25zdCByZXEgPSB7XFxuICAgICAgICBwYXJhbXM6IHtcXG4gICAgICAgICAgdGl0bGU6IG1vY2tUaXRsZSxcXG4gICAgICAgIH0sXFxuICAgICAgfTtcXG4gICAgICBjb25zdCByZXMgPSB7XFxuICAgICAgICBqc29uOiBqZXN0LmZuKCksXFxuICAgICAgfTtcXG5cXG4gICAgICBhd2FpdCBhcGkucmVnaXN0ZXIoe1xcbiAgICAgICAgZ2V0OiAocGF0aCwgaGFuZGxlcikgPT4ge1xcbiAgICAgICAgICBpZiAocGF0aCA9PT0gYC9ib29rcy90aXRsZS8ke21vY2tUaXRsZX1gKSB7XFxuICAgICAgICAgICAgaGFuZGxlcihyZXEsIHJlcyk7XFxuICAgICAgICAgIH1cXG4gICAgICAgIH0sXFxuICAgICAgfSk7XFxuXFxuICAgICAgZXhwZWN0KGRhdGFiYXNlLmdldEJvb2tzQnlUaXRsZSkudG9IYXZlQmVlbkNhbGxlZFdpdGgobW9ja1RpdGxlKTtcXG4gICAgICBleHBlY3QocmVzLmpzb24pLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKG1vY2tCb29rcyk7XFxuICAgIH0pO1xcbiAgfSk7XFxufSk7XFxuJykuc3BsaXQoJ1xcbicpLFxuXHRcdFx0W3tcblx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogOTYsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHR0ZXh0OiBgY29uc3QgcmVxdWVzdCA9IHJlcXVpcmUoJ3N1cGVydGVzdCcpO1xcbmNvbnN0IEFQSSA9IHJlcXVpcmUoJy4uL3NyYy9hcGknKTtcXG5cXG5kZXNjcmliZSgnQVBJJywgKCkgPT4ge1xcbiAgbGV0IGFwaTtcXG4gIGxldCBkYXRhYmFzZTtcXG5cXG4gIGJlZm9yZUFsbCgoKSA9PiB7XFxuICAgIGRhdGFiYXNlID0ge1xcbiAgICAgIGdldEFsbEJvb2tzOiBqZXN0LmZuKCksXFxuICAgICAgZ2V0Qm9va3NCeUF1dGhvcjogamVzdC5mbigpLFxcbiAgICAgIGdldEJvb2tzQnlUaXRsZTogamVzdC5mbigpLFxcbiAgICB9O1xcbiAgICBhcGkgPSBuZXcgQVBJKGRhdGFiYXNlKTtcXG4gIH0pO1xcblxcbiAgZGVzY3JpYmUoJ0dFVCAvYm9va3MnLCAoKSA9PiB7XFxuICAgIGl0KCdzaG91bGQgcmV0dXJuIGFsbCBib29rcycsIGFzeW5jICgpID0+IHtcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogJ0Jvb2sgMScgfSwgeyB0aXRsZTogJ0Jvb2sgMicgfV07XFxuICAgICAgZGF0YWJhc2UuZ2V0QWxsQm9va3MubW9ja1Jlc29sdmVkVmFsdWUobW9ja0Jvb2tzKTtcXG5cXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoYXBpLmFwcCkuZ2V0KCcvYm9va3MnKTtcXG5cXG4gICAgICBleHBlY3QoZGF0YWJhc2UuZ2V0QWxsQm9va3MpLnRvSGF2ZUJlZW5DYWxsZWQoKTtcXG4gICAgICBleHBlY3QocmVzcG9uc2Uuc3RhdHVzKS50b0JlKDIwMCk7XFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLmJvZHkpLnRvRXF1YWwobW9ja0Jvb2tzKTtcXG4gICAgfSk7XFxuICB9KTtcXG5cXG4gIGRlc2NyaWJlKCdHRVQgL2Jvb2tzL2F1dGhvci86YXV0aG9yJywgKCkgPT4ge1xcbiAgICBpdCgnc2hvdWxkIHJldHVybiBib29rcyBieSBhdXRob3InLCBhc3luYyAoKSA9PiB7XFxuICAgICAgY29uc3QgbW9ja0F1dGhvciA9ICdKb2huIERvZSc7XFxuICAgICAgY29uc3QgbW9ja0Jvb2tzID0gW3sgdGl0bGU6ICdCb29rIDEnLCBhdXRob3I6IG1vY2tBdXRob3IgfSwgeyB0aXRsZTogJ0Jvb2sgMicsIGF1dGhvcjogbW9ja0F1dGhvciB9XTtcXG4gICAgICBkYXRhYmFzZS5nZXRCb29rc0J5QXV0aG9yLm1vY2tSZXNvbHZlZFZhbHVlKG1vY2tCb29rcyk7XFxuXFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KGFwaS5hcHApLmdldChcXGAvYm9va3MvYXV0aG9yL1xcJHttb2NrQXV0aG9yfVxcYCk7XFxuXFxuICAgICAgZXhwZWN0KGRhdGFiYXNlLmdldEJvb2tzQnlBdXRob3IpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKG1vY2tBdXRob3IpO1xcbiAgICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMpLnRvQmUoMjAwKTtcXG4gICAgICBleHBlY3QocmVzcG9uc2UuYm9keSkudG9FcXVhbChtb2NrQm9va3MpO1xcbiAgICB9KTtcXG4gIH0pO1xcblxcbiAgZGVzY3JpYmUoJ0dFVCAvYm9va3MvdGl0bGUvOnRpdGxlJywgKCkgPT4ge1xcbiAgICBpdCgnc2hvdWxkIHJldHVybiBib29rcyBieSB0aXRsZScsIGFzeW5jICgpID0+IHtcXG4gICAgICBjb25zdCBtb2NrVGl0bGUgPSAnQm9vayAxJztcXG4gICAgICBjb25zdCBtb2NrQm9va3MgPSBbeyB0aXRsZTogbW9ja1RpdGxlLCBhdXRob3I6ICdKb2huIERvZScgfV07XFxuICAgICAgZGF0YWJhc2UuZ2V0Qm9va3NCeVRpdGxlLm1vY2tSZXNvbHZlZFZhbHVlKG1vY2tCb29rcyk7XFxuXFxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KGFwaS5hcHApLmdldChcXGAvYm9va3MvdGl0bGUvXFwke21vY2tUaXRsZX1cXGApO1xcblxcbiAgICAgIGV4cGVjdChkYXRhYmFzZS5nZXRCb29rc0J5VGl0bGUpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKG1vY2tUaXRsZSk7XFxuICAgICAgZXhwZWN0KHJlc3BvbnNlLnN0YXR1cykudG9CZSgyMDApO1xcbiAgICAgIGV4cGVjdChyZXNwb25zZS5ib2R5KS50b0VxdWFsKG1vY2tCb29rcyk7XFxuICAgIH0pO1xcbiAgfSk7XFxufSk7XFxuYCxcblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnSUNvbW1vbk1vZGVsI2dldFZhbHVlSW5SYW5nZSwgaXNzdWUgIzE3NDI0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwoW1xuXHRcdFx0J3BhY2thZ2UgbWFpbicsXHQvLyAxXG5cdFx0XHQnZnVuYyBmb28oKSB7JyxcdC8vIDJcblx0XHRcdCd9J1x0XHRcdFx0Ly8gM1xuXHRcdF0pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAnfScpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ3RleHR1YWxTdWdnZXN0LCBpc3N1ZSAjMTc3ODUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IHdvcmtlci5hZGRNb2RlbChbXG5cdFx0XHQnZm9vYmFyJyxcdC8vIDFcblx0XHRcdCdmIGYnXHQvLyAyXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4gd29ya2VyLiR0ZXh0dWFsU3VnZ2VzdChbbW9kZWwudXJpLnRvU3RyaW5nKCldLCAnZicsICdbYS16XSsnLCAnaW1nJykudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRhc3NlcnQub2soZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC53b3Jkcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQuZHVyYXRpb24sICdudW1iZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQud29yZHNbMF0sICdmb29iYXInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IHdvcmRzIHZpYSBpdGVyYXRvciwgaXNzdWUgIzQ2OTMwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB3b3JrZXIuYWRkTW9kZWwoW1xuXHRcdFx0J29uZSBsaW5lJyxcdC8vIDFcblx0XHRcdCd0d28gbGluZScsXHQvLyAyXG5cdFx0XHQnJyxcblx0XHRcdCdwYXN0IGVtcHR5Jyxcblx0XHRcdCdzaW5nbGUnLFxuXHRcdFx0JycsXG5cdFx0XHQnYW5kIG5vdyB3ZSBhcmUgZG9uZSdcblx0XHRdKTtcblxuXHRcdGNvbnN0IHdvcmRzOiBzdHJpbmdbXSA9IFsuLi5tb2RlbC53b3JkcygvW2Etel0rL2ltZyldO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3b3JkcywgWydvbmUnLCAnbGluZScsICd0d28nLCAnbGluZScsICdwYXN0JywgJ2VtcHR5JywgJ3NpbmdsZScsICdhbmQnLCAnbm93JywgJ3dlJywgJ2FyZScsICdkb25lJ10pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBhcHBseUVkaXRzKHRleHQ6IHN0cmluZywgZWRpdHM6IHsgcmFuZ2U6IElSYW5nZTsgdGV4dDogc3RyaW5nIH1bXSk6IHN0cmluZyB7XG5cdGNvbnN0IHRyYW5zZm9ybWVyID0gbmV3IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIodGV4dCk7XG5cdGNvbnN0IG9mZnNldEVkaXRzID0gZWRpdHMubWFwKGUgPT4ge1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UubGlmdChlLnJhbmdlKTtcblx0XHRyZXR1cm4gKHtcblx0XHRcdHN0YXJ0T2Zmc2V0OiB0cmFuc2Zvcm1lci5nZXRPZmZzZXQocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSxcblx0XHRcdGVuZE9mZnNldDogdHJhbnNmb3JtZXIuZ2V0T2Zmc2V0KHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpLFxuXHRcdFx0dGV4dDogZS50ZXh0XG5cdFx0fSk7XG5cdH0pO1xuXG5cdG9mZnNldEVkaXRzLnNvcnQoKGEsIGIpID0+IGIuc3RhcnRPZmZzZXQgLSBhLnN0YXJ0T2Zmc2V0KTtcblxuXHRmb3IgKGNvbnN0IGVkaXQgb2Ygb2Zmc2V0RWRpdHMpIHtcblx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgZWRpdC5zdGFydE9mZnNldCkgKyBlZGl0LnRleHQgKyB0ZXh0LnN1YnN0cmluZyhlZGl0LmVuZE9mZnNldCk7XG5cdH1cblxuXHRyZXR1cm4gdGV4dDtcbn1cblxuY2xhc3MgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4OiBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHRleHQ6IHN0cmluZykge1xuXHRcdHRoaXMubGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4ID0gW107XG5cdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgucHVzaCgwKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0ZXh0LmNoYXJBdChpKSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgucHVzaChpICsgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4LnB1c2godGV4dC5sZW5ndGggKyAxKTtcblx0fVxuXG5cdGdldE9mZnNldChwb3NpdGlvbjogUG9zaXRpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IG1heExpbmVPZmZzZXQgPSBwb3NpdGlvbi5saW5lTnVtYmVyID49IHRoaXMubGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4Lmxlbmd0aCA/IHRoaXMudGV4dC5sZW5ndGggOiAodGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHhbcG9zaXRpb24ubGluZU51bWJlcl0gLSAxKTtcblx0XHRyZXR1cm4gTWF0aC5taW4odGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHhbcG9zaXRpb24ubGluZU51bWJlciAtIDFdICsgcG9zaXRpb24uY29sdW1uIC0gMSwgbWF4TGluZU9mZnNldCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUFpQixhQUFhO0FBRTlCLFNBQVMsb0JBQW9CO0FBRzdCLE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsMENBQXdDO0FBQUEsRUFFeEMsTUFBTSx5QkFBeUIsYUFBYTtBQUFBLElBRTNDLFNBQVMsS0FBYTtBQUNyQixhQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsSUFDMUI7QUFBQSxJQUVBLFNBQVMsT0FBaUIsTUFBYyxNQUFNO0FBQzdDLFlBQU0sTUFBTSxlQUFlLEtBQUssSUFBSTtBQUNwQyxXQUFLLGdCQUFnQjtBQUFBLFFBQ3BCLEtBQUs7QUFBQSxRQUNMLFdBQVc7QUFBQSxRQUNYO0FBQUEsUUFDQSxLQUFLO0FBQUEsTUFDTixDQUFDO0FBQ0QsYUFBTyxLQUFLLFVBQVUsR0FBRztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUVBLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsYUFBUyxJQUFJLGlCQUFpQjtBQUM5QixZQUFRLE9BQU8sU0FBUztBQUFBLE1BQ3ZCO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxXQUFTLGlCQUFpQixRQUFnQixNQUFjLFFBQWdCO0FBQ3ZFLFVBQU0sV0FBVyxNQUFNLFdBQVcsTUFBTTtBQUN4QyxXQUFPLFlBQVksU0FBUyxZQUFZLElBQUk7QUFDNUMsV0FBTyxZQUFZLFNBQVMsUUFBUSxNQUFNO0FBQUEsRUFDM0M7QUFFQSxXQUFTLGVBQWUsWUFBb0IsUUFBZ0IsUUFBZ0I7QUFDM0UsVUFBTSxTQUFTLE1BQU0sU0FBUyxFQUFFLFlBQVksT0FBTyxDQUFDO0FBQ3BELFdBQU8sWUFBWSxR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
