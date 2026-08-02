import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../../platform/log/common/log.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { AskQuestionsTool } from "../../../../common/tools/builtinTools/askQuestionsTool.js";
class TestableAskQuestionsTool extends AskQuestionsTool {
  testConvertCarouselAnswers(questions, carouselAnswers) {
    const idToHeaderMap = /* @__PURE__ */ new Map();
    for (const q of questions) {
      idToHeaderMap.set(q.header, q.header);
    }
    return this.convertCarouselAnswers(questions, carouselAnswers, idToHeaderMap);
  }
}
suite("AskQuestionsTool - convertCarouselAnswers", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let tool;
  setup(() => {
    tool = store.add(new TestableAskQuestionsTool(
      null,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
  });
  teardown(() => {
    tool?.dispose();
  });
  test("marks all questions as skipped when answers are undefined", () => {
    const questions = [
      { header: "Q1", question: "First question?" },
      { header: "Q2", question: "Second question?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, void 0);
    const expected = {
      Q1: { selected: [], freeText: null, skipped: true },
      Q2: { selected: [], freeText: null, skipped: true }
    };
    assert.deepStrictEqual(result.answers, expected);
  });
  test("handles string answers as option selection or free text", () => {
    const questions = [
      { header: "Color", question: "Pick a color", options: [{ label: "Red" }, { label: "Blue" }] },
      { header: "Comment", question: "Any comment?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Color: "Blue", Comment: "Nice" });
    assert.deepStrictEqual(result.answers["Color"], { selected: ["Blue"], freeText: null, skipped: false });
    assert.deepStrictEqual(result.answers["Comment"], { selected: [], freeText: "Nice", skipped: false });
  });
  test("handles array answers for multi-select", () => {
    const questions = [
      { header: "Features", question: "Pick features", multiSelect: true, options: [{ label: "A" }, { label: "B" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Features: { selectedValues: ["A", "B"] } });
    assert.deepStrictEqual(result.answers["Features"], { selected: ["A", "B"], freeText: null, skipped: false });
  });
  test("handles selectedValue object answers", () => {
    const questions = [
      { header: "Range", question: "Use range?", options: [{ label: "Yes" }, { label: "No" }] },
      { header: "Feedback", question: "Feedback?" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, {
      Range: { selectedValue: "Yes" },
      Feedback: { selectedValue: "Great!" }
    });
    assert.deepStrictEqual(result.answers["Range"], { selected: ["Yes"], freeText: null, skipped: false });
    assert.deepStrictEqual(result.answers["Feedback"], { selected: [], freeText: "Great!", skipped: false });
  });
  test("handles selectedValues object answers", () => {
    const questions = [
      { header: "Options", question: "Pick options", multiSelect: true, options: [{ label: "X" }, { label: "Y" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Options: { selectedValues: ["X"] } });
    assert.deepStrictEqual(result.answers["Options"], { selected: ["X"], freeText: null, skipped: false });
  });
  test("handles freeformValue with no selection", () => {
    const questions = [
      { header: "Choice", question: "Pick or write", options: [{ label: "A" }, { label: "B" }], allowFreeformInput: true }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Choice: { freeformValue: "Custom" } });
    assert.deepStrictEqual(result.answers["Choice"], { selected: [], freeText: "Custom", skipped: false });
  });
  test("marks unknown formats as skipped", () => {
    const questions = [
      { header: "Odd", question: "Unknown" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Odd: 42 });
    assert.deepStrictEqual(result.answers["Odd"], { selected: [], freeText: null, skipped: true });
  });
  test("handles mixed answers and missing keys", () => {
    const questions = [
      { header: "Q1", question: "String answer" },
      { header: "Q2", question: "Object answer", options: [{ label: "A" }] },
      { header: "Q3", question: "Array answer", multiSelect: true },
      { header: "Q4", question: "Missing answer" }
    ];
    const result = tool.testConvertCarouselAnswers(questions, {
      Q1: "text",
      Q2: { selectedValue: "A" },
      Q3: { selectedValues: ["x", "y"] }
    });
    assert.strictEqual(result.answers["Q1"].freeText, "text");
    assert.deepStrictEqual(result.answers["Q2"].selected, ["A"]);
    assert.deepStrictEqual(result.answers["Q3"].selected, ["x", "y"]);
    assert.strictEqual(result.answers["Q4"].skipped, true);
  });
  test("is case-sensitive when matching options", () => {
    const questions = [
      { header: "Case", question: "Pick", options: [{ label: "Yes" }, { label: "No" }] }
    ];
    const result = tool.testConvertCarouselAnswers(questions, { Case: "yes" });
    assert.deepStrictEqual(result.answers["Case"], { selected: [], freeText: "yes", skipped: false });
  });
});
suite("AskQuestionsTool - invoke", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("marks the carousel used when invocation is cancelled after it is shown", async () => {
    let appendedCarousel;
    const request = {
      id: "request-1",
      message: { text: "" },
      modeInfo: void 0,
      response: void 0,
      terminalExecutionId: void 0
    };
    const chatService = {
      getSession: () => ({
        getRequests: () => [request]
      }),
      appendProgress: (_request, progress) => {
        appendedCarousel = progress;
      },
      onDidReceiveQuestionCarouselAnswer: Event.None
    };
    const tool = store.add(new AskQuestionsTool(
      chatService,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
    const tokenSource = new CancellationTokenSource();
    const invokePromise = tool.invoke({
      parameters: {
        questions: [{ header: "Theme", question: "What is your favorite theme in VS Code?" }]
      },
      context: { sessionResource: URI.parse("test://session") },
      chatRequestId: "request-1"
    }, void 0, { report: () => {
    } }, tokenSource.token);
    assert.ok(appendedCarousel, "expected question carousel to be appended before cancellation");
    tokenSource.cancel();
    await assert.rejects(invokePromise, (error) => error instanceof CancellationError);
    assert.ok(appendedCarousel, "expected appended carousel to remain available after cancellation");
    assert.strictEqual(appendedCarousel.isUsed, true);
    assert.deepStrictEqual(appendedCarousel.data, {});
    assert.strictEqual(appendedCarousel.completion.isResolved, true);
    assert.deepStrictEqual(appendedCarousel.completion.value, { answers: void 0 });
    assert.strictEqual(appendedCarousel.draftAnswers, void 0);
    assert.strictEqual(appendedCarousel.draftCurrentIndex, void 0);
    assert.strictEqual(appendedCarousel.draftCollapsed, void 0);
  });
  test("uses externally notified answers instead of showing skipped", async () => {
    let appendedCarousel;
    const onDidReceiveQuestionCarouselAnswer = new Emitter();
    const request = {
      id: "request-1",
      message: { text: "" },
      modeInfo: void 0,
      response: void 0,
      terminalExecutionId: void 0
    };
    const chatService = {
      getSession: () => ({
        getRequests: () => [request]
      }),
      appendProgress: (_request, progress) => {
        appendedCarousel = progress;
      },
      onDidReceiveQuestionCarouselAnswer: onDidReceiveQuestionCarouselAnswer.event
    };
    const tool = store.add(new AskQuestionsTool(
      chatService,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
    const invokePromise = tool.invoke({
      callId: "tool-call",
      chatStreamToolCallId: "remote-tool-call",
      parameters: {
        questions: [{ header: "Color", question: "What is your favorite color?", options: [{ label: "Blue" }, { label: "Red" }] }]
      },
      context: { sessionResource: URI.parse("test://session") },
      chatRequestId: "request-1",
      toolId: "vscode_askQuestions"
    }, void 0, { report: () => {
    } }, CancellationToken.None);
    assert.ok(appendedCarousel, "expected question carousel to be appended before external answer");
    onDidReceiveQuestionCarouselAnswer.fire({
      requestId: "ignored",
      resolveId: "remote-tool-call",
      answers: {
        "remote-tool-call:0": { selectedValue: "Blue" }
      }
    });
    const result = await invokePromise;
    assert.deepStrictEqual(JSON.parse(String(result.content[0].value)), {
      answers: {
        Color: { selected: ["Blue"], freeText: null, skipped: false }
      }
    });
    assert.strictEqual(appendedCarousel.isUsed, true);
    assert.deepStrictEqual(appendedCarousel.data, {
      "remote-tool-call:0": { selectedValue: "Blue" }
    });
  });
});
suite("AskQuestionsTool - prepareToolInvocation validation", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let tool;
  setup(() => {
    tool = store.add(new AskQuestionsTool(
      null,
      NullTelemetryService,
      new NullLogService(),
      new TestConfigurationService()
    ));
  });
  function makeContext(questions) {
    return {
      parameters: { questions },
      toolCallId: "test-call",
      chatRequestId: "request-1",
      chatSessionResource: URI.parse("test://session")
    };
  }
  test("rejects single option without freeform input", async () => {
    await assert.rejects(
      tool.prepareToolInvocation(makeContext([
        { header: "Q1", question: "Pick one", options: [{ label: "Only option" }] }
      ]), CancellationToken.None),
      /must have at least two options/
    );
  });
  test("allows single option with freeform input", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Pick one", options: [{ label: "Only option" }], allowFreeformInput: true }
    ]), CancellationToken.None);
    assert.ok(result);
  });
  test("allows two or more options without freeform input", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Pick one", options: [{ label: "A" }, { label: "B" }] }
    ]), CancellationToken.None);
    assert.ok(result);
  });
  test("allows no options (free text)", async () => {
    const result = await tool.prepareToolInvocation(makeContext([
      { header: "Q1", question: "Type something" }
    ]), CancellationToken.None);
    assert.ok(result);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2Fza1F1ZXN0aW9uc1Rvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXNrUXVlc3Rpb25zVG9vbCwgSUFuc3dlclJlc3VsdCwgSVF1ZXN0aW9uLCBJUXVlc3Rpb25BbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL2Fza1F1ZXN0aW9uc1Rvb2wuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5cbmNsYXNzIFRlc3RhYmxlQXNrUXVlc3Rpb25zVG9vbCBleHRlbmRzIEFza1F1ZXN0aW9uc1Rvb2wge1xuXHRwdWJsaWMgdGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSwgY2Fyb3VzZWxBbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCk6IElBbnN3ZXJSZXN1bHQge1xuXHRcdC8vIENyZWF0ZSBhbiBpZGVudGl0eSBtYXAgd2hlcmUgZWFjaCBoZWFkZXIgaXMgYWxzbyB0aGUgaW50ZXJuYWwgSURcblx0XHQvLyBUaGlzIHNpbXVsYXRlcyB0aGUgc2ltcGxlIGNhc2UgZm9yIHRlc3RpbmcgdGhlIGFuc3dlciBjb252ZXJzaW9uIGxvZ2ljXG5cdFx0Y29uc3QgaWRUb0hlYWRlck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBxIG9mIHF1ZXN0aW9ucykge1xuXHRcdFx0aWRUb0hlYWRlck1hcC5zZXQocS5oZWFkZXIsIHEuaGVhZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIGNhcm91c2VsQW5zd2VycywgaWRUb0hlYWRlck1hcCk7XG5cdH1cbn1cblxuc3VpdGUoJ0Fza1F1ZXN0aW9uc1Rvb2wgLSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgdG9vbDogVGVzdGFibGVBc2tRdWVzdGlvbnNUb29sO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0b29sID0gc3RvcmUuYWRkKG5ldyBUZXN0YWJsZUFza1F1ZXN0aW9uc1Rvb2woXG5cdFx0XHRudWxsISBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHR0b29sPy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIGFsbCBxdWVzdGlvbnMgYXMgc2tpcHBlZCB3aGVuIGFuc3dlcnMgYXJlIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdRMScsIHF1ZXN0aW9uOiAnRmlyc3QgcXVlc3Rpb24/JyB9LFxuXHRcdFx0eyBoZWFkZXI6ICdRMicsIHF1ZXN0aW9uOiAnU2Vjb25kIHF1ZXN0aW9uPycgfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkOiBSZWNvcmQ8c3RyaW5nLCBJUXVlc3Rpb25BbnN3ZXI+ID0ge1xuXHRcdFx0UTE6IHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogdHJ1ZSB9LFxuXHRcdFx0UTI6IHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogdHJ1ZSB9XG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgc3RyaW5nIGFuc3dlcnMgYXMgb3B0aW9uIHNlbGVjdGlvbiBvciBmcmVlIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXSA9IFtcblx0XHRcdHsgaGVhZGVyOiAnQ29sb3InLCBxdWVzdGlvbjogJ1BpY2sgYSBjb2xvcicsIG9wdGlvbnM6IFt7IGxhYmVsOiAnUmVkJyB9LCB7IGxhYmVsOiAnQmx1ZScgfV0gfSxcblx0XHRcdHsgaGVhZGVyOiAnQ29tbWVudCcsIHF1ZXN0aW9uOiAnQW55IGNvbW1lbnQ/JyB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7IENvbG9yOiAnQmx1ZScsIENvbW1lbnQ6ICdOaWNlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ0NvbG9yJ10sIHsgc2VsZWN0ZWQ6IFsnQmx1ZSddLCBmcmVlVGV4dDogbnVsbCwgc2tpcHBlZDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snQ29tbWVudCddLCB7IHNlbGVjdGVkOiBbXSwgZnJlZVRleHQ6ICdOaWNlJywgc2tpcHBlZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgYXJyYXkgYW5zd2VycyBmb3IgbXVsdGktc2VsZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ0ZlYXR1cmVzJywgcXVlc3Rpb246ICdQaWNrIGZlYXR1cmVzJywgbXVsdGlTZWxlY3Q6IHRydWUsIG9wdGlvbnM6IFt7IGxhYmVsOiAnQScgfSwgeyBsYWJlbDogJ0InIH1dIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdG9vbC50ZXN0Q29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIHsgRmVhdHVyZXM6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsnQScsICdCJ10gfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ0ZlYXR1cmVzJ10sIHsgc2VsZWN0ZWQ6IFsnQScsICdCJ10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBzZWxlY3RlZFZhbHVlIG9iamVjdCBhbnN3ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ1JhbmdlJywgcXVlc3Rpb246ICdVc2UgcmFuZ2U/Jywgb3B0aW9uczogW3sgbGFiZWw6ICdZZXMnIH0sIHsgbGFiZWw6ICdObycgfV0gfSxcblx0XHRcdHsgaGVhZGVyOiAnRmVlZGJhY2snLCBxdWVzdGlvbjogJ0ZlZWRiYWNrPycgfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywge1xuXHRcdFx0UmFuZ2U6IHsgc2VsZWN0ZWRWYWx1ZTogJ1llcycgfSxcblx0XHRcdEZlZWRiYWNrOiB7IHNlbGVjdGVkVmFsdWU6ICdHcmVhdCEnIH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ1JhbmdlJ10sIHsgc2VsZWN0ZWQ6IFsnWWVzJ10sIGZyZWVUZXh0OiBudWxsLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydGZWVkYmFjayddLCB7IHNlbGVjdGVkOiBbXSwgZnJlZVRleHQ6ICdHcmVhdCEnLCBza2lwcGVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBzZWxlY3RlZFZhbHVlcyBvYmplY3QgYW5zd2VycycsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdPcHRpb25zJywgcXVlc3Rpb246ICdQaWNrIG9wdGlvbnMnLCBtdWx0aVNlbGVjdDogdHJ1ZSwgb3B0aW9uczogW3sgbGFiZWw6ICdYJyB9LCB7IGxhYmVsOiAnWScgfV0gfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgeyBPcHRpb25zOiB7IHNlbGVjdGVkVmFsdWVzOiBbJ1gnXSB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snT3B0aW9ucyddLCB7IHNlbGVjdGVkOiBbJ1gnXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGZyZWVmb3JtVmFsdWUgd2l0aCBubyBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcXVlc3Rpb25zOiBJUXVlc3Rpb25bXSA9IFtcblx0XHRcdHsgaGVhZGVyOiAnQ2hvaWNlJywgcXVlc3Rpb246ICdQaWNrIG9yIHdyaXRlJywgb3B0aW9uczogW3sgbGFiZWw6ICdBJyB9LCB7IGxhYmVsOiAnQicgfV0sIGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSB9XG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRvb2wudGVzdENvbnZlcnRDYXJvdXNlbEFuc3dlcnMocXVlc3Rpb25zLCB7IENob2ljZTogeyBmcmVlZm9ybVZhbHVlOiAnQ3VzdG9tJyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuYW5zd2Vyc1snQ2hvaWNlJ10sIHsgc2VsZWN0ZWQ6IFtdLCBmcmVlVGV4dDogJ0N1c3RvbScsIHNraXBwZWQ6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB1bmtub3duIGZvcm1hdHMgYXMgc2tpcHBlZCcsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdPZGQnLCBxdWVzdGlvbjogJ1Vua25vd24nIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdG9vbC50ZXN0Q29udmVydENhcm91c2VsQW5zd2VycyhxdWVzdGlvbnMsIHsgT2RkOiA0MiBhcyB1bmtub3duIGFzIG9iamVjdCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ09kZCddLCB7IHNlbGVjdGVkOiBbXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbWl4ZWQgYW5zd2VycyBhbmQgbWlzc2luZyBrZXlzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXN0aW9uczogSVF1ZXN0aW9uW10gPSBbXG5cdFx0XHR7IGhlYWRlcjogJ1ExJywgcXVlc3Rpb246ICdTdHJpbmcgYW5zd2VyJyB9LFxuXHRcdFx0eyBoZWFkZXI6ICdRMicsIHF1ZXN0aW9uOiAnT2JqZWN0IGFuc3dlcicsIG9wdGlvbnM6IFt7IGxhYmVsOiAnQScgfV0gfSxcblx0XHRcdHsgaGVhZGVyOiAnUTMnLCBxdWVzdGlvbjogJ0FycmF5IGFuc3dlcicsIG11bHRpU2VsZWN0OiB0cnVlIH0sXG5cdFx0XHR7IGhlYWRlcjogJ1E0JywgcXVlc3Rpb246ICdNaXNzaW5nIGFuc3dlcicgfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywge1xuXHRcdFx0UTE6ICd0ZXh0Jyxcblx0XHRcdFEyOiB7IHNlbGVjdGVkVmFsdWU6ICdBJyB9LFxuXHRcdFx0UTM6IHsgc2VsZWN0ZWRWYWx1ZXM6IFsneCcsICd5J10gfVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydRMSddLmZyZWVUZXh0LCAndGV4dCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ1EyJ10uc2VsZWN0ZWQsIFsnQSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5hbnN3ZXJzWydRMyddLnNlbGVjdGVkLCBbJ3gnLCAneSddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ1E0J10uc2tpcHBlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzIGNhc2Utc2Vuc2l0aXZlIHdoZW4gbWF0Y2hpbmcgb3B0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBxdWVzdGlvbnM6IElRdWVzdGlvbltdID0gW1xuXHRcdFx0eyBoZWFkZXI6ICdDYXNlJywgcXVlc3Rpb246ICdQaWNrJywgb3B0aW9uczogW3sgbGFiZWw6ICdZZXMnIH0sIHsgbGFiZWw6ICdObycgfV0gfVxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0b29sLnRlc3RDb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHF1ZXN0aW9ucywgeyBDYXNlOiAneWVzJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmFuc3dlcnNbJ0Nhc2UnXSwgeyBzZWxlY3RlZDogW10sIGZyZWVUZXh0OiAneWVzJywgc2tpcHBlZDogZmFsc2UgfSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBc2tRdWVzdGlvbnNUb29sIC0gaW52b2tlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hcmtzIHRoZSBjYXJvdXNlbCB1c2VkIHdoZW4gaW52b2NhdGlvbiBpcyBjYW5jZWxsZWQgYWZ0ZXIgaXQgaXMgc2hvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGFwcGVuZGVkQ2Fyb3VzZWw6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXF1ZXN0ID0ge1xuXHRcdFx0aWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnJyB9LFxuXHRcdFx0bW9kZUluZm86IHVuZGVmaW5lZCxcblx0XHRcdHJlc3BvbnNlOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IHtcblx0XHRcdGdldFNlc3Npb246ICgpID0+ICh7XG5cdFx0XHRcdGdldFJlcXVlc3RzOiAoKSA9PiBbcmVxdWVzdF0sXG5cdFx0XHR9KSxcblx0XHRcdGFwcGVuZFByb2dyZXNzOiAoX3JlcXVlc3Q6IHVua25vd24sIHByb2dyZXNzOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEpID0+IHtcblx0XHRcdFx0YXBwZW5kZWRDYXJvdXNlbCA9IHByb2dyZXNzO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVjZWl2ZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXI6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZTtcblx0XHRjb25zdCB0b29sID0gc3RvcmUuYWRkKG5ldyBBc2tRdWVzdGlvbnNUb29sKFxuXHRcdFx0Y2hhdFNlcnZpY2UsXG5cdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpXG5cdFx0KSk7XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGNvbnN0IGludm9rZVByb21pc2UgPSB0b29sLmludm9rZSh7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdHF1ZXN0aW9uczogW3sgaGVhZGVyOiAnVGhlbWUnLCBxdWVzdGlvbjogJ1doYXQgaXMgeW91ciBmYXZvcml0ZSB0aGVtZSBpbiBWUyBDb2RlPycgfV0sXG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dDogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSB9LFxuXHRcdFx0Y2hhdFJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0fSBhcyBuZXZlciwgdW5kZWZpbmVkIGFzIG5ldmVyLCB7IHJlcG9ydDogKCkgPT4geyB9IH0sIHRva2VuU291cmNlLnRva2VuKTtcblxuXHRcdGFzc2VydC5vayhhcHBlbmRlZENhcm91c2VsLCAnZXhwZWN0ZWQgcXVlc3Rpb24gY2Fyb3VzZWwgdG8gYmUgYXBwZW5kZWQgYmVmb3JlIGNhbmNlbGxhdGlvbicpO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoaW52b2tlUHJvbWlzZSwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKGFwcGVuZGVkQ2Fyb3VzZWwsICdleHBlY3RlZCBhcHBlbmRlZCBjYXJvdXNlbCB0byByZW1haW4gYXZhaWxhYmxlIGFmdGVyIGNhbmNlbGxhdGlvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmlzVXNlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmRhdGEsIHt9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kZWRDYXJvdXNlbC5jb21wbGV0aW9uLmlzUmVzb2x2ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwZW5kZWRDYXJvdXNlbC5jb21wbGV0aW9uLnZhbHVlLCB7IGFuc3dlcnM6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kZWRDYXJvdXNlbC5kcmFmdEFuc3dlcnMsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXgsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZGVkQ2Fyb3VzZWwuZHJhZnRDb2xsYXBzZWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgZXh0ZXJuYWxseSBub3RpZmllZCBhbnN3ZXJzIGluc3RlYWQgb2Ygc2hvd2luZyBza2lwcGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhcHBlbmRlZENhcm91c2VsOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlciA9IG5ldyBFbWl0dGVyPHsgcmVxdWVzdElkOiBzdHJpbmc7IHJlc29sdmVJZDogc3RyaW5nOyBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCB9PigpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB7XG5cdFx0XHRpZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnIH0sXG5cdFx0XHRtb2RlSW5mbzogdW5kZWZpbmVkLFxuXHRcdFx0cmVzcG9uc2U6IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsRXhlY3V0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0ge1xuXHRcdFx0Z2V0U2Vzc2lvbjogKCkgPT4gKHtcblx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFtyZXF1ZXN0XSxcblx0XHRcdH0pLFxuXHRcdFx0YXBwZW5kUHJvZ3Jlc3M6IChfcmVxdWVzdDogdW5rbm93biwgcHJvZ3Jlc3M6IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkgPT4ge1xuXHRcdFx0XHRhcHBlbmRlZENhcm91c2VsID0gcHJvZ3Jlc3M7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlcjogb25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlO1xuXHRcdGNvbnN0IHRvb2wgPSBzdG9yZS5hZGQobmV3IEFza1F1ZXN0aW9uc1Rvb2woXG5cdFx0XHRjaGF0U2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKClcblx0XHQpKTtcblx0XHRjb25zdCBpbnZva2VQcm9taXNlID0gdG9vbC5pbnZva2Uoe1xuXHRcdFx0Y2FsbElkOiAndG9vbC1jYWxsJyxcblx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkOiAncmVtb3RlLXRvb2wtY2FsbCcsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdHF1ZXN0aW9uczogW3sgaGVhZGVyOiAnQ29sb3InLCBxdWVzdGlvbjogJ1doYXQgaXMgeW91ciBmYXZvcml0ZSBjb2xvcj8nLCBvcHRpb25zOiBbeyBsYWJlbDogJ0JsdWUnIH0sIHsgbGFiZWw6ICdSZWQnIH1dIH1dLFxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHQ6IHsgc2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJykgfSxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0dG9vbElkOiAndnNjb2RlX2Fza1F1ZXN0aW9ucycsXG5cdFx0fSBhcyBuZXZlciwgdW5kZWZpbmVkIGFzIG5ldmVyLCB7IHJlcG9ydDogKCkgPT4geyB9IH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFwcGVuZGVkQ2Fyb3VzZWwsICdleHBlY3RlZCBxdWVzdGlvbiBjYXJvdXNlbCB0byBiZSBhcHBlbmRlZCBiZWZvcmUgZXh0ZXJuYWwgYW5zd2VyJyk7XG5cdFx0b25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlci5maXJlKHtcblx0XHRcdHJlcXVlc3RJZDogJ2lnbm9yZWQnLFxuXHRcdFx0cmVzb2x2ZUlkOiAncmVtb3RlLXRvb2wtY2FsbCcsXG5cdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdCdyZW1vdGUtdG9vbC1jYWxsOjAnOiB7IHNlbGVjdGVkVmFsdWU6ICdCbHVlJyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZVByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKFN0cmluZyhyZXN1bHQuY29udGVudFswXS52YWx1ZSkpLCB7XG5cdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdENvbG9yOiB7IHNlbGVjdGVkOiBbJ0JsdWUnXSwgZnJlZVRleHQ6IG51bGwsIHNraXBwZWQ6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmlzVXNlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRlZENhcm91c2VsLmRhdGEsIHtcblx0XHRcdCdyZW1vdGUtdG9vbC1jYWxsOjAnOiB7IHNlbGVjdGVkVmFsdWU6ICdCbHVlJyB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQXNrUXVlc3Rpb25zVG9vbCAtIHByZXBhcmVUb29sSW52b2NhdGlvbiB2YWxpZGF0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgdG9vbDogQXNrUXVlc3Rpb25zVG9vbDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dG9vbCA9IHN0b3JlLmFkZChuZXcgQXNrUXVlc3Rpb25zVG9vbChcblx0XHRcdG51bGwhIGFzIElDaGF0U2VydmljZSxcblx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKClcblx0XHQpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gbWFrZUNvbnRleHQocXVlc3Rpb25zOiBJUXVlc3Rpb25bXSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7IHF1ZXN0aW9ucyB9LFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rlc3QtY2FsbCcsXG5cdFx0XHRjaGF0UmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgncmVqZWN0cyBzaW5nbGUgb3B0aW9uIHdpdGhvdXQgZnJlZWZvcm0gaW5wdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHR0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihtYWtlQ29udGV4dChbXG5cdFx0XHRcdHsgaGVhZGVyOiAnUTEnLCBxdWVzdGlvbjogJ1BpY2sgb25lJywgb3B0aW9uczogW3sgbGFiZWw6ICdPbmx5IG9wdGlvbicgfV0gfVxuXHRcdFx0XSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L211c3QgaGF2ZSBhdCBsZWFzdCB0d28gb3B0aW9ucy9cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3Mgc2luZ2xlIG9wdGlvbiB3aXRoIGZyZWVmb3JtIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKG1ha2VDb250ZXh0KFtcblx0XHRcdHsgaGVhZGVyOiAnUTEnLCBxdWVzdGlvbjogJ1BpY2sgb25lJywgb3B0aW9uczogW3sgbGFiZWw6ICdPbmx5IG9wdGlvbicgfV0sIGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSB9XG5cdFx0XSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgdHdvIG9yIG1vcmUgb3B0aW9ucyB3aXRob3V0IGZyZWVmb3JtIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKG1ha2VDb250ZXh0KFtcblx0XHRcdHsgaGVhZGVyOiAnUTEnLCBxdWVzdGlvbjogJ1BpY2sgb25lJywgb3B0aW9uczogW3sgbGFiZWw6ICdBJyB9LCB7IGxhYmVsOiAnQicgfV0gfVxuXHRcdF0pLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIG5vIG9wdGlvbnMgKGZyZWUgdGV4dCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24obWFrZUNvbnRleHQoW1xuXHRcdFx0eyBoZWFkZXI6ICdRMScsIHF1ZXN0aW9uOiAnVHlwZSBzb21ldGhpbmcnIH1cblx0XHRdKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHdCQUFtRTtBQUc1RSxNQUFNLGlDQUFpQyxpQkFBaUI7QUFBQSxFQUNoRCwyQkFBMkIsV0FBd0IsaUJBQWtFO0FBRzNILFVBQU0sZ0JBQWdCLG9CQUFJLElBQW9CO0FBQzlDLGVBQVcsS0FBSyxXQUFXO0FBQzFCLG9CQUFjLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTTtBQUFBLElBQ3JDO0FBQ0EsV0FBTyxLQUFLLHVCQUF1QixXQUFXLGlCQUFpQixhQUFhO0FBQUEsRUFDN0U7QUFDRDtBQUVBLE1BQU0sNkNBQTZDLE1BQU07QUFDeEQsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsV0FBTyxNQUFNLElBQUksSUFBSTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsTUFDbkIsSUFBSSx5QkFBeUI7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFlBQXlCO0FBQUEsTUFDOUIsRUFBRSxRQUFRLE1BQU0sVUFBVSxrQkFBa0I7QUFBQSxNQUM1QyxFQUFFLFFBQVEs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
