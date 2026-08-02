import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { merge } from "../../common/extensionsMerge.js";
suite("ExtensionsMerge", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("merge returns local extension if remote does not exist", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, null, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("merge returns local extension if remote does not exist with ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      localExtensions[1],
      localExtensions[2]
    ];
    const actual = merge(localExtensions, null, null, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with ignored extensions (ignore case)", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      localExtensions[1],
      localExtensions[2]
    ];
    const actual = merge(localExtensions, null, null, [], ["A"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with skipped extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const skippedExtension = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const expected = [...localExtensions];
    const actual = merge(localExtensions, null, null, skippedExtension, [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge returns local extension if remote does not exist with skipped and ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const skippedExtension = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const expected = [localExtensions[1], localExtensions[2]];
    const actual = merge(localExtensions, null, null, skippedExtension, ["a"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when there is no base", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when there is no base and with ignored extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when remote is moved forwarded", () => {
    const baseExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }, { id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with disabled extension", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" }, disabled: true })]);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote moved forwarded with ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["a"], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when remote is moved forwarded with skipped and ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["b"], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "d", uuid: "d" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.strictEqual(actual.remote, null);
  });
  test("merge local and remote extensions when local is moved forwarded", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with disabled extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with ignored settings", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["b"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ]);
  });
  test("merge local and remote extensions when local is moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when local is moved forwarded with skipped and ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["c"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } })]);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with ignored extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], ["a", "e"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with skipped extensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge local and remote extensions when both moved forwarded with skipped and ignoredextensions", () => {
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const skippedExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aRemoteSyncExtension({ identifier: { id: "e", uuid: "e" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "e", uuid: "e" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, skippedExtensions, ["e"], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when remote extension has no uuid and different extension id case", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aLocalSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      aLocalSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "A" } }),
      aRemoteSyncExtension({ identifier: { id: "d", uuid: "d" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "A", uuid: "a" } }),
      anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } }),
      anExpectedSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedSyncExtension({ identifier: { id: "c", uuid: "c" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "d", uuid: "d" } })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when remote extension is not an installed extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge when remote extension is not an installed extension but is an installed extension locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when an extension is not an installed extension remotely and does not exist locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false }),
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge when an extension is an installed extension remotely but not locally and updated locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const expected = [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge when an extension is an installed extension remotely but not locally and updated remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [
      anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, disabled: true })
    ]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge not installed extensions", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" }, installed: false })
    ];
    const expected = [
      anExpectedBuiltinSyncExtension({ identifier: { id: "b", uuid: "b" } }),
      anExpectedBuiltinSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, expected);
  });
  test("merge: remote extension with prerelease is added", () => {
    const localExtensions = [];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension with prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
  });
  test("merge: remote extension with prerelease is added when local extension without prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension without prerelease is added when local extension with prerelease is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to prerelease", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to release", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to prerelease", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })]);
  });
  test("merge: local extension is changed to release", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote preRelease property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, preRelease: true, disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote version is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote version is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote version property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has builtin extension, local does not have extension, remote has extension installed", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, local has installed extension, remote has extension builtin", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, local has builtin extension, remote does not has extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedBuiltinSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: base has builtin extension, local has installed extension, remote has builtin extension with updated state", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, state: { "a": 1 } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
  });
  test("merge: base has installed extension, last time synced as builtin extension, local has installed extension, remote has builtin extension with updated state", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, state: { "a": 1 } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, state: { "a": 1 } })]);
  });
  test("merge: base has builtin extension, local does not have extension, remote has builtin extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has installed extension, last synced as builtin, local does not have extension, remote has installed extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: base has builtin extension, last synced as builtin, local does not have extension, remote has installed extension", () => {
    const localExtensions = [];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0", installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], [{ id: "a", uuid: "a" }]);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "1.1.0" })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension with pinned is added", () => {
    const localExtensions = [];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension with pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
  });
  test("merge: remote extension with pinned is added when local extension without pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension without pinned is added when local extension with pinned is added", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to pinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to unpinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })]);
  });
  test("merge: local extension is changed to unpinned", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are no updates", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false, disabled: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })]);
  });
  test("merge: local extension not an installed extension - remote pinned property is taken precedence when there are updates remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, installed: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true, disabled: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })]);
  });
  test("merge: local extension is changed to unpinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("merge: remote extension is changed to pinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to pinned and version changed and remote extension is channged to pinned with different version", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2", pinned: true })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2", pinned: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: remote extension is changed to unpinned and version changed", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1", pinned: true })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, localExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge: local extension is changed to unpinned and version changed and remote extension is channged to unpinned with different version", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.1" })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, version: "0.0.2" })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, pinned: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("sync adding local application scoped extension", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const actual = merge(localExtensions, null, null, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("sync merging local extension with isApplicationScoped property and remote does not has isApplicationScoped property", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const baseExtensions = [
      aSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" } })]);
  });
  test("sync merging when applicaiton scope is changed locally", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const actual = merge(localExtensions, baseExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote?.all, localExtensions);
  });
  test("sync merging when applicaiton scope is changed remotely", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const baseExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: false })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })
    ];
    const actual = merge(localExtensions, remoteExtensions, baseExtensions, [], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, [anExpectedSyncExtension({ identifier: { id: "a", uuid: "a" }, isApplicationScoped: true })]);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge does not remove remote extension when skipped extension has uuid but remote does not has", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [aRemoteSyncExtension({ identifier: { id: "b", uuid: "b" } })], [], []);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  test("merge does not remove remote extension when last sync builtin extension has uuid but remote does not has", () => {
    const localExtensions = [
      aLocalSyncExtension({ identifier: { id: "a", uuid: "a" } })
    ];
    const remoteExtensions = [
      aRemoteSyncExtension({ identifier: { id: "a", uuid: "a" } }),
      aRemoteSyncExtension({ identifier: { id: "b" } })
    ];
    const actual = merge(localExtensions, remoteExtensions, remoteExtensions, [], [], [{ id: "b", uuid: "b" }]);
    assert.deepStrictEqual(actual.local.added, []);
    assert.deepStrictEqual(actual.local.removed, []);
    assert.deepStrictEqual(actual.local.updated, []);
    assert.deepStrictEqual(actual.remote, null);
  });
  function anExpectedSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function anExpectedBuiltinSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      ...extension
    };
  }
  function aLocalSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function aRemoteSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      pinned: false,
      preRelease: false,
      installed: true,
      ...extension
    };
  }
  function aSyncExtension(extension) {
    return {
      identifier: { id: "a", uuid: "a" },
      version: "1.0.0",
      installed: true,
      ...extension
    };
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi9leHRlbnNpb25zTWVyZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgbWVyZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0ZW5zaW9uc01lcmdlLmpzJztcbmltcG9ydCB7IElMb2NhbFN5bmNFeHRlbnNpb24sIElTeW5jRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5cbnN1aXRlKCdFeHRlbnNpb25zTWVyZ2UnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWVyZ2UgcmV0dXJucyBsb2NhbCBleHRlbnNpb24gaWYgcmVtb3RlIGRvZXMgbm90IGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCBudWxsLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgbG9jYWxFeHRlbnNpb25zKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgcmV0dXJucyBsb2NhbCBleHRlbnNpb24gaWYgcmVtb3RlIGRvZXMgbm90IGV4aXN0IHdpdGggaWdub3JlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0bG9jYWxFeHRlbnNpb25zWzFdLFxuXHRcdFx0bG9jYWxFeHRlbnNpb25zWzJdLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIG51bGwsIG51bGwsIFtdLCBbJ2EnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHJldHVybnMgbG9jYWwgZXh0ZW5zaW9uIGlmIHJlbW90ZSBkb2VzIG5vdCBleGlzdCB3aXRoIGlnbm9yZWQgZXh0ZW5zaW9ucyAoaWdub3JlIGNhc2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0bG9jYWxFeHRlbnNpb25zWzFdLFxuXHRcdFx0bG9jYWxFeHRlbnNpb25zWzJdLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIG51bGwsIG51bGwsIFtdLCBbJ0EnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHJldHVybnMgbG9jYWwgZXh0ZW5zaW9uIGlmIHJlbW90ZSBkb2VzIG5vdCBleGlzdCB3aXRoIHNraXBwZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9uID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbLi4ubG9jYWxFeHRlbnNpb25zXTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbnVsbCwgbnVsbCwgc2tpcHBlZEV4dGVuc2lvbiwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSByZXR1cm5zIGxvY2FsIGV4dGVuc2lvbiBpZiByZW1vdGUgZG9lcyBub3QgZXhpc3Qgd2l0aCBza2lwcGVkIGFuZCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbiA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2xvY2FsRXh0ZW5zaW9uc1sxXSwgbG9jYWxFeHRlbnNpb25zWzJdXTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgbnVsbCwgbnVsbCwgc2tpcHBlZEV4dGVuc2lvbiwgWydhJ10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiB0aGVyZSBpcyBubyBiYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gdGhlcmUgaXMgbm8gYmFzZSBhbmQgd2l0aCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgWydhJ10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiByZW1vdGUgaXMgbW92ZWQgZm9yd2FyZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgeyBpZDogJ2QnLCB1dWlkOiAnZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIHJlbW90ZSBpcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBkaXNhYmxlZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0sIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiByZW1vdGUgbW92ZWQgZm9yd2FyZGVkIHdpdGggaWdub3JlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbJ2EnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2QnLCB1dWlkOiAnZCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIHJlbW90ZSBpcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBza2lwcGVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHNraXBwZWRFeHRlbnNpb25zID0gW1xuXHRcdFx0YVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgc2tpcHBlZEV4dGVuc2lvbnMsIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFt7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gcmVtb3RlIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIHNraXBwZWQgYW5kIGlnbm9yZWQgZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBza2lwcGVkRXh0ZW5zaW9ucywgWydiJ10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW3sgaWQ6ICdkJywgdXVpZDogJ2QnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBsb2NhbCBpcyBtb3ZlZCBmb3J3YXJkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBsb2NhbCBpcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBkaXNhYmxlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGxvY2FsIGlzIG1vdmVkIGZvcndhcmRlZCB3aXRoIGlnbm9yZWQgc2V0dGluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFsnYiddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gbG9jYWwgaXMgbW92ZWQgZm9yd2FyZGVkIHdpdGggc2tpcHBlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3Qgc2tpcHBlZEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBza2lwcGVkRXh0ZW5zaW9ucywgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBsb2NhbCBhbmQgcmVtb3RlIGV4dGVuc2lvbnMgd2hlbiBsb2NhbCBpcyBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBza2lwcGVkIGFuZCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBbJ2MnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGJvdGggbW92ZWQgZm9yd2FyZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2UnLCB1dWlkOiAnZScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pLFxuXHRcdFx0YW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYycsIHV1aWQ6ICdjJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW3sgaWQ6ICdhJywgdXVpZDogJ2EnIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gYm90aCBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBpZ25vcmVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbJ2EnLCAnZSddLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgbG9jYWwgYW5kIHJlbW90ZSBleHRlbnNpb25zIHdoZW4gYm90aCBtb3ZlZCBmb3J3YXJkZWQgd2l0aCBza2lwcGVkIGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIGxvY2FsIGFuZCByZW1vdGUgZXh0ZW5zaW9ucyB3aGVuIGJvdGggbW92ZWQgZm9yd2FyZGVkIHdpdGggc2tpcHBlZCBhbmQgaWdub3JlZGV4dGVuc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBza2lwcGVkRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicsIHV1aWQ6ICdiJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZScsIHV1aWQ6ICdlJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdlJywgdXVpZDogJ2UnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIHNraXBwZWRFeHRlbnNpb25zLCBbJ2UnXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gcmVtb3RlIGV4dGVuc2lvbiBoYXMgbm8gdXVpZCBhbmQgZGlmZmVyZW50IGV4dGVuc2lvbiBpZCBjYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2MnLCB1dWlkOiAnYycgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdBJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnZCcsIHV1aWQ6ICdkJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdBJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdkJywgdXVpZDogJ2QnIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0gfSksXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdjJywgdXVpZDogJ2MnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2QnLCB1dWlkOiAnZCcgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiByZW1vdGUgZXh0ZW5zaW9uIGlzIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIHJlbW90ZSBleHRlbnNpb24gaXMgbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24gYnV0IGlzIGFuIGluc3RhbGxlZCBleHRlbnNpb24gbG9jYWxseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSB3aGVuIGFuIGV4dGVuc2lvbiBpcyBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiByZW1vdGVseSBhbmQgZG9lcyBub3QgZXhpc3QgbG9jYWxseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdiJywgdXVpZDogJ2InIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugd2hlbiBhbiBleHRlbnNpb24gaXMgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiByZW1vdGVseSBidXQgbm90IGxvY2FsbHkgYW5kIHVwZGF0ZWQgbG9jYWxseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRhbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlIHdoZW4gYW4gZXh0ZW5zaW9uIGlzIGFuIGluc3RhbGxlZCBleHRlbnNpb24gcmVtb3RlbHkgYnV0IG5vdCBsb2NhbGx5IGFuZCB1cGRhdGVkIHJlbW90ZWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtcblx0XHRcdGFuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2Ugbm90IGluc3RhbGxlZCBleHRlbnNpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkOiBJU3luY0V4dGVuc2lvbltdID0gW1xuXHRcdFx0YW5FeHBlY3RlZEJ1aWx0aW5TeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KSxcblx0XHRcdGFuRXhwZWN0ZWRCdWlsdGluU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gd2l0aCBwcmVyZWxlYXNlIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIHdpdGggcHJlcmVsZWFzZSBpcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiB3aXRoIHByZXJlbGVhc2UgaXMgYWRkZWQgd2hlbiBsb2NhbCBleHRlbnNpb24gd2l0aG91dCBwcmVyZWxlYXNlIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiB3aXRob3V0IHByZXJlbGVhc2UgaXMgYWRkZWQgd2hlbiBsb2NhbCBleHRlbnNpb24gd2l0aCBwcmVyZWxlYXNlIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHByZXJlbGVhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGxvY2FsRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbmdlZCB0byByZWxlYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBsb2NhbEV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwcmVyZWxlYXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwcmVSZWxlYXNlOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gcmVsZWFzZScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSBwcmVSZWxlYXNlIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgbm8gdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSBwcmVSZWxlYXNlIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgdXBkYXRlcyBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlLCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUsIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24gLSByZW1vdGUgcHJlUmVsZWFzZSBwcm9wZXJ0eSBpcyB0YWtlbiBwcmVjZWRlbmNlIHdoZW4gdGhlcmUgYXJlIHVwZGF0ZXMgcmVtb3RlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcHJlUmVsZWFzZTogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUsIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHByZVJlbGVhc2U6IHRydWUsIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSB2ZXJzaW9uIGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgbm8gdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSB2ZXJzaW9uIGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgdXBkYXRlcyBsb2NhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlLCBkaXNhYmxlZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcsIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24gLSByZW1vdGUgdmVyc2lvbiBwcm9wZXJ0eSBpcyB0YWtlbiBwcmVjZWRlbmNlIHdoZW4gdGhlcmUgYXJlIHVwZGF0ZXMgcmVtb3RlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcsIGRpc2FibGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcsIGRpc2FibGVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGJhc2UgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uLCBsb2NhbCBkb2VzIG5vdCBoYXZlIGV4dGVuc2lvbiwgcmVtb3RlIGhhcyBleHRlbnNpb24gaW5zdGFsbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcsIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgbG9jYWwgaGFzIGluc3RhbGxlZCBleHRlbnNpb24sIHJlbW90ZSBoYXMgZXh0ZW5zaW9uIGJ1aWx0aW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgbG9jYWwgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uLCByZW1vdGUgZG9lcyBub3QgaGFzIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uczogSUxvY2FsU3luY0V4dGVuc2lvbltdID0gW107XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRCdWlsdGluU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGJhc2UgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uLCBsb2NhbCBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgcmVtb3RlIGhhcyBidWlsdGluIGV4dGVuc2lvbiB3aXRoIHVwZGF0ZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGluc3RhbGxlZDogZmFsc2UsIHN0YXRlOiB7ICdhJzogMSB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFt7IGlkOiAnYScsIHV1aWQ6ICdhJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBzdGF0ZTogeyAnYSc6IDEgfSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBzdGF0ZTogeyAnYSc6IDEgfSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgaW5zdGFsbGVkIGV4dGVuc2lvbiwgbGFzdCB0aW1lIHN5bmNlZCBhcyBidWlsdGluIGV4dGVuc2lvbiwgbG9jYWwgaGFzIGluc3RhbGxlZCBleHRlbnNpb24sIHJlbW90ZSBoYXMgYnVpbHRpbiBleHRlbnNpb24gd2l0aCB1cGRhdGVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlLCBzdGF0ZTogeyAnYSc6IDEgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbeyBpZDogJ2EnLCB1dWlkOiAnYScgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgc3RhdGU6IHsgJ2EnOiAxIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgc3RhdGU6IHsgJ2EnOiAxIH0gfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGJhc2UgaGFzIGJ1aWx0aW4gZXh0ZW5zaW9uLCBsb2NhbCBkb2VzIG5vdCBoYXZlIGV4dGVuc2lvbiwgcmVtb3RlIGhhcyBidWlsdGluIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnLCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGJhc2UgaGFzIGluc3RhbGxlZCBleHRlbnNpb24sIGxhc3Qgc3luY2VkIGFzIGJ1aWx0aW4sIGxvY2FsIGRvZXMgbm90IGhhdmUgZXh0ZW5zaW9uLCByZW1vdGUgaGFzIGluc3RhbGxlZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW3sgaWQ6ICdhJywgdXVpZDogJ2EnIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogYmFzZSBoYXMgYnVpbHRpbiBleHRlbnNpb24sIGxhc3Qgc3luY2VkIGFzIGJ1aWx0aW4sIGxvY2FsIGRvZXMgbm90IGhhdmUgZXh0ZW5zaW9uLCByZW1vdGUgaGFzIGluc3RhbGxlZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zOiBJTG9jYWxTeW5jRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzEuMS4wJywgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcxLjEuMCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW3sgaWQ6ICdhJywgdXVpZDogJ2EnIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMS4xLjAnIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogcmVtb3RlIGV4dGVuc2lvbiB3aXRoIHBpbm5lZCBpcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gd2l0aCBwaW5uZWQgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnM6IElMb2NhbFN5bmNFeHRlbnNpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBudWxsLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIHdpdGggcGlubmVkIGlzIGFkZGVkIHdoZW4gbG9jYWwgZXh0ZW5zaW9uIHdpdGhvdXQgcGlubmVkIGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gd2l0aG91dCBwaW5uZWQgaXMgYWRkZWQgd2hlbiBsb2NhbCBleHRlbnNpb24gd2l0aCBwaW5uZWQgaXMgYWRkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbnVsbCwgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gdW5waW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gcGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHVucGlubmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gbm90IGFuIGluc3RhbGxlZCBleHRlbnNpb24gLSByZW1vdGUgcGlubmVkIHByb3BlcnR5IGlzIHRha2VuIHByZWNlZGVuY2Ugd2hlbiB0aGVyZSBhcmUgbm8gdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZTogbG9jYWwgZXh0ZW5zaW9uIG5vdCBhbiBpbnN0YWxsZWQgZXh0ZW5zaW9uIC0gcmVtb3RlIHBpbm5lZCBwcm9wZXJ0eSBpcyB0YWtlbiBwcmVjZWRlbmNlIHdoZW4gdGhlcmUgYXJlIHVwZGF0ZXMgbG9jYWxseScsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgaW5zdGFsbGVkOiBmYWxzZSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlPy5hbGwsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSwgZGlzYWJsZWQ6IHRydWUgfSldKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBub3QgYW4gaW5zdGFsbGVkIGV4dGVuc2lvbiAtIHJlbW90ZSBwaW5uZWQgcHJvcGVydHkgaXMgdGFrZW4gcHJlY2VkZW5jZSB3aGVuIHRoZXJlIGFyZSB1cGRhdGVzIHJlbW90ZWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpbnN0YWxsZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHBpbm5lZDogdHJ1ZSwgZGlzYWJsZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlLCBkaXNhYmxlZDogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwaW5uZWQgYW5kIHZlcnNpb24gY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJywgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJywgcGlubmVkOiB0cnVlIH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byB1bnBpbm5lZCBhbmQgdmVyc2lvbiBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJywgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiByZW1vdGUgZXh0ZW5zaW9uIGlzIGNoYW5nZWQgdG8gcGlubmVkIGFuZCB2ZXJzaW9uIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgbG9jYWxFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcwLjAuMScsIHBpbm5lZDogdHJ1ZSB9KV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlOiBsb2NhbCBleHRlbnNpb24gaXMgY2hhbmdlZCB0byBwaW5uZWQgYW5kIHZlcnNpb24gY2hhbmdlZCBhbmQgcmVtb3RlIGV4dGVuc2lvbiBpcyBjaGFubmdlZCB0byBwaW5uZWQgd2l0aCBkaWZmZXJlbnQgdmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJywgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4yJywgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4yJywgcGlubmVkOiB0cnVlIH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbmdlZCB0byB1bnBpbm5lZCBhbmQgdmVyc2lvbiBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCB2ZXJzaW9uOiAnMC4wLjEnLCBwaW5uZWQ6IHRydWUgfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGxvY2FsRXh0ZW5zaW9ucywgW10sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2U6IGxvY2FsIGV4dGVuc2lvbiBpcyBjaGFuZ2VkIHRvIHVucGlubmVkIGFuZCB2ZXJzaW9uIGNoYW5nZWQgYW5kIHJlbW90ZSBleHRlbnNpb24gaXMgY2hhbm5nZWQgdG8gdW5waW5uZWQgd2l0aCBkaWZmZXJlbnQgdmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBsb2NhbEV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhTG9jYWxTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgdmVyc2lvbjogJzAuMC4xJyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIHZlcnNpb246ICcwLjAuMicgfSksXG5cdFx0XTtcblx0XHRjb25zdCBiYXNlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSwgcGlubmVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIGFkZGluZyBsb2NhbCBhcHBsaWNhdGlvbiBzY29wZWQgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIG51bGwsIG51bGwsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBsb2NhbEV4dGVuc2lvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIG1lcmdpbmcgbG9jYWwgZXh0ZW5zaW9uIHdpdGggaXNBcHBsaWNhdGlvblNjb3BlZCBwcm9wZXJ0eSBhbmQgcmVtb3RlIGRvZXMgbm90IGhhcyBpc0FwcGxpY2F0aW9uU2NvcGVkIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpc0FwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGU/LmFsbCwgW2FuRXhwZWN0ZWRTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIG1lcmdpbmcgd2hlbiBhcHBsaWNhaXRvbiBzY29wZSBpcyBjaGFuZ2VkIGxvY2FsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGJhc2VFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpc0FwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCBiYXNlRXh0ZW5zaW9ucywgYmFzZUV4dGVuc2lvbnMsIFtdLCBbXSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwuYWRkZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5yZW1vdmVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwudXBkYXRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnJlbW90ZT8uYWxsLCBsb2NhbEV4dGVuc2lvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jIG1lcmdpbmcgd2hlbiBhcHBsaWNhaXRvbiBzY29wZSBpcyBjaGFuZ2VkIHJlbW90ZWx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpc0FwcGxpY2F0aW9uU2NvcGVkOiBmYWxzZSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYmFzZUV4dGVuc2lvbnMgPSBbXG5cdFx0XHRhUmVtb3RlU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IGZhbHNlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LCBpc0FwcGxpY2F0aW9uU2NvcGVkOiB0cnVlIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtZXJnZShsb2NhbEV4dGVuc2lvbnMsIHJlbW90ZUV4dGVuc2lvbnMsIGJhc2VFeHRlbnNpb25zLCBbXSwgW10sIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLmFkZGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwubG9jYWwucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnVwZGF0ZWQsIFthbkV4cGVjdGVkU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sIGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUgfSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5yZW1vdGUsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZSBkb2VzIG5vdCByZW1vdmUgcmVtb3RlIGV4dGVuc2lvbiB3aGVuIHNraXBwZWQgZXh0ZW5zaW9uIGhhcyB1dWlkIGJ1dCByZW1vdGUgZG9lcyBub3QgaGFzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFMb2NhbFN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9ucyA9IFtcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSB9KSxcblx0XHRcdGFSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InIH0gfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1lcmdlKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucywgW2FSZW1vdGVTeW5jRXh0ZW5zaW9uKHsgaWRlbnRpZmllcjogeyBpZDogJ2InLCB1dWlkOiAnYicgfSB9KV0sIFtdLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWVyZ2UgZG9lcyBub3QgcmVtb3ZlIHJlbW90ZSBleHRlbnNpb24gd2hlbiBsYXN0IHN5bmMgYnVpbHRpbiBleHRlbnNpb24gaGFzIHV1aWQgYnV0IHJlbW90ZSBkb2VzIG5vdCBoYXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gW1xuXHRcdFx0YUxvY2FsU3luY0V4dGVuc2lvbih7IGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0gfSksXG5cdFx0XTtcblx0XHRjb25zdCByZW1vdGVFeHRlbnNpb25zID0gW1xuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9IH0pLFxuXHRcdFx0YVJlbW90ZVN5bmNFeHRlbnNpb24oeyBpZGVudGlmaWVyOiB7IGlkOiAnYicgfSB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbWVyZ2UobG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zLCBbXSwgW10sIFt7IGlkOiAnYicsIHV1aWQ6ICdiJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC5hZGRlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxvY2FsLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sb2NhbC51cGRhdGVkLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwucmVtb3RlLCBudWxsKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYW5FeHBlY3RlZFN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uOiBQYXJ0aWFsPElTeW5jRXh0ZW5zaW9uPik6IElTeW5jRXh0ZW5zaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWRlbnRpZmllcjogeyBpZDogJ2EnLCB1dWlkOiAnYScgfSxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRwaW5uZWQ6IGZhbHNlLFxuXHRcdFx0cHJlUmVsZWFzZTogZmFsc2UsXG5cdFx0XHRpbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHQuLi5leHRlbnNpb25cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYW5FeHBlY3RlZEJ1aWx0aW5TeW5jRXh0ZW5zaW9uKGV4dGVuc2lvbjogUGFydGlhbDxJU3luY0V4dGVuc2lvbj4pOiBJU3luY0V4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0cGlubmVkOiBmYWxzZSxcblx0XHRcdHByZVJlbGVhc2U6IGZhbHNlLFxuXHRcdFx0Li4uZXh0ZW5zaW9uXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFMb2NhbFN5bmNFeHRlbnNpb24oZXh0ZW5zaW9uOiBQYXJ0aWFsPElMb2NhbFN5bmNFeHRlbnNpb24+KTogSUxvY2FsU3luY0V4dGVuc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkZW50aWZpZXI6IHsgaWQ6ICdhJywgdXVpZDogJ2EnIH0sXG5cdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0cGlubmVkOiBmYWxzZSxcblx0XHRcdHByZVJlbGVhc2U6IGZhbHNlLFxuXHRcdFx0aW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0Li4uZXh0ZW5zaW9uXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFSZW1vdGVTeW5jRXh0ZW5zaW9uKGV4dGVuc2lvbjogUGFydGlhbDxJTG9jYWxTeW5jRXh0ZW5zaW9uPik6IElMb2NhbFN5bmNFeHRlbnNpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdHBpbm5lZDogZmFsc2UsXG5cdFx0XHRwcmVSZWxlYXNlOiBmYWxzZSxcblx0XHRcdGluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdC4uLmV4dGVuc2lvblxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhU3luY0V4dGVuc2lvbihleHRlbnNpb246IFBhcnRpYWw8SVN5bmNFeHRlbnNpb24+KTogSVN5bmNFeHRlbnNpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGlmaWVyOiB7IGlkOiAnYScsIHV1aWQ6ICdhJyB9LFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdGluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdC4uLmV4dGVuc2lvblxuXHRcdH07XG5cdH1cblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBR3RCLE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsMENBQXdDO0FBRXhDLE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxrQkFBa0I7QUFBQSxNQUN2QixvQkFBb0IsRUFBRSxZQUFZLEVBQUUsSUFBSSxLQUFLLE1BQU0sSUFBSSxFQUFFLENBQUM7QUFBQSxNQUMxRCxvQkFBb0IsRUFBRSxZQUFZLEVBQUUsSUFBSSxLQUFLLE1BQU0sSUFBSSxFQUFFLENBQUM7QUFBQSxNQUMxRCxvQkFBb0IsRUFBRSxZQUFZLEVBQUUsSUFBSSxLQUFLLE1BQU0sSUFBSSxFQUFFLENBQUM7QUFBQSxJQUMzRDtBQUVBLFVBQU0sU0FBUyxNQUFNLGlCQUFpQixNQUFNLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFFNUQsV0FBTyxnQkFBZ0IsT0FBTyxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE9BQU8sTUFBTSxTQUFTLENBQUMsQ0FBQztBQUMvQyxXQUFPLGdCQUFnQixPQUFPLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDL0MsV0FBTyxnQkFBZ0IsT0FBTyxRQUFRLEtBQUssZUFBZTtBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLGtGQUFrRixNQUFNO0FBQzVGLFVBQU0sa0JBQWtCO0FBQUEsTUFDdkIsb0JB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
