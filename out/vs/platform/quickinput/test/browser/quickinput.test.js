import assert from "assert";
import sinon from "sinon";
import { unthemedInboxStyles } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { unthemedListStyles } from "../../../../base/browser/ui/list/listWidget.js";
import { unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { Event } from "../../../../base/common/event.js";
import { raceTimeout } from "../../../../base/common/async.js";
import { unthemedCountStyles } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { unthemedKeybindingLabelOptions } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { unthemedProgressBarOptions } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { QuickInputController } from "../../browser/quickInputController.js";
import { TestThemeService } from "../../../theme/test/common/testThemeService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ItemActivation, isKeyModified, NO_KEY_MODS } from "../../common/quickInput.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IThemeService } from "../../../theme/common/themeService.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IContextViewService } from "../../../contextview/browser/contextView.js";
import { IListService, ListService } from "../../../list/browser/listService.js";
import { IContextKeyService } from "../../../contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../contextkey/browser/contextKeyService.js";
import { NoMatchingKb } from "../../../keybinding/common/keybindingResolver.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ContextViewService } from "../../../contextview/browser/contextViewService.js";
import { IAccessibilityService } from "../../../accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../accessibility/test/common/testAccessibilityService.js";
async function setupWaitTilShownListener(controller) {
  const result = await raceTimeout(new Promise((resolve) => {
    const event = controller.onShow((_) => {
      event.dispose();
      resolve(true);
    });
  }), 2e3);
  if (!result) {
    throw new Error("Cancelled");
  }
}
suite("QuickInput", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let controller;
  let fixture;
  setup(() => {
    fixture = document.createElement("div");
    mainWindow.document.body.appendChild(fixture);
    store.add(toDisposable(() => fixture.remove()));
    const instantiationService = new TestInstantiationService();
    instantiationService.stub(IThemeService, new TestThemeService());
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
    instantiationService.stub(IListService, store.add(new ListService()));
    instantiationService.stub(ILayoutService, {
      _serviceBrand: void 0,
      activeContainer: fixture,
      onDidLayoutContainer: Event.None,
      getContainer: () => fixture
    });
    instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
    instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
    instantiationService.stub(IKeybindingService, {
      mightProducePrintableCharacter() {
        return false;
      },
      softDispatch() {
        return NoMatchingKb;
      }
    });
    controller = store.add(instantiationService.createInstance(
      QuickInputController,
      {
        container: fixture,
        idPrefix: "testQuickInput",
        ignoreFocusOut() {
          return true;
        },
        returnFocus() {
        },
        backKeybindingLabel() {
          return void 0;
        },
        setContextKey() {
          return void 0;
        },
        linkOpenerDelegate(content) {
        },
        hoverDelegate: {
          showHover(options, focus) {
            return void 0;
          },
          delay: 200
        },
        styles: {
          button: unthemedButtonStyles,
          countBadge: unthemedCountStyles,
          inputBox: unthemedInboxStyles,
          toggle: unthemedToggleStyles,
          keybindingLabel: unthemedKeybindingLabelOptions,
          list: unthemedListStyles,
          progressBar: unthemedProgressBarOptions,
          widget: {
            quickInputBackground: void 0,
            quickInputForeground: void 0,
            quickInputTitleBackground: void 0,
            widgetBorder: void 0,
            widgetShadow: void 0
          },
          pickerGroup: {
            pickerGroupBorder: void 0,
            pickerGroupForeground: void 0
          }
        }
      }
    ));
    controller.layout({ height: 20, width: 40 }, 0);
  });
  teardown(() => {
    sinon.restore();
  });
  test("close motion requires modern UI with motion enabled", () => {
    const clock = sinon.useFakeTimers();
    const quickpick = store.add(controller.createQuickPick());
    const widget = fixture.querySelector(".quick-input-widget");
    const states = [];
    const recordState = () => states.push({
      display: widget.style.display,
      closing: widget.classList.contains("quick-input-widget-closing"),
      inert: widget.inert,
      visible: controller.isVisible()
    });
    fixture.classList.add("style-override", "monaco-reduce-motion");
    quickpick.show();
    quickpick.hide();
    recordState();
    fixture.classList.replace("monaco-reduce-motion", "monaco-enable-motion");
    quickpick.show();
    quickpick.hide();
    recordState();
    quickpick.show();
    recordState();
    quickpick.hide();
    clock.tick(150);
    recordState();
    assert.deepStrictEqual(states, [
      { display: "none", closing: false, inert: false, visible: false },
      { display: "", closing: true, inert: true, visible: false },
      { display: "", closing: false, inert: false, visible: true },
      { display: "none", closing: false, inert: false, visible: false }
    ]);
  });
  test("overlay picker aligns its input with the anchor and bypasses motion", () => {
    fixture.style.width = "600px";
    fixture.style.height = "400px";
    fixture.classList.add("style-override", "monaco-enable-motion");
    controller.layout({ width: 600, height: 400 }, 0);
    const anchor = document.createElement("div");
    anchor.style.position = "absolute";
    anchor.style.left = "80px";
    anchor.style.top = "40px";
    anchor.style.width = "300px";
    anchor.style.height = "26px";
    fixture.appendChild(anchor);
    const quickpick = store.add(controller.createQuickPick());
    quickpick.anchor = anchor;
    quickpick.anchorPosition = "overlay";
    quickpick.show();
    const widget = fixture.querySelector(".quick-input-widget");
    const input = fixture.querySelector(".quick-input-filter .monaco-inputbox");
    const anchorRect = anchor.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const openState = {
      alignmentDelta: {
        left: inputRect.left - anchorRect.left,
        top: inputRect.top - anchorRect.top,
        width: inputRect.width - anchorRect.width,
        height: inputRect.height - anchorRect.height
      },
      animationName: mainWindow.getComputedStyle(widget).animationName,
      overlay: widget.classList.contains("quick-input-widget-overlay")
    };
    quickpick.hide();
    assert.deepStrictEqual({
      openState,
      closeState: {
        display: widget.style.display,
        closing: widget.classList.contains("quick-input-widget-closing"),
        inert: widget.inert
      }
    }, {
      openState: {
        alignmentDelta: { left: 0, top: 0, width: 0, height: 0 },
        animationName: "none",
        overlay: true
      },
      closeState: {
        display: "none",
        closing: false,
        inert: false
      }
    });
  });
  test("pick - basecase", async () => {
    const item = { label: "foo" };
    const wait = setupWaitTilShownListener(controller);
    const pickPromise = controller.pick([item, { label: "bar" }]);
    await wait;
    controller.accept();
    const pick = await raceTimeout(pickPromise, 2e3);
    assert.strictEqual(pick, item);
  });
  test("pick - activeItem is honored", async () => {
    const item = { label: "foo" };
    const wait = setupWaitTilShownListener(controller);
    const pickPromise = controller.pick([{ label: "bar" }, item], { activeItem: item });
    await wait;
    controller.accept();
    const pick = await pickPromise;
    assert.strictEqual(pick, item);
  });
  test("input - basecase", async () => {
    const wait = setupWaitTilShownListener(controller);
    const inputPromise = controller.input({ value: "foo" });
    await wait;
    controller.accept();
    const value = await raceTimeout(inputPromise, 2e3);
    assert.strictEqual(value, "foo");
  });
  test("onDidChangeValue - gets triggered when .value is set", async () => {
    const quickpick = store.add(controller.createQuickPick());
    let value = void 0;
    store.add(quickpick.onDidChangeValue((e) => value = e));
    quickpick.value = "changed";
    try {
      assert.strictEqual(value, quickpick.value);
    } finally {
      quickpick.dispose();
    }
  });
  test("keepScrollPosition - works with activeItems", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const items = [];
    for (let i = 0; i < 1e3; i++) {
      items.push({ label: `item ${i}` });
    }
    quickpick.items = items;
    quickpick.activeItems = [items[items.length - 1]];
    quickpick.show();
    const cursorTop = quickpick.scrollTop;
    assert.notStrictEqual(cursorTop, 0);
    quickpick.keepScrollPosition = true;
    quickpick.activeItems = [items[0]];
    assert.strictEqual(cursorTop, quickpick.scrollTop);
    quickpick.keepScrollPosition = false;
    quickpick.activeItems = [items[0]];
    assert.strictEqual(quickpick.scrollTop, 0);
  });
  test("keepScrollPosition - works with items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const items = [];
    for (let i = 0; i < 1e3; i++) {
      items.push({ label: `item ${i}` });
    }
    quickpick.items = items;
    quickpick.activeItems = [items[items.length - 1]];
    quickpick.show();
    const cursorTop = quickpick.scrollTop;
    assert.notStrictEqual(cursorTop, 0);
    quickpick.keepScrollPosition = true;
    quickpick.items = items;
    assert.strictEqual(cursorTop, quickpick.scrollTop);
    quickpick.keepScrollPosition = false;
    quickpick.items = items;
    assert.strictEqual(quickpick.scrollTop, 0);
  });
  test("selectedItems - verify previous selectedItems does not hang over to next set of items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    quickpick.items = [{ label: "step 1" }];
    quickpick.show();
    void await new Promise((resolve) => {
      store.add(quickpick.onDidAccept(() => {
        quickpick.canSelectMany = true;
        quickpick.items = [{ label: "a" }, { label: "b" }, { label: "c" }];
        resolve();
      }));
      controller.accept();
    });
    controller.accept();
    assert.strictEqual(quickpick.selectedItems.length, 0);
  });
  test("activeItems - verify onDidChangeActive is triggered after setting items", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const activeItemsFromEvent = [];
    store.add(quickpick.onDidChangeActive((items) => activeItemsFromEvent.push(...items)));
    quickpick.show();
    const item = { label: "step 1" };
    quickpick.items = [item];
    assert.strictEqual(activeItemsFromEvent.length, 1);
    assert.strictEqual(activeItemsFromEvent[0], item);
    assert.strictEqual(quickpick.activeItems.length, 1);
    assert.strictEqual(quickpick.activeItems[0], item);
  });
  test("activeItems - verify setting itemActivation to None still triggers onDidChangeActive after selection #207832", async () => {
    const quickpick = store.add(controller.createQuickPick());
    const item = { label: "step 1" };
    quickpick.items = [item];
    quickpick.show();
    assert.strictEqual(quickpick.activeItems[0], item);
    const activeItemsFromEvent = [];
    store.add(quickpick.onDidChangeActive((items) => activeItemsFromEvent.push(...items)));
    quickpick.itemActivation = ItemActivation.NONE;
    quickpick.items = [item];
    assert.strictEqual(activeItemsFromEvent.length, 0);
    assert.strictEqual(quickpick.activeItems.length, 0);
  });
  test("isKeyModified - returns false when no modifiers are pressed", () => {
    assert.strictEqual(isKeyModified(NO_KEY_MODS), false);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: false }), false);
  });
  test("isKeyModified - returns true when any modifier is pressed", () => {
    assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: false, shift: false }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: true, shift: false }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: true }), true);
    assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: true, shift: true }), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvdGVzdC9icm93c2VyL3F1aWNraW5wdXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyB1bnRoZW1lZEluYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IHVudGhlbWVkQnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgdW50aGVtZWRMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyB1bnRoZW1lZFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB1bnRoZW1lZENvdW50U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyB1bnRoZW1lZEtleWJpbmRpbmdMYWJlbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyB1bnRoZW1lZFByb2dyZXNzQmFyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcXVpY2tJbnB1dENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgUXVpY2tQaWNrIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBJdGVtQWN0aXZhdGlvbiwgaXNLZXlNb2RpZmllZCwgTk9fS0VZX01PRFMgfSBmcm9tICcuLi8uLi9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm9NYXRjaGluZ0tiIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5cbi8vIFNldHMgdXAgYW4gYG9uU2hvd2AgbGlzdGVuZXIgdG8gYWxsb3cgdXMgdG8gd2FpdCB1bnRpbCB0aGUgcXVpY2sgcGljayBpcyBzaG93biAodXNlZnVsIHdoZW4gdHJpZ2dlcmluZyBhbiBgYWNjZXB0KClgIHJpZ2h0IGFmdGVyIGxhdW5jaGluZyBhIHF1aWNrIHBpY2spXG4vLyBraWNrIHRoaXMgb2ZmIGJlZm9yZSB5b3UgbGF1bmNoIHRoZSBwaWNrZXIgYW5kIHRoZW4gYXdhaXQgdGhlIHByb21pc2UgcmV0dXJuZWQgYWZ0ZXIgeW91IGxhdW5jaCB0aGUgcGlja2VyLlxuYXN5bmMgZnVuY3Rpb24gc2V0dXBXYWl0VGlsU2hvd25MaXN0ZW5lcihjb250cm9sbGVyOiBRdWlja0lucHV0Q29udHJvbGxlcik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRjb25zdCBldmVudCA9IGNvbnRyb2xsZXIub25TaG93KF8gPT4ge1xuXHRcdFx0ZXZlbnQuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHR9KTtcblx0fSksIDIwMDApO1xuXG5cdGlmICghcmVzdWx0KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5jZWxsZWQnKTtcblx0fVxufVxuXG5zdWl0ZSgnUXVpY2tJbnB1dCcsICgpID0+IHsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NzU0M1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgY29udHJvbGxlcjogUXVpY2tJbnB1dENvbnRyb2xsZXI7XG5cdGxldCBmaXh0dXJlOiBIVE1MRWxlbWVudDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Zml4dHVyZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmaXh0dXJlKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGZpeHR1cmUucmVtb3ZlKCkpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0Ly8gU3R1YiB0aGUgc2VydmljZXMgdGhlIHF1aWNrIGlucHV0IGNvbnRyb2xsZXIgbmVlZHMgdG8gZnVuY3Rpb25cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUaGVtZVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBuZXcgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxpc3RTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IExpc3RTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYXlvdXRTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRhY3RpdmVDb250YWluZXI6IGZpeHR1cmUsXG5cdFx0XHRvbkRpZExheW91dENvbnRhaW5lcjogRXZlbnQuTm9uZSxcblx0XHRcdGdldENvbnRhaW5lcjogKCkgPT4gZml4dHVyZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0Vmlld1NlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0Vmlld1NlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElLZXliaW5kaW5nU2VydmljZSwge1xuXHRcdFx0bWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRzb2Z0RGlzcGF0Y2goKSB7IHJldHVybiBOb01hdGNoaW5nS2I7IH0sXG5cdFx0fSk7XG5cblx0XHRjb250cm9sbGVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UXVpY2tJbnB1dENvbnRyb2xsZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRhaW5lcjogZml4dHVyZSxcblx0XHRcdFx0aWRQcmVmaXg6ICd0ZXN0UXVpY2tJbnB1dCcsXG5cdFx0XHRcdGlnbm9yZUZvY3VzT3V0KCkgeyByZXR1cm4gdHJ1ZTsgfSxcblx0XHRcdFx0cmV0dXJuRm9jdXMoKSB7IH0sXG5cdFx0XHRcdGJhY2tLZXliaW5kaW5nTGFiZWwoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdHNldENvbnRleHRLZXkoKSB7IHJldHVybiB1bmRlZmluZWQ7IH0sXG5cdFx0XHRcdGxpbmtPcGVuZXJEZWxlZ2F0ZShjb250ZW50KSB7IH0sXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGU6IHtcblx0XHRcdFx0XHRzaG93SG92ZXIob3B0aW9ucywgZm9jdXMpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWxheTogMjAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0eWxlczoge1xuXHRcdFx0XHRcdGJ1dHRvbjogdW50aGVtZWRCdXR0b25TdHlsZXMsXG5cdFx0XHRcdFx0Y291bnRCYWRnZTogdW50aGVtZWRDb3VudFN0eWxlcyxcblx0XHRcdFx0XHRpbnB1dEJveDogdW50aGVtZWRJbmJveFN0eWxlcyxcblx0XHRcdFx0XHR0b2dnbGU6IHVudGhlbWVkVG9nZ2xlU3R5bGVzLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbDogdW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zLFxuXHRcdFx0XHRcdGxpc3Q6IHVudGhlbWVkTGlzdFN0eWxlcyxcblx0XHRcdFx0XHRwcm9ncmVzc0JhcjogdW50aGVtZWRQcm9ncmVzc0Jhck9wdGlvbnMsXG5cdFx0XHRcdFx0d2lkZ2V0OiB7XG5cdFx0XHRcdFx0XHRxdWlja0lucHV0QmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cXVpY2tJbnB1dEZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHF1aWNrSW5wdXRUaXRsZUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdpZGdldEJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d2lkZ2V0U2hhZG93OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwaWNrZXJHcm91cDoge1xuXHRcdFx0XHRcdFx0cGlja2VyR3JvdXBCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBpY2tlckdyb3VwRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gaW5pdGlhbCBsYXlvdXRcblx0XHRjb250cm9sbGVyLmxheW91dCh7IGhlaWdodDogMjAsIHdpZHRoOiA0MCB9LCAwKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvc2UgbW90aW9uIHJlcXVpcmVzIG1vZGVybiBVSSB3aXRoIG1vdGlvbiBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNsb2NrID0gc2lub24udXNlRmFrZVRpbWVycygpO1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpKTtcblx0XHRjb25zdCB3aWRnZXQgPSBmaXh0dXJlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcucXVpY2staW5wdXQtd2lkZ2V0JykhO1xuXHRcdGNvbnN0IHN0YXRlczogeyBkaXNwbGF5OiBzdHJpbmc7IGNsb3Npbmc6IGJvb2xlYW47IGluZXJ0OiBib29sZWFuOyB2aXNpYmxlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJlY29yZFN0YXRlID0gKCkgPT4gc3RhdGVzLnB1c2goe1xuXHRcdFx0ZGlzcGxheTogd2lkZ2V0LnN0eWxlLmRpc3BsYXksXG5cdFx0XHRjbG9zaW5nOiB3aWRnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdxdWljay1pbnB1dC13aWRnZXQtY2xvc2luZycpLFxuXHRcdFx0aW5lcnQ6IHdpZGdldC5pbmVydCxcblx0XHRcdHZpc2libGU6IGNvbnRyb2xsZXIuaXNWaXNpYmxlKCksXG5cdFx0fSk7XG5cblx0XHRmaXh0dXJlLmNsYXNzTGlzdC5hZGQoJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1yZWR1Y2UtbW90aW9uJyk7XG5cdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHRxdWlja3BpY2suaGlkZSgpO1xuXHRcdHJlY29yZFN0YXRlKCk7XG5cblx0XHRmaXh0dXJlLmNsYXNzTGlzdC5yZXBsYWNlKCdtb25hY28tcmVkdWNlLW1vdGlvbicsICdtb25hY28tZW5hYmxlLW1vdGlvbicpO1xuXHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRyZWNvcmRTdGF0ZSgpO1xuXG5cdFx0cXVpY2twaWNrLnNob3coKTtcblx0XHRyZWNvcmRTdGF0ZSgpO1xuXG5cdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRjbG9jay50aWNrKDE1MCk7XG5cdFx0cmVjb3JkU3RhdGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGVzLCBbXG5cdFx0XHR7IGRpc3BsYXk6ICdub25lJywgY2xvc2luZzogZmFsc2UsIGluZXJ0OiBmYWxzZSwgdmlzaWJsZTogZmFsc2UgfSxcblx0XHRcdHsgZGlzcGxheTogJycsIGNsb3Npbmc6IHRydWUsIGluZXJ0OiB0cnVlLCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0eyBkaXNwbGF5OiAnJywgY2xvc2luZzogZmFsc2UsIGluZXJ0OiBmYWxzZSwgdmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0eyBkaXNwbGF5OiAnbm9uZScsIGNsb3Npbmc6IGZhbHNlLCBpbmVydDogZmFsc2UsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXkgcGlja2VyIGFsaWducyBpdHMgaW5wdXQgd2l0aCB0aGUgYW5jaG9yIGFuZCBieXBhc3NlcyBtb3Rpb24nLCAoKSA9PiB7XG5cdFx0Zml4dHVyZS5zdHlsZS53aWR0aCA9ICc2MDBweCc7XG5cdFx0Zml4dHVyZS5zdHlsZS5oZWlnaHQgPSAnNDAwcHgnO1xuXHRcdGZpeHR1cmUuY2xhc3NMaXN0LmFkZCgnc3R5bGUtb3ZlcnJpZGUnLCAnbW9uYWNvLWVuYWJsZS1tb3Rpb24nKTtcblx0XHRjb250cm9sbGVyLmxheW91dCh7IHdpZHRoOiA2MDAsIGhlaWdodDogNDAwIH0sIDApO1xuXG5cdFx0Y29uc3QgYW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRhbmNob3Iuc3R5bGUubGVmdCA9ICc4MHB4Jztcblx0XHRhbmNob3Iuc3R5bGUudG9wID0gJzQwcHgnO1xuXHRcdGFuY2hvci5zdHlsZS53aWR0aCA9ICczMDBweCc7XG5cdFx0YW5jaG9yLnN0eWxlLmhlaWdodCA9ICcyNnB4Jztcblx0XHRmaXh0dXJlLmFwcGVuZENoaWxkKGFuY2hvcik7XG5cblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSk7XG5cdFx0cXVpY2twaWNrLmFuY2hvciA9IGFuY2hvcjtcblx0XHRxdWlja3BpY2suYW5jaG9yUG9zaXRpb24gPSAnb3ZlcmxheSc7XG5cdFx0cXVpY2twaWNrLnNob3coKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IGZpeHR1cmUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5xdWljay1pbnB1dC13aWRnZXQnKSE7XG5cdFx0Y29uc3QgaW5wdXQgPSBmaXh0dXJlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcucXVpY2staW5wdXQtZmlsdGVyIC5tb25hY28taW5wdXRib3gnKSE7XG5cdFx0Y29uc3QgYW5jaG9yUmVjdCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBpbnB1dFJlY3QgPSBpbnB1dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBvcGVuU3RhdGUgPSB7XG5cdFx0XHRhbGlnbm1lbnREZWx0YToge1xuXHRcdFx0XHRsZWZ0OiBpbnB1dFJlY3QubGVmdCAtIGFuY2hvclJlY3QubGVmdCxcblx0XHRcdFx0dG9wOiBpbnB1dFJlY3QudG9wIC0gYW5jaG9yUmVjdC50b3AsXG5cdFx0XHRcdHdpZHRoOiBpbnB1dFJlY3Qud2lkdGggLSBhbmNob3JSZWN0LndpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGlucHV0UmVjdC5oZWlnaHQgLSBhbmNob3JSZWN0LmhlaWdodCxcblx0XHRcdH0sXG5cdFx0XHRhbmltYXRpb25OYW1lOiBtYWluV2luZG93LmdldENvbXB1dGVkU3R5bGUod2lkZ2V0KS5hbmltYXRpb25OYW1lLFxuXHRcdFx0b3ZlcmxheTogd2lkZ2V0LmNsYXNzTGlzdC5jb250YWlucygncXVpY2staW5wdXQtd2lkZ2V0LW92ZXJsYXknKSxcblx0XHR9O1xuXG5cdFx0cXVpY2twaWNrLmhpZGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlblN0YXRlLFxuXHRcdFx0Y2xvc2VTdGF0ZToge1xuXHRcdFx0XHRkaXNwbGF5OiB3aWRnZXQuc3R5bGUuZGlzcGxheSxcblx0XHRcdFx0Y2xvc2luZzogd2lkZ2V0LmNsYXNzTGlzdC5jb250YWlucygncXVpY2staW5wdXQtd2lkZ2V0LWNsb3NpbmcnKSxcblx0XHRcdFx0aW5lcnQ6IHdpZGdldC5pbmVydCxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0b3BlblN0YXRlOiB7XG5cdFx0XHRcdGFsaWdubWVudERlbHRhOiB7IGxlZnQ6IDAsIHRvcDogMCwgd2lkdGg6IDAsIGhlaWdodDogMCB9LFxuXHRcdFx0XHRhbmltYXRpb25OYW1lOiAnbm9uZScsXG5cdFx0XHRcdG92ZXJsYXk6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0Y2xvc2VTdGF0ZToge1xuXHRcdFx0XHRkaXNwbGF5OiAnbm9uZScsXG5cdFx0XHRcdGNsb3Npbmc6IGZhbHNlLFxuXHRcdFx0XHRpbmVydDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwaWNrIC0gYmFzZWNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IHsgbGFiZWw6ICdmb28nIH07XG5cblx0XHRjb25zdCB3YWl0ID0gc2V0dXBXYWl0VGlsU2hvd25MaXN0ZW5lcihjb250cm9sbGVyKTtcblx0XHRjb25zdCBwaWNrUHJvbWlzZSA9IGNvbnRyb2xsZXIucGljayhbaXRlbSwgeyBsYWJlbDogJ2JhcicgfV0pO1xuXHRcdGF3YWl0IHdhaXQ7XG5cblx0XHRjb250cm9sbGVyLmFjY2VwdCgpO1xuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCByYWNlVGltZW91dChwaWNrUHJvbWlzZSwgMjAwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGljaywgaXRlbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpY2sgLSBhY3RpdmVJdGVtIGlzIGhvbm9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IHsgbGFiZWw6ICdmb28nIH07XG5cblx0XHRjb25zdCB3YWl0ID0gc2V0dXBXYWl0VGlsU2hvd25MaXN0ZW5lcihjb250cm9sbGVyKTtcblx0XHRjb25zdCBwaWNrUHJvbWlzZSA9IGNvbnRyb2xsZXIucGljayhbeyBsYWJlbDogJ2JhcicgfSwgaXRlbV0sIHsgYWN0aXZlSXRlbTogaXRlbSB9KTtcblx0XHRhd2FpdCB3YWl0O1xuXG5cdFx0Y29udHJvbGxlci5hY2NlcHQoKTtcblx0XHRjb25zdCBwaWNrID0gYXdhaXQgcGlja1Byb21pc2U7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGljaywgaXRlbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lucHV0IC0gYmFzZWNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2FpdCA9IHNldHVwV2FpdFRpbFNob3duTGlzdGVuZXIoY29udHJvbGxlcik7XG5cdFx0Y29uc3QgaW5wdXRQcm9taXNlID0gY29udHJvbGxlci5pbnB1dCh7IHZhbHVlOiAnZm9vJyB9KTtcblx0XHRhd2FpdCB3YWl0O1xuXG5cdFx0Y29udHJvbGxlci5hY2NlcHQoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHJhY2VUaW1lb3V0KGlucHV0UHJvbWlzZSwgMjAwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VWYWx1ZSAtIGdldHMgdHJpZ2dlcmVkIHdoZW4gLnZhbHVlIGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSk7XG5cblx0XHRsZXQgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRzdG9yZS5hZGQocXVpY2twaWNrLm9uRGlkQ2hhbmdlVmFsdWUoKGUpID0+IHZhbHVlID0gZSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciBhIGNoYW5nZVxuXHRcdHF1aWNrcGljay52YWx1ZSA9ICdjaGFuZ2VkJztcblxuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIHF1aWNrcGljay52YWx1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1aWNrcGljay5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdrZWVwU2Nyb2xsUG9zaXRpb24gLSB3b3JrcyB3aXRoIGFjdGl2ZUl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHF1aWNrcGljayA9IHN0b3JlLmFkZChjb250cm9sbGVyLmNyZWF0ZVF1aWNrUGljaygpIGFzIFF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4pO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDA7IGkrKykge1xuXHRcdFx0aXRlbXMucHVzaCh7IGxhYmVsOiBgaXRlbSAke2l9YCB9KTtcblx0XHR9XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0Ly8gc2V0dGluZyB0aGUgYWN0aXZlIGl0ZW0gc2hvdWxkIGNhdXNlIHRoZSBxdWljayBwaWNrIHRvIHNjcm9sbCB0byB0aGUgYm90dG9tXG5cdFx0cXVpY2twaWNrLmFjdGl2ZUl0ZW1zID0gW2l0ZW1zW2l0ZW1zLmxlbmd0aCAtIDFdXTtcblx0XHRxdWlja3BpY2suc2hvdygpO1xuXG5cdFx0Y29uc3QgY3Vyc29yVG9wID0gcXVpY2twaWNrLnNjcm9sbFRvcDtcblxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjdXJzb3JUb3AsIDApO1xuXG5cdFx0cXVpY2twaWNrLmtlZXBTY3JvbGxQb3NpdGlvbiA9IHRydWU7XG5cdFx0cXVpY2twaWNrLmFjdGl2ZUl0ZW1zID0gW2l0ZW1zWzBdXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3Vyc29yVG9wLCBxdWlja3BpY2suc2Nyb2xsVG9wKTtcblxuXHRcdHF1aWNrcGljay5rZWVwU2Nyb2xsUG9zaXRpb24gPSBmYWxzZTtcblx0XHRxdWlja3BpY2suYWN0aXZlSXRlbXMgPSBbaXRlbXNbMF1dO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWlja3BpY2suc2Nyb2xsVG9wLCAwKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcFNjcm9sbFBvc2l0aW9uIC0gd29ya3Mgd2l0aCBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSBhcyBRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDAwOyBpKyspIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogYGl0ZW0gJHtpfWAgfSk7XG5cdFx0fVxuXHRcdHF1aWNrcGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdC8vIHNldHRpbmcgdGhlIGFjdGl2ZSBpdGVtIHNob3VsZCBjYXVzZSB0aGUgcXVpY2sgcGljayB0byBzY3JvbGwgdG8gdGhlIGJvdHRvbVxuXHRcdHF1aWNrcGljay5hY3RpdmVJdGVtcyA9IFtpdGVtc1tpdGVtcy5sZW5ndGggLSAxXV07XG5cdFx0cXVpY2twaWNrLnNob3coKTtcblxuXHRcdGNvbnN0IGN1cnNvclRvcCA9IHF1aWNrcGljay5zY3JvbGxUb3A7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGN1cnNvclRvcCwgMCk7XG5cblx0XHRxdWlja3BpY2sua2VlcFNjcm9sbFBvc2l0aW9uID0gdHJ1ZTtcblx0XHRxdWlja3BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3Vyc29yVG9wLCBxdWlja3BpY2suc2Nyb2xsVG9wKTtcblxuXHRcdHF1aWNrcGljay5rZWVwU2Nyb2xsUG9zaXRpb24gPSBmYWxzZTtcblx0XHRxdWlja3BpY2suaXRlbXMgPSBpdGVtcztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2twaWNrLnNjcm9sbFRvcCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGVkSXRlbXMgLSB2ZXJpZnkgcHJldmlvdXMgc2VsZWN0ZWRJdGVtcyBkb2VzIG5vdCBoYW5nIG92ZXIgdG8gbmV4dCBzZXQgb2YgaXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcXVpY2twaWNrID0gc3RvcmUuYWRkKGNvbnRyb2xsZXIuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdHF1aWNrcGljay5pdGVtcyA9IFt7IGxhYmVsOiAnc3RlcCAxJyB9XTtcblx0XHRxdWlja3BpY2suc2hvdygpO1xuXG5cdFx0dm9pZCAoYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocXVpY2twaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0cXVpY2twaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdFx0XHRxdWlja3BpY2suaXRlbXMgPSBbeyBsYWJlbDogJ2EnIH0sIHsgbGFiZWw6ICdiJyB9LCB7IGxhYmVsOiAnYycgfV07XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gYWNjZXB0ICdzdGVwIDEnXG5cdFx0XHRjb250cm9sbGVyLmFjY2VwdCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIGFjY2VwdCBpbiBtdWx0aS1zZWxlY3Rcblx0XHRjb250cm9sbGVyLmFjY2VwdCgpO1xuXG5cdFx0Ly8gU2luY2Ugd2UgZG9uJ3Qgc2VsZWN0IGFueSBpdGVtcywgdGhlIHNlbGVjdGVkIGl0ZW1zIHNob3VsZCBiZSBlbXB0eVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWlja3BpY2suc2VsZWN0ZWRJdGVtcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmVJdGVtcyAtIHZlcmlmeSBvbkRpZENoYW5nZUFjdGl2ZSBpcyB0cmlnZ2VyZWQgYWZ0ZXIgc2V0dGluZyBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSk7XG5cblx0XHQvLyBTZXR1cCBsaXN0ZW5lciBmb3IgdmVyaWZpY2F0aW9uXG5cdFx0Y29uc3QgYWN0aXZlSXRlbXNGcm9tRXZlbnQ6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRzdG9yZS5hZGQocXVpY2twaWNrLm9uRGlkQ2hhbmdlQWN0aXZlKGl0ZW1zID0+IGFjdGl2ZUl0ZW1zRnJvbUV2ZW50LnB1c2goLi4uaXRlbXMpKSk7XG5cblx0XHRxdWlja3BpY2suc2hvdygpO1xuXG5cdFx0Y29uc3QgaXRlbSA9IHsgbGFiZWw6ICdzdGVwIDEnIH07XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gW2l0ZW1dO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUl0ZW1zRnJvbUV2ZW50Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUl0ZW1zRnJvbUV2ZW50WzBdLCBpdGVtKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2twaWNrLmFjdGl2ZUl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrcGljay5hY3RpdmVJdGVtc1swXSwgaXRlbSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZUl0ZW1zIC0gdmVyaWZ5IHNldHRpbmcgaXRlbUFjdGl2YXRpb24gdG8gTm9uZSBzdGlsbCB0cmlnZ2VycyBvbkRpZENoYW5nZUFjdGl2ZSBhZnRlciBzZWxlY3Rpb24gIzIwNzgzMicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBxdWlja3BpY2sgPSBzdG9yZS5hZGQoY29udHJvbGxlci5jcmVhdGVRdWlja1BpY2soKSk7XG5cdFx0Y29uc3QgaXRlbSA9IHsgbGFiZWw6ICdzdGVwIDEnIH07XG5cdFx0cXVpY2twaWNrLml0ZW1zID0gW2l0ZW1dO1xuXHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrcGljay5hY3RpdmVJdGVtc1swXSwgaXRlbSk7XG5cblx0XHQvLyBTZXR1cCBsaXN0ZW5lciBmb3IgdmVyaWZpY2F0aW9uXG5cdFx0Y29uc3QgYWN0aXZlSXRlbXNGcm9tRXZlbnQ6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRzdG9yZS5hZGQocXVpY2twaWNrLm9uRGlkQ2hhbmdlQWN0aXZlKGl0ZW1zID0+IGFjdGl2ZUl0ZW1zRnJvbUV2ZW50LnB1c2goLi4uaXRlbXMpKSk7XG5cblx0XHQvLyBUcmlnZ2VyIGEgY2hhbmdlXG5cdFx0cXVpY2twaWNrLml0ZW1BY3RpdmF0aW9uID0gSXRlbUFjdGl2YXRpb24uTk9ORTtcblx0XHRxdWlja3BpY2suaXRlbXMgPSBbaXRlbV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlSXRlbXNGcm9tRXZlbnQubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2twaWNrLmFjdGl2ZUl0ZW1zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzS2V5TW9kaWZpZWQgLSByZXR1cm5zIGZhbHNlIHdoZW4gbm8gbW9kaWZpZXJzIGFyZSBwcmVzc2VkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0tleU1vZGlmaWVkKE5PX0tFWV9NT0RTKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0tleU1vZGlmaWVkKHsgY3RybENtZDogZmFsc2UsIGFsdDogZmFsc2UsIHNoaWZ0OiBmYWxzZSB9KSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0tleU1vZGlmaWVkIC0gcmV0dXJucyB0cnVlIHdoZW4gYW55IG1vZGlmaWVyIGlzIHByZXNzZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzS2V5TW9kaWZpZWQoeyBjdHJsQ21kOiB0cnVlLCBhbHQ6IGZhbHNlLCBzaGlmdDogZmFsc2UgfSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0tleU1vZGlmaWVkKHsgY3RybENtZDogZmFsc2UsIGFsdDogdHJ1ZSwgc2hpZnQ6IGZhbHNlIH0pLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNLZXlNb2RpZmllZCh7IGN0cmxDbWQ6IGZhbHNlLCBhbHQ6IGZhbHNlLCBzaGlmdDogdHJ1ZSB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzS2V5TW9kaWZpZWQoeyBjdHJsQ21kOiB0cnVlLCBhbHQ6IHRydWUsIHNoaWZ0OiB0cnVlIH0pLCB0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixPQUFPLFdBQVc7QUFDbEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQXlCLGdCQUFnQixlQUFlLG1CQUFtQjtBQUMzRSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWMsbUJBQW1CO0FBQzFDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBSXpDLGVBQWUsMEJBQTBCLFlBQWlEO0FBQ3pGLFFBQU0sU0FBUyxNQUFNLFlBQVksSUFBSSxRQUFpQixhQUFXO0FBQ2hFLFVBQU0sUUFBUSxXQUFXLE9BQU8sT0FBSztBQUNwQyxZQUFNLFFBQVE7QUFDZCxjQUFRLElBQUk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUMsR0FBRyxHQUFJO0FBRVIsTUFBSSxDQUFDLFFBQVE7QUFDWixVQUFNLElBQUksTUFBTSxXQUFXO0FBQUEsRUFDNUI7QUFDRDtBQUVBLE1BQU0sY0FBYyxNQUFNO0FBQ3pCLFFBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxjQUFVLFNBQVMsY0FBYyxLQUFLO0FBQ3RDLGVBQVcsU0FBUyxLQUFLLFlBQVksT0FBTztBQUM1QyxVQUFNLElBQUksYUFBYSxNQUFNLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFFOUMsVUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFHMUQseUJBQXFCLEtBQUssZUFBZSxJQUFJLGlCQUFpQixDQUFDO0FBQy9ELHlCQUFxQixLQUFLLHVCQUF1QixJQUFJLHlCQUF5QixDQUFDO0FBQy9FLHlCQUFxQixLQUFLLHVCQUF1QixJQUFJLHlCQUF5QixDQUFDO0FBQy9FLHlCQUFxQixLQUFLLGNBQWMsTUFBTSxJQUFJLElBQUksWUFBWSxDQUFDLENBQUM7QUFDcEUseUJBQXFCLEtBQUssZ0JBQWdCO0FBQUEsTUFDekMsZUFBZTtBQUFBLE1BQ2YsaUJBQWlCO0FBQUEsTUFDakIsc0JBQXNCLE1BQU07QUFBQSxNQUM1QixjQUFjLE1BQU07QUFBQSxJQUNyQixDQUFDO0FBQ0QseUJBQXFCLEtBQUsscUJBQXFCLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ2pILHlCQUFxQixLQUFLLG9CQUFvQixNQUFNLElBQUkscUJBQXFCLGVBQWUsaUJBQWlCLENBQUMsQ0FBQztBQUMvRyx5QkFBcUIsS0FBSyxvQkFBb0I7QUFBQSxNQUM3QyxpQ0FBaUM7QUFBRSxlQUFPO0FBQUEsTUFBTztBQUFBLE1BQ2pELGVBQWU7QUFBRSxlQUFPO0FBQUEsTUFBYztBQUFBLElBQ3ZDLENBQUM7QUFFRCxpQkFBYSxNQUFNLElBQUkscUJBQXFCO0FBQUEsTUFDM0M7QUFBQSxNQUNBO0FBQUEsUUFDQyxXQUFXO0FBQUEsUUFDWCxVQUFVO0FBQUEsUUFDVixpQkFBaUI7QUFBRSxpQkFBTztBQUFBLFFBQU07QUFBQSxRQUNoQyxjQUFjO0FBQUEsUUFBRTtBQUFBLFFBQ2hCLHNCQUFzQjtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLFFBQzFDLGdCQUFnQjtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLFFBQ3BDLG1CQUFtQixTQUFTO0FBQUEsUUFBRTtBQUFBLFFBQzlCLGVBQWU7QUFBQSxVQUNkLFVBQVUsU0FBUyxPQUFPO0FBQ3pCLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFVBQ0EsT0FBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLFFBQVE7QUFBQSxVQUNQLFFBQVE7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLFVBQVU7QUFBQSxVQUNWLFFBQVE7QUFBQSxVQUNSLGlCQUFpQjtBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLFFBQVE7QUFBQSxZQUNQLHNCQUFzQjtBQUFBLFlBQ3RCLHNCQUFzQjtBQUFBLFlBQ3RCLDJCQUEyQjtBQUFBLFlBQzNCLGNBQWM7QUFBQSxZQUNkLGNBQWM7QUFBQSxVQUNmO0FBQUEsVUFDQSxhQUFhO0FBQUEsWUFDWixtQkFBbUI7QUFBQSxZQUNuQix1QkFBdUI7QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBR0QsZUFBVyxPQUFPLEVBQUUsUUFBUSxJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUM7QUFBQSxFQUMvQyxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxVQUFNLFFBQVEsTUFBTSxjQUFjO0FBQ2xDLFVBQU0sWUFBWSxNQUFNLElBQUksV0FBVyxnQkFBZ0IsQ0FBQztBQUN4RCxVQUFNLFNBQVMsUUFBUSxjQUEyQixxQkFBcUI7QUFDdkUsVUFBTSxTQUFvRixDQUFDO0FBQzNGLFVBQU0sY0FBYyxNQUFNLE9BQU8sS0FBSztBQUFBLE1BQ3JDLFNBQVMsT0FBTyxNQUFNO0FBQUEsTUFDdEIsU0FBUyxPQUFPLFVBQVUsU0FBUyw0QkFBNEI7QUFBQSxNQUMvRCxPQUFPLE9BQU87QUFBQSxNQUNkLFNBQVMsV0FBVyxVQUFVO0FBQUEsSUFDL0IsQ0FBQztBQUVELFlBQVEsVUFBVSxJQUFJLGtCQUFrQixzQkFBc0I7QUFDOUQsY0FBVSxLQUFLO0FBQ2YsY0FBVSxLQUFLO0FBQ2YsZ0JBQVk7QUFFWixZQUFRLFVBQVUsUUFBUSx3QkFBd0Isc0JBQXNCO0FBQ3hFLGNBQVUsS0FBSztBQUNmLGNBQVUsS0FBSztBQUNmLGdCQUFZO0FBRVosY0FBVSxLQUFLO0FBQ2YsZ0JBQVk7QUFFWixjQUFVLEtBQUs7QUFDZixVQUFNLEtBQUssR0FBRztBQUNkLGdCQUFZO0FBRVosV0FBTyxnQkFBZ0IsUUFBUTtBQUFBLE1BQzlCLEVBQUUsU0FBUyxRQUFRLFNBQVMsT0FBTyxPQUFPLE9BQU8sU0FBUyxNQUFNO0FBQUEsTUFDaEUsRUFBRSxTQUFTLElBQUksU0FBUyxNQUFNLE9BQU8sTUFBTSxTQUFTLE1BQU07QUFBQSxNQUMxRCxFQUFFLFNBQVMsSUFBSSxTQUFTLE9BQU8sT0FBTyxPQUFPLFNBQVMsS0FBSztBQUFBLE1BQzNELEVBQUUsU0FBUyxRQUFRLFNBQVMsT0FBTyxPQUFPLE9BQU8sU0FBUyxNQUFNO0FBQUEsSUFDakUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsWUFBUSxNQUFNLFFBQVE7QUFDdEIsWUFBUSxNQUFNLFNBQVM7QUFDdkIsWUFBUSxVQUFVLElBQUksa0JBQWtCLHNCQUFzQjtBQUM5RCxlQUFXLE9BQU8sRUFBRSxPQUFPLEtBQUssUUFBUSxJQUFJLEdBQUcsQ0FBQztBQUVoRCxVQUFNLFNBQVMsU0FBUyxjQUFjLEtBQUs7QUFDM0MsV0FBTyxNQUFNLFdBQVc7QUFDeEIsV0FBTyxNQUFNLE9BQU87QUFDcEIsV0FBTyxNQUFNLE1BQU07QUFDbkIsV0FBTyxNQUFNLFFBQVE7QUFDckIsV0FBTyxNQUFNLFNBQVM7QUFDdEIsWUFBUSxZQUFZLE1BQU07QUFFMUIsVUFBTSxZQUFZLE1BQU0sSUFBSSxXQUFXLGdCQUFnQixDQUFDO0FBQ3hELGNBQVUsU0FBUztBQUNuQixjQUFVLGlCQUFpQjtBQUMzQixjQUFVLEtBQUs7QUFFZixVQUFNLFNBQVMsUUFBUSxjQUEyQixxQkFBcUI7QUFDdkUsVUFBTSxRQUFRLFFBQVEsY0FBMkIsc0NBQXNDO0FBQ3ZGLFVBQU0sYUFBYSxPQUFPLHNCQUFzQjtBQUNoRCxVQUFNLFlBQVksTUFBTSxzQkFBc0I7QUFDOUMsVUFBTSxZQUFZO0FBQUEsTUFDakIsZ0JBQWdCO0FBQUEsUUFDZixNQUFNLFVBQVUsT0FBTyxXQUFXO0FBQUEsUUFDbEMsS0FBSyxVQUFVLE1BQU0sV0FBVztBQUFBLFFBQ2hDLE9BQU8sVUFBVSxRQUFRLFdBQVc7QUFBQSxRQUNwQyxRQUFRLFVBQVUsU0FBUyxXQUFXO0FBQUEsTUFDdkM7QUFBQSxNQUNBLGVBQWUsV0FBVyxpQkFBaUIsTUFBTSxFQUFFO0FBQUEsTUFDbkQsU0FBUyxPQUFPLFVBQVUsU0FBUyw0QkFBNEI7QUFBQSxJQUNoRTtBQUVBLGNBQVUsS0FBSztBQUVmLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNYLFNBQVMsT0FBTyxNQUFNO0FBQUEsUUFDdEIsU0FBUyxPQUFPLFVBQVUsU0FBUyw0QkFBNEI7QUFBQSxRQUMvRCxPQUFPLE9BQU87QUFBQSxNQUNmO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixXQUFXO0FBQUEsUUFDVixnQkFBZ0IsRUFBRSxNQUFNLEdBQUcsS0FBSyxHQUFHLE9BQU8sR0FBRyxRQUFRLEVBQUU7QUFBQSxRQUN2RCxlQUFlO0FBQUEsUUFDZixTQUFTO0FBQUEsTUFDVjtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLFFBQ1QsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1CQUFtQixZQUFZO0FBQ25DLFVBQU0sT0FBTyxFQUFFLE9BQU8sTUFBTTtBQUU1QixVQUFNLE9BQU8sMEJBQTBCLFVBQVU7QUFDakQsVUFBTSxjQUFjLFdBQVcsS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBQzVELFVBQU07QUFFTixlQUFXLE9BQU87QUFDbEIsVUFBTSxPQUFPLE1BQU0sWUFBWSxhQUFhLEdBQUk7QUFFaEQsV0FBTyxZQUFZLE1BQU0sSUFBSTtBQUFBLEVBQzlCLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxZQUFZO0FBQ2hELFVBQU0sT0FBTyxFQUFFLE9BQU8sTUFBTTtBQUU1QixVQUFNLE9BQU8sMEJBQTBCLFVBQVU7QUFDakQsVUFBTSxjQUFjLFdBQVcsS0FBSyxDQUFDLEVBQUUsT0FBTyxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsWUFBWSxLQUFLLENBQUM7QUFDbEYsVUFBTTtBQUVOLGVBQVcsT0FBTztBQUNsQixVQUFNLE9BQU8sTUFBTTtBQUVuQixXQUFPLFlBQVksTUFBTSxJQUFJO0FBQUEsRUFDOUIsQ0FBQztBQUVELE9BQUssb0JBQW9CLFlBQVk7QUFDcEMsVUFBTSxPQUFPLDBCQUEwQixVQUFVO0FBQ2pELFVBQU0sZUFBZSxXQUFXLE1BQU0sRUFBRSxPQUFPLE1BQU0sQ0FBQztBQUN0RCxVQUFNO0FBRU4sZUFBVyxPQUFPO0FBQ2xCLFVBQU0sUUFBUSxNQUFNLFlBQVksY0FBYyxHQUFJO0FBRWxELFdBQU8sWUFBWSxPQUFPLEtBQUs7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyx3REFBd0QsWUFBWTtBQUN4RSxVQUFNLFlBQVksTUFBTSxJQUFJLFdBQVcsZ0JBQWdCLENBQUM7QUFFeEQsUUFBSSxRQUE0QjtBQUNoQyxVQUFNLElBQUksVUFBVSxpQkFBaUIsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBR3RELGNBQVUsUUFBUTtBQUVsQixRQUFJO0FBQ0gsYUFBTyxZQUFZLE9BQU8sVUFBVSxLQUFLO0FBQUEsSUFDMUMsVUFBRTtBQUNELGdCQUFVLFFBQVE7QUFBQSxJQUNuQjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0QsVUFBTSxZQUFZLE1BQU0sSUFBSSxXQUFXLGdCQUFnQixDQUE4QjtBQUVyRixVQUFNLFFBQVEsQ0FBQztBQUNmLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBTSxLQUFLO0FBQzlCLFlBQU0sS0FBSyxFQUFFLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQztBQUFBLElBQ2xDO0FBQ0EsY0FBVSxRQUFRO0FBRWxCLGNBQVUsY0FBYyxDQUFDLE1BQU0sTUFBTSxTQUFTLENBQUMsQ0FBQztBQUNoRCxjQUFVLEtBQUs7QUFFZixVQUFNLFlBQVksVUFBVTtBQUU1QixXQUFPLGVBQWUsV0FBVyxDQUFDO0FBRWxDLGNBQVUscUJBQXFCO0FBQy9CLGNBQVUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2pDLFdBQU8sWUFBWSxXQUFXLFVBQVUsU0FBUztBQUVqRCxjQUFVLHFCQUFxQjtBQUMvQixjQUFVLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUNqQyxXQUFPLFlBQVksVUFBVSxXQUFXLENBQUM7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyx5Q0FBeUMsWUFBWTtBQUN6RCxVQUFNLFlBQVksTUFBTSxJQUFJLFdBQVcsZ0JBQWdCLENBQThCO0FBRXJGLFVBQU0sUUFBUSxDQUFDO0FBQ2YsYUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFNLEtBQUs7QUFDOUIsWUFBTSxLQUFLLEVBQUUsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDbEM7QUFDQSxjQUFVLFFBQVE7QUFFbEIsY0FBVSxjQUFjLENBQUMsTUFBTSxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQ2hELGNBQVUsS0FBSztBQUVmLFVBQU0sWUFBWSxVQUFVO0FBQzVCLFdBQU8sZUFBZSxXQUFXLENBQUM7QUFFbEMsY0FBVSxxQkFBcUI7QUFDL0IsY0FBVSxRQUFRO0FBQ2xCLFdBQU8sWUFBWSxXQUFXLFVBQVUsU0FBUztBQUVqRCxjQUFVLHFCQUFxQjtBQUMvQixjQUFVLFFBQVE7QUFDbEIsV0FBTyxZQUFZLFVBQVUsV0FBVyxDQUFDO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUsseUZBQXlGLFlBQVk7QUFDekcsVUFBTSxZQUFZLE1BQU0sSUFBSSxXQUFXLGdCQUFnQixDQUFDO0FBQ3hELGNBQVUsUUFBUSxDQUFDLEVBQUUsT0FBTyxTQUFTLENBQUM7QUFDdEMsY0FBVSxLQUFLO0FBRWYsU0FBTSxNQUFNLElBQUksUUFBYyxhQUFXO0FBQ3hDLFlBQU0sSUFBSSxVQUFVLFlBQVksTUFBTTtBQUNyQyxrQkFBVSxnQkFBZ0I7QUFDMUIsa0JBQVUsUUFBUSxDQUFDLEVBQUUsT0FBTyxJQUFJLEdBQUcsRUFBRSxPQUFPLElBQUksR0FBRyxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQ2pFLGdCQUFRO0FBQUEsTUFDVCxDQUFDLENBQUM7QUFHRixpQkFBVyxPQUFPO0FBQUEsSUFDbkIsQ0FBQztBQUdELGVBQVcsT0FBTztBQUdsQixXQUFPLFlBQVksVUFBVSxjQUFjLFFBQVEsQ0FBQztBQUFBLEVBQ3JELENBQUM7QUFFRCxPQUFLLDJFQUEyRSxZQUFZO0FBQzNGLFVBQU0sWUFBWSxNQUFNLElBQUksV0FBVyxnQkFBZ0IsQ0FBQztBQUd4RCxVQUFNLHVCQUF5QyxDQUFDO0FBQ2hELFVBQU0sSUFBSSxVQUFVLGtCQUFrQixXQUFTLHFCQUFxQixLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFFbkYsY0FBVSxLQUFLO0FBRWYsVUFBTSxPQUFPLEVBQUUsT0FBTyxTQUFTO0FBQy9CLGNBQVUsUUFBUSxDQUFDLElBQUk7QUFFdkIsV0FBTyxZQUFZLHFCQUFxQixRQUFRLENBQUM7QUFDakQsV0FBTyxZQUFZLHFCQUFxQixDQUFDLEdBQUcsSUFBSTtBQUNoRCxXQUFPLFlBQVksVUFBVSxZQUFZLFFBQVEsQ0FBQztBQUNsRCxXQUFPLFlBQVksVUFBVSxZQUFZLENBQUMsR0FBRyxJQUFJO0FBQUEsRUFDbEQsQ0FBQztBQUVELE9BQUssZ0hBQWdILFlBQVk7QUFDaEksVUFBTSxZQUFZLE1BQU0sSUFBSSxXQUFXLGdCQUFnQixDQUFDO0FBQ3hELFVBQU0sT0FBTyxFQUFFLE9BQU8sU0FBUztBQUMvQixjQUFVLFFBQVEsQ0FBQyxJQUFJO0FBQ3ZCLGNBQVUsS0FBSztBQUNmLFdBQU8sWUFBWSxVQUFVLFlBQVksQ0FBQyxHQUFHLElBQUk7QUFHakQsVUFBTSx1QkFBeUMsQ0FBQztBQUNoRCxVQUFNLElBQUksVUFBVSxrQkFBa0IsV0FBUyxxQkFBcUIsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBR25GLGNBQVUsaUJBQWlCLGVBQWU7QUFDMUMsY0FBVSxRQUFRLENBQUMsSUFBSTtBQUV2QixXQUFPLFlBQVkscUJBQXFCLFFBQVEsQ0FBQztBQUNqRCxXQUFPLFlBQVksVUFBVSxZQUFZLFFBQVEsQ0FBQztBQUFBLEVBQ25ELENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFdBQU8sWUFBWSxjQUFjLFdBQVcsR0FBRyxLQUFLO0FBQ3BELFdBQU8sWUFBWSxjQUFjLEVBQUUsU0FBUyxPQUFPLEtBQUssT0FBTyxPQUFPLE1BQU0sQ0FBQyxHQUFHLEtBQUs7QUFBQSxFQUN0RixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxXQUFPLFlBQVksY0FBYyxFQUFFLFNBQVMsTUFBTSxLQUFLLE9BQU8sT0FBTyxNQUFNLENBQUMsR0FBRyxJQUFJO0FBQ25GLFdBQU8sWUFBWSxjQUFjLEVBQUUsU0FBUyxPQUFPLEtBQUssTUFBTSxPQUFPLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFDbkYsV0FBTyxZQUFZLGNBQWMsRUFBRSxTQUFTLE9BQU8sS0FBSyxPQUFPLE9BQU8sS0FBSyxDQUFDLEdBQUcsSUFBSTtBQUNuRixXQUFPLFlBQVksY0FBYyxFQUFFLFNBQVMsTUFBTSxLQUFLLE1BQU0sT0FBTyxLQUFLLENBQUMsR0FBRyxJQUFJO0FBQUEsRUFDbEYsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
