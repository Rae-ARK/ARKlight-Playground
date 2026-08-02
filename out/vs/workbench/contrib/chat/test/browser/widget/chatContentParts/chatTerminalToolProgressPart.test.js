import assert from "assert";
import { importAMDNodeModule } from "../../../../../../../amdX.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { IAccessibleViewService } from "../../../../../../../platform/accessibility/browser/accessibleView.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { InlineTextModelCollection } from "../../../../browser/widget/chatContentParts/chatContentParts.js";
import { DiffEditorPool, EditorPool } from "../../../../browser/widget/chatContentParts/chatContentCodePools.js";
import { ChatTerminalThinkingCollapsibleWrapper, ChatTerminalToolOutputSection } from "../../../../browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolProgressPart.js";
import { TerminalToolAutoExpand, TerminalToolAutoExpandTimeout } from "../../../../browser/widget/chatContentParts/toolInvocationParts/terminalToolAutoExpand.js";
import { ITerminalConfigurationService, ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { createFakeDetachedTerminal } from "../../../../../terminal/test/browser/chatTerminalMirrorTestUtils.js";
suite("ChatTerminalToolProgressPart Auto-Expand Logic", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let onCommandExecuted;
  let onCommandFinished;
  let onWillData;
  let isExpanded;
  let userToggledOutput;
  let hasRealOutputValue;
  function shouldAutoExpand() {
    return !isExpanded && !userToggledOutput;
  }
  function hasRealOutput() {
    return hasRealOutputValue;
  }
  function setupAutoExpandLogic() {
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: onWillData.event,
      shouldAutoExpand,
      hasRealOutput
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      isExpanded = true;
    }));
  }
  setup(() => {
    onCommandExecuted = store.add(new Emitter());
    onCommandFinished = store.add(new Emitter());
    onWillData = store.add(new Emitter());
    isExpanded = false;
    userToggledOutput = false;
    hasRealOutputValue = false;
  });
  suite("ChatTerminalThinkingCollapsibleWrapper", () => {
    test("animates terminal content and keeps collapsed content inert", () => {
      const context = {
        element: Object.assign(/* @__PURE__ */ Object.create(null), {
          id: "response",
          sessionResource: URI.parse("chat-session://test/session")
        }),
        elementIndex: 0,
        container: mainWindow.document.createElement("div"),
        content: [],
        contentIndex: 0,
        inlineTextModels: Object.create(InlineTextModelCollection.prototype),
        editorPool: Object.create(EditorPool.prototype),
        codeBlockStartIndex: 0,
        treeStartIndex: 0,
        diffEditorPool: Object.create(DiffEditorPool.prototype),
        currentWidth: observableValue("testWidth", 500),
        onDidChangeVisibility: Event.None
      };
      const terminalContent = mainWindow.document.createElement("div");
      terminalContent.textContent = "terminal output";
      const instantiationService = workbenchInstantiationService(void 0, store);
      const part = store.add(instantiationService.createInstance(
        ChatTerminalThinkingCollapsibleWrapper,
        "echo test",
        void 0,
        false,
        terminalContent,
        context,
        false,
        false,
        false,
        true,
        void 0
      ));
      mainWindow.document.body.appendChild(part.domNode);
      store.add(toDisposable(() => part.domNode.remove()));
      const button = part.domNode.querySelector(".monaco-button");
      const animationContainer = part.domNode.querySelector(".chat-collapsible-content-animation");
      const animationContent = part.domNode.querySelector(".chat-collapsible-content-animation-inner");
      assert.ok(button);
      assert.ok(animationContainer);
      assert.ok(animationContent);
      const initiallyInert = animationContent.inert;
      button.click();
      assert.deepStrictEqual({
        hasAnimationClass: part.domNode.classList.contains("chat-collapsible-content-animated"),
        animationDisplay: mainWindow.getComputedStyle(animationContainer).display,
        initiallyInert,
        expandedInert: animationContent.inert,
        containsTerminal: animationContent.contains(terminalContent),
        hasShowLink: !!part.domNode.querySelector(".chat-terminal-show-link")
      }, {
        hasAnimationClass: true,
        animationDisplay: "grid",
        initiallyInert: true,
        expandedInert: false,
        containsTerminal: true,
        hasShowLink: false
      });
    });
  });
  test("fast command without data should not auto-expand (finishes before timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand for fast command without data");
  }));
  test("fast command with quick data should not auto-expand (data + finish before timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when command finishes within timeout of first data");
  }));
  test("long-running command with data should auto-expand (data received, command still running after timeout)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, true, "Should expand when command still running after first data timeout");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command with data but no real output should NOT auto-expand (like sleep with shell sequences)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = false;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("shell-sequence");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when data is shell sequences, not real output");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command without data should NOT auto-expand if no real output (like sleep)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = false;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when no real output even after timeout");
    onCommandFinished.fire(void 0);
  }));
  test("long-running command without data SHOULD auto-expand if real output exists", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, true, "Should expand when real output exists after timeout");
    onCommandFinished.fire(void 0);
  }));
  test("data arriving after command finish should not trigger expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onCommandFinished.fire(void 0);
    onWillData.fire("late output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when data arrives after command finished");
  }));
  test("user toggled output prevents auto-expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    userToggledOutput = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "Should NOT expand when user has manually toggled output");
    onCommandFinished.fire(void 0);
  }));
  test("already expanded output prevents additional auto-expand", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    isExpanded = true;
    let eventFired = false;
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: onWillData.event,
      shouldAutoExpand: () => !isExpanded && !userToggledOutput,
      hasRealOutput: () => hasRealOutputValue
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      eventFired = true;
    }));
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(eventFired, false, "Should NOT fire expand event when already expanded");
    onCommandFinished.fire(void 0);
  }));
  test("data arriving cancels no-data timeout", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output");
    onCommandFinished.fire(void 0);
    await timeout(TerminalToolAutoExpandTimeout.NoData + 100);
    assert.strictEqual(isExpanded, false, "No-data timeout should be cancelled when data arrives");
  }));
  test("multiple data events only trigger one timeout", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    hasRealOutputValue = true;
    setupAutoExpandLogic();
    onCommandExecuted.fire(void 0);
    onWillData.fire("output 1");
    onWillData.fire("output 2");
    onWillData.fire("output 3");
    await timeout(TerminalToolAutoExpandTimeout.DataEvent + 100);
    assert.strictEqual(isExpanded, true, "Should expand exactly once after first data");
    onCommandFinished.fire(void 0);
  }));
});
suite("ChatTerminalToolOutputSection layout", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let XTermBaseCtor;
  let fakes;
  let mirrorFont;
  let container;
  setup(async () => {
    instantiationService = workbenchInstantiationService(void 0, store);
    XTermBaseCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    fakes = [];
    mirrorFont = { fontFamily: "monospace", fontSize: 12, letterSpacing: 0, lineHeight: 1, charWidth: 10, charHeight: 20 };
    instantiationService.stub(ITerminalService, {
      createDetachedTerminal: async (options) => {
        const fake = createFakeDetachedTerminal(XTermBaseCtor, options, mirrorFont);
        fakes.push(fake);
        return fake.instance;
      }
    });
    instantiationService.stub(ITerminalConfigurationService, {
      getFont: () => ({ fontFamily: "monospace", fontSize: 10, letterSpacing: 0, lineHeight: 1, charWidth: 6, charHeight: 10 })
    });
    instantiationService.stub(IAccessibleViewService, {
      getOpenAriaHint: () => null
    });
    container = mainWindow.document.createElement("div");
    container.style.width = "800px";
    mainWindow.document.body.appendChild(container);
    store.add(toDisposable(() => container.remove()));
  });
  function createSection(output) {
    const section = store.add(instantiationService.createInstance(
      ChatTerminalToolOutputSection,
      async () => void 0,
      () => void 0,
      () => void 0,
      () => output,
      () => "echo test",
      () => void 0,
      () => false,
      false
    ));
    container.appendChild(section.domNode);
    return section;
  }
  function boxHeight(section) {
    const scrollable = section.domNode.querySelector(".monaco-scrollable-element");
    return scrollable?.style.height ?? "";
  }
  function expectedHeight(section, rows, rowHeight) {
    const body = section.domNode.querySelector(".chat-terminal-output-body");
    const style = mainWindow.getComputedStyle(body);
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    return `${rows * rowHeight + padding}px`;
  }
  test("box height uses the mirror row height, not the config estimate", async () => {
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));
  });
  test("falls back to the config-font estimate while mirror metrics are unavailable", async () => {
    mirrorFont = { ...mirrorFont, charHeight: 0 };
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 10));
  });
  test("relayouts when the mirror announces changed cell metrics", async () => {
    const section = createSection({ text: "l1\r\nl2\r\nl3" });
    await section.toggle(true);
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 20));
    mirrorFont.charHeight = 30;
    const fake = fakes[0];
    const renderFired = new Promise((resolve) => {
      const listener = fake.raw.onRender(() => {
        listener.dispose();
        resolve();
      });
    });
    const host = mainWindow.document.createElement("div");
    container.appendChild(host);
    fake.raw.open(host);
    await renderFired;
    assert.strictEqual(boxHeight(section), expectedHeight(section, 3, 30));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JQb29sLCBFZGl0b3JQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBDaGF0VGVybWluYWxUaGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlciwgQ2hhdFRlcm1pbmFsVG9vbE91dHB1dFNlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sQXV0b0V4cGFuZCwgVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvdGVybWluYWxUb29sQXV0b0V4cGFuZC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsU2VydmljZSwgdHlwZSBJRGV0YWNoZWRYVGVybU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRm9udCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGYWtlRGV0YWNoZWRUZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci9jaGF0VGVybWluYWxNaXJyb3JUZXN0VXRpbHMuanMnO1xuXG5zdWl0ZSgnQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCBBdXRvLUV4cGFuZCBMb2dpYycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBNb2NrZWQgZXZlbnRzXG5cdGxldCBvbkNvbW1hbmRFeGVjdXRlZDogRW1pdHRlcjx1bmtub3duPjtcblx0bGV0IG9uQ29tbWFuZEZpbmlzaGVkOiBFbWl0dGVyPHVua25vd24+O1xuXHRsZXQgb25XaWxsRGF0YTogRW1pdHRlcjxzdHJpbmc+O1xuXG5cdC8vIFN0YXRlIHRyYWNraW5nXG5cdGxldCBpc0V4cGFuZGVkOiBib29sZWFuO1xuXHRsZXQgdXNlclRvZ2dsZWRPdXRwdXQ6IGJvb2xlYW47XG5cdGxldCBoYXNSZWFsT3V0cHV0VmFsdWU6IGJvb2xlYW47XG5cblx0ZnVuY3Rpb24gc2hvdWxkQXV0b0V4cGFuZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzRXhwYW5kZWQgJiYgIXVzZXJUb2dnbGVkT3V0cHV0O1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFzUmVhbE91dHB1dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFzUmVhbE91dHB1dFZhbHVlO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBBdXRvRXhwYW5kTG9naWMoKTogdm9pZCB7XG5cdFx0Ly8gVXNlIHRoZSByZWFsIFRlcm1pbmFsVG9vbEF1dG9FeHBhbmQgY2xhc3Mgd2l0aCBldmVudC1iYXNlZCBpbnRlcmZhY2Vcblx0XHRjb25zdCBhdXRvRXhwYW5kID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kKHtcblx0XHRcdG9uQ29tbWFuZEV4ZWN1dGVkOiBvbkNvbW1hbmRFeGVjdXRlZC5ldmVudCxcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBvbkNvbW1hbmRGaW5pc2hlZC5ldmVudCxcblx0XHRcdG9uV2lsbERhdGE6IG9uV2lsbERhdGEuZXZlbnQsXG5cdFx0XHRzaG91bGRBdXRvRXhwYW5kLFxuXHRcdFx0aGFzUmVhbE91dHB1dCxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9FeHBhbmQub25EaWRSZXF1ZXN0RXhwYW5kKCgpID0+IHtcblx0XHRcdGlzRXhwYW5kZWQgPSB0cnVlO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRvbkNvbW1hbmRFeGVjdXRlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx1bmtub3duPigpKTtcblx0XHRvbkNvbW1hbmRGaW5pc2hlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx1bmtub3duPigpKTtcblx0XHRvbldpbGxEYXRhID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cblx0XHRpc0V4cGFuZGVkID0gZmFsc2U7XG5cdFx0dXNlclRvZ2dsZWRPdXRwdXQgPSBmYWxzZTtcblx0XHRoYXNSZWFsT3V0cHV0VmFsdWUgPSBmYWxzZTtcblx0fSk7XG5cblx0c3VpdGUoJ0NoYXRUZXJtaW5hbFRoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FuaW1hdGVzIHRlcm1pbmFsIGNvbnRlbnQgYW5kIGtlZXBzIGNvbGxhcHNlZCBjb250ZW50IGluZXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCB7XG5cdFx0XHRcdFx0aWQ6ICdyZXNwb25zZScsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0XHRjb250YWluZXI6IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRcdGlubGluZVRleHRNb2RlbHM6IE9iamVjdC5jcmVhdGUoSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbi5wcm90b3R5cGUpIGFzIElubGluZVRleHRNb2RlbENvbGxlY3Rpb24sXG5cdFx0XHRcdGVkaXRvclBvb2w6IE9iamVjdC5jcmVhdGUoRWRpdG9yUG9vbC5wcm90b3R5cGUpIGFzIEVkaXRvclBvb2wsXG5cdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHRcdHRyZWVTdGFydEluZGV4OiAwLFxuXHRcdFx0XHRkaWZmRWRpdG9yUG9vbDogT2JqZWN0LmNyZWF0ZShEaWZmRWRpdG9yUG9vbC5wcm90b3R5cGUpIGFzIERpZmZFZGl0b3JQb29sLFxuXHRcdFx0XHRjdXJyZW50V2lkdGg6IG9ic2VydmFibGVWYWx1ZSgndGVzdFdpZHRoJywgNTAwKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudC5Ob25lLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0ZXJtaW5hbENvbnRlbnQudGV4dENvbnRlbnQgPSAndGVybWluYWwgb3V0cHV0Jztcblx0XHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0VGVybWluYWxUaGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlcixcblx0XHRcdFx0J2VjaG8gdGVzdCcsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRlcm1pbmFsQ29udGVudCxcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KSk7XG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLm1vbmFjby1idXR0b24nKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRhaW5lciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtY29sbGFwc2libGUtY29udGVudC1hbmltYXRpb24nKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRlbnQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbGxhcHNpYmxlLWNvbnRlbnQtYW5pbWF0aW9uLWlubmVyJyk7XG5cdFx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayhhbmltYXRpb25Db250YWluZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFuaW1hdGlvbkNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbGx5SW5lcnQgPSBhbmltYXRpb25Db250ZW50LmluZXJ0O1xuXHRcdFx0YnV0dG9uLmNsaWNrKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNBbmltYXRpb25DbGFzczogcGFydC5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb2xsYXBzaWJsZS1jb250ZW50LWFuaW1hdGVkJyksXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6IG1haW5XaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShhbmltYXRpb25Db250YWluZXIpLmRpc3BsYXksXG5cdFx0XHRcdGluaXRpYWxseUluZXJ0LFxuXHRcdFx0XHRleHBhbmRlZEluZXJ0OiBhbmltYXRpb25Db250ZW50LmluZXJ0LFxuXHRcdFx0XHRjb250YWluc1Rlcm1pbmFsOiBhbmltYXRpb25Db250ZW50LmNvbnRhaW5zKHRlcm1pbmFsQ29udGVudCksXG5cdFx0XHRcdGhhc1Nob3dMaW5rOiAhIXBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10ZXJtaW5hbC1zaG93LWxpbmsnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGFzQW5pbWF0aW9uQ2xhc3M6IHRydWUsXG5cdFx0XHRcdGFuaW1hdGlvbkRpc3BsYXk6ICdncmlkJyxcblx0XHRcdFx0aW5pdGlhbGx5SW5lcnQ6IHRydWUsXG5cdFx0XHRcdGV4cGFuZGVkSW5lcnQ6IGZhbHNlLFxuXHRcdFx0XHRjb250YWluc1Rlcm1pbmFsOiB0cnVlLFxuXHRcdFx0XHRoYXNTaG93TGluazogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFzdCBjb21tYW5kIHdpdGhvdXQgZGF0YSBzaG91bGQgbm90IGF1dG8tZXhwYW5kIChmaW5pc2hlcyBiZWZvcmUgdGltZW91dCknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIENvbW1hbmQgZmluaXNoZXMgcXVpY2tseSAoYmVmb3JlIHRpbWVvdXQpXG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gV2FpdCBwYXN0IGFsbCB0aW1lb3V0cyAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZXhwYW5kIGZvciBmYXN0IGNvbW1hbmQgd2l0aG91dCBkYXRhJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdmYXN0IGNvbW1hbmQgd2l0aCBxdWljayBkYXRhIHNob3VsZCBub3QgYXV0by1leHBhbmQgKGRhdGEgKyBmaW5pc2ggYmVmb3JlIHRpbWVvdXQpJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEYXRhIGFycml2ZXNcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCcpO1xuXG5cdFx0Ly8gQ29tbWFuZCBmaW5pc2hlcyBxdWlja2x5IChiZWZvcmUgdGltZW91dClcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5EYXRhRXZlbnQgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnU2hvdWxkIE5PVCBleHBhbmQgd2hlbiBjb21tYW5kIGZpbmlzaGVzIHdpdGhpbiB0aW1lb3V0IG9mIGZpcnN0IGRhdGEnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2xvbmctcnVubmluZyBjb21tYW5kIHdpdGggZGF0YSBzaG91bGQgYXV0by1leHBhbmQgKGRhdGEgcmVjZWl2ZWQsIGNvbW1hbmQgc3RpbGwgcnVubmluZyBhZnRlciB0aW1lb3V0KScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IHRydWU7IC8vIEhhcyByZWFsIG91dHB1dFxuXHRcdHNldHVwQXV0b0V4cGFuZExvZ2ljKCk7XG5cblx0XHQvLyBDb21tYW5kIGV4ZWN1dGVzXG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRGF0YSBhcnJpdmVzXG5cdFx0b25XaWxsRGF0YS5maXJlKCdvdXRwdXQnKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRpbWVvdXQgdG8gZmlyZSAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuRGF0YUV2ZW50ICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCB0cnVlLCAnU2hvdWxkIGV4cGFuZCB3aGVuIGNvbW1hbmQgc3RpbGwgcnVubmluZyBhZnRlciBmaXJzdCBkYXRhIHRpbWVvdXQnKTtcblxuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2xvbmctcnVubmluZyBjb21tYW5kIHdpdGggZGF0YSBidXQgbm8gcmVhbCBvdXRwdXQgc2hvdWxkIE5PVCBhdXRvLWV4cGFuZCAobGlrZSBzbGVlcCB3aXRoIHNoZWxsIHNlcXVlbmNlcyknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRoYXNSZWFsT3V0cHV0VmFsdWUgPSBmYWxzZTsgLy8gU2hlbGwgaW50ZWdyYXRpb24gc2VxdWVuY2VzLCBub3QgcmVhbCBvdXRwdXRcblx0XHRzZXR1cEF1dG9FeHBhbmRMb2dpYygpO1xuXG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlc1xuXHRcdG9uQ29tbWFuZEV4ZWN1dGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIFNoZWxsIGludGVncmF0aW9uIGRhdGEgYXJyaXZlcyAobm90IHJlYWwgb3V0cHV0KVxuXHRcdG9uV2lsbERhdGEuZmlyZSgnc2hlbGwtc2VxdWVuY2UnKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRpbWVvdXQgdG8gZmlyZSAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuRGF0YUV2ZW50ICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZXhwYW5kIHdoZW4gZGF0YSBpcyBzaGVsbCBzZXF1ZW5jZXMsIG5vdCByZWFsIG91dHB1dCcpO1xuXG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbG9uZy1ydW5uaW5nIGNvbW1hbmQgd2l0aG91dCBkYXRhIHNob3VsZCBOT1QgYXV0by1leHBhbmQgaWYgbm8gcmVhbCBvdXRwdXQgKGxpa2Ugc2xlZXApJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aGFzUmVhbE91dHB1dFZhbHVlID0gZmFsc2U7IC8vIE5vIHJlYWwgb3V0cHV0IGxpa2UgYHNsZWVwIDFgXG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXYWl0IGZvciB0aW1lb3V0IHRvIGZpcmUgKGZha2VkIHRpbWVycyBhZHZhbmNlIGluc3RhbnRseSlcblx0XHRhd2FpdCB0aW1lb3V0KFRlcm1pbmFsVG9vbEF1dG9FeHBhbmRUaW1lb3V0Lk5vRGF0YSArIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFeHBhbmRlZCwgZmFsc2UsICdTaG91bGQgTk9UIGV4cGFuZCB3aGVuIG5vIHJlYWwgb3V0cHV0IGV2ZW4gYWZ0ZXIgdGltZW91dCcpO1xuXG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnbG9uZy1ydW5uaW5nIGNvbW1hbmQgd2l0aG91dCBkYXRhIFNIT1VMRCBhdXRvLWV4cGFuZCBpZiByZWFsIG91dHB1dCBleGlzdHMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRoYXNSZWFsT3V0cHV0VmFsdWUgPSB0cnVlOyAvLyBIYXMgcmVhbCBvdXRwdXQgaW4gYnVmZmVyXG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXYWl0IGZvciB0aW1lb3V0IHRvIGZpcmUgKGZha2VkIHRpbWVycyBhZHZhbmNlIGluc3RhbnRseSlcblx0XHRhd2FpdCB0aW1lb3V0KFRlcm1pbmFsVG9vbEF1dG9FeHBhbmRUaW1lb3V0Lk5vRGF0YSArIDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFeHBhbmRlZCwgdHJ1ZSwgJ1Nob3VsZCBleHBhbmQgd2hlbiByZWFsIG91dHB1dCBleGlzdHMgYWZ0ZXIgdGltZW91dCcpO1xuXG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGF0YSBhcnJpdmluZyBhZnRlciBjb21tYW5kIGZpbmlzaCBzaG91bGQgbm90IHRyaWdnZXIgZXhwYW5kJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXMgYW5kIGZpbmlzaGVzIGltbWVkaWF0ZWx5XG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSh1bmRlZmluZWQpO1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdC8vIERhdGEgYXJyaXZlcyBhZnRlciBjb21tYW5kIGZpbmlzaGVkXG5cdFx0b25XaWxsRGF0YS5maXJlKCdsYXRlIG91dHB1dCcpO1xuXG5cdFx0Ly8gV2FpdCBwYXN0IGFsbCB0aW1lb3V0cyAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZXhwYW5kIHdoZW4gZGF0YSBhcnJpdmVzIGFmdGVyIGNvbW1hbmQgZmluaXNoZWQnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3VzZXIgdG9nZ2xlZCBvdXRwdXQgcHJldmVudHMgYXV0by1leHBhbmQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHR1c2VyVG9nZ2xlZE91dHB1dCA9IHRydWU7XG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEYXRhIGFycml2ZXNcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCcpO1xuXG5cdFx0Ly8gV2FpdCBwYXN0IGFsbCB0aW1lb3V0cyAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZXhwYW5kIHdoZW4gdXNlciBoYXMgbWFudWFsbHkgdG9nZ2xlZCBvdXRwdXQnKTtcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhbHJlYWR5IGV4cGFuZGVkIG91dHB1dCBwcmV2ZW50cyBhZGRpdGlvbmFsIGF1dG8tZXhwYW5kJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0aXNFeHBhbmRlZCA9IHRydWU7XG5cblx0XHQvLyBUcmFjayBpZiBldmVudCB3YXMgZmlyZWRcblx0XHRsZXQgZXZlbnRGaXJlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGF1dG9FeHBhbmQgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsVG9vbEF1dG9FeHBhbmQoe1xuXHRcdFx0b25Db21tYW5kRXhlY3V0ZWQ6IG9uQ29tbWFuZEV4ZWN1dGVkLmV2ZW50LFxuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkLmV2ZW50LFxuXHRcdFx0b25XaWxsRGF0YTogb25XaWxsRGF0YS5ldmVudCxcblx0XHRcdHNob3VsZEF1dG9FeHBhbmQ6ICgpID0+ICFpc0V4cGFuZGVkICYmICF1c2VyVG9nZ2xlZE91dHB1dCxcblx0XHRcdGhhc1JlYWxPdXRwdXQ6ICgpID0+IGhhc1JlYWxPdXRwdXRWYWx1ZSxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9FeHBhbmQub25EaWRSZXF1ZXN0RXhwYW5kKCgpID0+IHtcblx0XHRcdGV2ZW50RmlyZWQgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEYXRhIGFycml2ZXNcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCcpO1xuXG5cdFx0Ly8gV2FpdCBwYXN0IGFsbCB0aW1lb3V0cyAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuTm9EYXRhICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEZpcmVkLCBmYWxzZSwgJ1Nob3VsZCBOT1QgZmlyZSBleHBhbmQgZXZlbnQgd2hlbiBhbHJlYWR5IGV4cGFuZGVkJyk7XG5cdFx0b25Db21tYW5kRmluaXNoZWQuZmlyZSh1bmRlZmluZWQpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGF0YSBhcnJpdmluZyBjYW5jZWxzIG5vLWRhdGEgdGltZW91dCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IHRydWU7IC8vIFdvdWxkIGhhdmUgZXhwYW5kZWQgaWYgbm8tZGF0YSB0aW1lb3V0IGZpcmVkXG5cdFx0c2V0dXBBdXRvRXhwYW5kTG9naWMoKTtcblxuXHRcdC8vIENvbW1hbmQgZXhlY3V0ZXNcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBEYXRhIGFycml2ZXMgKGNhbmNlbHMgbm8tZGF0YSB0aW1lb3V0KVxuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0Jyk7XG5cblx0XHQvLyBDb21tYW5kIGZpbmlzaGVzIGltbWVkaWF0ZWx5IGFmdGVyIGRhdGEgKGJlZm9yZSBkYXRhIHRpbWVvdXQgd291bGQgZmlyZSlcblx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXYWl0IHBhc3QgYWxsIHRpbWVvdXRzIChmYWtlZCB0aW1lcnMgYWR2YW5jZSBpbnN0YW50bHkpXG5cdFx0YXdhaXQgdGltZW91dChUZXJtaW5hbFRvb2xBdXRvRXhwYW5kVGltZW91dC5Ob0RhdGEgKyAxMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhwYW5kZWQsIGZhbHNlLCAnTm8tZGF0YSB0aW1lb3V0IHNob3VsZCBiZSBjYW5jZWxsZWQgd2hlbiBkYXRhIGFycml2ZXMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ211bHRpcGxlIGRhdGEgZXZlbnRzIG9ubHkgdHJpZ2dlciBvbmUgdGltZW91dCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGhhc1JlYWxPdXRwdXRWYWx1ZSA9IHRydWU7IC8vIEhhcyByZWFsIG91dHB1dFxuXHRcdHNldHVwQXV0b0V4cGFuZExvZ2ljKCk7XG5cblx0XHQvLyBDb21tYW5kIGV4ZWN1dGVzXG5cdFx0b25Db21tYW5kRXhlY3V0ZWQuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gTXVsdGlwbGUgZGF0YSBldmVudHNcblx0XHRvbldpbGxEYXRhLmZpcmUoJ291dHB1dCAxJyk7XG5cdFx0b25XaWxsRGF0YS5maXJlKCdvdXRwdXQgMicpO1xuXHRcdG9uV2lsbERhdGEuZmlyZSgnb3V0cHV0IDMnKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRpbWVvdXQgdG8gZmlyZSAoZmFrZWQgdGltZXJzIGFkdmFuY2UgaW5zdGFudGx5KVxuXHRcdGF3YWl0IHRpbWVvdXQoVGVybWluYWxUb29sQXV0b0V4cGFuZFRpbWVvdXQuRGF0YUV2ZW50ICsgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0V4cGFuZGVkLCB0cnVlLCAnU2hvdWxkIGV4cGFuZCBleGFjdGx5IG9uY2UgYWZ0ZXIgZmlyc3QgZGF0YScpO1xuXHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUodW5kZWZpbmVkKTtcblx0fSkpO1xufSk7XG5cbnN1aXRlKCdDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbiBsYXlvdXQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gTW91bnRzIHRoZSByZWFsIHNlY3Rpb24gd2l0aCB0aGUgcmVhbCBzbmFwc2hvdCBtaXJyb3Igb3ZlciBhIGZha2VkIGRldGFjaGVkIHRlcm1pbmFsLFxuXHQvLyBzbyB0aGUgYXNzZXJ0ZWQgaGVpZ2h0cyBhcmUgd2hhdCBhY3R1YWxseSByZWFjaGVzIHRoZSBET00uIFJlZ3Jlc3Npb24gY292ZXJhZ2UgZm9yIHRoZVxuXHQvLyBzbGljZWQtbGFzdC1yb3cgc3ltcHRvbSBvZiAjMzI4Mjk5OiB0aGUgYm94IGhlaWdodCBtdXN0IGRlcml2ZSBmcm9tIHRoZSBtaXJyb3Inc1xuXHQvLyBwYWludGVkIGNlbGwgaGVpZ2h0LCBub3QgdGhlIGNvbmZpZ3VyYXRpb24tZm9udCBlc3RpbWF0ZS5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBYVGVybUJhc2VDdG9yOiB0eXBlb2YgVGVybWluYWw7XG5cdGxldCBmYWtlczogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlRmFrZURldGFjaGVkVGVybWluYWw+W107XG5cdGxldCBtaXJyb3JGb250OiBJVGVybWluYWxGb250O1xuXHRsZXQgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRYVGVybUJhc2VDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdGZha2VzID0gW107XG5cdFx0Ly8gTWlycm9yIG1ldHJpY3MgZGVsaWJlcmF0ZWx5IGRpZmZlciBmcm9tIHRoZSBjb25maWcgZXN0aW1hdGUgYmVsb3cgc28gdGhlIHRlc3RzIGNhblxuXHRcdC8vIHRlbGwgd2hpY2ggc291cmNlIHRoZSBsYXlvdXQgdXNlZFxuXHRcdG1pcnJvckZvbnQgPSB7IGZvbnRGYW1pbHk6ICdtb25vc3BhY2UnLCBmb250U2l6ZTogMTIsIGxldHRlclNwYWNpbmc6IDAsIGxpbmVIZWlnaHQ6IDEsIGNoYXJXaWR0aDogMTAsIGNoYXJIZWlnaHQ6IDIwIH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxTZXJ2aWNlLCB7XG5cdFx0XHRjcmVhdGVEZXRhY2hlZFRlcm1pbmFsOiBhc3luYyAob3B0aW9uczogSURldGFjaGVkWFRlcm1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZha2UgPSBjcmVhdGVGYWtlRGV0YWNoZWRUZXJtaW5hbChYVGVybUJhc2VDdG9yLCBvcHRpb25zLCBtaXJyb3JGb250KTtcblx0XHRcdFx0ZmFrZXMucHVzaChmYWtlKTtcblx0XHRcdFx0cmV0dXJuIGZha2UuaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0fSBhcyBQYXJ0aWFsPElUZXJtaW5hbFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRnZXRGb250OiAoKSA9PiAoeyBmb250RmFtaWx5OiAnbW9ub3NwYWNlJywgZm9udFNpemU6IDEwLCBsZXR0ZXJTcGFjaW5nOiAwLCBsaW5lSGVpZ2h0OiAxLCBjaGFyV2lkdGg6IDYsIGNoYXJIZWlnaHQ6IDEwIH0pXG5cdFx0fSBhcyBQYXJ0aWFsPElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlPik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRnZXRPcGVuQXJpYUhpbnQ6ICgpID0+IG51bGxcblx0XHR9IGFzIFBhcnRpYWw8SUFjY2Vzc2libGVWaWV3U2VydmljZT4pO1xuXHRcdGNvbnRhaW5lciA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzgwMHB4Jztcblx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSkpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZWN0aW9uKG91dHB1dDogeyB0ZXh0OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk6IENoYXRUZXJtaW5hbFRvb2xPdXRwdXRTZWN0aW9uIHtcblx0XHRjb25zdCBzZWN0aW9uID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRlcm1pbmFsVG9vbE91dHB1dFNlY3Rpb24sXG5cdFx0XHRhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHQoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHQoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHQoKSA9PiBvdXRwdXQsXG5cdFx0XHQoKSA9PiAnZWNobyB0ZXN0Jyxcblx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNlY3Rpb24uZG9tTm9kZSk7XG5cdFx0cmV0dXJuIHNlY3Rpb247XG5cdH1cblxuXHRmdW5jdGlvbiBib3hIZWlnaHQoc2VjdGlvbjogQ2hhdFRlcm1pbmFsVG9vbE91dHB1dFNlY3Rpb24pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNjcm9sbGFibGUgPSBzZWN0aW9uLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0cmV0dXJuIHNjcm9sbGFibGU/LnN0eWxlLmhlaWdodCA/PyAnJztcblx0fVxuXG5cdC8qKiBUaGUgZXhwZWN0ZWQgYm94IGhlaWdodCBmb3IgYHJvd3NgIHJvd3M6IHJvd3MgXHUwMEQ3IHJvd0hlaWdodCBwbHVzIHRoZSBib2R5J3MgcmVhbCBwYWRkaW5nLiAqL1xuXHRmdW5jdGlvbiBleHBlY3RlZEhlaWdodChzZWN0aW9uOiBDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbiwgcm93czogbnVtYmVyLCByb3dIZWlnaHQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgYm9keSA9IHNlY3Rpb24uZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC10ZXJtaW5hbC1vdXRwdXQtYm9keScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnN0IHN0eWxlID0gbWFpbldpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGJvZHkpO1xuXHRcdGNvbnN0IHBhZGRpbmcgPSAoTnVtYmVyLnBhcnNlRmxvYXQoc3R5bGUucGFkZGluZ1RvcCkgfHwgMCkgKyAoTnVtYmVyLnBhcnNlRmxvYXQoc3R5bGUucGFkZGluZ0JvdHRvbSkgfHwgMCk7XG5cdFx0cmV0dXJuIGAke3Jvd3MgKiByb3dIZWlnaHQgKyBwYWRkaW5nfXB4YDtcblx0fVxuXG5cdHRlc3QoJ2JveCBoZWlnaHQgdXNlcyB0aGUgbWlycm9yIHJvdyBoZWlnaHQsIG5vdCB0aGUgY29uZmlnIGVzdGltYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKHsgdGV4dDogJ2wxXFxyXFxubDJcXHJcXG5sMycgfSk7XG5cdFx0YXdhaXQgc2VjdGlvbi50b2dnbGUodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJveEhlaWdodChzZWN0aW9uKSwgZXhwZWN0ZWRIZWlnaHQoc2VjdGlvbiwgMywgMjApKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgY29uZmlnLWZvbnQgZXN0aW1hdGUgd2hpbGUgbWlycm9yIG1ldHJpY3MgYXJlIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1pcnJvckZvbnQgPSB7IC4uLm1pcnJvckZvbnQsIGNoYXJIZWlnaHQ6IDAgfTtcblx0XHRjb25zdCBzZWN0aW9uID0gY3JlYXRlU2VjdGlvbih7IHRleHQ6ICdsMVxcclxcbmwyXFxyXFxubDMnIH0pO1xuXHRcdGF3YWl0IHNlY3Rpb24udG9nZ2xlKHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChib3hIZWlnaHQoc2VjdGlvbiksIGV4cGVjdGVkSGVpZ2h0KHNlY3Rpb24sIDMsIDEwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF5b3V0cyB3aGVuIHRoZSBtaXJyb3IgYW5ub3VuY2VzIGNoYW5nZWQgY2VsbCBtZXRyaWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSBjcmVhdGVTZWN0aW9uKHsgdGV4dDogJ2wxXFxyXFxubDJcXHJcXG5sMycgfSk7XG5cdFx0YXdhaXQgc2VjdGlvbi50b2dnbGUodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJveEhlaWdodChzZWN0aW9uKSwgZXhwZWN0ZWRIZWlnaHQoc2VjdGlvbiwgMywgMjApKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSByZW5kZXJlciByZXBvcnRpbmcgZGlmZmVyZW50IG1ldHJpY3MgKGZpcnN0IHJlbmRlciByZXBsYWNpbmcgdGhlXG5cdFx0Ly8gZXN0aW1hdGUsIG9yIGEgRFBSIGNoYW5nZSk6IG11dGF0ZSB0aGUgZm9udCB0aGUgZmFrZSByZXBvcnRzLCB0aGVuIG9wZW4gdGhlIHJhd1xuXHRcdC8vIHRlcm1pbmFsIHNvIHh0ZXJtIGZpcmVzIGEgcmVhbCByZW5kZXIgZXZlbnRcblx0XHRtaXJyb3JGb250LmNoYXJIZWlnaHQgPSAzMDtcblx0XHRjb25zdCBmYWtlID0gZmFrZXNbMF07XG5cdFx0Y29uc3QgcmVuZGVyRmlyZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZmFrZS5yYXcub25SZW5kZXIoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChob3N0KTtcblx0XHRmYWtlLnJhdy5vcGVuKGhvc3QpO1xuXHRcdGF3YWl0IHJlbmRlckZpcmVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJveEhlaWdodChzZWN0aW9uKSwgZXhwZWN0ZWRIZWlnaHQoc2VjdGlvbiwgMywgMzApKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUNBQXFDO0FBQzlDLFNBQXdDLGlDQUFpQztBQUN6RSxTQUFTLGdCQUFnQixrQkFBa0I7QUFDM0MsU0FBUyx3Q0FBd0MscUNBQXFDO0FBRXRGLFNBQVMsd0JBQXdCLHFDQUFxQztBQUN0RSxTQUFTLCtCQUErQix3QkFBb0Q7QUFFNUYsU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSxrREFBa0QsTUFBTTtBQUM3RCxRQUFNLFFBQVEsd0NBQXdDO0FBR3RELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUdKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtB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
