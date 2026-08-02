import assert from "assert";
import { decodeKeybinding, createSimpleKeybinding } from "../../../../base/common/keybindings.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { OS } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ContextKeyExpr } from "../../../contextkey/common/contextkey.js";
import { KeybindingResolver, ResultKind } from "../../common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../common/usLayoutResolvedKeybinding.js";
import { createUSLayoutResolvedKeybinding } from "./keybindingsTestUtils.js";
function createContext(ctx) {
  return {
    getValue: (key) => {
      return ctx[key];
    }
  };
}
suite("KeybindingResolver", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function kbItem(keybinding, command, commandArgs, when, isDefault) {
    const resolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
    return new ResolvedKeybindingItem(
      resolvedKeybinding,
      command,
      commandArgs,
      when,
      isDefault,
      null,
      false
    );
  }
  function getDispatchStr(chord) {
    return USLayoutResolvedKeybinding.getDispatchStr(chord);
  }
  test("resolve key", () => {
    const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
    const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
    const contextRules = ContextKeyExpr.equals("bar", "baz");
    const keybindingItem = kbItem(keybinding, "yes", null, contextRules, true);
    assert.strictEqual(contextRules.evaluate(createContext({ bar: "baz" })), true);
    assert.strictEqual(contextRules.evaluate(createContext({ bar: "bz" })), false);
    const resolver = new KeybindingResolver([keybindingItem], [], () => {
    });
    const r1 = resolver.resolve(createContext({ bar: "baz" }), [], getDispatchStr(runtimeKeybinding));
    assert.ok(r1.kind === ResultKind.KbFound);
    assert.strictEqual(r1.commandId, "yes");
    const r2 = resolver.resolve(createContext({ bar: "bz" }), [], getDispatchStr(runtimeKeybinding));
    assert.strictEqual(r2.kind, ResultKind.NoMatchingKb);
  });
  test("resolve key with arguments", () => {
    const commandArgs = { text: "no" };
    const keybinding = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ;
    const runtimeKeybinding = createSimpleKeybinding(keybinding, OS);
    const contextRules = ContextKeyExpr.equals("bar", "baz");
    const keybindingItem = kbItem(keybinding, "yes", commandArgs, contextRules, true);
    const resolver = new KeybindingResolver([keybindingItem], [], () => {
    });
    const r = resolver.resolve(createContext({ bar: "baz" }), [], getDispatchStr(runtimeKeybinding));
    assert.ok(r.kind === ResultKind.KbFound);
    assert.strictEqual(r.commandArgs, commandArgs);
  });
  suite("handle keybinding removals", () => {
    test("simple 1", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), false)
      ]);
    });
    test("simple 2", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyC, "yes3", null, ContextKeyExpr.equals("3", "c"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true),
        kbItem(KeyCode.KeyC, "yes3", null, ContextKeyExpr.equals("3", "c"), false)
      ]);
    });
    test("removal with not matching when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, ContextKeyExpr.equals("1", "b"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with not matching keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyB, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with matching keybinding and when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(0, "-yes1", null, ContextKeyExpr.equals("1", "a"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified when", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("removal with unspecified when and unspecified keybinding", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(0, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("issue #138997 - removal in default list", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "yes1", null, void 0, true),
        kbItem(KeyCode.KeyB, "yes2", null, void 0, true),
        kbItem(0, "-yes1", null, void 0, false)
      ];
      const overrides = [];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, void 0, true)
      ]);
    });
    test("issue #612#issuecomment-222109084 cannot remove keybindings for commands with ^", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "^yes1", null, ContextKeyExpr.equals("1", "a"), true),
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-yes1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyB, "yes2", null, ContextKeyExpr.equals("2", "b"), true)
      ]);
    });
    test("issue #140884 Unable to reassign F1 as keybinding for Show All Commands", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, void 0, false),
        kbItem(KeyCode.KeyA, "command1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, void 0, false)
      ]);
    });
    test("issue #141638: Keyboard Shortcuts: Change When Expression might actually remove keybinding in Insiders", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.equals("a", "1"), false),
        kbItem(KeyCode.KeyA, "-command1", null, void 0, false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.equals("a", "1"), false)
      ]);
    });
    test("issue #157751: Auto-quoting of context keys prevents removal of keybindings via UI", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != workbench.editor.notebook && editorLangId in julia.supportedLanguageIds`), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.deserialize(`editorTextFocus && activeEditor != 'workbench.editor.notebook' && editorLangId in 'julia.supportedLanguageIds'`), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("issue #293802: removal still matches when default when clause becomes more specific", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.and(ContextKeyExpr.has("inChatInput"), ContextKeyExpr.not("withinEditSessionDiff")), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.has("inChatInput"), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("removal with more specific when clause does not match broader default", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.has("inChatInput"), true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.and(ContextKeyExpr.has("inChatInput"), ContextKeyExpr.not("withinEditSessionDiff")), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, [
        kbItem(KeyCode.KeyA, "command1", null, ContextKeyExpr.has("inChatInput"), true)
      ]);
    });
    test("issue #160604: Remove keybindings with when clause does not work", () => {
      const defaults = [
        kbItem(KeyCode.KeyA, "command1", null, void 0, true)
      ];
      const overrides = [
        kbItem(KeyCode.KeyA, "-command1", null, ContextKeyExpr.true(), false)
      ];
      const actual = KeybindingResolver.handleRemovals([...defaults, ...overrides]);
      assert.deepStrictEqual(actual, []);
    });
    test("contextIsEntirelyIncluded", () => {
      const toContextKeyExpression = (expr) => {
        if (typeof expr === "string" || !expr) {
          return ContextKeyExpr.deserialize(expr);
        }
        return expr;
      };
      const assertIsIncluded = (a, b) => {
        assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), true);
      };
      const assertIsNotIncluded = (a, b) => {
        assert.strictEqual(KeybindingResolver.whenIsEntirelyIncluded(toContextKeyExpression(a), toContextKeyExpression(b)), false);
      };
      assertIsIncluded(null, null);
      assertIsIncluded(null, ContextKeyExpr.true());
      assertIsIncluded(ContextKeyExpr.true(), null);
      assertIsIncluded(ContextKeyExpr.true(), ContextKeyExpr.true());
      assertIsIncluded("key1", null);
      assertIsIncluded("key1", "");
      assertIsIncluded("key1", "key1");
      assertIsIncluded("key1", ContextKeyExpr.true());
      assertIsIncluded("!key1", "");
      assertIsIncluded("!key1", "!key1");
      assertIsIncluded("key2", "");
      assertIsIncluded("key2", "key2");
      assertIsIncluded("key1 && key1 && key2 && key2", "key2");
      assertIsIncluded("key1 && key2", "key2");
      assertIsIncluded("key1 && key2", "key1");
      assertIsIncluded("key1 && key2", "");
      assertIsIncluded("key1", "key1 || key2");
      assertIsIncluded("key1 || !key1", "key2 || !key2");
      assertIsIncluded("key1", "key1 || key2 && key3");
      assertIsNotIncluded("key1", "!key1");
      assertIsNotIncluded("!key1", "key1");
      assertIsNotIncluded("key1 && key2", "key3");
      assertIsNotIncluded("key1 && key2", "key4");
      assertIsNotIncluded("key1", "key2");
      assertIsNotIncluded("key1 || key2", "key2");
      assertIsNotIncluded("", "key2");
      assertIsNotIncluded(null, "key2");
    });
  });
  suite("resolve command", () => {
    function _kbItem(keybinding, command, when) {
      return kbItem(keybinding, command, null, when, true);
    }
    const items = [
      // This one will never match because its "when" is always overwritten by another one
      _kbItem(
        KeyCode.KeyX,
        "first",
        ContextKeyExpr.and(
          ContextKeyExpr.equals("key1", true),
          ContextKeyExpr.notEquals("key2", false)
        )
      ),
      // This one always overwrites first
      _kbItem(
        KeyCode.KeyX,
        "second",
        ContextKeyExpr.equals("key2", true)
      ),
      // This one is a secondary mapping for `second`
      _kbItem(
        KeyCode.KeyZ,
        "second",
        void 0
      ),
      // This one sometimes overwrites first
      _kbItem(
        KeyCode.KeyX,
        "third",
        ContextKeyExpr.equals("key3", true)
      ),
      // This one is always overwritten by another one
      _kbItem(
        KeyMod.CtrlCmd | KeyCode.KeyY,
        "fourth",
        ContextKeyExpr.equals("key4", true)
      ),
      // This one overwrites with a chord the previous one
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ),
        "fifth",
        void 0
      ),
      // This one has no keybinding
      _kbItem(
        0,
        "sixth",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
        "seventh",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK),
        "seventh",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU),
        "uncomment lines",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        // cmd+k cmd+c
        "comment lines",
        void 0
      ),
      _kbItem(
        KeyChord(KeyMod.CtrlCmd | KeyCode.KeyG, KeyMod.CtrlCmd | KeyCode.KeyC),
        // cmd+g cmd+c
        "unreachablechord",
        void 0
      ),
      _kbItem(
        KeyMod.CtrlCmd | KeyCode.KeyG,
        // cmd+g
        "eleven",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB],
        // cmd+k a b
        "long multi chord",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC],
        // cmd+b cmd+c
        "shadowed by long-multi-chord-2",
        void 0
      ),
      _kbItem(
        [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI],
        // cmd+b cmd+c i
        "long-multi-chord-2",
        void 0
      )
    ];
    const resolver = new KeybindingResolver(items, [], () => {
    });
    const testKbLookupByCommand = (commandId, expectedKeys) => {
      const lookupResult = resolver.lookupKeybindings(commandId);
      assert.strictEqual(lookupResult.length, expectedKeys.length, "Length mismatch @ commandId " + commandId);
      for (let i = 0, len = lookupResult.length; i < len; i++) {
        const expected = createUSLayoutResolvedKeybinding(expectedKeys[i], OS);
        assert.strictEqual(lookupResult[i].resolvedKeybinding.getUserSettingsLabel(), expected.getUserSettingsLabel(), "value mismatch @ commandId " + commandId);
      }
    };
    const testResolve = (ctx, _expectedKey, commandId) => {
      const expectedKeybinding = decodeKeybinding(_expectedKey, OS);
      const previousChord = [];
      for (let i = 0, len = expectedKeybinding.chords.length; i < len; i++) {
        const chord = getDispatchStr(expectedKeybinding.chords[i]);
        const result = resolver.resolve(ctx, previousChord, chord);
        if (i === len - 1) {
          assert.ok(result.kind === ResultKind.KbFound, `Enters multi chord for ${commandId} at chord ${i}`);
          assert.strictEqual(result.commandId, commandId, `Enters multi chord for ${commandId} at chord ${i}`);
        } else if (i > 0) {
          assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Continues multi chord for ${commandId} at chord ${i}`);
        } else {
          assert.ok(result.kind === ResultKind.MoreChordsNeeded, `Enters multi chord for ${commandId} at chord ${i}`);
        }
        previousChord.push(chord);
      }
    };
    test("resolve command - 1", () => {
      testKbLookupByCommand("first", []);
    });
    test("resolve command - 2", () => {
      testKbLookupByCommand("second", [KeyCode.KeyZ, KeyCode.KeyX]);
      testResolve(createContext({ key2: true }), KeyCode.KeyX, "second");
      testResolve(createContext({}), KeyCode.KeyZ, "second");
    });
    test("resolve command - 3", () => {
      testKbLookupByCommand("third", [KeyCode.KeyX]);
      testResolve(createContext({ key3: true }), KeyCode.KeyX, "third");
    });
    test("resolve command - 4", () => {
      testKbLookupByCommand("fourth", []);
    });
    test("resolve command - 5", () => {
      testKbLookupByCommand("fifth", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyY, KeyCode.KeyZ), "fifth");
    });
    test("resolve command - 6", () => {
      testKbLookupByCommand("seventh", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyK), "seventh");
    });
    test("resolve command - 7", () => {
      testKbLookupByCommand("uncomment lines", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyU), "uncomment lines");
    });
    test("resolve command - 8", () => {
      testKbLookupByCommand("comment lines", [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC)]);
      testResolve(createContext({}), KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC), "comment lines");
    });
    test("resolve command - 9", () => {
      testKbLookupByCommand("unreachablechord", []);
    });
    test("resolve command - 10", () => {
      testKbLookupByCommand("eleven", [KeyMod.CtrlCmd | KeyCode.KeyG]);
      testResolve(createContext({}), KeyMod.CtrlCmd | KeyCode.KeyG, "eleven");
    });
    test("resolve command - 11", () => {
      testKbLookupByCommand("sixth", []);
    });
    test("resolve command - 12", () => {
      testKbLookupByCommand("long multi chord", [[KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB]]);
      testResolve(createContext({}), [KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyA, KeyCode.KeyB], "long multi chord");
    });
    const emptyContext = createContext({});
    test("KBs having common prefix - the one defined later is returned", () => {
      testResolve(emptyContext, [KeyMod.CtrlCmd | KeyCode.KeyB, KeyMod.CtrlCmd | KeyCode.KeyC, KeyCode.KeyI], "long-multi-chord-2");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBkZWNvZGVLZXliaW5kaW5nLCBjcmVhdGVTaW1wbGVLZXliaW5kaW5nLCBLZXlDb2RlQ2hvcmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdSZXNvbHZlciwgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcbmltcG9ydCB7IFVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi9rZXliaW5kaW5nc1Rlc3RVdGlscy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHQoY3R4OiBhbnkpIHtcblx0cmV0dXJuIHtcblx0XHRnZXRWYWx1ZTogKGtleTogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gY3R4W2tleV07XG5cdFx0fVxuXHR9O1xufVxuXG5zdWl0ZSgnS2V5YmluZGluZ1Jlc29sdmVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGtiSXRlbShrZXliaW5kaW5nOiBudW1iZXIgfCBudW1iZXJbXSwgY29tbWFuZDogc3RyaW5nLCBjb21tYW5kQXJnczogYW55LCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgaXNEZWZhdWx0OiBib29sZWFuKTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5nID0gY3JlYXRlVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpO1xuXHRcdHJldHVybiBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbShcblx0XHRcdHJlc29sdmVkS2V5YmluZGluZyxcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRjb21tYW5kQXJncyxcblx0XHRcdHdoZW4sXG5cdFx0XHRpc0RlZmF1bHQsXG5cdFx0XHRudWxsLFxuXHRcdFx0ZmFsc2Vcblx0XHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0RGlzcGF0Y2hTdHIoY2hvcmQ6IEtleUNvZGVDaG9yZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmdldERpc3BhdGNoU3RyKGNob3JkKSE7XG5cdH1cblxuXHR0ZXN0KCdyZXNvbHZlIGtleScsICgpID0+IHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVo7XG5cdFx0Y29uc3QgcnVudGltZUtleWJpbmRpbmcgPSBjcmVhdGVTaW1wbGVLZXliaW5kaW5nKGtleWJpbmRpbmcsIE9TKTtcblx0XHRjb25zdCBjb250ZXh0UnVsZXMgPSBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2JhcicsICdiYXonKTtcblx0XHRjb25zdCBrZXliaW5kaW5nSXRlbSA9IGtiSXRlbShrZXliaW5kaW5nLCAneWVzJywgbnVsbCwgY29udGV4dFJ1bGVzLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0UnVsZXMuZXZhbHVhdGUoY3JlYXRlQ29udGV4dCh7IGJhcjogJ2JheicgfSkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dFJ1bGVzLmV2YWx1YXRlKGNyZWF0ZUNvbnRleHQoeyBiYXI6ICdieicgfSkpLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZXNvbHZlciA9IG5ldyBLZXliaW5kaW5nUmVzb2x2ZXIoW2tleWJpbmRpbmdJdGVtXSwgW10sICgpID0+IHsgfSk7XG5cblx0XHRjb25zdCByMSA9IHJlc29sdmVyLnJlc29sdmUoY3JlYXRlQ29udGV4dCh7IGJhcjogJ2JheicgfSksIFtdLCBnZXREaXNwYXRjaFN0cihydW50aW1lS2V5YmluZGluZykpO1xuXHRcdGFzc2VydC5vayhyMS5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5jb21tYW5kSWQsICd5ZXMnKTtcblxuXHRcdGNvbnN0IHIyID0gcmVzb2x2ZXIucmVzb2x2ZShjcmVhdGVDb250ZXh0KHsgYmFyOiAnYnonIH0pLCBbXSwgZ2V0RGlzcGF0Y2hTdHIocnVudGltZUtleWJpbmRpbmcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIua2luZCwgUmVzdWx0S2luZC5Ob01hdGNoaW5nS2IpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIGtleSB3aXRoIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kQXJncyA9IHsgdGV4dDogJ25vJyB9O1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Wjtcblx0XHRjb25zdCBydW50aW1lS2V5YmluZGluZyA9IGNyZWF0ZVNpbXBsZUtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpO1xuXHRcdGNvbnN0IGNvbnRleHRSdWxlcyA9IENvbnRleHRLZXlFeHByLmVxdWFscygnYmFyJywgJ2JheicpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtID0ga2JJdGVtKGtleWJpbmRpbmcsICd5ZXMnLCBjb21tYW5kQXJncywgY29udGV4dFJ1bGVzLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihba2V5YmluZGluZ0l0ZW1dLCBbXSwgKCkgPT4geyB9KTtcblxuXHRcdGNvbnN0IHIgPSByZXNvbHZlci5yZXNvbHZlKGNyZWF0ZUNvbnRleHQoeyBiYXI6ICdiYXonIH0pLCBbXSwgZ2V0RGlzcGF0Y2hTdHIocnVudGltZUtleWJpbmRpbmcpKTtcblx0XHRhc3NlcnQub2soci5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmNvbW1hbmRBcmdzLCBjb21tYW5kQXJncyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdoYW5kbGUga2V5YmluZGluZyByZW1vdmFscycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NpbXBsZSAxJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIGZhbHNlKSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltcGxlIDInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QywgJ3llczMnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzMnLCAnYycpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUMsICd5ZXMzJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCczJywgJ2MnKSwgZmFsc2UpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmFsIHdpdGggbm90IG1hdGNoaW5nIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy15ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2InKSwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92YWwgd2l0aCBub3QgbWF0Y2hpbmcga2V5YmluZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMScsICdhJyksIHRydWUpLFxuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAnLXllczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIG1hdGNoaW5nIGtleWJpbmRpbmcgYW5kIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy15ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92YWwgd2l0aCB1bnNwZWNpZmllZCBrZXliaW5kaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICd5ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbSgwLCAnLXllczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIHVuc3BlY2lmaWVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy15ZXMxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZhbCB3aXRoIHVuc3BlY2lmaWVkIHdoZW4gYW5kIHVuc3BlY2lmaWVkIGtleWJpbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ3llczEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzEnLCAnYScpLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJzInLCAnYicpLCB0cnVlKVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKDAsICcteWVzMScsIG51bGwsIHVuZGVmaW5lZCwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICMxMzg5OTcgLSByZW1vdmFsIGluIGRlZmF1bHQgbGlzdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAneWVzMScsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdFx0a2JJdGVtKDAsICcteWVzMScsIG51bGwsIHVuZGVmaW5lZCwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtW10gPSBbXTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QiwgJ3llczInLCBudWxsLCB1bmRlZmluZWQsIHRydWUpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICM2MTIjaXNzdWVjb21tZW50LTIyMjEwOTA4NCBjYW5ub3QgcmVtb3ZlIGtleWJpbmRpbmdzIGZvciBjb21tYW5kcyB3aXRoIF4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ155ZXMxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcxJywgJ2EnKSwgdHJ1ZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUIsICd5ZXMyJywgbnVsbCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCcyJywgJ2InKSwgdHJ1ZSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICcteWVzMScsIG51bGwsIHVuZGVmaW5lZCwgZmFsc2UpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlCLCAneWVzMicsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnMicsICdiJyksIHRydWUpXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICMxNDA4ODQgVW5hYmxlIHRvIHJlYXNzaWduIEYxIGFzIGtleWJpbmRpbmcgZm9yIFNob3cgQWxsIENvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLWNvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIHVuZGVmaW5lZCwgZmFsc2UpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgdW5kZWZpbmVkLCBmYWxzZSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNzdWUgIzE0MTYzODogS2V5Ym9hcmQgU2hvcnRjdXRzOiBDaGFuZ2UgV2hlbiBFeHByZXNzaW9uIG1pZ2h0IGFjdHVhbGx5IHJlbW92ZSBrZXliaW5kaW5nIGluIEluc2lkZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnY29tbWFuZDEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2EnLCAnMScpLCBmYWxzZSksXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICctY29tbWFuZDEnLCBudWxsLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBLZXliaW5kaW5nUmVzb2x2ZXIuaGFuZGxlUmVtb3ZhbHMoWy4uLmRlZmF1bHRzLCAuLi5vdmVycmlkZXNdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmVxdWFscygnYScsICcxJyksIGZhbHNlKVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc3N1ZSAjMTU3NzUxOiBBdXRvLXF1b3Rpbmcgb2YgY29udGV4dCBrZXlzIHByZXZlbnRzIHJlbW92YWwgb2Yga2V5YmluZGluZ3MgdmlhIFVJJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGBlZGl0b3JUZXh0Rm9jdXMgJiYgYWN0aXZlRWRpdG9yICE9IHdvcmtiZW5jaC5lZGl0b3Iubm90ZWJvb2sgJiYgZWRpdG9yTGFuZ0lkIGluIGp1bGlhLnN1cHBvcnRlZExhbmd1YWdlSWRzYCksIHRydWUpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy1jb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGBlZGl0b3JUZXh0Rm9jdXMgJiYgYWN0aXZlRWRpdG9yICE9ICd3b3JrYmVuY2guZWRpdG9yLm5vdGVib29rJyAmJiBlZGl0b3JMYW5nSWQgaW4gJ2p1bGlhLnN1cHBvcnRlZExhbmd1YWdlSWRzJ2ApLCBmYWxzZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNzdWUgIzI5MzgwMjogcmVtb3ZhbCBzdGlsbCBtYXRjaGVzIHdoZW4gZGVmYXVsdCB3aGVuIGNsYXVzZSBiZWNvbWVzIG1vcmUgc3BlY2lmaWMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJ2NvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnaW5DaGF0SW5wdXQnKSwgQ29udGV4dEtleUV4cHIubm90KCd3aXRoaW5FZGl0U2Vzc2lvbkRpZmYnKSksIHRydWUpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy1jb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmhhcygnaW5DaGF0SW5wdXQnKSwgZmFsc2UpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IEtleWJpbmRpbmdSZXNvbHZlci5oYW5kbGVSZW1vdmFscyhbLi4uZGVmYXVsdHMsIC4uLm92ZXJyaWRlc10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92YWwgd2l0aCBtb3JlIHNwZWNpZmljIHdoZW4gY2xhdXNlIGRvZXMgbm90IG1hdGNoIGJyb2FkZXIgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnY29tbWFuZDEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5oYXMoJ2luQ2hhdElucHV0JyksIHRydWUpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IFtcblx0XHRcdFx0a2JJdGVtKEtleUNvZGUuS2V5QSwgJy1jb21tYW5kMScsIG51bGwsIENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5oYXMoJ2luQ2hhdElucHV0JyksIENvbnRleHRLZXlFeHByLm5vdCgnd2l0aGluRWRpdFNlc3Npb25EaWZmJykpLCBmYWxzZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnY29tbWFuZDEnLCBudWxsLCBDb250ZXh0S2V5RXhwci5oYXMoJ2luQ2hhdElucHV0JyksIHRydWUpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc3N1ZSAjMTYwNjA0OiBSZW1vdmUga2V5YmluZGluZ3Mgd2l0aCB3aGVuIGNsYXVzZSBkb2VzIG5vdCB3b3JrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBbXG5cdFx0XHRcdGtiSXRlbShLZXlDb2RlLktleUEsICdjb21tYW5kMScsIG51bGwsIHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3ZlcnJpZGVzID0gW1xuXHRcdFx0XHRrYkl0ZW0oS2V5Q29kZS5LZXlBLCAnLWNvbW1hbmQxJywgbnVsbCwgQ29udGV4dEtleUV4cHIudHJ1ZSgpLCBmYWxzZSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gS2V5YmluZGluZ1Jlc29sdmVyLmhhbmRsZVJlbW92YWxzKFsuLi5kZWZhdWx0cywgLi4ub3ZlcnJpZGVzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udGV4dElzRW50aXJlbHlJbmNsdWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvQ29udGV4dEtleUV4cHJlc3Npb24gPSAoZXhwcjogQ29udGV4dEtleUV4cHJlc3Npb24gfCBzdHJpbmcgfCBudWxsKSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZXhwciA9PT0gJ3N0cmluZycgfHwgIWV4cHIpIHtcblx0XHRcdFx0XHRyZXR1cm4gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoZXhwcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4cHI7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYXNzZXJ0SXNJbmNsdWRlZCA9IChhOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHN0cmluZyB8IG51bGwsIGI6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgc3RyaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoS2V5YmluZGluZ1Jlc29sdmVyLndoZW5Jc0VudGlyZWx5SW5jbHVkZWQodG9Db250ZXh0S2V5RXhwcmVzc2lvbihhKSwgdG9Db250ZXh0S2V5RXhwcmVzc2lvbihiKSksIHRydWUpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFzc2VydElzTm90SW5jbHVkZWQgPSAoYTogQ29udGV4dEtleUV4cHJlc3Npb24gfCBzdHJpbmcgfCBudWxsLCBiOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEtleWJpbmRpbmdSZXNvbHZlci53aGVuSXNFbnRpcmVseUluY2x1ZGVkKHRvQ29udGV4dEtleUV4cHJlc3Npb24oYSksIHRvQ29udGV4dEtleUV4cHJlc3Npb24oYikpLCBmYWxzZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKG51bGwsIG51bGwpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZChudWxsLCBDb250ZXh0S2V5RXhwci50cnVlKCkpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZChDb250ZXh0S2V5RXhwci50cnVlKCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZChDb250ZXh0S2V5RXhwci50cnVlKCksIENvbnRleHRLZXlFeHByLnRydWUoKSk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgbnVsbCk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgJycpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MScsICdrZXkxJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgQ29udGV4dEtleUV4cHIudHJ1ZSgpKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJyFrZXkxJywgJycpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgnIWtleTEnLCAnIWtleTEnKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTInLCAnJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkyJywgJ2tleTInKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEgJiYga2V5MSAmJiBrZXkyICYmIGtleTInLCAna2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MSAmJiBrZXkyJywgJ2tleTInKTtcblx0XHRcdGFzc2VydElzSW5jbHVkZWQoJ2tleTEgJiYga2V5MicsICdrZXkxJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxICYmIGtleTInLCAnJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgJ2tleTEgfHwga2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNJbmNsdWRlZCgna2V5MSB8fCAha2V5MScsICdrZXkyIHx8ICFrZXkyJyk7XG5cdFx0XHRhc3NlcnRJc0luY2x1ZGVkKCdrZXkxJywgJ2tleTEgfHwga2V5MiAmJiBrZXkzJyk7XG5cblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQoJ2tleTEnLCAnIWtleTEnKTtcblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQoJyFrZXkxJywgJ2tleTEnKTtcblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQoJ2tleTEgJiYga2V5MicsICdrZXkzJyk7XG5cdFx0XHRhc3NlcnRJc05vdEluY2x1ZGVkKCdrZXkxICYmIGtleTInLCAna2V5NCcpO1xuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZCgna2V5MScsICdrZXkyJyk7XG5cdFx0XHRhc3NlcnRJc05vdEluY2x1ZGVkKCdrZXkxIHx8IGtleTInLCAna2V5MicpO1xuXHRcdFx0YXNzZXJ0SXNOb3RJbmNsdWRlZCgnJywgJ2tleTInKTtcblx0XHRcdGFzc2VydElzTm90SW5jbHVkZWQobnVsbCwgJ2tleTInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmUgY29tbWFuZCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIF9rYkl0ZW0oa2V5YmluZGluZzogbnVtYmVyIHwgbnVtYmVyW10sIGNvbW1hbmQ6IHN0cmluZywgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpOiBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIHtcblx0XHRcdHJldHVybiBrYkl0ZW0oa2V5YmluZGluZywgY29tbWFuZCwgbnVsbCwgd2hlbiwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHQvLyBUaGlzIG9uZSB3aWxsIG5ldmVyIG1hdGNoIGJlY2F1c2UgaXRzIFwid2hlblwiIGlzIGFsd2F5cyBvdmVyd3JpdHRlbiBieSBhbm90aGVyIG9uZVxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q29kZS5LZXlYLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdrZXkxJywgdHJ1ZSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdrZXkyJywgZmFsc2UpXG5cdFx0XHRcdClcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBhbHdheXMgb3ZlcndyaXRlcyBmaXJzdFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q29kZS5LZXlYLFxuXHRcdFx0XHQnc2Vjb25kJyxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdrZXkyJywgdHJ1ZSlcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBpcyBhIHNlY29uZGFyeSBtYXBwaW5nIGZvciBgc2Vjb25kYFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q29kZS5LZXlaLFxuXHRcdFx0XHQnc2Vjb25kJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0Ly8gVGhpcyBvbmUgc29tZXRpbWVzIG92ZXJ3cml0ZXMgZmlyc3Rcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleUNvZGUuS2V5WCxcblx0XHRcdFx0J3RoaXJkJyxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdrZXkzJywgdHJ1ZSlcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBpcyBhbHdheXMgb3ZlcndyaXR0ZW4gYnkgYW5vdGhlciBvbmVcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlZLFxuXHRcdFx0XHQnZm91cnRoJyxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdrZXk0JywgdHJ1ZSlcblx0XHRcdCksXG5cdFx0XHQvLyBUaGlzIG9uZSBvdmVyd3JpdGVzIHdpdGggYSBjaG9yZCB0aGUgcHJldmlvdXMgb25lXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5WSwgS2V5Q29kZS5LZXlaKSxcblx0XHRcdFx0J2ZpZnRoJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0Ly8gVGhpcyBvbmUgaGFzIG5vIGtleWJpbmRpbmdcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdDAsXG5cdFx0XHRcdCdzaXh0aCcsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KSxcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5VSksXG5cdFx0XHRcdCdzZXZlbnRoJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKSxcblx0XHRcdFx0J3NldmVudGgnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVUpLFxuXHRcdFx0XHQndW5jb21tZW50IGxpbmVzJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0S2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDKSwgLy8gY21kK2sgY21kK2Ncblx0XHRcdFx0J2NvbW1lbnQgbGluZXMnLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCksXG5cdFx0XHRfa2JJdGVtKFxuXHRcdFx0XHRLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5RywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMpLCAvLyBjbWQrZyBjbWQrY1xuXHRcdFx0XHQndW5yZWFjaGFibGVjaG9yZCcsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KSxcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlHLCAvLyBjbWQrZ1xuXHRcdFx0XHQnZWxldmVuJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0W0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUEsIEtleUNvZGUuS2V5Ql0sIC8vIGNtZCtrIGEgYlxuXHRcdFx0XHQnbG9uZyBtdWx0aSBjaG9yZCcsXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KSxcblx0XHRcdF9rYkl0ZW0oXG5cdFx0XHRcdFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QiwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUNdLCAvLyBjbWQrYiBjbWQrY1xuXHRcdFx0XHQnc2hhZG93ZWQgYnkgbG9uZy1tdWx0aS1jaG9yZC0yJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpLFxuXHRcdFx0X2tiSXRlbShcblx0XHRcdFx0W0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QywgS2V5Q29kZS5LZXlJXSwgLy8gY21kK2IgY21kK2MgaVxuXHRcdFx0XHQnbG9uZy1tdWx0aS1jaG9yZC0yJyxcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHQpXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihpdGVtcywgW10sICgpID0+IHsgfSk7XG5cblx0XHRjb25zdCB0ZXN0S2JMb29rdXBCeUNvbW1hbmQgPSAoY29tbWFuZElkOiBzdHJpbmcsIGV4cGVjdGVkS2V5czogbnVtYmVyW10gfCBudW1iZXJbXVtdKSA9PiB7XG5cdFx0XHQvLyBUZXN0IGxvb2t1cFxuXHRcdFx0Y29uc3QgbG9va3VwUmVzdWx0ID0gcmVzb2x2ZXIubG9va3VwS2V5YmluZGluZ3MoY29tbWFuZElkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb29rdXBSZXN1bHQubGVuZ3RoLCBleHBlY3RlZEtleXMubGVuZ3RoLCAnTGVuZ3RoIG1pc21hdGNoIEAgY29tbWFuZElkICcgKyBjb21tYW5kSWQpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxvb2t1cFJlc3VsdC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IGNyZWF0ZVVTTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nKGV4cGVjdGVkS2V5c1tpXSwgT1MpITtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9va3VwUmVzdWx0W2ldLnJlc29sdmVkS2V5YmluZGluZyEuZ2V0VXNlclNldHRpbmdzTGFiZWwoKSwgZXhwZWN0ZWQuZ2V0VXNlclNldHRpbmdzTGFiZWwoKSwgJ3ZhbHVlIG1pc21hdGNoIEAgY29tbWFuZElkICcgKyBjb21tYW5kSWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0UmVzb2x2ZSA9IChjdHg6IElDb250ZXh0LCBfZXhwZWN0ZWRLZXk6IG51bWJlciB8IG51bWJlcltdLCBjb21tYW5kSWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRLZXliaW5kaW5nID0gZGVjb2RlS2V5YmluZGluZyhfZXhwZWN0ZWRLZXksIE9TKSE7XG5cblx0XHRcdGNvbnN0IHByZXZpb3VzQ2hvcmQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBleHBlY3RlZEtleWJpbmRpbmcuY2hvcmRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cblx0XHRcdFx0Y29uc3QgY2hvcmQgPSBnZXREaXNwYXRjaFN0cig8S2V5Q29kZUNob3JkPmV4cGVjdGVkS2V5YmluZGluZy5jaG9yZHNbaV0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVyLnJlc29sdmUoY3R4LCBwcmV2aW91c0Nob3JkLCBjaG9yZCk7XG5cblx0XHRcdFx0aWYgKGkgPT09IGxlbiAtIDEpIHtcblx0XHRcdFx0XHQvLyBpZiBpdCdzIHRoZSBmaW5hbCBjaG9yZCwgdGhlbiB3ZSBzaG91bGQgZmluZCBhIHZhbGlkIGNvbW1hbmQsXG5cdFx0XHRcdFx0Ly8gYW5kIHRoZXJlIHNob3VsZCBub3QgYmUgYSBjaG9yZC5cblx0XHRcdFx0XHRhc3NlcnQub2socmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuS2JGb3VuZCwgYEVudGVycyBtdWx0aSBjaG9yZCBmb3IgJHtjb21tYW5kSWR9IGF0IGNob3JkICR7aX1gKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNvbW1hbmRJZCwgY29tbWFuZElkLCBgRW50ZXJzIG11bHRpIGNob3JkIGZvciAke2NvbW1hbmRJZH0gYXQgY2hvcmQgJHtpfWApO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGkgPiAwKSB7XG5cdFx0XHRcdFx0Ly8gaWYgdGhpcyBpcyBhbiBpbnRlcm1lZGlhdGUgY2hvcmQsIHdlIHNob3VsZCBub3QgZmluZCBhIHZhbGlkIGNvbW1hbmQsXG5cdFx0XHRcdFx0Ly8gYW5kIHRoZXJlIHNob3VsZCBiZSBhbiBvcGVuIGNob3JkIHdlIGNvbnRpbnVlLlxuXHRcdFx0XHRcdGFzc2VydC5vayhyZXN1bHQua2luZCA9PT0gUmVzdWx0S2luZC5Nb3JlQ2hvcmRzTmVlZGVkLCBgQ29udGludWVzIG11bHRpIGNob3JkIGZvciAke2NvbW1hbmRJZH0gYXQgY2hvcmQgJHtpfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGlmIGl0J3Mgbm90IHRoZSBmaW5hbCBjaG9yZCBhbmQgbm90IGFuIGludGVybWVkaWF0ZSwgdGhlbiB3ZSBzaG91bGQgbm90XG5cdFx0XHRcdFx0Ly8gZmluZCBhIHZhbGlkIGNvbW1hbmQsIGFuZCB3ZSBzaG91bGQgZW50ZXIgYSBjaG9yZC5cblx0XHRcdFx0XHRhc3NlcnQub2socmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZCwgYEVudGVycyBtdWx0aSBjaG9yZCBmb3IgJHtjb21tYW5kSWR9IGF0IGNob3JkICR7aX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcmV2aW91c0Nob3JkLnB1c2goY2hvcmQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0KCdyZXNvbHZlIGNvbW1hbmQgLSAxJywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdmaXJzdCcsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ3NlY29uZCcsIFtLZXlDb2RlLktleVosIEtleUNvZGUuS2V5WF0pO1xuXHRcdFx0dGVzdFJlc29sdmUoY3JlYXRlQ29udGV4dCh7IGtleTI6IHRydWUgfSksIEtleUNvZGUuS2V5WCwgJ3NlY29uZCcpO1xuXHRcdFx0dGVzdFJlc29sdmUoY3JlYXRlQ29udGV4dCh7fSksIEtleUNvZGUuS2V5WiwgJ3NlY29uZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gMycsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgndGhpcmQnLCBbS2V5Q29kZS5LZXlYXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHsga2V5MzogdHJ1ZSB9KSwgS2V5Q29kZS5LZXlYLCAndGhpcmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ2ZvdXJ0aCcsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDUnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ2ZpZnRoJywgW0tleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlZLCBLZXlDb2RlLktleVopXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVksIEtleUNvZGUuS2V5WiksICdmaWZ0aCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gNicsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnc2V2ZW50aCcsIFtLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUspXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLKSwgJ3NldmVudGgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDcnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ3VuY29tbWVudCBsaW5lcycsIFtLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVUpXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlVKSwgJ3VuY29tbWVudCBsaW5lcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZSBjb21tYW5kIC0gOCcsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnY29tbWVudCBsaW5lcycsIFtLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMpXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlDKSwgJ2NvbW1lbnQgbGluZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDknLCAoKSA9PiB7XG5cdFx0XHR0ZXN0S2JMb29rdXBCeUNvbW1hbmQoJ3VucmVhY2hhYmxlY2hvcmQnLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlIGNvbW1hbmQgLSAxMCcsICgpID0+IHtcblx0XHRcdHRlc3RLYkxvb2t1cEJ5Q29tbWFuZCgnZWxldmVuJywgW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlHXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUcsICdlbGV2ZW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDExJywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdzaXh0aCcsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmUgY29tbWFuZCAtIDEyJywgKCkgPT4ge1xuXHRcdFx0dGVzdEtiTG9va3VwQnlDb21tYW5kKCdsb25nIG11bHRpIGNob3JkJywgW1tLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlBLCBLZXlDb2RlLktleUJdXSk7XG5cdFx0XHR0ZXN0UmVzb2x2ZShjcmVhdGVDb250ZXh0KHt9KSwgW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUEsIEtleUNvZGUuS2V5Ql0sICdsb25nIG11bHRpIGNob3JkJyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbXB0eUNvbnRleHQgPSBjcmVhdGVDb250ZXh0KHt9KTtcblxuXHRcdHRlc3QoJ0tCcyBoYXZpbmcgY29tbW9uIHByZWZpeCAtIHRoZSBvbmUgZGVmaW5lZCBsYXRlciBpcyByZXR1cm5lZCcsICgpID0+IHtcblx0XHRcdHRlc3RSZXNvbHZlKGVtcHR5Q29udGV4dCwgW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QywgS2V5Q29kZS5LZXlJXSwgJ2xvbmctbXVsdGktY2hvcmQtMicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsa0JBQWtCLDhCQUE0QztBQUN2RSxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsVUFBVTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzRDtBQUMvRCxTQUFTLG9CQUFvQixrQkFBa0I7QUFDL0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3Q0FBd0M7QUFFakQsU0FBUyxjQUFjLEtBQVU7QUFDaEMsU0FBTztBQUFBLElBQ04sVUFBVSxDQUFDLFFBQWdCO0FBQzFCLGFBQU8sSUFBSSxHQUFHO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sc0JBQXNCLE1BQU07QUFFakMsMENBQXdDO0FBRXhDLFdBQVMsT0FBTyxZQUErQixTQUFpQixhQUFrQixNQUF3QyxXQUE0QztBQUNySyxVQUFNLHFCQUFxQixpQ0FBaUMsWUFBWSxFQUFFO0FBQzFFLFdBQU8sSUFBSTtBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsZUFBZSxPQUE2QjtBQUNw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
