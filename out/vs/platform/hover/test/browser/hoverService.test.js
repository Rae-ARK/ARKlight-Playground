import * as assert from "assert";
import { Event } from "../../../../base/common/event.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { timeout } from "../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { HoverService } from "../../browser/hoverService.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../browser/hover.js";
import { IContextMenuService } from "../../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IAccessibilityService } from "../../../accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../accessibility/test/common/testAccessibilityService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { NoMatchingKb } from "../../../keybinding/common/keybindingResolver.js";
import { IMarkdownRendererService } from "../../../markdown/browser/markdownRenderer.js";
suite("HoverService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let hoverService;
  let fixture;
  let instantiationService;
  setup(() => {
    fixture = document.createElement("div");
    mainWindow.document.body.appendChild(fixture);
    store.add(toDisposable(() => fixture.remove()));
    instantiationService = store.add(new TestInstantiationService());
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration("workbench.hover.delay", 0);
    configurationService.setUserConfiguration("workbench.hover.reducedDelay", 0);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IContextMenuService, {
      onDidShowContextMenu: Event.None
    });
    instantiationService.stub(IKeybindingService, {
      mightProducePrintableCharacter() {
        return false;
      },
      softDispatch() {
        return NoMatchingKb;
      },
      resolveKeyboardEvent() {
        return {
          getLabel() {
            return "";
          },
          getAriaLabel() {
            return "";
          },
          getElectronAccelerator() {
            return null;
          },
          getUserSettingsLabel() {
            return null;
          },
          isWYSIWYG() {
            return false;
          },
          hasMultipleChords() {
            return false;
          },
          getDispatchChords() {
            return [null];
          },
          getSingleModifierDispatchChords() {
            return [];
          },
          getChords() {
            return [];
          }
        };
      }
    });
    instantiationService.stub(ILayoutService, {
      activeContainer: fixture,
      mainContainer: fixture,
      getContainer() {
        return fixture;
      },
      onDidLayoutContainer: Event.None
    });
    instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
    instantiationService.stub(IMarkdownRendererService, {
      render() {
        return { element: document.createElement("div"), dispose() {
        } };
      },
      setDefaultCodeBlockRenderer() {
      }
    });
    hoverService = store.add(instantiationService.createInstance(HoverService));
    instantiationService.stub(IHoverService, hoverService);
  });
  function createTarget() {
    const target = document.createElement("div");
    target.style.width = "100px";
    target.style.height = "100px";
    fixture.appendChild(target);
    return target;
  }
  function showHover(content, target, options) {
    const hover = hoverService.showInstantHover({
      content,
      target: target ?? createTarget(),
      ...options
    });
    assert.ok(hover, `Hover with content "${content}" should be created`);
    return hover;
  }
  function asHoverWidget(hover) {
    return hover;
  }
  function isInDOM(hover) {
    return mainWindow.document.body.contains(asHoverWidget(hover).domNode);
  }
  function assertInDOM(hover, message) {
    assert.ok(isInDOM(hover), message ?? "Hover should be in the DOM");
  }
  function assertNotInDOM(hover, message) {
    assert.ok(!isInDOM(hover), message ?? "Hover should not be in the DOM");
  }
  function createNestedHover(parentHover, content) {
    const nestedTarget = document.createElement("div");
    asHoverWidget(parentHover).domNode.appendChild(nestedTarget);
    return showHover(content, nestedTarget);
  }
  function createHoverChain(depth) {
    const hovers = [];
    let currentTarget = createTarget();
    for (let i = 0; i < depth; i++) {
      const hover = hoverService.showInstantHover({
        content: `Hover ${i + 1}`,
        target: currentTarget
      });
      if (!hover) {
        break;
      }
      hovers.push(asHoverWidget(hover));
      currentTarget = document.createElement("div");
      asHoverWidget(hover).domNode.appendChild(currentTarget);
    }
    return hovers;
  }
  function disposeHovers(hovers) {
    for (const h of [...hovers].reverse()) {
      h?.dispose();
    }
  }
  suite("showInstantHover", () => {
    test("should not show hover with empty content", () => {
      const target = createTarget();
      const hover = hoverService.showInstantHover({
        content: "",
        target
      });
      assert.strictEqual(hover, void 0, "Hover should not be created for empty content");
    });
    test("should call onDidShow callback when hover is shown", () => {
      const target = createTarget();
      let didShowCalled = false;
      const hover = hoverService.showInstantHover({
        content: "Test",
        target,
        onDidShow: () => {
          didShowCalled = true;
        }
      });
      assert.ok(didShowCalled, "onDidShow should be called");
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM after showing");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
    test("should call onDidHide exactly once when hover is disposed", () => {
      const target = createTarget();
      let didHideCount = 0;
      const hover = hoverService.showInstantHover({
        content: "Test",
        target,
        onDidHide: () => {
          didHideCount++;
        }
      });
      assert.ok(hover);
      hover.dispose();
      hover.dispose();
      assert.strictEqual(didHideCount, 1);
    });
    test("should call onDidHide when hover is hidden during onDidShow", () => {
      const target = createTarget();
      const calls = [];
      hoverService.showInstantHover({
        content: "Test",
        target,
        onDidShow: () => {
          calls.push("show");
          hoverService.hideHover(true);
        },
        onDidHide: () => {
          calls.push("hide");
        }
      });
      assert.deepStrictEqual(calls, ["show", "hide"]);
    });
    test("should deduplicate hovers by id", () => {
      const target = createTarget();
      const hover1 = hoverService.showInstantHover({
        content: "Same content",
        target,
        id: "same-id"
      });
      const hover2 = hoverService.showInstantHover({
        content: "Same content",
        target,
        id: "same-id"
      });
      assert.ok(hover1, "First hover should be created");
      assertInDOM(hover1, "First hover should be in DOM");
      assert.strictEqual(hover2, void 0, "Second hover with same id should not be created");
      const hover3 = hoverService.showInstantHover({
        content: "Content 3",
        target,
        id: "different-id"
      });
      assert.ok(hover3, "Hover with different id should be created");
      assertInDOM(hover3, "Third hover should be in DOM");
      hover1?.dispose();
      hover3?.dispose();
    });
    test("should apply additional classes to hover DOM", () => {
      const hover = showHover("Test", void 0, {
        additionalClasses: ["custom-class-1", "custom-class-2"]
      });
      const domNode = asHoverWidget(hover).domNode;
      assertInDOM(hover, "Hover should be in DOM");
      assert.ok(domNode.classList.contains("custom-class-1"), "Should have custom-class-1");
      assert.ok(domNode.classList.contains("custom-class-2"), "Should have custom-class-2");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
  });
  suite("hideHover", () => {
    test("should hide non-locked hover", () => {
      const hover = showHover("Test");
      assertInDOM(hover, "Hover should be in DOM initially");
      hoverService.hideHover();
      assert.strictEqual(hover.isDisposed, true, "Hover should be disposed after hideHover");
      assertNotInDOM(hover, "Hover should be removed from DOM after hideHover");
    });
    test("should not hide locked hover without force flag", () => {
      const hover = showHover("Test", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(hover, "Locked hover should be in DOM");
      hoverService.hideHover();
      assert.strictEqual(hover.isDisposed, false, "Locked hover should not be disposed without force");
      assertInDOM(hover, "Locked hover should remain in DOM");
      hoverService.hideHover(true);
      assert.strictEqual(hover.isDisposed, true, "Locked hover should be disposed with force=true");
      assertNotInDOM(hover, "Locked hover should be removed from DOM with force");
    });
  });
  suite("nested hovers", () => {
    test("should keep parent hover visible when nested hover is created", () => {
      const parentHover = showHover("Parent");
      assertInDOM(parentHover, "Parent hover should be in DOM");
      const nestedHover = createNestedHover(parentHover, "Nested");
      assertInDOM(nestedHover, "Nested hover should be in DOM");
      assertInDOM(parentHover, "Parent hover should still be in DOM after nested hover created");
      assert.strictEqual(parentHover.isDisposed, false, "Parent hover should remain visible");
      assert.strictEqual(nestedHover.isDisposed, false, "Nested hover should be visible");
      nestedHover.dispose();
      assertNotInDOM(nestedHover, "Nested hover should be removed from DOM after dispose");
      assertInDOM(parentHover, "Parent hover should remain in DOM after nested is disposed");
      parentHover.dispose();
      assertNotInDOM(parentHover, "Parent hover should be removed from DOM after dispose");
    });
    test("should dispose nested hover when parent is disposed", () => {
      const parentHover = showHover("Parent");
      const nestedHover = createNestedHover(parentHover, "Nested");
      assertInDOM(parentHover, "Parent hover should be in DOM");
      assertInDOM(nestedHover, "Nested hover should be in DOM");
      parentHover.dispose();
      assert.strictEqual(nestedHover.isDisposed, true, "Nested hover should be disposed when parent is disposed");
      assertNotInDOM(parentHover, "Parent hover should be removed from DOM");
      assertNotInDOM(nestedHover, "Nested hover should be removed from DOM when parent is disposed");
    });
    test("should dispose entire hover chain when root is disposed", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create 3 hovers");
      for (let i = 0; i < hovers.length; i++) {
        assert.ok(mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be in DOM`);
      }
      hovers[0].dispose();
      for (let i = 0; i < hovers.length; i++) {
        assert.strictEqual(hovers[i].isDisposed, true, `Hover ${i + 1} should be disposed`);
        assert.ok(!mainWindow.document.body.contains(hovers[i].domNode), `Hover ${i + 1} should be removed from DOM`);
      }
    });
    test("should dispose only nested hovers when middle hover is disposed", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create 3 hovers");
      for (const h of hovers) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "All hovers should be in DOM initially");
      }
      hovers[1].dispose();
      assert.strictEqual(hovers[0].isDisposed, false, "Root hover should remain");
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Root hover should remain in DOM");
      assert.strictEqual(hovers[1].isDisposed, true, "Middle hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), "Middle hover should be removed from DOM");
      assert.strictEqual(hovers[2].isDisposed, true, "Innermost hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[2].domNode), "Innermost hover should be removed from DOM");
      hovers[0].dispose();
    });
    test("should enforce maximum nesting depth", () => {
      const hovers = createHoverChain(3);
      assert.strictEqual(hovers.length, 3, "Should create exactly 3 hovers (max depth)");
      for (const h of hovers) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "Hover should be in DOM");
      }
      const nestedTarget = document.createElement("div");
      hovers[2].domNode.appendChild(nestedTarget);
      const fourthHover = hoverService.showInstantHover({
        content: "Hover 4",
        target: nestedTarget
      });
      assert.strictEqual(fourthHover, void 0, "Fourth hover should not be created due to max nesting depth");
      disposeHovers(hovers);
    });
    test("should allow new hover chain after disposing previous chain", () => {
      const firstChain = createHoverChain(3);
      for (const h of firstChain) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "First chain hover should be in DOM");
      }
      disposeHovers(firstChain);
      for (const h of firstChain) {
        assert.ok(!mainWindow.document.body.contains(h.domNode), "First chain hover should be removed from DOM");
      }
      const secondChain = createHoverChain(3);
      assert.strictEqual(secondChain.length, 3, "Should create new chain after disposing previous");
      for (const h of secondChain) {
        assert.ok(mainWindow.document.body.contains(h.domNode), "Second chain hover should be in DOM");
      }
      disposeHovers(secondChain);
    });
    test("hideHover should close innermost hover first", () => {
      const hovers = createHoverChain(2);
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should be in DOM");
      assert.ok(mainWindow.document.body.contains(hovers[1].domNode), "Inner hover should be in DOM");
      hoverService.hideHover();
      assert.strictEqual(hovers[1].isDisposed, true, "Innermost hover should be disposed");
      assert.ok(!mainWindow.document.body.contains(hovers[1].domNode), "Innermost hover should be removed from DOM");
      assert.strictEqual(hovers[0].isDisposed, false, "Outer hover should remain");
      assert.ok(mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should remain in DOM");
      hoverService.hideHover();
      assert.strictEqual(hovers[0].isDisposed, true, "Outer hover should be disposed on second call");
      assert.ok(!mainWindow.document.body.contains(hovers[0].domNode), "Outer hover should be removed from DOM");
    });
  });
  suite("setupDelayedHover", () => {
    test("should evaluate function options on mouseover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      let callCount = 0;
      const disposable = hoverService.setupDelayedHover(target, () => {
        callCount++;
        return { content: `Call ${callCount}` };
      });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      assert.strictEqual(callCount, 1, "Options function should be called on first mouseover");
      await timeout(0);
      hoverService.hideHover(true);
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      assert.strictEqual(callCount, 2, "Options function should be called on second mouseover");
      await timeout(0);
      disposable.dispose();
      hoverService.hideHover(true);
    }));
    test("should not call onDidHide when delayed hover is never shown", () => {
      const target = createTarget();
      let didHideCount = 0;
      const disposable = hoverService.setupDelayedHover(target, {
        content: "Test",
        onDidHide: () => {
          didHideCount++;
        }
      });
      disposable.dispose();
      assert.strictEqual(didHideCount, 0);
    });
    test("should use reduced delay when reducedDelay is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      instantiationService.get(IConfigurationService).setUserConfiguration("workbench.hover.reducedDelay", 150);
      const disposable = hoverService.setupDelayedHover(target, { content: "Reduced delay" }, { reducedDelay: true });
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await timeout(75);
      const hoversBefore = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversBefore.length, 0, "Hover should not be visible before delay completes");
      await timeout(150);
      const hoversAfter = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversAfter.length, 1, "Hover should be visible after reduced delay");
      disposable.dispose();
      hoverService.hideHover(true);
    }));
  });
  suite("setupManagedHover", () => {
    test("should use native title attribute when showNativeHover is true", () => {
      const target = createTarget();
      const hover = hoverService.setupManagedHover(
        { showHover: () => void 0, delay: 0, showNativeHover: true },
        target,
        "Native hover content"
      );
      assert.strictEqual(target.getAttribute("title"), "Native hover content");
      hover.dispose();
      assert.strictEqual(target.getAttribute("title"), null, "Title should be removed on dispose");
    });
    test("should update content dynamically", async () => {
      const target = createTarget();
      const hover = hoverService.setupManagedHover(
        { showHover: () => void 0, delay: 0, showNativeHover: true },
        target,
        "Initial"
      );
      assert.strictEqual(target.getAttribute("title"), "Initial");
      await hover.update("Updated");
      assert.strictEqual(target.getAttribute("title"), "Updated");
      await hover.update("Final");
      assert.strictEqual(target.getAttribute("title"), "Final");
      hover.dispose();
    });
    test("should not re-show hover on focus when relatedTarget is from a dismissed hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const delegate = store.add(instantiationService.createInstance(WorkbenchHoverDelegate, "element", void 0, {}));
      store.add(hoverService.setupManagedHover(delegate, target, "Test"));
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: document.body }));
      await timeout(500);
      const hoversBefore = fixture.querySelectorAll(".monaco-hover");
      assert.ok(hoversBefore.length > 0, "Hover should be visible after focus");
      hoverService.hideHover(true);
      await timeout(0);
      const hoverElement = document.createElement("div");
      hoverElement.classList.add("monaco-hover");
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: hoverElement }));
      await timeout(500);
      const hoversAfter = fixture.querySelectorAll(".monaco-hover");
      assert.strictEqual(hoversAfter.length, 0, "Hover should not re-show when focus comes from dismissed hover");
    }));
    test("should not re-show hover on focus when relatedTarget is null (window reactivation)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const delegate = store.add(instantiationService.createInstance(WorkbenchHoverDelegate, "element", void 0, {}));
      store.add(hoverService.setupManagedHover(delegate, target, "Test"));
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: document.body }));
      await timeout(500);
      hoverService.hideHover(true);
      await timeout(0);
      target.dispatchEvent(new FocusEvent("focus", { bubbles: true, relatedTarget: null }));
      await timeout(500);
      const hovers = fixture.querySelectorAll(".monaco-hover");
      assert.strictEqual(hovers.length, 0, "Hover should not re-show on window reactivation");
    }));
  });
  suite("showDelayedHover", () => {
    test("should reject hover when current hover is locked and target is outside", () => {
      const lockedHover = showHover("Locked", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(lockedHover, "Locked hover should be in DOM");
      const otherTarget = createTarget();
      const rejectedHover = hoverService.showDelayedHover({
        content: "Should not show",
        target: otherTarget
      }, {});
      assert.strictEqual(rejectedHover, void 0, "Should reject hover when locked hover exists");
      assertInDOM(lockedHover, "Locked hover should remain in DOM after rejection");
      lockedHover.dispose();
      assertNotInDOM(lockedHover, "Locked hover should be removed from DOM after dispose");
    });
    test("should use reduced delay when reducedDelay is true", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const reducedDelay = 100;
      instantiationService.get(IConfigurationService).setUserConfiguration("workbench.hover.reducedDelay", reducedDelay);
      const hover = hoverService.showDelayedHover({
        content: "Reduced delay hover",
        target
      }, { reducedDelay: true });
      assert.ok(hover, "Hover should be created");
      assertNotInDOM(hover, "Hover should not be visible immediately");
      await timeout(reducedDelay / 2);
      assertNotInDOM(hover, "Hover should not be visible before delay completes");
      await timeout(reducedDelay);
      assertInDOM(hover, "Hover should be visible after reduced delay");
      hover.dispose();
    }));
    test("should use default delay when custom delay is undefined", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const hover = hoverService.showDelayedHover({
        content: "Default delay hover",
        target
      }, {});
      assert.ok(hover, "Hover should be created");
      await timeout(0);
      assertInDOM(hover, "Hover should be visible with default delay");
      hover.dispose();
    }));
  });
  suite("hover locking", () => {
    test("isLocked should be settable on hover widget", () => {
      const hover = showHover("Test");
      const widget = asHoverWidget(hover);
      assertInDOM(hover, "Hover should be in DOM");
      assert.strictEqual(widget.isLocked, false, "Should not be locked initially");
      widget.isLocked = true;
      assert.strictEqual(widget.isLocked, true, "Should be locked after setting");
      assertInDOM(hover, "Hover should remain in DOM after locking");
      widget.isLocked = false;
      assert.strictEqual(widget.isLocked, false, "Should be unlocked after unsetting");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    });
    test("sticky option should set isLocked to true", () => {
      const hover = showHover("Test", void 0, {
        persistence: { sticky: true }
      });
      assertInDOM(hover, "Sticky hover should be in DOM");
      assert.strictEqual(asHoverWidget(hover).isLocked, true, "Should be locked when sticky");
      hover.dispose();
      assertNotInDOM(hover, "Sticky hover should be removed from DOM after dispose");
    });
  });
  suite("showAndFocusLastHover", () => {
    test("should recreate last disposed hover", () => {
      const target = createTarget();
      const hover = hoverService.showInstantHover({
        content: "Remember me",
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Initial hover should be in DOM");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
      hoverService.showAndFocusLastHover();
      const hoverElements = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.ok(hoverElements.length > 0, "A hover should be recreated and in the DOM");
      hoverService.hideHover(true);
      const remainingHovers = mainWindow.document.querySelectorAll(".monaco-hover");
      assert.strictEqual(remainingHovers.length, 0, "No hovers should remain in DOM after cleanup");
    });
  });
  suite("layout and resize", () => {
    test("layout should suppress pending mouseout so content resize does not dismiss hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Resizable content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      widget.layout();
      await timeout(300);
      assertInDOM(hover, "Hover should remain in DOM after layout suppresses mouseout");
      hover.dispose();
      assertNotInDOM(hover, "Hover should be removed from DOM after dispose");
    }));
    test.skip("hover should still dismiss on mouseout when no layout occurs", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await timeout(300);
      assertNotInDOM(hover, "Hover should be dismissed after mouseout without layout");
    }));
    test.skip("suppression clears after mouse re-enters and a new mouseleave dismisses normally", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Resizable content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      const widget = asHoverWidget(hover);
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      widget.layout();
      await timeout(300);
      assertInDOM(hover, "Hover should remain after suppressed mouseout");
      widget.domNode.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      widget.domNode.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await timeout(300);
      assertNotInDOM(hover, "Hover should dismiss on normal mouseout after suppression was cleared");
    }));
    test("clicking outside should dismiss non-sticky hover", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const target = createTarget();
      const content = document.createElement("div");
      content.textContent = "Content";
      const hover = hoverService.showInstantHover({
        content,
        target
      });
      assert.ok(hover);
      assertInDOM(hover, "Hover should be in DOM");
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      assertNotInDOM(hover, "Non-sticky hover should be dismissed after clicking outside");
    }));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2hvdmVyL3Rlc3QvYnJvd3Nlci9ob3ZlclNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ob3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS90ZXN0L2NvbW1vbi90ZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgTm9NYXRjaGluZ0tiIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElIb3ZlcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbnN1aXRlKCdIb3ZlclNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBob3ZlclNlcnZpY2U6IEhvdmVyU2VydmljZTtcblx0bGV0IGZpeHR1cmU6IEhUTUxFbGVtZW50O1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Zml4dHVyZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChmaXh0dXJlKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGZpeHR1cmUucmVtb3ZlKCkpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmhvdmVyLmRlbGF5JywgMCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5ob3Zlci5yZWR1Y2VkRGVsYXknLCAwKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRvbkRpZFNob3dDb250ZXh0TWVudTogRXZlbnQuTm9uZVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJS2V5YmluZGluZ1NlcnZpY2UsIHtcblx0XHRcdG1pZ2h0UHJvZHVjZVByaW50YWJsZUNoYXJhY3RlcigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuXHRcdFx0c29mdERpc3BhdGNoKCkgeyByZXR1cm4gTm9NYXRjaGluZ0tiOyB9LFxuXHRcdFx0cmVzb2x2ZUtleWJvYXJkRXZlbnQoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Z2V0TGFiZWwoKSB7IHJldHVybiAnJzsgfSxcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoKSB7IHJldHVybiAnJzsgfSxcblx0XHRcdFx0XHRnZXRFbGVjdHJvbkFjY2VsZXJhdG9yKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0XHRcdFx0XHRnZXRVc2VyU2V0dGluZ3NMYWJlbCgpIHsgcmV0dXJuIG51bGw7IH0sXG5cdFx0XHRcdFx0aXNXWVNJV1lHKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0XHRcdFx0aGFzTXVsdGlwbGVDaG9yZHMoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0XHRcdFx0XHRnZXREaXNwYXRjaENob3JkcygpIHsgcmV0dXJuIFtudWxsXTsgfSxcblx0XHRcdFx0XHRnZXRTaW5nbGVNb2RpZmllckRpc3BhdGNoQ2hvcmRzKCkgeyByZXR1cm4gW107IH0sXG5cdFx0XHRcdFx0Z2V0Q2hvcmRzKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxheW91dFNlcnZpY2UsIHtcblx0XHRcdGFjdGl2ZUNvbnRhaW5lcjogZml4dHVyZSxcblx0XHRcdG1haW5Db250YWluZXI6IGZpeHR1cmUsXG5cdFx0XHRnZXRDb250YWluZXIoKSB7IHJldHVybiBmaXh0dXJlOyB9LFxuXHRcdFx0b25EaWRMYXlvdXRDb250YWluZXI6IEV2ZW50Lk5vbmVcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBuZXcgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIHtcblx0XHRcdHJlbmRlcigpIHsgcmV0dXJuIHsgZWxlbWVudDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksIGRpc3Bvc2UoKSB7IH0gfTsgfSxcblx0XHRcdHNldERlZmF1bHRDb2RlQmxvY2tSZW5kZXJlcigpIHsgfVxuXHRcdH0pO1xuXG5cdFx0aG92ZXJTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEhvdmVyU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fSk7XG5cblx0Ly8gI3JlZ2lvbiBIZWxwZXIgZnVuY3Rpb25zXG5cblx0ZnVuY3Rpb24gY3JlYXRlVGFyZ2V0KCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCB0YXJnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSAnMTAwcHgnO1xuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSAnMTAwcHgnO1xuXHRcdGZpeHR1cmUuYXBwZW5kQ2hpbGQodGFyZ2V0KTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2hvd0hvdmVyKGNvbnRlbnQ6IHN0cmluZywgdGFyZ2V0PzogSFRNTEVsZW1lbnQsIG9wdGlvbnM/OiBQYXJ0aWFsPFBhcmFtZXRlcnM8dHlwZW9mIGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyPlswXT4pOiBJSG92ZXJXaWRnZXQge1xuXHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Y29udGVudCxcblx0XHRcdHRhcmdldDogdGFyZ2V0ID8/IGNyZWF0ZVRhcmdldCgpLFxuXHRcdFx0Li4ub3B0aW9uc1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhob3ZlciwgYEhvdmVyIHdpdGggY29udGVudCBcIiR7Y29udGVudH1cIiBzaG91bGQgYmUgY3JlYXRlZGApO1xuXHRcdHJldHVybiBob3Zlcjtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzSG92ZXJXaWRnZXQoaG92ZXI6IElIb3ZlcldpZGdldCk6IEhvdmVyV2lkZ2V0IHtcblx0XHRyZXR1cm4gaG92ZXIgYXMgSG92ZXJXaWRnZXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2tzIGlmIGEgaG92ZXIncyBET00gbm9kZSBpcyBwcmVzZW50IGluIHRoZSBkb2N1bWVudC5cblx0ICovXG5cdGZ1bmN0aW9uIGlzSW5ET00oaG92ZXI6IElIb3ZlcldpZGdldCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoYXNIb3ZlcldpZGdldChob3ZlcikuZG9tTm9kZSk7XG5cdH1cblxuXHQvKipcblx0ICogQXNzZXJ0cyB0aGF0IGEgaG92ZXIgaXMgaW4gdGhlIERPTS5cblx0ICovXG5cdGZ1bmN0aW9uIGFzc2VydEluRE9NKGhvdmVyOiBJSG92ZXJXaWRnZXQsIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRhc3NlcnQub2soaXNJbkRPTShob3ZlciksIG1lc3NhZ2UgPz8gJ0hvdmVyIHNob3VsZCBiZSBpbiB0aGUgRE9NJyk7XG5cdH1cblxuXHQvKipcblx0ICogQXNzZXJ0cyB0aGF0IGEgaG92ZXIgaXMgTk9UIGluIHRoZSBET00uXG5cdCAqL1xuXHRmdW5jdGlvbiBhc3NlcnROb3RJbkRPTShob3ZlcjogSUhvdmVyV2lkZ2V0LCBtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0YXNzZXJ0Lm9rKCFpc0luRE9NKGhvdmVyKSwgbWVzc2FnZSA/PyAnSG92ZXIgc2hvdWxkIG5vdCBiZSBpbiB0aGUgRE9NJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5lc3RlZCBob3ZlciBieSBhcHBlbmRpbmcgYSB0YXJnZXQgZWxlbWVudCBpbnNpZGUgdGhlIHBhcmVudCBob3ZlcidzIERPTS5cblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZU5lc3RlZEhvdmVyKHBhcmVudEhvdmVyOiBJSG92ZXJXaWRnZXQsIGNvbnRlbnQ6IHN0cmluZyk6IElIb3ZlcldpZGdldCB7XG5cdFx0Y29uc3QgbmVzdGVkVGFyZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YXNIb3ZlcldpZGdldChwYXJlbnRIb3ZlcikuZG9tTm9kZS5hcHBlbmRDaGlsZChuZXN0ZWRUYXJnZXQpO1xuXHRcdHJldHVybiBzaG93SG92ZXIoY29udGVudCwgbmVzdGVkVGFyZ2V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgY2hhaW4gb2YgbmVzdGVkIGhvdmVycyB1cCB0byB0aGUgc3BlY2lmaWVkIGRlcHRoLlxuXHQgKiBSZXR1cm5zIHRoZSBhcnJheSBvZiBob3ZlcnMgZnJvbSBvdXRlcm1vc3QgdG8gaW5uZXJtb3N0LlxuXHQgKi9cblx0ZnVuY3Rpb24gY3JlYXRlSG92ZXJDaGFpbihkZXB0aDogbnVtYmVyKTogSG92ZXJXaWRnZXRbXSB7XG5cdFx0Y29uc3QgaG92ZXJzOiBIb3ZlcldpZGdldFtdID0gW107XG5cdFx0bGV0IGN1cnJlbnRUYXJnZXQ6IEhUTUxFbGVtZW50ID0gY3JlYXRlVGFyZ2V0KCk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRlcHRoOyBpKyspIHtcblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiBgSG92ZXIgJHtpICsgMX1gLFxuXHRcdFx0XHR0YXJnZXQ6IGN1cnJlbnRUYXJnZXRcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFob3Zlcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGhvdmVycy5wdXNoKGFzSG92ZXJXaWRnZXQoaG92ZXIpKTtcblx0XHRcdGN1cnJlbnRUYXJnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGFzSG92ZXJXaWRnZXQoaG92ZXIpLmRvbU5vZGUuYXBwZW5kQ2hpbGQoY3VycmVudFRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhvdmVycztcblx0fVxuXG5cdGZ1bmN0aW9uIGRpc3Bvc2VIb3ZlcnMoaG92ZXJzOiBIb3ZlcldpZGdldFtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBoIG9mIFsuLi5ob3ZlcnNdLnJldmVyc2UoKSkge1xuXHRcdFx0aD8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRzdWl0ZSgnc2hvd0luc3RhbnRIb3ZlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3cgaG92ZXIgd2l0aCBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgdW5kZWZpbmVkLCAnSG92ZXIgc2hvdWxkIG5vdCBiZSBjcmVhdGVkIGZvciBlbXB0eSBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY2FsbCBvbkRpZFNob3cgY2FsbGJhY2sgd2hlbiBob3ZlciBpcyBzaG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0bGV0IGRpZFNob3dDYWxsZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdUZXN0Jyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRvbkRpZFNob3c6ICgpID0+IHsgZGlkU2hvd0NhbGxlZCA9IHRydWU7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZGlkU2hvd0NhbGxlZCwgJ29uRGlkU2hvdyBzaG91bGQgYmUgY2FsbGVkJyk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NIGFmdGVyIHNob3dpbmcnKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY2FsbCBvbkRpZEhpZGUgZXhhY3RseSBvbmNlIHdoZW4gaG92ZXIgaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGxldCBkaWRIaWRlQ291bnQgPSAwO1xuXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJ1Rlc3QnLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdG9uRGlkSGlkZTogKCkgPT4geyBkaWRIaWRlQ291bnQrKzsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhob3Zlcik7XG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRIaWRlQ291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNhbGwgb25EaWRIaWRlIHdoZW4gaG92ZXIgaXMgaGlkZGVuIGR1cmluZyBvbkRpZFNob3cnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdUZXN0Jyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRvbkRpZFNob3c6ICgpID0+IHtcblx0XHRcdFx0XHRjYWxscy5wdXNoKCdzaG93Jyk7XG5cdFx0XHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25EaWRIaWRlOiAoKSA9PiB7IGNhbGxzLnB1c2goJ2hpZGUnKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnc2hvdycsICdoaWRlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlZHVwbGljYXRlIGhvdmVycyBieSBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXG5cdFx0XHRjb25zdCBob3ZlcjEgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdTYW1lIGNvbnRlbnQnLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdGlkOiAnc2FtZS1pZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBob3ZlcjIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdTYW1lIGNvbnRlbnQnLFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdGlkOiAnc2FtZS1pZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaG92ZXIxLCAnRmlyc3QgaG92ZXIgc2hvdWxkIGJlIGNyZWF0ZWQnKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyMSwgJ0ZpcnN0IGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcjIsIHVuZGVmaW5lZCwgJ1NlY29uZCBob3ZlciB3aXRoIHNhbWUgaWQgc2hvdWxkIG5vdCBiZSBjcmVhdGVkJyk7XG5cblx0XHRcdC8vIERpZmZlcmVudCBpZCBzaG91bGQgY3JlYXRlIG5ldyBob3ZlclxuXHRcdFx0Y29uc3QgaG92ZXIzID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnQ29udGVudCAzJyxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRpZDogJ2RpZmZlcmVudC1pZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaG92ZXIzLCAnSG92ZXIgd2l0aCBkaWZmZXJlbnQgaWQgc2hvdWxkIGJlIGNyZWF0ZWQnKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyMywgJ1RoaXJkIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0aG92ZXIxPy5kaXNwb3NlKCk7XG5cdFx0XHRob3ZlcjM/LmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhcHBseSBhZGRpdGlvbmFsIGNsYXNzZXMgdG8gaG92ZXIgRE9NJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBzaG93SG92ZXIoJ1Rlc3QnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0YWRkaXRpb25hbENsYXNzZXM6IFsnY3VzdG9tLWNsYXNzLTEnLCAnY3VzdG9tLWNsYXNzLTInXVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRvbU5vZGUgPSBhc0hvdmVyV2lkZ2V0KGhvdmVyKS5kb21Ob2RlO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHRhc3NlcnQub2soZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2N1c3RvbS1jbGFzcy0xJyksICdTaG91bGQgaGF2ZSBjdXN0b20tY2xhc3MtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjdXN0b20tY2xhc3MtMicpLCAnU2hvdWxkIGhhdmUgY3VzdG9tLWNsYXNzLTInKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoaWRlSG92ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhpZGUgbm9uLWxvY2tlZCBob3ZlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvdmVyID0gc2hvd0hvdmVyKCdUZXN0Jyk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00gaW5pdGlhbGx5Jyk7XG5cblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLmlzRGlzcG9zZWQsIHRydWUsICdIb3ZlciBzaG91bGQgYmUgZGlzcG9zZWQgYWZ0ZXIgaGlkZUhvdmVyJyk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NIGFmdGVyIGhpZGVIb3ZlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBoaWRlIGxvY2tlZCBob3ZlciB3aXRob3V0IGZvcmNlIGZsYWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlciA9IHNob3dIb3ZlcignVGVzdCcsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3Zlci5pc0Rpc3Bvc2VkLCBmYWxzZSwgJ0xvY2tlZCBob3ZlciBzaG91bGQgbm90IGJlIGRpc3Bvc2VkIHdpdGhvdXQgZm9yY2UnKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnTG9ja2VkIGhvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIuaXNEaXNwb3NlZCwgdHJ1ZSwgJ0xvY2tlZCBob3ZlciBzaG91bGQgYmUgZGlzcG9zZWQgd2l0aCBmb3JjZT10cnVlJyk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSB3aXRoIGZvcmNlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCduZXN0ZWQgaG92ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIHBhcmVudCBob3ZlciB2aXNpYmxlIHdoZW4gbmVzdGVkIGhvdmVyIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnRIb3ZlciA9IHNob3dIb3ZlcignUGFyZW50Jyk7XG5cdFx0XHRhc3NlcnRJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGNvbnN0IG5lc3RlZEhvdmVyID0gY3JlYXRlTmVzdGVkSG92ZXIocGFyZW50SG92ZXIsICdOZXN0ZWQnKTtcblx0XHRcdGFzc2VydEluRE9NKG5lc3RlZEhvdmVyLCAnTmVzdGVkIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdGFzc2VydEluRE9NKHBhcmVudEhvdmVyLCAnUGFyZW50IGhvdmVyIHNob3VsZCBzdGlsbCBiZSBpbiBET00gYWZ0ZXIgbmVzdGVkIGhvdmVyIGNyZWF0ZWQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudEhvdmVyLmlzRGlzcG9zZWQsIGZhbHNlLCAnUGFyZW50IGhvdmVyIHNob3VsZCByZW1haW4gdmlzaWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5lc3RlZEhvdmVyLmlzRGlzcG9zZWQsIGZhbHNlLCAnTmVzdGVkIGhvdmVyIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cblx0XHRcdG5lc3RlZEhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKG5lc3RlZEhvdmVyLCAnTmVzdGVkIGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NIGFmdGVyIGRpc3Bvc2UnKTtcblx0XHRcdGFzc2VydEluRE9NKHBhcmVudEhvdmVyLCAnUGFyZW50IGhvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NIGFmdGVyIG5lc3RlZCBpcyBkaXNwb3NlZCcpO1xuXG5cdFx0XHRwYXJlbnRIb3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShwYXJlbnRIb3ZlciwgJ1BhcmVudCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBuZXN0ZWQgaG92ZXIgd2hlbiBwYXJlbnQgaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnRIb3ZlciA9IHNob3dIb3ZlcignUGFyZW50Jyk7XG5cdFx0XHRjb25zdCBuZXN0ZWRIb3ZlciA9IGNyZWF0ZU5lc3RlZEhvdmVyKHBhcmVudEhvdmVyLCAnTmVzdGVkJyk7XG5cblx0XHRcdGFzc2VydEluRE9NKHBhcmVudEhvdmVyLCAnUGFyZW50IGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdGFzc2VydEluRE9NKG5lc3RlZEhvdmVyLCAnTmVzdGVkIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0cGFyZW50SG92ZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmVzdGVkSG92ZXIuaXNEaXNwb3NlZCwgdHJ1ZSwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgZGlzcG9zZWQgd2hlbiBwYXJlbnQgaXMgZGlzcG9zZWQnKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKHBhcmVudEhvdmVyLCAnUGFyZW50IGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NJyk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShuZXN0ZWRIb3ZlciwgJ05lc3RlZCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSB3aGVuIHBhcmVudCBpcyBkaXNwb3NlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgZW50aXJlIGhvdmVyIGNoYWluIHdoZW4gcm9vdCBpcyBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvdmVycyA9IGNyZWF0ZUhvdmVyQ2hhaW4oMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzLmxlbmd0aCwgMywgJ1Nob3VsZCBjcmVhdGUgMyBob3ZlcnMnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGFsbCBob3ZlcnMgYXJlIGluIERPTVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBob3ZlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbaV0uZG9tTm9kZSksIGBIb3ZlciAke2kgKyAxfSBzaG91bGQgYmUgaW4gRE9NYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpc3Bvc2UgdGhlIHJvb3QgaG92ZXJcblx0XHRcdGhvdmVyc1swXS5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFsbCBob3ZlcnMgaW4gdGhlIGNoYWluIHNob3VsZCBiZSBkaXNwb3NlZCBhbmQgcmVtb3ZlZCBmcm9tIERPTVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBob3ZlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc1tpXS5pc0Rpc3Bvc2VkLCB0cnVlLCBgSG92ZXIgJHtpICsgMX0gc2hvdWxkIGJlIGRpc3Bvc2VkYCk7XG5cdFx0XHRcdGFzc2VydC5vayghbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGhvdmVyc1tpXS5kb21Ob2RlKSwgYEhvdmVyICR7aSArIDF9IHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBvbmx5IG5lc3RlZCBob3ZlcnMgd2hlbiBtaWRkbGUgaG92ZXIgaXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlcnMgPSBjcmVhdGVIb3ZlckNoYWluKDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVycy5sZW5ndGgsIDMsICdTaG91bGQgY3JlYXRlIDMgaG92ZXJzJyk7XG5cblx0XHRcdC8vIFZlcmlmeSBhbGwgaG92ZXJzIGFyZSBpbiBET01cblx0XHRcdGZvciAoY29uc3QgaCBvZiBob3ZlcnMpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhoLmRvbU5vZGUpLCAnQWxsIGhvdmVycyBzaG91bGQgYmUgaW4gRE9NIGluaXRpYWxseScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNwb3NlIHRoZSBtaWRkbGUgaG92ZXJcblx0XHRcdGhvdmVyc1sxXS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNbMF0uaXNEaXNwb3NlZCwgZmFsc2UsICdSb290IGhvdmVyIHNob3VsZCByZW1haW4nKTtcblx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzBdLmRvbU5vZGUpLCAnUm9vdCBob3ZlciBzaG91bGQgcmVtYWluIGluIERPTScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzWzFdLmlzRGlzcG9zZWQsIHRydWUsICdNaWRkbGUgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkJyk7XG5cdFx0XHRhc3NlcnQub2soIW1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMV0uZG9tTm9kZSksICdNaWRkbGUgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc1syXS5pc0Rpc3Bvc2VkLCB0cnVlLCAnSW5uZXJtb3N0IGhvdmVyIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaG92ZXJzWzJdLmRvbU5vZGUpLCAnSW5uZXJtb3N0IGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NJyk7XG5cblx0XHRcdGhvdmVyc1swXS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZW5mb3JjZSBtYXhpbXVtIG5lc3RpbmcgZGVwdGgnLCAoKSA9PiB7XG5cdFx0XHQvLyBDcmVhdGUgaG92ZXJzIHVwIHRvIHRoZSBtYXggZGVwdGggKDMpXG5cdFx0XHRjb25zdCBob3ZlcnMgPSBjcmVhdGVIb3ZlckNoYWluKDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVycy5sZW5ndGgsIDMsICdTaG91bGQgY3JlYXRlIGV4YWN0bHkgMyBob3ZlcnMgKG1heCBkZXB0aCknKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGFsbCAzIGhvdmVycyBhcmUgaW4gRE9NXG5cdFx0XHRmb3IgKGNvbnN0IGggb2YgaG92ZXJzKSB7XG5cdFx0XHRcdGFzc2VydC5vayhtYWluV2luZG93LmRvY3VtZW50LmJvZHkuY29udGFpbnMoaC5kb21Ob2RlKSwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJ5IHRvIGNyZWF0ZSBhIDR0aCBuZXN0ZWQgaG92ZXIgLSBzaG91bGQgZmFpbFxuXHRcdFx0Y29uc3QgbmVzdGVkVGFyZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRob3ZlcnNbMl0uZG9tTm9kZS5hcHBlbmRDaGlsZChuZXN0ZWRUYXJnZXQpO1xuXHRcdFx0Y29uc3QgZm91cnRoSG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdIb3ZlciA0Jyxcblx0XHRcdFx0dGFyZ2V0OiBuZXN0ZWRUYXJnZXRcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91cnRoSG92ZXIsIHVuZGVmaW5lZCwgJ0ZvdXJ0aCBob3ZlciBzaG91bGQgbm90IGJlIGNyZWF0ZWQgZHVlIHRvIG1heCBuZXN0aW5nIGRlcHRoJyk7XG5cblx0XHRcdGRpc3Bvc2VIb3ZlcnMoaG92ZXJzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhbGxvdyBuZXcgaG92ZXIgY2hhaW4gYWZ0ZXIgZGlzcG9zaW5nIHByZXZpb3VzIGNoYWluJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIGFuZCBkaXNwb3NlIGEgY2hhaW5cblx0XHRcdGNvbnN0IGZpcnN0Q2hhaW4gPSBjcmVhdGVIb3ZlckNoYWluKDMpO1xuXHRcdFx0Zm9yIChjb25zdCBoIG9mIGZpcnN0Q2hhaW4pIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhoLmRvbU5vZGUpLCAnRmlyc3QgY2hhaW4gaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXHRcdFx0fVxuXHRcdFx0ZGlzcG9zZUhvdmVycyhmaXJzdENoYWluKTtcblx0XHRcdGZvciAoY29uc3QgaCBvZiBmaXJzdENoYWluKSB7XG5cdFx0XHRcdGFzc2VydC5vayghbWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGguZG9tTm9kZSksICdGaXJzdCBjaGFpbiBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG91bGQgYmUgYWJsZSB0byBjcmVhdGUgYSBuZXcgY2hhaW5cblx0XHRcdGNvbnN0IHNlY29uZENoYWluID0gY3JlYXRlSG92ZXJDaGFpbigzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRDaGFpbi5sZW5ndGgsIDMsICdTaG91bGQgY3JlYXRlIG5ldyBjaGFpbiBhZnRlciBkaXNwb3NpbmcgcHJldmlvdXMnKTtcblx0XHRcdGZvciAoY29uc3QgaCBvZiBzZWNvbmRDaGFpbikge1xuXHRcdFx0XHRhc3NlcnQub2sobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGguZG9tTm9kZSksICdTZWNvbmQgY2hhaW4gaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXHRcdFx0fVxuXG5cdFx0XHRkaXNwb3NlSG92ZXJzKHNlY29uZENoYWluKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hpZGVIb3ZlciBzaG91bGQgY2xvc2UgaW5uZXJtb3N0IGhvdmVyIGZpcnN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXJzID0gY3JlYXRlSG92ZXJDaGFpbigyKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGJvdGggYXJlIGluIERPTVxuXHRcdFx0YXNzZXJ0Lm9rKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMF0uZG9tTm9kZSksICdPdXRlciBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cdFx0XHRhc3NlcnQub2sobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGhvdmVyc1sxXS5kb21Ob2RlKSwgJ0lubmVyIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3ZlcigpO1xuXG5cdFx0XHQvLyBJbm5lcm1vc3QgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkIGFuZCByZW1vdmVkIGZyb20gRE9NXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzWzFdLmlzRGlzcG9zZWQsIHRydWUsICdJbm5lcm1vc3QgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkJyk7XG5cdFx0XHRhc3NlcnQub2soIW1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMV0uZG9tTm9kZSksICdJbm5lcm1vc3QgaG92ZXIgc2hvdWxkIGJlIHJlbW92ZWQgZnJvbSBET00nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNbMF0uaXNEaXNwb3NlZCwgZmFsc2UsICdPdXRlciBob3ZlciBzaG91bGQgcmVtYWluJyk7XG5cdFx0XHRhc3NlcnQub2sobWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmNvbnRhaW5zKGhvdmVyc1swXS5kb21Ob2RlKSwgJ091dGVyIGhvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NJyk7XG5cblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc1swXS5pc0Rpc3Bvc2VkLCB0cnVlLCAnT3V0ZXIgaG92ZXIgc2hvdWxkIGJlIGRpc3Bvc2VkIG9uIHNlY29uZCBjYWxsJyk7XG5cdFx0XHRhc3NlcnQub2soIW1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5jb250YWlucyhob3ZlcnNbMF0uZG9tTm9kZSksICdPdXRlciBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2V0dXBEZWxheWVkSG92ZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGV2YWx1YXRlIGZ1bmN0aW9uIG9wdGlvbnMgb24gbW91c2VvdmVyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRhcmdldCwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogYENhbGwgJHtjYWxsQ291bnR9YCB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEZpcnN0IG1vdXNlb3ZlclxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxLCAnT3B0aW9ucyBmdW5jdGlvbiBzaG91bGQgYmUgY2FsbGVkIG9uIGZpcnN0IG1vdXNlb3ZlcicpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblxuXHRcdFx0Ly8gU2Vjb25kIG1vdXNlb3ZlciBzaG91bGQgY2FsbCBmdW5jdGlvbiBhZ2FpblxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAyLCAnT3B0aW9ucyBmdW5jdGlvbiBzaG91bGQgYmUgY2FsbGVkIG9uIHNlY29uZCBtb3VzZW92ZXInKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNhbGwgb25EaWRIaWRlIHdoZW4gZGVsYXllZCBob3ZlciBpcyBuZXZlciBzaG93bicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0bGV0IGRpZEhpZGVDb3VudCA9IDA7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGFyZ2V0LCB7XG5cdFx0XHRcdGNvbnRlbnQ6ICdUZXN0Jyxcblx0XHRcdFx0b25EaWRIaWRlOiAoKSA9PiB7IGRpZEhpZGVDb3VudCsrOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRIaWRlQ291bnQsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSByZWR1Y2VkIGRlbGF5IHdoZW4gcmVkdWNlZERlbGF5IGlzIHRydWUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXG5cdFx0XHQvLyBDb25maWd1cmUgcmVkdWNlZERlbGF5IHRvIDE1MG1zIGZvciB0aGlzIHRlc3Rcblx0XHRcdChpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UpLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guaG92ZXIucmVkdWNlZERlbGF5JywgMTUwKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0YXJnZXQsIHsgY29udGVudDogJ1JlZHVjZWQgZGVsYXknIH0sIHsgcmVkdWNlZERlbGF5OiB0cnVlIH0pO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIG1vdXNlb3ZlclxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlb3ZlcicsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdC8vIEhvdmVyIHNob3VsZCBub3QgYmUgdmlzaWJsZSBiZWZvcmUgZGVsYXlcblx0XHRcdGF3YWl0IHRpbWVvdXQoNzUpO1xuXHRcdFx0Y29uc3QgaG92ZXJzQmVmb3JlID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzQmVmb3JlLmxlbmd0aCwgMCwgJ0hvdmVyIHNob3VsZCBub3QgYmUgdmlzaWJsZSBiZWZvcmUgZGVsYXkgY29tcGxldGVzJyk7XG5cblx0XHRcdC8vIEhvdmVyIHNob3VsZCBiZSB2aXNpYmxlIGFmdGVyIGRlbGF5XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDE1MCk7XG5cdFx0XHRjb25zdCBob3ZlcnNBZnRlciA9IG1haW5XaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1ob3ZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyc0FmdGVyLmxlbmd0aCwgMSwgJ0hvdmVyIHNob3VsZCBiZSB2aXNpYmxlIGFmdGVyIHJlZHVjZWQgZGVsYXknKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRob3ZlclNlcnZpY2UuaGlkZUhvdmVyKHRydWUpO1xuXHRcdH0pKTtcblx0fSk7XG5cblx0c3VpdGUoJ3NldHVwTWFuYWdlZEhvdmVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgbmF0aXZlIHRpdGxlIGF0dHJpYnV0ZSB3aGVuIHNob3dOYXRpdmVIb3ZlciBpcyB0cnVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdFx0eyBzaG93SG92ZXI6ICgpID0+IHVuZGVmaW5lZCwgZGVsYXk6IDAsIHNob3dOYXRpdmVIb3ZlcjogdHJ1ZSB9LFxuXHRcdFx0XHR0YXJnZXQsXG5cdFx0XHRcdCdOYXRpdmUgaG92ZXIgY29udGVudCdcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZ2V0QXR0cmlidXRlKCd0aXRsZScpLCAnTmF0aXZlIGhvdmVyIGNvbnRlbnQnKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmdldEF0dHJpYnV0ZSgndGl0bGUnKSwgbnVsbCwgJ1RpdGxlIHNob3VsZCBiZSByZW1vdmVkIG9uIGRpc3Bvc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1cGRhdGUgY29udGVudCBkeW5hbWljYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRcdHsgc2hvd0hvdmVyOiAoKSA9PiB1bmRlZmluZWQsIGRlbGF5OiAwLCBzaG93TmF0aXZlSG92ZXI6IHRydWUgfSxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHQnSW5pdGlhbCdcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZ2V0QXR0cmlidXRlKCd0aXRsZScpLCAnSW5pdGlhbCcpO1xuXG5cdFx0XHRhd2FpdCBob3Zlci51cGRhdGUoJ1VwZGF0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZ2V0QXR0cmlidXRlKCd0aXRsZScpLCAnVXBkYXRlZCcpO1xuXG5cdFx0XHRhd2FpdCBob3Zlci51cGRhdGUoJ0ZpbmFsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmdldEF0dHJpYnV0ZSgndGl0bGUnKSwgJ0ZpbmFsJyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmUtc2hvdyBob3ZlciBvbiBmb2N1cyB3aGVuIHJlbGF0ZWRUYXJnZXQgaXMgZnJvbSBhIGRpc21pc3NlZCBob3ZlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCBkZWxlZ2F0ZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLCAnZWxlbWVudCcsIHVuZGVmaW5lZCwge30pKTtcblx0XHRcdHN0b3JlLmFkZChob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZGVsZWdhdGUsIHRhcmdldCwgJ1Rlc3QnKSk7XG5cblx0XHRcdC8vIFNob3cgaG92ZXIgZXhwbGljaXRseVxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJywgeyBidWJibGVzOiB0cnVlLCByZWxhdGVkVGFyZ2V0OiBkb2N1bWVudC5ib2R5IH0pKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRcdGNvbnN0IGhvdmVyc0JlZm9yZSA9IGZpeHR1cmUucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1ob3ZlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyc0JlZm9yZS5sZW5ndGggPiAwLCAnSG92ZXIgc2hvdWxkIGJlIHZpc2libGUgYWZ0ZXIgZm9jdXMnKTtcblxuXHRcdFx0Ly8gRGlzbWlzcyB2aWEgaG92ZXJTZXJ2aWNlIChzaW11bGF0ZXMgRXNjIC8gZXh0ZXJuYWwgZGlzbWlzc2FsKVxuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIGZvY3VzIHJldHVybmluZyBmcm9tIHRoZSBob3ZlciBlbGVtZW50XG5cdFx0XHRjb25zdCBob3ZlckVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGhvdmVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28taG92ZXInKTtcblx0XHRcdHRhcmdldC5kaXNwYXRjaEV2ZW50KG5ldyBGb2N1c0V2ZW50KCdmb2N1cycsIHsgYnViYmxlczogdHJ1ZSwgcmVsYXRlZFRhcmdldDogaG92ZXJFbGVtZW50IH0pKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblxuXHRcdFx0Y29uc3QgaG92ZXJzQWZ0ZXIgPSBmaXh0dXJlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28taG92ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcnNBZnRlci5sZW5ndGgsIDAsICdIb3ZlciBzaG91bGQgbm90IHJlLXNob3cgd2hlbiBmb2N1cyBjb21lcyBmcm9tIGRpc21pc3NlZCBob3ZlcicpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcmUtc2hvdyBob3ZlciBvbiBmb2N1cyB3aGVuIHJlbGF0ZWRUYXJnZXQgaXMgbnVsbCAod2luZG93IHJlYWN0aXZhdGlvbiknLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgZGVsZWdhdGUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSwgJ2VsZW1lbnQnLCB1bmRlZmluZWQsIHt9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGRlbGVnYXRlLCB0YXJnZXQsICdUZXN0JykpO1xuXG5cdFx0XHQvLyBTaG93IGhvdmVyIHZpYSBmb2N1cyBhbmQgZGlzbWlzcyBleHRlcm5hbGx5XG5cdFx0XHR0YXJnZXQuZGlzcGF0Y2hFdmVudChuZXcgRm9jdXNFdmVudCgnZm9jdXMnLCB7IGJ1YmJsZXM6IHRydWUsIHJlbGF0ZWRUYXJnZXQ6IGRvY3VtZW50LmJvZHkgfSkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MDApO1xuXHRcdFx0aG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIGZvY3VzIGZyb20gd2luZG93IHJlYWN0aXZhdGlvbiAocmVsYXRlZFRhcmdldCBpcyBudWxsKVxuXHRcdFx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQobmV3IEZvY3VzRXZlbnQoJ2ZvY3VzJywgeyBidWJibGVzOiB0cnVlLCByZWxhdGVkVGFyZ2V0OiBudWxsIH0pKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblxuXHRcdFx0Y29uc3QgaG92ZXJzID0gZml4dHVyZS5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzLmxlbmd0aCwgMCwgJ0hvdmVyIHNob3VsZCBub3QgcmUtc2hvdyBvbiB3aW5kb3cgcmVhY3RpdmF0aW9uJyk7XG5cdFx0fSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2hvd0RlbGF5ZWRIb3ZlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVqZWN0IGhvdmVyIHdoZW4gY3VycmVudCBob3ZlciBpcyBsb2NrZWQgYW5kIHRhcmdldCBpcyBvdXRzaWRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9ja2VkSG92ZXIgPSBzaG93SG92ZXIoJ0xvY2tlZCcsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRwZXJzaXN0ZW5jZTogeyBzdGlja3k6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRJbkRPTShsb2NrZWRIb3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGNvbnN0IG90aGVyVGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCByZWplY3RlZEhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dEZWxheWVkSG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnU2hvdWxkIG5vdCBzaG93Jyxcblx0XHRcdFx0dGFyZ2V0OiBvdGhlclRhcmdldFxuXHRcdFx0fSwge30pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVqZWN0ZWRIb3ZlciwgdW5kZWZpbmVkLCAnU2hvdWxkIHJlamVjdCBob3ZlciB3aGVuIGxvY2tlZCBob3ZlciBleGlzdHMnKTtcblx0XHRcdGFzc2VydEluRE9NKGxvY2tlZEhvdmVyLCAnTG9ja2VkIGhvdmVyIHNob3VsZCByZW1haW4gaW4gRE9NIGFmdGVyIHJlamVjdGlvbicpO1xuXG5cdFx0XHRsb2NrZWRIb3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShsb2NrZWRIb3ZlciwgJ0xvY2tlZCBob3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHJlZHVjZWQgZGVsYXkgd2hlbiByZWR1Y2VkRGVsYXkgaXMgdHJ1ZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlVGFyZ2V0KCk7XG5cdFx0XHRjb25zdCByZWR1Y2VkRGVsYXkgPSAxMDA7XG5cblx0XHRcdC8vIENvbmZpZ3VyZSByZWR1Y2VkRGVsYXkgc2V0dGluZyBmb3IgdGhpcyB0ZXN0XG5cdFx0XHQoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKS5zZXRVc2VyQ29uZmlndXJhdGlvbignd29ya2JlbmNoLmhvdmVyLnJlZHVjZWREZWxheScsIHJlZHVjZWREZWxheSk7XG5cblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dEZWxheWVkSG92ZXIoe1xuXHRcdFx0XHRjb250ZW50OiAnUmVkdWNlZCBkZWxheSBob3ZlcicsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSwgeyByZWR1Y2VkRGVsYXk6IHRydWUgfSk7XG5cblx0XHRcdGFzc2VydC5vayhob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBjcmVhdGVkJyk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBub3QgYmUgdmlzaWJsZSBpbW1lZGlhdGVseScpO1xuXG5cdFx0XHQvLyBXYWl0IGxlc3MgdGhhbiByZWR1Y2VkIGRlbGF5IC0gaG92ZXIgc2hvdWxkIHN0aWxsIG5vdCBiZSB2aXNpYmxlXG5cdFx0XHRhd2FpdCB0aW1lb3V0KHJlZHVjZWREZWxheSAvIDIpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgbm90IGJlIHZpc2libGUgYmVmb3JlIGRlbGF5IGNvbXBsZXRlcycpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciBmdWxsIGRlbGF5IC0gaG92ZXIgc2hvdWxkIG5vdyBiZSB2aXNpYmxlXG5cdFx0XHRhd2FpdCB0aW1lb3V0KHJlZHVjZWREZWxheSk7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSB2aXNpYmxlIGFmdGVyIHJlZHVjZWQgZGVsYXknKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZGVmYXVsdCBkZWxheSB3aGVuIGN1c3RvbSBkZWxheSBpcyB1bmRlZmluZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Ly8gRGVmYXVsdCBkZWxheSBpcyBzZXQgdG8gMCBpbiB0ZXN0IHNldHVwXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93RGVsYXllZEhvdmVyKHtcblx0XHRcdFx0Y29udGVudDogJ0RlZmF1bHQgZGVsYXkgaG92ZXInLFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH0sIHt9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIGNyZWF0ZWQnKTtcblxuXHRcdFx0Ly8gU2luY2UgZGVmYXVsdCBkZWxheSBpcyAwIGluIHRlc3RzLCBob3ZlciBzaG91bGQgYXBwZWFyIGFmdGVyIG1pbmltYWwgdGltZW91dFxuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIHZpc2libGUgd2l0aCBkZWZhdWx0IGRlbGF5Jyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdob3ZlciBsb2NraW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lzTG9ja2VkIHNob3VsZCBiZSBzZXR0YWJsZSBvbiBob3ZlciB3aWRnZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlciA9IHNob3dIb3ZlcignVGVzdCcpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXNIb3ZlcldpZGdldChob3Zlcik7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5pc0xvY2tlZCwgZmFsc2UsICdTaG91bGQgbm90IGJlIGxvY2tlZCBpbml0aWFsbHknKTtcblxuXHRcdFx0d2lkZ2V0LmlzTG9ja2VkID0gdHJ1ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXNMb2NrZWQsIHRydWUsICdTaG91bGQgYmUgbG9ja2VkIGFmdGVyIHNldHRpbmcnKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIHJlbWFpbiBpbiBET00gYWZ0ZXIgbG9ja2luZycpO1xuXG5cdFx0XHR3aWRnZXQuaXNMb2NrZWQgPSBmYWxzZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXNMb2NrZWQsIGZhbHNlLCAnU2hvdWxkIGJlIHVubG9ja2VkIGFmdGVyIHVuc2V0dGluZycpO1xuXG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NIGFmdGVyIGRpc3Bvc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0aWNreSBvcHRpb24gc2hvdWxkIHNldCBpc0xvY2tlZCB0byB0cnVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBzaG93SG92ZXIoJ1Rlc3QnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0cGVyc2lzdGVuY2U6IHsgc3RpY2t5OiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdTdGlja3kgaG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXNIb3ZlcldpZGdldChob3ZlcikuaXNMb2NrZWQsIHRydWUsICdTaG91bGQgYmUgbG9ja2VkIHdoZW4gc3RpY2t5Jyk7XG5cblx0XHRcdGhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnU3RpY2t5IGhvdmVyIHNob3VsZCBiZSByZW1vdmVkIGZyb20gRE9NIGFmdGVyIGRpc3Bvc2UnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Nob3dBbmRGb2N1c0xhc3RIb3ZlcicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVjcmVhdGUgbGFzdCBkaXNwb3NlZCBob3ZlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQ6ICdSZW1lbWJlciBtZScsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdJbml0aWFsIGhvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cblx0XHRcdC8vIFNob3VsZCByZWNyZWF0ZSB0aGUgaG92ZXIgLSB2ZXJpZnkgYSBuZXcgaG92ZXIgaXMgc2hvd25cblx0XHRcdGhvdmVyU2VydmljZS5zaG93QW5kRm9jdXNMYXN0SG92ZXIoKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZXJlIGlzIGEgaG92ZXIgaW4gdGhlIERPTSAoaXQncyBhIG5ldyBob3ZlciBpbnN0YW5jZSlcblx0XHRcdGNvbnN0IGhvdmVyRWxlbWVudHMgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28taG92ZXInKTtcblx0XHRcdGFzc2VydC5vayhob3ZlckVsZW1lbnRzLmxlbmd0aCA+IDAsICdBIGhvdmVyIHNob3VsZCBiZSByZWNyZWF0ZWQgYW5kIGluIHRoZSBET00nKTtcblxuXHRcdFx0Ly8gQ2xlYW4gdXBcblx0XHRcdGhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cblx0XHRcdC8vIFZlcmlmeSBjbGVhbnVwXG5cdFx0XHRjb25zdCByZW1haW5pbmdIb3ZlcnMgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28taG92ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1haW5pbmdIb3ZlcnMubGVuZ3RoLCAwLCAnTm8gaG92ZXJzIHNob3VsZCByZW1haW4gaW4gRE9NIGFmdGVyIGNsZWFudXAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2xheW91dCBhbmQgcmVzaXplJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2xheW91dCBzaG91bGQgc3VwcHJlc3MgcGVuZGluZyBtb3VzZW91dCBzbyBjb250ZW50IHJlc2l6ZSBkb2VzIG5vdCBkaXNtaXNzIGhvdmVyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGNvbnRlbnQudGV4dENvbnRlbnQgPSAnUmVzaXphYmxlIGNvbnRlbnQnO1xuXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhob3Zlcik7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXNIb3ZlcldpZGdldChob3Zlcik7XG5cblx0XHRcdC8vIFNpbXVsYXRlIGEgbW91c2VsZWF2ZSBvbiB0aGUgaG92ZXIgY29udGFpbmVyIChhcyBoYXBwZW5zIHdoZW4gY29udGVudCBzaHJpbmtzKVxuXHRcdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VsZWF2ZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRcdC8vIEJlZm9yZSB0aGUgZGVib3VuY2UgdGltZXIgZmlyZXMsIHRyaWdnZXIgYSBsYXlvdXQgKGFzIFJlc2l6ZU9ic2VydmVyIHdvdWxkKVxuXHRcdFx0d2lkZ2V0LmxheW91dCgpO1xuXG5cdFx0XHQvLyBXYWl0IGxvbmdlciB0aGFuIHRoZSBDb21wb3NpdGVNb3VzZVRyYWNrZXIgZGVib3VuY2UgKDIwMG1zKVxuXHRcdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXG5cdFx0XHQvLyBUaGUgaG92ZXIgc2hvdWxkIHN0aWxsIGJlIGluIHRoZSBET00gYmVjYXVzZSBsYXlvdXQoKSBjYW5jZWxsZWQgdGhlIHBlbmRpbmcgbW91c2VvdXRcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIHJlbWFpbiBpbiBET00gYWZ0ZXIgbGF5b3V0IHN1cHByZXNzZXMgbW91c2VvdXQnKTtcblxuXHRcdFx0aG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIERPTSBhZnRlciBkaXNwb3NlJyk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdC5za2lwKCdob3ZlciBzaG91bGQgc3RpbGwgZGlzbWlzcyBvbiBtb3VzZW91dCB3aGVuIG5vIGxheW91dCBvY2N1cnMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZVRhcmdldCgpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0Y29udGVudC50ZXh0Q29udGVudCA9ICdDb250ZW50JztcblxuXHRcdFx0Y29uc3QgaG92ZXIgPSBob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdHRhcmdldFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soaG92ZXIpO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgYmUgaW4gRE9NJyk7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IGFzSG92ZXJXaWRnZXQoaG92ZXIpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIG1vdXNlbGVhdmUgd2l0aG91dCBhIHN1YnNlcXVlbnQgbGF5b3V0XG5cdFx0XHR3aWRnZXQuZG9tTm9kZS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWxlYXZlJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIGRlYm91bmNlIHRvIGZpcmVcblx0XHRcdGF3YWl0IHRpbWVvdXQoMzAwKTtcblxuXHRcdFx0Ly8gV2l0aG91dCBsYXlvdXQgc3VwcHJlc3Npb24sIHRoZSBob3ZlciBzaG91bGQgYmUgZGlzbWlzc2VkXG5cdFx0XHRhc3NlcnROb3RJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBkaXNtaXNzZWQgYWZ0ZXIgbW91c2VvdXQgd2l0aG91dCBsYXlvdXQnKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0LnNraXAoJ3N1cHByZXNzaW9uIGNsZWFycyBhZnRlciBtb3VzZSByZS1lbnRlcnMgYW5kIGEgbmV3IG1vdXNlbGVhdmUgZGlzbWlzc2VzIG5vcm1hbGx5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGNvbnRlbnQudGV4dENvbnRlbnQgPSAnUmVzaXphYmxlIGNvbnRlbnQnO1xuXG5cdFx0XHRjb25zdCBob3ZlciA9IGhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0dGFyZ2V0XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhob3Zlcik7XG5cdFx0XHRhc3NlcnRJbkRPTShob3ZlciwgJ0hvdmVyIHNob3VsZCBiZSBpbiBET00nKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gYXNIb3ZlcldpZGdldChob3Zlcik7XG5cblx0XHRcdC8vIFNpbXVsYXRlIG1vdXNlbGVhdmUgKyBsYXlvdXQgdG8gc3VwcHJlc3Ncblx0XHRcdHdpZGdldC5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ21vdXNlbGVhdmUnLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0d2lkZ2V0LmxheW91dCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXHRcdFx0YXNzZXJ0SW5ET00oaG92ZXIsICdIb3ZlciBzaG91bGQgcmVtYWluIGFmdGVyIHN1cHByZXNzZWQgbW91c2VvdXQnKTtcblxuXHRcdFx0Ly8gTW91c2UgcmUtZW50ZXJzLCBjbGVhcmluZyB0aGUgc3VwcHJlc3Npb24gZmxhZ1xuXHRcdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VvdmVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0Ly8gTW91c2UgbGVhdmVzIGFnYWluIFx1MjAxNCB0aGlzIHRpbWUgbm8gbGF5b3V0LCBzbyBpdCBzaG91bGQgZGlzbWlzc1xuXHRcdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VsZWF2ZScsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDMwMCk7XG5cblx0XHRcdGFzc2VydE5vdEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGRpc21pc3Mgb24gbm9ybWFsIG1vdXNlb3V0IGFmdGVyIHN1cHByZXNzaW9uIHdhcyBjbGVhcmVkJyk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY2xpY2tpbmcgb3V0c2lkZSBzaG91bGQgZGlzbWlzcyBub24tc3RpY2t5IGhvdmVyJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBjcmVhdGVUYXJnZXQoKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGNvbnRlbnQudGV4dENvbnRlbnQgPSAnQ29udGVudCc7XG5cblx0XHRcdGNvbnN0IGhvdmVyID0gaG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGhvdmVyKTtcblx0XHRcdGFzc2VydEluRE9NKGhvdmVyLCAnSG92ZXIgc2hvdWxkIGJlIGluIERPTScpO1xuXG5cdFx0XHQvLyBDbGljayBvdXRzaWRlIHRoZSBob3ZlclxuXHRcdFx0ZG9jdW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblxuXHRcdFx0YXNzZXJ0Tm90SW5ET00oaG92ZXIsICdOb24tc3RpY2t5IGhvdmVyIHNob3VsZCBiZSBkaXNtaXNzZWQgYWZ0ZXIgY2xpY2tpbmcgb3V0c2lkZScpO1xuXHRcdH0pKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CO0FBQzdCLFNB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
