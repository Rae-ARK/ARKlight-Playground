import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/keybindingsMerge.js";
import { TestUserDataSyncUtilService } from "./userDataSyncClient.js";
suite("KeybindingsMerge - No Conflicts", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one entry", async () => {
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with similar when contexts", async () => {
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "!editorReadonly && editorTextFocus" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote has entries in different order", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "a", when: "editorTextFocus" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "a", when: "editorTextFocus" },
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with different base content", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const baseContent = stringify([
      { key: "ctrl+c", command: "e" },
      { key: "shift+d", command: "d", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local and remote are same when remove entry is in different order", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+d", command: "-a" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(!actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when a new entry is added to remote", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when multiple new entries are added to remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry (same command) is removed from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when a command with multiple entries is updated from remote from base and local has not changed", async () => {
    const localContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+c", command: "a" }
    ]);
    const remoteContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+d", command: "a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when remote has moved forwareded with multiple changes and local stays with base", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+d", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+d", command: "c", when: "context1" }
    ]);
    const remoteContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, localContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, remoteContent);
  });
  test("merge when a new entry is added to local", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when multiple new entries are added to local", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "cmd+d", command: "c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" },
      { key: "cmd+c", command: "b", args: { text: "`" } }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry (with same command) is removed from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "-a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when a command with multiple entries is updated from local from base and remote has not changed", async () => {
    const localContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+c", command: "a" }
    ]);
    const remoteContent = stringify([
      { key: "shift+c", command: "c" },
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+d", command: "b" },
      { key: "cmd+d", command: "a" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, localContent);
  });
  test("merge when local has moved forwareded with multiple changes and remote stays with base", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+c", command: "b", args: { text: "`" } },
      { key: "alt+d", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+d", command: "c", when: "context1" }
    ]);
    const expected = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "cmd+e", command: "d" },
      { key: "alt+d", command: "-a" },
      { key: "alt+f", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, remoteContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, expected);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const baseContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "ctrl+c", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "alt+a", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const localContent = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "f" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "d" },
      { key: "alt+d", command: "-f" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const expected = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(!actual.hasConflicts);
    assert.strictEqual(actual.mergeContent, expected);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const localContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when local and remote with different keybinding", async () => {
    const localContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "-a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const remoteContent = stringify([
      { key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+a", command: "-a", when: "editorTextFocus && !editorReadonly" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, null);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+a",
		"command": "-a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when the entry is removed in local but updated in remote", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[]`
    );
  });
  test("merge when the entry is removed in local but updated in remote and a new entry is added in local", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+b", command: "b" }]);
    const remoteContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+b",
		"command": "b"
	}
]`
    );
  });
  test("merge when the entry is removed in remote but updated in local", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	}
]`
    );
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const baseContent = stringify([{ key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const localContent = stringify([{ key: "alt+c", command: "a", when: "editorTextFocus && !editorReadonly" }]);
    const remoteContent = stringify([{ key: "alt+b", command: "b" }]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+c",
		"command": "a",
		"when": "editorTextFocus && !editorReadonly"
	},
	{
		"key": "alt+b",
		"command": "b"
	}
]`
    );
  });
  test("merge when local and remote has moved forwareded with conflicts (2)", async () => {
    const baseContent = stringify([
      { key: "alt+d", command: "a", when: "editorTextFocus && !editorReadonly" },
      { key: "alt+c", command: "-a" },
      { key: "cmd+e", command: "d" },
      { key: "alt+a", command: "f" },
      { key: "alt+d", command: "-f" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "cmd+c", command: "-c" }
    ]);
    const localContent = stringify([
      { key: "alt+d", command: "-f" },
      { key: "cmd+e", command: "d" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "c", when: "context1" },
      { key: "alt+a", command: "f" },
      { key: "alt+e", command: "e" }
    ]);
    const remoteContent = stringify([
      { key: "alt+a", command: "f" },
      { key: "cmd+c", command: "-c" },
      { key: "cmd+d", command: "d" },
      { key: "alt+d", command: "-f" },
      { key: "alt+c", command: "c", when: "context1" },
      { key: "alt+g", command: "g", when: "context2" }
    ]);
    const actual = await mergeKeybindings(localContent, remoteContent, baseContent);
    assert.ok(actual.hasChanges);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(
      actual.mergeContent,
      `[
	{
		"key": "alt+d",
		"command": "-f"
	},
	{
		"key": "cmd+d",
		"command": "d"
	},
	{
		"key": "cmd+c",
		"command": "-c"
	},
	{
		"key": "cmd+d",
		"command": "c",
		"when": "context1"
	},
	{
		"key": "alt+a",
		"command": "f"
	},
	{
		"key": "alt+e",
		"command": "e"
	},
	{
		"key": "alt+g",
		"command": "g",
		"when": "context2"
	}
]`
    );
  });
});
async function mergeKeybindings(localContent, remoteContent, baseContent) {
  const userDataSyncUtilService = new TestUserDataSyncUtilService();
  const formattingOptions = await userDataSyncUtilService.resolveFormattingOptions();
  return merge(localContent, remoteContent, baseContent, formattingOptions, userDataSyncUtilService);
}
function stringify(value) {
  return JSON.stringify(value, null, "	");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9rZXliaW5kaW5nc01lcmdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IG1lcmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2tleWJpbmRpbmdzTWVyZ2UuanMnO1xuaW1wb3J0IHsgVGVzdFVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNDbGllbnQuanMnO1xuXG5zdWl0ZSgnS2V5YmluZGluZ3NNZXJnZSAtIE5vIENvbmZsaWN0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBvbmUgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIHNpbWlsYXIgd2hlbiBjb250ZXh0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJyFlZGl0b3JSZWFkb25seSAmJiBlZGl0b3JUZXh0Rm9jdXMnIH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBlbnRyaWVzIGluIGRpZmZlcmVudCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzJyB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1cblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggbXVsdGlwbGUgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggZGlmZmVyZW50IGJhc2UgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdjdHJsK2MnLCBjb21tYW5kOiAnZScgfSxcblx0XHRcdHsga2V5OiAnc2hpZnQrZCcsIGNvbW1hbmQ6ICdkJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIG11bHRpcGxlIGVudHJpZXMgaW4gZGlmZmVyZW50IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH1cblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdoZW4gcmVtb3ZlIGVudHJ5IGlzIGluIGRpZmZlcmVudCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYSBuZXcgZW50cnkgaXMgYWRkZWQgdG8gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIG11bHRpcGxlIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHJlbW92ZWQgZnJvbSByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IChzYW1lIGNvbW1hbmQpIGlzIHJlbW92ZWQgZnJvbSByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgdXBkYXRlZCBpbiByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIGNvbW1hbmQgd2l0aCBtdWx0aXBsZSBlbnRyaWVzIGlzIHVwZGF0ZWQgZnJvbSByZW1vdGUgZnJvbSBiYXNlIGFuZCBsb2NhbCBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnc2hpZnQrYycsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2InIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2EnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ3NoaWZ0K2MnLCBjb21tYW5kOiAnYycgfSxcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdiJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdhJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggbXVsdGlwbGUgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtlJywgY29tbWFuZDogJ2QnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtmJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGEgbmV3IGVudHJ5IGlzIGFkZGVkIHRvIGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2InLCBhcmdzOiB7IHRleHQ6ICdgJyB9IH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gbG9jYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnYicsIGFyZ3M6IHsgdGV4dDogJ2AnIH0gfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIG11bHRpcGxlIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBpcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCBmcm9tIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgKHdpdGggc2FtZSBjb21tYW5kKSBpcyByZW1vdmVkIGZyb20gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHVwZGF0ZWQgaW4gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIGNvbW1hbmQgd2l0aCBtdWx0aXBsZSBlbnRyaWVzIGlzIHVwZGF0ZWQgZnJvbSBsb2NhbCBmcm9tIGJhc2UgYW5kIHJlbW90ZSBoYXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnc2hpZnQrYycsIGNvbW1hbmQ6ICdjJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2InIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJ2EnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ3NoaWZ0K2MnLCBjb21tYW5kOiAnYycgfSxcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdiJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdhJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBtdWx0aXBsZSBjaGFuZ2VzIGFuZCByZW1vdGUgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtmJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICdiJywgYXJnczogeyB0ZXh0OiAnYCcgfSB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRdKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtmJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnY3RybCtjJywgY29tbWFuZDogJy1hJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctZicgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnLWMnIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtlJywgY29tbWFuZDogJ2QnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZCcsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZScsIGNvbW1hbmQ6ICdlJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICdmJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtnJywgY29tbWFuZDogJ2cnLCB3aGVuOiAnY29udGV4dDInIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBzdHJpbmdpZnkoW1xuXHRcdFx0eyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICctZicgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnLWMnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCthJywgY29tbWFuZDogJ2YnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtlJywgY29tbWFuZDogJ2UnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtnJywgY29tbWFuZDogJ2cnLCB3aGVuOiAnY29udGV4dDInIH0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIHdpdGggb25lIGVudHJ5IGJ1dCBkaWZmZXJlbnQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LFxuXHRcdFx0YFtcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2RcIixcblx0XHRcImNvbW1hbmRcIjogXCJhXCIsXG5cdFx0XCJ3aGVuXCI6IFwiZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seVwiXG5cdH1cbl1gKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIHdpdGggZGlmZmVyZW50IGtleWJpbmRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYScsIGNvbW1hbmQ6ICctYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XG5cdFx0XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnLWEnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCxcblx0XHRcdGBbXG5cdHtcblx0XHRcImtleVwiOiBcImFsdCtkXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiYVwiLFxuXHRcdFwid2hlblwiOiBcImVkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHlcIlxuXHR9LFxuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrYVwiLFxuXHRcdFwiY29tbWFuZFwiOiBcIi1hXCIsXG5cdFx0XCJ3aGVuXCI6IFwiZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seVwiXG5cdH1cbl1gKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGUgZW50cnkgaXMgcmVtb3ZlZCBpbiBsb2NhbCBidXQgdXBkYXRlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFtdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsXG5cdFx0XHRgW11gKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiB0aGUgZW50cnkgaXMgcmVtb3ZlZCBpbiBsb2NhbCBidXQgdXBkYXRlZCBpbiByZW1vdGUgYW5kIGEgbmV3IGVudHJ5IGlzIGFkZGVkIGluIGxvY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYicsIGNvbW1hbmQ6ICdiJyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBtZXJnZUtleWJpbmRpbmdzKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ2hhbmdlcyk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWVyZ2VDb250ZW50LFxuXHRcdFx0YFtcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2JcIixcblx0XHRcImNvbW1hbmRcIjogXCJiXCJcblx0fVxuXWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIGluIHJlbW90ZSBidXQgdXBkYXRlZCBpbiBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeShbeyBrZXk6ICdhbHQrZCcsIGNvbW1hbmQ6ICdhJywgd2hlbjogJ2VkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHknIH1dKTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2MnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeShbXSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50KTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NoYW5nZXMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLm1lcmdlQ29udGVudCxcblx0XHRcdGBbXG5cdHtcblx0XHRcImtleVwiOiBcImFsdCtjXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiYVwiLFxuXHRcdFwid2hlblwiOiBcImVkaXRvclRleHRGb2N1cyAmJiAhZWRpdG9yUmVhZG9ubHlcIlxuXHR9XG5dYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gdGhlIGVudHJ5IGlzIHJlbW92ZWQgaW4gcmVtb3RlIGJ1dCB1cGRhdGVkIGluIGxvY2FsIGFuZCBhIG5ldyBlbnRyeSBpcyBhZGRlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9XSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KFt7IGtleTogJ2FsdCtjJywgY29tbWFuZDogJ2EnLCB3aGVuOiAnZWRpdG9yVGV4dEZvY3VzICYmICFlZGl0b3JSZWFkb25seScgfV0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoW3sga2V5OiAnYWx0K2InLCBjb21tYW5kOiAnYicgfV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsXG5cdFx0XHRgW1xuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrY1wiLFxuXHRcdFwiY29tbWFuZFwiOiBcImFcIixcblx0XHRcIndoZW5cIjogXCJlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5XCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2JcIixcblx0XHRcImNvbW1hbmRcIjogXCJiXCJcblx0fVxuXWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb25mbGljdHMgKDIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnYScsIHdoZW46ICdlZGl0b3JUZXh0Rm9jdXMgJiYgIWVkaXRvclJlYWRvbmx5JyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICctYScgfSxcblx0XHRcdHsga2V5OiAnY21kK2UnLCBjb21tYW5kOiAnZCcgfSxcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2QnLCBjb21tYW5kOiAnLWYnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2MnLCB3aGVuOiAnY29udGV4dDEnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtjJywgY29tbWFuZDogJy1jJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeShbXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrZScsIGNvbW1hbmQ6ICdkJyB9LFxuXHRcdFx0eyBrZXk6ICdjbWQrYycsIGNvbW1hbmQ6ICctYycgfSxcblx0XHRcdHsga2V5OiAnY21kK2QnLCBjb21tYW5kOiAnYycsIHdoZW46ICdjb250ZXh0MScgfSxcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnYWx0K2UnLCBjb21tYW5kOiAnZScgfSxcblx0XHRdKTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KFtcblx0XHRcdHsga2V5OiAnYWx0K2EnLCBjb21tYW5kOiAnZicgfSxcblx0XHRcdHsga2V5OiAnY21kK2MnLCBjb21tYW5kOiAnLWMnIH0sXG5cdFx0XHR7IGtleTogJ2NtZCtkJywgY29tbWFuZDogJ2QnIH0sXG5cdFx0XHR7IGtleTogJ2FsdCtkJywgY29tbWFuZDogJy1mJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrYycsIGNvbW1hbmQ6ICdjJywgd2hlbjogJ2NvbnRleHQxJyB9LFxuXHRcdFx0eyBrZXk6ICdhbHQrZycsIGNvbW1hbmQ6ICdnJywgd2hlbjogJ2NvbnRleHQyJyB9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IG1lcmdlS2V5YmluZGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDaGFuZ2VzKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tZXJnZUNvbnRlbnQsXG5cdFx0XHRgW1xuXHR7XG5cdFx0XCJrZXlcIjogXCJhbHQrZFwiLFxuXHRcdFwiY29tbWFuZFwiOiBcIi1mXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiY21kK2RcIixcblx0XHRcImNvbW1hbmRcIjogXCJkXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiY21kK2NcIixcblx0XHRcImNvbW1hbmRcIjogXCItY1wiXG5cdH0sXG5cdHtcblx0XHRcImtleVwiOiBcImNtZCtkXCIsXG5cdFx0XCJjb21tYW5kXCI6IFwiY1wiLFxuXHRcdFwid2hlblwiOiBcImNvbnRleHQxXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2FcIixcblx0XHRcImNvbW1hbmRcIjogXCJmXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2VcIixcblx0XHRcImNvbW1hbmRcIjogXCJlXCJcblx0fSxcblx0e1xuXHRcdFwia2V5XCI6IFwiYWx0K2dcIixcblx0XHRcImNvbW1hbmRcIjogXCJnXCIsXG5cdFx0XCJ3aGVuXCI6IFwiY29udGV4dDJcIlxuXHR9XG5dYCk7XG5cdH0pO1xuXG59KTtcblxuYXN5bmMgZnVuY3Rpb24gbWVyZ2VLZXliaW5kaW5ncyhsb2NhbENvbnRlbnQ6IHN0cmluZywgcmVtb3RlQ29udGVudDogc3RyaW5nLCBiYXNlQ29udGVudDogc3RyaW5nIHwgbnVsbCkge1xuXHRjb25zdCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZSA9IG5ldyBUZXN0VXNlckRhdGFTeW5jVXRpbFNlcnZpY2UoKTtcblx0Y29uc3QgZm9ybWF0dGluZ09wdGlvbnMgPSBhd2FpdCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZS5yZXNvbHZlRm9ybWF0dGluZ09wdGlvbnMoKTtcblx0cmV0dXJuIG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zLCB1c2VyRGF0YVN5bmNVdGlsU2VydmljZSk7XG59XG5cbmZ1bmN0aW9uIHN0cmluZ2lmeSh2YWx1ZTogYW55KTogc3RyaW5nIHtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCAnXFx0Jyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUNBQW1DO0FBRTVDLE1BQU0sbUNBQW1DLE1BQU07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
