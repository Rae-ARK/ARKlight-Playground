import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AnnotatedString, AnnotationsUpdate } from "../../../common/model/tokens/annotations.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { StringEdit } from "../../../common/core/edits/stringEdit.js";
function parseVisualAnnotations(visual) {
  const annotations = [];
  let baseString = "";
  let i = 0;
  while (i < visual.length) {
    if (visual[i] === "[") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf("]", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid annotation format at position ${i}`);
      }
      const id = visual.substring(i + 1, colonIdx);
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      annotations.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
      i = closeIdx + 1;
    } else {
      baseString += visual[i];
      i++;
    }
  }
  return { annotations, baseString };
}
function toVisualString(annotations, baseString) {
  if (annotations.length === 0) {
    return baseString;
  }
  const sortedAnnotations = [...annotations].sort((a, b) => a.range.start - b.range.start);
  let result = "";
  let pos = 0;
  for (const ann of sortedAnnotations) {
    result += baseString.substring(pos, ann.range.start);
    const annotatedText = baseString.substring(ann.range.start, ann.range.endExclusive);
    result += `[${ann.annotation}:${annotatedText}]`;
    pos = ann.range.endExclusive;
  }
  result += baseString.substring(pos);
  return result;
}
class VisualAnnotatedString {
  constructor(annotatedString, baseString) {
    this.annotatedString = annotatedString;
    this.baseString = baseString;
  }
  setAnnotations(update) {
    this.annotatedString.setAnnotations(update);
  }
  applyEdit(edit) {
    this.annotatedString.applyEdit(edit);
    this.baseString = edit.apply(this.baseString);
  }
  getAnnotationsIntersecting(range) {
    return this.annotatedString.getAnnotationsIntersecting(range);
  }
  getAllAnnotations() {
    return this.annotatedString.getAllAnnotations();
  }
  clone() {
    return new VisualAnnotatedString(this.annotatedString.clone(), this.baseString);
  }
}
function fromVisual(visual) {
  const { annotations, baseString } = parseVisualAnnotations(visual);
  return new VisualAnnotatedString(new AnnotatedString(annotations), baseString);
}
function toVisual(vas) {
  return toVisualString(vas.getAllAnnotations(), vas.baseString);
}
function parseVisualUpdate(visual) {
  const updates = [];
  let baseString = "";
  let i = 0;
  while (i < visual.length) {
    if (visual[i] === "[") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf("]", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid annotation format at position ${i}`);
      }
      const id = visual.substring(i + 1, colonIdx);
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: id });
      i = closeIdx + 1;
    } else if (visual[i] === "<") {
      const colonIdx = visual.indexOf(":", i + 1);
      const closeIdx = visual.indexOf(">", colonIdx + 1);
      if (colonIdx === -1 || closeIdx === -1) {
        throw new Error(`Invalid delete format at position ${i}`);
      }
      const text = visual.substring(colonIdx + 1, closeIdx);
      const startOffset = baseString.length;
      baseString += text;
      updates.push({ range: new OffsetRange(startOffset, baseString.length), annotation: void 0 });
      i = closeIdx + 1;
    } else {
      baseString += visual[i];
      i++;
    }
  }
  return { updates, baseString };
}
function updateFromVisual(...visuals) {
  const updates = [];
  for (const visual of visuals) {
    const { updates: parsedUpdates } = parseVisualUpdate(visual);
    updates.push(...parsedUpdates);
  }
  return AnnotationsUpdate.create(updates);
}
function editDelete(start, end) {
  return StringEdit.replace(new OffsetRange(start, end), "");
}
function editInsert(pos, text) {
  return StringEdit.insert(pos, text);
}
function editReplace(start, end, text) {
  return StringEdit.replace(new OffsetRange(start, end), text);
}
function assertVisual(vas, expectedVisual) {
  const actual = toVisual(vas);
  const { annotations: expectedAnnotations } = parseVisualAnnotations(expectedVisual);
  const actualAnnotations = vas.getAllAnnotations();
  if (actualAnnotations.length !== expectedAnnotations.length) {
    assert.fail(
      `Annotation count mismatch.
  Expected: ${expectedVisual}
  Actual:   ${actual}
  Expected ${expectedAnnotations.length} annotations, got ${actualAnnotations.length}`
    );
  }
  for (let i = 0; i < actualAnnotations.length; i++) {
    const expected = expectedAnnotations[i];
    const actualAnn = actualAnnotations[i];
    if (actualAnn.range.start !== expected.range.start || actualAnn.range.endExclusive !== expected.range.endExclusive) {
      assert.fail(
        `Annotation ${i} range mismatch.
  Expected: (${expected.range.start}, ${expected.range.endExclusive})
  Actual:   (${actualAnn.range.start}, ${actualAnn.range.endExclusive})
  Expected visual: ${expectedVisual}
  Actual visual:   ${actual}`
      );
    }
    if (actualAnn.annotation !== expected.annotation) {
      assert.fail(
        `Annotation ${i} value mismatch.
  Expected: "${expected.annotation}"
  Actual:   "${actualAnn.annotation}"`
      );
    }
  }
}
function visualizeEdit(beforeAnnotations, edit) {
  const vas = fromVisual(beforeAnnotations);
  const before = toVisual(vas);
  vas.applyEdit(edit);
  const after = toVisual(vas);
  return { before, after };
}
suite("Annotations Suite", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("setAnnotations 1", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("[4:Lorem i]"));
    assertVisual(vas, "[4:Lorem i]psum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lorem ip[5:s]"));
    assertVisual(vas, "[4:Lorem i]p[5:s]um [2:dolor] sit [3:amet]");
  });
  test("setAnnotations 2", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual(
      "L<_:orem ipsum d>",
      "[4:Lorem ]"
    ));
    assertVisual(vas, "[4:Lorem ]ipsum dolor sit [3:amet]");
    vas.setAnnotations(updateFromVisual(
      "Lorem <_:ipsum dolor sit amet>",
      "[5:Lor]"
    ));
    assertVisual(vas, "[5:Lor]em ipsum dolor sit amet");
    vas.setAnnotations(updateFromVisual("L[6:or]"));
    assertVisual(vas, "L[6:or]em ipsum dolor sit amet");
  });
  test("setAnnotations 3", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lore[4:m ipsum dolor ]"));
    assertVisual(vas, "Lore[4:m ipsum dolor ]sit [3:amet]");
    vas.setAnnotations(updateFromVisual("Lorem ipsum dolor sit [5:a]"));
    assertVisual(vas, "Lore[4:m ipsum dolor ]sit [5:a]met");
  });
  test("setAnnotations 4", () => {
    const vas = fromVisual("Lorem ipsum dolor sit amet, consectetur adipiscing el[:it]");
    vas.setAnnotations(updateFromVisual("Lorem ipsum dolor sit amet, consectetur adipiscing el<_:i>t"));
    assertVisual(vas, "Lorem ipsum dolor sit amet, consectetur adipiscing elit");
  });
  test("getAnnotationsIntersecting 1", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(0, 13));
    assert.strictEqual(result1.length, 2);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["1", "2"]);
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(0, 22));
    assert.strictEqual(result2.length, 3);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["1", "2", "3"]);
  });
  test("getAnnotationsIntersecting 2", () => {
    const vas = fromVisual("[1:Lorem] [2:i]p[3:s]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(5, 7));
    assert.strictEqual(result1.length, 1);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["2"]);
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(5, 9));
    assert.strictEqual(result2.length, 2);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["2", "3"]);
  });
  test("getAnnotationsIntersecting 3", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor]");
    const result1 = vas.getAnnotationsIntersecting(new OffsetRange(4, 13));
    assert.strictEqual(result1.length, 2);
    assert.deepStrictEqual(result1.map((a) => a.annotation), ["1", "2"]);
    vas.setAnnotations(updateFromVisual("[3:Lore]m[4: ipsu]"));
    assertVisual(vas, "[3:Lore]m[4: ipsu]m [2:dolor]");
    const result2 = vas.getAnnotationsIntersecting(new OffsetRange(7, 13));
    assert.strictEqual(result2.length, 2);
    assert.deepStrictEqual(result2.map((a) => a.annotation), ["4", "2"]);
  });
  test("getAnnotationsIntersecting 4", () => {
    const vas = fromVisual("[1:Lorem ipsum] sit");
    vas.setAnnotations(updateFromVisual("Lorem ipsum [2:sit]"));
    const result = vas.getAnnotationsIntersecting(new OffsetRange(2, 8));
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["1"]);
  });
  test("getAnnotationsIntersecting 5", () => {
    const vas = fromVisual("[1:Lorem ipsum] [2:dol] [3:or]");
    const result = vas.getAnnotationsIntersecting(new OffsetRange(1, 16));
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["1", "2", "3"]);
  });
  test("getAnnotationsIntersecting 6", () => {
    const vas = fromVisual("[1:Lorem ][2:ip][3:sum]");
    const result = vas.getAnnotationsIntersecting(new OffsetRange(6, 6));
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result.map((a) => a.annotation), ["2"]);
  });
  test("applyEdit 1 - deletion within annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editDelete(0, 3)
    );
    assert.strictEqual(result.after, "[1:em] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 2 - deletion and insertion within annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editReplace(1, 3, "XXXXX")
    );
    assert.strictEqual(result.after, "[1:LXXXXXem] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 3 - deletion across several annotations", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editReplace(4, 22, "XXXXX")
    );
    assert.strictEqual(result.after, "[1:LoreXXXXX][3:amet]");
  });
  test("applyEdit 4 - deletion between annotations", () => {
    const result = visualizeEdit(
      "[1:Lorem ip]sum and [2:dolor] sit [3:amet]",
      editDelete(10, 12)
    );
    assert.strictEqual(result.after, "[1:Lorem ip]suand [2:dolor] sit [3:amet]");
  });
  test("applyEdit 5 - deletion that covers annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editDelete(0, 5)
    );
    assert.strictEqual(result.after, " ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 6 - several edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const edit = StringEdit.compose([
      StringEdit.replace(new OffsetRange(0, 6), ""),
      StringEdit.replace(new OffsetRange(6, 12), ""),
      StringEdit.replace(new OffsetRange(12, 17), "")
    ]);
    vas.applyEdit(edit);
    assertVisual(vas, "ipsum sit [3:am]");
  });
  test("applyEdit 7 - several edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet]");
    const edit1 = StringEdit.replace(new OffsetRange(0, 3), "XXXX");
    const edit2 = StringEdit.replace(new OffsetRange(0, 2), "");
    vas.applyEdit(edit1.compose(edit2));
    assertVisual(vas, "[1:XXem] ipsum [2:dolor] sit [3:amet]");
  });
  test("applyEdit 9 - insertion at end of annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editInsert(17, "XXX")
    );
    assert.strictEqual(result.after, "[1:Lorem] ipsum [2:dolor]XXX sit [3:amet]");
  });
  test("applyEdit 10 - insertion in middle of annotation", () => {
    const result = visualizeEdit(
      "[1:Lorem] ipsum [2:dolor] sit [3:amet]",
      editInsert(14, "XXX")
    );
    assert.strictEqual(result.after, "[1:Lorem] ipsum [2:doXXXlor] sit [3:amet]");
  });
  test("applyEdit 11 - replacement consuming annotation", () => {
    const result = visualizeEdit(
      "[1:L]o[2:rem] [3:i]",
      editReplace(1, 6, "X")
    );
    assert.strictEqual(result.after, "[1:L]X[3:i]");
  });
  test("applyEdit 12 - multiple disjoint edits", () => {
    const vas = fromVisual("[1:Lorem] ipsum [2:dolor] sit [3:amet!] [4:done]");
    const edit = StringEdit.compose([
      StringEdit.insert(0, "X"),
      StringEdit.delete(new OffsetRange(12, 13)),
      StringEdit.replace(new OffsetRange(21, 22), "YY"),
      StringEdit.replace(new OffsetRange(28, 32), "Z")
    ]);
    vas.applyEdit(edit);
    assertVisual(vas, "X[1:Lorem] ipsum[2:dolor] sitYY[3:amet!]Z[4:e]");
  });
  test("applyEdit 13 - edit on the left border", () => {
    const result = visualizeEdit(
      "lorem ipsum dolor[1: ]",
      editInsert(17, "X")
    );
    assert.strictEqual(result.after, "lorem ipsum dolorX[1: ]");
  });
  test("rebase", () => {
    const a = new VisualAnnotatedString(
      new AnnotatedString([{ range: new OffsetRange(2, 5), annotation: "1" }]),
      "sitamet"
    );
    const b = a.clone();
    const update = AnnotationsUpdate.create([{ range: new OffsetRange(4, 5), annotation: "2" }]);
    b.setAnnotations(update);
    const edit = StringEdit.replace(new OffsetRange(1, 6), "XXX");
    a.applyEdit(edit);
    b.applyEdit(edit);
    update.rebase(edit);
    a.setAnnotations(update);
    assert.deepStrictEqual(a.getAllAnnotations(), b.getAllAnnotations());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9hbm5vdGF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBbm5vdGF0ZWRTdHJpbmcsIEFubm90YXRpb25zVXBkYXRlLCBJQW5ub3RhdGlvbiwgSUFubm90YXRpb25VcGRhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdG9rZW5zL2Fubm90YXRpb25zLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ0VkaXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVmlzdWFsIEFubm90YXRpb24gVGVzdCBJbmZyYXN0cnVjdHVyZVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVGhpcyBpbmZyYXN0cnVjdHVyZSBhbGxvd3MgcmVwcmVzZW50aW5nIGFubm90YXRpb25zIHZpc3VhbGx5IHVzaW5nIGJyYWNrZXRzOlxuLy8gLSAnW2lkOnRleHRdJyBtYXJrcyBhbiBhbm5vdGF0aW9uIHdpdGggdGhlIGdpdmVuIGlkIGNvdmVyaW5nICd0ZXh0J1xuLy8gLSBQbGFpbiB0ZXh0IHJlcHJlc2VudHMgdW5hbm5vdGF0ZWQgY29udGVudFxuLy9cbi8vIEV4YW1wbGU6IFwiTG9yZW0gWzE6aXBzdW1dIGRvbG9yIFsyOnNpdF0gYW1ldFwiIHJlcHJlc2VudHM6XG4vLyAgIC0gYW5ub3RhdGlvbiBcIjFcIiBhdCBvZmZzZXQgNi0xMSAoY29udGVudCBcImlwc3VtXCIpXG4vLyAgIC0gYW5ub3RhdGlvbiBcIjJcIiBhdCBvZmZzZXQgMTgtMjEgKGNvbnRlbnQgXCJzaXRcIilcbi8vXG4vLyBGb3IgdXBkYXRlczpcbi8vIC0gJ1tpZDp0ZXh0XScgc2V0cyBhbiBhbm5vdGF0aW9uXG4vLyAtICc8aWQ6dGV4dD4nIGRlbGV0ZXMgYW4gYW5ub3RhdGlvbiBpbiB0aGF0IHJhbmdlXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogUGFyc2VzIGEgdmlzdWFsIHN0cmluZyByZXByZXNlbnRhdGlvbiBpbnRvIGFubm90YXRpb25zLlxuICogVGhlIHZpc3VhbCBzdHJpbmcgdXNlcyAnW2lkOnRleHRdJyB0byBtYXJrIGFubm90YXRpb24gYm91bmRhcmllcy5cbiAqIFRoZSBpZCBiZWNvbWVzIHRoZSBhbm5vdGF0aW9uIHZhbHVlLCBhbmQgdGV4dCBpcyB0aGUgYW5ub3RhdGVkIGNvbnRlbnQuXG4gKi9cbmZ1bmN0aW9uIHBhcnNlVmlzdWFsQW5ub3RhdGlvbnModmlzdWFsOiBzdHJpbmcpOiB7IGFubm90YXRpb25zOiBJQW5ub3RhdGlvbjxzdHJpbmc+W107IGJhc2VTdHJpbmc6IHN0cmluZyB9IHtcblx0Y29uc3QgYW5ub3RhdGlvbnM6IElBbm5vdGF0aW9uPHN0cmluZz5bXSA9IFtdO1xuXHRsZXQgYmFzZVN0cmluZyA9ICcnO1xuXHRsZXQgaSA9IDA7XG5cblx0d2hpbGUgKGkgPCB2aXN1YWwubGVuZ3RoKSB7XG5cdFx0aWYgKHZpc3VhbFtpXSA9PT0gJ1snKSB7XG5cdFx0XHQvLyBGaW5kIHRoZSBjb2xvbiBhbmQgY2xvc2luZyBicmFja2V0XG5cdFx0XHRjb25zdCBjb2xvbklkeCA9IHZpc3VhbC5pbmRleE9mKCc6JywgaSArIDEpO1xuXHRcdFx0Y29uc3QgY2xvc2VJZHggPSB2aXN1YWwuaW5kZXhPZignXScsIGNvbG9uSWR4ICsgMSk7XG5cdFx0XHRpZiAoY29sb25JZHggPT09IC0xIHx8IGNsb3NlSWR4ID09PSAtMSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgYW5ub3RhdGlvbiBmb3JtYXQgYXQgcG9zaXRpb24gJHtpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWQgPSB2aXN1YWwuc3Vic3RyaW5nKGkgKyAxLCBjb2xvbklkeCk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gdmlzdWFsLnN1YnN0cmluZyhjb2xvbklkeCArIDEsIGNsb3NlSWR4KTtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gYmFzZVN0cmluZy5sZW5ndGg7XG5cdFx0XHRiYXNlU3RyaW5nICs9IHRleHQ7XG5cdFx0XHRhbm5vdGF0aW9ucy5wdXNoKHsgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShzdGFydE9mZnNldCwgYmFzZVN0cmluZy5sZW5ndGgpLCBhbm5vdGF0aW9uOiBpZCB9KTtcblx0XHRcdGkgPSBjbG9zZUlkeCArIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJhc2VTdHJpbmcgKz0gdmlzdWFsW2ldO1xuXHRcdFx0aSsrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IGFubm90YXRpb25zLCBiYXNlU3RyaW5nIH07XG59XG5cbi8qKlxuICogQ29udmVydHMgYW5ub3RhdGlvbnMgdG8gYSB2aXN1YWwgc3RyaW5nIHJlcHJlc2VudGF0aW9uLlxuICogVXNlcyAnW2lkOnRleHRdJyB0byBtYXJrIGFubm90YXRpb24gYm91bmRhcmllcy5cbiAqXG4gKiBAcGFyYW0gYW5ub3RhdGlvbnMgLSBUaGUgYW5ub3RhdGlvbnMgdG8gdmlzdWFsaXplXG4gKiBAcGFyYW0gYmFzZVN0cmluZyAtIFRoZSBiYXNlIHN0cmluZyBjb250ZW50XG4gKi9cbmZ1bmN0aW9uIHRvVmlzdWFsU3RyaW5nKFxuXHRhbm5vdGF0aW9uczogSUFubm90YXRpb248c3RyaW5nPltdLFxuXHRiYXNlU3RyaW5nOiBzdHJpbmdcbik6IHN0cmluZyB7XG5cdGlmIChhbm5vdGF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gYmFzZVN0cmluZztcblx0fVxuXG5cdC8vIFNvcnQgYW5ub3RhdGlvbnMgYnkgc3RhcnQgcG9zaXRpb25cblx0Y29uc3Qgc29ydGVkQW5ub3RhdGlvbnMgPSBbLi4uYW5ub3RhdGlvbnNdLnNvcnQoKGEsIGIpID0+IGEucmFuZ2Uuc3RhcnQgLSBiLnJhbmdlLnN0YXJ0KTtcblxuXHQvLyBCdWlsZCB0aGUgdmlzdWFsIHJlcHJlc2VudGF0aW9uXG5cdGxldCByZXN1bHQgPSAnJztcblx0bGV0IHBvcyA9IDA7XG5cblx0Zm9yIChjb25zdCBhbm4gb2Ygc29ydGVkQW5ub3RhdGlvbnMpIHtcblx0XHQvLyBBZGQgcGxhaW4gdGV4dCBiZWZvcmUgdGhpcyBhbm5vdGF0aW9uXG5cdFx0cmVzdWx0ICs9IGJhc2VTdHJpbmcuc3Vic3RyaW5nKHBvcywgYW5uLnJhbmdlLnN0YXJ0KTtcblx0XHQvLyBBZGQgYW5ub3RhdGVkIGNvbnRlbnQgd2l0aCBpZFxuXHRcdGNvbnN0IGFubm90YXRlZFRleHQgPSBiYXNlU3RyaW5nLnN1YnN0cmluZyhhbm4ucmFuZ2Uuc3RhcnQsIGFubi5yYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdHJlc3VsdCArPSBgWyR7YW5uLmFubm90YXRpb259OiR7YW5ub3RhdGVkVGV4dH1dYDtcblx0XHRwb3MgPSBhbm4ucmFuZ2UuZW5kRXhjbHVzaXZlO1xuXHR9XG5cblx0Ly8gQWRkIHJlbWFpbmluZyB0ZXh0IGFmdGVyIGxhc3QgYW5ub3RhdGlvblxuXHRyZXN1bHQgKz0gYmFzZVN0cmluZy5zdWJzdHJpbmcocG9zKTtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gQW5ub3RhdGVkU3RyaW5nIHdpdGggaXRzIGJhc2Ugc3RyaW5nIGZvciB2aXN1YWwgdGVzdGluZy5cbiAqL1xuY2xhc3MgVmlzdWFsQW5ub3RhdGVkU3RyaW5nIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGFubm90YXRlZFN0cmluZzogQW5ub3RhdGVkU3RyaW5nPHN0cmluZz4sXG5cdFx0cHVibGljIGJhc2VTdHJpbmc6IHN0cmluZ1xuXHQpIHsgfVxuXG5cdHNldEFubm90YXRpb25zKHVwZGF0ZTogQW5ub3RhdGlvbnNVcGRhdGU8c3RyaW5nPik6IHZvaWQge1xuXHRcdHRoaXMuYW5ub3RhdGVkU3RyaW5nLnNldEFubm90YXRpb25zKHVwZGF0ZSk7XG5cdH1cblxuXHRhcHBseUVkaXQoZWRpdDogU3RyaW5nRWRpdCk6IHZvaWQge1xuXHRcdHRoaXMuYW5ub3RhdGVkU3RyaW5nLmFwcGx5RWRpdChlZGl0KTtcblx0XHR0aGlzLmJhc2VTdHJpbmcgPSBlZGl0LmFwcGx5KHRoaXMuYmFzZVN0cmluZyk7XG5cdH1cblxuXHRnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhyYW5nZTogT2Zmc2V0UmFuZ2UpOiBJQW5ub3RhdGlvbjxzdHJpbmc+W10ge1xuXHRcdHJldHVybiB0aGlzLmFubm90YXRlZFN0cmluZy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhyYW5nZSk7XG5cdH1cblxuXHRnZXRBbGxBbm5vdGF0aW9ucygpOiBJQW5ub3RhdGlvbjxzdHJpbmc+W10ge1xuXHRcdHJldHVybiB0aGlzLmFubm90YXRlZFN0cmluZy5nZXRBbGxBbm5vdGF0aW9ucygpO1xuXHR9XG5cblx0Y2xvbmUoKTogVmlzdWFsQW5ub3RhdGVkU3RyaW5nIHtcblx0XHRyZXR1cm4gbmV3IFZpc3VhbEFubm90YXRlZFN0cmluZyh0aGlzLmFubm90YXRlZFN0cmluZy5jbG9uZSgpIGFzIEFubm90YXRlZFN0cmluZzxzdHJpbmc+LCB0aGlzLmJhc2VTdHJpbmcpO1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIFZpc3VhbEFubm90YXRlZFN0cmluZyBmcm9tIGEgdmlzdWFsIHJlcHJlc2VudGF0aW9uLlxuICovXG5mdW5jdGlvbiBmcm9tVmlzdWFsKHZpc3VhbDogc3RyaW5nKTogVmlzdWFsQW5ub3RhdGVkU3RyaW5nIHtcblx0Y29uc3QgeyBhbm5vdGF0aW9ucywgYmFzZVN0cmluZyB9ID0gcGFyc2VWaXN1YWxBbm5vdGF0aW9ucyh2aXN1YWwpO1xuXHRyZXR1cm4gbmV3IFZpc3VhbEFubm90YXRlZFN0cmluZyhuZXcgQW5ub3RhdGVkU3RyaW5nPHN0cmluZz4oYW5ub3RhdGlvbnMpLCBiYXNlU3RyaW5nKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIFZpc3VhbEFubm90YXRlZFN0cmluZyB0byBhIHZpc3VhbCByZXByZXNlbnRhdGlvbi5cbiAqL1xuZnVuY3Rpb24gdG9WaXN1YWwodmFzOiBWaXN1YWxBbm5vdGF0ZWRTdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdG9WaXN1YWxTdHJpbmcodmFzLmdldEFsbEFubm90YXRpb25zKCksIHZhcy5iYXNlU3RyaW5nKTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgdmlzdWFsIHVwZGF0ZSBhbm5vdGF0aW9ucywgd2hlcmU6XG4gKiAtICdbaWQ6dGV4dF0nIHJlcHJlc2VudHMgYW4gYW5ub3RhdGlvbiB0byBzZXRcbiAqIC0gJzxpZDp0ZXh0PicgcmVwcmVzZW50cyBhbiBhbm5vdGF0aW9uIHRvIGRlbGV0ZSAocmFuZ2UgaXMgdHJhY2tlZCBidXQgYW5ub3RhdGlvbiBpcyB1bmRlZmluZWQpXG4gKi9cbmZ1bmN0aW9uIHBhcnNlVmlzdWFsVXBkYXRlKHZpc3VhbDogc3RyaW5nKTogeyB1cGRhdGVzOiBJQW5ub3RhdGlvblVwZGF0ZTxzdHJpbmc+W107IGJhc2VTdHJpbmc6IHN0cmluZyB9IHtcblx0Y29uc3QgdXBkYXRlczogSUFubm90YXRpb25VcGRhdGU8c3RyaW5nPltdID0gW107XG5cdGxldCBiYXNlU3RyaW5nID0gJyc7XG5cdGxldCBpID0gMDtcblxuXHR3aGlsZSAoaSA8IHZpc3VhbC5sZW5ndGgpIHtcblx0XHRpZiAodmlzdWFsW2ldID09PSAnWycpIHtcblx0XHRcdC8vIFNldCBhbm5vdGF0aW9uOiBbaWQ6dGV4dF1cblx0XHRcdGNvbnN0IGNvbG9uSWR4ID0gdmlzdWFsLmluZGV4T2YoJzonLCBpICsgMSk7XG5cdFx0XHRjb25zdCBjbG9zZUlkeCA9IHZpc3VhbC5pbmRleE9mKCddJywgY29sb25JZHggKyAxKTtcblx0XHRcdGlmIChjb2xvbklkeCA9PT0gLTEgfHwgY2xvc2VJZHggPT09IC0xKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBhbm5vdGF0aW9uIGZvcm1hdCBhdCBwb3NpdGlvbiAke2l9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZCA9IHZpc3VhbC5zdWJzdHJpbmcoaSArIDEsIGNvbG9uSWR4KTtcblx0XHRcdGNvbnN0IHRleHQgPSB2aXN1YWwuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSwgY2xvc2VJZHgpO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSBiYXNlU3RyaW5nLmxlbmd0aDtcblx0XHRcdGJhc2VTdHJpbmcgKz0gdGV4dDtcblx0XHRcdHVwZGF0ZXMucHVzaCh7IHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnRPZmZzZXQsIGJhc2VTdHJpbmcubGVuZ3RoKSwgYW5ub3RhdGlvbjogaWQgfSk7XG5cdFx0XHRpID0gY2xvc2VJZHggKyAxO1xuXHRcdH0gZWxzZSBpZiAodmlzdWFsW2ldID09PSAnPCcpIHtcblx0XHRcdC8vIERlbGV0ZSBhbm5vdGF0aW9uOiA8aWQ6dGV4dD5cblx0XHRcdGNvbnN0IGNvbG9uSWR4ID0gdmlzdWFsLmluZGV4T2YoJzonLCBpICsgMSk7XG5cdFx0XHRjb25zdCBjbG9zZUlkeCA9IHZpc3VhbC5pbmRleE9mKCc+JywgY29sb25JZHggKyAxKTtcblx0XHRcdGlmIChjb2xvbklkeCA9PT0gLTEgfHwgY2xvc2VJZHggPT09IC0xKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBkZWxldGUgZm9ybWF0IGF0IHBvc2l0aW9uICR7aX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSB2aXN1YWwuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSwgY2xvc2VJZHgpO1xuXHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSBiYXNlU3RyaW5nLmxlbmd0aDtcblx0XHRcdGJhc2VTdHJpbmcgKz0gdGV4dDtcblx0XHRcdHVwZGF0ZXMucHVzaCh7IHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2Uoc3RhcnRPZmZzZXQsIGJhc2VTdHJpbmcubGVuZ3RoKSwgYW5ub3RhdGlvbjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0aSA9IGNsb3NlSWR4ICsgMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFzZVN0cmluZyArPSB2aXN1YWxbaV07XG5cdFx0XHRpKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHsgdXBkYXRlcywgYmFzZVN0cmluZyB9O1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gQW5ub3RhdGlvbnNVcGRhdGUgZnJvbSBhIHZpc3VhbCByZXByZXNlbnRhdGlvbi5cbiAqL1xuZnVuY3Rpb24gdXBkYXRlRnJvbVZpc3VhbCguLi52aXN1YWxzOiBzdHJpbmdbXSk6IEFubm90YXRpb25zVXBkYXRlPHN0cmluZz4ge1xuXHRjb25zdCB1cGRhdGVzOiBJQW5ub3RhdGlvblVwZGF0ZTxzdHJpbmc+W10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IHZpc3VhbCBvZiB2aXN1YWxzKSB7XG5cdFx0Y29uc3QgeyB1cGRhdGVzOiBwYXJzZWRVcGRhdGVzIH0gPSBwYXJzZVZpc3VhbFVwZGF0ZSh2aXN1YWwpO1xuXHRcdHVwZGF0ZXMucHVzaCguLi5wYXJzZWRVcGRhdGVzKTtcblx0fVxuXG5cdHJldHVybiBBbm5vdGF0aW9uc1VwZGF0ZS5jcmVhdGUodXBkYXRlcyk7XG59XG5cbi8qKlxuICogSGVscGVyIHRvIGNyZWF0ZSBhIFN0cmluZ0VkaXQgZnJvbSB2aXN1YWwgbm90YXRpb24uXG4gKiBVc2VzIGEgcGF0dGVybiBtYXRjaGluZyBhcHByb2FjaCB3aGVyZTpcbiAqIC0gJ2QnIG1hcmtzIHBvc2l0aW9ucyB0byBkZWxldGVcbiAqIC0gJ2k6dGV4dDonIGluc2VydHMgJ3RleHQnIGF0IHRoZSBtYXJrZWQgcG9zaXRpb25cbiAqXG4gKiBTaW1wbGVyIGFwcHJvYWNoOiBqdXN0IHVzZSBvZmZzZXQtYmFzZWQgaGVscGVyc1xuICovXG5mdW5jdGlvbiBlZGl0RGVsZXRlKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogU3RyaW5nRWRpdCB7XG5cdHJldHVybiBTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpLCAnJyk7XG59XG5cbmZ1bmN0aW9uIGVkaXRJbnNlcnQocG9zOiBudW1iZXIsIHRleHQ6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRyZXR1cm4gU3RyaW5nRWRpdC5pbnNlcnQocG9zLCB0ZXh0KTtcbn1cblxuZnVuY3Rpb24gZWRpdFJlcGxhY2Uoc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIHRleHQ6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRyZXR1cm4gU3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZShzdGFydCwgZW5kKSwgdGV4dCk7XG59XG5cbi8qKlxuICogQXNzZXJ0cyB0aGF0IGEgVmlzdWFsQW5ub3RhdGVkU3RyaW5nIG1hdGNoZXMgdGhlIGV4cGVjdGVkIHZpc3VhbCByZXByZXNlbnRhdGlvbi5cbiAqIE9ubHkgY29tcGFyZXMgYW5ub3RhdGlvbnMsIG5vdCB0aGUgYmFzZSBzdHJpbmcgKHNpbmNlIHNldEFubm90YXRpb25zIGRvZXNuJ3QgY2hhbmdlIHRoZSBiYXNlIHN0cmluZykuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydFZpc3VhbCh2YXM6IFZpc3VhbEFubm90YXRlZFN0cmluZywgZXhwZWN0ZWRWaXN1YWw6IHN0cmluZyk6IHZvaWQge1xuXHRjb25zdCBhY3R1YWwgPSB0b1Zpc3VhbCh2YXMpO1xuXHRjb25zdCB7IGFubm90YXRpb25zOiBleHBlY3RlZEFubm90YXRpb25zIH0gPSBwYXJzZVZpc3VhbEFubm90YXRpb25zKGV4cGVjdGVkVmlzdWFsKTtcblx0Y29uc3QgYWN0dWFsQW5ub3RhdGlvbnMgPSB2YXMuZ2V0QWxsQW5ub3RhdGlvbnMoKTtcblxuXHQvLyBDb21wYXJlIGFubm90YXRpb25zIGZvciBiZXR0ZXIgZXJyb3IgbWVzc2FnZXNcblx0aWYgKGFjdHVhbEFubm90YXRpb25zLmxlbmd0aCAhPT0gZXhwZWN0ZWRBbm5vdGF0aW9ucy5sZW5ndGgpIHtcblx0XHRhc3NlcnQuZmFpbChcblx0XHRcdGBBbm5vdGF0aW9uIGNvdW50IG1pc21hdGNoLlxcbmAgK1xuXHRcdFx0YCAgRXhwZWN0ZWQ6ICR7ZXhwZWN0ZWRWaXN1YWx9XFxuYCArXG5cdFx0XHRgICBBY3R1YWw6ICAgJHthY3R1YWx9XFxuYCArXG5cdFx0XHRgICBFeHBlY3RlZCAke2V4cGVjdGVkQW5ub3RhdGlvbnMubGVuZ3RofSBhbm5vdGF0aW9ucywgZ290ICR7YWN0dWFsQW5ub3RhdGlvbnMubGVuZ3RofWBcblx0XHQpO1xuXHR9XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWxBbm5vdGF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gZXhwZWN0ZWRBbm5vdGF0aW9uc1tpXTtcblx0XHRjb25zdCBhY3R1YWxBbm4gPSBhY3R1YWxBbm5vdGF0aW9uc1tpXTtcblx0XHRpZiAoYWN0dWFsQW5uLnJhbmdlLnN0YXJ0ICE9PSBleHBlY3RlZC5yYW5nZS5zdGFydCB8fCBhY3R1YWxBbm4ucmFuZ2UuZW5kRXhjbHVzaXZlICE9PSBleHBlY3RlZC5yYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdGFzc2VydC5mYWlsKFxuXHRcdFx0XHRgQW5ub3RhdGlvbiAke2l9IHJhbmdlIG1pc21hdGNoLlxcbmAgK1xuXHRcdFx0XHRgICBFeHBlY3RlZDogKCR7ZXhwZWN0ZWQucmFuZ2Uuc3RhcnR9LCAke2V4cGVjdGVkLnJhbmdlLmVuZEV4Y2x1c2l2ZX0pXFxuYCArXG5cdFx0XHRcdGAgIEFjdHVhbDogICAoJHthY3R1YWxBbm4ucmFuZ2Uuc3RhcnR9LCAke2FjdHVhbEFubi5yYW5nZS5lbmRFeGNsdXNpdmV9KVxcbmAgK1xuXHRcdFx0XHRgICBFeHBlY3RlZCB2aXN1YWw6ICR7ZXhwZWN0ZWRWaXN1YWx9XFxuYCArXG5cdFx0XHRcdGAgIEFjdHVhbCB2aXN1YWw6ICAgJHthY3R1YWx9YFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKGFjdHVhbEFubi5hbm5vdGF0aW9uICE9PSBleHBlY3RlZC5hbm5vdGF0aW9uKSB7XG5cdFx0XHRhc3NlcnQuZmFpbChcblx0XHRcdFx0YEFubm90YXRpb24gJHtpfSB2YWx1ZSBtaXNtYXRjaC5cXG5gICtcblx0XHRcdFx0YCAgRXhwZWN0ZWQ6IFwiJHtleHBlY3RlZC5hbm5vdGF0aW9ufVwiXFxuYCArXG5cdFx0XHRcdGAgIEFjdHVhbDogICBcIiR7YWN0dWFsQW5uLmFubm90YXRpb259XCJgXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEhlbHBlciB0byB2aXN1YWxpemUgdGhlIGVmZmVjdCBvZiBhbiBlZGl0IG9uIGFubm90YXRpb25zLlxuICogUmV0dXJucyBib3RoIGJlZm9yZSBhbmQgYWZ0ZXIgc3RhdGVzIGFzIHZpc3VhbCBzdHJpbmdzLlxuICovXG5mdW5jdGlvbiB2aXN1YWxpemVFZGl0KFxuXHRiZWZvcmVBbm5vdGF0aW9uczogc3RyaW5nLFxuXHRlZGl0OiBTdHJpbmdFZGl0XG4pOiB7IGJlZm9yZTogc3RyaW5nOyBhZnRlcjogc3RyaW5nIH0ge1xuXHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKGJlZm9yZUFubm90YXRpb25zKTtcblx0Y29uc3QgYmVmb3JlID0gdG9WaXN1YWwodmFzKTtcblxuXHR2YXMuYXBwbHlFZGl0KGVkaXQpO1xuXG5cdGNvbnN0IGFmdGVyID0gdG9WaXN1YWwodmFzKTtcblx0cmV0dXJuIHsgYmVmb3JlLCBhZnRlciB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBWaXN1YWwgQW5ub3RhdGlvbnMgVGVzdCBTdWl0ZVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVGhlc2UgdGVzdHMgdXNlIGEgdmlzdWFsIHJlcHJlc2VudGF0aW9uIGZvciBiZXR0ZXIgcmVhZGFiaWxpdHk6XG4vLyAtICdbaWQ6dGV4dF0nIG1hcmtzIGFubm90YXRlZCByZWdpb25zIHdpdGggaWQgYW5kIGNvbnRlbnRcbi8vIC0gUGxhaW4gdGV4dCByZXByZXNlbnRzIHVuYW5ub3RhdGVkIGNvbnRlbnRcbi8vIC0gJzxpZDp0ZXh0PicgbWFya3MgcmVnaW9ucyB0byBkZWxldGUgKGluIHVwZGF0ZXMpXG4vL1xuLy8gRXhhbXBsZTogXCJMb3JlbSBbMTppcHN1bV0gZG9sb3IgWzI6c2l0XSBhbWV0XCIgcmVwcmVzZW50cyB0d28gYW5ub3RhdGlvbnM6XG4vLyAgICAgICAgICBcIjFcIiBhdCAoNiwxMSkgY292ZXJpbmcgXCJpcHN1bVwiLCBcIjJcIiBhdCAoMTgsMjEpIGNvdmVyaW5nIFwic2l0XCJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuc3VpdGUoJ0Fubm90YXRpb25zIFN1aXRlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NldEFubm90YXRpb25zIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnWzQ6TG9yZW0gaV0nKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1s0OkxvcmVtIGldcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoJ0xvcmVtIGlwWzU6c10nKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1s0OkxvcmVtIGldcFs1OnNddW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRBbm5vdGF0aW9ucyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoXG5cdFx0XHQnTDxfOm9yZW0gaXBzdW0gZD4nLFxuXHRcdFx0J1s0OkxvcmVtIF0nXG5cdFx0KSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1s0OkxvcmVtIF1pcHN1bSBkb2xvciBzaXQgWzM6YW1ldF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbChcblx0XHRcdCdMb3JlbSA8XzppcHN1bSBkb2xvciBzaXQgYW1ldD4nLFxuXHRcdFx0J1s1Okxvcl0nXG5cdFx0KSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ1s1Okxvcl1lbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKCdMWzY6b3JdJykpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdMWzY6b3JdZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0QW5ub3RhdGlvbnMgMycsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHRcdHZhcy5zZXRBbm5vdGF0aW9ucyh1cGRhdGVGcm9tVmlzdWFsKCdMb3JlWzQ6bSBpcHN1bSBkb2xvciBdJykpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdMb3JlWzQ6bSBpcHN1bSBkb2xvciBdc2l0IFszOmFtZXRdJyk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBbNTphXScpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnTG9yZVs0Om0gaXBzdW0gZG9sb3IgXXNpdCBbNTphXW1ldCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRBbm5vdGF0aW9ucyA0JywgKCkgPT4ge1xuXHRcdC8vIDU0IGNoYXJzIGJlZm9yZSAnaSc6IFwiTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWxcIlxuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0LCBjb25zZWN0ZXR1ciBhZGlwaXNjaW5nIGVsWzppdF0nKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWw8XzppPnQnKSk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0LCBjb25zZWN0ZXR1ciBhZGlwaXNjaW5nIGVsaXQnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcgMScsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSB2YXMuZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcobmV3IE9mZnNldFJhbmdlKDAsIDEzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycxJywgJzInXSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoMCwgMjIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Mi5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Mi5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzEnLCAnMicsICczJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBbMjppXXBbMzpzXScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoNSwgNykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLm1hcChhID0+IGEuYW5ub3RhdGlvbiksIFsnMiddKTtcblx0XHRjb25zdCByZXN1bHQyID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSg1LCA5KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycyJywgJzMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFubm90YXRpb25zSW50ZXJzZWN0aW5nIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXScpO1xuXHRcdGNvbnN0IHJlc3VsdDEgPSB2YXMuZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcobmV3IE9mZnNldFJhbmdlKDQsIDEzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDEubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycxJywgJzInXSk7XG5cdFx0dmFzLnNldEFubm90YXRpb25zKHVwZGF0ZUZyb21WaXN1YWwoJ1szOkxvcmVdbVs0OiBpcHN1XScpKTtcblx0XHRhc3NlcnRWaXN1YWwodmFzLCAnWzM6TG9yZV1tWzQ6IGlwc3VdbSBbMjpkb2xvcl0nKTtcblx0XHRjb25zdCByZXN1bHQyID0gdmFzLmdldEFubm90YXRpb25zSW50ZXJzZWN0aW5nKG5ldyBPZmZzZXRSYW5nZSg3LCAxMykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLm1hcChhID0+IGEuYW5ub3RhdGlvbiksIFsnNCcsICcyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtIGlwc3VtXSBzaXQnKTtcblx0XHR2YXMuc2V0QW5ub3RhdGlvbnModXBkYXRlRnJvbVZpc3VhbCgnTG9yZW0gaXBzdW0gWzI6c2l0XScpKTtcblx0XHRjb25zdCByZXN1bHQgPSB2YXMuZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcobmV3IE9mZnNldFJhbmdlKDIsIDgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyA1JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtIGlwc3VtXSBbMjpkb2xdIFszOm9yXScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoMSwgMTYpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGEgPT4gYS5hbm5vdGF0aW9uKSwgWycxJywgJzInLCAnMyddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QW5ub3RhdGlvbnNJbnRlcnNlY3RpbmcgNicsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbSBdWzI6aXBdWzM6c3VtXScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZhcy5nZXRBbm5vdGF0aW9uc0ludGVyc2VjdGluZyhuZXcgT2Zmc2V0UmFuZ2UoNiwgNikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoYSA9PiBhLmFubm90YXRpb24pLCBbJzInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCAxIC0gZGVsZXRpb24gd2l0aGluIGFubm90YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0RGVsZXRlKDAsIDMpXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFmdGVyLCAnWzE6ZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDIgLSBkZWxldGlvbiBhbmQgaW5zZXJ0aW9uIHdpdGhpbiBhbm5vdGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nLFxuXHRcdFx0ZWRpdFJlcGxhY2UoMSwgMywgJ1hYWFhYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMWFhYWFhlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgMyAtIGRlbGV0aW9uIGFjcm9zcyBzZXZlcmFsIGFubm90YXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nLFxuXHRcdFx0ZWRpdFJlcGxhY2UoNCwgMjIsICdYWFhYWCcpXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFmdGVyLCAnWzE6TG9yZVhYWFhYXVszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCA0IC0gZGVsZXRpb24gYmV0d2VlbiBhbm5vdGF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2aXN1YWxpemVFZGl0KFxuXHRcdFx0J1sxOkxvcmVtIGlwXXN1bSBhbmQgWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScsXG5cdFx0XHRlZGl0RGVsZXRlKDEwLCAxMilcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMb3JlbSBpcF1zdWFuZCBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCA1IC0gZGVsZXRpb24gdGhhdCBjb3ZlcnMgYW5ub3RhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSB2aXN1YWxpemVFZGl0KFxuXHRcdFx0J1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyxcblx0XHRcdGVkaXREZWxldGUoMCwgNSlcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICcgaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0XScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgNiAtIHNldmVyYWwgZWRpdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFzID0gZnJvbVZpc3VhbCgnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0XHRjb25zdCBlZGl0ID0gU3RyaW5nRWRpdC5jb21wb3NlKFtcblx0XHRcdFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgNiksICcnKSxcblx0XHRcdFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoNiwgMTIpLCAnJyksXG5cdFx0XHRTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKDEyLCAxNyksICcnKVxuXHRcdF0pO1xuXHRcdHZhcy5hcHBseUVkaXQoZWRpdCk7XG5cdFx0YXNzZXJ0VmlzdWFsKHZhcywgJ2lwc3VtIHNpdCBbMzphbV0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDcgLSBzZXZlcmFsIGVkaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhcyA9IGZyb21WaXN1YWwoJ1sxOkxvcmVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdFx0Y29uc3QgZWRpdDEgPSBTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKDAsIDMpLCAnWFhYWCcpO1xuXHRcdGNvbnN0IGVkaXQyID0gU3RyaW5nRWRpdC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgwLCAyKSwgJycpO1xuXHRcdHZhcy5hcHBseUVkaXQoZWRpdDEuY29tcG9zZShlZGl0MikpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdbMTpYWGVtXSBpcHN1bSBbMjpkb2xvcl0gc2l0IFszOmFtZXRdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCA5IC0gaW5zZXJ0aW9uIGF0IGVuZCBvZiBhbm5vdGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nLFxuXHRcdFx0ZWRpdEluc2VydCgxNywgJ1hYWCcpXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFmdGVyLCAnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXVhYWCBzaXQgWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDEwIC0gaW5zZXJ0aW9uIGluIG1pZGRsZSBvZiBhbm5vdGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnWzE6TG9yZW1dIGlwc3VtIFsyOmRvbG9yXSBzaXQgWzM6YW1ldF0nLFxuXHRcdFx0ZWRpdEluc2VydCgxNCwgJ1hYWCcpXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFmdGVyLCAnWzE6TG9yZW1dIGlwc3VtIFsyOmRvWFhYbG9yXSBzaXQgWzM6YW1ldF0nKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlFZGl0IDExIC0gcmVwbGFjZW1lbnQgY29uc3VtaW5nIGFubm90YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdmlzdWFsaXplRWRpdChcblx0XHRcdCdbMTpMXW9bMjpyZW1dIFszOmldJyxcblx0XHRcdGVkaXRSZXBsYWNlKDEsIDYsICdYJylcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYWZ0ZXIsICdbMTpMXVhbMzppXScpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUVkaXQgMTIgLSBtdWx0aXBsZSBkaXNqb2ludCBlZGl0cycsICgpID0+IHtcblx0XHRjb25zdCB2YXMgPSBmcm9tVmlzdWFsKCdbMTpMb3JlbV0gaXBzdW0gWzI6ZG9sb3JdIHNpdCBbMzphbWV0IV0gWzQ6ZG9uZV0nKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBTdHJpbmdFZGl0LmNvbXBvc2UoW1xuXHRcdFx0U3RyaW5nRWRpdC5pbnNlcnQoMCwgJ1gnKSxcblx0XHRcdFN0cmluZ0VkaXQuZGVsZXRlKG5ldyBPZmZzZXRSYW5nZSgxMiwgMTMpKSxcblx0XHRcdFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMjEsIDIyKSwgJ1lZJyksXG5cdFx0XHRTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKDI4LCAzMiksICdaJylcblx0XHRdKTtcblx0XHR2YXMuYXBwbHlFZGl0KGVkaXQpO1xuXHRcdGFzc2VydFZpc3VhbCh2YXMsICdYWzE6TG9yZW1dIGlwc3VtWzI6ZG9sb3JdIHNpdFlZWzM6YW1ldCFdWls0OmVdJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5RWRpdCAxMyAtIGVkaXQgb24gdGhlIGxlZnQgYm9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHZpc3VhbGl6ZUVkaXQoXG5cdFx0XHQnbG9yZW0gaXBzdW0gZG9sb3JbMTogXScsXG5cdFx0XHRlZGl0SW5zZXJ0KDE3LCAnWCcpXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFmdGVyLCAnbG9yZW0gaXBzdW0gZG9sb3JYWzE6IF0nKTtcblx0fSk7XG5cblx0dGVzdCgncmViYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBuZXcgVmlzdWFsQW5ub3RhdGVkU3RyaW5nKFxuXHRcdFx0bmV3IEFubm90YXRlZFN0cmluZzxzdHJpbmc+KFt7IHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UoMiwgNSksIGFubm90YXRpb246ICcxJyB9XSksXG5cdFx0XHQnc2l0YW1ldCdcblx0XHQpO1xuXHRcdGNvbnN0IGIgPSBhLmNsb25lKCk7XG5cdFx0Y29uc3QgdXBkYXRlOiBBbm5vdGF0aW9uc1VwZGF0ZTxzdHJpbmc+ID0gQW5ub3RhdGlvbnNVcGRhdGUuY3JlYXRlKFt7IHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UoNCwgNSksIGFubm90YXRpb246ICcyJyB9XSk7XG5cblx0XHRiLnNldEFubm90YXRpb25zKHVwZGF0ZSk7XG5cdFx0Y29uc3QgZWRpdDogU3RyaW5nRWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMSwgNiksICdYWFgnKTtcblxuXHRcdGEuYXBwbHlFZGl0KGVkaXQpO1xuXHRcdGIuYXBwbHlFZGl0KGVkaXQpO1xuXG5cdFx0dXBkYXRlLnJlYmFzZShlZGl0KTtcblxuXHRcdGEuc2V0QW5ub3RhdGlvbnModXBkYXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGEuZ2V0QWxsQW5ub3RhdGlvbnMoKSwgYi5nZXRBbGxBbm5vdGF0aW9ucygpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJB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
