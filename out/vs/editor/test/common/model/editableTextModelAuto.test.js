import { CharCode } from "../../../../base/common/charCode.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { testApplyEditsWithSyncedModels } from "./editableTextModelTestUtils.js";
const GENERATE_TESTS = false;
suite("EditorModel Auto Tests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n"),
      forceMoveMarkers: false
    };
  }
  test("auto1", () => {
    testApplyEditsWithSyncedModels(
      [
        "ioe",
        "",
        "yjct",
        "",
        ""
      ],
      [
        editOp(1, 2, 1, 2, ["b", "r", "fq"]),
        editOp(1, 4, 2, 1, ["", ""])
      ],
      [
        "ib",
        "r",
        "fqoe",
        "",
        "yjct",
        "",
        ""
      ]
    );
  });
  test("auto2", () => {
    testApplyEditsWithSyncedModels(
      [
        "f",
        "littnhskrq",
        "utxvsizqnk",
        "lslqz",
        "jxn",
        "gmm"
      ],
      [
        editOp(1, 2, 1, 2, ["", "o"]),
        editOp(2, 4, 2, 4, ["zaq", "avb"]),
        editOp(2, 5, 6, 2, ["jlr", "zl", "j"])
      ],
      [
        "f",
        "o",
        "litzaq",
        "avbtjlr",
        "zl",
        "jmm"
      ]
    );
  });
  test("auto3", () => {
    testApplyEditsWithSyncedModels(
      [
        "ofw",
        "qsxmziuvzw",
        "rp",
        "qsnymek",
        "elth",
        "wmgzbwudxz",
        "iwsdkndh",
        "bujlbwb",
        "asuouxfv",
        "xuccnb"
      ],
      [
        editOp(4, 3, 4, 3, [""])
      ],
      [
        "ofw",
        "qsxmziuvzw",
        "rp",
        "qsnymek",
        "elth",
        "wmgzbwudxz",
        "iwsdkndh",
        "bujlbwb",
        "asuouxfv",
        "xuccnb"
      ]
    );
  });
  test("auto4", () => {
    testApplyEditsWithSyncedModels(
      [
        "fefymj",
        "qum",
        "vmiwxxaiqq",
        "dz",
        "lnqdgorosf"
      ],
      [
        editOp(1, 3, 1, 5, ["hp"]),
        editOp(1, 7, 2, 1, ["kcg", "", "mpx"]),
        editOp(2, 2, 2, 2, ["", "aw", ""]),
        editOp(2, 2, 2, 2, ["vqr", "mo"]),
        editOp(4, 2, 5, 3, ["xyc"])
      ],
      [
        "fehpmjkcg",
        "",
        "mpxq",
        "aw",
        "vqr",
        "moum",
        "vmiwxxaiqq",
        "dxycqdgorosf"
      ]
    );
  });
});
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomString(minLength, maxLength) {
  const length = getRandomInt(minLength, maxLength);
  let r = "";
  for (let i = 0; i < length; i++) {
    r += String.fromCharCode(getRandomInt(CharCode.a, CharCode.z));
  }
  return r;
}
function generateFile(small) {
  const lineCount = getRandomInt(1, small ? 3 : 10);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(getRandomString(0, small ? 3 : 10));
  }
  return lines.join("\n");
}
function generateEdits(content) {
  const result = [];
  let cnt = getRandomInt(1, 5);
  let maxOffset = content.length;
  while (cnt > 0 && maxOffset > 0) {
    const offset = getRandomInt(0, maxOffset);
    const length = getRandomInt(0, maxOffset - offset);
    const text = generateFile(true);
    result.push({
      offset,
      length,
      text
    });
    maxOffset = offset;
    cnt--;
  }
  result.reverse();
  return result;
}
class TestModel {
  static _generateOffsetToPosition(content) {
    const result = [];
    let lineNumber = 1;
    let column = 1;
    for (let offset = 0, len = content.length; offset <= len; offset++) {
      const ch = content.charAt(offset);
      result[offset] = new Position(lineNumber, column);
      if (ch === "\n") {
        lineNumber++;
        column = 1;
      } else {
        column++;
      }
    }
    return result;
  }
  constructor() {
    this.initialContent = generateFile(false);
    const edits = generateEdits(this.initialContent);
    const offsetToPosition = TestModel._generateOffsetToPosition(this.initialContent);
    this.edits = [];
    for (const edit of edits) {
      const startPosition = offsetToPosition[edit.offset];
      const endPosition = offsetToPosition[edit.offset + edit.length];
      this.edits.push({
        range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
        text: edit.text
      });
    }
    this.resultingContent = this.initialContent;
    for (let i = edits.length - 1; i >= 0; i--) {
      this.resultingContent = this.resultingContent.substring(0, edits[i].offset) + edits[i].text + this.resultingContent.substring(edits[i].offset + edits[i].length);
    }
  }
  print() {
    let r = [];
    r.push("testApplyEditsWithSyncedModels(");
    r.push("	[");
    const initialLines = this.initialContent.split("\n");
    r = r.concat(initialLines.map((i) => `		'${i}',`));
    r.push("	],");
    r.push("	[");
    r = r.concat(this.edits.map((i) => {
      const text = `['` + i.text.split("\n").join(`', '`) + `']`;
      return `		editOp(${i.range.startLineNumber}, ${i.range.startColumn}, ${i.range.endLineNumber}, ${i.range.endColumn}, ${text}),`;
    }));
    r.push("	],");
    r.push("	[");
    const resultLines = this.resultingContent.split("\n");
    r = r.concat(resultLines.map((i) => `		'${i}',`));
    r.push("	]");
    r.push(");");
    return r.join("\n");
  }
}
if (GENERATE_TESTS) {
  let number = 1;
  while (true) {
    console.log("------BEGIN NEW TEST: " + number);
    const testModel = new TestModel();
    console.log("------END NEW TEST: " + number++);
    try {
      testApplyEditsWithSyncedModels(
        testModel.initialContent.split("\n"),
        testModel.edits,
        testModel.resultingContent.split("\n")
      );
    } catch (err) {
      console.log(err);
      console.log(testModel.print());
      break;
    }
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9lZGl0YWJsZVRleHRNb2RlbEF1dG8udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyB9IGZyb20gJy4vZWRpdGFibGVUZXh0TW9kZWxUZXN0VXRpbHMuanMnO1xuXG5jb25zdCBHRU5FUkFURV9URVNUUyA9IGZhbHNlO1xuXG5zdWl0ZSgnRWRpdG9yTW9kZWwgQXV0byBUZXN0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBlZGl0T3Aoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHRleHQ6IHN0cmluZ1tdKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiB0ZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0Zm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnYXV0bzEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaW9lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCd5amN0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDEsIDIsIFsnYicsICdyJywgJ2ZxJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgNCwgMiwgMSwgWycnLCAnJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2liJyxcblx0XHRcdFx0J3InLFxuXHRcdFx0XHQnZnFvZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneWpjdCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvMicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdmJyxcblx0XHRcdFx0J2xpdHRuaHNrcnEnLFxuXHRcdFx0XHQndXR4dnNpenFuaycsXG5cdFx0XHRcdCdsc2xxeicsXG5cdFx0XHRcdCdqeG4nLFxuXHRcdFx0XHQnZ21tJyxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAyLCAxLCAyLCBbJycsICdvJ10pLFxuXHRcdFx0XHRlZGl0T3AoMiwgNCwgMiwgNCwgWyd6YXEnLCAnYXZiJ10pLFxuXHRcdFx0XHRlZGl0T3AoMiwgNSwgNiwgMiwgWydqbHInLCAnemwnLCAnaiddKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdmJyxcblx0XHRcdFx0J28nLFxuXHRcdFx0XHQnbGl0emFxJyxcblx0XHRcdFx0J2F2YnRqbHInLFxuXHRcdFx0XHQnemwnLFxuXHRcdFx0XHQnam1tJyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvMycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdvZncnLFxuXHRcdFx0XHQncXN4bXppdXZ6dycsXG5cdFx0XHRcdCdycCcsXG5cdFx0XHRcdCdxc255bWVrJyxcblx0XHRcdFx0J2VsdGgnLFxuXHRcdFx0XHQnd21nemJ3dWR4eicsXG5cdFx0XHRcdCdpd3Nka25kaCcsXG5cdFx0XHRcdCdidWpsYndiJyxcblx0XHRcdFx0J2FzdW91eGZ2Jyxcblx0XHRcdFx0J3h1Y2NuYicsXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoNCwgMywgNCwgMywgWycnXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnb2Z3Jyxcblx0XHRcdFx0J3FzeG16aXV2encnLFxuXHRcdFx0XHQncnAnLFxuXHRcdFx0XHQncXNueW1laycsXG5cdFx0XHRcdCdlbHRoJyxcblx0XHRcdFx0J3dtZ3pid3VkeHonLFxuXHRcdFx0XHQnaXdzZGtuZGgnLFxuXHRcdFx0XHQnYnVqbGJ3YicsXG5cdFx0XHRcdCdhc3VvdXhmdicsXG5cdFx0XHRcdCd4dWNjbmInLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG80JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2ZlZnltaicsXG5cdFx0XHRcdCdxdW0nLFxuXHRcdFx0XHQndm1pd3h4YWlxcScsXG5cdFx0XHRcdCdkeicsXG5cdFx0XHRcdCdsbnFkZ29yb3NmJyxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAzLCAxLCA1LCBbJ2hwJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgNywgMiwgMSwgWydrY2cnLCAnJywgJ21weCddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDIsIDIsIDIsIFsnJywgJ2F3JywgJyddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDIsIDIsIDIsIFsndnFyJywgJ21vJ10pLFxuXHRcdFx0XHRlZGl0T3AoNCwgMiwgNSwgMywgWyd4eWMnXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmVocG1qa2NnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdtcHhxJyxcblx0XHRcdFx0J2F3Jyxcblx0XHRcdFx0J3ZxcicsXG5cdFx0XHRcdCdtb3VtJyxcblx0XHRcdFx0J3ZtaXd4eGFpcXEnLFxuXHRcdFx0XHQnZHh5Y3FkZ29yb3NmJyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBnZXRSYW5kb21JbnQobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSkgKyBtaW47XG59XG5cbmZ1bmN0aW9uIGdldFJhbmRvbVN0cmluZyhtaW5MZW5ndGg6IG51bWJlciwgbWF4TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb25zdCBsZW5ndGggPSBnZXRSYW5kb21JbnQobWluTGVuZ3RoLCBtYXhMZW5ndGgpO1xuXHRsZXQgciA9ICcnO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0ciArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGdldFJhbmRvbUludChDaGFyQ29kZS5hLCBDaGFyQ29kZS56KSk7XG5cdH1cblx0cmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRmlsZShzbWFsbDogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IGxpbmVDb3VudCA9IGdldFJhbmRvbUludCgxLCBzbWFsbCA/IDMgOiAxMCk7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0bGluZXMucHVzaChnZXRSYW5kb21TdHJpbmcoMCwgc21hbGwgPyAzIDogMTApKTtcblx0fVxuXHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRWRpdHMoY29udGVudDogc3RyaW5nKTogSVRlc3RNb2RlbEVkaXRbXSB7XG5cblx0Y29uc3QgcmVzdWx0OiBJVGVzdE1vZGVsRWRpdFtdID0gW107XG5cdGxldCBjbnQgPSBnZXRSYW5kb21JbnQoMSwgNSk7XG5cblx0bGV0IG1heE9mZnNldCA9IGNvbnRlbnQubGVuZ3RoO1xuXG5cdHdoaWxlIChjbnQgPiAwICYmIG1heE9mZnNldCA+IDApIHtcblxuXHRcdGNvbnN0IG9mZnNldCA9IGdldFJhbmRvbUludCgwLCBtYXhPZmZzZXQpO1xuXHRcdGNvbnN0IGxlbmd0aCA9IGdldFJhbmRvbUludCgwLCBtYXhPZmZzZXQgLSBvZmZzZXQpO1xuXHRcdGNvbnN0IHRleHQgPSBnZW5lcmF0ZUZpbGUodHJ1ZSk7XG5cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRvZmZzZXQ6IG9mZnNldCxcblx0XHRcdGxlbmd0aDogbGVuZ3RoLFxuXHRcdFx0dGV4dDogdGV4dFxuXHRcdH0pO1xuXG5cdFx0bWF4T2Zmc2V0ID0gb2Zmc2V0O1xuXHRcdGNudC0tO1xuXHR9XG5cblx0cmVzdWx0LnJldmVyc2UoKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5pbnRlcmZhY2UgSVRlc3RNb2RlbEVkaXQge1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0bGVuZ3RoOiBudW1iZXI7XG5cdHRleHQ6IHN0cmluZztcbn1cblxuY2xhc3MgVGVzdE1vZGVsIHtcblxuXHRwdWJsaWMgaW5pdGlhbENvbnRlbnQ6IHN0cmluZztcblx0cHVibGljIHJlc3VsdGluZ0NvbnRlbnQ6IHN0cmluZztcblx0cHVibGljIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdO1xuXG5cdHByaXZhdGUgc3RhdGljIF9nZW5lcmF0ZU9mZnNldFRvUG9zaXRpb24oY29udGVudDogc3RyaW5nKTogUG9zaXRpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQb3NpdGlvbltdID0gW107XG5cdFx0bGV0IGxpbmVOdW1iZXIgPSAxO1xuXHRcdGxldCBjb2x1bW4gPSAxO1xuXG5cdFx0Zm9yIChsZXQgb2Zmc2V0ID0gMCwgbGVuID0gY29udGVudC5sZW5ndGg7IG9mZnNldCA8PSBsZW47IG9mZnNldCsrKSB7XG5cdFx0XHRjb25zdCBjaCA9IGNvbnRlbnQuY2hhckF0KG9mZnNldCk7XG5cblx0XHRcdHJlc3VsdFtvZmZzZXRdID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cblx0XHRcdGlmIChjaCA9PT0gJ1xcbicpIHtcblx0XHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0XHRjb2x1bW4gPSAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29sdW1uKys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuaW5pdGlhbENvbnRlbnQgPSBnZW5lcmF0ZUZpbGUoZmFsc2UpO1xuXG5cdFx0Y29uc3QgZWRpdHMgPSBnZW5lcmF0ZUVkaXRzKHRoaXMuaW5pdGlhbENvbnRlbnQpO1xuXG5cdFx0Y29uc3Qgb2Zmc2V0VG9Qb3NpdGlvbiA9IFRlc3RNb2RlbC5fZ2VuZXJhdGVPZmZzZXRUb1Bvc2l0aW9uKHRoaXMuaW5pdGlhbENvbnRlbnQpO1xuXHRcdHRoaXMuZWRpdHMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBvZmZzZXRUb1Bvc2l0aW9uW2VkaXQub2Zmc2V0XTtcblx0XHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gb2Zmc2V0VG9Qb3NpdGlvbltlZGl0Lm9mZnNldCArIGVkaXQubGVuZ3RoXTtcblx0XHRcdHRoaXMuZWRpdHMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgZW5kUG9zaXRpb24ubGluZU51bWJlciwgZW5kUG9zaXRpb24uY29sdW1uKSxcblx0XHRcdFx0dGV4dDogZWRpdC50ZXh0XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnJlc3VsdGluZ0NvbnRlbnQgPSB0aGlzLmluaXRpYWxDb250ZW50O1xuXHRcdGZvciAobGV0IGkgPSBlZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0dGhpcy5yZXN1bHRpbmdDb250ZW50ID0gKFxuXHRcdFx0XHR0aGlzLnJlc3VsdGluZ0NvbnRlbnQuc3Vic3RyaW5nKDAsIGVkaXRzW2ldLm9mZnNldCkgK1xuXHRcdFx0XHRlZGl0c1tpXS50ZXh0ICtcblx0XHRcdFx0dGhpcy5yZXN1bHRpbmdDb250ZW50LnN1YnN0cmluZyhlZGl0c1tpXS5vZmZzZXQgKyBlZGl0c1tpXS5sZW5ndGgpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwcmludCgpOiBzdHJpbmcge1xuXHRcdGxldCByOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHIucHVzaCgndGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKCcpO1xuXHRcdHIucHVzaCgnXFx0WycpO1xuXHRcdGNvbnN0IGluaXRpYWxMaW5lcyA9IHRoaXMuaW5pdGlhbENvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRcdHIgPSByLmNvbmNhdChpbml0aWFsTGluZXMubWFwKChpKSA9PiBgXFx0XFx0JyR7aX0nLGApKTtcblx0XHRyLnB1c2goJ1xcdF0sJyk7XG5cdFx0ci5wdXNoKCdcXHRbJyk7XG5cdFx0ciA9IHIuY29uY2F0KHRoaXMuZWRpdHMubWFwKChpKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYFsnYCArIGkudGV4dCEuc3BsaXQoJ1xcbicpLmpvaW4oYCcsICdgKSArIGAnXWA7XG5cdFx0XHRyZXR1cm4gYFxcdFxcdGVkaXRPcCgke2kucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfSwgJHtpLnJhbmdlLnN0YXJ0Q29sdW1ufSwgJHtpLnJhbmdlLmVuZExpbmVOdW1iZXJ9LCAke2kucmFuZ2UuZW5kQ29sdW1ufSwgJHt0ZXh0fSksYDtcblx0XHR9KSk7XG5cdFx0ci5wdXNoKCdcXHRdLCcpO1xuXHRcdHIucHVzaCgnXFx0WycpO1xuXHRcdGNvbnN0IHJlc3VsdExpbmVzID0gdGhpcy5yZXN1bHRpbmdDb250ZW50LnNwbGl0KCdcXG4nKTtcblx0XHRyID0gci5jb25jYXQocmVzdWx0TGluZXMubWFwKChpKSA9PiBgXFx0XFx0JyR7aX0nLGApKTtcblx0XHRyLnB1c2goJ1xcdF0nKTtcblx0XHRyLnB1c2goJyk7Jyk7XG5cblx0XHRyZXR1cm4gci5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5pZiAoR0VORVJBVEVfVEVTVFMpIHtcblx0bGV0IG51bWJlciA9IDE7XG5cdHdoaWxlICh0cnVlKSB7XG5cblx0XHRjb25zb2xlLmxvZygnLS0tLS0tQkVHSU4gTkVXIFRFU1Q6ICcgKyBudW1iZXIpO1xuXG5cdFx0Y29uc3QgdGVzdE1vZGVsID0gbmV3IFRlc3RNb2RlbCgpO1xuXG5cdFx0Ly8gY29uc29sZS5sb2codGVzdE1vZGVsLnByaW50KCkpO1xuXG5cdFx0Y29uc29sZS5sb2coJy0tLS0tLUVORCBORVcgVEVTVDogJyArIChudW1iZXIrKykpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFx0dGVzdE1vZGVsLmluaXRpYWxDb250ZW50LnNwbGl0KCdcXG4nKSxcblx0XHRcdFx0dGVzdE1vZGVsLmVkaXRzLFxuXHRcdFx0XHR0ZXN0TW9kZWwucmVzdWx0aW5nQ29udGVudC5zcGxpdCgnXFxuJylcblx0XHRcdCk7XG5cdFx0XHQvLyB0aHJvdyBuZXcgRXJyb3IoJ2EnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHRjb25zb2xlLmxvZyh0ZXN0TW9kZWwucHJpbnQoKSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHQvLyBicmVhaztcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQ0FBc0M7QUFFL0MsTUFBTSxpQkFBaUI7QUFFdkIsTUFBTSwwQkFBMEIsTUFBTTtBQUVyQywwQ0FBd0M7QUFFeEMsV0FBUyxPQUFPLGlCQUF5QixhQUFxQixlQUF1QixXQUFtQixNQUFzQztBQUM3SSxXQUFPO0FBQUEsTUFDTixPQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxNQUN2RSxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDcEIsa0JBQWtCO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBRUEsT0FBSyxTQUFTLE1BQU07QUFDbkI7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQztBQUFBLFFBQ25DLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxTQUFTLE1BQU07QUFDbkI7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDNUIsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxRQUNqQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxPQUFPLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDdEM7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLFNBQVMsTUFBTTtBQUNuQjtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FB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
