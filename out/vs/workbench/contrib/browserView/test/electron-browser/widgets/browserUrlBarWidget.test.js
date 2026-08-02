import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import {
  IQuickInputService,
  QuickInputHideReason
} from "../../../../../../platform/quickinput/common/quickInput.js";
import { BrowserUrlBarWidget } from "../../../electron-browser/widgets/browserUrlBarWidget.js";
class FakeQuickPick extends Disposable {
  constructor() {
    super(...arguments);
    this.ignoreFocusOut = false;
    this.sortByLabel = true;
    this.matchOnDescription = false;
    this.buttons = [];
    this._value = "";
    this._items = [];
    this._activeItems = [];
    this.itemsAssignmentCount = 0;
    this.activeItemsAssignmentCount = 0;
    this.visible = false;
    this._onWillHide = this._register(new Emitter());
    this.onWillHide = this._onWillHide.event;
    this._onDidChangeValue = this._register(new Emitter());
    this.onDidChangeValue = this._onDidChangeValue.event;
    this._onDidTriggerButton = this._register(new Emitter());
    this.onDidTriggerButton = this._onDidTriggerButton.event;
    this._onDidTriggerItemButton = this._register(new Emitter());
    this.onDidTriggerItemButton = this._onDidTriggerItemButton.event;
    this._onDidTriggerSeparatorButton = this._register(new Emitter());
    this.onDidTriggerSeparatorButton = this._onDidTriggerSeparatorButton.event;
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
  }
  get items() {
    return this._items;
  }
  set items(items) {
    this._items = items;
    this.itemsAssignmentCount++;
    if (this.visible) {
      this._activeItems = items.filter((item) => item.type !== "separator").slice(0, 1);
    }
  }
  get activeItems() {
    return this._activeItems;
  }
  set activeItems(activeItems) {
    this._activeItems = activeItems;
    this.activeItemsAssignmentCount++;
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (this._value !== value) {
      this._value = value;
      this._onDidChangeValue.fire(value);
    }
  }
  show() {
    this.visible = true;
  }
  hide(reason = QuickInputHideReason.Other) {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this._onWillHide.fire({ reason });
    this._onDidHide.fire({ reason });
  }
  type(value) {
    this.value = value;
  }
  accept() {
    this._onDidAccept.fire({ inBackground: false });
  }
  triggerButton(button) {
    this._onDidTriggerButton.fire(button);
  }
  triggerItemButton(item, button) {
    this._onDidTriggerItemButton.fire({ item, button });
  }
  triggerSeparatorButton(separator, button) {
    this._onDidTriggerSeparatorButton.fire({ separator, button });
  }
}
function asPicker(fake) {
  return fake;
}
function asInput(state) {
  return state;
}
suite("BrowserUrlBarWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function makeHarness() {
    const picker = new FakeQuickPick();
    store.add({
      dispose: () => {
        if (picker.visible) {
          picker.hide();
        }
        picker.dispose();
      }
    });
    let replacementActive = false;
    const quickInputService = {
      get currentQuickInput() {
        if (replacementActive) {
          return {};
        }
        return picker.visible ? asPicker(picker) : void 0;
      },
      createQuickPick: ((..._args) => asPicker(picker))
    };
    const navigated = [];
    const inputState = {
      url: "https://example.com/",
      navigate(url) {
        navigated.push(url);
      }
    };
    let ensureBrowserFocusCalls = 0;
    const host = {
      get input() {
        return asInput(inputState);
      },
      ensureBrowserFocus() {
        ensureBrowserFocusCalls++;
      }
    };
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IQuickInputService, quickInputService);
    const widget = store.add(instantiationService.createInstance(BrowserUrlBarWidget, host));
    widget.mountContributions([]);
    mainWindow.document.body.appendChild(widget.element);
    store.add({ dispose: () => widget.element.remove() });
    const display = widget.element.querySelector(".browser-url-display");
    return {
      widget,
      picker,
      display,
      inputState,
      navigated,
      ensureBrowserFocusCalls: () => ensureBrowserFocusCalls,
      setReplaced: (active) => {
        replacementActive = active;
      }
    };
  }
  function mountSuggestionProvider(widget, provider) {
    const contribution = {
      widgets: [],
      urlRenderers: [],
      urlSuggestionProviders: [provider],
      urlPickerActionProviders: []
    };
    widget.mountContributions([contribution]);
  }
  function mountPickerActionProvider(widget, provider) {
    const contribution = {
      widgets: [],
      urlRenderers: [],
      urlSuggestionProviders: [],
      urlPickerActionProviders: [provider]
    };
    widget.mountContributions([contribution]);
  }
  async function waitForProviderRender(delay = 0) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await Promise.resolve();
    await new Promise((resolve) => mainWindow.requestAnimationFrame(() => resolve()));
  }
  test("initial render shows the canonical URL", () => {
    const { display } = makeHarness();
    assert.strictEqual(display.textContent, "https://example.com/");
  });
  test("refreshUrl updates the display when the input URL changes", () => {
    const { widget, display, inputState } = makeHarness();
    inputState.url = "https://newsite.test/path";
    widget.refreshUrl();
    assert.strictEqual(display.textContent, "https://newsite.test/path");
  });
  test("previewUrl renders an override URL while not editing", () => {
    const { widget, display } = makeHarness();
    widget.previewUrl("https://preview.test/");
    assert.strictEqual(display.textContent, "https://preview.test/");
  });
  test("previewUrl is a no-op while the picker is open", () => {
    const { widget, display } = makeHarness();
    widget.openUrlPicker();
    widget.previewUrl("https://should-not-show.test/");
    assert.strictEqual(display.textContent, "https://example.com/");
  });
  test("openUrlPicker shows a picker pre-filled with the canonical URL", () => {
    const { widget, picker } = makeHarness();
    widget.openUrlPicker();
    assert.deepStrictEqual(
      {
        visible: picker.visible,
        value: picker.value,
        valueSelection: picker.valueSelection,
        anchorPosition: picker.anchorPosition
      },
      {
        visible: true,
        value: "https://example.com/",
        valueSelection: [0, "https://example.com/".length],
        anchorPosition: "overlay"
      }
    );
  });
  test("clicking the already-focused display does not auto-open the picker", () => {
    const { widget, picker, display } = makeHarness();
    widget.focusUrlInput();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.strictEqual(picker.visible, false);
  });
  test("first click after mouse focus opens the picker", () => {
    const { picker, display } = makeHarness();
    display.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    display.focus();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.strictEqual(picker.visible, true);
  });
  test('accepting the "Go to" item navigates to the typed value', () => {
    const { widget, picker, navigated } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://target.test/page");
    picker.activeItems = [picker.items.find((i) => i.type !== "separator")];
    picker.accept();
    assert.deepStrictEqual(navigated, ["https://target.test/page"]);
  });
  test("accepting a contributed suggestion calls its apply with the input", async () => {
    const harness = makeHarness();
    const { widget, picker, inputState } = harness;
    const applyCalls = [];
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{
          id: "sugg-1",
          label: "Suggestion",
          apply(input) {
            applyCalls.push(input);
          }
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "sugg-1");
    assert.ok(suggestion, "suggestion item should be present");
    picker.activeItems = [suggestion];
    picker.accept();
    assert.strictEqual(applyCalls.length, 1);
    assert.strictEqual(applyCalls[0], asInput(inputState));
  });
  test("hiding after an accept reverts to canonical and releases focus to the page", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    picker.accept();
    assert.deepStrictEqual(
      {
        display: display.textContent,
        visible: picker.visible,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://example.com/",
        visible: false,
        ensureBrowserFocusCalls: 1
      }
    );
  });
  test("hiding on Blur reverts to canonical without releasing focus to the page", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://abandoned.test/");
    picker.hide(QuickInputHideReason.Blur);
    assert.deepStrictEqual(
      {
        display: display.textContent,
        visible: picker.visible,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://example.com/",
        visible: false,
        ensureBrowserFocusCalls: 0
      }
    );
  });
  test("clear hides the picker and reverts the display", () => {
    const { widget, picker, display } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://wip.test/");
    widget.clear();
    assert.deepStrictEqual(
      { display: display.textContent, visible: picker.visible },
      { display: "https://example.com/", visible: false }
    );
  });
  test("typing in the picker mirrors into the display", () => {
    const { widget, picker, display } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typing.test/");
    assert.strictEqual(display.textContent, "https://typing.test/");
  });
  test("dismissal without action refocuses the display and preserves the typed text", () => {
    const harness = makeHarness();
    const { widget, picker, display } = harness;
    widget.openUrlPicker();
    picker.type("https://in-progress.test/");
    picker.hide(QuickInputHideReason.Other);
    assert.deepStrictEqual(
      {
        display: display.textContent,
        active: display.ownerDocument.activeElement === display,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        display: "https://in-progress.test/",
        active: true,
        ensureBrowserFocusCalls: 0
      }
    );
  });
  test("a replaced picker reverts the display and suppresses the next focus-open", () => {
    const { widget, picker, display, setReplaced } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://abandoned.test/");
    setReplaced(true);
    picker.hide(QuickInputHideReason.Other);
    display.focus();
    assert.deepStrictEqual(
      { display: display.textContent, pickerVisible: picker.visible },
      { display: "https://example.com/", pickerVisible: false }
    );
  });
  test("accept with no active item navigates to the picker value", () => {
    const { widget, picker, navigated } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://fallback.test/");
    picker.activeItems = [];
    picker.accept();
    assert.deepStrictEqual(navigated, ["https://fallback.test/"]);
  });
  test("refreshUrl keeps an unedited picker synchronized with the canonical URL", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    inputState.url = "https://changed-again.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://changed-again.test/");
  });
  test("refreshUrl does not overwrite picker input after the user types", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://typed.test/");
  });
  test("refreshUrl does not overwrite picker input after the user returns to the canonical URL", () => {
    const { widget, picker, inputState } = makeHarness();
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    picker.type("https://example.com/");
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://example.com/");
  });
  test("refreshUrl synchronizes a picker opened by clicking without editing", () => {
    const { picker, display, inputState, widget } = makeHarness();
    display.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    display.focus();
    display.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://changed.test/");
  });
  test("refreshUrl preserves an edit promoted from the URL display", () => {
    const { picker, display, inputState, widget } = makeHarness();
    display.focus();
    display.textContent = "https://typed.test/";
    display.dispatchEvent(new Event("input", { bubbles: true }));
    inputState.url = "https://changed.test/";
    widget.refreshUrl();
    assert.strictEqual(picker.value, "https://typed.test/");
  });
  test("triggering a picker chrome button runs the action and releases focus on hide", () => {
    const harness = makeHarness();
    const { widget, picker } = harness;
    const runCalls = [];
    const action = {
      id: "bookmark-toggle",
      tooltip: "Toggle bookmark",
      iconClass: "icon",
      run(input) {
        runCalls.push(input);
      }
    };
    mountPickerActionProvider(widget, { getActions: () => [action] });
    widget.openUrlPicker();
    picker.triggerButton(action);
    picker.hide(QuickInputHideReason.Other);
    assert.deepStrictEqual(
      {
        runCount: runCalls.length,
        calledWithInput: runCalls[0] === asInput(harness.inputState),
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      { runCount: 1, calledWithInput: true, ensureBrowserFocusCalls: 1 }
    );
  });
  test("triggering a per-item button runs the action without dismissing the picker", async () => {
    const harness = makeHarness();
    const { widget, picker, inputState } = harness;
    const runCalls = [];
    const itemAction = {
      id: "delete-bookmark",
      tooltip: "Delete bookmark",
      iconClass: "icon",
      run(input) {
        runCalls.push(input);
      }
    };
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{
          id: "sugg-2",
          label: "Bookmark",
          apply() {
          },
          actions: [itemAction]
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "sugg-2");
    picker.triggerItemButton(suggestion, itemAction);
    assert.deepStrictEqual(
      {
        runCount: runCalls.length,
        calledWithInput: runCalls[0] === asInput(inputState),
        pickerVisible: picker.visible
      },
      { runCount: 1, calledWithInput: true, pickerVisible: true }
    );
  });
  test("pressing Enter on the display navigates and preserves the typed text through the subsequent blur", () => {
    const harness = makeHarness();
    const { widget, display, navigated } = harness;
    widget.focusUrlInput();
    display.textContent = "https://typed-into-display.test/";
    display.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 13, key: "Enter", bubbles: true, cancelable: true }));
    display.blur();
    assert.deepStrictEqual(
      {
        navigated: [...navigated],
        display: display.textContent,
        ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls()
      },
      {
        navigated: ["https://typed-into-display.test/"],
        display: "https://typed-into-display.test/",
        ensureBrowserFocusCalls: 1
      }
    );
  });
  test("suggestion provider onDidChange reruns the load", async () => {
    const { widget, picker } = makeHarness();
    const refresh = new Emitter();
    store.add(refresh);
    let counter = 0;
    mountSuggestionProvider(widget, {
      onDidChange: refresh.event,
      async getSuggestions() {
        counter++;
        return [{
          id: `sugg-${counter}`,
          label: `Suggestion ${counter}`,
          apply() {
          }
        }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "sugg-1"), "initial suggestion present");
    refresh.fire();
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "sugg-2"), "refreshed suggestion present");
  });
  test("coalesces provider results into one picker render", async () => {
    const { widget, picker } = makeHarness();
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "sugg-1", label: "Suggestion 1", apply() {
        } }];
      }
    });
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "sugg-2", label: "Suggestion 2", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    await waitForProviderRender();
    assert.deepStrictEqual(
      {
        itemsAssignmentCount: picker.itemsAssignmentCount,
        activeItemsAssignmentCount: picker.activeItemsAssignmentCount,
        itemIds: picker.items.filter((item) => item.type !== "separator").map((item) => item.id)
      },
      {
        itemsAssignmentCount: 2,
        activeItemsAssignmentCount: 1,
        itemIds: ["https://example.com/", "sugg-1", "sugg-2"]
      }
    );
  });
  test("typing immediately refreshes providers and cancels stale work", () => {
    const { widget, picker } = makeHarness();
    const calls = [];
    const complete = [];
    mountSuggestionProvider(widget, {
      getSuggestions({ text }, token) {
        calls.push({ text, cancelled: () => token.isCancellationRequested });
        return new Promise((resolve) => complete.push(() => resolve([])));
      }
    });
    widget.openUrlPicker();
    picker.type("https://example.test/");
    assert.deepStrictEqual(
      calls.map((call) => ({ text: call.text, cancelled: call.cancelled() })),
      [
        { text: "https://example.com/", cancelled: true },
        { text: "https://example.test/", cancelled: false }
      ]
    );
    complete.forEach((resolve) => resolve());
  });
  test("refreshes providers for each typed value", () => {
    const { widget, picker } = makeHarness();
    const values = [];
    mountSuggestionProvider(widget, {
      async getSuggestions({ text }) {
        values.push(text);
        return [];
      }
    });
    widget.openUrlPicker();
    picker.type("h");
    picker.type("ht");
    picker.type("https://example.test/");
    assert.deepStrictEqual(values, ["https://example.com/", "h", "ht", "https://example.test/"]);
  });
  test("streamed-in suggestions are never auto-focused; the default item stays active", async () => {
    const { widget, picker } = makeHarness();
    mountSuggestionProvider(widget, {
      async getSuggestions() {
        return [{ id: "tab-1", label: "A tab", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/");
    await waitForProviderRender();
    assert.ok(picker.items.some((i) => i.type !== "separator" && i.id === "tab-1"), "suggestion streamed in");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/");
  });
  test("background refresh preserves the user selection but typing resets to the default", async () => {
    const { widget, picker } = makeHarness();
    const refresh = new Emitter();
    store.add(refresh);
    mountSuggestionProvider(widget, {
      onDidChange: refresh.event,
      async getSuggestions() {
        return [{ id: "tab-1", label: "A tab", apply() {
        } }];
      }
    });
    widget.openUrlPicker();
    picker.type("https://typed.test/");
    await waitForProviderRender();
    const suggestion = picker.items.find((i) => i.type !== "separator" && i.id === "tab-1");
    picker.activeItems = [suggestion];
    refresh.fire();
    await waitForProviderRender();
    assert.strictEqual(picker.activeItems[0]?.id, "tab-1", "background refresh preserves selection");
    picker.type("https://typed.test/x");
    assert.strictEqual(picker.activeItems[0]?.id, "https://typed.test/x", "typing resets to the default item");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L3Rlc3QvZWxlY3Ryb24tYnJvd3Nlci93aWRnZXRzL2Jyb3dzZXJVcmxCYXJXaWRnZXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHtcblx0SVF1aWNrSW5wdXQsXG5cdElRdWlja0lucHV0QnV0dG9uLFxuXHRJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdElRdWlja1BpY2ssXG5cdElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCxcblx0SVF1aWNrUGlja0l0ZW0sXG5cdElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQsXG5cdElRdWlja1BpY2tTZXBhcmF0b3IsXG5cdElRdWlja1BpY2tTZXBhcmF0b3JCdXR0b25FdmVudCxcblx0UXVpY2tJbnB1dEhpZGVSZWFzb24sXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiwgSUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlciwgSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9lbGVjdHJvbi1icm93c2VyL2Jyb3dzZXJFZGl0b3IuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVXJsQmFyV2lkZ2V0LCBJQnJvd3NlclVybEJhckhvc3QgfSBmcm9tICcuLi8uLi8uLi9lbGVjdHJvbi1icm93c2VyL3dpZGdldHMvYnJvd3NlclVybEJhcldpZGdldC5qcyc7XG5cbmNsYXNzIEZha2VRdWlja1BpY2s8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwbGFjZWhvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpZ25vcmVGb2N1c091dCA9IGZhbHNlO1xuXHRzb3J0QnlMYWJlbCA9IHRydWU7XG5cdG1hdGNoT25EZXNjcmlwdGlvbiA9IGZhbHNlO1xuXHRhbmNob3I6IEhUTUxFbGVtZW50IHwgeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRhbmNob3JQb3NpdGlvbjogJ2Fib3ZlJyB8ICdiZWxvdycgfCAnb3ZlcmxheScgfCB1bmRlZmluZWQ7XG5cdHZhbHVlU2VsZWN0aW9uOiBSZWFkb25seTxbbnVtYmVyLCBudW1iZXJdPiB8IHVuZGVmaW5lZDtcblx0YnV0dG9uczogUmVhZG9ubHlBcnJheTxJUXVpY2tJbnB1dEJ1dHRvbj4gPSBbXTtcblxuXHRwcml2YXRlIF92YWx1ZSA9ICcnO1xuXHRwcml2YXRlIF9pdGVtczogUmVhZG9ubHlBcnJheTxUIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblx0cHJpdmF0ZSBfYWN0aXZlSXRlbXM6IFJlYWRvbmx5QXJyYXk8VD4gPSBbXTtcblx0aXRlbXNBc3NpZ25tZW50Q291bnQgPSAwO1xuXHRhY3RpdmVJdGVtc0Fzc2lnbm1lbnRDb3VudCA9IDA7XG5cblx0Z2V0IGl0ZW1zKCk6IFJlYWRvbmx5QXJyYXk8VCB8IElRdWlja1BpY2tTZXBhcmF0b3I+IHtcblx0XHRyZXR1cm4gdGhpcy5faXRlbXM7XG5cdH1cblxuXHRzZXQgaXRlbXMoaXRlbXM6IFJlYWRvbmx5QXJyYXk8VCB8IElRdWlja1BpY2tTZXBhcmF0b3I+KSB7XG5cdFx0dGhpcy5faXRlbXMgPSBpdGVtcztcblx0XHR0aGlzLml0ZW1zQXNzaWdubWVudENvdW50Kys7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlSXRlbXMgPSBpdGVtcy5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIFQgPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJykuc2xpY2UoMCwgMSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGl2ZUl0ZW1zKCk6IFJlYWRvbmx5QXJyYXk8VD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVJdGVtcztcblx0fVxuXG5cdHNldCBhY3RpdmVJdGVtcyhhY3RpdmVJdGVtczogUmVhZG9ubHlBcnJheTxUPikge1xuXHRcdHRoaXMuX2FjdGl2ZUl0ZW1zID0gYWN0aXZlSXRlbXM7XG5cdFx0dGhpcy5hY3RpdmVJdGVtc0Fzc2lnbm1lbnRDb3VudCsrO1xuXHR9XG5cblx0dmlzaWJsZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYXNvbjogUXVpY2tJbnB1dEhpZGVSZWFzb24gfT4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbEhpZGUgPSB0aGlzLl9vbldpbGxIaWRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWYWx1ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJpZ2dlckJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElRdWlja0lucHV0QnV0dG9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyQnV0dG9uID0gdGhpcy5fb25EaWRUcmlnZ2VyQnV0dG9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJJdGVtQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrUGlja0l0ZW1CdXR0b25FdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlckl0ZW1CdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJJdGVtQnV0dG9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrU2VwYXJhdG9yQnV0dG9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJTZXBhcmF0b3JCdXR0b24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrUGlja0RpZEFjY2VwdEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRBY2NlcHQgPSB0aGlzLl9vbkRpZEFjY2VwdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFzb246IFF1aWNrSW5wdXRIaWRlUmVhc29uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0c2V0IHZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fdmFsdWUgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRzaG93KCk6IHZvaWQgeyB0aGlzLnZpc2libGUgPSB0cnVlOyB9XG5cdGhpZGUocmVhc29uOiBRdWlja0lucHV0SGlkZVJlYXNvbiA9IFF1aWNrSW5wdXRIaWRlUmVhc29uLk90aGVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52aXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5fb25XaWxsSGlkZS5maXJlKHsgcmVhc29uIH0pO1xuXHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKHsgcmVhc29uIH0pO1xuXHR9XG5cblx0dHlwZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0YWNjZXB0KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQWNjZXB0LmZpcmUoeyBpbkJhY2tncm91bmQ6IGZhbHNlIH0pO1xuXHR9XG5cblx0dHJpZ2dlckJ1dHRvbihidXR0b246IElRdWlja0lucHV0QnV0dG9uKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRUcmlnZ2VyQnV0dG9uLmZpcmUoYnV0dG9uKTtcblx0fVxuXG5cdHRyaWdnZXJJdGVtQnV0dG9uKGl0ZW06IFQsIGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFRyaWdnZXJJdGVtQnV0dG9uLmZpcmUoeyBpdGVtLCBidXR0b24gfSk7XG5cdH1cblxuXHR0cmlnZ2VyU2VwYXJhdG9yQnV0dG9uKHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciwgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkVHJpZ2dlclNlcGFyYXRvckJ1dHRvbi5maXJlKHsgc2VwYXJhdG9yLCBidXR0b24gfSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNQaWNrZXI8VCBleHRlbmRzIElRdWlja1BpY2tJdGVtPihmYWtlOiBGYWtlUXVpY2tQaWNrPFQ+KTogSVF1aWNrUGljazxULCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4ge1xuXHRyZXR1cm4gZmFrZSBhcyB1bmtub3duIGFzIElRdWlja1BpY2s8VCwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+O1xufVxuXG5mdW5jdGlvbiBhc0lucHV0KHN0YXRlOiB7IHVybDogc3RyaW5nOyBuYXZpZ2F0ZSh1cmw6IHN0cmluZyk6IHZvaWQgfSk6IEJyb3dzZXJFZGl0b3JJbnB1dCB7XG5cdHJldHVybiBzdGF0ZSBhcyB1bmtub3duIGFzIEJyb3dzZXJFZGl0b3JJbnB1dDtcbn1cblxuc3VpdGUoJ0Jyb3dzZXJVcmxCYXJXaWRnZXQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElUZXN0SGFybmVzcyB7XG5cdFx0cmVhZG9ubHkgd2lkZ2V0OiBCcm93c2VyVXJsQmFyV2lkZ2V0O1xuXHRcdHJlYWRvbmx5IHBpY2tlcjogRmFrZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT47XG5cdFx0cmVhZG9ubHkgZGlzcGxheTogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgaW5wdXRTdGF0ZTogeyB1cmw6IHN0cmluZzsgbmF2aWdhdGUodXJsOiBzdHJpbmcpOiB2b2lkIH07XG5cdFx0cmVhZG9ubHkgbmF2aWdhdGVkOiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogKCkgPT4gbnVtYmVyO1xuXHRcdC8qKiBTaW11bGF0ZSBhbm90aGVyIHBpY2tlciAoZS5nLiBjb21tYW5kIHBhbGV0dGUpIHRha2luZyBvdmVyLiAqL1xuXHRcdHNldFJlcGxhY2VkKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlSGFybmVzcygpOiBJVGVzdEhhcm5lc3Mge1xuXHRcdGNvbnN0IHBpY2tlciA9IG5ldyBGYWtlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpO1xuXHRcdC8vIEVuc3VyZSB0aGUgcGlja2VyIGhpZGVzIGJlZm9yZSB0aGUgd2lkZ2V0IGlzIGRpc3Bvc2VkIHNvIHRoZSB3aWRnZXQnc1xuXHRcdC8vIHBlci1waWNrZXIgRGlzcG9zYWJsZVN0b3JlIChyZWxlYXNlZCBpbiBvbkRpZEhpZGUpIGRvZXNuJ3QgbGVhay5cblx0XHRzdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAocGlja2VyLnZpc2libGUpIHtcblx0XHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0bGV0IHJlcGxhY2VtZW50QWN0aXZlID0gZmFsc2U7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2U6IFBhcnRpYWw8SVF1aWNrSW5wdXRTZXJ2aWNlPiA9IHtcblx0XHRcdGdldCBjdXJyZW50UXVpY2tJbnB1dCgpOiBJUXVpY2tJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChyZXBsYWNlbWVudEFjdGl2ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7fSBhcyB1bmtub3duIGFzIElRdWlja0lucHV0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwaWNrZXIudmlzaWJsZSA/IGFzUGlja2VyKHBpY2tlcikgYXMgdW5rbm93biBhcyBJUXVpY2tJbnB1dCA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVRdWlja1BpY2s6ICgoLi4uX2FyZ3M6IHVua25vd25bXSkgPT4gYXNQaWNrZXIocGlja2VyKSkgYXMgSVF1aWNrSW5wdXRTZXJ2aWNlWydjcmVhdGVRdWlja1BpY2snXSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbmF2aWdhdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGlucHV0U3RhdGUgPSB7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRuYXZpZ2F0ZSh1cmw6IHN0cmluZykgeyBuYXZpZ2F0ZWQucHVzaCh1cmwpOyB9LFxuXHRcdH07XG5cblx0XHRsZXQgZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGhvc3Q6IElCcm93c2VyVXJsQmFySG9zdCA9IHtcblx0XHRcdGdldCBpbnB1dCgpIHsgcmV0dXJuIGFzSW5wdXQoaW5wdXRTdGF0ZSk7IH0sXG5cdFx0XHRlbnN1cmVCcm93c2VyRm9jdXMoKSB7IGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzKys7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyVXJsQmFyV2lkZ2V0LCBob3N0KSk7XG5cdFx0d2lkZ2V0Lm1vdW50Q29udHJpYnV0aW9ucyhbXSk7XG5cdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB3aWRnZXQuZWxlbWVudC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IGRpc3BsYXkgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYnJvd3Nlci11cmwtZGlzcGxheScpIGFzIEhUTUxFbGVtZW50O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZGdldCxcblx0XHRcdHBpY2tlcixcblx0XHRcdGRpc3BsYXksXG5cdFx0XHRpbnB1dFN0YXRlLFxuXHRcdFx0bmF2aWdhdGVkLFxuXHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6ICgpID0+IGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzLFxuXHRcdFx0c2V0UmVwbGFjZWQ6IChhY3RpdmU6IGJvb2xlYW4pID0+IHsgcmVwbGFjZW1lbnRBY3RpdmUgPSBhY3RpdmU7IH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1vdW50U3VnZ2VzdGlvblByb3ZpZGVyKHdpZGdldDogQnJvd3NlclVybEJhcldpZGdldCwgcHJvdmlkZXI6IElCcm93c2VyVXJsU3VnZ2VzdGlvblByb3ZpZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0ge1xuXHRcdFx0d2lkZ2V0czogW10sXG5cdFx0XHR1cmxSZW5kZXJlcnM6IFtdLFxuXHRcdFx0dXJsU3VnZ2VzdGlvblByb3ZpZGVyczogW3Byb3ZpZGVyXSxcblx0XHRcdHVybFBpY2tlckFjdGlvblByb3ZpZGVyczogW10sXG5cdFx0fSBhcyB1bmtub3duIGFzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb247XG5cdFx0d2lkZ2V0Lm1vdW50Q29udHJpYnV0aW9ucyhbY29udHJpYnV0aW9uXSk7XG5cdH1cblxuXHRmdW5jdGlvbiBtb3VudFBpY2tlckFjdGlvblByb3ZpZGVyKHdpZGdldDogQnJvd3NlclVybEJhcldpZGdldCwgcHJvdmlkZXI6IElCcm93c2VyVXJsUGlja2VyQWN0aW9uUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB7XG5cdFx0XHR3aWRnZXRzOiBbXSxcblx0XHRcdHVybFJlbmRlcmVyczogW10sXG5cdFx0XHR1cmxTdWdnZXN0aW9uUHJvdmlkZXJzOiBbXSxcblx0XHRcdHVybFBpY2tlckFjdGlvblByb3ZpZGVyczogW3Byb3ZpZGVyXSxcblx0XHR9IGFzIHVua25vd24gYXMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbjtcblx0XHR3aWRnZXQubW91bnRDb250cmlidXRpb25zKFtjb250cmlidXRpb25dKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JQcm92aWRlclJlbmRlcihkZWxheSA9IDApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZGVsYXkgPiAwKSB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBtYWluV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiByZXNvbHZlKCkpKTtcblx0fVxuXG5cdHRlc3QoJ2luaXRpYWwgcmVuZGVyIHNob3dzIHRoZSBjYW5vbmljYWwgVVJMJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZGlzcGxheSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgdXBkYXRlcyB0aGUgZGlzcGxheSB3aGVuIHRoZSBpbnB1dCBVUkwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgZGlzcGxheSwgaW5wdXRTdGF0ZSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL25ld3NpdGUudGVzdC9wYXRoJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwbGF5LnRleHRDb250ZW50LCAnaHR0cHM6Ly9uZXdzaXRlLnRlc3QvcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3VXJsIHJlbmRlcnMgYW4gb3ZlcnJpZGUgVVJMIHdoaWxlIG5vdCBlZGl0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5wcmV2aWV3VXJsKCdodHRwczovL3ByZXZpZXcudGVzdC8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vcHJldmlldy50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aWV3VXJsIGlzIGEgbm8tb3Agd2hpbGUgdGhlIHBpY2tlciBpcyBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0d2lkZ2V0LnByZXZpZXdVcmwoJ2h0dHBzOi8vc2hvdWxkLW5vdC1zaG93LnRlc3QvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BsYXkudGV4dENvbnRlbnQsICdodHRwczovL2V4YW1wbGUuY29tLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuVXJsUGlja2VyIHNob3dzIGEgcGlja2VyIHByZS1maWxsZWQgd2l0aCB0aGUgY2Fub25pY2FsIFVSTCcsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHRcdHZhbHVlOiBwaWNrZXIudmFsdWUsXG5cdFx0XHRcdHZhbHVlU2VsZWN0aW9uOiBwaWNrZXIudmFsdWVTZWxlY3Rpb24sXG5cdFx0XHRcdGFuY2hvclBvc2l0aW9uOiBwaWNrZXIuYW5jaG9yUG9zaXRpb24sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0XHR2YWx1ZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0dmFsdWVTZWxlY3Rpb246IFswLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLmxlbmd0aF0sXG5cdFx0XHRcdGFuY2hvclBvc2l0aW9uOiAnb3ZlcmxheScsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWNraW5nIHRoZSBhbHJlYWR5LWZvY3VzZWQgZGlzcGxheSBkb2VzIG5vdCBhdXRvLW9wZW4gdGhlIHBpY2tlcicsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5mb2N1c1VybElucHV0KCk7XG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci52aXNpYmxlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IGNsaWNrIGFmdGVyIG1vdXNlIGZvY3VzIG9wZW5zIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXkgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgncG9pbnRlcmRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGRpc3BsYXkuZm9jdXMoKTtcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZpc2libGUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRpbmcgdGhlIFwiR28gdG9cIiBpdGVtIG5hdmlnYXRlcyB0byB0aGUgdHlwZWQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgbmF2aWdhdGVkIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdGFyZ2V0LnRlc3QvcGFnZScpO1xuXHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IFtwaWNrZXIuaXRlbXMuZmluZCgoaSk6IGkgaXMgSVF1aWNrUGlja0l0ZW0gPT4gaS50eXBlICE9PSAnc2VwYXJhdG9yJykhXTtcblx0XHRwaWNrZXIuYWNjZXB0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuYXZpZ2F0ZWQsIFsnaHR0cHM6Ly90YXJnZXQudGVzdC9wYWdlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2NlcHRpbmcgYSBjb250cmlidXRlZCBzdWdnZXN0aW9uIGNhbGxzIGl0cyBhcHBseSB3aXRoIHRoZSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBoYXJuZXNzO1xuXHRcdGNvbnN0IGFwcGx5Q2FsbHM6IEJyb3dzZXJFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0aWQ6ICdzdWdnLTEnLFxuXHRcdFx0XHRcdGxhYmVsOiAnU3VnZ2VzdGlvbicsXG5cdFx0XHRcdFx0YXBwbHkoaW5wdXQpIHsgYXBwbHlDYWxscy5wdXNoKGlucHV0KTsgfSxcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uID0gcGlja2VyLml0ZW1zLmZpbmQoKGkpOiBpIGlzIElRdWlja1BpY2tJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMScpO1xuXHRcdGFzc2VydC5vayhzdWdnZXN0aW9uLCAnc3VnZ2VzdGlvbiBpdGVtIHNob3VsZCBiZSBwcmVzZW50Jyk7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW3N1Z2dlc3Rpb25dO1xuXHRcdHBpY2tlci5hY2NlcHQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBseUNhbGxzWzBdLCBhc0lucHV0KGlucHV0U3RhdGUpKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkaW5nIGFmdGVyIGFuIGFjY2VwdCByZXZlcnRzIHRvIGNhbm9uaWNhbCBhbmQgcmVsZWFzZXMgZm9jdXMgdG8gdGhlIHBhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgZGlzcGxheSB9ID0gaGFybmVzcztcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL3R5cGVkLnRlc3QvJyk7XG5cdFx0cGlja2VyLmFjY2VwdCgpOyAvLyBvbkRpZEFjY2VwdCBoYW5kbGVyIGNhbGxzIHBpY2tlci5oaWRlKCkgc3luY2hyb25vdXNseVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGRpc3BsYXk6IGRpc3BsYXkudGV4dENvbnRlbnQsXG5cdFx0XHRcdHZpc2libGU6IHBpY2tlci52aXNpYmxlLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogaGFybmVzcy5lbnN1cmVCcm93c2VyRm9jdXNDYWxscygpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0dmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiAxLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRpbmcgb24gQmx1ciByZXZlcnRzIHRvIGNhbm9uaWNhbCB3aXRob3V0IHJlbGVhc2luZyBmb2N1cyB0byB0aGUgcGFnZScsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBoYXJuZXNzO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vYWJhbmRvbmVkLnRlc3QvJyk7XG5cdFx0cGlja2VyLmhpZGUoUXVpY2tJbnB1dEhpZGVSZWFzb24uQmx1cik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0dmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzOiBoYXJuZXNzLmVuc3VyZUJyb3dzZXJGb2N1c0NhbGxzKCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRkaXNwbGF5OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHR2aXNpYmxlOiBmYWxzZSxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IDAsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyIGhpZGVzIHRoZSBwaWNrZXIgYW5kIHJldmVydHMgdGhlIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciwgZGlzcGxheSB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL3dpcC50ZXN0LycpO1xuXHRcdHdpZGdldC5jbGVhcigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGRpc3BsYXk6IGRpc3BsYXkudGV4dENvbnRlbnQsIHZpc2libGU6IHBpY2tlci52aXNpYmxlIH0sXG5cdFx0XHR7IGRpc3BsYXk6ICdodHRwczovL2V4YW1wbGUuY29tLycsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndHlwaW5nIGluIHRoZSBwaWNrZXIgbWlycm9ycyBpbnRvIHRoZSBkaXNwbGF5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGRpc3BsYXkgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly90eXBpbmcudGVzdC8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGxheS50ZXh0Q29udGVudCwgJ2h0dHBzOi8vdHlwaW5nLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc21pc3NhbCB3aXRob3V0IGFjdGlvbiByZWZvY3VzZXMgdGhlIGRpc3BsYXkgYW5kIHByZXNlcnZlcyB0aGUgdHlwZWQgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBkaXNwbGF5IH0gPSBoYXJuZXNzO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vaW4tcHJvZ3Jlc3MudGVzdC8nKTtcblx0XHRwaWNrZXIuaGlkZShRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0YWN0aXZlOiBkaXNwbGF5Lm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZGlzcGxheSxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IGhhcm5lc3MuZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGRpc3BsYXk6ICdodHRwczovL2luLXByb2dyZXNzLnRlc3QvJyxcblx0XHRcdFx0YWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogMCxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYSByZXBsYWNlZCBwaWNrZXIgcmV2ZXJ0cyB0aGUgZGlzcGxheSBhbmQgc3VwcHJlc3NlcyB0aGUgbmV4dCBmb2N1cy1vcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGRpc3BsYXksIHNldFJlcGxhY2VkIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vYWJhbmRvbmVkLnRlc3QvJyk7XG5cdFx0c2V0UmVwbGFjZWQodHJ1ZSk7XG5cdFx0cGlja2VyLmhpZGUoUXVpY2tJbnB1dEhpZGVSZWFzb24uT3RoZXIpO1xuXHRcdC8vIERpc3BsYXkgaGFzIHJldmVydGVkIHRvIGNhbm9uaWNhbDsgcmVmb2N1c2luZyB0aGUgZGlzcGxheSAod2hpY2ggaXNcblx0XHQvLyB3aGF0IHRoZSBRdWlja0lucHV0Q29udHJvbGxlciBkb2VzIG9uIHRoZSByZXBsYWNlbWVudCdzIGhpZGUpIG11c3Rcblx0XHQvLyBOT1QgcmVvcGVuIHRoZSBwaWNrZXIgdGhhbmtzIHRvIHRoZSBhcm1lZCBzdXBwcmVzcyBmbGFnLlxuXHRcdGRpc3BsYXkuZm9jdXMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBkaXNwbGF5OiBkaXNwbGF5LnRleHRDb250ZW50LCBwaWNrZXJWaXNpYmxlOiBwaWNrZXIudmlzaWJsZSB9LFxuXHRcdFx0eyBkaXNwbGF5OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLCBwaWNrZXJWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdCB3aXRoIG5vIGFjdGl2ZSBpdGVtIG5hdmlnYXRlcyB0byB0aGUgcGlja2VyIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIG5hdmlnYXRlZCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2ZhbGxiYWNrLnRlc3QvJyk7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW107XG5cdFx0cGlja2VyLmFjY2VwdCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmF2aWdhdGVkLCBbJ2h0dHBzOi8vZmFsbGJhY2sudGVzdC8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwga2VlcHMgYW4gdW5lZGl0ZWQgcGlja2VyIHN5bmNocm9uaXplZCB3aXRoIHRoZSBjYW5vbmljYWwgVVJMJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGlucHV0U3RhdGUgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL2NoYW5nZWQudGVzdC8nO1xuXHRcdHdpZGdldC5yZWZyZXNoVXJsKCk7XG5cdFx0aW5wdXRTdGF0ZS51cmwgPSAnaHR0cHM6Ly9jaGFuZ2VkLWFnYWluLnRlc3QvJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIudmFsdWUsICdodHRwczovL2NoYW5nZWQtYWdhaW4udGVzdC8nKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaFVybCBkb2VzIG5vdCBvdmVyd3JpdGUgcGlja2VyIGlucHV0IGFmdGVyIHRoZSB1c2VyIHR5cGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIsIGlucHV0U3RhdGUgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHRcdGlucHV0U3RhdGUudXJsID0gJ2h0dHBzOi8vY2hhbmdlZC50ZXN0Lyc7XG5cdFx0d2lkZ2V0LnJlZnJlc2hVcmwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZhbHVlLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoVXJsIGRvZXMgbm90IG92ZXJ3cml0ZSBwaWNrZXIgaW5wdXQgYWZ0ZXIgdGhlIHVzZXIgcmV0dXJucyB0byB0aGUgY2Fub25pY2FsIFVSTCcsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHRwaWNrZXIudHlwZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS8nKTtcblx0XHRpbnB1dFN0YXRlLnVybCA9ICdodHRwczovL2NoYW5nZWQudGVzdC8nO1xuXHRcdHdpZGdldC5yZWZyZXNoVXJsKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci52YWx1ZSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgc3luY2hyb25pemVzIGEgcGlja2VyIG9wZW5lZCBieSBjbGlja2luZyB3aXRob3V0IGVkaXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXksIGlucHV0U3RhdGUsIHdpZGdldCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0ZGlzcGxheS5mb2N1cygpO1xuXHRcdGRpc3BsYXkuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnY2xpY2snLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdGlucHV0U3RhdGUudXJsID0gJ2h0dHBzOi8vY2hhbmdlZC50ZXN0Lyc7XG5cdFx0d2lkZ2V0LnJlZnJlc2hVcmwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnZhbHVlLCAnaHR0cHM6Ly9jaGFuZ2VkLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hVcmwgcHJlc2VydmVzIGFuIGVkaXQgcHJvbW90ZWQgZnJvbSB0aGUgVVJMIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGRpc3BsYXksIGlucHV0U3RhdGUsIHdpZGdldCB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRkaXNwbGF5LmZvY3VzKCk7XG5cdFx0ZGlzcGxheS50ZXh0Q29udGVudCA9ICdodHRwczovL3R5cGVkLnRlc3QvJztcblx0XHRkaXNwbGF5LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0aW5wdXRTdGF0ZS51cmwgPSAnaHR0cHM6Ly9jaGFuZ2VkLnRlc3QvJztcblx0XHR3aWRnZXQucmVmcmVzaFVybCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIudmFsdWUsICdodHRwczovL3R5cGVkLnRlc3QvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaWdnZXJpbmcgYSBwaWNrZXIgY2hyb21lIGJ1dHRvbiBydW5zIHRoZSBhY3Rpb24gYW5kIHJlbGVhc2VzIGZvY3VzIG9uIGhpZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFybmVzcyA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciB9ID0gaGFybmVzcztcblx0XHRjb25zdCBydW5DYWxsczogQnJvd3NlckVkaXRvcklucHV0W10gPSBbXTtcblx0XHRjb25zdCBhY3Rpb246IElRdWlja0lucHV0QnV0dG9uICYgeyBpZDogc3RyaW5nOyBydW4oaW5wdXQ6IEJyb3dzZXJFZGl0b3JJbnB1dCk6IHZvaWQgfSA9IHtcblx0XHRcdGlkOiAnYm9va21hcmstdG9nZ2xlJyxcblx0XHRcdHRvb2x0aXA6ICdUb2dnbGUgYm9va21hcmsnLFxuXHRcdFx0aWNvbkNsYXNzOiAnaWNvbicsXG5cdFx0XHRydW4oaW5wdXQpIHsgcnVuQ2FsbHMucHVzaChpbnB1dCk7IH0sXG5cdFx0fTtcblx0XHRtb3VudFBpY2tlckFjdGlvblByb3ZpZGVyKHdpZGdldCwgeyBnZXRBY3Rpb25zOiAoKSA9PiBbYWN0aW9uXSB9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnRyaWdnZXJCdXR0b24oYWN0aW9uKTtcblx0XHRwaWNrZXIuaGlkZShRdWlja0lucHV0SGlkZVJlYXNvbi5PdGhlcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cnVuQ291bnQ6IHJ1bkNhbGxzLmxlbmd0aCxcblx0XHRcdFx0Y2FsbGVkV2l0aElucHV0OiBydW5DYWxsc1swXSA9PT0gYXNJbnB1dChoYXJuZXNzLmlucHV0U3RhdGUpLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogaGFybmVzcy5lbnN1cmVCcm93c2VyRm9jdXNDYWxscygpLFxuXHRcdFx0fSxcblx0XHRcdHsgcnVuQ291bnQ6IDEsIGNhbGxlZFdpdGhJbnB1dDogdHJ1ZSwgZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IDEgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmlnZ2VyaW5nIGEgcGVyLWl0ZW0gYnV0dG9uIHJ1bnMgdGhlIGFjdGlvbiB3aXRob3V0IGRpc21pc3NpbmcgdGhlIHBpY2tlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYXJuZXNzID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyLCBpbnB1dFN0YXRlIH0gPSBoYXJuZXNzO1xuXHRcdGNvbnN0IHJ1bkNhbGxzOiBCcm93c2VyRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGNvbnN0IGl0ZW1BY3Rpb24gPSB7XG5cdFx0XHRpZDogJ2RlbGV0ZS1ib29rbWFyaycsXG5cdFx0XHR0b29sdGlwOiAnRGVsZXRlIGJvb2ttYXJrJyxcblx0XHRcdGljb25DbGFzczogJ2ljb24nLFxuXHRcdFx0cnVuKGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQpIHsgcnVuQ2FsbHMucHVzaChpbnB1dCk7IH0sXG5cdFx0fTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdGFzeW5jIGdldFN1Z2dlc3Rpb25zKCkge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogJ3N1Z2ctMicsXG5cdFx0XHRcdFx0bGFiZWw6ICdCb29rbWFyaycsXG5cdFx0XHRcdFx0YXBwbHkoKSB7IH0sXG5cdFx0XHRcdFx0YWN0aW9uczogW2l0ZW1BY3Rpb25dLFxuXHRcdFx0XHR9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRjb25zdCBzdWdnZXN0aW9uID0gcGlja2VyLml0ZW1zLmZpbmQoKGkpOiBpIGlzIElRdWlja1BpY2tJdGVtID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMicpITtcblx0XHRwaWNrZXIudHJpZ2dlckl0ZW1CdXR0b24oc3VnZ2VzdGlvbiwgaXRlbUFjdGlvbik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0cnVuQ291bnQ6IHJ1bkNhbGxzLmxlbmd0aCxcblx0XHRcdFx0Y2FsbGVkV2l0aElucHV0OiBydW5DYWxsc1swXSA9PT0gYXNJbnB1dChpbnB1dFN0YXRlKSxcblx0XHRcdFx0cGlja2VyVmlzaWJsZTogcGlja2VyLnZpc2libGUsXG5cdFx0XHR9LFxuXHRcdFx0eyBydW5Db3VudDogMSwgY2FsbGVkV2l0aElucHV0OiB0cnVlLCBwaWNrZXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc3NpbmcgRW50ZXIgb24gdGhlIGRpc3BsYXkgbmF2aWdhdGVzIGFuZCBwcmVzZXJ2ZXMgdGhlIHR5cGVkIHRleHQgdGhyb3VnaCB0aGUgc3Vic2VxdWVudCBibHVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhcm5lc3MgPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBkaXNwbGF5LCBuYXZpZ2F0ZWQgfSA9IGhhcm5lc3M7XG5cdFx0d2lkZ2V0LmZvY3VzVXJsSW5wdXQoKTtcblx0XHRkaXNwbGF5LnRleHRDb250ZW50ID0gJ2h0dHBzOi8vdHlwZWQtaW50by1kaXNwbGF5LnRlc3QvJztcblx0XHQvLyBgU3RhbmRhcmRLZXlib2FyZEV2ZW50YCByZWFkcyB0aGUgKGRlcHJlY2F0ZWQpIG51bWVyaWMgYGtleUNvZGVgLFxuXHRcdC8vIHNvIHBhc3MgaXQgZXhwbGljaXRseSAoRW50ZXIgPT0gMTMpIHJhdGhlciB0aGFuIHJlbHlpbmcgb24gYGtleWAuXG5cdFx0ZGlzcGxheS5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXlDb2RlOiAxMywga2V5OiAnRW50ZXInLCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0gYXMgS2V5Ym9hcmRFdmVudEluaXQpKTtcblx0XHRkaXNwbGF5LmJsdXIoKTtcblx0XHQvLyBgbW9kZWwudXJsYCAoY2Fub25pY2FsKSBoYXNuJ3QgY2F1Z2h0IHVwIHRvIHRoZSB0eXBlZCBVUkwgeWV0LCBidXRcblx0XHQvLyB0aGUgQkxVUi1yZXZlcnQgc2hvdWxkIGJlIHN1cHByZXNzZWQgZm9yIGFuIEVudGVyLWNvbW1pdCBzbyB0aGVcblx0XHQvLyBkZXN0aW5hdGlvbiBzdGF5cyB2aXNpYmxlIHVudGlsIHRoZSBuYXZpZ2F0aW9uIGNvbW1pdHMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0bmF2aWdhdGVkOiBbLi4ubmF2aWdhdGVkXSxcblx0XHRcdFx0ZGlzcGxheTogZGlzcGxheS50ZXh0Q29udGVudCxcblx0XHRcdFx0ZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHM6IGhhcm5lc3MuZW5zdXJlQnJvd3NlckZvY3VzQ2FsbHMoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG5hdmlnYXRlZDogWydodHRwczovL3R5cGVkLWludG8tZGlzcGxheS50ZXN0LyddLFxuXHRcdFx0XHRkaXNwbGF5OiAnaHR0cHM6Ly90eXBlZC1pbnRvLWRpc3BsYXkudGVzdC8nLFxuXHRcdFx0XHRlbnN1cmVCcm93c2VyRm9jdXNDYWxsczogMSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3VnZ2VzdGlvbiBwcm92aWRlciBvbkRpZENoYW5nZSByZXJ1bnMgdGhlIGxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHBpY2tlciB9ID0gbWFrZUhhcm5lc3MoKTtcblx0XHRjb25zdCByZWZyZXNoID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRzdG9yZS5hZGQocmVmcmVzaCk7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdG1vdW50U3VnZ2VzdGlvblByb3ZpZGVyKHdpZGdldCwge1xuXHRcdFx0b25EaWRDaGFuZ2U6IHJlZnJlc2guZXZlbnQsXG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0Y291bnRlcisrO1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogYHN1Z2ctJHtjb3VudGVyfWAsXG5cdFx0XHRcdFx0bGFiZWw6IGBTdWdnZXN0aW9uICR7Y291bnRlcn1gLFxuXHRcdFx0XHRcdGFwcGx5KCkgeyB9LFxuXHRcdFx0XHR9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5vayhwaWNrZXIuaXRlbXMuc29tZShpID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMScpLCAnaW5pdGlhbCBzdWdnZXN0aW9uIHByZXNlbnQnKTtcblxuXHRcdHJlZnJlc2guZmlyZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5vayhwaWNrZXIuaXRlbXMuc29tZShpID0+IGkudHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaS5pZCA9PT0gJ3N1Z2ctMicpLCAncmVmcmVzaGVkIHN1Z2dlc3Rpb24gcHJlc2VudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2FsZXNjZXMgcHJvdmlkZXIgcmVzdWx0cyBpbnRvIG9uZSBwaWNrZXIgcmVuZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7IGlkOiAnc3VnZy0xJywgbGFiZWw6ICdTdWdnZXN0aW9uIDEnLCBhcHBseSgpIHsgfSB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRhc3luYyBnZXRTdWdnZXN0aW9ucygpIHtcblx0XHRcdFx0cmV0dXJuIFt7IGlkOiAnc3VnZy0yJywgbGFiZWw6ICdTdWdnZXN0aW9uIDInLCBhcHBseSgpIHsgfSB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0aXRlbXNBc3NpZ25tZW50Q291bnQ6IHBpY2tlci5pdGVtc0Fzc2lnbm1lbnRDb3VudCxcblx0XHRcdFx0YWN0aXZlSXRlbXNBc3NpZ25tZW50Q291bnQ6IHBpY2tlci5hY3RpdmVJdGVtc0Fzc2lnbm1lbnRDb3VudCxcblx0XHRcdFx0aXRlbUlkczogcGlja2VyLml0ZW1zLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgSVF1aWNrUGlja0l0ZW0gPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJykubWFwKGl0ZW0gPT4gaXRlbS5pZCksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpdGVtc0Fzc2lnbm1lbnRDb3VudDogMixcblx0XHRcdFx0YWN0aXZlSXRlbXNBc3NpZ25tZW50Q291bnQ6IDEsXG5cdFx0XHRcdGl0ZW1JZHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLCAnc3VnZy0xJywgJ3N1Z2ctMiddLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0eXBpbmcgaW1tZWRpYXRlbHkgcmVmcmVzaGVzIHByb3ZpZGVycyBhbmQgY2FuY2VscyBzdGFsZSB3b3JrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBwaWNrZXIgfSA9IG1ha2VIYXJuZXNzKCk7XG5cdFx0Y29uc3QgY2FsbHM6IHsgdGV4dDogc3RyaW5nOyBjYW5jZWxsZWQ6ICgpID0+IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Y29uc3QgY29tcGxldGU6IEFycmF5PCgpID0+IHZvaWQ+ID0gW107XG5cdFx0bW91bnRTdWdnZXN0aW9uUHJvdmlkZXIod2lkZ2V0LCB7XG5cdFx0XHRnZXRTdWdnZXN0aW9ucyh7IHRleHQgfSwgdG9rZW4pIHtcblx0XHRcdFx0Y2FsbHMucHVzaCh7IHRleHQsIGNhbmNlbGxlZDogKCkgPT4gdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IGNvbXBsZXRlLnB1c2goKCkgPT4gcmVzb2x2ZShbXSkpKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR3aWRnZXQub3BlblVybFBpY2tlcigpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2V4YW1wbGUudGVzdC8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjYWxscy5tYXAoY2FsbCA9PiAoeyB0ZXh0OiBjYWxsLnRleHQsIGNhbmNlbGxlZDogY2FsbC5jYW5jZWxsZWQoKSB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdGV4dDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJywgY2FuY2VsbGVkOiB0cnVlIH0sXG5cdFx0XHRcdHsgdGV4dDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0LycsIGNhbmNlbGxlZDogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0XHRjb21wbGV0ZS5mb3JFYWNoKHJlc29sdmUgPT4gcmVzb2x2ZSgpKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIHByb3ZpZGVycyBmb3IgZWFjaCB0eXBlZCB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdGFzeW5jIGdldFN1Z2dlc3Rpb25zKHsgdGV4dCB9KSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHRleHQpO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0Lm9wZW5VcmxQaWNrZXIoKTtcblx0XHRwaWNrZXIudHlwZSgnaCcpO1xuXHRcdHBpY2tlci50eXBlKCdodCcpO1xuXHRcdHBpY2tlci50eXBlKCdodHRwczovL2V4YW1wbGUudGVzdC8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vJywgJ2gnLCAnaHQnLCAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW1lZC1pbiBzdWdnZXN0aW9ucyBhcmUgbmV2ZXIgYXV0by1mb2N1c2VkOyB0aGUgZGVmYXVsdCBpdGVtIHN0YXlzIGFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdG1vdW50U3VnZ2VzdGlvblByb3ZpZGVyKHdpZGdldCwge1xuXHRcdFx0YXN5bmMgZ2V0U3VnZ2VzdGlvbnMoKSB7XG5cdFx0XHRcdHJldHVybiBbeyBpZDogJ3RhYi0xJywgbGFiZWw6ICdBIHRhYicsIGFwcGx5KCkgeyB9IH1dO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHQvLyBUaGUgc3luY2hyb25vdXMgZGVmYXVsdCBpdGVtIChcIkdvIHRvIDx2YWx1ZT5cIikgaXMgdGhlIGFjdGl2ZSBpdGVtLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXG5cdFx0Ly8gT25jZSB0aGUgYXN5bmNocm9ub3VzIHN1Z2dlc3Rpb24gc3RyZWFtcyBpbiwgZm9jdXMgbXVzdCBOT1QganVtcCB0byBpdC5cblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblx0XHRhc3NlcnQub2socGlja2VyLml0ZW1zLnNvbWUoaSA9PiBpLnR5cGUgIT09ICdzZXBhcmF0b3InICYmIGkuaWQgPT09ICd0YWItMScpLCAnc3VnZ2VzdGlvbiBzdHJlYW1lZCBpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAnaHR0cHM6Ly90eXBlZC50ZXN0LycpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZ3JvdW5kIHJlZnJlc2ggcHJlc2VydmVzIHRoZSB1c2VyIHNlbGVjdGlvbiBidXQgdHlwaW5nIHJlc2V0cyB0byB0aGUgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgcGlja2VyIH0gPSBtYWtlSGFybmVzcygpO1xuXHRcdGNvbnN0IHJlZnJlc2ggPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdHN0b3JlLmFkZChyZWZyZXNoKTtcblx0XHRtb3VudFN1Z2dlc3Rpb25Qcm92aWRlcih3aWRnZXQsIHtcblx0XHRcdG9uRGlkQ2hhbmdlOiByZWZyZXNoLmV2ZW50LFxuXHRcdFx0YXN5bmMgZ2V0U3VnZ2VzdGlvbnMoKSB7XG5cdFx0XHRcdHJldHVybiBbeyBpZDogJ3RhYi0xJywgbGFiZWw6ICdBIHRhYicsIGFwcGx5KCkgeyB9IH1dO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHdpZGdldC5vcGVuVXJsUGlja2VyKCk7XG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC8nKTtcblx0XHRhd2FpdCB3YWl0Rm9yUHJvdmlkZXJSZW5kZXIoKTtcblxuXHRcdC8vIFVzZXIgYXJyb3cta2V5cyBvbnRvIHRoZSBzdHJlYW1lZC1pbiBzdWdnZXN0aW9uLlxuXHRcdGNvbnN0IHN1Z2dlc3Rpb24gPSBwaWNrZXIuaXRlbXMuZmluZCgoaSk6IGkgaXMgSVF1aWNrUGlja0l0ZW0gPT4gaS50eXBlICE9PSAnc2VwYXJhdG9yJyAmJiBpLmlkID09PSAndGFiLTEnKSE7XG5cdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW3N1Z2dlc3Rpb25dO1xuXG5cdFx0Ly8gQSBiYWNrZ3JvdW5kIHByb3ZpZGVyIHJlZnJlc2ggbXVzdCBrZWVwIHRoZSB1c2VyJ3Mgc2VsZWN0aW9uLlxuXHRcdHJlZnJlc2guZmlyZSgpO1xuXHRcdGF3YWl0IHdhaXRGb3JQcm92aWRlclJlbmRlcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuYWN0aXZlSXRlbXNbMF0/LmlkLCAndGFiLTEnLCAnYmFja2dyb3VuZCByZWZyZXNoIHByZXNlcnZlcyBzZWxlY3Rpb24nKTtcblxuXHRcdC8vIFR5cGluZywgaG93ZXZlciwgcmVzZXRzIGZvY3VzIGJhY2sgdG8gdGhlIGRlZmF1bHQgXCJHbyB0b1wiIGl0ZW0uXG5cdFx0cGlja2VyLnR5cGUoJ2h0dHBzOi8vdHlwZWQudGVzdC94Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5hY3RpdmVJdGVtc1swXT8uaWQsICdodHRwczovL3R5cGVkLnRlc3QveCcsICd0eXBpbmcgcmVzZXRzIHRvIHRoZSBkZWZhdWx0IGl0ZW0nKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekM7QUFBQSxFQUdDO0FBQUEsRUFPQTtBQUFBLE9BQ007QUFHUCxTQUFTLDJCQUErQztBQUV4RCxNQUFNLHNCQUFnRCxXQUFXO0FBQUEsRUFBakU7QUFBQTtBQUVDLDBCQUFpQjtBQUNqQix1QkFBYztBQUNkLDhCQUFxQjtBQUlyQixtQkFBNEMsQ0FBQztBQUU3QyxTQUFRLFNBQVM7QUFDakIsU0FBUSxTQUFpRCxDQUFDO0FBQzFELFNBQVEsZUFBaUMsQ0FBQztBQUMxQyxnQ0FBdUI7QUFDdkIsc0NBQTZCO0FBdUI3QixtQkFBVTtBQUVWLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBMEMsQ0FBQztBQUM3RixTQUFTLGFBQWEsS0FBSyxZQUFZO0FBQ3ZDLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3pFLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBQ25ELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUEyQixDQUFDO0FBQ3RGLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBQ3ZELFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFzQyxDQUFDO0FBQ3JHLFNBQVMseUJBQXlCLEtBQUssd0JBQXdCO0FBQy9ELFNBQWlCLCtCQUErQixLQUFLLFVBQVUsSUFBSSxRQUF3QyxDQUFDO0FBQzVHLFNBQVMsOEJBQThCLEtBQUssNkJBQTZCO0FBQ3pFLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBa0MsQ0FBQztBQUN0RixTQUFTLGNBQWMsS0FBSyxhQUFhO0FBQ3pDLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksUUFBMEMsQ0FBQztBQUM1RixTQUFTLFlBQVksS0FBSyxXQUFXO0FBQUE7QUFBQSxFQXBDckMsSUFBSSxRQUFnRDtBQUNuRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLE1BQU0sT0FBK0M7QUFDeEQsU0FBSyxTQUFTO0FBQ2QsU0FBSztBQUNMLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssZUFBZSxNQUFNLE9BQU8sQ0FBQyxTQUFvQixLQUFLLFNBQVMsV0FBVyxFQUFFLE1BQU0sR0FBRyxDQUFDO0FBQUEsSUFDNUY7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLGNBQWdDO0FBQ25DLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksWUFBWSxhQUErQjtBQUM5QyxTQUFLLGVBQWU7QUFDcEIsU0FBSztBQUFBLEVBQ047QUFBQSxFQW1CQSxJQUFJLFFBQWdCO0FBQ25CLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFlO0FBQ3hCLFFBQUksS0FBSyxXQUFXLE9BQU87QUFDMUIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxrQkFBa0IsS0FBSyxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFhO0FBQUUsU0FBSyxVQUFVO0FBQUEsRUFBTTtBQUFBLEVBQ3BDLEtBQUssU0FBK0IscUJBQXFCLE9BQWE7QUFDckUsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFVBQVU7QUFDZixTQUFLLFlBQVksS0FBSyxFQUFFLE9BQU8sQ0FBQztBQUNoQyxTQUFLLFdBQVcsS0FBSyxFQUFFLE9BQU8sQ0FBQztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxLQUFLLE9BQXFCO0FBQ3pCLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLFNBQWU7QUFDZCxTQUFLLGFBQWEsS0FBSyxFQUFFLGNBQWMsTUFBTSxDQUFDO0FBQUEsRUFDL0M7QUFBQSxFQUVBLGNBQWMsUUFBaUM7QUFDOUMsU0FBSyxvQkFBb0IsS0FBSyxNQUFNO0FBQUEsRUFDckM7QUFBQSxFQUVBLGtCQUFrQixNQUFTLFFBQWlDO0FBQzNELFNBQUssd0JBQXdCLEtBQUssRUFBRSxNQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ25EO0FBQUEsRUFFQSx1QkFBdUIsV0FBZ0MsUUFBaUM7QUFDdkYsU0FBSyw2QkFBNkIsS0FBSyxFQUFFLFdBQVcsT0FBTyxDQUFDO0FBQUEsRUFDN0Q7QUFDRDtBQUVBLFNBQVMsU0FBbUMsTUFBZ0U7QUFDM0csU0FBTztBQUNSO0FBRUEsU0FBUyxRQUFRLE9BQXlFO0FBQ3pGLFNBQU87QUFDUjtBQUVBLE1BQU0sdUJBQXVCLE1BQU07QUFDbEMsUUFBTSxRQUFRLHdDQUF3QztBQWF0RCxXQUFTLGNBQTRCO0FBQ3BDLFVBQU0sU0FBUyxJQUFJLGNBQThCO0FBR2pELFVBQU0sSUFBSTtBQUFBLE1BQ1QsU0FBUyxNQUFNO0FBQ2QsWUFBSSxPQUFPLFNBQVM7QUFDbkIsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFDQSxlQUFPLFFBQVE7QUFBQSxNQUNoQjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0sb0JBQWlEO0FBQUEsTUFDdEQsSUFBSSxvQkFBNkM7QUFDaEQsWUFBSSxtQkFBbUI7QUFDdEIsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFDQSxlQUFPLE9BQU8sVUFBVSxTQUFTLE1BQU0sSUFBOEI7QUFBQSxNQUN0RTtBQUFBLE1BQ0Esa0JBQWtCLElBQUksVUFBcUIsU0FBUyxNQUFNO0FBQUEsSUFDM0Q7QUFFQSxVQUFNLFlBQXNCLENBQUM7QUFDN0IsVUFBTSxhQUFhO0FBQUEsTUFDbEIsS0FBSztBQUFBLE1BQ0wsU0FBUyxLQUFhO0FBQUUsa0JBQVUsS0FBSyxHQUFHO0FBQUEsTUFBRztBQUFBLElBQzlDO0FBRUEsUUFBSSwwQkFBMEI7QUFDOUIsVUFBTSxPQUEyQjtBQUFBLE1BQ2hDLElBQUksUUFBUTtBQUFFLGVBQU8sUUFBUSxVQUFVO0FBQUEsTUFBRztBQUFBLE1BQzFDLHFCQUFxQjtBQUFFO0FBQUEsTUFBMkI7QUFBQSxJQUNuRDtBQUVBLFVBQU0sdUJBQXVCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLG9CQUFvQixpQkFBaUI7QUFFL0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSxxQkFBcUIsSUFBSSxDQUFDO0FBQ3ZGLFdBQU8sbUJBQW1CLENBQUMsQ0FBQztBQUM1QixlQUFXLFNBQVMsS0FBSyxZQUFZLE9BQU8sT0FBTztBQUNuRCxVQUFNLElBQUksRUFBRSxTQUFTLE1BQU0sT0FBTyxRQUFRLE9BQU8sRUFBRSxDQUFDO0FBRXBELFVBQU0sVUFBVSxPQUFPLFFBQVEsY0FBYyxzQkFBc0I7QUFFbkUsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSx5QkFBeUIsTUFBTTtBQUFBLE1BQy9CLGFBQWEsQ0FBQyxXQUFvQjtBQUFFLDRCQUFvQjtBQUFBLE1BQVE7QUFBQSxJQUNqRTtBQUFBLEVBQ0Q7QUFFQSxXQUFTLHdCQUF3QixRQUE2QixVQUErQztBQUM1RyxVQUFNLGVBQWU7QUFBQSxNQUNwQixTQUFTLENBQUM7QUFBQSxNQUNWLGNBQWMsQ0FBQztBQUFBLE1BQ2Ysd0JBQXdCLENBQUMsUUFBUTtBQUFBLE1BQ2pDLDBCQUEwQixDQUFDO0FBQUEsSUFDNUI7QUFDQSxXQUFPLG1CQUFtQixDQUFDLFlBQVksQ0FBQztBQUFBLEVBQ3pDO0FBRUEsV0FBUywwQkFBMEIsUUFBNkIsVUFBaUQ7QUFDaEgsVUFBTSxlQUFlO0FBQUEsTUFDcEIsU0FBUyxDQUFDO0FBQUEsTUFDVixjQUFjLENBQUM7QUFBQSxNQUNmLHdCQUF3QixDQUFDO0FBQUEsTUFDekIsMEJBQTBCLENBQUMsUUFBUTtBQUFBLElBQ3BDO0FBQ0EsV0FBTyxtQkFBbUIsQ0FBQyxZQUFZLENBQUM7QUFBQSxFQUN6QztBQUVBLGlCQUFlLHNCQUFzQixRQUFRLEdBQWtCO0FBQzlELFFBQUksUUFBUSxHQUFHO0FBQ2QsWUFBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsS0FBSyxDQUFDO0FBQUEsSUFDeEQ7QUFDQSxVQUFNLFFBQVEsUUFBUTtBQUN0QixVQUFNLElBQUksUUFBYyxhQUFXLFdBQVcsc0JBQXNCLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNyRjtBQUVBLE9BQUssMENBQTBDLE1BQU07QUFDcEQsVUFBTSxFQUFFLFFBQVEsSUFBSSxZQUFZO0FBQ2hDLFdBQU8sWUFBWSxRQUFRLGFBQWEsc0JBQXNCO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsVUFBTSxFQUFFLFFBQVEsU0FBUyxXQUFXLElBQUksWUFBWTtBQUNwRCxlQUFXLE1BQU07QUFDakIsV0FBTyxXQUFXO0FBQ2xCLFdBQU8sWUFBWSxRQUFRLGFBQWEsMkJBQTJCO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsVUFBTSxFQUFFLFFBQVEsUUFBUSxJQUFJLFlBQVk7QUFDeEMsV0FBTyxXQUFXLHVCQUF1QjtBQUN6QyxXQUFPLFlBQVksUUFBUSxhQUFhLHVCQUF1QjtBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFVBQU0sRUFBRSxRQUFRLFFBQVEsSUFBSSxZQUFZO0FBQ3hDLFdBQU8sY0FBYztBQUNyQixXQUFPLFdBQVcsK0JBQStCO0FBQ2pELFdBQU8sWUFBWSxRQUFRLGFBQWEsc0JBQXNCO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsVUFBTSxFQUFFLFFBQVEsT0FBTyxJQUFJLFlBQVk7QUFDdkMsV0FBTyxjQUFjO0FBQ3JCLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxTQUFTLE9BQU87QUFBQSxRQUNoQixPQUFPLE9BQU87QUFBQSxRQUNkLGdCQUFnQixPQUFPO0FBQUEsUUFDdkIsZ0JBQWdCLE9BQU87QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxRQUNDLFNBQVM7QUFBQSxRQUNULE9BQU87QUFBQSxRQUNQLGdCQUFnQixDQUFDLEdBQUcsdUJBQXVCLE1BQU07QUFBQSxRQUNqRCxnQkFBZ0I7QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sRUFBRSxRQUFRLFFBQVEsUUFBUSxJQUFJLFlBQVk7QUFDaEQsV0FBTyxjQUFjO0FBQ3JCLFlBQVEsY0FBYyxJQUFJLFdBQVcsU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDaEUsV0FBTyxZQUFZLE9BQU8sU0FBUyxLQUFLO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxFQUFFLFFBQVEsUUFBUSxJQUFJLFlBQVk7QUFDeEMsWUFBUSxjQUFjLElBQUksTUFBTSxlQUFlLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUNqRSxZQUFRLE1BQU07QUFDZCxZQUFRLGNBQWMsSUFBSSxXQUFXLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ2hFLFdBQU8sWUFBWSxPQUFPLFNBQVMsSUFBSTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sRUFBRSxRQUFRLFFBQVEsVUFBVSxJQUFJLFlBQVk7QUFDbEQsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSywwQkFBMEI7QUFDdEMsV0FBTyxjQUFjLENBQUMsT0FBTyxNQUFNLEtBQUssQ0FBQyxNQUEyQixFQUFFLFNBQVMsV0FBVyxDQUFFO0FBQzVGLFdBQU8sT0FBTztBQUNkLFdBQU8sZ0JBQWdCLFdBQVcsQ0FBQywwQkFBMEIsQ0FBQztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFVBQU0sVUFBVSxZQUFZO0FBQzVCLFVBQU0sRUFBRSxRQUFRLFFBQVEsV0FBVyxJQUFJO0FBQ3ZDLFVBQU0sYUFBbUMsQ0FBQztBQUMxQyw0QkFBd0IsUUFBUTtBQUFBLE1BQy9CLE1BQU0saUJBQWlCO0FBQ3RCLGVBQU8sQ0FBQztBQUFBLFVBQ1AsSUFBSTtBQUFBLFVBQ0osT0FBTztBQUFBLFVBQ1AsTUFBTSxPQUFPO0FBQUUsdUJBQVcsS0FBSyxLQUFLO0FBQUEsVUFBRztBQUFBLFFBQ3hDLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxjQUFjO0FBQ3JCLFVBQU0sc0JBQXNCO0FBQzVCLFVBQU0sYUFBYSxPQUFPLE1BQU0sS0FBSyxDQUFDLE1BQTJCLEVBQUUsU0FBUyxlQUFlLEVBQUUsT0FBTyxRQUFRO0FBQzVHLFdBQU8sR0FBRyxZQUFZLG1DQUFtQztBQUN6RCxXQUFPLGNBQWMsQ0FBQyxVQUFVO0FBQ2hDLFdBQU8sT0FBTztBQUNkLFdBQU8sWUFBWSxXQUFXLFFBQVEsQ0FBQztBQUN2QyxXQUFPLFlBQVksV0FBVyxDQUFDLEdBQUcsUUFBUSxVQUFVLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyw4RUFBOEUsTUFBTTtBQUN4RixVQUFNLFVBQVUsWUFBWTtBQUM1QixVQUFNLEVBQUUsUUFBUSxRQUFRLFFBQVEsSUFBSTtBQUNwQyxXQUFPLGNBQWM7QUFDckIsV0FBTyxLQUFLLHFCQUFxQjtBQUNqQyxXQUFPLE9BQU87QUFDZCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxRQUFRO0FBQUEsUUFDakIsU0FBUyxPQUFPO0FBQUEsUUFDaEIseUJBQXlCLFFBQVEsd0JBQXdCO0FBQUEsTUFDMUQ7QUFBQSxNQUNBO0FBQUEsUUFDQyxTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFDVCx5QkFBeUI7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFVBQU0sVUFBVSxZQUFZO0FBQzVCLFVBQU0sRUFBRSxRQUFRLFFBQVEsUUFBUSxJQUFJO0FBQ3BDLFdBQU8sY0FBYztBQUNyQixXQUFPLEtBQUsseUJBQXlCO0FBQ3JDLFdBQU8sS0FBSyxxQkFBcUIsSUFBSTtBQUNyQyxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsU0FBUyxRQUFRO0FBQUEsUUFDakIsU0FBUyxPQUFPO0FBQUEsUUFDaEIseUJBQXlCLFFBQVEsd0JBQXdCO0FBQUEsTUFDMUQ7QUFBQSxNQUNBO0FBQUEsUUFDQyxTQUFTO0FBQUEsUUFDVCxTQUFTO0FBQUEsUUFDVCx5QkFBeUI7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFVBQU0sRUFBRSxRQUFRLFFBQVEsUUFBUSxJQUFJLFlBQVk7QUFDaEQsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSyxtQkFBbUI7QUFDL0IsV0FBTyxNQUFNO0FBQ2IsV0FBTztBQUFBLE1BQ04sRUFBRSxTQUFTLFFBQVEsYUFBYSxTQUFTLE9BQU8sUUFBUTtBQUFBLE1BQ3hELEVBQUUsU0FBUyx3QkFBd0IsU0FBUyxNQUFNO0FBQUEsSUFDbkQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELFVBQU0sRUFBRSxRQUFRLFFBQVEsUUFBUSxJQUFJLFlBQVk7QUFDaEQsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSyxzQkFBc0I7QUFDbEMsV0FBTyxZQUFZLFFBQVEsYUFBYSxzQkFBc0I7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsTUFBTTtBQUN6RixVQUFNLFVBQVUsWUFBWTtBQUM1QixVQUFNLEVBQUUsUUFBUSxRQUFRLFFBQVEsSUFBSTtBQUNwQyxXQUFPLGNBQWM7QUFDckIsV0FBTyxLQUFLLDJCQUEyQjtBQUN2QyxXQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFDdEMsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFFBQVEsUUFBUSxjQUFjLGtCQUFrQjtBQUFBLFFBQ2hELHlCQUF5QixRQUFRLHdCQUF3QjtBQUFBLE1BQzFEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IseUJBQXlCO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixVQUFNLEVBQUUsUUFBUSxRQUFRLFNBQVMsWUFBWSxJQUFJLFlBQVk7QUFDN0QsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSyx5QkFBeUI7QUFDckMsZ0JBQVksSUFBSTtBQUNoQixXQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFJdEMsWUFBUSxNQUFNO0FBQ2QsV0FBTztBQUFBLE1BQ04sRUFBRSxTQUFTLFFBQVEsYUFBYSxlQUFlLE9BQU8sUUFBUTtBQUFBLE1BQzlELEVBQUUsU0FBUyx3QkFBd0IsZUFBZSxNQUFNO0FBQUEsSUFDekQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sRUFBRSxRQUFRLFFBQVEsVUFBVSxJQUFJLFlBQVk7QUFDbEQsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSyx3QkFBd0I7QUFDcEMsV0FBTyxjQUFjLENBQUM7QUFDdEIsV0FBTyxPQUFPO0FBQ2QsV0FBTyxnQkFBZ0IsV0FBVyxDQUFDLHdCQUF3QixDQUFDO0FBQUEsRUFDN0QsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxFQUFFLFFBQVEsUUFBUSxXQUFXLElBQUksWUFBWTtBQUNuRCxXQUFPLGNBQWM7QUFDckIsZUFBVyxNQUFNO0FBQ2pCLFdBQU8sV0FBVztBQUNsQixlQUFXLE1BQU07QUFDakIsV0FBTyxXQUFXO0FBQ2xCLFdBQU8sWUFBWSxPQUFPLE9BQU8sNkJBQTZCO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssbUVBQW1FLE1BQU07QUFDN0UsVUFBTSxFQUFFLFFBQVEsUUFBUSxXQUFXLElBQUksWUFBWTtBQUNuRCxXQUFPLGNBQWM7QUFDckIsV0FBTyxLQUFLLHFCQUFxQjtBQUNqQyxlQUFXLE1BQU07QUFDakIsV0FBTyxXQUFXO0FBQ2xCLFdBQU8sWUFBWSxPQUFPLE9BQU8scUJBQXFCO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssMEZBQTBGLE1BQU07QUFDcEcsVUFBTSxFQUFFLFFBQVEsUUFBUSxXQUFXLElBQUksWUFBWTtBQUNuRCxXQUFPLGNBQWM7QUFDckIsV0FBTyxLQUFLLHFCQUFxQjtBQUNqQyxXQUFPLEtBQUssc0JBQXNCO0FBQ2xDLGVBQVcsTUFBTTtBQUNqQixXQUFPLFdBQVc7QUFDbEIsV0FBTyxZQUFZLE9BQU8sT0FBTyxzQkFBc0I7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLEVBQUUsUUFBUSxTQUFTLFlBQVksT0FBTyxJQUFJLFlBQVk7QUFDNUQsWUFBUSxjQUFjLElBQUksTUFBTSxlQUFlLEVBQUUsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUNqRSxZQUFRLE1BQU07QUFDZCxZQUFRLGNBQWMsSUFBSSxXQUFXLFNBQVMsRUFBRSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQ2hFLGVBQVcsTUFBTTtBQUNqQixXQUFPLFdBQVc7QUFDbEIsV0FBTyxZQUFZLE9BQU8sT0FBTyx1QkFBdUI7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLEVBQUUsUUFBUSxTQUFTLFlBQVksT0FBTyxJQUFJLFlBQVk7QUFDNUQsWUFBUSxNQUFNO0FBQ2QsWUFBUSxjQUFjO0FBQ3RCLFlBQVEsY0FBYyxJQUFJLE1BQU0sU0FBUyxFQUFFLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDM0QsZUFBVyxNQUFNO0FBQ2pCLFdBQU8sV0FBVztBQUNsQixXQUFPLFlBQVksT0FBTyxPQUFPLHFCQUFxQjtBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLGdGQUFnRixNQUFNO0FBQzFGLFVBQU0sVUFBVSxZQUFZO0FBQzVCLFVBQU0sRUFBRSxRQUFRLE9BQU8sSUFBSTtBQUMzQixVQUFNLFdBQWlDLENBQUM7QUFDeEMsVUFBTSxTQUFtRjtBQUFBLE1BQ3hGLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxNQUNULFdBQVc7QUFBQSxNQUNYLElBQUksT0FBTztBQUFFLGlCQUFTLEtBQUssS0FBSztBQUFBLE1BQUc7QUFBQSxJQUNwQztBQUNBLDhCQUEwQixRQUFRLEVBQUUsWUFBWSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7QUFFaEUsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sY0FBYyxNQUFNO0FBQzNCLFdBQU8sS0FBSyxxQkFBcUIsS0FBSztBQUN0QyxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsVUFBVSxTQUFTO0FBQUEsUUFDbkIsaUJBQWlCLFNBQVMsQ0FBQyxNQUFNLFFBQVEsUUFBUSxVQUFVO0FBQUEsUUFDM0QseUJBQXlCLFFBQVEsd0JBQXdCO0FBQUEsTUFDMUQ7QUFBQSxNQUNBLEVBQUUsVUFBVSxHQUFHLGlCQUFpQixNQUFNLHlCQUF5QixFQUFFO0FBQUEsSUFDbEU7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU0sVUFBVSxZQUFZO0FBQzVCLFVBQU0sRUFBRSxRQUFRLFFBQVEsV0FBVyxJQUFJO0FBQ3ZDLFVBQU0sV0FBaUMsQ0FBQztBQUN4QyxVQUFNLGFBQWE7QUFBQSxNQUNsQixJQUFJO0FBQUEsTUFDSixTQUFTO0FBQUEsTUFDVCxXQUFXO0FBQUEsTUFDWCxJQUFJLE9BQTJCO0FBQUUsaUJBQVMsS0FBSyxLQUFLO0FBQUEsTUFBRztBQUFBLElBQ3hEO0FBQ0EsNEJBQXdCLFFBQVE7QUFBQSxNQUMvQixNQUFNLGlCQUFpQjtBQUN0QixlQUFPLENBQUM7QUFBQSxVQUNQLElBQUk7QUFBQSxVQUNKLE9BQU87QUFBQSxVQUNQLFFBQVE7QUFBQSxVQUFFO0FBQUEsVUFDVixTQUFTLENBQUMsVUFBVTtBQUFBLFFBQ3JCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxjQUFjO0FBQ3JCLFVBQU0sc0JBQXNCO0FBQzVCLFVBQU0sYUFBYSxPQUFPLE1BQU0sS0FBSyxDQUFDLE1BQTJCLEVBQUUsU0FBUyxlQUFlLEVBQUUsT0FBTyxRQUFRO0FBQzVHLFdBQU8sa0JBQWtCLFlBQVksVUFBVTtBQUMvQyxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsVUFBVSxTQUFTO0FBQUEsUUFDbkIsaUJBQWlCLFNBQVMsQ0FBQyxNQUFNLFFBQVEsVUFBVTtBQUFBLFFBQ25ELGVBQWUsT0FBTztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxFQUFFLFVBQVUsR0FBRyxpQkFBaUIsTUFBTSxlQUFlLEtBQUs7QUFBQSxJQUMzRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0dBQW9HLE1BQU07QUFDOUcsVUFBTSxVQUFVLFlBQVk7QUFDNUIsVUFBTSxFQUFFLFFBQVEsU0FBUyxVQUFVLElBQUk7QUFDdkMsV0FBTyxjQUFjO0FBQ3JCLFlBQVEsY0FBYztBQUd0QixZQUFRLGNBQWMsSUFBSSxjQUFjLFdBQVcsRUFBRSxTQUFTLElBQUksS0FBSyxTQUFTLFNBQVMsTUFBTSxZQUFZLEtBQUssQ0FBc0IsQ0FBQztBQUN2SSxZQUFRLEtBQUs7QUFJYixXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsV0FBVyxDQUFDLEdBQUcsU0FBUztBQUFBLFFBQ3hCLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLHlCQUF5QixRQUFRLHdCQUF3QjtBQUFBLE1BQzFEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsV0FBVyxDQUFDLGtDQUFrQztBQUFBLFFBQzlDLFNBQVM7QUFBQSxRQUNULHlCQUF5QjtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbURBQW1ELFlBQVk7QUFDbkUsVUFBTSxFQUFFLFFBQVEsT0FBTyxJQUFJLFlBQVk7QUFDdkMsVUFBTSxVQUFVLElBQUksUUFBYztBQUNsQyxVQUFNLElBQUksT0FBTztBQUNqQixRQUFJLFVBQVU7QUFDZCw0QkFBd0IsUUFBUTtBQUFBLE1BQy9CLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLE1BQU0saUJBQWlCO0FBQ3RCO0FBQ0EsZUFBTyxDQUFDO0FBQUEsVUFDUCxJQUFJLFFBQVEsT0FBTztBQUFBLFVBQ25CLE9BQU8sY0FBYyxPQUFPO0FBQUEsVUFDNUIsUUFBUTtBQUFBLFVBQUU7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxjQUFjO0FBQ3JCLFVBQU0sc0JBQXNCO0FBQzVCLFdBQU8sR0FBRyxPQUFPLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxlQUFlLEVBQUUsT0FBTyxRQUFRLEdBQUcsNEJBQTRCO0FBRTNHLFlBQVEsS0FBSztBQUNiLFVBQU0sc0JBQXNCO0FBQzVCLFdBQU8sR0FBRyxPQUFPLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxlQUFlLEVBQUUsT0FBTyxRQUFRLEdBQUcsOEJBQThCO0FBQUEsRUFDOUcsQ0FBQztBQUVELE9BQUsscURBQXFELFlBQVk7QUFDckUsVUFBTSxFQUFFLFFBQVEsT0FBTyxJQUFJLFlBQVk7QUFDdkMsNEJBQXdCLFFBQVE7QUFBQSxNQUMvQixNQUFNLGlCQUFpQjtBQUN0QixlQUFPLENBQUMsRUFBRSxJQUFJLFVBQVUsT0FBTyxnQkFBZ0IsUUFBUTtBQUFBLFFBQUUsRUFBRSxDQUFDO0FBQUEsTUFDN0Q7QUFBQSxJQUNELENBQUM7QUFDRCw0QkFBd0IsUUFBUTtBQUFBLE1BQy9CLE1BQU0saUJBQWlCO0FBQ3RCLGVBQU8sQ0FBQyxFQUFFLElBQUksVUFBVSxPQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFBRSxFQUFFLENBQUM7QUFBQSxNQUM3RDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sY0FBYztBQUNyQixVQUFNLHNCQUFzQjtBQUU1QixXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0Msc0JBQXNCLE9BQU87QUFBQSxRQUM3Qiw0QkFBNEIsT0FBTztBQUFBLFFBQ25DLFNBQVMsT0FBTyxNQUFNLE9BQU8sQ0FBQyxTQUFpQyxLQUFLLFNBQVMsV0FBVyxFQUFFLElBQUksVUFBUSxLQUFLLEVBQUU7QUFBQSxNQUM5RztBQUFBLE1BQ0E7QUFBQSxRQUNDLHNCQUFzQjtBQUFBLFFBQ3RCLDRCQUE0QjtBQUFBLFFBQzVCLFNBQVMsQ0FBQyx3QkFBd0IsVUFBVSxRQUFRO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLEVBQUUsUUFBUSxPQUFPLElBQUksWUFBWTtBQUN2QyxVQUFNLFFBQXNELENBQUM7QUFDN0QsVUFBTSxXQUE4QixDQUFDO0FBQ3JDLDRCQUF3QixRQUFRO0FBQUEsTUFDL0IsZUFBZSxFQUFFLEtBQUssR0FBRyxPQUFPO0FBQy9CLGNBQU0sS0FBSyxFQUFFLE1BQU0sV0FBVyxNQUFNLE1BQU0sd0JBQXdCLENBQUM7QUFDbkUsZUFBTyxJQUFJLFFBQVEsYUFBVyxTQUFTLEtBQUssTUFBTSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUMvRDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sY0FBYztBQUNyQixXQUFPLEtBQUssdUJBQXVCO0FBRW5DLFdBQU87QUFBQSxNQUNOLE1BQU0sSUFBSSxXQUFTLEVBQUUsTUFBTSxLQUFLLE1BQU0sV0FBVyxLQUFLLFVBQVUsRUFBRSxFQUFFO0FBQUEsTUFDcEU7QUFBQSxRQUNDLEVBQUUsTUFBTSx3QkFBd0IsV0FBVyxLQUFLO0FBQUEsUUFDaEQsRUFBRSxNQUFNLHlCQUF5QixXQUFXLE1BQU07QUFBQSxNQUNuRDtBQUFBLElBQ0Q7QUFDQSxhQUFTLFFBQVEsYUFBVyxRQUFRLENBQUM7QUFBQSxFQUN0QyxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxVQUFNLEVBQUUsUUFBUSxPQUFPLElBQUksWUFBWTtBQUN2QyxVQUFNLFNBQW1CLENBQUM7QUFDMUIsNEJBQXdCLFFBQVE7QUFBQSxNQUMvQixNQUFNLGVBQWUsRUFBRSxLQUFLLEdBQUc7QUFDOUIsZUFBTyxLQUFLLElBQUk7QUFDaEIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sY0FBYztBQUNyQixXQUFPLEtBQUssR0FBRztBQUNmLFdBQU8sS0FBSyxJQUFJO0FBQ2hCLFdBQU8sS0FBSyx1QkFBdUI7QUFFbkMsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLHdCQUF3QixLQUFLLE1BQU0sdUJBQXVCLENBQUM7QUFBQSxFQUM1RixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLEVBQUUsUUFBUSxPQUFPLElBQUksWUFBWTtBQUN2Qyw0QkFBd0IsUUFBUTtBQUFBLE1BQy9CLE1BQU0saUJBQWlCO0FBQ3RCLGVBQU8sQ0FBQyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsUUFBUTtBQUFBLFFBQUUsRUFBRSxDQUFDO0FBQUEsTUFDckQ7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGNBQWM7QUFDckIsV0FBTyxLQUFLLHFCQUFxQjtBQUVqQyxXQUFPLFlBQVksT0FBTyxZQUFZLENBQUMsR0FBRyxJQUFJLHFCQUFxQjtBQUduRSxVQUFNLHNCQUFzQjtBQUM1QixXQUFPLEdBQUcsT0FBTyxNQUFNLEtBQUssT0FBSyxFQUFFLFNBQVMsZUFBZSxFQUFFLE9BQU8sT0FBTyxHQUFHLHdCQUF3QjtBQUN0RyxXQUFPLFlBQVksT0FBTyxZQUFZLENBQUMsR0FBRyxJQUFJLHFCQUFxQjtBQUFBLEVBQ3BFLENBQUM7QUFFRCxPQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFVBQU0sRUFBRSxRQUFRLE9BQU8sSUFBSSxZQUFZO0FBQ3ZDLFVBQU0sVUFBVSxJQUFJLFFBQWM7QUFDbEMsVUFBTSxJQUFJLE9BQU87QUFDakIsNEJBQXdCLFFBQVE7QUFBQSxNQUMvQixhQUFhLFFBQVE7QUFBQSxNQUNyQixNQUFNLGlCQUFpQjtBQUN0QixlQUFPLENBQUMsRUFBRSxJQUFJLFNBQVMsT0FBTyxTQUFTLFFBQVE7QUFBQSxRQUFFLEVBQUUsQ0FBQztBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxjQUFjO0FBQ3JCLFdBQU8sS0FBSyxxQkFBcUI7QUFDakMsVUFBTSxzQkFBc0I7QUFHNUIsVUFBTSxhQUFhLE9BQU8sTUFBTSxLQUFLLENBQUMsTUFBMkIsRUFBRSxTQUFTLGVBQWUsRUFBRSxPQUFPLE9BQU87QUFDM0csV0FBTyxjQUFjLENBQUMsVUFBVTtBQUdoQyxZQUFRLEtBQUs7QUFDYixVQUFNLHNCQUFzQjtBQUM1QixXQUFPLFlBQVksT0FBTyxZQUFZLENBQUMsR0FBRyxJQUFJLFNBQVMsd0NBQXdDO0FBRy9GLFdBQU8sS0FBSyxzQkFBc0I7QUFDbEMsV0FBTyxZQUFZLE9BQU8sWUFBWSxDQUFDLEdBQUcsSUFBSSx3QkFBd0IsbUNBQW1DO0FBQUEsRUFDMUcsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
