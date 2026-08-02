import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { addSetting, merge, updateIgnoredSettings } from "../../common/settingsMerge.js";
const formattingOptions = { eol: "\n", insertSpaces: false, tabSize: 4 };
suite("SettingsMerge - Merge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge when local and remote are same with one entry", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 1 });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote are same with multiple entries", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote are same with multiple entries in different order", async () => {
    const localContent = stringify({
      "b": 2,
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.strictEqual(actual.conflictsSettings.length, 0);
  });
  test("merge when local and remote are same with different base content", async () => {
    const localContent = stringify({
      "b": 2,
      "a": 1
    });
    const baseContent = stringify({
      "a": 2,
      "b": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(actual.hasConflicts);
  });
  test("merge when a new entry is added to remote", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to remote", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "b": 2,
      "a": 1,
      "c": 3
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is removed from remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when all entries are removed from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is updated in remote from base and local has not changed", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with multiple changes and local stays with base", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with order changes and local stays with base", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 2,
      "d": 4,
      "c": 3,
      "b": 2
    });
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with comment changes and local stays with base", async () => {
    const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// comment b has changed
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when remote has moved forwareded with comment and order changes and local stays with base", async () => {
    const localContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// this is comment for c
	"c": 1,
	// comment b has changed
	"b": 2,
}`;
    const actual = merge(localContent, remoteContent, localContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when a new entries are added to local", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when multiple new entries are added to local from base and remote is not changed", async () => {
    const localContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is removed from local from base and remote has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "c": 2
    });
    const remoteContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when an entry is updated in local from base and remote has not changed", async () => {
    const localContent = stringify({
      "a": 1,
      "c": 2
    });
    const remoteContent = stringify({
      "a": 2,
      "c": 2
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with multiple changes and remote stays with base", async () => {
    const localContent = stringify({
      "a": 2,
      "b": 1,
      "c": 3,
      "d": 4
    });
    const remoteContent = stringify({
      "a": 1
    });
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with order changes and remote stays with base", async () => {
    const localContent = `
{
	"b": 2,
	"c": 1,
}`;
    const remoteContent = stringify`
{
	"c": 1,
	"b": 2,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with comment changes and remote stays with base", async () => {
    const localContent = `
{
	// comment for b has changed
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const remoteContent = stringify`
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local has moved forwarded with comment and order changes and remote stays with base", async () => {
    const localContent = `
{
	// comment for c
	"c": 1,
	// comment for b has changed
	"b": 2,
}`;
    const remoteContent = stringify`
{
	// comment for b
	"b": 2,
	// comment for c
	"c": 1,
}`;
    const actual = merge(localContent, remoteContent, remoteContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, localContent);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("merge when local and remote with one entry but different value", async () => {
    const localContent = stringify({
      "a": 1
    });
    const remoteContent = stringify({
      "a": 2
    });
    const expectedConflicts = [{ key: "a", localValue: 1, remoteValue: 2 }];
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when the entry is removed in remote but updated in local and a new entry is added in remote", async () => {
    const baseContent = stringify({
      "a": 1
    });
    const localContent = stringify({
      "a": 2
    });
    const remoteContent = stringify({
      "b": 2
    });
    const expectedConflicts = [{ key: "a", localValue: 2, remoteValue: void 0 }];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "b": 2
    }));
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge with single entry and local is empty", async () => {
    const baseContent = stringify({
      "a": 1
    });
    const localContent = stringify({});
    const remoteContent = stringify({
      "a": 2
    });
    const expectedConflicts = [{ key: "a", localValue: void 0, remoteValue: 2 }];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when local and remote has moved forwareded with conflicts", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    });
    const remoteContent = stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5
    });
    const expectedConflicts = [
      { key: "b", localValue: void 0, remoteValue: 3 },
      { key: "a", localValue: 2, remoteValue: void 0 },
      { key: "d", localValue: 5, remoteValue: 6 },
      { key: "e", localValue: 4, remoteValue: 5 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5,
      "f": 1
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("merge when local and remote has moved forwareded with change in order", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "b": 2,
      "d": 4,
      "e": 5
    });
    const remoteContent = stringify({
      "a": 1,
      "b": 2,
      "c": 4
    });
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 4,
      "b": 2,
      "e": 5
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 2,
      "b": 2,
      "e": 5,
      "c": 4
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, []);
  });
  test("merge when local and remote has moved forwareded with comment changes", async () => {
    const baseContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const localContent = `
{
	// comment b has changed in local
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const remoteContent = `
{
	// comment b has changed in remote
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const actual = merge(localContent, remoteContent, baseContent, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, localContent);
    assert.strictEqual(actual.remoteContent, remoteContent);
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, []);
  });
  test("resolve when local and remote has moved forwareded with resolved conflicts", async () => {
    const baseContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3,
      "d": 4
    });
    const localContent = stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 4,
      "f": 1
    });
    const remoteContent = stringify({
      "b": 3,
      "c": 3,
      "d": 6,
      "e": 5
    });
    const expectedConflicts = [
      { key: "d", localValue: 5, remoteValue: 6 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, [], [{ key: "a", value: 2 }, { key: "b", value: void 0 }, { key: "e", value: 5 }], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 2,
      "c": 3,
      "d": 5,
      "e": 5,
      "f": 1
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "c": 3,
      "d": 6,
      "e": 5,
      "f": 1,
      "a": 2
    }));
    assert.ok(actual.hasConflicts);
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
  });
  test("ignored setting is not merged when changed in local and remote", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 2 });
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when changed in local and remote from base", async () => {
    const baseContent = stringify({ "a": 0 });
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({ "a": 2 });
    const actual = merge(localContent, remoteContent, baseContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when added in remote", async () => {
    const localContent = stringify({});
    const remoteContent = stringify({ "a": 1 });
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when added in remote from base", async () => {
    const localContent = stringify({ "b": 2 });
    const remoteContent = stringify({ "a": 1, "b": 2 });
    const actual = merge(localContent, remoteContent, localContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when removed in remote", async () => {
    const localContent = stringify({ "a": 1 });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, null, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged when removed in remote from base", async () => {
    const localContent = stringify({ "a": 2 });
    const remoteContent = stringify({});
    const actual = merge(localContent, remoteContent, localContent, ["a"], [], formattingOptions);
    assert.strictEqual(actual.localContent, null);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged with other changes without conflicts", async () => {
    const baseContent = stringify({
      "a": 2,
      "b": 2,
      "c": 3,
      "d": 4,
      "e": 5
    });
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const actual = merge(localContent, remoteContent, baseContent, ["a", "e"], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 1,
      "b": 3
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 3,
      "b": 3,
      "e": 6
    }));
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
  test("ignored setting is not merged with other changes conflicts", async () => {
    const baseContent = stringify({
      "a": 2,
      "b": 2,
      "c": 3,
      "d": 4,
      "e": 5
    });
    const localContent = stringify({
      "a": 1,
      "b": 4,
      "c": 3,
      "d": 5
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "e": 6
    });
    const expectedConflicts = [
      { key: "d", localValue: 5, remoteValue: void 0 },
      { key: "b", localValue: 4, remoteValue: 3 }
    ];
    const actual = merge(localContent, remoteContent, baseContent, ["a", "e"], [], formattingOptions);
    assert.strictEqual(actual.localContent, stringify({
      "a": 1,
      "b": 4,
      "d": 5
    }));
    assert.strictEqual(actual.remoteContent, stringify({
      "a": 3,
      "b": 3,
      "e": 6
    }));
    assert.deepStrictEqual(actual.conflictsSettings, expectedConflicts);
    assert.ok(actual.hasConflicts);
  });
  test("merge when remote has comments and local is empty", async () => {
    const localContent = `
{

}`;
    const remoteContent = stringify`
{
	// this is a comment
	"a": 1,
}`;
    const actual = merge(localContent, remoteContent, null, [], [], formattingOptions);
    assert.strictEqual(actual.localContent, remoteContent);
    assert.strictEqual(actual.remoteContent, null);
    assert.strictEqual(actual.conflictsSettings.length, 0);
    assert.ok(!actual.hasConflicts);
  });
});
suite("SettingsMerge - Compute Remote Content", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("local content is returned when there are no ignored settings", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const actual = updateIgnoredSettings(localContent, remoteContent, [], formattingOptions);
    assert.strictEqual(actual, localContent);
  });
  test("when target content is empty", async () => {
    const remoteContent = stringify({
      "a": 3
    });
    const actual = updateIgnoredSettings("", remoteContent, ["a"], formattingOptions);
    assert.strictEqual(actual, "");
  });
  test("when source content is empty", async () => {
    const localContent = stringify({
      "a": 3,
      "b": 3
    });
    const expected = stringify({
      "b": 3
    });
    const actual = updateIgnoredSettings(localContent, "", ["a"], formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("ignored settings are not updated from remote content", async () => {
    const localContent = stringify({
      "a": 1,
      "b": 2,
      "c": 3
    });
    const remoteContent = stringify({
      "a": 3,
      "b": 3,
      "d": 4,
      "e": 6
    });
    const expected = stringify({
      "a": 3,
      "b": 2,
      "c": 3
    });
    const actual = updateIgnoredSettings(localContent, remoteContent, ["a"], formattingOptions);
    assert.strictEqual(actual, expected);
  });
});
suite("SettingsMerge - Add Setting", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Insert after a setting without comments", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 2,
	"d": 3
}`;
    const expected = `
{
	"a": 2,
	"b": 2,
	"d": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting without comments at the end", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 2
}`;
    const expected = `
{
	"a": 2,
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert between settings without comment", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert between settings and there is a comment in between in source", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting and after a comment at the end", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for b
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting ending with comma and after a comment at the end", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment and there are no settings", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2
}`;
    const targetContent = `
{
	// this is comment for b
}`;
    const expected = `
{
	// this is comment for b
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting and between a comment and setting", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments on the same line and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2, // this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two line comments on the same line and there is a setting after", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b // this is comment for c
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting between two comments and there is no setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for b
	// this is a comment
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting with comma and between two comments and there is no setting after", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1,
	// this is comment for b
	// this is a comment
}`;
    const expected = `
{
	"a": 1,
	// this is comment for b
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting without comments", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"d": 2,
	"c": 3
}`;
    const expected = `
{
	"d": 2,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting without comments at the end", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"c": 3
}`;
    const expected = `
{
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting with comment", () => {
    const sourceContent = `
{
	"a": 1,
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting and before a comment at the beginning", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const targetContent = `
{
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting ending with comma and before a comment at the begninning", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const targetContent = `
{
	// this is comment for b
	"c": 3,
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	"c": 3,
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting and between a setting and comment", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b
	// this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments on the same line and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	/* this is comment for b */ // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two line comments on the same line and there is a setting before", () => {
    const sourceContent = `
{
	"a": 1,
	/* this is comment for b */
	"b": 2,
	// this is comment for c
	"c": 3
}`;
    const targetContent = `
{
	"d": 1,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const expected = `
{
	"d": 1,
	"b": 2,
	// this is comment for b // this is comment for c
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting between two comments and there is no setting before", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert before a setting with comma and between two comments and there is no setting before", () => {
    const sourceContent = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1
}`;
    const targetContent = `
{
	// this is comment for b
	// this is comment for c
	"c": 1,
}`;
    const expected = `
{
	// this is comment for b
	"b": 2,
	// this is comment for c
	"c": 1,
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a setting that is of object type", () => {
    const sourceContent = `
{
	"b": {
		"d": 1
	},
	"a": 2,
	"c": 1
}`;
    const targetContent = `
{
	"b": {
		"d": 1
	},
	"c": 1
}`;
    const actual = addSetting("a", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, sourceContent);
  });
  test("Insert after a setting that is of array type", () => {
    const sourceContent = `
{
	"b": [
		1
	],
	"a": 2,
	"c": 1
}`;
    const targetContent = `
{
	"b": [
		1
	],
	"c": 1
}`;
    const actual = addSetting("a", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, sourceContent);
  });
  test("Insert after a comment with comma separator of previous setting and no next nodes ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment with comma separator of previous setting and there is a setting after ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	"c": 3
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2,
	"c": 3
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
  test("Insert after a comment with comma separator of previous setting and there is a comment after ", () => {
    const sourceContent = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
    const targetContent = `
{
	"a": 1
	// this is comment for a
	,
	// this is a comment
}`;
    const expected = `
{
	"a": 1
	// this is comment for a
	,
	"b": 2
	// this is a comment
}`;
    const actual = addSetting("b", sourceContent, targetContent, formattingOptions);
    assert.strictEqual(actual, expected);
  });
});
function stringify(value) {
  return JSON.stringify(value, null, "	");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9zZXR0aW5nc01lcmdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGFkZFNldHRpbmcsIG1lcmdlLCB1cGRhdGVJZ25vcmVkU2V0dGluZ3MgfSBmcm9tICcuLi8uLi9jb21tb24vc2V0dGluZ3NNZXJnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb25mbGljdFNldHRpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcblxuY29uc3QgZm9ybWF0dGluZ09wdGlvbnMgPSB7IGVvbDogJ1xcbicsIGluc2VydFNwYWNlczogZmFsc2UsIHRhYlNpemU6IDQgfTtcblxuc3VpdGUoJ1NldHRpbmdzTWVyZ2UgLSBNZXJnZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBvbmUgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAxIH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEgfSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGFyZSBzYW1lIHdpdGggbXVsdGlwbGUgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDJcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgYXJlIHNhbWUgd2l0aCBtdWx0aXBsZSBlbnRyaWVzIGluIGRpZmZlcmVudCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBhcmUgc2FtZSB3aXRoIGRpZmZlcmVudCBiYXNlIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdiJzogMixcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDFcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIG5ldyBlbnRyeSBpcyBhZGRlZCB0byByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbXVsdGlwbGUgbmV3IGVudHJpZXMgYXJlIGFkZGVkIHRvIHJlbW90ZSBmcm9tIGJhc2UgYW5kIGxvY2FsIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBlbnRyeSBpcyByZW1vdmVkIGZyb20gcmVtb3RlIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFsbCBlbnRyaWVzIGFyZSByZW1vdmVkIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHVwZGF0ZWQgaW4gcmVtb3RlIGZyb20gYmFzZSBhbmQgbG9jYWwgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDJcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggbXVsdGlwbGUgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDEsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIG9yZGVyIGNoYW5nZXMgYW5kIGxvY2FsIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2InOiAyLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb21tZW50IGNoYW5nZXMgYW5kIGxvY2FsIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxLFxufWA7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeWBcbntcblx0Ly8gY29tbWVudCBiIGhhcyBjaGFuZ2VkXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggY29tbWVudCBhbmQgb3JkZXIgY2hhbmdlcyBhbmQgbG9jYWwgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5YFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG5cdC8vIGNvbW1lbnQgYiBoYXMgY2hhbmdlZFxuXHRcImJcIjogMixcbn1gO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhIG5ldyBlbnRyaWVzIGFyZSBhZGRlZCB0byBsb2NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBtdWx0aXBsZSBuZXcgZW50cmllcyBhcmUgYWRkZWQgdG8gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaXMgbm90IGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMSxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZW50cnkgaXMgcmVtb3ZlZCBmcm9tIGxvY2FsIGZyb20gYmFzZSBhbmQgcmVtb3RlIGhhcyBub3QgY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2MnOiAyXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDEsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGVudHJ5IGlzIHVwZGF0ZWQgaW4gbG9jYWwgZnJvbSBiYXNlIGFuZCByZW1vdGUgaGFzIG5vdCBjaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYyc6IDJcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogMixcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmRlZCB3aXRoIG11bHRpcGxlIGNoYW5nZXMgYW5kIHJlbW90ZSBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMSxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmRlZCB3aXRoIG9yZGVyIGNoYW5nZXMgYW5kIHJlbW90ZSBzdGF5cyB3aXRoIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gYFxue1xuXHRcImJcIjogMixcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5YFxue1xuXHRcImNcIjogMSxcblx0XCJiXCI6IDIsXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgaGFzIG1vdmVkIGZvcndhcmRlZCB3aXRoIGNvbW1lbnQgY2hhbmdlcyBhbmQgcmVtb3RlIHN0YXlzIHdpdGggYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBgXG57XG5cdC8vIGNvbW1lbnQgZm9yIGIgaGFzIGNoYW5nZWRcblx0XCJiXCI6IDIsXG5cdC8vIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5YFxue1xuXHQvLyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHQvLyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxLFxufWA7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCByZW1vdGVDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBsb2NhbENvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGhhcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBjb21tZW50IGFuZCBvcmRlciBjaGFuZ2VzIGFuZCByZW1vdGUgc3RheXMgd2l0aCBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IGBcbntcblx0Ly8gY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcblx0Ly8gY29tbWVudCBmb3IgYiBoYXMgY2hhbmdlZFxuXHRcImJcIjogMixcbn1gO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnlgXG57XG5cdC8vIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSB3aXRoIG9uZSBlbnRyeSBidXQgZGlmZmVyZW50IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDFcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29uZmxpY3RzOiBJQ29uZmxpY3RTZXR0aW5nW10gPSBbeyBrZXk6ICdhJywgbG9jYWxWYWx1ZTogMSwgcmVtb3RlVmFsdWU6IDIgfV07XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgZXhwZWN0ZWRDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIGluIHJlbW90ZSBidXQgdXBkYXRlZCBpbiBsb2NhbCBhbmQgYSBuZXcgZW50cnkgaXMgYWRkZWQgaW4gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMVxuXHRcdH0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDJcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdiJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29uZmxpY3RzOiBJQ29uZmxpY3RTZXR0aW5nW10gPSBbeyBrZXk6ICdhJywgbG9jYWxWYWx1ZTogMiwgcmVtb3RlVmFsdWU6IHVuZGVmaW5lZCB9XTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMlxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgZXhwZWN0ZWRDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aXRoIHNpbmdsZSBlbnRyeSBhbmQgbG9jYWwgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHt9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMlxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29uZmxpY3RzOiBJQ29uZmxpY3RTZXR0aW5nW10gPSBbeyBrZXk6ICdhJywgbG9jYWxWYWx1ZTogdW5kZWZpbmVkLCByZW1vdGVWYWx1ZTogMiB9XTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgZXhwZWN0ZWRDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGxvY2FsIGFuZCByZW1vdGUgaGFzIG1vdmVkIGZvcndhcmVkZWQgd2l0aCBjb25mbGljdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDUsXG5cdFx0XHQnZSc6IDQsXG5cdFx0XHQnZic6IDEsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDYsXG5cdFx0XHQnZSc6IDUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDb25mbGljdHM6IElDb25mbGljdFNldHRpbmdbXSA9IFtcblx0XHRcdHsga2V5OiAnYicsIGxvY2FsVmFsdWU6IHVuZGVmaW5lZCwgcmVtb3RlVmFsdWU6IDMgfSxcblx0XHRcdHsga2V5OiAnYScsIGxvY2FsVmFsdWU6IDIsIHJlbW90ZVZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2V5OiAnZCcsIGxvY2FsVmFsdWU6IDUsIHJlbW90ZVZhbHVlOiA2IH0sXG5cdFx0XHR7IGtleTogJ2UnLCBsb2NhbFZhbHVlOiA0LCByZW1vdGVWYWx1ZTogNSB9LFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgW10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDUsXG5cdFx0XHQnZSc6IDQsXG5cdFx0XHQnZic6IDEsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdiJzogMyxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNixcblx0XHRcdCdlJzogNSxcblx0XHRcdCdmJzogMSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLCBleHBlY3RlZENvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIGNoYW5nZSBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdiJzogMixcblx0XHRcdCdkJzogNCxcblx0XHRcdCdlJzogNSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogNCxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogNCxcblx0XHRcdCdiJzogMixcblx0XHRcdCdlJzogNSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2UnOiA1LFxuXHRcdFx0J2MnOiA0LFxuXHRcdH0pKTtcblx0XHRhc3NlcnQub2soYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBsb2NhbCBhbmQgcmVtb3RlIGhhcyBtb3ZlZCBmb3J3YXJlZGVkIHdpdGggY29tbWVudCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gYFxue1xuXHQvLyBjb21tZW50IGIgaGFzIGNoYW5nZWQgaW4gbG9jYWxcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IGBcbntcblx0Ly8gY29tbWVudCBiIGhhcyBjaGFuZ2VkIGluIHJlbW90ZVxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAxXG59YDtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgbG9jYWxDb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHJlbW90ZUNvbnRlbnQpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlIHdoZW4gbG9jYWwgYW5kIHJlbW90ZSBoYXMgbW92ZWQgZm9yd2FyZWRlZCB3aXRoIHJlc29sdmVkIGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDEsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNSxcblx0XHRcdCdlJzogNCxcblx0XHRcdCdmJzogMSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdiJzogMyxcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNixcblx0XHRcdCdlJzogNSxcblx0XHR9KTtcblx0XHRjb25zdCBleHBlY3RlZENvbmZsaWN0czogSUNvbmZsaWN0U2V0dGluZ1tdID0gW1xuXHRcdFx0eyBrZXk6ICdkJywgbG9jYWxWYWx1ZTogNSwgcmVtb3RlVmFsdWU6IDYgfSxcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgYmFzZUNvbnRlbnQsIFtdLCBbeyBrZXk6ICdhJywgdmFsdWU6IDIgfSwgeyBrZXk6ICdiJywgdmFsdWU6IHVuZGVmaW5lZCB9LCB7IGtleTogJ2UnLCB2YWx1ZTogNSB9XSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA1LFxuXHRcdFx0J2UnOiA1LFxuXHRcdFx0J2YnOiAxLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDYsXG5cdFx0XHQnZSc6IDUsXG5cdFx0XHQnZic6IDEsXG5cdFx0XHQnYSc6IDIsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgZXhwZWN0ZWRDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVkIHNldHRpbmcgaXMgbm90IG1lcmdlZCB3aGVuIGNoYW5nZWQgaW4gbG9jYWwgYW5kIHJlbW90ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEgfSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMiB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFsnYSddLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVkIHNldHRpbmcgaXMgbm90IG1lcmdlZCB3aGVuIGNoYW5nZWQgaW4gbG9jYWwgYW5kIHJlbW90ZSBmcm9tIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUNvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDAgfSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAxIH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDIgfSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gYWRkZWQgaW4gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7fSk7XG5cdFx0Y29uc3QgcmVtb3RlQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMSB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIG51bGwsIFsnYSddLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVkIHNldHRpbmcgaXMgbm90IG1lcmdlZCB3aGVuIGFkZGVkIGluIHJlbW90ZSBmcm9tIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2InOiAyIH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoeyAnYSc6IDEsICdiJzogMiB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gcmVtb3ZlZCBpbiByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHsgJ2EnOiAxIH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe30pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCwgbnVsbCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdoZW4gcmVtb3ZlZCBpbiByZW1vdGUgZnJvbSBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7ICdhJzogMiB9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHt9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGxvY2FsQ29udGVudCwgWydhJ10sIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbENvbnRlbnQsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlQ29udGVudCwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayghYWN0dWFsLmhhc0NvbmZsaWN0cyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZWQgc2V0dGluZyBpcyBub3QgbWVyZ2VkIHdpdGggb3RoZXIgY2hhbmdlcyB3aXRob3V0IGNvbmZsaWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXNlQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDIsXG5cdFx0XHQnYic6IDIsXG5cdFx0XHQnYyc6IDMsXG5cdFx0XHQnZCc6IDQsXG5cdFx0XHQnZSc6IDUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMyxcblx0XHRcdCdiJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHRcdCdlJzogNixcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIGJhc2VDb250ZW50LCBbJ2EnLCAnZSddLCBbXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubG9jYWxDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAzLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZUNvbnRlbnQsIHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0XHQnZSc6IDYsXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29uZmxpY3RzU2V0dGluZ3MubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQub2soIWFjdHVhbC5oYXNDb25mbGljdHMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVkIHNldHRpbmcgaXMgbm90IG1lcmdlZCB3aXRoIG90aGVyIGNoYW5nZXMgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMixcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHRcdCdkJzogNCxcblx0XHRcdCdlJzogNSxcblx0XHR9KTtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiA0LFxuXHRcdFx0J2MnOiAzLFxuXHRcdFx0J2QnOiA1LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2UnOiA2LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkQ29uZmxpY3RzOiBJQ29uZmxpY3RTZXR0aW5nW10gPSBbXG5cdFx0XHR7IGtleTogJ2QnLCBsb2NhbFZhbHVlOiA1LCByZW1vdGVWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGtleTogJ2InLCBsb2NhbFZhbHVlOiA0LCByZW1vdGVWYWx1ZTogMyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBiYXNlQ29udGVudCwgWydhJywgJ2UnXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMSxcblx0XHRcdCdiJzogNCxcblx0XHRcdCdkJzogNSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2UnOiA2LFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5jb25mbGljdHNTZXR0aW5ncywgZXhwZWN0ZWRDb25mbGljdHMpO1xuXHRcdGFzc2VydC5vayhhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgaGFzIGNvbW1lbnRzIGFuZCBsb2NhbCBpcyBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBgXG57XG5cbn1gO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnlgXG57XG5cdC8vIHRoaXMgaXMgYSBjb21tZW50XG5cdFwiYVwiOiAxLFxufWA7XG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBudWxsLCBbXSwgW10sIGZvcm1hdHRpbmdPcHRpb25zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsQ29udGVudCwgcmVtb3RlQ29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGVDb250ZW50LCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbmZsaWN0c1NldHRpbmdzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFhY3R1YWwuaGFzQ29uZmxpY3RzKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1NldHRpbmdzTWVyZ2UgLSBDb21wdXRlIFJlbW90ZSBDb250ZW50JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2xvY2FsIGNvbnRlbnQgaXMgcmV0dXJuZWQgd2hlbiB0aGVyZSBhcmUgbm8gaWdub3JlZCBzZXR0aW5ncycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2UnOiA2LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhsb2NhbENvbnRlbnQsIHJlbW90ZUNvbnRlbnQsIFtdLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgbG9jYWxDb250ZW50KTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiB0YXJnZXQgY29udGVudCBpcyBlbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVDb250ZW50ID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMyxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSB1cGRhdGVJZ25vcmVkU2V0dGluZ3MoJycsIHJlbW90ZUNvbnRlbnQsIFsnYSddLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGVuIHNvdXJjZSBjb250ZW50IGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsQ29udGVudCA9IHN0cmluZ2lmeSh7XG5cdFx0XHQnYSc6IDMsXG5cdFx0XHQnYic6IDMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2InOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHVwZGF0ZUlnbm9yZWRTZXR0aW5ncyhsb2NhbENvbnRlbnQsICcnLCBbJ2EnXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlZCBzZXR0aW5ncyBhcmUgbm90IHVwZGF0ZWQgZnJvbSByZW1vdGUgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2NhbENvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAxLFxuXHRcdFx0J2InOiAyLFxuXHRcdFx0J2MnOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbW90ZUNvbnRlbnQgPSBzdHJpbmdpZnkoe1xuXHRcdFx0J2EnOiAzLFxuXHRcdFx0J2InOiAzLFxuXHRcdFx0J2QnOiA0LFxuXHRcdFx0J2UnOiA2LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gc3RyaW5naWZ5KHtcblx0XHRcdCdhJzogMyxcblx0XHRcdCdiJzogMixcblx0XHRcdCdjJzogMyxcblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSB1cGRhdGVJZ25vcmVkU2V0dGluZ3MobG9jYWxDb250ZW50LCByZW1vdGVDb250ZW50LCBbJ2EnXSwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnU2V0dGluZ3NNZXJnZSAtIEFkZCBTZXR0aW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgd2l0aG91dCBjb21tZW50cycsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAyLFxuXHRcImRcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDIsXG5cdFwiYlwiOiAyLFxuXHRcImRcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIHdpdGhvdXQgY29tbWVudHMgYXQgdGhlIGVuZCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAyXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMixcblx0XCJiXCI6IDJcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJldHdlZW4gc2V0dGluZ3Mgd2l0aG91dCBjb21tZW50JywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZXR3ZWVuIHNldHRpbmdzIGFuZCB0aGVyZSBpcyBhIGNvbW1lbnQgaW4gYmV0d2VlbiBpbiBzb3VyY2UnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYW5kIGFmdGVyIGEgY29tbWVudCBhdCB0aGUgZW5kJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgZW5kaW5nIHdpdGggY29tbWEgYW5kIGFmdGVyIGEgY29tbWVudCBhdCB0aGUgZW5kJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMlxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBjb21tZW50IGFuZCB0aGVyZSBhcmUgbm8gc2V0dGluZ3MnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYW5kIGJldHdlZW4gYSBjb21tZW50IGFuZCBzZXR0aW5nJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYmV0d2VlbiB0d28gY29tbWVudHMgYW5kIHRoZXJlIGlzIGEgc2V0dGluZyBhZnRlcicsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGNvbW1lbnRzIG9uIHRoZSBzYW1lIGxpbmUgYW5kIHRoZXJlIGlzIGEgc2V0dGluZyBhZnRlcicsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvKiB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgKi9cblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqLyAvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvKiB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgKi9cblx0XCJiXCI6IDIsIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGxpbmUgY29tbWVudHMgb24gdGhlIHNhbWUgbGluZSBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGFmdGVyJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYiAvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIHNldHRpbmcgYmV0d2VlbiB0d28gY29tbWVudHMgYW5kIHRoZXJlIGlzIG5vIHNldHRpbmcgYWZ0ZXInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyXG5cdC8vIHRoaXMgaXMgYSBjb21tZW50XG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyB3aXRoIGNvbW1hIGFuZCBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgbm8gc2V0dGluZyBhZnRlcicsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDJcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIHdpdGhvdXQgY29tbWVudHMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImRcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiZFwiOiAyLFxuXHRcImJcIjogMixcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgd2l0aG91dCBjb21tZW50cyBhdCB0aGUgZW5kJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyB3aXRoIGNvbW1lbnQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMSxcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGFuZCBiZWZvcmUgYSBjb21tZW50IGF0IHRoZSBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzLFxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGVuZGluZyB3aXRoIGNvbW1hIGFuZCBiZWZvcmUgYSBjb21tZW50IGF0IHRoZSBiZWduaW5uaW5nJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogMyxcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImNcIjogMyxcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHRcImJcIjogMixcblx0XCJjXCI6IDMsXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGFuZCBiZXR3ZWVuIGEgc2V0dGluZyBhbmQgY29tbWVudCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImRcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHRcImRcIjogMSxcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGJlZm9yZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJkXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiZFwiOiAxLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyBiZXR3ZWVuIHR3byBjb21tZW50cyBvbiB0aGUgc2FtZSBsaW5lIGFuZCB0aGVyZSBpcyBhIHNldHRpbmcgYmVmb3JlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJhXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblx0XHRjb25zdCB0YXJnZXRDb250ZW50ID0gYFxue1xuXHRcImRcIjogMSxcblx0LyogdGhpcyBpcyBjb21tZW50IGZvciBiICovIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0XCJkXCI6IDEsXG5cdC8qIHRoaXMgaXMgY29tbWVudCBmb3IgYiAqL1xuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBjXG5cdFwiY1wiOiAzXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBiZWZvcmUgYSBzZXR0aW5nIGJldHdlZW4gdHdvIGxpbmUgY29tbWVudHMgb24gdGhlIHNhbWUgbGluZSBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGJlZm9yZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxLFxuXHQvKiB0aGlzIGlzIGNvbW1lbnQgZm9yIGIgKi9cblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJkXCI6IDEsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYiAvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiZFwiOiAxLFxuXHRcImJcIjogMixcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiIC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYmVmb3JlIGEgc2V0dGluZyBiZXR3ZWVuIHR3byBjb21tZW50cyBhbmQgdGhlcmUgaXMgbm8gc2V0dGluZyBiZWZvcmUnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMVxufWA7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDFcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGJlZm9yZSBhIHNldHRpbmcgd2l0aCBjb21tYSBhbmQgYmV0d2VlbiB0d28gY29tbWVudHMgYW5kIHRoZXJlIGlzIG5vIHNldHRpbmcgYmVmb3JlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBiXG5cdFwiYlwiOiAyLFxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDFcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYlxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGNcblx0XCJjXCI6IDEsXG59YDtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gYFxue1xuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGJcblx0XCJiXCI6IDIsXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgY1xuXHRcImNcIjogMSxcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYicsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IGFmdGVyIGEgc2V0dGluZyB0aGF0IGlzIG9mIG9iamVjdCB0eXBlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3Qgc291cmNlQ29udGVudCA9IGBcbntcblx0XCJiXCI6IHtcblx0XHRcImRcIjogMVxuXHR9LFxuXHRcImFcIjogMixcblx0XCJjXCI6IDFcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYlwiOiB7XG5cdFx0XCJkXCI6IDFcblx0fSxcblx0XCJjXCI6IDFcbn1gO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gYWRkU2V0dGluZygnYScsIHNvdXJjZUNvbnRlbnQsIHRhcmdldENvbnRlbnQsIGZvcm1hdHRpbmdPcHRpb25zKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIHNvdXJjZUNvbnRlbnQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBzZXR0aW5nIHRoYXQgaXMgb2YgYXJyYXkgdHlwZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYlwiOiBbXG5cdFx0MVxuXHRdLFxuXHRcImFcIjogMixcblx0XCJjXCI6IDFcbn1gO1xuXHRcdGNvbnN0IHRhcmdldENvbnRlbnQgPSBgXG57XG5cdFwiYlwiOiBbXG5cdFx0MVxuXHRdLFxuXHRcImNcIjogMVxufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdhJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgc291cmNlQ29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIGNvbW1lbnQgd2l0aCBjb21tYSBzZXBhcmF0b3Igb2YgcHJldmlvdXMgc2V0dGluZyBhbmQgbm8gbmV4dCBub2RlcyAnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGFcblx0LFxuXHRcImJcIjogMlxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyXG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0luc2VydCBhZnRlciBhIGNvbW1lbnQgd2l0aCBjb21tYSBzZXBhcmF0b3Igb2YgcHJldmlvdXMgc2V0dGluZyBhbmQgdGhlcmUgaXMgYSBzZXR0aW5nIGFmdGVyICcsICgpID0+IHtcblxuXHRcdGNvbnN0IHNvdXJjZUNvbnRlbnQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0XCJjXCI6IDNcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyLFxuXHRcImNcIjogM1xufWA7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBhZGRTZXR0aW5nKCdiJywgc291cmNlQ29udGVudCwgdGFyZ2V0Q29udGVudCwgZm9ybWF0dGluZ09wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgYWZ0ZXIgYSBjb21tZW50IHdpdGggY29tbWEgc2VwYXJhdG9yIG9mIHByZXZpb3VzIHNldHRpbmcgYW5kIHRoZXJlIGlzIGEgY29tbWVudCBhZnRlciAnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzb3VyY2VDb250ZW50ID0gYFxue1xuXHRcImFcIjogMVxuXHQvLyB0aGlzIGlzIGNvbW1lbnQgZm9yIGFcblx0LFxuXHRcImJcIjogMlxuXHQvLyB0aGlzIGlzIGEgY29tbWVudFxufWA7XG5cdFx0Y29uc3QgdGFyZ2V0Q29udGVudCA9IGBcbntcblx0XCJhXCI6IDFcblx0Ly8gdGhpcyBpcyBjb21tZW50IGZvciBhXG5cdCxcblx0Ly8gdGhpcyBpcyBhIGNvbW1lbnRcbn1gO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgXG57XG5cdFwiYVwiOiAxXG5cdC8vIHRoaXMgaXMgY29tbWVudCBmb3IgYVxuXHQsXG5cdFwiYlwiOiAyXG5cdC8vIHRoaXMgaXMgYSBjb21tZW50XG59YDtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IGFkZFNldHRpbmcoJ2InLCBzb3VyY2VDb250ZW50LCB0YXJnZXRDb250ZW50LCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xufSk7XG5cblxuZnVuY3Rpb24gc3RyaW5naWZ5KHZhbHVlOiBhbnkpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsICdcXHQnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVksT0FBTyw2QkFBNkI7QUFHekQsTUFBTSxvQkFBb0IsRUFBRSxLQUFLLE1BQU0sY0FBYyxPQUFPLFNBQVMsRUFBRTtBQUV2RSxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLDBDQUF3QztBQUV4QyxPQUFLLHVE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
