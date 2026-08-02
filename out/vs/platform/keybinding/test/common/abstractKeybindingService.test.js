import assert from "assert";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { createSimpleKeybinding, KeyCodeChord } from "../../../../base/common/keybindings.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr } from "../../../contextkey/common/contextkey.js";
import { AbstractKeybindingService } from "../../common/abstractKeybindingService.js";
import { KeybindingResolver, ResultKind } from "../../common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../common/usLayoutResolvedKeybinding.js";
import { createUSLayoutResolvedKeybinding } from "./keybindingsTestUtils.js";
import { NullLogService } from "../../../log/common/log.js";
import { NoOpNotification } from "../../../notification/common/notification.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("AbstractKeybindingService", () => {
  class TestKeybindingService extends AbstractKeybindingService {
    constructor(resolver, contextKeyService, commandService, notificationService) {
      super(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService());
      this._resolver = resolver;
    }
    _getResolver() {
      return this._resolver;
    }
    _documentHasFocus() {
      return true;
    }
    resolveKeybinding(kb) {
      return USLayoutResolvedKeybinding.resolveKeybinding(kb, OS);
    }
    resolveKeyboardEvent(keyboardEvent) {
      const chord = new KeyCodeChord(
        keyboardEvent.ctrlKey,
        keyboardEvent.shiftKey,
        keyboardEvent.altKey,
        keyboardEvent.metaKey,
        keyboardEvent.keyCode
      ).toKeybinding();
      return this.resolveKeybinding(chord)[0];
    }
    resolveUserBinding(userBinding) {
      return [];
    }
    testDispatch(kb, isComposing = false) {
      return this._dispatch(this._toKeyboardEvent(kb, isComposing), null);
    }
    testSoftDispatch(kb, isComposing = false) {
      return this.softDispatch(this._toKeyboardEvent(kb, isComposing), null);
    }
    _toKeyboardEvent(kb, isComposing) {
      const keybinding = createSimpleKeybinding(kb, OS);
      return {
        _standardKeyboardEventBrand: true,
        ctrlKey: keybinding.ctrlKey,
        shiftKey: keybinding.shiftKey,
        altKey: keybinding.altKey,
        metaKey: keybinding.metaKey,
        altGraphKey: false,
        // `StandardKeyboardEvent` normalizes composing keystrokes to KEY_IN_COMPOSITION.
        keyCode: isComposing ? KeyCode.KEY_IN_COMPOSITION : keybinding.keyCode,
        code: null
      };
    }
    _dumpDebugInfo() {
      return "";
    }
    _dumpDebugInfoJSON() {
      return "";
    }
    registerSchemaContribution() {
      return Disposable.None;
    }
    enableKeybindingHoldMode() {
      return void 0;
    }
  }
  let createTestKeybindingService = null;
  let currentContextValue = null;
  let executeCommandCalls = null;
  let showMessageCalls = null;
  let statusMessageCalls = null;
  let statusMessageCallsDisposed = null;
  teardown(() => {
    currentContextValue = null;
    executeCommandCalls = null;
    showMessageCalls = null;
    createTestKeybindingService = null;
    statusMessageCalls = null;
    statusMessageCallsDisposed = null;
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    createTestKeybindingService = (items) => {
      const contextKeyService = {
        _serviceBrand: void 0,
        onDidChangeContext: void 0,
        bufferChangeEvents() {
        },
        createKey: void 0,
        contextMatchesRules: (rules) => {
          if (!rules) {
            return true;
          }
          if (!currentContextValue) {
            return false;
          }
          return rules.evaluate(currentContextValue);
        },
        getContextKeyValue: void 0,
        createScoped: void 0,
        createOverlay: void 0,
        getContext: (target) => {
          return currentContextValue;
        },
        updateParent: () => {
        }
      };
      const commandService = {
        _serviceBrand: void 0,
        onWillExecuteCommand: () => Disposable.None,
        onDidExecuteCommand: () => Disposable.None,
        executeCommand: (commandId, ...args) => {
          executeCommandCalls.push({
            commandId,
            args
          });
          return Promise.resolve(void 0);
        }
      };
      const notificationService = {
        _serviceBrand: void 0,
        onDidChangeFilter: void 0,
        notify: (notification) => {
          showMessageCalls.push({ sev: notification.severity, message: notification.message });
          return new NoOpNotification();
        },
        info: (message) => {
          showMessageCalls.push({ sev: Severity.Info, message });
          return new NoOpNotification();
        },
        warn: (message) => {
          showMessageCalls.push({ sev: Severity.Warning, message });
          return new NoOpNotification();
        },
        error: (message) => {
          showMessageCalls.push({ sev: Severity.Error, message });
          return new NoOpNotification();
        },
        prompt(severity, message, choices, options) {
          throw new Error("not implemented");
        },
        status(message, options) {
          statusMessageCalls.push(message);
          return {
            close: () => {
              statusMessageCallsDisposed.push(message);
            }
          };
        },
        setFilter() {
          throw new Error("not implemented");
        },
        getFilter() {
          throw new Error("not implemented");
        },
        getFilters() {
          throw new Error("not implemented");
        },
        removeFilter() {
          throw new Error("not implemented");
        }
      };
      const resolver = new KeybindingResolver(items, [], () => {
      });
      return new TestKeybindingService(resolver, contextKeyService, commandService, notificationService);
    };
  });
  function kbItem(keybinding, command, when) {
    return new ResolvedKeybindingItem(
      createUSLayoutResolvedKeybinding(keybinding, OS),
      command,
      null,
      when,
      true,
      null,
      false
    );
  }
  function toUsLabel(keybinding) {
    return createUSLayoutResolvedKeybinding(keybinding, OS).getLabel();
  }
  suite("simple tests: single- and multi-chord keybindings are dispatched", () => {
    test("a single-chord keybinding is dispatched correctly; this test makes sure the dispatch in general works before we test empty-string/null command ID", () => {
      const key = KeyMod.CtrlCmd | KeyCode.KeyK;
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand")
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(key);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, [{ commandId: "myCommand", args: [null] }]);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a multi-chord keybinding is dispatched correctly", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand")
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(chord0);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(chord1);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, [{ commandId: "myCommand", args: [null] }]);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
  });
  suite("keybindings with empty-string/null command ID", () => {
    test("a single-chord keybinding with an empty string command ID unbinds the keybinding (shouldPreventDefault = false)", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand"),
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "")
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a single-chord keybinding with a null command ID unbinds the keybinding (shouldPreventDefault = false)", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand"),
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, null)
      ]);
      currentContextValue = createContext({});
      const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      kbService.dispose();
    });
    test("a multi-chord keybinding with an empty-string command ID keeps the keybinding (shouldPreventDefault = true)", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand"),
        kbItem(key, "")
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
    test("a multi-chord keybinding with a null command ID keeps the keybinding (shouldPreventDefault = true)", () => {
      const chord0 = KeyMod.CtrlCmd | KeyCode.KeyK;
      const chord1 = KeyMod.CtrlCmd | KeyCode.KeyI;
      const key = [chord0, chord1];
      const kbService = createTestKeybindingService([
        kbItem(key, "myCommand"),
        kbItem(key, null)
      ]);
      currentContextValue = createContext({});
      let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyI);
      assert.deepStrictEqual(shouldPreventDefault, true);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`, `The key combination (${toUsLabel(chord0)}, ${toUsLabel(chord1)}) is not a command.`]);
      assert.deepStrictEqual(statusMessageCallsDisposed, [`(${toUsLabel(chord0)}) was pressed. Waiting for second key of chord...`]);
      kbService.dispose();
    });
  });
  test("issue #16498: chord mode is quit for invalid chords", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand"),
      kbItem(KeyCode.Backspace, "simpleCommand")
    ]);
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `The key combination (${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}, ${toUsLabel(KeyCode.Backspace)}) is not a command.`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    shouldPreventDefault = kbService.testDispatch(KeyCode.Backspace);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("issue #16833: Keybinding service should not testDispatch on modifier keys", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyCode.Ctrl, "nope"),
      kbItem(KeyCode.Meta, "nope"),
      kbItem(KeyCode.Alt, "nope"),
      kbItem(KeyCode.Shift, "nope"),
      kbItem(KeyMod.CtrlCmd, "nope"),
      kbItem(KeyMod.WinCtrl, "nope"),
      kbItem(KeyMod.Alt, "nope"),
      kbItem(KeyMod.Shift, "nope")
    ]);
    function assertIsIgnored(keybinding) {
      const shouldPreventDefault = kbService.testDispatch(keybinding);
      assert.strictEqual(shouldPreventDefault, false);
      assert.deepStrictEqual(executeCommandCalls, []);
      assert.deepStrictEqual(showMessageCalls, []);
      assert.deepStrictEqual(statusMessageCalls, []);
      assert.deepStrictEqual(statusMessageCallsDisposed, []);
      executeCommandCalls = [];
      showMessageCalls = [];
      statusMessageCalls = [];
      statusMessageCallsDisposed = [];
    }
    assertIsIgnored(KeyCode.Ctrl);
    assertIsIgnored(KeyCode.Meta);
    assertIsIgnored(KeyCode.Alt);
    assertIsIgnored(KeyCode.Shift);
    assertIsIgnored(KeyMod.CtrlCmd);
    assertIsIgnored(KeyMod.WinCtrl);
    assertIsIgnored(KeyMod.Alt);
    assertIsIgnored(KeyMod.Shift);
    kbService.dispose();
  });
  test("keybindings are not dispatched while an IME composition is in progress", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyCode.Enter, "enterCommand")
    ]);
    const shouldPreventDefaultWhileComposing = kbService.testDispatch(KeyCode.Enter, true);
    assert.deepStrictEqual(
      [shouldPreventDefaultWhileComposing, executeCommandCalls],
      [false, []]
    );
    assert.strictEqual(
      kbService.testSoftDispatch(KeyCode.Enter, true).kind,
      ResultKind.NoMatchingKb
    );
    const shouldPreventDefault = kbService.testDispatch(KeyCode.Enter, false);
    assert.deepStrictEqual(
      [shouldPreventDefault, executeCommandCalls],
      [true, [{ commandId: "enterCommand", args: [null] }]]
    );
    assert.strictEqual(
      kbService.testSoftDispatch(KeyCode.Enter, false).kind,
      ResultKind.KbFound
    );
    kbService.dispose();
  });
  test("can trigger command that is sharing keybinding with chord", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand"),
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "simpleCommand", ContextKeyExpr.has("key1"))
    ]);
    currentContextValue = createContext({
      key1: true
    });
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({});
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({});
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "chordCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, [
      `(${toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK)}) was pressed. Waiting for second key of chord...`
    ]);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("cannot trigger chord if command is overwriting", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyX), "chordCommand", ContextKeyExpr.has("key1")),
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "simpleCommand")
    ]);
    currentContextValue = createContext({});
    let shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({
      key1: true
    });
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, true);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    currentContextValue = createContext({
      key1: true
    });
    shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyX);
    assert.strictEqual(shouldPreventDefault, false);
    assert.deepStrictEqual(executeCommandCalls, []);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  test("can have spying command", () => {
    const kbService = createTestKeybindingService([
      kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "^simpleCommand")
    ]);
    currentContextValue = createContext({});
    const shouldPreventDefault = kbService.testDispatch(KeyMod.CtrlCmd | KeyCode.KeyK);
    assert.strictEqual(shouldPreventDefault, false);
    assert.deepStrictEqual(executeCommandCalls, [{
      commandId: "simpleCommand",
      args: [null]
    }]);
    assert.deepStrictEqual(showMessageCalls, []);
    assert.deepStrictEqual(statusMessageCalls, []);
    assert.deepStrictEqual(statusMessageCallsDisposed, []);
    executeCommandCalls = [];
    showMessageCalls = [];
    statusMessageCalls = [];
    statusMessageCallsDisposed = [];
    kbService.dispose();
  });
  suite("appendKeybinding", () => {
    test("appends keybinding label when command has a keybinding", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("returns only label when command has no keybinding", () => {
      const kbService = createTestKeybindingService([]);
      const result = kbService.appendKeybinding("My Label", "myCommand");
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is null", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", null);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is undefined", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", void 0);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("returns only label when commandId is empty string", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("My Label", "");
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("appends keybinding for command with context when context matches", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({ key1: true });
      const result = kbService.appendKeybinding("My Label", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("returns only label when context does not match and enforceContextCheck is true", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({});
      const result = kbService.appendKeybinding("My Label", "myCommand", void 0, true);
      assert.strictEqual(result, "My Label");
      kbService.dispose();
    });
    test("appends keybinding when context does not match but enforceContextCheck is false", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand", ContextKeyExpr.has("key1"))
      ]);
      currentContextValue = createContext({});
      const result = kbService.appendKeybinding("My Label", "myCommand", void 0, false);
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, `My Label (${expectedLabel})`);
      kbService.dispose();
    });
    test("appends keybinding even when label is empty string", () => {
      const kbService = createTestKeybindingService([
        kbItem(KeyMod.CtrlCmd | KeyCode.KeyK, "myCommand")
      ]);
      const result = kbService.appendKeybinding("", "myCommand");
      const expectedLabel = toUsLabel(KeyMod.CtrlCmd | KeyCode.KeyK);
      assert.strictEqual(result, ` (${expectedLabel})`);
      kbService.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vYWJzdHJhY3RLZXliaW5kaW5nU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW1wbGVLZXliaW5kaW5nLCBSZXNvbHZlZEtleWJpbmRpbmcsIEtleUNvZGVDaG9yZCwgS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHQsIElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Fic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nUmVzb2x2ZXIsIFJlc29sdXRpb25SZXN1bHQsIFJlc3VsdEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi91c0xheW91dFJlc29sdmVkS2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4va2V5YmluZGluZ3NUZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uLCBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgSVByb21wdE9wdGlvbnMsIElTdGF0dXNNZXNzYWdlT3B0aW9ucywgTm9PcE5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQoY3R4OiBhbnkpIHtcblx0cmV0dXJuIHtcblx0XHRnZXRWYWx1ZTogKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gY3R4W2tleV07XG5cdFx0fVxuXHR9O1xufVxuXG5zdWl0ZSgnQWJzdHJhY3RLZXliaW5kaW5nU2VydmljZScsICgpID0+IHtcblxuXHRjbGFzcyBUZXN0S2V5YmluZGluZ1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIHtcblx0XHRwcml2YXRlIF9yZXNvbHZlcjogS2V5YmluZGluZ1Jlc29sdmVyO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRyZXNvbHZlcjogS2V5YmluZGluZ1Jlc29sdmVyLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHRcdCkge1xuXHRcdFx0c3VwZXIoY29udGV4dEtleVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZXIgPSByZXNvbHZlcjtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2dldFJlc29sdmVyKCk6IEtleWJpbmRpbmdSZXNvbHZlciB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZXI7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIF9kb2N1bWVudEhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlc29sdmVLZXliaW5kaW5nKGtiOiBLZXliaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdFx0cmV0dXJuIFVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLnJlc29sdmVLZXliaW5kaW5nKGtiLCBPUyk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogUmVzb2x2ZWRLZXliaW5kaW5nIHtcblx0XHRcdGNvbnN0IGNob3JkID0gbmV3IEtleUNvZGVDaG9yZChcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5jdHJsS2V5LFxuXHRcdFx0XHRrZXlib2FyZEV2ZW50LnNoaWZ0S2V5LFxuXHRcdFx0XHRrZXlib2FyZEV2ZW50LmFsdEtleSxcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5tZXRhS2V5LFxuXHRcdFx0XHRrZXlib2FyZEV2ZW50LmtleUNvZGVcblx0XHRcdCkudG9LZXliaW5kaW5nKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlS2V5YmluZGluZyhjaG9yZClbMF07XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlc29sdmVVc2VyQmluZGluZyh1c2VyQmluZGluZzogc3RyaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB0ZXN0RGlzcGF0Y2goa2I6IG51bWJlciwgaXNDb21wb3Npbmc6IGJvb2xlYW4gPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoKHRoaXMuX3RvS2V5Ym9hcmRFdmVudChrYiwgaXNDb21wb3NpbmcpLCBudWxsISk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHRlc3RTb2Z0RGlzcGF0Y2goa2I6IG51bWJlciwgaXNDb21wb3Npbmc6IGJvb2xlYW4gPSBmYWxzZSk6IFJlc29sdXRpb25SZXN1bHQge1xuXHRcdFx0cmV0dXJuIHRoaXMuc29mdERpc3BhdGNoKHRoaXMuX3RvS2V5Ym9hcmRFdmVudChrYiwgaXNDb21wb3NpbmcpLCBudWxsISk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfdG9LZXlib2FyZEV2ZW50KGtiOiBudW1iZXIsIGlzQ29tcG9zaW5nOiBib29sZWFuKTogSUtleWJvYXJkRXZlbnQge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IGNyZWF0ZVNpbXBsZUtleWJpbmRpbmcoa2IsIE9TKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0Y3RybEtleToga2V5YmluZGluZy5jdHJsS2V5LFxuXHRcdFx0XHRzaGlmdEtleToga2V5YmluZGluZy5zaGlmdEtleSxcblx0XHRcdFx0YWx0S2V5OiBrZXliaW5kaW5nLmFsdEtleSxcblx0XHRcdFx0bWV0YUtleToga2V5YmluZGluZy5tZXRhS2V5LFxuXHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdC8vIGBTdGFuZGFyZEtleWJvYXJkRXZlbnRgIG5vcm1hbGl6ZXMgY29tcG9zaW5nIGtleXN0cm9rZXMgdG8gS0VZX0lOX0NPTVBPU0lUSU9OLlxuXHRcdFx0XHRrZXlDb2RlOiBpc0NvbXBvc2luZyA/IEtleUNvZGUuS0VZX0lOX0NPTVBPU0lUSU9OIDoga2V5YmluZGluZy5rZXlDb2RlLFxuXHRcdFx0XHRjb2RlOiBudWxsIVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRwdWJsaWMgX2R1bXBEZWJ1Z0luZm8oKTogc3RyaW5nIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRwdWJsaWMgX2R1bXBEZWJ1Z0luZm9KU09OKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJlZ2lzdGVyU2NoZW1hQ29udHJpYnV0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0cHVibGljIGVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZSgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZTogKGl0ZW1zOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10sIGNvbnRleHRWYWx1ZT86IGFueSkgPT4gVGVzdEtleWJpbmRpbmdTZXJ2aWNlID0gbnVsbCE7XG5cdGxldCBjdXJyZW50Q29udGV4dFZhbHVlOiBJQ29udGV4dCB8IG51bGwgPSBudWxsO1xuXHRsZXQgZXhlY3V0ZUNvbW1hbmRDYWxsczogeyBjb21tYW5kSWQ6IHN0cmluZzsgYXJnczogdW5rbm93bltdIH1bXSA9IG51bGwhO1xuXHRsZXQgc2hvd01lc3NhZ2VDYWxsczogeyBzZXY6IFNldmVyaXR5OyBtZXNzYWdlOiBhbnkgfVtdID0gbnVsbCE7XG5cdGxldCBzdGF0dXNNZXNzYWdlQ2FsbHM6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cdGxldCBzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZDogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcblxuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gbnVsbDtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gbnVsbCE7XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IG51bGwhO1xuXHRcdGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZSA9IG51bGwhO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IG51bGw7XG5cdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQgPSBudWxsO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0Y3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlID0gKGl0ZW1zOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10pOiBUZXN0S2V5YmluZGluZ1NlcnZpY2UgPT4ge1xuXG5cdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ29udGV4dDogdW5kZWZpbmVkISxcblx0XHRcdFx0YnVmZmVyQ2hhbmdlRXZlbnRzKCkgeyB9LFxuXHRcdFx0XHRjcmVhdGVLZXk6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdGNvbnRleHRNYXRjaGVzUnVsZXM6IChydWxlczogQ29udGV4dEtleUV4cHJlc3Npb24gfCBudWxsIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFydWxlcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghY3VycmVudENvbnRleHRWYWx1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcnVsZXMuZXZhbHVhdGUoY3VycmVudENvbnRleHRWYWx1ZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldENvbnRleHRLZXlWYWx1ZTogdW5kZWZpbmVkISxcblx0XHRcdFx0Y3JlYXRlU2NvcGVkOiB1bmRlZmluZWQhLFxuXHRcdFx0XHRjcmVhdGVPdmVybGF5OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRnZXRDb250ZXh0OiAodGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBhbnkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBjdXJyZW50Q29udGV4dFZhbHVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cGRhdGVQYXJlbnQ6ICgpID0+IHsgfVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvbldpbGxFeGVjdXRlQ29tbWFuZDogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0XHRvbkRpZEV4ZWN1dGVDb21tYW5kOiAoKSA9PiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0XHRcdGV4ZWN1dGVDb21tYW5kOiAoY29tbWFuZElkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8YW55PiA9PiB7XG5cdFx0XHRcdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscy5wdXNoKHtcblx0XHRcdFx0XHRcdGNvbW1hbmRJZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdFx0YXJnczogYXJnc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0b25EaWRDaGFuZ2VGaWx0ZXI6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdG5vdGlmeTogKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbikgPT4ge1xuXHRcdFx0XHRcdHNob3dNZXNzYWdlQ2FsbHMucHVzaCh7IHNldjogbm90aWZpY2F0aW9uLnNldmVyaXR5LCBtZXNzYWdlOiBub3RpZmljYXRpb24ubWVzc2FnZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE5vT3BOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5mbzogKG1lc3NhZ2U6IGFueSkgPT4ge1xuXHRcdFx0XHRcdHNob3dNZXNzYWdlQ2FsbHMucHVzaCh7IHNldjogU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE5vT3BOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0d2FybjogKG1lc3NhZ2U6IGFueSkgPT4ge1xuXHRcdFx0XHRcdHNob3dNZXNzYWdlQ2FsbHMucHVzaCh7IHNldjogU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE5vT3BOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXJyb3I6IChtZXNzYWdlOiBhbnkpID0+IHtcblx0XHRcdFx0XHRzaG93TWVzc2FnZUNhbGxzLnB1c2goeyBzZXY6IFNldmVyaXR5LkVycm9yLCBtZXNzYWdlIH0pO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTm9PcE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcm9tcHQoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGNob2ljZXM6IElQcm9tcHRDaG9pY2VbXSwgb3B0aW9ucz86IElQcm9tcHRPcHRpb25zKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RhdHVzKG1lc3NhZ2U6IHN0cmluZywgb3B0aW9ucz86IElTdGF0dXNNZXNzYWdlT3B0aW9ucykge1xuXHRcdFx0XHRcdHN0YXR1c01lc3NhZ2VDYWxscyEucHVzaChtZXNzYWdlKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y2xvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQhLnB1c2gobWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0RmlsdGVyKCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldEZpbHRlcigpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRGaWx0ZXJzKCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbW92ZUZpbHRlcigpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXNvbHZlciA9IG5ldyBLZXliaW5kaW5nUmVzb2x2ZXIoaXRlbXMsIFtdLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFRlc3RLZXliaW5kaW5nU2VydmljZShyZXNvbHZlciwgY29udGV4dEtleVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHR9O1xuXHR9KTtcblxuXHRmdW5jdGlvbiBrYkl0ZW0oa2V5YmluZGluZzogbnVtYmVyIHwgbnVtYmVyW10sIGNvbW1hbmQ6IHN0cmluZyB8IG51bGwsIHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbik6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0ge1xuXHRcdHJldHVybiBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbShcblx0XHRcdGNyZWF0ZVVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nKGtleWJpbmRpbmcsIE9TKSxcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRudWxsLFxuXHRcdFx0d2hlbixcblx0XHRcdHRydWUsXG5cdFx0XHRudWxsLFxuXHRcdFx0ZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9Vc0xhYmVsKGtleWJpbmRpbmc6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGNyZWF0ZVVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nKGtleWJpbmRpbmcsIE9TKSEuZ2V0TGFiZWwoKSE7XG5cdH1cblxuXHRzdWl0ZSgnc2ltcGxlIHRlc3RzOiBzaW5nbGUtIGFuZCBtdWx0aS1jaG9yZCBrZXliaW5kaW5ncyBhcmUgZGlzcGF0Y2hlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Egc2luZ2xlLWNob3JkIGtleWJpbmRpbmcgaXMgZGlzcGF0Y2hlZCBjb3JyZWN0bHk7IHRoaXMgdGVzdCBtYWtlcyBzdXJlIHRoZSBkaXNwYXRjaCBpbiBnZW5lcmFsIHdvcmtzIGJlZm9yZSB3ZSB0ZXN0IGVtcHR5LXN0cmluZy9udWxsIGNvbW1hbmQgSUQnLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGtleSA9IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLO1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKGtleSwgJ215Q29tbWFuZCcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRcdGNvbnN0IHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChrZXkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIChbeyBjb21tYW5kSWQ6ICdteUNvbW1hbmQnLCBhcmdzOiBbbnVsbF0gfV0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbXVsdGktY2hvcmQga2V5YmluZGluZyBpcyBkaXNwYXRjaGVkIGNvcnJlY3RseScsICgpID0+IHtcblxuXHRcdFx0Y29uc3QgY2hvcmQwID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUs7XG5cdFx0XHRjb25zdCBjaG9yZDEgPSBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5STtcblx0XHRcdGNvbnN0IGtleSA9IFtjaG9yZDAsIGNob3JkMV07XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oa2V5LCAnbXlDb21tYW5kJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXG5cdFx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKGNob3JkMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cblx0XHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChjaG9yZDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIChbeyBjb21tYW5kSWQ6ICdteUNvbW1hbmQnLCBhcmdzOiBbbnVsbF0gfV0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIChbYCgke3RvVXNMYWJlbChjaG9yZDApfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdrZXliaW5kaW5ncyB3aXRoIGVtcHR5LXN0cmluZy9udWxsIGNvbW1hbmQgSUQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhIHNpbmdsZS1jaG9yZCBrZXliaW5kaW5nIHdpdGggYW4gZW1wdHkgc3RyaW5nIGNvbW1hbmQgSUQgdW5iaW5kcyB0aGUga2V5YmluZGluZyAoc2hvdWxkUHJldmVudERlZmF1bHQgPSBmYWxzZSknLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ215Q29tbWFuZCcpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICcnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzaW5nbGUtY2hvcmQga2V5YmluZGluZyB3aXRoIGEgbnVsbCBjb21tYW5kIElEIHVuYmluZHMgdGhlIGtleWJpbmRpbmcgKHNob3VsZFByZXZlbnREZWZhdWx0ID0gZmFsc2UpJywgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBudWxsKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBtdWx0aS1jaG9yZCBrZXliaW5kaW5nIHdpdGggYW4gZW1wdHktc3RyaW5nIGNvbW1hbmQgSUQga2VlcHMgdGhlIGtleWJpbmRpbmcgKHNob3VsZFByZXZlbnREZWZhdWx0ID0gdHJ1ZSknLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IGNob3JkMCA9IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLO1xuXHRcdFx0Y29uc3QgY2hvcmQxID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUk7XG5cdFx0XHRjb25zdCBrZXkgPSBbY2hvcmQwLCBjaG9yZDFdO1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKGtleSwgJ215Q29tbWFuZCcpLFxuXHRcdFx0XHRrYkl0ZW0oa2V5LCAnJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe30pO1xuXG5cdFx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblxuXHRcdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCAoW2AoJHt0b1VzTGFiZWwoY2hvcmQwKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYCwgYFRoZSBrZXkgY29tYmluYXRpb24gKCR7dG9Vc0xhYmVsKGNob3JkMCl9LCAke3RvVXNMYWJlbChjaG9yZDEpfSkgaXMgbm90IGEgY29tbWFuZC5gXSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIG11bHRpLWNob3JkIGtleWJpbmRpbmcgd2l0aCBhIG51bGwgY29tbWFuZCBJRCBrZWVwcyB0aGUga2V5YmluZGluZyAoc2hvdWxkUHJldmVudERlZmF1bHQgPSB0cnVlKScsICgpID0+IHtcblxuXHRcdFx0Y29uc3QgY2hvcmQwID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUs7XG5cdFx0XHRjb25zdCBjaG9yZDEgPSBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5STtcblx0XHRcdGNvbnN0IGtleSA9IFtjaG9yZDAsIGNob3JkMV07XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oa2V5LCAnbXlDb21tYW5kJyksXG5cdFx0XHRcdGtiSXRlbShrZXksIG51bGwpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblxuXHRcdFx0bGV0IHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmBdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cblx0XHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgKFtgKCR7dG9Vc0xhYmVsKGNob3JkMCl9KSB3YXMgcHJlc3NlZC4gV2FpdGluZyBmb3Igc2Vjb25kIGtleSBvZiBjaG9yZC4uLmAsIGBUaGUga2V5IGNvbWJpbmF0aW9uICgke3RvVXNMYWJlbChjaG9yZDApfSwgJHt0b1VzTGFiZWwoY2hvcmQxKX0pIGlzIG5vdCBhIGNvbW1hbmQuYF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIChbYCgke3RvVXNMYWJlbChjaG9yZDApfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXSkpO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjQ5ODogY2hvcmQgbW9kZSBpcyBxdWl0IGZvciBpbnZhbGlkIGNob3JkcycsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYKSwgJ2Nob3JkQ29tbWFuZCcpLFxuXHRcdFx0a2JJdGVtKEtleUNvZGUuQmFja3NwYWNlLCAnc2ltcGxlQ29tbWFuZCcpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIEtcblx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXG5cdFx0XHRgKCR7dG9Vc0xhYmVsKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIGJhY2tzcGFjZVxuXHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlDb2RlLkJhY2tzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW1xuXHRcdFx0YFRoZSBrZXkgY29tYmluYXRpb24gKCR7dG9Vc0xhYmVsKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKX0sICR7dG9Vc0xhYmVsKEtleUNvZGUuQmFja3NwYWNlKX0pIGlzIG5vdCBhIGNvbW1hbmQuYFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtcblx0XHRcdGAoJHt0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXG5cdFx0XSk7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0Ly8gc2VuZCBiYWNrc3BhY2Vcblx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5Q29kZS5CYWNrc3BhY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbe1xuXHRcdFx0Y29tbWFuZElkOiAnc2ltcGxlQ29tbWFuZCcsXG5cdFx0XHRhcmdzOiBbbnVsbF1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2ODMzOiBLZXliaW5kaW5nIHNlcnZpY2Ugc2hvdWxkIG5vdCB0ZXN0RGlzcGF0Y2ggb24gbW9kaWZpZXIga2V5cycsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5Q29kZS5DdHJsLCAnbm9wZScpLFxuXHRcdFx0a2JJdGVtKEtleUNvZGUuTWV0YSwgJ25vcGUnKSxcblx0XHRcdGtiSXRlbShLZXlDb2RlLkFsdCwgJ25vcGUnKSxcblx0XHRcdGtiSXRlbShLZXlDb2RlLlNoaWZ0LCAnbm9wZScpLFxuXG5cdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQsICdub3BlJyksXG5cdFx0XHRrYkl0ZW0oS2V5TW9kLldpbkN0cmwsICdub3BlJyksXG5cdFx0XHRrYkl0ZW0oS2V5TW9kLkFsdCwgJ25vcGUnKSxcblx0XHRcdGtiSXRlbShLZXlNb2QuU2hpZnQsICdub3BlJyksXG5cdFx0XSk7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRJc0lnbm9yZWQoa2V5YmluZGluZzogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goa2V5YmluZGluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCwgW10pO1xuXHRcdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdFx0c3RhdHVzTWVzc2FnZUNhbGxzID0gW107XG5cdFx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXHRcdH1cblxuXHRcdGFzc2VydElzSWdub3JlZChLZXlDb2RlLkN0cmwpO1xuXHRcdGFzc2VydElzSWdub3JlZChLZXlDb2RlLk1ldGEpO1xuXHRcdGFzc2VydElzSWdub3JlZChLZXlDb2RlLkFsdCk7XG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleUNvZGUuU2hpZnQpO1xuXG5cdFx0YXNzZXJ0SXNJZ25vcmVkKEtleU1vZC5DdHJsQ21kKTtcblx0XHRhc3NlcnRJc0lnbm9yZWQoS2V5TW9kLldpbkN0cmwpO1xuXHRcdGFzc2VydElzSWdub3JlZChLZXlNb2QuQWx0KTtcblx0XHRhc3NlcnRJc0lnbm9yZWQoS2V5TW9kLlNoaWZ0KTtcblxuXHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleWJpbmRpbmdzIGFyZSBub3QgZGlzcGF0Y2hlZCB3aGlsZSBhbiBJTUUgY29tcG9zaXRpb24gaXMgaW4gcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0a2JJdGVtKEtleUNvZGUuRW50ZXIsICdlbnRlckNvbW1hbmQnKSxcblx0XHRdKTtcblxuXHRcdC8vIEVudGVyIGNvbW1pdHMgdGhlIElNRSBjb21wb3NpdGlvbiBhbmQgYmVsb25ncyB0byB0aGUgaW5wdXQgbWV0aG9kLCBub3QgdG8gdGhlIHdvcmtiZW5jaC5cblx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdFdoaWxlQ29tcG9zaW5nID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlDb2RlLkVudGVyLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W3Nob3VsZFByZXZlbnREZWZhdWx0V2hpbGVDb21wb3NpbmcsIGV4ZWN1dGVDb21tYW5kQ2FsbHNdLFxuXHRcdFx0W2ZhbHNlLCBbXV1cblx0XHQpO1xuXG5cdFx0Ly8gYHNvZnREaXNwYXRjaGAgbXVzdCBhZ3JlZSwgb3RoZXJ3aXNlIGNhbGxlcnMgdGhhdCBhc2sgXCJ3aWxsIHRoZSB3b3JrYmVuY2ggY2xhaW0gdGhpcyBrZXk/XCJcblx0XHQvLyBwcmV2ZW50IHRoZSBkZWZhdWx0IGFuZCB0aGVuIG5vYm9keSBoYW5kbGVzIHRoZSBrZXlzdHJva2UuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0a2JTZXJ2aWNlLnRlc3RTb2Z0RGlzcGF0Y2goS2V5Q29kZS5FbnRlciwgdHJ1ZSkua2luZCxcblx0XHRcdFJlc3VsdEtpbmQuTm9NYXRjaGluZ0tiXG5cdFx0KTtcblxuXHRcdC8vIE9uY2UgdGhlIGNvbXBvc2l0aW9uIGhhcyBjb21taXR0ZWQsIHRoZSB2ZXJ5IHNhbWUga2V5IHJ1bnMgdGhlIGNvbW1hbmQgYXMgdXN1YWwuXG5cdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleUNvZGUuRW50ZXIsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W3Nob3VsZFByZXZlbnREZWZhdWx0LCBleGVjdXRlQ29tbWFuZENhbGxzXSxcblx0XHRcdFt0cnVlLCBbeyBjb21tYW5kSWQ6ICdlbnRlckNvbW1hbmQnLCBhcmdzOiBbbnVsbF0gfV1dXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRrYlNlcnZpY2UudGVzdFNvZnREaXNwYXRjaChLZXlDb2RlLkVudGVyLCBmYWxzZSkua2luZCxcblx0XHRcdFJlc3VsdEtpbmQuS2JGb3VuZFxuXHRcdCk7XG5cblx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gdHJpZ2dlciBjb21tYW5kIHRoYXQgaXMgc2hhcmluZyBrZXliaW5kaW5nIHdpdGggY2hvcmQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0a2JJdGVtKEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WCksICdjaG9yZENvbW1hbmQnKSxcblx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ3NpbXBsZUNvbW1hbmQnLCBDb250ZXh0S2V5RXhwci5oYXMoJ2tleTEnKSksXG5cdFx0XSk7XG5cblxuXHRcdC8vIHNlbmQgQ3RybC9DbWQgKyBLXG5cdFx0Y3VycmVudENvbnRleHRWYWx1ZSA9IGNyZWF0ZUNvbnRleHQoe1xuXHRcdFx0a2V5MTogdHJ1ZVxuXHRcdH0pO1xuXHRcdGxldCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbe1xuXHRcdFx0Y29tbWFuZElkOiAnc2ltcGxlQ29tbWFuZCcsXG5cdFx0XHRhcmdzOiBbbnVsbF1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIEtcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhlY3V0ZUNvbW1hbmRDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hvd01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzLCBbXG5cdFx0XHRgKCR7dG9Vc0xhYmVsKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKX0pIHdhcyBwcmVzc2VkLiBXYWl0aW5nIGZvciBzZWNvbmQga2V5IG9mIGNob3JkLi4uYFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgWFxuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbe1xuXHRcdFx0Y29tbWFuZElkOiAnY2hvcmRDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtcblx0XHRcdGAoJHt0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5gXG5cdFx0XSk7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY2Fubm90IHRyaWdnZXIgY2hvcmQgaWYgY29tbWFuZCBpcyBvdmVyd3JpdGluZycsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYKSwgJ2Nob3JkQ29tbWFuZCcsIENvbnRleHRLZXlFeHByLmhhcygna2V5MScpKSxcblx0XHRcdGtiSXRlbShLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgJ3NpbXBsZUNvbW1hbmQnKSxcblx0XHRdKTtcblxuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIEtcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cdFx0bGV0IHNob3VsZFByZXZlbnREZWZhdWx0ID0ga2JTZXJ2aWNlLnRlc3REaXNwYXRjaChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNob3VsZFByZXZlbnREZWZhdWx0LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdzaW1wbGVDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHQvLyBzZW5kIEN0cmwvQ21kICsgS1xuXHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHtcblx0XHRcdGtleTE6IHRydWVcblx0XHR9KTtcblx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IGtiU2VydmljZS50ZXN0RGlzcGF0Y2goS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaG91bGRQcmV2ZW50RGVmYXVsdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRlQ29tbWFuZENhbGxzLCBbe1xuXHRcdFx0Y29tbWFuZElkOiAnc2ltcGxlQ29tbWFuZCcsXG5cdFx0XHRhcmdzOiBbbnVsbF1cblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaG93TWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0dXNNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkLCBbXSk7XG5cdFx0ZXhlY3V0ZUNvbW1hbmRDYWxscyA9IFtdO1xuXHRcdHNob3dNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHMgPSBbXTtcblx0XHRzdGF0dXNNZXNzYWdlQ2FsbHNEaXNwb3NlZCA9IFtdO1xuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIFhcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7XG5cdFx0XHRrZXkxOiB0cnVlXG5cdFx0fSk7XG5cdFx0c2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlYKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gaGF2ZSBzcHlpbmcgY29tbWFuZCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGtiU2VydmljZSA9IGNyZWF0ZVRlc3RLZXliaW5kaW5nU2VydmljZShbXG5cdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdec2ltcGxlQ29tbWFuZCcpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gc2VuZCBDdHJsL0NtZCArIEtcblx0XHRjdXJyZW50Q29udGV4dFZhbHVlID0gY3JlYXRlQ29udGV4dCh7fSk7XG5cdFx0Y29uc3Qgc2hvdWxkUHJldmVudERlZmF1bHQgPSBrYlNlcnZpY2UudGVzdERpc3BhdGNoKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvdWxkUHJldmVudERlZmF1bHQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4ZWN1dGVDb21tYW5kQ2FsbHMsIFt7XG5cdFx0XHRjb21tYW5kSWQ6ICdzaW1wbGVDb21tYW5kJyxcblx0XHRcdGFyZ3M6IFtudWxsXVxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNob3dNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c01lc3NhZ2VDYWxscywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdHVzTWVzc2FnZUNhbGxzRGlzcG9zZWQsIFtdKTtcblx0XHRleGVjdXRlQ29tbWFuZENhbGxzID0gW107XG5cdFx0c2hvd01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxscyA9IFtdO1xuXHRcdHN0YXR1c01lc3NhZ2VDYWxsc0Rpc3Bvc2VkID0gW107XG5cblx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXBwZW5kS2V5YmluZGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdhcHBlbmRzIGtleWJpbmRpbmcgbGFiZWwgd2hlbiBjb21tYW5kIGhhcyBhIGtleWJpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnTXkgTGFiZWwnLCAnbXlDb21tYW5kJyk7XG5cdFx0XHRjb25zdCBleHBlY3RlZExhYmVsID0gdG9Vc0xhYmVsKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGBNeSBMYWJlbCAoJHtleHBlY3RlZExhYmVsfSlgKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb25seSBsYWJlbCB3aGVuIGNvbW1hbmQgaGFzIG5vIGtleWJpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW10pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnTXkgTGFiZWwnLCAnbXlDb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnTXkgTGFiZWwnKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb25seSBsYWJlbCB3aGVuIGNvbW1hbmRJZCBpcyBudWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0ga2JTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJ015IExhYmVsJywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnTXkgTGFiZWwnKTtcblxuXHRcdFx0a2JTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgb25seSBsYWJlbCB3aGVuIGNvbW1hbmRJZCBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnTXkgTGFiZWwnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ015IExhYmVsJyk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG9ubHkgbGFiZWwgd2hlbiBjb21tYW5kSWQgaXMgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0ga2JTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJ015IExhYmVsJywgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ015IExhYmVsJyk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRzIGtleWJpbmRpbmcgZm9yIGNvbW1hbmQgd2l0aCBjb250ZXh0IHdoZW4gY29udGV4dCBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJywgQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHsga2V5MTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsICdteUNvbW1hbmQnKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTGFiZWwgPSB0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgYE15IExhYmVsICgke2V4cGVjdGVkTGFiZWx9KWApO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBvbmx5IGxhYmVsIHdoZW4gY29udGV4dCBkb2VzIG5vdCBtYXRjaCBhbmQgZW5mb3JjZUNvbnRleHRDaGVjayBpcyB0cnVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJywgQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsICdteUNvbW1hbmQnLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ015IExhYmVsJyk7XG5cblx0XHRcdGtiU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRzIGtleWJpbmRpbmcgd2hlbiBjb250ZXh0IGRvZXMgbm90IG1hdGNoIGJ1dCBlbmZvcmNlQ29udGV4dENoZWNrIGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qga2JTZXJ2aWNlID0gY3JlYXRlVGVzdEtleWJpbmRpbmdTZXJ2aWNlKFtcblx0XHRcdFx0a2JJdGVtKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCAnbXlDb21tYW5kJywgQ29udGV4dEtleUV4cHIuaGFzKCdrZXkxJykpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGN1cnJlbnRDb250ZXh0VmFsdWUgPSBjcmVhdGVDb250ZXh0KHt9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGtiU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKCdNeSBMYWJlbCcsICdteUNvbW1hbmQnLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTGFiZWwgPSB0b1VzTGFiZWwoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgYE15IExhYmVsICgke2V4cGVjdGVkTGFiZWx9KWApO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kcyBrZXliaW5kaW5nIGV2ZW4gd2hlbiBsYWJlbCBpcyBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBrYlNlcnZpY2UgPSBjcmVhdGVUZXN0S2V5YmluZGluZ1NlcnZpY2UoW1xuXHRcdFx0XHRrYkl0ZW0oS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssICdteUNvbW1hbmQnKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBrYlNlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnJywgJ215Q29tbWFuZCcpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRMYWJlbCA9IHRvVXNMYWJlbChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Syk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBgICgke2V4cGVjdGVkTGFiZWx9KWApO1xuXG5cdFx0XHRrYlNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FB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
