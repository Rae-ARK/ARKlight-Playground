import assert from "assert";
import { CharCode } from "../../../../base/common/charCode.js";
import * as platform from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { StringBuilder } from "../../../common/core/stringBuilder.js";
import { DefaultEndOfLine } from "../../../common/model.js";
import { createTextBuffer } from "../../../common/model/textModel.js";
import { ModelService } from "../../../common/services/modelService.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { createModelServices, createTextModel } from "../testTextModel.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IModelService } from "../../../common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const GENERATE_TESTS = false;
suite("ModelService", () => {
  let disposables;
  let modelService;
  let instantiationService;
  setup(() => {
    disposables = new DisposableStore();
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("files", { "eol": "\n" });
    configService.setUserConfiguration("files", { "eol": "\r\n" }, URI.file(platform.isWindows ? "c:\\myroot" : "/myroot"));
    instantiationService = createModelServices(disposables, [
      [IConfigurationService, configService]
    ]);
    modelService = instantiationService.get(IModelService);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("EOL setting respected depending on root", () => {
    const model1 = modelService.createModel("farboo", null);
    const model2 = modelService.createModel("farboo", null, URI.file(platform.isWindows ? "c:\\myroot\\myfile.txt" : "/myroot/myfile.txt"));
    const model3 = modelService.createModel("farboo", null, URI.file(platform.isWindows ? "c:\\other\\myfile.txt" : "/other/myfile.txt"));
    assert.strictEqual(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
    assert.strictEqual(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
    assert.strictEqual(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
    model1.dispose();
    model2.dispose();
    model3.dispose();
  });
  test("_computeEdits no change", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, []);
  });
  test("_computeEdits first line changed", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line One",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(new Range(1, 1, 2, 1), "This is line One\n")
    ]);
  });
  test("_computeEdits EOL changed", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, []);
  });
  test("_computeEdits EOL and other change 1", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line One",
        //16
        "and this is line number two",
        //27
        "It is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(
        new Range(1, 1, 4, 1),
        [
          "This is line One",
          "and this is line number two",
          "It is followed by #3",
          ""
        ].join("\r\n")
      )
    ]);
  });
  test("_computeEdits EOL and other change 2", function() {
    const model = disposables.add(createTextModel(
      [
        "package main",
        // 1
        "func foo() {",
        // 2
        "}"
        // 3
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "package main",
        // 1
        "func foo() {",
        // 2
        "}",
        // 3
        ""
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(new Range(3, 2, 3, 2), "\r\n")
    ]);
  });
  test("generated1", () => {
    const file1 = ["pram", "okctibad", "pjuwtemued", "knnnm", "u", ""];
    const file2 = ["tcnr", "rxwlicro", "vnzy", "", "", "pjzcogzur", "ptmxyp", "dfyshia", "pee", "ygg"];
    assertComputeEdits(file1, file2);
  });
  test("generated2", () => {
    const file1 = ["", "itls", "hrilyhesv", ""];
    const file2 = ["vdl", "", "tchgz", "bhx", "nyl"];
    assertComputeEdits(file1, file2);
  });
  test("generated3", () => {
    const file1 = ["ubrbrcv", "wv", "xodspybszt", "s", "wednjxm", "fklajt", "fyfc", "lvejgge", "rtpjlodmmk", "arivtgmjdm"];
    const file2 = ["s", "qj", "tu", "ur", "qerhjjhyvx", "t"];
    assertComputeEdits(file1, file2);
  });
  test("generated4", () => {
    const file1 = ["ig", "kh", "hxegci", "smvker", "pkdmjjdqnv", "vgkkqqx", "", "jrzeb"];
    const file2 = ["yk", ""];
    assertComputeEdits(file1, file2);
  });
  test("does insertions in the middle of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 2",
      "line 5",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insertions at the end of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 2",
      "line 3",
      "line 4"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insertions at the beginning of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 0",
      "line 1",
      "line 2",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does replacements", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 7",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does deletions", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insert, replace, and delete", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5"
    ];
    const file2 = [
      "line 0",
      // insert line 0
      "line 1",
      "replace line 2",
      // replace line 2
      "line 3",
      // delete line 4
      "line 5"
    ];
    assertComputeEdits(file1, file2);
  });
  test("maintains undo for same resource and same content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text1", null, resource);
    model2.undo();
    assert.strictEqual(model2.getValue(), "text");
    modelService.destroyModel(resource);
  });
  test("maintains version id and alternative version id for same resource and same content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    const versionId = model1.getVersionId();
    const alternativeVersionId = model1.getAlternativeVersionId();
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text1", null, resource);
    assert.strictEqual(model2.getVersionId(), versionId);
    assert.strictEqual(model2.getAlternativeVersionId(), alternativeVersionId);
    modelService.destroyModel(resource);
  });
  test("does not maintain undo for same resource and different content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text2", null, resource);
    model2.undo();
    assert.strictEqual(model2.getValue(), "text2");
    modelService.destroyModel(resource);
  });
  test("setValue should clear undo stack", () => {
    const resource = URI.parse("file://test.txt");
    const model = modelService.createModel("text", null, resource);
    model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model.getValue(), "text1");
    model.setValue("text2");
    model.undo();
    assert.strictEqual(model.getValue(), "text2");
    modelService.destroyModel(resource);
  });
});
function assertComputeEdits(lines1, lines2) {
  const model = createTextModel(lines1.join("\n"));
  const { disposable, textBuffer } = createTextBuffer(lines2.join("\n"), DefaultEndOfLine.LF);
  const edits = ModelService._computeEdits(model, textBuffer);
  model.pushEditOperations([], edits, null);
  assert.strictEqual(model.getValue(), lines2.join("\n"));
  disposable.dispose();
  model.dispose();
}
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomString(minLength, maxLength) {
  const length = getRandomInt(minLength, maxLength);
  const t = new StringBuilder(length);
  for (let i = 0; i < length; i++) {
    t.appendASCIICharCode(getRandomInt(CharCode.a, CharCode.z));
  }
  return t.build();
}
function generateFile(small) {
  const lineCount = getRandomInt(1, small ? 3 : 1e4);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(getRandomString(0, small ? 3 : 1e4));
  }
  return lines;
}
if (GENERATE_TESTS) {
  let number = 1;
  while (true) {
    console.log("------TEST: " + number++);
    const file1 = generateFile(true);
    const file2 = generateFile(true);
    console.log("------TEST GENERATED");
    try {
      assertComputeEdits(file1, file2);
    } catch (err) {
      console.log(err);
      console.log(`
const file1 = ${JSON.stringify(file1).replace(/"/g, "'")};
const file2 = ${JSON.stringify(file2).replace(/"/g, "'")};
assertComputeEdits(file1, file2);
`);
      break;
    }
  }
}
function createAndRegisterTextBuffer(store, value, defaultEOL) {
  const { disposable, textBuffer } = createTextBuffer(value, defaultEOL);
  store.add(disposable);
  return textBuffer;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFN0cmluZ0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zdHJpbmdCdWlsZGVyLmpzJztcbmltcG9ydCB7IERlZmF1bHRFbmRPZkxpbmUsIElUZXh0QnVmZmVyLCBJVGV4dEJ1ZmZlckZhY3RvcnksIElUZXh0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzLCBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IEdFTkVSQVRFX1RFU1RTID0gZmFsc2U7XG5cbnN1aXRlKCdNb2RlbFNlcnZpY2UnLCAoKSA9PiB7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2ZpbGVzJywgeyAnZW9sJzogJ1xcbicgfSk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdlb2wnOiAnXFxyXFxuJyB9LCBVUkkuZmlsZShwbGF0Zm9ybS5pc1dpbmRvd3MgPyAnYzpcXFxcbXlyb290JyA6ICcvbXlyb290JykpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzLCBbXG5cdFx0XHRbSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlXVxuXHRcdF0pO1xuXHRcdG1vZGVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnRU9MIHNldHRpbmcgcmVzcGVjdGVkIGRlcGVuZGluZyBvbiByb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsMSA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnZmFyYm9vJywgbnVsbCk7XG5cdFx0Y29uc3QgbW9kZWwyID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdmYXJib28nLCBudWxsLCBVUkkuZmlsZShwbGF0Zm9ybS5pc1dpbmRvd3MgPyAnYzpcXFxcbXlyb290XFxcXG15ZmlsZS50eHQnIDogJy9teXJvb3QvbXlmaWxlLnR4dCcpKTtcblx0XHRjb25zdCBtb2RlbDMgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ2ZhcmJvbycsIG51bGwsIFVSSS5maWxlKHBsYXRmb3JtLmlzV2luZG93cyA/ICdjOlxcXFxvdGhlclxcXFxteWZpbGUudHh0JyA6ICcvb3RoZXIvbXlmaWxlLnR4dCcpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDEuZ2V0T3B0aW9ucygpLmRlZmF1bHRFT0wsIERlZmF1bHRFbmRPZkxpbmUuTEYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDIuZ2V0T3B0aW9ucygpLmRlZmF1bHRFT0wsIERlZmF1bHRFbmRPZkxpbmUuQ1JMRik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMy5nZXRPcHRpb25zKCkuZGVmYXVsdEVPTCwgRGVmYXVsdEVuZE9mTGluZS5MRik7XG5cblx0XHRtb2RlbDEuZGlzcG9zZSgpO1xuXHRcdG1vZGVsMi5kaXNwb3NlKCk7XG5cdFx0bW9kZWwzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnX2NvbXB1dGVFZGl0cyBubyBjaGFuZ2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdERlZmF1bHRFbmRPZkxpbmUuTEZcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnX2NvbXB1dGVFZGl0cyBmaXJzdCBsaW5lIGNoYW5nZWQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBPbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdERlZmF1bHRFbmRPZkxpbmUuTEZcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCAnVGhpcyBpcyBsaW5lIE9uZVxcbicpXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ19jb21wdXRlRWRpdHMgRU9MIGNoYW5nZWQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXHJcXG4nKSxcblx0XHRcdERlZmF1bHRFbmRPZkxpbmUuTEZcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnX2NvbXB1dGVFZGl0cyBFT0wgYW5kIG90aGVyIGNoYW5nZSAxJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsIC8vMTZcblx0XHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJywgLy8yMFxuXHRcdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLCAvLzI5XG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KSk7XG5cblx0XHRjb25zdCB0ZXh0QnVmZmVyID0gY3JlYXRlQW5kUmVnaXN0ZXJUZXh0QnVmZmVyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGxpbmUgT25lJywgLy8xNlxuXHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0XHQnSXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRcdF0uam9pbignXFxyXFxuJyksXG5cdFx0XHREZWZhdWx0RW5kT2ZMaW5lLkxGXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IE1vZGVsU2VydmljZS5fY29tcHV0ZUVkaXRzKG1vZGVsLCB0ZXh0QnVmZmVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRFZGl0T3BlcmF0aW9uLnJlcGxhY2VNb3ZlKFxuXHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgNCwgMSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnVGhpcyBpcyBsaW5lIE9uZScsXG5cdFx0XHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsXG5cdFx0XHRcdFx0J0l0IGlzIGZvbGxvd2VkIGJ5ICMzJyxcblx0XHRcdFx0XHQnJ1xuXHRcdFx0XHRdLmpvaW4oJ1xcclxcbicpXG5cdFx0XHQpXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ19jb21wdXRlRWRpdHMgRU9MIGFuZCBvdGhlciBjaGFuZ2UgMicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgbWFpbicsXHQvLyAxXG5cdFx0XHRcdCdmdW5jIGZvbygpIHsnLFx0Ly8gMlxuXHRcdFx0XHQnfSdcdFx0XHRcdC8vIDNcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J3BhY2thZ2UgbWFpbicsXHQvLyAxXG5cdFx0XHRcdCdmdW5jIGZvbygpIHsnLFx0Ly8gMlxuXHRcdFx0XHQnfScsXHRcdFx0Ly8gM1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXHJcXG4nKSxcblx0XHRcdERlZmF1bHRFbmRPZkxpbmUuTEZcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUobmV3IFJhbmdlKDMsIDIsIDMsIDIpLCAnXFxyXFxuJylcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVkMScsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFsncHJhbScsICdva2N0aWJhZCcsICdwanV3dGVtdWVkJywgJ2tubm5tJywgJ3UnLCAnJ107XG5cdFx0Y29uc3QgZmlsZTIgPSBbJ3RjbnInLCAncnh3bGljcm8nLCAndm56eScsICcnLCAnJywgJ3BqemNvZ3p1cicsICdwdG14eXAnLCAnZGZ5c2hpYScsICdwZWUnLCAneWdnJ107XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dlbmVyYXRlZDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbJycsICdpdGxzJywgJ2hyaWx5aGVzdicsICcnXTtcblx0XHRjb25zdCBmaWxlMiA9IFsndmRsJywgJycsICd0Y2hneicsICdiaHgnLCAnbnlsJ107XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dlbmVyYXRlZDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbJ3VicmJyY3YnLCAnd3YnLCAneG9kc3B5YnN6dCcsICdzJywgJ3dlZG5qeG0nLCAnZmtsYWp0JywgJ2Z5ZmMnLCAnbHZlamdnZScsICdydHBqbG9kbW1rJywgJ2FyaXZ0Z21qZG0nXTtcblx0XHRjb25zdCBmaWxlMiA9IFsncycsICdxaicsICd0dScsICd1cicsICdxZXJoampoeXZ4JywgJ3QnXTtcblx0XHRhc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVkNCcsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFsnaWcnLCAna2gnLCAnaHhlZ2NpJywgJ3NtdmtlcicsICdwa2RtampkcW52JywgJ3Zna2txcXgnLCAnJywgJ2pyemViJ107XG5cdFx0Y29uc3QgZmlsZTIgPSBbJ3lrJywgJyddO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGluc2VydGlvbnMgaW4gdGhlIG1pZGRsZSBvZiB0aGUgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGNvbnN0IGZpbGUyID0gW1xuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQnbGluZSAyJyxcblx0XHRcdCdsaW5lIDUnLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGluc2VydGlvbnMgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGNvbnN0IGZpbGUyID0gW1xuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQnbGluZSAyJyxcblx0XHRcdCdsaW5lIDMnLFxuXHRcdFx0J2xpbmUgNCdcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGluc2VydGlvbnMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGNvbnN0IGZpbGUyID0gW1xuXHRcdFx0J2xpbmUgMCcsXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIHJlcGxhY2VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDcnLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGRlbGV0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDMnXG5cdFx0XTtcblx0XHRhc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBpbnNlcnQsIHJlcGxhY2UsIGFuZCBkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZTEgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMycsXG5cdFx0XHQnbGluZSA0Jyxcblx0XHRcdCdsaW5lIDUnLFxuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAwJywgLy8gaW5zZXJ0IGxpbmUgMFxuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQncmVwbGFjZSBsaW5lIDInLCAvLyByZXBsYWNlIGxpbmUgMlxuXHRcdFx0J2xpbmUgMycsXG5cdFx0XHQvLyBkZWxldGUgbGluZSA0XG5cdFx0XHQnbGluZSA1Jyxcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYWludGFpbnMgdW5kbyBmb3Igc2FtZSByZXNvdXJjZSBhbmQgc2FtZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vdGVzdC50eHQnKTtcblxuXHRcdC8vIGNyZWF0ZSBhIG1vZGVsXG5cdFx0Y29uc3QgbW9kZWwxID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCd0ZXh0JywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdC8vIG1ha2UgYW4gZWRpdFxuXHRcdG1vZGVsMS5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgdGV4dDogJzEnIH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDEuZ2V0VmFsdWUoKSwgJ3RleHQxJyk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IG1vZGVsIHdpdGggdGhlIHNhbWUgY29udGVudFxuXHRcdGNvbnN0IG1vZGVsMiA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dDEnLCBudWxsLCByZXNvdXJjZSk7XG5cdFx0Ly8gdW5kb1xuXHRcdG1vZGVsMi51bmRvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRWYWx1ZSgpLCAndGV4dCcpO1xuXHRcdC8vIGRpc3Bvc2UgaXRcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKHJlc291cmNlKTtcblx0fSk7XG5cblx0dGVzdCgnbWFpbnRhaW5zIHZlcnNpb24gaWQgYW5kIGFsdGVybmF0aXZlIHZlcnNpb24gaWQgZm9yIHNhbWUgcmVzb3VyY2UgYW5kIHNhbWUgY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBjcmVhdGUgYSBtb2RlbFxuXHRcdGNvbnN0IG1vZGVsMSA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dCcsIG51bGwsIHJlc291cmNlKTtcblx0XHQvLyBtYWtlIGFuIGVkaXRcblx0XHRtb2RlbDEucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIHRleHQ6ICcxJyB9XSwgKCkgPT4gW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwxLmdldFZhbHVlKCksICd0ZXh0MScpO1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IG1vZGVsMS5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBhbHRlcm5hdGl2ZVZlcnNpb25JZCA9IG1vZGVsMS5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpO1xuXHRcdC8vIGRpc3Bvc2UgaXRcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKHJlc291cmNlKTtcblxuXHRcdC8vIGNyZWF0ZSBhIG5ldyBtb2RlbCB3aXRoIHRoZSBzYW1lIGNvbnRlbnRcblx0XHRjb25zdCBtb2RlbDIgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ3RleHQxJywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDIuZ2V0VmVyc2lvbklkKCksIHZlcnNpb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRBbHRlcm5hdGl2ZVZlcnNpb25JZCgpLCBhbHRlcm5hdGl2ZVZlcnNpb25JZCk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBtYWludGFpbiB1bmRvIGZvciBzYW1lIHJlc291cmNlIGFuZCBkaWZmZXJlbnQgY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBjcmVhdGUgYSBtb2RlbFxuXHRcdGNvbnN0IG1vZGVsMSA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dCcsIG51bGwsIHJlc291cmNlKTtcblx0XHQvLyBtYWtlIGFuIGVkaXRcblx0XHRtb2RlbDEucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNSwgMSwgNSksIHRleHQ6ICcxJyB9XSwgKCkgPT4gW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwxLmdldFZhbHVlKCksICd0ZXh0MScpO1xuXHRcdC8vIGRpc3Bvc2UgaXRcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKHJlc291cmNlKTtcblxuXHRcdC8vIGNyZWF0ZSBhIG5ldyBtb2RlbCB3aXRoIHRoZSBzYW1lIGNvbnRlbnRcblx0XHRjb25zdCBtb2RlbDIgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ3RleHQyJywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdC8vIHVuZG9cblx0XHRtb2RlbDIudW5kbygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDIuZ2V0VmFsdWUoKSwgJ3RleHQyJyk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBzaG91bGQgY2xlYXIgdW5kbyBzdGFjaycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnZmlsZTovL3Rlc3QudHh0Jyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dCcsIG51bGwsIHJlc291cmNlKTtcblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgdGV4dDogJzEnIH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndGV4dDEnKTtcblxuXHRcdG1vZGVsLnNldFZhbHVlKCd0ZXh0MicpO1xuXHRcdG1vZGVsLnVuZG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3RleHQyJyk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBhc3NlcnRDb21wdXRlRWRpdHMobGluZXMxOiBzdHJpbmdbXSwgbGluZXMyOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChsaW5lczEuam9pbignXFxuJykpO1xuXHRjb25zdCB7IGRpc3Bvc2FibGUsIHRleHRCdWZmZXIgfSA9IGNyZWF0ZVRleHRCdWZmZXIobGluZXMyLmpvaW4oJ1xcbicpLCBEZWZhdWx0RW5kT2ZMaW5lLkxGKTtcblxuXHQvLyBjb21wdXRlIHJlcXVpcmVkIGVkaXRzXG5cdC8vIGxldCBzdGFydCA9IERhdGUubm93KCk7XG5cdGNvbnN0IGVkaXRzID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXHQvLyBjb25zb2xlLmxvZyhgdG9vayAke0RhdGUubm93KCkgLSBzdGFydH0gbXMuYCk7XG5cblx0Ly8gYXBwbHkgZWRpdHNcblx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBlZGl0cywgbnVsbCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIGxpbmVzMi5qb2luKCdcXG4nKSk7XG5cdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRtb2RlbC5kaXNwb3NlKCk7XG59XG5cbmZ1bmN0aW9uIGdldFJhbmRvbUludChtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKSArIG1pbjtcbn1cblxuZnVuY3Rpb24gZ2V0UmFuZG9tU3RyaW5nKG1pbkxlbmd0aDogbnVtYmVyLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IGxlbmd0aCA9IGdldFJhbmRvbUludChtaW5MZW5ndGgsIG1heExlbmd0aCk7XG5cdGNvbnN0IHQgPSBuZXcgU3RyaW5nQnVpbGRlcihsZW5ndGgpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0dC5hcHBlbmRBU0NJSUNoYXJDb2RlKGdldFJhbmRvbUludChDaGFyQ29kZS5hLCBDaGFyQ29kZS56KSk7XG5cdH1cblx0cmV0dXJuIHQuYnVpbGQoKTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVGaWxlKHNtYWxsOiBib29sZWFuKTogc3RyaW5nW10ge1xuXHRjb25zdCBsaW5lQ291bnQgPSBnZXRSYW5kb21JbnQoMSwgc21hbGwgPyAzIDogMTAwMDApO1xuXHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lQ291bnQ7IGkrKykge1xuXHRcdGxpbmVzLnB1c2goZ2V0UmFuZG9tU3RyaW5nKDAsIHNtYWxsID8gMyA6IDEwMDAwKSk7XG5cdH1cblx0cmV0dXJuIGxpbmVzO1xufVxuXG5pZiAoR0VORVJBVEVfVEVTVFMpIHtcblx0bGV0IG51bWJlciA9IDE7XG5cdHdoaWxlICh0cnVlKSB7XG5cblx0XHRjb25zb2xlLmxvZygnLS0tLS0tVEVTVDogJyArIG51bWJlcisrKTtcblxuXHRcdGNvbnN0IGZpbGUxID0gZ2VuZXJhdGVGaWxlKHRydWUpO1xuXHRcdGNvbnN0IGZpbGUyID0gZ2VuZXJhdGVGaWxlKHRydWUpO1xuXG5cdFx0Y29uc29sZS5sb2coJy0tLS0tLVRFU1QgR0VORVJBVEVEJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0Y29uc29sZS5sb2coYFxuY29uc3QgZmlsZTEgPSAke0pTT04uc3RyaW5naWZ5KGZpbGUxKS5yZXBsYWNlKC9cIi9nLCAnXFwnJyl9O1xuY29uc3QgZmlsZTIgPSAke0pTT04uc3RyaW5naWZ5KGZpbGUyKS5yZXBsYWNlKC9cIi9nLCAnXFwnJyl9O1xuYXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5gKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgdmFsdWU6IHN0cmluZyB8IElUZXh0QnVmZmVyRmFjdG9yeSB8IElUZXh0U25hcHNob3QsIGRlZmF1bHRFT0w6IERlZmF1bHRFbmRPZkxpbmUpOiBJVGV4dEJ1ZmZlciB7XG5cdGNvbnN0IHsgZGlzcG9zYWJsZSwgdGV4dEJ1ZmZlciB9ID0gY3JlYXRlVGV4dEJ1ZmZlcih2YWx1ZSwgZGVmYXVsdEVPTCk7XG5cdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0cmV0dXJuIHRleHRCdWZmZXI7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFB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
